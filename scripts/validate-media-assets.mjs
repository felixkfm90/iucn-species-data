import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectMp3Buffer } from "./audio-format.mjs";

const modulePath = fileURLToPath(import.meta.url);
const isCli = path.resolve(process.argv[1] || "") === modulePath;
const MIB = 1024 * 1024;
export const MEDIA_LIMITS = Object.freeze({
  map: 2 * MIB,
  portrait: 2 * MIB,
  sound: 10 * MIB,
  credits: 128 * 1024,
  spectrogram: 512 * 1024,
  graphic: 2 * MIB,
  speciesPackage: 15 * MIB,
});

export function inspectJpeg(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return invalid("JPEG-Signatur fehlt");
  }

  let offset = 2;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
    if (isJpegSofMarker(marker) && segmentLength >= 7) {
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      return dimensionsResult("jpeg", width, height);
    }
    offset += segmentLength;
  }
  return invalid("JPEG-Abmessungen konnten nicht gelesen werden");
}

export function inspectPng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!Buffer.isBuffer(buffer) || buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) {
    return invalid("PNG-Signatur fehlt");
  }
  if (buffer.toString("ascii", 12, 16) !== "IHDR") return invalid("PNG-IHDR fehlt");
  return dimensionsResult("png", buffer.readUInt32BE(16), buffer.readUInt32BE(20));
}

export function inspectWebp(buffer) {
  if (
    !Buffer.isBuffer(buffer)
    || buffer.length < 30
    || buffer.toString("ascii", 0, 4) !== "RIFF"
    || buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return invalid("WebP-Signatur fehlt");
  }

  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    const width = 1 + readUInt24LE(buffer, 24);
    const height = 1 + readUInt24LE(buffer, 27);
    return dimensionsResult("webp", width, height);
  }
  if (chunk === "VP8 " && buffer.length >= 30 && buffer.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
    return dimensionsResult("webp", buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff);
  }
  if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
    const width = 1 + buffer[21] + ((buffer[22] & 0x3f) << 8);
    const height = 1 + ((buffer[22] & 0xc0) >> 6) + (buffer[23] << 2) + ((buffer[24] & 0x0f) << 10);
    return dimensionsResult("webp", width, height);
  }
  return invalid(`WebP-Chunk ${chunk || "unbekannt"} wird nicht erkannt`);
}

export function validateRepositoryMedia(repoRoot = process.cwd()) {
  const speciesList = readJson(path.join(repoRoot, "species_list.json"));
  const report = readJson(path.join(repoRoot, "fehlende_elemente_report.json"));
  if (!Array.isArray(speciesList)) throw new Error("species_list.json muss ein Array sein.");

  const allowedMissingSounds = new Set(report?.missing?.soundMp3 ?? []);
  const expectedSafeNames = new Set();
  const results = [];
  const errors = [];

  for (const species of speciesList) {
    const germanName = String(species?.german || "").trim();
    const safeName = sanitizeAssetName(germanName);
    expectedSafeNames.add(safeName);
    const assetDir = path.join(repoRoot, "species-assets", safeName);
    validateDirectorySize(assetDir, germanName, MEDIA_LIMITS.speciesPackage, errors);
    validateRequiredImage(path.join(assetDir, "map.jpg"), "Karte", inspectJpeg, MEDIA_LIMITS.map, results, errors);
    validateRequiredImage(
      path.join(assetDir, "portrait.webp"),
      "Artportrait",
      inspectWebp,
      MEDIA_LIMITS.portrait,
      results,
      errors,
    );

    const soundFiles = ["sound.mp3", "credits.json", "spectrogram.webp"];
    if (allowedMissingSounds.has(germanName)) {
      const unexpectedlyPresent = soundFiles.filter((name) => fs.existsSync(path.join(assetDir, name)));
      if (unexpectedlyPresent.length > 0 && unexpectedlyPresent.length < soundFiles.length) {
        errors.push(`${germanName}: bewusst fehlendes Soundpaket ist nur teilweise vorhanden (${unexpectedlyPresent.join(", ")}).`);
      }
      if (unexpectedlyPresent.length === soundFiles.length) {
        errors.push(`${germanName}: Report meldet fehlenden Sound, aber das vollständige Soundpaket ist vorhanden.`);
      }
      continue;
    }

    validateRequiredSound(path.join(assetDir, "sound.mp3"), MEDIA_LIMITS.sound, results, errors);
    validateRequiredJson(path.join(assetDir, "credits.json"), "Sound-Credits", MEDIA_LIMITS.credits, results, errors);
    validateRequiredImage(
      path.join(assetDir, "spectrogram.webp"),
      "Spektrogramm",
      inspectWebp,
      MEDIA_LIMITS.spectrogram,
      results,
      errors,
    );
  }

  const assetRoot = path.join(repoRoot, "species-assets");
  if (fs.existsSync(assetRoot)) {
    for (const entry of fs.readdirSync(assetRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && !expectedSafeNames.has(entry.name)) {
        errors.push(`Verwaister Assetordner: species-assets/${entry.name}`);
      }
    }
  }

  const graphicsRoot = path.join(repoRoot, "graphics");
  if (fs.existsSync(graphicsRoot)) {
    for (const filePath of walkFiles(graphicsRoot).filter((item) => path.extname(item).toLowerCase() === ".png")) {
      validateRequiredImage(filePath, "Grafik", inspectPng, MEDIA_LIMITS.graphic, results, errors);
    }
  }

  return {
    ok: errors.length === 0,
    counts: {
      species: speciesList.length,
      checkedMedia: results.length,
      errors: errors.length,
      allowedMissingSounds: allowedMissingSounds.size,
    },
    limitsBytes: MEDIA_LIMITS,
    errors,
    results,
  };
}

function validateRequiredImage(filePath, label, inspector, maxBytes, results, errors) {
  if (!fs.existsSync(filePath)) {
    errors.push(`${relative(filePath)}: ${label} fehlt.`);
    return;
  }
  if (!validateFileSize(filePath, label, maxBytes, errors)) return;
  const inspected = inspector(fs.readFileSync(filePath));
  if (!inspected.valid) {
    errors.push(`${relative(filePath)}: ${label} ist ungültig (${inspected.reason}).`);
    return;
  }
  results.push({ path: relative(filePath), type: inspected.format, width: inspected.width, height: inspected.height });
}

function validateRequiredSound(filePath, maxBytes, results, errors) {
  if (!fs.existsSync(filePath)) {
    errors.push(`${relative(filePath)}: Tierstimme fehlt.`);
    return;
  }
  if (!validateFileSize(filePath, "Tierstimme", maxBytes, errors)) return;
  try {
    const inspected = inspectMp3Buffer(fs.readFileSync(filePath));
    results.push({
      path: relative(filePath),
      type: inspected.format,
      sampleRate: inspected.sampleRate,
      bitrateKbps: inspected.bitrateKbps,
    });
  } catch (error) {
    errors.push(`${relative(filePath)}: Tierstimme ist kein gültiges MP3 (${error.message}).`);
  }
}

function validateRequiredJson(filePath, label, maxBytes, results, errors) {
  if (!fs.existsSync(filePath)) {
    errors.push(`${relative(filePath)}: ${label} fehlen.`);
    return;
  }
  if (!validateFileSize(filePath, label, maxBytes, errors)) return;
  try {
    JSON.parse(fs.readFileSync(filePath, "utf8"));
    results.push({ path: relative(filePath), type: "json" });
  } catch (error) {
    errors.push(`${relative(filePath)}: ${label} sind kein gültiges JSON (${error.message}).`);
  }
}

function validateFileSize(filePath, label, maxBytes, errors) {
  const bytes = fs.statSync(filePath).size;
  if (bytes <= maxBytes) return true;
  errors.push(`${relative(filePath)}: ${label} ist mit ${formatMib(bytes)} größer als erlaubt (${formatMib(maxBytes)}).`);
  return false;
}

function validateDirectorySize(dirPath, germanName, maxBytes, errors) {
  if (!fs.existsSync(dirPath)) {
    errors.push(`${germanName}: Assetordner fehlt.`);
    return;
  }
  const bytes = walkFiles(dirPath).reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
  if (bytes > maxBytes) {
    errors.push(`${germanName}: gesamtes Artpaket ist mit ${formatMib(bytes)} größer als erlaubt (${formatMib(maxBytes)}).`);
  }
}

function formatMib(bytes) {
  return `${(bytes / MIB).toFixed(2)} MiB`;
}

function dimensionsResult(format, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return invalid(`${format}-Abmessungen sind ungültig`);
  }
  return { valid: true, format, width, height };
}

function invalid(reason) {
  return { valid: false, format: "unknown", reason };
}

function isJpegSofMarker(marker) {
  return [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function sanitizeAssetName(input) {
  return String(input ?? "")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss").replace(/æ/g, "ae").replace(/Æ/g, "Ae")
    .replace(/œ/g, "oe").replace(/Œ/g, "Oe").replace(/ø/g, "o").replace(/Ø/g, "O")
    .replace(/å/g, "a").replace(/Å/g, "A").replace(/ð/g, "d").replace(/Ð/g, "D")
    .replace(/þ/g, "th").replace(/Þ/g, "Th").replace(/ł/g, "l").replace(/Ł/g, "L")
    .replace(/&/g, " and ").replace(/@/g, " at ").replace(/\+/g, " plus ")
    .replace(/[’‘‚‛]/g, "'").replace(/[“”„‟]/g, '"').replace(/[–—−]/g, "-")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\/\\:*?"<>|]/g, "_").replace(/[\x00-\x1F\x7F]/g, "_")
    .replace(/\s+/g, " ").replace(/_+/g, "_").trim().replace(/^[.\s_-]+|[.\s_-]+$/g, "") || "unknown";
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function walkFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

let activeRepoRoot = process.cwd();
function relative(filePath) {
  return path.relative(activeRepoRoot, filePath).replaceAll(path.sep, "/");
}

if (isCli) {
  activeRepoRoot = path.resolve(process.argv.find((arg) => arg.startsWith("--repo-root="))?.slice(12) || process.cwd());
  const report = validateRepositoryMedia(activeRepoRoot);
  console.log(JSON.stringify({
    ok: report.ok,
    counts: report.counts,
    limitsBytes: report.limitsBytes,
    errors: report.errors,
    ...(process.argv.includes("--verbose") ? { results: report.results } : {}),
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
