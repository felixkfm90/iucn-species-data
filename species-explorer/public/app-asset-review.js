(function initializeSpeciesExplorerAssetReview(global) {
  "use strict";

  function reviewSignature(assets = []) {
    return JSON.stringify(
      assets.map((asset) => [
        asset.safeName,
        asset.germanName,
        asset.scientificName,
        asset.label,
        asset.type,
        asset.file,
        asset.url,
        asset.spectrogramUrl,
        asset.previousUrl,
        asset.previousSpectrogramUrl,
        asset.sourceLabel,
        asset.previousSourceLabel,
        asset.isNc,
        asset.previousIsNc,
        asset.previouslyExisting,
        asset.previousManual,
      ]),
    );
  }

  function createAssetReviewRenderer({ escapeHtml } = {}) {
    if (typeof escapeHtml !== "function") {
      throw new TypeError("Asset-Prüfung benötigt escapeHtml als Funktion.");
    }

    function decisionLabels(mode, asset) {
      if (asset.type === "map") {
        const comparesExistingMap = asset.previouslyExisting === true;
        return {
          automatic: mode === "manual-maps" || comparesExistingMap
            ? "Automatische Karte übernehmen"
            : "Karte automatisch pflegen",
          manual: mode === "manual-maps" && !comparesExistingMap
            ? "Neue Karte nicht übernehmen"
            : comparesExistingMap
              ? `Bisherige ${asset.previousManual ? "manuelle" : "automatische"} Karte behalten`
              : "Manuell pflegen und schützen",
        };
      }
      const soundKind = asset.isNc ? "NC" : "frei";
      return {
        automatic: `Gefundenen Sound übernehmen (${soundKind})`,
        manual: mode === "nc-sounds" && asset.previouslyExisting !== true
          ? "Sound nicht übernehmen"
          : asset.previouslyExisting === true
            ? "Bisherigen Sound behalten"
            : "Manuell pflegen und schützen",
      };
    }

    function renderAssetReviewList(status) {
      return (status.reviewAssets || []).map((asset, index) => {
        const labels = decisionLabels(status.mode, asset);
        const currentSoundKind = asset.previousSourceLabel || (asset.previousIsNc === true ? "NC" : "frei");
        const foundSoundKind = asset.sourceLabel || (asset.isNc ? "NC" : "frei");
        const metaLine = asset.type === "sound"
          ? `${asset.scientificName} · gefundener Sound: ${foundSoundKind}`
          : `${asset.scientificName} · ${asset.file}`;
        return `
          <article class="asset-review-item" data-index="${index}" data-type="${escapeHtml(asset.type)}">
            <div class="asset-review-preview">
              ${asset.type === "map"
                ? `
                  <div class="asset-review-map-compare">
                    <div class="asset-review-map-preview">
                      <strong>Bisherige Karte</strong>
                      ${asset.previousUrl ? `
                        <button
                          class="asset-review-map-trigger"
                          type="button"
                          data-map-url="${escapeHtml(asset.previousUrl)}"
                          data-map-alt="${escapeHtml(`bisherige Karte ${asset.germanName}`)}"
                          aria-label="Bisherige Karte ${escapeHtml(asset.germanName)} vergrößern"
                        >
                          <img src="${escapeHtml(asset.previousUrl)}" alt="${escapeHtml(`Bisherige Karte ${asset.germanName}`)}">
                          <span class="asset-review-zoom-hint">Vergrößern</span>
                        </button>
                      ` : `<span class="asset-review-no-map">Keine Karte vorhanden</span>`}
                    </div>
                    <div class="asset-review-map-preview">
                      <strong>Gefundene Karte</strong>
                      <button
                        class="asset-review-map-trigger"
                        type="button"
                        data-map-url="${escapeHtml(asset.url)}"
                        data-map-alt="${escapeHtml(`gefundene Karte ${asset.germanName}`)}"
                        aria-label="Gefundene Karte ${escapeHtml(asset.germanName)} vergrößern"
                      >
                        <img src="${escapeHtml(asset.url)}" alt="${escapeHtml(`Gefundene Karte ${asset.germanName}`)}">
                        <span class="asset-review-zoom-hint">Vergrößern</span>
                      </button>
                    </div>
                  </div>
                `
                : `
                  <div class="asset-review-sound-compare">
                    ${asset.previousUrl ? `
                      <div class="asset-review-sound-preview">
                        <strong>Aktueller Sound (${escapeHtml(currentSoundKind)})</strong>
                        ${asset.previousSpectrogramUrl ? `
                          <button
                            class="asset-review-spectrogram"
                            type="button"
                            aria-label="Im bisherigen Spektrogramm von ${escapeHtml(asset.germanName)} springen"
                          >
                            <img src="${escapeHtml(asset.previousSpectrogramUrl)}" alt="${escapeHtml(`Bisheriges Spektrogramm ${asset.germanName}`)}">
                            <span class="asset-review-progress-marker"></span>
                          </button>
                        ` : `<span class="asset-review-no-spectrogram">Bisheriges Spektrogramm nicht vorhanden</span>`}
                        <audio controls preload="metadata" src="${escapeHtml(asset.previousUrl)}"></audio>
                      </div>
                    ` : ""}
                    <div class="asset-review-sound-preview">
                      <strong>Gefundener Sound (${escapeHtml(foundSoundKind)})</strong>
                      ${asset.spectrogramUrl ? `
                        <button
                          class="asset-review-spectrogram"
                          type="button"
                          aria-label="Im Spektrogramm von ${escapeHtml(asset.germanName)} springen"
                        >
                          <img src="${escapeHtml(asset.spectrogramUrl)}" alt="${escapeHtml(`Spektrogramm ${asset.germanName}`)}">
                          <span class="asset-review-progress-marker"></span>
                        </button>
                      ` : `<span class="asset-review-no-spectrogram">Spektrogramm noch nicht vorhanden</span>`}
                      <audio controls preload="metadata" src="${escapeHtml(asset.url)}"></audio>
                    </div>
                  </div>
                `}
            </div>
            <div class="asset-review-copy">
              <div>
                <strong>${escapeHtml(asset.germanName)} · ${escapeHtml(asset.label)}</strong>
                <p>${escapeHtml(metaLine)}</p>
              </div>
              <div class="asset-review-options">
                <label>
                  <input type="radio" name="asset-${index}" value="automatic" required>
                  ${escapeHtml(labels.automatic)}
                </label>
                <label>
                  <input type="radio" name="asset-${index}" value="manual" required>
                  ${escapeHtml(labels.manual)}
                </label>
                ${asset.type === "sound" ? `
                  <label>
                    <input type="radio" name="asset-${index}" value="reject" required>
                    Gefundenen Sound ablehnen und weiter suchen
                  </label>
                ` : ""}
              </div>
            </div>
          </article>
        `;
      }).join("");
    }

    return Object.freeze({ decisionLabels, renderAssetReviewList });
  }

  function createAssetReviewMediaController({
    list,
    mapLightbox,
    mapLightboxImage,
    mapLightboxClose,
    createDialogController,
    releaseMediaWithin,
    resetScrollableToTop,
  } = {}) {
    for (const [name, dependency] of Object.entries({
      createDialogController,
      releaseMediaWithin,
      resetScrollableToTop,
    })) {
      if (typeof dependency !== "function") {
        throw new TypeError(`Asset-Mediensteuerung benötigt ${name} als Funktion.`);
      }
    }
    if (!list || !mapLightbox || !mapLightboxImage || !mapLightboxClose) {
      throw new TypeError("Asset-Mediensteuerung benötigt alle Dialogelemente.");
    }

    const mapLightboxController = createDialogController({
      dialog: mapLightbox,
      closeButtons: [mapLightboxClose],
      bodyClass: "explorer-modal-open",
    });
    let markerCleanups = [];

    const clearMarkerBindings = () => {
      for (const cleanup of markerCleanups) cleanup();
      markerCleanups = [];
    };

    const stopAudio = () => {
      clearMarkerBindings();
      releaseMediaWithin(list);
    };

    const closeMapLightbox = () => {
      mapLightboxController.close("programmatic");
    };

    const openMapLightbox = (trigger) => {
      const url = trigger?.dataset?.mapUrl;
      const alt = trigger?.dataset?.mapAlt || "Neue Verbreitungskarte";
      if (!url) return;
      mapLightboxImage.onload = () => resetScrollableToTop(mapLightbox);
      mapLightboxImage.src = url;
      mapLightboxImage.alt = alt;
      mapLightbox.setAttribute("aria-label", `Vergrößerte ${alt}`);
      resetScrollableToTop(mapLightbox);
      mapLightboxController.open();
      resetScrollableToTop(mapLightbox);
    };

    const bindRenderedMedia = () => {
      clearMarkerBindings();
      for (const item of list.querySelectorAll(".asset-review-sound-preview")) {
        const audio = item.querySelector("audio");
        const marker = item.querySelector(".asset-review-progress-marker");
        if (!audio || !marker) continue;
        const updateMarker = () => {
          const progress = audio.duration > 0 ? audio.currentTime / audio.duration : 0;
          marker.style.left = `${Math.min(1, Math.max(0, progress)) * 100}%`;
        };
        for (const eventName of ["timeupdate", "loadedmetadata", "seeked"]) {
          audio.addEventListener(eventName, updateMarker);
        }
        markerCleanups.push(() => {
          for (const eventName of ["timeupdate", "loadedmetadata", "seeked"]) {
            audio.removeEventListener?.(eventName, updateMarker);
          }
        });
      }
    };

    const onListClick = (event) => {
      const trigger = event.target?.closest?.(".asset-review-map-trigger");
      if (trigger) {
        openMapLightbox(trigger);
        return;
      }
      const spectrogram = event.target?.closest?.(".asset-review-spectrogram");
      if (!spectrogram) return;
      const item = spectrogram.closest(".asset-review-sound-preview");
      const audio = item?.querySelector("audio");
      const marker = spectrogram.querySelector(".asset-review-progress-marker");
      if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      const rect = spectrogram.getBoundingClientRect();
      if (!rect.width) return;
      const progress = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      audio.currentTime = progress * audio.duration;
      if (marker) marker.style.left = `${progress * 100}%`;
      audio.play().catch(() => {});
    };

    list.addEventListener("click", onListClick);

    return Object.freeze({
      bindRenderedMedia,
      stopAudio,
      closeMapLightbox,
      destroy() {
        list.removeEventListener?.("click", onListClick);
        stopAudio();
        mapLightboxImage.onload = null;
        mapLightboxController.close("cleanup");
        mapLightboxController.destroy();
      },
    });
  }

  global.SpeciesExplorerAssetReview = Object.freeze({
    reviewSignature,
    createAssetReviewRenderer,
    createAssetReviewMediaController,
  });
})(globalThis);
