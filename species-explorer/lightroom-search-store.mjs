import fs from "node:fs/promises";
import path from "node:path";

import { germanTaxonomyDisplayName } from "./taxonomy-display-names.mjs";
import { readActiveTaxonomyCorrectionRelease } from "./taxonomy-correction-release.mjs";
import {
  inspectLightroomSearchDatabase,
} from "./lightroom-search-schema.mjs";
import {
  lightroomSearchDatabasePath,
  lightroomSearchManifestPath,
} from "./lightroom-search-storage.mjs";
import {
  foldTaxonomySearchTerm,
  germanTaxonomySearchKey,
  normalizeTaxonomySearchTerm,
} from "./taxonomy-search-text.mjs";
import { loadNodeSqlite } from "./taxonomy-storage.mjs";

const RESULT_LIMIT = 50;

function cleanText(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function providerLabel(provider) {
  return ({
    "catalogue-of-life": "Catalogue of Life",
    inaturalist: "iNaturalist",
    gbif: "GBIF",
    worms: "WoRMS",
    wikidata: "Wikidata",
    animalia: "Animalia",
    manual: "Eigene Korrektur",
    project: "Arten-Explorer",
  })[provider] || provider;
}

function matchType(row) {
  if (row.term_kind === "vernacular") {
    if (row.language === "de") return "deutscher Name";
    if (row.language === "en") return "englischer Name";
    return "Trivialname";
  }
  if (row.term_kind === "synonym") return "wissenschaftliches Synonym";
  if (row.term_kind === "identifier") return "Anbieterkennung";
  if (row.term_kind === "project") return "Arten-Explorer-Name";
  return "wissenschaftlicher Name";
}

function scoreCandidate(queryVariants, row) {
  const values = [row.normalized_term, row.folded_term, row.german_key];
  if (values.some((value) => queryVariants.includes(value))) return Number(row.weight);
  if (values.some((value) => queryVariants.some((query) => value.startsWith(query)))) {
    return Number(row.weight) + 10;
  }
  return Number(row.weight) + 30;
}

function ftsPrefixQuery(value) {
  const tokens = foldTaxonomySearchTerm(value)
    .split(/\s+/u)
    .map((token) => token.replaceAll('"', '""'))
    .filter(Boolean);
  return tokens.map((token) => `"${token}"*`).join(" ");
}

export class LightroomSearchStore {
  constructor({
    database,
    manifest,
    searchRoot,
    slot = "active",
    correctionRelease = null,
  } = {}) {
    this.database = database;
    this.manifest = manifest;
    this.searchRoot = path.resolve(searchRoot);
    this.slot = slot;
    this.correctionRelease = correctionRelease;
    this.correctionsByTaxonId = new Map(
      (correctionRelease?.entries || []).map((entry) => [entry.masterTaxonId, entry]),
    );
    this.closed = false;
    this.prefixStatements = Object.fromEntries([
      ["normalized", "normalized_term"],
      ["folded", "folded_term"],
      ["german", "german_key"],
    ].map(([key, column]) => [key, database.prepare(`
      SELECT term.*, taxon.accepted_scientific_name, taxon.rank, taxon.kingdom,
        taxon.german_name, taxon.english_name, taxon.reference_state,
        taxon.lifecycle_state,
        EXISTS(
          SELECT 1 FROM project_link project
          WHERE project.master_taxon_id = taxon.master_taxon_id
            AND project.link_state = 'linked'
        ) AS project_linked
      FROM search_term term
      JOIN taxon ON taxon.master_taxon_id = term.master_taxon_id
      WHERE term.${column} >= ? AND term.${column} < ?
      ORDER BY term.${column}, term.weight, taxon.accepted_scientific_name
      LIMIT ?
    `)]));
    this.ftsStatement = database.prepare(`
      SELECT term.*, taxon.accepted_scientific_name, taxon.rank, taxon.kingdom,
        taxon.german_name, taxon.english_name, taxon.reference_state,
        taxon.lifecycle_state,
        EXISTS(
          SELECT 1 FROM project_link project
          WHERE project.master_taxon_id = taxon.master_taxon_id
            AND project.link_state = 'linked'
        ) AS project_linked
      FROM search_fts
      JOIN search_term term ON term.search_term_id = search_fts.rowid
      JOIN taxon ON taxon.master_taxon_id = term.master_taxon_id
      WHERE search_fts MATCH ?
      ORDER BY bm25(search_fts), term.weight, taxon.accepted_scientific_name
      LIMIT ?
    `);
    this.taxonRow = database.prepare("SELECT * FROM taxon WHERE master_taxon_id = ?");
    this.hierarchyRows = database.prepare(`
      SELECT * FROM hierarchy WHERE master_taxon_id = ? ORDER BY position, rank
    `);
    this.statusRows = database.prepare(`
      SELECT * FROM taxon_status WHERE master_taxon_id = ? ORDER BY status_name
    `);
    this.providerRows = database.prepare(`
      SELECT * FROM taxon_provider WHERE master_taxon_id = ? ORDER BY provider, provider_record_id
    `);
    this.projectRows = database.prepare(`
      SELECT * FROM project_link WHERE master_taxon_id = ? ORDER BY project_taxon_key
    `);
    this.nameRows = database.prepare(`
      SELECT term, term_kind, language, source_provider, weight
      FROM search_term WHERE master_taxon_id = ?
      ORDER BY weight, language, term
    `);
  }

  assertOpen() {
    if (this.closed) throw new Error("Lightroom-Suchpaket ist bereits geschlossen.");
  }

  close() {
    if (this.closed) return;
    this.database.close();
    this.closed = true;
  }

  status() {
    this.assertOpen();
    return {
      available: true,
      slot: this.slot,
      packageId: this.manifest.packageId,
      generatedAt: this.manifest.generatedAt,
      masterVersion: this.manifest.masterVersion,
      taxonCount: this.manifest.taxonCount,
      nameCount: this.manifest.nameCount,
      hierarchyCount: this.manifest.hierarchyCount,
      correctionRevision: this.correctionRelease?.revision || "",
      correctionReleaseId: this.correctionRelease?.releaseId || "",
    };
  }

  correctedRow(row) {
    const correction = this.correctionsByTaxonId.get(row.master_taxon_id);
    if (!correction) return row;
    return {
      ...row,
      german_name: correction.germanName || row.german_name,
      english_name: correction.englishName || row.english_name,
    };
  }

  correctionSearchRows(queryValues, kingdom) {
    const variants = unique(Object.values(queryValues));
    const rows = [];
    for (const correction of this.correctionsByTaxonId.values()) {
      const base = this.taxonRow.get(correction.masterTaxonId);
      if (!base || (kingdom !== "all" && base.kingdom !== kingdom)) continue;
      for (const [term, language] of [
        [correction.germanName, "de"],
        [correction.englishName, "en"],
      ]) {
        if (!term) continue;
        const row = {
          ...this.correctedRow(base),
          term,
          normalized_term: normalizeTaxonomySearchTerm(term),
          folded_term: foldTaxonomySearchTerm(term),
          german_key: germanTaxonomySearchKey(term),
          term_kind: "vernacular",
          language,
          source_provider: "manual",
          weight: 0,
          project_linked: 0,
        };
        if (!Number.isFinite(scoreCandidate(variants, row))) continue;
        const matches = [row.normalized_term, row.folded_term, row.german_key]
          .some((termValue) => variants.some((queryValue) => (
            termValue === queryValue
            || termValue.startsWith(queryValue)
            || termValue.includes(queryValue)
          )));
        if (matches) rows.push(row);
      }
    }
    return rows;
  }

  search(query, { limit = 12, kingdom = "all" } = {}) {
    this.assertOpen();
    const value = cleanText(query);
    if (value.length < 2) return [];
    const safeLimit = Math.max(1, Math.min(RESULT_LIMIT, Number(limit) || 12));
    const queryValues = {
      normalized: normalizeTaxonomySearchTerm(value),
      folded: foldTaxonomySearchTerm(value),
      german: germanTaxonomySearchKey(value),
    };
    const variants = unique(Object.values(queryValues));
    const fetchLimit = Math.max(48, safeLimit * 12);
    const rows = [];
    for (const [key, queryValue] of Object.entries(queryValues)) {
      if (!queryValue) continue;
      rows.push(...this.prefixStatements[key].all(
        queryValue,
        `${queryValue}\uffff`,
        fetchLimit,
      ));
    }
    const ftsQuery = ftsPrefixQuery(value);
    if (ftsQuery) rows.push(...this.ftsStatement.all(ftsQuery, fetchLimit));
    const correctionRows = this.correctionSearchRows(queryValues, kingdom);
    const best = new Map();
    for (const row of rows) {
      if (kingdom !== "all" && row.kingdom !== kingdom) continue;
      const score = scoreCandidate(variants, row) - (row.project_linked ? 2 : 0);
      const current = best.get(row.master_taxon_id);
      if (!current || score < current.score) {
        best.set(row.master_taxon_id, { row: this.correctedRow(row), score });
      }
    }
    const baseResults = [...best.values()]
      .sort((left, right) => (
        left.score - right.score
        || left.row.accepted_scientific_name.localeCompare(
          right.row.accepted_scientific_name,
          "en",
          { sensitivity: "base" },
        )
      ))
      .slice(0, safeLimit)
      .map(({ row }) => ({
        masterTaxonId: row.master_taxon_id,
        germanName: row.german_name || null,
        englishName: row.english_name || null,
        acceptedScientificName: row.accepted_scientific_name,
        rank: row.rank,
        kingdom: row.kingdom || null,
        referenceState: row.reference_state,
        projectLinked: Boolean(row.project_linked),
        match: row.term,
        matchType: matchType(row),
        source: providerLabel(row.source_provider),
      }));
    const correctionResults = correctionRows
      .sort((left, right) => (
        scoreCandidate(variants, left) - scoreCandidate(variants, right)
        || left.accepted_scientific_name.localeCompare(right.accepted_scientific_name, "en")
      ))
      .map((row) => ({
        masterTaxonId: row.master_taxon_id,
        germanName: row.german_name || null,
        englishName: row.english_name || null,
        acceptedScientificName: row.accepted_scientific_name,
        rank: row.rank,
        kingdom: row.kingdom || null,
        referenceState: row.reference_state,
        projectLinked: Boolean(row.project_linked),
        match: row.term,
        matchType: matchType(row),
        source: providerLabel(row.source_provider),
      }));
    const seen = new Set();
    return [...correctionResults, ...baseResults].filter((entry) => {
      if (seen.has(entry.masterTaxonId)) return false;
      seen.add(entry.masterTaxonId);
      return true;
    }).slice(0, safeLimit);
  }

  taxon(masterTaxonId) {
    this.assertOpen();
    const baseRow = this.taxonRow.get(cleanText(masterTaxonId));
    const row = baseRow ? this.correctedRow(baseRow) : null;
    if (!row) return null;
    const hierarchy = this.hierarchyRows.all(row.master_taxon_id).map((entry) => ({
      rank: entry.rank,
      scientificName: entry.scientific_name,
      germanName: germanTaxonomyDisplayName(entry.rank, entry.scientific_name) || null,
      source: providerLabel(entry.source_provider),
    }));
    const correction = this.correctionsByTaxonId.get(row.master_taxon_id);
    const names = [
      correction?.germanName && {
        term: correction.germanName,
        term_kind: "vernacular",
        language: "de",
        source_provider: "manual",
      },
      correction?.englishName && {
        term: correction.englishName,
        term_kind: "vernacular",
        language: "en",
        source_provider: "manual",
      },
      ...this.nameRows.all(row.master_taxon_id),
    ].filter(Boolean).map((entry) => ({
      name: entry.term,
      kind: entry.term_kind,
      language: entry.language || null,
      source: providerLabel(entry.source_provider),
    }));
    return {
      masterTaxonId: row.master_taxon_id,
      germanName: row.german_name || null,
      englishName: row.english_name || null,
      acceptedScientificName: row.accepted_scientific_name,
      rank: row.rank,
      kingdom: row.kingdom || null,
      lifecycleState: row.lifecycle_state,
      referenceState: row.reference_state,
      hierarchy,
      names,
      statuses: this.statusRows.all(row.master_taxon_id).map((entry) => ({
        status: entry.status_name,
        detail: entry.status_detail || null,
      })),
      providers: this.providerRows.all(row.master_taxon_id).map((entry) => ({
        provider: entry.provider,
        label: providerLabel(entry.provider),
        providerVersion: entry.provider_version,
        providerRecordId: entry.provider_record_id,
        scientificName: entry.scientific_name,
        rank: entry.rank,
        matchState: entry.match_state,
        retrievedAt: entry.retrieved_at,
      })),
      projectLinks: this.projectRows.all(row.master_taxon_id).map((entry) => ({ ...entry })),
      keywordPath: hierarchy.map((entry) => ({
        rank: entry.rank,
        value: entry.scientificName,
      })),
    };
  }
}

export async function openLightroomSearchStore({ searchRoot, slot = "active" } = {}) {
  if (!searchRoot) throw new Error("Lightroom-Suchpaketpfad fehlt.");
  try {
    const manifest = JSON.parse(
      await fs.readFile(lightroomSearchManifestPath(searchRoot, slot), "utf8"),
    );
    const correctionRelease = slot === "active"
      ? await readActiveTaxonomyCorrectionRelease(searchRoot, {
          expectedMasterVersion: manifest.masterVersion,
          expectedPackageId: manifest.packageId,
        })
      : null;
    const { DatabaseSync } = await loadNodeSqlite();
    const database = new DatabaseSync(lightroomSearchDatabasePath(searchRoot, slot), {
      readOnly: true,
    });
    try {
      inspectLightroomSearchDatabase(database, { full: false });
      return new LightroomSearchStore({
        database,
        manifest,
        searchRoot,
        slot,
        correctionRelease,
      });
    } catch (error) {
      database.close();
      throw error;
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { available: false, reason: "not-installed", close() {} };
    }
    throw error;
  }
}

export const lightroomSearchStoreInternals = Object.freeze({
  ftsPrefixQuery,
  matchType,
  providerLabel,
  scoreCandidate,
});
