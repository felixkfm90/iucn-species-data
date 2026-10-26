import { tmpdir } from "../scripts/test-temp.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { captureCatalogUsage, createCatalogUsageService, catalogUsageStatus, catalogUsageRegistration } from "./lightroom-catalog-usage.mjs";
import { createLightroomUsageRequestService, catalogUsageRequest, reportCatalogUsageRequestError } from "./lightroom-usage-request.mjs";
import { createLightroomCloseGate } from "./lightroom-close-gate.mjs";
import { createLightroomSearchRequestHandler } from "./lightroom-search-helper.mjs";

const ID = `mtx_${"a".repeat(32)}`;
const job = { updateRunId: "update-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", phase: "start", status: "waiting-lightroom",
  startedAt: "2026-10-03T10:00:00.000Z", usageConsent: { allCatalogsConfirmed: true, noChangesUntilClose: true } };
async function fixture(t, count = 1) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "fn-usage-request-"));
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

test("bestätigter lokaler Wiederanlauf verlangt auch bei aktueller geschlossener FN-Quittung eine neue eigene Requestbindung", async (t) => {
  const f = await fixture(t);
  for (const input of f.inputs) await fs.unlink(input.catalogPath + ".lock");
  assert.equal((await catalogUsageStatus(f.root)).ready, true);
  const capturesBefore = await fs.readFile(path.join(f.root, "catalog-usage", "captures.json"));
  const restart = { ...job, freshUsageCapture: true, confirmedCatalogs: f.inputs.map((input) => input.catalogPath) };
  const created = await f.requests.prepare(restart);
  assert.equal(created.requested, true);
  const pending = await f.requests.status(restart.updateRunId);
  assert.equal(pending.exists, true);
  assert.equal(pending.ready, false, "Alte globale Quittung ist keine Quittung des neuen Auftrags");
  assert.deepEqual(await fs.readFile(path.join(f.root, "catalog-usage", "captures.json")), capturesBefore);
  assert.deepEqual(await catalogUsageRegistration(f.root), f.registry);
  const gate = createLightroomCloseGate({ taxonomyRoot: f.root, usageRequests: f.requests, processes: async () => [] });
  assert.equal((await gate.ready({ job: restart })).ready, false);
  await f.capture();
  assert.equal((await gate.ready({ job: restart })).ready, true);
  assert.equal((await f.requests.status(restart.updateRunId)).request.status, "completed");
  assert.equal((await gate.ready({ job: { ...restart, phase: "build" } })).ready, true);
  await fs.appendFile(f.inputs[0].catalogPath, "changed after closed fresh capture");
  assert.equal((await gate.ready({ job: { ...restart, phase: "build" } })).ready, false);
});

test("lokaler Wiederanlauf bindet den neu bestätigten Katalogsatz und übernimmt keinen fremden Close-Marker", async (t) => {
  const f = await fixture(t);
  await f.requests.prepare(job);
  await f.requests.queueNormalClose(job.updateRunId);
  const restart = { ...job, updateRunId: "update-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", freshUsageCapture: true,
    confirmedCatalogs: f.inputs.map((input) => input.catalogPath) };
  await assert.rejects(f.requests.prepare({ ...restart, confirmedCatalogs: [] }), /Katalogsatz/);
  await assert.rejects(f.requests.prepare({ ...restart, confirmedCatalogs: [path.join(f.directory, "foreign.lrcat")] }), /Katalogsatz/);
  await f.requests.prepare(restart);
  const value = await f.requests.status(restart.updateRunId);
  assert.equal(value.request.normalCloseRequestedAt, undefined);
  assert.equal(value.ready, false);
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

test("bestätigtes normales Schließen bleibt beim eigenen Erfassungsretry erhalten und wartet auf neue SDK-Quittung", async (t) => {
  const f = await fixture(t);
  let closeCalls = 0;
  const gate = createLightroomCloseGate({ taxonomyRoot: f.root, usageRequests: f.requests,
    processes: async () => [{ id: 123, path: "C:\\Adobe\\Lightroom.exe" }],
    closeProcesses: async () => { closeCalls++; } });
  await f.requests.prepare(job);
  await gate.requestClose({ confirmed: true, updateRunId: job.updateRunId });
  const original = (await f.requests.status(job.updateRunId)).request;
  await reportCatalogUsageRequestError(f.root, { captureRequestId: original.requestId,
    requestRevision: original.captureRevision, message: "Erfassung abgebrochen" });
  await assert.rejects(gate.ready({ job }), /Erfassung abgebrochen/);
  assert.equal(closeCalls, 0, "kein Schließen nach abgebrochener Erfassung");
  await f.requests.prepare({ ...job, renewUsageRequest: true });
  const retry = (await f.requests.status(job.updateRunId)).request;
  assert.notEqual(retry.requestId, original.requestId);
  assert.notEqual(retry.captureRevision, original.captureRevision);
  assert.equal(retry.normalCloseRequestedAt, original.normalCloseRequestedAt);
  assert.equal(retry.normalCloseAttemptedAt, undefined);
  assert.equal(retry.captureError, undefined);
  await gate.ready({ job });
  assert.equal(closeCalls, 0, "alte Quittung darf erneuerte Erfassung nicht freigeben");
  await f.capture();
  await gate.ready({ job });
  await gate.ready({ job });
  assert.equal(closeCalls, 1, "gespeicherte Bestätigung fordert nach frischer Erfassung genau einmal normales Schließen an");
});

test("Schließbestätigung wird nicht auf fremden, neu bestätigten oder stornierten Auftrag übertragen", async (t) => {
  for (const scenario of ["foreign-run", "new-agreement", "cancelled", "no-consent"]) {
    const f = await fixture(t);
    await f.requests.prepare(job);
    await f.requests.queueNormalClose(job.updateRunId);
    const original = (await f.requests.status(job.updateRunId)).request;
    await reportCatalogUsageRequestError(f.root, { captureRequestId: original.requestId,
      requestRevision: original.captureRevision, message: "Erfassung abgebrochen" });
    let nextJob = { ...job, renewUsageRequest: true };
    if (scenario === "foreign-run") nextJob.updateRunId = "update-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    if (scenario === "new-agreement") nextJob.startedAt = "2026-10-03T11:00:00.000Z";
    if (scenario === "cancelled") await f.requests.syncJob({ ...job, status: "completed" });
    if (scenario === "no-consent") {
      nextJob.usageConsent = { ...job.usageConsent, noChangesUntilClose: false };
      await assert.rejects(f.requests.prepare(nextJob), /einmalige Bestätigung/);
      assert.equal((await f.requests.status(job.updateRunId)).request.status, "paused");
      const gate = createLightroomCloseGate({ taxonomyRoot: f.root, usageRequests: f.requests,
        processes: async () => [{ id: 123, path: "C:\\Adobe\\Lightroom.exe" }],
        closeProcesses: async () => { assert.fail("Widerrufene Startvereinbarung darf kein Schließen auslösen"); } });
      await assert.rejects(gate.ready({ job: nextJob }), /Erfassung abgebrochen/);
      continue;
    }
    await f.requests.prepare(nextJob);
    const retry = (await f.requests.status(nextJob.updateRunId)).request;
    assert.equal(retry.normalCloseRequestedAt, undefined, scenario);
    assert.equal(retry.normalCloseAttemptedAt, undefined, scenario);
    let closeCalls = 0;
    const gate = createLightroomCloseGate({ taxonomyRoot: f.root, usageRequests: f.requests,
      processes: async () => [{ id: 123, path: "C:\\Adobe\\Lightroom.exe" }], closeProcesses: async () => { closeCalls++; } });
    await f.capture();
    await gate.ready({ job: nextJob });
    assert.equal(closeCalls, 0, scenario);
  }
});

test("bereits abgeschlossener eigener Erfassungsrequest ersetzt weder neue Quittung noch neuen Schließnachweis", async (t) => {
  const f = await fixture(t);
  let closeCalls = 0;
  const gate = createLightroomCloseGate({ taxonomyRoot: f.root, usageRequests: f.requests,
    processes: async () => [{ id: 123, path: "C:\\Adobe\\Lightroom.exe" }], closeProcesses: async () => { closeCalls++; } });
  await f.requests.prepare(job);
  await gate.requestClose({ confirmed: true, updateRunId: job.updateRunId });
  await f.capture();
  await gate.ready({ job });
  assert.equal(closeCalls, 1);
  await f.close();
  await f.requests.bindClosed(job.updateRunId);
  const original = (await f.requests.status(job.updateRunId)).request;
  assert.equal(original.status, "completed");
  assert.ok(original.normalCloseAttemptedAt);
  await fs.writeFile(f.inputs[0].catalogPath + ".lock", "reopened synthetic catalog");
  await f.requests.prepare({ ...job, renewUsageRequest: true });
  const retry = await f.requests.status(job.updateRunId);
  assert.equal(retry.ready, false, "abgeschlossene alte Quittung ist nicht an neuen Request gebunden");
  assert.equal(retry.request.status, "pending");
  assert.equal(retry.request.normalCloseRequestedAt, original.normalCloseRequestedAt);
  assert.equal(retry.request.normalCloseAttemptedAt, undefined, "alter Schließversuch ist kein Versuch für den neuen Request");
  await gate.ready({ job });
  assert.equal(closeCalls, 1);
  await f.capture();
  await gate.ready({ job });
  await gate.ready({ job });
  assert.equal(closeCalls, 2, "neuer Request nach frischer Quittung genau einmal versucht");
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
