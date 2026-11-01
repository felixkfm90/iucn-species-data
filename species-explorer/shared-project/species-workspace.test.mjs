import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createServer } from "node:http";
import { fixture, species as legacySpecies, page } from "./test-fixtures.mjs";
import { createSpeciesWorkspace } from "./species-workspace.mjs";
import { createExplorerSharedProjectService } from "./explorer-service.mjs";
import { createSharedProjectHttp } from "./http.mjs";
import { digest, transportJson } from "./security.mjs";
import { applySpeciesManualEdit } from "./species-record.mjs";
import { createExplorerRequestHandler } from "../request-router.mjs";
import { invokeSharedProjectOperation } from "../project-feature-routes.mjs";

function working(id = "fixture-owl") {
  return { type: "fn-species-record", schemaVersion: 1, id,
    input: { german: "Testkauz", english: "Synthetic owl", genus: "Strix", species: "fixture", size: "20 cm", weight: "400 g", life_expectancy: "10 Jahre", originalPrivate: "Private input sentinel" },
    generated: { URLSlug: id, "Deutscher Name": "Testkauz", "Englischer Name": "Synthetic owl", "Assessment ID": 123, Status: "LC", Kategorie: "Least Concern", Trend: "Stable", Subphylum: "Vertebrata" },
    taxonomyOverride: null, assessmentBinding: 123,
    assets: { assetName: "Gruener Leguan", files: {}, overrides: {}, credits: null, portraitMetadata: { prompt: "Private prompt sentinel" } },
    editorial: { websiteUrl: null, sections: [{ id: "appearance", title: "Aussehen", text: "Redaktioneller Fachtext", intentionallyEmpty: false }], gallery: [], generalSectionId: null, embeddedGeneralText: null } };
}
const editValues = { germanName: "Testkauz", englishName: "Synthetic owl", scientificName: "Strix fixture", size: "21 cm", weight: "400 g", lifeExpectancy: "10 Jahre" };
function cached(data = working()) { return { kind: "species", id: data.id, data, revision: "server-version", ordinal: 1, approval: "draft", approvedRevision: null, localPending: false, localConflict: false }; }
function state() {
  return { status: { baseUrl: "https://project.example.org", projectId: "fixture-project", user: { id: "fixture-user", role: "admin", version: 1 },
    connection: "online", pending: 0, conflicts: 0, readOnlySession: false }, permissions: { canRead: true, canEdit: true, canCreate: true, canApprove: true } };
}
const denied = (code) => (error) => error.code === code;
async function scoped(fn) {
  const f = fixture(), services = []; let remote, local;
  try {
    const initialized = await f.initialized(), { store, a } = initialized;
    store.createObject(a.token, { kind: "species", id: "fixture-owl", data: working() });
    store.createObject(a.token, { kind: "species", id: "legacy-owl", data: legacySpecies("legacy-owl") });
    store.createObject(a.token, { kind: "page", id: "fixture-page", data: page() });
    remote = createSharedProjectHttp({ store }); const address = await remote.listen();
    function service(options = {}) {
      const result = createExplorerSharedProjectService({ filename: path.join(f.root, `workspace-${services.length}.sqlite`), localStorageConfirmed: true, allowLoopbackHttp: true, ...options });
      services.push(result); return result;
    }
    async function localOrigin(value) {
      const handler = createExplorerRequestHandler({ host: "127.0.0.1", sessionToken: "workspace-test-session", publicDir: f.root, repoRoot: f.root,
        operations: { sharedProject: (operation) => invokeSharedProjectOperation(value, operation) } });
      local = createServer(handler); await new Promise((resolve) => local.listen(0, "127.0.0.1", resolve));
      return `http://127.0.0.1:${local.address().port}`;
    }
    await fn({ ...initialized, f, address, service, localOrigin });
  } finally {
    if (local) { local.closeAllConnections(); await new Promise((resolve) => local.close(resolve)); }
    for (const value of services) await value.close();
    await remote?.close(); f.cleanup();
  }
}

test("pure workspace revision is stable across list ordering, incremental beyond one JSON bound, and covers every version and queue flag", async () => {
  const current = state(), first = working(), second = working("fixture-second");
  first.input.originalPrivate = "x".repeat(150000); second.input.originalPrivate = "y".repeat(150000);
  let objects = [cached(first), cached(second)]; let reads = 0;
  const workspace = createSpeciesWorkspace({ withClient: (operation) => operation({ listObjects: async () => { reads++; return objects; } }, current) });
  assert.equal(reads, 0);
  const initial = await workspace.read(), revision = await workspace.revision();
  assert.equal(initial.species.length, 2); assert.equal(revision.revision, initial.revision.revision);
  objects.reverse(); assert.equal((await workspace.revision()).revision, revision.revision);
  objects[0].localPending = true; assert.notEqual((await workspace.revision()).revision, revision.revision);
  objects[0].localPending = false; objects[0].localConflict = true; assert.notEqual((await workspace.revision()).revision, revision.revision);
  objects[0].localConflict = false; objects[0].approvedRevision = "server-version"; assert.notEqual((await workspace.revision()).revision, revision.revision);
  objects = [cached(first), cached(second), { kind: "page", id: "other-page", data: page(), revision: "page-version", ordinal: 1 }];
  const withPage = await workspace.revision(); objects[2].data.text = "Different active page";
  assert.notEqual((await workspace.revision()).revision, withPage.revision);
});

test("workspace scope binds person and project; revision additionally binds role, connection, permissions and access is freshly required", async () => {
  let current = state(); const objects = [cached()]; let reads = 0;
  const workspace = createSpeciesWorkspace({ withClient: (operation) => operation({ listObjects: async () => { reads++; return objects; } }, current) });
  const initial = await workspace.revision();
  current.status.user.role = "reader"; current.permissions.canEdit = false; current.permissions.canCreate = false; current.permissions.canApprove = false;
  const reader = await workspace.revision(); assert.notEqual(reader.revision, initial.revision); assert.equal(reader.sourceScope, initial.sourceScope);
  current.status.connection = "offline"; const offline = await workspace.revision(); assert.notEqual(offline.revision, reader.revision);
  current.status.user.id = "second-user"; const person = await workspace.revision(); assert.notEqual(person.sourceScope, offline.sourceScope);
  current.status.projectId = "second-project"; const project = await workspace.revision(); assert.notEqual(project.sourceScope, person.sourceScope);
  current.status.baseUrl = "https://other.example.org"; assert.notEqual((await workspace.revision()).sourceScope, project.sourceScope);
  current.permissions.canRead = false; const before = reads;
  await assert.rejects(workspace.read(), denied("forbidden")); await assert.rejects(workspace.revision(), denied("forbidden"));
  assert.equal(reads, before, "revoked access never reads an older cached object list");
  current = state(); current.status.pending = null;
  await assert.rejects(workspace.read(), denied("workspace_status_unavailable"));
});

test("real service workspace and local GET routes reuse editor stamps without a remote fetch or private source leak", () => scoped(async ({ service, localOrigin, address, a, f }) => {
  let calls = 0;
  const value = service({ fetchImpl: (...args) => { calls++; return fetch(...args); } });
  assert.equal(calls, 0); await assert.rejects(value.speciesWorkspace.read(), denied("forbidden")); assert.equal(calls, 0);
  await value.connect({ baseUrl: address.url, username: a.user.username, password: f.password });
  const before = calls, snapshot = await value.speciesWorkspace.read(), editor = await value.speciesEditor.get("fixture-owl");
  assert.equal(snapshot.species.length, 1); assert.equal(snapshot.workspace.legacyCount, 1);
  assert.deepEqual(snapshot.workspace.legacySpecies, [{ id: "legacy-owl", commonName: "Testkauz" }]);
  assert.match(snapshot.workspace.message, /bleiben erhalten/); assert.equal(snapshot.summary.source, "shared-project");
  assert.equal(snapshot.summary.reportGeneratedAt, null); assert.equal(snapshot.validation.availableMediaCount, 0); assert.equal(snapshot.validation.missingMediaCount, 5);
  assert.equal(snapshot.species[0].safeName, "Gruener Leguan"); assert.equal(snapshot.species[0].taxonomy.subphylum, "Vertebrata");
  assert.equal(snapshot.species[0].editRevision, editor.editRevision); assert.equal(snapshot.species[0].sourceScope, editor.sourceScope);
  assert.equal(snapshot.species[0].editRevision, digest(transportJson({ kind: "species", id: "fixture-owl", revision: editor.revision, data: working() })));
  assert.equal((await value.speciesWorkspace.revision()).revision, snapshot.revision.revision);
  assert.equal(calls, before);
  for (const secret of ["Private input sentinel", "Private prompt sentinel", f.password]) assert.ok(!JSON.stringify(snapshot).includes(secret));
  assert.equal(snapshot.species[0].editorial.sections[0].text, "Redaktioneller Fachtext");
  const origin = await localOrigin(value), headers = { origin, "x-species-explorer-session": "workspace-test-session" };
  const response = await fetch(`${origin}/api/shared-project/species/workspace`, { headers });
  assert.equal(response.status, 200); const actual = await response.json(); assert.equal(actual.workspace.source, "shared-project");
  const revisionResponse = await fetch(`${origin}/api/shared-project/species/workspace/revision`, { headers });
  assert.equal(revisionResponse.status, 200); assert.equal((await revisionResponse.json()).revision, actual.revision.revision);
  assert.equal(calls, before, "local GET reads do not pull or import remote contents");
}));

test("normal editor queue changes workspace revision and offline cached reading remains local; logout and close stop access", () => scoped(async ({ service, address, a, f }) => {
  let calls = 0, offline = false;
  const value = service({ fetchImpl: (...args) => { calls++; if (offline) throw new Error("Synthetic offline"); return fetch(...args); } });
  await value.connect({ baseUrl: address.url, username: a.user.username, password: f.password });
  const initial = await value.speciesWorkspace.read(), item = initial.species[0], before = calls;
  const preview = await value.speciesEditor.preview(item.id, { sourceScope: item.sourceScope, expectedEditRevision: item.editRevision, values: editValues });
  await value.speciesEditor.save(item.id, { token: preview.token });
  const queued = await value.speciesWorkspace.read();
  assert.equal(queued.species[0].manual.size, "21 cm"); assert.equal(queued.species[0].localPending, true);
  assert.equal(queued.pendingChanges.hasPendingChanges, true); assert.equal(queued.workspace.pending, 1);
  assert.notEqual(queued.revision.revision, initial.revision.revision); assert.equal(calls, before);
  offline = true; await assert.rejects(value.refresh(), denied("offline"));
  const afterFailure = calls, cached = await value.speciesWorkspace.read();
  assert.equal(cached.workspace.connection, "offline"); assert.equal(cached.species[0].manual.size, "21 cm");
  assert.notEqual(cached.revision.revision, queued.revision.revision); assert.equal(calls, afterFailure);
  assert.equal((await value.speciesWorkspace.revision()).revision, cached.revision.revision);
  await value.disconnect(); const afterLogout = calls;
  await assert.rejects(value.speciesWorkspace.read(), denied("forbidden")); assert.equal(calls, afterLogout);
  await value.close(); await assert.rejects(value.speciesWorkspace.revision(), denied("client_closed"));
}));

test("reader workspace keeps the actual approved client read contract and never exposes the newer draft", () => scoped(async ({ service, store, address, a, f }) => {
  const original = store.getObject(a.token, "species", "fixture-owl");
  store.approveObject(a.token, "species", original.id, { expectedRevision: original.revision });
  store.submitChange(a.token, { changeId: "newer-unapproved-workspace", kind: "species", id: original.id, baseRevision: original.revision,
    data: applySpeciesManualEdit(original.data, editValues) });
  await store.createUser(a.token, { username: "workspace-reader", displayName: "Reader", role: "reader", password: f.password });
  const value = service(); await value.connect({ baseUrl: address.url, username: "workspace-reader", password: f.password });
  const snapshot = await value.speciesWorkspace.read();
  assert.equal(snapshot.species.length, 1); assert.equal(snapshot.species[0].manual.size, "20 cm"); assert.equal(snapshot.species[0].localPending, false);
  assert.equal(snapshot.species[0].sourcePermissions.canEditManual, false); assert.equal(snapshot.workspace.permissions.canRead, true); assert.equal(snapshot.workspace.permissions.canEdit, false);
  assert.equal(snapshot.workspace.legacyCount, 0, "unapproved legacy objects stay outside the reader cache");
}));

test("actual account blocking becomes a denied workspace read after the existing explicit identity refresh", () => scoped(async ({ service, store, address, a, b, f }) => {
  let calls = 0;
  const value = service({ fetchImpl: (...args) => { calls++; return fetch(...args); } });
  await value.connect({ baseUrl: address.url, username: a.user.username, password: f.password });
  assert.equal((await value.speciesWorkspace.read()).workspace.permissions.canRead, true);
  store.updateUser(b.token, a.user.id, { expectedVersion: a.user.version, blocked: true });
  await assert.rejects(value.refresh(), denied("authentication_required"));
  const before = calls;
  await assert.rejects(value.speciesWorkspace.read(), denied("forbidden"));
  await assert.rejects(value.speciesWorkspace.revision(), denied("forbidden"));
  assert.equal(calls, before, "a rejected local read never tries a second implicit sign-in");
}));
