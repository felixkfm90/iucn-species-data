import {
  TAXONOMY_IMPORTER_VERSION,
  TAXONOMY_SCHEMA_VERSION,
} from "./taxonomy-storage.mjs";

export function createTaxonomySchema(database) {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = DELETE;
    PRAGMA synchronous = FULL;

    CREATE TABLE schema_info (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) WITHOUT ROWID;

    CREATE TABLE source_release (
      source_release_id TEXT PRIMARY KEY,
      source_name TEXT NOT NULL,
      alias TEXT NOT NULL,
      issued TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      format TEXT NOT NULL,
      coldp_version TEXT NOT NULL,
      doi TEXT,
      source_url TEXT NOT NULL,
      fixture_sha256 TEXT NOT NULL,
      license TEXT NOT NULL,
      bounded_prototype INTEGER NOT NULL CHECK (bounded_prototype IN (0, 1))
    ) WITHOUT ROWID;

    CREATE TABLE source_dataset (
      source_dataset_id TEXT PRIMARY KEY,
      source_release_id TEXT NOT NULL REFERENCES source_release(source_release_id),
      title TEXT NOT NULL,
      trust_tier TEXT NOT NULL CHECK (trust_tier IN ('base', 'xr-supplement', 'mixed'))
    ) WITHOUT ROWID;

    CREATE TABLE raw_name_usage (
      source_id TEXT PRIMARY KEY,
      source_dataset_id TEXT NOT NULL,
      parent_source_id TEXT,
      scientific_name TEXT NOT NULL,
      authorship TEXT,
      rank TEXT NOT NULL,
      status TEXT NOT NULL,
      code TEXT,
      extinct INTEGER CHECK (extinct IN (0, 1) OR extinct IS NULL),
      environment TEXT,
      kingdom TEXT,
      alternative_id TEXT,
      trust_tier TEXT NOT NULL CHECK (trust_tier IN ('base', 'xr-supplement'))
    ) WITHOUT ROWID;

    CREATE TABLE taxon (
      id INTEGER PRIMARY KEY,
      source_id TEXT NOT NULL UNIQUE,
      parent_id INTEGER REFERENCES taxon(id),
      scientific_name TEXT NOT NULL,
      authorship TEXT,
      rank TEXT NOT NULL,
      status TEXT NOT NULL,
      code TEXT,
      extinct INTEGER CHECK (extinct IN (0, 1) OR extinct IS NULL),
      environment TEXT,
      kingdom TEXT,
      source_dataset_id TEXT NOT NULL REFERENCES source_dataset(source_dataset_id),
      trust_tier TEXT NOT NULL CHECK (trust_tier IN ('base', 'xr-supplement'))
    );

    CREATE TABLE taxon_name (
      id INTEGER PRIMARY KEY,
      source_name_id TEXT NOT NULL UNIQUE,
      taxon_id INTEGER NOT NULL REFERENCES taxon(id) ON DELETE CASCADE,
      scientific_name TEXT NOT NULL,
      authorship TEXT,
      rank TEXT NOT NULL,
      status TEXT NOT NULL,
      relationship TEXT NOT NULL,
      source_dataset_id TEXT NOT NULL REFERENCES source_dataset(source_dataset_id),
      trust_tier TEXT NOT NULL CHECK (trust_tier IN ('base', 'xr-supplement'))
    );

    CREATE TABLE vernacular_name (
      id INTEGER PRIMARY KEY,
      source_name_id TEXT NOT NULL UNIQUE,
      taxon_id INTEGER NOT NULL REFERENCES taxon(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      transliteration TEXT,
      normalized TEXT NOT NULL,
      language TEXT NOT NULL,
      preferred INTEGER NOT NULL CHECK (preferred IN (0, 1)),
      country TEXT,
      area TEXT,
      reference_id TEXT,
      remarks TEXT,
      source_dataset_id TEXT NOT NULL REFERENCES source_dataset(source_dataset_id),
      verified INTEGER NOT NULL CHECK (verified IN (0, 1))
    );

    CREATE TABLE external_identifier (
      id INTEGER PRIMARY KEY,
      taxon_id INTEGER NOT NULL REFERENCES taxon(id) ON DELETE CASCADE,
      identifier_type TEXT NOT NULL,
      identifier TEXT NOT NULL,
      source TEXT NOT NULL,
      source_release TEXT NOT NULL,
      UNIQUE (identifier_type, identifier, source)
    );

    CREATE TABLE worms_comparison (
      taxon_id INTEGER PRIMARY KEY REFERENCES taxon(id) ON DELETE CASCADE,
      aphia_id INTEGER NOT NULL,
      scientific_name TEXT NOT NULL,
      accepted_name TEXT NOT NULL,
      authority TEXT,
      rank TEXT,
      status TEXT,
      kingdom TEXT,
      phylum TEXT,
      class_name TEXT,
      order_name TEXT,
      family TEXT,
      genus TEXT,
      marine INTEGER,
      brackish INTEGER,
      freshwater INTEGER,
      terrestrial INTEGER,
      modified TEXT,
      source_url TEXT,
      conflict TEXT,
      fetched_at TEXT
    );

    CREATE TABLE search_term (
      id INTEGER PRIMARY KEY,
      taxon_id INTEGER NOT NULL REFERENCES taxon(id) ON DELETE CASCADE,
      source_name_id TEXT NOT NULL,
      term TEXT NOT NULL,
      normalized TEXT NOT NULL,
      folded TEXT NOT NULL,
      german_key TEXT NOT NULL,
      term_type TEXT NOT NULL,
      language TEXT,
      accepted INTEGER NOT NULL CHECK (accepted IN (0, 1)),
      preferred INTEGER NOT NULL CHECK (preferred IN (0, 1)),
      trust_tier TEXT NOT NULL,
      kingdom TEXT,
      sort_score INTEGER NOT NULL,
      UNIQUE (taxon_id, source_name_id, term_type, normalized)
    );
  `);
  const schemaInfo = database.prepare("INSERT INTO schema_info (key, value) VALUES (?, ?)");
  schemaInfo.run("schemaVersion", String(TAXONOMY_SCHEMA_VERSION));
  schemaInfo.run("importerVersion", String(TAXONOMY_IMPORTER_VERSION));
}

export function buildTaxonomySearchIndexes(database) {
  database.exec(`
    CREATE INDEX taxon_parent_idx ON taxon(parent_id);
    CREATE INDEX taxon_rank_kingdom_idx ON taxon(rank, kingdom);
    CREATE INDEX taxon_scientific_idx ON taxon(scientific_name COLLATE NOCASE);
    CREATE INDEX taxon_name_taxon_idx ON taxon_name(taxon_id);
    CREATE INDEX vernacular_taxon_language_idx ON vernacular_name(taxon_id, language, preferred);
    CREATE INDEX identifier_taxon_idx ON external_identifier(taxon_id);
    CREATE INDEX search_prefix_idx
      ON search_term(kingdom, term_type, normalized, sort_score, taxon_id);
    CREATE INDEX search_folded_idx
      ON search_term(kingdom, folded, sort_score, taxon_id);
    CREATE INDEX search_german_idx
      ON search_term(kingdom, german_key, sort_score, taxon_id);

    CREATE VIRTUAL TABLE search_term_fts USING fts5(
      normalized,
      folded,
      german_key,
      taxon_id UNINDEXED,
      term_type UNINDEXED,
      tokenize = 'unicode61 remove_diacritics 2'
    );

    INSERT INTO search_term_fts (rowid, normalized, folded, german_key, taxon_id, term_type)
    SELECT id, normalized, folded, german_key, taxon_id, term_type
    FROM search_term;
    ANALYZE;
    PRAGMA optimize;
  `);
}

function validateParentCycles(database) {
  const rows = database.prepare("SELECT id, parent_id FROM taxon").all();
  const parents = new Map(rows.map((row) => [row.id, row.parent_id]));
  for (const row of rows) {
    const visited = new Set();
    let current = row.id;
    while (current !== null && current !== undefined) {
      if (visited.has(current)) {
        throw new Error(`Elternzyklus beim Taxon ${row.id} erkannt.`);
      }
      visited.add(current);
      current = parents.get(current);
    }
  }
}

function scalar(database, sql, ...params) {
  const row = database.prepare(sql).get(...params);
  return row ? Object.values(row)[0] : null;
}

export function validateTaxonomyDatabase(database, fixtureManifest) {
  const integrity = scalar(database, "PRAGMA integrity_check");
  if (integrity !== "ok") throw new Error(`SQLite-Integritätsprüfung fehlgeschlagen: ${integrity}`);
  const foreignKeyErrors = database.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeyErrors.length) {
    throw new Error(`SQLite-Fremdschlüsselprüfung meldet ${foreignKeyErrors.length} Fehler.`);
  }
  const rawCount = scalar(database, "SELECT COUNT(*) FROM raw_name_usage");
  if (rawCount !== fixtureManifest.counts.nameUsages) {
    throw new Error(`NameUsage-Zähler weicht ab: ${rawCount} statt ${fixtureManifest.counts.nameUsages}.`);
  }
  const vernacularCount = scalar(database, "SELECT COUNT(*) FROM vernacular_name");
  if (vernacularCount !== fixtureManifest.counts.vernacularNames) {
    throw new Error(
      `Vernakularnamen-Zähler weicht ab: ${vernacularCount} statt ${fixtureManifest.counts.vernacularNames}.`,
    );
  }
  const wormsCount = scalar(database, "SELECT COUNT(*) FROM worms_comparison");
  if (wormsCount !== fixtureManifest.counts.wormsComparisons) {
    throw new Error(
      `WoRMS-Zähler weicht ab: ${wormsCount} statt ${fixtureManifest.counts.wormsComparisons}.`,
    );
  }
  const unresolvedNames = scalar(database, `
    SELECT COUNT(*)
    FROM raw_name_usage raw
    WHERE raw.status NOT IN ('accepted', 'provisionally accepted')
      AND NOT EXISTS (
        SELECT 1
        FROM taxon_name name
        WHERE name.source_name_id = raw.source_id
      )
  `);
  if (unresolvedNames) {
    throw new Error(`${unresolvedNames} wissenschaftliche Namen konnten keinem Taxon zugeordnet werden.`);
  }
  for (const result of fixtureManifest.testQueries ?? []) {
    for (const candidateId of result.candidateIds ?? []) {
      const exists = scalar(database, `
        SELECT EXISTS (
          SELECT 1 FROM taxon WHERE source_id = ?
          UNION ALL
          SELECT 1 FROM taxon_name WHERE source_name_id = ?
        )
      `, candidateId, candidateId);
      if (!exists) throw new Error(`Testkandidat ${candidateId} aus ${result.query} fehlt.`);
    }
  }
  const aotusKingdoms = scalar(database, `
    SELECT COUNT(DISTINCT kingdom)
    FROM taxon
    WHERE scientific_name = 'Aotus'
  `);
  if (aotusKingdoms < 2) throw new Error("Das Homonym Aotus ist nicht reichsübergreifend enthalten.");
  const synonymTarget = database.prepare(`
    SELECT accepted.scientific_name
    FROM taxon_name synonym
    JOIN taxon accepted ON accepted.id = synonym.taxon_id
    WHERE synonym.scientific_name = 'Parus caeruleus'
  `).get();
  if (synonymTarget?.scientific_name !== "Cyanistes caeruleus") {
    throw new Error("Das Synonym Parus caeruleus verweist nicht auf Cyanistes caeruleus.");
  }
  const extinct = scalar(database, `
    SELECT extinct FROM taxon WHERE scientific_name = 'Raphus cucullatus'
  `);
  if (extinct !== 1) throw new Error("Das von CoL belegte ausgestorbene Testtaxon fehlt.");
  const trustTiers = scalar(database, "SELECT COUNT(DISTINCT trust_tier) FROM taxon");
  if (trustTiers < 2) throw new Error("Base- und XR-Ergänzungsstufe sind nicht beide belegt.");
  const ftsCount = scalar(database, "SELECT COUNT(*) FROM search_term_fts");
  const searchCount = scalar(database, "SELECT COUNT(*) FROM search_term");
  if (!searchCount || ftsCount !== searchCount) {
    throw new Error("Der FTS5-Suchindex ist nicht vollständig.");
  }
  validateParentCycles(database);
  return {
    rawNameUsages: rawCount,
    taxa: scalar(database, "SELECT COUNT(*) FROM taxon"),
    scientificNames: scalar(database, "SELECT COUNT(*) FROM taxon_name"),
    vernacularNames: vernacularCount,
    externalIdentifiers: scalar(database, "SELECT COUNT(*) FROM external_identifier"),
    searchTerms: searchCount,
    wormsComparisons: wormsCount,
  };
}

export function measureTaxonomyDatabase(database) {
  const pageSize = scalar(database, "PRAGMA page_size");
  const pageCount = scalar(database, "PRAGMA page_count");
  let searchIndexBytes = null;
  try {
    searchIndexBytes = scalar(database, `
      SELECT COALESCE(SUM(pgsize), 0)
      FROM dbstat
      WHERE name = 'search_term_fts'
         OR name LIKE 'search_term_fts_%'
         OR name LIKE 'search_%_idx'
    `);
  } catch {
    searchIndexBytes = null;
  }
  return {
    databaseBytes: Number(pageSize) * Number(pageCount),
    searchIndexBytes,
    pageSize: Number(pageSize),
    pageCount: Number(pageCount),
  };
}
