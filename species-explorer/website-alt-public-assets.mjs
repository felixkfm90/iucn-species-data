import { createHash } from "node:crypto";
import { sanitizeAssetName } from "./species-model.mjs";
import { normalizeWebsitePageUrl, parseWebsiteAltPage } from "./website-alt-parser.mjs";

export const WEBSITE_PUBLIC_ASSET_ROOT = "https://felixkfm90.github.io/iucn-species-data/";
// These public sources were fetched and checked on 28 October 2026. Unknown
// module bytes stop inference until their output rules have been reviewed.
const MODULE_HASHES = Object.freeze({
  "species-core.js": "1b57880e9c4f4d8e092c1c6a0994fdb8c363e2875c9631420953ad56c074f9dc",
  "species-status.js": "343e3d7d77a6d4fc0a10f8cb8ff51d54b9b3f416010e08b2ae88ba0e556295d2",
  "species-sound.js": "c4b84e9b75a40b8f6ce7cf7d9af2ea3cc204ff2c10bf93ad3e79ed12e79654e0",
  "map-loader.js": "aee7fccc809047c686238645d88d3618f6e5486bd980dcfc4279a4e647ed35df",
  "species-portrait.js": "f1e8f7b0ac200737609a43d6ab488f388e54c46c0aee1e9a317f3202cc203c4a",
});
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

function decodeAttribute(value) {
  return String(value).replace(/&(?:amp|quot|apos|lt|gt);|&#(?:x[\da-f]+|\d+);/gi, (entity) => {
    const names = { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" };
    if (names[entity.toLowerCase()]) return names[entity.toLowerCase()];
    const point = /^&#x/i.test(entity) ? parseInt(entity.slice(3), 16) : parseInt(entity.slice(2), 10);
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : entity;
  });
}

// Only actual opening tags count. Comment/raw/template contents must not turn
// quoted example markup into an observed module placeholder or script.
function markers(html, pageUrl) {
  const ids = new Map(), scripts = new Map(), positions = new Map(), ignored = [];
  let offset = 0;
  while (offset < html.length) {
    const start = html.indexOf("<", offset);
    if (start < 0) break;
    if (html.startsWith("<!--", start)) {
      const end = html.indexOf("-->", start + 4);
      if (end < 0) break;
      offset = end + 3;
      continue;
    }
    const match = /^<(\/?)([a-z][\w:-]*)\b/i.exec(html.slice(start));
    if (!match) { offset = start + 1; continue; }
    let end = start + match[0].length, quote = "";
    for (; end < html.length; end += 1) {
      const char = html[end];
      if (quote) { if (char === quote) quote = ""; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === ">") break;
    }
    if (end >= html.length) break;
    const tag = match[2].toLowerCase(), attributes = new Map();
    if (match[1]) {
      if (ignored.at(-1) === tag) ignored.pop();
      offset = end + 1;
      continue;
    }
    const raw = html.slice(start + match[0].length, end);
    for (const item of raw.matchAll(/([^\s=<>"'`/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      const name = item[1].toLowerCase();
      if (!attributes.has(name)) attributes.set(name, decodeAttribute(item[2] ?? item[3] ?? item[4] ?? ""));
    }
    if (!ignored.length && attributes.has("id")) ids.set(attributes.get("id"), (ids.get(attributes.get("id")) || 0) + 1);
    if (!ignored.length && tag === "script" && attributes.has("src")) {
      try {
        const url = new URL(attributes.get("src"), pageUrl);
        const name = url.pathname.slice("/iucn-species-data/".length);
        if (url.origin === new URL(WEBSITE_PUBLIC_ASSET_ROOT).origin && !url.username && !url.password && !url.port
            && url.pathname === `/iucn-species-data/${name}` && Object.hasOwn(MODULE_HASHES, name)
            && !url.hash && [...url.searchParams.keys()].every((key) => key === "v")
            && attributes.has("defer") && !attributes.has("async") && !attributes.has("nomodule")
            && ["", "text/javascript", "application/javascript"].includes(attributes.get("type") || "")) {
          scripts.set(name, url.href);
          positions.set(name, [...(positions.get(name) || []), start]);
        }
      } catch { /* An untrusted script address never becomes a fetch target. */ }
    }
    offset = end + 1;
    if (["template", "noscript"].includes(tag)) ignored.push(tag);
    if (["script", "style", "textarea"].includes(tag)) {
      const close = new RegExp(`</${tag}\\s*>`, "ig"); close.lastIndex = offset;
      const closing = close.exec(html);
      offset = closing ? close.lastIndex : html.length;
    }
  }
  return { ids, scripts, positions };
}

function checkedPublicUrl(value) {
  const url = new URL(value);
  if (url.origin !== new URL(WEBSITE_PUBLIC_ASSET_ROOT).origin || !url.href.startsWith(WEBSITE_PUBLIC_ASSET_ROOT)
      || url.username || url.password || url.port || url.hash || /%2f|%5c|%00/i.test(url.pathname)) {
    throw new Error("Keine erlaubte öffentliche Modulquelle");
  }
  return url;
}

export function createWebsiteAltPublicAssets({ fetchImpl = globalThis.fetch, now = Date.now, signal,
  timeoutMs = 12000, deadline = Infinity, maxBytes = 2 * 1024 * 1024, maxRequests = 512 } = {}) {
  if (typeof fetchImpl !== "function" || typeof now !== "function"
      || [timeoutMs, maxBytes, maxRequests].some((value) => !Number.isSafeInteger(value) || value < 1)
      || deadline !== Infinity && !Number.isFinite(deadline)) throw new TypeError("Ungültige Prüfgrenzen der öffentlichen Bildmodule");
  const cache = new Map(), moduleProofs = new Map();
  let requests = 0, bytes = 0, sequence = 0, dataProof = null;

  async function read(value, { method = "GET", kind = "script", optional = false } = {}) {
    const url = checkedPublicUrl(value);
    if (signal?.aborted) throw Object.assign(new Error("Modulprüfung abgebrochen"), { name: "AbortError" });
    if (++requests > maxRequests || now() >= deadline) throw new Error("Prüfgrenze der öffentlichen Bildmodule erreicht");
    const controller = new AbortController();
    let rejectTimeout, reader;
    const expired = new Promise((_, reject) => { rejectTimeout = reject; });
    const abort = () => { controller.abort(); rejectTimeout(Object.assign(new Error("Modulprüfung abgebrochen"), { name: "AbortError" })); };
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => { controller.abort(); rejectTimeout(new Error("Zeitüberschreitung bei öffentlichen Bildmodulen")); },
      Math.min(timeoutMs, Math.max(1, deadline - now())));
    const bounded = (promise) => Promise.race([promise, expired]);
    url.searchParams.set("fnaltcheck", `${Math.trunc(now())}-${++sequence}`);
    try {
      const response = await bounded(fetchImpl(url.href, { method, redirect: "manual", signal: controller.signal,
        cache: "no-store", headers: { Accept: kind === "json" ? "application/json" : kind === "script" ? "text/javascript,application/javascript" : kind === "audio" ? "audio/*" : "image/*" } }));
      if (response.url && response.url !== url.href || response.status >= 300 && response.status < 400) {
        throw new Error("Öffentliche Bildmodule: Weiterleitung wird nicht verfolgt");
      }
      if (response.status === 404 && optional) return null;
      if (!response.ok) throw new Error(`Öffentliche Bildmodule: HTTP ${response.status}`);
      const type = response.headers.get("content-type") || "";
      const expected = { json: /application\/json/i, script: /(?:text|application)\/javascript/i, image: /^image\//i, audio: /^audio\//i }[kind];
      if (type && !expected.test(type)) throw new Error("Öffentliche Bildmodule: unerwarteter Inhaltstyp");
      if (method === "HEAD") return true;
      if (Number(response.headers.get("content-length")) > maxBytes) throw new Error("Öffentliche Moduldaten überschreiten die Größengrenze");
      reader = response.body?.getReader();
      if (!reader) throw new Error("Leere öffentliche Moduldaten");
      const chunks = [];
      for (;;) {
        const item = await bounded(reader.read());
        if (item.done) break;
        bytes += item.value.byteLength;
        if (bytes > maxBytes) throw new Error("Öffentliche Moduldaten überschreiten die Größengrenze");
        chunks.push(item.value);
      }
      return Buffer.concat(chunks).toString("utf8");
    } catch (error) {
      controller.abort();
      if (reader) void reader.cancel().catch(() => {});
      throw error;
    } finally {
      clearTimeout(timer); signal?.removeEventListener("abort", abort); reader?.releaseLock();
    }
  }

  function cached(key, action) {
    if (!cache.has(key)) cache.set(key, Promise.resolve().then(action));
    return cache.get(key);
  }

  async function module(name, url) {
    return cached(`module:${url}`, async () => {
      const source = await read(url);
      const hash = sha256(source);
      if (hash !== MODULE_HASHES[name]) throw new Error(`Öffentliches Modul ${name} hat einen ungeprüften Quellstand; Bildzuordnung bleibt offen`);
      moduleProofs.set(url, hash);
    });
  }

  async function speciesList() {
    return cached("speciesData", async () => {
      const source = await read(`${WEBSITE_PUBLIC_ASSET_ROOT}speciesData.json`, { kind: "json" });
      const data = JSON.parse(source), slugs = new Set();
      if (!Array.isArray(data) || !data.length || data.length > 10000) throw new Error("Ungültige öffentliche Artendaten");
      for (const entry of data) {
        if (!entry || !/^[a-z0-9][a-z0-9._-]{0,200}$/i.test(entry.URLSlug || "") || slugs.has(entry.URLSlug)) throw new Error("Mehrdeutige öffentliche Artzuordnung");
        slugs.add(entry.URLSlug);
        for (const key of ["Deutscher Name", "Wissenschaftlicher Name", "Status", "Trend", "Kategorie"]) {
          if (typeof entry[key] !== "string" || entry[key].length > 500 || /[\u0000-\u001f\u007f]/u.test(entry[key])
              || !entry[key].trim() && key !== "Trend") throw new Error("Ungültiges Feld der öffentlichen Artendaten");
        }
      }
      dataProof = { url: `${WEBSITE_PUBLIC_ASSET_ROOT}speciesData.json`, sha256: sha256(source), checkedAt: new Date(now()).toISOString() };
      return data;
    });
  }

  const exists = (url, kind = "image") => cached(`head:${url}`, () => read(url, { method: "HEAD", kind, optional: true }));

  async function enrich(page, html) {
    const url = normalizeWebsitePageUrl(page.url), { ids, scripts, positions } = markers(html, page.url);
    const requested = [];
    if (ids.has("species-output")) requested.push({ module: "species-portrait.js", kind: "portrait" });
    if (ids.has("map-wrapper") || ids.has("map-output")) requested.push({ module: "map-loader.js", kind: "map" });
    if (ids.has("species-status")) requested.push({ module: "species-status.js", kind: "status" });
    if (ids.has("species-sound")) requested.push({ module: "species-sound.js", kind: "sound" });
    if (!requested.length) return page;
    const expectedCount = requested.reduce((sum, entry) => sum + (entry.kind === "status" ? 2 : 1), 0);
    const missing = !scripts.has("species-core.js") || requested.some((entry) => !scripts.has(entry.module))
      || (positions.get("species-core.js") || []).length !== 1
      || requested.some((entry) => (positions.get(entry.module) || []).length !== 1
        || positions.get(entry.module)[0] < positions.get("species-core.js")?.[0])
      || ["species-output", "species-status", "species-sound", "map-wrapper", "map-output"].some((id) => (ids.get(id) || 0) > 1)
      || requested.some((entry) => entry.kind === "map") && (!ids.has("map-wrapper") || !ids.has("map-output"));
    if (missing) return { ...page, unsupportedImageCount: page.unsupportedImageCount + expectedCount,
      coverageNotes: [...page.coverageNotes, "Bildmodul-Platzhalter ohne eindeutig unterstützte öffentliche Skripteinbindung; die Modulbilder bleiben zur Prüfung offen."] };
    if (!/^\/wildlife\/[^/]+\/[^/]+$/.test(new URL(url).pathname)) throw new Error("Bildmodule ohne eindeutigen Artseitenpfad; Bildzuordnung bleibt offen");
    await module("species-core.js", scripts.get("species-core.js"));
    const slug = new URL(url).pathname.split("/").at(-1), data = (await speciesList()).find((entry) => entry.URLSlug === slug);
    if (!data) throw new Error("Bildmodule ohne passende öffentliche Artzuordnung; Bildzuordnung bleibt offen");
    const name = data["Deutscher Name"], directory = `${WEBSITE_PUBLIC_ASSET_ROOT}species-assets/${encodeURIComponent(sanitizeAssetName(name))}/`;
    const additions = [];
    const add = (source, alt) => additions.push(parseWebsiteAltPage(`<img src="${escapeHtml(source)}" alt="${escapeHtml(alt)}">`, url).images[0]);
    for (const entry of requested) {
      await module(entry.module, scripts.get(entry.module));
      if (entry.kind === "map" && await exists(`${directory}map.jpg`)) add(`${directory}map.jpg`, `Verbreitungskarte - ${name}`);
      if (entry.kind === "portrait" && await exists(`${directory}portrait.webp`)) add(`${directory}portrait.webp`, `Artporträt – ${name}`);
      if (entry.kind === "sound" && await exists(`${directory}sound.mp3`, "audio") && await exists(`${directory}spectrogram.webp`)) add(`${directory}spectrogram.webp`, "");
      if (entry.kind === "status") {
        const status = ["LC", "NT", "VU", "EN", "CR", "EW", "EX"].includes(data.Status) ? data.Status : "LC";
        const raw = data.Trend.trim(), trend = !raw || raw.toLowerCase() === "n/a" || raw === "Unbekannt" ? "Unbekannt" : raw;
        const icon = { Zunehmend: "zunehmend", Stabil: "stabil", Abnehmend: "abnehmend", Unbekannt: "nodata" }[trend] || "nodata";
        add(`${WEBSITE_PUBLIC_ASSET_ROOT}graphics/catagory/Alternativ/${status}.png`, `IUCN-Status: ${data.Kategorie}`);
        add(`${WEBSITE_PUBLIC_ASSET_ROOT}graphics/trend/${icon}.png`, `Populationstrend: ${trend}`);
      }
    }
    const images = new Map(page.images.map((image) => [image.key, image]));
    for (const image of additions) {
      const existing = images.get(image.key);
      if (!existing) images.set(image.key, image);
      else if (!existing.altVariants.includes(image.alt)) existing.altVariants = [...existing.altVariants, image.alt];
    }
    return { ...page, images: [...images.values()],
      coverageNotes: [...page.coverageNotes, `Bekannte Artmodule wurden ergänzend aus ihren frisch geprüften öffentlichen Quellen und Artendaten abgeleitet (Daten-SHA256 ${dataProof.sha256}). Das ist kein gerenderter Sichtnachweis. Ein bewusst leerer Spektrogrammtext entspricht dem für Hilfstechniken ausgeblendeten Klangbild des Players.`],
      publicModuleEvidence: { source: "public-module-inference", data: dataProof,
        modules: [...moduleProofs].map(([source, sha]) => ({ url: source, sha256: sha })) } };
  }

  return Object.freeze({ enrich });
}
