import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSoundSegmentFilter,
  normalizeSoundSegments,
  resolveFfprobePath,
} from "./sound-segment-editor.mjs";

test("normalisiert mehrere Soundabschnitte in der gewünschten Reihenfolge", () => {
  const result = normalizeSoundSegments([
    { start: 1.23449, end: 2.5 },
    { start: 8, end: 9.75 },
  ], 12);
  assert.deepEqual(result.segments, [
    { start: 1.234, end: 2.5, duration: 1.266 },
    { start: 8, end: 9.75, duration: 1.75 },
  ]);
  assert.equal(result.outputDuration, 3.016);
});

test("weist ungültige oder zu kurze Soundabschnitte zurück", () => {
  assert.throws(() => normalizeSoundSegments([], 10), /Mindestens ein/);
  assert.throws(
    () => normalizeSoundSegments([{ start: 4, end: 4.01 }], 10),
    /mindestens 0,05 Sekunden/,
  );
  assert.throws(
    () => normalizeSoundSegments([{ start: 1, end: 11 }], 10),
    /hinter der Sounddauer/,
  );
});

test("erzeugt einen FFmpeg-Filter für Einzel- und Mehrfachschnitt", () => {
  assert.equal(
    buildSoundSegmentFilter([{ start: 1, end: 2 }]),
    "[0:a]atrim=start=1:end=2,asetpts=PTS-STARTPTS[a0];[a0]anull[outa]",
  );
  assert.equal(
    buildSoundSegmentFilter([{ start: 1, end: 2 }, { start: 4, end: 5 }]),
    "[0:a]atrim=start=1:end=2,asetpts=PTS-STARTPTS[a0];[0:a]atrim=start=4:end=5,asetpts=PTS-STARTPTS[a1];[a0][a1]concat=n=2:v=0:a=1[outa]",
  );
});

test("ermittelt FFprobe neben einem expliziten FFmpeg-Pfad", () => {
  assert.equal(resolveFfprobePath("ffmpeg"), "ffprobe");
});
