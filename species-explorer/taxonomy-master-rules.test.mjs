import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseFieldAssertion,
  compareProviderRecord,
  deriveMasterStatuses,
  isExactTaxonMatch,
  mayCloseColReferenceGap,
  providerFieldPriority,
} from "./taxonomy-master-rules.mjs";

test("9.7 priorisiert manuelle und CoL-Werte ohne stille Überschreibung", () => {
  assert.equal(providerFieldPriority("manual", { fieldName: "german-name" }), 1_000);
  assert.equal(providerFieldPriority("catalogue-of-life", { fieldName: "rank" }), 800);
  assert.equal(
    providerFieldPriority("wikidata", { fieldName: "family" }),
    Number.NEGATIVE_INFINITY,
  );
  assert.equal(
    chooseFieldAssertion({
      current: {
        fieldName: "german-name",
        fieldValue: "Hausstorch",
        originKind: "source",
        provider: "inaturalist",
      },
      candidate: {
        fieldName: "german-name",
        fieldValue: "Weissstorch",
        originKind: "project",
        provider: "project",
      },
    }).action,
    "select",
  );
  assert.equal(
    chooseFieldAssertion({
      current: {
        fieldName: "german-name",
        fieldValue: "Gelbwangenamazone",
        originKind: "source",
        provider: "catalogue-of-life",
      },
      candidate: {
        fieldName: "german-name",
        fieldValue: "Rotstirnamazone",
        originKind: "manual",
        provider: "manual",
      },
    }).action,
    "select",
  );
  assert.equal(
    chooseFieldAssertion({
      current: {
        fieldName: "german-name",
        fieldValue: "Eisvogel",
        originKind: "manual",
        provider: "manual",
      },
      candidate: {
        fieldName: "german-name",
        fieldValue: "Blauvogel",
        originKind: "source",
        provider: "inaturalist",
      },
    }).action,
    "conflict",
  );
});

test("9.7 behandelt WoRMS nur bei marinen oder brackischen Taxa als Spezialquelle", () => {
  assert.equal(
    providerFieldPriority("worms", { fieldName: "family", environment: "marine" }),
    700,
  );
  assert.equal(
    providerFieldPriority("worms", { fieldName: "family", environment: "terrestrial" }),
    575,
  );
});

test("9.7 stuft eine Unterart niemals zur fehlenden Art hoch", () => {
  const species = { scientificName: "Sciurus vulgaris", rank: "species", kingdom: "Animalia" };
  const subspecies = {
    scientificName: "Sciurus vulgaris fuscoater",
    rank: "subspecies",
    kingdom: "Animalia",
  };
  assert.equal(isExactTaxonMatch(species, subspecies), false);
  assert.equal(mayCloseColReferenceGap(subspecies, species), false);
  assert.equal(mayCloseColReferenceGap(species, species), true);
});

test("9.7 markiert Quellenverluste als veraltet und erhält kombinierbare Status", () => {
  assert.equal(compareProviderRecord({ scientificName: "A", rank: "species" }, null), "removed");
  assert.deepEqual(deriveMasterStatuses({
    referenceGap: true,
    externalProviderCount: 3,
    conflictCount: 1,
    stale: true,
    manuallyProtected: true,
  }), [
    "col-reference-gap",
    "externally-confirmed",
    "conflicting",
    "stale",
    "manually-protected",
  ]);
});
