import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readNasBackupArchives } from "./nas-backup-archives.mjs";
import { atomicWriteJson } from "./taxonomy-storage.mjs";

const MAX_BACKUP_ROOT_LENGTH = 500;
const MAX_BACKUPS = 3;
const RETENTION_POLICY = "two-newest-plus-oldest-verified-checkpoint";

function normalizeBackupRoot(value) {
  return String(value ?? "").trim();
}

function validateBackupRoot(value) {
  const backupRoot = normalizeBackupRoot(value);
  if (!backupRoot) {
    const error = new Error("Backup-Pfad darf nicht leer sein.");
    error.statusCode = 400;
    throw error;
  }
  if (backupRoot.length > MAX_BACKUP_ROOT_LENGTH) {
    const error = new Error(`Backup-Pfad darf maximal ${MAX_BACKUP_ROOT_LENGTH} Zeichen lang sein.`);
    error.statusCode = 400;
    throw error;
  }
  if (!/^[a-zA-Z]:[\\/]/.test(backupRoot) && !backupRoot.startsWith("\\\\")) {
    const error = new Error("Backup-Pfad muss ein absoluter Windows- oder UNC-Pfad sein.");
    error.statusCode = 400;
    error.details = ["Beispiele: W:\\Website Datenbank Backup oder \\\\NAS\\Website Datenbank Backup"];
    throw error;
  }
  return backupRoot;
}

function initialBackupState(backupRoot) {
  return {
    status: "idle",
    phase: "",
    backupRoot,
    archivePath: "",
    startedAt: "",
    completedAt: "",
    percent: 0,
    fileCount: 0,
    totalBytes: 0,
    retainedBackups: 0,
    removedBackups: 0,
    retainedCheckpoint: "",
    retainedArchivePaths: [],
    protectedArchives: [],
    rotationPlanRevision: "",
    retentionPolicy: RETENTION_POLICY,
    log: [],
    error: "",
    skipped: false,
    reason: "",
    includesDeviceProfiles: false,
    deviceProfile: null,
  };
}

export async function createBackupService({
  repoRoot,
  defaultBackupRoot,
  localSettingsPath,
  localSettingsFile,
  backupLogLineLimit,
  isPipelineActive,
  isAssetWriteActive,
  spawnProcess = spawn,
  readArchives = readNasBackupArchives,
  tempSession = null,
  deviceBackupProvider = null,
}) {
  let processHandle = null;
  let runPromise = null, previewPromise = null, operationController = null, closing = false;
  let settings = await loadExplorerSettings();
  let currentBackupRoot = normalizeBackupRoot(settings.nasBackupRoot) || defaultBackupRoot;
  let state = initialBackupState(currentBackupRoot);
  let archiveInventory = null;

  function listArchives() {
    if (archiveInventory) return archiveInventory;
    const backupRoot = validateBackupRoot(currentBackupRoot);
    archiveInventory = Promise.resolve().then(() => readArchives(backupRoot, { tempSession }))
      .finally(() => { archiveInventory = null; });
    return archiveInventory;
  }

  async function loadExplorerSettings() {
    try {
      const parsed = JSON.parse(await readFile(localSettingsPath, "utf8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  }

  async function writeExplorerSettings(nextSettings) {
    await atomicWriteJson(localSettingsPath, nextSettings);
  }

  function publicSettingsPayload() {
    return {
      backupRoot: currentBackupRoot,
      defaultBackupRoot,
      hasCustomBackupRoot: currentBackupRoot !== defaultBackupRoot,
      settingsFile: `species-explorer/${localSettingsFile}`,
      maxBackups: MAX_BACKUPS,
      retentionPolicy: RETENTION_POLICY,
      deviceProfilesConfigured: Boolean(deviceBackupProvider),
    };
  }

  function isBackupActive() {
    return Boolean(processHandle || runPromise || previewPromise || state.status === "running");
  }

  async function saveBackupSettings(payload = {}) {
    if (isBackupActive()) {
      const error = new Error("Während eines laufenden NAS-Backups kann der Backup-Pfad nicht geändert werden.");
      error.statusCode = 409;
      throw error;
    }
    const nextBackupRoot = payload.reset === true
      ? defaultBackupRoot
      : validateBackupRoot(payload.backupRoot);
    const nextSettings = { ...settings };
    if (nextBackupRoot === defaultBackupRoot) delete nextSettings.nasBackupRoot;
    else nextSettings.nasBackupRoot = nextBackupRoot;
    nextSettings.updatedAt = new Date().toISOString();
    await writeExplorerSettings(nextSettings);
    settings = nextSettings;
    currentBackupRoot = nextBackupRoot;
    state.backupRoot = currentBackupRoot;
    return publicSettingsPayload();
  }

  function powershellExecutable() {
    return process.platform === "win32" ? "powershell.exe" : "pwsh";
  }

  function nasBackupArgs({ dryRun = false, force = false, progress = false, snapshot = null } = {}) {
    const args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      join(repoRoot, "scripts", "nas-backup.ps1"),
      "-BackupRoot",
      currentBackupRoot,
      "-MaxBackups",
      String(MAX_BACKUPS),
    ];
    if (dryRun) args.push("-DryRun");
    if (force) args.push("-Force");
    if (progress) args.push("-Progress");
    if (deviceBackupProvider) args.push("-RequireDeviceSnapshot");
    if (snapshot) args.push("-DeviceSnapshotManifest", snapshot.manifestPath);
    return args;
  }

  function runCommandCapture(command, args, { track = false, signal } = {}) {
    return new Promise((resolveRun) => {
      signal?.throwIfAborted();
      const child = spawnProcess(command, args, {
        cwd: repoRoot,
        env: { ...process.env, IUCN_NAS_BACKUP_DIR: currentBackupRoot },
        windowsHide: true,
      });
      if (track) processHandle = child;
      const stdout = [];
      const stderr = [];
      let finished = false;
      const abort = () => { child.kill?.(); };
      signal?.addEventListener("abort", abort, { once: true });
      const finish = (result) => {
        if (finished) return; finished = true;
        signal?.removeEventListener("abort", abort);
        if (processHandle === child) processHandle = null;
        resolveRun(result);
      };
      child.stdout.on("data", (chunk) => stdout.push(chunk));
      child.stderr.on("data", (chunk) => { stderr.push(chunk); if (track) appendBackupProcessOutput(chunk.toString("utf8")); });
      child.on("error", (error) => { if (!child.pid) finish({ code: 1, stdout: "", stderr: error.message }); else stderr.push(Buffer.from(error.message)); });
      child.on("close", (code) => finish({
        code: Number.isInteger(code) ? code : 1,
        stdout: Buffer.concat(stdout).toString("utf8").trim(),
        stderr: Buffer.concat(stderr).toString("utf8").trim(),
      }));
    });
  }

  function parseJsonProcessOutput(output, fallbackMessage) {
    const raw = String(output ?? "").trim();
    if (!raw) throw new Error(fallbackMessage);
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`${fallbackMessage}: ${raw}`);
    }
  }

  function appendBackupLog(text) {
    const lines = String(text ?? "").split(/\r?\n/).filter((line) => line.length > 0);
    state.log.push(...lines);
    if (state.log.length > backupLogLineLimit) {
      state.log.splice(0, state.log.length - backupLogLineLimit);
    }
  }

  function appendBackupProcessOutput(text) {
    for (const line of String(text ?? "").split(/\r?\n/).filter(Boolean)) {
      if (line.startsWith("BACKUP_PROGRESS ")) {
        try {
          const progress = JSON.parse(line.slice("BACKUP_PROGRESS ".length));
          state.percent = Number(progress.percent ?? state.percent);
          state.phase = String(progress.message ?? state.phase);
          if (Number.isInteger(progress.fileCount)) state.fileCount = progress.fileCount;
          if (Number.isInteger(progress.processedFiles)) {
            appendBackupLog(`${progress.percent}% · ${progress.message} (${progress.processedFiles}/${progress.fileCount})`);
          } else {
            appendBackupLog(`${progress.percent}% · ${progress.message}`);
          }
          continue;
        } catch {
          // Unlesbare Fortschrittszeilen werden als normale Prozessausgabe angezeigt.
        }
      }
      appendBackupLog(line);
    }
  }

  async function previewNasBackup() {
    if (closing) throw new Error("Der Sicherungsdienst wird geschlossen.");
    if (isBackupActive()) {
      const error = new Error("Es läuft bereits ein NAS-Backup");
      error.statusCode = 409;
      throw error;
    }
    if (isPipelineActive() || isAssetWriteActive()) {
      const error = new Error("Während Pipeline- oder Asset-Schreibvorgängen kann kein Backup vorbereitet werden");
      error.statusCode = 409;
      throw error;
    }
    operationController = new AbortController();
    previewPromise = executePreview(operationController.signal).finally(() => { previewPromise = null; operationController = null; });
    return previewPromise;
  }

  async function withDeviceSnapshot(signal, action) {
    let snapshot = null;
    try {
      snapshot = deviceBackupProvider ? await deviceBackupProvider.prepare({ signal }) : null;
      if (deviceBackupProvider && !snapshot) throw new Error("Der eingerichtete persönliche Offlinebestand lieferte keinen Sicherungsnachweis.");
      signal.throwIfAborted();
      await snapshot?.assertSourcesUnchanged();
      const result = await action(snapshot);
      signal.throwIfAborted();
      await snapshot?.assertSourcesUnchanged();
      return result;
    } finally { await snapshot?.dispose(); }
  }

  function checkDeviceResult(parsed, snapshot) {
    if (snapshot && (parsed.includesDeviceProfiles !== true || parsed.deviceSnapshotStateHash !== snapshot.summary.stateHash || parsed.devicePending !== snapshot.summary.pending)) {
      throw new Error("Die NAS-Sicherung bestätigt den persönlichen Offlinebestand nicht vollständig.");
    }
  }

  async function executePreview(signal) {
    return withDeviceSnapshot(signal, async (snapshot) => {
      const result = await runCommandCapture(powershellExecutable(), nasBackupArgs({ dryRun: true, snapshot }), { signal });
      if (result.code !== 0) {
        const error = new Error(result.stderr || result.stdout || "Backup-Vorschau fehlgeschlagen");
        error.statusCode = 500;
        throw error;
      }
      const parsed = parseJsonProcessOutput(result.stdout, "Backup-Vorschau lieferte keine gültige Antwort");
      checkDeviceResult(parsed, snapshot);
      return {
        mode: "nas-backup",
        backupRoot: parsed.backupRoot || currentBackupRoot,
        skipped: Boolean(parsed.skipped),
        reason: parsed.reason || "",
        archivePath: parsed.archivePath || parsed.latestBackup || "",
        fileCount: Number(parsed.fileCount ?? 0),
        totalBytes: Number(parsed.totalBytes ?? 0),
        gitCommit: parsed.gitCommit || "",
        workingTreeDirty: Boolean(parsed.workingTreeDirty),
        retentionWouldRemove: Number(parsed.retentionWouldRemove ?? 0),
        retainedCheckpoint: parsed.retainedCheckpoint || "",
        retainedArchivePaths: parsed.retainedArchivePaths || [],
        protectedArchives: parsed.protectedArchives || [],
        rotationPlanRevision: parsed.rotationPlanRevision || "",
        retentionPolicy: parsed.retentionPolicy || RETENTION_POLICY,
        deviceProfile: snapshot?.summary ?? null,
        includesDeviceProfiles: Boolean(snapshot),
        warnings: [
          "Das Backup wird als ZIP auf dem NAS gespeichert und enthält Projektdateien, Git-Stand, den gemeinsamen Datenordner, node_modules und lokale Werkzeuge.",
          "Temporäre Test-, Staging-, Pipeline-Asset-Backup- und Logdateien werden nicht gesichert.",
          "Die Rotation behält zwei jüngere geprüfte Sicherungen und einen älteren geschützten Kontrollstand. Erst nach Prüfung der neuen Sicherung werden entbehrliche geprüfte Archive entfernt.",
          "Nicht prüfbare oder unbekannte Altarchive bleiben zusätzlich geschützt; sie werden nicht allein wegen der Anzahl gelöscht.",
          snapshot ? "Die ausdrücklich eingerichteten persönlichen Gerätedaten und offenen Offlineänderungen werden mitgesichert. Anmeldedaten bleiben ausgeschlossen; eine Wiederherstellung wird zuerst als getrennte Kopie geprüft."
            : "Persönliche Gerätedaten außerhalb des Projektordners sind in diesem Aufruf nicht eingerichtet und nicht enthalten.",
        ],
      };
    });
  }

  function startNasBackup(payload = {}) {
    if (closing) throw new Error("Der Sicherungsdienst wird geschlossen.");
    if (isBackupActive()) {
      const error = new Error("Es läuft bereits ein NAS-Backup");
      error.statusCode = 409;
      throw error;
    }
    if (isPipelineActive() || isAssetWriteActive()) {
      const error = new Error("Während Pipeline- oder Asset-Schreibvorgängen kann kein Backup gestartet werden");
      error.statusCode = 409;
      throw error;
    }

    const force = payload?.force === true;
    state = {
      ...initialBackupState(currentBackupRoot),
      status: "running",
      phase: "Backup wird vorbereitet",
      startedAt: new Date().toISOString(),
    };
    appendBackupLog(force ? "NAS-Backup wird erzwungen gestartet." : "NAS-Backup wird gestartet.");
    operationController = new AbortController();
    runPromise = executeNasBackupRun(force, operationController.signal).catch((error) => {
      state.status = "failed";
      state.completedAt = new Date().toISOString();
      state.error = error.message;
      state.phase = "Backup fehlgeschlagen";
      appendBackupLog(`Unerwarteter Backupfehler: ${error.message}`);
    }).finally(() => { runPromise = null; operationController = null; });
    return state;
  }

  async function executeNasBackupRun(force, signal) {
    const { result, deviceProfile } = await withDeviceSnapshot(signal, async (snapshot) => {
      if (isPipelineActive() || isAssetWriteActive()) throw new Error("Während der Vorbereitung hat ein anderer Schreibvorgang begonnen.");
      const captured = await runCommandCapture(powershellExecutable(), nasBackupArgs({ force, progress: true, snapshot }), { track: true, signal });
      if (captured.code !== 0) throw new Error(captured.stderr || captured.stdout || `Backup wurde mit Code ${captured.code} beendet`);
      const result = parseJsonProcessOutput(captured.stdout, "Backup-Lauf lieferte keine gültige Antwort");
      checkDeviceResult(result, snapshot);
      return { result, deviceProfile: snapshot?.summary ?? null };
    });
    state.completedAt = new Date().toISOString();
    state.status = "completed";
    state.deviceProfile = deviceProfile;
    state.includesDeviceProfiles = Boolean(deviceProfile);
    state.skipped = Boolean(result.skipped);
    state.reason = result.reason || "";
    state.archivePath = result.archivePath || result.latestBackup || "";
    state.backupRoot = result.backupRoot || currentBackupRoot;
    state.fileCount = Number(result.fileCount ?? state.fileCount);
    state.totalBytes = Number(result.totalBytes ?? state.totalBytes);
    state.retainedBackups = Number(result.retainedBackups ?? 0);
    state.removedBackups = Number(result.removedBackups ?? 0);
    state.retainedCheckpoint = result.retainedCheckpoint || "";
    state.retainedArchivePaths = result.retainedArchivePaths || [];
    state.protectedArchives = result.protectedArchives || [];
    state.rotationPlanRevision = result.rotationPlanRevision || "";
    state.percent = 100;
    state.phase = state.skipped ? "Kein neues Backup erforderlich" : "Backup abgeschlossen";
    appendBackupLog(state.skipped ? state.reason || "Seit dem letzten Backup wurden keine Änderungen erkannt." : `Backup erstellt: ${state.archivePath}`);
  }

  async function close() {
    closing = true;
    operationController?.abort(new Error("Sicherung wegen Programmschließung abgebrochen."));
    await Promise.allSettled([runPromise, previewPromise].filter(Boolean));
  }

  return {
    publicSettingsPayload,
    saveBackupSettings,
    previewNasBackup,
    startNasBackup,
    isBackupActive,
    getState: () => state,
    listArchives,
    close,
  };
}
