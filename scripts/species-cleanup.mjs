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

function resolveAssetDirectory(repoRoot, safeName) {
  const assetsRoot = path.resolve(repoRoot, "species-assets");
  const resolvedAssetsRoot = `${assetsRoot}${path.sep}`;
  const source = path.resolve(assetsRoot, safeName);
  if (!`${source}${path.sep}`.startsWith(resolvedAssetsRoot)) {
    throw new Error(`Unsicherer Assetpfad: ${source}`);
  }
  return source;
}

function cleanupTrashRoot(repoRoot) {
  return path.resolve(repoRoot, "species-explorer", "cleanup-trash");
}

function uniqueCleanupTrashRunDirectory(repoRoot) {
  return path.join(cleanupTrashRoot(repoRoot), `cleanup-${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`);
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function withRetry(operation, { attempts = 10, delay = 150 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      lastError = error;
      if (!["EPERM", "EBUSY", "ENOTEMPTY"].includes(error.code) || attempt === attempts) break;
      sleepSync(delay);
    }
  }
  throw lastError;
}

function isDirectoryEmpty(directory) {
  return fs.existsSync(directory)
    && fs.statSync(directory).isDirectory()
    && fs.readdirSync(directory).length === 0;
}

function stageDirectoryWithWindowsFallback(source, target) {
  try {
    withRetry(() => fs.renameSync(source, target));
    return;
  } catch (renameError) {
    if (!["EPERM", "EBUSY", "EXDEV"].includes(renameError.code)) {
      throw renameError;
    }

    try {
      fs.cpSync(source, target, {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
    } catch (copyError) {
      throw new Error(
        `Assetordner konnte nicht in den Bereinigungsbereich verschoben werden: ${source}. `
        + `Verschieben: ${renameError.message}; Kopieren: ${copyError.message}`,
      );
    }

    try {
      withRetry(() => {
        fs.rmSync(source, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 200,
        });
        if (fs.existsSync(source)) {
          const error = new Error(`Assetordner existiert nach dem Entfernen weiterhin: ${source}`);
          error.code = "EPERM";
          throw error;
        }
      });
    } catch (removeError) {
      let restoreError = null;
      try {
        fs.mkdirSync(source, { recursive: true });
        fs.cpSync(target, source, {
          recursive: true,
          force: true,
        });
      } catch (error) {
        restoreError = error;
      }
      try {
        fs.rmSync(target, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 200,
        });
      } catch {
        // Der kopierte Zwischenstand liegt im ignorierten Cleanup-Trash und kann spaeter entfernt werden.
      }
      throw new Error(
        `Assetordner ist durch Windows noch gesperrt und konnte nicht entfernt werden: ${source}. `
        + "Bitte Detailansicht, Explorer-Vorschau oder andere Fenster mit diesen Dateien schliessen und erneut versuchen. "
        + `Originalfehler: ${removeError.message}`
        + (restoreError ? `; Wiederherstellung fehlgeschlagen: ${restoreError.message}` : ""),
      );
    }
  }
}

function stageAssetDirectory(repoRoot, safeName, trashRunDirectory) {
  const source = resolveAssetDirectory(repoRoot, safeName);
  if (!fs.existsSync(source)) {
    return {
      safeName,
      existed: false,
      source,
      staged: "",
      publicStaged: "",
    };
  }

  fs.mkdirSync(trashRunDirectory, { recursive: true });
  let target = path.join(trashRunDirectory, safeName);
  let suffix = 1;
  while (fs.existsSync(target)) {
    target = path.join(trashRunDirectory, `${safeName}-${suffix}`);
    suffix += 1;
  }

  const trashRoot = `${cleanupTrashRoot(repoRoot)}${path.sep}`;
  const resolvedTarget = path.resolve(target);
  if (!`${resolvedTarget}${path.sep}`.startsWith(trashRoot)) {
    throw new Error(`Unsicherer Papierkorbpfad: ${resolvedTarget}`);
  }

  stageDirectoryWithWindowsFallback(source, resolvedTarget);
  return {
    safeName,
    existed: true,
    source,
    staged: resolvedTarget,
    publicStaged: path.relative(repoRoot, resolvedTarget).replace(/\\/g, "/"),
  };
}

function restoreStagedAssetDirectories(stagedEntries) {
  for (const entry of [...stagedEntries].reverse()) {
    if (!entry.existed || !entry.staged || !fs.existsSync(entry.staged)) continue;
    if (fs.existsSync(entry.source)) {
      if (!isDirectoryEmpty(entry.source)) {
        throw new Error(`Assetordner kann nicht wiederhergestellt werden, Ziel existiert bereits: ${entry.source}`);
      }
      fs.rmSync(entry.source, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    }
    fs.renameSync(entry.staged, entry.source);
  }
}

function deleteStagedAssetDirectory(entry) {
  if (!entry.existed || !entry.staged || !fs.existsSync(entry.staged)) return null;
  try {
    fs.rmSync(entry.staged, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  } catch (error) {
    return {
      safeName: entry.safeName,
      path: entry.publicStaged,
      error: error.message,
    };
  }
  if (fs.existsSync(entry.staged)) {
    return {
      safeName: entry.safeName,
      path: entry.publicStaged,
      error: "Ordner ist nach Löschversuch noch vorhanden",
    };
  }
  return null;
}

function removeEmptyCleanupTrashRunDirectory(trashRunDirectory) {
  if (!trashRunDirectory || !fs.existsSync(trashRunDirectory)) return;
  try {
    fs.rmSync(trashRunDirectory, {
      recursive: true,
      force: true,
    });
  } catch {
    // Ein nicht leerbarer Zwischenordner ist kein Datenverlust. Er bleibt ignoriert und kann spaeter bereinigt werden.
  }
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
  const assetOverrides = readJson(
    path.join(repoRoot, "species-assets-overrides.json"),
    { version: 1, assets: {} },
  );
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
  const obsoleteOverrideKeys = Object.keys(assetOverrides.assets ?? {})
    .filter((safeName) => !inputSafeNames.has(safeName))
    .sort((a, b) => a.localeCompare(b, "de"));

  return {
    mode: "cleanup",
    generatedAt: new Date().toISOString(),
    inputCount: speciesList.length,
    obsoleteData,
    obsoleteAssetDirectories,
    obsoleteAssessmentKeys,
    obsoleteOverrideKeys,
    reclaimableBytes: obsoleteAssetDirectories.reduce((sum, entry) => sum + entry.bytes, 0),
    hasWork:
      obsoleteData.length > 0
      || obsoleteAssetDirectories.length > 0
      || obsoleteAssessmentKeys.length > 0
      || obsoleteOverrideKeys.length > 0,
  };
}

export function runCleanup(repoRoot = process.cwd()) {
  const plan = buildCleanupPlan(repoRoot);
  if (!plan.hasWork) return { ...plan, cleaned: false };

  const speciesDataPath = path.join(repoRoot, "speciesData.json");
  const reportPath = path.join(repoRoot, "fehlende_elemente_report.json");
  const assessmentPath = path.join(repoRoot, "lastSavedAssessmentId.json");
  const assetOverridesPath = path.join(repoRoot, "species-assets-overrides.json");
  const speciesData = readJson(speciesDataPath, []);
  const speciesList = readJson(path.join(repoRoot, "species_list.json"), []);
  const assessmentIds = readJson(assessmentPath, {});
  const assetOverrides = readJson(assetOverridesPath, { version: 1, assets: {} });
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
  const filteredAssetOverrides = {
    ...assetOverrides,
    version: 1,
    assets: Object.fromEntries(
      Object.entries(assetOverrides.assets ?? {}).filter(([safeName]) => inputSafeNames.has(safeName)),
    ),
  };

  const trashRunDirectory = uniqueCleanupTrashRunDirectory(repoRoot);
  const stagedAssetDirectories = [];
  for (const entry of plan.obsoleteAssetDirectories) {
    stagedAssetDirectories.push(stageAssetDirectory(repoRoot, entry.safeName, trashRunDirectory));
  }

  try {
    atomicWriteJson(speciesDataPath, filteredData);
    atomicWriteJson(assessmentPath, filteredAssessmentIds);
    atomicWriteJson(assetOverridesPath, filteredAssetOverrides);
    atomicWriteJson(reportPath, createReport(filteredData, repoRoot));
  } catch (error) {
    restoreStagedAssetDirectories(stagedAssetDirectories);
    throw error;
  }

  const pendingDeleteDirectories = stagedAssetDirectories
    .map(deleteStagedAssetDirectory)
    .filter(Boolean);
  if (pendingDeleteDirectories.length === 0) {
    removeEmptyCleanupTrashRunDirectory(trashRunDirectory);
  }

  return {
    ...plan,
    cleaned: true,
    pendingDeleteDirectories,
  };
}

export function runSpeciesCleanup(repoRoot, { slug, safeName }) {
  const normalizedSlug = String(slug ?? "").toLocaleLowerCase("de");
  const normalizedSafeName = String(safeName ?? "");
  if (!normalizedSlug || !normalizedSafeName) {
    throw new Error("Slug und Assetname sind für die Artbereinigung erforderlich");
  }

  const speciesList = readJson(path.join(repoRoot, "species_list.json"), []);
  const stillInInput = speciesList.some(
    (entry) => `${entry.genus ?? ""}${entry.species ?? ""}`.toLocaleLowerCase("de") === normalizedSlug
      || sanitizeAssetName(entry.german) === normalizedSafeName,
  );
  if (stillInInput) {
    throw new Error("Art ist noch in species_list.json enthalten");
  }

  const speciesDataPath = path.join(repoRoot, "speciesData.json");
  const reportPath = path.join(repoRoot, "fehlende_elemente_report.json");
  const assessmentPath = path.join(repoRoot, "lastSavedAssessmentId.json");
  const assetOverridesPath = path.join(repoRoot, "species-assets-overrides.json");
  const speciesData = readJson(speciesDataPath, []);
  const assessmentIds = readJson(assessmentPath, {});
  const assetOverrides = readJson(assetOverridesPath, { version: 1, assets: {} });
  const filteredData = speciesData.filter((entry) => (
    String(entry.URLSlug ?? "").toLocaleLowerCase("de") !== normalizedSlug
    && sanitizeAssetName(entry["Deutscher Name"]) !== normalizedSafeName
  ));
  const generatedDataDeleted = filteredData.length !== speciesData.length;
  const assessmentDeleted = Object.hasOwn(assessmentIds, normalizedSafeName);
  const overrideDeleted = Object.hasOwn(assetOverrides.assets ?? {}, normalizedSafeName);
  const trashRunDirectory = uniqueCleanupTrashRunDirectory(repoRoot);
  const stagedAssetDirectory = stageAssetDirectory(repoRoot, normalizedSafeName, trashRunDirectory);
  const assetDirectoryDeleted = stagedAssetDirectory.existed;

  delete assessmentIds[normalizedSafeName];
  assetOverrides.version = 1;
  assetOverrides.assets ??= {};
  delete assetOverrides.assets[normalizedSafeName];

  try {
    atomicWriteJson(speciesDataPath, filteredData);
    atomicWriteJson(assessmentPath, assessmentIds);
    atomicWriteJson(assetOverridesPath, assetOverrides);
    atomicWriteJson(reportPath, createReport(filteredData, repoRoot));
  } catch (error) {
    restoreStagedAssetDirectories([stagedAssetDirectory]);
    throw error;
  }
  const pendingDeleteDirectories = [deleteStagedAssetDirectory(stagedAssetDirectory)].filter(Boolean);
  if (pendingDeleteDirectories.length === 0) {
    removeEmptyCleanupTrashRunDirectory(trashRunDirectory);
  }

  return {
    slug: normalizedSlug,
    safeName: normalizedSafeName,
    generatedDataDeleted,
    assessmentDeleted,
    overrideDeleted,
    assetDirectoryDeleted,
    pendingDeleteDirectories,
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
