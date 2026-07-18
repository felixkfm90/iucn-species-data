import assert from "node:assert/strict";
import test from "node:test";
import {
  validateAssetOverridesSchema,
  validateSpeciesDataSchema,
  validateSpeciesListSchema,
} from "./data-schema.mjs";

test("Eingabe-Schema verlangt alle sechs manuellen Artfelder", () => {
  assert.deepEqual(validateSpeciesListSchema([{
    german: "Amsel",
    genus: "Turdus",
    species: "merula",
    size: "ca. 24 cm",
    weight: "ca. 100 g",
    life_expectancy: "ca. 3 Jahre",
  }]), []);
  assert.match(validateSpeciesListSchema([{ german: "Amsel" }]).join(" "), /genus/);
});

test("Generiertes Schema erkennt fehlende Kernfelder", () => {
  const issues = validateSpeciesDataSchema([{ URLSlug: "turdusmerula" }]);
  assert.ok(issues.some((issue) => issue.includes("Wissenschaftlicher Name")));
  assert.ok(issues.some((issue) => issue.includes("Assessment ID")));
});

test("Override-Schema prüft manuelle Kennzeichnung und abgelehnte Soundquellen", () => {
  assert.deepEqual(validateAssetOverridesSchema({
    version: 1,
    assets: { Amsel: { sound: { manual: false, rejectedSources: [{ key: "xeno-canto:1" }] } } },
  }), []);
  const issues = validateAssetOverridesSchema({ version: 1, assets: { Amsel: { map: { manual: "ja" } } } });
  assert.match(issues.join(" "), /boolesch/);
});
