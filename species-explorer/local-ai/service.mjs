import { randomUUID } from "node:crypto";
import { aiError, clone, sha256 } from "./files.mjs";
import { bindImageInput, bindTextInput, bindLanguageInput, buildContentRequest, validateContentResponse } from "./content.mjs";
import { normalizeWebsitePageUrl } from "../website-alt-parser.mjs";
import { websiteLanguageRequest } from "./language.mjs";

const KINDS = new Set(["alt-text", "source-text", "review-text", "review-language"]);
const terminal = (state) => ["completed", "cancelled", "failed", "stale"].includes(state);
const identity = (value) => typeof value === "string" && value.length > 0 && value.length <= 160 && !/[\x00-\x1f]/.test(value);
const pageId = (value) => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value);
const hash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function pageRequest(kind, request) {
  const sourced = ["source-text", "review-text"].includes(kind);
  const keys = ["type", "sourceScope", "draftId", "expectedRevision", ...(kind === "alt-text" ? ["imageId"] : ["sectionId"]), ...(sourced ? ["sourceIds", "expectedSourcesRevision"] : [])];
  if (request.type !== "page-authoring" || Object.keys(request).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(request, key))
    || !hash(request.sourceScope) || !hash(request.expectedRevision) || !pageId(request.draftId)
    || kind === "alt-text" && !pageId(request.imageId) || kind !== "alt-text" && !pageId(request.sectionId)
    || sourced && (!hash(request.expectedSourcesRevision) || !Array.isArray(request.sourceIds) || request.sourceIds.length > 20 || new Set(request.sourceIds).size !== request.sourceIds.length
      || request.sourceIds.some((id) => typeof id !== "string" || !/^source-[a-f0-9]{64}$/.test(id)))) {
    throw aiError("Artseitenaufträge benötigen ihre exakten Kennungen, Fassung und ausdrückliche Quellenwahl; freie Texte oder Adressen sind nicht erlaubt.");
  }
}

export function createLocalAiService({ worker, loadImage, loadTextContext, isBindingCurrent,
  maxQueued = 3, maxRetained = 20, requestTimeoutMs = 180_000, idleTimeoutMs = 60_000,
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (!worker?.complete || !worker?.stop || !worker?.close || typeof loadImage !== "function" || typeof loadTextContext !== "function"
    || typeof isBindingCurrent !== "function" || !Number.isInteger(maxQueued) || maxQueued < 1 || maxQueued > 4
    || !Number.isInteger(maxRetained) || maxRetained < maxQueued || maxRetained > 100) throw new TypeError("Eigener KI-Worker und vertrauenswürdige serverseitige Bild-/Textbindungen sind erforderlich.");
  const jobs = new Map(), requests = new Map(), queue = [];
  let running = null, drainTask = null, closed = false, idleTimer = null, closePromise = null;
  function publicJob(job) {
    return clone({ jobId: job.id, requestId: job.requestId, kind: job.kind, status: job.status, error: job.error || "", result: job.result || null,
      createdAt: job.createdAt, completedAt: job.completedAt || null, approved: false, transferred: false });
  }
  function owned(jobId, ownerId) {
    const job = jobs.get(jobId);
    if (!job || job.ownerId !== ownerId) throw aiError("Dieser lokale KI-Auftrag gehört nicht zur aktuellen Anmeldung.");
    return job;
  }
  function idle() {
    if (closed || queue.length || running || idleTimer) return;
    idleTimer = setTimer(() => { idleTimer = null; void worker.stop().catch(() => {}); }, idleTimeoutMs);
    idleTimer?.unref?.();
  }
  async function process(job) {
    const signal = AbortSignal.any([job.abort.signal, AbortSignal.timeout(requestTimeoutMs)]);
    job.status = "running";
    try {
      signal.throwIfAborted();
      const raw = job.kind === "alt-text" ? await loadImage(clone(job.request), { signal, ownerId: job.ownerId })
        : await loadTextContext(clone(job.request), { signal, ownerId: job.ownerId, kind: job.kind });
      signal.throwIfAborted();
      const input = job.kind === "alt-text" ? bindImageInput(raw) : job.kind === "review-language" ? bindLanguageInput(raw) : bindTextInput({ ...raw,
        ...(job.kind === "review-text" && typeof job.request.draft === "string" ? { draft: job.request.draft } : {}) }, job.kind);
      const page = job.request.type === "page-authoring";
      let matches;
      if (page) {
        matches = input.binding.type === "page-authoring" && input.binding.kind === job.kind && input.binding.sourceScope === job.request.sourceScope
          && input.binding.documentId === job.request.draftId && input.binding.revision === job.request.expectedRevision
          && (job.kind === "alt-text" ? input.binding.imageId === job.request.imageId : input.target.sectionId === job.request.sectionId
            && (job.kind === "review-language" || input.binding.sourceCatalogRevision === job.request.expectedSourcesRevision && JSON.stringify(input.binding.sourceIds) === JSON.stringify(job.request.sourceIds)));
      } else if (job.request.type === "website-language") {
        matches = job.kind === "review-language" && input.binding.type === "website-language" && input.binding.pageUrl === job.request.pageUrl
          && input.binding.imageKey === job.request.imageKey && input.binding.observationHash === job.request.observationHash && input.draft === job.request.draftText;
      } else {
        matches = !["page-authoring", "website-language"].includes(input.binding.type) && (job.kind === "alt-text"
          ? (!job.request.imageKey || job.request.imageKey === input.binding.imageKey)
            && (!job.request.pageUrl || normalizeWebsitePageUrl(job.request.pageUrl) === normalizeWebsitePageUrl(input.binding.pageUrl))
            && (!job.request.observationHash || job.request.observationHash === input.binding.revision)
          : (!job.request.documentId || job.request.documentId === input.binding.documentId) && (!job.request.sectionId || job.request.sectionId === input.target.sectionId)
            && (!job.request.draftRevision || job.request.draftRevision === input.binding.revision));
      }
      if (!matches) throw aiError("Die geladene Bild-/Textgrundlage passt nicht zum angeforderten Element.");
      const current = async () => {
        signal.throwIfAborted(); const same = await isBindingCurrent(clone(input.binding), { ownerId: job.ownerId, signal }); signal.throwIfAborted();
        if (same === true) return true;
        job.status = "stale"; job.result = null; job.error = "Bild- oder Textgrundlage wurde inzwischen verändert. Kein Entwurf wurde übernommen."; return false;
      };
      if (!await current()) return;
      let result;
      if (job.kind !== "alt-text" && input.target.intentionallyEmpty) {
        result = { kind: job.kind, status: "intentionally-empty", approved: false, transferred: false, humanReviewRequired: true,
          factualGuarantee: false, binding: input.binding, message: "Dieser Abschnitt bleibt bewusst leer. Es wurde kein Text erzeugt." };
      } else if (job.kind === "review-language" && !input.draft.trim()) {
        result = { kind: job.kind, status: "empty-text", approved: false, transferred: false, humanReviewRequired: true,
          factualGuarantee: false, binding: input.binding, message: "Der Text ist leer. Es wurde kein Modell zur Sprachprüfung aufgerufen." };
      } else if (!["alt-text", "review-language"].includes(job.kind) && (!input.sources.length || job.kind === "review-text" && !input.draft)) {
        result = { kind: job.kind, status: "missing-source", approved: false, transferred: false, humanReviewRequired: true,
          factualGuarantee: false, binding: input.binding, message: "Keine ausreichende bereitgestellte Textgrundlage. Es wurde keine Fachprosa erfunden." };
      } else {
        const response = await worker.complete(buildContentRequest(job.kind, input), { signal });
        signal.throwIfAborted();
        result = validateContentResponse(job.kind, response, input);
      }
      if (job.kind === "review-language" && result.status !== "proposal") Object.assign(result, { languageGuarantee: false, originalText: input.draft, correctedText: input.draft, findings: [], scope: "provided-text-language-only" });
      if (!await current()) return;
      signal.throwIfAborted(); job.result = result; job.status = "completed";
    } catch (error) {
      job.status = signal.aborted ? "cancelled" : "failed";
      job.error = signal.aborted ? "Lokaler KI-Auftrag abgebrochen oder Zeitlimit erreicht." : error.code === "LOCAL_AI_NOT_INSTALLED"
        ? "Die optionale lokale KI muss zuerst eingerichtet werden." : error.code === "LOCAL_AI_LANGUAGE_INCONSISTENT"
          ? "Die Sprachprüfung hat eine widersprüchliche Korrektur geliefert. Der ursprüngliche Text bleibt erhalten; es wurde nichts übernommen."
          : "Der lokale KI-Vorschlag konnte nicht sicher erstellt werden. Die vorhandenen Texte bleiben erhalten.";
      job.result = null;
    } finally { job.completedAt = new Date().toISOString(); }
  }
  function drain() {
    if (drainTask || closed) return;
    drainTask = (async () => {
      while (!closed && queue.length) {
        const job = queue.shift();
        if (job.abort.signal.aborted) { job.status = "cancelled"; job.completedAt = new Date().toISOString(); continue; }
        running = job;
        await process(job);
        running = null;
        if (worker.status?.().state === "close-blocked") break;
      }
    })().finally(() => { drainTask = null; running = null; idle(); });
  }
  const api = {
    suggestAltText(request) { return api.start({ ...request, kind: "alt-text" }); },
    suggestSourceText(request) { return api.start({ ...request, kind: "source-text" }); },
    reviewText(request) { return api.start({ ...request, kind: "review-text" }); },
    reviewLanguage(request) { return api.start({ ...request, kind: "review-language" }); },
    start({ kind, ownerId, requestId = randomUUID(), ...request } = {}) {
      if (closed || !KINDS.has(kind) || !identity(ownerId) || !identity(requestId)) throw aiError("Ungültiger lokaler KI-Auftrag.");
      if (request.type === "page-authoring") pageRequest(kind, request);
      else if (kind === "review-language") websiteLanguageRequest(request);
      else {
        if (kind === "alt-text" ? !identity(request.imageKey) : !identity(request.documentId) || !identity(request.sectionId)) throw aiError("Der konkrete Bild- oder Textabschnitt muss gebunden sein.");
        // The HTTP layer may supply identifiers, never filesystem paths, URLs to fetch or model endpoints.
        if (Object.keys(request).some((key) => !["pageUrl", "imageKey", "observationHash", "documentId", "sectionId", "draftRevision", ...(kind === "review-text" ? ["draft"] : [])].includes(key))
          || Object.entries(request).some(([key, value]) => typeof value !== "string" || !value && key !== "draft"
            || (key === "draft" ? /[\x00-\x08\x0b\x0c\x0e-\x1f]/ : /[\x00-\x1f]/).test(value)
            || value.length > (key === "draft" ? 8000 : key === "pageUrl" ? 2000 : 200))) throw aiError("Nur gebundene Bild-/Abschnittskennungen und ein begrenzter Prüfentwurf sind als KI-Eingang erlaubt.");
      }
      const admitted = clone(request), fingerprint = sha256(Buffer.from(JSON.stringify({ kind, request: admitted }))), requestKey = `${ownerId}\0${requestId}`;
      const oldId = requests.get(requestKey);
      if (oldId) { const old = jobs.get(oldId); if (old.fingerprint !== fingerprint) throw aiError("Diese KI-Anfrage wurde bereits anders verwendet."); return publicJob(old); }
      if (queue.length + Number(Boolean(running)) >= maxQueued) throw aiError("Die lokale KI-Warteschlange ist voll. Bitte den laufenden Vorschlag abwarten.");
      if (idleTimer) clearTimer(idleTimer); idleTimer = null;
      for (const [id, job] of jobs) {
        if (jobs.size < maxRetained) break;
        if (terminal(job.status)) { jobs.delete(id); requests.delete(`${job.ownerId}\0${job.requestId}`); }
      }
      const job = { id: randomUUID(), kind, ownerId, requestId, request: admitted, fingerprint, status: "queued", result: null, error: "", abort: new AbortController(), createdAt: new Date().toISOString() };
      jobs.set(job.id, job); requests.set(requestKey, job.id); queue.push(job); drain();
      return publicJob(job);
    },
    get(jobId, ownerId) { return publicJob(owned(jobId, ownerId)); },
    status(ownerId) { return { busy: Boolean(running), queued: queue.filter((job) => job.ownerId === ownerId).length,
      worker: worker.status?.() || { state: "unknown" }, jobs: [...jobs.values()].filter((job) => job.ownerId === ownerId).map(publicJob) }; },
    async cancel(jobId, ownerId) {
      const job = owned(jobId, ownerId);
      if (!terminal(job.status)) {
        job.abort.abort();
        if (running === job) await worker.stop();
        if (job.status === "queued") {
          const index = queue.indexOf(job); if (index >= 0) queue.splice(index, 1);
          job.status = "cancelled"; job.completedAt = new Date().toISOString();
        }
      }
      return publicJob(job);
    },
    // Node-only invalidation of this facade's previous effective owner. Never routed from a renderer owner ID.
    async cancelOwner(ownerId) {
      for (const job of jobs.values()) if (job.ownerId === ownerId && !terminal(job.status)) await api.cancel(job.id, ownerId);
    },
    close() {
      if (!closePromise) {
        closed = true;
        if (idleTimer) clearTimer(idleTimer); idleTimer = null;
        for (const job of jobs.values()) if (!terminal(job.status)) job.abort.abort();
        closePromise = (async () => {
          try { await worker.close(); } finally {
            if (drainTask) await drainTask;
            for (const job of queue.splice(0)) { job.status = "cancelled"; job.completedAt = new Date().toISOString(); }
          }
        })();
      }
      return closePromise;
    },
  };
  return api;
}
