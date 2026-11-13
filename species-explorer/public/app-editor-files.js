(function initializeSpeciesExplorerEditorFiles(global) {
  "use strict";

  function iucnDistributionMapUrl(species) {
    const assessmentId = String(species?.iucn?.assessmentId ?? "").trim();
    const taxonId = String(species?.iucn?.taxonId ?? "").trim();
    return /^[1-9]\d*$/.test(assessmentId) && /^[1-9]\d*$/.test(taxonId)
      ? `https://www.iucnredlist.org/species/${taxonId}/${assessmentId}/distribution_map`
      : "";
  }

  function fileToBase64(file, { FileReaderClass = global.FileReader } = {}) {
    if (typeof FileReaderClass !== "function") {
      return Promise.reject(new Error("Datei kann in dieser Umgebung nicht gelesen werden"));
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReaderClass();
      reader.addEventListener("load", () => {
        const value = String(reader.result ?? "");
        const commaIndex = value.indexOf(",");
        if (commaIndex < 0) {
          reject(new Error("Datei konnte nicht gelesen werden"));
          return;
        }
        resolve(value.slice(commaIndex + 1));
      });
      reader.addEventListener("error", () => {
        reject(reader.error || new Error("Datei konnte nicht gelesen werden"));
      });
      reader.readAsDataURL(file);
    });
  }

  function waitForAudioMetadata(audio, {
    timeoutMs = 8000,
    scheduleTimeout = global.setTimeout,
    cancelTimeout = global.clearTimeout,
  } = {}) {
    if (Number.isFinite(audio?.duration) && audio.duration > 0) {
      return Promise.resolve(audio.duration);
    }
    if (!audio?.addEventListener || typeof scheduleTimeout !== "function") {
      return Promise.reject(new Error("MP3-Metadaten konnten nicht gelesen werden"));
    }

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        if (timeout) cancelTimeout?.(timeout);
        audio.removeEventListener?.("loadedmetadata", onLoaded);
        audio.removeEventListener?.("error", onError);
      };
      const onLoaded = () => {
        cleanup();
        if (Number.isFinite(audio.duration) && audio.duration > 0) resolve(audio.duration);
        else reject(new Error("MP3-Dauer ist ungültig"));
      };
      const onError = () => {
        cleanup();
        reject(new Error("MP3-Datei kann im Browser nicht abgespielt werden"));
      };
      const timeout = scheduleTimeout(() => {
        cleanup();
        reject(new Error("MP3-Metadaten konnten nicht gelesen werden"));
      }, timeoutMs);

      audio.addEventListener("loadedmetadata", onLoaded, { once: true });
      audio.addEventListener("error", onError, { once: true });
      audio.load?.();
    });
  }

  global.SpeciesExplorerEditorFiles = Object.freeze({
    iucnDistributionMapUrl,
    fileToBase64,
    waitForAudioMetadata,
  });
})(globalThis);
