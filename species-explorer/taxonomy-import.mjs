import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { iterateTaxonomyTsv, validateTaxonomyFixture } from "./taxonomy-fixture.mjs";
import {
  buildTaxonomySearchIndexes,
  createTaxonomySchema,
  measureTaxonomyDatabase,
  validateTaxonomyDatabase,
} from "./taxonomy-schema.mjs";
import {
  foldTaxonomySearchTerm,
  germanTaxonomySearchKey,
  normalizeTaxonomySearchTerm,
} from "./taxonomy-search-text.mjs";
import {
  atomicWriteJson,
  loadNodeSqlite,
  pruneTaxonomyReleases,
  readActiveTaxonomyPointer,
  taxonomyActivePointerPath,
  taxonomyDatabasePath,
  taxonomyReleaseDirectory,
  writeActiveTaxonomyPointer,
} from "./taxonomy-storage.mjs";

function parseNullableBoolean(value) {
  const normalized = String(value ?? "").trim().toLocaleLowerCase("en");
  if (!normalized) return null;
  if (["true", "1"].includes(normalized)) return 1;
  if (["false", "0"].includes(normalized)) return 0;
  throw new Error(`Ungültiger boolescher Taxonomiewert: ${value}`);
}

function fixtureFingerprint(manifest) {
  const checksums = Object.entries(manifest.files ?? {})
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([fileName, value]) => `${fileName}:${value.sha256}`)
    .join("\n");
  return crypto.createHash("sha256").update(checksums).digest("hex");
}

function reportProgress(onProgress, phase, current, total, message) {
  onProgress?.({ phase, current, total, message });
}

async function withTransaction(database, callback) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = await callback();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // Preserve the original import error.
    }
    throw error;
  }
}

function createDatasetWriter(database, sourceReleaseId) {
  const statement = database.prepare(`
    INSERT INTO source_dataset (
      source_dataset_id, source_release_id, title, trust_tier
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(source_dataset_id) DO UPDATE SET
      trust_tier = CASE
        WHEN source_dataset.trust_tier = excluded.trust_tier
          THEN source_dataset.trust_tier
        ELSE 'mixed'
      END
  `);
  return (sourceDatasetId, trustTier = "mixed") => {
    const id = String(sourceDatasetId || "col-xr-bounded").trim();
    statement.run(id, sourceReleaseId, `CoL-Quelldatensatz ${id}`, trustTier);
    return id;
  };
}

async function importNameUsages(database, fixture, signal, ensureDataset, onProgress) {
  const insert = database.prepare(`
    INSERT INTO raw_name_usage (
      source_id, source_dataset_id, parent_source_id, scientific_name, authorship,
      rank, status, code, extinct, environment, kingdom, alternative_id, trust_tier
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let count = 0;
  for await (const row of iterateTaxonomyTsv(fixture.files["NameUsage.tsv"], { signal })) {
    signal?.throwIfAborted();
    const trustTier = row.colTrustTier || "xr-supplement";
    const sourceDatasetId = ensureDataset(row.sourceID, trustTier);
    insert.run(
      row.ID,
      sourceDatasetId,
      row.parentID || null,
      row.scientificName,
      row.authorship || null,
      row.rank,
      row.status,
      row.code || null,
      parseNullableBoolean(row.extinct),
      row.environment || null,
      row.kingdom || null,
      row.alternativeID || null,
      trustTier,
    );
    count += 1;
    if (count % 25 === 0) {
      reportProgress(
        onProgress,
        "name-usages",
        count,
        fixture.manifest.counts.nameUsages,
        `${count} wissenschaftliche Namen importiert`,
      );
    }
  }
  if (count !== fixture.manifest.counts.nameUsages) {
    throw new Error(`NameUsage-Import endete bei ${count} statt ${fixture.manifest.counts.nameUsages}.`);
  }
  database.exec(`
    INSERT INTO taxon (
      source_id, scientific_name, authorship, rank, status, code, extinct,
      environment, kingdom, source_dataset_id, trust_tier
    )
    SELECT
      source_id, scientific_name, authorship, rank, status, code, extinct,
      environment, kingdom, source_dataset_id, trust_tier
    FROM raw_name_usage
    WHERE status IN ('accepted', 'provisionally accepted');

    UPDATE taxon
    SET parent_id = (
      SELECT parent.id
      FROM raw_name_usage raw
      JOIN taxon parent ON parent.source_id = raw.parent_source_id
      WHERE raw.source_id = taxon.source_id
    );

    INSERT INTO taxon_name (
      source_name_id, taxon_id, scientific_name, authorship, rank, status,
      relationship, source_dataset_id, trust_tier
    )
    SELECT
      taxon.source_id, taxon.id, taxon.scientific_name, taxon.authorship,
      taxon.rank, taxon.status, 'accepted', taxon.source_dataset_id, taxon.trust_tier
    FROM taxon;

    INSERT INTO taxon_name (
      source_name_id, taxon_id, scientific_name, authorship, rank, status,
      relationship, source_dataset_id, trust_tier
    )
    SELECT
      raw.source_id, accepted.id, raw.scientific_name, raw.authorship, raw.rank,
      raw.status, raw.status, raw.source_dataset_id, raw.trust_tier
    FROM raw_name_usage raw
    JOIN taxon accepted ON accepted.source_id = raw.parent_source_id
    WHERE raw.status NOT IN ('accepted', 'provisionally accepted');
  `);
  return count;
}

async function importVernacularNames(database, fixture, signal, ensureDataset) {
  const taxonId = database.prepare("SELECT id, trust_tier FROM taxon WHERE source_id = ?");
  const insert = database.prepare(`
    INSERT INTO vernacular_name (
      source_name_id, taxon_id, name, transliteration, normalized, language,
      preferred, country, area, reference_id, remarks, source_dataset_id, verified
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  let count = 0;
  for await (const row of iterateTaxonomyTsv(fixture.files["VernacularName.tsv"], { signal })) {
    signal?.throwIfAborted();
    const target = taxonId.get(row.taxonID);
    if (!target) throw new Error(`Vernakularname verweist auf unbekanntes Taxon ${row.taxonID}.`);
    const sourceDatasetId = ensureDataset(row.sourceID, target.trust_tier);
    const sourceNameId = [
      row.sourceID || "col",
      row.taxonID,
      row.language,
      row.name,
      count,
    ].join(":");
    insert.run(
      sourceNameId,
      target.id,
      row.name,
      row.transliteration || null,
      normalizeTaxonomySearchTerm(row.name),
      row.language || "und",
      parseNullableBoolean(row.preferred) ?? 0,
      row.country || null,
      row.area || null,
      row.referenceID || null,
      row.remarks || null,
      sourceDatasetId,
    );
    count += 1;
  }
  return count;
}

async function importExternalIdentifiers(database, fixture, signal) {
  const taxonId = database.prepare("SELECT id FROM taxon WHERE source_id = ?");
  const insert = database.prepare(`
    INSERT OR IGNORE INTO external_identifier (
      taxon_id, identifier_type, identifier, source, source_release
    ) VALUES (?, ?, ?, ?, ?)
  `);
  let count = 0;
  for await (const row of iterateTaxonomyTsv(
    fixture.files["ExternalIdentifier.tsv"],
    { signal },
  )) {
    signal?.throwIfAborted();
    const target = taxonId.get(row.taxonID);
    if (!target) continue;
    insert.run(target.id, row.type, row.identifier, row.source, row.release);
    count += 1;
  }
  return count;
}

async function importWormsComparisons(database, fixture, signal) {
  const taxonId = database.prepare("SELECT id FROM taxon WHERE source_id = ?");
  const insert = database.prepare(`
    INSERT INTO worms_comparison (
      taxon_id, aphia_id, scientific_name, accepted_name, authority, rank, status,
      kingdom, phylum, class_name, order_name, family, genus, marine, brackish,
      freshwater, terrestrial, modified, source_url, conflict, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const identifier = database.prepare(`
    INSERT OR IGNORE INTO external_identifier (
      taxon_id, identifier_type, identifier, source, source_release
    ) VALUES (?, 'worms', ?, 'WoRMS', ?)
  `);
  let count = 0;
  for await (const row of iterateTaxonomyTsv(
    fixture.files["WormsComparison.tsv"],
    { signal },
  )) {
    signal?.throwIfAborted();
    const target = taxonId.get(row.taxonID);
    if (!target) throw new Error(`WoRMS-Vergleich verweist auf unbekanntes Taxon ${row.taxonID}.`);
    insert.run(
      target.id,
      Number(row.aphiaID),
      row.scientificName,
      row.acceptedName,
      row.authority || null,
      row.rank || null,
      row.status || null,
      row.kingdom || null,
      row.phylum || null,
      row.class || null,
      row.order || null,
      row.family || null,
      row.genus || null,
      parseNullableBoolean(row.marine),
      parseNullableBoolean(row.brackish),
      parseNullableBoolean(row.freshwater),
      parseNullableBoolean(row.terrestrial),
      row.modified || null,
      row.url || null,
      row.conflict || null,
      row.fetchedAt || null,
    );
    identifier.run(target.id, row.aphiaID, `WoRMS ${row.fetchedAt || "prototype"}`);
    count += 1;
  }
  return count;
}

function buildSearchTerms(database) {
  const insert = database.prepare(`
    INSERT OR IGNORE INTO search_term (
      taxon_id, source_name_id, term, normalized, folded, german_key, term_type,
      language, accepted, preferred, trust_tier, kingdom, sort_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const add = ({
    taxonId,
    sourceNameId,
    term,
    termType,
    language = null,
    accepted = 0,
    preferred = 0,
    trustTier,
    kingdom,
    sortScore,
  }) => {
    const normalized = normalizeTaxonomySearchTerm(term);
    if (!normalized) return;
    insert.run(
      taxonId,
      sourceNameId,
      term,
      normalized,
      foldTaxonomySearchTerm(term),
      germanTaxonomySearchKey(term),
      termType,
      language,
      accepted,
      preferred,
      trustTier,
      kingdom,
      sortScore,
    );
  };
  for (const row of database.prepare(`
    SELECT id, source_id, scientific_name, trust_tier, kingdom
    FROM taxon
  `).all()) {
    add({
      taxonId: row.id,
      sourceNameId: row.source_id,
      term: row.scientific_name,
      termType: "accepted_scientific",
      accepted: 1,
      preferred: 1,
      trustTier: row.trust_tier,
      kingdom: row.kingdom,
      sortScore: 10,
    });
  }
  for (const row of database.prepare(`
    SELECT
      name.taxon_id, name.source_name_id, name.scientific_name,
      name.trust_tier, taxon.kingdom
    FROM taxon_name name
    JOIN taxon ON taxon.id = name.taxon_id
    WHERE name.relationship <> 'accepted'
  `).all()) {
    add({
      taxonId: row.taxon_id,
      sourceNameId: row.source_name_id,
      term: row.scientific_name,
      termType: "scientific_synonym",
      trustTier: row.trust_tier,
      kingdom: row.kingdom,
      sortScore: 30,
    });
  }
  for (const row of database.prepare(`
    SELECT
      name.taxon_id, name.source_name_id, name.name, name.language, name.preferred,
      taxon.trust_tier, taxon.kingdom
    FROM vernacular_name name
    JOIN taxon ON taxon.id = name.taxon_id
  `).all()) {
    add({
      taxonId: row.taxon_id,
      sourceNameId: row.source_name_id,
      term: row.name,
      termType: "vernacular",
      language: row.language,
      preferred: row.preferred,
      trustTier: row.trust_tier,
      kingdom: row.kingdom,
      sortScore: row.preferred ? 20 : 24,
    });
  }
  for (const row of database.prepare(`
    SELECT
      identifier.id, identifier.taxon_id, identifier.identifier_type,
      identifier.identifier, taxon.trust_tier, taxon.kingdom
    FROM external_identifier identifier
    JOIN taxon ON taxon.id = identifier.taxon_id
  `).all()) {
    add({
      taxonId: row.taxon_id,
      sourceNameId: `identifier:${row.id}`,
      term: row.identifier,
      termType: "external_identifier",
      language: row.identifier_type,
      trustTier: row.trust_tier,
      kingdom: row.kingdom,
      sortScore: 40,
    });
  }
}

async function buildDatabase({
  databasePath,
  fixture,
  signal,
  onProgress,
  now,
}) {
  const { DatabaseSync } = await loadNodeSqlite();
  const database = new DatabaseSync(databasePath);
  const startedAt = performance.now();
  const initialRss = process.memoryUsage().rss;
  try {
    createTaxonomySchema(database);
    await withTransaction(database, async () => {
      const release = fixture.manifest.release;
      database.prepare(`
        INSERT INTO source_release (
          source_release_id, source_name, alias, issued, imported_at, format,
          coldp_version, doi, source_url, fixture_sha256, license, bounded_prototype
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        fixture.releaseId,
        release.source,
        release.alias,
        release.issued,
        now().toISOString(),
        release.format,
        release.coldpVersion,
        release.doi || null,
        fixture.manifest.sourceUrls.checklistBank,
        fixtureFingerprint(fixture.manifest),
        fixture.manifest.license,
      );
      const ensureDataset = createDatasetWriter(database, fixture.releaseId);
      reportProgress(onProgress, "name-usages", 0, fixture.manifest.counts.nameUsages, "Import startet");
      await importNameUsages(database, fixture, signal, ensureDataset, onProgress);
      reportProgress(
        onProgress,
        "vernacular-names",
        0,
        fixture.manifest.counts.vernacularNames,
        "Deutsche Namen werden importiert",
      );
      await importVernacularNames(database, fixture, signal, ensureDataset);
      await importExternalIdentifiers(database, fixture, signal);
      await importWormsComparisons(database, fixture, signal);
      buildSearchTerms(database);
    });
    signal?.throwIfAborted();
    reportProgress(onProgress, "indexes", 0, 1, "Suchindizes werden aufgebaut");
    buildTaxonomySearchIndexes(database);
    const validation = validateTaxonomyDatabase(database, fixture.manifest);
    database.exec("DROP TABLE raw_name_usage; VACUUM;");
    const finalIntegrity = database.prepare("PRAGMA integrity_check").get();
    if (finalIntegrity?.integrity_check !== "ok") {
      throw new Error(`Finale SQLite-Integritätsprüfung fehlgeschlagen: ${finalIntegrity?.integrity_check}`);
    }
    const measurements = measureTaxonomyDatabase(database);
    return {
      validation,
      measurements,
      importDurationMs: Number((performance.now() - startedAt).toFixed(2)),
      peakRssEstimateBytes: Math.max(initialRss, process.memoryUsage().rss),
      rssIncreaseEstimateBytes: Math.max(0, process.memoryUsage().rss - initialRss),
    };
  } finally {
    database.close();
  }
}

export async function importTaxonomyPrototype({
  fixtureDirectory,
  taxonomyRoot,
  activate = true,
  signal,
  onProgress,
  now = () => new Date(),
  operationId = crypto.randomUUID(),
} = {}) {
  if (!fixtureDirectory || !taxonomyRoot) {
    throw new Error("Fixture-Verzeichnis und Taxonomie-Zielpfad sind erforderlich.");
  }
  const fixture = await validateTaxonomyFixture(fixtureDirectory, { signal });
  const root = path.resolve(taxonomyRoot);
  const releaseDirectory = taxonomyReleaseDirectory(root, fixture.releaseId);
  const stagingDirectory = path.join(root, "staging", `${fixture.releaseId}-${operationId}`);
  const stagingDatabase = path.join(stagingDirectory, "taxonomy.sqlite.tmp");
  const existingPointer = await readActiveTaxonomyPointer(root);
  let releaseCreated = false;
  let pointerActivated = false;
  try {
    signal?.throwIfAborted();
    try {
      await fs.access(releaseDirectory);
      throw new Error(`Taxonomie-Release ${fixture.releaseId} ist bereits unveränderlich installiert.`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await fs.mkdir(stagingDirectory, { recursive: true });
    const build = await buildDatabase({
      databasePath: stagingDatabase,
      fixture,
      signal,
      onProgress,
      now,
    });
    signal?.throwIfAborted();
    const sourceStats = await fs.stat(stagingDatabase);
    const releaseManifest = {
      schemaVersion: 1,
      importerVersion: 1,
      releaseId: fixture.releaseId,
      source: fixture.manifest.release,
      baseRelease: fixture.manifest.baseRelease,
      importedAt: now().toISOString(),
      boundedPrototype: true,
      sourceUrls: fixture.manifest.sourceUrls,
      license: fixture.manifest.license,
      fixtureFingerprint: fixtureFingerprint(fixture.manifest),
      sourceBytes: fixture.sourceBytes,
      databaseBytes: sourceStats.size,
      importDurationMs: build.importDurationMs,
      peakRssEstimateBytes: build.peakRssEstimateBytes,
      rssIncreaseEstimateBytes: build.rssIncreaseEstimateBytes,
      measurements: build.measurements,
      counts: build.validation,
      testQueries: fixture.manifest.testQueries,
      validation: {
        integrity: "ok",
        foreignKeys: "ok",
        hierarchyCycles: "none",
        representativeTaxa: "ok",
      },
    };
    await fs.mkdir(path.dirname(releaseDirectory), { recursive: true });
    await fs.rename(stagingDirectory, releaseDirectory);
    releaseCreated = true;
    await fs.rename(
      path.join(releaseDirectory, "taxonomy.sqlite.tmp"),
      taxonomyDatabasePath(root, fixture.releaseId),
    );
    await atomicWriteJson(path.join(releaseDirectory, "manifest.json"), releaseManifest);
    let pointer = existingPointer;
    if (activate) {
      pointer = await writeActiveTaxonomyPointer(root, {
        activeRelease: fixture.releaseId,
        previousRelease: existingPointer?.activeRelease ?? null,
      }, now);
      pointerActivated = true;
      await pruneTaxonomyReleases(root, [
        pointer.activeRelease,
        pointer.previousRelease,
      ]);
    }
    reportProgress(onProgress, "complete", 1, 1, "Taxonomie-Prototyp ist geprüft");
    return {
      releaseId: fixture.releaseId,
      releaseDirectory,
      databasePath: taxonomyDatabasePath(root, fixture.releaseId),
      active: activate,
      pointer,
      manifest: releaseManifest,
    };
  } catch (error) {
    if (pointerActivated) {
      try {
        if (existingPointer) {
          await writeActiveTaxonomyPointer(root, existingPointer, now);
        } else {
          await fs.rm(taxonomyActivePointerPath(root), { force: true });
        }
        pointerActivated = false;
      } catch (restoreError) {
        throw new AggregateError(
          [error, restoreError],
          "Taxonomieimport und Wiederherstellung der vorherigen Aktivierung sind fehlgeschlagen.",
        );
      }
    }
    if (
      releaseCreated
      && !pointerActivated
      && existingPointer?.activeRelease !== fixture.releaseId
    ) {
      await fs.rm(releaseDirectory, { recursive: true, force: true });
    }
    throw error;
  } finally {
    await fs.rm(stagingDirectory, { recursive: true, force: true });
  }
}

export async function rollbackTaxonomyRelease(
  taxonomyRoot,
  { now = () => new Date() } = {},
) {
  const root = path.resolve(taxonomyRoot);
  const pointer = await readActiveTaxonomyPointer(root);
  if (!pointer?.previousRelease) {
    throw new Error("Keine geprüfte Taxonomie-Rollbackversion ist vorhanden.");
  }
  await fs.access(taxonomyDatabasePath(root, pointer.previousRelease));
  const rolledBack = await writeActiveTaxonomyPointer(root, {
    activeRelease: pointer.previousRelease,
    previousRelease: pointer.activeRelease,
  }, now);
  await pruneTaxonomyReleases(root, [
    rolledBack.activeRelease,
    rolledBack.previousRelease,
  ]);
  return rolledBack;
}
