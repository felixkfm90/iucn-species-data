import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import {
  buildTaxonomyMasterCandidate,
  inspectTaxonomyMasterCandidate,
  readTaxonomyMasterManifest,
} from "./taxonomy-master-candidate.mjs";
import {
  activateTaxonomyMasterCandidate,
  decideTaxonomyMasterConflict,
  inspectTaxonomyMasterLifecycle,
  rollbackTaxonomyMaster,
} from "./taxonomy-master-lifecycle.mjs";
import { taxonomyMasterDatabasePath } from "./taxonomy-master-storage.mjs";

const FIRST = new Date("2026-08-01T08:00:00.000Z");
const SECOND = new Date("2026-08-02T08:00:00.000Z");

async function createRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "taxonomy-master-candidate-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

function colRelease(version, importedAt) {
  return {
    releaseId: `col-${version}`,
    providerVersion: version,
    importedAt,
    sourceUrl: "https://www.catalogueoflife.org/",
    recordCount: 1,
  };
}

function leopardRecord(family = "Felidae") {
  return {
    providerRecordId: "col-panthera-pardus",
    scientificName: "Panthera pardus",
    rank: "species",
    kingdom: "Animalia",
    hierarchy: {
      kingdom: "Animalia",
      phylum: "Chordata",
      class: "Mammalia",
      order: "Carnivora",
      family,
      genus: "Panthera",
      species: "Panthera pardus",
    },
    germanNames: [{ name: "Leopard", preferred: true, verified: true }],
    englishNames: [{ name: "Leopard", preferred: true, verified: true }],
  };
}

function projectLeopard() {
  return {
    projectTaxonKey: "pantherapardus",
    projectSlug: "pantherapardus",
    scientificName: "Panthera pardus",
    rank: "species",
    kingdom: "Animalia",
    germanName: "Leopard",
    englishName: "Leopard",
  };
}

async function buildFirstActive(root) {
  await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-07", FIRST.toISOString()),
    colRecords: [leopardRecord()],
    projectTaxa: [projectLeopard()],
    now: () => FIRST,
  });
  return activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => FIRST });
}

function selectedField(root, slot, fieldName) {
  const database = new DatabaseSync(taxonomyMasterDatabasePath(root, slot), { readOnly: true });
  try {
    return database.prepare(`
      SELECT field_value, origin_kind
      FROM master_field_assertion
      WHERE field_name = ? AND selected = 1
    `).get(fieldName);
  } finally {
    database.close();
  }
}

test("9.9 erstellt zuerst einen prüfbaren Kandidaten und aktiviert ihn nur bestätigt", async (t) => {
  const root = await createRoot(t);
  const manifest = await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-07", FIRST.toISOString()),
    colRecords: [leopardRecord()],
    projectTaxa: [projectLeopard()],
    now: () => FIRST,
  });
  assert.equal(manifest.state, "staging");
  assert.equal(manifest.requiresConfirmation, true);
  assert.deepEqual(manifest.diff.newTaxa, ["Panthera pardus"]);
  await assert.rejects(
    activateTaxonomyMasterCandidate(root),
    /ausdrücklich bestätigt/,
  );
  const activated = await activateTaxonomyMasterCandidate(root, {
    confirmed: true,
    now: () => FIRST,
  });
  assert.equal(activated.active.state, "active");
  assert.equal(activated.candidate, null);
  assert.equal(selectedField(root, "active", "family").field_value, "Felidae");
});

test("9.9 zeigt Hierarchieänderungen als Konflikt und übernimmt sie erst nach Entscheidung", async (t) => {
  const root = await createRoot(t);
  await buildFirstActive(root);
  const manifest = await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-08", SECOND.toISOString()),
    colRecords: [leopardRecord("Pantheridae")],
    projectTaxa: [projectLeopard()],
    now: () => SECOND,
  });
  assert.equal(manifest.state, "staging");
  const inspection = await inspectTaxonomyMasterCandidate(root);
  const familyConflict = inspection.conflicts.find((entry) => entry.field_name === "family");
  assert.ok(familyConflict);
  assert.equal(familyConflict.current_value, "Felidae");
  assert.equal(familyConflict.candidate_value, "Pantheridae");
  await assert.rejects(
    activateTaxonomyMasterCandidate(root, { confirmed: true }),
    /müssen vor der Aktivierung entschieden werden/,
  );
  await decideTaxonomyMasterConflict(root, {
    conflictId: familyConflict.conflict_id,
    decision: "accept-candidate",
    now: () => SECOND,
  });
  const lifecycle = await inspectTaxonomyMasterLifecycle(root);
  assert.equal(lifecycle.canActivate, true);
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => SECOND });
  assert.equal(selectedField(root, "active", "family").field_value, "Pantheridae");

  await rollbackTaxonomyMaster(root, { confirmed: true, now: () => SECOND });
  assert.equal(selectedField(root, "active", "family").field_value, "Felidae");
  assert.equal(selectedField(root, "previous", "family").field_value, "Pantheridae");
});

test("9.9 behandelt eine dokumentierte CoL-Referenzlücke als Hinweis statt Aktivierungsblocker", async (t) => {
  const root = await createRoot(t);
  await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-07", FIRST.toISOString()),
    colRecords: [],
    providerSlices: [{
      manifest: {
        provider: "gbif",
        providerVersion: "2026-08-01",
        retrievedAt: FIRST.toISOString(),
        sourceUrl: "https://api.gbif.org/",
      },
      records: [{
        providerRecordId: "5219668",
        scientificName: "Sciurus vulgaris",
        rank: "species",
        kingdom: "Animalia",
        hierarchy: { genus: "Sciurus", species: "Sciurus vulgaris" },
        names: [],
        relevanceReasons: ["col-reference-gap"],
      }],
    }],
    projectTaxa: [{
      projectTaxonKey: "sciurusvulgaris",
      projectSlug: "sciurusvulgaris",
      scientificName: "Sciurus vulgaris",
      rank: "species",
      kingdom: "Animalia",
      germanName: "Eurasisches Eichhörnchen",
    }],
    now: () => FIRST,
  });
  const lifecycle = await inspectTaxonomyMasterLifecycle(root);
  assert.equal(lifecycle.conflicts.some((entry) => entry.conflict_type === "reference-gap"), true);
  assert.equal(lifecycle.blockingConflicts.length, 0);
  assert.equal(lifecycle.canActivate, true);
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => FIRST });
  const database = new DatabaseSync(taxonomyMasterDatabasePath(root, "active"), { readOnly: true });
  try {
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM master_taxon").get().count, 1);
    assert.equal(database.prepare("SELECT reference_state FROM master_taxon").get().reference_state, "reference-gap");
  } finally {
    database.close();
  }
});

test("9.9 stellt bei einer unterbrochenen Aktivierung die bisherige Version wieder her", async (t) => {
  const root = await createRoot(t);
  await buildFirstActive(root);
  const activeBefore = await readTaxonomyMasterManifest(root, "active");
  await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-08", SECOND.toISOString()),
    colRecords: [leopardRecord()],
    projectTaxa: [projectLeopard()],
    now: () => SECOND,
  });
  const stagingPath = path.resolve(root, "master", "staging");
  const activePath = path.resolve(root, "master", "active");
  const faultyFs = {
    access: (...args) => fs.access(...args),
    rm: (...args) => fs.rm(...args),
    rename: async (source, target) => {
      if (path.resolve(source) === stagingPath && path.resolve(target) === activePath) {
        const error = new Error("simulierter Abbruch");
        error.code = "EIO";
        throw error;
      }
      return fs.rename(source, target);
    },
  };
  await assert.rejects(
    activateTaxonomyMasterCandidate(root, {
      confirmed: true,
      now: () => SECOND,
      fileSystem: faultyFs,
    }),
    /simulierter Abbruch/,
  );
  const activeAfter = await readTaxonomyMasterManifest(root, "active");
  assert.equal(activeAfter.candidateId, activeBefore.candidateId);
  assert.equal(selectedField(root, "active", "family").field_value, "Felidae");
});
