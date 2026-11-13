import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "../scripts/test-temp.mjs";
import path from "node:path";
import test from "node:test";
import { closeActiveFileStreams } from "./http-routing.mjs";
import {
  createExplorerRequestHandler,
  matchExplorerRoute,
} from "./request-router.mjs";

async function createTemporaryRoot(context) {
  const root = await mkdtemp(path.join(tmpdir(), "iucn-request-router-"));
  context.after(async () => {
    closeActiveFileStreams();
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

async function createTestServer(context, options) {
  const handler = createExplorerRequestHandler(options);
  const server = createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch((error) => {
      if (!response.headersSent) response.writeHead(500);
      response.end(String(error?.message ?? error));
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  context.after(async () => {
    closeActiveFileStreams();
    await new Promise((resolve) => server.close(resolve));
  });
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

function createOperations(calls, previewPath = null) {
  const record = (name) => async (args) => {
    calls.push({ name, ...args });
    return { ok: true, operation: name, ...args };
  };
  return {
    previewAssetFile: async (args) => {
      calls.push({ name: "previewAssetFile", ...args });
      return args.token === "valid" ? previewPath : null;
    },
    asset: record("asset"),
    pipeline: record("pipeline"),
    backupSettings: record("backupSettings"),
    backup: record("backup"),
    pipelineAssetReview: record("pipelineAssetReview"),
    newSpecies: record("newSpecies"),
    deleteSpecies: record("deleteSpecies"),
    editSpecies: record("editSpecies"),
    editTaxonomy: record("editTaxonomy"),
    editBackups: record("editBackups"),
    taxonomyRead: record("taxonomyRead"),
    taxonomyMaintenance: record("taxonomyMaintenance"),
    taxonomyMaster: record("taxonomyMaster"),
    taxonomyCorrection: record("taxonomyCorrection"),
    read: record("read"),
    pipelineBackupFile: async ({ response }) => {
      calls.push({ name: "pipelineBackupFile" });
      response.writeHead(200, { "Content-Type": "application/octet-stream" });
      response.end("backup");
    },
  };
}

test("Artseiten-KI-Routen bewahren Browser-/Sitzungsschutz und lehnen mehrdeutige Bindungen vor der Operation ab", async context => {
  const root = await createTemporaryRoot(context), calls = [];
  const baseUrl = await createTestServer(context, { host: "127.0.0.1", sessionToken: "ai-session", sessionProtection: true,
    repoRoot: root, publicDir: root, operations: { ...createOperations(calls),
      localAi: async input => { calls.push(input); return { accepted: input.payload }; } } });
  const scope = "a".repeat(64), revision = "b".repeat(64);
  const query = new URLSearchParams({ scope, revision, draftId: "draft-1", sectionId: "habitat" });
  const sourceUrl = `${baseUrl}/api/local-ai/page-authoring/sources?${query}`;
  assert.equal((await fetch(sourceUrl, { headers: { Origin: "https://foreign.invalid" } })).status, 403);
  assert.equal((await fetch(`${sourceUrl}&scope=${scope}`)).status, 400); assert.equal(calls.length, 0);
  const source = await fetch(sourceUrl); assert.equal(source.status, 200);
  assert.deepEqual((await source.json()).accepted, { type: "page-authoring", sourceScope: scope, expectedRevision: revision,
    draftId: "draft-1", sectionId: "habitat" });
  const url = `${baseUrl}/api/local-ai/page-authoring/suggest-alt`, headers = { "Content-Type": "application/json" };
  const request = { type: "page-authoring", sourceScope: scope, draftId: "draft-1", expectedRevision: revision, imageId: "image-1" };
  const count = calls.length;
  assert.equal((await fetch(url, { method: "POST", headers, body: JSON.stringify(request) })).status, 403);
  assert.equal(calls.length, count); headers["X-Species-Explorer-Session"] = "ai-session";
  assert.equal((await fetch(url, { method: "POST", headers, body: JSON.stringify({ ...request, type: "website" }) })).status, 400);
  assert.equal(calls.length, count);
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(request) });
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).accepted, request);
});

test("automatische Sprachprüfung nutzt ausschließlich die geschützte lokale POST-Route mit begrenztem Textkörper", async context => {
  const root = await createTemporaryRoot(context), calls = [];
  const baseUrl = await createTestServer(context, { host: "127.0.0.1", sessionToken: "language-session", sessionProtection: true,
    repoRoot: root, publicDir: root, operations: { ...createOperations(calls),
      languageCheck: async input => { calls.push(input); return { available: true, accepted: input.payload }; } } });
  assert.deepEqual(matchExplorerRoute("POST", "/api/language-check/check"), { name: "language-check", action: "check" });
  assert.notEqual(matchExplorerRoute("GET", "/api/language-check/check").name, "language-check");
  assert.deepEqual(matchExplorerRoute("GET", "/api/language-check"), { name: "language-check", action: "status" });
  const url = `${baseUrl}/api/language-check/check`, input = { text: "Der schöne Vogel 🐦", context: "caption" };
  const headers = { "Content-Type": "application/json" };
  assert.equal((await fetch(url, { method: "POST", headers, body: JSON.stringify(input) })).status, 403);
  headers["X-Species-Explorer-Session"] = "language-session";
  assert.equal((await fetch(url, { method: "POST", headers: { ...headers, Origin: "https://external.invalid" }, body: JSON.stringify(input) })).status, 403);
  assert.equal(calls.length, 0);
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(input) });
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).accepted, input);
  assert.equal(calls.length, 1); assert.equal(calls[0].signal.aborted, false);
  assert.equal((await fetch(url, { method: "POST", headers, body: JSON.stringify({ text: "x".repeat(140000) }) })).status, 413);
  assert.equal(calls.length, 1);
});

test("abgebrochene Inlineanfrage signalisiert dem lokalen Prüfer das Ende der Browseranfrage", async context => {
  const root = await createTemporaryRoot(context); let entered, ended;
  const started = new Promise(resolve => { entered = resolve; }), finished = new Promise(resolve => { ended = resolve; });
  const baseUrl = await createTestServer(context, { host: "127.0.0.1", sessionToken: "language-session", sessionProtection: true,
    repoRoot: root, publicDir: root, operations: { ...createOperations([]), languageCheck: async ({ signal }) => {
      entered(signal);
      await new Promise(resolve => signal.addEventListener("abort", resolve, { once: true }));
      ended(); return { available: true, findings: [] };
    } } });
  const controller = new AbortController(), pending = fetch(`${baseUrl}/api/language-check/check`, { method: "POST",
    headers: { "Content-Type": "application/json", "X-Species-Explorer-Session": "language-session" },
    body: JSON.stringify({ text: "Text" }), signal: controller.signal });
  const inner = await started; controller.abort(); await assert.rejects(pending, { name: "AbortError" });
  await finished; assert.equal(inner.aborted, true);
});

test("Routen werden eindeutig und mit Vorrang für Neue-Art-Aktionen erkannt", () => {
  for (const action of ["sequence-start", "sequence-resume", "sequence-pause", "sequence-restart-preview", "sequence-restart-build", "lightroom-close"]) {
    assert.deepEqual(matchExplorerRoute("POST", `/api/taxonomy/update/${action}`), { name: "taxonomy-maintenance", action });
    assert.notEqual(matchExplorerRoute("GET", `/api/taxonomy/update/${action}`).name, "taxonomy-maintenance");
  }
  assert.deepEqual(matchExplorerRoute("GET", "/api/taxonomy/update/sequence-status"), { name: "taxonomy-read", resource: "sequence-status" });
  assert.deepEqual(matchExplorerRoute("GET", "/api/taxonomy/update/lightroom-status"), { name: "taxonomy-read", resource: "lightroom-status" });
  assert.deepEqual(matchExplorerRoute("GET", "/api/session"), { name: "session" });
  assert.deepEqual(matchExplorerRoute("POST", "/api/species/new/preview"), {
    name: "new-species",
    action: "preview",
  });
  assert.deepEqual(matchExplorerRoute("POST", "/api/species/Amsel/preview"), {
    name: "edit-species",
    encodedId: "Amsel",
    action: "preview",
  });
  assert.deepEqual(matchExplorerRoute("POST", "/api/species/Amsel/taxonomy/preview"), {
    name: "edit-taxonomy",
    encodedId: "Amsel",
    action: "preview",
  });
  assert.deepEqual(matchExplorerRoute("POST", "/api/species/L%C3%B6we/delete/save"), {
    name: "delete-species",
    encodedId: "L%C3%B6we",
    action: "save",
  });
  assert.deepEqual(matchExplorerRoute("POST", "/api/species/Amsel/assets/sound/reject"), {
    name: "asset",
    encodedId: "Amsel",
    assetType: "sound",
    action: "reject",
  });
  assert.deepEqual(matchExplorerRoute("POST", "/api/species/Amsel/assets/sound/edit-preview"), {
    name: "asset",
    encodedId: "Amsel",
    assetType: "sound",
    action: "edit-preview",
  });
  assert.deepEqual(matchExplorerRoute("HEAD", "/api/species/Amsel/assets/map/preview-file"), {
    name: "asset-preview-file",
    encodedId: "Amsel",
    assetType: "map",
  });
  assert.deepEqual(matchExplorerRoute("GET", "/api/revision"), {
    name: "read",
    resource: "revision",
  });
  assert.deepEqual(matchExplorerRoute("GET", "/api/taxonomy/status"), {
    name: "taxonomy-read",
    resource: "status",
  });
  assert.deepEqual(matchExplorerRoute("GET", "/api/taxonomy/review"), {
    name: "taxonomy-read",
    resource: "review",
  });
  assert.deepEqual(matchExplorerRoute("POST", "/api/taxonomy/update/preview"), {
    name: "taxonomy-maintenance",
    action: "preview",
  });
  for (const action of ["storage-preview", "storage-clean"]) {
    assert.deepEqual(matchExplorerRoute("POST", `/api/taxonomy/master/${action}`), { name: "taxonomy-master", action });
    assert.notEqual(matchExplorerRoute("GET", `/api/taxonomy/master/${action}`).name, "taxonomy-master");
  }
  assert.deepEqual(matchExplorerRoute("POST", "/api/taxonomy/update/start"), {
    name: "taxonomy-maintenance",
    action: "start",
  });
  assert.deepEqual(matchExplorerRoute("POST", "/api/taxonomy/update/rollback"), {
    name: "taxonomy-maintenance",
    action: "rollback",
  });
  assert.deepEqual(matchExplorerRoute("POST", "/api/taxonomy/project-conflicts/decide"), {
    name: "taxonomy-maintenance",
    action: "decide-project-conflict",
  });
  assert.deepEqual(matchExplorerRoute("GET", "/api/taxonomy/master/status"), {
    name: "taxonomy-read",
    resource: "master-status",
  });
  assert.deepEqual(matchExplorerRoute("POST", "/api/taxonomy/master/build"), {
    name: "taxonomy-master",
    action: "build",
  });
  for (const action of ["pause-build", "resume-build", "build-baseline"]) {
    assert.deepEqual(matchExplorerRoute("POST", `/api/taxonomy/master/${action}`), { name: "taxonomy-master", action });
    assert.notEqual(matchExplorerRoute("GET", `/api/taxonomy/master/${action}`)?.name, "taxonomy-master");
  }
  assert.deepEqual(matchExplorerRoute("POST", "/api/taxonomy/master/apply-corrections"), {
    name: "taxonomy-master",
    action: "apply-corrections",
  });
  assert.deepEqual(matchExplorerRoute("POST", "/api/taxonomy/master/conflicts/decide"), {
    name: "taxonomy-master",
    action: "decide",
  });
  assert.deepEqual(matchExplorerRoute("POST", "/api/taxonomy/master/activate"), {
    name: "taxonomy-master",
    action: "activate",
  });
  assert.deepEqual(matchExplorerRoute("POST", "/api/taxonomy/master/rollback"), {
    name: "taxonomy-master",
    action: "rollback",
  });
  assert.deepEqual(matchExplorerRoute("POST", "/api/taxonomy/master/sync-lightroom"), {
    name: "taxonomy-master",
    action: "sync-lightroom",
  });
  assert.deepEqual(matchExplorerRoute("POST", "/api/taxonomy/corrections/save"), {
    name: "taxonomy-correction",
    action: "save",
  });
  assert.deepEqual(matchExplorerRoute("POST", "/api/taxonomy/corrections/reset"), {
    name: "taxonomy-correction",
    action: "reset",
  });
  assert.deepEqual(matchExplorerRoute("GET", "/api/taxonomy/search"), {
    name: "taxonomy-read",
    resource: "search",
  });
  assert.deepEqual(matchExplorerRoute("GET", "/api/taxonomy/taxa/col%3A123"), {
    name: "taxonomy-read",
    resource: "taxon",
    encodedReference: "col%3A123",
  });
  assert.deepEqual(matchExplorerRoute("DELETE", "/api/species/Amsel"), {
    name: "method-not-allowed",
  });
});

test("Historische Sicherungen sind getrennt lesbar und brauchen eine geschützte Bestätigung", async (context) => {
  const root = await createTemporaryRoot(context);
  const publicDir = path.join(root, "public");
  await mkdir(publicDir, { recursive: true });
  const calls = [];
  const baseUrl = await createTestServer(context, {
    host: "127.0.0.1", sessionToken: "restore-session", sessionProtection: true,
    repoRoot: root, publicDir, operations: createOperations(calls),
  });
  const pathPrefix = "/api/species/Art%20Test/backups";
  const listed = await fetch(`${baseUrl}${pathPrefix}`);
  assert.equal(listed.status, 200);
  assert.deepEqual(calls.at(-1), { name: "editBackups", id: "Art Test", action: "list", payload: {} });
  const archives = await fetch(`${baseUrl}/api/backup/archives`);
  assert.equal(archives.status, 200);
  assert.deepEqual(calls.at(-1), { name: "read", resource: "backup-archives" });
  const readCalls = calls.length;
  for (const pathname of [pathPrefix, "/api/backup/archives"]) {
    assert.equal((await fetch(`${baseUrl}${pathname}`, { headers: { Origin: "https://fremd.example" } })).status, 403);
  }
  assert.equal(calls.length, readCalls);
  for (const action of ["preview", "restore"]) {
    const callsBeforeWrite = calls.length;
    const denied = await fetch(`${baseUrl}${pathPrefix}/${action}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "chosen" }),
    });
    assert.equal(denied.status, 403);
    assert.equal(calls.length, callsBeforeWrite);
    const allowed = await fetch(`${baseUrl}${pathPrefix}/${action}`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Species-Explorer-Session": "restore-session" },
      body: JSON.stringify({ token: "chosen" }),
    });
    assert.equal(allowed.status, 200);
    assert.deepEqual(calls.at(-1), { name: "editBackups", id: "Art Test", action, payload: { token: "chosen" } });
  }
});

test("Neustartvorschau und bestätigter Neuaufbau benötigen die lokale Sitzung und erhalten die exakte Auftragsbindung", async (context) => {
  const root = await createTemporaryRoot(context);
  const publicDir = path.join(root, "public");
  await mkdir(publicDir, { recursive: true });
  const calls = [];
  const baseUrl = await createTestServer(context, { host: "127.0.0.1", sessionToken: "restart-session",
    sessionProtection: true, repoRoot: root, publicDir, operations: createOperations(calls) });
  const payload = { confirmed: true, token: "bound-preview", updateRunId: "update-previous",
    buildJobId: "job-previous", buildJobRevision: "bound-recipe",
    usageConsent: { allCatalogsConfirmed: true, noChangesUntilClose: true } };
  for (const action of ["sequence-restart-preview", "sequence-restart-build"]) {
    const pathname = `/api/taxonomy/update/${action}`;
    for (const headers of [{}, { "X-Species-Explorer-Session": "restart-session", Origin: "https://fremd.example" }]) {
      const before = calls.length;
      const denied = await fetch(`${baseUrl}${pathname}`, { method: "POST",
        headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(payload) });
      assert.equal(denied.status, 403);
      assert.equal(calls.length, before, "Abgewiesene Aufrufe dürfen die Fachoperation nicht erreichen");
    }
    const allowed = await fetch(`${baseUrl}${pathname}`, { method: "POST",
      headers: { "Content-Type": "application/json", "X-Species-Explorer-Session": "restart-session" },
      body: JSON.stringify(payload) });
    assert.equal(allowed.status, 200);
    assert.deepEqual(calls.at(-1), { name: "taxonomyMaintenance", action, payload });
  }
});

test("Handler liefert Sitzung, Lesedaten und freigegebene statische Dateien", async (context) => {
  const root = await createTemporaryRoot(context);
  const publicDir = path.join(root, "public");
  const assetDir = path.join(root, "species-assets", "Amsel");
  const graphicsDir = path.join(root, "graphics", "catagory");
  await Promise.all([
    mkdir(publicDir, { recursive: true }),
    mkdir(assetDir, { recursive: true }),
    mkdir(graphicsDir, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(publicDir, "index.html"), "Explorer"),
    writeFile(path.join(assetDir, "map.jpg"), "map"),
    writeFile(path.join(graphicsDir, "LC.png"), "icon"),
  ]);
  const calls = [];
  const baseUrl = await createTestServer(context, {
    host: "127.0.0.1",
    sessionToken: "test-session",
    sessionProtection: false,
    repoRoot: root,
    publicDir,
    operations: createOperations(calls),
  });

  const sessionResponse = await fetch(`${baseUrl}/api/session`);
  assert.equal(sessionResponse.status, 200);
  assert.deepEqual(await sessionResponse.json(), { token: "test-session" });

  const summaryResponse = await fetch(`${baseUrl}/api/summary`);
  assert.equal(summaryResponse.status, 200);
  assert.equal((await summaryResponse.json()).resource, "summary");
  assert.deepEqual(calls.at(-1), { name: "read", resource: "summary" });

  const taxonomyResponse = await fetch(
    `${baseUrl}/api/taxonomy/search?q=Stieglitz&kind=vernacular&kingdomId=Animalia&limit=12`,
  );
  assert.equal(taxonomyResponse.status, 200);
  assert.deepEqual(calls.at(-1), {
    name: "taxonomyRead",
    resource: "search",
    reference: "",
    searchParams: new URLSearchParams(
      "q=Stieglitz&kind=vernacular&kingdomId=Animalia&limit=12",
    ),
  });

  const taxonResponse = await fetch(`${baseUrl}/api/taxonomy/taxa/col%3A123`);
  assert.equal(taxonResponse.status, 200);
  assert.deepEqual(calls.at(-1), {
    name: "taxonomyRead",
    resource: "taxon",
    reference: "col:123",
    searchParams: new URLSearchParams(),
  });

  assert.equal(await (await fetch(`${baseUrl}/`)).text(), "Explorer");
  assert.equal(await (await fetch(`${baseUrl}/assets/Amsel/map.jpg`)).text(), "map");
  assert.equal(await (await fetch(`${baseUrl}/graphics/catagory/LC.png`)).text(), "icon");

  const methodResponse = await fetch(`${baseUrl}/api/summary`, { method: "DELETE" });
  assert.equal(methodResponse.status, 405);
  assert.equal(methodResponse.headers.get("allow"), "GET, HEAD, POST");
});

test("Schreibaktionen werden begrenzt, dekodiert und an Fachoperationen delegiert", async (context) => {
  const root = await createTemporaryRoot(context);
  const publicDir = path.join(root, "public");
  await mkdir(publicDir, { recursive: true });
  await writeFile(path.join(publicDir, "index.html"), "Explorer");
  const calls = [];
  const baseUrl = await createTestServer(context, {
    host: "127.0.0.1",
    sessionToken: "test-session",
    sessionProtection: false,
    repoRoot: root,
    publicDir,
    bodyLimits: { map: 24, sound: 32, portrait: 40 },
    operations: createOperations(calls),
  });
  const post = (pathname, payload) => fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const mapResponse = await post("/api/species/L%C3%B6we/assets/map/preview", { source: "x" });
  assert.equal(mapResponse.status, 200);
  assert.deepEqual(calls.at(-1), {
    name: "asset",
    assetType: "map",
    id: "Löwe",
    action: "preview",
    payload: { source: "x" },
  });

  await post("/api/species/new/portrait-preview", { image: "x" });
  assert.deepEqual(calls.at(-1), {
    name: "newSpecies",
    action: "portrait-preview",
    payload: { image: "x" },
  });

  await post("/api/species/Amsel/delete/save", { confirmed: true });
  assert.deepEqual(calls.at(-1), {
    name: "deleteSpecies",
    id: "Amsel",
    action: "save",
    payload: { confirmed: true },
  });

  await post("/api/taxonomy/update/start", { token: "preview-token" });
  assert.deepEqual(calls.at(-1), {
    name: "taxonomyMaintenance",
    action: "start",
    payload: { token: "preview-token" },
  });

  await post("/api/taxonomy/master/build", { refreshProviders: true });
  assert.deepEqual(calls.at(-1), {
    name: "taxonomyMaster",
    action: "build",
    payload: { refreshProviders: true },
  });

  await post("/api/taxonomy/master/build-baseline", { confirmed: true, revision: "confirmed-stand" });
  assert.deepEqual(calls.at(-1), {
    name: "taxonomyMaster", action: "build-baseline", payload: { confirmed: true, revision: "confirmed-stand" },
  });

  await post("/api/taxonomy/master/apply-corrections", { confirmed: true });
  assert.deepEqual(calls.at(-1), {
    name: "taxonomyMaster",
    action: "apply-corrections",
    payload: { confirmed: true },
  });

  await post("/api/taxonomy/master/sync-lightroom", {});
  assert.deepEqual(calls.at(-1), {
    name: "taxonomyMaster",
    action: "sync-lightroom",
    payload: {},
  });

  await post("/api/taxonomy/corrections/save", {
    scientificName: "Panthera pardus",
    germanName: "Leopard",
  });
  assert.deepEqual(calls.at(-1), {
    name: "taxonomyCorrection",
    action: "save",
    payload: {
      scientificName: "Panthera pardus",
      germanName: "Leopard",
    },
  });

  const oversizedResponse = await post(
    "/api/species/Amsel/assets/map/preview",
    { source: "Diese Nutzlast überschreitet das gesetzte Testlimit" },
  );
  assert.equal(oversizedResponse.status, 413);
  assert.match((await oversizedResponse.json()).error, /Anfrage ist zu groß/);
});

test("Vorschaudateien und strukturierte Fehlerantworten bleiben zentral behandelt", async (context) => {
  const root = await createTemporaryRoot(context);
  const publicDir = path.join(root, "public");
  const previewPath = path.join(root, "preview.jpg");
  await mkdir(publicDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(publicDir, "index.html"), "Explorer"),
    writeFile(previewPath, "preview"),
  ]);
  const calls = [];
  const operations = createOperations(calls, previewPath);
  operations.read = async () => {
    const error = new Error("Testfehler");
    error.statusCode = 422;
    error.details = ["Detail"];
    error.fieldErrors = { name: "Ungültig" };
    throw error;
  };
  const baseUrl = await createTestServer(context, {
    host: "127.0.0.1",
    sessionToken: "test-session",
    sessionProtection: false,
    repoRoot: root,
    publicDir,
    operations,
  });

  const previewResponse = await fetch(
    `${baseUrl}/api/species/Amsel/assets/map/preview-file?token=valid`,
  );
  assert.equal(previewResponse.status, 200);
  assert.equal(await previewResponse.text(), "preview");

  const missingResponse = await fetch(
    `${baseUrl}/api/species/Amsel/assets/map/preview-file?token=missing`,
  );
  assert.equal(missingResponse.status, 404);
  assert.equal(await missingResponse.text(), "Kartenvorschau nicht gefunden");

  const errorResponse = await fetch(`${baseUrl}/api/summary`);
  assert.equal(errorResponse.status, 422);
  assert.deepEqual(await errorResponse.json(), {
    error: "Testfehler",
    details: ["Detail"],
    fieldErrors: { name: "Ungültig" },
  });
});
