import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { iterateTaxonomyTsv } from "./taxonomy-fixture.mjs";
import { validateTaxonomyPackage } from "./taxonomy-package.mjs";
import {
  buildTaxonomySearchIndexes,
  createTaxonomySchema,
  measureTaxonomyDatabase,
  validateFullTaxonomyDatabase,
} from "./taxonomy-schema.mjs";
import {
  foldTaxonomySearchTerm,
  germanTaxonomySearchKey,
  normalizeTaxonomySearchTerm,
} from "./taxonomy-search-text.mjs";
import {
  atomicWriteJson,
  loadNodeSqlite,
  taxonomyDatabasePath,
  taxonomyReleaseDirectory,
} from "./taxonomy-storage.mjs";

const MATERIALIZED_STATUSES = Object.freeze([
  "accepted",
  "provisionally accepted",
  "bare name",
]);
const DEFAULT_BATCH_SIZE = 50_000;
const MAX_TOLERATED_ORPHAN_VERNACULAR_NAMES = 25;
const MAX_TOLERATED_ORPHAN_VERNACULAR_RATIO = 0.01;
const ABSOLUTE_MAX_ORPHAN_VERNACULAR_NAMES = 100_000;

function maxToleratedOrphanVernacularNames(sourceRows) {
  const normalizedSourceRows = Math.max(0, Number(sourceRows) || 0);
  return Math.min(
    ABSOLUTE_MAX_ORPHAN_VERNACULAR_NAMES,
    Math.max(
      MAX_TOLERATED_ORPHAN_VERNACULAR_NAMES,
      Math.ceil(normalizedSourceRows * MAX_TOLERATED_ORPHAN_VERNACULAR_RATIO),
    ),
  );
}

function parseNullableBoolean(value) {
  const normalized = String(value ?? "").trim().toLocaleLowerCase("en");
  if (!normalized) return null;
  if (["true", "1", "yes"].includes(normalized)) return 1;
  if (["false", "0", "no"].includes(normalized)) return 0;
  return null;
}

function normalizedStatus(value) {
  return String(value || "bare name").trim().toLocaleLowerCase("en");
}

function normalizedTrustTier(row) {
  const explicit = String(row.colTrustTier ?? "").trim().toLocaleLowerCase("en");
  if (explicit === "base" || explicit === "xr-supplement") return explicit;
  return parseNullableBoolean(row.merged) === 1 ? "xr-supplement" : "base";
}

function reportProgress(onProgress, phase, current, total, message) {
  onProgress?.({ phase, current, total, message });
}

async function importInBatches({
  database,
  iterator,
  signal,
  batchSize = DEFAULT_BATCH_SIZE,
  onRow,
  onBatch,
}) {
  let count = 0;
  database.exec("BEGIN IMMEDIATE");
  try {
    for await (const row of iterator) {
      signal?.throwIfAborted();
      await onRow(row, count);
      count += 1;
      if (count % batchSize === 0) {
        database.exec("COMMIT; BEGIN IMMEDIATE");
        onBatch?.(count);
      }
    }
    database.exec("COMMIT");
    return count;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // Der ursprüngliche Importfehler bleibt maßgeblich.
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
  const seen = new Map();
  return (sourceDatasetId, trustTier) => {
    const id = String(sourceDatasetId || "catalogue-of-life-xr").trim();
    const previousTier = seen.get(id);
    if (previousTier === trustTier || previousTier === "mixed") return id;
    statement.run(id, sourceReleaseId, `CoL-Quelldatensatz ${id}`, trustTier);
    seen.set(id, previousTier && previousTier !== trustTier ? "mixed" : trustTier);
    return id;
  };
}

async function importNameUsages(database, taxonomyPackage, {
  signal,
  onProgress,
  batchSize,
}) {
  const release = taxonomyPackage.release;
  const ensureDataset = createDatasetWriter(database, release.releaseId);
  const insert = database.prepare(`
    INSERT INTO raw_name_usage (
      source_id, source_dataset_id, parent_source_id, scientific_name, authorship,
      rank, status, code, extinct, environment, kingdom, alternative_id, trust_tier
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const expected = Number(release.expectedNameUsages) || null;
  const count = await importInBatches({
    database,
    iterator: iterateTaxonomyTsv(taxonomyPackage.files["NameUsage.tsv"], { signal }),
    signal,
    batchSize,
    onRow(row) {
      const sourceId = String(row.ID ?? "").trim();
      const scientificName = String(row.scientificName ?? "").trim();
      const rank = String(row.rank ?? "").trim().toLocaleLowerCase("en");
      if (!sourceId || !scientificName || !rank) {
        throw new Error("NameUsage.tsv enthält einen Eintrag ohne ID, wissenschaftlichen Namen oder Rang.");
      }
      const trustTier = normalizedTrustTier(row);
      insert.run(
        sourceId,
        ensureDataset(row.sourceID, trustTier),
        String(row.parentID ?? "").trim() || null,
        scientificName,
        String(row.authorship ?? "").trim() || null,
        rank,
        normalizedStatus(row.status),
        String(row.code ?? "").trim() || null,
        parseNullableBoolean(row.extinct),
        String(row.environment ?? "").trim() || null,
        String(row.kingdom ?? "").trim() || null,
        String(row.alternativeID ?? "").trim() || null,
        trustTier,
      );
    },
    onBatch(current) {
      reportProgress(
        onProgress,
        "name-usages",
        current,
        expected,
        `${current.toLocaleString("de-DE")} wissenschaftliche Namen importiert`,
      );
    },
  });
  reportProgress(
    onProgress,
    "name-usages",
    count,
    count,
    `${count.toLocaleString("de-DE")} wissenschaftliche Namen importiert`,
  );
  return { count, ensureDataset };
}

function materializeTaxa(database) {
  const acceptedStatuses = MATERIALIZED_STATUSES.map((status) => `'${status}'`).join(", ");
  database.exec(`
    BEGIN IMMEDIATE;
    INSERT INTO taxon (
      source_id, scientific_name, authorship, rank, status, code, extinct,
      environment, kingdom, source_dataset_id, trust_tier
    )
    SELECT
      source_id, scientific_name, authorship, rank, status, code, extinct,
      environment, kingdom, source_dataset_id, trust_tier
    FROM raw_name_usage
    WHERE status IN (${acceptedStatuses});

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
      source_id, id, scientific_name, authorship, rank, status,
      CASE
        WHEN status IN ('accepted', 'provisionally accepted') THEN 'accepted'
        ELSE 'standalone'
      END,
      source_dataset_id, trust_tier
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
    WHERE raw.status NOT IN (${acceptedStatuses});
    COMMIT;
  `);
}

async function importVernacularNames(database, taxonomyPackage, {
  ensureDataset,
  signal,
  onProgress,
  batchSize,
}) {
  const filePath = taxonomyPackage.files["VernacularName.tsv"];
  if (!filePath) {
    reportProgress(
      onProgress,
      "vernacular-names",
      0,
      0,
      "Dieses Referenzpaket enthält keine gebräuchlichen Namen",
    );
    return {
      sourceRows: 0,
      imported: 0,
      skippedUnknownTaxa: 0,
    };
  }
  const target = database.prepare(`
    SELECT id, trust_tier
    FROM taxon
    WHERE source_id = ?
    UNION ALL
    SELECT taxon.id, taxon.trust_tier
    FROM taxon_name
    JOIN taxon ON taxon.id = taxon_name.taxon_id
    WHERE taxon_name.source_name_id = ?
    LIMIT 1
  `);
  const insert = database.prepare(`
    INSERT INTO vernacular_name (
      source_name_id, taxon_id, name, transliteration, normalized, language,
      preferred, country, area, reference_id, remarks, source_dataset_id, verified
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  let imported = 0;
  let skippedUnknownTaxa = 0;
  const sourceRows = await importInBatches({
    database,
    iterator: iterateTaxonomyTsv(filePath, { signal }),
    signal,
    batchSize,
    onRow(row, index) {
      const taxonId = String(row.taxonID ?? "").trim();
      const name = String(row.name ?? "").trim();
      if (!taxonId || !name) {
        throw new Error("VernacularName.tsv enthält einen Eintrag ohne Taxon-ID oder Namen.");
      }
      const accepted = target.get(taxonId, taxonId);
      if (!accepted) {
        skippedUnknownTaxa += 1;
        return;
      }
      const sourceId = String(row.sourceID ?? "").trim();
      insert.run(
        `${sourceId || "col"}:${taxonId}:${row.language || "und"}:${index}`,
        accepted.id,
        name,
        String(row.transliteration ?? "").trim() || null,
        normalizeTaxonomySearchTerm(name),
        String(row.language ?? "").trim() || "und",
        parseNullableBoolean(row.preferred) ?? 0,
        String(row.country ?? "").trim() || null,
        String(row.area ?? "").trim() || null,
        String(row.referenceID ?? "").trim() || null,
        String(row.remarks ?? "").trim() || null,
        ensureDataset(sourceId, accepted.trust_tier),
      );
      imported += 1;
    },
    onBatch(current) {
      reportProgress(
        onProgress,
        "vernacular-names",
        current,
        null,
        `${imported.toLocaleString("de-DE")} gebräuchliche Namen importiert`,
      );
    },
  });
  const toleratedOrphans = maxToleratedOrphanVernacularNames(sourceRows);
  if (skippedUnknownTaxa > toleratedOrphans) {
    throw new Error(
      `VernacularName.tsv enthält zu viele nicht zuordenbare Taxonverweise: ${
        skippedUnknownTaxa.toLocaleString("de-DE")
      } von ${sourceRows.toLocaleString("de-DE")} (zulässig: höchstens ${
        toleratedOrphans.toLocaleString("de-DE")
      }).`,
    );
  }
  reportProgress(
    onProgress,
    "vernacular-names",
    sourceRows,
    sourceRows,
    [
      `${imported.toLocaleString("de-DE")} gebräuchliche Namen importiert`,
      skippedUnknownTaxa
        ? `${skippedUnknownTaxa.toLocaleString("de-DE")} verwaiste Zuordnung(en) sicher übersprungen`
        : "",
    ].filter(Boolean).join("; "),
  );
  return {
    sourceRows,
    imported,
    skippedUnknownTaxa,
  };
}

function splitAlternativeIdentifiers(value) {
  return String(value ?? "")
    .split(/[|,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function identifierType(value) {
  const match = String(value).match(/^([a-z][a-z0-9._-]{1,39}):/i);
  return match ? match[1].toLocaleLowerCase("en") : "alternative";
}

function importAlternativeIdentifiers(database, releaseId) {
  const insert = database.prepare(`
    INSERT OR IGNORE INTO external_identifier (
      taxon_id, identifier_type, identifier, source, source_release
    ) VALUES (?, ?, ?, 'Catalogue of Life', ?)
  `);
  let count = 0;
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const row of database.prepare(`
      SELECT taxon.id AS taxon_id, raw.alternative_id
      FROM raw_name_usage raw
      JOIN taxon ON taxon.source_id = raw.source_id
      WHERE raw.alternative_id IS NOT NULL AND raw.alternative_id <> ''
    `).iterate()) {
      for (const identifier of splitAlternativeIdentifiers(row.alternative_id)) {
        insert.run(row.taxon_id, identifierType(identifier), identifier, releaseId);
        count += 1;
      }
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return count;
}

async function importOptionalExternalIdentifiers(database, taxonomyPackage, {
  signal,
  batchSize,
}) {
  const filePath = taxonomyPackage.files["ExternalIdentifier.tsv"];
  if (!filePath) return 0;
  const lookup = database.prepare(`
    SELECT id FROM taxon WHERE source_id = ?
    UNION ALL
    SELECT taxon_id AS id FROM taxon_name WHERE source_name_id = ?
    LIMIT 1
  `);
  const insert = database.prepare(`
    INSERT OR IGNORE INTO external_identifier (
      taxon_id, identifier_type, identifier, source, source_release
    ) VALUES (?, ?, ?, ?, ?)
  `);
  return importInBatches({
    database,
    iterator: iterateTaxonomyTsv(filePath, { signal }),
    signal,
    batchSize,
    onRow(row) {
      if (!("taxonID" in row) || !("identifier" in row)) return;
      const target = lookup.get(row.taxonID, row.taxonID);
      if (!target || !String(row.identifier ?? "").trim()) return;
      insert.run(
        target.id,
        String(row.type || "alternative").trim(),
        String(row.identifier).trim(),
        String(row.source || "Catalogue of Life").trim(),
        String(row.release || taxonomyPackage.release.releaseId).trim(),
      );
    },
  });
}

function buildFullSearchTerms(database) {
  database.function(
    "taxonomy_normalize",
    { deterministic: true },
    normalizeTaxonomySearchTerm,
  );
  database.function(
    "taxonomy_fold",
    { deterministic: true },
    foldTaxonomySearchTerm,
  );
  database.function(
    "taxonomy_german_key",
    { deterministic: true },
    germanTaxonomySearchKey,
  );
  database.exec(`
    BEGIN IMMEDIATE;
    INSERT OR IGNORE INTO search_term (
      taxon_id, source_name_id, term, normalized, folded, german_key, term_type,
      language, accepted, preferred, trust_tier, kingdom, sort_score
    )
    SELECT
      id, source_id, scientific_name, taxonomy_normalize(scientific_name),
      taxonomy_fold(scientific_name), taxonomy_german_key(scientific_name),
      'accepted_scientific', NULL, 1, 1, trust_tier, kingdom, 10
    FROM taxon;

    INSERT OR IGNORE INTO search_term (
      taxon_id, source_name_id, term, normalized, folded, german_key, term_type,
      language, accepted, preferred, trust_tier, kingdom, sort_score
    )
    SELECT
      name.taxon_id, name.source_name_id, name.scientific_name,
      taxonomy_normalize(name.scientific_name), taxonomy_fold(name.scientific_name),
      taxonomy_german_key(name.scientific_name), 'scientific_synonym', NULL, 0, 0,
      name.trust_tier, taxon.kingdom, 30
    FROM taxon_name name
    JOIN taxon ON taxon.id = name.taxon_id
    WHERE name.relationship <> 'accepted';

    INSERT OR IGNORE INTO search_term (
      taxon_id, source_name_id, term, normalized, folded, german_key, term_type,
      language, accepted, preferred, trust_tier, kingdom, sort_score
    )
    SELECT
      name.taxon_id, name.source_name_id, name.name,
      taxonomy_normalize(name.name), taxonomy_fold(name.name),
      taxonomy_german_key(name.name), 'vernacular', name.language, 0,
      name.preferred, taxon.trust_tier, taxon.kingdom,
      CASE WHEN name.preferred = 1 THEN 20 ELSE 24 END
    FROM vernacular_name name
    JOIN taxon ON taxon.id = name.taxon_id;

    INSERT OR IGNORE INTO search_term (
      taxon_id, source_name_id, term, normalized, folded, german_key, term_type,
      language, accepted, preferred, trust_tier, kingdom, sort_score
    )
    SELECT
      identifier.taxon_id, 'identifier:' || identifier.id, identifier.identifier,
      taxonomy_normalize(identifier.identifier), taxonomy_fold(identifier.identifier),
      taxonomy_german_key(identifier.identifier), 'external_identifier',
      identifier.identifier_type, 0, 0, taxon.trust_tier, taxon.kingdom, 40
    FROM external_identifier identifier
    JOIN taxon ON taxon.id = identifier.taxon_id;
    COMMIT;
  `);
}

async function buildFullDatabase({
  databasePath,
  taxonomyPackage,
  signal,
  onProgress,
  now,
  batchSize,
}) {
  const { DatabaseSync } = await loadNodeSqlite();
  const database = new DatabaseSync(databasePath);
  const startedAt = performance.now();
  const initialRss = process.memoryUsage().rss;
  try {
    createTaxonomySchema(database);
    const release = taxonomyPackage.release;
    database.prepare(`
      INSERT INTO source_release (
        source_release_id, source_name, alias, issued, imported_at, format,
        coldp_version, doi, source_url, fixture_sha256, license, bounded_prototype
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      release.releaseId,
      release.source || "Catalogue of Life",
      release.alias || release.releaseId,
      release.issued,
      now().toISOString(),
      release.format || "ColDP",
      release.coldpVersion || "1.2",
      release.doi || null,
      release.metadataUrl || release.sourceUrl,
      taxonomyPackage.packageFingerprint,
      release.license,
    );
    reportProgress(onProgress, "name-usages", 0, release.expectedNameUsages, "Vollimport startet");
    const nameImport = await importNameUsages(database, taxonomyPackage, {
      signal,
      onProgress,
      batchSize,
    });
    signal?.throwIfAborted();
    reportProgress(onProgress, "materialize", 0, 1, "Taxa und Synonyme werden verknüpft");
    materializeTaxa(database);
    const vernacularImport = await importVernacularNames(database, taxonomyPackage, {
      ensureDataset: nameImport.ensureDataset,
      signal,
      onProgress,
      batchSize,
    });
    signal?.throwIfAborted();
    importAlternativeIdentifiers(database, release.releaseId);
    await importOptionalExternalIdentifiers(database, taxonomyPackage, {
      signal,
      batchSize,
    });
    reportProgress(onProgress, "search-index", 0, 1, "Suchbegriffe werden vorbereitet");
    buildFullSearchTerms(database);
    buildTaxonomySearchIndexes(database);
    const validation = validateFullTaxonomyDatabase(database, {
      importedNameUsages: nameImport.count,
      importedVernacularNames: vernacularImport.imported,
    });
    reportProgress(onProgress, "compact", 0, 1, "Importtabelle wird entfernt und Datenbank verdichtet");
    database.exec("DROP TABLE raw_name_usage; VACUUM; PRAGMA optimize;");
    const finalIntegrity = database.prepare("PRAGMA integrity_check").get();
    if (finalIntegrity?.integrity_check !== "ok") {
      throw new Error(
        `Finale SQLite-Integritätsprüfung fehlgeschlagen: ${finalIntegrity?.integrity_check}`,
      );
    }
    return {
      validation: {
        ...validation,
        vernacularNameSourceRows: vernacularImport.sourceRows,
        vernacularNamesSkippedUnknownTaxa: vernacularImport.skippedUnknownTaxa,
      },
      measurements: measureTaxonomyDatabase(database),
      importDurationMs: Number((performance.now() - startedAt).toFixed(2)),
      peakRssEstimateBytes: Math.max(initialRss, process.memoryUsage().rss),
    };
  } finally {
    database.close();
  }
}

export async function importFullTaxonomyRelease({
  packageDirectory,
  taxonomyRoot,
  release,
  archive,
  signal,
  onProgress,
  now = () => new Date(),
  operationId = crypto.randomUUID(),
  batchSize = DEFAULT_BATCH_SIZE,
} = {}) {
  if (!packageDirectory || !taxonomyRoot || !release) {
    throw new Error("Paketverzeichnis, Taxonomie-Zielpfad und Release sind erforderlich.");
  }
  const taxonomyPackage = await validateTaxonomyPackage(packageDirectory, {
    release,
    archive,
  });
  const root = path.resolve(taxonomyRoot);
  const releaseDirectory = taxonomyReleaseDirectory(root, taxonomyPackage.releaseId);
  const stagingDirectory = path.join(
    root,
    "staging",
    `import-${taxonomyPackage.releaseId}-${operationId}`,
  );
  const stagingDatabasePath = path.join(stagingDirectory, "taxonomy.sqlite");
  try {
    try {
      await fs.access(releaseDirectory);
      throw new Error(
        `Taxonomie-Release ${taxonomyPackage.releaseId} ist bereits unveränderlich installiert.`,
      );
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await fs.mkdir(stagingDirectory, { recursive: true });
    const build = await buildFullDatabase({
      databasePath: stagingDatabasePath,
      taxonomyPackage,
      signal,
      onProgress,
      now,
      batchSize,
    });
    signal?.throwIfAborted();
    const databaseStats = await fs.stat(stagingDatabasePath);
    const manifest = {
      schemaVersion: 1,
      importerVersion: 1,
      releaseId: taxonomyPackage.releaseId,
      source: taxonomyPackage.release,
      importedAt: now().toISOString(),
      boundedPrototype: false,
      sourceBytes: taxonomyPackage.sourceBytes,
      archive: taxonomyPackage.archive,
      packageFingerprint: taxonomyPackage.packageFingerprint,
      databaseBytes: databaseStats.size,
      importDurationMs: build.importDurationMs,
      peakRssEstimateBytes: build.peakRssEstimateBytes,
      measurements: build.measurements,
      counts: build.validation,
      validation: {
        integrity: "ok",
        foreignKeys: "ok",
        hierarchyCycles: "none",
        projectSpeciesCompared: false,
      },
    };
    await atomicWriteJson(path.join(stagingDirectory, "manifest.json"), manifest);
    await fs.mkdir(path.dirname(releaseDirectory), { recursive: true });
    await fs.rename(stagingDirectory, releaseDirectory);
    reportProgress(onProgress, "complete", 1, 1, "Referenzrelease ist importiert und geprüft");
    return {
      releaseId: taxonomyPackage.releaseId,
      releaseDirectory,
      databasePath: taxonomyDatabasePath(root, taxonomyPackage.releaseId),
      manifest,
    };
  } catch (error) {
    await fs.rm(stagingDirectory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export const taxonomyFullImportInternals = Object.freeze({
  splitAlternativeIdentifiers,
  identifierType,
  normalizedStatus,
  normalizedTrustTier,
  maxToleratedOrphanVernacularNames,
  MAX_TOLERATED_ORPHAN_VERNACULAR_NAMES,
  MAX_TOLERATED_ORPHAN_VERNACULAR_RATIO,
  ABSOLUTE_MAX_ORPHAN_VERNACULAR_NAMES,
});
