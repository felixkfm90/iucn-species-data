import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import {
  closeActiveFileStreams,
  parseByteRange,
  readJsonBody,
  safeAssetPath,
  safeGraphicsPath,
  safePublicPath,
  sendFile,
  sendJson,
  sendText,
} from "./http-routing.mjs";

async function createTemporaryRoot(context, prefix) {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  context.after(async () => {
    closeActiveFileStreams();
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

async function createTestServer(context, handler) {
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

test("JSON-Anfragen werden gelesen und begrenzt", async () => {
  const parsed = await readJsonBody(Readable.from([Buffer.from('{"name":"Amsel"}')]));
  assert.deepEqual(parsed, { name: "Amsel" });
  assert.deepEqual(await readJsonBody(Readable.from([])), {});

  await assert.rejects(
    readJsonBody(Readable.from([Buffer.from("ungültig")])),
    (error) => error.statusCode === 400 && /Ungültige JSON-Anfrage/.test(error.message),
  );
  await assert.rejects(
    readJsonBody(Readable.from([Buffer.from("1234")]), { maxBytes: 3 }),
    (error) => error.statusCode === 413 && /Anfrage ist zu groß/.test(error.message),
  );
});

test("öffentliche, Asset- und Grafikpfade bleiben in ihren Verzeichnisgrenzen", async (context) => {
  const repoRoot = await createTemporaryRoot(context, "iucn-http-paths-");
  const publicDir = path.join(repoRoot, "species-explorer", "public");
  await Promise.all([
    mkdir(publicDir, { recursive: true }),
    mkdir(path.join(repoRoot, "species-assets", "Amsel"), { recursive: true }),
    mkdir(path.join(repoRoot, "graphics", "catagory"), { recursive: true }),
  ]);

  assert.equal(safePublicPath("/", publicDir), path.join(publicDir, "index.html"));
  assert.equal(safePublicPath("/%2e%2e/secret.txt", publicDir), null);
  assert.equal(safePublicPath("/%E0%A4%A", publicDir), null);
  assert.equal(
    safeAssetPath("/assets/Amsel/sound.mp3", repoRoot),
    path.join(repoRoot, "species-assets", "Amsel", "sound.mp3"),
  );
  assert.equal(safeAssetPath("/assets/Amsel/secret.txt", repoRoot), null);
  assert.equal(safeAssetPath("/assets/%E0%A4%A/sound.mp3", repoRoot), null);
  assert.equal(
    safeGraphicsPath("/graphics/catagory/LC.png", repoRoot),
    path.join(repoRoot, "graphics", "catagory", "LC.png"),
  );
  assert.equal(safeGraphicsPath("/graphics/other/LC.png", repoRoot), null);
  assert.equal(safeGraphicsPath("/graphics/trend/../secret.png", repoRoot), null);
});

test("Byte-Bereiche unterstützen feste, offene und rückwärts gezählte Angaben", () => {
  assert.deepEqual(parseByteRange("bytes=2-5", 10), { start: 2, end: 5 });
  assert.deepEqual(parseByteRange("bytes=5-", 10), { start: 5, end: 9 });
  assert.deepEqual(parseByteRange("bytes=-3", 10), { start: 7, end: 9 });
  assert.deepEqual(parseByteRange("bytes=8-20", 10), { start: 8, end: 9 });
  assert.equal(parseByteRange("bytes=20-30", 10), null);
  assert.equal(parseByteRange("items=0-2", 10), null);
});

test("JSON- und Textantworten setzen eindeutige Inhaltstypen und verhindern Caching", async (context) => {
  const baseUrl = await createTestServer(context, (request, response) => {
    if (request.url === "/json") {
      sendJson(response, 201, { ok: true });
      return;
    }
    sendText(response, 202, "fertig");
  });

  const jsonResponse = await fetch(`${baseUrl}/json`);
  assert.equal(jsonResponse.status, 201);
  assert.match(jsonResponse.headers.get("content-type"), /^application\/json/);
  assert.equal(jsonResponse.headers.get("cache-control"), "no-store");
  assert.deepEqual(await jsonResponse.json(), { ok: true });

  const textResponse = await fetch(`${baseUrl}/text`);
  assert.equal(textResponse.status, 202);
  assert.match(textResponse.headers.get("content-type"), /^text\/plain/);
  assert.equal(textResponse.headers.get("cache-control"), "no-store");
  assert.equal(await textResponse.text(), "fertig");
});

test("Dateiantworten liefern vollständige, HEAD- und Range-Antworten", async (context) => {
  const root = await createTemporaryRoot(context, "iucn-http-files-");
  const audioPath = path.join(root, "sample.mp3");
  await writeFile(audioPath, Buffer.from("0123456789"));
  const baseUrl = await createTestServer(context, (request, response) => {
    return sendFile(request, response, request.url === "/missing" ? null : audioPath);
  });

  const fullResponse = await fetch(`${baseUrl}/audio`);
  assert.equal(fullResponse.status, 200);
  assert.equal(fullResponse.headers.get("accept-ranges"), "bytes");
  assert.equal(fullResponse.headers.get("content-type"), "audio/mpeg");
  assert.equal(await fullResponse.text(), "0123456789");

  const headResponse = await fetch(`${baseUrl}/audio`, { method: "HEAD" });
  assert.equal(headResponse.status, 200);
  assert.equal(headResponse.headers.get("content-length"), "10");
  assert.equal(await headResponse.text(), "");

  const rangeResponse = await fetch(`${baseUrl}/audio`, {
    headers: { Range: "bytes=2-5" },
  });
  assert.equal(rangeResponse.status, 206);
  assert.equal(rangeResponse.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(await rangeResponse.text(), "2345");

  const invalidRangeResponse = await fetch(`${baseUrl}/audio`, {
    headers: { Range: "bytes=20-30" },
  });
  assert.equal(invalidRangeResponse.status, 416);
  assert.equal(invalidRangeResponse.headers.get("content-range"), "bytes */10");

  const missingResponse = await fetch(`${baseUrl}/missing`);
  assert.equal(missingResponse.status, 404);
  assert.equal(await missingResponse.text(), "Nicht gefunden");
});
