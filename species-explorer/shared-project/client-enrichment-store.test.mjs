import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { createManagedTempSession } from "../temp-session.mjs";
import { createTestWebp } from "../server-test-fixtures.mjs";
import { createSharedProjectClientStore } from "./client-store.mjs";
import { createClientEnrichmentStore } from "./client-enrichment-store.mjs";
import { createMemoryCredentialStore, createSharedProjectClient } from "./client.mjs";
import { createDeviceBackupProvider, validateDeviceBackupCopy } from "./device-backup.mjs";
import { createSharedProjectHttp } from "./http.mjs";
import { normalMediaBinding } from "./normal-media.mjs";
import { digest, objectJson } from "./security.mjs";
import { projectSpeciesEnrichment } from "./species-enrichment.mjs";
import { fixture as serverFixture } from "./test-fixtures.mjs";

const deviceId = "device-ec2d31f7-0485-4a04-96c4-b40e233b126a";
const person = { baseUrl: "https://fixture.invalid", projectId: "project-a",
  user: { id: "user-a", username: "owner", displayName: "Owner", role: "admin", version: 1 } };
const expectedActor = { baseUrl: person.baseUrl, projectId: person.projectId, userId: person.user.id, role: person.user.role, userVersion: 1 };
const backupFiles = [
  { id: "device", relativePath: "device.json", kind: "device-profile", required: true },
  { id: "cache", relativePath: "project-cache.sqlite", kind: "client-cache", required: true },
];
const source = () => ({ kind: "species", id: "turdusmerula", revision: "11111111-1111-4111-8111-111111111111",
  ordinal: 1, parentRevision: null, authorId: "user-a", createdAt: "2026-11-03T00:00:00Z",
  approval: "draft", approvedRevision: null, data: { type: "fn-species-record", schemaVersion: 1, id: "turdusmerula",
    input: { german: "Amsel", english: "Blackbird", genus: "Turdus", species: "merula" }, generated: null, taxonomyOverride: null,
    assessmentBinding: null, assets: { assetName: "Amsel", files: {}, overrides: {}, credits: null, portraitMetadata: null },
    editorial: { websiteUrl: null, sections: [], gallery: [], generalSectionId: null, embeddedGeneralText: null } } });

function prepared(object, seed = 1, projectId = person.projectId) {
  const buffer = createTestWebp(seed), metadata = { sha256: digest(buffer), bytes: buffer.length, mimeType: "image/webp" };
  const sourceResult = { generated: null, assessmentBinding: null, credits: null, files: { "portrait.webp": metadata } };
  const projection = projectSpeciesEnrichment({ speciesObject: object, projectId, result: sourceResult });
  assert.equal(projection.complete, true);
  return { ...projection, mode: "missing", sourceResult, media: [{ slot: "portrait.webp", metadata, buffer }], proposedOnly: true, persistentCandidate: false };
}

async function fixture(t, { beforeCleanup } = {}) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "enrichment-cache-")), profileRoot = path.join(root, "profile");
  const filename = path.join(profileRoot, "project-cache.sqlite");
  const session = await createManagedTempSession({ repoRoot: path.join(root, "repo") });
  const open = () => createSharedProjectClientStore({ filename, localStorageConfirmed: true });
  const object = source(), store = open(), bound = store.bind(person);
  store.saveObjects(bound.id, [object]);
  await fs.writeFile(path.join(profileRoot, "device.json"), JSON.stringify({ schemaVersion: 1, id: deviceId, name: "Fixture-PC" }));
  t.after(async () => {
    try { await beforeCleanup?.(); }
    finally { store.close(); await session.close(); await fs.rm(assertTestTempPath(root), { recursive: true, force: true }); }
  });
  const backup = createDeviceBackupProvider({ profileRoot, deviceId, resolveProjectIds: async () => [person.projectId], tempSession: session, files: backupFiles });
  return { root, filename, open, store, bound, object, backup };
}

test("the personal proposal and exact bytes survive reopen without an edit, queue or approval", async t => {
  const f = await fixture(t), candidate = prepared(f.object);
  candidate.run = { fetched: true, usedExistingData: true };
  const db = new DatabaseSync(f.filename);
  try {
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 4);
    const changed = prepared(f.object); changed.media[0].buffer[0] ^= 1;
    assert.throws(() => f.store.speciesEnrichment.save(f.bound.id, changed, expectedActor), { code: "species_enrichment_candidate_changed" });
    assert.throws(() => f.store.speciesEnrichment.save(f.bound.id, candidate, expectedActor, 0), { code: "species_enrichment_quota" });
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 4);
    const result = f.store.speciesEnrichment.save(f.bound.id, candidate, expectedActor);
    assert.equal(result.persistentCandidate, true);
    assert.equal(f.store.speciesEnrichment.save(f.bound.id, candidate, expectedActor).candidateId, result.candidateId);
    assert.equal(f.store.speciesEnrichment.save(f.bound.id, candidate, expectedActor, 0).candidateId, result.candidateId);
    assert.throws(() => f.store.speciesEnrichment.save(f.bound.id, prepared(f.object, 2), expectedActor, 0), { code: "species_enrichment_quota" });
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 5);
    assert.equal(db.prepare("SELECT count(*) AS n FROM enrichment_files").get().n, 1);
    assert.equal(db.prepare("SELECT count(*) AS n FROM queue").get().n, 0);
    assert.deepEqual(f.store.get(f.bound.id, "species", f.object.id).data, f.object.data);
    const reopened = f.open();
    try {
      const read = reopened.speciesEnrichment.read(f.bound.id, result.candidateId);
      assert.deepEqual(read.data, candidate.data);
      assert.equal(read.issues.at(-1).code, "species_enrichment_data_retained");
      assert.deepEqual(read.media[0].buffer, candidate.media[0].buffer);
      read.media[0].buffer[0] ^= 1;
      assert.deepEqual(reopened.speciesEnrichment.read(f.bound.id, result.candidateId).media[0].buffer, candidate.media[0].buffer);
    } finally { reopened.close(); }
  } finally { db.close(); }
});

test("the proposal is separated by service, person, role version and complete source revision", async t => {
  const f = await fixture(t), candidate = prepared(f.object);
  const saved = f.store.speciesEnrichment.save(f.bound.id, candidate, expectedActor);
  const other = f.store.bind({ ...person, baseUrl: "https://another.invalid" });
  f.store.saveObjects(other.id, [f.object]);
  assert.throws(() => f.store.speciesEnrichment.read(f.bound.id, saved.candidateId), { code: "forbidden" });
  assert.throws(() => f.store.speciesEnrichment.read(other.id, saved.candidateId), { code: "species_enrichment_candidate_missing" });
  assert.throws(() => f.store.speciesEnrichment.save(other.id, candidate, expectedActor), { code: "species_enrichment_candidate_changed" });
  f.store.bind({ ...person, user: { ...person.user, version: 2 } });
  assert.throws(() => f.store.speciesEnrichment.read(f.bound.id, saved.candidateId), { code: "species_enrichment_candidate_changed" });
  f.store.bind(person);
  f.store.saveObjects(f.bound.id, [{ ...f.object, revision: "22222222-2222-4222-8222-222222222222" }]);
  assert.throws(() => f.store.speciesEnrichment.read(f.bound.id, saved.candidateId), { code: "species_enrichment_changed" });
});

test("the personal backup includes inactive proposals and rejects altered candidate bytes", async t => {
  const f = await fixture(t), candidate = prepared(f.object);
  const saved = f.store.speciesEnrichment.save(f.bound.id, candidate, expectedActor);
  f.store.bind({ ...person, user: { ...person.user, id: "other-user" } });
  const snapshot = await f.backup.prepare();
  try {
    const handoff = JSON.parse(await fs.readFile(snapshot.manifestPath, "utf8")), directory = path.join(f.root, "restore");
    await fs.mkdir(directory);
    for (const file of handoff.files) await fs.copyFile(file.sourcePath, path.join(directory, path.basename(file.path)));
    const manifest = JSON.parse(await fs.readFile(path.join(directory, "device-backup-manifest.json"), "utf8"));
    const cache = manifest.files.find(file => file.id === "cache");
    assert.equal(cache.media.enrichmentCandidateCount, 1);
    assert.equal(cache.media.enrichmentFileCount, 1);
    assert.equal(cache.media.localEnrichmentBytes, candidate.media[0].buffer.length);
    assert.match(cache.media.enrichmentCandidatesSha256, /^[a-f0-9]{64}$/);
    assert.equal((await validateDeviceBackupCopy({ directory, expectedDeviceId: deviceId, expectedProjectIds: [person.projectId], files: backupFiles })).ok, true);
    const restored = createSharedProjectClientStore({ filename: path.join(directory, "project-cache.sqlite"), localStorageConfirmed: true });
    try {
      restored.bind(person);
      assert.deepEqual(restored.speciesEnrichment.read(f.bound.id, saved.candidateId).media[0].buffer, candidate.media[0].buffer);
    } finally { restored.close(); }
  } finally { await snapshot.dispose(); }
  const db = new DatabaseSync(f.filename);
  try { db.prepare("UPDATE enrichment_files SET data=zeroblob(bytes)").run(); } finally { db.close(); }
  await assert.rejects(f.backup.prepare(), /nicht mehr eindeutig gebunden/);
});

test("the shared media quota preserves the previous proposal and inserts neither rows nor bytes on failure", async t => {
  const f = await fixture(t), candidate = prepared(f.object), saved = f.store.speciesEnrichment.save(f.bound.id, candidate, expectedActor);
  const db = new DatabaseSync(f.filename);
  try {
    const store = createClientEnrichmentStore({ db, currentOwner: () => f.store.active(),
      currentSource: (...args) => f.store.get(args[0], "species", args[1], { serverOnly: true }),
      ensureSchema() {}, limits: { blobBytes: candidate.media[0].buffer.length },
      tx(operation) {
        db.exec("BEGIN IMMEDIATE");
        try { const value = operation(); db.exec("COMMIT"); return value; }
        catch (error) { db.exec("ROLLBACK"); throw error; }
      } });
    assert.throws(() => store.save(f.bound.id, prepared(f.object, 2), expectedActor), { code: "species_enrichment_quota" });
    assert.equal(db.prepare("SELECT count(*) AS n FROM enrichment_candidates").get().n, 1);
    assert.equal(db.prepare("SELECT count(*) AS n FROM enrichment_files").get().n, 1);
    assert.deepEqual(store.read(f.bound.id, saved.candidateId).media[0].buffer, candidate.media[0].buffer);
  } finally { db.close(); }
});

test("backup and restore keep the sealed queue request joined to its original candidate and bytes", async t => {
  const f = await fixture(t), candidate = prepared(f.object);
  const saved = f.store.speciesEnrichment.save(f.bound.id, candidate, expectedActor);
  const queued = f.store.speciesEnrichment.stage(f.bound.id, saved.candidateId, saved.targetDataHash);
  const snapshot = await f.backup.prepare();
  try {
    const directory = path.join(f.root, "restore-queue"), handoff = JSON.parse(await fs.readFile(snapshot.manifestPath, "utf8"));
    await fs.mkdir(directory);
    for (const file of handoff.files) await fs.copyFile(file.sourcePath, path.join(directory, path.basename(file.path)));
    const restored = createSharedProjectClientStore({ filename: path.join(directory, "project-cache.sqlite"), localStorageConfirmed: true });
    try {
      const request = restored.prepare(queued.changeId);
      assert.equal(request.candidateId, saved.candidateId);
      assert.equal(request.change.enrichment.targetDataHash, saved.targetDataHash);
      assert.deepEqual(request.media[0].buffer, candidate.media[0].buffer);
    } finally { restored.close(); }
  } finally { await snapshot.dispose(); }
  const db = new DatabaseSync(f.filename);
  try { db.prepare("UPDATE queue SET request_json=json_set(request_json,'$.candidateId',?) WHERE change_id=?").run("f".repeat(64), queued.changeId); }
  finally { db.close(); }
  await assert.rejects(f.backup.prepare(), /nicht mehr eindeutig gebunden/);
});

test("the client stages only a fresh online object and reopens its proposal offline without sending an update", async t => {
  const f = await fixture(t), calls = [], credentialStore = createMemoryCredentialStore();
  let remote = f.object, offline = false;
  const options = { filename: f.filename, localStorageConfirmed: true, credentialStore,
    async fetchImpl(url, { method }) {
      const address = new URL(url), { pathname } = address;
      calls.push([method, pathname]);
      if (offline) assert.fail("an offline candidate must use only the personal cache");
      if (pathname === "/api/v1/auth/login") return Response.json({ projectId: person.projectId, user: person.user,
        token: "test-session", scope: "full", expiresAt: "2027-01-01T00:00:00Z" });
      if (pathname === "/api/v1/auth/me") return Response.json({ projectId: person.projectId, ...person.user });
      if (pathname === "/api/v1/objects/page") {
        const checked = address.searchParams.get("check") === "1";
        return Response.json({ schemaVersion: 1, projectId: person.projectId, user: person.user, checked,
          snapshot: "a".repeat(64), totalCount: 1, objects: checked ? [] : [remote], complete: true, nextCursor: null });
      }
      if (pathname === "/api/v1/objects/species/turdusmerula") return Response.json(remote);
      assert.fail(`unexpected request: ${method} ${pathname}`);
    },
  };
  const client = createSharedProjectClient(options), proposal = prepared(f.object);
  let saved;
  try {
    await client.connect({ baseUrl: person.baseUrl, username: person.user.username, password: "fixture-only" });
    saved = await client.savePreparedSpeciesEnrichment(proposal, expectedActor);
    remote = { ...remote, revision: "22222222-2222-4222-8222-222222222222" };
    await assert.rejects(client.savePreparedSpeciesEnrichment(proposal, expectedActor), { code: "species_enrichment_changed" });
  } finally { await client.close(); }
  offline = true;
  const reopened = createSharedProjectClient(options);
  try {
    assert.deepEqual((await reopened.readPreparedSpeciesEnrichment(saved.candidateId)).media[0].buffer, proposal.media[0].buffer);
    assert.deepEqual(calls.filter(([method]) => method !== "GET"), [["POST", "/api/v1/auth/login"]]);
  } finally { await reopened.close(); }
});

async function live(t, fetchImpl = fetch) {
  const clients = [], remote = serverFixture();
  let host;
  const f = await fixture(t, { async beforeCleanup() {
    await Promise.all(clients.map(client => client.close()));
    try { await host?.close(); } finally { remote.cleanup(); }
  } });
  const { store, a, b } = await remote.initialized();
  host = createSharedProjectHttp({ store });
  const address = await host.listen();
  const original = source(), object = store.createObject(a.token, { kind: "species", id: original.id, data: original.data });
  store.createObject(a.token, { kind: "page", id: "fixture-page", data: { title: "Weitere Seite" } });
  store.approveObject(a.token, "species", object.id, { expectedRevision: object.revision });
  const credentialStore = createMemoryCredentialStore();
  const options = { filename: f.filename, localStorageConfirmed: true, credentialStore, allowLoopbackHttp: true, fetchImpl };
  const actor = { baseUrl: address.url, projectId: a.projectId, userId: a.user.id, role: a.user.role, userVersion: a.user.version };
  function reopen() { const client = createSharedProjectClient(options); clients.push(client); return client; }
  const client = reopen();
  await client.connect({ baseUrl: address.url, username: a.user.username, password: remote.password });
  return { f, store, a, b, object, actor, client, reopen };
}

test("a lost draft receipt and lost upload reply resume after restart without another draft or file upload", async t => {
  const dispatched = [];
  let dropChange = true, dropUpload = true, supportsEnrichment = false;
  const l = await live(t, async (url, options) => {
    const pathname = new URL(url).pathname, result = await fetch(url, options);
    if (!supportsEnrichment && pathname === "/api/v1/capabilities" && result.ok) {
      const value = await result.json(); delete value.speciesEnrichment; return Response.json(value);
    }
    if (pathname === "/api/v1/changes" && options.method === "POST") {
      dispatched.push(["change", options.body]);
      if (dropChange && result.ok) { dropChange = false; await result.text(); throw new Error("fixture lost draft reply"); }
    }
    if (pathname.endsWith("/content") && options.method === "PUT") {
      dispatched.push(["upload", pathname]);
      if (dropUpload && result.ok) { dropUpload = false; await result.text(); throw new Error("fixture lost upload reply"); }
    }
    return result;
  });
  const { object, client, store, a, b, actor } = l;
  const candidate = prepared(object, 1, a.projectId);
  const saved = await client.savePreparedSpeciesEnrichment(candidate, actor);
  await assert.rejects(client.stagePreparedSpeciesEnrichment(saved.candidateId, saved.targetDataHash), { code: "species_enrichment_server_required" });
  assert.equal(l.f.store.pending(l.f.store.active().id).length, 0);
  supportsEnrichment = true;
  await assert.rejects(client.stagePreparedSpeciesEnrichment(saved.candidateId, "f".repeat(64)), { code: "species_enrichment_review_changed" });
  const staged = await client.stagePreparedSpeciesEnrichment(saved.candidateId, saved.targetDataHash);
  assert.equal(staged.object.localPending, true);
  assert.equal(dispatched.length, 0);
  await assert.rejects(client.sync(), { code: "offline" });
  const accepted = store.getObject(a.token, "species", object.id);
  assert.equal(accepted.ordinal, 2);
  await client.close();
  const reopened = l.reopen();
  await assert.rejects(reopened.sync(), { code: "normal_media_uncertain" });
  const bound = normalMediaBinding(accepted.data, { projectId: a.projectId, slot: "portrait.webp" });
  assert.equal(store.getNormalMedia(a.token, bound.contentId).complete, true);
  assert.equal(l.f.store.pending(l.f.store.active().id)[0].result_revision, accepted.revision);
  assert.equal(l.f.store.get(l.f.store.active().id, "page", "fixture-page").data.title, "Weitere Seite");
  const changed = store.submitChange(b.token, { changeId: "remote-manual-edit", kind: "species", id: object.id, baseRevision: accepted.revision,
    data: { ...accepted.data, input: { ...accepted.data.input, weight: "95 g" } } }).object;
  const completed = await reopened.sync();
  assert.equal(completed.pending, 0);
  assert.deepEqual(completed.speciesEnrichmentResults, [{ changeId: staged.changeId, speciesId: object.id,
    acceptedRevision: accepted.revision, currentRevision: changed.revision, confirmedFiles: 1, supersededFiles: 0, readerApproved: false }]);
  assert.equal(store.getObject(a.token, "species", object.id).revision, changed.revision);
  const local = l.f.store.get(l.f.store.active().id, "species", object.id);
  assert.equal(local.revision, changed.revision);
  assert.equal(local.approvedRevision, object.revision);
  assert.equal(local.data.input.weight, "95 g");
  assert.equal(dispatched.filter(([type]) => type === "upload").length, 1);
  const changes = dispatched.filter(([type]) => type === "change");
  assert.equal(changes.length, 3);
  assert.equal(new Set(changes.map(([, body]) => body)).size, 1);
});

test("a concurrent change before dispatch removes the old request from active sync and keeps the candidate", async t => {
  const { f, client, store, object, a, b, actor } = await live(t);
  const saved = await client.savePreparedSpeciesEnrichment(prepared(object, 1, a.projectId), actor);
  const staged = await client.stagePreparedSpeciesEnrichment(saved.candidateId, saved.targetDataHash);
  const changed = store.submitChange(b.token, { changeId: "competing-manual-edit", kind: "species", id: object.id, baseRevision: object.revision,
    data: { ...object.data, input: { ...object.data.input, weight: "95 g" } } }).object;
  await assert.rejects(client.sync(), { code: "species_enrichment_changed" });
  assert.equal(f.store.pending(f.store.active().id).length, 0);
  assert.equal(f.store.get(f.store.active().id, "species", object.id).revision, changed.revision);
  const db = new DatabaseSync(f.filename);
  try {
    assert.equal(db.prepare("SELECT state FROM queue WHERE change_id=?").get(staged.changeId).state, "superseded");
    assert.ok(db.prepare("SELECT 1 FROM enrichment_candidates WHERE candidate_id=?").get(saved.candidateId));
  } finally { db.close(); }
  assert.equal((await client.sync()).pending, 0);
});

test("a newer reviewed image supersedes the old upload without changing the newer draft", async t => {
  let drop = true, mediaRequests = 0;
  const { client, store, object, a, b, actor } = await live(t, async (url, options) => {
    const pathname = new URL(url).pathname, result = await fetch(url, options);
    if (pathname.includes("/normal-media")) mediaRequests++;
    if (drop && pathname === "/api/v1/changes" && result.ok) {
      drop = false; await result.text(); throw new Error("fixture lost draft reply");
    }
    return result;
  });
  const saved = await client.savePreparedSpeciesEnrichment(prepared(object, 1, a.projectId), actor);
  await client.stagePreparedSpeciesEnrichment(saved.candidateId, saved.targetDataHash);
  await assert.rejects(client.sync(), { code: "offline" });
  const accepted = store.getObject(a.token, "species", object.id);
  const newer = prepared(accepted, 2, b.projectId);
  const competing = store.submitChange(b.token, { changeId: "newer-portrait-fixture", kind: "species", id: object.id,
    baseRevision: accepted.revision, enrichment: { schemaVersion: 1, actor: { projectId: b.projectId, userId: b.user.id,
      role: b.user.role, userVersion: b.user.version }, sourceBindings: newer.sourceBindings,
    result: newer.sourceResult, targetDataHash: digest(objectJson(newer.data)) } }).object;
  const completed = await client.sync(), [result] = completed.speciesEnrichmentResults;
  assert.equal(completed.pending, 0);
  assert.equal(result.currentRevision, competing.revision);
  assert.equal(result.confirmedFiles, 0);
  assert.equal(result.supersededFiles, 1);
  assert.equal(mediaRequests, 0);
  assert.deepEqual(store.getObject(a.token, "species", object.id), competing);
});
