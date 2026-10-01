import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { mergePartialProviderRecord } from "./taxonomy-partial-record.mjs";
import { taxonomyMasterServiceInternals } from "./taxonomy-master-service.mjs";
import { createStableMasterTaxonId } from "./taxonomy-master-model.mjs";

import {
  latestProviderSliceVersion,
  legacySupplementsToProviderRecords,
  listProviderSliceVersions,
  readProviderSlice,
  writeProviderSlice,
} from "./taxonomy-master-slices.mjs";

const FIRST = "2026-07-01T10:00:00.000Z";
const SECOND = "2026-08-01T10:00:00.000Z";

const fullRecord = (id = "4736", scientificName = "Ciconia nigra") => ({
  provider: "inaturalist", providerRecordId: id, scientificName, rank: "species", kingdom: "Animalia",
  hierarchy: { kingdom: "Animalia", family: "Ciconiidae" }, selectedForMaster: true,
  parentProviderRecordId: "4731", relevanceReasons: ["missing-name"], queryKeys: [scientificName],
  names: [{ name: "Schwarzstorch", language: "de", nameKind: "vernacular", preferred: true }],
});

test("Teil-Suchtreffer erhalten Aufnahme, Reich und Quellenfelder derselben Anbieter-ID", async (t) => {
  const root = await temporaryRoot(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await writeProviderSlice(root, { provider: "inaturalist", providerVersion: "before", retrievedAt: FIRST,
    records: [fullRecord(), fullRecord("other", "Ciconia ciconia")] });
  const incoming = { providerRecordId: "4736", scientificName: "Ciconia nigra", rank: "species",
    selectedForMaster: false, kingdom: "", hierarchy: {}, relevanceReasons: ["searched-taxon"],
    queryKeys: ["storch"], names: [{ name: "Black Stork", language: "en" }] };
  const result = await writeProviderSlice(root, { provider: "inaturalist", providerVersion: "after",
    retrievedAt: SECOND, records: [incoming], preserveUnmentioned: true });
  const row = result.records.find((record) => record.providerRecordId === "4736");
  assert.equal(row.selectedForMaster, true); assert.equal(row.kingdom, "Animalia");
  assert.equal(row.hierarchy.family, "Ciconiidae"); assert.equal(row.parentProviderRecordId, "4731");
  assert.deepEqual(row.relevanceReasons, ["searched-taxon", "missing-name"]);
  assert.equal(row.names.length, 2);
  assert.equal(createStableMasterTaxonId(row), createStableMasterTaxonId(fullRecord()));
  assert.equal(taxonomyMasterServiceInternals.activeMasterProviderSlices([result])[0].records.length, 2);
  assert.ok(result.manifest.partialMerges[0].retainedFields.includes("kingdom"));
  assert.equal(result.manifest.partialMerges[0].previousVersion, "before");
  assert.equal(result.manifest.partialMerges[0].previousRetrievedAt, FIRST);
  const reread = await readProviderSlice(root, "inaturalist", "after");
  assert.deepEqual(reread.records, result.records);
  const repeated = await writeProviderSlice(root, { provider: "inaturalist", providerVersion: "again",
    retrievedAt: "2026-08-02T10:00:00Z", records: [incoming], preserveUnmentioned: true });
  assert.equal(repeated.records[0].names.length, result.records[0].names.length);
  assert.equal(repeated.records.find((record) => record.providerRecordId === "4736").selectedForMaster, true);
});

test("Namens-, Rang- oder Reichswiderspruch in Teiltreffern schreibt keinen neuen Anbieterstand", async (t) => {
  const root = await temporaryRoot(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await writeProviderSlice(root, { provider: "inaturalist", providerVersion: "before", retrievedAt: FIRST, records: [fullRecord()] });
  const before = await readProviderSlice(root, "inaturalist", "before");
  for (const change of [{ scientificName: "Ciconia ciconia" }, { rank: "genus" }, { kingdom: "Plantae" }, { hierarchy: { kingdom: "Fungi" } }]) {
    await assert.rejects(writeProviderSlice(root, { provider: "inaturalist", providerVersion: "after", retrievedAt: SECOND,
      records: [{ ...fullRecord(), ...change }], preserveUnmentioned: true }), /Identität|Reich/);
    assert.deepEqual(await listProviderSliceVersions(root, "inaturalist"), ["before"]);
    assert.equal((await readProviderSlice(root, "inaturalist", "before")).manifest.checksumSha256, before.manifest.checksumSha256);
  }
});

test("Teiltreffer restaurieren entfernte Quellen nicht; Vollstände behalten ausdrückliche Änderungen", async (t) => {
  const root = await temporaryRoot(); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await writeProviderSlice(root, { provider: "inaturalist", providerVersion: "before", retrievedAt: FIRST, records: [fullRecord()] });
  const removed = await writeProviderSlice(root, { provider: "inaturalist", providerVersion: "removed", retrievedAt: SECOND,
    records: [{ ...fullRecord(), versionChangeState: "removed" }], preserveUnmentioned: true });
  assert.equal(removed.records[0].versionChangeState, "removed");
  const searched = await writeProviderSlice(root, { provider: "inaturalist", providerVersion: "search", retrievedAt: "2026-08-02T00:00:00Z",
    records: [fullRecord()], preserveUnmentioned: true });
  assert.equal(searched.records[0].versionChangeState, "removed");
  const restored = await writeProviderSlice(root, { provider: "inaturalist", providerVersion: "full", retrievedAt: "2026-08-03T00:00:00Z",
    records: [{ ...fullRecord(), selectedForMaster: false, hierarchy: {}, names: [], kingdom: "Plantae" }] });
  assert.equal(restored.records[0].versionChangeState, "restored");
  assert.equal(restored.records[0].selectedForMaster, false); assert.equal(restored.records[0].kingdom, "Plantae");
  assert.deepEqual(restored.records[0].hierarchy, {}); assert.deepEqual(restored.records[0].names, []);
});

test("Teilvereinigung bleibt ID-gebunden, unveränderlich und übernimmt ausdrücklich gelieferte Werte", () => {
  const before = fullRecord(), copy = structuredClone(before);
  assert.throws(() => mergePartialProviderRecord(before, { ...before, providerRecordId: "other" }), /Anbieter-ID/);
  const incoming = { ...before, hierarchy: { kingdom: "Metazoa", family: "New family" }, kingdom: "Metazoa",
    names: [{ ...before.names[0], preferred: false }] };
  const merged = mergePartialProviderRecord(before, incoming).record;
  assert.equal(merged.hierarchy.family, "New family"); assert.equal(merged.names[0].preferred, false);
  assert.deepEqual(before, copy);
});

async function temporaryRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "taxonomy-master-slices-"));
}

test("Anbieter-Ausschnitte bewahren Version, Provenienz und entfernte Datensätze", async () => {
  const root = await temporaryRoot();
  try {
    await writeProviderSlice(root, {
      provider: "GBIF",
      providerVersion: "2026-07",
      retrievedAt: FIRST,
      records: [{
        providerId: "5219404",
        scientificName: "Panthera pardus",
        rank: "species",
        kingdom: "Animalia",
        hierarchy: { family: "Felidae", genus: "Panthera" },
        names: [{ name: "Leopard", language: "de", nameKind: "vernacular" }],
        relevanceReasons: ["searched-taxon"],
      }, {
        providerId: "8211070",
        scientificName: "Sciurus vulgaris",
        rank: "species",
        kingdom: "Animalia",
        relevanceReasons: ["col-reference-gap", "project-species"],
      }],
    });
    const second = await writeProviderSlice(root, {
      provider: "gbif",
      providerVersion: "2026-08",
      retrievedAt: SECOND,
      records: [{
        providerId: "8211070",
        scientificName: "Sciurus vulgaris",
        rank: "species",
        kingdom: "Animalia",
        names: [{ name: "Eurasian Red Squirrel", language: "en", nameKind: "vernacular" }],
        relevanceReasons: ["col-reference-gap", "project-species"],
      }],
    });
    assert.deepEqual(await listProviderSliceVersions(root, "gbif"), ["2026-07", "2026-08"]);
    assert.equal(second.manifest.previousVersion, "2026-07");
    assert.equal(second.records.find((record) => record.providerRecordId === "8211070").versionChangeState, "changed");
    assert.equal(second.records.find((record) => record.providerRecordId === "5219404").versionChangeState, "removed");
    const reread = await readProviderSlice(root, "gbif", "2026-08");
    assert.equal(reread.manifest.checksumSha256, second.manifest.checksumSha256);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("der neueste Anbieterstand wird nach Abrufzeit statt Versionsname gewählt", async () => {
  const root = await temporaryRoot();
  try {
    await writeProviderSlice(root, {
      provider: "wikidata",
      providerVersion: "z-alter-stand",
      retrievedAt: FIRST,
      records: [],
    });
    await writeProviderSlice(root, {
      provider: "wikidata",
      providerVersion: "a-neuer-stand",
      retrievedAt: SECOND,
      records: [],
    });
    assert.equal(
      await latestProviderSliceVersion(root, "wikidata"),
      "a-neuer-stand",
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("alter Ergänzungscache wird wieder nach Anbieter getrennt", () => {
  const grouped = legacySupplementsToProviderRecords({
    updatedAt: FIRST,
    entries: [{
      scientificName: "Panthera pardus",
      sourceId: "4CGXR",
      kingdom: "Animalia",
      rank: "species",
      germanNames: [{ name: "Leopard", source: "Wikidata", providerId: "Q34706", checkedAt: FIRST }],
      englishNames: [{ name: "Leopard", source: "iNaturalist", providerId: "41970", checkedAt: FIRST }],
    }],
  });
  assert.deepEqual([...grouped.keys()].sort(), ["inaturalist", "wikidata"]);
  assert.equal(grouped.get("wikidata")[0].providerRecordId, "Q34706");
  assert.equal(grouped.get("inaturalist")[0].names[0].language, "en");
});
