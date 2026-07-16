(function initializeSpeciesExplorerSpeciesActions(global) {
  "use strict";

  function refreshConfirmation(species = {}) {
    const germanName = String(species.germanName || "diese Art");
    return Object.freeze({
      eyebrow: "Art aktualisieren",
      title: "Automatische Aktualisierung",
      message: `Automatische Aktualisierung für ${germanName} wirklich ausführen?`,
      confirmLabel: "Ja, aktualisieren",
      cancelLabel: "Abbrechen",
    });
  }

  function deleteModePresentation(permanent) {
    return Object.freeze(permanent
      ? {
          confirmLabel: "Art und Daten dauerhaft löschen",
          warning:
            "Dauerhaft: Generierte Daten, Assetordner und zugehörige Pflegeinformationen "
            + "werden sofort gelöscht und sind nicht wiederherstellbar.",
          danger: true,
        }
      : {
          confirmLabel: "Aus Artenliste entfernen",
          warning:
            "Ohne Auswahl bleiben generierte Daten und Assets bis zum separaten Bereinigungslauf bestehen.",
          danger: false,
        });
  }

  function deleteSuccessNotice(result = {}, backupRetentionText = () => "") {
    const deletedName = result.deleted?.germanName || "Die Art";
    return (
      (result.inputEntryRemoved
        ? `${deletedName} wurde aus der Eingabeliste entfernt.`
        : `${deletedName} war bereits aus der Eingabeliste entfernt.`)
      + (result.backup ? ` Sicherung: ${result.backup}.` : "")
      + backupRetentionText(result)
      + (result.permanentCleanup
        ? " Generierte Daten und Assetordner wurden dauerhaft gelöscht."
        : ` Assetordner bleibt erhalten: ${result.assetDirectoryPreserved}.`)
      + (result.pipelineRequired
        ? " Ein Pipeline- oder Bereinigungslauf entfernt die Art aus den generierten Daten."
        : "")
    );
  }

  function createSpeciesActionsController({
    state,
    elements,
    fetchJson,
    showQuickConfirm,
    createDialogController,
    escapeHtml,
    backupRetentionText,
    releaseDetailMedia,
    loadData,
    delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {}) {
    if (!state || !elements?.detailPanel) {
      throw new TypeError("Artaktionen benötigen Zustand und Detailbereich.");
    }
    for (const [name, dependency] of Object.entries({
      fetchJson,
      showQuickConfirm,
      createDialogController,
      escapeHtml,
      backupRetentionText,
      releaseDetailMedia,
      loadData,
      delay,
    })) {
      if (typeof dependency !== "function") {
        throw new TypeError(`Artaktionen benötigen die Funktion ${name}.`);
      }
    }

    function setupSpeciesRefresh(species) {
      const openButton = elements.detailPanel.querySelector(".refresh-species-open");
      if (!openButton) return null;
      const onRefresh = async () => {
        if (!state.openPipelinePreview) return;
        const confirmed = await showQuickConfirm(refreshConfirmation(species));
        if (!confirmed) return;
        openButton.disabled = true;
        try {
          const result = await state.openPipelinePreview("all", {
            targetSlugs: [species.id],
            silent: true,
            speciesRefresh: true,
          });
          if (result?.noWork) {
            await showQuickConfirm({
              title: "Keine Aktualisierung gestartet",
              message: result.message,
              confirmLabel: "OK",
              cancelLabel: "",
            });
          }
        } catch (error) {
          await showQuickConfirm({
            title: "Aktualisierung konnte nicht gestartet werden",
            message: error.message,
            confirmLabel: "OK",
            cancelLabel: "",
          });
        } finally {
          openButton.disabled = false;
        }
      };
      openButton.addEventListener("click", onRefresh);
      return Object.freeze({ openButton, onRefresh });
    }

    function setupSpeciesDelete(species) {
      const dialog = elements.detailPanel.querySelector(".delete-dialog");
      const openButton = elements.detailPanel.querySelector(".delete-species-open");
      const form = elements.detailPanel.querySelector(".delete-form");
      const message = elements.detailPanel.querySelector(".delete-message");
      const effects = elements.detailPanel.querySelector(".delete-effects");
      const deleteAssetsOption = elements.detailPanel.querySelector(".delete-assets-now");
      const deleteWarning = elements.detailPanel.querySelector(".delete-assets-warning");
      const confirmButton = elements.detailPanel.querySelector(".delete-confirm");
      const cancelButtons = [...elements.detailPanel.querySelectorAll(".delete-cancel")];
      if (
        !dialog
        || !openButton
        || !form
        || !message
        || !effects
        || !deleteAssetsOption
        || !deleteWarning
        || !confirmButton
      ) return null;
      let previewToken = "";

      const setMessage = (text = "", type = "") => {
        message.textContent = text;
        message.className = `edit-message delete-message${type ? ` ${type}` : ""}`;
        message.hidden = !text;
      };
      const dialogController = createDialogController({ dialog, closeButtons: cancelButtons });
      const close = () => dialogController.close("programmatic");
      const updateDeleteMode = () => {
        const presentation = deleteModePresentation(deleteAssetsOption.checked);
        confirmButton.textContent = presentation.confirmLabel;
        deleteWarning.textContent = presentation.warning;
        deleteWarning.classList.toggle("danger", presentation.danger);
      };

      const openPreview = async () => {
        previewToken = "";
        deleteAssetsOption.checked = false;
        updateDeleteMode();
        confirmButton.disabled = true;
        effects.replaceChildren();
        setMessage("Auswirkungen werden geprüft…", "info");
        dialogController.open();
        try {
          const result = await fetchJson(
            `/api/species/${encodeURIComponent(species.id)}/delete/preview`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            },
          );
          previewToken = result.token;
          effects.innerHTML = `<ul>${result.effects.map((effect) => `<li>${escapeHtml(effect)}</li>`).join("")}</ul>`;
          if (result.requiresAssetDeletion) {
            deleteAssetsOption.checked = true;
            deleteAssetsOption.disabled = true;
          } else {
            deleteAssetsOption.disabled = !result.assetDirectoryExists && !species.inGenerated;
          }
          updateDeleteMode();
          confirmButton.disabled = false;
          setMessage("Löschvorschau ist bereit.", "success");
        } catch (error) {
          setMessage([error.message, ...(error.details || [])].join(" · "), "error");
        }
      };

      const saveDeletion = async (event) => {
        event.preventDefault();
        if (!previewToken) return;
        const deleteAssets = deleteAssetsOption.checked;
        releaseDetailMedia();
        if (deleteAssets) await delay(800);
        confirmButton.disabled = true;
        setMessage(
          deleteAssets
            ? "Art, generierte Daten und Assets werden dauerhaft gelöscht…"
            : "Art wird aus der Eingabeliste entfernt…",
          "info",
        );
        try {
          const result = await fetchJson(
            `/api/species/${encodeURIComponent(species.id)}/delete/save`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: previewToken, deleteAssets }),
            },
          );
          state.notice = deleteSuccessNotice(result, backupRetentionText);
          state.selectedId = "";
          close();
          await loadData();
        } catch (error) {
          setMessage([error.message, ...(error.details || [])].join(" · "), "error");
          confirmButton.disabled = false;
        }
      };

      openButton.addEventListener("click", openPreview);
      deleteAssetsOption.addEventListener("change", updateDeleteMode);
      form.addEventListener("submit", saveDeletion);
      return Object.freeze({
        openButton,
        openPreview,
        saveDeletion,
        updateDeleteMode,
      });
    }

    return Object.freeze({ setupSpeciesRefresh, setupSpeciesDelete });
  }

  global.SpeciesExplorerSpeciesActions = Object.freeze({
    refreshConfirmation,
    deleteModePresentation,
    deleteSuccessNotice,
    createSpeciesActionsController,
  });
})(globalThis);
