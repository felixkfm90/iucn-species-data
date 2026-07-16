(function initializeSpeciesExplorerAssetMaintenance(global) {
  "use strict";

  const ASSET_PRESENTATIONS = Object.freeze({
    map: Object.freeze({
      label: "Verbreitungskarte",
      deleteConfirm:
        "Verbreitungskarte dauerhaft löschen? Die Karte wird lokal gesichert, danach fehlt sie bis zur nächsten automatischen Suche oder manuellen Übernahme.",
    }),
    portrait: Object.freeze({
      label: "Artporträt",
      deleteConfirm:
        "Artporträt dauerhaft löschen? Das Porträt wird lokal gesichert, danach fehlt es bis zum nächsten manuellen Import.",
    }),
    sound: Object.freeze({
      label: "Soundpaket",
      deleteConfirm:
        "Sound, Credits und Spektrogramm dauerhaft löschen? Das Paket wird lokal gesichert, danach fehlt die Tierstimme bis zur nächsten Suche oder manuellen Übernahme.",
    }),
  });

  function assetMaintenancePresentation(assetType) {
    return ASSET_PRESENTATIONS[assetType] || null;
  }

  function deletedAssetNotice(result = {}, presentation = {}) {
    const label = result.label || presentation.label || "Asset";
    return (
      `${label} wurde gelöscht.`
      + (result.backup ? ` Sicherung: ${result.backup}.` : "")
      + " Die Änderung ist lokal vorgemerkt und wird mit „Änderungen übertragen“ veröffentlicht."
      + (result.backupCleanupWarning ? ` ${result.backupCleanupWarning}` : "")
    );
  }

  function restoredAssetNotice(result = {}, presentation = {}) {
    const label = presentation.label || result.label || "Asset";
    return (
      `${label} wurde aus der lokalen Sicherung wiederhergestellt.`
      + (result.backup ? ` Sicherung: ${result.backup}.` : "")
      + " Die Änderung ist lokal vorgemerkt und wird mit „Änderungen übertragen“ veröffentlicht."
    );
  }

  function errorText(error) {
    return [error?.message || String(error), ...(error?.details || [])].join(" · ");
  }

  function createAssetMaintenanceController({
    state,
    species,
    sections,
    fetchJson,
    loadData,
    releaseCurrentSoundAudio,
    closeEditor,
    confirmAction = (message) => global.confirm(message),
  } = {}) {
    if (!state || !species?.id || !sections) {
      throw new TypeError("Asset-Wartung benötigt Zustand, Art und Bereichskonfiguration.");
    }
    for (const [name, dependency] of Object.entries({
      fetchJson,
      loadData,
      releaseCurrentSoundAudio,
      closeEditor,
      confirmAction,
    })) {
      if (typeof dependency !== "function") {
        throw new TypeError(`Asset-Wartung benötigt die Funktion ${name}.`);
      }
    }

    function configuredSection(assetType) {
      const presentation = assetMaintenancePresentation(assetType);
      const section = sections[assetType];
      if (!presentation || !section) return null;
      for (const method of ["message", "busy", "reset"]) {
        if (typeof section[method] !== "function") {
          throw new TypeError(`Asset-Wartung benötigt ${assetType}.${method}.`);
        }
      }
      return { presentation, section };
    }

    async function releaseAssetMedia(assetType) {
      if (assetType === "map") {
        state.mapCleanup?.();
        state.mapCleanup = null;
      }
      if (assetType === "portrait") {
        state.portraitCleanup?.();
        state.portraitCleanup = null;
      }
      if (assetType === "sound") await releaseCurrentSoundAudio();
    }

    async function deleteAsset(assetType) {
      const configured = configuredSection(assetType);
      if (!configured) return false;
      const { presentation, section } = configured;
      if (!confirmAction(presentation.deleteConfirm)) return false;
      section.reset();
      section.busy(true);
      section.message(`${presentation.label} wird lokal gesichert und gelöscht …`, "info");
      try {
        await releaseAssetMedia(assetType);
        const confirmation = await fetchJson(
          `/api/species/${encodeURIComponent(species.id)}/assets/${assetType}/delete-preview`,
          { method: "POST", body: "{}" },
        );
        const result = await fetchJson(
          `/api/species/${encodeURIComponent(species.id)}/assets/${assetType}/delete`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: confirmation.token }),
          },
        );
        state.notice = deletedAssetNotice(result, presentation);
        closeEditor();
        await loadData({ reload: true });
        return true;
      } catch (error) {
        section.message(errorText(error), "error");
        section.busy(false);
        return false;
      }
    }

    async function restoreAsset(assetType) {
      const configured = configuredSection(assetType);
      if (!configured) return false;
      const { presentation, section } = configured;
      if (!confirmAction(`${presentation.label} aus der letzten lokalen Sicherung wiederherstellen?`)) {
        return false;
      }
      section.reset();
      section.busy(true);
      section.message(
        `${presentation.label} wird aus der letzten lokalen Sicherung wiederhergestellt …`,
        "info",
      );
      try {
        await releaseAssetMedia(assetType);
        const confirmation = await fetchJson(
          `/api/species/${encodeURIComponent(species.id)}/assets/${assetType}/restore-preview`,
          { method: "POST", body: "{}" },
        );
        const result = await fetchJson(
          `/api/species/${encodeURIComponent(species.id)}/assets/${assetType}/restore`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: confirmation.token }),
          },
        );
        state.notice = restoredAssetNotice(result, presentation);
        closeEditor();
        await loadData({ reload: true });
        return true;
      } catch (error) {
        section.message(errorText(error), "error");
        section.busy(false);
        return false;
      }
    }

    function bind() {
      for (const assetType of Object.keys(ASSET_PRESENTATIONS)) {
        const section = sections[assetType];
        section?.deleteButton?.addEventListener("click", () => void deleteAsset(assetType));
        section?.restoreButton?.addEventListener("click", () => void restoreAsset(assetType));
      }
    }

    return Object.freeze({ bind, deleteAsset, restoreAsset });
  }

  global.SpeciesExplorerAssetMaintenance = Object.freeze({
    assetMaintenancePresentation,
    deletedAssetNotice,
    restoredAssetNotice,
    createAssetMaintenanceController,
  });
})(globalThis);
