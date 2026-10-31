import test from "node:test";
import assert from "node:assert/strict";
import { parseWebsiteEditorialPage } from "./website-alt-parser.mjs";

const url = "https://www.fnwildlifetravel.de/wildlife/heimische-tierwelt/alcedoatthis";
const page = (body) => `<main><section data-section-id="article">${body}</section></main>`;
const block = (body, id = "text") => `<div class="sqs-block sqs-block-html" id="${id}">${body}</div>`;

test("Arttexte behalten Überschriften, Absätze, Listen und leere Modulüberschriften", () => {
  const result = parseWebsiteEditorialPage(page(block("<h2>Allgemein</h2><h2>Aussehen</h2><p>Blau &amp; orange <strong>gefärbt</strong>.</p><ul><li>Erstes Merkmal</li><li>Zweites Merkmal</li></ul><h2>Verbreitungskarte</h2>")), url);
  assert.equal(result.complete, true);
  assert.deepEqual(result.sections.map((entry) => entry.heading), ["Allgemein", "Aussehen", "Verbreitungskarte"]);
  assert.deepEqual(result.sections[1].paragraphs, [
    { kind: "paragraph", text: "Blau & orange gefärbt." },
    { kind: "list-item", text: "Erstes Merkmal" }, { kind: "list-item", text: "Zweites Merkmal" },
  ]);
  assert.deepEqual(result.sections[0].paragraphs, []);
});

test("Inlineformatierung erfindet weder Leerzeichen vor Satzzeichen noch mitten im Wort", () => {
  const result = parseWebsiteEditorialPage(page(block("<h2>Aussehen</h2><p><strong>Blau</strong>grün, orange<em>rot</em>.</p><p>Zweiter<br>Absatzteil</p>")), url);
  assert.equal(result.complete, true);
  assert.equal(result.sections[0].paragraphs[0].text, "Blaugrün, orangerot.");
  assert.equal(result.sections[0].paragraphs[1].text, "Zweiter Absatzteil");
});

test("Fachabsatz darf über mehrere Textblöcke fortgesetzt werden", () => {
  const result = parseWebsiteEditorialPage(page(block("<h2>Lebensraum</h2>", "heading") + block("<p>Am Wasser.</p>", "paragraph")), url);
  assert.equal(result.sections.length, 1);
  assert.equal(result.sections[0].paragraphs[0].text, "Am Wasser.");
  assert.equal(result.complete, true);
});

test("Ungegliederter Anfangstext bleibt erhalten und wird keiner fremden Überschrift zugeordnet", () => {
  const result = parseWebsiteEditorialPage(page(block("<p>Einleitung.</p><h2>Nahrung</h2><p>Fische.</p>")), url);
  assert.equal(result.sections[0].heading, null);
  assert.equal(result.sections[0].paragraphs[0].text, "Einleitung.");
  assert.equal(result.sections[1].heading, "Nahrung");
});

test("Kopf, Fuß, Navigation, Skripte und Galeriecaption werden nicht zu Fachtexten", () => {
  const result = parseWebsiteEditorialPage(`<header>${block("<h2>Logo</h2>")}</header>${page(block("<h2>Aussehen</h2><p>Sichtbarer Text.</p>")
    + `<script>${block("<p>Falscher Text</p>")}</script><section data-sqsp-section="gallery"><figcaption>Caption</figcaption></section>`)}<footer>${block("<h2>FN Wildlife &amp; Travel</h2>")}</footer>`, url);
  assert.deepEqual(result.sections.map((entry) => entry.heading), ["Aussehen"]);
  assert.equal(result.sections[0].paragraphs[0].text, "Sichtbarer Text.");
});

test("Galeriefolge bleibt an kanonische Quellen gebunden und doppelte Vorschau wird zusammengeführt", () => {
  const prefix = "https://images.squarespace-cdn.com/content/v1/site/photo/";
  const result = parseWebsiteEditorialPage(page(`<div data-sqsp-section="gallery"><img data-src="${prefix}b.jpg?format=750w"><img src="${prefix}a.jpg"><img src="${prefix}b.jpg?format=1000w"></div>`), url);
  assert.deepEqual(result.gallerySources, [`${prefix}b.jpg`, `${prefix}a.jpg`]);
});

test("Nicht zugeordneter Fachtext wird sichtbar gemeldet und nicht still verworfen", () => {
  const result = parseWebsiteEditorialPage(page(block("<h2>Aussehen</h2>Text ohne Absatz<p>Weiterer Text</p>")), url);
  assert.equal(result.complete, false);
  assert.equal(result.issues[0].code, "unassigned-editorial-text");
  assert.ok(result.blocks[0].fullText.includes("Text ohne Absatz"));
});

test("Unzulässige Galeriequelle bleibt als offenes Ergebnis erkennbar", () => {
  const result = parseWebsiteEditorialPage(page('<div data-sqsp-section="gallery"><img src="file:///private.jpg"></div>'), url);
  assert.equal(result.complete, false);
  assert.equal(result.issues[0].code, "unsupported-gallery-source");
});

test("Seiten- und HTML-Grenzen gelten auch für den neuen redaktionellen Leser", () => {
  assert.throws(() => parseWebsiteEditorialPage(page(block("<p>Text</p>")), "https://example.org/private"));
  assert.throws(() => parseWebsiteEditorialPage(null, url));
  assert.throws(() => parseWebsiteEditorialPage("x".repeat(4 * 1024 * 1024 + 1), url));
  assert.throws(() => parseWebsiteEditorialPage(page('<div class="sqs-block-html"><script>unvollständig'), url));
  assert.throws(() => parseWebsiteEditorialPage(page(block(block("<p>Mehrdeutig</p>"))), url));
});
