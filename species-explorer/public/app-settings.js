(function initializeSpeciesExplorerSettings(global) {
  "use strict";

  const DEFAULT_BACKUP_ROOT = "W:\\Website Datenbank Backup";

  function backupSettingsPresentation(settings = {}) {
    const defaultBackupRoot = String(settings.defaultBackupRoot || DEFAULT_BACKUP_ROOT);
    return Object.freeze({
      backupRoot: String(settings.backupRoot || ""),
      defaultBackupRoot,
      statusMessage: settings.hasCustomBackupRoot
        ? "Eigener Backup-Pfad ist aktiv."
        : "Der Standardpfad ist aktiv.",
    });
  }

  function backupSettingsSavePayload(requestedBackupRoot, defaultBackupRoot) {
    const requested = String(requestedBackupRoot || "").trim();
    const defaultRoot = String(defaultBackupRoot || "").trim();
    return requested === defaultRoot
      ? Object.freeze({ reset: true })
      : Object.freeze({ backupRoot: requested });
  }

  function createBackupSettingsController({
    state,
    elements,
    fetchJson,
    createDialogController,
    canEdit = () => true,
  } = {}) {
    if (!state || !elements) {
      throw new TypeError("Backup-Einstellungen benötigen Zustand und Elemente.");
    }
    if (typeof fetchJson !== "function" || typeof createDialogController !== "function") {
      throw new TypeError("Backup-Einstellungen benötigen API- und Dialogsteuerung.");
    }

    const dialog = elements.settingsDialog;
    const form = elements.settingsForm;
    if (!dialog || !form) return null;

    const cancelButtons = [...dialog.querySelectorAll(".settings-cancel")];
    const footerCloseButton = cancelButtons.find((button) => !button.classList?.contains("edit-close"));
    const dialogController = createDialogController({
      dialog,
      closeButtons: cancelButtons,
      afterClose: () => {
        elements.backupRootInput.value = savedBackupRoot();
        renderCloseLabel();
      },
    });
    let bound = false, loading = false, saving = false;

    function savedBackupRoot() {
      return String(state.settingsSnapshot?.backupRoot || "");
    }

    function renderCloseLabel() {
      if (!footerCloseButton) return;
      const dirty = canEdit() && !loading && !saving
        && String(elements.backupRootInput.value || "").trim() !== savedBackupRoot().trim();
      footerCloseButton.textContent = dirty ? "Änderungen verwerfen" : "Fenster schließen";
    }

    function editingModeChanged() {
      const disabled = !canEdit() || loading || saving;
      elements.backupRootInput.disabled = disabled;
      elements.settingsResetButton.disabled = disabled;
      elements.settingsSaveButton.disabled = disabled;
      renderCloseLabel();
    }

    function setMessage(text = "", type = "") {
      elements.settingsMessage.textContent = text;
      elements.settingsMessage.className = `edit-message settings-message${type ? ` ${type}` : ""}`;
      elements.settingsMessage.hidden = !text;
    }

    function applySettings(settings = {}) {
      const presentation = backupSettingsPresentation(settings);
      state.settingsSnapshot = settings;
      elements.backupRootInput.value = presentation.backupRoot;
      elements.backupRootDefault.textContent = presentation.defaultBackupRoot;
      renderCloseLabel();
      return presentation;
    }

    async function loadSettings() {
      const settings = await fetchJson("/api/settings");
      applySettings(settings);
      return settings;
    }

    async function openSettings() {
      setMessage("Einstellungen werden geladen...", "info");
      loading = true; editingModeChanged();
      dialogController.open();
      try {
        const settings = await loadSettings();
        const presentation = backupSettingsPresentation(settings);
        setMessage(canEdit() ? presentation.statusMessage : `${presentation.statusMessage} Lesemodus: Der Pfad wird nur angezeigt; die Projektanmeldung bleibt möglich.`, "info");
        return settings;
      } catch (error) {
        setMessage([error.message, ...(error.details || [])].join(" · "), "error");
        return null;
      } finally {
        loading = false; editingModeChanged();
      }
    }

    function resetToDefault() {
      if (!canEdit() || loading || saving) return;
      const defaultBackupRoot = state.settingsSnapshot?.defaultBackupRoot || DEFAULT_BACKUP_ROOT;
      elements.backupRootInput.value = defaultBackupRoot;
      renderCloseLabel();
      setMessage("Standardpfad wird beim Speichern verwendet.", "info");
    }

    async function saveSettings() {
      if (!canEdit() || loading || saving) return null;
      saving = true; editingModeChanged();
      setMessage("Backup-Pfad wird gespeichert...", "info");
      const payload = backupSettingsSavePayload(
        elements.backupRootInput.value,
        state.settingsSnapshot?.defaultBackupRoot || "",
      );
      try {
        const settings = await fetchJson("/api/settings/backup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        applySettings(settings);
        setMessage("Backup-Pfad gespeichert.", "success");
        return settings;
      } catch (error) {
        setMessage([error.message, ...(error.details || [])].join(" · "), "error");
        return null;
      } finally {
        saving = false; editingModeChanged();
      }
    }

    function bind() {
      if (bound) return;
      bound = true;
      for (const button of elements.settingsButtons) {
        button.addEventListener("click", openSettings);
      }
      elements.backupRootInput.addEventListener("input", renderCloseLabel);
      elements.settingsResetButton.addEventListener("click", resetToDefault);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        void saveSettings();
      });
    }

    return Object.freeze({
      bind,
      setMessage,
      applySettings,
      loadSettings,
      openSettings,
      editingModeChanged,
      resetToDefault,
      saveSettings,
    });
  }

  function setupBackupSettings(options) {
    const controller = createBackupSettingsController(options);
    controller?.bind();
    return controller;
  }

  global.SpeciesExplorerSettings = Object.freeze({
    DEFAULT_BACKUP_ROOT,
    backupSettingsPresentation,
    backupSettingsSavePayload,
    createBackupSettingsController,
    setupBackupSettings,
  });
})(globalThis);
