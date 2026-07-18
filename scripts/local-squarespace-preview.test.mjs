import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import {
  createSquarespacePreviewServer,
  parsePreviewPort,
  resolvePreviewFile,
} from "./local-squarespace-preview.mjs";

test("Vorschau erlaubt ausschließlich die festgelegten lokalen Dateien", () => {
  const repoRoot = "D:\\IUCN_Datenbank";
  assert.match(resolvePreviewFile("/species-taxonomy.js", repoRoot), /species-taxonomy\.js$/);
  assert.match(resolvePreviewFile("/taxonomy-concept.svg", repoRoot), /taxonomy-pyramid-redesign-concept\.svg$/);
  assert.equal(resolvePreviewFile("/../package.json", repoRoot), null);
  assert.equal(resolvePreviewFile("/%2e%2e/package.json", repoRoot), null);
});

test("Vorschau-Port wird begrenzt und kontrolliert gelesen", () => {
  assert.equal(parsePreviewPort([]), 4188);
  assert.equal(parsePreviewPort(["--port=4199"]), 4199);
  assert.throws(() => parsePreviewPort(["--port=0"]), /zwischen 1 und 65535/);
  assert.throws(() => parsePreviewPort(["--port=abc"]), /zwischen 1 und 65535/);
});

test("lokaler Vorschau-Server liefert Branch-Dateien nur lesend aus", async (context) => {
  const server = createSquarespacePreviewServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => server.close());

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const [pageResponse, dataResponse, missingResponse, writeResponse] = await Promise.all([
    fetch(`${baseUrl}/`),
    fetch(`${baseUrl}/speciesData.json`),
    fetch(`${baseUrl}/package.json`),
    fetch(`${baseUrl}/`, { method: "POST" }),
  ]);

  assert.equal(pageResponse.status, 200);
  assert.match(await pageResponse.text(), /Lokale Squarespace-Vorschau/);
  assert.equal(dataResponse.status, 200);
  assert.ok(Array.isArray(await dataResponse.json()));
  assert.equal(missingResponse.status, 404);
  assert.equal(writeResponse.status, 405);
});
