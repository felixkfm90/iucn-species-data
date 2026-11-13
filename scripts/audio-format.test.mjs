import test from "node:test";
import assert from "node:assert/strict";
import {
  audioFormatLabel,
  detectAudioFormat,
  inspectMp3Buffer,
  inspectCompleteMp3Buffer,
  isMp3Buffer,
  isWavBuffer,
} from "./audio-format.mjs";

function mpegFrameBuffer(prefix = Buffer.alloc(0)) {
  const frameLength = 417;
  const frame = Buffer.alloc(frameLength);
  Buffer.from([0xff, 0xfb, 0x90, 0x64]).copy(frame, 0);
  return Buffer.concat([prefix, frame, frame, frame]);
}

test("erkennt einen MPEG-Audioframe als MP3", () => {
  const buffer = mpegFrameBuffer();
  assert.equal(detectAudioFormat(buffer), "mp3");
  assert.equal(isMp3Buffer(buffer), true);
  assert.equal(inspectMp3Buffer(buffer).frameOffset, 0);
});

test("überspringt einen gültigen ID3v2-Kopf", () => {
  const id3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04]);
  const buffer = mpegFrameBuffer(Buffer.concat([id3, Buffer.alloc(4)]));
  const inspection = inspectMp3Buffer(buffer);
  assert.equal(inspection.signature, "ID3 + MPEG frames");
  assert.equal(inspection.frameOffset, 14);
  assert.equal(inspection.verifiedFrames, 3);
});

test("erkennt WAV unabhängig von einer möglichen Dateiendung", () => {
  const buffer = Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.alloc(4),
    Buffer.from("WAVEfmt ", "ascii"),
    Buffer.alloc(64),
  ]);
  assert.equal(isWavBuffer(buffer), true);
  assert.equal(isMp3Buffer(buffer), false);
  assert.equal(detectAudioFormat(buffer), "wav");
  assert.equal(audioFormatLabel("wav"), "WAV/PCM");
  assert.throws(() => inspectMp3Buffer(buffer), /MPEG-Audioframe/);
});

test("weist beschädigte oder unbekannte Dateien zurück", () => {
  const malformedId3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00]);
  assert.equal(detectAudioFormat(Buffer.from("kein audio")), "unknown");
  assert.equal(isMp3Buffer(malformedId3), false);
  assert.throws(() => inspectMp3Buffer(malformedId3), /ID3-Kopf/);
});

function variableFrame(index = 9, padding = 0) {
  const rates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const frame = Buffer.alloc(Math.floor(144 * rates[index] * 1000 / 44100) + padding);
  Buffer.from([0xff, 0xfb, index << 4 | padding << 1, 0x64]).copy(frame);
  return frame;
}
function syncSize(value) { return Buffer.from([value >>> 21 & 0x7f, value >>> 14 & 0x7f, value >>> 7 & 0x7f, value & 0x7f]); }
function id3v2Tag({ major = 4, footer = false, payload = Buffer.alloc(4) } = {}) {
  const head = Buffer.alloc(10); head.write("ID3", "ascii"); head[3] = major; head[5] = footer ? 0x10 : 0; syncSize(payload.length).copy(head, 6);
  const tail = Buffer.from(head); tail.write("3DI", "ascii");
  return Buffer.concat([head, payload, ...(footer ? [tail] : [])]);
}
function id3v1Tag() { const tag = Buffer.alloc(128); tag.write("TAG", "ascii"); return tag; }
function apeTag({ version = 2000, header = false, items = [{ key: "Title", value: Buffer.from("Testaufnahme"), flags: 0 }] } = {}) {
  const payload = Buffer.concat(items.map(item => {
    const head = Buffer.alloc(8); head.writeUInt32LE(item.value.length); head.writeUInt32LE(item.flags ?? 0, 4);
    return Buffer.concat([head, Buffer.from(item.key, "ascii"), Buffer.from([0]), item.value]);
  }));
  const footer = Buffer.alloc(32); footer.write("APETAGEX", "ascii"); footer.writeUInt32LE(version, 8);
  footer.writeUInt32LE(payload.length + 32, 12); footer.writeUInt32LE(items.length, 16); footer.writeUInt32LE(header ? 0x80000000 : 0, 20);
  const prefix = Buffer.from(footer); prefix.writeUInt32LE(0xa0000000, 20);
  return Buffer.concat([...(header ? [prefix] : []), payload, footer]);
}

test("complete MP3 inspection checks every frame without changing the old three-frame detector", () => {
  const bytes = Buffer.concat([variableFrame(), variableFrame(), variableFrame(), variableFrame()]), before = Buffer.from(bytes);
  assert.equal(inspectMp3Buffer(bytes).verifiedFrames, 3);
  assert.deepEqual(inspectCompleteMp3Buffer(bytes), { format: "mp3", signature: "MPEG frames", frameOffset: 0,
    verifiedFrames: 4, sampleRate: 44100, bitrateKbps: 128, audioEnd: bytes.length, leadingTagBytes: 0, trailingTagBytes: 0 });
  assert.deepEqual(bytes, before);
});

test("variable bitrates, frame padding and embedded Xing Info and LAME data preserve full frame boundaries", () => {
  const frames = [variableFrame(9), variableFrame(10, 1), variableFrame(11), variableFrame(14), variableFrame(9)];
  frames[0].write("Xing", 36, "ascii"); frames[0].write("LAME3.100", 120, "ascii"); frames[1].write("Info", 36, "ascii");
  const bytes = Buffer.concat(frames), before = Buffer.from(bytes), result = inspectCompleteMp3Buffer(bytes);
  assert.equal(result.verifiedFrames, 5); assert.equal(result.audioEnd, bytes.length); assert.deepEqual(bytes, before);
});

test("a plausible beginning cannot hide a partial final frame, unknown suffix or gap before later valid frames", () => {
  const frames = Array.from({ length: 5 }, () => variableFrame()), complete = Buffer.concat(frames);
  for (const broken of [complete.subarray(0, -1), complete.subarray(0, -50), Buffer.concat([complete, Buffer.from("unknown tail")]),
    Buffer.concat([frames[0], frames[1], frames[2], Buffer.from([1, 2, 3]), frames[3], frames[4]])]) {
    assert.equal(inspectMp3Buffer(broken).verifiedFrames, 3);
    assert.throws(() => inspectCompleteMp3Buffer(broken));
  }
});

test("exact ID3v2 leading and trailing tags and fixed ID3v1 enhanced tails remain valid metadata", () => {
  const audio = mpegFrameBuffer(), enhanced = Buffer.alloc(227); enhanced.write("TAG+", "ascii");
  for (const head of [id3v2Tag({ major: 2 }), id3v2Tag({ major: 3 }), id3v2Tag({ footer: true })]) {
    for (const tail of [id3v1Tag(), Buffer.concat([enhanced, id3v1Tag()]), id3v2Tag(), id3v2Tag({ footer: true }),
      Buffer.concat([id3v2Tag({ footer: true }), id3v1Tag()])]) {
      const bytes = Buffer.concat([head, audio, tail]), before = Buffer.from(bytes), result = inspectCompleteMp3Buffer(bytes);
      assert.equal(result.frameOffset, head.length); assert.equal(result.audioEnd, head.length + audio.length);
      assert.equal(result.trailingTagBytes, tail.length); assert.deepEqual(bytes, before);
    }
  }
});

test("valid interleaved ID3 tags remain inside the proved audio span without skipping a frame", () => {
  const frames = [variableFrame(), variableFrame(10), variableFrame(11), variableFrame()], middle = id3v2Tag({ major: 3 });
  const leading = id3v2Tag(), trailing = id3v1Tag(), span = Buffer.concat([frames[0], middle, ...frames.slice(1)]);
  const bytes = Buffer.concat([leading, span, trailing]), result = inspectCompleteMp3Buffer(bytes);
  assert.equal(result.verifiedFrames, 4); assert.deepEqual(bytes.subarray(result.frameOffset, result.audioEnd), span);
});

test("truncated or forged ID3 sizes, flags and footers cannot turn damaged audio into an accepted tag", () => {
  const audio = Buffer.concat([mpegFrameBuffer(), variableFrame()]);
  const badFooter = id3v2Tag({ footer: true }); badFooter[badFooter.length - 1] ^= 1;
  const badSize = id3v2Tag(); badSize[6] = 0x80;
  const badFlags = id3v2Tag({ major: 3 }); badFlags[5] = 0x10;
  for (const tail of [Buffer.from("ID3"), id3v1Tag().subarray(0, -1), id3v2Tag().subarray(0, -1), badFooter, badSize, badFlags]) {
    assert.throws(() => inspectCompleteMp3Buffer(Buffer.concat([audio, tail])));
  }
  for (const tail of [id3v1Tag(), id3v2Tag({ footer: true })]) {
    assert.throws(() => inspectCompleteMp3Buffer(Buffer.concat([audio.subarray(0, -50), tail])));
  }
});

test("APEv1 and APEv2 footer or header-footer tags preserve opaque artwork and validated locator bytes", () => {
  const audio = mpegFrameBuffer();
  const variants = [apeTag({ version: 1000 }), apeTag(), apeTag({ header: true }),
    apeTag({ header: true, items: [{ key: "Cover Art (Front)", value: Buffer.from([0, 255, 0, 128]), flags: 2 },
      { key: "External Link", value: Buffer.from("https://example.org/not-fetched"), flags: 4 }] })];
  for (const tail of variants) for (const final of [Buffer.alloc(0), id3v1Tag()]) {
    const bytes = Buffer.concat([audio, tail, final]), before = Buffer.from(bytes), result = inspectCompleteMp3Buffer(bytes);
    assert.equal(result.audioEnd, audio.length); assert.equal(result.trailingTagBytes, tail.length + final.length); assert.deepEqual(bytes, before);
  }
});

test("APE footer, optional header and exact item boundaries are checked before metadata can cover any audio bytes", () => {
  const audio = Buffer.concat([mpegFrameBuffer(), variableFrame()]);
  const mutations = [
    (tag, footer) => { tag[footer + 24] = 1; },
    (tag, footer) => { tag.writeUInt32LE(0xa0000000, footer + 20); },
    (tag, footer) => { tag.writeUInt32LE(0xc0000000, footer + 20); },
    (tag, footer) => { tag.writeUInt32LE(0x80000008, footer + 20); },
    (tag, footer) => { tag.writeUInt32LE(31, footer + 12); },
    (tag, footer) => { tag.writeUInt32LE(tag.length + audio.length + 1, footer + 12); },
    (tag, footer) => { tag.writeUInt32LE(2, footer + 16); },
    tag => { tag[24] = 1; }, tag => { tag.writeUInt32LE(0x80000000, 20); },
    tag => { tag.writeUInt32LE(1000000, 32); }, tag => { tag[32 + 8 + "Title".length] = 1; },
  ];
  for (const mutate of mutations) {
    const tag = apeTag({ header: true }); mutate(tag, tag.length - 32);
    assert.throws(() => inspectCompleteMp3Buffer(Buffer.concat([audio, tag])));
  }
  const duplicates = apeTag({ items: [{ key: "Title", value: Buffer.from("A") }, { key: "TITLE", value: Buffer.from("B") }] });
  assert.throws(() => inspectCompleteMp3Buffer(Buffer.concat([audio, duplicates])));
  assert.throws(() => inspectCompleteMp3Buffer(Buffer.concat([audio.subarray(0, -50), apeTag({ header: true })])));
});

test("unsupported APE versions or leading placement are distinguished from a truncated MPEG stream", () => {
  const audio = mpegFrameBuffer();
  const unsupported = apeTag(); unsupported.writeUInt32LE(3000, unsupported.length - 24);
  assert.throws(() => inspectCompleteMp3Buffer(Buffer.concat([audio, unsupported])), error => error.code === "unsupported_audio_tag");
  assert.throws(() => inspectCompleteMp3Buffer(Buffer.concat([apeTag({ header: true }), audio])), error => error.code === "unsupported_audio_tag");
});
