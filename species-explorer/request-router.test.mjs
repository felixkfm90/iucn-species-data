import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
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
    read: record("read"),
    pipelineBackupFile: async ({ response }) => {
      calls.push({ name: "pipelineBackupFile" });
      response.writeHead(200, { "Content-Type": "application/octet-stream" });
      response.end("backup");
    },
  };
}

test("Routen werden eindeutig und mit Vorrang für Neue-Art-Aktionen erkannt", () => {
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
  assert.deepEqual(matchExplorerRoute("HEAD", "/api/species/Amsel/assets/map/preview-file"), {
    name: "asset-preview-file",
    encodedId: "Amsel",
    assetType: "map",
  });
  assert.deepEqual(matchExplorerRoute("GET", "/api/revision"), {
    name: "read",
    resource: "revision",
  });
  assert.deepEqual(matchExplorerRoute("DELETE", "/api/species/Amsel"), {
    name: "method-not-allowed",
  });
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
