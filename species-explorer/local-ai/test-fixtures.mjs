import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { sha256 } from "./files.mjs";
import { crc32 } from "./zip.mjs";
import { deflateRawSync } from "node:zlib";

export async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "local-ai-product-"));
  t.after(() => fs.rm(assertTestTempPath(root), { recursive: true, force: true }));
  return root;
}
export function zipFixture(entries) {
  const locals = [], central = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name), data = Buffer.from(entry.data), crc = entry.crc ?? crc32(data);
    const method = entry.method || 0, compressed = method === 8 ? deflateRawSync(data) : data, declaredBytes = entry.declaredBytes ?? data.length;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14);
    local.writeUInt16LE(method, 8); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(declaredBytes, 22); local.writeUInt16LE(name.length, 26);
    const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 6); directory.writeUInt32LE(crc, 16);
    directory.writeUInt16LE(method, 10); directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(declaredBytes, 24); directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(entry.attributes || 0, 38); directory.writeUInt32LE(offset, 42);
    locals.push(local, name, compressed); central.push(directory, name); offset += local.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
export function tinyLock({ archiveEntries } = {}) {
  const runtime = archiveEntries || [{ name: "llama-server.exe", data: "synthetic-not-an-executable" },
    { name: "llama-server-impl.dll", data: "synthetic-library" }, { name: "LICENSE-LLVM-OpenMP", data: "synthetic license fixture" }];
  const bytes = new Map();
  const specifications = [
    ["runtime.zip", "runtime-archive", "downloads/runtime.zip", zipFixture(runtime)],
    ["model.gguf", "model", "models/model.gguf", Buffer.from("GGUF-synthetic-model")],
    ["projector.gguf", "model", "models/projector.gguf", Buffer.from("GGUF-synthetic-projector")],
    ["LICENSE.txt", "license", "licenses/LICENSE.txt", Buffer.from("synthetic-license-fixture")],
  ];
  const artifacts = specifications.map(([id, kind, relative, data]) => {
    bytes.set(`https://example.test/${id}`, data);
    return { id, kind, sourceName: id, relative, bytes: data.length, sha256: sha256(data), url: `https://example.test/${id}` };
  });
  return { lock: { schemaVersion: 1, bundleId: "test-bundle", artifacts,
    runtimeFiles: runtime.map((entry) => ({ relative: entry.name, bytes: Buffer.byteLength(entry.data), sha256: sha256(Buffer.from(entry.data)) })),
    model: { id: "synthetic", modelFile: "models/model.gguf", projectorFile: "models/projector.gguf" },
    runtime: { version: "synthetic", serverFile: "runtime/llama-server.exe" } }, bytes,
    fetch: async (url) => { const data = bytes.get(String(url)); assert.ok(data, "No unpinned download"); return new Response(data); } };
}
export async function waitJob(service, job, ownerId = "felix") {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = service.get(job.jobId, ownerId);
    if (["completed", "cancelled", "failed", "stale"].includes(result.status)) return result;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("Synthetic local AI job did not finish");
}
export const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=", "base64");
