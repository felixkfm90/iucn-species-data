import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

class Element {
  constructor(tag = "div") { this.tagName = tag.toUpperCase(); this.children = []; this.listeners = new Map(); this.text = ""; this.disabled = false; this.hidden = false; this.open = false; }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(""); }
  set innerHTML(_) { throw new Error("Offline dialog must use safe DOM nodes"); }
  set value(value) { this.selectedValue = value; }
  get value() { return this.selectedValue ?? (this.tagName === "SELECT" ? this.children[0]?.value ?? "" : ""); }
  setAttribute(name, value) { this[name] = value; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.text = ""; this.children = [...children]; }
  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) || []), listener]); }
  querySelector(selector) { return nodes(this).find(node => node.className === selector.slice(1)); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  remove() { this.removed = true; }
  async emit(type, event = {}) { if (this.disabled) return; for (const listener of this.listeners.get(type) || []) await listener({ preventDefault() {}, ...event }); }
}
const nodes = root => root.children.flatMap(child => [child, ...nodes(child)]);
const source = await readFile(new URL("./public/app-species-offline.js", import.meta.url), "utf8");
const context = vm.createContext({}); new vm.Script(source).runInContext(context);
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };
function fixture(options = {}) {
  const detail = new Element(), open = new Element("button"); open.className = "species-offline-open"; detail.append(open);
  const state = { workspace: "shared-project", workspaceEpoch: 2, selectedId: "fixture-owl", editMode: false,
    workspaceStatus: { sourceScope: "scope", connection: "online", user: { id: "owner", role: "reader" }, permissions: { canRead: true } } };
  const species = { id: "fixture-owl", source: "shared-project", sourceScope: "scope", revision: "revision", editRevision: "stamp" };
  const calls = [], files = [{ slot: "portrait.webp", label: "Artporträt", bytes: 2000, localAvailable: false },
    { slot: "sound.mp3", label: "Tonaufnahme", bytes: 4096, localAvailable: true }];
  const controller = context.SpeciesExplorerNormalOffline.createSpeciesOfflineController({ state, detailPanel: detail, species,
    documentRef: { createElement: tag => new Element(tag) }, async fetchJson(url, request) {
      const call = { url, body: JSON.parse(request.body) }; calls.push(call);
      if (options.request) { const result = await options.request(call); if (result !== undefined) return result; }
      if (url.endsWith("/preview")) return { sourceScope: "scope", revision: "revision", editRevision: "stamp", files: structuredClone(files),
        downloadAvailable: state.workspaceStatus.connection === "online", hasPendingChanges: false, externalPublication: "not-performed" };
      return { complete: true, completed: [{ slot: "portrait.webp", bytes: 2000 }], stopped: null, externalPublication: "not-performed" };
    } });
  return { state, species, calls, files, controller, detail, open, get dialog() { return nodes(detail).find(node => node.tagName === "DIALOG"); },
    button: text => nodes(detail).find(node => node.tagName === "BUTTON" && node.textContent === text),
    async click(button) { await button.emit("click"); await settle(); } };
}

test("offline selection is available in normal read mode and opens without triggering any download", async () => {
  const f = fixture(); assert.equal(f.open.disabled, false); await f.click(f.open);
  assert.equal(f.dialog.open, true); assert.equal(f.calls.length, 1); assert.ok(f.calls[0].url.endsWith("/preview"));
  assert.match(f.dialog.textContent, /Artporträt · 2 KB/); assert.match(f.dialog.textContent, /Tonaufnahme · 4 KB · Bereits offline verfügbar/);
  assert.doesNotMatch(f.dialog.textContent, /sha256|schemaVersion|normal-|PRIVATE|project-cache/);
  assert.equal(f.button("Auswahl herunterladen").disabled, false);
});

test("only selected files download and a confirmed completion requires a new preview before another attempt", async () => {
  const f = fixture(); await f.click(f.open); await f.click(f.button("Auswahl herunterladen"));
  assert.deepEqual(f.calls[1].body, { sourceScope: "scope", expectedRevision: "revision", expectedEditRevision: "stamp", slots: ["portrait.webp"] });
  assert.match(f.dialog.textContent, /1 Artdatei ist vollständig offline gespeichert/);
  assert.equal(f.button("Auswahl herunterladen").disabled, true); assert.equal(f.calls.length, 2);
});

test("checkbox changes update size and an empty selection cannot download", async () => {
  const f = fixture(); await f.click(f.open);
  const inputs = nodes(f.dialog).filter(node => node.tagName === "INPUT");
  inputs[0].checked = false; await inputs[0].emit("change"); assert.equal(f.button("Auswahl herunterladen").disabled, true);
  inputs[1].checked = true; await inputs[1].emit("change"); assert.match(f.dialog.textContent, /1 ausgewählt · 4 KB/);
});

test("offline mode shows the selection and disables new downloads", async () => {
  const f = fixture(); f.state.workspaceStatus.connection = "offline"; await f.click(f.open);
  assert.match(f.dialog.textContent, /Neue Downloads benötigen eine Verbindung/); assert.equal(f.button("Auswahl herunterladen").disabled, true);
  assert.equal(f.open.disabled, false);
});

test("losing the connection after opening also disables download while preserving the visible selection", async () => {
  const f = fixture(); await f.click(f.open); assert.equal(f.button("Auswahl herunterladen").disabled, false);
  f.state.workspaceStatus.connection = "offline"; f.controller.stateChanged();
  assert.equal(f.dialog.open, true); assert.equal(f.button("Auswahl herunterladen").disabled, true);
  await f.click(f.button("Auswahl herunterladen")); assert.equal(f.calls.length, 1);
  f.state.workspaceStatus.connection = "online"; f.controller.stateChanged();
  assert.equal(f.button("Auswahl herunterladen").disabled, false); assert.equal(f.calls.length, 1);
});

test("a late preview after changing project or role cannot reopen the old selection", async () => {
  const gate = deferred(), f = fixture({ request: () => gate.promise });
  await f.click(f.open); f.state.workspaceStatus.user.role = "contributor"; f.controller.stateChanged();
  gate.resolve({ sourceScope: "scope", revision: "revision", editRevision: "stamp", files: [], downloadAvailable: true, externalPublication: "not-performed" }); await settle();
  assert.equal(f.dialog.open, false); assert.equal(f.open.hidden, true); assert.equal(f.button("Auswahl herunterladen").disabled, true);
});

test("uncertain or contradictory download answers do not claim local success or retry", async () => {
  const f = fixture({ request: call => call.url.endsWith("/download") ? { complete: true, completed: [], stopped: null, externalPublication: "not-performed" } : undefined });
  await f.click(f.open); await f.click(f.button("Auswahl herunterladen"));
  assert.match(f.dialog.textContent, /nicht eindeutig bestätigt/); assert.equal(f.calls.length, 2); assert.equal(f.button("Auswahl herunterladen").disabled, true);
});

test("partial completion preserves confirmed files, shows the remaining work and never repeats", async () => {
  const f = fixture({ request: call => call.url.endsWith("/download") ? { complete: false, completed: [], stopped: { slot: "portrait.webp" }, externalPublication: "not-performed" } : undefined });
  await f.click(f.open); await f.click(f.button("Auswahl herunterladen"));
  assert.match(f.dialog.textContent, /Die nächste Datei ist noch offen/); assert.equal(f.calls.length, 2);
});

test("a clear service or space error remains visible without exposing technical codes", async () => {
  const f = fixture({ request: call => call.url.endsWith("/download") ? { complete: false, completed: [],
    stopped: { slot: "portrait.webp", code: "normal_media_server_required", message: "Der Projektdienst unterstützt diese Artdateiablage noch nicht. Er muss zuerst aktualisiert werden." },
    externalPublication: "not-performed" } : undefined });
  await f.click(f.open); await f.click(f.button("Auswahl herunterladen"));
  assert.match(f.dialog.textContent, /Er muss zuerst aktualisiert werden/); assert.doesNotMatch(f.dialog.textContent, /normal_media_server_required/);
});

test("Artvorschlag displays a bound preview and keeps preparing, staging and synchronizing separate", async () => {
  const enrichment = await readFile(new URL("./public/app-species-enrichment.js", import.meta.url), "utf8");
  const browser = vm.createContext({ AbortController }); new vm.Script(enrichment).runInContext(browser);
  const detail = new Element(), open = new Element("button"); open.className = "species-enrichment-open"; detail.append(open);
  const sourceScope = "a".repeat(64), candidateId = "b".repeat(64), targetDataHash = "c".repeat(64);
  const changeId = "11111111-1111-4111-8111-111111111111", currentRevision = "22222222-2222-4222-8222-222222222222";
  const species = { id: "fixture-owl", germanName: "Testkauz", sourceScope, revision: "revision", editRevision: "stamp" };
  const state = { workspace: "shared-project", workspaceEpoch: 1, selectedId: species.id, editMode: false,
    workspaceStatus: { sourceScope, connection: "online", permissions: { canEdit: true } } };
  const calls = []; let reloads = 0;
  const controller = browser.SpeciesExplorerEnrichment.createSpeciesEnrichmentController({ state, species, detailPanel: detail,
    documentRef: { createElement: tag => new Element(tag) }, loadData() { reloads++; }, async fetchJson(url, request) {
      const action = url.split("/").at(-1); calls.push([action, JSON.parse(request.body)]);
      if (action === "status") return { modes: ["missing"], busy: false, pending: null, candidate: null, hasPendingChanges: false };
      if (action === "prepare") return { mode: "missing", complete: true, candidateId, targetDataHash, issues: [],
        changes: [{ field: "generated.Family", before: null, after: "<Strigidae>" },
          { field: "assets.files.map.jpg", before: null, after: { bytes: 2048, mimeType: "image/jpeg" } }] };
      if (action === "stage") return { candidateId, changeId, state: "queued", acceptedRevision: null };
      return { changeId, speciesId: species.id, currentRevision, confirmedFiles: 1, supersededFiles: 0 };
    } });
  const find = (tag, text) => nodes(detail).find(node => node.tagName === tag && (text === undefined || node.textContent === text));
  const click = async element => { await element.emit("click"); await settle(); };
  assert.equal(open.hidden, true);
  state.editMode = true; controller.stateChanged(); await click(open);
  assert.deepEqual(calls, [["status", { sourceScope }]]);
  await click(find("BUTTON", "Vorschlag vorbereiten"));
  assert.deepEqual(calls.at(-1), ["prepare", { sourceScope, mode: "missing", expectedRevision: "revision", expectedEditRevision: "stamp" }]);
  assert.match(find("DIALOG").textContent, /<Strigidae>/);
  const details = find("DETAILS"); details.open = true; await details.emit("toggle");
  assert.match(find("IMG").src, /\/file\/map\.jpg\?scope=/);
  await click(find("BUTTON", "Zur Übernahme vormerken"));
  assert.deepEqual(calls.at(-1), ["stage", { sourceScope, candidateId, targetDataHash }]);
  assert.equal(find("IMG"), undefined);
  await click(find("BUTTON", "Jetzt abgleichen"));
  assert.deepEqual(calls.at(-1), ["sync", { sourceScope, changeId }]);
  assert.match(find("DIALOG").textContent, /1 Artdatei bestätigt/);
  assert.equal(reloads, 0);
  await click(find("BUTTON", "Schließen"));
  assert.equal(reloads, 1);
});
