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
  focus() { this.focused = true; } reset() {} removeAttribute(name) { delete this[name]; }
}

async function settle(predicate) {
  for (let i = 0; i < 100; i += 1) { if (predicate()) return; await new Promise(setImmediate); }
  assert.fail("Workflow did not reach the expected state");
}

function harness({ status = "awaiting-review", finalStatus = "completed", failReview = false,
  confirm = true, failRestart = false, failReset = false, noReviewAssets = false, persistReview = false, initializeReference = () => {},
  ownedCreation = false, pendingAborts = 0, finalPublished = false, restartStatus } = {}) {
  const dialog = new Element(), form = new Element(), open = new Element(), close = new Element();
  const headerClose = new Element();
  headerClose.textContent = "×";
  close.textContent = "Abbrechen";
  const steps = [1, 2, 3, 4].map((n) => { const e = new Element(); e.dataset.newSpeciesStep = n; return e; });
  dialog.groups = { ".new-species-cancel": [close, headerClose], "[data-new-species-step]": steps };
  form.elements = { german: new Element() };
  const state = { species: [] }, calls = [], confirmations = [], loadStatuses = [];
  const filters = { search: new Element(), statusFilter: new Element(), flagFilter: new Element() };
  let dialogOptions, statusReads = 0, opened = false, rejectedCount = 1, starts = 0;
  let reviewSubmitted = false, restartReviewed = false;
  let created = false, aborted = false, abortReads = 0;
  const context = vm.createContext({ document: {}, FormData: class {}, clearTimeout, setTimeout });
  new vm.Script(source).runInContext(context);
  const species = { id: "perdixperdix", germanName: "Rebhuhn", iucn: { assessmentId: 154496308 }, assets: { map: { exists: false }, sound: { exists: true } } };
  const controller = context.SpeciesExplorerNewSpeciesWorkflow.createNewSpeciesWorkflowController({
    state, elements: { newSpeciesDialog: dialog, newSpeciesForm: form, newSpeciesButton: open,
      ...filters },
    createMessageSetter: (element) => (text = "", type = "") => { element.textContent = text; element.hidden = !text; element.type = type; },
    createFieldFeedbackController: () => ({ clearFieldErrors() {}, applyFieldErrors() {}, updateMeasurementMode() {} }),
    createNewSpeciesFormModel: () => ({ speciesValues: () => ({ german: "Rebhuhn" }), localFieldErrors: () => ({}) }),
    createTaxonomyReferenceController: () => ({ reset() {}, initialize: initializeReference }),
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
      if (route.endsWith("/new/sessions")) return { sessions: ownedCreation && created && !aborted
        ? [{ id: "own-creation", slug: species.id, germanName: "Rebhuhn", runId: "run", canAbort: !(finalPublished && reviewSubmitted), publicationStarted: finalPublished && reviewSubmitted }] : [] };
      if (route.endsWith("/new/abort")) {
        if (abortReads++ < pendingAborts) return { pending: true, message: "Abbruch angefordert; Speicherung abwarten." };
        aborted = true; return { aborted: true, pipelineRequired: false };
      }
      if (route.endsWith("/new/save")) { created = true; return { species, entry: { german: "Rebhuhn" }, derived: { slug: species.id }, ...(ownedCreation ? { creationId: "own-creation" } : {}) }; }
      if (route === "/api/pipeline/preview") return { token: "run-preview", hasWork: true, tokensAvailable: true };
      if (route === "/api/pipeline/start") {
        if (++starts > 1 && failRestart) throw new Error("Test: Suchstart fehlgeschlagen");
        if (ownedCreation && !(finalPublished && reviewSubmitted)) {
          assert.equal(body.creationId, "own-creation");
          assert.equal(body.guidedSpeciesCreation, true);
        }
        return { status: "running", runId: "run", ...(ownedCreation ? { creationId: "own-creation" } : {}) };
      }
      if (route.endsWith("/rejections-preview")) return { token: "reset", count: rejectedCount };
      if (route.endsWith("/rejections-reset")) {
        if (failReset) throw new Error("Test: Ablehnungen unverändert");
        if (ownedCreation && !(finalPublished && reviewSubmitted)) assert.equal(body.creationId, "own-creation");
        rejectedCount = 0; return { saved: true };
      }
      if (route === "/api/pipeline/status") {
        if (aborted) return { status: "aborted", runId: "run", reviewAssets: [] };
        const first = statusReads++ === 0;
        return {
        status: starts > 1 && restartStatus && !restartReviewed ? restartStatus
          : persistReview && !reviewSubmitted ? status : first ? status : finalStatus, error: "Karte fehlt; Übertragung angehalten", runId: "run",
        guidedSpeciesCreation: noReviewAssets, gitPublished: finalPublished && reviewSubmitted, targets: [{ slug: "perdixperdix", germanName: "Rebhuhn" }],
        reviewAssets: noReviewAssets ? [] : [{ type: "sound", safeName: "Rebhuhn", germanName: "Rebhuhn", scientificName: "Perdix perdix", url: "/sound.mp3" }],
      }; }
      if (route.endsWith("/assets/map/preview")) return { token: "map-preview", newMap: { url: "/preview.jpg", dimensions: { width: 800, height: 1000 }, bytes: 1234 } };
      if (route.endsWith("/assets/map/save")) { species.assets.map.exists = true; return { saved: true }; }
      if (route === "/api/pipeline/assets/review") { if (failReview) throw new Error("Medienprüfung fehlgeschlagen"); reviewSubmitted = true; if (starts > 1) restartReviewed = true; return {}; }
      throw new Error(`Unexpected route: ${route}`);
    },
    loadData: async () => { loadStatuses.push(state.pipelineStatusSnapshot?.status); state.species = aborted ? [] : [species]; },
    showQuickConfirm: async (options) => { confirmations.push(options); return confirm; },
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
  return { state, calls, confirmations, loadStatuses, filters, form, get, close, headerClose, steps, map, sound, open, dialogOptions: () => dialogOptions, opened: () => opened,
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
    async finishSound() { await sound.emit("click", { target: { closest: (selector) => selector === "[data-new-species-sound-finish]" ? {} : null } }); },
    async upload(files, drop = false) {
      if (drop) await map.emit("drop", { target: { closest: () => ({}) }, dataTransfer: { files } });
      else await map.emit("change", { target: { matches: () => true, files } });
    },
  };
}

test("Neue Art ohne automatische Karte und Sound erreicht beide Schritte vor der Übertragung", async () => {
  const h = harness({ noReviewAssets: true }); await h.start();
  assert.equal(h.calls.find((c) => c.route === "/api/pipeline/start").body.guidedSpeciesCreation, true);
  assert.match(h.map.innerHTML, /type="file"/);
  assert.equal(h.calls.some((c) => c.route === "/api/pipeline/assets/review"), false);
  await h.upload([{ name: "map.jpg", size: 1234 }]); await h.mapAction("save");
  assert.equal(h.sound.hidden, false);
  assert.match(h.sound.innerHTML, /Sound-Schritt abschließen/);
  assert.equal(h.close.disabled, false);
  await h.finishSound();
  await settle(() => /erfolgreich angelegt/.test(h.get(".new-species-finish-message").textContent));
  assert.deepEqual(h.calls.find((c) => c.route === "/api/pipeline/assets/review").body, { runId: "run", choices: [] });
  assert.equal(h.calls.filter((c) => c.route.endsWith("/new/save")).length, 1);
});

test("Leere Art-Medienprüfung bleibt nach Schließen wieder aufnehmbar, ohne erneute Artanlage", async () => {
  const h = harness({ noReviewAssets: true, persistReview: true }); await h.start();
  await h.upload([{ name: "map.jpg", size: 1234 }]); await h.mapAction("save");
  await h.close.emit("click"); assert.equal(h.opened(), false);
  await h.open.emit("click");
  assert.equal(h.opened(), true);
  assert.equal(h.sound.hidden, false);
  assert.match(h.sound.innerHTML, /Sound-Schritt abschließen/);
  await h.finishSound();
  await settle(() => !h.get(".new-species-save-button").hidden);
  assert.equal(h.calls.filter((c) => c.route.endsWith("/new/save")).length, 1);
});

test("Eigene Artanlage abbrechen ist getrennt von Schließen und wartet ohne zweiten Klick sicher", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness({ ownedCreation: true, noReviewAssets: true, persistReview: true, pendingAborts: 1 });
  await h.start();
  const abort = h.get(".new-species-abort-button");
  assert.equal(abort.hidden, false);
  assert.equal(h.close.textContent, "Fenster schließen");
  await abort.emit("click");
  assert.equal(h.opened(), true);
  assert.equal(abort.disabled, true);
  assert.equal(h.close.disabled, true);
  assert.match(h.get(".new-species-finish-message").textContent, /automatisch zurückgenommen/);
  t.mock.timers.tick(1000);
  await settle(() => !h.opened());
  assert.deepEqual(h.calls.filter((call) => call.route === "/api/species/new/abort").map((call) => call.body),
    [{ creationId: "own-creation" }, { creationId: "own-creation" }]);
  assert.equal(h.calls.filter((call) => call.route === "/api/species/new/save").length, 1);
  assert.equal(h.state.species.length, 0);
  assert.match(h.state.notice, /keine Übertragung erforderlich/);
  t.mock.timers.reset();
});

test("Schließen hält eigenen Auftrag wiederaufnehmbar; Abbruch-Rückfrage lässt Anlage bestehen", async () => {
  const h = harness({ ownedCreation: true, noReviewAssets: true, persistReview: true, confirm: false });
  await h.start();
  await h.get(".new-species-abort-button").emit("click");
  assert.equal(h.calls.some((call) => call.route === "/api/species/new/abort"), false);
  await h.close.emit("click"); await h.open.emit("click");
  assert.equal(h.opened(), true);
  assert.equal(h.get(".new-species-abort-button").hidden, false);
  assert.equal(h.calls.filter((call) => call.route === "/api/species/new/save").length, 1);
  await h.close.emit("click");
});

test("Nach erfolgreicher Veröffentlichung öffnet Neue Art wieder das Formular für die nächste Anlage", async () => {
  const h = harness({ ownedCreation: true, finalPublished: true }); await h.start();
  await h.mapAction("skip"); await h.soundAction();
  await settle(() => !h.get(".new-species-save-button").hidden);
  assert.equal(h.get(".new-species-abort-button").hidden, true);
  await h.get(".new-species-save-button").emit("click");
  await h.open.emit("click");
  assert.equal(h.steps[0].hidden, false);
  assert.equal(h.get(".new-species-abort-button").hidden, true);
  assert.equal(h.get(".new-species-next-button").disabled, true);
  await h.form.emit("submit"); await h.get(".new-species-next-button").emit("click");
  await h.get(".new-species-portrait-skip-button").emit("click"); await h.get(".new-species-next-button").emit("click");
  await settle(() => h.calls.filter((call) => call.route.endsWith("/new/save")).length === 2 && !h.close.disabled);
  assert.equal(h.calls.filter((call) => call.route.endsWith("/new/save")).length, 2);
  await h.close.emit("click");
});

test("Auch ohne aktuelle Soundaufnahme ist die bestätigte Wiederholung im Assistenten erreichbar", async () => {
  for (const confirm of [true, false]) {
    const h = harness({ noReviewAssets: true, confirm }); await h.start(); await h.mapAction("skip");
    await h.get(".new-species-reset-sounds-button").emit("click");
    const request = h.calls.find((c) => c.route === "/api/pipeline/assets/review");
    assert.equal(Boolean(request), confirm);
    if (confirm) assert.deepEqual(request.body, { runId: "run", choices: [], retrySoundSearch: true, confirmed: true });
    assert.equal(h.calls.some((c) => c.route.includes("/rejections-")), false);
    assert.equal(h.calls.filter((c) => c.route.endsWith("/new/save")).length, 1);
  }
});

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
    assert.equal(h.close.hidden, true);
    assert.equal(h.headerClose.hidden, false);
    assert.equal(h.headerClose.disabled, false);
    assert.equal(h.get(".new-species-save-button").hidden, false);
    await h.get(".new-species-save-button").emit("click"); assert.equal(h.opened(), false);
    await h.open.emit("click");
    assert.equal(h.close.hidden, false);
    assert.equal(h.get(".new-species-save-button").hidden, true);
    await h.close.emit("click");
    assert.equal(h.calls.filter((c) => c.route.endsWith("/new/save")).length, 1);
    assert.equal(h.calls.some((c) => c.route.endsWith("/new/discard")), false);
  }
});

test("Neue Art: Browserangabe bleibt explizit und geänderte Pflegewahl verlangt neue Vorschau", async () => {
  const h = harness(); await h.start();
  assert.match(h.map.innerHTML, /Unveränderte IUCN-Karte aus dem Browser/);
  await h.upload([{ name: "T1A154496308.jpg", size: 1234 }]);
  assert.equal(h.calls.find((c) => c.route.endsWith("/assets/map/preview")).body.careMode, "manual");
  const mode = h.map.querySelector(".new-species-map-care-mode-input");
  mode.value = "iucn-browser";
  await h.map.emit("change", { target: {
    matches: (selector) => selector === ".new-species-map-care-mode-input",
  } });
  await h.mapAction("save");
  assert.equal(h.calls.some((c) => c.route.endsWith("/assets/map/save")), false);
  await h.mapAction("preview");
  assert.equal(h.calls.filter((c) => c.route.endsWith("/assets/map/preview")).at(-1).body.careMode, "iucn-browser");
  await h.mapAction("save");
  assert.equal(h.calls.find((c) => c.route.endsWith("/assets/map/save")).body.careMode, "iucn-browser");
});

test("Neue Art: Sound-Ablehnungen mit Rückfrage freigeben und nur Sounds erneut suchen, ohne doppelte Artanlage", async () => {
  const h = harness(); await h.start();
  await h.mapAction("skip"); await h.soundAction();
  await settle(() => !h.get(".new-species-save-button").hidden);
  const reset = h.get(".new-species-reset-sounds-button");
  assert.equal(reset.hidden, false);
  await reset.emit("click");
  await settle(() => !h.get(".new-species-save-button").hidden && !reset.disabled);
  const plans = h.calls.filter((c) => c.route === "/api/pipeline/preview");
  assert.deepEqual(plans[1].body, { mode: "nc-sounds", targetSlugs: ["perdixperdix"] });
  assert.equal(h.calls.filter((c) => c.route.endsWith("/new/save")).length, 1);
  assert.equal(h.calls.filter((c) => c.route.endsWith("/rejections-reset")).length, 1);
  assert.equal(h.close.hidden, true);
});

test("Lokal abgeschlossene eigene Art: Soundreset und geführte Wiedersuche behalten den abbrechbaren Auftrag", async () => {
  const h = harness({ ownedCreation: true, restartStatus: "awaiting-review" }); await h.start();
  await h.mapAction("skip"); await h.soundAction();
  await settle(() => !h.get(".new-species-save-button").hidden);
  await h.get(".new-species-reset-sounds-button").emit("click");
  await settle(() => h.state.pipelineStatusSnapshot?.status === "awaiting-review" && !h.sound.hidden);
  const reset = h.calls.find((c) => c.route.endsWith("/rejections-reset"));
  assert.equal(reset.body.creationId, "own-creation");
  const restart = h.calls.filter((c) => c.route === "/api/pipeline/start").at(-1);
  assert.deepEqual(restart.body, { token: "run-preview", creationId: "own-creation", guidedSpeciesCreation: true });
  assert.equal(h.calls.filter((c) => c.route.endsWith("/new/save")).length, 1);
  await h.get(".new-species-abort-button").emit("click");
  assert.equal(h.calls.find((c) => c.route.endsWith("/new/abort")).body.creationId, "own-creation");
  assert.deepEqual(h.state.species, []); assert.equal(h.state.pipelineStatusSnapshot.status, "aborted");
  assert.equal(h.opened(), false);
});

test("Veröffentlichte neue Art: Soundreset verwendet den normalen Medienlauf ohne historischen Abbruchauftrag", async () => {
  const h = harness({ ownedCreation: true, finalPublished: true }); await h.start();
  await h.mapAction("skip"); await h.soundAction();
  await settle(() => !h.get(".new-species-save-button").hidden);
  await h.get(".new-species-reset-sounds-button").emit("click");
  await settle(() => !h.get(".new-species-save-button").hidden);
  const reset = h.calls.find((c) => c.route.endsWith("/rejections-reset"));
  assert.equal(reset.body.creationId, undefined);
  const restart = h.calls.filter((c) => c.route === "/api/pipeline/start").at(-1);
  assert.deepEqual(restart.body, { token: "run-preview" });
});

test("Abbruch eines fehlgeschlagenen Auftrags lädt die Daten erst mit frischem aborted-Status neu", async () => {
  const h = harness({ status: "failed", ownedCreation: true }); await h.start();
  assert.equal(h.state.pipelineStatusSnapshot.status, "failed");
  const previousLoads = h.loadStatuses.length;
  await h.get(".new-species-abort-button").emit("click");
  assert.deepEqual(h.loadStatuses.slice(previousLoads), ["aborted"]);
  assert.equal(h.state.pipelineStatusSnapshot.status, "aborted");
  assert.equal(h.opened(), false);
});

test("Neue Art: frühere Sounds schon während der Prüfung freigeben; Abbruch und Fehler bleiben bedienbar", async () => {
  for (const options of [{}, { confirm: false }, { failReview: true }]) {
    const h = harness(options); await h.start(); await h.mapAction("skip");
    await settle(() => !h.sound.hidden);
    const reset = h.get(".new-species-reset-sounds-button");
    assert.equal(reset.hidden, false);
    assert.equal(reset.disabled, false);
    await reset.emit("click");
    assert.match(h.confirmations[0].message, /gerade angezeigte Sound wird.*abgelehnt/);
    const reviews = h.calls.filter((c) => c.route === "/api/pipeline/assets/review");
    assert.equal(h.calls.some((c) => c.route.includes("/rejections-")), false,
      "Die laufende Prüfung muss ihre Ausgangssicherung selbst berücksichtigen");
    assert.equal(h.calls.filter((c) => c.route.endsWith("/new/save")).length, 1);
    if (options.confirm === false) {
      assert.equal(reviews.length, 0);
      assert.equal(h.sound.hidden, false);
    } else {
      assert.deepEqual(reviews[0].body.choices, [{ safeName: "Rebhuhn", type: "sound", decision: "reject",
        manual: false, resetSoundRejections: true, reviewUrl: "/sound.mp3" }]);
      if (options.failReview) {
        assert.match(h.get(".new-species-finish-message").textContent, /Medienprüfung fehlgeschlagen/);
        assert.equal(reset.disabled, false);
        // A subsequent ordinary acceptance must not accidentally retain the reset request.
        await h.soundAction();
        await settle(() => h.calls.filter((c) => c.route === "/api/pipeline/assets/review").length === 2);
        const retry = h.calls.filter((c) => c.route === "/api/pipeline/assets/review")[1];
        assert.equal(retry.body.choices[0].resetSoundRejections, undefined);
      } else {
        await settle(() => !h.get(".new-species-save-button").hidden);
        assert.equal(h.close.hidden, true);
      }
    }
    await settle(() => !h.close.disabled);
    await h.close.emit("click");
    assert.equal(h.opened(), false);
    await h.open.emit("click");
    assert.equal(reset.hidden, true);
    assert.equal(h.get(".new-species-save-button").hidden, true);
  }
});

test("Neue Art: gesetzte Listenfilter und ausstehende Referenzprüfung blockieren Öffnen und Eingabe nicht", async () => {
  let resolveReference, initialized = false;
  const reference = new Promise((resolve) => { resolveReference = resolve; });
  const h = harness({ initializeReference: () => { initialized = true; return reference; } });
  for (const filter of Object.values(h.filters)) filter.value = "aktiver Filter";
  await h.open.emit("click");
  assert.equal(initialized, true);
  assert.equal(h.opened(), true);
  assert.equal(h.form.elements.german.focused, true);
  assert.equal(h.form.elements.german.disabled, false);
  h.form.elements.german.value = "Rotaugenlaubfrosch";
  await h.form.elements.german.emit("input");
  assert.equal(h.form.elements.german.value, "Rotaugenlaubfrosch");
  assert.equal(h.close.disabled, false);
  assert.equal(Object.values(h.filters).every((filter) => filter.value === "aktiver Filter"), true);
  await h.close.emit("click");
  assert.equal(h.opened(), false);
  resolveReference();
});

test("Neue Art: Sound-Rücksetzung abbrechen oder Fehler; Abschluss bleibt schließbar und wiederholbar", async () => {
  for (const options of [{ confirm: false }, { failReset: true }, { failRestart: true }]) {
    const h = harness(options); await h.start();
    await h.mapAction("skip"); await h.soundAction();
    await settle(() => !h.get(".new-species-save-button").hidden);
    await h.get(".new-species-reset-sounds-button").emit("click");
    assert.equal(h.get(".new-species-save-button").disabled, false);
    assert.equal(h.calls.filter((c) => c.route.endsWith("/new/save")).length, 1);
    if (options.confirm === false) assert.equal(h.calls.some((c) => c.route.endsWith("/rejections-reset")), false);
    if (options.failRestart) {
      assert.match(h.get(".new-species-finish-message").textContent, /Ablehnungen sind aufgehoben/);
      await h.get(".new-species-reset-sounds-button").emit("click");
      assert.equal(h.calls.filter((c) => c.route.endsWith("/rejections-reset")).length, 1);
      assert.equal(h.calls.filter((c) => c.route === "/api/pipeline/start").length, 3);
    }
    await h.get(".new-species-save-button").emit("click");
    assert.equal(h.opened(), false);
    assert.equal(h.state.newSpeciesPipelineActive, false);
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
