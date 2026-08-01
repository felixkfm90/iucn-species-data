import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("./public/app-taxonomy-master.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({
  clearTimeout() {},
  setTimeout() {
    return 1;
  },
});
new vm.Script(source, { filename: "app-taxonomy-master.js" }).runInContext(context);
const masterUi = context.SpeciesExplorerTaxonomyMaster;

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
    taxonomyMasterSummary: element(),
    taxonomyMasterDetail: element(),
    taxonomyMasterProgress: element(),
    taxonomyMasterDiff: element(),
    taxonomyMasterConflicts: element(),
    taxonomyMasterBuildButton: element(),
    taxonomyMasterActivateButton: element(),
    taxonomyMasterRollbackButton: element(),
  };
}

function readyStatus() {
  return {
    status: "ready",
    active: false,
    lifecycle: {
      candidate: {
        summary: { taxa: 52 },
        diff: {
          newTaxa: ["Sciurus vulgaris"],
          closedReferenceGaps: [],
          changedScientificNames: [],
          changedNames: ["Panthera pardus"],
          newSynonyms: ["Felis pardus"],
          staleTaxa: [],
          removedTaxa: [],
        },
      },
      active: { summary: { taxa: 51 } },
      conflicts: [],
      blockingConflicts: [],
      canActivate: true,
      canRollback: true,
    },
  };
}

test("Mastervorschau zeigt Differenzen und gibt nur geprüfte Aktionen frei", () => {
  const visible = elements();
  const controller = masterUi.createTaxonomyMasterController({
    state: {},
    elements: visible,
    fetchJson: async () => readyStatus(),
    escapeHtml: (value) => String(value),
    showQuickConfirm: async () => true,
    renderDatabaseStatus() {},
  });

  controller.render(readyStatus());
  assert.match(visible.taxonomyMasterSummary.textContent, /52 Taxa/);
  assert.match(visible.taxonomyMasterSummary.textContent, /bereit zur Aktivierung/);
  assert.match(visible.taxonomyMasterDiff.innerHTML, /1 Neue Taxa/);
  assert.match(visible.taxonomyMasterDiff.innerHTML, /1 Deutsche\/englische Namen/);
  assert.equal(visible.taxonomyMasterActivateButton.disabled, false);
  assert.equal(visible.taxonomyMasterRollbackButton.disabled, false);
});

test("offene fachliche Konflikte werden mit allen vier Entscheidungen dargestellt", () => {
  const visible = elements();
  const status = readyStatus();
  status.lifecycle.canActivate = false;
  status.lifecycle.conflicts = [{
    conflict_id: "conflict-1",
    canonical_scientific_name: "Panthera pardus",
    field_name: "german-name",
    conflict_type: "changed-value",
    current_value: "Leopard",
    candidate_value: "Panter",
  }];
  status.lifecycle.blockingConflicts = status.lifecycle.conflicts;
  const controller = masterUi.createTaxonomyMasterController({
    state: {},
    elements: visible,
    fetchJson: async () => status,
    escapeHtml: (value) => String(value),
    showQuickConfirm: async () => true,
    renderDatabaseStatus() {},
  });

  controller.render(status);
  assert.equal(visible.taxonomyMasterConflicts.hidden, false);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /Bisherigen Wert behalten/);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /Neuen Wert übernehmen/);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /Neuen Wert als Alias ergänzen/);
  assert.match(visible.taxonomyMasterConflicts.innerHTML, /Dauerhaft manuell schützen/);
  assert.equal(visible.taxonomyMasterActivateButton.disabled, true);
});

test("laufender Masteraufbau blockiert parallele Aktionen und zeigt Fortschritt", () => {
  const visible = elements();
  const status = {
    status: "building",
    active: true,
    message: "Master-Kandidat wird aufgebaut",
    progressPercent: 44,
    lifecycle: {},
  };
  const controller = masterUi.createTaxonomyMasterController({
    state: {},
    elements: visible,
    fetchJson: async () => status,
    escapeHtml: (value) => String(value),
    showQuickConfirm: async () => true,
    renderDatabaseStatus() {},
  });

  controller.render(status);
  assert.equal(visible.taxonomyMasterProgress.hidden, false);
  assert.equal(visible.taxonomyMasterProgress.value, 44);
  assert.equal(visible.taxonomyMasterBuildButton.disabled, true);
  assert.equal(visible.taxonomyMasterActivateButton.disabled, true);
  assert.equal(visible.taxonomyMasterRollbackButton.disabled, true);
});
