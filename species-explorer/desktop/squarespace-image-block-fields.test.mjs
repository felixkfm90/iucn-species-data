import assert from "node:assert/strict";
import test from "node:test";
import { assessSquarespaceImageBlockField } from "./squarespace-image-block-fields.mjs";

const sourceUrl = "https://images.squarespace-cdn.com/content/v1/synthetic/bird.jpg";
const planImage = (changes = {}) => ({ sourceUrl, context: "content", kind: "image", textCoupled: false,
  expectedAlt: "Bisheriger Alternativtext", expectedCaption: "Sichtbare Bildunterschrift. ",
  text: "Eisvogel auf einem Ast.", decorative: false, ...changes });
const observation = (changes = {}) => ({ sourceUrl: `${sourceUrl}?format=750w`, alt: "Bisheriger Alternativtext",
  caption: "Sichtbare Bildunterschrift. ", isAltField: true, editable: true, ...changes });
function assertRejected(image, observed, status) {
  const result = assessSquarespaceImageBlockField(image, observed);
  assert.equal(result.status, status);
  assert.equal(typeof result.error, "string");
  assert.ok(result.error.length > 0 && result.error.length < 200);
}

test("alter Altwert ist bereit; exakt freigegebener Altwert ist unverändert", () => {
  assert.deepEqual(assessSquarespaceImageBlockField(planImage(), observation()), { status: "ready" });
  assert.deepEqual(assessSquarespaceImageBlockField(planImage(), observation({ alt: "Eisvogel auf einem Ast." })), { status: "unchanged" });
  assert.deepEqual(assessSquarespaceImageBlockField(planImage({ expectedAlt: "" }), observation({ alt: "" })), { status: "ready" });
});

test("Quellenvergleich entfernt nur CDN-format und vergleicht andere Parameter in kanonischer Reihenfolge", () => {
  const image = planImage({ sourceUrl: `${sourceUrl}?crop=top&variant=original&format=2500w` });
  assert.deepEqual(assessSquarespaceImageBlockField(image,
    observation({ sourceUrl: `${sourceUrl}?variant=original&format=750w&crop=top#preview` })), { status: "ready" });
  assertRejected(image, observation({ sourceUrl: `${sourceUrl}?variant=other&format=750w&crop=top` }), "conflict");
  assertRejected(image, observation({ sourceUrl: `${sourceUrl}?crop=top&format=750w` }), "conflict");
  const ownSource = "https://www.fnwildlifetravel.de/media/bird.jpg?format=original";
  assertRejected(planImage({ sourceUrl: ownSource }), observation({ sourceUrl: ownSource.replace("original", "750w") }), "conflict");
});

test("fremde, ausgetauschte oder unlesbare Bildquelle sperrt auch einen bereits passenden Altwert", () => {
  for (const source of [sourceUrl.replace("bird.jpg", "other.jpg"), "https://evil.test/bird.jpg", "file:///D:/bird.jpg",
    "http://images.squarespace-cdn.com/bird.jpg", "https://user:secret@images.squarespace-cdn.com/bird.jpg", "", null, [sourceUrl]]) {
    assertRejected(planImage(), observation({ sourceUrl: source, alt: "Eisvogel auf einem Ast." }), "conflict");
  }
  assertRejected(planImage({ sourceUrl: null }), observation(), "conflict");
});

test("fremder Altwert und jede Captionänderung bleiben Konflikte ohne Textnormalisierung", () => {
  for (const alt of ["Vom Nutzer geändert", "Bisheriger Alternativtext ", "Eisvogel auf einem Ast. "]) {
    assertRejected(planImage(), observation({ alt }), "conflict");
  }
  for (const caption of ["Geänderte sichtbare Bildunterschrift.", "Sichtbare Bildunterschrift.", ""]) {
    assertRejected(planImage(), observation({ caption }), "conflict");
    assertRejected(planImage(), observation({ caption, alt: "Eisvogel auf einem Ast." }), "conflict");
  }
});

test("Header, Footer, Hintergründe und gekoppelte oder ungeklärte Bildverwendungen werden abgelehnt", () => {
  for (const changes of [{ context: "header" }, { context: "footer" }, { kind: "background" }, { kind: "gallery" },
    { textCoupled: true }, { textCoupled: undefined }, { textCoupled: 0 }]) {
    assertRejected(planImage(changes), observation(), "unsupported");
  }
  for (const image of [null, undefined, [], {}]) assertRejected(image, observation(), "unsupported");
});

test("nur ausdrücklich identifiziertes editierbares Alttextfeld wird akzeptiert", () => {
  for (const changes of [{ isAltField: false }, { isAltField: undefined }, { isAltField: "true" },
    { editable: false }, { editable: undefined }, { editable: "true" }]) {
    assertRejected(planImage(), observation(changes), "unsupported");
    assertRejected(planImage(), observation({ ...changes, alt: "Eisvogel auf einem Ast." }), "unsupported");
  }
  for (const observed of [null, undefined, [observation(), observation()], {}]) {
    assertRejected(planImage(), observed, "unsupported");
  }
});

test("fehlende oder mehrdeutige Alt- und Captionwerte sind keine leeren beobachteten Felder", () => {
  for (const changes of [{ alt: undefined }, { alt: null }, { alt: ["Bisheriger Alternativtext"] },
    { caption: undefined }, { caption: null }, { caption: ["Sichtbare Bildunterschrift. "] }]) {
    assertRejected(planImage(), observation(changes), "conflict");
  }
  for (const changes of [{ expectedAlt: undefined }, { expectedCaption: undefined }, { expectedAlt: [] }, { expectedCaption: [] }]) {
    assertRejected(planImage(changes), observation(), "conflict");
  }
});

test("Freigabegrenze ist 2000 Zeichen; bewusst leer verlangt decorative true", () => {
  assert.deepEqual(assessSquarespaceImageBlockField(planImage({ text: "a".repeat(2000) }), observation()), { status: "ready" });
  assert.deepEqual(assessSquarespaceImageBlockField(planImage({ text: "", decorative: true }), observation()), { status: "ready" });
  assert.deepEqual(assessSquarespaceImageBlockField(planImage({ text: "", decorative: true }), observation({ alt: "" })), { status: "unchanged" });
  for (const changes of [{ text: "a".repeat(2001) }, { text: "" }, { text: " " }, { text: "", decorative: undefined },
    { text: "Text", decorative: true }, { text: " ", decorative: true }, { text: null }, { text: "Text\u0000" }]) {
    assertRejected(planImage(changes), observation(), "unsupported");
  }
});

test("Bewertung erhält alle Eingaben auch bei Konflikt und unverändertem Ergebnis exakt", () => {
  const image = Object.freeze(planImage());
  for (const changes of [{}, { alt: image.text }, { caption: "Geändert" }, { sourceUrl: "https://evil.test/bird.jpg" }, { editable: false }]) {
    const observed = Object.freeze(observation(changes)), beforeImage = structuredClone(image), beforeObserved = structuredClone(observed);
    assessSquarespaceImageBlockField(image, observed);
    assert.deepEqual(image, beforeImage);
    assert.deepEqual(observed, beforeObserved);
  }
});
