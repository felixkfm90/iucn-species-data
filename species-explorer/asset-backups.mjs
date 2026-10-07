import { existsSync } from "node:fs";
import { lstat, mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join, relative, resolve } from "node:path";
import { createSpeciesCreationSessionStore } from "./species-creation-session.mjs";

export const SPECIES_LIST_BACKUP_RETENTION_COUNT = 5;
export const PIPELINE_LOG_RETENTION_COUNT = 20;
export const ASSET_BACKUP_RETENTION_COUNT = 1;

export async function readBackupRetentionProtection(repoRoot) {
  const protection = await createSpeciesCreationSessionStore({ repoRoot }).backupRetentionProtection();
  const backupPaths = new Set(protection.backupPaths.map((file) => resolve(file)));
  const safeNames = new Set(protection.safeNames);
  let pendingReview;
  try {
    pendingReview = JSON.parse(await readFile(join(repoRoot, "species-explorer", "pending-asset-review.json"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (pendingReview !== undefined) {
    if (!pendingReview || !Array.isArray(pendingReview.targets) || !Array.isArray(pendingReview.reviewAssets)) {
      throw new Error("Offene Medienprüfung ist unlesbar. Rücknahmesicherungen bleiben erhalten.");
    }
    for (const entry of [...pendingReview.targets, ...pendingReview.reviewAssets]) {
      if (!entry || typeof entry.safeName !== "string" || !entry.safeName || /[\\/]/.test(entry.safeName)) {
        throw new Error("Offene Medienprüfung enthält kein eindeutiges Sicherungsziel. Sicherungen bleiben erhalten.");
      }
      safeNames.add(entry.safeName);
    }
  }
  return { backupPaths, safeNames, assetBackupReceipts: protection.assetBackupReceipts };
}

function compareAssetBackupRecency(left, right) {
  return Number(right.name === "latest") - Number(left.name === "latest")
    || right.mtimeMs - left.mtimeMs || right.name.localeCompare(left.name);
}

async function pinnedAssetBackupPath({ repoRoot, backupDirectory, safeName, assetType, allowedNames }) {
  const protection = await readBackupRetentionProtection(repoRoot);
  if (!protection.safeNames.has(safeName) || !existsSync(backupDirectory)) return "";
  const fail = (message) => Object.assign(new Error(
    `Die ursprüngliche Mediensicherung für den noch offenen Vorgang kann nicht geprüft werden: ${message} Bisherige Dateien bleiben erhalten. Bitte den Vorgang prüfen und fortsetzen oder abbrechen.`,
  ), { statusCode: 409 });
  const directoryDetails = await lstat(backupDirectory);
  if (!directoryDetails.isDirectory() || directoryDetails.isSymbolicLink()) {
    throw fail("Der Sicherungsordner ist kein eigener normaler Ordner.");
  }
  const entries = await readdir(backupDirectory, { withFileTypes: true });
  if (entries.some((entry) => !entry.isFile() || !["backup.json", ...allowedNames].includes(entry.name))) {
    throw fail("Unbekannte oder verknüpfte Dateien liegen im Sicherungsordner.");
  }
  let metadata;
  try { metadata = JSON.parse(await readFile(join(backupDirectory, "backup.json"), "utf8")); }
  catch { throw fail("Die Herkunftsangaben fehlen oder sind unlesbar."); }
  if (!metadata || metadata.version !== 1 || metadata.safeName !== safeName || metadata.assetType !== assetType) {
    throw fail("Die Herkunftsangaben passen nicht zur Art und zum Medientyp.");
  }
  const mediaFiles = entries.filter((entry) => allowedNames.includes(entry.name));
  if (!mediaFiles.length) throw fail("Die Sicherung enthält keine Mediendatei.");
  const hashes = {};
  for (const entry of entries) {
    let bytes;
    try { bytes = await readFile(join(backupDirectory, entry.name)); }
    catch { throw fail(`Die Datei ${entry.name} ist nicht lesbar.`); }
    if (!bytes.length) throw fail(`Die Datei ${entry.name} ist leer.`);
    hashes[`${assetType}/${entry.name}`] = createHash("sha256").update(bytes).digest("hex");
  }
  for (const receipt of protection.assetBackupReceipts.filter((entry) => entry.safeName === safeName)) {
    const expected = Object.fromEntries(Object.entries(receipt.files).filter(([name]) => name.startsWith(`${assetType}/`)));
    if (Object.keys(expected).length !== Object.keys(hashes).length
        || Object.entries(hashes).some(([name, hash]) => expected[name] !== hash)) {
      throw fail("Die Sicherung stimmt nicht mehr mit dem gespeicherten Artanlage-Auftrag überein.");
    }
  }
  // During an open operation the first recovery set is immutable. Repeated
  // media choices remain possible and refer to this same verified baseline.
  return repoRelativePath(repoRoot, backupDirectory);
}

export function repoRelativePath(repoRoot, filePath) {
  return relative(repoRoot, filePath).replace(/\\/g, "/");
}

export function assetBackupFileNames(assetType) {
  if (assetType === "map") return ["map.jpg"];
  if (assetType === "sound") return ["sound.mp3", "credits.json", "spectrogram.webp"];
  if (assetType === "portrait") return ["portrait.webp", "portrait.json"];
  return [];
}

export async function readBackupMetadata(backupPath) {
  const metadataPath = join(backupPath, "backup.json");
  try {
    return JSON.parse(await readFile(metadataPath, "utf8"));
  } catch {
    return {};
  }
}

export async function writeManagedAssetBackup({
  repoRoot,
  assetBackupRoot,
  species,
  assetType,
  files,
  metadata = {},
  renameDirectory = rename,
}) {
  const allowedNames = assetBackupFileNames(assetType);
  if (!allowedNames.length || !files.some((file) => file.buffer?.length)) {
    throw new Error("Leere oder unbekannte Mediensicherung ersetzt keinen vorhandenen Rücknahmestand.");
  }
  if (files.some((file) => !allowedNames.includes(file.fileName))) {
    throw new Error("Mediensicherung enthält einen unbekannten Dateinamen. Vorherige Sicherung bleibt erhalten.");
  }
  const backupDirectory = join(assetBackupRoot, species.safeName, assetType);
  const verifyPinnedBackup = () => pinnedAssetBackupPath({ repoRoot, backupDirectory,
    safeName: species.safeName, assetType, allowedNames });
  const pinnedBeforeWrite = await verifyPinnedBackup();
  if (pinnedBeforeWrite) return pinnedBeforeWrite;
  const tempDirectory = join(assetBackupRoot, species.safeName, `${assetType}.tmp-${randomUUID()}`);
  const previousDirectory = join(assetBackupRoot, species.safeName, `${assetType}.previous-${randomUUID()}`);
  let previousMoved = false;
  await rm(tempDirectory, { recursive: true, force: true });
  await mkdir(tempDirectory, { recursive: true });
  try {
    for (const file of files) {
      if (!file.buffer?.length) continue;
      await writeFile(join(tempDirectory, file.fileName), file.buffer);
    }
    await writeFile(
      join(tempDirectory, "backup.json"),
      `${JSON.stringify({
        version: 1,
        assetType,
        safeName: species.safeName,
        germanName: species.germanName,
        createdAt: new Date().toISOString(),
        ...metadata,
      }, null, 2)}\n`,
      "utf8",
    );
    // Verify every staged file before replacing the last usable recovery set.
    for (const file of files) {
      if (!file.buffer?.length) continue;
      if (!(await readFile(join(tempDirectory, file.fileName))).equals(file.buffer)) {
        throw new Error("Neue Mediensicherung konnte nicht geprüft werden. Vorherige Sicherung bleibt erhalten.");
      }
    }
    JSON.parse(await readFile(join(tempDirectory, "backup.json"), "utf8"));
    const pinnedBeforeReplace = await verifyPinnedBackup();
    if (pinnedBeforeReplace) {
      await rm(tempDirectory, { recursive: true, force: true });
      return pinnedBeforeReplace;
    }
    if (existsSync(backupDirectory)) {
      await renameDirectory(backupDirectory, previousDirectory);
      previousMoved = true;
    }
    await renameDirectory(tempDirectory, backupDirectory);
    if (previousMoved) await rm(previousDirectory, { recursive: true, force: true });
    return repoRelativePath(repoRoot, backupDirectory);
  } catch (error) {
    if (previousMoved && !existsSync(backupDirectory)) {
      await renameDirectory(previousDirectory, backupDirectory).catch((restoreError) => {
        error.message += ` Vorherige Sicherung liegt weiterhin unter ${previousDirectory}: ${restoreError.message}`;
      });
    }
    await rm(tempDirectory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function pruneSpeciesListBackups(
  backupDir,
  keepCount = SPECIES_LIST_BACKUP_RETENTION_COUNT,
) {
  return pruneManagedJsonBackups(backupDir, {
    keepCount,
    pattern: /^species_list-\d{8}T\d{6}Z-.+-[0-9a-f]{8}\.json$/,
  });
}

export async function pruneManagedJsonBackups(backupDir, { keepCount, pattern }) {
  if (!Number.isInteger(keepCount) || keepCount < 1) throw new Error("Mindestens eine Bearbeitungssicherung muss erhalten bleiben.");
  const protection = await readBackupRetentionProtection(resolve(backupDir, "../.."));
  const entries = await readdir(backupDir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => (
      entry.isFile()
      && pattern.test(entry.name)
    ))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, "en"));
  const pinned = new Set(candidates.filter((name) => (
    protection.backupPaths.has(resolve(backupDir, name))
    || protection.safeNames.has(name.match(/^(?:species_list|taxonomy)-\d{8}T\d{6}Z-(.+)-[0-9a-f]{8}\.json$/)?.[1])
  )));
  const remove = candidates.filter((name) => !pinned.has(name)).slice(keepCount);
  await Promise.all(remove.map((name) => unlink(join(backupDir, name))));
  return {
    kept: candidates.length - remove.length,
    removed: remove.length,
    ...(pinned.size ? { protected: pinned.size } : {}),
  };
}

export async function prunePipelineLogs(logDir, keepCount = PIPELINE_LOG_RETENTION_COUNT) {
  const entries = await readdir(logDir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && /^pipeline-\d{8}T\d{6}Z-[0-9a-f]{8}\.log$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, "en"));
  const remove = candidates.slice(keepCount);
  await Promise.all(remove.map((name) => unlink(join(logDir, name))));
  return {
    kept: Math.min(candidates.length, keepCount),
    removed: remove.length,
  };
}

export async function collectManagedAssetBackups(assetBackupRoot) {
  if (!existsSync(assetBackupRoot)) return [];
  const collected = [];
  const speciesDirectories = await readdir(assetBackupRoot, { withFileTypes: true });
  for (const speciesDirectory of speciesDirectories) {
    if (!speciesDirectory.isDirectory()) continue;
    const speciesPath = join(assetBackupRoot, speciesDirectory.name);
    const assetDirectories = await readdir(speciesPath, { withFileTypes: true });
    for (const assetDirectory of assetDirectories) {
      if (!assetDirectory.isDirectory()) continue;
      if (!["map", "sound", "portrait"].includes(assetDirectory.name)) continue;
      const assetPath = join(speciesPath, assetDirectory.name);
      const files = await readdir(assetPath, { withFileTypes: true });
      const directFileNames = assetBackupFileNames(assetDirectory.name);
      const directBackupFiles = files.filter((file) => file.isFile() && directFileNames.includes(file.name));
      if (directBackupFiles.length) {
        let bytes = 0;
        let mtimeMs = 0;
        for (const backupFile of directBackupFiles) {
          const details = await stat(join(assetPath, backupFile.name));
          bytes += details.size;
          mtimeMs = Math.max(mtimeMs, details.mtimeMs);
        }
        const metadata = await readBackupMetadata(assetPath);
        collected.push({
          backupPath: assetPath,
          species: speciesDirectory.name,
          assetType: assetDirectory.name,
          name: "latest",
          bytes,
          mtimeMs,
          metadata,
        });
      }

      for (const file of files) {
        const backupPath = join(assetPath, file.name);
        if (
          file.isFile()
          && assetDirectory.name === "map"
          && /^map(?:-deleted)?-\d{8}T\d{6}Z-[0-9a-f]{8}\.jpg$/.test(file.name)
        ) {
          const details = await stat(backupPath);
          collected.push({
            backupPath,
            species: speciesDirectory.name,
            assetType: assetDirectory.name,
            name: file.name,
            bytes: details.size,
            mtimeMs: details.mtimeMs,
            metadata: {},
          });
        } else if (
          file.isDirectory()
          && assetDirectory.name === "sound"
          && /^sound(?:-deleted|-rejected)?-\d{8}T\d{6}Z-[0-9a-f]{8}$/.test(file.name)
        ) {
          const backupFiles = await readdir(backupPath, { withFileTypes: true });
          let bytes = 0;
          let mtimeMs = 0;
          for (const backupFile of backupFiles) {
            if (!backupFile.isFile() || !assetBackupFileNames("sound").includes(backupFile.name)) {
              continue;
            }
            const details = await stat(join(backupPath, backupFile.name));
            bytes += details.size;
            mtimeMs = Math.max(mtimeMs, details.mtimeMs);
          }
          collected.push({
            backupPath,
            species: speciesDirectory.name,
            assetType: assetDirectory.name,
            name: file.name,
            bytes,
            mtimeMs,
            metadata: await readBackupMetadata(backupPath),
          });
        } else if (
          file.isDirectory()
          && assetDirectory.name === "portrait"
          && /^portrait(?:-deleted)?-\d{8}T\d{6}Z-[0-9a-f]{8}$/.test(file.name)
        ) {
          const backupFiles = await readdir(backupPath, { withFileTypes: true });
          let bytes = 0;
          let mtimeMs = 0;
          for (const backupFile of backupFiles) {
            if (!backupFile.isFile() || !assetBackupFileNames("portrait").includes(backupFile.name)) {
              continue;
            }
            const details = await stat(join(backupPath, backupFile.name));
            bytes += details.size;
            mtimeMs = Math.max(mtimeMs, details.mtimeMs);
          }
          collected.push({
            backupPath,
            species: speciesDirectory.name,
            assetType: assetDirectory.name,
            name: file.name,
            bytes,
            mtimeMs,
            metadata: await readBackupMetadata(backupPath),
          });
        }
      }
    }
  }
  return collected;
}

export function planAssetBackupRetention(backups, {
  keepCount = ASSET_BACKUP_RETENTION_COUNT,
  protectedSafeNames = [],
} = {}) {
  if (!Number.isInteger(keepCount) || keepCount < 1) throw new Error("Mindestens eine Mediensicherung je Art und Medientyp muss erhalten bleiben.");
  const protectedSpecies = new Set(protectedSafeNames);
  const removePaths = new Set();
  const groups = new Map();
  for (const backup of backups) {
    const key = `${backup.species}:${backup.assetType}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(backup);
  }
  for (const group of groups.values()) {
    if (protectedSpecies.has(group[0].species)) continue;
    // The direct managed directory is authoritative. A copied legacy file
    // may have a newer filesystem timestamp without being a newer version.
    group.sort(compareAssetBackupRecency);
    for (const backup of group.slice(keepCount)) {
      removePaths.add(backup.backupPath);
    }
  }

  const retained = backups.filter((backup) => !removePaths.has(backup.backupPath));
  const retainedBytes = retained.reduce((sum, backup) => sum + backup.bytes, 0);
  return { removePaths: [...removePaths], kept: retained.length, removed: removePaths.size, bytes: retainedBytes };
}

export async function pruneAssetBackups(assetBackupRoot, options = {}) {
  const protection = await readBackupRetentionProtection(resolve(assetBackupRoot, "../.."));
  const backups = await collectManagedAssetBackups(assetBackupRoot);
  const plan = planAssetBackupRetention(backups, { ...options, protectedSafeNames: protection.safeNames });
  await Promise.all(plan.removePaths.map((backupPath) => rm(backupPath, { recursive: true, force: true })));
  return { kept: plan.kept, removed: plan.removed, bytes: plan.bytes };
}

export async function latestAssetBackup(assetBackupRoot, repoRoot, safeName, assetType) {
  const backups = await collectManagedAssetBackups(assetBackupRoot);
  const candidates = backups
    .filter((backup) => backup.species === safeName && backup.assetType === assetType)
    .sort(compareAssetBackupRecency);
  const backup = candidates[0] ?? null;
  if (!backup) {
    return {
      exists: false,
      path: "",
      updatedAt: "",
      bytes: 0,
    };
  }
  return {
    exists: true,
    path: repoRelativePath(repoRoot, backup.backupPath),
    updatedAt: new Date(backup.mtimeMs).toISOString(),
    bytes: backup.bytes,
    metadata: backup.metadata ?? {},
  };
}
