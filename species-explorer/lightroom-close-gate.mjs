import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import { catalogUsageStatus } from "./lightroom-catalog-usage.mjs";

const execute = promisify(execFile);
const probeScript = "$ErrorActionPreference='Stop'; @(Get-Process -Name Lightroom -ErrorAction SilentlyContinue | ForEach-Object { [pscustomobject]@{ id=$_.Id; path=$_.Path; window=[string]$_.MainWindowHandle } }) | ConvertTo-Json -Compress";
const closeScript = "$ErrorActionPreference='Stop'; $expected=ConvertFrom-Json $env:FN_LIGHTROOM_CLOSE_TARGETS; foreach($target in $expected) { $process=Get-Process -Id $target.id -ErrorAction SilentlyContinue; if($null -eq $process) { continue }; if($process.ProcessName -ne 'Lightroom' -or $process.Path -cne $target.path) { throw 'Lightroom-Prozess hat sich verändert' }; if(-not $process.CloseMainWindow()) { throw 'Normales Schließen konnte nicht angefordert werden. Bitte Lightroom selbst schließen.' } }";

async function windowsProcesses() {
  if (process.platform !== "win32") throw new Error("Der Lightroom-Prozessstand kann auf diesem System nicht sicher geprüft werden.");
  const { stdout } = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", probeScript],
    { windowsHide: true, timeout: 10000, maxBuffer: 128 * 1024 });
  const parsed = stdout.trim() ? JSON.parse(stdout) : [];
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  if (entries.some((entry) => !Number.isSafeInteger(entry.id) || entry.id < 1
    || typeof entry.path !== "string" || !/[\\/]Lightroom\.exe$/i.test(entry.path))) {
    throw new Error("Der Lightroom-Prozess konnte nicht eindeutig geprüft werden.");
  }
  return entries;
}

async function requestNormalClose(targets) {
  await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", closeScript], {
    windowsHide: true, timeout: 10000, maxBuffer: 128 * 1024,
    env: { ...process.env, FN_LIGHTROOM_CLOSE_TARGETS: JSON.stringify(targets) },
  });
}

// Poll only process presence, existing receipt and file metadata. Never open
// catalog SQLite, scan photos, hash a catalog repeatedly or remove lock files.
export function createLightroomCloseGate({ taxonomyRoot, processes = windowsProcesses, closeProcesses = requestNormalClose,
  usage = (options) => catalogUsageStatus(taxonomyRoot, options), stat = fs.stat, usageRequests = null } = {}) {
  let failedProofRevision = "";
  async function inspect() {
    const entries = await processes();
    const proof = await usage({ full: false });
    let workingFiles = false;
    for (const catalog of proof.catalogs || []) {
      for (const suffix of [".lock", "-wal", "-shm", "-journal"]) {
        try { await stat(catalog.catalogPath + suffix); workingFiles = true; }
        catch (error) { if (error.code !== "ENOENT") throw error; }
      }
    }
    return { open: entries.length > 0 || workingFiles, processes: entries,
      usageReady: proof.ready === true, usageReason: proof.reason || "", usageRevision: proof.revision || "" };
  }
  return {
    async status({ updateRunId = "" } = {}) {
      const value = await inspect();
      const capture = usageRequests && updateRunId ? await usageRequests.status(updateRunId) : null;
      return { ...value, canRequestClose: value.processes.length > 0,
        capturePending: capture?.exists === true && !capture.ready,
        capturedCatalogCount: capture?.capturedCatalogCount || 0,
        message: value.open ? "Für die Datenbankaktualisierung muss Lightroom geschlossen werden. Der gespeicherte Startauftrag wartet."
          : !value.usageReady ? "Lightroom ist geschlossen. Ein aktueller vollständiger FN-Nutzungsnachweis fehlt; keine automatische Freigabe."
            : "Lightroom ist geschlossen und der FN-Nutzungsnachweis ist aktuell." };
    },
    async ready({ job = null } = {}) {
      const value = await inspect();
      if (usageRequests && job?.updateRunId) {
        let capture = await usageRequests.status(job.updateRunId);
        if (!capture.exists && !value.usageReady && job.phase === "start") {
          await usageRequests.prepare(job);
          capture = await usageRequests.status(job.updateRunId);
        }
        if (capture.exists && capture.request.status !== "completed") {
          if (capture.request.captureError) throw new Error(`Neue FN-Erfassung fehlgeschlagen: ${capture.request.captureError}. Bitte den gespeicherten Auftrag gezielt fortsetzen.`);
          if (!capture.ready) return { ready: false, reason: value.open ? "lightroom-open" : "catalog-usage",
            message: value.open ? "Warte auf die neue FN-Erfassung durch das Lightroom-Plug-in. Danach Lightroom normal schließen."
              : "Lightroom wurde vor der neuen FN-Erfassung geschlossen. Bitte mit dem neuen Plug-in öffnen; der Startauftrag bleibt gespeichert." };
          if (value.open) {
            if (value.processes.length && await usageRequests.claimNormalClose(job.updateRunId)) await closeProcesses(value.processes);
            return { ready: false, reason: "lightroom-open", message: "FN-Nutzung frisch erfasst. Warte auf normal geschlossenes Lightroom." };
          }
          await usageRequests.bindClosed(job.updateRunId);
          failedProofRevision = "";
          const proof = await usage({ full: false });
          const after = await inspect();
          const ready = proof.ready === true && !after.open && after.usageReady;
          return { ready, usageRevision: proof.revision || "", reason: ready ? "" : after.open ? "lightroom-open" : "catalog-usage",
            message: ready ? "" : "Die neue FN-Erfassung ist nach dem Schließen nicht mehr aktuell oder Lightroom wieder geöffnet." };
        }
      }
      if (value.open) return { ready: false, reason: "lightroom-open", message: "Warte auf geschlossenes Lightroom." };
      if (!value.usageReady) return { ready: false, reason: "catalog-usage", message: "Aktueller FN-Nutzungsnachweis erforderlich." };
      if (failedProofRevision && failedProofRevision === value.usageRevision) {
        return { ready: false, reason: "catalog-usage", message: "Der FN-Nutzungsnachweis hat die Vollprüfung nicht bestanden. Erneute Erfassung erforderlich." };
      }
      // One complete checksum at the phase boundary, not on every poll.
      const proof = await usage({ full: true });
      failedProofRevision = proof.ready ? "" : value.usageRevision;
      return { ready: proof.ready === true, usageRevision: proof.revision || "", reason: proof.ready ? "" : "catalog-usage",
        message: proof.ready ? "" : "Der FN-Nutzungsnachweis ist nicht mehr aktuell." };
    },
    async requestClose({ confirmed = false, updateRunId = "" } = {}) {
      if (confirmed !== true) throw new Error("Das normale Schließen von Lightroom muss ausdrücklich bestätigt werden.");
      const value = await inspect();
      if (usageRequests && updateRunId) {
        const queued = await usageRequests.queueNormalClose(updateRunId);
        if (queued.queued) return { requested: false, queued: true, forced: false, ...await this.status({ updateRunId }) };
        const capture = await usageRequests.status(updateRunId);
        if (capture.exists && capture.request.status !== "completed") throw new Error("Die neue FN-Erfassung ist angehalten. Keine vorzeitige Schließanforderung; bitte den Updateauftrag prüfen.");
      }
      if (value.processes.length) await closeProcesses(value.processes);
      return { requested: value.processes.length > 0, forced: false, ...await this.status() };
    },
  };
}
