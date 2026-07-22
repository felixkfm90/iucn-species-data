import { app, BrowserWindow, dialog, shell } from "electron";
import {
  getExplorerBackupStatus,
  getExplorerPendingChanges,
  getExplorerPipelineStatus,
  isBackupBlockingShutdown,
  isPipelineBlockingShutdown,
  startManagedExplorerServer,
  stopManagedExplorerServer,
} from "./server-lifecycle.mjs";
import { activateExplorerWindow } from "./window-activation.mjs";

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
let pendingSecondInstanceActivation = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    title: WINDOW_TITLE,
    backgroundColor: "#edf3f0",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);
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
    await stopManagedExplorerServer(managedServer).catch(() => {});
    app.quit();
  }
}

async function restartServerAndLoad() {
  try {
    await stopManagedExplorerServer(managedServer).catch(() => {});
    managedServer = await startManagedExplorerServer();
    await mainWindow.loadURL(managedServer.baseUrl);
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

  let pipelineStatus = null;
  let backupStatus = null;
  let pendingChanges = null;
  try {
    if (managedServer?.baseUrl) {
      [pipelineStatus, backupStatus, pendingChanges] = await Promise.all([
        getExplorerPipelineStatus(managedServer.baseUrl),
        getExplorerBackupStatus(managedServer.baseUrl),
        getExplorerPendingChanges(managedServer.baseUrl),
      ]);
    }
  } catch {
    pipelineStatus = null;
    backupStatus = null;
    pendingChanges = null;
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

  quitting = true;
  await stopManagedExplorerServer(managedServer).catch((error) => {
    dialog.showErrorBox("Server konnte nicht sauber beendet werden", error.message);
  });
  mainWindow.destroy();
  app.quit();
}

async function boot() {
  createWindow();
  await restartServerAndLoad();
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
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
