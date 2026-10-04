import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("./public/app-taxonomy-master.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({
  clearTimeout() {},
  setTimeout() {
    return 1;
  },
});
new vm.Script(await readFile(new URL("./public/app-taxonomy-progress.js", import.meta.url), "utf8")).runInContext(context);
new vm.Script(source, { filename: "app-taxonomy-master.js" }).runInContext(context);
const masterUi = context.SpeciesExplorerTaxonomyMaster;

function element() {
  return {
    disabled: false,
    hidden: false,
    innerHTML: "",
    textContent: "",
    value: 0,
    open: false,
    addEventListener() {},
    removeAttribute(name) {
      delete this[name];
    },
  };
}

function elements() {
  return {
    taxonomyMasterSummary: element(),
    taxonomyMasterDetail: element(),
    taxonomyMasterProgress: element(),
    taxonomyMasterProgressDetail: element(),
    taxonomyMasterDiff: element(),
    taxonomyMasterConflicts: element(),
    taxonomyMasterTechnicalDetails: element(),
    taxonomyMasterTechnicalDetailsCopy: element(),
    taxonomyMasterBuildButton: element(),
    taxonomyMasterActivateButton: element(),
    taxonomyMasterRollbackButton: element(),
  };
}

function readyStatus() {
  return {
    status: "ready",
    active: false,
    lifecycle: {
      candidate: {
        summary: { taxa: 52, germanNames: 41, englishNames: 49 },
        diff: {
          newTaxa: ["Sciurus vulgaris"],
          closedReferenceGaps: [],
          changedScientificNames: [],
          changedNames: ["Panthera pardus"],
          newSynonyms: ["Felis pardus"],
          staleTaxa: [],
          removedTaxa: [],
        },
      },
      active: { summary: { taxa: 51, germanNames: 40, englishNames: 48 } },
      conflicts: [],
      blockingConflicts: [],
      canActivate: true,
      canRollback: true,
    },
  };
}

function currentStatus() {
  return {
    status: "idle", active: false,
    lifecycle: { active: { candidateId: "master-current", summary: { taxa: 275662 },
      classificationDeferrals: { total: 187 } }, blockingConflictCount: 0, conflicts: [], blockingConflicts: [] },
    reference: { status: "current", activeMatchesReference: true, needsMasterRebuild: false },
    lightroomPackage: { status: "current", needsRebuild: false,
      masterVersion: "master-current", packageVersion: "master-current" },
    corrections: { pending: false }, identities: { pending: false },
    buildJob: { available: true, status: "ready" },
    updateWorkflow: { status: "idle", active: false },
  };
}

test("Erfolgsanzeige benötigt einen belegten passenden Gesamtstand; Zurückstellungen sind kein Fehler", () => {
  assert.equal(masterUi.activePairIsCurrent(currentStatus()), true);
  assert.equal(masterUi.activePairIsCurrent({ ...currentStatus(), status: "completed" }), true);
  const invalid = [
    ["status", "building"], ["status", "applying-corrections"], ["status", "partial"], ["status", "failed"], ["status", "paused"],
    ["active", true], ["error", "Masterprüfung fehlgeschlagen"],
    ["lifecycle.candidate", { candidateId: "waiting" }], ["lifecycle.active", null],
    ["lifecycle.blockingConflictCount", 1], ["lifecycle.error", "Stand nicht lesbar"],
    ["lifecycle.blockingConflicts", [{ conflict_id: "ordinary" }]],
    ["lifecycle.conflicts", [{ conflict_id: "ordinary", conflict_type: "changed-value" }]],
    ["reference.status", "stale"], ["reference.activeMatchesReference", false],
    ["reference.activeMatchesReference", undefined], ["reference.needsMasterRebuild", true],
    ["reference.error", "Vergleich fehlgeschlagen"],
    ["lightroomPackage.status", "stale"], ["lightroomPackage.needsRebuild", true],
    ["lightroomPackage.masterVersion", "other-master"], ["lightroomPackage.packageVersion", "old-master"],
    ["lightroomPackage.packageVersion", undefined], ["lightroomPackage.error", "Paket fehlt"],
    ["corrections.pending", true], ["corrections.error", "Korrekturen nicht lesbar"],
    ["identities.pending", true], ["identities.error", "Identitäten nicht lesbar"],
    ["buildJob.status", "paused"], ["updateWorkflow.active", true],
    ["updateWorkflow.error", "Quellenfehler"],
    ["updateWorkflow.status", "failed"],
    ["updateWorkflow", { updateRunId: "waiting", status: "waiting-decisions", active: false }],
  ];
  for (const [field, value] of invalid) {
    const status = currentStatus();
    const parts = field.split(".");
    const target = parts.length === 2 ? status[parts[0]] : status;
    target[parts.at(-1)] = value;
    assert.equal(masterUi.activePairIsCurrent(status), false, `${field}: kein falscher Erfolg`);
  }
});

test("Historische Quellenzuordnungen liegen neutral in geschlossenen Details, nicht im Entscheidungsbereich", () => {
  const visible = elements(), status = currentStatus(), calls = [];
  const controller = masterUi.createTaxonomyMasterController({ state: {}, elements: visible,
    fetchJson: async (url) => { calls.push(url); return status; }, escapeHtml: String,
    showQuickConfirm: async () => false, renderDatabaseStatus() {} });
  visible.taxonomyMasterTechnicalDetails.open = true;
  controller.render(status);
  assert.equal(visible.taxonomyMasterConflicts.hidden, true);
  assert.equal(visible.taxonomyMasterConflicts.innerHTML, "");
  assert.equal(visible.taxonomyMasterTechnicalDetails.hidden, false);
  assert.equal(visible.taxonomyMasterTechnicalDetails.open, false);
  assert.match(visible.taxonomyMasterDetail.textContent, /Technisch abgeschlossen · keine offenen Entscheidungen/);
  const copy = visible.taxonomyMasterTechnicalDetailsCopy.innerHTML;
  assert.match(copy, /187 neue CoL-Zuordnungen vorerst nicht übernommen/);
  assert.match(copy, /Im aktiven Master bleiben die bisherigen Einträge, Master-IDs und eigenen Namen erhalten/);
  assert.match(copy, /fachlich noch nicht vollständig geklärt/);
  assert.match(copy, /keine aktuell offenen Entscheidungen/);
  assert.match(copy, /automatische Auflösung beim nächsten Update ist nicht garantiert/);
  assert.doesNotMatch(copy, /taxonomy-master-conflict|data-master-conflict-save|<button/);
  assert.equal(calls.length, 0, "Darstellung startet keine Aktion");
  visible.taxonomyMasterTechnicalDetails.open = true;
  controller.render(status);
  assert.equal(visible.taxonomyMasterTechnicalDetails.open, true, "Lesen bleibt bei unverändertem Status möglich");
  status.lifecycle.active.candidateId = "new-master";
  controller.render(status);
  assert.equal(visible.taxonomyMasterTechnicalDetails.open, false, "Neuer Stand beginnt eingeklappt");
  status.lifecycle.active.classificationDeferrals.total = 1;
  controller.render(status);
  assert.match(visible.taxonomyMasterTechnicalDetailsCopy.innerHTML, /1 neue CoL-Zuordnung vorerst nicht übernommen/);
  status.lifecycle.active.classificationDeferrals.total = 0;
  visible.taxonomyMasterTechnicalDetails.open = true;
  controller.render(status);
  assert.equal(visible.taxonomyMasterTechnicalDetails.hidden, true);
  assert.equal(visible.taxonomyMasterTechnicalDetails.open, false);
  assert.equal(visible.taxonomyMasterTechnicalDetailsCopy.innerHTML, "");
});

test("Fehler, laufender Aufbau und echte Konflikte bleiben trotz historischer Zurückstellungen sichtbar", () => {
  const visible = elements(), status = currentStatus();
  const controller = masterUi.createTaxonomyMasterController({ state: {}, elements: visible, escapeHtml: String,
    fetchJson: async () => status, showQuickConfirm: async () => false, renderDatabaseStatus() {} });
  status.status = "failed"; status.error = "Masterprüfung fehlgeschlagen";
  controller.render(status);
  assert.match(visible.taxonomyMasterDetail.textContent, /Masterprüfung fehlgeschlagen/);
  assert.doesNotMatch(visible.taxonomyMasterDetail.textContent, /Technisch abgeschlossen|keine offenen Entscheidungen/);
  status.status = "building"; status.active = true; status.error = ""; status.message = "Suchindex wird aufgebaut";
  controller.render(status);
  assert.match(visible.taxonomyMasterDetail.textContent, /Suchindex wird aufgebaut/);
  assert.equal(visible.taxonomyMasterProgress.hidden, false);
  status.status = "ready"; status.active = false;
  status.lifecycle.candidate = { candidateId: "review", classificationDeferrals: { total: 1 } };
  status.lifecycle.conflicts = [{ conflict_id: "ordinary", conflict_type: "changed-value", field_name: "german-name", german_name: "Weißstorch" }];
  status.lifecycle.blockingConflictCount = 1;
  controller.render(status);
  assert.equal(visible.taxonomyMasterConflicts.hidden, false);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /Weißstorch.*data-master-conflict-save/s);
  assert.match(visible.taxonomyMasterDetail.textContent, /1 Konflikt/);
  assert.match(visible.taxonomyMasterTechnicalDetailsCopy.innerHTML, /Im geprüften Kandidaten bleiben/);
});

test("FN-Nutzung: Öffnen liest nur Status, Abbruch bestätigt nichts und frische Zustimmung bindet alle Kataloge", async () => {
  for (const accept of [false, true]) {
    const calls = [], prompts = [], messages = [], status = readyStatus();
    const controller = masterUi.createTaxonomyMasterController({ state: { setPipelineMessage: (message) => messages.push(message) }, elements: elements(),
      fetchJson: async (url, options) => {
        calls.push({ url, payload: options?.body ? JSON.parse(options.body) : null });
        if (url.endsWith("/catalog-usage/preview")) return { token: "receipt", catalogs: [{ catalogPath: "current.lrcat", totalPhotos: 129555, assignedPhotos: 4787 }] };
        if (url.endsWith("/catalog-usage/save")) return { saved: true };
        return status;
      }, showQuickConfirm: async (prompt) => { prompts.push(prompt); return accept; }, escapeHtml: String,
      renderDatabaseStatus() {}, setActionMessage: (message) => messages.push(message) });
    controller.setup(); await new Promise(setImmediate);
    assert.ok(calls.every((call) => !call.payload));
    await controller.confirmCatalogUsage();
    assert.match(prompts[0].message, /129\.555 Fotos.*4\.787.*alle deine FN-Kataloge.*seit ihrer Erfassung keine FN-Zuweisungen/);
    const writes = calls.filter((call) => call.url.endsWith("/catalog-usage/save"));
    assert.equal(writes.length, accept ? 1 : 0);
    if (accept) assert.deepEqual(writes[0].payload, { token: "receipt", confirmed: true, allCatalogsConfirmed: true, unchangedSinceCapture: true });
    assert.ok(calls.every((call) => !/\/(build|activate)$/.test(call.url)));
  }
});

test("Unbenutzte Klassifikationen nutzen globale Richtlinie, fehlende Nutzung und Fehler starten keinen Aufbau", async () => {
  for (const mode of ["missing", "error", "ready"]) {
    const calls = [], status = readyStatus(), messages = [];
    const controller = masterUi.createTaxonomyMasterController({ state: { setPipelineMessage: (message) => messages.push(message) }, elements: elements(),
      fetchJson: async (url, options) => {
        calls.push({ url, payload: options?.body ? JSON.parse(options.body) : null });
        if (url.endsWith("/automatic-preview")) return mode === "missing" ? { available: false, message: "Nutzung fehlt" }
          : { available: true, token: "fresh", candidateId: "candidate", usageRevision: "usage", matching: 2, deferred: 1 };
        if (url.endsWith("/automatic-save")) { if (mode === "error") throw new Error("Katalog verändert"); return { saved: true, message: "Vorgemerkt" }; }
        return status;
      }, showQuickConfirm: async () => { throw new Error("Kein erneutes Einzelbestätigen nach Richtlinienfreigabe"); }, escapeHtml: String,
      renderDatabaseStatus() {}, setActionMessage: (message) => messages.push(message) });
    controller.render(status); await controller.automaticClassification();
    assert.equal(calls.filter((call) => call.url.endsWith("/automatic-save")).length, mode === "missing" ? 0 : 1);
    assert.ok(calls.every((call) => !/\/(build|activate)$/.test(call.url)));
    assert.ok(messages.some((value) => value.includes(mode === "missing" ? "Nutzung fehlt" : mode === "error" ? "Katalog verändert" : "Vorgemerkt")));
  }
});

test("Mastervorschau zeigt Differenzen und gibt nur geprüfte Aktionen frei", () => {
  const visible = elements();
  const controller = masterUi.createTaxonomyMasterController({
    state: {},
    elements: visible,
    fetchJson: async () => readyStatus(),
    escapeHtml: (value) => String(value),
    showQuickConfirm: async () => true,
    renderDatabaseStatus() {},
  });

  controller.render(readyStatus());
  assert.equal(
    visible.taxonomyMasterSummary.textContent,
    "52 Taxa · 41 deutsche Namen · 49 englische Namen",
  );
  assert.match(visible.taxonomyMasterDetail.textContent, /bereit zur Übernahme/);
  assert.match(visible.taxonomyMasterDiff.innerHTML, /1 Neue Taxa/);
  assert.match(visible.taxonomyMasterDiff.innerHTML, /1 Deutsche\/englische Namen/);
  assert.equal(visible.taxonomyMasterActivateButton.disabled, false);
  assert.equal(visible.taxonomyMasterRollbackButton.disabled, false);
});

test("Mastervorschau akzeptiert kompakte Differenzzähler für große Kandidaten", () => {
  const visible = elements();
  const status = readyStatus();
  status.lifecycle.candidate.diff = {
    newTaxa: 115_291,
    closedReferenceGaps: 42,
    changedScientificNames: 3,
    changedNames: 8,
    newSynonyms: 100_000,
    staleTaxa: 4,
    removedTaxa: 21,
  };
  const controller = masterUi.createTaxonomyMasterController({
    state: {},
    elements: visible,
    fetchJson: async () => status,
    escapeHtml: (value) => String(value),
    showQuickConfirm: async () => true,
    renderDatabaseStatus() {},
  });

  controller.render(status);
  assert.match(visible.taxonomyMasterDiff.innerHTML, /115\.291 Neue Taxa/);
  assert.match(visible.taxonomyMasterDiff.innerHTML, /25 Veraltet\/entfernt/);
});

test("offene Namenskonflikte werden deutsch erklärt und mit passenden Entscheidungen dargestellt", () => {
  const visible = elements();
  const status = readyStatus();
  status.lifecycle.canActivate = false;
  status.lifecycle.conflicts = [{
    conflict_id: "conflict-1",
    canonical_scientific_name: "Panthera pardus",
    german_name: "Leopard",
    field_name: "german-name",
    conflict_type: "changed-value",
    current_value: "Leopard",
    current_origin_kind: "project",
    current_provider: "project",
    candidate_value: "Panter",
    candidate_provider: "catalogue-of-life",
  }];
  status.lifecycle.blockingConflicts = status.lifecycle.conflicts;
  status.lifecycle.blockingConflictCount = 1;
  const controller = masterUi.createTaxonomyMasterController({
    state: {},
    elements: visible,
    fetchJson: async () => status,
    escapeHtml: (value) => String(value),
    showQuickConfirm: async () => true,
    renderDatabaseStatus() {},
  });

  controller.render(status);
  assert.equal(visible.taxonomyMasterConflicts.hidden, false);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /Leopard/);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /Panthera pardus/);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /deine Projektdaten/);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /Catalogue of Life/);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /Bisherigen Wert behalten/);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /Neuen Referenzwert übernehmen/);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /Neuen Namen zusätzlich suchbar machen/);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /Bisherigen Wert dauerhaft schützen/);
  assert.equal(visible.taxonomyMasterActivateButton.disabled, true);
});

test("Hierarchiekonflikte bieten keine fachlich falsche Namensalias-Aktion an", () => {
  const options = masterUi.conflictDecisionOptions("family");
  assert.deepEqual(
    Array.from(options, ([value]) => value),
    ["keep-current", "accept-candidate", "protect-manual"],
  );
});

test("kompakter Status zeigt die Gesamtzahl auch bei begrenzter Konfliktliste", () => {
  const visible = elements();
  const status = readyStatus();
  status.lifecycle.canActivate = false;
  status.lifecycle.conflicts = [];
  status.lifecycle.blockingConflicts = [];
  status.lifecycle.blockingConflictCount = 26_737;
  const controller = masterUi.createTaxonomyMasterController({
    state: {},
    elements: visible,
    fetchJson: async () => status,
    escapeHtml: (value) => String(value),
    showQuickConfirm: async () => true,
    renderDatabaseStatus() {},
  });

  controller.render(status);
  assert.match(visible.taxonomyMasterDetail.textContent, /26737 Konflikt/);
  assert.equal(visible.taxonomyMasterConflicts.hidden, false);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /26\.737 technische Konflikte/);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /nicht als Liste von Einzelentscheidungen/);
  assert.equal(visible.taxonomyMasterActivateButton.disabled, true);
});

test("Reichs-/Quellenfälle werden auch oberhalb des Listenlimits gebündelt und ohne falsche Feldentscheidung dargestellt", () => {
  const visible = elements(), status = readyStatus();
  status.lifecycle.canActivate = false;
  status.lifecycle.blockingConflictCount = 2173;
  status.lifecycle.conflicts = [{ conflict_id: `classification_${"a".repeat(64)}`, conflict_type: "ambiguous-match",
    field_name: "kingdom", canonical_scientific_name: "Testus classificatus" }];
  status.lifecycle.candidate.classificationReview = { total: 2173, matchingProviderId: 1693,
    differentProviderId: 6, ambiguousProviderId: 2, missingProviderId: 472, groupCount: 1,
    groups: [{ previousKingdom: "Bacteria", newKingdom: "Bacillati", category: "matching-provider-id", count: 1143, examples: ["Testus classificatus"] }] };
  const controller = masterUi.createTaxonomyMasterController({ state: {}, elements: visible,
    fetchJson: async () => status, escapeHtml: (value) => String(value), showQuickConfirm: async () => true, renderDatabaseStatus() {} });
  controller.render(status);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /2\.173 Fälle/);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /1\.693 mit übereinstimmender iNaturalist-ID/);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /480 ohne eindeutigen/);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /Abweichende Anbieter-ID: 6 · Mehrdeutige Belege: 2 · Fehlender Verweis: 472/);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /Bacteria → Bacillati: 1\.143 Fälle/);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /gleiche Anbieter-ID · Prüfung erforderlich/);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /noch nicht verfügbar/);
  assert.doesNotMatch(visible.taxonomyMasterConflicts.innerHTML, /technische Konflikte|data-master-conflict-save|<select/);
  assert.equal(visible.taxonomyMasterActivateButton.disabled, true);
  assert.equal(masterUi.conflictPresentation(status.lifecycle.conflicts[0]).identityReviewRequired, true);
  assert.equal(masterUi.conflictRecommendation(status.lifecycle.conflicts[0]).decision, null);
});

test("gebündelte Identitätsfälle verdecken keine weiteren normalen Konflikte", () => {
  const visible = elements(), status = readyStatus();
  status.lifecycle.canActivate = false;
  status.lifecycle.blockingConflictCount = 2;
  status.lifecycle.candidate.classificationReview = { total: 1, matchingProviderId: 0, groups: [], groupCount: 0 };
  status.lifecycle.conflicts = [{ conflict_id: `classification_${"a".repeat(64)}`, conflict_type: "ambiguous-match" },
    { conflict_id: "ordinary", conflict_type: "changed-value", field_name: "german-name", german_name: "Weißstorch" }];
  const controller = masterUi.createTaxonomyMasterController({ state: {}, elements: visible,
    fetchJson: async () => status, escapeHtml: (value) => String(value), showQuickConfirm: async () => true, renderDatabaseStatus() {} });
  controller.render(status);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /1 Fall/);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /data-master-conflict="ordinary"/);
  assert.equal((visible.taxonomyMasterConflicts.innerHTML.match(/data-master-conflict-save/g) || []).length, 1);
});

test("Bündelübernahme verlangt gebundene Rückfrage, Abbruch schreibt nichts und startet keinen Aufbau", async () => {
  const visible = elements(), status = readyStatus(), calls = [], prompts = [];
  status.lifecycle.candidate.candidateId = "fixture-candidate";
  status.lifecycle.canActivate = false;
  status.lifecycle.blockingConflictCount = 2173;
  status.lifecycle.candidate.classificationReview = { total: 2173, matchingProviderId: 1693, acceptanceAvailable: true, groups: [] };
  let accept = false;
  const controller = masterUi.createTaxonomyMasterController({ state: {}, elements: visible,
    fetchJson: async (url, options) => {
      calls.push({ url, payload: options?.body ? JSON.parse(options.body) : null });
      if (url.endsWith("/classification/preview")) return { token: "bound-preview", count: 1693, remaining: 480,
        groups: [{ previousKingdom: "Bacteria", newKingdom: "Bacillati", count: 100 }] };
      if (url.endsWith("/classification/save")) return { saved: true, pending: true, message: "Vorgemerkt" };
      return status;
    }, escapeHtml: String, showQuickConfirm: async (prompt) => { prompts.push(prompt); return accept; }, renderDatabaseStatus() {} });
  controller.render(status);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /data-classification-preview>/);
  await controller.reviewClassification();
  assert.equal(calls.filter((call) => call.url.endsWith("/save")).length, 0);
  assert.match(prompts[0].message, /1\.693 Fälle.*480 unklare Fälle.*ursprünglichen Master-IDs/);
  assert.match(prompts[0].message, /kein automatischer Aufbau, Paketwechsel oder Fotoabgleich/);
  accept = true;
  await controller.reviewClassification();
  const writes = calls.filter((call) => call.url.endsWith("/save"));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.token, "bound-preview");
  assert.equal(writes[0].payload.confirmed, true);
  await controller.reviewClassification();
  assert.equal(calls.filter((call) => call.url.endsWith("/save")).length, 1);
  assert.ok(calls.every((call) => !/\/(build|activate|rollback)$/.test(call.url)));
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /data-classification-preview disabled/);
  status.identities = { pending: false, candidateIncludesCurrent: false };
  controller.render(status);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /data-classification-preview>/, "Nach explizitem Verwerfen wieder prüfbar");
});

test("Doppelklick während der Bündelrückfrage öffnet nur eine Vorschau und schreibt bei Abbruch nichts", async () => {
  const visible = elements(), status = readyStatus(), calls = [];
  status.lifecycle.candidate.classificationReview = { total: 1, matchingProviderId: 1, acceptanceAvailable: true, groups: [] };
  status.lifecycle.blockingConflictCount = 1;
  let closePrompt;
  const controller = masterUi.createTaxonomyMasterController({ state: {}, elements: visible,
    fetchJson: async (url) => { calls.push(url); return url.endsWith("/preview") ? { token: "current", count: 1, remaining: 0 } : status; },
    escapeHtml: String, showQuickConfirm: () => new Promise((resolve) => { closePrompt = resolve; }), renderDatabaseStatus() {} });
  controller.render(status);
  const pending = controller.reviewClassification();
  await Promise.resolve();
  assert.equal(visible.taxonomyMasterBuildButton.disabled, true);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /data-classification-preview disabled/);
  await controller.reviewClassification();
  closePrompt(false);
  await pending;
  assert.equal(calls.filter((url) => url.endsWith("/preview")).length, 1);
  assert.equal(calls.filter((url) => url.endsWith("/save")).length, 0);
  assert.equal(visible.taxonomyMasterBuildButton.disabled, false);
});

test("fehlgeschlagene Bündelbestätigung ist erneut prüfbar; laufende oder alte Vormerkung sperrt den Button", async () => {
  const visible = elements(), status = readyStatus(), calls = [], messages = [];
  status.lifecycle.candidate.classificationReview = { total: 1, matchingProviderId: 1, acceptanceAvailable: true, groups: [] };
  status.lifecycle.blockingConflictCount = 1;
  let first = true;
  const controller = masterUi.createTaxonomyMasterController({ state: { setPipelineMessage: (message) => messages.push(message) }, elements: visible,
    fetchJson: async (url) => {
      calls.push(url);
      if (url.endsWith("/preview")) return { token: "fresh", count: 1, remaining: 0, groups: [] };
      if (url.endsWith("/save")) { if (first) { first = false; throw new Error("Vorschau veraltet"); } return { message: "Vorgemerkt" }; }
      return status;
    }, escapeHtml: String, showQuickConfirm: async () => true, renderDatabaseStatus() {} });
  controller.render(status);
  await controller.reviewClassification();
  assert.ok(messages.includes("Vorschau veraltet"));
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /data-classification-preview>/);
  await controller.reviewClassification();
  assert.equal(calls.filter((url) => url.endsWith("/save")).length, 2);
  status.lifecycle.candidate.candidateId = "fresh-candidate";
  status.identities = { pending: true, candidateIncludesCurrent: false };
  controller.render(status);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /data-classification-preview disabled/);
  await controller.reviewClassification();
  assert.equal(calls.filter((url) => url.endsWith("/save")).length, 2);
});

test("unklare Fälle verlangen separate Rückfrage; Abbruch, Fehler, Wiederholung und neue Kandidaten bleiben bedienbar", async () => {
  const visible = elements(), status = readyStatus(), calls = [], prompts = [];
  status.lifecycle.candidate.candidateId = "candidate";
  status.lifecycle.candidate.classificationReview = { total: 4, matchingProviderId: 1, acceptanceAvailable: true, deferralAvailable: true, groups: [] };
  status.lifecycle.canActivate = false;
  status.lifecycle.blockingConflictCount = 4;
  let accept = false, fail = true;
  const controller = masterUi.createTaxonomyMasterController({ state: {}, elements: visible, escapeHtml: String, renderDatabaseStatus() {},
    showQuickConfirm: async (prompt) => { prompts.push(prompt); return accept; },
    fetchJson: async (url, options) => {
      calls.push({ url, payload: options?.body ? JSON.parse(options.body) : null });
      if (url.endsWith("deferral-preview")) return { token: "bound-hold", count: 3, groups: [] };
      if (url.endsWith("deferral-save")) { if (fail) { fail = false; throw new Error("Speichern fehlgeschlagen"); } return { message: "Zurückstellung vorgemerkt" }; }
      return status;
    } });
  controller.render(status);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /data-classification-defer>/);
  await controller.reviewClassification(true);
  assert.equal(calls.filter((call) => call.url.endsWith("deferral-save")).length, 0);
  assert.match(prompts[0].message, /3 unklare Fälle.*bisherigen Arten, Master-IDs/);
  assert.match(prompts[0].message, /Geänderte Quellenfälle werden erneut offen geprüft/);
  accept = true;
  await controller.reviewClassification(true);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /data-classification-defer>/);
  await controller.reviewClassification(true);
  const saved = calls.filter((call) => call.url.endsWith("deferral-save"));
  assert.equal(saved.length, 2);
  assert.equal(saved[1].payload.token, "bound-hold");
  assert.equal(saved[1].payload.confirmed, true);
  await controller.reviewClassification(true);
  assert.equal(calls.filter((call) => call.url.endsWith("deferral-save")).length, 2);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /data-classification-defer disabled/);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /data-classification-preview>/);
  status.lifecycle.candidate.candidateId = "new-candidate";
  controller.render(status);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /data-classification-defer>/);
  assert.ok(calls.every((call) => !/\/(build|activate|rollback)$/.test(call.url)));
});

test("Zurückstellungen stehen nur in Details und kompatible Vormerkungen erlauben das zweite Bündel", () => {
  const visible = elements(), status = readyStatus();
  status.lifecycle.candidate.candidateId = "same-candidate";
  status.identities = { pending: true, candidateIncludesCurrent: false, classificationCandidateId: "same-candidate" };
  status.lifecycle.blockingConflictCount = 1;
  status.lifecycle.candidate.classificationReview = { total: 1, matchingProviderId: 0, deferralAvailable: true, groups: [] };
  const controller = masterUi.createTaxonomyMasterController({ state: {}, elements: visible, escapeHtml: String,
    renderDatabaseStatus() {}, fetchJson: async () => status, showQuickConfirm: async () => false });
  controller.render(status);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /data-classification-defer>/);
  status.identities.classificationCandidateId = "foreign-candidate";
  controller.render(status);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /data-classification-defer disabled/);
  status.lifecycle.candidate.classificationReview = { total: 0 };
  status.lifecycle.candidate.classificationDeferrals = { total: 480 };
  status.lifecycle.blockingConflictCount = 0;
  controller.render(status);
  assert.equal(visible.taxonomyMasterConflicts.hidden, true);
  assert.equal(visible.taxonomyMasterTechnicalDetails.open, false);
  assert.match(visible.taxonomyMasterTechnicalDetailsCopy.innerHTML, /480 neue CoL-Zuordnungen vorerst nicht übernommen/);
  assert.doesNotMatch(visible.taxonomyMasterConflicts.innerHTML, /data-master-conflict-save/);
  delete status.lifecycle.candidate;
  status.lifecycle.active.classificationDeferrals = { total: 480 };
  controller.render(status);
  assert.equal(visible.taxonomyMasterConflicts.hidden, true);
  assert.match(visible.taxonomyMasterTechnicalDetailsCopy.innerHTML, /480 neue CoL-Zuordnungen vorerst nicht übernommen/);
});

test("laufender Masteraufbau blockiert parallele Aktionen und zeigt Fortschritt", () => {
  const visible = elements();
  const status = {
    status: "building",
    active: true,
    message: "Master-Kandidat wird aufgebaut",
    progressPercent: 44,
    progressPhase: "Masterdatenbank schreiben",
    progressCurrent: 1200,
    progressTotal: 3000,
    startedAt: new Date(Date.now() - 65_000).toISOString(),
    lifecycle: {},
  };
  const controller = masterUi.createTaxonomyMasterController({
    state: {},
    elements: visible,
    fetchJson: async () => status,
    escapeHtml: (value) => String(value),
    showQuickConfirm: async () => true,
    renderDatabaseStatus() {},
  });

  controller.render(status);
  assert.equal(visible.taxonomyMasterProgress.hidden, false);
  assert.equal(visible.taxonomyMasterProgress.value, 40, "Messwert 1.200/3.000 ersetzt alte Phasenmarke 44");
  assert.match(visible.taxonomyMasterProgressDetail.textContent, /Schritt 3 von 7.*Masterdatenbank schreiben/);
  assert.match(visible.taxonomyMasterProgressDetail.textContent, /1\.200 von 3\.000/);
  assert.match(visible.taxonomyMasterProgressDetail.textContent, /Laufzeit 1:0[45]/);
  assert.equal(visible.taxonomyMasterBuildButton.disabled, true);
  assert.equal(visible.taxonomyMasterActivateButton.disabled, true);
  assert.equal(visible.taxonomyMasterRollbackButton.disabled, true);
});

test("automatischer Lightroom-Paketbau nutzt denselben sichtbaren Fortschrittsblock", () => {
  const visible = elements();
  const status = {
    status: "syncing-lightroom",
    active: true,
    message: "Taxa werden exportiert.",
    progressPercent: 42,
    progressPhase: "Lightroom-Suchpaket · Taxonomieexport",
    startedAt: new Date(Date.now() - 10_000).toISOString(),
    lifecycle: {},
  };
  const controller = masterUi.createTaxonomyMasterController({
    state: {},
    elements: visible,
    fetchJson: async () => status,
    escapeHtml: (value) => String(value),
    showQuickConfirm: async () => true,
    renderDatabaseStatus() {},
  });

  controller.render(status);
  assert.equal(visible.taxonomyMasterProgress.hidden, false);
  assert.equal(visible.taxonomyMasterProgress.value, undefined, "Keine Messmenge: unbestimmter Balken statt erfundener 42 %");
  assert.match(visible.taxonomyMasterProgressDetail.textContent, /Lightroom-Suchpaket · Taxonomieexport/);
  assert.equal(visible.taxonomyMasterBuildButton.disabled, true);
});
