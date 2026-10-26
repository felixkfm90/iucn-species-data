import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-dashboard.js", import.meta.url), "utf8");
const stylesheet = await readFile(new URL("./public/app.css", import.meta.url), "utf8");
const context = vm.createContext({ URL });
new vm.Script(await readFile(new URL("./public/app-website-pages.js", import.meta.url), "utf8")).runInContext(context);
new vm.Script(await readFile(new URL("./public/filter.js", import.meta.url), "utf8")).runInContext(context);
new vm.Script(await readFile(new URL("./public/app-taxonomy-progress.js", import.meta.url), "utf8")).runInContext(context);
new vm.Script(source, { filename: "app-dashboard.js" }).runInContext(context);
const dashboard = context.SpeciesExplorerDashboard;

function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatIucnStatus(status) {
  return ({ LC: "Nicht gefährdet (LC)", EN: "Stark gefährdet (EN)", VU: "Gefährdet (VU)" })[status] || status;
}

function validationFixture(overrides = {}) {
  return {
    status: "ok",
    issueCount: 0,
    data: {
      inputCount: 2,
      generatedCount: 2,
      issueSpeciesCount: 0,
      inputOnlyCount: 0,
      generatedOnlyCount: 0,
      mismatchSpeciesCount: 0,
    },
    assets: {
      issueSpeciesCount: 0,
      completeSpeciesCount: 2,
      available: { maps: 2, sounds: 2, credits: 2, spectrograms: 2, portraits: 2 },
    },
    report: {
      consistent: true,
      issueCount: 0,
      checks: [{ label: "Karten", ok: true, missingFromReport: [], staleInReport: [] }],
      counterIssues: [],
    },
    special: {
      manualMapCount: 1,
      ncSoundCount: 1,
      missingPortraitCount: 0,
      missingSoundKnownCount: 0,
      manualSoundCount: 0,
    },
    ...overrides,
  };
}

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  toggle(name, enabled) {
    if (enabled) this.values.add(name);
    else this.values.delete(name);
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName;
    this.textContent = "";
    this.innerHTML = "";
    this.hidden = false;
    this.value = "";
    this.scrollTop = 0;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.nodes = new Map();
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  append(...children) {
    this.children.push(...children);
  }

  add(option) {
    this.children.push(option);
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  emit(type) {
    this.listeners.get(type)?.({ target: this });
  }

  querySelector(selector) {
    return this.nodes.get(selector) || null;
  }

  contains(element) { return this.children.includes(element); }
  focus() { this.focused = true; }
}

function createSpeciesItem() {
  const item = new FakeElement("button");
  item.nodes.set("strong", new FakeElement("strong"));
  item.nodes.set("em", new FakeElement("em"));
  item.nodes.set(".species-item-flags", new FakeElement("span"));
  return item;
}

function createElements() {
  const elements = Object.fromEntries([
    "speciesCount",
    "assetIssues",
    "ncCount",
    "manualMapCount",
    "reportDate",
    "pipelineMenuButton",
    "pipelineStatus",
    "validationOverall",
    "validationDataCard",
    "validationData",
    "validationDataDetail",
    "validationAssetsCard",
    "validationAssets",
    "validationAssetsDetail",
    "validationReportCard",
    "validationReport",
    "validationReportDetail",
    "validationSpecial",
    "validationDetails",
    "search",
    "statusFilter",
    "flagFilter",
    "visibleCount",
    "speciesList",
  ].map((name) => [name, new FakeElement()]));
  elements.itemTemplate = {
    content: {
      firstElementChild: {
        cloneNode: () => createSpeciesItem(),
      },
    },
  };
  return elements;
}

class FakeOption {
  constructor(label, value) {
    this.textContent = label;
    this.value = value;
  }
}

function createController({ state, elements, filterSpecies, onSpeciesSelect = () => {}, documentRef }) {
  return dashboard.createDashboardController({
    state,
    elements,
    formatDate: (value) => `Datum ${value}`,
    formatIucnStatus,
    pluralize,
    escapeHtml: (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;"),
    iucnStatusIconUrl: (status) => status ? `/status/${status}.png` : "",
    iucnTrendIconUrl: (trend) => trend ? `/trend/${trend}.png` : "",
    filterSpecies,
    resolveDatabaseStatus: () => {
      state.renderDatabaseStatusCalls = (state.renderDatabaseStatusCalls || 0) + 1;
      return "needs-update";
    },
    databaseStatusLabel: (status) => status,
    onSpeciesSelect,
    documentRef: documentRef || { createElement: (tagName) => new FakeElement(tagName) },
    OptionConstructor: FakeOption,
  });
}

test("Kopf zeigt denselben Taxonomiefortschritt ohne geöffneten Dialog und behält andere Aufgaben sichtbar", () => {
  const state = { taxonomyMasterSnapshot: { status: "building", active: true, progressPhase: "Masterdatenbank schreiben",
    progressCurrent: 250, progressTotal: 1000, progressPercent: 74 } };
  const elements = createElements();
  const controller = createController({ state, elements, filterSpecies: () => [] });
  controller.renderDatabaseStatus();
  const expected = context.SpeciesExplorerTaxonomyProgress.taxonomyProgressPresentation({ master: state.taxonomyMasterSnapshot });
  assert.equal(elements.pipelineStatus.textContent, expected.compact);
  assert.equal(elements.pipelineStatus.textContent, "Datenbank-Update\n3/7 Master aufbauen · 25 %");
  assert.equal(elements.pipelineStatus.innerHTML, "", "Beschriftung bleibt reiner Text, kein neues HTML");
  assert.equal(elements.pipelineMenuButton.title, expected.detail);
  assert.match(elements.pipelineMenuButton.attributes["aria-label"], /25 % dieses Teilschritts/);
  state.taxonomyMasterSnapshot = { status: "idle", buildJob: { available: true, status: "paused",
    progress: { phase: "Masterdatenbank schreiben" } } };
  controller.renderDatabaseStatus();
  assert.match(elements.pipelineStatus.textContent, /pausiert/);
  assert.match(elements.pipelineMenuButton.className, /review/);
  state.taxonomyMasterSnapshot = { status: "completed", lightroomPackage: { status: "current" } };
  state.pipelineStatusSnapshot = { status: "awaiting-review" };
  controller.renderDatabaseStatus();
  assert.equal(elements.pipelineStatus.textContent, "needs-update", "Abgeschlossene Taxonomie verdeckt keine Assetprüfung");
  assert.equal(elements.pipelineMenuButton.title, "Datenbank-Aktionen öffnen");
});

test("Nur die obere Datenbankbeschriftung erhält einen sichtbaren Zeilenumbruch ohne feste Höhe", () => {
  const rule = stylesheet.match(/\.database-status \.pipeline-status-text\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule, "Eigene, auf die Kopfschaltfläche begrenzte Darstellungsregel");
  assert.match(rule, /display:\s*block;/);
  assert.match(rule, /white-space:\s*pre-line;/);
  assert.match(rule, /line-height:\s*1\.3;/);
  assert.doesNotMatch(rule, /(?:^|;)\s*(?:height|max-height|overflow):/);
});

test("Kopf zeigt offene Updatebestätigung ohne erfundenen Teilschritt und danach wieder den aktuellen Bestand", () => {
  const state = { taxonomyDatabaseBusy: true, taxonomyDatabasePreparation: "confirmation",
    taxonomyMasterSnapshot: { status: "completed", lightroomPackage: { status: "current" } } };
  const elements = createElements();
  const controller = createController({ state, elements, filterSpecies: () => [] });
  controller.renderDatabaseStatus();
  assert.equal(elements.pipelineStatus.textContent, "Datenbank-Update\nBestätigung ausstehend");
  assert.doesNotMatch(elements.pipelineMenuButton.title, /Schritt \d+|Quellen vorbereiten/);
  assert.match(elements.pipelineMenuButton.attributes["aria-label"], /noch keine neue Aktualisierung gestartet/);
  state.taxonomyDatabaseBusy = false;
  state.taxonomyDatabasePreparation = "";
  controller.renderDatabaseStatus();
  assert.equal(elements.pipelineStatus.textContent, "Datenbank-Update\nAbgeschlossen");
});

test("Validierungspräsentation beschreibt einen konsistenten Bestand", () => {
  const result = dashboard.createValidationPresentation(validationFixture(), { pluralize });

  assert.equal(result.isOk, true);
  assert.equal(result.overallText, "Alle Prüfungen bestanden");
  assert.equal(result.data.value, "2 / 2");
  assert.equal(result.assets.value, "2 vollständig");
  assert.equal(result.report.value, "Konsistent");
  assert.equal(result.specialText, "1 Karten · 1 NC");
  assert.deepEqual([...result.detailItems], []);
});

test("Validierungspräsentation trennt Daten-, Asset-, Sound- und Reporthinweise", () => {
  const result = dashboard.createValidationPresentation(validationFixture({
    status: "issues",
    issueCount: 4,
    data: {
      inputCount: 3,
      generatedCount: 2,
      issueSpeciesCount: 1,
      inputOnlyCount: 1,
      generatedOnlyCount: 0,
      mismatchSpeciesCount: 0,
    },
    assets: {
      issueSpeciesCount: 1,
      completeSpeciesCount: 1,
      available: { maps: 2, sounds: 1, credits: 1, spectrograms: 1, portraits: 1 },
    },
    report: {
      consistent: false,
      issueCount: 1,
      checks: [{ label: "Karten", ok: false, missingFromReport: ["Amsel"], staleInReport: ["Altart"] }],
      counterIssues: ["totalSpecies: 2 statt 3"],
    },
    special: {
      manualMapCount: 2,
      ncSoundCount: 1,
      missingPortraitCount: 1,
      missingSoundKnownCount: 1,
      manualSoundCount: 1,
    },
  }), { pluralize });

  assert.equal(result.overallText, "4 Prüfhinweis(e)");
  assert.match(result.assets.value, /1 Portraits fehlen/);
  assert.match(result.specialText, /1 manueller Sound/);
  assert.match(result.specialText, /1 fehlender Sound/);
  assert.ok(result.detailItems.some((entry) => entry.startsWith("Daten:")));
  assert.ok(result.detailItems.some((entry) => entry.startsWith("Assets vorhanden:")));
  assert.ok(result.detailItems.some((entry) => entry.startsWith("Sound fehlt:")));
  assert.ok(result.detailItems.some((entry) => entry.startsWith("Manuelle Sounds:")));
  assert.ok(result.detailItems.some((entry) => entry.includes("fehlen im Report: Amsel")));
  assert.ok(result.detailItems.some((entry) => entry.startsWith("Report-Zähler:")));
});

test("Artenlistenpräsentation kombiniert Status-, Trend- und Pflegehinweise", () => {
  const result = dashboard.createSpeciesListItemPresentation({
    id: "amsel",
    germanName: "Amsel",
    scientificName: "Turdus merula",
    iucn: { status: "LC", trend: "Abnehmend" },
    inconsistencies: ["Karte fehlt"],
    isNcSound: true,
    isManualMap: true,
    soundCareHint: true,
    missingPortrait: true,
  }, {
    formatIucnStatus,
    iucnStatusIconUrl: (status) => `/status/${status}.png`,
    iucnTrendIconUrl: (trend) => `/trend/${trend}.png`,
  });

  assert.equal(result.germanName, "Amsel");
  assert.deepEqual([...result.indicators].map((entry) => entry.className), ["status", "trend"]);
  assert.deepEqual([...result.flags].map((entry) => entry.label), ["!", "NC", "K", "S", "P"]);
});

test("Statusfilter entfernt Duplikate und sortiert nach deutscher Anzeige", () => {
  const values = dashboard.statusFilterValues([
    { iucn: { status: "VU" } },
    { iucn: { status: "LC" } },
    { iucn: { status: "EN" } },
    { iucn: { status: "VU" } },
    { iucn: { status: "" } },
  ], formatIucnStatus);

  assert.deepEqual([...values], ["VU", "LC", "EN"]);
});

test("Dashboardcontroller synchronisiert Zusammenfassung, Validierung und offene Änderungen", () => {
  const state = { pendingChanges: {}, validationNeedsUpdate: false, databaseNeedsUpdate: false, species: [] };
  const elements = createElements();
  const controller = createController({ state, elements, filterSpecies: () => [] });

  controller.updateSummary({
    speciesCount: 4,
    missingCoreAssets: 1,
    ncSoundCount: 2,
    manualMapCount: 3,
    reportGeneratedAt: "2026-07-15",
  });
  controller.updateValidation(validationFixture());
  controller.updatePendingChanges({ hasPendingChanges: true });

  assert.equal(elements.speciesCount.textContent, 4);
  assert.equal(elements.assetIssues.textContent, 1);
  assert.equal(elements.reportDate.textContent, "Datum 2026-07-15");
  assert.equal(elements.validationOverall.classList.contains("ok"), true);
  assert.equal(elements.validationDetails.hidden, true);
  assert.equal(state.databaseNeedsUpdate, true);
  assert.equal(state.renderDatabaseStatusCalls, 2);
});

test("Dashboardcontroller filtert, rendert, erhält die Listenposition und meldet die Auswahl", () => {
  const species = [
    {
      id: "amsel",
      germanName: "Amsel",
      scientificName: "Turdus merula",
      iucn: { status: "LC", trend: "Abnehmend" },
      inconsistencies: [],
      isNcSound: false,
      isManualMap: false,
      soundCareHint: false,
      missingPortrait: false,
    },
    {
      id: "loewe",
      germanName: "Löwe",
      scientificName: "Panthera leo",
      iucn: { status: "VU", trend: "Abnehmend" },
      inconsistencies: [],
      isNcSound: true,
      isManualMap: false,
      soundCareHint: false,
      missingPortrait: false,
    },
  ];
  const state = { species, filtered: [], selectedId: "loewe" };
  const elements = createElements();
  elements.search.value = "lö";
  elements.statusFilter.value = "VU";
  elements.flagFilter.value = "nc";
  elements.speciesList.scrollTop = 75;
  let selectedId = "";
  let receivedFilters = null;
  const controller = createController({
    state,
    elements,
    filterSpecies(entries, filters) {
      receivedFilters = filters;
      return entries.filter((entry) => entry.id === "loewe");
    },
    onSpeciesSelect(id) {
      selectedId = id;
    },
  });

  controller.populateStatusFilter();
  controller.applyFilters();

  assert.equal(receivedFilters.query, "lö");
  assert.equal(receivedFilters.status, "VU");
  assert.equal(receivedFilters.flag, "nc");
  assert.equal(elements.statusFilter.children[0].textContent, "Alle");
  assert.equal(elements.visibleCount.textContent, "1 Art");
  assert.equal(elements.speciesList.children.length, 1);
  assert.equal(elements.speciesList.scrollTop, 75);
  const item = elements.speciesList.children[0];
  assert.equal(item.classList.contains("active"), true);
  assert.equal(item.querySelector("strong").textContent, "Löwe");
  assert.equal(item.tabIndex, 0, "Nur der gewählte sichtbare Eintrag liegt in der Tabreihenfolge");
  assert.equal(item.querySelector(".species-item-flags").children.length, 3);
  item.emit("click");
  assert.equal(selectedId, "loewe");

  state.filtered = [];
  controller.renderSpeciesList();
  assert.equal(elements.visibleCount.textContent, "0 Arten");
  assert.equal(elements.speciesList.children[0].textContent, "Keine Art passt zu den Filtern.");
});

test("Neu gefilterte Artenlisten bieten genau einen Tastatureinstieg, ohne eine Art ungefragt auszuwählen", () => {
  const state = { species: [], filtered: [], selectedId: "ausgefiltert" };
  const elements = createElements();
  const entries = ["amsel", "loewe"].map((id) => ({ id, germanName: id, scientificName: id,
    iucn: { status: "LC", trend: "" }, inconsistencies: [], missingPortrait: false }));
  let refreshed = 0;
  const controller = dashboard.createDashboardController({
    state, elements, formatDate: String, formatIucnStatus, pluralize, escapeHtml: String,
    iucnStatusIconUrl: () => "", iucnTrendIconUrl: () => "", filterSpecies: () => entries,
    resolveDatabaseStatus: () => "ready", databaseStatusLabel: String, onSpeciesSelect: () => assert.fail("Kein implizites Auswählen"),
    onSpeciesListRendered: () => { refreshed += 1; },
    documentRef: { createElement: (tag) => new FakeElement(tag) }, OptionConstructor: FakeOption,
  });
  controller.applyFilters();
  assert.equal(elements.speciesList.children[0].tabIndex, 0);
  assert.equal(elements.speciesList.children[1].tabIndex, -1);
  assert.equal(refreshed, 1);
  state.filtered = [];
  controller.renderSpeciesList();
  assert.equal(refreshed, 2);
});

test("Listen-Neurender erhält den Fokus derselben Art, fällt auf den erreichbaren Einstieg oder eine leere Liste zurück", () => {
  const entries = ["amsel", "loewe"].map((id) => ({ id, germanName: id, scientificName: id,
    iucn: { status: "LC", trend: "" }, inconsistencies: [], missingPortrait: false }));
  const state = { species: entries, filtered: entries, selectedId: "amsel" };
  const elements = createElements();
  const documentRef = { createElement: (tag) => new FakeElement(tag), activeElement: null };
  const controller = createController({ state, elements, filterSpecies: () => state.filtered, documentRef });
  controller.renderSpeciesList();
  documentRef.activeElement = elements.speciesList.children[1];
  controller.renderSpeciesList();
  assert.equal(elements.speciesList.children[1].focused, true);
  assert.equal(elements.speciesList.children[0].focused, undefined);
  documentRef.activeElement = elements.speciesList.children[1];
  state.filtered = [entries[0]];
  controller.renderSpeciesList();
  assert.equal(elements.speciesList.children[0].focused, true);
  documentRef.activeElement = elements.speciesList.children[0];
  state.filtered = [];
  controller.renderSpeciesList();
  assert.equal(elements.speciesList.focused, true);
  assert.equal(elements.speciesList.tabIndex, 0);
  documentRef.activeElement = new FakeElement("input");
  state.filtered = entries;
  controller.renderSpeciesList();
  assert.equal(elements.speciesList.children.some((item) => item.focused), false, "Filtereingabe verliert ihren Fokus nicht");
});

const websiteReady = (...ids) => ({ status: "ready", checkedAt: "2026-10-26T10:00:00.000Z",
  pages: ids.map((id) => ({ slug: id, url: `https://www.fnwildlifetravel.de/wildlife/heimische-tierwelt/${id}` })) });

function websiteListFixture(fetchJson) {
  const entries = ["amsel", "newbird"].map((id) => ({ id, germanName: id, scientificName: id,
    iucn: { status: "LC", trend: "" }, inconsistencies: [], dataIssues: [], assetIssues: [] }));
  const state = { species: entries, filtered: entries, selectedId: "newbird", websitePagesSnapshot: null };
  const elements = createElements();
  const documentRef = { activeElement: null, createElement: (tag) => new FakeElement(tag) };
  const focusable = (node) => { node.focus = () => { documentRef.activeElement = node; }; return node; };
  focusable(elements.speciesList);
  elements.itemTemplate.content.firstElementChild.cloneNode = () => focusable(createSpeciesItem());
  elements.detailPanel = { querySelector: () => null,
    set innerHTML(_) { assert.fail("Websiteprüfung darf die Detailmedien nicht neu laden"); } };
  elements.websitePagesSummary = new FakeElement();
  elements.websitePagesCheck = new FakeElement("button");
  const dashboardController = createController({ state, elements, documentRef,
    filterSpecies: (species, filters) => context.SpeciesExplorerFilters.filterSpecies(species,
      { ...filters, websitePagesSnapshot: state.websitePagesSnapshot }),
    onSpeciesSelect: () => assert.fail("Websiteprüfung darf die Art nicht neu auswählen"),
  });
  const websiteController = context.SpeciesExplorerWebsitePages.createWebsitePagesController({
    state, elements, fetchJson, escapeHtml: String, documentRef, onChange: dashboardController.applyFilters,
    setTimeoutImpl: () => 1, clearTimeoutImpl() {},
  });
  const flags = (id) => elements.speciesList.children.find((item) => item.dataset.id === id)
    ?.querySelector(".species-item-flags").children.filter((flag) => flag.textContent === "W") || [];
  return { state, elements, documentRef, dashboardController, websiteController, flags };
}

test("W markiert ausschließlich bestätigt fehlende FN-Artseiten und erhält vorhandene Pflegehinweise", () => {
  const h = websiteListFixture(async () => websiteReady("amsel"));
  Object.assign(h.state.species[1], { isManualMap: true, soundCareHint: true, missingPortrait: true });
  for (const snapshot of [null, { status: "checking", pages: [] }, { status: "unknown", pages: [] },
    { status: "unavailable", pages: [] }, websiteReady("amsel", "newbird"),
    { ...websiteReady("newbird"), status: "unavailable" }]) {
    h.state.websitePagesSnapshot = snapshot;
    h.dashboardController.renderSpeciesList();
    assert.equal(h.flags("newbird").length, 0);
  }
  h.state.websitePagesSnapshot = websiteReady("amsel");
  h.dashboardController.renderSpeciesList();
  assert.equal(h.flags("amsel").length, 0);
  const [flag] = h.flags("newbird");
  assert.ok(flag, "Eine bestätigte fehlende öffentliche Artseite bekommt W");
  assert.equal(flag.className, "flag website");
  assert.equal(flag.title, "Art noch nicht auf der FN-Website veröffentlicht");
  assert.equal(flag.attributes.role, "img");
  assert.equal(flag.attributes["aria-label"], flag.title);
  const allFlags = h.elements.speciesList.children[1].querySelector(".species-item-flags").children;
  assert.deepEqual(allFlags.filter((item) => item.textContent).map((item) => item.textContent), ["K", "S", "P", "W"]);
});

test("Website prüfen entfernt W nach einer neuen Seite mit echtem Listenrenderer ohne Medienreload oder Fokusverlust", async () => {
  const calls = [];
  let resolve;
  const h = websiteListFixture(async (url) => {
    calls.push(url);
    return calls.length === 1 ? websiteReady("amsel") : new Promise((done) => { resolve = done; });
  });
  try {
    await h.websiteController.start();
    assert.equal(h.flags("newbird").length, 1);
    h.elements.speciesList.scrollTop = 87;
    h.elements.speciesList.children[1].focus();
    h.elements.websitePagesCheck.emit("click");
    const pending = h.websiteController.refresh();
    assert.equal(h.elements.websitePagesCheck.disabled, true);
    assert.equal(h.flags("newbird").length, 1, "Letzter bestätigter Stand bleibt während der Prüfung sichtbar");
    resolve(websiteReady("amsel", "newbird"));
    await pending;
    assert.equal(h.flags("newbird").length, 0);
    assert.equal(h.documentRef.activeElement, h.elements.speciesList.children[1]);
    assert.equal(h.documentRef.activeElement.dataset.id, "newbird");
    assert.equal(h.state.selectedId, "newbird");
    assert.equal(h.elements.speciesList.scrollTop, 87);
    assert.equal(h.elements.websitePagesCheck.disabled, false);
    assert.deepEqual(calls, ["/api/website/species-pages", "/api/website/species-pages?refresh=1"]);
  } finally { h.websiteController.stop(); }
});

test("Website-Statusfehler erzeugen kein W und der bestehende Fehlend-Filter aktualisiert ohne ungefragte Auswahl", async () => {
  let snapshot = websiteReady("amsel");
  const h = websiteListFixture(async () => snapshot);
  try {
    await h.websiteController.start();
    assert.equal(h.flags("newbird").length, 1);
    snapshot = { status: "unavailable", pages: [] };
    await h.websiteController.refresh();
    assert.equal(h.flags("newbird").length, 0);
    assert.equal(context.SpeciesExplorerWebsitePages.pagePresentation("amsel", h.state.websitePagesSnapshot).status, "found");
    snapshot = websiteReady("amsel");
    h.elements.flagFilter.value = "website-missing";
    await h.websiteController.refresh();
    assert.deepEqual(h.state.filtered.map((item) => item.id), ["newbird"]);
    h.elements.speciesList.children[0].focus();
    snapshot = websiteReady("amsel", "newbird");
    await h.websiteController.refresh({ refresh: true });
    assert.equal(h.state.filtered.length, 0);
    assert.equal(h.elements.speciesList.children[0].textContent, "Keine Art passt zu den Filtern.");
    assert.equal(h.documentRef.activeElement, h.elements.speciesList);
    assert.equal(h.state.selectedId, "newbird");
  } finally { h.websiteController.stop(); }
});
