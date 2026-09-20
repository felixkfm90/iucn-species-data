import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { DatabaseSync } from "node:sqlite";
import { masterBuildRulesRevision, masterFileFingerprint } from "./taxonomy-master-inputs.mjs";
import { taxonomyMasterRoot, taxonomyMasterDatabasePath, taxonomyMasterManifestPath } from "./taxonomy-master-storage.mjs";
import { atomicWriteJson } from "./taxonomy-storage.mjs";
import { taxonomyPublicationPath } from "./taxonomy-publication-storage.mjs";
import { readMasterSourceBinding } from "./taxonomy-master-source-binding.mjs";
import { existsSync } from "node:fs";

const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const JOB_PATTERN = /^job-[a-f0-9-]{36}$/;
export const masterJobsDirectory = (root) => path.join(taxonomyMasterRoot(root), "build-jobs");
export function masterJobDirectory(root, id) {
  if (!JOB_PATTERN.test(id)) throw new Error("Ungültige Master-Auftragskennung.");
  return path.join(masterJobsDirectory(root), id);
}
async function fingerprintOrMissing(filename) {
  try { return await masterFileFingerprint(filename); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

// Bind even same-version field edits and rollbacks, not just release names.
// Additional project/reference/provider files can be supplied by the caller.
export async function masterJobBinding(taxonomyRoot, guardFiles = [], selection = null) {
  const files = [...new Set([
    taxonomyPublicationPath(taxonomyRoot),
    ...["active", "previous"].flatMap((slot) => [taxonomyMasterDatabasePath(taxonomyRoot, slot), taxonomyMasterManifestPath(taxonomyRoot, slot)]),
    ...guardFiles.map((filename) => path.resolve(filename)),
  ])].sort();
  return { rules: await masterBuildRulesRevision(),
    ...(selection ? { selection: await readMasterSourceBinding(taxonomyRoot, selection) } : {}),
    files: await Promise.all(files.map(async (filename) => [filename, await fingerprintOrMissing(filename)])) };
}

export async function verifyMasterJob(root, recipe) {
  if (recipe.schemaVersion !== 1 || path.resolve(recipe.taxonomyRoot) !== path.resolve(root)
      || !JOB_PATTERN.test(recipe.id) || recipe.revision !== hash({ ...recipe, revision: undefined })) {
    throw new Error("Der gespeicherte Master-Auftrag ist ungültig.");
  }
  if (hash(await masterJobBinding(root, recipe.guardFiles, recipe.selection)) !== hash(recipe.binding)) {
    const error = new Error("Eingangsdaten, aktiver Master oder Aufbauregeln wurden geändert. Dieser Zwischenstand darf nicht fortgesetzt werden. Bitte einen neuen Aufbau starten.");
    error.code = "MASTER_JOB_STALE";
    throw error;
  }
  const directory = masterJobDirectory(root, recipe.id);
  for (const [name, checksum] of Object.entries(recipe.inputs)) {
    if (!/^(col|provider-\d+)\.jsonl$/.test(name) || await masterFileFingerprint(path.join(directory, name)) !== checksum) {
      throw new Error("Die gesicherten Master-Eingänge sind unvollständig oder verändert.");
    }
  }
}

async function spool(filename, records) {
  const file = await fs.open(filename, "wx");
  const digest = crypto.createHash("sha256");
  let buffer = "";
  try {
    for await (const row of records) {
      buffer += JSON.stringify(row) + "\n";
      if (buffer.length >= 128 * 1024) { digest.update(buffer); await file.writeFile(buffer); buffer = ""; }
    }
    if (buffer) { digest.update(buffer); await file.writeFile(buffer); }
    await file.sync();
    return digest.digest("hex");
  } finally { await file.close(); }
}

export async function* readMasterJobRecords(filename) {
  const stream = createReadStream(filename, { encoding: "utf8" });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try { for await (const line of lines) { if (line.trim()) yield JSON.parse(line); } }
  finally { lines.close(); stream.destroy(); }
}

// Preparation is deliberately separate from execution: an interrupted spool is
// never resumable. Only a completely hashed input set receives recipe.json.
export async function prepareMasterJob({ taxonomyRoot, colRecords = [], providerSlices = [],
  guardFiles = [], selection = null, expectedBinding = null, now = () => new Date(), onProgress = () => {}, ...options }) {
  const id = `job-${crypto.randomUUID()}`, directory = masterJobDirectory(taxonomyRoot, id);
  const binding = expectedBinding || await masterJobBinding(taxonomyRoot, guardFiles, selection);
  await fs.mkdir(directory, { recursive: true });
  try {
    const inputs = { "col.jsonl": await spool(path.join(directory, "col.jsonl"), colRecords) };
    const providers = [];
    for (const [index, slice] of providerSlices.entries()) {
      const file = `provider-${index}.jsonl`;
      inputs[file] = await spool(path.join(directory, file), slice.records || []);
      providers.push({ manifest: slice.manifest, file });
    }
    // Coverage may be completed by consuming colRecords; capture it afterwards.
    const recipe = { schemaVersion: 1, id, taxonomyRoot: path.resolve(taxonomyRoot),
      timestamp: now().toISOString(), guardFiles, binding, inputs, providers,
      ...(selection ? { selection } : {}),
      options: { colRelease: options.colRelease, buildInputCoverage: options.buildInputCoverage,
        projectTaxa: options.projectTaxa || [], corrections: options.corrections || [],
        retainedTaxa: options.retainedTaxa || [], identityRegistry: options.identityRegistry,
        reuseUnchanged: options.reuseUnchanged !== false } };
    recipe.revision = hash(recipe);
    // Serialize once so omitted optional properties have the same hash after reload.
    const serialized = JSON.parse(JSON.stringify(recipe));
    await verifyMasterJob(taxonomyRoot, serialized);
    await atomicWriteJson(path.join(directory, "recipe.json"), serialized);
    onProgress({ phase: "Auftrag gesichert", message: "Vollständige Eingänge für den Hintergrundprozess sind gesichert.", percent: 60 });
    return { id, directory };
  } catch (error) {
    // Only our fresh UUID directory, never an older resume point or active data.
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

// A held SQLite write lock is released by the OS on crash. It needs neither a
// guessed PID timeout nor deletion/stealing of another process's lock file.
export async function acquireMasterJobLock(root, kind = "execution") {
  if (!["execution", "control"].includes(kind)) throw new Error("Ungültige Aufbausperre.");
  await fs.mkdir(masterJobsDirectory(root), { recursive: true });
  const database = new DatabaseSync(path.join(masterJobsDirectory(root), `${kind}-lock.sqlite`));
  try { database.exec("PRAGMA busy_timeout=0; BEGIN IMMEDIATE"); }
  catch (error) { database.close(); throw new Error("Ein Master-Hintergrundprozess läuft bereits.", { cause: error }); }
  return () => database.close();
}

export function masterJobLockHeld(root, kind = "execution") {
  if (!["execution", "control"].includes(kind)) throw new Error("Ungültige Aufbausperre.");
  const filename = path.join(masterJobsDirectory(root), `${kind}-lock.sqlite`);
  if (!existsSync(filename)) return false;
  let database;
  try {
    database = new DatabaseSync(filename);
    database.exec("PRAGMA busy_timeout=0; BEGIN IMMEDIATE; ROLLBACK");
    return false;
  } catch { return true; } // Unknown lock errors must not authorize another writer.
  finally { database?.close(); }
}
