import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { buildNewSpeciesEntry, validateNewSpeciesValues } from "../species-model.mjs";
import { canonicalJson, digest, transportJson } from "./security.mjs";
import { createExplorerSpeciesCreation } from "./explorer-species-creation.mjs";

const values = { german: "Testkauz", english: "Synthetic owl", scientificName: "Strix fixture", size: "20 cm", weight: "400 g", lifeExpectancy: "10 Jahre" };
const clone = value => structuredClone(value), revision = "11111111-1111-4111-8111-111111111111";
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function fixture(options = {}) {
  const state = { status: { baseUrl: "https://fixture.example", projectId: "project-a", connection: "online", readOnlySession: false,
    user: { id: "person-a", role: "admin", version: 1 } }, permissions: { canRead: true, canEdit: true, canCreate: true, canApprove: true } };
  const hooks = {}, calls = [], objects = new Map(); let now = 0, serial = 0, sourceHash = "a".repeat(64), chain = Promise.resolve();
  const client = {
    async status() { await hooks.status?.(); return clone(state.status); },
    async capabilities() { calls.push({ operation: "capabilities" }); await hooks.capabilities?.(); return { schemaVersion: 1, speciesCreation: 1,
      projectId: state.status.projectId, user: clone(state.status.user), ...options.capabilities }; },
    async refresh() { calls.push({ operation: "refresh" }); await hooks.refresh?.(); },
    async listObjects() { calls.push({ operation: "list" }); await hooks.list?.(); return [...objects.values()].map(clone); },
    async getObject(kind, id, input) {
      calls.push({ operation: "get", kind, id, input: clone(input) }); await hooks.get?.();
      if (!objects.has(id)) throw Object.assign(new Error("Synthetic missing server object"), { status: 404, code: "object_not_cached" });
      return clone(objects.get(id));
    },
    async createObject(input) {
      calls.push({ operation: "create", input: clone(input) });
      const commit = () => { const object = { kind: "species", id: input.id, data: clone(input.data), revision, ordinal: 1,
        approval: "draft", approvedRevision: null, localPending: false, localConflict: false }; objects.set(input.id, object); return clone(object); };
      const result = await hooks.create?.(input, commit); return result ?? commit();
    },
  };
  const prepareLocalCreation = async payload => {
    calls.push({ operation: "prepare", payload: clone(payload) });
    const result = await hooks.prepare?.(payload); if (result !== undefined) return result;
    const normalized = validateNewSpeciesValues(payload.values), built = buildNewSpeciesEntry(normalized.values), entry = { ...built.entry };
    if (payload.masterTaxonId) entry.masterTaxonId = payload.masterTaxonId;
    const reference = payload.masterTaxonId || payload.taxonomyReference;
    if (reference) { entry.taxonomyReference = reference; entry.taxonomyBinding = { provider: "synthetic-local-taxonomy", version: "local-1", reference, sourceHash }; }
    return { values: normalized.values, ...built, entry, sourceHash };
  };
  const api = createExplorerSpeciesCreation({
    withClient(work) { const result = chain.then(() => work(client, clone(state))); chain = result.catch(() => {}); return result; },
    prepareLocalCreation, clock: () => now, tokenId: () => `preview-${++serial}`, ttlMs: options.ttlMs ?? 1000,
    ...(Object.hasOwn(options, "isSourceReady") ? { isSourceReady: options.isSourceReady } : {}),
  });
  const payload = extra => ({ sourceScope: digest(transportJson([state.status.baseUrl, state.status.projectId, state.status.user.id])), values: clone(values), ...extra });
  return { api, client, state, calls, hooks, objects, payload, setTime(value) { now = value; }, setSource(value) { sourceHash = value; } };
}
const creates = f => f.calls.filter(call => call.operation === "create");

test("availability proves the actual online capability without reading local sources, listing objects or sending a write", async () => {
  const f = fixture(); f.hooks.prepare = () => { throw new Error("Availability must not read local sources"); };
  assert.equal(f.calls.length, 0);
  const result = await f.api.availability();
  assert.deepEqual(result, { available: true, source: "shared-project", sourceScope: f.payload().sourceScope });
  assert.deepEqual(f.calls.map(call => call.operation), ["capabilities"]);
  assert.doesNotMatch(JSON.stringify(result), /baseUrl|projectId|userId|role|version|taxonomy|values|sourceHash/);
});

test("availability and preview require an explicitly ready source and never accept truthy readiness flags", async () => {
  for (const ready of [false, undefined, null, 1, "true", Promise.resolve(true)]) {
    const f = fixture({ isSourceReady: () => ready });
    await assert.rejects(f.api.availability(), { code: "species_creation_source_unavailable", status: 503 });
    await assert.rejects(f.api.preview(f.payload()), { code: "species_creation_source_unavailable", status: 503 });
    assert.equal(f.calls.length, 0);
  }
  assert.throws(() => createExplorerSpeciesCreation({ withClient() {}, prepareLocalCreation() {}, isSourceReady: true }), { code: "species_creation_unavailable" });
});

test("availability rejects old capabilities, offline or reader sessions, missing user versions and live authentication drift", async () => {
  for (const capabilities of [{ speciesCreation: undefined }, { speciesCreation: 0 }, { speciesCreation: 2 }, { projectId: "other-project" }]) {
    const f = fixture({ capabilities }); await assert.rejects(f.api.availability()); assert.equal(creates(f).length, 0);
    assert.equal(f.calls.some(call => ["prepare", "refresh", "list", "get"].includes(call.operation)), false);
  }
  for (const change of [f => { f.state.status.connection = "offline"; }, f => { f.state.status.user.role = "reader"; },
    f => { f.state.status.readOnlySession = true; }, f => { f.state.permissions.canCreate = false; }, f => { delete f.state.status.user.version; }]) {
    const f = fixture(); change(f); await assert.rejects(f.api.availability()); assert.equal(f.calls.length, 0);
  }
  for (const change of [f => { f.state.status.user.id = "other-person"; }, f => { f.state.status.user.role = "publisher"; },
    f => { f.state.status.user.version++; }, f => { f.state.status.projectId = "other-project"; }, f => { f.state.status.baseUrl = "https://other.example"; }]) {
    const f = fixture(); f.hooks.capabilities = () => change(f);
    await assert.rejects(f.api.availability(), { code: "species_creation_changed" }); assert.equal(creates(f).length, 0);
    assert.equal(f.calls.some(call => call.operation === "prepare"), false);
  }
});

test("readiness lost during capability or preview awaits cannot return an available result or a usable preview", async () => {
  let ready = true; const f = fixture({ isSourceReady: () => ready }), entered = deferred(), release = deferred();
  f.hooks.capabilities = async () => { entered.resolve(); await release.promise; };
  const checking = f.api.availability(), rejected = assert.rejects(checking, { code: "species_creation_source_unavailable", status: 503 });
  await entered.promise; ready = false; release.resolve(); await rejected;
  assert.equal(f.calls.some(call => call.operation === "prepare"), false); assert.equal(creates(f).length, 0);
  ready = true; const g = fixture({ isSourceReady: () => ready });
  g.hooks.list = () => { ready = false; };
  await assert.rejects(g.api.preview(g.payload()), { code: "species_creation_source_unavailable", status: 503 }); assert.equal(creates(g).length, 0);
  ready = true; const h = fixture({ isSourceReady: () => ready }); let statusReads = 0;
  h.hooks.status = () => { if (++statusReads === 2) h.state.status.user.version++; };
  await assert.rejects(h.api.availability(), { code: "species_creation_changed" }); assert.equal(creates(h).length, 0);
});

test("reviewed creation preserves manual inputs and actual taxonomy provenance in a record1 draft without generated media or approval", async () => {
  const f = fixture(), masterTaxonId = `mtx_${"b".repeat(32)}`, input = f.payload({ masterTaxonId, taxonomyReference: masterTaxonId });
  assert.equal(f.calls.length, 0);
  const preview = await f.api.preview(input);
  assert.equal(preview.sourceScope, input.sourceScope); assert.equal(preview.species.taxonomySelected, true); assert.equal(creates(f).length, 0);
  assert.doesNotMatch(JSON.stringify(preview), /taxonomyBinding|synthetic-local-taxonomy|sourceHash|"generated"|"files"/);
  const result = await f.api.create({ token: preview.token }), sent = creates(f)[0].input;
  assert.equal(sent.boundSpeciesCreation, true); assert.deepEqual(sent.requiredBinding,
    { baseUrl: "https://fixture.example", projectId: "project-a", userId: "person-a", role: "admin", userVersion: 1 });
  assert.equal(sent.data.schemaVersion, 1); assert.equal(sent.data.input.masterTaxonId, masterTaxonId);
  assert.equal(sent.data.input.taxonomyReference, masterTaxonId); assert.equal(sent.data.input.taxonomyBinding.reference, masterTaxonId);
  assert.equal(sent.data.input.life_expectancy, values.lifeExpectancy);
  assert.equal(sent.data.generated, null); assert.equal(sent.data.taxonomyOverride, null); assert.equal(sent.data.assessmentBinding, null);
  assert.deepEqual(sent.data.assets, { assetName: "Testkauz", files: {}, overrides: {}, credits: null, portraitMetadata: null });
  assert.deepEqual(sent.data.editorial, { websiteUrl: null, sections: [], gallery: [], generalSectionId: null, embeddedGeneralText: null });
  assert.equal(result.created, true); assert.equal(result.recovered, false); assert.equal(result.approvalPerformed, false);
  assert.equal(result.externalPublication, "not-performed"); assert.equal(result.species.approval, "draft");
  assert.doesNotMatch(JSON.stringify(result), /taxonomyBinding|synthetic-local-taxonomy|sourceHash/);
  await assert.rejects(f.api.create({ token: preview.token }), { code: "review_required" }); assert.equal(creates(f).length, 1);
});

test("unknown renderer fields, supplied proofs, accessors, proxies and inherited request fields fail before source or network access", async () => {
  const f = fixture(); let getterCalls = 0;
  const getter = f.payload(); Object.defineProperty(getter, "values", { enumerable: true, get() { getterCalls++; return values; } });
  const inherited = Object.assign(Object.create({ role: "admin" }), f.payload());
  for (const payload of [f.payload({ role: "admin" }), f.payload({ taxonomyBinding: { forged: true } }),
    f.payload({ data: { type: "fn-species-record" } }), f.payload({ values: { ...values, assetDirectory: "C:\\private" } }), getter, inherited, new Proxy(f.payload(), {})]) {
    await assert.rejects(f.api.preview(payload), { code: "invalid_species_creation" });
  }
  assert.equal(getterCalls, 0); assert.equal(f.calls.length, 0);
});

test("all writer roles may create a draft while offline, read-only and reader sessions are denied", async () => {
  for (const role of ["admin", "publisher", "contributor"]) {
    const f = fixture(); f.state.status.user.role = role; const preview = await f.api.preview(f.payload());
    await f.api.create({ token: preview.token }); assert.equal(creates(f)[0].input.requiredBinding.role, role);
  }
  for (const change of [f => { f.state.status.connection = "offline"; }, f => { f.state.status.readOnlySession = true; },
    f => { f.state.status.user.role = "reader"; }, f => { f.state.permissions.canCreate = false; }]) {
    const f = fixture(); change(f); await assert.rejects(f.api.preview(f.payload()), { code: "forbidden" }); assert.equal(f.calls.length, 0);
  }
});

test("missing or changed person version, project, origin and still-permitted role invalidate a reviewed creation", async () => {
  const noVersion = fixture(); delete noVersion.state.status.user.version;
  await assert.rejects(noVersion.api.preview(noVersion.payload()), { code: "species_creation_identity_required" });
  for (const change of [f => { f.state.status.projectId = "project-b"; }, f => { f.state.status.baseUrl = "https://other.example"; },
    f => { f.state.status.user.id = "person-b"; }, f => { f.state.status.user.role = "publisher"; },
    f => { f.state.status.user.version++; }, f => { f.state.permissions.canCreate = false; }]) {
    const f = fixture(), preview = await f.api.preview(f.payload()); change(f);
    await assert.rejects(f.api.create({ token: preview.token })); assert.equal(creates(f).length, 0);
  }
});

test("source hash drift and a late change during final identity confirmation stop before the first POST", async () => {
  const f = fixture(), preview = await f.api.preview(f.payload()); f.setSource("c".repeat(64));
  await assert.rejects(f.api.create({ token: preview.token }), { code: "species_creation_changed" }); assert.equal(creates(f).length, 0);
  const g = fixture(), reviewed = await g.api.preview(g.payload()); let capabilities = 0;
  g.hooks.capabilities = () => { if (++capabilities === 2) g.state.status.user.version++; };
  await assert.rejects(g.api.create({ token: reviewed.token }), { code: "species_creation_changed" }); assert.equal(creates(g).length, 0);
});

test("capability absence or a foreign capability response blocks the new typed operation without falling back to generic creation", async () => {
  for (const capabilities of [{ speciesCreation: undefined }, { speciesCreation: 0 }, { speciesCreation: 2 }, { projectId: "project-b" }]) {
    const f = fixture({ capabilities }); await assert.rejects(f.api.preview(f.payload())); assert.equal(creates(f).length, 0);
  }
});

test("scientific, German, asset and exact-ID collisions are re-read and block creation without replacing existing objects", async () => {
  for (const mode of ["id", "scientific", "german", "asset", "generated-slug"]) {
    const f = fixture(), preview = await f.api.preview(f.payload());
    const data = { type: "fn-species-record", input: { genus: "Other", species: "fixture", german: "Andere Art" }, assets: { assetName: "AndereArt" } };
    const object = { kind: "species", id: mode === "id" ? "strixfixture" : "other-art", data };
    if (mode === "scientific") Object.assign(data.input, { genus: "Strix", species: "fixture" });
    if (mode === "german") data.input.german = "TESTKAUZ";
    if (mode === "asset") data.assets.assetName = "testkauz";
    if (mode === "generated-slug") data.generated = { URLSlug: "strixfixture" };
    f.objects.set(object.id, object);
    await assert.rejects(f.api.create({ token: preview.token })); assert.equal(creates(f).length, 0); assert.deepEqual(f.objects.get(object.id), object);
  }
  const f = fixture(); f.objects.set("legacy-art", { kind: "species", id: "legacy-art", data: { scientificName: "Strix fixture", commonName: "Andere Art" } });
  await assert.rejects(f.api.preview(f.payload()), { code: "species_identity_exists" });
});

test("a selected taxonomy reference cannot disappear or be replaced by a free preparer record", async () => {
  for (const mode of ["missing-reference", "missing-proof", "changed-name", "extra-entry"]) {
    const f = fixture(), reference = `stx_${"d".repeat(24)}`;
    f.hooks.prepare = payload => {
      const normalized = validateNewSpeciesValues(payload.values), built = buildNewSpeciesEntry(normalized.values);
      const entry = { ...built.entry, taxonomyReference: reference, taxonomyBinding: { reference } };
      if (mode === "missing-reference") delete entry.taxonomyReference;
      if (mode === "missing-proof") delete entry.taxonomyBinding;
      if (mode === "changed-name") entry.german = "Andere Art";
      if (mode === "extra-entry") entry.password = "must-not-enter-record";
      return { values: normalized.values, ...built, entry, sourceHash: "a".repeat(64) };
    };
    await assert.rejects(f.api.preview(f.payload({ taxonomyReference: reference })), { code: "invalid_species_creation" }); assert.equal(creates(f).length, 0);
  }
});

test("a lost POST acknowledgement is recovered only after refresh and an exact server-only record comparison, never another POST", async () => {
  const f = fixture(), preview = await f.api.preview(f.payload());
  f.hooks.create = (_input, commit) => { commit(); throw Object.assign(new Error("Synthetic lost acknowledgement"), { code: "offline" }); };
  await assert.rejects(f.api.create({ token: preview.token }), { code: "offline" }); assert.equal(creates(f).length, 1);
  const previous = f.calls.length, result = await f.api.create({ token: preview.token }), after = f.calls.slice(previous);
  assert.equal(result.created, false); assert.equal(result.recovered, true); assert.equal(result.serverConfirmed, true);
  assert.match(result.message, /vorhanden.*keine eigene Anlagebestätigung/);
  assert.equal(creates(f).length, 1); assert.ok(after.findIndex(call => call.operation === "refresh") < after.findIndex(call => call.operation === "get"));
  assert.deepEqual(after.find(call => call.operation === "get").input, { serverOnly: true });
});

test("explicit recovery of a ready token never creates, even when no original request arrived and its local source disappeared", async () => {
  let ready = true; const f = fixture({ isSourceReady: () => ready }), preview = await f.api.preview(f.payload()), prior = f.calls.length;
  ready = false; f.hooks.prepare = () => { throw new Error("Recovery must not read the source"); };
  await assert.rejects(f.api.recover({ token: preview.token }), { code: "species_creation_unconfirmed" });
  const reads = f.calls.slice(prior); assert.deepEqual(reads.map(call => call.operation), ["capabilities", "refresh", "get"]);
  assert.deepEqual(reads.find(call => call.operation === "get").input, { serverOnly: true }); assert.equal(creates(f).length, 0);
  ready = true;
  await assert.rejects(f.api.create({ token: preview.token }), { code: "species_creation_unconfirmed" });
  assert.equal(creates(f).length, 0); assert.equal(f.calls.slice(prior).some(call => call.operation === "prepare"), false);
});

test("recovery seals a ready token before a failing capability read and never restores its write permission", async () => {
  const f = fixture(), preview = await f.api.preview(f.payload()), prior = f.calls.length;
  f.hooks.capabilities = () => { throw Object.assign(new Error("Synthetic capability outage"), { code: "offline" }); };
  await assert.rejects(f.api.recover({ token: preview.token }), { code: "offline" });
  assert.deepEqual(f.calls.slice(prior).map(call => call.operation), ["capabilities"]);
  delete f.hooks.capabilities;
  await assert.rejects(f.api.create({ token: preview.token }), { code: "species_creation_unconfirmed" });
  assert.equal(creates(f).length, 0); assert.equal(f.calls.slice(prior).some(call => call.operation === "prepare"), false);
});

test("read-only recovery accepts only an exact fresh server record and does not claim authorship or need current local sources", async () => {
  const other = fixture(), otherPreview = await other.api.preview(other.payload()); await other.api.create({ token: otherPreview.token });
  let ready = true; const f = fixture({ isSourceReady: () => ready }), preview = await f.api.preview(f.payload());
  f.objects.set(preview.species.id, clone(other.objects.get(preview.species.id)));
  f.setSource("e".repeat(64)); ready = false; f.hooks.prepare = () => { throw new Error("Changed source must not be read during recovery"); };
  const prior = f.calls.length, result = await f.api.recover({ token: preview.token });
  assert.equal(result.created, false); assert.equal(result.recovered, true); assert.equal(result.serverConfirmed, true);
  assert.match(result.message, /keine eigene Anlagebestätigung/); assert.equal(creates(f).length, 0);
  assert.deepEqual(f.calls.slice(prior).map(call => call.operation), ["capabilities", "refresh", "get"]);
  assert.doesNotMatch(JSON.stringify(result), /sourceHash|taxonomyBinding|"input"/);
  await assert.rejects(f.api.create({ token: preview.token }), { code: "review_required" }); assert.equal(creates(f).length, 0);
});

test("recovery retains exact-record uncertainty for a different server version and rejects unknown request fields without reads", async () => {
  const other = fixture(), otherPreview = await other.api.preview(other.payload()); await other.api.create({ token: otherPreview.token });
  const f = fixture(), preview = await f.api.preview(f.payload()), object = clone(other.objects.get(preview.species.id));
  object.data.input.english = "Another existing value"; f.objects.set(object.id, object); const prior = f.calls.length;
  await assert.rejects(f.api.recover({ token: preview.token, role: "admin" }), { code: "invalid_species_creation" });
  assert.equal(f.calls.length, prior);
  await assert.rejects(f.api.recover({ token: preview.token }), { code: "species_creation_unconfirmed" });
  await assert.rejects(f.api.create({ token: preview.token }), { code: "species_creation_unconfirmed" }); assert.equal(creates(f).length, 0);
  assert.deepEqual(f.objects.get(object.id), object);
});

test("recovery remains bound to the original person, project, role and user version before and during reads", async () => {
  for (const change of [f => { f.state.status.user.id = "other-person"; }, f => { f.state.status.user.role = "publisher"; },
    f => { f.state.status.user.version++; }, f => { f.state.status.projectId = "other-project"; }, f => { f.state.status.baseUrl = "https://other.example"; }]) {
    const f = fixture(), preview = await f.api.preview(f.payload()), original = clone(f.state.status), prior = f.calls.length;
    change(f); await assert.rejects(f.api.recover({ token: preview.token }), { code: "species_creation_changed" });
    assert.equal(f.calls.length, prior); f.state.status = original;
    // An unauthorized caller must not consume another person's ready preview.
    await f.api.create({ token: preview.token }); assert.equal(creates(f).length, 1);
    const g = fixture(), reviewed = await g.api.preview(g.payload()); g.hooks.capabilities = () => change(g);
    await assert.rejects(g.api.recover({ token: reviewed.token }), { code: "species_creation_changed" });
    assert.equal(creates(g).length, 0); assert.equal(g.calls.some(call => call.operation === "get"), false);
  }
});

test("a delayed old create after explicit recovery can only read and never dispatches an object creation", async () => {
  const f = fixture(), preview = await f.api.preview(f.payload()), entered = deferred(), release = deferred(), prior = f.calls.length;
  f.hooks.capabilities = async () => { entered.resolve(); await release.promise; };
  const recovering = f.api.recover({ token: preview.token }), recoveryRejected = assert.rejects(recovering, { code: "species_creation_unconfirmed" });
  await entered.promise;
  const delayed = f.api.create({ token: preview.token }), delayedRejected = assert.rejects(delayed, { code: "species_creation_unconfirmed" });
  release.resolve(); await Promise.all([recoveryRejected, delayedRejected]);
  assert.equal(creates(f).length, 0); assert.equal(f.calls.slice(prior).some(call => call.operation === "prepare"), false);
  assert.equal(f.calls.slice(prior).filter(call => call.operation === "get").length, 2);
});

test("pre-dispatch failure, a missing server object and a different server record all retain uncertainty and never issue a second POST", async () => {
  for (const mode of ["missing", "different", "object-exists"]) {
    const f = fixture(), preview = await f.api.preview(f.payload());
    f.hooks.create = (_input, commit) => {
      if (mode !== "missing") { const object = commit(); if (mode === "different") { object.data.input.english = "Andere vorhandene Fassung"; f.objects.set(object.id, object); } }
      throw Object.assign(new Error("Synthetic uncertain write"), { code: mode === "object-exists" ? "object_exists" : "offline" });
    };
    await assert.rejects(f.api.create({ token: preview.token }));
    if (mode === "object-exists") { const found = await f.api.create({ token: preview.token }); assert.equal(found.created, false); assert.equal(found.recovered, true); }
    else await assert.rejects(f.api.create({ token: preview.token }), { code: "species_creation_unconfirmed" });
    assert.equal(creates(f).length, 1);
    if (mode === "missing") await assert.rejects(f.api.preview(f.payload()), { code: "species_creation_unconfirmed" });
  }
});

test("local inputs and returned DTOs cannot mutate the privately bound candidate, and no local source is written", async t => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "shared-creation-source-")), filename = path.join(root, "source.json");
  t.after(() => fs.rm(assertTestTempPath(root), { recursive: true, force: true, maxRetries: 3, retryDelay: 25 }));
  await fs.writeFile(filename, JSON.stringify(values)); const before = await fs.readFile(filename), f = fixture(), input = f.payload();
  f.hooks.prepare = async payload => {
    const bytes = await fs.readFile(filename), normalized = validateNewSpeciesValues(payload.values), built = buildNewSpeciesEntry(normalized.values);
    return { values: normalized.values, ...built, sourceHash: digest(bytes) };
  };
  const preview = await f.api.preview(input); input.values.german = "Spätere äußere Änderung"; preview.species.germanName = "Manipulierte Ansicht";
  await f.api.create({ token: preview.token }); assert.equal(creates(f)[0].input.data.input.german, values.german);
  assert.deepEqual(await fs.readFile(filename), before); assert.deepEqual(await fs.readdir(root), ["source.json"]);
});

test("expired previews and closure during an actual pending source read cannot write; uncertain tokens never regain POST permission after expiry", async () => {
  const f = fixture(), preview = await f.api.preview(f.payload()); f.setTime(1000);
  await assert.rejects(f.api.create({ token: preview.token }), { code: "review_required" }); assert.equal(creates(f).length, 0);
  const g = fixture(), entered = deferred(), release = deferred();
  g.hooks.prepare = async () => { entered.resolve(); await release.promise; return undefined; };
  const pending = g.api.preview(g.payload()), rejected = assert.rejects(pending, { code: "client_closed" });
  await entered.promise; g.api.close(); release.resolve(); await rejected; assert.equal(creates(g).length, 0);
  const h = fixture(), uncertain = await h.api.preview(h.payload()); h.hooks.create = () => { throw new Error("lost"); };
  await assert.rejects(h.api.create({ token: uncertain.token })); h.setTime(100000);
  await assert.rejects(h.api.create({ token: uncertain.token }), { code: "species_creation_unconfirmed" }); assert.equal(creates(h).length, 1);
});
