import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

function element() {
  return { children: [], textContent: "", hidden: false, disabled: false, isConnected: true, value: "", listeners: {},
    append(...items) { this.children.push(...items); }, setAttribute() {}, getClientRects() { return [1]; },
    addEventListener(name, callback) { this.listeners[name] = callback; } };
}
async function controller(options = {}) {
  const documentRef = { visibilityState: "visible", createElement: () => element() };
  const scope = { console };
  vm.runInNewContext(await fs.readFile(new URL("../public/app-update-completion.js", import.meta.url), "utf8"), scope);
  const selectionContainer = element(), statusContainer = element(), calls = [];
  const deps = { documentRef, selectionContainer, statusContainer, device: { id: "device-local", name: "Nikos PC" },
    hasUnsavedDrafts: () => false,
    requestJson: async (url, request) => { calls.push([url, JSON.parse(request.body)]); return { deviceId: "device-local", action: "restart", status: "countdown", remainingSeconds: 60, cancellable: true }; }, ...options };
  return { controller: scope.SpeciesExplorerUpdateCompletion.createUpdateCompletionController(deps), documentRef, selectionContainer, statusContainer, calls };
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
