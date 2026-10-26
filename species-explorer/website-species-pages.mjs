const ORIGIN = "https://www.fnwildlifetravel.de";
export const FN_SITEMAP_URL = `${ORIGIN}/sitemap.xml`;
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

function fnUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !["www.fnwildlifetravel.de", "fnwildlifetravel.de"].includes(url.hostname)
      || url.port || url.username || url.password || url.search || url.hash) throw new Error("Fremde Sitemap-Adresse");
  url.hostname = "www.fnwildlifetravel.de";
  return url;
}

function xmlText(value) {
  if (/&(?![A-Za-z]+;|#\d+;|#x[0-9a-f]+;)/i.test(value)) throw new Error("Ungültige XML-Referenz");
  return value.replace(/&([^;\s]+);/g, (_, entity) => {
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (Object.hasOwn(named, entity)) return named[entity];
    const number = /^#x[0-9a-f]+$/i.test(entity) ? Number.parseInt(entity.slice(2), 16)
      : /^#\d+$/.test(entity) ? Number(entity.slice(1)) : NaN;
    if (!Number.isInteger(number) || number < 32 || number > 0x10ffff || number >= 0xd800 && number <= 0xdfff) {
      throw new Error("Ungültige XML-Referenz");
    }
    return String.fromCodePoint(number);
  });
}

// Parse the complete bounded document, including nested image entries. Only the
// sitemap namespace's direct url/loc or sitemap/loc pairs are discovery inputs.
export function parseWebsiteSitemap(xml) {
  if (typeof xml !== "string" || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Ungültige Sitemap");
  const tokens = xml.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<(?:"[^"]*"|'[^']*'|[^'">])*?>|[^<]+/g) || [];
  if (tokens.join("") !== xml) throw new Error("Unvollständige Sitemap");
  const stack = [], locations = [];
  let root = "", prefix = "", closed = false, entryLocations = 0, location = "";
  const isLocation = () => stack.length === 3 && stack[0] === root
    && stack[1] === `${prefix}${root.endsWith("urlset") ? "url" : "sitemap"}` && stack[2] === `${prefix}loc`;
  for (const token of tokens) {
    if (token.startsWith("<!--") || token.startsWith("<?")) continue;
    if (token.startsWith("<![CDATA[")) {
      if (isLocation()) location += token.slice(9, -3);
      else if (stack.length <= 2 && token.slice(9, -3).trim()) throw new Error("Ungültiger Sitemap-Text");
      continue;
    }
    if (!token.startsWith("<")) {
      if (isLocation()) location += xmlText(token);
      else if (stack.length <= 2 && token.trim()) throw new Error("Ungültiger Sitemap-Text");
      continue;
    }
    const end = /^<\/([A-Za-z_][\w.:-]*)\s*>$/.exec(token);
    if (end) {
      if (stack.at(-1) !== end[1]) throw new Error("Unvollständige Sitemap");
      if (isLocation()) { locations.push(location.trim()); entryLocations += 1; }
      if (stack.length === 2 && stack[1] === `${prefix}${root.endsWith("urlset") ? "url" : "sitemap"}`
          && entryLocations !== 1) throw new Error("Sitemap-Eintrag ohne eindeutige Adresse");
      stack.pop();
      if (!stack.length) closed = true;
      continue;
    }
    const start = /^<([A-Za-z_][\w.:-]*)(?:\s[^<>]*)?\s*\/?>$/.exec(token);
    if (!start || closed) throw new Error("Ungültige Sitemap-Struktur");
    const name = start[1], selfClosing = /\/\s*>$/.test(token);
    if (!root) {
      if (!/^(?:[A-Za-z_]\w*:)?(?:urlset|sitemapindex)$/.test(name)) throw new Error("Keine Sitemap erhalten");
      root = name;
      prefix = name.includes(":") ? `${name.split(":")[0]}:` : "";
    }
    stack.push(name);
    if (stack.length === 2) {
      if (name !== `${prefix}${root.endsWith("urlset") ? "url" : "sitemap"}`) throw new Error("Ungültiger Sitemap-Eintrag");
      entryLocations = 0;
    }
    if (isLocation()) location = "";
    if (selfClosing) {
      if (isLocation() || stack.length === 2) throw new Error("Leerer Sitemap-Eintrag");
      stack.pop();
      if (!stack.length) closed = true;
    }
  }
  if (!root || stack.length || !closed || locations.some((value) => !value)) throw new Error("Unvollständige Sitemap");
  return { kind: root.endsWith("urlset") ? "urlset" : "index", locations };
}

export function createWebsiteSpeciesPagesService({ fetchImpl = globalThis.fetch, now = Date.now,
  ttlMs = 5 * 60 * 1000, timeoutMs = 8000, retryMs = 30000 } = {}) {
  let latest = null, inflight = null, nextAttempt = -Infinity, requestSequence = 0;
  const copy = (value) => ({ ...value, pages: value.pages.map((page) => ({ ...page })) });

  async function discover() {
    const attemptedAt = new Date(now()).toISOString();
    const controller = new AbortController();
    let rejectTimeout;
    const timedOut = new Promise((_, reject) => { rejectTimeout = reject; });
    const timer = setTimeout(() => {
      controller.abort();
      rejectTimeout(new Error("Zeitüberschreitung der Website-Prüfung"));
    }, timeoutMs);
    const bounded = (promise) => Promise.race([promise, timedOut]);
    try {
      const queue = [FN_SITEMAP_URL], visited = new Set(), pages = new Map();
      let totalBytes = 0, leaves = 0;
      while (queue.length) {
        const url = queue.shift();
        if (visited.has(url)) continue;
        if (visited.size >= 8) throw new Error("Zu viele Sitemap-Dateien");
        visited.add(url);
        // Squarespace can keep the bare sitemap stale after a page is public;
        // no-cache headers alone do not refresh that upstream cache. Only our
        // own request gets a nonce; discovered URLs retain strict host/query rules.
        const requestUrl = new URL(url);
        requestUrl.searchParams.set("fncheck", `${Math.trunc(now())}-${++requestSequence}`);
        const response = await bounded(fetchImpl(requestUrl.href, { redirect: "error", signal: controller.signal,
          headers: { Accept: "application/xml,text/xml", "User-Agent": "FN-Arten-Explorer/website-pages" } }));
        if (!response.ok) throw new Error(`Website-Prüfung: HTTP ${response.status}`);
        if (response.url && response.url !== requestUrl.href) throw new Error("Unerwartete Sitemap-Weiterleitung");
        if (/html/i.test(response.headers.get("content-type") || "")) throw new Error("Keine Sitemap erhalten");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Leere Sitemap-Antwort");
        const chunks = [];
        let bytes = 0;
        try {
          while (true) {
            const part = await bounded(reader.read());
            if (part.done) break;
            bytes += part.value.byteLength;
            totalBytes += part.value.byteLength;
            if (bytes > MAX_DOCUMENT_BYTES || totalBytes > MAX_TOTAL_BYTES) throw new Error("Sitemap ist zu groß");
            chunks.push(part.value);
          }
        } catch (error) { void reader.cancel().catch(() => {}); throw error; }
        finally { reader.releaseLock(); }
        const document = parseWebsiteSitemap(Buffer.concat(chunks).toString("utf8"));
        if (document.kind === "index") {
          for (const location of document.locations) {
            const child = fnUrl(location);
            if (!child.pathname.endsWith(".xml")) throw new Error("Ungültige Unter-Sitemap");
            queue.push(child.href);
            if (new Set([...visited, ...queue]).size > 8) throw new Error("Zu viele Sitemap-Dateien");
          }
        } else {
          leaves += 1;
          for (const location of document.locations) {
            let page;
            try { page = fnUrl(location); } catch { continue; }
            const match = /^\/wildlife\/([a-z0-9-]+)\/([a-z0-9-]+)\/?$/.exec(page.pathname);
            if (!match) continue;
            page.pathname = page.pathname.replace(/\/$/, "");
            pages.set(page.href, { slug: match[2], url: page.href });
          }
        }
      }
      if (!leaves) throw new Error("Keine vollständige Seitenliste erhalten");
      latest = { status: "ready", checkedAt: new Date(now()).toISOString(), attemptedAt,
        pages: [...pages.values()].sort((a, b) => a.url.localeCompare(b.url)), cached: false };
      nextAttempt = now() + ttlMs;
    } catch (error) {
      controller.abort();
      latest = { status: "unavailable", checkedAt: latest?.checkedAt || null, attemptedAt,
        pages: latest?.pages || [], cached: Boolean(latest?.checkedAt),
        error: `FN-Website derzeit nicht prüfbar. ${error.message}` };
      nextAttempt = now() + retryMs;
    } finally { clearTimeout(timer); }
    return latest;
  }

  return Object.freeze({ async snapshot({ refresh = false } = {}) {
    if (inflight) return copy(await inflight);
    if (latest && !refresh && now() < nextAttempt) return { ...copy(latest), cached: true };
    inflight = discover();
    try { return copy(await inflight); }
    finally { inflight = null; }
  } });
}
