import test from "node:test";
import assert from "node:assert/strict";
import { validateReaderEditorial, readerEditorialFromProjection, readerEditorialSectionsAsText } from "./species-editorial-data.mjs";
import { emptySectionHash } from "../page-authoring/model.mjs";

const projectId = "reader-editorial-project";
const hash = "a".repeat(64);
const denied = code => error => error.code === code;

function fixture() {
  const source = { id: "field-source", label: "Beobachtungsquelle „A“", url: "https://example.org/source", sha256: hash };
  const normalAssets = { portrait: null, map: null, sound: null, credits: null, spectrogram: null };
  const asset = { id: "image-11111111-1111-4111-8111-111111111111", projectId, sha256: hash,
    bytes: 421, mimeType: "image/png", attribution: "Eigene Aufnahme „A“" };
  const sections = [
    { id: "general", kind: "general-module", title: "Allgemein", requested: false, blocks: [], sources: [], emptyDecision: null },
    { id: "appearance", kind: "editorial", title: "Aussehen", requested: true,
      blocks: [{ type: "heading", level: 5, text: "Kennzeichen" }, { type: "paragraph", text: "Unveränderter Fachtext" },
        { type: "bullet-list", items: ["Erster Punkt", "Zweiter Punkt"] },
        { type: "numbered-list", items: ["Merkmal eins", "Merkmal zwei"] }], sources: [structuredClone(source)], emptyDecision: null },
    { id: "food", kind: "editorial", title: "Nahrung", requested: true, blocks: [], sources: [], emptyDecision: null },
    { id: "map", kind: "map-module", title: "Verbreitung", requested: false, blocks: [], sources: [], emptyDecision: null },
  ];
  sections[2].emptyDecision = { sectionHash: emptySectionHash(sections[2]), actorId: "fixture-editor",
    confirmedAt: "2026-11-01T12:00:00.000Z", reason: "Bewusst leer belassen" };
  return { websiteUrl: "https://www.fnwildlifetravel.de/wildlife/voegel/fixture-owl", title: "Testkauz – Seitentitel",
    introduction: [{ type: "paragraph", text: "Einleitender Text" }], sections, sources: [source], galleryRequested: true,
    gallery: [{ id: "usage-first", asset: structuredClone(asset), alt: "Erste Ansicht", caption: "Erste Bildunterschrift", decorative: false, order: 0 },
      { id: "usage-second", asset: structuredClone(asset), alt: "", caption: "Zweite Verwendung", decorative: true, order: 1 }],
    normalAssets, sourceBindings: { projectId,
      page: { objectId: `fn-species-page-${hash}`, objectRevision: "11111111-1111-4111-8111-111111111111",
        dataRevision: hash, contentHash: hash, imagesHash: hash, dataHash: hash },
      species: { id: "fixture-owl", objectRevision: "22222222-2222-4222-8222-222222222222", dataHash: hash, sourceHash: hash } } };
}

test("rich editorial roundtrip preserves every rich block, source, empty decision and repeated file usage without aliases", () => {
  const original = fixture(), before = structuredClone(original);
  const checked = validateReaderEditorial(original, { projectId, speciesId: "fixture-owl" });
  assert.deepEqual(checked, before); assert.deepEqual(original, before);
  assert.equal(checked.gallery[0].asset.id, checked.gallery[1].asset.id);
  checked.introduction[0].text = "Anderer Text"; checked.sections[1].sources[0].label = "Andere Quelle";
  checked.sections[2].emptyDecision.reason = "Andere Entscheidung"; checked.gallery[0].asset.attribution = "Andere Herkunft";
  assert.notEqual(checked.gallery[0].asset.attribution, checked.gallery[1].asset.attribution);
  assert.deepEqual(original, before);
});

test("projection conversion removes only exact internal envelope fields and preserves null website binding", () => {
  const editorial = fixture(); editorial.websiteUrl = null;
  const projection = { kind: "page-editorial-projection", schemaVersion: 1, ...editorial, readerApproved: false, externalPublication: "not-performed" };
  assert.deepEqual(readerEditorialFromProjection(projection), editorial);
  assert.equal("readerApproved" in readerEditorialFromProjection(projection), false);
  for (const mutate of [value => { value.readerApproved = true; }, value => { value.externalPublication = "published"; },
    value => { value.kind = "other"; }, value => { value.extra = "Discarding this would lose data"; }]) {
    const invalid = structuredClone(projection); mutate(invalid);
    assert.throws(() => readerEditorialFromProjection(invalid));
  }
});

test("module roles and section order remain explicit while editorial sections may retain their actual chosen order", () => {
  const original = fixture(); [original.sections[1], original.sections[2]] = [original.sections[2], original.sections[1]];
  assert.deepEqual(validateReaderEditorial(original).sections.map(value => value.id), ["general", "food", "appearance", "map"]);
  for (const mutate of [value => { value.sections.reverse(); }, value => { value.sections[1].kind = "general-module"; },
    value => { value.sections[0].kind = "editorial"; }, value => { value.sections.at(-1).kind = "editorial"; },
    value => { value.sections[1].id = value.sections[0].id; }]) {
    const invalid = fixture(); mutate(invalid); assert.throws(() => validateReaderEditorial(invalid), denied("invalid_reader_editorial"));
  }
});

test("a deliberate empty decision is bound to section identity, title, role and exact blocks", () => {
  for (const mutate of [section => { section.title = "Geänderter Titel"; }, section => { section.id = "changed-food"; },
    section => { section.blocks = [{ type: "paragraph", text: "Jetzt doch Inhalt" }]; },
    section => { section.emptyDecision.sectionHash = "b".repeat(64); },
    section => { section.emptyDecision.untracked = true; }]) {
    const invalid = fixture(); mutate(invalid.sections[2]); assert.throws(() => validateReaderEditorial(invalid), denied("invalid_reader_editorial"));
  }
  const empty = fixture(); empty.sections[2].emptyDecision = null;
  assert.equal(validateReaderEditorial(empty).sections[2].emptyDecision, null);
});

test("strict stored shapes never normalize away extra rich fields, omitted defaults or malformed lists", () => {
  for (const mutate of [value => { value.introduction[0].unknown = true; }, value => { delete value.gallery[0].asset.attribution; },
    value => { value.gallery[0].asset.url = "https://example.org/fake.jpg"; }, value => { value.sections[1].sources[0].extra = true; },
    value => { value.sections[1].blocks[2].items = []; }, value => { delete value.sections[1].requested; },
    value => { value.normalAssets.extra = null; }, value => { value.websiteUrl = "https://localhost/private"; }]) {
    const invalid = fixture(); mutate(invalid); assert.throws(() => validateReaderEditorial(invalid));
  }
});

test("gallery usage identity is separate from immutable asset binding and source project", () => {
  for (const mutate of [value => { value.gallery[1].id = value.gallery[0].id; }, value => { value.gallery.reverse(); },
    value => { value.gallery[1].asset.sha256 = "b".repeat(64); }, value => { value.gallery[1].asset.attribution = "Andere Herkunft"; },
    value => { value.gallery[1].asset.projectId = "foreign-project"; }, value => { value.gallery[1].alt = "Dekorativ mit Text"; },
    value => { value.gallery[0].asset.mimeType = "audio/mpeg"; }]) {
    const invalid = fixture(); mutate(invalid); assert.throws(() => validateReaderEditorial(invalid));
  }
  assert.throws(() => validateReaderEditorial(fixture(), { projectId: "other-project" }), denied("invalid_reader_editorial"));
  assert.throws(() => validateReaderEditorial(fixture(), { speciesId: "other-species" }), denied("invalid_reader_editorial"));
});

test("normal media roles preserve all five actual formats and cannot borrow arbitrary URLs or foreign project metadata", () => {
  const original = fixture(); original.normalAssets.portrait = { ...original.gallery[0].asset, id: "fixture:portrait", mimeType: "image/webp" };
  assert.deepEqual(validateReaderEditorial(original).normalAssets, original.normalAssets);
  for (const mutate of [value => { value.normalAssets.portrait.mimeType = "image/jpeg"; },
    value => { value.normalAssets.portrait.projectId = "foreign-project"; }, value => { value.normalAssets.portrait.url = "https://example.org/fake.webp"; }]) {
    const invalid = structuredClone(original); mutate(invalid); assert.throws(() => validateReaderEditorial(invalid));
  }
});

test("derived text preserves introduction, headings, list meaning, references and deliberate empty state without changing stored source", () => {
  const original = fixture(), before = structuredClone(original), sections = readerEditorialSectionsAsText(original);
  assert.equal(sections[0].title, "Einleitung"); assert.equal(sections[0].text, "Einleitender Text");
  const appearance = sections.find(value => value.id === "appearance");
  assert.match(appearance.text, /Kennzeichen\n\nUnveränderter Fachtext/);
  assert.match(appearance.text, /• Erster Punkt\n• Zweiter Punkt/);
  assert.match(appearance.text, /1\. Merkmal eins\n2\. Merkmal zwei/);
  assert.match(appearance.text, /Quellen:\nBeobachtungsquelle „A“ · https:\/\/example.org\/source · SHA-256:/);
  assert.equal(sections.find(value => value.id === "food").intentionallyEmpty, true);
  assert.equal(sections.at(-1).title, "Quellen"); assert.deepEqual(original, before);
});

test("derived introduction and source IDs remain unique when actual section IDs already use these names", () => {
  const original = fixture(); original.sections[1].id = "introduction"; original.sections[2].id = "sources";
  original.sections[2].emptyDecision.sectionHash = emptySectionHash(original.sections[2]);
  const sections = readerEditorialSectionsAsText(original);
  assert.equal(new Set(sections.map(value => value.id)).size, sections.length);
  assert.equal(sections[0].id, "introduction-text"); assert.equal(sections.at(-1).id, "sources-text");
});

test("descriptors are checked before getters, proxy traps or hidden data can be read or silently dropped", () => {
  let executed = false;
  const getter = fixture(); Object.defineProperty(getter.gallery[0].asset, "attribution", { enumerable: true, get() { executed = true; return "unsafe"; } });
  const hidden = fixture(); Object.defineProperty(hidden.sections[1], "hidden", { value: "lost", enumerable: false });
  const proxy = new Proxy(fixture(), { ownKeys() { executed = true; throw new Error("Must not run"); } });
  const sparse = fixture(); sparse.introduction = Array(1);
  const symbol = fixture(); symbol[Symbol("lost")] = true;
  for (const invalid of [getter, hidden, proxy, sparse, symbol]) assert.throws(() => validateReaderEditorial(invalid), denied("invalid_reader_editorial"));
  assert.equal(executed, false);
});

test("rich editorial accepts complete content above old catalog size but rejects oversized data without truncation", () => {
  const original = fixture(); original.sections[1].blocks = Array.from({ length: 4 }, () => ({ type: "paragraph", text: "x".repeat(80000) }));
  assert.ok(Buffer.byteLength(JSON.stringify(original)) > 256 * 1024);
  assert.deepEqual(validateReaderEditorial(original).sections[1].blocks, original.sections[1].blocks);
  original.sections[1].blocks = Array.from({ length: 24 }, () => ({ type: "paragraph", text: "x".repeat(90000) }));
  assert.throws(() => validateReaderEditorial(original), error => error.status === 413);
  assert.equal(original.sections[1].blocks.length, 24);
});
