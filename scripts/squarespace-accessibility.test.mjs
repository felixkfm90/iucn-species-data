import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const [statusSource, portraitSource, mapSource, lightboxSource] = await Promise.all([
  readFile(new URL("../species-status.js", import.meta.url), "utf8"),
  readFile(new URL("../species-portrait.js", import.meta.url), "utf8"),
  readFile(new URL("../map-loader.js", import.meta.url), "utf8"),
  readFile(new URL("../lightbox-zoom.js", import.meta.url), "utf8"),
]);

test("Status- und Trendsymbole benennen ihre sichtbare Bedeutung", () => {
  assert.match(statusSource, /alt="IUCN-Status: \$\{categoryText\}"/);
  assert.match(statusSource, /alt="Populationstrend: \$\{trendText\}"/);
});

test("Artporträt benennt die dargestellte Art", () => {
  assert.match(portraitSource, /alt="Artporträt – \$\{speciesName\}"/);
});

test("Karten-Vollbild übernimmt den Alternativtext der Ausgangskarte", () => {
  assert.match(mapSource, /openFullscreen\(imgUrl, img\.alt\)/);
  assert.match(mapSource, /img\.alt = altText \|\| "Vergrößerte Verbreitungskarte"/);
});

test("Lightbox-Zoom übernimmt den Alternativtext des geöffneten Bildes", () => {
  assert.match(lightboxSource, /const altText = img\?\.getAttribute\("alt"\) \|\| ""/);
  assert.match(lightboxSource, /openZoom\(src, altText\)/);
  assert.match(lightboxSource, /zoomImg\.alt = altText \|\| "Vergrößerte Bildansicht"/);
});
