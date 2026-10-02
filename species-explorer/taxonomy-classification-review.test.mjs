import assert from "node:assert/strict";
import { test } from "node:test";
import { classificationReviewCase, normalizeColIdentifiers, summarizeClassificationReview } from "./taxonomy-classification-review.mjs";
import { taxonomyMasterCandidateInternals } from "./taxonomy-master-candidate.mjs";

const sources = [{ masterTaxonId: `mtx_${"1".repeat(32)}`, scientificName: "Testus classificatus", rank: "species", kingdom: "Bacteria",
  evidence: [{ provider: "inaturalist", providerVersion: "fixture-1", providerRecordId: "101" }] }];
function example(identifiers, overrides = {}) {
  return classificationReviewCase({ sources,
    records: [{ providerRecordId: "col-1", identifiers: identifiers.map((identifier) => ({ type: "inat", identifier })) }],
    target: { scientificName: "Testus classificatus", rank: "species", kingdom: "Bacillati" },
    baseVersion: "fixture-master-1", colVersion: "fixture-col-2", ...overrides });
}

test("Klassifikationsprüfung unterscheidet passende, abweichende, fehlende und mehrdeutige Quellen-IDs", () => {
  for (const [ids, category] of [ [["inat:101"], "matching-provider-id"], [["inat:202"], "different-provider-id"],
    [[], "missing-provider-id"], [["inat:101", "inat:202"], "ambiguous-provider-id"],
    [["inat:101", "invalid"], "ambiguous-provider-id"], [["inat:101", ""], "ambiguous-provider-id"] ]) {
    assert.equal(example(ids).category, category);
  }
  assert.equal(example(["101", "inat:101", "inat:101"]).category, "matching-provider-id");
  assert.equal(example(["inat:101"], { sources: [...sources, { ...sources[0], masterTaxonId: `mtx_${"2".repeat(32)}` }] }).category, "ambiguous-provider-id");
  assert.equal(example(["inat:101"], { sources: [{ ...sources[0], evidence: [] }] }).category, "missing-provider-id");
  assert.equal(example(["inat:101"], { records: [{ providerRecordId: "col-1", identifiers: [{ type: "inat", identifier: "inat:101" }] },
    { providerRecordId: "col-2", identifiers: [{ type: "inat", identifier: "inat:101" }] }] }).category, "ambiguous-provider-id");
});

test("CoL-Normalisierung verliert keine mehrfachen oder widersprüchlichen ID-Verweise", () => {
  const raw = { scientificName: "Testus classificatus", identifiers: [
    { identifier_type: "inat", identifier: "inat:202" }, { identifier_type: "inat", identifier: "inat:101" },
  ], externalIds: { inaturalist: "303", gbif: "400" } };
  const normalized = taxonomyMasterCandidateInternals.normalizeColRecord(raw);
  assert.equal(normalized.identifiers.length, 4);
  assert.equal(example([], { records: [normalized] }).category, "ambiguous-provider-id");
  assert.deepEqual(normalizeColIdentifiers(normalized), normalizeColIdentifiers(raw));
});

test("Fallrevision bindet Quellen, Master, Zielreich und sämtliche Verweise unabhängig von ihrer Reihenfolge", () => {
  const first = example(["inat:202", "inat:101"]);
  assert.equal(first.revision, example(["inat:101", "inat:202"]).revision);
  for (const options of [ { colVersion: "changed" }, { baseVersion: "changed" },
    { target: { ...first.target, kingdom: "Plantae" } },
    { sources: [{ ...sources[0], evidence: [{ ...sources[0].evidence[0], providerVersion: "changed" }] }] } ]) {
    assert.notEqual(first.revision, example(["inat:101", "inat:202"], options).revision);
  }
});

test("gebündelte Übersicht bleibt begrenzt und zählt Fälle statt Quellzeilen", () => {
  const cases = Array.from({ length: 2173 }, (_, index) => example(index < 1693 ? ["inat:101"] : []));
  const summary = summarizeClassificationReview(cases);
  assert.equal(summary.total, 2173);
  assert.equal(summary.matchingProviderId, 1693);
  assert.equal(summary.missingProviderId, 480);
  assert.equal(summary.acceptanceAvailable, true);
  assert.equal(summary.changesPhotos, false);
  assert.equal(summary.requiresConfirmation, true);
  assert.ok(summary.groups.every((group) => group.examples.length <= 2));
  assert.equal(summary.revision, summarizeClassificationReview(cases.reverse()).revision);
  assert.deepEqual(summary, summarizeClassificationReview(cases));
});
