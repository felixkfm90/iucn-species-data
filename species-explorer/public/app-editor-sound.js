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
      soundCurrentSpectrogram,
      soundNewSpectrogram,
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
      soundSegmentEditor,
      soundSegmentList,
      soundSegmentAddButton,
      soundSegmentPreviewButton,
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
    let soundBusy = false;
    let liveCurrentSoundAudio = currentSoundAudio;
    let liveSoundCurrentAudio = soundCurrentAudio;
    let liveSoundNewAudio = soundNewAudio;
    const currentSoundSource = liveCurrentSoundAudio?.getAttribute("src") || "";

    const stopSoundPreviewAudio = () => {
      for (const audio of [liveCurrentSoundAudio, liveSoundCurrentAudio, liveSoundNewAudio]) {
        if (!audio) continue;
        audio.pause();
        audio.currentTime = 0;
      }
    };

    const releaseCurrentSoundAudio = async () => {
      await releaseAllAudioElements();
      liveCurrentSoundAudio = form.querySelector(".current-sound-audio") || liveCurrentSoundAudio;
      liveSoundCurrentAudio = form.querySelector(".sound-preview-current") || liveSoundCurrentAudio;
      liveSoundNewAudio = form.querySelector(".sound-preview-new") || liveSoundNewAudio;
    };

    const restoreCurrentSoundAudio = () => {
      if (!liveCurrentSoundAudio || !currentSoundSource) return;
      liveCurrentSoundAudio.src = currentSoundSource;
      liveCurrentSoundAudio.load();
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
      if (soundSaveButton) {
        soundSaveButton.disabled = true;
        soundSaveButton.textContent = "Sound und Credits ersetzen";
      }
      for (const audio of [liveSoundCurrentAudio, liveSoundNewAudio]) {
        if (!audio) continue;
        audio.removeAttribute("src");
        audio.load();
      }
      for (const image of [soundCurrentSpectrogram, soundNewSpectrogram]) {
        if (!image) continue;
        image.removeAttribute("src");
        image.hidden = true;
      }
      if (soundCreditsPreview) soundCreditsPreview.replaceChildren();
    };

    const setSoundBusy = (busy) => {
      soundBusy = Boolean(busy);
      if (soundPreviewButton) soundPreviewButton.disabled = busy;
      if (soundSegmentPreviewButton) soundSegmentPreviewButton.disabled = busy;
      if (soundSegmentAddButton) soundSegmentAddButton.disabled = busy;
      if (soundSaveButton) soundSaveButton.disabled = busy || !soundPreviewToken;
      if (soundRejectCurrentButton) soundRejectCurrentButton.disabled = busy;
      if (soundAutoSearchButton) soundAutoSearchButton.disabled = busy;
      if (soundDeleteButton) soundDeleteButton.disabled = busy;
      if (soundFileInput) soundFileInput.disabled = busy;
      if (soundReasonInput) soundReasonInput.disabled = busy;
      for (const input of form.querySelectorAll(".sound-credit-input, .sound-segment-row input")) {
        input.disabled = busy;
      }
      for (const button of soundSegmentList?.querySelectorAll("button") || []) button.disabled = busy;
      for (const button of closeButtons) button.disabled = busy;
      updateSegmentRows();
    };

    const showSoundPreview = async (result, { edited = false } = {}) => {
      soundPreviewToken = result.token;
      liveSoundCurrentAudio.hidden = !result.currentSound.exists;
      if (result.currentSound.exists) liveSoundCurrentAudio.src = result.currentSound.url;
      liveSoundNewAudio.src = result.newSound.url;
      if (soundCurrentSpectrogram) {
        soundCurrentSpectrogram.hidden = !result.currentSound.spectrogramUrl;
        if (result.currentSound.spectrogramUrl) soundCurrentSpectrogram.src = result.currentSound.spectrogramUrl;
      }
      if (soundNewSpectrogram) {
        soundNewSpectrogram.hidden = !result.newSound.spectrogramUrl;
        if (result.newSound.spectrogramUrl) soundNewSpectrogram.src = result.newSound.spectrogramUrl;
      }
      const newDuration = await waitForAudioMetadata(liveSoundNewAudio);
      soundCurrentMeta.textContent = result.currentSound.exists
        ? formatBytes(result.currentSound.bytes)
        : "Kein bisheriger Sound";
      soundNewMeta.textContent = edited && result.edit
        ? `${formatBytes(result.newSound.bytes)} · ${formatTime(newDuration)} · ${result.edit.segments.length} Abschnitt(e)`
        : `${formatBytes(result.newSound.bytes)} · ${formatTime(newDuration)}`;
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
      soundSaveButton.textContent = edited ? "Schnitt übernehmen" : "Sound und Credits ersetzen";
      restoreCurrentSoundAudio();
    };

    const preferredPositionAudio = () => {
      if (liveSoundCurrentAudio && Number.isFinite(liveSoundCurrentAudio.duration) && liveSoundCurrentAudio.duration > 0) {
        return liveSoundCurrentAudio;
      }
      return liveCurrentSoundAudio;
    };

    const segmentRows = () => [...(soundSegmentList?.querySelectorAll(".sound-segment-row") || [])];

    function updateSegmentRows() {
      const rows = segmentRows();
      rows.forEach((row, index) => {
        const label = row.querySelector("strong");
        const removeButton = row.querySelector(".sound-segment-remove");
        if (label) label.textContent = `Abschnitt ${index + 1}`;
        if (removeButton) removeButton.disabled = soundBusy || rows.length === 1;
      });
    }

    const addSegmentRow = ({ start = "", end = "" } = {}) => {
      if (!soundSegmentList || segmentRows().length >= 20) return;
      const row = document.createElement("div");
      row.className = "sound-segment-row";
      row.innerHTML = `
        <strong></strong>
        <label><span>Start (Sekunden)</span><input class="sound-segment-start" type="number" min="0" step="0.01" inputmode="decimal"></label>
        <button class="sound-segment-use-start" type="button">Aktuelle Position</button>
        <label><span>Ende (Sekunden)</span><input class="sound-segment-end" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Soundende"></label>
        <button class="sound-segment-use-end" type="button">Aktuelle Position</button>
        <button class="sound-segment-remove danger" type="button">Entfernen</button>
      `;
      row.querySelector(".sound-segment-start").value = start;
      row.querySelector(".sound-segment-end").value = end;
      soundSegmentList.append(row);
      updateSegmentRows();
    };

    const initializeSegmentEnd = async () => {
      const audio = preferredPositionAudio();
      if (!soundSegmentEditor || !audio) return;
      try {
        const duration = await waitForAudioMetadata(audio);
        const endInput = soundSegmentList?.querySelector(".sound-segment-end");
        if (endInput && !endInput.value) endInput.value = duration.toFixed(2);
      } catch {
        // Die serverseitige Vorschau meldet eine nicht lesbare Sounddauer eindeutig.
      }
    };

    soundSegmentAddButton?.addEventListener("click", () => {
      const rows = segmentRows();
      const previousEnd = rows.at(-1)?.querySelector(".sound-segment-end")?.value || "";
      const audio = preferredPositionAudio();
      const start = Number.isFinite(audio?.currentTime) && audio.currentTime > 0
        ? audio.currentTime.toFixed(2)
        : previousEnd;
      const end = Number.isFinite(audio?.duration) && audio.duration > Number(start)
        ? audio.duration.toFixed(2)
        : "";
      addSegmentRow({ start, end });
      resetSoundPreview();
      setSoundMessage("Neuer Abschnitt hinzugefügt. Bitte Start und Ende festlegen.", "info");
    });

    soundSegmentList?.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      const row = button?.closest(".sound-segment-row");
      if (!button || !row) return;
      if (button.classList.contains("sound-segment-remove")) {
        if (segmentRows().length > 1) row.remove();
        updateSegmentRows();
        resetSoundPreview();
        setSoundMessage("Abschnitt entfernt. Bitte die Schnittvorschau erneut erstellen.", "info");
        return;
      }
      const audio = preferredPositionAudio();
      if (!audio || !Number.isFinite(audio.currentTime)) return;
      if (button.classList.contains("sound-segment-use-start")) {
        row.querySelector(".sound-segment-start").value = audio.currentTime.toFixed(2);
      }
      if (button.classList.contains("sound-segment-use-end")) {
        row.querySelector(".sound-segment-end").value = audio.currentTime.toFixed(2);
      }
      row.querySelector("input:focus")?.blur();
      resetSoundPreview();
      setSoundMessage("Aktuelle Abspielposition übernommen. Bitte die Schnittvorschau erstellen.", "info");
    });

    soundSegmentList?.addEventListener("focusin", (event) => {
      const input = event.target.closest(".sound-segment-start");
      if (!input) return;
      const normalizedValue = String(input.value || "").trim().replace(",", ".");
      if (normalizedValue && Number(normalizedValue) === 0) input.value = "";
    });

    soundSegmentPreviewButton?.addEventListener("click", async () => {
      resetSoundPreview();
      setSoundBusy(true);
      setSoundMessage("Schnittvorschau wird erzeugt …", "info");
      try {
        const audio = preferredPositionAudio();
        const duration = await waitForAudioMetadata(audio);
        const segments = segmentRows().map((row) => ({
          start: row.querySelector(".sound-segment-start").value,
          end: row.querySelector(".sound-segment-end").value || duration,
        }));
        await releaseCurrentSoundAudio();
        const result = await fetchJson(
          `/api/species/${encodeURIComponent(species.id)}/assets/sound/edit-preview`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ segments }),
          },
        );
        await showSoundPreview(result, { edited: true });
        setSoundMessage(
          `Schnittvorschau erstellt: ${result.edit.segments.length} Abschnitt(e), ${formatTime(result.edit.outputDuration)} Gesamtdauer.`,
          "success",
        );
      } catch (error) {
        resetSoundPreview();
        restoreCurrentSoundAudio();
        setSoundMessage([error.message, ...(error.details || [])].join(" · "), "error");
      } finally {
        setSoundBusy(false);
      }
    });

    void initializeSegmentEnd();

    soundRejectCurrentButton?.addEventListener("click", async () => {
      const shouldReject = window.confirm(
        "Aktuellen Sound entfernen und diese Quelle künftig bei der Suche überspringen?",
      );
      if (!shouldReject) return;
      resetSoundPreview();
      setSoundBusy(true);
      setSoundMessage(
        "Aktueller Sound wird lokal gesichert, entfernt, als abgelehnte Quelle gemerkt und für die spätere Übertragung vorgemerkt …",
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
      setSoundMessage("Gezielter Sound-Suchlauf wird vorbereitet …", "info");
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
      setSoundMessage("MP3 und Credits werden geprüft …", "info");
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
        await showSoundPreview(result);
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
        "Spektrogramm wird erzeugt; danach werden Sound, Credits und Spektrogramm lokal gesichert und ersetzt …",
        "info",
      );
      try {
        await releaseCurrentSoundAudio();
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
        restoreCurrentSoundAudio();
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
