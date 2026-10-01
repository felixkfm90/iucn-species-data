import { configureTaxonomyBuildDatabase, withTaxonomyBuildCache } from "./taxonomy-build-cache.mjs";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { RANK_POSITIONS, rankPositionSql, populateLightroomSearchDatabase } from "./lightroom-search-projection.mjs";
import path from "node:path";
import { applyLightroomSearchDelta } from "./lightroom-search-delta.mjs";
import { verifiedLightroomExportRevision, recordLightroomExportInputs, hasBoundLightroomExportInputs,
  planLightroomExport, refreshLightroomExportProvenance } from "./lightroom-search-inputs.mjs";
import { validateLightroomBaseInBackground } from "./lightroom-search-validation.mjs";

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
  sha256File,
} from "./lightroom-search-storage.mjs";
import {
  taxonomyMasterDatabasePath,
} from "./taxonomy-master-storage.mjs";
import { atomicWriteJson, loadNodeSqlite } from "./taxonomy-storage.mjs";

function cleanText(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function packageId(masterVersion, now) {
  const source = `${masterVersion}|${now.toISOString()}|${crypto.randomUUID()}`;
  return `lightroom-${crypto.createHash("sha256").update(source).digest("hex").slice(0, 20)}`;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export function buildLightroomSearchPackage(options = {}) {
  return withTaxonomyBuildCache(() => buildLightroomSearchPackageScoped(options));
}

async function buildLightroomSearchPackageScoped({
  taxonomyRoot,
  searchRoot,
  projectRevision = "unbekannt",
  sourceSlot = "active",
  incremental = true,
  baseSearchRoot = searchRoot,
  now = () => new Date(),
  signal,
  onProgress = () => {},
} = {}) {
  if (!taxonomyRoot || !searchRoot) {
    throw new Error("Taxonomie- und Lightroom-Suchpaketpfad sind erforderlich.");
  }
  signal?.throwIfAborted();
  const sourcePath = taxonomyMasterDatabasePath(taxonomyRoot, sourceSlot);
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
    path.join(path.dirname(sourcePath), "manifest.json"),
  ).catch((error) => {
    throw new Error(`Das aktive Mastermanifest ist ungültig: ${error.message}`, {
      cause: error,
    });
  });
  const sourceChecksum = `sha256:${await sha256File(sourcePath, { signal })}`;
  const generatedAt = now().toISOString();
  const exportContract = await verifiedLightroomExportRevision();
  const masterVersion = cleanText(masterManifest.candidateId || masterManifest.masterVersion);
  if (!masterVersion) throw new Error("Aktive Masterversion fehlt im Mastermanifest.");
  const workRoot = path.join(path.resolve(searchRoot), `.build-${crypto.randomUUID()}`);
  await prepareLightroomSearchStaging(workRoot);
  const targetPath = lightroomSearchDatabasePath(workRoot, "staging");
  const metadata = {
    packageId: packageId(masterVersion, new Date(generatedAt)),
    generatedAt,
    projectRevision: cleanText(projectRevision) || "unbekannt",
    masterVersion,
    masterActivatedAt: cleanText(masterManifest.activatedAt),
    exportContract,
    sourceChecksum,
  };
  const { DatabaseSync } = await loadNodeSqlite();
  let database;
  let baseValidation;
  let retainWorkRoot = false;
  let build = { mode: "full", reason: incremental ? "no-verified-base" : "requested" };
  try {
    let base;
    if (incremental) {
      // This is only the quick binding check. Full verification runs concurrently
      // and must succeed for the SAME checksummed base before staging is replaced.
      try { base = await verifyLightroomSearchPackage({ searchRoot: baseSearchRoot, signal, full: false }); }
      catch { signal?.throwIfAborted(); }
      if (base) {
        const previous = configureTaxonomyBuildDatabase(new DatabaseSync(base.databasePath, { readOnly: true }));
        try {
          if (!hasBoundLightroomExportInputs(previous, base.manifest, exportContract)) {
            base = null;
            build.reason = "no-bound-export-inputs";
          }
        } finally { previous.close(); }
      }
      if (base) baseValidation = validateLightroomBaseInBackground(baseSearchRoot, { signal });
    }
    onProgress({ phase: "schema", percent: 5, message: "Suchpaketschema wird angelegt." });
    const projectionPath = base ? path.join(workRoot, "projection.sqlite") : targetPath;
    database = configureTaxonomyBuildDatabase(new DatabaseSync(projectionPath));
    createLightroomSearchSchema(database);
    signal?.throwIfAborted();
    onProgress({ phase: "copy", percent: 15, message: "Mastertaxa und Namen werden exportiert." });
    recordLightroomExportInputs(database, sourcePath, { signal });
    if (base) {
      await fs.copyFile(base.databasePath, targetPath);
      if (`sha256:${await sha256File(targetPath, { signal })}` !== base.manifest.checksum) {
        throw new Error("Die Wiederverwendungsbasis wurde während des Kopierens geändert.");
      }
    }
    // Plan against the exact private bytes later modified, never a moving legacy slot.
    const scope = base ? planLightroomExport(database, targetPath) : null;
    // For broad changes on a nontrivial package, rebuilding indices is cheaper
    // than maintaining them row by row. Small fixtures still exercise the delta.
    if (scope?.totalTaxa >= 1000 && scope.projectedTaxa > scope.totalTaxa / 2) {
      await baseValidation.close();
      baseValidation = null;
      base = null;
      database.exec("DROP TABLE delta_scope");
      build = { mode: "full", reason: "many-changed-taxa", scope };
    }
    signal?.throwIfAborted();
    onProgress({ phase: "copy", percent: 35, message: base
      ? `${scope.projectedTaxa} von ${scope.totalTaxa} Taxa werden neu exportiert.` : "Vollständiger Masterexport wird vorbereitet.", scope });
    populateLightroomSearchDatabase(database, sourcePath, metadata, { partial: Boolean(base) });
    signal?.throwIfAborted();
    if (base) {
      database.close();
      database = null;
      database = configureTaxonomyBuildDatabase(new DatabaseSync(targetPath));
      onProgress({ phase: "index", percent: 70, message: "Geänderte Suchpaketzeilen und Suchbegriffe werden aktualisiert." });
      build = { ...applyLightroomSearchDelta(database, projectionPath, { signal, scoped: true }),
        basePackageId: base.manifest.packageId, scope, projection: "changed-taxa" };
      build.provenanceChanges = refreshLightroomExportProvenance(database, sourcePath, projectionPath, { signal });
    } else {
      if (projectionPath !== targetPath) {
        database.close();
        database = null;
        await fs.rm(targetPath, { force: true });
        await fs.rename(projectionPath, targetPath);
        database = configureTaxonomyBuildDatabase(new DatabaseSync(targetPath));
      }
      onProgress({ phase: "index", percent: 70, message: "Suchindizes werden aufgebaut." });
      finalizeLightroomSearchSchema(database);
    }
    if (baseValidation) {
      const verifiedBase = await baseValidation.result;
      signal?.throwIfAborted();
      if (!verifiedBase?.checksumVerified || verifiedBase.manifest.checksum !== base.manifest.checksum
        || verifiedBase.manifest.packageId !== base.manifest.packageId) {
        const error = new Error("Die vollständige Basisprüfung ist fehlgeschlagen; vollständiger Paketaufbau erforderlich.");
        error.code = "LIGHTROOM_BASE_REBUILD";
        throw error;
      }
    }
    onProgress({ phase: "validate", percent: 88, message: "Suchpaket wird vollständig geprüft." });
    signal?.throwIfAborted();
    const counts = inspectLightroomSearchDatabase(database, { full: true });
    database.close();
    database = null;
    const stats = await fs.stat(targetPath);
    const checksum = await sha256File(targetPath, { signal });
    await verifiedLightroomExportRevision();
    if (`sha256:${await sha256File(sourcePath, { signal })}` !== sourceChecksum
      || JSON.stringify(await readJson(path.join(path.dirname(sourcePath), "manifest.json"))) !== JSON.stringify(masterManifest)) {
      throw new Error("Der Master wurde während des Suchpaketbaus verändert. Es wurde nichts aktiviert.");
    }
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
      build,
      sourceSlot,
      sourceChecksum,
      exportContract,
    };
    await atomicWriteJson(lightroomSearchManifestPath(workRoot, "staging"), manifest);
    signal?.throwIfAborted();
    const staging = path.join(path.resolve(searchRoot), "staging");
    const displaced = path.join(workRoot, "old-staging");
    let moved = false;
    try { await fs.rename(staging, displaced); moved = true; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    try { await fs.rename(path.dirname(targetPath), staging); }
    catch (error) {
      if (moved) {
        try { await fs.rename(displaced, staging); }
        catch (restoreError) {
          retainWorkRoot = true;
          throw new AggregateError([error, restoreError], `Staging konnte nicht zurückgestellt werden; Sicherung bleibt in ${displaced}.`);
        }
      }
      throw error;
    }
    onProgress({ phase: "complete", percent: 100, message: "Suchpaket ist geprüft." });
    return manifest;
  } catch (error) {
    database?.close();
    if (error.code === "LIGHTROOM_BASE_REBUILD") {
      await baseValidation.close();
      await fs.rm(workRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
      onProgress({ phase: "schema", percent: 5, message: "Basisprüfung fehlgeschlagen. Suchpaket wird vollständig neu aufgebaut." });
      return await buildLightroomSearchPackage({ taxonomyRoot, searchRoot, projectRevision, sourceSlot,
        incremental: false, now, signal, onProgress });
    }
    throw error;
  } finally {
    await baseValidation?.close();
    if (!retainWorkRoot) await fs.rm(workRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
  }
}

export async function verifyLightroomSearchPackage({
  searchRoot,
  slot = "active",
  verifyChecksum = true,
  full = true,
  signal,
} = {}) {
  const databasePath = lightroomSearchDatabasePath(searchRoot, slot);
  const manifest = await readJson(path.join(path.dirname(databasePath), "manifest.json"));
  if (!manifest) throw new Error(`Lightroom-Suchpaket ${slot} ist nicht installiert.`);
  if (manifest.schemaVersion !== LIGHTROOM_SEARCH_SCHEMA_VERSION) {
    throw new Error(`Manifest-Schemaversion ${manifest.schemaVersion} wird nicht unterstützt.`);
  }
  const { DatabaseSync } = await loadNodeSqlite();
  const database = configureTaxonomyBuildDatabase(new DatabaseSync(databasePath, { readOnly: true }));
  let counts;
  try {
    counts = inspectLightroomSearchDatabase(database, { full });
    if (verifyChecksum) {
      const info = database.prepare("SELECT value FROM package_info WHERE key = ?");
      for (const key of ["packageId", "masterVersion"]) {
        if (info.get(key)?.value !== manifest[key]) throw new Error(`Suchpaket-Provenienz ${key} stimmt nicht mit der Datenbank überein.`);
      }
    }
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
