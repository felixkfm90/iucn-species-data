(function initializeSpeciesExplorerBackupWorkflow(global) {
  "use strict";

  async function readWorkflowStatus(fetchJson, url) {
    if (!["/api/backup/status", "/api/pipeline/status"].includes(url)) {
      throw new Error("Unbekannter lesender Workflowstatus.");
    }
    const abort = typeof global.AbortController === "function" ? new global.AbortController() : null;
    let timeout;
    try {
      return await Promise.race([
        fetchJson(url, abort ? { signal: abort.signal } : undefined),
        new Promise((resolve, reject) => {
          timeout = global.setTimeout(() => {
            reject(new Error("Die Statusabfrage hat das Zeitlimit überschritten. Der gespeicherte Stand bleibt erhalten."));
            abort?.abort();
          }, 15000);
        }),
      ]);
    } finally {
      global.clearTimeout(timeout);
    }
  }

  function createBackupWorkflowController(dependencies = {}) {
    const {
      state,
      elements,
      dialog,
      backupStatusPresentation,
      backupLabel,
      renderBackupPreview,
      fetchJson,
      renderDatabaseStatus,
      formatDate,
      renderProcessLog,
      activateBackupContext,
      setMessage,
      showDialog,
      setDialogCloseMode,
      renderPersistentPipelineStatus,
    } = dependencies;

    let forceStart = false;
    const statusRetryDelays = [1000, 2000, 4000, 8000];
    let statusReadPromise = null, statusReadGeneration = 0, queuedStatusRead = false, statusReadFailures = 0;

    const reset = () => {
      forceStart = false;
    };

    const showStatusDialog = (status) => {
      void refreshStatus();
      const presentation = state.backupStatusReadError ? {
        title: "Backup-Status nicht verfügbar",
        message: `Letzter bestätigter Stand; aktuell nicht bestätigt. ${state.backupStatusReadError.message}`,
        messageType: "error",
      } : backupStatusPresentation(status);
      if (!presentation) return;
      activateBackupContext();
      dialog.dataset.statusKind = "backup";
      elements.pipelineDialogTitle.textContent = presentation.title;
      elements.pipelineDialogDescription.textContent = backupLabel();
      elements.pipelineModeChoice.hidden = true;
      elements.pipelinePreview.hidden = true;
      elements.pipelineStartButton.hidden = true;
      elements.pipelineStartButton.disabled = true;
      setDialogCloseMode(status.status === "running");
      setMessage(presentation.message, presentation.messageType);
      showDialog();
    };

    const applyPreview = (result) => {
      const preview = renderBackupPreview(result);
      forceStart = preview.forceStart;
      elements.pipelinePreviewContent.innerHTML = preview.html;
      elements.pipelineWarning.textContent = preview.warning;
    };

    async function openPreview() {
      activateBackupContext();
      dialog.dataset.statusKind = "";
      reset();
      elements.pipelineModeChoice.hidden = true;
      elements.pipelinePreview.hidden = false;
      elements.pipelineStartButton.hidden = false;
      elements.pipelineStartButton.disabled = true;
      elements.pipelineStartButton.textContent = "Backup starten";
      setDialogCloseMode(false);
      setMessage("Backup-Vorschau wird erstellt...", "info");
      elements.pipelineDialogTitle.textContent = backupLabel();
      elements.pipelineDialogDescription.textContent = "Projektstand als komprimierte NAS-Sicherung prüfen.";
      elements.pipelinePreviewContent.replaceChildren();
      elements.pipelineWarning.textContent = "";
      showDialog();
      try {
        const result = await fetchJson("/api/backup/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        applyPreview(result);
        elements.pipelineStartButton.disabled = false;
        elements.pipelineStartButton.textContent = forceStart
          ? "Backup trotzdem erstellen"
          : "Backup starten";
        setMessage("Backup-Vorschau ist bereit.", "success");
      } catch (error) {
        setMessage([error.message, ...(error.details || [])].join(" · "), "error");
      }
    }

    async function startPreview() {
      elements.pipelineStartButton.disabled = true;
      setMessage("NAS-Backup wird gestartet...", "info");
      try {
        const startedStatus = await fetchJson("/api/backup/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: forceStart }),
        });
        state.backupStatusSnapshot = startedStatus;
        state.backupWasRunning = true;
        dialog.dataset.statusKind = "backup";
        elements.pipelineStartButton.hidden = true;
        elements.pipelinePreview.hidden = true;
        setDialogCloseMode(true);
        const presentation = backupStatusPresentation(startedStatus);
        elements.pipelineDialogTitle.textContent = presentation.title;
        elements.pipelineDialogDescription.textContent = backupLabel();
        setMessage(presentation.message, presentation.messageType);
        renderPersistentPipelineStatus(state.pipelineStatusSnapshot || { status: "idle" });
        await refreshStatus();
      } catch (error) {
        setMessage([error.message, ...(error.details || [])].join(" · "), "error");
        elements.pipelineStartButton.disabled = false;
      }
    }

    function scheduleStatusRead(delay) {
      const generation = statusReadGeneration;
      clearTimeout(state.backupPollTimer);
      const timer = setTimeout(() => {
        if (generation !== statusReadGeneration || state.backupPollTimer !== timer) return;
        state.backupPollTimer = null;
        void refreshStatus({ resetRetries: false });
      }, delay);
      state.backupPollTimer = timer;
    }

    async function refreshStatus({ resetRetries = true } = {}) {
      clearTimeout(state.backupPollTimer);
      state.backupPollTimer = null;
      if (resetRetries) {
        statusReadFailures = 0;
        statusReadGeneration += 1;
      }
      if (statusReadPromise) {
        if (resetRetries) queuedStatusRead = true;
        return statusReadPromise;
      }
      const generation = statusReadGeneration;
      statusReadPromise = Promise.resolve().then(async () => {
        let status;
        // Only a failed read is retried; presentation/start failures are separate.
        try { status = await readWorkflowStatus(fetchJson, "/api/backup/status"); }
        catch (error) {
          if (generation !== statusReadGeneration) return;
          const delay = statusRetryDelays[statusReadFailures++] ?? null;
          state.backupStatusReadError = { message: error.message, retryDelay: delay };
          if (dialog.open && dialog.dataset.previewKind === "backup" && dialog.dataset.statusKind === "backup") {
            setMessage(`Backup-Status aktuell nicht bestätigt: ${error.message}`, "error");
            elements.pipelineStatusDetail.textContent = "Letzter bestätigter Stand; Status derzeit nicht verfügbar.";
            elements.pipelineStatusDetail.className = "pipeline-dialog-status failed";
          }
          renderPersistentPipelineStatus(state.pipelineStatusSnapshot || { status: "idle" });
          if (delay !== null) scheduleStatusRead(delay);
          return;
        }
        if (generation !== statusReadGeneration) return;
        statusReadFailures = 0;
        state.backupStatusReadError = null;
        try {
          state.backupStatusSnapshot = status;
          const active = status.status === "running";
          if (active) {
            renderDatabaseStatus("backup");
            elements.pipelineStatus.textContent = "Backup läuft";
          } else {
            renderDatabaseStatus();
          }
          renderPersistentPipelineStatus(state.pipelineStatusSnapshot || { status: "idle" });

          if (dialog.open && dialog.dataset.previewKind === "backup" && dialog.dataset.statusKind === "backup") {
            const presentation = backupStatusPresentation(status) || {
              title: backupLabel(), message: "Kein Backup aktiv.", messageType: "info",
            };
            elements.pipelineDialogTitle.textContent = presentation.title;
            elements.pipelineDialogDescription.textContent = backupLabel();
            setDialogCloseMode(active);
            setMessage(presentation.message, presentation.messageType);
            elements.pipelineStatusDetail.textContent = active
              ? `${Math.max(0, Math.min(100, Math.round(status.percent || 0)))}% · ${status.phase || "Backup läuft"}`
              : status.completedAt
                ? `${backupLabel()} · beendet ${formatDate(status.completedAt).replace(/^Report /, "")}`
                : "Kein Backup aktiv.";
            elements.pipelineStatusDetail.className = `pipeline-dialog-status${status.status !== "idle" ? ` ${status.status}` : ""}`;
            renderProcessLog({
              details: elements.pipelineLogDetails,
              log: elements.pipelineLog,
              lines: status.log,
            });
          }

          state.backupWasRunning = active;
        } catch (error) {
          if (state.pipelineStatusReadError || state.backupStatusReadError) {
            renderPersistentPipelineStatus(state.pipelineStatusSnapshot || { status: "idle" });
          } else {
            elements.pipelineRunNotice.hidden = false;
            elements.pipelineRunNotice.className = "pipeline-run-notice failed";
            elements.pipelineRunNoticeTitle.textContent = "Backup-Ansicht nicht aktualisiert";
            elements.pipelineRunNoticeDetail.textContent = error.message;
          }
        }
        if (generation === statusReadGeneration && status.status === "running") scheduleStatusRead(1000);
      }).finally(() => {
        statusReadPromise = null;
        if (queuedStatusRead) {
          queuedStatusRead = false;
          void refreshStatus({ resetRetries: false });
        }
      });
      return statusReadPromise;
    }

    const bind = () => {
      for (const button of elements.backupButtons) {
        button.addEventListener("click", openPreview);
      }
      state.openBackupPreview = openPreview;
      void refreshStatus();
    };

    return Object.freeze({
      bind,
      openPreview,
      refreshStatus,
      reset,
      showStatusDialog,
      startPreview,
    });
  }

  global.SpeciesExplorerBackupWorkflow = Object.freeze({
    createBackupWorkflowController,
    readWorkflowStatus,
  });
})(globalThis);
