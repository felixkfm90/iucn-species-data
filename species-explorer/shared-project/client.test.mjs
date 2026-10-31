import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fork } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { fixture, page, species } from "./test-fixtures.mjs";
import { createSharedProjectHttp } from "./http.mjs";
import { createSharedProjectClient, createMemoryCredentialStore } from "./client.mjs";

const denied = (code) => (error) => error.code === code;
async function scoped(fn, { clock } = {}) {
  const f = fixture(), clients = [];
  let adapter;
  try {
    const initialized = await f.initialized(clock ? { clock } : {}), { store, a } = initialized;
    const original = store.createObject(a.token, { kind: "page", id: "fixture-page", data: page("Original") });
    store.approveObject(a.token, "page", original.id, { expectedRevision: original.revision });
    adapter = createSharedProjectHttp({ store });
    const address = await adapter.listen();
    function client(options = {}) {
      const value = createSharedProjectClient({ filename: path.join(f.root, "cache.sqlite"), localStorageConfirmed: true,
        allowLoopbackHttp: true, ...options }); clients.push(value); return value;
    }
    const connect = (value, baseUrl = address.url, password = f.password, username = a.user.username) => value.connect({ baseUrl, username, password });
    await fn({ f, ...initialized, original, adapter, address, client, connect });
  } finally {
    for (const value of clients) await value.close();
    if (adapter) await adapter.close();
    f.cleanup();
  }
}

test("desktop online connection/edit/sync returns no credentials and persists none in SQLite", () => scoped(async ({ f, store, a, original, client, connect }) => {
  const persisted = new Map(), credentialStore = { async get(key) { return persisted.get(key); },
    async set(key, value) { persisted.set(key, structuredClone(value)); }, async delete(key) { persisted.delete(key); } };
  const value = client({ credentialStore }), status = await connect(value);
  assert.equal(status.connection, "online"); assert.ok(status.projectId);
  assert.equal((await value.list()).length, 1);
  await value.editExistingObject("page", original.id, page("Desktop edit"));
  assert.equal((await value.status()).pending, 1);
  await value.sync();
  assert.equal((await value.status()).pending, 0);
  assert.equal(store.getObject(a.token, "page", original.id).data.title, "Desktop edit");
  const serialized = JSON.stringify([status, await value.status(), await value.list(), await value.listConflicts()]);
  const secrets = [...persisted.values()].flatMap((entry) => [entry.sessionToken, entry.deviceToken]).filter(Boolean);
  assert.ok(!serialized.includes(f.password));
  for (const secret of secrets) assert.ok(!serialized.includes(secret));
  await value.close();
  const bytes = fs.readFileSync(path.join(f.root, "cache.sqlite"));
  assert.ok(!bytes.includes(Buffer.from(f.password)));
  for (const secret of secrets) assert.ok(!bytes.includes(Buffer.from(secret)));
}));

test("offline existing edits coalesce safely and replay after reconnection; absent objects cannot be created", () => scoped(async ({ store, a, original, client, connect }) => {
  let offline = false;
  const value = client({ fetchImpl: async (...args) => { if (offline) throw new Error("synthetic unreachable network"); return fetch(...args); } });
  await connect(value); offline = true;
  await value.editExistingObject("page", original.id, page("First offline edit"));
  await value.editExistingObject("page", original.id, page("Second offline edit"));
  assert.equal((await value.status()).pending, 1);
  await assert.rejects(value.editExistingObject("page", "absent", page()), denied("object_not_cached"));
  await assert.rejects(value.sync(), denied("offline"));
  assert.equal((await value.getObject("page", original.id)).data.title, "Second offline edit");
  offline = false; await value.sync();
  assert.equal(store.getObject(a.token, "page", original.id).data.title, "Second offline edit");
  assert.equal(store.getObject(a.token, "page", original.id).ordinal, 2);
  assert.equal((await value.status()).pending, 0);
}));

test("lost response after committed write plus later edits survive restart and keep exact request identity", () => scoped(async ({ store, a, original, client, connect }) => {
  const credentials = createMemoryCredentialStore(), sent = [];
  let lose = true;
  const transport = async (url, options) => {
    const result = await fetch(url, options);
    if (url.endsWith("/changes")) {
      sent.push(options.body);
      if (lose) { lose = false; await result.text(); throw new Error("lost committed response"); }
    }
    return result;
  };
  const first = client({ credentialStore: credentials, fetchImpl: transport }); await connect(first);
  await first.editExistingObject("page", original.id, page("First committed"));
  await assert.rejects(first.sync(), denied("offline"));
  assert.equal(store.getObject(a.token, "page", original.id).ordinal, 2);
  await first.editExistingObject("page", original.id, page("Own follow-up one"));
  await first.editExistingObject("page", original.id, page("Own follow-up final"));
  assert.equal((await first.status()).pending, 2); await first.close();
  const reopened = client({ credentialStore: credentials, fetchImpl: transport });
  assert.equal((await reopened.status()).pending, 2);
  await reopened.sync();
  assert.equal(sent[0], sent[1]);
  assert.notEqual(JSON.parse(sent[1]).changeId, JSON.parse(sent[2]).changeId);
  assert.notEqual(JSON.parse(sent[1]).baseRevision, JSON.parse(sent[2]).baseRevision);
  assert.equal(store.getObject(a.token, "page", original.id).ordinal, 3);
  assert.equal(store.getObject(a.token, "page", original.id).data.title, "Own follow-up final");
  assert.equal((await reopened.listConflicts()).length, 0);
  assert.equal((await reopened.status()).pending, 0);
}));

test("foreign edits preserve server and local versions across restart and require deliberate conflict resolution", () => scoped(async ({ store, b, original, client, connect }) => {
  const credentials = createMemoryCredentialStore(), value = client({ credentialStore: credentials }); await connect(value);
  await value.editExistingObject("page", original.id, page("Local branch"));
  store.submitChange(b.token, { kind: "page", id: original.id, changeId: "foreign-change", baseRevision: original.revision, data: page("Foreign branch") });
  const status = await value.sync(); assert.equal(status.conflicts, 1);
  const conflict = (await value.listConflicts())[0];
  assert.equal(conflict.current.title, "Foreign branch"); assert.equal(conflict.proposed.title, "Local branch");
  await value.close();
  const reopened = client({ credentialStore: credentials });
  assert.equal((await reopened.listConflicts())[0].proposed.title, "Local branch");
  const resolved = await reopened.resolveConflict(conflict.id, { strategy: "merged", data: page("Human merged text") });
  assert.equal(resolved.data.title, "Human merged text");
  assert.equal((await reopened.status()).pending, 0); assert.equal((await reopened.status()).conflicts, 0);
  assert.equal(store.getConflict(b.token, conflict.id).resolution, "merged");
}));

test("follow-up drafts behind a genuine conflict are preserved and cannot silently undo a resolution", () => scoped(async ({ store, b, original, client, connect }) => {
  let blockChanges = true;
  const value = client({ fetchImpl: async (url, options) => {
    if (url.endsWith("/changes") && blockChanges) throw new Error("synthetic request uncertainty");
    return fetch(url, options);
  } }); await connect(value);
  await value.editExistingObject("page", original.id, page("Initial local version"));
  await assert.rejects(value.sync(), denied("offline"));
  await value.editExistingObject("page", original.id, page("Further local version"));
  store.submitChange(b.token, { kind: "page", id: original.id, changeId: "foreign-follow-up", baseRevision: original.revision, data: page("Foreign text") });
  blockChanges = false; await value.sync();
  const conflict = (await value.listConflicts())[0]; assert.equal(conflict.localVersions.length, 2);
  await assert.rejects(value.resolveConflict(conflict.id, { strategy: "current" }), denied("followup_decision_required"));
  assert.equal((await value.status()).pending, 2);
  await value.resolveConflict(conflict.id, { strategy: "merged", data: page("All versions considered") });
  await value.sync();
  assert.equal((await value.status()).pending, 0); assert.equal((await value.status()).conflicts, 0);
  assert.equal(store.getObject(b.token, "page", original.id).data.title, "All versions considered");
}));

test("role loss and account blocking preserve pending work and remove access to unapproved cached drafts", () => scoped(async ({ store, a, b, original, client, connect }) => {
  const draft = store.createObject(a.token, { kind: "page", id: "unapproved-private", data: page("Unapproved") });
  const value = client(); await connect(value);
  await value.editExistingObject("page", draft.id, page("Unsent local work"));
  store.updateUser(b.token, a.user.id, { expectedVersion: 1, role: "reader" });
  await assert.rejects(value.sync(), denied("forbidden"));
  assert.equal((await value.status()).pending, 1);
  assert.deepEqual((await value.list()).map((entry) => entry.id), [original.id]);
  await assert.rejects(value.getObject("page", draft.id), denied("object_not_cached"));
  await assert.rejects(value.editExistingObject("page", original.id, page()), denied("forbidden"));
  store.updateUser(b.token, a.user.id, { expectedVersion: 2, blocked: true });
  await assert.rejects(value.sync(), denied("authentication_required"));
  assert.equal((await value.status()).pending, 1); assert.equal((await value.status()).connection, "authentication-required");
  assert.deepEqual(await value.list(), []);
}));

test("session refresh is honestly read-only; desktop writes wait for full login", async () => {
  let clock = Date.now();
  await scoped(async ({ store, a, original, client, connect }) => {
    const value = client(); await connect(value);
    await value.editExistingObject("page", original.id, page("Awaiting renewed login"));
    clock += 13 * 60 * 60 * 1000;
    await assert.rejects(value.sync(), denied("forbidden"));
    assert.equal((await value.status()).readOnlySession, true); assert.equal((await value.status()).pending, 1);
    await connect(value); await value.sync();
    assert.equal((await value.status()).pending, 0);
    const currentLogin = await store.login({ username: a.user.username, password: "wrong fixture" }).catch(() => null);
    assert.equal(currentLogin, null);
  }, { clock: () => clock });
});

test("server/project switch never sends another project's pending edits or credentials", () => scoped(async ({ f, store, a, original, client, connect, address }) => {
  const other = fixture(); let adapter;
  try {
    const second = await other.initialized();
    const secondObject = second.store.createObject(second.a.token, { kind: "page", id: original.id, data: page("Different project") });
    adapter = createSharedProjectHttp({ store: second.store }); const target = await adapter.listen();
    const sent = [], value = client({ fetchImpl: async (url, options) => { if (url.endsWith("/changes")) sent.push(url); return fetch(url, options); } });
    const firstStatus = await connect(value);
    await value.editExistingObject("page", original.id, page("First project's pending draft"));
    const secondStatus = await value.connect({ baseUrl: target.url, username: second.a.user.username, password: other.password });
    assert.notEqual(firstStatus.projectId, secondStatus.projectId); assert.equal(secondStatus.pending, 0); assert.equal(secondStatus.otherProjectPending, 1);
    assert.deepEqual(await value.backupProjectIds(), [firstStatus.projectId, secondStatus.projectId].sort());
    assert.equal((await value.getObject("page", original.id)).data.title, "Different project");
    await value.sync(); assert.equal(sent.length, 0);
    assert.equal(second.store.getObject(second.a.token, "page", original.id).revision, secondObject.revision);
    await value.connect({ baseUrl: address.url, username: a.user.username, password: f.password });
    assert.equal((await value.status()).pending, 1); await value.sync();
    assert.deepEqual(sent, [`${address.url}/api/v1/changes`]);
    assert.equal(store.getObject(a.token, "page", original.id).data.title, "First project's pending draft");
    await value.disconnect(); assert.deepEqual(await value.backupProjectIds(), [firstStatus.projectId, secondStatus.projectId].sort());
  } finally { if (adapter) await adapter.close(); other.cleanup(); }
}));

test("redirects never forward Bearer; nonlocal HTTP and unsafe URLs are rejected", () => scoped(async ({ client, connect, a, f }) => {
  let calls = 0, redirect = false;
  const value = client({ fetchImpl: async (url, options) => {
    calls++;
    if (redirect) { assert.equal(options.redirect, "manual"); return new Response("{}", { status: 302, headers: { Location: "https://untrusted.example.org/" } }); }
    return fetch(url, options);
  } }); await connect(value); const before = calls; redirect = true;
  await assert.rejects(value.sync(), denied("redirect_rejected")); assert.equal(calls, before + 1);
  for (const baseUrl of ["http://example.org/", "file:///C:/private", "https://user:password@example.org/", "https://example.org/path"]) {
    await assert.rejects(value.connect({ baseUrl, username: a.user.username, password: f.password }), denied("unsafe_server"));
  }
  const secureDefault = client({ filename: path.join(f.root, "secure-default.sqlite"), allowLoopbackHttp: false });
  await assert.rejects(connect(secureDefault), denied("unsafe_server"));
}));

test("close aborts an active request, joins writers, preserves uncertainty, and never recreates the cache", () => scoped(async ({ f, original, client, connect }) => {
  const credentials = createMemoryCredentialStore();
  let pendingResolve, release, block = false;
  const started = new Promise((resolve) => { pendingResolve = resolve; });
  const value = client({ credentialStore: credentials, fetchImpl: async (url, options) => {
    if (!block || !url.endsWith("/changes")) return fetch(url, options);
    pendingResolve();
    return new Promise((resolve, reject) => {
      release = () => resolve(new Response("{}", { status: 500 }));
      options.signal.addEventListener("abort", () => reject(new Error("synthetic aborted request")), { once: true });
    });
  } }); await connect(value);
  await value.editExistingObject("page", original.id, page("Still pending after close")); block = true;
  const sync = value.sync(); const rejected = assert.rejects(sync, denied("client_closed"));
  await started; await value.close(); await rejected;
  const filename = path.join(f.root, "cache.sqlite"), before = fs.readFileSync(filename);
  release(); await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(fs.readFileSync(filename), before);
  await assert.rejects(value.editExistingObject("page", original.id, page()), denied("client_closed"));
  await assert.rejects(value.status(), denied("client_closed"));
  const reopened = client({ credentialStore: credentials }); assert.equal((await reopened.status()).pending, 1);
  await reopened.sync(); assert.equal((await reopened.status()).pending, 0);
  const db = new DatabaseSync(filename, { readOnly: true });
  try { assert.equal(db.prepare("SELECT count(*) AS n FROM queue WHERE state='applied'").get().n, 1); } finally { db.close(); }
}));

test("a conflict resolved on another device stays explicit locally and can be rebased without losing drafts", () => scoped(async ({ store, b, original, client, connect }) => {
  const value = client(); await connect(value);
  await value.editExistingObject("page", original.id, page("Local version"));
  const changed = store.submitChange(b.token, { changeId: "other-device-change", kind: "page", id: original.id, baseRevision: original.revision, data: page("Other device") });
  await value.sync(); const conflict = (await value.listConflicts())[0];
  store.resolveConflict(b.token, conflict.id, { expectedRevision: changed.object.revision, strategy: "current" });
  await value.sync(); assert.ok((await value.listConflicts())[0].resolvedAt);
  await assert.rejects(value.resolveConflict(conflict.id, { strategy: "merged" }), denied("invalid_resolution"));
  assert.equal((await value.status()).pending, 1);
  await value.resolveConflict(conflict.id, { strategy: "merged", data: page("Explicit local rebase") });
  assert.equal((await value.status()).pending, 1);
  await value.sync(); assert.equal((await value.status()).pending, 0);
  assert.equal(store.getObject(b.token, "page", original.id).data.title, "Explicit local rebase");
}));

test("two actual desktop-client processes share a private credential facade and resume the persisted offline queue", () => scoped(async ({ f, a, store, address, original }) => {
  const credentials = new Map(), workerPath = fileURLToPath(new URL("client-worker.mjs", import.meta.url));
  async function invoke(command) {
    const child = fork(workerPath, [f.root], { execArgv: ["--no-warnings"], windowsHide: true, stdio: ["ignore", "ignore", "pipe", "ipc"] });
    const result = new Promise((resolve, reject) => {
      child.on("message", (message) => {
        if (message.rpc) {
          const { id, operation, key, value } = message.rpc;
          if (operation === "set") credentials.set(key, value);
          if (operation === "delete") credentials.delete(key);
          child.send({ reply: { id, value: operation === "get" ? credentials.get(key) ?? null : null } });
        } else if (message.ready) child.send({ command });
        else if (message.done) resolve(message.done);
        else if (message.failure) reject(new Error(`Synthetic client worker failed: ${message.failure.code}`));
      });
      child.once("error", reject);
      child.once("exit", (code) => { if (code !== 0) reject(new Error(`Synthetic client worker exit: ${code}`)); });
    });
    const exited = once(child, "exit");
    try { const value = await result; assert.equal((await exited)[0], 0); return value; }
    finally { if (child.exitCode === null) { child.kill(); await exited; } }
  }
  const before = await invoke({ mode: "edit", baseUrl: address.url, username: a.user.username, password: f.password });
  assert.equal(before.pending, 1);
  const after = await invoke({ mode: "sync" }); assert.equal(after.pending, 0);
  assert.equal(store.getObject(a.token, "page", original.id).data.title, "Process-persisted offline edit");
  assert.ok(!JSON.stringify([before, after]).includes(f.password));
}));

test("media attribution survives HTTP, desktop cache, editing, sync and approved catalog unchanged", () => scoped(async ({ store, a, client, connect }) => {
  const data = species(), attribution = "Synthetic author, CC BY-NC 4.0 — https://source.example.org/original";
  data.media.portrait = { id: "portrait-license", url: "https://media.example.org/portrait.webp", attribution };
  const created = store.createObject(a.token, { kind: "species", id: data.id, data });
  const value = client(); await connect(value);
  const cached = await value.getObject("species", created.id);
  assert.equal(cached.data.media.portrait.attribution, attribution);
  cached.data.commonName = "Updated fixture name";
  await value.editExistingObject("species", created.id, cached.data); await value.sync();
  const updated = store.getObject(a.token, "species", created.id);
  store.approveObject(a.token, "species", created.id, { expectedRevision: updated.revision });
  assert.equal(store.catalog(a.token).species[0].media.portrait.attribution, attribution);
}));

test("repeated full desktop sign-in reuses one device registration; disconnect revokes its persistent access", () => scoped(async ({ store, a, client, connect }) => {
  const value = client();
  await connect(value); await connect(value); await connect(value);
  const devices = store.devices(a.token); assert.equal(devices.length, 1);
  const disconnected = await value.disconnect(); assert.equal(disconnected.remoteLogoutConfirmed, true);
  assert.equal(store.devices(a.token)[0].revoked, true);
  assert.equal((await value.status()).connection, "disconnected");
  assert.deepEqual(await value.list(), []);
}));
