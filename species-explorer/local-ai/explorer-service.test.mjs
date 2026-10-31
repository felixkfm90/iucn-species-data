import assert from "node:assert/strict";
import test from "node:test";
import { createExplorerLocalAiService } from "./explorer-service.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
}

function fixture(t, { shared = null, serviceOverrides = {}, cacheOverrides = {} } = {}) {
  const calls = [], jobs = new Map(); let profile = shared;
  const cache = { status: async () => ({ status: "not-installed" }),
    download: async () => { calls.push("download"); }, close: async () => { calls.push("cache-close"); }, ...cacheOverrides };
  const worker = { status: () => ({ state: "stopped", busy: false, ownWorkerActive: false, ownPid: 12345, errorCode: "" }) };
  const images = { busy: false, loadImage() {}, isBindingCurrent: async () => true,
    close: async () => { calls.push("images-close"); } };
  const ai = { status: (ownerId) => ({ busy: false, queued: 0, worker: worker.status(),
    jobs: [...jobs.values()].filter((job) => job.ownerId === ownerId).map(({ ownerId: ignored, ...job }) => job) }),
  suggestAltText(input) { calls.push({ action: "suggest-alt", input }); const job = { jobId: "own-job", ...input }; jobs.set(job.jobId, job); return job; },
  get(id, ownerId) { const job = jobs.get(id); if (!job || job.ownerId !== ownerId) throw new Error("Fremder Auftrag"); return job; },
  cancel(id, ownerId) { calls.push({ action: "cancel", id, ownerId }); return this.get(id, ownerId); },
  close: async () => { calls.push("ai-close"); }, ...serviceOverrides };
  const service = createExplorerLocalAiService({ cacheRoot: "D:\\synthetic-personal-profile\\local-ai", deviceId: "synthetic-device", repoRoot: "D:\\synthetic-workspace",
    websiteAltTexts: { snapshot: async () => ({}) }, sharedProject: { snapshot: async () => profile },
    cacheFactory: () => cache, workerFactory: () => worker, imageLoaderFactory: () => images, serviceFactory: () => ai });
  t.after(() => service.close());
  return { service, calls, jobs, worker, images, setShared(value) { profile = value; } };
}

const writer = (user = "felix", project = "fn-project") => ({ status: { projectId: project, user: { id: user } }, busy: false,
  permissions: { canRead: true, canEdit: true } });

test("Öffnen der optionalen Hilfe lädt nichts, startet kein Modell und gibt keine Prozesskennung aus", async (t) => {
  const f = fixture(t), result = await f.service.snapshot();
  assert.equal(result.mode, "cpu"); assert.equal(result.busy, false); assert.equal(result.installing, false);
  assert.equal(result.cache.status, "not-installed"); assert.equal(result.worker.ownPid, undefined);
  assert.deepEqual(f.calls, []);
});

test("KI-Aufträge erhalten die wirkliche lokale oder gemeinsame Identität; Rendereridentitäten sind abgewiesen", async (t) => {
  const f = fixture(t);
  await assert.rejects(f.service.operation({ action: "suggest-alt", payload: { ownerId: "foreign", imageKey: "image" } }), /fremde Anmeldung/);
  await f.service.operation({ action: "suggest-alt", payload: { imageKey: "image" } });
  assert.match(f.calls.at(-1).input.ownerId, /:synthetic-device$/);
  f.setShared(writer());
  await f.service.operation({ action: "suggest-alt", payload: { imageKey: "image" } });
  assert.match(f.calls.at(-1).input.ownerId, /:fn-project:felix$/);
  f.setShared(writer("niko"));
  assert.deepEqual((await f.service.snapshot()).jobs, []);
  await assert.rejects(f.service.operation({ action: "get", id: "own-job" }), /Fremder Auftrag/);
  assert.equal(f.calls.filter((call) => call.action === "suggest-alt").length, 2);
});

test("Leser, abgemeldete Projektmitglieder und laufender Identitätswechsel starten keine Modellarbeit", async (t) => {
  const f = fixture(t);
  for (const profile of [{ ...writer(), permissions: { canRead: true, canEdit: false } },
    { ...writer(), status: { projectId: "fn-project", user: null } }, { ...writer(), busy: true }]) {
    f.setShared(profile);
    await assert.rejects(f.service.operation({ action: "suggest-alt", payload: { imageKey: "image" } }), { statusCode: 403 });
    await assert.rejects(f.service.operation({ action: "download", payload: { confirmed: true } }), { statusCode: 403 });
  }
  assert.deepEqual(f.calls, []);
});

test("Zwei gleichzeitige Einrichtungsanfragen starten genau einen ausdrücklich bestätigten Download", async (t) => {
  const pending = deferred();
  const f = fixture(t, { cacheOverrides: { download: async () => { f.calls.push("download"); await pending.promise; } } });
  try {
    await assert.rejects(f.service.operation({ action: "download", payload: {} }), /bestätigen/);
    const results = await Promise.allSettled([f.service.operation({ action: "download", payload: { confirmed: true } }),
      f.service.operation({ action: "download", payload: { confirmed: true } })]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(f.calls.filter((call) => call === "download").length, 1);
  } finally { pending.resolve(); }
});

test("Ein anderer Benutzer kann einen bereits laufenden Einrichtungsdownload nicht abbrechen", async (t) => {
  let aborted = false;
  const f = fixture(t, { shared: writer(), cacheOverrides: { download: ({ signal }) => new Promise((resolve) => {
    signal.addEventListener("abort", () => { aborted = true; resolve(); }, { once: true });
  }) } });
  await f.service.operation({ action: "download", payload: { confirmed: true } });
  f.setShared(writer("niko"));
  await assert.rejects(f.service.operation({ action: "cancel-download" }), { statusCode: 403 });
  assert.equal(aborted, false);
  f.setShared(writer());
  await f.service.operation({ action: "cancel-download" });
  assert.equal(aborted, true);
  assert.equal((await f.service.snapshot()).installing, false);
});

test("Schließen wartet auf die eigene Einrichtung und beendet den Dienst vor Bildleser und Cache", async (t) => {
  const drain = deferred(), entered = deferred();
  const f = fixture(t, { cacheOverrides: { download: ({ signal }) => new Promise((resolve) => {
    signal.addEventListener("abort", () => { entered.resolve(); drain.promise.then(resolve); }, { once: true });
  }) } });
  await f.service.operation({ action: "download", payload: { confirmed: true } });
  const closing = f.service.close(); await entered.promise;
  assert.deepEqual(f.calls, []);
  assert.equal(f.service.blockingState().busy, true);
  await assert.rejects(f.service.operation({ action: "suggest-alt", payload: { imageKey: "image" } }), /geschlossen/);
  drain.resolve(); await closing;
  assert.deepEqual(f.calls, ["ai-close", "images-close", "cache-close"]);
});
