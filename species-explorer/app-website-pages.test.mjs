import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-website-pages.js", import.meta.url), "utf8");
const filterSource = await readFile(new URL("./public/filter.js", import.meta.url), "utf8");
const context = vm.createContext({ URL });
new vm.Script(source).runInContext(context);
new vm.Script(filterSource).runInContext(context);
const api = context.SpeciesExplorerWebsitePages;
const href = (slug, area = "heimische-tierwelt") => `https://www.fnwildlifetravel.de/wildlife/${area}/${slug}`;
const ready = (...slugs) => ({ status: "ready", checkedAt: "2026-10-16T12:00:00.000Z",
  pages: slugs.map((slug) => ({ slug, url: href(slug) })) });
const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

test("FN-Artseite als sichere neue Registerkarte, genauer Slug und belegte mehrere Bereiche", () => {
  const single = api.renderWebsiteStatus("jynxtorquilla", ready("jynxtorquilla"), { escapeHtml });
  assert.match(single, /Auf FN-Website öffnen/);
  assert.match(single, /target="_blank" rel="noopener noreferrer"/);
  const multiple = ready("jynxtorquilla");
  multiple.pages.push({ slug: "jynxtorquilla", url: href("jynxtorquilla", "island") });
  assert.equal(api.pagePresentation("jynxtorquilla", multiple).urls.length, 2);
  assert.match(api.renderWebsiteStatus("jynxtorquilla", multiple, { escapeHtml }), /FN: Island/);
  for (const url of ["javascript:alert(1)", "https://foreign.invalid/wildlife/island/jynxtorquilla",
    href("otherbird"), href("jynxtorquilla") + "?redirect=evil", "https://user@www.fnwildlifetravel.de/wildlife/island/jynxtorquilla"]) {
    assert.equal(api.pagePresentation("jynxtorquilla", { status: "ready", pages: [{ slug: "jynxtorquilla", url }] }).urls.length, 0);
  }
});

test("Fehlende öffentliche Seite bekommt Hinweis; Quellenfehler oder laufende Prüfung bedeuten nicht fehlend", () => {
  assert.equal(api.pagePresentation("newbird", ready("jynxtorquilla")).status, "missing");
  assert.match(api.renderWebsiteHint("newbird", ready(), { escapeHtml }), /automatisch verknüpft/);
  for (const snapshot of [null, { status: "checking", pages: [] }, { status: "unknown", pages: [] },
    { status: "unavailable", pages: [] }]) {
    assert.notEqual(api.pagePresentation("newbird", snapshot).status, "missing");
    assert.equal(api.renderWebsiteHint("newbird", snapshot, { escapeHtml }), "");
  }
  const stale = { ...ready("jynxtorquilla"), status: "unavailable" };
  assert.match(api.renderWebsiteStatus("jynxtorquilla", stale, { escapeHtml }), /Letzter bestätigter Stand/);
  assert.equal(api.pagePresentation("newbird", stale).status, "unknown");
});

test("Website-Filter zählt ausschließlich aktuell bestätigte fehlende Artseiten und erhält andere Filter", () => {
  const entries = ["jynxtorquilla", "newbird"].map((id) => ({ id, germanName: id, iucn: { status: "LC" },
    dataIssues: [], assetIssues: [], inconsistencies: [] }));
  const filter = context.SpeciesExplorerFilters.filterSpecies;
  assert.equal(filter(entries, { flag: "website-missing", websitePagesSnapshot: ready("jynxtorquilla") })[0].id, "newbird");
  assert.equal(filter(entries, { flag: "website-missing", websitePagesSnapshot: { status: "unavailable", pages: [] } }).length, 0);
  assert.equal(filter(entries, { status: "EN", websitePagesSnapshot: ready() }).length, 0);
  assert.equal(filter(entries, { query: "jynx", websitePagesSnapshot: ready() }).length, 1);
});

function fixture(fetchJson) {
  const state = { species: [{ id: "jynxtorquilla" }, { id: "newbird" }], websitePagesSnapshot: null };
  const slot = { dataset: { speciesWebsite: "jynxtorquilla" }, innerHTML: "", contains: () => false };
  const hint = { dataset: { speciesWebsiteHint: "jynxtorquilla" }, innerHTML: "", hidden: true };
  const detail = { querySelector: (selector) => selector === "[data-species-website]" ? slot : hint,
    set innerHTML(_) { throw new Error("Medien-/Detailbereich darf nicht neu aufgebaut werden"); } };
  const elements = { detailPanel: detail, websitePagesSummary: {}, websitePagesCheck: { addEventListener() {} } };
  let changed = 0;
  const timers = [];
  const controller = api.createWebsitePagesController({ state, elements, fetchJson, escapeHtml,
    onChange: () => { changed += 1; }, documentRef: {},
    setTimeoutImpl: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeoutImpl() {} });
  return { state, slot, hint, elements, controller, timers, changed: () => changed };
}

test("Neue Veröffentlichung erscheint nach erneuter Prüfung ohne Linkeingabe oder Medien-Neuaufbau", async () => {
  const calls = [];
  const h = fixture(async (url) => { calls.push(url); return calls.length === 1 ? ready() : ready("jynxtorquilla"); });
  await h.controller.start();
  assert.match(h.slot.innerHTML, /noch nicht/);
  assert.equal(h.hint.hidden, false);
  await h.controller.refresh({ refresh: true });
  assert.match(h.slot.innerHTML, /Auf FN-Website öffnen/);
  assert.equal(h.hint.hidden, true);
  assert.equal(calls[1], "/api/website/species-pages?refresh=1");
  assert.equal(h.timers[0].ms, 300000);
  assert.equal(h.changed(), 2);
  h.controller.stop();
});

test("Späte Antwort aktualisiert die inzwischen ausgewählte Art und liest keine alte Auswahl zurück", async () => {
  let resolve;
  const h = fixture(() => new Promise((done) => { resolve = done; }));
  const pending = h.controller.refresh();
  h.slot.dataset.speciesWebsite = "newbird";
  h.hint.dataset.speciesWebsiteHint = "newbird";
  resolve(ready("jynxtorquilla"));
  await pending;
  assert.doesNotMatch(h.slot.innerHTML, /href=/);
  assert.match(h.slot.innerHTML, /noch nicht/);
});

test("Verbindungs- und Antwortfehler behalten alte Links; Doppelanforderung wird zusammengefasst", async () => {
  let resolve, count = 0;
  const h = fixture(() => { count += 1; return new Promise((done) => { resolve = done; }); });
  h.state.websitePagesSnapshot = ready("jynxtorquilla");
  const a = h.controller.refresh(), b = h.controller.refresh({ refresh: true });
  resolve({ invalid: true });
  await Promise.all([a, b]);
  assert.equal(count, 1);
  assert.equal(h.state.websitePagesSnapshot.status, "unavailable");
  assert.match(h.slot.innerHTML, /Auf FN-Website öffnen/);
  assert.match(h.slot.innerHTML, /Letzter bestätigter Stand/);
});

test("Nicht verfügbare Websiteantwort erhält bestätigte Links bis zu einer neuen vollständigen Seitenliste", async () => {
  let snapshot = { status: "unavailable", pages: [] };
  const h = fixture(async () => snapshot);
  h.state.websitePagesSnapshot = ready("jynxtorquilla");
  await h.controller.refresh({ refresh: true });
  assert.match(h.slot.innerHTML, /Auf FN-Website öffnen/);
  assert.match(h.slot.innerHTML, /Letzter bestätigter Stand/);
  assert.equal(api.pagePresentation("newbird", h.state.websitePagesSnapshot).status, "unknown");
  assert.equal(h.state.websitePagesSnapshot.checkedAt, "2026-10-16T12:00:00.000Z");
  snapshot = { ...ready("jynxtorquilla"), status: "unavailable" };
  await h.controller.refresh();
  assert.equal(h.state.websitePagesSnapshot.pages.length, 1, "Wiederholte Fehlerstände verdoppeln keine bekannten Links");
  snapshot = ready();
  await h.controller.refresh({ refresh: true });
  assert.equal(api.pagePresentation("jynxtorquilla", h.state.websitePagesSnapshot).status, "missing");
  assert.doesNotMatch(h.slot.innerHTML, /href=/);
});
