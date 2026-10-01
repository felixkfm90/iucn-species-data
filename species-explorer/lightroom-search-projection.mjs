import { readIdentityRegistry } from "./taxonomy-identity-registry.mjs";

export const RANK_POSITIONS = Object.freeze({
  domain: 10,
  superkingdom: 20,
  kingdom: 30,
  subkingdom: 40,
  infrakingdom: 50,
  superphylum: 60,
  phylum: 70,
  subphylum: 80,
  infraphylum: 90,
  parvphylum: 100,
  superclass: 110,
  megaclass: 115,
  class: 120,
  subclass: 130,
  infraclass: 140,
  parvclass: 150,
  superorder: 160,
  order: 170,
  suborder: 180,
  infraorder: 190,
  parvorder: 200,
  superfamily: 210,
  family: 220,
  subfamily: 230,
  tribe: 240,
  subtribe: 250,
  genus: 260,
  subgenus: 270,
  section: 280,
  species: 290,
  subspecies: 300,
  variety: 310,
  form: 320,
});

export function rankPositionSql(fieldExpression = "hierarchy.key") {
  const clauses = Object.entries(RANK_POSITIONS)
    .map(([rank, position]) => `WHEN '${rank}' THEN ${position}`)
    .join(" ");
  return `CASE lower(${fieldExpression}) ${clauses} ELSE 500 END`;
}

function providerPrioritySql() {
  return `CASE release.provider
    WHEN 'manual' THEN 0
    WHEN 'project' THEN 1
    WHEN 'catalogue-of-life' THEN 2
    WHEN 'worms' THEN 3
    WHEN 'gbif' THEN 4
    WHEN 'inaturalist' THEN 5
    WHEN 'wikidata' THEN 6
    WHEN 'animalia' THEN 7
    ELSE 8 END`;
}

export function populateLightroomSearchDatabase(database, sourcePath, metadata, { partial = false } = {}) {
  database.prepare("ATTACH DATABASE ? AS master").run(sourcePath);
  let transactionOpen = false;
  try {
    database.exec("BEGIN IMMEDIATE");
    transactionOpen = true;
    database.prepare("INSERT INTO package_info (key, value) VALUES ('identityRegistry', ?)")
      .run(JSON.stringify(readIdentityRegistry(database, "master")));
    database.prepare("INSERT INTO package_info (key, value) VALUES ('packageId', ?)")
      .run(metadata.packageId);
    database.prepare("INSERT INTO package_info (key, value) VALUES ('masterVersion', ?)")
      .run(metadata.masterVersion);
    database.prepare("INSERT INTO package_info (key, value) VALUES ('generatedAt', ?)")
      .run(metadata.generatedAt);
    database.prepare("INSERT INTO package_info (key, value) VALUES ('projectRevision', ?)")
      .run(metadata.projectRevision);
    for (const key of ["sourceChecksum", "exportContract"]) {
      database.prepare("INSERT INTO package_info (key, value) VALUES (?, ?)").run(key, metadata[key]);
    }
    database.exec(`
      INSERT INTO provider_release (
        provider, provider_version, issued_at, imported_at, source_url, license
      )
      SELECT provider, provider_version, issued_at, imported_at, source_url, license
      FROM master.provider_release
      WHERE release_state = 'active';

      INSERT INTO taxon (
        master_taxon_id, accepted_scientific_name, rank, kingdom,
        german_name, english_name, lifecycle_state, reference_state, updated_at
      )
      SELECT taxon.master_taxon_id, taxon.canonical_scientific_name, taxon.rank,
        taxon.kingdom,
        (
          SELECT field.field_value FROM master.master_field_assertion field
          WHERE field.master_taxon_id = taxon.master_taxon_id
            AND field.field_name = 'german-name' AND field.language = 'de'
            AND field.selected = 1 LIMIT 1
        ),
        (
          SELECT field.field_value FROM master.master_field_assertion field
          WHERE field.master_taxon_id = taxon.master_taxon_id
            AND field.field_name = 'english-name' AND field.language = 'en'
            AND field.selected = 1 LIMIT 1
        ),
        taxon.lifecycle_state, taxon.reference_state, taxon.updated_at
      FROM master.master_taxon taxon
      WHERE taxon.lifecycle_state != 'deprecated'
        ${partial ? 'AND taxon.master_taxon_id IN (SELECT master_taxon_id FROM delta_scope)' : ''};

      INSERT INTO taxon_status (
        master_taxon_id, status_name, status_detail, updated_at
      )
      SELECT status.master_taxon_id, status.status_name, status.status_detail,
        status.updated_at
      FROM master.master_taxon_status status
      JOIN taxon ON taxon.master_taxon_id = status.master_taxon_id
      WHERE status.status_name != 'conflicting'
        OR EXISTS (
          SELECT 1
          FROM master.master_conflict conflict
          WHERE conflict.master_taxon_id = status.master_taxon_id
            AND conflict.conflict_state = 'open'
            AND conflict.conflict_type IN (
              'changed-value', 'source-removed', 'ambiguous-match'
            )
        );

      INSERT INTO project_link (
        project_taxon_key, master_taxon_id, project_slug,
        scientific_name_at_link, link_state
      )
      SELECT project.project_taxon_key, project.master_taxon_id, project.project_slug,
        project.scientific_name_at_link, project.link_state
      FROM master.project_taxon_link project
      JOIN taxon ON taxon.master_taxon_id = project.master_taxon_id;

      INSERT OR IGNORE INTO taxon_provider (
        master_taxon_id, provider, provider_version, provider_record_id,
        scientific_name, rank, match_state, retrieved_at
      )
      SELECT source.master_taxon_id, release.provider, release.provider_version,
        source.provider_record_id, source.scientific_name, source.rank,
        source.match_state, source.retrieved_at
      FROM master.provider_taxon_assertion source
      JOIN master.provider_release release ON release.release_id = source.release_id
      JOIN taxon ON taxon.master_taxon_id = source.master_taxon_id
      WHERE release.release_state = 'active'
        AND source.version_change_state != 'removed';

      WITH preferred_hierarchy AS (
        SELECT source.master_taxon_id, source.hierarchy_json, release.provider,
          ROW_NUMBER() OVER (
            PARTITION BY source.master_taxon_id
            ORDER BY ${providerPrioritySql()},
              CASE source.match_state WHEN 'exact' THEN 0 WHEN 'reference-gap' THEN 1 ELSE 2 END,
              source.assertion_id
          ) AS hierarchy_priority
        FROM master.provider_taxon_assertion source
        JOIN master.provider_release release ON release.release_id = source.release_id
        JOIN taxon ON taxon.master_taxon_id = source.master_taxon_id
        WHERE release.release_state = 'active'
          AND source.version_change_state != 'removed'
          AND source.hierarchy_json != ''
          AND json_valid(source.hierarchy_json)
      )
      INSERT OR IGNORE INTO hierarchy (
        master_taxon_id, position, rank, scientific_name, source_provider
      )
      SELECT preferred.master_taxon_id, ${rankPositionSql()}, lower(hierarchy.key),
        trim(CAST(hierarchy.value AS TEXT)), preferred.provider
      FROM preferred_hierarchy preferred, json_each(preferred.hierarchy_json) hierarchy
      WHERE preferred.hierarchy_priority = 1
        AND hierarchy.type = 'text'
        AND trim(CAST(hierarchy.value AS TEXT)) != '';

      INSERT OR REPLACE INTO hierarchy (
        master_taxon_id, position, rank, scientific_name, source_provider
      )
      SELECT field.master_taxon_id, ${rankPositionSql("field.field_name")},
        lower(field.field_name), trim(field.field_value), release.provider
      FROM master.master_field_assertion field
      JOIN master.provider_release release ON release.release_id = field.release_id
      JOIN taxon ON taxon.master_taxon_id = field.master_taxon_id
      WHERE field.selected = 1
        AND lower(field.field_name) IN (
          'domain', 'superkingdom', 'kingdom', 'subkingdom', 'infrakingdom',
          'superphylum', 'phylum', 'subphylum', 'infraphylum', 'parvphylum',
          'superclass', 'class', 'subclass', 'infraclass', 'parvclass', 'megaclass',
          'superorder', 'order', 'suborder', 'infraorder', 'parvorder',
          'superfamily', 'family', 'subfamily', 'tribe', 'subtribe',
          'genus', 'subgenus', 'species'
        )
        AND trim(field.field_value) != '';

      INSERT INTO search_term (
        search_term_id, master_taxon_id, term, normalized_term, folded_term,
        german_key, term_kind, language, source_provider, weight
      )
      SELECT term.search_term_id, term.master_taxon_id, term.term,
        term.normalized_term, term.folded_term, term.german_key, term.term_kind,
        term.language, term.source_provider, term.weight
      FROM master.master_search_term term
      JOIN taxon ON taxon.master_taxon_id = term.master_taxon_id;
    `);
    database.exec("COMMIT");
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("DETACH DATABASE master");
  }
}
