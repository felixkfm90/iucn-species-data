import assert from "node:assert/strict";
import test from "node:test";
import { canonicalWebsiteImageSource, createWebsiteAltDiscovery, normalizeWebsiteImageUrl, normalizeWebsitePageUrl, parseWebsiteAltPage } from "./website-alt-discovery.mjs";

const origin = "https://www.fnwildlifetravel.de";
const image = (name = "bird.jpg", format = "") => `https://images.squarespace-cdn.com/content/v1/site/${name}${format ? `?format=${format}` : ""}`;
const html = (body, title = "Testseite") => `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;
const xml = (...urls) => `<urlset>${urls.map((url) => `<url><loc>${url}</loc></url>`).join("")}</urlset>`;
const canonical = (url) => { const result = new URL(url); result.search = ""; return result.href; };
const response = (body, type = "text/html", status = 200) => new Response(body, { status, headers: { "content-type": type } });

test("Websiteadressen normalisieren nur öffentliche eigene Inhaltsseiten und begrenzte Bildhosts", () => {
  assert.equal(normalizeWebsitePageUrl("https://fnwildlifetravel.de/reisen/costarica/?tracking=1#bilder"), `${origin}/reisen/costarica`);
  assert.equal(normalizeWebsitePageUrl("/ueber-uns"), `${origin}/ueber-uns`);
  assert.equal(normalizeWebsiteImageUrl(image("bird.jpg", "750w")), image("bird.jpg", "750w"));
  assert.equal(normalizeWebsiteImageUrl("https://felixkfm90.github.io/iucn-species-data/species-assets/Bird/map.jpg"),
    "https://felixkfm90.github.io/iucn-species-data/species-assets/Bird/map.jpg");
  for (const value of ["http://www.fnwildlifetravel.de/a", "https://evil.invalid/a", "https://www.fnwildlifetravel.de.evil.invalid/a",
    "https://user:password@www.fnwildlifetravel.de/a", "https://www.fnwildlifetravel.de:444/a", "https://127.0.0.1/a",
    "/config/settings", "/api/delete", "/cart", "/sitemap.xml", "/photo.jpg", "/%2fapi/delete", "/%5capi/delete"]) {
    assert.throws(() => normalizeWebsitePageUrl(value), value);
  }
  for (const value of ["https://evil.invalid/a.jpg", "https://images.squarespace-cdn.com.evil.invalid/a.jpg", "data:image/png;base64,x",
    "file:///secret", "https://127.0.0.1/a.jpg", "https://felixkfm90.github.io/other-project/a.jpg", "https://user:password@images.squarespace-cdn.com/a",
    `${origin}/api/action.jpg`, `${origin}/%2fconfig/image.jpg`]) {
    assert.throws(() => normalizeWebsiteImageUrl(value), value);
  }
});

test("Galeriebilder, Beschriftungen, HTML-Referenzen und interne Links bleiben exakt zugeordnet", () => {
  const result = parseWebsiteAltPage(html(`<figure class="gallery-grid-item"><a href="/reisen/costarica#gallery">
    <img data-src="${image("bird.jpg")}" src="data:image/gif;base64,x" alt="Vogel &amp; Ast" />
    </a><figcaption><p>Vogel auf einem Ast.</p></figcaption></figure>
    <a href="https://evil.invalid/a">Extern</a><a href="mailto:test@example.com">Mail</a><a href="/config">Verwaltung</a>`, "Vögel &amp; Reisen"), `${origin}/reisen`);
  assert.equal(result.title, "Vögel & Reisen");
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].alt, "Vogel & Ast");
  assert.equal(result.images[0].caption, "Vogel auf einem Ast.");
  assert.equal(result.images[0].altPresent, true);
  assert.equal(result.images[0].previewSrc, image("bird.jpg", "750w"));
  assert.deepEqual(result.links, [`${origin}/reisen/costarica`]);
});

test("Gleiche Quellen bleiben bei Formatwechsel identisch, verschiedene Verwendungen und widersprüchliche Texte erkennbar", () => {
  const result = parseWebsiteAltPage(html(`<header><img src="${image("logo.png", "1000w")}" alt="FN" /></header>
    <figure><img src="${image("bird.jpg", "500w")}" alt="Vogel" /><figcaption>Auf einem Ast</figcaption></figure>
    <figure><img src="${image("bird.jpg", "1500w")}" alt="Anderer Text" /><figcaption>Andere Beschriftung</figcaption></figure>
    <div class="section-background"><img src="${image("bird.jpg")}" alt="" /></div>
    <footer><img src="${image("logo.png", "500w")}" alt="FN" /></footer>`), origin);
  assert.equal(result.images.length, 4);
  const bird = result.images.find((entry) => entry.kind === "image" && entry.context === "content");
  assert.equal(bird.occurrences, 2);
  assert.deepEqual(bird.altVariants, ["Vogel", "Anderer Text"]);
  assert.deepEqual(bird.captionVariants, ["Auf einem Ast", "Andere Beschriftung"]);
  assert.equal(bird.key, parseWebsiteAltPage(html(`<img src="${image("bird.jpg", "2500w")}" alt="Neuer Text" />`), origin).images[0].key);
  assert.notEqual(bird.key, result.images.find((entry) => entry.kind === "background").key);
  assert.notEqual(result.images.find((entry) => entry.context === "header").key, result.images.find((entry) => entry.context === "footer").key);
});

test("Doppelte Altattribute folgen dem ersten wirksamen Wert; fehlende Attribute sind nicht leere Freigaben", () => {
  const result = parseWebsiteAltPage(html(`<img src="${image()}" alt="" alt="Dateiname.jpg"><img src="${image()}" alt="Vogel">
    <img src="${image("missing.jpg")}">`), origin);
  assert.equal(result.images[0].alt, "");
  assert.deepEqual(result.images[0].altVariants, ["", "Vogel"]);
  assert.deepEqual(result.images[0].duplicateAltValues, ["Dateiname.jpg"]);
  assert.equal(result.images[1].altPresent, false);
  assert.match(result.coverageNotes.join(" "), /unterschiedliche Alternativtexte/);
});

test("Script-/Templatebilder werden nicht als vorhandene Bilder erfunden, Inlinehintergründe werden eingeordnet", () => {
  const result = parseWebsiteAltPage(html(`<script>const fake = '<img src="${image("fake.jpg")}" alt="Nicht echt">';</script>
    <style>.fake { background-image:url('${image("style.jpg")}'); }</style>
    <template><img src="${image("template.jpg")}" /></template>
    <noscript><img src="${image("fallback.jpg")}" /></noscript>
    <div style="background-image: url('${image("background.jpg")}'); color:red"></div>
    <img src="https://foreign.invalid/bird.jpg">`), origin);
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].kind, "background");
  assert.match(result.images[0].src, /background\.jpg$/);
  assert.match(result.coverageNotes.join(" "), /Skriptgenerierte/);
  assert.match(result.coverageNotes.join(" "), /1 Bildverwendung/);
  assert.equal(result.unsupportedImageCount, 1);
  assert.throws(() => parseWebsiteAltPage("<script>unterbrochen", origin), /Unvollständiges/);
  assert.throws(() => parseWebsiteAltPage("x".repeat(4 * 1024 * 1024 + 1), origin), /zu groß/);
});

test("Nur bekannte Squarespace-Formatparameter sind identitätsneutral; Bildwahlparameter bleiben gebunden", () => {
  const parse = (src) => parseWebsiteAltPage(html(`<img src="${src}" alt="Vogel">`), origin).images[0];
  const first = parse(`${image()}?asset=1&format=500w&crop=left`);
  const resized = parse(`${image()}?crop=left&format=1500w&asset=1`);
  const changed = parse(`${image()}?asset=2&format=500w&crop=left`);
  const cropped = parse(`${image()}?asset=1&format=500w&crop=right`);
  assert.equal(first.key, resized.key);
  assert.notEqual(first.key, changed.key);
  assert.notEqual(first.key, cropped.key);
  assert.equal(first.sourceUrl, canonicalWebsiteImageSource(first.src));
  assert.equal(new URL(first.previewSrc).searchParams.get("asset"), "1");
  assert.notEqual(parse(`${origin}/s/bird.jpg?format=a`).key, parse(`${origin}/s/bird.jpg?format=b`).key);
  const github = "https://felixkfm90.github.io/iucn-species-data/species-assets/Bird/map.jpg";
  assert.notEqual(parse(`${github}?format=a`).key, parse(`${github}?format=b`).key);
});

test("CSS-Variablen und zitierter Deklarationstext erfinden keine Inline-Hintergrundbilder", () => {
  const result = parseWebsiteAltPage(html(`<div style="--background-image:url('${image("variable.jpg")}')"></div>
    <div style="content:'Text; background-image:url(${image("quoted.jpg")})'"></div>
    <div style="/* background-image:url('${image("comment.jpg")}'); */ color:red"></div>
    <div style="background-image:image-set('url(${image("string.jpg")})' 1x)"></div>
    <div style="background-image:url('${image("real.jpg")}')"></div>`), origin);
  assert.deepEqual(result.images.map((entry) => entry.sourceUrl), [image("real.jpg")]);
  assert.equal(result.unsupportedImageCount, 0);
});

test("Mehrere echte Inline-Hintergrundebenen bleiben erfasst; URL-Semikolons trennen keine Deklarationen", () => {
  const first = `${image("first.jpg")}?variant=a;b`;
  const result = parseWebsiteAltPage(html(`<div style="background-image:linear-gradient(red, blue), url('${first}'), url('${image("second.jpg")}'); color:red"></div>`), origin);
  assert.deepEqual(result.images.map((entry) => entry.sourceUrl), [canonicalWebsiteImageSource(first), image("second.jpg")]);
  assert.ok(result.images.every((entry) => entry.kind === "background" && entry.alt === "" && !entry.altPresent));
});

test("Hintergrund-img erhält seinen wirklichen Alttext; ein CSS-Hintergrund hat keinen erfundenen Altwert", () => {
  const result = parseWebsiteAltPage(html(`<div class="section-background"><img src="${image()}" alt="Bestehende Motivbeschreibung"></div>
    <div style="background-image:url('${image("css.jpg")}')"></div>`), origin);
  assert.equal(result.images[0].kind, "background");
  assert.equal(result.images[0].alt, "Bestehende Motivbeschreibung");
  assert.equal(result.images[0].altPresent, true);
  assert.equal(result.images[1].alt, "");
  assert.equal(result.images[1].altPresent, false);
});

test("Geteilte große Figures werden mit konsistenter Beschriftung verarbeitet; übertiefe Strukturen stoppen", () => {
  const many = Array.from({ length: 300 }, (_, index) => `<img src="${image(`${index}.jpg`)}" alt="Vogel">`).join("");
  const result = parseWebsiteAltPage(html(`<figure>${many}${"<span>Text</span>".repeat(10000)}<figcaption>Gemeinsame Bildunterschrift</figcaption></figure>`), origin);
  assert.equal(result.images.length, 300);
  assert.ok(result.images.every((entry) => entry.caption === "Gemeinsame Bildunterschrift"));
  assert.throws(() => parseWebsiteAltPage(html("<div>".repeat(520) + "</div>".repeat(520)), origin), /komplexes HTML/);
});

test("Seitenliste liest Sitemapindex ohne Seitenabruf und erkennt zusätzliche neue Seiten frisch", async () => {
  const calls = [];
  let added = false;
  const discovery = createWebsiteAltDiscovery({ fetchImpl: async (url, options) => {
    assert.equal(options.redirect, "manual");
    calls.push(canonical(url));
    assert.ok(new URL(url).searchParams.has("fnaltcheck"));
    return response(canonical(url).endsWith("/sitemap.xml") ? `<sitemapindex><sitemap><loc>${origin}/pages.xml</loc></sitemap></sitemapindex>`
      : xml(`${origin}/a`, ...(added ? [`${origin}/neu`] : [])), "text/xml");
  } });
  assert.deepEqual((await discovery.listPages()).urls, [`${origin}/a`]);
  added = true;
  const current = await discovery.listPages();
  assert.equal(current.complete, true);
  assert.deepEqual(current.urls, [`${origin}/a`, `${origin}/neu`]);
  assert.deepEqual(calls, [`${origin}/sitemap.xml`, `${origin}/pages.xml`, `${origin}/sitemap.xml`, `${origin}/pages.xml`]);
});

test("Vollscan ergänzt verlinkte eigene Seiten außerhalb der Sitemap und erhält Seitentypen", async () => {
  const calls = [];
  const discovery = createWebsiteAltDiscovery({ fetchImpl: async (url) => {
    const target = canonical(url); calls.push(target);
    if (target.endsWith(".xml")) return response(xml(`${origin}/reisen`), "text/xml");
    if (target === `${origin}/`) return response(html('<a href="/reisen">Reisen</a><a href="https://foreign.invalid/">Extern</a>'));
    if (target.endsWith("/reisen")) return response(html(`<img src="${image()}" alt="Vogel"><a href="/nicht-verlinkt">Mehr</a>`));
    return response(html(`<img src="${image("extra.jpg")}" alt="Noch ein Vogel">`, "Zusatzseite"));
  } });
  const result = await discovery.scan();
  assert.equal(result.complete, true);
  assert.equal(result.pages.length, 3);
  assert.equal(result.pages.find((entry) => entry.url.endsWith("/nicht-verlinkt")).title, "Zusatzseite");
  assert.equal(result.source, "public-static-html");
  assert.match(result.coverageNotes[0], /kein Vollständigkeitsnachweis/);
  assert.ok(calls.every((url) => url.startsWith(origin)));
});

test("Einzelfehler bleiben sichtbar, erfolgreicher Teilscan wird nicht als vollständiger Abschluss ausgegeben", async () => {
  const discovery = createWebsiteAltDiscovery({ fetchImpl: async (url) => canonical(url).endsWith(".xml")
    ? response(xml(`${origin}/broken`), "text/xml") : canonical(url).endsWith("/broken") ? response("Fehler", "text/html", 503) : response(html("")) });
  const result = await discovery.scan();
  assert.equal(result.complete, false);
  assert.equal(result.pages.length, 1);
  assert.equal(result.errors[0].url, `${origin}/broken`);
  assert.match(result.errors[0].message, /503/);
  assert.ok(result.discoveredUrls.includes(`${origin}/broken`));
});

test("Fremde Seedadressen werden vor jedem Abruf abgewiesen, Fremdsitemaps nie angefragt", async () => {
  let calls = 0;
  const discovery = createWebsiteAltDiscovery({ fetchImpl: async () => {
    calls += 1;
    return response('<sitemapindex><sitemap><loc>https://evil.invalid/x.xml</loc></sitemap></sitemapindex>', "text/xml");
  } });
  await assert.rejects(discovery.scan({ seedUrls: ["https://evil.invalid/a"] }), /FN-Website/);
  await assert.rejects(discovery.page("https://127.0.0.1/a"), /FN-Website/);
  assert.equal(calls, 0);
  const result = await discovery.listPages();
  assert.equal(calls, 1);
  assert.equal(result.complete, false);
  assert.match(result.errors[0].message, /Sitemap-Adresse/);
});

test("Seitengrenze, Antwortgröße und unerwartete Antwortadressen erzeugen keinen falschen Erfolg", async () => {
  const limited = createWebsiteAltDiscovery({ maxPages: 1, fetchImpl: async (url) => canonical(url).endsWith(".xml")
    ? response(xml(`${origin}/one`, `${origin}/two`), "text/xml") : response(html('<a href="/three">Mehr</a>')) });
  assert.equal((await limited.scan()).complete, false);
  const large = createWebsiteAltDiscovery({ maxDocumentBytes: 50, fetchImpl: async () => response("x".repeat(51)) });
  await assert.rejects(large.page(origin), /Größengrenze/);
  const redirected = createWebsiteAltDiscovery({ fetchImpl: async () => {
    const result = response(html("")); Object.defineProperty(result, "url", { value: "https://evil.invalid/" }); return result;
  } });
  await assert.rejects(redirected.page(origin), /Weiterleitung/);
});

test("Fetch- und Körperstillstand enden innerhalb derselben begrenzten Lesezeit", async () => {
  for (const fetchImpl of [() => new Promise(() => {}), async () => response(new ReadableStream({ start() {} }))]) {
    const discovery = createWebsiteAltDiscovery({ fetchImpl, timeoutMs: 15 });
    await assert.rejects(discovery.page(origin), /Zeitüberschreitung/);
  }
});

test("Frische Einzelprüfung liefert keine alten Texte und erzeugt keine Schreibanfrage", async () => {
  let changed = false;
  const discovery = createWebsiteAltDiscovery({ fetchImpl: async (_url, options) => {
    assert.equal(options.method, undefined);
    assert.equal(options.body, undefined);
    return response(html(`<figure><img src="${image()}" alt="${changed ? "Freigegebener Vogel" : "Dateiname.jpg"}"><figcaption>Bestehende Beschriftung</figcaption></figure>`));
  } });
  const before = await discovery.page(`${origin}/reisen`);
  changed = true;
  const after = await discovery.page(`${origin}/reisen`);
  assert.equal(before.images[0].alt, "Dateiname.jpg");
  assert.equal(after.images[0].alt, "Freigegebener Vogel");
  assert.equal(before.images[0].key, after.images[0].key);
  assert.equal(after.images[0].caption, "Bestehende Beschriftung");
  assert.ok(after.checkedAt);
});

test("Serverabbruch stoppt auch nicht kooperierende Fetches und verhindert weitere Sitemap-/Seitenanfragen", async () => {
  for (const operation of ["page", "listPages", "scan"]) {
    const controller = new AbortController();
    let calls = 0;
    const discovery = createWebsiteAltDiscovery({ timeoutMs: 10000, fetchImpl: () => { calls += 1; return new Promise(() => {}); } });
    const pending = operation === "page" ? discovery.page(origin, { signal: controller.signal })
      : discovery[operation]({ signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    if (operation === "page") await assert.rejects(pending, { name: "AbortError" });
    else assert.equal((await pending).complete, false);
    assert.equal(calls, 1);
  }
  let calls = 0;
  const controller = new AbortController(); controller.abort();
  const discovery = createWebsiteAltDiscovery({ fetchImpl: () => { calls += 1; throw new Error("Darf nicht aufgerufen werden"); } });
  await assert.rejects(discovery.page(origin, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls, 0);
});

test("Eigene Weiterleitungen werden als Verweise erfasst; nur der Vollscan nimmt das sichere Inhaltsziel in seine Queue auf", async () => {
  const calls = [];
  const discovery = createWebsiteAltDiscovery({ fetchImpl: async (url, options) => {
    assert.equal(options.redirect, "manual");
    const target = canonical(url); calls.push(target);
    if (target.endsWith(".xml")) return response(xml(`${origin}/reisen-1`), "text/xml");
    if (target.endsWith("/reisen-1")) return new Response("", { status: 302, headers: { location: "/reisen/uebersicht" } });
    return response(html(target.endsWith("/uebersicht") ? `<img src="${image()}" alt="Vogel">` : ""));
  } });
  const alias = await discovery.page(`${origin}/reisen-1`);
  assert.equal(alias.redirectUrl, `${origin}/reisen/uebersicht`);
  assert.equal(alias.title, "Weiterleitung");
  assert.deepEqual(alias.images, []);
  assert.deepEqual(calls, [`${origin}/reisen-1`]);
  calls.length = 0;
  const result = await discovery.scan();
  assert.equal(result.complete, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.pages.find((entry) => entry.url.endsWith("/reisen-1")).redirectUrl, `${origin}/reisen/uebersicht`);
  assert.equal(result.pages.find((entry) => entry.url.endsWith("/uebersicht")).images.length, 1);
  assert.equal(calls.filter((entry) => entry.endsWith("/uebersicht")).length, 1);
});

test("Fremde, administrative, leere und direkte zyklische Weiterleitungsziele bleiben Fehler ohne Folgeabruf", async () => {
  for (const location of ["https://evil.invalid/page", "http://www.fnwildlifetravel.de/a", "/config/settings", "/api/change",
    "https://user:password@www.fnwildlifetravel.de/a", "https://www.fnwildlifetravel.de:444/a", "/reisen-1", ""]) {
    let calls = 0;
    const discovery = createWebsiteAltDiscovery({ fetchImpl: async () => {
      calls += 1;
      return new Response("", { status: 302, headers: location ? { location } : {} });
    } });
    await assert.rejects(discovery.page(`${origin}/reisen-1`), /Weiterleitung/);
    assert.equal(calls, 1);
  }
});

test("Mehrseitige Aliaszyklen sind kein vollständiger Inhaltsabschluss", async () => {
  const discovery = createWebsiteAltDiscovery({ fetchImpl: async (url) => {
    const target = canonical(url);
    if (target.endsWith(".xml")) return response(xml(`${origin}/a`), "text/xml");
    if (target === `${origin}/`) return response(html(""));
    return new Response("", { status: 302, headers: { location: target.endsWith("/a") ? "/b" : "/a" } });
  } });
  const result = await discovery.scan();
  assert.equal(result.complete, false);
  assert.equal(result.pages.filter((entry) => entry.redirectUrl).length, 2);
  assert.ok(result.errors.some((entry) => /Zyklische/.test(entry.message)));
});
