(function initializeSpeciesExplorerNewSpeciesWorkflow(global) {
  "use strict";

  function createNewSpeciesWorkflowController(dependencies = {}) {
    const {
      state,
      elements,
      createMessageSetter,
      createFieldFeedbackController,
      createNewSpeciesFormModel,
      createTaxonomyReferenceController,
      composeManualSexedMeasurement,
      formatManualMeasurement,
      stripManualMeasureInput,
      parseManualMeasurement,
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
      const abortButton = dialog.querySelector(".new-species-abort-button");
      const jsonPreview = dialog.querySelector(".new-species-json");
      const derivedFields = [...dialog.querySelectorAll("[data-derived]")];
      const portraitInstructions = dialog.querySelector(".new-species-portrait-instructions");
      const portraitOptionsHost = dialog.querySelector(".new-species-portrait-options-host");
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
      const resetSoundsButton = dialog.querySelector(".new-species-reset-sounds-button");

      let currentStep = 1;
      let previewToken = "";
      let portraitPromptText = "";
      let portraitPreviewToken = "";
      let portraitSkipped = false;
      let busy = false;
      let checkingAvailability = false;
      let pipelineBusy = false;
      let completed = false;
      let savedSpeciesId = "";
      let savedSpeciesName = "";
      let inlineRunId = "";
      let inlineReviewAssets = [];
      let inlineReviewChoices = new Map();
      let inlineManualMapPreviewToken = "";
      let inlineManualMapFile = null;
      let inlineManualMapHandled = false;
      let inlinePipelinePollTimer = null;
      let maxStepReached = 1;
      let namePreferencePreparing = false;
      let creationId = "";
      let abortPending = false;
      let abortAvailable = false;
      let abortRetryTimer = null;
      let dialogGeneration = 0;
      const isCurrentDialog = (generation) => generation === dialogGeneration;
      let creationWorkspace = "local", sharedScope = "", sharedEpoch = 0, sharedSignature = "", sharedCandidate = null, sharedAttempted = false;
      let sharedControlValues = [];
      const pendingSharedCreations = new Map();
      const pendingSharedNotice = "Die letzte gemeinsame Artanlage ist noch nicht bestätigt. Über „Neue Art“ kann die Serverprüfung wieder geöffnet werden.";
      const introduction = dialog.querySelector(".new-species-introduction"), previewWarning = preview.querySelector(".edit-warning");
      const jsonLabel = dialog.querySelector(".new-species-json-label");
      const sharedFields = dialog.querySelector(".new-species-fields");
      const sameSharedSource = () => creationWorkspace === "shared-project" && state.workspace === "shared-project"
        && (state.workspaceEpoch || 0) === sharedEpoch && state.workspaceStatus?.sourceScope === sharedScope;
      const sharedAllowed = (recovery = false) => sameSharedSource() && state.editMode === true && !state.dataLoading
        && state.workspaceStatus?.available !== false && state.workspaceStatus?.permissions?.canRead === true
        && state.workspaceStatus?.permissions?.canEdit === true && (recovery || state.workspaceStatus?.connection === "online"
          && state.workspaceStatus?.permissions?.canCreate === true);
      const currentInputSignature = () => JSON.stringify([speciesValues(), selectedTaxonomyMasterId(), selectedTaxonomyReference()]);
      const rememberSharedAttempt = () => {
        if (!sharedAttempted || !previewToken || !sharedCandidate) return;
        pendingSharedCreations.set(sharedScope, { token: previewToken, candidate: { ...sharedCandidate }, signature: sharedSignature, controls: sharedControlValues });
      };

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
      } = createFieldFeedbackController({ form, documentRef: document, validateFields: () => localFieldErrors() });

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

      const discardDraft = () => {
        if (!previewToken || savedSpeciesId) return;
        const token = previewToken;
        previewToken = "";
        if (creationWorkspace === "shared-project") return;
        void fetchJson("/api/species/new/discard", {
          method: "POST", body: JSON.stringify({ token }),
        }).catch(() => {});
      };

      const markSpeciesInputsChanged = () => {
        if (savedSpeciesId) {
          setMessage("Diese Art ist bereits gespeichert. Namen und Grunddaten können in der normalen Artbearbeitung korrigiert werden.", "info");
          updateButtons(); return;
        }
        if (creationWorkspace === "shared-project" && (sharedAttempted || completed)) {
          setMessage("Bitte den offenen Serverstand zuerst prüfen oder das Fenster schließen. Es wird keine zweite Anlage gesendet.", "info");
          updateButtons(); return;
        }
        discardDraft();
        previewToken = "";
        maxStepReached = 1;
        preview.hidden = true;
        resetPortraitPrompt();
        resetPortraitPreview();
        if (currentStep !== 1) showStep(1);
        setMessage("Eingaben geändert. Bitte erneut prüfen.", "info");
        updateButtons();
      };

      const taxonomyReference = createTaxonomyReferenceController({
        root: dialog,
        form,
        fetchJson,
        escapeHtml,
        onNamesChanged: markSpeciesInputsChanged,
      });

      const selectedTaxonomyMasterId = () => {
        const selection = taxonomyReference.getSelection?.();
        return selection?.masterTaxonId && selection.scientificName === speciesValues().scientificName ? selection.masterTaxonId : "";
      };

      const selectedTaxonomyReference = () => {
        const selection = taxonomyReference.getSelection?.();
        return selection?.taxonomyReference && selection.scientificName === speciesValues().scientificName ? selection.taxonomyReference : "";
      };

      const selectedTaxonomyClass = () => {
        const selection = taxonomyReference.getSelection?.();
        const classEntry = selection?.hierarchy?.find((entry) => entry.rank === "class");
        return classEntry?.scientificName || classEntry?.value || "";
      };

      const portraitOptions = global.SpeciesExplorerPortraitOptions
        ?.createPortraitOptionsController({
          host: portraitOptionsHost,
          className: "",
          onChange: () => {
            if (savedSpeciesId) return;
            resetPortraitPrompt();
            resetPortraitPreview();
          },
        });

      const validatedPortraitOptions = () => {
        portraitOptions?.setClassName?.(selectedTaxonomyClass());
        const validation = portraitOptions?.validate?.() || {
          valid: true,
          errors: [],
          value: {},
        };
        if (!validation.valid) {
          setPortraitMessage(validation.errors.join(" · "), "error");
          return null;
        }
        return validation.value;
      };

      const canAdvanceFromPortrait = () => portraitSkipped || Boolean(portraitPreviewToken);

      const updateFinalPortraitState = () => {
        if (!finalPortraitState) return;
        finalPortraitState.hidden = currentStep >= 3;
        if (finalPortraitState.hidden) return;
        finalPortraitState.textContent = savedSpeciesId
          ? newSpeciesData()?.assets?.portrait?.exists ? "Gespeichertes Artportrait ist vorhanden." : "Für diese Art ist noch kein Artportrait gespeichert."
          : portraitPreviewToken
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

      const restoreSavedCreation = () => {
        const species = newSpeciesData();
        if (!species) throw new Error("Die gespeicherte Art konnte nicht geladen werden. Bitte das Fenster schließen und den Projektstatus erneut prüfen.");
        const setValue = (name, value) => { if (form.elements[name]) form.elements[name].value = value ?? ""; };
        setValue("german", species.germanName);
        setValue("english", species.englishName);
        setValue("scientificName", species.scientificName);
        for (const [field, raw, units, unit, age] of [
          ["size", species.manual?.size, MANUAL_SIZE_UNITS, "cm", false],
          ["weight", species.manual?.weight, MANUAL_WEIGHT_UNITS, "g", false],
          ["lifeExpectancy", species.manual?.lifeExpectancy, MANUAL_AGE_UNITS, "Jahre", true],
        ]) {
          if (!raw) continue;
          const value = parseManualMeasurement(raw, units, unit, { age });
          setValue(field, value.value); setValue(`${field}Unit`, value.unit);
          if (form.elements[`${field}Sexed`]) form.elements[`${field}Sexed`].checked = value.sexed;
          for (const sex of ["Male", "Female"]) {
            setValue(`${field}${sex}`, value[`${sex.toLowerCase()}Value`]);
            setValue(`${field}${sex}Unit`, value[`${sex.toLowerCase()}Unit`]);
          }
        }
        updateMeasurementMode("size"); updateMeasurementMode("weight");
        setMessage("Gespeicherte Artdaten. Änderungen sind nach Abschluss in der normalen Artbearbeitung möglich.", "info");
        const portrait = species.assets?.portrait;
        if (portrait?.exists && portrait.url) {
          portraitPreviewImage.src = typeof versionedAssetUrl === "function" ? versionedAssetUrl(portrait.url, portrait) : portrait.url;
          portraitPreviewImage.alt = `Gespeichertes Artportrait ${species.germanName}`;
          portraitPreviewMeta.textContent = `Gespeichertes Artportrait${portrait.bytes ? ` · ${formatBytes(portrait.bytes)}` : ""}`;
          const caption = portraitPreview.querySelector("figcaption");
          if (caption) caption.textContent = "Gespeichertes Artportrait";
          portraitPreview.hidden = false;
          setPortraitMessage("Das Artportrait ist bereits gespeichert.", "success");
        } else setPortraitMessage("Für diese Art ist noch kein Artportrait gespeichert. Es kann in der normalen Artbearbeitung ergänzt werden.", "info");
        updateButtons();
      };

      const continueAfterMapDecision = async () => {
        const soundAsset = inlineReviewAssets.find((entry) => entry.type === "sound");
        if (soundAsset) {
          showStep(4);
          renderInlineSoundReview(soundAsset);
          setFinishMessage("Bitte Sound anhören und entscheiden.", "info");
          return;
        }
        showStep(4);
        soundReview.hidden = false;
        soundReview.innerHTML = `<p>Keine neue automatisch nutzbare Aufnahme gefunden. Eine vorhandene Aufnahme bleibt erhalten.</p>
          <button type="button" data-new-species-sound-finish>Sound-Schritt abschließen</button>`;
        setFinishMessage("Soundsuche abgeschlossen. Du kannst frühere Soundquellen erneut prüfen oder den Schritt abschließen.", "info");
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
            <button type="button" data-new-species-map-action="manual">Datei oder Kartenlink verwenden</button>
            <button class="primary" type="button" data-new-species-map-decision="automatic">Karte übernehmen</button>
          </div>
        `;
      };

      const renderInlineManualMapReview = (messageText = "Keine automatisch speicherbare Karte gefunden.") => {
        inlineManualMapPreviewToken = "";
        inlineManualMapFile = null;
        const species = newSpeciesData();
        const browserMapUrl = iucnDistributionMapUrl(species);
        mapReview.hidden = false;
        mapReview.innerHTML = `
          <h5>Gespeicherte Karte einfügen</h5>
          <p>${escapeHtml(messageText)} Speichere die Karte im Browser und wähle die JPEG-/PNG-Datei hier aus oder ziehe sie in das Dateifeld. Der Quellenlink dokumentiert die Herkunft; bei einer Datei wird er nicht heruntergeladen.</p>
          <div class="new-species-manual-map">
            ${browserMapUrl ? `
              <a
                class="map-browser-link"
                href="${escapeHtml(browserMapUrl)}"
                target="_blank"
                rel="noopener noreferrer"
              >IUCN-Karte im Browser öffnen</a>
            ` : ""}
            <label class="new-species-map-drop-zone">
              Kartendatei auswählen oder hier ablegen (JPEG/PNG, maximal 20 MB)
              <input class="new-species-map-file-input" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png">
              <span class="new-species-map-file-status"></span>
            </label>
            <label>
              Quellen-URL
              <input class="new-species-map-source-input" type="url" value="${escapeHtml(browserMapUrl || "")}" placeholder="https://...jpg">
            </label>
            <label>
              Pflegegrund
              <textarea class="new-species-map-reason-input">Als Datei übernommen, weil der automatische Abruf nicht verfügbar war.</textarea>
            </label>
            <label>
              <span>Herkunft und Pflege dieser Datei</span>
              <select class="new-species-map-care-mode-input">
                <option value="manual">Eigene/manuell bearbeitete Karte</option>
                <option value="iucn-browser">Unveränderte IUCN-Karte aus dem Browser (eigene Bestätigung)</option>
              </select>
              <small>Keine technische Herkunftsprüfung. Beide Varianten bleiben vor automatischem Ersatz geschützt.</small>
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
            <button class="primary" type="button" data-new-species-map-action="save" disabled>Karte übernehmen</button>
          </div>
        `;
        setInlineMapMessage("Kartendatei auswählen oder ablegen, dann „Karte prüfen“ wählen. Alternativ einen direkt abrufbaren Kartenlink prüfen.", "info");
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
        if (!source && !inlineManualMapFile) {
          setInlineMapMessage("Bitte eine JPEG-/PNG-Datei auswählen oder einen direkten Kartenlink einfügen.", "error");
          return;
        }
        setPipelineBusy(true);
        setInlineMapMessage(inlineManualMapFile ? "Kartendatei wird geprüft…" : "Kartenlink wird geprüft…", "info");
        try {
          const result = await fetchJson(
            `/api/species/${encodeURIComponent(savedSpeciesId)}/assets/map/preview`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                originalName: inlineManualMapFile?.name || "",
                imageBase64: inlineManualMapFile ? await fileToBase64(inlineManualMapFile) : "",
                reason: reasonInput.value,
                source,
                careMode: mapReview.querySelector(".new-species-map-care-mode-input")?.value || "manual",
                pipelineRunId: inlineRunId,
                ...(creationId ? { creationId } : {}),
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
          inlineManualMapPreviewToken = "";
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
        setInlineMapMessage("Karte wird übernommen…", "info");
        let saved = false;
        try {
          await fetchJson(
            `/api/species/${encodeURIComponent(savedSpeciesId)}/assets/map/save`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token: inlineManualMapPreviewToken,
                pipelineRunId: inlineRunId,
                ...(creationId ? { creationId } : {}),
                careMode: mapReview.querySelector(".new-species-map-care-mode-input")?.value || "manual",
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
          saved = true;
        } catch (error) {
          setInlineMapMessage([error.message, ...(error.details || [])].join(" · "), "error");
        } finally {
          setPipelineBusy(false);
        }
        if (saved) await continueAfterMapDecision();
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
        const shared = creationWorkspace === "shared-project";
        abortButton.hidden = !creationId || !abortAvailable;
        abortButton.disabled = busy || namePreferencePreparing || abortPending;
        abortButton.textContent = abortPending ? "Abbruch wird ausgeführt …" : "Artanlage abbrechen";
        previewButton.hidden = currentStep !== 1 || Boolean(savedSpeciesId);
        backButton.hidden = currentStep === 1 || currentStep >= 3 || completed;
        nextButton.hidden = currentStep >= 3 || completed;
        saveButton.hidden = !completed;
        resetSoundsButton.hidden = !savedSpeciesId || currentStep !== 4
          || (inlineReviewAssets.length > 0 && !inlineReviewAssets.some((asset) => asset.type === "sound"));
        resetSoundsButton.disabled = busy || pipelineBusy || namePreferencePreparing;
        previewButton.disabled = busy || pipelineBusy;
        backButton.disabled = busy || pipelineBusy;
        nextButton.disabled = busy || pipelineBusy || (!savedSpeciesId && (currentStep === 1 ? !previewToken : !canAdvanceFromPortrait()));
        saveButton.disabled = busy || pipelineBusy;
        portraitPromptButton.disabled = busy || pipelineBusy || !previewToken;
        portraitCopyButton.disabled = busy || pipelineBusy || !portraitPromptText;
        portraitPreviewButton.disabled = busy || pipelineBusy || !previewToken;
        portraitSkipButton.disabled = busy || pipelineBusy || !previewToken;
        portraitOptions?.setBusy?.(busy || pipelineBusy || Boolean(savedSpeciesId));
        portraitFileInput.disabled = busy || pipelineBusy || Boolean(savedSpeciesId);
        portraitInstructions.disabled = busy || pipelineBusy || Boolean(savedSpeciesId);
        openButton.disabled = busy || pipelineBusy;
        if (state.workspace === "shared-project") openButton.disabled ||= checkingAvailability || state.dataLoading || state.editMode !== true
          || state.workspaceStatus?.available === false || state.workspaceStatus?.connection !== "online" || state.workspaceStatus?.permissions?.canCreate !== true;
        if (shared) {
          previewButton.hidden = completed || sharedAttempted;
          previewButton.disabled ||= !sharedAllowed();
          nextButton.hidden = completed;
          nextButton.textContent = sharedAttempted ? "Serverstand prüfen" : "Art im gemeinsamen Projekt anlegen";
          nextButton.disabled = busy || pipelineBusy || !previewToken || !sharedAllowed(sharedAttempted);
          backButton.hidden = true; abortButton.hidden = true; resetSoundsButton.hidden = true;
          saveButton.hidden = !completed;
          if (sharedFields) sharedFields.inert = busy || sharedAttempted || completed || !sharedAllowed();
        } else {
          nextButton.textContent = "Nächster Schritt";
          if (sharedFields) sharedFields.inert = Boolean(savedSpeciesId);
        }
        for (const input of mapReview.querySelectorAll("input, textarea, select, button")) input.disabled = busy || pipelineBusy;
        const saveMap = mapReview.querySelector('[data-new-species-map-action="save"]');
        if (saveMap) saveMap.disabled = busy || pipelineBusy || !inlineManualMapPreviewToken;
        for (const button of closeButtons) {
          button.disabled = busy || pipelineBusy || namePreferencePreparing;
          if (button.textContent !== "×") {
            button.textContent = savedSpeciesId ? "Fenster schließen" : "Abbrechen";
            button.hidden = completed;
          }
        }
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
          indicator.hidden = creationWorkspace === "shared-project" && indicatorStep !== 1;
        }
        updateFinalPortraitState();
        if (step === 2) portraitOptions?.setClassName?.(selectedTaxonomyClass());
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
        const caption = portraitPreview.querySelector("figcaption");
        if (caption) caption.textContent = "Neue KI-Vorschau";
        updateFinalPortraitState();
        updateButtons();
      };

      const resetAll = () => {
        dialogGeneration += 1;
        stopInlinePipelinePolling();
        clearTimeout(abortRetryTimer);
        abortRetryTimer = null;
        creationId = "";
        abortPending = false;
        abortAvailable = false;
        previewToken = "";
        creationWorkspace = "local"; sharedScope = ""; sharedEpoch = 0; sharedSignature = ""; sharedCandidate = null; sharedAttempted = false;
        sharedControlValues = [];
        if (introduction) introduction.textContent = "Erst allgemeine Daten prüfen, danach optional ein Artportrait vorbereiten.";
        if (previewWarning) previewWarning.textContent = "Nach dem Artportrait-Schritt wird die Art lokal angelegt und der Suchlauf gestartet.";
        if (jsonLabel) jsonLabel.hidden = false;
        jsonPreview.hidden = false;
        if (sharedFields) sharedFields.inert = false;
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
        inlineManualMapFile = null;
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
        portraitOptions?.reset?.();
        taxonomyReference.reset();
        setMessage("Bitte Eingaben ausfüllen und auf „Eingaben prüfen“ klicken.", "info");
        setPortraitMessage();
        setPipelineMessage();
        setFinishMessage();
        clearFieldErrors();
        updateMeasurementMode("size");
        updateMeasurementMode("weight");
        showStep(1);
      };

      const showSharedDialog = (sourceScope, epoch, pending = null) => {
        form.reset(); resetAll(); creationWorkspace = "shared-project"; sharedScope = sourceScope; sharedEpoch = epoch;
        if (introduction) introduction.textContent = "Allgemeine Daten prüfen und anschließend als Entwurf im gemeinsamen Projekt anlegen. Fachinformationen und Artdateien folgen separat.";
        if (previewWarning) previewWarning.textContent = "Die Bestätigung legt einen gemeinsamen Entwurf an. Fachinformationen und Artdateien sind noch offen; die Website bleibt unverändert.";
        if (jsonLabel) jsonLabel.hidden = true;
        jsonPreview.hidden = true;
        if (pending) {
          previewToken = pending.token; sharedCandidate = { ...pending.candidate }; sharedSignature = pending.signature;
          sharedAttempted = true; sharedControlValues = pending.controls;
          for (const item of sharedControlValues) {
            if (item.control.isConnected === false) continue;
            item.control.value = item.value; item.control.checked = item.checked;
          }
          updateMeasurementMode("size"); updateMeasurementMode("weight");
          for (const field of derivedFields) field.textContent = ({ scientificName: sharedCandidate.scientificName, slug: sharedCandidate.id,
            assetDirectory: `${sharedCandidate.assetName} · noch keine Dateien` })[field.dataset.derived] ?? "";
          preview.hidden = false;
          setMessage("Die frühere Speicherantwort ist noch offen. „Serverstand prüfen“ vergleicht ausschließlich den vorhandenen Stand; es wird nichts angelegt.", "info");
        }
        state.holdNewSpeciesBackground = true; showStep(1); dialogController.open();
        if (!pending) { void taxonomyReference.initialize(); form.elements.german.focus(); }
        else nextButton.focus();
      };

      const setBusy = (value) => {
        busy = value;
        portraitOptions?.setBusy?.(value || pipelineBusy);
        updateButtons();
      };

      const setPipelineBusy = (value) => {
        pipelineBusy = value;
        portraitOptions?.setBusy?.(value || busy);
        updateButtons();
      };

      const showWorkflowError = (messageText) => {
        stopInlinePipelinePolling();
        state.newSpeciesPipelineActive = false;
        state.holdNewSpeciesBackground = false;
        setPipelineBusy(false);
        const text = savedSpeciesId
          ? `Die Art „${savedSpeciesName}“ ist lokal angelegt. ${messageText} Fenster schließen erhält die Anlage zum Fortsetzen.${abortAvailable ? " Artanlage abbrechen nimmt diesen unveröffentlichten Auftrag zurück." : " Die vorhandene Art kann im Explorer ergänzt werden; nicht erneut anlegen."}`
          : messageText;
        setPipelineMessage(text, "error");
        setFinishMessage(text, "error");
        setPortraitMessage(text, "error");
      };

      const finishNewSpeciesWorkflow = async (status) => {
        stopInlinePipelinePolling();
        setPipelineBusy(true);
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
        if (status?.gitPublished) abortAvailable = false;
        setPipelineStepState("", ["save", "data", "sound", "spectrogram"]);
        setPipelineMessage(soundOutcome.noAlternative ? soundOutcome.message : "", soundOutcome.messageType);
        setFinishMessage(status?.publicationPending
          ? `Die Art „${savedSpeciesName || "Neue Art"}“ ist lokal angelegt. Übertragung noch offen: ${status.publicationPending}`
          : `✓ Neue Art: ${savedSpeciesName || "Neue Art"} ist erfolgreich angelegt.`, status?.publicationPending ? "info" : "success");
        doneSection.hidden = false;
        setPipelineBusy(false);
        showStep(4);
      };

      const submitInlineAssetReview = async ({ resetSoundRejections = false, retrySoundSearch = false } = {}) => {
        const choices = inlineReviewAssets.map((asset) => {
          const decision = inlineReviewChoices.get(`${asset.safeName}:${asset.type}`);
          return {
            safeName: asset.safeName,
            type: asset.type,
            decision,
            manual: decision === "manual",
            ...(resetSoundRejections && asset.type === "sound" && decision === "reject"
              ? { resetSoundRejections: true, reviewUrl: asset.url } : {}),
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
            body: JSON.stringify({ runId: inlineRunId, choices, ...(retrySoundSearch ? { retrySoundSearch: true, confirmed: true } : {}) }),
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
          showWorkflowError([error.message, ...(error.details || [])].join(" · "));
        }
      };

      const handleInlineReviewStatus = async (status, generation = dialogGeneration) => {
        if (!isCurrentDialog(generation)) return;
        inlineRunId = status.runId;
        await loadData({ reload: true });
        if (!isCurrentDialog(generation)) return;
        setPipelineBusy(false);
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
        if (!soundAsset) await continueAfterMapDecision();
        else void submitInlineAssetReview();
      };

      async function pollInlinePipelineStatus() {
        const generation = dialogGeneration;
        stopInlinePipelinePolling();
        try {
          const status = await fetchJson("/api/pipeline/status");
          if (!isCurrentDialog(generation)) return;
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
            await handleInlineReviewStatus(status, generation);
            return;
          }
          if (status.status === "completed") {
            await loadData({ reload: true });
            if (!isCurrentDialog(generation)) return;
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
            showWorkflowError(status.error || "Suchlauf ist fehlgeschlagen.");
            return;
          }
          showWorkflowError("Der Suchlauf ist nicht mehr aktiv. Bitte seinen Status im Explorer prüfen.");
        } catch (error) {
          if (isCurrentDialog(generation)) showWorkflowError(error.message);
        }
      }

      const saveSharedSpecies = async () => {
        if (busy || pipelineBusy || completed || !previewToken || !sharedCandidate || !sharedAllowed(sharedAttempted)) return;
        if (!sharedAttempted && currentInputSignature() !== sharedSignature) {
          markSpeciesInputsChanged(); return;
        }
        const generation = dialogGeneration, candidate = sharedCandidate, token = previewToken;
        const recovery = sharedAttempted;
        const current = () => isCurrentDialog(generation) && sameSharedSource() && state.editMode === true;
        setBusy(true);
        setMessage(sharedAttempted ? "Serverstand wird gelesen und mit deiner geprüften Fassung verglichen…" : "Art wird als gemeinsamer Entwurf angelegt…", "info");
        try {
          if (recovery) {
            await fetchJson("/api/shared-project/refresh", { method: "POST", body: "{}" });
            if (!current()) throw new Error("Projekt oder Berechtigung wurden geändert. Bitte den Bestand im ursprünglichen Projekt prüfen.");
          }
          if (!current()) throw new Error("Das gemeinsame Projekt wurde geändert. Es wurde kein Anlageauftrag gesendet.");
          sharedAttempted = true; updateButtons();
          const result = await fetchJson(`/api/shared-project/species/new/${recovery ? "recover" : "create"}`, { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }) });
          if (!current()) throw new Error("Die Antwort gehört zum zuvor gewählten Projekt. Bitte dessen Bestand prüfen; es wird kein weiterer Auftrag gesendet.");
          if (result.source !== "shared-project" || result.sourceScope !== sharedScope || result.serverConfirmed !== true
              || result.approvalPerformed !== false || result.externalPublication !== "not-performed"
              || typeof result.created !== "boolean" || typeof result.recovered !== "boolean" || result.created === result.recovered
              || result.species?.id !== candidate.id || result.species.germanName !== candidate.germanName
              || result.species.scientificName !== candidate.scientificName || result.species.assetName !== candidate.assetName
              || typeof result.species.revision !== "string" || result.created && result.species.approval !== "draft")
            throw new Error("Die Artanlage ist noch nicht eindeutig bestätigt.");
          savedSpeciesId = candidate.id; savedSpeciesName = candidate.germanName;
          pendingSharedCreations.delete(sharedScope);
          if (state.notice === pendingSharedNotice) state.notice = "";
          previewToken = ""; completed = true; sharedAttempted = false;
          setMessage(result.recovered ? "Die geprüfte Artfassung ist im gemeinsamen Projekt vorhanden. Es wurde keine zweite Anlage gesendet."
            : "Art als Entwurf im gemeinsamen Projekt angelegt. Fachinformationen, Artdateien und Freigabe sind noch offen.", "success");
          state.selectedId = candidate.id;
          elements.search.value = ""; elements.statusFilter.value = ""; elements.flagFilter.value = "";
          const snapshot = await loadData({ reload: true });
          if (!current()) return;
          if (snapshot === null || state.workspaceStatus?.available === false)
            setMessage("Die Artanlage ist bestätigt. Die Ansicht konnte anschließend nicht aktualisiert werden. Bitte später den Serverstand laden; nicht erneut anlegen.", "info");
        } catch (error) {
          rememberSharedAttempt();
          if (isCurrentDialog(generation)) setMessage(`${error.message} ${sharedAttempted
            ? "Über „Serverstand prüfen“ wird ausschließlich die vorhandene Fassung verglichen. Bei geänderter Anmeldung bitte im ursprünglichen Projekt nachsehen."
            : "Bitte die Eingaben und Projektverbindung prüfen."}`, "error");
        } finally { if (isCurrentDialog(generation)) setBusy(false); }
      };

      const saveAndStartPipeline = async () => {
        if (creationWorkspace === "shared-project" || state.workspace === "shared-project") return;
        if (!previewToken || pipelineBusy || namePreferencePreparing) return;
        const speciesPreviewToken = previewToken;
        let namePreference = null;
        const preferenceChoice = taxonomyReference.getNamePreference?.();
        namePreferencePreparing = true;
        try {
          if (preferenceChoice) {
            try {
              namePreference = await fetchJson("/api/taxonomy/name-preference/preview", {
                method: "POST", body: JSON.stringify(preferenceChoice),
              });
              if (namePreference.requiresConfirmation && !await showQuickConfirm({
                title: "Bevorzugten deutschen Namen ändern?",
                message: `Bisher: ${namePreference.previousGermanName}\nNeu: ${namePreference.germanName}\nDie Namenswahl gilt künftig auch in Lightroom. Bestehende Projektdateien werden nicht umbenannt.`,
                confirmLabel: "Namenswahl übernehmen",
              })) return;
            } catch (error) { setPortraitMessage(error.message, "error"); return; }
          }
        } finally { namePreferencePreparing = false; }
        if (previewToken !== speciesPreviewToken
            || JSON.stringify(taxonomyReference.getNamePreference?.()) !== JSON.stringify(preferenceChoice)) {
          setMessage("Eingaben wurden geändert. Bitte erneut prüfen.", "error");
          return;
        }
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
          creationId = result.creationId || "";
          abortAvailable = Boolean(creationId);
          previewToken = ""; // The draft was consumed; never create this species twice.
          if (namePreference && !namePreference.unchanged) {
            const notice = document.createElement("p");
            const retry = document.createElement("button");
            retry.type = "button";
            retry.textContent = "Globale Namenswahl erneut speichern";
            dialog.querySelector(".new-species-message").after(notice, retry);
            const publishName = async () => {
              retry.disabled = true;
              try {
                const published = await fetchJson("/api/taxonomy/name-preference/save", {
                  method: "POST", body: JSON.stringify({ ...namePreference, confirmed: true }),
                });
                notice.textContent = published.saved ? "Globale Namenswahl übernommen." : published.message;
                retry.hidden = published.saved;
              } catch (error) { notice.textContent = `Art gespeichert; globale Namenswahl noch offen: ${error.message}`; }
              retry.disabled = false;
            };
            retry.addEventListener("click", () => void publishName());
            await publishName();
          }
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
                  body: JSON.stringify({ token: portraitPreviewToken, publish: false, creationId }),
                },
              );
            } catch (portraitError) {
              throw new Error(`Das Portrait konnte nicht übernommen werden: ${portraitError.message}. Die Originaldatei bitte für den erneuten Import behalten.`);
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
            body: JSON.stringify({ token: previewResult.token, guidedSpeciesCreation: true, ...(creationId ? { creationId } : {}) }),
          });
          state.pipelineStatusSnapshot = startedStatus;
          state.pipelineWasRunning = true;
          setPipelineStepState("data", ["save"]);
          setPipelineMessage("Suchlauf läuft. Karte, Sound und Spektrogramm werden vorbereitet…", "info");
          void pollInlinePipelineStatus();
        } catch (error) {
          showWorkflowError([error.message, ...(error.details || [])].join(" · "));
        }
      };

      const dialogController = createDialogController({
        dialog,
        closeButtons,
        beforeClose: () => {
          if (busy || pipelineBusy || namePreferencePreparing || abortPending) return false;
          if (creationWorkspace === "shared-project" && sharedAttempted && !completed) {
            rememberSharedAttempt(); state.notice = pendingSharedNotice;
          }
          discardDraft();
          form.reset();
          state.holdNewSpeciesBackground = false;
          resetAll();
          return true;
        },
      });
      const close = () => dialogController.close("programmatic");

      const abortSavedCreation = async () => {
        if (!creationId || !abortAvailable) return;
        clearTimeout(abortRetryTimer);
        stopInlinePipelinePolling();
        abortPending = true;
        setBusy(true);
        const requestedId = creationId;
        try {
          const result = await fetchJson("/api/species/new/abort", {
            method: "POST", body: JSON.stringify({ creationId: requestedId }),
          });
          if (requestedId !== creationId) return;
          if (result.pending) {
            setPipelineMessage(result.message || "Abbruch angefordert. Laufenden Schreibvorgang sicher abwarten …", "info");
            setFinishMessage("Abbruch angefordert. Der eigene Auftrag wird nach dem laufenden Schreibvorgang automatisch zurückgenommen.", "info");
            abortRetryTimer = setTimeout(abortSavedCreation, 1000);
            return;
          }
          state.pipelineStatusSnapshot = await fetchJson("/api/pipeline/status");
          state.renderPersistentPipelineStatus?.(state.pipelineStatusSnapshot);
          await loadData({ reload: true });
          state.notice = `Artanlage „${savedSpeciesName}“ wurde abgebrochen. Eigene Artdaten und Dateien wurden zurückgenommen; keine Übertragung erforderlich.`;
          abortPending = false;
          setBusy(false);
          setPipelineBusy(false);
          close();
        } catch (error) {
          abortPending = false;
          setBusy(false);
          setPipelineBusy(false);
          setPipelineMessage(error.message, "error");
          setFinishMessage(error.message, "error");
        }
      };
      abortButton.addEventListener("click", async () => {
        if (abortPending || !creationId) return;
        if (!await showQuickConfirm({ title: "Artanlage abbrechen?",
          message: `Die unveröffentlichte Anlage „${savedSpeciesName}“ und ihre eigenen Dateien werden zurückgenommen. Fenster schließen erhält sie zum Fortsetzen.`,
          confirmLabel: "Artanlage abbrechen" })) return;
        await abortSavedCreation();
      });

      const openCreator = async (resumeSnapshot = null) => {
        if (checkingAvailability || busy || pipelineBusy) return;
        if (state.workspace === "shared-project") {
          if (resumeSnapshot || state.editMode !== true || state.dataLoading || state.workspaceStatus?.connection !== "online"
              || state.workspaceStatus?.permissions?.canCreate !== true || state.workspaceStatus?.permissions?.canRead !== true
              || state.workspaceStatus?.permissions?.canEdit !== true || state.workspaceStatus?.available === false) return;
          const sourceScope = state.workspaceStatus?.sourceScope, epoch = state.workspaceEpoch || 0;
          if (typeof sourceScope !== "string" || !/^[a-f0-9]{64}$/.test(sourceScope)) return;
          const current = () => state.workspace === "shared-project" && state.workspaceStatus?.sourceScope === sourceScope
            && (state.workspaceEpoch || 0) === epoch && state.editMode === true && !state.dataLoading && state.workspaceStatus?.available !== false
            && state.workspaceStatus?.connection === "online" && state.workspaceStatus?.permissions?.canCreate === true;
          checkingAvailability = true; openButton.disabled = true;
          try {
            const pending = pendingSharedCreations.get(sourceScope);
            if (pending) { showSharedDialog(sourceScope, epoch, pending); return; }
            if (pendingSharedCreations.size >= 100) throw new Error("Bitte offene Artanlageprüfungen zuerst abschließen.");
            const result = await fetchJson("/api/shared-project/species/new/availability");
            if (!current()) throw new Error("Projekt oder Berechtigung wurden während der Prüfung geändert. Bitte erneut öffnen.");
            if (result.available !== true || result.source !== "shared-project" || result.sourceScope !== sourceScope)
              throw new Error("Der gemeinsame Dienst hat die Artanlage nicht eindeutig bestätigt.");
            showSharedDialog(sourceScope, epoch);
          } catch (error) {
            await showQuickConfirm({ title: "Gemeinsame Artanlage nicht verfügbar", message: error.message, confirmLabel: "Verstanden", cancelLabel: "" });
          } finally { checkingAvailability = false; updateButtons(); }
          return;
        }
        const resumeCreationId = resumeSnapshot?.creationId || "";
        const matchesResume = (status) => status?.status === "awaiting-review"
          && status.guidedSpeciesCreation === true && status.creationId === resumeCreationId
          && status.runId === resumeSnapshot.runId && status.targets?.length === 1
          && status.targets[0].slug === resumeSnapshot.targets[0].slug;
        const documentRef = openButton.ownerDocument || global.document;
        const localEpoch = state.workspaceEpoch || 0;
        const ownedFocus = documentRef?.activeElement === openButton;
        let generation = dialogGeneration;
        checkingAvailability = true;
        openButton.disabled = true;
        try {
          const availability = await fetchJson("/api/species/new/availability");
          if (!isCurrentDialog(generation)) return;
          if (state.workspace === "shared-project" || (state.workspaceEpoch || 0) !== localEpoch) {
            await showQuickConfirm({ title: "Artbestand wurde gewechselt", message: "Bitte die Artanlage im jetzt gewählten Bestand erneut öffnen.", confirmLabel: "Verstanden", cancelLabel: "" });
            return;
          }
          if (resumeCreationId && !matchesResume(state.pipelineStatusSnapshot)) {
            await showQuickConfirm({ title: "Artanlage kann nicht fortgesetzt werden",
              message: "Der gespeicherte Auftrag hat sich geändert. Bitte den aktuellen Status erneut prüfen.",
              confirmLabel: "Verstanden", cancelLabel: "" });
            return;
          }
          if (availability.available !== true) {
            await showQuickConfirm({ title: "Neue Art derzeit gesperrt", message: availability.message
              || "Die Artanlage ist derzeit nicht verfügbar. Bitte den Projektstatus prüfen.",
            confirmLabel: "Verstanden", cancelLabel: "" });
            return;
          }
        } catch (error) {
          if (!isCurrentDialog(generation)) return;
          await showQuickConfirm({ title: "Artanlage konnte nicht geprüft werden", message: error.message,
            confirmLabel: "Verstanden", cancelLabel: "" });
          return;
        } finally {
          checkingAvailability = false;
          openButton.disabled = busy || pipelineBusy || state.dataLoading || state.workspace === "shared-project";
          if (ownedFocus && isCurrentDialog(generation) && openButton.isConnected && !openButton.disabled
              && documentRef && (documentRef.activeElement === documentRef.body
                || documentRef.activeElement === documentRef.documentElement)) openButton.focus();
        }
        form.reset();
        resetAll();
        generation = dialogGeneration;
        state.holdNewSpeciesBackground = true;
        dialogController.open();
        const pending = resumeSnapshot || state.pipelineStatusSnapshot;
        try {
          const result = await fetchJson("/api/species/new/sessions", { method: "POST", body: "{}" });
          if (!isCurrentDialog(generation)) return;
          const session = resumeCreationId
            ? result.sessions?.find((item) => item.id === resumeCreationId && item.canAbort
              && item.slug === pending?.targets?.[0]?.slug)
            : result.sessions?.find((item) => item.canAbort && item.slug === pending?.targets?.[0]?.slug)
              || result.sessions?.find((item) => item.canAbort);
          if (resumeCreationId && !session) {
            throw new Error("Der gespeicherte Artauftrag ist nicht mehr eindeutig fortsetzbar. Bitte den aktuellen Projektstatus prüfen.");
          }
          if (session) {
            creationId = session.id;
            savedSpeciesId = session.slug;
            savedSpeciesName = session.germanName;
            abortAvailable = session.canAbort;
            if (session.abortRequested && session.canAbort) { await abortSavedCreation(); return; }
          }
        } catch (error) {
          if (!isCurrentDialog(generation)) return;
          if (resumeCreationId) {
            close();
            await showQuickConfirm({ title: "Artanlage kann nicht fortgesetzt werden", message: error.message,
              confirmLabel: "Verstanden", cancelLabel: "" });
            return;
          }
          setMessage(`Gespeicherte Artanlage konnte nicht gelesen werden: ${error.message}`, "error");
        }
        if (pending?.status === "awaiting-review" && pending.guidedSpeciesCreation && pending.targets?.length === 1) {
          try {
            const fresh = await fetchJson("/api/pipeline/status");
            if (!isCurrentDialog(generation)) return;
            if (resumeCreationId && !matchesResume(fresh)) {
              throw new Error("Der gespeicherte Auftrag hat sich geändert. Bitte den aktuellen Status erneut prüfen.");
            }
            if (fresh.status === "awaiting-review" && fresh.runId === pending.runId && fresh.guidedSpeciesCreation) {
              savedSpeciesId = fresh.targets[0].slug;
              savedSpeciesName = fresh.targets[0].germanName;
              await loadData({ reload: true });
              if (!isCurrentDialog(generation)) return;
              restoreSavedCreation();
              inlineManualMapHandled = newSpeciesData()?.assets?.map?.exists === true;
              await handleInlineReviewStatus(fresh, generation);
              return;
            }
          } catch (error) {
            if (isCurrentDialog(generation)) showWorkflowError(error.message);
            return;
          }
        }
        if (creationId) {
          try {
            await loadData({ reload: true });
            if (!isCurrentDialog(generation)) return;
            restoreSavedCreation();
          } catch (error) {
            if (isCurrentDialog(generation)) showWorkflowError(error.message);
            return;
          }
          showStep(4);
          showWorkflowError("Der gespeicherte Auftrag wurde wieder geöffnet.");
          return;
        }
        void taxonomyReference.initialize();
        form.elements.german.focus();
      };
      openButton.addEventListener("click", () => openCreator());
      state.resumeNewSpeciesCreation = async () => {
        const pending = state.pipelineStatusSnapshot;
        if (dialog.open || pending?.status !== "awaiting-review" || pending.guidedSpeciesCreation !== true
          || typeof pending.creationId !== "string" || !pending.creationId.trim() || pending.targets?.length !== 1) return;
        await openCreator({ status: pending.status, guidedSpeciesCreation: pending.guidedSpeciesCreation,
          creationId: pending.creationId, runId: pending.runId,
          targets: pending.targets.map((target) => ({ ...target })) });
      };

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
        if (savedSpeciesId) return;
        if (event.target.closest(".new-species-portrait")) {
          if (event.target === portraitInstructions) resetPortraitPrompt();
          resetPortraitPreview();
          setPortraitMessage("Portraitangaben geändert. Bitte Bildprüfung bei Bedarf erneut ausführen.", "info");
          return;
        }
        markSpeciesInputsChanged();
      });

      portraitFileInput.addEventListener("change", () => {
        if (creationWorkspace === "shared-project" || state.workspace === "shared-project" || savedSpeciesId) return;
        resetPortraitPreview();
        if (portraitFileInput.files?.[0]) {
          setPortraitMessage("Bild ausgewählt. Bitte mit „Bild prüfen“ validieren.", "info");
        } else {
          setPortraitMessage();
        }
      });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (savedSpeciesId) return;
        if (currentStep !== 1) return;
        if ((state.workspace || "local") !== creationWorkspace) {
          setMessage("Der Artbestand wurde gewechselt. Bitte das Fenster schließen und im gewünschten Bestand erneut öffnen.", "error"); return;
        }
        if (creationWorkspace === "shared-project" && (busy || completed || sharedAttempted || !sharedAllowed())) return;
        const localErrors = localFieldErrors();
        if (Object.keys(localErrors).length) {
          applyFieldErrors(localErrors);
          setMessage(Object.values(localErrors).flat().join(" · "), "error");
          return;
        }
        clearFieldErrors();
        discardDraft();
        resetPortraitPrompt();
        resetPortraitPreview();
        setBusy(true);
        setMessage("Neue Art und mögliche Kollisionen werden geprüft…", "info");
        try {
          const shared = creationWorkspace === "shared-project", generation = dialogGeneration, signature = shared ? currentInputSignature() : "";
          const result = await fetchJson(shared ? "/api/shared-project/species/new/preview" : "/api/species/new/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...(shared ? { sourceScope: sharedScope } : {}), values: speciesValues(), masterTaxonId: selectedTaxonomyMasterId(), taxonomyReference: selectedTaxonomyReference() }),
          });
          if (shared) {
            if (!isCurrentDialog(generation) || !sharedAllowed() || signature !== currentInputSignature()) {
              setMessage("Eingaben oder Projekt wurden während der Prüfung geändert. Bitte erneut prüfen.", "info"); return;
            }
            if (result.source !== "shared-project" || result.sourceScope !== sharedScope || typeof result.token !== "string"
                || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(result.token)
                || typeof result.species?.id !== "string" || result.species.id.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.species.id)
                || typeof result.species.scientificName !== "string" || !result.species.scientificName.trim() || result.species.scientificName.length > 201
                || typeof result.species.assetName !== "string" || !result.species.assetName.trim() || result.species.assetName.length > 512
                || result.species.germanName !== String(speciesValues().german ?? "").trim())
              throw new Error("Die gemeinsame Artvorschau wurde nicht eindeutig bestätigt.");
            previewToken = result.token; sharedSignature = signature; sharedCandidate = { ...result.species };
            sharedControlValues = [...form.querySelectorAll("input, select, textarea")].filter(control => control.type !== "file")
              .map(control => ({ control, value: control.value, checked: control.checked }));
            for (const field of derivedFields) field.textContent = ({ scientificName: result.species.scientificName, slug: result.species.id,
              assetDirectory: `${result.species.assetName} · noch keine Dateien` })[field.dataset.derived] ?? "";
            preview.hidden = false;
            setMessage("Eingaben geprüft. Mit „Art im gemeinsamen Projekt anlegen“ bestätigst du diesen Entwurf.", "success");
            showStep(1); return;
          }
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
        if (creationWorkspace === "shared-project") { void saveSharedSpecies(); return; }
        if (state.workspace === "shared-project") return;
        if (savedSpeciesId && currentStep < 3 && !busy && !pipelineBusy) { showStep(currentStep + 1); return; }
        if (currentStep === 1 && previewToken) showStep(2);
        else if (currentStep === 2 && canAdvanceFromPortrait()) void saveAndStartPipeline();
      });

      backButton.addEventListener("click", () => {
        if (currentStep > 1) showStep(currentStep - 1);
      });

      for (const indicator of stepIndicators) {
        indicator.addEventListener("click", () => {
          const targetStep = Number(indicator.dataset.newSpeciesStepIndicator);
          if (!targetStep || targetStep > maxStepReached || busy || pipelineBusy || creationWorkspace === "shared-project") return;
          showStep(targetStep);
        });
      }

      portraitPromptButton.addEventListener("click", async () => {
        if (creationWorkspace === "shared-project" || state.workspace === "shared-project") return;
        if (!previewToken) return;
        const options = validatedPortraitOptions();
        if (!options) return;
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
              portraitOptions: options,
              taxonomyClass: selectedTaxonomyClass(),
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
        if (creationWorkspace === "shared-project" || state.workspace === "shared-project") return;
        if (!previewToken) return;
        const options = validatedPortraitOptions();
        if (!options) return;
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
              portraitOptions: options,
              taxonomyClass: selectedTaxonomyClass(),
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
        if (creationWorkspace === "shared-project" || state.workspace === "shared-project" || savedSpeciesId) return;
        resetPortraitPreview();
        portraitSkipped = true;
        setPortraitMessage(
          "Artportrait wird für diese neue Art übersprungen. Mit „Nächster Schritt“ wird die Art angelegt.",
          "info",
        );
        updateFinalPortraitState();
        updateButtons();
      });

      const selectInlineMapFile = async (files) => {
        if (creationWorkspace === "shared-project" || state.workspace === "shared-project") return;
        if (busy || pipelineBusy) return;
        inlineManualMapPreviewToken = "";
        inlineManualMapFile = null;
        const file = files?.[0];
        const status = mapReview.querySelector(".new-species-map-file-status");
        const previewSection = mapReview.querySelector(".new-species-manual-map-preview");
        if (previewSection) previewSection.hidden = true;
        if (status) status.textContent = "";
        updateButtons();
        if (files?.length !== 1 || !file || !/\.(jpe?g|png)$/iu.test(file.name) || file.size <= 0 || file.size > 20 * 1024 * 1024) {
          setInlineMapMessage("Bitte genau eine JPEG-/PNG-Datei mit maximal 20 MB auswählen.", "error");
          return;
        }
        const species = newSpeciesData();
        const assessment = /T\d+A(\d+)(?:\s*\(\d+\))?\.jpe?g$/iu.exec(file.name)?.[1];
        if (assessment && species?.iucn?.assessmentId && assessment !== String(species.iucn.assessmentId)) {
          setInlineMapMessage("Diese IUCN-Kartendatei gehört zu einer anderen Bewertung. Bitte die Karte dieser Art verwenden.", "error");
          return;
        }
        const source = mapReview.querySelector(".new-species-map-source-input");
        const browserUrl = iucnDistributionMapUrl(species);
        // Do not label an arbitrary local image as an IUCN download by default.
        if (!assessment && source?.value === browserUrl) {
          source.value = "";
          const reason = mapReview.querySelector(".new-species-map-reason-input");
          if (reason?.value.startsWith("Manuell aus dem IUCN-Kartenlink")) reason.value = "Karte als lokale Datei importiert.";
        }
        else if (assessment && source && !source.value) source.value = browserUrl;
        inlineManualMapFile = file;
        if (status) status.textContent = `${file.name} · ${formatBytes(file.size)}`;
        await previewInlineManualMap();
      };

      mapReview.addEventListener("change", (event) => {
        if (creationWorkspace === "shared-project" || state.workspace === "shared-project") return;
        if (event.target.matches(".new-species-map-file-input")) return selectInlineMapFile(event.target.files);
        if (event.target.matches(".new-species-map-care-mode-input")) {
          inlineManualMapPreviewToken = "";
          const preview = mapReview.querySelector(".new-species-manual-map-preview");
          if (preview) preview.hidden = true;
          setInlineMapMessage("Pflegewahl geändert. Bitte die Karte erneut prüfen.", "info");
          updateButtons();
        }
      });
      for (const eventName of ["dragover", "drop"]) {
        mapReview.addEventListener(eventName, (event) => {
          if (!event.target.closest(".new-species-map-drop-zone")) return;
          event.preventDefault();
          event.stopPropagation();
          if (eventName === "drop") return selectInlineMapFile(event.dataTransfer?.files);
        });
      }

      mapReview.addEventListener("click", (event) => {
        if (creationWorkspace === "shared-project" || state.workspace === "shared-project") return;
        if (busy || pipelineBusy) return;
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
            return previewInlineManualMap();
          } else if (action === "save") {
            return saveInlineManualMap();
          } else if (action === "skip") {
            const mapAsset = inlineReviewAssets.find((entry) => entry.type === "map");
            if (mapAsset) inlineReviewChoices.set(`${mapAsset.safeName}:map`, "reject");
            inlineManualMapHandled = true;
            inlineManualMapPreviewToken = "";
            mapReview.hidden = true;
            mapReview.innerHTML = "";
            return continueAfterMapDecision();
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
        return continueAfterMapDecision();
      });

      soundReview.addEventListener("click", (event) => {
        if (creationWorkspace === "shared-project" || state.workspace === "shared-project") return;
        if (busy || pipelineBusy) return;
        if (event.target.closest("[data-new-species-sound-finish]")) {
          if (inlineRunId && state.pipelineStatusSnapshot?.status === "awaiting-review") void submitInlineAssetReview();
          else void finishNewSpeciesWorkflow({ status: "completed", gitPublished: false });
          return;
        }
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

      resetSoundsButton.addEventListener("click", async () => {
        if (creationWorkspace === "shared-project" || state.workspace === "shared-project") return;
        if (!savedSpeciesId || busy || pipelineBusy) return;
        setBusy(true);
        let resetSaved = false;
        try {
          const currentSound = inlineReviewAssets.find((asset) => asset.type === "sound");
          if (currentSound) {
            const confirmed = await showQuickConfirm({
              title: "Frühere Soundquellen wieder zulassen?",
              message: `Frühere Ablehnungen für ${savedSpeciesName} aufheben und erneut suchen? Der gerade angezeigte Sound wird dabei abgelehnt und übersprungen. Eine zuvor gespeicherte Aufnahme und ihre Schutzmarkierung bleiben erhalten. Die Art wird nicht nochmals angelegt.`,
              confirmLabel: "Frühere Sounds erneut suchen",
            });
            if (!confirmed) return;
            inlineReviewChoices.set(`${currentSound.safeName}:sound`, "reject");
            stopInlineReviewAudio();
            await submitInlineAssetReview({ resetSoundRejections: true });
            return;
          }
          if (inlineReviewAssets.length) return;
          if (state.pipelineStatusSnapshot?.status === "awaiting-review" && state.pipelineStatusSnapshot.guidedSpeciesCreation) {
            const confirmed = await showQuickConfirm({
              title: "Frühere Soundquellen erneut prüfen?",
              message: `Frühere Ablehnungen für ${savedSpeciesName} aufheben und erneut suchen? Vorhandene Dateien und manuelle Schutzmarkierungen bleiben erhalten. Die Art wird nicht nochmals angelegt.`,
              confirmLabel: "Sounds erneut suchen",
            });
            if (confirmed) await submitInlineAssetReview({ retrySoundSearch: true });
            return;
          }
          const base = `/api/species/${encodeURIComponent(savedSpeciesId)}/assets/sound`;
          const preview = await fetchJson(`${base}/rejections-preview`, { method: "POST", body: "{}" });
          const confirmed = await showQuickConfirm({
            title: "Soundquellen erneut prüfen?",
            message: preview.count
              ? `${preview.count} gespeicherte Ablehnung(en) für ${savedSpeciesName} aufheben und die Soundsuche erneut starten? Vorhandene Dateien und manuell geschützte Sounds bleiben unverändert.`
              : "Für diese Art sind keine Ablehnungen mehr gespeichert. Die Soundsuche erneut starten?",
            confirmLabel: "Soundsuche erneut starten",
          });
          if (!confirmed) return;
          if (preview.count) {
            await fetchJson(`${base}/rejections-reset`, {
              method: "POST", body: JSON.stringify({ token: preview.token, confirmed: true,
                ...(creationId && abortAvailable ? { creationId } : {}) }),
            });
            resetSaved = true;
          }
          const plan = await fetchJson("/api/pipeline/preview", {
            method: "POST", body: JSON.stringify({ mode: "nc-sounds", targetSlugs: [savedSpeciesId] }),
          });
          if (!plan.tokensAvailable) throw new Error("Die benötigten API-Tokens fehlen in der Server-Umgebung.");
          if (!plan.hasWork) {
            setFinishMessage("Keine Soundsuche erforderlich. Vorhandene Schutzentscheidungen bleiben erhalten.", "info");
            return;
          }
          const status = await fetchJson("/api/pipeline/start", {
            method: "POST", body: JSON.stringify({ token: plan.token,
              ...(creationId && abortAvailable ? { creationId, guidedSpeciesCreation: true } : {}) }),
          });
          completed = false;
          doneSection.hidden = true;
          state.holdNewSpeciesBackground = true;
          state.newSpeciesPipelineActive = true;
          state.pipelineWasRunning = true;
          state.pipelineStatusSnapshot = status;
          setPipelineBusy(true);
          setFinishMessage("Soundsuche läuft erneut. Die Art wird nicht nochmals angelegt.", "info");
          void pollInlinePipelineStatus();
        } catch (error) {
          showWorkflowError(`${resetSaved ? "Die Ablehnungen sind aufgehoben; die Soundsuche konnte nicht gestartet werden. " : ""}${error.message}`);
        } finally {
          setBusy(false);
        }
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
