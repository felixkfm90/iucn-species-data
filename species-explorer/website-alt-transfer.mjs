import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { atomicWriteJson } from "./taxonomy-storage.mjs";
import { assertNoStorageLinks } from "./storage-migration.mjs";
import { canonicalWebsiteImageSource, normalizeWebsitePageUrl } from "./website-alt-parser.mjs";
import { coupledWebsiteAltCaption, websiteAltTextLengthProblem } from "./website-alt-policy.mjs";

const MAX_IMAGES = 500;
const DRIVER_STATUSES = new Set(["written", "unchanged", "unsupported", "conflict", "failed"]);
const blocked = (message) => Object.assign(new Error(message), { statusCode: 409 });
const message = (value, fallback = "Übernahme nicht bestätigt.") => typeof value === "string" && value.trim()
  ? value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 2000) : fallback;
const abort = (signal) => {
  if (signal?.aborted) throw Object.assign(new Error(message(signal.reason?.message, "Die Übernahme wurde abgebrochen.")), { name: "AbortError" });
};

function galleryDiagnostic(value) {
  if (!value || !["open-gallery", "select-image", "description", "input", "close-gallery", "exit-page"].includes(value.stage)) return null;
  const count = (entry) => Number.isSafeInteger(entry) && entry >= 0 && entry <= 20 ? entry : 0;
  const displays = new Set(["none", "block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "contents", "table", "other"]);
  const visibilities = new Set(["visible", "hidden", "collapse", "other"]);
  const accessStages = new Set(["frame", "frame-parent", "source-point", "map", "map-frame-count", "map-frame-url", "map-transform",
    "map-dimensions", "map-hit-test", "frame-changed", "control", "opened"]);
  const values = (entry, allowed) => [...new Set((Array.isArray(entry) ? entry : []).filter((item) => allowed.has(item)))].slice(0, allowed.size);
  const buttons = (entry) => ({ total: count(entry?.total), visible: count(entry?.visible),
    display: values(entry?.display, displays), visibility: values(entry?.visibility, visibilities) });
  return { stage: value.stage, ...(accessStages.has(value.access) ? { access: value.access } : {}),
    matchingGallerySections: count(value.matchingGallerySections), targetPortalCount: count(value.targetPortalCount),
    frameGalleryButtons: buttons(value.frameGalleryButtons), mainGalleryButtons: buttons(value.mainGalleryButtons) };
}

function previewDiagnostic(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const origins = new Set(["https://www.fnwildlifetravel.de", "https://fnwildlifetravel.de", "https://vanilla-gerbil-jwnp.squarespace.com"]);
  const address = (entry) => {
    if (["empty", "foreign", "unavailable"].includes(entry?.status)) return { status: entry.status };
    try {
      if (entry?.status !== "loaded" || !origins.has(entry.origin) || typeof entry.pathname !== "string"
          || !entry.pathname.startsWith("/") || entry.pathname.length > 512 || /[?#]/.test(entry.pathname)) throw new Error("Nicht öffentlich");
      const target = new URL(entry.pathname, entry.origin);
      if (target.origin !== entry.origin || target.search || target.hash) throw new Error("Nicht öffentlich");
      const page = new URL(normalizeWebsitePageUrl(`https://www.fnwildlifetravel.de${target.pathname}`));
      return { status: "loaded", origin: entry.origin, pathname: page.pathname };
    } catch { return { status: "unavailable" }; }
  };
  const controls = new Set(["Bearbeiten", "Edit", "Speichern", "Save", "Beenden", "Verlassen", "Exit", "Fertig", "Done"]);
  const gallery = galleryDiagnostic(value.gallery);
  let editor;
  if (value.editor && typeof value.editor === "object" && !Array.isArray(value.editor)) {
    const count = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 20 ? value : 0;
    const keys = ["rawToolbarRegions", "toolbarRegions", "nestedRegionPairs", "editButtons", "saveButtons", "exitButtons",
      "disabledSaveButtons", "boundEditButtons", "boundSaveButtons", "boundExitButtons"];
    const displays = new Set(["none", "block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "contents", "table", "other"]);
    editor = Object.fromEntries(keys.map((key) => [key, count(value.editor[key])]));
    if (typeof value.editor.dialogOpen === "boolean") editor.dialogOpen = value.editor.dialogOpen;
    editor.toolbarRectCounts = { withRects: count(value.editor.toolbarRectCounts?.withRects), withoutRects: count(value.editor.toolbarRectCounts?.withoutRects) };
    editor.toolbarDisplays = [...new Set((Array.isArray(value.editor.toolbarDisplays) ? value.editor.toolbarDisplays : [])
      .filter((entry) => displays.has(entry)))].slice(0, displays.size);
  }
  return { target: address(value.target), mode: ["preview", "editing"].includes(value.mode) ? value.mode : "unknown",
    iframeCount: Number.isSafeInteger(value.iframeCount) && value.iframeCount >= 0 && value.iframeCount <= 100 ? value.iframeCount : 0,
    iframe: address(value.iframe), frames: (Array.isArray(value.frames) ? value.frames : []).slice(0, 8)
      .map((entry) => ({ ...address(entry), ...(typeof entry?.detached === "boolean" ? { detached: entry.detached } : {}) })),
    controls: [...new Set((Array.isArray(value.controls) ? value.controls : []).filter((label) => controls.has(label)))].slice(0, 9),
    ...(gallery ? { gallery } : {}), ...(editor ? { editor } : {}) };
}

export function websiteAltTransferConnection(adapter, value = {}) {
  const available = Boolean(adapter) && value?.available !== false;
  const connected = available && value?.connected === true;
  const loginRequired = available && (value?.loginRequired === true || value?.status === "login-required" || value?.sessionStatus === "login-required");
  return { available, connected, loginRequired, windowOpen: available && value?.windowOpen === true,
    windowHidden: available && value?.windowOpen === true && value?.windowHidden === true,
    status: !available ? "unavailable" : connected ? "ready" : loginRequired ? "login-required" : "disconnected",
    message: message(value?.message, !available ? "Die direkte Übernahme benötigt den Desktop-Explorer."
      : connected ? "Squarespace ist für die Übernahme bereit." : "Bitte zuerst das eigene Squarespace-Browserfenster öffnen und anmelden.") };
}

export function buildWebsiteAltTransferPlan(saved, { revision, pageUrl } = {}) {
  if (!saved || typeof revision !== "string" || revision !== saved.revision) throw blocked("Die Bildtextliste hat sich geändert. Bitte neu laden.");
  const target = normalizeWebsitePageUrl(pageUrl);
  const page = saved.pages?.find((entry) => entry.url === target);
  if (!page || page.redirectUrl || page.inventoryStatus !== "current" || page.error) {
    throw blocked("Diese Seite muss vor der Übernahme aktuell und eindeutig erfasst sein.");
  }
  const images = (page.images || []).filter((entry) => entry.status === "approved" && entry.approval).map((image) => {
    if ((image.altVariants?.length || 0) > 1 || (image.captionVariants || []).filter((value) => value.trim()).length > 1) {
      throw blocked("Mehrdeutige Bildverwendungen können nicht automatisch übernommen werden.");
    }
    const approval = image.approval;
    if (typeof approval.text !== "string" || approval.text.length > 2000 || typeof approval.decorative !== "boolean"
        || !approval.text && !approval.decorative || approval.decorative && approval.text !== ""
        || typeof approval.revision !== "string" || !approval.revision || !image.observationHash) {
      throw blocked("Eine gespeicherte Bildfreigabe ist nicht vollständig gebunden.");
    }
    const lengthProblem = websiteAltTextLengthProblem(target, image, approval.text);
    if (lengthProblem) throw Object.assign(blocked(`Bild ${page.images.indexOf(image) + 1}: ${lengthProblem.message}`),
      { code: "website_alt_text_limit", details: lengthProblem });
    return Object.freeze({ imageKey: image.key, sourceUrl: canonicalWebsiteImageSource(image.sourceUrl || image.src),
      context: image.context, kind: image.kind, text: approval.text, decorative: approval.decorative,
      approvalRevision: approval.revision, observationHash: image.observationHash,
      expectedAlt: image.alt, expectedCaption: image.caption, textCoupled: coupledWebsiteAltCaption(target, image) });
  });
  if (!images.length) throw blocked("Für diese Seite gibt es keine offenen aktuellen Textfreigaben.");
  if (images.length > MAX_IMAGES) throw blocked("Diese Seite überschreitet die begrenzte Bildanzahl je Übernahme.");
  return Object.freeze({ pageUrl: target, pageTitle: String(page.title || "").slice(0, 1000), revision,
    images: Object.freeze(images) });
}

function targetImage(saved, plan, target) {
  const page = saved.pages?.find((entry) => entry.url === plan.pageUrl);
  const image = page?.images?.find((entry) => entry.key === target.imageKey);
  if (!page || page.inventoryStatus !== "current" || page.error || !image || image.status === "removed"
      || !image.approval || image.approval.revision !== target.approvalRevision
      || image.approval.text !== target.text || image.approval.decorative !== target.decorative
      || canonicalWebsiteImageSource(image.sourceUrl || image.src) !== target.sourceUrl
      || image.context !== target.context || image.kind !== target.kind) {
    throw blocked("Die Freigabe oder Bildzuordnung wurde während der Übernahme geändert. Bitte neu prüfen.");
  }
  return image;
}

async function saveReceipt(dataRoot, receipt) {
  if (!dataRoot) return { saved: false, message: "Ergebnis nur in dieser laufenden Sitzung verfügbar." };
  if (typeof dataRoot !== "string" || !path.isAbsolute(dataRoot)) throw new Error("Kein sicherer absoluter Speicherpfad für die Übernahmequittung.");
  const directory = path.join(path.resolve(dataRoot), "website");
  const file = path.join(directory, "last-transfer.json");
  if (Buffer.byteLength(JSON.stringify(receipt)) > 2 * 1024 * 1024) throw new Error("Übernahmequittung überschreitet die begrenzte Größe.");
  await assertNoStorageLinks(directory);
  await assertNoStorageLinks(file);
  await assertNoStorageLinks(`${file}.previous`);
  await atomicWriteJson(file, receipt);
  return { saved: true };
}

export async function loadWebsiteAltTransferReceipt(dataRoot, saved) {
  if (!dataRoot) return null;
  try {
    if (typeof dataRoot !== "string" || !path.isAbsolute(dataRoot)) throw new Error("Ungültiger Speicherpfad der Übernahmequittung.");
    const file = path.join(path.resolve(dataRoot), "website", "last-transfer.json");
    await assertNoStorageLinks(file);
    const info = await fs.stat(file);
    if (!info.isFile() || info.size > 2 * 1024 * 1024) throw new Error("Übernahmequittung überschreitet die sichere Lesegrenze.");
    const receipt = JSON.parse(await fs.readFile(file, "utf8"));
    const statuses = new Set(["verified", "unsupported", "conflict", "failed", "stopped", "verification-pending"]);
    if (receipt?.schemaVersion !== 1 || !Array.isArray(receipt.results) || !receipt.results.length || receipt.results.length > MAX_IMAGES
        || !["completed", "partial", "failed", "cancelled"].includes(receipt.status)
        || normalizeWebsitePageUrl(receipt.pageUrl) !== receipt.pageUrl
        || !Number.isFinite(Date.parse(receipt.startedAt)) || !Number.isFinite(Date.parse(receipt.completedAt))) {
      throw new Error("Übernahmequittung ist nicht eindeutig lesbar.");
    }
    const page = saved.pages?.find((entry) => entry.url === receipt.pageUrl), seen = new Set();
    const results = receipt.results.map((entry) => {
      if (!entry || typeof entry.imageKey !== "string" || entry.imageKey.length > 128 || seen.has(entry.imageKey)
          || typeof entry.approvalRevision !== "string" || entry.approvalRevision.length > 128 || !statuses.has(entry.status)) {
        throw new Error("Übernahmequittung enthält mehrdeutige Bildnachweise.");
      }
      seen.add(entry.imageKey);
      const result = { imageKey: entry.imageKey, approvalRevision: entry.approvalRevision,
        status: entry.status, ...(entry.error ? { error: message(entry.error) } : {}) };
      const diagnostic = previewDiagnostic(entry.previewDiagnostic);
      if (diagnostic) result.previewDiagnostic = diagnostic;
      if (result.status === "verified") {
        const image = page?.images?.find((item) => item.key === entry.imageKey);
        if (page?.inventoryStatus !== "current" || page?.error || image?.status !== "verified"
            || image.approval?.revision !== entry.approvalRevision || image.verification?.approvalRevision !== entry.approvalRevision) {
          result.status = "verification-pending";
          result.error = "Der gespeicherte öffentliche Nachweis passt nicht mehr zur aktuellen Freigabe. Bitte erneut prüfen.";
        }
      }
      return result;
    });
    const verified = results.filter((entry) => entry.status === "verified").length;
    const status = receipt.status === "completed" && verified !== results.length ? "partial" : receipt.status;
    return { pageUrl: receipt.pageUrl, startedAt: receipt.startedAt, completedAt: receipt.completedAt, status, results,
      receiptSaved: true, restored: true, message: message(receipt.error, status === "completed"
        ? `${verified} freigegebene Bildtexte sind öffentlich bestätigt.`
        : `${verified} von ${results.length} Bildtexten sind öffentlich bestätigt. Die gespeicherten offenen Ergebnisse bleiben zur Prüfung sichtbar.`) };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    return { status: "failed", results: [], receiptSaved: false, restored: true,
      message: `Die gespeicherte Übernahmequittung ist nicht lesbar und wurde nicht ersetzt: ${message(error.message)}` };
  }
}

// The adapter performs the authenticated CMS comparison and writes. This runner
// supplies only bound approvals and independently verifies the public result.
export async function runWebsiteAltTransfer({ plan, state, discovery, adapter, signal, dataRoot,
  now = () => new Date(), onProgress = () => {}, isClosed = () => false, verificationIntervalMs = 2000 } = {}) {
  if (!Number.isSafeInteger(verificationIntervalMs) || verificationIntervalMs < 1 || verificationIntervalMs > 2000) {
    throw new TypeError("Begrenzter Abstand für die öffentliche Nachprüfung erforderlich.");
  }
  const operationId = randomUUID(), startedAt = now().toISOString();
  const results = plan.images.map((image) => ({ imageKey: image.imageKey, status: "pending" }));
  let failure = "", cancelled = false, writesReported = false;
  const ensureOpen = () => { abort(signal); if (isClosed()) throw Object.assign(new Error("Die Übernahme wurde beim Schließen beendet."), { name: "AbortError" }); };
  const boundResults = () => results.map((entry) => ({ ...entry,
    approvalRevision: plan.images.find((image) => image.imageKey === entry.imageKey).approvalRevision }));
  const publish = () => onProgress(boundResults());
  const assertCurrent = async (imageKey, approvalRevision) => {
    ensureOpen();
    const targets = imageKey === undefined ? plan.images : plan.images.filter((entry) => entry.imageKey === imageKey);
    if (!targets.length || approvalRevision !== undefined && targets.some((entry) => entry.approvalRevision !== approvalRevision)) {
      throw blocked("Die Übernahme darf nur ihre konkret gebundenen Bildfreigaben schreiben.");
    }
    const saved = await state.snapshot();
    ensureOpen();
    for (const target of targets) {
      const image = targetImage(saved, plan, target);
      if (image.observationHash !== target.observationHash || image.alt !== target.expectedAlt || image.caption !== target.expectedCaption) {
        throw blocked("Der beobachtete Bildstand wurde während der Übernahme geändert. Es wird nicht weitergeschrieben.");
      }
    }
  };
  try {
    ensureOpen();
    await assertCurrent();
    // Await the real writer, including after abort, so server shutdown drains
    // an already accepted field write before closing its browser adapter.
    const response = await adapter.transfer(plan, { signal, assertCurrent });
    ensureOpen();
    if (!response || !Array.isArray(response.results) || response.results.length > MAX_IMAGES) {
      throw new Error("Squarespace hat keine eindeutige Übernahmerückmeldung geliefert; es wird nicht automatisch wiederholt.");
    }
    const returned = new Map();
    for (const entry of response.results) {
      if (!entry || !plan.images.some((image) => image.imageKey === entry.imageKey) || returned.has(entry.imageKey)
          || !DRIVER_STATUSES.has(entry.status)) throw new Error("Die Übernahmerückmeldung ist mehrdeutig; Ergebnis bleibt ungeklärt.");
      returned.set(entry.imageKey, entry);
    }
    for (let index = 0; index < plan.images.length; index += 1) {
      const target = plan.images[index], reported = returned.get(target.imageKey);
      if (!reported || !["written", "unchanged"].includes(reported.status)) {
        const diagnostic = previewDiagnostic(reported?.previewDiagnostic);
        results[index] = { imageKey: target.imageKey, status: reported?.status || "stopped",
          error: message(reported?.error, "Für dieses Bild wurde keine Übernahme bestätigt."),
          ...(diagnostic ? { previewDiagnostic: diagnostic } : {}) };
        publish();
        continue;
      }
      writesReported = true;
      ensureOpen();
      try {
        targetImage(await state.snapshot(), plan, target);
        ensureOpen();
        for (let attempt = 0; attempt < 5; attempt += 1) {
          let observedPage;
          try { observedPage = await discovery.page(plan.pageUrl, { signal }); }
          catch (error) {
            ensureOpen();
            await state.mergeScan({ pages: [], discoveredUrls: [], errors: [{ url: plan.pageUrl, message: message(error.message) }],
              scope: "page", complete: false, completedAt: now().toISOString() });
            throw error;
          }
          ensureOpen();
          const current = await state.snapshot();
          ensureOpen();
          targetImage(current, plan, target);
          try {
            await state.verify({ revision: current.revision, pageUrl: plan.pageUrl, imageKey: target.imageKey,
              approvalRevision: target.approvalRevision, observedPage });
            break;
          } catch (error) {
            ensureOpen();
            if (error.statusCode !== 409 || attempt === 4) throw error;
            // Only reread a delayed public result while the same approval survives.
            // A foreign edit invalidates it; the CMS writer is never called again.
            targetImage(await state.snapshot(), plan, target);
            await delay(verificationIntervalMs, undefined, { signal });
            ensureOpen();
          }
        }
        ensureOpen();
        results[index] = { imageKey: target.imageKey, status: "verified" };
      } catch (error) {
        ensureOpen();
        results[index] = { imageKey: target.imageKey, status: error.code === "website_alt_public_mismatch" ? "verification-pending"
          : error.statusCode === 409 ? "conflict" : "verification-pending",
          error: message(error.message, "Die öffentliche Ausgabe ist noch nicht bestätigt.") };
      }
      publish();
    }
  } catch (error) {
    failure = message(error.message);
    cancelled = error.name === "AbortError" || signal?.aborted || isClosed();
    for (const entry of results) if (entry.status === "pending") {
      entry.status = cancelled ? "stopped" : "verification-pending";
      entry.error = failure;
    }
    publish();
  }
  // Another verification can merge a whole page or a separate client can edit
  // it. Reconcile positive labels against the final authoritative store state.
  let finalRevision = null;
  try {
    const final = await state.snapshot();
    finalRevision = final.revision;
    for (const entry of results) if (entry.status === "verified") {
      const target = plan.images.find((image) => image.imageKey === entry.imageKey);
      try {
        const image = targetImage(final, plan, target);
        if (image.status !== "verified" || image.verification?.approvalRevision !== target.approvalRevision) throw blocked("Öffentlicher Nachweis ist nicht mehr aktuell.");
      } catch (error) { entry.status = "verification-pending"; entry.error = message(error.message); }
    }
  } catch (error) { failure = message(error.message); for (const entry of results) if (entry.status === "verified") { entry.status = "verification-pending"; entry.error = failure; } }
  const verified = results.filter((entry) => entry.status === "verified").length;
  const status = cancelled ? "cancelled" : verified === results.length ? "completed" : writesReported || verified ? "partial" : "failed";
  const completedAt = now().toISOString();
  const receipt = { schemaVersion: 1, operationId, pageUrl: plan.pageUrl, requestedRevision: plan.revision,
    finalRevision, startedAt, completedAt, status, error: failure, results: boundResults() };
  let receiptState;
  try { receiptState = await saveReceipt(dataRoot, receipt); }
  catch (error) { receiptState = { saved: false, error: message(error.message) }; }
  return { operationId, pageUrl: plan.pageUrl, startedAt, completedAt, status: receiptState.error && status === "completed" ? "partial" : status,
    message: receiptState.error ? `Die Übernahmequittung konnte nicht gespeichert werden: ${receiptState.error}`
      : failure || (status === "completed" ? `${verified} freigegebene Bildtexte sind öffentlich bestätigt.`
        : `${verified} von ${results.length} Bildtexten sind öffentlich bestätigt. Offene Ergebnisse bitte prüfen; es wird nicht automatisch wiederholt.`),
    results: boundResults(), receiptSaved: receiptState.saved, receiptError: receiptState.error || "" };
}
