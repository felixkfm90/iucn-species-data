import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("./public/app-taxonomy-reference.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source, { filename: "app-taxonomy-reference.js" }).runInContext(context);
const taxonomyReference = context.SpeciesExplorerTaxonomyReference;
const selectionSource = await readFile(new URL("./public/app-selection.js", import.meta.url), "utf8");

class ReferenceElement {
  constructor() {
    this.listeners = new Map(); this.attributes = new Map(); this.nodes = new Map();
    this.children = []; this.dataset = {}; this.value = ""; this.hidden = false;
  }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  emit(type, additions = {}) {
    const event = { target: this, preventDefault() { this.defaultPrevented = true; }, ...additions };
    this.listeners.get(type)?.(event);
    return event;
  }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  querySelector(selector) { return this.nodes.get(selector) || null; }
  querySelectorAll() { return this.children; }
  append(child) { this.children.push(child); }
  contains(element) { return this.children.includes(element); }
  replaceChildren(...children) {
    if (this.contains(this.ownerDocument?.activeElement)) this.ownerDocument.activeElement = this.ownerDocument.body;
    this.children = children;
  }
  get options() { return this.children; }
  focus() { this.focused = true; if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  scrollIntoView() { this.scrolled = true; }
  closest() { return this; }
  set innerHTML(html) {
    this.html = html;
    if (!this.isResults) return;
    if (this.contains(this.ownerDocument?.activeElement)) this.ownerDocument.activeElement = this.ownerDocument.body;
    this.children = Array.from(html.matchAll(/<button\s+([\s\S]*?)>/g), (match) => {
      const item = new ReferenceElement();
      item.ownerDocument = this.ownerDocument;
      item.dataset.taxonId = match[1].match(/data-taxon-id="([^"]+)"/)?.[1];
      for (const [, name, value] of match[1].matchAll(/(aria-selected|tabindex)="([^"]+)"/g)) item.setAttribute(name, value);
      item.tabIndex = Number(item.getAttribute("tabindex") ?? 0);
      return item;
    });
  }
  get innerHTML() { return this.html || ""; }
}

async function createReferenceNavigationFixture({ rejectDetail = false, deferDetail = false, assignmentAllowed = true } = {}) {
  const section = new ReferenceElement();
  for (const name of ["status", "message", "kingdom", "results", "selection", "selection-content"]) {
    section.nodes.set(`.taxonomy-reference-${name}`, new ReferenceElement());
  }
  const results = section.querySelector(".taxonomy-reference-results");
  results.isResults = true;
  results.hidden = true;
  const form = { elements: { german: new ReferenceElement(), english: new ReferenceElement(), scientificName: new ReferenceElement() } };
  const calls = [];
  let finishDetail;
  const resultsData = ["1", "2", "3"].map((id) => ({ taxonId: id, rank: "species", scientificName: `Species ${id}`, germanName: `Art ${id}`, englishName: `Species ${id}` }));
  const documentRef = { body: new ReferenceElement(), createElement: () => new ReferenceElement(), addEventListener() {} };
  documentRef.activeElement = documentRef.body;
  for (const element of [section, ...section.nodes.values(), ...Object.values(form.elements)]) element.ownerDocument = documentRef;
  const controllerContext = vm.createContext({ document: documentRef, setTimeout, clearTimeout });
  new vm.Script(selectionSource).runInContext(controllerContext);
  new vm.Script(source).runInContext(controllerContext);
  let changes = 0;
  const controller = controllerContext.SpeciesExplorerTaxonomyReference.createTaxonomyReferenceController({
    root: { querySelector: () => section }, form, debounceMs: 0,
    onNamesChanged: () => { changes += 1; },
    async fetchJson(url, options) {
      calls.push({ url, options });
      assert.equal(options?.method, undefined, "Navigation darf keine Schreibanfrage starten");
      if (url === "/api/taxonomy/status") return { available: true };
      if (url === "/api/taxonomy/kingdoms") return { defaultKingdom: "Animalia", values: [{ id: "Animalia", label: "Tiere" }] };
      if (url.startsWith("/api/taxonomy/search?")) return { results: resultsData };
      if (deferDetail) await new Promise((resolve) => { finishDetail = resolve; });
      if (rejectDetail) throw new Error("Details nicht verfügbar");
      const id = url.split("/").at(-1);
      return { taxon_id: id, scientific_name: `Species ${id}`, assignmentAllowed, germanNames: [{ name: `Art ${id}` }], englishNames: [{ name: `Species ${id}` }], hierarchy: {} };
    },
  });
  await controller.initialize();
  form.elements.german.value = "Ar";
  form.elements.german.emit("input");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(results.children.length, 3);
  return { results, form, calls, controller, section, documentRef, changes: () => changes,
    finishDetail: () => finishDetail?.() };
}

test("Namensvorschläge navigieren mit Pfeilen/Home/End, übernehmen erst nach bewusster Aktivierung und geben Fokus zurück", async () => {
  const fixture = await createReferenceNavigationFixture();
  const [one, two, three] = fixture.results.children;
  const key = (key, target) => fixture.results.emit("keydown", { key, target });
  assert.equal(one.tabIndex, 0);
  assert.equal(two.tabIndex, -1);
  assert.equal(key("ArrowDown", one).defaultPrevented, true);
  assert.equal(two.focused, true);
  assert.equal(two.getAttribute("aria-selected"), "true");
  key("End", two);
  assert.equal(three.getAttribute("aria-selected"), "true");
  key("Home", three);
  assert.equal(one.getAttribute("aria-selected"), "true");
  key("ArrowUp", three);
  assert.equal(two.getAttribute("aria-selected"), "true");
  assert.equal(fixture.changes(), 0, "Pfeile allein übernehmen keine Namen");
  assert.equal(fixture.calls.filter((entry) => entry.url.includes("/taxa/")).length, 0);
  assert.equal(fixture.form.elements.german.value, "Ar");
  assert.equal(key("Enter", two).defaultPrevented, undefined, "Native Buttonaktivierung bleibt erhalten");
  fixture.results.emit("click", { target: two });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.form.elements.german.value, "Art 2");
  assert.equal(fixture.form.elements.scientificName.value, "Species 2");
  assert.equal(fixture.controller.getSelection().scientificName, "Species 2");
  assert.equal(fixture.changes(), 1);
  assert.equal(fixture.results.hidden, true);
  assert.equal(fixture.form.elements.german.focused, true);
});

test("Nach fehlgeschlagener Vorschlagsübernahme bleibt der Fehler lesbar und der Eingabefokus erreichbar", async () => {
  const fixture = await createReferenceNavigationFixture({ rejectDetail: true });
  fixture.results.emit("click", { target: fixture.results.children[0] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(fixture.section.querySelector(".taxonomy-reference-message").textContent, /Details nicht verfügbar/);
  assert.equal(fixture.controller.getSelection(), null);
  assert.equal(fixture.form.elements.german.value, "Ar");
  assert.equal(fixture.form.elements.german.focused, true);
  assert.equal(fixture.changes(), 0);
});

test("Zwischenzeitlich zurückbehaltenes Taxon aus altem Suchtreffer übernimmt keine Namen", async () => {
  const fixture = await createReferenceNavigationFixture({ assignmentAllowed: false });
  fixture.results.emit("click", { target: fixture.results.children[0] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.controller.getSelection(), null);
  assert.equal(fixture.form.elements.german.value, "Ar");
  assert.equal(fixture.form.elements.scientificName.value, "");
  assert.equal(fixture.changes(), 0);
  assert.match(fixture.section.querySelector(".taxonomy-reference-message").textContent, /historisch|Bestand/i);
});

test("Ein verzögerter Taxondetailabruf erhält einen inzwischen bewusst gewechselten Eingabefokus", async () => {
  for (const rejectDetail of [false, true]) {
    const fixture = await createReferenceNavigationFixture({ rejectDetail, deferDetail: true });
    fixture.results.children[0].focus();
    fixture.results.emit("click", { target: fixture.results.children[0] });
    fixture.form.elements.english.focus();
    fixture.finishDetail();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fixture.documentRef.activeElement, fixture.form.elements.english,
      rejectDetail ? "Fehlerantwort darf den Fokus nicht zurückziehen" : "Erfolgsantwort darf den Fokus nicht zurückziehen");
    assert.equal(fixture.form.elements.german.focused, undefined);
    assert.equal(fixture.changes(), rejectDetail ? 0 : 1);
  }
});

test("Eine noch offene alte Detailantwort stellt nach einem neuen Suchauftrag keinen Fokus wieder her", async () => {
  const fixture = await createReferenceNavigationFixture({ deferDetail: true });
  fixture.results.children[0].focus();
  fixture.results.emit("click", { target: fixture.results.children[0] });
  fixture.form.elements.english.value = "Species";
  fixture.form.elements.english.focus();
  fixture.form.elements.english.emit("input");
  fixture.finishDetail();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(fixture.documentRef.activeElement, fixture.form.elements.english);
  assert.equal(fixture.form.elements.german.value, "Ar");
  assert.equal(fixture.controller.getSelection(), null);
  assert.equal(fixture.changes(), 0);
});

test("Erneuerte Namensvorschläge erhalten einen vorhandenen Listenfokus, ziehen ihn aber nicht von einer anderen Eingabe zurück", async () => {
  const fixture = await createReferenceNavigationFixture();
  fixture.results.children[1].focus();
  fixture.form.elements.german.emit("input");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(fixture.documentRef.activeElement, fixture.results.children[1]);
  assert.equal(fixture.results.children[1].getAttribute("aria-selected"), "true");
  assert.equal(fixture.results.children[1].tabIndex, 0);
  assert.equal(fixture.changes(), 0);
  fixture.form.elements.german.emit("input");
  fixture.form.elements.english.focus();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(fixture.documentRef.activeElement, fixture.form.elements.english);
  assert.equal(fixture.changes(), 0);
});

test("Such-URL begrenzt die Suche auf Richtung, Reich und Ergebniszahl", () => {
  const url = taxonomyReference.taxonomySearchUrl({
    query: "Stieglitz & Zeisig",
    kind: "vernacular",
    kingdomId: "Animalia",
    language: "de",
    rank: "species",
    limit: 12,
  });
  assert.equal(
    url,
    "/api/taxonomy/search?q=Stieglitz%20%26%20Zeisig&kind=vernacular&language=de&rank=species&limit=12&kingdomId=Animalia",
  );
  assert.equal(
    taxonomyReference.taxonomySearchUrl({
      query: "Toko",
      kind: "vernacular",
      kingdomIds: ["Animalia", "Plantae"],
      language: "de",
      rank: "species",
      limit: 12,
    }),
    "/api/taxonomy/search?q=Toko&kind=vernacular&language=de&rank=species&limit=12&kingdomIds=Animalia%2CPlantae",
  );
});

test("Fehlende Referenz wird als manuelle, nicht blockierende Eingabe dargestellt", () => {
  assert.deepEqual(
    { ...taxonomyReference.taxonomyAvailabilityPresentation({
      available: false,
      message: "Lokale Referenz fehlt.",
    }) },
    {
      state: "unavailable",
      label: "Manuelle Eingabe",
      message: "Lokale Referenz fehlt.",
    },
  );
  assert.equal(
    taxonomyReference.taxonomyAvailabilityPresentation({ available: true }).label,
    "Referenz verfügbar",
  );
});

test("der Assistent verwendet den verschachtelten Referenzstatus der Wartungs-API", () => {
  const status = {
    status: "idle",
    message: "Noch keine Aktualisierung gestartet.",
    reference: {
      available: true,
      releaseId: "col-xr-2026-07-17-315834",
    },
  };
  assert.deepEqual(
    { ...taxonomyReference.taxonomyReferenceStatus(status) },
    { ...status.reference },
  );
  assert.equal(
    taxonomyReference.taxonomyAvailabilityPresentation(status).state,
    "available",
  );
});

test("Alle Reiche steht vor den alphabetisch sortierten sichtbaren Reichen", () => {
  const sorted = taxonomyReference.sortTaxonomyKingdoms([
    { id: "Animalia", label: "Tiere (Animalia)" },
    { id: "Plantae", label: "Pflanzen (Plantae)" },
    { id: "Chromista", label: "Chromisten (Chromista)" },
    { id: "Fungi", label: "Pilze (Fungi)" },
  ], {
    includesAllOption: true,
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(sorted)),
    [
      { id: "all", label: "Alle Reiche" },
      { id: "Chromista", label: "Chromisten (Chromista)" },
      { id: "Plantae", label: "Pflanzen (Plantae)" },
      { id: "Fungi", label: "Pilze (Fungi)" },
      { id: "Animalia", label: "Tiere (Animalia)" },
    ],
  );
});

test("Reichsfilter durchsucht deutsche und wissenschaftliche Bezeichnungen", () => {
  const values = [
    { id: "Animalia", label: "Tiere (Animalia)" },
    { id: "Plantae", label: "Pflanzen (Plantae)" },
    { id: "Chromista", label: "Chromisten (Chromista)" },
  ];
  assert.deepEqual(
    JSON.parse(JSON.stringify(taxonomyReference.filterTaxonomyKingdoms(values, "tier"))),
    [{ id: "Animalia", label: "Tiere (Animalia)" }],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(taxonomyReference.filterTaxonomyKingdoms(values, "plantae"))),
    [{ id: "Plantae", label: "Pflanzen (Plantae)" }],
  );
});

test("alle Namensfelder verwenden dieselbe Suchverzögerung von 500 Millisekunden", () => {
  const callbacks = [];
  const cleared = [];
  const calls = [];
  let nextTimerId = 0;
  const scheduler = taxonomyReference.createTaxonomySearchScheduler(
    (...args) => calls.push(args),
    {
      setTimeoutFn(callback, delay) {
        callbacks.push({ id: ++nextTimerId, callback, delay });
        return nextTimerId;
      },
      clearTimeoutFn(timerId) {
        cleared.push(timerId);
      },
    },
  );

  scheduler.schedule("deutsch", "vernacular", "de");
  scheduler.schedule("english", "vernacular", "en");
  assert.equal(scheduler.delayMs, 500);
  assert.deepEqual(callbacks.map(({ delay }) => delay), [500, 500]);
  assert.deepEqual(cleared, [1]);
  callbacks[1].callback();
  assert.deepEqual(calls, [["english", "vernacular", "en"]]);
});

test("Trefferdarstellung trennt deutschen Namen, akzeptierten Namen und Synonym", () => {
  const result = taxonomyReference.taxonomyResultPresentation({
    taxonId: 42,
    germanName: "Stieglitz",
    acceptedScientificName: "Carduelis carduelis",
    matchedTerm: "Fringilla carduelis",
    kingdom: { label: "Tiere" },
    rank: "species",
    hasVerifiedGermanName: true,
    synonym: {
      scientificName: "Fringilla carduelis",
      acceptedScientificName: "Carduelis carduelis",
    },
  });
  assert.equal(result.title, "Stieglitz");
  assert.equal(result.subtitle, "Carduelis carduelis");
  assert.equal(result.note, "Gefunden als Synonym: Fringilla carduelis");
  assert.equal(result.kingdom, "Tiere");
  assert.equal(result.rank, "Art");
  assert.equal(result.source, "");
  assert.equal(result.taxonId, "42");
});

test("englischer Name bleibt ohne deutschen Namen als eigenes Namensfeld erkennbar", () => {
  const result = taxonomyReference.taxonomyResultPresentation({
    taxonId: 84,
    germanName: null,
    englishName: "Red fox",
    acceptedScientificName: "Vulpes vulpes",
    matchedTerm: "Vulpes vulpes",
    kingdom: { label: "Tiere" },
    rank: "species",
    hasVerifiedGermanName: false,
  });
  assert.equal(result.title, "Red fox");
  assert.equal(result.subtitle, "Vulpes vulpes");
  assert.equal(result.usesEnglishFallback, true);
  assert.equal(result.note, "Englischer Name");

  const detail = taxonomyReference.taxonomyDetailPresentation({
    scientific_name: "Vulpes vulpes",
    germanNames: [],
    englishNames: [{ name: "Red fox" }],
    hierarchy: [],
  }, {
    germanName: null,
    englishName: "Red fox",
    hasVerifiedGermanName: false,
  });
  assert.equal(detail.germanName, "");
  assert.equal(detail.englishName, "Red fox");
  assert.equal(detail.displayName, "Red fox");
  assert.equal(detail.nameToApply, "Red fox");
  assert.equal(detail.usesEnglishFallback, true);
});

test("Detaildarstellung liefert Hierarchie, Quelle und manuellen Animalia-Fallback", () => {
  const detail = taxonomyReference.taxonomyDetailPresentation({
    scientific_name: "Carduelis carduelis",
    source_id: "COL:123",
    source: "Catalogue of Life",
    releaseId: "col-xr-2026-07-17",
    germanNames: [{ name: "Stieglitz" }],
    hierarchy: [
      { rank: "kingdom", scientific_name: "Animalia" },
      { rank: "species", scientific_name: "Carduelis carduelis" },
    ],
    manualGermanNameFallback: {
      provider: "Animalia.bio",
      url: "https://animalia.bio/search?query=Carduelis%20carduelis",
    },
    rank: "species",
    status: "accepted",
    trust_tier: "base",
  }, {
    germanName: "Stieglitz",
    hasVerifiedGermanName: true,
  });
  assert.equal(detail.germanName, "Stieglitz");
  assert.equal(detail.hierarchy[0].label, "Reich");
  assert.equal(detail.hierarchy[1].label, "Art");
  assert.equal(detail.sourceId, "COL:123");
  assert.equal(detail.rank, "Art");
  assert.equal(detail.status, "accepted");
  assert.equal(detail.trustTier, "base");
  assert.equal(detail.manualGermanNameFallback.provider, "Animalia.bio");
});

test("Detaildarstellung trennt bevorzugten Masterwert vom ersten Ergänzungsnamen", () => {
  const detail = taxonomyReference.taxonomyDetailPresentation({
    masterTaxonId: "mtx_stork",
    scientific_name: "Ciconia ciconia",
    preferredGermanName: "Weissstorch",
    supplement: { namePreference: { previousGermanName: "Hausstorch" } },
    germanNames: [{ name: "Weißstorch" }, { name: "Weissstorch" }],
    rank: "species",
  }, {
    germanName: "Weissstorch",
    hasVerifiedGermanName: true,
  });
  assert.equal(detail.preferredGermanName, "Weissstorch");
  assert.equal(detail.previousGermanName, "Hausstorch");
  assert.equal(detail.germanNameChoices[0], "Weissstorch");
});
