import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createSquarespaceBrowserAdapter, isAllowedSquarespaceBrowserUrl } from "./squarespace-browser.mjs";

const PAGE = "https://www.fnwildlifetravel.de/reisen/2019-griechenland/athen";
const PLAN = { pageUrl: PAGE, pageTitle: "Athen", revision: 7, images: [] };
const CONNECTED = { connected: true, status: "connected", message: "FN-Verwaltung erkannt." };
const LOGIN = { connected: false, status: "login-required", message: "Bitte anmelden." };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const preventable = (url) => ({ url, prevented: false, preventDefault() { this.prevented = true; } });

function harness({ status = LOGIN, run = async () => ({ results: [] }), load = null } = {}) {
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
      this.loads = [];
      this.webContents = new EventEmitter();
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
    focus() { calls.push("focus"); }
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
  const parent = { isDestroyed: () => false, isMinimized: () => false,
    show: () => calls.push("parent-show"), focus: () => calls.push("parent-focus") };
  const adapter = createSquarespaceBrowserAdapter({ BrowserWindow: FakeBrowserWindow, driver, parentWindow: () => parent });
  return { adapter, windows, calls, session, state, driver, parent };
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
