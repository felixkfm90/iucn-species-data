import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { createManagedTempSession } from "../temp-session.mjs";
import { createSharedProjectClientStore } from "./client-store.mjs";
import { createInitialProjectImport } from "./initial-import.mjs";
import { canonicalJson } from "./security.mjs";
import { createDeviceBackupProvider, validateDeviceBackupCopy } from "./device-backup.mjs";

const DEVICE = "device-ec2d31f7-0485-4a04-96c4-b40e233b126a";
const OTHER = "device-4aa7571e-6200-4647-b511-4707bed97ee6";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const backupSpecs = [
  { id: "device", relativePath: "device.json", kind: "device-profile", required: true },
  { id: "cache", relativePath: "project-cache.sqlite", kind: "client-cache", required: true },
  { id: "import", relativePath: "initial-import.sqlite", kind: "import-journal" },
];
async function fixture(t, { journal = false } = {}) {
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
  let importer;
  if (journal) {
    importer = createInitialProjectImport({ filename: path.join(profileRoot, "initial-import.sqlite"), localStorageConfirmed: true,
      service: { refresh() {}, create() {}, approve() {} }, readCatalog() {}, expectedSha256: "a".repeat(64) });
    const db = new DatabaseSync(path.join(profileRoot, "initial-import.sqlite"));
    const target = { title: "Noch nicht importiert" };
    db.prepare("INSERT INTO plans VALUES (?,?,?,?,?,'planned',?,NULL)").run("plan-a", "project-a", "https://fixture.invalid", "a".repeat(64), 1, "2026-10-31T12:00:00Z");
    db.prepare("INSERT INTO items VALUES (?,?,?,?,?,'pending',NULL,NULL,NULL)").run("plan-a", "species-a", "Fixture-Art", JSON.stringify(target), sha(canonicalJson(target)));
    db.close();
  }
  const snapshots = [];
  t.after(async () => {
    for (const snapshot of snapshots) await snapshot.dispose();
    await importer?.close(); store.close(); await session.close();
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

const stagedObject = (id, values = {}) => ({ kind: "page", id, revision: "1f06d5a3-2668-48b3-9b58-6f5eb410c3b1", ordinal: 1,
  data: { title: `Staged ${id}` }, authorId: "fixture-user", approval: "draft", approvedRevision: null, ...values });

test("cache v2 snapshots preserve incomplete invisible pull stages and pending work without promoting anything", async (t) => {
  const f = await fixture(t), snapshotHash = "c".repeat(64), pullId = f.store.beginPull(f.users[0].id, { snapshot: snapshotHash, totalCount: 3 });
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
  const f = await fixture(t);
  f.store.beginPull(f.users[0].id, { snapshot: "e".repeat(64), totalCount: 0 });
  f.store.beginPull(f.users[1].id, { snapshot: "f".repeat(64), totalCount: 10 });
  const snapshot = await f.prepare(); assert.equal(snapshot.summary.pending, 2);
  const { options } = await f.restoreCopy(snapshot); assert.equal((await validateDeviceBackupCopy(options)).pending, 2);
});

test("historical exact cache v1 remains readable without migration or source mutation", async (t) => {
  const f = await fixture(t); f.store.close();
  const db = new DatabaseSync(f.filename); db.exec("DROP TABLE pull_objects; DROP TABLE pulls; PRAGMA user_version=1;"); db.close();
  // Keep the v1 WAL connection open, as the live profile service does, without
  // invoking today's client initializer (which correctly migrates it to v2).
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
    "PRAGMA user_version=1", "PRAGMA user_version=3", "DROP TABLE pull_objects"]) {
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
      validate: () => ({ projectIds: [], pending: 0 }) }] }), /Verknüpfung|verknüpft|Umgeleitet/);
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
