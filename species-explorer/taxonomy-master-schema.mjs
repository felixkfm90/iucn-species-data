import { TAXONOMY_MASTER_SCHEMA_VERSION } from "./taxonomy-master-storage.mjs";

export const TAXONOMY_MASTER_PROVIDERS = Object.freeze([
  "catalogue-of-life",
  "inaturalist",
  "gbif",
  "worms",
  "wikidata",
  "manual",
  "project",
]);

function scalar(database, sql, ...params) {
  const row = database.prepare(sql).get(...params);
  return row ? Object.values(row)[0] : null;
}

export function createTaxonomyMasterSchema(database) {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = DELETE;
    PRAGMA synchronous = FULL;

    CREATE TABLE master_schema_info (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) WITHOUT ROWID;

    CREATE TABLE provider_release (
      release_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL CHECK (
        provider IN (
          'catalogue-of-life',
          'inaturalist',
          'gbif',
          'worms',
          'wikidata',
          'manual',
          'project'
        )
      ),
      provider_version TEXT NOT NULL,
      data_scope TEXT NOT NULL CHECK (
        data_scope IN ('full', 'relevant-slice', 'manual', 'project')
      ),
      release_state TEXT NOT NULL CHECK (
        release_state IN ('staging', 'active', 'previous', 'archived', 'failed')
      ),
      issued_at TEXT,
      imported_at TEXT NOT NULL,
      source_url TEXT,
      checksum_sha256 TEXT,
      license TEXT,
      record_count INTEGER NOT NULL DEFAULT 0 CHECK (record_count >= 0),
      metadata_json TEXT NOT NULL DEFAULT '{}',
      UNIQUE (provider, provider_version)
    ) WITHOUT ROWID;

    CREATE UNIQUE INDEX provider_release_active_idx
      ON provider_release(provider)
      WHERE release_state = 'active';

    CREATE UNIQUE INDEX provider_release_previous_idx
      ON provider_release(provider)
      WHERE release_state = 'previous';

    CREATE TABLE master_taxon (
      master_taxon_id TEXT PRIMARY KEY,
      canonical_scientific_name TEXT NOT NULL,
      canonical_name_normalized TEXT NOT NULL,
      rank TEXT NOT NULL,
      kingdom TEXT,
      lifecycle_state TEXT NOT NULL DEFAULT 'active' CHECK (
        lifecycle_state IN ('active', 'stale', 'deprecated')
      ),
      reference_state TEXT NOT NULL CHECK (
        reference_state IN ('exact-col', 'reference-gap', 'external-only', 'manual')
      ),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) WITHOUT ROWID;

    CREATE INDEX master_taxon_name_idx
      ON master_taxon(canonical_name_normalized, rank, kingdom);

    CREATE TABLE master_taxon_status (
      master_taxon_id TEXT NOT NULL
        REFERENCES master_taxon(master_taxon_id) ON DELETE CASCADE,
      status_name TEXT NOT NULL CHECK (
        status_name IN (
          'col-confirmed',
          'col-reference-gap',
          'externally-confirmed',
          'conflicting',
          'stale',
          'manually-protected'
        )
      ),
      status_detail TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (master_taxon_id, status_name)
    ) WITHOUT ROWID;

    CREATE TABLE provider_taxon_assertion (
      assertion_id INTEGER PRIMARY KEY,
      release_id TEXT NOT NULL REFERENCES provider_release(release_id),
      provider_record_id TEXT NOT NULL,
      master_taxon_id TEXT REFERENCES master_taxon(master_taxon_id),
      parent_provider_record_id TEXT,
      accepted_provider_record_id TEXT,
      scientific_name TEXT NOT NULL,
      scientific_name_normalized TEXT NOT NULL,
      rank TEXT NOT NULL,
      taxonomic_status TEXT,
      kingdom TEXT,
      match_state TEXT NOT NULL DEFAULT 'unlinked' CHECK (
        match_state IN (
          'unlinked',
          'exact',
          'synonym',
          'reference-gap',
          'conflict',
          'stale'
        )
      ),
      payload_sha256 TEXT,
      hierarchy_json TEXT NOT NULL DEFAULT '{}',
      retrieved_at TEXT NOT NULL,
      version_change_state TEXT NOT NULL DEFAULT 'new' CHECK (
        version_change_state IN ('new', 'unchanged', 'changed', 'removed', 'restored')
      ),
      imported_at TEXT NOT NULL,
      UNIQUE (release_id, provider_record_id),
      CHECK (match_state IN ('unlinked', 'conflict') OR master_taxon_id IS NOT NULL)
    );

    CREATE INDEX provider_taxon_master_idx
      ON provider_taxon_assertion(master_taxon_id, match_state);

    CREATE INDEX provider_taxon_name_idx
      ON provider_taxon_assertion(scientific_name_normalized, rank, kingdom);

    CREATE TABLE provider_slice_membership (
      provider_taxon_assertion_id INTEGER NOT NULL
        REFERENCES provider_taxon_assertion(assertion_id) ON DELETE CASCADE,
      relevance_reason TEXT NOT NULL CHECK (
        relevance_reason IN (
          'project-species',
          'col-reference-gap',
          'missing-name',
          'missing-hierarchy',
          'searched-taxon',
          'manual-correction'
        )
      ),
      observed_at TEXT NOT NULL,
      PRIMARY KEY (provider_taxon_assertion_id, relevance_reason)
    ) WITHOUT ROWID;

    CREATE TABLE provider_name_assertion (
      assertion_id INTEGER PRIMARY KEY,
      provider_taxon_assertion_id INTEGER NOT NULL
        REFERENCES provider_taxon_assertion(assertion_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT '',
      name_kind TEXT NOT NULL CHECK (
        name_kind IN ('scientific', 'synonym', 'vernacular', 'label')
      ),
      preferred INTEGER NOT NULL DEFAULT 0 CHECK (preferred IN (0, 1)),
      verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
      UNIQUE (
        provider_taxon_assertion_id,
        normalized_name,
        language,
        name_kind
      )
    );

    CREATE INDEX provider_name_lookup_idx
      ON provider_name_assertion(normalized_name, language, name_kind);

    CREATE TABLE master_taxon_alias (
      alias_id INTEGER PRIMARY KEY,
      master_taxon_id TEXT NOT NULL
        REFERENCES master_taxon(master_taxon_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      rank TEXT,
      kingdom TEXT,
      alias_type TEXT NOT NULL CHECK (
        alias_type IN ('former-name', 'synonym', 'project-name')
      ),
      source_assertion_id INTEGER
        REFERENCES provider_taxon_assertion(assertion_id),
      UNIQUE (master_taxon_id, normalized_name, alias_type)
    );

    CREATE INDEX master_taxon_alias_lookup_idx
      ON master_taxon_alias(normalized_name, rank, kingdom);

    CREATE TABLE master_field_assertion (
      assertion_id INTEGER PRIMARY KEY,
      master_taxon_id TEXT NOT NULL
        REFERENCES master_taxon(master_taxon_id) ON DELETE CASCADE,
      field_name TEXT NOT NULL,
      field_value TEXT NOT NULL,
      normalized_value TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT '',
      origin_kind TEXT NOT NULL CHECK (
        origin_kind IN ('source', 'manual', 'project')
      ),
      provider_taxon_assertion_id INTEGER
        REFERENCES provider_taxon_assertion(assertion_id),
      release_id TEXT NOT NULL REFERENCES provider_release(release_id),
      confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
      review_state TEXT NOT NULL CHECK (
        review_state IN ('pending', 'accepted', 'rejected', 'superseded', 'conflict')
      ),
      selected INTEGER NOT NULL DEFAULT 0 CHECK (selected IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (
        (origin_kind = 'source' AND provider_taxon_assertion_id IS NOT NULL)
        OR (
          origin_kind IN ('manual', 'project')
          AND provider_taxon_assertion_id IS NULL
        )
      ),
      CHECK (selected = 0 OR review_state = 'accepted')
    );

    CREATE INDEX master_field_taxon_idx
      ON master_field_assertion(master_taxon_id, field_name, language, review_state);

    CREATE UNIQUE INDEX master_field_selected_idx
      ON master_field_assertion(master_taxon_id, field_name, language)
      WHERE selected = 1;

    CREATE TABLE master_conflict (
      conflict_id TEXT PRIMARY KEY,
      master_taxon_id TEXT NOT NULL
        REFERENCES master_taxon(master_taxon_id) ON DELETE CASCADE,
      field_name TEXT,
      current_assertion_id INTEGER
        REFERENCES master_field_assertion(assertion_id),
      candidate_assertion_id INTEGER
        REFERENCES master_field_assertion(assertion_id),
      conflict_type TEXT NOT NULL CHECK (
        conflict_type IN (
          'changed-value',
          'source-removed',
          'ambiguous-match',
          'reference-gap',
          'reference-returned'
        )
      ),
      conflict_state TEXT NOT NULL DEFAULT 'open' CHECK (
        conflict_state IN (
          'open',
          'resolved-keep',
          'resolved-accept',
          'resolved-manual',
          'dismissed'
        )
      ),
      detected_at TEXT NOT NULL,
      resolved_at TEXT,
      resolution_note TEXT
    ) WITHOUT ROWID;

    CREATE INDEX master_conflict_open_idx
      ON master_conflict(conflict_state, master_taxon_id, conflict_type);

    CREATE TABLE project_taxon_link (
      project_taxon_key TEXT PRIMARY KEY,
      master_taxon_id TEXT NOT NULL
        REFERENCES master_taxon(master_taxon_id),
      project_slug TEXT NOT NULL,
      scientific_name_at_link TEXT NOT NULL,
      link_state TEXT NOT NULL CHECK (
        link_state IN ('linked', 'pending', 'conflict')
      ),
      linked_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (master_taxon_id, project_taxon_key)
    ) WITHOUT ROWID;

    CREATE INDEX project_taxon_master_idx
      ON project_taxon_link(master_taxon_id, link_state);

    CREATE TABLE master_decision (
      decision_id TEXT PRIMARY KEY,
      master_taxon_id TEXT NOT NULL
        REFERENCES master_taxon(master_taxon_id) ON DELETE CASCADE,
      conflict_id TEXT REFERENCES master_conflict(conflict_id),
      field_name TEXT,
      language TEXT NOT NULL DEFAULT '',
      decision_type TEXT NOT NULL CHECK (
        decision_type IN ('keep-current', 'accept-candidate', 'add-alias', 'protect-manual')
      ),
      selected_assertion_id INTEGER REFERENCES master_field_assertion(assertion_id),
      decided_at TEXT NOT NULL,
      note TEXT
    ) WITHOUT ROWID;
  `);
  database.prepare(`
    INSERT INTO master_schema_info (key, value)
    VALUES ('schemaVersion', ?)
  `).run(String(TAXONOMY_MASTER_SCHEMA_VERSION));
}

export function validateTaxonomyMasterDatabase(database) {
  const integrity = scalar(database, "PRAGMA integrity_check");
  if (integrity !== "ok") {
    throw new Error(`Masterdatenbank-Integritätsprüfung fehlgeschlagen: ${integrity}`);
  }
  const foreignKeyErrors = database.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeyErrors.length) {
    throw new Error(
      `Masterdatenbank-Fremdschlüsselprüfung meldet ${foreignKeyErrors.length} Fehler.`,
    );
  }
  const schemaVersion = Number(scalar(
    database,
    "SELECT value FROM master_schema_info WHERE key = 'schemaVersion'",
  ));
  if (schemaVersion !== TAXONOMY_MASTER_SCHEMA_VERSION) {
    throw new Error(
      `Masterdatenbank-Schemaversion ${schemaVersion || "(fehlt)"} wird nicht unterstützt.`,
    );
  }
  const invalidSelectedFields = Number(scalar(database, `
    SELECT COUNT(*)
    FROM master_field_assertion
    WHERE selected = 1
      AND review_state != 'accepted'
  `));
  if (invalidSelectedFields) {
    throw new Error(
      `${invalidSelectedFields} ausgewählte Masterfelder besitzen keinen zulässigen Prüfstatus.`,
    );
  }
  const mismatchedSourceReleases = Number(scalar(database, `
    SELECT COUNT(*)
    FROM master_field_assertion field
    JOIN provider_taxon_assertion source
      ON source.assertion_id = field.provider_taxon_assertion_id
    WHERE field.origin_kind = 'source'
      AND field.release_id != source.release_id
  `));
  if (mismatchedSourceReleases) {
    throw new Error(
      `${mismatchedSourceReleases} Masterfelder verweisen auf eine unpassende Quellenversion.`,
    );
  }
  const exactColWithoutSource = Number(scalar(database, `
    SELECT COUNT(*)
    FROM master_taxon master
    WHERE master.reference_state = 'exact-col'
      AND NOT EXISTS (
        SELECT 1
        FROM provider_taxon_assertion assertion
        JOIN provider_release release ON release.release_id = assertion.release_id
        WHERE assertion.master_taxon_id = master.master_taxon_id
          AND assertion.match_state = 'exact'
          AND release.provider = 'catalogue-of-life'
          AND release.release_state = 'active'
      )
  `));
  if (exactColWithoutSource) {
    throw new Error(
      `${exactColWithoutSource} Mastertaxa behaupten eine exakte CoL-Referenz ohne aktive Quellenzeile.`,
    );
  }
  const invalidProviderSnapshots = Number(scalar(database, `
    SELECT COUNT(*)
    FROM provider_taxon_assertion
    WHERE retrieved_at = '' OR hierarchy_json = ''
  `));
  if (invalidProviderSnapshots) {
    throw new Error(
      `${invalidProviderSnapshots} Anbieter-Ausschnitte besitzen keinen Abrufzeitpunkt oder keine Hierarchieprovenienz.`,
    );
  }
  return {
    sourceReleases: Number(scalar(database, "SELECT COUNT(*) FROM provider_release")),
    masterTaxa: Number(scalar(database, "SELECT COUNT(*) FROM master_taxon")),
    sourceTaxa: Number(scalar(database, "SELECT COUNT(*) FROM provider_taxon_assertion")),
    sourceNames: Number(scalar(database, "SELECT COUNT(*) FROM provider_name_assertion")),
    fieldAssertions: Number(scalar(database, "SELECT COUNT(*) FROM master_field_assertion")),
    openConflicts: Number(scalar(
      database,
      "SELECT COUNT(*) FROM master_conflict WHERE conflict_state = 'open'",
    )),
    projectLinks: Number(scalar(database, "SELECT COUNT(*) FROM project_taxon_link")),
    statuses: Number(scalar(database, "SELECT COUNT(*) FROM master_taxon_status")),
    sliceMemberships: Number(scalar(
      database,
      "SELECT COUNT(*) FROM provider_slice_membership",
    )),
    decisions: Number(scalar(database, "SELECT COUNT(*) FROM master_decision")),
  };
}
