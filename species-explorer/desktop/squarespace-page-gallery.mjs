import { createHash, randomBytes } from "node:crypto";
import { websiteAltCaptionMatchesText } from "../website-alt-policy.mjs";
import { escapeHtml } from "../page-authoring/contract.mjs";
import { FN_FIGURE_STYLES } from "../page-authoring/templates.mjs";
import { identifySquarespacePageAsset } from "./squarespace-page-observation.mjs";

const sectionIdPattern = /^[a-f0-9]{24}$/;
const figureItemIdPattern = /^fn-figure-[a-f0-9]{24}$/;
const assetIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const blockIdPattern = /^block-(?:[a-f0-9]{20}|[a-f0-9]{24}|yui_3_17_2_1_[0-9]{13}_[0-9]{1,12})$/;
const imageExtensions = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const galleryInputAccept = "image/png,image/gif,image/jpeg,image/webp";
const invalid = (message = "Die hochgeladenen Galeriebilder passen nicht eindeutig zur freigegebenen Reihenfolge.") => Object.assign(new Error(message),
  { code: "SQUARESPACE_PAGE_GALLERY_BINDING", statusCode: 409 });

/** Runs in the Squarespace administration frame. The prepared bytes go only to the bound file input. */
function galleryFileInputDom({ adminUrl, frameUrl, accept, expected, file, confirming = false }) {
  if (document.URL !== adminUrl) return null;
  const visible = element => {
    if (!element.getClientRects().length) return false;
    for (let current = element; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (current.getAttribute("hidden") !== null || current.getAttribute("inert") !== null
          || current.getAttribute("aria-hidden") === "true" || style.display === "none" || style.visibility !== "visible"
          || Number(style.opacity) === 0 || style.contentVisibility === "hidden") return false;
    }
    return true;
  };
  const previews = [...document.querySelectorAll("iframe#sqs-site-frame")].filter(visible);
  const dialogs = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"],[aria-modal="true"]')].filter(visible);
  if (previews.length !== 1 || previews[0].src !== frameUrl || dialogs.length !== 1 || dialogs[0].getAttribute("role") !== "dialog") return null;
  const [dialog] = dialogs;
  const modalId = dialog.getAttribute("data-modal-id");
  const managers = [...dialog.querySelectorAll('[data-test="gallery-manager-modal"]')].filter(visible);
  if (!/^m[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(modalId || "") || managers.length !== 1) return null;
  if (confirming) return modalId === expected.modalId;
  const fields = [...dialog.querySelectorAll('input[type="file"]')];
  const [field] = fields;
  if (fields.length !== 1 || !managers[0].contains(field) || field.getAttribute("accept") !== accept
      || field.getAttribute("multiple") === null || field.getAttribute("aria-disabled") === "true"
      || field.matches(":disabled") || field.form || field.files?.length !== 0
      || getComputedStyle(field).display !== "none") return null;
  const rows = [...dialog.querySelectorAll('[data-cypress="draggable-item"]')];
  const rowIds = rows.map(row => row.getAttribute("data-itemid"));
  if (rows.length > 200 || new Set(rowIds).size !== rows.length
      || rows.some((row, index) => row.tagName !== "DIV" || row.getAttribute("role") !== "button" || !visible(row)
        || row.getAttribute("data-index") !== String(index) || !/^[a-f0-9]{24}$/.test(rowIds[index]))) return null;
  const observed = { modalId, rowIds };
  if (!file) return observed;
  if (modalId !== expected.modalId || rowIds.length !== expected.rowIds.length
      || rowIds.some((id, index) => id !== expected.rowIds[index])) return null;
  const decoded = atob(file.base64);
  if (decoded.length !== file.size) return null;
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < bytes.length; index++) bytes[index] = decoded.charCodeAt(index);
  const selection = new DataTransfer();
  selection.items.add(new File([bytes], file.name, { type: file.type }));
  field.files = selection.files;
  field.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  return true;
}

/** Submit exactly one file to an already opened gallery and wait for its separately checked acknowledgement. */
export async function submitSquarespaceGalleryFile(webContents, { path, fileName, bytes, mimeType, assertCurrent,
  captureBeforeUpload, confirmUpload, waitFor, signal }) {
  const unavailable = () => Object.assign(new Error("Das gebundene Squarespace-Dateifeld konnte nicht eindeutig bestätigt werden."),
    { code: "SQUARESPACE_PAGE_GALLERY_FILE_UNAVAILABLE", statusCode: 409 });
  const extension = Object.hasOwn(imageExtensions, mimeType) ? imageExtensions[mimeType] : null;
  if (!extension || !/^fn-[a-f0-9]{24}-[1-9][0-9]{0,2}\.(?:png|jpg|webp)$/.test(fileName)
      || !fileName.endsWith(`.${extension}`) || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 32 * 1024 * 1024
      || ![assertCurrent, captureBeforeUpload, confirmUpload, waitFor].every(callback => typeof callback === "function")) throw unavailable();
  signal?.throwIfAborted();
  const adminUrl = webContents.getURL(), top = webContents.mainFrame;
  const admin = new URL(adminUrl);
  if (admin.origin !== "https://vanilla-gerbil-jwnp.squarespace.com" || admin.username || admin.password
      || admin.pathname !== "/config/pages") throw unavailable();
  const frames = (top?.framesInSubtree || []).filter(frame => {
    if (frame.parent !== top || frame.detached || frame.isDestroyed?.()) return false;
    try {
      const url = new URL(frame.url);
      return url.pathname === path && !url.username && !url.password
        && [admin.origin, "https://www.fnwildlifetravel.de", "https://fnwildlifetravel.de"].includes(url.origin);
    } catch { return false; }
  });
  if (frames.length !== 1) throw unavailable();
  const [frame] = frames, frameUrl = frame.url;
  const current = () => webContents.mainFrame === top && webContents.getURL() === adminUrl && !webContents.isDestroyed?.()
    && (top.framesInSubtree || []).includes(frame) && !frame.detached && !frame.isDestroyed?.() && frame.url === frameUrl;
  const run = payload => top.executeJavaScript(`(${galleryFileInputDom.toString()})(${JSON.stringify({
    adminUrl, frameUrl, accept: galleryInputAccept, ...payload,
  })})`, true);
  await assertCurrent();
  if (!current()) throw unavailable();
  const observed = await run({});
  if (!observed || !current()) throw unavailable();
  await captureBeforeUpload(observed.rowIds, observed.modalId);
  await assertCurrent();
  signal?.throwIfAborted();
  if (!current()) throw unavailable();
  const file = { name: fileName, type: mimeType, size: bytes.length, base64: bytes.toString("base64") };
  if (await run({ expected: observed, file }) !== true) throw unavailable();
  await waitFor(async () => {
    await assertCurrent();
    if (!current() || await run({ expected: observed, confirming: true }) !== true || !current()) throw unavailable();
    const confirmed = await confirmUpload(observed.modalId);
    if (!current() || await run({ expected: observed, confirming: true }) !== true || !current()) throw unavailable();
    return confirmed;
  }, "Squarespace hat die ausgewählte Bilddatei noch nicht eindeutig bestätigt. Bitte den Entwurf prüfen.", signal);
}

/** A gallery section has one description per image and one caption setting for the section. */
function planSquarespaceNativeGallery(items) {
  const showCaptions = items.some(image => image.caption !== "");
  for (const [index, image] of items.entries()) {
    const unsupported = message => Object.assign(new Error(`Galeriebild ${index + 1}: ${message}`),
      { code: "SQUARESPACE_PAGE_GALLERY_TEXT_UNSUPPORTED", statusCode: 409 });
    if (image.decorative || !image.alt.trim()) throw unsupported("Der native Galerieabschnitt kann keinen absichtlich leeren Alternativtext bestätigen.");
    if (image.attribution) throw unsupported("Der Bildnachweis braucht einen eigenen sichtbaren Platz.");
    if (showCaptions && image.caption !== image.alt) {
      throw unsupported("Die Galerie verwendet dieselbe Beschreibung für Alternativtext und Beschriftung. Diese Freigabe benötigt getrennte Felder.");
    }
    if (image.alt.length > 250 || /[\r\n]/u.test(image.alt)) {
      throw unsupported("Die Beschreibung für den nativen Galerieabschnitt muss einzeilig sein und darf höchstens 250 Zeichen haben.");
    }
  }
  return { showCaptions, descriptions: items.map(image => image.alt) };
}

function bindGalleryUploads(planned, bindings, allowReuse, itemIdPattern = sectionIdPattern) {
  if (!Array.isArray(bindings) || bindings.length !== planned.length) throw invalid();
  const assets = new Map(), usages = new Set();
  return planned.map((image, index) => {
    const binding = bindings[index];
    if (!binding || image.order !== index || binding.usageId !== image.id || binding.assetId !== image.assetId
        || binding.sha256 !== image.sha256 || binding.bytes !== image.bytes || binding.mimeType !== image.mimeType
        || typeof binding.cmsItemId !== "string" || !itemIdPattern.test(binding.cmsItemId)
        || typeof binding.cmsAssetId !== "string" || !assetIdPattern.test(binding.cmsAssetId)
        || usages.has(binding.cmsItemId)) throw invalid();
    const physical = JSON.stringify([image.sha256, image.bytes, image.mimeType]);
    if (assets.has(binding.cmsAssetId) && (!allowReuse || assets.get(binding.cmsAssetId) !== physical)) throw invalid();
    usages.add(binding.cmsItemId);
    assets.set(binding.cmsAssetId, physical);
    return { usageId: image.id, cmsAssetId: binding.cmsAssetId };
  });
}

const lineEndings = text => text.replace(/\r\n?/gu, "\n");

function sameGalleryItems(before, after) {
  return after.length === before.length && after.every((item, index) => {
    const previous = before[index];
    const sameSource = previous.source.identity ? item.source.identity?.assetId === previous.source.identity.assetId
      : previous.sourceFingerprint && item.sourceFingerprint === previous.sourceFingerprint;
    return item.cmsItemId === previous.cmsItemId && sameSource;
  });
}

function newGalleryItem(before, after, fileName) {
  const ids = new Set(before.map(item => item.cmsItemId));
  const retained = after.filter(item => ids.has(item.cmsItemId));
  if (!sameGalleryItems(before, retained)) throw invalid();
  const added = after.filter(item => !ids.has(item.cmsItemId));
  if (added.length === 0) return null;
  if (added.length !== 1 || added[0].source.status !== "observed"
      || !new URL(added[0].source.originalSource).pathname.endsWith(`/${fileName}`)) throw invalid();
  return added[0];
}

async function verifyGalleryUpload(assertion, signal) {
  signal?.throwIfAborted();
  await assertion();
  signal?.throwIfAborted();
}

async function readApprovedGalleryFile(image, index, prefix, readMedia, verifyLayout) {
  if (!Object.hasOwn(imageExtensions, image.mimeType) || image.order !== index
      || !Number.isSafeInteger(image.bytes) || image.bytes < 1 || image.bytes > 32 * 1024 * 1024) throw invalid();
  const fileName = `${prefix}-${index + 1}.${imageExtensions[image.mimeType]}`;
  await verifyLayout();
  const input = await readMedia(image.assetId);
  if (!(input instanceof Uint8Array) || input.byteLength !== image.bytes) throw invalid();
  const bytes = Buffer.from(input);
  if (createHash("sha256").update(bytes).digest("hex") !== image.sha256) throw invalid();
  await verifyLayout();
  return { fileName, bytes };
}

/** Bind each approved file to the CMS acknowledgement from its own upload. */
export async function uploadSquarespaceFigureGallery(planned, { blockId, readMedia, uploadImage, readGallery, assertCurrent, assertLayout, signal }) {
  if (!planned.length || !blockIdPattern.test(blockId) || typeof readMedia !== "function" || typeof uploadImage !== "function"
      || typeof readGallery !== "function" || typeof assertCurrent !== "function" || typeof assertLayout !== "function") throw invalid();
  const prefix = `fn-${randomBytes(12).toString("hex")}`;
  const mediaBindings = [], usages = new Set(), assets = new Map();
  let lastConfirmedItems;
  const verify = assertion => verifyGalleryUpload(assertion, signal);
  for (const [index, image] of planned.entries()) {
    const { fileName, bytes } = await readApprovedGalleryFile(image, index, prefix, readMedia, () => verify(assertLayout));
    let baseline, observed;
    const observe = async (context) => {
      await verify(assertCurrent);
      return readGallery(context);
    };
    const captureBeforeUpload = async (fileFieldRowIds, modalId) => {
      if (baseline) throw invalid();
      baseline = await observe({ modalId, allowEmpty: Boolean(modalId) && fileFieldRowIds?.length === 0 });
      if (!baseline) throw invalid("Die Bilderliste im Squarespace-Galeriedialog konnte vor der Dateiübergabe nicht bestätigt werden.");
      if (lastConfirmedItems && !sameGalleryItems(lastConfirmedItems, baseline)) {
        throw invalid("Die Bilderliste im Squarespace-Galeriedialog hat sich seit dem letzten Upload geändert. Für dieses Bild wurde keine Datei übergeben.");
      }
      if (fileFieldRowIds !== undefined && (!Array.isArray(fileFieldRowIds)
          || fileFieldRowIds.length !== baseline.length
          || baseline.some((item, index) => item.cmsItemId !== fileFieldRowIds[index]))) {
        throw invalid("Dateifeld und Bilderliste im Squarespace-Galeriedialog stimmen nicht überein. Für dieses Bild wurde keine Datei übergeben.");
      }
    };
    const confirmUpload = async (modalId) => {
      if (!baseline || observed) throw invalid();
      const after = await observe({ modalId });
      if (!after) return false;
      observed = newGalleryItem(baseline, after, fileName);
      if (!observed) return false;
      lastConfirmedItems = structuredClone(after);
      return true;
    };
    await uploadImage({ fileName, bytes, mimeType: image.mimeType, assertCurrent: () => verify(assertCurrent), captureBeforeUpload, confirmUpload, signal });
    await verify(assertLayout);
    if (!observed || usages.has(observed.cmsItemId)) throw invalid();
    const cmsAssetId = observed.source.identity.assetId;
    const physical = JSON.stringify([image.sha256, image.bytes, image.mimeType]);
    if (assets.has(cmsAssetId) && assets.get(cmsAssetId) !== physical) throw invalid();
    assets.set(cmsAssetId, physical);
    usages.add(observed.cmsItemId);
    const sourceUrl = new URL(observed.source.originalSource);
    sourceUrl.search = "";
    mediaBindings.push({ usageId: image.id, assetId: image.assetId, sha256: image.sha256, bytes: image.bytes, mimeType: image.mimeType,
      cmsAssetId, cmsItemId: observed.cmsItemId, sourceUrl: sourceUrl.href });
  }
  return { layout: "figures", blockId, mediaBindings };
}

/** Bind each library receipt to its approved image and give each rendered figure its own identity. */
export async function uploadSquarespaceLibraryImages(planned, { readMedia, uploadLibraryImage, assertDraft, signal }) {
  if (!planned.length || typeof readMedia !== "function"
      || typeof uploadLibraryImage !== "function" || typeof assertDraft !== "function") throw invalid();
  const prefix = `fn-${randomBytes(12).toString("hex")}`;
  const mediaBindings = [], assets = new Map();
  const assertCurrent = () => verifyGalleryUpload(assertDraft, signal);
  for (const [index, image] of planned.entries()) {
    const { fileName, bytes } = await readApprovedGalleryFile(image, index, prefix, readMedia, assertCurrent);
    const receipt = await uploadLibraryImage({ image: { ...image }, fileName, bytes, assertCurrent, signal });
    await assertCurrent();
    const media = identifySquarespacePageAsset(receipt?.sourceUrl);
    if (receipt?.fileName !== fileName || media.status !== "observed" || media.routeVersion !== "v1" || media.format !== null
        || media.identity.assetId !== receipt.assetId || !new URL(media.originalSource).pathname.endsWith(`/${fileName}`)) throw invalid();
    const cmsAssetId = media.identity.assetId;
    const physical = JSON.stringify([image.sha256, image.bytes, image.mimeType]);
    if (assets.has(cmsAssetId) && assets.get(cmsAssetId) !== physical) throw invalid();
    assets.set(cmsAssetId, physical);
    const cmsItemId = `fn-figure-${createHash("sha256").update(fileName).digest("hex").slice(0, 24)}`;
    mediaBindings.push({ usageId: image.id, assetId: image.assetId, sha256: image.sha256, bytes: image.bytes, mimeType: image.mimeType,
      cmsAssetId, cmsItemId, sourceUrl: media.originalSource });
  }
  return mediaBindings;
}

/** Compile an HTML-only block from the approved text and previously bound Squarespace media. */
export function prepareSquarespaceFigureGallery(planned, upload) {
  if (!planned.length || upload?.layout !== "figures" || typeof upload.blockId !== "string" || !blockIdPattern.test(upload.blockId)) throw invalid();
  const marked = Array.isArray(upload.mediaBindings) && upload.mediaBindings.some(binding =>
    typeof binding?.cmsItemId === "string" && figureItemIdPattern.test(binding.cmsItemId));
  const items = bindGalleryUploads(planned, upload.mediaBindings, true, marked ? figureItemIdPattern : sectionIdPattern);
  const figures = items.map((item, index) => {
    const image = planned[index], media = identifySquarespacePageAsset(upload.mediaBindings[index].sourceUrl);
    if (media.status !== "observed" || media.identity.assetId !== item.cmsAssetId || image.decorative !== (image.alt === "")
        || !image.decorative && !image.alt.trim() || [image.alt, image.caption, image.attribution].some(value => value.includes("\0"))) throw invalid();
    const alt = lineEndings(image.alt), caption = lineEndings(image.caption), attribution = lineEndings(image.attribution);
    const words = (tag, name, value) => value ? `<${tag} data-fn-${name}="" style="${FN_FIGURE_STYLES.text}">${escapeHtml(value)}</${tag}>` : "";
    const credit = words("small", "credit", attribution), description = words("span", "caption", caption);
    const imageTag = `<img src="${escapeHtml(media.originalSource)}" alt="${escapeHtml(alt).replaceAll("\n", "&#10;")}" style="${FN_FIGURE_STYLES.image}">`;
    const cmsItemId = marked ? upload.mediaBindings[index].cmsItemId : undefined;
    const marker = marked ? ` data-fn-item-id="${cmsItemId}"` : "";
    const html = `<figure data-fn-position="${index + 1}"${marker} style="${FN_FIGURE_STYLES.figure}">${imageTag}${description || credit ? `<figcaption>${description}${credit}</figcaption>` : ""}</figure>`;
    return { ...item, ...(marked && { cmsItemId }), alt, caption: caption || null, attribution: attribution || null, html };
  });
  const html = `<div data-fn-art-gallery="1" style="${FN_FIGURE_STYLES.grid}">\n${figures.map(figure => figure.html).join("\n")}\n</div>`;
  if (Buffer.byteLength(html, "utf8") > 380_000) throw invalid();
  return { blockId: upload.blockId, html, figures };
}

/** Bind visible image order to the managed upload results and the corresponding plan positions. */
export function createSquarespaceGalleryReadback(slots, upload) {
  const planned = slots.find(slot => slot.type === "gallery").items;
  if (upload?.layout === "figures") {
    const gallery = prepareSquarespaceFigureGallery(planned, upload);
    return observation => {
      if (observation.reasonCodes.some(reason => reason.startsWith("gallery-")) || observation.galleries.length !== 1) return null;
      const [observed] = observation.galleries;
      if (observed.blockId !== gallery.blockId || observed.previewImages.length !== gallery.figures.length) return null;
      if (!gallery.figures.every((figure, index) => {
        const source = observed.previewImages[index], text = source.renderedText;
        return source.status === "observed" && source.identity?.assetId === figure.cmsAssetId && text?.position === index + 1
          && text.alt === figure.alt && text.caption === figure.caption && text.attribution === figure.attribution
          && text.cmsItemId === figure.cmsItemId;
      })) return null;
      return { status: "rendered-figures-confirmed", blockId: gallery.blockId,
        items: gallery.figures.map(({ usageId, cmsAssetId, cmsItemId }, index) => ({
          usageId, cmsAssetId, ...(cmsItemId && observed.previewImages[index].renderedText),
        })) };
    };
  }
  const textPlan = planSquarespaceNativeGallery(planned);
  if (!planned.length && upload !== undefined) throw invalid();
  const sectionId = upload?.sectionId;
  if (planned.length && (typeof sectionId !== "string" || !sectionIdPattern.test(sectionId) || upload.layout !== undefined)) throw invalid();
  const items = planned.length ? bindGalleryUploads(planned, upload.mediaBindings, false) : [];

  return function readRenderedOrder(observation) {
    if (observation.reasonCodes.some(reason => reason.startsWith("gallery-"))) return null;
    if (!items.length) return observation.galleries.length === 0 ? { status: "no-gallery-planned" } : null;
    if (observation.galleries.length !== 1) return null;
    const [gallery] = observation.galleries;
    if (gallery.sectionId !== sectionId || gallery.previewImageCount !== items.length || gallery.previewImages.length !== items.length) return null;
    if (!items.every((item, index) => {
      const source = gallery.previewImages[index];
      const expectedText = textPlan.descriptions[index];
      return source.status === "observed" && source.identity?.assetId === item.cmsAssetId
        && source.renderedText?.alt === expectedText && (textPlan.showCaptions
          ? websiteAltCaptionMatchesText(source.renderedText.caption, expectedText)
          : source.renderedText.caption === null);
    })) return null;
    return { status: "rendered-image-order-confirmed", sectionId, items: [...items], renderedTextConfirmed: true };
  };
}

/** Rebuild the figure comparison only from fresh sources in the bound FN library. */
export function createSquarespaceBoundGalleryReadback(slots, { blockId, mediaBindings }) {
  if (!mediaBindings.length) return createSquarespaceGalleryReadback(slots);
  return observation => {
    if (observation.galleries.length !== 1) return null;
    const [gallery] = observation.galleries;
    if (gallery.blockId !== blockId || gallery.previewImages.length !== mediaBindings.length) return null;
    const observed = gallery.previewImages;
    if (!mediaBindings.every((binding, index) => {
      const source = observed[index];
      return source.status === "observed" && source.identity?.assetId === binding.cmsAssetId && typeof source.originalSource === "string";
    })) return null;
    const figures = { layout: "figures", blockId, mediaBindings: mediaBindings.map((binding, index) => ({
      ...binding, sourceUrl: observed[index].originalSource,
    })) };
    return createSquarespaceGalleryReadback(slots, figures)(observation);
  };
}
