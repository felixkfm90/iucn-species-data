import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  createLightroomSearchSchema,
  finalizeLightroomSearchSchema,
  inspectLightroomSearchDatabase,
} from "./lightroom-search-schema.mjs";
import {
  LIGHTROOM_SEARCH_SCHEMA_VERSION,
  lightroomSearchDatabasePath,
  lightroomSearchManifestPath,
  prepareLightroomSearchStaging,
  readLightroomSearchManifest,
  sha256File,
} from "./lightroom-search-storage.mjs";
import {
  taxonomyMasterDatabasePath,
  taxonomyMasterManifestPath,
} from "./taxonomy-master-storage.mjs";
import { atomicWriteJson, loadNodeSqlite } from "./taxonomy-storage.mjs";

const RANK_POSITIONS = Object.freeze({
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

function cleanText(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function packageId(masterVersion, now) {
  const source = `${masterVersion}|${now.toISOString()}|${crypto.randomUUID()}`;
  return `lightroom-${crypto.createHash("sha256").update(source).digest("hex").slice(0, 20)}`;
}

function rankPositionSql(fieldExpression = "hierarchy.key") {
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

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function populateLightroomSearchDatabase(database, sourcePath, metadata) {
  database.prepare("ATTACH DATABASE ? AS master").run(sourcePath);
  let transactionOpen = false;
  try {
    database.exec("BEGIN IMMEDIATE");
    transactionOpen = true;
    database.prepare("INSERT INTO package_info (key, value) VALUES ('packageId', ?)")
      .run(metadata.packageId);
    database.prepare("INSERT INTO package_info (key, value) VALUES ('masterVersion', ?)")
      .run(metadata.masterVersion);
    database.prepare("INSERT INTO package_info (key, value) VALUES ('generatedAt', ?)")
      .run(metadata.generatedAt);
    database.prepare("INSERT INTO package_info (key, value) VALUES ('projectRevision', ?)")
      .run(metadata.projectRevision);
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
      WHERE taxon.lifecycle_state != 'deprecated';

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

export async function buildLightroomSearchPackage({
  taxonomyRoot,
  searchRoot,
  projectRevision = "unbekannt",
  now = () => new Date(),
  signal,
  onProgress = () => {},
} = {}) {
  if (!taxonomyRoot || !searchRoot) {
    throw new Error("Taxonomie- und Lightroom-Suchpaketpfad sind erforderlich.");
  }
  signal?.throwIfAborted();
  const sourcePath = taxonomyMasterDatabasePath(taxonomyRoot, "active");
  const sourceStats = await fs.stat(sourcePath).catch((error) => {
    if (error?.code === "ENOENT") {
      throw new Error("Es ist keine aktive Taxonomie-Masterdatenbank installiert.", {
        cause: error,
      });
    }
    throw error;
  });
  if (!sourceStats.isFile() || sourceStats.size <= 0) {
    throw new Error("Die aktive Taxonomie-Masterdatenbank ist leer oder ungültig.");
  }
  const masterManifest = await readJson(
    taxonomyMasterManifestPath(taxonomyRoot, "active"),
  ).catch((error) => {
    throw new Error(`Das aktive Mastermanifest ist ungültig: ${error.message}`, {
      cause: error,
    });
  });
  const generatedAt = now().toISOString();
  const masterVersion = cleanText(masterManifest.candidateId || masterManifest.masterVersion);
  if (!masterVersion) throw new Error("Aktive Masterversion fehlt im Mastermanifest.");
  await prepareLightroomSearchStaging(searchRoot);
  const targetPath = lightroomSearchDatabasePath(searchRoot, "staging");
  const metadata = {
    packageId: packageId(masterVersion, new Date(generatedAt)),
    generatedAt,
    projectRevision: cleanText(projectRevision) || "unbekannt",
    masterVersion,
    masterActivatedAt: cleanText(masterManifest.activatedAt),
  };
  const { DatabaseSync } = await loadNodeSqlite();
  let database;
  try {
    onProgress({ phase: "schema", percent: 5, message: "Suchpaketschema wird angelegt." });
    database = new DatabaseSync(targetPath);
    createLightroomSearchSchema(database);
    signal?.throwIfAborted();
    onProgress({ phase: "copy", percent: 15, message: "Mastertaxa und Namen werden exportiert." });
    populateLightroomSearchDatabase(database, sourcePath, metadata);
    signal?.throwIfAborted();
    onProgress({ phase: "index", percent: 70, message: "Suchindizes werden aufgebaut." });
    finalizeLightroomSearchSchema(database);
    onProgress({ phase: "validate", percent: 88, message: "Suchpaket wird vollständig geprüft." });
    const counts = inspectLightroomSearchDatabase(database, { full: true });
    database.close();
    database = null;
    const stats = await fs.stat(targetPath);
    const checksum = await sha256File(targetPath, { signal });
    const manifest = {
      schemaVersion: LIGHTROOM_SEARCH_SCHEMA_VERSION,
      packageId: metadata.packageId,
      state: "staging",
      generatedAt,
      projectRevision: metadata.projectRevision,
      masterVersion,
      masterActivatedAt: metadata.masterActivatedAt || null,
      taxonCount: counts.taxonCount,
      nameCount: counts.nameCount,
      hierarchyCount: counts.hierarchyCount,
      projectTaxonCount: counts.projectTaxonCount,
      providerCount: counts.providerCount,
      databaseBytes: stats.size,
      checksum: `sha256:${checksum}`,
    };
    await atomicWriteJson(lightroomSearchManifestPath(searchRoot, "staging"), manifest);
    onProgress({ phase: "complete", percent: 100, message: "Suchpaket ist geprüft." });
    return manifest;
  } catch (error) {
    database?.close();
    throw error;
  }
}

export async function verifyLightroomSearchPackage({
  searchRoot,
  slot = "active",
  verifyChecksum = true,
  full = true,
  signal,
} = {}) {
  const manifest = await readLightroomSearchManifest(searchRoot, slot);
  if (!manifest) throw new Error(`Lightroom-Suchpaket ${slot} ist nicht installiert.`);
  if (manifest.schemaVersion !== LIGHTROOM_SEARCH_SCHEMA_VERSION) {
    throw new Error(`Manifest-Schemaversion ${manifest.schemaVersion} wird nicht unterstützt.`);
  }
  const databasePath = lightroomSearchDatabasePath(searchRoot, slot);
  const { DatabaseSync } = await loadNodeSqlite();
  const database = new DatabaseSync(databasePath, { readOnly: true });
  let counts;
  try {
    counts = inspectLightroomSearchDatabase(database, { full });
  } finally {
    database.close();
  }
  for (const key of ["taxonCount", "nameCount", "hierarchyCount", "projectTaxonCount"] ) {
    if (Number(manifest[key]) !== counts[key]) {
      throw new Error(
        `Lightroom-Suchpaketzähler ${key} stimmt nicht: Manifest ${manifest[key]}, Datenbank ${counts[key]}.`,
      );
    }
  }
  let checksumVerified = false;
  if (verifyChecksum) {
    signal?.throwIfAborted();
    const expected = String(manifest.checksum ?? "").replace(/^sha256:/, "");
    const actual = await sha256File(databasePath, { signal });
    if (!expected || actual !== expected) {
      throw new Error("Prüfsumme des Lightroom-Suchpakets stimmt nicht.");
    }
    checksumVerified = true;
  }
  return { manifest, counts, checksumVerified, databasePath };
}

export const lightroomSearchPackageInternals = Object.freeze({
  RANK_POSITIONS,
  packageId,
  populateLightroomSearchDatabase,
  rankPositionSql,
});
