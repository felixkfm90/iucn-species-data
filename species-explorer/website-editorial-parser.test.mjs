import test from "node:test";
import assert from "node:assert/strict";
import { canonicalWebsiteImageSource, parseWebsiteAltPage, parseWebsiteEditorialPage } from "./website-alt-parser.mjs";

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

const nativeSource = "https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/29b825bb-1b9f-44b3-964c-3caeb8f788a2/";
const aliasSource = nativeSource.replace("/content/v1/", "/content/v2/namespaces/website/libraries/");

function figure(position, body) {
  return `<figure data-fn-position="${position}">${body}</figure>`;
}

function fnGallery(body) {
  return `<div class="sqs-block-code"><div class="sqs-code-container"><div data-fn-art-gallery="1">${body}</div></div></div>`;
}

test("Explorer-Galerien behalten sichtbare Reihenfolge, Alternativtext, Bildunterschrift und Bildnachweis", () => {
  const first = figure(1, `<img src="${aliasSource}Fisch.JPG?format=750w" alt="Eisvogel" data-src="${nativeSource}Fisch.JPG">`
    + '<figcaption><span data-fn-caption="">Am Wasser &amp; im Flug</span><small data-fn-credit="">Felix &amp; Niko\nKamera</small></figcaption>');
  const second = figure(2, `<img src="${nativeSource}Wasser.webp" alt="">`);
  const native = `<section data-sqsp-section="gallery"><img src="${nativeSource}Küste.png"></section>`;
  const pageHtml = page(block("<h2>Lebensraum</h2><p>Am Bach.</p>") + fnGallery(first + second) + native);
  const result = parseWebsiteEditorialPage(pageHtml, url);
  assert.equal(result.complete, true);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.gallerySources, [`${nativeSource}Fisch.JPG`, `${nativeSource}Wasser.webp`, `${nativeSource}K%C3%BCste.png`]);
  assert.equal(result.sections[0].paragraphs[0].text, "Am Bach.");
  const [bird, water, coast] = parseWebsiteAltPage(pageHtml, url).images;
  assert.equal(bird.sourceUrl, `${nativeSource}Fisch.JPG`);
  assert.equal(bird.alt, "Eisvogel");
  assert.deepEqual(bird.captionVariants, ["Am Wasser & im Flug"]);
  assert.deepEqual(bird.attributionVariants, ["Felix & Niko\nKamera"]);
  assert.equal(water.alt, "");
  assert.deepEqual(water.attributionVariants, [""]);
  assert.equal(coast.attributionVariants, undefined);
});

test("Nur die geprüfte Squarespace-v2-Bibliotheksroute wird zum stabilen v1-Bild aufgelöst", () => {
  for (const transform of ["", "?format=750w", "?format=1500w", "?format=original"]) {
    assert.equal(canonicalWebsiteImageSource(`${aliasSource}Probe.JPG${transform}`), `${nativeSource}Probe.JPG`);
  }
  const examples = [
    `${aliasSource}Probe.JPG?format=750w&format=1500w`,
    `${aliasSource}Probe.JPG?format=99w`,
    `${aliasSource}Probe.JPG?format=750w&crop=other`,
    `${aliasSource}Probe.svg?format=750w`,
    `${aliasSource.replace("67556be0338df718ea064210", "57556be0338df718ea064210")}Probe.JPG`,
    `${aliasSource.replace("29b825bb-1b9f-44b3-964c-3caeb8f788a2", "other")}Probe.JPG`,
  ];
  for (const candidate of examples) {
    const result = canonicalWebsiteImageSource(candidate);
    assert.ok(result.includes("/content/v2/"));
    assert.equal(canonicalWebsiteImageSource(result), result);
  }
});

test("Kaputte oder mehrdeutige Explorer-Galerien bleiben als blockierende Quellenfehler sichtbar", () => {
  const photo = (name = "Vogel", extra = "") => `<img src="${nativeSource}${name}.jpg" alt="Eisvogel" ${extra}>`;
  for (const [body, code] of [
    [fnGallery(figure(2, photo())), "unverified-fn-gallery-structure"],
    [fnGallery(figure(1, photo()) + figure(1, photo("Bach"))), "unverified-fn-gallery-structure"],
    [fnGallery(figure(1, photo() + photo("Bach"))), "unverified-fn-gallery-structure"],
    [fnGallery(figure(1, photo("Vogel", 'alt="Zweiter Wert"'))), "unverified-fn-gallery-structure"],
    [fnGallery(figure(1, photo() + "<figcaption><span>Unbekanntes Feld</span></figcaption>")), "unverified-fn-gallery-structure"],
    [fnGallery(figure(1, photo("Vogel", `data-src="${nativeSource}Bach.jpg"`))), "ambiguous-fn-gallery-source"],
    [fnGallery(figure(1, photo()) + figure(2, photo())), "ambiguous-fn-gallery-source"],
    [fnGallery(figure(1, photo())) + `<section data-sqsp-section="gallery">${photo()}</section>`, "ambiguous-fn-gallery-source"],
    [`<div hidden>${fnGallery(figure(1, photo()))}</div>`, "unverified-fn-gallery-structure"],
  ]) {
    const result = parseWebsiteEditorialPage(page(body), url);
    assert.equal(result.complete, false);
    assert.ok(result.issues.some(issue => issue.code === code), body);
  }
});

test("Explorer-Bildverwendungen mit den neuen Squarespace-Merkmalen müssen eindeutig bleiben", () => {
  const use = (position, id) => `<figure data-fn-position="${position}" data-fn-item-id="${id}"><img src="${nativeSource}Foto-${position}.jpg" alt=""></figure>`;
  const a = `fn-figure-${"a".repeat(24)}`, b = `fn-figure-${"b".repeat(24)}`;
  const result = parseWebsiteEditorialPage(page(fnGallery(use(1, a) + use(2, b))), url);
  assert.equal(result.complete, true);
  assert.deepEqual(result.gallerySources, [`${nativeSource}Foto-1.jpg`, `${nativeSource}Foto-2.jpg`]);
  const duplicate = parseWebsiteEditorialPage(page(fnGallery(use(1, a) + use(2, a))), url);
  assert.equal(duplicate.complete, false);
  assert.deepEqual(duplicate.gallerySources, []);
});

test("Codebeispiele, Kopfbereich und auskommentierte Galeriefragmente liefern keine Fotos", () => {
  const markup = fnGallery(figure(1, `<img src="${nativeSource}Beispiel.jpg" alt="Beispiel">`));
  const pageHtml = `<header>${markup}</header>${page(`<script>const text = '${markup}';</script><template>${markup}</template><pre>${markup}</pre><!--${markup}-->`)}`;
  const result = parseWebsiteEditorialPage(pageHtml, url);
  assert.equal(result.complete, true);
  assert.deepEqual(result.gallerySources, []);
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
