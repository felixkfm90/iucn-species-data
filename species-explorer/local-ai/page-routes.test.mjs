import assert from "node:assert/strict";
import test from "node:test";
import { matchPageAiRoute, readPageAiPayload } from "./page-routes.mjs";
import { matchProjectFeatureRoute } from "../project-feature-routes.mjs";

const scope = "a".repeat(64), revision = "b".repeat(64);
const sourceQuery = () => new URLSearchParams({ scope, revision, draftId: "draft-1", sectionId: "habitat" });
const sourceRoute = matchPageAiRoute("GET", "/api/local-ai/page-authoring/sources");
test("Artseitenhilfe bietet genaue Quellenlese- und Vorschlagswege innerhalb bestehender Routen", () => {
  assert.deepEqual(matchProjectFeatureRoute("HEAD", "/api/local-ai/page-authoring/sources"), sourceRoute);
  for (const action of ["suggest-alt", "suggest-text", "review-text", "review-language"]) {
    assert.deepEqual(matchProjectFeatureRoute("POST", `/api/local-ai/page-authoring/${action}`),
      { name: "local-ai", action, pageAuthoring: true });
    assert.equal(matchPageAiRoute("GET", `/api/local-ai/page-authoring/${action}`), null);
  }
  for (const path of ["sources/", "suggest-alt/extra", "download", "../suggest-alt"]) {
    assert.equal(matchPageAiRoute("POST", `/api/local-ai/page-authoring/${path}`), null);
  }
});
test("Quellenanfrage bindet exakt gespeicherten Entwurf, Abschnitt und persönlichen Scope", () => {
  assert.deepEqual(readPageAiPayload(sourceRoute, {}, sourceQuery()),
    { type: "page-authoring", sourceScope: scope, expectedRevision: revision, draftId: "draft-1", sectionId: "habitat" });
});
test("mehrdeutige, zusätzliche, fehlende oder ungültige Quellenparameter werden abgewiesen", () => {
  for (const mutate of [q => q.append("scope", scope), q => q.set("ownerId", "other"), q => q.delete("revision"),
    q => q.set("revision", "invalid"), q => q.set("draftId", "../private"), q => q.set("sectionId", "")]) {
    const query = sourceQuery(); mutate(query);
    assert.throws(() => readPageAiPayload(sourceRoute, {}, query), { code: "invalid_page_ai_request", statusCode: 400 });
  }
});
test("Vorschlagsweg verändert keine Bindung und deutet fremde Auftragstypen nicht um", () => {
  const route = matchPageAiRoute("POST", "/api/local-ai/page-authoring/suggest-alt");
  const input = { type: "page-authoring", sourceScope: scope, expectedRevision: revision, draftId: "draft-1", imageId: "image-1" };
  assert.equal(readPageAiPayload(route, input, new URLSearchParams()), input);
  for (const payload of [null, [], {}, { ...input, type: "website" }]) {
    assert.throws(() => readPageAiPayload(route, payload, new URLSearchParams()), { statusCode: 400 });
  }
  assert.throws(() => readPageAiPayload(route, input, new URLSearchParams({ scope })), { statusCode: 400 });
});
