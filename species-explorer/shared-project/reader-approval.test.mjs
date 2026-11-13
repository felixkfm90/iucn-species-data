import test from "node:test";
import assert from "node:assert/strict";
import { canonicalJson, digest } from "./security.mjs";
import { readerMediaRequirements } from "./reader-projection.mjs";
import { validateReaderApprovalPreview } from "./reader-approval.mjs";

const expected = { projectId: "reader-project", userId: "reviewer", role: "publisher", speciesId: "fixture-owl",
  revision: "11111111-1111-4111-8111-111111111111", dataHash: "b".repeat(64) };
function preview({ large = false, missing = false } = {}) {
  const readerSpecies = { id: expected.speciesId, scientificName: "Strix fixture", commonName: "Testkauz", taxonomy: [], general: [],
    status: { category: "", status: "", trend: "", population: "" }, websiteUrl: null,
    content: { kind: "structured", title: "Menschlicher Titel", introduction: [], sources: [], galleryRequested: false,
      sections: [{ id: "general", kind: "general-module", title: "Allgemein", requested: false, blocks: [], sources: [], intentionallyEmpty: false },
        { id: "appearance", kind: "editorial", title: "Aussehen", requested: true, blocks: Array.from({ length: large ? 12 : 1 }, (_, index) => ({ type: "paragraph", text: `${index}: ${"Vollständiger Fachtext. ".repeat(large ? 2200 : 1)}` })), sources: [], intentionallyEmpty: false },
        { id: "map", kind: "map-module", title: "Verbreitungskarte", requested: false, blocks: [], sources: [], intentionallyEmpty: false }] },
    media: { portrait: missing ? { kind: "unavailable", id: "original-file", projectId: expected.projectId, sha256: "a".repeat(64), bytes: 123,
      mimeType: "image/webp", attribution: "Eigene Aufnahme", reason: "not-provided" } : null, map: null, spectrogram: null, sounds: [], gallery: [] } };
  return { schemaVersion: 1, projectId: expected.projectId, user: { id: expected.userId, role: expected.role }, speciesId: expected.speciesId,
    revision: expected.revision, dataHash: expected.dataHash, readerHash: digest(canonicalJson(readerSpecies, { maxBytes: 4 * 1024 * 1024, maxNodes: 300000 })),
    readerSpecies, missingMedia: readerMediaRequirements(readerSpecies), internalOnly: true, externalPublication: "not-performed" };
}
test("reader approval validates the full human-visible projection and returns detached source-bound data", () => {
  const input = preview(), result = validateReaderApprovalPreview(input, expected); assert.deepEqual(result, input);
  result.readerSpecies.content.title = "Changed return"; assert.equal(input.readerSpecies.content.title, "Menschlicher Titel");
});
test("large structured reader approvals preserve more than the old generic or 512KiB review envelope", () => {
  const input = preview({ large: true }); assert.ok(Buffer.byteLength(JSON.stringify(input)) > 512 * 1024);
  assert.deepEqual(validateReaderApprovalPreview(input, expected), input);
});
test("reader approval rejects a different actor, source, role or unsupported result envelope", () => {
  for (const mutate of [value => { value.projectId = "foreign"; }, value => { value.user.id = "another-person"; },
    value => { value.user.role = "admin"; }, value => { value.user.extra = true; }, value => { value.speciesId = "other-owl"; },
    value => { value.revision = "22222222-2222-4222-8222-222222222222"; }, value => { value.dataHash = "c".repeat(64); },
    value => { value.schemaVersion = 2; }, value => { value.internalOnly = false; }, value => { value.externalPublication = "done"; },
    value => { value.unknown = "Would be ignored"; }]) {
    const input = preview(); mutate(input); assert.throws(() => validateReaderApprovalPreview(input, expected), error => error.code === "invalid_reader_approval_response");
  }
});
test("reader approval binds both all reader bytes and exact outstanding media rather than trusting a ready flag", () => {
  const input = preview({ missing: true }); assert.equal(validateReaderApprovalPreview(input, expected).missingMedia.length, 1);
  for (const mutate of [value => { value.readerHash = "c".repeat(64); }, value => { value.readerSpecies.content.title = "Unexpected text"; },
    value => { value.missingMedia = []; }, value => { value.missingMedia.push({ role: "map", id: "not-requested" }); }]) {
    const altered = structuredClone(input); mutate(altered); assert.throws(() => validateReaderApprovalPreview(altered, expected), error => error.code === "invalid_reader_approval_response");
  }
});
