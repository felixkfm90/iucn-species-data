import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  latestProviderSliceVersion,
  legacySupplementsToProviderRecords,
  listProviderSliceVersions,
  readProviderSlice,
  writeProviderSlice,
} from "./taxonomy-master-slices.mjs";

const FIRST = "2026-07-01T10:00:00.000Z";
const SECOND = "2026-08-01T10:00:00.000Z";

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
