import { randomUUID } from "node:crypto";
import path from "node:path";
import { createLocalAiCache } from "./cache.mjs";
import { createLocalAiWorker } from "./worker.mjs";
import { createLocalAiService } from "./service.mjs";
import { createPageAuthoringInputs } from "./page-authoring-inputs.mjs";
import { sha256 } from "./files.mjs";
import { createWebsiteLanguageLoader, LANGUAGE_LIMITS } from "./language.mjs";
import { createAiImageNormalizer, createWebsiteAltAiImageLoader } from "../website-alt-ai-images.mjs";

const denied = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode, code: "local_ai_unavailable" });

/** Local desktop-only composition. Identifies callers from trusted app state. */
export function createExplorerLocalAiService({ cacheRoot, deviceId, repoRoot, websiteAltTexts, species,
  sharedProject = null, pageAuthoring = null, loadTextContext = async () => { throw denied("Textgrundlagen im Artseiteneditor bereitstellen."); },
  isTextBindingCurrent = async () => false, mode = "cpu", beforeStart = async () => {},
  cacheFactory = createLocalAiCache, workerFactory = createLocalAiWorker, serviceFactory = createLocalAiService,
  normalizer = createAiImageNormalizer({ repoRoot }), imageLoaderFactory = createWebsiteAltAiImageLoader } = {}) {
  if (!path.isAbsolute(cacheRoot || "") || !deviceId || !websiteAltTexts?.snapshot) throw new TypeError("Persönliche KI-Ablage und tatsächlicher Websitebestand sind erforderlich.");
  const sessionId = randomUUID(); let worker, ai, installing = null, installAbort = null, installOwner = null,
    closing = false, closePromise = null, installError = "", lastOwner = null;
  const cache = cacheFactory({ cacheRoot, isWorkerBusy: () => Boolean(worker?.status().busy || worker?.status().ownWorkerActive) });
  worker = workerFactory({ cache, mode, beforeStart });
  const images = imageLoaderFactory({ snapshot: () => websiteAltTexts.snapshot(), species, normalizer });
  const language = createWebsiteLanguageLoader({ snapshot: () => websiteAltTexts.snapshot() });
  const reader = pageAuthoring?.aiReader;
  const pageInputs = reader ? createPageAuthoringInputs({ readSnapshot: reader.readSnapshot, readImage: reader.readImage, normalizer, ownNormalizer: false }) : null;
  function effectiveOwner(shared) {
    if (shared?.status?.projectId) {
      const status = shared.status, permissions = shared.permissions || {};
      if (shared.busy || !status.baseUrl || !status.user?.id || !["admin", "publisher", "contributor", "reader"].includes(status.user.role)
        || !["online", "offline"].includes(status.connection) || !permissions.canRead) {
        throw denied("Bitte die gemeinsame Anmeldung und deine Bearbeitungsrechte prüfen.", 403);
      }
      const rights = Object.fromEntries(Object.keys(permissions).sort().map((key) => [key, permissions[key] === true]));
      const identity = { sessionId, origin: status.baseUrl, projectId: status.projectId, userId: status.user.id, role: status.user.role,
        userVersion: status.user.version ?? null, permissions: rights, readOnlySession: status.readOnlySession === true, connection: status.connection };
      return { id: `${sessionId}:${sha256(Buffer.from(JSON.stringify(identity)))}`, shared: true,
        canEdit: permissions.canEdit === true && status.readOnlySession !== true && ["admin", "publisher", "contributor"].includes(status.user.role) };
    }
    return { id: `${sessionId}:${sha256(Buffer.from(JSON.stringify({ sessionId, deviceId })))}`, shared: false, canEdit: true };
  }
  async function adoptOwner(next) {
    if (next === lastOwner) return;
    const previous = lastOwner; lastOwner = next;
    if (previous) await ai?.cancelOwner?.(previous);
  }
  async function owner({ requireWrite = false, requirePage = false } = {}) {
    const shared = await sharedProject?.snapshot();
    let captured;
    try { captured = effectiveOwner(shared); }
    catch (error) { if (!shared?.busy) await adoptOwner(null); throw error; }
    await adoptOwner(captured.id);
    if (closing) throw denied("Die lokale Bild-/Texthilfe wird geschlossen.");
    const fresh = effectiveOwner(await sharedProject?.snapshot());
    if (fresh.id !== captured.id) { await adoptOwner(null); throw denied("Die persönliche KI-Anmeldung wurde während der Anfrage geändert.", 403); }
    if (requireWrite && !fresh.canEdit || requirePage && (!fresh.shared || !fresh.canEdit)) throw denied("Bitte die gemeinsame Anmeldung und deine Bearbeitungsrechte prüfen.", 403);
    return fresh.id;
  }
  const isPage = (value) => value?.type === "page-authoring";
  function requirePageInputs() { if (!pageInputs) throw denied("Die lokale Artseitenhilfe ist auf diesem Gerät noch nicht angeschlossen."); return pageInputs; }
  ai = serviceFactory({ worker,
    async loadImage(request, context) {
      if (await owner({ requireWrite: true, requirePage: isPage(request) }) !== context.ownerId) throw denied("Die persönliche KI-Anmeldung wurde geändert.", 403);
      return isPage(request) ? requirePageInputs().loadImage(request, context) : images.loadImage(request, context);
    },
    async loadTextContext(request, context) {
      if (await owner({ requireWrite: true, requirePage: isPage(request) }) !== context.ownerId) throw denied("Die persönliche KI-Anmeldung wurde geändert.", 403);
      return isPage(request) ? requirePageInputs().loadTextContext(request, context)
        : request.type === "website-language" ? language.loadTextContext(request, context) : loadTextContext(request, context);
    },
    async isBindingCurrent(binding, context) {
      try {
        if (await owner({ requireWrite: true, requirePage: isPage(binding) }) !== context.ownerId) return false;
        const current = await (isPage(binding) ? requirePageInputs().isBindingCurrent(binding, context)
          : binding.type === "website-language" ? language.isBindingCurrent(binding, context)
            : binding.imageKey ? images.isBindingCurrent(binding) : isTextBindingCurrent(binding, context));
        return current === true && await owner({ requireWrite: true, requirePage: isPage(binding) }) === context.ownerId;
      } catch { return false; }
    } });
  async function startInstall(input) {
    if (input.confirmed !== true || closing || installing) throw denied("Modelldownload zuerst ausdrücklich bestätigen beziehungsweise den laufenden Abschluss abwarten.");
    const ownerId = await owner({ requireWrite: true });
    // Authentication may yield; reserve only after checking the actual current state again.
    if (closing || installing) throw denied("Bitte den laufenden Einrichtungsabschluss abwarten.");
    if (worker.status().ownWorkerActive || worker.status().busy) throw denied("Die lokale Bild-/Texthilfe arbeitet noch.");
    installAbort = new AbortController(); installOwner = ownerId; installError = "";
    const signal = installAbort.signal;
    installing = Promise.resolve().then(() => cache.download({ confirmed: true, signal }));
    installing.catch(() => { installError = "Die optionale Einrichtung wurde nicht abgeschlossen. Vorhandene Inhalte und Modellquellen bleiben erhalten."; })
      .finally(() => { installing = null; installAbort = null; installOwner = null; });
    return snapshot();
  }
  async function snapshot() {
    const ownerId = await owner(), work = ai.status(ownerId), workerState = work.worker;
    const cacheState = await cache.status();
    if (await owner() !== ownerId) throw denied("Die persönliche KI-Anmeldung wurde während der Statusanzeige geändert.", 403);
    const pageState = pageInputs?.blockingState();
    return { available: true, pageAuthoringAvailable: Boolean(pageInputs), languageReviewAvailable: true, languageReviewMaxFindings: LANGUAGE_LIMITS.findings,
      cache: cacheState, mode, installing: Boolean(installing), installError,
      busy: Boolean(installing || work.busy || work.queued || images.busy || language.busy || pageState?.busy || workerState.state === "close-blocked"),
      worker: { state: workerState.state, busy: workerState.busy, ownWorkerActive: workerState.ownWorkerActive,
        errorCode: workerState.errorCode }, jobs: work.jobs };
  }
  return {
    snapshot,
    async operation({ action, id, payload = {} }) {
      if (closing) throw denied("Die lokale Bild-/Texthilfe wird geschlossen.");
      if (action === "status") return snapshot();
      if (action === "download") return startInstall(payload);
      if (action === "cancel-download") {
        const ownerId = await owner();
        if (installing && installOwner !== ownerId) throw denied("Diese laufende Einrichtung gehört zu einer anderen Anmeldung.", 403);
        installAbort?.abort(); await installing?.catch(() => {}); return snapshot();
      }
      const page = payload?.type === "page-authoring" || action === "page-sources";
      const ownerId = await owner({ requireWrite: action.startsWith("suggest-") || ["review-text", "review-language", "page-sources"].includes(action), requirePage: page });
      if (action === "get") return ai.get(id, ownerId);
      if (action === "cancel") return ai.cancel(id, ownerId);
      // Never forward an owner from the renderer or arbitrary service methods.
      const { ownerId: ignoredOwner, ...input } = payload;
      if (ignoredOwner !== undefined) throw denied("Der KI-Auftrag darf keine fremde Anmeldung festlegen.", 400);
      if (action === "page-sources") {
        const result = await requirePageInputs().listSources(input);
        if (await owner({ requireWrite: true, requirePage: true }) !== ownerId) throw denied("Die persönliche KI-Anmeldung wurde während der Quellenanzeige geändert.", 403);
        return result;
      }
      if (page) requirePageInputs();
      if (action === "suggest-alt") return ai.suggestAltText({ ...input, ownerId });
      if (action === "suggest-text") return ai.suggestSourceText({ ...input, ownerId });
      if (action === "review-text") return ai.reviewText({ ...input, ownerId });
      if (action === "review-language") return ai.reviewLanguage({ ...input, ownerId });
      throw denied("Unbekannte lokale Bild-/Textaktion.", 404);
    },
    blockingState() {
      const work = worker.status();
      const page = pageInputs?.blockingState();
      return { busy: Boolean(installing || ai.status("").busy || images.busy || language.busy || page?.busy || work.ownWorkerActive || work.state === "close-blocked"),
        known: typeof work.busy === "boolean" && typeof work.ownWorkerActive === "boolean" && (!pageInputs || page?.known === true) };
    },
    close() {
      closing = true;
      closePromise ||= (async () => {
        installAbort?.abort(); await installing?.catch(() => {});
        try { await ai.close(); } finally {
          try { await pageInputs?.close(); } finally { try { await language.close(); } finally { try { await images.close(); } finally { await cache.close(); } } }
        }
      })();
      return closePromise;
    },
  };
}
