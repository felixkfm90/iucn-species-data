import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { isProxy } from "node:util/types";
import { setTimeout as delay } from "node:timers/promises";
import { FN_FIGURE_STYLES, FN_MAP_CODE, FN_SPECIES_CODE } from "../page-authoring/templates.mjs";
import { CMS_MAP_SECTION_ATTRIBUTE, CMS_MAP_SECTION_PREFIX, CMS_MAP_SECTION_SUFFIX } from "../page-authoring/cms-content-steps.mjs";

const ADMIN = "https://vanilla-gerbil-jwnp.squarespace.com";
const SITE_LIBRARY = "67556be0338df718ea064210";
const COLLECTION = /^[a-f0-9]{24}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const CODE_BLOCK = /^block-(?:[a-f0-9]{20}|[a-f0-9]{24}|yui_3_17_2_1_[0-9]{13}_[0-9]{1,12})$/;
export const SQUARESPACE_DEFAULT_CODE = "<p>Hello, World!</p>";
const FN_CODE = { species: FN_SPECIES_CODE, map: FN_MAP_CODE };
const CODE_EDITOR_SOURCES = { ...FN_CODE, empty: "", "default-placeholder": SQUARESPACE_DEFAULT_CODE };
const activeObservations = new WeakMap();
const LOADING_REASONS = new Set(["preview-frame-unobserved", "preview-frame-loading", "collection-identity-unobserved",
  "page-main-unobserved", "page-article-unobserved", "editor-content-unqualified"]);
const failure = (code, message, statusCode = 409) => Object.assign(new Error(message), { code, statusCode });
const fieldsUnobserved = () => ({ alt: "unobserved", caption: "unobserved", attribution: "unobserved", decorative: "unobserved" });
function pageAddress(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || ![ADMIN, "https://www.fnwildlifetravel.de", "https://fnwildlifetravel.de"].includes(url.origin)
        || url.pathname.length > 1024) return null;
    return { origin: url.origin, path: url.pathname };
  } catch { return null; }
}
const sameAddress = (a, b) => a && b && a.origin === b.origin && a.path === b.path;

/** Only the observed FN library/UUID route and known format transformations establish identity. */
export function identifySquarespacePageAsset(sourceUrl) {
  const unknown = reason => ({ status: "unsupported", reason, originalSource: null, identity: null });
  if (typeof sourceUrl !== "string" || !sourceUrl || sourceUrl.length > 4096) return unknown("image-source-unobserved");
  let url; try { url = new URL(sourceUrl); } catch { return unknown("image-source-unobserved"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.hostname !== "images.squarespace-cdn.com") return unknown("image-source-origin-unobserved");
  let parts = /^\/content\/v1\/([a-f0-9]{24})\/([^/]+)\/([^/]+)$/.exec(url.pathname), routeVersion = "v1";
  if (!parts) { parts = /^\/content\/v2\/namespaces\/website\/libraries\/([a-f0-9]{24})\/([^/]+)\/([^/]+)$/.exec(url.pathname); routeVersion = "v2"; }
  if (!parts || !UUID.test(parts[2]) || /%2f|%5c/i.test(parts[3])) return unknown("image-source-shape-unobserved");
  if (parts[1] !== SITE_LIBRARY) return unknown("image-source-foreign-library");
  const params = [...url.searchParams];
  if (params.length > 1 || params.some(([key, value]) => key !== "format" || !/^(?:(?:100|200|300|500|750|1000|1500|2500)w|original)$/.test(value))) {
    return unknown("image-source-transform-unobserved");
  }
  return { status: "observed", originalSource: sourceUrl, identity: { libraryId: parts[1], assetId: parts[2] },
    routeVersion, format: params[0]?.[1] || null, uploadedBytes: "unobserved" };
}

/** The Assets grid shows a distinct CDN route for the same observed library and asset. */
export function identifySquarespaceLibraryImageSource(sourceUrl, fileName) {
  const extensions = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
  const extension = typeof fileName === "string" && /^[a-z0-9][a-z0-9_-]{0,150}\.(?:png|jpe?g|webp)$/i.test(fileName)
    ? fileName.split(".").at(-1).toLowerCase() : null;
  if (!extension || typeof sourceUrl !== "string" || sourceUrl.length > 4096 || /[\u0000-\u0020\u007f\\]/u.test(sourceUrl)) return null;
  let url;
  try { url = new URL(sourceUrl); } catch { return null; }
  if (url.origin !== "https://images.squarespace-cdn.com" || url.username || url.password || url.hash) return null;
  const match = /^\/content\/([a-f0-9]{24})\/([a-f0-9-]+)\/([^/]+)$/.exec(url.pathname);
  const params = [...url.searchParams];
  if (match?.[1] !== SITE_LIBRARY || !UUID.test(match[2]) || match[3] !== fileName || params.length !== 1
      || params[0][0] !== "content-type" || params[0][1] !== extensions[extension]) return null;
  // The observed Assets thumbnail and v1 URL share the same asset identity.
  const media = identifySquarespacePageAsset(`${url.origin}/content/v1/${SITE_LIBRARY}/${match[2]}/${fileName}`);
  return media.status === "observed" ? { assetId: media.identity.assetId, sourceUrl: media.originalSource } : null;
}

/** Also serialized into the Squarespace editor frame. Keep this function self-contained. */
export function isSquarespaceEmptyCodeLine(line) {
  if (line?.tagName !== "DIV" || !(line.getAttribute("class") || "").split(/\s+/u).includes("cm-line")) return false;
  const nodes = [...line.childNodes];
  const bareBreak = node => node?.nodeType === 1 && node.tagName === "BR"
    && node.getAttributeNames().length === 0 && node.childNodes.length === 0;
  if (nodes.length === 0 || (nodes.length === 1 && (bareBreak(nodes[0])
      || nodes[0].nodeType === 3 && nodes[0].nodeValue === ""))) return true;
  if (nodes.length !== 3) return false;
  const [buffer, placeholder, lineBreak] = nodes;
  const exact = (node, tag, attrs) => node.nodeType === 1 && node.tagName === tag
    && node.getAttributeNames().length === Object.keys(attrs).length
    && Object.entries(attrs).every(([key, value]) => node.getAttribute(key) === value);
  return exact(buffer, "IMG", { class: "cm-widgetBuffer", "aria-hidden": "true" }) && buffer.childNodes.length === 0
    && exact(placeholder, "SPAN", { class: "cm-placeholder", "aria-hidden": "true", contenteditable: "false", style: "pointer-events: none;" })
    && placeholder.childNodes.length === 1 && placeholder.childNodes[0].nodeType === 3
    && placeholder.childNodes[0].nodeValue === "Code hinzufügen\u00a0..." && bareBreak(lineBreak);
}

/** Serialized into the actual top/preview frame. Reads rendered DOM only; never changes focus or state. */
export function squarespacePageObservationDom({ scope, expectedPageId = null, expectedFluidSectionId, requirePreviewBinding = false,
  fnCode, figureStyles, mapSectionAttribute, blockId, expectedCode, defaultCode } = {}, isEmptyCodeLine) {
  const reasons = [], maxItems = 200, maxBlocks = 1000;
  const rendered = (element, modalBackground = false) => {
    if (!element || !element.getClientRects().length) return false;
    let current = element, depth = 0;
    for (; current && depth < 100; current = current.parentElement, depth++) {
      const style = getComputedStyle(current);
      if (style.display === "none" || ["hidden", "collapse"].includes(style.visibility) || Number(style.opacity) === 0
          || style.contentVisibility === "hidden" || current.hidden === true || current.getAttribute("hidden") !== null
          || !modalBackground && (current.inert === true || current.getAttribute("inert") !== null
            || current.getAttribute("aria-hidden") === "true")) return false;
    }
    return current === null;
  };
  const visible = element => rendered(element);
  const boundedText = (value, limit) => typeof value === "string" && value.length <= limit ? value : null;
  const collection = () => /^collection-([a-f0-9]{24})$/.exec(document.body?.id || "")?.[1] || null;
  const identity = () => ({ id: collection(), url: boundedText(document.URL || document.location?.href || "", 4096) });
  const dialogs = () => [...document.querySelectorAll('[role="dialog"]')].filter(visible);
  const labelText = element => element.textContent?.trim().replace(/\s+/gu, " ");
  const disabled = element => element.getAttribute("disabled") !== null || element.getAttribute("aria-disabled") === "true";
  if (scope === "settings") {
    const open = dialogs();
    if (open.length !== 1) return { reason: open.length ? "page-settings-ambiguous" : "page-settings-unobserved" };
    const dialog = open[0];
    const buttons = [...dialog.querySelectorAll("button")].filter(visible);
    if (buttons.some(button => labelText(button) === "Speichern" && !disabled(button))) return { reason: "page-settings-unsaved" };
    const fields = label => [...dialog.querySelectorAll(`input[type="text"][aria-label="${label}"]`)].filter(visible);
    const titles = fields("Seitentitel"), slugs = fields("URL-Slug");
    const switches = [...dialog.querySelectorAll('input[type="checkbox"][aria-labelledby]')].filter(input => {
      const reference = input.getAttribute("aria-labelledby");
      if (!/^[A-Za-z0-9_:-]{1,80}$/.test(reference || "") || !visible(input.parentElement) || !input.getClientRects().length) return false;
      const selector = `[id="${reference}"]`;
      const labels = [...document.querySelectorAll(selector)];
      return labels.length === 1 && dialog.querySelector(selector) === labels[0] && visible(labels[0]) && labelText(labels[0]) === "Seite aktivieren";
    });
    if (titles.length !== 1 || slugs.length !== 1 || switches.length !== 1) return { reason: "page-settings-controls-unqualified" };
    const title = boundedText(titles[0].value, 300), slug = boundedText(slugs[0].value, 1023), checked = switches[0].checked;
    const notices = buttons.filter(button => labelText(button) === "Diese Seite ist deaktiviert");
    if (!title?.trim() || !slug || typeof checked !== "boolean" || (checked ? notices.length !== 0 : notices.length !== 1 || !disabled(notices[0]))) {
      return { reason: "page-settings-controls-unqualified" };
    }
    if (requirePreviewBinding) {
      const previews = [...document.querySelectorAll("iframe#sqs-site-frame")];
      const modalId = dialog.getAttribute("data-modal-id");
      if (previews.length !== 1 || !/^m[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(modalId || "")) return { reason: "page-settings-preview-unqualified" };
      return { title, slug, displayedEnabled: checked, modalId, previewSource: boundedText(previews[0].src, 4096) };
    }
    return { title, slug, displayedEnabled: checked };
  }
  if (scope === "code-dialog") {
    if (typeof expectedCode !== "string") return null;
    const open = dialogs();
    const frames = [...document.querySelectorAll("iframe#sqs-site-frame")];
    // The code dialog takes focus and hides the still rendered preview from accessibility.
    if (frames.length !== 1 || !rendered(frames[0], true) || open.length !== 1 || open[0].getAttribute("data-test") !== "block-editor-container"
        || open[0].getAttribute("aria-label") !== "Block-Editor-Formular") return null;
    const [dialog] = open, modalId = dialog.getAttribute("data-modal-id");
    if (!/^m[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(modalId || "")) return null;
    const fields = [...dialog.querySelectorAll('[role="textbox"]')].filter(visible);
    const mode = [...dialog.querySelectorAll('[role="combobox"]')].filter(visible);
    const checkboxes = [...dialog.querySelectorAll('input[type="checkbox"]')].filter(visible);
    if (fields.length !== 1 || mode.length !== 1 || labelText(mode[0]) !== "HTML" || checkboxes.length !== 1 || checkboxes[0].checked !== false) return null;
    const editor = fields[0];
    if (editor.getAttribute("data-language") !== "html" || editor.getAttribute("aria-multiline") !== "true"
        || editor.getAttribute("contenteditable") !== "true" || !(editor.getAttribute("class") || "").split(/\s+/u).includes("cm-content")) return null;
    const lines = [...editor.children];
    const expectedLines = expectedCode.split("\n");
    if (!lines.length || lines.length > Math.max(16, expectedLines.length)
        || [...editor.childNodes].some(node => node.nodeType !== 1 && node.nodeValue?.trim())
        || lines.some((line, index) => line.tagName !== "DIV" || !visible(line)
        || !(line.getAttribute("class") || "").split(/\s+/u).includes("cm-line")
        || line.textContent.length > Math.max(256, expectedLines[index]?.length ?? 0))) return null;
    const sourceMatches = expectedCode === ""
      ? lines.length === 1 && typeof isEmptyCodeLine === "function" && isEmptyCodeLine(lines[0])
      : lines.map(line => line.textContent).join("\n") === expectedCode;
    return { modalId, iframeSource: boundedText(frames[0].src, 4096), sourceMatches };
  }
  function managerItems(dialog) {
    const rows = [...dialog.querySelectorAll('[data-cypress="draggable-item"]')];
    const values = rows.filter(item => item.tagName === "DIV" && item.getAttribute("role") === "button" && visible(item));
    const modalId = dialog.getAttribute("data-modal-id");
    const binding = /^m[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(modalId || "")
      ? { modalId, renderedRowsEmpty: rows.length === 0 } : {};
    if (values.length > maxItems) return { status: "unsupported", reasonCodes: ["gallery-item-budget"], items: [] };
    return { ...binding, status: values.length ? "observed" : "unknown", reasonCodes: values.length ? [] : ["gallery-editor-items-unobserved"], items: values.map(item => {
      const images = [...item.querySelectorAll("img")].filter(visible);
      return { cmsItemId: boundedText(item.getAttribute("data-itemid"), 160), index: boundedText(item.getAttribute("data-index"), 8),
        sourceUrl: images.length === 1 ? boundedText(images[0].currentSrc || images[0].getAttribute("src") || "", 4096) : null,
        sourceCount: images.length };
    }) };
  }
  if (scope === "top") {
    const frames = [...document.querySelectorAll("iframe#sqs-site-frame")].filter(visible);
    const managers = dialogs().filter(dialog => dialog.getAttribute("data-test") === "gallery-manager-modal" || dialog.querySelector('[data-test="gallery-manager-modal"]'));
    return { scope: "top", iframeCount: frames.length, iframeSource: frames.length === 1 ? boundedText(frames[0].src || frames[0].getAttribute("src") || "", 4096) : null,
      // A disabled badge, absent Save button, or page preview cannot certify settings or persistence.
      enabled: null, saved: null, reopened: null,
      modalOpen: ['[role="dialog"]', '[role="alertdialog"]', '[aria-modal="true"]']
        .some(selector => [...document.querySelectorAll(selector)].some(visible)),
      galleryEditor: managers.length === 1 ? managerItems(managers[0]) : { status: managers.length ? "unsupported" : "unknown",
        reasonCodes: [managers.length ? "gallery-editor-ambiguous" : "gallery-editor-unobserved"], items: [] } };
  }
  const page = identity();
  if (!["frame", "code-selection", "editor-layout"].includes(scope) || !page.id || expectedPageId && page.id !== expectedPageId) return { scope: "frame", page, status: "unknown",
    reasonCodes: [!page.id ? "collection-identity-unobserved" : "collection-identity-mismatch"], textBlocks: [], galleries: [] };
  const mains = [...document.querySelectorAll("main")].filter(visible);
  if (mains.length !== 1) return { scope: "frame", page, status: "unknown", reasonCodes: [mains.length ? "page-main-ambiguous" : "page-main-unobserved"], textBlocks: [], galleries: [] };
  const articles = [...mains[0].querySelectorAll("article")].filter(visible);
  if (articles.length !== 1) return { scope: "frame", page, status: "unknown", reasonCodes: [articles.length ? "page-article-ambiguous" : "page-article-unobserved"], textBlocks: [], galleries: [] };
  if (scope === "code-selection") {
    const selected = [...document.querySelectorAll('[role="gridcell"][aria-selected="true"]')].filter(visible);
    const blocks = [...document.querySelectorAll(`[id="${blockId}"]`)];
    if (selected.length !== 1 || selected[0].getAttribute("data-block-id") !== blockId.slice(6)
        || articles[0].querySelector(`[id="${blockId}"]`) !== blocks[0]
        || blocks.length !== 1 || selected[0].querySelector(`[id="${blockId}"]`) !== blocks[0]
        || blocks[0].getAttribute("data-sqsp-block") !== "code" || blocks[0].getAttribute("data-definition-name") !== "website.components.code") return null;
    return { page, blockId };
  }
  const article = articles[0], gallerySelector = 'section[data-sqsp-section="gallery"]';
  const selector = `[id^="block-"],${gallerySelector}${scope === "editor-layout" ? ",[data-sqsp-block]" : ""}`;
  const candidates = [...article.querySelectorAll(selector)];
  const contents = candidates.filter(visible);
  if (contents.length > maxBlocks) return { scope: "frame", page, status: "unsupported", reasonCodes: ["page-block-budget"], textBlocks: [], galleries: [] };
  const sections = contents.filter(element => element.tagName === "SECTION" && element.getAttribute("data-sqsp-section") === "gallery");
  const containers = contents.filter(element => element.getAttribute("id")?.startsWith("block-"));
  const textBlocks = [], observedOrder = new Map();
  let textBudget = 0;
  function inline(node) {
    if (node.nodeType === 3) return node.nodeValue || "";
    if (node.nodeType !== 1 || node.tagName.toUpperCase() !== "BR") return null;
    return "\n";
  }
  function inlineContent(element) {
    const pieces = [...element.childNodes].map(inline);
    if (pieces.some(value => value === null)) return null;
    const text = pieces.join(""); textBudget += text.length;
    return text.length <= 100000 && textBudget <= 1000000 ? text : null;
  }
  function semantic(element) {
    if (!visible(element)) return null;
    const tag = element.tagName.toUpperCase();
    if (/^H[1-6]$/.test(tag) || tag === "P") {
      const text = inlineContent(element); if (text === null) return null;
      return tag === "P" ? { type: "paragraph", text } : { type: "heading", level: Number(tag[1]), text };
    }
    if (!["UL", "OL"].includes(tag) || tag === "OL" && ![null, "1"].includes(element.getAttribute("start"))) return null;
    const children = [...element.children]; if (!children.length || children.length > 100 || children.some(child => child.tagName.toUpperCase() !== "LI")) return null;
    const items = children.map(child => {
      const content = child.children.length === 1 && child.children[0].tagName.toUpperCase() === "P" ? child.children[0] : child;
      return visible(content) ? inlineContent(content) : null;
    });
    return items.some(value => value === null || value.length > 10000) ? null : { type: tag === "UL" ? "bullet-list" : "numbered-list", items };
  }
  const blockCounts = new Map();
  for (const container of containers) {
    const id = container.getAttribute("id"); blockCounts.set(id, (blockCounts.get(id) || 0) + 1);
  }
  const nestedInBlock = container => {
    let parent = container.parentElement, depth = 0;
    for (; parent && parent !== article && depth < 100; parent = parent.parentElement, depth++) {
      if (parent.getAttribute("id")?.startsWith("block-")) return true;
    }
    return parent !== article;
  };
  const hasClass = (element, className) => (element.getAttribute("class") || "").split(/\s+/u).includes(className);
  const blockIdPattern = /^block-(?:[a-f0-9]{20}|[a-f0-9]{24}|yui_3_17_2_1_[0-9]{13}_[0-9]{1,12})$/;
  function observeFluidOrder() {
    if (!/^[a-f0-9]{24}$/.test(expectedFluidSectionId)) return null;
    const sections = [...document.querySelectorAll(`section[data-section-id="${expectedFluidSectionId}"]`)];
    const [section] = sections;
    if (sections.length !== 1 || section.getAttribute("data-sqsp-section") !== "fluid-engine" || !visible(section)
        || ![...article.querySelectorAll("section")].includes(section)) return null;
    const grids = [...section.querySelectorAll(".fluid-engine")], [grid] = grids;
    if (grids.length !== 1 || !visible(grid) || getComputedStyle(grid).display !== "grid") return null;
    const wrappers = [...section.querySelectorAll(".fe-block")];
    const blocks = [...section.querySelectorAll(`[id^="block-"],[data-sqsp-block],${gallerySelector}`)];
    if (wrappers.length !== blocks.length || blocks.length > maxBlocks) return null;
    const gridRect = grid.getBoundingClientRect();
    const { left, top, right, bottom } = gridRect;
    if (![left, top, right, bottom].every(Number.isFinite) || left >= right || top > bottom) return null;
    const ids = new Set(), bounds = [];
    let previousBottom = top;
    for (const [index, wrapper] of wrappers.entries()) {
      const block = blocks[index], id = block.getAttribute("id");
      const children = wrapper.querySelectorAll('[id^="block-"]');
      if (wrapper.parentElement !== grid || children.length !== 1 || children[0] !== block || !visible(block)
          || !blockIdPattern.test(id || "") || ids.has(id)) return null;
      const rect = wrapper.getBoundingClientRect();
      if (![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)
          || rect.left < left || rect.right > right || rect.left >= rect.right
          || rect.top < previousBottom || rect.bottom > bottom || rect.top >= rect.bottom) return null;
      // The grid box can end above a wrapped heading's final line. Reserve the
      // rendered line's space as well when checking the following block.
      const headings = [...block.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(heading => heading.textContent.trim());
      if (headings.length > maxBlocks) return null;
      const headingBounds = [];
      let contentBottom = rect.bottom;
      for (const heading of headings) {
        if (!visible(heading)) return null;
        const range = document.createRange();
        range.selectNodeContents(heading);
        const lines = [...range.getClientRects()].filter(line => line.right > line.left && line.bottom > line.top);
        if (!lines.length) return null;
        for (const line of lines) {
          if (![line.left, line.top, line.right, line.bottom].every(Number.isFinite)
              || line.left < left || line.right > right || line.bottom > bottom) return null;
          contentBottom = Math.max(contentBottom, line.bottom);
          headingBounds.push([line.left - left, line.top - top, line.right - left, line.bottom - top]);
        }
      }
      ids.add(id);
      bounds.push([rect.left - left, rect.top - top, rect.right - left, rect.bottom - top, headingBounds]);
      previousBottom = contentBottom;
    }
    const allBlocks = [...document.querySelectorAll('[id^="block-"]')];
    if (allBlocks.filter(block => ids.has(block.getAttribute("id"))).length !== ids.size) return null;
    // Keep geometry only in the paired frame reads. The caller receives the proven IDs.
    return { fluidVisualOrder: [...ids], fluidVisualBounds: bounds };
  }
  const fluid = expectedFluidSectionId === undefined ? undefined : observeFluidOrder();
  if (fluid === null) return { page, status: "unknown", reasonCodes: ["fluid-visual-order-unqualified"] };
  function hasBoundYuiGridCell(container) {
    const id = container.getAttribute("id");
    if (!/^block-yui_3_17_2_1_[0-9]{13}_[0-9]{1,12}$/.test(id || "")) return false;
    for (let parent = container.parentElement, depth = 0; parent && parent !== article && depth < 100; parent = parent.parentElement, depth++) {
      if (parent.getAttribute("role") !== "gridcell") continue;
      const cellId = id.slice(6);
      const cells = document.querySelectorAll(`[role="gridcell"][data-block-id="${cellId}"]`);
      return cells.length === 1 && cells[0] === parent && visible(parent);
    }
    return false;
  }
  const hasBlockKind = (container, kind, definition) => hasClass(container, `sqs-block-${definition}`)
    && container.getAttribute("data-definition-name") === `website.components.${definition}`
    && container.getAttribute("data-sqsp-block") === kind;
  function isBoundGridText(container) {
    return [null, "1337"].includes(container.getAttribute("data-block-type")) && hasBlockKind(container, "text", "html")
      && hasBoundYuiGridCell(container);
  }
  function renderedText(container, gridText) {
    if ((!gridText && (container.getAttribute("data-block-type") !== "1337" || !hasBlockKind(container, "text", "html")))
        || container.querySelector('[contenteditable="true"]')) return null;
    let current = container;
    for (const className of ["sqs-block-content", "sqs-text-block-container", "sqs-html-content"]) {
      const next = [...current.children].filter(child => child.tagName === "DIV" && hasClass(child, className));
      if (next.length !== 1 || !visible(next[0])) return null;
      current = next[0];
    }
    return current.getAttribute("data-sqsp-text-block-content") !== null ? current : null;
  }
  function renderedCodeContainer(container) {
    const blockType = container.getAttribute("data-block-type");
    if (!hasBlockKind(container, "code", "code")
        || (blockType !== "1337" && (blockType !== null || !hasBoundYuiGridCell(container)))) return null;
    const content = [...container.children].filter(child => child.tagName === "DIV" && hasClass(child, "sqs-block-content"));
    if (content.length !== 1) return null;
    const [wrapper, ...siblings] = content[0].children;
    if (!wrapper || wrapper.tagName !== "DIV" || !hasClass(wrapper, "sqs-code-container") || !visible(wrapper)) return null;
    // The native Fluid Engine adds two stylesheet siblings outside the editable code.
    if (siblings.length !== 0 && (!hasBoundYuiGridCell(container) || siblings.length !== 2
        || !siblings.every((node, index) => node.tagName === "STYLE"
          && node.getAttribute("class") === ["transform-vars", "transform-overrides-vars"][index]))) return null;
    return wrapper;
  }
  if (scope === "editor-layout") {
    const editorBlocks = [];
    const unknown = () => ({ page, status: "unknown", reasonCodes: ["editor-layout-unqualified"] });
    if (contents.length !== candidates.length) return unknown();
    const blank = node => node.nodeType === 3 && !node.nodeValue.trim() || node.nodeType === 1 && node.tagName === "BR";
    for (const block of contents) {
      const id = block.getAttribute("id");
      if (blockCounts.get(id) !== 1 || nestedInBlock(block) || block.querySelector('[id^="block-"]')) return unknown();
      const editors = [...block.querySelectorAll('[contenteditable="true"][role="textbox"]')];
      const code = editors.length === 0 && renderedCodeContainer(block);
      if (code && blockIdPattern.test(id)) {
        const markup = code.innerHTML;
        editorBlocks.push({ kind: "code", id, empty: typeof markup === "string" && markup.trim() === "",
          ...(fluid && typeof defaultCode === "string" && markup === defaultCode && { defaultPlaceholder: true }) });
        continue;
      }
      const gridText = isBoundGridText(block);
      const editor = editors.length === 1 ? editors[0] : editors.length === 0 ? renderedText(block, gridText) : null;
      const declaredKind = block.getAttribute("data-sqsp-block");
      if ((!gridText && !/^block-[a-f0-9]{24}$/.test(id)) || !visible(editor)
          || declaredKind !== null && declaredKind !== "text"
          || editor.getAttribute("aria-readonly") === "true" || editor.getAttribute("aria-disabled") === "true") return unknown();
      editorBlocks.push({ kind: "text", id, empty: [...editor.childNodes].every(node =>
        blank(node) || node.nodeType === 1 && node.tagName === "P" && [...node.childNodes].every(blank)) });
    }
    return { page, status: "partial", editorBlocks, ...fluid };
  }
  function renderedFnModule(wrapper) {
    const markup = wrapper?.innerHTML;
    if (!fnCode) return null;
    if (typeof markup !== "string" || markup.length > 1024) return null;
    if (markup.trim() === fnCode.species) return "species";
    if (markup.trim() === fnCode.map) return "map";
    return null;
  }
  function renderedMapElements(wrapper) {
    if (!wrapper || !mapSectionAttribute || wrapper.children.length !== 1) return null;
    const [group] = wrapper.children;
    if (group.tagName !== "DIV" || group.getAttribute(mapSectionAttribute) !== "1" || group.getAttributeNames().length !== 1
        || !visible(group) || ![wrapper, group].every(node => [...node.childNodes].every(child => child.nodeType === 1
          || child.nodeType === 3 && !child.nodeValue.trim()))) return null;
    const children = [...group.children], map = children.pop();
    if (map?.tagName !== "DIV" || map.getAttribute("id") !== "map-wrapper" || !visible(map)
        || map.getAttribute("style") !== "position:relative; width:100%; overflow:hidden;" || map.getAttributeNames().length !== 2
        || map.children.length !== 1 || map.children[0].tagName !== "DIV" || map.children[0].getAttribute("id") !== "map-output"
        || map.children[0].getAttribute("style") !== "width:100%;" || map.children[0].getAttributeNames().length !== 2
        || document.querySelectorAll('[id="map-wrapper"]').length !== 1 || document.querySelectorAll('[id="map-output"]').length !== 1
        || children[0]?.tagName !== "H4" || children.length > 300) return null;
    const elements = children.map(semantic);
    return elements.every(Boolean) ? elements : null;
  }
  const galleries = [];
  const sourceUrl = image => boundedText(image.currentSrc || image.getAttribute("src") || "", 4096);
  function figureGallery(wrapper) {
    const roots = wrapper?.querySelectorAll('[data-fn-art-gallery="1"]') || [];
    if (!roots.length) return undefined;
    const root = roots[0];
    const exactAttributes = (element, names) => element.getAttributeNames().length === names.length
      && names.every(name => element.getAttribute(name) !== null);
    const styled = (element, key, names) => exactAttributes(element, [...names, "style"])
      && element.getAttribute("style") === figureStyles[key];
    const structureOnly = element => [...element.childNodes].every(node => node.nodeType === 1 || node.nodeType === 3 && !node.nodeValue.trim());
    if (!figureStyles || roots.length !== 1 || root.tagName !== "DIV" || root.parentElement !== wrapper || wrapper.children.length !== 1
        || !styled(root, "grid", ["data-fn-art-gallery"])
        || !structureOnly(wrapper) || !structureOnly(root) || !visible(root) || root.children.length === 0 || root.children.length > maxItems) return null;
    const marked = root.children[0].getAttribute("data-fn-item-id") !== null;
    const figureAttributes = marked ? ["data-fn-position", "data-fn-item-id"] : ["data-fn-position"];
    const itemIds = new Set(), images = [];
    for (const [index, figure] of [...root.children].entries()) {
      const [image, figcaption] = figure.children;
      if (figure.tagName !== "FIGURE" || figure.getAttribute("data-fn-position") !== String(index + 1) || !visible(figure)
          || !styled(figure, "figure", figureAttributes) || figure.children.length > 2 || !structureOnly(figure)
          || image?.tagName !== "IMG" || !visible(image) || !styled(image, "image", ["src", "alt"])) return null;
      const cmsItemId = figure.getAttribute("data-fn-item-id");
      if (marked) {
        if (!/^fn-figure-[a-f0-9]{24}$/.test(cmsItemId) || itemIds.has(cmsItemId)) return null;
        itemIds.add(cmsItemId);
      }
      const alt = boundedText(image.getAttribute("alt"), 3000);
      if (alt === null) return null;
      let caption = null, attribution = null;
      if (figcaption) {
        if (figcaption.tagName !== "FIGCAPTION" || !exactAttributes(figcaption, []) || !visible(figcaption) || !structureOnly(figcaption)
            || figcaption.children.length === 0 || figcaption.children.length > 2) return null;
        for (const field of figcaption.children) {
          if (!visible(field) || field.children.length) return null;
          if (field.tagName === "SPAN" && styled(field, "text", ["data-fn-caption"]) && field.getAttribute("data-fn-caption") === "" && caption === null && attribution === null) {
            caption = boundedText(field.textContent, 3000);
            if (!caption) return null;
          } else if (field.tagName === "SMALL" && styled(field, "text", ["data-fn-credit"]) && field.getAttribute("data-fn-credit") === "" && attribution === null) {
            attribution = boundedText(field.textContent, 8000);
            if (!attribution) return null;
          } else return null;
        }
      }
      images.push({ sourceUrl: sourceUrl(image), renderedText: { alt, caption, attribution, position: index + 1,
        ...(marked ? { cmsItemId } : {}) } });
    }
    return images;
  }
  for (const container of containers) {
    const cmsBlockId = container.getAttribute("id"), editors = [...container.querySelectorAll('[contenteditable="true"][role="textbox"]')].filter(visible);
    const codeWrapper = editors.length === 0 ? renderedCodeContainer(container) : null;
    const mapElements = renderedMapElements(codeWrapper);
    const module = mapElements ? "map" : renderedFnModule(codeWrapper), figureImages = figureGallery(codeWrapper);
    const gridText = isBoundGridText(container);
    const content = editors.length === 1 ? editors[0] : editors.length === 0 ? renderedText(container, gridText) : null;
    const source = editors.length === 1 ? "editor" : "rendered";
    const idPattern = module || figureImages !== undefined ? blockIdPattern
      : source === "editor" ? /^block-[a-f0-9]{24}$/ : /^block-(?:[a-f0-9]{20}|[a-f0-9]{24})$/;
    if ((!gridText && !idPattern.test(cmsBlockId || "")) || blockCounts.get(cmsBlockId) !== 1
        || nestedInBlock(container) || container.querySelector('[id^="block-"]')) {
      reasons.push("block-identity-unqualified"); continue;
    }
    if (module) { observedOrder.set(container, { kind: module, id: cmsBlockId, ...(mapElements && { mapElements }) }); continue; }
    if (figureImages !== undefined) {
      if (!figureImages) { reasons.push("gallery-figure-markup-unqualified"); continue; }
      galleries.push({ blockId: cmsBlockId, previewImages: figureImages, previewImageCount: figureImages.length, emptyGalleryVerified: false });
      observedOrder.set(container, { kind: "gallery", id: cmsBlockId });
      continue;
    }
    if (!content) { reasons.push(editors.length > 1 ? "text-editor-ambiguous" : "block-editor-type-unobserved"); continue; }
    const blocks = [];
    for (const child of [...content.childNodes]) {
      if (child.nodeType === 3 && !child.nodeValue?.trim()) continue;
      const value = child.nodeType === 1 ? semantic(child) : null;
      if (!value || blocks.length >= 300) { reasons.push("richtext-markup-unqualified"); blocks.length = 0; break; }
      blocks.push(value);
    }
    if (blocks.length) {
      observedOrder.set(container, { kind: "text", id: cmsBlockId });
      textBlocks.push({ cmsBlockId, source, blocks, observedMarkupSupported: true,
        syntheticOnlyMarkup: blocks.some(block => ["bullet-list", "numbered-list"].includes(block.type) || block.type === "heading" && ![3, 4].includes(block.level)) });
    } else reasons.push("text-block-empty-or-unqualified");
  }
  function galleryImageText(image, section) {
    let figure = image.parentElement;
    while (figure && figure !== section && figure.tagName !== "FIGURE") figure = figure.parentElement;
    if (!figure || figure === section || !hasClass(figure, "gallery-grid-item") || figure.querySelectorAll("img").length !== 1) return null;
    const alt = boundedText(image.getAttribute("alt"), 3000);
    if (alt === null) return null;
    const captions = [...figure.querySelectorAll("figcaption")];
    if (captions.length === 0) return { alt, caption: null };
    if (captions.length !== 1 || !visible(captions[0]) || !hasClass(captions[0], "gallery-caption")) return null;
    const lines = [...captions[0].querySelectorAll("p")];
    if (lines.length !== 1 || !visible(lines[0]) || !hasClass(lines[0], "gallery-caption-content")
        || captions[0].textContent.trim() !== lines[0].textContent.trim()) return null;
    const caption = boundedText(lines[0].textContent, 3000);
    return caption === null ? null : { alt, caption };
  }
  const sectionCounts = new Map();
  for (const section of sections) {
    const id = section.getAttribute("data-section-id"); sectionCounts.set(id, (sectionCounts.get(id) || 0) + 1);
  }
  for (const section of sections) {
    const sectionId = section.getAttribute("data-section-id"), images = [...section.querySelectorAll("img")].filter(visible);
    if (!/^[a-f0-9]{24}$/.test(sectionId || "") || sectionCounts.get(sectionId) !== 1) { reasons.push("gallery-section-identity-unqualified"); continue; }
    if (images.length > maxItems) { reasons.push("gallery-image-budget"); continue; }
    galleries.push({ sectionId, previewImages: images.map(image => ({ sourceUrl: sourceUrl(image),
      renderedText: galleryImageText(image, section) })),
      previewImageCount: images.length, emptyGalleryVerified: false });
    observedOrder.set(section, { kind: "gallery", id: sectionId });
  }
  return { scope: "frame", status: textBlocks.length || galleries.length ? "partial" : "unsupported", page, textBlocks, galleries,
    contentOrder: contents.map(element => observedOrder.get(element) || { kind: "unqualified" }),
    ...fluid,
    reasonCodes: [...new Set(reasons.length ? reasons : !textBlocks.length && !galleries.length ? ["editor-content-unqualified"] : [])] };
}

function baseResult(reasonCodes = []) {
  return { status: "unknown", fullCapability: false, pendingDomRead: false, modalOpen: null, page: { id: null, path: null, title: null, enabled: null, saved: null, reopened: null },
    pageSettings: { status: "unknown", path: null, title: null, displayedEnabled: null },
    textBlocks: [], galleries: [], contentOrder: [], galleryEditor: { status: "unknown", boundSectionId: null, items: [], orderObserved: false, fields: fieldsUnobserved() },
    unsupported: ["page-settings", "save-and-reopen", "separate-alt-caption-credit", "code-editor-source", "upload-byte-binding"], reasonCodes };
}
function qualifyEditor(raw) {
  const result = { status: raw?.status || "unknown", boundSectionId: null, items: [], orderObserved: false, fields: fieldsUnobserved(),
    reasonCodes: [...(raw?.reasonCodes || []), "gallery-editor-section-binding-unobserved"] };
  if (/^m[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(raw?.modalId || "")) {
    result.modalId = raw.modalId;
    result.renderedRowsEmpty = raw.status === "unknown" && raw.renderedRowsEmpty === true && raw.items?.length === 0;
  }
  if (raw?.status !== "observed" || !Array.isArray(raw.items) || raw.items.length > 200) return result;
  const seen = new Set();
  for (const item of raw.items) {
    const index = typeof item.index === "string" && /^(?:0|[1-9][0-9]{0,2})$/.test(item.index) ? Number(item.index) : null;
    if (!COLLECTION.test(item.cmsItemId || "") || seen.has(item.cmsItemId) || index !== result.items.length || item.sourceCount !== 1) {
      result.status = "unsupported"; result.reasonCodes.push("gallery-item-order-unqualified");
    }
    seen.add(item.cmsItemId); result.items.push({ cmsItemId: COLLECTION.test(item.cmsItemId || "") ? item.cmsItemId : null, index,
      source: identifySquarespacePageAsset(item.sourceUrl), sourceFingerprint: typeof item.sourceUrl === "string" && item.sourceUrl.length <= 4096
        ? createHash("sha256").update(item.sourceUrl).digest("hex") : null });
  }
  result.orderObserved = result.status === "observed";
  return result;
}

/** Partial current editor observation only. This function cannot create a CMS success receipt. */
export async function readSquarespacePageObservation(webContents, options = {}) {
  const descriptors = options && typeof options === "object" && !isProxy(options) && !Array.isArray(options)
    && Object.getPrototypeOf(options) === Object.prototype ? Object.getOwnPropertyDescriptors(options) : null;
  if (!descriptors || Reflect.ownKeys(descriptors).some(key => !["expectedPageId", "expectedPath", "expectedTitle", "expectedBlockId", "expectedModule", "expectedMapCode", "expectedFluidSectionId", "signal", "timeoutMs", "waitForContentMs", "view"].includes(key)
      || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw failure("SQUARESPACE_OBSERVATION_INPUT", "Die Seitenbeobachtung benötigt ihre feste lokale Bindung.", 400);
  const { expectedPageId, expectedPath, expectedTitle, expectedBlockId, expectedModule, expectedMapCode, expectedFluidSectionId,
    signal, timeoutMs = 2000, waitForContentMs = 0, view = "content" } = options;
  if (expectedPageId !== undefined && (typeof expectedPageId !== "string" || !COLLECTION.test(expectedPageId))
      || expectedPath !== undefined && (typeof expectedPath !== "string" || expectedPath.length > 1024
        || !/^\/(?:[a-z0-9-]+\/)*[a-z0-9-]+$/.test(expectedPath) || expectedPath.startsWith("/config"))
      || signal !== undefined && !(signal instanceof AbortSignal) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000
      || !Number.isSafeInteger(waitForContentMs) || waitForContentMs < 0 || waitForContentMs > 30000
      || !["content", "settings", "code", "editor-layout"].includes(view) || view === "settings" && (!expectedPath || expectedPageId || waitForContentMs)
      || view === "editor-layout" && (!expectedPath || !expectedPageId || waitForContentMs)
      || view === "code" && (!expectedPath || !expectedPageId || typeof expectedBlockId !== "string" || !CODE_BLOCK.test(expectedBlockId)
        || typeof expectedModule !== "string" || !Object.hasOwn(CODE_EDITOR_SOURCES, expectedModule) || waitForContentMs)
      || view !== "code" && (expectedBlockId !== undefined || expectedModule !== undefined)
      || expectedMapCode !== undefined && (view !== "code" || expectedModule !== "map" || typeof expectedMapCode !== "string"
        || expectedMapCode.length > 8 * 1024 * 1024 || !expectedMapCode.startsWith(CMS_MAP_SECTION_PREFIX) || !expectedMapCode.endsWith(CMS_MAP_SECTION_SUFFIX))
      || expectedTitle !== undefined && (view !== "settings" || typeof expectedTitle !== "string" || !expectedTitle.trim() || expectedTitle.length > 300)
      || expectedFluidSectionId !== undefined && (typeof expectedFluidSectionId !== "string" || !COLLECTION.test(expectedFluidSectionId)
        || !expectedPageId || !expectedPath || !["content", "editor-layout"].includes(view))
      || waitForContentMs > 0 && (!expectedPageId || !expectedPath)) throw failure("SQUARESPACE_OBSERVATION_INPUT", "Die Seitenbeobachtung ist ungültig.", 400);
  const checkAbort = () => { if (signal?.aborted) throw failure("SQUARESPACE_OBSERVATION_ABORTED", "Die Seitenbeobachtung wurde abgebrochen."); };
  checkAbort();
  let top, admin;
  try {
    top = webContents?.mainFrame; admin = pageAddress(webContents?.getURL?.());
    if (!top || webContents.isDestroyed?.() || admin?.origin !== ADMIN || admin.path !== "/config/pages") return baseResult(["admin-page-unobserved"]);
  } catch { return baseResult(["preview-observation-unavailable"]); }
  const existing = activeObservations.get(webContents);
  if (existing) return { ...baseResult(["preview-observation-reader-busy"]), pendingDomRead: existing.pending > 0 };
  const job = { pending: 0, finished: false };
  activeObservations.set(webContents, job);
  const release = () => { if (job.finished && !job.pending) activeObservations.delete(webContents); };
  const deadline = waitForContentMs ? performance.now() + waitForContentMs : Infinity;
  const boundAdmin = () => !webContents.isDestroyed?.() && webContents.mainFrame === top
    && sameAddress(pageAddress(webContents.getURL?.()), admin);
  async function read(frame, payload) {
    checkAbort(); let timer, abort;
    const budget = Math.min(timeoutMs, Math.ceil(deadline - performance.now()));
    const timeout = () => failure("SQUARESPACE_OBSERVATION_TIMEOUT", "Die aktuelle Seitenbeobachtung ist noch nicht verfügbar.");
    if (budget < 1) throw timeout();
    try {
      job.pending++;
      const execution = Promise.resolve().then(() => {
        checkAbort();
        const observeDom = `(${squarespacePageObservationDom.toString()})`;
        const observer = payload.scope === "code-dialog" && payload.expectedCode === ""
          ? `(request => ${observeDom}(request, ${isSquarespaceEmptyCodeLine.toString()}))` : observeDom;
        return frame.executeJavaScript(`${observer}(${JSON.stringify(payload)})`, true);
      }).finally(() => { job.pending--; release(); });
      return await Promise.race([
        execution,
        new Promise((_, reject) => { timer = setTimeout(() => reject(timeout()), budget);
          abort = () => reject(failure("SQUARESPACE_OBSERVATION_ABORTED", "Die Seitenbeobachtung wurde abgebrochen.")); signal?.addEventListener("abort", abort, { once: true }); }),
      ]);
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
  }
  async function observe() {
    if (!boundAdmin()) return baseResult(["preview-observation-changed"]);
    const topRaw = await read(top, { scope: "top" }); checkAbort();
    if (!boundAdmin()) return baseResult(["preview-observation-changed"]);
    if (topRaw?.iframeCount !== 1) return baseResult([topRaw?.iframeCount === 0 ? "preview-frame-unobserved" : "preview-frame-ambiguous"]);
    const source = pageAddress(topRaw.iframeSource);
    if (!source || source.path.startsWith("/config")) return baseResult(["preview-address-unqualified"]);
    if (expectedPath && source.path !== expectedPath) return baseResult(["preview-target-mismatch"]);
    const direct = (top.framesInSubtree || []).filter(frame => frame !== top && frame.parent === top && !frame.detached && !frame.isDestroyed?.());
    const candidates = direct.filter(frame => sameAddress(pageAddress(frame.url), source));
    if (waitForContentMs && !candidates.length && (!direct.length || direct.length === 1 && direct[0].url === "about:blank")) {
      return baseResult(["preview-frame-loading"]);
    }
    if (candidates.length !== 1) return baseResult(["direct-preview-frame-unqualified"]);
    const frame = candidates[0], frameRequest = { scope: view === "editor-layout" ? view : "frame", expectedPageId: expectedPageId || null,
      fnCode: FN_CODE, figureStyles: FN_FIGURE_STYLES, mapSectionAttribute: CMS_MAP_SECTION_ATTRIBUTE, expectedFluidSectionId,
      defaultCode: SQUARESPACE_DEFAULT_CODE };
    const raw = await read(frame, frameRequest); checkAbort();
    if (raw?.status === "unknown" || !COLLECTION.test(raw?.page?.id || "") || expectedPageId && raw.page.id !== expectedPageId) return baseResult(raw?.reasonCodes || ["collection-identity-unobserved"]);
    if (!sameAddress(pageAddress(raw.page.url), source)) return baseResult(["preview-document-address-mismatch"]);
    const [again, frameAgain] = await Promise.all([read(top, { scope: "top" }), read(frame, frameRequest)]); checkAbort();
    if (!boundAdmin() || frame.detached || frame.parent !== top
        || !(top.framesInSubtree || []).includes(frame) || again?.iframeCount !== 1 || !sameAddress(pageAddress(again.iframeSource), source)
        || !sameAddress(pageAddress(frame.url), source) || !isDeepStrictEqual(frameAgain, raw)) return baseResult(["preview-observation-changed"]);
    const result = baseResult(raw.reasonCodes || []);
    result.status = raw.status; result.page.id = raw.page.id; result.page.path = source.path;
    result.modalOpen = typeof again.modalOpen === "boolean" && again.modalOpen === topRaw.modalOpen ? again.modalOpen : null;
    if (expectedFluidSectionId !== undefined) {
      if (result.modalOpen !== false || !Array.isArray(raw.fluidVisualOrder)) return baseResult(["fluid-visual-order-unqualified"]);
      result.fluidVisualOrder = raw.fluidVisualOrder;
    }
    if (view === "editor-layout") {
      if (result.modalOpen !== false || !Array.isArray(raw.editorBlocks)) return baseResult(["editor-layout-unqualified"]);
      result.editorBlocks = raw.editorBlocks;
      return result;
    }
    result.textBlocks = raw.textBlocks || [];
    result.contentOrder = raw.contentOrder || [];
    result.galleries = (raw.galleries || []).map(gallery => ({ ...gallery, fields: fieldsUnobserved(), items: [], orderObserved: false,
      previewImages: gallery.previewImages.map(image => ({ ...identifySquarespacePageAsset(image.sourceUrl), renderedText: image.renderedText ?? null })) }));
    const galleryEditor = isDeepStrictEqual(topRaw.galleryEditor, again.galleryEditor) ? again.galleryEditor
      : { status: "unknown", reasonCodes: ["gallery-editor-observation-changed"] };
    result.galleryEditor = qualifyEditor(galleryEditor);
    return result;
  }
  try {
    if (view === "code") {
      const dialogRequest = { scope: "code-dialog", expectedCode: expectedMapCode ?? CODE_EDITOR_SOURCES[expectedModule] };
      const first = await read(top, dialogRequest), address = pageAddress(first?.iframeSource);
      if (!boundAdmin() || address?.path !== expectedPath) return baseResult(["code-editor-unqualified"]);
      const frames = (top.framesInSubtree || []).filter(frame => frame.parent === top && !frame.detached
        && !frame.isDestroyed?.() && sameAddress(pageAddress(frame.url), address));
      if (frames.length !== 1) return baseResult(["code-preview-unqualified"]);
      const [frame] = frames, request = { scope: "code-selection", expectedPageId, blockId: expectedBlockId };
      const selected = await read(frame, request);
      if (selected?.blockId !== expectedBlockId || selected?.page.id !== expectedPageId
          || !sameAddress(pageAddress(selected.page.url), address)) return baseResult(["code-selection-unqualified"]);
      const second = await read(top, dialogRequest), selectedAgain = await read(frame, request);
      if (!boundAdmin() || frame.detached || frame.isDestroyed?.() || frame.parent !== top || !(top.framesInSubtree || []).includes(frame)
          || !sameAddress(pageAddress(frame.url), address) || !isDeepStrictEqual(first, second) || !isDeepStrictEqual(selected, selectedAgain)) {
        return baseResult(["code-editor-observation-changed"]);
      }
      if (!first.sourceMatches) return baseResult(["code-source-mismatch"]);
      const result = baseResult();
      result.status = "partial";
      result.page.id = expectedPageId;
      result.page.path = expectedPath;
      result.modalOpen = true;
      result.codeEditor = { status: expectedModule === "empty" ? "empty" : "source-matched", blockId: expectedBlockId,
        module: expectedModule, modalId: first.modalId };
      if (expectedModule !== "empty") result.unsupported = result.unsupported.filter(item => item !== "code-editor-source");
      return result;
    }
    if (view === "settings") {
      const request = { scope: "settings", requirePreviewBinding: expectedTitle !== undefined };
      const settings = await read(top, request); checkAbort();
      if (!boundAdmin()) return baseResult(["page-settings-observation-changed"]);
      if (settings?.reason) return baseResult([settings.reason]);
      if (typeof settings?.slug !== "string" || `/${settings.slug}` !== expectedPath) return baseResult(["page-settings-target-mismatch"]);
      if (expectedTitle !== undefined && (settings.title !== expectedTitle || pageAddress(settings.previewSource)?.path !== expectedPath)) {
        return baseResult(["page-settings-preview-mismatch"]);
      }
      const again = await read(top, request); checkAbort();
      if (!boundAdmin() || !isDeepStrictEqual(settings, again)) return baseResult(["page-settings-observation-changed"]);
      const result = baseResult();
      result.status = "partial";
      result.pageSettings = { status: expectedTitle === undefined ? "observed" : "preview-path-matched",
        path: `/${settings.slug}`, title: settings.title, displayedEnabled: settings.displayedEnabled };
      return result;
    }
    let result = await observe();
    while (waitForContentMs && result.reasonCodes.length === 1 && LOADING_REASONS.has(result.reasonCodes[0])) {
      const remaining = deadline - performance.now();
      if (remaining <= 0) return baseResult([...result.reasonCodes, "preview-content-wait-expired"]);
      await delay(Math.min(250, Math.ceil(remaining)), undefined, { signal });
      checkAbort();
      if (performance.now() >= deadline) return baseResult([...result.reasonCodes, "preview-content-wait-expired"]);
      result = await observe();
    }
    checkAbort();
    return performance.now() < deadline ? result : baseResult(["preview-content-wait-expired"]);
  } catch (error) {
    if (signal?.aborted || error?.code === "SQUARESPACE_OBSERVATION_ABORTED") throw failure("SQUARESPACE_OBSERVATION_ABORTED", "Die Seitenbeobachtung wurde abgebrochen.");
    const result = baseResult([error?.code === "SQUARESPACE_OBSERVATION_TIMEOUT" ? "preview-observation-timeout" : "preview-observation-unavailable"]);
    result.pendingDomRead = job.pending > 0;
    return result;
  } finally { job.finished = true; release(); }
}
