import assert from "node:assert/strict";
import test from "node:test";
import { coupledWebsiteAltCaption, normalizeWebsiteAltProposalText, websiteAltTextConstraint, websiteAltTextLengthProblem } from "./website-alt-policy.mjs";

const DETAIL = "https://www.fnwildlifetravel.de/reisen/2024-costa-rica/cordillera-de-talamanca";
const OVERVIEW = "https://www.fnwildlifetravel.de/reisen/2024-costa-rica";
const IMAGE = Object.freeze({ context: "content", kind: "image" });

test("only the existing coupled travel-detail policy exposes the observed 250-character public-alt constraint", () => {
  assert.equal(coupledWebsiteAltCaption(DETAIL, IMAGE), true);
  assert.deepEqual(websiteAltTextConstraint(DETAIL, IMAGE), { maxLength: 250, reason: "coupled-gallery-public-alt-limit" });
  const first = websiteAltTextConstraint(DETAIL, IMAGE); first.maxLength = 999;
  assert.equal(websiteAltTextConstraint(DETAIL, IMAGE).maxLength, 250);
});

test("250 UTF-16 units remain accepted without transforming the text", () => {
  for (const text of ["A".repeat(250), "🦉".repeat(125)]) {
    assert.equal(text.length, 250); const before = text;
    assert.equal(websiteAltTextLengthProblem(DETAIL, IMAGE, text), null); assert.equal(text, before);
  }
});

test("251 and 261 units report the exact excess, complete length and coupled caption explanation", () => {
  for (const length of [251, 261]) {
    const text = "A".repeat(length), before = text, problem = websiteAltTextLengthProblem(DETAIL, IMAGE, text);
    assert.equal(problem.maxLength, 250); assert.equal(problem.length, length); assert.equal(problem.excess, length - 250);
    assert.match(problem.message, /250/); assert.ok(problem.message.includes(String(length)));
    assert.match(problem.message, /sichtbare Bildunterschrift.*Alternativtext/); assert.match(problem.message, /vor der Übernahme.*kürzen/);
    assert.equal(text, before);
  }
  assert.equal(websiteAltTextLengthProblem(DETAIL, IMAGE, "🦉".repeat(125) + "A").length, 251);
});

test("header, footer, backgrounds, travel overviews and uncoupled pages retain long text without a new constraint", () => {
  const text = "Unveränderter bestehender Text. ".repeat(20);
  const cases = [
    [DETAIL, { context: "header", kind: "image" }],
    [DETAIL, { context: "footer", kind: "image" }],
    [DETAIL, { context: "content", kind: "background" }],
    [OVERVIEW, IMAGE],
    ["https://www.fnwildlifetravel.de/wildlife/heimische-tierwelt/test-art", IMAGE],
    ["https://www.fnwildlifetravel.de/kontakt", IMAGE],
    [DETAIL, { context: "content", kind: "other" }],
    ["not a website URL", IMAGE],
  ];
  for (const [url, image] of cases) {
    const before = JSON.stringify({ url, image, text });
    assert.equal(websiteAltTextConstraint(url, image), null); assert.equal(websiteAltTextLengthProblem(url, image, text), null);
    assert.equal(JSON.stringify({ url, image, text }), before);
  }
});

test("checking already saved long captions never truncates captions, alt text or approval data", () => {
  const saved = { approved: true, draft: { text: "B".repeat(261), decorative: false },
    image: { ...IMAGE, alt: "B".repeat(250), caption: "B".repeat(261), captionVariants: ["B".repeat(261)] } };
  const before = JSON.stringify(saved), problem = websiteAltTextLengthProblem(DETAIL, saved.image, saved.draft.text);
  assert.equal(problem.length, 261); assert.equal(problem.excess, 11); assert.equal(JSON.stringify(saved), before);
  assert.equal(saved.draft.text.length, 261); assert.equal(saved.image.caption.length, 261); assert.equal(saved.approved, true);
});

test("the existing coupling and proposal punctuation behavior stays separate from the length guard", () => {
  assert.equal(coupledWebsiteAltCaption(OVERVIEW, IMAGE), false);
  assert.equal(normalizeWebsiteAltProposalText(DETAIL, IMAGE, "Kolibri an einer Blüte."), "Kolibri an einer Blüte");
  assert.equal(normalizeWebsiteAltProposalText(OVERVIEW, IMAGE, "Blick über den Wald."), "Blick über den Wald");
  assert.equal(normalizeWebsiteAltProposalText(DETAIL, IMAGE, "Ruinen aus dem 5. Jh."), "Ruinen aus dem 5. Jh.");
  const long = "L".repeat(260) + ".";
  assert.equal(websiteAltTextLengthProblem(DETAIL, IMAGE, long).length, 261);
  assert.equal(long.length, 261); assert.equal(long.at(-1), ".");
});

test("the length checker rejects non-text input rather than guessing or coercing saved data", () => {
  for (const value of [null, undefined, 251, {}, []]) assert.throws(() => websiteAltTextLengthProblem(DETAIL, IMAGE, value), TypeError);
});
