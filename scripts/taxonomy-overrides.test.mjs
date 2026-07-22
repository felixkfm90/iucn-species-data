import assert from "node:assert/strict";
import test from "node:test";

import {
  applyTaxonomyOverride,
  createEmptyTaxonomyOverrideRegistry,
  normalizeTaxonomyFields,
  synchronizeAutomaticTaxonomyFields,
  validateTaxonomyOverrideRegistry,
} from "./taxonomy-overrides.mjs";

test("normalisiert Taxonomiewerte und erlaubt leeren Unterstamm", () => {
  assert.deepEqual(normalizeTaxonomyFields({
    Kingdom: "ANIMALIA",
    Phylum: "chordata",
    Subphylum: "",
    Class: "mammalia",
    Order: "CARNIVORA",
    Family: "felidae",
  }), {
    Kingdom: "Animalia",
    Phylum: "Chordata",
    Subphylum: "",
    Class: "Mammalia",
    Order: "Carnivora",
    Family: "Felidae",
  });
});

test("wendet einen Override anhand des URL-Slugs an", () => {
  const entry = {
    URLSlug: "pantheraleo",
    Kingdom: "Animalia",
    Phylum: "Chordata",
    Subphylum: "Vertebrata",
    Class: "Mammalia",
    Order: "Carnivora",
    Family: "Felidae",
  };
  const registry = {
    version: 1,
    species: {
      pantheraleo: {
        fields: { ...normalizeTaxonomyFields(entry), Family: "Katzen" },
        automaticFields: normalizeTaxonomyFields(entry),
        reason: "Deutsche Anzeige korrigiert",
        updatedAt: "2026-07-22T00:00:00.000Z",
      },
    },
  };
  assert.equal(applyTaxonomyOverride(entry, registry).Family, "Katzen");
  assert.deepEqual(validateTaxonomyOverrideRegistry(registry), []);
});

test("aktualisiert die gemerkten Automatikwerte bei einem neuen Pipeline-Lauf", () => {
  const registry = createEmptyTaxonomyOverrideRegistry();
  registry.species.pantheraleo = {
    fields: normalizeTaxonomyFields({
      Kingdom: "Animalia", Phylum: "Chordata", Class: "Mammalia", Order: "Carnivora", Family: "Katzen",
    }),
    automaticFields: normalizeTaxonomyFields({
      Kingdom: "Animalia", Phylum: "Chordata", Class: "Mammalia", Order: "Carnivora", Family: "Felidae",
    }),
    reason: "Anzeige korrigiert",
    updatedAt: "2026-07-22T00:00:00.000Z",
  };
  const entry = {
    URLSlug: "pantheraleo",
    Kingdom: "Animalia",
    Phylum: "Chordata",
    Subphylum: "Vertebrata",
    Class: "Mammalia",
    Order: "Carnivora",
    Family: "Felinae",
  };
  const result = synchronizeAutomaticTaxonomyFields([entry], registry);
  assert.equal(result.changed, true);
  assert.equal(result.registry.species.pantheraleo.automaticFields.Family, "Felinae");
  assert.equal(applyTaxonomyOverride(entry, result.registry).Family, "Katzen");
});
