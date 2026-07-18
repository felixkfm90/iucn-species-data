import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const defaultExecFile = promisify(execFile);

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
  tempRoot = os.tmpdir(),
  logger = console,
  powerShellRetryAttempts = 3,
  powerShellRetryDelayMs = 1_500,
} = {}) {
  if (typeof fetch !== "function") throw new TypeError("IUCN-Kartenadapter benötigt fetch.");
  if (typeof iucnGET !== "function") throw new TypeError("IUCN-Kartenadapter benötigt iucnGET.");
  if (typeof sleep !== "function") throw new TypeError("IUCN-Kartenadapter benötigt sleep.");

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
    const host = new URL(url).hostname.toLowerCase();
    const headers = {
      Accept: "image/jpeg,image/*;q=0.9,text/html;q=0.8,*/*;q=0.7",
      "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    };
    if (token && (host === "api.iucnredlist.org" || host === "www.iucnredlist.org" || host.endsWith(".iucnredlist.org"))) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  function canUsePowerShell(url) {
    if (platform !== "win32") return false;
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase() === "www.iucnredlist.org"
      && parsed.pathname.includes("/api/v4/assessments/")
      && parsed.pathname.endsWith("/distribution_map/jpg");
  }

  function removeQuietly(filePath) {
    try {
      if (fs.existsSync(filePath)) fs.rmSync(filePath, { recursive: true, force: true });
    } catch {
      // Temporäre Dateien sind für den nächsten Lauf nicht relevant.
    }
  }

  async function fetchWithPowerShell(url) {
    if (!canUsePowerShell(url)) return null;
    const script = `
$Uri = $env:IUCN_MAP_URL
$OutFile = $env:IUCN_MAP_OUTFILE
if (-not $Uri -or -not $OutFile) { throw 'IUCN_MAP_URL oder IUCN_MAP_OUTFILE fehlt.' }
$headers = @{
  Accept = 'image/jpeg,image/*;q=0.9,text/html;q=0.8,*/*;q=0.7'
  'Accept-Language' = 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7'
  'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
}
if ($env:IUCN_TOKEN) { $headers.Authorization = 'Bearer ' + $env:IUCN_TOKEN }
try {
  $response = Invoke-WebRequest -UseBasicParsing -MaximumRedirection 5 -Uri $Uri -Headers $headers -OutFile $OutFile -ErrorAction Stop
  $file = Get-Item -LiteralPath $OutFile -ErrorAction Stop
  $status = 200
  $contentType = ''
  if ($response) {
    if ($response.StatusCode) { $status = [int]$response.StatusCode }
    if ($response.Headers -and $response.Headers['Content-Type']) { $contentType = ($response.Headers['Content-Type'] -join ';') }
  }
  [pscustomobject]@{ status = $status; contentType = $contentType; length = [int64]$file.Length } | ConvertTo-Json -Compress
  exit 0
} catch {
  $status = $null
  if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
  [pscustomobject]@{ status = $status; error = $_.Exception.Message } | ConvertTo-Json -Compress
  exit 1
}`.trim();
    let lastMessage = "";
    for (let attempt = 1; attempt <= powerShellRetryAttempts; attempt++) {
      const tempDir = fs.mkdtempSync(path.join(tempRoot, "iucn-map-"));
      const tempFile = path.join(tempDir, "map.jpg");
      try {
        const { stdout } = await execFileAsync(
          "powershell.exe",
          ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
          {
            env: { ...process.env, IUCN_MAP_URL: url, IUCN_MAP_OUTFILE: tempFile },
            maxBuffer: 1024 * 1024,
            timeout: 60_000,
          },
        );
        const info = JSON.parse(String(stdout || "{}"));
        const buffer = fs.existsSync(tempFile) ? fs.readFileSync(tempFile) : Buffer.alloc(0);
        if (info.status === 200 && buffer.length >= 10_000 && isJpegBuffer(buffer)) {
          logger.log(attempt > 1
            ? `↪ IUCN-Karte über Windows-WebRequest-Fallback geladen (Versuch ${attempt}).`
            : "↪ IUCN-Karte über Windows-WebRequest-Fallback geladen.");
          return buffer;
        }
        lastMessage = `keine gültige Karte (${info.status ?? "unbekannt"})`;
      } catch (error) {
        const output = String(error.stdout || error.stderr || "").trim();
        lastMessage = error.message;
        if (output) {
          try {
            lastMessage = JSON.parse(output).error || lastMessage;
          } catch {
            lastMessage = output.slice(0, 200);
          }
        }
      } finally {
        removeQuietly(tempDir);
      }
      if (attempt < powerShellRetryAttempts) {
        logger.warn(`⚠ Windows-WebRequest-Fallback für IUCN-Karte fehlgeschlagen (Versuch ${attempt}/${powerShellRetryAttempts}): ${lastMessage}. Neuer Versuch folgt.`);
        await sleep(powerShellRetryDelayMs * attempt);
      }
    }
    logger.warn(`⚠ Windows-WebRequest-Fallback für IUCN-Karte nicht nutzbar: ${lastMessage || "unbekannter Fehler"}`);
    return null;
  }

  async function fetchValidJpeg(url, { cacheFile = "", seen = new Set() } = {}) {
    if (seen.has(url)) return null;
    seen.add(url);
    let response;
    try {
      response = await fetch(url, { headers: requestHeaders(url), redirect: "follow" });
    } catch (error) {
      const fallback = await fetchWithPowerShell(url);
      if (fallback) return fallback;
      logger.warn(`⚠ JPEG-Abruf bei ${new URL(url).hostname} fehlgeschlagen: ${error.message}`);
      return null;
    }
    if (!response.ok) {
      const host = new URL(url).hostname;
      const body = await response.text().catch(() => "");
      for (const candidate of extractCachedIucnMapUrls(body, cacheFile)) {
        const cached = await fetchValidJpeg(candidate, { cacheFile, seen });
        if (cached) return cached;
      }
      const fallback = await fetchWithPowerShell(url);
      if (fallback) return fallback;
      if (response.status === 403 && host.includes("iucnredlist.org")) {
        logger.warn("⚠ IUCN-Kartenendpunkt blockiert lokalen Abruf (HTTP 403); prüfe Cache-/Backblaze-Fallback.");
      } else if (response.status === 401 && host.includes("backblazeb2.com")) {
        logger.warn("⚠ IUCN-Cache-Datei benötigt einen signierten Backblaze-Link; öffentlicher Cachepfad ist nicht direkt abrufbar.");
      } else {
        logger.warn(`⚠ JPEG-Abruf fehlgeschlagen (${response.status}) bei ${host}.`);
      }
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length >= 10_000 && isJpegBuffer(buffer)) return buffer;
    const contentType = response.headers.get("content-type") || "";
    if (/text|json|html/i.test(contentType) || buffer.length < 2_000_000) {
      for (const candidate of extractCachedIucnMapUrls(buffer.toString("utf8"), cacheFile)) {
        const cached = await fetchValidJpeg(candidate, { cacheFile, seen });
        if (cached) return cached;
      }
    }
    const fallback = await fetchWithPowerShell(url);
    if (fallback) return fallback;
    logger.warn(`⚠ JPEG-Abruf bei ${new URL(url).hostname} lieferte keine gültige Kartendatei.`);
    return null;
  }

  async function fetchCachedMap(entry, assessmentId, name) {
    const taxonId = await findTaxonId(entry);
    if (!taxonId) return null;
    const cacheFile = `T${taxonId}A${assessmentId}.jpg`;
    try {
      const pageResponse = await fetch(`https://www.iucnredlist.org/species/${taxonId}/${assessmentId}`, {
        headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      });
      if (pageResponse.ok) {
        for (const candidate of extractCachedIucnMapUrls(await pageResponse.text(), cacheFile)) {
          const cached = await fetchValidJpeg(candidate, { cacheFile });
          if (cached) {
            logger.log(`↪ IUCN-Karte über Cache gefunden für ${name} (${taxonId}/${assessmentId})`);
            return cached;
          }
        }
      }
    } catch (error) {
      logger.warn(`⚠ IUCN-Cache-Seite für ${name} nicht nutzbar: ${error.message}`);
    }
    try {
      const cached = await fetchValidJpeg(
        `https://f002.backblazeb2.com/file/cached-individual-maps/${cacheFile}`,
        { cacheFile },
      );
      if (cached) {
        logger.log(`↪ IUCN-Karte über öffentlichen Cache gefunden für ${name} (${taxonId}/${assessmentId})`);
        return cached;
      }
    } catch (error) {
      logger.warn(`⚠ IUCN-Cache-Datei für ${name} nicht nutzbar: ${error.message}`);
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
      logger.error(`❌ Fehler beim Download der Karte für ${name}: ${error.message}`);
      logError(`Fehler beim Download der Karte für ${name}: ${error.message}`);
      return "error";
    }
  }

  return Object.freeze({ downloadMapForSpecies, fetchValidJpeg });
}
