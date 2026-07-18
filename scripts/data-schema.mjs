const GENERATED_STRING_FIELDS = Object.freeze([
  "URLSlug",
  "Wissenschaftlicher Name",
  "Deutscher Name",
  "Gewicht",
  "Größe",
  "Lebenserwartung",
  "Status",
  "Trend",
  "Kategorie",
  "Kingdom",
  "Phylum",
  "Class",
  "Order",
  "Family",
  "Genus",
  "Species",
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireArray(value, label, issues) {
  if (!Array.isArray(value)) issues.push(`${label} muss ein Array sein.`);
}

function requireObject(value, label, issues) {
  if (!isObject(value)) issues.push(`${label} muss ein Objekt sein.`);
}

function requireString(value, label, issues) {
  if (typeof value !== "string" || !value.trim()) issues.push(`${label} muss eine nicht leere Zeichenfolge sein.`);
}

export function validateSpeciesListSchema(value) {
  const issues = [];
  requireArray(value, "species_list.json", issues);
  if (!Array.isArray(value)) return issues;
  value.forEach((entry, index) => {
    requireObject(entry, `species_list.json[${index}]`, issues);
    if (!isObject(entry)) return;
    for (const field of ["german", "genus", "species", "size", "weight", "life_expectancy"]) {
      requireString(entry[field], `species_list.json[${index}].${field}`, issues);
    }
  });
  return issues;
}

export function validateSpeciesDataSchema(value) {
  const issues = [];
  requireArray(value, "speciesData.json", issues);
  if (!Array.isArray(value)) return issues;
  value.forEach((entry, index) => {
    requireObject(entry, `speciesData.json[${index}]`, issues);
    if (!isObject(entry)) return;
    for (const field of GENERATED_STRING_FIELDS) {
      requireString(entry[field], `speciesData.json[${index}].${field}`, issues);
    }
    if (entry.Subphylum !== undefined) {
      requireString(entry.Subphylum, `speciesData.json[${index}].Subphylum`, issues);
    }
    const assessmentId = entry["Assessment ID"];
    if (!(typeof assessmentId === "number" || (typeof assessmentId === "string" && assessmentId.trim()))) {
      issues.push(`speciesData.json[${index}].Assessment ID muss Zahl oder nicht leere Zeichenfolge sein.`);
    }
  });
  return issues;
}

export function validateAssetOverridesSchema(value) {
  const issues = [];
  requireObject(value, "species-assets-overrides.json", issues);
  if (!isObject(value)) return issues;
  if (!Number.isInteger(value.version) || value.version < 1) {
    issues.push("species-assets-overrides.json.version muss eine positive Ganzzahl sein.");
  }
  requireObject(value.assets, "species-assets-overrides.json.assets", issues);
  if (!isObject(value.assets)) return issues;
  for (const [safeName, entry] of Object.entries(value.assets)) {
    requireObject(entry, `species-assets-overrides.json.assets.${safeName}`, issues);
    if (!isObject(entry)) continue;
    for (const assetType of ["map", "sound", "portrait"]) {
      const asset = entry[assetType];
      if (asset === undefined) continue;
      requireObject(asset, `species-assets-overrides.json.assets.${safeName}.${assetType}`, issues);
      if (!isObject(asset)) continue;
      if (asset.manual !== undefined && typeof asset.manual !== "boolean") {
        issues.push(`species-assets-overrides.json.assets.${safeName}.${assetType}.manual muss boolesch sein.`);
      }
      if (assetType === "sound" && asset.rejectedSources !== undefined) {
        requireArray(asset.rejectedSources, `species-assets-overrides.json.assets.${safeName}.sound.rejectedSources`, issues);
        if (Array.isArray(asset.rejectedSources)) {
          asset.rejectedSources.forEach((source, index) => {
            requireObject(source, `species-assets-overrides.json.assets.${safeName}.sound.rejectedSources[${index}]`, issues);
            if (isObject(source)) requireString(source.key, `species-assets-overrides.json.assets.${safeName}.sound.rejectedSources[${index}].key`, issues);
          });
        }
      }
    }
  }
  return issues;
}

export function validateAssessmentMapSchema(value) {
  const issues = [];
  requireObject(value, "lastSavedAssessmentId.json", issues);
  if (!isObject(value)) return issues;
  for (const [safeName, assessmentId] of Object.entries(value)) {
    if (!(typeof assessmentId === "number" || (typeof assessmentId === "string" && assessmentId.trim()))) {
      issues.push(`lastSavedAssessmentId.json.${safeName} muss Zahl oder nicht leere Zeichenfolge sein.`);
    }
  }
  return issues;
}

export function validateMissingReportSchema(value) {
  const issues = [];
  requireObject(value, "fehlende_elemente_report.json", issues);
  if (!isObject(value)) return issues;
  requireObject(value.counts, "fehlende_elemente_report.json.counts", issues);
  requireObject(value.missing, "fehlende_elemente_report.json.missing", issues);
  requireArray(value.ncSoundLicensesAll, "fehlende_elemente_report.json.ncSoundLicensesAll", issues);
  if (isObject(value.counts)) {
    for (const [key, count] of Object.entries(value.counts)) {
      if (!Number.isInteger(count) || count < 0) issues.push(`fehlende_elemente_report.json.counts.${key} muss eine nicht negative Ganzzahl sein.`);
    }
  }
  if (isObject(value.missing)) {
    for (const [key, entries] of Object.entries(value.missing)) {
      requireArray(entries, `fehlende_elemente_report.json.missing.${key}`, issues);
    }
  }
  return issues;
}
