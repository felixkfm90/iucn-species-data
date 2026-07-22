(function initializeSpeciesExplorerTaxonomyEditor(global) {
  "use strict";

  function createTaxonomyEditorController(dependencies = {}) {
    const {
      species,
      state,
      fields,
      reasonInput,
      message,
      preview,
      previewRows,
      previewButton,
      saveButton,
      restoreButton,
      closeButtons,
      fetchJson,
      escapeHtml,
      backupRetentionText,
      closeEditDialog,
      loadData,
    } = dependencies;
    let previewToken = "";

    function setMessage(text = "", type = "") {
      if (!message) return;
      message.textContent = text;
      message.className = `edit-message taxonomy-edit-message${type ? ` ${type}` : ""}`;
      message.hidden = !text;
    }

    function setBusy(busy) {
      for (const field of fields ?? []) field.disabled = busy;
      if (reasonInput) reasonInput.disabled = busy;
      if (previewButton) previewButton.disabled = busy;
      if (restoreButton) restoreButton.disabled = busy;
      if (saveButton) saveButton.disabled = busy || !previewToken;
      for (const button of closeButtons ?? []) button.disabled = busy;
    }

    function resetPreview() {
      previewToken = "";
      if (preview) preview.hidden = true;
      if (previewRows) previewRows.replaceChildren();
      if (saveButton) saveButton.disabled = true;
    }

    function values() {
      return Object.fromEntries((fields ?? []).map((field) => [field.dataset.taxonomyField, field.value]));
    }

    function renderResult(result) {
      previewToken = result.token;
      previewRows.innerHTML = result.changes.length
        ? result.changes.map((change) => `
            <tr>
              <td>${escapeHtml(change.label)}</td>
              <td>${escapeHtml(change.before)}</td>
              <td>${escapeHtml(change.after)}</td>
            </tr>
          `).join("")
        : '<tr><td colspan="3">Der manuelle Schutz wird entfernt; die zuletzt gelieferten automatischen Werte bleiben bestehen.</td></tr>';
      preview.hidden = false;
      saveButton.disabled = false;
      setMessage(
        result.restoreAutomatic
          ? "Automatische Taxonomiewerte sind zur Wiederherstellung bereit."
          : "Taxonomieangaben sind geprüft und können gespeichert werden.",
        "success",
      );
    }

    async function createPreview({ restoreAutomatic = false } = {}) {
      resetPreview();
      setBusy(true);
      setMessage(
        restoreAutomatic ? "Automatische Taxonomiewerte werden vorbereitet …" : "Taxonomieangaben werden geprüft …",
        "info",
      );
      try {
        const result = await fetchJson(
          `/api/species/${encodeURIComponent(species.id)}/taxonomy/preview`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fields: values(),
              reason: reasonInput?.value ?? "",
              restoreAutomatic,
            }),
          },
        );
        renderResult(result);
      } catch (error) {
        setMessage([error.message, ...(error.details || [])].join(" · "), "error");
      } finally {
        setBusy(false);
      }
    }

    previewButton?.addEventListener("click", () => createPreview());
    restoreButton?.addEventListener("click", () => createPreview({ restoreAutomatic: true }));
    saveButton?.addEventListener("click", async () => {
      if (!previewToken) return;
      setBusy(true);
      setMessage("Taxonomieänderung wird lokal gespeichert …", "info");
      try {
        const result = await fetchJson(
          `/api/species/${encodeURIComponent(species.id)}/taxonomy/save`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: previewToken }),
          },
        );
        state.notice = result.restoredAutomatic
          ? `Automatische Taxonomie wurde wiederhergestellt. ${backupRetentionText(result.backupRetention)}`
          : `Taxonomie wurde lokal gespeichert. ${backupRetentionText(result.backupRetention)} Veröffentlichung über „Änderungen übertragen“.`;
        closeEditDialog();
        await loadData({ reload: true });
      } catch (error) {
        setMessage([error.message, ...(error.details || [])].join(" · "), "error");
        setBusy(false);
      }
    });

    function handleInput() {
      resetPreview();
      setMessage("Taxonomieangaben geändert. Bitte erneut prüfen.", "info");
    }

    return Object.freeze({ setMessage, setBusy, resetPreview, handleInput });
  }

  global.SpeciesExplorerTaxonomyEditor = Object.freeze({ createTaxonomyEditorController });
})(globalThis);
