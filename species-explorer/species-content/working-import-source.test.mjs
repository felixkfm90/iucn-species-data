import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { canonicalJson } from "../shared-project/security.mjs";
import { buildCatalog } from "../shared-project/catalog.mjs";
import { createWorkingImportSource, validateWorkingImportEvidence } from "./working-import-source.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => canonicalJson(value, { maxBytes: 8 * 1024 * 1024, maxNodes: 300000 });
const sourceHash = (evidence) => sha(json({ kind: "working-records", version: 1, ...evidence }));
const names = ["map.jpg", "sound.mp3", "spectrogram.webp", "portrait.webp", "credits.json", "portrait.json"];
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "working-import-source-")), assetsRoot = path.join(root, "assets");
  t.after(() => fs.rm(assertTestTempPath(root), { recursive: true, force: true, maxRetries: 3, retryDelay: 25 }));
  const source = { speciesList: [], speciesData: [], catalog: null, assetOverrides: { version: 1, assets: {} },
    taxonomyOverrides: { version: 1, species: {} }, assessmentBindings: {}, bindings: [] }, species = [], paths = new Map();
  for (const label of ["one", "two"]) {
    const id = `fixture-${label}`, assetName = `Bound ${label}`, directory = path.join(assetsRoot, assetName);
    await fs.mkdir(directory, { recursive: true });
    const contents = { "map.jpg": `${id}:map`, "sound.mp3": `${id}:sound`, "spectrogram.webp": `${id}:spectrum`, "portrait.webp": `${id}:portrait`,
      "credits.json": JSON.stringify({ source: "Synthetic original", privateNote: `${id}:private credit` }),
      "portrait.json": JSON.stringify({ prompt: `${id}:private original prompt`, source: "Synthetic portrait" }) };
    for (const [filename, bytes] of Object.entries(contents)) await fs.writeFile(path.join(directory, filename), bytes);
    paths.set(id, directory);
    source.speciesList.push({ german: `Testkauz ${label}`, english: `Synthetic owl ${label}`, genus: "Strix", species: label,
      size: "30 cm", weight: "400 g", life_expectancy: "12 Jahre", privateUnknown: { preserved: true } });
    source.speciesData.push({ URLSlug: id, "Wissenschaftlicher Name": `Strix ${label}`, Genus: "Strix", Species: label, "Deutscher Name": `Testkauz ${label}` });
    source.assetOverrides.assets[assetName] = { map: { protectFromPipeline: true, source: "Own synthetic map" } };
    source.taxonomyOverrides.species[id] = { reason: "Own taxonomy", unknown: [1, false] }; source.assessmentBindings[assetName] = { id: label };
    source.bindings.push({ id, assetName, generalSectionId: null, embeddedGeneralText: null });
    const medium = (file, slot, mimeType) => ({ id: `${id}:${slot}`, url: `https://media.example.org/assets/${encodeURIComponent(assetName)}/${file}`,
      bytes: Buffer.byteLength(contents[file]), sha256: sha(contents[file]), mimeType });
    species.push({ id, commonName: `Testkauz ${label}`, scientificName: `Strix ${label}`, taxonomy: [],
      sections: [{ id: "appearance", title: "Aussehen", text: `Existing article ${label}`, intentionallyEmpty: false }],
      media: { map: medium("map.jpg", "map", "image/jpeg"), portrait: medium("portrait.webp", "portrait", "image/webp"),
        sounds: [medium("sound.mp3", "sound", "audio/mpeg")], gallery: [] } });
  }
  source.catalog = buildCatalog({ revision: "bound-public-fixture", generatedAt: "2026-11-01T00:00:00.000Z", species });
  let reads = 0, reader = async () => source;
  const adapter = createWorkingImportSource({ assetsRoot, readSources: () => { reads++; return reader(); } });
  return { root, assetsRoot, source, paths, adapter, reads: () => reads, setReader: (value) => { reader = value; } };
}
const first = "fixture-one", second = "fixture-two";

test("working adapter binds exact evidence hash, deep-copies all targets and performs no writes", async (t) => {
  const f = await fixture(t), before = structuredClone(f.source), beforeFiles = await Promise.all([...f.paths.values()].map((directory) => fs.readdir(directory)));
  const result = await f.adapter.read();
  assert.equal(f.adapter.kind, "working-records"); assert.equal(f.adapter.version, 1); assert.equal(result.species.length, 2);
  assert.equal(result.sourceSha256, sourceHash(result.evidence));
  assert.deepEqual(validateWorkingImportEvidence(result.evidence, result.species, result.sourceSha256), result.evidence);
  assert.equal(await f.adapter.verifySpecies(result, first), true);
  assert.equal(result.species[0].input.privateUnknown.preserved, true);
  assert.equal(result.species[0].assets.portraitMetadata.prompt, `${first}:private original prompt`);
  assert.deepEqual(f.source, before); assert.deepEqual(await Promise.all([...f.paths.values()].map((directory) => fs.readdir(directory))), beforeFiles);
  assert.deepEqual(await fs.readdir(f.root), ["assets"]);
  const repeated = await f.adapter.read(); assert.equal(repeated.sourceSha256, result.sourceSha256);
  f.source.speciesList[0].size = "Changed original after read"; assert.equal(result.species[0].input.size, "30 cm");
});

test("every explicit global source is rechecked before a single species opens asset bytes", async (t) => {
  const f = await fixture(t), snapshot = await f.adapter.read(), original = structuredClone(f.source), realOpen = fs.open;
  let opens = 0;
  t.mock.method(fs, "open", (...args) => { opens++; return realOpen(...args); });
  for (const key of ["speciesList", "speciesData", "catalog", "assetOverrides", "taxonomyOverrides", "assessmentBindings", "bindings"]) {
    for (const [name, value] of Object.entries(original)) f.source[name] = structuredClone(value);
    if (Array.isArray(f.source[key])) f.source[key][0].syntheticChangedSource = true;
    else f.source[key].syntheticChangedSource = true;
    const before = opens;
    await assert.rejects(f.adapter.verifySpecies(snapshot, first), { code: "working_source_changed" });
    assert.equal(opens, before, key);
  }
});

test("per-species verification reads only that species' bound files and detects other file drift before its own step", async (t) => {
  const f = await fixture(t), snapshot = await f.adapter.read();
  await fs.appendFile(path.join(f.paths.get(second), "map.jpg"), ":new local bytes");
  const realOpen = fs.open, opened = [];
  t.mock.method(fs, "open", (...args) => { opened.push(args[0]); return realOpen(...args); });
  assert.equal(await f.adapter.verifySpecies(snapshot, first), true);
  assert.equal(opened.length, names.length); assert.ok(opened.every((filename) => path.dirname(filename) === f.paths.get(first)));
  await assert.rejects(f.adapter.verifySpecies(snapshot, second), { code: "working_species_changed" });
  assert.equal(snapshot.species[1].assets.files["map.jpg"].sha256, sha(`${second}:map`));
});

test("source changes occurring while a species is read stop before a successful verification", async (t) => {
  const f = await fixture(t), snapshot = await f.adapter.read(), realOpen = fs.open;
  let changed = false;
  t.mock.method(fs, "open", async (...args) => {
    const handle = await realOpen(...args);
    if (!changed) { changed = true; f.source.speciesList[1].size = "42 cm"; }
    return handle;
  });
  await assert.rejects(f.adapter.verifySpecies(snapshot, first), { code: "working_source_changed" }); assert.equal(changed, true);
});

test("a changed target, missing target, changed evidence or invented file proof cannot bypass a reviewed snapshot", async (t) => {
  const f = await fixture(t), original = await f.adapter.read();
  for (const change of ["target", "missing-target", "input-proof", "file-proof", "extra-evidence"]) {
    const value = structuredClone(original);
    if (change === "target") value.species[0].input.size = "99 cm";
    if (change === "missing-target") value.species.pop();
    if (change === "input-proof") value.evidence.evidence[0].input.sha256 = "a".repeat(64);
    if (change === "file-proof") value.evidence.evidence[0].files[0].sha256 = "a".repeat(64);
    if (change === "extra-evidence") value.evidence.unexpected = true;
    const before = f.reads(); await assert.rejects(f.adapter.verifySpecies(value, first)); assert.equal(f.reads(), before, change);
  }
  await assert.rejects(f.adapter.verifySpecies(original, "unbound-species"), { code: "working_species_missing" });
});

test("even a self-consistently rehashed forged target is compared with actual current sources and bytes", async (t) => {
  const f = await fixture(t), value = await f.adapter.read();
  value.species[0].input.size = "99 cm";
  for (const [key, source] of [["record", value.species[0]], ["input", value.species[0].input]]) {
    const text = json(source); value.evidence.evidence[0][key] = { sha256: sha(text), bytes: Buffer.byteLength(text), encoding: "canonical-json" };
  }
  value.sourceSha256 = sourceHash(value.evidence);
  validateWorkingImportEvidence(value.evidence, value.species, value.sourceSha256);
  await assert.rejects(f.adapter.verifySpecies(value, first), { code: "working_species_changed" });
});

test("pure evidence validation is deterministic, deeply copied and enforces record/file and hash binding", async (t) => {
  const f = await fixture(t), value = await f.adapter.read(), checked = validateWorkingImportEvidence(value.evidence, value.species, value.sourceSha256);
  value.evidence.sources.speciesList.sha256 = "a".repeat(64);
  assert.notEqual(checked.sources.speciesList.sha256, value.evidence.sources.speciesList.sha256);
  assert.equal(sourceHash(checked), value.sourceSha256);
  assert.deepEqual(validateWorkingImportEvidence(checked, undefined, value.sourceSha256), checked);
  for (const mutate of [
    (item) => { item.sources.unknown = item.sources.speciesList; },
    (item) => { item.sources.speciesList.encoding = "unbound-raw-text"; },
    (item) => { item.evidence.push(structuredClone(item.evidence[0])); },
    (item) => { item.evidence[0].inputIndex = 10000; },
    (item) => { item.evidence[1].assetName = item.evidence[0].assetName.toUpperCase(); },
    (item) => { item.evidence[0].files[0] = null; },
    (item) => { item.evidence[0].files[0].filename = "../map.jpg"; },
    (item) => { item.evidence[0].files[0].url = "https://user:password@media.example.org/map.jpg"; },
    (item) => { item.evidence[0].files[0].present = false; },
    (item) => { item.evidence[0].record.bytes = 256 * 1024 + 1; },
  ]) { const changed = structuredClone(checked); mutate(changed); assert.throws(() => validateWorkingImportEvidence(changed)); }
  assert.throws(() => validateWorkingImportEvidence(checked, value.species, "a".repeat(64)), { code: "working_source_changed" });
});

test("missing, ambiguous and incomplete current sources never become an import source", async (t) => {
  for (const change of ["missing-source", "extra-source", "ambiguous-input", "empty-catalog", "oversized-record", "missing-file"]) {
    await t.test(change, async (t) => {
      const f = await fixture(t);
      if (change === "missing-source") delete f.source.assessmentBindings;
      if (change === "extra-source") f.source.unexpectedPath = "No path selection";
      if (change === "ambiguous-input") f.source.speciesList.push(structuredClone(f.source.speciesList[0]));
      if (change === "empty-catalog") f.source.catalog.species = [];
      if (change === "oversized-record") f.source.speciesList[0].privateLargeField = "x".repeat(256 * 1024);
      if (change === "missing-file") await fs.unlink(path.join(f.paths.get(first), "map.jpg"));
      await assert.rejects(f.adapter.read());
    });
  }
});

test("fixed roots and readers cannot be substituted by renderer data and reader failures reveal no contents", async (t) => {
  const f = await fixture(t), value = await f.adapter.read();
  assert.throws(() => createWorkingImportSource({ readSources: async () => f.source, assetsRoot: "relative" }), { code: "invalid_working_source_config" });
  assert.throws(() => createWorkingImportSource({ assetsRoot: f.assetsRoot }), { code: "invalid_working_source_config" });
  f.setReader(async () => { throw new Error("Synthetic private error content"); });
  await assert.rejects(f.adapter.read(), (error) => error.code === "working_source_unavailable" && !error.message.includes("private error"));
  await assert.rejects(f.adapter.verifySpecies(value, first), { code: "working_source_unavailable" });
});
