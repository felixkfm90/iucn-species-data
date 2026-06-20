import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { buildPipelinePlan } from "../scripts/pipeline-selection.mjs";
import { buildCleanupPlan, runSpeciesCleanup } from "../scripts/species-cleanup.mjs";

const APP_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(APP_DIR, "..");
const PUBLIC_DIR = join(APP_DIR, "public");
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4177;
const ASSET_FILES = new Set(["map.jpg", "sound.mp3", "credits.json", "spectrogram.webp"]);
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
const BACKUP_RETENTION_COUNT = 20;
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
  const filtered = lines.filter((line) => {
    const match = line.match(
      /^\|\s*[^|]+\|\s*([^|]+?)\s*\|\s*`species-assets\/([^/]+)\/map\.jpg`/,
    );
    if (!match) return true;
    const safeName = match[2].trim();
    return assetOverrides.assets?.[safeName]?.map?.manual !== false;
  });
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

async function readJsonBody(request) {
  const chunks = [];
  let bytes = 0;

  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_JSON_BODY_BYTES) {
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
    const [map, sound, creditsFile, spectrogram] = await Promise.all([
      fileInfo(join(assetDir, "map.jpg")),
      fileInfo(join(assetDir, "sound.mp3")),
      fileInfo(join(assetDir, "credits.json")),
      fileInfo(join(assetDir, "spectrogram.webp")),
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
    if (!spectrogram.exists) assetIssues.push("Spektrogramm fehlt");
    inconsistencies.push(...dataIssues, ...assetIssues);
    const mapOverride = assetOverrides.assets?.[safeName]?.map;
    const isManualMap = typeof mapOverride?.manual === "boolean"
      ? mapOverride.manual
      : manualMapSafeNames.has(safeName);
    const isManualSound = assetOverrides.assets?.[safeName]?.sound?.manual === true;
    const isNcSound = String(credits?.license ?? "").toLocaleLowerCase("de").includes("/by-nc");

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
        },
        sound: {
          ...sound,
          url: `/assets/${encodeURIComponent(safeName)}/sound.mp3`,
          manuallyAdded: isManualSound,
        },
        credits: { ...creditsFile, url: `/assets/${encodeURIComponent(safeName)}/credits.json` },
        spectrogram: {
          ...spectrogram,
          url: `/assets/${encodeURIComponent(safeName)}/spectrogram.webp`,
        },
      },
      credits,
      creditsError,
      isNcSound,
      reportNcSound: ncNames.has(germanName),
      isManualMap,
      isManualSound,
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
  const pendingAssetReviewPath = join(repoRoot, "species-explorer", "pending-asset-review.json");
  let pipelineProcess = null;
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
      if (preview.expiresAt <= now) previewTokens.delete(token);
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
