import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-taxonomy-database.js", import.meta.url), "utf8");
const indexSource = await readFile(new URL("./public/index.html", import.meta.url), "utf8");
const styleSource = await readFile(new URL("./public/app.css", import.meta.url), "utf8");
const progressSource = await readFile(new URL("./public/app-taxonomy-progress.js", import.meta.url), "utf8");
const context = vm.createContext({});
new vm.Script(progressSource).runInContext(context);
new vm.Script(source, { filename: "app-taxonomy-database.js" }).runInContext(context);
const database = context.SpeciesExplorerTaxonomyDatabase;

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
  queuedClose = false, previewError = "", previewHasWork = true } = {}) {
  const timers = new Map(), nodes = new Map(), calls = [], messages = [], confirmations = [];
  let timerId = 0;
  const sandbox = vm.createContext({ setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); } });
  new vm.Script(progressSource).runInContext(sandbox);
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
    lightroomPackage: { status: "current" }, buildJob: { available: true, status: "ready", progress: { phase: "Abschluss" } } };
  const reference = { status: "idle", active: false, updateAvailable: true,
    latest: { version: "COL26.9 XR", issued: "2026-09-25" } };
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

test("Gespeicherter Gesamtstart: ein Start und eine Nutzungsvereinbarung; selbst schließen bricht nicht ab", async () => {
  const f = savedUpdateFixture();
  await new Promise(setImmediate);
  await Promise.all([f.state.updateTaxonomyDatabase({ startup: true }), f.state.updateTaxonomyDatabase({ startup: true })]);
  assert.deepEqual(postedActions(f).map((call) => call.url), ["/api/taxonomy/update/sequence-start"]);
  const payload = JSON.parse(postedActions(f)[0].options.body);
  assert.equal(payload.confirmed, true);
  assert.equal(payload.token, "fresh-source-plan");
  assert.deepEqual(payload.usageConsent, { allCatalogsConfirmed: true, noChangesUntilClose: true });
  assert.match(f.confirmations[0].message, /gespeicherten vollständigen Satz.*FN-Kataloge/);
  assert.match(f.confirmations[0].message, /neu erfasst.*alte Quittung.*nicht neu datiert/);
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
      assert.ok(f.messages.some((message) => /Schließen.*nach.*FN-Nutzungserfassung angefordert/.test(message)));
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
