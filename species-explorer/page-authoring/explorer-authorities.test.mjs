import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { validateImageDecode } from "../../scripts/image-validation.mjs";
import { resolveFfmpegPath } from "../../scripts/spectrogram-renderer.mjs";
import { createTestWebp, createTestJpeg, createTestPng } from "../server-test-fixtures.mjs";
import { fingerprint, sha256 } from "./contract.mjs";
import { createExplorerPageAuthorities } from "./explorer-authorities.mjs";
import { speciesNormalAssets } from '../shared-project/species-editorial.mjs';
import { normalMediaBinding } from '../shared-project/normal-media.mjs';
import { objectJson,digest } from '../shared-project/security.mjs';

const PUBLIC = "https://felixkfm90.github.io/iucn-species-data/", PROJECT = "project-a", USER = { id: "user-a", role: "admin" };
const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const fixtureFfmpegPath = resolveFfmpegPath({ repoRoot: workspaceRoot });
const decodeFixtureImage = (buffer, options) => validateImageDecode(buffer, { ...options, ffmpegPath: fixtureFfmpegPath });
const clone = (value) => structuredClone(value), code = (...codes) => (error) => codes.includes(error.code);
async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "page-authorities-")), webp = createTestWebp(), jpeg = createTestJpeg(), png = createTestPng(6, 4);
  const data = { type: "fn-species-record", schemaVersion: 1, id: "iguanaiguana", input: { german: "Grüner Leguan", english: "Green iguana", genus: "Iguana", species: "iguana", size: "150 cm", weight: "4 kg", life_expectancy: "20 Jahre", privateInput: "Private input sentinel" },
    generated: { URLSlug: "iguanaiguana", "Wissenschaftlicher Name": "Iguana iguana", "Deutscher Name": "Grüner Leguan", "Englischer Name": "Green iguana", Größe: "150 cm", Gewicht: "4 kg", Lebenserwartung: "20 Jahre",
      Kingdom: "Animalia", Phylum: "Chordata", Subphylum: "Vertebrata", Class: "Reptilia", Order: "Squamata", Family: "Iguanidae", Genus: "Iguana", Species: "iguana", Status: "LC", Kategorie: "Nicht gefährdet", Trend: "Stabil", "Assessment ID": 42, privateGenerated: "Private generated sentinel" },
    taxonomyOverride: null, assessmentBinding: { id: 42 }, assets: { assetName: "Gruener Leguan", files: {}, overrides: { map: { source: "Eigene Karte" } }, credits: null,
      portraitMetadata: { type: "Foto", source: "Eigene Aufnahme", prompt: "Private prompt sentinel" } },
    editorial: { websiteUrl: null, sections: [{ id: "habitat", title: "Lebensraum", text: "Redaktioneller Fachtext", intentionallyEmpty: false }], gallery: [], generalSectionId: null, embeddedGeneralText: null } };
  for (const [filename, bytes, mimeType] of [["portrait.webp", webp, "image/webp"], ["map.jpg", jpeg, "image/jpeg"]]) data.assets.files[filename] = { id: `normal-${filename.replace(".", "-")}`, bytes: bytes.length, sha256: sha256(bytes), mimeType };
  let status = { baseUrl: "https://project.invalid", projectId: PROJECT, user: clone(USER), connection: "online",readOnlySession:false }, objects = [{ kind: "species", id: data.id, data,
    revision: "11111111-1111-4111-8111-111111111111", approval: "draft",localPending:false,localConflict:false }];
  const publicRows = [clone(data.generated)], calls = [], hooks = {}, requests = [], binaries = new Map([
    [`species-assets/${encodeURIComponent(data.assets.assetName)}/portrait.webp`, webp], [`species-assets/${encodeURIComponent(data.assets.assetName)}/map.jpg`, jpeg],
  ]), managed = { id: `image-${randomUUID()}`, projectId: PROJECT, bytes: png.length, sha256: sha256(png), mimeType: "image/png", attribution: "Eigene Aufnahme", width: 6, height: 4 };
  const client = { status: async () => clone(status), capabilities: async () => { calls.push("capabilities"); await hooks.capabilities?.(); return { projectId: status.projectId, user: clone(status.user) }; },
    refresh: async () => { calls.push("refresh"); await hooks.refresh?.(); return clone(status); },
    getObject: async (_kind, id) => clone(objects.find((item) => item.id === id)), listObjects: async () => clone(objects),
    media: { describeImage: async () => ({ ...managed, localAvailable: true, remoteBacked: false, complete: true }), readImage: async () => ({ ...managed, buffer: Buffer.from(png) }) } };
  const fetchImpl = async (url, init) => {
    requests.push({ url, init }); if (hooks.fetch) return hooks.fetch(url, init);
    const relative = url.slice(PUBLIC.length), bytes = relative === "speciesData.json" ? Buffer.from(JSON.stringify(publicRows)) : binaries.get(relative);
    return new Response(bytes || "Missing", { status: bytes ? 200 : 404, headers: { "Content-Type": relative.endsWith('.json') ? "application/json" : relative.endsWith(".jpg") ? "image/jpeg" : "image/webp", "Content-Length": String(bytes?.length || 7) } });
  };
  const authorities = createExplorerPageAuthorities({ repoRoot: root, fetchImpl, imageDecode: decodeFixtureImage, ...options });
  t.after(async () => { await authorities.close(); await fs.rm(assertTestTempPath(root), { recursive: true, force: true, maxRetries: 3, retryDelay: 20 }); });
  const context = () => ({ client, state: { status: clone(status), permissions: { canRead: true, canEdit: true } }, actor: { id: status.user.id, projectId: status.projectId, role: status.user.role, online: status.connection === "online" }, sourceScope: fingerprint([status.baseUrl, status.projectId, status.user.id]) });
  return { root, data, webp, jpeg, png, managed, authorities, client, context, publicRows, calls, hooks, requests, binaries,
    setStatus(change) { status = { ...status, ...change }; }, setObjects(next) { objects = next; },
    async local(filename, bytes) { const directory = path.join(root, "species-assets", data.assets.assetName); await fs.mkdir(directory, { recursive: true }); await fs.writeFile(path.join(directory, filename), bytes); return path.join(directory, filename); } };
}

test("fresh species snapshots curate real fields and public runtime while binding originals without editorial cycles", async (t) => {
  const f = await fixture(t), first = await f.authorities.speciesAuthority.snapshot(f.context(), f.data.id);
  assert.deepEqual(f.calls, ["capabilities", "refresh"]); assert.equal(first.runtimeReady, true); assert.equal(first.assetName, "Gruener Leguan");
  assert.equal(first.scientificName, "Iguana iguana"); assert.ok(first.taxonomy.some((item) => item.rank === "Subphylum" && item.name === "Vertebrata"));
  assert.ok(first.general.some((item) => item.label === "Größe" && item.value === "150 cm"));
  assert.equal(first.normalAssets.map.attribution, "Quelle: Eigene Karte"); assert.equal(first.revision, `species-${first.dataSha256}`);
  assert.ok(!JSON.stringify(first).includes("Private")); assert.ok(!JSON.stringify(first).includes("Redaktioneller Fachtext"));
  f.data.editorial.sections[0].text = "Spätere Seitenadoption"; f.data.editorial.websiteUrl = "https://www.fnwildlifetravel.de/wildlife/leguan";
  const afterEditorial = await f.authorities.speciesAuthority.snapshot(f.context(), f.data.id); assert.deepEqual(afterEditorial, first);
  f.data.input.size = "160 cm";
  const changed = await f.authorities.speciesAuthority.snapshot(f.context(), f.data.id); assert.notEqual(changed.dataSha256, first.dataSha256); assert.equal(changed.runtimeReady, false);
  for (const request of f.requests) { assert.ok(request.url.startsWith(PUBLIC)); assert.equal(request.init.redirect, "error"); assert.equal(request.init.credentials, "omit"); assert.equal(request.init.cache, "no-store"); assert.equal(Object.hasOwn(request.init.headers, "Authorization"), false); }
});

test("missing, duplicate, changed and unbound public runtime never masquerade as deployment readiness", async (t) => {
  const f = await fixture(t);
  for (const modify of [() => { f.publicRows.length = 0; }, () => { f.publicRows.push(clone(f.data.generated), clone(f.data.generated)); },
    () => { f.publicRows.splice(0, f.publicRows.length, { ...f.data.generated, Gewicht: "9 kg" }); },
    () => { f.publicRows.splice(0, f.publicRows.length, clone(f.data.generated)); f.binaries.clear(); }]) {
    modify(); assert.equal((await f.authorities.speciesAuthority.snapshot(f.context(), f.data.id)).runtimeReady, false);
  }
  f.data.assets.assetName = "Protected Different Folder";
  assert.equal((await f.authorities.speciesAuthority.snapshot(f.context(), f.data.id)).runtimeReady, false);
  f.data.assets.assetName = "Gruener Leguan";
  f.hooks.fetch = () => { throw new Error("Public network unavailable"); };
  assert.equal((await f.authorities.speciesAuthority.snapshot(f.context(), f.data.id)).runtimeReady, false);
  f.hooks.fetch = () => new Response("", { status: 302, headers: { Location: "https://example.org/elsewhere" } });
  assert.equal((await f.authorities.speciesAuthority.snapshot(f.context(), f.data.id)).runtimeReady, false);
  f.hooks.fetch = null; f.binaries.set("species-assets/Gruener%20Leguan/portrait.webp", Buffer.alloc(f.webp.length));
  assert.equal((await f.authorities.speciesAuthority.snapshot(f.context(), f.data.id)).runtimeReady, false);
  assert.throws(() => createExplorerPageAuthorities({ repoRoot: f.root, publicBaseUrl: "https://example.org/" }), code("unsafe_public_source"));
});

test("fresh source rejects person, project, role, authentication and concurrent source drift", async (t) => {
  const f = await fixture(t), context = f.context();
  f.hooks.capabilities = () => f.setStatus({ user: { id: USER.id, role: "reader" } });
  await assert.rejects(f.authorities.speciesAuthority.snapshot(context, f.data.id), code("workspace_changed")); assert.equal(f.requests.length, 0);
  f.setStatus({ user: clone(USER) }); f.hooks.capabilities = () => f.setStatus({ user: { ...USER, id: "another-person" } });
  await assert.rejects(f.authorities.speciesAuthority.snapshot(context, f.data.id), code("workspace_changed"));
  f.setStatus({ user: clone(USER) }); f.hooks.capabilities = null;
  f.hooks.refresh = () => f.setStatus({ baseUrl: "https://another-project.invalid" }); await assert.rejects(f.authorities.speciesAuthority.snapshot(context, f.data.id), code("workspace_changed"));
  f.setStatus({ baseUrl: "https://project.invalid" });
  f.hooks.refresh = () => f.setStatus({ projectId: "other-project" }); await assert.rejects(f.authorities.speciesAuthority.snapshot(context, f.data.id), code("workspace_changed"));
  f.setStatus({ projectId: PROJECT }); f.hooks.refresh = null;
  f.hooks.capabilities = () => { throw Object.assign(new Error("Authentication revoked"), { code: "authentication_required" }); };
  await assert.rejects(f.authorities.speciesAuthority.snapshot(context, f.data.id), code("authentication_required"));
  f.hooks.capabilities = null; f.hooks.fetch = async () => { f.data.input.weight = "5 kg"; return new Response(JSON.stringify(f.publicRows), { headers: { "Content-Type": "application/json" } }); };
  await assert.rejects(f.authorities.speciesAuthority.snapshot(context, f.data.id), code("species_source_changed"));
  f.setStatus({ connection: "offline" }); await assert.rejects(f.authorities.speciesAuthority.snapshot(f.context(), f.data.id), code("online_required"));
});

test("normal media use only exact bound filenames and actual regular local bytes without fetching arbitrary asset URLs", async (t) => {
  const f = await fixture(t); await f.local("portrait.webp", f.webp); f.setStatus({ connection: "offline" });
  f.data.assets.files["portrait.webp"].url = "https://example.org/irrelevant-private-selection.webp";
  const metadata = await f.authorities.mediaFacade.describe(f.context(), "normal-portrait-webp"); assert.equal(metadata.sha256, sha256(f.webp));
  assert.deepEqual(await f.authorities.mediaFacade.read(f.context(), "normal-portrait-webp"), f.webp); assert.equal(f.requests.length, 0);
  await f.local("portrait.webp", Buffer.alloc(f.webp.length)); await assert.rejects(f.authorities.mediaFacade.read(f.context(), metadata.id), code("media_changed"));
  await assert.rejects(f.authorities.mediaFacade.read(f.context(), "../../private"), code("media_binding_ambiguous"));
  await assert.rejects(f.authorities.mediaFacade.describe(f.context(), "not-bound"), code("media_binding_ambiguous"));
  await fs.unlink(path.join(f.root, "species-assets", f.data.assets.assetName, "portrait.webp"));
  await assert.rejects(f.authorities.mediaFacade.read(f.context(), metadata.id), (error) => error.code === "media_not_local" && !error.message.includes(f.root));
});

test("normal media stop ambiguous IDs, unsafe bound folders, hardlinks and directory links", async (t) => {
  const f = await fixture(t), normal = await f.local("portrait.webp", f.webp);
  const second = clone(f.data); second.id = "other-species"; second.generated.URLSlug = second.id;
  f.setObjects([{ kind: "species", id: f.data.id, data: f.data }, { kind: "species", id: second.id, data: second }]);
  await assert.rejects(f.authorities.mediaFacade.describe(f.context(), "normal-portrait-webp"), code("media_binding_ambiguous"));
  f.setObjects([{ kind: "species", id: f.data.id, data: f.data }]);
  f.data.assets.assetName = "../outside"; await assert.rejects(f.authorities.mediaFacade.read(f.context(), "normal-portrait-webp")); f.data.assets.assetName = "Gruener Leguan";
  const hard = path.join(f.root, "hardlink.webp"); await fs.link(normal, hard);
  await assert.rejects(f.authorities.mediaFacade.read(f.context(), "normal-portrait-webp"), code("unsafe_media_path")); await fs.unlink(hard);
  const renamed = path.join(f.root, "retained-original"); await fs.rename(path.dirname(normal), renamed);
  await fs.symlink(renamed, path.dirname(normal), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(f.authorities.mediaFacade.read(f.context(), "normal-portrait-webp"), code("unsafe_media_path")); assert.equal(f.requests.length, 0);
});

test("normal fallback reads only constructed FN URLs and image decode rejects broken bytes", async (t) => {
  const f = await fixture(t); assert.deepEqual(await f.authorities.mediaFacade.read(f.context(), "normal-map-jpg"), f.jpeg);
  assert.equal(f.requests[0].url, `${PUBLIC}species-assets/Gruener%20Leguan/map.jpg`);
  const invalid = f.webp.subarray(0, 20), asset = f.data.assets.files["portrait.webp"]; asset.bytes = invalid.length; asset.sha256 = sha256(invalid); await f.local("portrait.webp", invalid);
  await assert.rejects(f.authorities.mediaFacade.read(f.context(), asset.id));
});

test("normal image decodes receive the fixed authority repository root for local and public bytes", async (t) => {
  const decoded = [], f = await fixture(t, { imageDecode: async (bytes, options) => {
    decoded.push({ sha256: sha256(bytes), options: { ...options } });
  } });
  await f.local("portrait.webp", f.webp); f.setStatus({ connection: "offline" });
  assert.deepEqual(await f.authorities.mediaFacade.read(f.context(), "normal-portrait-webp"), f.webp);
  assert.equal(f.requests.length, 0);
  f.setStatus({ connection: "online" });
  assert.deepEqual(await f.authorities.mediaFacade.read(f.context(), "normal-map-jpg"), f.jpeg);
  assert.equal(f.requests[0].url, `${PUBLIC}species-assets/Gruener%20Leguan/map.jpg`);
  assert.deepEqual(decoded, [
    { sha256: sha256(f.webp), options: { format: "webp", repoRoot: f.root } },
    { sha256: sha256(f.jpeg), options: { format: "jpeg", repoRoot: f.root } },
  ]);
});

test("managed images stay in the existing personal media facade with no implicit download or private field leak", async (t) => {
  const f = await fixture(t); f.setStatus({ connection: "offline" });
  const metadata = await f.authorities.mediaFacade.describe(f.context(), f.managed.id);
  assert.deepEqual(Object.keys(metadata).sort(), ["id", "projectId", "bytes", "sha256", "mimeType", "attribution"].sort());
  assert.deepEqual(await f.authorities.mediaFacade.read(f.context(), f.managed.id), f.png); assert.equal(f.requests.length, 0);
  f.client.media.describeImage = async () => ({ ...f.managed, projectId: "foreign-project" });
  await assert.rejects(f.authorities.mediaFacade.describe(f.context(), f.managed.id), code("foreign_media"));
});

test("public reads enforce actual streaming budgets and deadlines, and close aborts pending reads and waits for decoder completion", async (t) => {
  const f = await fixture(t, { publicTimeoutMs: 20, publicJsonMaxBytes: 128 });
  f.hooks.fetch = () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(129)); controller.close(); } }), { headers: { "Content-Type": "application/json" } });
  assert.equal((await f.authorities.speciesAuthority.snapshot(f.context(), f.data.id)).runtimeReady, false);
  f.hooks.fetch = () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("[")); } }), { headers: { "Content-Type": "application/json" } });
  assert.equal((await f.authorities.speciesAuthority.snapshot(f.context(), f.data.id)).runtimeReady, false);
  const read = f.authorities.speciesAuthority.snapshot(f.context(), f.data.id);
  for (let i = 0; i < 30 && !f.authorities.blockingState().activePublicRequests; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.authorities.blockingState().busy, true); await f.authorities.close(); await assert.rejects(read, code("authority_closed"));
  assert.deepEqual(f.authorities.blockingState(), { known: true, busy: false, closed: true, activePublicRequests: 0, message: "" });
  let release, entered; const start = new Promise((resolve) => { entered = resolve; }), wait = new Promise((resolve) => { release = resolve; });
  const g = await fixture(t, { imageDecode: async () => { entered(); await wait; } }); await g.local("portrait.webp", g.webp);
  const decoding = g.authorities.mediaFacade.read(g.context(), "normal-portrait-webp"); await start; const closing = g.authorities.close();
  assert.equal(g.authorities.blockingState().busy, true); release(); await closing; await assert.rejects(decoding, code("authority_closed")); assert.equal(g.authorities.blockingState().busy, false);
});

function exactContext(f,metadata) {
  const assets=speciesNormalAssets(f.data,PROJECT);
  return {...f.context(),pageSpecies:{slug:f.data.id,normalAssets:assets},mediaAsset:metadata||assets.portrait};
}
function normalReply(f,slot='portrait.webp',buffer=f.webp) {
  return {metadata:{...normalMediaBinding(f.data,{projectId:PROJECT,slot}),width:6,height:4,complete:true},buffer:Buffer.from(buffer)};
}

test('a stored normal image-UUID uses its exact species/role metadata and local original without an image-cache lookup or whole-project scan',async t=>{
  const f=await fixture(t);f.data.assets.files['portrait.webp'].id=f.managed.id;await f.local('portrait.webp',f.webp);
  f.client.listObjects=async()=>{throw new Error('No project scan permitted for a saved media context');};
  f.client.media.describeImage=f.client.media.readImage=async()=>{throw new Error('A normal role must not use the gallery cache');};
  const context=exactContext(f),id=context.mediaAsset.id;
  assert.deepEqual(await f.authorities.mediaFacade.describe(context,id),context.mediaAsset);
  assert.deepEqual(await f.authorities.mediaFacade.read(context,id),f.webp);assert.equal(f.requests.length,0);
});

test('the same UUID with a different gallery attribution uses the actual gallery cache and must match all six expected fields',async t=>{
  const f=await fixture(t);f.data.assets.files['portrait.webp'].id=f.managed.id;
  const normal=speciesNormalAssets(f.data,PROJECT).portrait,gallery={...normal,attribution:'Andere ausdrücklich gebundene Galeriequelle'};let cached=0;
  f.client.listObjects=async()=>{throw new Error('No project scan permitted');};
  f.client.media.describeImage=async()=>({...gallery,localAvailable:true});
  f.client.media.readImage=async()=>{cached++;return {...gallery,buffer:Buffer.from(f.webp)};};
  const context=exactContext(f,gallery);assert.deepEqual(await f.authorities.mediaFacade.describe(context,gallery.id),gallery);
  assert.deepEqual(await f.authorities.mediaFacade.read(context,gallery.id),f.webp);assert.equal(cached,1);assert.equal(f.requests.length,0);
  await assert.rejects(f.authorities.mediaFacade.read({...context,mediaAsset:{...gallery,sha256:'f'.repeat(64)}},gallery.id),code('media_changed'));
  assert.equal(cached,1);assert.equal(f.requests.length,0);
});

test('a stored normal usage cannot silently follow changed protected file metadata or a different species',async t=>{
  const f=await fixture(t),context=exactContext(f),id=context.mediaAsset.id;
  f.data.assets.files['portrait.webp'].sha256='a'.repeat(64);
  await assert.rejects(f.authorities.mediaFacade.describe(context,id),code('media_changed'));
  await assert.rejects(f.authorities.mediaFacade.read(context,id),code('media_changed'));assert.equal(f.requests.length,0);
  const other={...context,pageSpecies:{...context.pageSpecies,slug:'different-species'}};
  await assert.rejects(f.authorities.mediaFacade.read(other,id),code('species_record_required'));
});

test('explicit normal read after a missing local original binds the actual record revision/data hash and never fetches public bytes or uploads',async t=>{
  const f=await fixture(t),context=exactContext(f),received=[];
  f.client.listObjects=async()=>{throw new Error('No project scan permitted');};
  f.client.normalMedia={read:async(input,options)=>{received.push({input,signal:options.signal});return normalReply(f);},
    status:async()=>{throw new Error('No implicit metadata request');},upload:async()=>{throw new Error('No upload permitted');}};
  assert.deepEqual(await f.authorities.mediaFacade.describe(context,context.mediaAsset.id),context.mediaAsset);assert.equal(received.length,0);
  assert.deepEqual(await f.authorities.mediaFacade.read(context,context.mediaAsset.id),f.webp);assert.equal(received.length,1);assert.equal(f.requests.length,0);
  assert.deepEqual(received[0].input,{speciesId:f.data.id,slot:'portrait.webp',expectedRevision:'11111111-1111-4111-8111-111111111111',
    expectedDataHash:digest(objectJson(f.data)),requiredBinding:{baseUrl:'https://project.invalid',projectId:PROJECT,userId:USER.id,role:USER.role}});
  assert.equal(received[0].signal instanceof AbortSignal,true);
});

test('only the definite old-server capability error allows a public normal fallback; missing media, auth, network and incomplete errors stay open',async t=>{
  const f=await fixture(t),context=exactContext(f),id=context.mediaAsset.id;
  for(const failure of [{code:'normal_media_missing',status:404},{code:'normal_media_incomplete',status:409},
    {code:'forbidden',status:403},{code:'authentication_required',status:401},{code:'network_unavailable',status:503}]) {
    f.client.normalMedia={read:async()=>{throw Object.assign(new Error('Synthetic strict normal-service error'),failure);}};
    await assert.rejects(f.authorities.mediaFacade.read(context,id),code(failure.code));assert.equal(f.requests.length,0);
  }
  f.client.normalMedia={read:async()=>{throw Object.assign(new Error('Old project service'),{code:'normal_media_server_required',status:409});}};
  assert.deepEqual(await f.authorities.mediaFacade.read(context,id),f.webp);
  assert.deepEqual(f.requests.map(request=>request.url),[`${PUBLIC}species-assets/Gruener%20Leguan/portrait.webp`]);
});

test('normal-service metadata/byte deviations and unconfirmed source versions cannot masquerade as ready public media',async t=>{
  const f=await fixture(t),context=exactContext(f),id=context.mediaAsset.id;
  for(const mutate of [reply=>{reply.metadata.contentId='normal-'+'f'.repeat(64);},reply=>{reply.metadata.asset.attribution='Other source';},
    reply=>{reply.metadata.complete=false;},reply=>{reply.buffer=Buffer.alloc(f.webp.length);},reply=>{reply.buffer=f.webp.subarray(0,-1);}]) {
    f.client.normalMedia={read:async()=>{const reply=normalReply(f);mutate(reply);return reply;}};
    await assert.rejects(f.authorities.mediaFacade.read(context,id),code('media_changed'));assert.equal(f.requests.length,0);
  }
  let reads=0;f.client.normalMedia={read:async()=>{reads++;return normalReply(f);}};
  const object=await f.client.getObject('species',f.data.id);object.localPending=true;f.setObjects([object]);
  await assert.rejects(f.authorities.mediaFacade.read(context,id),code('media_changed'));assert.equal(reads,0);assert.equal(f.requests.length,0);
});

test('late identity or record-data changes after a normal-service read invalidate its result without public fallback',async t=>{
  for(const change of [f=>f.setStatus({user:{id:'other-person',role:USER.role}}),f=>{f.data.editorial.sections[0].text='A newer editorial source revision';}]) {
    const f=await fixture(t),context=exactContext(f);f.client.normalMedia={read:async()=>{const result=normalReply(f);change(f);return result;}};
    await assert.rejects(f.authorities.mediaFacade.read(context,context.mediaAsset.id),code('workspace_changed','media_changed'));
    assert.equal(f.requests.length,0);
  }
});

test('a same-data pending source appearing during real image validation cannot be reported as a fully bound normal-service result',async t=>{
  let entered,release;const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  const f=await fixture(t,{imageDecode:async(bytes,options)=>{await decodeFixtureImage(bytes,options);entered();await gate;}}),context=exactContext(f);
  f.client.normalMedia={read:async()=>normalReply(f)};
  const reading=f.authorities.mediaFacade.read(context,context.mediaAsset.id),rejected=assert.rejects(reading,code('media_changed'));
  await started;const source=await f.client.getObject('species',f.data.id);source.localPending=true;f.setObjects([source]);release();
  await rejected;assert.equal(f.requests.length,0);
});

test('authority close aborts its explicit normal request, joins it and never starts a fallback or another job',async t=>{
  const f=await fixture(t),context=exactContext(f);let entered;const started=new Promise(resolve=>{entered=resolve;});
  f.client.normalMedia={read:(_input,{signal})=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(Object.assign(new Error('Normal read cancelled'),{code:'normal_media_cancelled'})),{once:true});entered();})};
  const reading=f.authorities.mediaFacade.read(context,context.mediaAsset.id),rejected=assert.rejects(reading,code('normal_media_cancelled','authority_closed'));
  await started;assert.equal(f.authorities.blockingState().busy,true);await f.authorities.close();await rejected;
  assert.equal(f.authorities.blockingState().busy,false);assert.equal(f.requests.length,0);
});

test('credits JSON keeps its constructed public compatibility path and never enters the normal service',async t=>{
  const f=await fixture(t),bytes=Buffer.from(JSON.stringify({recordist:'Eigene Tonquelle'}));
  f.data.assets.files['credits.json']={id:'normal-credits-json',bytes:bytes.length,sha256:sha256(bytes),mimeType:'application/json'};
  f.binaries.set('species-assets/Gruener%20Leguan/credits.json',bytes);
  f.client.normalMedia={read:async()=>{throw new Error('Credits are outside the normal media service');}};
  const metadata=speciesNormalAssets(f.data,PROJECT).credits,context=exactContext(f,metadata);
  assert.deepEqual(await f.authorities.mediaFacade.read(context,metadata.id),bytes);
  assert.deepEqual(f.requests.map(request=>request.url),[`${PUBLIC}species-assets/Gruener%20Leguan/credits.json`]);
});

test('retained normal bytes serve an older own offline page before current-record checks or any network request',async t=>{
  const f=await fixture(t);f.setStatus({connection:'offline'});
  const context=exactContext(f),reply=normalReply(f),calls=[];
  // A newer local art binding must not invalidate bytes retained by the old page.
  f.data.assets.files['portrait.webp'].sha256='e'.repeat(64);
  f.client.getObject=f.client.listObjects=async()=>{throw new Error('Historical offline media must not enumerate or rebind the current record');};
  f.client.normalMedia={describeLocal:async input=>{calls.push(input);return {metadata:clone(reply.metadata),localAvailable:true};},
    readLocal:async input=>{calls.push(input);return {metadata:clone(reply.metadata),buffer:Buffer.from(reply.buffer)};},
    read:async()=>{throw new Error('No online read for cached offline media');}};
  assert.deepEqual(await f.authorities.mediaFacade.describe(context,context.mediaAsset.id),context.mediaAsset);
  assert.deepEqual(await f.authorities.mediaFacade.read(context,context.mediaAsset.id),f.webp);
  assert.equal(f.requests.length,0);assert.equal(calls.length,2);assert.equal(calls[0].contentId,reply.metadata.contentId);
  assert.deepEqual(calls[0].requiredBinding,{baseUrl:'https://project.invalid',projectId:PROJECT,userId:USER.id,role:USER.role});
});

test('offline cache failures, mismatched provenance and late person loss cannot fall through to public media',async t=>{
  for(const mode of ['forbidden','provenance','person']) {
    const f=await fixture(t),context=exactContext(f);
    f.client.normalMedia={readLocal:async()=>{
      if(mode==='forbidden')throw Object.assign(new Error('Reader cannot use this history'),{code:'forbidden'});
      const value=normalReply(f);if(mode==='provenance')value.metadata.asset.attribution='Different original source';
      if(mode==='person')f.setStatus({user:{id:'another-person',role:USER.role}});return value;
    }};
    await assert.rejects(f.authorities.mediaFacade.read(context,context.mediaAsset.id),code('forbidden','media_changed','workspace_changed'));
    assert.equal(f.requests.length,0);
  }
});

test('normal cache absence allows the existing exact online read without turning a preview into a download',async t=>{
  const f=await fixture(t),context=exactContext(f);let reads=0;
  f.client.normalMedia={readLocal:async()=>{throw Object.assign(new Error('Not selected'),{code:'normal_media_not_local'});},
    read:async()=>{reads++;return normalReply(f);},download:async()=>{throw new Error('Previews never persist downloads');}};
  assert.deepEqual(await f.authorities.mediaFacade.read(context,context.mediaAsset.id),f.webp);
  assert.equal(reads,1);assert.equal(f.requests.length,0);
});
