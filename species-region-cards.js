// The native cards remain the first source for each species link in a region.
(function () {
  "use strict";

  const hosts = new Set(["www.fnwildlifetravel.de", "fnwildlifetravel.de"]);
  const regionPattern = /^\/wildlife\/[a-z0-9]+(?:-[a-z0-9]+)*$/u;
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
  const site = new URL(location.href);
  const region = site.pathname.replace(/\/$/u, "");
  if (window.top !== window || !hosts.has(site.hostname) || site.protocol !== "https:" || site.port || !regionPattern.test(region)) return;

  const sitemapNamespace = "http://www.sitemaps.org/schemas/sitemap/0.9";
  const artworkPath = /^\/content\/v1\/67556be0338df718ea064210\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/[^/]+\.(?:jpe?g|png|webp)$/iu;
  const cardTitle = "h2.list-item-content__title";
  const cardLink = "a.list-item-content__button[href]";
  const maxListItems = 500;
  const batchSize = 24;
  const requestBudgetMs = 12_000;
  const retryDelayMs = 350;
  const maxTextBytes = 4 * 1024 * 1024;
  const cleanText = value => String(value ?? "").replace(/\s+/gu, " ").trim();
  const validText = value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
  const crawlerExcluded = value => /(?:^|[\s,;:])(?:noindex|nofollow|none)(?:$|[\s,;:])/iu.test(value ?? "");

  function fnUrl(value, base = site.origin) {
    if (typeof value !== "string" || /[\u0000-\u0020\u007f\\]/u.test(value)) return null;
    try {
      const url = new URL(value, base);
      return url.protocol === "https:" && hosts.has(url.hostname) && !url.username && !url.password && !url.port ? url : null;
    } catch { return null; }
  }

  function speciesPath(value) {
    const path = fnUrl(value)?.pathname.replace(/\/$/u, "");
    return path?.startsWith(`${region}/`) && slugPattern.test(path.slice(region.length + 1)) ? path : null;
  }

  function readList() {
    const mains = document.querySelectorAll("main#page");
    if (mains.length !== 1) return null;
    const lists = Array.from(mains[0].querySelectorAll('section[data-sqsp-section="auto-layout"] ul.user-items-list-simple'));
    const candidates = lists.filter(list => {
      const sectionId = list.getAttribute("data-section-id");
      return /^[a-f0-9]{24}$/u.test(sectionId ?? "") && list.closest('section[data-sqsp-section="auto-layout"]')?.getAttribute("data-section-id") === sectionId
        && Array.from(list.children).some(item => Array.from(item.querySelectorAll(cardLink)).some(link => speciesPath(link.getAttribute("href"))));
    });
    if (candidates.length !== 1) return null;
    const [list] = candidates;
    const items = Array.from(list.children);
    if (items.length > maxListItems || items.some(item => !item.matches("li.list-item") || item.querySelectorAll(cardTitle).length !== 1)) return null;
    const paths = new Set();
    for (const item of items) {
      const links = Array.from(item.querySelectorAll(cardLink));
      if (links.length > 1) return null;
      const path = speciesPath(links[0]?.getAttribute("href"));
      if (!path) continue;
      if (paths.has(path)) return null;
      paths.add(path);
    }
    return { list, items, paths };
  }

  async function fetchText(url, type, signal) {
    const options = { redirect: "error", credentials: "omit", cache: "no-store", signal, headers: { Accept: type } };
    const isHtml = type === "text/html";
    const blocked = response => isHtml && (crawlerExcluded(response.headers.get("x-robots-tag"))
      || ["location", "www-authenticate", "proxy-authenticate"].some(header => response.headers.has(header)));
    let response = await fetch(url.href, options);
    if (response.url === url.href && [502, 503, 504].includes(response.status)
        && !response.headers.has("retry-after") && !blocked(response)) {
      void response.body?.cancel().catch(() => {});
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      signal.throwIfAborted();
      response = await fetch(url.href, options);
    }
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    const matchesType = isHtml ? contentType === type : ["application/xml", "text/xml"].includes(contentType);
    if (response.status !== 200 || response.url !== url.href || !matchesType || blocked(response) || Number(response.headers.get("content-length")) > maxTextBytes) {
      void response.body?.cancel().catch(() => {});
      throw new Error("Unerwartete Website-Antwort");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Leere Website-Antwort");
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const pieces = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxTextBytes) throw new Error("Website-Antwort ist zu groß");
        pieces.push(decoder.decode(value, { stream: true }));
      }
      return pieces.join("") + decoder.decode();
    } finally {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  async function publishedPaths(existing, signal) {
    const first = new URL("/sitemap.xml", site.origin);
    const batch = [first];
    const seen = new Set([first.pathname]);
    const paths = new Set();
    // The date bucket also refreshes Squarespace's cached sitemap after publish.
    const minute = String(Math.floor(Date.now() / 60_000));
    for (const url of batch) {
      url.searchParams.set("fn-region-cards", minute);
      const xml = await fetchText(url, "application/xml", signal);
      if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) return [];
      const sitemap = new DOMParser().parseFromString(xml, "application/xml").documentElement;
      const nested = sitemap.localName === "sitemapindex";
      if (sitemap.namespaceURI !== sitemapNamespace || !nested && sitemap.localName !== "urlset") return [];
      for (const entry of sitemap.children) {
        if (entry.namespaceURI !== sitemapNamespace || entry.localName !== (nested ? "sitemap" : "url")) return [];
        const loc = Array.from(entry.children).filter(child => child.namespaceURI === sitemapNamespace && child.localName === "loc");
        if (loc.length !== 1 || loc[0].children.length) return [];
        const link = fnUrl(loc[0].textContent?.trim());
        if (!link || link.search || link.hash) continue;
        if (nested) {
          if (!/^\/[a-z0-9_/-]+\.xml$/iu.test(link.pathname) || seen.has(link.pathname) || seen.size >= 8) return [];
          seen.add(link.pathname);
          batch.push(new URL(link.pathname, site.origin));
          continue;
        }
        const path = speciesPath(link.href);
        if (path && !existing.has(path)) paths.add(path);
        if (paths.size === maxListItems) return [...paths];
      }
    }
    return [...paths];
  }

  function focus(value) {
    if (!/^\d(?:\.\d{1,17})?(?:e-\d{1,3})?$/iu.test(value ?? "")) return null;
    const result = Number(value);
    return result >= 0 && result <= 1 ? result : null;
  }

  function selectedPhoto(gallery, index) {
    const figures = Array.from(gallery.children);
    if (!figures.length || figures.length > 500 || figures.some((figure, offset) => !figure.matches("figure")
      || figure.getAttribute("data-fn-position") !== String(offset + 1))) return null;
    const figure = figures[index];
    const images = Array.from(figure?.children ?? []).filter(element => element.matches("img"));
    if (images.length !== 1) return null;
    const [image] = images, description = image.getAttribute("alt");
    if (description === null && !/^fn-figure-[a-f0-9]{24}$/u.test(figure.getAttribute("data-fn-item-id") ?? "")) return null;
    const original = image.getAttribute("src");
    if (!original?.startsWith("https://images.squarespace-cdn.com/")) return null;
    try {
      const url = new URL(original);
      if (url.origin !== "https://images.squarespace-cdn.com" || url.username || url.password || url.search || url.hash
          || !artworkPath.test(url.pathname) || /[/\\\u0000-\u001f\u007f]/u.test(decodeURIComponent(url.pathname.split("/").at(-1)))) return null;
      const alt = description ?? "";
      if (alt.length > 3000 || !validText(alt)) return null;
      url.searchParams.set("format", "750w");
      return { src: url.href, alt };
    } catch { return null; }
  }

  function readCard(html, path) {
    // The template keeps scripts and resource references inert. Nothing from its DOM is inserted into the public page.
    const view = document.createElement("template");
    view.innerHTML = html;
    const notPublic = Array.from(view.content.querySelectorAll("meta")).some(meta =>
      cleanText(meta.getAttribute("http-equiv")).toLowerCase() === "refresh"
      || /^(?:robots|[a-z0-9-]*bot(?:-[a-z0-9-]+)?)$/iu.test(cleanText(meta.getAttribute("name")))
        && crawlerExcluded(meta.getAttribute("content")))
      || Array.from(view.content.querySelectorAll("input")).some(field => cleanText(field.getAttribute("type")).toLowerCase() === "password");
    if (notPublic) return null;
    const canonicals = view.content.querySelectorAll('link[rel="canonical"]');
    if (canonicals.length !== 1 || !canonicals[0].getAttribute("href")?.startsWith("https://")) return null;
    const canonical = fnUrl(canonicals[0].getAttribute("href"));
    if (!canonical || canonical.search || canonical.hash || speciesPath(canonical.href) !== path) return null;
    const main = view.content.querySelectorAll("main#page");
    if (main.length !== 1) return null;
    const markers = main[0].querySelectorAll('[data-fn-region-card]');
    const galleries = main[0].querySelectorAll('[data-fn-art-gallery]');
    if (markers.length !== 1 || galleries.length !== 1) return null;
    const [marker] = markers, [gallery] = galleries;
    if (!marker.matches('div[hidden][data-fn-region-card="1"]') || marker.children.length
        || !gallery.matches('div[data-fn-art-gallery="1"]') || marker.parentElement !== gallery.parentElement
        || gallery.nextElementSibling !== marker || gallery.closest("pre,code")
        || marker.getAttribute("data-region") !== region || marker.getAttribute("data-species-path") !== path) return null;
    const title = cleanText(marker.getAttribute("data-title"));
    const description = marker.textContent.trim();
    const rawIndex = marker.getAttribute("data-image-index");
    const x = focus(marker.getAttribute("data-focus-x")), y = focus(marker.getAttribute("data-focus-y"));
    if (!title || title.length > 300 || !validText(title) || !description || description.length > 1500 || !validText(description)
        || !/^\d{1,3}$/u.test(rawIndex ?? "") || x === null || y === null) return null;
    const photo = selectedPhoto(gallery, Number(rawIndex));
    return photo ? { path, title, description, x, y, photo } : null;
  }

  function element(tag, className, ...children) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.append(...children);
    return node;
  }

  function addCard(state, card) {
    const referenceMedia = state.list.querySelector(".list-item-media-inner[data-aspect-ratio]");
    const ratio = referenceMedia?.getAttribute("data-aspect-ratio");
    if (!/^\d+:\d+$/u.test(ratio ?? "")) return false;
    const image = element("img", "list-image");
    image.src = card.photo.src;
    image.alt = card.photo.alt;
    image.loading = "lazy";
    image.decoding = "async";
    image.style.display = "block";
    image.style.objectPosition = `${card.x * 100}% ${card.y * 100}%`;
    const innerMedia = element("div", "list-item-media-inner", image);
    innerMedia.setAttribute("data-aspect-ratio", ratio);
    const media = element("div", "list-item-media", innerMedia);
    media.style.width = "100%";
    media.style.marginBottom = "6%";
    const title = element("h2", "list-item-content__title", card.title);
    const text = element("p", "", card.description);
    text.style.whiteSpace = "pre-wrap";
    const description = element("div", "list-item-content__description", text);
    description.style.marginTop = "6%";
    const body = element("div", "list-item-content__text-wrapper", title, description);
    const link = element("a", "list-item-content__button sqs-block-button-element sqs-block-button-element--medium sqs-button-element--primary", "Weitere Informationen");
    link.href = card.path;
    const button = element("div", "list-item-content__button-container", link);
    button.style.marginTop = "6%";
    const content = element("div", "list-item-content", body, element("div", "list-item-content__button-wrapper", button));
    const item = element("li", "list-item", media, content);
    item.setAttribute("data-is-card-enabled", "false");
    item.setAttribute("data-fn-public-region-card", "1");
    // Insert at the proper position even if the site's startup sort observer has already disconnected.
    const next = state.items.find(node => {
      const title = cleanText(node.querySelector(cardTitle)?.textContent);
      return title.toLocaleLowerCase("de") === "weitere tiere" || compareTitles(card.title, title) < 0;
    });
    state.list.insertBefore(item, next ?? null);
    return true;
  }

  function compareTitles(a, b) {
    return a.localeCompare(b, "de", { sensitivity: "base", numeric: true });
  }

  async function readPublishedBatch(paths) {
    const cards = [];
    // Limit concurrent requests, but let each candidate use its own timeout.
    const lanes = Array.from({ length: Math.min(3, paths.length) }, async (_, worker) => {
      for (let index = worker; index < paths.length; index += 3) {
        const path = paths[index];
        try {
          const html = await fetchText(new URL(path, site.origin), "text/html", AbortSignal.timeout(requestBudgetMs));
          const card = readCard(html, path);
          if (card) cards.push(card);
        } catch { /* Inaccessible or changed art pages have no public card. */ }
      }
    });
    await Promise.all(lanes);
    return cards.sort((a, b) => compareTitles(a.title, b.title));
  }

  async function load() {
    const binding = readList();
    if (!binding || binding.items.length >= maxListItems) return;
    const paths = await publishedPaths(binding.paths, AbortSignal.timeout(requestBudgetMs));
    for (let start = 0; start < paths.length; start += batchSize) {
      const current = readList();
      if (current?.list !== binding.list || current.items.length >= maxListItems) return;
      const batch = paths.slice(start, start + batchSize).filter(path => !current.paths.has(path));
      let changed = false;
      for (const card of await readPublishedBatch(batch)) {
        const state = readList();
        if (state?.list !== binding.list || state.items.length >= maxListItems) break;
        if (!state.paths.has(card.path)) changed = addCard(state, card) || changed;
      }
      if (changed) document.dispatchEvent(new Event("fn:region-cards-changed"));
    }
  }

  function start() {
    void load().catch(() => {});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
