import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createSquarespaceBrowserAdapter, isAllowedSquarespaceBrowserUrl } from "./squarespace-browser.mjs";
import { SQUARESPACE_ASSET_LIBRARY_URL } from "./squarespace-assets-library.mjs";
import { createCmsDispatchBinding } from "../page-authoring/cms-dispatch.mjs";
import { FN_MAP_CODE, FN_SPECIES_CODE } from "../page-authoring/templates.mjs";

const PAGE = "https://www.fnwildlifetravel.de/reisen/2019-griechenland/athen";
const PLAN = { pageUrl: PAGE, pageTitle: "Athen", revision: 7, images: [] };
const PAGE_PATH = "/wildlife/heimische-tierwelt/eisvogel";
const PAGES_ADMIN = "https://vanilla-gerbil-jwnp.squarespace.com/config/pages";
const CMS_TITLE = "Eisvogel · & <Ufer>";
const CMS_BLOCKS = [{ type: "heading", level: 3, text: CMS_TITLE }, { type: "code", code: FN_SPECIES_CODE },
  { type: "richtext", blocks: [{ type: "paragraph", text: "Am Wasser\nauf einem Ast" }] },
  { type: "code", code: FN_MAP_CODE }, { type: "gallery", items: [] }, { type: "source", text: "FN Wildlife & Travel" }];
const CMS_PLAN = { schemaVersion: 2, planHash: "a".repeat(64), target: { path: PAGE_PATH, observationId: "earlier-target" },
  structure: { path: PAGE_PATH, title: CMS_TITLE, slots: structuredClone(CMS_BLOCKS) }, publish: false,
  readback: { schemaVersion: 1, expectation: { schemaVersion: 1, path: PAGE_PATH, title: CMS_TITLE, blocks: CMS_BLOCKS } } };
const CMS_BINDING = createCmsDispatchBinding({ projectId: "project-fixture", attemptId: "attempt-fixture", dispatchId: "dispatch-fixture",
  planHash: CMS_PLAN.planHash, targetPath: PAGE_PATH });
const SAVE_BINDING = { schemaVersion: 1, attemptId: CMS_BINDING.attemptId, dispatchId: CMS_BINDING.dispatchId, planHash: CMS_PLAN.planHash,
  pageId: "1".repeat(24), path: PAGE_PATH, sectionId: "2".repeat(24),
  blockIds: Array.from({ length: 5 }, (_, index) => `block-${String(index + 1).padStart(24, "0")}`), mediaBindings: [] };
const CONNECTED = { connected: true, status: "connected", message: "FN-Verwaltung erkannt." };
const LOGIN = { connected: false, status: "login-required", message: "Bitte anmelden." };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const preventable = (url) => ({ url, prevented: false, preventDefault() { this.prevented = true; } });
const observedTarget = (path) => ({ path, parentPath: path.slice(0, path.lastIndexOf("/")), exists: false, parentExists: true, online: true,
  observationId: "browser-preflight", checkedAt: new Date().toISOString() });
const readyFor = plan => ({ ready: true, planHash: plan.planHash, targetPath: plan.target.path, targetObservation: observedTarget(plan.target.path) });

function harness({ status = LOGIN, run = async () => ({ results: [] }), load = null, pageRuns = {},
  readiness = async (_contents, plan) => readyFor(plan) } = {}) {
  const windows = [];
  const calls = [];
  const session = new EventEmitter();
  session.setPermissionRequestHandler = (handler) => { session.permissionRequest = handler; };
  session.setPermissionCheckHandler = (handler) => { session.permissionCheck = handler; };
  session.setDevicePermissionHandler = (handler) => { session.devicePermission = handler; };
  class FakeBrowserWindow extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.destroyed = false;
      this.visible = options.show;
      this.focuses = 0;
      this.loads = [];
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = {};
      this.webContents.session = session;
      this.webContents.isDestroyed = () => this.destroyed;
      this.webContents.stop = () => { calls.push("stop-loading"); };
      this.webContents.getURL = () => this.loads.at(-1) || "";
      this.webContents.setWindowOpenHandler = (handler) => { this.popup = handler; };
      windows.push(this);
    }
    isDestroyed() { return this.destroyed; }
    isMinimized() { return false; }
    show() { this.visible = true; calls.push("show"); }
    hide() { this.visible = false; calls.push("hide"); }
    isVisible() { return this.visible !== false; }
    focus() { this.focuses++; calls.push("focus"); }
    async loadURL(url) {
      this.loads.push(url);
      if (load) await load(url);
    }
    close() {
      calls.push("close");
      const event = preventable();
      this.emit("close", event);
      if (event.prevented) return;
      this.destroyed = true;
      this.emit("closed");
    }
    destroy() { throw new Error("Fenster darf nicht erzwungen zerstört werden"); }
  }
  const state = { value: status };
  const driver = {
    getStatus: async (contents) => {
      calls.push(["status", contents]);
      return typeof state.value === "function" ? state.value(contents) : state.value;
    },
    transfer: async (...args) => { calls.push(["transfer", ...args]); return run(...args); },
  };
  for (const name of ["checkNewTarget", "createUnpublishedPage", "uploadLibraryImage", "recheckUnpublishedPage"]) {
    if (typeof pageRuns[name] === "function") {
      driver[name] = async (...args) => { calls.push([name, ...args]); return pageRuns[name](...args); };
    }
  }
  if (typeof pageRuns.createUnpublishedPage === "function" && typeof readiness === "function") {
    driver.prepareUnpublishedPage = readiness;
  }
  const parent = { isDestroyed: () => false, isMinimized: () => false,
    show: () => calls.push("parent-show"), focus: () => calls.push("parent-focus") };
  const adapter = createSquarespaceBrowserAdapter({ BrowserWindow: FakeBrowserWindow, driver, parentWindow: () => parent });
  return { adapter, windows, calls, session, state, driver, parent };
}

const jobInput = (name) => name === "transfer" ? PLAN : name === "checkNewTarget" ? PAGE_PATH : CMS_PLAN;
const jobOptions = (name, options = {}) => name === "createUnpublishedPage" ? { beforeWrite: async () => ({ ...CMS_BINDING }), ...options } : options;
const driverCalls = (h) => h.calls.filter(call => Array.isArray(call) && ["transfer", "checkNewTarget", "createUnpublishedPage"].includes(call[0]));

test("fehlende Artseitentreiber werden vor Fenster- oder Seiteneingriff abgewiesen", async () => {
  const h = harness();
  for (const name of ["checkNewTarget", "createUnpublishedPage"]) {
    await assert.rejects(h.adapter[name](jobInput(name), jobOptions(name)), { code: "SQUARESPACE_PAGE_AUTHORING_UNAVAILABLE", statusCode: 409 });
  }
  assert.deepEqual(h.calls, []);
  assert.equal(h.windows.length, 0);
  assert.equal(h.adapter.pageAuthoringAvailable, false);
  assert.equal(h.adapter.recheckUnpublishedPage, undefined);
  await h.adapter.connect();
  const before = [...h.calls];
  await assert.rejects(h.adapter.createUnpublishedPage(CMS_PLAN), { code: "SQUARESPACE_PAGE_AUTHORING_UNAVAILABLE" });
  assert.deepEqual(h.calls, before);
  await h.adapter.close();
});

test("Artseitenfähigkeit ist ein unveränderlicher Nachweis beider vorhandener Treiberfunktionen", async () => {
  for (const names of [[], ["checkNewTarget"], ["createUnpublishedPage"], ["checkNewTarget", "createUnpublishedPage"]]) {
    const h = harness({ pageRuns: Object.fromEntries(names.map(name => [name, async () => ({})])) });
    assert.equal(h.adapter.pageAuthoringAvailable, names.length === 2);
    assert.throws(() => { h.adapter.pageAuthoringAvailable = !h.adapter.pageAuthoringAvailable; }, TypeError);
    assert.throws(() => Object.defineProperty(h.adapter, "pageAuthoringAvailable", { value: !h.adapter.pageAuthoringAvailable }), TypeError);
    assert.equal(h.windows.length, 0);
    await h.adapter.close();
  }
});

test("Squarespace-Rückprüfung nutzt nur ein frisches Fenster im selben Profil und lässt die Hauptverwaltung bestehen", async () => {
  const answer = { readback: { page: { id: SAVE_BINDING.pageId } }, mediaBindings: [] };
  let authorityChecks = 0;
  const h = harness({ status: CONNECTED, pageRuns: {
    recheckUnpublishedPage: async (contents, plan, options) => {
      assert.equal(contents, h.windows[1].webContents);
      assert.equal(contents.session, h.windows[0].webContents.session);
      assert.equal(plan, CMS_PLAN);
      assert.deepEqual(Object.keys(options).sort(), ["assertCurrent", "saveBinding", "signal"]);
      assert.deepEqual(options.saveBinding, SAVE_BINDING);
      assert.notEqual(options.saveBinding, SAVE_BINDING);
      await options.assertCurrent();
      return answer;
    },
  } });
  await h.adapter.connect();
  const [owner] = h.windows;
  await owner.loadURL(PAGES_ADMIN);
  const originalLoads = [...owner.loads];
  const ownerFocus = owner.focuses;
  assert.equal(owner.isVisible(), false);
  assert.deepEqual(await h.adapter.recheckUnpublishedPage(CMS_PLAN, { saveBinding: SAVE_BINDING,
    assertCurrent: async () => { authorityChecks++; } }), answer);
  assert.equal(authorityChecks, 1);
  assert.equal(h.windows.length, 2);
  const side = h.windows[1];
  assert.deepEqual(side.loads, [PAGES_ADMIN]);
  assert.equal(side.options.webPreferences.partition, owner.options.webPreferences.partition);
  assert.equal(side.destroyed, true);
  assert.deepEqual(owner.loads, originalLoads);
  assert.equal(owner.focuses, ownerFocus);
  assert.equal(owner.isVisible(), false);
  assert.equal(owner.destroyed, false);
  await h.adapter.close();
});

test("Squarespace-Rückprüfung sperrt fremde Navigation und erkennt fehlende Journalbindung vor dem Nebenfenster", async () => {
  const h = harness({ status: CONNECTED, pageRuns: {
    recheckUnpublishedPage: async (contents, _plan, options) => {
      await options.assertCurrent();
      const event = preventable("https://example.org/");
      contents.emit("will-navigate", event, event.url);
      assert.equal(event.prevented, true);
      await options.assertCurrent();
    },
  } });
  await h.adapter.connect();
  const [owner] = h.windows;
  await owner.loadURL(PAGES_ADMIN);
  await assert.rejects(h.adapter.recheckUnpublishedPage(CMS_PLAN, { saveBinding: { ...SAVE_BINDING, pageId: "unknown" },
    assertCurrent: async () => true }), { code: "cms_save_binding_invalid" });
  assert.equal(h.windows.length, 1);
  await assert.rejects(h.adapter.recheckUnpublishedPage(CMS_PLAN, { saveBinding: SAVE_BINDING,
    assertCurrent: async () => true }), { code: "SQUARESPACE_PAGE_RECHECK_UNCONFIRMED" });
  assert.equal(h.windows[1].destroyed, true);
  assert.equal(owner.destroyed, false);
  assert.equal(owner.loads.at(-1), PAGES_ADMIN);
  await h.adapter.close();
});

test("Artseiten nehmen nur die unveränderte lokale Wildlife-Inhaltsroute ohne URL- oder Dateipfade an", async () => {
  const h = harness({ status: CONNECTED, pageRuns: { checkNewTarget: async () => ({}), createUnpublishedPage: async () => ({}) } });
  await h.adapter.connect();
  for (const path of [undefined, null, 7, "", "wildlife/region/art", "/wildlife/region", "/wildlife/region/art/",
    "https://www.fnwildlifetravel.de" + PAGE_PATH, "//www.fnwildlifetravel.de" + PAGE_PATH,
    "C:\\wildlife\\region\\art", "file:///wildlife/region/art", "/wildlife/region/../art", "/wildlife/region/%2e%2e",
    "/wildlife/region/art?x=1", "/wildlife/region/art#x", "/wildlife/region/art\n", "/wildlife/region/art\\more",
    "/wildlife/region//art", "/wildlife/region/art--name", "/config/region/art", "/wildlife/region/" + "a".repeat(501)]) {
    await assert.rejects(h.adapter.checkNewTarget(path), { code: "SQUARESPACE_INVALID_PAGE", statusCode: 400 });
    await assert.rejects(h.adapter.createUnpublishedPage({ ...CMS_PLAN, target: { path }, structure: { path } }),
      { code: "SQUARESPACE_INVALID_PAGE", statusCode: 400 });
  }
  await assert.rejects(h.adapter.createUnpublishedPage({ ...CMS_PLAN, structure: { path: "/wildlife/region/andere-art" } }),
    { code: "SQUARESPACE_INVALID_PAGE", statusCode: 400 });
  await assert.rejects(h.adapter.createUnpublishedPage({ payload: CMS_PLAN }), { code: "SQUARESPACE_INVALID_PAGE", statusCode: 400 });
  assert.deepEqual(driverCalls(h), []);
  assert.equal(h.windows[0].loads.length, 1);
  await h.adapter.close();
});

for (const name of ["checkNewTarget", "createUnpublishedPage"]) {
  test(`${name} benötigt manuelle Anmeldung und reicht Eingang, Frischeprüfung und Ergebnis unverändert weiter`, async () => {
    const result = { observationId: "observed-once", unpublished: true };
    const assertCurrent = async () => {};
    const caller = new AbortController();
    let h;
    h = harness({ pageRuns: { [name]: async (contents, input, options) => {
      assert.equal(contents, h.windows[0].webContents);
      assert.equal(input, jobInput(name));
      assert.equal(options.assertCurrent, assertCurrent);
      assert.notEqual(options.signal, caller.signal);
      assert.equal(options.signal.aborted, false);
      assert.equal(h.windows[0].isVisible(), true);
      return result;
    } } });
    await assert.rejects(h.adapter[name](jobInput(name), jobOptions(name)), { code: "SQUARESPACE_LOGIN_REQUIRED" });
    assert.equal(h.windows.length, 0);
    await h.adapter.connect();
    await assert.rejects(h.adapter[name](jobInput(name), jobOptions(name)), { code: "SQUARESPACE_LOGIN_REQUIRED" });
    assert.equal(h.windows[0].isVisible(), true);
    assert.deepEqual(driverCalls(h), []);
    h.state.value = CONNECTED;
    assert.equal(await h.adapter[name](jobInput(name), jobOptions(name, { signal: caller.signal, assertCurrent })), result);
    assert.equal(h.windows[0].isVisible(), false);
    assert.deepEqual(h.calls.slice(-3), ["hide", "parent-show", "parent-focus"]);
    assert.equal(h.windows.length, 1);
    assert.equal(h.windows[0].loads.length, 1);
    assert.equal((await h.adapter.snapshot()).busy, false);
    await h.adapter.close();
  });

  test(`${name} lässt bei erst im Treiber bemerktem Loginverlust das Anmeldefenster sichtbar`, async () => {
    let h;
    h = harness({ status: CONNECTED, pageRuns: { [name]: async () => {
      h.state.value = LOGIN;
      throw new Error("Bitte erneut anmelden.");
    } } });
    await h.adapter.connect();
    await assert.rejects(h.adapter[name](jobInput(name), jobOptions(name)), /erneut anmelden/);
    assert.equal((await h.adapter.snapshot()).loginRequired, true);
    assert.equal(h.windows[0].isVisible(), true);
    assert.equal(h.windows.length, 1);
    await h.adapter.close();
  });

  test(`${name} beginnt mit schon abgebrochenem Signal weder Statusprüfung noch Treiberarbeit`, async () => {
    const h = harness({ status: CONNECTED, pageRuns: { [name]: async () => ({}) } });
    await h.adapter.connect();
    const before = [...h.calls], controller = new AbortController(), reason = new Error("Vorher abgebrochen");
    controller.abort(reason);
    await assert.rejects(h.adapter[name](jobInput(name), jobOptions(name, { signal: controller.signal })), error => error === reason);
    assert.deepEqual(h.calls, before);
    await h.adapter.close();
  });

  test(`${name} erhält externen Abbruch und kann danach keinen verspäteten Erfolg melden`, async () => {
    const entered = deferred(), gate = deferred();
    const h = harness({ status: CONNECTED, pageRuns: { [name]: (_contents, _input, options) => {
      entered.resolve(options.signal);
      return gate.promise;
    } } });
    await h.adapter.connect();
    const controller = new AbortController(), reason = new Error("Bewusst abgebrochen");
    const pending = h.adapter[name](jobInput(name), jobOptions(name, { signal: controller.signal }));
    const signal = await entered.promise;
    controller.abort(reason);
    assert.equal(signal.aborted, true);
    assert.equal(signal.reason, reason);
    gate.resolve({ saved: true });
    await assert.rejects(pending, error => error === reason);
    assert.equal((await h.adapter.snapshot()).busy, false);
    await h.adapter.close();
  });

  for (const closeWindow of [true, false]) {
    test(`${name}: ${closeWindow ? "Fenster" : "Adapter"}schließen bricht ab und wartet auf das Treiberende`, async () => {
      const entered = deferred(), gate = deferred();
      const h = harness({ status: CONNECTED, pageRuns: { [name]: (_contents, _input, options) => {
        entered.resolve(options.signal);
        return gate.promise;
      } } });
      await h.adapter.connect();
      const pending = h.adapter[name](jobInput(name), jobOptions(name));
      const signal = await entered.promise;
      let closing;
      if (closeWindow) h.windows[0].close();
      else closing = h.adapter.close();
      assert.equal(signal.aborted, true);
      assert.equal(h.windows[0].destroyed, false);
      let drained = false;
      if (closing) void closing.then(() => { drained = true; });
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(drained, false);
      assert.equal((await h.adapter.snapshot()).busy, true);
      gate.resolve({ saved: true });
      await assert.rejects(pending, { code: closeWindow ? "SQUARESPACE_WINDOW_CLOSED" : "SQUARESPACE_ABORTED" });
      if (closing) await closing;
      assert.equal(h.windows[0].destroyed, true);
      assert.equal((await h.adapter.snapshot()).busy, false);
      assert.equal(h.windows.length, 1);
      await h.adapter.close();
    });
  }
}

for (const active of ["transfer", "checkNewTarget", "createUnpublishedPage"]) {
  test(`laufendes ${active} sperrt alle drei Auftragsarten im selben Browser`, async () => {
    const entered = deferred(), gate = deferred();
    const run = () => { entered.resolve(); return gate.promise; };
    const h = harness({ status: CONNECTED, run, pageRuns: { checkNewTarget: run, createUnpublishedPage: run } });
    await h.adapter.connect();
    const pending = h.adapter[active](jobInput(active), jobOptions(active));
    await entered.promise;
    for (const other of ["transfer", "checkNewTarget", "createUnpublishedPage"]) {
      await assert.rejects(h.adapter[other](jobInput(other)), { code: "SQUARESPACE_BUSY", statusCode: 409 });
    }
    assert.deepEqual(driverCalls(h).map(call => call[0]), [active]);
    assert.equal((await h.adapter.snapshot()).busy, true);
    assert.deepEqual(h.windows[0].popup({ url: "https://account.squarespace.com/" }), { action: "deny" });
    assert.equal(h.windows[0].loads.length, 1);
    assert.equal(h.windows.length, 1);
    gate.resolve({ done: true });
    await pending;
    assert.equal((await h.adapter.snapshot()).busy, false);
    await h.adapter.close();
  });
}

test("Artseiten ohne lesende Bereitschaftsprüfung bleiben unverfügbar und starten kein Journal", async () => {
  const h = harness({ status: CONNECTED, readiness: null,
    pageRuns: { checkNewTarget: async () => ({}), createUnpublishedPage: async () => ({ saved: true }) } });
  let dispatches = 0;
  assert.equal(h.adapter.pageAuthoringAvailable, false);
  await h.adapter.connect();
  await assert.rejects(h.adapter.createUnpublishedPage(CMS_PLAN, { beforeWrite: async () => { dispatches++; return CMS_BINDING; } }),
    { code: "SQUARESPACE_PAGE_AUTHORING_UNAVAILABLE" });
  assert.equal(dispatches, 0); assert.deepEqual(driverCalls(h), []);
  await h.adapter.close();
});

test("lesende Bereitschaft läuft unter derselben Browsersperre vor Journalstart und erhält keine Schreibcallbacks", async () => {
  const entered = deferred(), gate = deferred(), order = [];
  let prepareSignal, preparedSteps;
  const h = harness({ status: CONNECTED, readiness: async (contents, plan, options) => {
    order.push("prepare"); prepareSignal = options.signal;
    assert.equal(contents, h.windows[0].webContents); assert.equal(plan, CMS_PLAN);
    assert.deepEqual(Object.keys(options), ["signal", "contentSteps"]);
    preparedSteps = options.contentSteps;
    assert.deepEqual(preparedSteps, [
      { kind: "text", html: "<h3>Eisvogel · &amp; &lt;Ufer&gt;</h3>" },
      { kind: "species", slotIndex: 1, code: FN_SPECIES_CODE },
      { kind: "text", html: "<p>Am Wasser<br>auf einem Ast</p>" },
      { kind: "map", slotIndex: 3, code: FN_MAP_CODE },
      { kind: "gallery", slotIndex: 4 },
      { kind: "text", html: "<p>FN Wildlife &amp; Travel</p>" },
    ]);
    assert.ok(Object.isFrozen(preparedSteps) && preparedSteps.every(Object.isFrozen));
    entered.resolve(); await gate.promise;
    return readyFor(plan);
  }, pageRuns: { createUnpublishedPage: async (_contents, _plan, options) => {
    order.push("write"); assert.equal(options.signal, prepareSignal);
    assert.equal(options.contentSteps, preparedSteps); return { saved: true };
  } } });
  await h.adapter.connect();
  const pending = h.adapter.createUnpublishedPage(CMS_PLAN, { beforeWrite: async ({ signal }) => {
    order.push("dispatch"); assert.equal(signal, prepareSignal); return CMS_BINDING;
  } });
  await entered.promise;
  assert.deepEqual(order, ["prepare"]); assert.equal((await h.adapter.snapshot()).busy, true);
  await assert.rejects(h.adapter.transfer(PLAN), { code: "SQUARESPACE_BUSY" });
  gate.resolve(); assert.deepEqual(await pending, { saved: true });
  assert.deepEqual(order, ["prepare", "dispatch", "write"]); await h.adapter.close();
});

test("die gebundene Adressprüfung verwendet eigene Fenster, hält die Browsersperre und gibt den Fokus an denselben Editor zurück", async () => {
  const entered = deferred(), resume = deferred();
  let lookup, sequence = 0;
  const h = harness({ status: CONNECTED, pageRuns: {
    async checkNewTarget(contents, path, { signal }) {
      const reader = h.windows.at(-1), writer = h.windows[0];
      assert.equal(contents, reader.webContents);
      assert.notEqual(contents, writer.webContents);
      assert.equal(contents.session, writer.webContents.session);
      assert.equal(reader.options.webPreferences.partition, writer.options.webPreferences.partition);
      assert.equal(reader.options.webPreferences.sandbox, true);
      assert.equal(reader.options.show, false);
      assert.equal(reader.isVisible(), true);
      assert.equal(reader.focuses, 1);
      assert.deepEqual(reader.loads, [PAGES_ADMIN]);
      assert.equal(path, PAGE_PATH);
      assert.equal(signal.aborted, false);
      if (++sequence === 2) { entered.resolve(reader); await resume.promise; }
      return { ...observedTarget(path), observationId: `reader-${sequence}` };
    },
    async createUnpublishedPage(contents, _plan, options) {
      lookup = options.checkTargetAvailable;
      contents.getURL = () => PAGES_ADMIN;
      const writer = h.windows[0], initialFocus = writer.focuses;
      await assert.rejects(lookup("/wildlife/heimische-tierwelt/andere-art"), { code: "SQUARESPACE_TARGET_NOT_CONFIRMED" });
      assert.equal(h.windows.length, 1);
      const first = await lookup(PAGE_PATH);
      assert.equal(h.windows[1].destroyed, true);
      assert.equal(writer.focuses, initialFocus + 1);
      const second = await lookup(PAGE_PATH);
      assert.equal(h.windows[2].destroyed, true);
      assert.equal(writer.focuses, initialFocus + 2);
      assert.notEqual(first.observationId, second.observationId);
      assert.deepEqual(writer.loads, ["https://www.fnwildlifetravel.de/config"]);
      assert.equal(writer.destroyed, false);
      return { saved: true };
    },
  } });
  await h.adapter.connect();
  const pending = h.adapter.createUnpublishedPage(CMS_PLAN, jobOptions("createUnpublishedPage"));
  const reader = await entered.promise, writer = h.windows[0];
  const originalFocus = writer.focuses;
  assert.equal((await h.adapter.connect()).busy, true);
  assert.equal(writer.focuses, originalFocus);
  await assert.rejects(h.adapter.checkNewTarget(PAGE_PATH), { code: "SQUARESPACE_BUSY" });
  await assert.rejects(h.adapter.transfer(PLAN), { code: "SQUARESPACE_BUSY" });
  await assert.rejects(lookup(PAGE_PATH), { code: "SQUARESPACE_BUSY" });
  const foreign = { ...preventable("https://foreign.invalid/"), isMainFrame: false };
  reader.webContents.emit("will-frame-navigate", foreign);
  assert.equal(foreign.prevented, true);
  assert.deepEqual(reader.popup({ url: PAGES_ADMIN }), { action: "deny" });
  assert.equal(h.session.listenerCount("will-download"), 1);
  resume.resolve();
  assert.deepEqual(await pending, { saved: true });
  await assert.rejects(lookup(PAGE_PATH), { code: "SQUARESPACE_TARGET_NOT_CONFIRMED" });
  assert.equal(h.windows.length, 3);
  await h.adapter.close();
});

test("eine getrennte Adressprüfung verweigert abgelaufene Anmeldung, fremde Verwaltung, geänderten Editor und alten Befund", async () => {
  for (const scenario of ["login", "redirect", "navigation-blocked", "writer-changed", "same-observation", "old-observation"]) {
    let reads = 0;
    const h = harness({ status: CONNECTED, load: url => {
      if (url !== PAGES_ADMIN) return;
      const contents = h.windows.at(-1).webContents;
      if (scenario === "redirect") contents.getURL = () => "https://login.squarespace.com/";
      if (scenario === "navigation-blocked") {
        const event = { ...preventable("https://account.squarespace.com/"), isMainFrame: true };
        contents.emit("will-redirect", event);
        assert.equal(event.prevented, true);
      }
    }, pageRuns: {
      async checkNewTarget(_contents, path) {
        reads++;
        if (scenario === "writer-changed") h.windows[0].webContents.mainFrame = {};
        return { ...observedTarget(path),
          observationId: scenario === "same-observation" ? "browser-preflight" : "reader-fresh",
          checkedAt: new Date(Date.now() - (scenario === "old-observation" ? 1000 : 0)).toISOString() };
      },
      async createUnpublishedPage(contents, _plan, options) {
        contents.getURL = () => PAGES_ADMIN;
        await options.checkTargetAvailable(PAGE_PATH);
        throw new Error("Der Schreibablauf muss anhalten.");
      },
    } });
    await h.adapter.connect();
    if (scenario === "login") h.state.value = contents => contents === h.windows[0].webContents ? CONNECTED : LOGIN;
    await assert.rejects(h.adapter.createUnpublishedPage(CMS_PLAN, jobOptions("createUnpublishedPage")), {
      code: scenario === "login" ? "SQUARESPACE_LOGIN_REQUIRED" : "SQUARESPACE_TARGET_NOT_CONFIRMED",
    });
    const failedBeforeSearch = ["login", "redirect", "navigation-blocked"].includes(scenario);
    assert.equal(reads, failedBeforeSearch ? 0 : 1);
    assert.equal(h.windows[1].destroyed, true);
    if (failedBeforeSearch) assert.equal(h.windows[1].focuses, 0);
    assert.equal(h.windows[0].destroyed, false);
    assert.equal((await h.adapter.snapshot()).busy, false);
    await h.adapter.close();
  }
});

test("das getrennte Adressfenster wartet auf die vollständig geladene Verwaltung, bevor es den Auftrag ausführt", async () => {
  let readerStatusChecks = 0;
  const h = harness({ status: CONNECTED, pageRuns: {
    async checkNewTarget(contents, path) {
      assert.equal(contents, h.windows[1].webContents);
      assert.equal(readerStatusChecks, 2);
      return { ...observedTarget(path), observationId: "reader-after-hydration" };
    },
    async createUnpublishedPage(contents, _plan, options) {
      contents.getURL = () => PAGES_ADMIN;
      return options.checkTargetAvailable(PAGE_PATH);
    },
  } });
  h.state.value = contents => {
    if (contents === h.windows[0].webContents) return CONNECTED;
    assert.equal(h.windows[1].focuses, 0);
    return ++readerStatusChecks === 1 ? { connected: false, status: "connecting" } : CONNECTED;
  };
  await h.adapter.connect();
  const observation = await h.adapter.createUnpublishedPage(CMS_PLAN, jobOptions("createUnpublishedPage"));
  assert.equal(observation.observationId, "reader-after-hydration");
  assert.equal(h.windows[1].destroyed, true);
  await h.adapter.close();
});

test("Fensterschluss und Renderer-Ausfall brechen die getrennte Adressprüfung ab und schließen nur das Prüffenster", async () => {
  for (const close of [true, false]) {
    const entered = deferred();
    const h = harness({ status: CONNECTED, pageRuns: {
      async checkNewTarget(contents, _path, { signal }) {
        const done = new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
        entered.resolve(contents);
        return done;
      },
      async createUnpublishedPage(contents, _plan, options) {
        contents.getURL = () => PAGES_ADMIN;
        return options.checkTargetAvailable(PAGE_PATH);
      },
    } });
    await h.adapter.connect();
    const pending = h.adapter.createUnpublishedPage(CMS_PLAN, jobOptions("createUnpublishedPage"));
    const contents = await entered.promise;
    const reader = h.windows[1], owner = h.windows[0], focus = owner.focuses;
    if (close) reader.close();
    else contents.emit("render-process-gone");
    await assert.rejects(pending, { code: close ? "SQUARESPACE_WINDOW_CLOSED" : "SQUARESPACE_TARGET_NOT_CONFIRMED" });
    assert.equal(reader.destroyed, true);
    assert.equal(owner.destroyed, false);
    assert.equal(owner.focuses, focus);
    await h.adapter.close();
  }
});

test("Beenden während des Ladens räumt die Adressprüfung vor dem Editor auf", async () => {
  const entered = deferred(), loadGate = deferred();
  const h = harness({ status: CONNECTED, load: url => {
    if (url === PAGES_ADMIN) { entered.resolve(); return loadGate.promise; }
  }, pageRuns: {
    async checkNewTarget() { throw new Error("Das Prüffenster war noch nicht bereit."); },
    async createUnpublishedPage(contents, _plan, options) {
      contents.getURL = () => PAGES_ADMIN;
      return options.checkTargetAvailable(PAGE_PATH);
    },
  } });
  await h.adapter.connect();
  const pending = h.adapter.createUnpublishedPage(CMS_PLAN, jobOptions("createUnpublishedPage"));
  await entered.promise;
  const owner = h.windows[0], reader = h.windows[1], focus = owner.focuses, closed = [];
  owner.once("closed", () => closed.push("editor"));
  reader.once("closed", () => closed.push("reader"));
  const stopped = h.adapter.close();
  await assert.rejects(pending, { code: "SQUARESPACE_ABORTED" });
  await stopped;
  loadGate.resolve();
  assert.deepEqual(closed, ["reader", "editor"]);
  assert.equal(h.calls.filter(call => call === "stop-loading").length, 1);
  assert.equal(owner.focuses, focus);
  assert.equal(reader.focuses, 0);
});

function planWithLibraryImage() {
  const plan = structuredClone(CMS_PLAN), gallery = blocks => blocks.find(block => block.type === "gallery").items;
  const text = { alt: "Eisvogel am Wasser", caption: "Am Wasser", attribution: "FN Wildlife & Travel", decorative: false };
  const image = { ...text, id: "image-use", assetId: "approved-asset", order: 0, mimeType: "image/png", bytes: 4, sha256: "b".repeat(64) };
  gallery(plan.structure.slots).push(image);
  gallery(plan.readback.expectation.blocks).push(text);
  return { plan, image };
}

test("Artseitenbilder gehen über die getrennte Inhaltsbibliothek und bleiben an Editor, Journal und Bildverwendung gebunden", async () => {
  const { plan, image } = planWithLibraryImage();
  const pageId = "d".repeat(24), bytes = Buffer.from("test");
  const fileName = `fn-${"f".repeat(24)}-1.png`, scope = { pageId, path: PAGE_PATH, usageId: image.id, assetId: image.assetId };
  const entered = deferred(), resume = deferred();
  let verify = 0, upload, editorDispatch, editorFocus;
  const h = harness({ status: CONNECTED, pageRuns: {
    async createUnpublishedPage(contents, _plan, options) {
      contents.getURL = () => PAGES_ADMIN;
      editorDispatch = options.dispatchBinding;
      upload = options.uploadLibraryImage;
      editorFocus = h.windows[0].focuses;
      const request = { pageId, image, fileName, bytes, assertCurrent: async () => { verify++; } };
      await assert.rejects(upload({ ...request, image: { ...image, assetId: "foreign" } }), { code: "SQUARESPACE_ASSET_UPLOAD_UNCONFIRMED" });
      assert.equal(h.windows.length, 1);
      const receipt = await upload(request);
      await assert.rejects(upload({ ...request, pageId: "e".repeat(24) }), { code: "SQUARESPACE_ASSET_UPLOAD_UNCONFIRMED" });
      assert.equal(h.windows[0].focuses, editorFocus + 1);
      return receipt;
    },
    async uploadLibraryImage(contents, options) {
      const target = h.windows[1];
      assert.equal(contents, target.webContents);
      assert.equal(contents.session, h.windows[0].webContents.session);
      assert.equal(target.options.parent, h.windows[0]);
      assert.equal(target.options.show, false);
      assert.equal(target.isVisible(), true);
      assert.equal(target.options.webPreferences.sandbox, true);
      assert.deepEqual(target.loads, [SQUARESPACE_ASSET_LIBRARY_URL]);
      assert.equal(options.dispatchBinding, editorDispatch);
      assert.equal(options.fileName, fileName);
      assert.deepEqual(options.bytes, bytes);
      assert.notEqual(options.bytes, bytes);
      assert.equal(await options.assertWritable({ ...scope, path: "/wildlife/other/page" }), false);
      assert.equal(await options.assertWritable(scope), true);
      entered.resolve();
      await resume.promise;
      assert.equal(await options.assertWritable(scope), true);
      return { fileName, assetId: "cms-asset", sourceUrl: "fixture-image" };
    },
  } });
  await h.adapter.connect();
  const pending = h.adapter.createUnpublishedPage(plan, jobOptions("createUnpublishedPage"));
  await entered.promise;
  assert.equal((await h.adapter.connect()).busy, true);
  assert.equal(h.windows[0].focuses, editorFocus);
  assert.deepEqual(h.windows[1].popup({ url: SQUARESPACE_ASSET_LIBRARY_URL }), { action: "deny" });
  await assert.rejects(upload({ pageId, image, fileName, bytes, assertCurrent: async () => {} }), { code: "SQUARESPACE_BUSY" });
  resume.resolve();
  assert.deepEqual(await pending, { fileName, assetId: "cms-asset", sourceUrl: "fixture-image" });
  assert.equal(verify, 3);
  assert.equal(h.windows[1].destroyed, true);
  assert.deepEqual(h.windows[0].loads, ["https://www.fnwildlifetravel.de/config"]);
  await assert.rejects(upload({ pageId, image, fileName, bytes, assertCurrent: async () => {} }),
    { code: "SQUARESPACE_ASSET_UPLOAD_UNCONFIRMED" });
  await h.adapter.close();
});

test("Bildbibliothek stoppt bei falscher Anmeldung, geänderter Seite, entzogenem Auftrag oder Verlassen des Bibliotheksfensters", async () => {
  const { plan, image } = planWithLibraryImage();
  const pageId = "d".repeat(24), scope = { pageId, path: PAGE_PATH, usageId: image.id, assetId: image.assetId };
  for (const scenario of ["login", "editor-changed", "revoked", "redirect", "window-closed"]) {
    let transferred = false;
    const h = harness({ status: CONNECTED, load: url => {
      if (scenario !== "redirect" || url !== SQUARESPACE_ASSET_LIBRARY_URL) return;
      const event = { ...preventable(PAGES_ADMIN), isMainFrame: true };
      h.windows[1].webContents.emit("will-redirect", event);
      assert.equal(event.prevented, true);
    }, pageRuns: {
      async createUnpublishedPage(contents, _plan, options) {
        contents.getURL = () => PAGES_ADMIN;
        return options.uploadLibraryImage({ pageId, image, fileName: `fn-${"f".repeat(24)}-1.png`,
          bytes: Buffer.from("test"), assertCurrent: async () => scenario !== "revoked" });
      },
      async uploadLibraryImage(contents, options) {
        if (scenario === "editor-changed") h.windows[0].webContents.mainFrame = {};
        if (scenario === "window-closed") h.windows[1].close();
        assert.equal(contents, h.windows[1].webContents);
        transferred = await options.assertWritable(scope);
      },
    } });
    await h.adapter.connect();
    if (scenario === "login") h.state.value = contents => contents === h.windows[0].webContents ? CONNECTED : LOGIN;
    await assert.rejects(h.adapter.createUnpublishedPage(plan, jobOptions("createUnpublishedPage")), {
      code: scenario === "login" ? "SQUARESPACE_LOGIN_REQUIRED"
        : scenario === "window-closed" ? "SQUARESPACE_WINDOW_CLOSED" : "SQUARESPACE_ASSET_UPLOAD_UNCONFIRMED",
    });
    assert.equal(transferred, false);
    assert.equal(h.windows[1].destroyed, true);
    assert.equal(h.windows[0].destroyed, false);
    await h.adapter.close();
  }
});

test("Artseiten mit Bildern erfordern den internen Bibliotheksweg schon vor dem Journalstart", async () => {
  const { plan } = planWithLibraryImage();
  const h = harness({ status: CONNECTED, pageRuns: { createUnpublishedPage: async () => ({}) } });
  let journalStarts = 0;
  const beforeWrite = async () => { journalStarts++; return CMS_BINDING; };
  await h.adapter.connect();
  await assert.rejects(h.adapter.createUnpublishedPage(plan, { beforeWrite }), { code: "SQUARESPACE_PAGE_AUTHORING_UNAVAILABLE" });
  await assert.rejects(h.adapter.createUnpublishedPage(plan, { beforeWrite, uploadLibraryImage: async () => ({}) }),
    { code: "SQUARESPACE_CMS_DISPATCH_REQUIRED" });
  assert.equal(journalStarts, 0);
  assert.equal(h.windows.length, 1);
  await h.adapter.close();
});

test("leerer oder unvollständiger Editor stoppt vor Dispatch und gibt die Browsersperre frei", async () => {
  const error = Object.assign(new Error("Der Inhaltseditor ist noch leer."), { code: "SQUARESPACE_EDITOR_NOT_READY" });
  let dispatches = 0;
  const h = harness({ status: CONNECTED, readiness: async () => { throw error; },
    pageRuns: { createUnpublishedPage: async () => ({ saved: true }) } });
  await h.adapter.connect();
  await assert.rejects(h.adapter.createUnpublishedPage(CMS_PLAN, { beforeWrite: async () => { dispatches++; return CMS_BINDING; } }), e => e === error);
  assert.equal(dispatches, 0); assert.deepEqual(driverCalls(h), []); assert.equal((await h.adapter.snapshot()).busy, false);
  await h.adapter.close();
});

test("ein bereiter Editor ohne neue passende Zielbeobachtung startet weder Journal noch Seitentreiber", async () => {
  const changes = [
    () => undefined,
    target => ({ ...target, exists: true }),
    target => ({ ...target, parentExists: false }),
    target => ({ ...target, online: false }),
    target => ({ ...target, path: "/wildlife/andere-region/eisvogel" }),
    target => ({ ...target, parentPath: "/wildlife/andere-region" }),
    target => ({ ...target, checkedAt: new Date(Date.now() - 5000).toISOString() }),
    target => ({ ...target, observationId: CMS_PLAN.target.observationId }),
    target => ({ ...target, checkedAt: new Date(Date.now() + 60000).toISOString() }),
  ];
  for (const change of changes) {
    let dispatches = 0;
    const h = harness({ status: CONNECTED, readiness: async () => {
      const ready = readyFor(CMS_PLAN), proof = change(ready.targetObservation);
      if (proof === undefined) delete ready.targetObservation; else ready.targetObservation = proof;
      return ready;
    },
      pageRuns: { createUnpublishedPage: async () => ({ saved: true }) } });
    await h.adapter.connect();
    await assert.rejects(h.adapter.createUnpublishedPage(CMS_PLAN, { beforeWrite: async () => { dispatches++; return CMS_BINDING; } }),
      { code: "SQUARESPACE_TARGET_NOT_CONFIRMED" });
    assert.equal(dispatches, 0); assert.deepEqual(driverCalls(h), []); await h.adapter.close();
  }
});

test("Bereitschaft gilt nur für den unveränderten Plan und exakt diesen Zielpfad", async () => {
  let getterCalls = 0;
  const accessor = { planHash: CMS_PLAN.planHash, targetPath: PAGE_PATH,
    get ready() { getterCalls++; return true; } };
  const hidden = { planHash: CMS_PLAN.planHash, targetPath: PAGE_PATH };
  Object.defineProperty(hidden, "ready", { value: true });
  for (const readiness of [undefined, false, true, {}, { ready: true }, accessor, hidden,
    new Proxy({ ready: true, planHash: CMS_PLAN.planHash, targetPath: PAGE_PATH }, {
      get(_target, key) { if (key === "then") return undefined; throw new Error("Proxy fields must not be read"); },
    }),
    { ready: true, planHash: CMS_PLAN.planHash, targetPath: PAGE_PATH, beforeWrite() {} },
    { ready: true, planHash: CMS_PLAN.planHash, targetPath: "/wildlife/region/andere-art" },
    { ready: true, planHash: "b".repeat(64), targetPath: PAGE_PATH },
    { ready: "true", planHash: CMS_PLAN.planHash, targetPath: PAGE_PATH }]) {
    let dispatches = 0;
    const h = harness({ status: CONNECTED, readiness: async () => readiness,
      pageRuns: { createUnpublishedPage: async () => ({ saved: true }) } });
    await h.adapter.connect();
    await assert.rejects(h.adapter.createUnpublishedPage(CMS_PLAN, { beforeWrite: async () => { dispatches++; return CMS_BINDING; } }),
      { code: "SQUARESPACE_EDITOR_NOT_READY" });
    assert.equal(dispatches, 0); assert.deepEqual(driverCalls(h), []); await h.adapter.close();
  }
  assert.equal(getterCalls, 0);
});

test("während lesender Vorbereitung geänderte Pläne und verlorene Anmeldung starten kein Journal", async () => {
  for (const change of ["hash", "path", "content", "login"]) {
    let dispatches = 0;
    const plan = structuredClone(CMS_PLAN);
    const h = harness({ status: CONNECTED, readiness: async () => {
      if (change === "hash") plan.planHash = "b".repeat(64);
      if (change === "path") plan.target.path = plan.structure.path = "/wildlife/region/andere-art";
      if (change === "content") plan.structure.title = "Fremder Inhalt bei unverändertem Planhash";
      if (change === "login") h.state.value = LOGIN;
      return readyFor(CMS_PLAN);
    }, pageRuns: { createUnpublishedPage: async () => ({ saved: true }) } });
    await h.adapter.connect();
    await assert.rejects(h.adapter.createUnpublishedPage(plan, { beforeWrite: async () => { dispatches++; return CMS_BINDING; } }),
      error => ["SQUARESPACE_CMS_DISPATCH_CHANGED", "SQUARESPACE_LOGIN_REQUIRED"].includes(error.code));
    assert.equal(dispatches, 0); assert.deepEqual(driverCalls(h), []); await h.adapter.close();
  }
});

for (const closeAdapter of [false, true]) test(`Abbruch während lesender Vorbereitung${closeAdapter ? " mit Close" : ""} wartet auf den Leser ohne Dispatch`, async () => {
  const entered = deferred(), gate = deferred(), caller = new AbortController(); let dispatches = 0;
  const h = harness({ status: CONNECTED, readiness: async (_contents, plan, { signal }) => {
    entered.resolve(signal); await gate.promise; return readyFor(plan);
  }, pageRuns: { createUnpublishedPage: async () => ({ saved: true }) } });
  await h.adapter.connect();
  const pending = h.adapter.createUnpublishedPage(CMS_PLAN, { signal: caller.signal,
    beforeWrite: async () => { dispatches++; return CMS_BINDING; } });
  const signal = await entered.promise;
  let closing, drained = false;
  if (closeAdapter) { closing = h.adapter.close(); void closing.then(() => { drained = true; }); }
  else caller.abort(new Error("Lesende Vorbereitung abgebrochen"));
  assert.equal(signal.aborted, true); await new Promise(resolve => setImmediate(resolve));
  assert.equal(drained, false); assert.equal((await h.adapter.snapshot()).busy, true); assert.equal(h.windows[0].destroyed, false);
  gate.resolve(); await assert.rejects(pending, error => closeAdapter ? error.code === "SQUARESPACE_ABORTED" : /Lesende Vorbereitung/.test(error.message));
  if (closing) await closing;
  assert.equal(dispatches, 0); assert.deepEqual(driverCalls(h), []); assert.equal((await h.adapter.snapshot()).busy, false);
  await h.adapter.close();
});

test("Artseiten reservieren den Browser vor beforeWrite und geben den Hook nicht an den Treiber weiter", async () => {
  const entered = deferred(), gate = deferred(), order = [];
  let hookSignal;
  const h = harness({ status: CONNECTED, pageRuns: { checkNewTarget: async () => ({}), createUnpublishedPage: async (_contents, plan, options) => {
    order.push("driver");
    assert.equal(plan, CMS_PLAN);
    assert.equal(Object.hasOwn(options, "beforeWrite"), false);
    assert.deepEqual(options.dispatchBinding, CMS_BINDING);
    assert.notStrictEqual(options.dispatchBinding, CMS_BINDING);
    assert.equal(options.signal, hookSignal);
    return { saved: true };
  } } });
  await h.adapter.connect();
  const pending = h.adapter.createUnpublishedPage(CMS_PLAN, { beforeWrite: async ({ signal }) => {
    order.push("dispatch-enter");
    hookSignal = signal;
    assert.equal(h.windows[0].isVisible(), true);
    entered.resolve();
    await gate.promise;
    order.push("dispatch-done");
    return CMS_BINDING;
  } });
  await entered.promise;
  for (const other of ["transfer", "checkNewTarget", "createUnpublishedPage"]) {
    await assert.rejects(h.adapter[other](jobInput(other)), { code: "SQUARESPACE_BUSY" });
  }
  assert.deepEqual(driverCalls(h), []);
  gate.resolve();
  assert.deepEqual(await pending, { saved: true });
  assert.deepEqual(order, ["dispatch-enter", "dispatch-done", "driver"]);
  assert.equal(h.windows.length, 1);
  await h.adapter.close();
});

test("verworfener beforeWrite-Dispatch startet keinen CMS-Treiber und gibt die Auftragssperre frei", async () => {
  const h = harness({ status: CONNECTED, pageRuns: { createUnpublishedPage: async () => ({ saved: true }) } });
  const error = new Error("Journalfassung inzwischen geändert");
  let hooks = 0;
  const options = { beforeWrite: async () => { hooks++; throw error; } };
  await assert.rejects(h.adapter.createUnpublishedPage(CMS_PLAN, options), { code: "SQUARESPACE_LOGIN_REQUIRED" });
  assert.equal(hooks, 0);
  await h.adapter.connect();
  await assert.rejects(h.adapter.createUnpublishedPage(CMS_PLAN, options), e => e === error);
  assert.equal(hooks, 1);
  assert.deepEqual(driverCalls(h), []);
  assert.equal((await h.adapter.snapshot()).busy, false);
  assert.deepEqual(await h.adapter.createUnpublishedPage(CMS_PLAN, jobOptions("createUnpublishedPage")), { saved: true });
  await h.adapter.close();
});

test("ein während beforeWrite veränderter Zielpfad kann keinen URL-Aufruf in den Treiber einschleusen", async () => {
  const h = harness({ status: CONNECTED, pageRuns: { createUnpublishedPage: async () => ({ saved: true }) } });
  const plan = structuredClone(CMS_PLAN);
  await h.adapter.connect();
  await assert.rejects(h.adapter.createUnpublishedPage(plan, { beforeWrite: async () => {
    plan.target.path = plan.structure.path = "https://www.fnwildlifetravel.de" + PAGE_PATH;
  } }), { code: "SQUARESPACE_INVALID_PAGE", statusCode: 400 });
  assert.deepEqual(driverCalls(h), []);
  assert.equal((await h.adapter.snapshot()).busy, false);
  await h.adapter.close();
});

test("Artseiten benötigen den internen Journalhook und erlauben keinen vom Aufrufer eingesetzten Journalbezug", async () => {
  const h = harness({ status: CONNECTED, pageRuns: { createUnpublishedPage: async () => ({ saved: true }) } });
  await h.adapter.connect();
  let hooks = 0;
  for (const options of [{}, { dispatchBinding: CMS_BINDING }, { contentSteps: [], beforeWrite: async () => { hooks++; return CMS_BINDING; } }, {
    dispatchBinding: CMS_BINDING, beforeWrite: async () => { hooks++; return CMS_BINDING; },
  }]) {
    await assert.rejects(h.adapter.createUnpublishedPage(CMS_PLAN, options), { code: "SQUARESPACE_CMS_DISPATCH_REQUIRED" });
  }
  assert.equal(hooks, 0);
  assert.deepEqual(driverCalls(h), []);
  assert.equal((await h.adapter.snapshot()).busy, false);
  await h.adapter.close();
});

test("abweichende Inhaltsstruktur stoppt vor lesender Vorbereitung und Journalstart", async () => {
  let preparations = 0, dispatches = 0;
  const h = harness({ status: CONNECTED, readiness: async () => { preparations++; return readyFor(CMS_PLAN); },
    pageRuns: { createUnpublishedPage: async () => ({ saved: true }) } });
  await h.adapter.connect();
  for (const change of [
    plan => { plan.readback.expectation.path = "/wildlife/afrika/eisvogel"; },
    plan => { plan.readback.expectation.blocks[1].code = "<script>andereFunktion()</script>"; },
    plan => { plan.structure.slots[3].code = FN_SPECIES_CODE; },
    plan => { plan.structure.slots[4].items.push({ id: "not-approved" }); },
  ]) {
    const plan = structuredClone(CMS_PLAN); change(plan);
    await assert.rejects(h.adapter.createUnpublishedPage(plan, { beforeWrite: async () => { dispatches++; return CMS_BINDING; } }),
      { code: "cms_content_plan_mismatch" });
  }
  assert.equal(preparations, 0); assert.equal(dispatches, 0); assert.deepEqual(driverCalls(h), []);
  await h.adapter.close();
});

test("fehlender oder widersprüchlicher Journalbezug nach dem Hook startet keinen Seitentreiber", async () => {
  const h = harness({ status: CONNECTED, pageRuns: { createUnpublishedPage: async () => ({ saved: true }) } });
  await h.adapter.connect();
  for (const [binding, code] of [
    [undefined, "cms_dispatch_binding_invalid"],
    [{ ...CMS_BINDING, placeholderTitle: "Eisvogel" }, "cms_dispatch_binding_invalid"],
    [{ ...CMS_BINDING, planHash: "b".repeat(64) }, "cms_dispatch_binding_mismatch"],
    [{ ...CMS_BINDING, targetPath: "/wildlife/region/andere-art" }, "cms_dispatch_binding_mismatch"],
  ]) {
    await assert.rejects(h.adapter.createUnpublishedPage(CMS_PLAN, { beforeWrite: async () => binding }), { code });
    assert.equal((await h.adapter.snapshot()).busy, false);
  }
  assert.deepEqual(driverCalls(h), []);
  await h.adapter.close();
});

test("auch gültige Pfad-, Hash- oder Inhaltsersetzungen während des Journalhooks stoppen vor dem Seitentreiber", async () => {
  const h = harness({ status: CONNECTED, pageRuns: { createUnpublishedPage: async () => ({ saved: true }) } });
  await h.adapter.connect();
  for (const replace of [plan => { plan.target.path = plan.structure.path = "/wildlife/region/andere-art"; },
    plan => { plan.planHash = "b".repeat(64); }, plan => { plan.structure.title = "Fremder Inhalt bei unverändertem Planhash"; }]) {
    const plan = structuredClone(CMS_PLAN);
    await assert.rejects(h.adapter.createUnpublishedPage(plan, { beforeWrite: async () => { replace(plan); return CMS_BINDING; } }),
      { code: "SQUARESPACE_CMS_DISPATCH_CHANGED" });
    assert.equal((await h.adapter.snapshot()).busy, false);
  }
  assert.deepEqual(driverCalls(h), []);
  await h.adapter.close();
});

for (const closeAdapter of [false, true]) {
  test(`Abbruch während beforeWrite${closeAdapter ? " und Adapterclose" : ""} wartet auf den Hook und verhindert Driverstart`, async () => {
    const entered = deferred(), gate = deferred(), controller = new AbortController();
    const h = harness({ status: CONNECTED, pageRuns: { createUnpublishedPage: async () => ({ saved: true }) } });
    await h.adapter.connect();
    const pending = h.adapter.createUnpublishedPage(CMS_PLAN, { signal: controller.signal, beforeWrite: async ({ signal }) => {
      entered.resolve(signal);
      await gate.promise;
    } });
    const signal = await entered.promise;
    let closing, drained = false;
    if (closeAdapter) { closing = h.adapter.close(); void closing.then(() => { drained = true; }); }
    else controller.abort(new Error("Vor CMS-Schreiben abgebrochen"));
    assert.equal(signal.aborted, true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(drained, false);
    assert.equal(h.windows[0].destroyed, false);
    assert.equal((await h.adapter.snapshot()).busy, true);
    gate.resolve();
    await assert.rejects(pending, error => closeAdapter ? error.code === "SQUARESPACE_ABORTED" : /Vor CMS-Schreiben/.test(error.message));
    if (closing) await closing;
    assert.deepEqual(driverCalls(h), []);
    assert.equal((await h.adapter.snapshot()).busy, false);
    await h.adapter.close();
  });
}

test("Squarespace benötigt bis zum bewussten Verbinden weder Fenster noch Netzwerk", async () => {
  const h = harness();
  const state = await h.adapter.snapshot();
  assert.equal(state.available, true);
  assert.equal(state.connected, false);
  assert.equal(state.windowOpen, false);
  assert.equal(state.status, "not-connected");
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.windows, []);
  await h.adapter.close();
  assert.deepEqual(h.windows, []);
  await assert.rejects(h.adapter.connect(), { code: "SQUARESPACE_CLOSED" });
});

test("eigenes persistentes Fenster hat keine Node-Anbindung, kein Preload und keine gelockerten Schutzregeln", async () => {
  const h = harness();
  const result = await h.adapter.connect();
  const options = h.windows[0].options.webPreferences;
  assert.equal(h.windows[0].options.icon, fileURLToPath(new URL(process.platform === "win32"
    ? "./assets/arten-explorer-transparent.ico" : "./assets/arten-explorer.png", import.meta.url)));
  assert.equal(options.partition, "persist:fn-squarespace-texts");
  assert.equal(Object.hasOwn(options, "preload"), false);
  assert.equal(options.nodeIntegration, false);
  assert.equal(options.nodeIntegrationInWorker, false);
  assert.equal(options.nodeIntegrationInSubFrames, false);
  assert.equal(options.contextIsolation, true);
  assert.equal(options.sandbox, true);
  assert.equal(options.webSecurity, true);
  assert.equal(options.allowRunningInsecureContent, false);
  assert.equal(options.webviewTag, false);
  assert.equal(options.navigateOnDragDrop, false);
  assert.deepEqual(h.windows[0].loads, ["https://www.fnwildlifetravel.de/config"]);
  assert.equal(result.connected, false);
  assert.equal(result.status, "login-required");
  assert.equal(result.windowOpen, true);
  assert.equal(result.loginRequired, true);
  await h.adapter.close();
});

test("Browserziele sind ausschließlich die feste FN- und Squarespace-Anmeldeauswahl", () => {
  for (const url of [
    "https://www.fnwildlifetravel.de/config", "https://fnwildlifetravel.de/config/",
    "https://vanilla-gerbil-jwnp.squarespace.com/config", "https://account.squarespace.com/",
    "https://login.squarespace.com/api/1/login/oauth/provider/facebook?next=%2F",
  ]) assert.equal(isAllowedSquarespaceBrowserUrl(url), true, url);
  for (const url of [
    "http://www.fnwildlifetravel.de/config", "file:///C:/secret", "javascript:alert(1)",
    "data:text/html,hi", "https://fnwildlifetravel.de.evil.test/", "https://other.squarespace.com/",
    "https://squarespace.com/", "https://www.fnwildlifetravel.de:123/", "https://user:secret@account.squarespace.com/",
    "https://www.fnwildlifetravel.de./", " https://www.fnwildlifetravel.de/", "https://account.squarespace.com/\n",
    "https://account.squarespace.com\\@evil.test/", "https://login.squarespace.com.evil.test/",
  ]) assert.equal(isAllowedSquarespaceBrowserUrl(url), false, url);
});

test("Navigation, Weiterleitungen und Unterframes stoppen fremde Ziele ohne Token-Ausgabe", async () => {
  const h = harness();
  await h.adapter.connect();
  const contents = h.windows[0].webContents;
  for (const eventName of ["will-navigate", "will-redirect", "will-frame-navigate"]) {
    const bad = preventable("https://evil.test/?loginToken=do-not-show");
    contents.emit(eventName, bad, eventName === "will-frame-navigate" ? undefined : bad.url);
    assert.equal(bad.prevented, true, eventName);
    const good = preventable("https://account.squarespace.com/");
    contents.emit(eventName, good, eventName === "will-frame-navigate" ? undefined : good.url);
    assert.equal(good.prevented, false, eventName);
  }
  const attachment = preventable();
  contents.emit("will-attach-webview", attachment);
  assert.equal(attachment.prevented, true);
  assert.doesNotMatch((await h.adapter.snapshot()).error, /do-not-show|evil\.test/);
  await h.adapter.close();
});

test("Popups bleiben im geschützten Fenster, fremde Popups werden nicht geöffnet", async () => {
  const h = harness();
  await h.adapter.connect();
  const window = h.windows[0];
  assert.deepEqual(window.popup({ url: "https://evil.test/" }), { action: "deny" });
  assert.equal(window.loads.length, 1);
  assert.deepEqual(window.popup({ url: "https://account.squarespace.com/" }), { action: "deny" });
  assert.equal(window.loads.at(-1), "https://account.squarespace.com/");
  assert.equal(h.windows.length, 1);
  await h.adapter.close();
});

test("reCAPTCHA darf im Unterframe der Squarespace-Anmeldung laden, ohne ein Browserziel zu werden", async () => {
  const h = harness();
  await h.adapter.connect();
  const window = h.windows[0];
  await window.loadURL("https://account.squarespace.com/");
  for (const url of [
    "https://www.google.com/recaptcha/api2/anchor?key=public-site-key",
    "https://recaptcha.google.com/recaptcha/api2/bframe",
    "https://www.recaptcha.net/recaptcha/api2/anchor",
  ]) {
    const frame = { ...preventable(url), isMainFrame: false };
    window.webContents.emit("will-frame-navigate", frame);
    assert.equal(frame.prevented, false, url);
    const redirect = { ...preventable(url), isMainFrame: false };
    window.webContents.emit("will-redirect", redirect);
    assert.equal(redirect.prevented, false, url);
    const legacyRedirect = preventable(url);
    window.webContents.emit("will-redirect", legacyRedirect, url, false, false);
    assert.equal(legacyRedirect.prevented, false, url);
    assert.equal(isAllowedSquarespaceBrowserUrl(url), false);
    const main = { ...preventable(url), isMainFrame: true };
    window.webContents.emit("will-frame-navigate", main);
    assert.equal(main.prevented, true, url);
    const navigation = preventable(url);
    window.webContents.emit("will-navigate", navigation, url);
    assert.equal(navigation.prevented, true, url);
    assert.deepEqual(window.popup({ url }), { action: "deny" });
  }
  assert.equal(window.loads.length, 2);
  await h.adapter.close();
});

test("reCAPTCHA-Ausnahme verlangt einen sicheren Pfad, einen echten Unterframe und ein erlaubtes Hauptdokument", async () => {
  const h = harness();
  await h.adapter.connect();
  const window = h.windows[0];
  for (const url of [
    "https://www.google.com/search?q=anything", "https://accounts.google.com/recaptcha/",
    "https://www.google.com/recaptcha-evil/", "https://www.google.com.evil.test/recaptcha/",
    "http://www.google.com/recaptcha/api2/anchor", "https://www.google.com:8443/recaptcha/",
    "https://user:password@www.google.com/recaptcha/", "https://www.google.com/recaptcha/../search",
    "https://www.google.com/recaptcha/\n", "https://www.google.com\\@evil.test/recaptcha/",
  ]) {
    const event = { ...preventable(url), isMainFrame: false };
    window.webContents.emit("will-frame-navigate", event);
    assert.equal(event.prevented, true, url);
  }
  const url = "https://www.google.com/recaptcha/api2/anchor";
  for (const isMainFrame of [true, undefined, null, "false"]) {
    const event = { ...preventable(url), isMainFrame };
    window.webContents.emit("will-frame-navigate", event);
    assert.equal(event.prevented, true);
  }
  for (const topUrl of ["about:blank", "https://evil.test/"]) {
    window.webContents.getURL = () => topUrl;
    const event = { ...preventable(url), isMainFrame: false };
    window.webContents.emit("will-frame-navigate", event);
    assert.equal(event.prevented, true, topUrl);
  }
  await h.adapter.close();
});

test("alle Browserberechtigungen und Downloads sind gesperrt", async () => {
  const h = harness();
  await h.adapter.connect();
  let permission;
  h.session.permissionRequest(null, "media", (value) => { permission = value; });
  assert.equal(permission, false);
  assert.equal(h.session.permissionCheck(null, "fileSystem", "https://account.squarespace.com/"), false);
  assert.equal(h.session.devicePermission({ deviceType: "usb" }), false);
  let cancelled = false;
  const event = preventable();
  h.session.emit("will-download", event, { cancel: () => { cancelled = true; } });
  assert.equal(event.prevented, true);
  assert.equal(cancelled, true);
  assert.match((await h.adapter.snapshot()).error, /Downloads/);
  await h.adapter.close();
});

test("fehlende Browserabsicherung verhindert jede Navigation", async () => {
  const h = harness();
  h.session.setPermissionCheckHandler = () => { throw new Error("permission setup failed"); };
  await assert.rejects(h.adapter.connect(), { code: "SQUARESPACE_BROWSER_SECURITY", statusCode: 503 });
  assert.deepEqual(h.windows[0].loads, []);
  assert.equal(h.windows[0].destroyed, true);
  assert.equal((await h.adapter.snapshot()).windowOpen, false);
  await h.adapter.close();
});

test("erneutes Verbinden fokussiert den vorhandenen Login ohne Neuladen", async () => {
  const h = harness();
  await h.adapter.connect();
  await h.adapter.connect();
  assert.equal(h.windows.length, 1);
  assert.equal(h.windows[0].loads.length, 1);
  assert.equal(h.calls.includes("focus"), true);
  h.state.value = { connected: true, status: "login-required" };
  assert.equal((await h.adapter.snapshot()).connected, false);
  h.state.value = CONNECTED;
  const state = await h.adapter.snapshot();
  assert.equal(state.connected, true);
  assert.equal(state.status, "connected");
  assert.equal(state.loginRequired, false);
  await h.adapter.close();
});

test("Übernahme erfordert bestehende, frisch DOM-bestätigte FN-Verbindung und gültige Seite", async () => {
  const h = harness();
  await assert.rejects(h.adapter.transfer(PLAN), { code: "SQUARESPACE_LOGIN_REQUIRED" });
  assert.equal(h.windows.length, 0);
  await h.adapter.connect();
  await assert.rejects(h.adapter.transfer(PLAN), { code: "SQUARESPACE_LOGIN_REQUIRED" });
  h.state.value = CONNECTED;
  for (const pageUrl of ["https://evil.test/", "https://www.fnwildlifetravel.de/config", "oops", PAGE + "?x=1"]) {
    await assert.rejects(h.adapter.transfer({ ...PLAN, pageUrl }), { code: "SQUARESPACE_INVALID_PAGE", statusCode: 400 });
  }
  assert.equal(h.calls.some((call) => Array.isArray(call) && call[0] === "transfer"), false);
  await h.adapter.close();
});

test("erst echte Anmeldung blendet das Fenster aus und kehrt einmal zum Explorer zurück", async () => {
  const h = harness();
  await h.adapter.connect();
  assert.equal(h.calls.includes("hide"), false);
  h.state.value = { connected: true, status: "connecting" };
  await h.adapter.snapshot();
  assert.equal(h.calls.includes("hide"), false);
  const denied = preventable("https://evil.test/?secret=never-log");
  h.windows[0].webContents.emit("will-navigate", denied, denied.url);
  h.state.value = CONNECTED;
  const state = await h.adapter.snapshot();
  assert.equal(state.connected, true);
  assert.equal(state.windowOpen, true);
  assert.equal(state.windowHidden, true);
  assert.equal(state.error, "");
  assert.match(state.message, /Erfolgreich mit Squarespace verbunden/);
  assert.deepEqual(h.calls.slice(-3), ["hide", "parent-show", "parent-focus"]);
  await h.adapter.snapshot();
  assert.equal(h.calls.filter(c => c === "hide").length, 1);
  await h.adapter.close();
});

test("bewusstes Wiederöffnen bleibt sichtbar bis zur nächsten Anmeldung oder Übernahme", async () => {
  const h = harness({ status: CONNECTED });
  await h.adapter.connect();
  const reopened = await h.adapter.connect();
  assert.equal(reopened.connected, true);
  assert.equal(reopened.windowHidden, false);
  assert.equal(h.windows.length, 1);
  assert.equal(h.windows[0].loads.length, 1);
  await h.adapter.snapshot();
  assert.equal(h.calls.filter(c => c === "hide").length, 1);
  h.state.value = LOGIN;
  assert.equal((await h.adapter.snapshot()).connected, false);
  h.state.value = CONNECTED;
  assert.equal((await h.adapter.snapshot()).windowHidden, true);
  assert.equal(h.calls.filter(c => c === "hide").length, 2);
  await h.adapter.close();
});

test("Übernahme erhält Fensterfokus und blendet danach aus; abgelaufene Anmeldung bleibt sichtbar", async () => {
  let h;
  h = harness({ status: CONNECTED, run: async () => {
    assert.equal(h.windows[0].isVisible(), true);
    assert.deepEqual(h.calls.filter(c => typeof c === "string").slice(-2), ["show", "focus"]);
    h.state.value = { connected: false, status: "connecting" };
    await h.adapter.snapshot();
    h.state.value = CONNECTED;
    return { results: [] };
  } });
  await h.adapter.connect();
  await h.adapter.transfer(PLAN);
  assert.equal(h.windows[0].isVisible(), false);
  const hides = h.calls.filter(c => c === "hide").length;
  assert.equal((await h.adapter.snapshot()).windowHidden, true);
  assert.equal(h.calls.filter(c => c === "hide").length, hides);
  h.state.value = LOGIN;
  await assert.rejects(h.adapter.transfer(PLAN), { code: "SQUARESPACE_LOGIN_REQUIRED" });
  assert.equal(h.windows[0].isVisible(), true);
  assert.equal((await h.adapter.snapshot()).connected, false);
  await h.adapter.close();
});

test("erst im Driver bemerkter Loginverlust lässt das nötige Anmeldefenster sichtbar", async () => {
  let h;
  h = harness({ status: CONNECTED, run: async () => {
    h.state.value = LOGIN;
    throw new Error("Bitte zuerst bei Squarespace anmelden.");
  } });
  await h.adapter.connect();
  await assert.rejects(h.adapter.transfer(PLAN), /anmelden/);
  const state = await h.adapter.snapshot();
  assert.equal(state.loginRequired, true);
  assert.equal(state.windowHidden, false);
  assert.equal(h.windows[0].isVisible(), true);
  await h.adapter.close();
});

test("ältere Statusantwort darf bewusstes Wiederöffnen nicht später rückgängig machen", async () => {
  const h = harness({ status: CONNECTED });
  await h.adapter.connect();
  const gate = deferred();
  h.state.value = () => gate.promise;
  const stale = h.adapter.snapshot();
  await new Promise(resolve => setImmediate(resolve));
  h.state.value = CONNECTED;
  await h.adapter.connect();
  gate.resolve(LOGIN);
  assert.equal((await stale).connected, true);
  await h.adapter.snapshot();
  assert.equal(h.windows[0].isVisible(), true);
  assert.equal(h.calls.filter(c => c === "hide").length, 1);
  await h.adapter.close();
});

test("Plan und Freigabeprüfung werden unverändert an den Driver gereicht", async () => {
  const expected = { results: [{ imageKey: "one", status: "written" }] };
  const assertCurrent = async () => {};
  const callerSignal = new AbortController().signal;
  const h = harness({ status: CONNECTED, run: async (_contents, plan, options) => {
    assert.equal(plan, PLAN);
    assert.equal(options.assertCurrent, assertCurrent);
    assert.notEqual(options.signal, callerSignal);
    assert.equal(options.signal.aborted, false);
    return expected;
  } });
  await h.adapter.connect();
  assert.equal(await h.adapter.transfer(PLAN, { signal: callerSignal, assertCurrent }), expected);
  assert.equal((await h.adapter.snapshot()).busy, false);
  await h.adapter.close();
});

test("gleichzeitige Aufträge und neue Loginpopups werden während einer Übernahme abgelehnt", async () => {
  const gate = deferred();
  const h = harness({ status: CONNECTED, run: () => gate.promise });
  await h.adapter.connect();
  const first = h.adapter.transfer(PLAN);
  await assert.rejects(h.adapter.transfer(PLAN), { code: "SQUARESPACE_BUSY" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await h.adapter.snapshot()).busy, true);
  assert.deepEqual(h.windows[0].popup({ url: "https://account.squarespace.com/" }), { action: "deny" });
  assert.equal(h.windows[0].loads.length, 1);
  gate.resolve({ results: [] });
  await first;
  await h.adapter.close();
});

test("externes Abbruchsignal wird weitergereicht und verhindert nachträglichen Scheinerfolg", async () => {
  const entered = deferred();
  const gate = deferred();
  const h = harness({ status: CONNECTED, run: (_contents, _plan, options) => {
    entered.resolve(options.signal);
    return gate.promise;
  } });
  await h.adapter.connect();
  const abort = new AbortController();
  const pending = h.adapter.transfer(PLAN, { signal: abort.signal });
  const inner = await entered.promise;
  const reason = new Error("Benutzer hat abgebrochen");
  abort.abort(reason);
  assert.equal(inner.aborted, true);
  assert.equal(inner.reason, reason);
  gate.resolve({ results: [{ status: "written" }] });
  await assert.rejects(pending, (error) => error === reason);
  assert.match((await h.adapter.snapshot()).error, /abgebrochen/);
  await h.adapter.close();
});

test("bereits abgebrochener Auftrag beginnt keine CMS-Prüfung oder Übernahme", async () => {
  const h = harness({ status: CONNECTED });
  await h.adapter.connect();
  const count = h.calls.length;
  const controller = new AbortController();
  controller.abort(new Error("vorher abgebrochen"));
  await assert.rejects(h.adapter.transfer(PLAN, { signal: controller.signal }), /vorher abgebrochen/);
  assert.equal(h.calls.length, count);
  await h.adapter.close();
});

test("Fensterschließen bricht ab und wartet bis zum Ende des laufenden Drivers", async () => {
  const entered = deferred();
  const gate = deferred();
  const h = harness({ status: CONNECTED, run: (_contents, _plan, options) => {
    entered.resolve(options.signal);
    return gate.promise;
  } });
  await h.adapter.connect();
  const pending = h.adapter.transfer(PLAN);
  const inner = await entered.promise;
  h.windows[0].close();
  assert.equal(inner.aborted, true);
  assert.equal(h.windows[0].destroyed, false);
  assert.equal((await h.adapter.snapshot()).busy, true);
  gate.resolve({ results: [] });
  await assert.rejects(pending, { code: "SQUARESPACE_WINDOW_CLOSED" });
  assert.equal(h.windows[0].destroyed, true);
  const closed = await h.adapter.snapshot();
  assert.equal(closed.windowOpen, false);
  assert.equal(closed.busy, false);
  assert.match(closed.error, /Fenster geschlossen/);
  await h.adapter.connect();
  assert.equal(h.windows.length, 2);
  await h.adapter.close();
});

test("Anwendungsschließen wartet auf Abbruch und schließt ohne erzwungenes Zerstören", async () => {
  const entered = deferred();
  const gate = deferred();
  const h = harness({ status: CONNECTED, run: (_contents, _plan, options) => {
    entered.resolve(options.signal);
    return gate.promise;
  } });
  await h.adapter.connect();
  const pending = h.adapter.transfer(PLAN);
  const inner = await entered.promise;
  const closing = h.adapter.close();
  assert.equal(h.adapter.close(), closing);
  assert.equal(inner.aborted, true);
  assert.equal(h.windows[0].destroyed, false);
  let drained = false;
  void closing.then(() => { drained = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(drained, false);
  gate.resolve({ results: [] });
  await assert.rejects(pending, { code: "SQUARESPACE_ABORTED" });
  await closing;
  assert.equal(h.windows[0].destroyed, true);
  assert.equal((await h.adapter.snapshot()).status, "closed");
  await assert.rejects(h.adapter.connect(), { code: "SQUARESPACE_CLOSED" });
});

test("verspätete Anmeldeprüfung kann ein geschlossenes Fenster nicht als verbunden melden", async () => {
  const h = harness();
  await h.adapter.connect();
  const gate = deferred();
  h.state.value = () => gate.promise;
  const pending = h.adapter.snapshot();
  h.windows[0].close();
  gate.resolve(CONNECTED);
  const state = await pending;
  assert.equal(state.connected, false);
  assert.equal(state.windowOpen, false);
  assert.equal(state.status, "closed");
  await h.adapter.close();
});

test("Ladefehler sind sichtbar, enthalten keine Callback-Token und können bewusst wiederholt werden", async () => {
  let attempts = 0;
  const h = harness({ load: () => {
    if (!attempts++) throw new Error("Laden fehlgeschlagen https://account.squarespace.com/?token=do-not-show");
  } });
  const failed = await h.adapter.connect();
  assert.equal(failed.status, "error");
  assert.doesNotMatch(failed.error, /do-not-show/);
  const retry = await h.adapter.connect();
  assert.equal(retry.status, "login-required");
  assert.equal(h.windows.length, 1);
  assert.equal(h.windows[0].loads.length, 2);
  await h.adapter.close();
});

test("hängendes Verbinden stoppt nach 15 Sekunden nur den Ladevorgang und erlaubt bewussten Neuversuch", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const loading = deferred();
  let attempts = 0;
  const h = harness({ load: () => ++attempts === 1 ? loading.promise : undefined });
  const pending = h.adapter.connect();
  t.mock.timers.tick(14999);
  assert.equal(h.calls.includes("stop-loading"), false);
  t.mock.timers.tick(1);
  const state = await pending;
  assert.equal(state.connected, false);
  assert.equal(state.status, "error");
  assert.match(state.error, /15 Sekunden/);
  assert.equal(h.calls.filter((call) => call === "stop-loading").length, 1);
  assert.equal(h.windows[0].destroyed, false);
  const retry = await h.adapter.connect();
  assert.equal(retry.status, "login-required");
  assert.equal(h.windows.length, 1);
  loading.reject(new Error("späte Netzwerkantwort"));
  await h.adapter.close();
});

test("Browser-Schließen beendet auch einen noch ausstehenden connect-Ladevorgang", async () => {
  const loading = deferred();
  const h = harness({ load: () => loading.promise });
  const pending = h.adapter.connect();
  h.windows[0].close();
  const state = await pending;
  assert.equal(state.windowOpen, false);
  assert.equal(state.connected, false);
  assert.equal(h.calls.filter((call) => call === "stop-loading").length, 1);
  loading.resolve();
  await h.adapter.close();
});

test("Anwendungsschließen wartet nicht auf einen hängenden connect-Ladevorgang", async () => {
  const loading = deferred();
  const h = harness({ load: () => loading.promise });
  const pending = h.adapter.connect();
  await h.adapter.close();
  const state = await pending;
  assert.equal(state.windowOpen, false);
  assert.equal(state.connected, false);
  assert.equal(h.calls.filter((call) => call === "stop-loading").length, 1);
  loading.resolve();
});
