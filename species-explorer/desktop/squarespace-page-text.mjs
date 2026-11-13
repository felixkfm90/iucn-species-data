import { isDeepStrictEqual } from "node:util";
import { validateCmsDispatchBinding } from "../page-authoring/cms-dispatch.mjs";
import { cmsTextStepElements } from "../page-authoring/cms-content-steps.mjs";
import { readSquarespacePageObservation } from "./squarespace-page-observation.mjs";

const admin = "https://vanilla-gerbil-jwnp.squarespace.com";
const editorOrigins = new Set([admin, "https://www.fnwildlifetravel.de", "https://fnwildlifetravel.de"]);
const disabledPageProofs = new WeakMap();
const disabledPageProofLifetimeMs = 60_000;
const textBlockId = /^block-(?:[a-f0-9]{24}|yui_3_17_2_1_[0-9]{13}_[0-9]{1,12})$/;
const fail = (code, message) => Object.assign(new Error(message), { code, statusCode: 409 });
const changed = () => fail("SQUARESPACE_TEXT_TARGET_CHANGED", "Die deaktivierte Seite oder ihr leerer Textblock konnte nicht eindeutig bestätigt werden.");

function pasteInFrame({ frameUrl, pageId, blockId, html, plain }) {
  const lookup = () => {
    if (document.URL !== frameUrl || document.body?.id !== `collection-${pageId}`) return null;
    const mains = document.querySelectorAll("main");
    const articles = mains.length === 1 ? mains[0].querySelectorAll("article") : [];
    const blocks = document.querySelectorAll(`[id="${blockId}"]`);
    if (articles.length !== 1 || blocks.length !== 1 || !articles[0].contains(blocks[0]) || blocks[0].querySelector('[id^="block-"]')) return null;
    const block = blocks[0];
    if (blockId.startsWith("block-yui_")) {
      const cell = block.closest('[role="gridcell"]');
      if (block.getAttribute("data-sqsp-block") !== "text" || block.getAttribute("data-definition-name") !== "website.components.html"
          || cell?.getAttribute("data-block-id") !== blockId.slice(6)) return null;
    }
    const editors = block.querySelectorAll('[contenteditable="true"][role="textbox"]');
    return editors.length === 1 ? editors[0] : null;
  };
  const editor = lookup();
  if (!editor) return false;
  function stillEmpty() {
    if (!editor.isConnected || !editor.isContentEditable || !editor.getClientRects().length || editor.getAttribute("aria-readonly") === "true") return false;
    for (let element = editor; element; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (element.hidden || element.inert || element.getAttribute("aria-hidden") === "true" || element.getAttribute("aria-disabled") === "true"
          || style.display === "none" || style.visibility !== "visible" || Number(style.opacity) === 0 || style.contentVisibility === "hidden") return false;
    }
    const blank = node => node.nodeType === 3 && !node.nodeValue.trim() || node.nodeType === 1 && node.tagName === "BR";
    return [...editor.childNodes].every(node => blank(node) || node.nodeType === 1 && node.tagName === "P" && [...node.childNodes].every(blank));
  }
  if (!stillEmpty()) return false;
  editor.focus();
  if (document.activeElement !== editor || lookup() !== editor || !stillEmpty()) return false;
  const selection = document.getSelection();
  if (!selection) return false;
  const range = document.createRange();
  range.selectNodeContents(editor);
  selection.removeAllRanges();
  selection.addRange(range);
  if (document.activeElement !== editor || lookup() !== editor || !stillEmpty()) return false;
  const clipboardData = new DataTransfer();
  clipboardData.setData("text/html", html);
  clipboardData.setData("text/plain", plain);
  editor.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true, composed: true }));
  return true;
}

function isPreviewUrl(value, path) {
  try {
    const url = new URL(value);
    return editorOrigins.has(url.origin) && !url.username && !url.password && url.pathname === path;
  } catch { return false; }
}

/** The open settings dialog may coexist with a still-blank frame. Confirm its target path here, and the loaded collection at input time. */
export async function confirmSquarespaceDisabledPage(webContents, { pageId, expectedTitle, dispatchBinding, signal }) {
  const dispatch = validateCmsDispatchBinding(dispatchBinding);
  if (typeof pageId !== "string" || !/^[a-f0-9]{24}$/.test(pageId) || typeof expectedTitle !== "string" || !expectedTitle.trim()) throw changed();
  const top = webContents.mainFrame, adminUrl = webContents.getURL();
  const { pageSettings } = await readSquarespacePageObservation(webContents,
    { view: "settings", expectedPath: dispatch.targetPath, expectedTitle, signal });
  if (pageSettings.status !== "preview-path-matched" || pageSettings.displayedEnabled !== false
      || webContents.mainFrame !== top || webContents.getURL() !== adminUrl || webContents.isDestroyed?.()) throw changed();
  const proof = Object.freeze({});
  disabledPageProofs.set(proof, { webContents, top, adminUrl, pageId, expectedTitle, dispatch, issuedAt: performance.now() });
  return proof;
}

export function isCurrentSquarespaceDisabledPage(proof, webContents, pageId, dispatch, { expectedTitle, issuedAfter = 0 } = {}) {
  const binding = disabledPageProofs.get(proof);
  return Boolean(binding && binding.webContents === webContents && binding.top === webContents.mainFrame
    && binding.adminUrl === webContents.getURL() && !webContents.isDestroyed?.()
    && binding.pageId === pageId && binding.issuedAt >= issuedAfter && performance.now() - binding.issuedAt < disabledPageProofLifetimeMs
    && (expectedTitle === undefined || expectedTitle === binding.expectedTitle) && isDeepStrictEqual(binding.dispatch, dispatch));
}

/** One in-editor insertion after the owner has reasserted the current journal and exact block. */
export async function insertSquarespacePageText(webContents, { pageId, blockId, step, dispatchBinding, disabledPage, assertWritable, signal }) {
  const dispatch = validateCmsDispatchBinding(dispatchBinding), { targetPath } = dispatch;
  const expected = cmsTextStepElements(step, dispatch);
  if (!expected || typeof pageId !== "string" || !/^[a-f0-9]{24}$/.test(pageId)
      || typeof blockId !== "string" || !textBlockId.test(blockId) || typeof assertWritable !== "function") throw changed();
  signal?.throwIfAborted();
  const top = webContents.mainFrame, adminUrl = webContents.getURL();
  const currentProof = () => isCurrentSquarespaceDisabledPage(disabledPage, webContents, pageId, dispatch);
  function currentFrame() {
    if (webContents.isDestroyed?.() || webContents.mainFrame !== top || webContents.getURL() !== adminUrl) return null;
    const frames = (top?.framesInSubtree || []).filter(frame => frame.parent === top && !frame.detached && !frame.isDestroyed?.()
      && isPreviewUrl(frame.url, targetPath));
    return frames.length === 1 ? frames[0] : null;
  }
  if (!currentProof() || !isPreviewUrl(adminUrl, "/config/pages") || new URL(adminUrl).origin !== admin) throw changed();
  const frame = currentFrame(), frameUrl = frame?.url;
  const observationOptions = { expectedPath: targetPath, expectedPageId: pageId, signal };
  const before = frame && await readSquarespacePageObservation(webContents, observationOptions);
  if (before?.page.id !== pageId || before.page.path !== targetPath || before.modalOpen !== false) throw changed();
  const previous = before.textBlocks.find(block => block.cmsBlockId === blockId);
  if (previous?.blocks.some(block => block.type !== "paragraph" || block.text.trim())) throw changed();
  if (await assertWritable({ pageId, path: targetPath, blockId }) !== true) throw changed();
  signal?.throwIfAborted();
  const ready = await readSquarespacePageObservation(webContents, observationOptions);
  if (!currentProof() || ready.page.id !== pageId || ready.page.path !== targetPath || ready.modalOpen !== false
      || currentFrame() !== frame || frame.url !== frameUrl) throw changed();
  const plain = expected.map(block => block.text ?? block.items.join("\n")).join("\n");
  const payload = { frameUrl, pageId, blockId, html: step.html, plain };
  const dispatched = await frame.executeJavaScript(`(${pasteInFrame.toString()})(${JSON.stringify(payload)})`, true);
  signal?.throwIfAborted();
  if (dispatched !== true) throw changed();

  const after = await readSquarespacePageObservation(webContents, observationOptions);
  const text = after.textBlocks.find(block => block.cmsBlockId === blockId && block.source === "editor");
  if (currentFrame() !== frame || frame.url !== frameUrl || after.modalOpen !== false || !isDeepStrictEqual(text?.blocks, expected)) {
    throw fail("SQUARESPACE_TEXT_UNCONFIRMED", "Der Editor bestätigt die eingegebene Gliederung nicht eindeutig. Die Seitenarbeit bleibt zur Prüfung offen.");
  }
  return { pageId, blockId, blocks: text.blocks };
}
