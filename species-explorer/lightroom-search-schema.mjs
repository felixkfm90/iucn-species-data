import { LIGHTROOM_SEARCH_SCHEMA_VERSION } from "./lightroom-search-storage.mjs";

function scalar(database, sql, ...params) {
  const row = database.prepare(sql).get(...params);
  return row ? Object.values(row)[0] : null;
}

export function createLightroomSearchSchema(database) {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    PRAGMA temp_store = FILE;
    PRAGMA user_version = ${LIGHTROOM_SEARCH_SCHEMA_VERSION};

    CREATE TABLE package_info (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) WITHOUT ROWID;

    CREATE TABLE provider_release (
      provider TEXT PRIMARY KEY,
      provider_version TEXT NOT NULL,
      issued_at TEXT,
      imported_at TEXT NOT NULL,
      source_url TEXT,
      license TEXT
    ) WITHOUT ROWID;

    CREATE TABLE taxon (
      master_taxon_id TEXT PRIMARY KEY,
      accepted_scientific_name TEXT NOT NULL,
      rank TEXT NOT NULL,
      kingdom TEXT,
      german_name TEXT,
      english_name TEXT,
      lifecycle_state TEXT NOT NULL,
      reference_state TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) WITHOUT ROWID;

    CREATE TABLE taxon_status (
      master_taxon_id TEXT NOT NULL REFERENCES taxon(master_taxon_id) ON DELETE CASCADE,
      status_name TEXT NOT NULL,
      status_detail TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (master_taxon_id, status_name)
    ) WITHOUT ROWID;

    CREATE TABLE taxon_provider (
      master_taxon_id TEXT NOT NULL REFERENCES taxon(master_taxon_id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_version TEXT NOT NULL,
      provider_record_id TEXT NOT NULL,
      scientific_name TEXT NOT NULL,
      rank TEXT NOT NULL,
      match_state TEXT NOT NULL,
      retrieved_at TEXT NOT NULL,
      PRIMARY KEY (master_taxon_id, provider, provider_record_id)
    ) WITHOUT ROWID;

    CREATE TABLE project_link (
      project_taxon_key TEXT PRIMARY KEY,
      master_taxon_id TEXT NOT NULL REFERENCES taxon(master_taxon_id) ON DELETE CASCADE,
      project_slug TEXT NOT NULL,
      scientific_name_at_link TEXT NOT NULL,
      link_state TEXT NOT NULL
    ) WITHOUT ROWID;

    CREATE TABLE hierarchy (
      master_taxon_id TEXT NOT NULL REFERENCES taxon(master_taxon_id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      rank TEXT NOT NULL,
      scientific_name TEXT NOT NULL,
      source_provider TEXT NOT NULL,
      PRIMARY KEY (master_taxon_id, rank)
    ) WITHOUT ROWID;

    CREATE TABLE search_term (
      search_term_id INTEGER PRIMARY KEY,
      master_taxon_id TEXT NOT NULL REFERENCES taxon(master_taxon_id) ON DELETE CASCADE,
      term TEXT NOT NULL,
      normalized_term TEXT NOT NULL,
      folded_term TEXT NOT NULL,
      german_key TEXT NOT NULL,
      term_kind TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT '',
      source_provider TEXT NOT NULL,
      weight INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE search_fts USING fts5(
      term,
      normalized_term,
      folded_term,
      german_key,
      content='search_term',
      content_rowid='search_term_id',
      tokenize='unicode61 remove_diacritics 2'
    );
  `);
  database.prepare("INSERT INTO package_info (key, value) VALUES ('schemaVersion', ?)")
    .run(String(LIGHTROOM_SEARCH_SCHEMA_VERSION));
}

export function finalizeLightroomSearchSchema(database) {
  database.exec(`
    CREATE INDEX search_term_normalized_idx
      ON search_term(normalized_term, weight, master_taxon_id);
    CREATE INDEX search_term_folded_idx
      ON search_term(folded_term, weight, master_taxon_id);
    CREATE INDEX search_term_german_idx
      ON search_term(german_key, weight, master_taxon_id);
    CREATE INDEX search_term_taxon_idx
      ON search_term(master_taxon_id, term_kind, language);
    CREATE INDEX hierarchy_taxon_idx
      ON hierarchy(master_taxon_id, position);
    CREATE INDEX taxon_provider_taxon_idx
      ON taxon_provider(master_taxon_id, provider);
    CREATE INDEX project_link_master_idx
      ON project_link(master_taxon_id, link_state);
    INSERT INTO search_fts(search_fts) VALUES('rebuild');
    PRAGMA optimize;
  `);
}

export function inspectLightroomSearchDatabase(database, { full = false } = {}) {
  const schemaVersion = Number(scalar(
    database,
    "SELECT value FROM package_info WHERE key = 'schemaVersion'",
  ));
  if (schemaVersion !== LIGHTROOM_SEARCH_SCHEMA_VERSION) {
    throw new Error(
      `Lightroom-Suchpaket-Schemaversion ${schemaVersion || "(fehlt)"} wird nicht unterstützt.`,
    );
  }
  const requiredTables = [
    "provider_release",
    "taxon",
    "taxon_status",
    "taxon_provider",
    "project_link",
    "hierarchy",
    "search_term",
    "search_fts",
  ];
  const available = new Set(database.prepare(`
    SELECT name FROM sqlite_master WHERE type IN ('table', 'view')
  `).all().map((row) => row.name));
  const missing = requiredTables.filter((name) => !available.has(name));
  if (missing.length) {
    throw new Error(`Lightroom-Suchpaket fehlen Tabellen: ${missing.join(", ")}`);
  }
  if (full) {
    const integrity = scalar(database, "PRAGMA integrity_check");
    if (integrity !== "ok") {
      throw new Error(`Lightroom-Suchpaket-Integritätsprüfung fehlgeschlagen: ${integrity}`);
    }
    const foreignKeys = database.prepare("PRAGMA foreign_key_check").all();
    if (foreignKeys.length) {
      throw new Error(
        `Lightroom-Suchpaket enthält ${foreignKeys.length} Fremdschlüsselfehler.`,
      );
    }
  }
  return {
    schemaVersion,
    validationMode: full ? "full" : "schema-only",
    taxonCount: Number(scalar(database, "SELECT COUNT(*) FROM taxon")),
    nameCount: Number(scalar(database, "SELECT COUNT(*) FROM search_term")),
    hierarchyCount: Number(scalar(database, "SELECT COUNT(*) FROM hierarchy")),
    projectTaxonCount: Number(scalar(database, "SELECT COUNT(*) FROM project_link")),
    providerCount: Number(scalar(database, "SELECT COUNT(*) FROM provider_release")),
    statusCount: Number(scalar(database, "SELECT COUNT(*) FROM taxon_status")),
    ftsCount: Number(scalar(database, "SELECT COUNT(*) FROM search_fts")),
  };
}
