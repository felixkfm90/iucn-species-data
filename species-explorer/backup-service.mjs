import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MAX_BACKUP_ROOT_LENGTH = 500;
const MAX_BACKUPS = 10;

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
    log: [],
    error: "",
    skipped: false,
    reason: "",
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
}) {
  let processHandle = null;
  let settings = await loadExplorerSettings();
  let currentBackupRoot = normalizeBackupRoot(settings.nasBackupRoot) || defaultBackupRoot;
  let state = initialBackupState(currentBackupRoot);

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
    await mkdir(join(repoRoot, "species-explorer"), { recursive: true });
    await writeFile(localSettingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, "utf8");
  }

  function publicSettingsPayload() {
    return {
      backupRoot: currentBackupRoot,
      defaultBackupRoot,
      hasCustomBackupRoot: currentBackupRoot !== defaultBackupRoot,
      settingsFile: `species-explorer/${localSettingsFile}`,
      maxBackups: MAX_BACKUPS,
    };
  }

  function isBackupActive() {
    return Boolean(processHandle || state.status === "running");
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

  function nasBackupArgs({ dryRun = false, force = false, progress = false } = {}) {
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
    return args;
  }

  function runCommandCapture(command, args) {
    return new Promise((resolveRun) => {
      const child = spawn(command, args, {
        cwd: repoRoot,
        env: process.env,
        windowsHide: true,
      });
      const stdout = [];
      const stderr = [];
      child.stdout.on("data", (chunk) => stdout.push(chunk));
      child.stderr.on("data", (chunk) => stderr.push(chunk));
      child.on("error", (error) => resolveRun({ code: 1, stdout: "", stderr: error.message }));
      child.on("close", (code) => resolveRun({
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
    const result = await runCommandCapture(powershellExecutable(), nasBackupArgs({ dryRun: true }));
    if (result.code !== 0) {
      const error = new Error(result.stderr || result.stdout || "Backup-Vorschau fehlgeschlagen");
      error.statusCode = 500;
      throw error;
    }
    const parsed = parseJsonProcessOutput(result.stdout, "Backup-Vorschau lieferte keine gültige Antwort");
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
      warnings: [
        "Das Backup wird als ZIP auf dem NAS gespeichert und enthält Projektdateien, Git-Stand, node_modules und lokale Werkzeuge.",
        "Temporäre Test-, Staging-, Pipeline-Asset-Backup- und Logdateien werden nicht gesichert.",
        "Es bleiben maximal zehn NAS-Backups erhalten; ältere IUCN_Datenbank_*.zip-Dateien werden nach erfolgreichem Lauf entfernt.",
      ],
    };
  }

  function startNasBackup(payload = {}) {
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
    void executeNasBackupRun(force).catch((error) => {
      state.status = "failed";
      state.completedAt = new Date().toISOString();
      state.error = error.message;
      state.phase = "Backup fehlgeschlagen";
      appendBackupLog(`Unerwarteter Backupfehler: ${error.message}`);
    });
    return state;
  }

  function executeNasBackupRun(force) {
    return new Promise((resolveRun) => {
      let stdoutBuffer = "";
      const child = spawn(powershellExecutable(), nasBackupArgs({ force, progress: true }), {
        cwd: repoRoot,
        env: { ...process.env, IUCN_NAS_BACKUP_DIR: currentBackupRoot },
        windowsHide: true,
      });
      processHandle = child;
      child.stdout.on("data", (chunk) => { stdoutBuffer += chunk.toString("utf8"); });
      child.stderr.on("data", (chunk) => appendBackupProcessOutput(chunk.toString("utf8")));
      child.on("error", (error) => {
        processHandle = null;
        state.status = "failed";
        state.completedAt = new Date().toISOString();
        state.error = error.message;
        state.phase = "Backup fehlgeschlagen";
        appendBackupLog(`Prozessfehler: ${error.message}`);
        resolveRun();
      });
      child.on("close", (code) => {
        processHandle = null;
        state.completedAt = new Date().toISOString();
        if (code === 0) {
          try {
            const result = parseJsonProcessOutput(stdoutBuffer, "Backup-Lauf lieferte keine gültige Antwort");
            state.status = "completed";
            state.skipped = Boolean(result.skipped);
            state.reason = result.reason || "";
            state.archivePath = result.archivePath || result.latestBackup || "";
            state.backupRoot = result.backupRoot || currentBackupRoot;
            state.fileCount = Number(result.fileCount ?? state.fileCount);
            state.totalBytes = Number(result.totalBytes ?? state.totalBytes);
            state.retainedBackups = Number(result.retainedBackups ?? 0);
            state.removedBackups = Number(result.removedBackups ?? 0);
            state.percent = 100;
            state.phase = state.skipped ? "Kein neues Backup erforderlich" : "Backup abgeschlossen";
            appendBackupLog(
              state.skipped
                ? state.reason || "Seit dem letzten Backup wurden keine Änderungen erkannt."
                : `Backup erstellt: ${state.archivePath}`,
            );
          } catch (error) {
            state.status = "failed";
            state.error = error.message;
            state.phase = "Backup fehlgeschlagen";
            appendBackupLog(error.message);
          }
        } else {
          state.status = "failed";
          state.error = stdoutBuffer.trim() || `Backup wurde mit Code ${code} beendet`;
          state.phase = "Backup fehlgeschlagen";
          appendBackupLog(state.error);
        }
        resolveRun();
      });
    });
  }

  return {
    publicSettingsPayload,
    saveBackupSettings,
    previewNasBackup,
    startNasBackup,
    isBackupActive,
    getState: () => state,
  };
}
