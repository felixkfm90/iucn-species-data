import { ProjectError } from "./errors.mjs";

export const ENRICHMENT_TRANSPORT_LIMITS = Object.freeze({
  jsonBytes: 4 * 1024 * 1024, imageBytes: 20 * 1024 * 1024, audioBytes: 50 * 1024 * 1024, timeoutMs: 30000,
});
const problem = (status, code, message) => new ProjectError(status, code, message);
const cancelled = () => problem(409, "species_enrichment_cancelled", "Die Artvorbereitung wurde abgebrochen.");
const timedOut = () => problem(408, "species_enrichment_timeout", "Ein Quellenabruf der Artvorbereitung hat die erlaubte Zeit überschritten.");
const changed = () => problem(409, "species_enrichment_changed", "Die Art- oder Benutzerbindung wurde während der Vorbereitung geändert.");
const tooLarge = () => problem(413, "species_enrichment_body_too_large", "Eine Quellenantwort überschreitet die erlaubte Dateigröße.");
const invalidResponse = () => problem(502, "invalid_species_enrichment_response", "Eine Quellenantwort konnte nicht vollständig gelesen werden.");
const failed = () => problem(502, "species_enrichment_transport_failed", "Ein Quellenabruf der Artvorbereitung ist fehlgeschlagen.");
const isSignal = value => value && typeof value.aborted === "boolean"
  && typeof value.addEventListener === "function" && typeof value.removeEventListener === "function";

function responseLimit(url, headers) {
  const pathname = url.pathname.toLowerCase(), type = (headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (/\/distribution_map\/jpe?g\/?$/.test(pathname)) return ENRICHMENT_TRANSPORT_LIMITS.imageBytes;
  if (type === "application/json" || type.endsWith("+json") || /^\/api\/v4\/(?:taxa(?:\/|$)|assessments?(?:\/|$))/.test(pathname)
      || /^\/api\/\d+\/recordings\/?$/.test(pathname) || pathname === "/w/api.php"
      || /^\/v\d+\/observations(?:\/|$)/.test(pathname)) return ENRICHMENT_TRANSPORT_LIMITS.jsonBytes;
  if (type === "image/jpeg" || /\.jpe?g$/.test(pathname)) return ENRICHMENT_TRANSPORT_LIMITS.imageBytes;
  return ENRICHMENT_TRANSPORT_LIMITS.audioBytes;
}

function cancelBody(body, reason) {
  try { void Promise.resolve(body?.cancel?.(reason)).catch(() => {}); } catch { /* the request signal also closes native fetch */ }
}

function bufferedResponse(response, bytes, headers, ensureAlive) {
  // The transport's private byte snapshot is never exposed through a shared
  // backing ArrayBuffer, including Node's small-buffer allocation pool.
  let offset = 0;
  const body = new ReadableStream({
    pull(controller) {
      try {
        ensureAlive();
        if (offset === bytes.length) { controller.close(); return; }
        const end = Math.min(bytes.length, offset + 64 * 1024);
        controller.enqueue(Uint8Array.from(bytes.subarray(offset, end))); offset = end;
      } catch (error) { controller.error(error); }
    },
  });
  return Object.freeze({
    ok: response.ok, status: response.status, statusText: response.statusText || "", url: response.url || "", headers, body,
    async arrayBuffer() { ensureAlive(); return Uint8Array.from(bytes).buffer; },
    async text() { ensureAlive(); return bytes.toString("utf8"); },
    async json() {
      ensureAlive();
      try { return JSON.parse(bytes.toString("utf8")); } catch { throw invalidResponse(); }
    },
  });
}

/** Read-only, bounded source transport. No paths, logs, retry or shared writes.
 * The caller owns the overall abort signal and actor/object checkpoint.
 * Response consumers receive independent snapshots, never the source stream. */
export function createEnrichmentFetch({ fetch, assertCurrent, signal, timeoutMs = ENRICHMENT_TRANSPORT_LIMITS.timeoutMs } = {}) {
  if (typeof fetch !== "function" || typeof assertCurrent !== "function"
      || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > ENRICHMENT_TRANSPORT_LIMITS.timeoutMs
      || signal !== undefined && !isSignal(signal)) {
    throw problem(400, "invalid_species_enrichment_transport", "Der Quellenabruf benötigt eine feste Bindungsprüfung und begrenzte Transportoptionen.");
  }
  return async function boundFetch(url, options = {}) {
    if (!options || typeof options !== "object" || options.signal !== undefined && options.signal !== null && !isSignal(options.signal)) {
      throw problem(400, "invalid_species_enrichment_transport", "Die Transportoptionen der Artvorbereitung sind ungültig.");
    }
    let parsed;
    try { parsed = new URL(url); } catch { throw invalidResponse(); }
    const external = [...new Set([signal, options.signal].filter(Boolean))], controller = new AbortController();
    let failure = null, rejectStopped, response, reader;
    const stopped = new Promise((_, reject) => { rejectStopped = reject; });
    // A signal can already be aborted before the first race is installed.
    void stopped.catch(() => {});
    const stop = error => {
      if (failure) return;
      failure = error; controller.abort(error); rejectStopped(error);
    };
    const onAbort = () => stop(cancelled());
    for (const source of external) source.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => stop(timedOut()), timeoutMs);
    const race = async operation => {
      if (failure) throw failure;
      return Promise.race([Promise.resolve().then(operation), stopped]);
    };
    const checkpoint = async () => {
      let current;
      try { current = await race(assertCurrent); }
      catch { if (!failure) stop(changed()); throw failure; }
      if (current !== true) stop(changed());
      if (failure) throw failure;
    };
    try {
      if (external.some(source => source.aborted)) stop(cancelled());
      await checkpoint();
      response = await race(async () => {
        const received = await fetch(url, { ...options, signal: controller.signal });
        // A mock or unusual transport may resolve after ignoring cancellation.
        // Its late response is still relinquished rather than left unread.
        if (failure) { cancelBody(received?.body, failure); throw failure; }
        return received;
      });
      await checkpoint();
      if (!response || typeof response.status !== "number" || typeof response.ok !== "boolean" || !response.headers) throw invalidResponse();
      let headers;
      try { headers = new Headers(response.headers); } catch { throw invalidResponse(); }
      const limit = responseLimit(parsed, headers), length = headers.get("content-length");
      if (length !== null) {
        if (!/^[0-9]+$/.test(length)) throw invalidResponse();
        if (BigInt(length) > BigInt(limit)) throw tooLarge();
      }
      const chunks = []; let total = 0;
      if (String(options.method || "GET").toUpperCase() !== "HEAD" && response.body !== null && response.body !== undefined) {
        if (typeof response.body.getReader !== "function") throw invalidResponse();
        reader = response.body.getReader();
        for (;;) {
          await checkpoint();
          const part = await race(() => reader.read());
          await checkpoint();
          if (!part || typeof part.done !== "boolean") throw invalidResponse();
          if (part.done) break;
          if (!(part.value instanceof Uint8Array)) throw invalidResponse();
          if (part.value.byteLength > limit - total) throw tooLarge();
          total += part.value.byteLength; chunks.push(Buffer.from(part.value));
        }
      }
      await checkpoint();
      const bytes = Buffer.concat(chunks, total);
      const ensureAlive = () => { if (external.some(source => source.aborted)) throw cancelled(); };
      return bufferedResponse(response, bytes, headers, ensureAlive);
    } catch (error) {
      const known = error instanceof ProjectError && ["species_enrichment_changed", "species_enrichment_cancelled", "species_enrichment_timeout",
        "species_enrichment_body_too_large", "invalid_species_enrichment_response"].includes(error.code);
      if (!failure) stop(known ? error : failed());
      throw failure;
    } finally {
      clearTimeout(timer);
      for (const source of external) source.removeEventListener("abort", onAbort);
      // Never await an uncooperative source's cancel promise beyond our own
      // deadline. Native fetch is also aborted on failure; release our lock
      // even if the underlying test/provider ignores the signal or cancel.
      if (reader) {
        try { void Promise.resolve(reader.cancel(failure)).catch(() => {}); } catch { /* still release the lock */ }
        try { reader.releaseLock(); } catch { /* a cancelled reader may already be released */ }
      } else cancelBody(response?.body, failure);
    }
  };
}
