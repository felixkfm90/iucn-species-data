import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  createTaxonomyProviderRefreshService,
  taxonomyProviderRefreshInternals,
} from "./taxonomy-provider-refresh-service.mjs";
import { writeProviderSlice } from "./taxonomy-master-slices.mjs";

const NOW = new Date("2026-08-08T12:00:00.000Z");

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "taxonomy-provider-refresh-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const fallbackPath = path.join(root, "animalia.json");
  await fs.writeFile(fallbackPath, "{}\n", "utf8");
  return { root, fallbackPath };
}

function colStore() {
  return {
    status() {
      return { releaseId: "col-xr-2026-07-17" };
    },
  };
}

test("9.8 aktualisiert die lokalen Quellen in verbindlicher Reihenfolge", async (t) => {
  const { root, fallbackPath } = await fixture(t);
  const calls = [];
  const progress = [];
  const service = createTaxonomyProviderRefreshService({
    taxonomyRoot: root,
    repoRoot: root,
    animaliaFallbackPath: fallbackPath,
    supplementService: {
      async refreshKnown(options) {
        calls.push(["supplements", options.scientificNames]);
        options.onProgress({ current: 1, total: 1, message: "Anbieter geprüft" });
        return { warnings: ["Wikidata war kurzzeitig nicht erreichbar."] };
      },
    },
    async downloadInaturalist(options) {
      calls.push(["download", options.taxonomyRoot]);
      return {
        archivePath: path.join(root, "inaturalist.zip"),
        providerVersion: "inat-2026-08-01",
        downloadedAt: NOW.toISOString(),
      };
    },
    async importAnimalia(options) {
      calls.push(["animalia", options.fallbackPath]);
      return { providerVersion: "animalia-test", recordCount: 1, warning: "" };
    },
    now: () => NOW,
  });
  service.runInaturalistChild = async (options) => {
    calls.push(["inaturalist", options.providerVersion]);
    options.onProgress({ phase: "inaturalist", current: 1, total: 1, message: "Importiert" });
    return { providerVersion: options.providerVersion, recordCount: 4 };
  };

  const result = await service.refresh({
    projectTaxa: [{ scientificName: "Panthera pardus" }],
    corrections: [{ scientificName: "Sciurus vulgaris" }],
    researchedTaxa: [{ scientificName: "Coracias caudatus" }],
    store: colStore(),
    onProgress(entry) { progress.push(entry); },
  });

  const expectedVersion = taxonomyProviderRefreshInternals.combinedInaturalistVersion(
    "inat-2026-08-01",
    "col-xr-2026-07-17",
  );
  assert.deepEqual(calls.map(([name]) => name), [
    "download",
    "inaturalist",
    "supplements",
    "animalia",
  ]);
  assert.equal(calls[1][1], expectedVersion);
  assert.deepEqual(calls[2][1], [
    "Panthera pardus",
    "Sciurus vulgaris",
    "Coracias caudatus",
  ]);
  assert.deepEqual(result.warnings, ["Wikidata war kurzzeitig nicht erreichbar."]);
  assert.equal(progress.at(-1).current, 100);
  await service.close();
});

test("9.8 importiert denselben iNaturalist-Stand nur einmal je CoL-Version", async (t) => {
  const { root, fallbackPath } = await fixture(t);
  const combinedVersion = taxonomyProviderRefreshInternals.combinedInaturalistVersion(
    "inat-2026-08-01",
    "col-xr-2026-07-17",
  );
  await writeProviderSlice(root, {
    provider: "inaturalist",
    providerVersion: combinedVersion,
    retrievedAt: NOW.toISOString(),
    records: [],
  });
  let childRuns = 0;
  const service = createTaxonomyProviderRefreshService({
    taxonomyRoot: root,
    repoRoot: root,
    animaliaFallbackPath: fallbackPath,
    supplementService: {
      async refreshKnown() { return { warnings: [] }; },
    },
    async importAnimalia() { return { recordCount: 0, warning: "" }; },
    now: () => NOW,
  });
  service.runInaturalistChild = async () => {
    childRuns += 1;
    return {};
  };

  const result = await service.refresh({
    store: colStore(),
    inaturalistArchivePath: path.join(root, "inaturalist.zip"),
    inaturalistProviderVersion: "inat-2026-08-01",
  });

  assert.equal(childRuns, 0);
  assert.equal(result.inaturalist.skipped, true);
  assert.equal(result.inaturalist.providerVersion, combinedVersion);
  await service.close();
});
