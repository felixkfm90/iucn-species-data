import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../species-region-cards.js", import.meta.url), "utf8");
const origin = "https://www.fnwildlifetravel.de", region = "/wildlife/costarica";
const namespace = "http://www.sitemaps.org/schemas/sitemap/0.9";
const sectionId = "685f9d222cc5d75e2fc5c43a";
const photo = "https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/b7d4224d-21f1-44a1-8c7a-d779a53fb6ff/01.jpg";
const expectedPath = `${region}/art-b`;

class Element {
  constructor(tagName, attributes = {}, children = []) {
    this.localName = tagName;
    this.attributes = new Map(Object.entries(attributes));
    this.className = attributes.class ?? "";
    this.style = {};
    this.nodes = [];
    this.append(...children);
  }

  get children() { return this.nodes.filter(node => node instanceof Element); }
  get parentElement() { return this.parent ?? null; }
  get nextElementSibling() {
    const siblings = this.parent?.children ?? [];
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }
  get textContent() { return this.nodes.map(node => node instanceof Element ? node.textContent : node).join(""); }
  set href(value) { this.setAttribute("href", value); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }

  append(...nodes) {
    for (const node of nodes) {
      if (node instanceof Element) node.parent = this;
      this.nodes.push(node);
    }
  }

  insertBefore(node, next) {
    if (!next) this.append(node);
    else { node.parent = this; this.nodes.splice(this.nodes.indexOf(next), 0, node); }
  }

  matches(selector) {
    return selector.split(",").some(value => {
      const name = /^[a-z\d]+/u.exec(value)?.[0];
      const id = /#([\w-]+)/u.exec(value)?.[1];
      const className = /\.([\w-]+)/u.exec(value)?.[1];
      const attrs = [...value.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/gu)];
      return (!name || name === this.localName) && (!id || this.getAttribute("id") === id)
        && (!className || this.className.split(" ").includes(className))
        && attrs.every(([, attribute, raw]) => raw === undefined ? this.hasAttribute(attribute) : this.getAttribute(attribute) === raw);
    });
  }

  closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector) ?? null; }

  querySelectorAll(selector) {
    const tokens = selector.split(" ");
    return this.children.flatMap(node => {
      const matches = node.matches(tokens.at(-1)) && (tokens.length === 1 || Boolean(node.parent.closest(tokens[0])));
      return [...(matches ? [node] : []), ...node.querySelectorAll(selector)];
    });
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}

const element = (tag, attrs, ...nodes) => new Element(tag, attrs, nodes);
const xml = (tag, ...nodes) => Object.assign(element(tag, {}, ...nodes), { namespaceURI: namespace });

function existingCard(title, path) {
  return element("li", { class: "list-item" }, element("div", { class: "list-item-media-inner", "data-aspect-ratio": "4:3" }),
    element("h2", { class: "list-item-content__title" }, title),
    ...(path ? [element("a", { class: "list-item-content__button", href: path }, "Weitere Informationen")] : []));
}

function contentPage({ mark = {}, path = expectedPath, sourceUrl = photo, extraMarker = false, misplaced = false,
  photoProps = { alt: "Ausgewähltes Motiv" }, photoFigure = {}, head = [], extraContent = [] } = {}) {
  const marker = element("div", { hidden: "", "data-fn-region-card": "1", "data-region": region, "data-species-path": path,
    "data-title": "Art B", "data-image-index": "1", "data-focus-x": "0.26", "data-focus-y": "0.82", ...mark }, "Text mit < und >.");
  const images = element("div", { "data-fn-art-gallery": "1" },
    element("figure", { "data-fn-position": "1" }, element("img", { src: photo.replace("01.jpg", "02.jpg"), alt: "Anderes" })),
    element("figure", { "data-fn-position": "2", ...photoFigure }, element("img", { src: sourceUrl, ...photoProps })));
  return element("root", {}, element("link", { rel: "canonical", href: origin + path }), ...head,
    element("main", { id: "page" }, ...(misplaced ? [marker] : []), ...(extraMarker ? [element("div", { "data-fn-region-card": "1" })] : []),
      element("div", { class: "sqs-code-container" }, images, ...(misplaced ? [] : [marker])), ...extraContent));
}

function fixture({ pages = [contentPage()], paths = [`${region}/art-a`, expectedPath, "/wildlife/afrika/art-z"],
  pagePaths = [expectedPath], includeTarget = false, status = 200, headers = {}, responseStatuses = {}, timeoutPath } = {}) {
  const items = [existingCard("Art A", `${region}/art-a`), ...(includeTarget ? [existingCard("Native Art B", expectedPath)] : []),
    existingCard("Weitere Tiere", "/wildlife")];
  const { list, main } = rootList(items);
  const events = [], requests = [];
  const document = {
    readyState: "complete",
    querySelectorAll: selector => selector === "main#page" ? [main] : [],
    createElement(tag) {
      if (tag === "template") return { set innerHTML(html) { this.content = pages[Number(html)]; } };
      return element(tag, {});
    },
    dispatchEvent(event) { events.push(event.type); },
  };
  const queue = paths.map(path => xml("url", xml("loc", new URL(path, origin).href)));
  const controllers = new WeakMap();
  const simulatedClock = { timeout() {
    const controller = new AbortController();
    controllers.set(controller.signal, controller);
    return controller.signal;
  } };
  const environment = {
    document, location: { href: origin + region }, URL, AbortSignal: simulatedClock, TextDecoder, Event,
    setTimeout(callback) { queueMicrotask(callback); },
    DOMParser: class { parseFromString() { return { documentElement: xml("urlset", ...queue) }; } },
    fetch: async (request, options) => {
      const url = new URL(request);
      requests.push({ path: url.pathname, credentials: options.credentials });
      if (url.pathname === timeoutPath) controllers.get(options.signal).abort();
      options.signal.throwIfAborted();
      const sitemap = url.pathname === "/sitemap.xml";
      const nextStatus = responseStatuses[url.pathname]?.shift() ?? (sitemap ? 200 : status);
      const response = new Response(sitemap ? "fixture" : String(pagePaths.indexOf(url.pathname)), { status: nextStatus,
        headers: sitemap ? { "content-type": "text/xml; charset=utf-8" }
          : { "content-type": "text/html; charset=utf-8", ...headers } });
      return Object.defineProperty(response, "url", { value: url.href });
    },
  };
  environment.window = environment;
  environment.top = environment;
  return {
    events, requests, list, items,
    async run() {
      vm.runInNewContext(source, environment, { filename: "species-region-cards.js" });
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

function rootList(items) {
  const list = element("ul", { class: "user-items-list-simple", "data-section-id": sectionId }, ...items);
  const main = element("main", { id: "page" }, element("section", { "data-sqsp-section": "auto-layout", "data-section-id": sectionId }, list));
  return { list, main };
}

test("loads only unmatched same-region species and renders its selected public photo and focus", async () => {
  const page = fixture();
  await page.run();
  assert.deepEqual(page.requests, ["/sitemap.xml", expectedPath].map(path => ({ path, credentials: "omit" })));
  assert.equal(page.list.children.length, 3);
  const [first, item, last] = page.list.children;
  assert.equal(first, page.items[0]);
  assert.equal(last, page.items[1]);
  assert.equal(item.querySelector("h2").textContent, "Art B");
  assert.equal(item.querySelector("p").textContent, "Text mit < und >.");
  assert.equal(item.querySelector("a").getAttribute("href"), expectedPath);
  const img = item.querySelector("img");
  assert.equal(img.src, `${photo}?format=750w`);
  assert.equal(img.alt, "Ausgewähltes Motiv");
  assert.equal(img.style.objectPosition, "26% 82%");
  assert.deepEqual(page.events, ["fn:region-cards-changed"]);
  await page.run();
  assert.equal(page.list.children.length, 3);
});

test("does not retrieve a species already represented by a native entry", async () => {
  const page = fixture({ includeTarget: true });
  await page.run();
  assert.deepEqual(page.requests, [{ path: "/sitemap.xml", credentials: "omit" }]);
  assert.deepEqual(page.list.children, page.items);
  assert.deepEqual(page.events, []);
});

test("a generated gallery can provide a region card even when the selected photo has a confirmed missing alt", async () => {
  const unbound = fixture({ pages: [contentPage({ photoProps: {} })] });
  await unbound.run();
  assert.deepEqual(unbound.list.children, unbound.items);
  const bound = fixture({ pages: [contentPage({ photoProps: {}, photoFigure: { "data-fn-item-id": `fn-figure-${"1".repeat(24)}` } })] });
  await bound.run();
  assert.equal(bound.list.children[1].querySelector("h2").textContent, "Art B");
  assert.equal(bound.list.children[1].querySelector("img").alt, "");
});

test("stops before inserting an unpublished, ambiguous or mismatched species", async () => {
  for (const page of [fixture({ status: 404 }), fixture({ paths: [`${region}/art-a`] }),
    fixture({ pages: [contentPage({ extraMarker: true })] }),
    fixture({ pages: [contentPage({ misplaced: true })] }),
    fixture({ pages: [contentPage({ mark: { "data-region": "/wildlife/afrika" } })] }),
    fixture({ pages: [contentPage({ path: `${region}/art-c` })] }),
    fixture({ pages: [contentPage({ mark: { "data-image-index": "3" } })] }),
    fixture({ pages: [contentPage({ mark: { "data-focus-x": "1.5" } })] }),
    fixture({ pages: [contentPage({ sourceUrl: photo.replace("squarespace-cdn.com", "example.com") })] })]) {
    await page.run();
    assert.deepEqual(page.list.children, page.items);
    assert.deepEqual(page.events, []);
  }
});

test("Eine vorübergehende Störung in der Sitemap und beim Artabruf wird im selben Seitenaufruf überbrückt", async () => {
  const page = fixture({ responseStatuses: { "/sitemap.xml": [503, 200], [expectedPath]: [502, 200] } });
  await page.run();
  assert.deepEqual(page.requests.map(request => request.path), ["/sitemap.xml", "/sitemap.xml", expectedPath, expectedPath]);
  assert.equal(page.list.children[1].querySelector("h2").textContent, "Art B");
  assert.deepEqual(page.events, ["fn:region-cards-changed"]);
});

test("Ein anhaltender Fehler blendet nur die betroffene Art aus und Freigabesperren werden nicht wiederholt", async () => {
  const other = `${region}/art-c`;
  const page = fixture({ paths: [expectedPath, other], pages: [contentPage(), contentPage({ path: other, mark: { "data-title": "Art C" } })],
    pagePaths: [expectedPath, other], responseStatuses: { [expectedPath]: [504, 503], [other]: [200] } });
  await page.run();
  assert.equal(page.requests.filter(request => request.path === expectedPath).length, 2);
  assert.deepEqual(page.list.children.map(item => item.querySelector("h2").textContent), ["Art A", "Art C", "Weitere Tiere"]);
  for (const code of [401, 403, 404, 429]) {
    const blocked = fixture({ responseStatuses: { [expectedPath]: [code, 200] } });
    await blocked.run();
    assert.equal(blocked.requests.filter(request => request.path === expectedPath).length, 1);
    assert.deepEqual(blocked.list.children, blocked.items);
  }
  for (const headers of [{ "retry-after": "120" }, { "www-authenticate": 'Basic realm="preview"' }, { "x-robots-tag": "noindex" }]) {
    const blocked = fixture({ responseStatuses: { [expectedPath]: [503, 200] }, headers });
    await blocked.run();
    assert.equal(blocked.requests.filter(request => request.path === expectedPath).length, 1);
    assert.deepEqual(blocked.list.children, blocked.items);
  }
});

test("Eine zu langsame Artseite lässt den Abruf der übrigen Arten derselben Gruppe weiterlaufen", async () => {
  const candidates = Array.from({ length: 5 }, (_, index) => `${region}/tier-${index}`);
  const pages = candidates.map((path, index) => contentPage({ path, mark: { "data-title": `Tier ${index}` } }));
  const page = fixture({ paths: candidates, pagePaths: candidates, pages, timeoutPath: candidates[0] });
  await page.run();
  assert.deepEqual(page.requests.map(request => request.path), ["/sitemap.xml", ...candidates]);
  assert.deepEqual(page.list.children.map(item => item.querySelector("h2").textContent),
    ["Art A", "Tier 1", "Tier 2", "Tier 3", "Tier 4", "Weitere Tiere"]);
});

test("veraltete Sitemap-Einträge umgehen keine ausdrückliche Veröffentlichungs- oder Anmeldesperre", async () => {
  for (const page of [
    fixture({ headers: { "x-robots-tag": "Googlebot-News: noindex, follow" } }),
    fixture({ headers: { "www-authenticate": 'Basic realm="preview"' } }),
    fixture({ pages: [contentPage({ head: [element("meta", { name: "Robots", content: "noindex, follow" })] })] }),
    fixture({ pages: [contentPage({ head: [element("meta", { name: "Googlebot-News", content: "none" })] })] }),
    fixture({ pages: [contentPage({ head: [element("meta", { "http-equiv": "refresh", content: "0; url=/login" })] })] }),
    fixture({ pages: [contentPage({ extraContent: [element("input", { type: "Password" })] })] }),
  ]) {
    await page.run();
    assert.ok(page.requests.some(request => request.path === expectedPath));
    assert.deepEqual(page.list.children, page.items);
    assert.deepEqual(page.events, []);
  }
});

test("mehr als 24 automatisch ergänzte Arten bleiben neben den nativen Kacheln verfügbar", async () => {
  const paths = Array.from({ length: 30 }, (_, index) => `${region}/tier-${30 - index}`);
  const pages = paths.map((path, index) => contentPage({ path, mark: { "data-title": `Tier ${30 - index}` } }));
  const page = fixture({ paths: [`${region}/art-a`, ...paths], pages, pagePaths: paths });
  await page.run();
  assert.deepEqual(page.requests.map(request => request.path), ["/sitemap.xml", ...paths]);
  assert.deepEqual(page.list.children.map(item => item.querySelector("h2").textContent),
    ["Art A", ...Array.from({ length: 30 }, (_, index) => `Tier ${index + 1}`), "Weitere Tiere"]);
  assert.equal(page.list.children[0], page.items[0]);
  assert.equal(page.list.children.at(-1), page.items[1]);
  assert.deepEqual(page.events, ["fn:region-cards-changed", "fn:region-cards-changed"]);
  await page.run();
  assert.equal(page.list.children.length, 32);
  assert.equal(page.requests.at(-1).path, "/sitemap.xml");
});
