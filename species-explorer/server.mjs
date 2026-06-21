import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
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
const MAX_SOUND_BYTES = 50 * 1024 * 1024;
const MAX_SOUND_PREVIEW_BODY_BYTES = 68 * 1024 * 1024;
const MAX_PORTRAIT_BYTES = 20 * 1024 * 1024;
const MAX_PORTRAIT_PREVIEW_BODY_BYTES = 28 * 1024 * 1024;
const MAX_PORTRAIT_INSTRUCTIONS_LENGTH = 800;
const BACKUP_RETENTION_COUNT = 20;
const ASSET_BACKUP_RETENTION_COUNT = 3;
const ASSET_BACKUP_GLOBAL_BYTES = 500 * 1024 * 1024;
const PIPELINE_LOG_RETENTION_COUNT = 20;
const PIPELINE_LOG_LINE_LIMIT = 400;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".webp": "image/webp",
};

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
    if (map?.manual === false) continue;
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

function hashText(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fileSha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function isSha256(value) {
  return /^[0-9a-f]{64}$/i.test(String(value ?? ""));
}

function compactTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
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
      const assetPath = join(speciesPath, assetDirectory.name);
      const files = await readdir(assetPath, { withFileTypes: true });
      for (const file of files) {
        const backupPath = join(assetPath, file.name);
        if (file.isFile() && /^map-\d{8}T\d{6}Z-[0-9a-f]{8}\.jpg$/.test(file.name)) {
          const details = await stat(backupPath);
          collected.push({
            backupPath,
            species: speciesDirectory.name,
            assetType: assetDirectory.name,
            name: file.name,
            bytes: details.size,
            mtimeMs: details.mtimeMs,
          });
        } else if (
          file.isDirectory()
          && assetDirectory.name === "sound"
          && /^sound-\d{8}T\d{6}Z-[0-9a-f]{8}$/.test(file.name)
        ) {
          const backupFiles = await readdir(backupPath, { withFileTypes: true });
          let bytes = 0;
          let mtimeMs = 0;
          for (const backupFile of backupFiles) {
            if (!backupFile.isFile() || !["sound.mp3", "credits.json", "spectrogram.webp"].includes(backupFile.name)) {
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
          });
        } else if (
          file.isDirectory()
          && assetDirectory.name === "portrait"
          && /^portrait-\d{8}T\d{6}Z-[0-9a-f]{8}$/.test(file.name)
        ) {
          const backupFiles = await readdir(backupPath, { withFileTypes: true });
          let bytes = 0;
          let mtimeMs = 0;
          for (const backupFile of backupFiles) {
            if (!backupFile.isFile() || !["portrait.webp", "portrait.json"].includes(backupFile.name)) {
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

function validateMapPreviewPayload(payload) {
  const reason = String(payload?.reason ?? "").trim();
  const source = String(payload?.source ?? "").trim();
  const originalName = String(payload?.originalName ?? "").trim();
  const imageBase64 = String(payload?.imageBase64 ?? "").trim();
  const errors = [];

  if (reason.length < 5) errors.push("Pflegegrund muss mindestens 5 Zeichen enthalten");
  if (reason.length > 500) errors.push("Pflegegrund darf maximal 500 Zeichen enthalten");
  if (!source) {
    errors.push("Quellen-URL ist erforderlich");
  } else {
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
  if (!/\.jpe?g$/i.test(originalName)) errors.push("Es sind nur JPEG-Dateien erlaubt");
  if (!imageBase64) errors.push("JPEG-Datei fehlt");
  if (errors.length) return { errors };

  let buffer;
  try {
    buffer = Buffer.from(imageBase64, "base64");
  } catch {
    errors.push("JPEG-Datei konnte nicht gelesen werden");
    return { errors };
  }
  if (!buffer.length) errors.push("JPEG-Datei ist leer");
  if (buffer.length > MAX_MAP_BYTES) errors.push("JPEG-Datei darf maximal 20 MB groß sein");
  let dimensions = null;
  if (!errors.length) {
    try {
      dimensions = inspectJpeg(buffer);
    } catch (error) {
      errors.push(error.message);
    }
  }
  return { errors, reason, source, originalName, buffer, dimensions };
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

function validateEditableValues(payload) {
  const values = {};
  const errors = [];

  for (const field of EDITABLE_FIELD_DEFINITIONS) {
    const value = String(payload?.[field.key] ?? "").trim();
    if (!value) {
      errors.push(`${field.label} darf nicht leer sein`);
    } else if (value.length > field.maxLength) {
      errors.push(`${field.label} darf maximal ${field.maxLength} Zeichen lang sein`);
    } else if (/[\u0000-\u001F\u007F]/.test(value)) {
      errors.push(`${field.label} enthält unzulässige Steuerzeichen`);
    }
    values[field.key] = value;
  }

  return { values, errors };
}

function validateNewSpeciesValues(payload) {
  const values = {};
  const errors = [];

  for (const field of NEW_SPECIES_FIELD_DEFINITIONS) {
    const value = String(payload?.[field.key] ?? "").trim();
    if (!value) {
      errors.push(`${field.label} darf nicht leer sein`);
    } else if (value.length > field.maxLength) {
      errors.push(`${field.label} darf maximal ${field.maxLength} Zeichen lang sein`);
    } else if (/[\u0000-\u001F\u007F]/.test(value)) {
      errors.push(`${field.label} enthält unzulässige Steuerzeichen`);
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
    errors.push(
      "Wissenschaftlicher Name muss genau aus Gattung und Art-Epitheton bestehen, zum Beispiel Turdus Merula",
    );
  } else if (scientificParts.some((part) => part.length > 100)) {
    errors.push("Gattung und Art-Epitheton dürfen jeweils maximal 100 Zeichen lang sein");
  } else if (scientificParts.length === 2) {
    const [rawGenus, rawSpecies] = scientificParts;
    values.genus =
      rawGenus.charAt(0).toLocaleUpperCase("de") + rawGenus.slice(1).toLocaleLowerCase("de");
    values.species = rawSpecies.toLocaleLowerCase("de");
    values.scientificName = `${values.genus} ${values.species}`;
  }

  return { values, errors };
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
  return EDITABLE_FIELD_DEFINITIONS
    .map((field) => ({
      field: field.label,
      key: field.key,
      before: valueOrUnknown(inputEntry[field.sourceKey]),
      after: values[field.key],
    }))
    .filter((change) => normalizeComparable(change.before) !== normalizeComparable(change.after));
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
  const [inputList, generatedList, report, manualMapMarkdown, assetOverrides] = await Promise.all([
    readJson(join(repoRoot, "species_list.json")),
    readJson(join(repoRoot, "speciesData.json")),
    readJson(join(repoRoot, "fehlende_elemente_report.json")),
    readFile(join(repoRoot, "docs", "manual-map-overrides.md"), "utf8"),
    readJson(join(repoRoot, "species-assets-overrides.json")).catch(() => ({ version: 1, assets: {} })),
  ]);

  if (!Array.isArray(inputList) || !Array.isArray(generatedList)) {
    throw new Error("species_list.json und speciesData.json muessen Arrays enthalten.");
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
  const allKeys = new Set([...inputByScientificName.keys(), ...generatedByScientificName.keys()]);
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

    if (!input) dataIssues.push("Kein Eintrag in species_list.json");
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

    if (!map.exists) assetIssues.push("Karte fehlt");
    if (!sound.exists) assetIssues.push("Sound fehlt");
    if (!creditsFile.exists) assetIssues.push("Credits fehlen");
    if (creditsFile.exists && creditsError) assetIssues.push("Credits sind ungültig");
    const mapOverride = assetOverrides.assets?.[safeName]?.map;
    const soundOverride = assetOverrides.assets?.[safeName]?.sound;
    const spectrogramOverride = assetOverrides.assets?.[safeName]?.spectrogram;
    const portraitOverride = assetOverrides.assets?.[safeName]?.portrait;
    const isManualMap = typeof mapOverride?.manual === "boolean"
      ? mapOverride.manual
      : manualMapSafeNames.has(safeName);
    const isManualSound = soundOverride?.manual === true;
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
    else if (!spectrogram.exists) assetIssues.push("Spektrogramm fehlt");
    let portraitHashVerified = false;
    let actualPortraitSha256 = "";
    let actualPortraitMetadataSha256 = "";
    if (portrait.exists || portraitMetadataFile.exists) {
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
        kingdom: valueOrUnknown(generated?.Kingdom),
        phylum: valueOrUnknown(generated?.Phylum),
        className: valueOrUnknown(generated?.Class),
        order: valueOrUnknown(generated?.Order),
        family: valueOrUnknown(generated?.Family),
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
        },
        sound: {
          ...sound,
          url: `/assets/${encodeURIComponent(safeName)}/sound.mp3`,
          manuallyAdded: isManualSound,
          manualReason: soundOverride?.reason ?? "",
          sha256: soundOverride?.sha256 ?? "",
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
        },
      },
      credits,
      creditsError,
      isNcSound,
      reportNcSound: ncNames.has(germanName),
      isManualMap,
      isManualSound,
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
      reportCounterIssues.push(`${key}: Zähler ${report.counts?.[key] ?? "fehlt"}, Liste ${expected}`);
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
    createReadStream(path, range).pipe(response);
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
  createReadStream(path).pipe(response);
}

export async function createExplorerServer({
  repoRoot = REPO_ROOT,
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  publishAssetChanges = true,
  spectrogramRenderer = renderSpectrogram,
  portraitRenderer = renderPortrait,
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
  const pipelineLogDir = join(repoRoot, "species-explorer", "logs");
  const pipelineAssetBackupRoot = join(repoRoot, "species-explorer", "pipeline-asset-backups");
  const assetStagingRoot = join(repoRoot, "species-explorer", "staging");
  const assetBackupRoot = join(repoRoot, "species-explorer", "asset-backups");
  const pendingAssetReviewPath = join(repoRoot, "species-explorer", "pending-asset-review.json");
  let pipelineProcess = null;
  let assetWriteActive = false;
  let pipelineAssetSnapshot = new Map();
  let pipelineState = {
    status: "idle",
    phase: "",
    mode: "",
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

  async function readPipelinePlan(mode) {
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
      });
    return {
      plan,
      sourceRevision: hashText(
        `${speciesListText}\n${speciesDataText}\n${JSON.stringify(
          mode === "cleanup" ? publicCleanupPlan(plan) : publicPipelinePlan(plan),
        )}`,
      ),
    };
  }

  async function previewPipeline(payload) {
    cleanupPreviewTokens();
    const mode = String(payload?.mode ?? "");
    if (!["all", "missing", "manual-maps", "nc-sounds", "cleanup"].includes(mode)) {
      const error = new Error(
        "Pipeline-Modus muss all, missing, manual-maps, nc-sounds oder cleanup sein",
      );
      error.statusCode = 400;
      throw error;
    }

    const { plan, sourceRevision } = await readPipelinePlan(mode);
    const token = randomUUID();
    const expiresAt = Date.now() + PREVIEW_TOKEN_TTL_MS;
    previewTokens.set(token, {
      type: "pipeline",
      mode,
      sourceRevision,
      expiresAt,
    });
    return {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      ...(mode === "cleanup" ? publicCleanupPlan(plan) : publicPipelinePlan(plan)),
      tokensAvailable:
        mode === "cleanup"
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
              ? "Nur vorhandene NC-Sounds werden auf freie Alternativen geprüft und vor einer Übernahme angehört."
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
      hash.update(readFileSync(filePath));
    }
    return found ? hash.digest("hex") : "";
  }

  function capturePipelineAssets(plan) {
    const snapshot = new Map();
    const keepBackups = plan.mode === "manual-maps" || plan.mode === "nc-sounds";
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
        const relevantBackup =
          (plan.mode === "manual-maps" && type === "map")
          || (plan.mode === "nc-sounds" && type === "sound");
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
            copyFileSync(source, backup);
            backupFiles[name] = backup;
          }
        }
        snapshot.set(`${target.safeName}:${type}`, {
          exists: existsSync(filePath),
          hash: assetCompositeHash(assetDir, type),
          backupFiles,
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
        const changed = exists && before.exists && before.hash !== assetCompositeHash(assetDir, type);
        if ((!before.exists && exists) || changed) {
          additions.push({
            safeName: target.safeName,
            germanName: target.germanName,
            scientificName: target.scientificName,
            type,
            label,
            file: `species-assets/${target.safeName}/${fileName}`,
            url: `/assets/${encodeURIComponent(target.safeName)}/${fileName}?review=${pipelineState.runId}`,
            changed,
            reviewMode: plan.mode,
            backupFiles: before.backupFiles,
          });
        }
      }
    }
    return additions;
  }

  function runPipelineChild(command, args, phase) {
    pipelineState.phase = phase;
    appendPipelineLog(`--- ${phase} ---`);
    return new Promise((resolveRun) => {
      const child = spawn(command, args, {
        cwd: repoRoot,
        env: process.env,
        windowsHide: true,
      });
      pipelineProcess = child;
      child.stdout.on("data", (chunk) => appendPipelineLog(chunk));
      child.stderr.on("data", (chunk) => appendPipelineLog(chunk));
      child.on("error", (error) => {
        appendPipelineLog(`Prozessfehler: ${error.message}`);
        pipelineProcess = null;
        resolveRun(1);
      });
      child.on("close", (code) => {
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

    const message = pipelineState.mode === "cleanup"
      ? "Clean obsolete species data"
      : pipelineState.mode === "manual-maps"
        ? "Refresh automatic distribution maps"
        : pipelineState.mode === "nc-sounds"
          ? "Replace NC sounds with free alternatives"
      : pipelineState.mode === "all"
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

  async function finishPipelineRun(exitCode) {
    await unlink(pendingAssetReviewPath).catch(() => {});
    pipelineState.status = exitCode === 0 ? "completed" : "failed";
    pipelineState.exitCode = exitCode;
    pipelineState.completedAt = new Date().toISOString();
    if (exitCode !== 0 && !pipelineState.error) {
      pipelineState.error = `Pipeline wurde mit Code ${exitCode} beendet`;
    }
    await mkdir(pipelineLogDir, { recursive: true });
    const logName = `pipeline-${compactTimestamp(new Date(pipelineState.startedAt))}-${pipelineState.runId.slice(0, 8)}.log`;
    const logPath = join(pipelineLogDir, logName);
    await writeFile(logPath, `${pipelineState.log.join("\n")}\n`, "utf8");
    pipelineState.logFile = `species-explorer/logs/${logName}`;
    await prunePipelineLogs(pipelineLogDir).catch(() => {});
    if (pipelineState.runId) {
      rmSync(join(pipelineAssetBackupRoot, pipelineState.runId), { recursive: true, force: true });
    }
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

    let exitCode = await runPipelineChild(
      process.execPath,
      [join(repoRoot, "update.mjs"), `--mode=${plan.mode}`],
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
      exitCode = await runPipelineChild(process.execPath, spectrogramArgs, "Spektrogramm-Abgleich");
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
      appendPipelineLog("Keine neue automatische Alternative gefunden; bestehende Assets bleiben unverändert.");
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
        !["cleanup", "manual-maps", "nc-sounds"].includes(preview.mode)
        && (!process.env.IUCN_TOKEN || !process.env.XENO_TOKEN)
      );
    if (tokensMissing) {
      const error = new Error("IUCN_TOKEN oder XENO_TOKEN fehlt in der Server-Umgebung");
      error.statusCode = 409;
      throw error;
    }

    const { plan, sourceRevision } = await readPipelinePlan(preview.mode);
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
          missing: "Es gibt keine neuen, fehlenden oder zu entfernenden Arten",
          "manual-maps": "Es gibt keine manuell gepflegten Karten",
          "nc-sounds": "Es gibt keine ungeschützten NC-Sounds",
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
      log: [],
      logFile: "",
      error: "",
      reviewAssets: [],
      gitPublished: false,
    };
    pipelineAssetSnapshot = preview.mode === "cleanup" ? new Map() : capturePipelineAssets(plan);
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
      choices.map((choice) => [`${choice.safeName}:${choice.type}`, choice]),
    );
    for (const asset of pipelineState.reviewAssets) {
      const choice = choicesByKey.get(`${asset.safeName}:${asset.type}`);
      if (!choice || typeof choice.manual !== "boolean") {
        const error = new Error(`Pflegeentscheidung fehlt für ${asset.germanName} · ${asset.label}`);
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
    for (const asset of pipelineState.reviewAssets) {
      const choice = choicesByKey.get(`${asset.safeName}:${asset.type}`);
      if (retryMode && choice.manual) {
        const previous = pipelineAssetSnapshot.get(`${asset.safeName}:${asset.type}`);
        for (const [fileName, backupPath] of Object.entries(asset.backupFiles ?? {})) {
          const allowedBackupRoot = `${resolve(pipelineAssetBackupRoot, pipelineState.runId)}${sep}`;
          const resolvedBackupPath = resolve(backupPath);
          const allowedAssetRoot = `${resolve(repoRoot, "species-assets", asset.safeName)}${sep}`;
          const targetPath = resolve(repoRoot, "species-assets", asset.safeName, fileName);
          if (
            !`${resolvedBackupPath}`.startsWith(allowedBackupRoot)
            || !`${targetPath}`.startsWith(allowedAssetRoot)
          ) {
            throw new Error(`Unsicherer Wiederherstellungspfad für ${asset.germanName}`);
          }
          if (existsSync(resolvedBackupPath)) copyFileSync(resolvedBackupPath, targetPath);
        }
        registry.assets[asset.safeName] ??= {};
        if (previous?.override) registry.assets[asset.safeName][asset.type] = previous.override;
        else delete registry.assets[asset.safeName][asset.type];
        if (asset.type === "sound") {
          if (previous?.spectrogramOverride) {
            registry.assets[asset.safeName].spectrogram = previous.spectrogramOverride;
          } else {
            delete registry.assets[asset.safeName].spectrogram;
          }
        }
        if (Object.keys(registry.assets[asset.safeName]).length === 0) {
          delete registry.assets[asset.safeName];
        }
        registryChanged = true;
        continue;
      }

      acceptedAny = true;
      registry.assets[asset.safeName] ??= {};
      registry.assets[asset.safeName][asset.type] = {
        manual: choice.manual,
        reason: choice.manual
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
        if (choice.manual) continue;
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
      if (!acceptedAny && retryMode) {
        pipelineState.gitPublished = true;
        await finishPipelineRun(0);
        return;
      }
      if (pipelineState.mode === "nc-sounds") {
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

  async function publishMapAssetChanges(species) {
    if (!publishAssetChanges) {
      return { published: false, skipped: true, commit: "" };
    }
    const paths = [
      `species-assets/${species.safeName}/map.jpg`,
      "species-assets-overrides.json",
      "docs/manual-map-overrides.md",
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
    const mapPath = join(repoRoot, "species-assets", species.safeName, "map.jpg");
    const [registryText, documentationText] = await Promise.all([
      readFile(assetOverridesPath, "utf8").catch(() => '{\n  "version": 1,\n  "assets": {}\n}\n'),
      readFile(manualMapOverridesPath, "utf8"),
    ]);
    const mapBuffer = existsSync(mapPath) ? await readFile(mapPath) : Buffer.alloc(0);
    return {
      revision: hashText(
        `${createHash("sha256").update(mapBuffer).digest("hex")}\n${registryText}\n${documentationText}`,
      ),
      mapPath,
      mapBuffer,
      registryText,
      documentationText,
    };
  }

  async function previewMapAsset(id, payload) {
    cleanupPreviewTokens();
    if (pipelineProcess || pipelineState.status === "running" || pipelineState.status === "awaiting-review") {
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
    const validated = validateMapPreviewPayload(payload);
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
      if (source.mapBuffer.length) {
        const backupDirectory = join(assetBackupRoot, species.safeName, "map");
        await mkdir(backupDirectory, { recursive: true });
        const currentHash = createHash("sha256").update(source.mapBuffer).digest("hex");
        const backupName = `map-${compactTimestamp()}-${currentHash.slice(0, 8)}.jpg`;
        const backupPath = join(backupDirectory, backupName);
        await writeFile(backupPath, source.mapBuffer);
        backupRelativePath = `species-explorer/asset-backups/${species.safeName}/map/${backupName}`;
      }

      const registry = JSON.parse(source.registryText);
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

  async function publishSoundAssetChanges(species) {
    if (!publishAssetChanges) {
      return { published: false, skipped: true, commit: "" };
    }
    const paths = [
      `species-assets/${species.safeName}/sound.mp3`,
      `species-assets/${species.safeName}/credits.json`,
      `species-assets/${species.safeName}/spectrogram.webp`,
      "species-assets-overrides.json",
    ];
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
      ["commit", "-m", `Replace sound and credits for ${species.germanName}`],
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
      if (source.soundBuffer.length || source.creditsBuffer.length || source.spectrogramBuffer.length) {
        const backupDirectory = join(assetBackupRoot, species.safeName, "sound");
        await mkdir(backupDirectory, { recursive: true });
        const currentHash = createHash("sha256")
          .update(source.soundBuffer)
          .update(source.creditsBuffer)
          .digest("hex");
        const backupName = `sound-${compactTimestamp()}-${currentHash.slice(0, 8)}`;
        const backupPath = join(backupDirectory, backupName);
        await mkdir(backupPath, { recursive: true });
        for (const [fileName, buffer] of [
          ["sound.mp3", source.soundBuffer],
          ["credits.json", source.creditsBuffer],
          ["spectrogram.webp", source.spectrogramBuffer],
        ]) {
          if (buffer.length) await writeFile(join(backupPath, fileName), buffer);
        }
        backupRelativePath = `species-explorer/asset-backups/${species.safeName}/sound/${backupName}`;
      }

      const registry = JSON.parse(source.registryText);
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

  function createMissingPortraitPrompts() {
    const targets = model.species
      .filter((species) => species.inInput && species.missingPortrait)
      .map((species, index) => {
        const prompt = buildPortraitPrompt({
          germanName: species.germanName,
          scientificName: species.scientificName,
        });
        return {
          number: index + 1,
          id: species.id,
          germanName: species.germanName,
          scientificName: species.scientificName,
          safeName: species.safeName,
          suggestedFileName: `${species.safeName}.png`,
          prompt,
          promptSha256: portraitPromptSha256(prompt),
        };
      });
    const combinedText = targets.map((entry) => [
      `===== ${entry.number}. ${entry.germanName} · ${entry.scientificName} =====`,
      `Empfohlener Dateiname: ${entry.suggestedFileName}`,
      "",
      entry.prompt,
    ].join("\n")).join("\n\n\n");
    return {
      mode: "portraits",
      hasWork: targets.length > 0,
      targetCount: targets.length,
      speciesCount: model.species.length,
      promptVersion: PORTRAIT_STANDARD.promptVersion,
      targets,
      combinedText,
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
    if (publishAssetChanges) {
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
      if (source.portraitBuffer.length || source.metadataBuffer.length) {
        const backupDirectory = join(assetBackupRoot, species.safeName, "portrait");
        await mkdir(backupDirectory, { recursive: true });
        const currentHash = createHash("sha256")
          .update(source.portraitBuffer)
          .update(source.metadataBuffer)
          .digest("hex");
        const backupName = `portrait-${compactTimestamp()}-${currentHash.slice(0, 8)}`;
        const backupPath = join(backupDirectory, backupName);
        await mkdir(backupPath, { recursive: true });
        if (source.portraitBuffer.length) {
          await writeFile(join(backupPath, "portrait.webp"), source.portraitBuffer);
        }
        if (source.metadataBuffer.length) {
          await writeFile(join(backupPath, "portrait.json"), source.metadataBuffer);
        }
        backupRelativePath =
          `species-explorer/asset-backups/${species.safeName}/portrait/${backupName}`;
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
      const registry = JSON.parse(source.registryText);
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
      let publication;
      let publicationError = "";
      try {
        publication = await publishPortraitAssetChanges(species);
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

  async function previewNewSpecies(payload) {
    cleanupPreviewTokens();
    const { values, errors } = validateNewSpeciesValues(payload?.values);
    if (errors.length) {
      const error = new Error("Eingaben sind ungültig");
      error.statusCode = 400;
      error.details = errors;
      throw error;
    }

    const sourceText = await readFile(speciesListPath, "utf8");
    const inputList = JSON.parse(sourceText);
    if (!Array.isArray(inputList)) {
      const error = new Error("species_list.json muss ein Array enthalten");
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
        "speciesData.json und Assets bleiben unverändert. Die Pipeline muss anschließend separat ausgeführt werden.",
      ],
    };
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
      const error = new Error("species_list.json wurde seit der Vorschau geändert. Bitte erneut prüfen.");
      error.statusCode = 409;
      throw error;
    }

    const inputList = JSON.parse(sourceText);
    if (!Array.isArray(inputList)) {
      const error = new Error("species_list.json muss ein Array enthalten");
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
    if (!species.inInput) {
      const error = new Error("Art ist nicht in species_list.json enthalten");
      error.statusCode = 409;
      throw error;
    }

    const sourceText = await readFile(speciesListPath, "utf8");
    const inputList = JSON.parse(sourceText);
    const inputIndex = findInputIndex(inputList, species);
    if (inputIndex < 0) {
      const error = new Error("Art fehlt in species_list.json");
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
        "Der Eintrag wird aus species_list.json entfernt.",
        "Ohne Zusatzoption bleiben generierte Daten und Assets bis zum Bereinigungslauf bestehen.",
        "Mit Zusatzoption werden generierte Daten, Assessment-Zuordnung, Assetpflege und der Assetordner sofort dauerhaft gelöscht.",
      ],
      assetDirectoryExists: existsSync(join(repoRoot, "species-assets", species.safeName)),
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
    if (!species || !species.inInput) {
      previewTokens.delete(token);
      const error = new Error("Art ist nicht mehr in species_list.json enthalten");
      error.statusCode = 409;
      throw error;
    }

    const sourceText = await readFile(speciesListPath, "utf8");
    if (hashText(sourceText) !== preview.sourceRevision) {
      previewTokens.delete(token);
      const error = new Error("species_list.json wurde seit der Löschvorschau geändert");
      error.statusCode = 409;
      throw error;
    }

    const inputList = JSON.parse(sourceText);
    const inputIndex = findInputIndex(inputList, species);
    if (inputIndex < 0) {
      previewTokens.delete(token);
      const error = new Error("Art fehlt bereits in species_list.json");
      error.statusCode = 409;
      throw error;
    }

    await mkdir(backupDir, { recursive: true });
    const backupName =
      `species_list-${compactTimestamp()}-${sanitizeAssetName(species.germanName)}-${randomUUID().slice(0, 8)}.json`;
    await writeFile(join(backupDir, backupName), sourceText, "utf8");
    inputList.splice(inputIndex, 1);
    const tempPath = `${speciesListPath}.tmp-${randomUUID()}`;
    try {
      await writeFile(tempPath, `${JSON.stringify(inputList, null, 2)}\n`, "utf8");
      await rename(tempPath, speciesListPath);
    } catch (error) {
      await unlink(tempPath).catch(() => {});
      throw error;
    }

    let permanentCleanup = null;
    if (deleteAssets) {
      try {
        permanentCleanup = runSpeciesCleanup(repoRoot, {
          slug: species.slug || species.id,
          safeName: species.safeName,
        });
      } catch (error) {
        const rollbackPath = `${speciesListPath}.tmp-${randomUUID()}`;
        try {
          await writeFile(rollbackPath, sourceText, "utf8");
          await rename(rollbackPath, speciesListPath);
        } catch {
          await unlink(rollbackPath).catch(() => {});
        }
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
      backup: `species-explorer/backups/${backupName}`,
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

    const { values, errors } = validateEditableValues(payload?.values);
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
      const error = new Error("Art fehlt in species_list.json");
      error.statusCode = 409;
      throw error;
    }

    const changes = buildEditChanges(inputList[inputIndex], values);
    if (!changes.length) {
      const error = new Error("Es wurden keine Änderungen vorgenommen");
      error.statusCode = 400;
      throw error;
    }

    const token = randomUUID();
    const expiresAt = Date.now() + PREVIEW_TOKEN_TTL_MS;
    previewTokens.set(token, {
      type: "edit",
      id,
      values,
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
      },
      changes,
      warnings: [
        "Vor dem Speichern wird automatisch eine lokale Sicherung angelegt.",
        "speciesData.json bleibt unverändert. Die Pipeline muss anschließend separat ausgeführt werden.",
      ],
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
      const error = new Error("species_list.json wurde seit der Vorschau geändert. Bitte erneut prüfen.");
      error.statusCode = 409;
      throw error;
    }

    const inputList = JSON.parse(sourceText);
    const inputIndex = findInputIndex(inputList, species);
    if (inputIndex < 0) {
      const error = new Error("Art fehlt in species_list.json");
      error.statusCode = 409;
      throw error;
    }

    const { values, errors } = validateEditableValues(preview.values);
    if (errors.length) {
      const error = new Error("Gespeicherte Vorschau ist ungültig");
      error.statusCode = 409;
      error.details = errors;
      throw error;
    }

    const changes = buildEditChanges(inputList[inputIndex], values);
    if (!changes.length) {
      previewTokens.delete(token);
      const error = new Error("Die Änderungen sind nicht mehr erforderlich");
      error.statusCode = 409;
      throw error;
    }

    await mkdir(backupDir, { recursive: true });
    const backupName =
      `species_list-${compactTimestamp()}-${sanitizeAssetName(species.germanName)}-${randomUUID().slice(0, 8)}.json`;
    const backupPath = join(backupDir, backupName);
    await writeFile(backupPath, sourceText, "utf8");

    const currentEntry = inputList[inputIndex];
    inputList[inputIndex] = {
      ...currentEntry,
      size: values.size,
      weight: values.weight,
      life_expectancy: values.lifeExpectancy,
    };
    const nextText = `${JSON.stringify(inputList, null, 2)}\n`;
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
      changes,
      species: model.species.find((entry) => entry.id === id) ?? null,
      summary: model.summary,
      validation: model.validation,
      pipelineRequired: true,
    };
  }

  const server = createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${host}:${port}`);
      const editRoute = url.pathname.match(/^\/api\/species\/([^/]+)\/(preview|save)$/);
      const deleteRoute = url.pathname.match(/^\/api\/species\/([^/]+)\/delete\/(preview|save)$/);
      const mapAssetRoute = url.pathname.match(
        /^\/api\/species\/([^/]+)\/assets\/map\/(preview|save)$/,
      );
      const mapPreviewFileRoute = url.pathname.match(
        /^\/api\/species\/([^/]+)\/assets\/map\/preview-file$/,
      );
      const soundAssetRoute = url.pathname.match(
        /^\/api\/species\/([^/]+)\/assets\/sound\/(preview|save)$/,
      );
      const soundPreviewFileRoute = url.pathname.match(
        /^\/api\/species\/([^/]+)\/assets\/sound\/preview-file$/,
      );
      const portraitAssetRoute = url.pathname.match(
        /^\/api\/species\/([^/]+)\/assets\/portrait\/(prompt|preview|save)$/,
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

      if (request.method === "POST" && url.pathname === "/api/portraits/missing") {
        await readJsonBody(request);
        sendJson(response, 200, createMissingPortraitPrompts());
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/pipeline/assets/review") {
        const payload = await readJsonBody(request);
        sendJson(response, 200, await savePipelineAssetReview(payload));
        return;
      }

      if (
        request.method === "POST"
        && (url.pathname === "/api/species/new/preview" || url.pathname === "/api/species/new/save")
      ) {
        const payload = await readJsonBody(request);
        const result = url.pathname.endsWith("/preview")
          ? await previewNewSpecies(payload)
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

      if (url.pathname === "/api/pipeline/status") {
        sendJson(response, 200, pipelineState);
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

      await sendFile(request, response, safePublicPath(url.pathname));
    } catch (error) {
      sendJson(response, error.statusCode ?? 500, {
        error: error.message,
        details: error.details ?? [],
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

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const app = await createExplorerServer({ port: parsePort(process.argv.slice(2)) });
  await app.listen();
  console.log(`Arten-Explorer: http://${app.host}:${app.port}`);
  console.log("Kontrollierte species_list.json-Bearbeitung aktiv. Beenden mit Strg+C.");
}
