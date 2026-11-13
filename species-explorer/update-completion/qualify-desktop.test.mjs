import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import test from "node:test";
import { assertQualificationFixture, createQualificationWorkspace, qualificationEnvironment,
  prepareQualificationTaxonomy, readQualificationState, removeQualificationFixture,
  markQualificationServerActive, installQualificationEnvironment } from "./qualify-desktop-fixture.mjs";
import { createQualificationRecorder, createSuppressedSystemSpawn, parseQualificationArguments,
  qualificationRequestAllowed, runDesktopQualification, startQualificationServer } from "./qualify-desktop.mjs";

async function workspace(t) {
  const fixture = await createQualificationWorkspace();
  t.after(() => removeQualificationFixture(fixture));
  return fixture;
}

test("Abschirmung: nur ausdrückliche vier Prüfziele; Node startet keine Desktopprobe", async () => {
  for (const action of ["none", "exit-explorer", "shutdown", "restart"]) {
    assert.deepEqual(parseQualificationArguments(["--action", action]), { action });
  }
  for (const args of [[], ["--action", "shutdown", "--execute"], ["--root", "D:\\Arten-Explorer"], ["--action", "/r"], ["--countdown", "0"]]) {
    assert.throws(() => parseQualificationArguments(args), /Prüfziel/);
  }
  assert.deepEqual(parseQualificationArguments(["--help"]), { help: true });
  await assert.rejects(runDesktopQualification({ action: "restart" }), /Electron/);
});

test("Abschirmung: eigene Pfade und Besitzbindung; fremde Git- und Speicherumgebung wird verworfen", async (t) => {
  const f = await workspace(t);
  assert.equal(assertQualificationFixture(f), f);
  const env = qualificationEnvironment(f, { SystemRoot: "C:\\Windows", FN_EXPLORER_DATA_ROOT: "X:\\productive",
    IUCN_TAXONOMY_DIR: "Y:\\original", FN_LIGHTROOM_SEARCH_ROOT: "Z:\\original",
    GIT_DIR: "D:\\Arten-Explorer\\.git", GIT_WORK_TREE: "D:\\Arten-Explorer", GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.hooksPath", GIT_CONFIG_VALUE_0: "C:\\original-hooks" });
  assert.equal(env.FN_EXPLORER_DATA_ROOT, f.dataRoot);
  assert.equal(env.IUCN_TAXONOMY_DIR, f.taxonomyRoot);
  assert.equal(env.FN_LIGHTROOM_SEARCH_ROOT, f.searchRoot);
  assert.equal(env.IUCN_NAS_BACKUP_DIR, f.nasRoot);
  assert.equal(env.GIT_DIR, undefined); assert.equal(env.GIT_WORK_TREE, undefined); assert.equal(env.GIT_CONFIG_COUNT, undefined);
  assert.equal(env.GIT_CONFIG_GLOBAL, f.gitConfig); assert.equal(env.GIT_CONFIG_NOSYSTEM, "1");
  assert.throws(() => assertQualificationFixture({ ...f, dataRoot: "D:\\Arten-Explorer\\data" }), /Prüfpfad/);
  assert.throws(() => assertQualificationFixture({ ...f, nonce: "foreign" }), /Prüfprozess/);
  assert.throws(() => assertQualificationFixture({ ...f, ownerPid: process.pid + 1 }), /Prüfprozess/);
  await assert.rejects(fs.access(path.join(f.repoRoot, "storage-path.json")), { code: "ENOENT" });
  markQualificationServerActive(f, true);
  await assert.rejects(removeQualificationFixture(f), /Prüfserver/);
  markQualificationServerActive(f, false);
});

test("Abschirmung: Windowsanforderung wird fest protokolliert und nur als Prozessereignis simuliert", async (t) => {
  for (const [action, flag] of [["shutdown", "/s"], ["restart", "/r"]]) await t.test(action, async (st) => {
    const f = await workspace(st), recorder = createQualificationRecorder(f);
    const sink = createSuppressedSystemSpawn({ fixture: f, action, windowsRoot: "C:\\Windows", record: (event) => recorder.write(event) });
    const options = { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] };
    const child = sink.spawnImpl("C:\\Windows\\System32\\shutdown.exe", [flag, "/t", "0"], options);
    assert.deepEqual(await once(child, "close"), [0]);
    assert.equal(sink.calls.length, 1);
    assert.equal(child.pid, undefined);
    assert.throws(() => sink.spawnImpl("C:\\Windows\\System32\\shutdown.exe", [flag, "/t", "0"], options), /abgefangen/);
    const events = (await fs.readFile(recorder.filename, "utf8")).trim().split("\n").map(JSON.parse);
    assert.deepEqual(events.map((event) => event.type), ["system-call-suppressed", "suppressed-process-result", "unexpected-system-call-blocked"]);
    assert.ok(events.every((event) => event.actualSystemProcessStarted === false));
    assert.ok(events.every((event) => event.qualificationNonce === f.nonce));
  });
});

test("Abschirmung: falsche Aktion, Zwangsflag, Shell, Umgebung und anderer Programmpfad haben keinen Ausführungsweg", async (t) => {
  const f = await workspace(t), options = { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] };
  for (const [executable, args, extra] of [
    ["shutdown.exe", ["/s", "/t", "0"], {}], ["C:\\Windows\\System32\\shutdown.exe", ["/r", "/t", "0"], {}],
    ["C:\\Windows\\System32\\shutdown.exe", ["/s", "/f", "/t", "0"], {}],
    ["C:\\Windows\\System32\\shutdown.exe", ["/s", "/t", "0"], { shell: true }],
    ["C:\\Windows\\System32\\shutdown.exe", ["/s", "/t", "0"], { env: {} }],
  ]) {
    const events = [], sink = createSuppressedSystemSpawn({ fixture: f, action: "shutdown", windowsRoot: "C:\\Windows", record: (event) => events.push(event) });
    assert.throws(() => sink.spawnImpl(executable, args, { ...options, ...extra }), /abgefangen/);
    assert.equal(sink.calls.length, 0); assert.equal(events[0].actualSystemProcessStarted, false);
  }
  for (const action of ["none", "exit-explorer"]) {
    const sink = createSuppressedSystemSpawn({ fixture: f, action, windowsRoot: "C:\\Windows", record() {} });
    assert.throws(() => sink.spawnImpl("C:\\Windows\\System32\\shutdown.exe", ["/s", "/t", "0"], options), /abgefangen/);
  }
  assert.throws(() => createSuppressedSystemSpawn({ fixture: f, action: "shutdown", windowsRoot: "\\\\remote\\Windows", record() {} }), /lokalen Windows/);
});

test("Abschirmung: fehlender dauerhafter Protokolleintrag bestätigt keinen Prozessabschluss", async (t) => {
  const f = await workspace(t);
  const sink = createSuppressedSystemSpawn({ fixture: f, action: "shutdown", windowsRoot: "C:\\Windows", record() { throw new Error("disk failed"); } });
  assert.throws(() => sink.spawnImpl("C:\\Windows\\System32\\shutdown.exe", ["/s", "/t", "0"],
    { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }), /disk failed/);
  assert.equal(sink.calls.length, 0);
});

test("Abschirmung: Browser bleibt an eigener Herkunft und nur den drei echten benötigten Schreibwegen", () => {
  const base = "http://127.0.0.1:49111";
  assert.equal(qualificationRequestAllowed({ method: "GET", url: `${base}/` }, base), true);
  for (const suffix of ["/api/taxonomy/update/sequence-start", "/api/taxonomy/update-completion/displayed", "/api/taxonomy/update-completion/cancel"]) {
    assert.equal(qualificationRequestAllowed({ method: "POST", url: base + suffix }, base), true);
  }
  for (const details of [
    { method: "GET", url: "https://kfmtettaums40.synology.me:55431/" },
    { method: "GET", url: "http://127.0.0.1:4177/" }, { method: "GET", url: "file:///D:/Arten-Explorer/data/" },
    { method: "POST", url: `${base}/api/taxonomy/update/lightroom-close` },
    { method: "POST", url: `${base}/api/nas-backup/start` }, { method: "DELETE", url: base },
  ]) assert.equal(qualificationRequestAllowed(details, base), false);
});

test("Kleine echte Fixture: CoL, Master, aktives Paar und eigene Katalogquittung bleiben vollständig in der Testsitzung", async (t) => {
  const f = await workspace(t);
  const catalog = await fs.readFile(f.catalogPath, "utf8");
  const result = await prepareQualificationTaxonomy(f, { withSearchPackage: true });
  assert.equal(result.master.reference.needsMasterRebuild, false);
  assert.equal(result.master.reference.activeRelease, "col-xr-2026-07-17");
  assert.equal(result.master.corrections.pending, false); assert.equal(result.master.identities.pending, false);
  assert.equal(result.master.lifecycle.candidate, null);
  assert.equal(result.master.lifecycle.active.summary.taxa, 1);
  assert.equal(result.master.lightroomPackage.status, "current");
  assert.equal(result.packageVerification.checksumVerified, true);
  assert.equal(result.publication.taxonomyRoot, f.taxonomyRoot);
  assert.equal(result.publication.searchRoot, f.searchRoot);
  assert.equal(result.publication.active.masterVersion, result.master.lifecycle.active.candidateId);
  assert.equal(result.publication.active.packageId, result.master.lightroomPackage.active.packageId);
  assert.equal(result.usage.ready, true); assert.equal(result.usage.catalogs.length, 1);
  assert.equal(result.usage.catalogs[0].catalogPath, f.catalogPath);
  assert.deepEqual(result.usage.usedIds, []);
  assert.equal(result.workflow, null); assert.equal(result.proof.ready, false, "Kein erfundener erfolgreicher Gesamtauftrag");
  assert.equal(await fs.readFile(f.catalogPath, "utf8"), catalog);
  assert.equal((await readQualificationState(f)).master.lightroomPackage.status, "current");
  assert.equal((await fs.readFile(path.join(f.repoRoot, ".git", "config"), "utf8")).includes("remote"), false);
});

test("Kleine echte Fixture: fehlendes eigenes Suchpaket bietet über die Produktionsentscheidung sync-lightroom an", async (t) => {
  const f = await workspace(t), result = await prepareQualificationTaxonomy(f);
  const vm = await import("node:vm");
  const scope = {};
  vm.runInNewContext(await fs.readFile(new URL("../public/app-taxonomy-database.js", import.meta.url), "utf8"), scope);
  const decision = scope.SpeciesExplorerTaxonomyDatabase.taxonomyDatabaseUpdateDecision({
    hasCandidate: Boolean(result.master.lifecycle.candidate),
    lightroomPackageNeedsRebuild: result.master.lightroomPackage.needsRebuild,
    correctionsPending: result.master.corrections.pending, identitiesPending: result.master.identities.pending,
    referenceNeedsMasterRebuild: result.master.reference.needsMasterRebuild,
  });
  assert.equal(result.master.lightroomPackage.status, "missing");
  assert.equal(decision, "sync-lightroom");
  assert.equal(result.usage.ready, true); assert.equal(result.publication, null);
  assert.equal(result.workflow, null); assert.equal(result.proof.ready, false);
});

class QualificationElement {
  constructor() {
    this.hidden = false; this.open = false; this.value = ""; this.textContent = ""; this.className = "";
    this.dataset = {}; this.listeners = new Map(); this.nodes = new Map(); this.attributes = new Map();
    this.children = []; this.parentElement = null; this.disabled = false;
    const classes = new Set();
    this.classList = { contains: (name) => classes.has(name), add: (name) => classes.add(name), remove: (name) => classes.delete(name),
      toggle(name, enabled = !classes.has(name)) { if (enabled) classes.add(name); else classes.delete(name); } };
  }
  addEventListener(type, listener, capture = false) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add({ listener, capture: Boolean(capture) });
  }
  removeEventListener(type, listener) {
    for (const entry of this.listeners.get(type) || []) if (entry.listener === listener) this.listeners.get(type).delete(entry);
  }
  emit(type) {
    const chain = []; for (let node = this; node; node = node.parentElement) chain.push(node);
    const event = { target: this, stopped: false, preventDefault() {},
      stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.stopped = true; } };
    for (const capture of [true, false]) for (const node of capture ? [...chain].reverse() : chain) {
      for (const entry of node.listeners.get(type) || []) {
        if (entry.capture === capture) entry.listener(event);
        if (event.stopped) return;
      }
    }
  }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  contains(other) { return this === other || this.children.some((child) => child.contains(other)); }
  closest(selector) {
    return selector === '[role="menuitem"]' && this.getAttribute("role") === "menuitem" ? this : this.parentElement?.closest(selector);
  }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  querySelector(selector) {
    if (!this.nodes.has(selector)) this.nodes.set(selector, new QualificationElement());
    return this.nodes.get(selector);
  }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...((selector === '[role="menuitem"]' && child.getAttribute("role") === "menuitem")
        || (selector === ".edit-only" && child.classList.contains("edit-only")) ? [child] : []), ...child.querySelectorAll(selector),
    ]);
  }
  showModal() { this.open = true; }
  close() { this.open = false; this.emit("close"); }
}

test("Echter Bootstrap: eigener Server und unveränderte Dashboard-/Headerlogik erreichen den Datenbankchooser ohne Pipelinefreigabe", async (t) => {
  const f = await workspace(t);
  await prepareQualificationTaxonomy(f);
  const restore = installQualificationEnvironment(f), events = [], requests = [];
  let running, state;
  try {
    running = await startQualificationServer({ fixture: f, action: "none", getWindow: () => null,
      onFinished: () => assert.fail("Kein Update und kein Fensterabschluss in dieser Bootstrapprobe"),
      onFailure: () => assert.fail("Keine Abschlussaktion in dieser Bootstrapprobe"), record: (event) => events.push(event) });
    const html = await (await fetch(running.baseUrl)).text();
    for (const [file, mime] of [["app-header.js", "text/javascript"], ["header.css", "text/css"]]) {
      assert.ok(html.includes(`/${file}`), `Die echte Startseite bindet ${file} ein`);
      const response = await fetch(`${running.baseUrl}/${file}`);
      assert.equal(response.status, 200);
      assert.ok(response.headers.get("content-type").startsWith(mime));
      assert.equal(await response.text(), await fs.readFile(new URL(`../public/${file}`, import.meta.url), "utf8"));
    }
    const vm = await import("node:vm");
    const scope = vm.createContext({ URL, Headers, AbortController, setTimeout, clearTimeout });
    for (const file of ["app-foundation.js", "app-presentation.js", "app-taxonomy-progress.js", "app-dashboard.js",
      "app-lifecycle.js", "app-dialogs.js", "app-header.js", "app-pipeline.js", "app-backup-workflow.js", "app-pipeline-workflow.js"]) {
      vm.runInContext(await fs.readFile(new URL(`../public/${file}`, import.meta.url), "utf8"), scope, { filename: file });
    }
    state = scope.SpeciesExplorerFoundation.createInitialExplorerState();
    // A synthetic DOM binds the actual served IDs/attributes and dispatches the
    // real menu capture handler before the unchanged database action handler.
    const markup = new Map([...html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)]
      .map((match) => [match[3], { tag: match[1].toUpperCase(), attributes: match[2] }]));
    const nodes = new Map(), documentRef = new QualificationElement();
    function nodeById(id) {
      if (!nodes.has(id)) {
        const node = new QualificationElement(), source = markup.get(id);
        node.tagName = source?.tag || "DIV"; node.ownerDocument = documentRef; node.parentElement = documentRef;
        node.setAttribute("id", id);
        if (source) {
          node.hidden = /\s+hidden(?:\s|=|$)/.test(source.attributes);
          node.disabled = /\s+disabled(?:\s|=|$)/.test(source.attributes);
          const role = source.attributes.match(/\brole="([^"]+)"/); if (role) node.setAttribute("role", role[1]);
          for (const name of (source.attributes.match(/\bclass="([^"]*)"/)?.[1] || "").split(/\s+/).filter(Boolean)) node.classList.add(name);
        }
        nodes.set(id, node);
      }
      return nodes.get(id);
    }
    const elements = new Proxy({}, { get(target, key) {
      if (!(key in target)) target[key] = key.endsWith("Buttons") ? [] : nodeById(key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`));
      return target[key];
    } });
    documentRef.body = new QualificationElement();
    documentRef.querySelector = (selector) => selector === "dialog[open]"
      ? [...nodes.values()].find((node) => node.tagName === "DIALOG" && node.open) || null
      : selector.startsWith("#") && markup.has(selector.slice(1)) ? nodeById(selector.slice(1)) : null;
    for (const [id, childIds] of [["app-menu", ["inspection-open", "pipeline-menu-button", "header-backup-open", "header-settings-open"]],
      ["website-menu", ["website-pages-check", "website-alt-texts-open"]]]) {
      const start = html.indexOf(`id="${id}"`), menuMarkup = html.slice(start, html.indexOf("</div>", start));
      assert.ok(start >= 0);
      for (const childId of childIds) assert.ok(menuMarkup.includes(`id="${childId}"`));
      nodeById(id).append(...childIds.map(nodeById));
    }
    scope.document = documentRef;
    const presentation = scope.SpeciesExplorerPresentation, pipeline = scope.SpeciesExplorerPipeline;
    const api = scope.SpeciesExplorerFoundation.createExplorerApiClient({
      fetchImpl: (url, options) => {
        requests.push({ method: options?.method || "GET", path: url });
        return fetch(new URL(url, running.baseUrl), options);
      }, HeadersImpl: Headers, getSessionToken: () => state.sessionToken,
      setSessionToken: (token) => { state.sessionToken = token; },
      getWorkspace: () => state.workspace, getWorkspaceEpoch: () => state.workspaceEpoch,
    });
    const dashboard = scope.SpeciesExplorerDashboard.createDashboardController({ state, elements, documentRef,
      OptionConstructor: QualificationElement, ...presentation, filterSpecies: () => [],
      resolveDatabaseStatus: pipeline.resolveDatabaseStatus, databaseStatusLabel: pipeline.databaseStatusLabel,
      onSpeciesSelect() {} });
    const lifecycle = scope.SpeciesExplorerLifecycle.createExplorerLifecycleController({ state, elements, documentRef,
      loadExplorerSnapshot: api.loadExplorerSnapshot, updateSummary: dashboard.updateSummary,
      updateValidation: dashboard.updateValidation, updatePendingChanges: dashboard.updatePendingChanges,
      populateStatusFilter() {}, applyFilters() {} });
    const snapshot = await lifecycle.refreshExplorerModelOnly();
    assert.equal(snapshot.validation.status, "ok"); assert.equal(snapshot.validation.issueCount, 0);
    assert.equal(snapshot.pendingChanges.error, ""); assert.equal(snapshot.pendingChanges.hasPendingChanges, false);
    assert.equal(snapshot.pendingChanges.pendingFileCount, 0); assert.equal(snapshot.pendingChanges.manualChangeCount, 0);
    assert.equal(snapshot.species[0].assets.portrait.hashVerified, true);
    assert.equal(snapshot.species[0].assets.portrait.metadata.type, "synthetic qualification pixel");
    assert.equal(state.validationNeedsUpdate, false); assert.equal(state.databaseNeedsUpdate, false);
    lifecycle.applyEditingMode(true);
    const header = scope.SpeciesExplorerHeader.setupHeader({ state, elements, documentRef,
      createDialogController: scope.SpeciesExplorerDialogs.createDialogController,
      onDatabaseActions: (options) => state.openPipelineActions?.(options) });
    const presenters = pipeline.createPipelineStatusPresenters({ formatBytes: presentation.formatBytes });
    const previews = pipeline.createPipelinePreviewRenderer(presentation);
    const workflow = scope.SpeciesExplorerPipelineWorkflow.createPipelineWorkflowController({ state, elements,
      createDialogController: scope.SpeciesExplorerDialogs.createDialogController, ...presenters, ...previews,
      pipelineModeLabel: pipeline.pipelineModeLabel, backupLabel: pipeline.backupLabel, fetchJson: api.fetchJson,
      renderDatabaseStatus: dashboard.renderDatabaseStatus, formatDate: presentation.formatDate,
      renderProcessLog: pipeline.renderProcessLog, createBackupWorkflowController: scope.SpeciesExplorerBackupWorkflow.createBackupWorkflowController });
    workflow.setupPipelineControl();
    // Real read-only HTTP status requests initiated by the unchanged workflow setup.
    for (let index = 0; index < 200 && (!state.pipelineStatusSnapshot || !state.backupStatusSnapshot); index++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(state.pipelineStatusSnapshot?.status, "idle"); assert.equal(state.backupStatusSnapshot?.status, "idle");
    assert.equal(state.pipelineStatusReadError, null); assert.equal(state.backupStatusReadError, null);
    elements.pipelineMenuButton.emit("click");
    assert.equal(elements.pipelineDialog.open, false, "Ein altes Ziel im geschlossenen Menü öffnet keinen Dialog");
    elements.appMenuButton.emit("click");
    assert.equal(nodeById("app-menu").hidden, false);
    assert.equal(elements.appMenuButton.getAttribute("aria-expanded"), "true");
    assert.equal(requests.some((request) => request.method !== "GET"), false, "Menüöffnung ist schreibfrei");
    elements.pipelineMenuButton.emit("click");
    assert.equal(nodeById("app-menu").hidden, true);
    assert.equal(elements.pipelineDialog.open, true);
    assert.equal(elements.pipelineDialogTitle.textContent, "Datenbank-Aktionen");
    assert.equal(elements.pipelineModeChoice.hidden, false);
    assert.equal(elements.pipelineDialog.dataset.previewKind, "");
    assert.equal(requests.some((request) => request.method !== "GET"), false);
    assert.equal(requests.some((request) => request.path === "/api/pipeline/preview"), false);
    assert.equal(qualificationRequestAllowed({ method: "POST", url: `${running.baseUrl}/api/pipeline/preview` }, running.baseUrl), false);
    assert.equal(events.some((event) => event.type === "actual-bootstrap-verified"), true);
    assert.equal(running.suppressed.calls.length, 0);
    header.closeAll();
  } finally {
    clearTimeout(state?.pipelinePollTimer); clearTimeout(state?.backupPollTimer);
    await running?.close();
    restore();
  }
});
