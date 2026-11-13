import assert from "node:assert/strict";
import test from "node:test";
import { sha256 } from "./files.mjs";
import { bindLanguageInput, buildContentRequest, validateContentResponse } from "./content.mjs";
import { createWebsiteLanguageLoader, websiteLanguageRequest } from "./language.mjs";
import { fingerprint } from "../page-authoring/contract.mjs";

const PAGE = "https://www.fnwildlifetravel.de/reisen/2024-costa-rica/cordillera-de-talamanca", IMAGE = "a".repeat(64), OBSERVATION = "b".repeat(64), REVISION = "c".repeat(64);
const request = (draftText) => ({ type: "website-language", pageUrl: PAGE, imageKey: IMAGE, observationHash: OBSERVATION, draftText });
const data = () => ({ revision: REVISION, pages: [{ url: PAGE, title: "Reisetext", inventoryStatus: "current", error: "", redirectUrl: null,
  images: [{ key: IMAGE, observationHash: OBSERVATION, context: "content", kind: "image", status: "approved", alt: "Vorhandener Text", draft: { text: "Gespeicherte Fassung" } }] }] });
const copy = (value) => structuredClone(value);
function bound(draft, { pageUrl = PAGE, imageContext = "content", imageKind = "image" } = {}) {
  return bindLanguageInput({ draft, target: { sectionId: IMAGE, title: "Bildtext", intentionallyEmpty: false }, binding: { type: "website-language", kind: "review-language",
    pageUrl, imageKey: IMAGE, observationHash: OBSERVATION, revision: REVISION, snapshotRevision: REVISION, draftSha256: sha256(Buffer.from(draft)), imageContext, imageKind, inputProof: "d".repeat(64) } });
}
function pageBound(draft) {
  const origin = "https://project.invalid", projectId = "project-a", userId = "person-a";
  return bindLanguageInput({ draft, target: { sectionId: "appearance", title: "Aussehen", intentionallyEmpty: false }, binding: { type: "page-authoring", kind: "review-language", origin, projectId, userId,
    role: "publisher", sourceScope: fingerprint([origin, projectId, userId]), documentId: "draft-a", revision: REVISION, authorizationHash: "1".repeat(64), snapshotHash: "2".repeat(64), targetHash: "3".repeat(64),
    sectionId: "appearance", draftSha256: sha256(Buffer.from(draft)), inputProof: "4".repeat(64) } });
}
const finding = (_draft, draftQuote, replacement, kind = "spelling") => ({ kind, draftQuote, replacement, explanation: "Bitte die deutsche Schreibweise prüfen." });
const response = (input, findings) => ({ draftSha256: input.binding.draftSha256, findings });

test("language jobs use only supplied text and a distinct strict schema without factual sources or image bytes", () => {
  const input = bound("das ist ein test."), payload = buildContentRequest("review-language", input);
  assert.equal(payload.response_format.json_schema.name, "fn_local_language_review"); assert.equal(payload.response_format.json_schema.strict, true);
  assert.match(payload.messages[0].content, /deutscher Lektor.*Groß-\/Kleinschreibung.*Grammatik.*Kommas/);
  const [instructions, supplied] = payload.messages[1].content.split("\nTEXT_DATEN=");
  assert.match(instructions, /Schlage konkrete notwendige Sprachkorrekturen vor/); assert.match(instructions, /Positionen berechnet das Programm selbst/);
  assert.match(instructions, /„blauen himmel“ → „blauen Himmel“/); assert.match(instructions, /„Wir wissen dass es regnet“ → „Wir wissen, dass es regnet“/);
  assert.doesNotMatch(instructions, /Der vogel sitzt auf einem Ast|Ich glaube das der Vogel singt|Grünstirn-Brillantkolibri/);
  assert.deepEqual(JSON.parse(supplied), { draftSha256: input.binding.draftSha256, text: input.draft });
  const item = payload.response_format.json_schema.schema.properties.findings.items;
  assert.deepEqual(Object.keys(item.properties).sort(), ["draftQuote", "explanation", "kind", "replacement"]);
  assert.deepEqual(item.required, ["kind", "draftQuote", "replacement", "explanation"]);
  assert.doesNotMatch(JSON.stringify(payload), /image_url|data:image|evidenceQuotes|sourceIds/);
  assert.equal(payload.max_tokens, 1024); assert.ok(payload.messages[1].content.includes(input.binding.draftSha256));
});

test("language prompt explicitly requests real changes only and an empty list instead of unchanged confirmation findings", () => {
  const input = bound("Ein korrekt formulierter Satz"), payload = buildContentRequest("review-language", input);
  const [instructions, supplied] = payload.messages[1].content.split("\nTEXT_DATEN=");
  assert.match(instructions, /replacement muss sich von draftQuote unterscheiden/);
  assert.match(instructions, /kein sprachlicher Fehler.*findings:\[\]/);
  assert.match(instructions, /keine Bestätigungseinträge.*keine Einträge mit unverändertem Text/);
  assert.deepEqual(JSON.parse(supplied), { draftSha256: input.binding.draftSha256, text: input.draft });
  assert.equal(payload.temperature, 0.1); assert.equal(payload.max_tokens, 1024);
  assert.deepEqual(payload.chat_template_kwargs, { enable_thinking: false });
});

test("language prompt distinguishes ordinary noun capitalization from protection of proper and species names without hardcoding native answers", () => {
  const instructions = buildContentRequest("review-language", pageBound("Ein gespeicherter Abschnitt")).messages[1].content.split("\nTEXT_DATEN=")[0];
  assert.match(instructions, /gewöhnliche Wörter vollständig im Satzkontext/);
  assert.match(instructions, /allgemeine Tierbezeichnungen sind gewöhnliche Substantive und keine Eigennamen/);
  assert.match(instructions, /Eigennamen und konkrete Artbezeichnungen.*weder fachlich umdeuten noch durch andere Bezeichnungen ersetzen/);
  assert.match(instructions, /Schutz ist kein Grund.*notwendige Groß-\/Kleinschreibung.*auszulassen/);
  assert.doesNotMatch(instructions, /Der vogel sitzt auf einem Ast|Ich glaube das der Vogel singt|Grünstirn-Brillantkolibri|Der fuchs lebt im Wald|Sie hofft das der Regen bald endet/);
});

test("language prompt binds finding kinds and explanations to the actual visible change without changing the output schema", () => {
  const payload = buildContentRequest("review-language", pageBound("Ein gespeicherter Abschnitt")), instructions = payload.messages[1].content.split("\nTEXT_DATEN=")[0];
  assert.match(instructions, /capitalization bei reiner Groß-\/Kleinschreibung/); assert.match(instructions, /punctuation bei reiner Zeichensetzung/);
  assert.match(instructions, /spelling bei Schreibfehlern.*grammar bei Wortform, Satzbau oder Konjunktionen/);
  assert.match(instructions, /explanation erklärt ausschließlich die sichtbare Änderung/); assert.match(instructions, /Behaupte keine weitere Änderung/);
  assert.match(instructions, /Konjunktion dass wird kleingeschrieben/); assert.match(instructions, /Substantivs macht es nicht zum Eigennamen/);
  assert.deepEqual(payload.response_format.json_schema.schema.properties.findings.items.required, ["kind", "draftQuote", "replacement", "explanation"]);
  assert.deepEqual(payload.response_format.json_schema.schema.required, ["draftSha256", "findings"]);
  const website = buildContentRequest("review-language", bound("Ein offener Entwurf", { pageUrl: "https://www.fnwildlifetravel.de/ueber-uns" }));
  assert.equal(website.messages[1].content.split("\nTEXT_DATEN=")[0], instructions);
});

test("no-op findings remain whole-response errors while an empty list preserves the exact original without asserting correctness", () => {
  for (const input of [bound("  Ein Kauz sitzt im Baum  "), pageBound("  Ein Kauz sitzt im Baum  ")]) {
    const unchanged = finding(input.draft, "Kauz", "Kauz", "grammar");
    assert.throws(() => validateContentResponse("review-language", response(input, [unchanged]), input));
    const empty = validateContentResponse("review-language", response(input, []), input);
    assert.equal(empty.originalText, input.draft); assert.equal(empty.correctedText, input.draft); assert.deepEqual(empty.findings, []);
    assert.equal(empty.languageGuarantee, false); assert.equal(empty.factualGuarantee, false); assert.equal(empty.approved, false);
    assert.match(empty.message, /keine Garantie/);
  }
  const input = bound("ein Kauz sitzt im Baum"), correction = finding(input.draft, "ein", "Ein", "capitalization");
  assert.throws(() => validateContentResponse("review-language", response(input, [correction, finding(input.draft, "Kauz", "Kauz", "grammar")]), input));
  assert.equal(input.draft, "ein Kauz sitzt im Baum");
});

test("punctuation and capitalization findings cannot conceal contradictory word or character changes", () => {
  for (const bind of [bound, pageBound]) {
    for (const [original, replacement, kind] of [
      ["Bevor sie ging wartete er", "Bevor sie ging, wartete er", "capitalization"],
      ["Wir sehen das es schneit", "Wir sehen, dass es schneit", "punctuation"],
      ["Ein hund läuft", "Ein Hund lief", "capitalization"],
      ["Ein hund läuft", "Ein Hund läuft", "punctuation"],
    ]) {
      const input = bind(original);
      assert.throws(() => validateContentResponse("review-language", response(input, [finding(original, original, replacement, kind)]), input));
      assert.equal(input.draft, original);
    }
  }
});

test("consistent punctuation and case proposals retain exact Unicode, spacing and independently reviewed grammatical replacements", () => {
  for (const bind of [bound, pageBound]) {
    for (const [original, replacement, kind] of [
      ["  Wenn es taut fließt Wasser 😀  ", "  Wenn es taut, fließt Wasser 😀  ", "punctuation"],
      ["Ein übergroßer käfer", "Ein übergroßer Käfer", "capitalization"],
      ["Wir sehen das es schneit", "Wir sehen, dass es schneit", "grammar"],
    ]) {
      const input = bind(original), result = validateContentResponse("review-language", response(input, [finding(original, original, replacement, kind)]), input);
      assert.equal(result.correctedText, replacement); assert.equal(result.originalText, original); assert.equal(result.approved, false);
    }
  }
});

test("validated spelling, capitalization, grammar and punctuation build the whole proposal only from exact original spans", () => {
  const draft = "das Auto wiederspiegelt Farben, ich gehen weil es schön ist.", input = bound(draft);
  const issues = [finding(draft, "das", "Das", "capitalization"), finding(draft, "wiederspiegelt", "widerspiegelt"),
    finding(draft, "gehen", "gehe", "grammar"), finding(draft, " weil", ", weil", "punctuation")];
  const proposal = validateContentResponse("review-language", response(input, issues.reverse()), input);
  assert.equal(proposal.originalText, draft); assert.equal(proposal.correctedText, "Das Auto widerspiegelt Farben, ich gehe, weil es schön ist.");
  assert.deepEqual(proposal.findings.map((item) => item.kind), ["capitalization", "spelling", "grammar", "punctuation"]);
  assert.equal(proposal.approved, false); assert.equal(proposal.transferred, false); assert.equal(proposal.factualGuarantee, false); assert.equal(proposal.languageGuarantee, false);
});

test("original whitespace and CRLF stay exact and findings cannot merge text blocks or list items", () => {
  const original = "  das\r\nist ein test.  ", input = bound(original);
  const result = validateContentResponse("review-language", response(input, [finding(original, "das", "Das", "capitalization")]), input);
  assert.equal(result.originalText, original); assert.equal(result.correctedText, "  Das\r\nist ein test.  ");
  for (const issue of [finding(original, "das\r\nist", "Das ist", "grammar"), finding(original, "das", "Das\nist", "grammar")])
    assert.throws(() => validateContentResponse("review-language", response(input, [issue]), input));
});

test("unknown fields, foreign text hash, factual findings and model-supplied positions reject the complete result", () => {
  const input = bound("das ist ein test"), good = finding(input.draft, "das", "Das");
  for (const invalid of [
    { ...response(input, [good]), correctedText: "Freier Modelltext" }, { ...response(input, [good]), approved: true }, { ...response(input, [good]), draftSha256: "0".repeat(64) },
    response(input, [{ ...good, ruleId: "extra" }]), response(input, [{ ...good, kind: "factual" }]), response(input, [{ ...good, start: -1 }]),
    response(input, [{ ...good, start: 0.5 }]), response(input, [{ ...good, end: 0 }]), response(input, [{ ...good, start: 4, end: 7 }]),
    response(input, [{ ...good, start: 0, end: 3 }]),
    response(input, [finding(input.draft, "ein test", "ein Test"), finding(input.draft, "test", "TEST")]),
    response(input, [{ ...good, draftQuote: "", replacement: "," }]),
  ]) assert.throws(() => validateContentResponse("review-language", invalid, input));
});

test("the server derives UTF-16 offsets only from one exact quote and never splits a surrogate pair", () => {
  const input = bound("🦉 das und dort"), quote = finding(input.draft, "das", "Das", "capitalization");
  const result = validateContentResponse("review-language", response(input, [quote]), input); assert.equal(result.correctedText, "🦉 Das und dort");
  assert.equal(result.findings[0].start, 3); assert.equal(result.findings[0].end, 6); assert.equal(Object.hasOwn(quote, "start"), false);
  for (const draftQuote of [input.draft.slice(0, 1), input.draft.slice(1, 2)])
    assert.throws(() => validateContentResponse("review-language", response(input, [{ ...quote, draftQuote }]), input));
});

test("nonempty quote spans permit a deliberate deletion but never a zero-width insertion", () => {
  const input = bound("Hallo,, Welt"), result = validateContentResponse("review-language", response(input, [finding(input.draft, ",,", ",", "punctuation")]), input);
  assert.equal(result.correctedText, "Hallo, Welt");
  const deletion = bound("Hallo, Welt"); assert.equal(validateContentResponse("review-language", response(deletion, [finding(deletion.draft, ",", "", "punctuation")]), deletion).correctedText, "Hallo Welt");
  assert.throws(() => validateContentResponse("review-language", response(input, [{ kind: "punctuation", draftQuote: "", replacement: ",", explanation: "Komma" }]), input));
});

test("at most eight nonoverlapping findings fit and an unchanged result never claims correctness", () => {
  const words = Array.from({ length: 9 }, (_, index) => `wort${index}`), input = bound(words.join(" ")),
    issues = words.map((word) => finding(input.draft, word, word.replace("w", "W"), "capitalization"));
  assert.equal(validateContentResponse("review-language", response(input, issues.slice(0, 8)), input).findings.length, 8);
  assert.throws(() => validateContentResponse("review-language", response(input, issues), input));
  const none = validateContentResponse("review-language", response(input, []), input); assert.equal(none.correctedText, input.draft); assert.match(none.message, /keine Garantie/);
});

test("website language validates exact known observation and binds the current unsaved editor text without replacing stored text", async (t) => {
  const document = data(), before = JSON.stringify(document); let reads = 0;
  const loader = createWebsiteLanguageLoader({ snapshot: async () => { reads++; return copy(document); } }); t.after(() => loader.close());
  const original = "  mein aktueller, noch ungespeicherter Text.  ", context = await loader.loadTextContext(request(original)), input = bindLanguageInput(context);
  assert.equal(input.draft, original); assert.equal(input.binding.draftSha256, sha256(Buffer.from(original))); assert.equal(input.binding.revision, REVISION);
  assert.equal(input.binding.observationHash, OBSERVATION); assert.equal(await loader.isBindingCurrent(input.binding), true); assert.ok(reads >= 3);
  assert.equal(JSON.stringify(document), before); assert.equal(Object.hasOwn(context, "bytes"), false); assert.equal(Object.hasOwn(context, "sources"), false);
});

test("unknown image, stale snapshot, observation drift and manipulated language binding are not accepted", async (t) => {
  const document = data(), loader = createWebsiteLanguageLoader({ snapshot: async () => copy(document) }); t.after(() => loader.close());
  const input = await loader.loadTextContext(request("das ist ein text"));
  for (const changed of [{ draftSha256: "0".repeat(64) }, { imageKey: "0".repeat(64) }, { inputProof: "0".repeat(64) }]) assert.equal(await loader.isBindingCurrent({ ...input.binding, ...changed }), false);
  document.revision = "e".repeat(64); assert.equal(await loader.isBindingCurrent(input.binding), false);
  document.pages[0].images[0].observationHash = "f".repeat(64); await assert.rejects(loader.loadTextContext(request("text")));
  await assert.rejects(loader.loadTextContext({ ...request("text"), imageKey: "0".repeat(64) }));
});

test("language request admits only bounded text data and IDs, not paths, owner or model options", () => {
  for (const extra of [{ ownerId: "foreign" }, { path: "C:\\private" }, { model: "another-model" }, { sources: [] }, { imageContext: "header" }, { punctuationPolicy: "normal" }]) assert.throws(() => websiteLanguageRequest({ ...request("Text"), ...extra }));
  assert.equal(websiteLanguageRequest(request("A".repeat(2000))).draftText.length, 2000); assert.throws(() => websiteLanguageRequest(request("A".repeat(2001))));
  assert.throws(() => websiteLanguageRequest(request("Text\u0000")));
});

test("a changed original, false snapshot revision or foreign input fields cannot be rebound as the language input", () => {
  const input = bound("mein ursprünglicher Text");
  assert.throws(() => bindLanguageInput({ ...input, draft: "Ein anderer Text" }));
  assert.throws(() => bindLanguageInput({ ...input, binding: { ...input.binding, snapshotRevision: "0".repeat(64) } }));
  assert.throws(() => bindLanguageInput({ ...input, sources: [] }));
  assert.throws(() => bindLanguageInput({ ...input, target: { ...input.target, intentionallyEmpty: true } }));
});

test("language correction expansion is rejected rather than truncating the resulting manual proposal", () => {
  const input = bound("X" + "y".repeat(1999)), issue = finding(input.draft, "X", "XX", "spelling");
  assert.throws(() => validateContentResponse("review-language", response(input, [issue]), input)); assert.equal(input.draft.length, 2000);
});

test("close aborts and joins an actually outstanding website snapshot instead of reporting premature completion", async () => {
  let entered, finish, closed = false; const started = new Promise((resolve) => { entered = resolve; }), gate = new Promise((resolve) => { finish = resolve; });
  const loader = createWebsiteLanguageLoader({ snapshot: async () => { entered(); await gate; return data(); } });
  const reading = loader.loadTextContext(request("Prüftext")), rejected = assert.rejects(reading, { name: "AbortError" }); await started;
  const closing = loader.close().then(() => { closed = true; }); await new Promise((resolve) => setImmediate(resolve)); assert.equal(loader.busy, true); assert.equal(closed, false);
  finish(); await Promise.all([rejected, closing]); assert.equal(loader.busy, false); await loader.close();
});

test("actual travel-image context adds the existing no-final-period rule to the prompt without changing source text", async (t) => {
  const document = data(), loader = createWebsiteLanguageLoader({ snapshot: async () => copy(document) }); t.after(() => loader.close());
  const raw = await loader.loadTextContext(request("  Kolibri an einer Blüte  ")), input = bindLanguageInput(raw), prompt = buildContentRequest("review-language", input);
  assert.equal(input.binding.imageContext, "content"); assert.equal(input.binding.imageKind, "image");
  assert.match(prompt.messages[1].content, /Websitekontext: kurze Reisebildbeschriftung ohne abschließenden Satzpunkt/);
  assert.match(prompt.messages[1].content, /Abkürzungen und ihre Punkte unverändert/); assert.equal(input.draft, "  Kolibri an einer Blüte  ");
  assert.equal(await loader.isBindingCurrent({ ...raw.binding, imageContext: "header" }), false);
  document.pages[0].images[0].context = "header"; assert.equal(await loader.isBindingCurrent(raw.binding), false);
});

test("a model-added sentence period on short travel captions rejects the entire response instead of trimming it", () => {
  for (const original of ["Kolibri an einer Blüte", "  Kolibri an einer Blüte  "]) {
    const input = bound(original), before = input.draft, period = finding(original, "Blüte", "Blüte.", "punctuation");
    assert.throws(() => validateContentResponse("review-language", response(input, [period]), input), /Reiseregel/);
    assert.equal(input.draft, before);
  }
  const input = bound("kolibri an einer Blüte");
  assert.throws(() => validateContentResponse("review-language", response(input, [finding(input.draft, "kolibri", "Kolibri", "capitalization"), finding(input.draft, "Blüte", "Blüte.", "punctuation")]), input), /Reiseregel/);
});

test("travel whitespace and valid abbreviation endings survive unchanged and unrelated grammatical corrections remain available", () => {
  for (const ending of ["bzw.", "usw.", "5. Jh."]) {
    const original = `  kolibri an Blüten ${ending}  `, input = bound(original);
    const same = validateContentResponse("review-language", response(input, []), input); assert.equal(same.originalText, original); assert.equal(same.correctedText, original);
    const corrected = validateContentResponse("review-language", response(input, [finding(original, "kolibri", "Kolibri", "capitalization")]), input);
    assert.equal(corrected.correctedText, `  Kolibri an Blüten ${ending}  `); assert.equal(corrected.originalText, original);
  }
  const input = bound("  kolibri an Blüten  "), corrected = validateContentResponse("review-language", response(input, [finding(input.draft, "kolibri", "Kolibri", "capitalization")]), input);
  assert.equal(validateContentResponse("review-language", response(input, []), input).correctedText, input.draft);
  assert.equal(corrected.correctedText, "  Kolibri an Blüten  ");
  const comma = bound("Er wartet weil es regnet"), commaResult = validateContentResponse("review-language", response(comma, [finding(comma.draft, "wartet weil", "wartet, weil", "punctuation")]), comma);
  assert.equal(commaResult.correctedText, "Er wartet, weil es regnet");
});

test("existing travel abbreviations are preserved rather than expanded or stripped of their punctuation", () => {
  for (const [quote, replacement] of [["bzw.", "beziehungsweise"], ["usw.", "usw"], ["Jh.", "Jahrhundert"]]) {
    const input = bound(`Kolibri an Blüten ${quote}`);
    assert.throws(() => validateContentResponse("review-language", response(input, [finding(input.draft, quote, replacement)]), input), /Abkürzung/);
  }
  const input = bound("Kolibri an Blüten usw"), result = validateContentResponse("review-language", response(input, [finding(input.draft, "usw", "usw.")]), input);
  assert.equal(result.correctedText, "Kolibri an Blüten usw.");
});

test("overview captions reuse the same policy while other pages, image roles and Pageparagraphs retain normal sentence punctuation", () => {
  const original = "Das ist ein Satz", issue = finding(original, "Satz", "Satz.", "punctuation"), overview = bound(original, { pageUrl: "https://www.fnwildlifetravel.de/reisen/2024-costa-rica" });
  assert.throws(() => validateContentResponse("review-language", response(overview, [issue]), overview), /Reiseregel/);
  for (const input of [bound(original, { pageUrl: "https://www.fnwildlifetravel.de/ueber-uns" }), bound(original, { imageContext: "header" }),
    bound(original, { imageContext: "footer" }), bound(original, { imageKind: "background" }), pageBound(original)]) {
    const prompt = buildContentRequest("review-language", input); assert.doesNotMatch(prompt.messages[1].content, /Reisebildbeschriftung ohne/);
    assert.equal(validateContentResponse("review-language", response(input, [issue]), input).correctedText, "Das ist ein Satz.");
  }
});

test("native v1 quotes remain historical data and contradictory finding kinds cannot reenter through the quote-only contract", () => {
  const cases = [
    { draft: "Der vogel sitzt auf einem Ast", expected: "Der Vogel sitzt auf einem Ast", rejectContradictoryKind: true, hash: "8b9af3a3a83c97e8e066baa755b609758d3f216641f8291de598284a0552063f", findings: [
      { kind: "capitalization", draftQuote: "Der vogel", start: 3, end: 7, replacement: "Der Vogel", explanation: "Proper noun 'Vogel' ist großgeschrieben." },
      { kind: "punctuation", draftQuote: "Der vogel sitzt auf einem Ast", start: 7, end: 11, replacement: "Der Vogel sitzt auf einem Ast", explanation: "Proper noun 'Vogel' ist großgeschrieben." },
    ] },
    { draft: "Ich glaube das der Vogel singt", expected: "Ich glaube, dass der Vogel singt", hash: "04b74f272482934888b60fdfe3ef863b148e9673664b3a41e15250f6543c277e", findings: [
      { kind: "grammar", draftQuote: "Ich glaube das der Vogel singt", start: 10, end: 14, replacement: "Ich glaube, dass der Vogel singt", explanation: "Komma nach 'glaube' notwendig für korrekte Satzstruktur." },
    ] },
    { draft: "Der Grünstirn-Brillantkolibri sitzt auf einem Ast", expected: "Der Grünstirn-Brillantkolibri sitzt auf einem Ast", hash: "4d64ba357e44249b368297b7a4d6d0da0a808df351b4bf2f360be40a265bce95", findings: [] },
  ];
  for (const native of cases) {
    const input = bound(native.draft); assert.equal(input.binding.draftSha256, native.hash);
    if (native.findings.length) assert.throws(() => validateContentResponse("review-language", { draftSha256: native.hash, findings: native.findings }, input), /Datenstruktur/);
    // Preserve the actual v1 wording and explanations. Only its now-forbidden
    // model positions are omitted, as required by the new response schema.
    const quoteOnly = native.findings.map(({ start, end, ...entry }) => entry);
    if (native.rejectContradictoryKind) {
      assert.throws(() => validateContentResponse("review-language", { draftSha256: native.hash, findings: quoteOnly }, input), {code:"LOCAL_AI_LANGUAGE_INCONSISTENT"});
      assert.equal(input.draft,native.draft);continue;
    }
    const result = validateContentResponse("review-language", { draftSha256: native.hash, findings: quoteOnly }, input);
    assert.equal(result.originalText, native.draft); assert.equal(result.correctedText, native.expected); assert.deepEqual(result.binding, input.binding);
    assert.equal(result.approved, false); assert.equal(result.transferred, false);
    if (native.draft.startsWith("Ich glaube")) { assert.equal(result.findings[0].start, 0); assert.equal(result.findings[0].end, native.draft.length); }
    if (native.draft.includes("Brillantkolibri")) assert.deepEqual(result.findings, []);
  }
});

test("equivalent individual full-text corrections deduplicate to the smallest supplied exact span regardless of order", () => {
  const input = bound("Der vogel sitzt auf einem Ast"), expected = "Der Vogel sitzt auf einem Ast";
  const small = finding(input.draft, "vogel", "Vogel", "capitalization"), large = finding(input.draft, input.draft, expected, "capitalization");
  for (const issue of [small, large]) assert.equal(validateContentResponse("review-language", response(input, [issue]), input).correctedText, expected);
  for (const issues of [[small, large], [large, small]]) {
    const before = JSON.stringify(issues), result = validateContentResponse("review-language", response(input, issues), input);
    assert.equal(result.correctedText, expected); assert.equal(result.findings.length, 1); assert.equal(result.findings[0].draftQuote, "vogel");
    assert.equal(result.findings[0].start, 4); assert.equal(result.findings[0].end, 9); assert.equal(result.findings[0].kind, "capitalization");
    assert.equal(JSON.stringify(issues), before);
  }
  const contradictory={...large,kind:"punctuation"};
  for(const issues of [[small,contradictory],[contradictory,small]])
    assert.throws(()=>validateContentResponse("review-language",response(input,issues),input),{code:"LOCAL_AI_LANGUAGE_INCONSISTENT"});
});

test("unknown and multiply occurring quotes stop the whole result without choosing any position", () => {
  for (const [draft, quote] of [["das ist das", "das"], ["aaa", "aa"], ["Hallo,, Welt", ","], ["Ein Vogel", "Fremdes Zitat"]]) {
    const input = bound(draft);
    assert.throws(() => validateContentResponse("review-language", response(input, [finding(draft, quote, "Korrektur")]), input), /Originalzitat/);
    assert.equal(input.draft, draft);
  }
  const input = bound("das ist das");
  assert.throws(() => validateContentResponse("review-language", response(input, [finding(input.draft, input.draft, "Das ist das"), finding(input.draft, "das", "Das")]), input), /Originalzitat/);
});

test("overlapping corrections with different full-text outcomes remain completely rejected", () => {
  const input = bound("Der vogel sitzt auf einem Ast"), issues = [finding(input.draft, "vogel", "Vogel"), finding(input.draft, "Der vogel", "Ein Vogel")];
  assert.notEqual(validateContentResponse("review-language", response(input, [issues[0]]), input).correctedText,
    validateContentResponse("review-language", response(input, [issues[1]]), input).correctedText);
  assert.throws(() => validateContentResponse("review-language", response(input, issues), input), /Überlappende/);
  assert.throws(() => validateContentResponse("review-language", { ...response(input, issues), draftSha256: "0".repeat(64) }, input), /Prüftext/);
});
