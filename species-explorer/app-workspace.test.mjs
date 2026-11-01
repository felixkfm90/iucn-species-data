import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

class Node {
  constructor() { this.value = ""; this.textContent = ""; this.hidden = false; this.disabled = false; this.listeners = new Map(); this.classes = new Set();
    this.classList = { toggle: (key, value) => value ? this.classes.add(key) : this.classes.delete(key) }; }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  replaceChildren() { this.children = []; this.textContent = ""; }
  async emit(name) { await this.listeners.get(name)?.(); }
}
async function fixture({ saved = null, dialog = false, readOnly = false, fail = false } = {}) {
  const selectors = ["species-workspace", "species-workspace-status", "species-workspace-refresh", "species-workspace-sync", "new-species-button", "reload-button",
    "validation-data-label", "validation-assets-label", "validation-report-label", "species-count", "asset-issues", "nc-count", "manual-map-count", "validation-details", "validation-overall", "detail-panel", "species-list"];
  const nodes = new Map(selectors.map((id) => [`#${id}`, new Node()])); nodes.set(".validation-grid", new Node());
  const body = new Node(), documentRef = { body, querySelector: (selector) => nodes.get(selector) };
  const state = { workspace: "local", editMode: !readOnly, selectedId: "old", notice: "Old local backup path", dataLoading: false,
    workspaceStatus: { source: "shared-project", connection: "online", pending: 1, conflicts: 0, permissions: { canEdit: true } } };
  const calls = [], savedValues = [], context = {};
  vm.runInNewContext(await fs.readFile(new URL("./public/app-workspace.js", import.meta.url), "utf8"), context);
  const controller = context.SpeciesExplorerWorkspace.setupSpeciesWorkspace({ state, documentRef, hasOpenDialog: () => dialog,
    storage: { getItem: () => saved, setItem: (...args) => savedValues.push(args) },
    fetchJson: async (...args) => { calls.push(args); if (fail) throw new Error("Synthetic offline"); },
    loadData: async () => { calls.push(["load"]); },
  });
  return { controller, state, nodes, body, calls, savedValues };
}
async function settle() { for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve)); }

test("workspace choice is explicit, restores only a recognized local preference and performs no operation by construction", async () => {
  const f = await fixture(); assert.equal(f.state.workspace, "local"); assert.equal(f.calls.length, 0);
  const select = f.nodes.get("#species-workspace"); select.value = "shared-project"; await select.emit("change");
  assert.equal(f.state.workspace, "shared-project"); assert.equal(f.state.selectedId, ""); assert.equal(f.state.notice, "");
  assert.equal(f.calls[0][0], "load"); assert.equal(f.savedValues[0][1], "shared-project");
  assert.equal(f.nodes.get("#new-species-button").hidden, true);
  assert.equal((await fixture({ saved: "shared-project" })).state.workspace, "shared-project");
  assert.equal((await fixture({ saved: "unexpected-server" })).state.workspace, "local");
});

test("an open edit prevents switching source without discarding inputs or queuing a request", async () => {
  const f = await fixture({ dialog: true }); f.nodes.get("#species-workspace").value = "shared-project";
  await f.nodes.get("#species-workspace").emit("change");
  assert.equal(f.state.workspace, "local"); assert.equal(f.nodes.get("#species-workspace").value, "local");
  assert.equal(f.state.notice, "Old local backup path"); assert.deepEqual(f.calls, []);
});

test("reading server state and syncing remain explicit separate protected actions; read mode cannot send changes", async () => {
  const f = await fixture({ saved: "shared-project" });
  await f.nodes.get("#species-workspace-refresh").emit("click"); await settle();
  assert.equal(f.calls[0][0], "/api/shared-project/refresh"); assert.equal(f.calls[0][1].method, "POST");
  await f.nodes.get("#species-workspace-sync").emit("click"); await settle();
  assert.ok(f.calls.some(([url]) => url === "/api/shared-project/sync"));
  assert.equal(f.state.notice, "", "a completed read/sync must not retain the earlier local-draft notice");
  const reader = await fixture({ saved: "shared-project", readOnly: true });
  assert.equal(reader.nodes.get("#species-workspace-sync").disabled, true);
  await reader.nodes.get("#species-workspace-sync").emit("click"); await settle(); assert.equal(reader.calls.length, 0);
});

test("unavailable shared access hides former counters/details and does not silently select the local project", async () => {
  const f = await fixture({ saved: "shared-project" }); f.state.workspaceStatus = { available: false, permissions: {} };
  f.nodes.get("#validation-details").textContent = "Former private species name"; f.controller.render();
  assert.equal(f.state.workspace, "shared-project"); assert.equal(f.nodes.get("#species-count").textContent, "–");
  assert.equal(f.nodes.get(".validation-grid").hidden, true); assert.equal(f.nodes.get("#validation-details").textContent, "");
  assert.equal(f.nodes.get("#species-workspace-sync").disabled, true);
});

test("login changes preserve an open form and request a fresh view after it closes", async () => {
  const f = await fixture({ saved: "shared-project", dialog: true });
  const detail = f.nodes.get("#detail-panel"); detail.textContent = "Unsaved prior-person input";
  detail.querySelector = () => ({ open: true });
  f.controller.projectChanged({ status: { projectId: "new-project", user: { id: "new-person", role: "admin" } }, permissions: { canRead: true, canEdit: true } });
  await settle();
  assert.equal(detail.textContent, "Unsaved prior-person input"); assert.equal(detail.inert, true);
  assert.equal(f.state.workspaceEpoch, 1); assert.equal(f.state.pendingRevisionReload, true);
  assert.equal(f.state.notice, ""); assert.deepEqual(f.calls, []);
});

test("a failed sync preserves the local-draft notice and reports the unresolved connection", async () => {
  const f = await fixture({ saved: "shared-project", fail: true }); f.state.notice = "Local draft preserved";
  await f.nodes.get("#species-workspace-sync").emit("click"); await settle();
  assert.equal(f.state.notice, "Local draft preserved");
  assert.match(f.nodes.get("#species-workspace-status").textContent, /Abgleich nicht bestätigt/);
});

test("switching source immediately removes former actionable detail content while the new read is pending", async () => {
  const f = await fixture(); f.state.species = [{ id: "old-local" }]; f.state.filtered = [...f.state.species];
  f.nodes.get("#detail-panel").textContent = "Old local media editor";
  f.nodes.get("#species-workspace").value = "shared-project";
  await f.nodes.get("#species-workspace").emit("change");
  assert.equal(f.state.species.length, 0); assert.equal(f.state.filtered.length, 0);
  assert.equal(f.nodes.get("#detail-panel").textContent, "Artbestand wird geladen…");
  assert.equal(f.state.workspaceEpoch, 1);
});

test("known shared login changes immediately invalidate the old view once without a refresh loop", async () => {
  const f = await fixture({ saved: "shared-project" });
  const project = { status: { baseUrl: "https://project.example.org", projectId: "project", user: { id: "person-a", role: "admin" } }, permissions: { canRead: true, canEdit: true } };
  f.controller.projectChanged(project); await settle();
  assert.equal(f.state.workspaceEpoch, 1); const before = f.calls.length;
  f.controller.projectChanged(project); await settle(); assert.equal(f.calls.length, before);
  f.state.species = [{ id: "prior-person" }]; f.nodes.get("#detail-panel").textContent = "Prior person data";
  f.controller.projectChanged({ ...project, status: { ...project.status, user: { id: "person-b", role: "reader" } }, permissions: { canRead: true, canEdit: false } });
  await settle(); assert.equal(f.state.workspaceEpoch, 2); assert.equal(f.state.species.length, 0);
  assert.equal(f.nodes.get("#detail-panel").textContent, "Artbestand wird geladen…");
  assert.equal(f.nodes.get("#species-workspace-sync").disabled, true);
});
