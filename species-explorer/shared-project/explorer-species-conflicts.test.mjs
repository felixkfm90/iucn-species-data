import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fixture } from "./test-fixtures.mjs";
import { createSharedProjectHttp } from "./http.mjs";
import { createSharedProjectClient } from "./client.mjs";
import { createSharedProjectClientStore } from "./client-store.mjs";
import { createExplorerSpeciesConflicts } from "./explorer-species-conflicts.mjs";
import { objectJson, digest } from "./security.mjs";

function record() {
  return { type: "fn-species-record", schemaVersion: 1, id: "fixture-owl",
    input: { german: "Testkauz", english: "Synthetic owl", genus: "Strix", species: "fixture", size: "20 cm", weight: "400 g", life_expectancy: "10 Jahre", ownField: { keep: true } },
    generated: { URLSlug: "fixture-owl", privateGenerated: "Private generated original" }, taxonomyOverride: { note: "Private taxonomy original" }, assessmentBinding: 123,
    assets: { assetName: "Testkauz", files: {}, overrides: { map: { protectedFromPipeline: true } }, credits: { private: "Private credits" }, portraitMetadata: { prompt: "Private synthetic prompt" } },
    editorial: { websiteUrl: null, sections: [{ id: "appearance", title: "Aussehen", text: "Private article original", intentionallyEmpty: false }], gallery: [], generalSectionId: null, embeddedGeneralText: null } };
}
const copy = (value) => structuredClone(value);
const changed = (source, values) => { const next = copy(source); Object.assign(next.input, values); return next; };
const reviewed = (shown, choices) => ({ sourceScope: shown.sourceScope, expectedReviewRevision: shown.reviewRevision, choices });
const serverChoices = (shown) => Object.fromEntries(shown.fields.filter((field) => field.requiresChoice).map((field) => [field.key, { kind: "server" }]));
function queueWith(client, getState) {
  let chain = Promise.resolve();
  return (operation) => { const result = chain.then(async () => operation(client, await getState())); chain = result.catch(() => {}); return result; };
}
function synthetic(options = {}) {
  const original = record(), proposed = changed(original, { weight: "450 g" }), current = changed(original, { size: "21 cm" });
  const conflict = { id: "conflict-a", kind: "species", objectId: original.id, baseRevision: "r1", currentRevision: "r2", authorId: "user-a",
    base: original, current, proposed, createdAt: "2026-01-01T00:00:00.000Z", resolvedAt: null,
    localVersions: [{ changeId: "change-a", state: "conflict", data: proposed }] };
  const object = { kind: "species", id: original.id, revision: "r2", ordinal: 2, data: current, approval: "draft", localPending: true, localConflict: true };
  const state = { status: { baseUrl: "https://fixture.invalid", projectId: "project-a", user: { id: "user-a", role: "admin" }, connection: "online" }, permissions: { canRead: true, canEdit: true } };
  const dispatches = [], reads = [], source = { conflict, object, state }; let now = 1000;
  const client = {
    async listConflicts() { reads.push("conflicts"); return copy(source.conflict ? [source.conflict] : []); },
    async getObject(kind, id, input) { reads.push([kind, id, input]); return copy(source.object); },
    async resolveConflict(id, input) { dispatches.push({ id, input: copy(input) }); return { ...copy(source.object), data: copy(input.data), localPending: false, localConflict: false }; },
  };
  const adapter = createExplorerSpeciesConflicts({ withClient: queueWith(client, () => copy(source.state)), clock: () => now, ...options });
  return { adapter, client, source, reads, dispatches, setNow: (value) => { now = value; } };
}

test("conflict construction/list/get are local curated reads without private records or inferred choices", async () => {
  const { adapter, reads } = synthetic(); assert.equal(reads.length, 0);
  const list = await adapter.list(), shown = await adapter.get("conflict-a");
  assert.equal(list.conflicts.length, 1); assert.equal(list.conflicts[0].localVersionCount, 1);
  assert.equal(shown.germanName, "Testkauz"); assert.equal(shown.sourceScope.length, 64); assert.equal(shown.reviewRevision.length, 64);
  assert.deepEqual(shown.fields.map((field) => [field.key, field.requiresChoice]), [["englishName", false], ["size", true], ["weight", true], ["lifeExpectancy", false]]);
  assert.deepEqual(shown.fields[1].server, { present: true, value: "21 cm" });
  assert.deepEqual(shown.fields[1].base, { present: true, value: "20 cm" });
  assert.ok(reads.filter(Array.isArray).every(([kind, , input]) => kind === "species" && input.serverOnly === true));
  assert.ok(!JSON.stringify([list, shown]).includes("Private")); assert.ok(!JSON.stringify(shown).includes("ownField"));
  assert.equal(shown.externalPublication, "not-performed"); adapter.close();
});

test("each differing field needs a complete explicit choice; identity and unknown choice keys are rejected", async () => {
  const { adapter, dispatches } = synthetic(), shown = await adapter.get("conflict-a");
  for (const choices of [{}, { weight: { kind: "local", changeId: "change-a" } }]) await assert.rejects(adapter.preview(shown.id, reviewed(shown, choices)), { code: "decision_required" });
  for (const choice of [{ kind: "latest" }, { kind: "server", extra: true }, { kind: "local", changeId: "missing" }]) {
    await assert.rejects(adapter.preview(shown.id, reviewed(shown, { ...serverChoices(shown), weight: choice })), { code: choice.changeId ? "local_version_changed" : "invalid_choice" });
  }
  await assert.rejects(adapter.preview(shown.id, reviewed(shown, { ...serverChoices(shown), germanName: { kind: "custom", value: "Neuer Name" } })), { code: "invalid_choice" });
  assert.equal(dispatches.length, 0); adapter.close();
});

test("preview and resolve use only explicitly chosen four input fields and preserve all private server originals", async () => {
  const { adapter, source, dispatches } = synthetic(), shown = await adapter.get("conflict-a"), before = copy(source.object.data);
  const preview = await adapter.preview(shown.id, reviewed(shown, { size: { kind: "server" }, weight: { kind: "local", changeId: "change-a" }, englishName: { kind: "custom", value: "  Reviewed owl  " } }));
  assert.equal(dispatches.length, 0); assert.deepEqual(preview.changes.map(({ key }) => key), ["englishName", "weight"]);
  assert.equal(preview.changes[0].after.value, "Reviewed owl"); assert.ok(!JSON.stringify(preview).includes("Private"));
  const result = await adapter.resolve(shown.id, { token: preview.token });
  assert.deepEqual(dispatches[0].input.data, changed(before, { english: "Reviewed owl", weight: "450 g" }));
  assert.deepEqual(source.object.data, before);
  assert.deepEqual(dispatches[0].input.requiredBinding, { baseUrl: source.state.status.baseUrl, projectId: "project-a", userId: "user-a", role: "admin" });
  assert.deepEqual(dispatches[0].input.expectedLocalVersions, [{ changeId: "change-a", state: "conflict", sha256: digest(objectJson(source.conflict.localVersions[0].data)) }]);
  assert.equal(dispatches[0].input.expectedRevision, "r2"); assert.equal(dispatches[0].input.strategy, "merged");
  assert.equal(result.serverConfirmed, true); assert.equal(result.queued, false); assert.equal(result.externalPublication, "not-performed");
  await assert.rejects(adapter.resolve(shown.id, { token: preview.token }), { code: "review_required" }); adapter.close();
});

test("missing and numeric server fields remain exact, local missing cannot remove an existing field, numeric local choice is explicit text", async () => {
  const { adapter, source, dispatches } = synthetic();
  for (const value of [source.object.data, source.conflict.base, source.conflict.current, source.conflict.proposed, source.conflict.localVersions[0].data]) {
    delete value.input.english; value.input.size = 20; value.input.weight = 400;
  }
  source.conflict.localVersions[0].data.input.weight = 450;
  let shown = await adapter.get("conflict-a"), preview = await adapter.preview(shown.id, reviewed(shown, { weight: { kind: "local", changeId: "change-a" } }));
  assert.deepEqual(preview.changes[0].after, { present: true, value: "450" });
  await adapter.resolve(shown.id, { token: preview.token });
  assert.equal(Object.hasOwn(dispatches[0].input.data.input, "english"), false); assert.equal(dispatches[0].input.data.input.size, 20);
  assert.equal(dispatches[0].input.data.input.weight, "450");
  delete source.conflict.localVersions[0].data.input.weight;
  shown = await adapter.get("conflict-a");
  await assert.rejects(adapter.preview(shown.id, reviewed(shown, { weight: { kind: "local", changeId: "change-a" } })), { code: "species_field_removal" }); adapter.close();
});

test("locked local identity changes are visible but never copied, and explicit keep-server works with all follow-up drafts", async () => {
  const { adapter, source, dispatches } = synthetic();
  source.conflict.localVersions.push({ changeId: "change-b", state: "queued", data: changed(record(), { german: "Anderer Kauz", genus: "Bubo", species: "other", weight: "500 g" }) });
  const shown = await adapter.get("conflict-a"); assert.equal(shown.localVersions.length, 2);
  assert.deepEqual(shown.lockedFields.map(({ key }) => key), ["germanName", "genus", "species"]);
  assert.ok(shown.lockedFields.every((field) => field.readonly));
  const preview = await adapter.preview(shown.id, reviewed(shown, serverChoices(shown))); assert.deepEqual(preview.changes, []);
  await adapter.resolve(shown.id, { token: preview.token }); assert.deepEqual(dispatches[0].input.data, source.object.data);
  assert.equal(source.conflict.localVersions.length, 2); adapter.close();
});

test("custom fields validate their actual text limits and reject blank/control values", async () => {
  const { adapter, source } = synthetic();
  source.object.data.input.life_expectancy = "";
  const shown = await adapter.get("conflict-a");
  for (const [key, value] of [["englishName", "a".repeat(161)], ["size", "a".repeat(241)], ["weight", "   "], ["lifeExpectancy", "one\ntwo"], ["weight", 450]]) {
    await assert.rejects(adapter.preview(shown.id, reviewed(shown, { ...serverChoices(shown), [key]: { kind: "custom", value } })), { code: typeof value === "string" ? "invalid_species_field" : "invalid_choice" });
  }
  await assert.rejects(adapter.preview(shown.id, reviewed(shown, { ...serverChoices(shown), lifeExpectancy: { kind: "custom", value: "   " } })), { code: "invalid_species_field" });
  adapter.close();
});

test("every historical record, local version metadata and current private server data is bound to the review", async (t) => {
  const mutations = {
    base: (source) => { source.conflict.base.generated.privateGenerated = "changed"; },
    current: (source) => { source.conflict.current.generated.privateGenerated = "changed"; },
    proposed: (source) => { source.conflict.proposed.generated.privateGenerated = "changed"; },
    local: (source) => { source.conflict.localVersions[0].data.assets.portraitMetadata.prompt = "changed"; },
    server: (source) => { source.object.data.input.ownField.keep = false; },
    revision: (source) => { source.object.revision = "r3"; },
    changeId: (source) => { source.conflict.localVersions[0].changeId = "other-change"; },
    state: (source) => { source.conflict.localVersions[0].state = "uncertain"; },
    addition: (source) => { source.conflict.localVersions.push({ changeId: "followup", state: "queued", data: record() }); },
    removal: (source) => { source.conflict.localVersions = []; },
    resolution: (source) => { source.conflict.resolvedAt = "2026-01-02T00:00:00.000Z"; },
  };
  for (const [name, mutate] of Object.entries(mutations)) await t.test(name, async () => {
    const { adapter, source, dispatches } = synthetic(), shown = await adapter.get("conflict-a"), preview = await adapter.preview(shown.id, reviewed(shown, serverChoices(shown)));
    mutate(source);
    await assert.rejects(adapter.resolve(shown.id, { token: preview.token }), { code: name === "removal" ? "invalid_species_conflict" : "conflict_review_changed" });
    assert.equal(dispatches.length, 0); await assert.rejects(adapter.resolve(shown.id, { token: preview.token }), { code: "review_required" }); adapter.close();
  });
});

test("person/project/role binding invalidates previews even if the role still permits editing", async (t) => {
  for (const [name, mutate] of Object.entries({ person: (state) => { state.status.user.id = "user-b"; }, project: (state) => { state.status.projectId = "project-b"; },
    server: (state) => { state.status.baseUrl = "https://other.invalid"; }, role: (state) => { state.status.user.role = "contributor"; } })) await t.test(name, async () => {
    const { adapter, source, dispatches } = synthetic(), shown = await adapter.get("conflict-a"), preview = await adapter.preview(shown.id, reviewed(shown, serverChoices(shown)));
    mutate(source.state); await assert.rejects(adapter.resolve(shown.id, { token: preview.token }), { code: "conflict_review_changed" });
    assert.equal(dispatches.length, 0); adapter.close();
  });
});

test("offline review remains readable, but preview/resolve and reader sessions cannot write", async () => {
  const { adapter, source, dispatches } = synthetic(), shown = await adapter.get("conflict-a"), preview = await adapter.preview(shown.id, reviewed(shown, serverChoices(shown)));
  source.state.status.connection = "offline"; assert.equal((await adapter.get(shown.id)).canResolve, false);
  await assert.rejects(adapter.preview(shown.id, reviewed(shown, serverChoices(shown))), { code: "online_required" });
  await assert.rejects(adapter.resolve(shown.id, { token: preview.token }), { code: "online_required" });
  source.state.status.connection = "online"; await assert.rejects(adapter.resolve(shown.id, { token: preview.token }), { code: "review_required" });
  source.state.status.user.role = "reader"; source.state.permissions.canEdit = false;
  await assert.rejects(adapter.list(), { code: "forbidden" }); assert.equal(dispatches.length, 0); adapter.close();
});

test("stale/missing review stamps, mutable input, expiry, close and duplicate dispatch cannot bypass the preview", async () => {
  const { adapter, setNow, dispatches } = synthetic(), shown = await adapter.get("conflict-a");
  await assert.rejects(adapter.preview(shown.id, { choices: serverChoices(shown) }), { code: "conflict_review_changed" });
  const input = reviewed(shown, { ...serverChoices(shown), weight: { kind: "custom", value: "460 g" } }), pending = adapter.preview(shown.id, input);
  input.choices.weight.value = "unsafe late input"; const preview = await pending;
  preview.changes[0].after.value = "mutated response";
  const results = await Promise.allSettled([adapter.resolve(shown.id, { token: preview.token }), adapter.resolve(shown.id, { token: preview.token })]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1); assert.equal(dispatches[0].input.data.input.weight, "460 g");
  const expired = await adapter.preview(shown.id, reviewed(shown, serverChoices(shown))); setNow(Date.parse(expired.expiresAt));
  await assert.rejects(adapter.resolve(shown.id, { token: expired.token }), { code: "review_required" });
  adapter.close(); await assert.rejects(adapter.get(shown.id), { code: "client_closed" });
});

test("a failed or uncertain dispatch consumes the preview and is never automatically repeated", async () => {
  const { adapter, client } = synthetic(), shown = await adapter.get("conflict-a"), preview = await adapter.preview(shown.id, reviewed(shown, serverChoices(shown))); let writes = 0;
  client.resolveConflict = async () => { writes++; throw Object.assign(new Error("Synthetic lost result"), { code: "offline" }); };
  await assert.rejects(adapter.resolve(shown.id, { token: preview.token }), { code: "offline" });
  await assert.rejects(adapter.resolve(shown.id, { token: preview.token }), { code: "review_required" }); assert.equal(writes, 1); adapter.close();
});

test("review hashes bind many full offline versions incrementally without exposing or capping their combined history", async () => {
  const { adapter, source } = synthetic();
  source.conflict.localVersions = Array.from({ length: 45 }, (_, index) => {
    const data = record(); data.generated.privateGenerated = "x".repeat(200000); data.input.weight = `${index + 400} g`;
    return { changeId: `change-${index}`, state: index ? "queued" : "conflict", data };
  });
  const shown = await adapter.get("conflict-a"); assert.equal(shown.localVersions.length, 45); assert.equal(shown.fields[2].localVersions.length, 45);
  assert.ok(JSON.stringify(shown).length < 30000); assert.equal(shown.reviewRevision.length, 64); adapter.close();
});

test("narrow catalog conflicts and ambiguous local version identities cannot enter the full-record editor", async () => {
  const { adapter, source, dispatches } = synthetic(), original = copy(source.conflict);
  source.conflict.proposed = { id: "fixture-owl", commonName: "Legacy owl" };
  const list = await adapter.list(); assert.equal(list.legacyCount, 1); assert.equal(list.conflicts.length, 0);
  await assert.rejects(adapter.get("conflict-a"), { code: "species_record_required" });
  source.conflict = original;
  source.conflict.localVersions.push(copy(source.conflict.localVersions[0]));
  await assert.rejects(adapter.get("conflict-a"), { code: "invalid_species_conflict" });
  assert.equal(dispatches.length, 0); adapter.close();
});

test("closing during a queued final read prevents dispatch after that read completes", async () => {
  const { adapter, client, source, dispatches } = synthetic(), shown = await adapter.get("conflict-a"), preview = await adapter.preview(shown.id, reviewed(shown, serverChoices(shown)));
  let start, release;
  const started = new Promise((resolve) => { start = resolve; }), gate = new Promise((resolve) => { release = resolve; });
  client.getObject = async () => { start(); await gate; return copy(source.object); };
  const resolution = adapter.resolve(shown.id, { token: preview.token }), rejection = assert.rejects(resolution, { code: "client_closed" });
  await started; adapter.close(); release(); await rejection; assert.equal(dispatches.length, 0);
});

async function realScoped(fn) {
  const f = fixture(), clients = [], adapters = []; let http;
  try {
    const initialized = await f.initialized(), { store, a, b } = initialized, original = record();
    store.createObject(a.token, { kind: "species", id: original.id, data: original });
    http = createSharedProjectHttp({ store }); const address = await http.listen();
    async function open(user = a.user, transport = {}) {
      const filename = path.join(f.root, `conflict-${clients.length}.sqlite`); let offline = false, blockChanges = false, calls = 0, beforeFetch = null, afterFetch = null;
      const client = createSharedProjectClient({ filename, localStorageConfirmed: true, allowLoopbackHttp: true, fetchImpl: async (url, options) => {
        calls++; if (offline || blockChanges && url.endsWith("/changes")) throw new Error("Synthetic offline");
        if (beforeFetch) await beforeFetch(url, options);
        const response = await (transport.fetch ? transport.fetch(url, options) : fetch(url, options));
        if (afterFetch) await afterFetch(url, options, response);
        return response;
      } }); clients.push(client);
      await client.connect({ baseUrl: address.url, username: user.username, password: f.password });
      const adapter = createExplorerSpeciesConflicts({ withClient: queueWith(client, async () => {
        const status = await client.status(), writer = ["admin", "publisher", "contributor"].includes(status.user?.role);
        return { status, permissions: { canRead: Boolean(status.user), canEdit: writer && !status.readOnlySession && status.connection !== "forbidden" } };
      }) }); adapters.push(adapter);
      return { client, adapter, filename, offline: (value) => { offline = value; }, blockChanges: (value) => { blockChanges = value; },
        beforeFetch: (value) => { beforeFetch = value; }, afterFetch: (value) => { afterFetch = value; }, calls: () => calls };
    }
    async function conflicting({ followup = false, rightTransport = {} } = {}) {
      const left = await open(a.user), right = await open(b.user, rightTransport);
      await right.client.editExistingObject("species", original.id, changed(original, { weight: "450 g" }));
      if (followup) {
        right.blockChanges(true); await assert.rejects(right.client.sync(), { code: "offline" });
        await right.client.editExistingObject("species", original.id, changed(original, { weight: "475 g", english: "Followup owl" })); right.blockChanges(false);
      }
      await left.client.editExistingObject("species", original.id, changed(original, { size: "21 cm" })); await left.client.sync(); await right.client.sync();
      const [conflict] = await right.client.listConflicts(); return { left, right, conflict };
    }
    await fn({ ...initialized, f, address, original, open, conflicting });
  } finally { for (const adapter of adapters) adapter.close(); for (const client of clients) await client.close(); if (http) await http.close(); f.cleanup(); }
}

test("two real HTTP clients merge a chosen local value, retain both originals, and never approve or publish", () => realScoped(async ({ store, a, conflicting }) => {
  const { right, conflict } = await conflicting(), calls = right.calls(), shown = await right.adapter.get(conflict.id);
  assert.equal(right.calls(), calls);
  const preview = await right.adapter.preview(shown.id, reviewed(shown, { ...serverChoices(shown), weight: { kind: "local", changeId: shown.localVersions[0].changeId } }));
  assert.equal(right.calls(), calls);
  const result = await right.adapter.resolve(shown.id, { token: preview.token }), current = store.getObject(a.token, "species", "fixture-owl");
  assert.equal(current.data.input.weight, "450 g"); assert.equal(current.data.input.size, "21 cm"); assert.equal(current.approval, "draft");
  assert.equal(result.serverConfirmed, true); assert.equal((await right.client.listConflicts()).length, 0);
  const history = store.getConflict(a.token, shown.id); assert.equal(history.base.input.weight, "400 g"); assert.equal(history.proposed.input.weight, "450 g");
}));

test("all real follow-up drafts can be deliberately superseded by exact server content and remain stored as history", () => realScoped(async ({ store, a, conflicting }) => {
  const { right, conflict } = await conflicting({ followup: true }), shown = await right.adapter.get(conflict.id);
  assert.equal(shown.localVersions.length, 2); const server = copy(store.getObject(a.token, "species", "fixture-owl").data);
  const preview = await right.adapter.preview(shown.id, reviewed(shown, serverChoices(shown))); await right.adapter.resolve(shown.id, { token: preview.token });
  assert.deepEqual(store.getObject(a.token, "species", "fixture-owl").data, server);
  const db = new DatabaseSync(right.filename, { readOnly: true });
  try {
    const history = db.prepare("SELECT data_json,state FROM queue ORDER BY seq").all(); assert.equal(history.length, 2);
    assert.ok(history.every(({ state }) => state === "superseded")); assert.equal(JSON.parse(history[1].data_json).input.weight, "475 g");
  } finally { db.close(); }
}));

test("real offline/conflict follow-up and cached server drift cannot silently use an older review", () => realScoped(async ({ conflicting }) => {
  const { left, right, conflict } = await conflicting(), shown = await right.adapter.get(conflict.id), preview = await right.adapter.preview(shown.id, reviewed(shown, serverChoices(shown)));
  right.offline(true); await assert.rejects(right.client.refresh(), { code: "offline" });
  assert.equal((await right.adapter.get(shown.id)).canResolve, false); right.offline(false); await right.client.refresh();
  const current = await left.client.getObject("species", "fixture-owl");
  await left.client.editExistingObject("species", "fixture-owl", changed(current.data, { size: "22 cm" })); await left.client.sync(); await right.client.refresh();
  await assert.rejects(right.adapter.resolve(shown.id, { token: preview.token }), { code: "conflict_review_changed" });
  const fresh = await right.adapter.get(shown.id), pending = await right.adapter.preview(shown.id, reviewed(fresh, serverChoices(fresh)));
  await right.client.editExistingObject("species", "fixture-owl", changed((await right.client.getObject("species", "fixture-owl")).data, { weight: "499 g" }));
  await assert.rejects(right.adapter.resolve(shown.id, { token: pending.token }), { code: "conflict_review_changed" });
}));

test("real uncached server drift is rejected by the final client request without automatic retry", () => realScoped(async ({ store, a, conflicting }) => {
  const { left, right, conflict } = await conflicting(), shown = await right.adapter.get(conflict.id), preview = await right.adapter.preview(shown.id, reviewed(shown, serverChoices(shown)));
  const current = await left.client.getObject("species", "fixture-owl"); await left.client.editExistingObject("species", "fixture-owl", changed(current.data, { size: "23 cm" })); await left.client.sync();
  await assert.rejects(right.adapter.resolve(shown.id, { token: preview.token }), { code: "object_changed" });
  await assert.rejects(right.adapter.resolve(shown.id, { token: preview.token }), { code: "review_required" });
  assert.equal(store.getObject(a.token, "species", "fixture-owl").data.input.size, "23 cm"); assert.equal((await right.client.listConflicts()).length, 1);
}));

test("a real remotely resolved conflict yields only a queued reviewed target and preserves every old draft", () => realScoped(async ({ store, a, conflicting }) => {
  const { right, conflict } = await conflicting({ followup: true }), current = store.getObject(a.token, "species", "fixture-owl");
  store.resolveConflict(a.token, conflict.id, { strategy: "current", expectedRevision: current.revision }); await right.client.sync();
  const shown = await right.adapter.get(conflict.id), preview = await right.adapter.preview(shown.id, reviewed(shown, serverChoices(shown)));
  const result = await right.adapter.resolve(shown.id, { token: preview.token });
  assert.equal(result.queued, true); assert.equal(result.serverConfirmed, false); assert.equal((await right.client.status()).pending, 1);
  assert.deepEqual(store.getObject(a.token, "species", "fixture-owl").data, current.data);
  const db = new DatabaseSync(right.filename, { readOnly: true });
  try { assert.equal(db.prepare("SELECT count(*) AS n FROM queue WHERE state='superseded'").get().n, 2); } finally { db.close(); }
}));

test("a real fresh role change blocks resolution even while cached permissions still allow it", () => realScoped(async ({ store, a, conflicting }) => {
  const { right, conflict } = await conflicting(), shown = await right.adapter.get(conflict.id), preview = await right.adapter.preview(shown.id, reviewed(shown, serverChoices(shown)));
  const userId = (await right.client.status()).user.id; store.updateUser(a.token, userId, { expectedVersion: 1, role: "contributor" });
  await assert.rejects(right.adapter.resolve(shown.id, { token: preview.token }), { code: "conflict_review_changed" });
  assert.equal((await right.client.listConflicts()).length, 1); assert.equal(store.getObject(a.token, "species", "fixture-owl").data.input.size, "21 cm");
}));

test("a still-writable role change after identity is checked must invalidate resolution atomically on the server", () => realScoped(async ({ store, a, conflicting }) => {
  const { right, conflict } = await conflicting(), shown = await right.adapter.get(conflict.id), preview = await right.adapter.preview(shown.id, reviewed(shown, serverChoices(shown)));
  const userId = (await right.client.status()).user.id, before = store.getObject(a.token, "species", "fixture-owl"); let changedRole = false;
  right.beforeFetch((url) => {
    if (!url.endsWith("/objects/species/fixture-owl")) return;
    right.beforeFetch(null); store.updateUser(a.token, userId, { expectedVersion: 1, role: "contributor" }); changedRole = true;
  });
  await assert.rejects(right.adapter.resolve(shown.id, { token: preview.token }), { code: "conflict_review_changed" });
  assert.equal(changedRole, true); assert.equal(store.getObject(a.token, "species", "fixture-owl").revision, before.revision);
  assert.equal((await right.client.status()).pending, 1); assert.equal(store.getConflict(a.token, conflict.id).resolvedAt, null);
}));

test("missing or older bound-conflict capabilities prevent every write and preserve all reviewed drafts", async (t) => {
  for (const support of ["missing-endpoint", "missing-flag", "old-flag"]) await t.test(support, () => realScoped(async ({ store, a, conflicting }) => {
    const requests = [];
    const rightTransport = { fetch: async (url, options) => {
      requests.push({ url, method: options.method || "GET" });
      const response = await fetch(url, options);
      if (!url.endsWith("/capabilities")) return response;
      if (support === "missing-endpoint") return new Response(JSON.stringify({ error: { code: "not_found" } }), { status: 404 });
      const value = await response.json();
      if (support === "missing-flag") delete value.boundConflictReview; else value.boundConflictReview = 0;
      return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
    } };
    const { right, conflict } = await conflicting({ followup: true, rightTransport }), shown = await right.adapter.get(conflict.id);
    const preview = await right.adapter.preview(shown.id, reviewed(shown, serverChoices(shown))), before = store.getObject(a.token, "species", "fixture-owl"), count = requests.length;
    await assert.rejects(right.adapter.resolve(shown.id, { token: preview.token }), { code: "conflict_binding_server_required" });
    assert.ok(requests.slice(count).some(({ url }) => url.endsWith("/capabilities")), "Die Serverfähigkeit wird vor der Entscheidung frisch geprüft");
    assert.ok(requests.slice(count).every(({ method }) => method === "GET"), "Kein POST gegen einen Dienst ohne die erforderliche Bindungsprüfung");
    assert.equal((await right.client.status()).pending, 2); assert.equal((await right.client.listConflicts())[0].localVersions.length, 2);
    assert.equal(store.getObject(a.token, "species", "fixture-owl").revision, before.revision); assert.equal(store.getConflict(a.token, conflict.id).resolvedAt, null);
    await assert.rejects(right.adapter.resolve(shown.id, { token: preview.token }), { code: "review_required" });
  }));
});

test("the server rejects project and person misbindings before changing either the object or conflict", async (t) => {
  for (const mismatch of ["project", "person"]) await t.test(mismatch, () => realScoped(async ({ store, a, b, conflicting }) => {
    const { conflict } = await conflicting(), before = store.getObject(b.token, "species", "fixture-owl"), person = store.me(b.token);
    const binding = { expectedProjectId: person.projectId, expectedUserId: person.id, expectedRole: person.role };
    if (mismatch === "project") binding.expectedProjectId = "other-project"; else binding.expectedUserId = a.user.id;
    assert.throws(() => store.resolveConflict(b.token, conflict.id, { strategy: "merged", expectedRevision: before.revision,
      data: changed(before.data, { weight: "499 g" }), ...binding }), { code: "conflict_review_changed" });
    assert.deepEqual(store.getObject(b.token, "species", "fixture-owl"), before); assert.equal(store.getConflict(b.token, conflict.id).resolvedAt, null);
  }));
});

test("the server rejects every partial bound triple while preserving the explicitly unbound legacy path", () => realScoped(async ({ store, b, conflicting }) => {
  const { conflict } = await conflicting(), before = store.getObject(b.token, "species", "fixture-owl"), person = store.me(b.token);
  const entries = [["expectedProjectId", person.projectId], ["expectedUserId", person.id], ["expectedRole", person.role]];
  for (let mask = 1; mask < 7; mask++) {
    const binding = Object.fromEntries(entries.filter((_, index) => mask & 1 << index));
    assert.throws(() => store.resolveConflict(b.token, conflict.id, { strategy: "merged", expectedRevision: before.revision,
      data: changed(before.data, { weight: "499 g" }), ...binding }), { code: "invalid_conflict_binding" });
    assert.deepEqual(store.getObject(b.token, "species", "fixture-owl"), before); assert.equal(store.getConflict(b.token, conflict.id).resolvedAt, null);
  }
  const legacy = store.resolveConflict(b.token, conflict.id, { strategy: "current", expectedRevision: before.revision });
  assert.ok(legacy.conflict.resolvedAt); assert.equal(legacy.object.revision, before.revision); assert.deepEqual(legacy.object.data, before.data);
}));

test("switching the actual signed-in person invalidates the old token and retains that person's conflict history", () => realScoped(async ({ f, a, address, conflicting }) => {
  const { right, conflict } = await conflicting(), shown = await right.adapter.get(conflict.id), preview = await right.adapter.preview(shown.id, reviewed(shown, serverChoices(shown)));
  const previousUser = (await right.client.status()).user;
  await right.client.connect({ baseUrl: address.url, username: a.user.username, password: f.password });
  await assert.rejects(right.adapter.resolve(shown.id, { token: preview.token }), { code: "conflict_review_changed" });
  await right.client.connect({ baseUrl: address.url, username: previousUser.username, password: f.password });
  await assert.rejects(right.adapter.resolve(shown.id, { token: preview.token }), { code: "review_required" });
  assert.equal((await right.adapter.list()).conflicts.length, 1);
}));

test("a fresh reader downgrade cannot dispatch the reviewed conflict and leaves the local drafts pending", () => realScoped(async ({ store, a, conflicting }) => {
  const { right, conflict } = await conflicting(), shown = await right.adapter.get(conflict.id), preview = await right.adapter.preview(shown.id, reviewed(shown, serverChoices(shown)));
  const userId = (await right.client.status()).user.id; store.updateUser(a.token, userId, { expectedVersion: 1, role: "reader" });
  await assert.rejects(right.adapter.resolve(shown.id, { token: preview.token }), (error) => ["forbidden", "conflict_review_changed"].includes(error.code));
  assert.equal((await right.client.status()).pending, 1);
  await assert.rejects(right.adapter.resolve(shown.id, { token: preview.token }), { code: "review_required" });
}));

test("a separate cache writer during the final identity check cannot supersede an unreviewed local follow-up", () => realScoped(async ({ conflicting }) => {
  const { right, conflict } = await conflicting(), shown = await right.adapter.get(conflict.id), preview = await right.adapter.preview(shown.id, reviewed(shown, serverChoices(shown)));
  const other = createSharedProjectClientStore({ filename: right.filename, localStorageConfirmed: true });
  try {
    const bindingId = other.active().id;
    right.beforeFetch((url) => {
      if (!url.endsWith("/auth/me")) return;
      right.beforeFetch(null);
      other.edit(bindingId, "species", "fixture-owl", changed(other.get(bindingId, "species", "fixture-owl").data, { weight: "499 g" }));
    });
    await assert.rejects(right.adapter.resolve(shown.id, { token: preview.token }), { code: "conflict_review_changed" });
    assert.equal(other.pending(bindingId).length, 2);
  } finally { right.beforeFetch(null); other.close(); }
}));

test("a separate cache writer during the fresh server read invalidates the decision before conflict dispatch", () => realScoped(async ({ store, a, conflicting }) => {
  const { right, conflict } = await conflicting(), shown = await right.adapter.get(conflict.id), preview = await right.adapter.preview(shown.id, reviewed(shown, serverChoices(shown)));
  const other = createSharedProjectClientStore({ filename: right.filename, localStorageConfirmed: true });
  try {
    const bindingId = other.active().id;
    right.beforeFetch((url) => {
      if (!url.endsWith("/objects/species/fixture-owl")) return;
      right.beforeFetch(null); other.edit(bindingId, "species", "fixture-owl", changed(other.get(bindingId, "species", "fixture-owl").data, { weight: "499 g" }));
    });
    await assert.rejects(right.adapter.resolve(shown.id, { token: preview.token }), { code: "conflict_review_changed" });
    assert.equal(other.pending(bindingId).length, 2); assert.equal(store.getConflict(a.token, conflict.id).resolvedAt, null);
  } finally { right.beforeFetch(null); other.close(); }
}));

test("a separate cache writer after the remote commit is preserved by the atomic local guard", () => realScoped(async ({ store, a, conflicting }) => {
  const { right, conflict } = await conflicting(), shown = await right.adapter.get(conflict.id), preview = await right.adapter.preview(shown.id, reviewed(shown, serverChoices(shown)));
  const other = createSharedProjectClientStore({ filename: right.filename, localStorageConfirmed: true });
  try {
    const bindingId = other.active().id;
    right.afterFetch((url) => {
      if (!url.endsWith(`/conflicts/${conflict.id}/resolve`)) return;
      right.afterFetch(null); other.edit(bindingId, "species", "fixture-owl", changed(other.get(bindingId, "species", "fixture-owl").data, { weight: "499 g" }));
    });
    await assert.rejects(right.adapter.resolve(shown.id, { token: preview.token }), { code: "conflict_review_changed" });
    assert.equal(other.pending(bindingId).length, 2); assert.ok(store.getConflict(a.token, conflict.id).resolvedAt);
    assert.equal(other.get(bindingId, "species", "fixture-owl").data.input.weight, "499 g");
    await assert.rejects(right.adapter.resolve(shown.id, { token: preview.token }), { code: "review_required" });
  } finally { right.afterFetch(null); other.close(); }
}));

test("a lost remote resolution response with a new local draft preserves uncertainty without retry", () => realScoped(async ({ store, a, conflicting }) => {
  const { right, conflict } = await conflicting(), shown = await right.adapter.get(conflict.id), preview = await right.adapter.preview(shown.id, reviewed(shown, serverChoices(shown)));
  const other = createSharedProjectClientStore({ filename: right.filename, localStorageConfirmed: true }); let writes = 0;
  try {
    const bindingId = other.active().id;
    right.afterFetch((url) => {
      if (!url.endsWith(`/conflicts/${conflict.id}/resolve`)) return;
      writes++; other.edit(bindingId, "species", "fixture-owl", changed(other.get(bindingId, "species", "fixture-owl").data, { weight: "499 g" }));
      throw new Error("Synthetic lost committed response");
    });
    await assert.rejects(right.adapter.resolve(shown.id, { token: preview.token }), { code: "offline" });
    assert.equal(other.pending(bindingId).length, 2); assert.ok(store.getConflict(a.token, conflict.id).resolvedAt);
    await assert.rejects(right.adapter.resolve(shown.id, { token: preview.token }), { code: "review_required" }); assert.equal(writes, 1);
  } finally { right.afterFetch(null); other.close(); }
}));

test("a separate writer during a resolved-conflict rebase cannot silently replace its newer local draft", () => realScoped(async ({ store, a, conflicting }) => {
  const { right, conflict } = await conflicting(), current = store.getObject(a.token, "species", "fixture-owl");
  store.resolveConflict(a.token, conflict.id, { strategy: "current", expectedRevision: current.revision }); await right.client.sync();
  const shown = await right.adapter.get(conflict.id), preview = await right.adapter.preview(shown.id, reviewed(shown, serverChoices(shown)));
  const other = createSharedProjectClientStore({ filename: right.filename, localStorageConfirmed: true });
  try {
    const bindingId = other.active().id;
    right.afterFetch((url) => {
      if (!url.endsWith("/objects/species/fixture-owl")) return;
      right.afterFetch(null); other.edit(bindingId, "species", "fixture-owl", changed(other.get(bindingId, "species", "fixture-owl").data, { weight: "499 g" }));
    });
    await assert.rejects(right.adapter.resolve(shown.id, { token: preview.token }), { code: "conflict_review_changed" });
    assert.equal(other.pending(bindingId).length, 2); assert.equal(other.get(bindingId, "species", "fixture-owl").data.input.weight, "499 g");
  } finally { right.afterFetch(null); other.close(); }
}));
