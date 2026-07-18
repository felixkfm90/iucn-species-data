import fs from "node:fs";
import path from "node:path";
import {
  validateAssessmentMapSchema,
  validateAssetOverridesSchema,
  validateMissingReportSchema,
  validateSpeciesDataSchema,
  validateSpeciesListSchema,
} from "./data-schema.mjs";

const validators = Object.freeze([
  ["species_list.json", validateSpeciesListSchema],
  ["speciesData.json", validateSpeciesDataSchema],
  ["species-assets-overrides.json", validateAssetOverridesSchema],
  ["lastSavedAssessmentId.json", validateAssessmentMapSchema],
  ["fehlende_elemente_report.json", validateMissingReportSchema],
]);

export function validateRepositoryDataSchemas(repoRoot = process.cwd()) {
  const issues = [];
  for (const [relativePath, validate] of validators) {
    const absolutePath = path.join(repoRoot, relativePath);
    try {
      const value = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
      issues.push(...validate(value));
    } catch (error) {
      issues.push(`${relativePath} konnte nicht als JSON gelesen werden: ${error.message}`);
    }
  }
  return issues;
}

const issues = validateRepositoryDataSchemas();
if (issues.length) {
  console.error(`Datenschema-Prüfung fehlgeschlagen: ${issues.length} Problem(e).`);
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exitCode = 1;
} else {
  console.log("Datenschema-Prüfung bestanden: fünf zentrale JSON-Datenbestände entsprechen den Projektverträgen.");
}
