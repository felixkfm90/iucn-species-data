import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectMp3Buffer } from "./audio-format.mjs";
import { validateImageDecode } from "./image-validation.mjs";
import { inspectJpeg, inspectPng, inspectWebp } from "./image-header.mjs";
import { createHash } from "node:crypto";

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

export { inspectJpeg, inspectPng, inspectWebp } from "./image-header.mjs";

export async function validateRepositoryMedia(repoRoot = process.cwd(), { decodeImage = validateImageDecode } = {}) {
  const checkedInputs = new Map();
  const remember = (filePath, buffer) => checkedInputs.set(filePath, createHash("sha256").update(buffer).digest("hex"));
  const readBoundJson = (filePath) => { const buffer = fs.readFileSync(filePath); remember(filePath, buffer); return JSON.parse(buffer); };
  const speciesList = readBoundJson(path.join(repoRoot, "species_list.json"));
  const report = readBoundJson(path.join(repoRoot, "fehlende_elemente_report.json"));
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
    await validateRequiredImage(path.join(assetDir, "map.jpg"), "Karte", inspectJpeg, MEDIA_LIMITS.map, results, errors, repoRoot, remember, decodeImage);
    await validateRequiredImage(
      path.join(assetDir, "portrait.webp"),
      "Artportrait",
      inspectWebp,
      MEDIA_LIMITS.portrait,
      results,
      errors,
      repoRoot,
      remember,
      decodeImage,
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

    validateRequiredSound(path.join(assetDir, "sound.mp3"), MEDIA_LIMITS.sound, results, errors, remember);
    validateRequiredJson(path.join(assetDir, "credits.json"), "Sound-Credits", MEDIA_LIMITS.credits, results, errors, remember);
    await validateRequiredImage(
      path.join(assetDir, "spectrogram.webp"),
      "Spektrogramm",
      inspectWebp,
      MEDIA_LIMITS.spectrogram,
      results,
      errors,
      repoRoot,
      remember,
      decodeImage,
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
      await validateRequiredImage(filePath, "Grafik", inspectPng, MEDIA_LIMITS.graphic, results, errors, repoRoot, remember, decodeImage);
    }
  }

  // Decoding yields the event loop. Bind its result to the exact still-present
  // public inputs rather than authorizing files changed during that wait.
  for (const [filePath, expectedHash] of checkedInputs) {
    try {
      if (createHash("sha256").update(fs.readFileSync(filePath)).digest("hex") !== expectedHash) {
        errors.push(`${relative(filePath)}: Datei wurde während der Medienprüfung geändert. Bitte erneut prüfen.`);
      }
    } catch { errors.push(`${relative(filePath)}: Datei ist nach der Medienprüfung nicht mehr lesbar. Bitte erneut prüfen.`); }
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

async function validateRequiredImage(filePath, label, inspector, maxBytes, results, errors, repoRoot, remember, decodeImage) {
  if (!fs.existsSync(filePath)) {
    errors.push(`${relative(filePath)}: ${label} fehlt.`);
    return;
  }
  if (!validateFileSize(filePath, label, maxBytes, errors)) return;
  const buffer = fs.readFileSync(filePath);
  remember(filePath, buffer);
  const inspected = inspector(buffer);
  if (!inspected.valid) {
    errors.push(`${relative(filePath)}: ${label} ist ungültig (${inspected.reason}).`);
    return;
  }
  try { await decodeImage(buffer, { ...inspected, repoRoot }); }
  catch (error) { errors.push(`${relative(filePath)}: ${label} ist ungültig (${error.message}).`); return; }
  results.push({ path: relative(filePath), type: inspected.format, width: inspected.width, height: inspected.height });
}

function validateRequiredSound(filePath, maxBytes, results, errors, remember) {
  if (!fs.existsSync(filePath)) {
    errors.push(`${relative(filePath)}: Tierstimme fehlt.`);
    return;
  }
  if (!validateFileSize(filePath, "Tierstimme", maxBytes, errors)) return;
  try {
    const buffer = fs.readFileSync(filePath); remember(filePath, buffer);
    const inspected = inspectMp3Buffer(buffer);
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

function validateRequiredJson(filePath, label, maxBytes, results, errors, remember) {
  if (!fs.existsSync(filePath)) {
    errors.push(`${relative(filePath)}: ${label} fehlen.`);
    return;
  }
  if (!validateFileSize(filePath, label, maxBytes, errors)) return;
  try {
    const buffer = fs.readFileSync(filePath); remember(filePath, buffer); JSON.parse(buffer);
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
  const report = await validateRepositoryMedia(activeRepoRoot);
  console.log(JSON.stringify({
    ok: report.ok,
    counts: report.counts,
    limitsBytes: report.limitsBytes,
    errors: report.errors,
    ...(process.argv.includes("--verbose") ? { results: report.results } : {}),
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
