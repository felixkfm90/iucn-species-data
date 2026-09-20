import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { prepareMasterJob, acquireMasterJobLock, verifyMasterJob } from "./taxonomy-master-job.mjs";
import { executeMasterJob } from "./taxonomy-master-worker.mjs";
import { startMasterJobProcess, pauseMasterJob } from "./taxonomy-master-process.mjs";
import { buildTaxonomyMasterCandidate } from "./taxonomy-master-candidate.mjs";
import { coverMasterInputSelection, masterFileFingerprint } from "./taxonomy-master-inputs.mjs";
import { taxonomyMasterDatabasePath } from "./taxonomy-master-storage.mjs";
import { activateTaxonomyMasterCandidate } from "./taxonomy-master-lifecycle.mjs";
import { benchmarkRows, semanticDigests } from "../scripts/taxonomy-master-benchmark.mjs";

const timestamp = "2026-09-13T12:00:00.000Z";
const now = () => new Date(timestamp);

test("Prozessende vor letzter IPC-Nachricht verliert das fertige Ergebnis nicht", async () => {
  const result = { candidateId: "completed" };
  const manifest = await startMasterJobProcess({ taxonomyRoot: path.join(os.tmpdir(), "not-written"),
    id: `job-${"a".repeat(36)}`, spawnProcess() {
      const child = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stderr.setEncoding = () => {};
      setImmediate(() => {
        child.emit("exit", 0);
        setImmediate(() => { child.emit("message", { type: "ready", manifest: result }); child.emit("disconnect"); });
      });
      return child;
    } });
  assert.deepEqual(manifest, result);
});
async function fixture(t, count = 510) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "fn-master-worker-"));
  t.after(() => fs.rm(base, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 }));
  const root = path.join(base, "taxonomy"), rows = benchmarkRows(count);
  const options = () => {
    const colRelease = { providerVersion: "TEST-1", importedAt: timestamp, recordCount: rows.length };
    const inputs = coverMasterInputSelection({ colRelease, colRecords: rows, targetNames: [], providerSlices: [] });
    return { taxonomyRoot: root, colRelease, colRecords: inputs.records(), buildInputCoverage: inputs.coverage, now };
  };
  return { base, root, rows, options, job: () => prepareMasterJob(options()) };
}
const json = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
function cursor(directory) {
  const database = new DatabaseSync(path.join(directory, "candidate", "taxonomy-master.sqlite"));
  try {
    return { ...JSON.parse(database.prepare("SELECT value FROM master_schema_info WHERE key='buildCheckpoint'").get().value),
      actual: database.prepare("SELECT COUNT(*) AS n FROM master_taxon").get().n };
  } finally { database.close(); }
}
function semanticWithoutWorkerMetadata(filename) {
  const result = semanticDigests(filename);
  delete result.master_schema_info; // Only the private worker cursor differs.
  return result;
}

test("Gesicherter Schreibblock wird fortgesetzt; vollständige Fach- und Suchtabellen entsprechen dem Vollaufbau", async (t) => {
  const f = await fixture(t), job = await f.job();
  let paused = false;
  await assert.rejects(executeMasterJob({ taxonomyRoot: f.root, id: job.id, shouldPause: () => paused,
    onProgress(event) { if (event.written === 500) paused = true; } }), { code: "MASTER_BUILD_PAUSED" });
  assert.equal(cursor(job.directory).written, 500);
  assert.equal(cursor(job.directory).actual, 500);
  assert.equal((await json(path.join(job.directory, "state.json"))).status, "paused");
  await assert.rejects(fs.stat(taxonomyMasterDatabasePath(f.root, "active")), { code: "ENOENT" });
  const checkpoints = [];
  const resumed = await executeMasterJob({ taxonomyRoot: f.root, id: job.id,
    onProgress(event) { if (event.written) checkpoints.push(event.written); } });
  assert.equal(resumed.summary.taxa, 510);
  assert.deepEqual(checkpoints, [510]);
  const before = semanticWithoutWorkerMetadata(taxonomyMasterDatabasePath(f.root, "staging"));
  const hashBeforeRetry = await masterFileFingerprint(taxonomyMasterDatabasePath(f.root, "staging"));
  await executeMasterJob({ taxonomyRoot: f.root, id: job.id });
  assert.equal(await masterFileFingerprint(taxonomyMasterDatabasePath(f.root, "staging")), hashBeforeRetry);
  await buildTaxonomyMasterCandidate(f.options());
  assert.deepEqual(semanticWithoutWorkerMetadata(taxonomyMasterDatabasePath(f.root, "staging")), before);
});

test("Fehler in der Abschlussprüfung bewahrt Schreibblöcke und bestehenden Kandidaten", async (t) => {
  const f = await fixture(t, 10);
  await buildTaxonomyMasterCandidate(f.options());
  const oldHash = await masterFileFingerprint(taxonomyMasterDatabasePath(f.root, "staging"));
  const job = await f.job();
  await assert.rejects(executeMasterJob({ taxonomyRoot: f.root, id: job.id,
    onProgress(event) { if (event.phase === "Prüfung") throw new Error("Prüfung unterbrochen"); } }), /Prüfung unterbrochen/);
  assert.equal(cursor(job.directory).actual, 10);
  assert.equal(await masterFileFingerprint(taxonomyMasterDatabasePath(f.root, "staging")), oldHash);
  assert.equal((await executeMasterJob({ taxonomyRoot: f.root, id: job.id })).summary.taxa, 10);
});

test("Aktiver Master und Eingänge dürfen sich beim Fortsetzen nicht geändert haben", async (t) => {
  const f = await fixture(t, 10);
  await buildTaxonomyMasterCandidate(f.options());
  await activateTaxonomyMasterCandidate(f.root, { confirmed: true });
  const file = path.join(f.base, "corrections.json");
  await fs.writeFile(file, "[]");
  const job = await prepareMasterJob({ ...f.options(), guardFiles: [file] });
  const recipe = await json(path.join(job.directory, "recipe.json"));
  await fs.writeFile(file, "[1]");
  await assert.rejects(verifyMasterJob(f.root, recipe), /wurden geändert/);
  await fs.writeFile(file, "[]");
  const database = new DatabaseSync(taxonomyMasterDatabasePath(f.root, "active"));
  database.prepare("INSERT INTO master_schema_info(key,value) VALUES('test','same-version-edit')").run();
  database.close();
  await assert.rejects(executeMasterJob({ taxonomyRoot: f.root, id: job.id }), /wurden geändert/);
});

test("Veränderte oder unvollständig gesicherte Eingänge werden abgewiesen", async (t) => {
  const f = await fixture(t, 10), job = await f.job();
  await fs.appendFile(path.join(job.directory, "col.jsonl"), "{}\n");
  await assert.rejects(executeMasterJob({ taxonomyRoot: f.root, id: job.id }), /unvollständig oder verändert/);
  await assert.rejects(prepareMasterJob({ ...f.options(), colRecords: (async function* () {
    yield f.rows[0]; throw new Error("Quellenlesefehler");
  })() }), /Quellenlesefehler/);
  const jobs = (await fs.readdir(path.join(f.root, "master", "build-jobs"))).filter((name) => name.startsWith("job-"));
  assert.deepEqual(jobs, [job.id]);
});

test("SQLite-Prozesssperre lässt keinen zweiten Master-Schreiber zu und ist wieder freigebbar", async (t) => {
  const f = await fixture(t, 10), job = await f.job(), unlock = await acquireMasterJobLock(f.root);
  try {
    await assert.rejects(executeMasterJob({ taxonomyRoot: f.root, id: job.id }), /läuft bereits/);
    await assert.rejects(startMasterJobProcess({ taxonomyRoot: f.root, id: job.id }), /läuft bereits/);
  } finally { unlock(); }
  assert.equal((await startMasterJobProcess({ taxonomyRoot: f.root, id: job.id })).summary.taxa, 10);
});

test("Echter Hintergrundprozess respektiert Pause; explizites Fortsetzen beendet den Kandidaten", async (t) => {
  const f = await fixture(t, 10), job = await f.job();
  await pauseMasterJob(f.root, job.id);
  await assert.rejects(startMasterJobProcess({ taxonomyRoot: f.root, id: job.id }), { code: "MASTER_BUILD_PAUSED" });
  const manifest = await startMasterJobProcess({ taxonomyRoot: f.root, id: job.id, resume: true });
  assert.equal(manifest.summary.taxa, 10);
  assert.equal((await json(path.join(job.directory, "state.json"))).status, "ready");
});

test("Verlust des Explorer-Kanals pausiert den echten Worker und bewahrt bestätigte Blöcke", async (t) => {
  const f = await fixture(t, 1200), job = await f.job();
  let child, disconnected = false;
  await assert.rejects(startMasterJobProcess({ taxonomyRoot: f.root, id: job.id,
    spawnProcess(...args) { child = spawn(...args); return child; },
    onProgress(event) {
      if (event.written >= 500 && !disconnected) { disconnected = true; child.disconnect(); }
    } }), { code: "MASTER_BUILD_PAUSED" });
  const saved = cursor(job.directory);
  assert.ok(saved.written >= 500 && saved.written <= 1200);
  assert.equal(saved.actual, saved.written);
  assert.equal((await startMasterJobProcess({ taxonomyRoot: f.root, id: job.id, resume: true })).summary.taxa, 1200);
});

test("Harter Prozessabbruch rollt den offenen Block zurück; neuer Prozess setzt konsistent fort", async (t) => {
  const f = await fixture(t, 1200), job = await f.job();
  let child, killed = false;
  await assert.rejects(startMasterJobProcess({ taxonomyRoot: f.root, id: job.id,
    spawnProcess(...args) { child = spawn(...args); return child; },
    onProgress(event) {
      if (event.written >= 500 && !killed) { killed = true; child.kill("SIGKILL"); }
    } }), { code: "MASTER_WORKER_EXIT" });
  const saved = cursor(job.directory);
  assert.ok(saved.written >= 500 && saved.written <= 1200);
  assert.equal(saved.actual, saved.written);
  assert.equal((await startMasterJobProcess({ taxonomyRoot: f.root, id: job.id, resume: true })).summary.taxa, 1200);
});

test("Nach vollständigem Datenbankcommit abgebrochene Veröffentlichung ist ohne doppelte Abschlussdaten fortsetzbar", async (t) => {
  const f = await fixture(t, 10), file = path.join(f.base, "source-version.json");
  await fs.writeFile(file, "1");
  const job = await prepareMasterJob({ ...f.options(), guardFiles: [file] });
  let changed = false, change;
  await assert.rejects(executeMasterJob({ taxonomyRoot: f.root, id: job.id, onProgress(event) {
    if (event.phase === "Abschluss" && !changed) { changed = true; change = fs.writeFile(file, "2"); }
  } }), /wurden geändert/);
  await change;
  assert.ok(cursor(job.directory).manifest);
  await fs.writeFile(file, "1");
  const result = await executeMasterJob({ taxonomyRoot: f.root, id: job.id });
  assert.equal(result.summary.taxa, 10);
  const actual = semanticWithoutWorkerMetadata(taxonomyMasterDatabasePath(f.root, "staging"));
  await buildTaxonomyMasterCandidate(f.options());
  assert.deepEqual(semanticWithoutWorkerMetadata(taxonomyMasterDatabasePath(f.root, "staging")), actual);
});

test("Auch wiederverwendete Arten und ihre Quellen werden genau einmal fortgesetzt", async (t) => {
  const f = await fixture(t);
  await buildTaxonomyMasterCandidate(f.options());
  await activateTaxonomyMasterCandidate(f.root, { confirmed: true });
  const activeHash = await masterFileFingerprint(taxonomyMasterDatabasePath(f.root, "active"));
  const job = await prepareMasterJob({ ...f.options(), now: () => new Date("2026-09-14T12:00:00.000Z") });
  let paused = false;
  await assert.rejects(executeMasterJob({ taxonomyRoot: f.root, id: job.id, shouldPause: () => paused,
    onProgress(event) { if (event.written === 500) paused = true; } }), { code: "MASTER_BUILD_PAUSED" });
  assert.equal(cursor(job.directory).reused, 500);
  const result = await executeMasterJob({ taxonomyRoot: f.root, id: job.id });
  assert.equal(result.buildInputs.reuse.reusedTaxa, 510);
  assert.equal(result.buildInputs.reuse.recomputedGroups, 0);
  assert.equal(await masterFileFingerprint(taxonomyMasterDatabasePath(f.root, "active")), activeHash);
  const actual = semanticWithoutWorkerMetadata(taxonomyMasterDatabasePath(f.root, "staging"));
  await buildTaxonomyMasterCandidate({ ...f.options(), reuseUnchanged: false, now: () => new Date("2026-09-14T12:00:00.000Z") });
  assert.deepEqual(semanticWithoutWorkerMetadata(taxonomyMasterDatabasePath(f.root, "staging")), actual);
});

test("Unterbrochene Schemainitialisierung ohne bestätigten Block wird nur im privaten Kandidaten neu begonnen", async (t) => {
  const f = await fixture(t, 10), job = await f.job();
  await fs.mkdir(path.join(job.directory, "candidate"));
  const database = new DatabaseSync(path.join(job.directory, "candidate", "taxonomy-master.sqlite"));
  database.exec("CREATE TABLE master_schema_info(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE interrupted_setup(id INTEGER)");
  database.close();
  assert.equal((await executeMasterJob({ taxonomyRoot: f.root, id: job.id })).summary.taxa, 10);
  const built = new DatabaseSync(taxonomyMasterDatabasePath(f.root, "staging"), { readOnly: true });
  try { assert.equal(built.prepare("SELECT 1 FROM sqlite_master WHERE name='interrupted_setup'").get(), undefined); }
  finally { built.close(); }
});

test("Fremdes Rezept und fremder Schreibcursor werden nicht als fortsetzbar behandelt", async (t) => {
  const f = await fixture(t), job = await f.job(), recipe = await json(path.join(job.directory, "recipe.json"));
  await assert.rejects(verifyMasterJob(f.root, { ...recipe, options: { ...recipe.options, corrections: [{ germanName: "Ungeprüft" }] } }), /ungültig/);
  let paused = false;
  await assert.rejects(executeMasterJob({ taxonomyRoot: f.root, id: job.id, shouldPause: () => paused,
    onProgress(event) { if (event.written === 500) paused = true; } }), { code: "MASTER_BUILD_PAUSED" });
  const database = new DatabaseSync(path.join(job.directory, "candidate", "taxonomy-master.sqlite"));
  const saved = JSON.parse(database.prepare("SELECT value FROM master_schema_info WHERE key='buildCheckpoint'").get().value);
  database.prepare("UPDATE master_schema_info SET value=? WHERE key='buildCheckpoint'").run(JSON.stringify({ ...saved, contract: "f".repeat(64) }));
  database.close();
  await assert.rejects(executeMasterJob({ taxonomyRoot: f.root, id: job.id }), /gehört nicht zu diesen Eingängen/);
  assert.equal(cursor(job.directory).actual, 500);
});
