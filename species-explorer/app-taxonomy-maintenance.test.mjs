import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("./public/app-taxonomy-maintenance.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({
  clearTimeout() {},
  setTimeout() {
    return 1;
  },
});
new vm.Script(source, { filename: "app-taxonomy-maintenance.js" }).runInContext(context);
const maintenance = context.SpeciesExplorerTaxonomyMaintenance;

function element() {
  return {
    disabled: false,
    hidden: false,
    innerHTML: "",
    textContent: "",
    value: 0,
    addEventListener() {},
    removeAttribute(name) {
      delete this[name];
    },
  };
}

function elements() {
  return {
    taxonomyMaintenanceSummary: element(),
    taxonomyMaintenanceDetail: element(),
    taxonomyMaintenanceProgress: element(),
    taxonomyMaintenanceConflicts: element(),
    taxonomyCheckButton: element(),
    taxonomyUpdateButton: element(),
    taxonomyRollbackButton: element(),
  };
}

function activeStatus() {
  return {
    status: "downloading",
    phase: "download",
    action: "update",
    active: true,
    message: "Taxonomiereferenz wird heruntergeladen",
    progressPercent: 10,
    startedAt: "2026-07-26T10:00:00.000Z",
    completedAt: "",
    releaseId: "col-xr-2026-07-17-315834",
    latest: {
      releaseId: "col-xr-2026-07-17-315834",
      alias: "COL26.7 XR",
      issued: "2026-07-17",
    },
    reference: { available: false },
    updateAvailable: true,
    latestCheckedAt: "2026-07-26T09:59:00.000Z",
    rollbackAvailable: false,
    latestInstalled: false,
    catalogueUpdateAvailable: true,
    supplementUpdateAvailable: false,
    updateCatalogue: true,
    updateSupplements: true,
  };
}

function completedStatus() {
  return {
    ...activeStatus(),
    status: "completed",
    phase: "activate",
    active: false,
    message: "Referenz aktualisiert. Alle bestehenden Arten stimmen eindeutig überein.",
    progressPercent: 100,
    completedAt: "2026-07-26T10:20:00.000Z",
    reference: {
      available: true,
      releaseId: "col-xr-2026-07-17-315834",
      source: {
        releaseId: "col-xr-2026-07-17-315834",
        alias: "COL26.7 XR",
        issued: "2026-07-17",
      },
      counts: {
        taxa: 2_500_000,
        scientificNames: 7_800_000,
        vernacularNames: 800_000,
        vernacularNamesSkippedUnknownTaxa: 1,
      },
    },
    updateAvailable: false,
    latestInstalled: true,
    catalogueUpdateAvailable: false,
    supplementUpdateAvailable: false,
    updateCatalogue: true,
    updateSupplements: true,
  };
}

function availableUpdateStatus({ installed = false } = {}) {
  return {
    status: "idle",
    phase: "",
    action: "",
    active: false,
    message: "Noch keine Aktualisierung gestartet.",
    progressPercent: null,
    startedAt: "",
    completedAt: "",
    releaseId: installed ? "col-old-release" : "",
    latest: {
      releaseId: "col-xr-2026-07-17-315834",
      alias: "COL26.7 XR",
      issued: "2026-07-17",
    },
    reference: installed
      ? {
        available: true,
        releaseId: "col-old-release",
        source: { releaseId: "col-old-release", alias: "COL26.6 XR" },
      }
      : { available: false },
    updateAvailable: true,
    latestCheckedAt: "2026-07-26T09:59:00.000Z",
    rollbackAvailable: false,
    latestInstalled: false,
    catalogueUpdateAvailable: true,
    supplementUpdateAvailable: false,
  };
}

function updatePreview() {
  return {
    hasWork: true,
    latest: availableUpdateStatus().latest,
    warning: "Download und Import können einige Zeit dauern.",
    requiredFreeBytes: 12 * 1024 ** 3,
    token: "preview-token",
    updateCatalogue: true,
    updateSupplements: true,
  };
}

async function flushAsyncWork() {
  for (let index = 0; index < 6; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test("erfolgreiche Übernahme wird dauerhaft und einmalig als Bestätigungsfenster angezeigt", async () => {
  const visible = elements();
  const confirmations = [];
  const messages = [];
  const statuses = [activeStatus(), completedStatus(), completedStatus()];
  const controller = maintenance.createTaxonomyMaintenanceController({
    state: {
      setPipelineMessage(message, type) {
        messages.push({ message, type });
      },
    },
    elements: visible,
    fetchJson: async () => statuses.shift(),
    formatBytes: (value) => String(value),
    showQuickConfirm: async (options) => {
      confirmations.push(options);
      return true;
    },
    renderDatabaseStatus() {},
  });

  await controller.refresh();
  assert.equal(confirmations.length, 0);
  await controller.refresh();
  await Promise.resolve();
  assert.equal(confirmations.length, 1);
  assert.equal(confirmations[0].title, "Neue Datenbank erfolgreich übernommen");
  assert.equal(confirmations[0].cancelLabel, "");
  assert.match(confirmations[0].message, /2\.500\.000 Taxa/);
  assert.equal(
    visible.taxonomyMaintenanceSummary.textContent,
    "Taxonomiedatenbank erfolgreich aktualisiert",
  );
  assert.match(visible.taxonomyMaintenanceDetail.textContent, /Bestehende Projektdaten wurden nicht automatisch verändert/);
  assert.match(confirmations[0].message, /7\.800\.000 wissenschaftliche Namen/);
  assert.match(confirmations[0].message, /1 nicht zuordenbare Namen übersprungen/);
  assert.deepEqual(messages.at(-1), {
    message: "Taxonomiedatenbank erfolgreich aktualisiert.",
    type: "success",
  });

  await controller.refresh();
  await Promise.resolve();
  assert.equal(confirmations.length, 1);
});

test("laufende Aktualisierung wiederholt den Fortschrittstitel nicht in der Detailzeile", async () => {
  const visible = elements();
  const controller = maintenance.createTaxonomyMaintenanceController({
    state: {},
    elements: visible,
    fetchJson: async () => activeStatus(),
    formatBytes: (value) => String(value),
    showQuickConfirm: async () => true,
    renderDatabaseStatus() {},
  });

  await controller.refresh();
  assert.equal(
    visible.taxonomyMaintenanceSummary.textContent,
    "Taxonomiedatenbank wird aktualisiert",
  );
  assert.equal(
    visible.taxonomyMaintenanceDetail.textContent,
    "Die bestehende Referenz bleibt bis zur erfolgreichen Aktivierung erhalten.",
  );
});

test("installierte und neueste Referenz werden ohne Dopplung getrennt angezeigt", async () => {
  const visible = elements();
  const status = availableUpdateStatus({ installed: true });
  const controller = maintenance.createTaxonomyMaintenanceController({
    state: {},
    elements: visible,
    fetchJson: async () => status,
    formatBytes: (value) => String(value),
    showQuickConfirm: async () => true,
    renderDatabaseStatus() {},
  });

  await controller.refresh();
  assert.equal(visible.taxonomyMaintenanceSummary.textContent, "Datenbank aktuell");
  assert.equal(
    visible.taxonomyMaintenanceDetail.textContent,
    "Neueste verfügbare Version: COL26.7 XR vom 17.07.2026.",
  );
});

test("CoL-Lücken auf Artstufe werden nicht als unbekannte Projektart bezeichnet", () => {
  const message = maintenance.conflictText(
    {
      exact: 51,
      suggestions: 0,
      referenceGaps: 1,
      ambiguous: 0,
      missing: 0,
    },
    [{
      germanName: "Eurasisches Eichhörnchen",
      scientificName: "Sciurus vulgaris",
      classification: "reference-gap",
    }],
  );
  assert.match(message, /1 Referenzlücken/);
  assert.match(
    message,
    /Eurasisches Eichhörnchen: Artstufe fehlt in CoL, zugehörige Unterarten sind vorhanden/,
  );
  assert.match(message, /\.\nManuell zu prüfen:/);
  assert.doesNotMatch(message, /Eurasisches Eichhörnchen: nicht gefunden/);
});

test("entscheidbare Referenzlücken werden mit Lösungsvorschlag angezeigt", async () => {
  const visible = elements();
  const controller = maintenance.createTaxonomyMaintenanceController({
    state: {},
    elements: visible,
    fetchJson: async () => ({
      ...availableUpdateStatus({ installed: true }),
      conflicts: {
        total: 52,
        exact: 51,
        suggestions: 0,
        referenceGaps: 1,
        ambiguous: 0,
        missing: 0,
      },
      conflictDetails: [{
        germanName: "Eurasisches Eichhörnchen",
        scientificName: "Sciurus vulgaris",
        classification: "reference-gap",
      }],
    }),
    formatBytes: (value) => String(value),
    escapeHtml: (value) => String(value),
    showQuickConfirm: async () => true,
    renderDatabaseStatus() {},
  });

  await controller.refresh();
  assert.equal(visible.taxonomyMaintenanceConflicts.hidden, false);
  assert.match(visible.taxonomyMaintenanceConflicts.innerHTML, /Eurasisches Eichhörnchen/);
  assert.match(visible.taxonomyMaintenanceConflicts.innerHTML, /Mit Masterdatenbank bestätigen/);
});

test("bereits vor dem Öffnen abgeschlossene Läufe erzeugen kein nachträgliches Popup", async () => {
  const confirmations = [];
  const controller = maintenance.createTaxonomyMaintenanceController({
    state: {},
    elements: elements(),
    fetchJson: async () => completedStatus(),
    formatBytes: (value) => String(value),
    showQuickConfirm: async (options) => {
      confirmations.push(options);
      return true;
    },
    renderDatabaseStatus() {},
  });
  await controller.refresh();
  await Promise.resolve();
  assert.equal(confirmations.length, 0);
});

test("beim Start wird eine fehlende Referenz einmalig zur Installation angeboten", async () => {
  const confirmations = [];
  const requests = [];
  const status = availableUpdateStatus();
  const controller = maintenance.createTaxonomyMaintenanceController({
    state: {},
    elements: elements(),
    fetchJson: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith("/preview")) return updatePreview();
      if (url.endsWith("/start")) return activeStatus();
      return status;
    },
    formatBytes: () => "12 GB",
    showQuickConfirm: async (options) => {
      confirmations.push(options);
      return true;
    },
    renderDatabaseStatus() {},
  });

  controller.setup();
  await flushAsyncWork();
  assert.equal(confirmations.length, 1);
  assert.equal(confirmations[0].title, "Keine Taxonomiedatenbank installiert");
  assert.equal(confirmations[0].confirmLabel, "Jetzt aktualisieren");
  assert.equal(confirmations[0].cancelLabel, "Später");
  assert.equal(requests.filter(({ url }) => url.endsWith("/start")).length, 1);
});

test("eine verschobene Aktualisierung wird beim selben Start nicht erneut angeboten", async () => {
  const confirmations = [];
  const requests = [];
  const status = availableUpdateStatus({ installed: true });
  const controller = maintenance.createTaxonomyMaintenanceController({
    state: {},
    elements: elements(),
    fetchJson: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith("/preview")) return updatePreview();
      return status;
    },
    formatBytes: () => "12 GB",
    showQuickConfirm: async (options) => {
      confirmations.push(options);
      return false;
    },
    renderDatabaseStatus() {},
  });

  controller.setup();
  await flushAsyncWork();
  await controller.refresh();
  await flushAsyncWork();
  assert.equal(confirmations.length, 1);
  assert.equal(confirmations[0].title, "Taxonomiedatenbank ist veraltet");
  assert.equal(requests.filter(({ url }) => url.endsWith("/start")).length, 0);
});

test("veraltete Ergänzungsnamen werden ohne vorgetäuschtes CoL-Update dargestellt", async () => {
  const visible = elements();
  const status = {
    ...availableUpdateStatus({ installed: true }),
    updateAvailable: true,
    catalogueUpdateAvailable: false,
    supplementUpdateAvailable: true,
    latestInstalled: true,
    reference: {
      available: true,
      releaseId: "col-xr-2026-07-17-315834",
      source: availableUpdateStatus().latest,
      supplements: {
        available: true,
        stale: true,
        entryCount: 42,
      },
    },
  };
  const controller = maintenance.createTaxonomyMaintenanceController({
    state: {},
    elements: visible,
    fetchJson: async () => status,
    formatBytes: (value) => String(value),
    showQuickConfirm: async () => true,
    renderDatabaseStatus() {},
  });

  await controller.refresh();
  assert.equal(
    visible.taxonomyUpdateButton.textContent,
    "Namensbestand aktualisieren",
  );
  assert.equal(
    visible.taxonomyMaintenanceSummary.textContent,
    "Datenbank aktuell",
  );
  assert.equal(
    visible.taxonomyMaintenanceDetail.textContent,
    "Neueste verfügbare Version: COL26.7 XR vom 17.07.2026.",
  );
});
