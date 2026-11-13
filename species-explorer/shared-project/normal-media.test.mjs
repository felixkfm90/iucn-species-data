import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonicalJson } from "./security.mjs";
import { NORMAL_MEDIA_SLOTS, NORMAL_MEDIA_MIMES, NORMAL_MEDIA_LIMITS, NORMAL_MEDIA_SCHEMA_COLUMNS,
  normalMediaBinding, normalMediaContentId, validateNormalMediaDeclaration } from "./normal-media.mjs";

const projectId = "normal-media-project";
const sha = value => createHash("sha256").update(value).digest("hex");
const revision = "11111111-1111-4111-8111-111111111111";
function recordFixture() {
  return { type: "fn-species-record", schemaVersion: 1, id: "fixture-owl",
    input: { german: "Testkauz", genus: "Strix", species: "fixture", unknownOriginal: { preserved: [7, false, null] } },
    generated: { URLSlug: "fixture-owl", Class: "Aves", originalGenerated: { preserved: true } },
    taxonomyOverride: null, assessmentBinding: { original: "preserved" }, assets: { assetName: "Historischer Testkauz",
      files: { "portrait.webp": { id: "legacy-portrait:42", sha256: "a".repeat(64), bytes: 1001, mimeType: "image/webp" },
        "map.jpg": { id: "legacy.map-v1", sha256: "b".repeat(64), bytes: 1002, mimeType: "image/jpeg" },
        "sound.mp3": { id: "sound-source:unchanged", sha256: "c".repeat(64), bytes: 1003, mimeType: "audio/mpeg" },
        "spectrogram.webp": { id: "legacy-spectrum_1", sha256: "d".repeat(64), bytes: 1004, mimeType: "image/webp" } },
      overrides: { map: { source: "Geschützte Eigenkarte", manual: true } },
      credits: { recordist: "Recorder", license: "CC BY", source: "Eigene Tonquelle", url: "https://example.org/audio", privateNote: "Do not expose" },
      portraitMetadata: { type: "Foto", source: "FN Aufnahmen", generation_method: "Unverändertes Verfahren", prompt: "Private original prompt" } },
    editorial: { websiteUrl: null, sections: [], gallery: [], generalSectionId: null, embeddedGeneralText: null } };
}
function bindingFixture(slot = "portrait.webp") {
  const value = normalMediaBinding(recordFixture(), { projectId, slot });
  const { contentId, ...body } = value; return { value, body };
}
function declaration(slot = "portrait.webp") {
  return { speciesId: "fixture-owl", slot, expectedRevision: revision, asset: bindingFixture(slot).body.asset,
    expectedBinding: { projectId, userId: "fixture-editor", role: "contributor" } };
}

test("normal media contract exposes only the four existing formats and bounded transfer constants", () => {
  assert.deepEqual(NORMAL_MEDIA_SLOTS, ["portrait.webp", "map.jpg", "sound.mp3", "spectrogram.webp"]);
  assert.deepEqual(NORMAL_MEDIA_MIMES, { "portrait.webp": "image/webp", "map.jpg": "image/jpeg", "sound.mp3": "audio/mpeg", "spectrogram.webp": "image/webp" });
  assert.equal(NORMAL_MEDIA_LIMITS.imageBytes, 20 * 1024 * 1024); assert.equal(NORMAL_MEDIA_LIMITS.imagePixels, 40_000_000);
  assert.equal(NORMAL_MEDIA_LIMITS.soundBytes, 50 * 1024 * 1024);
  assert.equal(Object.isFrozen(NORMAL_MEDIA_SLOTS), true); assert.equal(Object.isFrozen(NORMAL_MEDIA_MIMES), true);
  assert.equal(Object.isFrozen(NORMAL_MEDIA_LIMITS), true); assert.equal(Object.isFrozen(NORMAL_MEDIA_SCHEMA_COLUMNS), true);
  assert.equal(NORMAL_MEDIA_SCHEMA_COLUMNS.normal_media_blobs, "sha256,bytes,mime_type,width,height,data");
  assert.equal(NORMAL_MEDIA_SCHEMA_COLUMNS.normal_media_assets,
    "content_id,project_id,species_id,slot,source_id,sha256,bytes,mime_type,attribution,source_revision,creator_id,created_at,blob_sha256");
});

test("protected normal file IDs and exact curated attribution are retained without a website or invented URL", () => {
  const record = recordFixture(), before = structuredClone(record);
  const attribution = { "portrait.webp": "Foto · FN Aufnahmen · Unverändertes Verfahren", "map.jpg": "Quelle: Geschützte Eigenkarte",
    "sound.mp3": "Recorder · CC BY · Eigene Tonquelle · https://example.org/audio",
    "spectrogram.webp": "Recorder · CC BY · Eigene Tonquelle · https://example.org/audio" };
  for (const slot of NORMAL_MEDIA_SLOTS) {
    const value = normalMediaBinding(record, { projectId, slot });
    assert.deepEqual(value.asset, { ...record.assets.files[slot], projectId, attribution: attribution[slot] });
    assert.deepEqual(Object.keys(value).sort(), ["contentId", "projectId", "speciesId", "slot", "asset"].sort());
    assert.deepEqual(Object.keys(value.asset).sort(), ["id", "projectId", "sha256", "bytes", "mimeType", "attribution"].sort());
    assert.equal(value.asset.id, record.assets.files[slot].id); assert.equal(value.speciesId, record.id);
    assert.match(value.contentId, /^normal-[a-f0-9]{64}$/);
    assert.doesNotMatch(JSON.stringify(value), /Private original prompt|Do not expose|Historischer Testkauz|"url"|websiteUrl/);
  }
  assert.deepEqual(record, before);
});

test("content ID is the canonical hash of exact project, species, slot and all six original metadata fields", () => {
  const { body, value } = bindingFixture();
  assert.equal(value.contentId, `normal-${sha(canonicalJson(body))}`);
  const reordered = Object.fromEntries(Object.entries(body).reverse());
  reordered.asset = Object.fromEntries(Object.entries(body.asset).reverse());
  assert.equal(normalMediaContentId(reordered), value.contentId);
  assert.equal(normalMediaContentId(JSON.parse(JSON.stringify(body))), value.contentId);
  for (const mutate of [input => { input.projectId = "another-project"; input.asset.projectId = input.projectId; },
    input => { input.speciesId = "another-species"; }, input => { input.slot = "spectrogram.webp"; },
    input => { input.asset.id = "another-original-id"; }, input => { input.asset.sha256 = "e".repeat(64); },
    input => { input.asset.bytes++; }, input => { input.asset.attribution = "Andere unveränderliche Quelle"; }]) {
    const changed = structuredClone(body); mutate(changed); assert.notEqual(normalMediaContentId(changed), value.contentId);
  }
  const jpeg = structuredClone(body); jpeg.slot = "map.jpg"; jpeg.asset.mimeType = "image/jpeg";
  assert.equal(normalMediaContentId(jpeg), `normal-${sha(canonicalJson(jpeg))}`);
  assert.notEqual(normalMediaContentId(jpeg), value.contentId);
});

test("different byte versions retain the same old file ID while obtaining different immutable content bindings", () => {
  const record = recordFixture(), first = normalMediaBinding(record, { projectId, slot: "sound.mp3" });
  record.assets.files["sound.mp3"].sha256 = "f".repeat(64); record.assets.files["sound.mp3"].bytes++;
  const second = normalMediaBinding(record, { projectId, slot: "sound.mp3" });
  assert.equal(second.asset.id, first.asset.id); assert.notEqual(second.contentId, first.contentId);
  const changedSource = recordFixture(); changedSource.assets.credits.source = "Andere belegte Tonquelle";
  const third = normalMediaBinding(changedSource, { projectId, slot: "sound.mp3" });
  assert.equal(third.asset.sha256, first.asset.sha256); assert.notEqual(third.contentId, first.contentId);
});

test("absent and zero-byte slots stay null and an unrelated oversized role cannot block a valid selected file", () => {
  const record = recordFixture(); delete record.assets.files["map.jpg"]; record.assets.files["spectrogram.webp"].bytes = 0;
  record.assets.files["sound.mp3"].bytes = NORMAL_MEDIA_LIMITS.soundBytes + 1;
  const before = structuredClone(record);
  assert.equal(normalMediaBinding(record, { projectId, slot: "map.jpg" }), null);
  assert.equal(normalMediaBinding(record, { projectId, slot: "spectrogram.webp" }), null);
  assert.equal(normalMediaBinding(record, { projectId, slot: "portrait.webp" }).asset.id, "legacy-portrait:42");
  assert.throws(() => normalMediaBinding(record, { projectId, slot: "sound.mp3" }), error => error.status === 413 && error.code === "normal_media_too_large");
  assert.deepEqual(record, before);
});

test("a thirty-two-to-fifty-MiB MP3 uses the single protected role without relaxing Page or image budgets", () => {
  const record = recordFixture(); record.assets.files["sound.mp3"].bytes = 40 * 1024 * 1024;
  const sound = normalMediaBinding(record, { projectId, slot: "sound.mp3" });
  assert.equal(sound.asset.bytes, 40 * 1024 * 1024); assert.equal(sound.asset.id, "sound-source:unchanged");
  record.assets.files["sound.mp3"].bytes = NORMAL_MEDIA_LIMITS.soundBytes;
  assert.equal(normalMediaBinding(record, { projectId, slot: "sound.mp3" }).asset.bytes, NORMAL_MEDIA_LIMITS.soundBytes);
  record.assets.files["portrait.webp"].bytes = NORMAL_MEDIA_LIMITS.imageBytes;
  assert.equal(normalMediaBinding(record, { projectId, slot: "portrait.webp" }).asset.bytes, NORMAL_MEDIA_LIMITS.imageBytes);
});

test("transfer limits reject oversized originals clearly and preserve their metadata and identity", () => {
  for (const slot of NORMAL_MEDIA_SLOTS) {
    const record = recordFixture();
    record.assets.files[slot].bytes = (slot === "sound.mp3" ? NORMAL_MEDIA_LIMITS.soundBytes : NORMAL_MEDIA_LIMITS.imageBytes) + 1;
    const before = structuredClone(record);
    assert.throws(() => normalMediaBinding(record, { projectId, slot }), error => error.status === 413
      && error.code === "normal_media_too_large" && error.message.includes("Original bleibt erhalten"));
    assert.deepEqual(record, before);
  }
});

test("normal declarations preserve exact project, source revision, writer role and independent metadata", () => {
  for (const role of ["admin", "publisher", "contributor"]) {
    const input = declaration("sound.mp3"); input.expectedBinding.role = role;
    const before = structuredClone(input), checked = validateNormalMediaDeclaration(input);
    assert.deepEqual(checked, before); assert.deepEqual(input, before);
    checked.asset.attribution = "Andere Quelle"; checked.expectedBinding.userId = "other-user";
    assert.deepEqual(input, before);
  }
});

test("declaration source IDs, project, slot, MIME and real UUID revision cannot be replaced by ambiguous claims", () => {
  for (const mutate of [input => { input.expectedRevision = "not-a-server-revision"; }, input => { input.expectedRevision = "0".repeat(64); },
    input => { input.expectedRevision = "11111111-1111-0111-0111-111111111111"; }, input => { input.expectedBinding.role = "reader"; },
    input => { input.expectedBinding.role = "owner"; }, input => { input.asset.projectId = "other-project"; },
    input => { input.asset.id = "invalid/file-id"; }, input => { input.asset.sha256 = "A".repeat(64); },
    input => { input.asset.mimeType = "image/jpeg"; }, input => { input.speciesId = "../outside"; },
    input => { input.asset.bytes = 0; }, input => { input.asset.bytes = 1.5; }, input => { input.asset.bytes = Number.MAX_SAFE_INTEGER + 1; }]) {
    const input = declaration(); mutate(input); assert.throws(() => validateNormalMediaDeclaration(input));
  }
  for (const slot of ["../portrait.webp", "portrait", "credits.json", "portrait.json", "https://example.org/map.jpg"]) {
    const input = declaration(); input.slot = slot;
    assert.throws(() => validateNormalMediaDeclaration(input));
    assert.throws(() => normalMediaBinding(recordFixture(), { projectId, slot }));
  }
});

test("strict normal declarations and content hashing reject unknown fields instead of discarding URLs or paths", () => {
  for (const mutate of [input => { input.url = "https://example.org/arbitrary"; }, input => { input.asset.url = "https://example.org/photo.webp"; },
    input => { input.asset.path = "private-file"; }, input => { input.asset.width = 1; },
    input => { input.expectedBinding.unknown = true; }, input => { delete input.asset.attribution; },
    input => { delete input.expectedRevision; }]) {
    const input = declaration(); mutate(input); assert.throws(() => validateNormalMediaDeclaration(input));
  }
  const { body } = bindingFixture(); body.contentId = "normal-claimed";
  assert.throws(() => normalMediaContentId(body));
});

test("normal media contracts read plain data only, never access getters or proxies, and never drop hidden or symbolic fields", () => {
  let accessed = false;
  const getter = declaration(); Object.defineProperty(getter.asset, "attribution", { enumerable: true, get() { accessed = true; return "forged"; } });
  const hidden = declaration(); Object.defineProperty(hidden, "hidden", { value: "Do not discard" });
  const symbol = declaration(); symbol[Symbol("Do not discard")] = true;
  const proxy = new Proxy(declaration(), { ownKeys() { accessed = true; throw new Error("Must not execute"); } });
  const sparse = declaration(); sparse.asset = [];
  for (const value of [getter, hidden, symbol, proxy, sparse]) assert.throws(() => validateNormalMediaDeclaration(value));
  const record = recordFixture(); Object.defineProperty(record.input, "german", { enumerable: true, get() { accessed = true; return "forged"; } });
  assert.throws(() => normalMediaBinding(record, { projectId, slot: "portrait.webp" }));
  const { body } = bindingFixture();
  assert.throws(() => normalMediaContentId(new Proxy(body, { ownKeys() { accessed = true; throw new Error("Must not execute"); } })));
  assert.equal(accessed, false);
});

test("returned normal bindings cannot mutate source records or alias a later independent binding", () => {
  const record = recordFixture(), before = structuredClone(record);
  const first = normalMediaBinding(record, { projectId, slot: "map.jpg" });
  first.asset.attribution = "Changed output"; first.asset.id = "other-id";
  const second = normalMediaBinding(record, { projectId, slot: "map.jpg" });
  assert.equal(second.asset.id, "legacy.map-v1"); assert.equal(second.asset.attribution, "Quelle: Geschützte Eigenkarte");
  assert.deepEqual(record, before);
});
