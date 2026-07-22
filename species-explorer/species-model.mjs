import { existsSync } from "node:fs";
import { join } from "node:path";

export const EDITABLE_NAME_FIELD = {
  key: "germanName",
  sourceKey: "german",
  label: "Deutscher Name",
  maxLength: 160,
};

export const EDITABLE_SCIENTIFIC_FIELD = {
  key: "scientificName",
  label: "Wissenschaftlicher Name",
  maxLength: 201,
};

export const EDITABLE_FIELD_DEFINITIONS = [
  { key: "size", sourceKey: "size", label: "Größe", maxLength: 240 },
  { key: "weight", sourceKey: "weight", label: "Gewicht", maxLength: 240 },
  {
    key: "lifeExpectancy",
    sourceKey: "life_expectancy",
    label: "Lebenserwartung",
    maxLength: 240,
  },
];

export const NEW_SPECIES_FIELD_DEFINITIONS = [
  { key: "german", label: "Deutscher Name", maxLength: 160 },
  { key: "scientificName", label: "Wissenschaftlicher Name", maxLength: 201 },
  ...EDITABLE_FIELD_DEFINITIONS.map((field) => ({
    key: field.key,
    label: field.label,
    maxLength: field.maxLength,
  })),
];

export function sanitizeAssetName(input) {
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

export function scientificKey(genus, species) {
  return `${genus ?? ""} ${species ?? ""}`.trim().toLocaleLowerCase("de");
}

export function valueOrUnknown(value) {
  if (value === null || value === undefined || value === "") return "Unbekannt";
  return value;
}

export function formatTaxonomyName(value) {
  const text = String(value ?? "").trim();
  if (!text || ["n/a", "unbekannt"].includes(text.toLocaleLowerCase("de"))) {
    return valueOrUnknown(value);
  }
  return text
    .toLocaleLowerCase("de")
    .replace(/(^|[\s-])([\p{L}])/gu, (_match, prefix, letter) => (
      `${prefix}${letter.toLocaleUpperCase("de")}`
    ));
}

export function publicPipelinePlan(plan) {
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
    pendingFileCount: plan.pendingFileCount ?? 0,
    pendingFiles: Array.isArray(plan.pendingFiles) ? plan.pendingFiles : [],
    pendingAssetSpeciesCount: plan.pendingAssetSpeciesCount ?? 0,
    pendingAssetSpecies: Array.isArray(plan.pendingAssetSpecies) ? plan.pendingAssetSpecies : [],
    affectedSpeciesCount: plan.affectedSpeciesCount ?? plan.targetCount,
    hasWork: plan.hasWork,
  };
}

export function publicCleanupPlan(plan) {
  return {
    mode: "cleanup",
    targetCount:
      plan.obsoleteData.length
      + plan.obsoleteAssetDirectories.length
      + plan.obsoleteAssessmentKeys.length
      + plan.obsoleteOverrideKeys.length
      + (plan.obsoleteTaxonomyOverrideKeys?.length ?? 0),
    obsoleteData: plan.obsoleteData,
    obsoleteAssetDirectories: plan.obsoleteAssetDirectories,
    obsoleteAssessmentKeys: plan.obsoleteAssessmentKeys,
    obsoleteOverrideKeys: plan.obsoleteOverrideKeys,
    obsoleteTaxonomyOverrideKeys: plan.obsoleteTaxonomyOverrideKeys ?? [],
    reclaimableBytes: plan.reclaimableBytes,
    hasWork: plan.hasWork,
  };
}

export function validateFieldValue(field, rawValue) {
  const value = String(rawValue ?? "").trim();
  const errors = [];
  if (!value) {
    errors.push(`${field.label} darf nicht leer sein`);
  } else if (value.length > field.maxLength) {
    errors.push(`${field.label} darf maximal ${field.maxLength} Zeichen lang sein`);
  } else if (/[\u0000-\u001F\u007F]/.test(value)) {
    errors.push(`${field.label} enthält unzulässige Steuerzeichen`);
  }
  return { value, errors };
}

export function normalizeScientificName(rawValue) {
  const value = String(rawValue ?? "").trim();
  const errors = [];
  const parts = value.split(/\s+/).filter(Boolean);
  if (!value) {
    errors.push(`${EDITABLE_SCIENTIFIC_FIELD.label} darf nicht leer sein`);
  } else if (value.length > EDITABLE_SCIENTIFIC_FIELD.maxLength) {
    errors.push(
      `${EDITABLE_SCIENTIFIC_FIELD.label} darf maximal ${EDITABLE_SCIENTIFIC_FIELD.maxLength} Zeichen lang sein`,
    );
  } else if (/[\u0000-\u001F\u007F]/.test(value)) {
    errors.push(`${EDITABLE_SCIENTIFIC_FIELD.label} enthält unzulässige Steuerzeichen`);
  } else if (
    parts.length !== 2
    || parts.some((part) => !/^[\p{L}][\p{L}-]*$/u.test(part))
  ) {
    errors.push(
      "Wissenschaftlicher Name muss genau aus Gattung und Art-Epitheton bestehen, zum Beispiel Turdus Merula",
    );
  } else if (parts.some((part) => part.length > 100)) {
    errors.push("Gattung und Art-Epitheton dürfen jeweils maximal 100 Zeichen lang sein");
  }
  if (errors.length || parts.length !== 2) {
    return {
      scientificName: value,
      genus: "",
      species: "",
      slug: "",
      errors,
    };
  }
  const [rawGenus, rawSpecies] = parts;
  const genus = rawGenus.charAt(0).toLocaleUpperCase("de") + rawGenus.slice(1).toLocaleLowerCase("de");
  const species = rawSpecies.toLocaleLowerCase("de");
  return {
    scientificName: `${genus} ${species}`,
    genus,
    species,
    slug: `${genus}${species}`.toLocaleLowerCase("de"),
    errors,
  };
}

export function validateEditableValues(payload, species = null) {
  const values = {};
  const errors = [];

  const germanName = validateFieldValue(
    EDITABLE_NAME_FIELD,
    payload && Object.hasOwn(payload, EDITABLE_NAME_FIELD.key)
      ? payload?.[EDITABLE_NAME_FIELD.key]
      : species?.germanName,
  );
  values.germanName = germanName.value;
  errors.push(...germanName.errors);

  const scientificName = normalizeScientificName(
    payload && Object.hasOwn(payload, EDITABLE_SCIENTIFIC_FIELD.key)
      ? payload?.[EDITABLE_SCIENTIFIC_FIELD.key]
      : species?.scientificName,
  );
  values.scientificName = scientificName.scientificName;
  values.genus = scientificName.genus;
  values.species = scientificName.species;
  values.slug = scientificName.slug;
  values.scientificNameUnlocked = payload?.scientificNameUnlocked === true;
  errors.push(...scientificName.errors);

  for (const field of EDITABLE_FIELD_DEFINITIONS) {
    const { value, errors: fieldErrors } = validateFieldValue(field, payload?.[field.key]);
    values[field.key] = value;
    errors.push(...fieldErrors);
  }

  return { values, errors };
}

export function validateNewSpeciesValues(payload) {
  const values = {};
  const errors = [];
  const fieldErrors = {};
  const addError = (fieldKey, message) => {
    errors.push(message);
    if (!fieldKey) return;
    fieldErrors[fieldKey] ??= [];
    fieldErrors[fieldKey].push(message);
  };

  for (const field of NEW_SPECIES_FIELD_DEFINITIONS) {
    const value = String(payload?.[field.key] ?? "").trim();
    if (!value) {
      addError(field.key, `${field.label} darf nicht leer sein`);
    } else if (value.length > field.maxLength) {
      addError(field.key, `${field.label} darf maximal ${field.maxLength} Zeichen lang sein`);
    } else if (/[\u0000-\u001F\u007F]/.test(value)) {
      addError(field.key, `${field.label} enthält unzulässige Steuerzeichen`);
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
    addError(
      "scientificName",
      "Wissenschaftlicher Name muss genau aus Gattung und Art-Epitheton bestehen, zum Beispiel Turdus Merula",
    );
  } else if (scientificParts.some((part) => part.length > 100)) {
    addError("scientificName", "Gattung und Art-Epitheton dürfen jeweils maximal 100 Zeichen lang sein");
  } else if (scientificParts.length === 2) {
    const [rawGenus, rawSpecies] = scientificParts;
    values.genus =
      rawGenus.charAt(0).toLocaleUpperCase("de") + rawGenus.slice(1).toLocaleLowerCase("de");
    values.species = rawSpecies.toLocaleLowerCase("de");
    values.scientificName = `${values.genus} ${values.species}`;
  }

  return { values, errors, fieldErrors };
}

export function buildNewSpeciesEntry(values) {
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

export function findNewSpeciesCollisions({ inputList, model, entry, derived, repoRoot }) {
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

export function findEditableSpecies(model, id) {
  return model.species.find((entry) => entry.id === id) ?? null;
}

export function findInputIndex(inputList, species) {
  const key = scientificKey(species.taxonomy.genus, species.taxonomy.species);
  return inputList.findIndex((entry) => scientificKey(entry.genus, entry.species) === key);
}

export function buildEditChanges(inputEntry, values) {
  const changes = [{
    field: EDITABLE_NAME_FIELD.label,
    key: EDITABLE_NAME_FIELD.key,
    before: valueOrUnknown(inputEntry[EDITABLE_NAME_FIELD.sourceKey]),
    after: values[EDITABLE_NAME_FIELD.key],
  }, {
    field: EDITABLE_SCIENTIFIC_FIELD.label,
    key: EDITABLE_SCIENTIFIC_FIELD.key,
    before: valueOrUnknown(`${inputEntry.genus ?? ""} ${inputEntry.species ?? ""}`.trim()),
    after: values.scientificName,
  }, {
    field: "URL-Slug",
    key: "urlSlug",
    before: valueOrUnknown(`${inputEntry.genus ?? ""}${inputEntry.species ?? ""}`.toLocaleLowerCase("de")),
    after: values.slug,
  }];
  changes.push(...EDITABLE_FIELD_DEFINITIONS
    .map((field) => ({
      field: field.label,
      key: field.key,
      before: valueOrUnknown(inputEntry[field.sourceKey]),
      after: values[field.key],
    }))
  );
  return changes
    .filter((change) => normalizeComparable(change.before) !== normalizeComparable(change.after));
}

export function editChangesRequirePipelineTransfer(changes) {
  const directRenameKeys = new Set([EDITABLE_NAME_FIELD.key, EDITABLE_SCIENTIFIC_FIELD.key, "urlSlug"]);
  return changes.some((change) => !directRenameKeys.has(change.key));
}

export function validateGermanRename({
  inputList,
  model,
  species,
  newGermanName,
  repoRoot,
  assetOverrides = { assets: {} },
  assessmentIds = {},
}) {
  const errors = [];
  const oldGermanName = String(species.germanName ?? "").trim();
  const nextGermanName = String(newGermanName ?? "").trim();
  const oldSafeName = species.safeName;
  const newSafeName = sanitizeAssetName(nextGermanName);
  const oldSafeKey = oldSafeName.toLocaleLowerCase("de");
  const newSafeKey = newSafeName.toLocaleLowerCase("de");
  const oldGermanKey = oldGermanName.toLocaleLowerCase("de");
  const newGermanKey = nextGermanName.toLocaleLowerCase("de");
  const currentScientificKey = scientificKey(species.taxonomy.genus, species.taxonomy.species);

  if (newGermanKey !== oldGermanKey) {
    const duplicateInput = inputList.find((entry) => (
      scientificKey(entry.genus, entry.species) !== currentScientificKey
      && String(entry.german ?? "").trim().toLocaleLowerCase("de") === newGermanKey
    ));
    if (duplicateInput) errors.push(`Deutscher Name ist bereits vorhanden: ${nextGermanName}`);

    const duplicateModel = model.species.find((entry) => (
      entry.id !== species.id
      && entry.germanName.trim().toLocaleLowerCase("de") === newGermanKey
    ));
    if (duplicateModel) errors.push(`Deutscher Name kollidiert mit bestehenden Daten: ${nextGermanName}`);
  }

  if (newSafeKey !== oldSafeKey) {
    const duplicateSafeName = model.species.find((entry) => (
      entry.id !== species.id && entry.safeName.toLocaleLowerCase("de") === newSafeKey
    ));
    if (duplicateSafeName) errors.push(`Assetname ist bereits vorhanden: ${newSafeName}`);

    const newAssetDirectory = join(repoRoot, "species-assets", newSafeName);
    if (existsSync(newAssetDirectory)) {
      errors.push(`Assetordner ist bereits vorhanden: species-assets/${newSafeName}`);
    }
    if (assetOverrides.assets?.[newSafeName]) {
      errors.push(`Assetpflege ist bereits vorhanden: ${newSafeName}`);
    }
    if (Object.hasOwn(assessmentIds, newSafeName)) {
      errors.push(`Assessment-Zuordnung ist bereits vorhanden: ${newSafeName}`);
    }
  }

  return [...new Set(errors)];
}

export function validateScientificRename({ inputList, model, species, values }) {
  const errors = [];
  const oldScientificKey = scientificKey(species.taxonomy.genus, species.taxonomy.species);
  const nextScientificKey = scientificKey(values.genus, values.species);
  const oldSlug = String(species.id ?? "").trim().toLocaleLowerCase("de");
  const newSlug = String(values.slug ?? "").trim().toLocaleLowerCase("de");

  if (nextScientificKey !== oldScientificKey) {
    const duplicateInput = inputList.find((entry) => (
      scientificKey(entry.genus, entry.species) !== oldScientificKey
      && scientificKey(entry.genus, entry.species) === nextScientificKey
    ));
    if (duplicateInput) errors.push(`Wissenschaftlicher Name ist bereits vorhanden: ${values.scientificName}`);

    const duplicateModel = model.species.find((entry) => (
      entry.id !== species.id
      && scientificKey(entry.taxonomy?.genus, entry.taxonomy?.species) === nextScientificKey
    ));
    if (duplicateModel) {
      errors.push(`Wissenschaftlicher Name kollidiert mit bestehenden Daten: ${values.scientificName}`);
    }
  }

  if (newSlug !== oldSlug) {
    const duplicateSlug = model.species.find((entry) => (
      entry.id !== species.id
      && String(entry.id ?? "").trim().toLocaleLowerCase("de") === newSlug
    ));
    if (duplicateSlug) errors.push(`URL-Slug ist bereits vorhanden: ${values.slug}`);
  }

  return [...new Set(errors)];
}

export function replaceReportSpeciesName(report, oldGermanName, newGermanName, oldSafeName, newSafeName) {
  if (!report || typeof report !== "object") return report;
  const replaceNames = (values) => Array.isArray(values)
    ? values.map((value) => (value === oldGermanName ? newGermanName : value))
    : values;
  if (report.missing && typeof report.missing === "object") {
    for (const key of ["soundMp3", "soundCredits", "maps", "assessmentId", "status", "category", "trend"]) {
      report.missing[key] = replaceNames(report.missing[key]);
    }
    if (Array.isArray(report.missing.speciesAssets)) {
      for (const entry of report.missing.speciesAssets) {
        if (entry?.german === oldGermanName) entry.german = newGermanName;
        if (entry?.safeName === oldSafeName) entry.safeName = newSafeName;
      }
    }
  }
  report.ncSoundLicensesAll = replaceNames(report.ncSoundLicensesAll);
  return report;
}

export function updateAssetMetadataNames(metadata, { germanName, scientificName }) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return metadata;
  if (germanName) {
    if (Object.hasOwn(metadata, "german_name")) metadata.german_name = germanName;
    if (Object.hasOwn(metadata, "germanName")) metadata.germanName = germanName;
  }
  if (scientificName) {
    if (Object.hasOwn(metadata, "scientific_name")) metadata.scientific_name = scientificName;
    if (Object.hasOwn(metadata, "scientificName")) metadata.scientificName = scientificName;
  }
  return metadata;
}

export function normalizeComparable(value) {
  return String(value ?? "").trim();
}

export function isMissingValue(value) {
  const normalized = normalizeComparable(value).toLocaleLowerCase("de");
  return !normalized || normalized === "n/a";
}

export function compareValues(label, inputValue, generatedValue) {
  if (normalizeComparable(inputValue) === normalizeComparable(generatedValue)) return null;
  return {
    field: label,
    input: valueOrUnknown(inputValue),
    generated: valueOrUnknown(generatedValue),
    message: `${label} weicht zwischen Eingabe und Pipeline-Ausgabe ab`,
  };
}

export function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
}

export function compareReportList(key, label, reportedValues, actualValues) {
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
