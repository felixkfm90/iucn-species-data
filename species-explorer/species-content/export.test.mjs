import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir, assertTestTempPath, closeEmptyTestTempSession } from "../../scripts/test-temp.mjs";
import { parseWebsiteEditorialPage, canonicalWebsiteImageSource } from "../website-alt-parser.mjs";
import { buildSpeciesContent, readSpeciesMedia, exportSpeciesCatalog, createSpeciesImportPlan, selectSpeciesPageUrls } from "./export.mjs";
import { captureSpeciesPages } from "./capture.mjs";
import { validateSpeciesSnapshot } from "./validate.mjs";
import { buildCatalog } from "../shared-project/catalog.mjs";
import { buildPublicCatalogRelease, readPublicCatalogBaseline, selectPublicCatalogSpecies,
  verifyPublicCatalogCandidate } from "../../mobile/tool/stage-public-catalog.mjs";
import { BUNDLED_SPECIES_SOURCE } from "./bundled.mjs";

const fixtures = new URL("./fixtures/", import.meta.url);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const record = (slug = "fixtureowl") => ({ URLSlug: slug, "Wissenschaftlicher Name": "Strix fixture", "Deutscher Name": "Testkauz",
  "Größe": "12-14 cm", "Gewicht": "30 g", "Lebenserwartung": "4 Jahre", "Status": "LC", "Trend": "Stabil",
  Kingdom: "Animalia", Genus: "Strix", Species: "fixture" });
const localMedia = () => ({ media: { portrait: { id: "fixture:portrait", url: "https://felixkfm90.github.io/iucn-species-data/species-assets/Testkauz/portrait.webp" },
  map: { id: "fixture:map", url: "https://felixkfm90.github.io/iucn-species-data/species-assets/Testkauz/map.jpg" }, sounds: [], gallery: [] }, files: [], issues: [] });
const html = '<main><div class="sqs-block-html" id="heading"><h3>Testkauz</h3><h4>Allgemein</h4></div><div class="sqs-block-html" id="body"><h4>Lebensraum</h4><p>Erster Absatz.</p><p>Zweiter Absatz mit <strong>Hervorhebung</strong>.</p><ul><li>Ein Listenpunkt</li></ul><h4>Verbreitungskarte</h4></div></main>';
const pageUrl = "https://www.fnwildlifetravel.de/wildlife/heimische-tierwelt/fixtureowl";
const baselineFor = (catalog, source = "published") => ({ source, sha256: digest(`${JSON.stringify(catalog)}\n`), catalog });

test("structured general values, full species rank and every editorial heading/paragraph/list are preserved", () => {
  const result = buildSpeciesContent({ record: record(), pageUrl, html, localMedia: localMedia() });
  assert.equal(result.complete, true);
  assert.equal(result.data.taxonomy.find((entry) => entry.rank === "species").name, "Strix fixture");
  assert.match(result.data.sections.find((entry) => entry.title === "Allgemein").text, /Größe: 12-14 cm/);
  assert.deepEqual(result.data.sections.map((entry) => entry.title), ["Testkauz", "Allgemein", "Lebensraum", "Verbreitungskarte"]);
  assert.equal(result.data.sections[2].text, "Erster Absatz.\n\nZweiter Absatz mit Hervorhebung.\n\n• Ein Listenpunkt");
  assert.equal(result.data.sections[0].intentionallyEmpty, true);
  assert.equal(result.data.sections[3].intentionallyEmpty, true);
  assert.deepEqual(result.data.media.sounds, []);
  assert.equal(result.evidence.soundState, "no-existing-recording");
});

test("unassigned text and unknown empty sections stay explicitly incomplete and prevent an import proposal", () => {
  const result = buildSpeciesContent({ record: record(), pageUrl,
    html: '<main><div class="sqs-block-html" id="unassigned"><h4>Fachthema</h4><span>Nicht als Absatz erfasster Text</span><h4>Offene Rubrik</h4></div></main>', localMedia: localMedia() });
  assert.equal(result.complete, false);
  assert.ok(result.issues.some((entry) => entry.code === "unassigned-editorial-text"));
  assert.ok(result.issues.some((entry) => entry.code === "empty-editorial-section"));
  assert.throws(() => createSpeciesImportPlan({ complete: false, catalog: { species: [result.data] }, speciesCount: 1 }));
});

test("App-Freigabe bindet jedes Spektrogramm an die veröffentlichte Tonaufnahme und seine exakten Bytes", async () => {
  const source = record();
  const media = localMedia();
  const soundSha256 = digest("sound"), spectrogramSha256 = digest("spectrum");
  Object.assign(media.media.portrait, { sha256: digest("portrait"), bytes: 8, mimeType: "image/webp" });
  Object.assign(media.media.map, { sha256: digest("map"), bytes: 3, mimeType: "image/jpeg" });
  media.media.sounds.push({ id: "fixture:sound", url: media.media.portrait.url.replace("portrait.webp", "sound.mp3"),
    sha256: soundSha256, bytes: 5, mimeType: "audio/mpeg" });
  media.files.push({ path: "Testkauz/spectrogram.webp", role: "derived-spectrogram-not-in-v1-media-schema",
    bytes: 8, sha256: spectrogramSha256 }, { path: "Testkauz/credits.json", bytes: 2, sha256: digest("{}") });
  const result = buildSpeciesContent({ record: source, pageUrl, html, localMedia: media });
  const catalog = buildCatalog({ revision: "a".repeat(64), generatedAt: "2026-11-12T12:00:00.000Z", species: [result.data] });
  const { speciesData, pending } = selectPublicCatalogSpecies([source, record("noch-ohne-artseite")], [{ url: pageUrl }], catalog);
  assert.deepEqual(pending, ["noch-ohne-artseite"]);
  const verified = [];
  const binding = { stale: false, soundSha256, spectrogramSha256 };
  const options = { snapshot: { complete: true, catalog, results: [{ slug: source.URLSlug, evidence: result.evidence }] },
    speciesData, pages: new Map([[source.URLSlug, { url: pageUrl, html }]]),
    mediaRegistry: { assets: { Testkauz: { spectrogram: binding } } }, async verifyMedia(item) { verified.push(item.id); } };
  const staged = await buildPublicCatalogRelease(options);
  const expectedMedia = ["fixture:map", "fixture:portrait", "fixture:sound", "fixtureowl:credits.json", "fixtureowl:spectrogram"];
  assert.deepEqual(verified.sort(), expectedMedia);
  const emitted = JSON.parse(staged.bytes);
  assert.equal(emitted.species[0].media.spectrogram.sha256, spectrogramSha256);
  assert.equal(emitted.species[0].media.spectrogram.url, media.media.portrait.url.replace("portrait.webp", "spectrogram.webp"));
  assert.equal(staged.manifest.catalogSha256, digest(staged.bytes));
  assert.equal(staged.manifest.revision, emitted.revision);
  const previousSpecies = [Object.fromEntries(Object.entries(emitted.species[0]).reverse())];
  const previous = { ...emitted, species: previousSpecies, revision: digest(`${JSON.stringify(previousSpecies)}\n`),
    generatedAt: "2026-11-11T12:00:00.000Z" };
  const baseline = baselineFor(previous);
  const expectedDecision = { status: "unchanged", addedSpecies: [], changedSpecies: [], baseline: {
    source: "published", sha256: baseline.sha256, revision: previous.revision, generatedAt: previous.generatedAt, speciesCount: 1 } };
  verified.length = 0;
  const unchanged = await buildPublicCatalogRelease({ ...options, baseline });
  assert.deepEqual(verified.sort(), expectedMedia);
  assert.deepEqual(unchanged.decision, expectedDecision);
  assert.equal(unchanged.bytes, null);
  assert.equal(unchanged.manifest, null);
  const bundled = await buildPublicCatalogRelease({ ...options, baseline: baselineFor(previous, "bundled") });
  assert.deepEqual(bundled.decision, { ...expectedDecision, status: "candidate",
    baseline: { ...expectedDecision.baseline, source: "bundled" } });
  assert.equal(bundled.manifest.catalogSha256, staged.manifest.catalogSha256);

  const firstCommit = "a".repeat(40), laterCommit = "b".repeat(40), pinnedRequests = [];
  const pinOptions = { ...options, async verifyMedia(item) { if (item.pinned) pinnedRequests.push(item.url); } };
  const firstPin = await buildPublicCatalogRelease({ ...pinOptions, commit: firstCommit, baseline });
  const pinned = JSON.parse(firstPin.bytes), pinnedBaseline = baselineFor(pinned);
  const base = `https://raw.githubusercontent.com/felixkfm90/iucn-species-data/${firstCommit}/species-assets/Testkauz/`;
  const expectedPins = ["map.jpg", "portrait.webp", "sound.mp3", "spectrogram.webp"].map(name => `${base}${name}`);
  assert.deepEqual(pinnedRequests.sort(), expectedPins);
  assert.equal(firstPin.pinnedMediaChecked, 4);
  pinnedRequests.length = 0;
  const freshCatalog = { ...catalog, generatedAt: "2026-11-12T13:00:00.000Z" };
  const freshOptions = { ...pinOptions, snapshot: { ...options.snapshot, catalog: freshCatalog } };
  assert.equal((await buildPublicCatalogRelease({ ...freshOptions, commit: laterCommit, baseline: pinnedBaseline })).decision.status, "unchanged");
  assert.deepEqual(pinnedRequests.sort(), expectedPins);

  const priorPortrait = pinned.species[0].media.portrait;
  priorPortrait.sha256 = digest("old portrait");
  pinned.revision = digest(`${JSON.stringify(pinned.species)}\n`);
  const changedPin = await buildPublicCatalogRelease({ ...freshOptions, commit: laterCommit, baseline: baselineFor(pinned) });
  const updated = JSON.parse(changedPin.bytes).species[0].media;
  assert.equal(updated.portrait.url, `${base.replace(firstCommit, laterCommit)}portrait.webp`);
  assert.equal(updated.sounds[0].url, `${base}sound.mp3`);
  assert.equal(updated.spectrogram.url, `${base}spectrogram.webp`);

  binding.soundSha256 = digest("different sound");
  await assert.rejects(buildPublicCatalogRelease(options), /Spektrogramm und Aufnahme/);
  binding.soundSha256 = soundSha256;
  await assert.rejects(buildPublicCatalogRelease({ ...options, baseline, verifyMedia: async () => { throw new Error("Abweichende Mediendatei"); } }),
    /Abweichende Mediendatei/);
});

test("App-Freigabe unterscheidet neue Arten von geänderten Arten und schützt die veröffentlichte Basis", async () => {
  const speciesData = [record("z-neu"), record("bleibt"), record(), record("a-neu")];
  const pages = new Map(speciesData.map(source => [source.URLSlug, { url: pageUrl.replace("fixtureowl", source.URLSlug), html }]));
  const media = { media: { sounds: [], gallery: [] }, files: [], issues: [], mapOmitted: true };
  const results = speciesData.map(source => buildSpeciesContent({ record: source, pageUrl: pages.get(source.URLSlug).url, html, localMedia: media }));
  const catalog = buildCatalog({ revision: "a".repeat(64), generatedAt: "2026-11-12T12:00:00.000Z", species: results.map(row => row.data) });
  const options = { snapshot: { complete: true, catalog, results: results.map(row => ({ slug: row.data.id, evidence: row.evidence })) },
    speciesData, pages, mediaRegistry: {}, missingMediaReport: { missing: { maps: ["Testkauz"], soundMp3: ["Testkauz"],
      speciesAssets: [{ german: "Testkauz", safeName: "Testkauz", missing: ["map.jpg", "portrait.webp"] }] } },
    verifyMedia: () => assert.fail("Bewusst ausgelassene Medien dürfen nicht angefordert werden.") };
  const emitted = JSON.parse((await buildPublicCatalogRelease(options)).bytes);
  const changed = structuredClone(emitted.species.find(entry => entry.id === "fixtureowl"));
  changed.sections.find(section => section.title === "Lebensraum").text = "Vorheriger Absatz.";
  const priorSpecies = [changed, emitted.species.find(entry => entry.id === "bleibt")];
  const prior = { ...emitted, generatedAt: "2026-11-11T12:00:00.000Z", species: priorSpecies, revision: digest(`${JSON.stringify(priorSpecies)}\n`) };
  const baseline = baselineFor(prior);
  const candidate = await buildPublicCatalogRelease({ ...options, baseline });
  assert.deepEqual(candidate.decision, { status: "candidate", addedSpecies: ["a-neu", "z-neu"], changedSpecies: ["fixtureowl"],
    baseline: { source: "published", sha256: baseline.sha256, revision: prior.revision, generatedAt: prior.generatedAt, speciesCount: 2 } });
  assert.equal(candidate.manifest.catalogSha256, digest(candidate.bytes));
  const reordered = { ...emitted, species: [...emitted.species].reverse() };
  reordered.revision = digest(`${JSON.stringify(reordered.species)}\n`);
  assert.equal((await buildPublicCatalogRelease({ ...options, baseline: baselineFor(reordered) })).decision.status, "unchanged");
  await assert.rejects(buildPublicCatalogRelease({ ...options, baseline: baselineFor({ ...prior, generatedAt: emitted.generatedAt }) }),
    /geänderte App-Katalog muss neuer/);
  await assert.rejects(buildPublicCatalogRelease({ ...options, baseline: baselineFor({ ...prior,
    species: [...prior.species, { ...prior.species[0], id: "fehlt" }] }) }), /Bereits erfasste Arten fehlen/);
});

test("Katalogübernahme prüft genau den vorbereiteten Stand erneut gegen die aktuelle öffentliche Fassung", () => {
  const species = [buildSpeciesContent({ record: record(), pageUrl, html, localMedia: {
    media: { sounds: [], gallery: [] }, mapOmitted: true } }).data];
  const expectedBaselineSha256 = "b".repeat(64), baseline = { source: "bundled", sha256: expectedBaselineSha256,
    generatedAt: "2026-11-11T12:00:00.000Z" };
  const makeRelease = (generatedAt, entries = species) => {
    const revision = digest(`${JSON.stringify(entries)}\n`);
    const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, revision, generatedAt, species: entries }));
    const manifest = { schemaVersion: 1, kind: "fn-public-catalog", catalogSha256: digest(bytes), catalogBytes: bytes.length,
      revision, generatedAt, speciesCount: entries.length };
    return { bytes, manifest, decision: { status: "candidate", baseline } };
  };
  const prepared = makeRelease("2026-11-12T12:00:00.000Z");
  const fresh = makeRelease("2026-11-12T13:00:00.000Z");
  const check = (candidate, currentRelease = fresh, overrides = {}) => verifyPublicCatalogCandidate({
    manifestBytes: Buffer.from(JSON.stringify(candidate.manifest)), catalogBytes: candidate.bytes,
    expectedBaselineSha256, checkoutCatalogSha256: null, currentRelease, ...overrides });
  assert.deepEqual(check(prepared), { status: "verified-candidate", catalogSha256: prepared.manifest.catalogSha256,
    revision: prepared.manifest.revision, speciesCount: 1, baselineSha256: expectedBaselineSha256 });
  assert.throws(() => check(prepared, { ...fresh, decision: { status: "candidate", baseline: { ...baseline, sha256: "c".repeat(64) } } }), /Ausgangsfassung hat sich/);
  assert.throws(() => check(prepared, fresh, { checkoutCatalogSha256: "c".repeat(64) }), /Git-Zielstand/);
  const published = { ...fresh, decision: { status: "candidate", baseline: { ...baseline, source: "published" } } };
  assert.throws(() => check(prepared, published), /Git-Zielstand/);
  assert.equal(check(prepared, published, { checkoutCatalogSha256: expectedBaselineSha256 }).status, "verified-candidate");
  assert.throws(() => check(prepared, { decision: { status: "unchanged", baseline } }), /keinen zu veröffentlichenden Kandidaten/);
  assert.throws(() => check(prepared, makeRelease(fresh.manifest.generatedAt, [{ ...species[0], commonName: "Geänderter Testkauz" }])), /Artinhalte oder Medien/);
  assert.throws(() => check(makeRelease(baseline.generatedAt)), /Zeitpunkt des Kandidaten/);
  assert.throws(() => check(makeRelease("2026-11-12T14:00:00.000Z")), /Zeitpunkt des Kandidaten/);
  assert.throws(() => check(prepared, fresh, { catalogBytes: Buffer.alloc(prepared.bytes.length, 65) }), /weicht von ihrer Freigabedatei ab/);
});

test("App-Katalog stellt nur neue Arten ohne Artseite zurück und behält bestätigte Zugänge", () => {
  const known = record(), ready = record("neu-bestaetigt"), pending = record("neu-unveroeffentlicht");
  const baseline = { species: [{ id: known.URLSlug }] };
  const readyUrl = pageUrl.replace(known.URLSlug, ready.URLSlug);
  const confirmed = [{ url: pageUrl }, { url: readyUrl }];
  const result = selectPublicCatalogSpecies([known, ready, pending], confirmed, baseline);
  assert.deepEqual([...result.selected], [[known.URLSlug, pageUrl], [ready.URLSlug, readyUrl]]);
  assert.deepEqual(result.speciesData, [known, ready]);
  assert.deepEqual(result.pending, [pending.URLSlug]);
  const issue = (code) => error => error.actual?.some(entry => entry.code === code);
  assert.throws(() => selectPublicCatalogSpecies([known, ready, pending], [confirmed[1]], baseline), issue("missing-species-page"));
  assert.throws(() => selectPublicCatalogSpecies([ready, pending], confirmed, baseline), issue("previous-public-species-missing-from-data"));
  assert.throws(() => selectPublicCatalogSpecies([known, ready], [...confirmed, { url: readyUrl.replace("heimische-tierwelt", "europa") }],
    baseline), issue("ambiguous-species-page"));
  assert.throws(() => selectPublicCatalogSpecies([known, known], confirmed, baseline), /doppelte Artkennungen/);
});

test("App-Katalog verwendet die hashgebundene öffentliche Fassung und weicht nur bei fehlendem Manifest aus", async () => {
  const address = "https://felixkfm90.github.io/iucn-species-data/mobile/catalog/manifest.json";
  const result = buildSpeciesContent({ record: record(), pageUrl, html, localMedia: { ...localMedia(),
    media: { sounds: [], gallery: [] }, mapOmitted: true } });
  const species = [result.data], revision = digest(`${JSON.stringify(species)}\n`), generatedAt = "2026-11-12T12:00:00.000Z";
  const payload = Buffer.from(JSON.stringify({ schemaVersion: 1, revision, generatedAt, species }));
  const manifest = { schemaVersion: 1, kind: "fn-public-catalog", catalogSha256: digest(payload), catalogBytes: payload.length,
    revision, generatedAt, speciesCount: species.length };
  const mediaUrl = new URL(`${manifest.catalogSha256}.json`, address).href;
  const headers = { "Content-Type": "application/json" };
  const calls = [];
  async function read(manifestResponse, payloadResponse) {
    calls.length = 0;
    return readPublicCatalogBaseline({ async fetchImpl(url, options) {
      assert.equal(options.credentials, "omit"); assert.equal(options.redirect, "error");
      calls.push(url.href);
      if (url.href === address) return manifestResponse;
      assert.equal(url.href, mediaUrl);
      return payloadResponse;
    } });
  }
  const releaseResponse = (value = manifest) => new Response(JSON.stringify(value), { headers });
  const published = await read(releaseResponse(), new Response(payload, { headers }));
  assert.equal(published.source, "published");
  assert.equal(published.sha256, manifest.catalogSha256);
  assert.deepEqual(published.catalog.species, species);
  assert.deepEqual(calls, [address, mediaUrl]);
  const bundled = await read(new Response(null, { status: 404 }));
  assert.equal(bundled.source, "bundled");
  assert.equal(bundled.sha256, BUNDLED_SPECIES_SOURCE.sha256);
  assert.equal(bundled.catalog.species.length, BUNDLED_SPECIES_SOURCE.speciesCount);
  assert.deepEqual(calls, [address]);
  await assert.rejects(read(new Response(null, { status: 404, headers: { Location: address } })), /Abruf fehlgeschlagen/);
  await assert.rejects(read(new Response(null, { status: 503 })), /Abruf fehlgeschlagen/);
  await assert.rejects(read(releaseResponse({ ...manifest, privateField: true })), /Ungültige Freigabedatei/);
  await assert.rejects(read(releaseResponse(), new Response(null, { status: 404 })), /Abruf fehlgeschlagen/);
  await assert.rejects(read(releaseResponse(), new Response(Buffer.alloc(payload.length, 65), { headers })), /weicht von ihrer Freigabedatei ab/);
});

test("gallery source identity/order and observed alt/caption survive CDN representation changes", () => {
  const gallery = '<section data-sqsp-section="gallery"><figure><img src="https://images.squarespace-cdn.com/content/a.jpg?format=750w" alt="Beobachteter Text"><figcaption>Öffentliche Bildunterschrift</figcaption></figure><figure><img src="https://images.squarespace-cdn.com/content/b.jpg" alt="Zweites Bild"></figure></section>';
  const first = buildSpeciesContent({ record: record(), pageUrl, html: html.replace("</main>", `${gallery}</main>`), localMedia: localMedia() });
  const changed = buildSpeciesContent({ record: record(), pageUrl, html: html.replace("</main>", `${gallery.replace("750w", "2500w")}</main>`), localMedia: localMedia() });
  assert.equal(first.complete, true);
  assert.deepEqual(first.data.media.gallery.map((entry) => entry.id), changed.data.media.gallery.map((entry) => entry.id));
  assert.equal(first.data.media.gallery[0].alt, "Beobachteter Text");
  assert.equal(first.data.media.gallery[0].caption, "Öffentliche Bildunterschrift");
  assert.deepEqual(first.data.media.gallery.map((entry) => entry.order), [0, 1]);
  assert.equal(new URL(first.data.media.gallery[0].url).searchParams.get("format"), "1500w");
  assert.ok(first.data.media.gallery.every((entry) => !("sha256" in entry) && !("bytes" in entry)));
});

test("different public texts for one gallery source stay an explicit ambiguity", () => {
  const gallery = '<section data-sqsp-section="gallery"><img src="https://images.squarespace-cdn.com/content/a.jpg" alt="A"><img src="https://images.squarespace-cdn.com/content/a.jpg" alt="B"></section>';
  const result = buildSpeciesContent({ record: record(), pageUrl, html: html.replace("</main>", `${gallery}</main>`), localMedia: localMedia() });
  assert.equal(result.complete, false); assert.ok(result.issues.some((entry) => entry.code === "ambiguous-gallery-text"));
});

test("asset bytes/hashes, sanitizeAssetName URLs and selected attribution retain provenance without notes/prompts", async () => {
  const directory = assertTestTempPath(path.join(tmpdir(), `content-${randomUUID().slice(0, 8)}`));
  try {
    const assetsRoot = path.join(directory, "assets"), assetDir = path.join(assetsRoot, "Gruenspecht");
    await fs.mkdir(assetDir, { recursive: true });
    const entries = { "portrait.webp": "synthetic portrait", "map.jpg": "synthetic map", "sound.mp3": "synthetic sound", "spectrogram.webp": "synthetic spectrum",
      "portrait.json": JSON.stringify({ type: "Illustration", source: "Synthetic source", generation_method: "Synthetic generation", prompt: "DO NOT EXPORT PROMPT" }),
      "credits.json": JSON.stringify({ recordist: "Synthetic recorder", license: "CC BY-NC 4.0", source: "Synthetic source", url: "https://source.example.org/recording", notes: "DO NOT EXPORT NOTES" }) };
    for (const [name, text] of Object.entries(entries)) await fs.writeFile(path.join(assetDir, name), text);
    const result = await readSpeciesMedia({ assetsRoot, record: { ...record(), "Deutscher Name": "Grünspecht" } });
    assert.deepEqual(result.issues, []);
    assert.equal(result.media.portrait.url, "https://felixkfm90.github.io/iucn-species-data/species-assets/Gruenspecht/portrait.webp");
    assert.equal(result.media.portrait.sha256, digest(entries["portrait.webp"]));
    assert.equal(result.media.sounds[0].bytes, Buffer.byteLength(entries["sound.mp3"]));
    assert.match(result.media.sounds[0].attribution, /CC BY-NC 4.0/);
    assert.ok(!JSON.stringify(result).includes("DO NOT EXPORT"));
    assert.match(result.media.map.attribution, /IUCN Red List/);
    const snapshot = await exportSpeciesCatalog({ speciesData: [{ ...record(), "Deutscher Name": "Grünspecht" }], speciesList: [{ german: "Grünspecht" }],
      pages: new Map([["fixtureowl", { url: pageUrl, html }]]), assetsRoot });
    assert.equal(snapshot.complete, true);
    const plan = createSpeciesImportPlan(snapshot); assert.equal(plan.proposedOnly, true); assert.equal(plan.externalPublication, false);
    assert.equal(plan.objects.length, 1);
  } finally { assertTestTempPath(directory); await fs.rm(directory, { recursive: true }); closeEmptyTestTempSession(); }
});

test("missing map/portrait are incomplete; absent recording is not an invented silence statement", async () => {
  const directory = assertTestTempPath(path.join(tmpdir(), `content-${randomUUID().slice(0, 8)}`));
  try {
    await fs.mkdir(directory);
    const result = await readSpeciesMedia({ assetsRoot: directory, record: record() });
    assert.equal(result.issues.filter((entry) => entry.code === "missing-required-media").length, 2);
    assert.deepEqual(result.media.sounds, []);
    assert.ok(!JSON.stringify(result).includes("stumm"));
    const input = { speciesData: [record()], speciesList: [{ german: "Testkauz" }],
      pages: new Map([["fixtureowl", { url: pageUrl, html }]]), assetsRoot: directory };
    const missingMediaReport = { missing: { maps: ["Testkauz"], soundMp3: ["Testkauz"],
      speciesAssets: [{ german: "Testkauz", safeName: "Testkauz", missing: ["map.jpg", "portrait.webp"] }] } };
    const snapshot = await exportSpeciesCatalog({ ...input, missingMediaReport });
    assert.equal(snapshot.complete, true);
    assert.equal((await validateSpeciesSnapshot({ ...input, snapshot, missingMediaReport })).passed, true);
    assert.equal((await validateSpeciesSnapshot({ ...input, snapshot })).passed, false);
    const release = await buildPublicCatalogRelease({ ...input, snapshot, missingMediaReport, mediaRegistry: {},
      verifyMedia: () => assert.fail("Bewusst ausgelassene Medien dürfen nicht als vorhandene Medien angefordert werden.") });
    assert.deepEqual(JSON.parse(release.bytes).species[0].media, { sounds: [], gallery: [] });
    missingMediaReport.missing.maps = [];
    assert.equal((await exportSpeciesCatalog({ ...input, missingMediaReport })).complete, false);
  } finally { assertTestTempPath(directory); await fs.rm(directory, { recursive: true }); closeEmptyTestTempSession(); }
});

test("page selection uses existing slug mappings and reports ambiguity rather than inventing URLs", () => {
  const a = selectSpeciesPageUrls([record()], [{ species: { slug: "fixtureowl" }, url: pageUrl }]);
  assert.equal(a.selected.get("fixtureowl"), pageUrl);
  const b = selectSpeciesPageUrls([record()], [{ species: { slug: "fixtureowl" }, url: pageUrl }, { species: { slug: "fixtureowl" }, url: pageUrl.replace("heimische-tierwelt", "europa") }]);
  assert.equal(b.selected.size, 0); assert.equal(b.issues[0].code, "ambiguous-species-page");
});

test("capture fetches only selected HTML, bounded to four parallel tasks, and rejects redirects/media", async () => {
  let active = 0, peak = 0; const requested = [];
  const selected = new Map(Array.from({ length: 9 }, (_, index) => [`fixture${index}`, `https://www.fnwildlifetravel.de/wildlife/europa/fixture${index}`]));
  const result = await captureSpeciesPages(selected, { fetchImpl: async (url, options) => {
    requested.push(url); assert.equal(options.redirect, "manual"); assert.equal(options.credentials, "omit");
    active++; peak = Math.max(peak, active); await new Promise((resolve) => setImmediate(resolve)); active--;
    return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  } });
  assert.equal(result.pages.size, 9); assert.equal(requested.length, 9); assert.ok(peak <= 4);
  const rejected = await captureSpeciesPages(new Map([["fixture", pageUrl]]), { fetchImpl: async () => new Response("", { status: 302 }) });
  assert.equal(rejected.pages.size, 0); assert.equal(rejected.issues[0].blocking, true);
  await assert.rejects(captureSpeciesPages(selected, { concurrency: 5 }));
});

test("the whole-export validator independently detects lost editorial and structured values", async () => {
  const sourceRecord = record(), result = buildSpeciesContent({ record: sourceRecord, pageUrl, html, localMedia: localMedia() });
  const snapshot = { complete: true, catalog: buildCatalog({ revision: "fixture", species: [result.data] }),
    results: [{ slug: sourceRecord.URLSlug, evidence: result.evidence }] };
  const inputs = { speciesData: [sourceRecord], pages: new Map([[sourceRecord.URLSlug, { url: pageUrl, html }]]) };
  assert.equal((await validateSpeciesSnapshot({ snapshot, ...inputs })).passed, true);
  const changed = structuredClone(snapshot);
  changed.catalog.species[0].sections.find((section) => section.title === "Lebensraum").text = "Erster Absatz.";
  changed.catalog.species[0].sections.find((section) => section.title === "Allgemein").text = "Größe: 12-14 cm";
  changed.catalog.species[0].taxonomy.find((entry) => entry.rank === "species").name = "fixture";
  const invalid = await validateSpeciesSnapshot({ snapshot: changed, ...inputs });
  assert.equal(invalid.passed, false);
  for (const code of ["editorial-paragraph-parity-mismatch", "structured-value-missing", "species-rank-not-full-name"]) assert.ok(invalid.issues.some((entry) => entry.code === code));
});

test("public catalog parity excludes known lookup metadata while detecting new unrepresented source fields", async () => {
  const sourceRecord = { ...record(), Subphylum: "Vertebrata", "Taxon ID": 12345, "IUCN-Zuordnung": "synonym" };
  const result = buildSpeciesContent({ record: sourceRecord, pageUrl, html, localMedia: localMedia() });
  assert.doesNotMatch(result.data.sections.find((section) => section.title === "Allgemein").text, /Subphylum|Taxon ID|IUCN-Zuordnung/u);
  assert.equal(result.data.taxonomy.some((taxon) => taxon.rank === "subphylum"), false);
  const snapshot = { complete: true, catalog: buildCatalog({ revision: "fixture", species: [result.data] }),
    results: [{ slug: sourceRecord.URLSlug, evidence: result.evidence }] };
  const pages = new Map([[sourceRecord.URLSlug, { url: pageUrl, html }]]);
  assert.equal((await validateSpeciesSnapshot({ snapshot, pages, speciesData: [sourceRecord] })).passed, true);
  const missing = await validateSpeciesSnapshot({ snapshot, pages, speciesData: [{ ...sourceRecord, Spannweite: "35 cm" }] });
  assert.deepEqual(missing.issues, [{ code: "structured-value-missing", slug: sourceRecord.URLSlug, key: "Spannweite" }]);
});

test("the whole-export validator rejects an invented gallery checksum", async () => {
  const sourceHtml = html.replace("</main>", '<section data-sqsp-section="gallery"><img src="https://images.squarespace-cdn.com/content/a.jpg" alt="Öffentliches Motiv"></section></main>');
  const result = buildSpeciesContent({ record: record(), pageUrl, html: sourceHtml, localMedia: localMedia() });
  result.data.media.gallery[0].sha256 = "a".repeat(64);
  const snapshot = { complete: true, catalog: buildCatalog({ revision: "fixture", species: [result.data] }), results: [{ slug: "fixtureowl", evidence: result.evidence }] };
  const checked = await validateSpeciesSnapshot({ snapshot, speciesData: [record()], pages: new Map([["fixtureowl", { url: pageUrl, html: sourceHtml }]]) });
  assert.equal(checked.passed, false); assert.ok(checked.issues.some((entry) => entry.code === "unmeasured-gallery-integrity-claim"));
});

for (const [slug, scientific, common, expectedFirst] of [["alcedoatthis", "Alcedo atthis", "Eisvogel", "_OM11184_20260509_09_22_28.JPG"],
  ["acinonyxjubatus", "Acinonyx jubatus", "Gepard", "_7R50577.JPG"]]) {
  test(`bound public <main> excerpt for ${slug} preserves every heading/paragraph and the full gallery order`, async () => {
    const metadata = JSON.parse(await fs.readFile(new URL(`${slug}.json`, fixtures), "utf8")), bytes = await fs.readFile(new URL(`${slug}.html`, fixtures));
    assert.equal(metadata.fixtureKind, "public-main-excerpt");
    assert.equal(digest(bytes), metadata.sha256); assert.equal(bytes.length, metadata.bytes);
    const editorial = parseWebsiteEditorialPage(bytes.toString("utf8"), metadata.url);
    assert.equal(editorial.complete, true); assert.equal(digest(JSON.stringify(editorial)), metadata.editorialSha256);
    assert.equal(editorial.sections.length, metadata.sections);
    assert.equal(editorial.sections.reduce((count, section) => count + section.paragraphs.length, 0), metadata.paragraphs);
    assert.equal(editorial.gallerySources.length, metadata.galleryImages);
    const result = buildSpeciesContent({ record: { ...record(slug), "Wissenschaftlicher Name": scientific, "Deutscher Name": common },
      pageUrl: metadata.url, html: bytes.toString("utf8"), localMedia: localMedia() });
    assert.equal(result.complete, true);
    assert.deepEqual(result.data.sections.map((section) => section.title), editorial.sections.map((section) => section.heading || "Einleitung"));
    for (const [index, section] of editorial.sections.entries()) {
      for (const paragraph of section.paragraphs) assert.ok(result.data.sections[index].text.includes(paragraph.text));
    }
    assert.deepEqual(result.data.media.gallery.map((entry) => canonicalWebsiteImageSource(entry.url)), editorial.gallerySources);
    assert.equal(digest(JSON.stringify(result.data.media.gallery)), metadata.galleryTextSha256);
    assert.equal(new URL(result.data.media.gallery[0].url).pathname.split("/").at(-1), expectedFirst);
    assert.equal(result.evidence.htmlSha256, metadata.sha256);
  });
}
