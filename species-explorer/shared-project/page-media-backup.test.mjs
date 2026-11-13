import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { checkedPageJournalMedia, collectPageMediaRequirements, hasManagedPageMedia, pageMediaRequirementHash, validatePageMediaBackup } from "./page-media-backup.mjs";
import { normalizeSpeciesSnapshot } from "../page-authoring/model.mjs";

const normal = { id: "portrait", projectId: "project-a", sha256: "a".repeat(64), bytes: 64, mimeType: "image/webp", attribution: "Eigene Aufnahme" };
const image = { ...normal, id: "image-00000000-0000-4000-8000-000000000001" };
const requirement = (asset = normal) => ({ origin: "https://project.invalid", actorId: "user-a", asset });
const coverage = { scope: "authoring-database-and-media-references-only", mediaBytesIncluded: false, sharedSyncKnown: false, authorityRevalidated: false, publicVerificationPerformed: false };
const legacyShape = ({ projectId, id, sha256, bytes, mimeType }) => ({ projectId, id, sha256, bytes, mimeType });
const result = (asset = normal) => ({ requiredMedia: [legacyShape(asset)], scopedRequiredMedia: [requirement(asset)], coverage });

test("normal FN references remain explicitly external while managed images need included cache evidence", () => {
  const checked = checkedPageJournalMedia(result()), external = validatePageMediaBackup({ caches: [], requirements: checked.scopedRequiredMedia });
  assert.equal(hasManagedPageMedia(checked), false);
  assert.deepEqual(external, [{ requirementSha256: pageMediaRequirementHash(requirement()), storage: "external-reference", localBytesIncluded: false, requiredServerMedia: false, serverBytesIncluded: false }]);
  const managed = checkedPageJournalMedia(result(image)); assert.equal(hasManagedPageMedia(managed), true);
  assert.throws(() => validatePageMediaBackup({ caches: [], requirements: managed.scopedRequiredMedia }), /Seitenentwurf fehlen/);
});

test("full attribution and origin/person requirements stay distinct even when a legacy five-field summary has one entry", () => {
  const value = result(image); value.scopedRequiredMedia.push(requirement({ ...image, attribution: "Andere historische Quelle" }), { ...requirement(image), origin: "https://other.invalid" },
    { ...requirement(image), actorId: "user-b" }, { ...requirement(image), origin: null, actorId: null });
  const checked = checkedPageJournalMedia(value), hashes = checked.scopedRequiredMedia.map(pageMediaRequirementHash);
  assert.equal(new Set(hashes).size, 5); assert.equal(checked.requiredMedia.length, 1); assert.equal(checked.scopedRequiredMedia.length, 5);
  assert.throws(() => checkedPageJournalMedia({ ...value, scopedRequiredMedia: [...value.scopedRequiredMedia, value.scopedRequiredMedia[0]] }), /doppelte Bindungen/);
});

test("unknown source fields and fabricated coverage cannot enter page-media backup proofs", () => {
  assert.equal(checkedPageJournalMedia({ projectIds: [], pending: 0 }), null);
  for (const alter of [value => { delete value.scopedRequiredMedia; }, value => { value.scopedRequiredMedia[0].extra = true; },
    value => { value.scopedRequiredMedia[0].asset.localPath = "not-allowed"; }, value => { value.scopedRequiredMedia[0].origin = "https://user:secret@project.invalid"; },
    value => { value.scopedRequiredMedia[0].actorId = null; }, value => { value.coverage.mediaBytesIncluded = true; }, value => { value.coverage.extra = true; }]) {
    const value = structuredClone(result(image)); alter(value); assert.throws(() => checkedPageJournalMedia(value));
  }
});

function documentWithNormal(asset = image) {
  return { slug: "anderer-websiteslug", species: normalizeSpeciesSnapshot({ slug: "test-art", scientificName: "Strix fixture", commonName: "Testart",
    assetName: "Testart", taxonomy: [], general: [], status: "", revision: "source-a", dataSha256: "b".repeat(64), runtimeReady: true,
    normalAssets: { portrait: asset, map: null, sound: null, spectrogram: null, credits: null } }, "project-a", "test-art"), images: [] };
}
test("an image UUID in the actual portrait slot is normal, not an image-registry requirement", () => {
  const document = documentWithNormal(), before = structuredClone(document);
  const requirements = collectPageMediaRequirements(document, { projectId: "project-a", origin: "https://project.invalid", actorId: "user-a" });
  assert.deepEqual(requirements, [{ ...requirement(image), domain: "normal", speciesId: "test-art", slot: "portrait.webp" }]);
  assert.deepEqual(validatePageMediaBackup({ caches: [], requirements }), [{ requirementSha256: pageMediaRequirementHash(requirements[0]),
    storage: "external-reference", localBytesIncluded: false, requiredServerMedia: false, serverBytesIncluded: false }]);
  assert.deepEqual(document, before);
});
test("only all six matching normal fields exempt a gallery use, never its ID prefix", () => {
  const document = documentWithNormal(); document.images = [{ asset: image }, { asset: { ...image, attribution: "Anderer Quellenbeleg" } }];
  const requirements = collectPageMediaRequirements(document, { projectId: "project-a", origin: "https://project.invalid", actorId: "user-a" });
  assert.equal(requirements.length, 2);
  assert.deepEqual(requirements.map(entry => entry.domain).sort(), ["image", "normal"]);
  assert.equal(requirements.find(entry => entry.domain === "normal").speciesId, "test-art");
  assert.equal(requirements.find(entry => entry.domain === "image").slot, null);
  assert.throws(() => validatePageMediaBackup({ caches: [], requirements }), /Seitenentwurf fehlen/);
});
test("legacy requirement digests stay byte-identical and new contextual fields cannot be partial or fabricated", () => {
  // Fixed pre-context digest: extending a new format must not silently reinterpret historical proof hashes.
  const historicalJson = `{"actorId":"user-a","asset":{"attribution":"Eigene Aufnahme","bytes":64,"id":"image-00000000-0000-4000-8000-000000000001","mimeType":"image/webp","projectId":"project-a","sha256":"${"a".repeat(64)}"},"origin":"https://project.invalid"}`;
  assert.equal(pageMediaRequirementHash(requirement(image)), createHash("sha256").update(historicalJson).digest("hex"));
  const typed = { ...requirement(normal), domain: "normal", speciesId: "test-art", slot: "portrait.webp" };
  const checked = checkedPageJournalMedia({ ...result(normal), scopedRequiredMedia: [typed] });
  assert.equal(checked.schemaVersion, 2); assert.notEqual(pageMediaRequirementHash(typed), pageMediaRequirementHash(requirement(normal)));
  for (const extra of [{ domain: "normal" }, { domain: "normal", speciesId: "wrong/species", slot: "portrait.webp" },
    { domain: "normal", speciesId: "test-art", slot: "credits.json" }, { domain: "image", speciesId: "test-art", slot: "portrait.webp" }]) {
    assert.throws(() => pageMediaRequirementHash({ ...requirement(normal), ...extra }));
  }
});
