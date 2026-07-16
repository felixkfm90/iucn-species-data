import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-lifecycle.js", import.meta.url), "utf8");
const context = vm.createContext({});
new vm.Script(source, { filename: "app-lifecycle.js" }).runInContext(context);
const lifecycleModule = context.SpeciesExplorerLifecycle;

class FakeElement {
  constructor() {
    this.textContent = "";
    this.title = "";
    this.disabled = false;
    this.innerHTML = "";
    this.open = false;
    this.listeners = new Map();
    this.attributes = new Map();
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

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  async emit(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) {
      await listener(event);
    }
  }
}

function createSnapshot(species = [{ id: "turdusmerula" }], revision = "revision-1") {
  return {
    summary: { speciesCount: species.length },
    validation: { issueCount: 0 },
    species,
    revision: { revision },
    pendingChanges: { hasPendingChanges: false },
  };
}

function createFixture({
  snapshot = createSnapshot(),
  requestedSpeciesId = "",
  loadError = null,
  revision = null,
  dialogOpen = false,
} = {}) {
  const elements = {
    editModeToggle: new FakeElement(),
    search: new FakeElement(),
    statusFilter: new FakeElement(),
    flagFilter: new FakeElement(),
    reloadButton: new FakeElement(),
    newSpeciesDialog: new FakeElement(),
    detailPanel: new FakeElement(),
  };
  const documentRef = {
    body: new FakeElement(),
    querySelector: () => dialogOpen ? new FakeElement() : null,
  };
  const windowRef = new FakeElement();
  const state = {
    species: [],
    filtered: [],
    selectedId: "",
    editMode: false,
    pendingChanges: null,
    pipelineStatusSnapshot: null,
    backupStatusSnapshot: null,
    holdNewSpeciesBackground: false,
    pendingRevisionReload: false,
    dataRevision: "",
    dataRevisionTimer: null,
    dataLoading: false,
  };
  const calls = {
    snapshots: [],
    summaries: [],
    validations: [],
    pendingChanges: [],
    populateStatusFilter: 0,
    applyFilters: 0,
    renderSpeciesList: 0,
    selected: [],
    ensured: 0,
    timers: [],
    clearedTimers: [],
  };
  let nextTimerId = 1;
  const controller = lifecycleModule.createExplorerLifecycleController({
    state,
    elements,
    documentRef,
    windowRef,
    requestedSpeciesId,
    ensureSessionToken: async () => {
      calls.ensured += 1;
      return "session-token";
    },
    loadExplorerSnapshot: async (options) => {
      calls.snapshots.push(options);
      if (loadError) throw loadError;
      return snapshot;
    },
    fetchRevision: async () => revision,
    updateSummary: (value) => calls.summaries.push(value),
    updateValidation: (value) => calls.validations.push(value),
    updatePendingChanges: (value) => {
      state.pendingChanges = value;
      calls.pendingChanges.push(value);
    },
    populateStatusFilter: () => {
      calls.populateStatusFilter += 1;
    },
    applyFilters: () => {
      calls.applyFilters += 1;
      state.filtered = [...state.species];
    },
    renderSpeciesList: () => {
      calls.renderSpeciesList += 1;
    },
    selectSpecies: (id) => {
      state.selectedId = id;
      calls.selected.push(id);
    },
    hasOpenDialog: () => dialogOpen,
    escapeHtml: (value) => String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;"),
    setTimeoutImpl: (callback, milliseconds) => {
      const id = nextTimerId;
      nextTimerId += 1;
      calls.timers.push({ id, callback, milliseconds });
      return id;
    },
    clearTimeoutImpl: (id) => calls.clearedTimers.push(id),
  });
  return { controller, state, elements, documentRef, windowRef, calls };
}

test("Lebenszyklus beschreibt Bearbeitungsmodus und Schließwarnung eindeutig", () => {
  assert.equal(lifecycleModule.editModePresentation(false).label, "Lesemodus 🔒");
  assert.equal(lifecycleModule.editModePresentation(true).label, "Bearbeitungsmodus 🔓");
  assert.equal(lifecycleModule.shouldWarnBeforeUnload({
    pendingChanges: { hasPendingChanges: true },
  }), true);
  assert.equal(lifecycleModule.shouldWarnBeforeUnload({
    pendingChanges: { hasPendingChanges: true },
    pipelineStatus: "running",
  }), false);
  assert.equal(lifecycleModule.shouldWarnBeforeUnload({
    pendingChanges: { hasPendingChanges: true },
    backupStatus: "running",
  }), false);
});

test("Artauswahl priorisiert Bestand, URL-Wunsch und sichtbaren Fallback", () => {
  const species = [{ id: "amsel" }, { id: "loewe" }];
  assert.equal(lifecycleModule.chooseInitialSpecies({
    species,
    filtered: species,
    selectedId: "amsel",
    requestedSpeciesId: "loewe",
  }), "amsel");
  assert.equal(lifecycleModule.chooseInitialSpecies({
    species,
    filtered: species,
    selectedId: "fehlt",
    requestedSpeciesId: "loewe",
  }), "loewe");
  assert.equal(lifecycleModule.chooseInitialSpecies({
    species,
    filtered: [{ id: "amsel" }],
  }), "amsel");
});

test("Lebenszyklus bindet Oberfläche einmal und schaltet den Bearbeitungsmodus", async () => {
  const fixture = createFixture();
  fixture.controller.bindLifecycleEvents();
  fixture.controller.bindLifecycleEvents();

  assert.equal(fixture.elements.editModeToggle.listeners.get("click").length, 1);
  assert.equal(fixture.elements.search.listeners.get("input").length, 1);
  assert.equal(fixture.windowRef.listeners.get("beforeunload").length, 1);
  assert.equal(fixture.state.editMode, false);
  assert.equal(fixture.elements.editModeToggle.textContent, "Lesemodus 🔒");

  await fixture.elements.editModeToggle.emit("click");
  assert.equal(fixture.state.editMode, true);
  assert.equal(fixture.elements.editModeToggle.attributes.get("aria-pressed"), "true");
  assert.equal(fixture.documentRef.body.classes.has("edit-mode"), true);
});

test("Modellaktualisierung verteilt einen konsistenten Schnappschuss", async () => {
  const snapshot = createSnapshot([{ id: "amsel" }, { id: "loewe" }], "revision-2");
  const fixture = createFixture({ snapshot });
  const result = await fixture.controller.refreshExplorerModelOnly({ reload: true });

  assert.equal(result, snapshot);
  assert.equal(fixture.calls.snapshots[0].reload, true);
  assert.equal(fixture.calls.snapshots[0].failureMessage, "Lokale Daten konnten nicht aktualisiert werden.");
  assert.equal(fixture.state.dataRevision, "revision-2");
  assert.equal(fixture.state.species.length, 2);
  assert.equal(fixture.calls.summaries.length, 1);
  assert.equal(fixture.calls.validations.length, 1);
  assert.equal(fixture.calls.pendingChanges.length, 1);
  assert.equal(fixture.calls.populateStatusFilter, 1);
  assert.equal(fixture.calls.applyFilters, 1);
});

test("Datenladen wählt die URL-Art und hält den Assistenten-Hintergrund stabil", async () => {
  const snapshot = createSnapshot([{ id: "amsel" }, { id: "loewe" }]);
  const selectedFixture = createFixture({ snapshot, requestedSpeciesId: "loewe" });
  await selectedFixture.controller.loadData();
  assert.deepEqual(selectedFixture.calls.selected, ["loewe"]);
  assert.equal(selectedFixture.elements.reloadButton.textContent, "Aktualisieren");
  assert.equal(selectedFixture.state.dataLoading, false);

  const heldFixture = createFixture({ snapshot, requestedSpeciesId: "loewe" });
  heldFixture.state.holdNewSpeciesBackground = true;
  heldFixture.elements.newSpeciesDialog.open = true;
  await heldFixture.controller.loadData({ reload: true });
  assert.equal(heldFixture.state.selectedId, "loewe");
  assert.deepEqual(heldFixture.calls.selected, []);
  assert.equal(heldFixture.calls.renderSpeciesList, 1);
});

test("Ladefehler werden maskiert angezeigt und geben Aktualisieren wieder frei", async () => {
  const fixture = createFixture({ loadError: new Error("Fehler <intern>") });
  const result = await fixture.controller.loadData();

  assert.equal(result, null);
  assert.match(fixture.elements.detailPanel.innerHTML, /Fehler &lt;intern&gt;/);
  assert.equal(fixture.elements.reloadButton.disabled, false);
  assert.equal(fixture.elements.reloadButton.textContent, "Aktualisieren");
  assert.equal(fixture.state.dataLoading, false);
});

test("Revisionswechsel wird bei offenem Dialog vertagt und sonst geladen", async () => {
  const deferred = createFixture({ revision: { revision: "revision-2" }, dialogOpen: true });
  deferred.state.dataRevision = "revision-1";
  await deferred.controller.monitorProjectRevision({ reschedule: false });
  assert.equal(deferred.state.pendingRevisionReload, true);
  assert.equal(deferred.calls.snapshots.length, 0);

  const reloaded = createFixture({ revision: { revision: "revision-2" } });
  reloaded.state.dataRevision = "revision-1";
  await reloaded.controller.monitorProjectRevision({ reschedule: false });
  assert.equal(reloaded.calls.snapshots.length, 1);
  assert.equal(reloaded.state.dataRevision, "revision-1");

  reloaded.state.pendingChanges = { hasPendingChanges: true };
  let prevented = false;
  const event = {
    returnValue: undefined,
    preventDefault() {
      prevented = true;
    },
  };
  assert.equal(reloaded.controller.handleBeforeUnload(event), true);
  assert.equal(prevented, true);
  assert.equal(event.returnValue, "");
});
