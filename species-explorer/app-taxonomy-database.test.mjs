import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-taxonomy-database.js", import.meta.url), "utf8");
const indexSource = await readFile(new URL("./public/index.html", import.meta.url), "utf8");
const styleSource = await readFile(new URL("./public/app.css", import.meta.url), "utf8");
const context = vm.createContext({});
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

function backgroundUiFixture({ confirm = false } = {}) {
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
  const calls = [], messages = [];
  const state = { taxonomyMasterSnapshot: current, setPipelineMessage: (text) => messages.push(text) };
  const controller = database.createTaxonomyDatabaseController({ state, elements, escapeHtml: String,
    taxonomyReference: {}, createDialogController: () => ({}), showQuickConfirm: async () => confirm,
    fetchJson: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("resume-build")) current = { ...current, status: "paused", message: "Erneut pausiert" };
      if (url.includes("/master/")) return current;
      return {};
    } });
  controller.setup();
  return { controller, elements, calls, messages };
}

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
