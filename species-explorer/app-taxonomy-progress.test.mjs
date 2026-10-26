import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
new vm.Script(await readFile(new URL("./public/app-taxonomy-progress.js", import.meta.url), "utf8")).runInContext(context);
const { taxonomyProgressPresentation: view, measuredProgress } = context.SpeciesExplorerTaxonomyProgress;
const build = (phase, extra = {}) => ({ status: "building", active: true, action: "build", progressPhase: phase, ...extra });
const pair = { status: "current" };

const localRestart = (workflow = {}, master = {}) => ({
  status: "failed", active: false, message: "Alter Masteraufbau fehlgeschlagen", error: "Alter Quellenbelegfehler",
  progressPhase: "Masterdatenbank schreiben", progressCurrent: 750, progressTotal: 1000,
  buildJob: { available: true, id: "old-build", updateRunId: "old-update", status: "failed", error: "Alter Quellenbelegfehler",
    checkpoint: { written: 500, total: 1000 }, progress: { phase: "Masterdatenbank schreiben", current: 750, total: 1000 } },
  updateWorkflow: { updateRunId: "new-update", status: "waiting-lightroom", active: true, phase: "start",
    decision: "rebuild-master", freshUsageCapture: true, sourceCompleted: true, buildStarted: false,
    restartGuard: { identity: { updateRunId: "old-update", buildJobId: "old-build" } },
    message: "Neue FN-Erfassung läuft", error: "", ...workflow }, ...master,
});

const classificationFollowup = () => ({
  ...build("Masterdatenbank schreiben", { progressCurrent: 10, progressTotal: 100 }),
  error: "", buildJob: { available: true, id: "followup-build", updateRunId: "own-update", status: "building" },
  lifecycle: { candidate: { candidateId: "first-candidate", classificationReview: { total: 187 } }, blockingConflictCount: 187 },
  identities: { revision: "saved-decision", pending: true, candidateIncludesCurrent: false, classificationCandidateId: "first-candidate" },
  updateWorkflow: { updateRunId: "own-update", status: "building", active: true, phase: "build", buildStarted: true,
    automaticFollowupRevision: "saved-decision", automaticAttemptedCandidates: ["first-candidate"], error: "" },
});

const protectedRetainedCandidate = (workflow = {}, master = {}) => localRestart({
  restartGuard: { identity: { updateRunId: "old-update", buildJobId: "old-build" }, binding: { retainedCandidate: {
    candidateId: "historical-candidate", buildJobRevision: "a".repeat(64), buildJobId: "historical-ready-build", updateRunId: "old-update",
    manifestSha256: "b".repeat(64), recipeSha256: "c".repeat(64), stateSha256: "d".repeat(64) } } }, ...workflow,
}, { lifecycle: { active: { candidateId: "active-master" }, candidate: { candidateId: "historical-candidate", buildJobRevision: "a".repeat(64),
  classificationReview: { total: 187 } }, blockingConflictCount: 189 }, ...master });

test("geschützter Ersatzauftrag zeigt den gebundenen historischen Kandidaten als Vorgänger, nicht als neuen Entscheidungsauftrag", () => {
  const presentation = context.SpeciesExplorerTaxonomyProgress.taxonomyMasterPresentationSnapshot;
  for (const [status, phase] of [["waiting-lightroom", "start"], ["waiting-usage", "start"], ["building", "build"]]) {
    const master = protectedRetainedCandidate({ status, phase, buildStarted: phase === "build" });
    const before = JSON.stringify(master), snapshot = presentation(master);
    assert.equal(snapshot.lifecycle.candidate, null);
    assert.equal(snapshot.lifecycle.blockingConflictCount, 2, "Andere Blockaden bleiben sichtbar");
    const result = view({ master });
    assert.match(result.detail, /Erhaltener Kandidat.*vorherigen Auftrag/);
    assert.doesNotMatch(result.detail, /187.*Entscheidung erforderlich|187.*benötigen eine Entscheidung/);
    assert.equal(result.completed, false);
    assert.equal(JSON.stringify(master), before);
  }
  const ownBuilding = protectedRetainedCandidate({ status: "building", phase: "build", buildStarted: true }, build("Masterdatenbank schreiben", {
    error: "", buildJob: { available: true, id: "new-build", updateRunId: "new-update", status: "building" } }));
  assert.equal(presentation(ownBuilding).lifecycle.candidate, null);
  assert.equal(view({ master: ownBuilding }).running, true);
});

test("historischer Kandidatenfilter benötigt exakte gespeicherte Herkunft und endet vor neuem eigenem fertigen Kandidaten", () => {
  const presentation = context.SpeciesExplorerTaxonomyProgress.taxonomyMasterPresentationSnapshot;
  const master = protectedRetainedCandidate(), guard = master.updateWorkflow.restartGuard;
  const changes = [
    { updateWorkflow: { ...master.updateWorkflow, restartGuard: { ...guard, binding: {} } } },
    { updateWorkflow: { ...master.updateWorkflow, restartGuard: { ...guard, binding: { retainedCandidate: { ...guard.binding.retainedCandidate, updateRunId: "foreign-update" } } } } },
    { updateWorkflow: { ...master.updateWorkflow, restartGuard: { ...guard, binding: { retainedCandidate: { ...guard.binding.retainedCandidate, buildJobId: "" } } } } },
    { updateWorkflow: { ...master.updateWorkflow, restartGuard: { ...guard, binding: { retainedCandidate: { ...guard.binding.retainedCandidate, manifestSha256: "" } } } } },
    { updateWorkflow: { ...master.updateWorkflow, restartGuard: { ...guard, binding: { retainedCandidate: { ...guard.binding.retainedCandidate, recipeSha256: "invalid" } } } } },
    { updateWorkflow: { ...master.updateWorkflow, restartGuard: { ...guard, binding: { retainedCandidate: { ...guard.binding.retainedCandidate, stateSha256: "" } } } } },
    { updateWorkflow: { ...master.updateWorkflow, freshUsageCapture: false } },
    { updateWorkflow: { ...master.updateWorkflow, updateRunId: "old-update" } },
    { updateWorkflow: { ...master.updateWorkflow, sourceCompleted: false } },
    { updateWorkflow: { ...master.updateWorkflow, active: false } },
    { updateWorkflow: { ...master.updateWorkflow, status: "failed", active: false, error: "Eigener Fehler" } },
    { updateWorkflow: { ...master.updateWorkflow, status: "waiting-decisions", phase: "candidate" } },
    { lifecycle: { ...master.lifecycle, candidate: { ...master.lifecycle.candidate, buildJobRevision: "different-recipe" } } },
    { lifecycle: { ...master.lifecycle, candidate: { ...master.lifecycle.candidate, candidateId: "new-undecided-candidate" } } },
    { buildJob: { available: true, id: "own-ready", updateRunId: "new-update", status: "ready" } },
    { buildJob: { available: true, id: "foreign-build", updateRunId: "foreign-update", status: "building" } },
    { buildJob: { available: true, id: "own-failed", updateRunId: "new-update", status: "failed", error: "Neuer Schreibfehler" } },
    { error: "Neuer Eingangsfehler" },
  ];
  for (const change of changes) {
    const current = { ...master, ...change }, before = JSON.stringify(current), snapshot = presentation(current);
    assert.equal(snapshot.lifecycle.candidate.candidateId, current.lifecycle.candidate.candidateId, JSON.stringify(change));
    assert.equal(snapshot.lifecycle.blockingConflictCount, 189);
    assert.equal(JSON.stringify(current), before);
    if (change.error || change.buildJob?.error) assert.equal(view({ master: current }).state, "fehlgeschlagen");
  }
});

test("eigener gebundener Folgeaufbau erklärt gespeicherte Klassifikationsentscheidungen zum vorherigen Kandidaten", () => {
  const master = classificationFollowup(), before = JSON.stringify(master);
  const result = view({ master });
  assert.equal(result.running, true);
  assert.equal(result.completed, false);
  assert.equal(result.step, 3);
  assert.match(result.detail, /187 Klassifikationsfälle gehören zum vorherigen Kandidaten/);
  assert.match(result.detail, /Der laufende Folgeaufbau verarbeitet die gespeicherte Entscheidung/);
  assert.doesNotMatch(result.detail, /Entscheidung erforderlich|benötigen eine Entscheidung/);
  assert.equal(JSON.stringify(master), before);
  const history = view({ master: { ...master, updateWorkflow: { ...master.updateWorkflow,
    automaticAttemptedCandidates: ["older-candidate", "first-candidate"] } } });
  assert.match(history.detail, /187 Klassifikationsfälle gehören zum vorherigen Kandidaten/);
});

test("Folgehinweis braucht exakte Kandidaten-, Revisions- und Auftragsbindung; echte Fehler bleiben bestehen", () => {
  const master = classificationFollowup();
  for (const changes of [
    { updateWorkflow: { ...master.updateWorkflow, status: "paused", active: false } },
    { updateWorkflow: { ...master.updateWorkflow, active: false } },
    { updateWorkflow: { ...master.updateWorkflow, buildStarted: false } },
    { updateWorkflow: { ...master.updateWorkflow, phase: "candidate" } },
    { updateWorkflow: { ...master.updateWorkflow, automaticFollowupRevision: "changed-revision" } },
    { updateWorkflow: { ...master.updateWorkflow, automaticAttemptedCandidates: ["another-candidate"] } },
    { identities: { ...master.identities, pending: false } },
    { identities: { ...master.identities, candidateIncludesCurrent: true } },
    { identities: { ...master.identities, classificationCandidateId: "another-candidate" } },
    { identities: { ...master.identities, revision: "" }, updateWorkflow: { ...master.updateWorkflow, automaticFollowupRevision: "" } },
    { buildJob: { ...master.buildJob, id: "" } },
    { buildJob: { ...master.buildJob, available: false } },
    { buildJob: { ...master.buildJob, updateRunId: "foreign-update" } },
    { buildJob: { ...master.buildJob, status: "failed", error: "Eigener Schreibfehler" } },
    { lifecycle: { ...master.lifecycle, blockingConflictCount: 186 } },
    { error: "Eigener Schreibfehler" },
  ]) {
    const result = view({ master: { ...master, ...changes } });
    assert.doesNotMatch(result.detail, /Klassifikationsfälle gehören zum vorherigen Kandidaten/, JSON.stringify(changes));
    if (changes.error || changes.buildJob?.error) assert.equal(result.state, "fehlgeschlagen");
  }
});

test("eigener lokaler Ersatzauftrag zeigt seine Wartephase statt Fehler und Schreibfortschritt des gebundenen Altauftrags", () => {
  for (const status of ["waiting-lightroom", "waiting-usage"]) {
    const master = localRestart({ status });
    const before = JSON.stringify(master);
    const result = view({ master });
    assert.equal(result.state, status === "waiting-lightroom" ? "Warte auf Lightroom-Schließung" : "FN-Nutzung prüfen");
    assert.equal(result.step, null);
    assert.equal(result.percent, null);
    assert.equal(result.running, true);
    assert.equal(result.completed, false);
    assert.match(result.detail, /Neue FN-Erfassung läuft/);
    assert.doesNotMatch(result.detail + result.compact, /fehlgeschlagen|3\/7|Schritt 3|750|500|Quellenbelegfehler/);
    assert.equal(JSON.stringify(master), before, "Der Darstellungsweg verändert den gespeicherten Status nicht");
  }
});

test("eigene Aufbauvorbereitung vor dem neuen Rezept zeigt Schritt 2 und erhält neue Messungen sowie echte Fehler", () => {
  const workflow = { status: "building", active: true, phase: "build", buildStarted: true, message: "Lokale Eingänge werden vorbereitet" };
  const preparing = view({ master: localRestart(workflow) });
  assert.equal(preparing.step, 2);
  assert.equal(preparing.state, "läuft");
  assert.equal(preparing.running, true);
  assert.match(preparing.detail, /Lokale Eingänge werden vorbereitet/);
  assert.doesNotMatch(preparing.detail, /fehlgeschlagen|750|500|Quellenbelegfehler/);
  const reading = view({ master: localRestart(workflow, build("CoL-Referenz", { error: "", progressCurrent: 10, progressTotal: 100 })) });
  assert.equal(reading.step, 2);
  assert.equal(reading.percent, 10);
  assert.equal(reading.state, "läuft");
  const failed = view({ master: localRestart({ ...workflow, status: "failed", active: false, error: "Neue Eingänge verändert" }) });
  assert.equal(failed.state, "fehlgeschlagen");
  assert.match(failed.detail, /Neue Eingänge verändert/);
  assert.doesNotMatch(failed.detail, /Alter Quellenbelegfehler/);
});

test("Altauftragszuordnung ist eng; fremde Fehler, eigener Schreibstand und Quellenarbeit bleiben sichtbar", () => {
  for (const workflow of [
    { updateRunId: "old-update" }, { freshUsageCapture: false }, { sourceCompleted: false }, { decision: "refresh-and-build" },
    { restartGuard: { identity: { updateRunId: "foreign-update", buildJobId: "old-build" } } },
    { restartGuard: { identity: { updateRunId: "old-update", buildJobId: "foreign-build" } } },
    { phase: "package" }, { status: "completed", active: false },
  ]) assert.equal(view({ master: localRestart(workflow) }).state, "fehlgeschlagen", JSON.stringify(workflow));
  const own = localRestart({ status: "paused", active: false, phase: "build", buildStarted: true },
    { status: "paused", error: "", buildJob: { available: true, id: "own-build", updateRunId: "new-update", status: "paused",
      checkpoint: { written: 500, total: 1000 }, progress: { phase: "Masterdatenbank schreiben", current: 750, total: 1000 } } });
  assert.equal(view({ master: own }).step, 3);
  assert.equal(view({ master: own }).state, "pausiert");
  const source = view({ master: localRestart(), reference: { active: true, phase: "download", progressCurrent: 1, progressTotal: 4 } });
  assert.equal(source.phase, "Quelldownload");
  assert.equal(source.percent, 25);
});

test("Vorschau und offene Bestätigung melden keinen laufenden Quellen-/Masterauftrag und überdecken echte Arbeit nicht", () => {
  for (const [preparation, stage] of [["preview", "Vorschau wird geprüft"], ["confirmation", "Bestätigung ausstehend"]]) {
    const pending = view({ busy: true, preparation });
    assert.equal(pending.stage, stage);
    assert.equal(pending.step, null);
    assert.equal(pending.running, false);
    assert.equal(pending.completed, false);
    assert.doesNotMatch(pending.detail, /Schritt \d+|Quellen vorbereiten/);
    assert.equal(view({ busy: true, preparation, master: build("Suchindex") }).running, true);
    assert.equal(view({ busy: true, preparation, reference: { active: true, phase: "download" } }).phase, "Quelldownload");
    const waiting = view({ busy: true, preparation, master: { updateWorkflow: {
      updateRunId: "saved", status: "waiting-lightroom", active: true } } });
    assert.match(waiting.detail, /Warte auf Lightroom-Schließung/);
    assert.equal(waiting.preparation, undefined);
  }
});

test("Messprozente brauchen echte Mengen; null, alte Phasenmarken und ungültige Werte liefern keine 0 %", () => {
  assert.equal(view(), null);
  assert.equal(view({ master: null, reference: null }), null);
  for (const invalid of [null, undefined, "", false, true, NaN, Infinity, -1]) {
    assert.equal(measuredProgress(invalid, 100), null);
    assert.equal(measuredProgress(10, invalid), null);
  }
  assert.equal(measuredProgress(10, 0), null);
  assert.equal(measuredProgress(101, 100), null);
  assert.equal(measuredProgress(0, 100).percent, 0);
  assert.equal(measuredProgress(999, 1000).percent, 99, "Kein vorzeitig gerundetes 100 %");
  assert.equal(measuredProgress(1000, 1000).percent, 100);
  assert.equal(view({ master: build("Eingangsstand sichern", { progressPercent: 45 }) }).percent, null);
});

test("Lokaler Voll- und Änderungsweg zeigen echte Teilschritte bis zum Paketwechsel, keine Zeitgewichte", () => {
  for (const mode of ["full", "incremental"]) {
    for (const [phase, step] of [["Vorbereitung", 1], ["Eingangsstand sichern", 2], ["CoL-Referenz", 2],
      ["Anbieter-Datensätze", 3], ["Masterdatenbank schreiben", 3], ["Suchindex", 3], ["Prüfung", 4], ["Abschluss", 4]]) {
      const result = view({ master: build(phase, { buildMode: mode, progressPercent: 99 }) });
      assert.equal(result.step, step); assert.equal(result.totalSteps, 7);
      assert.equal(result.percent, null); assert.equal(result.completed, false);
    }
    const writing = view({ master: build("Masterdatenbank schreiben", { progressCurrent: 420, progressTotal: 1000 }) });
    assert.equal(writing.percent, 42); assert.match(writing.detail, /42 % dieses Teilschritts.*420 von 1\.000/);
    const search = view({ master: build("Suchindex", { progressCurrent: 10, progressTotal: 100 }) });
    assert.equal(search.step, writing.step); assert.equal(search.phase, "Suchindex");
    assert.equal(search.percent, 10, "Neue Teilphase ist kein Rücksprung eines Gesamtprozents");
  }
});

test("Kopfschaltfläche zeigt zwei klare Zeilen und nur den gemessenen Teilfortschritt", () => {
  const search = view({ master: build("Suchindex", {
    progressCurrent: 2008000, progressTotal: 6231604, progressPercent: 75,
  }) });
  assert.equal(search.compact, "Datenbank-Update\n3/7 Master aufbauen · 32 %");
  assert.doesNotMatch(search.compact, /\bDB\b|Teil|75/);
  assert.match(search.detail, /Schritt 3 von 7 · Master aufbauen · Suchindex · 32 % dieses Teilschritts/);
  assert.match(search.detail, /2\.008\.000 von 6\.231\.604/);
  assert.equal(view({ master: build("Suchindex", { progressPercent: 75 }) }).compact,
    "Datenbank-Update\n3/7 Master aufbauen", "Ohne Messmengen keinen Prozentwert erfinden");
  assert.equal(view({ master: build("Suchindex", { progressCurrent: 100, progressTotal: 100 }) }).compact,
    "Datenbank-Update\n3/7 Master aufbauen · 100 %", "Teilabschluss ist kein Gesamtabschluss");
});

test("vollständig gelesene CoL-Auswahl ist noch laufende Eingangsvorbereitung ohne behaupteten Folgemesswert", () => {
  const master = build("CoL-Referenz", { progressCurrent: 273470, progressTotal: 273470, progressPercent: 60 });
  const result = view({ master });
  assert.equal(result.activityMessage, "CoL-Auswahl gelesen. Eingänge werden weiter vorbereitet und geprüft.");
  assert.equal(result.step, 2);
  assert.equal(result.phase, "CoL-Referenz", "Die gemeldete Backendphase bleibt erhalten");
  assert.equal(result.percent, null);
  assert.equal(result.running, true);
  assert.equal(result.completed, false);
  assert.equal(result.state, "läuft");
  assert.match(result.detail, /CoL-Auswahl gelesen\. Eingänge werden weiter vorbereitet und geprüft\./);
  assert.doesNotMatch(result.detail + result.compact, /100 %|60 %|Hash|Prüfsumme|Restzeit/);
  const reading = view({ master: { ...master, progressCurrent: 273469 } });
  assert.equal(reading.percent, 99); assert.equal(reading.activityMessage, undefined);
  const following = view({ master: { ...master, progressPhase: "Suchindex", progressCurrent: 1, progressTotal: 100 } });
  assert.equal(following.percent, 1); assert.equal(following.activityMessage, undefined);
  assert.doesNotMatch(following.detail, /CoL-Auswahl gelesen/);
});

test("CoL-Übergangstext verdrängt weder Quellenarbeit, Fachfehler, Stopps noch alte oder ungültige Messungen", async (t) => {
  const master = build("CoL-Referenz", { progressCurrent: 273470, progressTotal: 273470 });
  for (const [label, input] of [
    ["Quellenlauf", { master, reference: { active: true, phase: "download", progressCurrent: 1, progressTotal: 4 } }],
    ["Masterfehler", { master: { ...master, error: "Prüfung fehlgeschlagen" } }],
    ["Teilstand", { master: { ...master, active: false, status: "partial" } }],
    ["Paketnachholung", { master: { ...master, lightroomPackage: { needsRebuild: true } } }],
    ["Paketfehler", { master: { ...master, lightroomPackage: { error: "Paketprüfung fehlgeschlagen" } } }],
    ["Pause", { master: { ...master, active: false, status: "paused" } }],
    ["keine aktive Messung", { master: { ...master, active: false } }],
    ["gespeicherte alte Messung", { master: { status: "idle", buildJob: { available: true, status: "building",
      progress: { phase: "CoL-Referenz", current: 273470, total: 273470 } } } }],
    ["andere Aktion", { master: { ...master, action: "activate" } }],
    ["anderer Zustand", { master: { ...master, status: "activating" } }],
    ["andere Phase", { master: { ...master, progressPhase: "Masterdatenbank schreiben" } }],
    ["fehlende Menge", { master: { ...master, progressTotal: null } }],
    ["leere Menge", { master: { ...master, progressCurrent: 0, progressTotal: 0 } }],
    ["überschrittene Menge", { master: { ...master, progressCurrent: 273471 } }],
    ["nicht endliche Menge", { master: { ...master, progressCurrent: Infinity, progressTotal: Infinity } }],
  ]) await t.test(label, () => {
    const result = view(input);
    assert.equal(result?.activityMessage, undefined);
    assert.doesNotMatch(result?.detail || "", /CoL-Auswahl gelesen/);
    if (label === "Quellenlauf") { assert.equal(result.phase, "Quelldownload"); assert.equal(result.percent, 25); }
    if (label === "andere Phase") assert.equal(result.percent, 100, "Andere abgeschlossene Teilmessungen bleiben erhalten");
  });
});

test("Kompakte Kopfzeile erhält Pausen, Fehler und ausstehende Entscheidungen", () => {
  for (const status of ["paused", "interrupted", "stale", "failed", "pausing"]) {
    const result = view({ master: { status: "idle", buildJob: { available: true, status,
      progress: { phase: "Masterdatenbank schreiben", current: 750, total: 1000 } } } });
    assert.ok(result.compact.endsWith(` · ${result.state}`));
    assert.doesNotMatch(result.compact, /%|Teil/);
  }
  const sourceFailure = view({ reference: { status: "failed", phase: "download" } });
  assert.equal(sourceFailure.compact, "Datenbank-Update\n1/7 Quellen vorbereiten · fehlgeschlagen");
  const candidate = view({ master: { status: "ready", lifecycle: { candidate: { candidateId: "new" }, blockingConflictCount: 1 } } });
  assert.equal(candidate.compact, "Datenbank-Update\n4/7 Master prüfen · Entscheidung erforderlich");
  const completed = view({ master: { status: "completed", action: "activate", lightroomPackage: pair } });
  assert.equal(completed.compact, "Datenbank-Update\nAbgeschlossen");
});

test("Quellendownload hat Vorrang vor altem Masterstatus; Referenzabschluss ist kein Gesamtabschluss", () => {
  const master = { status: "completed", action: "activate", lightroomPackage: pair, progressPercent: 100 };
  const result = view({ master, reference: { active: true, status: "downloading", phase: "download",
    progressCurrent: 50, progressTotal: 200, progressPercent: 4 } });
  assert.equal(result.step, 1); assert.equal(result.phase, "Quelldownload"); assert.equal(result.percent, 25);
  assert.equal(result.completed, false);
  const sourcesDone = view({ reference: { status: "completed", active: false }, busy: true });
  assert.equal(sourcesDone.completed, false); assert.equal(sourcesDone.percent, null);
  const afterSources = view({ master: { ...master, completedAt: "2026-09-27T12:00:00Z" },
    reference: { status: "completed", action: "update", completedAt: "2026-09-28T12:00:00Z" }, busy: true });
  assert.equal(afterSources.completed, false); assert.equal(afterSources.step, 2);
  assert.equal(view({ master, busy: true }).completed, false, "Alte Erfolgsmeldung nicht während einer neuen Aktion zeigen");
});

test("Fehlgeschlagener Quelldownload bleibt Schritt 1, auch neben dem Abschluss eines alten fertigen Auftrags", () => {
  for (const action of ["", "activate", "rollback", "apply-corrections", "sync-lightroom"]) {
    const master = { status: "idle", active: false, action, lightroomPackage: pair,
      buildJob: { available: true, status: "ready", progress: { phase: "Abschluss", percent: 99 } } };
    const result = view({ master, reference: { status: "failed", active: false, action: "update", phase: "download" } });
    assert.equal(result.step, 1); assert.equal(result.totalSteps, 7);
    assert.equal(result.phase, "Quelldownload"); assert.equal(result.state, "fehlgeschlagen");
    assert.equal(result.className, "failed"); assert.equal(result.completed, false); assert.equal(result.percent, null);
    assert.doesNotMatch(result.detail, /Master prüfen|Abschluss|99 %/);
  }
  for (const phase of ["extract", "supplements"]) {
    assert.equal(view({ reference: { status: "failed", phase } }).step, 1);
  }
});

test("Aktueller Masterfehler oder gespeicherter gestoppter Aufbau wird nicht durch alten Quellenfehler verdeckt", () => {
  const reference = { status: "failed", active: false, phase: "download" };
  const master = { status: "failed", action: "activate", progressPhase: "Paketprüfung", error: "Paketfehler" };
  assert.equal(view({ master, reference }).step, 6);
  const job = { status: "idle", buildJob: { available: true, status: "paused", progress: { phase: "Masterdatenbank schreiben" } } };
  assert.equal(view({ master: job, reference }).step, 3);
});

test("Gespeicherter Auftrag trennt Checkpoint und Fortschritt und bleibt nach Wiederöffnung verständlich", () => {
  for (const status of ["paused", "interrupted", "stale", "failed", "pausing"]) {
    const result = view({ master: { status: "idle", buildJob: { available: true, status,
      checkpoint: { written: 500, total: 1000 },
      progress: { phase: "Masterdatenbank schreiben", current: 750, total: 1000, percent: 81 } } } });
    assert.equal(result.step, 3); assert.equal(result.percent, null); assert.equal(result.completed, false);
    assert.notEqual(result.state, "läuft");
  }
  const resumed = view({ master: build("Wiederanlauf prüfen", { buildJob: { available: true, status: "building",
    progress: { phase: "Masterdatenbank schreiben", current: 750, total: 1000 } } }) });
  assert.equal(resumed.step, 2); assert.equal(resumed.percent, null, "Keine alten Mengen während neuer Eingangsprüfung");
});

test("Kandidat mit oder ohne Konflikt ist noch kein Erfolg; Paketfehler bleibt sichtbar", () => {
  for (const count of [0, 1]) {
    const ready = view({ master: { status: "ready", progressPercent: 100, lifecycle: {
      candidate: { candidateId: "new" }, blockingConflictCount: count }, lightroomPackage: pair } });
    assert.equal(ready.step, 4); assert.equal(ready.percent, null); assert.equal(ready.completed, false);
    assert.equal(ready.state, count ? "Entscheidung erforderlich" : "Übernahme ausstehend");
  }
  for (const status of ["failed", "partial"]) {
    const result = view({ master: { status, action: "activate", progressPhase: "Paketprüfung",
      progressPercent: 100, error: "Paket fehlerhaft", lightroomPackage: pair } });
    assert.equal(result.step, 6); assert.equal(result.completed, false); assert.equal(result.className, "failed");
  }
});

test("Paketfertigstellung und gemeinsame Freigabe bleiben getrennt; 100 % Gesamt erst als bestätigter Abschluss", () => {
  for (const [phase, step] of [["Aktivierung", 5], ["Taxonomieexport", 5], ["Suchindizes", 5],
    ["Paketprüfung", 6], ["Abgeschlossen", 6], ["Vollprüfung und Aktivierung", 7]]) {
    const result = view({ master: { active: true, status: "activating", action: "activate", progressPhase: phase, progressPercent: 100 } });
    assert.equal(result.step, step); assert.equal(result.completed, false); assert.equal(result.percent, null);
  }
  const completed = { status: "completed", action: "activate", lightroomPackage: pair };
  assert.equal(view({ master: completed }).completed, true);
  assert.equal(view({ master: { ...completed, lightroomPackage: { status: "stale" } } }).completed, false);
  assert.equal(view({ master: { ...completed, corrections: { pending: true } } }).completed, false);
});

test("Paketreparatur, Namenswahl und Rücknahme besitzen eigene kurze Pläne", () => {
  for (const action of ["apply-corrections", "rollback"]) {
    const result = view({ master: { active: true, status: action === "rollback" ? "rolling-back" : "applying-corrections",
      action, progressPhase: "Prüfung", progressPercent: 5 } });
    assert.equal(result.totalSteps, 2); assert.equal(result.step, 1); assert.equal(result.percent, null);
  }
  const repair = view({ master: { active: true, status: "syncing-lightroom", action: "sync-lightroom", progressPhase: "Paketprüfung" } });
  assert.equal(repair.totalSteps, 3); assert.equal(repair.step, 2);
});

test("Gespeicherte Warteaufträge verdrängen alte Mastererfolge und behaupten keine fertige SDK-Erfassung", () => {
  const oldMaster = { status: "completed", active: false, action: "activate", lightroomPackage: pair,
    buildJob: { available: true, status: "ready", progress: { phase: "Abschluss" } } };
  for (const status of ["waiting-lightroom", "waiting-usage", "waiting-decisions", "paused", "interrupted", "failed"]) {
    const result = view({ master: { ...oldMaster, updateWorkflow: { updateRunId: "saved", status, phase: "start",
      active: status.startsWith("waiting-"), message: "Aktueller FN-Nutzungsnachweis erforderlich." } } });
    assert.equal(result.completed, false);
    assert.equal(result.percent, null);
    assert.doesNotMatch(result.compact, /Abgeschlossen|100 %/);
    assert.doesNotMatch(result.detail, /Erfassung.*abgeschlossen/);
    if (status === "waiting-lightroom") assert.match(result.compact, /Warte auf Lightroom-Schließung/);
    if (status === "waiting-usage") assert.match(result.compact, /FN-Nutzung prüfen/);
  }
  const building = view({ master: { ...oldMaster, updateWorkflow: { updateRunId: "saved", status: "building", phase: "build", active: true } } });
  assert.equal(building.completed, false);
  assert.equal(building.step, 3);
  assert.match(building.compact, /3\/7 Master aufbauen/);
});

test("Gespeicherter Quellenfehler oder Unterbrechung bleibt vor Masterprüfung und fordert keinen falschen Abschluss", () => {
  for (const status of ["failed", "interrupted"]) {
    const result = view({ master: { status: "completed", action: "activate", lightroomPackage: pair,
      buildJob: { available: true, status: "ready", progress: { phase: "Abschluss", percent: 100 } },
      updateWorkflow: { updateRunId: "saved", status, phase: "sources", error: "Ergänzungsprüfung unvollständig" } },
    reference: { status: "failed", phase: "supplements" } });
    assert.equal(result.step, 1);
    assert.equal(result.sourceFailure, true);
    assert.equal(result.completed, false);
    assert.match(result.detail, /Schritt 1 von 7.*Anbieternamen aktualisieren.*Ergänzungsprüfung/);
    assert.doesNotMatch(result.detail, /Master prüfen|Abschluss|100 %/);
  }
});
