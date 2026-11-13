import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-settings.js", import.meta.url), "utf8");
const context = vm.createContext({});
new vm.Script(source, { filename: "app-settings.js" }).runInContext(context);
const settingsModule = context.SpeciesExplorerSettings;

class FakeElement {
  constructor() {
    this.textContent = "";
    this.className = "";
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.listeners = new Map();
    this.cancelButtons = [];
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  querySelectorAll(selector) {
    return selector === ".settings-cancel" ? this.cancelButtons : [];
  }
}

function createFixture(fetchJson) {
  const state = { editMode: true };
  const elements = {
    settingsDialog: new FakeElement(),
    settingsForm: new FakeElement(),
    settingsButtons: [new FakeElement(), new FakeElement()],
    settingsMessage: new FakeElement(),
    backupRootInput: new FakeElement(),
    backupRootDefault: new FakeElement(),
    settingsResetButton: new FakeElement(),
    settingsSaveButton: new FakeElement(),
  };
  const headerClose = new FakeElement();
  headerClose.textContent = "×";
  headerClose.classList = { contains: (name) => name === "edit-close" };
  elements.settingsDialog.cancelButtons = [headerClose, new FakeElement()];
  const opened = [];
  const controller = settingsModule.createBackupSettingsController({
    state,
    elements,
    fetchJson,
    canEdit: () => state.editMode,
    createDialogController: ({ dialog, closeButtons, afterClose }) => ({
      open() {
        opened.push({ dialog, closeButtons, afterClose });
      },
    }),
  });
  controller.bind();
  return { state, elements, opened, controller };
}

test("Backup-Einstellungen unterscheiden Standard- und eigenen Pfad", () => {
  const standard = settingsModule.backupSettingsPresentation({
    backupRoot: "W:\\Website Datenbank Backup",
    defaultBackupRoot: "W:\\Website Datenbank Backup",
    hasCustomBackupRoot: false,
  });
  assert.equal(standard.statusMessage, "Der Standardpfad ist aktiv.");

  const custom = settingsModule.backupSettingsPresentation({
    backupRoot: "X:\\Sicherungen",
    defaultBackupRoot: "W:\\Website Datenbank Backup",
    hasCustomBackupRoot: true,
  });
  assert.equal(custom.statusMessage, "Eigener Backup-Pfad ist aktiv.");
  assert.deepEqual(
    { ...settingsModule.backupSettingsSavePayload(" W:\\Website Datenbank Backup ", standard.defaultBackupRoot) },
    { reset: true },
  );
  assert.deepEqual(
    { ...settingsModule.backupSettingsSavePayload(" X:\\Sicherungen ", standard.defaultBackupRoot) },
    { backupRoot: "X:\\Sicherungen" },
  );
});

test("Einstellungsdialog lädt den lokalen Backup-Pfad und bleibt bedienbar", async () => {
  const calls = [];
  const response = {
    backupRoot: "X:\\Sicherungen",
    defaultBackupRoot: "W:\\Website Datenbank Backup",
    hasCustomBackupRoot: true,
  };
  const fixture = createFixture(async (path, options) => {
    calls.push({ path, options });
    return response;
  });

  await fixture.controller.openSettings();
  assert.deepEqual(calls, [{ path: "/api/settings", options: undefined }]);
  assert.equal(fixture.opened.length, 1);
  assert.equal(fixture.state.settingsSnapshot, response);
  assert.equal(fixture.elements.backupRootInput.value, "X:\\Sicherungen");
  assert.equal(fixture.elements.backupRootDefault.textContent, "W:\\Website Datenbank Backup");
  assert.equal(fixture.elements.settingsMessage.textContent, "Eigener Backup-Pfad ist aktiv.");
  assert.equal(fixture.elements.settingsSaveButton.disabled, false);
  assert.equal(fixture.elements.settingsButtons[0].listeners.get("click").length, 1);
});

test("Speichern setzt den Standardpfad kontrolliert zurück", async () => {
  const calls = [];
  const response = {
    backupRoot: "W:\\Website Datenbank Backup",
    defaultBackupRoot: "W:\\Website Datenbank Backup",
    hasCustomBackupRoot: false,
  };
  const fixture = createFixture(async (path, options) => {
    calls.push({ path, options });
    return response;
  });
  fixture.state.settingsSnapshot = response;
  fixture.elements.backupRootInput.value = "W:\\Website Datenbank Backup";

  await fixture.controller.saveSettings();
  assert.equal(calls[0].path, "/api/settings/backup");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { reset: true });
  assert.equal(fixture.elements.settingsMessage.textContent, "Backup-Pfad gespeichert.");
  assert.match(fixture.elements.settingsMessage.className, /success/);
  assert.equal(fixture.elements.settingsSaveButton.disabled, false);
});

test("API-Fehler werden im geöffneten Einstellungsdialog erklärt", async () => {
  const fixture = createFixture(async () => {
    const error = new Error("NAS nicht erreichbar");
    error.details = ["Verbindung prüfen"];
    throw error;
  });

  const result = await fixture.controller.openSettings();
  assert.equal(result, null);
  assert.equal(fixture.opened.length, 1);
  assert.equal(
    fixture.elements.settingsMessage.textContent,
    "NAS nicht erreichbar · Verbindung prüfen",
  );
  assert.match(fixture.elements.settingsMessage.className, /error/);
  assert.equal(fixture.elements.settingsSaveButton.disabled, false);
});

test("Einstellungen verwerfen nur ungespeicherte Pfadänderungen", async () => {
  const standard = "W:\\Website Datenbank Backup";
  const custom = "X:\\Sicherungen";
  const f = createFixture(async (url) => ({
    backupRoot: url === "/api/settings/backup" ? standard : custom,
    defaultBackupRoot: standard,
  }));
  const [header, footer] = f.elements.settingsDialog.cancelButtons;

  await f.controller.openSettings();
  assert.equal(footer.textContent, "Fenster schließen");
  const input = f.elements.backupRootInput;
  const enter = (value) => {
    input.value = value;
    for (const listener of input.listeners.get("input")) listener();
  };
  enter(` ${custom} `);
  assert.equal(footer.textContent, "Fenster schließen");
  enter("Y:\\Ungespeichert");
  assert.equal(footer.textContent, "Änderungen verwerfen");
  f.opened[0].afterClose();
  assert.equal(input.value, custom);
  assert.equal(footer.textContent, "Fenster schließen");

  await f.controller.openSettings();
  f.controller.resetToDefault();
  assert.equal(footer.textContent, "Änderungen verwerfen");
  await f.controller.saveSettings();
  assert.equal(input.value, standard);
  assert.equal(footer.textContent, "Fenster schließen");
  assert.equal(header.textContent, "×");
});

test("Lesende Einstellungen laden nur GET und sperren Pfadänderung, Reset sowie alten programmatischen Submit", async () => {
  const calls = [], f = createFixture(async (url, options) => { calls.push([url, options?.method || "GET"]); return { backupRoot: "X:\\Sicherung" }; });
  f.state.editMode = false; await f.controller.openSettings();
  assert.equal(f.opened.length, 1); assert.deepEqual(calls, [["/api/settings", "GET"]]);
  assert.equal(f.elements.backupRootInput.value, "X:\\Sicherung"); assert.equal(f.elements.backupRootInput.disabled, true);
  assert.equal(f.elements.settingsSaveButton.disabled, true); assert.equal(f.elements.settingsResetButton.disabled, true);
  assert.equal(f.elements.settingsDialog.cancelButtons[1].textContent, "Fenster schließen");
  f.controller.resetToDefault(); assert.equal(f.elements.backupRootInput.value, "X:\\Sicherung");
  await f.controller.saveSettings();
  for (const listener of f.elements.settingsForm.listeners.get("submit")) await listener({ preventDefault() {} });
  assert.deepEqual(calls, [["/api/settings", "GET"]]);
});
