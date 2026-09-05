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
    colRecords: (async function* streamFixture() {
      yield leopardRecord();
    })(),
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
  const progress = [];
  const manifest = await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-07", FIRST.toISOString()),
    colRecords: [leopardRecord()],
    projectTaxa: [projectLeopard()],
    onProgress(entry) { progress.push(entry); },
    now: () => FIRST,
  });
  assert.equal(manifest.state, "staging");
  assert.equal(manifest.requiresConfirmation, true);
  assert.deepEqual(manifest.diff.newTaxa, ["Panthera pardus"]);
  assert.ok(progress.some((entry) => entry.phase === "Masterdatenbank schreiben"));
  assert.ok(progress.some((entry) => entry.phase === "Suchindex"));
  assert.ok(progress.some((entry) => entry.phase === "Abschluss"));
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

test("leichter Masterstatus liefert nur kompakte Differenzen und blockierende Konflikte", async (t) => {
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

  const lifecycle = await inspectTaxonomyMasterLifecycle(root, { lightweight: true });
  assert.equal(typeof lifecycle.candidate.diff.newTaxa, "number");
  assert.equal(lifecycle.candidate.diff.newTaxa, 1);
  assert.deepEqual(lifecycle.conflicts, []);
  assert.deepEqual(lifecycle.blockingConflicts, []);
  assert.equal(lifecycle.canActivate, true);
});

test("eine neue CoL-Hierarchie wird auch bei Projektarten ohne Fachentscheidung übernommen", async (t) => {
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
  assert.equal(inspection.conflicts.some((entry) => entry.field_name === "family"), false);
  assert.equal(selectedField(root, "staging", "family").field_value, "Pantheridae");
  const lifecycle = await inspectTaxonomyMasterLifecycle(root);
  assert.equal(lifecycle.canActivate, true);
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => SECOND });
  assert.equal(selectedField(root, "active", "family").field_value, "Pantheridae");

  await rollbackTaxonomyMaster(root, { confirmed: true, now: () => SECOND });
  assert.equal(selectedField(root, "active", "family").field_value, "Felidae");
  assert.equal(selectedField(root, "previous", "family").field_value, "Pantheridae");
});

test("reine Anbieter-Taxa übernehmen einen neuen priorisierten Quellenwert ohne Massenkonflikt", async (t) => {
  const root = await createRoot(t);
  await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-07", FIRST.toISOString()),
    colRecords: [leopardRecord("Felidae")],
    now: () => FIRST,
  });
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => FIRST });

  await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-08", SECOND.toISOString()),
    colRecords: [leopardRecord("Pantheridae")],
    now: () => SECOND,
  });

  assert.equal(selectedField(root, "staging", "family").field_value, "Pantheridae");
  const lifecycle = await inspectTaxonomyMasterLifecycle(root);
  assert.equal(lifecycle.blockingConflicts.length, 0);
  assert.equal(lifecycle.canActivate, true);
});

test("fehlende Anbieterfelder behalten ihre Quelle über mehrere Neuaufbauten", async (t) => {
  const root = await createRoot(t);
  await buildFirstActive(root);
  const withoutFamily = leopardRecord();
  delete withoutFamily.hierarchy.family;
  await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-08", SECOND.toISOString()),
    colRecords: [withoutFamily],
    now: () => SECOND,
  });
  assert.equal(selectedField(root, "staging", "family").origin_kind, "source");
  const database = new DatabaseSync(taxonomyMasterDatabasePath(root, "staging"), { readOnly: true });
  try {
    const field = database.prepare(`
      SELECT release.provider, release.provider_version, release.release_state,
        source.match_state, source.version_change_state
      FROM master_field_assertion field
      JOIN provider_release release USING(release_id)
      JOIN provider_taxon_assertion source ON source.assertion_id = field.provider_taxon_assertion_id
      WHERE field.field_name = 'family' AND field.selected = 1
    `).get();
    assert.equal(field.provider, "catalogue-of-life");
    assert.equal(field.provider_version, "2026-07");
    assert.equal(field.release_state, "archived");
    assert.equal(field.match_state, "stale");
    assert.equal(field.version_change_state, "removed");
  } finally {
    database.close();
  }
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => SECOND });
  await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-09", SECOND.toISOString()),
    colRecords: [leopardRecord("Pantheridae")],
    now: () => new Date("2026-08-03T08:00:00Z"),
  });
  assert.equal(selectedField(root, "staging", "family").field_value, "Pantheridae");
  assert.equal(selectedField(root, "staging", "family").origin_kind, "source");
  assert.equal((await inspectTaxonomyMasterLifecycle(root)).blockingConflictCount, 0);
});

for (const protection of ["none", "decision", "same-value", "correction", "no-history", "different-value"]) {
  test(`alte manuelle Trägerzeile wird nur mit Quellenbeweis repariert: ${protection}`, async (t) => {
    const root = await createRoot(t);
    await buildTaxonomyMasterCandidate({
      taxonomyRoot: root,
      colRelease: colRelease("2026-07", FIRST.toISOString()),
      colRecords: [leopardRecord()],
      now: () => FIRST,
    });
    await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => FIRST });
    const withoutGermanName = { ...leopardRecord(), germanNames: [] };
    await buildTaxonomyMasterCandidate({
      taxonomyRoot: root,
      colRelease: colRelease("2026-08", SECOND.toISOString()),
      colRecords: [withoutGermanName],
      now: () => SECOND,
    });
    await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => SECOND });
    // Ausschließlich in dieser Fixture das frühere fehlerhafte Speicherformat nachstellen.
    const database = new DatabaseSync(taxonomyMasterDatabasePath(root, "active"));
    try {
      database.prepare(`
        UPDATE master_field_assertion SET origin_kind = 'manual',
          provider_taxon_assertion_id = NULL, release_id = ?
        WHERE field_name = 'german-name' AND selected = 1
      `).run(`manual-${SECOND.toISOString()}`);
      if (protection === "different-value") {
        database.exec(`UPDATE master_field_assertion SET field_value = 'Mein Leopard'
          WHERE field_name = 'german-name' AND selected = 1`);
      }
      if (["decision", "same-value"].includes(protection)) {
        database.prepare(`
          INSERT INTO master_decision (decision_id, master_taxon_id, field_name, language,
            decision_type, selected_assertion_id, decided_at)
          SELECT 'explicit', master_taxon_id, field_name, language, 'protect-manual', assertion_id, ?
          FROM master_field_assertion WHERE field_name = 'german-name' AND selected = 1
        `).run(SECOND.toISOString());
      }
    } finally {
      database.close();
    }
    if (protection === "no-history") {
      await fs.rename(taxonomyMasterDatabasePath(root, "previous"), path.join(root, "unavailable.sqlite"));
    }
    await buildTaxonomyMasterCandidate({
      taxonomyRoot: root,
      colRelease: colRelease("2026-09", SECOND.toISOString()),
      colRecords: [{ ...leopardRecord(), germanNames: [{
        name: protection === "same-value" ? "Leopard" : "Panther", preferred: true,
      }] }],
      corrections: protection === "correction"
        ? [{ scientificName: "Panthera pardus", germanName: "Leopard" }] : [],
      now: () => new Date("2026-08-03T08:00:00Z"),
    });
    const field = selectedField(root, "staging", "german-name");
    const lifecycle = await inspectTaxonomyMasterLifecycle(root);
    if (protection === "none") {
      assert.equal(field.field_value, "Panther");
      assert.equal(field.origin_kind, "source");
      assert.equal(lifecycle.blockingConflictCount, 0);
    } else {
      assert.equal(field.field_value, protection === "different-value" ? "Mein Leopard" : "Leopard");
      assert.equal(field.origin_kind, "manual");
      assert.equal(lifecycle.blockingConflictCount, ["correction", "same-value"].includes(protection) ? 0 : 1);
    }
  });
}

test("ein ausdrücklich gepflegter Projektname ersetzt einen bisherigen Quellennamen", async (t) => {
  const root = await createRoot(t);
  const storkRecord = {
    ...leopardRecord(),
    providerRecordId: "col-ciconia-ciconia",
    scientificName: "Ciconia ciconia",
    hierarchy: {
      kingdom: "Animalia",
      phylum: "Chordata",
      class: "Aves",
      order: "Ciconiiformes",
      family: "Ciconiidae",
      genus: "Ciconia",
      species: "Ciconia ciconia",
    },
    germanNames: [{ name: "Hausstorch", preferred: true, verified: true }],
    englishNames: [{ name: "European White Stork", preferred: true, verified: true }],
  };
  await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-07", FIRST.toISOString()),
    colRecords: [storkRecord],
    now: () => FIRST,
  });
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => FIRST });

  await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-08", SECOND.toISOString()),
    colRecords: [storkRecord],
    projectTaxa: [{
      projectTaxonKey: "ciconiaciconia",
      projectSlug: "ciconiaciconia",
      scientificName: "Ciconia ciconia",
      rank: "species",
      kingdom: "Animalia",
      germanName: "Weissstorch",
      englishName: "White Stork",
    }],
    now: () => SECOND,
  });

  assert.deepEqual({ ...selectedField(root, "staging", "german-name") }, {
    field_value: "Weissstorch",
    origin_kind: "project",
  });
  assert.deepEqual({ ...selectedField(root, "staging", "english-name") }, {
    field_value: "White Stork",
    origin_kind: "project",
  });
  const lifecycle = await inspectTaxonomyMasterLifecycle(root);
  assert.equal(lifecycle.blockingConflicts.length, 0);
  assert.equal(lifecycle.canActivate, true);
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

test("ergänzt ein fehlendes Anbieter-Reich nur aus einer eindeutigen CoL-Gattungszuordnung", async (t) => {
  const root = await createRoot(t);
  await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-07", FIRST.toISOString()),
    colRecords: [{
      providerRecordId: "col-iguana-iguana",
      scientificName: "Iguana iguana",
      rank: "species",
      kingdom: "Animalia",
    }],
    providerSlices: [{
      manifest: {
        provider: "wikidata",
        providerVersion: "2026-08-01",
        retrievedAt: FIRST.toISOString(),
      },
      records: [{
        providerRecordId: "Q-iguana-melanoderma",
        scientificName: "Iguana melanoderma",
        rank: "species",
        kingdom: "",
      }],
    }],
    now: () => FIRST,
  });
  const database = new DatabaseSync(taxonomyMasterDatabasePath(root, "staging"), { readOnly: true });
  try {
    assert.equal(
      database.prepare(`
        SELECT kingdom
        FROM master_taxon
        WHERE canonical_scientific_name = 'Iguana melanoderma'
      `).get().kingdom,
      "Animalia",
    );
    assert.equal(
      database.prepare(`
        SELECT kingdom
        FROM provider_taxon_assertion
        WHERE provider_record_id = 'Q-iguana-melanoderma'
      `).get().kingdom,
      null,
    );
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

test("der reale Masterimport verwirft als Art markierte Quellzeilen ohne kanonischen Binomen", async (t) => {
  const root = await createRoot(t);
  await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-07", FIRST.toISOString()),
    colRecords: [
      leopardRecord(),
      {
        providerRecordId: "col-invalid-species",
        scientificName: "Mammalia incertae sedis",
        rank: "species",
        kingdom: "Animalia",
      },
    ],
    providerSlices: [{
      manifest: {
        provider: "gbif",
        providerVersion: "2026-08-01",
        retrievedAt: FIRST.toISOString(),
      },
      records: [{
        providerRecordId: "gbif-invalid-species",
        scientificName: "Unclassified",
        rank: "species",
        kingdom: "Animalia",
      }],
    }],
    projectTaxa: [projectLeopard()],
    now: () => FIRST,
  });
  const database = new DatabaseSync(taxonomyMasterDatabasePath(root, "staging"), { readOnly: true });
  try {
    assert.deepEqual(
      database.prepare(`
        SELECT canonical_scientific_name
        FROM master_taxon
        ORDER BY canonical_scientific_name
      `).all().map((entry) => entry.canonical_scientific_name),
      ["Panthera pardus"],
    );
  } finally {
    database.close();
  }
});

test("kanonisiert abweichende Anbieter-Reichsnamen nur im Master und erhält den Rohwert", async (t) => {
  const root = await createRoot(t);
  await buildTaxonomyMasterCandidate({
    taxonomyRoot: root,
    colRelease: colRelease("2026-07", FIRST.toISOString()),
    colRecords: [leopardRecord()],
    providerSlices: [{
      manifest: {
        provider: "gbif",
        providerVersion: "2026-08-01",
        retrievedAt: FIRST.toISOString(),
      },
      records: [
        {
          providerRecordId: "gbif-animal",
          scientificName: "Actophilornis africana",
          rank: "species",
          kingdom: "Animal",
        },
        {
          providerRecordId: "gbif-plant",
          scientificName: "Acaena anserinifolia",
          rank: "species",
          kingdom: "Viridiplantae",
        },
      ],
    }],
    projectTaxa: [projectLeopard()],
    now: () => FIRST,
  });
  const database = new DatabaseSync(taxonomyMasterDatabasePath(root, "staging"), { readOnly: true });
  try {
    assert.deepEqual(
      database.prepare(`
        SELECT canonical_scientific_name, kingdom
        FROM master_taxon
        WHERE canonical_scientific_name IN ('Actophilornis africana', 'Acaena anserinifolia')
        ORDER BY canonical_scientific_name
      `).all().map((entry) => ({ ...entry })),
      [
        { canonical_scientific_name: "Acaena anserinifolia", kingdom: "Plantae" },
        { canonical_scientific_name: "Actophilornis africana", kingdom: "Animalia" },
      ],
    );
    assert.deepEqual(
      database.prepare(`
        SELECT scientific_name, kingdom
        FROM provider_taxon_assertion
        WHERE provider_record_id IN ('gbif-animal', 'gbif-plant')
        ORDER BY scientific_name
      `).all().map((entry) => ({ ...entry })),
      [
        { scientific_name: "Acaena anserinifolia", kingdom: "Viridiplantae" },
        { scientific_name: "Actophilornis africana", kingdom: "Animal" },
      ],
    );
  } finally {
    database.close();
  }
});
