import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { fixture, species as publicSpecies } from "./test-fixtures.mjs";
import { createSharedProjectHttp } from "./http.mjs";
import { createExplorerSharedProjectService } from "./explorer-service.mjs";
import { createInitialProjectImport } from "./initial-import.mjs";
import { buildCatalog } from "./catalog.mjs";
import { createWorkingImportSource } from "../species-content/working-import-source.mjs";
import { objectJson } from "./security.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const denied = (code) => (error) => error.code === code;
async function scoped(fn, serviceOptions = {}) {
  const f = fixture(), controllers = []; let remote, service;
  try {
    const initialized = await f.initialized(), assetsRoot = path.join(f.root, "assets");
    const input = ["Strix", "Bubo"].map((genus, index) => ({ german: `Testkauz ${index + 1}`, english: `Fixture owl ${index + 1}`, genus,
      species: "fixture", size: "20 cm", weight: "400 g", life_expectancy: "10 Jahre", originalPrivate: { keep: index } }));
    const ids = ["first-owl", "second-owl"];
    const source = { speciesList: input, speciesData: input.map((entry, index) => ({ URLSlug: ids[index], Genus: entry.genus, Species: entry.species,
      "Wissenschaftlicher Name": `${entry.genus} ${entry.species}`, Status: "LC", sourceOnly: "preserve" })),
      catalog: buildCatalog({ revision: "isolated-working-fixture", species: input.map((entry, index) => ({ ...publicSpecies(ids[index]),
        scientificName: `${entry.genus} ${entry.species}`, commonName: entry.german })) }),
      assetOverrides: { version: 1, assets: {} }, taxonomyOverrides: { version: 1, species: {} }, assessmentBindings: {},
      bindings: ids.map((id, index) => ({ id, assetName: `Testkauz${index + 1}`, generalSectionId: null, embeddedGeneralText: null })) };
    for (const binding of source.bindings) {
      await fs.mkdir(path.join(assetsRoot, binding.assetName), { recursive: true });
      await fs.writeFile(path.join(assetsRoot, binding.assetName, "map.jpg"), `Synthetic map ${binding.id}`);
    }
    remote = createSharedProjectHttp({ store: initialized.store }); const address = await remote.listen();
    service = createExplorerSharedProjectService({ filename: path.join(f.root, "client.sqlite"), localStorageConfirmed: true, allowLoopbackHttp: true, ...serviceOptions });
    await service.connect({ baseUrl: address.url, username: initialized.a.user.username, password: f.password });
    const adapter = createWorkingImportSource({ assetsRoot, readSources: async () => structuredClone(source) });
    const filename = path.join(f.root, "initial-import.sqlite");
    function controller(options = {}) {
      const value = createInitialProjectImport({ service, filename, localStorageConfirmed: true, sourceAdapter: adapter, ...options });
      controllers.push(value); return value;
    }
    await fn({ f, ...initialized, service, address, assetsRoot, source, adapter, filename, controller });
  } finally {
    for (const value of controllers) await value.close();
    await service?.close(); await remote?.close(); f.cleanup();
  }
}

test("complete working records use the existing explicit importer and remain full drafts with original metadata and files", () => scoped(async ({ controller, adapter, store, a, assetsRoot, filename, service }) => {
  const expected = await adapter.read(), value = controller(), plan = await value.prepare();
  assert.equal(plan.source.kind, "working-records"); assert.equal(plan.counts.willCreate, 2); assert.equal(store.listObjects(a.token).length, 0);
  assert.ok(!JSON.stringify(plan).includes("originalPrivate"));
  await assert.rejects(value.apply({ planId: plan.planId }), denied("import_confirmation_required"));
  const done = await value.apply({ planId: plan.planId, confirmed: true });
  assert.equal(done.state, "complete"); assert.equal(done.counts.created, 2); assert.equal(done.counts.approved, 0);
  for (const record of expected.species) {
    const actual = store.getObject(a.token, "species", record.id);
    assert.deepEqual(actual.data, record); assert.equal(actual.approvedRevision, null);
    assert.equal(await fs.readFile(path.join(assetsRoot, record.assets.assetName, "map.jpg"), "utf8"), `Synthetic map ${record.id}`);
  }
  assert.equal(store.catalog(a.token).species.length, 0);
  const workspace = await service.speciesWorkspace.read(); assert.equal(workspace.species.length, 2); assert.equal(workspace.species[0].source, "shared-project");
  const db = new DatabaseSync(filename, { readOnly: true });
  assert.equal(db.prepare("PRAGMA user_version").get().user_version, 2);
  assert.equal(db.prepare("SELECT kind FROM source_bindings").get().kind, "working-records"); db.close();
}));

test("a lost creation acknowledgement resumes full working import without duplicate versions and requires separate reader release", () => scoped(async ({ controller, service, store, a }) => {
  const create = service.create; let lost = false;
  service.create = async (input) => { const result = await create(input); if (!lost) { lost = true; throw new Error("Synthetic lost acknowledgement"); } return result; };
  const value = controller(), plan = await value.prepare({ releaseForReaders: true });
  await assert.rejects(value.apply({ planId: plan.planId, confirmed: true }), denied("import_release_confirmation_required"));
  await assert.rejects(value.apply({ planId: plan.planId, confirmed: true, confirmInternalRelease: true }), denied("import_not_confirmed"));
  assert.equal(store.listObjects(a.token).length, 1); await value.close();
  const resumed = controller(), done = await resumed.apply({ planId: plan.planId, confirmed: true, confirmInternalRelease: true });
  assert.equal(done.counts.approved, 2); assert.equal(store.catalog(a.token).species.length, 2);
  assert.equal(store.getObject(a.token, "species", "first-owl").ordinal, 1);
  assert.ok(resumed.receipts(plan.planId).some((item) => item.phase === "recovered-confirmed"));
}));

test("existing narrow catalog entries and different working records keep their current content, version and approval", () => scoped(async ({ controller, adapter, store, a }) => {
  const full = await adapter.read(), first = full.species[0];
  const legacy = store.createObject(a.token, { kind: "species", id: first.id, data: { ...publicSpecies(first.id, "Human description"), scientificName: "Strix fixture" } });
  store.approveObject(a.token, "species", first.id, { expectedRevision: legacy.revision });
  const second = structuredClone(full.species[1]); second.input.english = "Newer human working text";
  const existing = store.createObject(a.token, { kind: "species", id: second.id, data: second });
  const before = store.getObject(a.token, "species", first.id), value = controller(), plan = await value.prepare({ releaseForReaders: true });
  assert.equal(plan.counts.skippedExisting, 2); assert.equal(plan.counts.existingDifferent, 2);
  await value.apply({ planId: plan.planId, confirmed: true, confirmInternalRelease: true });
  assert.deepEqual(store.getObject(a.token, "species", first.id), before);
  assert.deepEqual(store.getObject(a.token, "species", second.id), existing);
}));

test("scientific identity under another ID blocks the displayed plan, persists in status and never creates a duplicate", () => scoped(async ({ controller, store, a }) => {
  store.createObject(a.token, { kind: "species", id: "other-id", data: { ...publicSpecies("other-id"), scientificName: "  STRIX   fixture  " } });
  const value = controller(), plan = await value.prepare();
  assert.equal(plan.canApply, false); assert.equal(value.status().plan.canApply, false);
  assert.equal(plan.drift[0].reason, "scientific-identity-under-other-id");
  await assert.rejects(value.apply({ planId: plan.planId, confirmed: true }), denied("import_drift"));
  assert.equal(store.listObjects(a.token).length, 1);
}));

test("an identity collision appearing during source verification is rejected atomically by the server", () => scoped(async ({ controller, adapter, store, a }) => {
  let inserted = false;
  const sourceAdapter = { ...adapter, async verifySpecies(...args) {
    await adapter.verifySpecies(...args);
    if (!inserted) { inserted = true; store.createObject(a.token, { kind: "species", id: "other-id", data: { ...publicSpecies("other-id"), scientificName: "Strix fixture" } }); }
  } };
  const value = controller({ sourceAdapter }), plan = await value.prepare();
  await assert.rejects(value.apply({ planId: plan.planId, confirmed: true }), denied("species_identity_exists"));
  assert.equal(store.listObjects(a.token).length, 1);
  assert.equal(store.listObjects(a.token)[0].id, "other-id");
}));

test("global source and asset drift after planning stop before a working record is created", () => scoped(async ({ controller, source, assetsRoot, store, a }) => {
  const value = controller(), plan = await value.prepare(); source.speciesList[0].english = "Changed after review";
  await assert.rejects(value.apply({ planId: plan.planId, confirmed: true }), denied("import_journal_drift"));
  source.speciesList[0].english = "Fixture owl 1";
  await fs.writeFile(path.join(assetsRoot, "Testkauz1", "map.jpg"), "Changed map");
  await assert.rejects(value.apply({ planId: plan.planId, confirmed: true }), denied("import_journal_drift"));
  assert.equal(store.listObjects(a.token).length, 0);
}));

test("file drift after one creation preserves that receipt and stops before the affected next species", () => scoped(async ({ controller, service, assetsRoot, store, a }) => {
  const create = service.create; service.create = async (input) => { const result = await create(input);
    if (input.id === "first-owl") await fs.writeFile(path.join(assetsRoot, "Testkauz2", "map.jpg"), "Changed during import"); return result; };
  const value = controller(), plan = await value.prepare();
  await assert.rejects(value.apply({ planId: plan.planId, confirmed: true }), denied("working_species_changed"));
  assert.equal(store.listObjects(a.token).length, 1); assert.equal(store.listObjects(a.token)[0].id, "first-owl");
  assert.equal(value.status().plan.counts.created, 1);
}));

test("old or mismatched server capabilities stop the full import before any creation", () => scoped(async ({ controller, service, store, a }) => {
  const capabilities = service.capabilities;
  service.capabilities = async () => ({ schemaVersion: 1, speciesRecordVersion: 0 });
  const value = controller(); await assert.rejects(value.prepare(), denied("species_record_server_required"));
  service.capabilities = async () => ({ ...await capabilities(), adminBoundImport: false });
  await assert.rejects(value.prepare(), denied("species_record_server_required"));
  assert.equal(store.listObjects(a.token).length, 0);
}));

test("admin role loss during source verification cannot fall back to a contributor creation", () => scoped(async ({ controller, adapter, store, a, b }) => {
  const sourceAdapter = { ...adapter, async verifySpecies(...args) {
    await adapter.verifySpecies(...args); store.updateUser(b.token, a.user.id, { role: "contributor", expectedVersion: store.me(a.token).version });
  } };
  const value = controller({ sourceAdapter }), plan = await value.prepare();
  await assert.rejects(value.apply({ planId: plan.planId, confirmed: true }), denied("forbidden"));
  assert.equal(store.listObjects(b.token).length, 0);
}));

test("journal v1 migration preserves public plans; changing source requires naming the unstarted plan", () => scoped(async ({ controller, source, filename, store, a }) => {
  const bytes = Buffer.from(JSON.stringify(source.catalog));
  const old = controller({ sourceAdapter: null, readCatalog: async () => bytes, expectedSha256: sha(bytes), expectedSpeciesCount: 2 });
  const plan = await old.prepare(); await old.close();
  let db = new DatabaseSync(filename); db.exec("DROP TABLE source_bindings; PRAGMA user_version=1;");
  const before = db.prepare("SELECT * FROM plans").all(), beforeItems = db.prepare("SELECT * FROM items").all(); db.close();
  const value = controller();
  db = new DatabaseSync(filename, { readOnly: true }); assert.deepEqual(db.prepare("SELECT * FROM plans").all(), before);
  assert.deepEqual(db.prepare("SELECT * FROM items").all(), beforeItems); assert.equal(db.prepare("PRAGMA user_version").get().user_version, 2); db.close();
  assert.equal(value.status().plan.source.kind, "public-catalog");
  await assert.rejects(value.prepare(), denied("bound_source_changed"));
  assert.equal(value.status().plan.planId, plan.planId); assert.equal(store.listObjects(a.token).length, 0);
  const replacement = await value.prepare({ replaceUnstartedPlanId: plan.planId }); assert.notEqual(replacement.planId, plan.planId);
  db = new DatabaseSync(filename, { readOnly: true }); assert.equal(db.prepare("SELECT state FROM plans WHERE id=?").get(plan.planId).state, "superseded"); db.close();
}));

test("a begun public plan keeps its original source even when an explicit replacement is requested", () => scoped(async ({ controller, source, service }) => {
  const bytes = Buffer.from(JSON.stringify(source.catalog)); service.create = async () => { throw new Error("Synthetic unconfirmed creation"); };
  const old = controller({ sourceAdapter: null, readCatalog: async () => bytes, expectedSha256: sha(bytes), expectedSpeciesCount: 2 });
  const plan = await old.prepare(); await assert.rejects(old.apply({ planId: plan.planId, confirmed: true })); await old.close();
  const value = controller(); await assert.rejects(value.prepare({ replaceUnstartedPlanId: plan.planId }), denied("import_options_changed"));
  assert.equal(value.status().plan.planId, plan.planId); assert.equal(value.status().plan.source.kind, "public-catalog");
}));

test("unknown journal structures are rejected before any migration changes their bytes", () => scoped(async ({ controller, filename }) => {
  const value = controller(); await value.close();
  const db = new DatabaseSync(filename); db.exec("CREATE TABLE unexpected(value TEXT); PRAGMA journal_mode=DELETE;"); db.close();
  const before = await fs.readFile(filename); assert.throws(() => controller(), denied("unsupported_schema"));
  assert.deepEqual(await fs.readFile(filename), before);
}));

test("an old plan cannot be reactivated after a new reader-release decision supersedes it", () => scoped(async ({ controller, store, a, filename }) => {
  const value = controller(), old = await value.prepare({ releaseForReaders: true });
  const current = await value.prepare({ releaseForReaders: false }); assert.notEqual(current.planId, old.planId);
  await assert.rejects(value.apply({ planId: old.planId, confirmed: true, confirmInternalRelease: true }), denied("import_plan_inactive"));
  assert.equal(store.listObjects(a.token).length, 0); assert.equal(value.status().plan.planId, current.planId);
  const db = new DatabaseSync(filename, { readOnly: true }); assert.equal(db.prepare("SELECT state FROM plans WHERE id=?").get(old.planId).state, "superseded"); db.close();
}));

test("a server without a capabilities endpoint is rejected by the real client without an import request", () => scoped(async ({ controller, store, a }) => {
  await assert.rejects(controller().prepare(), denied("species_record_server_required"));
  assert.equal(store.listObjects(a.token).length, 0);
}, { fetchImpl: (url, options) => String(url).endsWith("/capabilities")
  ? Promise.resolve(new Response(JSON.stringify({ error: { code: "not_found" } }), { status: 404 })) : fetch(url, options) }));

test("the server advertises import capabilities only to authenticated callers and enforces admin and actor bindings atomically", () => scoped(async ({ address, store, a, f, adapter }) => {
  const response = await fetch(`${address.url}/api/v1/capabilities`); assert.equal(response.status, 401); await response.json();
  const authenticated = await fetch(`${address.url}/api/v1/capabilities`, { headers: { authorization: `Bearer ${a.token}` } });
  const capabilities = await authenticated.json(); assert.equal(capabilities.adminBoundImport, true); assert.equal(capabilities.user.id, a.user.id);
  const user = await store.createUser(a.token, { username: "fixture-publisher", displayName: "Synthetic publisher", role: "publisher", password: f.password });
  const publisher = await store.login({ username: user.username, password: f.password });
  const record = (await adapter.read()).species[0], binding = { requireAdmin: true, expectedProjectId: capabilities.projectId, expectedUserId: a.user.id };
  assert.throws(() => store.createObject(publisher.token, { kind: "species", id: record.id, data: record, ...binding }), denied("forbidden"));
  assert.throws(() => store.createObject(a.token, { kind: "species", id: record.id, data: record, ...binding, expectedUserId: publisher.user.id }), denied("import_project_changed"));
  const created = store.createObject(a.token, { kind: "species", id: record.id, data: record, ...binding });
  assert.throws(() => store.approveObject(publisher.token, "species", record.id, { expectedRevision: created.revision, ...binding }), denied("forbidden"));
  assert.throws(() => store.approveObject(a.token, "species", record.id, { expectedRevision: created.revision, ...binding, expectedProjectId: "other-project" }), denied("import_project_changed"));
  assert.equal(store.getObject(a.token, "species", record.id).approvedRevision, null);
}));

test("changing project during file verification cannot redirect a queued import write", () => scoped(async ({ controller, adapter, service, store, a }) => {
  const other = fixture(); let remote;
  try {
    const initialized = await other.initialized(); remote = createSharedProjectHttp({ store: initialized.store }); const address = await remote.listen();
    const sourceAdapter = { ...adapter, async verifySpecies(...args) {
      await adapter.verifySpecies(...args); await service.connect({ baseUrl: address.url, username: initialized.a.user.username, password: other.password });
    } };
    const value = controller({ sourceAdapter }), plan = await value.prepare();
    await assert.rejects(value.apply({ planId: plan.planId, confirmed: true }), denied("import_project_changed"));
    assert.equal(store.listObjects(a.token).length, 0); assert.equal(initialized.store.listObjects(initialized.a.token).length, 0);
  } finally { await remote?.close(); other.cleanup(); }
}));

test("changing person during file verification cannot silently adopt that person's import authority", () => scoped(async ({ controller, adapter, service, store, a, b, address, f }) => {
  const sourceAdapter = { ...adapter, async verifySpecies(...args) {
    await adapter.verifySpecies(...args); await service.connect({ baseUrl: address.url, username: b.user.username, password: f.password });
  } };
  const value = controller({ sourceAdapter }), plan = await value.prepare();
  await assert.rejects(value.apply({ planId: plan.planId, confirmed: true }), denied("import_project_changed"));
  assert.equal(store.listObjects(a.token).length, 0);
}));

test("role loss before reader approval leaves the already created working record as an unapproved draft", () => scoped(async ({ controller, adapter, store, a, b }) => {
  let checks = 0; const sourceAdapter = { ...adapter, async verifySpecies(...args) {
    await adapter.verifySpecies(...args);
    if (++checks === 2) store.updateUser(b.token, a.user.id, { role: "publisher", expectedVersion: store.me(a.token).version });
  } };
  const value = controller({ sourceAdapter }), plan = await value.prepare({ releaseForReaders: true });
  await assert.rejects(value.apply({ planId: plan.planId, confirmed: true, confirmInternalRelease: true }), denied("forbidden"));
  assert.equal(store.listObjects(b.token).length, 1); assert.equal(store.getObject(b.token, "species", "first-owl").approvedRevision, null);
}));

test("v1 migration cannot change the schema of a journal held by a live importer", () => scoped(async ({ controller, filename }) => {
  const value = controller(); await value.close();
  let db = new DatabaseSync(filename); db.exec("DROP TABLE source_bindings; PRAGMA user_version=1;");
  db.prepare("INSERT INTO lease VALUES (1,?,?)").run("another-live-importer", process.pid); db.close();
  assert.throws(() => controller(), denied("import_in_use"));
  db = new DatabaseSync(filename, { readOnly: true }); assert.equal(db.prepare("PRAGMA user_version").get().user_version, 1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name='source_bindings'").get().n, 0); db.close();
}));

test("the explicit replan refreshes a changed unstarted target even with unchanged source and reader options", () => scoped(async ({ controller, store, a }) => {
  const value = controller(), old = await value.prepare();
  store.createObject(a.token, { kind: "species", id: "first-owl", data: { ...publicSpecies("first-owl", "New human text"), scientificName: "Strix fixture" } });
  const stale = await value.prepare(); assert.equal(stale.canApply, false); assert.equal(stale.planId, old.planId);
  const current = await value.prepare({ replaceUnstartedPlanId: old.planId });
  assert.notEqual(current.planId, old.planId); assert.equal(current.counts.skippedExisting, 1); assert.equal(current.canApply, true);
  await value.apply({ planId: current.planId, confirmed: true });
  assert.equal(store.getObject(a.token, "species", "first-owl").data.sections[0].text, "New human text");
}));

test("changing an existing skipped item into created cannot release a preexisting exact record without creation evidence", () => scoped(async ({ controller, adapter, store, a, filename }) => {
  const record = (await adapter.read()).species[0]; const before = store.createObject(a.token, { kind: "species", id: record.id, data: record });
  const value = controller(), plan = await value.prepare({ releaseForReaders: true });
  const db = new DatabaseSync(filename); db.prepare("UPDATE items SET state='created' WHERE plan_id=? AND id=?").run(plan.planId, record.id); db.close();
  await assert.rejects(value.apply({ planId: plan.planId, confirmed: true, confirmInternalRelease: true }), denied("import_journal_drift"));
  assert.deepEqual(store.getObject(a.token, "species", record.id), before); assert.equal(store.listObjects(a.token).length, 1);
}));

test("a valid working record at the full 256 KiB bound fits its authenticated request envelope without enlarging object limits", () => scoped(async ({ controller, adapter, source, store, a }) => {
  source.speciesList[0].padding = "";
  const first = (await adapter.read()).species[0];
  source.speciesList[0].padding = "z".repeat(256 * 1024 - Buffer.byteLength(objectJson(first)));
  const expected = (await adapter.read()).species[0]; assert.equal(Buffer.byteLength(objectJson(expected)), 256 * 1024);
  const value = controller(), plan = await value.prepare(); await value.apply({ planId: plan.planId, confirmed: true });
  assert.deepEqual(store.getObject(a.token, "species", expected.id).data, expected);
  assert.throws(() => objectJson({ ...expected, input: { ...expected.input, padding: `${expected.input.padding}x` } }), denied("data_too_large"));
}));

test("the species names shown in a plan cannot be changed independently of its bound target records", () => scoped(async ({ controller, filename, store, a }) => {
  const value = controller(), plan = await value.prepare();
  const db = new DatabaseSync(filename); db.prepare("UPDATE items SET name='Other human-facing species name' WHERE plan_id=? AND id='first-owl'").run(plan.planId); db.close();
  await assert.rejects(value.apply({ planId: plan.planId, confirmed: true }), denied("import_journal_drift"));
  assert.equal(store.listObjects(a.token).length, 0);
}));
