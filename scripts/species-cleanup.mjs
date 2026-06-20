import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function sanitizeAssetName(input) {
  return String(input ?? "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\/\\:*?"<>|]/g, "_")
    .replace(/[\x00-\x1F\x7F]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/_+/g, "_")
    .trim()
    .replace(/^[.\s_-]+|[.\s_-]+$/g, "") || "unknown";
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function atomicWriteJson(filePath, value) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2));
  fs.renameSync(tempPath, filePath);
}

function directoryBytes(directory) {
  if (!fs.existsSync(directory)) return 0;
  return fs.readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => {
    const entryPath = path.join(directory, entry.name);
    return sum + (entry.isDirectory() ? directoryBytes(entryPath) : fs.statSync(entryPath).size);
  }, 0);
}

function createReport(speciesData, repoRoot) {
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
  const ncNames = [];

  for (const entry of speciesData) {
    const german = entry["Deutscher Name"] || entry["Wissenschaftlicher Name"] || "unknown";
    const safeName = sanitizeAssetName(german);
    const assetDir = path.join(repoRoot, "species-assets", safeName);
    const assetFiles = {
      map: path.join(assetDir, "map.jpg"),
      sound: path.join(assetDir, "sound.mp3"),
      credits: path.join(assetDir, "credits.json"),
      spectrogram: path.join(assetDir, "spectrogram.webp"),
    };

    if (!entry["Assessment ID"] || entry["Assessment ID"] === "n/a") report.missing.assessmentId.push(german);
    if (!entry.Status || entry.Status === "n/a") report.missing.status.push(german);
    if (!entry.Kategorie || entry.Kategorie === "n/a") report.missing.category.push(german);
    if (!entry.Trend || entry.Trend === "n/a") report.missing.trend.push(german);
    if (!fs.existsSync(assetFiles.sound)) report.missing.soundMp3.push(german);
    if (fs.existsSync(assetFiles.sound) && !fs.existsSync(assetFiles.credits)) {
      report.missing.soundCredits.push(german);
    }
    if (!fs.existsSync(assetFiles.map)) report.missing.maps.push(german);

    const missing = [
      ["map.jpg", assetFiles.map],
      ["sound.mp3", assetFiles.sound],
      ["credits.json", assetFiles.credits],
      ["spectrogram.webp", assetFiles.spectrogram],
    ].filter(([, filePath]) => !fs.existsSync(filePath)).map(([fileName]) => fileName);
    if (missing.length) report.missing.speciesAssets.push({ german, safeName, missing });

    if (fs.existsSync(assetFiles.credits)) {
      try {
        const credits = readJson(assetFiles.credits, {});
        if (String(credits.license ?? "").toLocaleLowerCase("de").includes("/by-nc")) ncNames.push(german);
      } catch {
        // Ungültige Credits werden vom Explorer separat gemeldet.
      }
    }
  }

  report.ncSoundLicensesAll = [...new Set(ncNames)].sort((a, b) => a.localeCompare(b, "de"));
  report.counts.missingSoundMp3 = report.missing.soundMp3.length;
  report.counts.missingSoundCredits = report.missing.soundCredits.length;
  report.counts.missingMap = report.missing.maps.length;
  report.counts.missingAssessmentId = report.missing.assessmentId.length;
  report.counts.missingStatus = report.missing.status.length;
  report.counts.missingCategory = report.missing.category.length;
  report.counts.missingTrend = report.missing.trend.length;
  report.counts.missingSpeciesAssets = report.missing.speciesAssets.length;
  report.counts.ncSoundLicensesAll = report.ncSoundLicensesAll.length;
  return report;
}

export function buildCleanupPlan(repoRoot = process.cwd()) {
  const speciesList = readJson(path.join(repoRoot, "species_list.json"), []);
  const speciesData = readJson(path.join(repoRoot, "speciesData.json"), []);
  const assessmentIds = readJson(path.join(repoRoot, "lastSavedAssessmentId.json"), {});
  const inputSlugs = new Set(
    speciesList.map((entry) => `${entry.genus ?? ""}${entry.species ?? ""}`.toLocaleLowerCase("de")),
  );
  const inputSafeNames = new Set(speciesList.map((entry) => sanitizeAssetName(entry.german)));
  const assetsRoot = path.join(repoRoot, "species-assets");
  const assetDirectories = fs.existsSync(assetsRoot)
    ? fs.readdirSync(assetsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
    : [];

  const obsoleteData = speciesData
    .filter((entry) => !inputSlugs.has(String(entry.URLSlug ?? "").toLocaleLowerCase("de")))
    .map((entry) => ({
      slug: entry.URLSlug,
      germanName: entry["Deutscher Name"] ?? "Unbekannt",
      scientificName: entry["Wissenschaftlicher Name"] ?? "Unbekannt",
    }));
  const obsoleteAssetDirectories = assetDirectories
    .filter((safeName) => !inputSafeNames.has(safeName))
    .map((safeName) => ({
      safeName,
      path: `species-assets/${safeName}`,
      bytes: directoryBytes(path.join(assetsRoot, safeName)),
    }));
  const obsoleteAssessmentKeys = Object.keys(assessmentIds)
    .filter((safeName) => !inputSafeNames.has(safeName))
    .sort((a, b) => a.localeCompare(b, "de"));

  return {
    generatedAt: new Date().toISOString(),
    inputCount: speciesList.length,
    obsoleteData,
    obsoleteAssetDirectories,
    obsoleteAssessmentKeys,
    reclaimableBytes: obsoleteAssetDirectories.reduce((sum, entry) => sum + entry.bytes, 0),
    hasWork:
      obsoleteData.length > 0
      || obsoleteAssetDirectories.length > 0
      || obsoleteAssessmentKeys.length > 0,
  };
}

export function runCleanup(repoRoot = process.cwd()) {
  const plan = buildCleanupPlan(repoRoot);
  if (!plan.hasWork) return { ...plan, cleaned: false };

  const speciesDataPath = path.join(repoRoot, "speciesData.json");
  const reportPath = path.join(repoRoot, "fehlende_elemente_report.json");
  const assessmentPath = path.join(repoRoot, "lastSavedAssessmentId.json");
  const speciesData = readJson(speciesDataPath, []);
  const speciesList = readJson(path.join(repoRoot, "species_list.json"), []);
  const assessmentIds = readJson(assessmentPath, {});
  const inputSlugs = new Set(
    speciesList.map((entry) => `${entry.genus ?? ""}${entry.species ?? ""}`.toLocaleLowerCase("de")),
  );
  const inputSafeNames = new Set(speciesList.map((entry) => sanitizeAssetName(entry.german)));
  const filteredData = speciesData.filter(
    (entry) => inputSlugs.has(String(entry.URLSlug ?? "").toLocaleLowerCase("de")),
  );
  const filteredAssessmentIds = Object.fromEntries(
    Object.entries(assessmentIds).filter(([safeName]) => inputSafeNames.has(safeName)),
  );

  const assetsRoot = path.resolve(repoRoot, "species-assets");
  const resolvedAssetsRoot = `${assetsRoot}${path.sep}`;
  atomicWriteJson(speciesDataPath, filteredData);
  atomicWriteJson(assessmentPath, filteredAssessmentIds);

  for (const entry of plan.obsoleteAssetDirectories) {
    const source = path.resolve(repoRoot, entry.path);
    if (!`${source}${path.sep}`.startsWith(resolvedAssetsRoot)) {
      throw new Error(`Unsicherer Assetpfad: ${source}`);
    }
    fs.rmSync(source, { recursive: true, force: true });
  }

  atomicWriteJson(reportPath, createReport(filteredData, repoRoot));

  return {
    ...plan,
    cleaned: true,
  };
}

function parseArgs(rawArgs) {
  const args = { dryRun: false };
  for (const arg of rawArgs) {
    if (arg === "--dry-run") args.dryRun = true;
    else throw new Error(`Unbekannter Parameter: ${arg}`);
  }
  return args;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = args.dryRun ? buildCleanupPlan() : runCleanup();
    console.log(JSON.stringify({ dryRun: args.dryRun, ...result }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
