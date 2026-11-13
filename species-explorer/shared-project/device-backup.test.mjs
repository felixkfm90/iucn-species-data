import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { createManagedTempSession } from "../temp-session.mjs";
import { createSharedProjectClientStore } from "./client-store.mjs";
import { canonicalJson, objectJson } from "./security.mjs";
import { createPageEditorialIntent } from "./species-editorial-intent.mjs";
import { buildSpeciesWorkingRecords } from "../species-content/working-records.mjs";
import { createDeviceBackupProvider, validateDeviceBackupCopy } from "./device-backup.mjs";
import { inspectClientImage } from "./client-image-media.mjs";
import { createTestPng, createTestWebp } from "../server-test-fixtures.mjs";
import { normalMediaContentId } from "./normal-media.mjs";
import { legacyPageJournalMedia, pageMediaRequirementHash, validatePageMediaBackup } from "./page-media-backup.mjs";
import { createSqlitePageAuthoringRepository } from "../page-authoring/repository.mjs";
import { initialDocument, normalizeSpeciesSnapshot } from "../page-authoring/model.mjs";
import { fingerprint } from "../page-authoring/contract.mjs";
import { validatePageAuthoringJournal } from "./project-journal-backup.mjs";

const DEVICE = "device-ec2d31f7-0485-4a04-96c4-b40e233b126a";
const OTHER = "device-4aa7571e-6200-4647-b511-4707bed97ee6";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const backupSpecs = [
  { id: "device", relativePath: "device.json", kind: "device-profile", required: true },
  { id: "cache", relativePath: "project-cache.sqlite", kind: "client-cache", required: true },
  { id: "import", relativePath: "initial-import.sqlite", kind: "import-journal" },
];
function createJournal(filename, version) {
  const db = new DatabaseSync(filename);
  db.exec(`
    CREATE TABLE plans(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,base_url TEXT NOT NULL,
      source_hash TEXT NOT NULL,release_readers INTEGER NOT NULL,state TEXT NOT NULL,created_at TEXT NOT NULL,last_error TEXT);
    CREATE TABLE items(plan_id TEXT NOT NULL REFERENCES plans(id),id TEXT NOT NULL,name TEXT NOT NULL,
      target_json TEXT NOT NULL,target_hash TEXT NOT NULL,state TEXT NOT NULL,expected_revision TEXT,expected_approval TEXT,
      intent_actor TEXT,PRIMARY KEY(plan_id,id));
    CREATE TABLE receipts(sequence INTEGER PRIMARY KEY AUTOINCREMENT,plan_id TEXT NOT NULL REFERENCES plans(id),
      object_id TEXT,operation TEXT NOT NULL,phase TEXT NOT NULL,revision TEXT,actor_id TEXT,created_at TEXT NOT NULL);
    CREATE TABLE lease(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,pid INTEGER NOT NULL);
    PRAGMA user_version=${version};
  `);
  if (version === 2) db.exec("CREATE TABLE source_bindings(plan_id TEXT PRIMARY KEY REFERENCES plans(id),kind TEXT NOT NULL,version INTEGER NOT NULL,evidence_json TEXT NOT NULL)");
  return db;
}
const publicTarget = () => ({ id: "species-a", scientificName: "Strix fixture", commonName: "Fixture-Art", taxonomy: [], sections: [], media: { sounds: [], gallery: [] } });
async function fixture(t, { journal = false, journalVersion = 1, cacheVersion = 3 } = {}) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "devbackup-")), repoRoot = path.join(root, "repo"), profileRoot = path.join(root, "Geräteprofil mit Umlaut ü");
  await fs.mkdir(profileRoot, { recursive: true });
  await fs.writeFile(path.join(profileRoot, "device.json"), JSON.stringify({ schemaVersion: 1, id: DEVICE, name: "Fixture-PC" }));
  await fs.mkdir(path.join(profileRoot, "credentials"));
  await fs.writeFile(path.join(profileRoot, "credentials", "session.bin"), "fixture-only-secret-never-package");
  const session = await createManagedTempSession({ repoRoot }), filename = path.join(profileRoot, "project-cache.sqlite");
  const store = createSharedProjectClientStore({ filename, localStorageConfirmed: true });
  const users = ["project-a", "project-b"].map((projectId, index) => store.bind({ baseUrl: `https://fixture-${index}.invalid`, projectId,
    user: { id: `user-${index}`, username: `fixture-${index}`, displayName: "Fixture", role: "admin" } }));
  for (const binding of users) {
    store.saveObjects(binding.id, [{ kind: "page", id: "page-a", revision: "rev-a", data: { title: "Initial" } }]);
    store.edit(binding.id, "page", "page-a", { title: `Offline ${binding.projectId}` });
  }
  if (cacheVersion < 4) {
    const legacy = new DatabaseSync(filename);
    legacy.exec("DROP TABLE IF EXISTS normal_media; DROP TABLE IF EXISTS normal_blobs;");
    if (cacheVersion === 2) legacy.exec("DROP TABLE image_media; DROP TABLE image_blobs;");
    legacy.exec(`PRAGMA user_version=${cacheVersion};`); legacy.close();
  }
  if (journal) {
    const db = createJournal(path.join(profileRoot, "initial-import.sqlite"), journalVersion);
    const target = journalVersion === 1 ? { title: "Noch nicht importiert" } : publicTarget();
    db.prepare("INSERT INTO plans VALUES (?,?,?,?,?,'planned',?,NULL)").run("plan-a", "project-a", "https://fixture.invalid", "a".repeat(64), 1, "2026-10-31T12:00:00Z");
    db.prepare("INSERT INTO items VALUES (?,?,?,?,?,'pending',NULL,NULL,NULL)").run("plan-a", "species-a", "Fixture-Art", JSON.stringify(target), sha(canonicalJson(target)));
    if (journalVersion === 2) db.prepare("INSERT INTO source_bindings VALUES (?, 'public-catalog', 1, '{}')").run("plan-a");
    db.close();
  }
  const snapshots = [];
  t.after(async () => {
    for (const snapshot of snapshots) await snapshot.dispose();
    store.close(); await session.close();
    await fs.rm(assertTestTempPath(root), { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
  });
  const config = { profileRoot, deviceId: DEVICE, resolveProjectIds: async () => ["project-a", "project-b"], files: backupSpecs, tempSession: session };
  return { root, repoRoot, profileRoot, session, store, users, filename, config,
    async prepare(options, overrides = {}) { const snapshot = await createDeviceBackupProvider({ ...config, ...overrides }).prepare(options); snapshots.push(snapshot); return snapshot; },
    async originalHashes() { return Promise.all([filename, filename + "-wal", path.join(profileRoot, "device.json")].map(async (name) => [name, sha(await fs.readFile(name))])); },
    async restoreCopy(snapshot) {
      const handoff = JSON.parse(await fs.readFile(snapshot.manifestPath, "utf8")), directory = path.join(root, `restore-${snapshots.length}`);
      await fs.mkdir(directory);
      for (const entry of handoff.files) {
        const relative = entry.path.slice(`device-profiles/${DEVICE}/`.length), target = path.join(directory, relative);
        await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile(entry.sourcePath, target);
      }
      return { directory, handoff, options: { directory, expectedDeviceId: DEVICE, expectedProjectIds: ["project-a", "project-b"], files: backupSpecs, activeProfileRoot: profileRoot } };
    },
  };
}

function sealedEditorialFixture(binding) {
  const hash = "e".repeat(64), sourceBindings = { projectId: binding.projectId,
    page: { objectId: `fn-species-page-${hash}`, objectRevision: "11111111-1111-4111-8111-111111111111",
      dataRevision: hash, contentHash: hash, imagesHash: hash, dataHash: hash },
    species: { id: "fixture-owl", objectRevision: "22222222-2222-4222-8222-222222222222", dataHash: hash, sourceHash: hash } };
  const data = { type: "fn-species-record", schemaVersion: 2, id: "fixture-owl",
    input: { german: "Testkauz", genus: "Strix", species: "fixture", retainedPrivateOriginal: { value: true } },
    generated: null, taxonomyOverride: null, assessmentBinding: null,
    assets: { assetName: "Historischer Testkauz", files: {}, overrides: {}, credits: null, portraitMetadata: null },
    editorial: { websiteUrl: null, title: "Testkauz", introduction: [{ type: "paragraph", text: "Gemeinsam vorbereiteter Fachtext" }],
      sections: [{ id: "general", kind: "general-module", title: "Allgemein", requested: false, blocks: [], sources: [], emptyDecision: null },
        { id: "map", kind: "map-module", title: "Verbreitung", requested: false, blocks: [], sources: [], emptyDecision: null }],
      sources: [], galleryRequested: false, gallery: [], normalAssets: { portrait: null, map: null, sound: null, credits: null, spectrogram: null },
      sourceBindings: structuredClone(sourceBindings) } };
  const intent = createPageEditorialIntent({ sourceBindings, projectionHash: hash,
    actor: { projectId: binding.projectId, userId: binding.userId, role: "admin" } });
  return { changeId: "33333333-3333-4333-8333-333333333333", kind: "species", id: data.id,
    baseRevision: sourceBindings.species.objectRevision, data, intent };
}
function insertSealedFixture(f, request = sealedEditorialFixture(f.users[0])) {
  const binding = f.users[0];
  f.store.saveObjects(binding.id, [{ kind: "species", id: request.id, revision: request.baseRevision, ordinal: 1,
    approval: "draft", data: request.data }]);
  const db = new DatabaseSync(f.filename);
  try {
    db.prepare("INSERT INTO queue(binding_id,change_id,kind,object_id,base_revision,data_json,request_json,state) VALUES (?,?,?,?,?,?,?,'uncertain')")
      .run(binding.id, request.changeId, request.kind, request.id, request.baseRevision, objectJson(request.data),
        canonicalJson(request, { maxBytes: 4 * 1024 * 1024 + 16 * 1024, maxNodes: 300000 }));
  } finally { db.close(); }
  return request;
}
function mutateSealedFixture(filename, mutate) {
  const db = new DatabaseSync(filename);
  try {
    const row = db.prepare("SELECT * FROM queue WHERE kind='species'").get();
    const request = JSON.parse(row.request_json), data = JSON.parse(row.data_json);
    mutate({ request, data, row, db });
    db.prepare("UPDATE queue SET base_revision=?,data_json=?,request_json=? WHERE change_id=?")
      .run(row.base_revision, objectJson(data), canonicalJson(request, { maxBytes: 4 * 1024 * 1024 + 16 * 1024, maxNodes: 300000 }), row.change_id);
  } finally { db.close(); }
}

test("sealed editorial target and purpose survive real personal backup, separate restore and client-store restart", async (t) => {
  const f = await fixture(t), request = insertSealedFixture(f), before = await f.originalHashes();
  const snapshot = await f.prepare(), { options, directory } = await f.restoreCopy(snapshot);
  assert.equal(snapshot.summary.pending, 3); assert.equal((await validateDeviceBackupCopy(options)).pending, 3);
  const copy = createSharedProjectClientStore({ filename: path.join(directory, "project-cache.sqlite"), localStorageConfirmed: true });
  try {
    assert.deepEqual(copy.prepare(request.changeId), request);
    const rows = copy.pending(f.users[0].id), queued = rows.find(row => row.change_id === request.changeId);
    assert.deepEqual(JSON.parse(queued.data_json), request.data); assert.deepEqual(JSON.parse(queued.request_json).intent, request.intent);
  } finally { copy.close(); }
  assert.deepEqual(await f.originalHashes(), before);
});

test("backup rejects changed sealed base, species, project, person, target data and unrecognized purpose", async (t) => {
  const mutations = [
    ({ request }) => { request.intent.sourceBindings.species.objectRevision = "44444444-4444-4444-8444-444444444444"; },
    ({ request }) => { request.intent.sourceBindings.species.id = "other-species"; },
    ({ request }) => { request.intent.binding.projectId = "project-b"; },
    ({ request }) => { request.intent.binding.userId = "other-person"; },
    ({ request }) => { request.data.input.german = "Geänderter Zielinhalt"; },
    ({ request, data }) => { data.editorial.sourceBindings.page.contentHash = "f".repeat(64); request.data = structuredClone(data); },
    ({ request }) => { request.intent.kind = "unrecognized-purpose"; },
    ({ request }) => { request.extra = "Must not disappear"; },
    ({ row }) => { row.base_revision = "44444444-4444-4444-8444-444444444444"; },
  ];
  for (const mutate of mutations) {
    const f = await fixture(t); insertSealedFixture(f); mutateSealedFixture(f.filename, mutate);
    const before = await f.originalHashes(); await assert.rejects(f.prepare()); assert.deepEqual(await f.originalHashes(), before);
  }
});

test("separate restore checks sealed purpose after valid outer cache and manifest hashes were recomputed", async (t) => {
  for (const mode of ["person", "base", "data-source"]) {
    const f = await fixture(t); insertSealedFixture(f);
    const snapshot = await f.prepare(), { options, directory } = await f.restoreCopy(snapshot), filename = path.join(directory, "project-cache.sqlite");
    mutateSealedFixture(filename, ({ request, data }) => {
      if (mode === "person") request.intent.binding.userId = "other-person";
      if (mode === "base") request.intent.sourceBindings.species.objectRevision = "44444444-4444-4444-8444-444444444444";
      if (mode === "data-source") { data.editorial.sourceBindings.page.contentHash = "f".repeat(64); request.data = structuredClone(data); }
    });
    await rebindManifest(directory, async manifest => { const record = manifest.files.find(entry => entry.id === "cache"), bytes = await fs.readFile(filename);
      record.bytes = bytes.length; record.sha256 = sha(bytes); });
    await assert.rejects(validateDeviceBackupCopy(options));
  }
});

test("historical sealed writer role remains valid backup evidence after the same person's cached role changes", async (t) => {
  const f = await fixture(t), request = insertSealedFixture(f);
  f.store.updateUser(f.users[0].id, { ...f.users[0].user, role: "reader" });
  const snapshot = await f.prepare(), { options } = await f.restoreCopy(snapshot);
  assert.equal((await validateDeviceBackupCopy(options)).pending, 3);
  assert.equal(request.intent.binding.role, "admin");
});

test("sealed cancellation guard survives backup and restore, blocks another edit and still permits exact request recovery", async (t) => {
  for (const state of ["queued", "uncertain"]) {
    const f = await fixture(t), request = insertSealedFixture(f), owner = f.users[0];
    const initial = new DatabaseSync(f.filename);
    try { initial.prepare("UPDATE queue SET state=? WHERE change_id=?").run(state, request.changeId); }
    finally { initial.close(); }
    assert.deepEqual(f.store.editorialChange(owner.id, request.changeId), request);
    assert.throws(() => f.store.edit(owner.id, "species", request.id, request.data), error => error.code === "change_blocked");
    const before = await f.originalHashes(), snapshot = await f.prepare(), { options, directory } = await f.restoreCopy(snapshot);
    assert.equal((await validateDeviceBackupCopy(options)).pending, 3);
    const filename = path.join(directory, "project-cache.sqlite"), db = new DatabaseSync(filename, { readOnly: true });
    try {
      assert.equal(db.prepare("SELECT value FROM state WHERE key=?").get(`editorial-cancel-${request.changeId}`).value,
        `${owner.id}/species/${request.id}`);
      assert.equal(db.prepare("SELECT state FROM queue WHERE change_id=?").get(request.changeId).state, state);
    } finally { db.close(); }
    const copy = createSharedProjectClientStore({ filename, localStorageConfirmed: true });
    try {
      assert.throws(() => copy.edit(owner.id, "species", request.id, request.data), error => error.code === "change_blocked");
      assert.deepEqual(copy.prepare(request.changeId), request);
      assert.throws(() => copy.edit(owner.id, "species", request.id, request.data), error => error.code === "change_blocked");
    } finally { copy.close(); }
    assert.deepEqual(await f.originalHashes(), before);
  }
});

test("restore rejects orphaned or altered cancellation guards even with recomputed cache and outer manifest hashes", async (t) => {
  for (const mode of ["orphan", "case", "binding", "object", "terminal", "unsealed"]) {
    const f = await fixture(t), request = insertSealedFixture(f), owner = f.users[0];
    f.store.editorialChange(owner.id, request.changeId);
    const snapshot = await f.prepare(), { options, directory } = await f.restoreCopy(snapshot);
    const filename = path.join(directory, "project-cache.sqlite"), db = new DatabaseSync(filename), key = `editorial-cancel-${request.changeId}`;
    try {
      if (mode === "orphan") db.prepare("UPDATE state SET key=? WHERE key=?").run("editorial-cancel-unknown-change", key);
      if (mode === "case") db.prepare("UPDATE state SET key=? WHERE key=?").run(`EDITORIAL-CANCEL-${request.changeId}`, key);
      if (mode === "binding") db.prepare("UPDATE state SET value=? WHERE key=?").run(`${f.users[1].id}/species/${request.id}`, key);
      if (mode === "object") db.prepare("UPDATE state SET value=? WHERE key=?").run(`${owner.id}/species/other-species`, key);
      if (mode === "terminal") db.prepare("UPDATE queue SET state='applied' WHERE change_id=?").run(request.changeId);
      if (mode === "unsealed") {
        const ordinary = structuredClone(request); delete ordinary.intent;
        db.prepare("UPDATE queue SET request_json=? WHERE change_id=?").run(canonicalJson(ordinary), request.changeId);
      }
    } finally { db.close(); }
    await rebindManifest(directory, async manifest => {
      const record = manifest.files.find(entry => entry.id === "cache"), bytes = await fs.readFile(filename);
      record.bytes = bytes.length; record.sha256 = sha(bytes);
    });
    await assert.rejects(validateDeviceBackupCopy(options), /Abschlusssperre/);
  }
});

test("legacy v1 cache with an ordinary prepared request remains readable without invented editorial intent", async (t) => {
  const f = await fixture(t), queued = f.store.pending(f.users[0].id)[0], request = f.store.prepare(queued.change_id);
  assert.equal(Object.hasOwn(request, "intent"), false); f.store.close();
  const legacy = new DatabaseSync(f.filename);
  try {
    legacy.exec("DROP TABLE image_media; DROP TABLE image_blobs; DROP TABLE pull_objects; DROP TABLE pulls; PRAGMA user_version=1;");
    // Keep the synthetic legacy writer open, just as the normal fixture does.
    // Closing its last WAL connection would change the physical sidecar set
    // again when the backup opens its reader and correctly trip source drift.
    const snapshot = await f.prepare(), { options } = await f.restoreCopy(snapshot);
    assert.equal((await validateDeviceBackupCopy(options)).pending, 2);
  }
  finally { legacy.close(); }
});

test("record2 staged pull envelopes above three MiB are backed up intact without relaxing generic object limits", async (t) => {
  for (const version of [2, 1]) {
    const f = await fixture(t), request = sealedEditorialFixture(f.users[0]), pullId = "55555555-5555-4555-8555-555555555555";
    request.data.input.retainedPrivateOriginal.text = "x".repeat(3200 * 1024);
    request.data.schemaVersion = version;
    const object = { kind: "species", id: request.id, revision: request.baseRevision, ordinal: 1, approval: "draft", data: request.data };
    const db = new DatabaseSync(f.filename);
    try {
      db.prepare("INSERT INTO pulls VALUES (?,?,?,?,?)").run(pullId, f.users[0].id, "f".repeat(64), 1, `species/${request.id}`);
      db.prepare("INSERT INTO pull_objects VALUES (?,?,?,?)").run(pullId, "species", request.id,
        canonicalJson(object, { maxBytes: 4 * 1024 * 1024 + 16 * 1024, maxNodes: 300000 }));
    } finally { db.close(); }
    if (version === 1) { await assert.rejects(f.prepare(), error => error.code === "data_too_large" && error.status === 413); continue; }
    const before = await f.originalHashes(), snapshot = await f.prepare(), { options, directory } = await f.restoreCopy(snapshot);
    await validateDeviceBackupCopy(options);
    const copy = new DatabaseSync(path.join(directory, "project-cache.sqlite"), { readOnly: true });
    try { assert.deepEqual(JSON.parse(copy.prepare("SELECT object_json FROM pull_objects WHERE pull_id=?").get(pullId).object_json), object); }
    finally { copy.close(); }
    assert.deepEqual(await f.originalHashes(), before);
  }
});

test("device backup includes committed live WAL and all projects' pending edits without changing original bytes", async (t) => {
  const f = await fixture(t, { journal: true }), before = await f.originalHashes();
  const snapshot = await f.prepare(), { handoff, options, directory } = await f.restoreCopy(snapshot);
  assert.equal(snapshot.summary.pending, 3); assert.equal(snapshot.summary.fileCount, 3);
  assert.equal((await validateDeviceBackupCopy(options)).pending, 3);
  const restored = new DatabaseSync(path.join(directory, "project-cache.sqlite"), { readOnly: true });
  assert.equal(restored.prepare("SELECT count(*) AS n FROM queue WHERE state='queued'").get().n, 2);
  assert.deepEqual(restored.prepare("SELECT data_json FROM queue ORDER BY seq").all().map((row) => JSON.parse(row.data_json).title), ["Offline project-a", "Offline project-b"]);
  assert.equal(restored.prepare("PRAGMA journal_mode").get().journal_mode, "delete"); restored.close();
  assert.equal(handoff.files.some((entry) => /credential|\.bin/.test(entry.path)), false);
  for (const entry of handoff.files) assert.equal((await fs.readFile(entry.sourcePath)).includes(Buffer.from("fixture-only-secret")), false);
  assert.deepEqual(await f.originalHashes(), before);
  await snapshot.assertSourcesUnchanged(); await snapshot.dispose();
  assert.deepEqual((await fs.readdir(f.session.root)).filter((entry) => entry !== ".fn-temp-session.json"), []);
});

test("unchanged snapshots have a stable logical hash, and a fresh offline edit changes that hash", async (t) => {
  const f = await fixture(t), first = await f.prepare(), second = await f.prepare();
  assert.equal(first.summary.stateHash, second.summary.stateHash);
  f.store.edit(f.users[0].id, "page", "page-a", { title: "Später offline geändert" });
  await assert.rejects(first.assertSourcesUnchanged(), /seit der Snapshot/);
  const third = await f.prepare(); assert.notEqual(third.summary.stateHash, first.summary.stateHash);
});

test("v3 personal snapshots include every local image byte and explicitly bind remote-only images without inventing downloaded bytes", async (t) => {
  const f = await fixture(t), bytes = createTestPng(24, 16);
  const local = await inspectClientImage(bytes, { projectId: f.users[0].projectId, attribution: "Noch unübertragene Aufnahme" });
  const remote = await inspectClientImage(bytes, { projectId: f.users[1].projectId, attribution: "Bestätigte Serveraufnahme" });
  f.store.media.save(f.users[0].id, local, bytes); f.store.media.rememberRemote(f.users[1].id, remote);
  const before = await f.originalHashes(), snapshot = await f.prepare(), { options, directory } = await f.restoreCopy(snapshot);
  await validateDeviceBackupCopy(options);
  const manifest = JSON.parse(await fs.readFile(path.join(directory, "device-backup-manifest.json"), "utf8"));
  const media = manifest.files.find((file) => file.id === "cache").media;
  assert.equal(media.localImageBytes, bytes.length); assert.equal(media.localBlobCount, 1); assert.equal(media.remoteBacked.length, 1);
  assert.equal(media.remoteBacked[0].id, remote.id); assert.equal(media.remoteBacked[0].localBytesIncluded, false); assert.equal(media.remoteBacked[0].requiredServerMedia, true);
  const copy = createSharedProjectClientStore({ filename: path.join(directory, "project-cache.sqlite"), localStorageConfirmed: true });
  try {
    assert.deepEqual(copy.media.get(f.users[0].id, local.id).buffer, bytes); assert.equal(copy.media.get(f.users[0].id, local.id).uploaded, false);
    assert.equal(copy.media.get(f.users[1].id, remote.id).buffer, null); assert.equal(copy.media.get(f.users[1].id, remote.id).uploaded, true);
  } finally { copy.close(); }
  assert.deepEqual(await f.originalHashes(), before);
});

async function addPageJournal(f, asset, { origin = f.users[0].baseUrl, actorId = f.users[0].userId, legacy = false,
  normalAsset = null, gallery = true } = {}) {
  const filename = path.join(f.profileRoot, "page-authoring.sqlite"), repository = createSqlitePageAuthoringRepository({ filename, localStorageConfirmed: true });
  try {
    const species = normalizeSpeciesSnapshot({ slug: "test-art", scientificName: "Testus fixture", commonName: "Test-Art", taxonomy: [], general: [], status: "",
      revision: "source-a", dataSha256: "a".repeat(64), runtimeReady: false, normalAssets: { portrait: normalAsset, map: null, sound: null, credits: null, spectrogram: null } }, f.users[0].projectId, "test-art");
    const document = initialDocument({ species, templateId: "fn-compact-20261031", parentPath: "/wildlife/heimische-tierwelt" });
    if (asset && gallery) {
      const { id, projectId, sha256, bytes, mimeType, attribution } = asset;
      document.images = [{ id: "usage-a", assetId: id, asset: { id, projectId, sha256, bytes, mimeType, attribution }, alt: "Neue Aufnahme", caption: "", decorative: false }];
    }
    (legacy ? repository : repository.scoped({ origin, actorId })).commit({ projectId: f.users[0].projectId, actorId, id: "local-only-page", create: true,
      mutationId: "new-page", intentHash: fingerprint("new-page"), document });
  } finally { repository.close(); }
  const files = [...backupSpecs, { id: "authoring", relativePath: "page-authoring.sqlite", kind: "sqlite", required: true, validate: validatePageAuthoringJournal }];
  return { files, async prepare() { return f.prepare(undefined, { files }); }, async restoreCopy(snapshot) { const result = await f.restoreCopy(snapshot); result.options.files = files; return result; } };
}
async function rebindManifest(directory, edit) {
  const filename = path.join(directory, "device-backup-manifest.json"), manifest = JSON.parse(await fs.readFile(filename, "utf8"));
  await edit(manifest); manifest.stateHash = sha(canonicalJson({ deviceId: manifest.deviceId, projectIds: manifest.projectIds, files: manifest.files }, { maxBytes: 8 * 1024 * 1024, maxNodes: 300000 }));
  await fs.writeFile(filename, JSON.stringify(manifest)); return manifest;
}

function normalFixture(binding, { id = "original-portrait-id", attribution = "Eigene unveränderte Artaufnahme" } = {}) {
  const buffer = createTestWebp(), asset = { id, projectId: binding.projectId, sha256: sha(buffer), bytes: buffer.length, mimeType: "image/webp", attribution };
  const source = { projectId: binding.projectId, speciesId: "test-art", slot: "portrait.webp", asset };
  return { asset, buffer, metadata: { ...source, contentId: normalMediaContentId(source), width: 8, height: 8, complete: true },
    proof: { sourceRevision: "11111111-1111-4111-8111-111111111111", sourceDataHash: "d".repeat(64) } };
}
function saveNormalFixture(f, binding, normal) {
  const metadata = normal.metadata, asset = metadata.asset;
  const data = { type: "fn-species-record", schemaVersion: 1, id: metadata.speciesId,
    input: { german: "Test-Art", genus: "Testus", species: "fixture" }, generated: null, taxonomyOverride: null, assessmentBinding: null,
    assets: { assetName: "Test-Art", files: { "portrait.webp": { id: asset.id, sha256: asset.sha256, bytes: asset.bytes, mimeType: asset.mimeType } },
      overrides: {}, credits: null, portraitMetadata: { source: asset.attribution } },
    editorial: { websiteUrl: null, sections: [], gallery: [], generalSectionId: null, embeddedGeneralText: null } };
  f.store.bind({ baseUrl: binding.baseUrl, projectId: binding.projectId, user: binding.user });
  f.store.saveObjects(binding.id, [{ kind: "species", id: data.id, revision: normal.proof.sourceRevision, ordinal: 1,
    approval: "draft", approvedRevision: null, data }]);
  f.store.normalMedia.save(binding.id, metadata, normal.buffer, { ...normal.proof, sourceDataHash: sha(objectJson(data)) });
}

test("a saved portrait with an image UUID does not require a gallery-cache entry or claim downloaded bytes", async (t) => {
  const f = await fixture(t, { cacheVersion: 4 }), normal = normalFixture(f.users[0], { id: "image-00000000-0000-4000-8000-000000000001" });
  const page = await addPageJournal(f, normal.asset, { normalAsset: normal.asset, gallery: false });
  const before = await f.originalHashes(), snapshot = await page.prepare(), { directory, options } = await page.restoreCopy(snapshot);
  assert.equal((await validateDeviceBackupCopy(options)).ok, true);
  const manifest = JSON.parse(await fs.readFile(path.join(directory, "device-backup-manifest.json"), "utf8"));
  const journal = manifest.files.find(entry => entry.id === "authoring").journalMedia;
  assert.equal(journal.schemaVersion, 2); assert.equal(journal.scopedRequiredMedia.length, 1);
  assert.equal(journal.scopedRequiredMedia[0].domain, "normal"); assert.equal(journal.scopedRequiredMedia[0].speciesId, "test-art");
  assert.equal(journal.scopedRequiredMedia[0].slot, "portrait.webp"); assert.equal(journal.evidence[0].storage, "external-reference");
  assert.equal(journal.evidence[0].localBytesIncluded, false); assert.equal(journal.coverage.mediaBytesIncluded, false);
  assert.deepEqual(await f.originalHashes(), before);
});

test("cache4 restores a non-UUID normal portrait and exact gallery alias as locally included normal bytes", async (t) => {
  const f = await fixture(t, { cacheVersion: 4 }), normal = normalFixture(f.users[0]);
  saveNormalFixture(f, f.users[0], normal);
  const page = await addPageJournal(f, normal.asset, { normalAsset: normal.asset }), before = await f.originalHashes();
  const snapshot = await page.prepare(), { directory, options } = await page.restoreCopy(snapshot);
  assert.equal((await validateDeviceBackupCopy(options)).ok, true);
  const manifest = JSON.parse(await fs.readFile(path.join(directory, "device-backup-manifest.json"), "utf8"));
  const media = manifest.files.find(entry => entry.id === "cache").media, journal = manifest.files.find(entry => entry.id === "authoring").journalMedia;
  assert.equal(media.localNormalBytes, normal.buffer.length); assert.equal(media.localNormalBlobCount, 1); assert.equal(media.normalReferenceCount, 1);
  assert.match(media.normalReferencesSha256, /^[a-f0-9]{64}$/); assert.equal(media.localImageBytes, 0);
  assert.equal(journal.scopedRequiredMedia.length, 1); assert.equal(journal.evidence[0].storage, "local-normal-bytes");
  assert.equal(journal.evidence[0].localBytesIncluded, true); assert.equal(journal.coverage.mediaBytesIncluded, false);
  const copy = createSharedProjectClientStore({ filename: path.join(directory, "project-cache.sqlite"), localStorageConfirmed: true });
  try { assert.deepEqual(copy.normalMedia.get(f.users[0].id, normal.metadata.contentId).buffer, normal.buffer); }
  finally { copy.close(); }
  assert.deepEqual(await f.originalHashes(), before);
});

test("a gallery use with the normal image UUID but another attribution still needs its independent image-cache evidence", async (t) => {
  const f = await fixture(t, { cacheVersion: 4 }), normal = normalFixture(f.users[0], { id: "image-00000000-0000-4000-8000-000000000001" });
  saveNormalFixture(f, f.users[0], normal);
  const gallery = { ...normal.asset, attribution: "Andere ausdrücklich zugeordnete Bildquelle" };
  const page = await addPageJournal(f, gallery, { normalAsset: normal.asset });
  await assert.rejects(page.prepare(), /Seitenentwurf fehlen/);
  const image = { ...await inspectClientImage(normal.buffer, { projectId: gallery.projectId, attribution: gallery.attribution }), id: gallery.id };
  f.store.media.save(f.users[0].id, image, normal.buffer);
  const snapshot = await page.prepare(), { directory, options } = await page.restoreCopy(snapshot);
  await validateDeviceBackupCopy(options);
  const manifest = JSON.parse(await fs.readFile(path.join(directory, "device-backup-manifest.json"), "utf8")), journal = manifest.files.find(entry => entry.id === "authoring").journalMedia;
  const evidence = new Map(journal.evidence.map(entry => [entry.requirementSha256, entry]));
  assert.equal(journal.scopedRequiredMedia.length, 2);
  for (const entry of journal.scopedRequiredMedia) assert.equal(evidence.get(pageMediaRequirementHash(entry)).storage, entry.domain === "normal" ? "local-normal-bytes" : "local-bytes");
});

test("normal cache evidence cannot be borrowed from another person, origin, species or exact normal source", async (t) => {
  for (const mode of ["person", "origin", "species", "attribution"]) {
    const f = await fixture(t, { cacheVersion: 4 }), normal = normalFixture(f.users[0]);
    let binding = f.users[0], metadata = normal.metadata;
    if (mode === "person" || mode === "origin") binding = f.store.bind({ baseUrl: mode === "origin" ? "https://other.invalid" : binding.baseUrl,
      projectId: binding.projectId, user: { ...binding.user, ...(mode === "person" ? { id: "another-user" } : {}) } });
    if (mode === "species" || mode === "attribution") {
      metadata = { ...metadata, ...(mode === "species" ? { speciesId: "other-art" } : { asset: { ...metadata.asset, attribution: "Andere Quelle" } }) };
      metadata.contentId = normalMediaContentId({ projectId: metadata.projectId, speciesId: metadata.speciesId, slot: metadata.slot, asset: metadata.asset });
    }
    saveNormalFixture(f, binding, { ...normal, metadata });
    const page = await addPageJournal(f, normal.asset, { normalAsset: normal.asset, gallery: false }), snapshot = await page.prepare(), { directory, options } = await page.restoreCopy(snapshot);
    await validateDeviceBackupCopy(options);
    const manifest = JSON.parse(await fs.readFile(path.join(directory, "device-backup-manifest.json"), "utf8")), proof = manifest.files.find(entry => entry.id === "authoring").journalMedia;
    assert.equal(proof.evidence[0].storage, "external-reference"); assert.equal(proof.evidence[0].localBytesIncluded, false);
  }
});

test("cache4 exact schema rejects additional objects, altered columns and removed normal foreign keys", async (t) => {
  for (const mode of ["view", "trigger", "column", "foreign-key", "version"]) {
    const f = await fixture(t, { cacheVersion: 4 }), db = new DatabaseSync(f.filename);
    try {
      if (mode === "view") db.exec("CREATE VIEW unexpected AS SELECT 1 AS value");
      if (mode === "trigger") db.exec("CREATE TRIGGER unexpected AFTER INSERT ON state BEGIN SELECT 1; END");
      if (mode === "column") db.exec("ALTER TABLE normal_media ADD COLUMN unexpected TEXT");
      if (mode === "foreign-key") {
        const sql = db.prepare("SELECT sql FROM sqlite_schema WHERE name='normal_media'").get().sql;
        db.exec(`DROP TABLE normal_media; ${sql.replace(/\s+REFERENCES\s+bindings\s*\(\s*id\s*\)/i, "")};`);
      }
      if (mode === "version") db.exec("PRAGMA user_version=5");
    } finally { db.close(); }
    await assert.rejects(f.prepare(), /Cacheformat|SQLite-Version/);
  }
});

test("restore rechecks normal bytes, source receipt and contextual journal proof after outer hashes were rebound", async (t) => {
  for (const mode of ["bytes", "receipt", "normal-source", "proof", "omit-proof"]) {
    const f = await fixture(t, { cacheVersion: 4 }), normal = normalFixture(f.users[0]);
    saveNormalFixture(f, f.users[0], normal);
    const page = await addPageJournal(f, normal.asset, { normalAsset: normal.asset, gallery: false }), snapshot = await page.prepare(), { directory, options } = await page.restoreCopy(snapshot);
    const filename = path.join(directory, "project-cache.sqlite");
    if (["bytes", "receipt", "normal-source"].includes(mode)) {
      const db = new DatabaseSync(filename);
      try {
        if (mode === "bytes") db.exec("UPDATE normal_blobs SET data=zeroblob(bytes)");
        if (mode === "receipt") {
          const row = db.prepare("SELECT receipt_json FROM normal_media").get(), receipt = JSON.parse(row.receipt_json); receipt.userId = "another-user";
          db.prepare("UPDATE normal_media SET receipt_json=?").run(canonicalJson(receipt));
        }
        if (mode === "normal-source") db.exec("UPDATE normal_media SET source_revision='not-a-server-revision'");
      } finally { db.close(); }
    }
    await rebindManifest(directory, async manifest => {
      const bytes = await fs.readFile(filename), cache = manifest.files.find(entry => entry.id === "cache"); cache.bytes = bytes.length; cache.sha256 = sha(bytes);
      const journal = manifest.files.find(entry => entry.id === "authoring").journalMedia;
      if (mode === "proof") { journal.scopedRequiredMedia[0].domain = "external"; journal.scopedRequiredMedia[0].slot = null; }
      if (mode === "omit-proof") delete manifest.files.find(entry => entry.id === "authoring").journalMedia;
    });
    await assert.rejects(validateDeviceBackupCopy(options));
  }
});

test("historical v1 page proof hashes remain readable for a real v3 cache and scoped image receipt", async (t) => {
  const f = await fixture(t, { cacheVersion: 3 }), bytes = createTestPng(24, 16), asset = await inspectClientImage(bytes, { projectId: f.users[0].projectId });
  f.store.media.rememberRemote(f.users[0].id, asset);
  const page = await addPageJournal(f, asset), snapshot = await page.prepare(), { directory, options } = await page.restoreCopy(snapshot);
  await rebindManifest(directory, manifest => { const record = manifest.files.find(entry => entry.id === "authoring"); record.journalMedia = legacyPageJournalMedia(record.journalMedia); });
  assert.equal((await validateDeviceBackupCopy(options)).ok, true);
});

test("historical v1 normal-imageUUID proof rechecks actual cache3 image bytes without changing new normal-domain evidence", async (t) => {
  for (const wrongSource of [false, true]) {
    const f = await fixture(t, { cacheVersion: 3 }), normal = normalFixture(f.users[0], { id: "image-00000000-0000-4000-8000-000000000001" });
    const image = { ...await inspectClientImage(normal.buffer, { projectId: normal.asset.projectId, attribution: normal.asset.attribution }), id: normal.asset.id };
    f.store.media.save(f.users[0].id, image, normal.buffer);
    const page = await addPageJournal(f, normal.asset, { normalAsset: normal.asset }), before = await f.originalHashes();
    const snapshot = await page.prepare(), { directory, options } = await page.restoreCopy(snapshot);
    const cacheFilename = path.join(directory, "project-cache.sqlite");
    const originalManifest = JSON.parse(await fs.readFile(path.join(directory, "device-backup-manifest.json"), "utf8"));
    const fresh = originalManifest.files.find(entry => entry.id === "authoring").journalMedia;
    assert.equal(fresh.schemaVersion, 2); assert.equal(fresh.evidence[0].storage, "external-reference");
    await rebindManifest(directory, manifest => {
      const record = manifest.files.find(entry => entry.id === "authoring"), { evidence, ...source } = record.journalMedia;
      record.journalMedia = legacyPageJournalMedia(source);
      record.journalMedia.evidence = validatePageMediaBackup({ caches: [{ id: "cache", filename: cacheFilename }],
        requirements: record.journalMedia.scopedRequiredMedia, legacyCacheOnly: true });
      assert.equal(record.journalMedia.evidence[0].storage, "local-bytes");
    });
    if (wrongSource) {
      const db = new DatabaseSync(cacheFilename);
      try {
        const row = db.prepare("SELECT metadata_json FROM image_media WHERE id=?").get(image.id), metadata = JSON.parse(row.metadata_json);
        metadata.attribution = "Andere gültige Cachequelle, nicht die historische Journalquelle";
        db.prepare("UPDATE image_media SET metadata_json=? WHERE id=?").run(canonicalJson(metadata), image.id);
      } finally { db.close(); }
      await rebindManifest(directory, async manifest => { const bytes = await fs.readFile(cacheFilename), cache = manifest.files.find(entry => entry.id === "cache"); cache.bytes = bytes.length; cache.sha256 = sha(bytes); });
      await assert.rejects(validateDeviceBackupCopy(options), /Seitenentwurf fehlen/);
    } else assert.equal((await validateDeviceBackupCopy(options)).ok, true);
    assert.deepEqual(await f.originalHashes(), before);
  }
});

test("a page saved only in the core journal is cross-bound to included local bytes or a scoped remote-only receipt", async (t) => {
  for (const remote of [false, true]) {
    const f = await fixture(t), bytes = createTestPng(24, 16), asset = await inspectClientImage(bytes, { projectId: f.users[0].projectId, attribution: "Kernfassung ohne Queue" });
    if (remote) f.store.media.rememberRemote(f.users[0].id, asset); else f.store.media.save(f.users[0].id, asset, bytes);
    const page = await addPageJournal(f, asset), snapshot = await page.prepare(), { options, directory } = await page.restoreCopy(snapshot);
    await validateDeviceBackupCopy(options);
    const manifest = JSON.parse(await fs.readFile(path.join(directory, "device-backup-manifest.json"), "utf8")), journal = manifest.files.find((entry) => entry.id === "authoring").journalMedia;
    assert.equal(journal.scopedRequiredMedia[0].origin, f.users[0].baseUrl); assert.equal(journal.scopedRequiredMedia[0].actorId, f.users[0].userId);
    assert.equal(journal.scopedRequiredMedia[0].asset.attribution, asset.attribution);
    assert.equal(journal.evidence[0].storage, remote ? "remote-backed" : "local-bytes"); assert.equal(journal.evidence[0].localBytesIncluded, !remote);
    assert.equal(journal.evidence[0].serverBytesIncluded, false); assert.equal(journal.evidence[0].requiredServerMedia, remote);
  }
});

test("core-only managed images cannot lose their source row, bytes, attribution, Origin or person while both SQLite files remain valid", async (t) => {
  for (const mode of ["empty-cache", "source-row", "attribution", "hash", "bytes", "mime", "origin", "person", "legacy-remote"]) {
    const f = await fixture(t), bytes = createTestPng(24, 16), asset = await inspectClientImage(bytes, { projectId: f.users[0].projectId, attribution: "Ursprüngliche Quelle" });
    if (mode === "legacy-remote") f.store.media.rememberRemote(f.users[0].id, asset); else f.store.media.save(f.users[0].id, asset, bytes);
    const changed = { ...asset, ...(mode === "attribution" ? { attribution: "Andere Quelle" } : {}), ...(mode === "hash" ? { sha256: "f".repeat(64) } : {}),
      ...(mode === "bytes" ? { bytes: asset.bytes + 1 } : {}), ...(mode === "mime" ? { mimeType: "image/jpeg" } : {}) };
    const page = await addPageJournal(f, changed,
      { ...(mode === "origin" ? { origin: "https://other-origin.invalid" } : {}), ...(mode === "person" ? { actorId: "another-person" } : {}), legacy: mode === "legacy-remote" });
    if (["empty-cache", "source-row"].includes(mode)) {
      if (mode === "source-row") f.store.media.save(f.users[0].id, { ...asset, id: `image-00000000-0000-4000-8000-000000000001`, attribution: "Eigenständiger anderer Beleg" }, bytes);
      const db = new DatabaseSync(f.filename); try { db.prepare("DELETE FROM image_media WHERE id=?").run(asset.id); if (mode === "empty-cache") db.exec("DELETE FROM image_blobs"); } finally { db.close(); }
    }
    await assert.rejects(page.prepare(), /Seitenentwurf fehlen/);
  }
});

test("restore recomputes scoped page media evidence even after manifest and cache hashes have been rebound", async (t) => {
  for (const mode of ["missing-cache", "omit-proof", "wrong-scope", "pretend-remote"]) {
    const f = await fixture(t), bytes = createTestPng(24, 16), asset = await inspectClientImage(bytes, { projectId: f.users[0].projectId }); f.store.media.save(f.users[0].id, asset, bytes);
    const page = await addPageJournal(f, asset), snapshot = await page.prepare(), { directory, options } = await page.restoreCopy(snapshot);
    if (mode === "missing-cache") {
      const filename = path.join(directory, "project-cache.sqlite"), db = new DatabaseSync(filename);
      try { db.exec("DELETE FROM image_media; DELETE FROM image_blobs;"); } finally { db.close(); }
      await rebindManifest(directory, async (manifest) => { const cache = manifest.files.find((entry) => entry.id === "cache"), bytes = await fs.readFile(filename);
        cache.bytes = bytes.length; cache.sha256 = sha(bytes); cache.media = { localImageBytes: 0, localBlobCount: 0, remoteBacked: [] }; });
    } else await rebindManifest(directory, (manifest) => {
      const page = manifest.files.find((entry) => entry.id === "authoring");
      if (mode === "omit-proof") delete page.journalMedia;
      if (mode === "wrong-scope") page.journalMedia.scopedRequiredMedia[0].actorId = "someone-else";
      if (mode === "pretend-remote") page.journalMedia.evidence[0].storage = "remote-backed";
    });
    await assert.rejects(validateDeviceBackupCopy(options), /Seitenentwurf fehlen|Artseitenbild/);
  }
});

test("legacy page history can retain real local bytes without gaining an implicit remote owner, and old no-image manifests remain valid", async (t) => {
  const f = await fixture(t), bytes = createTestPng(24, 16), asset = await inspectClientImage(bytes, { projectId: f.users[0].projectId }); f.store.media.save(f.users[0].id, asset, bytes);
  const page = await addPageJournal(f, asset, { legacy: true }), snapshot = await page.prepare(), { options, directory } = await page.restoreCopy(snapshot);
  await validateDeviceBackupCopy(options); const manifest = JSON.parse(await fs.readFile(path.join(directory, "device-backup-manifest.json"), "utf8")), proof = manifest.files.find((entry) => entry.id === "authoring").journalMedia;
  assert.equal(proof.scopedRequiredMedia[0].origin, null); assert.equal(proof.scopedRequiredMedia[0].actorId, null); assert.equal(proof.evidence[0].storage, "local-bytes");
  const g = await fixture(t), noImages = await addPageJournal(g), oldSnapshot = await noImages.prepare(), restored = await noImages.restoreCopy(oldSnapshot);
  await rebindManifest(restored.directory, (manifest) => { delete manifest.files.find((entry) => entry.id === "authoring").journalMedia; });
  assert.equal((await validateDeviceBackupCopy(restored.options)).ok, true);
});

test("v3 snapshot or restore cannot silently lose local bytes or forge the remote-only completion receipt", async (t) => {
  for (const mode of ["bytes", "receipt", "manifest"]) {
    const f = await fixture(t), bytes = createTestPng(24, 16), metadata = await inspectClientImage(bytes, { projectId: f.users[0].projectId });
    if (mode === "bytes") f.store.media.save(f.users[0].id, metadata, bytes); else f.store.media.rememberRemote(f.users[0].id, metadata);
    if (mode === "manifest") {
      const snapshot = await f.prepare(), { options, directory } = await f.restoreCopy(snapshot);
      const filename = path.join(directory, "device-backup-manifest.json"), manifest = JSON.parse(await fs.readFile(filename, "utf8"));
      manifest.files.find((file) => file.id === "cache").media.remoteBacked = [];
      manifest.stateHash = sha(canonicalJson({ deviceId: manifest.deviceId, projectIds: manifest.projectIds, files: manifest.files }, { maxBytes: 8 * 1024 * 1024, maxNodes: 300000 }));
      await fs.writeFile(filename, JSON.stringify(manifest)); await assert.rejects(validateDeviceBackupCopy(options), /Bildbelege/);
    } else {
      const db = new DatabaseSync(f.filename);
      try { if (mode === "bytes") db.prepare("UPDATE image_blobs SET data=?").run(Buffer.alloc(bytes.length)); else db.exec("UPDATE image_media SET receipt_json=NULL"); }
      finally { db.close(); }
      await assert.rejects(f.prepare());
    }
  }
});

const stagedObject = (id, values = {}) => ({ kind: "page", id, revision: "1f06d5a3-2668-48b3-9b58-6f5eb410c3b1", ordinal: 1,
  data: { title: `Staged ${id}` }, authorId: "fixture-user", approval: "draft", approvedRevision: null, ...values });

test("cache v2 snapshots preserve incomplete invisible pull stages and pending work without promoting anything", async (t) => {
  const f = await fixture(t, { cacheVersion: 2 }), snapshotHash = "c".repeat(64), pullId = f.store.beginPull(f.users[0].id, { snapshot: snapshotHash, totalCount: 3 });
  f.store.stagePull(pullId, { snapshot: snapshotHash, totalCount: 3, objects: [stagedObject("page-a"), stagedObject("page-z")] });
  assert.equal(f.store.get(f.users[0].id, "page", "page-a").data.title, "Offline project-a");
  const before = await f.originalHashes(), snapshot = await f.prepare(), { options, directory } = await f.restoreCopy(snapshot);
  assert.equal(snapshot.summary.pending, 2); assert.equal((await validateDeviceBackupCopy(options)).pending, 2);
  const restoredFile = path.join(directory, "project-cache.sqlite"), probe = new DatabaseSync(restoredFile, { readOnly: true });
  assert.equal(probe.prepare("PRAGMA user_version").get().user_version, 2);
  assert.equal(probe.prepare("SELECT count(*) AS n FROM pulls").get().n, 1);
  assert.equal(probe.prepare("SELECT count(*) AS n FROM pull_objects").get().n, 2);
  assert.equal(probe.prepare("SELECT total_count FROM pulls").get().total_count, 3);
  assert.equal(probe.prepare("SELECT last_key FROM pulls").get().last_key, "page/page-z"); probe.close();
  const restored = createSharedProjectClientStore({ filename: restoredFile, localStorageConfirmed: true });
  try {
    assert.equal(restored.list(f.users[0].id).length, 1);
    assert.equal(restored.get(f.users[0].id, "page", "page-a").data.title, "Offline project-a");
    assert.throws(() => restored.get(f.users[0].id, "page", "page-z"), /nicht verfügbar/);
    assert.equal(restored.counts(f.users[0].id).pending, 1); assert.equal(restored.counts(f.users[0].id).otherProjectPending, 1);
    assert.throws(() => restored.finishPull(pullId, { snapshot: snapshotHash, totalCount: 3 }), /unvollständiger Bestand/);
  } finally { restored.close(); }
  assert.deepEqual(await f.originalHashes(), before);
});

test("empty v2 pull stages remain valid and do not count as unsent local changes", async (t) => {
  const f = await fixture(t, { cacheVersion: 2 });
  f.store.beginPull(f.users[0].id, { snapshot: "e".repeat(64), totalCount: 0 });
  f.store.beginPull(f.users[1].id, { snapshot: "f".repeat(64), totalCount: 10 });
  const snapshot = await f.prepare(); assert.equal(snapshot.summary.pending, 2);
  const { options } = await f.restoreCopy(snapshot); assert.equal((await validateDeviceBackupCopy(options)).pending, 2);
});

test("historical exact cache v1 remains readable without migration or source mutation", async (t) => {
  const f = await fixture(t, { cacheVersion: 2 }); f.store.close();
  const db = new DatabaseSync(f.filename); db.exec("DROP TABLE pull_objects; DROP TABLE pulls; PRAGMA user_version=1;"); db.close();
  // Keep the v1 WAL connection open, as the live profile service does, without
  // invoking today's client initializer (which correctly migrates it to v3).
  const reader = new DatabaseSync(f.filename, { readOnly: true }); reader.prepare("PRAGMA user_version").get();
  try {
    const before = await fs.readFile(f.filename), snapshot = await f.prepare(), { options, directory } = await f.restoreCopy(snapshot);
    assert.equal((await validateDeviceBackupCopy(options)).pending, 2);
    const copy = new DatabaseSync(path.join(directory, "project-cache.sqlite"), { readOnly: true });
    assert.equal(copy.prepare("PRAGMA user_version").get().user_version, 1); copy.close();
    assert.deepEqual(await fs.readFile(f.filename), before);
  } finally { reader.close(); }
});

test("cache versions keep exact table lists and exact v2 staging columns instead of accepting future formats", async (t) => {
  for (const sql of ["CREATE TABLE extra_state(value TEXT)", "ALTER TABLE pulls ADD COLUMN unreviewed TEXT",
    "PRAGMA user_version=1", "PRAGMA user_version=4", "DROP TABLE pull_objects"]) {
    const f = await fixture(t), db = new DatabaseSync(f.filename); db.exec(sql); db.close();
    await assert.rejects(f.prepare(), /Cacheformat|Abrufformat|SQLite-Version/);
  }
});

test("corrupt v2 stage identities, count/order, JSON and credentials fail the complete backup", async (t) => {
  const changes = [
    ["UPDATE pulls SET snapshot='unbound'", /Zwischenabruf/],
    ["UPDATE pulls SET last_key='page/wrong'", /Mengen-/],
    ["UPDATE pulls SET total_count=0", /Mengen-/],
    ["UPDATE pulls SET total_count=100001", /Zwischenabruf/],
    ["UPDATE pull_objects SET object_json='{broken'", /JSON|property|Unexpected|Expected/],
    ["UPDATE pull_objects SET object_json=?", /Abrufobjekt/, JSON.stringify(stagedObject("other-page"))],
    ["UPDATE pull_objects SET object_json=?", /Abrufobjekt/, JSON.stringify(stagedObject("page-a", { revision: "unknown-revision" }))],
    ["UPDATE pull_objects SET object_json=?", /Abrufobjekt/, JSON.stringify(stagedObject("page-a", { ordinal: 0 }))],
    ["UPDATE pull_objects SET object_json=?", /Anmeldedaten/, JSON.stringify(stagedObject("page-a", { data: { token: "fixture-secret" } }))],
    ["UPDATE pull_objects SET object_json=?", /groß/, JSON.stringify(stagedObject("page-a", { data: { title: "x".repeat(260 * 1024) } }))],
    ["UPDATE pulls SET binding_id='orphan-binding'", /nicht konsistent/],
  ];
  for (const [sql, expected, value] of changes) {
    const f = await fixture(t), snapshot = "c".repeat(64), pull = f.store.beginPull(f.users[0].id, { snapshot, totalCount: 2 });
    f.store.stagePull(pull, { snapshot, totalCount: 2, objects: [stagedObject("page-a")] });
    const db = new DatabaseSync(f.filename); db.exec("PRAGMA foreign_keys=OFF;");
    if (value) db.prepare(sql).run(value); else db.exec(sql); db.close();
    const before = await f.originalHashes(); await assert.rejects(f.prepare(), expected); assert.deepEqual(await f.originalHashes(), before);
  }
});

test("an unavailable project binding fails rather than overlooking otherProjectPending", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.prepare(undefined, { resolveProjectIds: async () => ["project-b"] }), /nicht gebundenen Projekt/);
  assert.deepEqual((await fs.readdir(f.session.root)).filter((entry) => entry !== ".fn-temp-session.json"), []);
});

test("malformed pending JSON and broken request binding fail the whole personal snapshot", async (t) => {
  const f = await fixture(t), db = new DatabaseSync(f.filename);
  db.prepare("UPDATE queue SET data_json=? WHERE seq=1").run("{broken");
  await assert.rejects(f.prepare(), /JSON|property|Unexpected|Expected/);
  db.prepare("UPDATE queue SET data_json=?,request_json=? WHERE seq=1").run('{"title":"Readable"}', JSON.stringify({ changeId: "other", kind: "page", id: "page-a", data: { title: "Readable" } })); db.close();
  await assert.rejects(f.prepare(), /Anfragebindung/);
});

test("malformed import payload hashes and unknown SQLite versions are not green", async (t) => {
  const f = await fixture(t, { journal: true }), db = new DatabaseSync(path.join(f.profileRoot, "initial-import.sqlite"));
  db.prepare("UPDATE items SET target_json=?").run('{"title":"Changed behind the journal"}'); db.close();
  await assert.rejects(f.prepare(), /Importauftrag/);
  const cache = new DatabaseSync(f.filename); cache.exec("PRAGMA user_version=99"); cache.close();
  await assert.rejects(f.prepare(), /SQLite-Version/);
});

async function workingJournalFixture(t) {
  const f = await fixture(t, { journal: true, journalVersion: 2 });
  const assetName = "Fixture Art (gebunden)", assetsRoot = path.join(f.root, "working-assets");
  await fs.mkdir(path.join(assetsRoot, assetName), { recursive: true });
  await fs.writeFile(path.join(assetsRoot, assetName, "map.jpg"), "Synthetic fixture map bytes");
  const built = await buildSpeciesWorkingRecords({
    speciesList: [{ german: "Eigener Anzeigename", genus: "Strix", species: "fixture", unknown: { retained: true } }],
    speciesData: [{ URLSlug: "species-a", Genus: "Strix", Species: "fixture" }],
    catalog: { schemaVersion: 1, revision: "fixture", generatedAt: "2026-11-01T00:00:00.000Z", species: [publicTarget()] },
    assetOverrides: { version: 1, assets: {} }, taxonomyOverrides: { version: 1, species: {} }, assessmentBindings: {},
    bindings: [{ id: "species-a", assetName, generalSectionId: null, embeddedGeneralText: null }], assetsRoot,
  });
  assert.equal(built.complete, true);
  const evidence = { sources: built.sources, evidence: built.evidence }, target = built.records[0];
  const filename = path.join(f.profileRoot, "initial-import.sqlite"), db = new DatabaseSync(filename);
  db.prepare("UPDATE plans SET source_hash=?").run(workingSourceHash(evidence));
  db.prepare("UPDATE items SET name=?,target_json=?,target_hash=?").run(target.input.german, JSON.stringify(target), sha(canonicalJson(target)));
  db.prepare("UPDATE source_bindings SET kind='working-records',evidence_json=?").run(JSON.stringify(evidence)); db.close();
  return { ...f, journalFilename: filename, evidence, target };
}
const workingSourceHash = (evidence) => sha(canonicalJson({ kind: "working-records", version: 1, ...evidence }, { maxBytes: 8 * 1024 * 1024, maxNodes: 300000 }));
function changeJournal(f, sql, ...values) {
  const db = new DatabaseSync(f.journalFilename || path.join(f.profileRoot, "initial-import.sqlite"));
  try { db.exec("PRAGMA foreign_keys=OFF;"); if (values.length) db.prepare(sql).run(...values); else db.exec(sql); }
  finally { db.close(); }
}

test("exact import journals v1 and v2 public sources remain readable without migration", async (t) => {
  for (const journalVersion of [1, 2]) {
    const f = await fixture(t, { journal: true, journalVersion }), filename = path.join(f.profileRoot, "initial-import.sqlite");
    const before = await fs.readFile(filename), snapshot = await f.prepare(), { options, directory } = await f.restoreCopy(snapshot);
    assert.equal(snapshot.summary.pending, 3);
    assert.equal((await validateDeviceBackupCopy(options)).pending, 3);
    const db = new DatabaseSync(path.join(directory, "initial-import.sqlite"), { readOnly: true });
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, journalVersion); db.close();
    assert.deepEqual(await fs.readFile(filename), before);
  }
});

test("v2 working import evidence and full targets survive backup and separate restore inspection", async (t) => {
  const f = await workingJournalFixture(t), before = await fs.readFile(f.journalFilename), snapshot = await f.prepare();
  const { options, directory } = await f.restoreCopy(snapshot);
  assert.equal((await validateDeviceBackupCopy(options)).pending, 3);
  const db = new DatabaseSync(path.join(directory, "initial-import.sqlite"), { readOnly: true });
  assert.deepEqual(JSON.parse(db.prepare("SELECT target_json FROM items").get().target_json), f.target);
  assert.deepEqual(JSON.parse(db.prepare("SELECT evidence_json FROM source_bindings").get().evidence_json), f.evidence); db.close();
  assert.deepEqual(await fs.readFile(f.journalFilename), before);
});

test("v2 journals keep public import history and working plans separately bound and accept a never-planned journal", async (t) => {
  const f = await workingJournalFixture(t), db = new DatabaseSync(f.journalFilename), target = publicTarget();
  db.prepare("INSERT INTO plans VALUES (?,?,?,?,?,'superseded',?,NULL)").run("historical-public", "project-b", "https://fixture.invalid", "a".repeat(64), 1, "2026-10-30T12:00:00Z");
  db.prepare("INSERT INTO items VALUES (?,?,?,?,?,'pending',NULL,NULL,NULL)").run("historical-public", target.id, target.commonName, JSON.stringify(target), sha(canonicalJson(target)));
  db.prepare("INSERT INTO source_bindings VALUES (?,'public-catalog',1,'{}')").run("historical-public"); db.close();
  const snapshot = await f.prepare(), restored = await f.restoreCopy(snapshot);
  assert.equal(snapshot.summary.pending, 3); assert.equal((await validateDeviceBackupCopy(restored.options)).pending, 3);

  const empty = await fixture(t, { journal: true, journalVersion: 2 });
  changeJournal(empty, "DELETE FROM items; DELETE FROM source_bindings; DELETE FROM plans;");
  const emptySnapshot = await empty.prepare(), emptyRestore = await empty.restoreCopy(emptySnapshot);
  assert.equal(emptySnapshot.summary.pending, 2); assert.equal((await validateDeviceBackupCopy(emptyRestore.options)).pending, 2);
});

test("v2 import journals reject unknown tables, columns, missing foreign keys and missing plan bindings", async (t) => {
  for (const sql of [
    "CREATE TABLE unknown_state(value TEXT)", "CREATE VIEW unknown_view AS SELECT id FROM plans",
    "ALTER TABLE source_bindings ADD COLUMN unknown TEXT", "ALTER TABLE items ADD COLUMN unknown TEXT",
    "ALTER TABLE plans ADD COLUMN unknown TEXT", "ALTER TABLE receipts ADD COLUMN unknown TEXT", "ALTER TABLE lease ADD COLUMN unknown TEXT",
    "DROP TABLE source_bindings", "DELETE FROM source_bindings", "PRAGMA user_version=3",
    "INSERT INTO source_bindings VALUES (NULL,'public-catalog',1,'{}')",
    "UPDATE source_bindings SET plan_id='orphan-plan'", "UPDATE items SET plan_id='orphan-plan'",
    "INSERT INTO receipts(plan_id,operation,phase,created_at) VALUES ('orphan-plan','plan','prepared','2026-11-01')",
    "ALTER TABLE source_bindings RENAME TO old_bindings; CREATE TABLE source_bindings(plan_id TEXT PRIMARY KEY,kind TEXT NOT NULL,version INTEGER NOT NULL,evidence_json TEXT NOT NULL); INSERT INTO source_bindings SELECT * FROM old_bindings; DROP TABLE old_bindings",
    "ALTER TABLE source_bindings RENAME TO old_bindings; CREATE TABLE source_bindings(plan_id TEXT PRIMARY KEY REFERENCES plans(id),kind TEXT NOT NULL,version TEXT NOT NULL,evidence_json TEXT NOT NULL); INSERT INTO source_bindings SELECT * FROM old_bindings; DROP TABLE old_bindings",
  ]) {
    await t.test(sql.split(";")[0], async (t) => {
      const f = await fixture(t, { journal: true, journalVersion: 2 }); changeJournal(f, sql);
      await assert.rejects(f.prepare(), /Import|SQLite|konsistent/);
    });
  }
});

test("v2 import journals reject unknown source kinds, versions, public fields and target bindings", async (t) => {
  const mutations = [
    ["UPDATE source_bindings SET kind='future-source'"], ["UPDATE source_bindings SET version=2"],
    ["UPDATE source_bindings SET evidence_json=?", '{"unknown":true}'],
    ["UPDATE source_bindings SET evidence_json=?", '[]'],
    ["UPDATE plans SET source_hash='not-a-hash'"],
    ["UPDATE items SET id='different-species'"],
    ["UPDATE items SET target_json=?,target_hash=?", '{"title":"Unknown public payload"}', sha(canonicalJson({ title: "Unknown public payload" }))],
  ];
  for (const [sql, ...values] of mutations) {
    const f = await fixture(t, { journal: true, journalVersion: 2 }); changeJournal(f, sql, ...values);
    await assert.rejects(f.prepare(), /Import|Quell|Katalog|Artkennung/);
  }
});

test("v2 working journals reject inconsistent source, record, identity and file evidence even after outer hashes are rebound", async (t) => {
  for (const mutation of [
    (e) => { e.unknown = true; },
    (e) => { e.sources.unknown = e.sources.catalog; },
    (e) => { e.sources.speciesList.sha256 = "not-a-hash"; },
    (e) => { e.evidence[0].id = "different-species"; },
    (e) => { e.evidence[0].assetName = "Different assets"; },
    (e) => { e.evidence[0].input.sha256 = "0".repeat(64); },
    (e) => { e.evidence[0].generated.bytes++; },
    (e) => { e.evidence[0].record.sha256 = "0".repeat(64); },
    (e) => { e.evidence[0].files[0].sha256 = "0".repeat(64); },
    (e) => { e.evidence[0].files[0].bytes++; },
    (e) => { e.evidence[0].files[0].filename = "other.jpg"; },
    (e) => { e.evidence[0].files.pop(); },
    (e) => { e.evidence.push(structuredClone(e.evidence[0])); },
  ]) {
    const f = await workingJournalFixture(t), evidence = structuredClone(f.evidence); mutation(evidence);
    changeJournal(f, "UPDATE source_bindings SET evidence_json=?", JSON.stringify(evidence));
    changeJournal(f, "UPDATE plans SET source_hash=?", workingSourceHash(evidence));
    await assert.rejects(f.prepare(), /Import|Quell|Beleg|Arbeits|Art|Datei/);
  }
  const hashChanged = await workingJournalFixture(t);
  changeJournal(hashChanged, "UPDATE plans SET source_hash=?", "0".repeat(64));
  await assert.rejects(hashChanged.prepare(), /Import|Quell|Beleg|Arbeits/);
  const targetChanged = await workingJournalFixture(t), target = structuredClone(targetChanged.target);
  target.input.german = "Ungebundene Änderung";
  changeJournal(targetChanged, "UPDATE items SET target_json=?,target_hash=?", JSON.stringify(target), sha(canonicalJson(target)));
  await assert.rejects(targetChanged.prepare(), /Import|Quell|Beleg|Arbeits/);
});

test("v2 skipped entries retain source evidence while preserving the different existing server hash", async (t) => {
  for (const kind of ["public-catalog", "working-records"]) {
    const f = kind === "working-records" ? await workingJournalFixture(t) : await fixture(t, { journal: true, journalVersion: 2 });
    changeJournal(f, "UPDATE items SET state='skipped',target_hash=?,expected_revision='existing-revision'", "f".repeat(64));
    const snapshot = await f.prepare(), { options } = await f.restoreCopy(snapshot);
    assert.equal(snapshot.summary.pending, 2); assert.equal((await validateDeviceBackupCopy(options)).pending, 2);
  }
});

test("v2 backup rejects a skipped item relabeled created or approved without durable object receipts", async (t) => {
  for (const kind of ["public-catalog", "working-records"]) {
    for (const state of ["created", "approved"]) {
      const f = kind === "working-records" ? await workingJournalFixture(t) : await fixture(t, { journal: true, journalVersion: 2 });
      changeJournal(f, "UPDATE items SET state='skipped',expected_revision='existing-revision'");
      changeJournal(f, "UPDATE items SET state=?,intent_actor='fixture-admin',expected_approval=?", state, state === "approved" ? "existing-revision" : null);
      await assert.rejects(f.prepare(), (error) => error.code === "import_journal_drift" && error.status === 409);
    }
  }
});

test("v2 backups retain real creation and approval receipt stages while v1 keeps its explicit legacy reader", async (t) => {
  for (const state of ["create-intent", "created", "approve-intent", "approved"]) {
    const f = await fixture(t, { journal: true, journalVersion: 2 });
    const filename = path.join(f.profileRoot, "initial-import.sqlite"), db = new DatabaseSync(filename), revision = "created-revision";
    const add = db.prepare("INSERT INTO receipts(plan_id,object_id,operation,phase,revision,actor_id,created_at) VALUES ('plan-a','species-a',?,?,?,?, '2026-11-01T12:00:00Z')");
    db.prepare("UPDATE items SET state=?,intent_actor='fixture-admin',expected_revision=?,expected_approval=?")
      .run(state, state === "create-intent" ? null : revision, state === "approved" ? revision : null);
    add.run("create", "intent", null, "fixture-admin");
    if (state !== "create-intent") add.run("create", "recovered-confirmed", revision, "recovery-admin");
    if (["approve-intent", "approved"].includes(state)) add.run("approve", "intent", revision, "recovery-admin");
    if (state === "approved") add.run("approve", "recovered-confirmed", revision, "another-admin");
    db.close();
    const snapshot = await f.prepare(), { options } = await f.restoreCopy(snapshot), pending = state === "approved" ? 2 : 3;
    assert.equal(snapshot.summary.pending, pending); assert.equal((await validateDeviceBackupCopy(options)).pending, pending);
    if (state === "created") {
      changeJournal(f, "UPDATE receipts SET object_id='foreign-art'");
      await assert.rejects(f.prepare(), (error) => error.code === "import_journal_drift");
    }
  }
  const legacy = await fixture(t, { journal: true });
  changeJournal(legacy, "UPDATE items SET state='created',intent_actor='legacy-actor',expected_revision='legacy-revision'");
  const snapshot = await legacy.prepare(), { options } = await legacy.restoreCopy(snapshot);
  assert.equal((await validateDeviceBackupCopy(options)).pending, 3);
});

test("separate v2 restore inspection rejects a changed inner source hash even with a recomputed archive manifest", async (t) => {
  const f = await workingJournalFixture(t), snapshot = await f.prepare(), { options, directory } = await f.restoreCopy(snapshot);
  const filename = path.join(directory, "initial-import.sqlite"), db = new DatabaseSync(filename);
  db.prepare("UPDATE plans SET source_hash=?").run("0".repeat(64)); db.close();
  const manifestPath = path.join(directory, "device-backup-manifest.json"), manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const record = manifest.files.find((item) => item.id === "import"), bytes = await fs.readFile(filename);
  record.bytes = bytes.length; record.sha256 = sha(bytes);
  manifest.stateHash = sha(canonicalJson({ deviceId: manifest.deviceId, projectIds: manifest.projectIds, files: manifest.files }));
  await fs.writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(validateDeviceBackupCopy(options), /Import|Quell|Beleg|Arbeits/);
});

test("a corrupt active cache is preserved and cannot produce a successful full backup", async (t) => {
  const f = await fixture(t); f.store.close();
  await fs.writeFile(f.filename, "corrupted fixture database");
  const bytes = await fs.readFile(f.filename); await assert.rejects(f.prepare());
  assert.deepEqual(await fs.readFile(f.filename), bytes);
});

test("credential filenames, credential fields and unvalidated future formats are rejected", async (t) => {
  const f = await fixture(t);
  for (const spec of [{ id: "credentials", relativePath: "credentials/session.bin", kind: "json" },
    { id: "future", relativePath: "page-authoring.sqlite", kind: "sqlite" },
    { id: "escape", relativePath: "../device.json", kind: "device-profile" }]) {
    assert.throws(() => createDeviceBackupProvider({ ...f.config, files: [spec] }));
  }
  const db = new DatabaseSync(f.filename); db.prepare("UPDATE cache SET local_json=?").run('{"access_token":"fixture-only"}'); db.close();
  await assert.rejects(f.prepare(), /Anmeldedaten/);
});

test("missing required files and a mismatched device identity fail; optional never-created journals stay explicit", async (t) => {
  const f = await fixture(t), first = await f.prepare(); assert.equal(first.summary.fileCount, 2);
  await fs.writeFile(path.join(f.profileRoot, "device.json"), JSON.stringify({ schemaVersion: 1, id: OTHER, name: "Other" }));
  await assert.rejects(f.prepare(), /Gerätekennung/);
  await fs.unlink(path.join(f.profileRoot, "device.json")); await assert.rejects(f.prepare(), /ENOENT/);
});

test("a pre-aborted preparation cleans its own registered files and releases its operation", async (t) => {
  const f = await fixture(t), controller = new AbortController(); controller.abort(new Error("Fixture-Cancel"));
  await assert.rejects(f.prepare({ signal: controller.signal }), /Fixture-Cancel/);
  const manifest = JSON.parse(await fs.readFile(path.join(f.session.root, ".fn-temp-session.json"), "utf8"));
  assert.equal(manifest.operations, 0); assert.deepEqual((await fs.readdir(f.session.root)).filter((entry) => entry !== ".fn-temp-session.json"), []);
});

test("cancel after creating a partial SQLite target drains backup and removes only its own copies", async (t) => {
  const f = await fixture(t), controller = new AbortController(); let created = false;
  const tempSession = { ...f.session, async filePath(name, options) {
    const filename = await f.session.filePath(name, options);
    if (name.endsWith("-cache.sqlite")) { created = true; controller.abort(new Error("Cancel-partial-SQLite")); }
    return filename;
  } };
  await assert.rejects(f.prepare({ signal: controller.signal }, { tempSession }), /Cancel-partial-SQLite/);
  assert.equal(created, true);
  assert.deepEqual((await fs.readdir(f.session.root)).filter((entry) => entry !== ".fn-temp-session.json"), []);
  assert.equal(JSON.parse(await fs.readFile(path.join(f.session.root, ".fn-temp-session.json"), "utf8")).operations, 0);
});

test("linked profile files are rejected without reading another directory", async (t) => {
  const f = await fixture(t), linked = path.join(f.profileRoot, "linked"), target = path.join(f.root, "other-profile");
  await fs.mkdir(target); await fs.writeFile(path.join(target, "extra.json"), '{"fixture":true}');
  try { await fs.symlink(target, linked, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) {
    if (["EPERM", "EACCES"].includes(error.code)) { t.skip("Dieser Windows-Testkontext darf keine eigene Junction anlegen; keine Sicherheits-/Berechtigungsänderung vorgenommen."); return; }
    throw error;
  }
  try {
    await assert.rejects(f.prepare(undefined, { files: [{ id: "extra", relativePath: "linked/extra.json", kind: "json", required: true,
      validate: () => ({ projectIds: [], pending: 0 }) }] }), { message: `Verzeichnis-/Dateilink im Temp-Pfad: ${linked}` });
    assert.equal(await fs.readFile(path.join(target, "extra.json"), "utf8"), '{"fixture":true}');
  } finally { await fs.unlink(linked); }
});

test("an optional missing SQLite database with an orphan WAL cannot be silently omitted", async (t) => {
  const f = await fixture(t); await fs.writeFile(path.join(f.profileRoot, "initial-import.sqlite-wal"), "orphan fixture WAL");
  await assert.rejects(f.prepare(), /Datenbank fehlt/);
});

test("size limits fail closed and custom validators bind new explicit local SQLite formats", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.prepare(undefined, { maxTotalBytes: 1 }), /Größe/);
  const db = new DatabaseSync(path.join(f.profileRoot, "page-authoring.sqlite"));
  db.exec("CREATE TABLE draft(project_id TEXT NOT NULL, data_json TEXT NOT NULL)");
  db.prepare("INSERT INTO draft VALUES (?,?)").run("project-a", '{"title":"Only explicit fixture"}'); db.close();
  const files = [...backupSpecs, { id: "authoring", relativePath: "page-authoring.sqlite", kind: "sqlite", required: true,
    validate(copy, context) { assert.equal(context.deviceId, DEVICE); return { projectIds: copy.prepare("SELECT project_id FROM draft").all().map((row) => row.project_id), pending: 1 }; } }];
  const snapshot = await f.prepare(undefined, { files }); assert.equal(snapshot.summary.pending, 3);
  const { options } = await f.restoreCopy(snapshot); assert.equal((await validateDeviceBackupCopy({ ...options, files })).pending, 3);
});

test("generic personal JSON scanning quotes real column names and rejects a disguised BLOB before custom validation", async (t) => {
  for (const blob of [false, true]) {
    const f = await fixture(t), filename = path.join(f.profileRoot, "quoted-columns.sqlite"), db = new DatabaseSync(filename);
    try { db.exec('CREATE TABLE values_table("quoted""name_json" TEXT)'); db.prepare('INSERT INTO values_table VALUES (?)').run(blob ? Buffer.from('{"fixture":true}') : '{"fixture":true}'); }
    finally { db.close(); }
    let validated = 0;
    const files = [...backupSpecs, { id: "quoted", relativePath: "quoted-columns.sqlite", kind: "sqlite", required: true,
      validate() { validated++; return { projectIds: [], pending: 0 }; } }];
    if (blob) { await assert.rejects(f.prepare(undefined, { files }), /begrenzter Textwert/); assert.equal(validated, 0); }
    else { const snapshot = await f.prepare(undefined, { files }); assert.equal(snapshot.summary.fileCount, 3); assert.equal(validated, 1); }
  }
});

test("restore copies enforce device/project identity, hashes, known files and active-profile separation", async (t) => {
  const f = await fixture(t), snapshot = await f.prepare(), { options, directory } = await f.restoreCopy(snapshot);
  await assert.rejects(validateDeviceBackupCopy({ ...options, expectedDeviceId: OTHER }), /Bindung/);
  await assert.rejects(validateDeviceBackupCopy({ ...options, expectedProjectIds: ["project-a"] }), /Bindung/);
  await assert.rejects(validateDeviceBackupCopy({ ...options, expectedStateHash: "0".repeat(64) }), /ausgewählten geprüften Sicherungsstand/);
  await assert.rejects(validateDeviceBackupCopy({ ...options, directory: f.profileRoot }), /aktive Geräteprofil/);
  await fs.writeFile(path.join(directory, "credentials.bin"), "fixture");
  await assert.rejects(validateDeviceBackupCopy(options), /Zusatzdateien/); await fs.unlink(path.join(directory, "credentials.bin"));
  await fs.appendFile(path.join(directory, "project-cache.sqlite"), "changed");
  await assert.rejects(validateDeviceBackupCopy(options), /Prüfwerten/);
});
