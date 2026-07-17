(function initializeSpeciesExplorerGeneralEditor(global) {
  "use strict";

  function createGeneralEditorController(dependencies = {}) {
    const {
      species,
      state,
      form,
      preview,
      previewRows,
      message,
      previewButton,
      saveButton,
      closeButtons,
      scientificNameInput,
      scientificNameUnlockButton,
      scientificNameWarning,
      createMessageSetter,
      createFieldFeedbackController,
      createEditorFormModel,
      composeManualSexedMeasurement,
      formatManualMeasurement,
      stripManualMeasureInput,
      sizeUnits,
      weightUnits,
      ageUnits,
      showQuickConfirm,
      fetchJson,
      escapeHtml,
      backupRetentionText,
      closeEditDialog,
      loadData,
    } = dependencies;

    let previewToken = "";
    const setMessage = createMessageSetter(message);

    const resetPreview = () => {
      previewToken = "";
      preview.hidden = true;
      previewRows.replaceChildren();
      saveButton.disabled = true;
    };

    const {
      clearFieldErrors,
      applyFieldErrors,
      updateMeasurementMode,
    } = createFieldFeedbackController({
      form,
      documentRef: document,
      scope: ".manual-edit-section",
    });

    const { editableValues, validateEditableFields } = createEditorFormModel({
      form,
      scientificNameInput,
      FormDataClass: FormData,
      composeManualSexedMeasurement,
      formatManualMeasurement,
      stripManualMeasureInput,
      sizeUnits,
      weightUnits,
      ageUnits,
    });

    const setBusy = (busy) => {
      previewButton.disabled = busy;
      saveButton.disabled = busy || !previewToken;
      for (const button of closeButtons) button.disabled = busy;
    };

    const setScientificNameUnlocked = (unlocked) => {
      if (!scientificNameInput || !scientificNameUnlockButton) return;
      scientificNameInput.readOnly = !unlocked;
      scientificNameInput.dataset.unlocked = unlocked ? "true" : "false";
      scientificNameUnlockButton.textContent = unlocked ? "🔓" : "🔒";
      scientificNameUnlockButton.title = unlocked
        ? "Wissenschaftlicher Name ist entsperrt"
        : "Wissenschaftlichen Namen entsperren";
      scientificNameUnlockButton.setAttribute(
        "aria-label",
        unlocked
          ? "Wissenschaftlicher Name ist entsperrt"
          : "Wissenschaftlichen Namen entsperren",
      );
      if (scientificNameWarning) scientificNameWarning.hidden = !unlocked;
    };

    const resetScientificNameLock = () => {
      if (!scientificNameInput) return;
      scientificNameInput.value = species.scientificName;
      setScientificNameUnlocked(false);
    };

    const resetForOpen = () => {
      resetScientificNameLock();
      clearFieldErrors();
      updateMeasurementMode("size");
      updateMeasurementMode("weight");
    };

    const handleInput = () => {
      clearFieldErrors();
      resetPreview();
      setMessage("Eingaben geändert. Bitte die Vorschau erneut erstellen.", "info");
    };

    scientificNameUnlockButton?.addEventListener("click", async () => {
      const alreadyUnlocked = scientificNameInput?.dataset.unlocked === "true";
      if (alreadyUnlocked) {
        setScientificNameUnlocked(false);
        if (scientificNameInput) scientificNameInput.value = species.scientificName;
        resetPreview();
        setMessage("Wissenschaftlicher Name wurde wieder gesperrt.", "info");
        return;
      }
      const confirmed = await showQuickConfirm({
        eyebrow: "WISSENSCHAFTLICHER NAME",
        title: "URL-Slug entsperren?",
        message: "Eine Änderung des wissenschaftlichen Namens ändert den URL-Slug und kann sich direkt auf die Website auswirken.",
        confirmLabel: "Ja, entsperren",
        cancelLabel: "Nein",
        danger: true,
      });
      if (!confirmed) return;
      setScientificNameUnlocked(true);
      scientificNameInput?.focus();
      setMessage(
        "Wissenschaftlicher Name ist entsperrt. Änderungen am URL-Slug vor dem Speichern sorgfältig prüfen.",
        "info",
      );
    });

    form.elements.sizeSexed?.addEventListener("change", () => updateMeasurementMode("size"));
    form.elements.weightSexed?.addEventListener("change", () => updateMeasurementMode("weight"));

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      resetPreview();
      setBusy(true);
      setMessage("Änderungen werden geprüft…", "info");
      const fieldErrors = validateEditableFields();
      if (Object.keys(fieldErrors).length) {
        applyFieldErrors(fieldErrors);
        setMessage("Bitte die markierten Eingaben korrigieren.", "error");
        setBusy(false);
        return;
      }
      clearFieldErrors();
      try {
        const result = await fetchJson(
          `/api/species/${encodeURIComponent(species.id)}/preview`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ values: editableValues() }),
          },
        );
        previewToken = result.token;
        for (const change of result.changes) {
          const row = document.createElement("tr");
          row.innerHTML = `
            <th scope="row">${escapeHtml(change.field)}</th>
            <td>${escapeHtml(change.before)}</td>
            <td>${escapeHtml(change.after)}</td>
          `;
          previewRows.append(row);
        }
        preview.hidden = false;
        saveButton.disabled = false;
        setMessage(
          "Vorschau erstellt. Beim Speichern wird zuerst eine lokale Sicherung angelegt.",
          "success",
        );
      } catch (error) {
        setMessage([error.message, ...(error.details || [])].join(" · "), "error");
      } finally {
        setBusy(false);
      }
    });

    saveButton.addEventListener("click", async () => {
      if (!previewToken) return;
      setBusy(true);
      setMessage("Änderungen werden lokal gesichert und gespeichert…", "info");
      try {
        const result = await fetchJson(
          `/api/species/${encodeURIComponent(species.id)}/save`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: previewToken }),
          },
        );
        state.notice =
          `Gespeichert. Sicherung: ${result.backup}. `
          + backupRetentionText(result)
          + " "
          + "Die Änderung ist lokal vorgemerkt und wird mit „Änderungen übertragen“ veröffentlicht."
          + `${result.backupCleanupWarning ? ` ${result.backupCleanupWarning}` : ""}`;
        if (result.species?.id) state.selectedId = result.species.id;
        closeEditDialog();
        await loadData({ reload: true });
      } catch (error) {
        setMessage([error.message, ...(error.details || [])].join(" · "), "error");
        setBusy(false);
      }
    });

    return Object.freeze({
      handleInput,
      resetForOpen,
      resetPreview,
      setMessage,
    });
  }

  global.SpeciesExplorerGeneralEditor = Object.freeze({
    createGeneralEditorController,
  });
})(globalThis);
