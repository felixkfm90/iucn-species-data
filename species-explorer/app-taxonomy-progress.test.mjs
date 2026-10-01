import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
new vm.Script(await readFile(new URL("./public/app-taxonomy-progress.js", import.meta.url), "utf8")).runInContext(context);
const { taxonomyProgressPresentation: view, measuredProgress } = context.SpeciesExplorerTaxonomyProgress;
const build = (phase, extra = {}) => ({ status: "building", active: true, action: "build", progressPhase: phase, ...extra });
const pair = { status: "current" };

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
