import assert from "node:assert/strict";
import { taxonomyBuildCacheUsage } from "./taxonomy-build-cache.mjs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, test } from "node:test";
import { EventEmitter } from "node:events";
import { publishTaxonomyPair, rollbackTaxonomyPair, writeTaxonomyPublication } from "./taxonomy-publication.mjs";
import { readTaxonomyPublication, taxonomyPublicationPath } from "./taxonomy-publication-storage.mjs";
import { inspectTaxonomyMasterCandidate } from "./taxonomy-master-candidate.mjs";
import { readTaxonomyDataVersions } from "./taxonomy-data-versions.mjs";
import { rebuildLightroomSearchPackage } from "./lightroom-search-update.mjs";
import { prepareTaxonomyPublicationInWorker } from "./taxonomy-publication-process.mjs";
import { createTaxonomyMasterService } from "./taxonomy-master-service.mjs";
import { fileURLToPath } from "node:url";

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
import { createTaxonomyNamePreferenceService } from "./taxonomy-name-preference-service.mjs";
import { taxonomyCorrectionsRevision } from "./taxonomy-master-candidate.mjs";
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

function publicationProcessFixture(onSend) {
  const child = new EventEmitter();
  child.pid = 23456;
  child.stderr = new EventEmitter();
  child.stderr.setEncoding = () => {};
  child.kill = () => { queueMicrotask(() => { child.emit("exit", null); child.emit("disconnect"); }); };
  child.send = (...args) => onSend(child, ...args);
  return child;
}

test("Paarprozess wartet nach Exit auf das letzte IPC-Ergebnis und übergibt nur Auftragsdaten", async () => {
  const prepared = { pointer: { active: { id: "test" } }, result: { masterVersion: "test" } };
  const child = publicationProcessFixture((process, message, callback) => {
    assert.equal(message.type, "prepare");
    assert.equal(message.options.timestamp, NOW);
    assert.equal(message.options.onProgress, undefined);
    assert.equal(message.options.signal, undefined);
    assert.equal(message.options.writePointer, undefined);
    queueMicrotask(() => {
      callback();
      process.emit("exit", 0);
      setImmediate(() => {
        process.emit("message", { type: "prepared", prepared });
        process.emit("disconnect");
      });
    });
  });
  assert.deepEqual(await prepareTaxonomyPublicationInWorker({ spawnProcess: () => child,
    now: () => new Date(NOW) }), prepared);
});

test("Paarprozess meldet Start-, IPC-, Fortschritts- und Ergebnisfehler ohne Scheinaktivierung", async () => {
  const cases = [
    { name: "Startfehler", onSend: (child) => queueMicrotask(() => child.emit("error", new Error("Startfehler"))) },
    { name: "Sendefehler", onSend: () => { throw new Error("Sendefehler"); } },
    { name: "Kanalfehler", onSend: (_child, _message, callback) => callback(new Error("Kanalfehler")) },
    { name: "Fortschrittsfehler", onSend: (child) => queueMicrotask(() => child.emit("message", { type: "progress", event: {} })),
      onProgress: () => { throw new Error("Fortschrittsfehler"); } },
    { name: "unterbrochen", onSend: (child) => queueMicrotask(() => { child.emit("exit", 0); child.emit("disconnect"); }) },
    { name: "Fachfehler", onSend: (child) => queueMicrotask(() => {
      child.emit("message", { type: "failed", message: "Fachfehler" });
      child.emit("exit", 1); child.emit("disconnect");
    }) },
  ];
  for (const entry of cases) {
    const child = publicationProcessFixture(entry.onSend);
    await assert.rejects(prepareTaxonomyPublicationInWorker({ spawnProcess: () => child,
      onProgress: entry.onProgress }), new RegExp(entry.name), entry.name);
  }
});
const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => (
    fs.rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 })
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
  assert.deepEqual(progress, ["schema", "copy", "copy", "index", "validate", "complete"]);

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

test("Bestätigte Namenswahl und Rückwahl erreichen echte Master- und Lightroom-Leser ohne Basisneubau", async () => {
  const { root, taxonomyRoot, searchRoot } = await createRoots();
  await createMasterFixture(taxonomyRoot);
  const masterPath = taxonomyMasterManifestPath(taxonomyRoot, "active");
  const masterManifest = JSON.parse(await fs.readFile(masterPath, "utf8"));
  await fs.writeFile(masterPath, JSON.stringify({ ...masterManifest,
    sources: [{ provider: "catalogue-of-life", providerVersion: "COL fixture" }],
    inputRevisions: { corrections: taxonomyCorrectionsRevision([]) },
  }));
  await fs.writeFile(path.join(taxonomyRoot, "active.json"), JSON.stringify({ schemaVersion: 1, activeRelease: "COL fixture" }));
  const database = new DatabaseSync(taxonomyMasterDatabasePath(taxonomyRoot, "active"));
  try {
    insertSearchTerm(database, { masterTaxonId: "mtx_calidris_alpina_fixture", term: "Nordischer Strandläufer",
      termKind: "vernacular", language: "de", provider: "catalogue-of-life", weight: 3 });
  } finally { database.close(); }
  await buildLightroomSearchPackage({ taxonomyRoot, searchRoot });
  await activateLightroomSearchPackage(searchRoot, { verify: verifyLightroomSearchPackage });
  const correctionsPath = path.join(root, "corrections.json");
  await fs.writeFile(correctionsPath, JSON.stringify({ schemaVersion: 1, entries: [] }));
  const service = createTaxonomyNamePreferenceService({ taxonomyRoot, searchRoot, correctionsPath });
  const before = await fs.stat(lightroomSearchDatabasePath(searchRoot, "active"));
  for (const germanName of ["Nordischer Strandläufer", "Alpenstrandläufer"]) {
    const preview = await service.preview({ masterTaxonId: "mtx_calidris_alpina_fixture", germanName });
    assert.equal(preview.requiresConfirmation, true);
    await assert.rejects(service.save(preview), /bestätigt/);
    assert.equal((await service.save({ ...preview, confirmed: true })).saved, true);
    const lr = await openLightroomSearchStore({ searchRoot });
    const master = await openTaxonomyMasterStore({ taxonomyRoot });
    try {
      assert.equal(lr.taxon(preview.masterTaxonId).germanName, germanName);
      assert.equal(master.taxon(preview.masterTaxonId).germanNames[0].name, germanName);
      assert.equal(lr.taxon(preview.masterTaxonId).englishName, "Dunlin");
    } finally { lr.close(); master.close(); }
  }
  const after = await fs.stat(lightroomSearchDatabasePath(searchRoot, "active"));
  assert.equal(after.mtimeMs, before.mtimeMs);
  assert.equal(after.size, before.size);
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

async function activeFixture() {
  const result = await createRoots();
  await createMasterFixture(result.taxonomyRoot);
  await buildLightroomSearchPackage(result);
  await activateLightroomSearchPackage(result.searchRoot, { verify: verifyLightroomSearchPackage });
  return result;
}

async function stageFixture(taxonomyRoot) {
  const source = path.dirname(taxonomyMasterDatabasePath(taxonomyRoot));
  const target = path.dirname(taxonomyMasterDatabasePath(taxonomyRoot, "staging"));
  await fs.cp(source, target, { recursive: true });
  const manifest = JSON.parse(await fs.readFile(path.join(source, "manifest.json"), "utf8"));
  await fs.writeFile(path.join(target, "manifest.json"), JSON.stringify({ ...manifest, candidateId: "master-fixture-v2" }));
}

function semanticRows(file) {
  const database = new DatabaseSync(file, { readOnly: true });
  try {
    return Object.fromEntries(["provider_release", "taxon", "taxon_status", "taxon_provider", "project_link", "hierarchy", "search_term"].map((table) => {
      const columns = database.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name)
        .filter((name) => name !== "search_term_id").join(", ");
      return [table, database.prepare(`SELECT ${columns} FROM ${table} ORDER BY ${columns}`).all().map((row) => ({ ...row }))];
    }));
  } finally { database.close(); }
}

test("Delta entspricht Vollaufbau nach Namens-, Quellen-, Hierarchieänderung und Löschung; FTS bleibt konsistent", async () => {
  const options = await activeFixture();
  const { taxonomyRoot, searchRoot, root } = options;
  await stageFixture(taxonomyRoot);
  const database = new DatabaseSync(taxonomyMasterDatabasePath(taxonomyRoot, "staging"));
  database.exec(`PRAGMA foreign_keys=ON;
    DELETE FROM master_conflict WHERE master_taxon_id='mtx_sciurus_vulgaris_fixture';
    DELETE FROM master_field_assertion WHERE master_taxon_id='mtx_sciurus_vulgaris_fixture';
    DELETE FROM provider_taxon_assertion WHERE master_taxon_id='mtx_sciurus_vulgaris_fixture';
    DELETE FROM master_taxon WHERE master_taxon_id='mtx_sciurus_vulgaris_fixture';
    UPDATE master_field_assertion SET field_value='Dunlin changed' WHERE field_name='english-name';
    UPDATE master_field_assertion SET field_value='New family' WHERE field_name='family';
    UPDATE provider_release SET provider_version='new fixture';
    UPDATE master_search_term SET search_term_id=search_term_id+10000;
    DELETE FROM master_search_term WHERE term='Dunlin';
  `);
  insertSearchTerm(database, { masterTaxonId: "mtx_calidris_alpina_fixture", term: "DeltaOnly", termKind: "vernacular", provider: "manual", weight: 1 });
  database.close();
  const delta = await buildLightroomSearchPackage({ ...options, sourceSlot: "staging" });
  assert.equal(delta.build.mode, "incremental");
  assert.equal(delta.build.changes.taxon.written, 1);
  assert.equal(delta.build.changes.search_term.written, 1, "unchanged terms keep their local IDs");
  await buildLightroomSearchPackage({ taxonomyRoot, searchRoot: path.join(root, "full"), sourceSlot: "staging", incremental: false });
  assert.deepEqual(semanticRows(lightroomSearchDatabasePath(searchRoot, "staging")),
    semanticRows(lightroomSearchDatabasePath(path.join(root, "full"), "staging")));
  const store = await openLightroomSearchStore({ searchRoot, slot: "staging" });
  try {
    assert.equal(store.search("DeltaOnly").length, 1);
    assert.equal(store.search("Eichhörnchen").length, 0);
  } finally { store.close(); }
  await activateLightroomSearchPackage(searchRoot, { verify: verifyLightroomSearchPackage });
  const repeated = await buildLightroomSearchPackage({ ...options, sourceSlot: "staging" });
  assert.equal(repeated.build.changes.search_term.written, 0);
  assert.equal(repeated.build.changes.search_term.removedOrReplaced, 0);
});

test("Beschädigte Delta-Basis fällt auf Vollaufbau zurück; Abbruch erhält vorhandenes Staging", async () => {
  const options = await activeFixture();
  await fs.appendFile(lightroomSearchDatabasePath(options.searchRoot), "corrupt");
  const manifest = await buildLightroomSearchPackage(options);
  assert.equal(manifest.build.mode, "full");
  const before = await fs.readFile(lightroomSearchDatabasePath(options.searchRoot, "staging"));
  const controller = new AbortController();
  await assert.rejects(buildLightroomSearchPackage({ ...options, signal: controller.signal,
    onProgress: ({ phase }) => {
      if (phase === "copy") {
        assert.ok(taxonomyBuildCacheUsage().activeConnections > 0);
        controller.abort();
      }
    } }), /abort/i);
  assert.equal(taxonomyBuildCacheUsage().activeConnections, 0);
  assert.deepEqual(await fs.readFile(lightroomSearchDatabasePath(options.searchRoot, "staging")), before);
});

const fixtureCorrection = [{ scientificName: "Calidris alpina", germanName: "Test Strandläufer" }];

test("Altmanifest ohne Quellenübersicht bleibt ohne Zurückstellung regulär prüfbar", async () => {
  const options = await activeFixture();
  await stageFixture(options.taxonomyRoot);
  const manifest = JSON.parse(await fs.readFile(taxonomyMasterManifestPath(options.taxonomyRoot, "staging"), "utf8"));
  assert.equal(Object.hasOwn(manifest, "sources"), false);
  assert.equal(Object.hasOwn(manifest, "classificationDeferrals"), false);
  for (const validate of [false, true]) {
    const inspected = await inspectTaxonomyMasterCandidate(options.taxonomyRoot, { validate });
    assert.equal(inspected.available, true);
    assert.equal(inspected.blockingConflictCount, 0);
  }
});

test("Paarworker prüft und baut ohne Zeigerwechsel; nur der Elternprozess aktiviert und rollt zurück", async () => {
  const options = await activeFixture();
  await stageFixture(options.taxonomyRoot);
  const oldMaster = taxonomyMasterDatabasePath(options.taxonomyRoot);
  let pid = null, ticks = 0;
  const timer = setInterval(() => { ticks += 1; }, 2);
  const prepare = async (job) => {
    const prepared = await prepareTaxonomyPublicationInWorker({ ...job, projectRevision: "worker-test",
      onProgress(event) { pid = event.workerPid; },
    });
    assert.equal(readTaxonomyPublication(options.taxonomyRoot), null);
    assert.equal(taxonomyMasterDatabasePath(options.taxonomyRoot), oldMaster);
    return prepared;
  };
  try {
    const result = await publishTaxonomyPair({ ...options, confirmed: true, corrections: fixtureCorrection, prepare });
    assert.ok(pid && pid !== process.pid);
    assert.ok(ticks > 1, "Explorer event loop remains available during preparation");
    assert.equal(result.active.projectRevision, "worker-test");
    assert.equal(result.masterVersion, "master-fixture-v2");
    const stored = await openLightroomSearchStore(options);
    try { assert.equal(stored.search("Test Strandläufer")[0].germanName, "Test Strandläufer"); }
    finally { stored.close(); }
    const rollback = await rollbackTaxonomyPair({ ...options, confirmed: true, corrections: fixtureCorrection,
      prepare: prepareTaxonomyPublicationInWorker });
    assert.equal(rollback.masterVersion, "master-fixture-v1");
  } finally { clearInterval(timer); }
});

test("Paarworker-Abbruch und neue Eingaben nach Vorbereitung erhalten den aktiven Stand und erlauben neuen Versuch", async () => {
  const options = await activeFixture();
  await stageFixture(options.taxonomyRoot);
  const controller = new AbortController();
  await assert.rejects(publishTaxonomyPair({ ...options, confirmed: true, prepare: prepareTaxonomyPublicationInWorker,
    signal: controller.signal, onProgress(event) { if (event.workerPid) controller.abort(); },
  }), /abort/i);
  assert.equal(readTaxonomyPublication(options.taxonomyRoot), null);
  assert.deepEqual((await fs.readdir(options.searchRoot)).filter((name) => name.startsWith(".publication-")), []);
  let revision = 1;
  await assert.rejects(publishTaxonomyPair({ ...options, confirmed: true, readInputs: async () => revision,
    prepare: async (job) => { const prepared = await prepareTaxonomyPublicationInWorker(job); revision += 1; return prepared; },
  }), /zwischenzeitlich/);
  assert.equal(readTaxonomyPublication(options.taxonomyRoot), null);
  assert.deepEqual(await fs.readdir(path.join(options.searchRoot, "releases")), []);
  await publishTaxonomyPair({ ...options, confirmed: true, prepare: prepareTaxonomyPublicationInWorker });
  assert.equal(readTaxonomyPublication(options.taxonomyRoot).active.masterVersion, "master-fixture-v2");
});

test("Explorer-Schließen beendet die Paarvorbereitung ohne Aktivierung; erneutes Öffnen startet nichts", async () => {
  const options = await activeFixture();
  await stageFixture(options.taxonomyRoot);
  const speciesListPath = path.join(options.root, "species.json"), correctionsPath = path.join(options.root, "corrections.json");
  await fs.writeFile(speciesListPath, "[]"); await fs.writeFile(correctionsPath, '{"entries":[]}');
  let announce;
  const started = new Promise((resolve) => { announce = resolve; });
  const create = () => createTaxonomyMasterService({ ...options, speciesListPath, correctionsPath,
    readReferencePointer: async () => null, referenceService: { reset() {} },
    publishPair: (pair) => publishTaxonomyPair({ ...options, ...pair,
      prepare: (job) => prepareTaxonomyPublicationInWorker({ ...job, onProgress(event) {
        job.onProgress(event);
        if (event.workerPid) announce();
      } }),
    }),
  });
  const service = create();
  try {
    await service.activate({ confirmed: true });
    await started;
    await service.close();
    assert.equal(readTaxonomyPublication(options.taxonomyRoot), null);
    const reopened = create();
    try { assert.equal((await reopened.status()).active, false); }
    finally { await reopened.close(); }
  } finally { await service.close(); }
});

test("Gemeinsamer Zeiger erhält offene Leser, Präferenzen und Rückweg ohne Master-/Paketdrift", async () => {
  const options = await activeFixture();
  await activateTaxonomyCorrectionRelease({ ...options, corrections: fixtureCorrection });
  const oldMaster = await openTaxonomyMasterStore(options);
  const oldPackage = await openLightroomSearchStore(options);
  await stageFixture(options.taxonomyRoot);
  try {
    const result = await publishTaxonomyPair({ ...options, confirmed: true, corrections: fixtureCorrection });
    assert.equal(result.masterVersion, "master-fixture-v2");
    assert.equal(oldPackage.search("Test Strandläufer")[0].germanName, "Test Strandläufer");
    assert.equal(oldMaster.manifest.candidateId, "master-fixture-v1");
    const store = await openLightroomSearchStore(options);
    try {
      assert.equal(store.manifest.masterVersion, "master-fixture-v2");
      assert.equal(store.search("Test Strandläufer")[0].germanName, "Test Strandläufer");
    } finally { store.close(); }
    assert.equal((await inspectTaxonomyMasterCandidate(options.taxonomyRoot)).reason, "already-published");
    await assert.rejects(activateLightroomSearchPackage(options.searchRoot), /gemeinsam/);
    const unchangedPointer = await fs.readFile(taxonomyPublicationPath(options.taxonomyRoot), "utf8");
    await assert.rejects(rollbackTaxonomyPair({ ...options, confirmed: true,
      corrections: [{ ...fixtureCorrection[0], namePreference: { masterTaxonId: "wrong-identity" } }],
    }), /anderen Masteridentität/);
    assert.equal(await fs.readFile(taxonomyPublicationPath(options.taxonomyRoot), "utf8"), unchangedPointer);
    if (process.platform === "win32") {
      const differentlyCased = await openLightroomSearchStore({ searchRoot: options.searchRoot.toUpperCase() });
      try { assert.equal(differentlyCased.manifest.masterVersion, "master-fixture-v2"); }
      finally { differentlyCased.close(); }
    }
    await rollbackTaxonomyPair({ ...options, confirmed: true, corrections: fixtureCorrection });
    const restored = await openLightroomSearchStore(options);
    try {
      assert.equal(restored.manifest.masterVersion, "master-fixture-v1");
      assert.equal(restored.search("Test Strandläufer")[0].germanName, "Test Strandläufer");
    } finally { restored.close(); }
    assert.equal((await inspectTaxonomyMasterCandidate(options.taxonomyRoot)).available, false);
    await rollbackTaxonomyPair({ ...options, confirmed: true, corrections: fixtureCorrection });
    // Rebuild just the package from the same master: the overlay must be rebound too.
    await publishTaxonomyPair({ ...options, sourceSlot: "active", confirmed: true, corrections: fixtureCorrection });
    const refreshed = await openLightroomSearchStore(options);
    try { assert.equal(refreshed.search("Test Strandläufer")[0].germanName, "Test Strandläufer"); }
    finally { refreshed.close(); }
    const snapshot = await readTaxonomyDataVersions(options);
    assert.equal(snapshot.packageMasterVersion, "master-fixture-v2");
    assert.equal(snapshot.correctionRevision, (await readActiveTaxonomyCorrectionPointer(options.taxonomyRoot)).revision);
  } finally { oldMaster.close(); oldPackage.close(); }
});

test("Paketfehler, geänderte Eingaben und Zeigerfehler lassen das aktive Paar unverändert", async () => {
  const options = await activeFixture();
  await stageFixture(options.taxonomyRoot);
  const oldPackagePath = lightroomSearchDatabasePath(options.searchRoot);
  const oldMasterPath = taxonomyMasterDatabasePath(options.taxonomyRoot);
  await assert.rejects(publishTaxonomyPair({ ...options, confirmed: true,
    buildPackage: async () => { throw new Error("package failed"); } }), /package failed/);
  assert.equal(taxonomyBuildCacheUsage().activeConnections, 0);
  assert.equal(readTaxonomyPublication(options.taxonomyRoot), null);
  let revision = 1;
  await assert.rejects(publishTaxonomyPair({ ...options, confirmed: true,
    readInputs: async () => revision,
    buildPackage: async (build) => { await buildLightroomSearchPackage(build); revision += 1; },
  }), /zwischenzeitlich/);
  assert.equal(readTaxonomyPublication(options.taxonomyRoot), null);
  await assert.rejects(publishTaxonomyPair({ ...options, confirmed: true,
    writePointer: async () => { throw new Error("disk failed"); },
  }), /disk failed/);
  assert.equal(lightroomSearchDatabasePath(options.searchRoot), oldPackagePath);
  assert.equal(taxonomyMasterDatabasePath(options.taxonomyRoot), oldMasterPath);
  await publishTaxonomyPair({ ...options, confirmed: true });
  const original = await fs.readFile(taxonomyPublicationPath(options.taxonomyRoot), "utf8");
  await assert.rejects(writeTaxonomyPublication(options.taxonomyRoot, {}, { rename: async () => {
    assert.equal(await fs.readFile(taxonomyPublicationPath(options.taxonomyRoot), "utf8"), original);
    throw Object.assign(new Error("busy pointer"), { code: "EPERM" });
  } }), /busy pointer/);
  assert.equal(await fs.readFile(taxonomyPublicationPath(options.taxonomyRoot), "utf8"), original);
});

test("Explorer-Dienst baut das gemeinsame Paket in echtem Hintergrundprozess und aktiviert erst danach", async () => {
  const options = await activeFixture();
  await stageFixture(options.taxonomyRoot);
  const speciesListPath = path.join(options.root, "species.json");
  const correctionsPath = path.join(options.root, "corrections.json");
  await fs.writeFile(speciesListPath, "[]");
  await fs.writeFile(correctionsPath, '{"schemaVersion":1,"entries":[]}');
  let fail = true;
  const service = createTaxonomyMasterService({ ...options, speciesListPath, correctionsPath,
    referenceService: { reset() {} }, readReferencePointer: async () => null,
    activateCandidate: async () => { throw new Error("standalone activation forbidden"); },
    publishPair: (pairOptions) => publishTaxonomyPair({ ...options, ...pairOptions,
      buildPackage: async (build) => {
        assert.equal(readTaxonomyPublication(options.taxonomyRoot), null);
        if (fail) throw new Error("worker failure");
        return rebuildLightroomSearchPackage({ ...build, activate: false,
          repoRoot: fileURLToPath(new URL("../", import.meta.url)) });
      },
    }),
  });
  try {
    await service.activate({ confirmed: true });
    await service.runPromise;
    assert.equal(service.state.status, "failed", "not a partial master activation");
    assert.equal(readTaxonomyPublication(options.taxonomyRoot), null);
    fail = false;
    await service.activate({ confirmed: true });
    await service.runPromise;
    assert.equal(service.state.status, "completed", service.state.error);
    assert.equal(readTaxonomyPublication(options.taxonomyRoot).active.masterVersion, "master-fixture-v2");
  } finally { await service.close(); }
});

test("Paarfreigabe überschreibt keine im Kandidaten entschiedene Altpräferenz und sperrt fremde ID-Bindungen", async () => {
  const options = await activeFixture();
  await stageFixture(options.taxonomyRoot);
  const manifestPath = taxonomyMasterManifestPath(options.taxonomyRoot, "staging");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  await fs.writeFile(manifestPath, JSON.stringify({ ...manifest,
    inputRevisions: { corrections: taxonomyCorrectionsRevision(fixtureCorrection) } }));
  await publishTaxonomyPair({ ...options, confirmed: true, corrections: fixtureCorrection });
  const store = await openLightroomSearchStore(options);
  try {
    assert.equal(store.taxon("mtx_calidris_alpina_fixture").germanName, "Alpenstrandläufer",
      "The prepared master's decision, not a second name-only interpretation, is authoritative");
  } finally { store.close(); }
  await assert.rejects(activateTaxonomyCorrectionRelease({ ...options,
    corrections: [{ ...fixtureCorrection[0], namePreference: { masterTaxonId: "different-identity" } }],
  }), /anderen Masteridentität/);
  const speciesListPath = path.join(options.root, "species.json");
  const correctionsPath = path.join(options.root, "corrections.json");
  await fs.writeFile(speciesListPath, "[]");
  await fs.writeFile(correctionsPath, JSON.stringify({ entries: fixtureCorrection }));
  const service = createTaxonomyMasterService({ ...options, lightroomSearchRoot: options.searchRoot,
    speciesListPath, correctionsPath, referenceService: { reset() {} },
    inspectLightroomPackages: () => inspectLightroomSearchPackages(options.searchRoot),
    activateCorrections: async () => { throw new Error("Must not reapply old names at startup"); },
  });
  try { assert.equal(await service.ensureCorrectionBaseline(), false); }
  finally { await service.close(); }
});
