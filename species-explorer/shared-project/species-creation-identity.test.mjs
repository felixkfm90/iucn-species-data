import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./test-fixtures.mjs";
import { createSharedProjectHttp } from "./http.mjs";

export function newWorkingSpecies(id, overrides = {}) {
  return { type: "fn-species-record", schemaVersion: 1, id,
    input: { german: `Testart ${id}`, english: "Fixture species", genus: "Strix", species: id.replaceAll("-", ""), size: "30 cm", weight: "300 g", life_expectancy: "10 Jahre" },
    generated: null, taxonomyOverride: null, assessmentBinding: null,
    assets: { assetName: `Testart ${id}`, files: {}, overrides: {}, credits: null, portraitMetadata: null },
    editorial: { websiteUrl: null, sections: [], gallery: [], generalSectionId: null, embeddedGeneralText: null }, ...overrides };
}
const denied = code => error => error.code === code;
async function scoped(fn) {
  const f = fixture(); let http;
  try { const initialized = await f.initialized(); await fn({ f, ...initialized,
    async address() { http = createSharedProjectHttp({ store: initialized.store }); return (await http.listen()).url; } }); }
  finally { await http?.close(); f.cleanup(); }
}
async function writer(store, admin, password, role) {
  const user = await store.createUser(admin.token, { username: `fixture-${role}`, displayName: role, password, role });
  return { ...await store.login({ username: user.username, password }), user };
}

for (const role of ["admin", "publisher", "contributor"]) {
  test(`normal shared creation rejects duplicate scientific identity for ${role}`, () => scoped(async ({ store, a, f }) => {
    const actor = role === "admin" ? a : await writer(store, a, f.password, role);
    const original = newWorkingSpecies("first-owl"), next = newWorkingSpecies("second-owl");
    next.input.genus = "sTRIX"; next.input.species = "FIRSTOWL";
    store.createObject(a.token, { kind: "species", id: original.id, data: original });
    assert.throws(() => store.createObject(actor.token, { kind: "species", id: next.id, data: next }), denied("species_identity_exists"));
    assert.equal(store.listObjects(a.token).length, 1);
    assert.equal(store.getObject(a.token, "species", original.id).approval, "draft");
  }));
}

test("parallel HTTP creation of one scientific species commits exactly one draft", () => scoped(async ({ store, a, b, address }) => {
  const url = await address(), first = newWorkingSpecies("concurrent-first"), second = newWorkingSpecies("concurrent-second");
  second.input.genus = first.input.genus; second.input.species = first.input.species;
  const create = (token, data) => fetch(`${url}/api/v1/objects`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ kind: "species", id: data.id, data }) });
  const responses = await Promise.all([create(a.token, first), create(b.token, second)]);
  const replies = await Promise.all(responses.map(async response => ({ status: response.status, body: await response.json() })));
  assert.deepEqual(replies.map(reply => reply.status).sort(), [201, 409]);
  assert.equal(replies.find(reply => reply.status === 409).body.error.code, "species_identity_exists");
  const objects = store.listObjects(a.token); assert.equal(objects.length, 1); assert.equal(objects[0].approval, "draft");
}));

for (const [label, mutate, code] of [
  ["German name", (next, prior) => { next.input.german = prior.input.german.toLocaleUpperCase("de"); }, "species_name_exists"],
  ["Windows asset directory", (next, prior) => { next.assets.assetName = prior.assets.assetName.toLocaleUpperCase("de"); }, "species_asset_exists"],
  ["generated URL slug", (next, prior) => { next.generated = { URLSlug: prior.id }; }, "species_slug_exists"],
]) {
  test(`normal structured creation protects colliding ${label} atomically`, () => scoped(async ({ store, a, f }) => {
    const actor = await writer(store, a, f.password, "contributor"), prior = newWorkingSpecies("existing-owl"), next = newWorkingSpecies("different-owl");
    mutate(next, prior); store.createObject(a.token, { kind: "species", id: prior.id, data: prior });
    assert.throws(() => store.createObject(actor.token, { kind: "species", id: next.id, data: next }), denied(code));
    assert.equal(store.listObjects(a.token).length, 1);
  }));
}

test("bound creation rejects changed project, person, role and user version inside the server write", () => scoped(async ({ store, a }) => {
  const me = store.me(a.token), data = newWorkingSpecies("bound-owl");
  const binding = { boundSpeciesCreation: true, expectedProjectId: me.projectId, expectedUserId: me.id, expectedRole: me.role, expectedUserVersion: me.version };
  for (const change of [{ expectedProjectId: "another-project" }, { expectedUserId: "another-user" }, { expectedRole: "contributor" }, { expectedUserVersion: me.version + 1 }]) {
    assert.throws(() => store.createObject(a.token, { kind: "species", id: data.id, data, ...binding, ...change }), denied("species_creation_changed"));
  }
  assert.equal(store.listObjects(a.token).length, 0);
  const saved = store.createObject(a.token, { kind: "species", id: data.id, data, ...binding });
  assert.deepEqual(saved.data, data); assert.equal(saved.approval, "draft");
}));
