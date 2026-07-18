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

test("Generiertes Schema akzeptiert optionalen Unterstamm nur als Text", () => {
  const completeEntry = {
    "Deutscher Name": "Amsel",
    "Wissenschaftlicher Name": "Turdus merula",
    URLSlug: "turdusmerula",
    Assetname: "Amsel",
    Gewicht: "ca. 100 g",
    Größe: "ca. 24 cm",
    Lebenserwartung: "ca. 3 Jahre",
    Status: "Least Concern",
    Kategorie: "Nicht gefährdet",
    Trend: "Zunehmend",
    Kingdom: "Animalia",
    Phylum: "Chordata",
    Subphylum: "Vertebrata",
    Class: "Aves",
    Order: "Passeriformes",
    Family: "Turdidae",
    Genus: "Turdus",
    Species: "merula",
    "Assessment ID": 123,
  };
  assert.deepEqual(validateSpeciesDataSchema([completeEntry]), []);
  assert.match(
    validateSpeciesDataSchema([{ ...completeEntry, Subphylum: 42 }]).join(" "),
    /Subphylum/,
  );
});

test("Override-Schema prüft manuelle Kennzeichnung und abgelehnte Soundquellen", () => {
  assert.deepEqual(validateAssetOverridesSchema({
    version: 1,
    assets: { Amsel: { sound: { manual: false, rejectedSources: [{ key: "xeno-canto:1" }] } } },
  }), []);
  const issues = validateAssetOverridesSchema({ version: 1, assets: { Amsel: { map: { manual: "ja" } } } });
  assert.match(issues.join(" "), /boolesch/);
});
