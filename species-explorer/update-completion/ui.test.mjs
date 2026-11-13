import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { createUpdateCompletionService } from "./service.mjs";

function element(tagName = "div") {
  return { tagName: tagName.toUpperCase(), children: [], textContent: "", hidden: false, disabled: false,
    isConnected: true, value: "", listeners: {}, dataset: {}, attributes: {}, parentElement: null,
    css: { display: "block", visibility: "visible", opacity: "1", pointerEvents: "auto" },
    rect: { left: 20, top: 20, right: 320, bottom: 60, width: 300, height: 40 },
    append(...items) { this.children.push(...items); for (const item of items) item.parentElement = this; },
    setAttribute(name, value) { this.attributes[name] = value; }, getAttribute(name) { return this.attributes[name] ?? null; },
    getClientRects() { return [this.rect]; }, getBoundingClientRect() { return this.rect; },
    contains(other) { return this === other || this.children.some((child) => child.contains?.(other)); },
    matches(selector) { return selector === ":disabled" && (this.disabled || this.fieldsetDisabled); },
    querySelector() { return this.children.find((child) => child.tagName === "BUTTON" && "data-update-completion-cancel" in child.attributes) || null; },
    addEventListener(name, callback) { this.listeners[name] = callback; } };
}
async function controller(options = {}) {
  const documentRef = { visibilityState: "visible", createElement: (tag) => element(tag), dialogs: [],
    documentElement: { clientWidth: 1200, clientHeight: 800 }, querySelectorAll() { return this.dialogs; },
    defaultView: { getComputedStyle: (node) => node.css }, elementFromPoint() { return this.hitTarget; } };
  const scope = { console };
  vm.runInNewContext(await fs.readFile(new URL("../public/app-update-completion.js", import.meta.url), "utf8"), scope);
  vm.runInNewContext(await fs.readFile(new URL("../public/app-desktop-completion.js", import.meta.url), "utf8"), scope);
  const selectionContainer = element(), statusContainer = element(), calls = [];
  const deps = { documentRef, selectionContainer, statusContainer, device: { id: "device-local", name: "Nikos PC" },
    hasUnsavedDrafts: () => false,
    requestJson: async (url, request) => { calls.push([url, JSON.parse(request.body)]); return { deviceId: "device-local", action: "restart", status: "countdown", remainingSeconds: 60, cancellable: true }; }, ...options };
  const result = scope.SpeciesExplorerUpdateCompletion.createUpdateCompletionController(deps);
  documentRef.hitTarget = statusContainer.children[1];
  return { controller: result, documentRef, selectionContainer, statusContainer, calls, scope };
}

test("UI startet mit nichts tun und übernimmt keine alte gespeicherte Auswahl als neuen Standard", async () => {
  const f = await controller();
  assert.equal(f.controller.getSelection().action, "none");
  await f.controller.render({ deviceId: "device-local", action: "shutdown", status: "disarmed", message: "Frühere Auswahl deaktiviert", cancellable: false });
  assert.equal(f.controller.getSelection().action, "none");
  assert.equal(f.calls.length, 0);
});

test("sichtbarer Countdown wird gebunden bestätigt und nennt Ziel-PC; Abwahl verwendet dieselbe Run-ID", async () => {
  const f = await controller({ requestJson: async (url, request) => {
    f.calls.push([url, JSON.parse(request.body)]);
    return url.endsWith("displayed")
      ? { deviceId: "device-local", action: "restart", status: "countdown", selectionId: "selection-1", updateRunId: "run-1", remainingSeconds: 60, cancellable: true }
      : { deviceId: "device-local", action: "restart", status: "cancelled", message: "Abgewählt", cancellable: false };
  } });
  await f.controller.render({ deviceId: "device-local", action: "restart", status: "awaiting-display", selectionId: "selection-1", updateRunId: "run-1", presentationToken: "token-1", cancellable: true });
  assert.match(f.statusContainer.children[0].textContent, /Nikos PC.*60/);
  assert.equal(f.calls[0][1].deviceId, "device-local");
  assert.equal(f.calls[0][1].updateRunId, "run-1");
  await f.statusContainer.children[1].listeners.click();
  assert.equal(f.calls[1][1].updateRunId, "run-1");
  assert.equal(f.statusContainer.children[1].hidden, true);
});

test("verdeckte Anzeige, lokale Drafts und unbekannte Drafts bestätigen keinen Countdown", async () => {
  for (const mode of ["hidden", "drafts", "unknown"]) {
    const f = await controller({ hasUnsavedDrafts: () => mode === "unknown" ? undefined : mode === "drafts" });
    if (mode === "hidden") f.documentRef.visibilityState = "hidden";
    await f.controller.render({ deviceId: "device-local", action: "shutdown", status: "awaiting-display", selectionId: "selection-1", updateRunId: "run-1", presentationToken: "token-1", cancellable: true });
    assert.equal(f.calls.length, 0);
  }
});

test("Fremdgerät wird nicht angezeigt oder durch eine neue Zielkennung im Request ersetzt", async () => {
  const f = await controller();
  await assert.rejects(f.controller.render({ deviceId: "device-nas", action: "shutdown", status: "countdown" }), /nicht zu diesem PC/);
  assert.equal(f.calls.length, 0);
});

const awaiting = () => ({ deviceId: "device-local", action: "exit-explorer", status: "awaiting-display",
  selectionId: "selection-1", updateRunId: "run-1", presentationToken: "token-1", cancellable: true });

test("die Abbruchbestätigung bleibt in der aktiven Sitzung sichtbar und erscheint beim späteren Start nicht erneut", async () => {
  const { documentRef, scope } = await controller();
  const selectionContainer = element(), statusContainer = element();
  statusContainer.hidden = true;
  const active = { ...awaiting(), available: true, deviceName: "Test-PC", status: "countdown", remainingSeconds: 60 };
  const cancelled = { ...active, status: "cancelled", cancellable: false, message: "Abschlussaktion abgewählt. Der Explorer bleibt geöffnet." };
  let snapshot = cancelled;
  let scheduledPoll;
  scope.setTimeout = (callback) => { scheduledPoll = callback; return callback; };
  scope.clearTimeout = () => { scheduledPoll = undefined; };
  const completion = scope.SpeciesExplorerDesktopCompletion.setupDesktopCompletion({
    fetchJson: async () => snapshot, documentRef, selectionContainer, statusContainer,
  });
  const settled = () => new Promise(setImmediate);
  try {
    await settled();
    assert.equal(statusContainer.hidden, true, "Ein alter Abbruch bleibt beim Start ausgeblendet.");
    snapshot = { ...active, selectionId: "selection-2", updateRunId: "run-2" };
    scheduledPoll();
    await settled();
    assert.equal(statusContainer.hidden, false);
    snapshot = { ...cancelled, selectionId: "selection-2", updateRunId: "run-2" };
    scheduledPoll();
    await settled();
    assert.equal(statusContainer.hidden, false, "Der Abruf darf die aktuelle Abbruchbestätigung nicht verstecken.");
    assert.equal(statusContainer.children[0].textContent, cancelled.message);
    assert.equal(statusContainer.children[1].hidden, true);
    snapshot = { ...active, status: "inactive", action: "none" };
    scheduledPoll();
    await settled();
    assert.equal(statusContainer.hidden, true);
  } finally { completion.stop(); }
});

test("der echte Datenbankdialog verdeckt den äußeren Banner: kein Countdown bis Abbrechen tatsächlich erreichbar ist", async () => {
  const html = await fs.readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const pipelineStart = html.indexOf('<dialog id="pipeline-dialog"');
  const pipeline = html.slice(pipelineStart, html.indexOf("</dialog>", pipelineStart));
  assert.ok(html.indexOf('id="update-completion-notice"') < pipelineStart);
  assert.match(pipeline, /id="update-completion-selection"/);
  assert.doesNotMatch(pipeline, /id="update-completion-notice"/);
  const f = await controller();
  f.documentRef.dialogs = [{ id: "pipeline-dialog", contains: () => false }];
  await f.controller.render(awaiting());
  assert.equal(f.calls.length, 0, "Kein displayed hinter dem modalen Datenbankdialog");
  assert.equal((await f.controller.closeGuardPresentation()).countdownVisible, false);
  f.documentRef.dialogs = [];
  await f.controller.render(awaiting());
  assert.equal(f.calls.length, 1, "Nach Schließen des Dialogs bleibt der normale sichtbare Weg verwendbar");
  assert.equal(f.statusContainer.children[1].hidden, false);
  assert.equal((await f.controller.closeGuardPresentation()).countdownVisible, true);
});

test("Desktop und Controller verlangen denselben zugänglichen Banner mit bedienbarem Abbrechen", async () => {
  const mutations = [
    (f) => { f.documentRef.dialogs = [{ id: "pipeline-dialog", contains: () => false }]; },
    (f) => { f.documentRef.dialogs = [{ id: "edit-dialog", contains: () => false }]; },
    (f) => { f.documentRef.hitTarget = element(); },
    (f) => { f.statusContainer.children[1].disabled = true; },
    (f) => { f.statusContainer.children[1].fieldsetDisabled = true; },
    (f) => { f.statusContainer.children[1].hidden = true; },
    (f) => { f.statusContainer.css.visibility = "hidden"; },
    (f) => { f.statusContainer.inert = true; },
    (f) => { f.statusContainer.setAttribute("aria-hidden", "true"); },
    (f) => { f.statusContainer.parentElement = { css: { opacity: "0" }, parentElement: null }; },
    (f) => { f.statusContainer.children[1].css.pointerEvents = "none"; },
    (f) => { f.statusContainer.children[1].rect = { left: 20, right: 320, top: 790, bottom: 830, width: 300, height: 40 }; },
  ];
  for (const mutate of mutations) {
    const f = await controller();
    await f.controller.render({ ...awaiting(), status: "countdown", remainingSeconds: 60 });
    f.statusContainer.dataset = { selectionId: "selection-1", updateRunId: "run-1" };
    const read = f.scope.SpeciesExplorerDesktopCompletion.createDesktopCompletionPresentation({
      documentRef: f.documentRef, statusContainer: f.statusContainer, draftProviders: [() => false] });
    assert.equal(read(awaiting()).countdownVisible, true);
    mutate(f);
    assert.equal(read(awaiting()).countdownVisible, false);
    assert.equal((await f.controller.closeGuardPresentation()).countdownVisible, false);
  }
});

test("Desktop behält unbekannte Drafts und die Auftragsbindung bei; ein fehlender UI-Prüfer gibt nichts frei", async () => {
  const f = await controller();
  await f.controller.render({ ...awaiting(), status: "countdown", remainingSeconds: 60 });
  f.statusContainer.dataset = { selectionId: "selection-1", updateRunId: "run-1" };
  const create = (value) => f.scope.SpeciesExplorerDesktopCompletion.createDesktopCompletionPresentation({
    documentRef: f.documentRef, statusContainer: f.statusContainer, draftProviders: [() => value] });
  assert.equal(create(false)(awaiting()).uiDrafts, false);
  assert.equal(create(true)(awaiting()).uiDrafts, true);
  assert.equal(create(undefined)(awaiting()).uiDrafts, undefined);
  assert.equal(create(false)({ ...awaiting(), updateRunId: "different-run" }).countdownVisible, false);
  assert.equal(create(false)({ ...awaiting(), selectionId: "different-selection" }).countdownVisible, false);
  f.scope.SpeciesExplorerUpdateCompletion.isCountdownAccessible = undefined;
  assert.equal(create(false)(awaiting()).countdownVisible, false);
});

test("neu verdeckte Anzeige während asynchroner Draftprüfung sendet kein displayed", async () => {
  let finishDraft;
  const draft = new Promise((resolve) => { finishDraft = resolve; });
  const f = await controller({ hasUnsavedDrafts: () => draft });
  const rendering = f.controller.render(awaiting());
  await Promise.resolve(); await Promise.resolve();
  f.documentRef.dialogs = [{ id: "pipeline-dialog", contains: () => false }];
  finishDraft(false);
  await rendering;
  assert.equal(f.calls.length, 0);
});

test("veränderte Auswahl während asynchroner Draftprüfung bestätigt keinen früheren Countdown", async () => {
  let finishDraft;
  const draft = new Promise((resolve) => { finishDraft = resolve; });
  const f = await controller({ hasUnsavedDrafts: () => draft });
  const rendering = f.controller.render(awaiting());
  await Promise.resolve(); await Promise.resolve();
  await f.controller.render({ ...awaiting(), status: "cancelled", presentationToken: "", cancellable: false });
  finishDraft(false);
  await rendering;
  assert.equal(f.calls.length, 0);
});

test("echter Abschlussdienst verwirft einen verdeckten laufenden Countdown und verlangt danach wieder volle 60 Sekunden", async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "completion-modal-"));
  let service, read, monotonic = 0, workflow = null;
  const calls = [], timers = new Set();
  try {
    const f = await controller({ hasUnsavedDrafts: () => read().uiDrafts,
      requestJson: async (url, request) => {
        calls.push(url);
        if (url.endsWith("/displayed")) return service.acknowledgeCountdown(JSON.parse(request.body));
        if (url.endsWith("/cancel")) return service.cancel(JSON.parse(request.body));
        throw new Error(`Unerwarteter Schreibweg: ${url}`);
      } });
    read = f.scope.SpeciesExplorerDesktopCompletion.createDesktopCompletionPresentation({ documentRef: f.documentRef,
      statusContainer: f.statusContainer, draftProviders: [() => false] });
    const render = (snapshot) => {
      f.statusContainer.dataset = { selectionId: snapshot.selectionId || "", updateRunId: snapshot.updateRunId || "" };
      return f.controller.render(snapshot);
    };
    service = createUpdateCompletionService({ stateRoot: root, deviceId: "device-local", deviceName: "Nikos PC",
      proofReader: { readWorkflow: async () => workflow, read: async () => ({ workflow, proof: { ready: true, proofRevision: "a".repeat(64) } }) },
      clock: { now: () => Date.parse("2026-11-02T18:00:00Z") + monotonic, monotonic: () => monotonic,
        setTimeout: (callback) => { timers.add(callback); return callback; }, clearTimeout: (callback) => timers.delete(callback) },
      readCloseState: async (context) => ({ ...read(context), deviceId: "device-local", known: true, writersActive: false, jobsActive: false,
        pipeline: { status: "idle" }, backup: { status: "idle" }, websiteTransfer: { running: false }, pendingChanges: { hasPendingChanges: false } }),
      prepareClose: async () => { calls.push("close"); }, execute: async () => { calls.push("execute"); } });
    const selection = await service.prepareSelection({ action: "exit-explorer" });
    workflow = { updateRunId: `update-${randomUUID()}`, startedAt: "2026-11-02T18:00:00Z", status: "completed" };
    await service.bindStartedRun({ selectionId: selection.selectionId, updateRunId: workflow.updateRunId });
    f.documentRef.dialogs = [{ id: "pipeline-dialog", contains: () => false }];
    const firstDisplay = await service.evaluate();
    await render(firstDisplay);
    assert.equal((await service.status()).status, "awaiting-display");
    assert.equal(calls.length, 0);
    f.documentRef.dialogs = [];
    await render(await service.status());
    assert.equal((await service.status()).remainingSeconds, 60);
    assert.equal((await f.controller.closeGuardPresentation()).countdownVisible, true);
    monotonic += 24000;
    f.documentRef.dialogs = [{ id: "pipeline-dialog", contains: () => false }];
    assert.equal((await service.evaluate()).status, "blocked");
    monotonic += 120000;
    await render(await service.evaluate());
    assert.equal((await service.status()).status, "awaiting-display");
    assert.equal(calls.length, 1, "Hinter dem Dialog keine neue Bestätigung");
    f.documentRef.dialogs = [];
    const resumed = await service.status();
    assert.notEqual(resumed.presentationToken, firstDisplay.presentationToken);
    await render(resumed);
    assert.equal((await service.status()).remainingSeconds, 60, "Keine Fortsetzung mit nur noch 36 Sekunden");
    monotonic += 59000;
    assert.equal((await service.evaluate()).remainingSeconds, 1);
    assert.equal(calls.includes("execute"), false);
    await f.statusContainer.children[1].listeners.click();
    assert.equal((await service.status()).status, "cancelled");
    monotonic += 120000;
    assert.equal((await service.evaluate()).status, "cancelled");
    assert.equal(calls.includes("close"), false); assert.equal(calls.includes("execute"), false);
  } finally {
    await service?.close();
    assert.equal(timers.size, 0);
    await fs.rm(assertTestTempPath(root), { recursive: true, force: true });
  }
});
