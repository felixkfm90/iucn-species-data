import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createExplorerNormalOffline } from "./explorer-normal-offline.mjs";
import { digest, objectJson, transportJson } from "./security.mjs";
import { normalMediaBinding } from "./normal-media.mjs";
import { matchProjectFeatureRoute, invokeSharedProjectOperation } from "../project-feature-routes.mjs";
import { fixture as sharedFixture } from "./test-fixtures.mjs";
import { createSharedProjectHttp } from "./http.mjs";
import { createSharedProjectClient } from "./client.mjs";
import { createExplorerSharedProjectService } from "./explorer-service.mjs";
import { inspectWebp } from "../../scripts/image-header.mjs";

function fixture() {
  const data = { type: "fn-species-record", schemaVersion: 1, id: "fixture-owl",
    input: { german: "Testkauz", genus: "Strix", species: "fixture" }, generated: {}, taxonomyOverride: null, assessmentBinding: null,
    assets: { assetName: "Testkauz", files: { "portrait.webp": { id: "old-portrait", sha256: "a".repeat(64), bytes: 30, mimeType: "image/webp" },
      "sound.mp3": { id: "old-sound", sha256: "b".repeat(64), bytes: 1251, mimeType: "audio/mpeg" } },
    overrides: {}, credits: null, portraitMetadata: null },
    editorial: { websiteUrl: null, sections: [], gallery: [], generalSectionId: null, embeddedGeneralText: null } };
  const object = { kind: "species", id: data.id, revision: "11111111-1111-4111-8111-111111111111", data,
    approval: "draft", approvedRevision: null, localPending: false, localConflict: false };
  const state = { status: { baseUrl: "https://fixture.example", projectId: "project", user: { id: "owner", role: "admin" },
    connection: "online", readOnlySession: false }, permissions: { canRead: true } };
  const locals = new Map(), downloads = [], hooks = {};
  const metadata = slot => ({ ...normalMediaBinding(data, { projectId: state.status.projectId, slot }), complete: true,
    width: slot === "sound.mp3" ? null : 6, height: slot === "sound.mp3" ? null : 4 });
  const client = { status: async () => structuredClone(state.status), getObject: async () => structuredClone(object), normalMedia: {
    async describeLocal({ contentId }) { await hooks.describe?.(); if (!locals.has(contentId)) throw Object.assign(new Error("not downloaded"), { code: "normal_media_not_local" }); return { metadata: locals.get(contentId), localAvailable: true }; },
    async download(input) { downloads.push(input); await hooks.download?.(input); const value = metadata(input.slot); locals.set(value.contentId, value); return { metadata: value, localAvailable: true }; },
  } };
  const api = createExplorerNormalOffline({ withClient: work => work(client, structuredClone(state)) });
  const input = () => ({ sourceScope: digest(transportJson([state.status.baseUrl, state.status.projectId, state.status.user.id])),
    expectedRevision: object.revision, expectedEditRevision: digest(transportJson({ kind: object.kind, id: object.id, revision: object.revision, data: object.data })) });
  return { api, input, state, object, locals, downloads, hooks, metadata };
}

test("offline selection previews only local bounded metadata and does not download, expose records or approve", async () => {
  const f = fixture(), value = await f.api.preview("fixture-owl", f.input());
  assert.deepEqual(value.files.map(file => [file.slot, file.bytes, file.localAvailable]), [["portrait.webp", 30, false], ["sound.mp3", 1251, false]]);
  assert.equal(value.downloadAvailable, true); assert.equal(value.totalBytes, 1281); assert.equal(f.downloads.length, 0);
  assert.doesNotMatch(JSON.stringify(value), /old-portrait|normal-|assets|portraitMetadata|sha256|source_data/);
  assert.equal(value.externalPublication, "not-performed");
});

test("only explicitly selected current slots download; no sync, upload or approval is implied", async () => {
  const f = fixture(), result = await f.api.download("fixture-owl", { ...f.input(), slots: ["sound.mp3"] });
  assert.equal(result.complete, true); assert.deepEqual(result.completed, [{ slot: "sound.mp3", bytes: 1251 }]);
  assert.deepEqual(f.downloads.map(value => value.slot), ["sound.mp3"]);
  assert.deepEqual(f.downloads[0].requiredBinding, { baseUrl: "https://fixture.example", projectId: "project", userId: "owner", role: "admin" });
  assert.equal((await f.api.preview("fixture-owl", f.input())).files[1].localAvailable, true);
});

test("invalid paths, duplicate slots, stale source and pending edits stop before any download", async () => {
  const f = fixture();
  for (const slots of [["../sound.mp3"], ["sound.mp3", "sound.mp3"], ["map.jpg"], []])
    await assert.rejects(f.api.download("fixture-owl", { ...f.input(), slots }), { code: "invalid_offline_selection" });
  await assert.rejects(f.api.download("fixture-owl", { ...f.input(), expectedEditRevision: "stale", slots: ["sound.mp3"] }), { code: "offline_source_changed" });
  f.object.localPending = true;
  assert.equal((await f.api.preview("fixture-owl", f.input())).downloadAvailable, false);
  await assert.rejects(f.api.download("fixture-owl", { ...f.input(), slots: ["sound.mp3"] }), { code: "pending_review" });
  assert.equal(f.downloads.length, 0);
});

test("a later file failure preserves complete earlier files and never retries automatically", async () => {
  const f = fixture(); f.hooks.download = input => { if (input.slot === "sound.mp3") throw Object.assign(new Error("full"), { code: "normal_media_quota" }); };
  const result = await f.api.download("fixture-owl", { ...f.input(), slots: ["portrait.webp", "sound.mp3"] });
  assert.equal(result.complete, false); assert.deepEqual(result.completed, [{ slot: "portrait.webp", bytes: 30 }]);
  assert.equal(result.stopped.slot, "sound.mp3"); assert.equal(result.stopped.code, "normal_media_quota"); assert.equal(f.locals.size, 1);
  assert.equal(f.downloads.length, 2);
});

test("person or source drift after awaiting local metadata cannot return a stale selection", async () => {
  const f = fixture(); f.hooks.describe = () => { f.state.status.user.id = "other"; };
  await assert.rejects(f.api.preview("fixture-owl", f.input()), { code: "offline_source_changed" });
  const g = fixture(); g.hooks.describe = () => { g.object.data.input.german = "Anderer Name"; };
  await assert.rejects(g.api.preview("fixture-owl", g.input()), { code: "offline_source_changed" });
});

test("offline preview stays available to a reader; downloading requires online and confirmed source", async () => {
  const f = fixture(); f.state.status.connection = "offline"; f.state.status.user.role = "reader"; f.state.status.readOnlySession = true;
  f.object.approval = "approved"; f.object.approvedRevision = f.object.revision;
  assert.equal((await f.api.preview("fixture-owl", f.input())).downloadAvailable, false);
  await assert.rejects(f.api.download("fixture-owl", { ...f.input(), slots: ["portrait.webp"] }), { code: "offline" });
  f.state.status.connection = "online";
  assert.equal((await f.api.download("fixture-owl", { ...f.input(), slots: ["portrait.webp"] })).complete, true);
  f.object.approval = "draft";
  await assert.rejects(f.api.preview("fixture-owl", f.input()), { code: "forbidden" });
});

test("offline routes expose selection and explicit download only, never local media buffers", async () => {
  const url = "/api/shared-project/species/fixture-owl/offline/";
  for (const action of ["preview", "download"]) {
    const route = matchProjectFeatureRoute("POST", url + action); assert.equal(route.action, `species-offline-${action}`);
    assert.equal(matchProjectFeatureRoute("GET", url + action), null);
    const payload = { reviewed: true }; let called;
    assert.equal(await invokeSharedProjectOperation({ normalOffline: { [action]: (id, value) => { called = { id, value }; return "ok"; } } }, { ...route, payload }), "ok");
    assert.deepEqual(called, { id: "fixture-owl", value: payload });
  }
  assert.equal(matchProjectFeatureRoute("POST", url + "read"), null);
});

test("the actual client, HTTP service and SQLite cache connect the Explorer selection to a verified persistent download", async () => {
  const f = sharedFixture(); let http, uploader, explorer;
  try {
    const bytes = Buffer.alloc(30); bytes.write("RIFF"); bytes.writeUInt32LE(22, 4); bytes.write("WEBPVP8X", 8);
    bytes.writeUInt32LE(10, 16); bytes.writeUIntLE(5, 24, 3); bytes.writeUIntLE(3, 27, 3);
    const imageDecode = async buffer => { const value = inspectWebp(buffer); return { width: value.width, height: value.height }; };
    const { store, a } = await f.initialized({ imageDecode });
    const data = fixture().object.data; delete data.assets.files["sound.mp3"];
    data.assets.files["portrait.webp"] = { id: "old-portrait", sha256: digest(bytes), bytes: bytes.length, mimeType: "image/webp" };
    const source = store.createObject(a.token, { kind: "species", id: data.id, data });
    http = createSharedProjectHttp({ store }); const address = await http.listen();
    const options = { localStorageConfirmed: true, allowLoopbackHttp: true, imageDecode };
    uploader = createSharedProjectClient({ ...options, filename: path.join(f.root, "offline-provider.sqlite") });
    await uploader.connect({ baseUrl: address.url, username: a.user.username, password: f.password });
    const connected = await uploader.status();
    await uploader.normalMedia.upload({ speciesId: data.id, slot: "portrait.webp", expectedRevision: source.revision,
      expectedDataHash: digest(objectJson(data)), buffer: bytes,
      requiredBinding: { baseUrl: address.url, projectId: connected.projectId, userId: a.user.id, role: "admin" } });
    let network = 0;
    explorer = createExplorerSharedProjectService({ ...options, filename: path.join(f.root, "offline-explorer.sqlite"),
      fetchImpl: (...args) => { network++; return fetch(...args); } });
    await explorer.connect({ baseUrl: address.url, username: a.user.username, password: f.password });
    const shown = await explorer.speciesEditor.get(data.id), input = { sourceScope: shown.sourceScope, expectedRevision: shown.revision, expectedEditRevision: shown.editRevision };
    const before = network, preview = await explorer.normalOffline.preview(data.id, input);
    assert.equal(network, before); assert.equal(preview.files[0].localAvailable, false);
    assert.deepEqual((await explorer.normalOffline.content(data.id, "portrait.webp", input)).buffer, bytes);
    assert.equal((await explorer.normalOffline.preview(data.id, input)).files[0].localAvailable, false, "an ordinary view does not install offline media");
    const result = await explorer.normalOffline.download(data.id, { ...input, slots: ["portrait.webp"] });
    assert.equal(result.complete, true); assert.ok(network > before);
    const after = network; assert.equal((await explorer.normalOffline.preview(data.id, input)).files[0].localAvailable, true);
    assert.equal(network, after); assert.equal((await explorer.snapshot()).queuedChanges, 0);
    await http.close();
    await assert.rejects(explorer.refresh(), { code: "offline" });
    const disconnected = network;
    assert.deepEqual((await explorer.normalOffline.content(data.id, "portrait.webp", input)).buffer, bytes);
    assert.equal(network, disconnected, "the previously downloaded file is readable while the project service is down");
    assert.equal(store.getObject(a.token, "species", data.id).approval, "draft");
  } finally { await explorer?.close(); await uploader?.close(); await http?.close(); f.cleanup(); }
});
