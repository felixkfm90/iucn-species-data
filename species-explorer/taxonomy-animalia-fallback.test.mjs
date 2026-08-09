import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { importAnimaliaFallbacks } from "./taxonomy-animalia-fallback.mjs";
import { readProviderSlice } from "./taxonomy-master-slices.mjs";

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "taxonomy-animalia-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, file: path.join(root, "animalia.json") };
}

async function write(file, updatedAt, entries) {
  await fs.writeFile(file, `${JSON.stringify({ schemaVersion: 1, updatedAt, entries }, null, 2)}\n`, "utf8");
}

test("Animalia ergänzt ausschließlich belegte Namen und Kennungen als letzte lokale Quelle", async (t) => {
  const value = await fixture(t);
  await write(value.file, "2026-08-08T10:00:00.000Z", [{
    scientificName: "Example animalis",
    germanName: "Beispieltier",
    englishName: "Example Animal",
    animaliaId: "example-animal",
    sourceUrl: "https://animalia.bio/example-animal",
    relevanceReasons: ["missing-name"],
  }]);
  const result = await importAnimaliaFallbacks({
    taxonomyRoot: value.root,
    fallbackPath: value.file,
  });
  assert.equal(result.recordCount, 1);
  const slice = await readProviderSlice(value.root, "animalia", result.providerVersion);
  assert.equal(slice.records[0].scientificName, "Example animalis");
  assert.deepEqual(slice.records[0].hierarchy, {});
  assert.equal(slice.records[0].selectedForMaster, true);
  assert.equal(slice.records[0].externalIds.animalia, "example-animal");
});

test("Animalia verwirft unbelegte oder fachlich ungeeignete Einträge", async (t) => {
  const value = await fixture(t);
  await write(value.file, "2026-08-08T10:00:00.000Z", [{
    scientificName: "Example animalis",
    germanName: "Beispieltier",
    sourceUrl: "https://example.org/example-animal",
  }]);
  await assert.rejects(
    importAnimaliaFallbacks({ taxonomyRoot: value.root, fallbackPath: value.file }),
    /animalia\.bio/,
  );
});

test("ein neuer kontrollierter Animalia-Stand markiert entfernte Fallbacks als veraltet", async (t) => {
  const value = await fixture(t);
  await write(value.file, "2026-08-08T10:00:00.000Z", [{
    scientificName: "Example animalis",
    germanName: "Beispieltier",
    animaliaId: "example-animal",
    sourceUrl: "https://animalia.bio/example-animal",
  }]);
  await importAnimaliaFallbacks({ taxonomyRoot: value.root, fallbackPath: value.file });
  await write(value.file, "2026-08-09T10:00:00.000Z", []);
  const result = await importAnimaliaFallbacks({ taxonomyRoot: value.root, fallbackPath: value.file });
  const slice = await readProviderSlice(value.root, "animalia", result.providerVersion);
  assert.equal(slice.records[0].versionChangeState, "removed");
  assert.equal(slice.manifest.activeRecordCount, 0);
});
