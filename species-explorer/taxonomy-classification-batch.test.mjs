import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { classificationReviewCase } from "./taxonomy-classification-review.mjs";
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
async function fixture(t, { count = 1, missingLast = false } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fn-classification-batch-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 80 }));
  const root = path.join(directory, "taxonomy");
  const records = Array.from({ length: count }, (_, index) => ({ providerRecordId: String(index + 1),
    scientificName: speciesName(index + 1), rank: "species", kingdom: "Bacteria",
    hierarchy: { kingdom: "Bacteria" }, relevanceReasons: ["col-reference-gap"] }));
  const providerSlices = [{ manifest: { provider: "inaturalist", providerVersion: "fixture-inat", retrievedAt: FIRST.toISOString() }, records }];
  const projectTaxa = [{ projectTaxonKey: "fixture", projectSlug: "fixture", scientificName: records[0].scientificName,
    kingdom: "Bacteria", germanName: "Eigener Projektname" }];
  const corrections = [{ scientificName: records[0].scientificName, kingdom: "Bacteria", germanName: "Eigene Namenswahl" }];
  await buildTaxonomyMasterCandidate({ taxonomyRoot: root, colRelease: release("col-old", FIRST), colRecords: [],
    providerSlices, projectTaxa, corrections, now: () => FIRST });
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => FIRST });
  const colRecords = records.map((record, index) => ({ ...record, providerRecordId: `col-${index + 1}`, kingdom: "Bacillati",
    hierarchy: { kingdom: "Bacillati" }, identifiers: missingLast && index === count - 1 ? [] : [{ type: "inat", identifier: `inat:${index + 1}` }] }));
  const inputs = { taxonomyRoot: root, colRelease: release("col-next", SECOND), colRecords, providerSlices, projectTaxa, corrections, now: () => SECOND };
  const candidate = await buildTaxonomyMasterCandidate(inputs);
  let inputRevision = candidate.inputRevisions.identityInputs;
  const service = createIdentityReviewService({ taxonomyRoot: root, now: () => SECOND, readInputRevision: async () => inputRevision });
  return { root, service, inputs, candidate, setInputRevision: (value) => { inputRevision = value; } };
}

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
  await assert.rejects(service.classificationSave({ token: preview.token, confirmed: true }), /vormerkungen/);
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
