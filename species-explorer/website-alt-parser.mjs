import { createHash } from "node:crypto";

const WEBSITE_ORIGIN = "https://www.fnwildlifetravel.de";
const WEBSITE_HOSTS = new Set(["www.fnwildlifetravel.de", "fnwildlifetravel.de"]);
const IMAGE_HOSTS = new Set(["images.squarespace-cdn.com", "static1.squarespace.com", "static.squarespace.com", "images.squarespace.com"]);
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAW_TAGS = new Set(["script", "style", "template", "noscript", "textarea"]);
const CAPTION_CLASS = /(?:^|\s)(?:gallery-caption(?:-content|-wrapper)?|image-caption(?:-wrapper)?|sqs-image-caption(?:-content)?|sqs-gallery-meta(?:-container|-content)?|image-description)(?:\s|$)/;
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const MAX_ELEMENTS = 100000;
const MAX_IMAGES = 2000;
const PRIVATE_PATH = /^(?:\/(?:api|config|account|accounts|login|logout|cart|checkout|commerce|search|auth|oauth|sso))(?:\/|$)/i;

function checkedUrl(value, base = WEBSITE_ORIGIN) {
  if (typeof value !== "string" || !value.trim() || value.length > 8192 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error("Ungültige Website-Adresse");
  const url = new URL(value.trim(), base);
  if (url.protocol !== "https:" || url.port || url.username || url.password) throw new Error("Nur öffentliche HTTPS-Adressen ohne Zugangsdaten sind erlaubt");
  return url;
}

export function normalizeWebsitePageUrl(value) {
  const url = checkedUrl(value);
  if (!WEBSITE_HOSTS.has(url.hostname)) throw new Error("Seite gehört nicht zur FN-Website");
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { throw new Error("Ungültiger Seitenpfad"); }
  if (/[\\\u0000-\u001f\u007f]/u.test(pathname) || /%2f|%5c|%00/i.test(url.pathname)
      || PRIVATE_PATH.test(pathname)
      || /\.(?!html?$)[a-z0-9]{1,12}$/i.test(pathname) || pathname.split("/").includes("..")) throw new Error("Adresse ist keine öffentliche Inhaltsseite");
  url.hostname = "www.fnwildlifetravel.de";
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.href;
}

export function normalizeWebsiteImageUrl(value) {
  const url = checkedUrl(value);
  if (!WEBSITE_HOSTS.has(url.hostname) && !IMAGE_HOSTS.has(url.hostname)
      && !(url.hostname === "felixkfm90.github.io" && url.pathname.startsWith("/iucn-species-data/"))) {
    throw new Error("Bildquelle ist kein erlaubter Website-Bestand");
  }
  if (WEBSITE_HOSTS.has(url.hostname)) url.hostname = "www.fnwildlifetravel.de";
  const pathname = decodeURIComponent(url.pathname);
  if (/[\\\u0000-\u001f\u007f]/u.test(pathname) || /%2f|%5c|%00/i.test(url.pathname)
      || WEBSITE_HOSTS.has(url.hostname) && PRIVATE_PATH.test(pathname)) throw new Error("Ungültiger Bildpfad");
  url.hash = "";
  return url.href;
}

// Only Squarespace's known output-size parameter is representation metadata.
// Unknown parameters can select a different image and remain identity-bound.
export function canonicalWebsiteImageSource(value) {
  const url = new URL(normalizeWebsiteImageUrl(value));
  if (IMAGE_HOSTS.has(url.hostname)) url.searchParams.delete("format");
  url.searchParams.sort();
  return url.href;
}

function htmlText(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
    auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß" };
  return String(value || "").replace(/&(#x[\da-f]+|#\d+|[A-Za-z]+);/gi, (whole, entity) => {
    if (Object.hasOwn(named, entity)) return named[entity];
    const point = /^#x/i.test(entity) ? Number.parseInt(entity.slice(2), 16) : /^#\d+$/.test(entity) ? Number(entity.slice(1)) : NaN;
    return Number.isInteger(point) && point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
      ? String.fromCodePoint(point) : whole;
  });
}

function attributes(tag) {
  const values = new Map();
  const source = tag.replace(/^<\/?[\w:-]+/, "").replace(/\/?\s*>$/, "");
  const matcher = /([^\s=<>"'`/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of source.matchAll(matcher)) {
    const name = match[1].toLowerCase(), value = htmlText(match[2] ?? match[3] ?? match[4] ?? "");
    if (!values.has(name)) values.set(name, []);
    values.get(name).push(value);
  }
  return { values, get: (name) => values.get(name)?.[0] ?? "", has: (name) => values.has(name) };
}

// A bounded, non-executing HTML inventory. Raw script/style/template text is
// skipped instead of pretending embedded strings are actual document images.
function documentTree(html) {
  const root = { tag: "#document", children: [] }, stack = [root], all = [];
  let offset = 0;
  while (offset < html.length) {
    const start = html.indexOf("<", offset);
    if (start === -1) { stack.at(-1).children.push(htmlText(html.slice(offset))); break; }
    if (start > offset) stack.at(-1).children.push(htmlText(html.slice(offset, start)));
    if (html.startsWith("<!--", start)) {
      const end = html.indexOf("-->", start + 4);
      if (end === -1) throw new Error("Unvollständiger HTML-Kommentar");
      offset = end + 3;
      continue;
    }
    let end = start + 1, quote = "";
    for (; end < html.length; end += 1) {
      const character = html[end];
      if (quote) { if (character === quote) quote = ""; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === ">") break;
    }
    if (end >= html.length) throw new Error("Unvollständiges HTML-Element");
    const raw = html.slice(start, end + 1), match = /^<(\/)?([A-Za-z][\w:-]*)\b/.exec(raw);
    offset = end + 1;
    if (!match) continue;
    const name = match[2].toLowerCase();
    if (match[1]) {
      const index = stack.findLastIndex((node) => node.tag === name);
      if (index > 0) stack.length = index;
      continue;
    }
    if (RAW_TAGS.has(name)) {
      const closing = new RegExp(`</${name}\\s*>`, "ig");
      closing.lastIndex = offset;
      const found = closing.exec(html);
      if (!found) throw new Error(`Unvollständiges HTML-${name}-Element`);
      offset = closing.lastIndex;
      continue;
    }
    if (all.length >= MAX_ELEMENTS || stack.length > 512) throw new Error("Zu komplexes HTML-Dokument");
    const node = { tag: name, attrs: attributes(raw), children: [], parent: stack.at(-1) };
    stack.at(-1).children.push(node);
    all.push(node);
    if (!VOID_TAGS.has(name) && !/\/\s*>$/.test(raw)) stack.push(node);
  }
  return { root, all };
}

/** Read document identity without executing scripts or following links. */
export function observeWebsitePublicHtmlIdentity(html) {
  if (typeof html !== "string" || Buffer.byteLength(html) > MAX_HTML_BYTES) throw new Error("Ungültiger HTML-Umfang");
  const { root, all } = documentTree(html);
  const unique = tag => {
    const matches = all.filter(node => node.tag === tag);
    if (matches.length !== 1) throw new Error("Uneindeutige HTML-Seitenstruktur");
    return matches[0];
  };
  const page = unique("html"), head = unique("head"), body = unique("body"), title = unique("title");
  if (page.parent !== root || head.parent !== page || body.parent !== page || title.parent !== head
      || title.children.some(child => typeof child !== "string") || !title.children.join("").trim()) throw new Error("Ungültige HTML-Seitenstruktur");

  const values = (node, name) => node.attrs.values.get(name) || [];
  const includes = (node, name, expected) => values(node, name).some(value => value.trim().toLowerCase() === expected);
  const authAction = value => {
    let url;
    try { url = new URL(value, WEBSITE_ORIGIN); } catch { return false; }
    return /^(?:login|account|auth)\.squarespace\.com$/i.test(url.hostname)
      || /(?:^|\/)(?:accounts?|auth|oauth2?|log-?in|sign-?in|sso)(?:\/|$)/i.test(url.pathname);
  };
  if (all.some(node => node.tag === "meta" && includes(node, "http-equiv", "refresh")
      || node.tag === "input" && includes(node, "type", "password")
      || node.tag === "form" && values(node, "action").some(authAction))) throw new Error("HTML enthält eine Umleitung oder Anmeldung");

  const canonicals = all.filter(node => node.tag === "link" && values(node, "rel")
    .some(value => value.toLowerCase().split(/\s+/u).includes("canonical")));
  const [canonical] = canonicals;
  if (canonicals.length > 1 || canonical && (canonical.parent !== head || values(canonical, "rel").length !== 1
      || !includes(canonical, "rel", "canonical") || values(canonical, "href").length !== 1 || !canonical.attrs.get("href"))) {
    throw new Error("Uneindeutige kanonische HTML-Adresse");
  }
  const bodyIds = values(body, "id"), collectionId = /^collection-([a-f0-9]{24})$/.exec(bodyIds[0] || "")?.[1] || null;
  if (bodyIds.length > 1 || !collectionId && /^collection-/i.test(bodyIds[0] || "")) throw new Error("Ungültige HTML-Collection");
  return { canonicalUrl: canonical?.attrs.get("href") ?? null, collectionId, title: title.children.join("") };
}

function textOf(node, work = null) {
  const parts = [], queue = [node];
  while (queue.length) {
    if (work && --work.remaining < 0) throw new Error("Zu komplexe Bildbeschriftungsstruktur");
    const value = queue.pop();
    if (typeof value === "string") parts.push(value);
    else for (let index = value.children.length - 1; index >= 0; index -= 1) queue.push(value.children[index]);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function ancestors(node) {
  const result = [];
  for (let current = node; current?.tag !== "#document"; current = current.parent) result.push(current);
  return result;
}

function captionOf(node, cache, work) {
  const figure = ancestors(node).find((value) => value.tag === "figure" || /(?:^|\s)(?:slide|gallery-item|sqs-gallery-design-grid-slide)(?:\s|$)/.test(value.attrs.get("class")));
  if (!figure) return node.attrs.get("data-description").trim();
  if (cache.has(figure)) return cache.get(figure);
  const pending = [...figure.children].reverse(), captions = [];
  while (pending.length) {
    if (--work.remaining < 0) throw new Error("Zu komplexe Bildbeschriftungsstruktur");
    const value = pending.pop();
    if (typeof value === "string") continue;
    if (value.tag === "figcaption" || CAPTION_CLASS.test(value.attrs.get("class"))) captions.push(textOf(value, work));
    else for (let index = value.children.length - 1; index >= 0; index -= 1) pending.push(value.children[index]);
  }
  const caption = [...new Set(captions.filter(Boolean))].join(" ");
  cache.set(figure, caption);
  return caption;
}

function imageSource(node, pageUrl) {
  for (const candidate of [node.attrs.get("data-src"), node.attrs.get("data-image"), node.attrs.get("src"),
    node.attrs.get("srcset").split(/,\s*/)[0]?.trim().split(/\s+/)[0]]) {
    if (!candidate) continue;
    try { return normalizeWebsiteImageUrl(new URL(candidate, pageUrl).href); } catch { /* A lazy real source may follow an ineligible placeholder. */ }
  }
  return null;
}

// Only actual background declarations count. A semicolon inside a quoted URL
// or function is not a declaration boundary; CSS variables and quoted example
// text must not invent image uses. This does not evaluate stylesheets or vars.
function inlineBackgroundSources(style) {
  const declarations = [];
  let current = "", quote = "", depth = 0, comment = false;
  for (let index = 0; index < style.length; index += 1) {
    const character = style[index], next = style[index + 1];
    if (comment) {
      if (character === "*" && next === "/") { comment = false; index += 1; }
      continue;
    }
    if (character === "\\") {
      current += character + (next || "");
      index += 1;
      continue;
    }
    if (quote) {
      current += character;
      if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && next === "*") { current += " "; comment = true; index += 1; continue; }
    if (character === '"' || character === "'") quote = character;
    else if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    else if (character === ";" && depth === 0) { declarations.push(current); current = ""; continue; }
    current += character;
  }
  if (!quote && !comment && depth === 0) declarations.push(current);
  const sources = [];
  for (const declaration of declarations) {
    const property = /^\s*background(?:-image)?\s*:\s*([\s\S]*)$/i.exec(declaration);
    if (!property) continue;
    // Consume standalone strings before looking for URL functions. Strings
    // inside url(...) are consumed by that complete function instead.
    const tokens = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?<![\w-])url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^)]*))\s*\)/gi;
    for (const match of property[1].matchAll(tokens)) {
      if (/^url\(/i.test(match[0])) sources.push((match[1] ?? match[2] ?? match[3]).trim());
    }
  }
  return sources;
}

export function parseWebsiteEditorialPage(html, pageUrl) {
  if (typeof html !== "string" || Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) throw new Error("Ungültiger oder zu großer Seiteninhalt");
  const url = normalizeWebsitePageUrl(pageUrl);
  const { all } = documentTree(html);
  const hasClass = (node, name) => node.attrs?.get("class").split(/\s+/).includes(name);
  const editorialText = (node) => {
    const parts = [], pending = [node];
    while (pending.length) {
      const item = pending.pop();
      if (typeof item === "string") { parts.push(item); continue; }
      const boundary = /^(?:p|li|div|ul|ol|h[1-6]|br)$/.test(item.tag);
      if (boundary) { parts.push(" "); pending.push(" "); }
      for (let index = item.children.length - 1; index >= 0; index -= 1) pending.push(item.children[index]);
    }
    return parts.join("").replace(/\s+/g, " ").trim();
  };
  const states = new WeakMap(), content = [], groups = [], blocks = [], sections = [], issues = [];
  for (const node of all) {
    const parent = states.get(node.parent) || {};
    const excluded = parent.excluded || ["header", "footer", "nav"].includes(node.tag)
      || /^(?:header|footer|footer-sections)$/.test(node.attrs.get("id"));
    const inside = !excluded && (parent.inside || node.tag === "main"
      || node.tag === "section" && node.attrs.has("data-section-id"));
    const isBlock = inside && hasClass(node, "sqs-block-html");
    if (isBlock && parent.group) throw new Error("Verschachtelte redaktionelle Textblöcke sind nicht eindeutig");
    const group = isBlock ? { node, units: [] } : parent.group;
    const textNode = /^h[1-6]$/.test(node.tag) || ["p", "li"].includes(node.tag);
    const insideText = !isBlock && parent.insideText;
    const gallery = inside && (parent.gallery || node.attrs.get("data-sqsp-section") === "gallery");
    states.set(node, { excluded, inside, group, insideText: insideText || textNode, gallery });
    if (!inside) continue;
    content.push(node);
    if (isBlock) groups.push(group);
    if (group && node !== group.node && textNode && !insideText) {
      const text = editorialText(node);
      if (text) group.units.push({ kind: /^h/.test(node.tag) ? "heading" : node.tag === "li" ? "list-item" : "paragraph",
        level: /^h/.test(node.tag) ? Number(node.tag[1]) : null, text });
    }
  }
  let active = null;
  for (const { node: block, units } of groups) {
    const fullText = editorialText(block), assigned = units.map((unit) => unit.text).join(" ");
    const record = { blockId: block.attrs.get("id") || null, fullText, units,
      complete: fullText === assigned, sha256: createHash("sha256").update(fullText).digest("hex") };
    blocks.push(record);
    if (!record.complete) issues.push({ code: "unassigned-editorial-text", blockId: record.blockId, text: fullText });
    for (const unit of units) {
      if (unit.kind === "heading") {
        active = { heading: unit.text, level: unit.level, blockId: record.blockId, paragraphs: [] };
        sections.push(active);
      } else {
        if (!active) { active = { heading: null, level: null, blockId: record.blockId, paragraphs: [] }; sections.push(active); }
        active.paragraphs.push({ kind: unit.kind, text: unit.text });
      }
    }
  }
  const gallerySources = [];
  for (const node of content.filter((item) => item.tag === "img" && states.get(item).gallery)) {
    const source = imageSource(node, url);
    if (!source) { issues.push({ code: "unsupported-gallery-source" }); continue; }
    const canonical = canonicalWebsiteImageSource(source);
    if (!gallerySources.includes(canonical)) gallerySources.push(canonical);
  }
  return { url, sections, blocks, gallerySources, complete: issues.length === 0, issues };
}

export function parseWebsiteAltPage(html, pageUrl) {
  const url = normalizeWebsitePageUrl(pageUrl);
  if (typeof html !== "string" || Buffer.byteLength(html) > MAX_HTML_BYTES) throw new Error("Website-HTML ist zu groß oder ungültig");
  const { all } = documentTree(html), images = new Map(), links = new Set(), captionCache = new WeakMap();
  const captionWork = { remaining: MAX_ELEMENTS * 4 };
  let unsupportedImages = 0;
  function addImage(node, src, kind) {
    if (!src) { unsupportedImages += 1; return; }
    const chain = ancestors(node);
    const context = chain.some((value) => value.tag === "header" || value.attrs.get("id") === "header") ? "header"
      : chain.some((value) => value.tag === "footer" || /^(?:footer|footer-sections)$/.test(value.attrs.get("id"))) ? "footer" : "content";
    const sourceUrl = canonicalWebsiteImageSource(src);
    const key = createHash("sha256").update(`${sourceUrl}\n${context}\n${kind}`).digest("hex");
    const alt = node.tag === "img" ? node.attrs.get("alt") : "", caption = captionOf(node, captionCache, captionWork);
    const existing = images.get(key);
    if (existing) {
      existing.occurrences += 1;
      if (!existing.altVariants.includes(alt)) existing.altVariants.push(alt);
      if (!existing.captionVariants.includes(caption)) existing.captionVariants.push(caption);
      if (!existing.caption && caption) existing.caption = caption;
      existing.altPresent = existing.altPresent && node.attrs.has("alt");
      existing.duplicateAltValues = [...new Set([...existing.duplicateAltValues, ...(node.attrs.values.get("alt") || []).slice(1)])];
      return;
    }
    if (images.size >= MAX_IMAGES) throw new Error("Zu viele Bilder auf einer Seite");
    const preview = new URL(src);
    if (IMAGE_HOSTS.has(preview.hostname)) preview.searchParams.set("format", "750w");
    images.set(key, { key, src, previewSrc: preview.href, sourceUrl, alt, caption, context, kind,
      altPresent: node.attrs.has("alt"), altVariants: [alt], captionVariants: [caption], occurrences: 1,
      duplicateAltValues: (node.attrs.values.get("alt") || []).slice(1) });
  }
  for (const node of all) {
    if (node.tag === "a" && node.attrs.get("href")) {
      try { links.add(normalizeWebsitePageUrl(new URL(node.attrs.get("href"), url).href)); } catch { /* External links, downloads and actions are not crawl inputs. */ }
    }
    if (node.tag === "img") {
      const isBackground = ancestors(node).some((value) => /(?:^|\s)section-background(?:\s|$)/.test(value.attrs.get("class")))
        || node.attrs.get("elementtiming") === "nbf-background";
      addImage(node, imageSource(node, url), isBackground ? "background" : "image");
    }
    for (const source of inlineBackgroundSources(node.attrs.get("style"))) {
      let src = null;
      try { src = normalizeWebsiteImageUrl(new URL(source, url).href); } catch { /* Unsupported background is reported as a coverage limit. */ }
      addImage(node, src, "background");
    }
  }
  const coverageNotes = ["Erfasst ist öffentliches statisches HTML. Skriptgenerierte Bilder, externe Stylesheets, nicht zugängliche Seiten und CMS-Entwürfe benötigen eine gesonderte Prüfung."];
  if (unsupportedImages) coverageNotes.push(`${unsupportedImages} Bildverwendung(en) ohne erlaubte eindeutige Quelle konnten nicht zugeordnet werden.`);
  if ([...images.values()].some((image) => image.altVariants.length > 1)) coverageNotes.push("Dieselbe Bildquelle hat innerhalb einer Verwendung unterschiedliche Alternativtexte; die Einzelverwendungen müssen geprüft werden.");
  return { url, title: textOf(all.find((node) => node.tag === "title") || all.find((node) => node.tag === "h1") || { children: [] }),
    images: [...images.values()], links: [...links].sort(), unsupportedImageCount: unsupportedImages, coverageNotes };
}
