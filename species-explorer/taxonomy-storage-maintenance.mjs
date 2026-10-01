import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { readTaxonomyPublication, taxonomyPublicationPath } from "./taxonomy-publication-storage.mjs";
import { availableTaxonomySpace } from "./taxonomy-space-budget.mjs";
import { withTaxonomyCorrectionLock } from "./taxonomy-correction-lock.mjs";
import { acquireMasterJobLock } from "./taxonomy-master-job.mjs";
import { sha256File } from "./lightroom-search-storage.mjs";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PAIR = new RegExp(`^publication-${UUID}$`, "u");
const JOB = new RegExp(`^job-${UUID}$`, "u");
const DAY = 86400000;
export const TAXONOMY_RETENTION = Object.freeze({ minimumAgeDays: 7, extraPairs: 0, completedJobs: 0 });
const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const same = (a, b) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;

// Check every existing ancestor, including a Windows junction above the managed
// directory. Missing roots are fine for a read-only preview of a fresh install.
async function noLinks(filename) {
  let current = path.resolve(filename);
  for (;;) {
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error("Speicherpflege verweigert verknüpfte Verzeichnisse."); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (path.dirname(current) === current) return;
    current = path.dirname(current);
  }
}
async function readJson(filename) {
  await noLinks(filename);
  let stat;
  try { stat = await fs.stat(filename); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (stat.size > 16 * 1024 ** 2) throw new Error("Steuerdatei zu groß für die sichere Speicherpflege.");
  return JSON.parse(await fs.readFile(filename, "utf8"));
}
async function children(directory, pattern) {
  await noLinks(directory);
  try { return (await fs.readdir(directory)).filter((name) => pattern.test(name)).sort(); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}
async function tree(directory) {
  const hash = crypto.createHash("sha256");
  let bytes = 0, modified = 0;
  const files = [];
  async function visit(filename) {
    const stat = await fs.lstat(filename);
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw new Error("Unbekannter oder verknüpfter Eintrag; bleibt erhalten.");
    hash.update(JSON.stringify([path.relative(directory, filename), stat.size, stat.mtimeMs, stat.ino]));
    modified = Math.max(modified, stat.mtimeMs);
    if (stat.isFile()) { bytes += stat.size; files.push(path.relative(directory, filename).split(path.sep).join("/")); }
    else for (const entry of (await fs.readdir(filename)).sort()) await visit(path.join(filename, entry));
  }
  await noLinks(directory);
  await visit(directory);
  return { bytes, modified, files, fingerprint: hash.digest("hex") };
}

function managedFile(kind, file, index) {
  const masterFile = /^(manifest\.json|(?:taxonomy-master|build-inputs|build-reuse-plan|build-dependencies)\.sqlite(?:-journal|-wal|-shm)?)$/u;
  const searchFile = /^(manifest\.json|taxonomy-search\.sqlite(?:-journal|-wal|-shm)?)$/u;
  if (kind === "pair") return (index === 0 ? masterFile : searchFile).test(file);
  if (kind === "job") return /^(recipe|state|pause)\.json$|^(col|provider-\d+)\.jsonl$/u.test(file)
    || (file.startsWith("candidate/") && masterFile.test(file.slice(10)));
  return file === "preparation.json"
    || (file.startsWith("taxonomy/master/staging/") && masterFile.test(file.slice(24)))
    || (file.startsWith("lightroom/staging/") && searchFile.test(file.slice(18)));
}

async function inspect({ taxonomyRoot, searchRoot, now }) {
  taxonomyRoot = path.resolve(taxonomyRoot); searchRoot = path.resolve(searchRoot);
  if (same(taxonomyRoot, searchRoot) || !same(path.dirname(taxonomyRoot), path.dirname(searchRoot))) {
    throw new Error("Speicherpflege benötigt getrennte Datenbankordner mit gemeinsamem Elternordner.");
  }
  await noLinks(taxonomyRoot); await noLinks(searchRoot);
  const pointerFile = taxonomyPublicationPath(taxonomyRoot);
  const pointerJson = await readJson(pointerFile);
  const pointer = readTaxonomyPublication(taxonomyRoot);
  if (pointerJson && (!pointer || !same(path.resolve(pointer.searchRoot), searchRoot))) throw new Error("Der Aktivzeiger gehört nicht zu diesen Speicherordnern.");
  const jobsRoot = path.join(taxonomyRoot, "master", "build-jobs");
  const current = await readJson(path.join(jobsRoot, "current.json"));
  if (current && (current.schemaVersion !== 1 || !JOB.test(current.id))) throw new Error("Unklarer aktueller Aufbauauftrag; Bereinigung gesperrt.");
  const staging = await readJson(path.join(taxonomyRoot, "master", "staging", "manifest.json"));
  const protectedPairs = new Set([pointer?.active?.id, pointer?.previous?.id].filter(Boolean));
  const items = [], recipes = new Map();
  const warnings = [];
  let protectAllPairs = false;
  // A pointer alone is not a backup. Require the recorded bytes of BOTH the
  // active pair and its one rollback pair before offering older copies.
  try {
    if (!pointer?.previous) throw new Error("Kein gemeinsamer Vorgänger als Backup vorhanden");
    for (const entry of [pointer.active, pointer.previous]) {
      const masterDir = entry.legacy ? path.join(taxonomyRoot, "master", "active") : path.join(taxonomyRoot, "master", "releases", entry.id);
      const searchDir = entry.legacy ? path.join(searchRoot, "active") : path.join(searchRoot, "releases", entry.id);
      const master = await readJson(path.join(masterDir, "manifest.json"));
      const search = await readJson(path.join(searchDir, "manifest.json"));
      const masterFile = path.join(masterDir, "taxonomy-master.sqlite"), searchFile = path.join(searchDir, "taxonomy-search.sqlite");
      await noLinks(masterFile); await noLinks(searchFile);
      if (master?.candidateId !== entry.masterVersion || search?.packageId !== entry.packageId
        || search?.masterVersion !== entry.masterVersion
        || `sha256:${await sha256File(masterFile)}` !== entry.masterChecksum
        || `sha256:${await sha256File(searchFile)}` !== entry.packageChecksum) throw new Error("Aktiver Stand oder Vorgänger ist unvollständig oder verändert");
    }
  } catch (error) { protectAllPairs = true; warnings.push(`${error.message}. Ältere Datenbankpaare bleiben geschützt.`); }
  const cutoff = now().getTime() - TAXONOMY_RETENTION.minimumAgeDays * DAY;
  async function item(kind, id, directories, verify) {
    const row = { kind, id, directories, bytes: 0, modified: 0, fingerprints: [], reason: "", eligible: false };
    try {
      for (const [index, directory] of directories.entries()) {
        const snapshot = await tree(directory);
        row.bytes += snapshot.bytes; row.modified = Math.max(row.modified, snapshot.modified);
        row.fingerprints.push(snapshot.fingerprint);
        if (snapshot.files.some((file) => !managedFile(kind, file, index))) throw new Error("Enthält nicht vom Aufbau verwaltete Dateien");
      }
      await verify(row);
    } catch (error) { row.reason = `Nicht sicher prüfbar: ${error.message}`; }
    items.push(row); return row;
  }
  for (const id of await children(jobsRoot, JOB)) {
    await item("job", id, [path.join(jobsRoot, id)], async (row) => {
      const recipe = await readJson(path.join(row.directories[0], "recipe.json"));
      recipes.set(id, recipe);
      if (!recipe || recipe.id !== id || recipe.schemaVersion !== 1 || !same(path.resolve(recipe.taxonomyRoot), taxonomyRoot)
        || recipe.revision !== digest({ ...recipe, revision: undefined }) || !Array.isArray(recipe.binding?.files)) {
        protectAllPairs = true; row.reason = "Unvollständiges Auftragsrezept"; return;
      }
      const state = await readJson(path.join(row.directories[0], "state.json"));
      if (id === current?.id) row.reason = "Letzter Aufbauauftrag";
      else if (recipe.revision === staging?.buildJobRevision) row.reason = "Gehört zum aktuellen Kandidaten";
      else if (state?.id !== id || state.status !== "ready") row.reason = "Offener oder möglicherweise fortsetzbarer Auftrag";
    });
  }
  const jobs = items.filter((row) => row.kind === "job" && !row.reason).sort((a, b) => b.modified - a.modified || a.id.localeCompare(b.id));
  for (const [index, row] of jobs.entries()) {
    if (row.modified > cutoff) row.reason = "Jünger als sieben Tage";
    else if (index < TAXONOMY_RETENTION.completedJobs) row.reason = "Zusätzlicher abgeschlossener Aufbauauftrag";
    else row.eligible = true;
  }
  for (const row of items.filter((entry) => entry.kind === "job" && !entry.eligible)) {
    const recipe = recipes.get(row.id);
    if (!Array.isArray(recipe?.binding?.files)) { protectAllPairs = true; continue; }
    for (const [filename] of recipe.binding.files) {
      if (typeof filename !== "string") { protectAllPairs = true; continue; }
      // Retained jobs may depend on older immutable pairs, even if not current.
      for (const segment of filename.split(/[\\/]/u)) if (PAIR.test(segment)) protectedPairs.add(segment);
    }
  }
  if (current && !recipes.has(current.id)) throw new Error("Der letzte Aufbauauftrag fehlt oder ist nicht sicher lesbar; Bereinigung gesperrt.");
  const masterReleases = path.join(taxonomyRoot, "master", "releases"), searchReleases = path.join(searchRoot, "releases");
  const pairIds = new Set([...await children(masterReleases, PAIR), ...await children(searchReleases, PAIR)]);
  for (const id of pairIds) {
    await item("pair", id, [path.join(masterReleases, id), path.join(searchReleases, id)], async (row) => {
      const master = await readJson(path.join(row.directories[0], "manifest.json"));
      const search = await readJson(path.join(row.directories[1], "manifest.json"));
      if (!master?.candidateId || !search?.packageId || search.masterVersion !== master.candidateId) row.reason = "Unvollständiges oder fremdes Datenbankpaar";
      else if (protectedPairs.has(id)) row.reason = "Aktiv, direkter Rückweg oder von einem Auftrag benötigt";
      else if (protectAllPairs) row.reason = "Abhängigkeiten eines Auftrags sind unklar";
    });
  }
  const pairs = items.filter((row) => row.kind === "pair" && !row.reason).sort((a, b) => b.modified - a.modified || a.id.localeCompare(b.id));
  for (const [index, row] of pairs.entries()) {
    if (row.modified > cutoff) row.reason = "Jünger als sieben Tage";
    else if (index < TAXONOMY_RETENTION.extraPairs) row.reason = "Zusätzlicher Sicherheitsstand";
    else row.eligible = true;
  }
  for (const name of await children(searchRoot, new RegExp(`^\\.publication-${UUID}$`, "u"))) {
    const id = name.slice(1);
    await item("preparation", id, [path.join(searchRoot, name)], async (row) => {
      const marker = await readJson(path.join(row.directories[0], "preparation.json"));
      if (marker?.schemaVersion !== 1 || marker.id !== id || !same(marker.taxonomyRoot || "", taxonomyRoot)
        || !same(marker.searchRoot || "", searchRoot)) row.reason = "Vorbereitung ohne sichere Herkunftskennung";
      else if (protectedPairs.has(id) || protectAllPairs) row.reason = "Möglicherweise noch benötigte Vorbereitung";
      else if (row.modified > cutoff) row.reason = "Jünger als sieben Tage";
      else row.eligible = true;
    });
  }
  items.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  const revision = digest({ taxonomyRoot, searchRoot, pointerJson, current, staging, items });
  return { revision, policy: TAXONOMY_RETENTION, warnings, items, freeBytes: await availableTaxonomySpace(taxonomyRoot),
    managedBytes: items.reduce((sum, row) => sum + row.bytes, 0),
    reclaimableBytes: items.filter((row) => row.eligible).reduce((sum, row) => sum + row.bytes, 0) };
}

export function createTaxonomyStorageMaintenance({ taxonomyRoot, searchRoot, controller, now = () => new Date(),
  remove = (directory) => fs.rm(directory, { recursive: true, force: false, maxRetries: 2, retryDelay: 80 }),
}) {
  const options = { taxonomyRoot, searchRoot, now };
  // Preview does not inspect photo catalogs, start workers, or delete anything.
  const exclusive = async (operation) => {
    await noLinks(taxonomyRoot); await noLinks(searchRoot);
    await noLinks(path.join(taxonomyRoot, "master", "build-jobs", "control-lock.sqlite"));
    await noLinks(path.join(taxonomyRoot, "master", "build-jobs", "execution-lock.sqlite"));
    await noLinks(path.join(path.dirname(path.resolve(taxonomyRoot)), "corrections", "edit-lock.sqlite"));
    return controller.exclusive(() => withTaxonomyCorrectionLock(taxonomyRoot, async () => {
      const unlock = await acquireMasterJobLock(taxonomyRoot);
      try { return await operation(); } finally { unlock(); }
    }));
  };
  return {
    preview: () => exclusive(() => inspect(options)),
    async clean({ confirmed, revision } = {}) {
      if (confirmed !== true || typeof revision !== "string") throw new Error("Speicherbereinigung benötigt eine bestätigte aktuelle Vorschau.");
      return exclusive(async () => {
        const plan = await inspect(options);
        if (plan.revision !== revision) throw new Error("Der Datenbestand wurde seit der Vorschau geändert. Bitte erneut prüfen; es wurde nichts entfernt.");
        const removed = [], failed = [];
        for (const row of plan.items.filter((entry) => entry.eligible)) {
          try {
            // Only internally derived, enumerated UUID children are ever removed.
            for (const [index, directory] of row.directories.entries()) {
              await noLinks(directory);
              if ((await tree(directory)).fingerprint !== row.fingerprints[index]) throw new Error("Eintrag wurde während der Bereinigung verändert; bleibt erhalten.");
              await remove(directory);
            }
            removed.push({ kind: row.kind, id: row.id, bytes: row.bytes });
          } catch (error) { failed.push({ kind: row.kind, id: row.id, error: error.message }); }
        }
        return { removed, failed, freedBytes: removed.reduce((sum, row) => sum + row.bytes, 0) };
      });
    },
  };
}
