import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectManagedAssetBackups,
  repoRelativePath,
} from "./asset-backups.mjs";
import { SPECIES_ASSET_FILE_NAMES } from "./asset-files.mjs";
import {
  compareReportList,
  compareValues,
  formatTaxonomyName,
  isMissingValue,
  sanitizeAssetName,
  scientificKey,
  valueOrUnknown,
} from "./species-model.mjs";

const APP_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(APP_DIR, "..");

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

export async function buildExplorerRevision(repoRoot) {
  const parts = [];
  const trackedFiles = [
    "species_list.json",
    "speciesData.json",
    "fehlende_elemente_report.json",
    "species-assets-overrides.json",
    "species-taxonomy-overrides.json",
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
      for (const fileName of [...SPECIES_ASSET_FILE_NAMES].sort()) {
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
  const [
    inputList,
    generatedList,
    report,
    manualMapMarkdown,
    assetOverrides,
    taxonomyOverrides,
    collectedAssetBackups,
  ] = await Promise.all([
    readJson(join(repoRoot, "species_list.json")),
    readJson(join(repoRoot, "speciesData.json")),
    readJson(join(repoRoot, "fehlende_elemente_report.json")),
    readFile(join(repoRoot, "docs", "manual-map-overrides.md"), "utf8"),
    readJson(join(repoRoot, "species-assets-overrides.json")).catch(() => ({ version: 1, assets: {} })),
    readJson(join(repoRoot, "species-taxonomy-overrides.json")).catch(() => ({ version: 1, species: {} })),
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

    const taxonomyOverride = taxonomyOverrides.species?.[
      String(generated?.URLSlug ?? key.replace(/\s+/g, "")).toLocaleLowerCase("de")
    ] ?? null;

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
        subphylum: formatTaxonomyName(generated?.Subphylum),
        className: formatTaxonomyName(generated?.Class),
        order: formatTaxonomyName(generated?.Order),
        family: formatTaxonomyName(generated?.Family),
        genus: valueOrUnknown(generated?.Genus ?? input?.genus),
        species: valueOrUnknown(generated?.Species ?? input?.species),
        manuallyEdited: Boolean(taxonomyOverride),
        manualReason: taxonomyOverride?.reason ?? "",
        automaticFields: taxonomyOverride?.automaticFields ?? null,
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
