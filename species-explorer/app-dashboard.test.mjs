import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-dashboard.js", import.meta.url), "utf8");
const context = vm.createContext({});
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

function createController({ state, elements, filterSpecies, onSpeciesSelect = () => {} }) {
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
    documentRef: { createElement: (tagName) => new FakeElement(tagName) },
    OptionConstructor: FakeOption,
  });
}

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
  assert.equal(item.querySelector(".species-item-flags").children.length, 3);
  item.emit("click");
  assert.equal(selectedId, "loewe");

  state.filtered = [];
  controller.renderSpeciesList();
  assert.equal(elements.visibleCount.textContent, "0 Arten");
  assert.equal(elements.speciesList.children[0].textContent, "Keine Art passt zu den Filtern.");
});
