import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { resolveFfmpegPath } from "./spectrogram-renderer.mjs";
import { validateImageDecode } from "./image-validation.mjs";
import { inspectJpeg, inspectPng, inspectWebp } from "./validate-media-assets.mjs";
import { createTestJpeg, createTestPng, createTestWebp } from "../species-explorer/server-test-fixtures.mjs";

test("Bildprüfung decodiert echte JPEG-, PNG- und WebP-Pixel und kann unveränderte Bytes erneut prüfen", async () => {
  for (const [buffer, inspector] of [[createTestJpeg(640, 480), inspectJpeg],
    [createTestPng(800, 1000), inspectPng], [createTestWebp(3), inspectWebp]]) {
    const meta = inspector(buffer);
    assert.equal(meta.valid, true);
    assert.deepEqual(await validateImageDecode(buffer, meta), { width: meta.width, height: meta.height });
    assert.deepEqual(await validateImageDecode(Buffer.from(buffer), meta), { width: meta.width, height: meta.height });
  }
});

test("Kopfdatei, abgeschnittenes Bild, HTML und beschädigte komprimierte Daten sind keine gültigen Pixel", async () => {
  const jpeg = createTestJpeg(640, 480), png = createTestPng(800, 1000), webp = createTestWebp(3);
  const headerOnly = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 1, 224, 2, 128, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0, 0xff, 0xd9]);
  const entropyBroken = Buffer.concat([jpeg.subarray(0, jpeg.indexOf(Buffer.from([0xff, 0xda])) + 14), Buffer.from([0xff, 0xd9])]);
  for (const buffer of [headerOnly, jpeg.subarray(0, -10), entropyBroken]) {
    await assert.rejects(validateImageDecode(buffer, { format: "jpeg" }), /JPEG|Bilddatei/);
  }
  await assert.rejects(validateImageDecode(png.subarray(0, 33), { format: "png" }), /PNG/);
  await assert.rejects(validateImageDecode(webp.subarray(0, -1), { format: "webp" }), /WebP/);
  const corruptWebp = Buffer.from(webp); corruptWebp.fill(0xff, 20, 23);
  await assert.rejects(validateImageDecode(corruptWebp, { format: "webp" }), /Bilddatei/);
  const corruptPng = Buffer.from(png), idat = corruptPng.indexOf(Buffer.from("IDAT"));
  corruptPng[idat + 4] ^= 0xff;
  await assert.rejects(validateImageDecode(corruptPng, { format: "png" }), /Bilddatei/);
  await assert.rejects(validateImageDecode(Buffer.from("<html>403</html>"), { format: "jpeg" }), /JPEG/);
});

test("Prüfgrenzen und fehlender Decoder stoppen nachvollziehbar, ohne gültigen Cache fremden Bytes zuzuordnen", async () => {
  const jpeg = createTestJpeg(640, 480);
  const hugeHeader = Buffer.from(jpeg), sof = hugeHeader.indexOf(Buffer.from([0xff, 0xc0]));
  hugeHeader.writeUInt16BE(65000, sof + 5); hugeHeader.writeUInt16BE(65000, sof + 7);
  await assert.rejects(validateImageDecode(hugeHeader, { format: "jpeg", width: 1, height: 1 }), /40 Millionen/);
  await assert.rejects(validateImageDecode(jpeg, { format: "jpeg",
    ffmpegPath: "fn-image-audit-missing-decoder" }), /FFmpeg/);
});

test("Decoder erhält eigene Pixelgrenze auch bei widersprüchlichen mehreren JPEG-Bildköpfen", async () => {
  const jpeg = createTestJpeg(645, 480), sof = jpeg.indexOf(Buffer.from([0xff, 0xc0]));
  const segment = Buffer.from(jpeg.subarray(sof, sof + 19));
  segment.writeUInt16BE(65000, 5); segment.writeUInt16BE(65000, 7);
  const multiple = Buffer.concat([jpeg.subarray(0, sof + 19), segment, jpeg.subarray(sof + 19)]);
  let sawPixels = false;
  await assert.rejects(validateImageDecode(multiple, { format: "jpeg", ffmpegPath: "real-oversized-decode",
    spawnProcess(command, args, options) {
      sawPixels = args.includes("-max_pixels") && args[args.indexOf("-max_pixels") + 1] === "40000000";
      return spawn(resolveFfmpegPath(), args, options);
    } }), /Bilddatei/);
  assert.equal(sawPixels, true);
});

test("Decoderzeitlimit beendet nur eigenen Leser, wartet auf close und blockiert den Eventloop nicht", async () => {
  let child, closed = false, responsive = false;
  const validating = validateImageDecode(createTestJpeg(643, 480), { format: "jpeg", ffmpegPath: "isolated-hanging-decoder",
    timeoutMs: 150, spawnProcess() {
      child = spawn(process.execPath, ["-e", "process.stdin.resume();setInterval(()=>{},1000)"],
        { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      child.once("close", () => { closed = true; }); return child;
    } });
  setTimeout(() => { responsive = true; }, 10);
  await assert.rejects(validating, /Bilddatei/);
  assert.equal(responsive, true); assert.equal(closed, true); assert.notEqual(child.exitCode, 0);
});

test("Übermäßige Decoder-Ausgabe beendet eigenen Prozess vor dem Freigeben der Bildprüfung", async () => {
  let closed = false;
  await assert.rejects(validateImageDecode(createTestJpeg(648, 480), { format: "jpeg", ffmpegPath: "isolated-noisy-decoder",
    spawnProcess() {
      const child = spawn(process.execPath, ["-e", "process.stdin.resume();process.stdout.write('x'.repeat(150000));setInterval(()=>{},1000)"],
        { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      child.once("close", () => { closed = true; }); return child;
    },
  }), /Bilddatei/);
  assert.equal(closed, true);
});
