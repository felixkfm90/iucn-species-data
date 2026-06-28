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
  targetSlugs = [],
}) {
  if (!["all", "missing", "manual-maps", "nc-sounds"].includes(mode)) {
    throw new Error(`Unbekannter Pipeline-Modus: ${mode}`);
  }

  const assetOverrides = readJson(
    path.join(repoRoot, "species-assets-overrides.json"),
    { version: 1, assets: {} },
  );

  const requestedTargetSlugs = new Set(
    (Array.isArray(targetSlugs) ? targetSlugs : [])
      .map((slug) => normalized(slug))
      .filter(Boolean),
  );
  const existingBySlug = new Map(
    existingSpeciesData.map((entry) => [String(entry.URLSlug ?? "").toLocaleLowerCase("de"), entry]),
  );
  const inputSlugs = new Set(speciesList.map(inputSlug));
  const rawRemoved = existingSpeciesData
    .filter((entry) => !inputSlugs.has(String(entry.URLSlug ?? "").toLocaleLowerCase("de")))
    .map((entry) => ({
      slug: entry.URLSlug,
      germanName: entry["Deutscher Name"] ?? "Unbekannt",
      scientificName: entry["Wissenschaftlicher Name"] ?? "Unbekannt",
      reason: "nicht mehr in species_list.json",
    }));
  const removed = requestedTargetSlugs.size ? [] : rawRemoved;

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
      const mapPath = path.join(assetDir, "map.jpg");
      if (assetOverrides.assets?.[safeName]?.map?.manual === true) {
        reasons.push("manuell gepflegte Karte erneut automatisch suchen");
      } else if (requestedTargetSlugs.has(normalized(slug)) && !fs.existsSync(mapPath)) {
        reasons.push("Karte fehlt; automatische Karte gezielt suchen");
      }
    }

    if (mode === "nc-sounds") {
      reasons.splice(0, reasons.length);
      const soundPath = path.join(assetDir, "sound.mp3");
      const creditsPath = path.join(assetDir, "credits.json");
      const credits = readJson(creditsPath, {});
      const soundIsManual = assetOverrides.assets?.[safeName]?.sound?.manual === true;
      if (!existing) {
        // Neue Arten werden weiterhin vom Modus "missing" verarbeitet.
      } else if (fs.existsSync(soundPath) && isNcLicense(credits.license) && !soundIsManual) {
        reasons.push("NC-Sound auf freie Alternative prüfen");
      } else if (!soundIsManual && !fs.existsSync(soundPath)) {
        reasons.push("Sound fehlt; automatische Quelle suchen");
      } else if (!soundIsManual && fs.existsSync(soundPath) && !fs.existsSync(creditsPath)) {
        reasons.push("Sound-Credits fehlen; dokumentierte freie Alternative suchen");
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

  let targets = mode === "all"
    ? candidates
    : candidates.filter((entry) => entry.reasons.length > 0);
  if (requestedTargetSlugs.size) {
    targets = targets.filter((entry) => requestedTargetSlugs.has(normalized(entry.slug)));
  }

  return {
    mode,
    targetSlugs: [...requestedTargetSlugs],
    inputCount: speciesList.length,
    targetCount: targets.length,
    targets,
    removedCount: removed.length,
    removed,
    hasWork: targets.length > 0 || removed.length > 0,
  };
}
