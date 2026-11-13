/**
 * Dedicated native qualification compositor, never imported by the normal app.
 * No automatic clicks, clock shortcuts, fake proof reader or OS execution.
 * Start later with Electron and --action none|exit-explorer|shutdown|restart.
 * This qualifies the production owner + server + UI, NOT desktop/main.mjs.
 */
import fs from "node:fs/promises";
import { appendFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { assertTestTempPath } from "../../scripts/test-temp.mjs";
import { EXPLORER_WINDOW_ICON } from "../desktop/window-branding.mjs";
import { assertQualificationFixture, createQualificationWorkspace, reserveQualificationWorkspace, installQualificationEnvironment,
  markQualificationServerActive, prepareQualificationTaxonomy, readQualificationState } from "./qualify-desktop-fixture.mjs";

const ACTIONS = Object.freeze(["none", "exit-explorer", "shutdown", "restart"]);
const LABELS = Object.freeze({ none: "Nichts tun", "exit-explorer": "Explorer beenden", shutdown: "PC herunterfahren", restart: "PC neu starten" });
const ALLOWED_POSTS = new Set(["/api/taxonomy/update/sequence-start", "/api/taxonomy/update-completion/displayed", "/api/taxonomy/update-completion/cancel"]);

export function parseQualificationArguments(args) {
  if (args.length === 1 && args[0] === "--help") return { help: true };
  if (args.length !== 2 || args[0] !== "--action" || !ACTIONS.includes(args[1])) {
    throw new Error("Prüfziel ausdrücklich angeben: --action none|exit-explorer|shutdown|restart. Keine Pfad-, Countdown- oder Ausführungsoptionen erlaubt.");
  }
  return { action: args[1] };
}

export function createQualificationRecorder(fixture) {
  assertQualificationFixture(fixture);
  const filename = assertTestTempPath(path.join(fixture.evidenceRoot, "events.jsonl"));
  writeFileSync(filename, "", { flag: "wx" });
  return { filename, write(event) {
    assertQualificationFixture(fixture);
    assertTestTempPath(filename);
    appendFileSync(filename, `${JSON.stringify({ ...event, recordedAt: new Date().toISOString(), ownerPid: process.pid,
      qualificationNonce: fixture.nonce })}\n`);
  } };
}

/** This function has NO real spawn fallback, including on invalid or repeated input. */
export function createSuppressedSystemSpawn({ fixture, action, record, windowsRoot = process.env.SystemRoot || process.env.WINDIR } = {}) {
  assertQualificationFixture(fixture);
  if (!ACTIONS.includes(action) || typeof record !== "function" || !path.win32.isAbsolute(windowsRoot || "") || /^[/\\]{2}/.test(windowsRoot)) {
    throw new Error("Die native Gegenprobe benötigt ein festes Prüfziel und einen lokalen Windows-Pfad.");
  }
  const calls = [];
  const expectedExecutable = path.win32.join(windowsRoot, "System32", "shutdown.exe");
  const spawnImpl = (executable, args, options) => {
    assertQualificationFixture(fixture);
    const accepted = ["shutdown", "restart"].includes(action) && executable === expectedExecutable
      && Array.isArray(args) && JSON.stringify(args) === JSON.stringify([action === "shutdown" ? "/s" : "/r", "/t", "0"])
      && options?.shell === false && options.windowsHide === true
      && JSON.stringify(options.stdio) === JSON.stringify(["ignore", "pipe", "pipe"])
      && Object.keys(options).every((key) => ["shell", "windowsHide", "stdio"].includes(key)) && calls.length === 0;
    record({ type: accepted ? "system-call-suppressed" : "unexpected-system-call-blocked", executable, args, options,
      expectedAction: action, actualSystemProcessStarted: false });
    if (!accepted) throw new Error("Unerwarteter oder wiederholter Systemaufruf sicher abgefangen. Es wurde kein Systemprozess gestartet.");
    calls.push({ executable, args: [...args], options: structuredClone(options) });
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    queueMicrotask(() => {
      try {
        record({ type: "suppressed-process-result", simulatedExitCode: 0, actualSystemProcessStarted: false });
        child.stdout.end(); child.stderr.end(); child.emit("close", 0);
      } catch (error) { child.stdout.destroy(); child.stderr.destroy(); child.emit("error", error); }
    });
    return child;
  };
  return { spawnImpl, calls };
}

export function qualificationRequestAllowed(details, baseUrl) {
  try {
    const url = new URL(details.url);
    if (url.origin !== new URL(baseUrl).origin) return false;
    if (["GET", "HEAD"].includes(details.method)) return true;
    return details.method === "POST" && ALLOWED_POSTS.has(url.pathname);
  } catch { return false; }
}

/** Actual production services; only the owner's final Windows spawn is replaced. */
export async function startQualificationServer({ fixture, action, getWindow, onFinished, onFailure, record } = {}) {
  assertQualificationFixture(fixture);
  if (!ACTIONS.includes(action) || [getWindow, onFinished, onFailure, record].some((value) => typeof value !== "function")) {
    throw new Error("Eindeutiger Prüfkompositor mit eigenem Fenster und Abschlussbeobachter erforderlich.");
  }
  if (process.env.FN_EXPLORER_DATA_ROOT !== fixture.dataRoot || process.env.IUCN_TAXONOMY_DIR !== fixture.taxonomyRoot
    || process.env.FN_LIGHTROOM_SEARCH_ROOT !== fixture.searchRoot || process.env.GIT_CONFIG_GLOBAL !== fixture.gitConfig) {
    throw new Error("Vor dem Serverstart muss die ausschließlich eigene Prüfumgebung aktiv sein.");
  }
  const [{ createExplorerServer }, { createDesktopUpdateCompletionOwner }] = await Promise.all([
    import("../server.mjs"), import("../desktop/update-completion-owner.mjs"),
  ]);
  const suppressed = createSuppressedSystemSpawn({ fixture, action, record });
  let baseUrl, completion, closeInProgress = false, server;
  try {
    server = await createExplorerServer({ repoRoot: fixture.repoRoot, taxonomyRoot: fixture.taxonomyRoot,
      lightroomSearchRoot: fixture.searchRoot, nasBackupRoot: fixture.nasRoot, host: "127.0.0.1", port: 0,
      updateCompletionFactory(serverContext) {
        completion = createDesktopUpdateCompletionOwner({ device: fixture.device, stateRoot: fixture.stateRoot, serverContext,
          getWindow, getBaseUrl: () => baseUrl, adapterOptions: { spawnImpl: suppressed.spawnImpl },
          acquireDesktopClose() {
            if (closeInProgress) throw new Error("Die eigene Prüfsitzung schließt bereits.");
            closeInProgress = true;
            return () => { closeInProgress = false; };
          },
          async finishExplorerExit() {
            markQualificationServerActive(fixture, false);
            await onFinished();
          },
          async restoreAfterFailure(details) {
            record({ type: "completion-failed", serverClosed: details.serverClosed, error: details.error?.message });
            await onFailure(details);
          },
          onError(error) { record({ type: "completion-runtime-error", error: error.message }); },
        });
        return completion;
      },
    });
    markQualificationServerActive(fixture, true);
    const address = await server.listen();
    baseUrl = `http://127.0.0.1:${address.port}`;
    // Use the same real status sources consumed by the normal browser bootstrap.
    // A broken fixture must fail here, rather than opening an unrelated publication workflow.
    const [validation, pendingChanges] = await Promise.all(["validation", "pending-changes"].map(async (resource) => {
      const response = await fetch(`${baseUrl}/api/${resource}`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`Die echte Prüfgrundlage ist nicht lesbar (${resource}, HTTP ${response.status}).`);
      return response.json();
    }));
    if (validation.status !== "ok" || pendingChanges.hasPendingChanges !== false || pendingChanges.error) {
      throw new Error(`Die eigene Desktop-Prüfgrundlage ist noch offen: ${validation.issueCount || 0} Validierungsbefunde, `
        + `${pendingChanges.manualChangeCount || 0} Pipelineziele, ${pendingChanges.pendingFileCount || 0} Gitänderungen. ${pendingChanges.error || ""}`);
    }
    record({ type: "actual-bootstrap-verified", validation, pendingChanges });
    record({ type: "server-listening", baseUrl, actualOwner: true, actualServer: true, countdownSeconds: 60,
      normalMainCompositionQualified: false });
    return { server, baseUrl, completion, suppressed, async close() {
      await server.close(); markQualificationServerActive(fixture, false);
    } };
  } catch (error) {
    if (server) { await server.close(); markQualificationServerActive(fixture, false); }
    throw error;
  }
}

export async function evaluateQualificationResult({ fixture, action, completion, suppressedCalls, reason }) {
  const state = await readQualificationState(fixture);
  const status = await completion.status();
  const commandCount = ["shutdown", "restart"].includes(action) ? 1 : 0;
  const successful = state.proof.ready === true && state.workflow?.decision === "sync-lightroom"
    && (action === "none" ? reason === "manual-close" && status.status === "inactive" && status.action === "none"
      : reason === "completion" && status.status === "requested" && status.action === action && status.updateRunId === state.workflow.updateRunId)
    && suppressedCalls.length === commandCount;
  return { schemaVersion: 1, successful, action, reason, status, workflow: state.workflow, proof: state.proof,
    packageId: state.publication?.active?.packageId || null, suppressedCalls, actualSystemProcessStarted: false,
    operatingSystemShutdownQualified: false, normalMainCompositionQualified: false, realLightroomSdkQualified: false };
}

export async function runDesktopQualification({ action } = {}) {
  if (!process.versions.electron || process.platform !== "win32") throw new Error("Diesen Prüfkompositor ausdrücklich mit Electron unter Windows starten.");
  if (!ACTIONS.includes(action)) throw new Error("Ein eindeutiges Prüfziel fehlt.");
  const { app, BrowserWindow, dialog } = createRequire(import.meta.url)("electron");
  const reservation = reserveQualificationWorkspace();
  let fixture;
  try {
    // No await before these calls: Chromium must never initialize the normal profile.
    app.setPath("userData", reservation.profileRoot);
    app.setPath("sessionData", reservation.profileRoot);
    app.setAppUserModelId(`FN.ArtenExplorer.IsolatedCompletion.${reservation.nonce}`);
    fixture = await createQualificationWorkspace(reservation);
  } catch (error) { app.quit(); throw error; }
  const restoreEnvironment = installQualificationEnvironment(fixture);
  const recorder = createQualificationRecorder(fixture), record = (event) => recorder.write(event);
  let window, running, observer, finishing = false, finished = false;
  const finish = async (reason) => {
    if (finishing) return;
    finishing = true;
    clearInterval(observer);
    let result;
    try {
      result = await evaluateQualificationResult({ fixture, action, completion: running.completion,
        suppressedCalls: running.suppressed.calls, reason });
    } catch (error) { record({ type: "qualification-incomplete", error: error.message }); }
    try { await running?.close(); }
    catch (error) {
      // Keep the isolated environment and owned window while a writer remains unclosed.
      record({ type: "regular-close-incomplete", error: error.message });
      finishing = false;
      return;
    }
    try {
      if (result) await fs.writeFile(assertTestTempPath(path.join(fixture.evidenceRoot, "result.json")),
        `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
      record({ type: "qualification-ended", successful: result?.successful === true, reason });
    } catch (error) { console.error(`Prüfquittung unvollständig: ${error.message}`); }
    finally {
      finished = true;
      window?.destroy();
      restoreEnvironment();
      app.quit();
    }
  };
  try {
    app.on("before-quit", (event) => { if (!finished) { event.preventDefault(); if (running) void finish("manual-close"); } });
    app.on("window-all-closed", () => { if (finished) app.quit(); });
    await app.whenReady();
    record({ type: "qualification-created", action, repoRoot: fixture.repoRoot, dataRoot: fixture.dataRoot,
      profileRoot: fixture.profileRoot, productionInputsCopied: false, commandSuppressionPermanent: true });
    const initial = await prepareQualificationTaxonomy(fixture, { withSearchPackage: false });
    if (initial.master.lightroomPackage?.status !== "missing" || initial.master.reference?.needsMasterRebuild !== false
      || initial.master.corrections?.pending !== false || initial.master.identities?.pending !== false || initial.usage.ready !== true) {
      throw new Error("Die echte kleine Prüfgrundlage bietet nicht ausschließlich den Suchpaket-Abgleich an.");
    }
    window = new BrowserWindow({ width: 1420, height: 940, minWidth: 1100, minHeight: 720,
      icon: EXPLORER_WINDOW_ICON,
      title: `ISOLIERTE PRÜFUNG · ${LABELS[action]} · kein Windows-Systemaufruf`, show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, spellcheck: true,
        partition: `isolated-completion-${fixture.nonce}`, preload: fileURLToPath(new URL("../desktop/preload.cjs", import.meta.url)) } });
    window.setMenuBarVisibility(false);
    window.on("page-title-updated", (event) => event.preventDefault());
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.on("close", (event) => { if (!finished) { event.preventDefault(); void finish("manual-close"); } });
    running = await startQualificationServer({ fixture, action, getWindow: () => window, record,
      onFinished: () => finish("completion"),
      onFailure: ({ error }) => dialog.showMessageBox(window, { type: "warning", buttons: ["Zur isolierten Prüfung"],
        title: "Abschlussprüfung angehalten", message: error.message, detail: "Kein Windows-Systemprozess wurde gestartet. Die lokale Prüfquittung bleibt erhalten." }) });
    const web = window.webContents;
    web.session.webRequest.onBeforeRequest((details, callback) => {
      const allowed = qualificationRequestAllowed(details, running.baseUrl);
      if (!allowed) record({ type: "out-of-scope-request-blocked", method: details.method, url: details.url });
      callback({ cancel: !allowed });
    });
    web.session.webRequest.onCompleted((details) => {
      if (details.method === "POST") record({ type: "actual-ui-request-completed", method: details.method,
        path: new URL(details.url).pathname, statusCode: details.statusCode });
    });
    web.on("will-navigate", (event, url) => { if (!qualificationRequestAllowed({ method: "GET", url }, running.baseUrl)) event.preventDefault(); });
    await window.loadURL(running.baseUrl);
    window.show();
    running.server.startBackgroundFeatures();
    let previous = "", observing = false;
    observer = setInterval(async () => {
      if (observing || finishing) return;
      observing = true;
      try {
        const status = await running.completion.status(), key = JSON.stringify(status);
        if (key !== previous) { previous = key; record({ type: "actual-completion-status", status }); }
      } catch (error) { if (!finishing) record({ type: "status-read-failed", error: error.message }); }
      finally { observing = false; }
    }, 1000);
    console.log(`Isolierte Prüfung: ${fixture.repoRoot}\nZiel: ${LABELS[action]}. Im tatsächlichen Datenbankdialog diese Aktion wählen und den Suchpaket-Abgleich starten.\nDialog danach schließen, damit der echte 60-Sekunden-Countdown sichtbar bestätigt werden kann.\nBei „Nichts tun“ nach erfolgreichem Update das Prüf-Fenster selbst schließen. Keine anderen Explorerfunktionen prüfen.\nDer letzte Windows-Aufruf wird ausschließlich protokolliert; der PC bleibt an. Quittung: ${fixture.evidenceRoot}`);
    return { fixture, baseUrl: running.baseUrl };
  } catch (error) {
    record({ type: "qualification-start-failed", error: error.message });
    clearInterval(observer);
    await running?.close();
    finished = true;
    window?.destroy();
    restoreEnvironment();
    app.quit();
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseQualificationArguments(process.argv.slice(2));
    if (options.help) console.log("Nur für die spätere abgestimmte native Probe: Electron qualify-desktop.mjs --action none|exit-explorer|shutdown|restart. Kein automatischer Start unter Node, kein wirklicher Windowsbefehl.");
    // Electron emits ready only after its ESM entry has completed. Waiting for
    // the entire GUI lifecycle at top level would also wait for that same ready
    // event. The async function sets its private profile before its first await.
    else void runDesktopQualification(options).catch((error) => { console.error(error.message); process.exitCode = 1; });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
