import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { atomicWriteJson } from "./taxonomy-storage.mjs";
import { catalogUsageRegistration, catalogUsageStatus, createCatalogUsageService } from "./lightroom-catalog-usage.mjs";
import { withTaxonomyCorrectionLock } from "./taxonomy-correction-lock.mjs";

const requestPath = (root) => path.join(root, "catalog-usage", "update-request.json");
const hash = (body) => crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
const key = (filename) => process.platform === "win32" ? filename.toLowerCase() : filename;
async function read(file) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
function checked(document) {
  if (!document) return null;
  const { revision, ...body } = document;
  if (revision !== hash(body) || body.schemaVersion !== 1 || !/^capture-request-[a-f0-9-]{36}$/.test(body.requestId)
    || !/^update-[a-f0-9-]{36}$/.test(body.updateRunId) || !/^[a-f0-9]{64}$/.test(body.baseRegistryRevision)
    || !Array.isArray(body.catalogs) || !body.catalogs.length || body.catalogs.length > 100
    || body.catalogs.some((filename) => !path.isAbsolute(filename) || !/\.lrcat$/i.test(filename))
    || new Set(body.catalogs.map(key)).size !== body.catalogs.length
    || body.agreement?.allCatalogsConfirmed !== true || body.agreement?.noChangesUntilClose !== true
    || body.captureRevision !== bindingRevision(body)
    || !Number.isFinite(Date.parse(body.createdAt)) || !["pending", "paused", "completed", "cancelled"].includes(body.status)) {
    throw new Error("Der gespeicherte Auftrag zur FN-Nutzungserfassung ist ungültig.");
  }
  return document;
}
function bindingRevision(document) {
  return hash({ requestId: document.requestId, updateRunId: document.updateRunId,
    baseRegistryRevision: document.baseRegistryRevision, catalogs: document.catalogs,
    agreement: document.agreement, createdAt: document.createdAt });
}
async function write(root, body) {
  const { revision: ignored, ...value } = body;
  value.captureRevision = bindingRevision(value);
  const document = { ...value, revision: hash(value) };
  await atomicWriteJson(requestPath(root), document);
  return document;
}

// A new SDK receipt is required for this exact prospective start agreement.
// This agreement is explicit user testimony, NOT a catalog-change observer.
export async function catalogUsageRequest(root, { catalogPath, captureRequestId = "", requestRevision = "" } = {}) {
  const request = checked(await read(requestPath(root)));
  if (!request || request.status !== "pending") return { required: false };
  if (!path.isAbsolute(catalogPath || "") || !request.catalogs.some((entry) => key(entry) === key(path.resolve(catalogPath)))) {
    throw new Error("Dieser Lightroom-Katalog gehört nicht zur bestätigten FN-Katalogmenge. Der Updateauftrag bleibt gesperrt.");
  }
  const binding = bindingRevision(request);
  if (captureRequestId && captureRequestId !== request.requestId || requestRevision && requestRevision !== binding) {
    throw new Error("Der Auftrag zur FN-Nutzungserfassung wurde inzwischen geändert.");
  }
  const registry = await catalogUsageRegistration(root);
  if (!registry || registry.revision !== request.baseRegistryRevision) throw new Error("Der bestätigte FN-Katalogsatz wurde inzwischen geändert.");
  const captures = await read(path.join(root, "catalog-usage", "captures.json"));
  const existing = captures?.entries?.find((entry) => key(entry.catalogPath) === key(catalogPath));
  return { required: existing?.captureRequestId !== request.requestId || existing?.requestRevision !== binding,
    requestId: request.requestId, requestRevision: binding, updateRunId: request.updateRunId };
}

export async function validateCatalogUsageCaptureRequest(root, input) {
  const value = await catalogUsageRequest(root, input);
  if (!value.required || !input.captureRequestId || input.captureRequestId !== value.requestId
    || input.requestRevision !== value.requestRevision) throw new Error("Keine unveränderte offene FN-Erfassungsanforderung; alte oder doppelte Quittung nicht übernehmen.");
  return { captureRequestId: value.requestId, requestRevision: value.requestRevision };
}

export async function reportCatalogUsageRequestError(root, input) {
  return withTaxonomyCorrectionLock(root, async () => {
    const request = checked(await read(requestPath(root)));
    if (!request || request.status !== "pending" || input.captureRequestId !== request.requestId
      || input.requestRevision !== bindingRevision(request)) throw new Error("Keine unverändert offene FN-Erfassungsanforderung.");
    await write(root, { ...request, status: "paused", captureError: String(input.message || "FN-Erfassung fehlgeschlagen").slice(0, 1024) });
    return { saved: true, changesPhotos: false };
  });
}

export function createLightroomUsageRequestService({ taxonomyRoot: root, now = () => new Date() } = {}) {
  async function status(updateRunId) {
    const request = checked(await read(requestPath(root)));
    if (!request || request.updateRunId !== updateRunId) return { exists: false, ready: false };
    const registration = await catalogUsageRegistration(root);
    if (!registration) throw new Error("Die bestätigte FN-Katalogmenge fehlt.");
    const captures = await read(path.join(root, "catalog-usage", "captures.json"));
    const known = new Set(request.catalogs.map(key));
    if (captures?.entries?.some((entry) => !known.has(key(entry.catalogPath)))) throw new Error("Ein weiterer FN-Katalog wurde erfasst. Bitte die vollständige Katalogmenge erneut bestätigen.");
    const binding = bindingRevision(request);
    const receipts = request.catalogs.map((filename) => captures?.entries?.find((entry) => key(entry.catalogPath) === key(filename)));
    const ready = receipts.every((receipt) => receipt?.captureRequestId === request.requestId && receipt.requestRevision === binding
      && Date.parse(receipt.capturedAt) >= Date.parse(request.createdAt));
    const alreadyRegistered = ready && registration.catalogs.every((catalog) => receipts.some((receipt) => receipt.captureId === catalog.captureId));
    if (registration.revision !== request.baseRegistryRevision && !alreadyRegistered) throw new Error("Der FN-Nutzungsstand wurde außerhalb des Updateauftrags verändert.");
    return { exists: true, ready, request, alreadyRegistered, capturedCatalogCount: receipts.filter((receipt) => receipt?.captureRequestId === request.requestId).length };
  }
  return {
    async prepare(job) {
      if (job.usageConsent?.allCatalogsConfirmed !== true || job.usageConsent?.noChangesUntilClose !== true) {
        throw new Error("Der gespeicherte Update-Start benötigt die einmalige Bestätigung aller FN-Kataloge und unveränderter FN-Daten bis zum Schließen.");
      }
      const proof = await catalogUsageStatus(root);
      // An unchanged closed catalog already has a genuine current receipt.
      if (proof.ready) return { requested: false };
      return withTaxonomyCorrectionLock(root, async () => {
        const registry = await catalogUsageRegistration(root);
        if (!registry) throw new Error("Die vollständige FN-Katalogmenge muss einmalig registriert werden. Unbekannte Kataloge werden nicht als leer behandelt.");
        const previous = checked(await read(requestPath(root)));
        if (!job.renewUsageRequest && previous?.updateRunId === job.updateRunId && previous.status === "pending") {
          return { requested: true, requestId: previous.requestId };
        }
        const document = await write(root, { schemaVersion: 1, requestId: `capture-request-${crypto.randomUUID()}`,
          updateRunId: job.updateRunId, baseRegistryRevision: registry.revision,
          catalogs: registry.catalogs.map((entry) => entry.catalogPath), status: "pending",
          agreement: { ...job.usageConsent, type: "prospective-user-agreement", confirmedAt: job.startedAt },
          createdAt: now().toISOString() });
        return { requested: true, requestId: document.requestId };
      });
    },
    status,
    async bindClosed(updateRunId) {
      const value = await status(updateRunId);
      if (!value.ready || value.request.status !== "pending") return { ready: false };
      if (!value.alreadyRegistered) {
        const service = createCatalogUsageService({ taxonomyRoot: root, now });
        const preview = await service.catalogUsagePreview();
        const fresh = await status(updateRunId);
        if (!fresh.ready || fresh.request.revision !== value.request.revision) throw new Error("Die neue FN-Erfassung wurde während der geschlossenen Prüfung verändert.");
        await service.catalogUsageSave({ token: preview.token, confirmed: true, allCatalogsConfirmed: true,
          unchangedSinceCapture: true, captureRequestId: value.request.requestId });
      }
      const final = await status(updateRunId);
      if (!final.alreadyRegistered) throw new Error("Die neue FN-Erfassung konnte nicht vollständig gebunden werden.");
      await write(root, { ...final.request, status: "completed", completedAt: now().toISOString(),
        registeredUsageRevision: (await catalogUsageRegistration(root)).revision });
      return { ready: true };
    },
    async syncJob(job) {
      const value = checked(await read(requestPath(root)));
      if (!value || value.updateRunId !== job.updateRunId || value.status === "completed") return;
      const stopped = ["paused", "interrupted", "failed", "waiting-decisions"].includes(job.status);
      const next = stopped ? "paused" : job.status === "completed" ? "cancelled" : "pending";
      if (next !== value.status) await write(root, { ...value, status: next });
    },
    async queueNormalClose(updateRunId) {
      const value = await status(updateRunId);
      if (!value.exists || value.request.status !== "pending") return { queued: false };
      if (!value.request.normalCloseRequestedAt) await write(root, { ...value.request, normalCloseRequestedAt: now().toISOString() });
      return { queued: true, ready: value.ready };
    },
    async claimNormalClose(updateRunId) {
      const value = await status(updateRunId);
      if (!value.ready || !value.request.normalCloseRequestedAt || value.request.normalCloseAttemptedAt) return false;
      await write(root, { ...value.request, normalCloseAttemptedAt: now().toISOString() });
      return true;
    },
  };
}
