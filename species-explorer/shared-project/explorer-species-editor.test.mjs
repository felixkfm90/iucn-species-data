import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fixture, species } from "./test-fixtures.mjs";
import { createSharedProjectHttp } from "./http.mjs";
import { createExplorerSharedProjectService } from "./explorer-service.mjs";
import { createExplorerSpeciesEditor } from "./explorer-species-editor.mjs";

function record() {
  return { type: "fn-species-record", schemaVersion: 1, id: "fixture-owl",
    input: { german: "Testkauz", english: "Synthetic owl", genus: "Strix", species: "fixture", size: "20 cm", weight: "400 g", life_expectancy: "10 Jahre", ownField: { keep: true } },
    generated: { URLSlug: "fixture-owl", "Deutscher Name": "Testkauz", "Assessment ID": 123, Subphylum: "Vertebrata" },
    taxonomyOverride: { reason: "Preserve original override" }, assessmentBinding: 123,
    assets: { assetName: "Testkauz", files: {}, overrides: { map: { protectedFromPipeline: true } }, credits: null, portraitMetadata: { prompt: "Private synthetic prompt" } },
    editorial: { websiteUrl: null, sections: [{ id: "appearance", title: "Aussehen", text: "Synthetic article", intentionallyEmpty: false }], gallery: [], generalSectionId: null, embeddedGeneralText: null } };
}
const values = { germanName: "Testkauz", englishName: "Synthetic owl", scientificName: "Strix fixture", size: "21 cm", weight: "400 g", lifeExpectancy: "10 Jahre" };
async function scoped(fn) {
  const f = fixture(), clients = []; let http;
  try {
    const initialized = await f.initialized(), { store, a } = initialized;
    store.createObject(a.token, { kind: "species", id: "fixture-owl", data: record() });
    store.createObject(a.token, { kind: "species", id: "legacy-owl", data: species("legacy-owl") });
    http = createSharedProjectHttp({ store }); const address = await http.listen();
    async function open(username = a.user.username, options = {}) {
      const service = createExplorerSharedProjectService({ filename: path.join(f.root, `normal-editor-${clients.length}.sqlite`),
        localStorageConfirmed: true, allowLoopbackHttp: true, ...options }); clients.push(service);
      await service.connect({ baseUrl: address.url, username, password: f.password }); return service;
    }
    await fn({ ...initialized, f, address, open });
  } finally { for (const client of clients) await client.close(); if (http) await http.close(); f.cleanup(); }
}

test("normal basic-data projection uses the existing cache without exposing private records or converting legacy objects", () => scoped(async ({ open }) => {
  let calls = 0;
  const service = await open(undefined, { fetchImpl: (...args) => { calls++; return fetch(...args); } });
  const before = calls, list = await service.speciesEditor.list(), current = await service.speciesEditor.get("fixture-owl");
  assert.equal(calls, before); assert.equal(list.species.length, 1); assert.equal(list.legacySpecies.length, 1);
  assert.equal(current.manual.size, "20 cm"); assert.equal(current.source, "shared-project");
  assert.ok(!JSON.stringify(list).includes("Private synthetic prompt")); assert.ok(!JSON.stringify(list).includes("ownField"));
  await assert.rejects(service.speciesEditor.get("legacy-owl"), { code: "species_record_required" });
}));

test("normal preview/save queues only the reviewed manual fields, with no network, approval or source materialization", () => scoped(async ({ store, a, open }) => {
  let calls = 0;
  const service = await open(undefined, { fetchImpl: (...args) => { calls++; return fetch(...args); } });
  const shown = await service.speciesEditor.get("fixture-owl"), before = calls;
  const preview = await service.speciesEditor.preview(shown.id, { sourceScope: shown.sourceScope, expectedEditRevision: shown.editRevision, values });
  assert.deepEqual(preview.changes, [{ key: "size", field: "Größe", before: "20 cm", after: "21 cm" }]);
  assert.equal((await service.snapshot()).queuedChanges, 0);
  const result = await service.speciesEditor.save(shown.id, { token: preview.token });
  assert.equal(result.queued, true); assert.equal(result.species.localPending, true); assert.equal(result.externalPublication, "not-performed");
  assert.equal(calls, before); assert.equal((await service.snapshot()).queuedChanges, 1);
  assert.equal(store.getObject(a.token, "species", shown.id).data.input.size, "20 cm");
  const cached = await service.get("species", shown.id), expected = record(); expected.input.size = "21 cm";
  assert.deepEqual(cached.data, expected);
  await service.sync();
  assert.deepEqual(store.getObject(a.token, "species", shown.id).data, expected);
  assert.equal(store.getObject(a.token, "species", shown.id).approval, "draft");
  await assert.rejects(service.speciesEditor.save(shown.id, { token: preview.token }), { code: "review_required" });
}));

test("a second normal editor and a later project/person switch cannot consume a stale preview", () => scoped(async ({ a, b, f, address, open }) => {
  const service = await open(), shown = await service.speciesEditor.get("fixture-owl");
  const input = { sourceScope: shown.sourceScope, expectedEditRevision: shown.editRevision, values };
  const first = await service.speciesEditor.preview(shown.id, input), second = await service.speciesEditor.preview(shown.id, { ...input, values: { ...values, size: "22 cm" } });
  await service.speciesEditor.save(shown.id, { token: second.token });
  await assert.rejects(service.speciesEditor.save(shown.id, { token: first.token }), { code: "local_object_changed" });
  const latest = await service.speciesEditor.get(shown.id);
  const personal = await service.speciesEditor.preview(shown.id, { sourceScope: latest.sourceScope, expectedEditRevision: latest.editRevision, values });
  await service.connect({ baseUrl: address.url, username: b.user.username, password: f.password });
  await assert.rejects(service.speciesEditor.save(shown.id, { token: personal.token }), { code: "project_changed" });
  const other = await service.speciesEditor.get(shown.id);
  await assert.rejects(service.speciesEditor.preview(shown.id, { ...input, expectedEditRevision: other.editRevision }), { code: "local_object_changed" });
  await service.connect({ baseUrl: address.url, username: a.user.username, password: f.password });
  assert.equal((await service.speciesEditor.get(shown.id)).manual.size, "22 cm");
}));

test("normal editing preserves an actual second-client conflict and supports cached offline changes", () => scoped(async ({ open }) => {
  let offline = false;
  const one = await open(undefined, { fetchImpl: (...args) => offline ? Promise.reject(new Error("Synthetic offline")) : fetch(...args) }), two = await open();
  const a = await one.speciesEditor.get("fixture-owl"), b = await two.speciesEditor.get("fixture-owl");
  const previewA = await one.speciesEditor.preview(a.id, { sourceScope: a.sourceScope, expectedEditRevision: a.editRevision, values });
  const previewB = await two.speciesEditor.preview(b.id, { sourceScope: b.sourceScope, expectedEditRevision: b.editRevision, values: { ...values, size: "22 cm" } });
  await two.speciesEditor.save(b.id, { token: previewB.token }); await two.sync();
  offline = true; await assert.rejects(one.refresh(), { code: "offline" });
  assert.equal((await one.snapshot()).status.connection, "offline");
  await one.speciesEditor.save(a.id, { token: previewA.token });
  offline = false; await one.sync();
  const conflicts = await one.conflicts(); assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].current.input.size, "22 cm"); assert.equal(conflicts[0].proposed.input.size, "21 cm");
}));

test("an open basic-data preview expires when a known server revision becomes an unresolved conflict", () => scoped(async ({ a, b, open }) => {
  const first = await open(a.user.username), second = await open(b.user.username);
  const preview = (service, shown, size) => service.speciesEditor.preview(shown.id, {
    sourceScope: shown.sourceScope, expectedEditRevision: shown.editRevision, values: { ...values, size },
  });
  const id = "fixture-owl";
  await first.speciesEditor.save(id, { token: (await preview(first, await first.speciesEditor.get(id), "21 cm")).token });
  await second.speciesEditor.save(id, { token: (await preview(second, await second.speciesEditor.get(id), "22 cm")).token });
  await second.sync();
  await first.refresh();
  const before = await first.speciesEditor.get(id);
  assert.equal(before.localConflict, false);
  assert.equal(before.manual.size, "21 cm");
  const olderPreview = await preview(first, before, "23 cm");
  await first.sync();
  const after = await first.speciesEditor.get(id);
  assert.equal(after.revision, before.revision);
  assert.equal(after.manual.size, before.manual.size);
  assert.equal(after.localConflict, true);
  await assert.rejects(first.speciesEditor.save(id, { token: olderPreview.token }), { code: "local_object_changed" });
  assert.equal((await first.snapshot()).queuedChanges, 1);
  assert.equal((await first.conflicts())[0].proposed.input.size, "21 cm");
  const fresh = await preview(first, after, "23 cm");
  const saved = await first.speciesEditor.save(id, { token: fresh.token });
  assert.equal(saved.species.manual.size, "23 cm");
  assert.equal(saved.species.localConflict, true);
  assert.equal((await first.snapshot()).queuedChanges, 2);
  assert.equal((await first.conflicts())[0].proposed.input.size, "21 cm");
}));

test("distinct arts can be edited in separate personal profiles while one is offline", () => scoped(async ({ a, b, store, open }) => {
  const recordB = record();
  recordB.id = "fixture-eagle-owl";
  Object.assign(recordB.input, { german: "Testuhu", english: "Synthetic eagle-owl", genus: "Bubo" });
  Object.assign(recordB.generated, { URLSlug: recordB.id, "Deutscher Name": recordB.input.german });
  recordB.assets.assetName = recordB.input.german;
  store.createObject(b.token, { kind: "species", id: recordB.id, data: recordB });
  let offline = false;
  const first = await open(a.user.username, { fetchImpl: (...args) => offline ? Promise.reject(new Error("Synthetic offline")) : fetch(...args) });
  const second = await open(b.user.username), shownA = await first.speciesEditor.get("fixture-owl"), shownB = await second.speciesEditor.get(recordB.id);
  offline = true; await assert.rejects(first.refresh(), { code: "offline" });
  async function save(client, shown, input) {
    const plan = await client.speciesEditor.preview(shown.id, { sourceScope: shown.sourceScope, expectedEditRevision: shown.editRevision, values: input });
    return client.speciesEditor.save(shown.id, { token: plan.token });
  }
  await Promise.all([save(first, shownA, { ...values, size: "23 cm" }), save(second, shownB, { ...values, germanName: "Testuhu",
    englishName: "Synthetic eagle-owl", scientificName: "Bubo fixture", size: "50 cm" })]);
  await second.sync();
  assert.equal(store.getObject(b.token, "species", recordB.id).data.input.size, "50 cm");
  assert.equal(store.getObject(b.token, "species", shownA.id).data.input.size, "20 cm");
  offline = false; await first.sync();
  assert.equal(store.getObject(a.token, "species", shownA.id).data.input.size, "23 cm");
  assert.equal(store.getObject(a.token, "species", recordB.id).data.input.size, "50 cm");
  assert.deepEqual(await first.conflicts(), []); assert.deepEqual(await second.conflicts(), []);
}));

test("observed role loss and unsupported coupled renames block normal saves without losing existing content", () => scoped(async ({ store, a, b, open }) => {
  const service = await open(), shown = await service.speciesEditor.get("fixture-owl"), base = { sourceScope: shown.sourceScope, expectedEditRevision: shown.editRevision };
  for (const changed of [{ germanName: "Anderer Testkauz" }, { scientificName: "Strix changed" }]) {
    await assert.rejects(service.speciesEditor.preview(shown.id, { ...base, values: { ...values, ...changed } }), { code: "species_identity_adapter_required" });
  }
  const preview = await service.speciesEditor.preview(shown.id, { ...base, values });
  await store.updateUser(b.token, a.user.id, { expectedVersion: a.user.version, role: "reader" });
  await service.refresh();
  await assert.rejects(service.speciesEditor.save(shown.id, { token: preview.token }), { code: "forbidden" });
  assert.equal(store.getObject(b.token, "species", shown.id).data.input.size, "20 cm");
}));

test("expired and closed preview capabilities cannot schedule later writes", async () => {
  let now = 0, writes = 0; const object = { kind: "species", id: "fixture-owl", revision: "version", data: record() };
  const client = { getObject: async () => object, editExistingObject: async () => { writes++; return object; } };
  const state = { status: { baseUrl: "https://fixture.example.org", projectId: "fixture", user: { id: "person" } }, permissions: { canRead: true, canEdit: true } };
  const editor = createExplorerSpeciesEditor({ withClient: (fn) => fn(client, state), clock: () => now, ttlMs: 10 });
  const shown = await editor.get(object.id), preview = await editor.preview(object.id, { sourceScope: shown.sourceScope, expectedEditRevision: shown.editRevision, values });
  now = 10; await assert.rejects(editor.save(object.id, { token: preview.token }), { code: "review_required" });
  editor.close(); await assert.rejects(editor.get(object.id), { code: "client_closed" }); assert.equal(writes, 0);
});
