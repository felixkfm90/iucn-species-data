import assert from "node:assert/strict";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createSharedProjectSnapshot, validateAndRestoreSharedProjectSnapshot } from "../../nas/snapshot.mjs";
import { createTestWebp } from "../server-test-fixtures.mjs";
import { editorialIntegrationFixture } from "./editorial-integration-fixtures.mjs";
import { createSharedProjectHttp } from "./http.mjs";
import { normalMediaBinding } from "./normal-media.mjs";
import { digest, objectJson } from "./security.mjs";
import { buildPageEditorialAdoption } from "./species-editorial-adoption.mjs";
import { projectSpeciesEnrichment, SPECIES_ENRICHMENT_MARKER, validateSpeciesEnrichmentChange } from "./species-enrichment.mjs";
import { fixture } from "./test-fixtures.mjs";
import { createSharedProjectStore } from "./store.mjs";

async function scoped(run) {
  const f = fixture();
  try {
    const setup = await f.initialized();
    await run({ f, ...setup, ...editorialIntegrationFixture(setup.store, setup.a) });
  } finally { f.cleanup(); }
}
const binding = login => ({ projectId: login.projectId, userId: login.user.id, role: login.user.role });
function schema(filename) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try { return db.prepare("PRAGMA user_version").get().user_version; }
  finally { db.close(); }
}
const sourceResult = extra => ({ generated: { Family: "Strigidae" }, files: {}, credits: null, assessmentBinding: null, ...extra });
function proposal(speciesObject, login, { changeId = "enrichment-fixture", result = sourceResult() } = {}) {
  const { data, sourceBindings, complete } = projectSpeciesEnrichment({ speciesObject, projectId: login.projectId, result });
  assert.equal(complete, true);
  return { changeId, kind: "species", id: speciesObject.id, baseRevision: speciesObject.revision, enrichment: {
    schemaVersion: 1, actor: { ...binding(login), userVersion: login.user.version }, sourceBindings, result, targetDataHash: digest(objectJson(data)),
  } };
}

test("a reviewed source is applied through HTTP once, with no effect on the prior reader release", () => scoped(async ({ store, a, speciesObject }) => {
  const { id, revision } = speciesObject;
  store.approveObject(a.token, "species", id, { expectedRevision: revision });
  const before = store.catalog(a.token).species;
  const input = proposal(store.getObject(a.token, "species", id), a);
  const api = createSharedProjectHttp({ store });
  const address = await api.listen();
  try {
    const headers = { Authorization: `Bearer ${a.token}`, "Content-Type": "application/json" };
    const send = async (path, method, data, marker) => {
      const response = await fetch(`${address.url}/api/v1/${path}`, { method, headers: {
        ...headers, ...(marker ? { "X-Shared-Object-Type": marker } : {}),
      }, ...(data ? { body: JSON.stringify(data) } : {}) });
      return { status: response.status, body: await response.json() };
    };
    assert.equal((await send("capabilities", "GET")).body.speciesEnrichment, 1);
    assert.equal((await send("changes", "POST", input)).body.error.code, "object_type_mismatch");
    assert.equal((await send(`objects/species/${id}`, "PUT", input, SPECIES_ENRICHMENT_MARKER)).body.error.code, "object_type_mismatch");
    assert.equal((await send("changes", "POST", { ...input, data: speciesObject.data }, SPECIES_ENRICHMENT_MARKER)).body.error.code, "invalid_species_enrichment");
    const applied = await send("changes", "POST", input, SPECIES_ENRICHMENT_MARKER);
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    const draft = applied.body.object;
    assert.equal(applied.body.status, "applied");
    assert.equal(draft.ordinal, 2);
    assert.equal(draft.approvedRevision, revision);
    assert.equal(draft.approval, "draft");
    assert.equal(draft.data.generated.Family, "Strigidae");
    assert.equal(draft.data.generated.originalUnknown, "protected");
    assert.deepEqual(draft.data.editorial, speciesObject.data.editorial);
    assert.deepEqual(store.catalog(a.token).species, before);
    const replay = await send("changes", "POST", input, SPECIES_ENRICHMENT_MARKER);
    assert.deepEqual(replay.body, { ...applied.body, replayed: true });
    const mismatch = structuredClone(input);
    mismatch.enrichment.targetDataHash = "f".repeat(64);
    assert.equal((await send("changes", "POST", mismatch, SPECIES_ENRICHMENT_MARKER)).body.error.code, "change_id_reused");
  } finally { await api.close(); }
}));

test("actor drift, a mismatched projection, a concurrent edit and a cancellation cannot write", () => scoped(async ({ f, store, a, b, speciesObject }) => {
  const input = proposal(speciesObject, a), { id, revision, data } = speciesObject;
  assert.throws(() => store.submitChange(b.token, input), { code: "species_enrichment_changed" });
  const wrongVersion = structuredClone(input); wrongVersion.enrichment.actor.userVersion++;
  assert.throws(() => store.submitChange(a.token, wrongVersion), { code: "species_enrichment_changed" });
  const wrongHash = structuredClone(input); wrongHash.enrichment.targetDataHash = "f".repeat(64);
  assert.throws(() => store.submitChange(a.token, wrongHash), { code: "species_enrichment_review_changed" });
  const cancelled = proposal(speciesObject, a, { changeId: "enrichment-cancelled" });
  store.cancelChange(a.token, { changeId: cancelled.changeId, requestHash: validateSpeciesEnrichmentChange(cancelled).requestHash });
  assert.equal(store.submitChange(a.token, cancelled).status, "cancelled");
  const concurrent = store.submitChange(b.token, { kind: "species", id, baseRevision: revision, changeId: "manual-fixture-edit",
    data: { ...data, input: { ...data.input, size: "35 cm" } } }).object;
  assert.throws(() => store.submitChange(a.token, input), { code: "species_enrichment_changed" });
  assert.deepEqual(store.getObject(a.token, "species", id), concurrent);
  assert.deepEqual(store.listConflicts(a.token), []);
  assert.equal(schema(f.filename), 6);
}));

test("new image bytes remain a release prerequisite after later manual editing and reopening", () => scoped(async ({ f, store, a, speciesObject }) => {
  const { id, revision } = speciesObject;
  store.approveObject(a.token, "species", id, { expectedRevision: revision });
  const slot = "portrait.webp", bytes = createTestWebp(), mimeType = "image/webp";
  const result = sourceResult({ files: { [slot]: { sha256: digest(bytes), bytes: bytes.length, mimeType } } });
  assert.equal(schema(f.filename), 6);
  const draft = store.submitChange(a.token, proposal(speciesObject, a, { result })).object;
  assert.equal(schema(f.filename), 7);
  const head = store.submitChange(a.token, { kind: "species", id, changeId: "later-manual-edit", baseRevision: draft.revision,
    data: { ...draft.data, input: { ...draft.data.input, size: "35 cm" } } }).object;
  store.close();
  const reopened = f.open(), approval = { expectedRevision: head.revision };
  assert.throws(() => reopened.approveObject(a.token, "species", id, approval), { code: "reader_media_required" });
  assert.equal(reopened.getObject(a.token, "species", id).approvedRevision, revision);
  const { asset } = normalMediaBinding(head.data, { projectId: a.projectId, slot });
  const expectedBinding = binding(a);
  const pending = reopened.declareNormalMedia(a.token, { speciesId: id, slot, expectedRevision: head.revision, asset, expectedBinding });
  assert.equal(pending.complete, false);
  assert.throws(() => reopened.approveObject(a.token, "species", id, approval), { code: "reader_media_required" });
  const snapshotDirectory = path.join(f.root, "guard-snapshot"), destination = path.join(f.root, "guard-restored.sqlite");
  const snapshot = await createSharedProjectSnapshot({ filename: f.filename, destination: snapshotDirectory, localStorageConfirmed: true });
  assert.equal(snapshot.databaseSchema, 7);
  assert.equal((await validateAndRestoreSharedProjectSnapshot({ snapshotDirectory, destination, localStorageConfirmed: true })).verified, true);
  const restored = createSharedProjectStore({ filename: destination, localStorageConfirmed: true });
  try {
    assert.equal(restored.getObject(a.token, "species", id).approvedRevision, revision);
    assert.throws(() => restored.approveObject(a.token, "species", id, approval), { code: "reader_media_required" });
  } finally { restored.close(); }
  const media = await reopened.putNormalMedia(a.token, pending.contentId, bytes, { expectedBinding, mimeType });
  assert.equal(media.complete, true);
  assert.equal(reopened.approveObject(a.token, "species", id, approval).approvedRevision, head.revision);
}));

test("structured editorial content and its source binding survive a real enrichment adoption", () => scoped(async source => {
  const { store, a, speciesObject } = source;
  const adoption = buildPageEditorialAdoption(source);
  const rich = store.submitChange(a.token, { changeId: "first-editorial-review", kind: "species", id: speciesObject.id,
    baseRevision: speciesObject.revision, data: adoption.data, intent: adoption.intent }).object;
  const result = store.submitChange(a.token, proposal(rich, a)).object;
  assert.equal(result.data.schemaVersion, 2);
  assert.deepEqual(result.data.editorial, rich.data.editorial);
  assert.equal(result.data.generated.Family, "Strigidae");
  assert.equal(result.parentRevision, rich.revision);
}));
