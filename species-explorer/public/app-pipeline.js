(function initializeSpeciesExplorerPipeline(global) {
  "use strict";

  const PIPELINE_MODE_LABELS = Object.freeze({
    missing: "Neue/Unvollständige Arten aktualisieren",
    all: "Alle Arten vollständig aktualisieren",
    "manual-maps": "Manuelle und fehlende Karten erneut suchen",
    "nc-sounds": "NC- und fehlende Sounds erneut suchen",
    transfer: "Änderungen übertragen",
    cleanup: "Verwaiste Daten und Assets dauerhaft löschen",
  });

  const DATABASE_STATUS_LABELS = Object.freeze({
    running: "Aktualisierung läuft",
    review: "Neue Assets prüfen",
    failed: "Datenbank aktualisieren",
    current: "Datenbank aktuell",
    outdated: "Änderungen übertragen",
    backup: "Backup läuft",
  });

  function pipelineModeLabel(mode) {
    return PIPELINE_MODE_LABELS[mode] || mode;
  }

  function backupLabel() {
    return "NAS-Backup erstellen";
  }

  function formatPendingFileStatus(status) {
    const value = String(status || "").trim();
    if (!value || value.includes("M")) return "geändert";
    if (value.includes("A") || value === "??") return "neu";
    if (value.includes("D")) return "gelöscht";
    if (value.includes("R")) return "umbenannt";
    return value;
  }

  function resolveDatabaseStatus({
    explicitStatus = "",
    backupStatus = "",
    pipelineStatus = "",
    databaseNeedsUpdate = false,
  } = {}) {
    if (explicitStatus) return explicitStatus;
    if (backupStatus === "running") return "backup";
    if (pipelineStatus === "running") return "running";
    if (pipelineStatus === "awaiting-review") return "review";
    if (pipelineStatus === "failed") return "failed";
    return databaseNeedsUpdate ? "outdated" : "current";
  }

  function databaseStatusLabel(status) {
    return DATABASE_STATUS_LABELS[status] || "Datenbank aktualisieren";
  }

  function soundSearchOutcome(logLines = [], { hasCurrentSound = false } = {}) {
    const logText = Array.isArray(logLines) ? logLines.join("\n") : String(logLines ?? "");
    const soundLocked = /Sounddatei .*gesperrt|noch geöffnet oder gesperrt|Datei gesperrt/i.test(logText);
    const rejectedSourcesSkipped = /Abgelehnte Soundquelle wird übersprungen|Bereits abgelehnte Soundquellen wurden übersprungen/i
      .test(logText);
    const noAlternative = [
      /Keine neue automatische Alternative gefunden/i,
      /Keine neue geeignete Soundalternative/i,
      /Keine weitere geeignete Soundalternative/i,
      /Keine weitere Soundalternative/i,
      /Keine weitere Soundquelle/i,
      /Keine freie Alternative gefunden/i,
      /keine weitere taugliche Quelle/i,
    ].some((pattern) => pattern.test(logText));

    if (soundLocked) {
      return {
        logText,
        soundLocked,
        rejectedSourcesSkipped,
        noAlternative: false,
        message: "Sound-Suche abgeschlossen. Die Sounddatei war noch geöffnet oder gesperrt; bitte Wiedergabe oder Fenster schließen und erneut suchen.",
        messageType: "error",
      };
    }

    if (noAlternative) {
      const skippedMessage = rejectedSourcesSkipped
        ? " Bereits abgelehnte Kandidaten wurden übersprungen."
        : "";
      const finalMessage = hasCurrentSound
        ? " Der bisherige Sound bleibt erhalten."
        : " Für diese Art bleibt vorerst keine Tierstimme hinterlegt.";
      return {
        logText,
        soundLocked,
        rejectedSourcesSkipped,
        noAlternative,
        message: `Sound-Suche abgeschlossen.${skippedMessage} In den unterstützten, lizenzgeprüften Quellen wurde keine weitere geeignete Aufnahme gefunden.${finalMessage}`,
        messageType: "info",
      };
    }

    return {
      logText,
      soundLocked,
      rejectedSourcesSkipped,
      noAlternative,
      message: "",
      messageType: "success",
    };
  }

  function createPipelineStatusPresenters({ formatBytes } = {}) {
    if (typeof formatBytes !== "function") {
      throw new TypeError("Pipeline-Statusanzeige benötigt formatBytes als Funktion.");
    }

    function pipelineStatusPresentation(status = {}) {
      if (status.status === "running") {
        return {
          className: "running",
          title: "Pipeline-Lauf läuft gerade",
          detail: `${pipelineModeLabel(status.mode)} · ${status.phase || "Verarbeitung läuft"}`,
          message: "Pipeline-Lauf läuft gerade. Das Fenster kann geschlossen werden; der Lauf läuft im Hintergrund weiter.",
          messageType: "info",
        };
      }
      if (status.status === "awaiting-review") {
        return {
          className: "review",
          title: "Pipeline-Lauf wartet auf Prüfung",
          detail: `${pipelineModeLabel(status.mode)} · neue Karten oder Sounds müssen geprüft werden`,
          message: "Der Pipeline-Lauf wartet auf die Prüfung der neuen Karten und Sounds.",
          messageType: "info",
        };
      }
      if (status.status === "completed") {
        return {
          className: "completed",
          title: "Pipeline-Lauf abgeschlossen",
          detail: status.gitPublished
            ? `${pipelineModeLabel(status.mode)} · Verarbeitung, Commit und Push sind abgeschlossen`
            : `${pipelineModeLabel(status.mode)} · Verarbeitung ist abgeschlossen`,
          message: status.gitPublished
            ? "Pipeline-Lauf abgeschlossen. Änderungen wurden committed und gepusht."
            : "Pipeline-Lauf abgeschlossen.",
          messageType: "success",
        };
      }
      if (status.status === "failed") {
        return {
          className: "failed",
          title: "Pipeline-Lauf fehlgeschlagen",
          detail: status.error || `${pipelineModeLabel(status.mode)} wurde nicht erfolgreich abgeschlossen`,
          message: `Pipeline-Lauf fehlgeschlagen${status.error ? `: ${status.error}` : "."}`,
          messageType: "error",
        };
      }
      return null;
    }

    function backupStatusPresentation(status = {}) {
      if (status.status === "running") {
        return {
          className: "running",
          title: "NAS-Backup läuft gerade",
          detail: `${Math.max(0, Math.min(100, Math.round(status.percent || 0)))}% · ${status.phase || "Backup läuft"}`,
          message: "NAS-Backup läuft gerade. Das Fenster kann geschlossen werden; der Lauf läuft im Hintergrund weiter.",
          messageType: "info",
        };
      }
      if (status.status === "completed") {
        return {
          className: "completed",
          title: status.skipped ? "NAS-Backup nicht erforderlich" : "NAS-Backup abgeschlossen",
          detail: status.skipped
            ? (status.reason || "Seit dem letzten Backup wurden keine Änderungen erkannt")
            : `${formatBytes(status.totalBytes)} · ${status.archivePath || status.backupRoot}`,
          message: status.skipped
            ? (status.reason || "Seit dem letzten Backup wurden keine Änderungen erkannt.")
            : "NAS-Backup abgeschlossen.",
          messageType: "success",
        };
      }
      if (status.status === "failed") {
        return {
          className: "failed",
          title: "NAS-Backup fehlgeschlagen",
          detail: status.error || "Backup wurde nicht erfolgreich abgeschlossen",
          message: `NAS-Backup fehlgeschlagen${status.error ? `: ${status.error}` : "."}`,
          messageType: "error",
        };
      }
      return null;
    }

    function persistentStatusPresentation({
      pipelineStatus = {},
      backupStatus = {},
      backupWasRunning = false,
    } = {}) {
      const pipelinePresentation = pipelineStatusPresentation(pipelineStatus);
      const backupPresentation = backupStatusPresentation(backupStatus);
      const backupFirst = backupStatus.status === "running" || backupWasRunning;
      return backupFirst
        ? backupPresentation || pipelinePresentation
        : pipelinePresentation || backupPresentation;
    }

    return Object.freeze({
      pipelineStatusPresentation,
      backupStatusPresentation,
      persistentStatusPresentation,
    });
  }

  function createPipelinePreviewRenderer({ escapeHtml, formatBytes } = {}) {
    for (const [name, dependency] of Object.entries({ escapeHtml, formatBytes })) {
      if (typeof dependency !== "function") {
        throw new TypeError(`Pipeline-Vorschau benötigt ${name} als Funktion.`);
      }
    }

    function renderPipelinePreview(result = {}) {
      if (result.mode === "cleanup") {
        const obsoleteAssetDirectories = Array.isArray(result.obsoleteAssetDirectories)
          ? result.obsoleteAssetDirectories
          : [];
        const obsoleteData = Array.isArray(result.obsoleteData) ? result.obsoleteData : [];
        const assetRows = obsoleteAssetDirectories.map((entry) => `
          <li><strong>${escapeHtml(entry.path)}</strong> · ${escapeHtml(formatBytes(entry.bytes))}</li>
        `).join("");
        const dataRows = obsoleteData.map((entry) => `
          <li><strong>${escapeHtml(entry.germanName)}</strong> · ${escapeHtml(entry.scientificName)}</li>
        `).join("");
        return {
          html: result.hasWork
            ? `
              <p><strong>${obsoleteData.length}</strong> veraltete Datensätze,
                <strong>${obsoleteAssetDirectories.length}</strong> verwaiste Assetordner und
                <strong>${result.obsoleteAssessmentKeys?.length || 0}</strong> alte Assessment-Zuordnungen sowie
                <strong>${result.obsoleteOverrideKeys?.length || 0}</strong> verwaiste Pflegeeinträge.</p>
              ${dataRows ? `<h5>Datensätze</h5><ul>${dataRows}</ul>` : ""}
              ${assetRows ? `<h5>Assetordner</h5><ul>${assetRows}</ul>` : ""}
            `
            : "<p>Keine verwaisten Daten oder Assetordner gefunden.</p>",
          warning: "Dauerhaft löschen: Die aufgelisteten Daten und Dateien sind danach nicht wiederherstellbar.",
        };
      }

      const targets = Array.isArray(result.targets) ? result.targets : [];
      const removed = Array.isArray(result.removed) ? result.removed : [];
      const targetRows = targets.map((entry) => `
        <li>
          <strong>${escapeHtml(entry.germanName)}</strong>
          <span>${escapeHtml(entry.scientificName)} · ${escapeHtml((entry.reasons || []).join(", "))}</span>
        </li>
      `).join("");
      const removedRows = removed.map((entry) => `
        <li><strong>${escapeHtml(entry.germanName)}</strong> · wird aus der Pipeline-Ausgabe entfernt</li>
      `).join("");
      const pendingFiles = Array.isArray(result.pendingFiles) ? result.pendingFiles : [];
      const pendingFileRows = pendingFiles.slice(0, 12).map((entry) => `
        <li><strong>${escapeHtml(formatPendingFileStatus(entry.status))}</strong> · ${escapeHtml(entry.path)}</li>
      `).join("");
      const pendingMoreRows = pendingFiles.length > 12
        ? `<li>${pendingFiles.length - 12} weitere Datei(en)</li>`
        : "";
      const affectedSpeciesCount = Number.isFinite(result.affectedSpeciesCount)
        ? result.affectedSpeciesCount
        : result.targetCount;
      const transferSummary = result.mode === "transfer"
        ? `
          <p>
            <strong>${affectedSpeciesCount}</strong> Art(en) betroffen:
            <strong>${result.targetCount}</strong> mit geänderten Eingabefeldern,
            <strong>${result.pendingFileCount || 0}</strong> lokale Dateiänderung(en).
          </p>
        `
        : `<p><strong>${result.targetCount}</strong> von ${result.inputCount} Arten werden verarbeitet.</p>`;
      return {
        html: `
          ${transferSummary}
          ${targetRows ? `<ul class="pipeline-target-list">${targetRows}</ul>` : result.mode === "transfer" && pendingFiles.length ? "" : "<p>Keine Zielarten gefunden.</p>"}
          ${pendingFileRows || pendingMoreRows ? `<h5>Lokale Dateiänderungen</h5><ul>${pendingFileRows}${pendingMoreRows}</ul>` : ""}
          ${removedRows ? `<h5>Aus Ausgabe entfernen</h5><ul>${removedRows}</ul>` : ""}
        `,
        warning: result.mode === "transfer"
          ? "Nach erfolgreicher Übertragung werden die gesammelten Änderungen committed und gepusht."
          : "Nach erfolgreichem Lauf werden die Pipeline-Änderungen automatisch committed und gepusht.",
      };
    }

    function renderBackupPreview(result = {}) {
      const forceStart = result.skipped === true;
      return {
        forceStart,
        html: forceStart
          ? `
            <p><strong>Kein neues Backup erforderlich.</strong></p>
            <p>${escapeHtml(result.reason || "Seit dem letzten Backup wurden keine Änderungen erkannt.")}</p>
            <p>Letztes Backup: <strong>${escapeHtml(result.archivePath || "Unbekannt")}</strong></p>
          `
          : `
            <p><strong>${result.fileCount}</strong> Dateien werden als ZIP gesichert.</p>
            <ul>
              <li>Ziel: <strong>${escapeHtml(result.backupRoot)}</strong></li>
              <li>Voraussichtliche Rohdatenmenge: <strong>${escapeHtml(formatBytes(result.totalBytes))}</strong></li>
              <li>Geplante Datei: <strong>${escapeHtml(result.archivePath)}</strong></li>
              <li>Backup-Rotation entfernt danach: <strong>${result.retentionWouldRemove}</strong> alte Datei(en)</li>
            </ul>
          `,
        warning: forceStart
          ? "Du kannst trotzdem manuell ein neues Backup erzwingen."
          : "Das Backup wird auf dem NAS erstellt. Die App zeigt den Fortschritt in Prozent.",
      };
    }

    return Object.freeze({ renderPipelinePreview, renderBackupPreview });
  }

  function renderProcessLog({ details, log, lines = [], schedule = global.requestAnimationFrame } = {}) {
    if (!details || !log) {
      throw new TypeError("Prozesslog benötigt Details- und Logelement.");
    }
    const logLines = Array.isArray(lines) ? lines : [];
    details.hidden = logLines.length === 0;
    log.textContent = logLines.join("\n");
    if (!details.hidden && typeof schedule === "function") {
      schedule(() => {
        log.scrollTop = log.scrollHeight;
      });
    }
  }

  global.SpeciesExplorerPipeline = Object.freeze({
    pipelineModeLabel,
    backupLabel,
    formatPendingFileStatus,
    resolveDatabaseStatus,
    databaseStatusLabel,
    soundSearchOutcome,
    createPipelineStatusPresenters,
    createPipelinePreviewRenderer,
    renderProcessLog,
  });
})(globalThis);
