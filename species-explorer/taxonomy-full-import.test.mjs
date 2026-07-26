import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { importFullTaxonomyRelease } from "./taxonomy-full-import.mjs";
import {
  compareProjectSpeciesWithTaxonomyRelease,
  readProjectTaxonomyConflictReport,
  taxonomyProjectConflictInternals,
} from "./taxonomy-project-conflicts.mjs";
import { validateTaxonomyPackage } from "./taxonomy-package.mjs";
import {
  activateTaxonomyRelease,
  readActiveTaxonomyPointer,
} from "./taxonomy-storage.mjs";
import {
  iterateTaxonomyTsv,
  parseTaxonomyTsvHeaders,
} from "./taxonomy-fixture.mjs";

const FIXTURE_DIRECTORY = path.resolve(
  "scripts",
  "fixtures",
  "taxonomy",
  "col-xr-2026-07-17",
);

function fullRelease(releaseId = "col-full-test-2026-07-17") {
  return {
    releaseId,
    datasetKey: 315834,
    source: "Catalogue of Life",
    alias: "COL26.7 XR Testvollimport",
    title: "Catalogue of Life",
    issued: "2026-07-17",
    version: "2026-07-17",
    doi: "10.48580/dgykv",
    expectedNameUsages: 123,
    metadataUrl: "https://api.checklistbank.org/dataset/315834",
    sourceUrl: "https://www.catalogueoflife.org/data/download",
    format: "ColDP",
    coldpVersion: "1.2",
    license: "CC BY 4.0",
  };
}

async function temporaryRoot(context, prefix) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

async function addOfficialColdpNamespaces(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  const newlineIndex = text.indexOf("\n");
  const header = (newlineIndex >= 0 ? text.slice(0, newlineIndex) : text)
    .replace(/\r$/, "")
    .split("\t")
    .map((name) => `col:${name}`)
    .join("\t");
  const remainder = newlineIndex >= 0 ? text.slice(newlineIndex + 1) : "";
  await fs.writeFile(filePath, `${header}\n${remainder}`, "utf8");
}

test("Vollimport bleibt bis nach dem konfliktfreien Projektabgleich inaktiv", async (context) => {
  const root = await temporaryRoot(context, "taxonomy-full-import-");
  const taxonomyRoot = path.join(root, "taxonomy");
  const speciesListPath = path.join(root, "species_list.json");
  const mappingsPath = path.join(root, "species-reference-mappings.json");
  const originalSpecies = [
    { german: "Amsel", genus: "Turdus", species: "merula" },
    { german: "Blaumeise alt", genus: "Parus", species: "caeruleus" },
    { german: "Nicht gefunden", genus: "Inventus", species: "absentus" },
  ];
  const originalText = `${JSON.stringify(originalSpecies, null, 2)}\n`;
  await Promise.all([
    fs.writeFile(speciesListPath, originalText, "utf8"),
    fs.writeFile(
      mappingsPath,
      `${JSON.stringify({ schemaVersion: 1, mappings: {} }, null, 2)}\n`,
      "utf8",
    ),
  ]);

  const imported = await importFullTaxonomyRelease({
    packageDirectory: FIXTURE_DIRECTORY,
    taxonomyRoot,
    release: fullRelease(),
    archive: {
      bytes: 1234,
      sha256: "a".repeat(64),
      downloadUrl: "https://download.checklistbank.org/job/aa/test.zip",
    },
    operationId: "test-import",
  });
  assert.equal(imported.manifest.boundedPrototype, false);
  assert.equal(imported.manifest.validation.projectSpeciesCompared, false);
  assert.equal((await readActiveTaxonomyPointer(taxonomyRoot)), null);
  await assert.rejects(
    activateTaxonomyRelease(taxonomyRoot, imported.releaseId),
    /Prüfmanifest/,
  );

  const report = await compareProjectSpeciesWithTaxonomyRelease({
    taxonomyRoot,
    releaseId: imported.releaseId,
    speciesListPath,
    mappingsPath,
  });
  assert.deepEqual(report.summary, {
    total: 3,
    exact: 1,
    suggestions: 1,
    ambiguous: 0,
    missing: 1,
    blocking: 0,
  });
  assert.equal(
    report.results.find((entry) => entry.germanName === "Blaumeise alt")?.candidate
      ?.scientificName,
    "Cyanistes caeruleus",
  );
  assert.equal(await fs.readFile(speciesListPath, "utf8"), originalText);

  const pointer = await activateTaxonomyRelease(taxonomyRoot, imported.releaseId);
  assert.equal(pointer.activeRelease, imported.releaseId);
  assert.equal(pointer.previousRelease, null);
  const persisted = await readProjectTaxonomyConflictReport({
    taxonomyRoot,
    releaseId: imported.releaseId,
  });
  assert.deepEqual(persisted.summary, report.summary);
  assert.equal(persisted.results.length, originalSpecies.length);
});

test("mehrdeutige Treffer werden niemals automatisch ausgewählt", () => {
  const result = taxonomyProjectConflictInternals.classifySpecies({
    entry: { german: "Testart", genus: "Aotus", species: "example" },
    mappedTarget: null,
    accepted: [
      {
        taxon_id: 1,
        source_id: "one",
        scientific_name: "Aotus example",
        rank: "species",
        status: "accepted",
        kingdom: "Animalia",
      },
      {
        taxon_id: 2,
        source_id: "two",
        scientific_name: "Aotus example",
        rank: "species",
        status: "accepted",
        kingdom: "Animalia",
      },
    ],
    synonyms: [],
  });
  assert.equal(result.classification, "ambiguous");
  assert.equal(result.severity, "error");
  assert.equal(result.candidate, undefined);
  assert.equal(result.candidates.length, 2);
});

test("bestätigte Zuordnungen bleiben über die stabile Quellen-ID gültig", () => {
  const result = taxonomyProjectConflictInternals.classifySpecies({
    entry: { german: "Testart", genus: "Alter", species: "name" },
    mappedTarget: {
      taxon_id: 7,
      source_id: "COL:stable-id",
      scientific_name: "Neuer akzeptierter Name",
      rank: "species",
      status: "accepted",
      kingdom: "Animalia",
    },
    accepted: [],
    synonyms: [],
  });
  assert.equal(result.classification, "mapped");
  assert.equal(result.severity, "ok");
  assert.equal(result.candidate.sourceId, "COL:stable-id");
  assert.equal(result.candidate.scientificName, "Neuer akzeptierter Name");
});

test("Vernakularnamen sind im ColDP-Paket optional", async (context) => {
  const root = await temporaryRoot(context, "taxonomy-package-optional-");
  const fixtureCopy = path.join(root, "fixture");
  await fs.cp(FIXTURE_DIRECTORY, fixtureCopy, { recursive: true });
  await fs.rm(path.join(fixtureCopy, "VernacularName.tsv"));
  const taxonomyPackage = await validateTaxonomyPackage(fixtureCopy, {
    release: fullRelease("col-full-without-vernacular"),
    archive: {},
  });
  assert.equal(taxonomyPackage.files["VernacularName.tsv"], null);
  assert.equal(taxonomyPackage.headers.vernacularName, null);
  assert.ok(taxonomyPackage.files["NameUsage.tsv"]);
});

test("offizielle ColDP-Namensräume werden bei Prüfung und Import normalisiert", async (context) => {
  assert.deepEqual(
    parseTaxonomyTsvHeaders(
      "col:ID\tcol:scientificName\tcol:rank\tcol:status\tclb:merged",
    ),
    ["ID", "scientificName", "rank", "status", "merged"],
  );
  const root = await temporaryRoot(context, "taxonomy-package-namespaces-");
  const fixtureCopy = path.join(root, "fixture");
  await fs.cp(FIXTURE_DIRECTORY, fixtureCopy, { recursive: true });
  await Promise.all([
    addOfficialColdpNamespaces(path.join(fixtureCopy, "NameUsage.tsv")),
    addOfficialColdpNamespaces(path.join(fixtureCopy, "VernacularName.tsv")),
  ]);

  const taxonomyPackage = await validateTaxonomyPackage(fixtureCopy, {
    release: fullRelease("col-full-namespaced"),
    archive: {},
  });
  assert.ok(taxonomyPackage.headers.nameUsage.includes("ID"));
  assert.ok(taxonomyPackage.headers.nameUsage.includes("scientificName"));
  assert.ok(taxonomyPackage.headers.vernacularName.includes("taxonID"));

  const rows = iterateTaxonomyTsv(taxonomyPackage.files["NameUsage.tsv"]);
  const first = await rows.next();
  await rows.return();
  assert.ok(first.value.ID);
  assert.ok(first.value.scientificName);

  const taxonomyRoot = path.join(root, "taxonomy");
  const imported = await importFullTaxonomyRelease({
    packageDirectory: fixtureCopy,
    taxonomyRoot,
    release: fullRelease("col-full-namespaced"),
    archive: {},
    operationId: "test-namespaced-import",
  });
  assert.equal(imported.manifest.counts.rawNameUsages, 123);
  assert.ok(imported.manifest.counts.vernacularNames > 0);
});
