import assert from "node:assert/strict";
import test from "node:test";
import { bindImageInput, bindTextInput, buildContentRequest, validateContentResponse, normalizeAltProposal } from "./content.mjs";
import { fingerprint } from "../page-authoring/contract.mjs";
import { createTestJpeg } from "../server-test-fixtures.mjs";
import { createLocalAiService } from "./service.mjs";
import { sha256 } from "./files.mjs";
import { pixel, waitJob } from "./test-fixtures.mjs";

const input = () => ({ bytes: Buffer.from("synthetic-bound-image"), mimeType: "image/png",
  context: { pageType: "species", title: "Eisvogel", coupledCaption: false }, binding: { revision: "synthetic-revision" },
  target: { sectionId: "appearance", intentionallyEmpty: false }, sources: [{ id: "A", text: "Eine blaue Oberseite." }], draft: "Eine grüne Oberseite." });

function pageCommon(kind) {
  const origin = "https://project.invalid", projectId = "project-a", userId = "person-a";
  return { type: "page-authoring", kind, origin, projectId, userId, role: "publisher", sourceScope: fingerprint([origin, projectId, userId]),
    documentId: "draft-a", revision: sha256(Buffer.from("page-revision")), authorizationHash: "1".repeat(64), snapshotHash: "2".repeat(64), targetHash: "3".repeat(64), inputProof: "4".repeat(64) };
}
function pageImage() {
  const bytes = createTestJpeg(3, 2), digest = sha256(bytes);
  return { bytes, mimeType: "image/jpeg", sha256: digest, sourceSha256: "5".repeat(64),
    binding: { ...pageCommon("alt-text"), imageId: "position-a", assetId: "image-asset", imageSha256: digest, sourceSha256: "5".repeat(64), metadataHash: "6".repeat(64) },
    context: { pageType: "species", title: "Testart", commonName: "Testart", coupledCaption: false } };
}
function pageText(kind = "source-text") {
  const common = pageCommon(kind), sourceId = "source-" + "a".repeat(64);
  const normalized = bindTextInput({ binding: { documentId: common.documentId, revision: common.revision },
    target: { sectionId: "appearance", title: "Aussehen", intentionallyEmpty: false },
    sources: [{ id: sourceId, title: "Gelieferter Arttext", revision: "7".repeat(64), text: "Eine blaue Oberseite." }], draft: "Eine grüne Oberseite." }, kind);
  return { ...normalized, binding: { ...common, ...normalized.binding, sourceCatalogRevision: "8".repeat(64), sourceIds: [sourceId], selectedSourcesHash: fingerprint(normalized.sources) } };
}

test("Reiseübersichten erhalten kurze KI-Alttexte ohne Schlusspunkt und ohne gekoppelte Beschriftung", () => {
  const pageUrl = "https://www.fnwildlifetravel.de/reisen/2020-sizilien";
  const result = normalizeAltProposal({ pageType: "travel-overview", coupledCaption: false }, { pageUrl }, "Blick auf den Hafen.");
  assert.deepEqual(result, { text: "Blick auf den Hafen", caption: null });
  for (const text of ["Ruinen aus dem 5. Jh.", "Blick auf Hafen Nr.", "Am Hafen ..."]) {
    assert.equal(normalizeAltProposal({ pageType: "travel-overview" }, { pageUrl }, text).text, text);
  }
});

test("alle Inhaltsarten senden das Schema im von b11960 gelesenen JSON-Schema-Wrapper", async (t) => {
  for (const [kind, required] of [["alt-text", ["text", "uncertainties"]], ["source-text", ["paragraphs"]], ["review-text", ["findings"]]]) {
    await t.test(kind, () => {
      const request = JSON.parse(JSON.stringify(buildContentRequest(kind, input())));
      assert.equal(request.response_format.type, "json_schema");
      assert.equal(request.response_format.schema, undefined);
      assert.equal(request.response_format.json_schema.strict, true);
      assert.match(request.response_format.json_schema.name, /^[a-zA-Z0-9_-]{1,64}$/);
      const schema = request.response_format.json_schema.schema;
      assert.equal(schema.type, "object");
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual(schema.required, required);
      assert.deepEqual(Object.keys(schema.properties), required);
    });
  }
});

test("Bildantwort mit description oder fehlenden Pflichtfeldern bleibt unzulässig", () => {
  for (const response of [{ description: "Eisvogel auf einem Ast." }, { text: "Eisvogel auf einem Ast." },
    { uncertainties: [] }, { text: "Eisvogel auf einem Ast.", uncertainties: [], description: "Zusatz" }]) {
    assert.throws(() => validateContentResponse("alt-text", response, input()));
  }
  const result = validateContentResponse("alt-text", { text: "Eisvogel auf einem Ast.", uncertainties: [] }, input());
  assert.equal(result.text, "Eisvogel auf einem Ast.");
  assert.equal(result.approved, false);
  assert.equal(result.transferred, false);
});

test("Alttextgenerierung bindet kurze Strings und höchstens zwei Hinweise bei 384 Tokens", () => {
  const request = buildContentRequest("alt-text", input()), schema = request.response_format.json_schema.schema;
  assert.deepEqual(schema.properties.text, { type: "string", minLength: 1, maxLength: 240 });
  assert.deepEqual(schema.properties.uncertainties, { type: "array", maxItems: 2, items: { type: "string", minLength: 1, maxLength: 120 } });
  assert.equal(request.max_tokens, 384);
  assert.match(request.messages[1].content[0].text, /einem knappen Satz/);
  assert.match(request.messages[1].content[0].text, /höchstens 25 Wörter/);
  for (const kind of ["source-text", "review-text"]) assert.equal(buildContentRequest(kind, input()).max_tokens, 512);
});

test("bestehende Antwortgrenzen bleiben 500 Zeichen, 50 Wörter und acht Hinweise mit je 300 Zeichen", () => {
  const validate = (text, uncertainties = []) => validateContentResponse("alt-text", { text, uncertainties }, input());
  assert.equal(validate("a".repeat(500), Array(8).fill("b".repeat(300))).text.length, 500);
  assert.equal(validate(Array(50).fill("Wort").join(" ")).text.split(" ").length, 50);
  assert.throws(() => validate("a".repeat(501)));
  assert.throws(() => validate(Array(51).fill("Wort").join(" ")));
  assert.throws(() => validate("Vogel", Array(9).fill("Hinweis")));
  assert.throws(() => validate("Vogel", ["b".repeat(301)]));
});

test("ungültige Modellantwort wird ohne Abschneiden, Fallback oder zweiten Modellaufruf als failed erhalten", async (t) => {
  for (const [name, response] of [["description", { description: "Ein Vogel auf einem Ast." }],
    ["characters", { text: "a".repeat(501), uncertainties: [] }],
    ["words", { text: Array(51).fill("Wort").join(" "), uncertainties: [] }]]) {
    await t.test(name, async (st) => {
      let calls = 0;
      const pageUrl = "https://www.fnwildlifetravel.de/wildlife/heimische-tierwelt/alcedoatthis";
      const image = { bytes: pixel, mimeType: "image/png", sha256: sha256(pixel),
        binding: { pageUrl, imageKey: "image-1", revision: "image-revision" }, context: input().context };
      const before = structuredClone(image);
      const service = createLocalAiService({ worker: { complete: async () => { calls += 1; return response; },
        status: () => ({ state: "stopped" }), stop: async () => {}, close: async () => {} },
        loadImage: async () => image, loadTextContext: async () => input(), isBindingCurrent: async () => true });
      st.after(() => service.close());
      const request = { ownerId: "felix", requestId: `invalid-${name}`, imageKey: "image-1", pageUrl, observationHash: "image-revision" };
      const job = service.suggestAltText(request), result = await waitJob(service, job);
      assert.equal(result.status, "failed"); assert.equal(result.result, null);
      assert.equal(result.approved, false); assert.equal(result.transferred, false);
      assert.equal(service.suggestAltText(request).jobId, job.jobId);
      assert.equal(service.get(job.jobId, "felix").status, "failed");
      assert.equal(calls, 1);
      assert.deepEqual(structuredClone(image), before);
    });
  }
});

test("typisierte Pagebilder behalten die vollständige signierte Bindung ohne erfundene öffentliche Seite", () => {
  const raw = pageImage(), before = structuredClone(raw.binding), bound = bindImageInput(raw);
  assert.deepEqual(bound.binding, before); assert.equal(Object.hasOwn(bound.binding, "pageUrl"), false); assert.equal(Object.hasOwn(bound.binding, "imageKey"), false);
  assert.equal(bound.binding.imageSha256, sha256(bound.bytes)); assert.equal(bound.context.coupledCaption, false);
  const proposal = validateContentResponse("alt-text", { text: "Testart auf einem Ast.", uncertainties: [] }, bound);
  assert.deepEqual(proposal.binding, before); assert.equal(proposal.caption, null); assert.equal(proposal.approved, false); assert.equal(proposal.transferred, false);
});

test("Pagebildbinder lehnt fremde Bindungsfelder, Rollen, Quellen und geänderte Bildhashes ab", () => {
  for (const mutate of [
    (value) => { value.binding.pageUrl = "https://www.fnwildlifetravel.de/erfunden"; },
    (value) => { value.binding.role = "reader"; }, (value) => { value.binding.origin = "https://another.invalid"; },
    (value) => { value.binding.imageSha256 = "0".repeat(64); }, (value) => { value.sourceSha256 = "0".repeat(64); },
    (value) => { delete value.binding.inputProof; }, (value) => { value.binding.revision = "not-a-hash"; },
    (value) => { value.context.coupledCaption = true; },
  ]) { const value = pageImage(); mutate(value); assert.throws(() => bindImageInput(value)); }
});

test("Page-Textbinder rechnet normalisierte Quellen neu und bewahrt alle echten typisierten Belegfelder", () => {
  for (const kind of ["source-text", "review-text"]) {
    const raw = pageText(kind), before = structuredClone(raw.binding), bound = bindTextInput(raw, kind);
    assert.deepEqual(bound.binding, before); assert.equal(bound.binding.sourcesRevision, sha256(Buffer.from(JSON.stringify(bound.sources))));
    assert.equal(bound.binding.selectedSourcesHash, fingerprint(bound.sources));
    if (kind === "review-text") assert.equal(bound.binding.draftSha256, sha256(Buffer.from(bound.draft)));
    const response = kind === "review-text" ? { findings: [] } : { paragraphs: [{ text: "Die Oberseite ist blau.", sourceIds: [raw.sources[0].id], evidenceQuotes: [{ sourceId: raw.sources[0].id, quote: "blaue Oberseite" }] }] };
    assert.deepEqual(validateContentResponse(kind, response, bound).binding, before);
  }
});

test("Page-Textbinder akzeptiert keine nachträgliche Quellen-/Entwurfsänderung oder extra Freigabe", () => {
  for (const mutate of [
    (value) => { value.sources[0].text = "Eine andere Quelle."; }, (value) => { value.binding.sourceIds = []; },
    (value) => { value.binding.selectedSourcesHash = "0".repeat(64); }, (value) => { value.binding.sourcesRevision = "0".repeat(64); },
    (value) => { value.draft = "Ein geänderter Prüftext."; }, (value) => { value.binding.approved = true; },
    (value) => { value.binding.kind = "source-text"; },
  ]) { const value = pageText("review-text"); mutate(value); assert.throws(() => bindTextInput(value, "review-text")); }
});

test("Page-Quellenvorschlag benennt ausschließlich den ausdrücklich gewünschten leeren Zielabschnitt", () => {
  const value = bindTextInput(pageText(), "source-text"), request = buildContentRequest("source-text", value);
  assert.match(request.messages[1].content, /ausdrücklich gewünschten noch leeren Zielabschnitt/);
  assert.match(request.messages[1].content, /Bewusst leer bestätigte Abschnitte nicht auffüllen/);
  assert.doesNotMatch(request.messages[1].content, /https:\/\/project\.invalid|inputProof|authorizationHash/);
});
