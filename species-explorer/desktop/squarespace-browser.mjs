import { normalizeWebsitePageUrl } from "../website-alt-parser.mjs";
import { EXPLORER_WINDOW_ICON } from "./window-branding.mjs";
import { cmsTargetPath, validateCmsDispatchBinding, validateCmsTargetObservation } from "../page-authoring/cms-dispatch.mjs";
import { createCmsContentSteps } from "../page-authoring/cms-content-steps.mjs";
import { validateCmsSaveBinding } from "../page-authoring/cms-save-binding.mjs";
import { fingerprint } from "../page-authoring/contract.mjs";
import { SQUARESPACE_ASSET_LIBRARY_URL } from "./squarespace-assets-library.mjs";
import { isProxy } from "node:util/types";
import { setTimeout as delay } from "node:timers/promises";

const START_URL = "https://www.fnwildlifetravel.de/config";
const PAGES_URL = "https://vanilla-gerbil-jwnp.squarespace.com/config/pages";
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

function validateNewPagePath(path) {
  try { cmsTargetPath(path); }
  catch {
    throw failure("Die Artseite benötigt einen gültigen lokalen FN-Wildlife-Inhaltspfad.", "SQUARESPACE_INVALID_PAGE", 400);
  }
}

/** A dedicated manual-login browser. Authentication is proved only by the CMS driver. */
export function createSquarespaceBrowserAdapter({ BrowserWindow, parentWindow = () => null, driver } = {}) {
  if (typeof BrowserWindow !== "function" || typeof driver?.getStatus !== "function"
      || typeof driver?.transfer !== "function" || typeof parentWindow !== "function") {
    throw new TypeError("Squarespace-Browser benötigt BrowserWindow, parentWindow und CMS-Driver.");
  }
  const pageAuthoringAvailable = typeof driver.checkNewTarget === "function"
    && typeof driver.prepareUnpublishedPage === "function"
    && typeof driver.createUnpublishedPage === "function";
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

  function focusParent() {
    const parent = parentWindow();
    if (parent && !parent.isDestroyed()) activate(parent);
  }

  function hideAndReturn(target) {
    if (!isLive(target) || target !== window || shutdown) return;
    target.hide();
    focusParent();
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

  function protectWindow(target, { fixedMainUrl, onNavigationBlocked } = {}) {
    const contents = target.webContents;
    protectSession(contents.session);
    const navigation = (event, url, main = true) => {
      const nextUrl = typeof url === "string" ? url : event.url;
      const allowed = fixedMainUrl && main ? nextUrl === fixedMainUrl : isAllowedSquarespaceBrowserUrl(nextUrl);
      if (!allowed) {
        event.preventDefault();
        if (fixedMainUrl && main) onNavigationBlocked();
        else if (!fixedMainUrl) block("Diese Adresse ist für das Squarespace-Fenster nicht freigegeben.");
      }
    };
    const frameNavigation = (event, url, _isInPlace, legacyIsMainFrame) => {
      const nextUrl = typeof url === "string" ? url : event.url;
      const isMainFrame = typeof event.isMainFrame === "boolean" ? event.isMainFrame : legacyIsMainFrame;
      // The login challenge is a third-party child frame, never a top-level destination or popup.
      let allowedParent = false;
      try { allowedParent = isAllowedSquarespaceBrowserUrl(contents.getURL()); } catch { /* Closed frame: fail closed. */ }
      if (!fixedMainUrl && isMainFrame === false && allowedParent && isAllowedRecaptchaFrameUrl(nextUrl)) return;
      navigation(event, url, isMainFrame !== false);
    };
    contents.on("will-navigate", navigation);
    contents.on("will-redirect", frameNavigation);
    contents.on("will-frame-navigate", frameNavigation);
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      if (fixedMainUrl) return { action: "deny" };
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

  function createWindow(parent, { title, show }) {
    return new BrowserWindow({
      width: 1280, height: 900, minWidth: 1000, minHeight: 700, title, show,
      icon: EXPLORER_WINDOW_ICON,
      ...(parent && !parent.isDestroyed() ? { parent } : {}),
      webPreferences: {
        partition: PARTITION, nodeIntegration: false, nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false, contextIsolation: true, sandbox: true,
        webSecurity: true, allowRunningInsecureContent: false, webviewTag: false,
        safeDialogs: true, navigateOnDragDrop: false,
      },
    });
  }

  async function closeWindow(target) {
    if (!target || target.isDestroyed()) return;
    await new Promise((resolve) => {
      target.once("closed", resolve);
      target.close();
      if (target.isDestroyed()) resolve();
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
      if (!activeJob?.sideTask) activate(window);
      if (loadFailed && !activeJob) await loadStart(window);
      return snapshot({ hideAfterLogin: false });
    }
    window = createWindow(parentWindow(), { title: "Squarespace · FN-Website", show: true });
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

  async function runJob(input, options, validate, run, beforeWrite, bindWrite, prepare, { activateOwner = true } = {}) {
    if (shutdown) throw failure("Squarespace-Verbindung wurde beendet.", "SQUARESPACE_CLOSED");
    if (activeJob) throw failure("Eine Squarespace-Übernahme läuft bereits.", "SQUARESPACE_BUSY");
    if (!isLive()) throw failure("Öffne Squarespace und melde dich zuerst an.", "SQUARESPACE_LOGIN_REQUIRED");
    if (loading || loadFailed) throw failure("Squarespace ist noch nicht vollständig geladen. Öffne die Verbindung erneut.", "SQUARESPACE_LOGIN_REQUIRED");
    validate();
    aborted(options.signal);
    const controller = new AbortController();
    const target = window;
    let finish;
    const job = { controller, window: target, done: new Promise((resolve) => { finish = resolve; }) };
    activeJob = job;
    let raisedForJob = false;
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
      // Electron native input requires a focused BrowserWindow. An isolated
      // readback job focuses only its own window.
      if (activateOwner) {
        activate(target);
        raisedForJob = true;
      }
      if (prepare) {
        // Read and navigate only. A missing editor or unsupported field must stop
        // while the personal journal still says "prepared", before any write.
        validate();
        await prepare(target.webContents, input, { signal: controller.signal });
        aborted(controller.signal);
        if (!isLive(target) || target !== window) throw failure("Squarespace-Fenster wurde geschlossen.", "SQUARESPACE_WINDOW_CLOSED");
        validate();
        const fresh = await readStatus(target);
        aborted(controller.signal);
        if (!isLive(target) || target !== window) throw failure("Squarespace-Fenster wurde geschlossen.", "SQUARESPACE_WINDOW_CLOSED");
        if (fresh?.connected !== true || fresh?.status !== "connected") {
          throw failure("Die Squarespace-Anmeldung wurde während der Vorbereitung beendet. Bitte erneut verbinden.", "SQUARESPACE_LOGIN_REQUIRED");
        }
      }
      let writeResult;
      if (beforeWrite) {
        // The Node caller journals dispatch only after reserving this browser job.
        validate();
        writeResult = await beforeWrite({ signal: controller.signal });
        aborted(controller.signal);
        if (!isLive(target) || target !== window) throw failure("Squarespace-Fenster wurde geschlossen.", "SQUARESPACE_WINDOW_CLOSED");
      }
      validate();
      const dispatchBinding = bindWrite ? bindWrite(writeResult) : null;
      const result = await run.call(driver, target.webContents, input, { ...options,
        ...(dispatchBinding ? { dispatchBinding } : {}), signal: controller.signal });
      aborted(controller.signal);
      if (job.sideTask) throw failure("Der Auftrag im getrennten Squarespace-Fenster läuft noch.", "SQUARESPACE_BUSY");
      if (!isLive(target) || target !== window) throw failure("Squarespace-Fenster wurde geschlossen.", "SQUARESPACE_WINDOW_CLOSED");
      return result;
    } catch (error) {
      block(visibleError(error, "Squarespace-Übernahme fehlgeschlagen."));
      throw error;
    } finally {
      options.signal?.removeEventListener("abort", externalAbort);
      try {
        if (job.sideTask) {
          controller.abort(failure("Der Auftrag im getrennten Squarespace-Fenster wurde beendet.", "SQUARESPACE_ABORTED"));
          await job.sideTask.catch(() => {});
        }
        if (raisedForJob && !job.closing && !shutdown && isLive(target)) {
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

  async function transfer(plan, options = {}) {
    return runJob(plan, options, () => {
      let pageUrl;
      try { pageUrl = typeof plan?.pageUrl === "string" ? normalizeWebsitePageUrl(plan.pageUrl) : null; }
      catch { pageUrl = null; }
      if (!pageUrl || pageUrl !== plan.pageUrl) {
        throw failure("Die Übernahme benötigt eine gültige FN-Inhaltsseite.", "SQUARESPACE_INVALID_PAGE", 400);
      }
    }, driver.transfer);
  }

  function pageAuthoringMethod(name) {
    const method = driver[name];
    if (typeof method !== "function") {
      throw failure("Der Squarespace-Treiber unterstützt die Artseitenarbeit noch nicht.", "SQUARESPACE_PAGE_AUTHORING_UNAVAILABLE");
    }
    return method;
  }

  async function checkNewTarget(path, options = {}) {
    const run = pageAuthoringMethod("checkNewTarget");
    return runJob(path, options, () => validateNewPagePath(path), run);
  }

  async function loadSideWindow(target, url, signal) {
    aborted(signal);
    let timer, onAbort;
    const interrupted = new Promise((_resolve, reject) => {
      const stop = error => {
        reject(error);
        try { if (isLive(target)) target.webContents.stop(); } catch { /* Navigation may already have ended. */ }
      };
      onAbort = () => stop(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => stop(failure("Das getrennte Squarespace-Fenster lädt nicht rechtzeitig.",
        "SQUARESPACE_LOAD_TIMEOUT", 504)), LOAD_TIMEOUT_MS);
      timer.unref?.();
    });
    try {
      await Promise.race([Promise.resolve().then(() => {
        aborted(signal);
        return target.loadURL(url);
      }), interrupted]);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
  }

  function runBesideEditor(job, writer, { title, url, changed, ownerUrl = PAGES_URL, preserveOwnerVisibility = false }, perform) {
    const { signal } = job.controller, owner = job.window;
    const writerFrame = writer.mainFrame;
    const sameEditor = () => !shutdown && !job.closing && job === activeJob && window === owner && isLive(owner)
      && owner.webContents === writer && writerFrame && writer.mainFrame === writerFrame && writer.getURL() === ownerUrl;
    function assertEditor() {
      aborted(signal);
      if (!sameEditor()) throw changed();
    }
    assertEditor();
    if (job.sideTask) throw failure("Ein Auftrag im getrennten Squarespace-Fenster läuft bereits.", "SQUARESPACE_BUSY");
    async function run() {
      assertEditor();
      const target = createWindow(owner, { title, show: false });
      const contents = target.webContents;
      const onClose = () => job.controller.abort(failure("Das getrennte Squarespace-Fenster wurde geschlossen.",
        "SQUARESPACE_WINDOW_CLOSED"));
      const onChange = () => job.controller.abort(changed());
      target.once("closed", onClose);
      contents.once("render-process-gone", onChange);
      let boundFrame, result;
      function assertSideWindow() {
        assertEditor();
        if (!isLive(target) || !boundFrame || contents.mainFrame !== boundFrame || contents.getURL() !== url) throw changed();
      }
      try {
        if (contents.session !== writer.session) throw changed();
        protectWindow(target, { fixedMainUrl: url, onNavigationBlocked: onChange });
        await loadSideWindow(target, url, signal);
        boundFrame = contents.mainFrame;
        assertSideWindow();
        const deadline = performance.now() + STATUS_TIMEOUT_MS;
        let status = await readStatus(target);
        assertSideWindow();
        while (status?.status === "connecting" && performance.now() < deadline) {
          await delay(Math.min(250, deadline - performance.now()), undefined, { signal });
          assertSideWindow();
          status = await readStatus(target);
          assertSideWindow();
        }
        if (status?.status === "connecting") {
          throw failure("Die Squarespace-Verwaltung im getrennten Fenster lädt noch. Bitte die Verbindung prüfen.",
            "SQUARESPACE_LOAD_TIMEOUT", 504);
        }
        if (status?.connected !== true || status?.status !== "connected") {
          throw failure("Das getrennte Fenster hat keine gültige Squarespace-Anmeldung. Bitte die Verbindung prüfen.",
            "SQUARESPACE_LOGIN_REQUIRED");
        }
        activate(target);
        result = await perform(contents, { signal, assertSideWindow });
        assertSideWindow();
      } finally {
        target.removeListener("closed", onClose);
        contents.removeListener("render-process-gone", onChange);
        try { await closeWindow(target); }
        finally {
          if (!signal.aborted && sameEditor()) {
            if (preserveOwnerVisibility && (owner.isVisible?.() === false || owner.isMinimized?.())) focusParent();
            else activate(owner);
          }
        }
      }
      assertEditor();
      return result;
    }
    const pending = Promise.resolve().then(run).finally(() => { if (job.sideTask === pending) job.sideTask = null; });
    job.sideTask = pending;
    void pending.catch(() => {});
    return pending;
  }

  function checkTargetBesideEditor(job, writer, path) {
    return runBesideEditor(job, writer, {
      title: "Squarespace · Seitenadresse prüfen", url: PAGES_URL,
      changed: () => failure("Die getrennte Squarespace-Adressprüfung hat sich geändert.",
        "SQUARESPACE_TARGET_NOT_CONFIRMED"),
    }, (contents, { signal }) => driver.checkNewTarget(contents, path, { signal }));
  }

  function bindLibraryUpload(job, writer, items, dispatchBinding) {
    const imageKeys = ["id", "assetId", "order", "mimeType", "bytes", "sha256"];
    const approved = items.map(item => Object.fromEntries(imageKeys.map(key => [key, item[key]])));
    const changed = () => failure("Die Bilddatei, der Artseitenentwurf oder die Squarespace-Inhaltsbibliothek konnten nicht eindeutig bestätigt werden.",
      "SQUARESPACE_ASSET_UPLOAD_UNCONFIRMED");
    let boundPageId;
    return async ({ pageId, image, fileName, bytes, assertCurrent } = {}) => {
      const expected = Number.isSafeInteger(image?.order) && approved[image.order];
      if (!expected || imageKeys.some(key => image[key] !== expected[key])
          || typeof pageId !== "string" || !/^[a-f0-9]{24}$/.test(pageId) || boundPageId && boundPageId !== pageId
          || typeof assertCurrent !== "function" || !Buffer.isBuffer(bytes) || bytes.length !== expected.bytes
          || bytes.length < 1 || bytes.length > 32 * 1024 * 1024) throw changed();
      const original = Buffer.from(bytes);
      return runBesideEditor(job, writer, {
        title: "Squarespace · Inhaltsbibliothek", url: SQUARESPACE_ASSET_LIBRARY_URL, changed,
      }, async (contents, { signal, assertSideWindow }) => {
        const verifyEditor = async () => {
          assertSideWindow();
          if (await assertCurrent() === false) throw changed();
          assertSideWindow();
        };
        await verifyEditor();
        boundPageId ??= pageId;
        return driver.uploadLibraryImage(contents, {
          pageId, image: expected, fileName, bytes: original, dispatchBinding, signal,
          assertWritable: async scope => {
            if (scope?.pageId !== pageId || scope.path !== dispatchBinding.targetPath
                || scope.usageId !== expected.id || scope.assetId !== expected.assetId) return false;
            await verifyEditor();
            return true;
          },
        });
      });
    };
  }

  async function createUnpublishedPage(plan, options = {}) {
    const run = pageAuthoringMethod("createUnpublishedPage");
    const prepare = pageAuthoringMethod("prepareUnpublishedPage");
    const { beforeWrite, ...driverOptions } = options;
    const expectedDispatch = { planHash: plan?.planHash, targetPath: plan?.target?.path };
    const planObservationId = plan?.target?.observationId;
    let targetObservation, preparationStarted, originalPlanFingerprint, contentSteps;
    function currentTarget(observation) {
      try {
        const now = Date.now(), target = validateCmsTargetObservation(observation, expectedDispatch.targetPath, now);
        const checked = Date.parse(target.checkedAt);
        if (checked >= preparationStarted && checked <= now && target.observationId !== planObservationId) return target;
      } catch { /* The browser reports only the bounded target result. */ }
      throw failure("Die freie Zieladresse und ihr Websitebereich konnten für diesen Auftrag nicht erneut bestätigt werden.", "SQUARESPACE_TARGET_NOT_CONFIRMED");
    }
    return runJob(plan, driverOptions, () => {
      validateNewPagePath(plan?.target?.path);
      if (plan.target.path !== plan.structure?.path) {
        throw failure("Ziel und Struktur müssen dieselbe lokale FN-Artseite bezeichnen.", "SQUARESPACE_INVALID_PAGE", 400);
      }
      if (typeof plan.planHash !== "string" || !/^[a-f0-9]{64}$/.test(plan.planHash)) {
        throw failure("Der Seitenauftrag benötigt seinen vollständigen gespeicherten Planhash.", "SQUARESPACE_INVALID_PAGE", 400);
      }
      const planFingerprint = fingerprint(plan);
      originalPlanFingerprint ??= planFingerprint;
      if (plan.target.path !== expectedDispatch.targetPath || plan.planHash !== expectedDispatch.planHash || planFingerprint !== originalPlanFingerprint) {
        throw failure("Der Seitenauftrag wurde während der Vorbereitung geändert.", "SQUARESPACE_CMS_DISPATCH_CHANGED");
      }
      if (["dispatchBinding", "contentSteps", "checkTargetAvailable", "uploadLibraryImage"].some(key => Object.hasOwn(driverOptions, key))
          || typeof beforeWrite !== "function") {
        throw failure("Die Seitenanlage benötigt ausschließlich den bestätigten internen Journalstart.", "SQUARESPACE_CMS_DISPATCH_REQUIRED");
      }
      contentSteps ??= createCmsContentSteps(plan);
      const galleryItems = plan.structure.slots[contentSteps.find(step => step.kind === "gallery").slotIndex].items;
      if (galleryItems.length && typeof driver.uploadLibraryImage !== "function") {
        throw failure("Die Squarespace-Inhaltsbibliothek ist für diesen Artseitenentwurf noch nicht verfügbar.",
          "SQUARESPACE_PAGE_AUTHORING_UNAVAILABLE");
      }
      if (targetObservation) currentTarget(targetObservation);
    }, (contents, input, runOptions) => {
      const job = activeJob;
      const usedObservations = new Set([planObservationId, targetObservation.observationId]);
      async function checkTargetAvailable(path) {
        if (path !== expectedDispatch.targetPath) {
          throw failure("Die getrennte Adressprüfung gehört zu einem anderen Seitenauftrag.", "SQUARESPACE_TARGET_NOT_CONFIRMED");
        }
        const started = Date.now();
        const observation = currentTarget(await checkTargetBesideEditor(job, contents, path));
        if (Date.parse(observation.checkedAt) < started || usedObservations.has(observation.observationId)) {
          throw failure("Die freie Zieladresse wurde nicht frisch geprüft.", "SQUARESPACE_TARGET_NOT_CONFIRMED");
        }
        usedObservations.add(observation.observationId);
        return observation;
      }
      const galleryItems = input.structure.slots[contentSteps.find(step => step.kind === "gallery").slotIndex].items;
      const uploadLibraryImage = galleryItems.length
        ? bindLibraryUpload(job, contents, galleryItems, Object.freeze(runOptions.dispatchBinding)) : undefined;
      return run.call(driver, contents, input, { ...runOptions, contentSteps, checkTargetAvailable,
        ...(uploadLibraryImage && { uploadLibraryImage }) });
    },
    beforeWrite, value => validateCmsDispatchBinding(value, expectedDispatch), async (contents, input, prepareOptions) => {
      preparationStarted = Date.now();
      const readiness = await prepare.call(driver, contents, input, { ...prepareOptions, contentSteps });
      const keys = ["ready", "planHash", "targetPath"];
      const descriptors = readiness && typeof readiness === "object" && !isProxy(readiness)
        && Object.getPrototypeOf(readiness) === Object.prototype ? Object.getOwnPropertyDescriptors(readiness) : null;
      if (!descriptors || Reflect.ownKeys(descriptors).some(key => ![...keys, "targetObservation"].includes(key))
          || !keys.every(key => descriptors[key]?.enumerable && Object.hasOwn(descriptors[key], "value"))
          || readiness.ready !== true || readiness.planHash !== expectedDispatch.planHash || readiness.targetPath !== expectedDispatch.targetPath) {
        throw failure("Der Squarespace-Editor ist für diesen Seitenauftrag noch nicht vollständig bereit. Der Auftrag bleibt vorbereitet.", "SQUARESPACE_EDITOR_NOT_READY");
      }
      const target = descriptors.targetObservation;
      targetObservation = currentTarget(target?.enumerable ? target.value : undefined);
    });
  }

  async function recheckUnpublishedPage(plan, { saveBinding, assertCurrent, signal } = {}) {
    const run = pageAuthoringMethod("recheckUnpublishedPage");
    if (typeof assertCurrent !== "function") throw failure("Die Rückprüfung benötigt den bestätigten persönlichen Speicherversuch.",
      "SQUARESPACE_CMS_DISPATCH_REQUIRED");
    const descriptors = saveBinding && typeof saveBinding === "object" && !isProxy(saveBinding)
      ? Object.getOwnPropertyDescriptors(saveBinding) : null;
    const binding = validateCmsSaveBinding(saveBinding, { plan, attempt: { id: descriptors?.attemptId?.value, dispatchId: descriptors?.dispatchId?.value } });
    const originalPlan = fingerprint(plan);
    const changed = () => failure("Die getrennte Squarespace-Rückprüfung ist nicht mehr eindeutig gebunden.",
      "SQUARESPACE_PAGE_RECHECK_UNCONFIRMED");
    function validate() {
      if (fingerprint(plan) !== originalPlan) throw changed();
    }
    return runJob(plan, { signal }, validate, (contents, input) => {
      const ownerUrl = contents.getURL();
      const owner = new URL(ownerUrl);
      if (owner.origin !== new URL(PAGES_URL).origin || !(owner.pathname === "/config" || owner.pathname.startsWith("/config/"))) throw changed();
      return runBesideEditor(activeJob, contents, { title: "Squarespace · Entwurf prüfen", url: PAGES_URL,
        changed, ownerUrl, preserveOwnerVisibility: true }, (sideContents, { signal: sideSignal, assertSideWindow }) => {
        const assertBound = async () => {
          assertSideWindow();
          validate();
          if (await assertCurrent() === false) throw changed();
          assertSideWindow();
          validate();
        };
        return run.call(driver, sideContents, input, { saveBinding: binding, assertCurrent: assertBound, signal: sideSignal });
      });
    }, undefined, undefined, undefined, { activateOwner: false });
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
      await closeWindow(window);
    })();
    return closePromise;
  }

  return Object.defineProperty({ connect, snapshot, transfer, checkNewTarget, createUnpublishedPage, close,
    ...(typeof driver.recheckUnpublishedPage === "function" && { recheckUnpublishedPage }) },
    "pageAuthoringAvailable", { value: pageAuthoringAvailable, enumerable: true });
}
