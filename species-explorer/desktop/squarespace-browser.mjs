import { normalizeWebsitePageUrl } from "../website-alt-parser.mjs";
import { EXPLORER_WINDOW_ICON } from "./window-branding.mjs";

const START_URL = "https://www.fnwildlifetravel.de/config";
const PARTITION = "persist:fn-squarespace-texts";
const ALLOWED_HOSTS = new Set([
  "www.fnwildlifetravel.de", "fnwildlifetravel.de",
  "vanilla-gerbil-jwnp.squarespace.com", "account.squarespace.com", "login.squarespace.com",
]);
const STATUS_TIMEOUT_MS = 5000;
const LOAD_TIMEOUT_MS = 15000;
const RECAPTCHA_FRAME_HOSTS = new Set(["www.google.com", "recaptcha.google.com", "www.recaptcha.net"]);

export function isAllowedSquarespaceBrowserUrl(value) {
  if (typeof value !== "string" || !value || value.length > 8192 || /[\u0000-\u0020\u007f\\]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && ALLOWED_HOSTS.has(url.hostname);
  } catch { return false; }
}

function isAllowedRecaptchaFrameUrl(value) {
  if (typeof value !== "string" || !value || value.length > 8192 || /[\u0000-\u0020\u007f\\]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && RECAPTCHA_FRAME_HOSTS.has(url.hostname) && url.pathname.startsWith("/recaptcha/");
  } catch { return false; }
}

function failure(message, code, statusCode = 409) {
  return Object.assign(new Error(message), { code, statusCode });
}

function aborted(signal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason
    : failure("Die Squarespace-Übernahme wurde abgebrochen.", "SQUARESPACE_ABORTED");
}

function visibleError(error, fallback) {
  // Navigation errors can contain login callback tokens; do not expose their URL.
  return String(error?.message || fallback).replace(/https?:\/\/[^\s<>"']+/gi, "[Squarespace-Adresse]").slice(0, 1500);
}

function activate(window) {
  if (window.isMinimized?.()) window.restore();
  window.show();
  window.focus();
}

/** A dedicated manual-login browser. Authentication is proved only by the CMS driver. */
export function createSquarespaceBrowserAdapter({ BrowserWindow, parentWindow = () => null, driver } = {}) {
  if (typeof BrowserWindow !== "function" || typeof driver?.getStatus !== "function"
      || typeof driver?.transfer !== "function" || typeof parentWindow !== "function") {
    throw new TypeError("Squarespace-Browser benötigt BrowserWindow, parentWindow und CMS-Driver.");
  }
  let window = null;
  let generation = 0;
  let activeJob = null;
  let shutdown = false;
  let closePromise = null;
  let lastError = "";
  let hadWindow = false;
  let loadFailed = false;
  let loading = false;
  let pendingNavigation = null;
  let connectionConfirmed = false;
  let statusReadEpoch = 0;
  let acceptedState = { connected: false, status: "connecting" };
  const guardedSessions = new WeakSet();

  const isLive = (target = window) => Boolean(target && !target.isDestroyed()
    && !target.webContents.isDestroyed());
  const baseSnapshot = () => ({
    available: true,
    connected: false,
    status: shutdown || hadWindow ? "closed" : "not-connected",
    sessionStatus: shutdown || hadWindow ? "closed" : "not-connected",
    message: lastError || (shutdown ? "Squarespace-Verbindung beendet."
      : "Öffne Squarespace und melde dich im eigenen Browserfenster an."),
    windowOpen: false,
    windowHidden: false,
    loginRequired: false,
    busy: Boolean(activeJob),
    error: lastError,
  });

  async function readStatus(target) {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => driver.getStatus(target.webContents)),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve({ connected: false, status: "connecting",
            message: "Squarespace wird noch geladen. Bitte warte einen Moment." }), STATUS_TIMEOUT_MS);
          timer.unref?.();
        }),
      ]);
    } finally { clearTimeout(timer); }
  }

  function hideAndReturn(target) {
    if (!isLive(target) || target !== window || shutdown) return;
    target.hide();
    const parent = parentWindow();
    if (parent && !parent.isDestroyed()) activate(parent);
  }

  async function snapshot({ hideAfterLogin = true } = {}) {
    if (!isLive()) return baseSnapshot();
    const target = window;
    const version = generation;
    const readEpoch = ++statusReadEpoch;
    let state;
    try { state = await readStatus(target); }
    catch (error) {
      state = { connected: false, status: "error",
        message: visibleError(error, "Squarespace-Anmeldung konnte noch nicht geprüft werden.") };
    }
    if (generation !== version || window !== target || !isLive(target)) return isLive() ? snapshot() : baseSnapshot();
    const currentRead = readEpoch === statusReadEpoch;
    if (currentRead) acceptedState = state;
    else state = acceptedState;
    const connected = !loading && !loadFailed && state?.connected === true && state?.status === "connected";
    if (currentRead && connected && !connectionConfirmed) {
      lastError = "";
      if (hideAfterLogin && !activeJob) hideAndReturn(target);
    }
    if (currentRead) connectionConfirmed = connected;
    const status = connected ? "connected" : loadFailed ? "error"
      : loading || state?.status === "connecting" ? "connecting"
        : state?.status === "error" ? "error" : "login-required";
    return {
      available: true, connected, status, sessionStatus: status, windowOpen: true,
      windowHidden: !target.isVisible(), loginRequired: !connected,
      busy: Boolean(activeJob), error: lastError,
      message: lastError || String(connected ? "Erfolgreich mit Squarespace verbunden." : state?.message
        || "Melde dich im Squarespace-Fenster an und öffne die FN-Website-Verwaltung.").slice(0, 1500),
    };
  }

  function block(message) {
    lastError = message;
  }

  function protectSession(session) {
    if (guardedSessions.has(session)) return;
    session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.setPermissionCheckHandler(() => false);
    session.setDevicePermissionHandler?.(() => false);
    session.on("will-download", (event, item) => {
      event.preventDefault();
      item?.cancel?.();
      block("Downloads sind im Squarespace-Fenster deaktiviert.");
    });
    guardedSessions.add(session);
  }

  function protectWindow(target) {
    const contents = target.webContents;
    protectSession(contents.session);
    const navigation = (event, url) => {
      const nextUrl = typeof url === "string" ? url : event.url;
      if (!isAllowedSquarespaceBrowserUrl(nextUrl)) {
        event.preventDefault();
        block("Diese Adresse ist für das Squarespace-Fenster nicht freigegeben.");
      }
    };
    const frameNavigation = (event, url, _isInPlace, legacyIsMainFrame) => {
      const nextUrl = typeof url === "string" ? url : event.url;
      const isMainFrame = typeof event.isMainFrame === "boolean" ? event.isMainFrame : legacyIsMainFrame;
      // The login challenge is a third-party child frame, never a top-level destination or popup.
      let allowedParent = false;
      try { allowedParent = isAllowedSquarespaceBrowserUrl(contents.getURL()); } catch { /* Closed frame: fail closed. */ }
      if (isMainFrame === false && allowedParent && isAllowedRecaptchaFrameUrl(nextUrl)) return;
      navigation(event, url);
    };
    contents.on("will-navigate", navigation);
    contents.on("will-redirect", frameNavigation);
    contents.on("will-frame-navigate", frameNavigation);
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      if (!isAllowedSquarespaceBrowserUrl(url)) {
        block("Diese Adresse ist für das Squarespace-Fenster nicht freigegeben.");
      } else if (activeJob) {
        block("Während der Übernahme kann kein weiteres Squarespace-Ziel geöffnet werden.");
      } else if (isLive(target) && !shutdown) {
        void target.loadURL(url).catch((error) => {
          if (target === window) block(visibleError(error, "Squarespace konnte nicht geöffnet werden."));
        });
      }
      // Allowed login popups stay in the same fenced browser, never an unguarded child.
      return { action: "deny" };
    });
    target.on("close", (event) => {
      if (pendingNavigation?.window === target) {
        pendingNavigation.cancel(failure("Squarespace-Fenster wurde geschlossen.", "SQUARESPACE_WINDOW_CLOSED"));
      }
      if (!activeJob || activeJob.window !== target) return;
      event.preventDefault();
      const job = activeJob;
      const error = failure("Squarespace-Fenster geschlossen; die Übernahme wurde abgebrochen.", "SQUARESPACE_WINDOW_CLOSED");
      block(error.message);
      job.controller.abort(error);
      if (job.closing) return;
      job.closing = true;
      void job.done.then(() => {
        if (isLive(target)) target.close();
      });
    });
    target.on("closed", () => {
      if (pendingNavigation?.window === target) {
        pendingNavigation.cancel(failure("Squarespace-Fenster wurde geschlossen.", "SQUARESPACE_WINDOW_CLOSED"));
      }
      if (activeJob?.window === target) {
        const error = failure("Squarespace-Fenster geschlossen; die Übernahme wurde abgebrochen.", "SQUARESPACE_WINDOW_CLOSED");
        block(error.message);
        activeJob.controller.abort(error);
      }
      if (target === window) {
        window = null;
        connectionConfirmed = false;
        statusReadEpoch++;
        acceptedState = { connected: false, status: "closed" };
        loading = false;
        generation++;
      }
    });
  }

  async function loadStart(target) {
    loading = true;
    loadFailed = false;
    lastError = "";
    let timer;
    let rejectInterrupted;
    let settled = false;
    const interrupted = new Promise((_resolve, reject) => { rejectInterrupted = reject; });
    const navigation = {
      window: target,
      cancel(error) {
        if (settled) return;
        settled = true;
        rejectInterrupted(error);
        if (isLive(target)) target.webContents.stop();
      },
    };
    pendingNavigation = navigation;
    timer = setTimeout(() => navigation.cancel(failure(
      "Squarespace konnte innerhalb von 15 Sekunden nicht geladen werden. Bitte versuche es erneut.",
      "SQUARESPACE_LOAD_TIMEOUT", 504)), LOAD_TIMEOUT_MS);
    timer.unref?.();
    try { await Promise.race([target.loadURL(START_URL), interrupted]); }
    catch (error) {
      if (target === window) {
        loadFailed = true;
        block(visibleError(error, "Squarespace konnte nicht geladen werden."));
      }
    } finally {
      settled = true;
      clearTimeout(timer);
      if (pendingNavigation === navigation) pendingNavigation = null;
      if (target === window) loading = false;
    }
  }

  async function connect() {
    if (shutdown) throw failure("Squarespace-Verbindung wurde beendet.", "SQUARESPACE_CLOSED");
    if (isLive()) {
      activate(window);
      if (loadFailed && !activeJob) await loadStart(window);
      return snapshot({ hideAfterLogin: false });
    }
    const parent = parentWindow();
    window = new BrowserWindow({
      width: 1280, height: 900, minWidth: 1000, minHeight: 700,
      title: "Squarespace · Website-Bildtexte", show: true,
      icon: EXPLORER_WINDOW_ICON,
      ...(parent && !parent.isDestroyed() ? { parent } : {}),
      webPreferences: {
        partition: PARTITION, nodeIntegration: false, nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false, contextIsolation: true, sandbox: true,
        webSecurity: true, allowRunningInsecureContent: false, webviewTag: false,
        safeDialogs: true, navigateOnDragDrop: false,
      },
    });
    generation++;
    connectionConfirmed = false;
    statusReadEpoch++;
    acceptedState = { connected: false, status: "connecting" };
    hadWindow = true;
    const target = window;
    try { protectWindow(target); }
    catch {
      block("Squarespace-Fenster konnte nicht sicher eingerichtet werden.");
      target.close();
      if (window === target) window = null;
      throw failure(lastError, "SQUARESPACE_BROWSER_SECURITY", 503);
    }
    await loadStart(target);
    return snapshot();
  }

  async function transfer(plan, options = {}) {
    if (shutdown) throw failure("Squarespace-Verbindung wurde beendet.", "SQUARESPACE_CLOSED");
    if (activeJob) throw failure("Eine Squarespace-Übernahme läuft bereits.", "SQUARESPACE_BUSY");
    if (!isLive()) throw failure("Öffne Squarespace und melde dich zuerst an.", "SQUARESPACE_LOGIN_REQUIRED");
    if (loading || loadFailed) throw failure("Squarespace ist noch nicht vollständig geladen. Öffne die Verbindung erneut.", "SQUARESPACE_LOGIN_REQUIRED");
    let pageUrl;
    try { pageUrl = typeof plan?.pageUrl === "string" ? normalizeWebsitePageUrl(plan.pageUrl) : null; }
    catch { pageUrl = null; }
    if (!pageUrl || pageUrl !== plan.pageUrl) {
      throw failure("Die Übernahme benötigt eine gültige FN-Inhaltsseite.", "SQUARESPACE_INVALID_PAGE", 400);
    }
    aborted(options.signal);
    const controller = new AbortController();
    const target = window;
    let finish;
    const job = { controller, window: target, done: new Promise((resolve) => { finish = resolve; }) };
    activeJob = job;
    let raisedForTransfer = false;
    const externalAbort = () => controller.abort(options.signal.reason);
    options.signal?.addEventListener("abort", externalAbort, { once: true });
    lastError = "";
    try {
      const state = await readStatus(target);
      aborted(controller.signal);
      if (!isLive(target) || target !== window) throw failure("Squarespace-Fenster wurde geschlossen.", "SQUARESPACE_WINDOW_CLOSED");
      if (state?.connected !== true || state?.status !== "connected") {
        connectionConfirmed = false;
        statusReadEpoch++;
        acceptedState = state;
        activate(target);
        throw failure("Melde dich zuerst im Squarespace-Fenster an und öffne die FN-Website-Verwaltung.", "SQUARESPACE_LOGIN_REQUIRED");
      }
      // Electron native text input requires a focused BrowserWindow.
      activate(target);
      raisedForTransfer = true;
      const result = await driver.transfer(target.webContents, plan, { ...options, signal: controller.signal });
      aborted(controller.signal);
      if (!isLive(target) || target !== window) throw failure("Squarespace-Fenster wurde geschlossen.", "SQUARESPACE_WINDOW_CLOSED");
      return result;
    } catch (error) {
      block(visibleError(error, "Squarespace-Übernahme fehlgeschlagen."));
      throw error;
    } finally {
      options.signal?.removeEventListener("abort", externalAbort);
      try {
        if (raisedForTransfer && !job.closing && !shutdown && isLive(target)) {
          const state = await readStatus(target).catch(() => ({ connected: false, status: "error" }));
          if (!job.closing && !shutdown && isLive(target) && target === window) {
            statusReadEpoch++;
            acceptedState = state;
            if (state?.connected === true && state?.status === "connected") {
              connectionConfirmed = true;
              hideAndReturn(target);
            }
            else { connectionConfirmed = false; activate(target); }
          }
        }
      } finally {
        if (activeJob === job) activeJob = null;
        finish();
      }
    }
  }

  function close() {
    if (closePromise) return closePromise;
    shutdown = true;
    closePromise = (async () => {
      pendingNavigation?.cancel(failure("Squarespace-Verbindung wurde beendet.", "SQUARESPACE_CLOSED"));
      const job = activeJob;
      if (job) {
        const error = failure("Squarespace-Verbindung beendet; die Übernahme wurde abgebrochen.", "SQUARESPACE_ABORTED");
        block(error.message);
        job.controller.abort(error);
        await job.done;
      }
      if (isLive()) {
        const target = window;
        await new Promise((resolve) => {
          target.once("closed", resolve);
          target.close();
          if (target.isDestroyed()) resolve();
        });
      }
    })();
    return closePromise;
  }

  return { connect, snapshot, transfer, close };
}
