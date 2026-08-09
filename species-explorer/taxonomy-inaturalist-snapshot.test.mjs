import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { importInaturalistTaxonomySnapshot } from "./taxonomy-inaturalist-snapshot.mjs";
import { readProviderSlice } from "./taxonomy-master-slices.mjs";
import { loadNodeSqlite } from "./taxonomy-storage.mjs";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "taxonomy-inat-snapshot-"));
  const packageDirectory = path.join(root, "package");
  const taxonomyRoot = path.join(root, "taxonomy");
  const workRoot = path.join(root, "work");
  const colDatabasePath = path.join(root, "col.sqlite");
  await fs.mkdir(packageDirectory, { recursive: true });
  await fs.writeFile(path.join(packageDirectory, "taxa.csv"), [
    "id,taxonID,identifier,parentNameUsageID,kingdom,phylum,class,order,family,genus,specificEpithet,infraspecificEpithet,modified,scientificName,taxonRank,references",
    "1,https://www.inaturalist.org/taxa/1,,10,Animalia,Chordata,Mammalia,Carnivora,Felidae,Panthera,leo,,2026-01-01T00:00:00Z,Panthera leo,species,",
    "2,https://www.inaturalist.org/taxa/2,,20,Animalia,Chordata,Mammalia,Rodentia,Sciuridae,Sciurus,vulgaris,,2026-01-01T00:00:00Z,Sciurus vulgaris,species,",
    "3,https://www.inaturalist.org/taxa/3,,30,Animalia,Chordata,Aves,Coraciiformes,Coraciidae,Coracias,caudatus,,2026-01-01T00:00:00Z,Coracias caudatus,species,",
    "4,https://www.inaturalist.org/taxa/4,,20,Animalia,Chordata,Mammalia,Rodentia,Sciuridae,Sciurus,vulgaris,alpinus,2026-01-01T00:00:00Z,Sciurus vulgaris alpinus,subspecies,",
    "5,https://www.inaturalist.org/taxa/5,,10,Animalia,Chordata,Mammalia,Carnivora,Felidae,Panthera,pardus,,2026-01-01T00:00:00Z,Panthera pardus,species,",
  ].join("\n"), "utf8");
  await fs.writeFile(path.join(packageDirectory, "VernacularNames-german.csv"), [
    "id,vernacularName,language,locality,countryCode,source,lexicon,contributor,created",
    "1,Löwe,de,Germany,DE,source,German,,2026-01-01T00:00:00Z",
    "2,Eurasisches Eichhörnchen,de,Germany,DE,source,German,,2026-01-01T00:00:00Z",
    "3,Gabelracke,de,Germany,DE,source,German,,2026-01-01T00:00:00Z",
    "5,Leopard,de,Germany,DE,source,German,,2026-01-01T00:00:00Z",
  ].join("\n"), "utf8");
  await fs.writeFile(path.join(packageDirectory, "VernacularNames-english.csv"), [
    "id,vernacularName,language,locality,countryCode,source,lexicon,contributor,created",
    "2,Red Squirrel,en,,,source,English,,2026-01-01T00:00:00Z",
    "3,Lilac-breasted Roller,en,,,source,English,,2026-01-01T00:00:00Z",
    "5,Leopard,en,,,source,English,,2026-01-01T00:00:00Z",
  ].join("\n"), "utf8");
  const { DatabaseSync } = await loadNodeSqlite();
  const database = new DatabaseSync(colDatabasePath);
  database.exec(`
    CREATE TABLE taxon (
      id INTEGER PRIMARY KEY,
      scientific_name TEXT NOT NULL
    );
    CREATE TABLE search_term (
      taxon_id INTEGER NOT NULL,
      kingdom TEXT,
      term_type TEXT,
      normalized TEXT,
      language TEXT
    );
    CREATE INDEX search_identity_idx
      ON search_term(kingdom, term_type, normalized);
  `);
  database.exec(`
    INSERT INTO taxon (id, scientific_name)
    VALUES (1, 'Panthera leo'), (2, 'Panthera pardus');
  `);
  const insertSearchTerm = database.prepare(`
    INSERT INTO search_term (taxon_id, kingdom, term_type, normalized, language)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertSearchTerm.run(1, "Animalia", "accepted_scientific", "panthera leo", "");
  insertSearchTerm.run(1, "Animalia", "vernacular", "löwe", "de");
  insertSearchTerm.run(2, "Animalia", "accepted_scientific", "panthera pardus", "");
  insertSearchTerm.run(2, "Animalia", "vernacular", "leopard", "en");
  database.close();
  return { root, packageDirectory, taxonomyRoot, workRoot, colDatabasePath };
}

test("iNaturalist snapshot stores CoL species and name gaps as a versioned offline slice", async () => {
  const value = await fixture();
  try {
    const result = await importInaturalistTaxonomySnapshot({
      taxonomyRoot: value.taxonomyRoot,
      colDatabasePath: value.colDatabasePath,
      packageDirectory: value.packageDirectory,
      providerVersion: "inat-fixture-2026-01-01",
      retrievedAt: "2026-01-02T00:00:00.000Z",
      workRoot: value.workRoot,
      batchSize: 2,
    });
    assert.equal(result.acceptedSpecies, 4);
    assert.equal(result.colGapSpecies, 2);
    assert.equal(result.nameSupplementSpecies, 1);
    const slice = await readProviderSlice(
      value.taxonomyRoot,
      "inaturalist",
      "inat-fixture-2026-01-01",
    );
    assert.deepEqual(
      slice.records.map((entry) => entry.scientificName),
      ["Coracias caudatus", "Panthera pardus", "Sciurus vulgaris"],
    );
    const squirrel = slice.records.find((entry) => entry.scientificName === "Sciurus vulgaris");
    assert.equal(squirrel.selectedForMaster, true);
    assert.deepEqual(squirrel.relevanceReasons, ["col-reference-gap"]);
    assert.equal(squirrel.externalIds.inaturalist, "2");
    assert.equal(squirrel.hierarchy.family, "Sciuridae");
    assert.deepEqual(
      squirrel.names.map((entry) => [entry.language, entry.name]),
      [["de", "Eurasisches Eichhörnchen"], ["en", "Red Squirrel"]],
    );
    const leopard = slice.records.find((entry) => entry.scientificName === "Panthera pardus");
    assert.equal(leopard.colTaxonId, "2");
    assert.deepEqual(leopard.relevanceReasons, ["missing-name"]);
    assert.deepEqual(
      leopard.names.map((entry) => [entry.language, entry.name]),
      [["de", "Leopard"]],
    );
    assert.deepEqual(await fs.readdir(value.workRoot), []);
  } finally {
    await fs.rm(value.root, { recursive: true, force: true });
  }
});

test("iNaturalist snapshot import can be cancelled before any provider version is activated", async () => {
  const value = await fixture();
  try {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      importInaturalistTaxonomySnapshot({
        taxonomyRoot: value.taxonomyRoot,
        colDatabasePath: value.colDatabasePath,
        packageDirectory: value.packageDirectory,
        providerVersion: "aborted",
        workRoot: value.workRoot,
        signal: controller.signal,
      }),
      { name: "AbortError" },
    );
    await assert.rejects(
      fs.access(path.join(value.taxonomyRoot, "master", "providers", "inaturalist")),
      { code: "ENOENT" },
    );
  } finally {
    await fs.rm(value.root, { recursive: true, force: true });
  }
});
