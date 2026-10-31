import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { createLocalAiCache } from "./cache.mjs";
import { extractPinnedRuntime } from "./zip.mjs";
import { sha256 } from "./files.mjs";
import { fixture, tinyLock, zipFixture } from "./test-fixtures.mjs";

test("optionaler Download benötigt bewusste Wahl, pinnt alle Dateien und startet kein Programm", async (t) => {
  const root = await fixture(t), input = tinyLock(), progress = [];
  const cache = createLocalAiCache({ cacheRoot: path.join(root, "cache"), lock: input.lock, fetchImpl: input.fetch, allowTestSources: true });
  t.after(() => cache.close());
  await assert.rejects(cache.download({}), /ausdrücklich/);
  await cache.download({ confirmed: true, onProgress: (item) => progress.push(item) });
  const installed = await cache.resolveVerified();
  assert.equal(installed.bundleId, "test-bundle");
  assert.equal(await fs.readFile(installed.serverPath, "utf8"), "synthetic-not-an-executable");
  assert.equal((await cache.status()).status, "ready");
  assert.ok(progress.length >= input.lock.artifacts.length);
  assert.ok(progress.every((item) => !JSON.stringify(item).includes("https://")));
  assert.equal((await cache.download({ confirmed: true })).alreadyPresent, true);
  assert.ok(!(await fs.readdir(path.join(root, "cache"))).some((name) => name.startsWith(".install") || name.endsWith(".lock")));
});

test("expliziter Import prüft Quelle und Kopie, lässt vorbereitete Originale unverändert und nutzt kein Netz", async (t) => {
  const root = await fixture(t), input = tinyLock(), sourceRoot = path.join(root, "prepared");
  await fs.mkdir(path.join(sourceRoot, "downloads"), { recursive: true });
  for (const item of input.lock.artifacts) await fs.writeFile(path.join(sourceRoot, "downloads", item.sourceName), input.bytes.get(item.url));
  const preparedReportPath = path.join(root, "prepared.json"), report = Buffer.from(JSON.stringify({ schemaVersion: 1, root: sourceRoot }));
  await fs.writeFile(preparedReportPath, report);
  const cache = createLocalAiCache({ cacheRoot: path.join(root, "cache"), lock: input.lock, allowTestSources: true,
    fetchImpl: async () => { throw new Error("No download permitted"); } });
  t.after(() => cache.close());
  await cache.importPrepared({ confirmed: true, preparedReportPath, expectedReportSha256: sha256(report) });
  for (const item of input.lock.artifacts) assert.equal(sha256(await fs.readFile(path.join(sourceRoot, "downloads", item.sourceName))), item.sha256);
  assert.equal((await cache.resolveVerified()).runtimeVersion, "synthetic");
});

test("transportkomprimierte Antwort wird gegen tatsächliche entpackte Bytes und Pin geprüft, nicht gegen komprimiertes Content-Length", async (t) => {
  const root = await fixture(t), input = tinyLock();
  const cache = createLocalAiCache({ cacheRoot: path.join(root, "cache"), lock: input.lock, allowTestSources: true,
    fetchImpl: async (url) => {
      // fetch transparently decodes gzip/br while retaining the transport headers.
      const bytes = input.bytes.get(String(url));
      return new Response(bytes, { headers: { "content-encoding": "gzip", "content-length": String(bytes.length + 73) } });
    } });
  t.after(() => cache.close());
  await cache.download({ confirmed: true });
  assert.equal((await cache.resolveVerified()).bundleId, "test-bundle");
  assert.equal((await cache.status()).downloadedBytes, input.lock.artifacts.reduce((sum, pin) => sum + pin.bytes, 0));
});

test("echtes Loopback-HTTP gzip wird von fetch entpackt; erhaltenes komprimiertes Content-Length stoppt die gepinnte Einrichtung nicht", async (t) => {
  const root = await fixture(t), input = tinyLock(), transfers = [];
  const license = input.lock.artifacts.find((pin) => pin.kind === "license"), decodedLicense = Buffer.from("synthetic license only\n".repeat(54)).subarray(0, 1078);
  input.bytes.set(license.url, decodedLicense); license.bytes = decodedLicense.length; license.sha256 = sha256(decodedLicense);
  input.lock.artifacts = [license, ...input.lock.artifacts.filter((pin) => pin !== license)];
  const bodies = new Map(input.lock.artifacts.map((pin) => [`/${encodeURIComponent(pin.id)}`, input.bytes.get(pin.url)]));
  const server = createServer((request, response) => {
    const decoded = bodies.get(request.url); if (!decoded) { response.writeHead(404).end(); return; }
    const encoded = gzipSync(decoded);
    response.writeHead(200, { "Content-Encoding": "gzip", "Content-Length": encoded.length, "Content-Type": "application/octet-stream" }); response.end(encoded);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const pin of input.lock.artifacts) pin.url = `${base}/${encodeURIComponent(pin.id)}`;
  const cache = createLocalAiCache({ cacheRoot: path.join(root, "cache"), lock: input.lock, allowTestSources: true,
    fetchImpl: async (url, options) => {
      const response = await fetch(url, options);
      transfers.push({ encoding: response.headers.get("content-encoding"), transportBytes: Number(response.headers.get("content-length")) }); return response;
    } });
  try {
    await cache.download({ confirmed: true });
    assert.equal((await cache.resolveVerified()).bundleId, "test-bundle");
    assert.equal(transfers[0].encoding, "gzip"); assert.notEqual(transfers[0].transportBytes, license.bytes); assert.equal(license.bytes, 1078);
    assert.equal(sha256(await fs.readFile(path.join(root, "cache", "bundles", "test-bundle", license.relative))), license.sha256);
    assert.equal((await cache.status()).downloadedBytes, input.lock.artifacts.reduce((sum, pin) => sum + pin.bytes, 0));
  } finally { await cache.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});

test("Einrichtungsfehler nennen sicheren Code, Phase und Pin-ID statt beliebiger URL-/Token-/Pfadtexte", async (t) => {
  const root = await fixture(t), input = tinyLock();
  const cache = createLocalAiCache({ cacheRoot: path.join(root, "cache"), lock: input.lock, allowTestSources: true,
    fetchImpl: async () => new Response("private fixture response with a token", { status: 403 }) });
  try {
    await assert.rejects(cache.download({ confirmed: true }));
    const status = await cache.status();
    assert.deepEqual(status.errorDetails, { code: "LOCAL_AI_HTTP_ERROR", phase: "download", artifactId: "runtime.zip", httpStatus: 403 });
    assert.doesNotMatch(JSON.stringify(status), /https?:|fixture response|Bearer|token=|[A-Z]:\\/i);
  } finally { await cache.close(); }
});

test("echtes HTTP-gzip lockert weder entpackte Größengrenze noch SHA-Prüfung", async (t) => {
  for (const mode of ["hash", "oversize", "short"]) await t.test(mode, async (st) => {
    const root = await fixture(st), input = tinyLock(), pin = input.lock.artifacts[0], expected = input.bytes.get(pin.url);
    const decoded = mode === "oversize" ? Buffer.concat([expected, Buffer.from("x")]) : mode === "short" ? expected.subarray(0, expected.length - 1) : Buffer.from(expected);
    if (mode === "hash") decoded[0] ^= 1;
    const encoded = gzipSync(decoded), server = createServer((request, response) => {
      response.writeHead(200, { "Content-Encoding": "gzip", "Content-Length": encoded.length }); response.end(encoded);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    pin.url = `http://127.0.0.1:${server.address().port}/fixture`;
    const cacheRoot = path.join(root, "cache"), cache = createLocalAiCache({ cacheRoot, lock: input.lock, allowTestSources: true });
    try {
      const code = mode === "hash" ? "LOCAL_AI_HASH_MISMATCH" : mode === "oversize" ? "LOCAL_AI_SIZE_EXCEEDED" : "LOCAL_AI_SIZE_MISMATCH";
      await assert.rejects(cache.download({ confirmed: true }), { code });
      const state = await cache.status(); assert.equal(state.errorDetails.code, code); assert.equal(state.errorDetails.phase, "download");
      assert.equal(state.errorDetails.artifactId, "runtime.zip"); assert.equal(state.status, "failed");
      assert.deepEqual(await fs.readdir(cacheRoot), []);
    } finally { await cache.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  });
});

test("Netzfehler und ungeeignete Pin-IDs können keine privaten Texte in Fehlerstatus einschleusen", async (t) => {
  for (const mode of ["network", "pin-id", "callback"]) await t.test(mode, async (st) => {
    const root = await fixture(st), input = tinyLock(), privateText = "https://private.invalid/?token=fixture-secret C:\\private\\file Bearer fixture-secret";
    if (mode === "pin-id") input.lock.artifacts[0].id = privateText;
    const cache = createLocalAiCache({ cacheRoot: path.join(root, "cache"), lock: input.lock, allowTestSources: true,
      fetchImpl: mode === "network" ? async () => { throw new Error(privateText); } : mode === "pin-id" ? async () => new Response("private body", { status: 403 }) : input.fetch });
    try {
      await assert.rejects(cache.download({ confirmed: true, ...(mode === "callback" ? { onProgress() { throw Object.assign(new Error(privateText), { code: "LOCAL_AI_HASH_MISMATCH" }); } } : {}) }));
      const status = await cache.status(); assert.doesNotMatch(JSON.stringify(status), /private\.invalid|fixture-secret|Bearer|C:\\private|https?:/i);
      assert.equal(status.errorDetails.phase, "download"); assert.equal(status.errorDetails.artifactId, mode === "pin-id" ? "artifact-1" : "runtime.zip");
    } finally { await cache.close(); }
  });
});

test("vorhandene fremde Einrichtungsreste bleiben bei Lock-/Bestandsfehlern bytegleich erhalten", async (t) => {
  for (const mode of ["lock", "incomplete-bundle"]) await t.test(mode, async (st) => {
    const root = await fixture(st), input = tinyLock(), cacheRoot = path.join(root, "cache"); await fs.mkdir(cacheRoot);
    const target = mode === "lock" ? path.join(cacheRoot, "install.lock") : path.join(cacheRoot, "bundles", "test-bundle", "keep.txt");
    await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, "Own fictional pre-existing data, preserved by the cache");
    const before = sha256(await fs.readFile(target)), cache = createLocalAiCache({ cacheRoot, lock: input.lock, allowTestSources: true,
      fetchImpl: async () => { throw new Error("This preservation case must not download anything"); } });
    try {
      await assert.rejects(cache.download({ confirmed: true })); assert.equal(sha256(await fs.readFile(target)), before);
      const status = await cache.status(); assert.equal(status.errorDetails.code, mode === "lock" ? "LOCAL_AI_INSTALL_LOCKED" : "LOCAL_AI_EXISTING_CACHE_INVALID");
      assert.equal(status.errorDetails.phase, mode === "lock" ? "preflight" : "verify-existing");
      assert.equal(status.errorDetails.artifactId, "");
    } finally { await cache.close(); }
  });
});

test("blockierter eigener Abschluss schließt seinen Lockhandle und erhält gebundene Arbeitsreste sichtbar", async (t) => {
  const root = await fixture(t), input = tinyLock(), cacheRoot = path.join(root, "cache");
  const actualOpen = fs.open.bind(fs), actualRm = fs.rm.bind(fs); let closedOwner = false, stage;
  const open = t.mock.method(fs, "open", async (...args) => {
    const handle = await actualOpen(...args);
    if (String(args[0]) === path.join(cacheRoot, "install.lock")) {
      const close = handle.close.bind(handle); handle.close = async () => { closedOwner = true; return close(); };
    }
    return handle;
  });
  const remove = t.mock.method(fs, "rm", async (filename, options) => {
    if (String(filename) === stage) throw Object.assign(new Error("C:\\private\\blocked token=fixture-secret"), { code: "EPERM" });
    return actualRm(filename, options);
  });
  const cache = createLocalAiCache({ cacheRoot, lock: input.lock, allowTestSources: true, fetchImpl: async () => {
    stage = path.join(cacheRoot, (await fs.readdir(cacheRoot)).find((name) => name.startsWith(".install-")));
    return new Response("no fixture file", { status: 503 });
  } });
  try {
    await assert.rejects(cache.download({ confirmed: true }), { code: "LOCAL_AI_CLEANUP_BLOCKED" });
    assert.equal(closedOwner, true); assert.ok((await fs.stat(stage)).isDirectory()); assert.ok((await fs.stat(path.join(cacheRoot, "install.lock"))).isFile());
    const status = await cache.status(); assert.equal(status.errorDetails.phase, "cleanup"); assert.equal(status.status, "failed");
    assert.doesNotMatch(JSON.stringify(status), /C:\\private|fixture-secret|token=/i);
  } finally { open.mock.restore(); remove.mock.restore(); await cache.close(); }
});

test("erneut erfolgreich geprüfter vorhandener Cache behält keine alte Fehlerdiagnose", async (t) => {
  const root = await fixture(t), input = tinyLock(), cacheRoot = path.join(root, "cache");
  const cache = createLocalAiCache({ cacheRoot, lock: input.lock, allowTestSources: true, fetchImpl: input.fetch });
  try {
    await cache.download({ confirmed: true }); await fs.writeFile(path.join(cacheRoot, "install.lock"), "Own fictional existing lock");
    await assert.rejects(cache.download({ confirmed: true }), { code: "LOCAL_AI_INSTALL_LOCKED" });
    await cache.resolveVerified(); const status = await cache.status();
    assert.equal(status.status, "ready"); assert.equal(status.error, ""); assert.equal(status.errorDetails, null);
    assert.equal(await fs.readFile(path.join(cacheRoot, "install.lock"), "utf8"), "Own fictional existing lock");
  } finally { await cache.close(); }
});

test("Hashfehler und zu große Antworten hinterlassen keinen installierten oder fremd überschriebenen Bestand", async (t) => {
  for (const mode of ["hash", "size", "declared"]) await t.test(mode, async (st) => {
    const root = await fixture(st), input = tinyLock();
    const cache = createLocalAiCache({ cacheRoot: path.join(root, "cache"), lock: input.lock, allowTestSources: true,
      fetchImpl: async () => new Response(mode === "size" ? Buffer.alloc(5000) : Buffer.alloc(input.lock.artifacts[0].bytes),
        mode === "declared" ? { headers: { "content-length": "99999999" } } : {}) });
    st.after(() => cache.close());
    await assert.rejects(cache.download({ confirmed: true }));
    assert.ok(!(await fs.readdir(path.join(root, "cache"))).some((name) => name.startsWith(".install") || name.endsWith(".lock")));
    assert.equal((await cache.status()).status, "failed");
  });
});

test("unvollständige oder zusätzliche Laufzeitdateien verhindern jede startbereite Auflösung", async (t) => {
  const root = await fixture(t), input = tinyLock(), cacheRoot = path.join(root, "cache");
  const cache = createLocalAiCache({ cacheRoot, lock: input.lock, fetchImpl: input.fetch, allowTestSources: true });
  t.after(() => cache.close());
  await cache.download({ confirmed: true });
  const runtime = path.join(cacheRoot, "bundles/test-bundle/runtime");
  await fs.writeFile(path.join(runtime, "injected.dll"), "not bound");
  await assert.rejects(cache.resolveVerified(), /zusätzliche/);
  await fs.rm(path.join(runtime, "injected.dll"));
  await fs.rm(path.join(runtime, "LICENSE-LLVM-OpenMP"));
  await assert.rejects(cache.resolveVerified());
});

test("ZIP-Pfadüberschreitung, Links, doppelte Namen, CRC-Fehler und fehlende Dateien werden abgewiesen", async (t) => {
  const cases = {
    traversal: [{ name: "../outside", data: "a" }],
    symlink: [{ name: "file", data: "x", attributes: (0xa000 << 16) >>> 0 }],
    duplicate: [{ name: "file", data: "a" }, { name: "file", data: "a" }],
    crc: [{ name: "file", data: "a", crc: 123 }],
  };
  for (const [name, entries] of Object.entries(cases)) await t.test(name, async (st) => {
    const root = await fixture(st), archive = path.join(root, "runtime.zip"), destination = path.join(root, "unpacked");
    await fs.writeFile(archive, zipFixture(entries));
    await assert.rejects(extractPinnedRuntime(archive, destination, [{ relative: "file", bytes: 1, sha256: sha256(Buffer.from("a")) }]));
    await assert.rejects(fs.access(path.join(root, "outside")), { code: "ENOENT" });
  });
});

test("offizielle Pins sind Pflicht und laufender Worker schützt seinen Cache", async (t) => {
  const root = await fixture(t), input = tinyLock();
  assert.throws(() => createLocalAiCache({ cacheRoot: path.join(root, "cache"), lock: input.lock }));
  const cache = createLocalAiCache({ cacheRoot: path.join(root, "cache"), lock: input.lock, allowTestSources: true, isWorkerBusy: () => true });
  await assert.rejects(cache.download({ confirmed: true }), /arbeitet noch/);
  await cache.close();
});

test("kleine echte Deflate-Datei wird entpackt; verborgene größere Entpackmenge wird begrenzt", async (t) => {
  const root = await fixture(t), valid = path.join(root, "valid.zip"), invalid = path.join(root, "bomb.zip");
  const text = "small compressed fixture";
  await fs.writeFile(valid, zipFixture([{ name: "file", data: text, method: 8 }]));
  await extractPinnedRuntime(valid, path.join(root, "valid"), [{ relative: "file", bytes: Buffer.byteLength(text), sha256: sha256(Buffer.from(text)) }]);
  assert.equal(await fs.readFile(path.join(root, "valid/file"), "utf8"), text);
  await fs.writeFile(invalid, zipFixture([{ name: "file", data: "a".repeat(5000), method: 8, declaredBytes: 1 }]));
  await assert.rejects(extractPinnedRuntime(invalid, path.join(root, "invalid"), [{ relative: "file", bytes: 1, sha256: sha256(Buffer.from("a")) }]));
  await assert.rejects(fs.access(path.join(root, "invalid/file")), { code: "ENOENT" });
});

test("Cancel einer langsamen Quelle bereinigt nur die eigene Stagingkopie", async (t) => {
  const root = await fixture(t), input = tinyLock();
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const cache = createLocalAiCache({ cacheRoot: path.join(root, "cache"), lock: input.lock, allowTestSources: true,
    fetchImpl: async () => { entered(); return new Response(new ReadableStream({ start() {} })); } });
  const installing = cache.download({ confirmed: true }); await started;
  cache.cancelInstall();
  await assert.rejects(installing);
  assert.equal((await cache.status()).status, "cancelled");
  assert.deepEqual(await fs.readdir(path.join(root, "cache")), []);
  await cache.close();
});
