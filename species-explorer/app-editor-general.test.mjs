import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

class Node {
  constructor() { this.listeners = new Map(); this.children = []; this.disabled = false; this.hidden = false; this.dataset = {}; }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  async emit(name) { await this.listeners.get(name)?.({ preventDefault() {} }); }
  replaceChildren() { this.children = []; }
  append(value) { this.children.push(value); }
  setAttribute() {}
}
async function fixture({ shared = false, fetchJson } = {}) {
  const document = { createElement: () => new Node() }, context = { document, FormData: class {} };
  vm.runInNewContext(await fs.readFile(new URL("./public/app-editor-general.js", import.meta.url), "utf8"), context);
  const nodes = Object.fromEntries(["form", "preview", "previewRows", "message", "previewButton", "saveButton", "scientificNameInput", "scientificNameUnlockButton"].map((key) => [key, new Node()]));
  nodes.form.elements = {};
  const input = new Node(); nodes.form.querySelectorAll = () => [input];
  const state = { workspace: shared ? "shared-project" : "local" }, calls = [];
  const values = { germanName: "Testkauz", englishName: "Synthetic owl", scientificName: "Strix fixture", size: "20 cm", weight: "400 g", lifeExpectancy: "10 Jahre" };
  const species = { id: "fixture-owl", scientificName: values.scientificName, ...(shared ? { source: "shared-project", sourceScope: "project-person", editRevision: "displayed" } : {}) };
  let closed = 0, reloaded = 0, confirmations = 0;
  const controller = context.SpeciesExplorerGeneralEditor.createGeneralEditorController({
    ...nodes, species, state, closeButtons: [new Node()],
    createMessageSetter: (node) => (text) => { node.textContent = text; },
    createFieldFeedbackController: () => ({ clearFieldErrors() {}, applyFieldErrors() {}, updateMeasurementMode() {} }),
    createEditorFormModel: () => ({ editableValues: () => ({ ...values }), validateEditableFields: () => ({}) }),
    fetchJson: async (url, options) => { calls.push([url, JSON.parse(options.body)]); return fetchJson(url, options); },
    escapeHtml: (value) => String(value), backupRetentionText: () => "Backups preserved.",
    showQuickConfirm: async () => { confirmations++; return true; },
    closeEditDialog: () => { assert.equal(input.disabled, false, "a successful save must release its own busy barrier before regular close"); closed++; }, loadData: async () => { reloaded++; },
  });
  return { ...nodes, input, state, values, calls, controller, stats: () => ({ closed, reloaded, confirmations }) };
}
const preview = { token: "reviewed", changes: [{ field: "Größe", before: "19 cm", after: "20 cm" }] };

test("normal shared form binds the shown scope/revision and queues through the shared route without local backup claims", async () => {
  const f = await fixture({ shared: true, fetchJson: async (url) => url.endsWith("/preview") ? preview : { queued: true, species: { id: "fixture-owl" } } });
  await f.form.emit("submit");
  assert.equal(f.calls[0][0], "/api/shared-project/species/fixture-owl/preview");
  assert.equal(f.calls[0][1].sourceScope, "project-person"); assert.equal(f.calls[0][1].expectedEditRevision, "displayed");
  await f.saveButton.emit("click");
  assert.equal(f.calls[1][0], "/api/shared-project/species/fixture-owl/save");
  assert.deepEqual(f.calls[1][1], { token: "reviewed" });
  assert.match(f.state.notice, /Lokal vorgemerkt/); assert.doesNotMatch(f.state.notice, /undefined|Sicherung:/);
  assert.deepEqual(f.stats(), { closed: 1, reloaded: 1, confirmations: 0 });
  await f.scientificNameUnlockButton.emit("click"); assert.equal(f.stats().confirmations, 0);
});

test("local basic-data editor retains its original preview/save and backup flow", async () => {
  const f = await fixture({ fetchJson: async (url) => url.endsWith("/preview") ? preview : { backup: "own-backup", species: { id: "fixture-owl" } } });
  await f.form.emit("submit"); await f.saveButton.emit("click");
  assert.equal(f.calls[0][0], "/api/species/fixture-owl/preview"); assert.equal(f.calls[1][0], "/api/species/fixture-owl/save");
  assert.equal(f.calls[0][1].sourceScope, undefined); assert.match(f.state.notice, /Sicherung: own-backup/);
});

test("an input change while preview is pending cannot reactivate a stale save token", async () => {
  let release;
  const f = await fixture({ shared: true, fetchJson: () => new Promise((resolve) => { release = resolve; }) });
  const pending = f.form.emit("submit"); f.values.size = "21 cm"; f.controller.handleInput(); release(preview); await pending;
  assert.equal(f.saveButton.disabled, true); assert.equal(f.preview.hidden, true);
  assert.match(f.message.textContent, /während der Prüfung geändert/);
  await f.saveButton.emit("click"); assert.equal(f.calls.length, 1);
});

test("switching workspaces prevents both stale previews and stale save requests", async () => {
  const f = await fixture({ shared: true, fetchJson: async () => preview });
  f.state.workspace = "local"; await f.form.emit("submit"); assert.equal(f.calls.length, 0);
  f.state.workspace = "shared-project"; await f.form.emit("submit"); assert.equal(f.calls.length, 1);
  f.state.workspace = "local"; await f.saveButton.emit("click"); assert.equal(f.calls.length, 1);
  assert.match(f.message.textContent, /Artbestand wurde gewechselt/);
});

test("a late save acknowledgement preserves newer inputs instead of closing and reloading the form", async () => {
  let release;
  const f = await fixture({ shared: true, fetchJson: async (url) => url.endsWith("/preview") ? preview : new Promise((resolve) => { release = resolve; }) });
  await f.form.emit("submit"); const saving = f.saveButton.emit("click");
  f.values.size = "21 cm"; f.controller.handleInput();
  release({ queued: true, species: { id: "fixture-owl", sourceScope: "project-person", editRevision: "new-local-revision" } }); await saving;
  assert.equal(f.stats().closed, 0); assert.equal(f.stats().reloaded, 0); assert.equal(f.values.size, "21 cm");
  assert.equal(f.saveButton.disabled, true); assert.match(f.message.textContent, /neue Eingabe bleibt/);
});

test("a save acknowledgement cannot close or overwrite state belonging to a newer workspace", async () => {
  let release;
  const f = await fixture({ shared: true, fetchJson: async (url) => url.endsWith("/preview") ? preview : new Promise((resolve) => { release = resolve; }) });
  await f.form.emit("submit"); const saving = f.saveButton.emit("click");
  f.state.workspace = "local"; f.state.notice = "New local workspace"; f.state.selectedId = "local-owl";
  release({ queued: true, species: { id: "fixture-owl" } }); await saving;
  assert.equal(f.state.notice, "New local workspace"); assert.equal(f.state.selectedId, "local-owl");
  assert.equal(f.stats().closed, 0); assert.equal(f.stats().reloaded, 0);
});

test("busy general edits temporarily lock fields and restore their previous state", async () => {
  let release;
  const f = await fixture({ shared: true, fetchJson: () => new Promise((resolve) => { release = resolve; }) });
  const pending = f.form.emit("submit"); assert.equal(f.input.disabled, true); assert.equal(f.controller.isBusy(), true);
  release(preview); await pending; assert.equal(f.input.disabled, false); assert.equal(f.controller.isBusy(), false);
});
