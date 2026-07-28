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
const SEARCH_LANGUAGES = new Set(["all", "de", "en"]);
const SEARCH_RANKS = new Set([
  "all",
  "kingdom",
  "phylum",
  "subphylum",
  "class",
  "order",
  "family",
  "subfamily",
  "genus",
  "species",
  "subspecies",
]);
const GERMAN_LANGUAGE_CODES = new Set(["de", "deu", "ger"]);
const ENGLISH_LANGUAGE_CODES = new Set(["en", "eng"]);
const PREFERRED_ENGLISH_SOURCE_IDS = new Set(["2144"]);

function normalizedLanguage(value) {
  return String(value ?? "").trim().toLocaleLowerCase("en");
}

function languageMatches(value, codes, prefix) {
  const language = normalizedLanguage(value);
  return codes.has(language) || language.startsWith(`${prefix}-`);
}

function isGermanLanguage(value) {
  return languageMatches(value, GERMAN_LANGUAGE_CODES, "de");
}

function isEnglishLanguage(value) {
  return languageMatches(value, ENGLISH_LANGUAGE_CODES, "en");
}

function englishNameSortScore(entry) {
  const name = String(entry?.name ?? "").trim();
  let score = 0;
  if (!PREFERRED_ENGLISH_SOURCE_IDS.has(String(entry?.source_dataset_id ?? ""))) {
    score += 100;
  }
  if (String(entry?.source_dataset_id ?? "") === "catalogue-of-life-xr") {
    score += 40;
  }
  if (!entry?.preferred) score += 5;
  if (/^(?:[A-Z]\s*){2,6}$/.test(name) || /^[A-Z]{2,6}$/.test(name)) {
    score += 1000;
  }
  if (/^\\/.test(name) || /[[\]{}]/.test(name)) score += 500;
  if (/^[a-z][a-z-]{2,}$/.test(name)) score += 30;
  return score;
}

function compareEnglishNames(left, right) {
  return englishNameSortScore(left) - englishNameSortScore(right)
    || String(left.name).length - String(right.name).length
    || String(left.name).localeCompare(String(right.name), "en", { sensitivity: "base" });
}

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

function appendSearchFilters({
  filters,
  params,
  kind,
  kingdom,
  kingdoms,
  language,
  rank,
}) {
  const selectedKingdoms = Array.isArray(kingdoms)
    ? [...new Set(kingdoms.map((value) => String(value || "").trim()).filter(Boolean))]
    : [];
  if (selectedKingdoms.length) {
    filters.push(`term.kingdom IN (${selectedKingdoms.map(() => "?").join(", ")})`);
    params.push(...selectedKingdoms);
  } else if (kingdom && kingdom !== "all") {
    filters.push("term.kingdom = ?");
    params.push(kingdom);
  }
  const types = termTypeFilter(kind);
  if (types) {
    filters.push(`term.term_type IN (${types.map(() => "?").join(", ")})`);
    params.push(...types);
  }
  if (language === "de") {
    filters.push(`(
      LOWER(term.language) IN ('de', 'deu', 'ger')
      OR LOWER(term.language) LIKE 'de-%'
    )`);
  } else if (language === "en") {
    filters.push(`(
      LOWER(term.language) IN ('en', 'eng')
      OR LOWER(term.language) LIKE 'en-%'
    )`);
  }
  if (rank && rank !== "all") {
    filters.push("LOWER(taxon.rank) = ?");
    params.push(rank);
  }
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
      WHERE taxon_id = ?
        AND (
          LOWER(language) IN ('de', 'deu', 'ger')
          OR LOWER(language) LIKE 'de-%'
        )
      ORDER BY preferred DESC, LENGTH(name), name COLLATE NOCASE
    `);
    this.preferredEnglishStatement = this.database.prepare(`
      SELECT name, preferred, source_dataset_id, reference_id
      FROM vernacular_name
      WHERE taxon_id = ?
        AND (
          LOWER(language) IN ('en', 'eng')
          OR LOWER(language) LIKE 'en-%'
        )
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
    return this.preferredNames(this.preferredGermanStatement, taxonId);
  }

  englishNames(taxonId) {
    return this.preferredNames(this.preferredEnglishStatement, taxonId)
      .sort(compareEnglishNames);
  }

  preferredNames(statement, taxonId) {
    const seen = new Set();
    return statement.all(taxonId)
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
    const englishNames = this.englishNames(row.taxon_id);
    const matchedGermanName = row.term_type === "vernacular" && isGermanLanguage(row.language)
      ? row.term
      : null;
    const matchedEnglishName = row.term_type === "vernacular" && isEnglishLanguage(row.language)
      ? row.term
      : null;
    const germanName = matchedGermanName ?? germanNames[0]?.name ?? null;
    const englishName = matchedEnglishName ?? englishNames[0]?.name ?? null;
    const displayName = germanName ?? englishName;
    const displayNameLanguage = germanName ? "de" : (englishName ? "en" : null);
    const hasVerifiedGermanName = germanNames.length > 0;
    const synonym = row.term_type === "scientific_synonym";
    return {
      taxonId: row.taxon_id,
      sourceId: row.source_id,
      germanName,
      germanNames: germanNames.map((entry) => entry.name),
      englishName,
      englishNames: englishNames.map((entry) => entry.name),
      displayName,
      displayNameLanguage,
      usesEnglishFallback: displayNameLanguage === "en",
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

  prefixRows({
    normalized,
    folded,
    germanKey,
    kind,
    kingdom,
    kingdoms,
    language,
    rank,
    limit,
  }) {
    const filters = [];
    const params = [
      normalized,
      prefixUpperBound(normalized),
      folded,
      prefixUpperBound(folded),
      germanKey,
      prefixUpperBound(germanKey),
    ];
    appendSearchFilters({
      filters,
      params,
      kind,
      kingdom,
      kingdoms,
      language,
      rank,
    });
    params.push(normalized, folded, germanKey, limit * 8);
    return this.database.prepare(`
      SELECT
        term.id AS term_id,
        term.taxon_id,
        term.term,
        term.term_type,
        term.language,
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

  ftsRows({
    normalized,
    kind,
    kingdom,
    kingdoms,
    language,
    rank,
    limit,
  }) {
    const tokens = normalized.split(" ").filter(Boolean);
    if (!tokens.length) return [];
    const match = tokens.map((token) => `"${token.replace(/"/g, "\"\"")}"*`).join(" AND ");
    const filters = [];
    const params = [match];
    appendSearchFilters({
      filters,
      params,
      kind,
      kingdom,
      kingdoms,
      language,
      rank,
    });
    params.push(limit * 8);
    return this.database.prepare(`
      SELECT
        term.id AS term_id,
        term.taxon_id,
        term.term,
        term.term_type,
        term.language,
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

  containsRows({
    normalized,
    folded,
    germanKey,
    kind,
    kingdom,
    kingdoms,
    language,
    rank,
    limit,
  }) {
    const filters = [];
    const params = [normalized, folded, germanKey];
    appendSearchFilters({
      filters,
      params,
      kind,
      kingdom,
      kingdoms,
      language,
      rank,
    });
    params.push(limit * 16);
    return this.database.prepare(`
      SELECT
        term.id AS term_id,
        term.taxon_id,
        term.term,
        term.term_type,
        term.language,
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
        INSTR(term.normalized, ?) > 0
        OR INSTR(term.folded, ?) > 0
        OR INSTR(term.german_key, ?) > 0
      )
      ${filters.length ? `AND ${filters.join(" AND ")}` : ""}
      ORDER BY
        term.sort_score,
        CASE WHEN term.trust_tier = 'base' THEN 0 ELSE 1 END,
        LENGTH(term.normalized),
        term.normalized,
        taxon.source_id
      LIMIT ?
    `).all(...params);
  }

  search({
    query,
    kind = "all",
    kingdom = "Animalia",
    kingdoms = null,
    language = "all",
    rank = "all",
    limit = 12,
  } = {}) {
    this.assertOpen();
    if (!SEARCH_KINDS.has(kind)) throw new Error(`Unbekannte Taxonomie-Suchart: ${kind}`);
    if (!SEARCH_LANGUAGES.has(language)) {
      throw new Error(`Unbekannte Taxonomie-Suchsprache: ${language}`);
    }
    if (!SEARCH_RANKS.has(rank)) throw new Error(`Unbekannter Taxonomie-Rang: ${rank}`);
    const normalized = normalizeTaxonomySearchTerm(query);
    const maximum = normalizeLimit(limit);
    if (!normalized) {
      return {
        query: "",
        kind,
        kingdom,
        language,
        rank,
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
      kingdoms,
      language,
      rank,
      limit: maximum,
    };
    let rows = this.prefixRows(searchInput);
    const exactRows = rows.filter((row) => (
      normalizeTaxonomySearchTerm(row.term) === normalized
      || foldTaxonomySearchTerm(row.term) === searchInput.folded
      || germanTaxonomySearchKey(row.term) === searchInput.germanKey
    ));
    if (exactRows.length) rows = exactRows;
    const seenTerms = new Set(rows.map((row) => row.term_id));
    const distinctTaxonCount = () => new Set(rows.map((row) => row.taxon_id)).size;
    const appendRows = (additionalRows) => {
      for (const row of additionalRows) {
        if (seenTerms.has(row.term_id)) continue;
        seenTerms.add(row.term_id);
        rows.push(row);
      }
    };
    if (!exactRows.length && distinctTaxonCount() < maximum && normalized.length >= 2) {
      appendRows(this.ftsRows(searchInput));
    }
    if (!exactRows.length && distinctTaxonCount() < maximum && normalized.length >= 3) {
      appendRows(this.containsRows(searchInput));
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
      kingdoms: Array.isArray(kingdoms) ? [...kingdoms] : null,
      language,
      rank,
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
    const englishNames = this.englishNames(row.id);
    const germanName = germanNames[0]?.name ?? null;
    const englishName = englishNames[0]?.name ?? null;
    return {
      ...plain(row),
      hierarchy,
      scientificNames,
      germanNames,
      englishNames,
      displayName: germanName ?? englishName,
      displayNameLanguage: germanName ? "de" : (englishName ? "en" : null),
      usesEnglishFallback: !germanName && Boolean(englishName),
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
