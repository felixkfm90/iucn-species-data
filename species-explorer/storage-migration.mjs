import fs from "node:fs/promises";
import { createReadStream, constants } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { finished } from "node:stream/promises";
import { atomicWriteJson } from "./taxonomy-storage.mjs";
import { sameStoragePath, STORAGE_CONFIG_FILE } from "./storage-paths.mjs";

const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const isWithin = (root, value) => { const relative = path.relative(root, value); return relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative); };

async function assertConfigurationUnchanged(repoRoot, journal) {
  const raw = await fs.readFile(path.join(repoRoot, STORAGE_CONFIG_FILE), "utf8").catch((error) => { if (error.code === "ENOENT") return null; throw error; });
  if (raw === journal.previousConfig) return;
  let current;
  try { current = JSON.parse(raw); } catch { throw new Error("Speicherkonfiguration wurde unabhängig geändert."); }
  if (current?.migrationRevision !== journal.plan.revision || current.legacyDataRoot !== journal.plan.sourceRoot
      || current.previousRepoRoot !== journal.plan.repoRoot || !["migrating", "ready"].includes(current.state)
      || !sameStoragePath(path.resolve(repoRoot, current.dataRoot || ""), journal.plan.targetRoot)) {
    throw new Error("Speicherkonfiguration wurde unabhängig geändert; nichts wird überschrieben.");
  }
}

function validatePlan(plan) {
  const body = { schemaVersion: plan?.schemaVersion, repoRoot: plan?.repoRoot, sourceRoot: plan?.sourceRoot,
    targetRoot: plan?.targetRoot, files: plan?.files, totalBytes: plan?.totalBytes };
  if (body.schemaVersion !== 1 || ![body.repoRoot, body.sourceRoot, body.targetRoot].every((value) => typeof value === "string" && path.isAbsolute(value))
      || !Array.isArray(body.files) || body.files.some((file) => typeof file.relative !== "string" || !file.relative
        || path.isAbsolute(file.relative) || file.relative.split(/[\\/]/).some((part) => !part || [".", ".."].includes(part))
        || /[:\0]/.test(file.relative) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !Number.isFinite(file.mtimeMs))
      || new Set(body.files.map((file) => file.relative)).size !== body.files.length
      || body.totalBytes !== body.files.reduce((sum, file) => sum + file.bytes, 0) || digest(body) !== plan.revision
      || sameStoragePath(body.sourceRoot, path.parse(body.sourceRoot).root)
      || !isWithin(body.repoRoot, body.targetRoot) || sameStoragePath(body.sourceRoot, body.targetRoot)
      || isWithin(body.sourceRoot, body.targetRoot) || isWithin(body.targetRoot, body.sourceRoot)) throw new Error("Ungültiger/manipulierter Speicherwechselplan.");
  return { ...body, revision: plan.revision };
}

function validateJournal(journal) {
  const plan = validatePlan(journal?.plan);
  if (journal.schemaVersion !== 1 || !Array.isArray(journal.copied)
      || !(journal.previousConfig === null || typeof journal.previousConfig === "string")
      || new Set(journal.copied.map((file) => file.relative)).size !== journal.copied.length
      || journal.copied.some(({ sha256, ...file }) => !/^[a-f0-9]{64}$/.test(sha256 || "")
        || !plan.files.some((entry) => digest(entry) === digest(file)))
      || (journal.removeIntent && !plan.files.some((file) => file.relative === journal.removeIntent))
      || (journal.copyIntent && (!plan.files.some((file) => file.relative === journal.copyIntent.relative)
        || !/^[a-f0-9]{64}$/.test(journal.copyIntent.sha256 || "")))
      || (journal.removedSourcePaths && (!Array.isArray(journal.removedSourcePaths)
        || new Set(journal.removedSourcePaths).size !== journal.removedSourcePaths.length
        || journal.removedSourcePaths.some((file) => !plan.files.some((entry) => entry.relative === file))))) {
    throw new Error("Ungültiger/manipulierter Speicherwechsel-Nachweis.");
  }
  return journal;
}

async function withMigrationLock(repoRoot, action) {
  await assertNoStorageLinks(repoRoot);
  const filename = path.join(repoRoot, "storage-migration-lock.sqlite");
  await assertNoStorageLinks(filename);
  const lock = new DatabaseSync(filename);
  try {
    try { lock.exec("PRAGMA busy_timeout=0; BEGIN IMMEDIATE"); }
    catch (error) { throw new Error("Ein anderer Speicherwechsel läuft bereits.", { cause: error }); }
    return await action();
  } finally { lock.close(); }
}

export async function migrationConsumersClosed({ sourceRoot }) {
  if (process.platform !== "win32") throw new Error("Produktiver Schließnachweis ist nur für den Windows-Explorer implementiert.");
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "@(Get-Process -Name Lightroom,electron -ErrorAction SilentlyContinue | Select-Object Id,ProcessName) | ConvertTo-Json -Compress"],
  { windowsHide: true, encoding: "utf8", timeout: 15000 });
  if (stdout.trim() && JSON.parse(stdout).length !== 0) return false;
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 1000);
  try { await fetch("http://127.0.0.1:4177/api/taxonomy/master/status", { signal: controller.signal }); return false; }
  catch { /* An offline UI is not enough: inspect persisted workers too. */ }
  finally { clearTimeout(timeout); }
  const jobs = path.join(sourceRoot, "taxonomy", "master", "build-jobs");
  for (const job of await fs.readdir(jobs, { withFileTypes: true }).catch((error) => { if (error.code === "ENOENT") return []; throw error; })) {
    if (!job.isDirectory()) continue;
    const state = await fs.readFile(path.join(jobs, job.name, "state.json"), "utf8").then(JSON.parse).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
    if (state?.status !== "building") continue;
    if (!Number.isSafeInteger(state.pid) || state.pid < 1) return false;
    try { process.kill(state.pid, 0); return false; }
    catch (error) { if (error.code !== "ESRCH") return false; }
  }
  return true;
}

export async function assertNoStorageLinks(target) {
  let current = path.resolve(target);
  for (;;) {
    const info = await fs.lstat(current).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
    if (info?.isSymbolicLink()) throw new Error(`Verzeichnislink im Speicherwechsel: ${current}`);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export async function inventoryStorage(root) {
  await assertNoStorageLinks(root);
  const entries = [];
  async function collect(directory) {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isSymbolicLink()) throw new Error(`Verzeichnislink im Bestand: ${file}`);
      if (item.isDirectory()) await collect(file);
      else if (item.isFile()) {
        const info = await fs.stat(file);
        entries.push({ relative: path.relative(root, file), bytes: info.size, mtimeMs: info.mtimeMs });
      } else throw new Error(`Kein normaler Bestandseintrag: ${file}`);
    }
  }
  await collect(root);
  return entries.sort((a, b) => a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0);
}

export async function planStorageMigration({ repoRoot, sourceRoot, targetRoot = path.join(repoRoot, "Daten") }) {
  for (const value of [repoRoot, sourceRoot, targetRoot]) if (!path.isAbsolute(value)) throw new Error("Speicherwechsel verlangt absolute Pfade.");
  sourceRoot = path.resolve(sourceRoot); targetRoot = path.resolve(targetRoot); repoRoot = path.resolve(repoRoot);
  if (sameStoragePath(sourceRoot, targetRoot) || isWithin(sourceRoot, targetRoot) || isWithin(targetRoot, sourceRoot)
      || sameStoragePath(sourceRoot, path.parse(sourceRoot).root)
      || !isWithin(repoRoot, targetRoot) || targetRoot === repoRoot) throw new Error("Unzulässige überlappende Speicherziele.");
  await assertNoStorageLinks(targetRoot);
  const files = await inventoryStorage(sourceRoot);
  const body = { schemaVersion: 1, repoRoot, sourceRoot, targetRoot, files, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0) };
  return { ...body, revision: digest(body) };
}

async function hashFile(file) {
  const hash = crypto.createHash("sha256");
  const stream = createReadStream(file);
  for await (const chunk of stream) hash.update(chunk);
  // Windows must have released the file handle before a confirmed move or
  // fixture cleanup starts; reaching the readable end alone is not sufficient.
  await finished(stream, { cleanup: true });
  return hash.digest("hex");
}

export async function prepareStorageMigration(plan, { confirmed = false, signal, onProgress = () => {}, minimumReserveBytes = 2 * 1024 ** 3 } = {}) {
  plan = validatePlan(plan);
  return withMigrationLock(plan.repoRoot, () => prepareStorageMigrationLocked(plan, { confirmed, signal, onProgress, minimumReserveBytes }));
}

async function prepareStorageMigrationLocked(plan, { confirmed, signal, onProgress, minimumReserveBytes }) {
  if (!confirmed) throw new Error("Speicherwechsel muss ausdrücklich bestätigt sein.");
  const fresh = await planStorageMigration(plan);
  if (fresh.revision !== plan.revision) throw new Error("Der freigegebene Ausgangsbestand hat sich geändert.");
  const journalPath = path.join(plan.targetRoot, ".storage-migration.json");
  let journal;
  try { journal = JSON.parse(await fs.readFile(journalPath, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (journal && (journal.plan.revision !== plan.revision || !["copying", "failed", "prepared"].includes(journal.state))) {
    throw new Error("Anderer oder bereits übernommener Speicherwechsel am Ziel.");
  }
  if (journal) validateJournal(journal);
  if (!journal) {
    const present = await fs.readdir(plan.targetRoot).catch((error) => { if (error.code === "ENOENT") return []; throw error; });
    if (present.length) throw new Error("Das Datenziel ist nicht leer; nichts wird überschrieben.");
    await fs.mkdir(plan.targetRoot, { recursive: true });
    const previousConfig = await fs.readFile(path.join(plan.repoRoot, STORAGE_CONFIG_FILE), "utf8").catch((error) => { if (error.code === "ENOENT") return null; throw error; });
    journal = { schemaVersion: 1, state: "copying", plan, copied: [], previousConfig, startedAt: new Date().toISOString() };
  }
  const remaining = plan.totalBytes - journal.copied.reduce((sum, file) => sum + file.bytes, 0);
  const space = await fs.statfs(plan.targetRoot);
  if (space.bavail * space.bsize < remaining + minimumReserveBytes) throw new Error("Zu wenig Platz für vollständige Kopie und Reserve.");
  await atomicWriteJson(journalPath, journal);
  try {
    for (const file of plan.files) {
      signal?.throwIfAborted();
      const from = path.join(plan.sourceRoot, file.relative), to = path.join(plan.targetRoot, file.relative);
      await assertNoStorageLinks(from); await assertNoStorageLinks(to);
      const saved = journal.copied.find((entry) => entry.relative === file.relative);
      journal.currentFile = file.relative;
      onProgress({ state: "copying", file: file.relative, files: journal.copied.length, total: plan.files.length });
      await atomicWriteJson(journalPath, journal);
      if (saved) {
        if (await hashFile(from) !== saved.sha256 || await hashFile(to) !== saved.sha256) throw new Error(`Prüfwert nach Wiederaufnahme verändert: ${file.relative}`);
        continue;
      }
      await fs.mkdir(path.dirname(to), { recursive: true });
      const sourceHash = await hashFile(from);
      const existing = await fs.lstat(to).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
      if (existing) {
        if (!existing.isFile() || journal.copyIntent?.relative !== file.relative || journal.copyIntent.sha256 !== sourceHash) {
          throw new Error(`Unbekannte Zieldatei wird nicht überschrieben: ${file.relative}`);
        }
      } else {
        journal.copyIntent = { relative: file.relative, sha256: sourceHash };
        await atomicWriteJson(journalPath, journal);
        await fs.copyFile(from, to, constants.COPYFILE_EXCL);
      }
      onProgress({ state: "verifying", file: file.relative, files: journal.copied.length, total: plan.files.length });
      const [freshSourceHash, targetHash] = await Promise.all([hashFile(from), hashFile(to)]);
      if (sourceHash !== freshSourceHash || sourceHash !== targetHash) throw new Error(`Kopie stimmt nicht überein: ${file.relative}`);
      journal.copied.push({ ...file, sha256: sourceHash });
      journal.copyIntent = null;
      await atomicWriteJson(journalPath, journal);
    }
    signal?.throwIfAborted();
    if (digest(await inventoryStorage(plan.sourceRoot)) !== digest(plan.files)) throw new Error("Ausgangsbestand wurde während des Kopierens geändert.");
    journal.state = "prepared"; journal.currentFile = ""; journal.completedAt = new Date().toISOString(); journal.error = "";
    await atomicWriteJson(journalPath, journal);
    return journal;
  } catch (error) {
    journal.state = "failed"; journal.error = error.message;
    await atomicWriteJson(journalPath, journal);
    throw error;
  }
}

// Final activation is deliberately separate from copying. No filesystem alias
// or AppData junction: verified access relocation leaves historic proofs intact.
export async function commitStorageMigration(options) {
  return withMigrationLock(options.repoRoot, () => commitStorageMigrationLocked(options));
}

async function commitStorageMigrationLocked({ repoRoot, targetRoot, sourceRoot, consumersClosed = false, checkConsumersClosed = migrationConsumersClosed }) {
  if (!consumersClosed) throw new Error("Explorer und Lightroom müssen vor dem Pfadwechsel geschlossen sein.");
  if (!await checkConsumersClosed({ repoRoot, sourceRoot })) throw new Error("Explorer, Lightroom oder ein gespeicherter Aufbau laufen noch.");
  const journalPath = path.join(targetRoot, ".storage-migration.json");
  const journal = validateJournal(JSON.parse(await fs.readFile(journalPath, "utf8")));
  await assertConfigurationUnchanged(repoRoot, journal);
  if (!["prepared", "moving", "move-failed", "committed"].includes(journal.state) || !sameStoragePath(journal.plan.sourceRoot, sourceRoot)
      || !sameStoragePath(journal.plan.targetRoot, targetRoot) || !sameStoragePath(journal.plan.repoRoot, repoRoot)) throw new Error("Kein passender geprüfter Speicherwechsel.");
  await assertNoStorageLinks(sourceRoot); await assertNoStorageLinks(targetRoot);
  if (journal.copied.length !== journal.plan.files.length) throw new Error("Die geprüfte Kopie ist unvollständig.");
  // Verify all copied bytes before deleting a single original. Retrying never
  // assumes that an already present target is still the originally copied file.
  for (const file of journal.copied) {
    const target = path.join(targetRoot, file.relative);
    await assertNoStorageLinks(target);
    if (await hashFile(target) !== file.sha256) throw new Error(`Ziel verändert: ${file.relative}`);
    await fs.utimes(target, new Date(file.mtimeMs), new Date(file.mtimeMs));
  }
  const removed = new Set(journal.removedSourcePaths || []);
  if (journal.removeIntent && !removed.has(journal.removeIntent)) {
    const intent = path.join(sourceRoot, journal.removeIntent);
    const attributes = await fs.lstat(intent).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
    if (!attributes) removed.add(journal.removeIntent); // Target bytes were freshly verified above.
  }
  const expected = journal.plan.files.filter((file) => !removed.has(file.relative));
  const actual = await inventoryStorage(sourceRoot);
  if (digest(actual) !== digest(expected)) throw new Error("Der Quellbestand hat sich geändert; Originale werden nicht entfernt.");
  const config = { schemaVersion: 1, state: "ready", dataRoot: sameStoragePath(targetRoot, path.join(repoRoot, "Daten")) ? "Daten" : targetRoot,
    legacyDataRoot: sourceRoot, previousRepoRoot: repoRoot, migrationRevision: journal.plan.revision, updatedAt: new Date().toISOString() };
  // A restart during source cleanup must not expose the partially emptied old
  // installation. The pending config fails closed until the migration finishes.
  await atomicWriteJson(path.join(repoRoot, STORAGE_CONFIG_FILE), { ...config, state: "migrating" });
  journal.state = "moving";
  journal.removedSourcePaths = [...removed];
  await atomicWriteJson(journalPath, journal);
  try {
    for (const file of expected) {
      const original = path.join(sourceRoot, file.relative);
      await assertNoStorageLinks(original);
      if (await hashFile(original) !== journal.copied.find((entry) => entry.relative === file.relative).sha256) throw new Error(`Quelle verändert: ${file.relative}`);
      if (!await checkConsumersClosed({ repoRoot, sourceRoot })) throw new Error("Ein Verbraucher wurde während des Speicherwechsels geöffnet.");
      journal.removeIntent = file.relative;
      await atomicWriteJson(journalPath, journal);
      await fs.unlink(original); // Exact verified file only; never recursive removal of the data root.
      journal.removedSourcePaths.push(file.relative);
      journal.removeIntent = null;
      await atomicWriteJson(journalPath, journal);
    }
    async function removeEmpty(directory) {
      for (const item of await fs.readdir(directory, { withFileTypes: true })) {
        if (!item.isDirectory() || item.isSymbolicLink()) throw new Error("Unerwarteter Rest im alten Datenpfad.");
        const child = path.join(directory, item.name);
        await removeEmpty(child); await fs.rmdir(child);
      }
    }
    await removeEmpty(sourceRoot);
  } catch (error) {
    journal.state = "move-failed"; journal.error = error.message;
    await atomicWriteJson(journalPath, journal);
    throw error;
  }
  await atomicWriteJson(path.join(repoRoot, STORAGE_CONFIG_FILE), config);
  journal.state = "committed";
  await atomicWriteJson(journalPath, journal);
  return config;
}

export async function restoreStorageMigration(options) {
  return withMigrationLock(options.repoRoot, () => restoreStorageMigrationLocked(options));
}

async function restoreStorageMigrationLocked({ repoRoot, targetRoot, consumersClosed = false, checkConsumersClosed = migrationConsumersClosed }) {
  if (!consumersClosed) throw new Error("Explorer und Lightroom müssen vor der Wiederherstellung geschlossen sein.");
  const journalPath = path.join(targetRoot, ".storage-migration.json");
  const journal = validateJournal(JSON.parse(await fs.readFile(journalPath, "utf8")));
  await assertConfigurationUnchanged(repoRoot, journal);
  if (!["moving", "move-failed", "committed", "restoring", "restored"].includes(journal.state)
      || !sameStoragePath(journal.plan.repoRoot, repoRoot) || !sameStoragePath(journal.plan.targetRoot, targetRoot)) throw new Error("Kein wiederherstellbarer Speicherwechsel.");
  const sourceRoot = journal.plan.sourceRoot;
  if (!await checkConsumersClosed({ repoRoot, sourceRoot })) throw new Error("Explorer, Lightroom oder ein gespeicherter Aufbau laufen noch.");
  await assertNoStorageLinks(sourceRoot); await assertNoStorageLinks(targetRoot);
  for (const file of journal.copied) {
    if (await hashFile(path.join(targetRoot, file.relative)) !== file.sha256) throw new Error(`Bestand seit Umzug verändert: ${file.relative}. Keine automatische Rücknahme.`);
  }
  journal.state = "restoring";
  await atomicWriteJson(journalPath, journal);
  for (const file of journal.copied) {
    const original = path.join(sourceRoot, file.relative);
    await assertNoStorageLinks(original);
    const attributes = await fs.lstat(original).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
    if (attributes) {
      if (!attributes.isFile() || await hashFile(original) !== file.sha256) throw new Error(`Fremder/geänderter Rückfallbestand: ${file.relative}`);
    } else {
      await fs.mkdir(path.dirname(original), { recursive: true });
      await fs.copyFile(path.join(targetRoot, file.relative), original, constants.COPYFILE_EXCL);
      if (await hashFile(original) !== file.sha256) throw new Error(`Rückfallkopie ungültig: ${file.relative}`);
    }
    await fs.utimes(original, new Date(file.mtimeMs), new Date(file.mtimeMs));
  }
  const configPath = path.join(repoRoot, STORAGE_CONFIG_FILE);
  if (journal.previousConfig !== null) await atomicWriteJson(configPath, JSON.parse(journal.previousConfig));
  else await fs.unlink(configPath).catch((error) => { if (error.code !== "ENOENT") throw error; });
  journal.state = "restored";
  await atomicWriteJson(journalPath, journal);
  return { state: "restored", sourceRoot, files: journal.copied.length, targetRetained: true };
}
