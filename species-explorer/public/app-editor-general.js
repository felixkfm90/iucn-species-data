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

    let previewToken = "", editGeneration = 0, generalBusy = false, currentEditRevision = species.editRevision;
    const fieldLocks = new Map(), sourceEpoch = state.workspaceEpoch || 0;
    const shared = species.source === "shared-project";
    const source = shared ? "shared-project" : "local";
    const sameSource = () => (state.workspace || "local") === source && (state.workspaceEpoch || 0) === sourceEpoch;
    const editBase = shared ? `/api/shared-project/species/${encodeURIComponent(species.id)}` : `/api/species/${encodeURIComponent(species.id)}`;
    const setMessage = createMessageSetter(message);

    const resetPreview = () => {
      editGeneration++;
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
      validateFields: () => validateEditableFields(),
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
      generalBusy = busy;
      if (busy) {
        for (const input of form.querySelectorAll?.("input,select,textarea") || []) {
          if (!fieldLocks.has(input)) fieldLocks.set(input, input.disabled);
          input.disabled = true;
        }
      } else { for (const [input, disabled] of fieldLocks) input.disabled = disabled; fieldLocks.clear(); }
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
      resetPreview();
      setMessage("Eingaben geändert. Bitte die Vorschau erneut erstellen.", "info");
    };

    scientificNameUnlockButton?.addEventListener("click", async () => {
      if (shared) { setMessage("Gemeinsame Namensänderungen benötigen noch den gekoppelten Umbenennungsweg. Die vorhandene Zuordnung bleibt erhalten.", "info"); return; }
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
      if (generalBusy) return;
      resetPreview();
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
        if (!sameSource()) throw new Error("Der Artbestand wurde gewechselt. Bitte die Art im gewünschten Bestand erneut öffnen.");
        const generation = editGeneration, values = editableValues();
        setBusy(true);
        const result = await fetchJson(
          `${editBase}/preview`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ values, ...(shared ? { sourceScope: species.sourceScope, expectedEditRevision: currentEditRevision } : {}) }),
          },
        );
        if (!sameSource() || generation !== editGeneration) throw new Error("Die Eingaben oder der Artbestand wurden während der Prüfung geändert. Bitte eine neue Vorschau erstellen.");
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
          shared ? "Vorschau erstellt. Speichern merkt die Änderung für den gemeinsamen Abgleich vor."
            : "Vorschau erstellt. Beim Speichern wird zuerst eine lokale Sicherung angelegt.",
          "success",
        );
      } catch (error) {
        setMessage([error.message, ...(error.details || [])].join(" · "), "error");
      } finally {
        setBusy(false);
      }
    });

    saveButton.addEventListener("click", async () => {
      if (!previewToken || generalBusy) return;
      const generation = editGeneration;
      setBusy(true);
      setMessage(shared ? "Änderungen werden lokal für den gemeinsamen Abgleich gespeichert…" : "Änderungen werden lokal gesichert und gespeichert…", "info");
      try {
        if (!sameSource()) throw new Error("Der Artbestand wurde gewechselt. Bitte die Art im gewünschten Bestand erneut öffnen.");
        const result = await fetchJson(
          `${editBase}/save`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: previewToken }),
          },
        );
        previewToken = "";
        if (!sameSource()) { resetPreview(); return; }
        if (shared && result.species?.id === species.id && result.species?.sourceScope === species.sourceScope && typeof result.species?.editRevision === "string") {
          currentEditRevision = result.species.editRevision;
        }
        if (generation !== editGeneration) {
          resetPreview(); setMessage("Die vorherige Eingabe wurde gespeichert. Deine neue Eingabe bleibt offen; bitte eine neue Vorschau erstellen.", "info"); return;
        }
        state.notice = shared ? "Lokal vorgemerkt. Mit „Änderungen abgleichen“ an das gemeinsame Projekt senden; interne Freigabe und Websiteübernahme bleiben eigene Schritte."
          : `Gespeichert. Sicherung: ${result.backup}. `
          + backupRetentionText(result)
          + " "
          + "Die Änderung ist lokal vorgemerkt und wird mit „Änderungen übertragen“ veröffentlicht."
          + `${result.backupCleanupWarning ? ` ${result.backupCleanupWarning}` : ""}`;
        if (result.species?.id) state.selectedId = result.species.id;
        setBusy(false);
        closeEditDialog();
        await loadData({ reload: true });
      } catch (error) {
        setMessage([error.message, ...(error.details || [])].join(" · "), "error");
      } finally { setBusy(false); }
    });

    return Object.freeze({
      handleInput,
      resetForOpen,
      resetPreview,
      setMessage,
      isBusy: () => generalBusy,
    });
  }

  global.SpeciesExplorerGeneralEditor = Object.freeze({
    createGeneralEditorController,
  });
})(globalThis);
