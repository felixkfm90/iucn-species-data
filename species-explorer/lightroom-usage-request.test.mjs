import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { captureCatalogUsage, createCatalogUsageService, catalogUsageStatus, catalogUsageRegistration } from "./lightroom-catalog-usage.mjs";
import { createLightroomUsageRequestService, catalogUsageRequest, reportCatalogUsageRequestError } from "./lightroom-usage-request.mjs";
import { createLightroomCloseGate } from "./lightroom-close-gate.mjs";
import { createLightroomSearchRequestHandler } from "./lightroom-search-helper.mjs";

const ID = `mtx_${"a".repeat(32)}`;
const job = { updateRunId: "update-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", phase: "start", status: "waiting-lightroom",
  startedAt: "2026-10-03T10:00:00.000Z", usageConsent: { allCatalogsConfirmed: true, noChangesUntilClose: true } };
async function fixture(t, count = 1) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fn-usage-request-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 80 }));
  const root = path.join(directory, "taxonomy");
  const inputs = [];
  for (let index = 0; index < count; index++) {
    const catalogPath = path.join(directory, `current-${index}.lrcat`);
    await fs.writeFile(catalogPath, "fixture catalog, no SQLite access");
    const input = { catalogPath, totalPhotos: 3, usedTaxa: [{ masterTaxonId: ID, photoCount: 2 }], complete: true, passes: 2 };
    inputs.push(input);
    await captureCatalogUsage(root, input);
  }
  const service = createCatalogUsageService({ taxonomyRoot: root });
  const preview = await service.catalogUsagePreview();
  await service.catalogUsageSave({ token: preview.token, confirmed: true, allCatalogsConfirmed: true, unchangedSinceCapture: true });
  const registry = await catalogUsageRegistration(root);
  for (const input of inputs) await fs.writeFile(input.catalogPath + ".lock", "open");
  const requests = createLightroomUsageRequestService({ taxonomyRoot: root });
  const capture = async (input = inputs[0]) => {
    const bound = await catalogUsageRequest(root, { catalogPath: input.catalogPath });
    return captureCatalogUsage(root, { ...input, captureRequestId: bound.requestId, requestRevision: bound.requestRevision });
  };
  const close = async () => {
    for (const input of inputs) {
      await fs.unlink(input.catalogPath + ".lock");
      await fs.appendFile(input.catalogPath, "normal closure persisted native state");
    }
  };
  return { directory, root, inputs, requests, registry, capture, close };
}

test("nur bestätigter Start erzeugt frische Requestbindung; alte Quittung wird nicht umgestempelt", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await catalogUsageRequest(f.root, { catalogPath: f.inputs[0].catalogPath }), { required: false });
  for (const field of ["allCatalogsConfirmed", "noChangesUntilClose"]) {
    await assert.rejects(f.requests.prepare({ ...job, usageConsent: { ...job.usageConsent, [field]: false } }), /einmalige/);
  }
  const before = await fs.readFile(path.join(f.root, "catalog-usage", "captures.json"));
  await f.requests.prepare(job);
  const requested = await catalogUsageRequest(f.root, { catalogPath: f.inputs[0].catalogPath });
  assert.equal(requested.required, true);
  assert.equal((await f.requests.status(job.updateRunId)).ready, false);
  assert.deepEqual(await fs.readFile(path.join(f.root, "catalog-usage", "captures.json")), before);
  assert.deepEqual(await catalogUsageRegistration(f.root), f.registry);
});

test("neue SDK-Quittung wird erst nach geschlossenem stabilem Katalog automatisch registriert", async (t) => {
  const f = await fixture(t);
  await f.requests.prepare(job);
  const before = f.registry.catalogs[0].captureId;
  const saved = await f.capture();
  assert.notEqual(saved.captureId, before);
  assert.equal((await f.requests.status(job.updateRunId)).ready, true);
  await assert.rejects(f.requests.bindClosed(job.updateRunId), /normal schließen/);
  assert.deepEqual(await catalogUsageRegistration(f.root), f.registry);
  await f.close();
  assert.equal((await f.requests.bindClosed(job.updateRunId)).ready, true);
  const registry = await catalogUsageRegistration(f.root);
  assert.equal(registry.confirmationBasis, "prospective-user-agreement");
  assert.equal(registry.catalogs[0].captureId, saved.captureId);
  assert.equal((await catalogUsageStatus(f.root, { full: true })).ready, true);
  assert.equal((await catalogUsageRequest(f.root, { catalogPath: f.inputs[0].catalogPath })).required, false);
});

test("alle registrierten Kataloge müssen frisch für denselben Request erfasst sein", async (t) => {
  const f = await fixture(t, 2);
  await f.requests.prepare(job);
  await f.capture(f.inputs[0]);
  assert.equal((await f.requests.status(job.updateRunId)).ready, false);
  await f.close();
  assert.equal((await f.requests.bindClosed(job.updateRunId)).ready, false);
  assert.deepEqual(await catalogUsageRegistration(f.root), f.registry);
  await f.capture(f.inputs[1]);
  assert.equal((await f.requests.bindClosed(job.updateRunId)).ready, true);
});

test("fremde, alte, doppelte, pausierte und manipulierte Requests dürfen keine neue Quittung liefern", async (t) => {
  const f = await fixture(t);
  await f.requests.prepare(job);
  const bound = await catalogUsageRequest(f.root, { catalogPath: f.inputs[0].catalogPath });
  for (const extra of [{ captureRequestId: "capture-request-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" }, { requestRevision: "b".repeat(64) }]) {
    await assert.rejects(captureCatalogUsage(f.root, { ...f.inputs[0], captureRequestId: bound.requestId, requestRevision: bound.requestRevision, ...extra }), /geändert/);
  }
  await f.capture();
  await assert.rejects(f.capture(), /doppelte/);
  await f.requests.syncJob({ ...job, status: "paused" });
  await assert.rejects(captureCatalogUsage(f.root, { ...f.inputs[0], captureRequestId: bound.requestId, requestRevision: bound.requestRevision }), /offene/);
  const file = path.join(f.root, "catalog-usage", "update-request.json");
  const request = JSON.parse(await fs.readFile(file));
  request.catalogs.push(path.join(f.directory, "foreign.lrcat"));
  await fs.writeFile(file, JSON.stringify(request));
  await assert.rejects(f.requests.status(job.updateRunId), /ungültig/);
});

test("unbekannter weiterer Katalog stoppt statt als leer ignoriert zu werden", async (t) => {
  const f = await fixture(t);
  await f.requests.prepare(job);
  const foreign = path.join(f.directory, "foreign.lrcat");
  await fs.writeFile(foreign, "fixture");
  await assert.rejects(catalogUsageRequest(f.root, { catalogPath: foreign }), /Katalogmenge/);
  await captureCatalogUsage(f.root, { ...f.inputs[0], catalogPath: foreign });
  await assert.rejects(f.requests.status(job.updateRunId), /weiterer/);
});

test("gespeicherte Close-Bestätigung wartet auf frische Erfassung; Selbstschließen benötigt keinen zweiten Start", async (t) => {
  const f = await fixture(t);
  let open = true, closeCalls = 0;
  const gate = createLightroomCloseGate({ taxonomyRoot: f.root, usageRequests: f.requests,
    processes: async () => open ? [{ id: 123, path: "C:\\Adobe\\Lightroom.exe" }] : [],
    closeProcesses: async () => { closeCalls++; } });
  await f.requests.prepare(job);
  assert.equal((await gate.requestClose({ confirmed: true, updateRunId: job.updateRunId })).queued, true);
  assert.equal((await gate.ready({ job })).ready, false);
  assert.equal(closeCalls, 0);
  await f.capture();
  await gate.ready({ job });
  assert.equal(closeCalls, 1);
  await gate.ready({ job });
  assert.equal(closeCalls, 1, "keine wiederholte Schließaufforderung");
  open = false;
  await f.close();
  assert.equal((await gate.ready({ job })).ready, true);
  assert.equal(closeCalls, 1);
});

test("Schließen vor Erfassung und zurückbleibende Arbeitsdatei erzeugen niemals Abwesenheitsfreigabe", async (t) => {
  const f = await fixture(t);
  await f.requests.prepare(job);
  const gate = createLightroomCloseGate({ taxonomyRoot: f.root, usageRequests: f.requests, processes: async () => [] });
  await f.close();
  const waiting = await gate.ready({ job });
  assert.equal(waiting.ready, false);
  assert.match(waiting.message, /vor der neuen/);
  await f.capture();
  await fs.writeFile(f.inputs[0].catalogPath + "-wal", "unfinished");
  assert.equal((await gate.ready({ job })).ready, false);
  assert.deepEqual(await catalogUsageRegistration(f.root), f.registry);
});

test("Requestfortsetzung nach Neustart liest echten neuen Capture; Erfassungsretry erzeugt neue ID", async (t) => {
  const f = await fixture(t);
  await f.requests.prepare(job);
  const old = (await f.requests.status(job.updateRunId)).request.requestId;
  await f.requests.syncJob({ ...job, status: "paused" });
  await f.requests.prepare({ ...job, renewUsageRequest: true });
  assert.notEqual((await f.requests.status(job.updateRunId)).request.requestId, old);
  await f.capture();
  await f.close();
  const reopened = createLightroomUsageRequestService({ taxonomyRoot: f.root });
  assert.equal((await reopened.bindClosed(job.updateRunId)).ready, true);
});

test("Helperstatus bleibt klein und startet weder SDK noch Paketöffnung", async (t) => {
  const f = await fixture(t);
  await f.requests.prepare(job);
  let stores = 0;
  const helper = await createLightroomSearchRequestHandler({ searchRoot: path.join(f.directory, "lightroom"), openStore: async () => { stores++; } });
  const result = await helper.handle({ command: "catalog-usage-request", catalogPath: f.inputs[0].catalogPath });
  assert.equal(result.ok, true);
  assert.equal(result.result.required, true);
  assert.equal(stores, 0);
  await helper.close();
});

test("SDK-Abbruch wird zum sichtbaren technischen Fehler, nicht zu leerem Katalog; Retry bindet neue Erfassung", async (t) => {
  const f = await fixture(t);
  await f.requests.prepare(job);
  const bound = await catalogUsageRequest(f.root, { catalogPath: f.inputs[0].catalogPath });
  await reportCatalogUsageRequestError(f.root, { captureRequestId: bound.requestId, requestRevision: bound.requestRevision, message: "Erfassung abgebrochen" });
  const gate = createLightroomCloseGate({ taxonomyRoot: f.root, usageRequests: f.requests,
    processes: async () => [{ id: 123, path: "C:\\Adobe\\Lightroom.exe" }],
    closeProcesses: async () => { throw new Error("Kein vorzeitiges Schließen"); } });
  await assert.rejects(gate.ready({ job }), /Erfassung abgebrochen/);
  await assert.rejects(gate.requestClose({ confirmed: true, updateRunId: job.updateRunId }), /angehalten/);
  assert.deepEqual(await catalogUsageRegistration(f.root), f.registry);
  await f.requests.prepare({ ...job, renewUsageRequest: true });
  assert.notEqual((await f.requests.status(job.updateRunId)).request.requestId, bound.requestId);
});

test("fehlende Erstregistrierung und unveränderter geschlossener Nachweis sind getrennte Fälle", async (t) => {
  const f = await fixture(t);
  await f.close();
  // Re-establish a genuine explicit receipt for the new closed file state.
  const service = createCatalogUsageService({ taxonomyRoot: f.root });
  const preview = await service.catalogUsagePreview();
  await service.catalogUsageSave({ token: preview.token, confirmed: true, allCatalogsConfirmed: true, unchangedSinceCapture: true });
  assert.equal((await f.requests.prepare(job)).requested, false);
  await fs.unlink(path.join(f.root, "catalog-usage", "registry.json"));
  await assert.rejects(f.requests.prepare(job), /einmalig registriert/);
});
