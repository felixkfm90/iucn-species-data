import fs from "fs";
import path from "path";
import { buildPipelinePlan } from "./scripts/pipeline-selection.mjs";
import { isMapProtected } from "./scripts/map-provenance.mjs";
import { createIucnDataAdapter } from "./scripts/iucn-data-adapter.mjs";
import { readIucnMasterReference } from "./species-explorer/taxonomy-iucn-reference.mjs";
import { defaultTaxonomyRoot } from "./species-explorer/taxonomy-storage.mjs";
import { createIucnMapAdapter } from "./scripts/iucn-map-adapter.mjs";
import { createSpeciesSoundPipeline } from "./scripts/species-sound-pipeline.mjs";
import {
  createEmptyPipelineSpeciesData as emptyEntry,
  formatPipelineTaxonomyName as formatTaxonomyName,
  preservePipelineSpeciesData as preserveExistingSpeciesData,
  createSpeciesDataPipeline,
} from "./scripts/species-data-pipeline.mjs";
import { createSpeciesPipeline } from "./scripts/species-pipeline.mjs";
import { appendPipelineErrorLog } from "./scripts/pipeline-error-log.mjs";
import {
  applyTaxonomyOverride,
  createEmptyTaxonomyOverrideRegistry,
  synchronizeAutomaticTaxonomyFields,
  validateTaxonomyOverrideRegistry,
} from "./scripts/taxonomy-overrides.mjs";

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

// Assessment-ID Trackfile (für Karten-Caching)
const ASSESSMENT_TRACK_FILE = "./lastSavedAssessmentId.json";
const ASSET_OVERRIDES_FILE = "./species-assets-overrides.json";
const TAXONOMY_OVERRIDES_FILE = "./species-taxonomy-overrides.json";
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
let taxonomyOverrides = createEmptyTaxonomyOverrideRegistry();
if (fs.existsSync(TAXONOMY_OVERRIDES_FILE)) {
  const parsed = JSON.parse(fs.readFileSync(TAXONOMY_OVERRIDES_FILE, "utf8"));
  const issues = validateTaxonomyOverrideRegistry(parsed);
  if (issues.length) {
    throw new Error(`Taxonomie-Overrides sind ungültig: ${issues.join(" ")}`);
  }
  taxonomyOverrides = parsed;
}

// =======================
// HELFER
// =======================

function logError(msg) {
  appendPipelineErrorLog(msg);
}

function parsePipelineArgs(rawArgs) {
  const parsed = { mode: "all", dryRun: false, reportOnly: false, quietReport: false, targetSlugs: [] };
  for (const arg of rawArgs) {
    if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--report-only") parsed.reportOnly = true;
    else if (arg === "--quiet-report") parsed.quietReport = true;
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
  --quiet-report   Fehlstellenbericht speichern, ohne seine Detailübersicht auszugeben (Explorer-Teilschritt)
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
  if (assetType === "map") return isMapProtected(assetOverrides.assets?.[safeName]?.map);
  return assetOverrides.assets?.[safeName]?.[assetType]?.manual === true;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

const iucnDataAdapter = createIucnDataAdapter({
  fetch,
  token: TOKEN,
  sleep,
  logError,
  emptyEntry,
  formatTaxonomyName,
  baseUrl: BASE,
  resolveTaxonomy: input => readIucnMasterReference(input, { taxonomyRoot: defaultTaxonomyRoot(process.env, process.cwd()) }),
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

const { downloadSoundIfMissing } = createSpeciesSoundPipeline({
  fetch,
  token: XENO_TOKEN,
  sleep,
  sanitizeAssetName,
  speciesAssetDir,
  readAssetOverrides: () => assetOverrides,
  logError,
  logger: console,
});

const { prepareSpeciesData } = createSpeciesDataPipeline({ fetchSpeciesData, logError });
const { runSpecies } = createSpeciesPipeline({
  prepareSpeciesData, downloadSoundIfMissing, downloadMapForSpecies, sanitizeAssetName, isManualAsset,
});

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
    if (!fs.existsSync(path.join(assetDir, "portrait.webp"))) missingAssetParts.push("portrait.webp");
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
      if (!args.quietReport) printReportToConsole(report);
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

      const { data } = await runSpecies(s, { mode: args.mode, existingData });
      output.push(data);
      await sleep(RATE_LIMIT);
    }

    if (assetOnlyMode) {
      console.log("✔ Gezielter Asset-Suchlauf abgeschlossen; Artendaten bleiben unverändert.");
    } else {
      const automaticTaxonomyEntries = output.filter((entry) => targetSlugs.has(entry?.URLSlug));
      const taxonomySync = synchronizeAutomaticTaxonomyFields(automaticTaxonomyEntries, taxonomyOverrides);
      taxonomyOverrides = taxonomySync.registry;
      if (taxonomySync.changed) atomicWriteJson(TAXONOMY_OVERRIDES_FILE, taxonomyOverrides);
      const effectiveOutput = output.map((entry) => applyTaxonomyOverride(entry, taxonomyOverrides));
      atomicWriteJson("speciesData.json", effectiveOutput);
      console.log("✔ speciesData.json aktualisiert!");

      const report = createMissingElementsReport(effectiveOutput);
      atomicWriteJson("fehlende_elemente_report.json", report);
      if (!args.quietReport) printReportToConsole(report);
      console.log("✔ fehlende_elemente_report.json erstellt!");
    }
  } catch (err) {
    console.error("❌ Fehler im Hauptprozess: " + err);
    logError("Hauptprozess: " + err.message);
    process.exitCode = 1;
  }
})().finally(exitAfterMain);
