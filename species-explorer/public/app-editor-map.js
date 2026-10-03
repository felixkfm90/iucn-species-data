(function initializeSpeciesExplorerMapEditor(global) {
  "use strict";

  function createMapEditorController(dependencies = {}) {
    const {
      species,
      state,
      closeButtons,
      mapFileInput,
      mapDropZone,
      mapFileStatus,
      mapReasonInput,
      mapSourceInput,
      mapCareModeInput,
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
    let selectedFile = null;
    let busy = false;
    let previewRevision = 0;

const setMapMessage = (text = "", type = "") => {
  if (!mapMessage) return;
  mapMessage.textContent = text;
  mapMessage.className = `edit-message map-edit-message${type ? ` ${type}` : ""}`;
  mapMessage.hidden = !text;
};

const resetMapPreview = () => {
  previewRevision += 1;
  mapPreviewToken = "";
  if (mapPreview) mapPreview.hidden = true;
  if (mapSaveButton) mapSaveButton.disabled = true;
  if (mapCurrentImage) mapCurrentImage.removeAttribute("src");
  if (mapNewImage) mapNewImage.removeAttribute("src");
};

const setMapBusy = (value) => {
  busy = value;
  mapDropZone?.setAttribute("aria-busy", String(value));
  if (mapPreviewButton) mapPreviewButton.disabled = busy;
  if (mapSaveButton) mapSaveButton.disabled = busy || !mapPreviewToken;
  if (mapAutoSearchButton) mapAutoSearchButton.disabled = busy;
  if (mapDeleteButton) mapDeleteButton.disabled = busy;
  if (mapFileInput) mapFileInput.disabled = busy;
  if (mapReasonInput) mapReasonInput.disabled = busy;
  if (mapSourceInput) mapSourceInput.disabled = busy;
  if (mapCareModeInput) mapCareModeInput.disabled = busy;
  for (const button of closeButtons) button.disabled = busy;
};

function resetSelection() {
  selectedFile = null;
  if (mapFileInput) mapFileInput.value = "";
  if (mapFileStatus) mapFileStatus.textContent = "Noch keine Datei ausgewählt.";
  resetMapPreview();
}

mapBrowserLink?.addEventListener("click", () => {
  if (!busy) {
    mapSourceInput.value = mapBrowserLink.href;
    resetMapPreview();
  }
  setMapMessage(
    "Im Browser die Karte mit Rechtsklick → „Bild speichern unter …“ speichern. Danach die gespeicherte JPEG-/PNG-Datei hier hineinziehen oder auswählen. Prüfung und Vorschau starten automatisch; gespeichert wird erst mit „Karte ersetzen“.",
    "info",
  );
});

async function previewMap() {
  if (busy) return;
  resetMapPreview();
  const revision = previewRevision;
  setMapBusy(true);
  setMapMessage("Karte und Angaben werden geprüft…", "info");
  try {
    const file = selectedFile;
    const source = mapSourceInput.value.trim();
    if (!file && !source) throw new Error("Bitte eine JPEG-/PNG-Datei auswählen oder einen direkten JPEG-Link einfügen");
    if (file && file.size > 20 * 1024 * 1024) throw new Error("Karten-Datei darf maximal 20 MB groß sein");
    const imageBase64 = file ? await fileToBase64(file) : "";
    if (revision !== previewRevision) return;
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
          careMode: mapCareModeInput?.value || "manual",
        }),
      },
    );
    if (revision !== previewRevision) return;
    mapCurrentImage.hidden = !result.currentMap.exists;
    if (result.currentMap.exists) mapCurrentImage.src = result.currentMap.url;
    mapNewImage.src = result.newMap.url;
    if (typeof mapNewImage.decode === "function") await mapNewImage.decode();
    if (revision !== previewRevision) return;
    mapPreviewToken = result.token;
    const dimensions = (entry) => entry.dimensions
      ? `${entry.dimensions.width} × ${entry.dimensions.height} px`
      : "Abmessungen unbekannt";
    mapCurrentMeta.textContent = result.currentMap.exists
      ? `${dimensions(result.currentMap)} · ${formatBytes(result.currentMap.bytes)}`
      : "Keine Karte vorhanden";
    mapNewMeta.textContent = `${file ? `${file.name} · ` : ""}${dimensions(result.newMap)} · ${formatBytes(result.newMap.bytes)}`;
    mapPreview.hidden = false;
    mapSaveButton.disabled = false;
    setMapMessage(
      "Vorschau erstellt. Beim Speichern wird die Karte lokal vorgemerkt; veröffentlicht wird sie mit Änderungen übertragen.",
      "success",
    );
  } catch (error) {
    if (revision !== previewRevision) return;
    resetMapPreview();
    setMapMessage([error.message, ...(error.details || [])].join(" · "), "error");
  } finally {
    setMapBusy(false);
  }
}

mapPreviewButton?.addEventListener("click", previewMap);

async function acceptFiles(files) {
  if (busy) return;
  resetSelection();
  try {
    if (files.length !== 1) throw new Error("Bitte genau eine gespeicherte Karten-Datei auswählen; keine Links oder Ordner.");
    const file = files[0];
    if (!/\.(jpe?g|png)$/i.test(file.name)) throw new Error("Bitte eine JPEG-/PNG-Datei auswählen, keine Webseite oder Verknüpfung.");
    if (!file.size) throw new Error("Die Karten-Datei ist leer.");
    if (file.size > 20 * 1024 * 1024) throw new Error("Karten-Datei darf maximal 20 MB groß sein");
    const assessment = file.name.match(/^T\d+A(\d+)(?:\s*\(\d+\))?\.(?:jpe?g|png)$/i)?.[1];
    const expected = String(species.iucn?.assessmentId ?? "").trim();
    if (assessment && /^\d+$/.test(expected) && assessment !== expected) {
      throw new Error(`Diese IUCN-Datei gehört zu einer anderen Bewertung (${assessment}), nicht zur ausgewählten Art ${species.germanName} (${expected}). Bitte die passende Karte auswählen.`);
    }
    selectedFile = file;
    if (mapFileStatus) mapFileStatus.textContent = `${file.name} · ${formatBytes(file.size)}`;
    if (!mapReasonInput.value.trim()) mapReasonInput.value = "Karte als lokale Datei importiert.";
    if (assessment === expected && (!mapSourceInput.value.trim()
      || mapSourceInput.value === (species.assets?.map?.source || ""))) {
      mapSourceInput.value = `https://www.iucnredlist.org/api/v4/assessments/${expected}/distribution_map/jpg`;
    }
    await previewMap();
  } catch (error) {
    setMapMessage(error.message, "error");
  }
}

mapFileInput?.addEventListener("change", () => {
  const files = Array.from(mapFileInput.files || []);
  if (!files.length) { resetSelection(); return; }
  return acceptFiles(files);
});
mapDropZone?.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = busy ? "none" : "copy";
  mapDropZone.classList.toggle("is-dragging", !busy);
});
mapDropZone?.addEventListener("dragleave", () => mapDropZone.classList.remove("is-dragging"));
mapDropZone?.addEventListener("drop", (event) => {
  event.preventDefault();
  event.stopPropagation();
  mapDropZone.classList.remove("is-dragging");
  return acceptFiles(Array.from(event.dataTransfer?.files || []));
});

for (const input of [mapReasonInput, mapSourceInput, mapCareModeInput]) {
  input?.addEventListener("input", () => {
    resetMapPreview();
    setMapMessage("Angaben geändert. Bitte mit „Karte prüfen“ die Vorschau erneuern.", "info");
  });
}
mapCareModeInput?.addEventListener("change", () => {
  resetMapPreview();
  setMapMessage("Pflegewahl geändert. Bitte mit „Karte prüfen“ die Vorschau erneuern.", "info");
});

mapAutoSearchButton?.addEventListener("click", async () => {
  if (busy) return;
  resetMapPreview();
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
  if (!mapPreviewToken || busy) return;
  setMapBusy(true);
  setMapMessage("Karte wird lokal gesichert und ersetzt…", "info");
  try {
    const result = await fetchJson(
      `/api/species/${encodeURIComponent(species.id)}/assets/map/save`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: mapPreviewToken,
          ...(mapCareModeInput ? { careMode: mapCareModeInput.value || "manual" } : {}),
        }),
      },
    );
    state.notice = result.gitPublished
      ? `Karte gespeichert und veröffentlicht${result.gitCommit ? ` · Commit ${result.gitCommit}` : ""}.`
        + `${result.backup ? ` Sicherung: ${result.backup}.` : ""}`
        + `${result.backupCleanupWarning ? ` ${result.backupCleanupWarning}` : ""}`
      : `Karte wurde lokal gespeichert. Veröffentliche die Änderung später mit „Änderungen übertragen“. ${result.publicationError || ""}`;
    setMapBusy(false);
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
      resetSelection,
      isBusy: () => busy,
      setBusy: setMapBusy,
    });
  }

  global.SpeciesExplorerMapEditor = Object.freeze({
    createMapEditorController,
  });
})(globalThis);
