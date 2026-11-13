import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { canonicalJson } from "../shared-project/security.mjs";
import { buildCatalog } from "../shared-project/catalog.mjs";
import { createLocalWorkingImportSource } from "./local-working-source.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const first = "fixture-one", second = "fixture-two";
const files = { speciesList: "species_list.json", speciesData: "speciesData.json", assetOverrides: "species-assets-overrides.json",
  taxonomyOverrides: "species-taxonomy-overrides.json", assessmentBindings: "lastSavedAssessmentId.json" };
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "local-working-source-")), assetsRoot = path.join(root, "species-assets");
  t.after(() => fs.rm(assertTestTempPath(root), { recursive: true, force: true, maxRetries: 3, retryDelay: 25 }));
  const source = { speciesList: [], speciesData: [], assetOverrides: { version: 1, assets: {} }, taxonomyOverrides: { version: 1, species: {} }, assessmentBindings: {} };
  const species = [], assetPaths = new Map(), generals = new Map();
  for (const label of ["one", "two"]) {
    const id = `fixture-${label}`, german = `Grüner Testkauz ${label}`, assetName = `Gruener Testkauz ${label}`, directory = path.join(assetsRoot, assetName);
    await fs.mkdir(directory, { recursive: true }); assetPaths.set(id, directory);
    source.speciesList.push({ german: `Manuelle Originalart ${label}`, english: "Manual original name", genus: "Strix", species: label,
      size: "41 cm", weight: "450 g", life_expectancy: "12 Jahre", unknownManual: { retain: true } });
    source.speciesData.push({ URLSlug: id, Genus: "Strix", Species: label, "Wissenschaftlicher Name": `Strix ${label}`, "Deutscher Name": german,
      "Englischer Name": "Generated original name", "Größe": "40 cm", "Gewicht": "400 g", "Lebenserwartung": "10 Jahre", "Assessment ID": 123,
      unknownGenerated: { retain: [false, 7] } });
    source.assetOverrides.assets[assetName] = { map: { protectFromPipeline: true, source: "Own synthetic source", unknownProtection: true } };
    source.taxonomyOverrides.species[id] = { reason: "Keep local taxonomy", automaticFields: { family: "Strigidae" } };
    source.assessmentBindings[assetName] = { id: 123, originalBinding: label };
    const content = { "map.jpg": `${id}:map`, "sound.mp3": `${id}:sound`, "spectrogram.webp": `${id}:spectrum`, "portrait.webp": `${id}:portrait`,
      "credits.json": JSON.stringify({ source: "Original synthetic audio", privateNote: `Private credits ${label}` }),
      "portrait.json": JSON.stringify({ source: "Original synthetic art", prompt: `Private original prompt ${label}` }) };
    for (const [filename, bytes] of Object.entries(content)) await fs.writeFile(path.join(directory, filename), bytes);
    const medium = (filename, slot, mimeType) => ({ id: `${id}:${slot}`, url: `https://media.example.org/species-assets/${encodeURIComponent(assetName)}/${filename}`,
      bytes: Buffer.byteLength(content[filename]), sha256: hash(content[filename]), mimeType });
    const general = `Wissenschaftlicher Name: Strix ${label}\nDeutscher Name: ${german}\nEnglischer Name: Generated original name\nGröße: 40 cm\nGewicht: 400 g\nLebenserwartung: 10 Jahre\nAssessment ID: 123`;
    generals.set(id, general);
    species.push({ id, scientificName: `Strix ${label}`, commonName: german, taxonomy: [],
      sections: [{ id: "original-general", title: "Allgemein", text: `Redaktioneller Originaltext ${label}\n\n${general}`, intentionallyEmpty: false },
        { id: "habitat", title: "Lebensraum", text: "Fachtext ohne Rückrechnung", intentionallyEmpty: false }],
      media: { portrait: medium("portrait.webp", "portrait", "image/webp"), map: medium("map.jpg", "map", "image/jpeg"),
        sounds: [medium("sound.mp3", "sound", "audio/mpeg")], gallery: [] } });
  }
  for (const [key, filename] of Object.entries(files)) await fs.writeFile(path.join(root, filename), JSON.stringify(source[key]));
  const catalog = buildCatalog({ revision: "synthetic-public-source", generatedAt: "2026-11-01T00:00:00.000Z", species });
  let reader = async () => Buffer.from(JSON.stringify(catalog));
  const adapter = createLocalWorkingImportSource({ repoRoot: root, readCatalog: () => reader() });
  return { root, assetsRoot, source, catalog, generals, assetPaths, adapter, setReader: (value) => { reader = value; } };
}
async function originals(f) {
  const result = {};
  for (const filename of Object.values(files)) result[filename] = hash(await fs.readFile(path.join(f.root, filename)));
  for (const [id, directory] of f.assetPaths) for (const filename of await fs.readdir(directory)) result[`${id}/${filename}`] = hash(await fs.readFile(path.join(directory, filename)));
  return result;
}

function publicRelease(catalog) {
  const release = { ...catalog, generatedAt: "2026-11-12T18:51:24.919Z" };
  release.revision = hash(`${JSON.stringify(release.species)}\n`);
  const payload = JSON.stringify(release);
  const manifest = { schemaVersion: 1, kind: "fn-public-catalog", catalogSha256: hash(payload), catalogBytes: Buffer.byteLength(payload),
    revision: release.revision, generatedAt: release.generatedAt, speciesCount: release.species.length };
  return { manifest, payload };
}

function websiteCatalog(f) {
  return { ...f.catalog, species: f.catalog.species.map(({ media, ...species }) => ({ ...species,
    websiteUrl: `https://www.fnwildlifetravel.de/wildlife/heimische-tierwelt/${species.id}`, media: { sounds: [], gallery: [] },
  })) };
}

test("the verified release adds public editorial sections by local ID and binds the plan for offline continuation", async (t) => {
  const f = await fixture(t), before = await originals(f), published = websiteCatalog(f), bundled = { ...f.catalog, species: [f.catalog.species[0]] };
  published.species[1].media.gallery.push({ id: "photo-two", order: 0,
    url: "https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/photo-two.jpg", alt: "An approved photograph" });
  published.species.push({ ...published.species[0], id: "published-only", websiteUrl: "https://www.fnwildlifetravel.de/wildlife/heimische-tierwelt/published-only" });
  const { manifest, payload } = publicRelease(published), requests = [];
  let online = true;
  const adapter = createLocalWorkingImportSource({ repoRoot: f.root, readCatalog: async () => Buffer.from(JSON.stringify(bundled)),
    fetchPublicCatalog: async (url, options) => {
      requests.push([url.pathname.split("/").at(-1), options.credentials, options.redirect]);
      if (!online) throw new TypeError("offline");
      return new Response(url.pathname.endsWith("/manifest.json") ? JSON.stringify(manifest) : payload);
    } });
  const plan = await adapter.read(), local = plan.species[1];
  assert.deepEqual(plan.species.map(({ id }) => id), [first, second]);
  assert.equal(plan.evidence.editorialRelease.kind, "public-release");
  assert.deepEqual(requests, [["manifest.json", "omit", "manual"], [`${manifest.catalogSha256}.json`, "omit", "manual"]]);
  assert.equal(local.editorial.websiteUrl, published.species[1].websiteUrl);
  assert.equal(local.editorial.sections.length, 2); assert.equal(local.editorial.gallery[0].alt, "An approved photograph");
  assert.equal(local.input.size, "41 cm"); assert.equal(local.assets.files["map.jpg"].sha256, hash("fixture-two:map"));
  assert.ok(Object.values(local.assets.files).every((file) => file.url === undefined));
  online = false;
  assert.equal(await adapter.verifySpecies(plan, second), true);
  assert.equal((await adapter.read({ editorialRelease: plan.evidence.editorialRelease })).sourceSha256, plan.sourceSha256);
  assert.equal(requests.length, 2);
  const fallback = await adapter.read();
  assert.deepEqual(fallback.evidence.editorialRelease, { kind: "bundled-catalog" });
  assert.equal(fallback.species[1].editorial.websiteUrl, null);
  assert.deepEqual(await originals(f), before);
});

test("a legacy prepared working plan retains its bundled source hash without consulting Pages", async (t) => {
  const f = await fixture(t), old = await f.adapter.read();
  const current = createLocalWorkingImportSource({ repoRoot: f.root, readCatalog: async () => Buffer.from(JSON.stringify(f.catalog)),
    fetchPublicCatalog: async () => { assert.fail("the legacy plan must stay bound to its original source"); } });
  assert.equal((await current.read({ editorialRelease: null })).sourceSha256, old.sourceSha256);
  assert.equal(await current.verifySpecies(old, first), true);
});

test("an invalid release or one missing an existing local editorial binding blocks preparation", async (t) => {
  for (const defect of ["manifest", "digest", "redirect", "gallery", "missing-known-species"]) await t.test(defect, async (t) => {
    const f = await fixture(t), catalog = websiteCatalog(f);
    if (defect === "gallery") catalog.species[0].media.gallery.push({ id: "unrelated", url: "https://unrelated.example.org/photo.jpg", order: 0 });
    if (defect === "missing-known-species") catalog.species.pop();
    const { manifest, payload } = publicRelease(catalog);
    const adapter = createLocalWorkingImportSource({ repoRoot: f.root, readCatalog: async () => Buffer.from(JSON.stringify(f.catalog)),
      fetchPublicCatalog: async (url) => {
        if (url.pathname.endsWith("/manifest.json")) return new Response(defect === "manifest" ? "{}" : JSON.stringify(manifest));
        if (defect === "redirect") return Response.redirect("https://unrelated.example.org/catalog.json");
        return new Response(defect === "digest" ? payload.replace("Fachtext", "Testtext") : payload);
      } });
    await assert.rejects(adapter.read(), { code: "working_public_catalog_invalid" });
  });
});

test("fixed local sources produce full records with exact generated general binding and unchanged original files", async (t) => {
  const f = await fixture(t), before = await originals(f), snapshot = await f.adapter.read();
  assert.equal(f.adapter.kind, "working-records"); assert.equal(f.adapter.version, 1); assert.equal(snapshot.species.length, 2);
  const record = snapshot.species[0];
  assert.equal(record.id, first); assert.equal(record.assets.assetName, "Gruener Testkauz one");
  assert.equal(record.input.german, "Manuelle Originalart one"); assert.equal(record.input.size, "41 cm");
  assert.equal(record.generated["Größe"], "40 cm"); assert.deepEqual(record.input.unknownManual, { retain: true });
  assert.equal(record.editorial.generalSectionId, "original-general"); assert.equal(record.editorial.embeddedGeneralText, f.generals.get(first));
  assert.equal(record.assets.portraitMetadata.prompt, "Private original prompt one");
  assert.deepEqual(record.assessmentBinding, f.source.assessmentBindings[record.assets.assetName]);
  assert.equal(snapshot.evidence.sources.assetsRoot.sha256, hash(canonicalJson(f.assetsRoot)));
  assert.equal(await f.adapter.verifySpecies(snapshot, first), true); assert.equal(await f.adapter.verifySpecies(snapshot, second), true);
  assert.deepEqual(await originals(f), before); assert.deepEqual((await fs.readdir(f.root)).sort(), [...Object.values(files), "species-assets"].sort());
});

test("a locally created species without a bound website entry is included with its actual files and without public URLs", async (t) => {
  const f = await fixture(t), before = await originals(f);
  f.catalog.species = f.catalog.species.filter((species) => species.id !== second);
  const result = await f.adapter.read();
  assert.deepEqual(result.species.map((record) => record.id), [first, second]);
  const local = result.species[1];
  assert.equal(local.generated["Wissenschaftlicher Name"], "Strix two");
  assert.deepEqual(local.editorial, { websiteUrl: null, sections: [], gallery: [], generalSectionId: null, embeddedGeneralText: null });
  assert.equal(local.assets.files["map.jpg"].sha256, hash("fixture-two:map"));
  assert.ok(Object.values(local.assets.files).every((file) => file.url === undefined));
  assert.equal(await f.adapter.verifySpecies(result, second), true);
  assert.deepEqual(await originals(f), before);
});

test("only the five fixed root JSON paths and the fixed asset root are used regardless of extra options", async (t) => {
  const f = await fixture(t), other = path.join(f.root, "unrelated"); await fs.mkdir(other);
  for (const filename of Object.values(files)) await fs.writeFile(path.join(other, filename), "invalid decoy");
  let reads = 0;
  const adapter = createLocalWorkingImportSource({ repoRoot: f.root, assetsRoot: other, sourceFiles: { speciesList: path.join(other, "species_list.json") },
    readCatalog: async () => { reads++; return Buffer.from(JSON.stringify(f.catalog)); } });
  const result = await adapter.read(); assert.equal(reads, 1); assert.equal(result.species[0].input.size, "41 cm");
  assert.equal(result.evidence.sources.assetsRoot.sha256, hash(canonicalJson(f.assetsRoot)));
  for (const repoRoot of ["relative", "\\\\server\\share", "file:///C:/project", "C:\\nul\0name"]) {
    assert.throws(() => createLocalWorkingImportSource({ repoRoot, readCatalog: async () => Buffer.from("{}") }), { code: "invalid_local_working_source_config" });
  }
});

test("default catalog reader refuses an arbitrary local replacement instead of adopting its bytes", async (t) => {
  const f = await fixture(t), directory = path.join(f.root, "mobile", "assets"); await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "catalog.json"), JSON.stringify(f.catalog));
  await assert.rejects(createLocalWorkingImportSource({ repoRoot: f.root }).read(), { code: "working_source_unavailable" });
});

test("missing or ambiguous generated general suffixes and ambiguous generated identities block preparation", async (t) => {
  for (const change of ["missing", "ambiguous", "modified-suffix", "duplicate-generated"]) {
    await t.test(change, async (t) => {
      const f = await fixture(t), sections = f.catalog.species[0].sections;
      if (change === "missing") sections[0].text = "Only human text without a generated block";
      if (change === "ambiguous") sections.push({ ...sections[0], id: "second-general" });
      if (change === "modified-suffix") sections[0].text += "\nChanged old generated value";
      if (change === "duplicate-generated") {
        f.source.speciesData.push(structuredClone(f.source.speciesData[0]));
        await fs.writeFile(path.join(f.root, files.speciesData), JSON.stringify(f.source.speciesData));
      }
      await assert.rejects(f.adapter.read(), { code: "working_source_unavailable" });
    });
  }
});

test("a general section consisting only of exact generated values is bound without inferring manual fields", async (t) => {
  const f = await fixture(t); f.catalog.species[0].sections[0].text = f.generals.get(first);
  const result = await f.adapter.read(); assert.equal(result.species[0].editorial.embeddedGeneralText, f.generals.get(first));
  assert.equal(result.species[0].input.english, "Manual original name"); assert.equal(result.species[0].input.size, "41 cm");
});

test("changing a later root JSON while the first file is read is detected by the initial whole-block binding", async (t) => {
  const f = await fixture(t), firstFile = path.join(f.root, files.speciesList), laterFile = path.join(f.root, files.assessmentBindings), realOpen = fs.open;
  let changed = false;
  t.mock.method(fs, "open", async (...args) => {
    const handle = await realOpen(...args); if (args[0] !== firstFile) return handle;
    return new Proxy(handle, { get(object, key) {
      if (key === "read") return async (...readArgs) => { const result = await object.read(...readArgs); if (!changed) { changed = true; await fs.appendFile(laterFile, " "); } return result; };
      const value = Reflect.get(object, key); return typeof value === "function" ? value.bind(object) : value;
    } });
  });
  await assert.rejects(f.adapter.read(), { code: "working_source_unavailable" }); assert.equal(changed, true);
});

test("changing an already read root file during catalog reading invalidates the final batch check", async (t) => {
  const f = await fixture(t); let changed = false;
  f.setReader(async () => { changed = true; await fs.appendFile(path.join(f.root, files.speciesList), " "); return Buffer.from(JSON.stringify(f.catalog)); });
  await assert.rejects(f.adapter.read(), { code: "working_source_unavailable" }); assert.equal(changed, true);
});

test("every fixed source is required and malformed JSON, invalid UTF-8 and oversized files are rejected", async (t) => {
  for (const change of ["missing", "invalid-json", "invalid-utf8", "oversized", "directory-slot", "unbounded-catalog", "catalog-object"]) {
    await t.test(change, async (t) => {
      const f = await fixture(t), filename = path.join(f.root, files.assessmentBindings);
      if (change === "missing") await fs.unlink(filename);
      if (change === "invalid-json") await fs.writeFile(filename, "not JSON");
      if (change === "invalid-utf8") await fs.writeFile(filename, Buffer.from([123, 34, 97, 34, 58, 34, 255, 34, 125]));
      if (change === "oversized") { const handle = await fs.open(filename, "w"); try { await handle.truncate(8 * 1024 * 1024 + 1); } finally { await handle.close(); } }
      if (change === "directory-slot") { await fs.unlink(filename); await fs.mkdir(filename); }
      if (change === "unbounded-catalog") f.setReader(async () => Buffer.alloc(5 * 1024 * 1024 + 1));
      if (change === "catalog-object") f.setReader(async () => f.catalog);
      await assert.rejects(f.adapter.read(), { code: "working_source_unavailable" });
    });
  }
});

test("per-species verification reopens fixed global snapshots and detects later source or file changes", async (t) => {
  const f = await fixture(t), snapshot = await f.adapter.read();
  await fs.appendFile(path.join(f.assetPaths.get(second), "map.jpg"), "new source bytes");
  assert.equal(await f.adapter.verifySpecies(snapshot, first), true);
  await assert.rejects(f.adapter.verifySpecies(snapshot, second), { code: "working_species_changed" });
  f.source.speciesList[0].size = "42 cm"; await fs.writeFile(path.join(f.root, files.speciesList), JSON.stringify(f.source.speciesList));
  await assert.rejects(f.adapter.verifySpecies(snapshot, first), { code: "working_source_changed" });
});

test("linked project ancestors and linked root JSON files are not adopted", async (t) => {
  for (const kind of ["directory", "file"]) {
    await t.test(kind, async (t) => {
      const f = await fixture(t), linkedRoot = path.join(f.root, "linked-root"), filename = path.join(f.root, files.assessmentBindings), target = path.join(f.root, "synthetic-link-target.json");
      if (kind === "file") { await fs.rename(filename, target); }
      try { await fs.symlink(kind === "directory" ? f.root : target, kind === "directory" ? linkedRoot : filename, kind === "directory" ? process.platform === "win32" ? "junction" : "dir" : "file"); }
      catch (error) { if (["EPERM", "EACCES"].includes(error.code)) { t.skip("The Windows test context cannot create this symbolic fixture."); return; } throw error; }
      const adapter = kind === "directory" ? createLocalWorkingImportSource({ repoRoot: linkedRoot, readCatalog: async () => Buffer.from(JSON.stringify(f.catalog)) }) : f.adapter;
      await assert.rejects(adapter.read(), { code: "working_source_unavailable" });
    });
  }
});
