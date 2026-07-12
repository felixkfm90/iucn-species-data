import assert from "node:assert/strict";
import test from "node:test";
import { inspectJpeg, inspectPng, inspectWebp } from "./validate-media-assets.mjs";

test("erkennt JPEG samt Abmessungen", () => {
  const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x58, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9]);
  assert.deepEqual(inspectJpeg(buffer), { valid: true, format: "jpeg", width: 600, height: 300 });
});

test("erkennt PNG samt Abmessungen", () => {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(128, 16);
  buffer.writeUInt32BE(64, 20);
  assert.deepEqual(inspectPng(buffer), { valid: true, format: "png", width: 128, height: 64 });
});

test("erkennt erweitertes WebP samt Abmessungen", () => {
  const buffer = Buffer.alloc(30);
  buffer.write("RIFF", 0, "ascii");
  buffer.write("WEBP", 8, "ascii");
  buffer.write("VP8X", 12, "ascii");
  buffer[24] = 0xff;
  buffer[25] = 0x01;
  buffer[27] = 0xff;
  assert.deepEqual(inspectWebp(buffer), { valid: true, format: "webp", width: 512, height: 256 });
});

test("weist falsche Dateiinhalte zurück", () => {
  const fake = Buffer.from("keine Bilddatei");
  assert.equal(inspectJpeg(fake).valid, false);
  assert.equal(inspectPng(fake).valid, false);
  assert.equal(inspectWebp(fake).valid, false);
});
