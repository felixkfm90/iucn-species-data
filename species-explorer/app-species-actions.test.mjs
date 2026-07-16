import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-species-actions.js", import.meta.url), "utf8");
const context = vm.createContext({});
new vm.Script(source, { filename: "app-species-actions.js" }).runInContext(context);
const actionsModule = context.SpeciesExplorerSpeciesActions;

class FakeElement {
  constructor() {
    this.textContent = "";
    this.className = "";
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.innerHTML = "";
    this.listeners = new Map();
    this.matches = new Map();
    this.matchLists = new Map();
    this.classes = new Set();
    this.classList = {
      toggle: (name, enabled) => {
        if (enabled) this.classes.add(name);
        else this.classes.delete(name);
      },
    };
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  querySelector(selector) {
    return this.matches.get(selector) || null;
  }

  querySelectorAll(selector) {
    return this.matchLists.get(selector) || [];
  }

  replaceChildren() {
    this.innerHTML = "";
  }

  async emit(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) {
      await listener(event);
    }
  }
}

function createFixture({ fetchJson, showQuickConfirm, openPipelinePreview } = {}) {
  const detailPanel = new FakeElement();
  const elementsBySelector = {
    ".refresh-species-open": new FakeElement(),
    ".delete-dialog": new FakeElement(),
    ".delete-species-open": new FakeElement(),
    ".delete-form": new FakeElement(),
    ".delete-message": new FakeElement(),
    ".delete-effects": new FakeElement(),
    ".delete-assets-now": new FakeElement(),
    ".delete-assets-warning": new FakeElement(),
    ".delete-confirm": new FakeElement(),
  };
  const cancelButton = new FakeElement();
  detailPanel.matches = new Map(Object.entries(elementsBySelector));
  detailPanel.matchLists.set(".delete-cancel", [cancelButton]);

  const state = {
    selectedId: "pantheraleo",
    notice: "",
    openPipelinePreview,
  };
  const dialogEvents = [];
  const calls = [];
  const runtime = {
    state,
    elements: { detailPanel },
    fetchJson: async (...args) => {
      calls.push(args);
      return fetchJson(...args);
    },
    showQuickConfirm,
    createDialogController: () => ({
      open() {
        dialogEvents.push("open");
      },
      close(reason) {
        dialogEvents.push(`close:${reason}`);
      },
    }),
    escapeHtml: (value) => String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;"),
    backupRetentionText: () => " Backupbestand: 1 Datei.",
    releaseDetailMedia: () => {
      runtime.mediaReleased = true;
    },
    loadData: async () => {
      runtime.dataLoaded = true;
    },
    delay: async (milliseconds) => {
      runtime.delayMilliseconds = milliseconds;
    },
    mediaReleased: false,
    dataLoaded: false,
    delayMilliseconds: 0,
  };
  const controller = actionsModule.createSpeciesActionsController(runtime);
  return {
    controller,
    state,
    calls,
    dialogEvents,
    runtime,
    ...elementsBySelector,
  };
}

test("Artaktionen erzeugen klare Aktualisierungs- und Löschtexte", () => {
  assert.deepEqual(
    { ...actionsModule.refreshConfirmation({ germanName: "Löwe" }) },
    {
      eyebrow: "Art aktualisieren",
      title: "Automatische Aktualisierung",
      message: "Automatische Aktualisierung für Löwe wirklich ausführen?",
      confirmLabel: "Ja, aktualisieren",
      cancelLabel: "Abbrechen",
    },
  );
  assert.deepEqual(
    { ...actionsModule.deleteModePresentation(false) },
    {
      confirmLabel: "Aus Artenliste entfernen",
      warning: "Ohne Auswahl bleiben generierte Daten und Assets bis zum separaten Bereinigungslauf bestehen.",
      danger: false,
    },
  );
  assert.match(actionsModule.deleteModePresentation(true).warning, /nicht wiederherstellbar/);
  assert.equal(
    actionsModule.deleteSuccessNotice({
      inputEntryRemoved: true,
      deleted: { germanName: "Löwe" },
      backup: "species_list-backup.json",
      permanentCleanup: true,
    }, () => " Backupbestand: 1 Datei."),
    "Löwe wurde aus der Eingabeliste entfernt. Sicherung: species_list-backup.json."
      + " Backupbestand: 1 Datei. Generierte Daten und Assetordner wurden dauerhaft gelöscht.",
  );
});

test("Art aktualisieren startet nur nach Bestätigung den gezielten stillen Lauf", async () => {
  const prompts = [];
  const pipelineCalls = [];
  const fixture = createFixture({
    fetchJson: async () => ({}),
    showQuickConfirm: async (prompt) => {
      prompts.push(prompt);
      return true;
    },
    openPipelinePreview: async (...args) => {
      pipelineCalls.push(args);
      return { noWork: true, message: "Keine Änderung erforderlich." };
    },
  });
  fixture.controller.setupSpeciesRefresh({ id: "pantheraleo", germanName: "Löwe" });

  await fixture[".refresh-species-open"].emit("click");
  assert.equal(pipelineCalls[0][0], "all");
  assert.deepEqual(JSON.parse(JSON.stringify(pipelineCalls[0][1])), {
    targetSlugs: ["pantheraleo"],
    silent: true,
    speciesRefresh: true,
  });
  assert.equal(prompts[0].message, "Automatische Aktualisierung für Löwe wirklich ausführen?");
  assert.equal(prompts[1].title, "Keine Aktualisierung gestartet");
  assert.equal(fixture[".refresh-species-open"].disabled, false);
});

test("Fehler beim Artlauf bleiben verständlich und geben die Schaltfläche frei", async () => {
  const prompts = [];
  const fixture = createFixture({
    fetchJson: async () => ({}),
    showQuickConfirm: async (prompt) => {
      prompts.push(prompt);
      return prompts.length === 1;
    },
    openPipelinePreview: async () => {
      throw new Error("Pipeline ist belegt");
    },
  });
  fixture.controller.setupSpeciesRefresh({ id: "pantheraleo", germanName: "Löwe" });

  await fixture[".refresh-species-open"].emit("click");
  assert.equal(prompts[1].title, "Aktualisierung konnte nicht gestartet werden");
  assert.equal(prompts[1].message, "Pipeline ist belegt");
  assert.equal(fixture[".refresh-species-open"].disabled, false);
});

test("Löschvorschau maskiert Auswirkungen und erzwingt notwendige Assetlöschung", async () => {
  const fixture = createFixture({
    fetchJson: async () => ({
      token: "preview-token",
      effects: ["Eintrag <Löwe> entfernen"],
      requiresAssetDeletion: true,
      assetDirectoryExists: true,
    }),
    showQuickConfirm: async () => false,
    openPipelinePreview: async () => ({}),
  });
  fixture.controller.setupSpeciesDelete({
    id: "pantheraleo",
    germanName: "Löwe",
    inGenerated: true,
  });

  await fixture[".delete-species-open"].emit("click");
  assert.equal(fixture.calls[0][0], "/api/species/pantheraleo/delete/preview");
  assert.match(fixture[".delete-effects"].innerHTML, /&lt;Löwe&gt;/);
  assert.equal(fixture[".delete-assets-now"].checked, true);
  assert.equal(fixture[".delete-assets-now"].disabled, true);
  assert.equal(fixture[".delete-confirm"].textContent, "Art und Daten dauerhaft löschen");
  assert.equal(fixture[".delete-confirm"].disabled, false);
  assert.equal(fixture[".delete-message"].textContent, "Löschvorschau ist bereit.");
  assert.deepEqual(fixture.dialogEvents, ["open"]);
});

test("Dauerhaftes Löschen gibt Medien frei, speichert und lädt den Explorer neu", async () => {
  let requestNumber = 0;
  const fixture = createFixture({
    fetchJson: async () => {
      requestNumber += 1;
      if (requestNumber === 1) {
        return {
          token: "preview-token",
          effects: ["Art entfernen"],
          requiresAssetDeletion: false,
          assetDirectoryExists: true,
        };
      }
      return {
        inputEntryRemoved: true,
        deleted: { germanName: "Löwe" },
        backup: "species_list-backup.json",
        permanentCleanup: true,
        pipelineRequired: false,
      };
    },
    showQuickConfirm: async () => false,
    openPipelinePreview: async () => ({}),
  });
  fixture.controller.setupSpeciesDelete({
    id: "pantheraleo",
    germanName: "Löwe",
    inGenerated: true,
  });
  await fixture[".delete-species-open"].emit("click");
  fixture[".delete-assets-now"].checked = true;
  await fixture[".delete-assets-now"].emit("change");
  await fixture[".delete-form"].emit("submit", { preventDefault() {} });

  assert.equal(fixture.calls[1][0], "/api/species/pantheraleo/delete/save");
  assert.deepEqual(JSON.parse(fixture.calls[1][1].body), {
    token: "preview-token",
    deleteAssets: true,
  });
  assert.equal(fixture.runtime.mediaReleased, true);
  assert.equal(fixture.runtime.delayMilliseconds, 800);
  assert.equal(fixture.runtime.dataLoaded, true);
  assert.equal(fixture.state.selectedId, "");
  assert.match(fixture.state.notice, /Löwe wurde aus der Eingabeliste entfernt/);
  assert.deepEqual(fixture.dialogEvents, ["open", "close:programmatic"]);
});
