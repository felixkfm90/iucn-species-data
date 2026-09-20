import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-new-species-workflow.js", import.meta.url), "utf8");
const mapUrl = "https://www.iucnredlist.org/api/v4/assessments/154496308/distribution_map/jpg";
class Element {
  children = new Map(); listeners = new Map(); dataset = {}; value = ""; textContent = "";
  hidden = false; disabled = false; files = []; style = {};
  classList = { toggle() {}, remove() {} };
  querySelector(selector) {
    if (["audio", ".asset-review-progress-marker", ".new-species-review-spectrogram"].includes(selector)) return null;
    if (!this.children.has(selector)) this.children.set(selector, new Element());
    return this.children.get(selector);
  }
  querySelectorAll(selector) { return this.groups?.[selector] || []; }
  set innerHTML(value) {
    this.html = value; this.children.clear();
    const url = /class="new-species-map-source-input"[^>]*value="([^"]*)"/.exec(value)?.[1];
    if (url) this.querySelector(".new-species-map-source-input").value = url;
  }
  get innerHTML() { return this.html || ""; }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  async emit(name, event = {}) { return this.listeners.get(name)?.({ preventDefault() {}, stopPropagation() {}, target: this, ...event }); }
  focus() {} reset() {} removeAttribute(name) { delete this[name]; }
}

async function settle(predicate) {
  for (let i = 0; i < 100; i += 1) { if (predicate()) return; await new Promise(setImmediate); }
  assert.fail("Workflow did not reach the expected state");
}

function harness({ status = "awaiting-review", finalStatus = "completed", failReview = false } = {}) {
  const dialog = new Element(), form = new Element(), open = new Element(), close = new Element();
  close.textContent = "Abbrechen";
  const steps = [1, 2, 3, 4].map((n) => { const e = new Element(); e.dataset.newSpeciesStep = n; return e; });
  dialog.groups = { ".new-species-cancel": [close], "[data-new-species-step]": steps };
  form.elements = { german: new Element() };
  const state = { species: [] }, calls = [];
  let dialogOptions, statusReads = 0, opened = false;
  const context = vm.createContext({ document: {}, FormData: class {}, clearTimeout, setTimeout });
  new vm.Script(source).runInContext(context);
  const species = { id: "perdixperdix", germanName: "Rebhuhn", iucn: { assessmentId: 154496308 }, assets: { map: { exists: false }, sound: { exists: true } } };
  const controller = context.SpeciesExplorerNewSpeciesWorkflow.createNewSpeciesWorkflowController({
    state, elements: { newSpeciesDialog: dialog, newSpeciesForm: form, newSpeciesButton: open,
      search: new Element(), statusFilter: new Element(), flagFilter: new Element() },
    createMessageSetter: (element) => (text = "", type = "") => { element.textContent = text; element.hidden = !text; element.type = type; },
    createFieldFeedbackController: () => ({ clearFieldErrors() {}, applyFieldErrors() {}, updateMeasurementMode() {} }),
    createNewSpeciesFormModel: () => ({ speciesValues: () => ({ german: "Rebhuhn" }), localFieldErrors: () => ({}) }),
    createTaxonomyReferenceController: () => ({ reset() {}, initialize() {} }),
    createDialogController: (options) => {
      dialogOptions = options;
      close.addEventListener("click", () => { if (options.beforeClose()) opened = false; });
      return { open() { opened = true; }, close() { if (options.beforeClose()) opened = false; } };
    },
    fetchJson: async (route, options) => {
      const body = options?.body ? JSON.parse(options.body) : null;
      calls.push({ route, body });
      if (route.endsWith("/new/preview")) return { token: "draft", entry: {}, derived: {} };
      if (route.endsWith("/new/discard")) return { discarded: true };
      if (route.endsWith("/new/save")) return { species, entry: { german: "Rebhuhn" }, derived: { slug: species.id } };
      if (route === "/api/pipeline/preview") return { token: "run-preview", hasWork: true, tokensAvailable: true };
      if (route === "/api/pipeline/start") return { status: "running", runId: "run" };
      if (route === "/api/pipeline/status") return {
        status: statusReads++ ? finalStatus : status, error: "Karte fehlt; Übertragung angehalten", runId: "run",
        reviewAssets: [{ type: "sound", safeName: "Rebhuhn", germanName: "Rebhuhn", scientificName: "Perdix perdix", url: "/sound.mp3" }],
      };
      if (route.endsWith("/assets/map/preview")) return { token: "map-preview", newMap: { url: "/preview.jpg", dimensions: { width: 800, height: 1000 }, bytes: 1234 } };
      if (route.endsWith("/assets/map/save")) { species.assets.map.exists = true; return { saved: true }; }
      if (route === "/api/pipeline/assets/review") { if (failReview) throw new Error("Medienprüfung fehlgeschlagen"); return {}; }
      throw new Error(`Unexpected route: ${route}`);
    },
    loadData: async () => { state.species = [species]; },
    fileToBase64: async () => "local-image-bytes", escapeHtml: (x) => String(x || ""), formatBytes: (x) => `${x} Bytes`,
    releaseMediaWithin() {}, iucnDistributionMapUrl: () => mapUrl,
    soundLicenseInfo: () => ({}), soundLicenseBadgeHtml: () => "", soundSearchOutcome: () => ({}),
  });
  controller.setupNewSpeciesCreator();
  const get = (selector) => dialog.querySelector(selector);
  const map = get(".new-species-map-review"), sound = get(".new-species-sound-review");
  const action = (key, value) => ({ closest: (selector) => selector === `[${key}]` ? { dataset: {
    [key.replace(/^data-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase())]: value,
  } } : null });
  return { state, calls, get, close, steps, map, sound, dialogOptions: () => dialogOptions, opened: () => opened,
    async start() {
      await open.emit("click"); await form.emit("submit");
      await get(".new-species-next-button").emit("click");
      await get(".new-species-portrait-skip-button").emit("click");
      await get(".new-species-next-button").emit("click");
      await settle(() => calls.some((c) => c.route === "/api/pipeline/status") && !close.disabled).catch((error) => {
        throw new Error(`${error.message}: ${JSON.stringify(calls)}; ${get(".new-species-finish-message").textContent}; ${get(".new-species-message").textContent}`);
      });
    },
    async mapAction(value) { await map.emit("click", { target: action("data-new-species-map-action", value) }); },
    async soundAction() { await sound.emit("click", { target: action("data-new-species-sound-decision", "automatic") }); },
    async upload(files, drop = false) {
      if (drop) await map.emit("drop", { target: { closest: () => ({}) }, dataTransfer: { files } });
      else await map.emit("change", { target: { matches: () => true, files } });
    },
  };
}

test("Neue Art: Datei und Drop nutzen lokale Bytes, Quellenlink ist vorbelegt; Abschluss bleibt bedienbar", async () => {
  for (const drop of [false, true]) {
    const h = harness(); await h.start();
    assert.match(h.map.innerHTML, /type="file"/);
    assert.equal(h.map.querySelector(".new-species-map-source-input").value, mapUrl);
    await h.upload([{ name: "T1A154496308.jpg", size: 1234 }], drop);
    const preview = h.calls.find((c) => c.route.endsWith("/assets/map/preview"));
    assert.equal(preview.body.imageBase64, "local-image-bytes");
    assert.equal(preview.body.pipelineRunId, "run");
    assert.equal(preview.body.source, mapUrl);
    assert.equal(h.calls.some((c) => c.route.endsWith("/assets/map/save")), false);
    await h.mapAction("save");
    await settle(() => !h.sound.hidden);
    await h.soundAction();
    await settle(() => /erfolgreich angelegt/.test(h.get(".new-species-finish-message").textContent));
    assert.equal(h.close.disabled, false);
    await h.close.emit("click"); assert.equal(h.opened(), false);
    assert.equal(h.calls.filter((c) => c.route.endsWith("/new/save")).length, 1);
    assert.equal(h.calls.some((c) => c.route.endsWith("/new/discard")), false);
  }
});

test("Neue Art: fehlgeschlagene Veröffentlichung auf Schritt 4 meldet vorhandene Art und erlaubt Schließen", async () => {
  for (const failReview of [false, true]) {
    const h = harness({ finalStatus: "failed", failReview }); await h.start();
    await h.mapAction("skip"); await h.soundAction();
    await settle(() => /lokal angelegt/.test(h.get(".new-species-finish-message").textContent));
    assert.equal(h.steps[3].hidden, false);
    assert.match(h.get(".new-species-finish-message").textContent, /nicht erneut anlegen/);
    assert.equal(h.close.disabled, false); assert.equal(h.close.textContent, "Fenster schließen");
    await h.close.emit("click"); assert.equal(h.opened(), false);
    assert.equal(h.state.newSpeciesPipelineActive, false);
  }
});

test("Neue Art: Review kann ohne Löschen geschlossen werden; falsche IUCN-Datei wird nicht hochgeladen", async () => {
  const h = harness(); await h.start();
  await h.upload([{ name: "T1A999.jpg", size: 1234 }]);
  assert.equal(h.calls.some((c) => c.route.endsWith("/assets/map/preview")), false);
  assert.match(h.map.querySelector(".new-species-map-message").textContent, /anderen Bewertung/);
  await h.close.emit("click"); assert.equal(h.opened(), false);
  assert.equal(h.calls.some((c) => c.route.endsWith("/new/discard")), false);
});
