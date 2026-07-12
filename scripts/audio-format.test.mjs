import test from "node:test";
import assert from "node:assert/strict";
import {
  audioFormatLabel,
  detectAudioFormat,
  inspectMp3Buffer,
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
