import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { activateExplorerWindow } from "./window-activation.mjs";
import { isBackupBlockingShutdown, isPipelineBlockingShutdown } from "./server-lifecycle.mjs";

test("erneuter Start stellt das vorhandene Fenster wieder her und aktiviert es", () => {
  const calls = [];
  const window = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => calls.push("restore"),
    isVisible: () => false,
    show: () => calls.push("show"),
    focus: () => calls.push("focus"),
    moveTop: () => calls.push("moveTop"),
  };
  assert.equal(activateExplorerWindow(window), true);
  assert.deepEqual(calls, ["restore", "show", "focus", "moveTop"]);
});

test("zerstörte oder noch nicht erzeugte Fenster werden sicher ignoriert", () => {
  assert.equal(activateExplorerWindow(null), false);
  assert.equal(activateExplorerWindow({ isDestroyed: () => true }), false);
});

const mainSource = await readFile(new URL("./main.mjs", import.meta.url), "utf8");
const closeSource = mainSource.slice(mainSource.indexOf("async function handleWindowClose("),
  mainSource.indexOf("\nasync function boot()"));

function createCloseHarness({ statuses = {}, answers = [], messageHook = null } = {}) {
  const calls = [];
  const dialogs = [];
  const read = (name, fallback) => async () => {
    calls.push(name);
    if (Object.hasOwn(statuses, name)) {
      if (statuses[name] instanceof Error) throw statuses[name];
      return await statuses[name];
    }
    return fallback;
  };
  const dependencies = {
    managedServer: { baseUrl: "http://fixture.invalid" },
    mainWindow: { destroy: () => calls.push("destroy") },
    app: { quit: () => calls.push("quit") },
    dialog: {
      showMessageBox: async (_window, options) => {
        dialogs.push(options);
        if (messageHook) return messageHook(options);
        return { response: answers.shift() ?? 0 };
      },
      showErrorBox: (...args) => calls.push(["error", ...args]),
    },
    getExplorerPipelineStatus: read("pipeline", { status: "idle" }),
    getExplorerBackupStatus: read("backup", { status: "idle" }),
    getExplorerPendingChanges: read("pending", { hasPendingChanges: false }),
    stopManagedExplorerServer: async () => calls.push("stop"),
    isBackupBlockingShutdown,
    isPipelineBlockingShutdown,
  };
  // Execute the actual main-module close handler with inert Electron dependencies.
  const close = new Function("deps", `
    const {managedServer,mainWindow,app,dialog,getExplorerPipelineStatus,
      getExplorerBackupStatus,getExplorerPendingChanges,stopManagedExplorerServer,
      isBackupBlockingShutdown,isPipelineBlockingShutdown}=deps;
    let quitting=false;
    let closeCheckInProgress=false;
    ${closeSource}
    return handleWindowClose;
  `)(dependencies);
  return { calls, dialogs, close: () => close({ preventDefault: () => calls.push("prevent") }) };
}

test("Desktop-Schließen beendet nach drei lesbaren unkritischen Statuswerten", async () => {
  const harness = createCloseHarness();
  await harness.close();
  assert.deepEqual(harness.calls, ["prevent", "pipeline", "backup", "pending", "stop", "destroy", "quit"]);
  assert.equal(harness.dialogs.length, 0);
});

test("Desktop-Schließen erhält bekannte Warnungen trotz eines anderen Lesefehlers", async () => {
  const harness = createCloseHarness({
    statuses: { pipeline: new Error("unreadable"), backup: { status: "running" },
      pending: { hasPendingChanges: true } },
    answers: [1, 1, 0],
  });
  await harness.close();
  assert.deepEqual(harness.dialogs.map((value) => value.title), [
    "Backup läuft noch", "Offene Änderungen", "Status nicht vollständig geprüft",
  ]);
  assert.match(harness.dialogs[2].detail, /Pipeline/);
  assert.doesNotMatch(harness.dialogs[2].detail, /Sicherungsstatus|Änderungsstatus/);
  assert.equal(harness.calls.includes("destroy"), false);
});

test("Desktop-Schließen lässt die App bei unbekanntem Status standardmäßig offen", async () => {
  const harness = createCloseHarness({ statuses: { backup: new Error("timeout") } });
  await harness.close();
  assert.equal(harness.dialogs.length, 1);
  assert.deepEqual(harness.dialogs[0].buttons, ["App offen lassen", "Trotzdem schließen"]);
  assert.equal(harness.dialogs[0].defaultId, 0);
  assert.equal(harness.dialogs[0].cancelId, 0);
  assert.equal(harness.calls.includes("stop"), false);
});

test("Desktop-Schließen erfordert für einen unbekannten Status eine ausdrückliche Bestätigung", async () => {
  const harness = createCloseHarness({ statuses: { pending: null }, answers: [1] });
  await harness.close();
  assert.equal(harness.dialogs.length, 1);
  assert.deepEqual(harness.calls.slice(-3), ["stop", "destroy", "quit"]);
});

test("Desktop-Schließen behandelt ungültige Statusformen als unbekannt", async () => {
  const harness = createCloseHarness({
    statuses: { pipeline: { status: "unrecognized" }, backup: {}, pending: { hasPendingChanges: "false" } },
  });
  await harness.close();
  assert.equal(harness.dialogs.length, 1);
  assert.equal(harness.calls.includes("destroy"), false);
});

test("Desktop-Schließen startet während laufender Statuslesung keine zweite Prüfung", async () => {
  let resolve;
  const waiting = new Promise((done) => { resolve = done; });
  const harness = createCloseHarness({ statuses: { pipeline: waiting } });
  const first = harness.close();
  const second = harness.close();
  resolve({ status: "idle" });
  await Promise.all([first, second]);
  assert.equal(harness.calls.filter((value) => value === "pipeline").length, 1);
  assert.equal(harness.calls.filter((value) => value === "destroy").length, 1);
});

test("Desktop-Schließen dupliziert offene Dialoge nicht und erlaubt nach Abbruch einen neuen Versuch", async () => {
  let resolve;
  let firstDialog;
  let dialogCalls = 0;
  const opened = new Promise((done) => { firstDialog = done; });
  const harness = createCloseHarness({
    statuses: { pending: { hasPendingChanges: true } },
    messageHook: () => {
      dialogCalls += 1;
      if (dialogCalls === 2) return { response: 0 };
      firstDialog();
      return new Promise((done) => { resolve = done; });
    },
  });
  const first = harness.close();
  await opened;
  await harness.close();
  assert.equal(harness.dialogs.length, 1);
  resolve({ response: 0 });
  await first;
  const retried = harness.close();
  await Promise.resolve();
  await new Promise((done) => setImmediate(done));
  assert.equal(harness.dialogs.length, 2);
  resolve({ response: 0 });
  await retried;
  assert.equal(harness.calls.includes("destroy"), false);
});
