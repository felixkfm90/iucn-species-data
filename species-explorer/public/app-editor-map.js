(function initializeSpeciesExplorerMapEditor(global) {
  "use strict";

  function createMapEditorController(dependencies = {}) {
    const {
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
      closeEditDialog,
      loadData,
    } = dependencies;
    let mapPreviewToken = "";

const setMapMessage = (text = "", type = "") => {
  if (!mapMessage) return;
  mapMessage.textContent = text;
  mapMessage.className = `edit-message map-edit-message${type ? ` ${type}` : ""}`;
  mapMessage.hidden = !text;
};

const resetMapPreview = () => {
  mapPreviewToken = "";
  if (mapPreview) mapPreview.hidden = true;
  if (mapSaveButton) mapSaveButton.disabled = true;
  if (mapCurrentImage) mapCurrentImage.removeAttribute("src");
  if (mapNewImage) mapNewImage.removeAttribute("src");
};

const setMapBusy = (busy) => {
  if (mapPreviewButton) mapPreviewButton.disabled = busy;
  if (mapSaveButton) mapSaveButton.disabled = busy || !mapPreviewToken;
  if (mapAutoSearchButton) mapAutoSearchButton.disabled = busy;
  if (mapDeleteButton) mapDeleteButton.disabled = busy;
  if (mapFileInput) mapFileInput.disabled = busy;
  if (mapReasonInput) mapReasonInput.disabled = busy;
  if (mapSourceInput) mapSourceInput.disabled = busy;
  for (const button of closeButtons) button.disabled = busy;
};

mapBrowserLink?.addEventListener("click", () => {
  setMapMessage(
    "Die IUCN-Karte öffnet im externen Browser. Wenn dort ein Backblaze-JPEG-Link sichtbar ist, diesen Link in das Quellen-URL-Feld kopieren und danach „Karte prüfen“ wählen.",
    "info",
  );
});

mapPreviewButton?.addEventListener("click", async () => {
  resetMapPreview();
  setMapBusy(true);
  setMapMessage("Karte und Angaben werden geprüft…", "info");
  try {
    const file = mapFileInput.files?.[0];
    const source = mapSourceInput.value.trim();
    if (!file && !source) throw new Error("Bitte eine JPEG-/PNG-Datei auswählen oder einen direkten JPEG-Link einfügen");
    if (file && file.size > 20 * 1024 * 1024) throw new Error("Karten-Datei darf maximal 20 MB groß sein");
    const imageBase64 = file ? await fileToBase64(file) : "";
    const result = await fetchJson(
      `/api/species/${encodeURIComponent(species.id)}/assets/map/preview`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalName: file?.name || "",
          imageBase64,
          reason: mapReasonInput.value,
          source,
        }),
      },
    );
    mapPreviewToken = result.token;
    mapCurrentImage.hidden = !result.currentMap.exists;
    if (result.currentMap.exists) mapCurrentImage.src = result.currentMap.url;
    mapNewImage.src = result.newMap.url;
    if (typeof mapNewImage.decode === "function") await mapNewImage.decode();
    const dimensions = (entry) => entry.dimensions
      ? `${entry.dimensions.width} × ${entry.dimensions.height} px`
      : "Abmessungen unbekannt";
    mapCurrentMeta.textContent = result.currentMap.exists
      ? `${dimensions(result.currentMap)} · ${formatBytes(result.currentMap.bytes)}`
      : "Keine Karte vorhanden";
    mapNewMeta.textContent = `${dimensions(result.newMap)} · ${formatBytes(result.newMap.bytes)}`;
    mapPreview.hidden = false;
    mapSaveButton.disabled = false;
    setMapMessage(
      "Vorschau erstellt. Beim Speichern wird die Karte lokal vorgemerkt; veröffentlicht wird sie mit Änderungen übertragen.",
      "success",
    );
  } catch (error) {
    resetMapPreview();
    setMapMessage([error.message, ...(error.details || [])].join(" · "), "error");
  } finally {
    setMapBusy(false);
  }
});

mapAutoSearchButton?.addEventListener("click", async () => {
  setMapBusy(true);
  setMapMessage("Gezielter Kartensuchlauf wird vorbereitet…", "info");
  try {
    if (!state.openPipelinePreview) throw new Error("Pipeline-Steuerung ist nicht verfügbar");
    const result = await state.openPipelinePreview("manual-maps", {
      targetSlugs: [species.id],
      autoStart: true,
      silent: true,
      context: { source: "editor", section: "map", speciesId: species.id },
    });
    setMapMessage(
      result?.noWork
        ? result.message
        : "Kartensuchlauf läuft im Hintergrund. Falls eine Karte gefunden wird, öffnet sich die Prüfung automatisch.",
      result?.noWork ? "info" : "success",
    );
  } catch (error) {
    state.silentPipelineContext = null;
    setMapMessage([error.message, ...(error.details || [])].join(" · "), "error");
  } finally {
    setMapBusy(false);
  }
});

mapSaveButton?.addEventListener("click", async () => {
  if (!mapPreviewToken) return;
  setMapBusy(true);
  setMapMessage("Karte wird lokal gesichert und ersetzt…", "info");
  try {
    const result = await fetchJson(
      `/api/species/${encodeURIComponent(species.id)}/assets/map/save`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: mapPreviewToken }),
      },
    );
    state.notice = result.gitPublished
      ? `Karte gespeichert und veröffentlicht${result.gitCommit ? ` · Commit ${result.gitCommit}` : ""}.`
        + `${result.backup ? ` Sicherung: ${result.backup}.` : ""}`
        + `${result.backupCleanupWarning ? ` ${result.backupCleanupWarning}` : ""}`
      : `Karte wurde lokal gespeichert. Veröffentliche die Änderung später mit „Änderungen übertragen“. ${result.publicationError || ""}`;
    closeEditDialog();
    await loadData({ reload: true });
  } catch (error) {
    setMapMessage([error.message, ...(error.details || [])].join(" · "), "error");
    setMapBusy(false);
  }
});

    return Object.freeze({
      setMessage: setMapMessage,
      resetPreview: resetMapPreview,
      setBusy: setMapBusy,
    });
  }

  global.SpeciesExplorerMapEditor = Object.freeze({
    createMapEditorController,
  });
})(globalThis);
