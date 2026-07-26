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
      },
    },
    updateAvailable: false,
    latestInstalled: true,
  };
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
  assert.match(visible.taxonomyMaintenanceSummary.textContent, /erfolgreich übernommen/);
  assert.match(visible.taxonomyMaintenanceDetail.textContent, /7\.800\.000 wissenschaftliche Namen/);
  assert.deepEqual(messages.at(-1), {
    message: "Taxonomiereferenz erfolgreich übernommen.",
    type: "success",
  });

  await controller.refresh();
  await Promise.resolve();
  assert.equal(confirmations.length, 1);
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
