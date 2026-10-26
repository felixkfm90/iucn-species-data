import { tmpdir } from "../scripts/test-temp.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { classificationRetentionMarker } from "./taxonomy-classification-retention.mjs";
import { createTaxonomyMasterSchema } from "./taxonomy-master-schema.mjs";
import { TaxonomyMasterStore } from "./taxonomy-master-store.mjs";
import { LightroomSearchStore } from "./lightroom-search-store.mjs";
import { createLightroomSearchRequestHandler } from "./lightroom-search-helper.mjs";
import { createLightroomSearchSchema, finalizeLightroomSearchSchema, inspectLightroomSearchDatabase,
  LIGHTROOM_SEARCH_READER_CONTRACT } from "./lightroom-search-schema.mjs";
import { buildLightroomSearchPackage, verifyLightroomSearchPackage } from "./lightroom-search-package.mjs";
import { activateLightroomSearchPackage, rollbackLightroomSearchPackage, lightroomSearchDatabasePath } from "./lightroom-search-storage.mjs";
import { taxonomyMasterDatabasePath, taxonomyMasterManifestPath } from "./taxonomy-master-storage.mjs";
import { createTaxonomyReferenceService } from "./taxonomy-reference-service.mjs";
import { createSpeciesCreateOperations } from "./species-create.mjs";
import { createExplorerServer } from "./server.mjs";
import { createEditableFixture, registerFixtureCleanup, serverFixtureStoragePaths } from "./server-test-fixtures.mjs";

// Frozen output of the synthetic Core builder: historical matching, current missing provider ID.
const marker = JSON.parse(await fs.readFile(new URL("../scripts/fixtures/taxonomy/classification-retention-marker.json", import.meta.url), "utf8"));
const differentMarker = JSON.parse(await fs.readFile(new URL("../scripts/fixtures/taxonomy/classification-retention-different-marker.json", import.meta.url), "utf8"));
const retainedId = marker.masterTaxonId, ordinaryId = `mtx_${"2".repeat(32)}`;
const NOW = "2026-01-03T00:00:00.000Z", name = marker.identity.scientificName;
const hashText = value => createHash("sha256").update(value).digest("hex");
const corrections = { releaseId: "fixture-corrections", entries: [
  { masterTaxonId: retainedId, germanName: "Historischer Quellenname" },
  { masterTaxonId: ordinaryId, germanName: "Gewöhnlicher Quellenname" },
] };

async function directory(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "retention-consumers-"));
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 }));
  return root;
}

function seedMaster(database, { retained = true, retentionMarker = marker } = {}) {
  createTaxonomyMasterSchema(database);
  for (const [id, scientificName, detail] of [
    [retainedId, name, retained ? JSON.stringify(retentionMarker) : "normaler Altbestand"],
    [ordinaryId, "Testus normalis", "normaler Altbestand"],
  ]) {
    database.prepare(`INSERT INTO master_taxon VALUES (?, ?, ?, 'species', 'Bacillati', 'stale', 'reference-gap', ?, ?)`)
      .run(id, scientificName, scientificName.toLowerCase(), NOW, NOW);
    database.prepare("INSERT INTO master_taxon_status VALUES (?, 'stale', ?, ?)").run(id, detail, NOW);
    database.prepare(`INSERT INTO master_search_term (master_taxon_id,term,normalized_term,folded_term,german_key,term_kind,language,source_provider,weight)
      VALUES (?, ?, ?, ?, ?, 'scientific', '', 'manual', 1)`)
      .run(id, scientificName, scientificName.toLowerCase(), scientificName.toLowerCase(), scientificName.toLowerCase());
  }
}

function searchDatabase({ retained = true, detail = JSON.stringify(marker) } = {}) {
  const database = new DatabaseSync(":memory:");
  createLightroomSearchSchema(database);
  for (const [id, scientificName, statusDetail] of [
    [retainedId, name, retained ? detail : "normaler Altbestand"],
    [ordinaryId, "Testus normalis", "normaler Altbestand"],
  ]) {
    database.prepare(`INSERT INTO taxon VALUES (?, ?, 'species', 'Bacillati', NULL, NULL, 'stale', 'reference-gap', ?)`)
      .run(id, scientificName, NOW);
    database.prepare("INSERT INTO taxon_status VALUES (?, 'stale', ?, ?)").run(id, statusDetail, NOW);
    database.prepare("INSERT INTO search_term VALUES (NULL, ?, ?, ?, ?, ?, 'scientific', '', 'manual', 1)")
      .run(id, scientificName, scientificName.toLowerCase(), scientificName.toLowerCase(), scientificName.toLowerCase());
  }
  finalizeLightroomSearchSchema(database);
  return database;
}

test("Retention sperrt Masterindex, Fallback, Korrekturtreffer und direkte Namenssuche; Admin und gewöhnliches stale bleiben", t => {
  assert.equal(classificationRetentionMarker(marker).revision, marker.revision);
  for (const indexed of [true, false]) {
    const database = new DatabaseSync(":memory:");
    seedMaster(database);
    if (!indexed) database.exec("DROP TABLE master_search_term");
    const store = new TaxonomyMasterStore({ database, manifest: { candidateId: "fixture" }, taxonomyRoot: tmpdir(), correctionRelease: corrections });
    try {
      for (const query of [name, "Historischer Quellenname"]) assert.deepEqual(store.search({ query, kingdom: "all" }).results, []);
      assert.equal(store.search({ query: "Testus normalis", kingdom: "all" }).results[0].masterTaxonId, ordinaryId);
      assert.equal(store.search({ query: "Gewöhnlicher Quellenname", kingdom: "all" }).results[0].masterTaxonId, ordinaryId);
      assert.equal(store.findTaxonByScientificName(name, { rank: "species" }), null);
      assert.equal(store.findTaxonByScientificName("Testus normalis", { rank: "species" }).masterTaxonId, ordinaryId);
      const admin = store.taxon(retainedId);
      assert.equal(admin.assignmentAllowed, false);
      assert.equal(admin.classificationRetention.revision, marker.revision);
      assert.equal(admin.masterStatuses.find(row => row.id === "stale").detail, JSON.stringify(marker));
      assert.equal(store.taxon(ordinaryId).assignmentAllowed, undefined);
    } finally { store.close(); }
  }
});

test("Lightroom blendet nur Retention aus Suche und Korrektur aus; Einzelübernahme sperrt, Bulkpflege erhält stale", async () => {
  const database = searchDatabase();
  const store = new LightroomSearchStore({ database, manifest: { packageId: "fixture" }, searchRoot: tmpdir(), correctionRelease: corrections });
  const handler = await createLightroomSearchRequestHandler({ openStore: async () => store });
  try {
    for (const query of [name, "retentus", "Historischer Quellenname"]) assert.deepEqual(store.search(query), []);
    assert.equal(store.search("normalis")[0].masterTaxonId, ordinaryId);
    assert.equal(store.search("Gewöhnlicher Quellenname")[0].masterTaxonId, ordinaryId);
    const single = await handler.handle({ command: "taxon", masterTaxonId: retainedId });
    assert.equal(single.ok, false);
    assert.equal(single.error.code, "classification-source-retained");
    const bulk = await handler.handle({ command: "taxa", masterTaxonIds: [retainedId, ordinaryId] });
    assert.equal(bulk.ok, true);
    assert.equal(bulk.result.taxa.find(row => row.masterTaxonId === retainedId).lifecycleState, "stale");
    assert.equal((await handler.handle({ command: "taxon", masterTaxonId: ordinaryId })).ok, true);
  } finally { await handler.close(); }
});

test("Schema 2 bindet den Retentionsleser; alter Schema-1-Bestand bleibt lesbar und Marker darin sind hart gesperrt", () => {
  const database = searchDatabase({ retained: false });
  try {
    assert.equal(inspectLightroomSearchDatabase(database, { full: true, manifest: { schemaVersion: 2, readerContract: LIGHTROOM_SEARCH_READER_CONTRACT } }).schemaVersion, 2);
    assert.throws(() => inspectLightroomSearchDatabase(database, { manifest: { schemaVersion: 2 } }), /Leservertrag/);
    database.prepare("DELETE FROM package_info WHERE key='readerContract'").run();
    assert.throws(() => inspectLightroomSearchDatabase(database), /Leservertrag/);
    database.prepare("INSERT INTO package_info VALUES ('readerContract', ?)").run(LIGHTROOM_SEARCH_READER_CONTRACT);
    database.prepare("UPDATE package_info SET value='1' WHERE key='schemaVersion'").run();
    database.prepare("DELETE FROM package_info WHERE key='readerContract'").run();
    database.exec("PRAGMA user_version=1");
    assert.equal(inspectLightroomSearchDatabase(database, { manifest: { schemaVersion: 1 } }).schemaVersion, 1);
    database.prepare("UPDATE taxon_status SET status_detail=? WHERE master_taxon_id=?").run(JSON.stringify(marker), retainedId);
    assert.throws(() => inspectLightroomSearchDatabase(database), /Schema 1/);
    database.prepare("UPDATE taxon_status SET status_detail=? WHERE master_taxon_id=?")
      .run(JSON.stringify(marker).replace("classification-source-retention", "classification\\u002dsource-retention"), retainedId);
    assert.throws(() => inspectLightroomSearchDatabase(database), /Schema 1/, "JSON-Escaping umgeht die Markererkennung nicht");
  } finally { database.close(); }
});

test("Defekte eigene Marker und falscher Statuskontext werden vor Paketnutzung hart abgelehnt", () => {
  for (const detail of [
    JSON.stringify({ ...marker, revision: "0".repeat(64) }),
    '{"kind":"classification-source-retention",',
    '{"policy":"unused-classification-retention-v1",',
    JSON.stringify({ policy: LIGHTROOM_SEARCH_READER_CONTRACT, kind: "wrong" }),
  ]) {
    const database = searchDatabase({ detail });
    try { assert.throws(() => inspectLightroomSearchDatabase(database), { code: "CLASSIFICATION_RETENTION_INVALID" }); }
    finally { database.close(); }
  }
  for (const mutate of [
    db => db.prepare("UPDATE taxon_status SET status_name='conflicting' WHERE master_taxon_id=?").run(retainedId),
    db => db.prepare("UPDATE taxon_status SET status_detail=? WHERE master_taxon_id=?").run(JSON.stringify(marker), ordinaryId),
    db => db.prepare("UPDATE taxon SET lifecycle_state='active' WHERE master_taxon_id=?").run(retainedId),
    db => db.prepare("UPDATE taxon SET reference_state='exact-col' WHERE master_taxon_id=?").run(retainedId),
  ]) {
    const database = searchDatabase();
    try { mutate(database); assert.throws(() => inspectLightroomSearchDatabase(database), { code: "CLASSIFICATION_RETENTION_INVALID" }); }
    finally { database.close(); }
  }
});

test("Voll- und Deltaexport erhalten dieselben Retentionsbelege; Schema-1-Basis erzwingt Vollaufbau", async t => {
  const root = await directory(t), taxonomyRoot = path.join(root, "taxonomy"), searchRoot = path.join(root, "search");
  const source = taxonomyMasterDatabasePath(taxonomyRoot);
  await fs.mkdir(path.dirname(source), { recursive: true });
  const db = new DatabaseSync(source);
  try { seedMaster(db, { retained: false }); } finally { db.close(); }
  await fs.writeFile(taxonomyMasterManifestPath(taxonomyRoot), JSON.stringify({ schemaVersion: 3, candidateId: "fixture-master", activatedAt: NOW }));
  const build = target => buildLightroomSearchPackage({ taxonomyRoot, searchRoot: target, now: () => new Date(NOW), projectRevision: "fixture" });
  await build(searchRoot);
  await activateLightroomSearchPackage(searchRoot, { verify: verifyLightroomSearchPackage });
  const changed = new DatabaseSync(source);
  try { changed.prepare("UPDATE master_taxon_status SET status_detail=? WHERE master_taxon_id=?").run(JSON.stringify(marker), retainedId); }
  finally { changed.close(); }
  const incremental = await build(searchRoot), fullRoot = path.join(root, "full");
  const full = await build(fullRoot);
  assert.equal(incremental.schemaVersion, 2); assert.equal(full.readerContract, LIGHTROOM_SEARCH_READER_CONTRACT);
  assert.equal(incremental.build.mode, "incremental");
  const snapshots = [];
  for (const target of [searchRoot, fullRoot]) {
    const result = await verifyLightroomSearchPackage({ searchRoot: target, slot: "staging" });
    const database = new DatabaseSync(result.databasePath, { readOnly: true });
    try {
      snapshots.push(JSON.parse(JSON.stringify(database.prepare("SELECT * FROM taxon_status ORDER BY master_taxon_id,status_name").all())));
      assert.equal(inspectLightroomSearchDatabase(database).statusCount, 2);
      const store = new LightroomSearchStore({ database, manifest: result.manifest, searchRoot: target, slot: "staging" });
      assert.deepEqual(store.search(name), []);
      assert.equal(store.taxon(retainedId).assignmentAllowed, false);
      assert.equal(store.search("normalis")[0].masterTaxonId, ordinaryId);
    } finally { database.close(); }
  }
  assert.deepEqual(snapshots[0], snapshots[1]);
  const retainedManifestPath = path.join(fullRoot, "staging", "manifest.json");
  const beforeManifest = await fs.readFile(retainedManifestPath);
  await assert.rejects(activateLightroomSearchPackage(fullRoot, { verify: verifyLightroomSearchPackage }), { code: "CLASSIFICATION_RETENTION_PAIR_REQUIRED" });
  assert.deepEqual(await fs.readFile(retainedManifestPath), beforeManifest, "Ablehnung schreibt keinen Aktivierungsstatus");
  await fs.rename(path.join(fullRoot, "staging"), path.join(fullRoot, "previous"));
  await assert.rejects(rollbackLightroomSearchPackage(fullRoot, { verify: verifyLightroomSearchPackage }), { code: "CLASSIFICATION_RETENTION_PAIR_REQUIRED" });
  assert.deepEqual(await fs.readFile(path.join(fullRoot, "previous", "manifest.json")), beforeManifest);
  const legacyPath = lightroomSearchDatabasePath(searchRoot);
  const legacy = new DatabaseSync(legacyPath);
  try {
    legacy.prepare("UPDATE package_info SET value='1' WHERE key='schemaVersion'").run();
    legacy.prepare("DELETE FROM package_info WHERE key='readerContract'").run();
    legacy.exec("PRAGMA user_version=1");
  } finally { legacy.close(); }
  const manifestPath = path.join(path.dirname(legacyPath), "manifest.json");
  const legacyManifest = JSON.parse(await fs.readFile(manifestPath));
  legacyManifest.schemaVersion = 1; delete legacyManifest.readerContract;
  legacyManifest.checksum = `sha256:${hashText(await fs.readFile(legacyPath))}`;
  await fs.writeFile(manifestPath, JSON.stringify(legacyManifest));
  assert.equal((await build(searchRoot)).build.reason, "reader-contract-upgrade");
});

test("Referenzdienst erhält Admin-Detail, prüft eine direkte ID gegen den aktuellen Master und sperrt unbekannte IDs", async () => {
  let retained = false;
  const detail = () => ({ masterTaxonId: retainedId, scientific_name: name, lifecycleState: "stale", referenceState: "reference-gap",
    masterStatuses: [{ id: "stale", detail: retained ? JSON.stringify(marker) : "normaler Altbestand" }], germanNames: [], englishNames: [], hierarchy: [] });
  const service = createTaxonomyReferenceService({ taxonomyRoot: tmpdir(), readMasterManifest: async () => ({ candidateId: "fixture" }),
    readCorrectionPointer: async () => null, readPointer: async () => ({ activeRelease: "fixture-col" }),
    openStore: async () => ({ close() {}, status: () => ({ releaseId: "fixture-col" }) }),
    openMasterStore: async () => ({ close() {}, status: () => ({ candidateId: "fixture" }), taxon: id => id === retainedId ? detail() : null }) });
  try {
    assert.equal((await service.assertAssignable(retainedId)).masterTaxonId, retainedId);
    retained = true;
    assert.equal((await service.taxon(retainedId)).masterTaxonId, retainedId);
    await assert.rejects(service.assertAssignable(retainedId), { code: "classification-source-retained", statusCode: 409 });
    await assert.rejects(service.assertAssignable(ordinaryId), { statusCode: 409 });
  } finally { service.close(); }
});

test("Rohe CoL- und Ergänzungsreferenzen bleiben nach exakt zurückgehaltener Anbieter-ID gesperrt; gleichnamige andere IDs bleiben", async t => {
  assert.equal(differentMarker.currentCase.category, "different-provider-id");
  assert.equal(classificationRetentionMarker(differentMarker).masterTaxonId, retainedId);
  let retained = false, remapped = false;
  const supplementIds = [`stx_${"1".repeat(24)}`, `stx_${"2".repeat(24)}`];
  const basic = { acceptedScientificName: name, scientific_name: name, rank: "species", kingdom: "Bacillati", germanNames: [], englishNames: [], hierarchy: [] };
  const supplements = supplementIds.map((taxonId, index) => ({ ...basic, taxonId, records: [{ provider: "inaturalist", providerRecordId: index ? "102" : "101" }] }));
  const service = createTaxonomyReferenceService({ taxonomyRoot: tmpdir(),
    readMasterManifest: async () => ({ candidateId: retained ? "after" : "before" }), readCorrectionPointer: async () => null,
    readPointer: async () => ({ activeRelease: remapped ? "fixture-col-remapped" : "fixture-col" }),
    openStore: async () => ({ close() {}, status: () => ({ releaseId: "fixture-col" }),
      search: () => ({ results: [[17, "12345"], [12345, "12346"]].map(([id, sourceId]) => ({ ...basic, taxonId: id, sourceId })) }),
      taxon: id => ({ ...basic, taxon_id: Number(id), source_id: (remapped ? Number(id) === 99 : Number(id) === 17) ? "12345" : "12346" }) }),
    openMasterStore: async () => {
      const database = new DatabaseSync(":memory:"); seedMaster(database, { retained, retentionMarker: differentMarker });
      return new TaxonomyMasterStore({ database, manifest: { candidateId: retained ? "after" : "before" }, taxonomyRoot: tmpdir() });
    },
    supplementService: { search: async () => supplements, taxon: async id => ({ ...basic, taxonId: id }),
      findProviderOnlyTaxon: id => supplements.find(row => row.taxonId === id), augmentTaxon: async detail => detail },
  });
  t.after(() => service.close());
  const repoRoot = await directory(t), speciesListPath = path.join(repoRoot, "species_list.json");
  await fs.writeFile(speciesListPath, "[]");
  const tokens = new Map(), operations = createSpeciesCreateOperations({ repoRoot, speciesListPath, backupDir: path.join(repoRoot, "backups"),
    previewTokens: tokens, cleanupPreviewTokens() {}, getModel: () => ({ species: [] }), hashText,
    isPipelineBusy: () => false, isAssetWriteActive: () => false, assertTaxonomyAssignable: id => service.assertAssignable(id) });
  const values = { german: "Testvogel", english: "Test Bird", scientificName: name, size: "ca. 20 cm", weight: "ca. 50 g", lifeExpectancy: "ca. 5 Jahre" };
  const previews = [];
  for (const reference of ["17", supplementIds[0]]) previews.push(await operations.previewNewSpecies({ values, taxonomyReference: reference }));
  retained = true;
  const result = await service.search({ query: name, kingdomId: "all", rank: "species", limit: 12 });
  assert.deepEqual(result.results.map(row => String(row.taxonId)).sort(), ["12345", supplementIds[1]].sort());
  for (const reference of ["17", supplementIds[0]]) {
    assert.equal((await service.taxon(reference)).assignmentAllowed, false);
    await assert.rejects(service.assertAssignable(reference), { code: "classification-source-retained" });
    await assert.rejects(operations.previewNewSpecies({ values, taxonomyReference: reference }), { statusCode: 409 });
  }
  for (const preview of previews) await assert.rejects(operations.saveNewSpecies({ token: preview.token }), { statusCode: 409 });
  for (const reference of ["12345", supplementIds[1]]) assert.ok(await service.assertAssignable(reference));
  remapped = true;
  assert.equal((await service.assertAssignable("17")).assignmentBinding.providerRecords[0].providerRecordId, "12346");
  assert.equal((await service.taxon("99")).assignmentAllowed, false);
  await assert.rejects(operations.saveNewSpecies({ token: previews[0].token }), { statusCode: 409 }, "Lokale ID bleibt trotz neuer zulässiger Belegung an den früheren Anbieterbeleg gebunden");
  assert.equal(await fs.readFile(speciesListPath, "utf8"), "[]");
  await assert.rejects(fs.stat(path.join(repoRoot, "backups")), { code: "ENOENT" });
});

test("Wiederverwendete lokale Referenznummer ersetzt den stabil ausgewählten Anbieterbeleg eines Artentwurfs nicht", async t => {
  const repoRoot = await directory(t), speciesListPath = path.join(repoRoot, "species_list.json"), backupDir = path.join(repoRoot, "backups");
  await fs.writeFile(speciesListPath, "[]");
  let providerRecordId = "12345";
  const operations = createSpeciesCreateOperations({ repoRoot, speciesListPath, backupDir, previewTokens: new Map(),
    cleanupPreviewTokens() {}, getModel: () => ({ species: [], summary: {}, validation: {} }), refreshModel: async () => {},
    hashText, compactTimestamp: () => "fixture", isPipelineBusy: () => false, isAssetWriteActive: () => false,
    assertTaxonomyAssignable: async reference => ({ assignmentBinding: { reference, providerRecords: [{ provider: "catalogue-of-life", providerRecordId }] } }) });
  const values = { german: "Testvogel", english: "Test Bird", scientificName: name, size: "ca. 20 cm", weight: "ca. 50 g", lifeExpectancy: "ca. 5 Jahre" };
  const preview = await operations.previewNewSpecies({ values, taxonomyReference: "17" });
  providerRecordId = "12346";
  await assert.rejects(operations.saveNewSpecies({ token: preview.token }), { statusCode: 409 });
  assert.equal(await fs.readFile(speciesListPath, "utf8"), "[]");
  await assert.rejects(fs.stat(backupDir), { code: "ENOENT" });
});

test("Artvorschau und gespeicherter Token prüfen die gewählte ID erneut vor jeder Dateiänderung; manuelle Artanlage bleibt möglich", async t => {
  const repoRoot = await directory(t), speciesListPath = path.join(repoRoot, "species_list.json"), backupDir = path.join(repoRoot, "backups");
  await fs.writeFile(speciesListPath, "[]");
  const previewTokens = new Map(), checked = [];
  let retained = true;
  const operations = createSpeciesCreateOperations({ repoRoot, speciesListPath, backupDir, previewTokens,
    cleanupPreviewTokens() {}, getModel: () => ({ species: [] }), hashText, compactTimestamp: () => "fixture",
    isPipelineBusy: () => false, isAssetWriteActive: () => false,
    assertTaxonomyAssignable: async id => { checked.push(id); if (retained) throw Object.assign(new Error("Historischer Bestand"), { statusCode: 409 }); } });
  const values = { german: "Testvogel", english: "Test Bird", scientificName: "Testus avis", size: "ca. 20 cm", weight: "ca. 50 g", lifeExpectancy: "ca. 5 Jahre" };
  await assert.rejects(operations.previewNewSpecies({ values, masterTaxonId: retainedId }), { statusCode: 409 });
  await assert.rejects(operations.previewNewSpecies({ values: { ...values, masterTaxonId: retainedId } }), { statusCode: 409 });
  assert.equal(previewTokens.size, 0);
  retained = false;
  const preview = await operations.previewNewSpecies({ values, masterTaxonId: retainedId });
  retained = true;
  await assert.rejects(operations.saveNewSpecies({ token: preview.token }), { statusCode: 409 });
  assert.deepEqual(checked, [retainedId, retainedId, retainedId, retainedId]);
  assert.equal(await fs.readFile(speciesListPath, "utf8"), "[]");
  await assert.rejects(fs.stat(backupDir), { code: "ENOENT" });
  await assert.rejects(operations.previewNewSpecies({ masterTaxonId: retainedId, values: { ...values, masterTaxonId: ordinaryId } }), { statusCode: 400 });
  const manual = await operations.previewNewSpecies({ values });
  assert.ok(manual.token);
  assert.equal(checked.length, 4);
});

test("Echte Neue-Art-Endpunkte sperren direkte und zwischen Vorschau und Speicherung zurückbehaltene IDs", async t => {
  const repoRoot = await createEditableFixture(), cleanup = registerFixtureCleanup(t, repoRoot);
  const { taxonomyRoot, lightroomSearchRoot } = serverFixtureStoragePaths(repoRoot);
  const source = taxonomyMasterDatabasePath(taxonomyRoot);
  await fs.mkdir(path.dirname(source), { recursive: true });
  const database = new DatabaseSync(source);
  try { seedMaster(database, { retained: false }); } finally { database.close(); }
  await fs.writeFile(taxonomyMasterManifestPath(taxonomyRoot), JSON.stringify({ schemaVersion: 3, candidateId: "fixture-master", activatedAt: NOW }));
  const server = await createExplorerServer({ repoRoot, taxonomyRoot, lightroomSearchRoot, port: 0, sessionProtection: false,
    publishAssetChanges: false, rebuildReportAfterAssetSave: false });
  cleanup(server);
  const address = await server.listen(), url = `http://127.0.0.1:${address.port}`;
  const post = async (action, body) => {
    const response = await fetch(`${url}/api/species/new/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, ...(await response.json()) };
  };
  const values = { german: "Testvogel", english: "Test Bird", scientificName: name, size: "ca. 20 cm", weight: "ca. 50 g", lifeExpectancy: "ca. 5 Jahre" };
  const original = await fs.readFile(path.join(repoRoot, "species_list.json"));
  const preview = await post("preview", { values, masterTaxonId: retainedId });
  assert.equal(preview.status, 200, JSON.stringify(preview));
  const changed = new DatabaseSync(source);
  try {
    changed.prepare("UPDATE master_taxon_status SET status_detail=? WHERE master_taxon_id=?").run(JSON.stringify(marker), retainedId);
    changed.prepare("INSERT INTO master_taxon_status VALUES (?, 'manually-protected', NULL, ?)").run(retainedId, NOW);
  }
  finally { changed.close(); }
  const direct = await post("preview", { values, masterTaxonId: retainedId });
  assert.equal(direct.status, 409, JSON.stringify(direct));
  const saved = await post("save", { token: preview.token });
  assert.equal(saved.status, 409, JSON.stringify(saved));
  assert.deepEqual(await fs.readFile(path.join(repoRoot, "species_list.json")), original);
  assert.equal((await post("preview", { values })).status, 200, "Manuelle Eingabe enthält keine Taxonzuweisung");
});
