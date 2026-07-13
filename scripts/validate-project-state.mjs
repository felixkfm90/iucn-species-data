import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildExplorerModel } from "../species-explorer/server.mjs";

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

export async function validateProjectState(repoRoot = process.cwd()) {
  const errors = [];
  const [model, speciesList, speciesData, assessmentIds, overrides] = await Promise.all([
    buildExplorerModel(repoRoot),
    readJson(repoRoot, "species_list.json"),
    readJson(repoRoot, "speciesData.json"),
    readJson(repoRoot, "lastSavedAssessmentId.json"),
    readJson(repoRoot, "species-assets-overrides.json"),
  ]);

  if (!Array.isArray(speciesList)) errors.push("species_list.json ist kein Array.");
  if (!Array.isArray(speciesData)) errors.push("speciesData.json ist kein Array.");
  if (errors.length > 0) return result(model, errors);

  addDuplicateErrors(speciesList, (entry) => scientificKey(entry.genus, entry.species), "wissenschaftlicher Name", errors);
  addDuplicateErrors(speciesList, (entry) => normalized(entry.german), "deutscher Name", errors);
  addDuplicateErrors(speciesData, (entry) => normalized(entry.URLSlug), "URL-Slug", errors);
  addDuplicateErrors(speciesData, (entry) => scientificKey(entry.Genus, entry.Species), "generierter wissenschaftlicher Name", errors);

  if (model.validation.status !== "ok") {
    errors.push(`Explorer-Validierung meldet ${model.validation.issueCount} Problem(e).`);
    for (const species of model.species.filter((entry) => entry.inconsistencies.length > 0)) {
      errors.push(`${species.germanName}: ${species.inconsistencies.join("; ")}`);
    }
    for (const issue of model.validation.report.counterIssues ?? []) errors.push(`Report: ${issue}`);
    for (const check of model.validation.report.checks ?? []) {
      if (!check.ok) errors.push(`Report: ${check.label ?? check.key ?? "Listenabweichung"}`);
    }
  }

  const knownSafeNames = new Set(model.species.map((entry) => entry.safeName));
  for (const safeName of Object.keys(overrides?.assets ?? {})) {
    if (!knownSafeNames.has(safeName)) errors.push(`Verwaister Override-Eintrag: ${safeName}`);
  }
  for (const safeName of Object.keys(assessmentIds ?? {})) {
    if (!knownSafeNames.has(safeName)) errors.push(`Verwaiste Assessment-Zuordnung: ${safeName}`);
  }
  for (const species of model.species) {
    if (species.isManualMap) continue;
    const expectedAssessment = Number(species.iucn.assessmentId);
    const trackedAssessment = Number(assessmentIds?.[species.safeName]);
    if (!Number.isFinite(expectedAssessment) || expectedAssessment <= 0) continue;
    if (trackedAssessment !== expectedAssessment) {
      errors.push(
        `${species.germanName}: Assessment-Zuordnung ${assessmentIds?.[species.safeName] ?? "fehlt"} statt ${expectedAssessment}.`,
      );
    }
  }

  return result(model, errors);
}

function result(model, errors) {
  return {
    ok: errors.length === 0,
    counts: {
      species: model?.summary?.speciesCount ?? 0,
      input: model?.summary?.inputCount ?? 0,
      generated: model?.summary?.generatedCount ?? 0,
      knownMissingSounds: model?.summary?.missingSoundKnownCount ?? 0,
      ncSounds: model?.summary?.ncSoundCount ?? 0,
      manualMaps: model?.summary?.manualMapCount ?? 0,
    },
    errors,
  };
}

function addDuplicateErrors(entries, selector, label, errors) {
  const seen = new Map();
  for (const entry of entries) {
    const key = selector(entry);
    if (!key) {
      errors.push(`Leerer Schlüssel für ${label}.`);
      continue;
    }
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of seen) {
    if (count > 1) errors.push(`Doppelter ${label}: ${key} (${count} Einträge).`);
  }
}

function scientificKey(genus, species) {
  return normalized(`${genus ?? ""} ${species ?? ""}`);
}

function normalized(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("de");
}

async function readJson(repoRoot, relativePath) {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), "utf8"));
}

if (isCli) {
  const repoRootArg = process.argv.find((arg) => arg.startsWith("--repo-root="));
  const repoRoot = path.resolve(repoRootArg ? repoRootArg.slice("--repo-root=".length) : process.cwd());
  const report = await validateProjectState(repoRoot);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
