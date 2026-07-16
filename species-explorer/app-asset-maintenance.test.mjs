import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-asset-maintenance.js", import.meta.url), "utf8");
const context = vm.createContext({});
new vm.Script(source, { filename: "app-asset-maintenance.js" }).runInContext(context);
const maintenanceModule = context.SpeciesExplorerAssetMaintenance;

class FakeButton {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
}

function createSection() {
  const events = [];
  return {
    events,
    deleteButton: new FakeButton(),
    restoreButton: new FakeButton(),
    message(text, type) {
      events.push(["message", text, type]);
    },
    busy(value) {
      events.push(["busy", value]);
    },
    reset() {
      events.push(["reset"]);
    },
  };
}

function createFixture({ fetchJson, confirmAction = () => true } = {}) {
  const calls = [];
  const sections = {
    map: createSection(),
    portrait: createSection(),
    sound: createSection(),
  };
  const runtime = {
    state: {
      notice: "",
      mapCleanup: () => {
        runtime.mapReleased = true;
      },
      portraitCleanup: () => {
        runtime.portraitReleased = true;
      },
    },
    species: { id: "pantheraleo" },
    sections,
    fetchJson: async (...args) => {
      calls.push(args);
      return fetchJson(...args);
    },
    loadData: async (options) => {
      runtime.loadOptions = options;
    },
    releaseCurrentSoundAudio: async () => {
      runtime.soundReleased = true;
    },
    closeEditor: () => {
      runtime.closed = true;
    },
    confirmAction,
    mapReleased: false,
    portraitReleased: false,
    soundReleased: false,
    closed: false,
    loadOptions: null,
  };
  const controller = maintenanceModule.createAssetMaintenanceController(runtime);
  return { controller, runtime, sections, calls };
}

test("Asset-Wartung liefert einheitliche Texte für Löschen und Wiederherstellen", () => {
  assert.equal(
    maintenanceModule.assetMaintenancePresentation("map").label,
    "Verbreitungskarte",
  );
  assert.match(
    maintenanceModule.assetMaintenancePresentation("sound").deleteConfirm,
    /Sound, Credits und Spektrogramm dauerhaft löschen/,
  );
  assert.equal(maintenanceModule.assetMaintenancePresentation("unknown"), null);
  assert.equal(
    maintenanceModule.deletedAssetNotice({
      label: "Karte",
      backup: "map-backup.zip",
      backupCleanupWarning: "Alte Sicherung entfernt.",
    }, {}),
    "Karte wurde gelöscht. Sicherung: map-backup.zip."
      + " Die Änderung ist lokal vorgemerkt und wird mit „Änderungen übertragen“ veröffentlicht."
      + " Alte Sicherung entfernt.",
  );
  assert.equal(
    maintenanceModule.restoredAssetNotice({ backup: "portrait-backup.zip" }, { label: "Artporträt" }),
    "Artporträt wurde aus der lokalen Sicherung wiederhergestellt."
      + " Sicherung: portrait-backup.zip."
      + " Die Änderung ist lokal vorgemerkt und wird mit „Änderungen übertragen“ veröffentlicht.",
  );
});

test("Abgebrochene Asset-Löschung verändert weder Ansicht noch Dateien", async () => {
  const fixture = createFixture({
    fetchJson: async () => {
      throw new Error("darf nicht aufgerufen werden");
    },
    confirmAction: () => false,
  });

  assert.equal(await fixture.controller.deleteAsset("map"), false);
  assert.equal(fixture.calls.length, 0);
  assert.deepEqual(fixture.sections.map.events, []);
  assert.equal(fixture.runtime.mapReleased, false);
});

test("Kartenlöschung gibt die Vorschau frei, speichert und lädt den Explorer neu", async () => {
  let requestNumber = 0;
  const fixture = createFixture({
    fetchJson: async () => {
      requestNumber += 1;
      return requestNumber === 1
        ? { token: "delete-token" }
        : { label: "Verbreitungskarte", backup: "map-backup.zip" };
    },
  });

  assert.equal(await fixture.controller.deleteAsset("map"), true);
  assert.equal(fixture.calls[0][0], "/api/species/pantheraleo/assets/map/delete-preview");
  assert.equal(fixture.calls[1][0], "/api/species/pantheraleo/assets/map/delete");
  assert.deepEqual(JSON.parse(fixture.calls[1][1].body), { token: "delete-token" });
  assert.equal(fixture.runtime.mapReleased, true);
  assert.equal(fixture.runtime.state.mapCleanup, null);
  assert.equal(fixture.runtime.closed, true);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.runtime.loadOptions)), { reload: true });
  assert.match(fixture.runtime.state.notice, /Verbreitungskarte wurde gelöscht/);
  assert.deepEqual(fixture.sections.map.events.slice(0, 3), [
    ["reset"],
    ["busy", true],
    ["message", "Verbreitungskarte wird lokal gesichert und gelöscht …", "info"],
  ]);
});

test("Soundfehler werden nach Medienfreigabe verständlich gemeldet", async () => {
  const fixture = createFixture({
    fetchJson: async () => {
      const error = new Error("Sounddatei gesperrt");
      error.details = ["Wiedergabe schließen"];
      throw error;
    },
  });

  assert.equal(await fixture.controller.deleteAsset("sound"), false);
  assert.equal(fixture.runtime.soundReleased, true);
  assert.equal(fixture.runtime.closed, false);
  assert.deepEqual(fixture.sections.sound.events.at(-2), [
    "message",
    "Sounddatei gesperrt · Wiedergabe schließen",
    "error",
  ]);
  assert.deepEqual(fixture.sections.sound.events.at(-1), ["busy", false]);
});

test("Portrait-Wiederherstellung nutzt die letzte Sicherung und räumt die Medienreferenz auf", async () => {
  let requestNumber = 0;
  const fixture = createFixture({
    fetchJson: async () => {
      requestNumber += 1;
      return requestNumber === 1
        ? { token: "restore-token" }
        : { backup: "portrait-backup.zip" };
    },
  });

  assert.equal(await fixture.controller.restoreAsset("portrait"), true);
  assert.equal(fixture.calls[0][0], "/api/species/pantheraleo/assets/portrait/restore-preview");
  assert.equal(fixture.calls[1][0], "/api/species/pantheraleo/assets/portrait/restore");
  assert.deepEqual(JSON.parse(fixture.calls[1][1].body), { token: "restore-token" });
  assert.equal(fixture.runtime.portraitReleased, true);
  assert.equal(fixture.runtime.state.portraitCleanup, null);
  assert.match(fixture.runtime.state.notice, /Artporträt wurde aus der lokalen Sicherung wiederhergestellt/);
  assert.equal(fixture.runtime.closed, true);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.runtime.loadOptions)), { reload: true });
});

test("Controller bindet für alle drei Assettypen Löschen und Wiederherstellen genau einmal", () => {
  const fixture = createFixture({ fetchJson: async () => ({}) });
  fixture.controller.bind();

  for (const section of Object.values(fixture.sections)) {
    assert.equal(section.deleteButton.listeners.get("click")?.length, 1);
    assert.equal(section.restoreButton.listeners.get("click")?.length, 1);
  }
});
