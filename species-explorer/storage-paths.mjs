import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

export const EXPLORER_REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
export const STORAGE_CONFIG_FILE = "storage-path.json";

export function legacyExplorerDataRoot(environment = process.env) {
  const local = String(environment.LOCALAPPDATA || "").trim();
  return local ? path.join(local, "FN Wildlife Travel", "Arten-Explorer")
    : path.join(os.homedir(), ".fn-wildlife-travel", "arten-explorer");
}

export function sameStoragePath(left, right) {
  const normalize = (value) => process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value);
  return normalize(left) === normalize(right);
}

function noStorageLinks(target) {
  for (let current = path.resolve(target);;) {
    const info = fs.lstatSync(current, { throwIfNoEntry: false });
    if (info?.isSymbolicLink()) throw new Error(`Verzeichnislink im bestätigten Datenpfad: ${current}`);
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

function validateRelocation(value, dataRoot, repoRoot) {
  if (!value.legacyDataRoot && !value.previousRepoRoot && !value.migrationRevision) return;
  if (![value.legacyDataRoot, value.previousRepoRoot].every((entry) => typeof entry === "string" && path.isAbsolute(entry))
      || !/^[a-f0-9]{64}$/.test(value.migrationRevision || "")) throw new Error("Speicherumzug ohne gebundenen Nachweis.");
  const file = path.join(dataRoot, ".storage-migration.json");
  noStorageLinks(file);
  const journal = JSON.parse(fs.readFileSync(file, "utf8"));
  const plan = journal.plan;
  const body = { schemaVersion: plan?.schemaVersion, repoRoot: plan?.repoRoot, sourceRoot: plan?.sourceRoot,
    targetRoot: plan?.targetRoot, files: plan?.files, totalBytes: plan?.totalBytes };
  const revision = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const relative = plan && path.relative(plan.repoRoot, plan.targetRoot);
  if (journal.schemaVersion !== 1 || journal.state !== "committed" || plan?.schemaVersion !== 1
      || revision !== value.migrationRevision || plan.revision !== revision
      || !sameStoragePath(plan.sourceRoot, value.legacyDataRoot) || !sameStoragePath(plan.repoRoot, value.previousRepoRoot)
      || !relative || relative.startsWith("..") || path.isAbsolute(relative)
      || !sameStoragePath(path.join(repoRoot, relative), dataRoot)
      || !Array.isArray(plan.files) || !Array.isArray(journal.copied) || journal.copied.length !== plan.files.length
      || new Set(journal.copied.map((entry) => entry.relative)).size !== plan.files.length
      || journal.copied.some(({ sha256, ...entry }) => !/^[a-f0-9]{64}$/.test(sha256 || "")
        || !plan.files.some((fileEntry) => JSON.stringify(fileEntry) === JSON.stringify(entry)))) {
    throw new Error("Speicherumzug nicht vollständig oder Nachweis passt nicht zum Datenziel.");
  }
}

export function readExplorerStorageConfig(repoRoot = EXPLORER_REPO_ROOT) {
  noStorageLinks(path.join(repoRoot, STORAGE_CONFIG_FILE));
  let value;
  try { value = JSON.parse(fs.readFileSync(path.join(repoRoot, STORAGE_CONFIG_FILE), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw new Error(`Speicherkonfiguration nicht lesbar: ${error.message}`); }
  if (value?.schemaVersion !== 1 || value.state !== "ready" || typeof value.dataRoot !== "string"
      || (!path.isAbsolute(value.dataRoot) && value.dataRoot !== "Daten")
      || (value.legacyDataRoot && !path.isAbsolute(value.legacyDataRoot))
      || (value.previousRepoRoot && !path.isAbsolute(value.previousRepoRoot))) {
    throw new Error("Ungültige Speicherkonfiguration; kein leerer Ersatzbestand wird geöffnet.");
  }
  const dataRoot = path.resolve(repoRoot, value.dataRoot);
  noStorageLinks(dataRoot);
  if (!fs.existsSync(dataRoot) || !fs.statSync(dataRoot).isDirectory()) {
    throw new Error(`Der bestätigte Datenordner fehlt: ${dataRoot}. Bitte den Speicherwechsel prüfen.`);
  }
  validateRelocation(value, dataRoot, repoRoot);
  return { ...value, dataRoot };
}

// Historical proofs keep their original bytes and hashes. Only filesystem
// access is relocated, by an explicit locally verified migration contract.
export function relocatedStoragePath(value, { repoRoot = EXPLORER_REPO_ROOT, config = readExplorerStorageConfig(repoRoot) } = {}) {
  if (!config || typeof value !== "string" || !path.isAbsolute(value)) return value;
  for (const [oldRoot, newRoot] of [[config.legacyDataRoot, config.dataRoot], [config.previousRepoRoot, repoRoot]]) {
    if (!oldRoot) continue;
    const relative = path.relative(oldRoot, value);
    if (sameStoragePath(oldRoot, value)) return newRoot;
    if (relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) return path.join(newRoot, relative);
  }
  return value;
}

export function explorerStoragePaths({ repoRoot = EXPLORER_REPO_ROOT, environment = process.env } = {}) {
  const override = String(environment.FN_EXPLORER_DATA_ROOT || "").trim();
  if (override && !path.isAbsolute(override)) throw new Error("FN_EXPLORER_DATA_ROOT muss absolut sein.");
  const config = override ? null : readExplorerStorageConfig(repoRoot);
  const legacy = legacyExplorerDataRoot(environment);
  // An existing installation stays visible until a verified migration is explicitly committed.
  // Fixtures/other repositories never fall back to this machine's productive installation.
  const useLegacy = !override && !config && sameStoragePath(repoRoot, EXPLORER_REPO_ROOT) && fs.existsSync(legacy);
  const dataRoot = override ? path.resolve(override) : config?.dataRoot || (useLegacy ? legacy : path.join(repoRoot, "Daten"));
  return { dataRoot, taxonomyRoot: path.join(dataRoot, "taxonomy"), searchRoot: path.join(dataRoot, "lightroom"),
    correctionRoot: path.join(dataRoot, "corrections"), handoffRoot: path.join(dataRoot, "handoff"),
    publicationRoot: path.join(dataRoot, "taxonomy-publication"),
    mode: override ? "explicit" : config ? "configured" : useLegacy ? "legacy-migration-required" : "local-default" };
}
