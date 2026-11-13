import assert from "node:assert/strict";
import nativeFs from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { assertTestTempPath, tmpdir } from "./test-temp.mjs";
import { createSpeciesSoundPipeline } from "./species-sound-pipeline.mjs";

const openLicense = "https://creativecommons.org/licenses/by/4.0/";
const ncLicense = "https://creativecommons.org/licenses/by-nc-sa/4.0/";
function mp3(marker = 0) {
  const frame = Buffer.alloc(417, marker); Buffer.from([0xff, 0xfb, 0x90, 0x64]).copy(frame);
  return Buffer.concat([frame, frame, frame]);
}
const recording = (id, license = openLicense) => ({ id: String(id), file: `https://audio.example/${id}.mp3`, lic: license,
  rec: "Synthetic recordist", cnt: "Fixture country", loc: "Fixture place", q: "A" });
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status,
  async json() { return data; }, async arrayBuffer() { return Buffer.from(data); } });
const fileSystemMethods = ["existsSync", "mkdirSync", "readFileSync", "writeFileSync", "renameSync", "unlinkSync"];

async function fixture(t, { registry = { version: 1, assets: {} }, fetchOverride, fileSystem = nativeFs } = {}) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "species-sound-pipeline-"));
  t.after(() => fs.rm(assertTestTempPath(root), { recursive: true, force: true, maxRetries: 3, retryDelay: 25 }));
  const calls = [], logs = [], errors = [], waits = []; let currentRegistry = registry, reads = 0;
  const pipeline = createSpeciesSoundPipeline({
    fetch: async (url, options) => {
      const parsed = new URL(url); calls.push({ url: parsed, method: options?.method || "GET" });
      const supplied = await fetchOverride?.(parsed, options); if (supplied !== undefined) return supplied;
      if (parsed.hostname === "xeno-canto.org") return response({ recordings: [], numPages: 1 });
      if (parsed.hostname === "commons.wikimedia.org") return response({ query: { pages: {} } });
      if (parsed.hostname === "api.inaturalist.org") return response({ results: [] });
      throw new Error(`Unexpected synthetic host: ${parsed.hostname}`);
    }, token: "synthetic-token", sleep: async ms => { waits.push(ms); }, sanitizeAssetName: value => String(value).replace(/ /g, "_"),
    speciesAssetDir: name => path.join(root, "owned-output", name), readAssetOverrides: () => { reads++; return currentRegistry; },
    logger: { log: value => logs.push(String(value)), warn: value => logs.push(String(value)), error: value => logs.push(String(value)) },
    logError: value => errors.push(value), fileSystem,
  });
  const directory = path.join(root, "owned-output", "Testkauz"), sound = path.join(directory, "sound.mp3"), credits = path.join(directory, "credits.json");
  return { root, directory, sound, credits, pipeline, calls, logs, errors, waits, registry,
    get reads() { return reads; }, setRegistry(value) { currentRegistry = value; },
    async seed(buffer, metadata) { await fs.mkdir(directory, { recursive: true }); await fs.writeFile(sound, buffer);
      if (metadata !== undefined) await fs.writeFile(credits, JSON.stringify(metadata)); },
    run: options => pipeline.downloadSoundIfMissing("Strix", "fixture", "Testkauz", options) };
}
const xenoCalls = f => f.calls.filter(call => call.url.hostname === "xeno-canto.org");
const audioCalls = f => f.calls.filter(call => call.url.hostname === "audio.example" && call.method !== "HEAD");
const xenoResponse = records => response({ recordings: records, numPages: 1 });

test("factory construction is inert and requires explicit source, output, fetch, sleep and sanitizer callbacks", () => {
  let reads = 0;
  const called = () => { reads++; throw new Error("Construction must not perform I/O"); };
  const options = { fetch: called, token: "synthetic-token", sleep: called, sanitizeAssetName: called, speciesAssetDir: called,
    readAssetOverrides: called, logError: called, logger: { log: called, warn: called, error: called },
    fileSystem: Object.fromEntries(fileSystemMethods.map(name => [name, called])) };
  const pipeline = createSpeciesSoundPipeline(options);
  assert.deepEqual(Object.keys(pipeline), ["downloadSoundIfMissing"]); assert.equal(reads, 0);
  for (const name of ["fetch", "sleep", "sanitizeAssetName", "speciesAssetDir", "readAssetOverrides"])
    assert.throws(() => createSpeciesSoundPipeline({ ...options, [name]: undefined }), TypeError);
  assert.equal(reads, 0);
});

test("the current injected manual-care registry protects existing bytes and reports missing credits without any search", async t => {
  const f = await fixture(t); const original = mp3(1); await f.seed(original, { license: openLicense });
  f.setRegistry({ version: 1, assets: { Testkauz: { sound: { manual: true, customCare: "preserved" } } } });
  assert.equal(await f.run(), "ok"); assert.equal(f.calls.length, 0); assert.deepEqual(await fs.readFile(f.sound), original);
  await fs.unlink(f.credits); assert.equal(await f.run(), "missing"); assert.equal(f.calls.length, 0);
  assert.ok(f.reads > 0); assert.match(f.logs.join("\n"), /Manuell gepflegter Sound.*geschützt/);
});

test("an existing open recording with credits remains byte-identical and performs no network calls", async t => {
  const f = await fixture(t), original = mp3(2), credits = { license: openLicense, unknownField: { retained: true } };
  await f.seed(original, credits); const before = await fs.readFile(f.credits);
  assert.equal(await f.run(), "ok"); assert.equal(f.calls.length, 0);
  assert.deepEqual(await fs.readFile(f.sound), original); assert.deepEqual(await fs.readFile(f.credits), before);
});

test("the first open Xeno stage writes exact MP3 bytes and unchanged detailed credits only into the caller's output", async t => {
  const bytes = mp3(3), candidate = recording(1), f = await fixture(t, { fetchOverride: url => {
    if (url.hostname === "xeno-canto.org") return xenoResponse([candidate]);
    if (url.hostname === "audio.example") return response(bytes);
  } });
  const sentinel = path.join(f.root, "species_list.json"); await fs.writeFile(sentinel, "unrelated source");
  assert.equal(await f.run(), "ok"); assert.deepEqual(await fs.readFile(f.sound), bytes);
  const credits = JSON.parse(await fs.readFile(f.credits, "utf8"));
  assert.deepEqual(credits, { scientific_name: "Strix fixture", german_name: "Testkauz", recordist: candidate.rec,
    country: candidate.cnt, location: candidate.loc, quality: "A", license: openLicense, source: "xeno-canto.org",
    url: "https://xeno-canto.org/1", rejectionKey: "xeno-canto:1",
    notes: 'Stage 0 (openOnly=true, q=A, len25-35=true) | query="gen:Strix sp:fixture q:A len:25-35" | page=1' });
  assert.equal(xenoCalls(f).length, 1); assert.equal(xenoCalls(f)[0].url.searchParams.get("key"), "synthetic-token");
  assert.deepEqual((await fs.readdir(f.directory)).sort(), ["credits.json", "sound.mp3"]);
  assert.equal(await fs.readFile(sentinel, "utf8"), "unrelated source");
});

test("a non-MP3 candidate is temporarily rejected and the next actual source is tried without changing persistent decisions", async t => {
  const registry = { version: 1, assets: { Testkauz: { sound: { rejectedSources: [] }, unknown: "kept" } } }, before = structuredClone(registry);
  const f = await fixture(t, { registry, fetchOverride: url => {
    if (url.hostname === "xeno-canto.org") return xenoResponse([recording(1), recording(2)]);
    if (url.hostname === "audio.example") return response(url.pathname === "/1.mp3" ? Buffer.from("RIFFxxxxWAVE invalid MP3") : mp3(4));
  } });
  assert.equal(await f.run(), "ok"); assert.deepEqual(audioCalls(f).map(call => call.url.pathname), ["/1.mp3", "/2.mp3"]);
  assert.deepEqual(registry, before); assert.equal(JSON.parse(await fs.readFile(f.credits, "utf8")).rejectionKey, "xeno-canto:2");
  assert.match(f.logs.join("\n"), /kein gültiges MP3/);
});

test("persistent normalized rejection keys skip the rejected recording before its file is downloaded", async t => {
  const registry = { version: 1, assets: { Testkauz: { sound: { rejectedSources: [{ key: " XENO-CANTO:1 ", reason: "own decision" }] } } } };
  const before = structuredClone(registry), f = await fixture(t, { registry, fetchOverride: url => {
    if (url.hostname === "xeno-canto.org") return xenoResponse([recording(1), recording(2)]);
    if (url.hostname === "audio.example") return response(mp3(5));
  } });
  assert.equal(await f.run(), "ok"); assert.deepEqual(audioCalls(f).map(call => call.url.pathname), ["/2.mp3"]);
  assert.deepEqual(registry, before); assert.match(f.logs.join("\n"), /Abgelehnte Soundquelle.*xeno-canto:1/);
});

test("new recordings search all six open Xeno stages, then Commons and iNaturalist, before the NC fallback", async t => {
  const f = await fixture(t, { fetchOverride: url => {
    if (url.hostname === "xeno-canto.org") return xenoResponse([recording(9, ncLicense)]);
    if (url.hostname === "audio.example") return response(mp3(6));
  } });
  assert.equal(await f.run(), "ok");
  const hosts = f.calls.map(call => call.url.hostname);
  assert.deepEqual(hosts, [...Array(6).fill("xeno-canto.org"), ...Array(3).fill("commons.wikimedia.org"),
    ...Array(3).fill("api.inaturalist.org"), "xeno-canto.org", "audio.example"]);
  assert.deepEqual(xenoCalls(f).map(call => call.url.searchParams.get("query")), ["gen:Strix sp:fixture q:A len:25-35", "gen:Strix sp:fixture q:A",
    "gen:Strix sp:fixture q:B len:25-35", "gen:Strix sp:fixture q:B", "gen:Strix sp:fixture q:C len:25-35", "gen:Strix sp:fixture q:C", "gen:Strix sp:fixture q:A len:25-35"]);
  const credits = JSON.parse(await fs.readFile(f.credits, "utf8")); assert.equal(credits.license, ncLicense); assert.match(credits.notes, /Stage 6 \(openOnly=false/);
});

test("a matching free Commons recording precedes iNaturalist and NC fallback and preserves its original provenance", async t => {
  const f = await fixture(t, { fetchOverride: (url, options) => {
    if (url.hostname === "commons.wikimedia.org") return response({ query: { pages: { "1": { title: "File:Strix_fixture.mp3",
      imageinfo: [{ url: "https://audio.example/commons.mp3", descriptionurl: "https://commons.wikimedia.org/wiki/File:Strix_fixture.mp3", mime: "audio/mpeg",
        extmetadata: { LicenseUrl: { value: openLicense }, Artist: { value: "Fixture artist" }, Credit: { value: "iNaturalist recording" } } }] } } } });
    if (url.hostname === "audio.example") return response(options?.method === "HEAD" ? null : mp3(7));
  } });
  assert.equal(await f.run(), "ok"); assert.equal(xenoCalls(f).length, 6); assert.equal(f.calls.some(call => call.url.hostname === "api.inaturalist.org"), false);
  const credits = JSON.parse(await fs.readFile(f.credits, "utf8"));
  assert.equal(credits.source, "Wikimedia Commons / iNaturalist"); assert.equal(credits.recordist, "Fixture artist");
  assert.equal(credits.rejectionKey, "wikimedia-commons:File:Strix_fixture.mp3"); assert.equal(credits.license, openLicense);
});

test("a free exact-species iNaturalist MP3 follows Commons and keeps observation, sound and license credits", async t => {
  const f = await fixture(t, { fetchOverride: (url, options) => {
    if (url.hostname === "api.inaturalist.org") return response({ results: [{ id: 42, uri: "https://www.inaturalist.org/observations/42",
      taxon: { name: "Strix fixture" }, user: { login: "fixture-user" }, quality_grade: "research", place_guess: "Fixture forest",
      sounds: [{ id: 77, file_url: "https://audio.example/inat.mp3", license_code: "cc-by", attribution: "Fixture attribution", file_content_type: "audio/mpeg" }] }] });
    if (url.hostname === "audio.example") return response(options?.method === "HEAD" ? null : mp3(8));
  } });
  assert.equal(await f.run(), "ok"); assert.equal(xenoCalls(f).length, 6);
  const credits = JSON.parse(await fs.readFile(f.credits, "utf8"));
  assert.equal(credits.source, "iNaturalist"); assert.equal(credits.license, openLicense); assert.equal(credits.rejectionKey, "inaturalist:42:77");
  assert.equal(credits.recordist, "Fixture attribution"); assert.equal(credits.location, "Fixture forest"); assert.match(credits.notes, /Observation=42.*sound=77/);
});

test("an existing NC recording is retained byte-for-byte when no free replacement exists, without trying another NC candidate", async t => {
  const f = await fixture(t), original = mp3(9); await f.seed(original, { license: ncLicense, custom: "kept" });
  const before = await fs.readFile(f.credits);
  assert.equal(await f.run(), "ok"); assert.equal(xenoCalls(f).length, 6); assert.equal(audioCalls(f).length, 0);
  assert.deepEqual(await fs.readFile(f.sound), original); assert.deepEqual(await fs.readFile(f.credits), before);
  assert.match(f.logs.join("\n"), /vorhandener NC-Sound bleibt erhalten/);
});

test("forced alternatives exclude the current credit source and may use NC only after every free provider", async t => {
  const f = await fixture(t, { fetchOverride: url => {
    if (url.hostname === "xeno-canto.org") return xenoResponse([recording(1, ncLicense), recording(2, ncLicense)]);
    if (url.hostname === "audio.example") return response(mp3(10));
  } });
  await f.seed(mp3(1), { source: "xeno-canto.org", license: ncLicense, url: "https://xeno-canto.org/1" });
  assert.equal(await f.run({ forceAlternativeSearch: true }), "ok");
  assert.deepEqual(audioCalls(f).map(call => call.url.pathname), ["/2.mp3"]);
  assert.equal(JSON.parse(await fs.readFile(f.credits, "utf8")).rejectionKey, "xeno-canto:2");
  assert.match(f.logs.join("\n"), /Weitere Soundalternative gefunden.*Stage 6/);
});

test("locked destinations preserve old sound and credits, retry bounded renames and stop before other sources", async t => {
  let attempts = 0; const f = await fixture(t, { fileSystem: { ...nativeFs, renameSync() { attempts++; throw Object.assign(new Error("Synthetic file lock"), { code: "EBUSY" }); } },
    fetchOverride: url => url.hostname === "xeno-canto.org" ? xenoResponse([recording(2)]) : url.hostname === "audio.example" ? response(mp3(11)) : undefined });
  const original = mp3(1); await f.seed(original, { license: ncLicense }); const before = await fs.readFile(f.credits);
  assert.equal(await f.run(), "locked"); assert.equal(attempts, 5); assert.deepEqual(f.waits, [250, 500, 750, 1000, 1250]);
  assert.deepEqual(await fs.readFile(f.sound), original); assert.deepEqual(await fs.readFile(f.credits), before);
  assert.deepEqual((await fs.readdir(f.directory)).sort(), ["credits.json", "sound.mp3"]);
  assert.equal(xenoCalls(f).length, 1); assert.match(f.errors.join("\n"), /Datei gesperrt/);
});

test("a credits failure after audio replacement reports the existing partial-write error instead of silently trying another candidate", async t => {
  const replacement = mp3(12), f = await fixture(t, { fileSystem: { ...nativeFs, writeFileSync(filename, ...args) {
    if (path.basename(filename) === "credits.json") throw Object.assign(new Error("Synthetic credits failure"), { code: "EACCES" });
    return nativeFs.writeFileSync(filename, ...args);
  } }, fetchOverride: url => url.hostname === "xeno-canto.org" ? xenoResponse([recording(2)]) : url.hostname === "audio.example" ? response(replacement) : undefined });
  await f.seed(mp3(1), { license: ncLicense, prior: true }); const before = await fs.readFile(f.credits);
  assert.equal(await f.run(), "error"); assert.deepEqual(await fs.readFile(f.sound), replacement); assert.deepEqual(await fs.readFile(f.credits), before);
  assert.equal(audioCalls(f).length, 1); assert.match(f.errors.join("\n"), /Synthetic credits failure/);
});

test("candidate retries stay bounded per stage and continue to the next stage without re-downloading rejected sources", async t => {
  const f = await fixture(t, { fetchOverride: url => {
    if (url.hostname === "xeno-canto.org") return xenoResponse(Array.from({ length: 14 }, (_, index) => recording(index + 1)));
    if (url.hostname === "audio.example") return response(url.pathname === "/14.mp3" ? mp3(13) : Buffer.from("not MP3"));
  } });
  assert.equal(await f.run(), "ok"); const queries = xenoCalls(f).map(call => call.url.searchParams.get("query"));
  assert.equal(queries.filter(query => query.endsWith("len:25-35")).length, 12); assert.equal(queries.filter(query => query === "gen:Strix sp:fixture q:A").length, 2);
  assert.equal(new Set(audioCalls(f).map(call => call.url.pathname)).size, 14); assert.equal(audioCalls(f).length, 14);
  assert.match(f.logs.join("\n"), /Zu viele nicht übernehmbare Xeno-Canto-Kandidaten/);
});
