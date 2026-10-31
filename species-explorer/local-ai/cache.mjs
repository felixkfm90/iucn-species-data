import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { aiError, childPath, clone, noLinks, readJson, sha256, verifyFile, writeJson } from "./files.mjs";
import { extractPinnedRuntime } from "./zip.mjs";

export const DEFAULT_LOCAL_AI_LOCK = JSON.parse(await fs.readFile(new URL("./model-lock.json", import.meta.url), "utf8"));
const allowedSource = (value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password
    && ["github.com", "raw.githubusercontent.com", "huggingface.co", "www.apache.org"].includes(url.hostname);
};
const allowedRedirect = (value) => {
  const url = new URL(value);
  return allowedSource(value) || url.protocol === "https:" && !url.username && !url.password
    && (url.hostname.endsWith(".githubusercontent.com") || url.hostname.endsWith(".huggingface.co") || url.hostname.endsWith(".hf.co"));
};
const INSTALL_ERRORS = Object.freeze({
  LOCAL_AI_HTTP_ERROR: "Der Anbieter hat die benötigte KI-Datei nicht geliefert. Bitte Verbindung und Downloadstatus prüfen.",
  LOCAL_AI_NETWORK_ERROR: "Die Verbindung zur KI-Dateiquelle ist fehlgeschlagen. Bitte die Internetverbindung prüfen.",
  LOCAL_AI_SOURCE_BLOCKED: "Die KI-Dateiquelle oder ihre Weiterleitung gehört nicht zu den freigegebenen Bezugswegen.",
  LOCAL_AI_SIZE_MISMATCH: "Die übertragene KI-Dateigröße passt nicht zur freigegebenen Datei.",
  LOCAL_AI_SIZE_EXCEEDED: "Die übertragene KI-Datei überschreitet ihre freigegebene Größe.",
  LOCAL_AI_HASH_MISMATCH: "Eine KI-Datei stimmt nicht mit dem freigegebenen Original überein.",
  LOCAL_AI_DOWNLOAD_FAILED: "Die KI-Datei konnte nicht vollständig übertragen oder entpackt werden.",
  LOCAL_AI_IMPORT_FAILED: "Die bestätigte lokale KI-Quelle konnte nicht vollständig übernommen werden.",
  LOCAL_AI_ARCHIVE_INVALID: "Das KI-Laufzeitarchiv ist unvollständig, verändert oder besitzt eine nicht unterstützte Struktur.",
  LOCAL_AI_EXISTING_CACHE_INVALID: "Der vorhandene KI-Bestand ist unvollständig oder gehört zu einer anderen Dateibindung. Er wurde nicht überschrieben.",
  LOCAL_AI_INSTALL_LOCKED: "Eine weitere KI-Einrichtung läuft oder ihr Abschluss ist ungeklärt. Ihr Bestand bleibt erhalten.",
  LOCAL_AI_NO_SPACE: "Für die optionale lokale KI ist nicht genügend freier Speicher vorhanden.",
  LOCAL_AI_CACHE_ACCESS: "Die private KI-Ablage konnte nicht gelesen oder beschrieben werden. Vorhandene Bestände bleiben erhalten.",
  LOCAL_AI_FINALIZE_FAILED: "Die geprüfte KI-Einrichtung konnte nicht abschließend gespeichert werden.",
  LOCAL_AI_CLEANUP_BLOCKED: "Der Abschluss der eigenen KI-Einrichtung ist blockiert. Verbliebene eigene Arbeitsdateien müssen gezielt geprüft werden.",
  LOCAL_AI_INSTALL_FAILED: "Die lokale KI-Einrichtung ist fehlgeschlagen; vorhandene Bestände blieben erhalten.",
  LOCAL_AI_CANCELLED: "KI-Einrichtung abgebrochen.",
  LOCAL_AI_TIMEOUT: "Das Zeitlimit der KI-Einrichtung wurde erreicht. Es wurde keine Einrichtung freigegeben.",
});
function safeArtifactId(pin, index = 0) {
  const id = pin.id || path.posix.basename(pin.relative || "");
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(id) && !/token|secret|password|credential|authorization|bearer|^(?:sk-|hf_)/i.test(id)
    ? id : `artifact-${index + 1}`;
}
function installFailure(error, step, signal) {
  const phases = { download: "LOCAL_AI_DOWNLOAD_FAILED", "local-import": "LOCAL_AI_IMPORT_FAILED", "extract-runtime": "LOCAL_AI_ARCHIVE_INVALID",
    "verify-existing": "LOCAL_AI_EXISTING_CACHE_INVALID", finalize: "LOCAL_AI_FINALIZE_FAILED", cleanup: "LOCAL_AI_CLEANUP_BLOCKED" };
  const code = error?.code === "LOCAL_AI_CLEANUP_BLOCKED" ? "LOCAL_AI_CLEANUP_BLOCKED"
    : signal.aborted ? signal.reason?.name === "TimeoutError" ? "LOCAL_AI_TIMEOUT" : "LOCAL_AI_CANCELLED"
    : Object.hasOwn(INSTALL_ERRORS, error?.code) ? error.code : error?.code === "ENOSPC" ? "LOCAL_AI_NO_SPACE"
      : ["EACCES", "EPERM"].includes(error?.code) ? "LOCAL_AI_CACHE_ACCESS" : phases[step.phase] || "LOCAL_AI_INSTALL_FAILED";
  return { message: INSTALL_ERRORS[code], details: { code, phase: step.phase, artifactId: step.artifactId,
    ...(code === "LOCAL_AI_HTTP_ERROR" && Number.isInteger(error.httpStatus) && error.httpStatus >= 100 && error.httpStatus <= 599 ? { httpStatus: error.httpStatus } : {}) } };
}

function validateLock(lock, testSources) {
  if (lock?.schemaVersion !== 1 || !/^[a-z0-9._-]{1,120}$/.test(lock.bundleId || "") || !Array.isArray(lock.artifacts)
    || !lock.artifacts.length || !Array.isArray(lock.runtimeFiles) || !lock.runtimeFiles.length) throw new TypeError("Eine vollständige gepinnte lokale KI-Dateiliste ist erforderlich.");
  const names = new Set();
  for (const item of [...lock.artifacts, ...lock.runtimeFiles]) {
    const relative = item.relative;
    childPath("/private-cache", relative);
    if (!Number.isSafeInteger(item.bytes) || item.bytes < 0 || !/^[a-f0-9]{64}$/.test(item.sha256 || "")) throw new TypeError("Ungültige KI-Dateibindung.");
    const key = `${item.url ? "artifact" : "runtime"}:${relative.toLowerCase()}`;
    if (names.has(key)) throw new TypeError("Doppelte KI-Dateibindung."); names.add(key);
  }
  for (const item of lock.artifacts) if (!testSources && !allowedSource(item.url)) throw new TypeError("KI-Dateien benötigen gepinnte offizielle Bezugsquellen.");
  if (lock.artifacts.filter((item) => item.kind === "runtime-archive").length !== 1 || !lock.artifacts.some((item) => item.kind === "license")) throw new TypeError("KI-Laufzeitarchiv und Lizenzbeilagen sind erforderlich.");
}

export function createLocalAiCache({ cacheRoot, lock = DEFAULT_LOCAL_AI_LOCK, fetchImpl = globalThis.fetch,
  isWorkerBusy = () => false, allowTestSources = false, downloadTimeoutMs = 30 * 60_000 } = {}) {
  if (!path.isAbsolute(cacheRoot || "") || /^[/\\]{2}/.test(cacheRoot) || path.parse(cacheRoot).root === path.resolve(cacheRoot)) throw new TypeError("Eine ausdrückliche private lokale Geräteablage ist erforderlich.");
  lock = clone(lock); validateLock(lock, allowTestSources);
  const root = path.resolve(cacheRoot), bundle = childPath(root, `bundles/${lock.bundleId}`), lockDigest = sha256(Buffer.from(JSON.stringify(lock)));
  let active = null, controller = null, closed = false;
  let state = { status: "not-installed", bundleId: lock.bundleId, optional: true, downloadedBytes: 0, totalBytes: lock.artifacts.reduce((sum, item) => sum + item.bytes, 0), error: "", errorDetails: null };
  async function verifyInstalled({ signal, onArtifact = () => {} } = {}) {
    const record = await readJson(path.join(bundle, "installed.json"));
    if (!record) return null;
    if (record.schemaVersion !== 1 || record.bundleId !== lock.bundleId || record.lockDigest !== lockDigest) throw aiError("Der vorhandene KI-Bestand gehört zu einer anderen Dateibindung.");
    for (const item of lock.artifacts.filter((entry) => entry.kind !== "runtime-archive")) { onArtifact(item); await verifyFile(childPath(bundle, item.relative), item, { signal }); }
    for (const item of lock.runtimeFiles) { onArtifact(item); await verifyFile(childPath(bundle, `runtime/${item.relative}`), item, { signal }); }
    const expectedRuntime = new Set(lock.runtimeFiles.map((item) => item.relative));
    let runtimeCount = 0;
    async function scan(current) {
      for (const item of await fs.readdir(current, { withFileTypes: true })) {
        const absolute = path.join(current, item.name);
        if (item.isSymbolicLink()) throw aiError("Veränderte KI-Laufzeitstruktur.");
        if (item.isDirectory()) await scan(absolute);
        else if (item.isFile()) {
          runtimeCount += 1;
          if (!expectedRuntime.has(path.relative(path.join(bundle, "runtime"), absolute).split(path.sep).join("/"))) throw aiError("Ungebundene zusätzliche KI-Laufzeitdatei.");
        } else throw aiError("Ungültige KI-Laufzeitstruktur.");
      }
    }
    await scan(path.join(bundle, "runtime"));
    if (runtimeCount !== lock.runtimeFiles.length) throw aiError("Die KI-Laufzeit ist nicht vollständig.");
    return record;
  }
  async function fetchPinned(pin, target, signal, onProgress) {
    let url = pin.url, response;
    for (let redirect = 0; redirect <= 5; redirect += 1) {
      if (!allowTestSources && !(redirect ? allowedRedirect(url) : allowedSource(url))) throw aiError("Unzulässiger KI-Bezugsweg.", "LOCAL_AI_SOURCE_BLOCKED");
      try { response = await fetchImpl(url, { redirect: "manual", signal, headers: { Accept: "application/octet-stream" } }); }
      catch { signal.throwIfAborted(); throw aiError("Die KI-Dateiquelle ist nicht erreichbar.", "LOCAL_AI_NETWORK_ERROR"); }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location"); await response.body?.cancel?.();
        if (!location || redirect === 5) throw aiError("Unzulässige KI-Downloadweiterleitung.", "LOCAL_AI_SOURCE_BLOCKED");
        url = new URL(location, url).href; continue;
      }
      break;
    }
    if (!response?.ok || !response.body) {
      await response?.body?.cancel?.().catch(() => {});
      throw Object.assign(aiError("Die optionale KI-Datei konnte nicht geladen werden.", "LOCAL_AI_HTTP_ERROR"), { httpStatus: response?.status });
    }
    const advertised = response.headers.get("content-length");
    const encoding = String(response.headers.get("content-encoding") || "identity").trim().toLowerCase();
    // fetch decodes transport compression but preserves the compressed Content-Length header.
    // The streamed decoded-byte cap, exact file size and SHA remain mandatory below.
    if (advertised && (encoding === "identity" || !encoding)
        && (!/^\d+$/.test(advertised) || Number(advertised) !== pin.bytes)) {
      await response.body.cancel().catch(() => {});
      throw aiError("Die angekündigte KI-Dateigröße passt nicht zur Bindung.", "LOCAL_AI_SIZE_MISMATCH");
    }
    let bytes = 0;
    async function* limited(chunks) {
      for await (const chunk of chunks) {
        signal.throwIfAborted(); bytes += chunk.length;
        if (bytes > pin.bytes) throw aiError("Eine KI-Datei überschreitet ihre gebundene Größe.", "LOCAL_AI_SIZE_EXCEEDED");
        state.downloadedBytes += chunk.length;
        onProgress?.({ artifactId: safeArtifactId(pin), artifactBytes: bytes, artifactTotalBytes: pin.bytes, downloadedBytes: state.downloadedBytes, totalBytes: state.totalBytes });
        yield chunk;
      }
    }
    await pipeline(Readable.fromWeb(response.body, { signal }), limited, createWriteStream(target, { flags: "wx" }), { signal });
    if (bytes !== pin.bytes) throw aiError("Die übertragene KI-Dateigröße passt nicht zur Bindung.", "LOCAL_AI_SIZE_MISMATCH");
    await verifyFile(target, pin, { signal });
  }
  async function copyPinned(source, pin, target, signal, onProgress) {
    await noLinks(source);
    const before = await fs.stat(source);
    if (!before.isFile() || before.size !== pin.bytes) throw aiError("Die bestätigte lokale KI-Quelldatei fehlt oder ist verändert.");
    let copied = 0;
    async function* tracked(chunks) {
      for await (const chunk of chunks) {
        signal.throwIfAborted(); copied += chunk.length;
        if (copied > pin.bytes) throw aiError("Die lokale KI-Quelle wurde während des Imports verändert.");
        state.downloadedBytes += chunk.length;
        onProgress?.({ artifactId: safeArtifactId(pin), artifactBytes: copied, artifactTotalBytes: pin.bytes, downloadedBytes: state.downloadedBytes, totalBytes: state.totalBytes });
        yield chunk;
      }
    }
    await pipeline(createReadStream(source), tracked, createWriteStream(target, { flags: "wx" }), { signal });
    await verifyFile(target, pin, { signal });
    const after = await fs.stat(source);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw aiError("Die lokale KI-Quelle wurde während des Imports verändert.");
  }
  async function install({ confirmed, signal, onProgress, importRoot = null } = {}) {
    if (confirmed !== true) throw aiError("Der optionale KI-Download beziehungsweise lokale Import muss ausdrücklich gewählt werden.");
    if (closed || active) throw aiError("Die KI-Einrichtung ist beendet oder läuft bereits.");
    if (isWorkerBusy()) throw aiError("Die lokale KI arbeitet noch; vor einer Einrichtung regulär beenden.");
    controller = new AbortController();
    const combined = AbortSignal.any([controller.signal, AbortSignal.timeout(downloadTimeoutMs), ...(signal ? [signal] : [])]);
    let step = { phase: "preflight", artifactId: "" };
    state = { ...state, error: "", errorDetails: null };
    const operation = (async () => {
      await noLinks(root); await fs.mkdir(root, { recursive: true });
      const ownerPath = path.join(root, "install.lock");
      const owner = await fs.open(ownerPath, "wx").catch((error) => {
        if (error.code !== "EEXIST") throw error;
        throw aiError("Eine weitere KI-Einrichtung läuft oder ihr Abschluss ist ungeklärt.", "LOCAL_AI_INSTALL_LOCKED");
      });
      const stage = childPath(root, `.install-${randomUUID()}`);
      let stageOwned = false;
      try {
        step = { phase: "verify-existing", artifactId: "" };
        const existing = await verifyInstalled({ signal: combined, onArtifact: (pin) => { step.artifactId = safeArtifactId(pin); } });
        if (existing) { state = { ...state, status: "ready", error: "", errorDetails: null }; return { installed: true, alreadyPresent: true, bundleId: lock.bundleId }; }
        try { await fs.access(bundle); throw aiError("Ein vorhandener unvollständiger KI-Bestand wird nicht überschrieben. Bitte gezielt prüfen."); }
        catch (error) { if (error.code !== "ENOENT") throw error; }
        step = { phase: "preflight", artifactId: "" };
        const space = await fs.statfs(root), required = lock.artifacts.reduce((sum, item) => sum + item.bytes, 0)
          + lock.runtimeFiles.reduce((sum, item) => sum + item.bytes, 0) + 32 * 1024 * 1024;
        if (Number(space.bavail) * Number(space.bsize) < required) throw aiError("Für die optionale lokale KI ist nicht genügend freier Speicher vorhanden.", "LOCAL_AI_NO_SPACE");
        state = { ...state, status: "installing", downloadedBytes: 0, error: "" };
        await fs.mkdir(stage); stageOwned = true;
        for (const pin of lock.artifacts) {
          step = { phase: importRoot ? "local-import" : "download", artifactId: safeArtifactId(pin, lock.artifacts.indexOf(pin)) };
          combined.throwIfAborted();
          const target = childPath(stage, pin.relative); await fs.mkdir(path.dirname(target), { recursive: true });
          if (importRoot) await copyPinned(childPath(importRoot, `downloads/${pin.sourceName}`), pin, target, combined, onProgress);
          else await fetchPinned(pin, target, combined, onProgress);
        }
        const archive = lock.artifacts.find((item) => item.kind === "runtime-archive");
        step = { phase: "extract-runtime", artifactId: safeArtifactId(archive) };
        await extractPinnedRuntime(childPath(stage, archive.relative), path.join(stage, "runtime"), lock.runtimeFiles, { signal: combined });
        step = { phase: "finalize", artifactId: "" };
        await fs.rm(childPath(stage, archive.relative));
        await fs.rmdir(path.dirname(childPath(stage, archive.relative)));
        await writeJson(path.join(stage, "installed.json"), { schemaVersion: 1, bundleId: lock.bundleId, lockDigest,
          installedAt: new Date().toISOString(), source: importRoot ? "explicit-local-import" : "explicit-pinned-download", licenseFiles: lock.artifacts.filter((item) => item.kind === "license").map((item) => item.relative) });
        combined.throwIfAborted();
        await fs.mkdir(path.dirname(bundle), { recursive: true }); await noLinks(bundle);
        await fs.rename(stage, bundle);
        state = { ...state, status: "ready", error: "", errorDetails: null };
        return { installed: true, alreadyPresent: false, bundleId: lock.bundleId };
      } finally {
        let cleanupError = null;
        try {
          if (stageOwned) { await noLinks(stage); await fs.rm(stage, { recursive: true, force: true }); }
        } catch (error) { cleanupError = error; }
        try { await owner.close(); } catch (error) { cleanupError ||= error; }
        if (!cleanupError) try { await fs.rm(ownerPath, { force: true }); } catch (error) { cleanupError = error; }
        if (cleanupError) { step = { phase: "cleanup", artifactId: step.artifactId }; throw aiError(INSTALL_ERRORS.LOCAL_AI_CLEANUP_BLOCKED, "LOCAL_AI_CLEANUP_BLOCKED"); }
      }
    })();
    active = operation;
    try { return await operation; }
    catch (error) {
      const failure = installFailure(error, step, combined);
      state = { ...state, status: ["LOCAL_AI_CANCELLED", "LOCAL_AI_TIMEOUT"].includes(failure.details.code) ? "cancelled" : "failed", error: failure.message, errorDetails: failure.details };
      throw Object.assign(aiError(failure.message, failure.details.code), { installDiagnostic: clone(failure.details) });
    } finally { active = null; controller = null; }
  }
  return {
    getLock() { return clone(lock); },
    async status() {
      if (!active) {
        const record = await readJson(path.join(bundle, "installed.json")).catch(() => null);
        if (record?.lockDigest === lockDigest && state.status === "not-installed") state.status = "installed-unverified";
      }
      return clone({ ...state, installing: Boolean(active), optional: true, credentialsIncluded: false });
    },
    download(options) { return install(options); },
    async importPrepared({ confirmed, preparedReportPath, expectedReportSha256 = lock.sourceEvidenceSha256, ...options } = {}) {
      if (confirmed !== true) throw aiError("Der lokale Import vorhandener KI-Dateien muss ausdrücklich gewählt werden.");
      if (!path.isAbsolute(preparedReportPath || "") || !/^[a-f0-9]{64}$/.test(expectedReportSha256 || "")) throw aiError("Der vorbereitete lokale KI-Nachweis muss ausdrücklich gebunden sein.");
      await noLinks(preparedReportPath);
      const reportStat = await fs.stat(preparedReportPath);
      if (!reportStat.isFile() || reportStat.size > 2 * 1024 * 1024) throw aiError("Ungültiger lokaler KI-Vorbereitungsnachweis.");
      const reportBytes = await fs.readFile(preparedReportPath);
      if (reportBytes.length > 2 * 1024 * 1024 || sha256(reportBytes) !== expectedReportSha256) throw aiError("Der bestätigte KI-Vorbereitungsnachweis wurde verändert.");
      const record = JSON.parse(reportBytes.toString("utf8"));
      if (record.schemaVersion !== 1 || !path.isAbsolute(record.root || "")) throw aiError("Ungültiger lokaler KI-Vorbereitungsnachweis.");
      await noLinks(record.root);
      return install({ ...options, confirmed, importRoot: record.root });
    },
    async resolveVerified({ signal } = {}) {
      if (closed || active) throw aiError("Die lokale KI ist gerade nicht startbereit.");
      const existing = await verifyInstalled({ signal });
      if (!existing) throw aiError("Die optionale lokale KI ist noch nicht eingerichtet.", "LOCAL_AI_NOT_INSTALLED");
      state = { ...state, status: "ready", error: "", errorDetails: null };
      return { bundleId: lock.bundleId, runtimeVersion: lock.runtime.version, serverPath: childPath(bundle, lock.runtime.serverFile),
        runtimeDirectory: path.join(bundle, "runtime"), modelPath: childPath(bundle, lock.model.modelFile),
        projectorPath: childPath(bundle, lock.model.projectorFile), privateTempRoot: childPath(root, "worker-temp"), lockDigest };
    },
    cancelInstall() { controller?.abort(); },
    async close() { closed = true; controller?.abort(); if (active) await active.catch(() => {}); },
  };
}
