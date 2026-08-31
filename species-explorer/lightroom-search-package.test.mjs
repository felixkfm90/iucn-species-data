import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, test } from "node:test";

import {
  buildLightroomSearchPackage,
  verifyLightroomSearchPackage,
} from "./lightroom-search-package.mjs";
import {
  activateTaxonomyCorrectionRelease,
  readActiveTaxonomyCorrectionPointer,
} from "./taxonomy-correction-release.mjs";
import { createTaxonomyMasterSchema } from "./taxonomy-master-schema.mjs";
import {
  activateLightroomSearchPackage,
  inspectLightroomSearchPackages,
  lightroomSearchDatabasePath,
  rollbackLightroomSearchPackage,
} from "./lightroom-search-storage.mjs";
import { openLightroomSearchStore } from "./lightroom-search-store.mjs";
import { openTaxonomyMasterStore } from "./taxonomy-master-store.mjs";
import {
  taxonomyMasterDatabasePath,
  taxonomyMasterManifestPath,
} from "./taxonomy-master-storage.mjs";
import {
  foldTaxonomySearchTerm,
  germanTaxonomySearchKey,
  normalizeTaxonomySearchTerm,
} from "./taxonomy-search-text.mjs";

const NOW = "2026-08-13T10:00:00.000Z";
const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => (
    fs.rm(root, { recursive: true, force: true })
  )));
});

async function createRoots() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lightroom-search-test-"));
  temporaryRoots.push(root);
  return {
    root,
    taxonomyRoot: path.join(root, "taxonomy"),
    searchRoot: path.join(root, "lightroom"),
  };
}

function insertSearchTerm(database, {
  masterTaxonId,
  term,
  termKind,
  language = "",
  provider,
  weight,
}) {
  database.prepare(`
    INSERT INTO master_search_term (
      master_taxon_id, term, normalized_term, folded_term, german_key,
      term_kind, language, source_provider, weight
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    masterTaxonId,
    term,
    normalizeTaxonomySearchTerm(term),
    foldTaxonomySearchTerm(term),
    germanTaxonomySearchKey(term),
    termKind,
    language,
    provider,
    weight,
  );
}

function insertTaxon(database, {
  masterTaxonId,
  scientificName,
  germanName,
  englishName,
  provider = "catalogue-of-life",
  providerRecordId,
  referenceState = "exact-col",
  hierarchy,
  leadingHierarchy = null,
  projectSlug = null,
}) {
  const releaseId = `${provider}-fixture`;
  database.prepare(`
    INSERT INTO master_taxon (
      master_taxon_id, canonical_scientific_name, canonical_name_normalized,
      rank, kingdom, lifecycle_state, reference_state, created_at, updated_at
    ) VALUES (?, ?, ?, 'species', 'Animalia', 'active', ?, ?, ?)
  `).run(
    masterTaxonId,
    scientificName,
    normalizeTaxonomySearchTerm(scientificName),
    referenceState,
    NOW,
    NOW,
  );
  if (leadingHierarchy) {
    database.prepare(`
      INSERT INTO provider_taxon_assertion (
        release_id, provider_record_id, master_taxon_id, scientific_name,
        scientific_name_normalized, rank, kingdom, match_state,
        hierarchy_json, retrieved_at, version_change_state, imported_at
      ) VALUES (?, ?, ?, ?, ?, 'species', 'Animalia', ?, ?, ?, 'unchanged', ?)
    `).run(
      releaseId,
      `${providerRecordId}-incomplete`,
      masterTaxonId,
      scientificName,
      normalizeTaxonomySearchTerm(scientificName),
      referenceState === "reference-gap" ? "reference-gap" : "exact",
      JSON.stringify(leadingHierarchy),
      NOW,
      NOW,
    );
  }
  const source = database.prepare(`
    INSERT INTO provider_taxon_assertion (
      release_id, provider_record_id, master_taxon_id, scientific_name,
      scientific_name_normalized, rank, kingdom, match_state,
      hierarchy_json, retrieved_at, version_change_state, imported_at
    ) VALUES (?, ?, ?, ?, ?, 'species', 'Animalia', ?, ?, ?, 'unchanged', ?)
  `).run(
    releaseId,
    providerRecordId,
    masterTaxonId,
    scientificName,
    normalizeTaxonomySearchTerm(scientificName),
    referenceState === "reference-gap" ? "reference-gap" : "exact",
    JSON.stringify(hierarchy),
    NOW,
    NOW,
  );
  for (const [fieldName, fieldValue, language] of [
    ["german-name", germanName, "de"],
    ["english-name", englishName, "en"],
    ...Object.entries(hierarchy).map(([rank, name]) => [rank, name, ""]),
  ]) {
    database.prepare(`
      INSERT INTO master_field_assertion (
        master_taxon_id, field_name, field_value, normalized_value, language,
        origin_kind, provider_taxon_assertion_id, release_id, confidence,
        review_state, selected, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'source', ?, ?, 1, 'accepted', 1, ?, ?)
    `).run(
      masterTaxonId,
      fieldName,
      fieldValue,
      normalizeTaxonomySearchTerm(fieldValue),
      language,
      Number(source.lastInsertRowid),
      releaseId,
      NOW,
      NOW,
    );
    insertSearchTerm(database, {
      masterTaxonId,
      term: fieldValue,
      termKind: "vernacular",
      language,
      provider,
      weight: 2,
    });
  }
  insertSearchTerm(database, {
    masterTaxonId,
    term: scientificName,
    termKind: "scientific",
    provider,
    weight: 0,
  });
  database.prepare(`
    INSERT INTO master_taxon_status (
      master_taxon_id, status_name, status_detail, updated_at
    ) VALUES (?, ?, ?, ?)
  `).run(
    masterTaxonId,
    referenceState === "reference-gap" ? "col-reference-gap" : "col-confirmed",
    referenceState === "reference-gap" ? "Extern als Art bestätigt" : null,
    NOW,
  );
  if (projectSlug) {
    database.prepare(`
      INSERT INTO project_taxon_link (
        project_taxon_key, master_taxon_id, project_slug,
        scientific_name_at_link, link_state, linked_at, updated_at
      ) VALUES (?, ?, ?, ?, 'linked', ?, ?)
    `).run(
      `project:${projectSlug}`,
      masterTaxonId,
      projectSlug,
      scientificName,
      NOW,
      NOW,
    );
    insertSearchTerm(database, {
      masterTaxonId,
      term: projectSlug,
      termKind: "project",
      provider: "project",
      weight: 1,
    });
  }
}

async function createMasterFixture(taxonomyRoot, version = "master-fixture-v1") {
  const databasePath = taxonomyMasterDatabasePath(taxonomyRoot, "active");
  await fs.mkdir(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  try {
    createTaxonomyMasterSchema(database);
    for (const [provider, providerVersion, scope] of [
      ["catalogue-of-life", "COL fixture", "full"],
      ["gbif", "GBIF fixture", "relevant-slice"],
      ["project", "Projekt fixture", "project"],
    ]) {
      database.prepare(`
        INSERT INTO provider_release (
          release_id, provider, provider_version, data_scope, release_state,
          imported_at, record_count
        ) VALUES (?, ?, ?, ?, 'active', ?, 2)
      `).run(`${provider}-fixture`, provider, providerVersion, scope, NOW);
    }
    insertTaxon(database, {
      masterTaxonId: "mtx_calidris_alpina_fixture",
      scientificName: "Calidris alpina",
      germanName: "Alpenstrandläufer",
      englishName: "Dunlin",
      providerRecordId: "col-calidris",
      projectSlug: "calidrisalpina",
      hierarchy: {
        kingdom: "Animalia",
        phylum: "Chordata",
        subphylum: "Vertebrata",
        class: "Aves",
        order: "Charadriiformes",
        family: "Scolopacidae",
        genus: "Calidris",
        species: "Calidris alpina",
      },
    });
    insertTaxon(database, {
      masterTaxonId: "mtx_sciurus_vulgaris_fixture",
      scientificName: "Sciurus vulgaris",
      germanName: "Eurasisches Eichhörnchen",
      englishName: "Eurasian Red Squirrel",
      provider: "gbif",
      providerRecordId: "gbif-sciurus",
      referenceState: "reference-gap",
      leadingHierarchy: {
        kingdom: "Animalia",
        species: "Sciurus vulgaris",
      },
      hierarchy: {
        kingdom: "Animalia",
        phylum: "Chordata",
        class: "Mammalia",
        order: "Rodentia",
        family: "Sciuridae",
        genus: "Sciurus",
        species: "Sciurus vulgaris",
      },
    });
    insertSearchTerm(database, {
      masterTaxonId: "mtx_sciurus_vulgaris_fixture",
      term: "Red Squirrel",
      termKind: "vernacular",
      language: "en",
      provider: "gbif",
      weight: 8,
    });
    database.prepare(`
      INSERT INTO master_taxon_status (
        master_taxon_id, status_name, status_detail, updated_at
      ) VALUES ('mtx_sciurus_vulgaris_fixture', 'conflicting', NULL, ?)
    `).run(NOW);
    const resolvedAssertion = database.prepare(`
      SELECT assertion_id
      FROM master_field_assertion
      WHERE master_taxon_id = 'mtx_sciurus_vulgaris_fixture'
        AND field_name = 'german-name'
      LIMIT 1
    `).get();
    database.prepare(`
      INSERT INTO master_conflict (
        conflict_id, master_taxon_id, field_name, current_assertion_id,
        candidate_assertion_id, conflict_type, conflict_state, detected_at,
        resolved_at, resolution_note
      ) VALUES (
        'conflict-resolved-sciurus', 'mtx_sciurus_vulgaris_fixture',
        'german-name', ?, ?, 'changed-value', 'resolved-accept', ?, ?,
        'Fixture für bereits entschiedenen Konflikt'
      )
    `).run(resolvedAssertion.assertion_id, resolvedAssertion.assertion_id, NOW, NOW);
    insertSearchTerm(database, {
      masterTaxonId: "mtx_calidris_alpina_fixture",
      term: "Common Dunlin Bird",
      termKind: "vernacular",
      language: "en",
      provider: "catalogue-of-life",
      weight: 9,
    });
  } finally {
    database.close();
  }
  await fs.writeFile(taxonomyMasterManifestPath(taxonomyRoot, "active"), `${JSON.stringify({
    schemaVersion: 3,
    candidateId: version,
    activatedAt: NOW,
  }, null, 2)}\n`, "utf8");
}

test("Lightroom-Suchpaket exportiert vollständige Taxonomie und sucht offline", async () => {
  const { taxonomyRoot, searchRoot } = await createRoots();
  await createMasterFixture(taxonomyRoot);
  const progress = [];
  const manifest = await buildLightroomSearchPackage({
    taxonomyRoot,
    searchRoot,
    projectRevision: "fixture-revision",
    now: () => new Date(NOW),
    onProgress: (entry) => progress.push(entry.phase),
  });
  assert.equal(manifest.taxonCount, 2);
  assert.equal(manifest.projectTaxonCount, 1);
  assert.equal(manifest.providerCount, 3);
  assert.ok(manifest.nameCount >= 7);
  assert.deepEqual(progress, ["schema", "copy", "index", "validate", "complete"]);

  const activated = await activateLightroomSearchPackage(searchRoot, {
    verify: verifyLightroomSearchPackage,
    now: () => new Date(NOW),
  });
  assert.equal(activated.manifest.state, "active");
  assert.equal(activated.previousAvailable, false);

  const store = await openLightroomSearchStore({ searchRoot });
  try {
    assert.equal(store.search("Alpenstrand")[0].acceptedScientificName, "Calidris alpina");
    assert.equal(store.search("Dunl")[0].germanName, "Alpenstrandläufer");
    assert.equal(store.search("Dunlin Bird")[0].acceptedScientificName, "Calidris alpina");
    assert.equal(store.search("Sciurus vul")[0].referenceState, "reference-gap");
    const taxon = store.taxon("mtx_calidris_alpina_fixture");
    assert.equal(taxon.projectLinks.length, 1);
    assert.deepEqual(
      taxon.hierarchy.map((entry) => entry.rank),
      ["kingdom", "phylum", "subphylum", "class", "order", "family", "genus", "species"],
    );
    assert.equal(taxon.hierarchy[0].germanName, "Tiere");
    const sciurus = store.taxon("mtx_sciurus_vulgaris_fixture");
    assert.deepEqual(
      sciurus.hierarchy.map((entry) => entry.rank),
      ["kingdom", "phylum", "class", "order", "family", "genus", "species"],
    );
    assert.equal(
      sciurus.hierarchy.find((entry) => entry.rank === "phylum").source,
      "GBIF",
    );
    assert.equal(
      sciurus.statuses.some((entry) => entry.status === "conflicting"),
      false,
    );
    assert.throws(
      () => store.database.exec("DELETE FROM taxon"),
      /read-only|readonly/i,
    );
  } finally {
    store.close();
  }
});

test("kleine Namenskorrektur wird ohne Basisneubau gemeinsam und atomar aktiviert", async () => {
  const { taxonomyRoot, searchRoot } = await createRoots();
  await createMasterFixture(taxonomyRoot);
  await buildLightroomSearchPackage({ taxonomyRoot, searchRoot });
  await activateLightroomSearchPackage(searchRoot, {
    verify: verifyLightroomSearchPackage,
  });
  const databasePath = lightroomSearchDatabasePath(searchRoot, "active");
  const before = await fs.stat(databasePath);
  const corrections = [{
    scientificName: "Calidris alpina",
    rank: "species",
    kingdom: "Animalia",
    germanName: "Nordischer Strandläufer",
    englishName: "Dunlin",
    note: "Fixture-Korrektur",
  }];
  const activated = await activateTaxonomyCorrectionRelease({
    taxonomyRoot,
    searchRoot,
    corrections,
    now: () => new Date("2026-08-30T12:00:00.000Z"),
  });
  assert.equal(activated.release.entries.length, 1);
  assert.equal(
    activated.release.entries[0].masterTaxonId,
    "mtx_calidris_alpina_fixture",
  );
  const pointer = await readActiveTaxonomyCorrectionPointer(taxonomyRoot);
  assert.equal(pointer.activeRelease, activated.release.releaseId);
  assert.equal(pointer.revision, activated.release.revision);

  const packageStore = await openLightroomSearchStore({ searchRoot });
  try {
    assert.equal(packageStore.status().correctionRevision, activated.release.revision);
    assert.equal(
      packageStore.search("Nordischer Strand")[0].acceptedScientificName,
      "Calidris alpina",
    );
    assert.equal(
      packageStore.taxon("mtx_calidris_alpina_fixture").germanName,
      "Nordischer Strandläufer",
    );
  } finally {
    packageStore.close();
  }
  const masterStore = await openTaxonomyMasterStore({ taxonomyRoot });
  try {
    assert.equal(masterStore.status().correctionRevision, activated.release.revision);
    assert.equal(
      masterStore.search({ query: "Nordischer Strand", kingdom: "all" })
        .results[0].acceptedScientificName,
      "Calidris alpina",
    );
    assert.equal(
      masterStore.taxon("mtx_calidris_alpina_fixture").germanNames[0].name,
      "Nordischer Strandläufer",
    );
  } finally {
    masterStore.close();
  }
  const after = await fs.stat(databasePath);
  assert.equal(after.size, before.size);
  assert.equal(after.mtimeMs, before.mtimeMs);
});

test("Schnellweg verweigert das stille Entfernen einer fest eingebauten Korrektur", async () => {
  const { taxonomyRoot, searchRoot } = await createRoots();
  await createMasterFixture(taxonomyRoot);
  const database = new DatabaseSync(taxonomyMasterDatabasePath(taxonomyRoot, "active"));
  try {
    database.prepare(`
      INSERT INTO provider_release (
        release_id, provider, provider_version, data_scope, release_state,
        imported_at, record_count
      ) VALUES ('manual-fixture', 'manual', 'fixture', 'manual', 'active', ?, 1)
    `).run(NOW);
    database.prepare(`
      UPDATE master_field_assertion SET selected = 0
      WHERE master_taxon_id = 'mtx_calidris_alpina_fixture'
        AND field_name = 'german-name'
    `).run();
    database.prepare(`
      INSERT INTO master_field_assertion (
        master_taxon_id, field_name, field_value, normalized_value, language,
        origin_kind, release_id, confidence, review_state, selected,
        created_at, updated_at
      ) VALUES (
        'mtx_calidris_alpina_fixture', 'german-name', 'Eigener Strandläufer',
        'eigener strandlaufer', 'de', 'manual', 'manual-fixture', 1,
        'accepted', 1, ?, ?
      )
    `).run(NOW, NOW);
  } finally {
    database.close();
  }
  const manifestPath = taxonomyMasterManifestPath(taxonomyRoot, "active");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  await fs.writeFile(manifestPath, `${JSON.stringify({
    ...manifest,
    sources: [{ provider: "manual", recordCount: 1 }],
  }, null, 2)}\n`, "utf8");
  await buildLightroomSearchPackage({ taxonomyRoot, searchRoot });
  await activateLightroomSearchPackage(searchRoot, {
    verify: verifyLightroomSearchPackage,
  });
  await assert.rejects(
    activateTaxonomyCorrectionRelease({ taxonomyRoot, searchRoot, corrections: [] }),
    /vollständigen Master-Neuaufbau/,
  );
  assert.equal(await readActiveTaxonomyCorrectionPointer(taxonomyRoot), null);
});

test("Aktivierung bewahrt genau einen Rollback-Stand", async () => {
  const { taxonomyRoot, searchRoot } = await createRoots();
  await createMasterFixture(taxonomyRoot, "master-fixture-v1");
  await buildLightroomSearchPackage({ taxonomyRoot, searchRoot });
  await activateLightroomSearchPackage(searchRoot, {
    verify: verifyLightroomSearchPackage,
  });

  const masterDatabase = new DatabaseSync(taxonomyMasterDatabasePath(taxonomyRoot, "active"));
  try {
    masterDatabase.prepare(`
      UPDATE master_field_assertion
      SET field_value = 'Dunlin v2', normalized_value = 'dunlin v2'
      WHERE master_taxon_id = 'mtx_calidris_alpina_fixture'
        AND field_name = 'english-name' AND selected = 1
    `).run();
    masterDatabase.prepare(`
      UPDATE master_search_term SET term = 'Dunlin v2', normalized_term = 'dunlin v2',
        folded_term = 'dunlin v2', german_key = 'dunlin v2'
      WHERE master_taxon_id = 'mtx_calidris_alpina_fixture'
        AND term = 'Dunlin'
    `).run();
  } finally {
    masterDatabase.close();
  }
  await fs.writeFile(taxonomyMasterManifestPath(taxonomyRoot, "active"), `${JSON.stringify({
    schemaVersion: 3,
    candidateId: "master-fixture-v2",
    activatedAt: "2026-08-14T10:00:00.000Z",
  }, null, 2)}\n`, "utf8");
  await buildLightroomSearchPackage({ taxonomyRoot, searchRoot });
  const second = await activateLightroomSearchPackage(searchRoot, {
    verify: verifyLightroomSearchPackage,
  });
  assert.equal(second.previousAvailable, true);
  assert.equal(second.manifest.masterVersion, "master-fixture-v2");
  assert.equal((await inspectLightroomSearchPackages(searchRoot)).previous.masterVersion, "master-fixture-v1");

  const rolledBack = await rollbackLightroomSearchPackage(searchRoot, {
    verify: verifyLightroomSearchPackage,
  });
  assert.equal(rolledBack.manifest.masterVersion, "master-fixture-v1");
  assert.equal((await inspectLightroomSearchPackages(searchRoot)).previous.masterVersion, "master-fixture-v2");
});

test("Prüfsummenfehler verhindert die Paketfreigabe", async () => {
  const { taxonomyRoot, searchRoot } = await createRoots();
  await createMasterFixture(taxonomyRoot);
  await buildLightroomSearchPackage({ taxonomyRoot, searchRoot });
  await fs.appendFile(lightroomSearchDatabasePath(searchRoot, "staging"), "beschädigt");
  await assert.rejects(
    verifyLightroomSearchPackage({ searchRoot, slot: "staging" }),
    /Prüfsumme/,
  );
});
