import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter, getEventListeners } from "node:events";
import { PassThrough } from "node:stream";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir, assertTestTempPath } from "./test-temp.mjs";
import { renderSpectrogram } from "./spectrogram-renderer.mjs";

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "spectrogram-lifecycle-"));
  t.after(async () => { assertTestTempPath(root); await fs.rm(root, { recursive: true, force: true }); });
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  let kills = 0, started;
  const ready = new Promise(resolve => { started = resolve; });
  child.kill = () => { kills++; return true; };
  return { child, ready, get kills() { return kills; },
    run(options) { return renderSpectrogram({ inputPath: path.join(root, "source.mp3"), outputPath: path.join(root, "spectrum.webp"),
      spawnProcess(_command, _args, config) { assert.equal(config.windowsHide, true); started(); return child; }, ...options }); } };
}

test("Spektrogrammabbruch wartet bis der eigene Kindprozess tatsächlich geschlossen ist", async t => {
  const f = await fixture(t), controller = new AbortController(); let finished = false;
  const operation = f.run({ signal: controller.signal }).finally(() => { finished = true; });
  const rejected = assert.rejects(operation, { code: "SPECTROGRAM_CANCELLED" });
  await f.ready; controller.abort();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.kills, 1); assert.equal(finished, false);
  f.child.emit("close", null); await rejected;
  assert.equal(finished, true);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("Spektrogrammfrist beendet nur den eigenen Prozess und wartet dessen close ab", async t => {
  const f = await fixture(t), operation = f.run({ timeoutMs: 10 });
  const rejected = assert.rejects(operation, { code: "SPECTROGRAM_TIMEOUT" });
  await f.ready;
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(f.kills, 1);
  f.child.emit("close", null); await rejected;
});

test("Fehlgeschlagener Spektrogrammstart wird erst nach Prozessabschluss quittiert", async t => {
  const f = await fixture(t); let finished = false;
  const operation = f.run({}).finally(() => { finished = true; });
  const rejected = assert.rejects(operation, { code: "SPECTROGRAM_GENERATION_FAILED" });
  await f.ready; f.child.emit("error", new Error("fixture executable unavailable"));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false);
  f.child.emit("close", -1); await rejected;
});

test("Spektrogrammfehlerausgabe bleibt auch bei sehr großer Kindprozessausgabe begrenzt", async t => {
  const f = await fixture(t), operation = f.run({});
  const rejected = assert.rejects(operation, error => error.code === "SPECTROGRAM_GENERATION_FAILED" && error.message.length < 66_000);
  await f.ready; f.child.stderr.write("x".repeat(200_000)); f.child.emit("close", 1); await rejected;
});

test("Bereits abgebrochener Spektrogrammauftrag startet keinen Kindprozess", async t => {
  const f = await fixture(t), controller = new AbortController(); controller.abort();
  await assert.rejects(f.run({ signal: controller.signal }), { code: "SPECTROGRAM_CANCELLED" });
  assert.equal(f.kills, 0);
});
