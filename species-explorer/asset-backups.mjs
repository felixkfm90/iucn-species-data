import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, relative } from "node:path";

export const SPECIES_LIST_BACKUP_RETENTION_COUNT = 20;
export const PIPELINE_LOG_RETENTION_COUNT = 20;
export const ASSET_BACKUP_RETENTION_COUNT = 1;
export const ASSET_BACKUP_GLOBAL_BYTES = 500 * 1024 * 1024;

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
}) {
  const backupDirectory = join(assetBackupRoot, species.safeName, assetType);
  const tempDirectory = join(assetBackupRoot, species.safeName, `${assetType}.tmp-${randomUUID()}`);
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
    await rm(backupDirectory, { recursive: true, force: true });
    await rename(tempDirectory, backupDirectory);
    return repoRelativePath(repoRoot, backupDirectory);
  } catch (error) {
    await rm(tempDirectory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function pruneSpeciesListBackups(
  backupDir,
  keepCount = SPECIES_LIST_BACKUP_RETENTION_COUNT,
) {
  const entries = await readdir(backupDir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => (
      entry.isFile()
      && /^species_list-\d{8}T\d{6}Z-.+-[0-9a-f]{8}\.json$/.test(entry.name)
    ))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, "en"));
  const remove = candidates.slice(keepCount);
  await Promise.all(remove.map((name) => unlink(join(backupDir, name))));
  return {
    kept: Math.min(candidates.length, keepCount),
    removed: remove.length,
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
        continue;
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

export async function pruneAssetBackups(assetBackupRoot, {
  keepCount = ASSET_BACKUP_RETENTION_COUNT,
  maxBytes = ASSET_BACKUP_GLOBAL_BYTES,
} = {}) {
  const backups = await collectManagedAssetBackups(assetBackupRoot);
  const removePaths = new Set();
  const groups = new Map();
  for (const backup of backups) {
    const key = `${backup.species}:${backup.assetType}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(backup);
  }
  for (const group of groups.values()) {
    group.sort((left, right) => right.mtimeMs - left.mtimeMs || right.name.localeCompare(left.name));
    for (const backup of group.slice(keepCount)) {
      removePaths.add(backup.backupPath);
    }
  }

  const retained = backups
    .filter((backup) => !removePaths.has(backup.backupPath))
    .sort((left, right) => left.mtimeMs - right.mtimeMs || left.name.localeCompare(right.name));
  let retainedBytes = retained.reduce((sum, backup) => sum + backup.bytes, 0);
  for (const backup of retained) {
    if (retainedBytes <= maxBytes) break;
    removePaths.add(backup.backupPath);
    retainedBytes -= backup.bytes;
  }

  await Promise.all([...removePaths].map((backupPath) => rm(backupPath, { recursive: true, force: true })));
  return {
    kept: backups.length - removePaths.size,
    removed: removePaths.size,
    bytes: retainedBytes,
  };
}

export async function latestAssetBackup(assetBackupRoot, repoRoot, safeName, assetType) {
  const backups = await collectManagedAssetBackups(assetBackupRoot);
  const candidates = backups
    .filter((backup) => backup.species === safeName && backup.assetType === assetType)
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.name.localeCompare(left.name));
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
