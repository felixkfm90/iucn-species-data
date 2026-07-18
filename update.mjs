import fs from "fs";
import path from "path";
import { buildPipelinePlan } from "./scripts/pipeline-selection.mjs";
import {
  audioFormatLabel,
  detectAudioFormat,
  isMp3Buffer,
} from "./scripts/audio-format.mjs";
import { createIucnDataAdapter } from "./scripts/iucn-data-adapter.mjs";
import { createIucnMapAdapter } from "./scripts/iucn-map-adapter.mjs";
import { createXenoCantoAdapter } from "./scripts/xeno-canto-adapter.mjs";
import { createWikimediaCommonsAudioAdapter } from "./scripts/wikimedia-commons-audio-adapter.mjs";
import { createINaturalistAudioAdapter } from "./scripts/inaturalist-audio-adapter.mjs";
import { appendPipelineErrorLog } from "./scripts/pipeline-error-log.mjs";
import {
  inatLicenseUrl,
  isNcLicense,
  normalizeLicenseUrl,
} from "./scripts/sound-source-license.mjs";

const nativeFetch = globalThis.fetch;
if (typeof nativeFetch !== "function") {
  throw new Error("Diese Pipeline benoetigt Node.js 18 oder neuer, weil natives fetch verwendet wird.");
}
const fetch = nativeFetch.bind(globalThis);

// =======================
// KONFIG / ORDNER
// =======================

const SPECIES_ASSETS_DIR = "./species-assets";
const TOKEN = process.env.IUCN_TOKEN;
const XENO_TOKEN = process.env.XENO_TOKEN;

const BASE = "https://api.iucnredlist.org/api/v4";
const RATE_LIMIT = 400;
const SOUND_CANDIDATE_RETRY_LIMIT = 12;

// Assessment-ID Trackfile (für Karten-Caching)
const ASSESSMENT_TRACK_FILE = "./lastSavedAssessmentId.json";
const ASSET_OVERRIDES_FILE = "./species-assets-overrides.json";
let lastSavedAssessmentId = {};
if (fs.existsSync(ASSESSMENT_TRACK_FILE)) {
  lastSavedAssessmentId = JSON.parse(fs.readFileSync(ASSESSMENT_TRACK_FILE, "utf8"));
}
let assetOverrides = { version: 1, assets: {} };
if (fs.existsSync(ASSET_OVERRIDES_FILE)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(ASSET_OVERRIDES_FILE, "utf8"));
    if (parsed && typeof parsed === "object") assetOverrides = parsed;
  } catch (error) {
    console.warn(`⚠ Asset-Overrides konnten nicht gelesen werden: ${error.message}`);
  }
}

// =======================
// HELFER
// =======================

function logError(msg) {
  appendPipelineErrorLog(msg);
}

function formatTaxonomyName(value) {
  const text = String(value ?? "").trim();
  if (!text || text.toLocaleLowerCase("de") === "n/a") return text || "n/a";
  return text
    .toLocaleLowerCase("de")
    .replace(/(^|[\s-])([\p{L}])/gu, (_match, prefix, letter) => (
      `${prefix}${letter.toLocaleUpperCase("de")}`
    ));
}

function normalizeTaxonomyFields(entry) {
  if (!entry || typeof entry !== "object") return entry;
  return {
    ...entry,
    Kingdom: formatTaxonomyName(entry.Kingdom),
    Phylum: formatTaxonomyName(entry.Phylum),
    Class: formatTaxonomyName(entry.Class),
    Order: formatTaxonomyName(entry.Order),
    Family: formatTaxonomyName(entry.Family),
  };
}

function parsePipelineArgs(rawArgs) {
  const parsed = { mode: "all", dryRun: false, reportOnly: false, targetSlugs: [] };
  for (const arg of rawArgs) {
    if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--report-only") parsed.reportOnly = true;
    else if (arg.startsWith("--mode=")) parsed.mode = arg.slice("--mode=".length);
    else if (arg.startsWith("--species=")) {
      parsed.targetSlugs = arg.slice("--species=".length)
        .split(",")
        .map((slug) => slug.trim().toLocaleLowerCase("de"))
        .filter(Boolean);
    }
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else throw new Error(`Unbekannter Parameter: ${arg}`);
  }
  if (!["all", "missing", "manual-maps", "nc-sounds"].includes(parsed.mode)) {
    throw new Error(`Unbekannter Pipeline-Modus: ${parsed.mode}`);
  }
  return parsed;
}

function printPipelineHelp() {
  console.log(`Verwendung: node update.mjs [Optionen]

Optionen:
  --mode=all       Vollständiger Lauf über alle Arten (Standard)
  --mode=missing   Nur neue Arten oder Arten mit fehlenden Kerndaten/Assets
  --mode=manual-maps  Manuell gepflegte und fehlende Karten erneut suchen
  --mode=nc-sounds    Vorhandene NC-Sounds und fehlende Sounds erneut suchen
  --species=slug      Optional: nur die angegebenen URL-Slugs verarbeiten, kommagetrennt
  --dry-run        Auswahl anzeigen, ohne Dateien oder Assets zu verändern
  --report-only    Report aus speciesData.json und aktuellen Assets neu aufbauen
`);
}

function flushStream(stream) {
  return new Promise((resolveFlush) => {
    if (!stream?.writable || stream.destroyed || stream.writableEnded) {
      resolveFlush();
      return;
    }
    stream.write("", () => resolveFlush());
  });
}

async function exitAfterMain() {
  await Promise.all([
    flushStream(process.stdout),
    flushStream(process.stderr),
  ]);
  process.exit(Number(process.exitCode ?? 0) || 0);
}

function atomicWriteJson(filePath, value) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2));
  fs.renameSync(tempPath, filePath);
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
    .replace(/[“”„‟]/g, '"')
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

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function speciesAssetDir(safeName) {
  return path.join(SPECIES_ASSETS_DIR, safeName);
}

function isManualAsset(safeName, assetType) {
  return assetOverrides.assets?.[safeName]?.[assetType]?.manual === true;
}

function rejectedSoundKeys(safeName) {
  const sources = assetOverrides.assets?.[safeName]?.sound?.rejectedSources;
  if (!Array.isArray(sources)) return new Set();
  return new Set(sources
    .map((entry) => String(entry?.key ?? "").trim())
    .filter(Boolean));
}

function isRejectedSoundCandidate(safeName, key, german, extraRejectedKeys = new Set()) {
  const normalizedKey = String(key ?? "").trim();
  if (!normalizedKey) return false;
  const rejected = rejectedSoundKeys(safeName);
  if (!rejected.has(normalizedKey) && !extraRejectedKeys.has(normalizedKey)) return false;
  console.log(`↩ Abgelehnte Soundquelle wird übersprungen für ${german}: ${normalizedKey}`);
  return true;
}

function xenoRejectionKey(recording) {
  const id = String(recording?.id ?? "").trim();
  if (id) return `xeno-canto:${id}`;
  const file = String(recording?.file ?? "").trim();
  return file ? `xeno-canto:${file}` : "";
}

function commonsRejectionKey(hit) {
  return `wikimedia-commons:${hit.descriptionUrl || hit.fileUrl || hit.mp3Url || hit.title || "unknown"}`;
}

function inatRejectionKey(hit) {
  const observationId = String(hit?.observation?.id ?? "").trim();
  const soundId = String(hit?.sound?.id ?? hit?.sound?.uuid ?? hit?.url ?? "").trim();
  return `inaturalist:${observationId}:${soundId || "unknown"}`;
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
  return "";
}

function soundRejectionKeyFromCreditsFile(creditsPath) {
  if (!fs.existsSync(creditsPath)) return "";
  try {
    return soundRejectionKeyFromCredits(JSON.parse(fs.readFileSync(creditsPath, "utf8")));
  } catch {
    return "";
  }
}

function isFileLockError(error) {
  const code = String(error?.code ?? "").toUpperCase();
  const message = String(error?.message ?? "").toLowerCase();
  return (
    code === "EPERM" ||
    code === "EBUSY" ||
    code === "EACCES" ||
    message.includes("operation not permitted") ||
    message.includes("permission denied") ||
    message.includes("access is denied")
  );
}

function removeTempFile(tempPath) {
  try {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  } catch {
    // Best-effort cleanup. A later write will overwrite the same temp path.
  }
}

async function replaceExistingFileWithTemp(tempPath, targetPath) {
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.renameSync(tempPath, targetPath);
      return;
    } catch (error) {
      lastError = error;
      if (!isFileLockError(error)) throw error;
      await sleep(250 * (attempt + 1));
    }
  }
  throw lastError;
}

function temporarilySkipSoundCandidate(extraRejectedKeys, key, german, sourceLabel) {
  const normalizedKey = String(key ?? "").trim();
  if (normalizedKey) extraRejectedKeys.add(normalizedKey);
  console.warn(`⚠ ${sourceLabel} für ${german} konnte nicht übernommen werden; prüfe nächste Quelle.`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function emptyEntry(scientific, german = scientific, manual = {}) {
  const URLSlug = scientific.toLowerCase().replace(/\s+/g, "");
  return {
    URLSlug,
    "Wissenschaftlicher Name": scientific,
    "Deutscher Name": german,
    Gewicht: manual.weight || "n/a",
    Größe: manual.size || "n/a",
    Lebenserwartung: manual.lifeExpectancy || "n/a",
    "Assessment ID": "n/a",
    Status: "n/a",
    Trend: "n/a",
    Kategorie: "n/a",
    Populationgröße: "n/a",
    Generationsdauer: "n/a",
    Kingdom: "n/a",
    Phylum: "n/a",
    Class: "n/a",
    Order: "n/a",
    Family: "n/a",
    Genus: "n/a",
    Species: "n/a",
    "Letztes IUCN Update": "n/a",
    "Daten abgerufen": new Date().toISOString().slice(0, 10),
  };
}

function getInputSlug(s) {
  return `${s.genus}${s.species}`.toLowerCase();
}

function loadExistingSpeciesData() {
  if (!fs.existsSync("speciesData.json")) return [];

  try {
    const data = JSON.parse(fs.readFileSync("speciesData.json", "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    logError("Bestehende speciesData.json konnte nicht gelesen werden: " + err.message);
    return [];
  }
}

function hasUsableSpeciesData(entry) {
  return Boolean(
    entry &&
      entry["Wissenschaftlicher Name"] &&
      entry["Wissenschaftlicher Name"] !== "n/a" &&
      entry["Assessment ID"] &&
      entry["Assessment ID"] !== "n/a" &&
      entry.Status &&
      entry.Status !== "n/a" &&
      entry.Kategorie &&
      entry.Kategorie !== "n/a" &&
      entry.Trend &&
      entry.Trend !== "n/a"
  );
}

function preserveExistingSpeciesData(existing, inputSpecies) {
  return normalizeTaxonomyFields({
    ...existing,
    Gewicht: inputSpecies.weight || existing.Gewicht,
    Größe: inputSpecies.size || existing.Größe,
    Lebenserwartung: inputSpecies.life_expectancy || existing.Lebenserwartung || "n/a",
  });
}

const iucnDataAdapter = createIucnDataAdapter({
  fetch,
  token: TOKEN,
  sleep,
  logError,
  emptyEntry,
  formatTaxonomyName,
  baseUrl: BASE,
});
const { iucnGET, fetchSpeciesData } = iucnDataAdapter;

// =======================
// MAP: pro Art
// =======================

const { downloadMapForSpecies } = createIucnMapAdapter({
  fetch,
  token: TOKEN,
  iucnGET,
  sleep,
  sanitizeAssetName,
  speciesAssetDir,
  ensureDir,
  isManualAsset,
  isAssessmentCurrent: (safeName, assessmentId) => lastSavedAssessmentId[safeName] === assessmentId,
  recordAssessment: (safeName, assessmentId) => {
    lastSavedAssessmentId[safeName] = assessmentId;
    fs.writeFileSync(ASSESSMENT_TRACK_FILE, JSON.stringify(lastSavedAssessmentId, null, 2));
  },
  logError,
  baseUrl: BASE,
});
// =======================
// XENO-CANTO + COMMONS + iNATURALIST SOUNDS (Open first, NC fallback) - MULTI PAGE
// =======================

function validateDownloadedMp3(buffer, source, german) {
  if (isMp3Buffer(buffer)) return true;
  const format = audioFormatLabel(detectAudioFormat(buffer));
  console.warn("⚠ " + source + "-Datei für " + german + " ist technisch " + format + " und kein gültiges MP3; Kandidat wird übersprungen.");
  return false;
}

function readSoundLicense(creditsPath) {
  if (!fs.existsSync(creditsPath)) return "";
  try {
    const credits = JSON.parse(fs.readFileSync(creditsPath, "utf8"));
    return normalizeLicenseUrl(credits.license || "");
  } catch (error) {
    logError("Credits konnten nicht gelesen werden (" + creditsPath + "): " + error.message);
    return "";
  }
}

const { findRecordingByStage } = createXenoCantoAdapter({
  fetch,
  token: XENO_TOKEN,
  sleep,
});

const commonsAudioAdapter = createWikimediaCommonsAudioAdapter({ fetch, sleep, logError });
async function findCommonsRecording(genus, species, german, safeName, extraRejectedKeys = new Set()) {
  return commonsAudioAdapter.findRecording(genus, species, german, {
    isRejected: (hit) => isRejectedSoundCandidate(
      safeName,
      commonsRejectionKey(hit),
      german,
      extraRejectedKeys,
    ),
  });
}

const inaturalistAudioAdapter = createINaturalistAudioAdapter({ fetch, sleep, logError });
async function findInatRecording(genus, species, german, safeName, extraRejectedKeys = new Set()) {
  return inaturalistAudioAdapter.findRecording(genus, species, german, {
    isRejected: (hit) => isRejectedSoundCandidate(
      safeName,
      inatRejectionKey(hit),
      german,
      extraRejectedKeys,
    ),
  });
}

async function tryXenoStageCandidates({
  genus,
  species,
  german,
  mp3Path,
  creditsPath,
  stage,
  originalStageIndex,
  stages,
  extraRejectedKeys,
  isRejected,
  foundMessage,
}) {
  for (let attempt = 0; attempt < SOUND_CANDIDATE_RETRY_LIMIT; attempt++) {
    const hit = await findRecordingByStage(genus, species, stage, { isRejected });
    if (!hit?.rec) return null;

    const message = typeof foundMessage === "function"
      ? foundMessage(originalStageIndex)
      : foundMessage;
    console.log(message);

    const result = await saveSoundRecording({
      genus,
      species,
      german,
      mp3Path,
      creditsPath,
      chosen: hit.rec,
      chosenInfo: hit,
      chosenStageIndex: originalStageIndex,
      stages,
    });

    if (result === "ok" || result === "locked" || result === "error") return result;
    temporarilySkipSoundCandidate(extraRejectedKeys, xenoRejectionKey(hit.rec), german, "Xeno-Canto-Soundkandidat");
  }

  console.warn(`⚠ Zu viele nicht übernehmbare Xeno-Canto-Kandidaten für ${german}; prüfe nächste Suchstufe.`);
  return null;
}

async function tryCommonsCandidates({ genus, species, german, safeName, mp3Path, creditsPath, extraRejectedKeys, foundMessage }) {
  for (let attempt = 0; attempt < SOUND_CANDIDATE_RETRY_LIMIT; attempt++) {
    const hit = await findCommonsRecording(genus, species, german, safeName, extraRejectedKeys);
    if (!hit) return null;

    console.log(foundMessage);
    const result = await saveCommonsSoundRecording({
      genus,
      species,
      german,
      mp3Path,
      creditsPath,
      hit,
    });

    if (result === "ok" || result === "locked" || result === "error") return result;
    temporarilySkipSoundCandidate(extraRejectedKeys, commonsRejectionKey(hit), german, "Commons-Soundkandidat");
  }

  console.warn(`⚠ Zu viele nicht übernehmbare Commons-Kandidaten für ${german}; prüfe nächste Quelle.`);
  return null;
}

async function tryInatCandidates({ genus, species, german, safeName, mp3Path, creditsPath, extraRejectedKeys, foundMessage }) {
  for (let attempt = 0; attempt < SOUND_CANDIDATE_RETRY_LIMIT; attempt++) {
    const hit = await findInatRecording(genus, species, german, safeName, extraRejectedKeys);
    if (!hit) return null;

    console.log(foundMessage);
    const result = await saveInatSoundRecording({
      genus,
      species,
      german,
      mp3Path,
      creditsPath,
      hit,
    });

    if (result === "ok" || result === "locked" || result === "error") return result;
    temporarilySkipSoundCandidate(extraRejectedKeys, inatRejectionKey(hit), german, "iNaturalist-Soundkandidat");
  }

  console.warn(`⚠ Zu viele nicht übernehmbare iNaturalist-Kandidaten für ${german}; prüfe nächste Suchstufe.`);
  return null;
}

async function downloadSoundIfMissing(genus, species, german, { forceAlternativeSearch = false } = {}) {
  const safeGerman = sanitizeAssetName(german);
  const targetDir = speciesAssetDir(safeGerman);

  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const mp3Path = path.join(targetDir, "sound.mp3");
  const creditsPath = path.join(targetDir, "credits.json");
  const extraRejectedKeys = new Set();
  const currentSoundKey = forceAlternativeSearch ? soundRejectionKeyFromCreditsFile(creditsPath) : "";
  if (currentSoundKey) extraRejectedKeys.add(currentSoundKey);
  const rejectXenoCandidate = (recording) =>
    isRejectedSoundCandidate(safeGerman, xenoRejectionKey(recording), german, extraRejectedKeys);

  if (fs.existsSync(mp3Path) && isManualAsset(safeGerman, "sound")) {
    console.log(`🎵 Manuell gepflegter Sound für ${german} ist geschützt, überspringe Suche.`);
    return fs.existsSync(creditsPath) ? "ok" : "missing";
  }

  const stages = [
    { openOnly: true, q: "A", len2535: true }, // 0
    { openOnly: true, q: "A", len2535: false }, // 1
    { openOnly: true, q: "B", len2535: true }, // 2
    { openOnly: true, q: "B", len2535: false }, // 3
    { openOnly: true, q: "C", len2535: true }, // 4
    { openOnly: true, q: "C", len2535: false }, // 5
    { openOnly: false, q: "A", len2535: true }, // 6
    { openOnly: false, q: "A", len2535: false }, // 7
    { openOnly: false, q: "B", len2535: true }, // 8
    { openOnly: false, q: "B", len2535: false }, // 9
    { openOnly: false, q: "C", len2535: true }, // 10
    { openOnly: false, q: "C", len2535: false }, // 11
  ];

  const openStages = stages.filter((stage) => stage.openOnly);
  const fallbackStages = stages.filter((stage) => !stage.openOnly);

  if (fs.existsSync(mp3Path)) {
    const hasCredits = fs.existsSync(creditsPath);
    const existingLicense = readSoundLicense(creditsPath);

    if (hasCredits && !isNcLicense(existingLicense) && !forceAlternativeSearch) {
      console.log(`🎵 Sound existiert bereits für ${german}`);
      return "ok";
    }

    console.log(
      forceAlternativeSearch && hasCredits
        ? `🎵 Sound existiert für ${german}; suche gezielt nach einer Alternative.`
        : hasCredits
        ? `🎵 NC-Sound existiert für ${german}; prüfe freie Alternative.`
        : `🎵 Sound ohne Credits existiert für ${german}; prüfe dokumentierte freie Alternative.`,
    );
    for (let i = 0; i < openStages.length; i++) {
      const originalStageIndex = stages.indexOf(openStages[i]);
      const result = await tryXenoStageCandidates({
        genus,
        species,
        german,
        mp3Path,
        creditsPath,
        stage: openStages[i],
        originalStageIndex,
        stages,
        extraRejectedKeys,
        isRejected: rejectXenoCandidate,
        foundMessage: (stageIndex) => `✔ Freie Alternative gefunden für ${german} (Stage ${stageIndex}).`,
      });
      if (result) return result;
    }

    const commonsResult = await tryCommonsCandidates({
      genus,
      species,
      german,
      safeName: safeGerman,
      mp3Path,
      creditsPath,
      extraRejectedKeys,
      foundMessage: `✔ Freie Commons-Alternative gefunden für ${german}.`,
    });
    if (commonsResult) return commonsResult;

    const inatResult = await tryInatCandidates({
      genus,
      species,
      german,
      safeName: safeGerman,
      mp3Path,
      creditsPath,
      extraRejectedKeys,
      foundMessage: `✔ Freie iNaturalist-Alternative gefunden für ${german}.`,
    });
    if (inatResult) return inatResult;

    if (forceAlternativeSearch) {
      for (let i = 0; i < fallbackStages.length; i++) {
        const originalStageIndex = stages.indexOf(fallbackStages[i]);
        const result = await tryXenoStageCandidates({
          genus,
          species,
          german,
          mp3Path,
          creditsPath,
          stage: fallbackStages[i],
          originalStageIndex,
          stages,
          extraRejectedKeys,
          isRejected: rejectXenoCandidate,
          foundMessage: (stageIndex) => `✔ Weitere Soundalternative gefunden für ${german} (Stage ${stageIndex}).`,
        });
        if (result) return result;
      }
    }

    console.log(
      forceAlternativeSearch && hasCredits
        ? `ℹ Keine weitere Soundalternative gefunden für ${german}; vorhandener Sound bleibt erhalten.`
        : hasCredits
        ? `ℹ Keine freie Alternative gefunden für ${german}; vorhandener NC-Sound bleibt erhalten.`
        : `⚠ Keine dokumentierte freie Alternative gefunden für ${german}; vorhandener Sound bleibt ohne Credits.`,
    );
    return hasCredits ? "ok" : "missing";
  }

  for (let i = 0; i < openStages.length; i++) {
    const originalStageIndex = stages.indexOf(openStages[i]);
    const result = await tryXenoStageCandidates({
      genus,
      species,
      german,
      mp3Path,
      creditsPath,
      stage: openStages[i],
      originalStageIndex,
      stages,
      extraRejectedKeys,
      isRejected: rejectXenoCandidate,
      foundMessage: (stageIndex) => `✔ Freie Aufnahme gefunden für ${german} (Stage ${stageIndex}).`,
    });
    if (result) return result;
  }

  const commonsResult = await tryCommonsCandidates({
    genus,
    species,
    german,
    safeName: safeGerman,
    mp3Path,
    creditsPath,
    extraRejectedKeys,
    foundMessage: `✔ Freie Commons-Aufnahme gefunden für ${german}.`,
  });
  if (commonsResult) return commonsResult;

  const inatResult = await tryInatCandidates({
    genus,
    species,
    german,
    safeName: safeGerman,
    mp3Path,
    creditsPath,
    extraRejectedKeys,
    foundMessage: `✔ Freie iNaturalist-Aufnahme gefunden für ${german}.`,
  });
  if (inatResult) return inatResult;

  for (let i = 0; i < fallbackStages.length; i++) {
    const originalStageIndex = stages.indexOf(fallbackStages[i]);
    const result = await tryXenoStageCandidates({
      genus,
      species,
      german,
      mp3Path,
      creditsPath,
      stage: fallbackStages[i],
      originalStageIndex,
      stages,
      extraRejectedKeys,
      isRejected: rejectXenoCandidate,
      foundMessage: (stageIndex) => `✔ Aufnahme gefunden für ${german} (Stage ${stageIndex}).`,
    });
    if (result) return result;
  }

  console.log(`⚠ Keine Aufnahmen verfügbar für ${genus} ${species}`);
  return "missing";
}

async function saveSoundRecording({
  genus,
  species,
  german,
  mp3Path,
  creditsPath,
  chosen,
  chosenInfo,
  chosenStageIndex,
  stages,
}) {
  const lic = normalizeLicenseUrl(chosen.lic || "");
  const audioUrl = chosen.file?.startsWith("https:") ? chosen.file : `https:${chosen.file}`;
  const tempMp3 = mp3Path + ".tmp";
  let replacedSound = false;

  try {
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      console.warn(`⚠ Fehler beim Herunterladen der Datei (${audioRes.status}); Kandidat wird übersprungen.`);
      return "retry";
    }

    const buffer = Buffer.from(await audioRes.arrayBuffer());
    if (!validateDownloadedMp3(buffer, "Xeno-Canto", german)) return "retry";
    fs.writeFileSync(tempMp3, buffer);
    await replaceExistingFileWithTemp(tempMp3, mp3Path);
    replacedSound = true;

    console.log(`✔ Sound gespeichert: ${mp3Path}`);

    const st = stages[chosenStageIndex];
    const credits = {
      scientific_name: `${genus} ${species}`,
      german_name: german,
      recordist: chosen.rec || "n/a",
      country: chosen.cnt || "n/a",
      location: chosen.loc || "n/a",
      quality: chosen.q || "n/a",
      license: lic || "n/a",
      source: "xeno-canto.org",
      url: chosen.id ? `https://xeno-canto.org/${chosen.id}` : "n/a",
      rejectionKey: xenoRejectionKey(chosen),
      notes: `Stage ${chosenStageIndex} (openOnly=${st.openOnly}, q=${st.q}, len25-35=${st.len2535}) | query="${chosenInfo.query}" | page=${chosenInfo.page}`,
    };

    fs.writeFileSync(creditsPath, JSON.stringify(credits, null, 2));

    return "ok";
  } catch (err) {
    removeTempFile(tempMp3);
    if (!replacedSound && isFileLockError(err)) {
      console.warn(`⚠ Sounddatei für ${german} ist noch geöffnet oder gesperrt; Alternative konnte nicht gespeichert werden.`);
      logError(`Sound ${genus} ${species}: Datei gesperrt (${err.message})`);
      return "locked";
    }
    console.error(`❌ Fehler beim Sound-Download ${genus} ${species}: ${err.message}`);
    logError(`Sound ${genus} ${species}: ${err.message}`);
    return replacedSound ? "error" : "retry";
  }
}

async function saveCommonsSoundRecording({ genus, species, german, mp3Path, creditsPath, hit }) {
  const tempMp3 = mp3Path + ".tmp";
  let replacedSound = false;

  try {
    const audioRes = await fetch(hit.mp3Url);
    if (!audioRes.ok) {
      console.warn(`⚠ Fehler beim Herunterladen der Commons-Datei (${audioRes.status}); Kandidat wird übersprungen.`);
      return "retry";
    }

    const buffer = Buffer.from(await audioRes.arrayBuffer());
    if (!validateDownloadedMp3(buffer, "Commons", german)) return "retry";

    fs.writeFileSync(tempMp3, buffer);
    await replaceExistingFileWithTemp(tempMp3, mp3Path);
    replacedSound = true;

    console.log(`✔ Commons-Sound gespeichert: ${mp3Path}`);

    const source = String(hit.credit || "").toLowerCase().includes("inaturalist")
      ? "Wikimedia Commons / iNaturalist"
      : "Wikimedia Commons";

    const credits = {
      scientific_name: `${genus} ${species}`,
      german_name: german,
      recordist: hit.artist || "n/a",
      country: "n/a",
      location: "n/a",
      quality: "n/a",
      license: normalizeLicenseUrl(hit.license) || "n/a",
      source,
      url: hit.descriptionUrl || hit.fileUrl || "n/a",
      rejectionKey: commonsRejectionKey(hit),
      notes: `Free Commons replacement. Query="${hit.query}" | title="${hit.title}" | original=${hit.fileUrl} | mp3=${hit.mp3Url}`,
    };

    fs.writeFileSync(creditsPath, JSON.stringify(credits, null, 2));

    return "ok";
  } catch (err) {
    removeTempFile(tempMp3);
    if (!replacedSound && isFileLockError(err)) {
      console.warn(`⚠ Sounddatei für ${german} ist noch geöffnet oder gesperrt; Commons-Alternative konnte nicht gespeichert werden.`);
      logError(`Commons-Sound ${genus} ${species}: Datei gesperrt (${err.message})`);
      return "locked";
    }
    console.error(`❌ Fehler beim Commons-Sound-Download ${genus} ${species}: ${err.message}`);
    logError(`Commons-Sound ${genus} ${species}: ${err.message}`);
    return replacedSound ? "error" : "retry";
  }
}

async function saveInatSoundRecording({ genus, species, german, mp3Path, creditsPath, hit }) {
  const tempMp3 = mp3Path + ".tmp";
  let replacedSound = false;

  try {
    const audioRes = await fetch(hit.url);
    if (!audioRes.ok) {
      console.warn(`⚠ Fehler beim Herunterladen der iNaturalist-Datei (${audioRes.status}); Kandidat wird übersprungen.`);
      return "retry";
    }

    const buffer = Buffer.from(await audioRes.arrayBuffer());
    if (!validateDownloadedMp3(buffer, "iNaturalist", german)) return "retry";
    fs.writeFileSync(tempMp3, buffer);
    await replaceExistingFileWithTemp(tempMp3, mp3Path);
    replacedSound = true;

    console.log(`✔ iNaturalist-Sound gespeichert: ${mp3Path}`);

    const observation = hit.observation;
    const sound = hit.sound;
    const user = observation.user?.login || "n/a";
    const license = sound.license_code || sound.license || "";

    const credits = {
      scientific_name: `${genus} ${species}`,
      german_name: german,
      recordist: sound.attribution || user,
      country: "n/a",
      location: observation.place_guess || "n/a",
      quality: observation.quality_grade || hit.qualityGrade || "n/a",
      license: inatLicenseUrl(license) || "n/a",
      source: "iNaturalist",
      url: observation.uri || `https://www.inaturalist.org/observations/${observation.id}`,
      rejectionKey: inatRejectionKey(hit),
      notes: `Free iNaturalist replacement. Observation=${observation.id} | user=${user} | license=${license} | sound=${sound.id || sound.uuid || "n/a"} | file=${hit.url}`,
    };

    fs.writeFileSync(creditsPath, JSON.stringify(credits, null, 2));

    return "ok";
  } catch (err) {
    removeTempFile(tempMp3);
    if (!replacedSound && isFileLockError(err)) {
      console.warn(`⚠ Sounddatei für ${german} ist noch geöffnet oder gesperrt; iNaturalist-Alternative konnte nicht gespeichert werden.`);
      logError(`iNaturalist-Sound ${genus} ${species}: Datei gesperrt (${err.message})`);
      return "locked";
    }
    console.error(`❌ Fehler beim iNaturalist-Sound-Download ${genus} ${species}: ${err.message}`);
    logError(`iNaturalist-Sound ${genus} ${species}: ${err.message}`);
    return replacedSound ? "error" : "retry";
  }
}


// =======================
// REPORT: Fehlende Elemente (+ NC-Lizenzen gesamt)
// =======================

function createMissingElementsReport(speciesData) {
  const report = {
    generatedAt: new Date().toISOString(),
    counts: {
      totalSpecies: speciesData.length,
      missingSoundMp3: 0,
      missingSoundCredits: 0,
      missingMap: 0,
      missingAssessmentId: 0,
      missingStatus: 0,
      missingCategory: 0,
      missingTrend: 0,
      missingSpeciesAssets: 0,
      ncSoundLicensesAll: 0,
    },
    missing: {
      soundMp3: [],
      soundCredits: [],
      maps: [],
      speciesAssets: [],
      assessmentId: [],
      status: [],
      category: [],
      trend: [],
    },
    ncSoundLicensesAll: [],
  };

  for (const s of speciesData) {
    const german = s["Deutscher Name"] || s["Wissenschaftlicher Name"] || "unknown";
    const safe = sanitizeAssetName(german);

    if (!s["Assessment ID"] || s["Assessment ID"] === "n/a") report.missing.assessmentId.push(german);
    if (!s.Status || s.Status === "n/a") report.missing.status.push(german);
    if (!s.Kategorie || s.Kategorie === "n/a") report.missing.category.push(german);
    if (!s.Trend || s.Trend === "n/a") report.missing.trend.push(german);

    const assetDir = speciesAssetDir(safe);
    const assetMapPath = path.join(assetDir, "map.jpg");
    const assetSoundPath = path.join(assetDir, "sound.mp3");
    const assetCreditsPath = path.join(assetDir, "credits.json");
    const assetSpectrogramPath = path.join(assetDir, "spectrogram.webp");
    const hasMp3 = fs.existsSync(assetSoundPath);
    const hasCredits = fs.existsSync(assetCreditsPath);
    const hasMap = fs.existsSync(assetMapPath);

    if (!hasMp3) report.missing.soundMp3.push(german);
    if (hasMp3 && !hasCredits) report.missing.soundCredits.push(german);
    if (!hasMap) report.missing.maps.push(german);

    const missingAssetParts = [];
    if (!fs.existsSync(assetMapPath)) missingAssetParts.push("map.jpg");
    if (!fs.existsSync(assetSoundPath)) missingAssetParts.push("sound.mp3");
    if (!fs.existsSync(assetCreditsPath)) missingAssetParts.push("credits.json");
    if (!fs.existsSync(assetSpectrogramPath)) missingAssetParts.push("spectrogram.webp");
    if (missingAssetParts.length) {
      report.missing.speciesAssets.push({ german, safeName: safe, missing: missingAssetParts });
    }
  }

  // NC-Lizenzen (alle vorhandenen Sounds mit credits.json)
  const ncAll = [];
  for (const s of speciesData) {
    const german = s["Deutscher Name"] || s["Wissenschaftlicher Name"] || "unknown";
    const safe = sanitizeAssetName(german);

    const assetCreditsPath = path.join(speciesAssetDir(safe), "credits.json");
    if (!fs.existsSync(assetCreditsPath)) continue;

    try {
      const c = JSON.parse(fs.readFileSync(assetCreditsPath, "utf8"));
      const lic = String(c.license || "").toLowerCase();
      if (lic.includes("/by-nc")) ncAll.push(german);
    } catch (_) {
      // ignore
    }
  }

  report.ncSoundLicensesAll = Array.from(new Set(ncAll)).sort((a, b) => a.localeCompare(b, "de"));
  report.counts.ncSoundLicensesAll = report.ncSoundLicensesAll.length;

  report.counts.missingSoundMp3 = report.missing.soundMp3.length;
  report.counts.missingSoundCredits = report.missing.soundCredits.length;
  report.counts.missingMap = report.missing.maps.length;
  report.counts.missingSpeciesAssets = report.missing.speciesAssets.length;
  report.counts.missingAssessmentId = report.missing.assessmentId.length;
  report.counts.missingStatus = report.missing.status.length;
  report.counts.missingCategory = report.missing.category.length;
  report.counts.missingTrend = report.missing.trend.length;

  return report;
}

function printReportToConsole(report) {
  console.log("\n==============================");
  console.log("📋 Report: Fehlende Elemente");
  console.log("==============================");
  console.log(`Arten gesamt: ${report.counts.totalSpecies}`);
  console.log(`❌ Sound (mp3) fehlt: ${report.counts.missingSoundMp3}`);
  console.log(`❌ Sound Credits fehlen: ${report.counts.missingSoundCredits}`);
  console.log(`❌ Karte fehlt: ${report.counts.missingMap}`);
  console.log(`❌ Assessment ID fehlt: ${report.counts.missingAssessmentId}`);
  console.log(`❌ Status fehlt: ${report.counts.missingStatus}`);
  console.log(`❌ Kategorie fehlt: ${report.counts.missingCategory}`);
  console.log(`❌ Trend fehlt: ${report.counts.missingTrend}`);
  console.log("------------------------------");

  const showList = (title, arr) => {
    if (!arr.length) return;
    console.log(`\n${title} (${arr.length}):`);
    for (const n of arr) console.log(" - " + n);
  };

  showList("Fehlende Sound-MP3", report.missing.soundMp3);
  showList("NC-Sound-Lizenzen (only non commercial)", report.ncSoundLicensesAll);

  console.log("\n==============================\n");
}

// =======================
// HAUPTPROZESS
// =======================

(async function () {
  try {
    const args = parsePipelineArgs(process.argv.slice(2));
    if (args.help) {
      printPipelineHelp();
      return;
    }

    const speciesList = JSON.parse(fs.readFileSync("species_list.json", "utf8"));
    if (!Array.isArray(speciesList)) throw new Error("species_list.json muss ein Array enthalten.");
    const existingSpeciesData = loadExistingSpeciesData();
    if (args.reportOnly) {
      const report = createMissingElementsReport(existingSpeciesData);
      atomicWriteJson("fehlende_elemente_report.json", report);
      printReportToConsole(report);
      console.log("✔ fehlende_elemente_report.json aus aktuellem Daten-/Assetstand neu aufgebaut!");
      return;
    }
    const plan = buildPipelinePlan({
      speciesList,
      existingSpeciesData,
      repoRoot: process.cwd(),
      sanitizeAssetName,
      mode: args.mode,
      targetSlugs: args.targetSlugs,
    });

    if (args.dryRun) {
      console.log(JSON.stringify({
        dryRun: true,
        mode: plan.mode,
        inputCount: plan.inputCount,
        targetCount: plan.targetCount,
        targetSlugs: plan.targetSlugs,
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
      }, null, 2));
      return;
    }

    if (args.mode !== "nc-sounds" && !TOKEN) {
      throw new Error("IUCN_TOKEN fehlt! Bitte als Umgebungsvariable setzen.");
    }
    if (args.mode !== "manual-maps" && !XENO_TOKEN) {
      throw new Error("XENO_TOKEN fehlt! Bitte als Umgebungsvariable setzen.");
    }
    if (!fs.existsSync(SPECIES_ASSETS_DIR)) fs.mkdirSync(SPECIES_ASSETS_DIR);

    if (args.mode !== "all" && !plan.hasWork) {
      const noWorkMessage = {
        missing: "Keine neuen oder unvollständigen Arten gefunden.",
        "manual-maps": "Keine manuell gepflegten oder fehlenden Karten gefunden.",
        "nc-sounds": "Keine ungeschützten NC-Sounds oder fehlenden Sounds gefunden.",
      }[args.mode] || "Keine Pipeline-Aktionen gefunden.";
      console.log(`✔ ${noWorkMessage} Es sind keine Pipeline-Aktionen erforderlich.`);
      return;
    }

    const assetOnlyMode = args.mode === "manual-maps" || args.mode === "nc-sounds";
    const existingBySlug = new Map(existingSpeciesData.map((entry) => [entry.URLSlug, entry]));
    const targetSlugs = new Set(plan.targets.map((entry) => entry.slug));
    const output = [];

    for (const s of speciesList) {
      const currentSlug = getInputSlug(s);
      const existingData = existingBySlug.get(currentSlug);
      if (!targetSlugs.has(currentSlug)) {
        if (existingData) output.push(preserveExistingSpeciesData(existingData, s));
        continue;
      }

      let data = assetOnlyMode && existingData
        ? preserveExistingSpeciesData(existingData, s)
        : await fetchSpeciesData(s.genus, s.species, s.german, s.size, s.weight, s.life_expectancy);

      if (!hasUsableSpeciesData(data) && hasUsableSpeciesData(existingData)) {
        console.warn(`⚠ Verwende vorhandene Daten für ${s.german}, neuer Abruf war unvollständig.`);
        logError(`Fallback auf vorhandene Daten: ${s.german} (${s.genus} ${s.species})`);
        data = preserveExistingSpeciesData(existingData, s);
      }

      output.push(data);

      const forceSoundAlternativeSearch = args.mode === "nc-sounds"
        && targetSlugs.has(currentSlug);
      const soundStatus = args.mode === "manual-maps"
        ? "ok"
        : await downloadSoundIfMissing(
          s.genus,
          s.species,
          s.german,
          { forceAlternativeSearch: forceSoundAlternativeSearch },
        );
      const mapStatus = args.mode === "nc-sounds"
        ? "ok"
        : await downloadMapForSpecies(
          data,
          args.mode === "manual-maps"
            ? { force: true, allowManual: true, recordAssessment: false }
            : undefined,
        );

      const speciesOk =
        data &&
        data["Wissenschaftlicher Name"] !== "n/a" &&
        data["Assessment ID"] &&
        data["Assessment ID"] !== "n/a";

      const soundLabel = soundStatus === "ok" ? "ok" : soundStatus;
      const mapLabel = mapStatus === "ok" ? "ok" : mapStatus;
      const dataLabel = speciesOk ? "ok" : "n/a";

      const hasError = soundLabel === "error" || mapLabel === "error";
      const hasBlocked = soundLabel === "locked" || mapLabel === "locked";
      const hasMissing =
        soundLabel === "missing" || mapLabel === "missing" || mapLabel === "n/a" || dataLabel === "n/a";
      const icon = hasError ? "❌" : hasBlocked || hasMissing ? "⚠" : "✅";

      const germanName = data["Deutscher Name"] || s.german || "unbekannt";
      const sciName = data["Wissenschaftlicher Name"] || `${s.genus} ${s.species}`;

      console.log(
        `${icon} Fertig: ${germanName} - ${sciName} (Sound: ${soundLabel}, Map: ${mapLabel}, Spezies-Data: ${dataLabel})`
      );
      console.log("");

      await sleep(RATE_LIMIT);
    }

    if (assetOnlyMode) {
      console.log("✔ Gezielter Asset-Suchlauf abgeschlossen; Artendaten bleiben unverändert.");
    } else {
      atomicWriteJson("speciesData.json", output);
      console.log("✔ speciesData.json aktualisiert!");

      const report = createMissingElementsReport(output);
      atomicWriteJson("fehlende_elemente_report.json", report);
      printReportToConsole(report);
      console.log("✔ fehlende_elemente_report.json erstellt!");
    }
  } catch (err) {
    console.error("❌ Fehler im Hauptprozess: " + err);
    logError("Hauptprozess: " + err.message);
    process.exitCode = 1;
  }
})().finally(exitAfterMain);
