(function initializeSpeciesExplorerPipelineWorkflow(global) {
  "use strict";

  function createPipelineWorkflowController(dependencies = {}) {
    const {
      state,
      elements,
      createDialogController,
      persistentStatusPresentation,
      pipelineStatusPresentation,
      backupStatusPresentation,
      pipelineModeLabel,
      backupLabel,
      renderPipelinePreview,
      renderBackupPreview,
      releaseAllAudioElements,
      fetchJson,
      soundSearchOutcome,
      refreshExplorerModelOnly,
      refreshOpenSoundEditor,
      loadData,
      renderDatabaseStatus,
      formatDate,
      renderProcessLog,
      createBackupWorkflowController,
    } = dependencies;

    function setupPipelineControl() {
      const dialog = elements.pipelineDialog;
      const form = elements.pipelineForm;
      const cancelButtons = [...dialog.querySelectorAll(".pipeline-cancel")];
      const footerCloseButton = dialog.querySelector(".pipeline-dialog-close-button");
      let previewToken = "";
      let previewMode = "";
      let previewKind = "";

      const setMessage = (text = "", type = "") => {
        elements.pipelineMessage.textContent = text;
        elements.pipelineMessage.className = `edit-message pipeline-message${type ? ` ${type}` : ""}`;
        elements.pipelineMessage.hidden = !text;
      };

      const dialogController = createDialogController({ dialog, closeButtons: cancelButtons });
      const showDialog = () => dialogController.open();

      const setPipelineButtonsDisabled = (disabled) => {
        for (const button of elements.pipelineButtons) button.disabled = disabled;
        for (const button of elements.backupButtons) button.disabled = disabled;
        for (const button of elements.settingsButtons) button.disabled = disabled;
      };

      const setDialogCloseMode = (active) => {
        footerCloseButton.textContent = active ? "Fenster schließen" : "Abbrechen";
      };

      const renderPersistentPipelineStatus = (status) => {
        const presentation = persistentStatusPresentation({
          pipelineStatus: status,
          backupStatus: state.backupStatusSnapshot || {},
          backupWasRunning: state.backupWasRunning,
        });
        elements.pipelineRunNotice.hidden = !presentation;
        elements.pipelineRunNotice.className = `pipeline-run-notice${presentation ? ` ${presentation.className}` : ""}`;
        if (!presentation) return;
        elements.pipelineRunNoticeTitle.textContent = presentation.title;
        elements.pipelineRunNoticeDetail.textContent = presentation.detail;
      };
      state.renderPersistentPipelineStatus = renderPersistentPipelineStatus;

      const showStatusDialog = (status) => {
        const presentation = pipelineStatusPresentation(status);
        if (!presentation) return;
        previewToken = "";
        previewMode = status.mode;
        elements.pipelineDialogTitle.textContent = presentation.title;
        elements.pipelineDialogDescription.textContent = pipelineModeLabel(status.mode);
        elements.pipelineModeChoice.hidden = true;
        elements.pipelinePreview.hidden = true;
        elements.pipelineStartButton.hidden = true;
        elements.pipelineStartButton.disabled = true;
        setDialogCloseMode(true);
        setMessage(presentation.message, presentation.messageType);
        showDialog();
      };

      const backupController = createBackupWorkflowController({
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
        activateBackupContext: () => {
          previewToken = "";
          previewMode = "nas-backup";
          previewKind = "backup";
          dialog.dataset.previewKind = "backup";
        },
        setMessage,
        showDialog,
        setDialogCloseMode,
        renderPersistentPipelineStatus,
      });

      const openChooser = () => {
        if (state.pipelineStatusSnapshot?.status === "running"
          || state.pipelineStatusSnapshot?.status === "awaiting-review") {
          showStatusDialog(state.pipelineStatusSnapshot);
          return;
        }
        if (state.backupStatusSnapshot?.status === "running") {
          backupController.showStatusDialog(state.backupStatusSnapshot);
          return;
        }
        previewToken = "";
        previewMode = "";
        previewKind = "";
        backupController.reset();
        dialog.dataset.previewKind = "";
        elements.pipelineDialogTitle.textContent = "Datenbank-Aktionen";
        elements.pipelineDialogDescription.textContent = "Wähle aus, was aktualisiert, gesichert oder bereinigt werden soll.";
        elements.pipelineModeChoice.hidden = false;
        elements.pipelinePreview.hidden = true;
        elements.pipelineStartButton.hidden = true;
        elements.pipelineStartButton.disabled = true;
        setDialogCloseMode(false);
        setMessage();
        showDialog();
      };

      const applyPipelinePreview = (result) => {
        const preview = renderPipelinePreview(result);
        elements.pipelinePreviewContent.innerHTML = preview.html;
        elements.pipelineWarning.textContent = preview.warning;
      };

      async function startCurrentPipelinePreview() {
        if (!previewToken) return;
        state.audioCleanup?.();
        state.audioCleanup = null;
        if (previewMode === "nc-sounds") await releaseAllAudioElements();
        elements.pipelineStartButton.disabled = true;
        setMessage(
          previewMode === "cleanup"
            ? "Bereinigung wird gestartet…"
            : previewMode === "transfer"
              ? "Übertragung wird gestartet…"
              : "Pipeline wird gestartet…",
          "info",
        );
        try {
          const startedStatus = await fetchJson("/api/pipeline/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: previewToken }),
          });
          state.pipelineStatusSnapshot = startedStatus;
          state.pipelineWasRunning = true;
          previewToken = "";
          elements.pipelineStartButton.hidden = true;
          elements.pipelinePreview.hidden = true;
          setDialogCloseMode(true);
          const presentation = pipelineStatusPresentation(startedStatus);
          elements.pipelineDialogTitle.textContent = presentation.title;
          elements.pipelineDialogDescription.textContent = pipelineModeLabel(startedStatus.mode);
          setMessage(presentation.message, presentation.messageType);
          renderPersistentPipelineStatus(startedStatus);
          await refreshPipelineStatus();
        } catch (error) {
          setMessage([error.message, ...(error.details || [])].join(" · "), "error");
          elements.pipelineStartButton.disabled = false;
        }
      }

      async function startSilentPipelinePreview(mode, options = {}) {
        state.silentPipelineContext = options.context || null;
        if (mode === "nc-sounds") await releaseAllAudioElements();
        const result = await fetchJson("/api/pipeline/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, targetSlugs: options.targetSlugs || [] }),
        });
        if (!result.tokensAvailable) {
          throw new Error("Die benötigten API-Tokens fehlen in der Server-Umgebung.");
        }
        if (!result.hasWork) {
          state.silentPipelineContext = null;
          return {
            noWork: true,
            message: "Für diese Art wurde aktuell keine passende Suchaktion gefunden.",
            preview: result,
          };
        }
        const startedStatus = await fetchJson("/api/pipeline/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: result.token }),
        });
        state.pipelineStatusSnapshot = startedStatus;
        state.pipelineWasRunning = true;
        renderPersistentPipelineStatus(startedStatus);
        void refreshPipelineStatus();
        return { noWork: false, status: startedStatus, preview: result };
      }

      async function openPreview(mode, options = {}) {
        if (options.silent) return startSilentPipelinePreview(mode, options);
        previewToken = "";
        previewMode = mode;
        previewKind = "pipeline";
        dialog.dataset.previewKind = "pipeline";
        backupController.reset();
        elements.pipelineStartButton.disabled = true;
        elements.pipelineStartButton.hidden = true;
        elements.pipelineModeChoice.hidden = true;
        elements.pipelinePreview.hidden = true;
        setDialogCloseMode(false);
        setMessage("Vorschau wird erstellt…", "info");
        elements.pipelineDialogTitle.textContent = options.transfer
          ? "Änderungen übertragen"
          : options.speciesRefresh
            ? "Art aktualisieren"
            : pipelineModeLabel(mode);
        elements.pipelineDialogDescription.textContent =
          options.transfer
            ? "Geänderte Eingabefelder und lokal gespeicherte Assets werden ohne externe Suche übertragen."
            : options.speciesRefresh
              ? "Vollständiger Pipeline-Lauf nur für diese Art."
            : mode === "cleanup"
            ? "Es wird genau einmal bestätigt, welche Alt-Daten und Assets dauerhaft gelöscht werden."
            : mode === "manual-maps"
              ? "Manuell geschützte und fehlende Karten werden erneut bei IUCN gesucht."
              : mode === "nc-sounds"
                ? "Vorhandene NC-Sounds werden auf freie Alternativen geprüft; fehlende Sounds werden erneut gesucht."
                : "Vor dem Start werden Zielarten und Umfang geprüft.";
        showDialog();

        try {
          const result = await fetchJson("/api/pipeline/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode, targetSlugs: options.targetSlugs || [] }),
          });
          previewToken = result.token;
          applyPipelinePreview(result);
          elements.pipelinePreview.hidden = false;
          elements.pipelineStartButton.hidden = false;
          elements.pipelineStartButton.disabled = !result.hasWork || !result.tokensAvailable;
          elements.pipelineStartButton.textContent =
            options.transfer
              ? "Änderungen übertragen"
              : mode === "cleanup"
              ? "Dauerhaft löschen"
              : mode === "manual-maps" || mode === "nc-sounds"
                ? "Suchlauf starten"
                : "Pipeline starten";
          setMessage(
            !result.tokensAvailable
              ? "Die benötigten API-Tokens fehlen in der Server-Umgebung."
              : result.hasWork
                ? "Vorschau ist bereit."
                : "Für diesen Lauf wurden keine Aktionen gefunden.",
            !result.tokensAvailable
              ? "error"
              : result.hasWork ? "success" : "info",
          );
          if (options.autoStart && result.hasWork && result.tokensAvailable) {
            await startCurrentPipelinePreview();
          }
        } catch (error) {
          setMessage([error.message, ...(error.details || [])].join(" · "), "error");
        }
      }

      async function notifySilentPipelineContext(status) {
        const context = state.silentPipelineContext;
        if (!context || context.source !== "editor") return false;
        const editDialog = elements.detailPanel.querySelector(".edit-dialog[open]");
        if (!editDialog) return false;
        const message = editDialog.querySelector(
          context.section === "map" ? ".map-edit-message" : ".sound-edit-message",
        );
        if (!message) return false;

        const setEditorMessage = (text, type = "info") => {
          message.textContent = text;
          message.className = `edit-message ${context.section === "map" ? "map-edit-message" : "sound-edit-message"} ${type}`;
          message.hidden = false;
        };

        if (status.status === "failed") {
          setEditorMessage(
            status.error || "Der gezielte Suchlauf ist fehlgeschlagen. Details stehen im Datenbankstatus.",
            "error",
          );
          return true;
        }

        if (status.status !== "completed") return false;

        const logText = (status.log || []).join("\n");
        const noMapAlternative =
          /Keine neue automatisch abrufbare Karte|Keine gültige Kartendatei|keine direkt speicherbare Karte/i.test(logText);
        const soundOutcome = soundSearchOutcome(status.log, {
          hasCurrentSound: context.hasCurrentSound === true,
        });
        if (context.section === "map") {
          try {
            await refreshExplorerModelOnly({ reload: true });
          } catch (error) {
            setEditorMessage(
              `Kartensuchlauf abgeschlossen, aber der Status konnte nicht aktualisiert werden: ${error.message}`,
              "error",
            );
            return true;
          }
          setEditorMessage(
            noMapAlternative
              ? "Kartensuchlauf abgeschlossen. Lokal wurde keine direkt speicherbare Karte gefunden. Bitte „IUCN-Karte im Browser öffnen“ nutzen, den sichtbaren Backblaze-JPEG-Link ins Quellenfeld kopieren und „Karte prüfen“ wählen."
              : "Kartensuchlauf abgeschlossen. Die Auswahl wurde verarbeitet.",
            noMapAlternative ? "info" : "success",
          );
        } else {
          let refreshedSoundEditor = false;
          if (!soundOutcome.soundLocked && !soundOutcome.noAlternative) {
            try {
              refreshedSoundEditor = await refreshOpenSoundEditor(context.speciesId);
            } catch (error) {
              setEditorMessage(
                `Sound-Suchlauf abgeschlossen, aber die offene Ansicht konnte nicht aktualisiert werden: ${error.message}`,
                "error",
              );
              return true;
            }
          }
          setEditorMessage(
            soundOutcome.message
              ? soundOutcome.message
              : refreshedSoundEditor
              ? "Sound-Suchlauf abgeschlossen. Der aktuelle Sound und die Credits wurden im geöffneten Fenster aktualisiert."
              : "Sound-Suchlauf abgeschlossen. Die Auswahl wurde verarbeitet.",
            soundOutcome.message ? soundOutcome.messageType : "success",
          );
        }
        return true;
      }

      async function refreshPipelineStatus() {
        try {
          const status = await fetchJson("/api/pipeline/status");
          state.pipelineStatusSnapshot = status;
          const running = status.status === "running";
          const awaitingReview = status.status === "awaiting-review";
          const active = running || awaitingReview;
          setPipelineButtonsDisabled(active);
          if (running) renderDatabaseStatus("running");
          else if (awaitingReview) renderDatabaseStatus("review");
          else if (status.status === "failed") renderDatabaseStatus("failed");
          else renderDatabaseStatus();
          renderPersistentPipelineStatus(status);
          elements.pipelineStatusDetail.textContent = active
            ? `${pipelineModeLabel(status.mode)} · gestartet ${formatDate(status.startedAt).replace(/^Report /, "")}`
            : status.completedAt
              ? `${pipelineModeLabel(status.mode)} · beendet ${formatDate(status.completedAt).replace(/^Report /, "")}`
              : "Kein Lauf aktiv.";
          elements.pipelineStatusDetail.className = `pipeline-dialog-status${
            status.status === "awaiting-review" ? " review" : status.status !== "idle" ? ` ${status.status}` : ""
          }`;
          renderProcessLog({
            details: elements.pipelineLogDetails,
            log: elements.pipelineLog,
            lines: status.log,
          });

          if (dialog.open && active) {
            const presentation = pipelineStatusPresentation(status);
            setDialogCloseMode(true);
            setMessage(presentation.message, presentation.messageType);
          } else if (dialog.open && state.pipelineWasRunning && !active) {
            const presentation = pipelineStatusPresentation(status);
            if (presentation) {
              elements.pipelineDialogTitle.textContent = presentation.title;
              elements.pipelineDialogDescription.textContent = pipelineModeLabel(status.mode);
              setDialogCloseMode(true);
              setMessage(presentation.message, presentation.messageType);
            }
          }

          if (awaitingReview && !state.newSpeciesPipelineActive) state.openAssetReview?.(status);

          if (state.pipelineWasRunning && !active && status.status !== "idle") {
            if (status.status === "completed" && status.gitPublished) state.notice = "";
            const keepAssetReviewOpen = state.finishAssetReviewWaiting?.(status) === true;
            const keepEditDialogOpen = await notifySilentPipelineContext(status);
            if (keepEditDialogOpen) state.reloadAfterEditClose = true;
            else if (keepAssetReviewOpen) state.reloadAfterAssetReviewClose = true;
            else await loadData({ reload: true });
            if (state.silentPipelineContext) state.silentPipelineContext = null;
          }
          state.pipelineWasRunning = active;
          clearTimeout(state.pipelinePollTimer);
          state.pipelinePollTimer = active
            ? setTimeout(refreshPipelineStatus, 1000)
            : null;
        } catch (error) {
          elements.pipelineStatus.textContent = "Statusfehler";
          elements.pipelineStatusDetail.textContent = error.message;
          elements.pipelineStatusDetail.className = "pipeline-dialog-status failed";
          elements.pipelineRunNotice.hidden = false;
          elements.pipelineRunNotice.className = "pipeline-run-notice failed";
          elements.pipelineRunNoticeTitle.textContent = "Pipeline-Status nicht verfügbar";
          elements.pipelineRunNoticeDetail.textContent = error.message;
        }
      }

      for (const button of elements.pipelineButtons) {
        button.addEventListener("click", () => openPreview(button.dataset.pipelineMode));
      }
      elements.pipelineMenuButton.addEventListener("click", () => {
        const pipelineActive = state.pipelineStatusSnapshot?.status === "running"
          || state.pipelineStatusSnapshot?.status === "awaiting-review";
        const backupActive = state.backupStatusSnapshot?.status === "running";
        if (pipelineActive) {
          showStatusDialog(state.pipelineStatusSnapshot);
          return;
        }
        if (backupActive) {
          backupController.showStatusDialog(state.backupStatusSnapshot);
          return;
        }
        if (state.databaseNeedsUpdate) {
          void openPreview("transfer", { transfer: true });
          return;
        }
        if (!state.editMode) return;
        openChooser();
      });
      elements.pipelineRunNoticeOpen.addEventListener("click", () => {
        if (pipelineStatusPresentation(state.pipelineStatusSnapshot || {})) showStatusDialog(state.pipelineStatusSnapshot);
        else if (backupStatusPresentation(state.backupStatusSnapshot || {})) backupController.showStatusDialog(state.backupStatusSnapshot);
      });
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (previewKind === "backup") {
          await backupController.startPreview();
          return;
        }
        await startCurrentPipelinePreview();
      });

      state.openPipelinePreview = openPreview;
      backupController.bind();
      void refreshPipelineStatus();
    }

    return Object.freeze({
      setupPipelineControl,
    });
  }

  global.SpeciesExplorerPipelineWorkflow = Object.freeze({
    createPipelineWorkflowController,
  });
})(globalThis);
