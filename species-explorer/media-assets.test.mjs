import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectJpeg,
  inspectMp3,
  inspectPng,
  inspectWebp,
  validateMapPreviewPayload,
  validatePortraitPreviewPayload,
  validateSoundPreviewPayload,
  fetchMapPreviewSource,
} from "./media-assets.mjs";
import {
  createTestJpeg,
  createTestMp3,
  createTestPng,
  createTestWebp,
} from "./server-test-fixtures.mjs";

const species = {
  germanName: "Amsel",
  scientificName: "Turdus merula",
};

test("Karteneditor behält den Windows-Fallback nach IUCN-403", async () => {
  let fallbackCalls = 0;
  await assert.rejects(fetchMapPreviewSource("https://www.iucnredlist.org/api/v4/assessments/132000123/distribution_map/jpg", {
    validateUrl: async (value) => new URL(value),
    fetchImpl: async () => ({ ok: false, status: 403 }),
    powerShell: async () => { fallbackCalls += 1; },
  }), /HTTP 403/);
  assert.equal(fallbackCalls, 1);
});

test("Freigegebene Kartenantwort wird nach geprüfter Weiterleitung übernommen", async () => {
  const jpeg = createTestJpeg(640, 480), checked = [];
  let calls = 0;
  const buffer = await fetchMapPreviewSource("https://maps.example/start", {
    validateUrl: async (value) => { checked.push(String(value)); return new URL(value); },
    fetchImpl: async () => ++calls === 1
      ? { status: 302, headers: new Headers({ location: "https://maps.example/map.jpg" }) }
      : { ok: true, status: 200, headers: new Headers(), arrayBuffer: async () => jpeg },
    powerShell: async () => { throw new Error("Kein Fallback erforderlich"); },
  });
  assert.deepEqual(buffer, jpeg);
  assert.deepEqual(checked, ["https://maps.example/start", "https://maps.example/map.jpg"]);
});

test("Medieninspektoren erkennen JPEG, PNG, MP3 und WebP", () => {
  assert.deepEqual(inspectJpeg(createTestJpeg(640, 480)), { width: 640, height: 480 });
  assert.deepEqual(inspectPng(createTestPng(1120, 1400)), { width: 1120, height: 1400 });
  assert.ok(inspectMp3(createTestMp3(4)).frameOffset >= 0);
  assert.deepEqual(inspectWebp(createTestWebp(5)), { signature: "RIFF/WEBP" });
});

test("Portraitvorschau verlangt ein ausreichend großes 4:5-Bild", () => {
  const valid = validatePortraitPreviewPayload({
    originalName: "portrait.png",
    imageBase64: createTestPng(1120, 1400).toString("base64"),
    additionalInstructions: "Adultes Tier",
  }, species);
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.image.width, 1120);
  assert.equal(valid.image.height, 1400);
  assert.match(valid.prompt, /Amsel/);

  const invalid = validatePortraitPreviewPayload({
    originalName: "portrait.png",
    imageBase64: createTestPng(1200, 1200).toString("base64"),
  }, species);
  assert.match(invalid.errors.join(" "), /4:5/);
});

test("Soundvorschau prüft Datei, Pflichtcredits und NC-Lizenz", () => {
  const result = validateSoundPreviewPayload({
    originalName: "sound.mp3",
    audioBase64: createTestMp3(7).toString("base64"),
    reason: "Manuell geprüft",
    credits: {
      recordist: "Testaufnahme",
      source: "xeno-canto.org",
      url: "https://example.org/sound",
      license: "https://creativecommons.org/licenses/by-nc/4.0/",
    },
  }, species);

  assert.deepEqual(result.errors, []);
  assert.equal(result.isNc, true);
  assert.equal(result.credits.scientific_name, "Turdus merula");
  assert.ok(result.inspection.frameOffset >= 0);
});

test("Kartenvorschau akzeptiert JPEG-Dateiupload ohne Quellen-URL", async () => {
  const result = await validateMapPreviewPayload({
    originalName: "map.jpg",
    imageBase64: createTestJpeg(800, 600).toString("base64"),
    reason: "Manuell geprüft",
    source: "",
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.dimensions, { width: 800, height: 600 });
  assert.equal(result.converted, false);
  assert.equal(result.inputFormat, "jpeg");
});
