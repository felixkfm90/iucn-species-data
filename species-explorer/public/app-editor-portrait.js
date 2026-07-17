(function initializeSpeciesExplorerPortraitEditor(global) {
  "use strict";

  function createPortraitEditorController(dependencies = {}) {
    const {
      species,
      state,
      closeButtons,
      portraitInstructions,
      portraitMessage,
      portraitPreview,
      portraitCurrentImage,
      portraitNewImage,
      portraitCurrentMeta,
      portraitNewMeta,
      portraitPrompt,
      portraitPromptDetails,
      portraitPromptButton,
      portraitCopyButton,
      portraitFileInput,
      portraitPreviewButton,
      portraitKeepButton,
      portraitSaveButton,
      portraitDeleteButton,
      fetchJson,
      fileToBase64,
      formatBytes,
      closeEditDialog,
      loadData,
    } = dependencies;
    let portraitPreviewToken = "";
    let portraitPromptText = "";

const setPortraitMessage = (text = "", type = "") => {
  if (!portraitMessage) return;
  portraitMessage.textContent = text;
  portraitMessage.className = `edit-message portrait-edit-message${type ? ` ${type}` : ""}`;
  portraitMessage.hidden = !text;
};

const resetPortraitPreview = () => {
  portraitPreviewToken = "";
  if (portraitPreview) portraitPreview.hidden = true;
  if (portraitSaveButton) portraitSaveButton.disabled = true;
  if (portraitCurrentImage) portraitCurrentImage.removeAttribute("src");
  if (portraitNewImage) portraitNewImage.removeAttribute("src");
};

const resetPortraitPrompt = () => {
  portraitPromptText = "";
  if (portraitPrompt) portraitPrompt.textContent = "";
  if (portraitPromptDetails) portraitPromptDetails.hidden = true;
  if (portraitCopyButton) portraitCopyButton.disabled = true;
};

const setPortraitBusy = (busy) => {
  if (portraitPromptButton) portraitPromptButton.disabled = busy;
  if (portraitCopyButton) portraitCopyButton.disabled = busy || !portraitPromptText;
  if (portraitPreviewButton) portraitPreviewButton.disabled = busy;
  if (portraitKeepButton) portraitKeepButton.disabled = busy;
  if (portraitSaveButton) portraitSaveButton.disabled = busy || !portraitPreviewToken;
  if (portraitDeleteButton) portraitDeleteButton.disabled = busy;
  if (portraitFileInput) portraitFileInput.disabled = busy;
  if (portraitInstructions) portraitInstructions.disabled = busy;
  for (const button of closeButtons) button.disabled = busy;
};

portraitKeepButton?.addEventListener("click", () => {
  resetPortraitPreview();
  if (portraitFileInput) portraitFileInput.value = "";
  setPortraitMessage("Bisheriges Artporträt bleibt unverändert.", "info");
});


portraitPromptButton?.addEventListener("click", async () => {
  resetPortraitPreview();
  setPortraitBusy(true);
  setPortraitMessage("Prompt wird lokal aus den Artdaten erstellt…", "info");
  try {
    const result = await fetchJson(
      `/api/species/${encodeURIComponent(species.id)}/assets/portrait/prompt`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          additionalInstructions: portraitInstructions?.value || "",
        }),
      },
    );
    portraitPromptText = result.prompt;
    portraitPrompt.textContent = result.prompt;
    portraitPromptDetails.hidden = false;
    portraitCopyButton.disabled = false;
    setPortraitMessage(
      `Prompt erstellt. In ChatGPT einfügen, Bild erzeugen und anschließend als ${result.fileName} herunterladen.`,
      "success",
    );
  } catch (error) {
    resetPortraitPrompt();
    setPortraitMessage([error.message, ...(error.details || [])].join(" · "), "error");
  } finally {
    setPortraitBusy(false);
  }
});

portraitCopyButton?.addEventListener("click", async () => {
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

portraitPreviewButton?.addEventListener("click", async () => {
  resetPortraitPreview();
  setPortraitBusy(true);
  setPortraitMessage(
    "Bilddatei wird geprüft und lokal in das Produktformat umgewandelt…",
    "info",
  );
  try {
    const file = portraitFileInput.files?.[0];
    if (!file) throw new Error("Bitte ein in ChatGPT erzeugtes PNG-, JPEG- oder WebP-Bild auswählen");
    if (file.size > 20 * 1024 * 1024) throw new Error("Bilddatei darf maximal 20 MB groß sein");
    const imageBase64 = await fileToBase64(file);
    const result = await fetchJson(
      `/api/species/${encodeURIComponent(species.id)}/assets/portrait/preview`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalName: file.name,
          imageBase64,
          additionalInstructions: portraitInstructions?.value || "",
        }),
      },
    );
    portraitPreviewToken = result.token;
    portraitCurrentImage.hidden = !result.currentPortrait.exists;
    if (result.currentPortrait.exists) portraitCurrentImage.src = result.currentPortrait.url;
    portraitNewImage.src = result.newPortrait.url;
    if (typeof portraitNewImage.decode === "function") await portraitNewImage.decode();
    portraitCurrentMeta.textContent = result.currentPortrait.exists
      ? formatBytes(result.currentPortrait.bytes)
      : "Kein bisheriges Artporträt";
    portraitNewMeta.textContent =
      `${result.newPortrait.size} · ${formatBytes(result.newPortrait.bytes)}`
      + ` · Quelle ${result.newPortrait.originalDimensions.width} × ${result.newPortrait.originalDimensions.height} px`;
    portraitPrompt.textContent = result.newPortrait.prompt;
    portraitPromptText = result.newPortrait.prompt;
    portraitPromptDetails.hidden = false;
    portraitCopyButton.disabled = false;
    portraitPreview.hidden = false;
    portraitSaveButton.disabled = false;
    setPortraitMessage(
      "Vorschau erstellt. Bitte Artmerkmale, Anatomie, Anzahl der Gliedmaßen und vollständige Bildränder prüfen.",
      "success",
    );
  } catch (error) {
    resetPortraitPreview();
    setPortraitMessage([error.message, ...(error.details || [])].join(" · "), "error");
  } finally {
    setPortraitBusy(false);
  }
});

portraitSaveButton?.addEventListener("click", async () => {
  if (!portraitPreviewToken) return;
  setPortraitBusy(true);
  setPortraitMessage(
    "Artporträt und Metadaten werden lokal gespeichert und gesichert…",
    "info",
  );
  try {
    const result = await fetchJson(
      `/api/species/${encodeURIComponent(species.id)}/assets/portrait/save`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: portraitPreviewToken }),
      },
    );
    state.notice = result.gitPublished
      ? `Artporträt gespeichert und veröffentlicht${result.gitCommit ? ` · Commit ${result.gitCommit}` : ""}.`
        + `${result.backup ? ` Sicherung: ${result.backup}.` : ""}`
        + `${result.backupCleanupWarning ? ` ${result.backupCleanupWarning}` : ""}`
      : `Artporträt wurde lokal gespeichert. Veröffentliche die Änderung später mit „Änderungen übertragen“. ${result.publicationError || ""}`;
    closeEditDialog();
    await loadData({ reload: true });
  } catch (error) {
    setPortraitMessage([error.message, ...(error.details || [])].join(" · "), "error");
    setPortraitBusy(false);
  }
});

    return Object.freeze({
      setMessage: setPortraitMessage,
      resetPreview: resetPortraitPreview,
      resetPrompt: resetPortraitPrompt,
      setBusy: setPortraitBusy,
    });
  }

  global.SpeciesExplorerPortraitEditor = Object.freeze({
    createPortraitEditorController,
  });
})(globalThis);
