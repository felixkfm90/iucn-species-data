(function initializeSpeciesExplorerNewSpeciesWorkflow(global) {
  "use strict";

  function createNewSpeciesWorkflowController(dependencies = {}) {
    const {
      state,
      elements,
      createMessageSetter,
      createFieldFeedbackController,
      createNewSpeciesFormModel,
      composeManualSexedMeasurement,
      formatManualMeasurement,
      stripManualMeasureInput,
      MANUAL_SIZE_UNITS,
      MANUAL_WEIGHT_UNITS,
      MANUAL_AGE_UNITS,
      fetchJson,
      fileToBase64,
      escapeHtml,
      formatBytes,
      formatTime,
      createDialogController,
      createAssetReviewMediaController,
      releaseMediaWithin,
      resetScrollableToTop,
      reviewSignature,
      renderAssetReviewList,
      soundSearchOutcome,
      loadData,
      showQuickConfirm,
      iucnDistributionMapUrl,
      safeUrl,
      waitForAudioMetadata,
      dataRows,
      soundLicenseInfo,
      soundLicenseBadgeHtml,
      cacheBustedUrl,
      versionedAssetUrl,
      bindAudioPlayer,
      bindImageZoom,
      openSharedMapLightbox,
    } = dependencies;

    function setupNewSpeciesCreator() {
      const dialog = elements.newSpeciesDialog;
      const form = elements.newSpeciesForm;
      const openButton = elements.newSpeciesButton;
      const closeButtons = [...dialog.querySelectorAll(".new-species-cancel")];
      const steps = [...dialog.querySelectorAll("[data-new-species-step]")];
      const stepIndicators = [...dialog.querySelectorAll("[data-new-species-step-indicator]")];
      const preview = dialog.querySelector(".new-species-preview");
      const message = dialog.querySelector(".new-species-message");
      const previewButton = dialog.querySelector(".new-species-preview-button");
      const nextButton = dialog.querySelector(".new-species-next-button");
      const backButton = dialog.querySelector(".new-species-back-button");
      const saveButton = dialog.querySelector(".new-species-save-button");
      const jsonPreview = dialog.querySelector(".new-species-json");
      const derivedFields = [...dialog.querySelectorAll("[data-derived]")];
      const portraitInstructions = dialog.querySelector(".new-species-portrait-instructions");
      const portraitPromptButton = dialog.querySelector(".new-species-portrait-prompt-button");
      const portraitCopyButton = dialog.querySelector(".new-species-portrait-copy-button");
      const portraitPromptDetails = dialog.querySelector(".new-species-portrait-prompt-details");
      const portraitPrompt = dialog.querySelector(".new-species-portrait-prompt");
      const portraitFileInput = dialog.querySelector(".new-species-portrait-file-input");
      const portraitMessage = dialog.querySelector(".new-species-portrait-message");
      const portraitPreview = dialog.querySelector(".new-species-portrait-preview");
      const portraitPreviewImage = dialog.querySelector(".new-species-portrait-preview-image");
      const portraitPreviewMeta = dialog.querySelector(".new-species-portrait-preview-meta");
      const portraitPreviewButton = dialog.querySelector(".new-species-portrait-preview-button");
      const portraitSkipButton = dialog.querySelector(".new-species-portrait-skip-button");
      const finalPortraitState = dialog.querySelector(".new-species-final-portrait-state");
      const pipelineMessage = dialog.querySelector(".new-species-pipeline-message");
      const pipelineStepItems = [...dialog.querySelectorAll("[data-new-species-pipeline-step]")];
      const mapReview = dialog.querySelector(".new-species-map-review");
      const soundReview = dialog.querySelector(".new-species-sound-review");
      const finishMessage = dialog.querySelector(".new-species-finish-message");
      const doneSection = dialog.querySelector(".new-species-done");

      let currentStep = 1;
      let previewToken = "";
      let portraitPromptText = "";
      let portraitPreviewToken = "";
      let portraitSkipped = false;
      let busy = false;
      let pipelineBusy = false;
      let completed = false;
      let savedSpeciesId = "";
      let savedSpeciesName = "";
      let inlineRunId = "";
      let inlineReviewAssets = [];
      let inlineReviewChoices = new Map();
      let inlineManualMapPreviewToken = "";
      let inlineManualMapHandled = false;
      let inlinePipelinePollTimer = null;
      let maxStepReached = 1;

      const setMessage = createMessageSetter(message, "edit-message new-species-message");
      const setPortraitMessage = createMessageSetter(
        portraitMessage,
        "edit-message new-species-portrait-message",
      );
      const setPipelineMessage = createMessageSetter(
        pipelineMessage,
        "edit-message new-species-pipeline-message",
      );
      const setFinishMessage = createMessageSetter(
        finishMessage,
        "edit-message new-species-finish-message",
      );
      const {
        fieldLabel,
        clearFieldErrors,
        applyFieldErrors,
        updateMeasurementMode,
      } = createFieldFeedbackController({ form, documentRef: document });

      const { speciesValues, localFieldErrors } = createNewSpeciesFormModel({
        form,
        FormDataClass: FormData,
        composeManualSexedMeasurement,
        formatManualMeasurement,
        stripManualMeasureInput,
        sizeUnits: MANUAL_SIZE_UNITS,
        weightUnits: MANUAL_WEIGHT_UNITS,
        ageUnits: MANUAL_AGE_UNITS,
      });

      const markSpeciesInputsChanged = () => {
        previewToken = "";
        maxStepReached = 1;
        preview.hidden = true;
        resetPortraitPrompt();
        resetPortraitPreview();
        if (currentStep !== 1) showStep(1);
        setMessage("Eingaben geändert. Bitte erneut prüfen.", "info");
        updateButtons();
      };

      const canAdvanceFromPortrait = () => portraitSkipped || Boolean(portraitPreviewToken);

      const updateFinalPortraitState = () => {
        if (!finalPortraitState) return;
        finalPortraitState.hidden = currentStep >= 3;
        if (finalPortraitState.hidden) return;
        finalPortraitState.textContent = portraitPreviewToken
          ? "Geprüftes Artportrait wird beim Abschluss lokal übernommen."
          : "Artportrait wird übersprungen.";
      };

      const stopInlinePipelinePolling = () => {
        clearTimeout(inlinePipelinePollTimer);
        inlinePipelinePollTimer = null;
      };

      const setPipelineStepState = (activeKey = "", doneKeys = []) => {
        const doneSet = new Set(doneKeys);
        for (const item of pipelineStepItems) {
          const key = item.dataset.newSpeciesPipelineStep;
          item.classList.toggle("active", key === activeKey);
          item.classList.toggle("done", doneSet.has(key));
        }
      };

      const newSpeciesData = () => state.species.find((entry) => entry.id === savedSpeciesId) ?? null;

      const continueAfterMapDecision = () => {
        const soundAsset = inlineReviewAssets.find((entry) => entry.type === "sound");
        if (soundAsset) {
          showStep(4);
          renderInlineSoundReview(soundAsset);
          setFinishMessage("Bitte Sound anhören und entscheiden.", "info");
          return;
        }
        if (inlineReviewAssets.length) void submitInlineAssetReview();
        else void finishNewSpeciesWorkflow({ status: "completed", gitPublished: false });
      };

      const renderInlineSoundPlayback = (container) => {
        const audio = container.querySelector("audio");
        const marker = container.querySelector(".asset-review-progress-marker");
        const spectrogram = container.querySelector(".new-species-review-spectrogram");
        if (!audio || !marker || !spectrogram) return;
        const updateMarker = () => {
          const progress = audio.duration > 0 ? audio.currentTime / audio.duration : 0;
          marker.style.left = `${Math.min(1, Math.max(0, progress)) * 100}%`;
        };
        audio.addEventListener("timeupdate", updateMarker);
        audio.addEventListener("loadedmetadata", updateMarker);
        audio.addEventListener("seeked", updateMarker);
        spectrogram.addEventListener("click", (event) => {
          if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
          const rect = spectrogram.getBoundingClientRect();
          const progress = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
          audio.currentTime = progress * audio.duration;
          marker.style.left = `${progress * 100}%`;
          audio.play().catch(() => {});
        });
      };

      const cacheBustedUrl = (url, key) => {
        if (!url) return "";
        const separator = url.includes("?") ? "&" : "?";
        return `${url}${separator}inline=${encodeURIComponent(key)}`;
      };

      const stopInlineReviewAudio = () => {
        releaseMediaWithin(soundReview);
      };

      const setInlineMapMessage = (text = "", type = "") => {
        const mapMessage = mapReview.querySelector(".new-species-map-message");
        if (!mapMessage) return;
        mapMessage.textContent = text;
        mapMessage.className = `edit-message new-species-map-message${type ? ` ${type}` : ""}`;
        mapMessage.hidden = !text;
      };

      const renderInlineMapReview = (asset) => {
        mapReview.hidden = false;
        mapReview.innerHTML = `
          <h5>Karte prüfen</h5>
          <p>${escapeHtml(asset.germanName)} · ${escapeHtml(asset.scientificName)}</p>
          <div class="new-species-review-media">
            <button
              class="new-species-map-zoom-trigger"
              type="button"
              data-new-species-map-zoom
              data-map-url="${escapeHtml(asset.url)}"
              data-map-alt="${escapeHtml(`Neue Karte ${asset.germanName}`)}"
              aria-label="Neue Karte ${escapeHtml(asset.germanName)} vergrößern"
            >
              <img src="${escapeHtml(asset.url)}" alt="${escapeHtml(`Neue Karte ${asset.germanName}`)}">
              <span class="asset-review-zoom-hint">Vergrößern</span>
            </button>
          </div>
          <div class="new-species-review-actions">
            <button type="button" data-new-species-map-decision="reject">Überspringen / später manuell einfügen</button>
            <button type="button" data-new-species-map-action="manual">Manuell per URL einfügen</button>
            <button class="primary" type="button" data-new-species-map-decision="automatic">Karte übernehmen</button>
          </div>
        `;
      };

      const renderInlineManualMapReview = (messageText = "Keine automatisch speicherbare Karte gefunden.") => {
        inlineManualMapPreviewToken = "";
        const species = newSpeciesData();
        const browserMapUrl = iucnDistributionMapUrl(species);
        mapReview.hidden = false;
        mapReview.innerHTML = `
          <h5>Karte manuell einfügen</h5>
          <p>${escapeHtml(messageText)} Du kannst den sichtbaren Backblaze-JPEG-Link aus dem Browser hier einfügen.</p>
          <div class="new-species-manual-map">
            ${browserMapUrl ? `
              <a
                class="map-browser-link"
                href="${escapeHtml(browserMapUrl)}"
                target="_blank"
                rel="noopener noreferrer"
              >IUCN-Karte im Browser öffnen</a>
            ` : ""}
            <label>
              Quellen-URL
              <input class="new-species-map-source-input" type="url" placeholder="https://...jpg">
            </label>
            <label>
              Pflegegrund
              <textarea class="new-species-map-reason-input">Manuell aus dem IUCN-Kartenlink übernommen, weil der lokale automatische Abruf keinen direkt speicherbaren Kartenlink erhalten hat.</textarea>
            </label>
            <p class="edit-message new-species-map-message" hidden></p>
            <section class="new-species-manual-map-preview" hidden>
              <div class="new-species-review-media">
                <button
                  class="new-species-map-zoom-trigger"
                  type="button"
                  data-new-species-map-zoom
                  data-map-url=""
                  data-map-alt="${escapeHtml(`Neue Karte ${savedSpeciesName || "Neue Art"}`)}"
                  aria-label="Neue Karte vergrößern"
                >
                  <img alt="${escapeHtml(`Neue Karte ${savedSpeciesName || "Neue Art"}`)}">
                  <span class="asset-review-zoom-hint">Vergrößern</span>
                </button>
              </div>
              <p class="new-species-map-preview-meta"></p>
            </section>
          </div>
          <div class="new-species-review-actions">
            <button type="button" data-new-species-map-action="skip">Karte überspringen</button>
            <button type="button" data-new-species-map-action="preview">Karte prüfen</button>
            <button class="primary" type="button" data-new-species-map-action="save" disabled>Manuelle Karte übernehmen</button>
          </div>
        `;
        setInlineMapMessage("Bitte Quellen-URL einfügen und „Karte prüfen“ wählen.", "info");
      };

      const previewInlineManualMap = async () => {
        inlineManualMapPreviewToken = "";
        const sourceInput = mapReview.querySelector(".new-species-map-source-input");
        const reasonInput = mapReview.querySelector(".new-species-map-reason-input");
        const previewSection = mapReview.querySelector(".new-species-manual-map-preview");
        const previewImage = previewSection?.querySelector("img");
        const previewTrigger = previewSection?.querySelector("[data-new-species-map-zoom]");
        const previewMeta = mapReview.querySelector(".new-species-map-preview-meta");
        const saveMapButton = mapReview.querySelector('[data-new-species-map-action="save"]');
        if (!sourceInput || !reasonInput || !previewSection || !previewImage || !previewMeta || !saveMapButton) return;
        const source = sourceInput.value.trim();
        if (!source) {
          setInlineMapMessage("Bitte zuerst den direkten Karten-JPEG-Link einfügen.", "error");
          return;
        }
        setPipelineBusy(true);
        setInlineMapMessage("Kartenlink wird geprüft…", "info");
        try {
          const result = await fetchJson(
            `/api/species/${encodeURIComponent(savedSpeciesId)}/assets/map/preview`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                originalName: "",
                imageBase64: "",
                reason: reasonInput.value,
                source,
                pipelineRunId: inlineRunId,
              }),
            },
          );
          inlineManualMapPreviewToken = result.token;
          previewImage.src = result.newMap.url;
          if (previewTrigger) previewTrigger.dataset.mapUrl = result.newMap.url;
          if (typeof previewImage.decode === "function") await previewImage.decode();
          previewMeta.textContent = `${result.newMap.dimensions.width} × ${result.newMap.dimensions.height} px · ${formatBytes(result.newMap.bytes)}`;
          previewSection.hidden = false;
          saveMapButton.disabled = false;
          setInlineMapMessage("Karte geprüft. Bitte vollständige Darstellung kontrollieren und dann übernehmen oder überspringen.", "success");
        } catch (error) {
          previewSection.hidden = true;
          saveMapButton.disabled = true;
          setInlineMapMessage([error.message, ...(error.details || [])].join(" · "), "error");
        } finally {
          setPipelineBusy(false);
        }
      };

      const saveInlineManualMap = async () => {
        if (!inlineManualMapPreviewToken) {
          setInlineMapMessage("Bitte zuerst die Karte prüfen.", "error");
          return;
        }
        setPipelineBusy(true);
        setInlineMapMessage("Manuelle Karte wird übernommen…", "info");
        try {
          await fetchJson(
            `/api/species/${encodeURIComponent(savedSpeciesId)}/assets/map/save`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token: inlineManualMapPreviewToken,
                pipelineRunId: inlineRunId,
              }),
            },
          );
          const mapAsset = inlineReviewAssets.find((entry) => entry.type === "map");
          if (mapAsset) inlineReviewChoices.set(`${mapAsset.safeName}:map`, "manual");
          inlineManualMapHandled = true;
          inlineManualMapPreviewToken = "";
          await loadData({ reload: true });
          mapReview.hidden = true;
          mapReview.innerHTML = "";
          continueAfterMapDecision();
        } catch (error) {
          setInlineMapMessage([error.message, ...(error.details || [])].join(" · "), "error");
        } finally {
          setPipelineBusy(false);
        }
      };

      const renderInlineSoundReview = (asset) => {
        stopInlineReviewAudio();
        const reviewKey = `${inlineRunId || "inline"}-${asset.safeName || "sound"}-${Date.now()}`;
        const audioUrl = cacheBustedUrl(asset.url, reviewKey);
        const spectrogramUrl = cacheBustedUrl(asset.spectrogramUrl, reviewKey);
        const licenseInfo = soundLicenseInfo({ isNc: asset.isNc, license: asset.license });
        const sourceLabel = asset.sourceLabel ? ` · ${asset.sourceLabel}` : "";
        soundReview.hidden = false;
        soundReview.innerHTML = `
          <h5 class="new-species-review-title">
            <span>Sound prüfen</span>
            ${soundLicenseBadgeHtml(licenseInfo)}
          </h5>
          <p>${escapeHtml(asset.germanName)} · ${escapeHtml(asset.scientificName)}${escapeHtml(sourceLabel)}</p>
          ${spectrogramUrl ? `
            <button class="new-species-review-spectrogram" type="button">
              <img src="${escapeHtml(spectrogramUrl)}" alt="${escapeHtml(`Spektrogramm ${asset.germanName}`)}">
              <span class="asset-review-progress-marker"></span>
            </button>
          ` : `<p>Spektrogramm ist für diese Vorschau noch nicht vorhanden.</p>`}
          <audio controls preload="metadata" src="${escapeHtml(audioUrl)}"></audio>
          <div class="new-species-review-actions">
            <button type="button" data-new-species-sound-decision="manual">Überspringen / später manuell einfügen</button>
            <button class="danger" type="button" data-new-species-sound-decision="reject">Gefundenen Sound ablehnen und weiter suchen</button>
            <button class="primary" type="button" data-new-species-sound-decision="automatic">Sound übernehmen</button>
          </div>
        `;
        renderInlineSoundPlayback(soundReview);
      };

      const updateButtons = () => {
        previewButton.hidden = currentStep !== 1;
        backButton.hidden = currentStep === 1 || currentStep >= 3 || completed;
        nextButton.hidden = currentStep >= 3 || completed;
        saveButton.hidden = !completed;
        previewButton.disabled = busy || pipelineBusy;
        backButton.disabled = busy || pipelineBusy;
        nextButton.disabled = busy || pipelineBusy || (currentStep === 1 ? !previewToken : !canAdvanceFromPortrait());
        saveButton.disabled = busy || pipelineBusy;
        portraitPromptButton.disabled = busy || pipelineBusy || !previewToken;
        portraitCopyButton.disabled = busy || pipelineBusy || !portraitPromptText;
        portraitPreviewButton.disabled = busy || pipelineBusy || !previewToken;
        portraitSkipButton.disabled = busy || pipelineBusy || !previewToken;
        openButton.disabled = busy || pipelineBusy;
        for (const button of closeButtons) button.disabled = busy || pipelineBusy || state.newSpeciesPipelineActive;
      };

      const showStep = (step) => {
        currentStep = step;
        maxStepReached = Math.max(maxStepReached, step);
        for (const section of steps) {
          const active = Number(section.dataset.newSpeciesStep) === step;
          section.hidden = !active;
          section.classList.toggle("active", active);
        }
        for (const indicator of stepIndicators) {
          const indicatorStep = Number(indicator.dataset.newSpeciesStepIndicator);
          const active = indicatorStep === step;
          indicator.classList.toggle("active", active);
          indicator.classList.toggle("done", indicatorStep < step);
          indicator.classList.toggle("reachable", indicatorStep <= maxStepReached && !active);
        }
        updateFinalPortraitState();
        updateButtons();
      };

      const resetPortraitPrompt = () => {
        portraitPromptText = "";
        portraitPrompt.textContent = "";
        portraitPromptDetails.hidden = true;
        portraitCopyButton.disabled = true;
      };

      const resetPortraitPreview = () => {
        portraitPreviewToken = "";
        portraitSkipped = false;
        portraitPreview.hidden = true;
        portraitPreviewImage.removeAttribute("src");
        portraitPreviewMeta.textContent = "";
        updateFinalPortraitState();
        updateButtons();
      };

      const resetAll = () => {
        stopInlinePipelinePolling();
        previewToken = "";
        portraitPromptText = "";
        portraitPreviewToken = "";
        portraitSkipped = false;
        busy = false;
        pipelineBusy = false;
        completed = false;
        savedSpeciesId = "";
        savedSpeciesName = "";
        inlineRunId = "";
        inlineReviewAssets = [];
        inlineReviewChoices = new Map();
        inlineManualMapPreviewToken = "";
        inlineManualMapHandled = false;
        state.holdNewSpeciesBackground = false;
        state.newSpeciesPipelineActive = false;
        maxStepReached = 1;
        preview.hidden = true;
        jsonPreview.textContent = "";
        for (const field of derivedFields) field.textContent = "";
        mapReview.hidden = true;
        mapReview.innerHTML = "";
        stopInlineReviewAudio();
        soundReview.hidden = true;
        soundReview.innerHTML = "";
        doneSection.hidden = true;
        setPipelineStepState();
        resetPortraitPrompt();
        resetPortraitPreview();
        setMessage("Bitte Eingaben ausfüllen und auf „Eingaben prüfen“ klicken.", "info");
        setPortraitMessage();
        setPipelineMessage();
        setFinishMessage();
        clearFieldErrors();
        updateMeasurementMode("size");
        updateMeasurementMode("weight");
        showStep(1);
      };

      const setBusy = (value) => {
        busy = value;
        updateButtons();
      };

      const setPipelineBusy = (value) => {
        pipelineBusy = value;
        updateButtons();
      };

      const finishNewSpeciesWorkflow = async (status) => {
        stopInlinePipelinePolling();
        setPipelineBusy(false);
        state.holdNewSpeciesBackground = false;
        state.newSpeciesPipelineActive = false;
        state.pipelineWasRunning = false;
        if (status?.status === "completed" && status.gitPublished) state.notice = "";
        await loadData({ reload: true });
        const createdSpecies = newSpeciesData();
        const soundOutcome = soundSearchOutcome(status?.log, {
          hasCurrentSound: createdSpecies?.assets?.sound?.exists === true,
        });
        completed = true;
        setPipelineStepState("", ["save", "data", "sound", "spectrogram"]);
        setPipelineMessage(soundOutcome.noAlternative ? soundOutcome.message : "", soundOutcome.messageType);
        setFinishMessage(`✓ Neue Art: ${savedSpeciesName || "Neue Art"} ist erfolgreich angelegt.`, "success");
        doneSection.hidden = false;
        showStep(4);
      };

      const submitInlineAssetReview = async () => {
        const choices = inlineReviewAssets.map((asset) => {
          const decision = inlineReviewChoices.get(`${asset.safeName}:${asset.type}`);
          return {
            safeName: asset.safeName,
            type: asset.type,
            decision,
            manual: decision === "manual",
          };
        });
        if (choices.some((choice) => !choice.decision)) {
          setFinishMessage("Bitte zuerst Karte und Sound bewerten.", "error");
          return;
        }
        setPipelineBusy(true);
        const rejectedSound = choices.some((choice) => choice.type === "sound" && choice.decision === "reject");
        setPipelineMessage(
          rejectedSound
            ? "Sound wurde abgelehnt. Neuer Sound wird gesucht …"
            : `Neue Art: ${savedSpeciesName || "Neue Art"} wird angelegt …`,
          "info",
        );
        setFinishMessage(
          rejectedSound
            ? "Neuer Sound wird gesucht …"
            : `Neue Art: ${savedSpeciesName || "Neue Art"} wird angelegt …`,
          "info",
        );
        try {
          await fetchJson("/api/pipeline/assets/review", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runId: inlineRunId, choices }),
          });
          inlineReviewAssets = [];
          inlineReviewChoices = new Map();
          mapReview.hidden = true;
          mapReview.innerHTML = "";
          stopInlineReviewAudio();
          soundReview.hidden = true;
          soundReview.innerHTML = "";
          void pollInlinePipelineStatus();
        } catch (error) {
          setPipelineBusy(false);
          state.newSpeciesPipelineActive = false;
          setFinishMessage([error.message, ...(error.details || [])].join(" · "), "error");
        }
      };

      const handleInlineReviewStatus = async (status) => {
        setPipelineBusy(false);
        inlineRunId = status.runId;
        await loadData({ reload: true });
        if (inlineReviewAssets !== status.reviewAssets) {
          inlineReviewAssets = status.reviewAssets || [];
          inlineReviewChoices = new Map();
        }
        const mapAsset = inlineReviewAssets.find((asset) => asset.type === "map");
        const soundAsset = inlineReviewAssets.find((asset) => asset.type === "sound");
        setPipelineStepState("", ["save", "data", "sound", "spectrogram"]);
        setPipelineMessage("Suchlauf abgeschlossen. Bitte die gefundenen Assets prüfen.", "success");
        if (mapAsset && !inlineReviewChoices.has(`${mapAsset.safeName}:map`)) {
          showStep(3);
          renderInlineMapReview(mapAsset);
          return;
        }
        if (!mapAsset && !inlineManualMapHandled) {
          showStep(3);
          renderInlineManualMapReview("Es wurde keine automatisch speicherbare Karte gefunden.");
          return;
        }
        mapReview.hidden = true;
        if (soundAsset && !inlineReviewChoices.has(`${soundAsset.safeName}:sound`)) {
          showStep(4);
          renderInlineSoundReview(soundAsset);
          setFinishMessage("Bitte Sound anhören und entscheiden.", "info");
          return;
        }
        void submitInlineAssetReview();
      };

      async function pollInlinePipelineStatus() {
        stopInlinePipelinePolling();
        try {
          const status = await fetchJson("/api/pipeline/status");
          state.pipelineStatusSnapshot = status;
          state.renderPersistentPipelineStatus?.(status);
        if (status.status === "running") {
          setPipelineBusy(true);
          const phase = status.phase || "Suchlauf läuft";
          setPipelineMessage(`${phase} · bitte warten.`, "info");
          if (/Weitere Soundquelle|Sound/i.test(phase)) setFinishMessage("Neuer Sound wird gesucht …", "info");
          if (/Spektrogramm/i.test(phase)) setPipelineStepState("spectrogram", ["save", "data", "sound"]);
            else if (/Sound|Datenpipeline/i.test(phase)) setPipelineStepState("sound", ["save", "data"]);
            else setPipelineStepState("data", ["save"]);
            inlinePipelinePollTimer = setTimeout(pollInlinePipelineStatus, 1000);
            return;
          }
          if (status.status === "awaiting-review") {
            await handleInlineReviewStatus(status);
            return;
          }
          if (status.status === "completed") {
            await loadData({ reload: true });
            const createdSpecies = newSpeciesData();
            if (createdSpecies && !createdSpecies.assets?.map?.exists && !inlineManualMapHandled) {
              setPipelineBusy(false);
              state.newSpeciesPipelineActive = false;
              state.pipelineWasRunning = false;
              setPipelineStepState("", ["save", "data", "sound", "spectrogram"]);
              setPipelineMessage("Suchlauf abgeschlossen. Es wurde keine automatisch speicherbare Karte gefunden.", "info");
              showStep(3);
              renderInlineManualMapReview("Es wurde keine automatisch speicherbare Karte gefunden.");
              return;
            }
            await finishNewSpeciesWorkflow(status);
            return;
          }
          if (status.status === "failed") {
            setPipelineBusy(false);
            state.newSpeciesPipelineActive = false;
            setPipelineMessage(status.error || "Suchlauf ist fehlgeschlagen.", "error");
            return;
          }
          inlinePipelinePollTimer = setTimeout(pollInlinePipelineStatus, 1000);
        } catch (error) {
          setPipelineBusy(false);
          state.newSpeciesPipelineActive = false;
          setPipelineMessage(error.message, "error");
        }
      }

      const saveAndStartPipeline = async () => {
        if (!previewToken || pipelineBusy) return;
        showStep(3);
        state.newSpeciesPipelineActive = true;
        setPipelineBusy(true);
        setPipelineStepState("save");
        setPipelineMessage(`Neue Art: ${speciesValues().german || "Neue Art"} wird angelegt …`, "info");
        try {
          const result = await fetchJson("/api/species/new/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: previewToken }),
          });
          savedSpeciesId = result.species?.id || result.derived.slug;
          savedSpeciesName = result.entry.german;
          state.selectedId = savedSpeciesId;
          elements.search.value = "";
          elements.statusFilter.value = "";
          elements.flagFilter.value = "";

          if (portraitPreviewToken) {
            setPipelineMessage("Artportrait wird lokal übernommen…", "info");
            try {
              await fetchJson(
                `/api/species/${encodeURIComponent(savedSpeciesId)}/assets/portrait/save`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ token: portraitPreviewToken, publish: false }),
                },
              );
            } catch (portraitError) {
              setPipelineMessage(
                `Art wurde angelegt, aber das Portrait konnte nicht übernommen werden: ${portraitError.message}`,
                "error",
              );
            }
          }

          setPipelineStepState("data", ["save"]);
          setPipelineMessage("Suchlauf für Karte, Sound und Spektrogramm startet…", "info");
          await loadData({ reload: true });
          const previewResult = await fetchJson("/api/pipeline/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "missing", targetSlugs: [savedSpeciesId] }),
          });
          if (!previewResult.tokensAvailable) {
            throw new Error("Die benötigten API-Tokens fehlen in der Server-Umgebung.");
          }
          if (!previewResult.hasWork) {
            await finishNewSpeciesWorkflow({ status: "completed", gitPublished: false });
            return;
          }
          const startedStatus = await fetchJson("/api/pipeline/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: previewResult.token }),
          });
          state.pipelineStatusSnapshot = startedStatus;
          state.pipelineWasRunning = true;
          setPipelineStepState("data", ["save"]);
          setPipelineMessage("Suchlauf läuft. Karte, Sound und Spektrogramm werden vorbereitet…", "info");
          void pollInlinePipelineStatus();
        } catch (error) {
          setPipelineBusy(false);
          state.newSpeciesPipelineActive = false;
          setPipelineMessage([error.message, ...(error.details || [])].join(" · "), "error");
        }
      };

      const dialogController = createDialogController({
        dialog,
        closeButtons,
        beforeClose: () => {
          if (busy || pipelineBusy || state.newSpeciesPipelineActive) return false;
          form.reset();
          state.holdNewSpeciesBackground = false;
          resetAll();
          return true;
        },
      });
      const close = () => dialogController.close("programmatic");

      openButton.addEventListener("click", () => {
        form.reset();
        resetAll();
        state.holdNewSpeciesBackground = true;
        dialogController.open();
        form.elements.german.focus();
      });

      form.elements.sizeSexed?.addEventListener("change", () => {
        updateMeasurementMode("size");
        markSpeciesInputsChanged();
      });
      form.elements.weightSexed?.addEventListener("change", () => {
        updateMeasurementMode("weight");
        markSpeciesInputsChanged();
      });

      form.addEventListener("change", (event) => {
        if (event.target.closest(".new-species-map-review") || event.target.closest(".new-species-sound-review")) return;
        if (!event.target.matches(".new-species-value-unit select")) return;
        markSpeciesInputsChanged();
      });

      form.addEventListener("input", (event) => {
        if (event.target.closest(".new-species-map-review")) {
          inlineManualMapPreviewToken = "";
          const saveMapButton = mapReview.querySelector('[data-new-species-map-action="save"]');
          const previewSection = mapReview.querySelector(".new-species-manual-map-preview");
          if (saveMapButton) saveMapButton.disabled = true;
          if (previewSection) previewSection.hidden = true;
          setInlineMapMessage("Kartenangaben geändert. Bitte erneut „Karte prüfen“ wählen.", "info");
          return;
        }
        if (event.target.closest(".new-species-sound-review")) return;
        if (event.target.closest(".new-species-portrait")) {
          if (event.target === portraitInstructions) resetPortraitPrompt();
          resetPortraitPreview();
          setPortraitMessage("Portraitangaben geändert. Bitte Bildprüfung bei Bedarf erneut ausführen.", "info");
          return;
        }
        markSpeciesInputsChanged();
      });

      portraitFileInput.addEventListener("change", () => {
        resetPortraitPreview();
        if (portraitFileInput.files?.[0]) {
          setPortraitMessage("Bild ausgewählt. Bitte mit „Bild prüfen“ validieren.", "info");
        } else {
          setPortraitMessage();
        }
      });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (currentStep !== 1) return;
        const localErrors = localFieldErrors();
        if (Object.keys(localErrors).length) {
          applyFieldErrors(localErrors);
          setMessage(Object.values(localErrors).flat().join(" · "), "error");
          return;
        }
        clearFieldErrors();
        resetPortraitPrompt();
        resetPortraitPreview();
        setBusy(true);
        setMessage("Neue Art und mögliche Kollisionen werden geprüft…", "info");
        try {
          const result = await fetchJson("/api/species/new/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ values: speciesValues() }),
          });
          previewToken = result.token;
          maxStepReached = Math.max(maxStepReached, 2);
          for (const field of derivedFields) {
            field.textContent = result.derived[field.dataset.derived] ?? "";
          }
          jsonPreview.textContent = JSON.stringify(result.entry, null, 2);
          preview.hidden = false;
          setMessage("Eingaben sind geprüft. Der nächste Schritt ist jetzt verfügbar.", "success");
          showStep(1);
        } catch (error) {
          applyFieldErrors(error.fieldErrors || {});
          setMessage([error.message, ...(error.details || [])].join(" · "), "error");
        } finally {
          setBusy(false);
        }
      });

      nextButton.addEventListener("click", () => {
        if (currentStep === 1 && previewToken) showStep(2);
        else if (currentStep === 2 && canAdvanceFromPortrait()) void saveAndStartPipeline();
      });

      backButton.addEventListener("click", () => {
        if (currentStep > 1) showStep(currentStep - 1);
      });

      for (const indicator of stepIndicators) {
        indicator.addEventListener("click", () => {
          const targetStep = Number(indicator.dataset.newSpeciesStepIndicator);
          if (!targetStep || targetStep > maxStepReached || busy || pipelineBusy) return;
          showStep(targetStep);
        });
      }

      portraitPromptButton.addEventListener("click", async () => {
        if (!previewToken) return;
        resetPortraitPrompt();
        resetPortraitPreview();
        setBusy(true);
        setPortraitMessage("Portrait-Prompt wird aus den geprüften Artdaten erstellt…", "info");
        try {
          const result = await fetchJson("/api/species/new/portrait-prompt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              values: speciesValues(),
              additionalInstructions: portraitInstructions.value || "",
            }),
          });
          portraitPromptText = result.prompt;
          portraitPrompt.textContent = result.prompt;
          portraitPromptDetails.hidden = false;
          portraitCopyButton.disabled = false;
          setPortraitMessage(
            `Prompt erstellt. In ChatGPT genau ein Bild erzeugen und anschließend als ${result.fileName} auswählen.`,
            "success",
          );
        } catch (error) {
          applyFieldErrors(error.fieldErrors || {});
          setPortraitMessage([error.message, ...(error.details || [])].join(" · "), "error");
        } finally {
          setBusy(false);
        }
      });

      portraitCopyButton.addEventListener("click", async () => {
        if (!portraitPromptText) return;
        try {
          await navigator.clipboard.writeText(portraitPromptText);
          setPortraitMessage("Prompt wurde in die Zwischenablage kopiert.", "success");
        } catch {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(portraitPrompt);
          selection.removeAllRanges();
          selection.addRange(range);
          setPortraitMessage(
            "Automatisches Kopieren war nicht möglich. Der Prompt wurde markiert; bitte Strg+C drücken.",
            "info",
          );
        }
      });

      portraitPreviewButton.addEventListener("click", async () => {
        if (!previewToken) return;
        resetPortraitPreview();
        const file = portraitFileInput.files?.[0];
        if (!file) {
          setPortraitMessage("Bitte ein in ChatGPT erzeugtes PNG-, JPEG- oder WebP-Bild auswählen.", "error");
          return;
        }
        if (file.size > 20 * 1024 * 1024) {
          setPortraitMessage("Bilddatei darf maximal 20 MB groß sein.", "error");
          return;
        }
        setBusy(true);
        setPortraitMessage("Bilddatei wird geprüft und in das Produktformat umgewandelt…", "info");
        try {
          const imageBase64 = await fileToBase64(file);
          const result = await fetchJson("/api/species/new/portrait-preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: previewToken,
              originalName: file.name,
              imageBase64,
              additionalInstructions: portraitInstructions.value || "",
            }),
          });
          portraitPreviewToken = result.token;
          portraitSkipped = false;
          portraitPreviewImage.src = result.newPortrait.url;
          if (typeof portraitPreviewImage.decode === "function") await portraitPreviewImage.decode();
          portraitPreviewMeta.textContent =
            `${result.newPortrait.size} · ${formatBytes(result.newPortrait.bytes)}`
            + ` · Quelle ${result.newPortrait.originalDimensions.width} × ${result.newPortrait.originalDimensions.height} px`;
          portraitPromptText = result.newPortrait.prompt;
          portraitPrompt.textContent = result.newPortrait.prompt;
          portraitPromptDetails.hidden = false;
          portraitCopyButton.disabled = false;
          portraitPreview.hidden = false;
          setPortraitMessage(
            "Vorschau erstellt. Bitte Artmerkmale, Anatomie und vollständige Bildränder prüfen.",
            "success",
          );
        } catch (error) {
          resetPortraitPreview();
          setPortraitMessage([error.message, ...(error.details || [])].join(" · "), "error");
        } finally {
          setBusy(false);
        }
      });

      portraitSkipButton.addEventListener("click", () => {
        resetPortraitPreview();
        portraitSkipped = true;
        setPortraitMessage(
          "Artportrait wird für diese neue Art übersprungen. Mit „Nächster Schritt“ wird die Art angelegt.",
          "info",
        );
        updateFinalPortraitState();
        updateButtons();
      });

      mapReview.addEventListener("click", (event) => {
        const zoomButton = event.target.closest("[data-new-species-map-zoom]");
        if (zoomButton) {
          openSharedMapLightbox(
            zoomButton.dataset.mapUrl,
            zoomButton.dataset.mapAlt || "Neue Karte",
          );
          return;
        }
        const actionButton = event.target.closest("[data-new-species-map-action]");
        if (actionButton) {
          const action = actionButton.dataset.newSpeciesMapAction;
          if (action === "manual") {
            renderInlineManualMapReview("Automatische Karte wird nicht übernommen.");
          } else if (action === "preview") {
            void previewInlineManualMap();
          } else if (action === "save") {
            void saveInlineManualMap();
          } else if (action === "skip") {
            const mapAsset = inlineReviewAssets.find((entry) => entry.type === "map");
            if (mapAsset) inlineReviewChoices.set(`${mapAsset.safeName}:map`, "reject");
            inlineManualMapHandled = true;
            inlineManualMapPreviewToken = "";
            mapReview.hidden = true;
            mapReview.innerHTML = "";
            continueAfterMapDecision();
          }
          return;
        }
        const button = event.target.closest("[data-new-species-map-decision]");
        if (!button) return;
        const asset = inlineReviewAssets.find((entry) => entry.type === "map");
        if (!asset) return;
        inlineReviewChoices.set(`${asset.safeName}:map`, button.dataset.newSpeciesMapDecision);
        inlineManualMapHandled = true;
        mapReview.hidden = true;
        continueAfterMapDecision();
      });

      soundReview.addEventListener("click", (event) => {
        const button = event.target.closest("[data-new-species-sound-decision]");
        if (!button) return;
        const asset = inlineReviewAssets.find((entry) => entry.type === "sound");
        if (!asset) return;
        inlineReviewChoices.set(`${asset.safeName}:sound`, button.dataset.newSpeciesSoundDecision);
        stopInlineReviewAudio();
        void submitInlineAssetReview();
      });

      saveButton.addEventListener("click", () => {
        close();
      });
    }

    return Object.freeze({
      setupNewSpeciesCreator,
    });
  }

  global.SpeciesExplorerNewSpeciesWorkflow = Object.freeze({
    createNewSpeciesWorkflowController,
  });
})(globalThis);
