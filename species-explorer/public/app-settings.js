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
    const dialogController = createDialogController({ dialog, closeButtons: cancelButtons });
    let bound = false;

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
      return presentation;
    }

    async function loadSettings() {
      const settings = await fetchJson("/api/settings");
      applySettings(settings);
      return settings;
    }

    async function openSettings() {
      setMessage("Einstellungen werden geladen...", "info");
      elements.settingsSaveButton.disabled = true;
      dialogController.open();
      try {
        const settings = await loadSettings();
        const presentation = backupSettingsPresentation(settings);
        setMessage(presentation.statusMessage, "info");
        return settings;
      } catch (error) {
        setMessage([error.message, ...(error.details || [])].join(" · "), "error");
        return null;
      } finally {
        elements.settingsSaveButton.disabled = false;
      }
    }

    function resetToDefault() {
      const defaultBackupRoot = state.settingsSnapshot?.defaultBackupRoot || DEFAULT_BACKUP_ROOT;
      elements.backupRootInput.value = defaultBackupRoot;
      setMessage("Standardpfad wird beim Speichern verwendet.", "info");
    }

    async function saveSettings() {
      elements.settingsSaveButton.disabled = true;
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
        elements.settingsSaveButton.disabled = false;
      }
    }

    function bind() {
      if (bound) return;
      bound = true;
      for (const button of elements.settingsButtons) {
        button.addEventListener("click", openSettings);
      }
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
