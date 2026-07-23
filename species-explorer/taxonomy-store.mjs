import fs from "node:fs/promises";
import path from "node:path";

import {
  createAnimaliaManualSearchUrl,
  foldTaxonomySearchTerm,
  germanKingdomLabel,
  germanTaxonomySearchKey,
  normalizeTaxonomySearchTerm,
} from "./taxonomy-search-text.mjs";
import {
  loadNodeSqlite,
  readActiveTaxonomyPointer,
  taxonomyDatabasePath,
  taxonomyReleaseManifestPath,
} from "./taxonomy-storage.mjs";

const SEARCH_KINDS = new Set(["all", "scientific", "vernacular", "identifier"]);

function prefixUpperBound(value) {
  return `${value}\u{10ffff}`;
}

function normalizeLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 12;
  return Math.max(1, Math.min(12, parsed));
}

function termTypeFilter(kind) {
  if (kind === "scientific") return ["accepted_scientific", "scientific_synonym"];
  if (kind === "vernacular") return ["vernacular"];
  if (kind === "identifier") return ["external_identifier"];
  return null;
}

function plain(value) {
  return value ? { ...value } : value;
}

export class TaxonomyStore {
  constructor({ database, taxonomyRoot, releaseId, releaseManifest, pointer }) {
    this.database = database;
    this.taxonomyRoot = taxonomyRoot;
    this.releaseId = releaseId;
    this.releaseManifest = releaseManifest;
    this.pointer = pointer;
    this.closed = false;
    this.database.exec("PRAGMA query_only = ON; PRAGMA case_sensitive_like = ON;");
    this.preferredGermanStatement = this.database.prepare(`
      SELECT name, preferred, source_dataset_id, reference_id
      FROM vernacular_name
      WHERE taxon_id = ? AND language IN ('de', 'deu', 'ger')
      ORDER BY preferred DESC, LENGTH(name), name COLLATE NOCASE
    `);
  }

  assertOpen() {
    if (this.closed) throw new Error("Die Taxonomiedatenbank ist bereits geschlossen.");
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
      schemaVersion: Number(
        this.database.prepare("SELECT value FROM schema_info WHERE key = 'schemaVersion'").get()?.value,
      ),
      releaseId: this.releaseId,
      previousRelease: this.pointer?.previousRelease ?? null,
      boundedPrototype: this.releaseManifest.boundedPrototype === true,
      importedAt: this.releaseManifest.importedAt,
      source: this.releaseManifest.source,
      counts: this.releaseManifest.counts,
      measurements: this.releaseManifest.measurements,
    };
  }

  kingdoms() {
    this.assertOpen();
    const values = this.database.prepare(`
      SELECT kingdom, COUNT(*) AS taxon_count
      FROM taxon
      WHERE kingdom IS NOT NULL AND kingdom <> ''
      GROUP BY kingdom
      ORDER BY CASE WHEN kingdom = 'Animalia' THEN 0 ELSE 1 END, kingdom
    `).all();
    return {
      defaultKingdom: "Animalia",
      values: values.map((row) => ({
        id: row.kingdom,
        scientificName: row.kingdom,
        label: `${germanKingdomLabel(row.kingdom)} (${row.kingdom})`,
        taxonCount: row.taxon_count,
      })),
      includesAllOption: true,
    };
  }

  germanNames(taxonId) {
    const seen = new Set();
    return this.preferredGermanStatement.all(taxonId)
      .map(plain)
      .filter((entry) => {
        const key = normalizeTaxonomySearchTerm(entry.name);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  formatSearchResult(row) {
    const germanNames = this.germanNames(row.taxon_id);
    const matchedGermanName = row.term_type === "vernacular" ? row.term : null;
    const germanName = matchedGermanName ?? germanNames[0]?.name ?? null;
    const hasVerifiedGermanName = germanNames.length > 0;
    const synonym = row.term_type === "scientific_synonym";
    return {
      taxonId: row.taxon_id,
      sourceId: row.source_id,
      germanName,
      germanNames: germanNames.map((entry) => entry.name),
      acceptedScientificName: row.scientific_name,
      matchedTerm: row.term,
      matchType: row.term_type,
      synonym: synonym
        ? {
          scientificName: row.term,
          acceptedScientificName: row.scientific_name,
        }
        : null,
      rank: row.rank,
      status: row.status,
      extinct: row.extinct === null ? null : Boolean(row.extinct),
      kingdom: {
        id: row.kingdom,
        scientificName: row.kingdom,
        label: germanKingdomLabel(row.kingdom),
      },
      trustTier: row.trust_tier,
      releaseId: this.releaseId,
      source: "Catalogue of Life",
      hasVerifiedGermanName,
      manualGermanNameFallback: row.kingdom === "Animalia" && !hasVerifiedGermanName
        ? {
          provider: "Animalia.bio",
          mode: "manual-browser-search",
          url: createAnimaliaManualSearchUrl(row.scientific_name),
        }
        : null,
    };
  }

  prefixRows({ normalized, folded, germanKey, kind, kingdom, limit }) {
    const filters = [];
    const params = [
      normalized,
      prefixUpperBound(normalized),
      folded,
      prefixUpperBound(folded),
      germanKey,
      prefixUpperBound(germanKey),
    ];
    if (kingdom && kingdom !== "all") {
      filters.push("term.kingdom = ?");
      params.push(kingdom);
    }
    const types = termTypeFilter(kind);
    if (types) {
      filters.push(`term.term_type IN (${types.map(() => "?").join(", ")})`);
      params.push(...types);
    }
    params.push(normalized, folded, germanKey, limit * 8);
    return this.database.prepare(`
      SELECT
        term.id AS term_id,
        term.taxon_id,
        term.term,
        term.term_type,
        term.preferred,
        term.sort_score,
        taxon.source_id,
        taxon.scientific_name,
        taxon.rank,
        taxon.status,
        taxon.extinct,
        taxon.kingdom,
        taxon.trust_tier
      FROM search_term term
      JOIN taxon ON taxon.id = term.taxon_id
      WHERE (
        (term.normalized >= ? AND term.normalized < ?)
        OR (term.folded >= ? AND term.folded < ?)
        OR (term.german_key >= ? AND term.german_key < ?)
      )
      ${filters.length ? `AND ${filters.join(" AND ")}` : ""}
      ORDER BY
        CASE
          WHEN term.normalized = ? OR term.folded = ? OR term.german_key = ? THEN 0
          ELSE 1
        END,
        term.sort_score,
        CASE WHEN term.trust_tier = 'base' THEN 0 ELSE 1 END,
        term.normalized,
        taxon.source_id
      LIMIT ?
    `).all(...params);
  }

  ftsRows({ normalized, kind, kingdom, limit }) {
    const tokens = normalized.split(" ").filter(Boolean);
    if (!tokens.length) return [];
    const match = tokens.map((token) => `"${token.replace(/"/g, "\"\"")}"*`).join(" AND ");
    const filters = [];
    const params = [match];
    if (kingdom && kingdom !== "all") {
      filters.push("term.kingdom = ?");
      params.push(kingdom);
    }
    const types = termTypeFilter(kind);
    if (types) {
      filters.push(`term.term_type IN (${types.map(() => "?").join(", ")})`);
      params.push(...types);
    }
    params.push(limit * 8);
    return this.database.prepare(`
      SELECT
        term.id AS term_id,
        term.taxon_id,
        term.term,
        term.term_type,
        term.preferred,
        term.sort_score,
        taxon.source_id,
        taxon.scientific_name,
        taxon.rank,
        taxon.status,
        taxon.extinct,
        taxon.kingdom,
        taxon.trust_tier
      FROM search_term_fts fts
      JOIN search_term term ON term.id = fts.rowid
      JOIN taxon ON taxon.id = term.taxon_id
      WHERE search_term_fts MATCH ?
      ${filters.length ? `AND ${filters.join(" AND ")}` : ""}
      ORDER BY
        bm25(search_term_fts),
        term.sort_score,
        CASE WHEN term.trust_tier = 'base' THEN 0 ELSE 1 END,
        term.normalized
      LIMIT ?
    `).all(...params);
  }

  search({
    query,
    kind = "all",
    kingdom = "Animalia",
    limit = 12,
  } = {}) {
    this.assertOpen();
    if (!SEARCH_KINDS.has(kind)) throw new Error(`Unbekannte Taxonomie-Suchart: ${kind}`);
    const normalized = normalizeTaxonomySearchTerm(query);
    const maximum = normalizeLimit(limit);
    if (!normalized) {
      return {
        query: "",
        kind,
        kingdom,
        limit: maximum,
        results: [],
        selected: null,
        ambiguous: false,
      };
    }
    const searchInput = {
      normalized,
      folded: foldTaxonomySearchTerm(query),
      germanKey: germanTaxonomySearchKey(query),
      kind,
      kingdom,
      limit: maximum,
    };
    const rows = this.prefixRows(searchInput);
    if (rows.length < maximum && normalized.length >= 2) {
      const seenTerms = new Set(rows.map((row) => row.term_id));
      for (const row of this.ftsRows(searchInput)) {
        if (!seenTerms.has(row.term_id)) rows.push(row);
      }
    }
    const seenTaxa = new Set();
    const results = [];
    for (const row of rows) {
      if (seenTaxa.has(row.taxon_id)) continue;
      seenTaxa.add(row.taxon_id);
      results.push(this.formatSearchResult(row));
      if (results.length === maximum) break;
    }
    return {
      query: String(query),
      normalizedQuery: normalized,
      kind,
      kingdom,
      limit: maximum,
      results,
      selected: null,
      ambiguous: results.length > 1,
    };
  }

  taxon(reference) {
    this.assertOpen();
    const value = String(reference ?? "").trim();
    const row = /^\d+$/.test(value)
      ? this.database.prepare("SELECT * FROM taxon WHERE id = ?").get(Number(value))
      : this.database.prepare("SELECT * FROM taxon WHERE source_id = ?").get(value);
    if (!row) return null;
    const hierarchy = [];
    const parentStatement = this.database.prepare("SELECT * FROM taxon WHERE id = ?");
    let current = row;
    const visited = new Set();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      hierarchy.unshift(plain(current));
      current = current.parent_id ? parentStatement.get(current.parent_id) : null;
    }
    const scientificNames = this.database.prepare(`
      SELECT source_name_id, scientific_name, authorship, rank, status, relationship, trust_tier
      FROM taxon_name
      WHERE taxon_id = ?
      ORDER BY CASE WHEN relationship = 'accepted' THEN 0 ELSE 1 END, scientific_name
    `).all(row.id).map(plain);
    const identifiers = this.database.prepare(`
      SELECT identifier_type, identifier, source, source_release
      FROM external_identifier
      WHERE taxon_id = ?
      ORDER BY identifier_type, identifier
    `).all(row.id).map(plain);
    const worms = plain(
      this.database.prepare("SELECT * FROM worms_comparison WHERE taxon_id = ?").get(row.id),
    );
    const germanNames = this.germanNames(row.id);
    return {
      ...plain(row),
      hierarchy,
      scientificNames,
      germanNames,
      identifiers,
      worms,
      manualGermanNameFallback: row.kingdom === "Animalia" && !germanNames.length
        ? {
          provider: "Animalia.bio",
          mode: "manual-browser-search",
          url: createAnimaliaManualSearchUrl(row.scientific_name),
        }
        : null,
    };
  }
}

export async function openTaxonomyStore({
  taxonomyRoot,
  releaseId,
} = {}) {
  if (!taxonomyRoot) throw new Error("Taxonomie-Zielpfad fehlt.");
  const root = path.resolve(taxonomyRoot);
  const pointer = await readActiveTaxonomyPointer(root);
  const selectedRelease = releaseId ?? pointer?.activeRelease;
  if (!selectedRelease) {
    return {
      available: false,
      reason: "not-installed",
      taxonomyRoot: root,
    };
  }
  const databasePath = taxonomyDatabasePath(root, selectedRelease);
  const manifestPath = taxonomyReleaseManifestPath(root, selectedRelease);
  const [{ DatabaseSync }, manifestText] = await Promise.all([
    loadNodeSqlite(),
    fs.readFile(manifestPath, "utf8"),
    fs.access(databasePath),
  ]);
  const database = new DatabaseSync(databasePath, { readOnly: true });
  return new TaxonomyStore({
    database,
    taxonomyRoot: root,
    releaseId: selectedRelease,
    releaseManifest: JSON.parse(manifestText),
    pointer,
  });
}
