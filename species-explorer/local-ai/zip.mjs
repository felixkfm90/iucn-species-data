import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { createInflateRaw } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { aiError, childPath, noLinks, safeRelative, verifyFile } from "./files.mjs";

const table = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function crc32(bytes, previous = 0) {
  let crc = previous ^ 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
async function readAt(file, length, position) {
  const buffer = Buffer.alloc(length), result = await file.read(buffer, 0, length, position);
  if (result.bytesRead !== length) throw aiError("Unvollständiges KI-Laufzeitarchiv.");
  return buffer;
}

export async function inspectPinnedRuntimeArchive(archive, pins, { signal, maxBytes = 300 * 1024 * 1024 } = {}) {
  await noLinks(archive);
  if (!Array.isArray(pins) || !pins.length || pins.length > 512) throw aiError("Ungültige Laufzeitdateiliste.");
  const expected = new Map(pins.map((entry) => [safeRelative(entry.relative).toLowerCase(), entry]));
  if (expected.size !== pins.length) throw aiError("Doppelte Laufzeitdatei.");
  const file = await fs.open(archive, "r"), entries = [];
  try {
    const size = (await file.stat()).size;
    if (size < 22 || size > 80 * 1024 * 1024) throw aiError("Ungültige KI-Archivgröße.");
    const tailSize = Math.min(size, 65_557), tail = await readAt(file, tailSize, size - tailSize);
    let eocd = -1;
    for (let index = tail.length - 22; index >= 0; index -= 1) if (tail.readUInt32LE(index) === 0x06054b50
      && index + 22 + tail.readUInt16LE(index + 20) === tail.length) { eocd = index; break; }
    if (eocd < 0 || tail.readUInt16LE(eocd + 4) || tail.readUInt16LE(eocd + 6)) throw aiError("Mehrteiliges oder ungültiges KI-Archiv.");
    const count = tail.readUInt16LE(eocd + 10), directoryBytes = tail.readUInt32LE(eocd + 12), directoryOffset = tail.readUInt32LE(eocd + 16);
    if (count === 0xffff || count > 1024 || count !== tail.readUInt16LE(eocd + 8) || directoryBytes > 4 * 1024 * 1024
      || directoryOffset + directoryBytes > size - tailSize + eocd) throw aiError("Nicht unterstützte oder zu große KI-Archivstruktur.");
    const directory = await readAt(file, directoryBytes, directoryOffset), seen = new Set();
    let cursor = 0, total = 0;
    for (let index = 0; index < count; index += 1) {
      signal?.throwIfAborted();
      if (cursor + 46 > directory.length || directory.readUInt32LE(cursor) !== 0x02014b50) throw aiError("Ungültiges KI-Archivverzeichnis.");
      const flags = directory.readUInt16LE(cursor + 8), method = directory.readUInt16LE(cursor + 10);
      const crc = directory.readUInt32LE(cursor + 16), compressed = directory.readUInt32LE(cursor + 20), bytes = directory.readUInt32LE(cursor + 24);
      const nameBytes = directory.readUInt16LE(cursor + 28), extraBytes = directory.readUInt16LE(cursor + 30), commentBytes = directory.readUInt16LE(cursor + 32);
      const attributes = directory.readUInt32LE(cursor + 38), offset = directory.readUInt32LE(cursor + 42);
      if (cursor + 46 + nameBytes + extraBytes + commentBytes > directory.length || flags & 1 || ![0, 8].includes(method)
        || ((attributes >>> 16) & 0xf000) === 0xa000 || (attributes & 0x400)) throw aiError("Unsichere KI-Archiveigenschaft.");
      const rawName = directory.subarray(cursor + 46, cursor + 46 + nameBytes);
      if (!(flags & 0x800) && rawName.some((byte) => byte > 127)) throw aiError("Mehrdeutiger KI-Archivdateiname.");
      const name = new TextDecoder("utf-8", { fatal: true }).decode(rawName);
      cursor += 46 + nameBytes + extraBytes + commentBytes;
      if (name.endsWith("/")) { safeRelative(name.slice(0, -1)); continue; }
      safeRelative(name);
      const pin = expected.get(name.toLowerCase());
      if (!pin || pin.relative !== name || seen.has(name.toLowerCase()) || bytes !== pin.bytes || bytes > 80 * 1024 * 1024
        || offset + compressed >= directoryOffset || compressed === 0xffffffff || bytes === 0xffffffff) throw aiError("Ungebundene, doppelte oder zu große KI-Laufzeitdatei.");
      total += bytes;
      if (total > maxBytes) throw aiError("Entpackte KI-Laufzeit überschreitet die Größe.");
      const local = await readAt(file, 30, offset);
      if (local.readUInt32LE(0) !== 0x04034b50 || local.readUInt16LE(6) !== flags || local.readUInt16LE(8) !== method) throw aiError("Widersprüchlicher KI-Archiveintrag.");
      const localNameBytes = local.readUInt16LE(26), localExtraBytes = local.readUInt16LE(28);
      if (!(await readAt(file, localNameBytes, offset + 30)).equals(rawName)) throw aiError("Widersprüchlicher KI-Archivdateiname.");
      const start = offset + 30 + localNameBytes + localExtraBytes;
      if (start + compressed > directoryOffset) throw aiError("Überlappender KI-Archiveintrag.");
      entries.push({ pin, start, compressed, bytes, method, crc }); seen.add(name.toLowerCase());
    }
    if (cursor !== directory.length || seen.size !== expected.size) throw aiError("Die KI-Laufzeit ist nicht vollständig.");
  } finally { await file.close(); }
  return entries;
}

export async function extractPinnedRuntime(archive, destination, pins, options = {}) {
  const { signal } = options;
  await noLinks(destination);
  const entries = await inspectPinnedRuntimeArchive(archive, pins, options);
  await fs.mkdir(destination, { recursive: true });
  for (const entry of entries) {
    signal?.throwIfAborted();
    const target = childPath(destination, entry.pin.relative);
    await noLinks(target); await fs.mkdir(path.dirname(target), { recursive: true });
    let bytes = 0, crc = 0;
    async function* verify(chunks) {
      for await (const chunk of chunks) {
        signal?.throwIfAborted(); bytes += chunk.length;
        if (bytes > entry.bytes) throw aiError("Entpackte KI-Datei überschreitet die Größe.");
        crc = crc32(chunk, crc); yield chunk;
      }
    }
    const input = entry.compressed ? createReadStream(archive, { start: entry.start, end: entry.start + entry.compressed - 1 }) : [];
    const output = createWriteStream(target, { flags: "wx" });
    try {
      if (entry.method === 8) await pipeline(input, createInflateRaw(), verify, output, { signal });
      else await pipeline(input, verify, output, { signal });
      if (bytes !== entry.bytes || crc !== entry.crc) throw aiError("Die KI-Laufzeitdatei ist beschädigt.");
      await verifyFile(target, entry.pin, { signal });
    } catch (error) { await fs.rm(target, { force: true }); throw error; }
  }
  return { files: entries.length, bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) };
}
