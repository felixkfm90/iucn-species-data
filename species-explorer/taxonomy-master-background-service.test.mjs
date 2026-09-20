import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createTaxonomyMasterService } from "./taxonomy-master-service.mjs";
import { MasterRunController } from "./taxonomy-master-run-controller.mjs";
import { masterJobDirectory, masterJobBinding, acquireMasterJobLock } from "./taxonomy-master-job.mjs";
import { startMasterJobProcess, pauseMasterJob } from "./taxonomy-master-process.mjs";
import { writeActiveTaxonomyPointer, atomicWriteJson } from "./taxonomy-storage.mjs";
import { providerSliceManifestPath, providerSliceDataPath } from "./taxonomy-master-slices.mjs";
import { readTaxonomyMasterManifest } from "./taxonomy-master-candidate.mjs";
import { readMasterSourceBinding } from "./taxonomy-master-source-binding.mjs";
import { publishTaxonomyPair } from "./taxonomy-publication.mjs";
import { readTaxonomyPublication } from "./taxonomy-publication-storage.mjs";
import { benchmarkRows } from "../scripts/taxonomy-master-benchmark.mjs";

const now = () => new Date("2026-09-14T10:00:00Z");
const json = async (file) => JSON.parse(await fs.readFile(file, "utf8"));

async function fixture(t, count = 10) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "fn-master-background-service-"));
  t.after(() => fs.rm(base, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 }));
  const root = path.join(base, "taxonomy");
  const selection = { speciesListPath: path.join(base, "species_list.json"), correctionsPath: path.join(base, "corrections.json") };
  const rows = benchmarkRows(count);
  await atomicWriteJson(selection.speciesListPath, rows.map((row) => ({ german: row.germanName,
    genus: row.scientificName.split(" ")[0], species: row.scientificName.split(" ")[1] })));
  await atomicWriteJson(selection.correctionsPath, { entries: [] });
  await writeActiveTaxonomyPointer(root, { activeRelease: "col-2026-07" }, now);
  const byName = new Map(rows.map((row) => [row.scientificName, row]));
  // The service reads a small deterministic reference; the worker, SQLite,
  // job persistence, source binding and lifecycle are real implementations.
  const store = { status: () => ({ releaseId: "col-2026-07", importedAt: now().toISOString(), counts: { taxa: count } }),
    findTaxonByScientificName: (name) => byName.has(name) ? { taxonId: name, acceptedScientificName: name, rank: "species" } : null,
    taxon: (name) => ({ source_id: name, scientific_name: name, rank: "species", kingdom: { scientificName: "Animalia" },
      germanNames: [{ name: byName.get(name).germanName }], hierarchy: [] }) };
  const services = [];
  const service = (options = {}) => {
    const result = createTaxonomyMasterService({ taxonomyRoot: root, ...selection, now, backgroundBuild: true,
      referenceService: { requireStore: async () => store, reset() {} }, ...options });
    services.push(result);
    return result;
  };
  t.after(async () => { for (const item of services) await item.close(); });
  return { root, selection, service };
}

test("Explorer-Service baut im echten Hilfsprozess; Neustart findet fertigen Kandidaten ohne neuen Lauf", async (t) => {
  const f = await fixture(t), service = f.service();
  await service.startBuild({ refreshProviders: false });
  await service.runPromise;
  const done = await service.status();
  assert.equal(done.status, "ready", done.error);
  assert.equal(done.active, false);
  assert.equal(done.buildJob.status, "ready");
  assert.equal(done.lifecycle.candidate.summary.taxa, 10);
  assert.equal(done.lifecycle.active, null);
  await service.close();
  const reopened = f.service();
  assert.equal((await reopened.status()).buildJob.id, done.buildJob.id);
  assert.equal((await reopened.status()).active, false);
  assert.equal(reopened.runPromise, null);
  await reopened.runController.assertReadyForActivation();
  // Even after a finished build, later edits must not be activated unnoticed.
  await atomicWriteJson(f.selection.correctionsPath, { entries: [], changed: true });
  await assert.rejects(reopened.runController.assertReadyForActivation(), { code: "MASTER_JOB_STALE" });
});

test("Explorer-Pause, Wiederfinden und explizites Fortsetzen erhalten Blöcke ohne neue Quellenabfrage", async (t) => {
  const f = await fixture(t, 1200);
  let service, pauseRequest;
  const controller = new MasterRunController(f.root, { startProcess: (options) => startMasterJobProcess({ ...options,
    onProgress(event) {
      options.onProgress(event);
      if (event.written >= 500 && !pauseRequest) pauseRequest = service.pauseBuild();
    } }) });
  service = f.service({ runController: controller });
  await service.startBuild({ refreshProviders: false });
  await service.runPromise;
  await pauseRequest;
  const paused = await service.status();
  assert.equal(paused.status, "paused", paused.error);
  assert.ok(paused.buildJob.checkpoint.written >= 500);
  assert.equal(paused.lifecycle.active, null);
  await service.close();
  const reopened = f.service({ providerRefreshService: { refresh() { throw new Error("Kein Download beim Fortsetzen"); }, async close() {} } });
  const saved = await reopened.status();
  assert.equal(saved.buildJob.id, paused.buildJob.id);
  assert.deepEqual(saved.buildJob.checkpoint, paused.buildJob.checkpoint);
  assert.equal(saved.buildJob.canResume, true);
  assert.equal(reopened.runPromise, null);
  assert.throws(() => reopened.resumeBuild(), /bestätigt/);
  await reopened.resumeBuild({ confirmed: true });
  await reopened.runPromise;
  const done = await reopened.status();
  assert.equal(done.status, "ready", done.error);
  assert.equal(done.lifecycle.candidate.summary.taxa, 1200);
  assert.equal(done.buildJob.id, saved.buildJob.id);
  assert.equal(done.lifecycle.active, null);
});

test("Unterbrochener Lauf sperrt ältere Kandidaten; geänderte Eingänge verlangen einen neuen Aufbau", async (t) => {
  const f = await fixture(t), service = f.service();
  await service.startBuild({ refreshProviders: false });
  await service.runPromise;
  const current = await service.runController.current();
  const statePath = path.join(masterJobDirectory(f.root, current.id), "state.json");
  const oldState = await json(statePath);
  // Simulate interruption after the worker persisted its progress, before its
  // terminal message; staging from the previous successful run still exists.
  await atomicWriteJson(statePath, { ...oldState, status: "building" });
  await service.close();
  const reopened = f.service();
  assert.equal((await reopened.status()).status, "interrupted");
  assert.equal((await reopened.status()).lifecycle.canActivate, false);
  await reopened.activate({ confirmed: true });
  await reopened.runPromise;
  assert.equal((await reopened.status()).lifecycle.active, null);
  assert.match(reopened.state.error, /nicht abgeschlossen/);
  await atomicWriteJson(f.selection.correctionsPath, { entries: [], revision: "changed" });
  await reopened.resumeBuild({ confirmed: true });
  await reopened.runPromise;
  const stale = await reopened.status();
  assert.equal(stale.status, "stale", stale.error);
  assert.equal(stale.buildJob.canResume, false);
  assert.deepEqual(stale.buildJob.checkpoint, oldState.checkpoint);
  await reopened.startBuild({ refreshProviders: false });
  await reopened.runPromise;
  const replacement = await reopened.status();
  assert.equal(replacement.status, "ready", replacement.error);
  assert.notEqual(replacement.buildJob.id, current.id);
  assert.ok(await fs.stat(statePath), "Alter Zwischenstand bleibt erhalten");
});

test("Heutige Anbieterauswahl erkennt neue Releases trotz unveränderter alter Dateien", async (t) => {
  const f = await fixture(t);
  const writeVersion = async (version, date) => {
    await atomicWriteJson(providerSliceManifestPath(f.root, "gbif", version), { retrievedAt: date });
    await atomicWriteJson(providerSliceDataPath(f.root, "gbif", version), []);
  };
  await writeVersion("old", "2026-09-01T00:00:00Z");
  const before = await readMasterSourceBinding(f.root, f.selection);
  const oldManifest = await fs.readFile(providerSliceManifestPath(f.root, "gbif", "old"), "utf8");
  await writeVersion("new", "2026-09-14T00:00:00Z");
  const after = await readMasterSourceBinding(f.root, f.selection);
  assert.equal(after.versions.find(([provider]) => provider === "gbif")[1], "new");
  assert.notDeepEqual(after, before);
  assert.equal(await fs.readFile(providerSliceManifestPath(f.root, "gbif", "old"), "utf8"), oldManifest);
  await writeActiveTaxonomyPointer(f.root, { activeRelease: "col-2026-08" }, now);
  assert.notDeepEqual(await readMasterSourceBinding(f.root, f.selection), after);
});

test("Eigene Eingänge werden nach dem Bindungssnapshot gelesen und vor dem Worker erneut geprüft", async (t) => {
  const f = await fixture(t), service = f.service();
  const originalBuild = service.runController.build.bind(service.runController);
  service.runController.build = async (options) => {
    assert.deepEqual(options.expectedBinding, await masterJobBinding(f.root, [], f.selection));
    await atomicWriteJson(f.selection.correctionsPath, { entries: [], revision: "during-spool" });
    return originalBuild(options);
  };
  await service.startBuild({ refreshProviders: false });
  await service.runPromise;
  assert.equal((await service.status()).status, "failed");
  assert.match(service.state.error, /wurden geändert/);
  assert.equal(await service.runController.current(), null);
  assert.equal(await readTaxonomyMasterManifest(f.root, "staging"), null);
});

test("Normale Suchcacheänderungen veralten keinen Lauf; neu vorgemerkte Taxa dagegen schon", async (t) => {
  const f = await fixture(t);
  const before = await readMasterSourceBinding(f.root, f.selection);
  await atomicWriteJson(path.join(f.root, "supplements.json"), { queries: { query: "unrelated" }, researchedTaxa: [] });
  assert.deepEqual(await readMasterSourceBinding(f.root, f.selection), before);
  await atomicWriteJson(path.join(f.root, "supplements.json"), { researchedTaxa: [{ scientificName: "Testus alpha" }] });
  assert.notDeepEqual(await readMasterSourceBinding(f.root, f.selection), before);
});

test("Prozessübergreifende Sperre blockiert Serviceaktionen und bewahrt laufende Pausenanforderung", async (t) => {
  const f = await fixture(t), service = f.service();
  await service.startBuild({ refreshProviders: false });
  await service.runPromise;
  const current = await service.runController.current();
  const release = await acquireMasterJobLock(f.root);
  try {
    await pauseMasterJob(f.root, current.id);
    const reopened = f.service();
    assert.equal(reopened.isActive(), true);
    assert.throws(() => reopened.startBuild(), /läuft bereits/);
    assert.throws(() => reopened.activate({ confirmed: true }), /läuft bereits/);
    await assert.rejects(reopened.reviewIdentity("save", {}), /läuft bereits/);
    await assert.rejects(startMasterJobProcess({ taxonomyRoot: f.root, id: current.id, resume: true }), /läuft bereits/);
    assert.ok(await fs.stat(path.join(masterJobDirectory(f.root, current.id), "pause.json")));
  } finally { release(); }
  assert.equal(service.isActive(), false);
});

test("Fehlender Wiederanlaufauftrag endet verständlich statt als dauerhaft aktiver Lauf", async (t) => {
  const f = await fixture(t), service = f.service();
  await service.resumeBuild({ confirmed: true });
  await service.runPromise;
  assert.equal(service.isActive(), false);
  assert.equal((await service.status()).status, "failed");
  assert.match(service.state.error, /Kein gespeicherter/);
  assert.equal((await service.status()).buildJob.available, false);
});

test("Schließen des Dienstes pausiert den aktiven Worker und bewahrt den auffindbaren Auftrag", async (t) => {
  const f = await fixture(t, 1200);
  let service, closing;
  const controller = new MasterRunController(f.root, { startProcess: (options) => startMasterJobProcess({ ...options,
    onProgress(event) {
      options.onProgress(event);
      if (event.written >= 500 && !closing) closing = service.close();
    } }) });
  service = f.service({ runController: controller });
  await service.startBuild({ refreshProviders: false });
  await service.runPromise;
  await closing;
  assert.equal(service.closed, true);
  const saved = await f.service().status();
  assert.equal(saved.status, "paused", saved.error);
  assert.ok(saved.buildJob.checkpoint.written >= 500);
  assert.equal(saved.buildJob.canResume, true);
});

test("Fertiger Hintergrundkandidat führt erst nach bestätigter Aktivierung zum gemeinsamen Master-/Suchpaketstand", async (t) => {
  const f = await fixture(t), searchRoot = path.join(path.dirname(f.root), "lightroom");
  const service = f.service({ lightroomSearchRoot: searchRoot,
    publishPair: (options) => publishTaxonomyPair({ ...options, taxonomyRoot: f.root, searchRoot }) });
  await service.startBuild({ refreshProviders: false });
  await service.runPromise;
  assert.equal((await service.status()).status, "ready");
  assert.equal(readTaxonomyPublication(f.root), null);
  assert.throws(() => service.activate(), /bestätigt/);
  await service.activate({ confirmed: true });
  await service.runPromise;
  assert.equal((await service.status()).status, "completed", service.state.error);
  const publication = readTaxonomyPublication(f.root);
  assert.ok(publication.active.masterVersion);
  assert.ok(publication.active.packageId);
  assert.equal((await readTaxonomyMasterManifest(f.root, "active")).candidateId, publication.active.masterVersion);
});
