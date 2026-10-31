import { normalizeWebsitePageUrl } from "../website-alt-parser.mjs";
import { createHash } from "node:crypto";

/** Exactly the supplied species pages; no sitemap/link traversal, cookies or images. */
export async function captureSpeciesPages(selected, { fetchImpl = globalThis.fetch, concurrency = 4, timeoutMs = 20000 } = {}) {
  if (!(selected instanceof Map) || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error("Begrenzte ausdrückliche Seitenliste erforderlich.");
  const entries = [...selected], pages = new Map(), issues = [];
  let offset = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
    while (offset < entries.length) {
      const [slug, input] = entries[offset++], url = normalizeWebsitePageUrl(input), controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, { redirect: "manual", credentials: "omit", signal: controller.signal,
          headers: { Accept: "text/html", "User-Agent": "Arten-Explorer-ContentSnapshot/1" } });
        if (response.status !== 200 || response.headers.get("content-type")?.split(";")[0] !== "text/html") throw new Error("Keine erfolgreiche öffentliche HTML-Antwort.");
        if (response.url && normalizeWebsitePageUrl(response.url) !== url) throw new Error("Unerwartete Antwortadresse.");
        const reader = response.body.getReader(), chunks = []; let bytes = 0;
        try {
          while (true) {
            const { done, value } = await reader.read(); if (done) break;
            bytes += value.length; if (bytes > 4 * 1024 * 1024) throw new Error("Seite überschreitet die Parsergrenze.");
            chunks.push(value);
          }
        } finally { await reader.cancel().catch(() => {}); }
        const content = Buffer.concat(chunks), html = new TextDecoder("utf-8", { fatal: true }).decode(content);
        pages.set(slug, { url, html, rawBytes: content, checkedAt: new Date().toISOString(), status: 200, bytes,
          sha256: createHash("sha256").update(content).digest("hex"), freshness: "fresh-public-html" });
      } catch { issues.push({ code: "public-page-fetch-failed", blocking: true, slug, url }); }
      finally { clearTimeout(timer); }
    }
  }));
  return { pages, issues, requestedCount: entries.length, capturedCount: pages.size, concurrency };
}
