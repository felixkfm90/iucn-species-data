import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createExplorerLanguageCheckService } from "./explorer-service.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const project = () => ({ status: { baseUrl: "https://project.invalid", projectId: "fn", connection: "online",
  user: { id: "person", version: 1, role: "admin" } }, permissions: { canRead: true, canEdit: true } });
function fixture(t, state) {
  const calls = [], hooks = {};
  const engine = { async check(input) { calls.push(input); await hooks.wait?.();
    return hooks.result ?? { available: true, textSha256: hash(input.text), findings: [] }; },
  status() { return { available: true, privatePath: "private-runtime", text: "private-text" }; },
  async close() { calls.push("close"); await hooks.close?.(); } };
  const service = createExplorerLanguageCheckService({ engine, ...(state ? { sharedProject: { snapshot: async () => state } } : {}) });
  t.after(() => service.close());
  return { service, calls, hooks };
}

test("local text feedback passes the exact text, context and cancellation without an AI job or write", async t => {
  const { service, calls } = fixture(t), signal = new AbortController().signal, text = "Ein schöner Vogel 🐦\nauf dem Ast";
  const result = await service.operation({ action: "check", payload: { text, context: "caption" }, signal });
  assert.deepEqual(calls, [{ text, context: "caption", signal }]);
  assert.deepEqual(result, { available: true, textSha256: hash(text), findings: [] });
  assert.deepEqual(await service.operation({ action: "status" }), {
    available: true, engine: "LanguageTool", version: "6.6", message: "Die lokale Sprachprüfung ist verfügbar.",
  });
});

test("bounded payloads reject unknown executable options, getters and invalid fields before engine work", async t => {
  const { service, calls } = fixture(t); let reads = 0;
  const getter = { context: "text" }; Object.defineProperty(getter, "text", { enumerable: true, get() { reads++; return "Text"; } });
  for (const payload of [null, [], "Text", { text: 1 }, { text: "a".repeat(20001) }, { text: "Text", context: "arbitrary" },
    { text: "Text", javaPath: "untrusted.exe" }, { text: "Text", url: "https://external.invalid" }, getter]) {
    await assert.rejects(service.operation({ action: "check", payload }), { statusCode: 400 });
  }
  assert.equal(reads, 0); assert.deepEqual(calls, []);
});

test("reader, effective readonly and missing edit rights stop before grammar work", async t => {
  for (const mutate of [s => { s.status.user.role = "reader"; }, s => { s.status.readOnlySession = true; },
    s => { s.permissions.canEdit = false; }, s => { s.permissions.canRead = false; }]) {
    const state = project(); mutate(state); const { service, calls } = fixture(t, state);
    await assert.rejects(service.operation({ action: "check", payload: { text: "Text" } }), { statusCode: 403 });
    assert.deepEqual(calls, []);
  }
});

test("person, role version and connection changes discard the pending result", async t => {
  for (const mutate of [s => { s.status.user.id = "other"; }, s => { s.status.user.version++; },
    s => { s.status.connection = "offline"; }, s => { s.permissions.canApprove = true; }]) {
    const state = project(), { service, hooks } = fixture(t, state), gate = deferred(), entered = deferred();
    hooks.wait = () => { entered.resolve(); return gate.promise; };
    const pending = service.operation({ action: "check", payload: { text: "Text" } });
    await entered.promise; mutate(state); gate.resolve();
    await assert.rejects(pending, { statusCode: 409 });
  }
});

test("missing engine or mismatched text proof never becomes a clean grammar result", async t => {
  const { service, hooks } = fixture(t);
  hooks.result = { available: false, privateError: "private-runtime" };
  assert.deepEqual(await service.operation({ action: "check", payload: { text: "Text" } }), { available: false, findings: [],
    message: "Die lokale Grammatikprüfung ist noch nicht verfügbar. Die Rechtschreibprüfung bleibt aktiv." });
  hooks.result = { available: true, textSha256: hash("different text"), findings: [] };
  await assert.rejects(service.operation({ action: "check", payload: { text: "Text" } }), { statusCode: 409 });
  await assert.rejects(service.operation({ action: "untrusted" }), { statusCode: 404 });
});

test("an aborted browser request cannot receive a late clean result", async t => {
  const { service, hooks, calls } = fixture(t), before = new AbortController(); before.abort();
  await assert.rejects(service.operation({ action: "check", payload: { text: "Text" }, signal: before.signal }), { name: "AbortError" });
  assert.deepEqual(calls, []);
  const after = new AbortController(), gate = deferred(), entered = deferred(); hooks.wait = () => { entered.resolve(); return gate.promise; };
  const pending = service.operation({ action: "check", payload: { text: "Text" }, signal: after.signal });
  await entered.promise; after.abort(); gate.resolve(); await assert.rejects(pending, { name: "AbortError" });
});

test("repeated close joins the owned engine once and rejects subsequent text work", async t => {
  const { service, calls, hooks } = fixture(t), gate = deferred(); hooks.close = () => gate.promise;
  const first = service.close(); assert.equal(service.close(), first);
  await Promise.resolve(); assert.equal(calls.filter(item => item === "close").length, 1);
  await assert.rejects(service.operation({ action: "check", payload: { text: "Text" } }), { statusCode: 409 });
  gate.resolve(); await first;
});
