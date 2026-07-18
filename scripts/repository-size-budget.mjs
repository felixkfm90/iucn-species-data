import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MIB = 1024 * 1024;
export const SIZE_POLICY = Object.freeze({
  baseBytes: 20 * MIB,
  perSpeciesBytes: 2.5 * MIB,
  absoluteTreeLimitBytes: 500 * MIB,
  historyWarningBytes: 500 * MIB,
  historyActionBytes: 750 * MIB,
});

const PROJECT_DIRECTORIES = Object.freeze([
  ".github",
  "docs",
  "graphics",
  "scripts",
  "species-assets",
  "species-explorer",
]);
const SKIPPED_DIRECTORIES = new Set([
  "asset-backups",
  "backups",
  "cleanup-trash",
  "local-tools",
  "logs",
  "node_modules",
  "pipeline-asset-backups",
  "staging",
]);
const SKIPPED_ROOT_FILES = new Set(["errors.log", "update_github_only.bat", "update_local.bat"]);

function collectDirectoryStats(absoluteDirectory) {
  let bytes = 0;
  let files = 0;
  if (!fs.existsSync(absoluteDirectory)) return { bytes, files };
  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      const nested = collectDirectoryStats(path.join(absoluteDirectory, entry.name));
      bytes += nested.bytes;
      files += nested.files;
    } else if (entry.isFile()) {
      bytes += fs.statSync(path.join(absoluteDirectory, entry.name)).size;
      files += 1;
    }
  }
  return { bytes, files };
}

function rootFileStats(repoRoot) {
  let bytes = 0;
  let files = 0;
  for (const entry of fs.readdirSync(repoRoot, { withFileTypes: true })) {
    if (!entry.isFile() || SKIPPED_ROOT_FILES.has(entry.name)) continue;
    bytes += fs.statSync(path.join(repoRoot, entry.name)).size;
    files += 1;
  }
  return { bytes, files };
}

function gitPackStats(repoRoot) {
  return collectDirectoryStats(path.join(repoRoot, ".git", "objects", "pack"));
}

export function calculateRepositorySizeBudget(speciesCount, policy = SIZE_POLICY) {
  const dynamicBytes = policy.baseBytes + speciesCount * policy.perSpeciesBytes;
  return Math.min(dynamicBytes, policy.absoluteTreeLimitBytes);
}

export function auditRepositorySize(repoRoot = process.cwd(), policy = SIZE_POLICY) {
  const speciesList = JSON.parse(fs.readFileSync(path.join(repoRoot, "species_list.json"), "utf8"));
  if (!Array.isArray(speciesList)) throw new Error("species_list.json muss ein Array sein.");
  const rootStats = rootFileStats(repoRoot);
  const directoryStats = PROJECT_DIRECTORIES.map((directory) => ({
    directory,
    ...collectDirectoryStats(path.join(repoRoot, directory)),
  }));
  const treeBytes = rootStats.bytes + directoryStats.reduce((sum, entry) => sum + entry.bytes, 0);
  const treeFiles = rootStats.files + directoryStats.reduce((sum, entry) => sum + entry.files, 0);
  const budgetBytes = calculateRepositorySizeBudget(speciesList.length, policy);
  const history = gitPackStats(repoRoot);
  const warnings = [];
  if (history.bytes >= policy.historyActionBytes) {
    warnings.push("Git-Historie überschreitet die Eingriffsschwelle; vor einer bereinigenden Migration zuerst NAS-Backup und Wartungsfenster planen.");
  } else if (history.bytes >= policy.historyWarningBytes) {
    warnings.push("Git-Historie nähert sich der Eingriffsschwelle; Wachstum bei jedem Audit beobachten.");
  }
  return {
    speciesCount: speciesList.length,
    treeFiles,
    treeBytes,
    budgetBytes,
    remainingBytes: budgetBytes - treeBytes,
    withinBudget: treeBytes <= budgetBytes,
    root: rootStats,
    directories: directoryStats,
    gitHistory: {
      packFiles: history.files,
      packBytes: history.bytes,
      warningBytes: policy.historyWarningBytes,
      actionBytes: policy.historyActionBytes,
    },
    warnings,
  };
}

function formatMiB(bytes) {
  return `${(bytes / MIB).toFixed(1)} MiB`;
}

function runCli() {
  const result = auditRepositorySize();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Repository-Größenbudget: ${formatMiB(result.treeBytes)} von ${formatMiB(result.budgetBytes)} bei ${result.speciesCount} Arten.`);
    console.log(`Git-Historie (lokale Packdateien): ${formatMiB(result.gitHistory.packBytes)}.`);
    result.warnings.forEach((warning) => console.warn(`⚠ ${warning}`));
  }
  if (!result.withinBudget) {
    console.error(`Repository-Arbeitsstand überschreitet das flexible Größenbudget um ${formatMiB(-result.remainingBytes)}.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
