import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const moduleDefinitions = [
  ["app-pipeline-workflow.js", "SpeciesExplorerPipelineWorkflow", "createPipelineWorkflowController"],
  [
    "app-taxonomy-maintenance.js",
    "SpeciesExplorerTaxonomyMaintenance",
    "createTaxonomyMaintenanceController",
  ],
  ["app-backup-workflow.js", "SpeciesExplorerBackupWorkflow", "createBackupWorkflowController"],
  ["app-new-species-workflow.js", "SpeciesExplorerNewSpeciesWorkflow", "createNewSpeciesWorkflowController"],
  ["app-species-editor.js", "SpeciesExplorerSpeciesEditor", "createSpeciesEditorController"],
  ["app-editor-general.js", "SpeciesExplorerGeneralEditor", "createGeneralEditorController"],
  ["app-editor-taxonomy.js", "SpeciesExplorerTaxonomyEditor", "createTaxonomyEditorController"],
  ["app-editor-map.js", "SpeciesExplorerMapEditor", "createMapEditorController"],
  ["app-editor-sound.js", "SpeciesExplorerSoundEditor", "createSoundEditorController"],
  ["app-editor-portrait.js", "SpeciesExplorerPortraitEditor", "createPortraitEditorController"],
  ["app-detail-view.js", "SpeciesExplorerDetailView", "createDetailViewRenderer"],
];

const sources = new Map(await Promise.all(moduleDefinitions.map(async ([file]) => [
  file,
  await readFile(new URL(`./public/${file}`, import.meta.url), "utf8"),
])));
const appSource = await readFile(new URL("./public/app.js", import.meta.url), "utf8");
const dashboardSource = await readFile(new URL("./public/app-dashboard.js", import.meta.url), "utf8");
const htmlSource = await readFile(new URL("./public/index.html", import.meta.url), "utf8");

test("ausgelagerte Explorer-Abläufe veröffentlichen jeweils genau ihre Fabrik", () => {
  for (const [file, globalName, factoryName] of moduleDefinitions) {
    const context = vm.createContext({});
    new vm.Script(sources.get(file), { filename: file }).runInContext(context);
    assert.equal(typeof context[globalName]?.[factoryName], "function", `${file}: ${factoryName}`);
  }
});

test("fachliche Blöcke liegen in ihren eigenen Modulen", () => {
  assert.match(sources.get("app-pipeline-workflow.js"), /function setupPipelineControl\(\)/);
  assert.doesNotMatch(sources.get("app-pipeline-workflow.js"), /async function refreshBackupStatus\(\)/);
  assert.match(sources.get("app-backup-workflow.js"), /async function refreshStatus\(\)/);
  assert.match(sources.get("app-backup-workflow.js"), /\/api\/backup\/start/);
  assert.match(sources.get("app-new-species-workflow.js"), /function setupNewSpeciesCreator\(\)/);
  assert.match(sources.get("app-species-editor.js"), /function setupSpeciesEditor\(species\)/);
  assert.doesNotMatch(sources.get("app-species-editor.js"), /let previewToken/);
  assert.match(sources.get("app-editor-general.js"), /let previewToken/);
  assert.match(sources.get("app-editor-taxonomy.js"), /let previewToken/);
  assert.match(sources.get("app-editor-map.js"), /mapPreviewToken/);
  assert.match(sources.get("app-editor-sound.js"), /soundPreviewToken/);
  assert.match(sources.get("app-editor-portrait.js"), /portraitPreviewToken/);
  assert.match(sources.get("app-detail-view.js"), /function renderDetail\(species\)/);
  assert.match(sources.get("app-detail-view.js"), /class="explorer-audio"/);
  assert.match(dashboardSource, /function renderDatabaseStatus\(stateName = ""\)/);
});

test("app.js bleibt Verdrahtung und enthält keine zurückverlagerten Großblöcke", () => {
  assert.doesNotMatch(appSource, /function setupPipelineControl\(\)/);
  assert.doesNotMatch(appSource, /function setupNewSpeciesCreator\(\)/);
  assert.doesNotMatch(appSource, /function setupSpeciesEditor\(species\)/);
  assert.doesNotMatch(appSource, /function renderDetail\(species\)/);
  assert.doesNotMatch(appSource, /function renderDatabaseStatus\(/);
  assert.doesNotMatch(appSource, /function setupAssetReview\(\)/);
  assert.ok(appSource.split(/\r?\n/).length < 600, "app.js soll als kompakte Verdrahtung erhalten bleiben");
});

test("HTML lädt alle Fachmodule vor app.js in Abhängigkeitsreihenfolge", () => {
  const order = [
    "app-new-species-workflow.js",
    "app-editor-map.js",
    "app-editor-sound.js",
    "app-editor-portrait.js",
    "app-editor-general.js",
    "app-editor-taxonomy.js",
    "app-species-editor.js",
    "app-detail-view.js",
    "app-backup-workflow.js",
    "app-pipeline-workflow.js",
    "app-taxonomy-progress.js",
    "app-taxonomy-maintenance.js",
    "app-taxonomy-master.js",
    "app-taxonomy-database.js",
    "app-dashboard.js",
    "app.js",
  ];
  let previous = -1;
  for (const file of order) {
    const current = htmlSource.indexOf(`src="/${file}"`);
    assert.ok(current > previous, `${file} muss nach dem vorherigen Modul geladen werden`);
    previous = current;
  }
});

test("Datenbank-Aktionen zeigen Hauptaufgaben und bündeln alle Sonderwege einmalig unter Weitere Aktionen", () => {
  const chooser = htmlSource.slice(htmlSource.indexOf('id="pipeline-mode-choice"'), htmlSource.indexOf('class="edit-preview pipeline-preview"'));
  const split = chooser.indexOf('<details id="pipeline-more-actions"');
  assert.ok(split > 0);
  const main = chooser.slice(0, split), more = chooser.slice(split);
  assert.match(more, /^<details id="pipeline-more-actions" class="action-group database-more-actions">/);
  assert.match(main, /Artdaten und Medien aktualisieren/);
  for (const mode of ["all", "missing"]) assert.match(main, new RegExp(`data-pipeline-mode="${mode}"`));
  for (const action of ["pause-build", "resume-build", "update", "open"]) {
    assert.match(main, new RegExp(`data-taxonomy-database-action="${action}"`));
  }
  for (const [attribute, value] of [
    ["data-pipeline-mode", "manual-maps"], ["data-pipeline-mode", "nc-sounds"], ["data-pipeline-mode", "cleanup"],
    ["data-taxonomy-database-action", "build-baseline"], ["data-taxonomy-database-action", "rollback"],
    ["data-taxonomy-database-action", "storage"], ["data-backup-action", "nas"], ["data-settings-action", "backup-path"],
  ]) {
    const pattern = new RegExp(`${attribute}="${value}"`, "g");
    assert.equal([...chooser.matchAll(pattern)].length, 1, `${value}: genau ein vorhandener Einstieg`);
    assert.doesNotMatch(main, pattern);
    assert.match(more, pattern);
  }
  assert.doesNotMatch(main, /data-taxonomy-identity-open/);
  assert.equal([...more.matchAll(/data-taxonomy-identity-open/g)].length, 1);
  assert.match(main, /id="taxonomy-master-conflicts"[^>]*\bhidden\b/);
  assert.match(main, /id="taxonomy-maintenance-conflicts"[^>]*\bhidden\b/);
  assert.match(more, /data-taxonomy-database-action="build-baseline" hidden/);
  assert.match(more, /<details class="action-group action-group-danger">/);
});

test("Weitere Aktionen sind beim Wiederöffnen geschlossen; Navigation bleibt schreibfrei und Sonderläufe bleiben Vorschauen", async () => {
  const context = vm.createContext({ clearTimeout() {}, setTimeout() { return 1; } });
  new vm.Script(sources.get("app-pipeline-workflow.js")).runInContext(context);
  function node() {
    const listeners = {};
    return { textContent: "", innerHTML: "", hidden: false, disabled: false, open: false, dataset: {},
      classList: { toggle() {} }, addEventListener(type, fn) { listeners[type] = fn; },
      click() { return listeners.click?.(); } };
  }
  const nodes = new Map();
  const elements = new Proxy({}, { get(_, key) { if (!nodes.has(key)) nodes.set(key, node()); return nodes.get(key); } });
  const dialog = elements.pipelineDialog, close = node(), more = node(), technical = node();
  more.open = true;
  technical.open = true;
  dialog.querySelector = (selector) => selector === "#pipeline-more-actions" ? more
    : selector === "#taxonomy-master-technical-details" ? technical : close;
  dialog.querySelectorAll = () => [close];
  for (const name of ["pipelineButtons", "backupButtons", "settingsButtons", "taxonomyButtons"]) nodes.set(name, []);
  const modes = ["all", "missing", "manual-maps", "nc-sounds", "cleanup"];
  nodes.set("pipelineButtons", modes.map((mode) => ({ ...node(), dataset: { pipelineMode: mode } })));
  const calls = [];
  let previewFails = false, statusRefreshes = 0;
  const state = { editMode: true, refreshTaxonomyMaintenanceStatus() { statusRefreshes += 1; } };
  const fetchJson = async (url, options) => {
    calls.push({ url, options });
    if (url === "/api/pipeline/status") return { status: "idle", log: [] };
    assert.equal(url, "/api/pipeline/preview", "kein Start durch Navigation");
    if (previewFails) throw new Error("preview unavailable");
    return { token: "preview", tokensAvailable: true, hasWork: true };
  };
  context.SpeciesExplorerPipelineWorkflow.createPipelineWorkflowController({
    state, elements, fetchJson,
    createDialogController({ closeButtons }) {
      for (const button of closeButtons) button.addEventListener("click", () => { dialog.open = false; });
      return { open() { dialog.open = true; } };
    },
    persistentStatusPresentation: () => null, pipelineStatusPresentation: () => null,
    backupStatusPresentation: () => null, pipelineModeLabel: (mode) => mode, backupLabel: () => "Backup",
    renderPipelinePreview: () => ({ html: "preview", warning: "" }), renderBackupPreview() {},
    releaseAllAudioElements() {}, soundSearchOutcome() {}, refreshExplorerModelOnly() {}, refreshOpenSoundEditor() {},
    loadData() {}, renderDatabaseStatus() {}, formatDate: (value) => value, renderProcessLog() {},
    createBackupWorkflowController: () => ({ reset() {}, bind() {} }),
  }).setupPipelineControl();
  await Promise.resolve();
  elements.pipelineMenuButton.click();
  assert.equal(dialog.open, true);
  assert.equal(more.open, false);
  assert.equal(technical.open, false);
  assert.equal(elements.pipelineModeChoice.hidden, false);
  assert.equal(elements.pipelineStartButton.hidden, true);
  assert.equal(statusRefreshes, 1);
  assert.ok(calls.every(({ options }) => !options));
  more.open = true; technical.open = true; close.click(); assert.equal(dialog.open, false);
  elements.pipelineMenuButton.click(); assert.equal(more.open, false);
  assert.equal(technical.open, false, "Technische Quellenhinweise sind nach Wiederöffnung eingeklappt");
  for (const mode of modes) {
    await elements.pipelineButtons.find((button) => button.dataset.pipelineMode === mode).click();
    assert.equal(JSON.parse(calls.at(-1).options.body).mode, mode);
    assert.equal(elements.pipelinePreview.hidden, false);
    close.click(); elements.pipelineMenuButton.click();
    assert.equal(more.open, false);
  }
  previewFails = true;
  await elements.pipelineButtons[0].click();
  assert.match(elements.pipelineMessage.textContent, /preview unavailable/);
  assert.equal(elements.pipelineStartButton.disabled, true);
  close.click(); elements.pipelineMenuButton.click();
  assert.equal(dialog.open, true);
  assert.equal(elements.pipelineMessage.hidden, true);
  assert.ok(calls.every(({ url }) => !url.endsWith("/start")));
});
