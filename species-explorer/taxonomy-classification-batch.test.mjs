import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { classificationReviewCase, assertUnclearClassificationCase } from "./taxonomy-classification-review.mjs";
import { appendClassificationBatch, emptyIdentityRegistry, identityRegistryState, validateIdentityRegistry, previewIdentityDecision, confirmIdentityDecision, taxonIdentityKey } from "./taxonomy-identity-registry.mjs";
import { createIdentityReviewService, readIdentityReview } from "./taxonomy-identity-review.mjs";
import { buildTaxonomyMasterCandidate, inspectTaxonomyMasterCandidate } from "./taxonomy-master-candidate.mjs";
import { activateTaxonomyMasterCandidate, rollbackTaxonomyMaster } from "./taxonomy-master-lifecycle.mjs";
import { taxonomyMasterDatabasePath, taxonomyMasterManifestPath } from "./taxonomy-master-storage.mjs";
import { matchExplorerRoute } from "./request-router.mjs";
import { buildLightroomSearchPackage } from "./lightroom-search-package.mjs";
import { openLightroomSearchStore } from "./lightroom-search-store.mjs";
import { createClassificationReviewService } from "./taxonomy-classification-service.mjs";
import { prepareMasterJob } from "./taxonomy-master-job.mjs";
import { startMasterJobProcess } from "./taxonomy-master-process.mjs";
import { identityTaxonDetails } from "./taxonomy-identity-cases.mjs";
import { coverMasterInputSelection } from "./taxonomy-master-inputs.mjs";
import { classificationDeferralSummary } from "./taxonomy-classification-deferral.mjs";
import { captureCatalogUsage, createCatalogUsageService } from "./lightroom-catalog-usage.mjs";
import { assertPendingClassificationAutomation } from "./taxonomy-classification-automation.mjs";
import { publishTaxonomyPair, prepareTaxonomyPublication } from "./taxonomy-publication.mjs";
import { readTaxonomyPublication } from "./taxonomy-publication-storage.mjs";

const FIRST = new Date("2026-09-01T00:00:00Z"), SECOND = new Date("2026-10-02T00:00:00Z");
const hash = async (file) => crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
const release = (version, date) => ({ releaseId: version, providerVersion: version, importedAt: date.toISOString() });
const speciesName = (index) => `Testus spec${[...index.toString(26)].map((character) => String.fromCharCode(97 + parseInt(character, 26))).join("")}`;
function proof(index = 1, ids = [`inat:${index}`]) {
  return classificationReviewCase({ sources: [{ masterTaxonId: `mtx_${index.toString(16).padStart(32, "0")}`,
    scientificName: speciesName(index), rank: "species", kingdom: "Bacteria",
    evidence: [{ provider: "inaturalist", providerVersion: "fixture-inat", providerRecordId: String(index) }] }],
  target: { scientificName: speciesName(index), rank: "species", kingdom: "Bacillati" },
  records: [{ providerRecordId: `col-${index}`, identifiers: ids.map((identifier) => ({ type: "inat", identifier })) }],
  baseVersion: "master-fixture", colVersion: "col-fixture" });
}
const batch = (cases, extra = {}) => appendClassificationBatch({ registry: emptyIdentityRegistry(), cases,
  batchRevision: "a".repeat(64), sourceRevision: "fixture-source", inputRevision: "fixture-input", confirmedAt: SECOND.toISOString(), ...extra });
const identifiers = (...ids) => ids.map((identifier) => ({ type: "inat", identifier }));
function rows(root, slot = "active") {
  const db = new DatabaseSync(taxonomyMasterDatabasePath(root, slot), { readOnly: true });
  try {
    return { taxa: db.prepare("SELECT master_taxon_id, kingdom, lifecycle_state FROM master_taxon ORDER BY master_taxon_id").all(),
      projects: db.prepare("SELECT master_taxon_id, project_taxon_key, project_slug, scientific_name_at_link FROM project_taxon_link").all(),
      names: db.prepare("SELECT master_taxon_id, field_value FROM master_field_assertion WHERE field_name='german-name' AND selected=1").all(),
      sources: db.prepare("SELECT provider_record_id, kingdom FROM provider_taxon_assertion ORDER BY provider_record_id").all(),
      aliases: db.prepare("SELECT * FROM master_taxon_alias WHERE alias_type='synonym'").all() };
  } finally { db.close(); }
}
async function fixture(t, { count = 1, missingLast = false, identifiersByIndex = null, multipleSources = false } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fn-classification-batch-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 80 }));
  const root = path.join(directory, "taxonomy");
  const records = Array.from({ length: count }, (_, index) => ({ providerRecordId: String(index + 1),
    scientificName: speciesName(index + 1), rank: "species", kingdom: "Bacteria",
    hierarchy: { kingdom: "Bacteria" }, relevanceReasons: ["col-reference-gap"] }));
  if (multipleSources) { records[1].scientificName = records[0].scientificName; records[1].kingdom = "Animalia"; records[1].hierarchy.kingdom = "Animalia"; }
  const providerSlices = [{ manifest: { provider: "inaturalist", providerVersion: "fixture-inat", retrievedAt: FIRST.toISOString() }, records }];
  const projectTaxa = [{ projectTaxonKey: "fixture", projectSlug: "fixture", scientificName: records[0].scientificName,
    kingdom: "Bacteria", germanName: "Eigener Projektname" }];
  const corrections = [{ scientificName: records[0].scientificName, kingdom: "Bacteria", germanName: "Eigene Namenswahl" }];
  await buildTaxonomyMasterCandidate({ taxonomyRoot: root, colRelease: release("col-old", FIRST), colRecords: [],
    providerSlices, projectTaxa, corrections, now: () => FIRST });
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => FIRST });
  const colRecords = (multipleSources ? records.slice(0, 1) : records).map((record, index) => ({ ...record, providerRecordId: `col-${index + 1}`, kingdom: "Bacillati",
    hierarchy: { kingdom: "Bacillati" }, identifiers: identifiersByIndex ? identifiersByIndex[index]
      : missingLast && index === count - 1 ? [] : [{ type: "inat", identifier: `inat:${index + 1}` }] }));
  const inputs = { taxonomyRoot: root, colRelease: release("col-next", SECOND), colRecords, providerSlices, projectTaxa, corrections, now: () => SECOND };
  const candidate = await buildTaxonomyMasterCandidate(inputs);
  let inputRevision = candidate.inputRevisions.identityInputs;
  const service = createIdentityReviewService({ taxonomyRoot: root, now: () => SECOND, readInputRevision: async () => inputRevision });
  return { root, service, inputs, candidate, setInputRevision: (value) => { inputRevision = value; } };
}

async function usageFixture(root, usedIds = []) {
  const catalogPath = path.join(path.dirname(root), "catalog.lrcat");
  await fs.writeFile(catalogPath, "closed fixture catalog; SDK receipt is independently simulated");
  await captureCatalogUsage(root, { catalogPath, complete: true, passes: 2, totalPhotos: usedIds.length,
    usedTaxa: usedIds.map((masterTaxonId) => ({ masterTaxonId, photoCount: 1 })) });
  const service = createCatalogUsageService({ taxonomyRoot: root });
  const preview = await service.catalogUsagePreview();
  await service.catalogUsageSave({ token: preview.token, confirmed: true, allCatalogsConfirmed: true, unchangedSinceCapture: true });
  return catalogPath;
}

test("Automatik erfordert vollständige FN-Nutzung und schützt Projektart, eigene Namen und zugewiesene Art", async (t) => {
  const { root, service, inputs } = await fixture(t, { count: 4, missingLast: true });
  const unknown = await service.classificationAutomaticPreview();
  assert.equal(unknown.available, false); assert.equal(await readIdentityReview(root), null);
  const old = rows(root), db = new DatabaseSync(taxonomyMasterDatabasePath(root), { readOnly: true });
  let usedId;
  try { usedId = db.prepare("SELECT master_taxon_id FROM master_taxon WHERE canonical_scientific_name=?").get(speciesName(2)).master_taxon_id; }
  finally { db.close(); }
  const catalog = await usageFixture(root, [usedId]);
  const preview = await service.classificationAutomaticPreview();
  assert.equal(preview.matching, 1); assert.equal(preview.deferred, 1); assert.equal(preview.protected, 2);
  await assert.rejects(service.classificationAutomaticSave({ ...preview, token: "stale" }), /veraltet/);
  const saved = await service.classificationAutomaticSave(preview);
  assert.equal(saved.count, 2); assert.equal(saved.changesPhotos, false);
  const review = await readIdentityReview(root);
  assert.deepEqual(review.registry.events.map((event) => event.type), ["classification", "classification-deferred"]);
  assert.ok(review.registry.events.every((event) => event.classificationAutomation.usageRevision === preview.usageRevision));
  assert.equal((await service.classificationAutomaticPreview()).matching, 0);
  assert.equal((await service.classificationAutomaticSave(await service.classificationAutomaticPreview())).saved, false);
  assert.deepEqual(rows(root), old, "Vormerkung verändert keine aktive Datenbank");
  assert.equal((await assertPendingClassificationAutomation(root, { full: true })).eventIds.length, 2);
  await fs.writeFile(catalog + ".lock", "");
  await assert.rejects(assertPendingClassificationAutomation(root), /veraltet/);
  await fs.unlink(catalog + ".lock");
  // Only the protected cases remain for explicit review. Both kinds of pending
  // decision are then applied in ONE fresh candidate, with original IDs.
  const manual = await service.classificationPreview(); assert.equal(manual.count, 2);
  await service.classificationSave({ token: manual.token, confirmed: true });
  const finalReview = await readIdentityReview(root);
  await buildTaxonomyMasterCandidate({ ...inputs, identityRegistry: finalReview.registry, now: () => new Date("2026-10-02T01:00:00Z") });
  assert.equal((await inspectTaxonomyMasterCandidate(root)).blockingConflictCount, 0);
  const next = rows(root, "staging");
  assert.deepEqual(next.taxa.map((entry) => entry.master_taxon_id).sort(), old.taxa.map((entry) => entry.master_taxon_id).sort());
  assert.deepEqual(next.projects, old.projects); assert.deepEqual(next.names, old.names);
  await fs.writeFile(catalog + ".lock", "");
  await assert.rejects(activateTaxonomyMasterCandidate(root, { confirmed: true }), /veraltet/);
  assert.deepEqual(rows(root), old);
  await fs.unlink(catalog + ".lock");
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  await fs.writeFile(catalog + ".lock", "");
  assert.equal(await assertPendingClassificationAutomation(root), null, "Aktive Historie verlangt keine dauerhafte LR-Sperre");
});

test("automatische Klassifikation schützt einen echten fortgeschriebenen eigenen Entscheidungsmarker", async (t) => {
  const { root, service, inputs } = await fixture(t, { count: 3 });
  const db = new DatabaseSync(taxonomyMasterDatabasePath(root));
  try {
    db.prepare(`INSERT INTO master_decision(decision_id,master_taxon_id,field_name,language,
      decision_type,selected_assertion_id,decided_at)
      SELECT 'source-field-choice',f.master_taxon_id,f.field_name,f.language,'keep-current',f.assertion_id,?
      FROM master_field_assertion f JOIN master_taxon t USING(master_taxon_id)
      WHERE t.canonical_scientific_name=? AND f.selected=1 AND f.field_name='scientific-name'`)
      .run(FIRST.toISOString(), speciesName(2));
  } finally { db.close(); }
  await buildTaxonomyMasterCandidate({ ...inputs, colRelease: release("col-old", FIRST), colRecords: [], now: () => SECOND });
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  const updated = new DatabaseSync(taxonomyMasterDatabasePath(root), { readOnly: true });
  try {
    assert.equal(updated.prepare("SELECT COUNT(*) AS n FROM master_decision").get().n, 0);
    const marker = JSON.parse(updated.prepare(`SELECT s.status_detail FROM master_taxon_status s JOIN master_taxon t USING(master_taxon_id)
      WHERE t.canonical_scientific_name=? AND s.status_name='manually-protected'`).get(speciesName(2)).status_detail);
    assert.equal(marker.decisions[0].decisionId, "source-field-choice");
    assert.equal(updated.prepare(`SELECT COUNT(*) AS n FROM master_field_assertion f JOIN master_taxon t USING(master_taxon_id)
      WHERE t.canonical_scientific_name=? AND f.origin_kind IN ('manual','project')`).get(speciesName(2)).n, 0);
  } finally { updated.close(); }
  await buildTaxonomyMasterCandidate({ ...inputs, now: () => new Date(SECOND.getTime() + 1000) });
  await usageFixture(root);
  const preview = await service.classificationAutomaticPreview();
  assert.equal(preview.matching, 1);
  assert.equal(preview.protected, 2, "Projektart und eigene Entscheidung bleiben separat manuell geschützt");
  const saved = await service.classificationAutomaticSave(preview);
  assert.equal(saved.count, 1);
  const review = await readIdentityReview(root);
  assert.equal(review.registry.events[0].sources[0].scientificName, speciesName(3));
});

test("Automatik ist quellen-/nutzungsgebunden, atomar, wiederholbar nach Schreibfehler und ohne laufenden Katalogscan", async (t) => {
  const { root, service, candidate } = await fixture(t, { count: 3, missingLast: true });
  const catalog = await usageFixture(root);
  const preview = await service.classificationAutomaticPreview();
  const flaky = createClassificationReviewService({ taxonomyRoot: root, now: () => SECOND,
    readInputRevision: async () => candidate.inputRevisions.identityInputs, readReview: () => readIdentityReview(root),
    writeReview: async () => { throw new Error("write-failed"); } });
  await assert.rejects(flaky.classificationAutomaticSave(preview), /write-failed/);
  assert.equal(await readIdentityReview(root), null);
  await fs.appendFile(catalog, "changed");
  await assert.rejects(service.classificationAutomaticSave(preview), /veraltet/);
  await usageFixture(root);
  const current = await service.classificationAutomaticPreview();
  assert.notEqual(current.token, preview.token);
  await service.classificationAutomaticSave(current);
  const pending = await readIdentityReview(root);
  assert.equal(pending.registry.events.length, 2);
  assert.equal(pending.registry.events[0].classificationAutomation.policy, "unused-classifications-v1");
  await captureCatalogUsage(root, { catalogPath: catalog, complete: true, passes: 2, totalPhotos: 0, usedTaxa: [] });
  await assert.rejects(assertPendingClassificationAutomation(root, { full: true }), /veraltet/);
});

test("automatische Vormerkung schützt auch gemeinsamen Paarwechsel vor nachträglich geöffnetem Katalog und erlaubt frische Wiederholung", async (t) => {
  const { root, service, inputs } = await fixture(t, { count: 3, missingLast: true });
  const catalog = await usageFixture(root), searchRoot = path.join(path.dirname(root), "lightroom");
  await service.classificationAutomaticSave(await service.classificationAutomaticPreview());
  const manual = await service.classificationPreview();
  await service.classificationSave({ token: manual.token, confirmed: true });
  await buildTaxonomyMasterCandidate({ ...inputs, identityRegistry: (await readIdentityReview(root)).registry,
    now: () => new Date("2026-10-02T01:00:00Z") });
  const masterPath = taxonomyMasterDatabasePath(root), before = await hash(masterPath);
  await assert.rejects(publishTaxonomyPair({ taxonomyRoot: root, searchRoot, confirmed: true, corrections: inputs.corrections,
    prepare: async (options) => {
      const prepared = await prepareTaxonomyPublication(options);
      await fs.writeFile(catalog + ".lock", "");
      return prepared;
    } }), /veraltet/);
  assert.equal(readTaxonomyPublication(root), null);
  assert.equal(await hash(masterPath), before);
  await fs.unlink(catalog + ".lock");
  const result = await publishTaxonomyPair({ taxonomyRoot: root, searchRoot, confirmed: true, corrections: inputs.corrections });
  assert.ok(result.publicationId);
  assert.equal(readTaxonomyPublication(root).active.masterVersion, result.masterVersion);
  const store = await openLightroomSearchStore({ searchRoot });
  try { assert.equal(store.status().masterVersion, result.masterVersion); }
  finally { store.close(); }
  assert.equal(await assertPendingClassificationAutomation(root), null);
});

test("480 unklare Zurückstellungen reservieren keine neuen IDs und erzeugen weder Historiennachfolger noch Aliasse", () => {
  const cases = Array.from({ length: 480 }, (_, index) => proof(index + 1, []));
  const registry = batch(cases, { deferred: true }), state = identityRegistryState(registry);
  assert.equal(state.deferrals.length, 480);
  assert.equal(state.current.size, 0);
  assert.equal(state.historical.size, 0);
  assert.equal(state.aliases.size, 0);
  assert.ok(registry.events.every((event) => JSON.stringify(event.sources) === JSON.stringify(event.targets)));
  assert.throws(() => batch([proof()], { deferred: true }), /unklaren Quellenfall/);
  assert.throws(() => previewIdentityDecision({ type: "classification-deferred" }), /Identitätsfortführung/);
  assert.throws(() => batch([cases[0], cases[0]], { deferred: true }), /bereits zurückgestellt/);
  const changed = structuredClone(cases[0]);
  changed.target.kingdom = "Animalia";
  assert.throws(() => assertUnclearClassificationCase(changed), /Quellenfall/);
  const forged = structuredClone(registry);
  forged.events[0].targets[0].masterTaxonId = `mtx_${"f".repeat(32)}`;
  assert.throws(() => validateIdentityRegistry(forged), /bisherigen IDs/);
});

test("Zurückstellung nutzt geschützte POST-Routen und verlangt eigene Bestätigung mit unveränderter Vorschau", async (t) => {
  for (const action of ["preview", "save"]) {
    const url = `/api/taxonomy/master/classification/deferral-${action}`;
    assert.equal(matchExplorerRoute("POST", url).action, `classification-deferral-${action}`);
    assert.notEqual(matchExplorerRoute("GET", url).name, "taxonomy-master");
  }
  const { root, service, setInputRevision, candidate } = await fixture(t, { identifiersByIndex: [[]] });
  const files = [taxonomyMasterDatabasePath(root), taxonomyMasterDatabasePath(root, "staging"),
    taxonomyMasterManifestPath(root), taxonomyMasterManifestPath(root, "staging")], before = await Promise.all(files.map(hash));
  const preview = await service.classificationDeferralPreview();
  assert.equal(preview.count, 1);
  assert.equal(await readIdentityReview(root), null);
  await assert.rejects(service.classificationDeferralSave({ token: preview.token }), /ausdrücklich/);
  await assert.rejects(service.classificationDeferralSave({ token: "stale", confirmed: true }), /veraltet/);
  setInputRevision("changed");
  await assert.rejects(service.classificationDeferralSave({ token: preview.token, confirmed: true }), /veraltet/);
  setInputRevision(candidate.inputRevisions.identityInputs);
  await service.classificationDeferralSave({ token: preview.token, confirmed: true });
  assert.equal((await readIdentityReview(root)).registry.events[0].type, "classification-deferred");
  await assert.rejects(service.classificationDeferralSave({ token: preview.token, confirmed: true }), /bereits vorgemerkt/);
  assert.deepEqual(await Promise.all(files.map(hash)), before);
  const reopened = createIdentityReviewService({ taxonomyRoot: root });
  const discard = await reopened.discardPreview();
  await reopened.discard({ token: discard.token, confirmed: true });
  assert.equal((await readIdentityReview(root)).registry.events.length, 0);
  assert.equal((await reopened.classificationDeferralPreview()).count, 1);
});

test("abweichende, mehrdeutige und fehlende Belege lassen sich nur im frischen Kandidaten zurückstellen; Altarten bleiben erhalten", async (t) => {
  const { root, service, inputs } = await fixture(t, { count: 3,
    identifiersByIndex: [identifiers("inat:999"), identifiers("inat:2", "inat:999"), []] }), before = rows(root);
  const preview = await service.classificationDeferralPreview();
  assert.equal(preview.count, 3);
  await service.classificationDeferralSave({ token: preview.token, confirmed: true });
  const registry = (await readIdentityReview(root)).registry;
  await assert.rejects(activateTaxonomyMasterCandidate(root, { confirmed: true }), /Vorgemerkte Identitätsentscheidungen|vor der Aktivierung/);
  await buildTaxonomyMasterCandidate({ ...inputs, identityRegistry: registry, now: () => new Date(SECOND.getTime() + 1000) });
  const after = rows(root, "staging"), inspected = await inspectTaxonomyMasterCandidate(root);
  assert.deepEqual(after, before);
  assert.equal(inspected.blockingConflictCount, 0);
  assert.equal(inspected.manifest.classificationReview.total, 0);
  assert.equal(inspected.manifest.classificationDeferrals.total, 3);
  assert.equal(inspected.manifest.classificationDeferrals.differentProviderId, 1);
  assert.equal(inspected.manifest.classificationDeferrals.ambiguousProviderId, 1);
  assert.equal(inspected.manifest.classificationDeferrals.missingProviderId, 1);
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => new Date(SECOND.getTime() + 2000) });
  await buildTaxonomyMasterCandidate({ ...inputs, now: () => new Date(SECOND.getTime() + 3000) });
  assert.equal((await inspectTaxonomyMasterCandidate(root)).manifest.classificationDeferrals.total, 3);
  assert.deepEqual(rows(root, "staging"), before);
  const searchRoot = path.join(root, "search");
  await buildLightroomSearchPackage({ taxonomyRoot: root, searchRoot, now: () => SECOND });
  const store = await openLightroomSearchStore({ searchRoot, slot: "staging" });
  try {
    for (const row of before.taxa) {
      assert.equal(store.identityResolution(row.master_taxon_id).state, "current");
      assert.equal(store.taxon(row.master_taxon_id).kingdom, "Bacteria");
    }
  } finally { store.close(); }
  await rollbackTaxonomyMaster(root, { confirmed: true });
  assert.deepEqual(rows(root), before);
});

test("neue Zurückstellungen bleiben ohne Quellenübersicht oder Ausgangsmaster gesperrt", async (t) => {
  const { root, service, inputs } = await fixture(t, { identifiersByIndex: [[]] });
  const preview = await service.classificationDeferralPreview();
  await service.classificationDeferralSave({ token: preview.token, confirmed: true });
  await buildTaxonomyMasterCandidate({ ...inputs, identityRegistry: (await readIdentityReview(root)).registry,
    now: () => new Date(SECOND.getTime() + 1000) });
  const manifestPath = taxonomyMasterManifestPath(root, "staging");
  const original = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  for (const field of ["sources", "sourceMasterVersion"]) {
    const altered = structuredClone(original);
    delete altered[field];
    await fs.writeFile(manifestPath, JSON.stringify(altered));
    for (const validate of [false, true]) {
      await assert.rejects(inspectTaxonomyMasterCandidate(root, { validate }), /Zurückstellung/);
    }
    await assert.rejects(activateTaxonomyMasterCandidate(root, { confirmed: true }), /Zurückstellung/);
  }
  await fs.writeFile(manifestPath, JSON.stringify(original));
  assert.equal((await inspectTaxonomyMasterCandidate(root)).manifest.classificationDeferrals.total, 1);
});

test("passende Übernahme und unklare Zurückstellung werden in beiden Reihenfolgen ohne Zwischenaufbau gebündelt", async (t) => {
  for (const deferredFirst of [false, true]) await t.test(String(deferredFirst), async (subtest) => {
    const { root, service, inputs } = await fixture(subtest, { count: 2, missingLast: true });
    const original = rows(root);
    const [firstPreview, firstSave, secondPreview, secondSave] = deferredFirst
      ? ["classificationDeferralPreview", "classificationDeferralSave", "classificationPreview", "classificationSave"]
      : ["classificationPreview", "classificationSave", "classificationDeferralPreview", "classificationDeferralSave"];
    const staleSecond = await service[secondPreview]();
    const first = await service[firstPreview]();
    await service[firstSave]({ token: first.token, confirmed: true });
    assert.equal((await service.classificationDecisionReadiness()).ready, false);
    await assert.rejects(service[secondSave]({ token: staleSecond.token, confirmed: true }), /veraltet/);
    const second = await service[secondPreview]();
    await service[secondSave]({ token: second.token, confirmed: true });
    assert.equal((await service.classificationDecisionReadiness()).ready, true);
    const registry = (await readIdentityReview(root)).registry;
    assert.equal(registry.events.length, 2);
    await buildTaxonomyMasterCandidate({ ...inputs, identityRegistry: registry, now: () => new Date(SECOND.getTime() + 1000) });
    const after = rows(root, "staging"), inspected = await inspectTaxonomyMasterCandidate(root);
    assert.deepEqual(after.taxa.map((row) => row.master_taxon_id), original.taxa.map((row) => row.master_taxon_id));
    assert.equal(after.taxa.filter((row) => row.kingdom === "Bacillati").length, 1);
    assert.equal(inspected.blockingConflictCount, 0);
    assert.equal(inspected.manifest.classificationDeferrals.total, 1);
  });
});

test("veränderte Quellen werden nach aktivierter Zurückstellung wieder offen geprüft; unbelegtes frisches Ereignis stoppt", async (t) => {
  const { root, service, inputs } = await fixture(t, { identifiersByIndex: [[]] }), before = rows(root);
  const preview = await service.classificationDeferralPreview();
  await service.classificationDeferralSave({ token: preview.token, confirmed: true });
  const registry = (await readIdentityReview(root)).registry;
  const changed = [{ ...inputs.colRecords[0], identifiers: identifiers("inat:999") }];
  await assert.rejects(buildTaxonomyMasterCandidate({ ...inputs, colRecords: changed, identityRegistry: registry,
    now: () => new Date(SECOND.getTime() + 1000) }), /nicht mehr unverändert/);
  await buildTaxonomyMasterCandidate({ ...inputs, identityRegistry: registry, now: () => new Date(SECOND.getTime() + 2000) });
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => new Date(SECOND.getTime() + 3000) });
  await buildTaxonomyMasterCandidate({ ...inputs, colRecords: changed, now: () => new Date(SECOND.getTime() + 4000) });
  const inspected = await inspectTaxonomyMasterCandidate(root);
  assert.equal(inspected.manifest.classificationDeferrals.total, 0);
  assert.equal(inspected.manifest.classificationReview.differentProviderId, 1);
  assert.equal(inspected.blockingConflictCount, 1);
  assert.deepEqual(rows(root), before);
  await assert.rejects(activateTaxonomyMasterCandidate(root, { confirmed: true }), /vor der Aktivierung/);
});

test("Zurückstellung im echten Worker hält Altarten, Namen und Projektlinks; gespeicherte Übersicht ist prüfpflichtig", async (t) => {
  const { root, service, inputs } = await fixture(t, { identifiersByIndex: [[]] }), before = rows(root);
  const preview = await service.classificationDeferralPreview();
  await service.classificationDeferralSave({ token: preview.token, confirmed: true });
  const registry = (await readIdentityReview(root)).registry;
  const job = await prepareMasterJob({ ...inputs, identityRegistry: registry, now: () => new Date(SECOND.getTime() + 1000) });
  const candidate = await startMasterJobProcess({ taxonomyRoot: root, id: job.id });
  assert.equal(candidate.classificationDeferrals.total, 1);
  assert.deepEqual(rows(root, "staging"), before);
  const manifestFile = taxonomyMasterManifestPath(root, "staging"), manifest = JSON.parse(await fs.readFile(manifestFile, "utf8"));
  manifest.classificationDeferrals.total = 0;
  await fs.writeFile(manifestFile, JSON.stringify(manifest));
  await assert.rejects(inspectTaxonomyMasterCandidate(root), /Zurückstellungsübersicht/);
  assert.deepEqual(rows(root), before);
});

test("mehrdeutiger Fall mit zwei bisherigen Arten erhält beide IDs und keine fremde Zielart", async (t) => {
  const { root, service, inputs } = await fixture(t, { count: 2, multipleSources: true, identifiersByIndex: [[]] });
  const before = rows(root), preview = await service.classificationDeferralPreview();
  assert.equal(preview.count, 1);
  await service.classificationDeferralSave({ token: preview.token, confirmed: true });
  const registry = (await readIdentityReview(root)).registry;
  assert.equal(registry.events[0].sources.length, 2);
  await buildTaxonomyMasterCandidate({ ...inputs, identityRegistry: registry, now: () => new Date(SECOND.getTime() + 1000) });
  assert.deepEqual(rows(root, "staging"), before);
  assert.equal((await inspectTaxonomyMasterCandidate(root)).blockingConflictCount, 0);
});

test("Zurückstellung oberhalb von 100 Fällen ist vollständig und ihre Statusübersicht bleibt kompakt", async (t) => {
  const { root, service, inputs } = await fixture(t, { count: 105, identifiersByIndex: Array.from({ length: 105 }, () => []) });
  const preview = await service.classificationDeferralPreview(), before = rows(root);
  assert.equal(preview.count, 105);
  await service.classificationDeferralSave({ token: preview.token, confirmed: true });
  await buildTaxonomyMasterCandidate({ ...inputs, identityRegistry: (await readIdentityReview(root)).registry,
    now: () => new Date(SECOND.getTime() + 1000) });
  const inspected = await inspectTaxonomyMasterCandidate(root);
  assert.equal(inspected.manifest.classificationDeferrals.total, 105);
  assert.equal(inspected.blockingConflictCount, 0);
  assert.ok(JSON.stringify(inspected.manifest.classificationDeferrals).length < 2000);
  assert.deepEqual(rows(root, "staging"), before);
});

test("beide Rückfragen haben getrennte Tokens; Zurückstellungs-Schreibfehler ist ohne Teilentscheidung wiederholbar", async (t) => {
  const { root, service, candidate } = await fixture(t, { count: 2, missingLast: true });
  const matching = await service.classificationPreview();
  await assert.rejects(service.classificationDeferralSave({ token: matching.token, confirmed: true }), /veraltet/);
  const broken = createClassificationReviewService({ taxonomyRoot: root, now: () => SECOND,
    readReview: () => readIdentityReview(root), readInputRevision: async () => candidate.inputRevisions.identityInputs,
    writeReview: async () => { throw new Error("Schreibfehler"); } });
  const preview = await broken.classificationDeferralPreview();
  await assert.rejects(broken.classificationDeferralSave({ token: preview.token, confirmed: true }), /Schreibfehler/);
  assert.equal(await readIdentityReview(root), null);
  const fresh = await service.classificationDeferralPreview();
  assert.equal((await service.classificationDeferralSave({ token: fresh.token, confirmed: true })).saved, true);
});

test("alte Kandidaten erhalten keine rückwirkende Zurückstellungsfreigabe", async (t) => {
  const { root, service } = await fixture(t, { identifiersByIndex: [[]] });
  const file = taxonomyMasterManifestPath(root, "staging"), manifest = JSON.parse(await fs.readFile(file, "utf8"));
  delete manifest.classificationReview.deferralAvailable;
  await fs.writeFile(file, JSON.stringify(manifest));
  await assert.rejects(service.classificationDeferralPreview(), /ältere Kandidat/);
  assert.equal(await readIdentityReview(root), null);
});

test("entfernte Prüfzeilen oder wieder geöffnete Zurückstellungen verhindern die Freigabe", async (t) => {
  for (const mode of ["removed", "reopened"]) await t.test(mode, async (subtest) => {
    const { root, service, inputs } = await fixture(subtest, { identifiersByIndex: [[]] });
    const preview = await service.classificationDeferralPreview();
    await service.classificationDeferralSave({ token: preview.token, confirmed: true });
    await buildTaxonomyMasterCandidate({ ...inputs, identityRegistry: (await readIdentityReview(root)).registry,
      now: () => new Date(SECOND.getTime() + 1000) });
    const db = new DatabaseSync(taxonomyMasterDatabasePath(root, "staging"));
    try {
      if (mode === "removed") db.exec("DELETE FROM master_conflict WHERE conflict_id GLOB 'classification_hold_*'");
      else db.exec("UPDATE master_conflict SET conflict_state='open' WHERE conflict_id GLOB 'classification_hold_*'");
    } finally { db.close(); }
    if (mode === "removed") {
      const file = taxonomyMasterManifestPath(root, "staging"), manifest = JSON.parse(await fs.readFile(file, "utf8"));
      manifest.classificationDeferrals = classificationDeferralSummary([]);
      await fs.writeFile(file, JSON.stringify(manifest));
    }
    await assert.rejects(activateTaxonomyMasterCandidate(root, { confirmed: true }), /Zurückstellung|Klassifikationsprüfung/);
  });
});

test("geprüfte Eingangsgrundlage bewahrt ausgelassene CoL-Belege und erhält die Zurückstellung im Folgeabgleich", async (t) => {
  const { root, service, inputs } = await fixture(t, { identifiersByIndex: [[]] });
  async function covered(options) {
    const selection = coverMasterInputSelection({ ...options, targetNames: options.providerSlices[0].records.map((record) => record.scientificName) });
    return buildTaxonomyMasterCandidate({ ...options, colRecords: selection.records(), buildInputCoverage: selection.coverage });
  }
  const preview = await service.classificationDeferralPreview();
  await service.classificationDeferralSave({ token: preview.token, confirmed: true });
  const candidate = await covered({ ...inputs, identityRegistry: (await readIdentityReview(root)).registry,
    now: () => new Date(SECOND.getTime() + 1000) });
  assert.equal(candidate.buildInputs.available, true);
  assert.equal(candidate.classificationDeferrals.total, 1);
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => new Date(SECOND.getTime() + 2000) });
  const expected = rows(root);
  const followup = await covered({ ...inputs, now: () => new Date(SECOND.getTime() + 3000) });
  assert.equal(followup.buildInputs.available, true);
  assert.equal(followup.classificationDeferrals.total, 1);
  assert.deepEqual(rows(root, "staging"), expected);
});

test("zusätzlicher eigenständiger Zielbeleg entwertet die alte Zurückstellung statt fremde Quellen auszublenden", async (t) => {
  const { root, service, inputs } = await fixture(t, { identifiersByIndex: [[]] });
  const preview = await service.classificationDeferralPreview();
  await service.classificationDeferralSave({ token: preview.token, confirmed: true });
  await buildTaxonomyMasterCandidate({ ...inputs, identityRegistry: (await readIdentityReview(root)).registry,
    now: () => new Date(SECOND.getTime() + 1000) });
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => new Date(SECOND.getTime() + 2000) });
  const extra = { manifest: { provider: "gbif", providerVersion: "fixture-gbif", retrievedAt: SECOND.toISOString() }, records: [{
    ...inputs.colRecords[0], providerRecordId: "gbif-independent", relevanceReasons: ["col-reference-gap"] }] };
  await buildTaxonomyMasterCandidate({ ...inputs, providerSlices: [...inputs.providerSlices, extra], now: () => new Date(SECOND.getTime() + 3000) });
  const inspected = await inspectTaxonomyMasterCandidate(root);
  assert.equal(inspected.manifest.classificationDeferrals.total, 0);
  assert.equal(inspected.manifest.classificationReview.total, 1);
  assert.equal(inspected.blockingConflictCount, 1);
  await assert.rejects(service.classificationDeferralPreview(), /nicht mehr eindeutig/);
});

test("neuer CoL-Release erfordert neue Zurückstellung; später passender Quellenbeleg kann mit alter ID übernommen werden", async (t) => {
  const { root, service, inputs } = await fixture(t, { identifiersByIndex: [[]] }), before = rows(root);
  const first = await service.classificationDeferralPreview();
  await service.classificationDeferralSave({ token: first.token, confirmed: true });
  await buildTaxonomyMasterCandidate({ ...inputs, identityRegistry: (await readIdentityReview(root)).registry,
    now: () => new Date(SECOND.getTime() + 1000) });
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => new Date(SECOND.getTime() + 2000) });
  const next = { ...inputs, colRelease: release("col-later", SECOND) };
  await buildTaxonomyMasterCandidate({ ...next, now: () => new Date(SECOND.getTime() + 3000) });
  assert.equal((await inspectTaxonomyMasterCandidate(root)).blockingConflictCount, 1);
  const fresh = await service.classificationDeferralPreview();
  await service.classificationDeferralSave({ token: fresh.token, confirmed: true });
  await buildTaxonomyMasterCandidate({ ...next, identityRegistry: (await readIdentityReview(root)).registry,
    now: () => new Date(SECOND.getTime() + 4000) });
  assert.equal((await inspectTaxonomyMasterCandidate(root)).manifest.classificationDeferrals.total, 1);
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => new Date(SECOND.getTime() + 5000) });
  const resolved = [{ ...inputs.colRecords[0], identifiers: identifiers("inat:1") }];
  await buildTaxonomyMasterCandidate({ ...next, colRecords: resolved, now: () => new Date(SECOND.getTime() + 6000) });
  const matching = await service.classificationPreview();
  await service.classificationSave({ token: matching.token, confirmed: true });
  await buildTaxonomyMasterCandidate({ ...next, colRecords: resolved, identityRegistry: (await readIdentityReview(root)).registry,
    now: () => new Date(SECOND.getTime() + 7000) });
  const inspected = await inspectTaxonomyMasterCandidate(root);
  assert.equal(inspected.blockingConflictCount, 0);
  assert.equal(inspected.manifest.classificationDeferrals.total, 0);
  assert.equal(rows(root, "staging").taxa[0].master_taxon_id, before.taxa[0].master_taxon_id);
  assert.equal(rows(root, "staging").taxa[0].kingdom, "Bacillati");
  assert.deepEqual(rows(root, "staging").names, before.names);
});

test("1693 bestätigte Klassifikationen erhalten IDs ohne historische Umleitung oder falsche Synonyme", () => {
  const registry = batch(Array.from({ length: 1693 }, (_, index) => proof(index + 1)));
  const state = identityRegistryState(registry);
  assert.equal(registry.events.length, 1693);
  assert.equal(state.current.size, 1693);
  assert.equal(state.historical.size, 0);
  assert.equal(state.aliases.size, 0);
  assert.equal(state.classifications.size, 1693);
  assert.ok(registry.events.every((event) => event.sources[0].masterTaxonId === event.targets[0].masterTaxonId));
});

test("Bündelvorschau und Bestätigung laufen ausschließlich durch geschützte POST-Routen", () => {
  for (const action of ["preview", "save"]) {
    const url = `/api/taxonomy/master/classification/${action}`;
    assert.deepEqual(matchExplorerRoute("POST", url), { name: "taxonomy-master", action: `classification-${action}` });
    assert.notEqual(matchExplorerRoute("GET", url).name, "taxonomy-master");
  }
});

test("Bündelregister weist gefälschte, unklare oder doppelte Belege zurück; allgemeine Reichssperre bleibt", () => {
  for (const ids of [[], ["inat:2"], ["inat:1", "inat:2"], ["inat:1", ""]]) assert.throws(() => batch([proof(1, ids)]), /Quellenbeleg/);
  const valid = proof(), changed = structuredClone(valid);
  changed.providerLinks.ids = ["2"];
  assert.throws(() => batch([changed]), /Quellenbeleg/);
  assert.throws(() => batch([valid, valid]), /geänderte Identität|doppelt/);
  const registry = batch([valid]), event = registry.events[0];
  event.targets[0].masterTaxonId = `mtx_${"2".repeat(32)}`;
  assert.throws(() => validateIdentityRegistry(registry), /ursprüngliche ID/);
  assert.throws(() => previewIdentityDecision({ registry: emptyIdentityRegistry(), sources: valid.sources,
    targets: [valid.target], type: "continuation", reason: "Test", evidence: valid.sources[0].evidence,
    baseVersion: "fixture", sourceRevision: "fixture", inputRevision: "fixture" }), /verschiedenen Reiche/);
});

test("Vorschau schreibt nichts, Bestätigung nur Vormerkung; Wiederholung und geänderte Eingänge sind gesperrt", async (t) => {
  const { root, service, setInputRevision } = await fixture(t);
  const files = [taxonomyMasterDatabasePath(root), taxonomyMasterDatabasePath(root, "staging"),
    taxonomyMasterManifestPath(root), taxonomyMasterManifestPath(root, "staging")];
  const before = await Promise.all(files.map(hash));
  const preview = await service.classificationPreview();
  assert.equal(preview.count, 1);
  assert.equal(preview.remaining, 0);
  assert.equal(await readIdentityReview(root), null);
  await assert.rejects(service.classificationSave({ token: preview.token }), /ausdrücklich/);
  await assert.rejects(service.classificationSave({ token: "outdated", confirmed: true }), /veraltet/);
  setInputRevision("changed");
  await assert.rejects(service.classificationSave({ token: preview.token, confirmed: true }), /veraltet/);
  setInputRevision((JSON.parse(await fs.readFile(files[3], "utf8"))).inputRevisions.identityInputs);
  const saved = await service.classificationSave({ token: preview.token, confirmed: true });
  assert.equal(saved.pending, true);
  assert.equal(saved.changesPhotos, false);
  assert.equal((await readIdentityReview(root)).registry.events.length, 1);
  await assert.rejects(service.classificationSave({ token: preview.token, confirmed: true }), /vorgemerkt|vormerkungen/);
  assert.deepEqual(await Promise.all(files.map(hash)), before);
  const reopened = createIdentityReviewService({ taxonomyRoot: root, now: () => SECOND });
  const discard = await reopened.discardPreview();
  await reopened.discard({ token: discard.token, confirmed: true });
  assert.equal((await readIdentityReview(root)).registry.events.length, 0);
  assert.deepEqual(await Promise.all(files.map(hash)), before);
});

test("frischer Aufbau führt bestätigte Klasse mit gleicher ID fort, erhält eigene Namen, Projektlinks und rohe Quellen", async (t) => {
  const { root, service, inputs } = await fixture(t), before = rows(root);
  const preview = await service.classificationPreview();
  await service.classificationSave({ token: preview.token, confirmed: true });
  const registry = (await readIdentityReview(root)).registry;
  await buildTaxonomyMasterCandidate({ ...inputs, identityRegistry: registry, now: () => new Date(SECOND.getTime() + 1000) });
  const after = rows(root, "staging"), inspected = await inspectTaxonomyMasterCandidate(root);
  assert.equal(after.taxa.length, 1);
  assert.equal(after.taxa[0].master_taxon_id, before.taxa[0].master_taxon_id);
  assert.equal(after.taxa[0].kingdom, "Bacillati");
  assert.deepEqual(after.projects, before.projects);
  assert.deepEqual(after.names, before.names);
  assert.equal(after.sources.find((row) => row.provider_record_id === "1").kingdom, "Bacteria");
  assert.equal(after.sources.find((row) => row.provider_record_id === "col-1").kingdom, "Bacillati");
  assert.equal(after.aliases.length, 0);
  assert.equal(inspected.manifest.classificationReview.total, 0);
  assert.equal(inspected.blockingConflictCount, 0);
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => new Date(SECOND.getTime() + 2000) });
  assert.deepEqual(rows(root).taxa, after.taxa);
  const searchRoot = path.join(root, "search");
  await buildLightroomSearchPackage({ taxonomyRoot: root, searchRoot, now: () => SECOND });
  const store = await openLightroomSearchStore({ searchRoot, slot: "staging" });
  try {
    const resolution = store.identityResolution(before.taxa[0].master_taxon_id);
    assert.equal(resolution.state, "current");
    assert.equal(resolution.automaticPhotoChange, false);
    assert.equal(store.taxon(before.taxa[0].master_taxon_id).kingdom, "Bacillati");
  } finally { store.close(); }
  await buildTaxonomyMasterCandidate({ ...inputs, now: () => new Date(SECOND.getTime() + 3000) });
  assert.equal(rows(root, "staging").taxa[0].master_taxon_id, before.taxa[0].master_taxon_id);
  await rollbackTaxonomyMaster(root, { confirmed: true });
  assert.deepEqual(rows(root), before);
});

test("unklare Fälle bleiben nach Bündelbestätigung gesperrt; geänderter CoL-Verweis stoppt neuen Aufbau", async (t) => {
  const { root, service, inputs } = await fixture(t, { count: 2, missingLast: true });
  const original = await hash(taxonomyMasterDatabasePath(root));
  const preview = await service.classificationPreview();
  assert.equal(preview.count, 1);
  assert.equal(preview.remaining, 1);
  await service.classificationSave({ token: preview.token, confirmed: true });
  const registry = (await readIdentityReview(root)).registry;
  await buildTaxonomyMasterCandidate({ ...inputs, identityRegistry: registry, now: () => new Date(SECOND.getTime() + 1000) });
  const inspected = await inspectTaxonomyMasterCandidate(root);
  assert.equal(inspected.manifest.classificationReview.missingProviderId, 1);
  assert.equal(inspected.blockingConflictCount, 1);
  await assert.rejects(activateTaxonomyMasterCandidate(root, { confirmed: true }), /vor der Aktivierung/);
  const candidateHash = await hash(taxonomyMasterDatabasePath(root, "staging"));
  const changed = structuredClone(inputs.colRecords);
  changed[0].identifiers[0].identifier = "inat:99";
  await assert.rejects(buildTaxonomyMasterCandidate({ ...inputs, identityRegistry: registry, colRecords: changed,
    now: () => new Date(SECOND.getTime() + 2000) }), /Quellenbeziehung/);
  assert.equal(await hash(taxonomyMasterDatabasePath(root)), original);
  assert.equal(await hash(taxonomyMasterDatabasePath(root, "staging")), candidateHash);
});

test("veränderte Fallbelege, besetztes Ziel oder neue Kandidatenversion erlauben keine alte Bestätigung", async (t) => {
  for (const change of ["proof", "target", "candidate"]) await t.test(change, async (subtest) => {
    const { root, service, inputs } = await fixture(subtest);
    const preview = await service.classificationPreview();
    if (change === "proof") {
      const db = new DatabaseSync(taxonomyMasterDatabasePath(root, "staging"));
      try {
        const row = db.prepare("SELECT conflict_id,resolution_note FROM master_conflict WHERE conflict_id GLOB 'classification_*'").get();
        const altered = JSON.parse(row.resolution_note);
        altered.target.colRecords[0].identifiers[0].identifier = "inat:999";
        db.prepare("UPDATE master_conflict SET resolution_note=? WHERE conflict_id=?").run(JSON.stringify(altered), row.conflict_id);
      } finally { db.close(); }
    } else if (change === "target") {
      const db = new DatabaseSync(taxonomyMasterDatabasePath(root));
      try { db.prepare(`UPDATE master_taxon SET kingdom='Bacillati' WHERE lifecycle_state='active'`).run(); }
      finally { db.close(); }
    } else await buildTaxonomyMasterCandidate({ ...inputs, now: () => new Date(SECOND.getTime() + 1000) });
    await assert.rejects(service.classificationSave({ token: preview.token, confirmed: true }), /Quellenbeleg|eindeutig|veraltet/);
    assert.equal(await readIdentityReview(root), null);
  });
});

test("Schreibfehler hinterlässt keine halbe Vormerkung und gibt die Sperre für frischen Versuch frei", async (t) => {
  const { root, service, candidate } = await fixture(t);
  const broken = createClassificationReviewService({ taxonomyRoot: root, now: () => SECOND,
    readReview: () => readIdentityReview(root), readInputRevision: async () => candidate.inputRevisions.identityInputs,
    writeReview: async () => { throw new Error("Schreiben fehlgeschlagen"); } });
  const preview = await broken.classificationPreview();
  await assert.rejects(broken.classificationSave({ token: preview.token, confirmed: true }), /Schreiben fehlgeschlagen/);
  assert.equal(await readIdentityReview(root), null);
  const fresh = await service.classificationPreview();
  assert.equal((await service.classificationSave({ token: fresh.token, confirmed: true })).saved, true);
});

test("bestätigte Klassifikation wird auch im echten Master-Hilfsprozess mit ursprünglicher ID aufgebaut", async (t) => {
  const { root, service, inputs } = await fixture(t), before = rows(root);
  const preview = await service.classificationPreview();
  await service.classificationSave({ token: preview.token, confirmed: true });
  const registry = (await readIdentityReview(root)).registry;
  const job = await prepareMasterJob({ ...inputs, identityRegistry: registry, now: () => new Date(SECOND.getTime() + 1000) });
  const candidate = await startMasterJobProcess({ taxonomyRoot: root, id: job.id });
  assert.equal(candidate.classificationReview.total, 0);
  assert.equal(rows(root, "staging").taxa[0].master_taxon_id, before.taxa[0].master_taxon_id);
  assert.deepEqual(rows(root), before);
});

test("historische Klassifikations-Vorgänger dürfen nach einem späteren Split nicht durch rohe Altquellen reaktiviert werden", async (t) => {
  const { root, service, inputs } = await fixture(t), initial = rows(root);
  const preview = await service.classificationPreview();
  await service.classificationSave({ token: preview.token, confirmed: true });
  const registry = (await readIdentityReview(root)).registry;
  const master = await buildTaxonomyMasterCandidate({ ...inputs, identityRegistry: registry, now: () => new Date(SECOND.getTime() + 1000) });
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => new Date(SECOND.getTime() + 2000) });
  const db = new DatabaseSync(taxonomyMasterDatabasePath(root), { readOnly: true });
  let source;
  try { source = identityTaxonDetails(db, initial.taxa[0].master_taxon_id); } finally { db.close(); }
  const targets = [source, { scientificName: "Testus novus", rank: "species", kingdom: "Bacillati" }];
  const decision = { type: "split", registry, sources: [source], targets, evidence: [...source.evidence,
    { provider: "catalogue-of-life", providerVersion: "col-next", providerRecordId: "col-novus" }],
    reason: "Isolierte Schutzprobe, keine produktive Artaufteilung", baseVersion: master.candidateId,
    sourceRevision: master.inputRevisions.identitySources, inputRevision: master.inputRevisions.identityInputs,
    projectAssignments: [{ ...source.projects[0], sourceMasterTaxonId: source.masterTaxonId,
      targetKey: taxonIdentityKey(source), namePolicy: "keep-project-local" }] };
  const bound = previewIdentityDecision(decision);
  const split = confirmIdentityDecision(decision, { confirmed: true, token: bound.token, now: () => SECOND });
  const activeHash = await hash(taxonomyMasterDatabasePath(root));
  await assert.rejects(buildTaxonomyMasterCandidate({ ...inputs, identityRegistry: split.registry,
    colRecords: [...inputs.colRecords, { providerRecordId: "col-novus", ...targets[1] }],
    now: () => new Date(SECOND.getTime() + 3000) }), /historische Art erscheint/);
  assert.equal(await hash(taxonomyMasterDatabasePath(root)), activeHash);
});

test("bestätigte Klassifikation überschreibt eine eigene geschützte Hierarchie nicht pauschal", async (t) => {
  const { root, service, inputs } = await fixture(t);
  const db = new DatabaseSync(taxonomyMasterDatabasePath(root));
  try { db.prepare(`UPDATE master_field_assertion SET origin_kind='manual', provider_taxon_assertion_id=NULL,
    release_id=(SELECT release_id FROM provider_release WHERE provider='manual') WHERE field_name='kingdom' AND selected=1`).run(); }
  finally { db.close(); }
  await buildTaxonomyMasterCandidate({ ...inputs, now: () => new Date(SECOND.getTime() + 1000) });
  const preview = await service.classificationPreview();
  await service.classificationSave({ token: preview.token, confirmed: true });
  await buildTaxonomyMasterCandidate({ ...inputs, identityRegistry: (await readIdentityReview(root)).registry,
    now: () => new Date(SECOND.getTime() + 2000) });
  const inspected = await inspectTaxonomyMasterCandidate(root);
  assert.equal(inspected.manifest.classificationReview.total, 0);
  assert.equal(inspected.blockingConflictCount, 1);
  assert.ok(inspected.conflicts.some((entry) => entry.field_name === "kingdom" && entry.current_origin_kind === "manual"), JSON.stringify(inspected.conflicts));
  await assert.rejects(activateTaxonomyMasterCandidate(root, { confirmed: true }), /vor der Aktivierung/);
});

test("geprüfte Eingangsgrundlage und regulärer Folgeabgleich erhalten die bestätigte Klassifikation", async (t) => {
  const { root, service, inputs } = await fixture(t), before = rows(root);
  const covered = (value) => {
    const selection = coverMasterInputSelection({ colRelease: value.colRelease, colRecords: value.colRecords,
      targetNames: value.colRecords.map((record) => record.scientificName), providerSlices: value.providerSlices });
    return buildTaxonomyMasterCandidate({ ...value, colRecords: selection.records(), buildInputCoverage: selection.coverage });
  };
  const reviewed = await covered({ ...inputs, now: () => new Date(SECOND.getTime() + 1000) });
  assert.equal(reviewed.buildInputs.available, true);
  const preview = await service.classificationPreview();
  await service.classificationSave({ token: preview.token, confirmed: true });
  const manifest = await covered({ ...inputs, identityRegistry: (await readIdentityReview(root)).registry,
    now: () => new Date(SECOND.getTime() + 2000) });
  assert.equal(manifest.buildInputs.available, true);
  assert.equal(manifest.classificationReview.total, 0);
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => new Date(SECOND.getTime() + 3000) });
  const expected = rows(root);
  const followup = await covered({ ...inputs, now: () => new Date(SECOND.getTime() + 4000) });
  assert.equal(followup.buildInputs.available, true);
  assert.deepEqual(rows(root, "staging"), expected);
  assert.equal(expected.taxa[0].master_taxon_id, before.taxa[0].master_taxon_id);
});

test("Bündelübernahme verarbeitet mehr als 100 passende Fälle vollständig und hält unklare Einträge getrennt", async (t) => {
  const { root, service, inputs } = await fixture(t, { count: 105, missingLast: true });
  const before = rows(root), preview = await service.classificationPreview();
  assert.equal(preview.count, 104);
  assert.equal(preview.remaining, 1);
  await service.classificationSave({ token: preview.token, confirmed: true });
  const registry = (await readIdentityReview(root)).registry;
  assert.equal(registry.events.length, 104);
  await buildTaxonomyMasterCandidate({ ...inputs, identityRegistry: registry, now: () => new Date(SECOND.getTime() + 1000) });
  const after = rows(root, "staging"), originalIds = new Set(before.taxa.map((row) => row.master_taxon_id));
  assert.equal(after.taxa.filter((row) => originalIds.has(row.master_taxon_id)).length, 105);
  assert.equal(after.taxa.filter((row) => originalIds.has(row.master_taxon_id) && row.kingdom === "Bacillati").length, 104);
  const inspected = await inspectTaxonomyMasterCandidate(root);
  assert.equal(inspected.manifest.classificationReview.total, 1);
  assert.equal(inspected.blockingConflictCount, 1);
});
