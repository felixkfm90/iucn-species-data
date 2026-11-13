import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { EventEmitter, getEventListeners } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { tmpdir, assertTestTempPath } from "./test-temp.mjs";
import { inspectMp3Buffer, inspectCompleteMp3Buffer } from "./audio-format.mjs";
import { resolveFfmpegPath } from "./spectrogram-renderer.mjs";
import { AUDIO_DECODE_LIMITS, validateAudioDecode } from "./audio-validation.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const children = new Set();
let fixtureRoot, mp3;
function trackedSpawn(command, args, options) {
  const child = spawn(command, args, options); children.add(child);
  child.once("close", () => children.delete(child)); return child;
}
function nodeDecoder(code, onClose = () => {}) {
  return () => {
    const child = trackedSpawn(process.execPath, ["-e", code], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    child.once("close", onClose); return child;
  };
}

before(async () => {
  fixtureRoot = await fs.mkdtemp(path.join(tmpdir(), "audio-decode-"));
  const filename = path.join(fixtureRoot, "synthetic-original.mp3");
  // This is an actual short encoded MP3, not three fabricated MPEG headers.
  await promisify(execFile)(resolveFfmpegPath({ repoRoot }), ["-hide_banner", "-loglevel", "error", "-nostdin",
    "-threads", "1", "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=44100:duration=0.3",
    "-c:a", "libmp3lame", "-threads", "1", "-b:a", "128k", "-id3v2_version", "0", "-write_xing", "0", "-f", "mp3", filename],
  { windowsHide: true, timeout: 15000, killSignal: "SIGKILL", maxBuffer: 64 * 1024 });
  mp3 = await fs.readFile(filename); assert.equal(inspectMp3Buffer(mp3).format, "mp3");
});
after(async () => {
  const leaked = children.size;
  // A failing test must still join only the children that this file created.
  await Promise.all([...children].map(child => new Promise(resolve => { child.once("close", resolve); child.kill("SIGKILL"); })));
  if (fixtureRoot) await fs.rm(assertTestTempPath(fixtureRoot), { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
  assert.equal(leaked, 0, "Every decoder test must already have joined its child before finishing");
});

test("audio validator fully decodes a real synthetic MP3 and returns only exact immutable byte metadata", async () => {
  const before = Buffer.from(mp3); let closed = false;
  const actual = await validateAudioDecode(mp3, { repoRoot, spawnProcess(command, args, options) {
    const child = trackedSpawn(command, args, options); child.once("close", () => { closed = true; }); return child;
  } });
  assert.deepEqual(actual, { bytes: mp3.length, sha256: sha(before), mimeType: "audio/mpeg" });
  assert.equal(closed, true); assert.deepEqual(mp3, before);
  assert.deepEqual(await validateAudioDecode(Buffer.from(mp3), { repoRoot, spawnProcess: trackedSpawn }), actual);
});

test("complete decode rejects corrupted or truncated endings even when the first three frames are plausible", async () => {
  const truncated = mp3.subarray(0, mp3.length - 50), corrupt = Buffer.from(mp3);
  corrupt.fill(0xff, Math.floor(corrupt.length / 2), corrupt.length - 4);
  for (const bytes of [truncated, corrupt]) {
    assert.equal(inspectMp3Buffer(bytes).format, "mp3");
    await assert.rejects(validateAudioDecode(bytes, { repoRoot, spawnProcess: trackedSpawn }), error => error.code === "invalid_audio");
  }
});

function boundId3Tag({ footer = false } = {}) {
  const header = Buffer.from([0x49, 0x44, 0x33, 4, 0, footer ? 0x10 : 0, 0, 0, 0, 4]);
  const ending = Buffer.from(header); ending.write("3DI", "ascii");
  return Buffer.concat([header, Buffer.alloc(4), ...(footer ? [ending] : [])]);
}
function boundApeTag({ version = 2000, header = false } = {}) {
  const value = Buffer.from("Synthetische Aufnahme"), item = Buffer.alloc(8);
  item.writeUInt32LE(value.length);
  const payload = Buffer.concat([item, Buffer.from("Title\0", "ascii"), value]), footer = Buffer.alloc(32);
  footer.write("APETAGEX", "ascii"); footer.writeUInt32LE(version, 8); footer.writeUInt32LE(payload.length + 32, 12);
  footer.writeUInt32LE(1, 16); footer.writeUInt32LE(header ? 0x80000000 : 0, 20);
  const prefix = Buffer.from(footer); prefix.writeUInt32LE(0xa0000000, 20);
  return Buffer.concat([...(header ? [prefix] : []), payload, footer]);
}

test("actual ID3 and APE tagged MP3 decoding binds all unchanged original bytes and excludes only proved outer tags", async () => {
  const id3v1 = Buffer.alloc(128); id3v1.write("TAG", "ascii");
  const cases = [
    { head: boundId3Tag(), tail: id3v1 },
    { head: boundId3Tag({ footer: true }), tail: boundId3Tag({ footer: true }) },
    { head: Buffer.alloc(0), tail: boundApeTag({ version: 1000 }) },
    { head: Buffer.alloc(0), tail: boundApeTag() },
    { head: boundId3Tag(), tail: Buffer.concat([boundApeTag({ header: true }), id3v1]) },
  ];
  for (const { head, tail } of cases) {
    const bytes = Buffer.concat([head, mp3, tail]), before = Buffer.from(bytes); let decodedInput;
    const result = await validateAudioDecode(bytes, { repoRoot, spawnProcess(command, args, options) {
      const child = trackedSpawn(command, args, options), end = child.stdin.end.bind(child.stdin);
      child.stdin.end = (input, ...rest) => { decodedInput = Buffer.from(input); return end(input, ...rest); }; return child;
    } });
    assert.deepEqual(result, { bytes: bytes.length, sha256: sha(before), mimeType: "audio/mpeg" });
    assert.deepEqual(decodedInput, mp3); assert.deepEqual(bytes, before);
  }
});

test("a valid interleaved ID3 tag stays in decoder input between every unchanged MPEG frame", async () => {
  const first = inspectMp3Buffer(mp3), frameLength = Math.floor(144 * first.bitrateKbps * 1000 / first.sampleRate) + ((mp3[2] >>> 1) & 1);
  const middle = boundId3Tag(), span = Buffer.concat([mp3.subarray(0, frameLength), middle, mp3.subarray(frameLength)]);
  const head = boundId3Tag(), tail = boundApeTag({ header: true }), bytes = Buffer.concat([head, span, tail]), before = Buffer.from(bytes);
  const proof = inspectCompleteMp3Buffer(bytes); assert.deepEqual(bytes.subarray(proof.frameOffset, proof.audioEnd), span);
  let decodedInput;
  const result = await validateAudioDecode(bytes, { repoRoot, spawnProcess(command, args, options) {
    const child = trackedSpawn(command, args, options), end = child.stdin.end.bind(child.stdin);
    child.stdin.end = (input, ...rest) => { decodedInput = Buffer.from(input); return end(input, ...rest); }; return child;
  } });
  assert.equal(result.sha256, sha(before)); assert.equal(result.bytes, before.length);
  assert.deepEqual(decodedInput, span); assert.deepEqual(bytes, before);
});

test("a valid metadata tail cannot pad a partial last frame or conceal an unsupported tag version", async () => {
  for (const tail of [boundId3Tag({ footer: true }), boundApeTag({ header: true })]) {
    const bytes = Buffer.concat([mp3.subarray(0, -50), tail]); let spawned = false;
    await assert.rejects(validateAudioDecode(bytes, { repoRoot, spawnProcess() { spawned = true; throw new Error("Must not start"); } }), error => error.code === "invalid_audio");
    assert.equal(spawned, false);
  }
  const unsupported = boundApeTag(); unsupported.writeUInt32LE(3000, unsupported.length - 24);
  await assert.rejects(validateAudioDecode(Buffer.concat([mp3, unsupported]), { repoRoot }), error => error.code === "unsupported_audio_tag"
    && !/abgeschnitten/.test(error.message));
});

test("invalid MPEG data and the existing fifty-MiB admission limit stop before spawning", async () => {
  let spawned = false;
  const spawnProcess = () => { spawned = true; throw new Error("Must not start"); };
  for (const bytes of [Buffer.alloc(0), Buffer.from("<html>not audio</html>"), mp3.subarray(0, 30),
    Buffer.alloc(AUDIO_DECODE_LIMITS.bytes + 1)]) {
    await assert.rejects(validateAudioDecode(bytes, { repoRoot, spawnProcess }));
  }
  assert.equal(AUDIO_DECODE_LIMITS.bytes, 50 * 1024 * 1024); assert.equal(spawned, false);
});

test("pre-abort never starts a process and never exposes the caller's private abort reason", async () => {
  const controller = new AbortController(); controller.abort(new Error("C:\\private\\original.mp3?token=private-value"));
  let spawned = false;
  await assert.rejects(validateAudioDecode(mp3, { repoRoot, signal: controller.signal,
    spawnProcess() { spawned = true; throw new Error("Must not start"); } }), error => {
    assert.equal(error.code, "audio_decode_cancelled"); assert.doesNotMatch(error.message, /private|token|C:/); return true;
  });
  assert.equal(spawned, false);
});

test("timeout kills and joins the actual decoder child while the event loop stays responsive", async () => {
  let closed = false, responsive = false;
  const checking = validateAudioDecode(mp3, { repoRoot, timeoutMs: 150,
    spawnProcess: nodeDecoder("process.stdin.resume();setInterval(()=>{},1000)", () => { closed = true; }) });
  const responsiveness = setTimeout(() => { responsive = true; }, 10);
  try { await assert.rejects(checking, error => error.code === "audio_decode_timeout"); }
  finally { clearTimeout(responsiveness); }
  assert.equal(responsive, true); assert.equal(closed, true); assert.equal(children.size, 0);
});

test("an abort after spawn joins the owned child and removes its signal listener", async () => {
  const controller = new AbortController(); let closed = false;
  const checking = validateAudioDecode(mp3, { repoRoot, signal: controller.signal,
    spawnProcess: nodeDecoder("process.stdin.resume();setInterval(()=>{},1000)", () => { closed = true; }) });
  const cancellation = setTimeout(() => controller.abort(new Error("private-reason")), 25);
  try { await assert.rejects(checking, error => error.code === "audio_decode_cancelled" && !error.message.includes("private-reason")); }
  finally { clearTimeout(cancellation); }
  assert.equal(closed, true); assert.equal(children.size, 0);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  // A second abort or a later event must not act on an already released child.
  controller.abort();
});

test("combined stdout and stderr are bounded before their content can escape into a user error", async () => {
  let closed = false;
  await assert.rejects(validateAudioDecode(mp3, { repoRoot,
    spawnProcess: nodeDecoder("process.stdin.resume();process.stdout.write('x'.repeat(40000));process.stderr.write('y'.repeat(40000));setInterval(()=>{},1000)",
      () => { closed = true; }) }), error => error.code === "audio_decode_output_limit" && error.message.length < 300);
  assert.equal(closed, true); assert.equal(children.size, 0);
});

test("process failure and missing FFmpeg produce bounded messages without diagnostic paths or credentials", async () => {
  let missingClosed = false;
  await assert.rejects(validateAudioDecode(mp3, { repoRoot, spawnProcess(_command, args, options) {
    const child = trackedSpawn(path.join(fixtureRoot, "missing-private-decoder"), args, options);
    child.once("close", () => { missingClosed = true; }); return child;
  } }), error => error.code === "audio_decoder_unavailable" && !error.message.includes(fixtureRoot));
  assert.equal(missingClosed, true);
  await assert.rejects(validateAudioDecode(mp3, { repoRoot,
    spawnProcess: nodeDecoder("process.stdin.resume();process.stdin.on('end',()=>{process.stderr.write('C:\\\\private\\\\tool.exe?token=private-value');process.exitCode=1})") }), error => {
    assert.equal(error.code, "invalid_audio"); assert.doesNotMatch(error.message, /private|token|tool.exe/); return true;
  });
  await assert.rejects(validateAudioDecode(mp3, { repoRoot, spawnProcess() {
    throw Object.assign(new Error("private path"), { code: "ENOENT" });
  } }), error => error.code === "audio_decoder_unavailable" && !error.message.includes("private"));
  assert.equal(children.size, 0);
});

test("exit alone and a completed progress line cannot release the operation before close", async () => {
  let closeChild, exited = false, settled = false, input = Buffer.alloc(0), actualArgs, actualCommand, actualOptions;
  const controller = new AbortController();
  // Deliberately fake only the child-event protocol. MP3 validity is covered by
  // the actual FFmpeg tests above; this fixture controls the exit/close boundary.
  const checking = validateAudioDecode(mp3, { repoRoot, signal: controller.signal, spawnProcess(command, args, options) {
    actualCommand = command; actualArgs = args; actualOptions = options;
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.stdin = new Writable({ write(chunk, _encoding, done) { input = Buffer.concat([input, chunk]); done(); },
      final(done) { child.stdout.end("out_time_us=300000\nprogress=end\n"); queueMicrotask(() => { exited = true; child.emit("exit", 0); }); done(); } });
    closeChild = () => { child.stderr.end(); child.emit("close", 0); };
    child.kill = () => { closeChild(); return true; }; return child;
  } }).then(value => { settled = true; return value; });
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(exited, true); assert.equal(settled, false); assert.deepEqual(input, mp3);
    assert.equal(actualCommand, resolveFfmpegPath({ repoRoot }));
    assert.deepEqual(actualOptions, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    assert.equal(actualArgs.includes("-t"), false); assert.equal(actualArgs.some(arg => arg.startsWith("-frames")), false);
    assert.deepEqual(actualArgs.slice(-3), ["-f", "null", "-"]);
    assert.equal(actualArgs[actualArgs.indexOf("-i") + 1], "pipe:0");
    assert.equal(actualArgs[actualArgs.indexOf("-threads") + 1], "1");
  } finally { closeChild(); }
  assert.deepEqual(await checking, { bytes: mp3.length, sha256: sha(mp3), mimeType: "audio/mpeg" });
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("success requires positive fully finished audio output, not merely exit zero", async () => {
  for (const progress of ["", "out_time_us=300000\nprogress=continue\n", "out_time_us=0\nprogress=end\n", "progress=end\n"]) {
    const code = `process.stdin.resume();process.stdin.on('end',()=>{process.stdout.write(${JSON.stringify(progress)})})`;
    await assert.rejects(validateAudioDecode(mp3, { repoRoot, spawnProcess: nodeDecoder(code) }), error => error.code === "invalid_audio");
  }
});

test("option overrides cannot relax the hard fifteen-second deadline or use a relative program root", async () => {
  for (const options of [{ timeoutMs: 15001 }, { timeoutMs: Infinity }, { timeoutMs: 0 }, { timeoutMs: 1.5 }, { repoRoot: "relative" }]) {
    await assert.rejects(validateAudioDecode(mp3, { repoRoot, ...options }), error => error.code === "invalid_audio_validation_options");
  }
  assert.equal(AUDIO_DECODE_LIMITS.timeoutMs, 15000); assert.equal(AUDIO_DECODE_LIMITS.outputBytes, 64 * 1024);
});
