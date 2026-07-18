import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { inspectMp3Buffer } from "../scripts/audio-format.mjs";
import {
  buildPortraitPrompt,
  portraitPromptSha256,
} from "../scripts/portrait-generator.mjs";
import { resolveFfmpegPath } from "../scripts/spectrogram-renderer.mjs";
import { assertPublicHttpUrl } from "./request-security.mjs";

const APP_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(APP_DIR, "..");
const MAX_MAP_BYTES = 20 * 1024 * 1024;
const MAP_SOURCE_FETCH_TIMEOUT_MS = 30_000;
const MAP_SOURCE_POWERSHELL_RETRY_ATTEMPTS = 3;
const MAP_SOURCE_POWERSHELL_RETRY_DELAY_MS = 1500;
const MAX_SOUND_BYTES = 50 * 1024 * 1024;
const MAX_PORTRAIT_BYTES = 20 * 1024 * 1024;
export const MAX_PORTRAIT_INSTRUCTIONS_LENGTH = 800;
const execFileAsync = promisify(execFile);

export function inspectJpeg(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    throw new Error("JPEG-Datei ist zu klein oder unlesbar");
  }
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
    throw new Error("Dateisignatur ist kein JPEG");
  }

  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      throw new Error("JPEG-Struktur ist beschädigt");
    }
    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) throw new Error("JPEG-Bildinformationen sind unvollständig");
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      if (!width || !height) throw new Error("JPEG-Abmessungen sind ungültig");
      return { width, height };
    }
    offset += segmentLength;
  }
  throw new Error("JPEG-Abmessungen konnten nicht gelesen werden");
}

export function inspectPng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (
    !Buffer.isBuffer(buffer)
    || buffer.length < 24
    || !buffer.subarray(0, 8).equals(signature)
    || buffer.subarray(12, 16).toString("ascii") !== "IHDR"
  ) {
    throw new Error("Dateisignatur ist kein gültiges PNG");
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!width || !height) throw new Error("PNG-Abmessungen sind ungültig");
  return { width, height };
}

export function inspectMp3(buffer) {
  return inspectMp3Buffer(buffer);
}

export function inspectWebp(buffer) {
  if (
    !Buffer.isBuffer(buffer)
    || buffer.length < 12
    || buffer.subarray(0, 4).toString("ascii") !== "RIFF"
    || buffer.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    throw new Error("Datei ist kein gültiges WebP");
  }
  const chunk = buffer.subarray(12, 16).toString("ascii");
  let width = 0;
  let height = 0;
  if (chunk === "VP8X" && buffer.length >= 30) {
    width = 1 + buffer.readUIntLE(24, 3);
    height = 1 + buffer.readUIntLE(27, 3);
  } else if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
    width = 1 + buffer[21] + ((buffer[22] & 0x3f) << 8);
    height = 1 + (buffer[22] >> 6) + (buffer[23] << 2) + ((buffer[24] & 0x0f) << 10);
  } else if (
    chunk === "VP8 "
    && buffer.length >= 30
    && buffer[23] === 0x9d
    && buffer[24] === 0x01
    && buffer[25] === 0x2a
  ) {
    width = buffer.readUInt16LE(26) & 0x3fff;
    height = buffer.readUInt16LE(28) & 0x3fff;
  }
  return {
    signature: "RIFF/WEBP",
    ...(width && height ? { width, height } : {}),
  };
}

function inspectPortraitImage(buffer, originalName) {
  const extension = extname(String(originalName ?? "")).toLocaleLowerCase("en");
  if (extension === ".png") {
    return { format: "png", ...inspectPng(buffer) };
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return { format: "jpeg", ...inspectJpeg(buffer) };
  }
  if (extension === ".webp") {
    const inspected = inspectWebp(buffer);
    if (!inspected.width || !inspected.height) {
      throw new Error("WebP-Abmessungen konnten nicht gelesen werden");
    }
    return { format: "webp", width: inspected.width, height: inspected.height };
  }
  throw new Error("Es sind nur PNG-, JPEG- oder WebP-Dateien erlaubt");
}

function inspectMapUploadImage(buffer, originalName) {
  const extension = extname(String(originalName ?? "")).toLocaleLowerCase("en");
  if (extension === ".png") {
    return { format: "png", ...inspectPng(buffer) };
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return { format: "jpeg", ...inspectJpeg(buffer) };
  }
  throw new Error("Es sind nur JPEG- oder PNG-Dateien erlaubt");
}

export async function renderMapJpeg({
  inputPath,
  outputPath,
  ffmpegPath = resolveFfmpegPath(),
}) {
  await mkdir(dirname(outputPath), { recursive: true });
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    outputPath,
  ];

  const run = await new Promise((resolveRun) => {
    const child = spawn(ffmpegPath, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolveRun({ status: 1, stderr: `${stderr}${error.message}` });
    });
    child.on("close", (status) => {
      resolveRun({ status: Number.isInteger(status) ? status : 1, stderr });
    });
  });
  if (run.status !== 0) {
    const error = new Error(
      `Karte konnte nicht nach JPEG konvertiert werden: ${run.stderr.trim() || `ffmpeg exit ${run.status}`}`,
    );
    error.code = "MAP_RENDER_FAILED";
    throw error;
  }

  const outputStat = await stat(outputPath);
  return {
    outputBytes: outputStat.size,
    ffmpegPath,
  };
}

export function validatePortraitPreviewPayload(payload, species) {
  const originalName = String(payload?.originalName ?? "").trim();
  const imageBase64 = String(payload?.imageBase64 ?? "").trim();
  const additionalInstructions = String(payload?.additionalInstructions ?? "").trim();
  const errors = [];
  if (!originalName) errors.push("Dateiname fehlt");
  if (!imageBase64) errors.push("Bilddatei fehlt");
  if (additionalInstructions.length > MAX_PORTRAIT_INSTRUCTIONS_LENGTH) {
    errors.push(
      `Zusätzliche Hinweise dürfen maximal ${MAX_PORTRAIT_INSTRUCTIONS_LENGTH} Zeichen enthalten`,
    );
  }
  let buffer = Buffer.alloc(0);
  let image = null;
  if (imageBase64) {
    try {
      buffer = Buffer.from(imageBase64, "base64");
      if (!buffer.length) throw new Error("Bilddatei ist leer");
      if (buffer.length > MAX_PORTRAIT_BYTES) {
        throw new Error("Bilddatei darf maximal 20 MB groß sein");
      }
      image = inspectPortraitImage(buffer, originalName);
      if (image.width < 800 || image.height < 1000) {
        throw new Error("Bild muss mindestens 800 × 1000 Pixel groß sein");
      }
      const ratio = image.width / image.height;
      if (Math.abs(ratio - 0.8) > 0.025) {
        throw new Error(
          `Bildformat muss 4:5 sein; erkannt wurden ${image.width} × ${image.height} Pixel`,
        );
      }
    } catch (error) {
      errors.push(error.message);
    }
  }
  const prompt = buildPortraitPrompt({
    germanName: species.germanName,
    scientificName: species.scientificName,
    additionalInstructions,
  });
  return {
    originalName,
    buffer,
    image,
    additionalInstructions,
    prompt,
    promptSha256: portraitPromptSha256(prompt),
    errors,
  };
}

export function isNonCommercialLicense(value) {
  const normalized = String(value ?? "").toLocaleLowerCase("de");
  return normalized.includes("/by-nc")
    || normalized.includes("noncommercial")
    || normalized.includes("non-commercial");
}

export function validateSoundPreviewPayload(payload, species) {
  const originalName = String(payload?.originalName ?? "").trim();
  const audioBase64 = String(payload?.audioBase64 ?? "").trim();
  const reason = String(payload?.reason ?? "").trim();
  const creditsInput = payload?.credits ?? {};
  const credits = {
    scientific_name: species.scientificName,
    german_name: species.germanName,
    recordist: String(creditsInput.recordist ?? "").trim(),
    country: String(creditsInput.country ?? "").trim(),
    location: String(creditsInput.location ?? "").trim(),
    quality: String(creditsInput.quality ?? "").trim(),
    license: String(creditsInput.license ?? "").trim(),
    source: String(creditsInput.source ?? "").trim(),
    url: String(creditsInput.url ?? "").trim(),
    notes: String(creditsInput.notes ?? "").trim(),
  };
  const errors = [];
  if (!/\.mp3$/i.test(originalName)) errors.push("Es sind nur MP3-Dateien erlaubt");
  if (!audioBase64) errors.push("MP3-Datei fehlt");
  if (reason.length < 5) errors.push("Pflegegrund muss mindestens 5 Zeichen enthalten");
  if (reason.length > 500) errors.push("Pflegegrund darf maximal 500 Zeichen enthalten");
  for (const [key, label, maxLength] of [
    ["recordist", "Aufnahme/Urheber", 500],
    ["source", "Quelle", 500],
    ["url", "Original-URL", 2000],
    ["license", "Lizenz", 2000],
  ]) {
    if (!credits[key]) errors.push(`${label} ist erforderlich`);
    if (credits[key].length > maxLength) errors.push(`${label} ist zu lang`);
  }
  for (const [key, label, maxLength] of [
    ["country", "Land", 240],
    ["location", "Ort", 500],
    ["quality", "Qualität", 120],
    ["notes", "Notizen", 2000],
  ]) {
    if (credits[key].length > maxLength) errors.push(`${label} ist zu lang`);
  }
  for (const [key, label] of [["url", "Original-URL"], ["license", "Lizenz"]]) {
    if (!credits[key]) continue;
    try {
      const parsed = new URL(credits[key]);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        errors.push(`${label} muss mit http:// oder https:// beginnen`);
      }
    } catch {
      errors.push(`${label} ist ungültig`);
    }
  }
  if (errors.length) return { errors };

  let buffer;
  try {
    buffer = Buffer.from(audioBase64, "base64");
  } catch {
    errors.push("MP3-Datei konnte nicht gelesen werden");
    return { errors };
  }
  if (!buffer.length) errors.push("MP3-Datei ist leer");
  if (buffer.length > MAX_SOUND_BYTES) errors.push("MP3-Datei darf maximal 50 MB groß sein");
  let inspection = null;
  if (!errors.length) {
    try {
      inspection = inspectMp3(buffer);
    } catch (error) {
      errors.push(error.message);
    }
  }
  return {
    errors,
    originalName,
    reason,
    credits,
    buffer,
    inspection,
    isNc: isNonCommercialLicense(credits.license),
  };
}

function mapOriginalNameFromSource(source) {
  try {
    const parsed = new URL(source);
    const name = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
    return /\.jpe?g$/i.test(name) ? name : "source-url.jpg";
  } catch {
    return "source-url.jpg";
  }
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function isIucnDistributionMapUrl(source) {
  try {
    const parsed = new URL(source);
    return process.platform === "win32"
      && parsed.hostname.toLowerCase() === "www.iucnredlist.org"
      && parsed.pathname.includes("/api/v4/assessments/")
      && parsed.pathname.endsWith("/distribution_map/jpg");
  } catch {
    return false;
  }
}

function isJpegBuffer(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff;
}

async function fetchMapPreviewSourceWithPowerShell(source) {
  if (!isIucnDistributionMapUrl(source)) return null;

  const script = `
$Uri = $env:IUCN_MAP_URL
$OutFile = $env:IUCN_MAP_OUTFILE
if (-not $Uri -or -not $OutFile) {
  throw 'IUCN_MAP_URL oder IUCN_MAP_OUTFILE fehlt.'
}
$headers = @{
  Accept = 'image/jpeg,image/*;q=0.9,text/html;q=0.8,*/*;q=0.7'
  'Accept-Language' = 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7'
  'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
}
if ($env:IUCN_TOKEN) {
  $headers.Authorization = 'Bearer ' + $env:IUCN_TOKEN
}
try {
  $response = Invoke-WebRequest -UseBasicParsing -MaximumRedirection 5 -Uri $Uri -Headers $headers -OutFile $OutFile -ErrorAction Stop
  $file = Get-Item -LiteralPath $OutFile -ErrorAction Stop
  $status = 200
  if ($response -and $response.StatusCode) { $status = [int]$response.StatusCode }
  [pscustomobject]@{ status = $status; length = [int64]$file.Length } | ConvertTo-Json -Compress
  exit 0
} catch {
  $status = $null
  if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
  [pscustomobject]@{ status = $status; error = $_.Exception.Message } | ConvertTo-Json -Compress
  exit 1
}
`.trim();

  let lastMessage = "";
  for (let attempt = 1; attempt <= MAP_SOURCE_POWERSHELL_RETRY_ATTEMPTS; attempt++) {
    const tempDir = join(tmpdir(), `iucn-map-preview-${randomUUID()}`);
    const tempFile = join(tempDir, "map.jpg");
    await mkdir(tempDir, { recursive: true });
    try {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
        {
          env: {
            ...process.env,
            IUCN_MAP_URL: source,
            IUCN_MAP_OUTFILE: tempFile,
          },
          maxBuffer: 1024 * 1024,
          timeout: 60_000,
        },
      );
      const info = JSON.parse(String(stdout || "{}"));
      const buffer = existsSync(tempFile) ? await readFile(tempFile) : Buffer.alloc(0);
      if (info.status === 200 && buffer.length >= 10_000 && isJpegBuffer(buffer)) {
        return buffer;
      }
      lastMessage = `keine gültige Karte (${info.status ?? "unbekannt"})`;
    } catch (error) {
      const output = String(error.stdout || error.stderr || "").trim();
      lastMessage = error.message;
      if (output) {
        try {
          const parsed = JSON.parse(output);
          lastMessage = parsed.error || lastMessage;
        } catch {
          lastMessage = output.slice(0, 200);
        }
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
    if (attempt < MAP_SOURCE_POWERSHELL_RETRY_ATTEMPTS) {
      await sleep(MAP_SOURCE_POWERSHELL_RETRY_DELAY_MS * attempt);
    }
  }
  throw new Error(
    `IUCN-Karte konnte auch über den Windows-WebRequest-Fallback nicht geladen werden: ${lastMessage || "unbekannter Fehler"}`,
  );
}

async function fetchMapPreviewSource(source) {
  let parsed = await assertPublicHttpUrl(source);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAP_SOURCE_FETCH_TIMEOUT_MS);
  try {
    let response;
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      response = await fetch(parsed, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "image/jpeg,image/*;q=0.8,*/*;q=0.5",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location) throw new Error("Karten-URL lieferte eine Weiterleitung ohne Ziel");
      if (redirects === 5) throw new Error("Karten-URL enthält zu viele Weiterleitungen");
      parsed = await assertPublicHttpUrl(new URL(location, parsed));
    }
    if (!response.ok) {
      const host = parsed.hostname.toLowerCase();
      if (response.status === 403 && host.includes("iucnredlist.org")) {
        throw new Error(
          "IUCN blockiert den lokalen Kartenabruf. Bitte den im Browser geöffneten signierten Backblaze-JPEG-Link als Quellen-URL einfügen.",
        );
      }
      throw new Error(`Karten-URL konnte nicht geladen werden (HTTP ${response.status}).`);
    }
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_MAP_BYTES) {
      throw new Error("JPEG-Datei darf maximal 20 MB groß sein");
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_MAP_BYTES) {
      throw new Error("JPEG-Datei darf maximal 20 MB groß sein");
    }
    if (isIucnDistributionMapUrl(source) && !isJpegBuffer(buffer)) {
      throw new Error("IUCN-Karten-URL lieferte keine gültige JPEG-Datei.");
    }
    return buffer;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Karten-URL hat nicht rechtzeitig geantwortet");
    }
    const fallback = await fetchMapPreviewSourceWithPowerShell(source);
    if (fallback) return fallback;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function normalizeMapUploadToJpeg({
  buffer,
  originalName,
  repoRoot,
  mapImageRenderer,
}) {
  const inspected = inspectMapUploadImage(buffer, originalName);
  if (inspected.format === "jpeg") {
    return {
      buffer,
      dimensions: { width: inspected.width, height: inspected.height },
      inputFormat: "jpeg",
      converted: false,
    };
  }

  const tempDir = join(tmpdir(), `map-upload-${randomUUID()}`);
  const inputPath = join(tempDir, "source.png");
  const outputPath = join(tempDir, "map.jpg");
  await mkdir(tempDir, { recursive: true });
  try {
    await writeFile(inputPath, buffer);
    await mapImageRenderer({
      inputPath,
      outputPath,
      ffmpegPath: resolveFfmpegPath({ repoRoot }),
    });
    const convertedBuffer = await readFile(outputPath);
    const dimensions = inspectJpeg(convertedBuffer);
    return {
      buffer: convertedBuffer,
      dimensions,
      inputFormat: inspected.format,
      converted: true,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function validateMapPreviewPayload(payload, {
  repoRoot = REPO_ROOT,
  mapImageRenderer = renderMapJpeg,
} = {}) {
  const reason = String(payload?.reason ?? "").trim();
  const source = String(payload?.source ?? "").trim();
  let originalName = String(payload?.originalName ?? "").trim();
  const imageBase64 = String(payload?.imageBase64 ?? "").trim();
  const errors = [];

  if (reason.length < 5) errors.push("Pflegegrund muss mindestens 5 Zeichen enthalten");
  if (reason.length > 500) errors.push("Pflegegrund darf maximal 500 Zeichen enthalten");
  if (source) {
    try {
      const parsed = new URL(source);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        errors.push("Quellen-URL muss mit http:// oder https:// beginnen");
      }
    } catch {
      errors.push("Quellen-URL ist ungültig");
    }
  }
  if (source.length > 2000) errors.push("Quellen-URL darf maximal 2000 Zeichen enthalten");
  if (imageBase64 && !/\.(jpe?g|png)$/i.test(originalName)) {
    errors.push("Es sind nur JPEG- oder PNG-Dateien erlaubt");
  }
  if (!imageBase64 && !source) errors.push("JPEG-/PNG-Datei oder direkter JPEG-Link fehlt");
  if (errors.length) return { errors };

  let buffer;
  let dimensions = null;
  let inputFormat = "";
  let converted = false;
  if (imageBase64) {
    try {
      buffer = Buffer.from(imageBase64, "base64");
    } catch {
      errors.push("Karten-Datei konnte nicht gelesen werden");
      return { errors };
    }
    try {
      const normalized = await normalizeMapUploadToJpeg({
        buffer,
        originalName,
        repoRoot,
        mapImageRenderer,
      });
      buffer = normalized.buffer;
      dimensions = normalized.dimensions;
      inputFormat = normalized.inputFormat;
      converted = normalized.converted;
    } catch (error) {
      errors.push(error.message || "Karten-Datei konnte nicht verarbeitet werden");
    }
  } else {
    try {
      buffer = await fetchMapPreviewSource(source);
      originalName = mapOriginalNameFromSource(source);
    } catch (error) {
      errors.push(error.message || "Karten-URL konnte nicht geladen werden");
      return { errors };
    }
  }
  if (!buffer?.length) errors.push("Karten-Datei ist leer");
  if (buffer?.length > MAX_MAP_BYTES) errors.push("Karten-Datei darf maximal 20 MB groß sein");
  if (!errors.length && !dimensions) {
    try {
      dimensions = inspectJpeg(buffer);
    } catch (error) {
      errors.push(error.message);
    }
  }
  return { errors, reason, source, originalName, buffer, dimensions, inputFormat, converted };
}
