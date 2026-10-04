import { tmpdir } from "../scripts/test-temp.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { emptyIdentityRegistry, previewIdentityDecision, confirmIdentityDecision,
  validateIdentityRegistry, readIdentityRegistry, identityRegistryState, taxonIdentityKey } from "./taxonomy-identity-registry.mjs";
import { identityBuildSourceRevision } from "./taxonomy-identity-build.mjs";
import { buildTaxonomyMasterCandidate, taxonomyIdentityInputRevision } from "./taxonomy-master-candidate.mjs";
import { activateTaxonomyMasterCandidate, rollbackTaxonomyMaster } from "./taxonomy-master-lifecycle.mjs";
import { taxonomyMasterDatabasePath } from "./taxonomy-master-storage.mjs";
import { createStableMasterTaxonId } from "./taxonomy-master-model.mjs";
import { buildLightroomSearchPackage } from "./lightroom-search-package.mjs";
import { openLightroomSearchStore } from "./lightroom-search-store.mjs";
import { createIdentityReviewService, readIdentityReview, identityReviewStatus } from "./taxonomy-identity-review.mjs";
import { matchExplorerRoute } from "./request-router.mjs";
import { previewLightroomIdentity } from "./lightroom-identity-plan.mjs";

const first = new Date("2026-09-01T00:00:00Z");
const second = new Date("2026-09-02T00:00:00Z");
const third = new Date("2026-09-03T00:00:00Z");
const taxon = (scientificName) => ({ scientificName, rank: "species", kingdom: "Animalia" });
const source = (name) => ({ ...taxon(name), masterTaxonId: createStableMasterTaxonId(taxon(name)) });
const release = (version) => ({ provider: "catalogue-of-life", releaseId: `col-${version}`,
  providerVersion: version, importedAt: first.toISOString(), recordCount: 2 });
const evidence = (name, version) => ({ provider: "catalogue-of-life", providerVersion: version, providerRecordId: `col-${name}` });
const record = (name) => ({ ...taxon(name), providerRecordId: `col-${name}`, germanNames: [{ name: "Anbietername", preferred: true }],
  hierarchy: { kingdom: "Animalia", phylum: "Chordata", class: "Aves", order: "Testiformes", family: "Testidae",
    genus: name.split(" ")[0], species: name } });

function input(type = "continuation") {
  const sources = type === "merge" ? [source("Testus alpha"), source("Testus beta")] : [source("Testus alpha")];
  const targets = type === "split" ? [taxon("Testus alpha"), taxon("Testus beta")] : [taxon("Testus gamma")];
  return { registry: emptyIdentityRegistry(), type, sources, targets, baseVersion: "master-first",
    sourceRevision: identityBuildSourceRevision([release("two")]), inputRevision: taxonomyIdentityInputRevision(), reason: "Fachlich geprüfte Testentscheidung",
    evidence: [...sources.map((item) => evidence(item.scientificName, "one")), ...targets.map((item) => evidence(item.scientificName, "two"))] };
}

function confirmed(value) {
  return confirmIdentityDecision(value, { token: previewIdentityDecision(value).token, confirmed: true, now: () => second });
}

test("Identitätsvorschau schreibt nichts; Fortführung, Split und Merge unterscheiden ihre Wirkung", () => {
  for (const type of ["continuation", "split", "merge"]) {
    const value = input(type);
    const before = JSON.stringify(value);
    const preview = previewIdentityDecision(value);
    assert.equal(JSON.stringify(value), before);
    assert.equal(preview.changesPhotos, false);
    assert.equal(preview.selectionRequired, type === "split");
    assert.throws(() => confirmIdentityDecision(value, { token: preview.token }), /bestätigt/);
    assert.throws(() => confirmIdentityDecision({ ...value, baseVersion: "new" }, { confirmed: true, token: preview.token }), /veraltet/);
    const saved = confirmed(value);
    assert.equal(saved.registry.events.length, 1);
    if (type === "continuation") assert.equal(saved.event.targets[0].masterTaxonId, value.sources[0].masterTaxonId);
    else assert.ok(saved.event.targets.every((target) => !value.sources.some((old) => old.masterTaxonId === target.masterTaxonId)));
  }
});

test("Register sperrt ungültige Beziehungen, manipulierte Historie und erneute Nutzung historischer IDs", () => {
  const value = input("split");
  for (const change of [
    { targets: [value.targets[0]] }, { sources: [] }, { sources: [value.sources[0], value.sources[0]] },
    { targets: [value.targets[0], value.targets[0]] }, { evidence: [] }, { reason: "" },
    { targets: [{ ...value.targets[0], kingdom: "Plantae" }, value.targets[1]] },
    { targets: [{ ...value.targets[0], rank: "subspecies" }, value.targets[1]] },
  ]) assert.throws(() => previewIdentityDecision({ ...value, ...change }));
  const saved = confirmed(value);
  const changed = structuredClone(saved.registry);
  changed.events[0].reason = "nachträglich geändert";
  assert.throws(() => validateIdentityRegistry(changed), /Prüfsumme/);
  assert.throws(() => previewIdentityDecision({ ...input(), registry: saved.registry }), /historische/);
});

async function fixture(t, type, { corrections = [], projectTaxa = [] } = {}) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "taxonomy-identity-"));
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 }));
  const value = input(type);
  const firstManifest = await buildTaxonomyMasterCandidate({ taxonomyRoot: root, colRelease: release("one"),
    colRecords: value.sources.map((item) => record(item.scientificName)), corrections, projectTaxa, now: () => first });
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => first });
  value.baseVersion = firstManifest.candidateId;
  value.inputRevision = taxonomyIdentityInputRevision({ corrections, projectTaxa });
  const saved = confirmed(value);
  const build = (overrides = {}) => buildTaxonomyMasterCandidate({ taxonomyRoot: root, colRelease: release("two"),
    colRecords: value.targets.map((item) => record(item.scientificName)), corrections, projectTaxa,
    identityRegistry: saved.registry, now: () => second, ...overrides });
  return { root, value, saved, build };
}

function read(root, slot, run) {
  const db = new DatabaseSync(taxonomyMasterDatabasePath(root, slot), { readOnly: true });
  try { return run(db); } finally { db.close(); }
}

for (const type of ["continuation", "split", "merge"]) {
  test(`SQLite: ${type} bleibt über Aufbau, Paket, weiteren Quellenstand und Rollback konsistent`, async (t) => {
    const { root, value, saved, build } = await fixture(t, type);
    const activeBefore = await fs.readFile(taxonomyMasterDatabasePath(root));
    await build();
    assert.deepEqual(await fs.readFile(taxonomyMasterDatabasePath(root)), activeBefore);
    const rows = read(root, "staging", (db) => db.prepare("SELECT * FROM master_taxon").all());
    assert.equal(rows.filter((row) => row.lifecycle_state === "active").length, value.targets.length);
    for (const target of saved.event.targets) assert.equal(rows.find((row) => row.master_taxon_id === target.masterTaxonId).canonical_scientific_name, target.scientificName);
    assert.deepEqual(read(root, "staging", readIdentityRegistry), saved.registry);
    await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => second });
    const searchRoot = path.join(root, "search");
    await buildLightroomSearchPackage({ taxonomyRoot: root, searchRoot, now: () => second });
    const store = await openLightroomSearchStore({ searchRoot, slot: "staging" });
    try {
      const resolution = store.identityResolution(value.sources[0].masterTaxonId);
      assert.equal(resolution.state, type === "continuation" ? "current" : "historical");
      assert.equal(resolution.automaticPhotoChange, false);
      const photo = { photoUuid: "fixture-photo", masterTaxonId: value.sources[0].masterTaxonId,
        germanName: "Bisherige Art", scientificName: value.sources[0].scientificName,
        referenceImage: "no", snapshotHash: "a".repeat(64) };
      const preview = previewLightroomIdentity(store, { catalogKey: "fixture-catalog", photos: [photo],
        choices: type === "continuation" ? [] : [{ sourceMasterTaxonId: photo.masterTaxonId,
          targetMasterTaxonId: saved.event.targets[0].masterTaxonId }],
        favoriteInventory: { complete: true, taxonomyPhotos: [photo] } });
      assert.equal(preview.ready, type !== "continuation");
      assert.equal(preview.changesPhotos, false);
      if (type !== "continuation") assert.equal(preview.transfers[0].targetMasterTaxonId, saved.event.targets[0].masterTaxonId);
      if (type !== "continuation") {
        assert.equal(store.taxon(value.sources[0].masterTaxonId), null);
        assert.deepEqual(resolution.successorIds, saved.event.targets.map((target) => target.masterTaxonId));
      }
    } finally { store.close(); }
    await build({ identityRegistry: undefined, colRelease: release("three"), now: () => third });
    assert.deepEqual(read(root, "staging", readIdentityRegistry), saved.registry);
    await rollbackTaxonomyMaster(root, { confirmed: true, now: () => third });
    assert.equal(read(root, "active", readIdentityRegistry).events.length, 0);
    assert.ok(read(root, "active", (db) => db.prepare("SELECT 1 FROM master_taxon WHERE master_taxon_id = ?").get(value.sources[0].masterTaxonId)));
  });
}

test("Reine Umbenennung erhält eigene Namen und Projektlink ohne Projektdateien umzubenennen", async (t) => {
  const corrections = [{ ...taxon("Testus alpha"), germanName: "Mein Name", englishName: "My name" }];
  const projectTaxa = [{ ...taxon("Testus alpha"), germanName: "Mein Name", englishName: "My name", projectTaxonKey: "testusalpha", projectSlug: "testusalpha" }];
  const { root, build, value } = await fixture(t, "continuation", { corrections, projectTaxa });
  await build();
  assert.equal(read(root, "staging", (db) => db.prepare("SELECT field_value FROM master_field_assertion WHERE field_name = 'german-name' AND selected = 1").get().field_value), "Mein Name");
  const link = read(root, "staging", (db) => db.prepare("SELECT * FROM project_taxon_link").get());
  assert.equal(link.master_taxon_id, value.sources[0].masterTaxonId);
  assert.equal(link.scientific_name_at_link, "Testus alpha");
  assert.equal(link.project_slug, "testusalpha");
  assert.deepEqual(corrections[0].scientificName, "Testus alpha");
});

test("bestätigte Fortführung fragt Namen/Gattung nicht doppelt, gibt aber andere geschützte Hierarchie nicht frei", async (t) => {
  const projectTaxa = [{ ...taxon("Testus alpha"), projectTaxonKey: "project-alpha", projectSlug: "alpha-url" }];
  const { root, build, value } = await fixture(t, "continuation", { projectTaxa });
  const target = taxon("Otherus gamma");
  const saved = confirmed({ ...value, targets: [target],
    evidence: [evidence("Testus alpha", "one"), evidence(target.scientificName, "two")] });
  await build({ identityRegistry: saved.registry, colRecords: [record(target.scientificName)] });
  assert.equal(read(root, "staging", (db) => db.prepare("SELECT COUNT(*) AS n FROM master_conflict WHERE conflict_state='open' AND conflict_type='changed-value'").get().n), 0);
  assert.equal(read(root, "staging", (db) => db.prepare("SELECT field_value FROM master_field_assertion WHERE field_name='genus' AND selected=1").get().field_value), "Otherus");
  const changed = record(target.scientificName);
  changed.hierarchy.family = "New family";
  await build({ identityRegistry: saved.registry, colRecords: [changed] });
  assert.deepEqual(read(root, "staging", (db) => db.prepare("SELECT field_name FROM master_conflict WHERE conflict_state='open' AND conflict_type='changed-value'").all().map((row) => row.field_name)), ["family"]);
  assert.equal(read(root, "staging", (db) => db.prepare("SELECT field_value FROM master_field_assertion WHERE field_name='family' AND selected=1").get().field_value), "Testidae");
  await assert.rejects(activateTaxonomyMasterCandidate(root, { confirmed: true }), /entschieden werden/);
});

test("Veraltete oder unbelegte Entscheidungen verändern weder aktiven Master noch einen vorhandenen Kandidaten", async (t) => {
  const { root, build, value, saved } = await fixture(t, "split");
  await build();
  const before = await fs.readFile(taxonomyMasterDatabasePath(root, "staging"));
  await assert.rejects(build({ colRelease: release("changed") }), /anderen Master- oder Quellenstand/);
  await assert.rejects(build({ corrections: [{ ...taxon("Testus alpha"), germanName: "Parallel geändert" }] }), /anderen Master- oder Quellenstand/);
  const bogus = confirmed({ ...value, evidence: [...value.evidence, evidence("Erfundener beleg", "two")] });
  await assert.rejects(build({ identityRegistry: bogus.registry }), /nicht belegbaren Quellenverweis/);
  assert.deepEqual(await fs.readFile(taxonomyMasterDatabasePath(root, "staging")), before);
  assert.equal(identityRegistryState(saved.registry).historical.size, 1);
});

test("Gleichnamiger Split übernimmt keine Altpräferenz, behält aber eine später explizit an seine neue ID gebundene Wahl", async (t) => {
  const corrections = [{ ...taxon("Testus alpha"), germanName: "Alter eigener Name" }];
  const { root, saved, build } = await fixture(t, "split", { corrections });
  await build();
  const target = saved.event.targets.find((entry) => entry.scientificName === "Testus alpha");
  const name = (slot) => read(root, slot, (db) => db.prepare("SELECT field_value FROM master_field_assertion WHERE field_name = 'german-name' AND selected = 1 AND master_taxon_id = ?").get(target.masterTaxonId)?.field_value);
  assert.equal(name("staging"), "Anbietername");
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => second });
  await build({ identityRegistry: undefined, now: () => third, corrections: [{ ...taxon("Testus alpha"),
    germanName: "Neue bewusste Wahl", namePreference: { masterTaxonId: target.masterTaxonId } }] });
  assert.equal(name("staging"), "Neue bewusste Wahl");
});

test("Split einer Projektart wird bis zur geklärten Projektzuordnung gesperrt statt still neu zugeordnet", async (t) => {
  const projectTaxa = [{ ...taxon("Testus alpha"), germanName: "Projektname", englishName: "Project name", projectTaxonKey: "alpha", projectSlug: "alpha" }];
  const { root, build, value } = await fixture(t, "split", { projectTaxa });
  await assert.rejects(build(), /betroffene Projektart.*Nachfolgerzuordnung/);
  const link = read(root, "active", (db) => db.prepare("SELECT master_taxon_id FROM project_taxon_link").get());
  assert.equal(link.master_taxon_id, value.sources[0].masterTaxonId);
});

test("Geschützte Review-API merkt Entscheidungen vor, ohne Kandidat, aktiven Master oder Fotos zu verändern", async (t) => {
  const { root, value, build } = await fixture(t, "split");
  await build({ identityRegistry: undefined });
  const activeBefore = await fs.readFile(taxonomyMasterDatabasePath(root));
  const candidateBefore = await fs.readFile(taxonomyMasterDatabasePath(root, "staging"));
  const service = createIdentityReviewService({ taxonomyRoot: root, now: () => second });
  const payload = { type: "split", sourceIds: value.sources.map((entry) => entry.masterTaxonId),
    targetIds: value.targets.map((entry) => createStableMasterTaxonId(entry)), reason: "Anhand der Quellen fachlich geprüft" };
  const preview = await service.preview(payload);
  assert.equal(preview.changesPhotos, false);
  assert.equal(await readIdentityReview(root), null);
  await assert.rejects(service.save({ ...payload, token: preview.token }), /bestätigt/);
  await assert.rejects(service.save({ ...payload, token: "veraltet", confirmed: true }), /Vorschau/);
  const result = await service.save({ ...payload, token: preview.token, confirmed: true });
  assert.equal(result.pending, true);
  assert.equal(result.changesPhotos, false);
  assert.equal((await readIdentityReview(root)).registry.events.length, 1);
  assert.equal((await identityReviewStatus(root)).pending, true);
  assert.deepEqual(await fs.readFile(taxonomyMasterDatabasePath(root)), activeBefore);
  assert.deepEqual(await fs.readFile(taxonomyMasterDatabasePath(root, "staging")), candidateBefore);
  await assert.rejects(activateTaxonomyMasterCandidate(root, { confirmed: true }), /Identitätsentscheidungen fehlen/);
  assert.deepEqual(await fs.readFile(taxonomyMasterDatabasePath(root)), activeBefore);
  await build({ identityRegistry: (await readIdentityReview(root)).registry });
  assert.equal(read(root, "staging", readIdentityRegistry).events.length, 1);
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => second });
  assert.equal((await identityReviewStatus(root, { active: { inputRevisions: { identities: result.revision } } })).pending, false);
  assert.deepEqual(matchExplorerRoute("POST", "/api/taxonomy/master/identity/save"), { name: "taxonomy-master", action: "identity-save" });
  assert.notEqual(matchExplorerRoute("GET", "/api/taxonomy/master/identity/save").name, "taxonomy-master");
});

test("Fortführung mit späterem Split reaktiviert auch den früheren wissenschaftlichen Namen nicht", async (t) => {
  const { root, saved, build } = await fixture(t, "continuation");
  const prior = await build();
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => second });
  const corrections = [{ ...taxon("Testus alpha"), germanName: "Alte Namenswahl" }];
  const next = confirmed({ registry: saved.registry, type: "split", sources: saved.event.targets,
    targets: [taxon("Testus gamma"), taxon("Testus beta")], baseVersion: prior.candidateId,
    sourceRevision: identityBuildSourceRevision([release("three")]), inputRevision: taxonomyIdentityInputRevision({ corrections }),
    reason: "Zunächst umbenannt, später fachlich aufgeteilt", evidence: [evidence("Testus gamma", "two"),
      evidence("Testus gamma", "three"), evidence("Testus beta", "three")] });
  const reordered = { schemaVersion: 1, events: [...next.registry.events].reverse() };
  assert.throws(() => validateIdentityRegistry(reordered), /Registerhistorie/);
  await build({ identityRegistry: next.registry, corrections, colRelease: release("three"),
    colRecords: next.event.targets.map((entry) => record(entry.scientificName)), now: () => third });
  const rows = read(root, "staging", (db) => db.prepare("SELECT canonical_scientific_name FROM master_taxon WHERE lifecycle_state = 'active'").all());
  assert.deepEqual(rows.map((row) => row.canonical_scientific_name).sort(), ["Testus beta", "Testus gamma"]);
  assert.equal(read(root, "staging", (db) => db.prepare("SELECT COUNT(*) AS n FROM master_field_assertion WHERE selected = 1 AND field_value = 'Alte Namenswahl'").get().n), 0);
});

test("Fallauswahl sucht begrenzt in aktivem Master und Kandidat; leere Suche und fehlender Kandidat starten nichts", async (t) => {
  const { root, build } = await fixture(t, "continuation");
  const service = createIdentityReviewService({ taxonomyRoot: root });
  assert.equal((await service.browse({})).available, false);
  assert.deepEqual((await service.browse({ mode: "search", query: "" })).results, []);
  await build({ identityRegistry: undefined });
  const activeBefore = await fs.readFile(taxonomyMasterDatabasePath(root));
  const prior = await service.browse({ mode: "search", slot: "active", query: "Testus alpha" });
  const target = await service.browse({ mode: "search", slot: "staging", query: "Testus gamma" });
  assert.equal(prior.results[0].scientificName, "Testus alpha");
  assert.equal(target.results[0].scientificName, "Testus gamma");
  assert.equal(prior.results[0].germanName, "Anbietername");
  assert.equal(prior.results[0].evidence[0].providerVersion, "one");
  assert.equal(target.results[0].evidence[0].providerVersion, "two");
  assert.equal((await service.browse({})).cases.length, 0);
  await assert.rejects(service.browse({ mode: "search", slot: "../active", query: "Testus" }), /Fallauswahl/);
  await assert.rejects(service.browse({ mode: "search", query: "x".repeat(201) }), /zu lang/);
  assert.deepEqual(await fs.readFile(taxonomyMasterDatabasePath(root)), activeBefore);
});

test("Projektfälle bleiben auf Seiten begrenzt und ungeklärte Projekt-Splits lassen sich nicht vormerken", async (t) => {
  const projectTaxa = Array.from({ length: 23 }, (_, i) => ({ ...taxon("Testus alpha"), germanName: "Projektart",
    englishName: "Project species", projectTaxonKey: `project-${String(i).padStart(2, "0")}`, projectSlug: `project-${i}` }));
  const { root, build, value } = await fixture(t, "split", { projectTaxa });
  await build({ identityRegistry: undefined });
  const service = createIdentityReviewService({ taxonomyRoot: root });
  const page = await service.browse({});
  assert.equal(page.checked, 20);
  assert.ok(page.next);
  assert.equal((await service.browse({ after: page.next })).checked, 3);
  const payload = { type: "split", sourceIds: value.sources.map((taxon) => taxon.masterTaxonId),
    targetIds: value.targets.map(createStableMasterTaxonId), reason: "Fachlich geprüfte Aufteilung" };
  const preview = await service.preview(payload);
  assert.equal(preview.sources[0].projects.length, 23);
  await assert.rejects(service.save({ ...payload, token: preview.token, confirmed: true }), /Projekt-Nachfolgerzuordnung/);
  assert.equal(await readIdentityReview(root), null);
});

test("Offene Vormerkungen lassen sich nach neuer Vorschau verwerfen, aktive Entscheidungen und Dateiinhalte nicht", async (t) => {
  const { root, value, build } = await fixture(t, "split");
  await build({ identityRegistry: undefined });
  const service = createIdentityReviewService({ taxonomyRoot: root });
  const payload = { type: "split", sourceIds: value.sources.map((entry) => entry.masterTaxonId),
    targetIds: value.targets.map(createStableMasterTaxonId), reason: "Prüffall" };
  const preview = await service.preview(payload);
  await service.save({ ...payload, token: preview.token, confirmed: true });
  const before = await fs.readFile(taxonomyMasterDatabasePath(root));
  const candidateBefore = await fs.readFile(taxonomyMasterDatabasePath(root, "staging"));
  const discard = await service.discardPreview();
  assert.equal(discard.count, 1);
  await assert.rejects(service.discard({ token: discard.token }), /Bestätigung/);
  await assert.rejects(service.discard({ token: "veraltet", confirmed: true }), /Vorschau/);
  await service.discard({ token: discard.token, confirmed: true });
  assert.equal((await readIdentityReview(root)).registry.events.length, 0);
  assert.equal((await identityReviewStatus(root)).pending, false);
  assert.deepEqual(await fs.readFile(taxonomyMasterDatabasePath(root)), before);
  assert.deepEqual(await fs.readFile(taxonomyMasterDatabasePath(root, "staging")), candidateBefore);
  await assert.rejects(service.discardPreview(), /keine offenen/);
  const fresh = await service.preview(payload);
  await service.save({ ...payload, token: fresh.token, confirmed: true });
  await build({ identityRegistry: (await readIdentityReview(root)).registry });
  await activateTaxonomyMasterCandidate(root, { confirmed: true });
  await assert.rejects(service.discardPreview(), /Aktive Entscheidungen/);
  await rollbackTaxonomyMaster(root, { confirmed: true });
  const rolledBack = await fs.readFile(taxonomyMasterDatabasePath(root));
  const afterRollback = await service.discardPreview();
  assert.equal(afterRollback.count, 1);
  await service.discard({ token: afterRollback.token, confirmed: true });
  assert.equal((await service.browse({})).review, null);
  assert.deepEqual(await fs.readFile(taxonomyMasterDatabasePath(root)), rolledBack);
});

test("Die Vorschau verhindert das stillschweigende Übernehmen einer anderen bereits bestehenden Zielart", async (t) => {
  const { root, build } = await fixture(t, "merge");
  await build({ identityRegistry: undefined, colRecords: [record("Testus beta"), record("Testus gamma")] });
  const service = createIdentityReviewService({ taxonomyRoot: root });
  await assert.rejects(service.preview({ type: "continuation", sourceIds: [source("Testus alpha").masterTaxonId],
    targetIds: [source("Testus beta").masterTaxonId], reason: "Unzulässige Gleichsetzung" }), /andere bestehende Identität/);
  assert.equal(await readIdentityReview(root), null);
});

for (const type of ["split", "merge"]) {
  test(`Bestätigte Projektzuordnung bei ${type} erhält Website-Identität und bleibt über Neubau und Rollback stabil`, async (t) => {
    const projectTaxa = ["Testus alpha", type === "merge" ? "Testus beta" : "Testus alpha"].map((name, i) => ({
      ...taxon(name), kingdom: i === 1 ? "Metazoa" : "Animalia",
      projectTaxonKey: `project-${i}`, projectSlug: `url-${i}`, germanName: `Alter Projektname ${i}`,
      englishName: `Old project name ${i}` }));
    const beforeProjects = structuredClone(projectTaxa);
    const { root, build, value } = await fixture(t, type, { projectTaxa });
    const saved = confirmed({ ...value, projectAssignments: projectTaxa.map((project, i) => ({
      projectTaxonKey: project.projectTaxonKey, projectSlug: project.projectSlug, scientificNameAtLink: project.scientificName,
      sourceMasterTaxonId: source(project.scientificName).masterTaxonId,
      targetKey: taxonIdentityKey(value.targets[type === "split" ? i : 0]), namePolicy: "keep-project-local" })) });
    const activeBefore = await fs.readFile(taxonomyMasterDatabasePath(root));
    await build({ identityRegistry: saved.registry });
    assert.deepEqual(await fs.readFile(taxonomyMasterDatabasePath(root)), activeBefore);
    const check = (slot) => {
      const links = read(root, slot, (db) => db.prepare("SELECT * FROM project_taxon_link ORDER BY project_taxon_key").all());
      assert.equal(links.length, 2);
      links.forEach((link, i) => {
        assert.equal(link.master_taxon_id, saved.event.targets.find((target) => taxonIdentityKey(target) === taxonIdentityKey(value.targets[type === "split" ? i : 0])).masterTaxonId);
        assert.equal(link.project_slug, `url-${i}`);
        assert.equal(link.scientific_name_at_link, projectTaxa[i].scientificName);
        assert.equal(link.link_state, "linked");
      });
      assert.equal(read(root, slot, (db) => db.prepare("SELECT COUNT(*) AS n FROM master_field_assertion WHERE selected = 1 AND field_value LIKE 'Alter Projektname%'").get().n), 0);
    };
    check("staging");
    await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => second });
    await build({ identityRegistry: undefined, colRelease: release("three"), now: () => third });
    check("staging");
    await assert.rejects(build({ identityRegistry: undefined, projectTaxa: [{ ...projectTaxa[0], projectSlug: "anderer-slug" }, projectTaxa[1]], now: () => third }), /Projektidentität/);
    assert.deepEqual(projectTaxa, beforeProjects);
    await rollbackTaxonomyMaster(root, { confirmed: true, now: () => third });
    const restored = read(root, "active", (db) => db.prepare("SELECT master_taxon_id FROM project_taxon_link ORDER BY project_taxon_key").all());
    restored.forEach((link, i) => assert.equal(link.master_taxon_id, source(projectTaxa[i].scientificName).masterTaxonId));
  });
}

test("Review speichert Projektentscheidungen nur vollständig und mit unveränderter Vorschau", async (t) => {
  const projectTaxa = [{ ...taxon("Testus alpha"), projectTaxonKey: "project-alpha", projectSlug: "alpha", germanName: "Altname", englishName: "Old name" }];
  const { root, build, value } = await fixture(t, "split", { projectTaxa });
  await build({ identityRegistry: undefined });
  const service = createIdentityReviewService({ taxonomyRoot: root, now: () => second });
  const payload = { type: "split", reason: "Geprüfte Aufteilung", sourceIds: value.sources.map((taxon) => taxon.masterTaxonId),
    targetIds: value.targets.map(createStableMasterTaxonId), projectAssignments: [{ projectTaxonKey: "project-alpha",
      targetId: createStableMasterTaxonId(taxon("Testus beta")), namePolicy: "keep-project-local" }] };
  await assert.rejects(service.preview({ ...payload, projectAssignments: [{ ...payload.projectAssignments[0], namePolicy: "copy-all" }] }), /Projekttexte/);
  await assert.rejects(service.preview({ ...payload, projectAssignments: [{ ...payload.projectAssignments[0], projectTaxonKey: "fremd" }] }), /fremde Projektart/);
  const preview = await service.preview(payload);
  assert.equal(preview.projectEffects[0].targetScientificName, "Testus beta");
  await assert.rejects(service.save({ ...payload, projectAssignments: [{ ...payload.projectAssignments[0], targetId: payload.targetIds[0] }], token: preview.token, confirmed: true }), /Vorschau/);
  await service.save({ ...payload, token: preview.token, confirmed: true });
  await build({ identityRegistry: (await readIdentityReview(root)).registry });
  assert.equal(read(root, "staging", (db) => db.prepare("SELECT canonical_scientific_name FROM master_taxon JOIN project_taxon_link USING(master_taxon_id)").get().canonical_scientific_name), "Testus beta");
});

test("Projekt folgt einer bestätigten Fortführung, benötigt beim nächsten Split aber eine neue Zielentscheidung", async (t) => {
  const projectTaxa = [{ ...taxon("Testus alpha"), kingdom: "Metazoa", projectTaxonKey: "project-alpha",
    projectSlug: "alpha-url", germanName: "Ursprünglicher Projektname", englishName: "Original project name" }];
  const { root, build, value } = await fixture(t, "split", { projectTaxa });
  const assignment = { projectTaxonKey: "project-alpha", projectSlug: "alpha-url", scientificNameAtLink: "Testus alpha",
    sourceMasterTaxonId: value.sources[0].masterTaxonId, targetKey: taxonIdentityKey(taxon("Testus beta")), namePolicy: "keep-project-local" };
  const split = confirmed({ ...value, projectAssignments: [assignment] });
  const splitManifest = await build({ identityRegistry: split.registry });
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => second });
  const chosen = split.event.targets.find((entry) => entry.scientificName === "Testus beta");
  const continuation = confirmed({ ...value, registry: split.registry, type: "continuation", sources: [chosen],
    targets: [taxon("Testus gamma")], baseVersion: splitManifest.candidateId,
    sourceRevision: identityBuildSourceRevision([release("three")]),
    evidence: [evidence("Testus beta", "two"), evidence("Testus gamma", "three")] });
  const continuationManifest = await build({ identityRegistry: continuation.registry, colRelease: release("three"),
    colRecords: [record("Testus alpha"), record("Testus gamma")], now: () => third });
  const linked = (slot) => read(root, slot, (db) => db.prepare(
    "SELECT master_taxon_id, canonical_scientific_name, project_slug, scientific_name_at_link FROM project_taxon_link JOIN master_taxon USING(master_taxon_id)").get());
  assert.equal(linked("staging").master_taxon_id, chosen.masterTaxonId);
  assert.equal(linked("staging").canonical_scientific_name, "Testus gamma");
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => third });
  const activeBefore = await fs.readFile(taxonomyMasterDatabasePath(root));
  const nextInput = { ...value, registry: continuation.registry, sources: continuation.event.targets,
    targets: [taxon("Testus gamma"), taxon("Testus delta")], baseVersion: continuationManifest.candidateId,
    sourceRevision: identityBuildSourceRevision([release("four")]),
    evidence: [evidence("Testus gamma", "three"), evidence("Testus gamma", "four"), evidence("Testus delta", "four")] };
  const fourth = new Date("2026-09-04T00:00:00Z");
  const nextBuild = (registry) => build({ identityRegistry: registry, colRelease: release("four"),
    colRecords: [record("Testus alpha"), record("Testus gamma"), record("Testus delta")], now: () => fourth });
  await assert.rejects(nextBuild(confirmed(nextInput).registry), /betroffene Projektart.*Nachfolgerzuordnung/);
  assert.throws(() => confirmed({ ...nextInput, projectAssignments: [assignment] }), /Identitätskette/);
  const next = confirmed({ ...nextInput, projectAssignments: [{ ...assignment,
    sourceMasterTaxonId: chosen.masterTaxonId, targetKey: taxonIdentityKey(taxon("Testus delta")) }] });
  await nextBuild(next.registry);
  assert.equal(linked("staging").canonical_scientific_name, "Testus delta");
  assert.notEqual(linked("staging").master_taxon_id, chosen.masterTaxonId);
  assert.equal(linked("staging").scientific_name_at_link, "Testus alpha");
  assert.equal(linked("staging").project_slug, "alpha-url");
  assert.deepEqual(await fs.readFile(taxonomyMasterDatabasePath(root)), activeBefore);
  await activateTaxonomyMasterCandidate(root, { confirmed: true, now: () => fourth });
  await rollbackTaxonomyMaster(root, { confirmed: true });
  assert.equal(linked("active").master_taxon_id, chosen.masterTaxonId);
  assert.equal(linked("active").canonical_scientific_name, "Testus gamma");
});
