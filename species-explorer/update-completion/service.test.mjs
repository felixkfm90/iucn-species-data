import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { createTaxonomyUpdateCoordinator } from "../taxonomy-update-coordinator.mjs";
import { taxonomyPublicationPath } from "../taxonomy-publication-storage.mjs";
import { createUpdateCompletionProofReader } from "./proof.mjs";
import { createCompletionStore, writeCompletionJson } from "./storage.mjs";
import { createUpdateCompletionService } from "./service.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "update-end-"));
  const taxonomyRoot = path.join(root, "data", "taxonomy"), searchRoot = path.join(root, "data", "lightroom");
  const stateRoot = path.join(root, "device-state"), deviceId = "device-felix", deviceName = "Felix-PC";
  let wall = Date.parse("2026-10-31T12:00:00.000Z"), monotonic = 0;
  const timers = new Map(); let nextTimer = 1;
  const clock = { now: () => wall, monotonic: () => monotonic,
    setTimeout: (callback) => { const id = nextTimer++; timers.set(id, callback); return id; }, clearTimeout: (id) => timers.delete(id) };
  const source = { status: "completed", active: false, activeRelease: "col-current", error: "" };
  const master = { status: "completed", active: false, error: "", buildJob: { available: false },
    lifecycle: { active: { candidateId: "master-current" }, candidate: null, blockingConflictCount: 0 },
    reference: { activeRelease: "col-current", needsMasterRebuild: false },
    corrections: { pending: false, currentRevision: "corrections-1" }, identities: { pending: false, revision: "identities-1" },
    lightroomPackage: { status: "current", needsRebuild: false, packageVersion: "master-current",
      active: { masterVersion: "master-current", packageId: "lightroom-current" } } };
  const publication = { schemaVersion: 1, taxonomyRoot, searchRoot, active: { id: `publication-${randomUUID()}`,
    masterVersion: "master-current", packageId: "lightroom-current" }, previous: null };
  await fs.mkdir(path.dirname(taxonomyPublicationPath(taxonomyRoot)), { recursive: true });
  await writeCompletionJson(taxonomyPublicationPath(taxonomyRoot), publication);
  const masterService = { status: async () => clone(master) }, maintenanceService = { status: async () => clone(source) };
  const coordinator = createTaxonomyUpdateCoordinator({ taxonomyRoot, masterService, maintenanceService,
    checkStartReady: async () => ({ ready: true, usageRevision: "synthetic-usage-proof" }),
    now: () => new Date(wall), setTimer: clock.setTimeout, clearTimer: clock.clearTimeout });
  // The existing coordinator's real start/save/finish methods run unchanged.
  // Only its independent process-owner lock is replaced; no SQLite is opened.
  coordinator.ensureOwnerLock = async () => {};
  const proofReader = createUpdateCompletionProofReader({ taxonomyRoot, masterService, maintenanceService });
  const calls = [], guard = { deviceId, known: true, uiDrafts: false, countdownVisible: true, writersActive: false, jobsActive: false,
    pipeline: { status: "idle" }, backup: { status: "idle" }, websiteTransfer: { running: false }, pendingChanges: { hasPendingChanges: false } };
  const services = [];
  const dependencies = { stateRoot, deviceId, deviceName, proofReader, clock,
    readCloseState: async () => clone(guard), prepareClose: async (context) => { calls.push(["close", context]); return { ownWritersClosed: true }; },
    execute: async (context) => { calls.push(["execute", context]); return { requested: true, action: context.action }; }, ...options };
  const create = (extra = {}) => { const service = createUpdateCompletionService({ ...dependencies, ...extra }); services.push(service); return service; };
  const service = create();
  t.after(async () => {
    try { for (const entry of services) await entry.close(); }
    finally {
      await coordinator.close();
      await fs.rm(assertTestTempPath(root), { recursive: true, force: true });
    }
  });
  const f = { root, stateRoot, taxonomyRoot, deviceId, deviceName, clock, coordinator, proofReader, source, master, publication,
    service, guard, calls, create, timers,
    advance(ms) { wall += ms; monotonic += ms; }, jumpWall(ms) { wall += ms; },
    async newRun() { return coordinator.start({ confirmed: true, decision: "current" }); },
    async workflow() { return JSON.parse(await fs.readFile(coordinator.file, "utf8")); },
    async patchWorkflow(patch) { const record = await f.workflow(); await writeCompletionJson(coordinator.file, { ...record, ...patch }); },
    async bind(action = "shutdown", target = service) {
      const selection = await target.prepareSelection({ action, deviceId });
      const run = await f.newRun();
      await target.bindStartedRun({ selectionId: selection.selectionId, updateRunId: run.updateRunId, deviceId });
      return selection;
    },
    async countdown(action = "shutdown", target = service) {
      await f.bind(action, target);
      const displayed = await target.evaluate();
      assert.equal(displayed.status, "awaiting-display");
      return target.acknowledgeCountdown(displayed);
    },
  };
  return f;
}

test("sicherer Standard tut nichts, obwohl der echte Koordinator einen neuen Gesamtabschluss speichert", async (t) => {
  const f = await fixture(t);
  const selected = await f.service.prepareSelection();
  assert.equal(selected.action, "none");
  const run = await f.newRun();
  assert.equal((await f.workflow()).status, "completed");
  await f.service.bindStartedRun({ ...selected, updateRunId: run.updateRunId });
  f.advance(120_000);
  assert.equal((await f.service.evaluate()).status, "inactive");
  assert.equal(f.calls.length, 0);
});

test("frischer gespeicherter Gesamtauftrag startet erst nach sichtbaren vollen 60 Sekunden genau eine Aktion", async (t) => {
  const f = await fixture(t);
  const countdown = await f.countdown();
  assert.equal(countdown.remainingSeconds, 60);
  f.advance(59_000);
  assert.equal((await f.service.evaluate()).remainingSeconds, 1);
  assert.equal(f.calls.length, 0);
  f.advance(1000);
  const results = await Promise.all([f.service.evaluate(), f.service.evaluate(), f.service.evaluate()]);
  assert.ok(results.every((entry) => entry.status === "requested"));
  assert.deepEqual(f.calls.map(([kind]) => kind), ["close", "execute"]);
  const context = f.calls[1][1];
  assert.equal(context.updateRunId, (await f.workflow()).updateRunId);
  assert.equal(context.deviceId, f.deviceId);
  assert.equal((await f.service.readClaim(countdown.selectionId)).claimId, context.claimId);
  for (let index = 0; index < 5; index += 1) await f.service.status();
  assert.equal(f.calls.length, 2);
});

test("Fremdgerät und alter Run werden vor Bindung abgewiesen; verlorene Auswahlantwort erzeugt keine zweite Auswahl", async (t) => {
  const f = await fixture(t);
  const old = await f.newRun();
  await assert.rejects(f.service.prepareSelection({ action: "shutdown", deviceId: "device-nas" }), { code: "UPDATE_COMPLETION_WRONG_DEVICE" });
  const requestId = randomUUID();
  const selected = await f.service.prepareSelection({ action: "shutdown", deviceId: f.deviceId, requestId });
  assert.deepEqual(await f.service.prepareSelection({ action: "shutdown", deviceId: f.deviceId, requestId }), selected);
  await assert.rejects(f.service.bindStartedRun({ selectionId: selected.selectionId, updateRunId: old.updateRunId }), { code: "UPDATE_COMPLETION_STALE_RUN" });
  await assert.rejects(f.service.bindStartedRun({ selectionId: selected.selectionId, updateRunId: `update-${randomUUID()}` }), { code: "UPDATE_COMPLETION_STALE_RUN" });
  assert.equal(f.calls.length, 0);
});

test("Quellenabschluss, Pause, Abbruch, Fehler und wartende Entscheidungen sind keine Auslöser", async (t) => {
  for (const status of ["sources", "paused", "pausing", "waiting-lightroom", "waiting-usage", "waiting-decisions", "failed", "partial", "stale", "interrupted", "cancelled"]) {
    await t.test(status, async (st) => {
      const f = await fixture(st);
      await f.bind();
      await f.patchWorkflow({ status, phase: status, completedAt: null });
      f.advance(120_000);
      const result = await f.service.evaluate();
      assert.ok(["waiting-update", "disarmed"].includes(result.status));
      assert.equal(f.calls.length, 0);
    });
  }
});

test("geprüftes Paar verlangt echte passende Identitäten statt frei gesetztem success/current", async (t) => {
  const cases = {
    "Paket veraltet": (f) => { f.master.lightroomPackage.status = "stale"; },
    "Paket-ID abweichend": (f) => { f.master.lightroomPackage.active.packageId = "other"; },
    "Master abweichend": (f) => { f.master.lifecycle.active.candidateId = "other"; },
    "eigene Entscheidungen offen": (f) => { f.master.identities.pending = true; },
    "Schreiber aktiv": (f) => { f.master.active = true; },
    "fremder Build": async (f) => { await f.patchWorkflow({ buildStarted: true }); f.master.buildJob = { available: true, status: "ready", updateRunId: `update-${randomUUID()}` }; },
    "falscher Quellenstand": (f) => { f.master.reference.activeRelease = "col-other"; },
    "Quellenfehler": (f) => { f.source.error = "Quelle fehlt"; },
    "fehlender echter Paarzeiger": async (f) => { await fs.rm(taxonomyPublicationPath(f.taxonomyRoot)); },
    "falsches Veröffentlichungsgerät": async (f) => { await writeCompletionJson(taxonomyPublicationPath(f.taxonomyRoot), { ...f.publication, taxonomyRoot: path.join(f.root, "other") }); },
  };
  for (const [label, mutate] of Object.entries(cases)) await t.test(label, async (st) => {
    const f = await fixture(st); await f.bind(); await mutate(f); f.master.success = true;
    assert.equal((await f.service.evaluate()).status, "disarmed");
    assert.equal(f.calls.length, 0);
  });
});

test("rechtzeitige Abwahl während des Countdowns bleibt auch nach mehrfachen Abfragen endgültig", async (t) => {
  const f = await fixture(t), countdown = await f.countdown();
  f.advance(59_000);
  const cancelled = await f.service.cancel(countdown);
  assert.equal(cancelled.status, "cancelled");
  assert.equal((await f.service.cancel(countdown)).status, "cancelled");
  f.advance(120_000);
  assert.equal((await f.service.evaluate()).status, "cancelled");
  assert.equal(f.calls.length, 0);
});

test("ohne sichtbare Countdownanzeige und frische Bestätigung keine Aktion", async (t) => {
  const f = await fixture(t);
  await f.bind();
  const display = await f.service.evaluate();
  f.advance(120_000);
  assert.equal((await f.service.evaluate()).status, "awaiting-display");
  assert.equal(f.calls.length, 0);
  f.guard.countdownVisible = false;
  await assert.rejects(f.service.acknowledgeCountdown(display), { code: "UPDATE_COMPLETION_NOT_VISIBLE" });
});

test("lokale Drafts, laufende Routine und unbekannte Schutzwerte stoppen vor dem Claim", async (t) => {
  const cases = {
    "UI-Draft": (f) => { f.guard.uiDrafts = true; },
    "gespeicherte offene Änderung": (f) => { f.guard.pendingChanges.hasPendingChanges = true; },
    "laufende Sicherung": (f) => { f.guard.backup.status = "running"; },
    "Pipeline-Prüfung": (f) => { f.guard.pipeline.status = "awaiting-review"; },
    "eigener Schreiber": (f) => { f.guard.writersActive = true; },
    "anderer eigener Job": (f) => { f.guard.jobsActive = true; },
    "Squarespace-Übernahme": (f) => { f.guard.websiteTransfer.running = true; },
    "unbekannte Drafts": (f) => { delete f.guard.uiDrafts; },
    "anderes lokales Gerät": (f) => { f.guard.deviceId = "device-other"; },
  };
  for (const [label, mutate] of Object.entries(cases)) await t.test(label, async (st) => {
    const f = await fixture(st), countdown = await f.countdown(); mutate(f); f.advance(60_000);
    assert.equal((await f.service.evaluate()).status, "blocked");
    assert.equal(await f.service.readClaim(countdown.selectionId), null);
    assert.equal(f.calls.length, 0);
  });
});

test("nach beseitigtem Draft ist erneut ein voller sichtbar bestätigter Countdown nötig", async (t) => {
  const f = await fixture(t);
  await f.countdown(); f.advance(59_000); f.guard.uiDrafts = true;
  assert.equal((await f.service.evaluate()).status, "blocked");
  f.guard.uiDrafts = false; f.advance(120_000);
  const next = await f.service.evaluate();
  assert.equal(next.status, "awaiting-display");
  assert.equal((await f.service.acknowledgeCountdown(next)).remainingSeconds, 60);
  assert.equal(f.calls.length, 0);
});

test("Wiederöffnung deaktiviert alte Auswahl und Countdown ohne Wiederholung", async (t) => {
  const f = await fixture(t);
  await f.countdown(); f.advance(60_000);
  const restarted = f.create();
  assert.equal((await restarted.status()).status, "disarmed");
  await restarted.evaluate(); await f.service.evaluate();
  assert.equal(f.calls.length, 0);
});

test("Antwortverlust nach Executoraufruf bleibt ungewiss und wird nie automatisch wiederholt", async (t) => {
  let attempts = 0;
  const f = await fixture(t, { execute: async () => { attempts += 1; throw new Error("Antwort verloren"); } });
  await f.countdown(); f.advance(60_000);
  const result = await f.service.evaluate();
  assert.equal(result.status, "uncertain");
  assert.match(result.error, /Antwort verloren/);
  await f.service.evaluate(); await f.create().evaluate();
  assert.equal(attempts, 1);
});

test("Schließfehler oder fehlender Schreibabschluss verhindert den Executor und bleibt sichtbar", async (t) => {
  const f = await fixture(t, { prepareClose: async () => { throw new Error("Schreiber nicht abgeschlossen"); } });
  await f.countdown(); f.advance(60_000);
  const result = await f.service.evaluate();
  assert.equal(result.status, "uncertain");
  assert.match(result.error, /Schreiber nicht abgeschlossen/);
  assert.equal(f.calls.length, 0);
});

test("persistenter Claim vor verlorener Zustandsantwort verhindert selbst dann den Executor", async (t) => {
  const f = await fixture(t);
  let inject = true;
  const store = createCompletionStore({ stateRoot: f.stateRoot, deviceId: f.deviceId,
    writeJson: async (filename, value) => {
      if (inject && value.status === "claimed") { inject = false; throw new Error("Speicherantwort verloren"); }
      return writeCompletionJson(filename, value);
    } });
  const service = f.create({ store });
  const countdown = await f.countdown("shutdown", service); f.advance(60_000);
  await assert.rejects(service.evaluate(), /Speicherantwort verloren/);
  assert.ok(await service.readClaim(countdown.selectionId));
  assert.equal((await service.evaluate()).status, "uncertain");
  assert.equal(f.calls.length, 0);
});

test("zwei konkurrierende Dateiclaims beanspruchen dieselbe Auswahl genau einmal", async (t) => {
  const f = await fixture(t), store = createCompletionStore({ stateRoot: f.stateRoot, deviceId: f.deviceId });
  const context = { selectionId: randomUUID(), claimId: randomUUID() };
  const results = await Promise.all([store.claim(context), store.claim({ ...context, claimId: randomUUID() })]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.ok((await store.readClaim(context.selectionId)).claimId);
});

test("neuer fremder Run während des Countdowns deaktiviert die frühere Erfolgsaktion", async (t) => {
  const f = await fixture(t);
  await f.countdown(); f.advance(60_000); await f.newRun();
  assert.equal((await f.service.evaluate()).status, "disarmed");
  assert.equal(f.calls.length, 0);
});

test("Runwechsel während der letzten UI-Schutzabfrage darf keinen vorherigen Erfolg beanspruchen", async (t) => {
  let switchRun = false, f;
  f = await fixture(t, { readCloseState: async () => {
    if (switchRun) { switchRun = false; await f.patchWorkflow({ updateRunId: `update-${randomUUID()}` }); }
    return clone(f.guard);
  } });
  await f.countdown(); f.advance(60_000); switchRun = true;
  assert.equal((await f.service.evaluate()).status, "disarmed");
  assert.equal(f.calls.length, 0);
});

test("vorübergehend unlesbarer echter Abschluss stoppt den Countdown und verlangt eine neue volle Anzeige", async (t) => {
  const f = await fixture(t);
  let unavailable = false;
  const service = f.create({ proofReader: { ...f.proofReader, read: async () => {
    if (unavailable) throw new Error("Gespeicherter Auftragsstatus nicht lesbar");
    return f.proofReader.read();
  } } });
  await f.countdown("shutdown", service); f.advance(60_000); unavailable = true;
  assert.equal((await service.evaluate()).status, "blocked");
  unavailable = false;
  const display = await service.evaluate();
  assert.equal(display.status, "awaiting-display");
  assert.equal((await service.acknowledgeCountdown(display)).remainingSeconds, 60);
  assert.equal(f.calls.length, 0);
});

test("Uhrsprung verkürzt den mit monotoner Uhr gemessenen Countdown nicht", async (t) => {
  const f = await fixture(t);
  await f.countdown(); f.jumpWall(24 * 60 * 60 * 1000);
  assert.equal((await f.service.evaluate()).remainingSeconds, 60);
  assert.equal(f.calls.length, 0);
});

test("regulärer eigener Close während prepareClose führt nicht zum Selbst-Deadlock", async (t) => {
  const f = await fixture(t);
  const service = f.create({ prepareClose: async () => { await service.close(); return { ownWritersClosed: true }; } });
  await f.countdown("exit-explorer", service); f.advance(60_000);
  assert.equal((await service.evaluate()).status, "requested");
  assert.equal(f.calls.filter(([kind]) => kind === "execute").length, 1);
});

test("Schließen während einer wartenden Statusprüfung verhindert jeden nachlaufenden Claim", async (t) => {
  const f = await fixture(t), gate = deferred(), entered = deferred();
  const service = f.create({ proofReader: { ...f.proofReader, read: async () => { entered.resolve(); await gate.promise; return f.proofReader.read(); } } });
  await f.bind("shutdown", service);
  const evaluating = service.evaluate(); await entered.promise;
  const closing = service.close(); gate.resolve();
  await Promise.all([evaluating, closing]);
  assert.equal((await service.status()).status, "disarmed");
  assert.equal(f.calls.length, 0);
});
