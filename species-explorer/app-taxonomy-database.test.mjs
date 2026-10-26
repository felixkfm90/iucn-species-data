import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-taxonomy-database.js", import.meta.url), "utf8");
const indexSource = await readFile(new URL("./public/index.html", import.meta.url), "utf8");
const styleSource = await readFile(new URL("./public/app.css", import.meta.url), "utf8");
const progressSource = await readFile(new URL("./public/app-taxonomy-progress.js", import.meta.url), "utf8");
const masterSource = await readFile(new URL("./public/app-taxonomy-master.js", import.meta.url), "utf8");
const referenceSource = await readFile(new URL("./public/app-taxonomy-reference.js", import.meta.url), "utf8");
const context = vm.createContext({ setTimeout() { return 1; }, clearTimeout() {} });
new vm.Script(progressSource).runInContext(context);
new vm.Script(masterSource).runInContext(context);
new vm.Script(source, { filename: "app-taxonomy-database.js" }).runInContext(context);
const database = context.SpeciesExplorerTaxonomyDatabase;

function nameChoiceUiFixture({ confirm = true, initialName = "Audit-Strandläufer" } = {}) {
  const timers = new Map(), nodes = new Map(), calls = [], gates = new Map();
  let nextTimer = 0, dialogOptions, confirmations = 0, dialogOpen = true;
  const documentRef = { body: { name: "BODY" }, documentElement: { name: "HTML" }, activeElement: null };
  documentRef.activeElement = documentRef.body;
  function node() {
    const listeners = {}, children = new Map(); let html = "", disabled = false;
    return { textContent: "", hidden: false, value: "", isConnected: true, ownerDocument: documentRef, focusCount: 0, classList: { toggle() {} },
      get disabled() { return disabled; },
      set disabled(value) { disabled = Boolean(value); if (disabled && documentRef.activeElement === this) documentRef.activeElement = documentRef.body; },
      get innerHTML() { return html; },
      set innerHTML(value) {
        for (const child of children.values()) { child.isConnected = false; if (documentRef.activeElement === child) documentRef.activeElement = documentRef.body; }
        children.clear();
        html = value;
        const choice = value.match(/<option value="([^"]*)" selected>/)?.[1];
        if (choice !== undefined) this.querySelector("[data-name-preference-choice]").value = choice;
        for (const name of ["taxonomyDatabaseGerman", "taxonomyDatabaseEnglish", "taxonomyDatabaseNote"]) {
          const fieldValue = value.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`))?.[1];
          if (fieldValue !== undefined) this.querySelector(`[name='${name}']`).value = fieldValue;
        }
      },
      querySelector(selector) { if (!children.has(selector)) children.set(selector, node()); return children.get(selector); },
      querySelectorAll: () => [], addEventListener(type, callback) { listeners[type] = callback; },
      emit(type, event = {}) { return listeners[type]?.(event); },
      focus() { if (!this.disabled && this.isConnected) { documentRef.activeElement = this; this.focusCount += 1; } }, scrollIntoView() {} };
  }
  const elements = new Proxy({}, { get(_, key) { if (!nodes.has(key)) nodes.set(key, node()); return nodes.get(key); } });
  const local = vm.createContext({ setTimeout(callback, delay) { const id = ++nextTimer; if (delay !== 15000) timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }, document: documentRef });
  for (const script of [progressSource, masterSource, referenceSource, source]) new vm.Script(script).runInContext(local);
  const names = { a: initialName, b: "Andere Prüfart" };
  const scientific = { a: "Calidris alpina", b: "Testus beta" };
  const detailFor = (id) => ({ masterTaxonId: `mtx_${id}`, scientific_name: scientific[id], rank: "species",
    preferredGermanName: names[id], germanNames: [{ name: names[id] }, { name: "Alpenstrandläufer" }],
    englishNames: [{ name: "English " + id }], hierarchy: [], supplement: { correction: true, namePreference: { previousGermanName: "Audit-Strandläufer" } } });
  const resultFor = (id) => ({ taxonId: id, masterTaxonId: `mtx_${id}`, scientificName: scientific[id], acceptedScientificName: scientific[id], rank: "species",
    germanName: names[id], englishName: "English " + id, hasVerifiedGermanName: true });
  const state = {};
  const controller = local.SpeciesExplorerTaxonomyDatabase.createTaxonomyDatabaseController({ state, elements, escapeHtml: String,
    taxonomyReference: local.SpeciesExplorerTaxonomyReference,
    createDialogController(options) { dialogOptions = options; return { isOpen: () => dialogOpen, open() { dialogOpen = true; }, close() { dialogOpen = false; options.afterClose(); } }; },
    showQuickConfirm: async () => {
      confirmations += 1; const previousFocus = documentRef.activeElement, confirmation = node(); confirmation.focus();
      const accepted = typeof confirm === "function" ? await confirm() : confirm;
      if (documentRef.activeElement === confirmation) {
        if (previousFocus?.isConnected && !previousFocus.disabled) previousFocus.focus();
        else documentRef.activeElement = documentRef.body;
      }
      return accepted;
    },
    fetchJson: async (url, options) => {
      const payload = options?.body ? JSON.parse(options.body) : null; calls.push({ url, payload });
      if (gates.has(url)) { const gate = gates.get(url); gates.delete(url); return gate.promise; }
      if (url.startsWith("/api/taxonomy/search?")) return { results: [resultFor("a"), resultFor("b")] };
      if (url.startsWith("/api/taxonomy/taxa/")) return detailFor(url.split("/").at(-1));
      if (url.endsWith("/name-preference/preview")) return { ...payload, requiresConfirmation: true, token: "bound-preview",
        previousGermanName: names.a, germanName: payload.useProviderStandard ? "Alpenstrandläufer" : payload.usePrevious ? "Audit-Strandläufer" : payload.germanName };
      if (url.endsWith("/name-preference/save")) { names[payload.masterTaxonId.slice(4)] = payload.germanName; return { saved: true }; }
      if (url.endsWith("/corrections/save")) { names.a = payload.germanName; return detailFor("a"); }
      if (url.endsWith("/corrections/reset")) { names.a = "Alpenstrandläufer"; return { saved: true }; }
      if (url.endsWith("/review")) return { total: 0, items: [] };
      return { status: "idle", active: false };
    } });
  controller.setup();
  const settle = () => new Promise(setImmediate);
  const click = async (selector, { correction, taxon, focus = true } = {}) => {
    const target = (taxon ? elements.taxonomyDatabaseResults : elements.taxonomyDatabaseDetail).querySelector(selector);
    target.dataset = { taxonomyDatabaseCorrection: correction, taxonomyDatabaseTaxon: taxon };
    target.closest = (query) => query === selector ? target : null;
    if (focus) target.focus();
    (taxon ? elements.taxonomyDatabaseResults : elements.taxonomyDatabaseDetail).emit("click", { target });
    await settle(); return target;
  };
  return { elements, calls, names, detailFor, settle, documentRef, confirmationCount: () => confirmations,
    async open() {
      dialogOpen = true;
      elements.taxonomyDatabaseSearch.value = "Calidris alpina";
      elements.taxonomyDatabaseSearch.emit("input");
      for (const [id, callback] of timers) { timers.delete(id); callback(); }
      await settle(); await click("[data-taxonomy-database-taxon]", { taxon: "a" });
    },
    choose: (value) => { elements.taxonomyDatabaseDetail.querySelector("[data-name-preference-choice]").value = value; },
    select: (taxon) => click("[data-taxonomy-database-taxon]", { taxon }),
    action: (kind, options) => click(`[data-name-preference-${kind}]`, options),
    correction: (action) => click("[data-taxonomy-database-correction]", { correction: action }),
    defer(url) { let resolve; const promise = new Promise(done => { resolve = done; }); gates.set(url, { promise }); return resolve; },
    close: () => { dialogOpen = false; dialogOptions.afterClose(); } };
}

for (const action of ["save", "previous", "provider"]) {
  test(`Namenswahl ${action} erneuert vorhandenen Treffer und Detail ohne neue Suche`, async () => {
    const f = nameChoiceUiFixture({ initialName: action === "previous" ? "Alpenstrandläufer" : "Audit-Strandläufer" }); await f.open();
    f.choose(action === "save" ? "Alpenstrandläufer" : f.names.a);
    await f.action(action);
    const expected = action === "previous" ? "Audit-Strandläufer" : "Alpenstrandläufer";
    assert.match(f.elements.taxonomyDatabaseDetail.innerHTML, new RegExp(`<strong>${expected}</strong>`));
    assert.match(f.elements.taxonomyDatabaseResults.innerHTML, new RegExp(`<strong>${expected}</strong>`));
    assert.match(f.elements.taxonomyDatabaseResults.innerHTML, /<strong>Andere Prüfart<\/strong>/);
    assert.equal(f.elements.taxonomyDatabaseSearch.value, "Calidris alpina");
    assert.equal(f.calls.filter(call => call.url.startsWith("/api/taxonomy/search?")).length, 1);
    assert.deepEqual(f.calls.filter(call => call.payload).map(call => call.url), [
      "/api/taxonomy/name-preference/preview", "/api/taxonomy/name-preference/save" ]);
    await f.select("a");
    assert.match(f.elements.taxonomyDatabaseDetail.innerHTML, new RegExp(`<strong>${expected}</strong>`));
  });
}

for (const action of ["save", "reset"]) {
  test(`Eigene Namenskorrektur ${action} erneuert denselben vorhandenen Treffer`, async () => {
    const f = nameChoiceUiFixture(); await f.open();
    f.elements.taxonomyDatabaseDetail.querySelector("[name='taxonomyDatabaseGerman']").value = "Korrigierter Strandläufer";
    await f.correction(action);
    const expected = action === "save" ? "Korrigierter Strandläufer" : "Alpenstrandläufer";
    assert.match(f.elements.taxonomyDatabaseDetail.innerHTML, new RegExp(`<strong>${expected}</strong>`));
    assert.match(f.elements.taxonomyDatabaseResults.innerHTML, new RegExp(`<strong>${expected}</strong>`));
    assert.equal(f.elements.taxonomyDatabaseSearch.value, "Calidris alpina");
    assert.equal(f.calls.filter(call => call.url.startsWith("/api/taxonomy/search?")).length, 1);
  });
}

test("Verspäteter Detailrefresh nach Namenswahl überschreibt weder neue Auswahl noch deren Meldung", async () => {
  const f = nameChoiceUiFixture(); await f.open(); f.choose("Alpenstrandläufer");
  const finish = f.defer("/api/taxonomy/taxa/a");
  await f.action("save"); await f.select("b");
  const detailBefore = f.elements.taxonomyDatabaseDetail.innerHTML, resultsBefore = f.elements.taxonomyDatabaseResults.innerHTML;
  const messageBefore = f.elements.taxonomyDatabaseMessage.textContent;
  finish(f.detailFor("a")); await f.settle();
  assert.equal(f.elements.taxonomyDatabaseDetail.innerHTML, detailBefore);
  assert.equal(f.elements.taxonomyDatabaseResults.innerHTML, resultsBefore);
  assert.equal(f.elements.taxonomyDatabaseMessage.textContent, messageBefore);
  f.choose("Alpenstrandläufer"); await f.action("save");
  assert.equal(f.calls.filter(call => call.url.endsWith("/name-preference/preview")).at(-1).payload.masterTaxonId, "mtx_b",
    "Auch der intern gespeicherte Detailzustand muss zur neuen Auswahl gehören");
});

for (const action of ["save", "reset"]) {
  test(`Verspätete eigene Korrektur ${action} lässt eine inzwischen andere Auswahl unverändert`, async () => {
    const f = nameChoiceUiFixture(); await f.open();
    f.elements.taxonomyDatabaseDetail.querySelector("[name='taxonomyDatabaseGerman']").value = "Späte Korrektur";
    const finish = f.defer(`/api/taxonomy/corrections/${action}`);
    await f.correction(action); await f.select("b");
    const detailBefore = f.elements.taxonomyDatabaseDetail.innerHTML, resultsBefore = f.elements.taxonomyDatabaseResults.innerHTML;
    const messageBefore = f.elements.taxonomyDatabaseMessage.textContent;
    finish(action === "save" ? f.detailFor("a") : { saved: true }); await f.settle();
    assert.equal(f.elements.taxonomyDatabaseDetail.innerHTML, detailBefore);
    assert.equal(f.elements.taxonomyDatabaseResults.innerHTML, resultsBefore);
    assert.equal(f.elements.taxonomyDatabaseMessage.textContent, messageBefore);
  });
}

test("Abgebrochener Anbieterstandard verändert weder Treffer noch Detail oder Suchlauf", async () => {
  const f = nameChoiceUiFixture({ confirm: false }); await f.open();
  const detailBefore = f.elements.taxonomyDatabaseDetail.innerHTML, resultsBefore = f.elements.taxonomyDatabaseResults.innerHTML;
  await f.action("provider");
  assert.equal(f.elements.taxonomyDatabaseDetail.innerHTML, detailBefore);
  assert.equal(f.elements.taxonomyDatabaseResults.innerHTML, resultsBefore);
  assert.equal(f.calls.filter(call => call.url.endsWith("/name-preference/save")).length, 0);
  assert.equal(f.calls.filter(call => call.url.startsWith("/api/taxonomy/search?")).length, 1);
});

test("Noch nicht aktivierte Namenswahl erneuert keine Treffer als angeblichen Erfolg", async () => {
  const f = nameChoiceUiFixture(); await f.open(); f.choose("Alpenstrandläufer");
  const finish = f.defer("/api/taxonomy/name-preference/save");
  const detailBefore = f.elements.taxonomyDatabaseDetail.innerHTML, resultsBefore = f.elements.taxonomyDatabaseResults.innerHTML;
  await f.action("save"); finish({ saved: false, pending: true, message: "Eigene Aktivierung noch offen" }); await f.settle();
  assert.equal(f.elements.taxonomyDatabaseDetail.innerHTML, detailBefore);
  assert.equal(f.elements.taxonomyDatabaseResults.innerHTML, resultsBefore);
  assert.equal(f.elements.taxonomyDatabaseMessage.textContent, "Eigene Aktivierung noch offen");
  assert.equal(f.calls.filter(call => call.url.startsWith("/api/taxonomy/taxa/")).length, 1);
});

test("Verspätetes Detail nach Korrekturrücksetzung erhält inzwischen gewählte Art", async () => {
  const f = nameChoiceUiFixture(); await f.open();
  const finish = f.defer("/api/taxonomy/taxa/a");
  await f.correction("reset"); await f.select("b");
  const detailBefore = f.elements.taxonomyDatabaseDetail.innerHTML, resultsBefore = f.elements.taxonomyDatabaseResults.innerHTML;
  const messageBefore = f.elements.taxonomyDatabaseMessage.textContent;
  finish(f.detailFor("a")); await f.settle();
  assert.equal(f.elements.taxonomyDatabaseDetail.innerHTML, detailBefore);
  assert.equal(f.elements.taxonomyDatabaseResults.innerHTML, resultsBefore);
  assert.equal(f.elements.taxonomyDatabaseMessage.textContent, messageBefore);
});

test("Schließen während offenem Namensrefresh lässt Dialog und Meldung geschlossen", async () => {
  const f = nameChoiceUiFixture(); await f.open(); f.choose("Alpenstrandläufer");
  const finish = f.defer("/api/taxonomy/taxa/a");
  await f.action("save"); f.close(); finish(f.detailFor("a")); await f.settle();
  assert.equal(f.elements.taxonomyDatabaseDetail.innerHTML, "");
  assert.equal(f.elements.taxonomyDatabaseResults.innerHTML, "");
  assert.equal(f.elements.taxonomyDatabaseMessage.textContent, "");
});

test("Normalanzeige benennt technischen Abschluss nur beim belegten passenden Paar ohne offene Arbeit", () => {
  const f = backgroundUiFixture();
  function currentMaster() {
    return { status: "idle", active: false,
      lifecycle: { active: { candidateId: "current", classificationDeferrals: { total: 187 } }, blockingConflictCount: 0 },
      reference: { status: "current", activeMatchesReference: true, needsMasterRebuild: false },
      lightroomPackage: { status: "current", masterVersion: "current", packageVersion: "current", needsRebuild: false } };
  }
  f.state.taxonomyMasterSnapshot = currentMaster();
  f.state.taxonomyMaintenanceSnapshot = { status: "idle", active: false, updateAvailable: false };
  f.state.renderTaxonomyDatabaseOverview();
  assert.equal(f.elements.taxonomyDatabaseOverviewSummary.textContent, "Datenbank aktuell");
  assert.match(f.elements.taxonomyDatabaseOverviewDetail.textContent, /Technisch abgeschlossen · keine offenen Entscheidungen/);
  assert.doesNotMatch(f.elements.taxonomyDatabaseOverviewDetail.textContent, /187|unklar|zurückgestellt/);
  for (const change of [
    (master) => { master.status = "building"; master.active = true; },
    (master) => { master.status = "failed"; master.error = "Paketprüfung fehlgeschlagen"; },
    (master) => { master.reference.needsMasterRebuild = true; master.reference.activeMatchesReference = false; },
    (master) => { master.reference.activeMatchesReference = undefined; },
    (master) => { master.lightroomPackage.packageVersion = "old"; },
    (master) => { master.corrections = { pending: true }; },
    (master) => { master.identities = { pending: true }; },
    (master) => { master.lifecycle.candidate = { candidateId: "new" }; },
    (master) => { master.lifecycle.blockingConflictCount = 1; },
    (master) => { master.updateWorkflow = { updateRunId: "running", status: "waiting-decisions" }; },
  ]) {
    const master = currentMaster(); change(master); f.state.taxonomyMasterSnapshot = master;
    f.state.renderTaxonomyDatabaseOverview();
    assert.doesNotMatch(f.elements.taxonomyDatabaseOverviewDetail.textContent, /Technisch abgeschlossen|keine offenen Entscheidungen/);
  }
  for (const reference of [
    { status: "failed", error: "Quelldownload fehlgeschlagen" },
    { status: "downloading", active: true }, { status: "idle", updateAvailable: true },
    { status: "idle", conflicts: { ambiguous: 1 } },
  ]) {
    f.state.taxonomyMasterSnapshot = currentMaster(); f.state.taxonomyMaintenanceSnapshot = reference;
    f.state.renderTaxonomyDatabaseOverview();
    assert.doesNotMatch(f.elements.taxonomyDatabaseOverviewDetail.textContent, /Technisch abgeschlossen|keine offenen Entscheidungen/);
  }
});

test("Historische Quellenhinweise stehen in neutralen zunächst eingeklappten Details außerhalb echter Konflikte", () => {
  assert.match(indexSource, /<div id="taxonomy-master-conflicts"[^>]*hidden><\/div>\s*<details id="taxonomy-master-technical-details" class="taxonomy-master-technical-details" hidden>/);
  assert.match(indexSource, /<summary>Technische Details zur Quellenübernahme<\/summary>/);
  assert.doesNotMatch(indexSource, /<details id="taxonomy-master-technical-details"[^>]*\bopen\b/);
  const neutralStyle = styleSource.match(/\.taxonomy-master-technical-details\s*\{([^}]+)\}/)?.[1];
  assert.match(neutralStyle, /border: 1px solid var\(--line\)/);
  assert.doesNotMatch(neutralStyle, /--amber|--red/);
});

test("Masteraufbau zeigt Zustände und bestätigte Blöcke getrennt; veraltete Läufe sind nicht fortsetzbar", () => {
  assert.equal(database.masterBuildPresentation().pending, false);
  for (const status of ["paused", "interrupted", "failed"]) {
    const view = database.masterBuildPresentation({ buildJob: { available: true, status, canResume: true,
      checkpoint: { written: 1500, total: 2000 } } });
    assert.equal(view.canResume, true);
    assert.equal(view.showResume, true);
    assert.equal(view.checkpoint, "Gesichert: 1.500 von 2.000 Artgruppen");
    assert.equal(view.showPause, false);
  }
  assert.equal(database.masterBuildPresentation({ buildJob: { available: true, status: "stale" } }).showResume, false);
  assert.equal(database.masterBuildPresentation({ buildJob: { available: true, status: "building", canPause: true } }).canPause, true);
  assert.equal(database.masterBuildPresentation({ buildJob: { available: true, status: "pausing" } }).canPause, false);
  assert.equal(database.masterBuildPresentation({ buildJob: { available: true, status: "ready" } }).pending, false);
  assert.match(indexSource, /<p id="taxonomy-database-build-progress" hidden><\/p>\s*<div class="taxonomy-controller-actions" hidden/,
    "Der sichtbare Fortschritt darf nicht innerhalb der versteckten alten Steuerung liegen");
  assert.match(styleSource, /\.taxonomy-database-actions > button\[hidden\]\s*\{\s*display: none !important;/);
});

test("Ein gestoppter Aufbau aktiviert niemals einen älteren noch vorhandenen Kandidaten", () => {
  for (const status of ["paused", "interrupted", "failed", "stale", "pausing"]) {
    assert.throws(() => database.assertBuildMayActivate({ status, lifecycle: { canActivate: true } }), { code: "MASTER_BUILD_STOPPED" });
    assert.throws(() => database.assertBuildMayActivate({ status: "idle", buildJob: { available: true, status },
      lifecycle: { canActivate: true } }), { code: "MASTER_BUILD_STOPPED" });
  }
  assert.doesNotThrow(() => database.assertBuildMayActivate({ status: "ready", buildJob: { available: true, status: "ready" } }));
});

test("Datenbankdialog teilt den Kopf-Fortschritt und kennzeichnet alte Bestandszahlen ausdrücklich", () => {
  const f = backgroundUiFixture();
  f.state.taxonomyMasterSnapshot = { status: "building", active: true, progressPhase: "Masterdatenbank schreiben",
    progressCurrent: 42, progressTotal: 100, progressPercent: 80,
    lifecycle: { active: { summary: { taxa: 273418 } } } };
  f.state.renderTaxonomyDatabaseOverview();
  const view = context.SpeciesExplorerTaxonomyProgress.taxonomyProgressPresentation({ master: f.state.taxonomyMasterSnapshot });
  assert.ok(f.elements.taxonomyDatabaseOverviewDetail.textContent.includes(view.detail));
  assert.match(f.elements.taxonomyDatabaseOverviewDetail.textContent, /Bisheriger aktiver Bestand: 273\.418 Taxa/);
  assert.doesNotMatch(f.elements.taxonomyDatabaseOverviewDetail.textContent, /80 %/);
});

test("Quellenfehler zeigt tatsächliche Ursache statt alter Mastermeldung und kennzeichnet unveränderten Bestand", () => {
  const f = backgroundUiFixture();
  f.state.taxonomyMaintenanceSnapshot = { status: "failed", active: false, phase: "download", action: "update",
    error: "ChecklistBank hat keine sichere Downloadweiterleitung geliefert (HTTP 404)." };
  f.state.taxonomyMasterSnapshot = { status: "idle", active: false, message: "Noch kein Master-Abgleich gestartet.",
    lifecycle: { active: { summary: { taxa: 273466 } } },
    buildJob: { available: true, status: "ready", progress: { phase: "Abschluss" } } };
  f.state.renderTaxonomyDatabaseOverview();
  const detail = f.elements.taxonomyDatabaseOverviewDetail.textContent;
  assert.match(detail, /Schritt 1 von 7.*Quelldownload.*fehlgeschlagen/);
  assert.match(detail, /Bisheriger aktiver Bestand: 273\.466 Taxa/);
  assert.match(detail, /HTTP 404/);
  assert.doesNotMatch(detail, /Master prüfen|Noch kein Master-Abgleich|\.\.$/);
  f.state.taxonomyMasterSnapshot.lifecycle.candidate = { summary: { taxa: 999999 } };
  f.state.renderTaxonomyDatabaseOverview();
  assert.match(f.elements.taxonomyDatabaseOverviewDetail.textContent, /Bisheriger aktiver Bestand: 273\.466 Taxa/);
  assert.doesNotMatch(f.elements.taxonomyDatabaseOverviewDetail.textContent, /999\.999|Geprüfter Kandidat/);
});

function backgroundUiFixture({ confirm = false, storagePlan = null, storageError = null,
  baseline = false, buildResult = null, activationResult = null, failBaselineRead = false, failBaselineStart = false,
  automaticPreview = null, followupBuild = null, automaticError = "" } = {}) {
  const nodes = new Map();
  function node() {
    const listeners = {}, children = new Map();
    return { textContent: "", hidden: false, disabled: false, value: "", classList: { toggle() {} },
      querySelector(selector) { if (!children.has(selector)) children.set(selector, node()); return children.get(selector); },
      querySelectorAll: () => [], addEventListener(type, callback) { listeners[type] = callback; },
      click() { listeners.click?.(); } };
  }
  const elements = new Proxy({}, { get(_, key) { if (!nodes.has(key)) nodes.set(key, node()); return nodes.get(key); } });
  let current = { status: "paused", active: false, lifecycle: { canActivate: false },
    buildJob: { available: true, status: "paused", canResume: true, checkpoint: { written: 500, total: 1000 } } };
  if (baseline) current = { status: "idle", active: false, lifecycle: { active: { candidateId: "old" } },
    baselineSetup: { needed: true, canStart: true, revision: "confirmed-stand" } };
  let masterReads = 0;
  const calls = [], messages = [], confirmations = [];
  const state = { taxonomyMasterSnapshot: current, setPipelineMessage: (text) => messages.push(text) };
  const controller = database.createTaxonomyDatabaseController({ state, elements, escapeHtml: String,
    taxonomyReference: {}, createDialogController: () => ({}), showQuickConfirm: async (options) => { confirmations.push(options); return confirm; },
    fetchJson: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/master/status") && ++masterReads > 1 && failBaselineRead) throw new Error("Status konnte nicht gelesen werden");
      if (url.endsWith("build-baseline")) {
        if (failBaselineStart) throw new Error("Bestätigter Stand ist veraltet");
        current = buildResult || { status: "ready", active: false,
          lifecycle: { active: { candidateId: "old" }, candidate: { candidateId: "new" }, canActivate: true } };
      }
      if (url.endsWith("/master/activate")) current = activationResult || { status: "ready", active: false,
        lifecycle: { active: { candidateId: "new" } }, baselineSetup: { needed: false, canStart: false } };
      if (url.endsWith("/classification/automatic-preview")) return automaticPreview;
      if (url.endsWith("/classification/automatic-save")) {
        if (automaticError) throw new Error(automaticError);
        return { saved: true };
      }
      if (url.endsWith("/master/build")) current = followupBuild;
      if (url.endsWith("storage-preview")) return storagePlan;
      if (url.endsWith("storage-clean")) {
        if (storageError) throw new Error(storageError);
        return { removed: storagePlan.items.filter((item) => item.eligible), failed: [], freedBytes: 42 };
      }
      if (url.endsWith("resume-build")) current = { ...current, status: "paused", message: "Erneut pausiert" };
      if (url.includes("/master/")) return current;
      return {};
    } });
  controller.setup();
  return { controller, elements, calls, messages, confirmations, state };
}

test("Gesamtübersicht ersetzt die alte CoL-Lesemeldung nach Auswahlende und erhält Quellen-/Fehlervorrang", () => {
  const f = backgroundUiFixture();
  const callsBeforeRender = f.calls.length;
  const master = { status: "building", active: true, action: "build", progressPhase: "CoL-Referenz",
    progressCurrent: 273470, progressTotal: 273470, message: "Relevante CoL-Taxa werden gelesen." };
  f.state.taxonomyMasterSnapshot = master;
  f.state.taxonomyMaintenanceSnapshot = {};
  f.state.renderTaxonomyDatabaseOverview();
  const detail = f.elements.taxonomyDatabaseOverviewDetail.textContent;
  assert.match(detail, /CoL-Auswahl gelesen\. Eingänge werden weiter vorbereitet und geprüft\./);
  assert.equal(detail.match(/CoL-Auswahl gelesen/g).length, 1, "Den neutralen Hinweis nicht doppelt ausgeben");
  assert.doesNotMatch(detail, /werden gelesen|100 %|abgeschlossen/);
  assert.equal(f.calls.length, callsBeforeRender, "Die Anzeige löst keine weitere API-Aktion aus");
  f.state.taxonomyMaintenanceSnapshot = { active: true, phase: "download", progressCurrent: 1, progressTotal: 4 };
  f.state.renderTaxonomyDatabaseOverview();
  assert.match(f.elements.taxonomyDatabaseOverviewDetail.textContent, /Quelldownload.*25 %/);
  assert.doesNotMatch(f.elements.taxonomyDatabaseOverviewDetail.textContent, /CoL-Auswahl gelesen/);
  f.state.taxonomyMaintenanceSnapshot = {};
  f.state.taxonomyMasterSnapshot = { ...master, error: "Masterprüfung fehlgeschlagen" };
  f.state.renderTaxonomyDatabaseOverview();
  assert.match(f.elements.taxonomyDatabaseOverviewDetail.textContent, /Masterprüfung fehlgeschlagen/);
  assert.doesNotMatch(f.elements.taxonomyDatabaseOverviewDetail.textContent, /CoL-Auswahl gelesen/);
});

test("bestätigter Updateweg verarbeitet unbenutzte Fälle vor genau einem lokalen Folgeaufbau; geschützte Fälle und veraltete Nutzung stoppen", async () => {
  const blocking = { status: "ready", lifecycle: { candidate: { candidateId: "first", classificationReview: { total: 4 } },
    canActivate: false, blockingConflictCount: 4 } };
  for (const mode of ["unknown", "changed", "protected", "ready"]) {
    const protectedCase = { status: "ready", lifecycle: { candidate: { candidateId: "fresh", classificationReview: { total: 1 } }, canActivate: false, blockingConflictCount: 1 } };
    const f = backgroundUiFixture({ baseline: true, confirm: true, buildResult: blocking,
      automaticPreview: mode === "unknown" ? { available: false } : { available: true, token: "bound", candidateId: "first", usageRevision: "usage", matching: 2, deferred: 1 },
      automaticError: mode === "changed" ? "Nutzung veraltet" : "",
      followupBuild: mode === "protected" ? protectedCase : { status: "ready", lifecycle: { candidate: { candidateId: "fresh" }, canActivate: true, blockingConflictCount: 0 } } });
    await new Promise(setImmediate);
    assert.equal(f.calls.some((call) => call.url.includes("classification/")), false);
    f.elements.taxonomyDatabaseBaselineButton.click();
    for (let i = 0; i < 30 && f.state.taxonomyDatabaseBusy; i++) await new Promise(setImmediate);
    assert.equal(f.state.taxonomyDatabaseBusy, false);
    const builds = f.calls.filter((call) => call.url.endsWith("/master/build"));
    assert.equal(builds.length, ["protected", "ready"].includes(mode) ? 1 : 0);
    if (builds.length) assert.deepEqual(JSON.parse(builds[0].options.body), { refreshProviders: false });
    assert.equal(f.calls.filter((call) => call.url.endsWith("/automatic-preview")).length, 1);
    assert.equal(f.calls.some((call) => call.url.endsWith("/activate")), mode === "ready");
    assert.ok(f.calls.every((call) => !call.url.endsWith("/update/start")), "Kein zusätzlicher Download");
  }
});

test("Speicherpflege läuft nur auf Klick; Abbruch löscht nichts, Übernahme verlangt die konkrete Vorschau", async () => {
  const storagePlan = { revision: "current-preview", managedBytes: 100, freeBytes: 200, reclaimableBytes: 42, warnings: [],
    items: [{ kind: "pair", id: "publication-example", bytes: 42, eligible: true }] };
  for (const confirm of [false, true]) {
    const f = backgroundUiFixture({ confirm, storagePlan });
    await new Promise(setImmediate);
    assert.equal(f.calls.some((call) => call.url.includes("storage-")), false);
    f.elements.taxonomyDatabaseStorageButton.click();
    await new Promise(setImmediate);
    const calls = f.calls.filter((call) => call.url.includes("storage-"));
    assert.equal(calls.length, confirm ? 2 : 1);
    assert.match(f.confirmations[0].message, /publication-example/);
    assert.match(f.confirmations[0].message, /dauerhaft entfernt/);
    assert.match(f.confirmations[0].message, /ein geprüfter Vorgänger/);
    if (confirm) assert.deepEqual(JSON.parse(calls[1].options.body), { confirmed: true, revision: "current-preview" });
    assert.equal(f.elements.taxonomyDatabaseStorageButton.disabled, false);
    assert.equal(f.state.taxonomyDatabaseBusy, false);
  }
});

test("Einmaliger Grundlagenlauf: keine Startaktion beim Öffnen, ausdrückliche Rückfrage und ausschließlich lokaler Baupfad", async () => {
  for (const confirm of [false, true]) {
    const f = backgroundUiFixture({ baseline: true, confirm });
    await new Promise(setImmediate);
    const button = f.elements.taxonomyDatabaseBaselineButton;
    assert.equal(button.hidden, false); assert.equal(button.disabled, false);
    assert.equal(f.calls.some((call) => call.options?.method === "POST"), false);
    button.click(); button.click(); // zweite Betätigung während laufender Bestätigung ignorieren
    for (let i = 0; i < 10 && f.state.taxonomyDatabaseBusy; i += 1) await new Promise(setImmediate);
    assert.equal(f.state.taxonomyDatabaseBusy, false);
    assert.equal(f.confirmations.length, 1);
    assert.match(f.confirmations[0].message, /keine neuen Anbieterstände heruntergeladen/);
    assert.match(f.confirmations[0].message, /erste Lauf kann länger dauern/);
    const writes = f.calls.filter((call) => call.options?.method === "POST");
    assert.deepEqual(writes.map((call) => call.url), confirm
      ? ["/api/taxonomy/master/build-baseline", "/api/taxonomy/master/activate"] : []);
    if (confirm) {
      assert.deepEqual(JSON.parse(writes[0].options.body), { confirmed: true, revision: "confirmed-stand" });
      assert.equal(button.hidden, true);
      assert.ok(f.messages.some((message) => message.includes("gemeinsam übernommen")));
    } else assert.equal(button.disabled, false);
  }
});

test("Grundlagenlauf: Lesefehler, veraltete Bestätigung, Pause und Konflikte aktivieren nichts; Paketfehler ist kein Erfolg", async () => {
  const scenarios = [
    { failBaselineRead: true, expected: /Status konnte nicht gelesen werden/ },
    { failBaselineStart: true, expected: /Stand ist veraltet/ },
    ...["paused", "interrupted", "failed"].map((status) => ({ buildResult: { status, message: "Aufbau gestoppt",
      lifecycle: { canActivate: true } }, expected: /Aufbau gestoppt/ })),
    { buildResult: { status: "ready", lifecycle: { blockingConflictCount: 1, canActivate: false } }, expected: /konflikt/i },
    { activationResult: { status: "partial", error: "Paketprüfung fehlgeschlagen" }, expected: /Paketprüfung/ },
  ];
  for (const scenario of scenarios) {
    const f = backgroundUiFixture({ baseline: true, confirm: true, ...scenario });
    await new Promise(setImmediate);
    f.elements.taxonomyDatabaseBaselineButton.click();
    for (let i = 0; i < 10 && f.state.taxonomyDatabaseBusy; i += 1) await new Promise(setImmediate);
    assert.equal(f.state.taxonomyDatabaseBusy, false);
    assert.ok(f.messages.some((message) => scenario.expected.test(message)), JSON.stringify(f.messages));
    assert.equal(f.messages.some((message) => message.includes("gemeinsam übernommen")), false);
    if (!scenario.activationResult) assert.equal(f.calls.some((call) => call.url.endsWith("/activate")), false);
    if (scenario.failBaselineRead) assert.equal(f.calls.some((call) => call.options?.method === "POST"), false);
    assert.equal(f.elements.taxonomyDatabaseUpdateButton.disabled, false);
  }
});

test("Leerer Bereinigungsplan und veraltete Vorschau geben die Oberfläche ohne verdeckten Folgelauf frei", async () => {
  const empty = backgroundUiFixture({ confirm: true, storagePlan: { items: [], warnings: ["Kein Backup"], freeBytes: 0 } });
  empty.elements.taxonomyDatabaseStorageButton.click();
  await new Promise(setImmediate);
  assert.equal(empty.confirmations.length, 0);
  assert.ok(empty.messages.some((message) => message.includes("Kein Backup")));
  const stale = backgroundUiFixture({ confirm: true, storagePlan: { revision: "stale", items: [{ eligible: true, id: "old", kind: "job" }] }, storageError: "Vorschau veraltet" });
  stale.elements.taxonomyDatabaseStorageButton.click();
  await new Promise(setImmediate);
  assert.ok(stale.messages.includes("Vorschau veraltet"));
  assert.equal(stale.state.taxonomyDatabaseBusy, false);
  assert.equal(stale.elements.taxonomyDatabaseStorageButton.disabled, false);
});

test("Explorer öffnet nur den Status; Fortsetzen benötigt Bestätigung und Pause verhindert automatische Aktivierung", async () => {
  const canceled = backgroundUiFixture();
  await new Promise(setImmediate);
  assert.equal(canceled.calls.some((call) => call.options?.method === "POST"), false);
  assert.equal(canceled.elements.taxonomyDatabaseResumeButton.hidden, false);
  assert.equal(canceled.elements.taxonomyDatabaseResumeButton.disabled, false);
  canceled.elements.taxonomyDatabaseResumeButton.click();
  await new Promise(setImmediate);
  assert.equal(canceled.calls.some((call) => call.options?.method === "POST"), false);
  const confirmed = backgroundUiFixture({ confirm: true });
  await new Promise(setImmediate);
  confirmed.elements.taxonomyDatabaseResumeButton.click();
  await new Promise(setImmediate);
  const writes = confirmed.calls.filter((call) => call.options?.method === "POST");
  assert.deepEqual(writes.map((call) => call.url), ["/api/taxonomy/master/resume-build"]);
  assert.equal(JSON.parse(writes[0].options.body).confirmed, true);
  assert.ok(confirmed.messages.includes("Erneut pausiert"));
  assert.equal(confirmed.elements.taxonomyDatabaseResumeButton.disabled, false);
});

test("Vorgemerkte Identitäten benötigen auch ohne neue Downloads einen passenden Kandidaten", () => {
  for (const hasCandidate of [false, true]) {
    assert.equal(database.taxonomyDatabaseUpdateDecision({ hasCandidate, identitiesPending: true }), "rebuild-master");
  }
  assert.equal(database.taxonomyDatabaseUpdateDecision({ hasCandidate: true, identitiesPending: true,
    candidateIncludesIdentities: true }), "activate");
  assert.equal(database.taxonomyDatabaseUpdateDecision({ hasCandidate: true, identitiesPending: true,
    candidateIncludesIdentities: true, correctionsPending: true }), "rebuild-master");
});

test("Taxonomiedatenbank berücksichtigt Quellen, eigene Korrekturen und Suchpaketstand", () => {
  assert.equal(database.taxonomyDatabaseUpdateDecision(), "current");
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({ hasWork: false }),
    "current",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({ hasWork: true }),
    "refresh-and-build",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({ hasCandidate: true, hasWork: false }),
    "activate",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({ lightroomPackageNeedsRebuild: true }),
    "sync-lightroom",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({ correctionsPending: true }),
    "apply-corrections",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({
      hasCandidate: true,
      correctionsPending: true,
      candidateIncludesCorrections: false,
    }),
    "build-corrections",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({
      hasCandidate: true,
      correctionsPending: true,
      candidateIncludesCorrections: true,
    }),
    "activate",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({
      hasCandidate: true,
      lightroomPackageNeedsRebuild: true,
    }),
    "activate",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({ referenceNeedsMasterRebuild: true }),
    "rebuild-master",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({
      hasCandidate: true,
      candidateMatchesReference: false,
      referenceNeedsMasterRebuild: true,
    }),
    "rebuild-master",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({
      hasCandidate: true,
      candidateMatchesReference: true,
      referenceNeedsMasterRebuild: true,
    }),
    "activate",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({
      correctionsPending: true,
      referenceNeedsMasterRebuild: true,
    }),
    "rebuild-master",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({
      lightroomPackageNeedsRebuild: true,
      referenceNeedsMasterRebuild: true,
    }),
    "rebuild-master",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({
      hasCandidate: true,
      candidateMatchesReference: false,
    }),
    "rebuild-master",
  );
  assert.equal(
    database.taxonomyDatabaseUpdateDecision({
      hasCandidate: true,
      referenceComparisonError: true,
    }),
    "reference-error",
  );
  assert.match(
    source,
    /decision === "rebuild-master"[\s\S]*?refreshProviders: false/,
    "Ein bereits aktivierter Referenzstand muss ohne erneuten Quellen-Download in den Master übernommen werden",
  );
});

test("Lightroom-Korrekturanfrage verlangt identische Master-ID und wissenschaftlichen Namen", () => {
  const results = [
    { taxonId: "mtx_richtig", scientificName: "Macroglossum stellatarum" },
    { taxonId: "mtx_anders", scientificName: "Macroglossum stellatarum" },
  ];
  assert.deepEqual(database.lightroomCorrectionResult({
    masterTaxonId: "mtx_richtig",
    acceptedScientificName: "Macroglossum stellatarum",
  }, results), results[0]);
  assert.equal(database.lightroomCorrectionResult({
    masterTaxonId: "mtx_falsch",
    acceptedScientificName: "Macroglossum stellatarum",
  }, results), null);
  assert.equal(database.lightroomCorrectionResult({
    masterTaxonId: "mtx_richtig",
    acceptedScientificName: "Macroglossum andere",
  }, results), null);
});

test("Datenbankdetails unterscheiden Suchtreffer und bevorzugten deutschen Namen", () => {
  const result = database.taxonomyDatabaseDetailPresentation(
    () => ({
      germanName: "Weißstorch",
      preferredGermanName: "Weissstorch",
      germanNameChoices: ["Weißstorch", "Weissstorch", "Hausstorch"],
      displayName: "Weißstorch",
      usesEnglishFallback: false,
      nameToApply: "Weißstorch",
    }),
    {},
    {},
  );
  assert.equal(result.germanName, "Weissstorch");
  assert.equal(result.displayName, "Weissstorch");
  assert.equal(result.germanNameChoices[0], "Weissstorch");
  assert.deepEqual([...result.germanNameChoices], ["Weissstorch", "Weißstorch", "Hausstorch"]);
});

test("Leeres oder einzeichenlanges Suchfeld startet keinen Suchlauf", () => {
  assert.equal(database.shouldScheduleTaxonomyDatabaseSearch(""), false);
  assert.equal(database.shouldScheduleTaxonomyDatabaseSearch(" W "), false);
  assert.equal(database.shouldScheduleTaxonomyDatabaseSearch("We"), true);
});

test("Datenbankaktion benennt Suche und Namenskorrektur eindeutig", () => {
  assert.match(indexSource, /In Datenbank suchen und Namen korrigieren/);
  assert.doesNotMatch(indexSource, /Datenbank ansehen und korrigieren/);
});

test("Aktuell bevorzugter Name ist ohne erneute Änderung nicht speicherbar", () => {
  assert.match(source, /data-name-preference-save disabled/);
  assert.match(source, /event\.target\.value\) === cleanText\(view\.preferredGermanName\)/);
  assert.match(source, /data-name-preference-previous \$\{view\.previousGermanName \? "" : "disabled"\}/);
});

test("Korrekturaktualisierung schließt den Dialog vor dem sichtbaren Datenbanklauf", () => {
  assert.match(source, /dialogController\.close\("update-database"\)/);
  assert.match(source, /setTimeout\(\(\) => void updateDatabase\(\), 0\)/);
});

function savedUpdateFixture({ workflow = { available: true, status: "idle", updateRunId: "" },
  confirmations: answers = [true, false], startStatus = "waiting-lightroom", canRequestClose = true,
  queuedClose = false, previewError = "", previewHasWork = true, restartPreviewError = "", restartAvailable = true,
  masterChanges = {}, referenceChanges = {}, restartPreviewChanges = {},
  buildStatus = workflow.phase === "build" && ["failed", "interrupted"].includes(workflow.status) ? "failed" : "ready" } = {}) {
  const timers = new Map(), nodes = new Map(), calls = [], messages = [], confirmations = [];
  let timerId = 0;
  const sandbox = vm.createContext({ setTimeout(callback, delay) { ++timerId; if (delay !== 15000) timers.set(timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); } });
  new vm.Script(progressSource).runInContext(sandbox);
  new vm.Script(masterSource).runInContext(sandbox);
  new vm.Script(source).runInContext(sandbox);
  function node() {
    const listeners = {}, children = new Map();
    return { textContent: "", hidden: false, disabled: false, value: "", classList: { toggle() {} },
      querySelector(selector) { if (!children.has(selector)) children.set(selector, node()); return children.get(selector); },
      querySelectorAll: () => [], addEventListener(type, callback) { listeners[type] = callback; },
      click() { listeners.click?.(); } };
  }
  const elements = new Proxy({}, { get(_, key) { if (!nodes.has(key)) nodes.set(key, node()); return nodes.get(key); } });
  let currentWorkflow = { ...workflow };
  const master = { status: "completed", active: false, completedAt: "2026-10-01T12:00:00Z",
    lifecycle: { active: { candidateId: "previous-master", summary: { taxa: 273466 } } },
    lightroomPackage: { status: "current" }, buildJob: { available: true, status: buildStatus, progress: { phase: "Abschluss" } }, ...masterChanges };
  const reference = { status: "idle", active: false, updateAvailable: true,
    latest: { version: "COL26.9 XR", issued: "2026-09-25" }, ...referenceChanges };
  const state = { taxonomyMasterSnapshot: { ...master, updateWorkflow: currentWorkflow },
    taxonomyMaintenanceSnapshot: reference, setPipelineMessage: (message) => messages.push(message) };
  const controller = sandbox.SpeciesExplorerTaxonomyDatabase.createTaxonomyDatabaseController({ state, elements,
    escapeHtml: String, taxonomyReference: {}, createDialogController: () => ({}), formatBytes: () => "12 GB",
    showQuickConfirm: async (options) => { confirmations.push(options); return answers[confirmations.length - 1] ?? false; },
    fetchJson: async (url, options) => {
      calls.push({ url, options });
      if (url === "/api/taxonomy/master/status") return { ...master, updateWorkflow: { ...currentWorkflow } };
      if (url === "/api/taxonomy/status") return reference;
      if (url.endsWith("/update/preview")) {
        if (previewError) throw new Error(previewError);
        return { hasWork: previewHasWork, token: "fresh-source-plan", updateCatalogue: true, latest: reference.latest };
      }
      if (url.endsWith("sequence-start")) {
        currentWorkflow = { available: true, updateRunId: "new-saved-update", status: startStatus,
          phase: "start", active: true, message: "Auftrag wartet auf geschlossenes Lightroom und aktuellen FN-Nutzungsnachweis." };
        return currentWorkflow;
      }
      if (url.endsWith("sequence-resume")) {
        currentWorkflow = { ...currentWorkflow, status: "waiting-lightroom", active: true, error: "", message: "Gespeicherter Auftrag wartet weiter." };
        return currentWorkflow;
      }
      if (url.endsWith("sequence-restart-preview")) {
        if (restartPreviewError) throw new Error(restartPreviewError);
        return { available: restartAvailable, token: "fresh-local-restart", updateRunId: workflow.updateRunId,
          buildJobId: "old-build-job", buildJobRevision: "old-recipe-revision", catalogSetRevision: "catalog-set", catalogCount: 1, ...restartPreviewChanges };
      }
      if (url.endsWith("sequence-restart-build")) {
        currentWorkflow = { available: true, updateRunId: "new-local-update", status: startStatus, phase: "start", active: true,
          message: "Neuer lokaler Auftrag wartet auf frische FN-Erfassung." };
        return currentWorkflow;
      }
      if (url.endsWith("sequence-pause")) {
        currentWorkflow = { ...currentWorkflow, status: "paused", active: false, message: "Gespeicherter Auftrag pausiert." };
        return currentWorkflow;
      }
      if (url.endsWith("sequence-status")) return currentWorkflow;
      if (url.endsWith("lightroom-status")) return { canRequestClose };
      if (url.endsWith("lightroom-close")) return { queued: queuedClose };
      return {};
    } });
  controller.setup();
  return { state, elements, calls, messages, confirmations, timers,
    setWorkflow(value) { currentWorkflow = { ...currentWorkflow, ...value }; },
    async poll() { const [id, callback] = timers.entries().next().value || []; if (!callback) return;
      timers.delete(id); await callback(); },
  };
}

const postedActions = (f) => f.calls.filter((call) => call.options?.method === "POST" && !call.url.endsWith("/update/preview"));

const waitingUsageRestartWorkflow = () => ({ available: true, updateRunId: "own-update", status: "waiting-usage", phase: "resume-build",
  active: true, freshUsageCapture: true, decision: "rebuild-master", sourceCompleted: true, buildStarted: true,
  baseline: { masterVersion: "previous-master" }, boundCandidate: null, message: "Aktueller FN-Nachweis erforderlich." });
const waitingUsageRestartMaster = (status = "failed") => ({ status, active: false, error: "Eigener Aufbau fehlgeschlagen",
  buildJob: { available: true, id: "old-build-job", updateRunId: "own-update", status, canResume: status === "failed" },
  lifecycle: { active: { candidateId: "previous-master" }, candidate: { candidateId: "historical-candidate", buildJobRevision: "historical-recipe" } } });

test("eigener fehlgeschlagener FN-Warteauftrag bietet geschützte Neustartvorschau; Abbrechen schreibt keinen Ersatzauftrag", async () => {
  for (const status of ["failed", "stale"]) {
    const f = savedUpdateFixture({ workflow: waitingUsageRestartWorkflow(), masterChanges: waitingUsageRestartMaster(status), confirmations: [false] });
    await new Promise(setImmediate);
    assert.equal(f.elements.taxonomyDatabaseUpdateButton.disabled, false);
    assert.equal(f.elements.taxonomyDatabaseUpdateButton.querySelector("strong").textContent, "Neu lokal aufbauen");
    assert.match(f.elements.taxonomyDatabaseOverviewDetail.textContent, /Vorschau.*Kandidaten/);
    assert.match(f.elements.taxonomyDatabaseOverviewDetail.textContent, /bisherige.*aktiv/);
    assert.match(f.elements.taxonomyDatabaseOverviewDetail.textContent, /alte.*Aufbau.*nicht.*fortgesetzt/);
    const before = JSON.stringify(f.state.taxonomyMasterSnapshot);
    await f.state.updateTaxonomyDatabase();
    assert.deepEqual(postedActions(f).map((call) => call.url), ["/api/taxonomy/update/sequence-restart-preview"]);
    assert.equal(f.confirmations.length, 1);
    assert.equal(JSON.stringify(f.state.taxonomyMasterSnapshot), before);
  }
});

test("Bestätigung des eigenen FN-Warte-Neustarts verwendet den Vorschautoken, keinen alten Resume", async () => {
  const f = savedUpdateFixture({ workflow: waitingUsageRestartWorkflow(), masterChanges: waitingUsageRestartMaster(), confirmations: [true, false] });
  await new Promise(setImmediate); await f.state.updateTaxonomyDatabase();
  assert.deepEqual(postedActions(f).map((call) => call.url), ["/api/taxonomy/update/sequence-restart-preview", "/api/taxonomy/update/sequence-restart-build"]);
  assert.deepEqual(JSON.parse(postedActions(f)[1].options.body), { confirmed: true, token: "fresh-local-restart", updateRunId: "own-update",
    buildJobId: "old-build-job", buildJobRevision: "old-recipe-revision", usageConsent: { allCatalogsConfirmed: true, noChangesUntilClose: true } });
});

test("FN-Warte-Neustart bleibt bei fremdem Auftrag, aktiven Arbeitern und unvollständiger Bindung gesperrt", async () => {
  const workflow = waitingUsageRestartWorkflow(), master = waitingUsageRestartMaster();
  const cases = [
    { masterChanges: { ...master, active: true } },
    { masterChanges: { ...master, buildJob: { ...master.buildJob, updateRunId: "foreign-update" } } },
    { masterChanges: { ...master, buildJob: { ...master.buildJob, status: "building" } } },
    { masterChanges: { ...master, buildJob: { ...master.buildJob, status: "paused" } } },
    { masterChanges: { ...master, buildJob: { ...master.buildJob, available: false } } },
    { masterChanges: { ...master, lifecycle: { ...master.lifecycle, error: "Manifest fehlt" } } },
    { workflow: { ...workflow, freshUsageCapture: false } }, { workflow: { ...workflow, buildStarted: false } },
    { workflow: { ...workflow, sourceCompleted: false } }, { workflow: { ...workflow, phase: "start" } },
    { workflow: { ...workflow, baseline: { masterVersion: "foreign-master" } } },
    { workflow: { ...workflow, boundCandidate: { candidateId: "already-bound" } } },
    { referenceChanges: { active: true } }, { referenceChanges: { error: "Quellenfehler" } },
  ];
  for (const changes of cases) {
    const f = savedUpdateFixture({ workflow, masterChanges: master, ...changes });
    await new Promise(setImmediate);
    assert.equal(f.elements.taxonomyDatabaseUpdateButton.disabled, true, JSON.stringify(changes));
    await f.state.updateTaxonomyDatabase();
    assert.deepEqual(postedActions(f), [], JSON.stringify(changes));
    assert.equal(f.confirmations.length, 0);
  }
});

test("verweigerte Kandidatenprüfung des FN-Warte-Neustarts bietet keine Bestätigung und erhält den Auftrag", async () => {
  const f = savedUpdateFixture({ workflow: waitingUsageRestartWorkflow(), masterChanges: waitingUsageRestartMaster(), restartPreviewError: "Kandidat gehört zu einem fremden Aufbau" });
  await new Promise(setImmediate); const before = JSON.stringify(f.state.taxonomyMasterSnapshot);
  await f.state.updateTaxonomyDatabase();
  assert.deepEqual(postedActions(f).map((call) => call.url), ["/api/taxonomy/update/sequence-restart-preview"]);
  assert.equal(f.confirmations.length, 0); assert.equal(JSON.stringify(f.state.taxonomyMasterSnapshot), before);
  assert.match(f.messages.at(-1), /Kandidat gehört zu einem fremden Aufbau/);
});

test("FN-Warte-Neustart verlangt Vorschau zum eigenen aktuellen Job und eine vollständige Bestätigungsvorlage", async () => {
  for (const restartPreviewChanges of [{ available: false }, { token: "" }, { updateRunId: "foreign-update" },
    { buildJobId: "foreign-build" }, { buildJobRevision: "" }]) {
    const f = savedUpdateFixture({ workflow: waitingUsageRestartWorkflow(), masterChanges: waitingUsageRestartMaster(), restartPreviewChanges });
    await new Promise(setImmediate); await f.state.updateTaxonomyDatabase();
    assert.deepEqual(postedActions(f).map((call) => call.url), ["/api/taxonomy/update/sequence-restart-preview"]);
    assert.equal(f.confirmations.length, 0); assert.match(f.messages.at(-1), /Keine sichere lokale Neustartvorschau/);
  }
});

test("Ersatzauftrag erklärt den erhaltenen alten Kandidaten in der Übersicht; Rohstatus und andere Entscheidungen bleiben erhalten", async () => {
  const retained = { candidateId: "historical-candidate", buildJobRevision: "a".repeat(64), buildJobId: "historical-build",
    updateRunId: "old-update", manifestSha256: "b".repeat(64), recipeSha256: "c".repeat(64), stateSha256: "d".repeat(64) };
  const workflow = { available: true, updateRunId: "new-update", status: "waiting-usage", phase: "start", active: true,
    freshUsageCapture: true, sourceCompleted: true, buildStarted: false, decision: "rebuild-master",
    restartGuard: { identity: { updateRunId: "old-update", buildJobId: "old-build" }, binding: { retainedCandidate: retained } } };
  const f = savedUpdateFixture({ workflow, masterChanges: { status: "failed", error: "Alter Buildfehler",
    buildJob: { available: true, id: "old-build", updateRunId: "old-update", status: "failed", error: "Alter Buildfehler" },
    lifecycle: { active: { candidateId: "active-master", summary: { taxa: 273480 } },
      candidate: { candidateId: retained.candidateId, buildJobRevision: retained.buildJobRevision, classificationReview: { total: 187 } },
      blockingConflictCount: 189, canActivate: false } } });
  await new Promise(setImmediate);
  const before = JSON.stringify(f.state.taxonomyMasterSnapshot), calls = f.calls.length;
  f.state.renderTaxonomyDatabaseOverview();
  assert.match(f.elements.taxonomyDatabaseOverviewDetail.textContent, /Erhaltener Kandidat gehört zum vorherigen Auftrag/);
  assert.match(f.elements.taxonomyDatabaseOverviewDetail.textContent, /2 Aktualisierungskonflikt.*benötigen eine Entscheidung/);
  assert.doesNotMatch(f.elements.taxonomyDatabaseOverviewDetail.textContent, /187 Aktualisierungskonflikt|Alter Buildfehler|Geprüfter Kandidat/);
  assert.equal(JSON.stringify(f.state.taxonomyMasterSnapshot), before); assert.equal(f.calls.length, calls);
  assert.throws(() => database.assertBuildMayActivate(f.state.taxonomyMasterSnapshot), { code: "MASTER_BUILD_STOPPED" });
});

test("laufender eigener Folgeaufbau verlangt keine erneute Entscheidung für den gebundenen alten Kandidaten", async () => {
  const workflow = { available: true, updateRunId: "own-update", status: "building", phase: "build", active: true,
    buildStarted: true, automaticFollowupRevision: "saved-decision", automaticAttemptedCandidates: ["first-candidate"], error: "" };
  const f = savedUpdateFixture({ workflow, buildStatus: "building" });
  await new Promise(setImmediate);
  f.state.taxonomyMaintenanceSnapshot = {};
  const master = { ...f.state.taxonomyMasterSnapshot, status: "building", active: true, error: "", updateWorkflow: workflow,
    progressPhase: "Masterdatenbank schreiben", progressCurrent: 10, progressTotal: 100,
    buildJob: { available: true, id: "followup-build", updateRunId: "own-update", status: "building", canPause: true },
    lifecycle: { active: { candidateId: "active-master", summary: { taxa: 273480 } },
      candidate: { candidateId: "first-candidate", classificationReview: { total: 187 } }, blockingConflictCount: 187, canActivate: false },
    identities: { revision: "saved-decision", pending: true, candidateIncludesCurrent: false, classificationCandidateId: "first-candidate" } };
  f.state.taxonomyMasterSnapshot = master;
  const before = JSON.stringify(master), calls = f.calls.length;
  f.state.renderTaxonomyDatabaseOverview();
  const detail = f.elements.taxonomyDatabaseOverviewDetail.textContent;
  assert.match(detail, /187 Klassifikationsfälle gehören zum vorherigen Kandidaten/);
  assert.match(detail, /Der laufende Folgeaufbau verarbeitet die gespeicherte Entscheidung/);
  assert.doesNotMatch(detail, /187 Aktualisierungskonflikt.*benötigen eine Entscheidung/);
  assert.equal(JSON.stringify(master), before);
  assert.equal(f.calls.length, calls);
  assert.throws(() => database.assertBuildMayActivate(master), { code: "MASTER_BUILD_STOPPED" });
  for (const changes of [
    { identities: { ...master.identities, revision: "changed-revision" } },
    { identities: { ...master.identities, candidateIncludesCurrent: true } },
    { identities: { ...master.identities, classificationCandidateId: "different-candidate" } },
    { updateWorkflow: { ...workflow, automaticAttemptedCandidates: ["another-candidate"] } },
    { buildJob: { ...master.buildJob, updateRunId: "foreign-update" } },
    { lifecycle: { ...master.lifecycle, candidate: { ...master.lifecycle.candidate, candidateId: "new-undecided-candidate" } } },
    { error: "Eigener Schreibfehler" },
  ]) {
    f.state.taxonomyMasterSnapshot = { ...master, ...changes };
    f.state.renderTaxonomyDatabaseOverview();
    const current = f.elements.taxonomyDatabaseOverviewDetail.textContent;
    assert.match(current, /187 Aktualisierungskonflikt.*benötigen eine Entscheidung/, JSON.stringify(changes));
    assert.doesNotMatch(current, /Klassifikationsfälle gehören zum vorherigen Kandidaten/);
    if (changes.error) assert.match(current, /Eigener Schreibfehler/);
  }
  f.state.taxonomyMasterSnapshot = { ...master, lifecycle: { ...master.lifecycle, blockingConflictCount: 189 } };
  f.state.renderTaxonomyDatabaseOverview();
  assert.match(f.elements.taxonomyDatabaseOverviewDetail.textContent, /187 Klassifikationsfälle gehören zum vorherigen Kandidaten/);
  assert.match(f.elements.taxonomyDatabaseOverviewDetail.textContent, /2 Aktualisierungskonflikt.*benötigen eine Entscheidung/);
});

test("eigener lokaler Ersatzauftrag blendet Altfehler und Altcheckpoint aus und bezeichnet die Auftragspause passend", async () => {
  for (const [status, phase] of [["waiting-lightroom", "start"], ["waiting-usage", "start"], ["building", "build"]]) {
    const workflow = { available: true, updateRunId: "new-update", status, phase, active: true, freshUsageCapture: true,
      decision: "rebuild-master", sourceCompleted: true, buildStarted: phase === "build",
      restartGuard: { identity: { updateRunId: "old-update", buildJobId: "old-build" } },
      message: phase === "build" ? "Lokale Eingänge werden vorbereitet" : "Neue FN-Erfassung läuft", error: "" };
    const f = savedUpdateFixture({ workflow, buildStatus: "failed" });
    await new Promise(setImmediate);
    f.state.taxonomyMaintenanceSnapshot = {};
    const master = { ...f.state.taxonomyMasterSnapshot, status: "failed", active: false, error: "Alter Quellenbelegfehler",
      message: "Alter Masteraufbau fehlgeschlagen", updateWorkflow: workflow,
      buildJob: { available: true, id: "old-build", updateRunId: "old-update", status: "failed", error: "Alter Quellenbelegfehler",
        checkpoint: { written: 500, total: 1000 }, progress: { phase: "Masterdatenbank schreiben", current: 750, total: 1000 } } };
    f.state.taxonomyMasterSnapshot = master;
    const before = JSON.stringify(master), calls = f.calls.length;
    f.state.renderTaxonomyDatabaseOverview();
    const detail = f.elements.taxonomyDatabaseOverviewDetail.textContent;
    assert.match(detail, phase === "build" ? /Lokale Eingänge werden vorbereitet/ : /Neue FN-Erfassung läuft/);
    assert.doesNotMatch(detail, /fehlgeschlagen|Schritt 3|Alter Quellenbelegfehler|750|500|Fortsetzen prüft/);
    assert.equal(f.elements.taxonomyDatabaseBuildProgress.hidden, true);
    assert.equal(f.elements.taxonomyDatabaseBuildProgress.textContent, "");
    assert.equal(f.elements.taxonomyDatabaseResumeButton.hidden, true);
    if (phase === "start") {
      assert.equal(f.elements.taxonomyDatabasePauseButton.hidden, false);
      assert.equal(f.elements.taxonomyDatabasePauseButton.querySelector("strong").textContent, "Updateauftrag pausieren");
    }
    assert.equal(JSON.stringify(master), before);
    assert.equal(f.calls.length, calls, "Rendern sendet keine neue Betriebsaktion");
    assert.throws(() => database.assertBuildMayActivate(master), { code: "MASTER_BUILD_STOPPED" }, "Der Anzeigefix lockert keine Aktivierungsprüfung");
    f.state.taxonomyMasterSnapshot = { ...master, updateWorkflow: { ...workflow, status: "failed", active: false, error: "Neue Eingänge verändert" } };
    f.state.renderTaxonomyDatabaseOverview();
    assert.match(f.elements.taxonomyDatabaseOverviewDetail.textContent, /Neue Eingänge verändert/);
    assert.doesNotMatch(f.elements.taxonomyDatabaseOverviewDetail.textContent, /Alter Quellenbelegfehler/);
    f.state.taxonomyMasterSnapshot = master;
    f.state.taxonomyMaintenanceSnapshot = { status: "failed", error: "Aktueller Quellenfehler HTTP 404" };
    f.state.renderTaxonomyDatabaseOverview();
    assert.match(f.elements.taxonomyDatabaseOverviewDetail.textContent, /Aktueller Quellenfehler HTTP 404/);
  }
});

test("eigener pausierter Schreibstand nach dem Ersatzrezept behält Checkpoint und Master-Pausenbezeichnung", async () => {
  const workflow = { available: true, updateRunId: "new-update", status: "building", active: true, phase: "build",
    freshUsageCapture: true, decision: "rebuild-master", sourceCompleted: true, buildStarted: true,
    restartGuard: { identity: { updateRunId: "old-update", buildJobId: "old-build" } } };
  const f = savedUpdateFixture({ workflow, buildStatus: "building" });
  await new Promise(setImmediate);
  f.state.taxonomyMasterSnapshot.buildJob = { available: true, id: "own-build", updateRunId: "new-update", status: "building", canPause: true };
  f.state.renderTaxonomyDatabaseOverview();
  assert.equal(f.elements.taxonomyDatabasePauseButton.querySelector("strong").textContent, "Masteraufbau pausieren");
  f.state.taxonomyMasterSnapshot.buildJob = { ...f.state.taxonomyMasterSnapshot.buildJob, status: "paused", canPause: false,
    checkpoint: { written: 500, total: 1000 } };
  f.state.taxonomyMasterSnapshot.updateWorkflow = { ...workflow, status: "paused", active: false };
  f.state.renderTaxonomyDatabaseOverview();
  assert.equal(f.elements.taxonomyDatabaseBuildProgress.hidden, false);
  assert.match(f.elements.taxonomyDatabaseBuildProgress.textContent, /Gesichert: 500 von 1\.000/);
  assert.equal(f.elements.taxonomyDatabaseResumeButton.hidden, false);
});

test("gespeicherter fehlgeschlagener Aufbau zeigt einen eindeutigen Neuaufbauweg und seinen alten Fehler einmal", async () => {
  const cause = "Die Klassifikationsentscheidung hat keinen unveränderten, eindeutigen Quellenbeleg mit gleicher Anbieter-ID.";
  for (const replacement of [false, true]) {
    const workflow = { available: true, updateRunId: "failed-update", status: "failed", phase: replacement ? "start" : "build",
      sourceCompleted: true, buildStarted: !replacement, message: "Die Aktualisierung wurde sicher angehalten.",
      error: `Masteraufbau fehlgeschlagen. ${cause}`,
      ...(replacement ? { freshUsageCapture: true, decision: "rebuild-master", restartGuard: { originWorkflowRevision: "original-history" } } : {}) };
    const f = savedUpdateFixture({ workflow, buildStatus: "failed", confirmations: [false] });
    await new Promise(setImmediate);
    f.state.taxonomyMasterSnapshot.error = cause;
    f.state.taxonomyMasterSnapshot.message = "Masteraufbau fehlgeschlagen.";
    const before = f.calls.length;
    f.state.renderTaxonomyDatabaseOverview();
    assert.match(f.elements.taxonomyDatabaseOverviewSummary.textContent, /Letzter Aufbau fehlgeschlagen/);
    assert.match(f.elements.taxonomyDatabaseOverviewDetail.textContent, /Neustart des Programms startet keinen Aufbau/);
    assert.match(f.elements.taxonomyDatabaseOverviewDetail.textContent, /bisherige Datenbankstand bleibt aktiv/);
    assert.equal(f.elements.taxonomyDatabaseOverviewDetail.textContent.split(cause).length - 1, 1);
    assert.equal(f.elements.taxonomyDatabaseResumeButton.hidden, true);
    assert.equal(f.elements.taxonomyDatabaseBuildProgress.hidden, true);
    assert.equal(f.elements.taxonomyDatabaseUpdateButton.querySelector("strong").textContent, "Mit lokalen Daten neu aufbauen");
    assert.equal(f.calls.length, before, "Die Erklärung startet nichts und verändert den Auftrag nicht");
    await f.state.updateTaxonomyDatabase();
    assert.equal(f.calls.filter((call) => call.url.endsWith("sequence-restart-preview")).length, 1);
    assert.equal(f.calls.some((call) => /sequence-(resume|restart-build)$/.test(call.url)), false);
    assert.equal(f.elements.taxonomyDatabaseResumeButton.hidden, true);
  }
});

test("aktueller Quellenfehler bleibt neben einem historischen fehlgeschlagenen Aufbau sichtbar", async () => {
  const f = savedUpdateFixture({ workflow: { available: true, updateRunId: "failed-update", status: "failed", phase: "build",
    sourceCompleted: true, buildStarted: true, error: "Alter Masterfehler" }, buildStatus: "failed" });
  await new Promise(setImmediate);
  f.state.taxonomyMasterSnapshot.error = "Alter Masterfehler";
  f.state.taxonomyMaintenanceSnapshot = { status: "failed", active: false, phase: "download", action: "update",
    error: "ChecklistBank Download fehlgeschlagen (HTTP 404)." };
  f.state.renderTaxonomyDatabaseOverview();
  assert.match(f.elements.taxonomyDatabaseOverviewDetail.textContent, /HTTP 404/);
  assert.equal(f.elements.taxonomyDatabaseOverviewDetail.textContent.split("ChecklistBank Download fehlgeschlagen (HTTP 404).").length - 1, 1);
  assert.doesNotMatch(f.elements.taxonomyDatabaseOverviewSummary.textContent, /Neuaufbau erforderlich/);
});

test("pausierter passender Schreibstand behält seine Fortsetzung und den bestätigten Fortschritt", async () => {
  const f = savedUpdateFixture({ workflow: { available: true, updateRunId: "paused-update", status: "paused", phase: "build",
    sourceCompleted: true, buildStarted: true }, buildStatus: "paused" });
  await new Promise(setImmediate);
  f.state.taxonomyMasterSnapshot.buildJob.checkpoint = { written: 500, total: 1000 };
  f.state.renderTaxonomyDatabaseOverview();
  assert.equal(f.elements.taxonomyDatabaseResumeButton.hidden, false);
  assert.equal(f.elements.taxonomyDatabaseBuildProgress.hidden, false);
  assert.match(f.elements.taxonomyDatabaseBuildProgress.textContent, /Gesichert: 500 von 1\.000/);
  assert.doesNotMatch(f.elements.taxonomyDatabaseOverviewSummary.textContent, /Neuaufbau erforderlich/);
});

test("fehlgeschlagener eigener Aufbau verlangt gebundene lokale Neustartvorschau und ausdrückliche neue FN-Zustimmung", async () => {
  for (const confirm of [false, true]) {
    const f = savedUpdateFixture({ workflow: { available: true, updateRunId: "old-update", status: "failed", phase: "build",
      sourceCompleted: true, buildStarted: true }, confirmations: [confirm, false] });
    await new Promise(setImmediate);
    await f.state.updateTaxonomyDatabase();
    assert.equal(f.calls.some((call) => call.url.endsWith("sequence-resume")), false);
    assert.equal(f.calls.some((call) => call.url.endsWith("/update/preview")), false);
    assert.equal(f.calls.filter((call) => call.url.endsWith("sequence-restart-preview")).length, 1);
    const starts = f.calls.filter((call) => call.url.endsWith("sequence-restart-build"));
    assert.equal(starts.length, confirm ? 1 : 0);
    assert.equal(f.confirmations[0].title, "Neu mit lokalen Daten aufbauen?");
    assert.ok(f.confirmations[0].message.length < 450);
    if (confirm) assert.deepEqual(JSON.parse(starts[0].options.body), { confirmed: true, token: "fresh-local-restart",
      updateRunId: "old-update", buildJobId: "old-build-job", buildJobRevision: "old-recipe-revision",
      usageConsent: { allCatalogsConfirmed: true, noChangesUntilClose: true } });
  }
});

test("fehlende oder abgelehnte Neustartvorschau löst keinen lokalen Aufbau oder Ersatz-Resume aus", async () => {
  for (const options of [{ restartPreviewError: "Fremder Auftrag" }, { restartAvailable: false }]) {
    const f = savedUpdateFixture({ workflow: { available: true, updateRunId: "old-update", status: "failed", phase: "build",
      sourceCompleted: true, buildStarted: true }, confirmations: [true], ...options });
    await new Promise(setImmediate);
    await f.state.updateTaxonomyDatabase();
    assert.equal(f.confirmations.length, 0);
    assert.equal(f.calls.some((call) => /sequence-(resume|restart-build)$/.test(call.url)), false);
  }
});

test("unterbrochener pausierter Checkpoint behält den gezielten Resumeweg ohne Ersatzauftrag", async () => {
  const f = savedUpdateFixture({ workflow: { available: true, updateRunId: "old-update", status: "interrupted", phase: "build",
    sourceCompleted: true, buildStarted: true }, buildStatus: "paused" });
  await new Promise(setImmediate);
  await f.state.updateTaxonomyDatabase();
  assert.equal(f.calls.filter((call) => call.url.endsWith("sequence-resume")).length, 1);
  assert.equal(f.calls.some((call) => /sequence-restart/.test(call.url)), false);
});

test("vor Aufbau fehlgeschlagener Ersatzauftrag bietet wieder eine neue gebundene Vorschau statt denselben veralteten Guard", async () => {
  const f = savedUpdateFixture({ workflow: { available: true, updateRunId: "failed-replacement", status: "failed", phase: "start",
    decision: "rebuild-master", freshUsageCapture: true, sourceCompleted: true, buildStarted: false,
    restartGuard: { originWorkflowRevision: "original-history" } }, buildStatus: "failed", confirmations: [true, false] });
  await new Promise(setImmediate);
  await f.state.updateTaxonomyDatabase();
  assert.equal(f.calls.filter((call) => call.url.endsWith("sequence-restart-preview")).length, 1);
  const start = f.calls.find((call) => call.url.endsWith("sequence-restart-build"));
  assert.equal(JSON.parse(start.options.body).updateRunId, "failed-replacement");
  assert.equal(f.calls.some((call) => call.url.endsWith("sequence-resume")), false);
});

test("Gespeicherter Gesamtstart: ein Start und eine Nutzungsvereinbarung; selbst schließen bricht nicht ab", async () => {
  const f = savedUpdateFixture();
  await new Promise(setImmediate);
  await Promise.all([f.state.updateTaxonomyDatabase({ startup: true }), f.state.updateTaxonomyDatabase({ startup: true })]);
  assert.deepEqual(postedActions(f).map((call) => call.url), ["/api/taxonomy/update/sequence-start"]);
  const payload = JSON.parse(postedActions(f)[0].options.body);
  assert.equal(payload.confirmed, true);
  assert.equal(payload.token, "fresh-source-plan");
  assert.deepEqual(payload.usageConsent, { allCatalogsConfirmed: true, noChangesUntilClose: true });
  assert.match(f.confirmations[0].message, /Mit „Jetzt aktualisieren“ bestätigst du: Die gespeicherte FN-Katalogliste ist vollständig/);
  assert.match(f.confirmations[0].message, /FN-Nutzung wird auf Aktualität geprüft; die Statistik allein genügt nicht/);
  assert.match(f.confirmations[0].message, /Bei Bedarf wird sie neu erfasst/);
  assert.ok(f.confirmations[0].message.split(/\s+/).length <= 120, "Der Handlungsdialog bleibt kurz und enthält die Einwilligung direkt");
  assert.match(f.confirmations[0].message, /keine FN-Zuweisungen, Fotoimporte oder Katalogwechsel/);
  assert.equal(f.confirmations[1].cancelLabel, "Ich schließe Lightroom selbst");
  assert.equal(f.elements.taxonomyDatabasePauseButton.hidden, false);
  assert.equal(f.elements.taxonomyDatabasePauseButton.disabled, false);
  f.setWorkflow({ status: "building", phase: "build", message: "Der lokale Master wird aufgebaut." });
  await f.poll();
  assert.equal(postedActions(f).length, 1, "Schließung und Statusbeobachtung starten den Auftrag nicht erneut");
  assert.equal(f.state.taxonomyMasterSnapshot.updateWorkflow.status, "building");
  assert.equal(f.messages.some((message) => /erfolgreich aktualisiert|gemeinsam aktuell/.test(message)), false);
});

test("Später schreibt keinen Updateauftrag und beendet keine Anwendung", async () => {
  const f = savedUpdateFixture({ confirmations: [false] });
  await new Promise(setImmediate);
  await f.state.updateTaxonomyDatabase({ startup: true });
  assert.equal(f.confirmations[0].cancelLabel, "Später");
  assert.deepEqual(postedActions(f), []);
  assert.equal(f.calls.filter((call) => call.url.endsWith("/update/preview")).length, 1);
  assert.match(f.messages.at(-1), /später/);
});

test("Normales Lightroom-Schließen braucht eigenen ausdrücklichen Klick; vorgemerkte Schließung bleibt Warten", async () => {
  for (const [canRequestClose, startStatus] of [[false, "waiting-lightroom"], [true, "waiting-lightroom"], [true, "waiting-usage"]]) {
    const f = savedUpdateFixture({ confirmations: [true, true], canRequestClose, queuedClose: true, startStatus });
    await new Promise(setImmediate);
    await f.state.updateTaxonomyDatabase();
    const closes = postedActions(f).filter((call) => call.url.endsWith("lightroom-close"));
    assert.equal(closes.length, canRequestClose ? 1 : 0);
    assert.equal(f.confirmations.length, canRequestClose ? 2 : 1);
    if (canRequestClose) {
      assert.deepEqual(JSON.parse(closes[0].options.body), { confirmed: true });
      assert.ok(f.messages.some((message) => /Nach der FN-Prüfung.*Schließen von Lightroom angefordert/.test(message)));
    }
    assert.equal(f.state.taxonomyMasterSnapshot.updateWorkflow.status, startStatus);
    assert.equal(f.messages.some((message) => /Nutzung.*abgeschlossen|erfolgreich aktualisiert/.test(message)), false);
  }
});

test("Wiederöffnen wartet lesend auf denselben Auftrag; Pause ist auch vor dem Masteraufbau erreichbar", async () => {
  for (const status of ["waiting-lightroom", "waiting-usage"]) {
    const f = savedUpdateFixture({ workflow: { available: true, updateRunId: "already-confirmed", status, phase: "start", active: true,
      message: "Aktueller FN-Nutzungsnachweis wird noch benötigt." } });
    await new Promise(setImmediate);
    await f.poll();
    await f.state.updateTaxonomyDatabase();
    assert.deepEqual(postedActions(f), []);
    assert.equal(f.confirmations.length, 0);
    assert.equal(f.elements.taxonomyDatabasePauseButton.hidden, false);
    assert.equal(f.elements.taxonomyDatabasePauseButton.disabled, false);
    f.elements.taxonomyDatabasePauseButton.click();
    await new Promise(setImmediate);
    assert.deepEqual(postedActions(f).map((call) => call.url), ["/api/taxonomy/update/sequence-pause"]);
    assert.equal(f.state.taxonomyMasterSnapshot.updateWorkflow.updateRunId, "already-confirmed");
    assert.equal(f.elements.taxonomyDatabaseResumeButton.hidden, false);
    assert.equal(f.elements.taxonomyDatabaseResumeButton.disabled, false);
  }
});

test("Quellenwiederanlauf verlangt frische Gesamtvorschau und neue Bestätigung statt sequence-resume", async () => {
  for (const status of ["failed", "interrupted"]) {
    for (const confirm of [false, true]) {
      const f = savedUpdateFixture({ confirmations: [confirm, false], workflow: { available: true, updateRunId: "old-update",
        phase: "sources", status, active: false, error: "Ergänzungsprüfung unvollständig" } });
      await new Promise(setImmediate);
      await f.state.updateTaxonomyDatabase({ startup: true, sourcePreview: { hasWork: true, token: "stale-plan" } });
      assert.equal(f.calls.filter((call) => call.url.endsWith("/update/preview")).length, 1);
      assert.equal(f.calls.some((call) => call.url.endsWith("sequence-resume")), false);
      assert.equal(postedActions(f).filter((call) => call.url.endsWith("sequence-start")).length, confirm ? 1 : 0);
      assert.match(f.confirmations[0].message, /Quellenprüfung.*Master und Lightroom/);
      if (confirm) assert.equal(JSON.parse(postedActions(f)[0].options.body).token, "fresh-source-plan");
      assert.equal(f.calls.some((call) => /\/master\/(build|activate)$|\/update\/start$/.test(call.url)), false);
    }
  }
});

test("Fehlende frische Quellenvorschau startet nichts; andere eigene Checkpoints werden gezielt fortgesetzt", async () => {
  const failed = savedUpdateFixture({ previewError: "Quelle nicht erreichbar", workflow: { available: true,
    updateRunId: "old-source", status: "failed", phase: "sources", active: false } });
  await new Promise(setImmediate);
  await failed.state.updateTaxonomyDatabase();
  assert.deepEqual(postedActions(failed), []);
  assert.equal(failed.confirmations.length, 0);
  assert.ok(failed.messages.includes("Quelle nicht erreichbar"));
  const noPlan = savedUpdateFixture({ previewHasWork: false, workflow: { available: true,
    updateRunId: "old-source", status: "interrupted", phase: "sources", active: false } });
  await new Promise(setImmediate);
  await noPlan.state.updateTaxonomyDatabase();
  assert.deepEqual(postedActions(noPlan), []);
  assert.equal(noPlan.confirmations.length, 0);
  assert.match(noPlan.messages.at(-1), /Gesamtabschluss ist nicht bestätigt/);
  for (const phase of ["start", "build", "candidate", "package", "activation"]) {
    const f = savedUpdateFixture({ workflow: { available: true, updateRunId: "own-checkpoint", status: "interrupted", phase, active: false } });
    await new Promise(setImmediate);
    await f.state.updateTaxonomyDatabase();
    assert.deepEqual(postedActions(f).map((call) => call.url), ["/api/taxonomy/update/sequence-resume"]);
    assert.deepEqual(JSON.parse(postedActions(f)[0].options.body), { confirmed: true });
    assert.equal(f.calls.some((call) => call.url.endsWith("/update/preview")), false);
    assert.equal(f.confirmations.length, 0, "Die ursprüngliche Gesamtbestätigung wird nicht als neuer Start dupliziert");
  }
});

// Fake DOM focus transitions below reproduce the independently observed disabled-trigger return hole.
// They are behavior tests of the real controller, not a native browser or screenreader acceptance.
for (const action of ["save", "previous", "provider"]) {
  test("Abgebrochene Namenswahl " + action + " gibt Tastaturfokus an ihren wieder aktiven Auslöser zurück", async () => {
    const f = nameChoiceUiFixture({ confirm: false }); await f.open(); f.choose("Alpenstrandläufer");
    const button = await f.action(action);
    assert.equal(button.disabled, false); assert.equal(f.documentRef.activeElement, button);
    assert.equal(f.calls.filter(call => call.url.endsWith("/name-preference/save")).length, 0);
  });
}
test("Abgebrochene Namenswahl überstimmt keinen inzwischen anderen Eingabefokus", async () => {
  const f = nameChoiceUiFixture({ confirm: false }); await f.open(); const finish = f.defer("/api/taxonomy/name-preference/preview");
  await f.action("provider"); f.elements.taxonomyDatabaseSearch.focus();
  finish({ requiresConfirmation: true, previousGermanName: "Audit", germanName: "Alpenstrandläufer", token: "preview" }); await f.settle();
  assert.equal(f.documentRef.activeElement, f.elements.taxonomyDatabaseSearch);
});
test("Programmatisch gestartete Namenswahl nimmt nach Abbruch keinen fremden Fokusbesitz an", async () => {
  let f; f = nameChoiceUiFixture({ confirm: async () => { f.documentRef.activeElement = f.documentRef.body; return false; } });
  await f.open(); f.elements.taxonomyDatabaseSearch.focus(); const button = await f.action("provider", { focus: false });
  assert.equal(f.documentRef.activeElement, f.documentRef.body); assert.equal(button.focusCount, 0);
});
for (const changed of ["selection", "choice", "closed", "reopened"]) {
  test("Verspätete Namensvorschau öffnet nach " + changed + " keine Bestätigung und verschiebt keinen Fokus", async () => {
    const f = nameChoiceUiFixture({ confirm: false }); await f.open(); const finish = f.defer("/api/taxonomy/name-preference/preview");
    await f.action("provider");
    if (changed === "selection") await f.select("b");
    if (changed === "choice") f.choose("Andere Auswahl");
    if (changed === "closed" || changed === "reopened") f.close();
    if (changed === "reopened") await f.open();
    f.elements.taxonomyDatabaseSearch.focus(); const focused = f.documentRef.activeElement;
    finish({ requiresConfirmation: true, previousGermanName: "Audit", germanName: "Alpenstrandläufer", token: "preview" }); await f.settle();
    assert.equal(f.confirmationCount(), 0); assert.equal(f.documentRef.activeElement, focused);
    assert.equal(f.calls.filter(call => call.url.endsWith("/name-preference/save")).length, 0);
  });
}
for (const changed of ["selection", "choice", "closed", "detached"]) {
  test("Abbruch einer offenen Namensbestätigung fokussiert nach " + changed + " keinen veralteten Auslöser", async () => {
    let finishConfirm; const confirmation = new Promise(resolve => { finishConfirm = resolve; });
    const f = nameChoiceUiFixture({ confirm: () => confirmation }); await f.open(); const button = await f.action("provider");
    if (changed === "selection") await f.select("b");
    if (changed === "choice") f.choose("Andere Auswahl");
    if (changed === "closed") f.close();
    if (changed === "detached") button.isConnected = false;
    f.documentRef.activeElement = f.documentRef.body; const focusCount = button.focusCount;
    finishConfirm(false); await f.settle();
    assert.equal(f.documentRef.activeElement, f.documentRef.body); assert.equal(button.focusCount, focusCount);
  });
}
test("Abbruch mit Fokusloch auf documentElement erhält denselben gültigen Auslöser", async () => {
  let f; f = nameChoiceUiFixture({ confirm: async () => { f.documentRef.activeElement = f.documentRef.documentElement; return false; } });
  await f.open(); const button = await f.action("provider"); assert.equal(f.documentRef.activeElement, button);
});
test("Bestätigte Namenswahl fokussiert den ersetzten alten Auslöser nicht nachträglich", async () => {
  const f = nameChoiceUiFixture(); await f.open(); f.choose("Alpenstrandläufer"); const button = await f.action("save");
  assert.equal(button.focusCount, 1); assert.equal(button.isConnected, false);
});

function statusReviewElement() {
  let html = '', text = '';
  return { hidden: false, disabled: false, value: 0, open: false, classList: { toggle() {} }, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    get innerHTML() { return html; }, set innerHTML(value) { html = value; text = ''; },
    get textContent() { return text; }, set textContent(value) { text = value; html = ''; },
    removeAttribute(key) { delete this[key]; } };
}

test('Masterstatus: overview explicitly labels unknown conflicts and does not claim completion', async () => {
  const nodes = new Map();
  const elements = new Proxy({}, { get(_, key) { if (!nodes.has(key)) nodes.set(key, statusReviewElement()); return nodes.get(key); } });
  const state = { taxonomyMasterSnapshot: { status: 'completed', active: false, lifecycle: { active: { candidateId: 'master', summary: { taxa: 1 } },
    blockingConflictCount: null, conflicts: [], blockingConflicts: [], candidateInspection: { status: 'deferred' }, canRollback: true },
    reference: { status: 'current', activeMatchesReference: true }, corrections: {}, identities: {},
    lightroomPackage: { status: 'current', masterVersion: 'master', packageVersion: 'master' } }, taxonomyMaintenanceSnapshot: {} };
  database.createTaxonomyDatabaseController({ state, elements, fetchJson: async () => { throw new Error('No API'); },
    escapeHtml: String, createDialogController() { return { open() {}, close() {} }; }, taxonomyReference: { taxonomyResultPresentation() {}, taxonomyDetailPresentation() {} } });
  state.renderTaxonomyDatabaseOverview();
  assert.match(elements.taxonomyDatabaseOverviewSummary.textContent, /Masterprüfung ausstehend/);
  assert.match(elements.taxonomyDatabaseOverviewDetail.textContent, /Konfliktprüfung ausstehend/);
  assert.doesNotMatch(elements.taxonomyDatabaseOverviewDetail.textContent, /keine offenen|abgeschlossen/i);
  assert.equal(elements.taxonomyDatabaseRollbackButton.disabled, true);
});

// Actual-source status lifecycle regressions: all responses/timers are synthetic.

const a64Scripts = [
  'app-taxonomy-progress.js', 'app-taxonomy-master.js', 'app-taxonomy-database.js',
  'app-dialogs.js', 'app-foundation.js', 'app-backup-workflow.js', 'app-pipeline-workflow.js'
];

const a64Settle = () => new Promise(setImmediate);

function a64Defer() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return {
    promise,
    resolve,
    reject
  };
}

function a64Old() {
  return {
    status: 'failed',
    active: false,
    error: 'older job failed at97',
    buildJob: {
      available: true,
      id: 'synthetic-old-job',
      updateRunId: 'synthetic-old-run',
      status: 'failed',
      error: 'older job failed at97',
      progress: {
        percent: 97,
        phase: 'old search index'
      }
    },
    lifecycle: {},
    updateWorkflow: {
      available: true,
      active: false,
      updateRunId: 'synthetic-old-run',
      status: 'failed',
      phase: 'build'
    }
  };
}

function a64Active() {
  return {
    status: 'building',
    active: true,
    error: '',
    progressPercent: 4,
    buildJob: {
      available: true,
      id: 'synthetic-current-job',
      updateRunId: 'synthetic-current-run',
      status: 'building',
      progress: {
        percent: 4,
        phase: 'Master aufbauen'
      }
    },
    lifecycle: {
      candidateInspection: {
        status: 'deferred'
      },
      blockingConflictCount: null,
      canActivate: false,
      canRollback: false
    },
    updateWorkflow: {
      available: true,
      active: true,
      updateRunId: 'synthetic-current-run',
      status: 'building',
      phase: 'build',
      message: 'synthetic current build'
    }
  };
}

function a64Completed() {
  return {
    status: 'ready',
    active: false,
    error: '',
    buildJob: {
      available: true,
      id: 'synthetic-current-job',
      updateRunId: 'synthetic-current-run',
      status: 'ready'
    },
    lifecycle: {
      active: {
        candidateId: 'synthetic-new-master',
        summary: {
          taxa: 7
        }
      }
    },
    updateWorkflow: {
      available: true,
      active: false,
      updateRunId: 'synthetic-current-run',
      status: 'completed',
      phase: 'completed',
      message: 'synthetic completed'
    }
  };
}

function a64Fixture(source, mutationResponses = new Map()) {
  const timers = new Map(), nodes = new Map(), queues = new Map(), calls = [], messages = [], unhandled = [];
  let timerId = 0, now = 0;
  const documentRef = {
    body: {
      classList: {
        add() {},
        remove() {}
      }
    },
    documentElement: {},
    activeElement: null
  };
  documentRef.activeElement = documentRef.body;
  function node() {
    const listeners = new Map(), children = new Map();
    return {
      textContent: '',
      innerHTML: '',
      hidden: false,
      disabled: false,
      value: '',
      dataset: {},
      open: false,
      isConnected: true,
      ownerDocument: documentRef,
      attributes: new Map(),
      classList: {
        toggle() {},
        add() {},
        remove() {}
      },
      querySelector(sel) {
        if (!children.has(sel)) children.set(sel, node());
        return children.get(sel);
      },
      querySelectorAll() {
        return [];
      },
      setAttribute(k, v) {
        this.attributes.set(k, v);
        if (k === 'open') this.open = true;
      },
      removeAttribute(k) {
        this.attributes.delete(k);
        if (k === 'open') this.open = false;
      },
      hasAttribute(k) {
        return this.attributes.has(k);
      },
      getAttribute(k) {
        return this.attributes.get(k);
      },
      addEventListener(type, cb) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(cb);
      },
      removeEventListener() {},
      emit(type, event = {}) {
        for (const cb of listeners.get(type) || []) cb(event);
      },
      focus() {
        documentRef.activeElement = this;
      },
      scrollIntoView() {},
      showModal() {
        this.open = true;
        this.showModalCount = (this.showModalCount || 0) + 1;
      },
      close() {
        this.open = false;
        this.emit('close');
      }
    };
  }
  const elements = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (!nodes.has(key)) nodes.set(key, node());
      return nodes.get(key);
    }
  });
  for (const key of ['pipelineButtons', 'backupButtons', 'settingsButtons', 'taxonomyButtons']) elements[key] = [];
  const sandbox = vm.createContext({
    Headers,
    AbortController,
    document: documentRef,
    setTimeout(cb, delay = 0) {
      const id = ++timerId;
      timers.set(id, {
        id,
        cb,
        at: now + delay,
        delay
      });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    }
  });
  for (const name of a64Scripts) new vm.Script(source[name], {
    filename: name
  }).runInContext(sandbox);
  const state = {
    taxonomyMaintenanceSnapshot: {
      status: 'idle',
      active: false
    },
    taxonomyMasterSnapshot: a64Old(),
    setPipelineMessage(text, type) {
      messages.push({
        text,
        type
      });
    }
  };
  const defaults = new Map([['/api/taxonomy/status', {
    status: 'idle',
    active: false
  }], ['/api/taxonomy/master/status', a64Active()], ['/api/taxonomy/update/sequence-status', a64Active().updateWorkflow], ['/api/pipeline/status', {
    status: 'idle'
  }], ['/api/taxonomy/review', {
    total: 0,
    items: []
  }]]);
  const client = sandbox.SpeciesExplorerFoundation.createExplorerApiClient({
    HeadersImpl: Headers,
    getSessionToken: () => mutationResponses.size ? "synthetic-test-session" : "",
    fetchImpl: async (url, options = {}) => {
      calls.push({
        url,
        method: options.method || 'GET',
        signalPresent: Boolean(options.signal)
      });
      if ((options.method || 'GET') !== 'GET') {
        const key = (options.method || 'GET') + ' ' + url;
        if (!mutationResponses.has(key)) throw Error('Fixture forbids writes');
        return { ok: true, json: async () => mutationResponses.get(key) };
      }
      const queue = queues.get(url) || [];
      const action = queue.length ? queue.shift(): defaults.get(url);
      if (action === undefined) throw Error('Unexpected synthetic endpoint ' + url);
      const payload = typeof action === 'function' ? await action(): await action;
      return {
        ok: true,
        json: async () => payload
      };
    }
  });
  const controller = sandbox.SpeciesExplorerTaxonomyDatabase.createTaxonomyDatabaseController({
    state,
    elements,
    fetchJson: client.fetchJson,
    escapeHtml: String,
    taxonomyReference: {
      taxonomyResultPresentation() {},
      taxonomyDetailPresentation() {}
    },
    createDialogController: sandbox.SpeciesExplorerDialogs.createDialogController,
    showQuickConfirm: async () => {
      throw Error('No confirmation/mutation allowed');
    }
  });
  return {
    sandbox,
    state,
    elements,
    controller,
    calls,
    messages,
    timers,
    defaults,
    queues,
    unhandled,
    enqueue(url, ...values) {
      if (!queues.has(url)) queues.set(url, []);
      queues.get(url).push(...values);
    },
    async fire(delay) {
      const item = [...timers.values()].find(x => x.delay === delay);
      assert.ok(item, 'Expected timer' + delay);
      timers.delete(item.id);
      now = item.at;
      Promise.resolve(item.cb()).catch (e => unhandled.push(e.message));
      await a64Settle();
    },
    advance(milliseconds) {
      now += milliseconds;
    },
    pending() {
      return [...timers.values()].map(x => ({
        delay: x.delay,
        at: x.at
      }));
    },
    legacy() {
      return sandbox.SpeciesExplorerTaxonomyMaster.createTaxonomyMasterController({
        state,
        elements,
        fetchJson: client.fetchJson,
        escapeHtml: String,
        showQuickConfirm: async () => false,
        renderDatabaseStatus() {}
      });
    }
  };
}

function a64Gate() {
  let resolve;
  const promise = new Promise(r => {
    resolve = r;
  });
  return {
    promise,
    resolve
  };
}

function a64Terminal() {
  return {
    status: 'ready',
    active: false,
    error: '',
    buildJob: {
      available: true,
      id: 'synthetic-current-job',
      status: 'ready'
    },
    lifecycle: {
      active: {
        candidateId: 'synthetic-new-master'
      }
    },
    updateWorkflow: {
      available: true,
      active: false,
      updateRunId: 'synthetic-current-run',
      status: 'completed',
      phase: 'completed'
    }
  };
}

const a64Cases = [];

function a64Case(name, run) {
  a64Cases.push({
    name,
    run
  });
}

a64Case('fresh current owner remains usable and deferred rights blocked', async f => {
  await f.controller.refresh();
  assert.equal(f.state.taxonomyMasterSnapshot.buildJob.id, 'synthetic-current-job');
  assert.equal(f.elements.taxonomyDatabaseRollbackButton.disabled, true);
});

a64Case('temporary workflow GET failure retries once and recovers', async f => {
  await f.controller.refresh();
  f.enqueue('/api/taxonomy/update/sequence-status', () => Promise.reject(Error('offline')));
  await f.fire(5000);
  assert.equal(f.pending().filter(t => t.delay === 1000).length, 1);
  await f.fire(1000);
  assert.equal(f.state.taxonomyMasterSnapshot.buildJob.id, 'synthetic-current-job');
  assert.equal(f.pending().filter(t => t.delay === 5000).length, 1);
  assert.ok(!f.messages.at( - 1).text.includes('offline'));
});

a64Case('failed status read preserves owner and explicitly marks stale while strict preflight rejects', async f => {
  await f.controller.refresh();
  f.enqueue('/api/taxonomy/master/status', () => Promise.reject(Error('offline')));
  await f.controller.refresh();
  assert.equal(f.state.taxonomyMasterSnapshot.buildJob.id, 'synthetic-current-job');
  assert.match(f.elements.taxonomyDatabaseOverviewSummary.textContent, /nicht aktuell/);
  f.enqueue('/api/taxonomy/master/status', () => Promise.reject(Error('strict-offline')));
  await assert.rejects(f.controller.refresh({
    requireFresh: true
  }), /strict-offline/);
});

a64Case('hung reference cannot withhold successfully returned current master', async f => {
  const g = a64Gate();
  f.enqueue('/api/taxonomy/status', g.promise);
  const request = f.controller.refresh();
  await a64Settle();
  try {
    assert.equal(f.state.taxonomyMasterSnapshot.buildJob.id, 'synthetic-current-job');
  } finally {
    g.resolve({
      status: 'idle',
      active: false
    });
    await request;
  }
});

a64Case('hung GET reaches bounded deadline and later read recovers without waiting for old response', async f => {
  const g = a64Gate();
  f.enqueue('/api/taxonomy/status', g.promise);
  const request = f.controller.refresh();
  await a64Settle();
  try {
    await f.fire(15000);
    const result = await request;
    assert.equal(result.fresh, false);
    assert.match(f.elements.taxonomyDatabaseOverviewSummary.textContent, /nicht aktuell/);
    await f.controller.refresh();
    assert.ok(!f.elements.taxonomyDatabaseOverviewSummary.textContent.includes('nicht aktuell'));
  } finally {
    g.resolve({
      status: 'idle',
      active: false
    });
    await request;
  }
});

a64Case('late earlier master response cannot regress newer completed job', async f => {
  const g = a64Gate();
  f.enqueue('/api/taxonomy/master/status', g.promise, a64Terminal());
  const earlier = f.controller.refresh();
  await a64Settle();
  await f.controller.refresh();
  const newer = f.state.taxonomyMasterSnapshot;
  g.resolve({
    status: 'failed',
    active: false,
    error: 'old error',
    buildJob: {
      available: true,
      id: 'old-job',
      status: 'failed'
    },
    lifecycle: {},
    updateWorkflow: {
      available: true,
      updateRunId: 'old-run',
      status: 'failed'
    }
  });
  await earlier;
  assert.equal(f.state.taxonomyMasterSnapshot, newer);
  assert.equal(f.state.taxonomyMasterSnapshot.updateWorkflow.status, 'completed');
});

a64Case('shared completed read clears actual legacy visible progress', async f => {
  const legacy = f.legacy();
  await f.controller.refresh();
  legacy.render(f.state.taxonomyMasterSnapshot);
  assert.equal(f.elements.taxonomyMasterProgress.hidden, false);
  f.defaults.set('/api/taxonomy/master/status', a64Terminal());
  await f.controller.refresh();
  assert.equal(f.state.taxonomyMasterSnapshot.updateWorkflow.status, 'completed');
  assert.equal(f.elements.taxonomyMasterProgress.hidden, true);
  assert.equal(f.elements.taxonomyMasterProgressDetail.textContent, '');
});

a64Case('legacy polling failure keeps workflow identity and recovers through bounded GET retry', async f => {
  const legacy = f.legacy();
  await f.controller.refresh();
  legacy.render(f.state.taxonomyMasterSnapshot);
  f.enqueue('/api/taxonomy/master/status', () => Promise.reject(Error('legacy-offline')));
  await f.fire(900);
  assert.equal(f.state.taxonomyMasterSnapshot.updateWorkflow.updateRunId, 'synthetic-current-run');
  assert.equal(f.state.taxonomyMasterSnapshot.buildJob.id, 'synthetic-current-job');
  assert.match(f.elements.taxonomyMasterDetail.textContent, /nicht bestätigt/);
  assert.ok(f.pending().some(t => t.delay === 1000));
  await f.fire(1000);
  assert.ok(!f.elements.taxonomyMasterDetail.textContent.includes('legacy-offline'));
});

a64Case('pipeline chooser opens synchronously and reopens while taxonomy read is pending', async f => {
  const g = a64Gate();
  f.state.taxonomyMasterSnapshot = a64Terminal();
  f.state.editMode = true;
  f.state.databaseNeedsUpdate = false;
  let reads = 0;
  f.state.refreshTaxonomyMaintenanceStatus = () => {
    reads++;
    return g.promise;
  };
  const wf = f.sandbox.SpeciesExplorerPipelineWorkflow.createPipelineWorkflowController({
    state: f.state,
    elements: f.elements,
    fetchJson: async () => ({
      status: 'idle'
    }),
    createDialogController: f.sandbox.SpeciesExplorerDialogs.createDialogController,
    persistentStatusPresentation: () => null,
    pipelineStatusPresentation: () => null,
    backupStatusPresentation: () => null,
    pipelineModeLabel: String,
    backupLabel: String,
    renderPipelinePreview: () => ({}),
    renderBackupPreview: () => ({}),
    releaseAllAudioElements() {},
    soundSearchOutcome: () => ({}),
    refreshExplorerModelOnly: async () => {},
    refreshOpenSoundEditor: async () => {},
    loadData: async () => {},
    renderDatabaseStatus() {},
    formatDate: String,
    renderProcessLog() {},
    createBackupWorkflowController: () => ({
      reset() {},
      bind() {},
      showStatusDialog() {},
      startPreview: async () => {}
    })
  });
  wf.setupPipelineControl();
  f.elements.pipelineMenuButton.emit('click');
  assert.equal(f.elements.pipelineDialog.open, true);
  assert.equal(reads, 1);
  f.elements.pipelineDialog.emit('cancel', {
    preventDefault() {}
  });
  assert.equal(f.elements.pipelineDialog.open, false);
  f.elements.pipelineMenuButton.emit('click');
  assert.equal(f.elements.pipelineDialog.open, true);
  g.resolve({});
  await a64Settle();
});

function a64ReferenceController(f) {
  new vm.Script(f.maintenanceSource, {
    filename: 'app-taxonomy-maintenance.js'
  }).runInContext(f.sandbox);
  return f.sandbox.SpeciesExplorerTaxonomyMaintenance.createTaxonomyMaintenanceController({
    state: f.state,
    elements: f.elements,
    fetchJson: async (url, options = {}) => {
      f.calls.push({
        url,
        method: options.method || 'GET',
        signalPresent: Boolean(options.signal)
      });
      if ((options.method || 'GET') !== 'GET') throw Error('Fixture forbids writes');
      const q = f.queues.get(url) || [];
      const action = q.length ? q.shift(): f.defaults.get(url);
      return typeof action === 'function' ? await action(): await action;
    },
    formatBytes: String,
    escapeHtml: String,
    showQuickConfirm: async () => {
      throw Error('No mutation');
    },
    renderDatabaseStatus() {}
  });
}

a64Case('late maintenance response cannot replace newer accepted reference', async f => {
  const m = a64ReferenceController(f), g = a64Gate();
  f.enqueue('/api/taxonomy/status', g.promise, {
    status: 'idle',
    active: false,
    reference: {
      alias: 'NEW-REFERENCE'
    },
    latestCheckedAt: '2026-01-01'
  });
  const earlier = m.refresh();
  await a64Settle();
  await f.controller.refresh();
  g.resolve({
    status: 'idle',
    active: false,
    reference: {
      alias: 'OLD-REFERENCE'
    },
    latestCheckedAt: '2026-01-01'
  });
  await earlier;
  assert.equal(f.state.taxonomyMaintenanceSnapshot.reference.alias, 'NEW-REFERENCE');
});

a64Case('maintenance rejection preserves last reference and schedules owned retry', async f => {
  await f.controller.refresh();
  const m = a64ReferenceController(f), last = f.state.taxonomyMaintenanceSnapshot;
  f.enqueue('/api/taxonomy/status', () => Promise.reject(Error('reference-offline')));
  await m.refresh();
  assert.equal(f.state.taxonomyMaintenanceSnapshot, last);
  assert.match(f.elements.taxonomyMaintenanceDetail.textContent, /nicht bestätigt/);
  assert.ok(f.pending().some(x => x.delay === 1000));
  await f.fire(1000);
  assert.ok(!f.elements.taxonomyMaintenanceDetail.textContent.includes('reference-offline'));
});

a64Case('maintenance hanging read has deadline and remains recoverable', async f => {
  await f.controller.refresh();
  const m = a64ReferenceController(f), g = a64Gate();
  f.enqueue('/api/taxonomy/status', g.promise);
  const pending = m.refresh();
  await a64Settle();
  try {
    await f.fire(15000);
    await pending;
    assert.match(f.elements.taxonomyMaintenanceDetail.textContent, /Zeitlimit/);
    assert.ok(f.pending().some(x => x.delay === 1000));
  } finally {
    g.resolve({
      status: 'idle',
      active: false,
      latestCheckedAt: '2026-01-01'
    });
    await pending;
  }
});

a64Case('strict preflight rejects a superseded response instead of authorizing it', async f => {
  const g = a64Gate();
  f.enqueue('/api/taxonomy/master/status', g.promise, a64Terminal());
  const earlier = f.controller.refresh({
    requireFresh: true
  });
  const guarded = earlier.then(value => ({
    value
  }), error => ({
    error
  }));
  await a64Settle();
  await f.controller.refresh();
  g.resolve({
    status: 'idle',
    active: false,
    lifecycle: {}
  });
  const outcome = await guarded;
  assert.ok(outcome.error, 'Superseded strict read must reject');
  assert.match(outcome.error.message, /neuere Statusprüfung/);
});

a64Case('older legacy master request cannot overwrite newer shared completion', async f => {
  const legacy = f.legacy(), g = a64Gate();
  f.enqueue('/api/taxonomy/master/status', g.promise, a64Terminal());
  const pending = legacy.refresh();
  await a64Settle();
  await f.controller.refresh();
  g.resolve({
    status: 'building',
    active: true,
    lifecycle: {},
    buildJob: {
      available: true,
      id: 'old-job',
      status: 'building'
    },
    updateWorkflow: {
      active: true,
      status: 'building',
      updateRunId: 'old-run'
    }
  });
  await pending;
  assert.equal(f.state.taxonomyMasterSnapshot.updateWorkflow.status, 'completed');
  assert.equal(f.elements.taxonomyMasterProgress.hidden, true);
});

a64Case('late sequence poll cannot schedule old active workflow after newer completion', async f => {
  await f.controller.refresh();
  const g = a64Gate();
  f.enqueue('/api/taxonomy/update/sequence-status', g.promise);
  await f.fire(5000);
  f.defaults.set('/api/taxonomy/master/status', a64Terminal());
  await f.controller.refresh();
  g.resolve({
    available: true,
    active: true,
    status: 'building',
    updateRunId: 'old-run',
    message: 'old sequence'
  });
  await a64Settle();
  assert.equal(f.state.taxonomyMasterSnapshot.updateWorkflow.status, 'completed');
  assert.equal(f.pending().filter(t => t.delay === 5000).length, 0);
});


function a64BlockedCandidate(total = 179) {
  return {
    status: 'ready', active: false,
    lifecycle: {
      active: { candidateId: 'previous-master' },
      candidate: {
        candidateId: 'synthetic-candidate-' + total,
        diff: { newTaxa: 189, changedNames: 3957 },
        classificationReview: { total, missingProviderId: total, groups: [] }
      },
      blockingConflictCount: total, conflicts: [], blockingConflicts: [], canActivate: false
    }
  };
}

function a64CurrentPair() {
  return {
    status: 'completed', active: false,
    lifecycle: {
      active: {
        candidateId: 'synthetic-new-master', summary: { taxa: 273499 },
        classificationDeferrals: { total: 179 }
      },
      candidate: null, blockingConflictCount: 0, conflicts: [], blockingConflicts: []
    },
    reference: { status: 'current', activeMatchesReference: true, needsMasterRebuild: false },
    lightroomPackage: {
      status: 'current', masterVersion: 'synthetic-new-master', packageVersion: 'synthetic-new-master'
    },
    corrections: { pending: false }, identities: { pending: false },
    buildJob: { available: true, status: 'ready' },
    updateWorkflow: { available: true, status: 'completed', phase: 'completed', active: false }
  };
}

function a64BindChooser(f) {
  const legacy = f.legacy();
  f.state.refreshTaxonomyMasterStatus = legacy.refresh;
  f.state.refreshTaxonomyMaintenanceStatus = a64ReferenceController(f).refresh;
  f.state.editMode = true;
  f.state.databaseNeedsUpdate = false;
  const workflow = f.sandbox.SpeciesExplorerPipelineWorkflow.createPipelineWorkflowController({
    state: f.state, elements: f.elements, fetchJson: async () => ({ status: 'idle' }),
    createDialogController: f.sandbox.SpeciesExplorerDialogs.createDialogController,
    persistentStatusPresentation: () => null, pipelineStatusPresentation: () => null,
    backupStatusPresentation: () => null, pipelineModeLabel: String, backupLabel: String,
    renderPipelinePreview: () => ({}), renderBackupPreview: () => ({}),
    releaseAllAudioElements() {}, soundSearchOutcome: () => ({}),
    refreshExplorerModelOnly: async () => {}, refreshOpenSoundEditor: async () => {},
    loadData: async () => {}, renderDatabaseStatus() {}, formatDate: String, renderProcessLog() {},
    createBackupWorkflowController: () => ({
      reset() {}, bind() {}, showStatusDialog() {}, startPreview: async () => {}
    })
  });
  workflow.setupPipelineControl();
  legacy.render(a64BlockedCandidate());
  f.state.taxonomyMasterSnapshot = a64CurrentPair();
  f.state.renderTaxonomyDatabaseOverview();
  return legacy;
}

a64Case('chooser opens synchronously and refreshes completed Master details while reference hangs', async f => {
  a64BindChooser(f);
  const reference = a64Gate();
  f.enqueue('/api/taxonomy/status', reference.promise);
  f.defaults.set('/api/taxonomy/master/status', a64CurrentPair());
  f.elements.pipelineMenuButton.emit('click');
  assert.equal(f.elements.pipelineDialog.open, true);
  await a64Settle();
  assert.equal(f.calls.filter(call => call.url === '/api/taxonomy/master/status').length, 1);
  assert.equal(f.elements.taxonomyMasterConflicts.hidden, true);
  assert.equal(f.elements.taxonomyMasterConflicts.innerHTML, '');
  assert.equal(f.elements.taxonomyMasterDiff.hidden, true);
  assert.equal(f.elements.taxonomyMasterDiff.innerHTML, '');
  assert.match(f.elements.taxonomyMasterTechnicalDetailsCopy.innerHTML, /keine aktuell offenen Entscheidungen/);
  assert.doesNotMatch(f.elements.taxonomyMasterTechnicalDetailsCopy.innerHTML, /<button/);
  reference.resolve({ status: 'idle', active: false });
  await a64Settle();
});

a64Case('chooser preserves a current blocking candidate instead of masking it as completed', async f => {
  a64BindChooser(f);
  f.defaults.set('/api/taxonomy/master/status', a64BlockedCandidate(2));
  f.elements.pipelineMenuButton.emit('click');
  await a64Settle();
  assert.equal(f.state.taxonomyMasterSnapshot.lifecycle.candidate.candidateId, 'synthetic-candidate-2');
  assert.equal(f.elements.taxonomyMasterConflicts.hidden, false);
  assert.match(f.elements.taxonomyMasterConflicts.innerHTML, /2 Fälle/);
  assert.doesNotMatch(f.elements.taxonomyMasterConflicts.innerHTML, /179 Fälle/);
  assert.equal(f.elements.taxonomyMasterDiff.hidden, false);
  assert.equal(f.elements.taxonomyMasterActivateButton.disabled, true);
  assert.match(f.elements.taxonomyMasterDetail.textContent, /2 Konflikt/);
});

a64Case('chooser Master read supersedes an older pending candidate response', async f => {
  const legacy = a64BindChooser(f), older = a64Gate();
  f.enqueue('/api/taxonomy/master/status', older.promise, a64CurrentPair());
  const pending = legacy.refresh();
  f.elements.pipelineMenuButton.emit('click');
  await a64Settle();
  older.resolve(a64BlockedCandidate());
  await pending;
  assert.equal(f.state.taxonomyMasterSnapshot.status, 'completed');
  assert.equal(f.elements.taxonomyMasterConflicts.hidden, true);
  assert.equal(f.elements.taxonomyMasterDiff.hidden, true);
});

for (const [label, result] of [
  ['completed pair', a64CurrentPair()],
  ['current blocking candidate', a64BlockedCandidate(2)]
]) {
  test('Statusdetails: accepted direct pause response renders ' + label, async () => {
    const responseKey = 'POST /api/taxonomy/master/pause-build';
    const f = a64Fixture(a64SourceMap, new Map([[responseKey, result]]));
    f.maintenanceSource = a64SourceMap['app-taxonomy-maintenance.js'];
    f.defaults.set('/api/taxonomy/master/status', a64CurrentPair());
    const legacy = f.legacy();
    f.controller.setup();
    await a64Settle();
    legacy.render(a64BlockedCandidate());
    f.elements.taxonomyDatabasePauseButton.emit('click');
    await a64Settle();
    assert.equal(f.state.taxonomyMasterSnapshot, result);
    assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
    assert.equal(f.calls.filter(call => call.url === '/api/taxonomy/master/status').length, 1);
    assert.equal(f.unhandled.length, 0);
    if (result.status === 'completed') {
      assert.equal(f.elements.taxonomyMasterConflicts.hidden, true);
      assert.equal(f.elements.taxonomyMasterDiff.hidden, true);
      assert.match(f.elements.taxonomyMasterDetail.textContent, /Technisch abgeschlossen/);
    } else {
      assert.equal(f.elements.taxonomyMasterConflicts.hidden, false);
      assert.match(f.elements.taxonomyMasterConflicts.innerHTML, /2 Fälle/);
      assert.doesNotMatch(f.elements.taxonomyMasterConflicts.innerHTML, /179 Fälle/);
      assert.equal(f.elements.taxonomyMasterActivateButton.disabled, true);
    }
  });
}

test('Statusdetails: accepted direct response invalidates an older pending Master GET', async () => {
  const current = a64CurrentPair(), older = a64Gate();
  const f = a64Fixture(a64SourceMap, new Map([['POST /api/taxonomy/master/pause-build', current]]));
  const legacy = f.legacy();
  f.defaults.set('/api/taxonomy/master/status', current);
  f.controller.setup();
  await a64Settle();
  f.enqueue('/api/taxonomy/master/status', older.promise);
  const pending = legacy.refresh();
  f.elements.taxonomyDatabasePauseButton.emit('click');
  await a64Settle();
  older.resolve(a64BlockedCandidate());
  await pending;
  assert.equal(f.state.taxonomyMasterSnapshot, current);
  assert.equal(f.elements.taxonomyMasterConflicts.hidden, true);
  assert.equal(f.elements.taxonomyMasterDiff.hidden, true);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(f.unhandled.length, 0);
});

const a64SourceMap = {
  "app-taxonomy-progress.js": progressSource,
  "app-taxonomy-master.js": masterSource,
  "app-taxonomy-database.js": source
};
for (const name of [
  "app-dialogs.js", "app-foundation.js", "app-backup-workflow.js", "app-pipeline-workflow.js", "app-taxonomy-maintenance.js"
]) a64SourceMap[name] = await readFile(new URL("./public/" + name, import.meta.url), "utf8");
for (const entry of a64Cases) test("Statusfrische: " + entry.name, async () => {
  const f = a64Fixture(a64SourceMap);
  f.maintenanceSource = a64SourceMap["app-taxonomy-maintenance.js"];
  await entry.run(f);
  assert.equal(f.unhandled.length, 0);
  assert.ok(f.calls.every(call => call.method === "GET"));
});
