import assert from "node:assert/strict";
import test from "node:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { assertTestTempPath } from "./test-temp.mjs";
import { validateProjectState } from "./validate-project-state.mjs";
import { validateRepositoryMedia } from "./validate-media-assets.mjs";
import { buildExplorerModel } from "../species-explorer/explorer-model.mjs";
import { createEditableFixture, createTestJpeg, createTestWebp } from "../species-explorer/server-test-fixtures.mjs";

async function projectFixture(t, missing = []) {
  const root = await createEditableFixture();
  t.after(async () => { assertTestTempPath(root); await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 }); });
  const assetDir = join(root, "species-assets", "Amsel");
  const json = async name => JSON.parse(await readFile(join(root, name), "utf8"));
  const writeJson = (name, value) => writeFile(join(root, name), JSON.stringify(value));
  const data = await json("speciesData.json");
  data[0]["Assessment ID"] = 132055069;
  await writeJson("speciesData.json", data);
  await writeJson("lastSavedAssessmentId.json", { Amsel: 132055069 });
  await writeJson("species-assets-overrides.json", { version: 1, assets: {} });
  await writeFile(join(assetDir, "map.jpg"), createTestJpeg());
  await writeFile(join(assetDir, "spectrogram.webp"), createTestWebp());
  await writeFile(join(assetDir, "portrait.webp"), createTestWebp());
  await writeFile(join(assetDir, "portrait.json"), JSON.stringify({ source: "Test" }));
  for (const name of missing) await rm(join(assetDir, name), { force: true });
  if (missing.includes("portrait.webp")) await rm(join(assetDir, "portrait.json"), { force: true });
  const report = await json("fehlende_elemente_report.json");
  report.missing.maps = missing.includes("map.jpg") ? ["Amsel"] : [];
  report.missing.soundMp3 = missing.includes("sound.mp3") ? ["Amsel"] : [];
  report.missing.soundCredits = missing.includes("credits.json") && !missing.includes("sound.mp3") ? ["Amsel"] : [];
  report.missing.speciesAssets = missing.length ? [{ german: "Amsel", safeName: "Amsel", missing }] : [];
  report.counts.missingMap = report.missing.maps.length;
  report.counts.missingSoundMp3 = report.missing.soundMp3.length;
  report.counts.missingSoundCredits = report.missing.soundCredits.length;
  report.counts.missingSpeciesAssets = report.missing.speciesAssets.length;
  const saveReport = () => writeJson("fehlende_elemente_report.json", report);
  await saveReport();
  return { root, assetDir, report, json, writeJson, saveReport, validate: () => validateProjectState(root) };
}

test("Vollständiger Projektstand besteht die Projektprüfung", async t => {
  const f = await projectFixture(t);
  const result = await f.validate();
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("Reportgebunden fehlende Karte benötigt keinen Tracker und bleibt im Explorer offen", async t => {
  const f = await projectFixture(t, ["map.jpg"]);
  await f.writeJson("lastSavedAssessmentId.json", {});
  const media = await validateRepositoryMedia(f.root, { decodeImage: async () => {} });
  assert.equal(media.ok, true, media.errors.join("\n"));
  const result = await f.validate();
  assert.equal(result.ok, true, result.errors.join("\n"));
  const model = await buildExplorerModel(f.root);
  assert.ok(model.species[0].assetIssues.includes("Karte fehlt"));
  assert.equal(model.validation.status, "issues");
  assert.deepEqual(await f.json("lastSavedAssessmentId.json"), {});
});

test("Reportgebunden fehlendes Portrait bleibt im Explorer offen und ist veröffentlichbar", async t => {
  const f = await projectFixture(t, ["portrait.webp"]);
  const result = await f.validate();
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.ok((await buildExplorerModel(f.root)).species[0].assetIssues.includes("Artporträt fehlt"));
});

test("Erlaubte Medienlücken verdecken keine abweichenden Artdaten", async t => {
  const f = await projectFixture(t, ["map.jpg", "portrait.webp"]);
  const input = await f.json("species_list.json");
  input[0].weight = "anderes Gewicht";
  await f.writeJson("species_list.json", input);
  const result = await f.validate();
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => /Gewicht/.test(error)), result.errors.join("\n"));
});

test("Fehlende Karte ohne übereinstimmenden Report bleibt ein Fehler", async t => {
  for (const change of [
    report => { report.missing.maps = []; report.counts.missingMap = 0; },
    report => { report.missing.speciesAssets[0].missing = []; },
    report => { report.missing.speciesAssets[0].safeName = "AndereArt"; },
  ]) {
    const f = await projectFixture(t, ["map.jpg"]);
    change(f.report); await f.saveReport();
    const result = await f.validate();
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(error => /Karte|Karten/.test(error)), result.errors.join("\n"));
  }
});

test("Falsche Reportzähler bleiben auch bei erlaubten Medienlücken ein Fehler", async t => {
  const f = await projectFixture(t, ["map.jpg", "portrait.webp"]);
  f.report.counts.totalSpecies = 2; await f.saveReport();
  const result = await f.validate();
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => /Artenanzahl im Report/.test(error)));
});

test("Vorhandene automatische Karte benötigt weiterhin die passende Assessment-Zuordnung", async t => {
  for (const tracker of [{}, { Amsel: 12 }]) {
    const f = await projectFixture(t);
    await f.writeJson("lastSavedAssessmentId.json", tracker);
    const result = await f.validate();
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(error => /Assessment-Zuordnung.*statt 132055069/.test(error)));
  }
});

test("Veralteter Auslassungsreport darf vorhandene Bilder nicht freigeben", async t => {
  const f = await projectFixture(t, ["portrait.webp"]);
  // The species-name report comparison alone cannot see this stale map part.
  f.report.missing.speciesAssets[0].missing.push("map.jpg");
  await f.saveReport();
  const result = await f.validate();
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => /Karte|Karten/.test(error)), result.errors.join("\n"));
});

test("Ungültige oder verwaiste Portraitmetadaten bleiben bei Auslassung ein Fehler", async t => {
  const f = await projectFixture(t, ["portrait.webp"]);
  await writeFile(join(f.assetDir, "portrait.json"), "{kaputt");
  const result = await f.validate();
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => /Artporträt-Metadaten sind ungültig/.test(error)));
});

test("Erlaubte fehlende Karte verdeckt kein nachträglich geändertes Portrait", async t => {
  const f = await projectFixture(t, ["map.jpg"]);
  const hash = async name => createHash("sha256").update(await readFile(join(f.assetDir, name))).digest("hex");
  await f.writeJson("species-assets-overrides.json", { version: 1, assets: { Amsel: { portrait: {
    sha256: await hash("portrait.webp"), metadataSha256: await hash("portrait.json"),
  } } } });
  await writeFile(join(f.assetDir, "portrait.webp"), "geänderte Bilddatei");
  const result = await f.validate();
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => /Artporträt stimmt nicht mit den registrierten Hashes/.test(error)));
});

test("Erlaubte fehlende Karte verdeckt kein veraltetes Spektrogramm", async t => {
  const f = await projectFixture(t, ["map.jpg"]);
  await f.writeJson("species-assets-overrides.json", { version: 1, assets: { Amsel: { spectrogram: { stale: true } } } });
  const result = await f.validate();
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => /Spektrogramm veraltet/.test(error)));
});

test("Doppelte oder falsch zugeordnete Portrait-Auslassungen werden abgewiesen", async t => {
  for (const change of [
    report => { report.missing.speciesAssets[0].safeName = "AndereArt"; },
    report => { report.missing.speciesAssets.push({ ...report.missing.speciesAssets[0] }); report.counts.missingSpeciesAssets = 2; },
  ]) {
    const f = await projectFixture(t, ["portrait.webp"]);
    change(f.report); await f.saveReport();
    assert.equal((await f.validate()).ok, false);
  }
});

test("Bewusst fehlendes Soundpaket bleibt erlaubt, ein Teilpaket bleibt ein Fehler", async t => {
  const f = await projectFixture(t, ["sound.mp3", "credits.json", "spectrogram.webp"]);
  const result = await f.validate();
  assert.equal(result.ok, true, result.errors.join("\n"));
  await writeFile(join(f.assetDir, "spectrogram.webp"), createTestWebp());
  const partial = await f.validate();
  assert.equal(partial.ok, false);
  assert.ok(partial.errors.some(error => /Soundpaket.*teilweise/.test(error)), partial.errors.join("\n"));
});
