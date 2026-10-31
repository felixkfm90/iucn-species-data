import { randomUUID } from "node:crypto";
import path from "node:path";
import { createLocalAiCache } from "./cache.mjs";
import { createLocalAiWorker } from "./worker.mjs";
import { createLocalAiService } from "./service.mjs";
import { createAiImageNormalizer, createWebsiteAltAiImageLoader } from "../website-alt-ai-images.mjs";

const denied = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode, code: "local_ai_unavailable" });

/** Local desktop-only composition. Identifies callers from trusted app state. */
export function createExplorerLocalAiService({ cacheRoot, deviceId, repoRoot, websiteAltTexts, species,
  sharedProject = null, loadTextContext = async () => { throw denied("Textgrundlagen im Artseiteneditor bereitstellen."); },
  isTextBindingCurrent = async () => false, mode = "cpu", beforeStart = async () => {},
  cacheFactory = createLocalAiCache, workerFactory = createLocalAiWorker, serviceFactory = createLocalAiService,
  normalizer = createAiImageNormalizer({ repoRoot }), imageLoaderFactory = createWebsiteAltAiImageLoader } = {}) {
  if (!path.isAbsolute(cacheRoot || "") || !deviceId || !websiteAltTexts?.snapshot) throw new TypeError("Persönliche KI-Ablage und tatsächlicher Websitebestand sind erforderlich.");
  const sessionId = randomUUID(); let worker, installing = null, installAbort = null, installOwner = null,
    closing = false, closePromise = null, installError = "";
  const cache = cacheFactory({ cacheRoot, isWorkerBusy: () => Boolean(worker?.status().busy || worker?.status().ownWorkerActive) });
  worker = workerFactory({ cache, mode, beforeStart });
  const images = imageLoaderFactory({ snapshot: () => websiteAltTexts.snapshot(), species, normalizer });
  async function owner({ requireWrite = false } = {}) {
    const shared = await sharedProject?.snapshot();
    if (shared?.status?.projectId) {
      if (shared.busy || !shared.status.user || !shared.permissions?.canRead || requireWrite && !shared.permissions.canEdit) {
        throw denied("Bitte die gemeinsame Anmeldung und deine Bearbeitungsrechte prüfen.", 403);
      }
      return `${sessionId}:${shared.status.projectId}:${shared.status.user.id}`;
    }
    return `${sessionId}:${deviceId}`;
  }
  const ai = serviceFactory({ worker, loadImage: images.loadImage, loadTextContext,
    async isBindingCurrent(binding, context) {
      try {
        if (await owner({ requireWrite: true }) !== context.ownerId) return false;
        return binding.imageKey ? images.isBindingCurrent(binding) : isTextBindingCurrent(binding, context);
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
    return { available: true, cache: await cache.status(), mode, installing: Boolean(installing), installError,
      busy: Boolean(installing || work.busy || work.queued || images.busy || workerState.state === "close-blocked"),
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
      const ownerId = await owner({ requireWrite: action.startsWith("suggest-") || action === "review-text" });
      if (action === "get") return ai.get(id, ownerId);
      if (action === "cancel") return ai.cancel(id, ownerId);
      // Never forward an owner from the renderer or arbitrary service methods.
      const { ownerId: ignoredOwner, ...input } = payload;
      if (ignoredOwner !== undefined) throw denied("Der KI-Auftrag darf keine fremde Anmeldung festlegen.", 400);
      if (action === "suggest-alt") return ai.suggestAltText({ ...input, ownerId });
      if (action === "suggest-text") return ai.suggestSourceText({ ...input, ownerId });
      if (action === "review-text") return ai.reviewText({ ...input, ownerId });
      throw denied("Unbekannte lokale Bild-/Textaktion.", 404);
    },
    blockingState() {
      const work = worker.status();
      return { busy: Boolean(installing || ai.status("").busy || images.busy || work.ownWorkerActive || work.state === "close-blocked"),
        known: typeof work.busy === "boolean" && typeof work.ownWorkerActive === "boolean" };
    },
    close() {
      closing = true;
      closePromise ||= (async () => {
        installAbort?.abort(); await installing?.catch(() => {});
        try { await ai.close(); } finally { await images.close(); await cache.close(); }
      })();
      return closePromise;
    },
  };
}
