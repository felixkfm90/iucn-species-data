(function initializeSpeciesExplorerBackupWorkflow(global) {
  "use strict";

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

    const reset = () => {
      forceStart = false;
    };

    const showStatusDialog = (status) => {
      const presentation = backupStatusPresentation(status);
      if (!presentation) return;
      activateBackupContext();
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

    async function refreshStatus() {
      try {
        const status = await fetchJson("/api/backup/status");
        state.backupStatusSnapshot = status;
        const active = status.status === "running";
        if (active) {
          renderDatabaseStatus("backup");
          elements.pipelineStatus.textContent = "Backup läuft";
        } else {
          renderDatabaseStatus();
        }
        renderPersistentPipelineStatus(state.pipelineStatusSnapshot || { status: "idle" });

        if (dialog.open && (dialog.dataset.previewKind === "backup" || state.backupWasRunning)) {
          const presentation = backupStatusPresentation(status);
          if (presentation) {
            elements.pipelineDialogTitle.textContent = presentation.title;
            elements.pipelineDialogDescription.textContent = backupLabel();
            setDialogCloseMode(active);
            setMessage(presentation.message, presentation.messageType);
          }
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
        clearTimeout(state.backupPollTimer);
        state.backupPollTimer = active ? setTimeout(refreshStatus, 1000) : null;
      } catch (error) {
        elements.pipelineRunNotice.hidden = false;
        elements.pipelineRunNotice.className = "pipeline-run-notice failed";
        elements.pipelineRunNoticeTitle.textContent = "Backup-Status nicht verfügbar";
        elements.pipelineRunNoticeDetail.textContent = error.message;
      }
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
  });
})(globalThis);
