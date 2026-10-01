import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await fs.readFile(new URL("./public/app-taxonomy-identity.js", import.meta.url), "utf8");
const context = vm.createContext({});
new vm.Script(source).runInContext(context);
const ui = context.SpeciesExplorerTaxonomyIdentity;
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const taxon = { masterTaxonId: `mtx_${"a".repeat(32)}`, scientificName: "Testus alpha", germanName: "Beispielart",
  kingdom: "Animalia", projects: [], evidence: [{ provider: "catalogue-of-life", providerVersion: "2026", providerRecordId: "A" }] };

function element() {
  const listeners = {};
  return { value: "", checked: false, disabled: false, hidden: false, innerHTML: "", textContent: "", dataset: {},
    addEventListener: (type, callback) => { listeners[type] = callback; },
    emit: (type, data) => listeners[type]?.(data) };
}

function fixture(fetchOverride) {
  const nodes = new Map();
  const get = (key) => { if (!nodes.has(key)) nodes.set(key, element()); return nodes.get(key); };
  const dialog = element();
  dialog.querySelector = (selector) => get(selector === "form" ? "form" : /data-identity="([^"]+)"/.exec(selector)[1]);
  dialog.querySelectorAll = () => [...nodes.values()];
  let dialogOptions;
  const calls = [];
  const fetchJson = async (url, options) => {
    const payload = JSON.parse(options.body);
    calls.push({ url, payload });
    if (fetchOverride) return fetchOverride(url, payload);
    if (url.endsWith("browse")) return payload.mode === "search" ? { results: [taxon] } : { available: true, cases: [], activeVersion: "one", candidateVersion: "two" };
    if (url.endsWith("preview")) return { type: "continuation", sources: [taxon], targetDetails: [taxon], token: "checked", reason: "Beleg" };
    return { message: "Vorgemerkt" };
  };
  const controller = ui.createIdentityController({ dialog, openButton: element(), fetchJson, escapeHtml,
    createDialogController: (options) => { dialogOptions = options; return { open: () => options.afterOpen() }; } });
  controller.setup();
  const click = (dataset) => dialog.emit("click", { target: { closest: () => ({ dataset }) } });
  return { controller, dialog, get, calls, click, close: () => dialogOptions.afterClose() };
}

test("Fallkarten erklären Beziehungen ohne Namensheuristik und maskieren fremde Inhalte", () => {
  const card = ui.taxonCard({ ...taxon, germanName: '<img src=x onerror="bad()">' }, escapeHtml);
  assert.ok(card.includes("&lt;img"));
  assert.ok(!card.includes("<img"));
  assert.ok(card.includes("Catalogue of Life · 2026 · A"));
  assert.equal(ui.previewPresentation({ type: "split", sources: [{ ...taxon, projects: [{}] }] }).blocked, true);
  assert.equal(ui.previewPresentation({ type: "continuation", sources: [{ ...taxon, projects: [{}] }] }).blocked, false);
});

test("Öffnen prüft nur Projektfälle; Speichern verlangt Vorschau und bewusste Bestätigung", async () => {
  const f = fixture();
  f.controller.open();
  await new Promise(setImmediate);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].payload.mode, "projects");
  await f.controller.search("active");
  assert.equal(f.calls.length, 1);
  f.get("active-query").value = "Beispiel";
  await f.controller.search("active");
  f.click({ identityAdd: "active", index: "0" });
  f.get("staging-query").value = "Beispiel";
  await f.controller.search("staging");
  f.click({ identityAdd: "staging", index: "0" });
  f.get("type").value = "continuation";
  f.get("reason").value = "Beleg";
  await f.controller.act("save");
  assert.equal(f.calls.some((call) => call.url.endsWith("/save")), false);
  await f.controller.act("preview");
  assert.equal(f.get("save").disabled, true);
  f.get("ack").checked = true;
  f.dialog.emit("change", { target: f.get("ack") });
  assert.equal(f.get("save").disabled, false);
  f.get("type").value = "split";
  f.dialog.emit("change", { target: f.get("type") });
  assert.equal(f.get("save").disabled, true);
  assert.equal(f.get("ack").checked, false);
  f.get("type").value = "continuation";
  await f.controller.act("preview");
  f.get("ack").checked = true;
  await f.controller.act("save");
  const saved = f.calls.find((call) => call.url.endsWith("/save"));
  assert.equal(saved.payload.token, "checked");
  assert.equal(saved.payload.confirmed, true);
  assert.equal(f.get("save").disabled, true);
  assert.equal(f.calls.some((call) => /activate|build|catalog/.test(call.url)), false);
});

test("Späte Suchantworten nach Eingabeänderung oder Schließen werden nicht angezeigt", async () => {
  let finish;
  const f = fixture(() => new Promise((resolve) => { finish = resolve; }));
  f.get("active-query").value = "Beispiel";
  const first = f.controller.search("active");
  f.get("active-query").value = "Neu";
  f.dialog.emit("input", { target: f.get("active-query") });
  finish({ results: [taxon] });
  await first;
  assert.equal(f.get("active-results").innerHTML, "");
  const second = f.controller.search("active");
  f.close();
  finish({ results: [taxon] });
  await second;
  assert.equal(f.get("active-results").innerHTML, "");
  assert.equal(f.calls.some((call) => call.url.endsWith("save")), false);
});

test("Fallansicht ist im echten Explorer geladen und besitzt sichere Aktionen ohne automatisch gestartete Suche", async () => {
  const html = await fs.readFile(new URL("./public/index.html", import.meta.url), "utf8");
  const app = await fs.readFile(new URL("./public/app.js", import.meta.url), "utf8");
  assert.match(html, /src="\/app-taxonomy-identity.js" defer/);
  assert.match(app, /explorerTaxonomyIdentity.setupIdentityController\(/);
  assert.match(html, /data-identity-close>Später entscheiden/);
  assert.match(html, /data-identity="save" disabled/);
  assert.match(html, /data-identity="discard-confirm">Verwerfen bestätigen/);
});

test("technische Reparaturhistorie besitzt verständlichen Titel und keine neue manuelle Fallauswahl", async () => {
  const f = fixture(() => ({ available: true, cases: [], review: { events: [{ type: "source-repair",
    sources: [taxon], targets: [taxon], reason: "Beleg <prüfen>" }] } }));
  f.controller.open();
  await new Promise(setImmediate);
  assert.match(f.get("pending-list").innerHTML, /Quellendaten repariert – ursprüngliche Art-ID wiederhergestellt/);
  assert.match(f.get("pending-list").innerHTML, /Beleg &lt;prüfen&gt;/);
  assert.doesNotMatch(f.get("pending-list").innerHTML, /undefined/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].payload.mode, "projects");
  const html = await fs.readFile(new URL("./public/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /<option[^>]+value="source-repair"/);
});

test("Verwerfen braucht einen zweiten Klick und Abbrechen schreibt nichts", async () => {
  const f = fixture((url) => {
    if (url.endsWith("browse")) return { cases: [], review: { events: [], truncated: false } };
    if (url.endsWith("discard-preview")) return { token: "rollback-token", count: 1, message: "Fotos bleiben unverändert" };
    return { discarded: true };
  });
  f.controller.open();
  await new Promise(setImmediate);
  f.get("discard").emit("click");
  await new Promise(setImmediate);
  assert.equal(f.calls.some((call) => call.url.endsWith("/discard")), false);
  f.get("discard-cancel").emit("click");
  assert.equal(f.get("discard-preview").hidden, true);
  assert.equal(f.calls.some((call) => call.url.endsWith("/discard")), false);
  f.get("discard").emit("click");
  await new Promise(setImmediate);
  await f.get("discard-confirm").onclick();
  const discarded = f.calls.find((call) => call.url.endsWith("/discard"));
  assert.equal(discarded.payload.token, "rollback-token");
  assert.equal(discarded.payload.confirmed, true);
});

test("Projekt-Split braucht Zielwahl, Namensregel und danach eine erneute bestätigte Vorschau", async () => {
  const project = { projectTaxonKey: "project", projectSlug: "alte-url", scientificNameAtLink: "Testus alpha" };
  const old = { ...taxon, projects: [project] };
  const target = { ...taxon, masterTaxonId: `mtx_${"b".repeat(32)}`, scientificName: "Testus beta" };
  const f = fixture((url, payload) => {
    if (url.endsWith("browse")) return payload.mode === "search" ? { results: [payload.slot === "active" ? old : target] } : { cases: [] };
    if (url.endsWith("preview")) return { type: "split", sources: [old], targetDetails: [target], token: "checked-project",
      projectAssignments: payload.projectAssignments, projectEffects: [], reason: "Beleg" };
    return { message: "Vorgemerkt" };
  });
  for (const slot of ["active", "staging"]) {
    f.get(`${slot}-query`).value = "Testus";
    await f.controller.search(slot);
    f.click({ identityAdd: slot, index: "0" });
  }
  f.get("type").value = "split";
  await f.controller.act("preview");
  f.get("ack").checked = true;
  f.dialog.emit("change", { target: f.get("ack") });
  assert.equal(f.get("save").disabled, true);
  f.dialog.emit("change", { target: { dataset: { projectTarget: "project" }, value: target.masterTaxonId } });
  f.dialog.emit("change", { target: { checked: true, hasAttribute: (name) => name === "data-project-names" } });
  assert.equal(f.get("save").disabled, true);
  await f.controller.act("preview");
  f.get("ack").checked = true;
  f.dialog.emit("change", { target: f.get("ack") });
  assert.equal(f.get("save").disabled, false);
  await f.controller.act("save");
  const saved = f.calls.find((call) => call.url.endsWith("/save"));
  assert.deepEqual(saved.payload.projectAssignments, [{ projectTaxonKey: "project", targetId: target.masterTaxonId, namePolicy: "keep-project-local" }]);
  assert.equal(saved.payload.token, "checked-project");
});
