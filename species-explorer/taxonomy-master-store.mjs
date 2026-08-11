import fs from "node:fs/promises";
import path from "node:path";

import {
  germanTaxonomyDisplayName,
  taxonomyHierarchyDisplayEntry,
} from "./taxonomy-display-names.mjs";
import { validateTaxonomyMasterDatabase } from "./taxonomy-master-schema.mjs";
import {
  taxonomyMasterDatabasePath,
  taxonomyMasterManifestPath,
} from "./taxonomy-master-storage.mjs";
import {
  foldTaxonomySearchTerm,
  germanTaxonomySearchKey,
  normalizeTaxonomySearchTerm,
} from "./taxonomy-search-text.mjs";
import { loadNodeSqlite } from "./taxonomy-storage.mjs";
import { analyzeProjectTaxonomyMasterDatabase } from "./taxonomy-taxon-quality.mjs";

const HIERARCHY_RANKS = Object.freeze([
  "kingdom",
  "phylum",
  "subphylum",
  "class",
  "order",
  "suborder",
  "family",
  "subfamily",
  "genus",
  "species",
  "subspecies",
]);

const PROVIDER_LABELS = Object.freeze({
  "catalogue-of-life": "Catalogue of Life",
  inaturalist: "iNaturalist",
  gbif: "GBIF",
  worms: "WoRMS",
  wikidata: "Wikidata",
  animalia: "Animalia",
  manual: "Eigene Korrektur",
  project: "Arten-Explorer",
});

const STATUS_LABELS = Object.freeze({
  "col-confirmed": "durch CoL bestätigt",
  "col-reference-gap": "CoL-Referenzlücke",
  "externally-confirmed": "extern bestätigt",
  conflicting: "widersprüchlich",
  stale: "veraltet",
  "manually-protected": "manuell geschützt",
});

function plain(row) {
  return row ? { ...row } : row;
}

function cleanText(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function normalized(value) {
  return normalizeTaxonomySearchTerm(value);
}

function uniqueBy(values, keyOf) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyOf(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchesKingdom(taxon, { kingdom = "Animalia", kingdoms = null } = {}) {
  const selected = Array.isArray(kingdoms) && kingdoms.length
    ? kingdoms
    : kingdom === "all"
      ? []
      : [kingdom];
  return !selected.length || selected.includes(taxon.kingdom);
}

function termScore(query, term) {
  const queryVariants = [
    normalized(query),
    foldTaxonomySearchTerm(query),
    germanTaxonomySearchKey(query),
  ];
  const termVariants = [
    normalized(term),
    foldTaxonomySearchTerm(term),
    germanTaxonomySearchKey(term),
  ];
  if (termVariants.some((value) => queryVariants.includes(value))) return 0;
  if (termVariants.some((value) => queryVariants.some((queryValue) => value.startsWith(queryValue)))) {
    return 10;
  }
  if (termVariants.some((value) => queryVariants.some((queryValue) => value.includes(queryValue)))) {
    return 30;
  }
  return Number.POSITIVE_INFINITY;
}

function resultSourceLabel(providers) {
  const labels = providers
    .map((provider) => PROVIDER_LABELS[provider] || provider)
    .filter(Boolean);
  return labels.length ? labels.join(" + ") : "Taxonomie-Masterdatenbank";
}

export class TaxonomyMasterStore {
  constructor({ database, manifest, taxonomyRoot, slot = "active" } = {}) {
    if (!database || !manifest || !taxonomyRoot) {
      throw new TypeError("Masterdatenbank, Manifest und Taxonomiepfad sind erforderlich.");
    }
    this.database = database;
    this.manifest = manifest;
    this.taxonomyRoot = path.resolve(taxonomyRoot);
    this.slot = slot;
    this.closed = false;
    this.hasSearchIndex = Boolean(this.database.prepare(`
      SELECT 1 AS available
      FROM sqlite_master
      WHERE type = 'table' AND name = 'master_search_term'
    `).get());
    this.taxonRows = this.database.prepare(`
      SELECT * FROM master_taxon
      WHERE lifecycle_state != 'deprecated'
      ORDER BY canonical_name_normalized, rank, master_taxon_id
    `);
    this.taxonRow = this.database.prepare(`
      SELECT * FROM master_taxon WHERE master_taxon_id = ?
    `);
    this.indexedSearchRows = this.hasSearchIndex ? Object.fromEntries([
      ["normalized", "normalized_term"],
      ["folded", "folded_term"],
      ["german", "german_key"],
    ].map(([variant, column]) => [variant, this.database.prepare(`
      SELECT taxon.*, term.term, term.term_kind, term.language,
        term.source_provider, term.weight, term.${column} AS matched_index_value
      FROM master_search_term term
      JOIN master_taxon taxon ON taxon.master_taxon_id = term.master_taxon_id
      WHERE taxon.lifecycle_state != 'deprecated'
        AND term.${column} >= ?
        AND term.${column} < ?
      ORDER BY term.${column}, term.weight,
        taxon.canonical_name_normalized, taxon.master_taxon_id
      LIMIT ?
    `)])) : null;
    this.kingdomCounts = this.database.prepare(`
      SELECT kingdom, COUNT(*) AS count
      FROM master_taxon
      WHERE lifecycle_state != 'deprecated' AND kingdom != ''
      GROUP BY kingdom
      ORDER BY kingdom
    `);
    this.exactCanonicalRows = this.database.prepare(`
      SELECT taxon.*, taxon.canonical_scientific_name AS matched_name,
        'accepted_scientific' AS matched_type
      FROM master_taxon taxon
      WHERE taxon.lifecycle_state != 'deprecated'
        AND taxon.canonical_name_normalized = ?
    `);
    this.exactIndexedSearchRows = this.hasSearchIndex ? this.database.prepare(`
      SELECT taxon.*, term.term AS matched_name,
        CASE
          WHEN term.term_kind = 'synonym' THEN 'scientific_synonym'
          ELSE 'accepted_scientific'
        END AS matched_type
      FROM master_search_term term
      JOIN master_taxon taxon ON taxon.master_taxon_id = term.master_taxon_id
      WHERE taxon.lifecycle_state != 'deprecated'
        AND term.normalized_term = ?
        AND term.term_kind IN ('scientific', 'synonym')
      ORDER BY term.weight, taxon.canonical_name_normalized, taxon.master_taxon_id
    `) : null;
    this.exactSelectedScientificRows = this.database.prepare(`
      SELECT taxon.*, field.field_value AS matched_name,
        'accepted_scientific' AS matched_type
      FROM master_field_assertion field
      JOIN master_taxon taxon ON taxon.master_taxon_id = field.master_taxon_id
      WHERE taxon.lifecycle_state != 'deprecated'
        AND field.field_name = 'scientific-name'
        AND field.language = ''
        AND field.selected = 1
        AND field.normalized_value = ?
    `);
    this.exactAliasRows = this.database.prepare(`
      SELECT taxon.*, alias.name AS matched_name,
        'scientific_synonym' AS matched_type
      FROM master_taxon_alias alias
      JOIN master_taxon taxon ON taxon.master_taxon_id = alias.master_taxon_id
      WHERE taxon.lifecycle_state != 'deprecated'
        AND alias.normalized_name = ?
    `);
    this.fieldRows = this.database.prepare(`
      SELECT field.*, release.provider, release.provider_version
      FROM master_field_assertion field
      JOIN provider_release release ON release.release_id = field.release_id
      WHERE field.master_taxon_id = ?
      ORDER BY field.selected DESC, field.confidence DESC, field.assertion_id
    `);
    this.aliasRows = this.database.prepare(`
      SELECT * FROM master_taxon_alias
      WHERE master_taxon_id = ?
      ORDER BY alias_type, normalized_name
    `);
    this.providerNameRows = this.database.prepare(`
      SELECT name.*, source.scientific_name, source.provider_record_id,
        source.version_change_state, release.provider, release.provider_version,
        release.imported_at, release.source_url
      FROM provider_name_assertion name
      JOIN provider_taxon_assertion source
        ON source.assertion_id = name.provider_taxon_assertion_id
      JOIN provider_release release ON release.release_id = source.release_id
      WHERE source.master_taxon_id = ?
        AND source.version_change_state != 'removed'
      ORDER BY name.preferred DESC, name.verified DESC, name.normalized_name
    `);
    this.providerRows = this.database.prepare(`
      SELECT source.*, release.provider, release.provider_version,
        release.issued_at, release.imported_at, release.source_url, release.license
      FROM provider_taxon_assertion source
      JOIN provider_release release ON release.release_id = source.release_id
      WHERE source.master_taxon_id = ?
      ORDER BY CASE release.provider
        WHEN 'manual' THEN 0
        WHEN 'project' THEN 1
        WHEN 'catalogue-of-life' THEN 2
        WHEN 'worms' THEN 3
        WHEN 'gbif' THEN 4
        WHEN 'inaturalist' THEN 5
        WHEN 'wikidata' THEN 6
        ELSE 7 END,
        release.imported_at DESC
    `);
    this.statusRows = this.database.prepare(`
      SELECT * FROM master_taxon_status
      WHERE master_taxon_id = ?
      ORDER BY status_name
    `);
    this.projectRows = this.database.prepare(`
      SELECT * FROM project_taxon_link
      WHERE master_taxon_id = ?
      ORDER BY project_taxon_key
    `);
    this.projectCount = this.database.prepare(`
      SELECT COUNT(*) AS count FROM project_taxon_link
      WHERE master_taxon_id = ?
    `);
    this.openConflictRows = this.database.prepare(`
      SELECT conflict.*, taxon.canonical_scientific_name, project.project_slug
      FROM master_conflict conflict
      JOIN master_taxon taxon ON taxon.master_taxon_id = conflict.master_taxon_id
      JOIN project_taxon_link project ON project.master_taxon_id = conflict.master_taxon_id
      WHERE conflict.conflict_state = 'open'
      ORDER BY taxon.canonical_name_normalized, conflict.field_name, conflict.conflict_id
    `);
  }

  assertOpen() {
    if (this.closed) throw new Error("Die Masterdatenbank ist bereits geschlossen.");
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
      candidateId: this.manifest.candidateId,
      createdAt: this.manifest.createdAt,
      activatedAt: this.manifest.activatedAt || "",
      schemaVersion: this.manifest.schemaVersion,
      summary: this.manifest.summary || {},
      sources: this.manifest.sources || [],
    };
  }

  review() {
    this.assertOpen();
    const quality = analyzeProjectTaxonomyMasterDatabase(this.database);
    return {
      ...quality,
      openConflicts: this.openConflictRows.all().map(plain),
    };
  }

  selectedFields(masterTaxonId) {
    return this.fieldRows.all(masterTaxonId)
      .map(plain)
      .filter((row) => row.selected === 1);
  }

  fieldMap(masterTaxonId) {
    return new Map(this.selectedFields(masterTaxonId).map((row) => [
      `${row.field_name}|${row.language || ""}`,
      row,
    ]));
  }

  statuses(masterTaxonId) {
    return this.statusRows.all(masterTaxonId).map((row) => ({
      id: row.status_name,
      label: STATUS_LABELS[row.status_name] || row.status_name,
      detail: row.status_detail || null,
      updatedAt: row.updated_at,
    }));
  }

  providers(masterTaxonId) {
    return this.providerRows.all(masterTaxonId).map((row) => ({
      provider: row.provider,
      label: PROVIDER_LABELS[row.provider] || row.provider,
      providerRecordId: row.provider_record_id,
      providerVersion: row.provider_version,
      scientificName: row.scientific_name,
      rank: row.rank,
      matchState: row.match_state,
      versionChangeState: row.version_change_state,
      retrievedAt: row.retrieved_at,
      issuedAt: row.issued_at || null,
      importedAt: row.imported_at,
      sourceUrl: row.source_url || null,
      license: row.license || null,
    }));
  }

  names(masterTaxonId, fields = this.fieldMap(masterTaxonId)) {
    const providerNames = this.providerNameRows.all(masterTaxonId).map(plain);
    const make = (language, fieldName) => {
      const selected = fields.get(`${fieldName}|${language}`);
      const values = [
        selected && {
          name: selected.field_value,
          source: PROVIDER_LABELS[selected.provider] || selected.provider,
          provider: selected.provider,
          providerVersion: selected.provider_version,
          preferred: true,
          verified: selected.review_state === "accepted",
          selected: true,
        },
        ...providerNames
          .filter((row) => row.language === language && ["vernacular", "label"].includes(row.name_kind))
          .map((row) => ({
            name: row.name,
            source: PROVIDER_LABELS[row.provider] || row.provider,
            provider: row.provider,
            providerRecordId: row.provider_record_id,
            providerVersion: row.provider_version,
            preferred: Boolean(row.preferred),
            verified: Boolean(row.verified),
            selected: false,
          })),
      ].filter(Boolean);
      return uniqueBy(values, (entry) => normalized(entry.name));
    };
    return {
      germanNames: make("de", "german-name"),
      englishNames: make("en", "english-name"),
    };
  }

  compactTaxon(row) {
    const taxon = plain(row);
    const fields = this.fieldMap(taxon.master_taxon_id);
    const names = this.names(taxon.master_taxon_id, fields);
    const aliases = this.aliasRows.all(taxon.master_taxon_id).map(plain);
    const providers = this.providers(taxon.master_taxon_id);
    const statuses = this.statuses(taxon.master_taxon_id);
    const scientificName = fields.get("scientific-name|")?.field_value
      || taxon.canonical_scientific_name;
    const germanName = names.germanNames[0]?.name || null;
    const englishName = names.englishNames[0]?.name || null;
    return {
      ...taxon,
      scientificName,
      germanName,
      englishName,
      names,
      aliases,
      providers,
      statuses,
      statusIds: statuses.map((entry) => entry.id),
      sourceProviders: [...new Set(providers.map((entry) => entry.provider))],
      fields,
    };
  }

  searchTerms(taxon, { kind = "all", language = "all" } = {}) {
    const terms = [];
    const allowScientific = kind === "all" || kind === "scientific" || kind === "identifier";
    const allowVernacular = kind === "all" || kind === "vernacular";
    if (allowScientific) {
      terms.push({ value: taxon.scientificName, type: "accepted_scientific", language: "scientific" });
      for (const alias of taxon.aliases) {
        terms.push({ value: alias.name, type: "scientific_synonym", language: "scientific" });
      }
    }
    if (allowVernacular && ["all", "de"].includes(language)) {
      for (const name of taxon.names.germanNames) {
        terms.push({ value: name.name, type: "vernacular", language: "de" });
      }
    }
    if (allowVernacular && ["all", "en"].includes(language)) {
      for (const name of taxon.names.englishNames) {
        terms.push({ value: name.name, type: "vernacular", language: "en" });
      }
    }
    if (kind === "identifier" || kind === "all") {
      for (const field of taxon.fields.values()) {
        if (field.field_name.endsWith("-id")) {
          terms.push({ value: field.field_value, type: "identifier", language: "" });
        }
      }
      for (const provider of taxon.providers) {
        terms.push({ value: provider.providerRecordId, type: "identifier", language: "" });
      }
    }
    return uniqueBy(terms.filter((term) => cleanText(term.value)), (term) => (
      `${term.type}|${term.language}|${normalized(term.value)}`
    ));
  }

  formatSearchResult(taxon, match) {
    const displayName = taxon.germanName || taxon.englishName;
    const displayNameLanguage = taxon.germanName ? "de" : (taxon.englishName ? "en" : null);
    const synonym = match.type === "scientific_synonym"
      ? { scientificName: match.value, acceptedScientificName: taxon.scientificName }
      : null;
    return {
      taxonId: taxon.master_taxon_id,
      masterTaxonId: taxon.master_taxon_id,
      sourceId: taxon.master_taxon_id,
      germanName: taxon.germanName,
      germanNames: taxon.names.germanNames.map((entry) => entry.name),
      englishName: taxon.englishName,
      englishNames: taxon.names.englishNames.map((entry) => entry.name),
      displayName,
      displayNameLanguage,
      usesEnglishFallback: displayNameLanguage === "en",
      acceptedScientificName: taxon.scientificName,
      matchedTerm: match.value,
      matchType: match.type,
      synonym,
      rank: taxon.rank,
      status: taxon.lifecycle_state,
      extinct: null,
      kingdom: {
        id: taxon.kingdom,
        scientificName: taxon.kingdom,
        label: germanTaxonomyDisplayName("kingdom", taxon.kingdom) || taxon.kingdom,
      },
      trustTier: taxon.reference_state === "exact-col" ? "primary" : "supplemented",
      source: resultSourceLabel(taxon.sourceProviders),
      sourceProviders: taxon.sourceProviders,
      masterStatuses: taxon.statuses,
      referenceState: taxon.reference_state,
      referenceGap: taxon.reference_state === "reference-gap",
      hasVerifiedGermanName: taxon.names.germanNames.some((entry) => entry.verified),
    };
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
    const maximum = Math.max(1, Math.min(100, Number(limit) || 12));
    if (this.indexedSearchRows) {
      const queryVariants = [
        normalized(query),
        foldTaxonomySearchTerm(query),
        germanTaxonomySearchKey(query),
      ];
      if (!queryVariants.some(Boolean)) return {
        query: String(query ?? ""), normalizedQuery: normalized(query), kind, kingdom,
        kingdoms: Array.isArray(kingdoms) ? [...kingdoms] : null,
        language, rank, limit: maximum, results: [], selected: null,
        ambiguous: false, source: "Taxonomie-Masterdatenbank",
      };
      const rowLimit = Math.min(2_000, Math.max(100, maximum * 30));
      const rows = [
        ["normalized", queryVariants[0]],
        ["folded", queryVariants[1]],
        ["german", queryVariants[2]],
      ].flatMap(([variant, value]) => value
        ? this.indexedSearchRows[variant].all(value, `${value}\uffff`, rowLimit)
          .map((row) => ({
            ...row,
            search_score: Number(row.weight) + (row.matched_index_value === value ? 0 : 10),
          }))
        : [])
        .sort((left, right) => (
          left.search_score - right.search_score
          || left.canonical_name_normalized.localeCompare(right.canonical_name_normalized, "en")
          || left.master_taxon_id.localeCompare(right.master_taxon_id, "en")
        ));
      const allowedKinds = kind === "all"
        ? null
        : kind === "scientific"
          ? new Set(["scientific", "synonym"])
          : kind === "vernacular"
            ? new Set(["vernacular", "project"])
            : new Set(["identifier"]);
      const seen = new Set();
      const results = [];
      for (const row of rows) {
        if (seen.has(row.master_taxon_id)) continue;
        if (!matchesKingdom(row, { kingdom, kingdoms })) continue;
        if (rank !== "all" && row.rank !== rank) continue;
        if (allowedKinds && !allowedKinds.has(row.term_kind)) continue;
        if (language !== "all" && row.term_kind === "vernacular" && row.language !== language) continue;
        const taxon = this.compactTaxon(row);
        const type = row.term_kind === "synonym"
          ? "scientific_synonym"
          : row.term_kind === "scientific"
            ? "accepted_scientific"
            : row.term_kind;
        results.push(this.formatSearchResult(taxon, { value: row.term, type }));
        seen.add(row.master_taxon_id);
        if (results.length === maximum) break;
      }
      return {
        query: String(query ?? ""),
        normalizedQuery: normalized(query),
        kind,
        kingdom,
        kingdoms: Array.isArray(kingdoms) ? [...kingdoms] : null,
        language,
        rank,
        limit: maximum,
        results,
        selected: null,
        ambiguous: results.length > 1,
        source: "Taxonomie-Masterdatenbank",
      };
    }
    const ranked = [];
    for (const row of this.taxonRows.all()) {
      const taxon = this.compactTaxon(row);
      if (!matchesKingdom(taxon, { kingdom, kingdoms })) continue;
      if (rank !== "all" && taxon.rank !== rank) continue;
      for (const term of this.searchTerms(taxon, { kind, language })) {
        const score = termScore(query, term.value);
        if (!Number.isFinite(score)) continue;
        ranked.push({ taxon, term, score });
      }
    }
    ranked.sort((left, right) => (
      left.score - right.score
      || left.taxon.scientificName.localeCompare(right.taxon.scientificName, "en", {
        sensitivity: "base",
      })
    ));
    const seen = new Set();
    const results = [];
    for (const entry of ranked) {
      if (seen.has(entry.taxon.master_taxon_id)) continue;
      seen.add(entry.taxon.master_taxon_id);
      results.push(this.formatSearchResult(entry.taxon, entry.term));
      if (results.length === maximum) break;
    }
    return {
      query: String(query ?? ""),
      normalizedQuery: normalized(query),
      kind,
      kingdom,
      kingdoms: Array.isArray(kingdoms) ? [...kingdoms] : null,
      language,
      rank,
      limit: maximum,
      results,
      selected: null,
      ambiguous: results.length > 1,
      source: "Taxonomie-Masterdatenbank",
    };
  }

  findTaxonByScientificName(scientificName, { rank = "species", kingdom = "" } = {}) {
    this.assertOpen();
    const query = normalized(scientificName);
    if (!query) return null;
    const exactRows = this.exactIndexedSearchRows
      ? this.exactIndexedSearchRows.all(query)
      : [
        ...this.exactCanonicalRows.all(query),
        ...this.exactSelectedScientificRows.all(query),
        ...this.exactAliasRows.all(query),
      ];
    const rows = uniqueBy(
      exactRows.map(plain),
      (row) => `${row.master_taxon_id}|${row.matched_type}`,
    );
    const matches = [];
    for (const row of rows) {
      const taxon = this.compactTaxon(row);
      if (rank && taxon.rank !== rank) continue;
      if (kingdom && normalized(taxon.kingdom) !== normalized(kingdom)) continue;
      matches.push({
        taxon,
        match: row.matched_name,
        matchType: row.matched_type,
        projectCount: Number(this.projectCount.get(taxon.master_taxon_id)?.count || 0),
      });
    }
    matches.sort((left, right) => (
      right.projectCount - left.projectCount
      || Number(right.taxon.reference_state === "exact-col")
        - Number(left.taxon.reference_state === "exact-col")
      || left.taxon.master_taxon_id.localeCompare(right.taxon.master_taxon_id, "en")
    ));
    const selected = matches[0];
    if (selected) {
      return this.formatSearchResult(selected.taxon, {
        value: selected.match,
        type: selected.matchType,
      });
    }
    return null;
  }

  taxon(reference) {
    this.assertOpen();
    const row = this.taxonRow.get(String(reference ?? "").trim());
    if (!row) return null;
    const taxon = this.compactTaxon(row);
    const hierarchy = [];
    for (const rank of HIERARCHY_RANKS) {
      const name = rank === taxon.rank
        ? taxon.scientificName
        : taxon.fields.get(`${rank}|`)?.field_value;
      if (!name) continue;
      hierarchy.push(taxonomyHierarchyDisplayEntry({
        rank,
        scientific_name: name,
        scientificName: name,
      }));
    }
    const identifiers = [...taxon.fields.values()]
      .filter((field) => field.field_name.endsWith("-id"))
      .map((field) => ({
        identifier_type: field.field_name,
        identifier: field.field_value,
        source: PROVIDER_LABELS[field.provider] || field.provider,
        source_release: field.provider_version,
      }));
    return {
      id: taxon.master_taxon_id,
      taxonId: taxon.master_taxon_id,
      masterTaxonId: taxon.master_taxon_id,
      source_id: taxon.master_taxon_id,
      scientific_name: taxon.scientificName,
      acceptedScientificName: taxon.scientificName,
      rank: taxon.rank,
      status: taxon.lifecycle_state,
      kingdom: taxon.kingdom,
      hierarchy,
      scientificNames: uniqueBy([
        { scientific_name: taxon.scientificName, relationship: "accepted", rank: taxon.rank },
        ...taxon.aliases.map((alias) => ({
          scientific_name: alias.name,
          relationship: alias.alias_type,
          rank: alias.rank || taxon.rank,
        })),
      ], (entry) => normalized(entry.scientific_name)),
      germanNames: taxon.names.germanNames,
      englishNames: taxon.names.englishNames,
      displayName: taxon.germanName || taxon.englishName,
      displayNameLanguage: taxon.germanName ? "de" : (taxon.englishName ? "en" : null),
      usesEnglishFallback: !taxon.germanName && Boolean(taxon.englishName),
      identifiers,
      providers: taxon.providers,
      sourceProviders: taxon.sourceProviders,
      masterStatuses: taxon.statuses,
      referenceState: taxon.reference_state,
      referenceGap: taxon.reference_state === "reference-gap",
      lifecycleState: taxon.lifecycle_state,
      projectLinks: this.projectRows.all(taxon.master_taxon_id).map(plain),
      source: resultSourceLabel(taxon.sourceProviders),
      masterCandidateId: this.manifest.candidateId,
    };
  }

  kingdoms() {
    this.assertOpen();
    const values = this.kingdomCounts.all().map((row) => ({
      scientificName: row.kingdom,
      taxonCount: Number(row.count),
    })).map(({ scientificName, taxonCount }) => ({
      id: scientificName,
      scientificName,
      label: `${germanTaxonomyDisplayName("kingdom", scientificName) || scientificName} (${scientificName})`,
      taxonCount,
    })).sort((left, right) => (
      (left.id === "Animalia" ? -1 : right.id === "Animalia" ? 1 : 0)
      || left.label.localeCompare(right.label, "de", { sensitivity: "base" })
    ));
    return { defaultKingdom: "Animalia", values, includesAllOption: true };
  }
}

export async function openTaxonomyMasterStore({ taxonomyRoot, slot = "active" } = {}) {
  if (!taxonomyRoot) throw new Error("Taxonomie-Zielpfad fehlt.");
  const databasePath = taxonomyMasterDatabasePath(taxonomyRoot, slot);
  const manifestPath = taxonomyMasterManifestPath(taxonomyRoot, slot);
  try {
    const [manifestText] = await Promise.all([
      fs.readFile(manifestPath, "utf8"),
      fs.access(databasePath),
    ]);
    const manifest = JSON.parse(manifestText);
    const { DatabaseSync } = await loadNodeSqlite();
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      validateTaxonomyMasterDatabase(database, { full: false });
      return new TaxonomyMasterStore({ database, manifest, taxonomyRoot, slot });
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

export const taxonomyMasterStoreInternals = Object.freeze({
  HIERARCHY_RANKS,
  PROVIDER_LABELS,
  STATUS_LABELS,
  termScore,
});
