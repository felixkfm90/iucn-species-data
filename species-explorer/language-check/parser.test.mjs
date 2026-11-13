import test from "node:test";
import assert from "node:assert/strict";
import { languageCheckInput, parseLanguageToolResponse, textSha256 } from "./parser.mjs";
import { response, match } from "./test-fixtures.mjs";

test("bounded well-formed German text preserves every UTF-16 character without normalization", () => {
  const text = "🦜 Äste\r\nmit Umlauten";
  assert.deepEqual(languageCheckInput({ text }), { text, context: "text", signal: undefined });
  for (const input of [{ text: "a".repeat(20001) }, { text: "\ud800" }, { text: "a\u0000b" }, { text, context: "cloud" }, { text, url: "https://invalid" }]) {
    assert.throws(() => languageCheckInput(input), { code: "LANGUAGE_CHECK_INVALID_INPUT", statusCode: 400 });
  }
});
test("actual UTF-16 spans bind emoji, newlines, typo and suggestion to the exact original", () => {
  const text = "🦜 Auf dem Ast\nsteht ein Vogeel.", raw = response(text, [match(text, "Vogeel", "Vogel")]);
  assert.deepEqual(parseLanguageToolResponse(raw, { text }), { available: true, textSha256: textSha256(text), findings: [
    { start: text.indexOf("Vogeel"), end: text.indexOf("Vogeel") + 6, replacement: "Vogel", explanation: "Schreibweise prüfen.", kind: "spelling", ruleId: "GERMAN_SPELLER_RULE" },
  ] });
});
test("incorrect original spans, split surrogate pairs, incomplete checks and foreign engines never produce green results", () => {
  const text = "🦜 Vogeel";
  const changes = [value => { value.matches[0].offset++; }, value => { value.matches[0].context.text = "different"; },
    value => { value.matches[0].offset = 1; value.matches[0].length = 1; }, value => { value.warnings.incompleteResults = true; },
    value => { value.software.version = "6.7"; }, value => { value.language.code = "en-US"; }, value => { value.matches[0].replacements[0].value = "\u0000"; }];
  for (const change of changes) {
    const value = response(text, [match(text, "Vogeel", "Vogel")]); change(value);
    assert.throws(() => parseLanguageToolResponse(value, { text }), { code: "LANGUAGE_CHECK_INVALID_RESPONSE" });
  }
});
test("caption and heading contexts suppress final dot demands but retain internal comma and casing corrections", () => {
  const text = "ein Vogel der singt", dots = match(text, "singt", "singt.", { category: "PUNCTUATION", ruleId: "PUNKT_ENDE_ABSATZ" }),
    casing = match(text, "ein", "Ein", { category: "CASING", ruleId: "UPPERCASE_SENTENCE_START" }),
    comma = match(text, "Vogel der", "Vogel, der", { category: "KOMMASETZUNG", ruleId: "KOMMA_ZWISCHEN_HAUPT_UND_NEBENSATZ" });
  const raw = response(text, [dots, casing, comma]);
  assert.equal(parseLanguageToolResponse(raw, { text }).findings.length, 3);
  for (const context of ["caption", "heading"]) assert.deepEqual(parseLanguageToolResponse(raw, { text, context }).findings.map(finding => finding.kind), ["capitalization", "punctuation"]);
});
test("identical and suggestion-free findings are ignored, exact duplicates are deduplicated, deletion suggestions remain usable", () => {
  const text = "Vogel,", comma = match(text, ",", "", { category: "KOMMASETZUNG", ruleId: "FEHLERHAFTES_KOMMA" }), noSuggestion = match(text, "Vogel", "Vogel");
  const raw = response(text, [comma, structuredClone(comma), noSuggestion, { ...noSuggestion, replacements: [] }]);
  assert.equal(parseLanguageToolResponse(raw, { text }).findings.length, 1);
  assert.equal(parseLanguageToolResponse(raw, { text }).findings[0].replacement, "");
});
test("getters, proxies and inherited input properties are rejected without running their hooks", () => {
  let executed = false;
  const input = { get text() { executed = true; return "text"; } };
  assert.throws(() => languageCheckInput(input)); assert.equal(executed, false);
  assert.throws(() => languageCheckInput(new Proxy({}, { ownKeys() { executed = true; return []; } }))); assert.equal(executed, false);
  assert.throws(() => languageCheckInput(Object.create({ text: "text" })));
});
