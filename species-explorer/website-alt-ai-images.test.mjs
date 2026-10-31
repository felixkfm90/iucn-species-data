import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createAiImageNormalizer, createWebsiteAltAiImageLoader } from "./website-alt-ai-images.mjs";

const jpeg = Buffer.from([255,216,255,192,0,17,8,0,2,0,3,3,1,17,0,2,17,0,3,17,0,255,217]);
const pageUrl = "https://www.fnwildlifetravel.de/reisen/2019-griechenland/athen";
const imageKey = "a".repeat(64), observationHash = "b".repeat(64);
const input = { pageUrl, imageKey, observationHash };
const data = () => ({ pages: [{ url: pageUrl, title: "Athen", inventoryStatus: "current", images: [{ key: imageKey,
  observationHash, context: "content", kind: "image", status: "draft", src: "https://images.squarespace-cdn.com/content/v1/test/image.jpg" }] }] });
const normalizer = () => ({ normalize: async () => ({ bytes: jpeg, mimeType: "image/jpeg" }), close: async () => {}, busy: false });

test("KI-Bildlader verwendet ausschließlich bekannte Bildverwendung und liefert Bild-/Quellenbindung ohne Anmeldung", async () => {
  let requests = 0;
  const loader = createWebsiteAltAiImageLoader({ snapshot: async () => data(), normalizer: normalizer(), fetchImpl: async (url, options) => {
    requests++; assert.match(url, /^https:\/\/images.squarespace-cdn.com\//);
    assert.equal(options.credentials, "omit"); assert.equal(options.redirect, "manual"); assert.equal(options.headers.Authorization, undefined);
    return new Response(jpeg);
  } });
  const result = await loader.loadImage(input);
  assert.equal(result.imageId, imageKey); assert.equal(result.revision, observationHash);
  assert.equal(result.context.pageType, "travel-detail"); assert.equal(result.context.coupledCaption, true);
  assert.match(result.sha256, /^[a-f0-9]{64}$/); assert.equal(result.sha256, result.sourceSha256); assert.equal(requests, 1);
  await assert.rejects(loader.loadImage({ ...input, imageKey: "unknown" }), /Bildgrundlage/);
  assert.equal(requests, 1); await loader.close();
});

test("KI-Bildlader weist fremde Weiterleitungen und Bildgrundlagenwechsel zurück", async () => {
  let requests = 0;
  const loader = createWebsiteAltAiImageLoader({ snapshot: async () => data(), normalizer: normalizer(), fetchImpl: async () => {
    requests++; return new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } });
  } });
  await assert.rejects(loader.loadImage(input)); assert.equal(requests, 1); await loader.close();
  let reads = 0;
  const changed = createWebsiteAltAiImageLoader({ snapshot: async () => {
    const value = data(); if (++reads > 1) value.pages[0].images[0].observationHash = "c".repeat(64); return value;
  }, normalizer: normalizer(), fetchImpl: async () => new Response(jpeg) });
  await assert.rejects(changed.loadImage(input), /während der Vorbereitung/); await changed.close();
});

test("KI-Bildlader begrenzt Body und akzeptiert keine aktiven Bildformate", async () => {
  const loader = createWebsiteAltAiImageLoader({ snapshot: async () => data(), normalizer: normalizer(), maxBytes: 20,
    fetchImpl: async () => new Response(jpeg) });
  await assert.rejects(loader.loadImage(input), /Größengrenze/); await loader.close();
  const svg = createWebsiteAltAiImageLoader({ snapshot: async () => data(), normalizer: normalizer(), fetchImpl: async () =>
    new Response('<svg onload="attack()"></svg>', { headers: { "content-type": "image/jpeg" } }) });
  await assert.rejects(svg.loadImage(input), /Bildformat/); await svg.close();
});

test("Schließen bricht auch einen wartenden Bildbody vollständig ab", async () => {
  const started = Promise.withResolvers(); let cancelled = false;
  const loader = createWebsiteAltAiImageLoader({ snapshot: async () => data(), normalizer: normalizer(), fetchImpl: async () => {
    started.resolve(); return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  } });
  const work = loader.loadImage(input); const rejected = assert.rejects(work, { name: "AbortError" });
  await started.promise; await new Promise((resolve) => setImmediate(resolve)); await loader.close(); await rejected;
  assert.equal(cancelled, true); assert.equal(loader.busy, false);
});

test("Schließen während Inventarlesen startet danach keinen neuen Bildabruf", async () => {
  const gate = Promise.withResolvers(); let requests = 0;
  const loader = createWebsiteAltAiImageLoader({ snapshot: () => gate.promise, normalizer: normalizer(), fetchImpl: async () => {
    requests++; return new Response(jpeg);
  } });
  const work = loader.loadImage(input); const rejected = assert.rejects(work, { name: "AbortError" });
  await loader.close(); gate.resolve(data()); await rejected;
  assert.equal(requests, 0);
});

test("Bildvorbereitung begrenzt eigenen Decoder und quittiert erst dessen tatsächlichen Abschluss", async () => {
  let child, decoded = false;
  const decoder = createAiImageNormalizer({ repoRoot: ".", spawnImpl(command, args, options) {
    assert.equal(options.shell, false); assert.equal(options.windowsHide, true);
    assert.equal(args[args.indexOf("-protocol_whitelist") + 1], "pipe");
    assert.equal(args[args.indexOf("-i") + 1], "pipe:0"); assert.ok(!args.some((arg) => arg.startsWith("http")));
    child = new EventEmitter(); child.pid = 123; child.exitCode = null; child.signalCode = null;
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.stdin.resume();
    child.kill = () => { queueMicrotask(() => child.emit("close", 1)); return true; };
    child.stdin.once("finish", () => { child.stdout.write(jpeg); decoded = true; }); return child;
  } });
  let completed = false;
  const work = decoder.normalize(jpeg).then((result) => { completed = true; return result; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(decoded, true); assert.equal(completed, false); assert.equal(decoder.busy, true);
  child.exitCode = 0; child.emit("close", 0);
  assert.equal((await work).mimeType, "image/jpeg"); assert.equal(decoder.busy, false); await decoder.close();
});
