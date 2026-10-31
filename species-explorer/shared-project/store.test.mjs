import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { fork } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { fixture, page, species } from "./test-fixtures.mjs";
import { createSharedProjectStore } from "./store.mjs";

const denied = (status, code) => (error) => error.status === status && (!code || error.code === code);
async function scoped(fn) { const f = fixture(); try { await fn(f); } finally { f.cleanup(); } }

test("bootstrap has no default account, requires confirmation/two admins, and is one-time", () => scoped(async (f) => {
  const store = f.open();
  await assert.rejects(store.login({ username: "admin", password: f.password }), denied(401));
  await assert.rejects(store.bootstrap({ confirmed: false, users: [] }), denied(400));
  await assert.rejects(store.bootstrap({ confirmed: true, users: [{ username: "fixture", displayName: "Fixture", password: f.password }] }), denied(400));
  await store.bootstrap({ confirmed: true, users: ["one", "two"].map((username) => ({ username, displayName: username, password: f.password })) });
  const login = await store.login({ username: "one", password: f.password });
  assert.equal(store.listUsers(login.token).filter((user) => user.role === "admin").length, 2);
  await assert.rejects(store.bootstrap({ confirmed: true, users: [{}, {}] }), denied(409, "already_bootstrapped"));
}));

test("password salts differ; only hashes, never raw tokens/passwords, are persisted", () => scoped(async (f) => {
  const { store, a } = await f.initialized();
  const login = await store.login({ username: a.user.username, password: f.password, deviceLabel: "Fixture device" });
  const db = new DatabaseSync(f.filename, { readOnly: true });
  try {
    const hashes = db.prepare("SELECT password_hash FROM users").all().map((row) => row.password_hash);
    assert.equal(new Set(hashes).size, 2);
    for (const hash of hashes) assert.match(hash, /^scrypt\$131072\$8\$1\$/);
    const values = JSON.stringify({ sessions: db.prepare("SELECT * FROM sessions").all(), devices: db.prepare("SELECT * FROM devices").all(), users: hashes });
    assert.ok(!values.includes(f.password) && !values.includes(login.token) && !values.includes(login.device.token));
  } finally { db.close(); }
}));

test("all four roles are enforced server-side; readers see only the last approved version", () => scoped(async (f) => {
  const { store, a } = await f.initialized(), tokens = {};
  for (const role of ["publisher", "contributor", "reader"]) {
    await store.createUser(a.token, { username: `fixture-${role}`, displayName: role, password: f.password, role });
    tokens[role] = (await store.login({ username: `fixture-${role}`, password: f.password })).token;
  }
  for (const role of Object.keys(tokens)) {
    assert.throws(() => store.listUsers(tokens[role]), denied(403));
    await assert.rejects(store.createUser(tokens[role], { username: "forged-admin", displayName: "X", password: f.password, role: "admin" }), denied(403));
  }
  assert.throws(() => store.createObject(tokens.reader, { kind: "page", id: "fixture", data: page() }), denied(403));
  const draft = store.createObject(tokens.contributor, { kind: "species", id: "fixture-owl", data: species() });
  assert.deepEqual(store.catalog(tokens.reader).species, []);
  assert.throws(() => store.getObject(tokens.reader, "species", draft.id), denied(404));
  assert.throws(() => store.approveObject(tokens.contributor, "species", draft.id, { expectedRevision: draft.revision }), denied(403));
  const approved = store.approveObject(tokens.publisher, "species", draft.id, { expectedRevision: draft.revision });
  assert.equal(approved.externalPublication, "not-performed");
  const updated = store.submitChange(tokens.contributor, { changeId: "next-description", kind: "species", id: draft.id, baseRevision: draft.revision, data: species(draft.id, "New draft") });
  assert.equal(store.getObject(tokens.reader, "species", draft.id).revision, draft.revision);
  assert.equal(store.getObject(tokens.publisher, "species", draft.id).revision, updated.object.revision);
  assert.equal(store.catalog(tokens.reader).species[0].sections[0].text, "Synthetic species text");
  assert.equal(store.catalog(tokens.reader).revision, "1");
  assert.throws(() => store.approveObject(a.token, "species", draft.id, { expectedRevision: draft.revision }), denied(409));
}));

test("blocking, role change and last-admin guard survive fresh sessions", () => scoped(async (f) => {
  const { store, a, b } = await f.initialized();
  const deviceLogin = await store.login({ username: b.user.username, password: f.password, deviceLabel: "Blocked fixture" });
  const changed = store.updateUser(a.token, b.user.id, { expectedVersion: 1, role: "reader" });
  assert.equal(changed.role, "reader");
  assert.throws(() => store.createObject(b.token, { kind: "page", id: "forbidden", data: page() }), denied(403));
  assert.throws(() => store.updateUser(a.token, a.user.id, { expectedVersion: 1, blocked: true }), denied(409, "last_admin"));
  assert.throws(() => store.updateUser(a.token, b.user.id, { expectedVersion: 1, blocked: true }), denied(409, "user_changed"));
  store.updateUser(a.token, b.user.id, { expectedVersion: changed.version, blocked: true });
  assert.throws(() => store.me(b.token), denied(401));
  assert.throws(() => store.refresh(deviceLogin.device.token), denied(401));
  await assert.rejects(store.login({ username: b.user.username, password: f.password }), denied(401));
}));

test("device refresh is read-only, revocable, expiring, and logout invalidates sessions", () => scoped(async (f) => {
  let clock = Date.now();
  const { store, a } = await f.initialized({ clock: () => clock });
  const login = await store.login({ username: a.user.username, password: f.password, deviceLabel: "Phone fixture" });
  const refreshed = store.refresh(login.device.token);
  assert.equal(store.me(refreshed.token).id, a.user.id);
  assert.throws(() => store.createObject(refreshed.token, { kind: "page", id: "phone-write", data: page() }), denied(403));
  assert.throws(() => store.refresh(login.token), denied(401));
  store.logout(login.token);
  assert.throws(() => store.me(login.token), denied(401));
  store.revokeDevice(a.token, login.device.id);
  assert.throws(() => store.refresh(login.device.token), denied(401));
  assert.throws(() => store.me(refreshed.token), denied(401));
  const timed = await store.login({ username: a.user.username, password: f.password, deviceLabel: "Expiry fixture" });
  clock += 13 * 60 * 60 * 1000;
  assert.throws(() => store.me(timed.token), denied(401));
  const afterSessionExpiry = store.refresh(timed.device.token);
  assert.ok(afterSessionExpiry.token);
  clock += 31 * 24 * 60 * 60 * 1000;
  assert.throws(() => store.refresh(timed.device.token), denied(401));
}));

test("persistent login throttling and password change invalidate old access", () => scoped(async (f) => {
  let clock = Date.now();
  const { store, a } = await f.initialized({ clock: () => clock });
  for (let attempt = 0; attempt < 5; attempt++) await assert.rejects(store.login({ username: a.user.username, password: "incorrect fixture" }), denied(401));
  const reopened = f.open({ clock: () => clock });
  await assert.rejects(reopened.login({ username: a.user.username, password: f.password }), denied(429));
  clock += 16 * 60 * 1000;
  const login = await reopened.login({ username: a.user.username, password: f.password, deviceLabel: "Password fixture" });
  await reopened.changePassword(login.token, { currentPassword: f.password, newPassword: `${f.password}-changed` });
  assert.throws(() => reopened.me(a.token), denied(401));
  assert.throws(() => reopened.refresh(login.device.token), denied(401));
  await assert.rejects(reopened.login({ username: a.user.username, password: f.password }), denied(401));
  assert.ok((await reopened.login({ username: a.user.username, password: `${f.password}-changed` })).token);
}));

test("object CAS is independent by object; stale drafts preserve both versions and retry identities", () => scoped(async (f) => {
  const { store, a, b } = await f.initialized(), second = f.open();
  const one = store.createObject(a.token, { kind: "page", id: "one", data: page("One") });
  const two = store.createObject(a.token, { kind: "page", id: "two", data: page("Two") });
  const change = { changeId: "same-offline-change", kind: "page", id: "one", baseRevision: one.revision, data: page("Server A") };
  assert.equal(store.submitChange(a.token, change).status, "applied");
  assert.equal(second.submitChange(b.token, { changeId: "other-object-change", kind: "page", id: "two", baseRevision: two.revision, data: page("B other page") }).status, "applied");
  const retry = second.submitChange(a.token, change);
  assert.equal(retry.replayed, true);
  assert.equal(retry.object.ordinal, 2);
  assert.throws(() => store.submitChange(a.token, { ...change, data: page("Different content same ID") }), denied(409, "change_id_reused"));
  const stale = { changeId: "offline-conflict", kind: "page", id: "one", baseRevision: one.revision, data: page("Offline B") };
  const result = second.submitChange(b.token, stale);
  assert.equal(result.status, "conflict");
  const conflict = store.getConflict(a.token, result.conflictId);
  assert.equal(conflict.base.title, "One"); assert.equal(conflict.current.title, "Server A"); assert.equal(conflict.proposed.title, "Offline B");
  assert.equal(second.submitChange(b.token, stale).conflictId, conflict.id);
  assert.equal(store.listConflicts(a.token).length, 1);
  assert.throws(() => store.submitChange(a.token, { ...change, changeId: "offline-new-object", id: "missing" }), denied(404, "object_not_found"));
}));

test("conflicts and idempotent acknowledgements survive restart; resolution is explicit and CAS protected", () => scoped(async (f) => {
  const { store, a, b } = await f.initialized();
  const original = store.createObject(a.token, { kind: "page", id: "restart", data: page("Original") });
  const first = { changeId: "restart-change-one", kind: "page", id: original.id, baseRevision: original.revision, data: page("Server") };
  const server = store.submitChange(a.token, first).object;
  const stale = { ...first, changeId: "restart-change-two", data: page("Offline") };
  const conflicted = store.submitChange(b.token, stale);
  store.close();
  const reopened = f.open();
  assert.equal(reopened.submitChange(a.token, first).replayed, true);
  assert.equal(reopened.getConflict(b.token, conflicted.conflictId).proposed.title, "Offline");
  assert.throws(() => reopened.resolveConflict(a.token, conflicted.conflictId, { expectedRevision: original.revision, strategy: "proposed" }), denied(409));
  const resolved = reopened.resolveConflict(a.token, conflicted.conflictId, { expectedRevision: server.revision, strategy: "merged", data: page("Merged decision") });
  assert.equal(resolved.object.data.title, "Merged decision");
  assert.equal(resolved.object.approval, "draft");
  assert.ok(reopened.getConflict(a.token, conflicted.conflictId).resolvedAt);
  assert.equal(reopened.getConflict(a.token, conflicted.conflictId).current.title, "Server");
  assert.throws(() => reopened.resolveConflict(a.token, conflicted.conflictId, { expectedRevision: resolved.object.revision, strategy: "current" }), denied(409, "conflict_resolved"));
}));

test("separate Node processes race on one object: one update and one durable conflict", () => scoped(async (f) => {
  const { store, a, b } = await f.initialized();
  const original = store.createObject(a.token, { kind: "page", id: "process-race", data: page("Original") });
  const workerFile = fileURLToPath(new URL("concurrency-worker.mjs", import.meta.url));
  const workers = [a, b].map(() => fork(workerFile, [f.root], { execArgv: ["--no-warnings"], windowsHide: true, stdio: ["ignore", "ignore", "pipe", "ipc"] }));
  let results;
  try {
    await Promise.all(workers.map(async (worker) => {
      const ready = await Promise.race([once(worker, "message"), once(worker, "exit").then(([code]) => { throw new Error(`Worker exited before ready: ${code}`); })]);
      assert.equal(ready[0].ready, true);
    }));
    const answers = workers.map((worker) => once(worker, "message"));
    const exits = workers.map((worker) => once(worker, "exit"));
    workers.forEach((worker, index) => worker.send({ token: [a, b][index].token,
      change: { changeId: `process-change-${index}`, kind: "page", id: original.id, baseRevision: original.revision, data: page(`Process ${index}`) } }));
    results = (await Promise.all(answers)).map(([message]) => message);
    for (const [code] of await Promise.all(exits)) assert.equal(code, 0);
  } finally {
    for (const worker of workers) if (worker.exitCode === null) { worker.kill(); await once(worker, "exit"); }
  }
  assert.deepEqual(results.map((message) => message.result?.status).sort(), ["applied", "conflict"]);
  assert.equal(store.getObject(a.token, "page", original.id).ordinal, 2);
  assert.equal(store.listConflicts(a.token).length, 1);
  assert.notEqual(store.listConflicts(a.token)[0].current.title, store.listConflicts(a.token)[0].proposed.title);
}));

test("SQLite storage requires an explicit local path, rejects links/UNC, and never discovers project data", () => {
  assert.throws(() => createSharedProjectStore({ filename: "relative.sqlite", localStorageConfirmed: true }), denied(400, "unsafe_storage"));
  assert.throws(() => createSharedProjectStore({ filename: "\\\\nas\\share\\project.sqlite", localStorageConfirmed: true }), denied(400, "unsafe_storage"));
  assert.throws(() => createSharedProjectStore({ filename: "C:\\not-created.sqlite" }), denied(400, "unsafe_storage"));
});

test("two actual processes editing different pages both succeed without a project-wide edit lock", () => scoped(async (f) => {
  const { store, a, b } = await f.initialized();
  const objects = ["independent-one", "independent-two"].map((id) => store.createObject(a.token, { kind: "page", id, data: page(id) }));
  const workerFile = fileURLToPath(new URL("concurrency-worker.mjs", import.meta.url));
  const workers = objects.map(() => fork(workerFile, [f.root], { execArgv: ["--no-warnings"], windowsHide: true, stdio: ["ignore", "ignore", "pipe", "ipc"] }));
  try {
    await Promise.all(workers.map((worker) => once(worker, "message")));
    const responses = workers.map((worker) => once(worker, "message")), exits = workers.map((worker) => once(worker, "exit"));
    workers.forEach((worker, index) => worker.send({ token: [a, b][index].token,
      change: { changeId: `independent-change-${index}`, kind: "page", id: objects[index].id,
        baseRevision: objects[index].revision, data: page(`Independent ${index}`) } }));
    const results = (await Promise.all(responses)).map(([message]) => message.result.status);
    assert.deepEqual(results, ["applied", "applied"]);
    for (const [code] of await Promise.all(exits)) assert.equal(code, 0);
    assert.equal(store.listConflicts(a.token).length, 0);
    for (const object of objects) assert.equal(store.getObject(a.token, "page", object.id).ordinal, 2);
  } finally {
    for (const worker of workers) if (worker.exitCode === null) { const exited = once(worker, "exit"); worker.kill(); await exited; }
  }
}));

test("a separate process holding SQLite's writer lock causes a bounded error; release permits original retry", () => scoped(async (f) => {
  const { store, a } = await f.initialized();
  const original = store.createObject(a.token, { kind: "page", id: "held-lock", data: page("Before") });
  const workerFile = fileURLToPath(new URL("lock-worker.mjs", import.meta.url));
  const worker = fork(workerFile, [f.root], { execArgv: ["--no-warnings"], windowsHide: true, stdio: ["ignore", "ignore", "pipe", "ipc"] });
  const change = { changeId: "held-lock-retry", kind: "page", id: original.id, baseRevision: original.revision, data: page("After") };
  try {
    assert.equal((await once(worker, "message"))[0].held, true);
    assert.throws(() => store.submitChange(a.token, change), denied(503, "project_busy"));
    assert.equal(store.getObject(a.token, "page", original.id).revision, original.revision);
    const exited = once(worker, "exit"); worker.send({ release: true });
    assert.equal((await exited)[0], 0);
    const result = store.submitChange(a.token, change);
    assert.equal(result.status, "applied");
    assert.equal(result.object.ordinal, 2);
    const reopened = f.open();
    assert.deepEqual(reopened.getObject(a.token, "page", original.id), result.object);
  } finally {
    if (worker.exitCode === null) { const exited = once(worker, "exit"); worker.kill(); await exited; }
  }
}));
