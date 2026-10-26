import { tmpdir } from "../scripts/test-temp.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { writeFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { captureCatalogUsage, createCatalogUsageService } from "./lightroom-catalog-usage.mjs";
import { CLASSIFICATION_RETENTION_POLICY } from "./taxonomy-classification-retention.mjs";
import { protectedMasterIdsRevision } from "./taxonomy-master-inputs.mjs";
import { prepareMasterJob, verifyMasterJob, masterJobBinding } from "./taxonomy-master-job.mjs";
import { publishTaxonomyPair, prepareTaxonomyPublication, rollbackTaxonomyPair } from "./taxonomy-publication.mjs";
import { taxonomyMasterManifestPath, taxonomyMasterDatabasePath } from "./taxonomy-master-storage.mjs";
import { taxonomyPublicationPath } from "./taxonomy-publication-storage.mjs";
import { buildTaxonomyMasterCandidate } from "./taxonomy-master-candidate.mjs";
import { activateTaxonomyMasterCandidate, rollbackTaxonomyMaster } from "./taxonomy-master-lifecycle.mjs";
import { appendClassificationBatch, readIdentityRegistry } from "./taxonomy-identity-registry.mjs";
import { createTaxonomyMasterService } from "./taxonomy-master-service.mjs";
import { writeProviderSlice } from "./taxonomy-master-slices.mjs";

const USED = `mtx_${"a".repeat(32)}`, RETAINED = `mtx_${"b".repeat(32)}`;
const json = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
async function fixture(t) {
  const base = await fs.mkdtemp(path.join(tmpdir(), "fn-retention-workflow-"));
  t.after(() => fs.rm(base, { recursive: true, force: true, maxRetries: 4, retryDelay: 80 }));
  const root = path.join(base, "taxonomy"), searchRoot = path.join(base, "lightroom"), catalogPath = path.join(base, "own.lrcat");
  await fs.writeFile(catalogPath, "test receipt file, never a SQLite catalog");
  await captureCatalogUsage(root, { catalogPath, totalPhotos: 2, usedTaxa: [{ masterTaxonId: USED, photoCount: 1 }], complete: true, passes: 2 });
  const usage = createCatalogUsageService({ taxonomyRoot: root }), preview = await usage.catalogUsagePreview();
  const saved = await usage.catalogUsageSave({ token: preview.token, confirmed: true, allCatalogsConfirmed: true, unchangedSinceCapture: true });
  const classificationRetention = { policy: CLASSIFICATION_RETENTION_POLICY, usageRevision: saved.revision };
  const summary = { ...classificationRetention, total: 1, retainedMasterTaxonIds: [RETAINED], protectedMasterIdsRevision: protectedMasterIdsRevision([USED]) };
  const writeManifest = async (slot) => {
    const manifest = { candidateId: "own-" + slot, classificationRetentions: summary };
    const file = taxonomyMasterManifestPath(root, slot);
    await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(manifest));
    return { file, manifest, text: JSON.stringify(manifest) };
  };
  return { base, root, searchRoot, catalogPath, classificationRetention, summary, writeManifest };
}

async function emptyJob(f, extra = {}) {
  return prepareMasterJob({ taxonomyRoot: f.root, classificationRetention: f.classificationRetention,
    colRelease: { providerVersion: "own-source", importedAt: "2026-10-23T00:00:00.000Z", recordCount: 0 },
    checkSpace: async () => {}, ...extra });
}

async function realRetainedCandidate(f) {
  const times = ["2026-10-20T00:00:00.000Z", "2026-10-21T00:00:00.000Z", "2026-10-22T00:00:00.000Z"];
  const release = (index) => ({ releaseId: `own-col-${index}`, providerVersion: `own-col-${index}`, importedAt: times[index] });
  const scientificName = "Testus retentus", source = { providerRecordId: "101", scientificName, rank: "species", kingdom: "Bacteria",
    hierarchy: { kingdom: "Bacteria", genus: "Testus", species: scientificName }, relevanceReasons: ["col-reference-gap"] };
  const providerSlices = [{ manifest: { provider: "inaturalist", providerVersion: "own-inat", retrievedAt: times[0] }, records: [source] }];
  const col = { providerRecordId: "col-101", scientificName, rank: "species", kingdom: "Bacillati",
    hierarchy: { kingdom: "Bacillati", genus: "Testus", species: scientificName }, identifiers: [{ type: "inat", identifier: "inat:101" }] };
  const make = (index, extra) => ({ taxonomyRoot: f.root, providerSlices, colRelease: release(index), colRecords: [],
    now: () => new Date(times[index]), ...extra });
  await buildTaxonomyMasterCandidate(make(0));
  await activateTaxonomyMasterCandidate(f.root, { confirmed: true });
  const proposed = await buildTaxonomyMasterCandidate(make(1, { colRecords: [col] }));
  const active = new DatabaseSync(taxonomyMasterDatabasePath(f.root), { readOnly: true });
  let registry;
  try { registry = readIdentityRegistry(active); } finally { active.close(); }
  const staging = new DatabaseSync(taxonomyMasterDatabasePath(f.root, "staging"), { readOnly: true });
  let proof;
  try { proof = JSON.parse(staging.prepare("SELECT resolution_note FROM master_conflict WHERE conflict_id GLOB 'classification_*'").get().resolution_note); }
  finally { staging.close(); }
  registry = appendClassificationBatch({ registry, cases: [proof], batchRevision: "b".repeat(64),
    sourceRevision: proposed.inputRevisions.identitySources, inputRevision: proposed.inputRevisions.identityInputs, confirmedAt: times[1],
    automation: { policy: "unused-classifications-v1", usageRevision: f.classificationRetention.usageRevision } });
  await buildTaxonomyMasterCandidate(make(1, { colRecords: [col], identityRegistry: registry }));
  await activateTaxonomyMasterCandidate(f.root, { confirmed: true });
  return buildTaxonomyMasterCandidate(make(2, { identityRegistry: registry, classificationRetention: f.classificationRetention, protectedMasterIds: [USED] }));
}

test("Workerrezept und Quellbindung behalten dieselbe deterministische Retentionsrevision", async (t) => {
  const f = await fixture(t), speciesListPath = path.join(f.base, "species.json"), correctionsPath = path.join(f.base, "corrections.json");
  await fs.writeFile(speciesListPath, "[]"); await fs.writeFile(correctionsPath, '{"entries":[]}');
  const selection = { speciesListPath, correctionsPath };
  const before = await masterJobBinding(f.root, [], selection, f.classificationRetention);
  const again = await masterJobBinding(f.root, [], selection, f.classificationRetention);
  assert.deepEqual(before, again, "Read/check time must never alter a persisted input binding");
  assert.deepEqual(before.selection.classificationRetention, { ...f.classificationRetention, protectedMasterIdsRevision: protectedMasterIdsRevision([USED]) });
  const job = await emptyJob(f, { selection, expectedBinding: before });
  const recipe = await json(path.join(job.directory, "recipe.json"));
  assert.deepEqual(recipe.options.classificationRetention, f.classificationRetention);
  assert.deepEqual(recipe.binding.selection.classificationRetention, before.selection.classificationRetention);
  await verifyMasterJob(f.root, recipe);
});

test("Gesicherter Retentionsauftrag bleibt bei offenem oder verändertem FN-Katalog gesperrt", async (t) => {
  const f = await fixture(t), job = await emptyJob(f), recipe = await json(path.join(job.directory, "recipe.json"));
  await fs.writeFile(f.catalogPath + ".lock", "open");
  await assert.rejects(verifyMasterJob(f.root, recipe), /veraltet/);
  await fs.unlink(f.catalogPath + ".lock");
  await fs.appendFile(f.catalogPath, "changed");
  await assert.rejects(verifyMasterJob(f.root, recipe), /veraltet/);
});

test("Fremde neue Retentionsrevision und alte Regeln dürfen gesicherten Auftrag nicht übernehmen", async (t) => {
  const f = await fixture(t), job = await emptyJob(f), recipe = await json(path.join(job.directory, "recipe.json"));
  const changed = structuredClone(recipe); changed.options.classificationRetention.usageRevision = "c".repeat(64);
  changed.revision = crypto.createHash("sha256").update(JSON.stringify({ ...changed, revision: undefined })).digest("hex");
  await assert.rejects(verifyMasterJob(f.root, changed), /veraltet/);
  const oldRules = structuredClone(recipe); oldRules.binding.rules = "d".repeat(64);
  oldRules.revision = crypto.createHash("sha256").update(JSON.stringify({ ...oldRules, revision: undefined })).digest("hex");
  await assert.rejects(verifyMasterJob(f.root, oldRules), { code: "MASTER_JOB_STALE" });
});

test("Paarmutation prüft zurückbehaltene Klassifikationen auch beim aktiven Master vor jeder Vorbereitung", async (t) => {
  for (const sourceSlot of ["active", "staging"]) {
    const f = await fixture(t); await f.writeManifest(sourceSlot); await fs.writeFile(f.catalogPath + "-wal", "open");
    let prepared = 0, written = 0;
    await assert.rejects(publishTaxonomyPair({ taxonomyRoot: f.root, searchRoot: f.searchRoot, sourceSlot, confirmed: true,
      prepare: async () => { prepared++; throw new Error("Preparation must not begin"); },
      writePointer: async () => { written++; } }), /veraltet/);
    assert.equal(prepared, 0); assert.equal(written, 0);
  }
});

test("Direkte Paarvorbereitung stoppt am FN-Gate bevor sie den privaten Paketbau beginnt", async (t) => {
  const f = await fixture(t); await f.writeManifest("staging"); await fs.writeFile(f.catalogPath + "-shm", "open");
  let builds = 0;
  await assert.rejects(prepareTaxonomyPublication({ taxonomyRoot: f.root, searchRoot: f.searchRoot,
    id: "publication-12345678-1234-4234-8234-123456789abc", sourceSlot: "staging", action: "publish",
    buildPackage: async () => { builds++; } }), /veraltet/);
  assert.equal(builds, 0);
});

test("FN-Änderung während Paarvorbereitung oder direkt vor Zeigerwechsel bleibt gesperrt", async (t) => {
  for (const point of ["prepare", "activate"]) {
    const f = await fixture(t), source = await f.writeManifest("active"); let written = 0;
    await assert.rejects(publishTaxonomyPair({ taxonomyRoot: f.root, searchRoot: f.searchRoot, sourceSlot: "active", confirmed: true,
      prepare: async ({ id }) => {
        if (point === "prepare") await fs.appendFile(f.catalogPath, "changed");
        return { pointer: { active: { id } }, sourceManifestText: source.text, result: { ok: true } };
      },
      onProgress: ({ phase }) => { if (point === "activate" && phase === "activate") writeFileSync(f.catalogPath + ".lock", "open"); },
      writePointer: async () => { written++; } }), /veraltet/);
    assert.equal(written, 0);
  }
});

test("Unveränderte frische Retentionsbindung erlaubt den bestätigten Paarabschluss ohne neue Quittung", async (t) => {
  const f = await fixture(t), source = await f.writeManifest("active"); let written = 0;
  const before = await fs.readFile(path.join(f.root, "catalog-usage", "registry.json"));
  const result = await publishTaxonomyPair({ taxonomyRoot: f.root, searchRoot: f.searchRoot, sourceSlot: "active", confirmed: true,
    prepare: async ({ id }) => ({ pointer: { active: { id } }, sourceManifestText: source.text, result: { ownFixture: true } }),
    writePointer: async () => { written++; } });
  assert.deepEqual(result, { ownFixture: true }); assert.equal(written, 1);
  assert.deepEqual(await fs.readFile(path.join(f.root, "catalog-usage", "registry.json")), before);
});

test("Rücknahme eines Retentionspaares benötigt ebenfalls frische geschlossene FN-Bindung", async (t) => {
  const f = await fixture(t); await f.writeManifest("previous"); await fs.writeFile(f.catalogPath + ".lock", "open");
  let prepared = 0, written = 0;
  await assert.rejects(rollbackTaxonomyPair({ taxonomyRoot: f.root, searchRoot: f.searchRoot, confirmed: true,
    prepare: async () => { prepared++; throw new Error("Not allowed"); }, writePointer: async () => { written++; } }), /veraltet/);
  assert.equal(prepared, 0); assert.equal(written, 0);
});

test("Rücknahme bindet vorherigen Retentionsstand und FN-Grundlage auch über die Vorbereitung hinweg", async (t) => {
  for (const point of ["catalog", "manifest"]) {
    const f = await fixture(t), source = await f.writeManifest("previous"); let written = 0;
    await assert.rejects(rollbackTaxonomyPair({ taxonomyRoot: f.root, searchRoot: f.searchRoot, confirmed: true,
      prepare: async () => {
        if (point === "catalog") await fs.appendFile(f.catalogPath, "changed");
        else await fs.writeFile(source.file, JSON.stringify({ ...source.manifest, classificationRetentions: undefined }));
        return { pointer: { active: {} }, result: { ownFixture: true } };
      }, writePointer: async () => { written++; } }), point === "catalog" ? /veraltet/ : /vorherige Master.*geändert/);
    assert.equal(written, 0);
  }
});

test("Unveränderte gebundene Retention erlaubt die bestätigte Rücknahme ohne neue Nutzungsquittung", async (t) => {
  const f = await fixture(t); await f.writeManifest("previous"); let written = 0;
  const before = await fs.readFile(path.join(f.root, "catalog-usage", "registry.json"));
  const result = await rollbackTaxonomyPair({ taxonomyRoot: f.root, searchRoot: f.searchRoot, confirmed: true,
    prepare: async () => ({ pointer: { active: {} }, result: { ownFixture: true } }),
    writePointer: async () => { written++; } });
  assert.deepEqual(result, { ownFixture: true }); assert.equal(written, 1);
  assert.deepEqual(await fs.readFile(path.join(f.root, "catalog-usage", "registry.json")), before);
});

test("Entfernte Retentionssummary im vorherigen Manifest umgeht den echten Einzelrollback nicht", async (t) => {
  const f = await fixture(t), retained = await realRetainedCandidate(f);
  assert.equal(retained.classificationRetentions.total, 1);
  await fs.cp(path.dirname(taxonomyMasterDatabasePath(f.root, "staging")), path.dirname(taxonomyMasterDatabasePath(f.root, "previous")), { recursive: true, force: true });
  const file = taxonomyMasterManifestPath(f.root, "previous"), manifest = await json(file);
  delete manifest.classificationRetentions;
  await fs.writeFile(file, JSON.stringify(manifest));
  await assert.rejects(rollbackTaxonomyMaster(f.root, { confirmed: true }), /Retentions|Retentio|Klassifikation|Zusammenfassung|Nachweis/);
});

test("Entfernte Retentionssummary im echten vorherigen Paar lässt dessen Zeiger unverändert", async (t) => {
  const f = await fixture(t); await realRetainedCandidate(f);
  const options = { taxonomyRoot: f.root, searchRoot: f.searchRoot, confirmed: true };
  await publishTaxonomyPair(options);
  await publishTaxonomyPair({ ...options, sourceSlot: "active" });
  const pointerFile = taxonomyPublicationPath(f.root), before = await fs.readFile(pointerFile);
  const file = taxonomyMasterManifestPath(f.root, "previous"), manifest = await json(file);
  assert.equal(manifest.classificationRetentions.total, 1);
  delete manifest.classificationRetentions;
  await fs.writeFile(file, JSON.stringify(manifest));
  await assert.rejects(rollbackTaxonomyPair(options), /Retentions|Retentio|Klassifikation|Zusammenfassung|Nachweis/);
  assert.deepEqual(await fs.readFile(pointerFile), before);
});

test("Service nutzt aktive Klassifikationshistorie ohne optionale Vormerkungsdatei für Quellenrecheck und Retentionsregel", async (t) => {
  for (const missing of [false, true]) {
    const f = await fixture(t); await realRetainedCandidate(f);
    const scientificName = "Testus retentus", searched = [];
    const speciesListPath = path.join(f.base, "species.json"), correctionsPath = path.join(f.base, "corrections.json");
    await fs.writeFile(speciesListPath, "[]"); await fs.writeFile(correctionsPath, '{"entries":[]}');
    await writeProviderSlice(f.root, { provider: "inaturalist", providerVersion: "own-refreshed", retrievedAt: "2026-10-23T00:00:00.000Z",
      records: [{ providerRecordId: "101", scientificName, rank: "species", kingdom: "Bacteria",
        hierarchy: { kingdom: "Bacteria", genus: "Testus", species: scientificName }, relevanceReasons: ["col-reference-gap"] }] });
    const store = { status: () => ({ releaseId: "own-col-1", importedAt: "2026-10-21T00:00:00.000Z", source: {} }),
      findTaxonByScientificName(name) { searched.push(name); return !missing && name === scientificName ? { taxonId: "col-101" } : null; },
      taxon: () => ({ source_id: "col-101", scientific_name: scientificName, rank: "species", kingdom: { scientificName: "Bacillati" },
        identifiers: [{ identifier_type: "inat", identifier: "inat:101" }] }) };
    const service = createTaxonomyMasterService({ taxonomyRoot: f.root, speciesListPath, correctionsPath,
      referenceService: { requireStore: async () => store }, now: () => new Date("2026-10-23T00:00:00.000Z") });
    t.after(() => service.close());
    await assert.rejects(fs.access(path.join(f.root, "master", "identity-review.json")), { code: "ENOENT" });
    await service.startBuild({ refreshProviders: false }); await service.runPromise;
    assert.equal(service.state.status, "ready", service.state.error);
    assert.deepEqual(searched, [scientificName]);
    const built = await json(taxonomyMasterManifestPath(f.root, "staging"));
    assert.equal(built.classificationRetentions?.total || 0, missing ? 1 : 0);
  }
});
