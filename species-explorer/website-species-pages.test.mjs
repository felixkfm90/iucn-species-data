import assert from "node:assert/strict";
import test from "node:test";
import { createWebsiteSpeciesPagesService, FN_SITEMAP_URL, parseWebsiteSitemap } from "./website-species-pages.mjs";

const origin = "https://www.fnwildlifetravel.de";
const page = (slug, area = "heimische-tierwelt") => `${origin}/wildlife/${area}/${slug}`;
const xml = (...urls) => `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${url}</loc></url>`).join("")}</urlset>`;
const response = (body, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/xml" } });

test("Öffentliche Sitemap bindet genaue Artkennungen und ignoriert Bildadressen und Übersichten", async () => {
  const source = xml(page("jynxtorquilla"), `${origin}/wildlife/island`, "https://foreign.invalid/wildlife/heimische-tierwelt/jynxtorquilla")
    .replace("</urlset>", `<url><loc>${page("turdusmerula")}</loc><image:image><image:loc>${page("fakebird")}</image:loc><image:title><![CDATA[<Tier> & Bild]]></image:title></image:image></url></urlset>`);
  const service = createWebsiteSpeciesPagesService({ fetchImpl: async () => response(source) });
  const result = await service.snapshot();
  assert.equal(result.status, "ready");
  assert.deepEqual(result.pages.map((p) => p.slug).sort(), ["jynxtorquilla", "turdusmerula"]);
  assert.equal(result.pages.find((p) => p.slug === "jynxtorquilla").url, page("jynxtorquilla"));
});

test("Alle belegten Bereiche derselben Art bleiben erhalten; URL-Dubletten und Schrägstrich normalisiert", async () => {
  const service = createWebsiteSpeciesPagesService({ fetchImpl: async () => response(xml(page("turdusmerula"),
    page("turdusmerula", "island"), page("turdusmerula") + "/", page("bad").replace("https:", "http:"))) });
  assert.equal((await service.snapshot()).pages.length, 2);
});

test("Sitemapindex vollständig lesen, Hostbindung und XML-Namensraumpräfix unterstützen", async () => {
  const calls = [];
  const service = createWebsiteSpeciesPagesService({ fetchImpl: async (url, options) => {
    const canonical = new URL(url); canonical.search = "";
    calls.push(canonical.href); assert.equal(options.redirect, "error");
    return response(canonical.href === FN_SITEMAP_URL ? `<sitemapindex><sitemap><loc>${origin}/pages.xml</loc></sitemap></sitemapindex>`
      : `<s:urlset xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9"><s:url><s:loc>${page("jynxtorquilla")}</s:loc></s:url></s:urlset>`);
  } });
  assert.equal((await service.snapshot()).pages[0].slug, "jynxtorquilla");
  assert.deepEqual(calls, [FN_SITEMAP_URL, `${origin}/pages.xml`]);
});

test("Teilfehler, fremde Unter-Sitemaps und zyklischer leerer Index sind kein leerer Erfolg", async () => {
  for (const child of ["https://foreign.invalid/sitemap.xml", FN_SITEMAP_URL, `${origin}/broken.xml`]) {
    let calls = 0;
    const service = createWebsiteSpeciesPagesService({ fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? response(`<sitemapindex><sitemap><loc>${child}</loc></sitemap></sitemapindex>`) : response("unavailable", 503);
    } });
    const result = await service.snapshot();
    assert.equal(result.status, "unavailable");
    assert.equal(result.checkedAt, null);
    assert.equal(calls, child.endsWith("broken.xml") ? 2 : 1);
  }
});

test("Vollständige leere Liste gültig; HTML, DTD, kaputtes oder unvollständiges XML abweisen", () => {
  assert.deepEqual(parseWebsiteSitemap("<urlset/>"), { kind: "urlset", locations: [] });
  for (const source of ["<html><body>error</body></html>", "<!DOCTYPE urlset [<!ENTITY x SYSTEM 'file:///secret'>]><urlset/>",
    "<urlset><url><loc>x</loc></url>", "<urlset><url></url></urlset>", "<urlset><foo/></urlset>",
    "<urlset><url><loc>x&bad;</loc></url></urlset>", "<urlset/><urlset/>"]) {
    assert.throws(() => parseWebsiteSitemap(source), source);
  }
});

test("Parallele Anfragen teilen einen Abruf; Cache kopiert Daten und neue Veröffentlichung erscheint nach Erneuerung", async () => {
  let calls = 0, release;
  const held = new Promise((resolve) => { release = resolve; });
  const service = createWebsiteSpeciesPagesService({ fetchImpl: async () => {
    calls += 1; if (calls === 1) await held;
    return response(calls === 1 ? xml(page("turdusmerula")) : xml(page("turdusmerula"), page("jynxtorquilla")));
  } });
  const first = service.snapshot(), second = service.snapshot({ refresh: true });
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1); assert.deepEqual(a, b);
  a.pages[0].url = "https://foreign.invalid/";
  assert.equal((await service.snapshot()).pages[0].url, page("turdusmerula"));
  assert.equal(calls, 1);
  assert.equal((await service.snapshot({ refresh: true })).pages.length, 2);
  assert.equal(calls, 2);
});

test("Quellenfehler erhält letzten geprüften Index und Datum, kein falscher Fehlbestand; begrenzter Wiederholungsabstand", async () => {
  let clock = 1000, calls = 0;
  const service = createWebsiteSpeciesPagesService({ now: () => clock, retryMs: 30,
    fetchImpl: async () => ++calls === 1 ? response(xml(page("jynxtorquilla"))) : response("down", 503) });
  const before = await service.snapshot();
  clock += 100;
  const failed = await service.snapshot({ refresh: true });
  assert.equal(failed.status, "unavailable"); assert.equal(failed.cached, true);
  assert.equal(failed.checkedAt, before.checkedAt); assert.notEqual(failed.attemptedAt, before.attemptedAt);
  assert.deepEqual(failed.pages, before.pages);
  await service.snapshot(); assert.equal(calls, 2);
  clock += 31; await service.snapshot(); assert.equal(calls, 3);
});

test("Zeitlimit gilt auch für nicht antwortenden Abruf und hängenden Antwortkörper", async () => {
  for (const fetchImpl of [() => new Promise(() => {}), async () => response(new ReadableStream({ start() {} }))]) {
    const service = createWebsiteSpeciesPagesService({ fetchImpl, timeoutMs: 15 });
    assert.equal((await service.snapshot()).status, "unavailable");
  }
});

test("Größen- und Dokumentgrenze stoppen die gesamte Erkennung", async () => {
  const large = createWebsiteSpeciesPagesService({ fetchImpl: async () => response(" ".repeat(4 * 1024 * 1024 + 1)) });
  assert.equal((await large.snapshot()).status, "unavailable");
  let calls = 0;
  const many = createWebsiteSpeciesPagesService({ fetchImpl: async () => {
    calls += 1;
    return response(`<sitemapindex>${Array.from({ length: 9 }, (_, i) => `<sitemap><loc>${origin}/${i}.xml</loc></sitemap>`).join("")}</sitemapindex>`);
  } });
  assert.equal((await many.snapshot()).status, "unavailable"); assert.equal(calls, 1);
});

test("Frische Websiteprüfung umgeht einen alten öffentlichen Sitemap-Cache auch ohne manuelle Erneuerung", async () => {
  const calls = [];
  const service = createWebsiteSpeciesPagesService({ fetchImpl: async (raw) => {
    const url = new URL(raw); calls.push(url);
    return response(url.searchParams.has("fncheck")
      ? xml(page("regulusignicapilla"), page("regulusregulus")) : xml(page("jynxtorquilla")));
  } });
  const result = await service.snapshot();
  assert.equal(result.status, "ready");
  assert.deepEqual(result.pages.map(p => p.slug).sort(), ["regulusignicapilla", "regulusregulus"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].origin + calls[0].pathname, FN_SITEMAP_URL);
  assert.deepEqual([...calls[0].searchParams.keys()], ["fncheck"]);
});

test("Cachekennung wechselt je tatsächlichem Abruf einschließlich Unter-Sitemaps und behält lokalen Cache", async () => {
  const calls = [];
  const service = createWebsiteSpeciesPagesService({ now: () => 1000, fetchImpl: async (raw) => {
    const url = new URL(raw); calls.push(url);
    return response(url.pathname === "/sitemap.xml"
      ? `<sitemapindex><sitemap><loc>${origin}/pages.xml</loc></sitemap></sitemapindex>`
      : xml(page("regulusregulus")));
  } });
  await service.snapshot(); await service.snapshot();
  assert.equal(calls.length, 2);
  await service.snapshot({ refresh: true });
  assert.equal(calls.length, 4);
  assert.equal(new Set(calls.map(u => u.searchParams.get("fncheck"))).size, 4);
  assert(calls.every(u => u.origin === origin && /^\d+-\d+$/.test(u.searchParams.get("fncheck"))));
});

test("Erneuerungskennung erlaubt keine fremden Antwortziele oder Queryparameter aus Sitemap-Einträgen", async () => {
  const redirected = createWebsiteSpeciesPagesService({ fetchImpl: async () => {
    const r = response(xml(page("regulusregulus")));
    Object.defineProperty(r, "url", { value: FN_SITEMAP_URL + "?fncheck=foreign" }); return r;
  } });
  assert.equal((await redirected.snapshot()).status, "unavailable");
  const child = createWebsiteSpeciesPagesService({ fetchImpl: async () => response(
    `<sitemapindex><sitemap><loc>${origin}/pages.xml?redirect=foreign</loc></sitemap></sitemapindex>`) });
  assert.equal((await child.snapshot()).status, "unavailable");
});
