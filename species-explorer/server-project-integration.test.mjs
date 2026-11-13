import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile, readFile, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { createExplorerServer } from "./server.mjs";
import { createBackupService } from "./backup-service.mjs";
import { loadLocalDeviceProfile } from "./desktop/device-profile.mjs";
import { createMemoryCredentialStore } from "./shared-project/client.mjs";
import { fixture as createProjectFixture } from "./shared-project/test-fixtures.mjs";
import { createSharedProjectHttp } from "./shared-project/http.mjs";
import { createWorkingImportSource } from "./species-content/working-import-source.mjs";
import { buildSpeciesContent } from "./species-content/export.mjs";
import { createWebsiteAltTextsService } from "./website-alt-service.mjs";
import { createWebsiteAltStore } from "./website-alt-store.mjs";
import { encodeWebsiteAltPage, websiteAltObjectId } from "./shared-project/website-alt-sync.mjs";
import { createEditableFixture, createTestJpeg, registerFixtureCleanup, serverFixtureStoragePaths } from "./server-test-fixtures.mjs";

async function setup(t, options = {}) {
  const repoRoot = await createEditableFixture(), register = registerFixtureCleanup(t, repoRoot);
  const server = await createExplorerServer({ repoRoot, ...serverFixtureStoragePaths(repoRoot), port: 0,
    websitePagesService: { snapshot: async () => ({ pages: [] }) },
    websiteAltTextsService: { snapshot: async () => ({ transfer: { running: false } }), close: async () => {} }, ...options });
  register(server);
  const address = await server.listen(), baseUrl = `http://127.0.0.1:${address.port}`;
  const { token } = await (await fetch(`${baseUrl}/api/session`)).json();
  const post = (suffix, payload = {}, signal) => fetch(`${baseUrl}${suffix}`, { method: "POST", signal, headers: {
    "content-type": "application/json", "x-species-explorer-session": token, origin: baseUrl }, body: JSON.stringify(payload) });
  return { server, repoRoot, baseUrl, post };
}

test("echter Explorer verdrahtet Projekt und Abschluss und schließt beide neuen Dienste einmalig", async (t) => {
  let sharedClosed = 0, completionClosed = 0, observedContext;
  const shared = { snapshot: async () => ({ schemaVersion: 1, busy: false, queuedChanges: 2, conflictCount: 1, objects: [] }),
    editExisting: async (kind, id, data) => ({ kind, id, ...data }), close: async () => { sharedClosed++; } };
  const completion = { status: async () => ({ available: true, deviceId: "device-fixture", action: "none" }),
    close: async () => { completionClosed++; }, startMonitoring() {} };
  const f = await setup(t, { sharedProjectService: shared, updateCompletionFactory(context) { observedContext = context; return completion; } });
  assert.equal(typeof observedContext.readLocalWorkState, "function");
  assert.equal(typeof observedContext.masterService.status, "function");
  const response = await f.post("/api/shared-project/objects/page/athen", { data: { title: "Athen" }, expectedEditRevision: "shown" });
  assert.equal(response.status, 200); assert.equal((await response.json()).id, "athen");
  assert.equal((await (await fetch(`${f.baseUrl}/api/taxonomy/update-completion`)).json()).deviceId, "device-fixture");
  const state = await f.server.readLocalWorkState(); assert.equal(state.pendingChanges.hasPendingChanges, true);
  assert.equal(state.known, true);
  const release = await f.server.quiesceForCompletion();
  const blocked = await f.post("/api/shared-project/objects/page/athen", {}); assert.equal(blocked.status, 409); await blocked.text();
  release();
  await f.server.close(); await f.server.close(); assert.equal(sharedClosed, 1); assert.equal(completionClosed, 1);
});

test("Explorer prüft, speichert und gleicht einen Artvorschlag getrennt ab", { timeout: 15000 }, async t => {
  const project = createProjectFixture(); let http, server, sourceRequests = 0;
  const opened = Promise.withResolvers(), stopped = Promise.withResolvers(); let holdSource = true;
  t.after(async () => { await server?.close(); await http?.close(); project.cleanup(); });
  const { store, a } = await project.initialized();
  const id = "turdusmerula", record = { type: "fn-species-record", schemaVersion: 1, id,
    input: { german: "Amsel", english: "Blackbird", genus: "Turdus", species: "merula", size: "24 cm", weight: "100 g", life_expectancy: "3 Jahre" },
    generated: null, taxonomyOverride: null, assessmentBinding: null,
    assets: { assetName: "Amsel", files: {}, overrides: {}, credits: null, portraitMetadata: null },
    editorial: { websiteUrl: null, sections: [], gallery: [], generalSectionId: null, embeddedGeneralText: null } };
  const original = store.createObject(a.token, { kind: "species", id, data: record });
  store.approveObject(a.token, "species", id, { expectedRevision: original.revision });
  http = createSharedProjectHttp({ store });
  const { url } = await http.listen(), jpeg = createTestJpeg(1600, 1200);
  const f = await setup(t, { sharedProjectOptions: { filename: join(project.root, "enrichment-client.sqlite"), localStorageConfirmed: true,
    allowLoopbackHttp: true, credentialStore: createMemoryCredentialStore(), speciesEnrichmentProviders: () => ({
      iucnToken: "private-test-iucn", xenoToken: "private-test-xeno", sleep: async () => {},
      fetch: async (address, { signal } = {}) => {
        sourceRequests++;
        if (holdSource) {
          holdSource = false;
          opened.resolve();
          return new Promise((_resolve, reject) => signal.addEventListener("abort", () => {
            stopped.resolve(); reject(signal.reason);
          }, { once: true }));
        }
        const { pathname, hostname } = new URL(address);
        if (pathname === "/api/v4/taxa/scientific_name") return Response.json({ taxon: { scientific_name: "Turdus merula",
          kingdom_name: "ANIMALIA", phylum_name: "CHORDATA", class_name: "AVES", order_name: "PASSERIFORMES", family_name: "TURDIDAE",
          genus_name: "Turdus", species_name: "merula" }, assessments: [{ assessment_id: 123, red_list_category_code: "LC", year_published: 2026,
          scopes: [{ description: { en: "Global" } }] }] });
        if (pathname === "/api/v4/assessment/123") return Response.json({ population_trend: { description: { en: "Stable" } }, red_list_category: { code: "LC" } });
        if (pathname.endsWith("/distribution_map/jpg")) return new Response(jpeg, { headers: { "content-type": "image/jpeg" } });
        if (hostname === "xeno-canto.org") return Response.json({ recordings: [], numPages: 1 });
        if (hostname === "commons.wikimedia.org") return Response.json({ query: { pages: {} } });
        if (hostname === "api.inaturalist.org") return Response.json({ results: [] });
        assert.fail(`Unexpected fixture host: ${hostname}${pathname}`);
      },
    }) } });
  server = f.server;
  const inputBefore = await readFile(join(f.repoRoot, "species_list.json"));
  const connected = await f.post("/api/shared-project/connect", { baseUrl: url, username: a.user.username, password: project.password });
  assert.equal(connected.status, 200); await connected.json();
  const workspace = await (await fetch(`${f.baseUrl}/api/shared-project/species/workspace`)).json(), [shown] = workspace.species;
  const path = `/api/shared-project/species/${id}/enrichment`;
  const request = async (action, data = {}, expectedStatus = 200) => {
    const response = await f.post(`${path}/${action}`, { sourceScope: shown.sourceScope, ...data }), value = await response.json();
    assert.equal(response.status, expectedStatus, JSON.stringify(value)); return value;
  };
  assert.equal((await request("status")).candidate, null);
  assert.equal(sourceRequests, 0);
  const controller = new AbortController();
  const cancelled = f.post(`${path}/prepare`, { sourceScope: shown.sourceScope, expectedRevision: shown.revision,
    expectedEditRevision: shown.editRevision, mode: "missing" }, controller.signal);
  const rejected = assert.rejects(cancelled, { name: "AbortError" });
  await opened.promise; controller.abort(); await rejected; await stopped.promise;
  let status;
  for (let attempt = 0; attempt < 50; attempt++) {
    status = await request("status");
    if (!status.busy) break;
    await delay(20);
  }
  assert.equal(status.busy, false); assert.equal(status.candidate, null);
  const candidate = await request("prepare", { expectedRevision: shown.revision, expectedEditRevision: shown.editRevision, mode: "missing" });
  assert.equal(candidate.complete, true);
  assert.match(candidate.candidateId, /^[a-f0-9]{64}$/);
  assert.ok(candidate.changes.some(entry => entry.field === "generated.Family"));
  assert.ok(candidate.changes.some(entry => entry.field === "assets.files.map.jpg"));
  assert.doesNotMatch(JSON.stringify(candidate), /private-test-|sourceResult|\bmedia\b|sha256|repoRoot/);
  assert.equal(store.getObject(a.token, "species", id).revision, original.revision);
  assert.equal((await request("status")).candidate.candidateId, candidate.candidateId);
  const previewUrl = `${f.baseUrl}${path}/${candidate.candidateId}/file/map.jpg?scope=${shown.sourceScope}`;
  const preview = await fetch(previewUrl);
  assert.equal(preview.status, 200); assert.equal(preview.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()), jpeg);
  const partial = await fetch(previewUrl, { headers: { Range: "bytes=0-15" } });
  assert.equal(partial.status, 206); assert.deepEqual(Buffer.from(await partial.arrayBuffer()), jpeg.subarray(0, 16));
  const foreign = await fetch(previewUrl, { headers: { Origin: "https://foreign.invalid" } });
  assert.equal(foreign.status, 403); await foreign.text();
  await request("stage", { candidateId: candidate.candidateId, targetDataHash: "f".repeat(64) }, 409);
  const queued = await request("stage", { candidateId: candidate.candidateId, targetDataHash: candidate.targetDataHash });
  assert.equal(queued.state, "queued");
  assert.equal(store.getObject(a.token, "species", id).revision, original.revision);
  assert.equal((await request("status")).pending.changeId, queued.changeId);
  const result = await request("sync", { changeId: queued.changeId });
  assert.equal(result.confirmedFiles, 1);
  const draft = store.getObject(a.token, "species", id);
  assert.equal(draft.revision, result.currentRevision); assert.equal(draft.approvedRevision, original.revision);
  assert.equal((await request("status")).pending, null);
  const [current] = (await (await fetch(`${f.baseUrl}/api/shared-project/species/workspace`)).json()).species;
  assert.equal(current.assets.map.projectFileBound, true);
  assert.equal(current.assets.map.url, "");
  assert.equal(current.assets.map.availableOnline, false);
  const fileUrl = ({ sourceScope, revision, editRevision }) => `${f.baseUrl}/api/shared-project/species/${id}/normal-content/map.jpg?${new URLSearchParams({ scope: sourceScope, revision, stamp: editRevision })}`;
  const loaded = await fetch(fileUrl(current));
  assert.equal(loaded.status, 200); assert.equal(loaded.headers.get("cache-control"), "no-store");
  assert.deepEqual(Buffer.from(await loaded.arrayBuffer()), jpeg);
  const stale = await fetch(fileUrl(shown)); assert.equal(stale.status, 409); await stale.text();
  const foreignFile = await fetch(fileUrl(current), { headers: { Origin: "https://foreign.invalid" } });
  assert.equal(foreignFile.status, 403); await foreignFile.text();
  assert.deepEqual(await readFile(join(f.repoRoot, "species_list.json")), inputBefore);
});

test("echter Explorer-Grunddatenweg verwendet nur den gemeinsamen Cache und lässt lokale Artdateien bytegleich", async (t) => {
  const project = createProjectFixture(); let http, server;
  t.after(async () => { await server?.close(); await http?.close(); project.cleanup(); });
  const { store, a } = await project.initialized();
  const record = { type: "fn-species-record", schemaVersion: 1, id: "fixture-owl",
    input: { german: "Testkauz", english: "Synthetic owl", genus: "Strix", species: "fixture", size: "20 cm", weight: "400 g", life_expectancy: "10 Jahre", custom: "preserved" },
    generated: null, taxonomyOverride: null, assessmentBinding: null,
    assets: { assetName: "Testkauz", files: {}, overrides: { map: { protectFromPipeline: true } }, credits: null, portraitMetadata: null },
    editorial: { websiteUrl: null, sections: [], gallery: [], generalSectionId: null, embeddedGeneralText: null } };
  store.createObject(a.token, { kind: "species", id: record.id, data: record });
  http = createSharedProjectHttp({ store }); const address = await http.listen();
  const filename = join(project.root, "explorer-personal.sqlite");
  const f = await setup(t, { sharedProjectOptions: { filename, localStorageConfirmed: true, allowLoopbackHttp: true, credentialStore: createMemoryCredentialStore() } });
  server = f.server;
  await writeFile(join(f.repoRoot, "species-assets-overrides.json"), JSON.stringify({ version: 1, assets: { Testkauz: { map: { protectFromPipeline: true } } } }), { flag: "wx" });
  const sourceFiles = ["species_list.json", "speciesData.json", "species-assets-overrides.json"];
  const original = await Promise.all(sourceFiles.map((file) => readFile(join(f.repoRoot, file))));
  let response = await f.post("/api/shared-project/connect", { baseUrl: address.url, username: a.user.username, password: project.password });
  assert.equal(response.status, 200); await response.json();
  response = await fetch(`${f.baseUrl}/api/shared-project/species/${record.id}`);
  assert.equal(response.status, 200); const shown = await response.json();
  response = await f.post(`/api/shared-project/species/${record.id}/preview`, { sourceScope: shown.sourceScope, expectedEditRevision: shown.editRevision,
    values: { germanName: "Testkauz", englishName: "Synthetic owl", scientificName: "Strix fixture", size: "21 cm", weight: "400 g", lifeExpectancy: "10 Jahre" } });
  assert.equal(response.status, 200); const preview = await response.json();
  response = await f.post(`/api/shared-project/species/${record.id}/save`, { token: preview.token });
  assert.equal(response.status, 200); const saved = await response.json();
  assert.equal(saved.queued, true); assert.equal(saved.species.manual.size, "21 cm"); assert.equal(saved.externalPublication, "not-performed");
  assert.equal(store.getObject(a.token, "species", record.id).data.input.size, "20 cm", "save does not silently start synchronization");
  const approvalPath = `/api/shared-project/species/${record.id}/approval`;
  response = await f.post(`${approvalPath}/preview`, { sourceScope: saved.species.sourceScope,
    expectedEditRevision: saved.species.editRevision, expectedRevision: saved.species.revision });
  assert.equal(response.status, 409); await response.json();
  assert.equal(store.getObject(a.token, "species", record.id).approvedRevision, null, "approval never sends a pending draft");
  response = await f.post("/api/shared-project/sync"); assert.equal(response.status, 200); await response.json();
  const workspace = await (await fetch(`${f.baseUrl}/api/shared-project/species/workspace`)).json(), current = workspace.species[0];
  assert.equal(current.manual.size, "21 cm"); assert.equal(current.canApprove, true); assert.equal(current.approvedRevision, null);
  response = await fetch(`${f.baseUrl}${approvalPath}/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(response.status, 403); await response.json();
  response = await f.post(`${approvalPath}/preview`, { sourceScope: current.sourceScope,
    expectedEditRevision: current.editRevision, expectedRevision: current.revision });
  assert.equal(response.status, 200); const release = await response.json();
  assert.equal(JSON.stringify(release).includes("custom"), false, "approval preview is curated, not the original input register");
  assert.equal(store.getObject(a.token, "species", record.id).approvedRevision, null, "preview cannot release a record");
  response = await f.post(`${approvalPath}/approve`, { token: release.token }); assert.equal(response.status, 200);
  const approved = await response.json(); assert.equal(approved.approvedRevision, current.revision);
  assert.equal(approved.reviewedRevision, current.revision); assert.equal(approved.serverConfirmed, true);
  assert.equal(approved.hasNewerLocalChanges, false); assert.equal(approved.internalOnly, true); assert.equal(approved.externalPublication, "not-performed");
  const final = (await (await fetch(`${f.baseUrl}/api/shared-project/species/workspace`)).json()).species[0];
  assert.equal(final.canApprove, false); assert.equal(final.approvedRevision, final.revision); assert.equal(final.approval, "approved");
  const readerName = "fixture-release-reader";
  await store.createUser(a.token, { username: readerName, displayName: "Synthetic reader", password: project.password, role: "reader" });
  const reader = await store.login({ username: readerName, password: project.password });
  const catalog = store.catalog(reader.token); assert.equal(catalog.species.length, 1);
  assert.equal(JSON.stringify(catalog).includes("preserved"), false, "private source fields are absent from the reader catalog");
  assert.equal(store.getObject(a.token, "species", record.id).data.input.custom, "preserved");
  response = await f.post(`${approvalPath}/approve`, { token: release.token }); assert.equal(response.status, 409); await response.json();
  assert.deepEqual(await Promise.all(sourceFiles.map((file) => readFile(join(f.repoRoot, file)))), original);
});

test("echter Explorer meldet die vollständige Importquelle und überschreibt ihren Umfang nicht mit dem öffentlichen Bündel", async (t) => {
  const project = createProjectFixture(); let remote, local;
  t.after(async () => { await local?.close(); await remote?.close(); project.cleanup(); });
  const { store, a } = await project.initialized(), assetsRoot = join(project.root, "assets");
  await mkdir(join(assetsRoot, "Testkauz"), { recursive: true });
  const sourceAdapter = createWorkingImportSource({ assetsRoot, readSources: async () => ({
    speciesList: [{ german: "Testkauz", genus: "Strix", species: "fixture" }],
    speciesData: [{ URLSlug: "fixture-owl", Genus: "Strix", Species: "fixture", "Wissenschaftlicher Name": "Strix fixture", "Deutscher Name": "Testkauz" }],
    catalog: { schemaVersion: 1, revision: "fixture", generatedAt: "2026-11-01T00:00:00.000Z", species: [{ id: "fixture-owl", scientificName: "Strix fixture", commonName: "Testkauz", taxonomy: [], sections: [], media: { sounds: [], gallery: [] } }] },
    assetOverrides: { version: 1, assets: {} }, taxonomyOverrides: { version: 1, species: {} }, assessmentBindings: {},
    bindings: [{ id: "fixture-owl", assetName: "Testkauz", generalSectionId: null, embeddedGeneralText: null }],
  }) });
  const f = await setup(t, { sharedProjectOptions: { filename: join(project.root, "client.sqlite"), localStorageConfirmed: true, allowLoopbackHttp: true },
    sharedProjectImportOptions: { filename: join(project.root, "initial-import.sqlite"), localStorageConfirmed: true, sourceAdapter } }); local = f.server;
  remote = createSharedProjectHttp({ store }); const address = await remote.listen();
  let response = await f.post("/api/shared-project/connect", { baseUrl: address.url, username: a.user.username, password: project.password }); assert.equal(response.status, 200); await response.json();
  response = await fetch(`${f.baseUrl}/api/shared-project/import`); const shown = await response.json();
  assert.equal(shown.source.kind, "working-records"); assert.equal(shown.source.sha256, undefined);
  response = await f.post("/api/shared-project/import/prepare"); assert.equal(response.status, 200);
  const plan = await response.json(); assert.equal(plan.source.kind, "working-records"); assert.equal(plan.counts.total, 1);
  assert.equal(store.listObjects(a.token).length, 0); assert.equal((await (await fetch(`${f.baseUrl}/api/species`)).json())[0].germanName, "Amsel");
});

test("echter Explorer bindet die Artkonfliktentscheidung an Sitzung und Vorschau und erhält lokale Originaldateien", async (t) => {
  const project = createProjectFixture(); let remote, local;
  t.after(async () => { await local?.close(); await remote?.close(); project.cleanup(); });
  const { store, a, b } = await project.initialized();
  const original = { type: "fn-species-record", schemaVersion: 1, id: "fixture-conflict",
    input: { german: "Testkauz", english: "Synthetic owl", genus: "Strix", species: "fixture", size: "20 cm", weight: "400 g", life_expectancy: "10 Jahre", privateOriginal: { keep: true } },
    generated: null, taxonomyOverride: null, assessmentBinding: null,
    assets: { assetName: "Testkauz", files: {}, overrides: { map: { protectFromPipeline: true } }, credits: null, portraitMetadata: null },
    editorial: { websiteUrl: null, sections: [], gallery: [], generalSectionId: null, embeddedGeneralText: null } };
  const created = store.createObject(a.token, { kind: "species", id: original.id, data: original });
  remote = createSharedProjectHttp({ store }); const address = await remote.listen();
  const f = await setup(t, { sharedProjectOptions: { filename: join(project.root, "conflict-client.sqlite"), localStorageConfirmed: true,
    allowLoopbackHttp: true, credentialStore: createMemoryCredentialStore() } }); local = f.server;
  const sourceFiles = ["species_list.json", "speciesData.json"], sourceBytes = await Promise.all(sourceFiles.map((file) => readFile(join(f.repoRoot, file))));
  let response = await f.post("/api/shared-project/connect", { baseUrl: address.url, username: a.user.username, password: project.password });
  assert.equal(response.status, 200); await response.json();
  const objectPath = `/api/shared-project/objects/species/${original.id}`;
  const shown = await (await fetch(`${f.baseUrl}${objectPath}`)).json(), proposal = structuredClone(original); proposal.input.weight = "430 g";
  response = await f.post(objectPath, { expectedEditRevision: shown.editRevision, data: proposal }); assert.equal(response.status, 200); await response.json();
  const serverData = structuredClone(original); serverData.input.size = "21 cm";
  store.submitChange(b.token, { kind: "species", id: original.id, changeId: "fixture-conflict-remote", baseRevision: created.revision, data: serverData });
  response = await f.post("/api/shared-project/sync"); assert.equal(response.status, 200); await response.json();
  const list = await (await fetch(`${f.baseUrl}/api/shared-project/species/conflicts`)).json(); assert.equal(list.conflicts.length, 1);
  const path = `/api/shared-project/species/conflicts/${list.conflicts[0].id}`, review = await (await fetch(`${f.baseUrl}${path}`)).json();
  assert.equal(review.fields.find((field) => field.key === "weight").localVersions[0].value, "430 g");
  assert.equal(JSON.stringify(review).includes("privateOriginal"), false, "review does not expose the private full record");
  response = await fetch(`${f.baseUrl}${path}/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(response.status, 403); await response.text();
  const { token: localToken } = await (await fetch(`${f.baseUrl}/api/session`)).json();
  response = await fetch(`${f.baseUrl}${path}/resolve`, { method: "POST", headers: { "content-type": "application/json", "x-species-explorer-session": localToken,
    origin: "https://foreign.example" }, body: "{}" }); assert.equal(response.status, 403); await response.text();
  response = await f.post(`${path}/preview`, { sourceScope: review.sourceScope, expectedReviewRevision: review.reviewRevision,
    choices: { size: { kind: "server" }, weight: { kind: "local", changeId: review.localVersions[0].changeId } } });
  assert.equal(response.status, 200); const preview = await response.json();
  assert.equal(store.getObject(a.token, "species", original.id).data.input.weight, "400 g", "preview never writes");
  response = await f.post(`${path}/resolve`, { token: preview.token }); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.serverConfirmed, true); assert.equal(result.externalPublication, "not-performed");
  const current = store.getObject(a.token, "species", original.id); const expected = structuredClone(original); expected.input.size = "21 cm"; expected.input.weight = "430 g";
  assert.deepEqual(current.data, expected); assert.equal(current.approvedRevision, null);
  response = await f.post(`${path}/resolve`, { token: preview.token }); assert.equal(response.status, 409); await response.text();
  assert.deepEqual(await Promise.all(sourceFiles.map((file) => readFile(join(f.repoRoot, file)))), sourceBytes);
});

test("fest gewählte lokale Arbeitsquelle erreicht über den echten Explorer den planbaren Originalbestand", async (t) => {
  const project = createProjectFixture(); let remote, local, catalog;
  t.after(async () => { await local?.close(); await remote?.close(); project.cleanup(); });
  const { store, a } = await project.initialized();
  const f = await setup(t, { sharedProjectOptions: { filename: join(project.root, "client.sqlite"), localStorageConfirmed: true, allowLoopbackHttp: true },
    sharedProjectImportOptions: { filename: join(project.root, "initial-import.sqlite"), localStorageConfirmed: true, sourceKind: "working-records", readWorkingCatalog: async () => Buffer.from(JSON.stringify(catalog)) } }); local = f.server;
  const [record] = JSON.parse(await readFile(join(f.repoRoot, "speciesData.json"), "utf8"));
  catalog = { schemaVersion: 1, revision: "fixture", generatedAt: "2026-11-01T00:00:00.000Z", species: [buildSpeciesContent({ record }).data] };
  for (const [filename, value] of Object.entries({ "species-assets-overrides.json": { version: 1, assets: {} },
    "species-taxonomy-overrides.json": { version: 1, species: {} }, "lastSavedAssessmentId.json": { Amsel: 1 } })) {
    await writeFile(join(f.repoRoot, filename), JSON.stringify(value), { flag: "wx" });
  }
  remote = createSharedProjectHttp({ store }); const address = await remote.listen();
  let response = await f.post("/api/shared-project/connect", { baseUrl: address.url, username: a.user.username, password: project.password }); assert.equal(response.status, 200); await response.json();
  response = await f.post("/api/shared-project/import/prepare"); assert.equal(response.status, 200);
  const plan = await response.json(); assert.equal(plan.source.kind, "working-records"); assert.equal(plan.counts.total, 1); assert.equal(plan.items[0].id, "turdusmerula");
  assert.equal(store.listObjects(a.token).length, 0);
});

test("beschädigter persönlicher Cache bleibt erhalten und der vorhandene lokale Explorer startet weiter", async (t) => {
  const repoRoot = await createEditableFixture(), register = registerFixtureCleanup(t, repoRoot);
  const filename = join(repoRoot, "broken-cache.sqlite"), original = Buffer.from("synthetic damaged private cache");
  await writeFile(filename, original);
  const server = await createExplorerServer({ repoRoot, ...serverFixtureStoragePaths(repoRoot), port: 0,
    sharedProjectOptions: { filename, localStorageConfirmed: true },
    websitePagesService: { snapshot: async () => ({ pages: [] }) },
    websiteAltTextsService: { snapshot: async () => ({ transfer: { running: false } }), close: async () => {} } });
  register(server); const address = await server.listen(), baseUrl = `http://127.0.0.1:${address.port}`;
  const summary = await fetch(`${baseUrl}/api/summary`); assert.equal(summary.status, 200); await summary.json();
  const status = await (await fetch(`${baseUrl}/api/shared-project`)).json();
  assert.equal(status.available, false); assert.match(status.message, /Projektcache/);
  assert.equal((await server.readLocalWorkState()).known, false);
  await server.close();
  const preserved = join(repoRoot, "preserved-broken-cache.sqlite");
  await rename(filename, preserved);
  assert.deepEqual(await readFile(preserved), original);
});

test("Explorer schließt einen laufenden Sicherungsbesitzer vor persönlichem Cache und Tempablage", async (t) => {
  let finish, entered, receivedProvider, cacheClosed = false, bridgeClosed = false;
  const pending = new Promise((resolve) => { finish = resolve; }), started = new Promise((resolve) => { entered = resolve; });
  const provider = { prepare() { throw new Error("Keine echte NASsicherung im Integrationstest"); } };
  const f = await setup(t, { deviceBackupProvider: provider,
    sharedProjectService: { snapshot: async () => ({ busy: false, queuedChanges: 0, conflictCount: 0 }), close: async () => { cacheClosed = true; } },
    websiteAltSyncService: { close: async () => { assert.equal(cacheClosed, false); bridgeClosed = true; } },
    async backupServiceFactory(options) {
      receivedProvider = options.deviceBackupProvider;
      const service = await createBackupService(options);
      return { ...service, async close() { entered(); await pending; assert.equal(cacheClosed, false); assert.equal(bridgeClosed, false); await service.close(); } };
    } });
  assert.equal(receivedProvider, provider);
  const closing = f.server.close(); await started;
  assert.equal(cacheClosed, false);
  finish(); await closing; assert.equal(cacheClosed, true); assert.equal(bridgeClosed, true);
  await f.server.close();
});

test("vollständige persönliche Desktopverdrahtung startet ohne Anmeldung/Modelldownload und bindet echte leere Profilsnapshots", async (t) => {
  const repoRoot = await createEditableFixture(), register = registerFixtureCleanup(t, repoRoot), profileRoot = join(repoRoot, "personal-fixture");
  const device = await loadLocalDeviceProfile(profileRoot); let provider;
  const server = await createExplorerServer({ repoRoot, ...serverFixtureStoragePaths(repoRoot), port: 0,
    websitePagesService: { snapshot: async () => ({ pages: [] }) },
    websiteAltTextsService: createWebsiteAltTextsService({ repoRoot, dataRoot: join(repoRoot, "Daten") }),
    sharedProjectOptions: { filename: join(profileRoot, "project-cache.sqlite"), localStorageConfirmed: true, credentialStore: createMemoryCredentialStore() },
    sharedProjectImportOptions: { filename: join(profileRoot, "initial-import.sqlite"), localStorageConfirmed: true },
    websiteAltSyncOptions: { filename: join(profileRoot, "website-alt-sync.sqlite"), localStorageConfirmed: true },
    localAiOptions: { cacheRoot: join(profileRoot, "local-ai"), deviceId: device.id }, deviceBackupProfile: { profileRoot, deviceId: device.id },
    async backupServiceFactory(options) { provider = options.deviceBackupProvider; return createBackupService(options); } });
  register(server); const address = await server.listen(), origin = `http://127.0.0.1:${address.port}`;
  const state = await (await fetch(`${origin}/api/shared-project`)).json();
  assert.equal(state.status.connection, "disconnected"); assert.deepEqual(state.objects, []);
  const ai = await (await fetch(`${origin}/api/local-ai`)).json();
  assert.equal(ai.available, true); assert.equal(ai.installing, false); assert.equal(ai.worker.ownWorkerActive, false);
  const snapshot = await provider.prepare();
  try {
    assert.deepEqual(snapshot.summary.projectIds, []); assert.equal(snapshot.summary.pending, 0); assert.equal(snapshot.summary.fileCount, 4);
    const manifest = JSON.parse(await readFile(snapshot.manifestPath, "utf8"));
    assert.equal(manifest.files.some((entry) => entry.path.endsWith("/website-alt-sync.sqlite")), true);
    await snapshot.assertSourcesUnchanged();
  } finally { await snapshot.dispose(); }
  assert.equal((await server.readLocalWorkState()).known, true);
});

async function setupWebsiteAltProject(t, { afterChange } = {}) {
  const project = createProjectFixture(), { store, a, b } = await project.initialized(), http = createSharedProjectHttp({ store });
  let server;
  t.after(async () => { await server?.close(); await http.close(); project.cleanup(); });
  const { url } = await http.listen(), local = createWebsiteAltStore({ dataRoot: join(project.root, "alt-data") });
  const pageUrl = "https://www.fnwildlifetravel.de/reisen/2019-griechenland/athen", objectId = websiteAltObjectId(pageUrl);
  const checkedAt = "2026-11-03T14:00:00.000Z", src = "https://images.squarespace-cdn.com/content/v1/fixture/athen.jpg";
  const key = createHash("sha256").update(`${src}\ncontent\nimage`).digest("hex");
  await local.mergeScan({ pages: [{ url: pageUrl, title: "Athen", checkedAt, images: [{ key, src, previewSrc: src,
    context: "content", kind: "image", alt: "", caption: "", altPresent: true }] }], discoveredUrls: [pageUrl], completedAt: checkedAt, complete: true, errors: [] });
  const journalFile = join(project.root, "alt-bridge.sqlite");
  const f = await setup(t, { websiteAltTextsService: createWebsiteAltTextsService({ store: local }),
    sharedProjectOptions: { filename: join(project.root, "alt-client.sqlite"), localStorageConfirmed: true,
      allowLoopbackHttp: true, credentialStore: createMemoryCredentialStore(), fetchImpl: async (address, options) => {
        const response = await fetch(address, options);
        if (afterChange && response.ok && options.method === "POST" && address.endsWith("/changes")) afterChange({ store, a, objectId });
        return response;
      } },
    websiteAltSyncOptions: { filename: journalFile, localStorageConfirmed: true } });
  server = f.server;
  const connected = await f.post("/api/shared-project/connect", { baseUrl: url, username: b.user.username, password: project.password });
  assert.equal(connected.status, 200); await connected.json();
  const before = await local.exportPage({ pageUrl }), input = { pageUrl, expectedPageRevision: before.pageRevision, confirmed: true };
  async function post(action, body, status = 200) {
    const response = await f.post(`/api/website/alt-texts/shared/${action}`, body), result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result)); return result;
  }
  const read = async (action) => {
    const response = await fetch(`${f.baseUrl}/api/website/alt-texts/shared/${action}?${new URLSearchParams({ pageUrl })}`);
    assert.equal(response.status, 200); return response.json();
  };
  const saveText = async (text) => {
    const state = await local.snapshot();
    await local.draft({ revision: state.revision, pageUrl, imageKey: key, text, decorative: false });
    return local.exportPage({ pageUrl });
  };
  return { f, store, a, local, pageUrl, objectId, checkedAt, before, input, post, read, saveText, journalFile };
}

test("Explorer übernimmt Bildtexte erst nach Bestätigung der aktuellen gemeinsamen Version", async (t) => {
  const { store, a, local, pageUrl, objectId, checkedAt, before, input, post } = await setupWebsiteAltProject(t);
  const linked = await post("link", input), shown = await post("pull", input);
  assert.equal(shown.remote.revision, linked.remoteRevision);
  const next = structuredClone(shown.remote.data.page);
  Object.assign(next.images[0], { status: "draft", draftText: "Neuer gemeinsamer Bildtext", draftSavedAt: checkedAt });
  const changed = store.submitChange(a.token, { kind: "page", id: objectId, changeId: "another-editor-changed-picture-text",
    baseRevision: shown.remote.revision, data: encodeWebsiteAltPage(next) });
  assert.equal(changed.status, "applied");
  await post("import", { ...input, expectedRemoteRevision: shown.remote.revision }, 409);
  assert.deepEqual(await local.exportPage({ pageUrl }), before);
  const refreshed = await post("pull", input);
  assert.equal(refreshed.remote.revision, changed.object.revision);
  const applied = await post("import", { ...input, expectedRemoteRevision: refreshed.remote.revision });
  assert.equal(applied.imported, true); assert.equal(applied.publicCheckPerformed, false);
  assert.equal((await local.exportPage({ pageUrl })).page.images[0].draftText, "Neuer gemeinsamer Bildtext");
  assert.equal(store.getObject(a.token, "page", objectId).revision, changed.object.revision);
});

test("zentraler Projektabgleich quittiert vorgemerkte Bildtexte und erhält neuere lokale Texte und Konflikte", async (t) => {
  const { f, store, a, local, pageUrl, objectId, input, post, read, saveText, journalFile } = await setupWebsiteAltProject(t);
  await post("link", input);
  const earlier = await saveText("Vorherige Fassung in derselben Warteschlange");
  await post("queue", { pageUrl, expectedPageRevision: earlier.pageRevision });
  const sent = await saveText("Zur Übertragung vorgemerkt");
  await post("queue", { pageUrl, expectedPageRevision: sent.pageRevision });
  const newer = await saveText("Inzwischen auf diesem PC weiterbearbeitet");
  assert.equal((await read("page")).state, "queued");
  const synced = await f.post("/api/shared-project/sync"); assert.equal(synced.status, 200);
  assert.deepEqual(await local.exportPage({ pageUrl }), newer);
  const current = store.getObject(a.token, "page", objectId);
  assert.equal(current.data.page.images[0].draftText, "Zur Übertragung vorgemerkt");
  assert.equal(current.data.page.images[0].verification, null);
  const viewed = await read("page");
  assert.equal(viewed.state, "local-changed"); assert.equal(viewed.remote.revision, current.revision);
  assert.deepEqual((await synced.json()).websiteAltReconciliation, { checked: true, confirmed: 1, conflicts: 0 });
  const journal = new DatabaseSync(journalFile, { readOnly: true });
  try {
    const entry = journal.prepare("SELECT phase, remote_revision FROM operations WHERE local_hash=?");
    assert.deepEqual({ ...entry.get(earlier.pageRevision) }, { phase: "captured", remote_revision: null });
    assert.deepEqual({ ...entry.get(sent.pageRevision) }, { phase: "shared", remote_revision: current.revision });
  } finally { journal.close(); }
  await post("queue", { pageUrl, expectedPageRevision: newer.pageRevision });
  const remotePage = structuredClone(current.data.page);
  remotePage.images[0].draftText = "Zweite Person hat denselben Bildtext geändert";
  const foreign = store.submitChange(a.token, { kind: "page", id: objectId, changeId: "alt-project-sync-conflict",
    baseRevision: current.revision, data: encodeWebsiteAltPage(remotePage) }).object;
  const conflicted = await f.post("/api/shared-project/sync"); assert.equal(conflicted.status, 200);
  assert.deepEqual((await conflicted.json()).websiteAltReconciliation, { checked: true, confirmed: 0, conflicts: 1 });
  const shown = await read("page"), { conflicts } = await read("conflicts");
  assert.equal(shown.state, "conflict"); assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].currentRevision, foreign.revision);
  assert.equal(conflicts[0].current.page.images[0].draftText, remotePage.images[0].draftText);
  assert.equal(conflicts[0].proposed.page.images[0].draftText, newer.page.images[0].draftText);
  assert.deepEqual(await local.exportPage({ pageUrl }), newer);
});

test("eine Änderung direkt nach dem allgemeinen Bildtextversand verlangt einen neuen Vergleich", async (t) => {
  const { f, local, pageUrl, input, post, read, saveText } = await setupWebsiteAltProject(t, { afterChange({ store, a, objectId }) {
    const current = store.getObject(a.token, "page", objectId), page = structuredClone(current.data.page);
    page.images[0].draftText = "Neuer gemeinsamer Text nach dem Versand";
    store.submitChange(a.token, { kind: "page", id: objectId, changeId: "newer-after-alt-send", baseRevision: current.revision, data: encodeWebsiteAltPage(page) });
  } });
  await post("link", input);
  const pending = await saveText("Mein gesendeter Entwurf");
  await post("queue", { pageUrl, expectedPageRevision: pending.pageRevision });
  const response = await f.post("/api/shared-project/sync"); assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).websiteAltReconciliation, { checked: true, confirmed: 0, conflicts: 1 });
  const comparison = await read("page"), { conflicts } = await read("conflicts");
  assert.equal(comparison.state, "unrelated");
  assert.equal(conflicts[0].current.page.images[0].draftText, "Neuer gemeinsamer Text nach dem Versand");
  assert.equal(conflicts[0].proposed.page.images[0].draftText, "Mein gesendeter Entwurf");
  assert.deepEqual(await local.exportPage({ pageUrl }), pending);
});

test("unbekanntes eingerichtetes Bildtextjournal bleibt unverändert und verhindert eine unvollständige persönliche Sicherung", async (t) => {
  const repoRoot = await createEditableFixture(), register = registerFixtureCleanup(t, repoRoot), profileRoot = join(repoRoot, "personal-fixture");
  const device = await loadLocalDeviceProfile(profileRoot), filename = join(profileRoot, "website-alt-sync.sqlite");
  const original = Buffer.from("synthetic damaged personal image text journal"); let provider;
  await writeFile(filename, original);
  const server = await createExplorerServer({ repoRoot, ...serverFixtureStoragePaths(repoRoot), port: 0,
    websitePagesService: { snapshot: async () => ({ pages: [] }) },
    websiteAltTextsService: createWebsiteAltTextsService({ repoRoot, dataRoot: join(repoRoot, "Daten") }),
    sharedProjectOptions: { filename: join(profileRoot, "project-cache.sqlite"), localStorageConfirmed: true },
    sharedProjectImportOptions: { filename: join(profileRoot, "initial-import.sqlite"), localStorageConfirmed: true },
    websiteAltSyncOptions: { filename, localStorageConfirmed: true }, deviceBackupProfile: { profileRoot, deviceId: device.id },
    async backupServiceFactory(options) { provider = options.deviceBackupProvider; return createBackupService(options); } });
  register(server); const address = await server.listen(), origin = `http://127.0.0.1:${address.port}`;
  const status = await (await fetch(`${origin}/api/website/alt-texts/shared`)).json();
  assert.equal(status.available, false); assert.match(status.message, /Bildtextjournal/);
  const summary = await fetch(`${origin}/api/summary`); assert.equal(summary.status, 200); await summary.json();
  assert.equal((await server.readLocalWorkState()).known, false);
  await assert.rejects(provider.prepare(), /Bildtextjournal.*nicht vollständig lesbar/);
  await server.close();
  const preserved = join(profileRoot, "preserved-website-alt-sync.sqlite");
  await rename(filename, preserved);
  assert.deepEqual(await readFile(preserved), original);
});
