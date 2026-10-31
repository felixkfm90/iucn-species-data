import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fixture, page, species } from "./test-fixtures.mjs";
import { createSharedProjectHttp } from "./http.mjs";

async function scoped(fn) {
  const f = fixture(); let adapter;
  try {
    const initialized = await f.initialized();
    adapter = createSharedProjectHttp({ store: initialized.store });
    const address = await adapter.listen();
    await fn({ ...initialized, f, adapter, address });
  } finally { if (adapter) await adapter.close(); f.cleanup(); }
}
async function api(address, pathname, { token, method = "GET", data, headers = {} } = {}) {
  const response = await fetch(`${address.url}/api/v1/${pathname}`, { method, headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data !== undefined ? { "Content-Type": "application/json" } : {}), ...headers
  }, body: data === undefined ? undefined : JSON.stringify(data) });
  return { status: response.status, headers: response.headers, data: await response.json() };
}
function raw(address, pathname, { method = "GET", headers = {}, chunks = [] } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: address.host, port: address.port, path: pathname, method, headers }, (response) => {
      let input = ""; response.on("data", (chunk) => { input += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, data: JSON.parse(input) }));
    });
    request.on("error", reject);
    for (const chunk of chunks) request.write(chunk);
    request.end();
  });
}

test("real HTTP login/device refresh/me/logout keep credentials out of errors and authenticate catalog", () => scoped(async ({ address, a, f }) => {
  assert.equal((await api(address, "catalog")).status, 401);
  const wrong = await api(address, "auth/login", { method: "POST", data: { username: a.user.username, password: "wrong fixture" } });
  assert.equal(wrong.status, 401); assert.equal(wrong.data.error.code, "authentication_required");
  const login = await api(address, "auth/login", { method: "POST", data: { username: a.user.username, password: f.password, deviceLabel: "Synthetic phone", scope: "read" } });
  assert.equal(login.status, 200); assert.ok(login.data.device.token);
  assert.equal(typeof login.data.projectId, "string");
  assert.equal(login.data.scope, "read");
  assert.equal((await api(address, "objects", { method: "POST", token: login.data.token, data: { kind: "page", id: "no-initial-phone-write", data: page() } })).status, 403);
  const refreshed = await api(address, "auth/refresh", { method: "POST", token: login.data.device.token });
  assert.equal(refreshed.status, 200); assert.equal(refreshed.data.scope, "read");
  assert.equal(refreshed.data.projectId, login.data.projectId);
  const me = await api(address, "auth/me", { token: refreshed.data.token });
  assert.equal(me.data.username, a.user.username); assert.ok(!JSON.stringify(me.data).includes(f.password));
  assert.equal(me.data.projectId, login.data.projectId);
  assert.equal((await api(address, "catalog", { token: refreshed.data.token })).status, 200);
  assert.equal((await api(address, "objects", { method: "POST", token: refreshed.data.token, data: { kind: "page", id: "no-phone-write", data: page() } })).status, 403);
  const logout = await api(address, "auth/logout", { method: "POST", token: refreshed.data.token, data: { revokeDevice: true } });
  assert.equal(logout.status, 200);
  assert.equal((await api(address, "auth/refresh", { method: "POST", token: login.data.device.token })).status, 401);
  assert.equal((await api(address, "auth/me", { token: refreshed.data.token })).status, 401);
}));

test("real HTTP object/update/approval/conflict routes preserve server decisions", () => scoped(async ({ address, a, b, store, f }) => {
  await store.createUser(a.token, { username: "fixture-reader", displayName: "Reader", password: f.password, role: "reader" });
  const reader = await store.login({ username: "fixture-reader", password: f.password });
  const created = await api(address, "objects", { method: "POST", token: a.token, data: { kind: "species", id: "fixture-owl", data: species() } });
  assert.equal(created.status, 201); const original = created.data;
  assert.equal((await api(address, `objects/species/${original.id}`, { token: a.token })).data.revision, original.revision);
  assert.deepEqual((await api(address, "objects?kind=species", { token: reader.token })).data.objects, []);
  assert.equal((await api(address, `objects/species/${original.id}/approve`, { method: "POST", token: reader.token, data: { expectedRevision: original.revision } })).status, 403);
  const approved = await api(address, `objects/species/${original.id}/approve`, { method: "POST", token: b.token, data: { expectedRevision: original.revision } });
  assert.equal(approved.status, 200); assert.equal(approved.data.externalPublication, "not-performed");
  const first = await api(address, `objects/species/${original.id}`, { method: "PUT", token: a.token,
    data: { changeId: "http-change-first", baseRevision: original.revision, data: species(original.id, "Server change") } });
  assert.equal(first.status, 200); assert.equal(first.data.status, "applied");
  const stale = { changeId: "http-change-stale", kind: "species", id: original.id, baseRevision: original.revision, data: species(original.id, "Offline proposal") };
  const conflict = await api(address, "changes", { method: "POST", token: b.token, data: stale });
  assert.equal(conflict.status, 409); assert.equal(conflict.data.status, "conflict");
  const stored = await api(address, `conflicts/${conflict.data.conflictId}`, { token: a.token });
  assert.equal(stored.data.current.sections[0].text, "Server change");
  assert.equal(stored.data.proposed.sections[0].text, "Offline proposal");
  assert.equal((await api(address, "conflicts", { token: reader.token })).status, 403);
  const resolved = await api(address, `conflicts/${conflict.data.conflictId}/resolve`, { method: "POST", token: b.token,
    data: { expectedRevision: first.data.object.revision, strategy: "proposed" } });
  assert.equal(resolved.status, 200); assert.equal(resolved.data.object.approval, "draft");
  const catalog = await api(address, "catalog", { token: reader.token });
  assert.equal(catalog.data.species[0].sections[0].text, "Synthetic species text");
  assert.ok(!("websiteUrl" in catalog.data.species[0]));
}));

test("HTTP host/origin/path/body/type limits reject malformed and oversized requests", () => scoped(async ({ address, a }) => {
  assert.equal((await raw(address, "/api/v1/catalog", { headers: { Host: "attacker.example.org", Authorization: `Bearer ${a.token}` } })).status, 421);
  assert.equal((await api(address, "catalog", { token: a.token, headers: { Origin: "https://attacker.example.org" } })).status, 403);
  const same = await api(address, "catalog", { token: a.token, headers: { Origin: address.url } });
  assert.equal(same.status, 200); assert.equal(same.headers.get("access-control-allow-origin"), address.url);
  assert.equal((await raw(address, "/api/v1/objects/%2e%2e/catalog", { headers: { Authorization: `Bearer ${a.token}` } })).status, 400);
  assert.equal((await raw(address, "/api/v1/catalog?kind=page", { headers: { Authorization: `Bearer ${a.token}` } })).status, 400);
  assert.equal((await raw(address, "/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "text/plain" }, chunks: ["{}"] })).status, 415);
  assert.equal((await raw(address, "/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, chunks: ["{bad"] })).status, 400);
  const oversized = await raw(address, "/api/v1/objects", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${a.token}` }, chunks: [" ".repeat(321 * 1024)] });
  assert.equal(oversized.status, 413);
  assert.equal((await api(address, "objects", { method: "POST", token: a.token, data: { kind: "page", id: "too-large", data: { title: "Too large", text: "x".repeat(270 * 1024) } } })).status, 413);
  assert.equal((await api(address, "catalog", { token: "s1_" + "A".repeat(43) })).status, 401);
  assert.equal((await api(address, "missing", { token: a.token })).status, 404);
}));

test("HTTP administration routes do not trust a forged role or silently change the last admin", () => scoped(async ({ address, a, b }) => {
  const created = await api(address, "users", { method: "POST", token: a.token,
    data: { username: "fixture-new-reader", displayName: "Reader", password: "Entirely synthetic password 123456", role: "reader" } });
  assert.equal(created.status, 201);
  const list = await api(address, "users", { token: a.token }); assert.equal(list.data.users.length, 3);
  const demoted = await api(address, `users/${b.user.id}`, { method: "PATCH", token: a.token, data: { expectedVersion: 1, role: "reader" } });
  assert.equal(demoted.status, 200);
  assert.equal((await api(address, "users", { token: b.token, headers: { "X-Role": "admin" } })).status, 403);
  const blocked = await api(address, `users/${a.user.id}`, { method: "PATCH", token: a.token, data: { expectedVersion: 1, blocked: true } });
  assert.equal(blocked.status, 409); assert.equal(blocked.data.error.code, "last_admin");
}));

test("typed large write envelopes authenticate the actual writer before reading the body and cannot enlarge login/admin/generic data", () => scoped(async ({ address, a, f }) => {
  const typed = { "Content-Type": "application/json", "X-Shared-Object-Type": "website-alt-page", "Content-Length": "2100000", Connection: "close" };
  const denied = await raw(address, "/api/v1/changes", { method: "POST", headers: { ...typed, Authorization: `Bearer s1_${"A".repeat(43)}` } });
  assert.equal(denied.status, 401);
  const read = await api(address, "auth/login", { method: "POST", data: { username: a.user.username, password: f.password, scope: "read" } });
  assert.equal((await raw(address, "/api/v1/objects", { method: "POST", headers: { ...typed, Authorization: `Bearer ${read.data.token}` } })).status, 403);
  assert.equal((await raw(address, "/api/v1/auth/login", { method: "POST", headers: typed })).status, 413);
  assert.equal((await raw(address, "/api/v1/users", { method: "POST", headers: { ...typed, Authorization: `Bearer ${a.token}` } })).status, 413);
  assert.equal((await api(address, "objects", { method: "POST", token: a.token, headers: { "X-Shared-Object-Type": "website-alt-page" },
    data: { kind: "page", id: "forged-large-generic", data: { title: "Generic stays bounded", text: "x".repeat(300000) } } })).status, 413);
  assert.equal((await raw(address, "/api/v1/changes", { method: "POST", headers: { ...typed, "Content-Length": "2200000", Authorization: `Bearer ${a.token}` } })).status, 413);
}));

test("adapter stays loopback unless network binding and hosts are explicitly configured", () => {
  assert.throws(() => createSharedProjectHttp({ store: {}, host: "0.0.0.0" }), (error) => error.code === "unsafe_bind");
  assert.throws(() => createSharedProjectHttp({ store: {}, host: "0.0.0.0", allowNetwork: true }), (error) => error.code === "unsafe_bind");
  assert.throws(() => createSharedProjectHttp({ store: {}, allowedOrigins: ["*"] }), (error) => error.code === "invalid_origin");
});

test("actual service process restart preserves existing session, object and approval", async () => {
  const f = fixture(); let processHandle;
  const executable = fileURLToPath(new URL("cli.mjs", import.meta.url));
  async function start() {
    processHandle = spawn(process.execPath, ["--no-warnings", executable, "serve", "--db", f.filename, "--confirm-local-storage", "--port", "0"],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let input = "";
    return new Promise((resolve, reject) => {
      processHandle.stdout.on("data", (chunk) => {
        input += chunk;
        if (input.includes("\n")) { try { resolve(JSON.parse(input.split("\n")[0]).listening); } catch (error) { reject(error); } }
      });
      processHandle.once("error", reject);
      processHandle.once("exit", (code) => { if (!input.includes("\n")) reject(new Error(`Service did not start: ${code}`)); });
    });
  }
  async function stop() { if (processHandle && processHandle.exitCode === null) { const exited = once(processHandle, "exit"); processHandle.kill(); await exited; } }
  try {
    const { store, a } = await f.initialized();
    const draft = store.createObject(a.token, { kind: "species", id: "fixture-owl", data: species() });
    store.approveObject(a.token, "species", draft.id, { expectedRevision: draft.revision });
    store.close();
    const beforeAddress = await start();
    const before = await api(beforeAddress, "catalog", { token: a.token });
    assert.equal(before.status, 200); await stop();
    const afterAddress = await start();
    const after = await api(afterAddress, "catalog", { token: a.token });
    assert.equal(after.status, 200); assert.equal(after.data.revision, before.data.revision);
    assert.deepEqual(after.data.species, before.data.species);
    assert.equal((await api(afterAddress, "auth/me", { token: a.token })).data.id, a.user.id);
  } finally { await stop(); f.cleanup(); }
});

test("actual CLI bootstrap needs explicit flags/stdin, emits no credentials, and cannot run twice", async () => {
  const f = fixture(), executable = fileURLToPath(new URL("cli.mjs", import.meta.url));
  async function invoke(args, input) {
    const child = spawn(process.execPath, ["--no-warnings", executable, ...args], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    const exited = once(child, "exit"); child.stdin.end(input);
    const [code] = await exited;
    assert.ok(!stdout.includes(f.password) && !stderr.includes(f.password));
    return { code, stdout, stderr };
  }
  const input = JSON.stringify({ users: ["fixture-one", "fixture-two"].map((username) => ({ username, displayName: username, password: f.password })) });
  const args = ["bootstrap", "--db", f.filename, "--confirm-local-storage"];
  try {
    assert.equal((await invoke(args, input)).code, 1);
    const created = await invoke([...args, "--confirm-bootstrap"], input);
    assert.equal(created.code, 0); assert.deepEqual(JSON.parse(created.stdout), { initialized: true, adminCount: 2 });
    assert.equal((await invoke([...args, "--confirm-bootstrap"], input)).code, 1);
    const store = f.open();
    assert.ok((await store.login({ username: "fixture-one", password: f.password })).token);
  } finally { f.cleanup(); }
});
