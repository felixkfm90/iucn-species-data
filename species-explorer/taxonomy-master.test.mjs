import assert from "node:assert/strict";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import {
  activateProviderRelease,
  addMasterConflict,
  addMasterFieldAssertion,
  addProviderNameAssertion,
  addProviderTaxonAssertion,
  createMasterTaxon,
  createMasterTaxonId,
  linkProjectTaxon,
  registerProviderRelease,
  selectMasterFieldAssertion,
  updateMasterTaxonReference,
} from "./taxonomy-master-model.mjs";
import {
  createTaxonomyMasterSchema,
  validateTaxonomyMasterDatabase,
} from "./taxonomy-master-schema.mjs";
import {
  taxonomyMasterDatabasePath,
  taxonomyMasterManifestPath,
  taxonomyMasterRoot,
} from "./taxonomy-master-storage.mjs";

const NOW = "2026-07-30T10:00:00.000Z";
const LATER = "2026-08-15T10:00:00.000Z";

function openDatabase() {
  const database = new DatabaseSync(":memory:");
  createTaxonomyMasterSchema(database);
  return database;
}

function plainRow(row) {
  return row ? { ...row } : row;
}

function plainRows(rows) {
  return rows.map(plainRow);
}

function registerRelease(database, {
  releaseId,
  provider,
  providerVersion = releaseId,
  dataScope = "relevant-slice",
  importedAt = NOW,
}) {
  registerProviderRelease(database, {
    releaseId,
    provider,
    providerVersion,
    dataScope,
    importedAt,
    recordCount: 1,
  });
  activateProviderRelease(database, releaseId);
}

test("Masterdatenbank liegt getrennt von unveränderlichen CoL-Releases", () => {
  const root = path.resolve("taxonomy-test-root");
  assert.equal(taxonomyMasterRoot(root), path.join(root, "master"));
  assert.equal(
    taxonomyMasterDatabasePath(root),
    path.join(root, "master", "active", "taxonomy-master.sqlite"),
  );
  assert.equal(
    taxonomyMasterDatabasePath(root, "staging"),
    path.join(root, "master", "staging", "taxonomy-master.sqlite"),
  );
  assert.equal(
    taxonomyMasterManifestPath(root, "previous"),
    path.join(root, "master", "previous", "manifest.json"),
  );
  assert.equal(taxonomyMasterDatabasePath(root).includes(`${path.sep}releases${path.sep}`), false);
});

test("Quellenaktivierung bewahrt genau eine vorherige Version", () => {
  const database = openDatabase();
  try {
    for (const version of ["2026-01", "2026-02", "2026-03"]) {
      registerRelease(database, {
        releaseId: `wikidata-${version}`,
        provider: "wikidata",
        providerVersion: version,
      });
    }
    assert.deepEqual(
      plainRows(database.prepare(`
        SELECT provider_version, release_state
        FROM provider_release
        WHERE provider = 'wikidata'
        ORDER BY provider_version
      `).all()),
      [
        { provider_version: "2026-01", release_state: "archived" },
        { provider_version: "2026-02", release_state: "previous" },
        { provider_version: "2026-03", release_state: "active" },
      ],
    );
    assert.equal(validateTaxonomyMasterDatabase(database).sourceReleases, 3);
  } finally {
    database.close();
  }
});

test("Sciurus vulgaris bleibt bei einer CoL-Lücke ein einziges stabiles Mastertaxon", () => {
  const database = openDatabase();
  try {
    registerRelease(database, {
      releaseId: "col-2026-07-17",
      provider: "catalogue-of-life",
      dataScope: "full",
    });
    registerRelease(database, {
      releaseId: "gbif-2026-07",
      provider: "gbif",
    });
    registerRelease(database, {
      releaseId: "inaturalist-2026-07",
      provider: "inaturalist",
    });
    registerRelease(database, {
      releaseId: "wikidata-2026-07",
      provider: "wikidata",
    });
    registerRelease(database, {
      releaseId: "project-2026-07",
      provider: "project",
      dataScope: "project",
    });

    const masterTaxonId = createMasterTaxonId(
      () => "12345678-1234-4abc-8def-1234567890ab",
    );
    createMasterTaxon(database, {
      masterTaxonId,
      scientificName: "Sciurus vulgaris",
      rank: "species",
      kingdom: "Animalia",
      referenceState: "reference-gap",
      createdAt: NOW,
    });

    for (const [recordId, name] of [
      ["col-subspecies-vulgaris", "Sciurus vulgaris vulgaris"],
      ["col-subspecies-fuscoater", "Sciurus vulgaris fuscoater"],
    ]) {
      addProviderTaxonAssertion(database, {
        releaseId: "col-2026-07-17",
        providerRecordId: recordId,
        scientificName: name,
        rank: "subspecies",
        kingdom: "Animalia",
        matchState: "unlinked",
        importedAt: NOW,
      });
    }

    const gbifAssertion = addProviderTaxonAssertion(database, {
      releaseId: "gbif-2026-07",
      providerRecordId: "8211070",
      masterTaxonId,
      scientificName: "Sciurus vulgaris",
      rank: "species",
      kingdom: "Animalia",
      matchState: "reference-gap",
      importedAt: NOW,
    });
    const inaturalistAssertion = addProviderTaxonAssertion(database, {
      releaseId: "inaturalist-2026-07",
      providerRecordId: "46001",
      masterTaxonId,
      scientificName: "Sciurus vulgaris",
      rank: "species",
      kingdom: "Animalia",
      matchState: "reference-gap",
      importedAt: NOW,
    });
    const wikidataAssertion = addProviderTaxonAssertion(database, {
      releaseId: "wikidata-2026-07",
      providerRecordId: "Q4388",
      masterTaxonId,
      scientificName: "Sciurus vulgaris",
      rank: "species",
      kingdom: "Animalia",
      matchState: "reference-gap",
      importedAt: NOW,
    });
    addProviderNameAssertion(database, {
      providerTaxonAssertionId: wikidataAssertion,
      name: "Eurasisches Eichhörnchen",
      language: "de",
      nameKind: "vernacular",
      preferred: true,
    });
    addProviderNameAssertion(database, {
      providerTaxonAssertionId: inaturalistAssertion,
      name: "Eurasian Red Squirrel",
      language: "en",
      nameKind: "vernacular",
      preferred: true,
      verified: true,
    });
    addProviderNameAssertion(database, {
      providerTaxonAssertionId: gbifAssertion,
      name: "Sciurus vulgaris",
      nameKind: "scientific",
      preferred: true,
      verified: true,
    });
    addMasterFieldAssertion(database, {
      masterTaxonId,
      fieldName: "germanName",
      fieldValue: "Eurasisches Eichhörnchen",
      language: "de",
      originKind: "source",
      providerTaxonAssertionId: wikidataAssertion,
      releaseId: "wikidata-2026-07",
      confidence: 0.76,
      reviewState: "accepted",
      selected: true,
      createdAt: NOW,
    });
    addMasterFieldAssertion(database, {
      masterTaxonId,
      fieldName: "englishName",
      fieldValue: "Eurasian Red Squirrel",
      language: "en",
      originKind: "source",
      providerTaxonAssertionId: inaturalistAssertion,
      releaseId: "inaturalist-2026-07",
      confidence: 0.86,
      reviewState: "accepted",
      selected: true,
      createdAt: NOW,
    });
    linkProjectTaxon(database, {
      projectTaxonKey: "sciurusvulgaris",
      masterTaxonId,
      projectSlug: "sciurusvulgaris",
      scientificNameAtLink: "Sciurus vulgaris",
      linkedAt: NOW,
    });
    addMasterConflict(database, {
      conflictId: "gap-sciurus-vulgaris",
      masterTaxonId,
      conflictType: "reference-gap",
      detectedAt: NOW,
      resolutionNote: "CoL enthält Unterarten, aber keine exakte Artzeile.",
    });

    const gapValidation = validateTaxonomyMasterDatabase(database);
    assert.deepEqual(gapValidation, {
      sourceReleases: 5,
      masterTaxa: 1,
      sourceTaxa: 5,
      sourceNames: 3,
      fieldAssertions: 2,
      openConflicts: 1,
      projectLinks: 1,
    });
    assert.equal(
      database.prepare(`
        SELECT COUNT(*) AS count
        FROM provider_taxon_assertion source
        JOIN provider_release release ON release.release_id = source.release_id
        WHERE release.provider = 'catalogue-of-life'
          AND source.rank = 'species'
          AND source.master_taxon_id = ?
      `).get(masterTaxonId).count,
      0,
    );

    registerProviderRelease(database, {
      releaseId: "col-2026-08-15",
      provider: "catalogue-of-life",
      providerVersion: "2026-08-15",
      dataScope: "full",
      importedAt: LATER,
      recordCount: 1,
    });
    addProviderTaxonAssertion(database, {
      releaseId: "col-2026-08-15",
      providerRecordId: "col-sciurus-vulgaris",
      masterTaxonId,
      scientificName: "Sciurus vulgaris",
      rank: "species",
      kingdom: "Animalia",
      matchState: "exact",
      importedAt: LATER,
    });
    activateProviderRelease(database, "col-2026-08-15");
    updateMasterTaxonReference(database, {
      masterTaxonId,
      referenceState: "exact-col",
      updatedAt: LATER,
    });
    addMasterConflict(database, {
      conflictId: "col-returned-sciurus-vulgaris",
      masterTaxonId,
      conflictType: "reference-returned",
      detectedAt: LATER,
      resolutionNote: "Neue exakte CoL-Art wird an die vorhandene Master-ID gebunden.",
    });

    const master = plainRow(database.prepare(`
      SELECT master_taxon_id, canonical_scientific_name, reference_state
      FROM master_taxon
    `).get());
    assert.deepEqual(master, {
      master_taxon_id: masterTaxonId,
      canonical_scientific_name: "Sciurus vulgaris",
      reference_state: "exact-col",
    });
    assert.deepEqual(plainRow(database.prepare(`
      SELECT project_slug, master_taxon_id
      FROM project_taxon_link
      WHERE project_taxon_key = 'sciurusvulgaris'
    `).get()), {
      project_slug: "sciurusvulgaris",
      master_taxon_id: masterTaxonId,
    });
    assert.deepEqual(plainRows(database.prepare(`
      SELECT provider_version, release_state
      FROM provider_release
      WHERE provider = 'catalogue-of-life'
      ORDER BY provider_version
    `).all()), [
      { provider_version: "2026-08-15", release_state: "active" },
      { provider_version: "col-2026-07-17", release_state: "previous" },
    ]);
    assert.equal(validateTaxonomyMasterDatabase(database).masterTaxa, 1);
  } finally {
    database.close();
  }
});

test("manuelle Feldauswahl überlebt spätere Anbieter-Releases", () => {
  const database = openDatabase();
  try {
    registerRelease(database, {
      releaseId: "wikidata-2026-07",
      provider: "wikidata",
    });
    registerRelease(database, {
      releaseId: "manual-project",
      provider: "manual",
      dataScope: "manual",
    });
    const masterTaxonId = createMasterTaxonId(
      () => "abcdefab-cdef-4abc-8def-abcdefabcdef",
    );
    createMasterTaxon(database, {
      masterTaxonId,
      scientificName: "Panthera pardus",
      rank: "species",
      kingdom: "Animalia",
      referenceState: "external-only",
      createdAt: NOW,
    });
    const sourceAssertion = addProviderTaxonAssertion(database, {
      releaseId: "wikidata-2026-07",
      providerRecordId: "Q34706",
      masterTaxonId,
      scientificName: "Panthera pardus",
      rank: "species",
      kingdom: "Animalia",
      matchState: "exact",
      importedAt: NOW,
    });
    const automaticField = addMasterFieldAssertion(database, {
      masterTaxonId,
      fieldName: "germanName",
      fieldValue: "Leopard",
      language: "de",
      originKind: "source",
      providerTaxonAssertionId: sourceAssertion,
      releaseId: "wikidata-2026-07",
      reviewState: "accepted",
      selected: true,
      createdAt: NOW,
    });
    const manualField = addMasterFieldAssertion(database, {
      masterTaxonId,
      fieldName: "germanName",
      fieldValue: "Leopard",
      language: "de",
      originKind: "manual",
      releaseId: "manual-project",
      reviewState: "pending",
      createdAt: NOW,
    });
    selectMasterFieldAssertion(database, {
      assertionId: manualField,
      updatedAt: LATER,
    });

    registerProviderRelease(database, {
      releaseId: "wikidata-2026-08",
      provider: "wikidata",
      providerVersion: "2026-08",
      dataScope: "relevant-slice",
      importedAt: LATER,
      recordCount: 1,
    });
    const newSourceAssertion = addProviderTaxonAssertion(database, {
      releaseId: "wikidata-2026-08",
      providerRecordId: "Q34706",
      masterTaxonId,
      scientificName: "Panthera pardus",
      rank: "species",
      kingdom: "Animalia",
      matchState: "exact",
      importedAt: LATER,
    });
    addMasterFieldAssertion(database, {
      masterTaxonId,
      fieldName: "germanName",
      fieldValue: "Afrikanischer Leopard",
      language: "de",
      originKind: "source",
      providerTaxonAssertionId: newSourceAssertion,
      releaseId: "wikidata-2026-08",
      reviewState: "conflict",
      createdAt: LATER,
    });
    activateProviderRelease(database, "wikidata-2026-08");

    assert.deepEqual(plainRows(database.prepare(`
      SELECT assertion_id, selected, review_state
      FROM master_field_assertion
      WHERE field_name = 'germanName'
      ORDER BY assertion_id
    `).all()), [
      { assertion_id: automaticField, selected: 0, review_state: "superseded" },
      { assertion_id: manualField, selected: 1, review_state: "accepted" },
      { assertion_id: 3, selected: 0, review_state: "conflict" },
    ]);
    assert.equal(validateTaxonomyMasterDatabase(database).fieldAssertions, 3);
  } finally {
    database.close();
  }
});
