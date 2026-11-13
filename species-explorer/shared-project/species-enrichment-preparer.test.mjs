import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { createManagedTempSession } from "../temp-session.mjs";
import { createTestJpeg, createTestWebp } from "../server-test-fixtures.mjs";
import { resolveFfmpegPath } from "../../scripts/spectrogram-renderer.mjs";
import { createSpeciesEnrichmentPreparer } from "./species-enrichment-preparer.mjs";
import { createSharedProjectClientStore } from "./client-store.mjs";
import { speciesEnrichmentSourceBindings } from "./species-enrichment.mjs";
import { digest, objectJson } from "./security.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const revision = "11111111-1111-4111-8111-111111111111", projectId = "fn-shared-project";
const quiet = { log() {}, warn() {}, error() {} };
let encodedSound;
const input = { german: "Amsel", english: "Blackbird", genus: "Turdus", species: "merula", size: "24 cm", weight: "100 g", life_expectancy: "3 Jahre",
  privateInput: { preserve: true } };
const generated = () => ({ URLSlug: "turdusmerula", "Wissenschaftlicher Name": "Turdus merula", "Deutscher Name": "Amsel", "Englischer Name": "Blackbird",
  "Assessment ID": 123, Status: "LC", Kategorie: "Nicht gefährdet", Trend: "Stabil", Class: "Aves", Genus: "Turdus", Species: "merula",
  unknownSource: { preserve: true } });
function object({ fresh = false } = {}) {
  return { kind: "species", id: "turdusmerula", revision, ordinal: 1, localPending: false, localConflict: false, approval: "draft", approvedRevision: null,
    data: { type: "fn-species-record", schemaVersion: 1, id: "turdusmerula", input: structuredClone(input), generated: fresh ? null : generated(),
      taxonomyOverride: null, assessmentBinding: fresh ? null : 123,
      assets: { assetName: "Historische Amsel", files: {}, overrides: fresh ? {} : { sound: { manual: true } },
        credits: fresh ? null : { source: "Eigene Aufnahme", unknownCredit: { preserve: true } }, portraitMetadata: null },
      editorial: { websiteUrl: null, sections: [], gallery: [], generalSectionId: null, embeddedGeneralText: null } } };
}

async function fixture(t, { fresh = false, incomplete = false, sourceChanged = false, omitOptional = false, assessment = 123,
  alternateSound = false, prepareOptions = {} } = {}) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "shared-enrichment-preparer-")), sessions = [], requests = [], reads = [], messages = [], original = object({ fresh });
  t.after(async () => { assertTestTempPath(root); await fs.rm(root, { recursive: true, force: true }); });
  if (omitOptional) for (const key of ["english", "size", "weight", "life_expectancy"]) delete original.data.input[key];
  if (!fresh) { original.data.assessmentBinding = assessment; original.data.generated["Assessment ID"] = assessment; }
  if (alternateSound) {
    original.data.assets.overrides.sound.manual = false;
    original.data.assets.credits = { source: "xeno-canto", url: "https://xeno-canto.org/1", rejectionKey: "xeno-canto:1",
      license: "https://creativecommons.org/licenses/by-nc/4.0/", unknownCredit: { preserve: true } };
  }
  if (!encodedSound) {
    const audio = path.join(root, "encoded-sound.mp3");
    await promisify(execFile)(resolveFfmpegPath({ repoRoot }), ["-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1", "-f", "lavfi", "-i",
      "sine=frequency=880:sample_rate=44100:duration=0.3", "-c:a", "libmp3lame", "-threads", "1", "-b:a", "128k", "-id3v2_version", "0",
      "-write_xing", "0", "-f", "mp3", audio], { windowsHide: true, timeout: 15_000, killSignal: "SIGKILL", maxBuffer: 64 * 1024 });
    encodedSound = await fs.readFile(audio);
  }
  const buffers = { "map.jpg": createTestJpeg(1600, 1200), "sound.mp3": Buffer.from(encodedSound), "portrait.webp": createTestWebp(1), "spectrogram.webp": createTestWebp(2) };
  if (!fresh) for (const [slot, buffer] of Object.entries(buffers)) original.data.assets.files[slot] = {
    id: `${original.id}:asset:${slot}`, sha256: digest(buffer), bytes: buffer.length,
    mimeType: slot === "map.jpg" ? "image/jpeg" : slot === "sound.mp3" ? "audio/mpeg" : "image/webp",
  };
  const before = objectJson(original.data), expected = speciesEnrichmentSourceBindings(original, projectId);
  let allowed = true;
  const assertCurrent = async binding => { assert.deepEqual(binding, expected); return allowed; };
  const fetch = async url => {
    requests.push(String(url));
    if (sourceChanged) allowed = false;
    const parsed = new URL(url);
    if (parsed.pathname === "/api/v4/taxa/scientific_name") return Response.json(incomplete ? { taxon: null } : {
      taxon: { scientific_name: "Turdus merula", kingdom_name: "ANIMALIA", phylum_name: "CHORDATA", subphylum_name: "VERTEBRATA",
        class_name: "AVES", order_name: "PASSERIFORMES", family_name: "TURDIDAE", genus_name: "Turdus", species_name: "merula" },
      assessments: [{ assessment_id: 123, red_list_category_code: "LC", year_published: 2026, scopes: [{ description: { en: "Global" } }] }],
    });
    if (parsed.pathname === "/api/v4/assessment/123") return Response.json({ population_trend: { description: { en: "Stable" } },
      red_list_category: { code: "LC" }, supplementary_info: { population_size: "1000", generational_length: 4 } });
    if (parsed.hostname === "xeno-canto.org") return Response.json({ numPages: 1, recordings: [{ id: "42", file: "https://audio.example/42.mp3",
      lic: "https://creativecommons.org/licenses/by/4.0/", rec: "Fixture recordist", cnt: "Fixture country", loc: "Fixture site", q: "A" }] });
    if (parsed.hostname === "audio.example") return new Response(alternateSound
      ? Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 1, 0]), buffers["sound.mp3"]]) : buffers["sound.mp3"]);
    if (parsed.pathname.endsWith("/distribution_map/jpg")) return new Response(buffers["map.jpg"], { headers: { "content-type": "image/jpeg" } });
    assert.fail(`Unexpected provider request: ${parsed.origin}${parsed.pathname}`);
  };
  const preparer = createSpeciesEnrichmentPreparer({ repoRoot, fetch, iucnToken: "fixture-iucn", xenoToken: "fixture-xeno", assertCurrent,
    readNormalFile: async request => { assert.deepEqual(request.sourceBindings, expected); reads.push(request.slot); return Buffer.from(buffers[request.slot]); },
    sleep: async () => {}, logger: { log: message => messages.push(message), warn: message => messages.push(message), error: message => messages.push(message) },
    createSession: async () => { const session = await createManagedTempSession({ repoRoot: root }); sessions.push(session.root); return session; },
    ...prepareOptions });
  return { root, original, expected, before, preparer, requests, reads, sessions, buffers, messages,
    async prepare(extra = {}) { return preparer.prepare({ speciesObject: original, projectId, expectedSourceBindings: expected, ...extra }); },
    async closed() { for (const session of sessions) await assert.rejects(fs.stat(session), { code: "ENOENT" }); assert.equal(objectJson(original.data), before); },
    deny() { allowed = false; } };
}

test("Gemeinsamer Einartlauf verwendet echte Quellenadapter, erhält Ausgangsrecord und schließt eigene Dateien", async t => {
  const f = await fixture(t), result = await f.prepare();
  assert.equal(result.complete, true);
  assert.equal(result.run.fetched, true);
  assert.equal(result.run.usedExistingData, false);
  assert.equal(result.media.length, 0);
  assert.equal(result.data.assets.assetName, "Historische Amsel");
  assert.deepEqual(result.data.generated.unknownSource, { preserve: true });
  assert.deepEqual(result.data.input, input);
  assert.deepEqual(result.data.assets, f.original.data.assets);
  assert.equal(result.data.generated.Class, "Aves");
  assert.equal(result.persistentCandidate, false);
  assert.equal(result.sharedProjectWrites, "not-performed");
  assert.equal(result.externalPublication, "not-performed");
  assert.equal(f.requests.length, 2);
  assert.equal(f.reads.length, 4);
  await f.closed();
});

test("der echte Einart-Vorbereiter übergibt Vorschlag und Medien an die persönliche dauerhafte Ablage", async t => {
  const f = await fixture(t, { fresh: true }), result = await f.prepare();
  assert.ok(result.complete && result.media.length > 0);
  await f.closed();
  const store = createSharedProjectClientStore({ filename: path.join(f.root, "cache.sqlite"), localStorageConfirmed: true });
  try {
    const baseUrl = "https://fixture.invalid", user = { id: "user-a", username: "owner", displayName: "Owner", role: "admin" };
    const bound = store.bind({ baseUrl, projectId, user });
    store.saveObjects(bound.id, [f.original]);
    const saved = store.speciesEnrichment.save(bound.id, result, { baseUrl, projectId, userId: user.id, role: user.role, userVersion: null });
    const read = store.speciesEnrichment.read(bound.id, saved.candidateId);
    assert.deepEqual(read.data, result.data);
    assert.deepEqual(read.media.map(item => [item.slot, digest(item.buffer)]).sort(), result.media.map(item => [item.slot, digest(item.buffer)]).sort());
  } finally { store.close(); }
});

test("Neuer gemeinsamer Entwurf erhält reale Karte, Ton, Spektrogramm und gehashte Credits als RAM-Kandidaten", async t => {
  const f = await fixture(t, { fresh: true }), result = await f.prepare();
  assert.equal(result.complete, true);
  assert.equal(result.run.soundStatus, "ok");
  assert.equal(result.run.mapStatus, "ok", JSON.stringify(f.messages));
  assert.deepEqual(result.media.map(item => item.slot).sort(), ["credits.json", "map.jpg", "sound.mp3", "spectrogram.webp"]);
  assert.equal(f.reads.length, 0);
  for (const item of result.media) {
    assert.ok(Buffer.isBuffer(item.buffer));
    assert.equal(item.metadata.sha256, digest(item.buffer));
    assert.equal(item.metadata.bytes, item.buffer.length);
    assert.equal(result.data.assets.files[item.slot].sha256, item.metadata.sha256);
  }
  const credits = JSON.parse(result.media.find(item => item.slot === "credits.json").buffer.toString("utf8"));
  assert.equal(credits.recordist, "Fixture recordist");
  assert.deepEqual(result.data.assets.credits, credits);
  assert.equal(result.data.assessmentBinding, 123);
  assert.deepEqual(result.data.input, input);
  await f.closed();
});

test("Ein tatsächlicher unvollständiger Abruf erhält brauchbare Altdaten und sämtliche vorhandenen Medien", async t => {
  const f = await fixture(t, { incomplete: true }), result = await f.prepare();
  assert.equal(result.run.usedExistingData, true);
  assert.ok(result.issues.some(issue => issue.code === "species_enrichment_data_retained" && issue.blocking === false));
  assert.equal(result.data.generated["Assessment ID"], 123);
  assert.deepEqual(result.data.generated.unknownSource, { preserve: true });
  assert.equal(result.media.length, 0);
  assert.deepEqual(result.data.assets, f.original.data.assets);
  await f.closed();
});

test("Geänderte Art-/Personenbindung stoppt vor Sitzung und vor Quellenzugriff", async t => {
  const f = await fixture(t); f.deny();
  await assert.rejects(f.prepare(), { code: "species_enrichment_source_changed" });
  assert.equal(f.sessions.length, 0);
  assert.deepEqual(f.requests, []);
  await f.closed();
});

test("Rollen-/Quellenwechsel während eines Abrufs liefert keinen Kandidaten und schließt eigene Dateien", async t => {
  const f = await fixture(t, { sourceChanged: true });
  await assert.rejects(f.prepare(), { code: "species_enrichment_source_changed" });
  assert.equal(f.requests.length, 1);
  await f.closed();
});

test("Eine andere erwartete Objektfassung wird vor Quellenzugriff zurückgewiesen", async t => {
  const f = await fixture(t);
  await assert.rejects(f.prepare({ expectedSourceBindings: { ...f.expected, dataHash: "0".repeat(64) } }), { code: "species_enrichment_source_changed" });
  assert.equal(f.sessions.length, 0);
  assert.equal(f.requests.length, 0);
  await f.closed();
});

test("Falsche Originalbytes werden weder als geschützte Quelle kopiert noch still übersprungen", async t => {
  const f = await fixture(t, { prepareOptions: { readNormalFile: async () => Buffer.from("wrong original") } });
  await assert.rejects(f.prepare(), { code: "species_enrichment_file_changed" });
  assert.equal(f.requests.length, 0);
  await f.closed();
});

test("Fehlender Quellenzugang stoppt vor jeder Tempanlage, ohne Konfigurations- oder Anmeldedaten auszugeben", async t => {
  const f = await fixture(t, { prepareOptions: { iucnToken: "" } });
  await assert.rejects(f.prepare(), { code: "species_source_access_required" });
  assert.equal(f.sessions.length, 0);
  assert.equal(f.requests.length, 0);
  await f.closed();
});

test("Bestehende NC-Suche bleibt ein gezielter Tonlauf ohne Fachdaten-/Kartenabruf", async t => {
  const f = await fixture(t), result = await f.prepare({ mode: "nc-sounds" });
  assert.equal(result.run.fetched, false);
  assert.equal(result.media.length, 0);
  assert.deepEqual(f.requests, []);
  assert.deepEqual(result.data.generated, f.original.data.generated);
  await f.closed();
});

test("Dekodierfehler wird sichtbar und hinterlässt keine ungebundene Kandidatendatei", async t => {
  const f = await fixture(t, { prepareOptions: { audioDecode: async () => { throw new Error("fixture decode failed"); } } });
  await assert.rejects(f.prepare(), /fixture decode failed/);
  assert.equal(f.requests.length, 0);
  await f.closed();
});

test("Importierte Art ohne optionale manuelle Felder wird ergänzt, ohne fehlende Eingaben zu erfinden", async t => {
  const f = await fixture(t, { omitOptional: true }), result = await f.prepare();
  assert.equal(result.complete, true);
  assert.deepEqual(result.data.input, f.original.data.input);
  assert.equal(Object.hasOwn(result.data.input, "english"), false);
  assert.equal(result.data.generated["Assessment ID"], 123);
  await f.closed();
});

test("Neu bestätigte Assessmentbindung erhält den tatsächlichen Kartenbeleg auch bei identischen Bildbytes", async t => {
  const f = await fixture(t, { assessment: 122 }), result = await f.prepare();
  assert.equal(result.complete, true);
  assert.equal(result.data.assessmentBinding, 123);
  assert.deepEqual(result.media.map(item => item.slot), ["map.jpg"]);
  assert.equal(result.media[0].metadata.sha256, f.original.data.assets.files["map.jpg"].sha256);
  await f.closed();
});

test("Neue MP3-Metadaten behalten den frisch gerenderten Spektrogrammbeleg bei identischen Bildbytes", async t => {
  let f;
  f = await fixture(t, { alternateSound: true, prepareOptions: { renderSpectrum: async ({ outputPath }) => {
    await fs.writeFile(outputPath, f.buffers["spectrogram.webp"]);
  } } });
  const result = await f.prepare({ mode: "nc-sounds" });
  assert.equal(result.complete, true);
  assert.ok(result.media.some(item => item.slot === "sound.mp3"));
  const spectrum = result.media.find(item => item.slot === "spectrogram.webp");
  assert.ok(spectrum);
  assert.equal(spectrum.metadata.sha256, f.original.data.assets.files["spectrogram.webp"].sha256);
  assert.deepEqual(result.data.assets.credits.unknownCredit, { preserve: true });
  await f.closed();
});

test("Abbruch eines nach Headern hängenden Körpers schließt Stream und eigene Tempoperation", async t => {
  let headersReady, cancelled = false;
  const ready = new Promise(resolve => { headersReady = resolve; }), controller = new AbortController();
  const f = await fixture(t, { prepareOptions: { fetch: async () => new Response(new ReadableStream({
    start() { headersReady(); }, cancel() { cancelled = true; },
  })) } });
  const operation = f.prepare({ signal: controller.signal });
  const rejected = assert.rejects(operation, { code: "species_enrichment_cancelled" });
  await ready; controller.abort(); await rejected;
  assert.equal(cancelled, true);
  await f.closed();
});

test("close beendet laufende Vorbereitung und wartet die tatsächliche Aufräumung ab", async t => {
  let headersReady;
  const ready = new Promise(resolve => { headersReady = resolve; });
  const f = await fixture(t, { prepareOptions: { fetch: async () => new Response(new ReadableStream({ start() { headersReady(); } })) } });
  const operation = f.prepare();
  const rejected = assert.rejects(operation, { code: "species_enrichment_cancelled" });
  await ready;
  assert.deepEqual(await f.preparer.close(), { closed: true, pending: 0 });
  await rejected; await f.closed();
  await assert.rejects(f.prepare(), { code: "species_enrichment_closed" });
});
