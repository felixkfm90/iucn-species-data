(function initializeSpeciesExplorerSoundEditor(global) {
  "use strict";

  function createSoundEditorController(dependencies = {}) {
    const {
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
      closeEditDialog,
      loadData,
    } = dependencies;
    let soundPreviewToken = "";

const stopSoundPreviewAudio = () => {
  for (const audio of [currentSoundAudio, soundCurrentAudio, soundNewAudio]) {
    if (!audio) continue;
    audio.pause();
    audio.currentTime = 0;
  }
};

const releaseCurrentSoundAudio = async () => {
  await releaseAllAudioElements();
};

const setSoundMessage = (text = "", type = "") => {
  if (!soundMessage) return;
  soundMessage.textContent = text;
  soundMessage.className = `edit-message sound-edit-message${type ? ` ${type}` : ""}`;
  soundMessage.hidden = !text;
};

const resetSoundPreview = () => {
  soundPreviewToken = "";
  stopSoundPreviewAudio();
  if (soundPreview) soundPreview.hidden = true;
  if (soundSaveButton) soundSaveButton.disabled = true;
  for (const audio of [soundCurrentAudio, soundNewAudio]) {
    if (!audio) continue;
    audio.removeAttribute("src");
    audio.load();
  }
  if (soundCreditsPreview) soundCreditsPreview.replaceChildren();
};

const setSoundBusy = (busy) => {
  if (soundPreviewButton) soundPreviewButton.disabled = busy;
  if (soundSaveButton) soundSaveButton.disabled = busy || !soundPreviewToken;
  if (soundRejectCurrentButton) soundRejectCurrentButton.disabled = busy;
  if (soundAutoSearchButton) soundAutoSearchButton.disabled = busy;
  if (soundDeleteButton) soundDeleteButton.disabled = busy;
  if (soundFileInput) soundFileInput.disabled = busy;
  if (soundReasonInput) soundReasonInput.disabled = busy;
  for (const input of form.querySelectorAll(".sound-credit-input")) input.disabled = busy;
  for (const button of closeButtons) button.disabled = busy;
};

soundRejectCurrentButton?.addEventListener("click", async () => {
  const shouldReject = window.confirm(
    "Aktuellen Sound entfernen und diese Quelle künftig bei der Suche überspringen?",
  );
  if (!shouldReject) return;
  resetSoundPreview();
  setSoundBusy(true);
  setSoundMessage(
    "Aktueller Sound wird lokal gesichert, entfernt, als abgelehnte Quelle gemerkt und für die spätere Übertragung vorgemerkt…",
    "info",
  );
  try {
    await releaseCurrentSoundAudio();
    const result = await fetchJson(
      `/api/species/${encodeURIComponent(species.id)}/assets/sound/reject`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    state.notice = result.gitPublished
      ? `Soundquelle abgelehnt und veröffentlicht${result.gitCommit ? ` · Commit ${result.gitCommit}` : ""}.`
        + `${result.backup ? ` Sicherung: ${result.backup}.` : ""}`
        + ` Gesperrte Quelle: ${result.rejectedSource?.source || "Unbekannt"}.`
        + `${result.backupCleanupWarning ? ` ${result.backupCleanupWarning}` : ""}`
      : `Soundquelle wurde lokal abgelehnt. Veröffentliche die Änderung später mit „Änderungen übertragen“. ${result.publicationError || ""}`;
    stopSoundPreviewAudio();
    state.reloadAfterEditClose = true;
    setSoundMessage("Aktueller Sound wurde abgelehnt. Neuer Sound wird gesucht …", "info");
    if (!state.openPipelinePreview) throw new Error("Pipeline-Steuerung ist nicht verfügbar");
    await state.openPipelinePreview("nc-sounds", {
      targetSlugs: [species.id],
      autoStart: true,
      silent: true,
      context: {
        source: "editor",
        section: "sound",
        speciesId: species.id,
        hasCurrentSound: species.assets?.sound?.exists === true,
      },
    });
  } catch (error) {
    state.silentPipelineContext = null;
    setSoundMessage([error.message, ...(error.details || [])].join(" · "), "error");
  } finally {
    setSoundBusy(false);
  }
});

soundAutoSearchButton?.addEventListener("click", async () => {
  resetSoundPreview();
  setSoundBusy(true);
  setSoundMessage("Gezielter Sound-Suchlauf wird vorbereitet…", "info");
  try {
    await releaseCurrentSoundAudio();
    if (!state.openPipelinePreview) throw new Error("Pipeline-Steuerung ist nicht verfügbar");
    const result = await state.openPipelinePreview("nc-sounds", {
      targetSlugs: [species.id],
      autoStart: true,
      silent: true,
      context: {
        source: "editor",
        section: "sound",
        speciesId: species.id,
        hasCurrentSound: species.assets?.sound?.exists === true,
      },
    });
    setSoundMessage(
      result?.noWork
        ? result.message
        : "Sound-Suchlauf läuft im Hintergrund. Falls ein Sound gefunden wird, öffnet sich die Prüfung automatisch.",
      result?.noWork ? "info" : "success",
    );
  } catch (error) {
    state.silentPipelineContext = null;
    setSoundMessage([error.message, ...(error.details || [])].join(" · "), "error");
  } finally {
    setSoundBusy(false);
  }
});

soundPreviewButton?.addEventListener("click", async () => {
  resetSoundPreview();
  setSoundBusy(true);
  setSoundMessage("MP3 und Credits werden geprüft…", "info");
  try {
    const file = soundFileInput.files?.[0];
    if (!file) throw new Error("Bitte eine MP3-Datei auswählen");
    if (file.size > 50 * 1024 * 1024) throw new Error("MP3-Datei darf maximal 50 MB groß sein");
    const audioBase64 = await fileToBase64(file);
    const formData = new FormData(form);
    const result = await fetchJson(
      `/api/species/${encodeURIComponent(species.id)}/assets/sound/preview`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalName: file.name,
          audioBase64,
          reason: soundReasonInput.value,
          credits: {
            recordist: formData.get("soundRecordist"),
            source: formData.get("soundSource"),
            url: formData.get("soundUrl"),
            license: formData.get("soundLicense"),
            country: formData.get("soundCountry"),
            location: formData.get("soundLocation"),
            quality: formData.get("soundQuality"),
            notes: formData.get("soundNotes"),
          },
        }),
      },
    );
    soundPreviewToken = result.token;
    soundCurrentAudio.hidden = !result.currentSound.exists;
    if (result.currentSound.exists) soundCurrentAudio.src = result.currentSound.url;
    soundNewAudio.src = result.newSound.url;
    const newDuration = await waitForAudioMetadata(soundNewAudio);
    soundCurrentMeta.textContent = result.currentSound.exists
      ? formatBytes(result.currentSound.bytes)
      : "Kein bisheriger Sound";
    soundNewMeta.textContent = `${formatBytes(result.newSound.bytes)} · ${formatTime(newDuration)}`;
    const credits = result.newSound.credits;
    soundCreditsPreview.innerHTML = dataRows([
      ["Wissenschaftlicher Name", credits.scientific_name],
      ["Deutscher Name", credits.german_name],
      ["Aufnahme/Urheber", credits.recordist],
      ["Quelle", credits.source],
      ["Original-URL", credits.url],
      ["Lizenz", credits.license],
      ["Land", credits.country || "Nicht angegeben"],
      ["Ort", credits.location || "Nicht angegeben"],
      ["Qualität", credits.quality || "Nicht angegeben"],
    ]);
    soundLicenseState.textContent = result.newSound.isNc
      ? "NC-Lizenz · intern prüfen"
      : "Nicht als NC erkannt · Lizenz trotzdem prüfen";
    soundLicenseState.className = `sound-license-state${result.newSound.isNc ? " warning" : ""}`;
    soundPreview.hidden = false;
    soundSaveButton.disabled = false;
    setSoundMessage(
      "Vorschau erstellt. Beim Speichern wird zuerst das neue Spektrogramm erzeugt und anschließend das bisherige Soundpaket gesichert.",
      "success",
    );
  } catch (error) {
    resetSoundPreview();
    setSoundMessage([error.message, ...(error.details || [])].join(" · "), "error");
  } finally {
    setSoundBusy(false);
  }
});

soundSaveButton?.addEventListener("click", async () => {
  if (!soundPreviewToken) return;
  setSoundBusy(true);
  setSoundMessage(
    "Spektrogramm wird erzeugt; danach werden Sound, Credits und Spektrogramm lokal gesichert und ersetzt…",
    "info",
  );
  try {
    const result = await fetchJson(
      `/api/species/${encodeURIComponent(species.id)}/assets/sound/save`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: soundPreviewToken }),
      },
    );
    state.notice = result.gitPublished
      ? `Sound und Credits gespeichert und veröffentlicht${result.gitCommit ? ` · Commit ${result.gitCommit}` : ""}.`
        + `${result.backup ? ` Sicherung: ${result.backup}.` : ""}`
        + ` Das neue Spektrogramm wurde automatisch erzeugt${result.spectrogramBytes ? ` (${formatBytes(result.spectrogramBytes)})` : ""}`
        + " und per Soundhash verknüpft."
        + `${result.backupCleanupWarning ? ` ${result.backupCleanupWarning}` : ""}`
      : `Sound und Credits wurden lokal gespeichert. Veröffentliche die Änderung später mit „Änderungen übertragen“. ${result.publicationError || ""}`;
    stopSoundPreviewAudio();
    closeEditDialog();
    await loadData({ reload: true });
  } catch (error) {
    setSoundMessage([error.message, ...(error.details || [])].join(" · "), "error");
    setSoundBusy(false);
  }
});

    return Object.freeze({
      setMessage: setSoundMessage,
      resetPreview: resetSoundPreview,
      setBusy: setSoundBusy,
      stopPreviewAudio: stopSoundPreviewAudio,
      releaseCurrentAudio: releaseCurrentSoundAudio,
    });
  }

  global.SpeciesExplorerSoundEditor = Object.freeze({
    createSoundEditorController,
  });
})(globalThis);
