import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, digest, objectJson } from "./security.mjs";
import { guardSpeciesRecordTransition, projectSpeciesRecordToCatalog, validateSpeciesRecord } from "./species-record.mjs";
import { speciesNormalAssets } from "./species-editorial.mjs";
import { emptySectionHash } from "../page-authoring/model.mjs";
import { ENRICHMENT_CREDIT_FIELDS, projectSpeciesEnrichment, speciesEnrichmentSourceBindings } from "./species-enrichment.mjs";

const projectId = "enrichment-project", revision = "11111111-1111-4111-8111-111111111111", hash = value => digest(value);
const clone = value => structuredClone(value), denied = code => error => error.code === code;
const file = (name, value) => ({ sha256: hash(value), bytes: Buffer.byteLength(value),
  mimeType: name === "sound.mp3" ? "audio/mpeg" : name === "map.jpg" ? "image/jpeg" : name === "credits.json" ? "application/json" : "image/webp" });
function fixture({ rich = false, embedded = false, empty = false } = {}) {
  const credits = { scientific_name: "Strix fixture", german_name: "Testkauz", recordist: "Original recorder", license: "CC BY",
    source: "Original recording", url: "https://example.org/original", rejectionKey: "xeno-canto:1", retainedUnknown: { notes: ["original", false] } };
  const creditText = JSON.stringify(credits), record = { type: "fn-species-record", schemaVersion: 1, id: "strixfixture",
    input: { german: "Testkauz", english: "Fixture owl", genus: "Strix", species: "fixture", size: 30, weight: "400 g", life_expectancy: "12 Jahre",
      taxonomyReference: "mtx_11111111111111111111111111111111", unknownInput: { nested: [null, false, "unchanged"] } },
    generated: { URLSlug: "strixfixture", "Wissenschaftlicher Name": "Strix fixture", "Deutscher Name": "Testkauz", "Englischer Name": "Fixture owl",
      Größe: 30, Gewicht: "400 g", Lebenserwartung: "12 Jahre", "Assessment ID": 101, Status: "LC", Kategorie: "Nicht gefährdet", Trend: "Stabil",
      Populationgröße: "10.000", Generationsdauer: "3 Jahre", "Letztes IUCN Update": "2025", "Daten abgerufen": "2026-10-31",
      Kingdom: "Animalia", Phylum: "Chordata", Subphylum: "Vertebrata", Class: "Aves", Order: "Strigiformes", Family: "Old Family", Genus: "Strix", Species: "fixture",
      unknownGenerated: { original: [true, 7] } },
    taxonomyOverride: { fields: { Kingdom: "Animalia", Phylum: "Chordata", Subphylum: "Vertebrata", Class: "Aves", Order: "Strigiformes", Family: "Manual Family",
      unknownManualRank: "preserve" }, automaticFields: { Kingdom: "Animalia", Phylum: "Chordata", Subphylum: "Vertebrata", Class: "Aves", Order: "Strigiformes", Family: "Old Family",
      unknownComparison: ["preserve"] }, reason: "Eigene Einordnung", updatedAt: "2026-10-20T12:00:00.000Z", unknownOverride: { retained: true } },
    assessmentBinding: { id: 101, unknownBinding: ["preserve"] },
    assets: { assetName: "Historischer Testkauz", files: Object.fromEntries(["portrait.webp", "map.jpg", "sound.mp3", "spectrogram.webp", "credits.json"]
      .map(name => [name, { id: `original:${name}`, ...file(name, name === "credits.json" ? creditText : `old-${name}`),
        ...(name === "map.jpg" ? { url: "https://example.org/original-map.jpg" } : {}) }])),
      overrides: { map: { source: "Original map", unknownCare: { kept: true } }, sound: { rejectedSources: [{ key: "xeno-canto:99", reason: "Eigene Ablehnung" }],
        unknownSoundCare: "preserve" }, unrelated: { protected: true } }, credits,
      portraitMetadata: { type: "Illustration", source: "Eigene Darstellung", generation_method: "Manuell", prompt: "Private original prompt", unknownPortrait: true } },
    editorial: { websiteUrl: "https://www.fnwildlifetravel.de/wildlife/strixfixture",
      sections: [{ id: "general", title: "Allgemein", text: "Manueller Einstieg", intentionallyEmpty: false },
        { id: "habitat", title: "Lebensraum", text: "Unveränderter menschlicher Fachtext", intentionallyEmpty: false }],
      gallery: [{ id: "legacy-photo", url: "https://images.squarespace-cdn.com/content/photo.jpg", alt: "Eigenes Bild", caption: "Originale Beschriftung", order: 0 }],
      generalSectionId: "general", embeddedGeneralText: null } };
  if (empty) { record.generated = null; record.taxonomyOverride = null; record.assessmentBinding = null;
    record.assets.files = {}; record.assets.credits = null; record.assets.overrides = {}; }
  if (embedded) {
    const text = projectSpeciesRecordToCatalog(record).sections.find(section => section.id === "general").text.slice("Manueller Einstieg\n\n".length);
    record.editorial.sections[0].text += `\n\n${text}`; record.editorial.embeddedGeneralText = text;
  }
  if (rich) {
    const sections = [{ id: "general", kind: "general-module", title: "Allgemein", requested: true, blocks: [], sources: [], emptyDecision: null },
      { id: "habitat", kind: "editorial", title: "Lebensraum", requested: true, blocks: [{ type: "heading", level: 5, text: "Eigenes Habitat" },
        { type: "bullet-list", items: ["Erster Ort", "Zweiter Ort"] }], sources: [{ id: "field-source", label: "Eigene Quelle", url: "https://example.org/field-source" }], emptyDecision: null },
      { id: "food", kind: "editorial", title: "Nahrung", requested: false, blocks: [], sources: [], emptyDecision: null },
      { id: "map", kind: "map-module", title: "Verbreitung", requested: true, blocks: [], sources: [], emptyDecision: null }];
    sections[2].emptyDecision = { sectionHash: emptySectionHash(sections[2]), actorId: "original-editor", confirmedAt: "2026-10-20T10:00:00Z", reason: "Bewusst leer" };
    record.editorial = { websiteUrl: record.editorial.websiteUrl, title: "Menschlicher Seitentitel", introduction: [{ type: "paragraph", text: "Eigene Einleitung" }],
      sections, sources: [{ id: "whole-source", label: "Gesamtquelle", sha256: hash("whole-source") }], galleryRequested: true,
      gallery: [{ id: "usage-a", asset: { id: "image-11111111-1111-4111-8111-111111111111", projectId, ...file("portrait.webp", "gallery"), attribution: "Eigenes Foto" },
        alt: "Originaler Alternativtext", caption: "Originale Beschriftung", decorative: false, order: 0 }], normalAssets: speciesNormalAssets(record, projectId),
      sourceBindings: { projectId, page: { objectId: `fn-species-page-${hash("page")}`, objectRevision: revision, dataRevision: hash("page-revision"),
        contentHash: hash("page-content"), imagesHash: hash("page-images"), dataHash: hash("page-data") },
      species: { id: record.id, objectRevision: revision, dataHash: hash("original-record"), sourceHash: hash("original-source") } } };
    record.schemaVersion = 2;
  }
  const data = validateSpeciesRecord(record, record.id);
  return { kind: "species", id: data.id, revision, parentRevision: null, authorId: "original-author", createdAt: "2026-10-20T10:00:00Z",
    approval: "draft", approvedRevision: null, ordinal: 1, localPending: false, localConflict: false, data };
}
function resultFor(source, changes = {}) {
  return { generated: source.data.generated === null ? null : { ...clone(source.data.generated), "Assessment ID": 202,
    Status: "NT", Kategorie: "Potentiell gefährdet", Family: "New Automatic Family", "Daten abgerufen": "2026-11-02" },
    files: {}, credits: null, assessmentBinding: null, ...changes };
}
function project(source, result = resultFor(source), extra = {}) {
  return projectSpeciesEnrichment({ speciesObject: source, projectId, result, ...extra });
}
function withCredits(result, object) {
  const text = JSON.stringify(object, null, 2); result.credits = { text }; result.files["credits.json"] = file("credits.json", text); return result;
}
function soundResult(source) {
  return withCredits(resultFor(source, { files: { "sound.mp3": file("sound.mp3", "new-mp3"), "spectrogram.webp": file("spectrogram.webp", "new-spectrum") } }),
    { ...clone(source.data.assets.credits), recordist: "New recorder", rejectionKey: "xeno-canto:2", url: "https://example.org/new-recording" });
}

test("IUCN-Quellenzuordnung wird neben der führenden Artidentität übernommen", () => {
  const source = fixture(), result = resultFor(source);
  const binding = { scientificName: "Other fixture", queriedName: "Other fixture", matchedBy: "master-synonym",
    taxonId: "123", masterTaxonId: `mtx_${"1".repeat(32)}`, masterVersion: "fixture-master" };
  result.generated["IUCN-Zuordnung"] = binding;
  result.generated["Taxon ID"] = "123";
  const output = project(source, result);
  assert.equal(output.complete, true);
  assert.deepEqual(output.data.generated["IUCN-Zuordnung"], binding);
  assert.equal(output.data.generated["Wissenschaftlicher Name"], source.data.generated["Wissenschaftlicher Name"]);
  result.generated["IUCN-Zuordnung"].extra = "not-allowed";
  assert.throws(() => project(source, result));
});

test("the pure source helper binds the exact actual head and accepts normal server metadata without returning it", () => {
  const source = fixture(), before = clone(source), binding = speciesEnrichmentSourceBindings(source, projectId);
  assert.deepEqual(binding, { projectId, speciesId: source.id, objectRevision: revision, dataHash: digest(objectJson(source.data)) });
  assert.deepEqual(source, before); assert.doesNotMatch(JSON.stringify(binding), /authorId|createdAt|unknownInput|prompt|approval/);
  assert.deepEqual(project(source, resultFor(source), { expectedSourceBindings: binding }).sourceBindings, binding);
  for (const change of [value => { value.objectRevision = "22222222-2222-4222-8222-222222222222"; }, value => { value.dataHash = hash("other"); },
    value => { value.projectId = "other-project"; }, value => { value.speciesId = "other-species"; }]) {
    const changed = clone(binding); change(changed); assert.throws(() => project(source, resultFor(source), { expectedSourceBindings: changed }), denied("species_enrichment_changed"));
  }
});

test("a fact proposal preserves all manual and unknown input, generated, override, care and editorial fields", () => {
  const source = fixture(), before = clone(source), result = resultFor(source); result.generated.unknownInjected = { cannot: "enter" };
  result.generated.unknownGenerated = { cannot: "replace" };
  const output = project(source, result); assert.equal(output.complete, true);
  assert.deepEqual(output.data.input, before.data.input); assert.equal(output.data.input.size, 30);
  assert.deepEqual(output.data.generated.unknownGenerated, before.data.generated.unknownGenerated); assert.equal("unknownInjected" in output.data.generated, false);
  for (const name of ["fields", "reason", "updatedAt", "unknownOverride"]) assert.deepEqual(output.data.taxonomyOverride[name], before.data.taxonomyOverride[name]);
  assert.equal(output.data.generated.Family, "Manual Family"); assert.equal(output.data.taxonomyOverride.automaticFields.Family, "New Automatic Family");
  assert.deepEqual(output.data.taxonomyOverride.automaticFields.unknownComparison, ["preserve"]);
  assert.deepEqual(output.data.assets, before.data.assets); assert.deepEqual(output.data.editorial, before.data.editorial);
  assert.deepEqual(output.data.assessmentBinding, before.data.assessmentBinding); assert.deepEqual(source, before);
});

test("asset-only null or byte-identical generated results do not normalize or change any fact or taxonomy field", () => {
  const source = fixture();
  for (const generated of [null, clone(source.data.generated)]) {
    const output = project(source, { generated, files: {}, credits: null, assessmentBinding: null });
    assert.equal(output.complete, true); assert.deepEqual(output.data, source.data); assert.deepEqual(output.changes, []);
  }
  const empty = fixture({ empty: true }), output = project(empty, { generated: null, files: {}, credits: null, assessmentBinding: null });
  assert.equal(output.data.generated, null); assert.deepEqual(output.data, empty.data);
});

test("incomplete new facts retain usable previous values rather than replacing them with n/a or empty strings", () => {
  const source = fixture(), generated = { URLSlug: source.id, "Wissenschaftlicher Name": "Strix fixture", "Assessment ID": "n/a", Status: "n/a", Kategorie: "", Trend: "n/a" };
  const output = project(source, resultFor(source, { generated }));
  assert.equal(output.complete, true); assert.equal(output.data.generated["Assessment ID"], 101); assert.equal(output.data.generated.Status, "LC");
  assert.equal(output.data.generated.Kategorie, source.data.generated.Kategorie); assert.equal(output.data.generated.Trend, "Stabil");
  assert.deepEqual(output.data.taxonomyOverride.automaticFields, source.data.taxonomyOverride.automaticFields);
  assert.ok(output.issues.some(issue => issue.code === "species_enrichment_incomplete_data" && !issue.blocking));
});

test("deviating names, taxonomy identity or slug produce an explicit blocking review without renaming anything", () => {
  for (const [key, value] of [["Wissenschaftlicher Name", "Strix other"], ["Genus", "Other"], ["Species", "other"],
    ["Deutscher Name", "Andere Art"], ["Englischer Name", "Other owl"], ["URLSlug", "other-species"]]) {
    const source = fixture(), result = resultFor(source); result.generated[key] = value;
    const output = project(source, result); assert.equal(output.complete, false); assert.deepEqual(output.data, source.data); assert.deepEqual(output.changes, []);
    assert.ok(output.issues.some(issue => issue.code === "species_enrichment_name_review" && issue.field === key && issue.blocking));
  }
});

test("the exact bound generated suffix is renewed once while its manual prefix and other sections survive", () => {
  const source = fixture({ embedded: true }), before = clone(source), output = project(source);
  assert.equal(output.complete, true); const section = output.data.editorial.sections[0], embedded = output.data.editorial.embeddedGeneralText;
  assert.ok(section.text.startsWith("Manueller Einstieg\n\n")); assert.ok(section.text.endsWith(embedded));
  assert.equal(section.text.split("Manueller Einstieg").length, 2); assert.equal(section.text.split("Status:").length, 2);
  assert.match(embedded, /Status: NT/); assert.equal(section.text.includes("Status: LC"), false);
  assert.deepEqual(output.data.editorial.sections[1], before.data.editorial.sections[1]); assert.deepEqual(output.data.editorial.gallery, before.data.editorial.gallery);
  assert.deepEqual(validateSpeciesRecord(output.data), output.data); assert.deepEqual(source, before);
});

test("a matching generated paragraph without an explicit prior suffix decision is never claimed as generated text", () => {
  const source = fixture(); source.data.generated = null; source.data.taxonomyOverride = null;
  source.data.editorial.sections[0].text = "Wissenschaftlicher Name: Strix fixture\nStatus: LC";
  const output = project(source, resultFor(source, { generated: { "Wissenschaftlicher Name": "Strix fixture", Status: "LC" } }));
  assert.equal(output.complete, false); assert.ok(output.issues.some(issue => issue.code === "species_enrichment_general_review")); assert.deepEqual(output.data, source.data);
});

test("new fixed media preserve existing IDs, clear stale public URLs and never rename the historical asset folder", () => {
  const source = fixture(), result = resultFor(source, { files: { "map.jpg": file("map.jpg", "new-map") }, assessmentBinding: 202 });
  const output = project(source, result); assert.equal(output.complete, true);
  assert.deepEqual(output.data.assets.files["map.jpg"], { id: source.data.assets.files["map.jpg"].id, ...result.files["map.jpg"] });
  assert.equal("url" in output.data.assets.files["map.jpg"], false); assert.equal(output.data.assets.assetName, "Historischer Testkauz");
  assert.deepEqual(output.data.assets.files["portrait.webp"], source.data.assets.files["portrait.webp"]);
  assert.deepEqual(output.data.assessmentBinding, { id: 202, unknownBinding: ["preserve"] }); assert.deepEqual(output.data.assets.overrides, source.data.assets.overrides);
});

test("an exact unchanged media manifest preserves its existing public URL and needs no new assessment binding", () => {
  const source = fixture(), { sha256, bytes, mimeType } = source.data.assets.files["map.jpg"];
  const output = project(source, resultFor(source, { generated: null, files: { "map.jpg": { sha256, bytes, mimeType } } }));
  assert.equal(output.complete, true); assert.deepEqual(output.data, source.data);
});

test("protected map alternatives remain blocking, while byte-identical alternatives do not weaken or require a care change", () => {
  for (const care of [{ manual: true }, { protectFromPipeline: true }]) {
    const source = fixture(); Object.assign(source.data.assets.overrides.map, care);
    const changed = project(source, resultFor(source, { files: { "map.jpg": file("map.jpg", "new-protected-map") } }));
    assert.equal(changed.complete, false); assert.ok(changed.issues.some(issue => issue.code === "species_enrichment_protected_asset")); assert.deepEqual(changed.data, source.data);
    const { sha256, bytes, mimeType } = source.data.assets.files["map.jpg"];
    const same = project(source, resultFor(source, { generated: null, files: { "map.jpg": { sha256, bytes, mimeType } } }));
    assert.equal(same.complete, true); assert.deepEqual(same.data, source.data);
  }
});

test("new map assessment bindings require a real matching map manifest and preserve the original binding type or object additions", () => {
  for (const binding of [101, "101", { assessmentId: "101", extra: { original: true } }]) {
    const source = fixture(); source.data.assessmentBinding = binding;
    const output = project(source, resultFor(source, { files: { "map.jpg": file("map.jpg", "new-map") }, assessmentBinding: "202" }));
    assert.equal(output.complete, true);
    if (typeof binding === "object") assert.deepEqual(output.data.assessmentBinding, { assessmentId: "202", extra: { original: true } });
    else assert.equal(output.data.assessmentBinding, typeof binding === "string" ? "202" : 202);
  }
  for (const old of [{ id: 101, assessmentId: 101 }, { arbitrary: 101 }, { id: "opaque-original" }]) {
    const source = fixture(); source.data.assessmentBinding = old;
    const output = project(source, resultFor(source, { files: { "map.jpg": file("map.jpg", "new-map") }, assessmentBinding: 202 }));
    assert.equal(output.complete, false); assert.ok(output.issues.some(issue => issue.code === "species_enrichment_assessment_review")); assert.deepEqual(output.data, source.data);
  }
  const source = fixture();
  for (const result of [resultFor(source, { files: { "map.jpg": file("map.jpg", "new-map") } }), resultFor(source, { assessmentBinding: 202 }),
    resultFor(source, { files: { "map.jpg": file("map.jpg", "new-map") }, assessmentBinding: 303 })]) assert.equal(project(source, result).complete, false);
});

test("new sound data requires exact actual credits text and a paired spectrogram, preserving original unknown credit fields", () => {
  const source = fixture(), result = soundResult(source), before = clone(source), output = project(source, result);
  assert.equal(output.complete, true); assert.deepEqual(output.data.assets.credits, JSON.parse(result.credits.text));
  assert.deepEqual(output.data.assets.credits.retainedUnknown, source.data.assets.credits.retainedUnknown);
  for (const name of ["sound.mp3", "spectrogram.webp", "credits.json"]) assert.equal(output.data.assets.files[name].id, source.data.assets.files[name].id);
  assert.deepEqual(source, before); assert.ok(Object.isFrozen(ENRICHMENT_CREDIT_FIELDS)); assert.ok(ENRICHMENT_CREDIT_FIELDS.includes("rejectionKey"));
  for (const absent of ["spectrogram.webp", "credits"]) {
    const partial = soundResult(source);
    if (absent === "credits") { partial.credits = null; delete partial.files["credits.json"]; } else delete partial.files[absent];
    const blocked = project(source, partial); assert.equal(blocked.complete, false); assert.deepEqual(blocked.data, source.data);
  }
});

test("credit JSON hashes and bytes must match the actual UTF-8 text, with no duplicate, hidden or invented members", () => {
  const source = fixture();
  for (const alter of [value => { value.files["credits.json"].sha256 = hash("wrong"); }, value => { value.files["credits.json"].bytes++; },
    value => { value.credits = null; }, value => { delete value.files["credits.json"]; }]) {
    const result = soundResult(source); alter(result); assert.throws(() => project(source, result), denied("invalid_species_enrichment"));
  }
  for (const text of ['{"source":"first","source":"second"}', '{"source":"first","\\u0073ource":"second"}', "[]", "null", '{"__proto__":{}}']) {
    const result = resultFor(source, { credits: { text }, files: { "credits.json": file("credits.json", text) } });
    assert.throws(() => project(source, result), denied("invalid_species_enrichment"));
  }
  for (const transform of [value => { delete value.retainedUnknown; }, value => { value.retainedUnknown.notes.push("changed"); }, value => { value.newUnknown = "not permitted"; }]) {
    const changed = clone(source.data.assets.credits); transform(changed); const output = project(source, withCredits(resultFor(source), changed));
    assert.equal(output.complete, false); assert.deepEqual(output.data, source.data);
  }
});

test("manual sound care and previously rejected sources cannot be bypassed by a new manifest or credit text", () => {
  const source = fixture(); source.data.assets.overrides.sound.manual = true;
  assert.equal(project(source, soundResult(source)).complete, false);
  const creditOnly = withCredits(resultFor(source), { ...clone(source.data.assets.credits), recordist: "changed" });
  assert.equal(project(source, creditOnly).complete, false);
  delete source.data.assets.overrides.sound.manual;
  const rejected = soundResult(source), credits = JSON.parse(rejected.credits.text); credits.rejectionKey = " XENO-CANTO:99 "; withCredits(rejected, credits);
  const blocked = project(source, rejected); assert.equal(blocked.complete, false); assert.ok(blocked.issues.some(issue => issue.code === "species_enrichment_rejected_sound"));
  assert.deepEqual(blocked.data.assets.overrides, source.data.assets.overrides);
});

test("new assets receive only a stable slot ID and bound metadata, without inventing public availability", () => {
  const source = fixture({ empty: true }), output = project(source, { generated: null, files: { "portrait.webp": file("portrait.webp", "new-portrait") }, credits: null, assessmentBinding: null });
  assert.equal(output.complete, true); assert.equal(output.data.assets.files["portrait.webp"].id, "strixfixture:asset:portrait.webp");
  assert.equal("url" in output.data.assets.files["portrait.webp"], false); assert.equal(output.data.assets.portraitMetadata.prompt, "Private original prompt");
});

test("record2 keeps every rich content, source, empty decision and historical provenance while exactly rebinding changed media roles", () => {
  const source = fixture({ rich: true }), before = clone(source), output = project(source, soundResult(source)); assert.equal(output.complete, true);
  const expectedEditorial = clone(before.data.editorial); expectedEditorial.normalAssets = output.data.editorial.normalAssets;
  assert.deepEqual(output.data.editorial, expectedEditorial); assert.deepEqual(output.data.editorial.normalAssets.map, before.data.editorial.normalAssets.map);
  assert.deepEqual(output.data.editorial.normalAssets.portrait, before.data.editorial.normalAssets.portrait);
  for (const [role, name] of [["sound", "sound.mp3"], ["credits", "credits.json"], ["spectrogram", "spectrogram.webp"]]) {
    assert.equal(output.data.editorial.normalAssets[role].sha256, output.data.assets.files[name].sha256);
    assert.match(output.data.editorial.normalAssets[role].attribution, /New recorder/);
  }
  assert.deepEqual(validateSpeciesRecord(output.data), output.data); assert.deepEqual(source, before);
});

test("replacing a normal file also used by record2 gallery blocks instead of changing its image, text, order or source", () => {
  const source = fixture({ rich: true }); source.data.editorial.gallery = [{ id: "usage-map", asset: clone(source.data.editorial.normalAssets.map),
    alt: "Originale Kartenverwendung", caption: "Eigene Beschriftung", decorative: false, order: 0 }];
  const before = clone(source), output = project(source, resultFor(source, { files: { "map.jpg": file("map.jpg", "new-map") }, assessmentBinding: 202 }));
  assert.equal(output.complete, false); assert.ok(output.issues.some(issue => issue.code === "species_enrichment_gallery_review"));
  assert.deepEqual(output.data, before.data); assert.deepEqual(source, before);
});

test("large record2 editorial text stays complete and projections own their nested data", () => {
  const source = fixture({ rich: true }); source.data.editorial.sections[1].blocks = Array.from({ length: 7 }, (_, index) => ({ type: "paragraph", text: `${index}:` + "x".repeat(80000) }));
  const before = clone(source), output = project(source); assert.equal(output.complete, true); assert.deepEqual(output.data.editorial, before.data.editorial);
  output.data.input.unknownInput.nested.push("external mutation"); output.data.editorial.sections[1].blocks[0].text = "external mutation";
  assert.deepEqual(source, before);
});

test("source person metadata is not authority, while pending or conflicting heads, other project contexts and wrong versions are rejected", () => {
  for (const mutate of [value => { value.localPending = true; }, value => { value.localConflict = true; }, value => { value.revision = hash("not-uuid"); },
    value => { value.kind = "page"; }, value => { value.id = ""; }, value => { value.id = null; }, value => { value.data.schemaVersion = 3; }]) {
    const source = fixture(); mutate(source); assert.throws(() => speciesEnrichmentSourceBindings(source, projectId));
  }
  const rich = fixture({ rich: true }); assert.throws(() => speciesEnrichmentSourceBindings(rich, "foreign-project"), denied("invalid_species_enrichment"));
  const source = fixture(); source.authorId = "unrelated-metadata"; assert.equal(project(source).complete, true);
});

test("result metadata cannot inject paths, URLs, IDs, private structures, other files, wrong formats or invalid assessment IDs", () => {
  const source = fixture();
  for (const result of [resultFor(source, { files: { "portrait.json": file("credits.json", "{}") } }),
    resultFor(source, { files: { "../map.jpg": file("map.jpg", "new-map") } }),
    resultFor(source, { files: { "map.jpg": { ...file("map.jpg", "new-map"), url: "https://example.org/invented" } } }),
    resultFor(source, { files: { "map.jpg": { ...file("map.jpg", "new-map"), id: "new-free-id" } } }),
    resultFor(source, { files: { "map.jpg": file("sound.mp3", "wrong-mime") } }),
    resultFor(source, { files: { "sound.mp3": { ...file("sound.mp3", "too-large"), bytes: 50 * 1024 * 1024 + 1 } } }),
    resultFor(source, { assessmentBinding: { id: 202 } }), resultFor(source, { assessmentBinding: "202suffix" }), resultFor(source, { assessmentBinding: 0 }),
    resultFor(source, { assets: { overrides: {} } }), resultFor(source, { editorial: {} })])
    assert.throws(() => project(source, result), denied("invalid_species_enrichment"));
});

test("accessors, proxies, inherited and hidden request members cannot manufacture a pure source or proposal", () => {
  const source = fixture(); let getterCalls = 0;
  const getter = resultFor(source); Object.defineProperty(getter, "generated", { enumerable: true, get() { getterCalls++; return {}; } });
  const hidden = resultFor(source); Object.defineProperty(hidden, "secret", { value: "cannot disappear" });
  for (const result of [getter, hidden, new Proxy(resultFor(source), {}), Object.assign(Object.create({ forged: true }), resultFor(source))])
    assert.throws(() => project(source, result), denied("invalid_species_enrichment"));
  const objectGetter = clone(source); Object.defineProperty(objectGetter, "data", { enumerable: true, get() { getterCalls++; return source.data; } });
  assert.throws(() => speciesEnrichmentSourceBindings(objectGetter, projectId), denied("invalid_species_enrichment")); assert.equal(getterCalls, 0);
});

test("the projection does not grant the generic manual-edit path permission to change protected fields", () => {
  const source = fixture(), output = project(source); assert.equal(output.complete, true);
  assert.throws(() => guardSpeciesRecordTransition({ objectId: source.id, before: source.data, next: output.data }), denied("species_record_protected"));
  assert.equal("approval" in output.data, false); assert.equal("permission" in output, false); assert.equal("queue" in output, false);
  assert.equal(canonicalJson(source.data.input), canonicalJson(output.data.input));
});
