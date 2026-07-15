(function initializeSpeciesExplorerMedia(global) {
  "use strict";

  function formatTime(value) {
    if (!Number.isFinite(value) || value < 0) return "0:00";
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60);
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function resetScrollableToTop(element, requestFrame = global.requestAnimationFrame) {
    if (!element) return;
    element.scrollTop = 0;
    element.scrollLeft = 0;
    if (typeof requestFrame !== "function") return;
    requestFrame(() => {
      element.scrollTop = 0;
      element.scrollLeft = 0;
    });
  }

  function createMediaRenderers({
    escapeHtml,
    formatBytes,
    versionedAssetUrl,
  } = {}) {
    for (const [name, dependency] of Object.entries({ escapeHtml, formatBytes, versionedAssetUrl })) {
      if (typeof dependency !== "function") {
        throw new TypeError(`Medienanzeige benötigt ${name} als Funktion.`);
      }
    }

    function inlineEditButton(section) {
      return `
        <button class="inline-edit-open edit-species-open edit-only" type="button" data-edit-section="${escapeHtml(section)}">
          Bearbeiten
        </button>
      `;
    }

    function inlineDeleteButton(assetType, label) {
      return `
        <button class="inline-delete-open ${escapeHtml(assetType)}-delete-button danger edit-only" type="button">
          ${escapeHtml(label)}
        </button>
      `;
    }

    function inlineRestoreButton(assetType, backup = null) {
      const hasBackup = backup?.exists === true;
      const title = hasBackup
        ? `Letzte lokale Sicherung wiederherstellen (${formatBytes(backup.bytes || 0)})`
        : "Keine lokale Sicherung vorhanden";
      return `
        <button
          class="inline-restore-open ${escapeHtml(assetType)}-restore-button edit-only${hasBackup ? " available" : ""}"
          type="button"
          data-asset-type="${escapeHtml(assetType)}"
          title="${escapeHtml(title)}"
          ${hasBackup ? "" : "disabled"}
        >
          Wiederherstellen
        </button>
      `;
    }

    function sectionActions(
      editSection = "",
      deleteAssetType = "",
      deleteLabel = "",
      restoreAssetType = "",
      restoreBackup = null,
    ) {
      const actions = [];
      if (editSection) actions.push(inlineEditButton(editSection));
      if (restoreAssetType) actions.push(inlineRestoreButton(restoreAssetType, restoreBackup));
      if (deleteAssetType && deleteLabel) actions.push(inlineDeleteButton(deleteAssetType, deleteLabel));
      return actions.length ? `<div class="section-heading-actions edit-only">${actions.join("")}</div>` : "";
    }

    function mapPanel(asset, alt, editSection = "") {
      const mapUrl = versionedAssetUrl(asset.url, asset);
      const content = asset.exists
        ? `
          <button class="map-zoom-trigger" type="button" aria-label="Verbreitungskarte vergrößern">
            <img class="map-image" src="${escapeHtml(mapUrl)}" alt="${escapeHtml(alt)}">
            <span class="map-zoom-hint">Vergrößern</span>
          </button>
        `
        : `<span class="media-missing">Nicht vorhanden</span>`;
      return `
        <section class="map-panel">
          <div class="section-heading">
            <h3 class="section-title">Verbreitungskarte${asset.exists ? ` · ${formatBytes(asset.bytes)}` : ""}</h3>
            ${sectionActions(
              editSection,
              editSection && asset.exists ? "map" : "",
              "Karte löschen",
              editSection ? "map" : "",
              asset.backup,
            )}
          </div>
          <div class="map-frame">${content}</div>
        </section>
      `;
    }

    function speciesImagePanel(species) {
      const portrait = species.assets.portrait;
      if (portrait?.exists) {
        const portraitUrl = versionedAssetUrl(portrait.url, portrait);
        return `
          <section class="species-image-panel">
            <div class="section-heading">
              <h3 class="section-title">Artporträt · ${formatBytes(portrait.bytes)}</h3>
              ${sectionActions(
                species.inInput ? "portrait" : "",
                species.inInput ? "portrait" : "",
                "Artporträt löschen",
                species.inInput ? "portrait" : "",
                portrait.backup,
              )}
            </div>
            <button class="portrait-zoom-trigger" type="button" aria-label="Artporträt vergrößern">
              <img
                class="species-portrait-image"
                src="${escapeHtml(portraitUrl)}"
                alt="${escapeHtml(`Illustriertes Artporträt ${species.germanName}`)}"
              >
              <span class="map-zoom-hint">Vergrößern</span>
            </button>
          </section>
        `;
      }
      return `
        <section class="species-image-panel">
          <div class="section-heading">
            <h3 class="section-title">Artporträt</h3>
            ${sectionActions(
              species.inInput ? "portrait" : "",
              "",
              "",
              species.inInput ? "portrait" : "",
              portrait?.backup,
            )}
          </div>
          <div class="species-image-placeholder">
            <strong>${escapeHtml(species.germanName)}</strong>
            <span>Noch kein geprüftes Artporträt vorhanden</span>
          </div>
        </section>
      `;
    }

    return Object.freeze({
      inlineEditButton,
      inlineDeleteButton,
      inlineRestoreButton,
      sectionActions,
      mapPanel,
      speciesImagePanel,
    });
  }

  function bindAudioPlayer({
    root,
    requestFrame = global.requestAnimationFrame,
    cancelFrame = global.cancelAnimationFrame,
  } = {}) {
    const audio = root?.querySelector?.(".explorer-audio");
    if (!audio) return null;

    const playButton = root.querySelector(".audio-play-toggle");
    const visual = root.querySelector(".audio-visual");
    const marker = root.querySelector(".audio-progress-marker");
    const time = root.querySelector(".audio-time");
    const volume = root.querySelector(".audio-volume");
    if (!playButton || !visual || !marker || !time || !volume) return null;

    const scheduleFrame = typeof requestFrame === "function" ? requestFrame : () => 0;
    const cancelScheduledFrame = typeof cancelFrame === "function" ? cancelFrame : () => {};
    let animationFrame = 0;
    let destroyed = false;

    const updateProgress = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      const progress = duration > 0 ? Math.min(1, Math.max(0, audio.currentTime / duration)) : 0;
      marker.style.left = `${progress * 100}%`;
      time.textContent = `${formatTime(audio.currentTime)} / ${formatTime(duration)}`;
    };

    const animate = () => {
      if (destroyed) return;
      updateProgress();
      if (!audio.paused && !audio.ended) animationFrame = scheduleFrame(animate);
    };

    const updatePlayState = () => {
      if (destroyed) return;
      const playing = !audio.paused && !audio.ended;
      playButton.textContent = playing ? "Ⅱ" : "▶";
      playButton.setAttribute("aria-label", playing ? "Pause" : "Abspielen");
      playButton.classList.toggle("playing", playing);
      cancelScheduledFrame(animationFrame);
      if (playing) animationFrame = scheduleFrame(animate);
      else updateProgress();
    };

    const togglePlayback = async () => {
      if (audio.paused || audio.ended) {
        try {
          await audio.play();
        } catch {
          updatePlayState();
        }
      } else {
        audio.pause();
      }
    };

    const seekFromPointer = async (event) => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      const rect = visual.getBoundingClientRect();
      if (!rect.width) return;
      const progress = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      audio.currentTime = progress * audio.duration;
      updateProgress();
      try {
        await audio.play();
      } catch {
        updatePlayState();
      }
    };

    const onVisualKeydown = (event) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        togglePlayback();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        audio.currentTime = Math.min(audio.duration || 0, Math.max(0, audio.currentTime + direction * 5));
        updateProgress();
      }
    };

    const onVolumeInput = () => {
      audio.volume = Number(volume.value);
    };

    playButton.addEventListener("click", togglePlayback);
    visual.addEventListener("click", seekFromPointer);
    visual.addEventListener("keydown", onVisualKeydown);
    volume.addEventListener("input", onVolumeInput);
    audio.addEventListener("loadedmetadata", updateProgress);
    audio.addEventListener("durationchange", updateProgress);
    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("play", updatePlayState);
    audio.addEventListener("pause", updatePlayState);
    audio.addEventListener("ended", updatePlayState);
    updatePlayState();

    return () => {
      if (destroyed) return;
      destroyed = true;
      cancelScheduledFrame(animationFrame);
      playButton.removeEventListener?.("click", togglePlayback);
      visual.removeEventListener?.("click", seekFromPointer);
      visual.removeEventListener?.("keydown", onVisualKeydown);
      volume.removeEventListener?.("input", onVolumeInput);
      audio.removeEventListener?.("loadedmetadata", updateProgress);
      audio.removeEventListener?.("durationchange", updateProgress);
      audio.removeEventListener?.("timeupdate", updateProgress);
      audio.removeEventListener?.("play", updatePlayState);
      audio.removeEventListener?.("pause", updatePlayState);
      audio.removeEventListener?.("ended", updatePlayState);
      audio.pause?.();
      audio.removeAttribute?.("src");
      audio.load?.();
    };
  }

  function bindImageZoom({
    root,
    triggerSelector,
    dialogSelector,
    closeSelector,
    createDialogController,
    bodyClass = "explorer-modal-open",
  } = {}) {
    if (typeof createDialogController !== "function") {
      throw new TypeError("Bildzoom benötigt createDialogController als Funktion.");
    }
    const trigger = root?.querySelector?.(triggerSelector);
    const dialog = root?.querySelector?.(dialogSelector);
    const closeButton = root?.querySelector?.(closeSelector);
    if (!trigger || !dialog || !closeButton) return null;

    const controller = createDialogController({
      dialog,
      closeButtons: [closeButton],
      bodyClass,
    });
    const open = () => {
      resetScrollableToTop(dialog);
      controller.open();
      resetScrollableToTop(dialog);
    };
    trigger.addEventListener("click", open);

    return () => {
      trigger.removeEventListener?.("click", open);
      controller.close("cleanup");
      controller.destroy();
    };
  }

  global.SpeciesExplorerMedia = Object.freeze({
    formatTime,
    resetScrollableToTop,
    createMediaRenderers,
    bindAudioPlayer,
    bindImageZoom,
  });
})(globalThis);
