import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir, assertTestTempPath, closeEmptyTestTempSession } from "../../scripts/test-temp.mjs";
import { parseWebsiteEditorialPage, canonicalWebsiteImageSource } from "../website-alt-parser.mjs";
import { buildSpeciesContent, readSpeciesMedia, exportSpeciesCatalog, createSpeciesImportPlan, selectSpeciesPageUrls } from "./export.mjs";
import { captureSpeciesPages } from "./capture.mjs";
import { validateSpeciesSnapshot } from "./validate.mjs";
import { buildCatalog } from "../shared-project/catalog.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const record = (slug = "fixtureowl") => ({ URLSlug: slug, "Wissenschaftlicher Name": "Strix fixture", "Deutscher Name": "Testkauz",
  "Größe": "12-14 cm", "Gewicht": "30 g", "Lebenserwartung": "4 Jahre", "Status": "LC", "Trend": "Stabil",
  Kingdom: "Animalia", Genus: "Strix", Species: "fixture" });
const localMedia = () => ({ media: { portrait: { id: "fixture:portrait", url: "https://felixkfm90.github.io/iucn-species-data/species-assets/Testkauz/portrait.webp" },
  map: { id: "fixture:map", url: "https://felixkfm90.github.io/iucn-species-data/species-assets/Testkauz/map.jpg" }, sounds: [], gallery: [] }, files: [], issues: [] });
const html = '<main><div class="sqs-block-html" id="heading"><h3>Testkauz</h3><h4>Allgemein</h4></div><div class="sqs-block-html" id="body"><h4>Lebensraum</h4><p>Erster Absatz.</p><p>Zweiter Absatz mit <strong>Hervorhebung</strong>.</p><ul><li>Ein Listenpunkt</li></ul><h4>Verbreitungskarte</h4></div></main>';
const pageUrl = "https://www.fnwildlifetravel.de/wildlife/heimische-tierwelt/fixtureowl";

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
  test(`bound historical ${slug} example preserves every heading/paragraph and the full gallery order`, async () => {
    const base = path.join(root, "data", "website", "checks", `species-samples-20261030-${slug}-source`);
    const metadata = JSON.parse(await fs.readFile(`${base}.json`, "utf8")), bytes = await fs.readFile(`${base}.html`);
    assert.equal(digest(bytes), metadata.sha256); assert.equal(bytes.length, metadata.bytes);
    const original = parseWebsiteEditorialPage(bytes.toString("utf8"), metadata.url);
    assert.equal(original.complete, true);
    const result = buildSpeciesContent({ record: { ...record(slug), "Wissenschaftlicher Name": scientific, "Deutscher Name": common },
      pageUrl: metadata.url, html: bytes.toString("utf8"), localMedia: localMedia() });
    assert.equal(result.complete, true);
    assert.deepEqual(result.data.sections.map((section) => section.title), original.sections.map((section) => section.heading || "Einleitung"));
    for (const [index, section] of original.sections.entries()) {
      for (const paragraph of section.paragraphs) assert.ok(result.data.sections[index].text.includes(paragraph.text));
    }
    assert.deepEqual(result.data.media.gallery.map((entry) => canonicalWebsiteImageSource(entry.url)), original.gallerySources);
    assert.equal(new URL(result.data.media.gallery[0].url).pathname.split("/").at(-1), expectedFirst);
    assert.equal(result.evidence.htmlSha256, metadata.sha256);
  });
}
