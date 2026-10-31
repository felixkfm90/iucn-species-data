import assert from "node:assert/strict";
import test from "node:test";
import { buildContentRequest, validateContentResponse, normalizeAltProposal } from "./content.mjs";
import { createLocalAiService } from "./service.mjs";
import { sha256 } from "./files.mjs";
import { pixel, waitJob } from "./test-fixtures.mjs";

const input = () => ({ bytes: Buffer.from("synthetic-bound-image"), mimeType: "image/png",
  context: { pageType: "species", title: "Eisvogel", coupledCaption: false }, binding: { revision: "synthetic-revision" },
  target: { sectionId: "appearance", intentionallyEmpty: false }, sources: [{ id: "A", text: "Eine blaue Oberseite." }], draft: "Eine grüne Oberseite." });

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
