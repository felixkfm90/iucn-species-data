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
      const statusRetryDelays = [1000, 2000, 4000, 8000];
      let statusReadPromise = null, statusReadGeneration = 0, queuedStatusRead = false, statusReadFailures = 0;

      const setMessage = (text = "", type = "") => {
        elements.pipelineMessage.textContent = text;
        elements.pipelineMessage.className = `edit-message pipeline-message${type ? ` ${type}` : ""}`;
        elements.pipelineMessage.hidden = !text;
      };
      state.setPipelineMessage = setMessage;

      const dialogController = createDialogController({ dialog, closeButtons: cancelButtons });
      const showDialog = () => dialogController.open();

      const setPipelineButtonsDisabled = (disabled) => {
        for (const button of elements.pipelineButtons) button.disabled = disabled;
        for (const button of elements.backupButtons) button.disabled = disabled;
        for (const button of elements.settingsButtons) button.disabled = disabled;
        for (const button of elements.taxonomyButtons) button.disabled = disabled;
      };

      const setDialogCloseMode = (active) => {
        footerCloseButton.textContent = active ? "Fenster schließen" : "Abbrechen";
      };

      const hasSavedCreation = (status) => status?.status === "awaiting-review"
        && status.guidedSpeciesCreation === true && typeof status.creationId === "string"
        && status.creationId.trim().length > 0 && status.targets?.length === 1;

      const openSavedCreation = () => {
        if (!hasSavedCreation(state.pipelineStatusSnapshot)
          || typeof state.resumeNewSpeciesCreation !== "function") return false;
        void state.resumeNewSpeciesCreation();
        return true;
      };

      const renderPersistentPipelineStatus = (status) => {
        const readErrors = [["Pipeline", state.pipelineStatusReadError], ["Backup", state.backupStatusReadError]]
          .filter(([, error]) => error);
        elements.pipelineRunNoticeOpen.textContent = !readErrors.length && hasSavedCreation(status)
          ? "Artanlage fortsetzen" : "Details anzeigen";
        if (readErrors.length) {
          elements.pipelineRunNotice.hidden = false;
          elements.pipelineRunNotice.className = "pipeline-run-notice failed";
          elements.pipelineRunNoticeTitle.textContent = readErrors.map(([label]) => `${label}-Status nicht verfügbar`).join(" · ");
          elements.pipelineRunNoticeDetail.textContent = readErrors.map(([label, error]) => {
            const next = error.retryDelay === null
              ? "Statusfenster erneut öffnen, um frisch zu prüfen."
              : `Erneute Statusprüfung in ${error.retryDelay / 1000} Sekunden.`;
            return `${label}: ${error.message} · Letzter bestätigter Stand; aktuell nicht bestätigt. ${next}`;
          }).join(" · ");
          return;
        }
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
        void refreshPipelineStatus();
        const presentation = state.pipelineStatusReadError ? {
          title: "Pipeline-Status nicht verfügbar",
          message: `Letzter bestätigter Stand; aktuell nicht bestätigt. ${state.pipelineStatusReadError.message}`,
          messageType: "error",
        } : pipelineStatusPresentation(status);
        if (!presentation) return;
        previewToken = "";
        previewMode = status.mode;
        previewKind = "pipeline-status";
        dialog.dataset.previewKind = previewKind;
        dialog.dataset.statusKind = "pipeline";
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

      const openReadErrorStatus = () => {
        const pipelineError = Boolean(state.pipelineStatusReadError);
        const backupError = Boolean(state.backupStatusReadError);
        if (!pipelineError && !backupError) return false;
        if (pipelineError) {
          showStatusDialog(state.pipelineStatusSnapshot || {});
          if (backupError) void backupController.refreshStatus();
        } else backupController.showStatusDialog(state.backupStatusSnapshot || {});
        return true;
      };

      const openChooser = () => {
        if (openReadErrorStatus()) return;
        if (state.pipelineStatusSnapshot?.status === "running"
          || state.pipelineStatusSnapshot?.status === "awaiting-review") {
          showStatusDialog(state.pipelineStatusSnapshot || {});
          return;
        }
        if (state.backupStatusSnapshot?.status === "running") {
          backupController.showStatusDialog(state.backupStatusSnapshot || {});
          return;
        }
        previewToken = "";
        previewMode = "";
        previewKind = "";
        backupController.reset();
        dialog.dataset.previewKind = "";
        dialog.dataset.statusKind = "";
        elements.pipelineDialogTitle.textContent = "Datenbank-Aktionen";
        elements.pipelineDialogDescription.textContent = "Wähle aus, was aktualisiert, gesichert oder bereinigt werden soll.";
        elements.pipelineModeChoice.hidden = false;
        const moreActions = dialog.querySelector("#pipeline-more-actions");
        if (moreActions) moreActions.open = false;
        const technicalDetails = dialog.querySelector("#taxonomy-master-technical-details");
        if (technicalDetails) technicalDetails.open = false;
        elements.pipelinePreview.hidden = true;
        elements.pipelineStartButton.hidden = true;
        elements.pipelineStartButton.disabled = true;
        setDialogCloseMode(false);
        setMessage();
        showDialog();
        void state.refreshTaxonomyMaintenanceStatus?.();
        void state.refreshTaxonomyMasterStatus?.();
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
          previewKind = "pipeline-status";
          dialog.dataset.previewKind = previewKind;
          dialog.dataset.statusKind = "pipeline";
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
        dialog.dataset.statusKind = "";
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
              ? "Kartensuchlauf abgeschlossen. Lokal wurde keine direkt speicherbare Karte gefunden. Bitte „IUCN-Karte im Browser öffnen“ nutzen und die sichtbare JPEG-Karte im Browser speichern. Danach die JPEG-/PNG-Datei im Karteneditor auswählen und „Karte prüfen“ wählen. Nur wenn tatsächlich ein signierter IUCN-/Backblaze-Link sichtbar ist, kann stattdessen die Quellen-URL verwendet werden."
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

      function scheduleStatusRead(delay) {
        const generation = statusReadGeneration;
        clearTimeout(state.pipelinePollTimer);
        const timer = setTimeout(() => {
          if (generation !== statusReadGeneration || state.pipelinePollTimer !== timer) return;
          state.pipelinePollTimer = null;
          void refreshPipelineStatus({ resetRetries: false });
        }, delay);
        state.pipelinePollTimer = timer;
      }

      async function refreshPipelineStatus({ resetRetries = true } = {}) {
        clearTimeout(state.pipelinePollTimer);
        state.pipelinePollTimer = null;
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
          // Keep read retry separate from completion notifications and model reload.
          try { status = await global.SpeciesExplorerBackupWorkflow.readWorkflowStatus(fetchJson, "/api/pipeline/status"); }
          catch (error) {
            if (generation !== statusReadGeneration) return;
            const delay = statusRetryDelays[statusReadFailures++] ?? null;
            state.pipelineStatusReadError = { message: error.message, retryDelay: delay };
            elements.pipelineStatus.textContent = "Status nicht aktuell";
            if (dialog.open && dialog.dataset.previewKind === "pipeline-status" && dialog.dataset.statusKind === "pipeline") {
              elements.pipelineStatusDetail.textContent = error.message;
              elements.pipelineStatusDetail.className = "pipeline-dialog-status failed";
              setMessage(`Pipeline-Status aktuell nicht bestätigt: ${error.message}`, "error");
            }
            renderPersistentPipelineStatus(state.pipelineStatusSnapshot || { status: "idle" });
            if (delay !== null) scheduleStatusRead(delay);
            return;
          }
          if (generation !== statusReadGeneration) return;
          statusReadFailures = 0;
          state.pipelineStatusReadError = null;
          try {
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
            if (dialog.open && dialog.dataset.previewKind === "pipeline-status" && dialog.dataset.statusKind === "pipeline") {
              const presentation = pipelineStatusPresentation(status) || {
                title: "Artdaten und Medien", message: "Kein Lauf aktiv.", messageType: "info",
              };
              elements.pipelineDialogTitle.textContent = presentation.title;
              elements.pipelineDialogDescription.textContent = pipelineModeLabel(status.mode || "");
              setDialogCloseMode(active);
              setMessage(presentation.message, presentation.messageType);
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
            }

            if (awaitingReview && !state.newSpeciesPipelineActive && !hasSavedCreation(status)) {
              state.openAssetReview?.(status);
            }

            if (state.pipelineWasRunning && !active && status.status !== "idle") {
              // Consume the transition before an awaited view refresh can fail.
              state.pipelineWasRunning = false;
              if (status.status === "completed" && status.gitPublished) state.notice = "";
              const keepAssetReviewOpen = state.finishAssetReviewWaiting?.(status) === true;
              const keepEditDialogOpen = await notifySilentPipelineContext(status);
              if (keepEditDialogOpen) state.reloadAfterEditClose = true;
              else if (keepAssetReviewOpen) state.reloadAfterAssetReviewClose = true;
              else await loadData({ reload: true });
              if (state.silentPipelineContext) state.silentPipelineContext = null;
            }
            state.pipelineWasRunning = active;
          } catch (error) {
            if (state.pipelineStatusReadError || state.backupStatusReadError) renderPersistentPipelineStatus(status);
            else {
              elements.pipelineRunNotice.hidden = false;
              elements.pipelineRunNotice.className = "pipeline-run-notice failed";
              elements.pipelineRunNoticeTitle.textContent = "Pipeline-Ansicht nicht aktualisiert";
              elements.pipelineRunNoticeDetail.textContent = error.message;
            }
          }
          if (generation === statusReadGeneration && ["running", "awaiting-review"].includes(status.status)) {
            scheduleStatusRead(1000);
          }
        }).finally(() => {
          statusReadPromise = null;
          if (queuedStatusRead) {
            queuedStatusRead = false;
            void refreshPipelineStatus({ resetRetries: false });
          }
        });
        return statusReadPromise;
      }

      for (const button of elements.pipelineButtons) {
        button.addEventListener("click", () => openPreview(button.dataset.pipelineMode));
      }
      elements.pipelineMenuButton.addEventListener("click", () => {
        if (openReadErrorStatus()) return;
        const pipelineActive = state.pipelineStatusSnapshot?.status === "running"
          || state.pipelineStatusSnapshot?.status === "awaiting-review";
        const backupActive = state.backupStatusSnapshot?.status === "running";
        const taxonomyActive = state.taxonomyMaintenanceSnapshot?.active === true
          || state.taxonomyMasterSnapshot?.active === true || state.taxonomyDatabaseBusy
          || (state.taxonomyMasterSnapshot?.buildJob?.available === true
            && state.taxonomyMasterSnapshot.buildJob.status !== "ready")
          || Boolean(state.taxonomyMasterSnapshot?.lifecycle?.candidate || state.taxonomyMasterSnapshot?.error);
        if (pipelineActive) {
          if (openSavedCreation()) return;
          showStatusDialog(state.pipelineStatusSnapshot || {});
          return;
        }
        if (backupActive) {
          backupController.showStatusDialog(state.backupStatusSnapshot || {});
          return;
        }
        if (taxonomyActive) {
          openChooser();
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
        if (openReadErrorStatus()) return;
        if (openSavedCreation()) return;
        if (pipelineStatusPresentation(state.pipelineStatusSnapshot || {})) {
          showStatusDialog(state.pipelineStatusSnapshot || {});
        } else if (backupStatusPresentation(state.backupStatusSnapshot || {})) {
          backupController.showStatusDialog(state.backupStatusSnapshot || {});
        }
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
