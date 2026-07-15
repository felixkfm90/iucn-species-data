import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-pipeline.js", import.meta.url), "utf8");
const context = vm.createContext({});
new vm.Script(source, { filename: "app-pipeline.js" }).runInContext(context);
const pipeline = context.SpeciesExplorerPipeline;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatBytes(bytes) {
  return `${bytes || 0} Bytes`;
}

const presenters = pipeline.createPipelineStatusPresenters({ formatBytes });
const previews = pipeline.createPipelinePreviewRenderer({ escapeHtml, formatBytes });

test("Pipeline-Bezeichnungen und Datenbankstatus bleiben eindeutig", () => {
  assert.equal(pipeline.pipelineModeLabel("all"), "Alle Arten vollständig aktualisieren");
  assert.equal(pipeline.pipelineModeLabel("manual-maps"), "Manuelle und fehlende Karten erneut suchen");
  assert.equal(pipeline.pipelineModeLabel("custom"), "custom");
  assert.equal(pipeline.backupLabel(), "NAS-Backup erstellen");
  assert.equal(pipeline.databaseStatusLabel("outdated"), "Änderungen übertragen");
  assert.equal(pipeline.databaseStatusLabel("unknown"), "Datenbank aktualisieren");
});

test("Datenbankstatus priorisiert explizite, Backup- und Pipelinezustände", () => {
  assert.equal(pipeline.resolveDatabaseStatus({
    explicitStatus: "failed",
    backupStatus: "running",
    pipelineStatus: "running",
    databaseNeedsUpdate: true,
  }), "failed");
  assert.equal(pipeline.resolveDatabaseStatus({
    backupStatus: "running",
    pipelineStatus: "running",
  }), "backup");
  assert.equal(pipeline.resolveDatabaseStatus({ pipelineStatus: "awaiting-review" }), "review");
  assert.equal(pipeline.resolveDatabaseStatus({ databaseNeedsUpdate: true }), "outdated");
  assert.equal(pipeline.resolveDatabaseStatus(), "current");
});

test("Pipeline-Statusanzeige beschreibt Lauf, Prüfung, Abschluss und Fehler", () => {
  const running = presenters.pipelineStatusPresentation({
    status: "running",
    mode: "all",
    phase: "Karten laden",
  });
  assert.equal(running.className, "running");
  assert.equal(running.title, "Pipeline-Lauf läuft gerade");
  assert.match(running.detail, /Alle Arten vollständig aktualisieren · Karten laden/);

  const review = presenters.pipelineStatusPresentation({ status: "awaiting-review", mode: "manual-maps" });
  assert.equal(review.className, "review");
  assert.match(review.message, /Prüfung der neuen Karten und Sounds/);

  const completed = presenters.pipelineStatusPresentation({ status: "completed", mode: "transfer", gitPublished: true });
  assert.equal(completed.messageType, "success");
  assert.match(completed.detail, /Commit und Push sind abgeschlossen/);

  const failed = presenters.pipelineStatusPresentation({ status: "failed", mode: "missing", error: "Netzfehler" });
  assert.equal(failed.messageType, "error");
  assert.match(failed.message, /Netzfehler/);
  assert.equal(presenters.pipelineStatusPresentation({ status: "idle" }), null);
});

test("Backup-Status und persistente Anzeige beachten Fortschritt und Vorrang", () => {
  const running = presenters.backupStatusPresentation({
    status: "running",
    percent: 110,
    phase: "ZIP schreiben",
  });
  assert.equal(running.detail, "100% · ZIP schreiben");

  const skipped = presenters.backupStatusPresentation({ status: "completed", skipped: true, reason: "Unverändert" });
  assert.equal(skipped.title, "NAS-Backup nicht erforderlich");
  assert.equal(skipped.detail, "Unverändert");

  const persistent = presenters.persistentStatusPresentation({
    pipelineStatus: { status: "failed", mode: "all" },
    backupStatus: { status: "completed", totalBytes: 42, archivePath: "W:\\backup.zip" },
    backupWasRunning: true,
  });
  assert.equal(persistent.title, "NAS-Backup abgeschlossen");
  assert.match(persistent.detail, /42 Bytes/);
});

test("Übertragungsvorschau zählt betroffene Arten und maskiert lokale Dateipfade", () => {
  const result = previews.renderPipelinePreview({
    mode: "transfer",
    targetCount: 1,
    affectedSpeciesCount: 2,
    pendingFileCount: 2,
    targets: [{
      germanName: "Amsel <Test>",
      scientificName: "Turdus & merula",
      reasons: ["Größe"],
    }],
    pendingFiles: [
      { status: " M", path: "species-assets/Amsel/portrait.webp" },
      { status: "??", path: "species-assets/Amsel/new<script>.json" },
    ],
    removed: [{ germanName: "Altart" }],
  });

  assert.match(result.html, /<strong>2<\/strong> Art\(en\) betroffen/);
  assert.match(result.html, /Amsel &lt;Test&gt;/);
  assert.match(result.html, /Turdus &amp; merula/);
  assert.match(result.html, /<strong>geändert<\/strong>/);
  assert.match(result.html, /<strong>neu<\/strong>/);
  assert.doesNotMatch(result.html, /<script>/);
  assert.match(result.warning, /committed und gepusht/);
});

test("Bereinigungs- und Backupvorschau liefern Inhalt, Warnung und Startmodus", () => {
  const cleanup = previews.renderPipelinePreview({
    mode: "cleanup",
    hasWork: true,
    obsoleteData: [{ germanName: "Altart", scientificName: "Vetus species" }],
    obsoleteAssetDirectories: [{ path: "species-assets/Altart", bytes: 12 }],
    obsoleteAssessmentKeys: ["1"],
    obsoleteOverrideKeys: ["Altart"],
  });
  assert.match(cleanup.html, /1<\/strong> veraltete Datensätze/);
  assert.match(cleanup.html, /species-assets\/Altart/);
  assert.match(cleanup.warning, /nicht wiederherstellbar/);

  const backup = previews.renderBackupPreview({
    skipped: false,
    fileCount: 20,
    backupRoot: "W:\\Backups",
    totalBytes: 100,
    archivePath: "W:\\Backups\\backup.zip",
    retentionWouldRemove: 1,
  });
  assert.equal(backup.forceStart, false);
  assert.match(backup.html, /20<\/strong> Dateien/);
  assert.match(backup.warning, /Fortschritt in Prozent/);

  const forced = previews.renderBackupPreview({ skipped: true, reason: "Keine Änderungen" });
  assert.equal(forced.forceStart, true);
  assert.match(forced.html, /Keine Änderungen/);
  assert.match(forced.warning, /erzwingen/);
});

test("Prozesslog blendet leere Ausgabe aus und scrollt neue Ausgabe ans Ende", () => {
  const details = { hidden: false };
  const log = { textContent: "", scrollTop: 0, scrollHeight: 250 };
  let scheduled = 0;
  const schedule = (callback) => {
    scheduled += 1;
    callback();
  };

  pipeline.renderProcessLog({ details, log, lines: [], schedule });
  assert.equal(details.hidden, true);
  assert.equal(log.textContent, "");
  assert.equal(scheduled, 0);

  pipeline.renderProcessLog({ details, log, lines: ["Start", "Fertig"], schedule });
  assert.equal(details.hidden, false);
  assert.equal(log.textContent, "Start\nFertig");
  assert.equal(log.scrollTop, 250);
  assert.equal(scheduled, 1);
});
