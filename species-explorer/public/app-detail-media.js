(function initializeSpeciesExplorerDetailMedia(global) {
  "use strict";

  function createDetailMediaController({
    state,
    elements,
    documentRef = global.document,
    AudioElementClass = global.HTMLAudioElement,
    refreshExplorerModelOnly,
    escapeHtml,
    cacheBustedUrl,
    releaseAudioElement,
    releaseMediaWithin,
    resetScrollableToTop,
    openDialog,
    bindAudioPlayer,
    bindImageZoom,
    createDialogController,
    waitForRelease = (milliseconds) => new Promise((resolve) => global.setTimeout(resolve, milliseconds)),
    now = () => Date.now(),
  } = {}) {
    if (!state || typeof state !== "object") {
      throw new TypeError("Detailmedien benötigen einen Explorer-Zustand.");
    }
    if (!elements || typeof elements !== "object") {
      throw new TypeError("Detailmedien benötigen die Explorer-Elemente.");
    }
    if (!documentRef?.querySelectorAll || !documentRef?.addEventListener) {
      throw new TypeError("Detailmedien benötigen ein Dokument mit Ereignissteuerung.");
    }
    for (const [name, dependency] of Object.entries({
      refreshExplorerModelOnly,
      escapeHtml,
      cacheBustedUrl,
      releaseAudioElement,
      releaseMediaWithin,
      resetScrollableToTop,
      openDialog,
      bindAudioPlayer,
      bindImageZoom,
      createDialogController,
      waitForRelease,
      now,
    })) {
      if (typeof dependency !== "function") {
        throw new TypeError(`Detailmedien benötigen ${name} als Funktion.`);
      }
    }

    function openSharedMapLightbox(url, alt = "Verbreitungskarte") {
      const mapLightbox = elements.assetReviewMapLightbox;
      const image = elements.assetReviewMapLightboxImage;
      if (!mapLightbox || !image || !url) return false;
      image.onload = () => resetScrollableToTop(mapLightbox);
      image.src = url;
      image.alt = alt;
      mapLightbox.setAttribute("aria-label", `Vergrößerte ${alt}`);
      resetScrollableToTop(mapLightbox);
      openDialog(mapLightbox, { bodyClass: "explorer-modal-open" });
      resetScrollableToTop(mapLightbox);
      return true;
    }

    async function refreshOpenSoundEditor(speciesId) {
      const editDialog = elements.detailPanel?.querySelector?.(".edit-dialog[open]");
      if (!editDialog || editDialog.dataset.activeSection !== "sound") return false;
      const { species } = await refreshExplorerModelOnly({ reload: true });
      const updatedSpecies = species.find((entry) => entry.id === speciesId);
      if (!updatedSpecies) return false;

      const form = editDialog.querySelector(".edit-form");
      const soundFields = editDialog.querySelector(".sound-edit-fields");
      let currentPreview = editDialog.querySelector(".current-sound-preview");
      if (updatedSpecies.assets.sound.exists) {
        if (!currentPreview && soundFields) {
          currentPreview = documentRef.createElement("section");
          currentPreview.className = "current-sound-preview";
          soundFields.before(currentPreview);
        }
        if (currentPreview) {
          releaseAudioElement(currentPreview.querySelector("audio"), { replace: false });
          const cacheKey = [
            updatedSpecies.assets.sound.sha256,
            updatedSpecies.assets.sound.bytes,
            updatedSpecies.assets.spectrogram?.soundSha256,
            now(),
          ].filter(Boolean).join("-");
          currentPreview.innerHTML = `
            <div>
              <strong>Aktueller Sound</strong>
              <span>${escapeHtml(updatedSpecies.isNcSound ? "NC-Lizenz" : "frei/akzeptiert")}</span>
            </div>
            <audio
              class="current-sound-audio"
              controls
              preload="metadata"
              src="${escapeHtml(cacheBustedUrl(updatedSpecies.assets.sound.url, cacheKey))}"
            ></audio>
          `;
        }
      } else if (currentPreview) {
        releaseAudioElement(currentPreview.querySelector("audio"), { replace: false });
        currentPreview.remove();
      }

      const setField = (name, value) => {
        const field = form?.querySelector(`[name="${name}"]`);
        if (field) field.value = value || "";
      };
      const credits = updatedSpecies.credits || {};
      setField("soundRecordist", credits.recordist);
      setField("soundSource", credits.source);
      setField("soundUrl", credits.url);
      setField("soundLicense", credits.license);
      setField("soundCountry", credits.country);
      setField("soundLocation", credits.location);
      setField("soundQuality", credits.quality);
      setField("soundNotes", credits.notes);

      const reasonInput = editDialog.querySelector(".sound-reason-input");
      if (reasonInput) reasonInput.value = updatedSpecies.assets.sound.manualReason || "";
      const careState = editDialog.querySelector(".sound-care-state");
      if (careState) careState.textContent = updatedSpecies.assets.sound.manuallyAdded
        ? "Manuell geschützt"
        : "Automatische Pflege";
      const autoSearchButton = editDialog.querySelector(".sound-auto-search-button");
      if (autoSearchButton) autoSearchButton.textContent = updatedSpecies.assets.sound.exists
        ? "Alternative suchen"
        : "Automatisch suchen";

      const preview = editDialog.querySelector(".sound-edit-preview");
      if (preview) preview.hidden = true;
      for (const audio of editDialog.querySelectorAll(".sound-preview-current, .sound-preview-new")) {
        releaseAudioElement(audio, { replace: false });
      }
      const saveButton = editDialog.querySelector(".sound-save-button");
      if (saveButton) saveButton.disabled = true;
      const creditsPreview = editDialog.querySelector(".sound-credits-preview");
      if (creditsPreview) creditsPreview.replaceChildren();
      return true;
    }

    async function releaseAllAudioElements() {
      state.audioCleanup?.();
      state.audioCleanup = null;
      releaseMediaWithin(documentRef, { replace: true });
      await waitForRelease(1500);
    }

    function handleExclusiveAudioPlayback(event) {
      const current = event.target;
      if (!AudioElementClass || !(current instanceof AudioElementClass)) return;
      for (const audio of documentRef.querySelectorAll("audio")) {
        if (audio === current) continue;
        audio.pause();
        try {
          audio.currentTime = 0;
        } catch {
          // currentTime kann bei noch nicht geladenen Audiodateien gesperrt sein.
        }
      }
    }

    function bindExclusiveAudioPlayback() {
      documentRef.addEventListener("play", handleExclusiveAudioPlayback, true);
      return () => documentRef.removeEventListener?.("play", handleExclusiveAudioPlayback, true);
    }

    function releaseDetailMedia() {
      state.audioCleanup?.();
      state.audioCleanup = null;
      state.mapCleanup?.();
      state.mapCleanup = null;
      state.portraitCleanup?.();
      state.portraitCleanup = null;
      releaseMediaWithin(elements.detailPanel, { replace: true, includeImages: true });
    }

    function setupAudioPlayer() {
      state.audioCleanup?.();
      state.audioCleanup = bindAudioPlayer({ root: elements.detailPanel });
      return state.audioCleanup;
    }

    function setupMapZoom() {
      state.mapCleanup?.();
      state.mapCleanup = bindImageZoom({
        root: elements.detailPanel,
        triggerSelector: ".map-zoom-trigger",
        dialogSelector: ".map-lightbox:not(.portrait-lightbox)",
        closeSelector: ".map-lightbox-close:not(.portrait-lightbox-close)",
        createDialogController,
      });
      return state.mapCleanup;
    }

    function setupPortraitZoom() {
      state.portraitCleanup?.();
      state.portraitCleanup = bindImageZoom({
        root: elements.detailPanel,
        triggerSelector: ".portrait-zoom-trigger",
        dialogSelector: ".portrait-lightbox",
        closeSelector: ".portrait-lightbox-close",
        createDialogController,
      });
      return state.portraitCleanup;
    }

    return Object.freeze({
      openSharedMapLightbox,
      refreshOpenSoundEditor,
      releaseAllAudioElements,
      bindExclusiveAudioPlayback,
      releaseDetailMedia,
      setupAudioPlayer,
      setupMapZoom,
      setupPortraitZoom,
    });
  }

  global.SpeciesExplorerDetailMedia = Object.freeze({
    createDetailMediaController,
  });
})(typeof window !== "undefined" ? window : globalThis);
