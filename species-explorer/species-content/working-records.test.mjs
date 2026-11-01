import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { canonicalJson } from "../shared-project/security.mjs";
import { buildCatalog } from "../shared-project/catalog.mjs";
import { projectSpeciesRecordToCatalog } from "../shared-project/species-record.mjs";
import { buildSpeciesWorkingRecords } from "./working-records.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const sourceHash = (value) => hash(canonicalJson(value));
const id = "fixture-owl", assetName = "Testkauz (gebunden)", pageUrl = "https://www.fnwildlifetravel.de/wildlife/voegel/fixture-owl";
const mediaUrl = (filename) => `https://felixkfm90.github.io/iucn-species-data/species-assets/${encodeURIComponent(assetName)}/${filename}`;
const contents = {
  "map.jpg": "synthetic map bytes", "sound.mp3": "synthetic sound bytes", "spectrogram.webp": "synthetic spectrum bytes", "portrait.webp": "synthetic portrait bytes",
  "credits.json": JSON.stringify({ recordist: "Synthetic person", license: "CC BY 4.0", source: "Synthetic source", unknown: { preserve: [false, 7] }, privateNote: "Private credit note" }),
  "portrait.json": JSON.stringify({ source: "Synthetic art", type: "Illustration", generation_method: "Synthetic generation", prompt: "Private original prompt", unknown: { preserved: true } }),
};
function sources() {
  const speciesList = [{ german: "Neuer Anzeigename", english: "Synthetic owl", genus: "Strix", species: "fixture", size: 30, weight: "400 g", life_expectancy: "12 Jahre", unknown: { keep: [true, 7] } }];
  const speciesData = [{ URLSlug: id, "Wissenschaftlicher Name": "Strix fixture", "Deutscher Name": "Alter Anzeigename", "Größe": "29 cm",
    Genus: "Strix", Species: "fixture", Subphylum: "Vertebrata", "Assessment ID": 123, unknown: { keepGenerated: true } }];
  const medium = (filename, slot, mimeType) => ({ id: `${id}:${slot}:original`, url: mediaUrl(filename), sha256: hash(contents[filename]), bytes: Buffer.byteLength(contents[filename]), mimeType });
  const catalog = buildCatalog({ revision: "public-fixture", generatedAt: "2026-11-01T00:00:00.000Z", species: [{ id, scientificName: "Strix fixture", commonName: "Alter Anzeigename", taxonomy: [],
    websiteUrl: pageUrl, sections: [{ id: "general", title: "Allgemein", text: "Eigener redaktioneller Text", intentionallyEmpty: false },
      { id: "empty", title: "Lebensraum", text: "", intentionallyEmpty: true }],
    media: { map: medium("map.jpg", "map", "image/jpeg"), portrait: medium("portrait.webp", "portrait", "image/webp"), sounds: [medium("sound.mp3", "sound", "audio/mpeg")],
      gallery: [{ id: `${id}:photo:original`, url: "https://images.squarespace-cdn.com/content/photo.jpg", alt: "Vorhandener Bildtext", caption: "Vorhandene Beschriftung", order: 0 }] } }] });
  return { speciesList, speciesData, catalog, assetOverrides: { version: 1, assets: { [assetName]: { map: { protectFromPipeline: true, source: "Eigene Pflege", extra: { keep: true } }, unknown: [1, 2] } } },
    taxonomyOverrides: { version: 1, species: { [id]: { reason: "Originaleingriff", automaticFields: { family: "Strigidae" }, extra: [true, false] } } },
    assessmentBindings: { [assetName]: { assessmentId: 123, unknown: "retain" } }, bindings: [{ id, assetName, generalSectionId: "general", embeddedGeneralText: null }] };
}
async function fixture(t, supplied = sources()) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "working-records-")), assetsRoot = path.join(root, "assets"), directory = path.join(assetsRoot, assetName);
  await fs.mkdir(directory, { recursive: true });
  for (const [name, bytes] of Object.entries(contents)) await fs.writeFile(path.join(directory, name), bytes);
  t.after(() => fs.rm(assertTestTempPath(root), { recursive: true, force: true, maxRetries: 3, retryDelay: 25 }));
  return { root, directory, input: { ...supplied, assetsRoot } };
}
const codes = (result) => result.issues.filter((entry) => entry.blocking).map((entry) => entry.code);

test("explicit working sources retain full original records, private metadata, stable IDs and actual file hashes without writes", async (t) => {
  const f = await fixture(t), before = structuredClone(f.input), beforeFiles = await fs.readdir(f.directory);
  const result = await buildSpeciesWorkingRecords(f.input);
  assert.equal(result.complete, true); assert.deepEqual(result.issues, []); assert.equal(result.records.length, 1);
  const record = result.records[0];
  assert.deepEqual(record.input, f.input.speciesList[0]); assert.deepEqual(record.generated, f.input.speciesData[0]);
  assert.equal(record.id, id); assert.equal(record.assets.assetName, assetName);
  assert.deepEqual(record.assets.overrides, f.input.assetOverrides.assets[assetName]); assert.deepEqual(record.taxonomyOverride, f.input.taxonomyOverrides.species[id]);
  assert.deepEqual(record.assessmentBinding, f.input.assessmentBindings[assetName]);
  assert.deepEqual(record.assets.credits, JSON.parse(contents["credits.json"])); assert.deepEqual(record.assets.portraitMetadata, JSON.parse(contents["portrait.json"]));
  assert.deepEqual(record.editorial.gallery, f.input.catalog.species[0].media.gallery); assert.equal(record.editorial.sections[1].intentionallyEmpty, true);
  for (const [filename, bytes] of Object.entries(contents)) {
    assert.equal(record.assets.files[filename].sha256, hash(bytes)); assert.equal(record.assets.files[filename].bytes, Buffer.byteLength(bytes));
    assert.equal(await fs.readFile(path.join(f.directory, filename), "utf8"), bytes);
  }
  assert.equal(record.assets.files["portrait.webp"].id, `${id}:portrait:original`); assert.equal(record.assets.files["map.jpg"].url, mediaUrl("map.jpg"));
  assert.equal(Object.hasOwn(record.assets.files["spectrogram.webp"], "url"), false);
  assert.equal(result.sources.speciesList.sha256, sourceHash(f.input.speciesList)); assert.equal(result.evidence[0].record.sha256, sourceHash(record));
  assert.equal(result.sources.assetsRoot.sha256, sourceHash(path.resolve(f.input.assetsRoot)));
  assert.equal(result.proposedOnly, true); assert.equal(result.sharedProjectWrites, "not-performed"); assert.equal(result.externalPublication, "not-performed");
  assert.deepEqual(f.input, before); assert.deepEqual(await fs.readdir(f.directory), beforeFiles); assert.deepEqual((await fs.readdir(f.root)).sort(), ["assets"]);
  const mobile = projectSpeciesRecordToCatalog(record);
  assert.equal(mobile.commonName, "Neuer Anzeigename"); assert.ok(!JSON.stringify(mobile).includes("Private original prompt"));
  assert.ok(!JSON.stringify(mobile).includes("Private credit note")); assert.ok(!JSON.stringify(mobile).includes("keepGenerated"));
});

test("unknown optional manual values and whole register entries remain missing or numeric instead of being inferred from public text", async (t) => {
  const input = sources(); delete input.speciesList[0].english; delete input.speciesList[0].weight;
  input.catalog.species[0].sections[0].text = "Englischer Name: Do not infer\nGewicht: Do not infer";
  const f = await fixture(t, input), result = await buildSpeciesWorkingRecords(f.input);
  assert.equal(result.complete, true); assert.equal(Object.hasOwn(result.records[0].input, "english"), false); assert.equal(Object.hasOwn(result.records[0].input, "weight"), false);
  assert.equal(result.records[0].input.size, 30); assert.equal(result.records[0].editorial.sections[0].text, input.catalog.species[0].sections[0].text);
});

test("public media addresses are kept only for the matching semantic file path, observed hash and compatible metadata", async (t) => {
  for (const change of ["missing-hash", "different-hash", "wrong-folder", "wrong-file", "different-bytes", "different-mime"]) {
    await t.test(change, async (t) => {
      const input = sources(), medium = input.catalog.species[0].media.map;
      if (change === "missing-hash") delete medium.sha256;
      if (change === "different-hash") medium.sha256 = "a".repeat(64);
      if (change === "wrong-folder") medium.url = medium.url.replace(encodeURIComponent(assetName), "DifferentFolder");
      if (change === "wrong-file") medium.url = medium.url.replace("map.jpg", "different.jpg");
      if (change === "different-bytes") medium.bytes++;
      if (change === "different-mime") medium.mimeType = "image/png";
      const f = await fixture(t, input), result = await buildSpeciesWorkingRecords(f.input);
      assert.equal(result.complete, true); assert.equal(Object.hasOwn(result.records[0].assets.files["map.jpg"], "url"), false);
      assert.equal(result.records[0].assets.files["map.jpg"].id, medium.id); assert.equal(result.issues[0].code, "public-medium-not-confirmed");
      assert.equal(result.issues[0].blocking, false); assert.equal(result.records[0].assets.files["map.jpg"].sha256, hash(contents["map.jpg"]));
    });
  }
});

test("ambiguous input, generated identity or explicit folder bindings block rather than selecting a convenient row", async (t) => {
  for (const change of ["duplicate-input", "missing-input", "duplicate-generated", "duplicate-scientific", "wrong-scientific", "duplicate-binding", "shared-folder", "missing-binding"]) {
    await t.test(change, async (t) => {
      const input = sources();
      if (change === "duplicate-input") input.speciesList.push(structuredClone(input.speciesList[0]));
      if (change === "missing-input") input.speciesList = [];
      if (change === "duplicate-generated") input.speciesData.push(structuredClone(input.speciesData[0]));
      if (change === "duplicate-scientific") input.speciesData.push({ ...input.speciesData[0], URLSlug: "another-id" });
      if (change === "wrong-scientific") input.catalog.species[0].scientificName = "Strix changed";
      if (change === "duplicate-binding") input.bindings.push(structuredClone(input.bindings[0]));
      if (change === "shared-folder") input.bindings.push({ ...input.bindings[0], id: "unrelated-id", assetName: assetName.toUpperCase() });
      if (change === "missing-binding") input.bindings = [];
      const f = await fixture(t, input), result = await buildSpeciesWorkingRecords(f.input);
      assert.equal(result.complete, false); assert.equal(result.records.length, 0); assert.ok(codes(result).length > 0);
    });
  }
});

test("unbound extra input/generated species stay explicit global blocking issues", async (t) => {
  const input = sources(); input.speciesList.push({ german: "Zusatz", genus: "Turdus", species: "extra" });
  input.speciesData.push({ URLSlug: "unmatched", Genus: "Turdus", Species: "another" });
  const f = await fixture(t, input), result = await buildSpeciesWorkingRecords(f.input);
  assert.equal(result.complete, false); assert.equal(result.records.length, 1);
  assert.ok(codes(result).includes("input-species-not-bound")); assert.ok(codes(result).includes("generated-species-not-bound"));
});

test("old generated general suffix requires an explicit exact full-generated-source binding and keeps editorial prose", async (t) => {
  const input = sources(), old = "Wissenschaftlicher Name: Strix fixture\nDeutscher Name: Alter Anzeigename\nGröße: 29 cm\nAssessment ID: 123";
  input.catalog.species[0].sections[0].text += `\n\n${old}`;
  const f = await fixture(t, input);
  let result = await buildSpeciesWorkingRecords(f.input);
  assert.equal(result.records.length, 0); assert.ok(codes(result).includes("general_binding_required"));
  f.input.bindings[0].embeddedGeneralText = old;
  result = await buildSpeciesWorkingRecords(f.input); assert.ok(codes(result).includes("general-source-binding-required"));
  f.input.bindings[0].generatedSha256 = sourceHash(f.input.speciesData[0]);
  result = await buildSpeciesWorkingRecords(f.input); assert.equal(result.complete, true);
  const mobile = projectSpeciesRecordToCatalog(result.records[0]), general = mobile.sections.find((entry) => entry.id === "general").text;
  assert.match(general, /^Eigener redaktioneller Text\n\n/); assert.ok(!general.includes("29 cm")); assert.match(general, /Größe: 30/);
  f.input.bindings[0].embeddedGeneralText = `${old}\nUnbound extra`;
  result = await buildSpeciesWorkingRecords(f.input); assert.equal(result.records.length, 0); assert.ok(codes(result).some((code) => ["invalid_general_binding", "general_binding_required"].includes(code)));
});

test("explicit empty general decisions and safe folder names are required before filesystem reads", async (t) => {
  const f = await fixture(t); delete f.input.bindings[0].embeddedGeneralText;
  let result = await buildSpeciesWorkingRecords(f.input); assert.ok(codes(result).includes("explicit-general-decision-required"));
  for (const name of ["../escape", "folder/child", "folder\\child", "NUL", "folder.", " name"]) {
    f.input.bindings = [{ id, assetName: name, generalSectionId: null, embeddedGeneralText: null }];
    result = await buildSpeciesWorkingRecords(f.input); assert.ok(codes(result).includes("unsafe-asset-name")); assert.equal(result.records.length, 0);
  }
  await assert.rejects(buildSpeciesWorkingRecords({ ...f.input, assetsRoot: "relative" }), { code: "explicit-local-assets-root-required" });
});

test("multiple catalog recordings cannot be silently assigned to the one normal sound file", async (t) => {
  const input = sources(); input.catalog.species[0].media.sounds.push({ ...input.catalog.species[0].media.sounds[0], id: "second-recording" });
  const f = await fixture(t, input), result = await buildSpeciesWorkingRecords(f.input);
  assert.equal(result.records.length, 0); assert.ok(codes(result).includes("ambiguous-catalog-medium"));
  f.input.catalog.species[0].media.sounds[1].url = "https://audio.example.org/different-recording.mp3";
  const differentRecording = await buildSpeciesWorkingRecords(f.input);
  assert.equal(differentRecording.records.length, 0); assert.ok(codes(differentRecording).includes("ambiguous-catalog-medium"));
});

test("explicit empty registers remain distinguishable from malformed per-species asset entries", async (t) => {
  const f = await fixture(t); f.input.assetOverrides.assets[assetName] = null;
  const malformed = await buildSpeciesWorkingRecords(f.input); assert.ok(codes(malformed).includes("invalid-art-asset-overrides")); assert.equal(malformed.records.length, 0);
  delete f.input.assetOverrides.assets[assetName]; delete f.input.taxonomyOverrides.species[id]; delete f.input.assessmentBindings[assetName];
  const absent = await buildSpeciesWorkingRecords(f.input); assert.equal(absent.complete, true);
  assert.deepEqual(absent.records[0].assets.overrides, {}); assert.equal(absent.records[0].taxonomyOverride, null); assert.equal(absent.records[0].assessmentBinding, null);
});

test("missing paired metadata and unreadable private metadata never fabricate a complete source", async (t) => {
  for (const change of ["absent-credits", "absent-portrait", "invalid-json", "array-json", "invalid-utf8"]) {
    await t.test(change, async (t) => {
      const f = await fixture(t);
      if (change === "absent-credits") await fs.unlink(path.join(f.directory, "credits.json"));
      if (change === "absent-portrait") await fs.unlink(path.join(f.directory, "portrait.webp"));
      if (change === "invalid-json") await fs.writeFile(path.join(f.directory, "credits.json"), "not JSON");
      if (change === "array-json") await fs.writeFile(path.join(f.directory, "credits.json"), "[]");
      if (change === "invalid-utf8") await fs.writeFile(path.join(f.directory, "credits.json"), Buffer.from([123, 34, 97, 34, 58, 34, 255, 34, 125]));
      const result = await buildSpeciesWorkingRecords(f.input); assert.equal(result.complete, false); assert.equal(result.records.length, 0);
      assert.ok(codes(result).some((code) => ["unpaired-asset-metadata", "catalog-medium-missing-locally", "invalid-asset-metadata"].includes(code)));
    });
  }
});

test("an absent recording remains absent without an invented sound or silence statement", async (t) => {
  const input = sources(); input.catalog.species[0].media.sounds = [];
  const f = await fixture(t, input); await fs.unlink(path.join(f.directory, "sound.mp3")); await fs.unlink(path.join(f.directory, "credits.json"));
  const result = await buildSpeciesWorkingRecords(f.input); assert.equal(result.complete, true);
  assert.equal(result.records[0].assets.credits, null); assert.equal(Object.hasOwn(result.records[0].assets.files, "sound.mp3"), false);
  assert.deepEqual(projectSpeciesRecordToCatalog(result.records[0]).media.sounds, []); assert.ok(!JSON.stringify(result).includes("stumm"));
});

test("a file changed during the actual chunk read is rejected with no working record", async (t) => {
  const f = await fixture(t), target = path.join(f.directory, "map.jpg"), realOpen = fs.open;
  let changed = false;
  t.mock.method(fs, "open", async (...args) => {
    const handle = await realOpen(...args);
    if (args[0] !== target) return handle;
    return new Proxy(handle, { get(object, key) {
      if (key === "read") return async (...readArgs) => { const result = await object.read(...readArgs); if (!changed) { changed = true; await fs.appendFile(target, "synthetic mutation"); } return result; };
      const value = Reflect.get(object, key); return typeof value === "function" ? value.bind(object) : value;
    } });
  });
  const result = await buildSpeciesWorkingRecords(f.input);
  assert.equal(changed, true); assert.equal(result.records.length, 0); assert.ok(codes(result).includes("asset-changed-during-read"));
});

test("new optional files appearing after their slot was read invalidate the final file-set binding", async (t) => {
  const input = sources(); input.catalog.species[0].media.sounds = [];
  const f = await fixture(t, input); await fs.unlink(path.join(f.directory, "sound.mp3")); await fs.unlink(path.join(f.directory, "credits.json"));
  const realOpen = fs.open; let created = false;
  t.mock.method(fs, "open", async (...args) => {
    const handle = await realOpen(...args);
    if (args[0] !== path.join(f.directory, "portrait.json")) return handle;
    return new Proxy(handle, { get(object, key) {
      if (key === "read") return async (...readArgs) => { const result = await object.read(...readArgs); if (!created) { created = true; await fs.writeFile(path.join(f.directory, "sound.mp3"), "new synthetic recording"); } return result; };
      const value = Reflect.get(object, key); return typeof value === "function" ? value.bind(object) : value;
    } });
  });
  const result = await buildSpeciesWorkingRecords(f.input);
  assert.equal(created, true); assert.equal(result.records.length, 0); assert.ok(codes(result).includes("asset-set-changed"));
});

test("symbolic asset files and linked asset ancestors are rejected before being adopted", async (t) => {
  for (const type of ["file", "directory"]) {
    await t.test(type, async (t) => {
      const f = await fixture(t), target = path.join(f.root, "link-target"), link = type === "file" ? path.join(f.directory, "map.jpg") : path.join(f.root, "linked-assets");
      if (type === "file") { await fs.writeFile(target, "linked private synthetic bytes"); await fs.unlink(link); }
      try { await fs.symlink(type === "file" ? target : f.input.assetsRoot, link, type === "file" ? "file" : process.platform === "win32" ? "junction" : "dir"); }
      catch (error) { if (["EPERM", "EACCES"].includes(error.code)) { t.skip("This Windows context cannot create the required symbolic fixture."); return; } throw error; }
      if (type === "directory") f.input.assetsRoot = link;
      const result = await buildSpeciesWorkingRecords(f.input);
      assert.equal(result.records.length, 0); assert.ok(codes(result).includes(type === "file" ? "unsafe-asset-file" : "unsafe-asset-directory"));
    });
  }
});
