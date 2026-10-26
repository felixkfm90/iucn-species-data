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
  assert.match(sources.get("app-backup-workflow.js"), /async function refreshStatus\(/);
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
  new vm.Script(sources.get("app-backup-workflow.js")).runInContext(context);
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

function workflowStatusFixture({ backup = [{ status: "idle" }], pipeline = [{ status: "idle" }], reloadError } = {}) {
  const timers = new Map(), calls = [], controllers = {};
  let timerId = 0, reloads = 0;
  const runningReads = { backup: 0, pipeline: 0 }, maximumReads = { backup: 0, pipeline: 0 };
  const context = vm.createContext({
    clearTimeout(id) { timers.delete(id); },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
  });
  for (const file of ["app-backup-workflow.js", "app-pipeline-workflow.js"]) {
    new vm.Script(sources.get(file), { filename: file }).runInContext(context);
  }
  function node() {
    const listeners = {};
    return { textContent: "", innerHTML: "", className: "", hidden: false, disabled: false, open: false,
      dataset: {}, replaceChildren() {}, classList: { toggle() {} },
      addEventListener(type, callback) { listeners[type] = callback; },
      click() { return listeners.click?.(); }, querySelector() { return null; } };
  }
  const nodes = new Map(), state = { editMode: true };
  const elements = new Proxy({}, { get(_, key) { if (!nodes.has(key)) nodes.set(key, node()); return nodes.get(key); } });
  elements.pipelineRunNoticeOpen.textContent = "Details anzeigen";
  for (const name of ["pipelineButtons", "backupButtons", "settingsButtons", "taxonomyButtons"]) nodes.set(name, [node()]);
  const dialog = elements.pipelineDialog, close = node();
  dialog.querySelector = (selector) => selector === ".pipeline-dialog-close-button" ? close : null;
  dialog.querySelectorAll = () => [close];
  const queues = { backup: [...backup], pipeline: [...pipeline] }, last = {};
  const fetchJson = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options, undefined, "Statusprobe darf keinen POST/Start auslösen");
    const kind = url === "/api/backup/status" ? "backup" : url === "/api/pipeline/status" ? "pipeline" : "";
    assert.ok(kind, `nur Status-GETs erlaubt: ${url}`);
    runningReads[kind] += 1; maximumReads[kind] = Math.max(maximumReads[kind], runningReads[kind]);
    try {
      const next = queues[kind].length ? queues[kind].shift() : last[kind];
      if (next instanceof Error) throw next;
      const value = await (typeof next === "function" ? next() : next);
      last[kind] = value;
      return { mode: "missing", log: [], ...value };
    } finally { runningReads[kind] -= 1; }
  };
  const presentation = (kind, status) => status?.status && status.status !== "idle" ? {
    title: `${kind} ${status.status}`, detail: status.status,
    message: `${kind} ${status.status}`, messageType: "info", className: status.status,
  } : null;
  context.SpeciesExplorerPipelineWorkflow.createPipelineWorkflowController({
    state, elements, fetchJson,
    createDialogController() { return { open() { dialog.open = true; } }; },
    persistentStatusPresentation: ({ backupStatus, pipelineStatus }) => presentation("Backup", backupStatus)
      || presentation("Pipeline", pipelineStatus),
    pipelineStatusPresentation: (status) => presentation("Pipeline", status),
    backupStatusPresentation: (status) => presentation("Backup", status),
    pipelineModeLabel: (value) => value, backupLabel: () => "Backup",
    renderPipelinePreview() {}, renderBackupPreview() {}, releaseAllAudioElements() {}, soundSearchOutcome() {},
    refreshExplorerModelOnly() {}, refreshOpenSoundEditor() {}, renderDatabaseStatus() {},
    formatDate: (value) => String(value || ""), renderProcessLog() {},
    async loadData() { reloads += 1; if (reloadError) throw new Error(reloadError); },
    createBackupWorkflowController(dependencies) {
      controllers.backup = context.SpeciesExplorerBackupWorkflow.createBackupWorkflowController(dependencies);
      return controllers.backup;
    },
  }).setupPipelineControl();
  const settle = async () => { for (let turn = 0; turn < 30; turn += 1) await Promise.resolve(); };
  return { state, elements, calls, timers, controllers, queues,
    get maximumReads() { return maximumReads; }, get reloads() { return reloads; },
    settle,
    async fire(kind) {
      const id = state[`${kind}PollTimer`], timer = timers.get(id);
      assert.ok(timer, `${kind}: erwartete Statusabfrage fehlt`);
      timers.delete(id); await timer.callback(); await settle(); return timer.delay;
    },
    readCount(kind) { return calls.filter(({ url }) => url === `/api/${kind}/status`).length; },
  };
}

for (const kind of ["backup", "pipeline"]) {
  test(`${kind}: nie beantworteter Status-GET endet begrenzt und ein später Altstand ersetzt keinen frischen Abschluss`, async () => {
    let resolveOld;
    const pending = new Promise((resolve) => { resolveOld = resolve; });
    const f = workflowStatusFixture({ [kind]: [{ status: "running" }, () => pending, { status: "completed" }] });
    await f.settle();
    assert.equal(await f.fire(kind), 1000);
    const deadline = [...f.timers.values()].find((timer) => timer.delay === 15000);
    assert.ok(deadline, "Eine nie beantwortete Statusabfrage braucht eine eigene 15-Sekunden-Grenze");
    deadline.callback();
    await f.settle();
    assert.match(f.state[`${kind}StatusReadError`].message, /Zeitlimit/);
    assert.equal(f.state[`${kind}StatusSnapshot`].status, "running", "Letzter bestätigter Stand bleibt erhalten");
    assert.equal(await f.fire(kind), 1000);
    assert.equal(f.state[`${kind}StatusSnapshot`].status, "completed");
    assert.equal(f.state[`${kind}StatusReadError`], null);
    resolveOld({ status: "failed", error: "Verspäteter alter Stand" });
    await f.settle();
    assert.equal(f.state[`${kind}StatusSnapshot`].status, "completed");
    assert.equal(f.readCount(kind), 3);
    assert.ok(f.calls.every(({ url }) => /\/status$/.test(url)), "Keine Start-/Schreibwiederholung");
  });

  test(`${kind}: Statuszeitlimit erhält geschlossene Dialoge und fremde Vorschauen`, async () => {
    for (const open of [false, true]) {
      const f = workflowStatusFixture({ [kind]: [{ status: "running" }, () => new Promise(() => {})] });
      await f.settle();
      await f.fire(kind);
      f.elements.pipelineDialog.open = open;
      f.elements.pipelineDialog.dataset.previewKind = open ? "foreign-preview" : kind === "backup" ? "backup" : "pipeline-status";
      f.elements.pipelineDialog.dataset.statusKind = open ? "" : kind;
      f.elements.pipelineDialogTitle.textContent = "Unabhängige Vorschau";
      f.elements.pipelineStatusDetail.textContent = "Fremder Detailtext";
      const deadline = [...f.timers.values()].find((timer) => timer.delay === 15000);
      assert.ok(deadline, "Statuszeitlimit muss auch beim Dialogwechsel erreichbar bleiben");
      deadline.callback();
      await f.settle();
      assert.equal(f.elements.pipelineDialog.open, open, "Ein Statuszeitlimit öffnet keinen geschlossenen Dialog");
      assert.equal(f.elements.pipelineDialogTitle.textContent, "Unabhängige Vorschau");
      assert.equal(f.elements.pipelineStatusDetail.textContent, "Fremder Detailtext");
      assert.equal(f.state[`${kind}StatusSnapshot`].status, "running");
      assert.match(f.state[`${kind}StatusReadError`].message, /Zeitlimit/);
    }
  });

  test(`${kind}: wiederholt nicht beantwortete GETs enden nach dem vorhandenen begrenzten Backoff`, async () => {
    const never = () => new Promise(() => {});
    const f = workflowStatusFixture({ [kind]: [{ status: "running" }, never, never, never, never, never] });
    await f.settle();
    await f.fire(kind);
    for (const delay of [1000, 2000, 4000, 8000, null]) {
      const deadline = [...f.timers.values()].find((timer) => timer.delay === 15000);
      assert.ok(deadline);
      deadline.callback();
      await f.settle();
      assert.equal(f.state[`${kind}StatusReadError`].retryDelay, delay);
      if (delay !== null) assert.equal(await f.fire(kind), delay);
    }
    assert.equal(f.state[`${kind}PollTimer`], null);
    assert.equal(f.readCount(kind), 6);
    assert.equal(f.state[`${kind}StatusSnapshot`].status, "running");
  });
}

test("Gemeinsamer Workflow-Statusleser bricht nur GETs ab, entfernt Timer und sperrt Schreibendpunkte", async () => {
  const timers = new Map(); let nextTimer = 0;
  const context = vm.createContext({ AbortController,
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  new vm.Script(sources.get("app-backup-workflow.js")).runInContext(context);
  const read = context.SpeciesExplorerBackupWorkflow.readWorkflowStatus;
  let signal, readCalls = 0;
  const pending = read((url, options) => {
    readCalls += 1;
    assert.equal(url, "/api/backup/status");
    assert.deepEqual(Object.keys(options), ["signal"]);
    signal = options.signal;
    return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new Error("Abgebrochen"))));
  }, "/api/backup/status");
  assert.equal(signal.aborted, false);
  assert.equal([...timers.values()][0].delay, 15000);
  [...timers.values()][0].callback();
  await assert.rejects(pending, /Zeitlimit/);
  assert.equal(signal.aborted, true);
  assert.equal(timers.size, 0);
  for (const url of ["/api/backup/start", "/api/pipeline/start", "/api/backup/status?force=1"]) {
    await assert.rejects(read(() => { readCalls += 1; }, url), /Unbekannter lesender Workflowstatus/);
  }
  assert.equal(readCalls, 1, "Schreib-/Fremdendpunkte erreichen Fetch nicht");
  assert.equal(timers.size, 0);
  assert.deepEqual(await read(async () => ({ status: "idle" }), "/api/pipeline/status"), { status: "idle" });
  assert.equal(timers.size, 0, "Erfolgreiche Antworten entfernen ihr Zeitlimit");
  await assert.rejects(read(async () => { throw new Error("Lesefehler"); }, "/api/backup/status"), /Lesefehler/);
  assert.equal(timers.size, 0, "Auch sofortige Lesefehler entfernen ihr Zeitlimit");
});

const ownedGuidedReview = { status: "awaiting-review", guidedSpeciesCreation: true,
  creationId: "own-creation", runId: "own-run", targets: [{ slug: "testusavis" }],
  reviewAssets: [{ safeName: "Auditvogel", type: "sound" }] };

test("gespeicherte Artanlage mit Medien öffnet beim Statuslesen keine allgemeine Zwangsprüfung", async () => {
  const f = workflowStatusFixture({ pipeline: [ownedGuidedReview] });
  let genericOpened = 0;
  f.state.openAssetReview = () => { genericOpened += 1; };
  f.state.resumeNewSpeciesCreation = () => {};
  await f.settle();
  assert.equal(genericOpened, 0);
  assert.equal(f.elements.pipelineRunNoticeOpen.textContent, "Artanlage fortsetzen");
  assert.equal(await f.fire("pipeline"), 1000);
  assert.equal(genericOpened, 0, "auch die nächste Abfrage darf keinen Dialog erzwingen");
});

test("beide Statusöffner setzen den gespeicherten Artauftrag erst auf ausdrücklichen Klick fort", async () => {
  for (const opener of ["pipelineRunNoticeOpen", "pipelineMenuButton"]) {
    const f = workflowStatusFixture({ pipeline: [ownedGuidedReview] });
    let resumed = 0;
    f.state.resumeNewSpeciesCreation = () => { resumed += 1; };
    await f.settle();
    assert.equal(resumed, 0);
    f.elements[opener].click(); await f.settle();
    assert.equal(resumed, 1);
    assert.equal(f.elements.pipelineDialog.open, false, "kein konkurrierender allgemeiner Statusdialog");
    assert.equal(f.calls.some(({ options }) => options), false);
  }
});

test("normale und nicht eindeutig gespeicherte Medienprüfungen behalten ihren bisherigen Weg", async () => {
  for (const patch of [{ guidedSpeciesCreation: false }, { creationId: "" }, { targets: [] }]) {
    const f = workflowStatusFixture({ pipeline: [{ ...ownedGuidedReview, ...patch }] });
    let genericOpened = 0, resumed = 0;
    f.state.openAssetReview = () => { genericOpened += 1; };
    f.state.resumeNewSpeciesCreation = () => { resumed += 1; };
    await f.settle();
    assert.equal(genericOpened, 1);
    assert.equal(resumed, 0);
    assert.equal(f.elements.pipelineRunNoticeOpen.textContent, "Details anzeigen");
  }
});

test("veralteter Artanlage-Status bei Lesefehler bietet Statusprüfung statt unbestätigter Fortsetzung", async () => {
  const f = workflowStatusFixture({ pipeline: [ownedGuidedReview, new Error("Status nicht bestätigt")] });
  let resumed = 0;
  f.state.resumeNewSpeciesCreation = () => { resumed += 1; };
  await f.settle(); await f.fire("pipeline");
  assert.equal(f.elements.pipelineRunNoticeOpen.textContent, "Details anzeigen");
  f.elements.pipelineRunNoticeOpen.click(); await f.settle();
  assert.equal(resumed, 0);
  assert.equal(f.elements.pipelineDialog.open, true);
});

for (const kind of ["backup", "pipeline"]) {
  test(`${kind}: ein vorübergehender Status-Lesefehler wird begrenzt erneut gelesen`, async () => {
    const f = workflowStatusFixture({ [kind]: [
      { status: "running" }, new Error("kurzzeitig nicht erreichbar"), { status: "completed" },
    ] });
    await f.settle();
    assert.equal(f.state[`${kind}StatusSnapshot`].status, "running");
    assert.equal(await f.fire(kind), 1000);
    if (kind === "pipeline") assert.equal(f.elements.pipelineButtons[0].disabled, true);
    const readsBeforeOpen = f.readCount(kind);
    f.elements.pipelineMenuButton.click(); await f.settle();
    console.log(JSON.stringify({ probe: `${kind}-read-failure`, readsBeforeOpen,
      readsAfterOpen: f.readCount(kind), timers: f.timers.size,
      snapshot: f.state[`${kind}StatusSnapshot`].status,
      notice: f.elements.pipelineRunNoticeTitle.textContent }));
    assert.equal(f.readCount(kind), readsBeforeOpen + 1, "Statusdialog-Wiederöffnung muss frisch lesen");
    assert.equal(f.state[`${kind}StatusSnapshot`].status, "completed");
    if (kind === "pipeline") assert.equal(f.elements.pipelineButtons[0].disabled, false);
    assert.equal(f.state[`${kind}PollTimer`], null);
    assert.equal(f.calls.some(({ options }) => options), false);
  });

  test(`${kind}: Status-Backoff endet und Wiederöffnung erneuert nur die GET-Abfragen`, async () => {
    const f = workflowStatusFixture({ [kind]: [{ status: "running" },
      ...Array.from({ length: 5 }, () => new Error("weiterhin nicht erreichbar")), { status: "completed" }] });
    await f.settle();
    assert.equal(await f.fire(kind), 1000);
    for (const delay of [1000, 2000, 4000, 8000]) assert.equal(await f.fire(kind), delay);
    assert.equal(f.readCount(kind), 6);
    assert.equal(f.state[`${kind}StatusSnapshot`].status, "running");
    assert.equal(f.state[`${kind}StatusReadError`].retryDelay, null);
    assert.equal(f.state[`${kind}PollTimer`], null);
    f.elements.pipelineMenuButton.click(); await f.settle();
    assert.equal(f.readCount(kind), 7);
    assert.equal(f.state[`${kind}StatusSnapshot`].status, "completed");
    assert.equal(f.state[`${kind}StatusReadError`], null);
    assert.equal(f.calls.some(({ options }) => options), false);
  });

  test(`${kind}: eine ältere offene Statusantwort ersetzt keinen jüngeren gebundenen Stand`, async () => {
    let oldResolve, freshResolve;
    const f = workflowStatusFixture({ [kind]: [
      () => new Promise((resolve) => { oldResolve = resolve; }),
      () => new Promise((resolve) => { freshResolve = resolve; }),
    ] });
    await f.settle();
    f.state[`${kind}StatusSnapshot`] = { status: "running", mode: "missing", log: [] };
    f.elements.pipelineMenuButton.click(); f.elements.pipelineMenuButton.click(); await f.settle();
    assert.equal(f.readCount(kind), 1, "Wiederöffnungen dürfen keine parallelen Reads erzeugen");
    oldResolve({ status: "idle" }); await f.settle();
    assert.equal(f.readCount(kind), 2, "eine zusammengefasste frische Abfrage muss folgen");
    assert.equal(f.state[`${kind}StatusSnapshot`].status, "running", "überholte Antwort ignorieren");
    freshResolve({ status: "completed" }); await f.settle();
    assert.equal(f.state[`${kind}StatusSnapshot`].status, "completed");
    assert.equal(f.maximumReads[kind], 1);
    assert.equal(f.timers.size, 0);
  });

  test(`${kind}: automatischer GET-Retry erholt sich und setzt den Backoff zurück`, async () => {
    const f = workflowStatusFixture({ [kind]: [{ status: "running" }, new Error("erste Lesestörung"),
      { status: "running" }, new Error("zweite Lesestörung"), { status: "completed" }] });
    await f.settle(); await f.fire(kind);
    assert.equal(f.state[`${kind}StatusReadError`].retryDelay, 1000);
    assert.equal(f.timers.size, 1);
    assert.equal(await f.fire(kind), 1000);
    assert.equal(f.state[`${kind}StatusReadError`], null);
    assert.equal(await f.fire(kind), 1000);
    assert.equal(f.state[`${kind}StatusReadError`].retryDelay, 1000, "neue Fehlerfolge beginnt wieder bei 1 Sekunde");
    await f.fire(kind);
    assert.equal(f.state[`${kind}StatusSnapshot`].status, "completed");
    assert.equal(f.maximumReads[kind], 1);
    assert.equal(f.timers.size, 0);
  });

  test(`${kind}: anfänglicher Statusausfall ohne Snapshot bleibt ehrlich und frisch lesbar`, async () => {
    const f = workflowStatusFixture({ [kind]: Array.from({ length: 5 }, () => new Error("Anfangsstatus unbekannt")) });
    await f.settle();
    for (const delay of [1000, 2000, 4000, 8000]) assert.equal(await f.fire(kind), delay);
    assert.equal(f.state[`${kind}StatusSnapshot`], undefined);
    assert.equal(f.state[`${kind}PollTimer`], null);
    f.queues[kind].push({ status: "running" });
    f.elements.pipelineRunNoticeOpen.click(); await f.settle();
    assert.equal(f.state[`${kind}StatusSnapshot`].status, "running");
    assert.equal(f.state[`${kind}StatusReadError`], null);
    assert.equal(f.elements.pipelineDialog.open, true);
    assert.equal(f.maximumReads[kind], 1);
    assert.equal(f.calls.some(({ options }) => options), false);
  });

  test(`${kind}: ein bereits abgelöster Timer kann den neuen Statuspoll nicht überschreiben`, async () => {
    const f = workflowStatusFixture({ [kind]: [{ status: "running" }, { status: "running" }] });
    await f.settle();
    const oldTimer = f.timers.get(f.state[`${kind}PollTimer`]);
    f.elements.pipelineMenuButton.click(); await f.settle();
    const freshTimerId = f.state[`${kind}PollTimer`], reads = f.readCount(kind);
    oldTimer.callback(); await f.settle();
    assert.equal(f.readCount(kind), reads);
    assert.equal(f.state[`${kind}PollTimer`], freshTimerId);
    assert.equal(f.timers.size, 1);
  });
}

test("Statusfehler bleibt bei einer erfolgreichen Abfrage des anderen Dienstes sichtbar", async () => {
  const f = workflowStatusFixture({ backup: [{ status: "running" }, new Error("Backup-Lesefehler")],
    pipeline: [{ status: "running" }, { status: "running" }] });
  await f.settle(); await f.fire("backup");
  assert.match(f.elements.pipelineRunNoticeTitle.textContent, /Backup-Status nicht verfügbar/);
  await f.fire("pipeline");
  console.log(JSON.stringify({ probe: "other-service-render", notice: f.elements.pipelineRunNoticeTitle.textContent,
    backupSnapshot: f.state.backupStatusSnapshot.status, backupReads: f.readCount("backup"), pipelineReads: f.readCount("pipeline") }));
  assert.match(f.elements.pipelineRunNoticeTitle.textContent, /Backup-Status nicht verfügbar/);
  assert.match(f.elements.pipelineRunNoticeDetail.textContent, /Backup-Lesefehler/);
  assert.equal(f.calls.some(({ options }) => options), false);
});

test("Fehler einer Abschlussansicht wiederholt weder Statusretry noch Abschlusswirkung", async () => {
  const f = workflowStatusFixture({ pipeline: [{ status: "running" }, { status: "completed" }],
    reloadError: "Modellansicht nicht erreichbar" });
  await f.settle(); await f.fire("pipeline");
  assert.equal(f.state.pipelineStatusSnapshot.status, "completed");
  assert.equal(f.state.pipelineWasRunning, false);
  assert.equal(f.state.pipelineStatusReadError, null);
  assert.equal(f.reloads, 1);
  assert.equal(f.state.pipelinePollTimer, null);
  assert.match(f.elements.pipelineRunNoticeTitle.textContent, /Ansicht/);
  f.elements.pipelineRunNoticeOpen.click(); await f.settle();
  assert.equal(f.readCount("pipeline"), 3);
  assert.equal(f.reloads, 1, "Modellnachladen/Abschluss nicht blind wiederholen");
  assert.equal(f.calls.some(({ options }) => options), false);
});

test("zwei getrennte Statusfehler werden nur durch den jeweils eigenen erfolgreichen GET aufgehoben", async () => {
  const f = workflowStatusFixture({ backup: [{ status: "running" }, new Error("Backup fehlt"), { status: "completed" }],
    pipeline: [{ status: "running" }, new Error("Pipeline fehlt")] });
  await f.settle(); await f.fire("backup"); await f.fire("pipeline");
  assert.match(f.elements.pipelineRunNoticeTitle.textContent, /Backup-Status nicht verfügbar/);
  assert.match(f.elements.pipelineRunNoticeTitle.textContent, /Pipeline-Status nicht verfügbar/);
  await f.controllers.backup.refreshStatus(); await f.settle();
  assert.equal(f.state.backupStatusReadError, null);
  assert.match(f.elements.pipelineRunNoticeTitle.textContent, /Pipeline-Status nicht verfügbar/);
  assert.doesNotMatch(f.elements.pipelineRunNoticeTitle.textContent, /Backup/);
  assert.equal(f.maximumReads.backup, 1);
  assert.equal(f.maximumReads.pipeline, 1);
});

for (const kind of ["backup", "pipeline"]) {
  for (const status of kind === "backup" ? ["idle", "completed", "running"] : ["idle", "completed", "running", "awaiting-review"]) {
    test(`${kind}: frischer ${status}-Status ersetzt den geöffneten Fehlerdialog vollständig`, async () => {
      const f = workflowStatusFixture({ [kind]: [new Error("anfänglicher Statusfehler"), { status }] });
      await f.settle();
      f.elements.pipelineRunNoticeOpen.click();
      assert.match(f.elements.pipelineDialogTitle.textContent, /Status nicht verfügbar/);
      await f.settle();
      assert.equal(f.state[`${kind}StatusReadError`], null);
      assert.doesNotMatch(f.elements.pipelineDialogTitle.textContent, /nicht verfügbar/);
      assert.doesNotMatch(f.elements.pipelineMessage.textContent, /anfänglicher Statusfehler/);
      if (status === "idle") assert.match(f.elements.pipelineMessage.textContent, /Kein .* aktiv/);
      else assert.equal(f.elements.pipelineDialogTitle.textContent, `${kind === "backup" ? "Backup" : "Pipeline"} ${status}`);
      assert.equal(f.calls.some(({ options }) => options), false);
    });
  }

  test(`${kind}: Statusrecovery verändert keine geöffnete Startvorschau des anderen Dienstes`, async () => {
    const f = workflowStatusFixture({ [kind]: [{ status: "running" }, { status: "completed" }] });
    await f.settle();
    f.elements.pipelineDialog.open = true;
    f.elements.pipelineDialog.dataset.previewKind = kind === "backup" ? "pipeline" : "backup";
    f.elements.pipelineDialog.dataset.statusKind = "";
    f.elements.pipelineDialogTitle.textContent = "Eigene Startvorschau";
    f.elements.pipelineMessage.textContent = "Vorschau unverändert";
    await f.fire(kind);
    assert.equal(f.elements.pipelineDialogTitle.textContent, "Eigene Startvorschau");
    assert.equal(f.elements.pipelineMessage.textContent, "Vorschau unverändert");
  });
}

for (const pipelineStatus of ["running", "completed"]) {
  for (const opener of ["pipelineRunNoticeOpen", "pipelineMenuButton"]) {
    test(`Backupfehler hat bei ${opener} Vorrang vor dem normalen Pipeline-Status ${pipelineStatus}`, async () => {
      const f = workflowStatusFixture({ backup: Array.from({ length: 5 }, () => new Error("Backup weiterhin unbekannt")),
        pipeline: [{ status: pipelineStatus }] });
      await f.settle();
      for (const delay of [1000, 2000, 4000, 8000]) assert.equal(await f.fire("backup"), delay);
      f.queues.backup.push({ status: "completed" });
      const pipelineReads = f.readCount("pipeline");
      f.elements[opener].click(); await f.settle();
      assert.equal(f.readCount("backup"), 6);
      assert.equal(f.readCount("pipeline"), pipelineReads, "Fehleröffner darf nicht nur den gesunden Dienst lesen");
      assert.equal(f.elements.pipelineDialogTitle.textContent, "Backup completed");
      assert.equal(f.state.backupStatusReadError, null);
    });
  }
}

test("Öffnen eines gemeinsamen Fehlerhinweises erneuert beide betroffenen GET-Folgen", async () => {
  const errors = () => Array.from({ length: 5 }, () => new Error("Status weiterhin unbekannt"));
  const f = workflowStatusFixture({ backup: errors(), pipeline: errors() });
  await f.settle();
  for (const kind of ["backup", "pipeline"]) {
    for (const delay of [1000, 2000, 4000, 8000]) assert.equal(await f.fire(kind), delay);
    f.queues[kind].push({ status: "completed" });
  }
  f.elements.pipelineRunNoticeOpen.click(); await f.settle();
  assert.equal(f.readCount("backup"), 6);
  assert.equal(f.readCount("pipeline"), 6);
  assert.equal(f.state.backupStatusReadError, null);
  assert.equal(f.state.pipelineStatusReadError, null);
  assert.equal(f.elements.pipelineDialogTitle.textContent, "Pipeline completed", "gemeinsamer Fehlerdialog bleibt dem zuerst gezeigten Dienst zugeordnet");
  assert.equal(f.maximumReads.backup, 1);
  assert.equal(f.maximumReads.pipeline, 1);
  assert.equal(f.calls.some(({ options }) => options), false);
});

for (const statusKind of ["", "backup"]) {
  test(`Pipeline-GET-Fehler verändert keine Details im fremden Backup-${statusKind ? "Statusdialog" : "Vorschaudialog"}`, async () => {
    const f = workflowStatusFixture({ pipeline: [{ status: "running" }, new Error("Pipeline-Lesefehler")],
      backup: [{ status: "running" }] });
    await f.settle();
    f.elements.pipelineDialog.open = true;
    f.elements.pipelineDialog.dataset.previewKind = "backup";
    f.elements.pipelineDialog.dataset.statusKind = statusKind;
    f.elements.pipelineDialogTitle.textContent = "Eigener Backupdialog";
    f.elements.pipelineMessage.textContent = "Eigene Backupmeldung";
    f.elements.pipelineStatusDetail.textContent = "Backup 25 Prozent";
    f.elements.pipelineStatusDetail.className = "pipeline-dialog-status running";
    await f.fire("pipeline");
    assert.equal(f.elements.pipelineDialogTitle.textContent, "Eigener Backupdialog");
    assert.equal(f.elements.pipelineMessage.textContent, "Eigene Backupmeldung");
    assert.equal(f.elements.pipelineStatusDetail.textContent, "Backup 25 Prozent");
    assert.equal(f.elements.pipelineStatusDetail.className, "pipeline-dialog-status running");
    assert.match(f.elements.pipelineRunNoticeTitle.textContent, /Pipeline-Status nicht verfügbar/);
    assert.equal(f.calls.some(({ options }) => options), false);
  });
}

test("Statusdialog: Backup und Pipeline fordern hidden, der ausdrückliche Aktionswähler hebt es auf", async () => {
  for (const kind of ["backup", "pipeline"]) {
    for (const status of ["running", "completed", "failed"]) {
      const f = workflowStatusFixture({ [kind]: [{ status }] });
      await f.settle();
      f.elements.pipelineRunNoticeOpen.click(); await f.settle();
      assert.equal(f.elements.pipelineDialog.open, true, `${kind}/${status}: echter Statusöffner`);
      assert.equal(f.elements.pipelineModeChoice.hidden, true, `${kind}/${status}: keine neue Aktionsauswahl`);
      assert.equal(f.elements.pipelineStartButton.hidden, true);
      assert.equal(f.elements.pipelineStartButton.disabled, true);
      assert.ok(f.calls.every(({ url }) => /\/status$/.test(url)), "Statusöffnen bleibt schreibfrei");
    }
  }
  const chooser = workflowStatusFixture();
  await chooser.settle(); chooser.elements.pipelineMenuButton.click(); await chooser.settle();
  assert.equal(chooser.elements.pipelineDialog.open, true);
  assert.equal(chooser.elements.pipelineModeChoice.hidden, false, "Die ausdrückliche Aktionsauswahl bleibt sichtbar");
});
