import { app, BrowserWindow, dialog, Menu, safeStorage, shell } from "electron";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  createDesktopProjectImportOptions,
  getExplorerBackupStatus,
  getExplorerPendingChanges,
  getExplorerPipelineStatus,
  getExplorerWebsiteAltTransferStatus,
  isBackupBlockingShutdown,
  isPipelineBlockingShutdown,
  startManagedExplorerServer,
  stopManagedExplorerServer,
} from "./server-lifecycle.mjs";
import { activateExplorerWindow } from "./window-activation.mjs";
import { installGermanSpellcheck } from "./spellcheck.mjs";
import { EXPLORER_WINDOW_ICON } from "./window-branding.mjs";
import { createSquarespaceBrowserAdapter } from "./squarespace-browser.mjs";
import { createSquarespaceGalleryDriver } from "./squarespace-gallery-driver.mjs";
import { loadLocalDeviceProfile } from "./device-profile.mjs";
import { createSharedProjectCredentialStore } from "./shared-project-credentials.mjs";
import { createExplorerMediaBudgetReader } from "../shared-project/media-profile-budget.mjs";
import { createDesktopUpdateCompletionOwner, readTrustedCompletionPresentation } from "./update-completion-owner.mjs";
import {
  consumeLightroomCorrectionHandoff,
  parseLightroomCorrectionRequestIds,
} from "../lightroom-correction-handoff.mjs";

const WINDOW_TITLE = "Arten-Explorer";
const START_PAGE = "data:text/html;charset=utf-8,"
  + encodeURIComponent(`
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <title>${WINDOW_TITLE}</title>
  <style>
    body {
      margin: 0;
      height: 100vh;
      display: grid;
      place-items: center;
      color: #16241f;
      background: #edf3f0;
      font: 16px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(520px, calc(100vw - 48px));
      padding: 28px;
      background: #fff;
      border: 1px solid #cfdad5;
      border-radius: 12px;
      box-shadow: 0 18px 60px rgb(0 0 0 / 0.14);
    }
    h1 { margin: 0 0 8px; font-size: 1.3rem; }
    p { margin: 0; color: #5d6b65; line-height: 1.45; }
  </style>
</head>
<body>
  <main>
    <h1>Arten-Explorer startet…</h1>
    <p>Der lokale Server wird gestartet und geprüft. Das App-Fenster öffnet danach automatisch.</p>
  </main>
</body>
</html>`);

let mainWindow = null;
let managedServer = null;
let quitting = false;
let closeCheckInProgress = false;
let pendingSecondInstanceActivation = false;
let explorerPageReady = false;
let personalProjectProfile = null;
const pendingCorrectionRequests = [];
const handledCorrectionRequestIds = new Set();

function deliverPendingCorrectionRequests() {
  if (!explorerPageReady || !mainWindow || mainWindow.isDestroyed?.()) return;
  while (pendingCorrectionRequests.length) {
    mainWindow.webContents.send("taxonomy-correction-request", pendingCorrectionRequests.shift());
  }
}

async function queueCorrectionRequests(args) {
  for (const requestId of parseLightroomCorrectionRequestIds(args)) {
    if (handledCorrectionRequestIds.has(requestId)) continue;
    handledCorrectionRequestIds.add(requestId);
    try {
      const request = await consumeLightroomCorrectionHandoff(requestId);
      if (request) pendingCorrectionRequests.push(request);
    } catch (error) {
      await dialog.showMessageBox(mainWindow, {
        type: "warning",
        buttons: ["OK"],
        title: "Lightroom-Korrekturanfrage konnte nicht geöffnet werden",
        message: "Die aus Lightroom übergebene Artbezeichnung konnte nicht sicher geprüft werden.",
        detail: error.message,
      });
    }
  }
  deliverPendingCorrectionRequests();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    title: WINDOW_TITLE,
    icon: EXPLORER_WINDOW_ICON,
    backgroundColor: "#edf3f0",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
      preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
    },
  });
  mainWindow.setMenuBarVisibility(false);
  const removeSpellcheck = installGermanSpellcheck({ window: mainWindow, Menu, isAllowedUrl: isAllowedAppUrl });
  mainWindow.once("closed", removeSpellcheck);
  mainWindow.loadURL(START_PAGE);
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    if (pendingSecondInstanceActivation && activateExplorerWindow(mainWindow)) {
      pendingSecondInstanceActivation = false;
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedAppUrl(url)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAllowedAppUrl(url)) return;
    event.preventDefault();
    shell.openExternal(url);
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    if (validatedUrl === START_PAGE || errorCode === -3) return;
    showStartupError(new Error(`Fenster konnte ${validatedUrl} nicht laden: ${errorDescription}`));
  });
  mainWindow.on("close", handleWindowClose);
  return mainWindow;
}

function isAllowedAppUrl(url) {
  if (!managedServer?.baseUrl) return url === START_PAGE;
  try {
    const target = new URL(url);
    const appUrl = new URL(managedServer.baseUrl);
    return target.origin === appUrl.origin;
  } catch {
    return false;
  }
}

async function showStartupError(error) {
  const response = await dialog.showMessageBox(mainWindow, {
    type: "error",
    buttons: ["Neu starten", "Schließen"],
    defaultId: 0,
    cancelId: 1,
    title: "Arten-Explorer konnte nicht gestartet werden",
    message: "Der lokale Arten-Explorer-Server ist nicht erreichbar.",
    detail: error.message,
  });
  if (response.response === 0) {
    await restartServerAndLoad();
  } else {
    quitting = true;
    await stopManagedExplorerServer(managedServer);
    app.quit();
  }
}

async function restartServerAndLoad() {
  try {
    explorerPageReady = false;
    await stopManagedExplorerServer(managedServer).catch(() => {});
    managedServer = await startManagedExplorerServer({
      sharedProjectOptions: personalProjectProfile ? {
        filename: join(personalProjectProfile.directory, "project-cache.sqlite"), localStorageConfirmed: true,
        credentialStore: personalProjectProfile.credentials,
        mediaBudgetReader: createExplorerMediaBudgetReader({ profileRoot: personalProjectProfile.directory }),
        imageDecodeOptions: { repoRoot: fileURLToPath(new URL("../../", import.meta.url)) },
      } : null,
      sharedProjectImportOptions: personalProjectProfile ? createDesktopProjectImportOptions(personalProjectProfile.directory) : null,
      websiteAltSyncOptions: personalProjectProfile ? {
        filename: join(personalProjectProfile.directory, "website-alt-sync.sqlite"), localStorageConfirmed: true,
      } : null,
      pageAuthoringOptions: personalProjectProfile ? {
        filename: join(personalProjectProfile.directory, "page-authoring.sqlite"), localStorageConfirmed: true,
      } : null,
      localAiOptions: personalProjectProfile ? {
        cacheRoot: join(personalProjectProfile.directory, "local-ai"), deviceId: personalProjectProfile.device.id,
      } : null,
      deviceBackupProfile: personalProjectProfile ? {
        profileRoot: personalProjectProfile.directory, deviceId: personalProjectProfile.device.id,
      } : null,
      updateCompletionFactory: personalProjectProfile ? (serverContext) => createDesktopUpdateCompletionOwner({
        device: personalProjectProfile.device, stateRoot: join(personalProjectProfile.directory, "update-completion"), serverContext,
        getWindow: () => mainWindow, getBaseUrl: () => managedServer?.baseUrl,
        acquireDesktopClose() {
          if (quitting || closeCheckInProgress) throw new Error("Ein anderer Schließvorgang läuft bereits.");
          closeCheckInProgress = true;
          return () => { closeCheckInProgress = false; };
        },
        async finishExplorerExit() { quitting = true; mainWindow?.destroy(); app.quit(); },
        async restoreAfterFailure({ error, serverClosed }) {
          closeCheckInProgress = false;
          if (serverClosed) await restartServerAndLoad();
          await dialog.showMessageBox(mainWindow, { type: "warning", buttons: ["Zur App"],
            title: "Abschlussaktion angehalten", message: error.message,
            detail: "Der Ausgang wird nicht automatisch wiederholt. Bitte den gespeicherten Status prüfen." });
        },
        onError: () => {},
      }) : null,
      websiteAltTransferAdapterFactory: () =>
      createSquarespaceBrowserAdapter({ BrowserWindow, parentWindow: () => mainWindow,
        driver: createSquarespaceGalleryDriver() }) });
    await mainWindow.loadURL(managedServer.baseUrl);
    explorerPageReady = true;
    managedServer.server.startBackgroundFeatures();
    deliverPendingCorrectionRequests();
    if (managedServer.usedFallbackPort) {
      mainWindow.webContents.send?.("desktop-warning", "Port 4177 war belegt; die App nutzt einen freien Ersatzport.");
    }
  } catch (error) {
    await showStartupError(error);
  }
}

async function handleWindowClose(event) {
  if (quitting) return;
  event.preventDefault();
  if (closeCheckInProgress) return;
  closeCheckInProgress = true;
  try {
    let pipelineStatus = null;
    let backupStatus = null;
    let pendingChanges = null;
    let websiteTransfer = null;
    let uiDrafts = false;
    const unknownStatuses = [];
    if (managedServer?.baseUrl) {
      const results = await Promise.allSettled([
        getExplorerPipelineStatus(managedServer.baseUrl),
        getExplorerBackupStatus(managedServer.baseUrl),
        getExplorerPendingChanges(managedServer.baseUrl),
        getExplorerWebsiteAltTransferStatus(managedServer.baseUrl),
      ]);
      const checks = [
        { label: "Pipeline", valid: (value) =>
          ["idle", "running", "awaiting-review", "completed", "failed"].includes(value?.status) },
        { label: "Sicherungsstatus", valid: (value) =>
          ["idle", "running", "completed", "failed"].includes(value?.status) },
        { label: "Änderungsstatus", valid: (value) => typeof value?.hasPendingChanges === "boolean" },
        { label: "Website-Textübernahme", valid: (value) => typeof value?.running === "boolean" },
      ];
      const values = results.map((result, index) => {
        if (result.status === "fulfilled" && checks[index].valid(result.value)) return result.value;
        unknownStatuses.push(checks[index].label);
        return null;
      });
      [pipelineStatus, backupStatus, pendingChanges, websiteTransfer] = values;
    }
    if (mainWindow?.webContents) {
      const presentation = await readTrustedCompletionPresentation(mainWindow, managedServer?.baseUrl, {});
      if (!presentation.known) unknownStatuses.push("Offene Formulare");
      else uiDrafts = presentation.uiDrafts;
    }

    if (websiteTransfer?.running) {
      await dialog.showMessageBox(mainWindow, { type: "warning", buttons: ["App offen lassen"],
        title: "Website-Texte werden noch übertragen",
        message: "Bitte die laufende Squarespace-Übernahme und ihre öffentliche Nachprüfung abwarten." });
      return;
    }

    if (isPipelineBlockingShutdown(pipelineStatus) || isBackupBlockingShutdown(backupStatus)) {
      const backupRunning = isBackupBlockingShutdown(backupStatus);
      const response = await dialog.showMessageBox(mainWindow, {
        type: "warning",
        buttons: ["App offen lassen", "Trotzdem schließen"],
        defaultId: 0,
        cancelId: 0,
        title: backupRunning ? "Backup läuft noch" : "Pipeline läuft noch",
        message: backupRunning
          ? "Im Arten-Explorer läuft noch ein NAS-Backup."
          : "Im Arten-Explorer läuft noch ein Pipeline- oder Asset-Prüfschritt.",
        detail:
          "Wenn du jetzt schließt, wird nur der App-Server beendet. Prüfe vorher, ob der laufende Schritt abgeschlossen ist.",
      });
      if (response.response !== 1) return;
    }

    if (pendingChanges?.hasPendingChanges) {
      const response = await dialog.showMessageBox(mainWindow, {
        type: "warning",
        buttons: ["Zur App zurück", "Trotzdem schließen"],
        defaultId: 0,
        cancelId: 0,
        title: "Offene Änderungen",
        message: "Es gibt noch nicht übertragene Änderungen.",
        detail:
          "Gehe zur App zurück, wenn du die Änderungen jetzt übertragen willst. "
          + "Du kannst trotzdem schließen und die Übertragung beim nächsten Start nachholen.",
      });
      if (response.response !== 1) return;
    }

    if (uiDrafts) {
      const response = await dialog.showMessageBox(mainWindow, {
        type: "warning", buttons: ["Zur App zurück", "Eingaben verwerfen und schließen"], defaultId: 0, cancelId: 0,
        title: "Noch nicht gespeicherte Eingaben", message: "In einem Formular liegen noch Eingaben oder ein offener Bearbeitungsdialog vor.",
        detail: "Speichere die Eingaben vor dem Schließen. Gespeicherte lokale Entwürfe bleiben beim Neustart erhalten.",
      });
      if (response.response !== 1) return;
    }

    if (unknownStatuses.length) {
      const response = await dialog.showMessageBox(mainWindow, {
        type: "warning",
        buttons: ["App offen lassen", "Trotzdem schließen"],
        defaultId: 0,
        cancelId: 0,
        title: "Status nicht vollständig geprüft",
        message: "Der Arten-Explorer konnte nicht alle Statuswerte rechtzeitig lesen.",
        detail: `Nicht geprüft: ${unknownStatuses.join(", ")}. `
          + "Weitere Arbeit oder nicht übertragene Änderungen können noch offen sein. "
          + "Lass die App zur Kontrolle geöffnet. Mit „Trotzdem schließen“ wird der App-Server beendet.",
      });
      if (response.response !== 1) return;
    }

    quitting = true;
    await stopManagedExplorerServer(managedServer).catch((error) => {
      dialog.showErrorBox("Server konnte nicht sauber beendet werden", error.message);
    });
    mainWindow.destroy();
    app.quit();
  } finally {
    closeCheckInProgress = false;
  }
}

async function boot() {
  const directory = join(app.getPath("userData"), "personal-project");
  let profileWarning = "";
  try {
    personalProjectProfile = { directory, device: await loadLocalDeviceProfile(directory),
      credentials: createSharedProjectCredentialStore({ directory: join(directory, "credentials"), safeStorage }) };
  } catch {
    personalProjectProfile = null;
    profileWarning = "Das persönliche Geräteprofil konnte nicht geöffnet werden. Gemeinsames Projekt und Abschlussaktionen sind vorübergehend nicht verfügbar. Die vorhandenen lokalen Explorerfunktionen bleiben erreichbar.";
  }
  createWindow();
  const correctionRequests = queueCorrectionRequests(process.argv);
  await restartServerAndLoad();
  await correctionRequests;
  if (profileWarning) await dialog.showMessageBox(mainWindow, { type: "warning", buttons: ["Zur App"],
    title: "Persönliches Geräteprofil prüfen", message: profileWarning });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    void queueCorrectionRequests(commandLine);
    if (!activateExplorerWindow(mainWindow)) pendingSecondInstanceActivation = true;
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", () => {
    quitting = true;
  });
  app.whenReady().then(boot).catch((error) => showStartupError(error));
}
