import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createManagedTempSession } from "../species-explorer/temp-session.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { iucnBrowserAccessError } from "./iucn-map-access.mjs";
import { assertPublicHttpUrl } from "../species-explorer/request-security.mjs";
import { validateImageDecode } from "./image-validation.mjs";

const defaultExecFile = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const MAX_MAP_BYTES = 20 * 1024 * 1024;
const MAP_FETCH_TIMEOUT_MS = 30_000;
const TRANSPORT_FAILURES = new Set(["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "ERR_SSL_WRONG_VERSION_NUMBER", "ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR"]);

async function readBoundedBody(response, controller) {
  if (!response.body?.getReader) throw new Error("Kartenantwort besitzt keinen lesbaren Downloadstream.");
  const reader = response.body.getReader(), chunks = [];
  let received = 0, rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  const onAbort = () => {
    rejectAbort(Object.assign(new Error("Kartenabruf wurde abgebrochen."), { name: "AbortError" }));
    void reader.cancel().catch(() => {});
  };
  controller.signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (controller.signal.aborted) onAbort();
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      received += value.byteLength;
      if (received > MAX_MAP_BYTES) {
        controller.abort();
        throw new Error("JPEG-Datei darf maximal 20 MiB groß sein.");
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, received);
  } finally {
    controller.signal.removeEventListener("abort", onAbort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function isJpegBuffer(buffer) {
  return buffer.length >= 4
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[buffer.length - 2] === 0xff
    && buffer[buffer.length - 1] === 0xd9;
}

function numericId(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? text : "";
}

export function taxonIdFromTaxon(taxon) {
  if (!taxon || typeof taxon !== "object") return "";
  for (const key of ["sis_id", "sis_taxon_id", "taxon_id", "taxonid", "taxonId", "id"]) {
    const id = numericId(taxon[key]);
    if (id) return id;
  }
  return "";
}

function normalizePageHtml(html) {
  return String(html ?? "")
    .replace(/\\u0022/g, "\"")
    .replace(/\\u0026/g, "&")
    .replace(/\\u002F/gi, "/")
    .replace(/\\u003D/gi, "=")
    .replace(/\\u003F/gi, "?")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeCachedMapUrl(rawUrl) {
  const cleaned = normalizePageHtml(rawUrl)
    .replace(/%26/gi, "&")
    .replace(/%3D/gi, "=")
    .replace(/\\+\"/g, "")
    .replace(/[)\"',;]+$/g, "")
    .trim();
  if (!cleaned) return "";
  if (cleaned.startsWith("//")) return `https:${cleaned}`;
  if (cleaned.startsWith("/file/cached-individual-maps/")) return `https://f002.backblazeb2.com${cleaned}`;
  if (cleaned.startsWith("cached-individual-maps/")) return `https://f002.backblazeb2.com/file/${cleaned}`;
  return cleaned;
}

export function extractCachedIucnMapUrls(text, cacheFile = "") {
  const normalized = normalizePageHtml(text);
  const filePattern = cacheFile ? escapeRegExp(cacheFile) : "T\\d+A\\d+\\.jpg";
  const patterns = [
    new RegExp(`https?:\\/\\/[^\"'\\s<>]+cached-individual-maps\\/${filePattern}[^\"'\\s<>]*`, "gi"),
    new RegExp(`\\/file\\/cached-individual-maps\\/${filePattern}[^\"'\\s<>]*`, "gi"),
    new RegExp(`cached-individual-maps\\/${filePattern}[^\"'\\s<>]*`, "gi"),
  ];
  const urls = [];
  const seen = new Set();
  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const url = normalizeCachedMapUrl(match[0]);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

export function createIucnMapAdapter({
  fetch,
  token,
  iucnGET,
  sleep,
  sanitizeAssetName,
  speciesAssetDir,
  ensureDir,
  isManualAsset,
  isAssessmentCurrent = () => false,
  recordAssessment = () => {},
  logError = () => {},
  baseUrl = "https://api.iucnredlist.org/api/v4",
  platform = process.platform,
  execFileAsync = defaultExecFile,
  tempRoot = REPO_ROOT,
  validateUrl = assertPublicHttpUrl,
  timeoutMs = MAP_FETCH_TIMEOUT_MS,
  logger = console,
  powerShellRetryAttempts = 3,
  powerShellRetryDelayMs = 1_500,
} = {}) {
  if (typeof fetch !== "function") throw new TypeError("IUCN-Kartenadapter benötigt fetch.");
  if (typeof iucnGET !== "function") throw new TypeError("IUCN-Kartenadapter benötigt iucnGET.");
  if (typeof sleep !== "function") throw new TypeError("IUCN-Kartenadapter benötigt sleep.");
  if (typeof validateUrl !== "function" || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAP_FETCH_TIMEOUT_MS
      || !Number.isInteger(powerShellRetryAttempts) || powerShellRetryAttempts < 1 || powerShellRetryAttempts > 3
      || !Number.isFinite(powerShellRetryDelayMs) || powerShellRetryDelayMs < 0 || powerShellRetryDelayMs > 1500) {
    throw new TypeError("Ungültige URL-Prüfung oder Zeitgrenze für den Kartenabruf.");
  }

  async function findTaxonId(entry) {
    const direct = taxonIdFromTaxon(entry) || numericId(entry["Taxon ID"]);
    if (direct) return direct;
    const genus = String(entry.Genus ?? "").trim();
    const species = String(entry.Species ?? "").trim();
    if (!genus || !species || genus === "n/a" || species === "n/a") return "";
    const taxonData = await iucnGET(
      `/taxa/scientific_name?genus_name=${encodeURIComponent(genus)}&species_name=${encodeURIComponent(species)}`,
    );
    return taxonIdFromTaxon(taxonData?.taxon);
  }

  function requestHeaders(url) {
    const parsed = new URL(url);
    const headers = {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cache-Control": "max-age=0",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    };
    if (token && parsed.origin === "https://api.iucnredlist.org") {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  function canUsePowerShell(url) {
    if (platform !== "win32") return false;
    const parsed = new URL(url);
    return (parsed.hostname.toLowerCase() === "iucnredlist.org" || parsed.hostname.toLowerCase() === "www.iucnredlist.org")
      && parsed.pathname.includes("/api/v4/assessments/")
      && parsed.pathname.endsWith("/distribution_map/jpg");
  }

  async function fetchWithPowerShell(url) {
    if (!canUsePowerShell(url)) return null;
    const script = `
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
$Uri = $env:IUCN_MAP_URL
$OutFile = $env:IUCN_MAP_OUTFILE
if (-not $Uri -or -not $OutFile) { throw 'IUCN_MAP_URL oder IUCN_MAP_OUTFILE fehlt.' }
$headers = @{
  Accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'
  'Accept-Language' = 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7'
  'Cache-Control' = 'max-age=0'
  'Upgrade-Insecure-Requests' = '1'
  'Sec-Fetch-Dest' = 'document'
  'Sec-Fetch-Mode' = 'navigate'
  'Sec-Fetch-Site' = 'none'
  'Sec-Fetch-User' = '?1'
  'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
}
try {
  $request = [System.Net.HttpWebRequest]::Create($Uri)
  $request.AllowAutoRedirect = $false
  $request.Timeout = 30000
  $request.ReadWriteTimeout = 30000
  $request.Accept = $headers.Accept
  $request.UserAgent = $headers.'User-Agent'
  foreach ($key in $headers.Keys) {
    if ($key -notin @('Accept', 'User-Agent')) { $request.Headers[$key] = $headers[$key] }
  }
  $response = $request.GetResponse()
  $status = [int]$response.StatusCode
  if ($status -ne 200) { throw "Kartenantwort ist nicht freigegeben (HTTP $status)." }
  $limit = 20 * 1024 * 1024
  if ($response.ContentLength -gt $limit) { throw 'JPEG-Datei darf maximal 20 MiB gross sein.' }
  $inputStream = $response.GetResponseStream()
  $outputStream = [System.IO.File]::Open($OutFile, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  $buffer = New-Object byte[] 65536
  $received = 0
  while (($read = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
    $received += $read
    if ($received -gt $limit) { throw 'JPEG-Datei darf maximal 20 MiB gross sein.' }
    $outputStream.Write($buffer, 0, $read)
  }
  [pscustomobject]@{ status = $status; length = [int64]$received } | ConvertTo-Json -Compress
  exit 0
} catch {
  $status = $null
  if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
  elseif ($response) { $status = [int]$response.StatusCode }
  $transportStatus = $null
  if ($_.Exception -is [System.Net.WebException]) { $transportStatus = $_.Exception.Status.ToString() }
  [pscustomobject]@{ status = $status; transportStatus = $transportStatus; error = $_.Exception.Message } | ConvertTo-Json -Compress
  exit 1
} finally {
  if ($outputStream) { $outputStream.Dispose() }
  if ($inputStream) { $inputStream.Dispose() }
  if ($response) { $response.Dispose() }
  if ($request) { $request.Abort() }
}`.trim();
    let lastMessage = "";
    for (let attempt = 1; attempt <= powerShellRetryAttempts; attempt++) {
      const session = await createManagedTempSession({ repoRoot: tempRoot });
      const tempFile = await session.filePath("map.jpg");
      try {
        const { stdout } = await execFileAsync(
          "powershell.exe",
          ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
          {
            env: { ...process.env, IUCN_MAP_URL: url, IUCN_MAP_OUTFILE: tempFile },
            maxBuffer: 1024 * 1024,
            timeout: 60_000,
            windowsHide: true,
            encoding: "utf8",
          },
        );
        const info = JSON.parse(String(stdout || "{}"));
        if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > MAX_MAP_BYTES) {
          throw Object.assign(new Error("JPEG-Datei darf maximal 20 MiB groß sein."), { code: "IUCN_MAP_INVALID_RESPONSE" });
        }
        const buffer = fs.existsSync(tempFile) ? fs.readFileSync(tempFile) : Buffer.alloc(0);
        if (info.status === 200 && buffer.length >= 10_000 && isJpegBuffer(buffer)) {
          await validateImageDecode(buffer, { format: "jpeg", repoRoot: REPO_ROOT });
          logger.log(attempt > 1
            ? `↪ IUCN-Karte über Windows-WebRequest-Fallback geladen (Versuch ${attempt}).`
            : "↪ IUCN-Karte über Windows-WebRequest-Fallback geladen.");
          return buffer;
        }
        throw Object.assign(new Error(`IUCN-Kartenantwort ist keine gültige JPEG-Datei (HTTP ${info.status ?? "unbekannt"}).`),
          { code: "IUCN_MAP_INVALID_RESPONSE" });
      } catch (error) {
        if (error.code === "IUCN_MAP_INVALID_RESPONSE" || !error.stdout && !error.stderr && !error.killed) throw error;
        const output = String(error.stdout || error.stderr || "").trim();
        lastMessage = error.message;
        if (output) {
          let info;
          try {
            info = JSON.parse(output);
            lastMessage = info.error || lastMessage;
          } catch {
            lastMessage = output.slice(0, 200);
          }
          if (info?.status) throw iucnBrowserAccessError(url, Number(info.status)) || new Error(lastMessage);
          if (!["ConnectFailure", "ConnectionClosed", "KeepAliveFailure", "NameResolutionFailure", "Timeout",
            "ReceiveFailure", "SendFailure", "ProxyNameResolutionFailure"].includes(info?.transportStatus)) {
            throw new Error(lastMessage);
          }
        }
      } finally {
        await session.close();
      }
      if (attempt < powerShellRetryAttempts) {
        logger.warn(`⚠ Windows-WebRequest-Fallback für IUCN-Karte fehlgeschlagen (Versuch ${attempt}/${powerShellRetryAttempts}): ${lastMessage}. Neuer Versuch folgt.`);
        await sleep(powerShellRetryDelayMs * attempt);
      }
    }
    logger.warn(`⚠ Windows-WebRequest-Fallback für IUCN-Karte nicht nutzbar: ${lastMessage || "unbekannter Fehler"}`);
    return null;
  }

  async function fetchBoundedResponse(url, { allowNative = false } = {}) {
    const controller = new AbortController();
    let rejectAbort, response, receivedHttpResponse = false, transportFailure = false;
    const aborted = new Promise((_, reject) => { rejectAbort = reject; });
    const onAbort = () => rejectAbort(Object.assign(new Error("Kartenabruf wurde abgebrochen."), { name: "AbortError" }));
    controller.signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let parsed = await Promise.race([validateUrl(url), aborted]);
      for (let redirects = 0; redirects <= 5; redirects++) {
        try {
          response = await Promise.race([fetch(parsed.href, { headers: requestHeaders(parsed.href),
            redirect: "manual", signal: controller.signal }), aborted]);
        } catch (error) {
          transportFailure = TRANSPORT_FAILURES.has(String(error.cause?.code || error.code || ""));
          throw error;
        }
        receivedHttpResponse = true;
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location || redirects === 5) throw new Error("Karten-URL enthält eine ungültige oder zu lange Weiterleitung.");
        parsed = await Promise.race([validateUrl(new URL(location, parsed)), aborted]);
      }
      const denied = iucnBrowserAccessError(parsed.href, response.status);
      if (denied) throw denied;
      if ([401, 403].includes(response.status)) throw new Error(`Kartenabruf ist nicht freigegeben (HTTP ${response.status}).`);
      if (Number(response.headers.get("content-length") || 0) > MAX_MAP_BYTES) {
        throw new Error("JPEG-Datei darf maximal 20 MiB groß sein.");
      }
      return { response, buffer: await readBoundedBody(response, controller) };
    } catch (error) {
      if (error.name === "AbortError") throw new Error("Karten-URL hat nicht rechtzeitig geantwortet.");
      // A second transport can recover only an initial network/TLS failure.
      // HTTP denial, redirect rejection, body and certificate errors are final.
      if (allowNative && transportFailure && !receivedHttpResponse && !controller.signal.aborted) {
        const buffer = await fetchWithPowerShell(url);
        if (buffer) return { response: null, buffer };
      }
      throw error;
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", onAbort);
      await response?.body?.cancel().catch(() => {});
    }
  }

  async function fetchValidJpeg(url, { cacheFile = "", seen = new Set() } = {}) {
    if (seen.has(url)) return null;
    if (seen.size >= 50) throw new Error("Kartenantwort enthält zu viele weitere Quellen.");
    seen.add(url);
    const { response, buffer } = await fetchBoundedResponse(url, { allowNative: true });
    if (response && !response.ok) {
      const host = new URL(url).hostname;
      const body = buffer.toString("utf8");
      for (const candidate of extractCachedIucnMapUrls(body, cacheFile)) {
        const cached = await fetchValidJpeg(candidate, { cacheFile, seen });
        if (cached) return cached;
      }
      logger.warn(`⚠ JPEG-Abruf fehlgeschlagen (${response.status}) bei ${host}.`);
      return null;
    }
    if (buffer.length >= 10_000 && isJpegBuffer(buffer)) {
      await validateImageDecode(buffer, { format: "jpeg", repoRoot: REPO_ROOT });
      return buffer;
    }
    const contentType = response?.headers.get("content-type") || "";
    if (/text|json|html/i.test(contentType) || buffer.length < 2_000_000) {
      for (const candidate of extractCachedIucnMapUrls(buffer.toString("utf8"), cacheFile)) {
        const cached = await fetchValidJpeg(candidate, { cacheFile, seen });
        if (cached) return cached;
      }
    }
    logger.warn(`⚠ JPEG-Abruf bei ${new URL(url).hostname} lieferte keine gültige Kartendatei.`);
    return null;
  }

  async function fetchCachedMap(entry, assessmentId, name) {
    const taxonId = await findTaxonId(entry);
    if (!taxonId) return null;
    const cacheFile = `T${taxonId}A${assessmentId}.jpg`;
    const seen = new Set();
    try {
      const { response: pageResponse, buffer } = await fetchBoundedResponse(`https://www.iucnredlist.org/species/${taxonId}/${assessmentId}`);
      if (pageResponse.ok) {
        for (const candidate of extractCachedIucnMapUrls(buffer.toString("utf8"), cacheFile).slice(0, 50)) {
          const cached = await fetchValidJpeg(candidate, { cacheFile, seen });
          if (cached) {
            logger.log(`↪ IUCN-Karte über Cache gefunden für ${name} (${taxonId}/${assessmentId})`);
            return cached;
          }
        }
      }
    } catch (error) {
      logger.warn(`⚠ IUCN-Cache-Seite für ${name} nicht nutzbar: ${error.message}`);
      throw error;
    }
    try {
      const cached = await fetchValidJpeg(
        `https://f002.backblazeb2.com/file/cached-individual-maps/${cacheFile}`,
        { cacheFile, seen },
      );
      if (cached) {
        logger.log(`↪ IUCN-Karte über öffentlichen Cache gefunden für ${name} (${taxonId}/${assessmentId})`);
        return cached;
      }
    } catch (error) {
      logger.warn(`⚠ IUCN-Cache-Datei für ${name} nicht nutzbar: ${error.message}`);
      throw error;
    }
    return null;
  }

  async function downloadMapForSpecies(speciesEntry, { force = false, allowManual = false, recordAssessment: shouldRecord = true } = {}) {
    const name = speciesEntry["Deutscher Name"] || speciesEntry["Wissenschaftlicher Name"];
    const safeName = sanitizeAssetName(name);
    const assessmentId = speciesEntry["Assessment ID"];
    if (!assessmentId || assessmentId === "n/a") {
      logger.log(`⚠ Überspringe ${name}, keine gültige Assessment-ID.`);
      return "n/a";
    }
    const assetDir = speciesAssetDir(safeName);
    ensureDir(assetDir);
    const filePath = path.join(assetDir, "map.jpg");
    const tempFilePath = `${filePath}.tmp`;
    if (fs.existsSync(filePath) && isManualAsset(safeName, "map") && !allowManual) {
      logger.log(`ℹ Manuell gepflegte Karte für ${name} ist geschützt, überspringe Download.`);
      return "ok";
    }
    if (!force && fs.existsSync(filePath) && isAssessmentCurrent(safeName, assessmentId)) {
      logger.log(`ℹ Karte für ${name} ist bereits aktuell, überspringe Download.`);
      return "ok";
    }
    logger.log(`→ Lade Karte für ${name} (${assessmentId})`);
    try {
      const taxonId = numericId(
        speciesEntry.sis_id || speciesEntry.sis_taxon_id || speciesEntry.taxon_id || speciesEntry["Taxon ID"],
      );
      const cacheFile = taxonId ? `T${taxonId}A${assessmentId}.jpg` : "";
      let buffer = null;
      for (const url of [
        `https://www.iucnredlist.org/api/v4/assessments/${assessmentId}/distribution_map/jpg`,
        `https://iucnredlist.org/api/v4/assessments/${assessmentId}/distribution_map/jpg`,
        `${baseUrl}/assessments/${assessmentId}/distribution_map/jpg`,
      ]) {
        buffer = await fetchValidJpeg(url, { cacheFile });
        if (buffer) break;
      }
      if (!buffer) {
        logger.warn(`⚠ Direkte IUCN-Karte für ${name} nicht gefunden oder ungültig; versuche Cache-Fallback.`);
        buffer = await fetchCachedMap(speciesEntry, assessmentId, name);
      }
      if (!buffer) {
        logger.warn(`⚠ Keine gültige Kartendatei für ${name} gefunden; vorhandene Karte bleibt erhalten.`);
        return "missing";
      }
      fs.writeFileSync(tempFilePath, buffer);
      fs.renameSync(tempFilePath, filePath);
      logger.log(`✔ Karte gespeichert: ${filePath}`);
      if (shouldRecord) recordAssessment(safeName, assessmentId);
      return "ok";
    } catch (error) {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      if (error.code === "IUCN_BROWSER_REQUIRED") {
        logger.warn(`⚠ Keine gültige Kartendatei für ${name} automatisch abrufbar. ${error.message}`);
        return "missing";
      }
      logger.error(`❌ Fehler beim Download der Karte für ${name}: ${error.message}`);
      logError(`Fehler beim Download der Karte für ${name}: ${error.message}`);
      return "error";
    }
  }

  return Object.freeze({ downloadMapForSpecies, fetchValidJpeg });
}
