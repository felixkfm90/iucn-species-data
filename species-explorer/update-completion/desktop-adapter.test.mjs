import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { assertTestTempPath, tmpdir } from "../../scripts/test-temp.mjs";
import { createDesktopUpdateCompletionAdapter, shutdownCommand } from "../desktop/update-completion-adapter.mjs";
import { createCompletionStore } from "./storage.mjs";

async function fixture(t, extra = {}) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "completion-native-fake-"));
  t.after(() => fs.rm(assertTestTempPath(root), { recursive: true, force: true }));
  const deviceId = "device-local", sessionId = randomUUID();
  const store = createCompletionStore({ stateRoot: root, deviceId });
  const context = { schemaVersion: 1, claimId: randomUUID(), selectionId: randomUUID(), sessionId,
    updateRunId: `update-${randomUUID()}`, deviceId, action: "shutdown", proofRevision: "a".repeat(64), claimedAt: "2026-10-31T12:00:00Z" };
  if (extra.action) context.action = extra.action;
  await store.claim(context);
  const calls = [];
  const guard = { deviceId, known: true, uiDrafts: false, countdownVisible: true, writersActive: false, jobsActive: false,
    pipeline: { status: "idle" }, backup: { status: "idle" }, websiteTransfer: { running: false }, pendingChanges: { hasPendingChanges: false } };
  const dependencies = { deviceId, sessionId, readClaim: (id) => store.readClaim(id), consumeClaimExecution: (claim) => store.consumeClaimExecution(claim),
    readCloseState: async () => guard,
    beginRegularClose: async (claim) => { calls.push(["close", claim]); return { deviceId, updateRunId: claim.updateRunId, claimId: claim.claimId,
      proofRevision: claim.proofRevision, ownWritersClosed: true, appServerClosed: true }; },
    finishExplorerExit: async () => { calls.push(["exit"]); }, restoreAfterFailure: async () => { calls.push(["restore"]); },
    platform: "win32", windowsRoot: "C:\\Windows",
    spawnImpl: (executable, args, options) => {
      calls.push(["spawn", executable, args, options]);
      const child = new EventEmitter(); child.stdout = { resume() {} }; child.stderr = new EventEmitter();
      queueMicrotask(() => child.emit("close", 0));
      return child;
    }, ...extra };
  return { root, context, calls, guard, store, dependencies, adapter: createDesktopUpdateCompletionAdapter(dependencies) };
}

test("Windowsadapter verwendet lokal ausschließlich /s oder /r /t 0 ohne Zwangsflag und Shell", async (t) => {
  for (const [action, flag] of [["shutdown", "/s"], ["restart", "/r"]]) await t.test(action, async (st) => {
    const f = await fixture(st, { action });
    const receipt = await f.adapter.prepareClose(f.context);
    const outcome = await f.adapter.execute(f.context, receipt);
    const spawn = f.calls.find(([kind]) => kind === "spawn");
    assert.equal(spawn[1], "C:\\Windows\\System32\\shutdown.exe");
    assert.deepEqual(spawn[2], [flag, "/t", "0"]);
    assert.equal(spawn[3].shell, false);
    assert.equal(outcome.requested, true);
    assert.equal(outcome.operatingSystemShutdownConfirmed, false);
    assert.deepEqual(f.calls.map(([kind]) => kind), ["close", "spawn", "exit"]);
    await assert.rejects(f.adapter.execute(f.context, receipt));
    assert.equal(f.calls.filter(([kind]) => kind === "spawn").length, 1);
  });
});

test("Explorer beenden durchläuft den regulären Close ohne Windowsbefehl", async (t) => {
  const f = await fixture(t, { action: "exit-explorer" });
  await f.adapter.execute(f.context, await f.adapter.prepareClose(f.context));
  assert.deepEqual(f.calls.map(([kind]) => kind), ["close", "exit"]);
});

test("unpassender Claim, anderes Gerät und frühere Sitzung kommen nicht bis zum Schließen", async (t) => {
  const f = await fixture(t);
  for (const patch of [{ claimId: randomUUID() }, { updateRunId: `update-${randomUUID()}` }, { deviceId: "device-nas" }, { sessionId: randomUUID() }, { proofRevision: "b".repeat(64) }]) {
    await assert.rejects(f.adapter.prepareClose({ ...f.context, ...patch }));
  }
  const afterRestart = createDesktopUpdateCompletionAdapter({ ...f.dependencies, sessionId: randomUUID() });
  await assert.rejects(afterRestart.prepareClose(f.context));
  assert.equal(f.calls.length, 0);
});

test("geänderte Schließquittung oder unvollständiger Schreibabschluss verhindert jede OS-Anforderung", async (t) => {
  const f = await fixture(t);
  const receipt = await f.adapter.prepareClose(f.context);
  await assert.rejects(f.adapter.execute(f.context, { ...receipt, receiptId: randomUUID() }));
  assert.equal(f.calls.filter(([kind]) => kind === "spawn").length, 0);
  const bad = await fixture(t, { beginRegularClose: async () => ({ ownWritersClosed: false, appServerClosed: true }) });
  await assert.rejects(bad.adapter.prepareClose(bad.context), /Abschluss eigener Schreiber/);
  assert.equal(bad.calls.filter(([kind]) => kind === "spawn").length, 0);
});

test("frischer UI-Draft oder neu laufende Sicherung vor dem Close hält die Aktion an", async (t) => {
  for (const mutate of [(f) => { f.guard.uiDrafts = true; }, (f) => { f.guard.backup.status = "running"; }]) {
    const f = await fixture(t); mutate(f);
    await assert.rejects(f.adapter.prepareClose(f.context));
    assert.equal(f.calls.filter(([kind]) => kind === "close" || kind === "spawn").length, 0);
  }
});

test("zwei Adapterinstanzen können denselben dauerhaften Claim nur einmal ausführen", async (t) => {
  const f = await fixture(t), second = createDesktopUpdateCompletionAdapter(f.dependencies);
  const receipt1 = await f.adapter.prepareClose(f.context), receipt2 = await second.prepareClose(f.context);
  const results = await Promise.allSettled([f.adapter.execute(f.context, receipt1), second.execute(f.context, receipt2)]);
  assert.equal(results.filter((entry) => entry.status === "fulfilled").length, 1);
  assert.equal(f.calls.filter(([kind]) => kind === "spawn").length, 1);
});

test("Fehler beim OS-Aufruf oder Antwortverlust bleibt verbraucht und versucht die Aktion nicht erneut", async (t) => {
  for (const failure of ["throw", "error-event", "nonzero"]) await t.test(failure, async (st) => {
    let attempts = 0;
    const f = await fixture(st, { spawnImpl: () => {
      attempts += 1;
      if (failure === "throw") throw new Error("Prozessstart nicht bestätigt");
      const child = new EventEmitter(); child.stderr = new EventEmitter();
      queueMicrotask(() => failure === "error-event" ? child.emit("error", new Error("Antwort verloren")) : child.emit("close", 5));
      return child;
    } });
    const receipt = await f.adapter.prepareClose(f.context);
    await assert.rejects(f.adapter.execute(f.context, receipt));
    const second = createDesktopUpdateCompletionAdapter(f.dependencies);
    await assert.rejects(second.execute(f.context, await second.prepareClose(f.context)), /dauerhaft.*verbraucht/);
    assert.equal(attempts, 1);
  });
});

test("unerwartete Plattform oder Netzwerkziel wird niemals zu einem Shell-Ersatz", () => {
  assert.throws(() => shutdownCommand("shutdown", { platform: "linux", windowsRoot: "C:\\Windows" }));
  assert.throws(() => shutdownCommand("restart", { platform: "win32", windowsRoot: "\\\\NAS\\Windows" }));
  assert.throws(() => shutdownCommand("hibernate", { platform: "win32", windowsRoot: "C:\\Windows" }));
});
