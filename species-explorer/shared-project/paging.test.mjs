import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fixture, page } from "./test-fixtures.mjs";
import { createSharedProjectHttp } from "./http.mjs";
import { createSharedProjectClient, createMemoryCredentialStore } from "./client.mjs";

async function scoped(fn, count = 31, text = "synthetic") {
  const f = fixture(), clients = []; let http;
  try {
    const initialized = await f.initialized(), { store, a } = initialized;
    const objects = [];
    for (let i = 0; i < count; i++) objects.push(store.createObject(a.token, { kind: "page", id: `page-${String(i).padStart(3, "0")}`,
      data: { ...page(`Page ${i}`), text } }));
    store.approveObject(a.token, "page", objects[0].id, { expectedRevision: objects[0].revision });
    http = createSharedProjectHttp({ store }); const address = await http.listen();
    function client(options = {}) {
      const c = createSharedProjectClient({ filename: path.join(f.root, "cache.sqlite"), localStorageConfirmed: true,
        allowLoopbackHttp: true, ...options }); clients.push(c); return c;
    }
    const connect = (c, user = a.user) => c.connect({ baseUrl: address.url, username: user.username, password: f.password });
    await fn({ f, ...initialized, http, address, client, connect, objects });
  } finally { for (const c of clients) await c.close(); if (http) await http.close(); f.cleanup(); }
}
function rows(filename, query = "SELECT * FROM queue ORDER BY seq") {
  const db = new DatabaseSync(filename, { readOnly: true });
  try { return db.prepare(query).all().map(row => ({ ...row })); } finally { db.close(); }
}
const failure = code => error => error.code === code;

test("bounded HTTP pages cover a collection larger than 8MiB and stage one atomic cache without enlarging the legacy response", () => scoped(async ({ store, a, client, connect, f }) => {
  const pages = [];
  const c = client({ fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    if (url.includes("/objects/page?")) {
      const bytes = await response.clone().arrayBuffer(), body = await response.clone().json();
      assert.ok(bytes.byteLength <= 4 * 1024 * 1024); pages.push(body);
    }
    return response;
  } });
  await connect(c); assert.equal((await c.list()).length, 40);
  assert.ok(pages.length >= 4); assert.ok(pages.slice(0, -1).every(value => value.objects.length <= 25));
  assert.equal(pages.at(-1).checked, true); assert.equal(pages.at(-1).objects.length, 0);
  assert.throws(() => store.listObjects(a.token), failure("object_paging_required"));
  assert.equal(rows(path.join(f.root, "cache.sqlite"), "SELECT count(*) AS n FROM pulls")[0].n, 0);
}, 40, "x".repeat(245000)));

test("membership change during paging stops without adopting staged objects or touching an offline queue; explicit retry succeeds", () => scoped(async ({ store, a, client, connect, f, objects }) => {
  let mutate = false, dataPages = 0;
  const c = client({ fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    if (mutate && url.includes("/objects/page?") && !url.includes("check=1") && ++dataPages === 1) {
      store.createObject(a.token, { kind: "page", id: "new-membership", data: page("New member") });
    }
    return response;
  } });
  await connect(c); await c.editExistingObject("page", objects[0].id, page("Durable unsent draft"));
  const before = rows(path.join(f.root, "cache.sqlite")); mutate = true;
  await assert.rejects(c.refresh(), failure("objects_snapshot_changed"));
  assert.deepEqual(rows(path.join(f.root, "cache.sqlite")), before);
  assert.equal((await c.list()).length, 31); assert.equal((await c.getObject("page", objects[0].id)).data.title, "Durable unsent draft");
  assert.equal(rows(path.join(f.root, "cache.sqlite"), "SELECT count(*) AS n FROM pulls")[0].n, 0);
  mutate = false; await c.refresh(); assert.equal((await c.list()).length, 32); assert.deepEqual(rows(path.join(f.root, "cache.sqlite")), before);
}));

test("a writer becomes reader between pages: drafts immediately disappear, queue remains, and retry only caches approved versions", () => scoped(async ({ store, a, b, client, connect, f, objects }) => {
  let downgrade = false, done = false;
  const c = client({ fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    if (downgrade && !done && url.includes("/objects/page?") && !url.includes("check=1")) {
      done = true; const actual = store.listUsers(a.token).find(user => user.id === b.user.id);
      store.updateUser(a.token, b.user.id, { role: "reader", expectedVersion: actual.version });
    }
    return response;
  } });
  await connect(c, b.user); await c.editExistingObject("page", objects[1].id, page("Private pending edit"));
  const before = rows(path.join(f.root, "cache.sqlite")); downgrade = true;
  await assert.rejects(c.refresh(), failure("objects_snapshot_changed"));
  assert.equal((await c.status()).user.role, "reader"); assert.equal((await c.list()).length, 1);
  await assert.rejects(c.getObject("page", objects[1].id), failure("object_not_cached"));
  await assert.rejects(c.editExistingObject("page", objects[0].id, page()), failure("forbidden"));
  assert.deepEqual(rows(path.join(f.root, "cache.sqlite")), before);
  await c.refresh(); assert.equal((await c.list()).length, 1); assert.deepEqual(rows(path.join(f.root, "cache.sqlite")), before);
}));

test("interrupted page transfer survives reopening with the preceding complete cache and unchanged queue", () => scoped(async ({ client, connect, f, objects }) => {
  let interrupt = false, dataPages = 0; const credentials = createMemoryCredentialStore();
  const c = client({ credentialStore: credentials, fetchImpl: async (url, options) => {
    if (interrupt && url.includes("/objects/page?") && !url.includes("check=1") && ++dataPages === 2) throw new Error("synthetic disconnect");
    return fetch(url, options);
  } });
  await connect(c); await c.editExistingObject("page", objects[0].id, page("Offline retained"));
  const before = rows(path.join(f.root, "cache.sqlite")); interrupt = true;
  await assert.rejects(c.refresh(), failure("offline")); await c.close();
  const reopened = client({ credentialStore: credentials }); assert.equal((await reopened.list()).length, 31);
  assert.equal((await reopened.getObject("page", objects[0].id)).data.title, "Offline retained");
  assert.deepEqual(rows(path.join(f.root, "cache.sqlite")), before); await reopened.refresh();
  assert.equal((await reopened.list()).length, 31); assert.deepEqual(rows(path.join(f.root, "cache.sqlite")), before);
}));

test("completion recheck detects a change after the last data page and keeps the old whole cache", () => scoped(async ({ store, a, client, connect, f, objects }) => {
  let mutate = false;
  const c = client({ fetchImpl: async (url, options) => {
    if (mutate && url.includes("check=1")) {
      mutate = false; store.submitChange(a.token, { changeId: "late-page-write", kind: "page", id: objects[0].id,
        baseRevision: objects[0].revision, data: page("Too late for this snapshot") });
    }
    return fetch(url, options);
  } });
  await connect(c); const before = rows(path.join(f.root, "cache.sqlite"), "SELECT * FROM cache ORDER BY kind,id"); mutate = true;
  await assert.rejects(c.refresh(), failure("objects_snapshot_changed"));
  assert.deepEqual(rows(path.join(f.root, "cache.sqlite"), "SELECT * FROM cache ORDER BY kind,id"), before);
  await c.refresh(); assert.equal((await c.getObject("page", objects[0].id)).data.title, "Too late for this snapshot");
}));

test("malformed duplicate/out-of-order pages cannot replace the complete local cache", () => scoped(async ({ client, connect, f }) => {
  let corrupt = false, first;
  const c = client({ fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    if (!corrupt || !url.includes("/objects/page?") || url.includes("check=1")) return response;
    const body = await response.json();
    if (!first) { first = body.objects[0]; return new Response(JSON.stringify(body), { status: 200 }); }
    body.objects[0] = first; return new Response(JSON.stringify(body), { status: 200 });
  } });
  await connect(c); const before = rows(path.join(f.root, "cache.sqlite"), "SELECT * FROM cache ORDER BY kind,id"); corrupt = true;
  await assert.rejects(c.refresh(), failure("invalid_response"));
  assert.deepEqual(rows(path.join(f.root, "cache.sqlite"), "SELECT * FROM cache ORDER BY kind,id"), before);
  assert.equal(rows(path.join(f.root, "cache.sqlite"), "SELECT count(*) AS n FROM pull_objects")[0].n, 0);
}));

test("paging strictly rejects query ambiguity, unknown parameters, cursor reuse by a different actor and stale approval generations", () => scoped(async ({ address, store, a, b, objects }) => {
  const get = (query, token = a.token) => fetch(`${address.url}/api/v1/objects/page?${query}`, { headers: { Authorization: `Bearer ${token}` } });
  for (const bad of ["limit=0", "limit=26", "limit=01", "limit=1&limit=2", "unknown=1", "kind=species&", "cursor=%2F", "check=2", "check=1"]) {
    const response = await get(bad); assert.equal(response.status, 400, bad);
  }
  const first = await (await get("limit=1")).json(); assert.equal(first.objects.length, 1);
  const continuation = `limit=1&snapshot=${first.snapshot}&cursor=${first.nextCursor}`;
  assert.equal((await get(continuation, b.token)).status, 409);
  const next = objects[1]; store.approveObject(a.token, "page", next.id, { expectedRevision: next.revision });
  assert.equal((await get(continuation)).status, 409);
}));

test("closing an interrupted page pull waits for abort, removes only its staging and never recreates cache files", () => scoped(async ({ client, connect, f }) => {
  let block = false, signalReady; const started = new Promise(resolve => { signalReady = resolve; });
  const c = client({ fetchImpl: async (url, options) => {
    if (block && url.includes("cursor=")) {
      signalReady(); await new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    }
    return fetch(url, options);
  } });
  await connect(c); block = true; const refresh = c.refresh(); const rejected = assert.rejects(refresh, failure("client_closed"));
  await started; await c.close(); await rejected;
  assert.equal(rows(path.join(f.root, "cache.sqlite"), "SELECT count(*) AS n FROM pulls")[0].n, 0);
  const filename = path.join(f.root, "cache.sqlite"); fs.unlinkSync(filename);
  await assert.rejects(c.refresh(), failure("client_closed")); await c.close(); assert.equal(fs.existsSync(filename), false);
}));

test("an existing schema-1 private cache migrates additively without altering its objects or durable queued request", () => scoped(async ({ client, connect, f, objects }) => {
  const credentials = createMemoryCredentialStore(), c = client({ credentialStore: credentials }); await connect(c);
  await c.editExistingObject("page", objects[0].id, page("Before cache migration")); await c.close();
  const filename = path.join(f.root, "cache.sqlite"), before = rows(filename);
  const db = new DatabaseSync(filename); try { db.exec("DROP TABLE pull_objects; DROP TABLE pulls; PRAGMA user_version=1;"); } finally { db.close(); }
  const reopened = client({ credentialStore: credentials }); assert.equal((await reopened.status()).pending, 1);
  assert.equal((await reopened.getObject("page", objects[0].id)).data.title, "Before cache migration"); assert.deepEqual(rows(filename), before);
  assert.equal(rows(filename, "PRAGMA user_version")[0].user_version, 2); await reopened.sync(); assert.equal((await reopened.status()).pending, 0);
}, 1));

test("an existing schema-1 project migrates append-only receipt/generation structures without altering users, versions or approval", async () => {
  const f = fixture();
  try {
    const { store, a } = await f.initialized(), original = store.createObject(a.token, { kind: "page", id: "migration-page", data: page("Before project migration") });
    store.approveObject(a.token, "page", original.id, { expectedRevision: original.revision }); store.close();
    const db = new DatabaseSync(f.filename);
    try { db.exec("DROP TABLE page_authoring_receipts; DROP TABLE website_alt_receipts; DROP TRIGGER objects_insert_generation; DROP TRIGGER objects_update_generation; DELETE FROM meta WHERE key='objects_generation'; PRAGMA user_version=1;"); }
    finally { db.close(); }
    const reopened = f.open(), preserved = reopened.getObject(a.token, "page", original.id);
    assert.equal(preserved.revision, original.revision); assert.equal(preserved.approvedRevision, original.revision); assert.equal(preserved.data.title, "Before project migration");
    assert.equal(reopened.me(a.token).id, a.user.id); assert.equal(reopened.objectPage(a.token).objects.length, 1);
    assert.equal(rows(f.filename, "PRAGMA user_version")[0].user_version, 4);
  } finally { f.cleanup(); }
});
