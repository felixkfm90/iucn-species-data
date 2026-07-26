import crypto from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { atomicWriteJson } from "./taxonomy-storage.mjs";

const CHECKLISTBANK_API = "https://api.checklistbank.org";
const CHECKLISTBANK_DOWNLOAD = "https://download.checklistbank.org";
const RELEASE_QUERY = `${CHECKLISTBANK_API}/dataset?limit=100&origin=xrelease`;
const UPDATE_CHECK_SCHEMA_VERSION = 1;
const DEFAULT_CHECK_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ARCHIVE_BYTES = 2_500_000_000;
const RETRY_DELAYS_MS = Object.freeze([1_000, 3_000, 8_000]);

function createHttpError(message, statusCode = 502, details = []) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function normalizeIssued(value) {
  const issued = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issued)) {
    throw createHttpError("ChecklistBank liefert kein gültiges Ausgabedatum.", 502);
  }
  return issued;
}

function normalizeDatasetKey(value) {
  const key = Number(value);
  if (!Number.isInteger(key) || key <= 0) {
    throw createHttpError("ChecklistBank liefert keine gültige Datensatzkennung.", 502);
  }
  return key;
}

function releaseIdFor(entry) {
  return `col-xr-${normalizeIssued(entry.issued)}-${normalizeDatasetKey(entry.key)}`;
}

export function normalizeCatalogueRelease(entry) {
  if (!entry || typeof entry !== "object") {
    throw createHttpError("ChecklistBank liefert keine Release-Metadaten.", 502);
  }
  const datasetKey = normalizeDatasetKey(entry.key);
  const issued = normalizeIssued(entry.issued);
  const releaseId = releaseIdFor(entry);
  return {
    releaseId,
    datasetKey,
    alias: String(entry.alias || entry.version || releaseId).trim(),
    title: String(entry.title || "Catalogue of Life").trim(),
    issued,
    version: String(entry.version || issued).trim(),
    doi: String(entry.doi || "").trim() || null,
    origin: String(entry.origin || "xrelease").trim(),
    expectedNameUsages: Number.isFinite(Number(entry.size)) ? Number(entry.size) : null,
    attempt: Number.isFinite(Number(entry.attempt)) ? Number(entry.attempt) : null,
    metadataUrl: `${CHECKLISTBANK_API}/dataset/${datasetKey}`,
    sourceUrl: "https://www.catalogueoflife.org/data/download",
    exportUrl: `${CHECKLISTBANK_API}/dataset/${datasetKey}/export.zip?extended=true&format=ColDP`,
    format: "ColDP",
    coldpVersion: "1.2",
    source: "Catalogue of Life",
    license: "CC BY 4.0; die Attribution integrierter Quelldatensätze bleibt erhalten.",
  };
}

function releaseTimestamp(release) {
  const timestamp = Date.parse(`${release.issued}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function newestCatalogueRelease(entries) {
  const releases = (Array.isArray(entries) ? entries : [])
    .filter((entry) => String(entry?.origin ?? "").toLowerCase() === "xrelease")
    .map(normalizeCatalogueRelease)
    .sort((left, right) => {
      const dateDifference = releaseTimestamp(right) - releaseTimestamp(left);
      return dateDifference || right.datasetKey - left.datasetKey;
    });
  if (!releases.length) {
    throw createHttpError("ChecklistBank meldet derzeit kein CoL-XR-Release.", 502);
  }
  return releases[0];
}

function isAllowedReleaseUrl(url) {
  return url.protocol === "https:"
    && url.origin === CHECKLISTBANK_API
    && /^\/dataset(?:\/|$)/.test(url.pathname);
}

function isAllowedDownloadUrl(url) {
  return url.protocol === "https:"
    && url.origin === CHECKLISTBANK_DOWNLOAD
    && /^\/job\/[a-z0-9]{2}\/[a-z0-9-]+\.zip$/i.test(url.pathname);
}

async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json, application/zip;q=0.9, */*;q=0.5",
        "User-Agent": "FN-Wildlife-Travel-Arten-Explorer/1.0",
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createHttpError("Die Verbindung zu ChecklistBank hat zu lange gedauert.", 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithRetries(fetchImpl, url, options = {}, retryDelays = RETRY_DELAYS_MS) {
  let lastError = null;
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      const response = await fetchWithTimeout(fetchImpl, url, options);
      if (response.ok || (response.status >= 300 && response.status < 400)) return response;
      if (response.status < 500 && response.status !== 429) return response;
      lastError = createHttpError(
        `ChecklistBank antwortet vorübergehend mit HTTP ${response.status}.`,
        502,
      );
    } catch (error) {
      lastError = error;
    }
    if (attempt < retryDelays.length) {
      await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
    }
  }
  throw lastError || createHttpError("ChecklistBank ist derzeit nicht erreichbar.", 502);
}

async function readCachedCheck(cachePath, currentTime, ttlMs) {
  try {
    const value = JSON.parse(await fs.readFile(cachePath, "utf8"));
    const currentTimestamp = new Date(currentTime).getTime();
    if (
      value?.schemaVersion === UPDATE_CHECK_SCHEMA_VERSION
      && value.latest?.releaseId
      && Number.isFinite(currentTimestamp)
      && Date.parse(value.checkedAt) + ttlMs > currentTimestamp
    ) {
      return value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      // Eine beschädigte optionale Cachedatei wird durch die nächste Prüfung ersetzt.
    }
  }
  return null;
}

export async function discoverLatestCatalogueRelease({
  fetchImpl = globalThis.fetch,
  cachePath,
  force = false,
  now = () => new Date(),
  ttlMs = DEFAULT_CHECK_TTL_MS,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("Für die Releaseprüfung ist fetch erforderlich.");
  }
  if (cachePath && !force) {
    const cached = await readCachedCheck(cachePath, now(), ttlMs);
    if (cached) return { ...cached, cached: true };
  }
  const response = await fetchWithRetries(fetchImpl, RELEASE_QUERY, {
    redirect: "error",
  });
  if (!response.ok) {
    throw createHttpError(
      `Die CoL-Releaseliste konnte nicht geladen werden (HTTP ${response.status}).`,
      502,
    );
  }
  const payload = await response.json();
  const latest = newestCatalogueRelease(payload?.result);
  const result = {
    schemaVersion: UPDATE_CHECK_SCHEMA_VERSION,
    checkedAt: now().toISOString(),
    latest,
    cached: false,
  };
  if (cachePath) await atomicWriteJson(cachePath, result);
  return result;
}

async function resolveDownloadResponse(fetchImpl, exportUrl) {
  const initialUrl = new URL(exportUrl);
  if (!isAllowedReleaseUrl(initialUrl)) {
    throw createHttpError("Die Exportadresse liegt außerhalb der erlaubten ChecklistBank-API.", 400);
  }
  const response = await fetchWithRetries(fetchImpl, initialUrl, {
    redirect: "manual",
  });
  if (response.status < 300 || response.status >= 400) {
    throw createHttpError(
      `ChecklistBank hat keine sichere Downloadweiterleitung geliefert (HTTP ${response.status}).`,
      502,
    );
  }
  const location = response.headers.get("location");
  const downloadUrl = location ? new URL(location, initialUrl) : null;
  if (!downloadUrl || !isAllowedDownloadUrl(downloadUrl)) {
    throw createHttpError("ChecklistBank hat auf eine nicht erlaubte Downloadadresse weitergeleitet.", 502);
  }
  const download = await fetchWithRetries(fetchImpl, downloadUrl, {
    redirect: "error",
    headers: { Accept: "application/zip" },
  });
  if (!download.ok || !download.body) {
    throw createHttpError(
      `Der CoL-Export konnte nicht geladen werden (HTTP ${download.status}).`,
      502,
    );
  }
  return { response: download, downloadUrl: downloadUrl.href };
}

export async function downloadCatalogueArchive({
  release,
  targetPath,
  fetchImpl = globalThis.fetch,
  maxBytes = DEFAULT_MAX_ARCHIVE_BYTES,
  onProgress,
} = {}) {
  if (!release?.exportUrl || !targetPath) {
    throw new TypeError("Release und Downloadziel sind erforderlich.");
  }
  const { response, downloadUrl } = await resolveDownloadResponse(fetchImpl, release.exportUrl);
  const announcedBytes = Number(response.headers.get("content-length")) || null;
  if (announcedBytes && announcedBytes > maxBytes) {
    throw createHttpError(
      `Das CoL-Archiv ist mit ${(announcedBytes / 1024 ** 3).toFixed(2)} GB größer als das Sicherheitslimit.`,
      413,
    );
  }
  await fs.mkdir(path.dirname(path.resolve(targetPath)), { recursive: true });
  const temporaryPath = `${path.resolve(targetPath)}.${process.pid}.part`;
  const hash = crypto.createHash("sha256");
  let receivedBytes = 0;
  const transform = new TransformStream({
    transform(chunk, controller) {
      const buffer = Buffer.from(chunk);
      receivedBytes += buffer.length;
      if (receivedBytes > maxBytes) {
        throw createHttpError("Der CoL-Download überschreitet das Sicherheitslimit.", 413);
      }
      hash.update(buffer);
      onProgress?.({
        phase: "download",
        current: receivedBytes,
        total: announcedBytes,
        message: "Referenzdaten werden heruntergeladen",
      });
      controller.enqueue(buffer);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(response.body.pipeThrough(transform)),
      createWriteStream(temporaryPath, { flags: "wx" }),
    );
    if (receivedBytes < 4) throw createHttpError("Das CoL-Archiv ist leer.", 502);
    const signature = Buffer.alloc(4);
    const archive = await fs.open(temporaryPath, "r");
    try {
      await archive.read(signature, 0, 4, 0);
    } finally {
      await archive.close();
    }
    if (signature.toString("hex") !== "504b0304") {
      throw createHttpError("Der CoL-Download ist kein gültiges ZIP-Archiv.", 502);
    }
    await fs.rename(temporaryPath, targetPath);
    return {
      archivePath: path.resolve(targetPath),
      bytes: receivedBytes,
      sha256: hash.digest("hex"),
      downloadUrl,
    };
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

export const taxonomyReleaseClientInternals = Object.freeze({
  CHECKLISTBANK_API,
  CHECKLISTBANK_DOWNLOAD,
  RELEASE_QUERY,
  isAllowedReleaseUrl,
  isAllowedDownloadUrl,
});
