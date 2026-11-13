import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./test-fixtures.mjs";
import { editorialIntegrationFixture } from "./editorial-integration-fixtures.mjs";
import { buildPageEditorialAdoption } from "./species-editorial-adoption.mjs";
import { objectJson, digest, transportJson } from "./security.mjs";
import { imageMediaReferences } from "./image-media.mjs";
import { referencedClientImages } from "./client-image-media.mjs";
import { projectSpeciesRecordToExplorer } from "./species-view.mjs";
import { fingerprint } from "../page-authoring/contract.mjs";

const denied = code => error => error.code === code;
async function scoped(fn) {
  const f = fixture();
  try { const value = await f.initialized(); await fn({ f, ...value, ...editorialIntegrationFixture(value.store, value.a) }); }
  finally { f.cleanup(); }
}
const request = (source, candidate, changeId = "editorial-first-write") => ({ kind: "species", id: source.speciesObject.id,
  baseRevision: source.speciesObject.revision, changeId, data: candidate.data, intent: candidate.intent });
const requestHash = ({ kind, id, baseRevision, data, intent }) => digest(transportJson({ kind, id, baseRevision, data, intent }));
function changePage(store, login, before) {
  const data = structuredClone(before.data); data.document.title += " – neue Seite";
  data.title = data.document.title; data.contentHash = fingerprint(data.document); data.revision = fingerprint(data.document.title);
  return store.submitChange(login.token, { kind: "page", id: before.id, baseRevision: before.revision, changeId: "page-source-changed", data }).object;
}

test("real adoption writes one lossless draft version and preserves the previously approved reader catalog", () => scoped(async source => {
  const { store, a, speciesObject, pageObject } = source;
  store.approveObject(a.token, "species", speciesObject.id, { expectedRevision: speciesObject.revision });
  const beforeCatalog = store.catalog(a.token).species, candidate = buildPageEditorialAdoption(source);
  const result = store.submitChange(a.token, request(source, candidate));
  assert.equal(result.status, "applied"); assert.equal(result.object.ordinal, 2);
  assert.equal(result.object.approval, "draft"); assert.equal(result.object.approvedRevision, speciesObject.revision);
  for (const key of ["type", "id", "input", "generated", "taxonomyOverride", "assessmentBinding", "assets"]) {
    assert.deepEqual(result.object.data[key], speciesObject.data[key]);
  }
  assert.deepEqual(result.object.data.editorial, candidate.data.editorial);
  assert.deepEqual(store.catalog(a.token).species, beforeCatalog);
  assert.deepEqual(store.getObject(a.token, "page", pageObject.id), pageObject);
  assert.throws(() => store.approveObject(a.token, "species", speciesObject.id, { expectedRevision: result.object.revision }), denied("reader_catalog_version_required"));
  const display = projectSpeciesRecordToExplorer(result.object);
  assert.equal(display.sourceInfo.recordSchemaVersion, 2);
  assert.equal(display.editorial.sections[0].text, "Vollständige Einleitung");
  assert.ok(display.editorial.sections.every(section => typeof section.text === "string"));
}));

test("a committed request replays after a later page change, while a reused ID with another proof cannot write", () => scoped(async source => {
  const { store, a, pageObject } = source, candidate = buildPageEditorialAdoption(source), input = request(source, candidate);
  const first = store.submitChange(a.token, input); changePage(store, a, pageObject);
  const replay = store.submitChange(a.token, JSON.parse(JSON.stringify(input)));
  assert.equal(replay.replayed, true); assert.deepEqual(replay.object, first.object);
  assert.equal(store.getObject(a.token, "species", source.speciesObject.id).ordinal, 2);
  const changed = structuredClone(input); changed.intent.projectionHash = "f".repeat(64);
  assert.throws(() => store.submitChange(a.token, changed), denied("change_id_reused"));
}));

test("changed page, person, role, projection and protected data all stop before the first species write", () => scoped(async source => {
  const { store, a, b, speciesObject, pageObject } = source, candidate = buildPageEditorialAdoption(source), input = request(source, candidate);
  assert.throws(() => store.submitChange(b.token, input), denied("editorial_adoption_changed"));
  for (const mutate of [value => { value.intent.binding.role = "contributor"; }, value => { value.intent.projectionHash = "a".repeat(64); },
    value => { value.data.input.german = "Manipulierte Art"; }, value => { value.data.generated.originalUnknown = "changed"; }]) {
    const changed = structuredClone(input); mutate(changed);
    assert.throws(() => store.submitChange(a.token, changed), denied("editorial_adoption_changed"));
  }
  changePage(store, a, pageObject);
  assert.throws(() => store.submitChange(a.token, input), denied("editorial_adoption_changed"));
  assert.deepEqual(store.getObject(a.token, "species", speciesObject.id), speciesObject);
}));

test("generic creation and changes cannot bypass the dedicated adoption purpose", () => scoped(async source => {
  const { store, a, speciesObject } = source, candidate = buildPageEditorialAdoption(source);
  const another = structuredClone(candidate.data); another.id = "different-owl"; another.editorial.sourceBindings.species.id = another.id;
  assert.throws(() => store.createObject(a.token, { kind: "species", id: another.id, data: another }), denied("species_record_adoption_required"));
  const input = request(source, candidate); delete input.intent;
  assert.throws(() => store.submitChange(a.token, input), denied("species_record_adoption_required"));
  assert.deepEqual(store.getObject(a.token, "species", speciesObject.id), speciesObject);
}));

test("concurrent species changes preserve a rich conflict and require a fresh editorial review instead of a generic merge", () => scoped(async source => {
  const { store, a, b, speciesObject } = source, candidate = buildPageEditorialAdoption(source), input = request(source, candidate);
  const foreign = structuredClone(speciesObject.data); foreign.input.size = "31 cm";
  const newer = store.submitChange(b.token, { changeId: "other-manual-change", kind: "species", id: speciesObject.id,
    baseRevision: speciesObject.revision, data: foreign }).object;
  const result = store.submitChange(a.token, input); assert.equal(result.status, "conflict");
  const conflict = store.getConflict(a.token, result.conflictId);
  assert.deepEqual(conflict.base, speciesObject.data); assert.deepEqual(conflict.current, foreign); assert.deepEqual(conflict.proposed, candidate.data);
  assert.throws(() => store.resolveConflict(a.token, conflict.id, { expectedRevision: newer.revision, strategy: "proposed" }), denied("editorial_adoption_review_required"));
  assert.equal(store.getConflict(a.token, conflict.id).resolvedAt, null);
  const kept = store.resolveConflict(a.token, conflict.id, { expectedRevision: newer.revision, strategy: "current" });
  assert.deepEqual(kept.object.data, foreign); assert.equal(kept.conflict.resolution, "current");
}));

test("managed gallery uses asset identity while keeping separate image-usage identity", () => {
  const asset = { id: "image-11111111-1111-4111-8111-111111111111", projectId: "fixture-project", bytes: 321,
    sha256: "b".repeat(64), mimeType: "image/png", attribution: "Eigene Aufnahme" };
  const data = { type: "fn-species-record", schemaVersion: 2, assets: { files: {} }, editorial: { normalAssets: {},
    gallery: [{ id: "usage-one", asset, alt: "Erstes Motiv" }, { id: "usage-two", asset: { ...asset }, alt: "Zweites Motiv" }] } };
  assert.deepEqual(imageMediaReferences(data), [asset, asset]); assert.deepEqual(referencedClientImages(data), [asset]);
  assert.equal(JSON.parse(objectJson(data)).editorial.gallery.length, 2);
  data.editorial.normalAssets.map = { ...asset };
  assert.deepEqual(imageMediaReferences(data), [asset, asset, asset]);
  // A wrong-MIME/absent fixed file is not a valid normal-role exception.
  assert.deepEqual(referencedClientImages(data), [asset]);
  data.editorial.normalAssets.map.attribution = "Abweichender Medienbeleg";
  assert.equal(imageMediaReferences(data).at(-1).attribution, "Abweichender Medienbeleg");
  assert.deepEqual(referencedClientImages(data), [asset]);
  data.editorial.normalAssets.portrait = { ...asset, mimeType: "image/webp" };
  data.assets.files["portrait.webp"] = { id: asset.id, sha256: asset.sha256, bytes: asset.bytes, mimeType: "image/webp" };
  for (const usage of data.editorial.gallery) usage.asset.mimeType = "image/webp";
  assert.deepEqual(referencedClientImages(data), []);
  data.editorial.gallery[1].asset.sha256 = "c".repeat(64);
  // One genuine gallery binding may coexist with an unrelated normal ID.
  assert.deepEqual(referencedClientImages(data), [{ ...asset, mimeType: "image/webp", sha256: "c".repeat(64) }]);
  data.editorial.gallery[0].asset.sha256 = "d".repeat(64);
  assert.throws(() => referencedClientImages(data), denied("image_media_changed"));
});

test("explicit cancellation durably wins against every later retry without changing the species or page", () => scoped(async source => {
  const { store, a, f, speciesObject, pageObject } = source, input = request(source, buildPageEditorialAdoption(source));
  const cancellation = { changeId: input.changeId, requestHash: requestHash(input) };
  assert.deepEqual(store.cancelChange(a.token, cancellation), { status: "cancelled", changeId: input.changeId });
  assert.equal(store.cancelChange(a.token, cancellation).replayed, true);
  assert.equal(store.submitChange(a.token, input).status, "cancelled");
  assert.deepEqual(store.getObject(a.token, "species", speciesObject.id), speciesObject);
  assert.deepEqual(store.getObject(a.token, "page", pageObject.id), pageObject);
  store.close(); const reopened = f.open();
  assert.equal(reopened.submitChange(a.token, input).status, "cancelled");
  assert.throws(() => reopened.cancelChange(a.token, { ...cancellation, requestHash: "f".repeat(64) }), denied("change_id_reused"));
}));

test("cancellation returns an already committed receipt and never undoes the accepted version", () => scoped(async source => {
  const { store, a } = source, input = request(source, buildPageEditorialAdoption(source));
  const accepted = store.submitChange(a.token, input);
  const result = store.cancelChange(a.token, { changeId: input.changeId, requestHash: requestHash(input) });
  assert.equal(result.status, "applied"); assert.equal(result.replayed, true); assert.deepEqual(result.object, accepted.object);
  assert.deepEqual(store.getObject(a.token, "species", input.id), accepted.object);
}));

test("cancellation is scoped to the authenticated person and requires an exact bounded request identity", () => scoped(async source => {
  const { store, a, b } = source, input = request(source, buildPageEditorialAdoption(source));
  const cancellation = { changeId: input.changeId, requestHash: requestHash(input) };
  store.cancelChange(b.token, cancellation);
  assert.equal(store.submitChange(a.token, input).status, "applied");
  assert.throws(() => store.cancelChange(a.token, { ...cancellation, requestHash: "wrong" }), denied("invalid_change"));
  const read = await store.login({ username: a.user.username, password: source.f.password, scope: "read" });
  assert.throws(() => store.cancelChange(read.token, cancellation), denied("forbidden"));
}));
