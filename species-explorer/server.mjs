import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { buildPipelinePlan } from "../scripts/pipeline-selection.mjs";
import { buildCleanupPlan, runSpeciesCleanup } from "../scripts/species-cleanup.mjs";
import {
  DEFAULT_SPECTROGRAM_OPTIONS,
  renderSpectrogram,
  resolveFfmpegPath,
} from "../scripts/spectrogram-renderer.mjs";
import {
  PORTRAIT_STANDARD,
  buildPortraitPrompt,
  portraitPromptSha256,
} from "../scripts/portrait-generator.mjs";
import {
  DEFAULT_PORTRAIT_OPTIONS,
  renderPortrait,
} from "../scripts/portrait-renderer.mjs";

const APP_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(APP_DIR, "..");
const PUBLIC_DIR = join(APP_DIR, "public");
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4177;
const ASSET_FILES = new Set([
  "map.jpg",
  "sound.mp3",
  "credits.json",
  "spectrogram.webp",
  "portrait.webp",
  "portrait.json",
]);
const EDITABLE_NAME_FIELD = { key: "germanName", sourceKey: "german", label: "Deutscher Name", maxLength: 160 };
const EDITABLE_SCIENTIFIC_FIELD = {
  key: "scientificName",
  label: "Wissenschaftlicher Name",
  maxLength: 201,
};
const EDITABLE_FIELD_DEFINITIONS = [
  { key: "size", sourceKey: "size", label: "Größe", maxLength: 240 },
  { key: "weight", sourceKey: "weight", label: "Gewicht", maxLength: 240 },
  {
    key: "lifeExpectancy",
    sourceKey: "life_expectancy",
    label: "Lebenserwartung",
    maxLength: 240,
  },
];
const NEW_SPECIES_FIELD_DEFINITIONS = [
  { key: "german", label: "Deutscher Name", maxLength: 160 },
  { key: "scientificName", label: "Wissenschaftlicher Name", maxLength: 201 },
  ...EDITABLE_FIELD_DEFINITIONS.map((field) => ({
    key: field.key,
    label: field.label,
    maxLength: field.maxLength,
  })),
];
const PREVIEW_TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_JSON_BODY_BYTES = 16 * 1024;
const MAX_MAP_BYTES = 20 * 1024 * 1024;
const MAX_MAP_PREVIEW_BODY_BYTES = 28 * 1024 * 1024;
const MAP_SOURCE_FETCH_TIMEOUT_MS = 30_000;
const MAP_SOURCE_POWERSHELL_RETRY_ATTEMPTS = 3;
const MAP_SOURCE_POWERSHELL_RETRY_DELAY_MS = 1500;
const MAX_SOUND_BYTES = 50 * 1024 * 1024;
const MAX_SOUND_PREVIEW_BODY_BYTES = 68 * 1024 * 1024;
const MAX_PORTRAIT_BYTES = 20 * 1024 * 1024;
const MAX_PORTRAIT_PREVIEW_BODY_BYTES = 28 * 1024 * 1024;
const MAX_PORTRAIT_INSTRUCTIONS_LENGTH = 800;
const BACKUP_RETENTION_COUNT = 20;
const ASSET_BACKUP_RETENTION_COUNT = 1;
const ASSET_BACKUP_GLOBAL_BYTES = 500 * 1024 * 1024;
const PIPELINE_LOG_RETENTION_COUNT = 20;
const PIPELINE_LOG_LINE_LIMIT = 400;
const BACKUP_LOG_LINE_LIMIT = 400;
const DEFAULT_NAS_BACKUP_ROOT = "W:\\Website Datenbank Backup";
const LOCAL_SETTINGS_FILE = "local-settings.json";
const execFileAsync = promisify(execFile);
const MAX_BACKUP_ROOT_LENGTH = 500;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".webp": "image/webp",
};
const activeFileStreams = new Set();

function closeActiveFileStreams(predicate = () => true) {
  for (const entry of [...activeFileStreams]) {
    if (!predicate(entry.path)) continue;
    entry.stream.destroy();
    activeFileStreams.delete(entry);
  }
}

export function formatSpectrogramPipelineLog(stdoutText) {
  const raw = String(stdoutText ?? "").trim();
  if (!raw) return "";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }

  const entries = Array.isArray(parsed.results)
    ? parsed.results
    : Array.isArray(parsed.jobs)
      ? parsed.jobs
      : [];
  if (!entries.length) {
    return parsed.error
      ? `Spektrogramm-Abgleich: Fehler - ${parsed.error}`
      : "Spektrogramm-Abgleich: Keine Arten verarbeitet.";
  }

  const counts = {
    generated: 0,
    skipped: 0,
    missingSound: 0,
    failed: 0,
  };
  const lines = ["Spektrogramm-Abgleich:"];
  for (const entry of entries) {
    const status = String(entry.status ?? entry.action ?? "");
    const reason = String(entry.stderr || entry.reason || "").trim();
    const hasSound = status !== "missing-mp3" && Number(entry.inputBytes ?? 0) > 0;
    let spectrogramStatus = status || "geprüft";
    if (status === "generated") {
      counts.generated += 1;
      spectrogramStatus = "wurde erstellt";
    } else if (status === "skip") {
      counts.skipped += 1;
      spectrogramStatus = "vorhanden";
    } else if (status === "missing-mp3") {
      counts.missingSound += 1;
      spectrogramStatus = "übersprungen";
    } else if (status === "failed") {
      counts.failed += 1;
      spectrogramStatus = `Fehler${reason ? ` - ${reason}` : ""}`;
    } else if (status === "generate") {
      spectrogramStatus = "würde erstellt";
    }
    lines.push(
      `${entry.safeName ?? "Unbekannte Art"}`,
      `  Sound: ${hasSound ? "vorhanden" : "fehlt"}`,
      `  Spektrogramm: ${spectrogramStatus}`,
    );
  }
  lines.push(
    `Zusammenfassung: ${counts.generated} erstellt, ${counts.skipped} vorhanden, ${counts.missingSound} ohne Sound, ${counts.failed} Fehler.`,
  );
  if (parsed.hashRegistry) {
    lines.push(
      `Hashregister: ${parsed.hashRegistry.updated ?? 0} geprüft${parsed.hashRegistry.changed ? " und aktualisiert" : ""}.`,
    );
  }
  return lines.join("\n");
}

function sanitizeAssetName(input) {
  return String(input ?? "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "Ae")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "Oe")
    .replace(/ø/g, "o")
    .replace(/Ø/g, "O")
    .replace(/å/g, "a")
    .replace(/Å/g, "A")
    .replace(/ð/g, "d")
    .replace(/Ð/g, "D")
    .replace(/þ/g, "th")
    .replace(/Þ/g, "Th")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/&/g, " and ")
    .replace(/@/g, " at ")
    .replace(/\+/g, " plus ")
    .replace(/[’‘‚‛]/g, "'")
    .replace(/[“”„‟]/g, "\"")
    .replace(/[–—−]/g, "-")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\/\\:*?"<>|]/g, "_")
    .replace(/[\x00-\x1F\x7F]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/_+/g, "_")
    .trim()
    .replace(/^[.\s_-]+|[.\s_-]+$/g, "") || "unknown";
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

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

async function fileInfo(path) {
  try {
    const details = await stat(path);
    return { exists: details.isFile(), bytes: details.size };
  } catch {
    return { exists: false, bytes: 0 };
  }
}

function parseManualMapOverrides(markdown) {
  const safeNames = new Set();
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^\|\s*[^|]+\|\s*([^|]+?)\s*\|\s*`species-assets\/([^/]+)\/map\.jpg`/);
    if (match) safeNames.add(match[2].trim());
  }
  return safeNames;
}

export function synchronizeManualMapDocumentation(
  markdown,
  assetOverrides,
  updatedDate = new Date().toISOString().slice(0, 10),
) {
  const lines = markdown.split(/\r?\n/);
  const manualMapRow = (safeName, map) => {
    const cell = (value) => String(value ?? "").replace(/\|/g, "/").trim();
    const source = map.source
      ? `[Quelle](${String(map.source).replace(/\|/g, "%7C").replace(/\)/g, "%29")})`
      : "Manuell über Arten-Explorer gepflegt.";
    return `| ${cell(map.germanName || safeName)} | ${cell(safeName)} | \`species-assets/${safeName}/map.jpg\` | ${cell(map.reason || "Manuell gepflegte Karte.")} | ${source} | ${updatedDate} | erledigt/geprueft |`;
  };
  const filtered = [];
  for (const line of lines) {
    const match = line.match(
      /^\|\s*[^|]+\|\s*([^|]+?)\s*\|\s*`species-assets\/([^/]+)\/map\.jpg`/,
    );
    if (!match) {
      filtered.push(line);
      continue;
    }
    const safeName = match[2].trim();
    const map = assetOverrides.assets?.[safeName]?.map;
    if (!map || map.manual === false) continue;
    filtered.push(map?.manual === true && (map.source || map.importedAt)
      ? manualMapRow(safeName, map)
      : line);
  }
  const documented = new Set();
  for (const line of filtered) {
    const match = line.match(/`species-assets\/([^/]+)\/map\.jpg`/);
    if (match) documented.add(match[1]);
  }
  const addedRows = Object.entries(assetOverrides.assets ?? {})
    .filter(([safeName, entry]) => entry?.map?.manual === true && !documented.has(safeName))
    .sort(([left], [right]) => left.localeCompare(right, "de"))
    .map(([safeName, entry]) => manualMapRow(safeName, entry.map));
  if (addedRows.length) {
    const rulesIndex = filtered.findIndex((line) => line.trim() === "## Pflege-Regeln");
    const insertAt = rulesIndex >= 0 ? rulesIndex : filtered.length;
    const prefix = filtered.slice(0, insertAt);
    const suffix = filtered.slice(insertAt);
    while (prefix.length && prefix.at(-1) === "") prefix.pop();
    filtered.splice(0, filtered.length, ...prefix, ...addedRows, "", ...suffix);
  }
  const remainingCount = filtered.filter((line) => (
    /^\|\s*[^|]+\|\s*[^|]+\|\s*`species-assets\/[^/]+\/map\.jpg`/.test(line)
  )).length;
  const hadFinalNewline = markdown.endsWith("\n");
  const mapLabel = remainingCount === 1 ? "Karte" : "Karten";
  const next = filtered
    .join("\n")
    .replace(/^Stand:\s*\d{4}-\d{2}-\d{2}$/m, `Stand: ${updatedDate}`)
    .replace(
      /Aktuell sind .*? Karten? als manuell gepflegt dokumentiert\./,
      `Aktuell sind ${remainingCount} ${mapLabel} als manuell gepflegt dokumentiert.`,
    );
  return hadFinalNewline && !next.endsWith("\n") ? `${next}\n` : next;
}

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
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    throw new Error("MP3-Datei ist zu klein oder unlesbar");
  }

  let scanStart = 0;
  let hasId3 = false;
  if (buffer.length >= 10 && buffer.subarray(0, 3).toString("ascii") === "ID3") {
    hasId3 = true;
    const sizeBytes = buffer.subarray(6, 10);
    if ([...sizeBytes].some((value) => value > 0x7f)) {
      throw new Error("ID3-Kopf ist beschädigt");
    }
    const tagSize = (
      (sizeBytes[0] << 21)
      | (sizeBytes[1] << 14)
      | (sizeBytes[2] << 7)
      | sizeBytes[3]
    );
    const footerBytes = (buffer[5] & 0x10) === 0x10 ? 10 : 0;
    scanStart = 10 + tagSize + footerBytes;
    if (scanStart >= buffer.length - 3) {
      throw new Error("MP3-Datei enthält nur ID3-Daten, aber keinen Audiostream");
    }
  }

  const scanLimit = Math.min(buffer.length - 3, scanStart + 64 * 1024);
  for (let index = scanStart; index <= scanLimit; index += 1) {
    const byte1 = buffer[index + 1];
    const byte2 = buffer[index + 2];
    const version = (byte1 >> 3) & 0x03;
    const layer = (byte1 >> 1) & 0x03;
    const bitrate = (byte2 >> 4) & 0x0f;
    const sampleRate = (byte2 >> 2) & 0x03;
    if (
      buffer[index] === 0xff
      && (byte1 & 0xe0) === 0xe0
      && version !== 0x01
      && layer !== 0x00
      && bitrate !== 0x00
      && bitrate !== 0x0f
      && sampleRate !== 0x03
    ) {
      return {
        signature: hasId3 ? "ID3 + MPEG frame" : "MPEG frame",
        frameOffset: index,
      };
    }
  }
  throw new Error("Kein plausibler MPEG-Audioframe gefunden");
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

async function renderMapJpeg({
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

function validatePortraitPreviewPayload(payload, species) {
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

function isNonCommercialLicense(value) {
  const normalized = String(value ?? "").toLocaleLowerCase("de");
  return normalized.includes("/by-nc")
    || normalized.includes("noncommercial")
    || normalized.includes("non-commercial");
}

function validateSoundPreviewPayload(payload, species) {
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

function scientificKey(genus, species) {
  return `${genus ?? ""} ${species ?? ""}`.trim().toLocaleLowerCase("de");
}

function valueOrUnknown(value) {
  if (value === null || value === undefined || value === "") return "Unbekannt";
  return value;
}

function formatTaxonomyName(value) {
  const text = String(value ?? "").trim();
  if (!text || ["n/a", "unbekannt"].includes(text.toLocaleLowerCase("de"))) {
    return valueOrUnknown(value);
  }
  return text
    .toLocaleLowerCase("de")
    .replace(/(^|[\s-])([\p{L}])/gu, (_match, prefix, letter) => (
      `${prefix}${letter.toLocaleUpperCase("de")}`
    ));
}

function hashText(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isWindowsFileLockError(error) {
  const code = String(error?.code ?? "").toUpperCase();
  const message = String(error?.message ?? "").toLowerCase();
  return (
    ["EPERM", "EBUSY", "EACCES", "ENOTEMPTY"].includes(code)
    || message.includes("operation not permitted")
    || message.includes("permission denied")
    || message.includes("access is denied")
    || message.includes("zugriff verweigert")
  );
}

async function fileSha256(filePath) {
  try {
    return createHash("sha256").update(await readFile(filePath)).digest("hex");
  } catch (error) {
    if (!isWindowsFileLockError(error)) throw error;
    return "";
  }
}

function isSha256(value) {
  return /^[0-9a-f]{64}$/i.test(String(value ?? ""));
}

function compactTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function repoRelativePath(repoRoot, filePath) {
  return relative(repoRoot, filePath).replace(/\\/g, "/");
}

function assetBackupFileNames(assetType) {
  if (assetType === "map") return ["map.jpg"];
  if (assetType === "sound") return ["sound.mp3", "credits.json", "spectrogram.webp"];
  if (assetType === "portrait") return ["portrait.webp", "portrait.json"];
  return [];
}

async function readBackupMetadata(backupPath) {
  const metadataPath = join(backupPath, "backup.json");
  try {
    return JSON.parse(await readFile(metadataPath, "utf8"));
  } catch {
    return {};
  }
}

async function writeManagedAssetBackup({
  repoRoot,
  assetBackupRoot,
  species,
  assetType,
  files,
  metadata = {},
}) {
  const backupDirectory = join(assetBackupRoot, species.safeName, assetType);
  const tempDirectory = join(assetBackupRoot, species.safeName, `${assetType}.tmp-${randomUUID()}`);
  await rm(tempDirectory, { recursive: true, force: true });
  await mkdir(tempDirectory, { recursive: true });
  try {
    for (const file of files) {
      if (!file.buffer?.length) continue;
      await writeFile(join(tempDirectory, file.fileName), file.buffer);
    }
    await writeFile(
      join(tempDirectory, "backup.json"),
      `${JSON.stringify({
        version: 1,
        assetType,
        safeName: species.safeName,
        germanName: species.germanName,
        createdAt: new Date().toISOString(),
        ...metadata,
      }, null, 2)}\n`,
      "utf8",
    );
    await rm(backupDirectory, { recursive: true, force: true });
    await rename(tempDirectory, backupDirectory);
    return repoRelativePath(repoRoot, backupDirectory);
  } catch (error) {
    await rm(tempDirectory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function pruneSpeciesListBackups(backupDir, keepCount = BACKUP_RETENTION_COUNT) {
  const entries = await readdir(backupDir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => (
      entry.isFile()
      && /^species_list-\d{8}T\d{6}Z-.+-[0-9a-f]{8}\.json$/.test(entry.name)
    ))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, "en"));
  const remove = candidates.slice(keepCount);
  await Promise.all(remove.map((name) => unlink(join(backupDir, name))));
  return {
    kept: Math.min(candidates.length, keepCount),
    removed: remove.length,
  };
}

async function prunePipelineLogs(logDir, keepCount = PIPELINE_LOG_RETENTION_COUNT) {
  const entries = await readdir(logDir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && /^pipeline-\d{8}T\d{6}Z-[0-9a-f]{8}\.log$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, "en"));
  const remove = candidates.slice(keepCount);
  await Promise.all(remove.map((name) => unlink(join(logDir, name))));
}

async function collectManagedAssetBackups(assetBackupRoot) {
  if (!existsSync(assetBackupRoot)) return [];
  const collected = [];
  const speciesDirectories = await readdir(assetBackupRoot, { withFileTypes: true });
  for (const speciesDirectory of speciesDirectories) {
    if (!speciesDirectory.isDirectory()) continue;
    const speciesPath = join(assetBackupRoot, speciesDirectory.name);
    const assetDirectories = await readdir(speciesPath, { withFileTypes: true });
    for (const assetDirectory of assetDirectories) {
      if (!assetDirectory.isDirectory()) continue;
      if (!["map", "sound", "portrait"].includes(assetDirectory.name)) continue;
      const assetPath = join(speciesPath, assetDirectory.name);
      const files = await readdir(assetPath, { withFileTypes: true });
      const directFileNames = assetBackupFileNames(assetDirectory.name);
      const directBackupFiles = files.filter((file) => file.isFile() && directFileNames.includes(file.name));
      if (directBackupFiles.length) {
        let bytes = 0;
        let mtimeMs = 0;
        for (const backupFile of directBackupFiles) {
          const details = await stat(join(assetPath, backupFile.name));
          bytes += details.size;
          mtimeMs = Math.max(mtimeMs, details.mtimeMs);
        }
        const metadata = await readBackupMetadata(assetPath);
        collected.push({
          backupPath: assetPath,
          species: speciesDirectory.name,
          assetType: assetDirectory.name,
          name: "latest",
          bytes,
          mtimeMs,
          metadata,
        });
        continue;
      }

      for (const file of files) {
        const backupPath = join(assetPath, file.name);
        if (
          file.isFile()
          && assetDirectory.name === "map"
          && /^map(?:-deleted)?-\d{8}T\d{6}Z-[0-9a-f]{8}\.jpg$/.test(file.name)
        ) {
          const details = await stat(backupPath);
          collected.push({
            backupPath,
            species: speciesDirectory.name,
            assetType: assetDirectory.name,
            name: file.name,
            bytes: details.size,
            mtimeMs: details.mtimeMs,
            metadata: {},
          });
        } else if (
          file.isDirectory()
          && assetDirectory.name === "sound"
          && /^sound(?:-deleted|-rejected)?-\d{8}T\d{6}Z-[0-9a-f]{8}$/.test(file.name)
        ) {
          const backupFiles = await readdir(backupPath, { withFileTypes: true });
          let bytes = 0;
          let mtimeMs = 0;
          for (const backupFile of backupFiles) {
            if (!backupFile.isFile() || !assetBackupFileNames("sound").includes(backupFile.name)) {
              continue;
            }
            const details = await stat(join(backupPath, backupFile.name));
            bytes += details.size;
            mtimeMs = Math.max(mtimeMs, details.mtimeMs);
          }
          collected.push({
            backupPath,
            species: speciesDirectory.name,
            assetType: assetDirectory.name,
            name: file.name,
            bytes,
            mtimeMs,
            metadata: await readBackupMetadata(backupPath),
          });
        } else if (
          file.isDirectory()
          && assetDirectory.name === "portrait"
          && /^portrait(?:-deleted)?-\d{8}T\d{6}Z-[0-9a-f]{8}$/.test(file.name)
        ) {
          const backupFiles = await readdir(backupPath, { withFileTypes: true });
          let bytes = 0;
          let mtimeMs = 0;
          for (const backupFile of backupFiles) {
            if (!backupFile.isFile() || !assetBackupFileNames("portrait").includes(backupFile.name)) {
              continue;
            }
            const details = await stat(join(backupPath, backupFile.name));
            bytes += details.size;
            mtimeMs = Math.max(mtimeMs, details.mtimeMs);
          }
          collected.push({
            backupPath,
            species: speciesDirectory.name,
            assetType: assetDirectory.name,
            name: file.name,
            bytes,
            mtimeMs,
            metadata: await readBackupMetadata(backupPath),
          });
        }
      }
    }
  }
  return collected;
}

async function pruneAssetBackups(assetBackupRoot) {
  const backups = await collectManagedAssetBackups(assetBackupRoot);
  const removePaths = new Set();
  const groups = new Map();
  for (const backup of backups) {
    const key = `${backup.species}:${backup.assetType}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(backup);
  }
  for (const group of groups.values()) {
    group.sort((left, right) => right.mtimeMs - left.mtimeMs || right.name.localeCompare(left.name));
    for (const backup of group.slice(ASSET_BACKUP_RETENTION_COUNT)) {
      removePaths.add(backup.backupPath);
    }
  }

  const retained = backups
    .filter((backup) => !removePaths.has(backup.backupPath))
    .sort((left, right) => left.mtimeMs - right.mtimeMs || left.name.localeCompare(right.name));
  let retainedBytes = retained.reduce((sum, backup) => sum + backup.bytes, 0);
  for (const backup of retained) {
    if (retainedBytes <= ASSET_BACKUP_GLOBAL_BYTES) break;
    removePaths.add(backup.backupPath);
    retainedBytes -= backup.bytes;
  }

  await Promise.all([...removePaths].map((backupPath) => rm(backupPath, { recursive: true, force: true })));
  return {
    kept: backups.length - removePaths.size,
    removed: removePaths.size,
    bytes: retainedBytes,
  };
}

async function latestAssetBackup(assetBackupRoot, repoRoot, safeName, assetType) {
  const backups = await collectManagedAssetBackups(assetBackupRoot);
  const candidates = backups
    .filter((backup) => backup.species === safeName && backup.assetType === assetType)
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.name.localeCompare(left.name));
  const backup = candidates[0] ?? null;
  if (!backup) {
    return {
      exists: false,
      path: "",
      updatedAt: "",
      bytes: 0,
    };
  }
  return {
    exists: true,
    path: repoRelativePath(repoRoot, backup.backupPath),
    updatedAt: new Date(backup.mtimeMs).toISOString(),
    bytes: backup.bytes,
    metadata: backup.metadata ?? {},
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
  const parsed = new URL(source);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAP_SOURCE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(source, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "image/jpeg,image/*;q=0.8,*/*;q=0.5",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });
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

async function validateMapPreviewPayload(payload, {
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

function publicPipelinePlan(plan) {
  return {
    mode: plan.mode,
    inputCount: plan.inputCount,
    targetCount: plan.targetCount,
    targets: plan.targets.map(({ slug, safeName, germanName, scientificName, reasons }) => ({
      slug,
      safeName,
      germanName,
      scientificName,
      reasons,
    })),
    removedCount: plan.removedCount,
    removed: plan.removed,
    pendingFileCount: plan.pendingFileCount ?? 0,
    pendingFiles: Array.isArray(plan.pendingFiles) ? plan.pendingFiles : [],
    pendingAssetSpeciesCount: plan.pendingAssetSpeciesCount ?? 0,
    pendingAssetSpecies: Array.isArray(plan.pendingAssetSpecies) ? plan.pendingAssetSpecies : [],
    affectedSpeciesCount: plan.affectedSpeciesCount ?? plan.targetCount,
    hasWork: plan.hasWork,
  };
}

function publicCleanupPlan(plan) {
  return {
    mode: "cleanup",
    targetCount:
      plan.obsoleteData.length
      + plan.obsoleteAssetDirectories.length
      + plan.obsoleteAssessmentKeys.length
      + plan.obsoleteOverrideKeys.length,
    obsoleteData: plan.obsoleteData,
    obsoleteAssetDirectories: plan.obsoleteAssetDirectories,
    obsoleteAssessmentKeys: plan.obsoleteAssessmentKeys,
    obsoleteOverrideKeys: plan.obsoleteOverrideKeys,
    reclaimableBytes: plan.reclaimableBytes,
    hasWork: plan.hasWork,
  };
}

function validateFieldValue(field, rawValue) {
  const value = String(rawValue ?? "").trim();
  const errors = [];
  if (!value) {
    errors.push(`${field.label} darf nicht leer sein`);
  } else if (value.length > field.maxLength) {
    errors.push(`${field.label} darf maximal ${field.maxLength} Zeichen lang sein`);
  } else if (/[\u0000-\u001F\u007F]/.test(value)) {
    errors.push(`${field.label} enthält unzulässige Steuerzeichen`);
  }
  return { value, errors };
}

function normalizeScientificName(rawValue) {
  const value = String(rawValue ?? "").trim();
  const errors = [];
  const parts = value.split(/\s+/).filter(Boolean);
  if (!value) {
    errors.push(`${EDITABLE_SCIENTIFIC_FIELD.label} darf nicht leer sein`);
  } else if (value.length > EDITABLE_SCIENTIFIC_FIELD.maxLength) {
    errors.push(
      `${EDITABLE_SCIENTIFIC_FIELD.label} darf maximal ${EDITABLE_SCIENTIFIC_FIELD.maxLength} Zeichen lang sein`,
    );
  } else if (/[\u0000-\u001F\u007F]/.test(value)) {
    errors.push(`${EDITABLE_SCIENTIFIC_FIELD.label} enthält unzulässige Steuerzeichen`);
  } else if (
    parts.length !== 2
    || parts.some((part) => !/^[\p{L}][\p{L}-]*$/u.test(part))
  ) {
    errors.push(
      "Wissenschaftlicher Name muss genau aus Gattung und Art-Epitheton bestehen, zum Beispiel Turdus Merula",
    );
  } else if (parts.some((part) => part.length > 100)) {
    errors.push("Gattung und Art-Epitheton dürfen jeweils maximal 100 Zeichen lang sein");
  }
  if (errors.length || parts.length !== 2) {
    return {
      scientificName: value,
      genus: "",
      species: "",
      slug: "",
      errors,
    };
  }
  const [rawGenus, rawSpecies] = parts;
  const genus = rawGenus.charAt(0).toLocaleUpperCase("de") + rawGenus.slice(1).toLocaleLowerCase("de");
  const species = rawSpecies.toLocaleLowerCase("de");
  return {
    scientificName: `${genus} ${species}`,
    genus,
    species,
    slug: `${genus}${species}`.toLocaleLowerCase("de"),
    errors,
  };
}

function validateEditableValues(payload, species = null) {
  const values = {};
  const errors = [];

  const germanName = validateFieldValue(
    EDITABLE_NAME_FIELD,
    payload && Object.hasOwn(payload, EDITABLE_NAME_FIELD.key)
      ? payload?.[EDITABLE_NAME_FIELD.key]
      : species?.germanName,
  );
  values.germanName = germanName.value;
  errors.push(...germanName.errors);

  const scientificName = normalizeScientificName(
    payload && Object.hasOwn(payload, EDITABLE_SCIENTIFIC_FIELD.key)
      ? payload?.[EDITABLE_SCIENTIFIC_FIELD.key]
      : species?.scientificName,
  );
  values.scientificName = scientificName.scientificName;
  values.genus = scientificName.genus;
  values.species = scientificName.species;
  values.slug = scientificName.slug;
  values.scientificNameUnlocked = payload?.scientificNameUnlocked === true;
  errors.push(...scientificName.errors);

  for (const field of EDITABLE_FIELD_DEFINITIONS) {
    const { value, errors: fieldErrors } = validateFieldValue(field, payload?.[field.key]);
    values[field.key] = value;
    errors.push(...fieldErrors);
  }

  return { values, errors };
}

function validateNewSpeciesValues(payload) {
  const values = {};
  const errors = [];
  const fieldErrors = {};
  const addError = (fieldKey, message) => {
    errors.push(message);
    if (!fieldKey) return;
    fieldErrors[fieldKey] ??= [];
    fieldErrors[fieldKey].push(message);
  };

  for (const field of NEW_SPECIES_FIELD_DEFINITIONS) {
    const value = String(payload?.[field.key] ?? "").trim();
    if (!value) {
      addError(field.key, `${field.label} darf nicht leer sein`);
    } else if (value.length > field.maxLength) {
      addError(field.key, `${field.label} darf maximal ${field.maxLength} Zeichen lang sein`);
    } else if (/[\u0000-\u001F\u007F]/.test(value)) {
      addError(field.key, `${field.label} enthält unzulässige Steuerzeichen`);
    }
    values[field.key] = value;
  }

  const scientificParts = values.scientificName.split(/\s+/).filter(Boolean);
  if (
    values.scientificName
    && (
      scientificParts.length !== 2
      || scientificParts.some((part) => !/^[\p{L}][\p{L}-]*$/u.test(part))
    )
  ) {
    addError(
      "scientificName",
      "Wissenschaftlicher Name muss genau aus Gattung und Art-Epitheton bestehen, zum Beispiel Turdus Merula",
    );
  } else if (scientificParts.some((part) => part.length > 100)) {
    addError("scientificName", "Gattung und Art-Epitheton dürfen jeweils maximal 100 Zeichen lang sein");
  } else if (scientificParts.length === 2) {
    const [rawGenus, rawSpecies] = scientificParts;
    values.genus =
      rawGenus.charAt(0).toLocaleUpperCase("de") + rawGenus.slice(1).toLocaleLowerCase("de");
    values.species = rawSpecies.toLocaleLowerCase("de");
    values.scientificName = `${values.genus} ${values.species}`;
  }

  return { values, errors, fieldErrors };
}

function buildNewSpeciesEntry(values) {
  const scientificName = `${values.genus} ${values.species}`;
  return {
    entry: {
      german: values.german,
      genus: values.genus,
      species: values.species,
      size: values.size,
      weight: values.weight,
      life_expectancy: values.lifeExpectancy,
    },
    derived: {
      scientificName,
      slug: `${values.genus}${values.species}`.toLocaleLowerCase("de"),
      safeName: sanitizeAssetName(values.german),
    },
  };
}

function findNewSpeciesCollisions({ inputList, model, entry, derived, repoRoot }) {
  const errors = [];
  const candidateScientificKey = scientificKey(entry.genus, entry.species);
  const candidateGermanName = entry.german.toLocaleLowerCase("de");
  const candidateSafeName = derived.safeName.toLocaleLowerCase("de");
  const candidateSlug = derived.slug.toLocaleLowerCase("de");

  const scientificNameInInput = inputList.some(
    (item) => scientificKey(item.genus, item.species) === candidateScientificKey,
  );
  if (scientificNameInInput) {
    errors.push(`Wissenschaftlicher Name ist bereits vorhanden: ${derived.scientificName}`);
  } else if (model.species.some((item) => (
    item.scientificName.toLocaleLowerCase("de") === derived.scientificName.toLocaleLowerCase("de")
  ))) {
    errors.push(`Wissenschaftlicher Name kollidiert mit bestehenden Daten: ${derived.scientificName}`);
  }
  const germanNameInInput = inputList.some(
    (item) => String(item.german ?? "").trim().toLocaleLowerCase("de") === candidateGermanName,
  );
  if (germanNameInInput) {
    errors.push(`Deutscher Name ist bereits vorhanden: ${entry.german}`);
  } else if (model.species.some(
    (item) => item.germanName.trim().toLocaleLowerCase("de") === candidateGermanName,
  )) {
    errors.push(`Deutscher Name kollidiert mit bestehenden Daten: ${entry.german}`);
  }
  if (model.species.some((item) => (
    item.id.toLocaleLowerCase("de") === candidateSlug
    || item.slug.toLocaleLowerCase("de") === candidateSlug
  ))) {
    errors.push(`URL-Slug ist bereits vorhanden: ${derived.slug}`);
  }
  if (model.species.some((item) => item.safeName.toLocaleLowerCase("de") === candidateSafeName)) {
    errors.push(`Assetname ist bereits vorhanden: ${derived.safeName}`);
  }
  if (existsSync(join(repoRoot, "species-assets", derived.safeName))) {
    errors.push(`Assetordner ist bereits vorhanden: species-assets/${derived.safeName}`);
  }

  return [...new Set(errors)];
}

function findEditableSpecies(model, id) {
  return model.species.find((entry) => entry.id === id) ?? null;
}

function findInputIndex(inputList, species) {
  const key = scientificKey(species.taxonomy.genus, species.taxonomy.species);
  return inputList.findIndex((entry) => scientificKey(entry.genus, entry.species) === key);
}

function buildEditChanges(inputEntry, values) {
  const changes = [{
    field: EDITABLE_NAME_FIELD.label,
    key: EDITABLE_NAME_FIELD.key,
    before: valueOrUnknown(inputEntry[EDITABLE_NAME_FIELD.sourceKey]),
    after: values[EDITABLE_NAME_FIELD.key],
  }, {
    field: EDITABLE_SCIENTIFIC_FIELD.label,
    key: EDITABLE_SCIENTIFIC_FIELD.key,
    before: valueOrUnknown(`${inputEntry.genus ?? ""} ${inputEntry.species ?? ""}`.trim()),
    after: values.scientificName,
  }, {
    field: "URL-Slug",
    key: "urlSlug",
    before: valueOrUnknown(`${inputEntry.genus ?? ""}${inputEntry.species ?? ""}`.toLocaleLowerCase("de")),
    after: values.slug,
  }];
  changes.push(...EDITABLE_FIELD_DEFINITIONS
    .map((field) => ({
      field: field.label,
      key: field.key,
      before: valueOrUnknown(inputEntry[field.sourceKey]),
      after: values[field.key],
    }))
  );
  return changes
    .filter((change) => normalizeComparable(change.before) !== normalizeComparable(change.after));
}

function editChangesRequirePipelineTransfer(changes) {
  const directRenameKeys = new Set([EDITABLE_NAME_FIELD.key, EDITABLE_SCIENTIFIC_FIELD.key, "urlSlug"]);
  return changes.some((change) => !directRenameKeys.has(change.key));
}

function validateGermanRename({
  inputList,
  model,
  species,
  newGermanName,
  repoRoot,
  assetOverrides = { assets: {} },
  assessmentIds = {},
}) {
  const errors = [];
  const oldGermanName = String(species.germanName ?? "").trim();
  const nextGermanName = String(newGermanName ?? "").trim();
  const oldSafeName = species.safeName;
  const newSafeName = sanitizeAssetName(nextGermanName);
  const oldSafeKey = oldSafeName.toLocaleLowerCase("de");
  const newSafeKey = newSafeName.toLocaleLowerCase("de");
  const oldGermanKey = oldGermanName.toLocaleLowerCase("de");
  const newGermanKey = nextGermanName.toLocaleLowerCase("de");
  const currentScientificKey = scientificKey(species.taxonomy.genus, species.taxonomy.species);

  if (newGermanKey !== oldGermanKey) {
    const duplicateInput = inputList.find((entry) => (
      scientificKey(entry.genus, entry.species) !== currentScientificKey
      && String(entry.german ?? "").trim().toLocaleLowerCase("de") === newGermanKey
    ));
    if (duplicateInput) errors.push(`Deutscher Name ist bereits vorhanden: ${nextGermanName}`);

    const duplicateModel = model.species.find((entry) => (
      entry.id !== species.id
      && entry.germanName.trim().toLocaleLowerCase("de") === newGermanKey
    ));
    if (duplicateModel) errors.push(`Deutscher Name kollidiert mit bestehenden Daten: ${nextGermanName}`);
  }

  if (newSafeKey !== oldSafeKey) {
    const duplicateSafeName = model.species.find((entry) => (
      entry.id !== species.id && entry.safeName.toLocaleLowerCase("de") === newSafeKey
    ));
    if (duplicateSafeName) errors.push(`Assetname ist bereits vorhanden: ${newSafeName}`);

    const newAssetDirectory = join(repoRoot, "species-assets", newSafeName);
    if (existsSync(newAssetDirectory)) {
      errors.push(`Assetordner ist bereits vorhanden: species-assets/${newSafeName}`);
    }
    if (assetOverrides.assets?.[newSafeName]) {
      errors.push(`Assetpflege ist bereits vorhanden: ${newSafeName}`);
    }
    if (Object.hasOwn(assessmentIds, newSafeName)) {
      errors.push(`Assessment-Zuordnung ist bereits vorhanden: ${newSafeName}`);
    }
  }

  return [...new Set(errors)];
}

function validateScientificRename({ inputList, model, species, values }) {
  const errors = [];
  const oldScientificKey = scientificKey(species.taxonomy.genus, species.taxonomy.species);
  const nextScientificKey = scientificKey(values.genus, values.species);
  const oldSlug = String(species.id ?? "").trim().toLocaleLowerCase("de");
  const newSlug = String(values.slug ?? "").trim().toLocaleLowerCase("de");

  if (nextScientificKey !== oldScientificKey) {
    const duplicateInput = inputList.find((entry) => (
      scientificKey(entry.genus, entry.species) !== oldScientificKey
      && scientificKey(entry.genus, entry.species) === nextScientificKey
    ));
    if (duplicateInput) errors.push(`Wissenschaftlicher Name ist bereits vorhanden: ${values.scientificName}`);

    const duplicateModel = model.species.find((entry) => (
      entry.id !== species.id
      && scientificKey(entry.taxonomy?.genus, entry.taxonomy?.species) === nextScientificKey
    ));
    if (duplicateModel) {
      errors.push(`Wissenschaftlicher Name kollidiert mit bestehenden Daten: ${values.scientificName}`);
    }
  }

  if (newSlug !== oldSlug) {
    const duplicateSlug = model.species.find((entry) => (
      entry.id !== species.id
      && String(entry.id ?? "").trim().toLocaleLowerCase("de") === newSlug
    ));
    if (duplicateSlug) errors.push(`URL-Slug ist bereits vorhanden: ${values.slug}`);
  }

  return [...new Set(errors)];
}

function replaceReportSpeciesName(report, oldGermanName, newGermanName, oldSafeName, newSafeName) {
  if (!report || typeof report !== "object") return report;
  const replaceNames = (values) => Array.isArray(values)
    ? values.map((value) => (value === oldGermanName ? newGermanName : value))
    : values;
  if (report.missing && typeof report.missing === "object") {
    for (const key of ["soundMp3", "soundCredits", "maps", "assessmentId", "status", "category", "trend"]) {
      report.missing[key] = replaceNames(report.missing[key]);
    }
    if (Array.isArray(report.missing.speciesAssets)) {
      for (const entry of report.missing.speciesAssets) {
        if (entry?.german === oldGermanName) entry.german = newGermanName;
        if (entry?.safeName === oldSafeName) entry.safeName = newSafeName;
      }
    }
  }
  report.ncSoundLicensesAll = replaceNames(report.ncSoundLicensesAll);
  return report;
}

function updateAssetMetadataNames(metadata, { germanName, scientificName }) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return metadata;
  if (germanName) {
    if (Object.hasOwn(metadata, "german_name")) metadata.german_name = germanName;
    if (Object.hasOwn(metadata, "germanName")) metadata.germanName = germanName;
  }
  if (scientificName) {
    if (Object.hasOwn(metadata, "scientific_name")) metadata.scientific_name = scientificName;
    if (Object.hasOwn(metadata, "scientificName")) metadata.scientificName = scientificName;
  }
  return metadata;
}

async function writeJsonAtomic(filePath, value) {
  await writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextAtomic(filePath, nextText) {
  const tempPath = `${filePath}.tmp-${randomUUID()}`;
  try {
    await writeFile(tempPath, nextText, "utf8");
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}

async function readJsonBody(request, { maxBytes = MAX_JSON_BODY_BYTES } = {}) {
  const chunks = [];
  let bytes = 0;

  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) {
      const error = new Error("Anfrage ist zu groß");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    const error = new Error("Ungültige JSON-Anfrage");
    error.statusCode = 400;
    throw error;
  }
}

function normalizeComparable(value) {
  return String(value ?? "").trim();
}

function isMissingValue(value) {
  const normalized = normalizeComparable(value).toLocaleLowerCase("de");
  return !normalized || normalized === "n/a";
}

function compareValues(label, inputValue, generatedValue) {
  if (normalizeComparable(inputValue) === normalizeComparable(generatedValue)) return null;
  return {
    field: label,
    input: valueOrUnknown(inputValue),
    generated: valueOrUnknown(generatedValue),
    message: `${label} weicht zwischen Eingabe und Pipeline-Ausgabe ab`,
  };
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
}

function compareReportList(key, label, reportedValues, actualValues) {
  const reported = sortedUnique(reportedValues);
  const actual = sortedUnique(actualValues);
  const reportedSet = new Set(reported);
  const actualSet = new Set(actual);
  const missingFromReport = actual.filter((value) => !reportedSet.has(value));
  const staleInReport = reported.filter((value) => !actualSet.has(value));

  return {
    key,
    label,
    reportedCount: reported.length,
    actualCount: actual.length,
    missingFromReport,
    staleInReport,
    ok: missingFromReport.length === 0 && staleInReport.length === 0,
  };
}

async function buildExplorerRevision(repoRoot) {
  const parts = [];
  const trackedFiles = [
    "species_list.json",
    "speciesData.json",
    "fehlende_elemente_report.json",
    "species-assets-overrides.json",
    join("docs", "manual-map-overrides.md"),
  ];

  for (const relativePath of trackedFiles) {
    try {
      const content = await readFile(join(repoRoot, relativePath));
      parts.push(`${relativePath}:${hashText(content)}`);
    } catch {
      parts.push(`${relativePath}:missing`);
    }
  }

  const assetRoot = join(repoRoot, "species-assets");
  try {
    const directories = (await readdir(assetRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, "de"));
    for (const safeName of directories) {
      parts.push(`dir:${safeName}`);
      for (const fileName of [...ASSET_FILES].sort()) {
        const filePath = join(assetRoot, safeName, fileName);
        try {
          const details = await stat(filePath);
          parts.push(`${safeName}/${fileName}:${details.size}:${details.mtimeMs}`);
        } catch {
          parts.push(`${safeName}/${fileName}:missing`);
        }
      }
    }
  } catch {
    parts.push("species-assets:missing");
  }

  return hashText(parts.join("\n"));
}

export async function buildExplorerModel(repoRoot = REPO_ROOT) {
  const assetBackupRoot = join(repoRoot, "species-explorer", "asset-backups");
  const [inputList, generatedList, report, manualMapMarkdown, assetOverrides, collectedAssetBackups] = await Promise.all([
    readJson(join(repoRoot, "species_list.json")),
    readJson(join(repoRoot, "speciesData.json")),
    readJson(join(repoRoot, "fehlende_elemente_report.json")),
    readFile(join(repoRoot, "docs", "manual-map-overrides.md"), "utf8"),
    readJson(join(repoRoot, "species-assets-overrides.json")).catch(() => ({ version: 1, assets: {} })),
    collectManagedAssetBackups(assetBackupRoot).catch(() => []),
  ]);

  if (!Array.isArray(inputList) || !Array.isArray(generatedList)) {
      throw new Error("Eingabeliste und Pipeline-Daten muessen Arrays enthalten.");
  }

  const inputByScientificName = new Map(
    inputList.map((entry) => [scientificKey(entry.genus, entry.species), entry]),
  );
  const generatedByScientificName = new Map(
    generatedList.map((entry) => [
      scientificKey(entry.Genus, entry.Species),
      entry,
    ]),
  );
  const manualMapSafeNames = parseManualMapOverrides(manualMapMarkdown);
  const ncNames = new Set(report.ncSoundLicensesAll ?? []);
  const reportMissingSoundNames = new Set(report.missing?.soundMp3 ?? []);
  const reportMissingSoundAssetNames = new Set(
    (report.missing?.speciesAssets ?? [])
      .filter((entry) => Array.isArray(entry.missing) && entry.missing.includes("sound.mp3"))
      .map((entry) => entry.german)
      .filter(Boolean),
  );
  const allKeys = new Set([...inputByScientificName.keys(), ...generatedByScientificName.keys()]);
  const latestBackupsByKey = new Map();
  for (const backup of collectedAssetBackups) {
    const key = `${backup.species}:${backup.assetType}`;
    const current = latestBackupsByKey.get(key);
    if (!current || backup.mtimeMs > current.mtimeMs) latestBackupsByKey.set(key, backup);
  }
  const publicBackup = (safeName, assetType) => {
    const backup = latestBackupsByKey.get(`${safeName}:${assetType}`);
    if (!backup) {
      return {
        exists: false,
        path: "",
        updatedAt: "",
        bytes: 0,
      };
    }
    return {
      exists: true,
      path: repoRelativePath(repoRoot, backup.backupPath),
      updatedAt: new Date(backup.mtimeMs).toISOString(),
      bytes: backup.bytes,
    };
  };
  const species = [];

  for (const key of allKeys) {
    const input = inputByScientificName.get(key) ?? null;
    const generated = generatedByScientificName.get(key) ?? null;
    const germanName = generated?.["Deutscher Name"] ?? input?.german ?? "Unbekannt";
    const scientificName = generated?.["Wissenschaftlicher Name"]
      ?? `${input?.genus ?? ""} ${input?.species ?? ""}`.trim()
      ?? "Unbekannt";
    const safeName = sanitizeAssetName(germanName);
    const assetDir = join(repoRoot, "species-assets", safeName);
    const [map, sound, creditsFile, spectrogram, portrait, portraitMetadataFile] = await Promise.all([
      fileInfo(join(assetDir, "map.jpg")),
      fileInfo(join(assetDir, "sound.mp3")),
      fileInfo(join(assetDir, "credits.json")),
      fileInfo(join(assetDir, "spectrogram.webp")),
      fileInfo(join(assetDir, "portrait.webp")),
      fileInfo(join(assetDir, "portrait.json")),
    ]);

    let credits = null;
    let creditsError = "";
    if (creditsFile.exists) {
      try {
        credits = await readJson(join(assetDir, "credits.json"));
      } catch (error) {
        creditsError = error.message;
      }
    }

    let portraitMetadata = null;
    let portraitMetadataError = "";
    if (portraitMetadataFile.exists) {
      try {
        portraitMetadata = await readJson(join(assetDir, "portrait.json"));
      } catch (error) {
        portraitMetadataError = error.message;
      }
    }

    const inconsistencies = [];
    const dataIssues = [];
    const assetIssues = [];
    const fieldMismatches = [];

    if (!input) dataIssues.push("Kein Eintrag in der Eingabeliste");
    if (!generated) dataIssues.push("Kein Eintrag in speciesData.json");

    if (input && generated) {
      const expectedScientificName = `${input.genus ?? ""} ${input.species ?? ""}`.trim();
      const expectedSlug = `${input.genus ?? ""}${input.species ?? ""}`.toLocaleLowerCase("de");
      const comparisons = [
        compareValues("Deutscher Name", input.german, generated["Deutscher Name"]),
        compareValues("Wissenschaftlicher Name", expectedScientificName, generated["Wissenschaftlicher Name"]),
        compareValues("Größe", input.size, generated["Größe"]),
        compareValues("Gewicht", input.weight, generated.Gewicht),
        compareValues("Lebenserwartung", input.life_expectancy, generated.Lebenserwartung),
        compareValues("URL-Slug", expectedSlug, generated.URLSlug),
      ].filter(Boolean);
      fieldMismatches.push(...comparisons);
      dataIssues.push(...comparisons.map((comparison) => comparison.message));
    }

    if (generated) {
      if (isMissingValue(generated["Assessment ID"])) dataIssues.push("Assessment ID fehlt");
      if (isMissingValue(generated.Status)) dataIssues.push("IUCN-Status fehlt");
      if (isMissingValue(generated.Kategorie)) dataIssues.push("IUCN-Kategorie fehlt");
      if (isMissingValue(generated.Trend)) dataIssues.push("Populationstrend fehlt");
    }

    const mapOverride = assetOverrides.assets?.[safeName]?.map;
    const soundOverride = assetOverrides.assets?.[safeName]?.sound;
    const spectrogramOverride = assetOverrides.assets?.[safeName]?.spectrogram;
    const portraitOverride = assetOverrides.assets?.[safeName]?.portrait;
    const isManualMap = typeof mapOverride?.manual === "boolean"
      ? mapOverride.manual
      : manualMapSafeNames.has(safeName);
    const isManualSound = soundOverride?.manual === true;
    const soundMissingKnown =
      Boolean(generated)
      && !sound.exists
      && (reportMissingSoundNames.has(germanName) || reportMissingSoundAssetNames.has(germanName));
    const soundCareHint = soundMissingKnown || isManualSound;
    const careHints = [];
    if (soundMissingKnown) {
      careHints.push("Sound fehlt; der vollständige Pipeline-Lauf hat keine verwendbare Quelle gefunden.");
    } else if (isManualSound) {
      careHints.push("Sound wird manuell gepflegt und ist vor automatischer Pipeline-Übernahme geschützt.");
    }
    if (!map.exists) assetIssues.push("Karte fehlt");
    if (!sound.exists && !soundMissingKnown) assetIssues.push("Sound fehlt");
    if (!creditsFile.exists && !soundMissingKnown) assetIssues.push("Credits fehlen");
    if (creditsFile.exists && creditsError) assetIssues.push("Credits sind ungültig");
    const isNcSound = String(credits?.license ?? "").toLocaleLowerCase("de").includes("/by-nc");
    const spectrogramHashTracked =
      isSha256(spectrogramOverride?.soundSha256)
      && isSha256(spectrogramOverride?.spectrogramSha256);
    let spectrogramHashVerified = false;
    let spectrogramStale = spectrogramOverride?.stale === true;
    let spectrogramStaleReason = spectrogramStale
      ? String(spectrogramOverride?.reason ?? "Spektrogramm ist als veraltet markiert")
      : "";
    let actualSoundSha256 = "";
    let actualSpectrogramSha256 = "";
    if (sound.exists && spectrogram.exists && spectrogramHashTracked) {
      [actualSoundSha256, actualSpectrogramSha256] = await Promise.all([
        fileSha256(join(assetDir, "sound.mp3")),
        fileSha256(join(assetDir, "spectrogram.webp")),
      ]);
      spectrogramHashVerified =
        actualSoundSha256 === spectrogramOverride.soundSha256
        && actualSpectrogramSha256 === spectrogramOverride.spectrogramSha256;
      if (!spectrogramHashVerified) {
        spectrogramStale = true;
        spectrogramStaleReason =
          actualSoundSha256 !== spectrogramOverride.soundSha256
            ? "Sounddatei stimmt nicht mit dem registrierten Spektrogramm-Soundhash überein"
            : "Spektrogrammdatei stimmt nicht mit dem registrierten Dateihash überein";
      }
    }
    if (spectrogramStale) assetIssues.push("Spektrogramm veraltet");
    else if (!spectrogram.exists && !soundMissingKnown) assetIssues.push("Spektrogramm fehlt");
    let portraitHashVerified = false;
    let actualPortraitSha256 = "";
    let actualPortraitMetadataSha256 = "";
    if (!portrait.exists && !portraitMetadataFile.exists) {
      assetIssues.push("Artporträt fehlt");
    } else {
      if (!portrait.exists) assetIssues.push("Artporträt-Datei fehlt");
      if (!portraitMetadataFile.exists) assetIssues.push("Artporträt-Metadaten fehlen");
      if (portraitMetadataError) assetIssues.push("Artporträt-Metadaten sind ungültig");
      if (
        portrait.exists
        && portraitMetadataFile.exists
        && !portraitMetadataError
        && isSha256(portraitOverride?.sha256)
        && isSha256(portraitOverride?.metadataSha256)
      ) {
        [actualPortraitSha256, actualPortraitMetadataSha256] = await Promise.all([
          fileSha256(join(assetDir, "portrait.webp")),
          fileSha256(join(assetDir, "portrait.json")),
        ]);
        portraitHashVerified =
          actualPortraitSha256 === portraitOverride.sha256
          && actualPortraitMetadataSha256 === portraitOverride.metadataSha256;
        if (!portraitHashVerified) assetIssues.push("Artporträt stimmt nicht mit den registrierten Hashes überein");
      }
    }
    inconsistencies.push(...dataIssues, ...assetIssues);

    species.push({
      id: generated?.URLSlug ?? key.replace(/\s+/g, ""),
      germanName,
      scientificName,
      safeName,
      slug: generated?.URLSlug ?? "",
      inInput: Boolean(input),
      inGenerated: Boolean(generated),
      manual: {
        size: valueOrUnknown(input?.size),
        weight: valueOrUnknown(input?.weight),
        lifeExpectancy: valueOrUnknown(input?.life_expectancy),
      },
      iucn: {
        assessmentId: valueOrUnknown(generated?.["Assessment ID"]),
        status: valueOrUnknown(generated?.Status),
        category: valueOrUnknown(generated?.Kategorie),
        trend: valueOrUnknown(generated?.Trend),
        population: valueOrUnknown(generated?.["Populationgröße"]),
        generationLength: valueOrUnknown(generated?.Generationsdauer),
        lastUpdate: valueOrUnknown(generated?.["Letztes IUCN Update"]),
        fetchedAt: valueOrUnknown(generated?.["Daten abgerufen"]),
      },
      taxonomy: {
        kingdom: formatTaxonomyName(generated?.Kingdom),
        phylum: formatTaxonomyName(generated?.Phylum),
        className: formatTaxonomyName(generated?.Class),
        order: formatTaxonomyName(generated?.Order),
        family: formatTaxonomyName(generated?.Family),
        genus: valueOrUnknown(generated?.Genus ?? input?.genus),
        species: valueOrUnknown(generated?.Species ?? input?.species),
      },
      assets: {
        map: {
          ...map,
          url: `/assets/${encodeURIComponent(safeName)}/map.jpg`,
          manuallyAdded: isManualMap,
          manualReason: mapOverride?.reason ?? "",
          source: mapOverride?.source ?? "",
          sha256: mapOverride?.sha256 ?? "",
          backup: publicBackup(safeName, "map"),
        },
        sound: {
          ...sound,
          url: `/assets/${encodeURIComponent(safeName)}/sound.mp3`,
          manuallyAdded: isManualSound,
          manualReason: soundOverride?.reason ?? "",
          sha256: soundOverride?.sha256 ?? "",
          backup: publicBackup(safeName, "sound"),
        },
        credits: { ...creditsFile, url: `/assets/${encodeURIComponent(safeName)}/credits.json` },
        spectrogram: {
          ...spectrogram,
          url: `/assets/${encodeURIComponent(safeName)}/spectrogram.webp`,
          stale: spectrogramStale,
          staleReason: spectrogramStaleReason,
          hashTracked: spectrogramHashTracked,
          hashVerified: spectrogramHashVerified,
          soundSha256: spectrogramOverride?.soundSha256 ?? "",
          spectrogramSha256: spectrogramOverride?.spectrogramSha256 ?? "",
          actualSoundSha256,
          actualSpectrogramSha256,
          generatedAt: spectrogramOverride?.generatedAt ?? "",
        },
        portrait: {
          ...portrait,
          url: `/assets/${encodeURIComponent(safeName)}/portrait.webp`,
          metadataExists: portraitMetadataFile.exists,
          metadataError: portraitMetadataError,
          metadata: portraitMetadata,
          hashTracked:
            isSha256(portraitOverride?.sha256)
            && isSha256(portraitOverride?.metadataSha256),
          hashVerified: portraitHashVerified,
          sha256: portraitOverride?.sha256 ?? "",
          metadataSha256: portraitOverride?.metadataSha256 ?? "",
          actualSha256: actualPortraitSha256,
          actualMetadataSha256: actualPortraitMetadataSha256,
          importedAt: portraitOverride?.importedAt ?? portraitMetadata?.imported_at ?? "",
          approvedAt: portraitOverride?.approvedAt ?? portraitMetadata?.approved_at ?? "",
          source: portraitOverride?.source ?? portraitMetadata?.source ?? "",
          promptVersion:
            portraitOverride?.promptVersion
            ?? portraitMetadata?.prompt_version
            ?? "",
          backup: publicBackup(safeName, "portrait"),
        },
      },
      credits,
      creditsError,
      isNcSound,
      reportNcSound: ncNames.has(germanName),
      isManualMap,
      isManualSound,
      soundMissingKnown,
      soundCareHint,
      careHints,
      missingPortrait: !portrait.exists,
      fieldMismatches,
      dataIssues,
      assetIssues,
      inconsistencies,
    });
  }

  species.sort((a, b) => a.germanName.localeCompare(b.germanName, "de"));

  const actualMissing = {
    soundMp3: species.filter((entry) => !entry.assets.sound.exists).map((entry) => entry.germanName),
    soundCredits: species
      .filter((entry) => entry.assets.sound.exists && !entry.assets.credits.exists)
      .map((entry) => entry.germanName),
    maps: species.filter((entry) => !entry.assets.map.exists).map((entry) => entry.germanName),
    speciesAssets: species
      .filter((entry) => (
        !entry.assets.map.exists
        || !entry.assets.sound.exists
        || !entry.assets.credits.exists
        || !entry.assets.spectrogram.exists
      ))
      .map((entry) => entry.germanName),
    assessmentId: generatedList
      .filter((entry) => isMissingValue(entry["Assessment ID"]))
      .map((entry) => entry["Deutscher Name"]),
    status: generatedList
      .filter((entry) => isMissingValue(entry.Status))
      .map((entry) => entry["Deutscher Name"]),
    category: generatedList
      .filter((entry) => isMissingValue(entry.Kategorie))
      .map((entry) => entry["Deutscher Name"]),
    trend: generatedList
      .filter((entry) => isMissingValue(entry.Trend))
      .map((entry) => entry["Deutscher Name"]),
    ncSoundLicensesAll: species.filter((entry) => entry.isNcSound).map((entry) => entry.germanName),
  };

  const reportChecks = [
    compareReportList("soundMp3", "Fehlende Sounds", report.missing?.soundMp3 ?? [], actualMissing.soundMp3),
    compareReportList(
      "soundCredits",
      "Fehlende Sound-Credits",
      report.missing?.soundCredits ?? [],
      actualMissing.soundCredits,
    ),
    compareReportList("maps", "Fehlende Karten", report.missing?.maps ?? [], actualMissing.maps),
    compareReportList(
      "speciesAssets",
      "Unvollständige Assetordner",
      (report.missing?.speciesAssets ?? []).map((entry) => entry.german),
      actualMissing.speciesAssets,
    ),
    compareReportList(
      "assessmentId",
      "Fehlende Assessment IDs",
      report.missing?.assessmentId ?? [],
      actualMissing.assessmentId,
    ),
    compareReportList("status", "Fehlende IUCN-Status", report.missing?.status ?? [], actualMissing.status),
    compareReportList(
      "category",
      "Fehlende IUCN-Kategorien",
      report.missing?.category ?? [],
      actualMissing.category,
    ),
    compareReportList("trend", "Fehlende Trends", report.missing?.trend ?? [], actualMissing.trend),
    compareReportList(
      "ncSoundLicensesAll",
      "NC-Soundlizenzen",
      report.ncSoundLicensesAll ?? [],
      actualMissing.ncSoundLicensesAll,
    ),
  ];

  const reportCounterIssues = [];
  const expectedCounters = {
    totalSpecies: generatedList.length,
    missingSoundMp3: (report.missing?.soundMp3 ?? []).length,
    missingSoundCredits: (report.missing?.soundCredits ?? []).length,
    missingMap: (report.missing?.maps ?? []).length,
    missingSpeciesAssets: (report.missing?.speciesAssets ?? []).length,
    missingAssessmentId: (report.missing?.assessmentId ?? []).length,
    missingStatus: (report.missing?.status ?? []).length,
    missingCategory: (report.missing?.category ?? []).length,
    missingTrend: (report.missing?.trend ?? []).length,
    ncSoundLicensesAll: (report.ncSoundLicensesAll ?? []).length,
  };
  for (const [key, expected] of Object.entries(expectedCounters)) {
    if (Number(report.counts?.[key]) !== expected) {
      const actualCounter = report.counts?.[key] ?? "fehlt";
      const label = key === "totalSpecies" ? "Artenanzahl im Report" : key;
      const suffix = key === "totalSpecies"
        ? "Report ist veraltet oder verweist noch auf gelöschte Arten; Report-Abgleich/Bereinigung ausführen."
        : "Report-Zähler passt nicht zur gemeldeten Liste.";
      reportCounterIssues.push(`${label}: Report ${actualCounter}, aktueller Stand ${expected}. ${suffix}`);
    }
  }

  const inputOnlyCount = [...inputByScientificName.keys()]
    .filter((key) => !generatedByScientificName.has(key)).length;
  const generatedOnlyCount = [...generatedByScientificName.keys()]
    .filter((key) => !inputByScientificName.has(key)).length;
  const dataIssueSpecies = species.filter((entry) => entry.dataIssues.length > 0);
  const assetIssueSpecies = species.filter((entry) => entry.assetIssues.length > 0);
  const reportIssueCount = reportChecks.filter((check) => !check.ok).length + reportCounterIssues.length;
  const validation = {
    status: dataIssueSpecies.length === 0 && assetIssueSpecies.length === 0 && reportIssueCount === 0
      ? "ok"
      : "issues",
    issueCount: dataIssueSpecies.length + assetIssueSpecies.length + reportIssueCount,
    data: {
      inputCount: inputList.length,
      generatedCount: generatedList.length,
      matchedCount: species.filter((entry) => (
        entry.dataIssues.length === 0
        && inputByScientificName.has(scientificKey(entry.taxonomy.genus, entry.taxonomy.species))
        && generatedByScientificName.has(scientificKey(entry.taxonomy.genus, entry.taxonomy.species))
      )).length,
      inputOnlyCount,
      generatedOnlyCount,
      mismatchSpeciesCount: species.filter((entry) => entry.fieldMismatches.length > 0).length,
      issueSpeciesCount: dataIssueSpecies.length,
    },
    assets: {
      completeSpeciesCount: species.length - assetIssueSpecies.length,
      issueSpeciesCount: assetIssueSpecies.length,
      available: {
        maps: species.filter((entry) => entry.assets.map.exists).length,
        sounds: species.filter((entry) => entry.assets.sound.exists).length,
        credits: species.filter((entry) => entry.assets.credits.exists).length,
        spectrograms: species.filter((entry) => entry.assets.spectrogram.exists).length,
        portraits: species.filter((entry) => entry.assets.portrait.exists).length,
      },
    },
    report: {
      consistent: reportIssueCount === 0,
      issueCount: reportIssueCount,
      checks: reportChecks,
      counterIssues: reportCounterIssues,
    },
    special: {
      manualMapCount: species.filter((entry) => entry.isManualMap).length,
      manualSoundCount: species.filter((entry) => entry.isManualSound).length,
      soundCareCount: species.filter((entry) => entry.soundCareHint).length,
      missingSoundKnownCount: species.filter((entry) => entry.soundMissingKnown).length,
      ncSoundCount: species.filter((entry) => entry.isNcSound).length,
      missingPortraitCount: species.filter((entry) => entry.missingPortrait).length,
    },
  };

  const summary = {
    speciesCount: species.length,
    inputCount: inputList.length,
    generatedCount: generatedList.length,
    reportGeneratedAt: report.generatedAt ?? null,
    missingCoreAssets: assetIssueSpecies.length,
    validationIssueSpecies: species.filter((entry) => entry.inconsistencies.length > 0).length,
    ncSoundCount: species.filter((entry) => entry.isNcSound).length,
    manualMapCount: species.filter((entry) => entry.isManualMap).length,
    manualSoundCount: species.filter((entry) => entry.isManualSound).length,
    soundCareCount: species.filter((entry) => entry.soundCareHint).length,
    missingSoundKnownCount: species.filter((entry) => entry.soundMissingKnown).length,
    missingPortraitCount: species.filter((entry) => entry.missingPortrait).length,
    readOnly: false,
    editingEnabled: true,
    editableFile: "species_list.json",
  };

  return { summary, validation, species };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": MIME_TYPES[".json"],
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(text);
}

function safePublicPath(pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const path = normalize(join(PUBLIC_DIR, requested));
  return path.startsWith(PUBLIC_DIR) ? path : null;
}

function safeAssetPath(pathname, repoRoot) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 3 || parts[0] !== "assets") return null;
  const safeName = decodeURIComponent(parts[1]);
  const fileName = parts[2];
  if (sanitizeAssetName(safeName) !== safeName || !ASSET_FILES.has(fileName)) return null;
  const assetRoot = join(repoRoot, "species-assets");
  const path = normalize(join(assetRoot, safeName, fileName));
  return path.startsWith(assetRoot) ? path : null;
}

function safeGraphicsPath(pathname, repoRoot) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 3 || parts[0] !== "graphics") return null;
  const directory = decodeURIComponent(parts[1]);
  const fileName = decodeURIComponent(parts[2]);
  if (!new Set(["catagory", "trend"]).has(directory)) return null;
  if (!/^[A-Za-z0-9_-]+\.png$/.test(fileName)) return null;
  const graphicsRoot = join(repoRoot, "graphics");
  const path = normalize(join(graphicsRoot, directory, fileName));
  return path.startsWith(graphicsRoot) ? path : null;
}

function parseByteRange(rangeHeader, size) {
  const match = String(rangeHeader ?? "").match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  let start;
  let end;
  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : size - 1;
  }

  if (
    !Number.isInteger(start)
    || !Number.isInteger(end)
    || start < 0
    || end < start
    || start >= size
  ) {
    return null;
  }

  return { start, end: Math.min(end, size - 1) };
}

async function sendFile(request, response, path) {
  if (!path || !existsSync(path)) {
    sendText(response, 404, "Nicht gefunden");
    return;
  }

  const details = await stat(path);
  if (!details.isFile()) {
    sendText(response, 404, "Nicht gefunden");
    return;
  }

  const baseHeaders = {
    "Content-Type": MIME_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-store",
    "Accept-Ranges": "bytes",
  };
  const rangeHeader = request.headers.range;

  const streamFile = (options) => {
    const stream = createReadStream(path, options);
    const entry = { path, stream };
    activeFileStreams.add(entry);
    const cleanup = () => {
      activeFileStreams.delete(entry);
      stream.destroy();
    };
    response.on("close", cleanup);
    response.on("finish", cleanup);
    stream.on("close", cleanup);
    stream.on("error", cleanup);
    stream.pipe(response);
  };

  if (rangeHeader) {
    const range = parseByteRange(rangeHeader, details.size);
    if (!range) {
      response.writeHead(416, {
        ...baseHeaders,
        "Content-Range": `bytes */${details.size}`,
      });
      response.end();
      return;
    }

    const contentLength = range.end - range.start + 1;
    response.writeHead(206, {
      ...baseHeaders,
      "Content-Length": contentLength,
      "Content-Range": `bytes ${range.start}-${range.end}/${details.size}`,
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    streamFile(range);
    return;
  }

  response.writeHead(200, {
    ...baseHeaders,
    "Content-Length": details.size,
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  streamFile();
}

export async function createExplorerServer({
  repoRoot = REPO_ROOT,
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  publishAssetChanges = false,
  rebuildReportAfterAssetSave = true,
  nasBackupRoot = process.env.IUCN_NAS_BACKUP_DIR || DEFAULT_NAS_BACKUP_ROOT,
  spectrogramRenderer = renderSpectrogram,
  portraitRenderer = renderPortrait,
  mapImageRenderer = renderMapJpeg,
} = {}) {
  let model = await buildExplorerModel(repoRoot);
  let modelRevision = await buildExplorerRevision(repoRoot);
  let modelRefreshPromise = null;
  const previewTokens = new Map();
  const speciesListPath = join(repoRoot, "species_list.json");
  const assetOverridesPath = join(repoRoot, "species-assets-overrides.json");
  const assessmentIdsPath = join(repoRoot, "lastSavedAssessmentId.json");
  const manualMapOverridesPath = join(repoRoot, "docs", "manual-map-overrides.md");
  const backupDir = join(repoRoot, "species-explorer", "backups");
  const localSettingsPath = join(repoRoot, "species-explorer", LOCAL_SETTINGS_FILE);
  const pipelineLogDir = join(repoRoot, "species-explorer", "logs");
  const pipelineAssetBackupRoot = join(repoRoot, "species-explorer", "pipeline-asset-backups");
  const assetStagingRoot = join(repoRoot, "species-explorer", "staging");
  const assetBackupRoot = join(repoRoot, "species-explorer", "asset-backups");
  const pendingAssetReviewPath = join(repoRoot, "species-explorer", "pending-asset-review.json");
  const defaultNasBackupRoot = nasBackupRoot;
  let explorerSettings = await loadExplorerSettings();
  let currentNasBackupRoot = normalizeBackupRoot(explorerSettings.nasBackupRoot) || defaultNasBackupRoot;
  let pipelineProcess = null;
  let backupProcess = null;
  let assetWriteActive = false;
  let pipelineAssetSnapshot = new Map();
  let pipelineState = {
    status: "idle",
    phase: "",
    mode: "",
    initialMode: "",
    runId: "",
    startedAt: "",
    completedAt: "",
    exitCode: null,
    targetCount: 0,
    targets: [],
    removed: [],
    log: [],
    logFile: "",
    error: "",
    reviewAssets: [],
    gitPublished: false,
    publishAfterAssetOnlyNoAssets: false,
  };
  let backupState = {
    status: "idle",
    phase: "",
    backupRoot: currentNasBackupRoot,
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
  if (existsSync(pendingAssetReviewPath)) {
    try {
      const pending = await readJson(pendingAssetReviewPath);
      if (pending?.status === "awaiting-review" && Array.isArray(pending.reviewAssets)) {
        pipelineState = pending;
      }
    } catch {
      // Eine unlesbare lokale Statusdatei wird beim nächsten erfolgreichen Lauf ersetzt.
    }
  }

  async function loadExplorerSettings() {
    try {
      const parsed = await readJson(localSettingsPath);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  }

  async function writeExplorerSettings(settings) {
    await mkdir(join(repoRoot, "species-explorer"), { recursive: true });
    await writeFile(localSettingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  }

  function publicSettingsPayload() {
    return {
      backupRoot: currentNasBackupRoot,
      defaultBackupRoot: defaultNasBackupRoot,
      hasCustomBackupRoot: currentNasBackupRoot !== defaultNasBackupRoot,
      settingsFile: `species-explorer/${LOCAL_SETTINGS_FILE}`,
      maxBackups: 10,
    };
  }

  async function readPendingProjectChanges() {
    const trackedPaths = [
      "species_list.json",
      "speciesData.json",
      "fehlende_elemente_report.json",
      "lastSavedAssessmentId.json",
      "species-assets-overrides.json",
      "docs/manual-map-overrides.md",
      "species-assets",
    ];
    const result = await runCommandCapture("git", [
      "-c",
      "core.quotepath=false",
      "status",
      "--porcelain",
      "--untracked-files=all",
      "--",
      ...trackedPaths,
    ]);
    if (result.code !== 0) {
      return {
        files: [],
        count: 0,
        error: result.stderr || result.stdout || "Git-Status konnte nicht gelesen werden",
      };
    }
    const files = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(.{1,2})\s+(.*)$/);
        return {
          status: (match?.[1] ?? line.slice(0, 2)).trim() || "??",
          path: (match?.[2] ?? line.slice(2)).trim(),
        };
      })
      .filter((entry) => entry.path);
    return { files, count: files.length, error: "" };
  }

  function normalizePendingPath(pathValue) {
    let normalized = String(pathValue ?? "").trim();
    if (normalized.includes(" -> ")) normalized = normalized.split(" -> ").pop().trim();
    normalized = normalized.replace(/^"|"$/g, "");
    return normalized.replace(/\\/g, "/");
  }

  function pendingAssetSpeciesFromFiles(files, speciesList) {
    const bySafeName = new Map(
      speciesList.map((entry) => {
        const safeName = sanitizeAssetName(entry.german);
        const scientificName = `${entry.genus ?? ""} ${entry.species ?? ""}`.trim();
        return [safeName.toLocaleLowerCase("de"), {
          slug: `${entry.genus ?? ""}${entry.species ?? ""}`.toLocaleLowerCase("de"),
          safeName,
          germanName: entry.german,
          scientificName,
        }];
      }),
    );
    const affected = new Map();
    for (const file of files ?? []) {
      const match = normalizePendingPath(file.path).match(/^species-assets\/([^/]+)\//);
      if (!match) continue;
      const safeName = match[1];
      const species = bySafeName.get(safeName.toLocaleLowerCase("de")) ?? {
        slug: "",
        safeName,
        germanName: safeName,
        scientificName: "",
      };
      affected.set(safeName.toLocaleLowerCase("de"), species);
    }
    return [...affected.values()].sort((a, b) => a.germanName.localeCompare(b.germanName, "de"));
  }

  async function saveBackupSettings(payload = {}) {
    if (backupProcess || backupState.status === "running") {
      const error = new Error("Während eines laufenden NAS-Backups kann der Backup-Pfad nicht geändert werden.");
      error.statusCode = 409;
      throw error;
    }
    const reset = payload.reset === true;
    const nextBackupRoot = reset
      ? defaultNasBackupRoot
      : validateBackupRoot(payload.backupRoot);
    const nextSettings = { ...explorerSettings };
    if (nextBackupRoot === defaultNasBackupRoot) delete nextSettings.nasBackupRoot;
    else nextSettings.nasBackupRoot = nextBackupRoot;
    nextSettings.updatedAt = new Date().toISOString();
    await writeExplorerSettings(nextSettings);
    explorerSettings = nextSettings;
    currentNasBackupRoot = nextBackupRoot;
    backupState.backupRoot = currentNasBackupRoot;
    return publicSettingsPayload();
  }

  async function refreshModel({ force = false } = {}) {
    if (modelRefreshPromise) return modelRefreshPromise;
    modelRefreshPromise = (async () => {
      const currentRevision = await buildExplorerRevision(repoRoot);
      if (!force && currentRevision === modelRevision) return false;
      model = await buildExplorerModel(repoRoot);
      modelRevision = currentRevision;
      return true;
    })();
    try {
      return await modelRefreshPromise;
    } finally {
      modelRefreshPromise = null;
    }
  }

  function cleanupPreviewTokens() {
    const now = Date.now();
    for (const [token, preview] of previewTokens) {
      if (preview.expiresAt > now) continue;
      if (["map-asset", "sound-asset", "portrait-asset"].includes(preview.type) && preview.stagingPath) {
        rmSync(preview.stagingPath, { force: true });
      }
      if (preview.type === "portrait-asset" && preview.inputStagingPath) {
        rmSync(preview.inputStagingPath, { force: true });
      }
      if (preview.type === "sound-asset" && preview.spectrogramStagingPath) {
        rmSync(preview.spectrogramStagingPath, { force: true });
      }
      previewTokens.delete(token);
    }
  }

  async function readPipelinePlan(mode, targetSlugs = []) {
    const [speciesListText, speciesDataText] = await Promise.all([
      readFile(speciesListPath, "utf8"),
      readFile(join(repoRoot, "speciesData.json"), "utf8"),
    ]);
    const speciesList = JSON.parse(speciesListText);
    const existingSpeciesData = JSON.parse(speciesDataText);
    const plan = mode === "cleanup"
      ? buildCleanupPlan(repoRoot)
      : buildPipelinePlan({
        speciesList,
        existingSpeciesData,
        repoRoot,
        sanitizeAssetName,
        mode,
        targetSlugs,
      });
    let pendingProjectChanges = { files: [], count: 0, error: "" };
    if (mode === "transfer") {
      pendingProjectChanges = await readPendingProjectChanges();
      const pendingAssetSpecies = pendingAssetSpeciesFromFiles(pendingProjectChanges.files, speciesList);
      const affectedSpeciesKeys = new Set([
        ...(plan.targets ?? []).map((target) => String(target.safeName ?? target.slug ?? "").toLocaleLowerCase("de")),
        ...pendingAssetSpecies.map((entry) => entry.safeName.toLocaleLowerCase("de")),
      ].filter(Boolean));
      plan.pendingFiles = pendingProjectChanges.files;
      plan.pendingFileCount = pendingProjectChanges.count;
      plan.pendingFileError = pendingProjectChanges.error;
      plan.pendingAssetSpecies = pendingAssetSpecies;
      plan.pendingAssetSpeciesCount = pendingAssetSpecies.length;
      plan.affectedSpeciesCount = affectedSpeciesKeys.size;
      plan.hasWork = plan.hasWork || pendingProjectChanges.count > 0;
    }
    return {
      plan,
      sourceRevision: hashText(
        `${speciesListText}\n${speciesDataText}\n${JSON.stringify(
          {
            targetSlugs,
            pendingProjectChanges,
            plan: mode === "cleanup" ? publicCleanupPlan(plan) : publicPipelinePlan(plan),
          },
        )}`,
      ),
    };
  }

  async function pendingChangesPayload() {
    const { plan } = await readPipelinePlan("transfer", []);
    const publicPlan = publicPipelinePlan(plan);
    return {
      hasPendingChanges: publicPlan.hasWork,
      manualChangeCount: publicPlan.targetCount,
      pendingFileCount: publicPlan.pendingFileCount,
      pendingFiles: publicPlan.pendingFiles,
      pendingAssetSpeciesCount: publicPlan.pendingAssetSpeciesCount,
      pendingAssetSpecies: publicPlan.pendingAssetSpecies,
      affectedSpeciesCount: publicPlan.affectedSpeciesCount,
      targets: publicPlan.targets,
      error: plan.pendingFileError || "",
    };
  }

  async function previewPipeline(payload) {
    cleanupPreviewTokens();
    const mode = String(payload?.mode ?? "");
    if (!["all", "missing", "manual-maps", "nc-sounds", "cleanup", "transfer"].includes(mode)) {
      const error = new Error(
        "Pipeline-Modus muss all, missing, manual-maps, nc-sounds, transfer oder cleanup sein",
      );
      error.statusCode = 400;
      throw error;
    }
    if (isPipelineActive()) {
      const error = new Error("Es läuft bereits eine Datenbank-Aktion. Bitte den laufenden Prozess abwarten.");
      error.statusCode = 409;
      throw error;
    }
    if (isBackupActive()) {
      const error = new Error("Während eines laufenden NAS-Backups kann keine Datenbank-Aktion gestartet werden.");
      error.statusCode = 409;
      throw error;
    }
    if (assetWriteActive) {
      const error = new Error("Während eines laufenden Schreibvorgangs kann keine Datenbank-Aktion gestartet werden.");
      error.statusCode = 409;
      throw error;
    }

    const targetSlugs = Array.isArray(payload?.targetSlugs)
      ? payload.targetSlugs.map((slug) => String(slug ?? "").trim().toLocaleLowerCase("de")).filter(Boolean)
      : [];
    const { plan, sourceRevision } = await readPipelinePlan(mode, targetSlugs);
    const token = randomUUID();
    const expiresAt = Date.now() + PREVIEW_TOKEN_TTL_MS;
    previewTokens.set(token, {
      type: "pipeline",
      mode,
      targetSlugs,
      sourceRevision,
      expiresAt,
    });
    return {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      ...(mode === "cleanup" ? publicCleanupPlan(plan) : publicPipelinePlan(plan)),
      tokensAvailable:
        mode === "cleanup"
        || mode === "transfer"
        || (mode === "manual-maps" && Boolean(process.env.IUCN_TOKEN))
        || (mode === "nc-sounds" && Boolean(process.env.XENO_TOKEN))
        || Boolean(process.env.IUCN_TOKEN && process.env.XENO_TOKEN),
      warnings: [
        "Nach erfolgreichem Lauf werden die Pipeline-Dateien automatisch committed und gepusht.",
        mode === "cleanup"
          ? "Die aufgelisteten Alt-Daten und Assetordner werden dauerhaft gelöscht und sind danach nicht wiederherstellbar."
          : mode === "manual-maps"
            ? "Nur manuell geschützte Karten werden erneut bei IUCN gesucht und vor einer Übernahme angezeigt."
            : mode === "nc-sounds"
              ? "Vorhandene NC-Sounds werden auf freie Alternativen geprüft; fehlende Sounds werden erneut gesucht und vor einer Übernahme angehört."
          : mode === "transfer"
            ? "Geaenderte manuelle Eingabefelder und lokal gespeicherte Asset-Dateien werden ohne externe Suche uebertragen."
          : mode === "all"
            ? "Der vollständige Lauf fragt alle Arten erneut bei den externen Diensten ab."
            : "Der gezielte Lauf verarbeitet neue oder unvollständige Arten und übernimmt übrige Bestandsdaten.",
      ],
    };
  }

  function appendPipelineLog(text) {
    const tokenValues = [process.env.IUCN_TOKEN, process.env.XENO_TOKEN].filter(Boolean);
    let sanitized = String(text ?? "");
    for (const token of tokenValues) sanitized = sanitized.split(token).join("[TOKEN]");
    const lines = sanitized.split(/\r?\n/).filter((line) => line.length > 0);
    pipelineState.log.push(...lines);
    if (pipelineState.log.length > PIPELINE_LOG_LINE_LIMIT) {
      pipelineState.log.splice(0, pipelineState.log.length - PIPELINE_LOG_LINE_LIMIT);
    }
  }

  function assetOnlyNoChangeMessage(mode) {
    const logText = pipelineState.log.join("\n");
    if (/Sounddatei .*gesperrt|noch geöffnet oder gesperrt|Datei gesperrt/i.test(logText)) {
      return "Sounddatei war noch geöffnet oder gesperrt; gefundene Alternative konnte nicht gespeichert werden. Bitte Wiedergabe/Fenster schließen und Suchlauf erneut starten.";
    }
    if (/Abgelehnte Soundquelle wird übersprungen/i.test(logText)) {
      return "Bereits abgelehnte Soundquellen wurden übersprungen; keine weitere geeignete Soundalternative gefunden.";
    }
    if (mode === "nc-sounds") {
      return "Keine neue geeignete Soundalternative gefunden; bestehende Sounds bleiben unverändert.";
    }
    if (mode === "manual-maps") {
      return "Keine neue automatisch abrufbare Karte gefunden; bestehende Karten bleiben unverändert.";
    }
    return "Keine neue automatische Alternative gefunden; bestehende Assets bleiben unverändert.";
  }

  function isWindowsFileLockError(error) {
    const code = String(error?.code ?? "").toUpperCase();
    const message = String(error?.message ?? "").toLowerCase();
    return (
      ["EPERM", "EBUSY", "EACCES", "ENOTEMPTY"].includes(code)
      || message.includes("operation not permitted")
      || message.includes("permission denied")
      || message.includes("access is denied")
      || message.includes("zugriff verweigert")
    );
  }

  async function synchronizeStoredManualMapDocumentation(registry) {
    const source = await readFile(manualMapOverridesPath, "utf8");
    const next = synchronizeManualMapDocumentation(source, registry);
    if (next === source) return;
    const tempPath = `${manualMapOverridesPath}.tmp-${randomUUID()}`;
    await writeFile(tempPath, next, "utf8");
    await rename(tempPath, manualMapOverridesPath);
  }

  function assetCompositeHash(assetDir, type) {
    const names = type === "sound" ? ["sound.mp3", "credits.json"] : ["map.jpg"];
    const hash = createHash("sha256");
    let found = false;
    for (const name of names) {
      const filePath = join(assetDir, name);
      if (!existsSync(filePath)) continue;
      found = true;
      hash.update(name);
      try {
        hash.update(readFileSync(filePath));
      } catch (error) {
        if (!isWindowsFileLockError(error)) throw error;
        let fallback = "locked";
        try {
          const details = statSync(filePath);
          fallback = `locked:${details.size}:${details.mtimeMs}`;
        } catch {}
        hash.update(fallback);
        appendPipelineLog(
          `Warnung: Assetdatei konnte wegen Windows-Sperre nicht vollständig gelesen werden und wurde per Metadaten bewertet: ${filePath}`,
        );
      }
    }
    return found ? hash.digest("hex") : "";
  }

  function wasAssetSavedInCurrentPipelineLog(safeName, type) {
    const fileName = type === "map" ? "map.jpg" : "sound.mp3";
    const expectedPath = `species-assets/${safeName}/${fileName}`.toLocaleLowerCase("de");
    const savedMarker = type === "map" ? "karte gespeichert" : "sound gespeichert";
    return pipelineState.log.some((line) => {
      const normalizedLine = String(line ?? "")
        .replaceAll("\\", "/")
        .toLocaleLowerCase("de");
      return normalizedLine.includes(savedMarker) && normalizedLine.includes(expectedPath);
    });
  }

  function readAssetCredits(assetDir) {
    const creditsPath = join(assetDir, "credits.json");
    if (!existsSync(creditsPath)) return {};
    try {
      return JSON.parse(readFileSync(creditsPath, "utf8"));
    } catch {
      return {};
    }
  }

  function soundRejectionKeyFromCredits(credits) {
    const explicit = String(credits?.rejectionKey ?? "").trim();
    if (explicit) return explicit;
    const source = String(credits?.source ?? "").toLocaleLowerCase("de");
    const url = String(credits?.url ?? "").trim();
    const notes = String(credits?.notes ?? "").trim();
    const xenoMatch = url.match(/xeno-canto\.org\/(\d+)/i) || notes.match(/xeno-canto\.org\/(\d+)/i);
    if (source.includes("xeno") && xenoMatch) return `xeno-canto:${xenoMatch[1]}`;
    if (source.includes("wikimedia")) return `wikimedia-commons:${url || notes}`;
    if (source.includes("inaturalist")) {
      const observation = notes.match(/Observation=([^|\s]+)/i)?.[1] ?? "";
      const sound = notes.match(/sound=([^|\s]+)/i)?.[1] ?? "";
      if (observation || sound) return `inaturalist:${observation}:${sound || url}`;
    }
    return `${source || "unknown"}:${url || notes || "unknown"}`;
  }

  function rejectedSoundSourceFromCredits(asset) {
    const creditsPath = join(repoRoot, "species-assets", asset.safeName, "credits.json");
    let credits = {};
    if (existsSync(creditsPath)) {
      try {
        credits = JSON.parse(readFileSync(creditsPath, "utf8"));
      } catch {
        credits = {};
      }
    }
    return {
      key: soundRejectionKeyFromCredits(credits),
      source: String(credits.source ?? "").trim() || "Unbekannt",
      url: String(credits.url ?? "").trim() || "",
      recordist: String(credits.recordist ?? "").trim() || "",
      license: String(credits.license ?? "").trim() || "",
      rejectedAt: new Date().toISOString(),
    };
  }

  function addRejectedSoundSource(soundOverride, rejectedSource) {
    const next = soundOverride && typeof soundOverride === "object"
      ? structuredClone(soundOverride)
      : {};
    const existing = Array.isArray(next.rejectedSources) ? next.rejectedSources : [];
    const byKey = new Map(existing
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => [String(entry.key ?? ""), entry]));
    byKey.set(rejectedSource.key, rejectedSource);
    next.rejectedSources = [...byKey.values()].filter((entry) => String(entry.key ?? "").trim());
    return next;
  }

  function capturePipelineAssets(plan) {
    const snapshot = new Map();
    const keepBackups = !["cleanup", "transfer"].includes(plan.mode);
    const runBackupRoot = join(pipelineAssetBackupRoot, pipelineState.runId);
    const registry = existsSync(assetOverridesPath)
      ? JSON.parse(readFileSync(assetOverridesPath, "utf8"))
      : { version: 1, assets: {} };
    if (keepBackups) mkdirSync(runBackupRoot, { recursive: true });
    for (const target of plan.targets ?? []) {
      const assetDir = join(repoRoot, "species-assets", target.safeName);
      for (const [type, fileName] of [["map", "map.jpg"], ["sound", "sound.mp3"]]) {
        const filePath = join(assetDir, fileName);
        const backupFiles = {};
        const previousCredits = type === "sound" ? readAssetCredits(assetDir) : {};
        const relevantBackup = keepBackups && ["map", "sound"].includes(type);
        if (keepBackups && relevantBackup && existsSync(filePath)) {
          const names = type === "sound"
            ? ["sound.mp3", "credits.json", "spectrogram.webp"]
            : ["map.jpg"];
          const targetBackupDir = join(runBackupRoot, target.safeName);
          mkdirSync(targetBackupDir, { recursive: true });
          for (const name of names) {
            const source = join(assetDir, name);
            if (!existsSync(source)) continue;
            const backup = join(targetBackupDir, name);
            try {
              copyFileSync(source, backup);
              backupFiles[name] = backup;
            } catch (error) {
              if (!isWindowsFileLockError(error)) throw error;
              appendPipelineLog(
                `Warnung: Assetdatei konnte wegen Windows-Sperre nicht für die Rücksicherung kopiert werden: ${source}`,
              );
            }
          }
        }
        snapshot.set(`${target.safeName}:${type}`, {
          exists: existsSync(filePath),
          hash: assetCompositeHash(assetDir, type),
          backupFiles,
          previousIsNc: type === "sound" ? isNonCommercialLicense(previousCredits.license) : false,
          previousSourceLabel: type === "sound"
            ? (isNonCommercialLicense(previousCredits.license) ? "NC" : "frei")
            : "",
          previousLicense: type === "sound"
            ? String(previousCredits.license ?? "").trim()
            : "",
          previousManual: registry.assets?.[target.safeName]?.[type]?.manual === true,
          override: structuredClone(registry.assets?.[target.safeName]?.[type] ?? null),
          spectrogramOverride: type === "sound"
            ? structuredClone(registry.assets?.[target.safeName]?.spectrogram ?? null)
            : null,
        });
      }
    }
    return snapshot;
  }

  function detectNewPipelineAssets(plan) {
    const additions = [];
    const backupFileUrl = (safeName, fileName) =>
      `/api/pipeline/assets/backup-file?runId=${encodeURIComponent(pipelineState.runId)}`
      + `&safeName=${encodeURIComponent(safeName)}&file=${encodeURIComponent(fileName)}`;
    for (const target of plan.targets ?? []) {
      const assetDir = join(repoRoot, "species-assets", target.safeName);
      for (const [type, fileName, label] of [
        ["map", "map.jpg", "Karte"],
        ["sound", "sound.mp3", "Sound"],
      ]) {
        const key = `${target.safeName}:${type}`;
        const before = pipelineAssetSnapshot.get(key) ?? { exists: false, hash: "", backupFiles: {} };
        const currentPath = join(assetDir, fileName);
        const exists = existsSync(currentPath);
        const currentHash = exists ? assetCompositeHash(assetDir, type) : "";
        const reviewVersion = `${pipelineState.runId}-${currentHash.slice(0, 16)}`;
        const changed = exists && before.exists && before.hash !== currentHash;
        const refreshedByPipeline = exists
          && before.exists
          && !changed
          && plan.mode === "manual-maps"
          && type === "map"
          && wasAssetSavedInCurrentPipelineLog(target.safeName, type);
        if ((!before.exists && exists) || changed || refreshedByPipeline) {
          const credits = type === "sound" ? readAssetCredits(assetDir) : {};
          const isNc = type === "sound" ? isNonCommercialLicense(credits.license) : false;
          additions.push({
            safeName: target.safeName,
            germanName: target.germanName,
            scientificName: target.scientificName,
            type,
            label,
            file: `species-assets/${target.safeName}/${fileName}`,
            url: `/assets/${encodeURIComponent(target.safeName)}/${fileName}?review=${encodeURIComponent(reviewVersion)}`,
            spectrogramUrl: type === "sound" && existsSync(join(assetDir, "spectrogram.webp"))
              ? `/assets/${encodeURIComponent(target.safeName)}/spectrogram.webp?review=${encodeURIComponent(reviewVersion)}`
              : "",
            changed,
            refreshed: refreshedByPipeline,
            previouslyExisting: before.exists,
            previousIsNc: type === "sound" ? Boolean(before.previousIsNc) : false,
            previousSourceLabel: type === "sound"
              ? String(before.previousSourceLabel ?? "").trim()
              : "",
            previousLicense: type === "sound"
              ? String(before.previousLicense ?? "").trim()
              : "",
            previousManual: Boolean(before.previousManual),
            reviewMode: plan.mode,
            isNc,
            sourceLabel: type === "sound"
              ? (isNc ? "NC" : "frei")
              : "",
            license: type === "sound"
              ? String(credits.license ?? "").trim()
              : "",
            source: type === "sound"
              ? String(credits.source ?? "").trim()
              : "",
            backupFiles: before.backupFiles,
            previousUrl: type === "map" && existsSync(before.backupFiles?.["map.jpg"] || "")
              ? backupFileUrl(target.safeName, "map.jpg")
              : type === "sound" && existsSync(before.backupFiles?.["sound.mp3"] || "")
                ? backupFileUrl(target.safeName, "sound.mp3")
              : "",
            previousSpectrogramUrl: type === "sound" && existsSync(before.backupFiles?.["spectrogram.webp"] || "")
              ? backupFileUrl(target.safeName, "spectrogram.webp")
              : "",
          });
        }
      }
    }
    return additions;
  }

  async function sendPipelineBackupFile(url, request, response) {
    const runId = String(url.searchParams.get("runId") ?? "");
    const safeName = String(url.searchParams.get("safeName") ?? "");
    const fileName = String(url.searchParams.get("file") ?? "");
    const allowedFiles = new Set(["map.jpg", "sound.mp3", "spectrogram.webp"]);
    if (
      !runId
      || runId !== pipelineState.runId
      || pipelineState.status !== "awaiting-review"
      || sanitizeAssetName(safeName) !== safeName
      || !allowedFiles.has(fileName)
    ) {
      sendText(response, 404, "Nicht gefunden");
      return;
    }

    const expectedType = fileName === "map.jpg" ? "map" : "sound";
    const asset = pipelineState.reviewAssets.find((entry) =>
      entry.safeName === safeName && entry.type === expectedType
    );
    const backupPath = asset?.backupFiles?.[fileName] ?? "";
    const resolvedBackupPath = resolve(backupPath);
    const allowedRoot = `${resolve(pipelineAssetBackupRoot, runId, safeName)}${sep}`;
    if (!backupPath || !resolvedBackupPath.startsWith(allowedRoot)) {
      sendText(response, 404, "Nicht gefunden");
      return;
    }

    await sendFile(request, response, resolvedBackupPath);
  }

  function runPipelineChild(command, args, phase, { stdoutFormatter = null } = {}) {
    pipelineState.phase = phase;
    appendPipelineLog(`--- ${phase} ---`);
    return new Promise((resolveRun) => {
      let stdoutBuffer = "";
      const child = spawn(command, args, {
        cwd: repoRoot,
        env: process.env,
        windowsHide: true,
      });
      pipelineProcess = child;
      child.stdout.on("data", (chunk) => {
        if (stdoutFormatter) stdoutBuffer += chunk.toString("utf8");
        else appendPipelineLog(chunk);
      });
      child.stderr.on("data", (chunk) => appendPipelineLog(chunk));
      child.on("error", (error) => {
        appendPipelineLog(`Prozessfehler: ${error.message}`);
        pipelineProcess = null;
        resolveRun(1);
      });
      child.on("close", (code) => {
        if (stdoutFormatter && stdoutBuffer.trim()) {
          try {
            appendPipelineLog(stdoutFormatter(stdoutBuffer));
          } catch {
            appendPipelineLog(stdoutBuffer);
          }
        }
        pipelineProcess = null;
        resolveRun(Number.isInteger(code) ? code : 1);
      });
    });
  }

  async function publishPipelineChanges() {
    let code = await runPipelineChild("git", ["diff", "--cached", "--quiet"], "Git-Vorprüfung");
    if (code !== 0) {
      pipelineState.error = "Vor dem Pipeline-Lauf waren bereits Dateien vorgemerkt. Automatischer Commit wurde abgebrochen.";
      appendPipelineLog(pipelineState.error);
      return 1;
    }

    code = await runPipelineChild(
      "git",
      [
        "add",
        "--",
        "species_list.json",
        "speciesData.json",
        "fehlende_elemente_report.json",
        "lastSavedAssessmentId.json",
        "species-assets-overrides.json",
        "docs/manual-map-overrides.md",
        "species-assets",
      ],
      "Git-Dateien vormerken",
    );
    if (code !== 0) return code;

    code = await runPipelineChild("git", ["diff", "--cached", "--quiet"], "Git-Änderungen prüfen");
    if (code === 0) {
      appendPipelineLog("Keine versionierbaren Pipeline-Änderungen vorhanden.");
      pipelineState.gitPublished = true;
      return 0;
    }
    if (code !== 1) return code;

    const publishMode = pipelineState.initialMode || pipelineState.mode;
    const message = publishMode === "cleanup"
      ? "Clean obsolete species data"
      : publishMode === "transfer"
        ? "Transfer pending Explorer changes"
      : publishMode === "manual-maps"
        ? "Refresh automatic distribution maps"
        : publishMode === "nc-sounds"
          ? "Refresh sound assets"
      : publishMode === "all"
        ? "Refresh all species data"
        : "Update incomplete species data";
    code = await runPipelineChild("git", ["commit", "-m", message], "Git-Commit");
    if (code !== 0) return code;
    code = await runPipelineChild("git", ["push"], "Git-Push");
    if (code === 0) pipelineState.gitPublished = true;
    return code;
  }

  async function continueAfterAssetReview() {
    const exitCode = await publishPipelineChanges();
    await finishPipelineRun(exitCode);
  }

  function manualFieldUpdatesForEntry(inputEntry) {
    return {
      "Deutscher Name": inputEntry.german,
      "Wissenschaftlicher Name": `${inputEntry.genus} ${inputEntry.species}`.trim(),
      "Größe": inputEntry.size,
      Gewicht: inputEntry.weight,
      Lebenserwartung: inputEntry.life_expectancy,
      URLSlug: `${inputEntry.genus}${inputEntry.species}`.toLocaleLowerCase("de"),
      Genus: inputEntry.genus,
      Species: inputEntry.species,
    };
  }

  async function transferManualSpeciesEdits(plan) {
    const speciesDataPath = join(repoRoot, "speciesData.json");
    const speciesData = JSON.parse(await readFile(speciesDataPath, "utf8"));
    const dataBySlug = new Map(
      speciesData.map((entry) => [String(entry.URLSlug ?? "").toLocaleLowerCase("de"), entry]),
    );
    let changedSpeciesCount = 0;
    const changedFields = [];
    for (const target of plan.targets ?? []) {
      const dataEntry = dataBySlug.get(String(target.slug ?? "").toLocaleLowerCase("de"));
      if (!dataEntry || !target.entry) continue;
      const updates = manualFieldUpdatesForEntry(target.entry);
      const fieldsForSpecies = [];
      for (const [field, expectedValue] of Object.entries(updates)) {
        const nextValue = expectedValue ?? "";
        if (String(dataEntry[field] ?? "").trim() === String(nextValue).trim()) continue;
        dataEntry[field] = nextValue;
        fieldsForSpecies.push(field);
      }
      if (fieldsForSpecies.length) {
        changedSpeciesCount += 1;
        changedFields.push(`${target.germanName}: ${fieldsForSpecies.join(", ")}`);
      }
    }
    if (!changedSpeciesCount) {
      appendPipelineLog("Keine geaenderten manuellen Eingabefelder mehr gefunden.");
      return 0;
    }
    const tempPath = `${speciesDataPath}.tmp-${randomUUID()}`;
    await writeFile(tempPath, `${JSON.stringify(speciesData, null, 2)}\n`, "utf8");
    await rename(tempPath, speciesDataPath);
    appendPipelineLog(
      `Manuelle Eingabefelder in speciesData.json uebertragen: ${changedSpeciesCount} Art(en).`,
    );
    for (const line of changedFields) appendPipelineLog(`- ${line}`);
    return 0;
  }

  async function removePipelineAssetBackupRun(runId) {
    if (!runId) return;
    const runBackupPath = join(pipelineAssetBackupRoot, runId);
    if (!existsSync(runBackupPath)) return;
    try {
      await rm(runBackupPath, {
        recursive: true,
        force: true,
        maxRetries: 4,
        retryDelay: 250,
      });
    } catch (error) {
      appendPipelineLog(
        `Warnung: Temporärer Pipeline-Backupordner konnte nicht entfernt werden und bleibt zur späteren Bereinigung liegen: ${error.message}`,
      );
    }
  }

  async function finishPipelineRun(exitCode) {
    await unlink(pendingAssetReviewPath).catch(() => {});
    pipelineState.status = exitCode === 0 ? "completed" : "failed";
    pipelineState.exitCode = exitCode;
    pipelineState.completedAt = new Date().toISOString();
    if (exitCode !== 0 && !pipelineState.error) {
      pipelineState.error = `Pipeline wurde mit Code ${exitCode} beendet`;
    }
    if (pipelineState.runId) {
      await removePipelineAssetBackupRun(pipelineState.runId);
    }
    await mkdir(pipelineLogDir, { recursive: true });
    const logName = `pipeline-${compactTimestamp(new Date(pipelineState.startedAt))}-${pipelineState.runId.slice(0, 8)}.log`;
    const logPath = join(pipelineLogDir, logName);
    await writeFile(logPath, `${pipelineState.log.join("\n")}\n`, "utf8");
    pipelineState.logFile = `species-explorer/logs/${logName}`;
    await prunePipelineLogs(pipelineLogDir).catch(() => {});
    await refreshModel({ force: true });
  }

  async function executePipelineRun(plan) {
    if (pipelineState.mode === "cleanup") {
      const exitCode = await runPipelineChild(
        process.execPath,
        [join(repoRoot, "scripts", "species-cleanup.mjs")],
        "Dauerhafte Bereinigung",
      );
      if (exitCode === 0) await continueAfterAssetReview();
      else await finishPipelineRun(exitCode);
      return;
    }

    if (plan.mode === "transfer") {
      const exitCode = await transferManualSpeciesEdits(plan);
      if (exitCode === 0) await continueAfterAssetReview();
      else await finishPipelineRun(exitCode);
      return;
    }

    const updateArgs = [join(repoRoot, "update.mjs"), `--mode=${plan.mode}`];
    if (Array.isArray(plan.targetSlugs) && plan.targetSlugs.length > 0) {
      updateArgs.push(`--species=${plan.targetSlugs.join(",")}`);
    }

    let exitCode = await runPipelineChild(
      process.execPath,
      updateArgs,
      "Datenpipeline",
    );

    const assetOnlyMode = plan.mode === "manual-maps" || plan.mode === "nc-sounds";
    let reviewAssets = exitCode === 0 ? detectNewPipelineAssets(plan) : [];

    if (
      exitCode === 0
      && (
        plan.mode === "all"
        || plan.mode === "missing"
        || (plan.mode === "nc-sounds" && reviewAssets.some((asset) => asset.type === "sound"))
      )
    ) {
      const spectrogramArgs = [join(repoRoot, "scripts", "generate-spectrograms.mjs")];
      if (plan.mode !== "all") {
        const spectrogramSpecies = plan.mode === "nc-sounds"
          ? reviewAssets.filter((asset) => asset.type === "sound").map((asset) => asset.safeName)
          : plan.targets.map((entry) => entry.safeName);
        spectrogramArgs.push(`--species=${spectrogramSpecies.join(",")}`);
      }
      const localFfmpeg = join(repoRoot, "local-tools", "ffmpeg", "bin", "ffmpeg.exe");
      if (existsSync(localFfmpeg)) spectrogramArgs.push(`--ffmpeg=${localFfmpeg}`);
      exitCode = await runPipelineChild(
        process.execPath,
        spectrogramArgs,
        "Spektrogramm-Abgleich",
        { stdoutFormatter: formatSpectrogramPipelineLog },
      );
    }

    if (exitCode === 0 && !assetOnlyMode) {
      exitCode = await runPipelineChild(
        process.execPath,
        [join(repoRoot, "update.mjs"), "--report-only"],
        "Report-Abgleich",
      );
    }

    if (exitCode !== 0) {
      await finishPipelineRun(exitCode);
      return;
    }

    reviewAssets = detectNewPipelineAssets(plan);
    if (reviewAssets.length > 0) {
      pipelineState.status = "awaiting-review";
      pipelineState.phase = "Neue Assets prüfen";
      pipelineState.reviewAssets = reviewAssets;
      appendPipelineLog(`${reviewAssets.length} neue Karte(n)/Sound(s) warten auf Pflegeentscheidung.`);
      await writeFile(pendingAssetReviewPath, `${JSON.stringify(pipelineState, null, 2)}\n`, "utf8");
      await refreshModel({ force: true });
      return;
    }

    if (assetOnlyMode) {
      appendPipelineLog(assetOnlyNoChangeMessage(plan.mode));
      if (pipelineState.publishAfterAssetOnlyNoAssets) {
        pipelineState.publishAfterAssetOnlyNoAssets = false;
        await continueAfterAssetReview();
        return;
      }
      pipelineState.gitPublished = true;
      await finishPipelineRun(0);
      return;
    }

    await continueAfterAssetReview();
  }

  async function startPipeline(payload) {
    cleanupPreviewTokens();
    if (pipelineState.status === "running" || pipelineState.status === "awaiting-review" || pipelineProcess) {
      const error = new Error("Es läuft bereits eine Pipeline");
      error.statusCode = 409;
      throw error;
    }
    if (isBackupActive()) {
      const error = new Error("Während eines laufenden NAS-Backups kann keine Datenbank-Aktion gestartet werden.");
      error.statusCode = 409;
      throw error;
    }
    if (assetWriteActive) {
      const error = new Error("Während eines laufenden Schreibvorgangs kann keine Datenbank-Aktion gestartet werden.");
      error.statusCode = 409;
      throw error;
    }
    const token = String(payload?.token ?? "");
    const preview = previewTokens.get(token);
    if (!preview || preview.type !== "pipeline") {
      const error = new Error("Pipeline-Vorschau ist ungültig oder abgelaufen");
      error.statusCode = 409;
      throw error;
    }
    const tokensMissing =
      (preview.mode === "manual-maps" && !process.env.IUCN_TOKEN)
      || (preview.mode === "nc-sounds" && !process.env.XENO_TOKEN)
      || (
        !["cleanup", "manual-maps", "nc-sounds", "transfer"].includes(preview.mode)
        && (!process.env.IUCN_TOKEN || !process.env.XENO_TOKEN)
      );
    if (tokensMissing) {
      const error = new Error("IUCN_TOKEN oder XENO_TOKEN fehlt in der Server-Umgebung");
      error.statusCode = 409;
      throw error;
    }

    const { plan, sourceRevision } = await readPipelinePlan(preview.mode, preview.targetSlugs ?? []);
    if (sourceRevision !== preview.sourceRevision) {
      previewTokens.delete(token);
      const error = new Error("Artenliste oder Pipeline-Daten wurden seit der Vorschau geändert");
      error.statusCode = 409;
      throw error;
    }
    if (preview.mode !== "all" && !plan.hasWork) {
      previewTokens.delete(token);
      const error = new Error(
        ({
          cleanup: "Es wurden keine verwaisten Daten oder Assetordner gefunden",
          transfer: "Es gibt keine geaenderten manuellen Eingabefelder oder lokalen Asset-Aenderungen",
          missing: "Es gibt keine neuen, fehlenden oder zu entfernenden Arten",
          "manual-maps": "Es gibt keine manuell gepflegten oder fehlenden Karten",
          "nc-sounds": "Es gibt keine ungeschützten NC-Sounds oder fehlenden Sounds",
        })[preview.mode] || "Für diesen Lauf wurden keine Zielarten gefunden",
      );
      error.statusCode = 400;
      throw error;
    }

    previewTokens.delete(token);
    pipelineState = {
      status: "running",
      phase: "Start",
      mode: preview.mode,
      initialMode: preview.mode,
      runId: randomUUID(),
      startedAt: new Date().toISOString(),
      completedAt: "",
      exitCode: null,
      targetCount: preview.mode === "cleanup"
        ? publicCleanupPlan(plan).targetCount
        : plan.targetCount,
      targets: preview.mode === "cleanup"
        ? plan.obsoleteAssetDirectories.map((entry) => ({
          safeName: entry.safeName,
          germanName: entry.safeName,
          scientificName: "",
          reasons: ["verwaister Assetordner wird dauerhaft gelöscht"],
        }))
        : publicPipelinePlan(plan).targets,
      removed: preview.mode === "cleanup" ? plan.obsoleteData : plan.removed,
      pendingFiles: preview.mode === "transfer" ? (plan.pendingFiles ?? []) : [],
      log: [],
      logFile: "",
      error: "",
      reviewAssets: [],
      gitPublished: false,
      publishAfterAssetOnlyNoAssets: false,
    };
    if (preview.mode === "nc-sounds") {
      closeActiveFileStreams((filePath) => extname(filePath).toLowerCase() === ".mp3");
      appendPipelineLog("Offene MP3-Streams im Explorer wurden vor dem Sound-Suchlauf geschlossen.");
      await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
    }
    pipelineAssetSnapshot = ["cleanup", "transfer"].includes(preview.mode) ? new Map() : capturePipelineAssets(plan);
    void executePipelineRun(plan).catch(async (error) => {
      appendPipelineLog(`Unerwarteter Pipelinefehler: ${error.message}`);
      pipelineState.error = error.message;
      await finishPipelineRun(1);
    });
    return pipelineState;
  }

  async function savePipelineAssetReview(payload) {
    if (pipelineState.status !== "awaiting-review") {
      const error = new Error("Es warten keine neuen Assets auf eine Pflegeentscheidung");
      error.statusCode = 409;
      throw error;
    }
    if (String(payload?.runId ?? "") !== pipelineState.runId) {
      const error = new Error("Assetprüfung gehört nicht zum aktuellen Pipeline-Lauf");
      error.statusCode = 409;
      throw error;
    }

    const choices = Array.isArray(payload?.choices) ? payload.choices : [];
    const choicesByKey = new Map(
      choices.map((choice) => {
        const decision = String(
          choice.decision ?? (choice.manual === true ? "manual" : choice.manual === false ? "automatic" : ""),
        );
        return [`${choice.safeName}:${choice.type}`, { ...choice, decision }];
      }),
    );
    for (const asset of pipelineState.reviewAssets) {
      const choice = choicesByKey.get(`${asset.safeName}:${asset.type}`);
      if (!choice || !["automatic", "manual", "reject"].includes(choice.decision)) {
        const error = new Error(`Pflegeentscheidung fehlt für ${asset.germanName} · ${asset.label}`);
        error.statusCode = 400;
        throw error;
      }
      if (choice.decision === "reject" && !["map", "sound"].includes(asset.type)) {
        const error = new Error(`Ablehnen ist für diesen Assettyp nicht möglich: ${asset.germanName}`);
        error.statusCode = 400;
        throw error;
      }
    }

    const registry = await readJson(assetOverridesPath).catch(() => ({ version: 1, assets: {} }));
    registry.version = 1;
    registry.assets ??= {};
    const updatedAt = new Date().toISOString();
    const retryMode = pipelineState.mode === "manual-maps" || pipelineState.mode === "nc-sounds";
    let registryChanged = false;
    let acceptedAny = false;
    let reportNeedsRefresh = false;
    const rejectedSoundAssets = [];
    const restoreOrRemovePipelineAsset = async (asset) => {
      const previous = pipelineAssetSnapshot.get(`${asset.safeName}:${asset.type}`);
      const names = asset.type === "sound"
        ? ["sound.mp3", "credits.json", "spectrogram.webp"]
        : ["map.jpg"];
      for (const fileName of names) {
        const backupPath = asset.backupFiles?.[fileName];
        const allowedBackupRoot = `${resolve(pipelineAssetBackupRoot, pipelineState.runId)}${sep}`;
        const resolvedBackupPath = backupPath ? resolve(backupPath) : "";
        const allowedAssetRoot = `${resolve(repoRoot, "species-assets", asset.safeName)}${sep}`;
        const targetPath = resolve(repoRoot, "species-assets", asset.safeName, fileName);
        if (
          (backupPath && !`${resolvedBackupPath}`.startsWith(allowedBackupRoot))
          || !`${targetPath}`.startsWith(allowedAssetRoot)
        ) {
          throw new Error(`Unsicherer Wiederherstellungspfad für ${asset.germanName}`);
        }
        if (backupPath && existsSync(resolvedBackupPath)) copyFileSync(resolvedBackupPath, targetPath);
        else if (!previous?.exists && existsSync(targetPath)) await unlink(targetPath);
      }
      return previous;
    };
    for (const asset of pipelineState.reviewAssets) {
      const choice = choicesByKey.get(`${asset.safeName}:${asset.type}`);
      const rejectAsset = choice.decision === "reject";
      const rejectSound = rejectAsset && asset.type === "sound";
      if ((retryMode && choice.decision === "manual") || rejectAsset) {
        const rejectedSource = rejectSound ? rejectedSoundSourceFromCredits(asset) : null;
        const previous = await restoreOrRemovePipelineAsset(asset);
        registry.assets[asset.safeName] ??= {};
        if (previous?.override) registry.assets[asset.safeName][asset.type] = previous.override;
        else delete registry.assets[asset.safeName][asset.type];
        if (asset.type === "sound") {
          if (previous?.spectrogramOverride) {
            registry.assets[asset.safeName].spectrogram = previous.spectrogramOverride;
          } else {
            delete registry.assets[asset.safeName].spectrogram;
          }
          if (rejectSound) {
            rejectedSoundAssets.push(asset);
            const restoredOverride = registry.assets[asset.safeName].sound ?? {
              manual: previous?.override?.manual === true,
              reason: previous?.override?.reason
                || "Automatische Soundquelle wurde manuell abgelehnt; Quelle wird kuenftig uebersprungen.",
            };
            registry.assets[asset.safeName].sound = {
              ...addRejectedSoundSource(restoredOverride, rejectedSource),
              updatedAt,
            };
            appendPipelineLog(`Soundquelle abgelehnt und gesperrt: ${asset.germanName} (${rejectedSource.key})`);
            reportNeedsRefresh = true;
          }
        } else if (rejectAsset && asset.type === "map") {
          appendPipelineLog(`Karte abgelehnt und entfernt: ${asset.germanName}`);
          reportNeedsRefresh = true;
        }
        if (Object.keys(registry.assets[asset.safeName]).length === 0) {
          delete registry.assets[asset.safeName];
        }
        registryChanged = true;
        continue;
      }

      acceptedAny = true;
      registry.assets[asset.safeName] ??= {};
      const previousAssetOverride = registry.assets[asset.safeName][asset.type];
      const preservedSoundRejections =
        asset.type === "sound" && Array.isArray(previousAssetOverride?.rejectedSources)
          ? previousAssetOverride.rejectedSources
          : [];
      registry.assets[asset.safeName][asset.type] = {
        ...(preservedSoundRejections.length ? { rejectedSources: preservedSoundRejections } : {}),
        manual: choice.decision === "manual",
        reason: choice.decision === "manual"
          ? "Nach Pipeline-Import von Felix als manuell gepflegt markiert."
          : "Automatisch durch die Pipeline gepflegt.",
        updatedAt,
      };
      registryChanged = true;
    }

    if (registryChanged) {
      const tempPath = `${assetOverridesPath}.tmp-${randomUUID()}`;
      try {
        await writeFile(tempPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
        await rename(tempPath, assetOverridesPath);
      } catch (error) {
        await unlink(tempPath).catch(() => {});
        throw error;
      }
    }

    if (pipelineState.mode === "manual-maps") {
      await synchronizeStoredManualMapDocumentation(registry);
    }

    if (pipelineState.mode === "manual-maps" && acceptedAny) {
      const assessmentIds = await readJson(assessmentIdsPath).catch(() => ({}));
      for (const asset of pipelineState.reviewAssets) {
        const choice = choicesByKey.get(`${asset.safeName}:${asset.type}`);
        if (choice.decision === "manual" || choice.decision === "reject") continue;
        const species = model.species.find((entry) => entry.safeName === asset.safeName);
        if (species?.iucn?.assessmentId && species.iucn.assessmentId !== "Unbekannt") {
          assessmentIds[asset.safeName] = species.iucn.assessmentId;
        }
      }
      const tempPath = `${assessmentIdsPath}.tmp-${randomUUID()}`;
      await writeFile(tempPath, `${JSON.stringify(assessmentIds, null, 2)}\n`, "utf8");
      await rename(tempPath, assessmentIdsPath);
    }

    pipelineState.reviewAssets = [];
    pipelineState.status = "running";
    pipelineState.phase = "Git-Veröffentlichung";
    await unlink(pendingAssetReviewPath).catch(() => {});
    await refreshModel({ force: true });
    const continueReview = async () => {
      if (pipelineState.mode === "nc-sounds" || reportNeedsRefresh) {
        const reportExitCode = await runPipelineChild(
          process.execPath,
          [join(repoRoot, "update.mjs"), "--report-only"],
          "Report-Abgleich",
        );
        if (reportExitCode !== 0) {
          await finishPipelineRun(reportExitCode);
          return;
        }
      }
      if (rejectedSoundAssets.length) {
        const retrySafeNames = new Set(rejectedSoundAssets.map((asset) => asset.safeName));
        const retryTargetSlugs = pipelineState.targets
          .filter((target) => retrySafeNames.has(target.safeName))
          .map((target) => target.slug)
          .filter(Boolean);
        for (const asset of rejectedSoundAssets) {
          if (retryTargetSlugs.length) continue;
          const species = model.species.find((entry) => entry.safeName === asset.safeName);
          if (species?.id) retryTargetSlugs.push(species.id);
        }
        const { plan: retryPlan } = await readPipelinePlan(
          "nc-sounds",
          [...new Set(retryTargetSlugs)],
        );
        if (!retryPlan.hasWork) {
          appendPipelineLog("Keine weitere Soundquelle mehr gefunden; bisherige Änderungen werden veröffentlicht.");
          await continueAfterAssetReview();
          return;
        }
        pipelineState.mode = "nc-sounds";
        pipelineState.phase = "Weitere Soundquelle suchen";
        pipelineState.targetCount = retryPlan.targetCount;
        pipelineState.targets = publicPipelinePlan(retryPlan).targets;
        pipelineState.removed = retryPlan.removed;
        pipelineState.publishAfterAssetOnlyNoAssets = true;
        pipelineAssetSnapshot = capturePipelineAssets(retryPlan);
        appendPipelineLog("Abgelehnter Sound wurde gesperrt. Suche automatisch nach der nächsten Soundquelle.");
        await executePipelineRun(retryPlan);
        return;
      }
      if (!acceptedAny && retryMode && !registryChanged) {
        pipelineState.gitPublished = true;
        await finishPipelineRun(0);
        return;
      }
      await continueAfterAssetReview();
    };
    void continueReview().catch(async (error) => {
      appendPipelineLog(`Git-Veröffentlichung fehlgeschlagen: ${error.message}`);
      pipelineState.error = error.message;
      await finishPipelineRun(1);
    });
    return pipelineState;
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
      child.on("error", (error) => {
        resolveRun({ code: 1, stdout: "", stderr: error.message });
      });
      child.on("close", (code) => {
        resolveRun({
          code: Number.isInteger(code) ? code : 1,
          stdout: Buffer.concat(stdout).toString("utf8").trim(),
          stderr: Buffer.concat(stderr).toString("utf8").trim(),
        });
      });
    });
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
      currentNasBackupRoot,
      "-MaxBackups",
      "10",
    ];
    if (dryRun) args.push("-DryRun");
    if (force) args.push("-Force");
    if (progress) args.push("-Progress");
    return args;
  }

  function parseJsonProcessOutput(output, fallbackMessage) {
    const raw = String(output ?? "").trim();
    if (!raw) {
      throw new Error(fallbackMessage);
    }
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`${fallbackMessage}: ${raw}`);
    }
  }

  function isPipelineActive() {
    return pipelineProcess || pipelineState.status === "running" || pipelineState.status === "awaiting-review";
  }

  function isBackupActive() {
    return backupProcess || backupState.status === "running";
  }

  function appendBackupLog(text) {
    const lines = String(text ?? "").split(/\r?\n/).filter((line) => line.length > 0);
    backupState.log.push(...lines);
    if (backupState.log.length > BACKUP_LOG_LINE_LIMIT) {
      backupState.log.splice(0, backupState.log.length - BACKUP_LOG_LINE_LIMIT);
    }
  }

  function appendBackupProcessOutput(text) {
    for (const line of String(text ?? "").split(/\r?\n/).filter(Boolean)) {
      if (line.startsWith("BACKUP_PROGRESS ")) {
        try {
          const progress = JSON.parse(line.slice("BACKUP_PROGRESS ".length));
          backupState.percent = Number(progress.percent ?? backupState.percent);
          backupState.phase = String(progress.message ?? backupState.phase);
          if (Number.isInteger(progress.fileCount)) backupState.fileCount = progress.fileCount;
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
    if (backupProcess || backupState.status === "running") {
      const error = new Error("Es läuft bereits ein NAS-Backup");
      error.statusCode = 409;
      throw error;
    }
    if (isPipelineActive() || assetWriteActive) {
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
      backupRoot: parsed.backupRoot || currentNasBackupRoot,
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
    if (backupProcess || backupState.status === "running") {
      const error = new Error("Es läuft bereits ein NAS-Backup");
      error.statusCode = 409;
      throw error;
    }
    if (isPipelineActive() || assetWriteActive) {
      const error = new Error("Während Pipeline- oder Asset-Schreibvorgängen kann kein Backup gestartet werden");
      error.statusCode = 409;
      throw error;
    }

    const force = payload?.force === true;
    backupState = {
      status: "running",
      phase: "Backup wird vorbereitet",
      backupRoot: currentNasBackupRoot,
      archivePath: "",
      startedAt: new Date().toISOString(),
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
    appendBackupLog(force ? "NAS-Backup wird erzwungen gestartet." : "NAS-Backup wird gestartet.");
    void executeNasBackupRun(force).catch((error) => {
      backupState.status = "failed";
      backupState.completedAt = new Date().toISOString();
      backupState.error = error.message;
      backupState.phase = "Backup fehlgeschlagen";
      appendBackupLog(`Unerwarteter Backupfehler: ${error.message}`);
    });
    return backupState;
  }

  function executeNasBackupRun(force) {
    return new Promise((resolveRun) => {
      let stdoutBuffer = "";
      const child = spawn(powershellExecutable(), nasBackupArgs({ force, progress: true }), {
        cwd: repoRoot,
        env: {
          ...process.env,
          IUCN_NAS_BACKUP_DIR: currentNasBackupRoot,
        },
        windowsHide: true,
      });
      backupProcess = child;
      child.stdout.on("data", (chunk) => {
        stdoutBuffer += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk) => appendBackupProcessOutput(chunk.toString("utf8")));
      child.on("error", (error) => {
        backupProcess = null;
        backupState.status = "failed";
        backupState.completedAt = new Date().toISOString();
        backupState.error = error.message;
        backupState.phase = "Backup fehlgeschlagen";
        appendBackupLog(`Prozessfehler: ${error.message}`);
        resolveRun();
      });
      child.on("close", (code) => {
        backupProcess = null;
        backupState.completedAt = new Date().toISOString();
        if (code === 0) {
          try {
            const result = parseJsonProcessOutput(stdoutBuffer, "Backup-Lauf lieferte keine gültige Antwort");
            backupState.status = "completed";
            backupState.skipped = Boolean(result.skipped);
            backupState.reason = result.reason || "";
            backupState.archivePath = result.archivePath || result.latestBackup || "";
            backupState.backupRoot = result.backupRoot || currentNasBackupRoot;
            backupState.fileCount = Number(result.fileCount ?? backupState.fileCount);
            backupState.totalBytes = Number(result.totalBytes ?? backupState.totalBytes);
            backupState.retainedBackups = Number(result.retainedBackups ?? 0);
            backupState.removedBackups = Number(result.removedBackups ?? 0);
            backupState.percent = 100;
            backupState.phase = backupState.skipped ? "Kein neues Backup erforderlich" : "Backup abgeschlossen";
            appendBackupLog(
              backupState.skipped
                ? backupState.reason || "Seit dem letzten Backup wurden keine Änderungen erkannt."
                : `Backup erstellt: ${backupState.archivePath}`,
            );
          } catch (error) {
            backupState.status = "failed";
            backupState.error = error.message;
            backupState.phase = "Backup fehlgeschlagen";
            appendBackupLog(error.message);
          }
        } else {
          backupState.status = "failed";
          backupState.error = stdoutBuffer.trim() || `Backup wurde mit Code ${code} beendet`;
          backupState.phase = "Backup fehlgeschlagen";
          appendBackupLog(backupState.error);
        }
        resolveRun();
      });
    });
  }

  async function publishMapAssetChanges(species) {
    if (!publishAssetChanges) {
      return { published: false, skipped: true, commit: "" };
    }
    const paths = [
      `species-assets/${species.safeName}/map.jpg`,
      "species-assets-overrides.json",
      "docs/manual-map-overrides.md",
      "fehlende_elemente_report.json",
    ];
    const stagedBefore = await runCommandCapture("git", ["diff", "--cached", "--quiet"]);
    if (stagedBefore.code !== 0) {
      throw new Error(
        "Vor dem Kartenimport waren bereits Dateien vorgemerkt. Commit und Push wurden nicht gestartet.",
      );
    }
    const staged = await runCommandCapture("git", ["add", "--", ...paths]);
    if (staged.code !== 0) {
      throw new Error(`Git-Dateien konnten nicht vorgemerkt werden: ${staged.stderr || staged.stdout}`);
    }
    const changed = await runCommandCapture("git", ["diff", "--cached", "--quiet"]);
    if (changed.code === 0) return { published: true, skipped: false, commit: "" };
    if (changed.code !== 1) {
      throw new Error(`Git-Änderungen konnten nicht geprüft werden: ${changed.stderr || changed.stdout}`);
    }
    const committed = await runCommandCapture(
      "git",
      ["commit", "-m", `Replace distribution map for ${species.germanName}`],
    );
    if (committed.code !== 0) {
      throw new Error(`Git-Commit fehlgeschlagen: ${committed.stderr || committed.stdout}`);
    }
    const commit = await runCommandCapture("git", ["rev-parse", "--short", "HEAD"]);
    const pushed = await runCommandCapture("git", ["push"]);
    if (pushed.code !== 0) {
      throw new Error(`Git-Push fehlgeschlagen: ${pushed.stderr || pushed.stdout}`);
    }
    return { published: true, skipped: false, commit: commit.stdout };
  }

  async function mapAssetSourceRevision(species) {
    const assetDirectory = join(repoRoot, "species-assets", species.safeName);
    const mapPath = join(assetDirectory, "map.jpg");
    const [registryText, documentationText] = await Promise.all([
      readFile(assetOverridesPath, "utf8").catch(() => '{\n  "version": 1,\n  "assets": {}\n}\n'),
      readFile(manualMapOverridesPath, "utf8"),
    ]);
    const mapBuffer = existsSync(mapPath) ? await readFile(mapPath) : Buffer.alloc(0);
    return {
      revision: hashText(
        `${createHash("sha256").update(mapBuffer).digest("hex")}\n${registryText}\n${documentationText}`,
      ),
      assetDirectory,
      mapPath,
      mapBuffer,
      registryText,
      documentationText,
    };
  }

  async function previewMapAsset(id, payload) {
    cleanupPreviewTokens();
    const allowDuringCurrentReview =
      pipelineState.status === "awaiting-review"
      && String(payload?.pipelineRunId ?? "") === pipelineState.runId
      && pipelineState.targets.some((target) => target.slug === id);
    if (
      pipelineProcess
      || pipelineState.status === "running"
      || (pipelineState.status === "awaiting-review" && !allowDuringCurrentReview)
    ) {
      const error = new Error("Während eines Pipeline-Laufs können keine Karten ersetzt werden");
      error.statusCode = 409;
      throw error;
    }
    const species = findEditableSpecies(model, id);
    if (!species?.inInput) {
      const error = new Error("Art wurde nicht gefunden oder ist nicht bearbeitbar");
      error.statusCode = species ? 409 : 404;
      throw error;
    }
    const validated = await validateMapPreviewPayload(payload, { repoRoot, mapImageRenderer });
    if (validated.errors.length) {
      const error = new Error("Karten-Datei oder Angaben sind ungültig");
      error.statusCode = 400;
      error.details = validated.errors;
      throw error;
    }

    const token = randomUUID();
    const expiresAt = Date.now() + PREVIEW_TOKEN_TTL_MS;
    await mkdir(assetStagingRoot, { recursive: true });
    const stagingPath = join(assetStagingRoot, `${token}.jpg`);
    await writeFile(stagingPath, validated.buffer);
    const source = await mapAssetSourceRevision(species);
    let currentDimensions = null;
    if (source.mapBuffer.length) {
      try {
        currentDimensions = inspectJpeg(source.mapBuffer);
      } catch {
        currentDimensions = null;
      }
    }
    const sha256 = createHash("sha256").update(validated.buffer).digest("hex");
    previewTokens.set(token, {
      type: "map-asset",
      id,
      safeName: species.safeName,
      reason: validated.reason,
      source: validated.source,
      originalName: validated.originalName,
      stagingPath,
      sha256,
      bytes: validated.buffer.length,
      dimensions: validated.dimensions,
      sourceRevision: source.revision,
      expiresAt,
    });
    return {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      species: {
        id: species.id,
        germanName: species.germanName,
        scientificName: species.scientificName,
      },
      currentMap: {
        exists: source.mapBuffer.length > 0,
        bytes: source.mapBuffer.length,
        dimensions: currentDimensions,
        url: source.mapBuffer.length
          ? `/assets/${encodeURIComponent(species.safeName)}/map.jpg?current=${token}`
          : "",
      },
      newMap: {
        bytes: validated.buffer.length,
        dimensions: validated.dimensions,
        sha256,
        url: `/api/species/${encodeURIComponent(id)}/assets/map/preview-file?token=${encodeURIComponent(token)}`,
      },
      reason: validated.reason,
      source: validated.source,
      warnings: [
        "Die vorhandene Karte wird vor dem Austausch lokal gesichert.",
        "Die neue Karte wird als manuell gepflegt markiert und vor automatischen Pipeline-Updates geschützt.",
        "Nach erfolgreichem Speichern werden Karte, Register und Dokumentation automatisch committed und gepusht.",
      ],
    };
  }

  async function saveMapAsset(id, payload) {
    cleanupPreviewTokens();
    const token = String(payload?.token ?? "");
    const preview = previewTokens.get(token);
    if (!preview || preview.type !== "map-asset" || preview.id !== id) {
      const error = new Error("Kartenvorschau ist ungültig oder abgelaufen");
      error.statusCode = 409;
      throw error;
    }
    const allowDuringCurrentReview =
      pipelineState.status === "awaiting-review"
      && String(payload?.pipelineRunId ?? "") === pipelineState.runId
      && pipelineState.targets.some((target) => target.slug === id);
    if (
      assetWriteActive
      || pipelineProcess
      || pipelineState.status === "running"
      || (pipelineState.status === "awaiting-review" && !allowDuringCurrentReview)
    ) {
      const error = new Error("Es läuft bereits ein schreibender Asset- oder Pipeline-Prozess");
      error.statusCode = 409;
      throw error;
    }
    const species = findEditableSpecies(model, id);
    if (!species?.inInput || species.safeName !== preview.safeName) {
      previewTokens.delete(token);
      const error = new Error("Art ist nicht mehr im erwarteten Zustand");
      error.statusCode = 409;
      throw error;
    }
    if (!existsSync(preview.stagingPath)) {
      previewTokens.delete(token);
      const error = new Error("Vorgemerkte Kartendatei fehlt");
      error.statusCode = 409;
      throw error;
    }
    const stagedBuffer = await readFile(preview.stagingPath);
    const stagedHash = createHash("sha256").update(stagedBuffer).digest("hex");
    if (stagedHash !== preview.sha256) {
      previewTokens.delete(token);
      const error = new Error("Vorgemerkte Kartendatei wurde verändert");
      error.statusCode = 409;
      throw error;
    }
    const source = await mapAssetSourceRevision(species);
    if (source.revision !== preview.sourceRevision) {
      previewTokens.delete(token);
      rmSync(preview.stagingPath, { force: true });
      const error = new Error("Karte oder Pflegeangaben wurden seit der Vorschau geändert");
      error.statusCode = 409;
      throw error;
    }
    if (publishAssetChanges) {
      const stagedBefore = await runCommandCapture("git", ["diff", "--cached", "--quiet"]);
      if (stagedBefore.code !== 0) {
        const error = new Error(
          "Vor dem Kartenimport sind bereits Dateien für Git vorgemerkt. Bitte diese zuerst committen oder aus dem Index entfernen.",
        );
        error.statusCode = 409;
        throw error;
      }
    }

    assetWriteActive = true;
    let backupRelativePath = "";
    try {
      const assetDirectory = join(repoRoot, "species-assets", species.safeName);
      await mkdir(assetDirectory, { recursive: true });
      const registry = JSON.parse(source.registryText);
      if (source.mapBuffer.length) {
        const currentHash = createHash("sha256").update(source.mapBuffer).digest("hex");
        backupRelativePath = await writeManagedAssetBackup({
          repoRoot,
          assetBackupRoot,
          species,
          assetType: "map",
          files: [{ fileName: "map.jpg", buffer: source.mapBuffer }],
          metadata: {
            action: "replace",
            sha256: currentHash,
            override: registry.assets?.[species.safeName]?.map ?? null,
          },
        });
      }

      registry.version = 1;
      registry.assets ??= {};
      registry.assets[species.safeName] ??= {};
      const updatedAt = new Date().toISOString();
      registry.assets[species.safeName].map = {
        manual: true,
        protectFromPipeline: true,
        reason: preview.reason,
        source: preview.source,
        germanName: species.germanName,
        originalFileName: preview.originalName,
        importedAt: updatedAt,
        updatedAt,
        sha256: preview.sha256,
      };
      const nextRegistryText = `${JSON.stringify(registry, null, 2)}\n`;
      const nextDocumentationText = synchronizeManualMapDocumentation(
        source.documentationText,
        registry,
      );

      const mapTempPath = `${source.mapPath}.tmp-${randomUUID()}`;
      const registryTempPath = `${assetOverridesPath}.tmp-${randomUUID()}`;
      const documentationTempPath = `${manualMapOverridesPath}.tmp-${randomUUID()}`;
      try {
        await writeFile(mapTempPath, stagedBuffer);
        await rename(mapTempPath, source.mapPath);
        await writeFile(registryTempPath, nextRegistryText, "utf8");
        await rename(registryTempPath, assetOverridesPath);
        await writeFile(documentationTempPath, nextDocumentationText, "utf8");
        await rename(documentationTempPath, manualMapOverridesPath);
      } catch (error) {
        await unlink(mapTempPath).catch(() => {});
        await unlink(registryTempPath).catch(() => {});
        await unlink(documentationTempPath).catch(() => {});
        if (source.mapBuffer.length) await writeFile(source.mapPath, source.mapBuffer);
        else await unlink(source.mapPath).catch(() => {});
        await writeFile(assetOverridesPath, source.registryText, "utf8");
        await writeFile(manualMapOverridesPath, source.documentationText, "utf8");
        throw error;
      }

      previewTokens.delete(token);
      rmSync(preview.stagingPath, { force: true });
      let backupRetention = { kept: 0, removed: 0, bytes: 0 };
      let backupCleanupWarning = "";
      try {
        backupRetention = await pruneAssetBackups(assetBackupRoot);
      } catch (error) {
        backupCleanupWarning = `Assetbackup-Bereinigung fehlgeschlagen: ${error.message}`;
      }
      if (rebuildReportAfterAssetSave) {
        const reportRun = await runCommandCapture(process.execPath, [join(repoRoot, "update.mjs"), "--report-only"]);
        if (reportRun.code !== 0) {
          throw new Error(`Report konnte nach dem Kartenimport nicht aktualisiert werden: ${reportRun.stderr || reportRun.stdout}`);
        }
      }
      await refreshModel({ force: true });
      let publication;
      let publicationError = "";
      try {
        publication = await publishMapAssetChanges(species);
      } catch (error) {
        publication = { published: false, skipped: false, commit: "" };
        publicationError = error.message;
      }
      return {
        ok: !publicationError,
        saved: true,
        backup: backupRelativePath,
        backupRetention,
        backupCleanupWarning,
        gitPublished: publication.published,
        gitSkipped: publication.skipped,
        gitCommit: publication.commit,
        publicationError,
        species: model.species.find((entry) => entry.id === id) ?? null,
        summary: model.summary,
        validation: model.validation,
      };
    } finally {
      assetWriteActive = false;
    }
  }

  async function publishSoundAssetChanges(species, { message = "", includeReport = false } = {}) {
    if (!publishAssetChanges) {
      return { published: false, skipped: true, commit: "" };
    }
    const paths = [
      `species-assets/${species.safeName}/sound.mp3`,
      `species-assets/${species.safeName}/credits.json`,
      `species-assets/${species.safeName}/spectrogram.webp`,
      "species-assets-overrides.json",
    ];
    if (includeReport) paths.push("fehlende_elemente_report.json");
    const stagedBefore = await runCommandCapture("git", ["diff", "--cached", "--quiet"]);
    if (stagedBefore.code !== 0) {
      throw new Error(
        "Vor dem Soundimport waren bereits Dateien vorgemerkt. Commit und Push wurden nicht gestartet.",
      );
    }
    const staged = await runCommandCapture("git", ["add", "--", ...paths]);
    if (staged.code !== 0) {
      throw new Error(`Git-Dateien konnten nicht vorgemerkt werden: ${staged.stderr || staged.stdout}`);
    }
    const changed = await runCommandCapture("git", ["diff", "--cached", "--quiet"]);
    if (changed.code === 0) return { published: true, skipped: false, commit: "" };
    if (changed.code !== 1) {
      throw new Error(`Git-Änderungen konnten nicht geprüft werden: ${changed.stderr || changed.stdout}`);
    }
    const committed = await runCommandCapture(
      "git",
      ["commit", "-m", message || `Replace sound and credits for ${species.germanName}`],
    );
    if (committed.code !== 0) {
      throw new Error(`Git-Commit fehlgeschlagen: ${committed.stderr || committed.stdout}`);
    }
    const commit = await runCommandCapture("git", ["rev-parse", "--short", "HEAD"]);
    const pushed = await runCommandCapture("git", ["push"]);
    if (pushed.code !== 0) {
      throw new Error(`Git-Push fehlgeschlagen: ${pushed.stderr || pushed.stdout}`);
    }
    return { published: true, skipped: false, commit: commit.stdout };
  }

  async function soundAssetSourceRevision(species) {
    const assetDirectory = join(repoRoot, "species-assets", species.safeName);
    const soundPath = join(assetDirectory, "sound.mp3");
    const creditsPath = join(assetDirectory, "credits.json");
    const spectrogramPath = join(assetDirectory, "spectrogram.webp");
    const [registryText, soundBuffer, creditsBuffer, spectrogramBuffer] = await Promise.all([
      readFile(assetOverridesPath, "utf8").catch(() => '{\n  "version": 1,\n  "assets": {}\n}\n'),
      existsSync(soundPath) ? readFile(soundPath) : Promise.resolve(Buffer.alloc(0)),
      existsSync(creditsPath) ? readFile(creditsPath) : Promise.resolve(Buffer.alloc(0)),
      existsSync(spectrogramPath) ? readFile(spectrogramPath) : Promise.resolve(Buffer.alloc(0)),
    ]);
    const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");
    return {
      revision: hashText(
        `${digest(soundBuffer)}\n${digest(creditsBuffer)}\n${digest(spectrogramBuffer)}\n${registryText}`,
      ),
      assetDirectory,
      soundPath,
      creditsPath,
      spectrogramPath,
      soundBuffer,
      creditsBuffer,
      spectrogramBuffer,
      registryText,
    };
  }

  async function previewSoundAsset(id, payload) {
    cleanupPreviewTokens();
    if (pipelineProcess || pipelineState.status === "running" || pipelineState.status === "awaiting-review") {
      const error = new Error("Während eines Pipeline-Laufs können keine Sounds ersetzt werden");
      error.statusCode = 409;
      throw error;
    }
    const species = findEditableSpecies(model, id);
    if (!species?.inInput) {
      const error = new Error("Art wurde nicht gefunden oder ist nicht bearbeitbar");
      error.statusCode = species ? 409 : 404;
      throw error;
    }
    const validated = validateSoundPreviewPayload(payload, species);
    if (validated.errors.length) {
      const error = new Error("MP3-Datei oder Credits sind ungültig");
      error.statusCode = 400;
      error.details = validated.errors;
      throw error;
    }

    const token = randomUUID();
    const expiresAt = Date.now() + PREVIEW_TOKEN_TTL_MS;
    await mkdir(assetStagingRoot, { recursive: true });
    const stagingPath = join(assetStagingRoot, `${token}.mp3`);
    await writeFile(stagingPath, validated.buffer);
    const source = await soundAssetSourceRevision(species);
    const sha256 = createHash("sha256").update(validated.buffer).digest("hex");
    const creditsText = `${JSON.stringify(validated.credits, null, 2)}\n`;
    const creditsSha256 = createHash("sha256").update(creditsText).digest("hex");
    previewTokens.set(token, {
      type: "sound-asset",
      id,
      safeName: species.safeName,
      reason: validated.reason,
      originalName: validated.originalName,
      credits: validated.credits,
      creditsText,
      creditsSha256,
      stagingPath,
      sha256,
      bytes: validated.buffer.length,
      sourceRevision: source.revision,
      expiresAt,
      isNc: validated.isNc,
    });
    return {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      species: {
        id: species.id,
        germanName: species.germanName,
        scientificName: species.scientificName,
      },
      currentSound: {
        exists: source.soundBuffer.length > 0,
        bytes: source.soundBuffer.length,
        url: source.soundBuffer.length
          ? `/assets/${encodeURIComponent(species.safeName)}/sound.mp3?current=${token}`
          : "",
        credits: species.credits ?? null,
      },
      newSound: {
        bytes: validated.buffer.length,
        sha256,
        url: `/api/species/${encodeURIComponent(id)}/assets/sound/preview-file?token=${encodeURIComponent(token)}`,
        credits: validated.credits,
        isNc: validated.isNc,
      },
      reason: validated.reason,
      warnings: [
        "Sound, Credits und vorhandenes Spektrogramm werden vor dem Austausch gemeinsam gesichert.",
        "Vor dem Speichern wird automatisch ein neues Spektrogramm für die ausgewählte MP3 erzeugt.",
        validated.isNc
          ? "Die angegebene Lizenz ist nicht-kommerziell (NC) und bleibt als Prüfhinweis sichtbar."
          : "Die Lizenz wird gespeichert, aber nicht automatisch rechtlich freigegeben.",
        "Sound, Credits, neues Spektrogramm und Hash-Metadaten werden gemeinsam committed und gepusht.",
      ],
    };
  }

  async function saveSoundAsset(id, payload) {
    cleanupPreviewTokens();
    const token = String(payload?.token ?? "");
    const preview = previewTokens.get(token);
    if (!preview || preview.type !== "sound-asset" || preview.id !== id) {
      const error = new Error("Soundvorschau ist ungültig oder abgelaufen");
      error.statusCode = 409;
      throw error;
    }
    if (assetWriteActive || pipelineProcess || pipelineState.status === "running" || pipelineState.status === "awaiting-review") {
      const error = new Error("Es läuft bereits ein schreibender Asset- oder Pipeline-Prozess");
      error.statusCode = 409;
      throw error;
    }
    const species = findEditableSpecies(model, id);
    if (!species?.inInput || species.safeName !== preview.safeName) {
      previewTokens.delete(token);
      const error = new Error("Art ist nicht mehr im erwarteten Zustand");
      error.statusCode = 409;
      throw error;
    }
    if (!existsSync(preview.stagingPath)) {
      previewTokens.delete(token);
      const error = new Error("Vorgemerkte MP3-Datei fehlt");
      error.statusCode = 409;
      throw error;
    }
    const stagedBuffer = await readFile(preview.stagingPath);
    const stagedHash = createHash("sha256").update(stagedBuffer).digest("hex");
    if (stagedHash !== preview.sha256) {
      previewTokens.delete(token);
      const error = new Error("Vorgemerkte MP3-Datei wurde verändert");
      error.statusCode = 409;
      throw error;
    }
    const source = await soundAssetSourceRevision(species);
    if (source.revision !== preview.sourceRevision) {
      previewTokens.delete(token);
      rmSync(preview.stagingPath, { force: true });
      const error = new Error("Sound, Credits oder Pflegeangaben wurden seit der Vorschau geändert");
      error.statusCode = 409;
      throw error;
    }
    if (publishAssetChanges) {
      const stagedBefore = await runCommandCapture("git", ["diff", "--cached", "--quiet"]);
      if (stagedBefore.code !== 0) {
        const error = new Error(
          "Vor dem Soundimport sind bereits Dateien für Git vorgemerkt. Bitte diese zuerst committen oder aus dem Index entfernen.",
        );
        error.statusCode = 409;
        throw error;
      }
    }

    assetWriteActive = true;
    let backupRelativePath = "";
    const spectrogramStagingPath = join(assetStagingRoot, `${token}.webp`);
    try {
      preview.spectrogramStagingPath = spectrogramStagingPath;
      let renderedSpectrogram;
      try {
        renderedSpectrogram = await spectrogramRenderer({
          inputPath: preview.stagingPath,
          outputPath: spectrogramStagingPath,
          ffmpegPath: resolveFfmpegPath({ repoRoot }),
          options: DEFAULT_SPECTROGRAM_OPTIONS,
        });
      } catch (error) {
        await unlink(spectrogramStagingPath).catch(() => {});
        const generationError = new Error(
          `Sound wurde nicht gespeichert, weil das Spektrogramm nicht erzeugt werden konnte: ${error.message}`,
        );
        generationError.statusCode = 500;
        throw generationError;
      }
      let stagedSpectrogramBuffer;
      try {
        stagedSpectrogramBuffer = await readFile(spectrogramStagingPath);
        inspectWebp(stagedSpectrogramBuffer);
      } catch (error) {
        await unlink(spectrogramStagingPath).catch(() => {});
        const validationError = new Error(
          `Sound wurde nicht gespeichert, weil das erzeugte Spektrogramm ungültig ist: ${error.message}`,
        );
        validationError.statusCode = 500;
        throw validationError;
      }
      const spectrogramSha256 = createHash("sha256").update(stagedSpectrogramBuffer).digest("hex");

      await mkdir(source.assetDirectory, { recursive: true });
      const registry = JSON.parse(source.registryText);
      if (source.soundBuffer.length || source.creditsBuffer.length || source.spectrogramBuffer.length) {
        const currentHash = createHash("sha256")
          .update(source.soundBuffer)
          .update(source.creditsBuffer)
          .digest("hex");
        backupRelativePath = await writeManagedAssetBackup({
          repoRoot,
          assetBackupRoot,
          species,
          assetType: "sound",
          files: [
            { fileName: "sound.mp3", buffer: source.soundBuffer },
            { fileName: "credits.json", buffer: source.creditsBuffer },
            { fileName: "spectrogram.webp", buffer: source.spectrogramBuffer },
          ],
          metadata: {
            action: "replace",
            sha256: currentHash,
            override: registry.assets?.[species.safeName]?.sound ?? null,
            spectrogramOverride: registry.assets?.[species.safeName]?.spectrogram ?? null,
          },
        });
      }

      registry.version = 1;
      registry.assets ??= {};
      registry.spectrogramGenerator = {
        version: 1,
        ...DEFAULT_SPECTROGRAM_OPTIONS,
      };
      registry.assets[species.safeName] ??= {};
      const updatedAt = new Date().toISOString();
      registry.assets[species.safeName].sound = {
        manual: true,
        protectFromPipeline: true,
        reason: preview.reason,
        source: preview.credits.source,
        originalUrl: preview.credits.url,
        license: preview.credits.license,
        germanName: species.germanName,
        originalFileName: preview.originalName,
        importedAt: updatedAt,
        updatedAt,
        sha256: preview.sha256,
        creditsSha256: preview.creditsSha256,
        isNc: preview.isNc,
      };
      registry.assets[species.safeName].spectrogram = {
        stale: false,
        soundSha256: preview.sha256,
        spectrogramSha256,
        generatedAt: updatedAt,
        verifiedAt: updatedAt,
      };
      const nextRegistryText = `${JSON.stringify(registry, null, 2)}\n`;

      const soundTempPath = `${source.soundPath}.tmp-${randomUUID()}`;
      const creditsTempPath = `${source.creditsPath}.tmp-${randomUUID()}`;
      const spectrogramTempPath = `${source.spectrogramPath}.tmp-${randomUUID()}`;
      const registryTempPath = `${assetOverridesPath}.tmp-${randomUUID()}`;
      try {
        await writeFile(soundTempPath, stagedBuffer);
        await writeFile(creditsTempPath, preview.creditsText, "utf8");
        await writeFile(spectrogramTempPath, stagedSpectrogramBuffer);
        await writeFile(registryTempPath, nextRegistryText, "utf8");
        await rename(soundTempPath, source.soundPath);
        await rename(creditsTempPath, source.creditsPath);
        await rename(spectrogramTempPath, source.spectrogramPath);
        await rename(registryTempPath, assetOverridesPath);
      } catch (error) {
        await unlink(soundTempPath).catch(() => {});
        await unlink(creditsTempPath).catch(() => {});
        await unlink(spectrogramTempPath).catch(() => {});
        await unlink(registryTempPath).catch(() => {});
        if (source.soundBuffer.length) await writeFile(source.soundPath, source.soundBuffer);
        else await unlink(source.soundPath).catch(() => {});
        if (source.creditsBuffer.length) await writeFile(source.creditsPath, source.creditsBuffer);
        else await unlink(source.creditsPath).catch(() => {});
        if (source.spectrogramBuffer.length) await writeFile(source.spectrogramPath, source.spectrogramBuffer);
        else await unlink(source.spectrogramPath).catch(() => {});
        await writeFile(assetOverridesPath, source.registryText, "utf8");
        throw error;
      }

      previewTokens.delete(token);
      rmSync(preview.stagingPath, { force: true });
      rmSync(spectrogramStagingPath, { force: true });
      let backupRetention = { kept: 0, removed: 0, bytes: 0 };
      let backupCleanupWarning = "";
      try {
        backupRetention = await pruneAssetBackups(assetBackupRoot);
      } catch (error) {
        backupCleanupWarning = `Assetbackup-Bereinigung fehlgeschlagen: ${error.message}`;
      }
      if (rebuildReportAfterAssetSave) {
        const reportRun = await runCommandCapture(process.execPath, [join(repoRoot, "update.mjs"), "--report-only"]);
        if (reportRun.code !== 0) {
          throw new Error(`Report konnte nach dem Soundimport nicht aktualisiert werden: ${reportRun.stderr || reportRun.stdout}`);
        }
      }
      await refreshModel({ force: true });
      let publication;
      let publicationError = "";
      try {
        publication = await publishSoundAssetChanges(species);
      } catch (error) {
        publication = { published: false, skipped: false, commit: "" };
        publicationError = error.message;
      }
      return {
        ok: !publicationError,
        saved: true,
        backup: backupRelativePath,
        backupRetention,
        backupCleanupWarning,
        gitPublished: publication.published,
        gitSkipped: publication.skipped,
        gitCommit: publication.commit,
        publicationError,
        spectrogramGenerated: true,
        spectrogramBytes: renderedSpectrogram.outputBytes ?? stagedSpectrogramBuffer.length,
        spectrogramStale: false,
        soundSha256: preview.sha256,
        spectrogramSha256,
        isNc: preview.isNc,
        species: model.species.find((entry) => entry.id === id) ?? null,
        summary: model.summary,
        validation: model.validation,
      };
    } finally {
      assetWriteActive = false;
    }
  }

  async function rejectCurrentSoundAsset(id) {
    cleanupPreviewTokens();
    if (assetWriteActive || pipelineProcess || pipelineState.status === "running" || pipelineState.status === "awaiting-review") {
      const error = new Error("Es läuft bereits ein schreibender Asset- oder Pipeline-Prozess");
      error.statusCode = 409;
      throw error;
    }
    const species = findEditableSpecies(model, id);
    if (!species?.inInput) {
      const error = new Error("Art wurde nicht gefunden oder ist nicht bearbeitbar");
      error.statusCode = species ? 409 : 404;
      throw error;
    }
    const source = await soundAssetSourceRevision(species);
    if (!source.soundBuffer.length && !source.creditsBuffer.length && !source.spectrogramBuffer.length) {
      const error = new Error("Für diese Art ist kein aktueller Sound vorhanden, der abgelehnt werden kann");
      error.statusCode = 409;
      throw error;
    }
    if (publishAssetChanges) {
      const stagedBefore = await runCommandCapture("git", ["diff", "--cached", "--quiet"]);
      if (stagedBefore.code !== 0) {
        const error = new Error(
          "Vor der Sound-Ablehnung sind bereits Dateien für Git vorgemerkt. Bitte diese zuerst committen oder aus dem Index entfernen.",
        );
        error.statusCode = 409;
        throw error;
      }
    }

    assetWriteActive = true;
    let backupRelativePath = "";
    const reportPath = join(repoRoot, "fehlende_elemente_report.json");
    const reportText = await readFile(reportPath, "utf8").catch(() => "");
    try {
      await mkdir(source.assetDirectory, { recursive: true });
      const registry = JSON.parse(source.registryText);
      const currentHash = createHash("sha256")
        .update(source.soundBuffer)
        .update(source.creditsBuffer)
        .update(source.spectrogramBuffer)
        .digest("hex");
      backupRelativePath = await writeManagedAssetBackup({
        repoRoot,
        assetBackupRoot,
        species,
        assetType: "sound",
        files: [
          { fileName: "sound.mp3", buffer: source.soundBuffer },
          { fileName: "credits.json", buffer: source.creditsBuffer },
          { fileName: "spectrogram.webp", buffer: source.spectrogramBuffer },
        ],
        metadata: {
          action: "reject",
          sha256: currentHash,
          override: registry.assets?.[species.safeName]?.sound ?? null,
          spectrogramOverride: registry.assets?.[species.safeName]?.spectrogram ?? null,
        },
      });

      const rejectedSource = rejectedSoundSourceFromCredits({ safeName: species.safeName });
      registry.version = 1;
      registry.assets ??= {};
      registry.assets[species.safeName] ??= {};
      const previousSoundOverride = registry.assets[species.safeName].sound ?? {};
      registry.assets[species.safeName].sound = {
        ...addRejectedSoundSource(previousSoundOverride, rejectedSource),
        manual: false,
        protectFromPipeline: false,
        reason: "Aktuelle Soundquelle wurde manuell abgelehnt; Quelle wird künftig übersprungen.",
        rejectedCurrent: true,
        rejectedAt: rejectedSource.rejectedAt,
        updatedAt: rejectedSource.rejectedAt,
      };
      delete registry.assets[species.safeName].spectrogram;
      const nextRegistryText = `${JSON.stringify(registry, null, 2)}\n`;
      const registryTempPath = `${assetOverridesPath}.tmp-${randomUUID()}`;

      try {
        await writeFile(registryTempPath, nextRegistryText, "utf8");
        await unlink(source.soundPath).catch(() => {});
        await unlink(source.creditsPath).catch(() => {});
        await unlink(source.spectrogramPath).catch(() => {});
        await rename(registryTempPath, assetOverridesPath);
      } catch (error) {
        await unlink(registryTempPath).catch(() => {});
        if (source.soundBuffer.length) await writeFile(source.soundPath, source.soundBuffer);
        if (source.creditsBuffer.length) await writeFile(source.creditsPath, source.creditsBuffer);
        if (source.spectrogramBuffer.length) await writeFile(source.spectrogramPath, source.spectrogramBuffer);
        await writeFile(assetOverridesPath, source.registryText, "utf8");
        throw error;
      }

      if (rebuildReportAfterAssetSave) {
        const reportRun = await runCommandCapture(process.execPath, [join(repoRoot, "update.mjs"), "--report-only"]);
        if (reportRun.code !== 0) {
          if (source.soundBuffer.length) await writeFile(source.soundPath, source.soundBuffer);
          if (source.creditsBuffer.length) await writeFile(source.creditsPath, source.creditsBuffer);
          if (source.spectrogramBuffer.length) await writeFile(source.spectrogramPath, source.spectrogramBuffer);
          await writeFile(assetOverridesPath, source.registryText, "utf8");
          if (reportText) await writeFile(reportPath, reportText, "utf8");
          throw new Error(`Report-Abgleich nach Sound-Ablehnung fehlgeschlagen: ${reportRun.stderr || reportRun.stdout}`);
        }
      }

      let backupRetention = { kept: 0, removed: 0, bytes: 0 };
      let backupCleanupWarning = "";
      try {
        backupRetention = await pruneAssetBackups(assetBackupRoot);
      } catch (error) {
        backupCleanupWarning = `Assetbackup-Bereinigung fehlgeschlagen: ${error.message}`;
      }
      await refreshModel({ force: true });
      let publication;
      let publicationError = "";
      try {
        publication = await publishSoundAssetChanges(species, {
          message: `Reject sound source for ${species.germanName}`,
          includeReport: true,
        });
      } catch (error) {
        publication = { published: false, skipped: false, commit: "" };
        publicationError = error.message;
      }
      return {
        ok: !publicationError,
        saved: true,
        rejectedSource,
        backup: backupRelativePath,
        backupRetention,
        backupCleanupWarning,
        gitPublished: publication.published,
        gitSkipped: publication.skipped,
        gitCommit: publication.commit,
        publicationError,
        species: model.species.find((entry) => entry.id === id) ?? null,
        summary: model.summary,
        validation: model.validation,
      };
    } finally {
      assetWriteActive = false;
    }
  }

  async function publishPortraitAssetChanges(species) {
    if (!publishAssetChanges) {
      return { published: false, skipped: true, commit: "" };
    }
    const paths = [
      `species-assets/${species.safeName}/portrait.webp`,
      `species-assets/${species.safeName}/portrait.json`,
      "species-assets-overrides.json",
    ];
    const stagedBefore = await runCommandCapture("git", ["diff", "--cached", "--quiet"]);
    if (stagedBefore.code !== 0) {
      throw new Error(
        "Vor der Porträtübernahme waren bereits Dateien vorgemerkt. Commit und Push wurden nicht gestartet.",
      );
    }
    const staged = await runCommandCapture("git", ["add", "--", ...paths]);
    if (staged.code !== 0) {
      throw new Error(`Porträtdateien konnten nicht vorgemerkt werden: ${staged.stderr || staged.stdout}`);
    }
    const changed = await runCommandCapture("git", ["diff", "--cached", "--quiet"]);
    if (changed.code === 0) return { published: true, skipped: false, commit: "" };
    if (changed.code !== 1) {
      throw new Error(`Git-Änderungen konnten nicht geprüft werden: ${changed.stderr || changed.stdout}`);
    }
    const committed = await runCommandCapture(
      "git",
      ["commit", "-m", `Add species portrait for ${species.germanName}`],
    );
    if (committed.code !== 0) {
      throw new Error(`Git-Commit fehlgeschlagen: ${committed.stderr || committed.stdout}`);
    }
    const commit = await runCommandCapture("git", ["rev-parse", "--short", "HEAD"]);
    const pushed = await runCommandCapture("git", ["push"]);
    if (pushed.code !== 0) {
      throw new Error(`Git-Push fehlgeschlagen: ${pushed.stderr || pushed.stdout}`);
    }
    return { published: true, skipped: false, commit: commit.stdout };
  }

  async function portraitAssetSourceRevision(species) {
    const assetDirectory = join(repoRoot, "species-assets", species.safeName);
    const portraitPath = join(assetDirectory, "portrait.webp");
    const metadataPath = join(assetDirectory, "portrait.json");
    const [registryText, portraitBuffer, metadataBuffer] = await Promise.all([
      readFile(assetOverridesPath, "utf8").catch(() => '{\n  "version": 1,\n  "assets": {}\n}\n'),
      existsSync(portraitPath) ? readFile(portraitPath) : Promise.resolve(Buffer.alloc(0)),
      existsSync(metadataPath) ? readFile(metadataPath) : Promise.resolve(Buffer.alloc(0)),
    ]);
    const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");
    return {
      revision: hashText(`${digest(portraitBuffer)}\n${digest(metadataBuffer)}\n${registryText}`),
      assetDirectory,
      portraitPath,
      metadataPath,
      portraitBuffer,
      metadataBuffer,
      registryText,
    };
  }

  function removePreviousPortraitPreviews(id) {
    for (const [token, preview] of previewTokens) {
      if (preview.type !== "portrait-asset" || preview.id !== id) continue;
      if (preview.stagingPath) rmSync(preview.stagingPath, { force: true });
      if (preview.inputStagingPath) rmSync(preview.inputStagingPath, { force: true });
      previewTokens.delete(token);
    }
  }

  function createPortraitPrompt(id, payload) {
    cleanupPreviewTokens();
    const species = findEditableSpecies(model, id);
    if (!species?.inInput) {
      const error = new Error("Art wurde nicht gefunden oder ist nicht bearbeitbar");
      error.statusCode = species ? 409 : 404;
      throw error;
    }
    const additionalInstructions = String(payload?.additionalInstructions ?? "").trim();
    if (additionalInstructions.length > MAX_PORTRAIT_INSTRUCTIONS_LENGTH) {
      const error = new Error(
        `Zusätzliche Hinweise dürfen maximal ${MAX_PORTRAIT_INSTRUCTIONS_LENGTH} Zeichen enthalten`,
      );
      error.statusCode = 400;
      throw error;
    }
    const prompt = buildPortraitPrompt({
      germanName: species.germanName,
      scientificName: species.scientificName,
      additionalInstructions,
    });
    return {
      species: {
        id: species.id,
        germanName: species.germanName,
        scientificName: species.scientificName,
        safeName: species.safeName,
      },
      prompt,
      promptVersion: PORTRAIT_STANDARD.promptVersion,
      promptSha256: portraitPromptSha256(prompt),
      fileName: `${species.safeName}.png`,
      instructions: [
        "Prompt in ChatGPT einfügen und dort ein Bild erzeugen.",
        `Bild als ${species.safeName}.png, .jpg oder .webp speichern.`,
        "Bild anschließend in der App prüfen und übernehmen.",
      ],
    };
  }

  async function previewPortraitAsset(id, payload) {
    cleanupPreviewTokens();
    if (pipelineProcess || pipelineState.status === "running" || pipelineState.status === "awaiting-review") {
      const error = new Error("Während eines Pipeline-Laufs können keine Artporträts importiert werden");
      error.statusCode = 409;
      throw error;
    }
    if (assetWriteActive) {
      const error = new Error("Es läuft bereits ein schreibender Assetprozess");
      error.statusCode = 409;
      throw error;
    }
    const species = findEditableSpecies(model, id);
    if (!species?.inInput) {
      const error = new Error("Art wurde nicht gefunden oder ist nicht bearbeitbar");
      error.statusCode = species ? 409 : 404;
      throw error;
    }
    const validated = validatePortraitPreviewPayload(payload, species);
    if (validated.errors.length) {
      const error = new Error("Artporträt-Datei oder Angaben sind ungültig");
      error.statusCode = 400;
      error.details = validated.errors;
      throw error;
    }
    const source = await portraitAssetSourceRevision(species);
    removePreviousPortraitPreviews(id);
    const token = randomUUID();
    const expiresAt = Date.now() + PREVIEW_TOKEN_TTL_MS;
    const importedAt = new Date().toISOString();
    const inputExtension = validated.image.format === "jpeg"
      ? ".jpg"
      : `.${validated.image.format}`;
    await mkdir(assetStagingRoot, { recursive: true });
    const inputStagingPath = join(assetStagingRoot, `${token}.portrait-input${inputExtension}`);
    const stagingPath = join(assetStagingRoot, `${token}.portrait.webp`);
    await writeFile(inputStagingPath, validated.buffer);
    try {
      const rendered = await portraitRenderer({
        inputPath: inputStagingPath,
        outputPath: stagingPath,
        ffmpegPath: resolveFfmpegPath({ repoRoot }),
        options: DEFAULT_PORTRAIT_OPTIONS,
      });
      const renderedBuffer = await readFile(stagingPath);
      inspectWebp(renderedBuffer);
      const sha256 = createHash("sha256").update(renderedBuffer).digest("hex");
      previewTokens.set(token, {
        type: "portrait-asset",
        id,
        safeName: species.safeName,
        inputStagingPath,
        stagingPath,
        sha256,
        bytes: renderedBuffer.length,
        sourceRevision: source.revision,
        expiresAt,
        importedAt,
        additionalInstructions: validated.additionalInstructions,
        prompt: validated.prompt,
        promptSha256: validated.promptSha256,
        originalName: validated.originalName,
        originalFormat: validated.image.format,
        originalDimensions: {
          width: validated.image.width,
          height: validated.image.height,
        },
      });
      return {
        token,
        expiresAt: new Date(expiresAt).toISOString(),
        species: {
          id: species.id,
          germanName: species.germanName,
          scientificName: species.scientificName,
        },
        currentPortrait: {
          exists: source.portraitBuffer.length > 0,
          bytes: source.portraitBuffer.length,
          url: source.portraitBuffer.length
            ? `/assets/${encodeURIComponent(species.safeName)}/portrait.webp?current=${token}`
            : "",
        },
        newPortrait: {
          bytes: renderedBuffer.length,
          sha256,
          url: `/api/species/${encodeURIComponent(id)}/assets/portrait/preview-file?token=${encodeURIComponent(token)}`,
          size: `${rendered.width}x${rendered.height}`,
          promptVersion: PORTRAIT_STANDARD.promptVersion,
          prompt: validated.prompt,
          originalName: validated.originalName,
          originalFormat: validated.image.format,
          originalDimensions: {
            width: validated.image.width,
            height: validated.image.height,
          },
        },
        warnings: [
          "Das extern erzeugte Bild muss vor der Übernahme auf Artmerkmale und Anatomie geprüft werden.",
          "Die Vorschau ersetzt noch keine produktive Datei.",
          "Erst Artporträt übernehmen speichert, committed und pusht.",
        ],
      };
    } catch (error) {
      rmSync(inputStagingPath, { force: true });
      rmSync(stagingPath, { force: true });
      throw error;
    }
  }

  async function savePortraitAsset(id, payload) {
    cleanupPreviewTokens();
    const token = String(payload?.token ?? "");
    const publishAfterSave = payload?.publish !== false;
    const preview = previewTokens.get(token);
    if (!preview || preview.type !== "portrait-asset" || preview.id !== id) {
      const error = new Error("Artporträt-Vorschau ist ungültig oder abgelaufen");
      error.statusCode = 409;
      throw error;
    }
    if (assetWriteActive || pipelineProcess
      || pipelineState.status === "running" || pipelineState.status === "awaiting-review") {
      const error = new Error("Es läuft bereits ein schreibender Asset- oder Pipeline-Prozess");
      error.statusCode = 409;
      throw error;
    }
    const species = findEditableSpecies(model, id);
    if (!species?.inInput || species.safeName !== preview.safeName) {
      previewTokens.delete(token);
      const error = new Error("Art ist nicht mehr im erwarteten Zustand");
      error.statusCode = 409;
      throw error;
    }
    if (!existsSync(preview.stagingPath)) {
      previewTokens.delete(token);
      const error = new Error("Vorgemerkte Artporträt-Datei fehlt");
      error.statusCode = 409;
      throw error;
    }
    const stagedBuffer = await readFile(preview.stagingPath);
    const stagedHash = createHash("sha256").update(stagedBuffer).digest("hex");
    if (stagedHash !== preview.sha256) {
      previewTokens.delete(token);
      const error = new Error("Vorgemerkte Artporträt-Datei wurde verändert");
      error.statusCode = 409;
      throw error;
    }
    inspectWebp(stagedBuffer);
    const source = await portraitAssetSourceRevision(species);
    if (source.revision !== preview.sourceRevision) {
      previewTokens.delete(token);
      rmSync(preview.stagingPath, { force: true });
      rmSync(preview.inputStagingPath, { force: true });
      const error = new Error("Artporträt oder Metadaten wurden seit der Vorschau geändert");
      error.statusCode = 409;
      throw error;
    }
    if (publishAssetChanges && publishAfterSave) {
      const stagedBefore = await runCommandCapture("git", ["diff", "--cached", "--quiet"]);
      if (stagedBefore.code !== 0) {
        const error = new Error(
          "Vor der Porträtübernahme sind bereits Dateien für Git vorgemerkt. Bitte diese zuerst committen oder aus dem Index entfernen.",
        );
        error.statusCode = 409;
        throw error;
      }
    }

    assetWriteActive = true;
    let backupRelativePath = "";
    try {
      await mkdir(source.assetDirectory, { recursive: true });
      const registry = JSON.parse(source.registryText);
      if (source.portraitBuffer.length || source.metadataBuffer.length) {
        const currentHash = createHash("sha256")
          .update(source.portraitBuffer)
          .update(source.metadataBuffer)
          .digest("hex");
        backupRelativePath = await writeManagedAssetBackup({
          repoRoot,
          assetBackupRoot,
          species,
          assetType: "portrait",
          files: [
            { fileName: "portrait.webp", buffer: source.portraitBuffer },
            { fileName: "portrait.json", buffer: source.metadataBuffer },
          ],
          metadata: {
            action: "replace",
            sha256: currentHash,
            override: registry.assets?.[species.safeName]?.portrait ?? null,
          },
        });
      }

      const approvedAt = new Date().toISOString();
      const metadata = {
        version: 1,
        german_name: species.germanName,
        scientific_name: species.scientificName,
        type: "AI-generated natural-history illustration",
        source: "ChatGPT",
        generation_method: "Manuell in ChatGPT erzeugt und im Arten-Explorer importiert",
        prompt_version: PORTRAIT_STANDARD.promptVersion,
        prompt_sha256: preview.promptSha256,
        prompt: preview.prompt,
        original_file_name: preview.originalName,
        original_format: preview.originalFormat,
        original_width: preview.originalDimensions.width,
        original_height: preview.originalDimensions.height,
        product_width: DEFAULT_PORTRAIT_OPTIONS.width,
        product_height: DEFAULT_PORTRAIT_OPTIONS.height,
        product_format: PORTRAIT_STANDARD.outputFormat,
        additional_instructions: preview.additionalInstructions,
        imported_at: preview.importedAt,
        approved_at: approvedAt,
        sha256: preview.sha256,
      };
      const metadataText = `${JSON.stringify(metadata, null, 2)}\n`;
      const metadataSha256 = createHash("sha256").update(metadataText).digest("hex");
      registry.version = 1;
      registry.assets ??= {};
      registry.assets[species.safeName] ??= {};
      registry.assets[species.safeName].portrait = {
        managedBy: "species-explorer",
        source: metadata.source,
        generationMethod: metadata.generation_method,
        promptVersion: metadata.prompt_version,
        importedAt: metadata.imported_at,
        approvedAt,
        sha256: preview.sha256,
        metadataSha256,
      };
      const nextRegistryText = `${JSON.stringify(registry, null, 2)}\n`;

      const portraitTempPath = `${source.portraitPath}.tmp-${randomUUID()}`;
      const metadataTempPath = `${source.metadataPath}.tmp-${randomUUID()}`;
      const registryTempPath = `${assetOverridesPath}.tmp-${randomUUID()}`;
      try {
        await writeFile(portraitTempPath, stagedBuffer);
        await writeFile(metadataTempPath, metadataText, "utf8");
        await writeFile(registryTempPath, nextRegistryText, "utf8");
        await rename(portraitTempPath, source.portraitPath);
        await rename(metadataTempPath, source.metadataPath);
        await rename(registryTempPath, assetOverridesPath);
      } catch (error) {
        await unlink(portraitTempPath).catch(() => {});
        await unlink(metadataTempPath).catch(() => {});
        await unlink(registryTempPath).catch(() => {});
        if (source.portraitBuffer.length) await writeFile(source.portraitPath, source.portraitBuffer);
        else await unlink(source.portraitPath).catch(() => {});
        if (source.metadataBuffer.length) await writeFile(source.metadataPath, source.metadataBuffer);
        else await unlink(source.metadataPath).catch(() => {});
        await writeFile(assetOverridesPath, source.registryText, "utf8");
        throw error;
      }

      previewTokens.delete(token);
      rmSync(preview.stagingPath, { force: true });
      rmSync(preview.inputStagingPath, { force: true });
      let backupRetention = { kept: 0, removed: 0, bytes: 0 };
      let backupCleanupWarning = "";
      try {
        backupRetention = await pruneAssetBackups(assetBackupRoot);
      } catch (error) {
        backupCleanupWarning = `Assetbackup-Bereinigung fehlgeschlagen: ${error.message}`;
      }
      await refreshModel({ force: true });
      let publication = { published: false, skipped: true, commit: "" };
      let publicationError = "";
      if (publishAfterSave) {
        try {
          publication = await publishPortraitAssetChanges(species);
        } catch (error) {
          publication = { published: false, skipped: false, commit: "" };
          publicationError = error.message;
        }
      }
      return {
        ok: !publicationError,
        saved: true,
        backup: backupRelativePath,
        backupRetention,
        backupCleanupWarning,
        gitPublished: publication.published,
        gitSkipped: publication.skipped,
        gitCommit: publication.commit,
        publicationError,
        portraitSha256: preview.sha256,
        metadataSha256,
        species: model.species.find((entry) => entry.id === id) ?? null,
        summary: model.summary,
        validation: model.validation,
      };
    } finally {
      assetWriteActive = false;
    }
  }

  async function deleteSpeciesAsset(id, assetType) {
    cleanupPreviewTokens();
    if (!["map", "sound", "portrait"].includes(assetType)) {
      const error = new Error("Assettyp muss Karte, Sound oder Artporträt sein");
      error.statusCode = 400;
      throw error;
    }
    if (assetWriteActive || pipelineProcess || pipelineState.status === "running" || pipelineState.status === "awaiting-review") {
      const error = new Error("Es läuft bereits ein schreibender Asset- oder Pipeline-Prozess");
      error.statusCode = 409;
      throw error;
    }
    const species = findEditableSpecies(model, id);
    if (!species?.inInput) {
      const error = new Error("Art wurde nicht gefunden oder ist nicht bearbeitbar");
      error.statusCode = species ? 409 : 404;
      throw error;
    }

    const reportPath = join(repoRoot, "fehlende_elemente_report.json");
    const reportText = await readFile(reportPath, "utf8").catch(() => "");
    const backupFiles = [];
    let backupRelativePath = "";
    let source;
    let documentationText = "";
    let removedLabel = "";
    let reportNeedsRefresh = false;

    if (assetType === "map") {
      source = await mapAssetSourceRevision(species);
      documentationText = source.documentationText;
      if (!source.mapBuffer.length) {
        const error = new Error("Für diese Art ist keine Verbreitungskarte vorhanden");
        error.statusCode = 409;
        throw error;
      }
      removedLabel = "Verbreitungskarte";
      reportNeedsRefresh = true;
      backupFiles.push({ fileName: "map.jpg", path: source.mapPath, buffer: source.mapBuffer });
    } else if (assetType === "sound") {
      source = await soundAssetSourceRevision(species);
      if (!source.soundBuffer.length && !source.creditsBuffer.length && !source.spectrogramBuffer.length) {
        const error = new Error("Für diese Art ist kein Soundpaket vorhanden");
        error.statusCode = 409;
        throw error;
      }
      removedLabel = "Soundpaket";
      reportNeedsRefresh = true;
      backupFiles.push(
        { fileName: "sound.mp3", path: source.soundPath, buffer: source.soundBuffer },
        { fileName: "credits.json", path: source.creditsPath, buffer: source.creditsBuffer },
        { fileName: "spectrogram.webp", path: source.spectrogramPath, buffer: source.spectrogramBuffer },
      );
    } else {
      source = await portraitAssetSourceRevision(species);
      if (!source.portraitBuffer.length && !source.metadataBuffer.length) {
        const error = new Error("Für diese Art ist kein Artporträt vorhanden");
        error.statusCode = 409;
        throw error;
      }
      removedLabel = "Artporträt";
      backupFiles.push(
        { fileName: "portrait.webp", path: source.portraitPath, buffer: source.portraitBuffer },
        { fileName: "portrait.json", path: source.metadataPath, buffer: source.metadataBuffer },
      );
    }

    assetWriteActive = true;
    try {
      closeActiveFileStreams((filePath) => resolve(filePath).startsWith(resolve(source.assetDirectory)));
      const registry = JSON.parse(source.registryText);
      const currentHash = createHash("sha256")
        .update(Buffer.concat(backupFiles.map((entry) => entry.buffer)))
        .digest("hex");
      backupRelativePath = await writeManagedAssetBackup({
        repoRoot,
        assetBackupRoot,
        species,
        assetType,
        files: backupFiles,
        metadata: {
          action: "delete",
          sha256: currentHash,
          override: registry.assets?.[species.safeName]?.[assetType] ?? null,
          spectrogramOverride: assetType === "sound"
            ? registry.assets?.[species.safeName]?.spectrogram ?? null
            : null,
        },
      });

      registry.version = 1;
      registry.assets ??= {};
      registry.assets[species.safeName] ??= {};
      if (assetType === "map") {
        delete registry.assets[species.safeName].map;
      } else if (assetType === "sound") {
        const previousSoundOverride = registry.assets[species.safeName].sound ?? {};
        const rejectedSources = Array.isArray(previousSoundOverride.rejectedSources)
          ? previousSoundOverride.rejectedSources
          : [];
        registry.assets[species.safeName].sound = rejectedSources.length
          ? {
              rejectedSources,
              manual: false,
              protectFromPipeline: false,
              reason: "Soundpaket wurde manuell gelöscht; bereits abgelehnte Quellen bleiben gespeichert.",
              updatedAt: new Date().toISOString(),
            }
          : undefined;
        if (!registry.assets[species.safeName].sound) delete registry.assets[species.safeName].sound;
        delete registry.assets[species.safeName].spectrogram;
      } else {
        delete registry.assets[species.safeName].portrait;
      }
      if (Object.keys(registry.assets[species.safeName]).length === 0) {
        delete registry.assets[species.safeName];
      }
      const nextRegistryText = `${JSON.stringify(registry, null, 2)}\n`;
      const nextDocumentationText = assetType === "map"
        ? synchronizeManualMapDocumentation(documentationText, registry)
        : "";
      const registryTempPath = `${assetOverridesPath}.tmp-${randomUUID()}`;
      const documentationTempPath = assetType === "map"
        ? `${manualMapOverridesPath}.tmp-${randomUUID()}`
        : "";

      try {
        await writeFile(registryTempPath, nextRegistryText, "utf8");
        if (assetType === "map") {
          await writeFile(documentationTempPath, nextDocumentationText, "utf8");
        }
        for (const entry of backupFiles) {
          if (entry.buffer.length) await unlink(entry.path).catch((error) => {
            if (error.code !== "ENOENT") throw error;
          });
        }
        await rename(registryTempPath, assetOverridesPath);
        if (assetType === "map") await rename(documentationTempPath, manualMapOverridesPath);
      } catch (error) {
        await unlink(registryTempPath).catch(() => {});
        if (documentationTempPath) await unlink(documentationTempPath).catch(() => {});
        for (const entry of backupFiles) {
          if (entry.buffer.length) await writeFile(entry.path, entry.buffer);
        }
        await writeFile(assetOverridesPath, source.registryText, "utf8");
        if (assetType === "map") await writeFile(manualMapOverridesPath, documentationText, "utf8");
        throw error;
      }

      if (reportNeedsRefresh && rebuildReportAfterAssetSave) {
        const reportRun = await runCommandCapture(process.execPath, [join(repoRoot, "update.mjs"), "--report-only"]);
        if (reportRun.code !== 0) {
          for (const entry of backupFiles) {
            if (entry.buffer.length) await writeFile(entry.path, entry.buffer);
          }
          await writeFile(assetOverridesPath, source.registryText, "utf8");
          if (assetType === "map") await writeFile(manualMapOverridesPath, documentationText, "utf8");
          if (reportText) await writeFile(reportPath, reportText, "utf8");
          throw new Error(`Report-Abgleich nach Asset-Löschung fehlgeschlagen: ${reportRun.stderr || reportRun.stdout}`);
        }
      }

      let backupRetention = { kept: 0, removed: 0, bytes: 0 };
      let backupCleanupWarning = "";
      try {
        backupRetention = await pruneAssetBackups(assetBackupRoot);
      } catch (error) {
        backupCleanupWarning = `Assetbackup-Bereinigung fehlgeschlagen: ${error.message}`;
      }
      await refreshModel({ force: true });
      return {
        ok: true,
        deleted: true,
        assetType,
        label: removedLabel,
        backup: backupRelativePath,
        backupRetention,
        backupCleanupWarning,
        species: model.species.find((entry) => entry.id === id) ?? null,
        summary: model.summary,
        validation: model.validation,
        pendingTransfer: true,
      };
    } finally {
      assetWriteActive = false;
    }
  }

  async function restoreSpeciesAsset(id, assetType) {
    cleanupPreviewTokens();
    if (!["map", "sound", "portrait"].includes(assetType)) {
      const error = new Error("Assettyp muss Karte, Sound oder Artporträt sein");
      error.statusCode = 400;
      throw error;
    }
    if (assetWriteActive || pipelineProcess || pipelineState.status === "running" || pipelineState.status === "awaiting-review") {
      const error = new Error("Es läuft bereits ein schreibender Asset- oder Pipeline-Prozess");
      error.statusCode = 409;
      throw error;
    }
    const species = findEditableSpecies(model, id);
    if (!species?.inInput) {
      const error = new Error("Art wurde nicht gefunden oder ist nicht bearbeitbar");
      error.statusCode = species ? 409 : 404;
      throw error;
    }

    const latestBackup = await latestAssetBackup(assetBackupRoot, repoRoot, species.safeName, assetType);
    if (!latestBackup.exists) {
      const error = new Error("Für dieses Asset ist keine lokale Sicherung vorhanden");
      error.statusCode = 404;
      throw error;
    }
    const backupPath = resolve(repoRoot, latestBackup.path);
    const allowedBackupRoot = `${resolve(assetBackupRoot, species.safeName, assetType)}${sep}`;
    const backupAsDirectory = existsSync(backupPath) && statSync(backupPath).isDirectory();
    if (
      !`${backupPath}${backupAsDirectory ? sep : ""}`.startsWith(allowedBackupRoot)
      && backupPath !== resolve(assetBackupRoot, species.safeName, assetType)
    ) {
      const error = new Error("Unsicherer Sicherungspfad");
      error.statusCode = 409;
      throw error;
    }

    const source = assetType === "map"
      ? await mapAssetSourceRevision(species)
      : assetType === "sound"
        ? await soundAssetSourceRevision(species)
        : await portraitAssetSourceRevision(species);
    const reportPath = join(repoRoot, "fehlende_elemente_report.json");
    const reportText = await readFile(reportPath, "utf8").catch(() => "");
    const documentationText = assetType === "map" ? source.documentationText : "";
    const fileNames = assetBackupFileNames(assetType);
    const backupFiles = [];
    for (const fileName of fileNames) {
      const filePath = backupAsDirectory ? join(backupPath, fileName) : backupPath;
      if (assetType !== "map" && !backupAsDirectory) continue;
      if (!existsSync(filePath)) continue;
      backupFiles.push({ fileName, buffer: await readFile(filePath) });
    }
    if (!backupFiles.length) {
      const error = new Error("Die lokale Sicherung enthält keine wiederherstellbaren Dateien");
      error.statusCode = 409;
      throw error;
    }

    assetWriteActive = true;
    try {
      closeActiveFileStreams((filePath) => resolve(filePath).startsWith(resolve(source.assetDirectory)));
      await mkdir(source.assetDirectory, { recursive: true });
      const registry = JSON.parse(source.registryText);
      registry.version = 1;
      registry.assets ??= {};
      registry.assets[species.safeName] ??= {};
      const metadata = latestBackup.metadata ?? await readBackupMetadata(backupAsDirectory ? backupPath : join(backupPath, ".."));
      if (metadata.override && typeof metadata.override === "object") {
        registry.assets[species.safeName][assetType] = metadata.override;
      } else {
        delete registry.assets[species.safeName][assetType];
      }
      if (assetType === "sound") {
        if (metadata.spectrogramOverride && typeof metadata.spectrogramOverride === "object") {
          registry.assets[species.safeName].spectrogram = metadata.spectrogramOverride;
        } else {
          delete registry.assets[species.safeName].spectrogram;
        }
      }
      if (Object.keys(registry.assets[species.safeName]).length === 0) {
        delete registry.assets[species.safeName];
      }
      const nextRegistryText = `${JSON.stringify(registry, null, 2)}\n`;
      const nextDocumentationText = assetType === "map"
        ? synchronizeManualMapDocumentation(documentationText, registry)
        : "";
      const registryTempPath = `${assetOverridesPath}.tmp-${randomUUID()}`;
      const documentationTempPath = assetType === "map"
        ? `${manualMapOverridesPath}.tmp-${randomUUID()}`
        : "";

      try {
        for (const file of backupFiles) {
          await writeFile(join(source.assetDirectory, file.fileName), file.buffer);
        }
        await writeFile(registryTempPath, nextRegistryText, "utf8");
        await rename(registryTempPath, assetOverridesPath);
        if (assetType === "map") {
          await writeFile(documentationTempPath, nextDocumentationText, "utf8");
          await rename(documentationTempPath, manualMapOverridesPath);
        }
      } catch (error) {
        await unlink(registryTempPath).catch(() => {});
        if (documentationTempPath) await unlink(documentationTempPath).catch(() => {});
        await writeFile(assetOverridesPath, source.registryText, "utf8");
        if (assetType === "map") await writeFile(manualMapOverridesPath, documentationText, "utf8");
        throw error;
      }

      if ((assetType === "map" || assetType === "sound") && rebuildReportAfterAssetSave) {
        const reportRun = await runCommandCapture(process.execPath, [join(repoRoot, "update.mjs"), "--report-only"]);
        if (reportRun.code !== 0) {
          await writeFile(assetOverridesPath, source.registryText, "utf8");
          if (assetType === "map") await writeFile(manualMapOverridesPath, documentationText, "utf8");
          if (reportText) await writeFile(reportPath, reportText, "utf8");
          throw new Error(`Report-Abgleich nach Wiederherstellung fehlgeschlagen: ${reportRun.stderr || reportRun.stdout}`);
        }
      }

      await refreshModel({ force: true });
      return {
        ok: true,
        restored: true,
        assetType,
        backup: latestBackup.path,
        species: model.species.find((entry) => entry.id === id) ?? null,
        summary: model.summary,
        validation: model.validation,
        pendingTransfer: true,
      };
    } finally {
      assetWriteActive = false;
    }
  }

  async function previewNewSpecies(payload) {
    cleanupPreviewTokens();
    const { values, errors, fieldErrors } = validateNewSpeciesValues(payload?.values);
    if (errors.length) {
      const error = new Error("Eingaben sind ungültig");
      error.statusCode = 400;
      error.details = errors;
      error.fieldErrors = fieldErrors;
      throw error;
    }

    const sourceText = await readFile(speciesListPath, "utf8");
    const inputList = JSON.parse(sourceText);
    if (!Array.isArray(inputList)) {
      const error = new Error("Eingabeliste muss ein Array enthalten");
      error.statusCode = 409;
      throw error;
    }

    const { entry, derived } = buildNewSpeciesEntry(values);
    const collisions = findNewSpeciesCollisions({
      inputList,
      model,
      entry,
      derived,
      repoRoot,
    });
    if (collisions.length) {
      const error = new Error("Neue Art kollidiert mit bestehenden Daten oder Assets");
      error.statusCode = 409;
      error.details = collisions;
      error.fieldErrors = {
        ...(collisions.some((message) => message.includes("Deutscher Name")) ? { german: collisions.filter((message) => message.includes("Deutscher Name")) } : {}),
        ...(collisions.some((message) => message.includes("Wissenschaftlicher Name") || message.includes("URL-Slug")) ? { scientificName: collisions.filter((message) => message.includes("Wissenschaftlicher Name") || message.includes("URL-Slug")) } : {}),
      };
      throw error;
    }

    const token = randomUUID();
    const expiresAt = Date.now() + PREVIEW_TOKEN_TTL_MS;
    previewTokens.set(token, {
      type: "create",
      values,
      sourceRevision: hashText(sourceText),
      expiresAt,
    });

    return {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      entry,
      derived: {
        ...derived,
        assetDirectory: `species-assets/${derived.safeName}`,
      },
      warnings: [
        "Vor dem Speichern wird automatisch eine lokale Sicherung angelegt.",
        "Die neue Art erscheint zunächst ohne Pipeline-Daten und Assets im Explorer.",
        "Pipeline-Daten und Assets bleiben unverändert. Die Pipeline muss anschließend separat ausgeführt werden.",
      ],
    };
  }

  function createNewSpeciesPortraitPrompt(payload) {
    cleanupPreviewTokens();
    const { values, errors, fieldErrors } = validateNewSpeciesValues(payload?.values);
    const additionalInstructions = String(payload?.additionalInstructions ?? "").trim();
    if (additionalInstructions.length > MAX_PORTRAIT_INSTRUCTIONS_LENGTH) {
      errors.push(
        `Zusätzliche Hinweise dürfen maximal ${MAX_PORTRAIT_INSTRUCTIONS_LENGTH} Zeichen enthalten`,
      );
    }
    if (errors.length) {
      const error = new Error("Eingaben sind ungültig");
      error.statusCode = 400;
      error.details = errors;
      error.fieldErrors = fieldErrors;
      throw error;
    }

    const { entry, derived } = buildNewSpeciesEntry(values);
    const prompt = buildPortraitPrompt({
      germanName: entry.german,
      scientificName: derived.scientificName,
      additionalInstructions,
    });
    return {
      entry,
      derived: {
        ...derived,
        assetDirectory: `species-assets/${derived.safeName}`,
      },
      prompt,
      promptVersion: PORTRAIT_STANDARD.promptVersion,
      promptSha256: portraitPromptSha256(prompt),
      fileName: `${derived.safeName}.png`,
      instructions: [
        "Prompt in ChatGPT einfügen und dort genau ein Bild für diese eine Art erzeugen.",
        `Bild als ${derived.safeName}.png, .jpg oder .webp speichern.`,
        "Art anschließend anlegen und das Bild im selben Dialog prüfen und übernehmen.",
      ],
    };
  }

  async function previewNewSpeciesPortrait(payload) {
    cleanupPreviewTokens();
    if (pipelineProcess || pipelineState.status === "running" || pipelineState.status === "awaiting-review") {
      const error = new Error("Während eines Pipeline-Laufs können keine Artporträts importiert werden");
      error.statusCode = 409;
      throw error;
    }
    if (assetWriteActive) {
      const error = new Error("Es läuft bereits ein schreibender Assetprozess");
      error.statusCode = 409;
      throw error;
    }
    const createToken = String(payload?.token ?? payload?.createToken ?? "");
    const createPreview = previewTokens.get(createToken);
    if (!createPreview || createPreview.type !== "create") {
      const error = new Error("Artvorschau ist ungültig oder abgelaufen");
      error.statusCode = 409;
      throw error;
    }
    const sourceText = await readFile(speciesListPath, "utf8");
    if (hashText(sourceText) !== createPreview.sourceRevision) {
      previewTokens.delete(createToken);
      const error = new Error("Eingabeliste wurde seit der Artprüfung geändert. Bitte erneut prüfen.");
      error.statusCode = 409;
      throw error;
    }
    const { values, errors, fieldErrors } = validateNewSpeciesValues(createPreview.values);
    if (errors.length) {
      const error = new Error("Gespeicherte Artvorschau ist ungültig");
      error.statusCode = 409;
      error.details = errors;
      error.fieldErrors = fieldErrors;
      throw error;
    }

    const { entry, derived } = buildNewSpeciesEntry(values);
    const species = {
      id: derived.slug,
      germanName: entry.german,
      scientificName: derived.scientificName,
      safeName: derived.safeName,
    };
    const validated = validatePortraitPreviewPayload(payload, species);
    if (validated.errors.length) {
      const error = new Error("Artporträt-Datei oder Angaben sind ungültig");
      error.statusCode = 400;
      error.details = validated.errors;
      throw error;
    }

    const source = await portraitAssetSourceRevision(species);
    removePreviousPortraitPreviews(species.id);
    const token = randomUUID();
    const expiresAt = Date.now() + PREVIEW_TOKEN_TTL_MS;
    const importedAt = new Date().toISOString();
    const inputExtension = validated.image.format === "jpeg"
      ? ".jpg"
      : `.${validated.image.format}`;
    await mkdir(assetStagingRoot, { recursive: true });
    const inputStagingPath = join(assetStagingRoot, `${token}.portrait-input${inputExtension}`);
    const stagingPath = join(assetStagingRoot, `${token}.portrait.webp`);
    await writeFile(inputStagingPath, validated.buffer);
    try {
      const rendered = await portraitRenderer({
        inputPath: inputStagingPath,
        outputPath: stagingPath,
        ffmpegPath: resolveFfmpegPath({ repoRoot }),
        options: DEFAULT_PORTRAIT_OPTIONS,
      });
      const renderedBuffer = await readFile(stagingPath);
      inspectWebp(renderedBuffer);
      const sha256 = createHash("sha256").update(renderedBuffer).digest("hex");
      previewTokens.set(token, {
        type: "portrait-asset",
        id: species.id,
        safeName: species.safeName,
        inputStagingPath,
        stagingPath,
        sha256,
        bytes: renderedBuffer.length,
        sourceRevision: source.revision,
        expiresAt,
        importedAt,
        additionalInstructions: validated.additionalInstructions,
        prompt: validated.prompt,
        promptSha256: validated.promptSha256,
        originalName: validated.originalName,
        originalFormat: validated.image.format,
        originalDimensions: {
          width: validated.image.width,
          height: validated.image.height,
        },
      });
      return {
        token,
        expiresAt: new Date(expiresAt).toISOString(),
        species,
        currentPortrait: {
          exists: source.portraitBuffer.length > 0,
          bytes: source.portraitBuffer.length,
          url: source.portraitBuffer.length
            ? `/assets/${encodeURIComponent(species.safeName)}/portrait.webp?current=${token}`
            : "",
        },
        newPortrait: {
          bytes: renderedBuffer.length,
          sha256,
          url: `/api/species/${encodeURIComponent(species.id)}/assets/portrait/preview-file?token=${encodeURIComponent(token)}`,
          size: `${rendered.width}x${rendered.height}`,
          promptVersion: PORTRAIT_STANDARD.promptVersion,
          prompt: validated.prompt,
          originalName: validated.originalName,
          originalFormat: validated.image.format,
          originalDimensions: {
            width: validated.image.width,
            height: validated.image.height,
          },
        },
        warnings: [
          "Das extern erzeugte Bild muss vor der Übernahme auf Artmerkmale und Anatomie geprüft werden.",
          "Die Vorschau legt noch keine Art und keine produktive Datei an.",
          "Erst der Abschluss speichert die Art und übernimmt optional dieses Portrait.",
        ],
      };
    } catch (error) {
      rmSync(inputStagingPath, { force: true });
      rmSync(stagingPath, { force: true });
      throw error;
    }
  }

  async function saveNewSpecies(payload) {
    cleanupPreviewTokens();
    const token = String(payload?.token ?? "");
    const preview = previewTokens.get(token);
    if (!preview || preview.type !== "create") {
      const error = new Error("Vorschau ist ungültig oder abgelaufen");
      error.statusCode = 409;
      throw error;
    }

    const sourceText = await readFile(speciesListPath, "utf8");
    if (hashText(sourceText) !== preview.sourceRevision) {
      previewTokens.delete(token);
      const error = new Error("Eingabeliste wurde seit der Vorschau geändert. Bitte erneut prüfen.");
      error.statusCode = 409;
      throw error;
    }

    const inputList = JSON.parse(sourceText);
    if (!Array.isArray(inputList)) {
      const error = new Error("Eingabeliste muss ein Array enthalten");
      error.statusCode = 409;
      throw error;
    }

    const { values, errors } = validateNewSpeciesValues(preview.values);
    if (errors.length) {
      const error = new Error("Gespeicherte Vorschau ist ungültig");
      error.statusCode = 409;
      error.details = errors;
      throw error;
    }

    const { entry, derived } = buildNewSpeciesEntry(values);
    const collisions = findNewSpeciesCollisions({
      inputList,
      model,
      entry,
      derived,
      repoRoot,
    });
    if (collisions.length) {
      previewTokens.delete(token);
      const error = new Error("Neue Art kollidiert inzwischen mit bestehenden Daten oder Assets");
      error.statusCode = 409;
      error.details = collisions;
      throw error;
    }

    await mkdir(backupDir, { recursive: true });
    const backupName =
      `species_list-${compactTimestamp()}-${derived.safeName}-${randomUUID().slice(0, 8)}.json`;
    const backupPath = join(backupDir, backupName);
    await writeFile(backupPath, sourceText, "utf8");

    const nextText = `${JSON.stringify([...inputList, entry], null, 2)}\n`;
    const tempPath = `${speciesListPath}.tmp-${randomUUID()}`;
    try {
      await writeFile(tempPath, nextText, "utf8");
      await rename(tempPath, speciesListPath);
    } catch (error) {
      await unlink(tempPath).catch(() => {});
      throw error;
    }

    previewTokens.delete(token);
    await refreshModel({ force: true });
    let backupRetention = { kept: 0, removed: 0 };
    let backupCleanupWarning = "";
    try {
      backupRetention = await pruneSpeciesListBackups(backupDir);
    } catch (error) {
      backupCleanupWarning = `Backup-Bereinigung fehlgeschlagen: ${error.message}`;
    }

    return {
      ok: true,
      backup: `species-explorer/backups/${backupName}`,
      backupRetention,
      backupCleanupWarning,
      entry,
      derived: {
        ...derived,
        assetDirectory: `species-assets/${derived.safeName}`,
      },
      species: model.species.find((item) => item.id === derived.slug) ?? null,
      summary: model.summary,
      validation: model.validation,
      pipelineRequired: true,
    };
  }

  async function previewSpeciesDelete(id) {
    cleanupPreviewTokens();
    const species = findEditableSpecies(model, id);
    if (!species) {
      const error = new Error("Art wurde nicht gefunden");
      error.statusCode = 404;
      throw error;
    }
    const assetDirectoryExists = existsSync(join(repoRoot, "species-assets", species.safeName));
    if (!species.inInput && !species.inGenerated && !assetDirectoryExists) {
      const error = new Error("Für diese Art sind keine löschbaren Eingabe-, Daten- oder Assetreste vorhanden");
      error.statusCode = 409;
      throw error;
    }

    const sourceText = await readFile(speciesListPath, "utf8");
    const inputList = JSON.parse(sourceText);
    const inputIndex = findInputIndex(inputList, species);
    if (species.inInput && inputIndex < 0) {
      const error = new Error("Art fehlt in der Eingabeliste");
      error.statusCode = 409;
      throw error;
    }

    const token = randomUUID();
    const expiresAt = Date.now() + PREVIEW_TOKEN_TTL_MS;
    previewTokens.set(token, {
      type: "delete",
      id,
      sourceRevision: hashText(sourceText),
      expiresAt,
    });
    return {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      species: {
        id: species.id,
        germanName: species.germanName,
        scientificName: species.scientificName,
        inGenerated: species.inGenerated,
        assetDirectory: `species-assets/${species.safeName}`,
      },
      effects: [
        species.inInput
          ? "Der Eintrag wird aus der Eingabeliste entfernt."
          : "Der Eintrag ist bereits aus der Eingabeliste entfernt; es werden nur noch verbliebene generierte Daten und Assets bereinigt.",
        species.inInput
          ? "Ohne Zusatzoption bleiben generierte Daten und Assets bis zum Bereinigungslauf bestehen."
          : "Die dauerhafte Bereinigung ist erforderlich, damit die Art vollständig aus der App verschwindet.",
        "Mit Zusatzoption werden generierte Daten, Assessment-Zuordnung, Assetpflege und der Assetordner sofort dauerhaft gelöscht.",
      ],
      assetDirectoryExists,
      requiresAssetDeletion: !species.inInput,
    };
  }

  async function saveSpeciesDelete(id, payload) {
    cleanupPreviewTokens();
    const token = String(payload?.token ?? "");
    const deleteAssets = payload?.deleteAssets === true;
    const preview = previewTokens.get(token);
    if (!preview || preview.type !== "delete" || preview.id !== id) {
      const error = new Error("Löschvorschau ist ungültig oder abgelaufen");
      error.statusCode = 409;
      throw error;
    }

    const species = findEditableSpecies(model, id);
    if (!species) {
      previewTokens.delete(token);
      const error = new Error("Art wurde nicht gefunden");
      error.statusCode = 409;
      throw error;
    }
    if (!species.inInput && !deleteAssets) {
      const error = new Error("Art ist bereits aus der Eingabeliste entfernt. Bitte dauerhafte Bereinigung auswählen.");
      error.statusCode = 409;
      throw error;
    }

    const sourceText = await readFile(speciesListPath, "utf8");
    if (hashText(sourceText) !== preview.sourceRevision) {
      previewTokens.delete(token);
      const error = new Error("Eingabeliste wurde seit der Löschvorschau geändert");
      error.statusCode = 409;
      throw error;
    }

    const inputList = JSON.parse(sourceText);
    const inputIndex = findInputIndex(inputList, species);
    if (species.inInput && inputIndex < 0) {
      previewTokens.delete(token);
      const error = new Error("Art fehlt bereits in der Eingabeliste");
      error.statusCode = 409;
      throw error;
    }

    let backupName = "";
    let inputEntryRemoved = false;
    let permanentCleanup = null;
    if (deleteAssets) {
      try {
        permanentCleanup = runSpeciesCleanup(repoRoot, {
          slug: species.slug || species.id,
          safeName: species.safeName,
          allowInputEntry: species.inInput,
        });
      } catch (error) {
        await refreshModel({ force: true }).catch(() => {});
        throw error;
      }
    }

    if (species.inInput) {
      await mkdir(backupDir, { recursive: true });
      backupName =
        `species_list-${compactTimestamp()}-${sanitizeAssetName(species.germanName)}-${randomUUID().slice(0, 8)}.json`;
      await writeFile(join(backupDir, backupName), sourceText, "utf8");
      inputList.splice(inputIndex, 1);
      const tempPath = `${speciesListPath}.tmp-${randomUUID()}`;
      try {
        await writeFile(tempPath, `${JSON.stringify(inputList, null, 2)}\n`, "utf8");
        await rename(tempPath, speciesListPath);
        inputEntryRemoved = true;
      } catch (error) {
        await unlink(tempPath).catch(() => {});
        throw error;
      }
    }

    previewTokens.delete(token);
    await refreshModel({ force: true });
    let backupRetention = { kept: 0, removed: 0 };
    let backupCleanupWarning = "";
    try {
      backupRetention = await pruneSpeciesListBackups(backupDir);
    } catch (error) {
      backupCleanupWarning = `Backup-Bereinigung fehlgeschlagen: ${error.message}`;
    }
    return {
      ok: true,
      deleted: {
        id,
        germanName: species.germanName,
        scientificName: species.scientificName,
      },
      inputEntryRemoved,
      backup: backupName ? `species-explorer/backups/${backupName}` : "",
      backupRetention,
      backupCleanupWarning,
      assetDirectoryPreserved: deleteAssets ? "" : `species-assets/${species.safeName}`,
      permanentCleanup,
      pipelineRequired: deleteAssets ? false : species.inGenerated,
      summary: model.summary,
      validation: model.validation,
    };
  }

  async function previewSpeciesEdit(id, payload) {
    cleanupPreviewTokens();
    const species = findEditableSpecies(model, id);
    if (!species) {
      const error = new Error("Art wurde nicht gefunden");
      error.statusCode = 404;
      throw error;
    }

    const { values, errors } = validateEditableValues(payload?.values, species);
    if (errors.length) {
      const error = new Error("Eingaben sind ungültig");
      error.statusCode = 400;
      error.details = errors;
      throw error;
    }

    const sourceText = await readFile(speciesListPath, "utf8");
    const inputList = JSON.parse(sourceText);
    const inputIndex = findInputIndex(inputList, species);
    if (inputIndex < 0) {
      const error = new Error("Art fehlt in der Eingabeliste");
      error.statusCode = 409;
      throw error;
    }

    const [assetOverrides, assessmentIds] = await Promise.all([
      readJson(assetOverridesPath).catch(() => ({ version: 1, assets: {} })),
      readJson(assessmentIdsPath).catch(() => ({})),
    ]);
    const renameErrors = validateGermanRename({
      inputList,
      model,
      species,
      newGermanName: values.germanName,
      repoRoot,
      assetOverrides,
      assessmentIds,
    });
    if (renameErrors.length) {
      const error = new Error("Umbenennung ist nicht möglich");
      error.statusCode = 409;
      error.details = renameErrors;
      throw error;
    }
    const scientificRenameErrors = validateScientificRename({ inputList, model, species, values });
    if (scientificRenameErrors.length) {
      const error = new Error("Wissenschaftliche Umbenennung ist nicht möglich");
      error.statusCode = 409;
      error.details = scientificRenameErrors;
      throw error;
    }

    const changes = buildEditChanges(inputList[inputIndex], values);
    if (!changes.length) {
      const error = new Error("Es wurden keine Änderungen vorgenommen");
      error.statusCode = 400;
      throw error;
    }
    const scientificNameChanged = changes.some((change) => (
      change.key === EDITABLE_SCIENTIFIC_FIELD.key || change.key === "urlSlug"
    ));
    if (scientificNameChanged && !values.scientificNameUnlocked) {
      const error = new Error("Wissenschaftlicher Name ist gesperrt");
      error.statusCode = 409;
      error.details = [
        "Bitte Schloss öffnen und bestätigen: Die Änderung ändert den URL-Slug und kann sich direkt auf die Website auswirken.",
      ];
      throw error;
    }

    const token = randomUUID();
    const expiresAt = Date.now() + PREVIEW_TOKEN_TTL_MS;
    previewTokens.set(token, {
      type: "edit",
      id,
      values,
      sourceRevision: hashText(sourceText),
      speciesDataRevision: await readFile(join(repoRoot, "speciesData.json"), "utf8").then(hashText).catch(() => ""),
      expiresAt,
    });

    return {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      species: {
        id: species.id,
        germanName: species.germanName,
        scientificName: species.scientificName,
      },
      changes,
      warnings: [
        "Vor dem Speichern wird automatisch eine lokale Sicherung angelegt.",
        scientificNameChanged
          ? "Achtung: Der wissenschaftliche Name ändert den URL-Slug und kann sich direkt auf die Website auswirken."
          : "",
        editChangesRequirePipelineTransfer(changes)
          ? "Geänderte Eingabefelder werden später mit „Änderungen übertragen“ in speciesData.json übernommen."
          : "Name, URL-Slug, Assetname, Assetordner und lokale Metadaten werden direkt konsistent umbenannt.",
      ].filter(Boolean),
    };
  }

  async function saveSpeciesEdit(id, payload) {
    cleanupPreviewTokens();
    const token = String(payload?.token ?? "");
    const preview = previewTokens.get(token);
    if (!preview || preview.type !== "edit" || preview.id !== id) {
      const error = new Error("Vorschau ist ungültig oder abgelaufen");
      error.statusCode = 409;
      throw error;
    }

    const species = findEditableSpecies(model, id);
    if (!species) {
      const error = new Error("Art wurde nicht gefunden");
      error.statusCode = 404;
      throw error;
    }

    const sourceText = await readFile(speciesListPath, "utf8");
    if (hashText(sourceText) !== preview.sourceRevision) {
      previewTokens.delete(token);
      const error = new Error("Eingabeliste wurde seit der Vorschau geändert. Bitte erneut prüfen.");
      error.statusCode = 409;
      throw error;
    }

    const inputList = JSON.parse(sourceText);
    const inputIndex = findInputIndex(inputList, species);
    if (inputIndex < 0) {
      const error = new Error("Art fehlt in der Eingabeliste");
      error.statusCode = 409;
      throw error;
    }

    const { values, errors } = validateEditableValues(preview.values, species);
    if (errors.length) {
      const error = new Error("Gespeicherte Vorschau ist ungültig");
      error.statusCode = 409;
      error.details = errors;
      throw error;
    }

    const speciesDataPath = join(repoRoot, "speciesData.json");
    const reportPath = join(repoRoot, "fehlende_elemente_report.json");
    const [
      speciesDataText,
      registryText,
      assessmentText,
      reportText,
      manualMapText,
    ] = await Promise.all([
      readFile(speciesDataPath, "utf8").catch(() => "[]\n"),
      readFile(assetOverridesPath, "utf8").catch(() => '{\n  "version": 1,\n  "assets": {}\n}\n'),
      readFile(assessmentIdsPath, "utf8").catch(() => "{}\n"),
      readFile(reportPath, "utf8").catch(() => ""),
      readFile(manualMapOverridesPath, "utf8").catch(() => ""),
    ]);
    const speciesData = JSON.parse(speciesDataText);
    const registry = JSON.parse(registryText);
    registry.assets ??= {};
    const assessmentIds = JSON.parse(assessmentText);
    const report = reportText ? JSON.parse(reportText) : null;
    const renameErrors = validateGermanRename({
      inputList,
      model,
      species,
      newGermanName: values.germanName,
      repoRoot,
      assetOverrides: registry,
      assessmentIds,
    });
    if (renameErrors.length) {
      const error = new Error("Umbenennung ist nicht möglich");
      error.statusCode = 409;
      error.details = renameErrors;
      throw error;
    }
    const scientificRenameErrors = validateScientificRename({ inputList, model, species, values });
    if (scientificRenameErrors.length) {
      const error = new Error("Wissenschaftliche Umbenennung ist nicht möglich");
      error.statusCode = 409;
      error.details = scientificRenameErrors;
      throw error;
    }

    const changes = buildEditChanges(inputList[inputIndex], values);
    if (!changes.length) {
      previewTokens.delete(token);
      const error = new Error("Die Änderungen sind nicht mehr erforderlich");
      error.statusCode = 409;
      throw error;
    }
    const pipelineRequired = editChangesRequirePipelineTransfer(changes);
    const germanNameChanged =
      normalizeComparable(inputList[inputIndex].german) !== normalizeComparable(values.germanName);
    const newScientificName = values.scientificName;
    const oldSlug = species.id;
    const newSlug = values.slug;
    const scientificNameChanged =
      scientificKey(inputList[inputIndex].genus, inputList[inputIndex].species)
        !== scientificKey(values.genus, values.species);
    if (scientificNameChanged && !values.scientificNameUnlocked) {
      previewTokens.delete(token);
      const error = new Error("Wissenschaftlicher Name ist gesperrt");
      error.statusCode = 409;
      error.details = [
        "Bitte Schloss öffnen und bestätigen: Die Änderung ändert den URL-Slug und kann sich direkt auf die Website auswirken.",
      ];
      throw error;
    }
    const oldGermanName = species.germanName;
    const newGermanName = values.germanName;
    const oldSafeName = species.safeName;
    const newSafeName = sanitizeAssetName(newGermanName);
    const safeNameChanged =
      oldSafeName.toLocaleLowerCase("de") !== newSafeName.toLocaleLowerCase("de");
    const oldAssetDirectory = join(repoRoot, "species-assets", oldSafeName);
    const newAssetDirectory = join(repoRoot, "species-assets", newSafeName);

    await mkdir(backupDir, { recursive: true });
    const backupName =
      `species_list-${compactTimestamp()}-${sanitizeAssetName(species.germanName)}-${randomUUID().slice(0, 8)}.json`;
    const backupPath = join(backupDir, backupName);
    await writeFile(backupPath, sourceText, "utf8");

    const currentEntry = inputList[inputIndex];
    inputList[inputIndex] = {
      ...currentEntry,
      german: values.germanName,
      genus: values.genus,
      species: values.species,
      size: values.size,
      weight: values.weight,
      life_expectancy: values.lifeExpectancy,
    };

    let registryChanged = false;
    let assessmentChanged = false;
    let speciesDataChanged = false;
    let reportChanged = false;
    let manualMapTextNext = manualMapText;

    const generatedIndex = speciesData.findIndex((entry) => (
      entry?.URLSlug === species.id
      || scientificKey(entry?.Genus, entry?.Species)
        === scientificKey(species.taxonomy.genus, species.taxonomy.species)
    ));
    if (generatedIndex >= 0 && (germanNameChanged || scientificNameChanged)) {
      speciesData[generatedIndex] = {
        ...speciesData[generatedIndex],
        ...(germanNameChanged ? { "Deutscher Name": newGermanName } : {}),
        ...(scientificNameChanged
          ? {
              "Wissenschaftlicher Name": newScientificName,
              Genus: values.genus,
              Species: values.species,
              URLSlug: newSlug,
            }
          : {}),
      };
      speciesDataChanged = true;
    }

    if (germanNameChanged) {
      if (registry.assets[oldSafeName]) {
        registry.assets[newSafeName] = registry.assets[oldSafeName];
        if (newSafeName !== oldSafeName) delete registry.assets[oldSafeName];
        for (const assetEntry of Object.values(registry.assets[newSafeName] ?? {})) {
          if (assetEntry && typeof assetEntry === "object" && Object.hasOwn(assetEntry, "germanName")) {
            assetEntry.germanName = newGermanName;
          }
        }
        registryChanged = true;
      }

      if (Object.hasOwn(assessmentIds, oldSafeName)) {
        assessmentIds[newSafeName] = assessmentIds[oldSafeName];
        if (newSafeName !== oldSafeName) delete assessmentIds[oldSafeName];
        assessmentChanged = true;
      }

      if (report) {
        replaceReportSpeciesName(report, oldGermanName, newGermanName, oldSafeName, newSafeName);
        reportChanged = true;
      }

      if (manualMapText && registryChanged) {
        manualMapTextNext = synchronizeManualMapDocumentation(manualMapText, registry);
      }
    }

    const metadataUpdates = [];
    if ((germanNameChanged || scientificNameChanged) && existsSync(oldAssetDirectory)) {
      metadataUpdates.push("credits.json", "portrait.json");
    }

    let assetDirectoryMoved = false;
    try {
      if (safeNameChanged && existsSync(oldAssetDirectory)) {
        closeActiveFileStreams((filePath) => resolve(filePath).startsWith(resolve(oldAssetDirectory)));
        await rename(oldAssetDirectory, newAssetDirectory);
        assetDirectoryMoved = true;
      }

      await writeJsonAtomic(speciesListPath, inputList);
      if (speciesDataChanged) await writeJsonAtomic(speciesDataPath, speciesData);
      if (registryChanged) await writeJsonAtomic(assetOverridesPath, registry);
      if (assessmentChanged) await writeJsonAtomic(assessmentIdsPath, assessmentIds);
      if (reportChanged && report) await writeJsonAtomic(reportPath, report);
      if (manualMapTextNext !== manualMapText) await writeTextAtomic(manualMapOverridesPath, manualMapTextNext);

      const metadataDirectory = safeNameChanged ? newAssetDirectory : oldAssetDirectory;
      for (const fileName of metadataUpdates) {
        const metadataPath = join(metadataDirectory, fileName);
        if (!existsSync(metadataPath)) continue;
        const metadata = updateAssetMetadataNames(
          JSON.parse(await readFile(metadataPath, "utf8")),
          { germanName: newGermanName, scientificName: newScientificName },
        );
        await writeJsonAtomic(metadataPath, metadata);
      }
    } catch (error) {
      if (assetDirectoryMoved && existsSync(newAssetDirectory) && !existsSync(oldAssetDirectory)) {
        await rename(newAssetDirectory, oldAssetDirectory).catch(() => {});
      }
      await writeFile(speciesListPath, sourceText, "utf8").catch(() => {});
      if (speciesDataChanged) await writeFile(speciesDataPath, speciesDataText, "utf8").catch(() => {});
      if (registryChanged) await writeFile(assetOverridesPath, registryText, "utf8").catch(() => {});
      if (assessmentChanged) await writeFile(assessmentIdsPath, assessmentText, "utf8").catch(() => {});
      if (reportChanged && reportText) await writeFile(reportPath, reportText, "utf8").catch(() => {});
      if (manualMapTextNext !== manualMapText) {
        await writeFile(manualMapOverridesPath, manualMapText, "utf8").catch(() => {});
      }
      throw error;
    }

    previewTokens.delete(token);
    await refreshModel({ force: true });
    let backupRetention = { kept: 0, removed: 0 };
    let backupCleanupWarning = "";
    try {
      backupRetention = await pruneSpeciesListBackups(backupDir);
    } catch (error) {
      backupCleanupWarning = `Backup-Bereinigung fehlgeschlagen: ${error.message}`;
    }
    return {
      ok: true,
      backup: `species-explorer/backups/${backupName}`,
      backupRetention,
      backupCleanupWarning,
      changes,
      species: model.species.find((entry) => entry.id === newSlug)
        ?? model.species.find((entry) => entry.id === id)
        ?? null,
      summary: model.summary,
      validation: model.validation,
      oldSafeName,
      newSafeName,
      safeNameChanged,
      oldSlug,
      newSlug,
      slugChanged: oldSlug !== newSlug,
      pipelineRequired,
    };
  }

  const server = createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${host}:${port}`);
      const editRoute = url.pathname.match(/^\/api\/species\/([^/]+)\/(preview|save)$/);
      const deleteRoute = url.pathname.match(/^\/api\/species\/([^/]+)\/delete\/(preview|save)$/);
      const mapAssetRoute = url.pathname.match(
        /^\/api\/species\/([^/]+)\/assets\/map\/(preview|save|delete|restore)$/,
      );
      const mapPreviewFileRoute = url.pathname.match(
        /^\/api\/species\/([^/]+)\/assets\/map\/preview-file$/,
      );
      const soundAssetRoute = url.pathname.match(
        /^\/api\/species\/([^/]+)\/assets\/sound\/(preview|save|reject|delete|restore)$/,
      );
      const soundPreviewFileRoute = url.pathname.match(
        /^\/api\/species\/([^/]+)\/assets\/sound\/preview-file$/,
      );
      const portraitAssetRoute = url.pathname.match(
        /^\/api\/species\/([^/]+)\/assets\/portrait\/(prompt|preview|save|delete|restore)$/,
      );
      const portraitPreviewFileRoute = url.pathname.match(
        /^\/api\/species\/([^/]+)\/assets\/portrait\/preview-file$/,
      );

      if (
        (request.method === "GET" || request.method === "HEAD")
        && mapPreviewFileRoute
      ) {
        cleanupPreviewTokens();
        const id = decodeURIComponent(mapPreviewFileRoute[1]);
        const token = String(url.searchParams.get("token") ?? "");
        const preview = previewTokens.get(token);
        if (!preview || preview.type !== "map-asset" || preview.id !== id) {
          sendText(response, 404, "Kartenvorschau nicht gefunden");
          return;
        }
        await sendFile(request, response, preview.stagingPath);
        return;
      }

      if (
        (request.method === "GET" || request.method === "HEAD")
        && soundPreviewFileRoute
      ) {
        cleanupPreviewTokens();
        const id = decodeURIComponent(soundPreviewFileRoute[1]);
        const token = String(url.searchParams.get("token") ?? "");
        const preview = previewTokens.get(token);
        if (!preview || preview.type !== "sound-asset" || preview.id !== id) {
          sendText(response, 404, "Soundvorschau nicht gefunden");
          return;
        }
        await sendFile(request, response, preview.stagingPath);
        return;
      }

      if (
        (request.method === "GET" || request.method === "HEAD")
        && portraitPreviewFileRoute
      ) {
        cleanupPreviewTokens();
        const id = decodeURIComponent(portraitPreviewFileRoute[1]);
        const token = String(url.searchParams.get("token") ?? "");
        const preview = previewTokens.get(token);
        if (!preview || preview.type !== "portrait-asset" || preview.id !== id) {
          sendText(response, 404, "Artporträt-Vorschau nicht gefunden");
          return;
        }
        await sendFile(request, response, preview.stagingPath);
        return;
      }

      if (request.method === "POST" && mapAssetRoute) {
        const id = decodeURIComponent(mapAssetRoute[1]);
        const action = mapAssetRoute[2];
        const payload = await readJsonBody(request, {
          maxBytes: action === "preview" ? MAX_MAP_PREVIEW_BODY_BYTES : MAX_JSON_BODY_BYTES,
        });
        const result = action === "preview"
          ? await previewMapAsset(id, payload)
          : action === "restore"
            ? await restoreSpeciesAsset(id, "map")
          : action === "delete"
            ? await deleteSpeciesAsset(id, "map")
          : await saveMapAsset(id, payload);
        sendJson(response, 200, result);
        return;
      }

      if (request.method === "POST" && soundAssetRoute) {
        const id = decodeURIComponent(soundAssetRoute[1]);
        const action = soundAssetRoute[2];
        const payload = await readJsonBody(request, {
          maxBytes: action === "preview" ? MAX_SOUND_PREVIEW_BODY_BYTES : MAX_JSON_BODY_BYTES,
        });
        const result = action === "preview"
          ? await previewSoundAsset(id, payload)
          : action === "reject"
            ? await rejectCurrentSoundAsset(id)
            : action === "restore"
              ? await restoreSpeciesAsset(id, "sound")
            : action === "delete"
              ? await deleteSpeciesAsset(id, "sound")
            : await saveSoundAsset(id, payload);
        sendJson(response, 200, result);
        return;
      }

      if (request.method === "POST" && portraitAssetRoute) {
        const id = decodeURIComponent(portraitAssetRoute[1]);
        const action = portraitAssetRoute[2];
        const payload = await readJsonBody(request, {
          maxBytes: action === "preview"
            ? MAX_PORTRAIT_PREVIEW_BODY_BYTES
            : MAX_JSON_BODY_BYTES,
        });
        const result = action === "prompt"
          ? createPortraitPrompt(id, payload)
          : action === "preview"
            ? await previewPortraitAsset(id, payload)
            : action === "restore"
              ? await restoreSpeciesAsset(id, "portrait")
            : action === "delete"
              ? await deleteSpeciesAsset(id, "portrait")
            : await savePortraitAsset(id, payload);
        sendJson(response, 200, result);
        return;
      }

      if (
        request.method === "POST"
        && (url.pathname === "/api/pipeline/preview" || url.pathname === "/api/pipeline/start")
      ) {
        const payload = await readJsonBody(request);
        const result = url.pathname.endsWith("/preview")
          ? await previewPipeline(payload)
          : await startPipeline(payload);
        sendJson(response, 200, result);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/settings/backup") {
        const payload = await readJsonBody(request);
        sendJson(response, 200, await saveBackupSettings(payload));
        return;
      }

      if (
        request.method === "POST"
        && (url.pathname === "/api/backup/preview" || url.pathname === "/api/backup/start")
      ) {
        const payload = await readJsonBody(request);
        const result = url.pathname.endsWith("/preview")
          ? await previewNasBackup()
          : startNasBackup(payload);
        sendJson(response, 200, result);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/pipeline/assets/review") {
        const payload = await readJsonBody(request);
        sendJson(response, 200, await savePipelineAssetReview(payload));
        return;
      }

      if (
        request.method === "POST"
        && (
          url.pathname === "/api/species/new/preview"
          || url.pathname === "/api/species/new/save"
          || url.pathname === "/api/species/new/portrait-prompt"
          || url.pathname === "/api/species/new/portrait-preview"
        )
      ) {
        const payload = await readJsonBody(request, {
          maxBytes: url.pathname.endsWith("/portrait-preview")
            ? MAX_PORTRAIT_PREVIEW_BODY_BYTES
            : MAX_JSON_BODY_BYTES,
        });
        const result = url.pathname.endsWith("/preview")
          ? await previewNewSpecies(payload)
          : url.pathname.endsWith("/portrait-prompt")
            ? createNewSpeciesPortraitPrompt(payload)
            : url.pathname.endsWith("/portrait-preview")
              ? await previewNewSpeciesPortrait(payload)
              : await saveNewSpecies(payload);
        sendJson(response, 200, result);
        return;
      }

      if (request.method === "POST" && deleteRoute) {
        const id = decodeURIComponent(deleteRoute[1]);
        const payload = await readJsonBody(request);
        const result = deleteRoute[2] === "preview"
          ? await previewSpeciesDelete(id)
          : await saveSpeciesDelete(id, payload);
        sendJson(response, 200, result);
        return;
      }

      if (request.method === "POST" && editRoute) {
        const id = decodeURIComponent(editRoute[1]);
        const payload = await readJsonBody(request);
        const result = editRoute[2] === "preview"
          ? await previewSpeciesEdit(id, payload)
          : await saveSpeciesEdit(id, payload);
        sendJson(response, 200, result);
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD, POST");
        sendText(response, 405, "Nur definierte Lese- und Bearbeitungsrouten sind erlaubt.");
        return;
      }

      if (url.pathname === "/api/summary") {
        await refreshModel();
        sendJson(response, 200, model.summary);
        return;
      }

      if (url.pathname === "/api/species") {
        await refreshModel();
        sendJson(response, 200, model.species);
        return;
      }

      if (url.pathname === "/api/validation") {
        await refreshModel();
        sendJson(response, 200, model.validation);
        return;
      }

      if (url.pathname === "/api/revision") {
        const changed = await refreshModel();
        sendJson(response, 200, { revision: modelRevision, changed });
        return;
      }

      if (url.pathname === "/api/pending-changes") {
        await refreshModel();
        sendJson(response, 200, await pendingChangesPayload());
        return;
      }

      if (url.pathname === "/api/settings") {
        sendJson(response, 200, publicSettingsPayload());
        return;
      }

      if (url.pathname === "/api/pipeline/status") {
        sendJson(response, 200, pipelineState);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/pipeline/assets/backup-file") {
        await sendPipelineBackupFile(url, request, response);
        return;
      }

      if (url.pathname === "/api/backup/status") {
        sendJson(response, 200, backupState);
        return;
      }

      if (url.pathname === "/api/reload") {
        await refreshModel({ force: true });
        sendJson(response, 200, { ok: true, summary: model.summary });
        return;
      }

      if (url.pathname.startsWith("/assets/")) {
        await sendFile(request, response, safeAssetPath(url.pathname, repoRoot));
        return;
      }

      if (url.pathname.startsWith("/graphics/")) {
        await sendFile(request, response, safeGraphicsPath(url.pathname, repoRoot));
        return;
      }

      await sendFile(request, response, safePublicPath(url.pathname));
    } catch (error) {
      sendJson(response, error.statusCode ?? 500, {
        error: error.message,
        details: error.details ?? [],
        fieldErrors: error.fieldErrors ?? {},
      });
    }
  });

  return {
    host,
    port,
    server,
    listen() {
      return new Promise((resolveListen, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolveListen(server.address());
        });
      });
    },
    close() {
      return new Promise((resolveClose, reject) => {
        server.closeIdleConnections?.();
        server.closeAllConnections?.();
        server.close((error) => (error ? reject(error) : resolveClose()));
      });
    },
  };
}

function parsePort(argv) {
  const arg = argv.find((value) => value.startsWith("--port="));
  const parsed = Number(arg?.split("=")[1] ?? process.env.SPECIES_EXPLORER_PORT ?? DEFAULT_PORT);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : DEFAULT_PORT;
}

export async function isExplorerAlreadyReachable(host, port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);
  try {
    const response = await fetch(`http://${host}:${port}/`, { signal: controller.signal });
    if (!response.ok) {
      return false;
    }
    const html = await response.text();
    return html.includes("<title>Arten-Explorer</title>") || html.includes("Arten-Explorer");
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const app = await createExplorerServer({ port: parsePort(process.argv.slice(2)) });
  try {
    await app.listen();
    console.log(`Arten-Explorer: http://${app.host}:${app.port}`);
    console.log("Kontrollierte species_list.json-Bearbeitung aktiv. Beenden mit Strg+C.");
  } catch (error) {
    const url = `http://${app.host}:${app.port}`;
    if (error.code === "EADDRINUSE" && (await isExplorerAlreadyReachable(app.host, app.port))) {
      console.log(`Arten-Explorer läuft bereits: ${url}`);
      console.log("Kein zweiter Server gestartet. Bestehendes Fenster oder Browser-Tab verwenden.");
      process.exitCode = 0;
    } else if (error.code === "EADDRINUSE") {
      console.error(`Port ${app.host}:${app.port} ist bereits belegt, aber dort läuft kein erkannter Arten-Explorer.`);
      console.error("Alten Prozess beenden oder mit --port=<Port> einen anderen Port wählen.");
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
