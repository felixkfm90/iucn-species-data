import crypto from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { atomicWriteJson } from "./taxonomy-storage.mjs";
import { INATURALIST_TAXONOMY_SOURCE_URL } from "./taxonomy-inaturalist-snapshot.mjs";

const DOWNLOAD_STATE_SCHEMA_VERSION = 1;
const DEFAULT_CHECK_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const DEFAULT_RETRY_DELAYS_MS = Object.freeze([1_000, 3_000]);

function cleanText(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function createHttpError(message, statusCode = 502) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function downloadRoot(taxonomyRoot) {
  return path.join(path.resolve(taxonomyRoot), "master", "downloads", "inaturalist");
}

function statePath(taxonomyRoot) {
  return path.join(downloadRoot(taxonomyRoot), "state.json");
}

function archivesRoot(taxonomyRoot) {
  return path.join(downloadRoot(taxonomyRoot), "archives");
}

async function readState(taxonomyRoot) {
  try {
    const value = JSON.parse(await fs.readFile(statePath(taxonomyRoot), "utf8"));
    if (value?.schemaVersion !== DOWNLOAD_STATE_SCHEMA_VERSION || !value.archivePath) return null;
    const archivePath = path.resolve(value.archivePath);
    const stats = await fs.stat(archivePath);
    if (!stats.isFile() || stats.size < 4) return null;
    return { ...value, archivePath };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    return null;
  }
}

function stateIsFresh(state, now, ttlMs) {
  const checkedAt = Date.parse(state?.checkedAt || "");
  return Number.isFinite(checkedAt) && checkedAt + ttlMs > now.getTime();
}

function versionDate(headers, now) {
  const modified = Date.parse(headers.get("last-modified") || "");
  const date = Number.isFinite(modified) ? new Date(modified) : now;
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function responseFingerprint(headers) {
  return {
    etag: cleanText(headers.get("etag")) || null,
    lastModified: cleanText(headers.get("last-modified")) || null,
  };
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs, externalSignal) {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, timeoutController.signal])
    : timeoutController.signal;
  try {
    return await fetchImpl(url, {
      ...options,
      signal,
      headers: {
        Accept: "application/zip, application/octet-stream;q=0.9, */*;q=0.5",
        "User-Agent": "FN-Wildlife-Travel-Arten-Explorer/1.0",
        ...(options?.headers || {}),
      },
    });
  } catch (error) {
    if (externalSignal?.aborted) throw externalSignal.reason || error;
    if (error?.name === "AbortError") {
      throw createHttpError("Der iNaturalist-Download hat zu lange gedauert.", 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithRetries({
  fetchImpl,
  url,
  options,
  timeoutMs,
  signal,
  retryDelays,
}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    signal?.throwIfAborted();
    try {
      const response = await fetchWithTimeout(fetchImpl, url, options, timeoutMs, signal);
      if (response.ok || response.status === 304) return response;
      if (response.status < 500 && response.status !== 429) return response;
      lastError = createHttpError(
        `iNaturalist antwortet vorübergehend mit HTTP ${response.status}.`,
        502,
      );
    } catch (error) {
      lastError = error;
    }
    if (attempt < retryDelays.length) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, retryDelays[attempt]);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(signal.reason || new DOMException("Abgebrochen", "AbortError"));
        }, { once: true });
      });
    }
  }
  throw lastError || createHttpError("iNaturalist ist derzeit nicht erreichbar.");
}

async function validateZip(filePath) {
  const handle = await fs.open(filePath, "r");
  try {
    const signature = Buffer.alloc(4);
    const { bytesRead } = await handle.read(signature, 0, 4, 0);
    if (bytesRead !== 4 || signature.toString("hex") !== "504b0304") {
      throw createHttpError("Der iNaturalist-Download ist kein gültiges ZIP-Archiv.");
    }
  } finally {
    await handle.close();
  }
}

async function pruneArchives(taxonomyRoot, keepPaths, limit = 2) {
  let entries = [];
  try {
    entries = await fs.readdir(archivesRoot(taxonomyRoot), { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  const keep = new Set(keepPaths.map((entry) => path.resolve(entry)));
  const files = await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith(".zip"))
    .map(async (entry) => {
      const absolute = path.join(archivesRoot(taxonomyRoot), entry.name);
      return { absolute, mtimeMs: (await fs.stat(absolute)).mtimeMs };
    }));
  const removable = files.filter((entry) => !keep.has(path.resolve(entry.absolute)))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(Math.max(0, limit - keep.size));
  await Promise.all(removable.map((entry) => fs.rm(entry.absolute, { force: true })));
}

async function downloadResponse({
  response,
  taxonomyRoot,
  maxBytes,
  signal,
  onProgress,
  now,
}) {
  if (!response.body) throw createHttpError("iNaturalist liefert keinen Downloadinhalt.");
  const announcedBytes = Number(response.headers.get("content-length")) || null;
  if (announcedBytes && announcedBytes > maxBytes) {
    throw createHttpError(
      `Das iNaturalist-Archiv ist mit ${(announcedBytes / 1024 ** 2).toFixed(1)} MiB größer als das Sicherheitslimit.`,
      413,
    );
  }
  const root = downloadRoot(taxonomyRoot);
  await fs.mkdir(archivesRoot(taxonomyRoot), { recursive: true });
  const temporaryPath = path.join(root, `download-${process.pid}-${crypto.randomUUID()}.part`);
  const hash = crypto.createHash("sha256");
  let receivedBytes = 0;
  const transform = new TransformStream({
    transform(chunk, controller) {
      signal?.throwIfAborted();
      const buffer = Buffer.from(chunk);
      receivedBytes += buffer.length;
      if (receivedBytes > maxBytes) {
        throw createHttpError("Der iNaturalist-Download überschreitet das Sicherheitslimit.", 413);
      }
      hash.update(buffer);
      onProgress?.({
        phase: "inaturalist-download",
        current: receivedBytes,
        total: announcedBytes,
        message: "iNaturalist-Namensbestand wird heruntergeladen",
      });
      controller.enqueue(buffer);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(response.body.pipeThrough(transform)),
      createWriteStream(temporaryPath, { flags: "wx" }),
      { signal },
    );
    await validateZip(temporaryPath);
    const checksumSha256 = hash.digest("hex");
    const date = versionDate(response.headers, now);
    const providerVersion = `inat-${date}-${checksumSha256.slice(0, 16)}`;
    const archivePath = path.join(archivesRoot(taxonomyRoot), `${providerVersion}.zip`);
    try {
      await fs.rename(temporaryPath, archivePath);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await fs.rm(temporaryPath, { force: true });
    }
    return {
      archivePath,
      providerVersion,
      checksumSha256,
      bytes: receivedBytes,
      ...responseFingerprint(response.headers),
    };
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function downloadInaturalistTaxonomyArchive({
  taxonomyRoot,
  fetchImpl = globalThis.fetch,
  force = false,
  now = () => new Date(),
  ttlMs = DEFAULT_CHECK_TTL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_ARCHIVE_BYTES,
  retryDelays = DEFAULT_RETRY_DELAYS_MS,
  signal,
  onProgress,
} = {}) {
  if (!taxonomyRoot || typeof fetchImpl !== "function") {
    throw new TypeError("Taxonomiepfad und fetch sind für den iNaturalist-Download erforderlich.");
  }
  signal?.throwIfAborted();
  const current = await readState(taxonomyRoot);
  const currentTime = now();
  if (!force && current && stateIsFresh(current, currentTime, ttlMs)) {
    return { ...current, cached: true, warning: "" };
  }
  const conditionalHeaders = {};
  if (current?.etag) conditionalHeaders["If-None-Match"] = current.etag;
  if (current?.lastModified) conditionalHeaders["If-Modified-Since"] = current.lastModified;
  try {
    const response = await fetchWithRetries({
      fetchImpl,
      url: INATURALIST_TAXONOMY_SOURCE_URL,
      options: { redirect: "follow", headers: conditionalHeaders },
      timeoutMs,
      signal,
      retryDelays,
    });
    if (response.status === 304 && current) {
      const next = { ...current, checkedAt: currentTime.toISOString() };
      await atomicWriteJson(statePath(taxonomyRoot), next);
      return { ...next, cached: true, warning: "" };
    }
    if (!response.ok) {
      throw createHttpError(
        `Der iNaturalist-Namensbestand konnte nicht geladen werden (HTTP ${response.status}).`,
      );
    }
    const downloaded = await downloadResponse({
      response,
      taxonomyRoot,
      maxBytes,
      signal,
      onProgress,
      now: currentTime,
    });
    const next = {
      schemaVersion: DOWNLOAD_STATE_SCHEMA_VERSION,
      sourceUrl: INATURALIST_TAXONOMY_SOURCE_URL,
      checkedAt: currentTime.toISOString(),
      downloadedAt: currentTime.toISOString(),
      ...downloaded,
    };
    await atomicWriteJson(statePath(taxonomyRoot), next);
    await pruneArchives(taxonomyRoot, [next.archivePath]);
    return { ...next, cached: false, warning: "" };
  } catch (error) {
    if (signal?.aborted) throw signal.reason || error;
    if (!current) throw error;
    return {
      ...current,
      cached: true,
      warning: `iNaturalist konnte nicht aktualisiert werden; der letzte funktionierende lokale Stand bleibt aktiv: ${error.message}`,
    };
  }
}

export const inaturalistClientInternals = Object.freeze({
  archivesRoot,
  downloadRoot,
  readState,
  statePath,
  validateZip,
});
