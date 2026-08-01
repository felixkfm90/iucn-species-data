import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  germanTaxonomyDisplayName,
  taxonomyHierarchyDisplayEntry,
} from "./taxonomy-display-names.mjs";
import { createTaxonomySupplementService } from "./taxonomy-supplement-service.mjs";
import {
  listProviderSliceVersions,
  readProviderSlice,
} from "./taxonomy-master-slices.mjs";

function mockTaxon(scientificName) {
  if (String(scientificName).toLocaleLowerCase("en") !== "panthera pardus") return null;
  return {
    taxonId: "col:panthera-pardus",
    acceptedScientificName: "Panthera pardus",
    kingdom: {
      scientificName: "Animalia",
      label: "Tiere",
    },
    rank: "species",
    status: "accepted",
    trustTier: "base",
    germanName: null,
    germanNames: [],
    englishName: null,
    englishNames: [],
  };
}

function mockStore() {
  return {
    findTaxonByScientificName: mockTaxon,
  };
}

async function temporaryService(context, {
  providers,
  now = () => new Date("2026-07-30T10:00:00.000Z"),
  corrections = { schemaVersion: 1, entries: [] },
} = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "taxonomy-supplements-"));
  const taxonomyRoot = path.join(root, "taxonomy");
  const correctionsPath = path.join(root, "corrections.json");
  await fs.mkdir(taxonomyRoot, { recursive: true });
  await fs.writeFile(correctionsPath, `${JSON.stringify(corrections, null, 2)}\n`, "utf8");
  const service = createTaxonomySupplementService({
    taxonomyRoot,
    correctionsPath,
    providers,
    now,
  });
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  return {
    service,
    taxonomyRoot,
    correctionsPath,
    cachePath: path.join(taxonomyRoot, "supplements.json"),
  };
}

function leopardProvider() {
  return [{
    scientificName: "Panthera pardus",
    germanName: "Leopard",
    englishName: "Leopard",
    source: "iNaturalist",
    providerId: "41970",
    confidence: 0.86,
    rank: "species",
    kingdom: "Animalia",
    hierarchy: {
      kingdom: "Animalia",
      family: "Felidae",
      genus: "Panthera",
      species: "Panthera pardus",
    },
    externalIds: { inaturalist: "41970" },
  }];
}

test("Suchergänzungen bewahren CoL als Basis und markieren keinen Vollabgleich", async (context) => {
  const { service } = await temporaryService(context, {
    providers: [leopardProvider],
  });

  const enrichment = await service.enrichQuery({
    query: "Leopard",
    kind: "vernacular",
    language: "de",
    kingdoms: ["Animalia"],
    store: mockStore(),
  });
  assert.equal(enrichment.refreshed, true);
  assert.equal(enrichment.imported, 1);

  const status = await service.status();
  assert.equal(status.entryCount, 1);
  assert.equal(status.providerRecordCount, 1);
  assert.equal(status.stale, true);
  assert.equal(status.lastFullRefreshAt, "");

  const results = await service.search({
    query: "Leopard",
    kind: "vernacular",
    language: "de",
    kingdoms: ["Animalia"],
    rank: "species",
    store: mockStore(),
    online: false,
  });
  assert.equal(results[0].acceptedScientificName, "Panthera pardus");
  assert.equal(results[0].germanName, "Leopard");
  assert.equal(results[0].source, "iNaturalist");
});

test("vollständiger Ergänzungsabgleich setzt einen eigenen Aktualisierungszeitpunkt", async (context) => {
  const { service, taxonomyRoot } = await temporaryService(context, {
    providers: [leopardProvider],
  });
  const result = await service.refreshKnown({
    scientificNames: ["Panthera pardus"],
    store: mockStore(),
  });

  assert.equal(result.targetCount, 1);
  assert.equal(result.refreshedTargets, 1);
  assert.equal(result.preservedTargets, 0);
  assert.equal(result.status.stale, false);
  assert.equal(result.status.lastFullRefreshAt, "2026-07-30T10:00:00.000Z");
  assert.equal(result.providerSliceCount, 1);
  const versions = await listProviderSliceVersions(taxonomyRoot, "inaturalist");
  assert.equal(versions.length, 1);
  const slice = await readProviderSlice(taxonomyRoot, "inaturalist", versions[0]);
  assert.equal(slice.records[0].scientificName, "Panthera pardus");
  assert.equal(slice.records[0].hierarchy.family, "Felidae");
  assert.equal(slice.records[0].externalIds.inaturalist, "41970");
});

test("CoL-Referenzlücken bleiben als versionierte Anbieter-Ausschnitte erhalten", async (context) => {
  const gapProvider = async function searchGbifTaxa() {
    return [{
      scientificName: "Sciurus vulgaris",
      germanName: "Eurasisches Eichhörnchen",
      englishName: "Eurasian red squirrel",
      source: "GBIF",
      providerId: "5219535",
      confidence: 0.9,
      rank: "species",
      kingdom: "Animalia",
      hierarchy: { family: "Sciuridae", genus: "Sciurus" },
      externalIds: { gbif: "5219535" },
    }];
  };
  const { service, taxonomyRoot } = await temporaryService(context, {
    providers: [gapProvider],
  });

  const result = await service.refreshKnown({
    scientificNames: ["Sciurus vulgaris"],
    store: mockStore(),
  });
  assert.equal(result.imported, 1);
  assert.equal(result.status.entryCount, 0);
  assert.equal(result.status.providerRecordCount, 1);
  const versions = await listProviderSliceVersions(taxonomyRoot, "gbif");
  const slice = await readProviderSlice(taxonomyRoot, "gbif", versions[0]);
  assert.deepEqual(slice.records[0].relevanceReasons.sort(), [
    "col-reference-gap",
    "project-species",
    "searched-taxon",
  ]);
  assert.equal(slice.records[0].names[0].name, "Eurasisches Eichhörnchen");
});

test("Ausfall aller Quellen überschreibt den letzten funktionierenden Cache nicht", async (context) => {
  let currentTime = new Date("2026-07-20T10:00:00.000Z");
  const { service, cachePath } = await temporaryService(context, {
    providers: [leopardProvider],
    now: () => currentTime,
  });
  await service.refreshKnown({
    scientificNames: ["Panthera pardus"],
    store: mockStore(),
  });
  const before = await fs.readFile(cachePath, "utf8");

  service.providers = [
    async function searchINaturalistTaxa() {
      throw new Error("simulierter Netzausfall");
    },
  ];
  currentTime = new Date("2026-07-30T10:00:00.000Z");
  const result = await service.refreshKnown({
    scientificNames: ["Panthera pardus"],
    store: mockStore(),
  });
  const after = await fs.readFile(cachePath, "utf8");

  assert.equal(result.refreshedTargets, 0);
  assert.equal(result.preservedTargets, 1);
  assert.equal(result.preservedPreviousCache, true);
  assert.match(result.warnings[0], /iNaturalist: simulierter Netzausfall/);
  assert.equal(after, before);
  assert.equal(result.status.stale, true);
});

test("eigene Korrekturen überlagern Ergänzungsquellen und sind zurücksetzbar", async (context) => {
  const { service, correctionsPath } = await temporaryService(context, {
    providers: [],
  });
  await service.saveCorrection({
    scientificName: "Panthera pardus",
    germanName: "Leopard",
    englishName: "Leopard",
    note: "Geprüfter Eigenname",
  });
  const results = await service.search({
    query: "Leopard",
    kind: "vernacular",
    language: "de",
    kingdoms: ["Animalia"],
    rank: "species",
    store: mockStore(),
    online: false,
  });
  assert.equal(results[0].source, "Eigene Korrektur");
  assert.equal(results[0].germanName, "Leopard");

  const stored = JSON.parse(await fs.readFile(correctionsPath, "utf8"));
  assert.equal(stored.entries[0].note, "Geprüfter Eigenname");
  assert.deepEqual(await service.resetCorrection("Panthera pardus"), { removed: true });
  assert.equal((await service.search({
    query: "Leopard",
    kind: "vernacular",
    language: "de",
    kingdoms: ["Animalia"],
    rank: "species",
    store: mockStore(),
    online: false,
  })).length, 0);
});

test("eigene Korrekturen werden auch ohne UI serverseitig begrenzt", async (context) => {
  const { service } = await temporaryService(context, {
    providers: [],
  });
  await assert.rejects(
    service.saveCorrection({
      scientificName: "Panthera pardus",
      germanName: "L".repeat(121),
    }),
    /höchstens 120 Zeichen/,
  );
  await assert.rejects(
    service.saveCorrection({
      scientificName: "Panthera pardus",
      germanName: "Leopard",
      note: "N".repeat(241),
    }),
    /höchstens 240 Zeichen/,
  );
  await assert.rejects(
    service.resetCorrection(""),
    /wissenschaftliche Name fehlt/,
  );
});

test("deutsche Hierarchienamen bleiben zentrale Anzeigeergänzungen", () => {
  assert.equal(germanTaxonomyDisplayName("kingdom", "Animalia"), "Tiere");
  assert.deepEqual(
    taxonomyHierarchyDisplayEntry({
      rank: "family",
      scientific_name: "Felidae",
    }),
    {
      rank: "family",
      scientific_name: "Felidae",
      scientificName: "Felidae",
      germanName: "Katzen",
      displayName: "Katzen",
    },
  );
});
