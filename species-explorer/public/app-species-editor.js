(function initializeSpeciesExplorerSpeciesEditor(global) {
  "use strict";

  function createSpeciesEditorController(dependencies = {}) {
    const {
      state,
      elements,
      createMessageSetter,
      createFieldFeedbackController,
      createEditorFormModel,
      composeManualSexedMeasurement,
      formatManualMeasurement,
      stripManualMeasureInput,
      MANUAL_SIZE_UNITS,
      MANUAL_WEIGHT_UNITS,
      MANUAL_AGE_UNITS,
      createDialogController,
      showQuickConfirm,
      hasOpenDialog,
      loadData,
      createAssetMaintenanceController,
      fetchJson,
      releaseAllAudioElements,
      fileToBase64,
      waitForAudioMetadata,
      formatBytes,
      formatTime,
      dataRows,
      escapeHtml,
      createMapEditorController,
      createSoundEditorController,
      createPortraitEditorController,
      createGeneralEditorController,
      backupRetentionText,
    } = dependencies;

    function setupSpeciesEditor(species) {
      const dialog = elements.detailPanel.querySelector(".edit-dialog");
      const openButtons = [...elements.detailPanel.querySelectorAll(".edit-species-open")];
      const closeButtons = [...elements.detailPanel.querySelectorAll(".edit-cancel")];
      const form = elements.detailPanel.querySelector(".edit-form");
      const preview = elements.detailPanel.querySelector(".edit-preview");
      const previewRows = elements.detailPanel.querySelector(".edit-preview-rows");
      const message = elements.detailPanel.querySelector(".edit-message");
      const previewButton = elements.detailPanel.querySelector(".edit-preview-button");
      const saveButton = elements.detailPanel.querySelector(".edit-save-button");
      const scientificNameInput = elements.detailPanel.querySelector(".scientific-name-input");
      const scientificNameUnlockButton = elements.detailPanel.querySelector(".scientific-name-unlock");
      const scientificNameWarning = elements.detailPanel.querySelector(".scientific-name-warning");
      const mapFileInput = elements.detailPanel.querySelector(".map-file-input");
      const mapReasonInput = elements.detailPanel.querySelector(".map-reason-input");
      const mapSourceInput = elements.detailPanel.querySelector(".map-source-input");
      const mapMessage = elements.detailPanel.querySelector(".map-edit-message");
      const mapPreview = elements.detailPanel.querySelector(".map-edit-preview");
      const mapCurrentImage = elements.detailPanel.querySelector(".map-preview-current");
      const mapNewImage = elements.detailPanel.querySelector(".map-preview-new");
      const mapCurrentMeta = elements.detailPanel.querySelector(".map-current-meta");
      const mapNewMeta = elements.detailPanel.querySelector(".map-new-meta");
      const mapPreviewButton = elements.detailPanel.querySelector(".map-preview-button");
      const mapSaveButton = elements.detailPanel.querySelector(".map-save-button");
      const mapAutoSearchButton = elements.detailPanel.querySelector(".map-auto-search-button");
      const mapBrowserLink = elements.detailPanel.querySelector(".map-browser-link");
      const mapDeleteButton = elements.detailPanel.querySelector(".map-delete-button");
      const mapRestoreButton = elements.detailPanel.querySelector(".map-restore-button");
      const soundFileInput = elements.detailPanel.querySelector(".sound-file-input");
      const soundReasonInput = elements.detailPanel.querySelector(".sound-reason-input");
      const soundMessage = elements.detailPanel.querySelector(".sound-edit-message");
      const soundPreview = elements.detailPanel.querySelector(".sound-edit-preview");
      const currentSoundAudio = elements.detailPanel.querySelector(".current-sound-audio");
      const soundCurrentAudio = elements.detailPanel.querySelector(".sound-preview-current");
      const soundNewAudio = elements.detailPanel.querySelector(".sound-preview-new");
      const soundCurrentMeta = elements.detailPanel.querySelector(".sound-current-meta");
      const soundNewMeta = elements.detailPanel.querySelector(".sound-new-meta");
      const soundCreditsPreview = elements.detailPanel.querySelector(".sound-credits-preview");
      const soundLicenseState = elements.detailPanel.querySelector(".sound-license-state");
      const soundPreviewButton = elements.detailPanel.querySelector(".sound-preview-button");
      const soundSaveButton = elements.detailPanel.querySelector(".sound-save-button");
      const soundRejectCurrentButton = elements.detailPanel.querySelector(".sound-reject-current-button");
      const soundAutoSearchButton = elements.detailPanel.querySelector(".sound-auto-search-button");
      const soundDeleteButton = elements.detailPanel.querySelector(".sound-delete-button");
      const soundRestoreButton = elements.detailPanel.querySelector(".sound-restore-button");
      const portraitInstructions = elements.detailPanel.querySelector(".portrait-instructions-input");
      const portraitMessage = elements.detailPanel.querySelector(".portrait-edit-message");
      const portraitPreview = elements.detailPanel.querySelector(".portrait-edit-preview");
      const portraitCurrentImage = elements.detailPanel.querySelector(".portrait-preview-current");
      const portraitNewImage = elements.detailPanel.querySelector(".portrait-preview-new");
      const portraitCurrentMeta = elements.detailPanel.querySelector(".portrait-current-meta");
      const portraitNewMeta = elements.detailPanel.querySelector(".portrait-new-meta");
      const portraitPrompt = elements.detailPanel.querySelector(".portrait-prompt-preview");
      const portraitPromptDetails = elements.detailPanel.querySelector(".portrait-prompt-details");
      const portraitPromptButton = elements.detailPanel.querySelector(".portrait-prompt-button");
      const portraitCopyButton = elements.detailPanel.querySelector(".portrait-copy-button");
      const portraitFileInput = elements.detailPanel.querySelector(".portrait-file-input");
      const portraitPreviewButton = elements.detailPanel.querySelector(".portrait-preview-button");
      const portraitKeepButton = elements.detailPanel.querySelector(".portrait-keep-button");
      const portraitSaveButton = elements.detailPanel.querySelector(".portrait-save-button");
      const portraitDeleteButton = elements.detailPanel.querySelector(".portrait-delete-button");
      const portraitRestoreButton = elements.detailPanel.querySelector(".portrait-restore-button");
      if (!dialog || !openButtons.length || !closeButtons.length || !form || !preview || !previewRows) return;

      const mapEditorController = createMapEditorController({
        species,
        state,
        closeButtons,
        mapFileInput,
        mapReasonInput,
        mapSourceInput,
        mapMessage,
        mapPreview,
        mapCurrentImage,
        mapNewImage,
        mapCurrentMeta,
        mapNewMeta,
        mapPreviewButton,
        mapSaveButton,
        mapAutoSearchButton,
        mapBrowserLink,
        mapDeleteButton,
        fileToBase64,
        fetchJson,
        formatBytes,
        closeEditDialog: () => closeEditDialog(),
        loadData,
      });
      const {
        setMessage: setMapMessage,
        resetPreview: resetMapPreview,
        setBusy: setMapBusy,
      } = mapEditorController;

      const soundEditorController = createSoundEditorController({
        species,
        state,
        form,
        closeButtons,
        currentSoundAudio,
        soundCurrentAudio,
        soundNewAudio,
        soundMessage,
        soundPreview,
        soundCurrentMeta,
        soundNewMeta,
        soundCreditsPreview,
        soundLicenseState,
        soundPreviewButton,
        soundSaveButton,
        soundRejectCurrentButton,
        soundAutoSearchButton,
        soundDeleteButton,
        soundFileInput,
        soundReasonInput,
        releaseAllAudioElements,
        fetchJson,
        fileToBase64,
        waitForAudioMetadata,
        formatBytes,
        formatTime,
        dataRows,
        closeEditDialog: () => closeEditDialog(),
        loadData,
      });
      const {
        setMessage: setSoundMessage,
        resetPreview: resetSoundPreview,
        setBusy: setSoundBusy,
        stopPreviewAudio: stopSoundPreviewAudio,
        releaseCurrentAudio: releaseCurrentSoundAudio,
      } = soundEditorController;

      const portraitEditorController = createPortraitEditorController({
        species,
        state,
        closeButtons,
        portraitInstructions,
        portraitMessage,
        portraitPreview,
        portraitCurrentImage,
        portraitNewImage,
        portraitCurrentMeta,
        portraitNewMeta,
        portraitPrompt,
        portraitPromptDetails,
        portraitPromptButton,
        portraitCopyButton,
        portraitFileInput,
        portraitPreviewButton,
        portraitKeepButton,
        portraitSaveButton,
        portraitDeleteButton,
        fetchJson,
        fileToBase64,
        formatBytes,
        closeEditDialog: () => closeEditDialog(),
        loadData,
      });
      const {
        setMessage: setPortraitMessage,
        resetPreview: resetPortraitPreview,
        resetPrompt: resetPortraitPrompt,
        setBusy: setPortraitBusy,
      } = portraitEditorController;

      const generalEditorController = createGeneralEditorController({
        species,
        state,
        form,
        preview,
        previewRows,
        message,
        previewButton,
        saveButton,
        closeButtons,
        scientificNameInput,
        scientificNameUnlockButton,
        scientificNameWarning,
        createMessageSetter,
        createFieldFeedbackController,
        createEditorFormModel,
        composeManualSexedMeasurement,
        formatManualMeasurement,
        stripManualMeasureInput,
        sizeUnits: MANUAL_SIZE_UNITS,
        weightUnits: MANUAL_WEIGHT_UNITS,
        ageUnits: MANUAL_AGE_UNITS,
        showQuickConfirm,
        fetchJson,
        escapeHtml,
        backupRetentionText,
        closeEditDialog: () => closeEditDialog(),
        loadData,
      });
      const {
        handleInput: handleGeneralInput,
        resetForOpen: resetGeneralEditorForOpen,
        resetPreview,
        setMessage,
      } = generalEditorController;


      const sectionLabels = {
        manual: "Allgemeine Daten bearbeiten",
        portrait: "Artporträt bearbeiten",
        map: "Verbreitungskarte bearbeiten",
        sound: "Tierstimme bearbeiten",
      };

      const openEditor = (section = "manual") => {
        const activeSection = ["manual", "portrait", "map", "sound"].includes(section) ? section : "manual";
        form.reset();
        resetPreview();
        resetMapPreview();
        resetSoundPreview();
        resetPortraitPreview();
        resetPortraitPrompt();
        setMessage();
        setMapMessage();
        setSoundMessage();
        setPortraitMessage();
        if (activeSection === "manual") {
          resetGeneralEditorForOpen();
        }
        dialog.dataset.activeSection = activeSection;
        const title = dialog.querySelector("#edit-dialog-title");
        if (title) title.textContent = sectionLabels[activeSection] || `${species.germanName} bearbeiten`;
        dialogController.open();
      };


      for (const button of openButtons) {
        button.addEventListener("click", () => {
          openEditor(button.dataset.editSection || "manual");
        });
      }

      const runDeferredEditorReload = () => {
        const forceReload = state.reloadAfterEditClose;
        if (!forceReload && !state.pendingRevisionReload) return;
        if (hasOpenDialog()) return;
        state.reloadAfterEditClose = false;
        state.pendingRevisionReload = false;
        void loadData({ reload: forceReload });
      };

      const dialogController = createDialogController({
        dialog,
        closeButtons,
        beforeClose: () => {
          stopSoundPreviewAudio();
          return true;
        },
        afterClose: runDeferredEditorReload,
      });
      const closeEditDialog = () => dialogController.close("programmatic");

      const assetMaintenanceController = createAssetMaintenanceController({
        state,
        species,
        fetchJson,
        loadData,
        releaseCurrentSoundAudio,
        closeEditor: closeEditDialog,
        sections: {
          map: {
            message: setMapMessage,
            busy: setMapBusy,
            reset: resetMapPreview,
            deleteButton: mapDeleteButton,
            restoreButton: mapRestoreButton,
          },
          portrait: {
            message: setPortraitMessage,
            busy: setPortraitBusy,
            reset: resetPortraitPreview,
            deleteButton: portraitDeleteButton,
            restoreButton: portraitRestoreButton,
          },
          sound: {
            message: setSoundMessage,
            busy: setSoundBusy,
            reset: resetSoundPreview,
            deleteButton: soundDeleteButton,
            restoreButton: soundRestoreButton,
          },
        },
      });
      assetMaintenanceController.bind();

      form.addEventListener("input", (event) => {
        if (event.target.closest(".sound-edit-section")) {
          resetSoundPreview();
          setSoundMessage("Sound oder Credits geändert. Bitte die Vorschau erneut erstellen.", "info");
          return;
        }
        if (event.target.closest(".portrait-edit-section")) {
          resetPortraitPreview();
          if (event.target === portraitInstructions) resetPortraitPrompt();
          setPortraitMessage(
            "Eingabe geändert. Prompt beziehungsweise Bildvorschau bitte erneut erstellen.",
            "info",
          );
          return;
        }
        if (event.target.closest(".map-edit-section")) {
          resetMapPreview();
          setMapMessage("Kartenauswahl oder Angaben geändert. Bitte die Vorschau erneut erstellen.", "info");
          return;
        }
        handleGeneralInput();
      });

    }

    return Object.freeze({
      setupSpeciesEditor,
    });
  }

  global.SpeciesExplorerSpeciesEditor = Object.freeze({
    createSpeciesEditorController,
  });
})(globalThis);
