import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

// Compare the actual PNG/BMP bytes embedded in the Windows executable with
// every accepted ICO image. No shell icon cache or desktop UI is involved.
export async function verifyWindowsIcon(executable, icoPath) {
  const bytes = await fs.readFile(executable), ico = await fs.readFile(icoPath);
  assert.equal(bytes.toString("ascii", 0, 2), "MZ");
  const pe = bytes.readUInt32LE(0x3c);
  assert.equal(bytes.toString("ascii", pe, pe + 4), "PE\0\0");
  const optional = pe + 24, magic = bytes.readUInt16LE(optional);
  assert.ok(magic === 0x20b || magic === 0x10b);
  const resourceRva = bytes.readUInt32LE(optional + (magic === 0x20b ? 112 : 96) + 16);
  const sectionStart = optional + bytes.readUInt16LE(pe + 20), sectionCount = bytes.readUInt16LE(pe + 6);
  function rvaOffset(rva) {
    for (let index = 0; index < sectionCount; index += 1) {
      const section = sectionStart + index * 40, address = bytes.readUInt32LE(section + 12);
      const length = Math.max(bytes.readUInt32LE(section + 8), bytes.readUInt32LE(section + 16));
      if (rva >= address && rva < address + length) return bytes.readUInt32LE(section + 20) + rva - address;
    }
    throw new Error("PE resource outside known sections.");
  }
  const resourceRoot = rvaOffset(resourceRva), actual = [];
  function walk(offset, depth = 0, type = null) {
    assert.ok(depth <= 4, "Resource directory recursion limit");
    const directory = resourceRoot + offset;
    const count = bytes.readUInt16LE(directory + 12) + bytes.readUInt16LE(directory + 14);
    for (let index = 0; index < count; index += 1) {
      const entry = directory + 16 + index * 8, id = bytes.readUInt32LE(entry), value = bytes.readUInt32LE(entry + 4);
      const entryType = depth === 0 ? id : type;
      if (entryType !== 3) continue;
      if (value & 0x80000000) walk(value & 0x7fffffff, depth + 1, entryType);
      else {
        const data = resourceRoot + value, start = rvaOffset(bytes.readUInt32LE(data)), size = bytes.readUInt32LE(data + 4);
        assert.ok(start + size <= bytes.length);
        actual.push(hash(bytes.subarray(start, start + size)));
      }
    }
  }
  walk(0);
  assert.equal(ico.readUInt16LE(2), 1);
  const count = ico.readUInt16LE(4), expected = [];
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16, length = ico.readUInt32LE(entry + 8), start = ico.readUInt32LE(entry + 12);
    expected.push(hash(ico.subarray(start, start + length)));
  }
  assert.ok(expected.every((digest) => actual.includes(digest)), "Executable icon differs from the accepted Arten-Explorer ICO");
  return { executable, icoPath, expectedImages: count, iconResources: actual.length, everyImageByteIdentical: true };
}
