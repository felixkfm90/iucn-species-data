import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const moduleDefinitions = [
  ["app-pipeline-workflow.js", "SpeciesExplorerPipelineWorkflow", "createPipelineWorkflowController"],
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
    "app.js",
  ];
  let previous = -1;
  for (const file of order) {
    const current = htmlSource.indexOf(`src="/${file}"`);
    assert.ok(current > previous, `${file} muss nach dem vorherigen Modul geladen werden`);
    previous = current;
  }
});
