import fs from "node:fs";
import path from "node:path";

const MISSING_VALUES = new Set(["", "n/a"]);

function normalized(value) {
  return String(value ?? "").trim().toLocaleLowerCase("de");
}

function isMissing(value) {
  return MISSING_VALUES.has(normalized(value));
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function isNcLicense(value) {
  const license = normalized(value);
  return license.includes("by-nc")
    || license.includes("noncommercial")
    || license.includes("non-commercial");
}

export function inputSlug(entry) {
  return `${entry?.genus ?? ""}${entry?.species ?? ""}`.toLocaleLowerCase("de");
}

export function buildPipelinePlan({
  speciesList,
  existingSpeciesData,
  repoRoot,
  sanitizeAssetName,
  mode = "missing",
}) {
  if (!["all", "missing", "manual-maps", "nc-sounds"].includes(mode)) {
    throw new Error(`Unbekannter Pipeline-Modus: ${mode}`);
  }

  const assetOverrides = readJson(
    path.join(repoRoot, "species-assets-overrides.json"),
    { version: 1, assets: {} },
  );

  const existingBySlug = new Map(
    existingSpeciesData.map((entry) => [String(entry.URLSlug ?? "").toLocaleLowerCase("de"), entry]),
  );
  const inputSlugs = new Set(speciesList.map(inputSlug));
  const removed = existingSpeciesData
    .filter((entry) => !inputSlugs.has(String(entry.URLSlug ?? "").toLocaleLowerCase("de")))
    .map((entry) => ({
      slug: entry.URLSlug,
      germanName: entry["Deutscher Name"] ?? "Unbekannt",
      scientificName: entry["Wissenschaftlicher Name"] ?? "Unbekannt",
      reason: "nicht mehr in species_list.json",
    }));

  const candidates = speciesList.map((entry) => {
    const slug = inputSlug(entry);
    const existing = existingBySlug.get(slug);
    const safeName = sanitizeAssetName(entry.german);
    const assetDir = path.join(repoRoot, "species-assets", safeName);
    const reasons = [];

    if (!existing) {
      reasons.push("noch nicht in speciesData.json");
    } else {
      const missingCore = [
        ["Assessment ID", existing["Assessment ID"]],
        ["Status", existing.Status],
        ["Kategorie", existing.Kategorie],
        ["Trend", existing.Trend],
      ]
        .filter(([, value]) => isMissing(value))
        .map(([label]) => label);
      if (missingCore.length) reasons.push(`fehlende IUCN-Felder: ${missingCore.join(", ")}`);
    }

    const assetChecks = [
      ["Karte", "map.jpg"],
      ["Sound", "sound.mp3"],
      ["Credits", "credits.json"],
      ["Spektrogramm", "spectrogram.webp"],
    ];
    const missingAssets = assetChecks
      .filter(([, fileName]) => !fs.existsSync(path.join(assetDir, fileName)))
      .map(([label]) => label);
    if (missingAssets.length) reasons.push(`fehlende Assets: ${missingAssets.join(", ")}`);

    if (mode === "manual-maps") {
      reasons.splice(0, reasons.length);
      if (assetOverrides.assets?.[safeName]?.map?.manual === true) {
        reasons.push("manuell gepflegte Karte erneut automatisch suchen");
      }
    }

    if (mode === "nc-sounds") {
      reasons.splice(0, reasons.length);
      const credits = readJson(path.join(assetDir, "credits.json"), {});
      if (
        fs.existsSync(path.join(assetDir, "sound.mp3"))
        && isNcLicense(credits.license)
        && assetOverrides.assets?.[safeName]?.sound?.manual !== true
      ) {
        reasons.push("NC-Sound auf freie Alternative prüfen");
      }
    }

    return {
      entry,
      slug,
      safeName,
      germanName: entry.german,
      scientificName: `${entry.genus} ${entry.species}`,
      reasons: mode === "all" ? ["vollständiger Lauf"] : reasons,
    };
  });

  const targets = mode === "all"
    ? candidates
    : candidates.filter((entry) => entry.reasons.length > 0);

  return {
    mode,
    inputCount: speciesList.length,
    targetCount: targets.length,
    targets,
    removedCount: removed.length,
    removed,
    hasWork: targets.length > 0 || removed.length > 0,
  };
}
