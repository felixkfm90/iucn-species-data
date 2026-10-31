import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { createWebsiteAltPublicAssets, WEBSITE_PUBLIC_ASSET_ROOT as root } from "./website-alt-public-assets.mjs";
import { createWebsiteAltDiscovery } from "./website-alt-discovery.mjs";
import { parseWebsiteAltPage } from "./website-alt-parser.mjs";
import { sanitizeAssetName } from "./species-model.mjs";

const origin = "https://www.fnwildlifetravel.de";
const pageUrl = `${origin}/wildlife/heimische-tierwelt/ciconiaciconia`;
const files = ["species-core.js", "species-status.js", "species-sound.js", "map-loader.js", "species-portrait.js"];
const sources = Object.fromEntries(await Promise.all(files.map(async (file) => [file,
  (await fs.readFile(new URL(`../${file}`, import.meta.url), "utf8")).replace(/\r\n/g, "\n")])));
const bird = { URLSlug: "ciconiaciconia", "Deutscher Name": "Weissstorch", "Wissenschaftlicher Name": "Ciconia ciconia",
  Status: "LC", Kategorie: "Nicht gefährdet", Trend: "Zunehmend" };
const html = (body = "", scripts = files.map((file) => `<script src="${root}${file}?v=known" defer></script>`).join("")) =>
  `<html><head><title>Weißstorch</title></head><body>${body}${scripts}</body></html>`;
const placeholders = '<div id="species-output"></div><div id="species-status"></div><div id="species-sound"></div><div id="map-wrapper"><div id="map-output"></div></div>';
const response = (body, type, status = 200) => new Response(body, { status, headers: { "content-type": type } });
const pathOf = (url) => new URL(url).pathname.slice("/iucn-species-data/".length);

function fixture({ data = [bird], assetStatus = () => 200, mutateSource = (_file, source) => source } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method || "GET", options });
    assert.equal(options.redirect, "manual");
    assert.equal(new URL(url).origin, new URL(root).origin);
    assert.ok(new URL(url).pathname.startsWith("/iucn-species-data/"));
    const pathname = pathOf(url);
    if (files.includes(pathname)) return response(mutateSource(pathname, sources[pathname]), "application/javascript");
    if (pathname === "speciesData.json") return response(JSON.stringify(typeof data === "function" ? data() : data), "application/json");
    assert.equal(options.method, "HEAD", "Bild- und Audiodaten werden nicht heruntergeladen");
    return response(null, pathname.endsWith(".mp3") ? "audio/mpeg" : "image/webp", assetStatus(pathname));
  };
  return { calls, fetchImpl, resolver: createWebsiteAltPublicAssets({ fetchImpl }) };
}

test("Öffentlich beobachtete Module ergänzen Karte, Porträt, Status, Trend und dekoratives Spektrogramm", async () => {
  const f = fixture(), source = html(placeholders);
  const result = await f.resolver.enrich(parseWebsiteAltPage(source, pageUrl), source);
  assert.equal(result.images.length, 5);
  assert.ok(result.images.every((entry) => entry.context === "content" && entry.kind === "image"));
  assert.deepEqual(result.images.map((entry) => entry.alt).sort(), ["Artporträt – Weissstorch", "IUCN-Status: Nicht gefährdet",
    "Populationstrend: Zunehmend", "Verbreitungskarte - Weissstorch", ""].sort());
  assert.equal(result.images.find((entry) => entry.src.endsWith("/spectrogram.webp")).altPresent, true);
  assert.equal(result.publicModuleEvidence.source, "public-module-inference");
  assert.equal(result.publicModuleEvidence.modules.length, 5);
  assert.match(result.publicModuleEvidence.data.sha256, /^[a-f0-9]{64}$/);
  assert.match(result.coverageNotes.at(-1), /kein gerenderter Sichtnachweis/);
});

test("Fehlende oder nur zitierte Marker lösen keinen öffentlichen Zusatzabruf aus", async () => {
  const f = fixture();
  for (const body of ["", `<!--${placeholders}-->`, `<script>const example='${placeholders}';</script>`,
    `<template><template>${placeholders}</template>${placeholders}</template>`, `<noscript>${placeholders}</noscript>`]) {
    const source = html(body), parsed = parseWebsiteAltPage(source, pageUrl);
    assert.deepEqual(await f.resolver.enrich(parsed, source), parsed);
  }
  assert.equal(f.calls.length, 0);
});

test("Ein abhängiges defer-Modul vor dem Kern oder eine doppelte Einbindung wird nicht als Ausgabe erfunden", async () => {
  const f = fixture();
  const core = `<script src="${root}species-core.js" defer></script>`;
  const portrait = `<script src="${root}species-portrait.js" defer></script>`;
  for (const scripts of [portrait + core, core + portrait + portrait, core + core + portrait]) {
    const source = html('<div id="species-output"></div>', scripts);
    const result = await f.resolver.enrich(parseWebsiteAltPage(source, pageUrl), source);
    assert.equal(result.images.length, 0);
    assert.equal(result.unsupportedImageCount, 1);
  }
  assert.equal(f.calls.length, 0);
});

test("Modulplatzhalter ohne sichere feste Skriptquelle bleiben sichtbar ungeklärt", async () => {
  const f = fixture();
  for (const scripts of ["", '<script src="species-core.js" defer></script>',
    files.map((file) => `<script src="https://evil.invalid/${file}" defer></script>`).join(""),
    files.map((file) => `<script src="${root}${file}" async></script>`).join(""),
    files.map((file) => `<script src="https://user:secret@felixkfm90.github.io/iucn-species-data/${file}" defer></script>`).join("")]) {
    const source = html(placeholders, scripts), result = await f.resolver.enrich(parseWebsiteAltPage(source, pageUrl), source);
    assert.equal(result.images.length, 0);
    assert.equal(result.unsupportedImageCount, 5);
    assert.match(result.coverageNotes.at(-1), /bleiben zur Prüfung offen/);
  }
  assert.equal(f.calls.length, 0);
});

test("Fehlende Art, doppelter Slug oder falscher Seitenpfad erzeugen keine erfundene Zuordnung", async () => {
  for (const data of [[{ ...bird, URLSlug: "turdusmerula" }], [bird, bird], [{ ...bird, "Deutscher Name": "" }]]) {
    const f = fixture({ data }), source = html(placeholders);
    await assert.rejects(f.resolver.enrich(parseWebsiteAltPage(source, pageUrl), source), /Artzuordnung|Artendaten/);
    assert.ok(f.calls.every((call) => call.method !== "HEAD"));
  }
  const f = fixture(), source = html(placeholders), wrong = `${origin}/reisen/ciconiaciconia`;
  await assert.rejects(f.resolver.enrich(parseWebsiteAltPage(source, wrong), source), /Artseitenpfad/);
  assert.equal(f.calls.length, 0);
});

test("Ein unbekannter öffentlicher Modulstand stoppt die Ableitung, statt lokale Quellen als live anzunehmen", async () => {
  const f = fixture({ mutateSource: (file, source) => file === "species-status.js" ? `${source}\n// changed output` : source });
  const source = html('<div id="species-status"></div>');
  await assert.rejects(f.resolver.enrich(parseWebsiteAltPage(source, pageUrl), source), /ungeprüften Quellstand/);
});

test("Optionale nicht vorhandene Medien werden wie im öffentlichen Modul ausgelassen", async () => {
  for (const absent of ["map.jpg", "portrait.webp", "sound.mp3", "spectrogram.webp"]) {
    const f = fixture({ assetStatus: (pathname) => pathname.endsWith(absent) ? 404 : 200 }), source = html(placeholders);
    const result = await f.resolver.enrich(parseWebsiteAltPage(source, pageUrl), source);
    assert.equal(result.images.length, 4, absent);
    assert.ok(!result.images.some((entry) => entry.src.endsWith(absent === "sound.mp3" ? "spectrogram.webp" : absent)));
    if (absent === "sound.mp3") assert.ok(!f.calls.some((call) => pathOf(call.url).endsWith("spectrogram.webp")));
  }
});

test("Unveränderte Abgleiche haben dieselben Bildkennungen und verdoppeln statische Modulbilder nicht", async () => {
  const f = fixture(), source = html(`${placeholders}<img src="${root}species-assets/Weissstorch/map.jpg" alt="Verbreitungskarte - Weissstorch">`);
  const first = await f.resolver.enrich(parseWebsiteAltPage(source, pageUrl), source);
  const second = await f.resolver.enrich(parseWebsiteAltPage(source, pageUrl), source);
  assert.equal(first.images.length, 5);
  assert.deepEqual(first.images.map((entry) => entry.key), second.images.map((entry) => entry.key));
  assert.equal(f.calls.filter((call) => pathOf(call.url) === "speciesData.json").length, 1);
  assert.ok(first.images.every((entry) => entry.altVariants.length === 1));
});

test("Konflikte mit statischen Alttexten bleiben als Varianten erkennbar", async () => {
  const f = fixture(), source = html(`<div id="map-wrapper"><div id="map-output"></div></div><img src="${root}species-assets/Weissstorch/map.jpg" alt="Abweichender Text">`);
  const result = await f.resolver.enrich(parseWebsiteAltPage(source, pageUrl), source);
  assert.equal(result.images.length, 1);
  assert.deepEqual(result.images[0].altVariants, ["Abweichender Text", "Verbreitungskarte - Weissstorch"]);
});

test("Dateinamenkodierung stimmt mit dem gebundenen öffentlichen SpeciesCore überein", async () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(sources["species-core.js"], context);
  const name = "Ä Ö ß / @ + ‘A’ – & æ ø Ł";
  assert.equal(sanitizeAssetName(name), context.window.SpeciesCore.sanitizeAssetName(name));
  const f = fixture({ data: [{ ...bird, "Deutscher Name": name }] }), source = html('<div id="species-output"></div>');
  const result = await f.resolver.enrich(parseWebsiteAltPage(source, pageUrl), source);
  assert.equal(result.images[0].src, `${root}species-assets/${encodeURIComponent(sanitizeAssetName(name))}/portrait.webp`);
});

test("Status- und Trendfallback folgen den gebundenen öffentlichen Regeln ohne neue fachliche Deutung", async () => {
  const f = fixture({ data: [{ ...bird, Status: "DD", Kategorie: "Keine ausreichenden Daten", Trend: "n/a" }] });
  const source = html('<div id="species-status"></div>');
  const result = await f.resolver.enrich(parseWebsiteAltPage(source, pageUrl), source);
  assert.equal(result.images[0].src, `${root}graphics/catagory/Alternativ/LC.png`);
  assert.equal(result.images[0].alt, "IUCN-Status: Keine ausreichenden Daten");
  assert.equal(result.images[1].src, `${root}graphics/trend/nodata.png`);
  assert.equal(result.images[1].alt, "Populationstrend: Unbekannt");
});

test("Weiterleitungen, Antwortfälschung, Fehler und falsche Inhaltstypen liefern keinen Ableitungserfolg", async () => {
  for (const make of [() => new Response(null, { status: 302, headers: { location: "https://evil.invalid/a" } }),
    () => response("failed", "application/javascript", 503), () => response("not script", "text/html"), () => {
      const r = response(sources["species-core.js"], "application/javascript");
      Object.defineProperty(r, "url", { value: "https://evil.invalid/a" }); return r;
    }]) {
    let calls = 0;
    const resolver = createWebsiteAltPublicAssets({ fetchImpl: async () => { calls += 1; return make(); } });
    const source = html('<div id="species-output"></div>');
    await assert.rejects(resolver.enrich(parseWebsiteAltPage(source, pageUrl), source));
    assert.equal(calls, 1);
  }
});

test("Modulabruf und Körperstillstand respektieren Timeout, Abbruch und Mengenbudget", async () => {
  const source = html('<div id="species-output"></div>'), parsed = parseWebsiteAltPage(source, pageUrl);
  for (const fetchImpl of [() => new Promise(() => {}), async () => response(new ReadableStream({ start() {} }), "application/javascript")]) {
    const resolver = createWebsiteAltPublicAssets({ fetchImpl, timeoutMs: 15 });
    await assert.rejects(resolver.enrich(parsed, source), /Zeitüberschreitung/);
  }
  const controller = new AbortController();
  const resolver = createWebsiteAltPublicAssets({ signal: controller.signal, fetchImpl: () => new Promise(() => {}) });
  const pending = resolver.enrich(parsed, source); setTimeout(() => controller.abort(), 5);
  await assert.rejects(pending, { name: "AbortError" });
  const f = fixture(), small = createWebsiteAltPublicAssets({ fetchImpl: f.fetchImpl, maxBytes: 30 });
  await assert.rejects(small.enrich(parsed, source), /Größengrenze/);
});

test("Einzelabgleiche lesen öffentliche Daten frisch; Vollscans teilen nur ihren eigenen kleinen Cache", async () => {
  let changed = false;
  const f = fixture({ data: () => [{ ...bird, "Deutscher Name": changed ? "Anderer Name" : "Weissstorch" }] });
  const source = html('<div id="species-output"></div>');
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    if (parsed.origin !== origin) return f.fetchImpl(url, options);
    return parsed.pathname.endsWith(".xml") ? response(`<urlset><url><loc>${pageUrl}</loc></url></urlset>`, "text/xml")
      : response(parsed.pathname === "/" ? html("") : source, "text/html");
  };
  const discovery = createWebsiteAltDiscovery({ fetchImpl });
  const before = await discovery.page(pageUrl); changed = true;
  const after = await discovery.page(pageUrl);
  assert.match(before.images[0].src, /Weissstorch/);
  assert.match(after.images[0].src, /Anderer%20Name/);
  assert.notEqual(before.publicModuleEvidence.data.sha256, after.publicModuleEvidence.data.sha256);
  const scan = await discovery.scan();
  assert.equal(scan.complete, true);
  assert.equal(scan.pages.find((entry) => entry.url === pageUrl).images.length, 1);
});

test("Modulfehler erscheinen im Vollscan als Seitenfehler und niemals als vollständiger Erfolg", async () => {
  const source = html('<div id="species-output"></div>');
  const discovery = createWebsiteAltDiscovery({ fetchImpl: async (url) => new URL(url).origin !== origin
    ? response("unavailable", "text/html", 503) : new URL(url).pathname.endsWith(".xml")
      ? response(`<urlset><url><loc>${pageUrl}</loc></url></urlset>`, "text/xml")
      : response(new URL(url).pathname === "/" ? html("") : source, "text/html") });
  const result = await discovery.scan();
  assert.equal(result.complete, false);
  assert.ok(result.errors.some((entry) => entry.url === pageUrl && /503/.test(entry.message)));
  assert.ok(!result.pages.some((entry) => entry.url === pageUrl));
});
