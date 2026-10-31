import { FN_SITEMAP_URL, parseWebsiteSitemap } from "./website-species-pages.mjs";
import { normalizeWebsitePageUrl, parseWebsiteAltPage } from "./website-alt-parser.mjs";
import { createWebsiteAltPublicAssets } from "./website-alt-public-assets.mjs";

export { canonicalWebsiteImageSource, normalizeWebsiteImageUrl, normalizeWebsitePageUrl, parseWebsiteAltPage } from "./website-alt-parser.mjs";

const ORIGIN = "https://www.fnwildlifetravel.de";
const STATIC_COVERAGE = "Die Erfassung umfasst entdeckte öffentliche Seiten, ihr statisches HTML und unterstützte, frisch geprüfte Artmodule; sie ist kein Vollständigkeitsnachweis für CMS-Entwürfe, unzugängliche Bereiche oder sonstige dynamische Bilder.";

function sitemapUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !["www.fnwildlifetravel.de", "fnwildlifetravel.de"].includes(url.hostname)
      || url.port || url.username || url.password || url.search || url.hash || !url.pathname.endsWith(".xml")) throw new Error("Fremde oder ungültige Sitemap-Adresse");
  if (/%2f|%5c|%00/i.test(url.pathname)
      || /^\/(?:api|config|account|login|logout|cart|checkout|auth|oauth)(?:\/|$)/i.test(decodeURIComponent(url.pathname))) throw new Error("Keine öffentliche Sitemap-Adresse");
  url.hostname = "www.fnwildlifetravel.de";
  return url.href;
}

export function createWebsiteAltDiscovery({ fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 12000,
  scanTimeoutMs = 180000, maxPages = 500, maxSitemaps = 8, maxDocumentBytes = 4 * 1024 * 1024,
  maxTotalBytes = 128 * 1024 * 1024, concurrency = 3 } = {}) {
  for (const value of [timeoutMs, scanTimeoutMs, maxPages, maxSitemaps, maxDocumentBytes, maxTotalBytes, concurrency]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("Website-Prüfgrenzen müssen positive ganze Zahlen sein");
  }
  const stamp = () => new Date(now()).toISOString();
  const budget = (signal) => ({ bytes: 0, deadline: now() + scanTimeoutMs, stopped: false, signal });
  let sequence = 0;

  async function read(url, expectedType, current) {
    if (current.signal?.aborted) throw Object.assign(new Error("Website-Prüfung abgebrochen"), { name: "AbortError" });
    if (current.stopped || now() >= current.deadline) throw new Error("Gesamtzeitlimit der Website-Prüfung erreicht");
    const controller = new AbortController();
    let rejectTimeout;
    const expired = new Promise((_, reject) => { rejectTimeout = reject; });
    const abort = () => { controller.abort(); rejectTimeout(Object.assign(new Error("Website-Prüfung abgebrochen"), { name: "AbortError" })); };
    current.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => { controller.abort(); rejectTimeout(new Error("Zeitüberschreitung beim Lesen der Website")); },
      Math.min(timeoutMs, Math.max(1, current.deadline - now())));
    const bounded = (promise) => Promise.race([promise, expired]);
    const request = new URL(url);
    request.searchParams.set("fnaltcheck", `${Math.trunc(now())}-${++sequence}`);
    let reader;
    try {
      const response = await bounded(fetchImpl(request.href, { redirect: "manual", signal: controller.signal,
        headers: { Accept: expectedType === "xml" ? "application/xml,text/xml" : "text/html", "User-Agent": "FN-Arten-Explorer/alt-text-inventory" } }));
      if (response.url && response.url !== request.href) throw new Error("Unerwartete Weiterleitung der Website-Prüfung");
      if (expectedType === "html" && [301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new Error("Website-Weiterleitung ohne Zieladresse");
        let redirectUrl;
        try { redirectUrl = normalizeWebsitePageUrl(new URL(location, url).href); }
        catch { throw new Error("Website-Weiterleitung führt nicht auf eine erlaubte eigene Inhaltsseite"); }
        if (redirectUrl === normalizeWebsitePageUrl(url)) throw new Error("Website-Weiterleitung verweist auf sich selbst");
        throw Object.assign(new Error("Öffentlicher Seitenverweis"), { code: "WEBSITE_PAGE_REDIRECT", redirectUrl });
      }
      if (!response.ok) throw new Error(`Website-Prüfung: HTTP ${response.status}`);
      const type = response.headers.get("content-type") || "";
      if (expectedType === "xml" ? /html/i.test(type) : type && !/(?:text\/html|application\/xhtml\+xml)/i.test(type)) throw new Error("Unerwarteter Website-Inhaltstyp");
      if (Number(response.headers.get("content-length")) > maxDocumentBytes) throw new Error("Website-Dokument überschreitet die Größengrenze");
      reader = response.body?.getReader();
      if (!reader) throw new Error("Leere Website-Antwort");
      const chunks = [];
      let bytes = 0;
      for (;;) {
        const item = await bounded(reader.read());
        if (item.done) break;
        bytes += item.value.byteLength;
        current.bytes += item.value.byteLength;
        if (bytes > maxDocumentBytes || current.bytes > maxTotalBytes) {
          if (current.bytes > maxTotalBytes) current.stopped = true;
          throw new Error("Website-Dokument oder Gesamtbestand überschreitet die Größengrenze");
        }
        chunks.push(item.value);
      }
      return Buffer.concat(chunks).toString("utf8");
    } catch (error) {
      controller.abort();
      if (reader) void reader.cancel().catch(() => {});
      throw error;
    } finally {
      clearTimeout(timer);
      current.signal?.removeEventListener("abort", abort);
      reader?.releaseLock();
    }
  }

  async function sitemaps(current) {
    const queue = [FN_SITEMAP_URL], visited = new Set(), urls = new Set(), errors = [];
    let leaves = 0;
    while (queue.length) {
      const url = queue.shift();
      if (visited.has(url)) continue;
      if (visited.size >= maxSitemaps) { errors.push({ url, message: "Zu viele Sitemap-Dateien" }); break; }
      visited.add(url);
      try {
        const document = parseWebsiteSitemap(await read(url, "xml", current));
        if (document.kind === "index") {
          for (const location of document.locations) queue.push(sitemapUrl(location));
        } else {
          leaves += 1;
          for (const location of document.locations) {
            try { urls.add(normalizeWebsitePageUrl(location)); }
            catch { errors.push({ url, message: "Sitemap enthält eine nicht zulässige Seitenadresse" }); }
            if (urls.size > maxPages) throw new Error("Sitemap enthält mehr Seiten als die Prüfgrenze erlaubt");
          }
        }
      } catch (error) { errors.push({ url, message: error.message }); }
      if (current.stopped || current.signal?.aborted || now() >= current.deadline) break;
    }
    if (!leaves) errors.push({ url: FN_SITEMAP_URL, message: "Keine vollständige öffentliche Sitemap-Seitenliste erhalten" });
    return { urls: [...urls].slice(0, maxPages).sort(), sitemapUrls: [...visited], errors, checkedAt: stamp(),
      complete: errors.length === 0 && !queue.length, coverageNotes: ["Diese Liste stammt aus der öffentlichen Sitemap und ist kein vollständiger CMS-Seitenbestand."] };
  }

  function aliasPage(url, error) {
    if (error.code !== "WEBSITE_PAGE_REDIRECT") return null;
    const redirectUrl = normalizeWebsitePageUrl(error.redirectUrl);
    return { url, title: "Weiterleitung", redirectUrl, images: [], links: [redirectUrl], unsupportedImageCount: 0,
      checkedAt: stamp(), coverageNotes: ["Öffentlicher Weiterleitungsverweis; Bildtexte werden auf der Zielseite geprüft."] };
  }

  async function page(url, { signal } = {}) {
    const normalized = normalizeWebsitePageUrl(url);
    const current = budget(signal);
    try {
      const html = await read(normalized, "html", current);
      const assets = createWebsiteAltPublicAssets({ fetchImpl, now, signal, timeoutMs, deadline: current.deadline });
      return { ...await assets.enrich(parseWebsiteAltPage(html, normalized), html), checkedAt: stamp() };
    }
    catch (error) {
      const alias = aliasPage(normalized, error);
      if (alias) return alias;
      throw error;
    }
  }

  async function scan({ seedUrls = [], signal } = {}) {
    if (!Array.isArray(seedUrls) || seedUrls.length > maxPages) throw new Error("Ungültige zusätzliche Seitenliste");
    const seeds = seedUrls.map(normalizeWebsitePageUrl), startedAt = stamp(), current = budget(signal);
    const assets = createWebsiteAltPublicAssets({ fetchImpl, now, signal, timeoutMs, deadline: current.deadline });
    const listed = await sitemaps(current), errors = [...listed.errors], pending = [], queued = new Set(), pages = [];
    let limitReached = false;
    function enqueue(url) {
      if (queued.has(url)) return;
      if (queued.size >= maxPages) { limitReached = true; return; }
      queued.add(url);
      pending.push(url);
    }
    for (const url of [ORIGIN + "/", ...listed.urls, ...seeds]) enqueue(url);
    while (pending.length && !current.stopped && !current.signal?.aborted && now() < current.deadline) {
      const batch = pending.splice(0, Math.min(concurrency, 8));
      await Promise.all(batch.map(async (url) => {
        try {
          const html = await read(url, "html", current);
          const result = { ...await assets.enrich(parseWebsiteAltPage(html, url), html), checkedAt: stamp() };
          pages.push(result);
          for (const link of result.links) enqueue(link);
        } catch (error) {
          const alias = aliasPage(url, error);
          if (alias) { pages.push(alias); enqueue(alias.redirectUrl); }
          else errors.push({ url, message: error.message });
        }
      }));
    }
    if (limitReached) errors.push({ url: ORIGIN + "/", message: "Weitere Seiten gefunden; die Seiten-Prüfgrenze ist erreicht" });
    if (pending.length) errors.push({ url: ORIGIN + "/", message: "Website-Prüfung vor vollständiger Abarbeitung der bekannten Seiten angehalten" });
    const aliases = new Map(pages.filter((entry) => entry.redirectUrl).map((entry) => [entry.url, entry.redirectUrl]));
    for (const alias of aliases.keys()) {
      const visited = new Set();
      for (let target = alias; aliases.has(target); target = aliases.get(target)) {
        if (visited.has(target)) { errors.push({ url: alias, message: "Zyklische Website-Weiterleitung ohne Inhaltsziel" }); break; }
        visited.add(target);
      }
    }
    return { pages: pages.sort((a, b) => a.url.localeCompare(b.url)), discoveredUrls: [...queued].sort(), sitemapUrls: listed.sitemapUrls,
      errors, startedAt, completedAt: stamp(), complete: errors.length === 0 && pending.length === 0,
      coverageNotes: [STATIC_COVERAGE], source: "public-static-html" };
  }

  return Object.freeze({ listPages: ({ signal } = {}) => sitemaps(budget(signal)), page, scan });
}
