import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { normalizeWebsiteImageUrl, normalizeWebsitePageUrl } from "./website-alt-parser.mjs";
import { coupledWebsiteAltCaption } from "./website-alt-policy.mjs";
import { inspectJpeg, inspectPng, inspectWebp } from "./media-assets.mjs";
import { resolveFfmpegPath } from "../scripts/spectrogram-renderer.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const blocked = (message) => Object.assign(new Error(message), { statusCode: 409, code: "image_binding_changed" });
const abortError = () => Object.assign(new Error("Die lokale Bildvorbereitung wurde abgebrochen."), { name: "AbortError" });

function imageInfo(bytes) {
  let info, mimeType;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) { info = inspectJpeg(bytes); mimeType = "image/jpeg"; }
  else if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) { info = inspectPng(bytes); mimeType = "image/png"; }
  else if (bytes.subarray(0, 4).toString() === "RIFF") { info = inspectWebp(bytes); mimeType = "image/webp"; }
  if (!info || !Number.isInteger(info.width) || !Number.isInteger(info.height) || info.width < 1 || info.height < 1
    || info.width > 20000 || info.height > 20000 || info.width * info.height > 40_000_000) {
    throw new Error("Das Bildformat oder seine Abmessungen werden nicht sicher unterstützt.");
  }
  return { ...info, mimeType };
}

export function createAiImageNormalizer({ repoRoot, spawnImpl = spawn, timeoutMs = 15000, maxOutputBytes = 5 * 1024 * 1024 } = {}) {
  const children = new Set();
  let closing = false;
  const normalize = (bytes, { signal } = {}) => {
    if (closing || signal?.aborted) return Promise.reject(abortError());
    imageInfo(bytes);
    return new Promise((resolve, reject) => {
      const command = resolveFfmpegPath({ repoRoot });
      const child = spawnImpl(command, ["-hide_banner", "-loglevel", "error", "-nostdin", "-protocol_whitelist", "pipe",
        "-threads", "1", "-i", "pipe:0", "-vf", "scale=w='min(1400,iw)':h='min(1400,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-frames:v", "1", "-threads", "1", "-q:v", "3", "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1"],
      { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      const output = []; let bytesRead = 0, failure = null, done = false;
      const stop = () => {
        failure ||= abortError(); child.stdin?.destroy(); child.kill("SIGTERM");
      };
      const task = { child, stop, promise: null };
      let resolveClose;
      task.promise = new Promise((resolve) => { resolveClose = resolve; });
      children.add(task);
      const timeout = setTimeout(() => { failure = new Error("Die Bildvorbereitung hat ihre Zeitgrenze erreicht."); stop(); }, timeoutMs);
      const cleanup = () => { clearTimeout(timeout); signal?.removeEventListener("abort", stop); children.delete(task); };
      child.stdout?.on("data", (chunk) => {
        bytesRead += chunk.length;
        if (bytesRead > maxOutputBytes) { failure = new Error("Das vorbereitete Bild überschreitet seine Größengrenze."); stop(); }
        else output.push(chunk);
      });
      child.stderr?.resume();
      child.stdin?.on("error", () => {}); // Actual process close is the completion boundary.
      child.once("error", () => {
        failure = new Error("Die lokale Bildvorbereitung konnte nicht sicher abgeschlossen werden.");
        // A failed stop is not proof that a successfully spawned child exited.
        if (child.pid && child.exitCode === null && child.signalCode === null) return;
        if (!done) { done = true; cleanup(); reject(failure); }
      });
      child.once("close", (code) => {
        resolveClose();
        if (done) return; done = true; cleanup();
        if (failure || code !== 0) { reject(failure || new Error("Das Bild konnte nicht gelesen werden.")); return; }
        try {
          const result = Buffer.concat(output), info = imageInfo(result);
          if (info.mimeType !== "image/jpeg" || info.width > 1400 || info.height > 1400) throw new Error("Keine begrenzte JPEG-Vorschau erzeugt.");
          resolve({ bytes: result, mimeType: "image/jpeg" });
        } catch (error) { reject(error); }
      });
      signal?.addEventListener("abort", stop, { once: true });
      if (!child.stdin || !child.stdout || !child.stderr) {
        failure = new Error("Die Bildvorbereitung besitzt keine vollständigen privaten Datenkanäle."); stop();
      } else if (signal?.aborted) stop(); else child.stdin.end(bytes);
    });
  };
  return { normalize, get busy() { return children.size > 0; }, async close() {
    closing = true;
    const active = [...children]; for (const task of active) task.stop();
    await Promise.all(active.map((task) => task.promise));
  } };
}

export function createWebsiteAltAiImageLoader({ snapshot, species = () => [], fetchImpl = globalThis.fetch,
  normalizer, timeoutMs = 20000, maxBytes = 8 * 1024 * 1024 } = {}) {
  if (typeof snapshot !== "function" || typeof normalizer?.normalize !== "function" || typeof normalizer.close !== "function") throw new TypeError("Inventar und begrenzte lokale Bildvorbereitung sind erforderlich.");
  const operations = new Set(); let closed = false;
  async function binding(input) {
    const pageUrl = normalizeWebsitePageUrl(input.pageUrl);
    const document = await snapshot(), page = document.pages?.find((entry) => entry.url === pageUrl);
    const image = page?.images.find((entry) => entry.key === (input.imageKey || input.imageId));
    const revision = input.observationHash || input.revision;
    if (!page || page.error || page.inventoryStatus !== "current" || !image || image.status === "removed"
      || !/^[a-f0-9]{64}$/.test(revision || "") || image.observationHash !== revision) throw blocked("Die Bildgrundlage ist nicht mehr aktuell. Bitte die Seite erneut prüfen.");
    return { pageUrl, page, image, revision };
  }
  async function isBindingCurrent(input) {
    if (closed) return false;
    try { await binding(input); return !closed; } catch { return false; }
  }
  async function loadImage(input, { signal } = {}) {
    if (closed || signal?.aborted) throw abortError();
    const current = await binding(input);
    if (closed || signal?.aborted) throw abortError();
    if (current.image.context !== "content" || current.image.kind !== "image") throw blocked("Für diese Logo- oder Hintergrundverwendung ist kein Bildvorschlag erforderlich.");
    const controller = new AbortController();
    const task = { controller, promise: null }; operations.add(task);
    const combined = signal ? AbortSignal.any([signal, controller.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]);
    task.promise = (async () => {
      let url = normalizeWebsiteImageUrl(current.image.previewSrc || current.image.src), response;
      for (let redirects = 0; redirects < 4; redirects++) {
        response = await fetchImpl(url, { redirect: "manual", credentials: "omit", signal: combined,
          headers: { Accept: "image/jpeg,image/png,image/webp;q=0.9" } });
        if (response.status >= 300 && response.status < 400) {
          const next = response.headers.get("location"); await response.body?.cancel();
          if (!next || redirects === 3) throw new Error("Die Bildquelle konnte nicht eindeutig erreicht werden.");
          url = normalizeWebsiteImageUrl(new URL(next, url).href); continue;
        }
        break;
      }
      if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error("Das vorhandene Websitebild ist derzeit nicht lesbar."); }
      const declared = response.headers.get("content-length");
      if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) { await response.body.cancel(); throw new Error("Das Websitebild überschreitet seine Größengrenze."); }
      const reader = response.body.getReader(), chunks = []; let length = 0;
      const cancel = () => { void reader.cancel().catch(() => {}); };
      combined.addEventListener("abort", cancel, { once: true });
      try {
        if (combined.aborted) throw abortError();
        while (true) {
          const item = await reader.read();
          if (combined.aborted) throw abortError();
          if (item.done) break;
          length += item.value.length;
          if (length > maxBytes) throw new Error("Das Websitebild überschreitet seine Größengrenze.");
          chunks.push(Buffer.from(item.value));
        }
      } finally { combined.removeEventListener("abort", cancel); await reader.cancel().catch(() => {}); }
      const bytes = Buffer.concat(chunks); imageInfo(bytes);
      const prepared = await normalizer.normalize(bytes, { signal: combined });
      if (combined.aborted || closed) throw abortError();
      if (!Buffer.isBuffer(prepared?.bytes) || prepared.bytes.length > maxBytes) throw new Error("Keine gültige begrenzte Bildvorbereitung.");
      const preparedInfo = imageInfo(prepared.bytes);
      if (preparedInfo.mimeType !== "image/jpeg") throw new Error("Das Modell benötigt eine geprüfte JPEG-Vorschau.");
      if (!await isBindingCurrent(input)) throw blocked("Die Bildgrundlage wurde während der Vorbereitung geändert. Der Vorschlag wird nicht gestartet.");
      const pathname = new URL(current.pageUrl).pathname;
      const art = species().find((entry) => entry.id === pathname.split("/").at(-1));
      const pageType = /^\/reisen\/\d{4}-[^/]+\/.+/.test(pathname) ? "travel-detail"
        : /^\/reisen\/\d{4}-[^/]+$/.test(pathname) ? "travel-overview" : art ? "species" : "other";
      return { bytes: prepared.bytes, mimeType: "image/jpeg", sha256: hash(prepared.bytes), sourceSha256: hash(bytes),
        revision: current.revision, imageId: current.image.key, pageUrl: current.pageUrl,
        context: { title: current.page.title, pageType, ...(art ? { commonName: art.germanName } : {}),
          coupledCaption: coupledWebsiteAltCaption(current.pageUrl, current.image) } };
    })();
    try { return await task.promise; } finally { operations.delete(task); }
  }
  return { loadImage, isBindingCurrent, get busy() { return Boolean(operations.size > 0 || normalizer.busy); }, async close() {
    closed = true; const active = [...operations]; for (const task of active) task.controller.abort();
    try { await normalizer.close(); } finally { await Promise.allSettled(active.map((task) => task.promise)); }
  } };
}
