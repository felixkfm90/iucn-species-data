import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir, assertTestTempPath } from "./test-temp.mjs";
import { inspectJpeg, inspectPng, inspectWebp, validateRepositoryMedia } from "./validate-media-assets.mjs";
import { createTestJpeg, createTestWebp } from "../species-explorer/server-test-fixtures.mjs";

async function mediaFixture(t, { missing = [], sound = false, folder = true } = {}) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "optional-media-"));
  t.after(async () => { assertTestTempPath(root); await fs.rm(root, { recursive: true, force: true }); });
  const directory = path.join(root, "species-assets", "Amsel");
  if (folder) await fs.mkdir(directory, { recursive: true });
  const report = { missing: { soundMp3: sound ? [] : ["Amsel"], maps: missing.includes("map.jpg") ? ["Amsel"] : [],
    speciesAssets: missing.length ? [{ german: "Amsel", safeName: "Amsel", missing }] : [] } };
  await fs.writeFile(path.join(root, "species_list.json"), JSON.stringify([{ german: "Amsel", genus: "Turdus", species: "merula" }]));
  const reportPath = path.join(root, "fehlende_elemente_report.json");
  await fs.writeFile(reportPath, JSON.stringify(report));
  if (folder && !missing.includes("map.jpg")) await fs.writeFile(path.join(directory, "map.jpg"), createTestJpeg(640, 480));
  if (folder && !missing.includes("portrait.webp")) await fs.writeFile(path.join(directory, "portrait.webp"), createTestWebp(1));
  const validate = options => validateRepositoryMedia(root, { decodeImage: async () => {}, ...options });
  return { root, directory, report, validate, writeReport: () => fs.writeFile(reportPath, JSON.stringify(report)) };
}

test("Reportgebunden übersprungene Karte und Artportrait erlauben vollständige übrige Medien", async t => {
  const f = await mediaFixture(t, { missing: ["map.jpg", "portrait.webp", "sound.mp3", "credits.json", "spectrogram.webp"] });
  const result = await f.validate();
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.counts.allowedMissingMaps, 1);
  assert.equal(result.counts.allowedMissingPortraits, 1);
});

test("Vollständig reportgebunden ausgelassene Medien benötigen keinen leeren Assetordner", async t => {
  const f = await mediaFixture(t, { missing: ["map.jpg", "portrait.webp", "sound.mp3", "credits.json", "spectrogram.webp"], folder: false });
  const result = await f.validate();
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("Fehlende Karte benötigt übereinstimmenden Karten- und Artdateireport", async t => {
  for (const change of [
    report => { report.missing.maps = []; },
    report => { report.missing.speciesAssets[0].safeName = "Andere Art"; },
    report => { report.missing.speciesAssets[0].missing = []; },
  ]) {
    const f = await mediaFixture(t, { missing: ["map.jpg"] });
    change(f.report); await f.writeReport();
    const result = await f.validate();
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(error => /Karte fehlt/.test(error)));
  }
});

test("Fehlendes Artportrait bleibt ohne Artdateireport ein Fehler", async t => {
  const f = await mediaFixture(t, { missing: ["portrait.webp"] });
  f.report.missing.speciesAssets = []; await f.writeReport();
  const result = await f.validate();
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => /Artportrait fehlt/.test(error)));
});

test("Vorhandene ungültige Bilder werden auch bei gemeldeter Auslassung abgewiesen", async t => {
  const f = await mediaFixture(t, { missing: ["map.jpg", "portrait.webp"] });
  for (const name of ["map.jpg", "portrait.webp"]) await fs.writeFile(path.join(f.directory, name), "kaputte Bilddatei");
  const result = await f.validate();
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => /Karte ist ungültig/.test(error)));
  assert.ok(result.errors.some(error => /Artportrait ist ungültig/.test(error)));
  assert.equal(result.errors.filter(error => /Report meldet/.test(error)).length, 2);
});

test("Artportrait-Metadaten ohne Bild und beschädigte vorhandene Metadaten stoppen die Freigabe", async t => {
  const f = await mediaFixture(t, { missing: ["portrait.webp"] });
  await fs.writeFile(path.join(f.directory, "portrait.json"), "{broken");
  const result = await f.validate();
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => /Artportrait fehlt, aber seine Metadaten/.test(error)));
  assert.ok(result.errors.some(error => /Artportrait-Metadaten sind kein gültiges JSON/.test(error)));
});

test("Ton-Credits und Spektrogramm dürfen bei ausgelassenem Ton nicht einzeln übrig bleiben", async t => {
  const f = await mediaFixture(t);
  for (const name of ["credits.json", "spectrogram.webp"]) {
    await fs.writeFile(path.join(f.directory, name), "fixture");
    const result = await f.validate();
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(error => /Soundpaket ist nur teilweise vorhanden/.test(error)));
    await fs.unlink(path.join(f.directory, name));
  }
});

test("Eine während der Prüfung hinzugefügte ausgelassene Karte wird nicht ungeprüft freigegeben", async t => {
  const f = await mediaFixture(t, { missing: ["map.jpg"] });
  const result = await f.validate({ decodeImage: async () => {
    await fs.writeFile(path.join(f.directory, "map.jpg"), "ungeprüfter Fremdstand");
  } });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => /Datei ist während der Medienprüfung hinzugekommen/.test(error)));
});

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
