import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import { isProxy } from "node:util/types";
import { canonicalWebsiteImageSource, normalizeWebsitePageUrl } from "../website-alt-parser.mjs";
import { websiteAltCaptionMatchesText } from "../website-alt-policy.mjs";
import { createSquarespaceIndependentImageTransfer } from "./squarespace-independent-images.mjs";
import { observeSquarespaceAdminNeutralDraft, observeSquarespaceAdminTarget } from "./squarespace-admin-target.mjs";
import { inspectSquarespaceAssetLibrary, uploadSquarespaceLibraryImage } from "./squarespace-assets-library.mjs";
import { observeSquarespacePageCreationCatalog, selectSquarespaceBlankPage } from "./squarespace-page-creation-catalog.mjs";
import { squarespacePageCreationCatalogDom } from "./squarespace-page-creation-catalog-dom.mjs";
import { isSquarespaceEmptyCodeLine, readSquarespacePageObservation, SQUARESPACE_DEFAULT_CODE } from "./squarespace-page-observation.mjs";
import { squarespacePageSearchDom } from "./squarespace-page-search-dom.mjs";
import { observeSquarespacePublicNeutralDraft, observeSquarespacePublicTarget } from "./squarespace-public-target.mjs";
import { squarespacePageSettingsControlsDom } from "./squarespace-page-settings-controls.mjs";
import { createSquarespaceBoundGalleryReadback, createSquarespaceGalleryReadback, prepareSquarespaceFigureGallery, submitSquarespaceGalleryFile,
  uploadSquarespaceFigureGallery, uploadSquarespaceLibraryImages } from "./squarespace-page-gallery.mjs";
import { createSquarespacePageReadback } from "./squarespace-page-readback.mjs";
import { confirmSquarespaceDisabledPage, insertSquarespacePageText, isCurrentSquarespaceDisabledPage } from "./squarespace-page-text.mjs";
import { cmsTextStepElements, createCmsContentSteps } from "../page-authoring/cms-content-steps.mjs";
import { cmsNeutralDraftPath, cmsTargetPath, validateCmsDispatchBinding, validateCmsTargetObservation } from "../page-authoring/cms-dispatch.mjs";
import { validateCmsSaveBinding } from "../page-authoring/cms-save-binding.mjs";

const ADMIN = "https://vanilla-gerbil-jwnp.squarespace.com";
const PERSISTED_BLANK_DRAFT = Object.freeze({ path: "/neue-seite", title: "Neue Seite" });
const TOOLBAR_LABELS = new Set(["Bearbeiten", "Edit", "Speichern", "Save", "Beenden", "Verlassen", "Exit",
  "Fertig", "Done"]);
const GALLERY_STAGES = new Set(["open-gallery", "select-image", "description", "input", "close-gallery", "exit-page"]);
const GALLERY_ACCESS = new Set(["frame", "frame-parent", "source-point", "map", "map-frame-count", "map-frame-url", "map-transform",
  "map-dimensions", "map-hit-test", "frame-changed", "control", "opened"]);
const MAP_BLOCKS = new Set(["frame-count", "frame-url", "transform", "dimensions", "hit-test"]);
const EDITOR_COUNTS = ["rawToolbarRegions", "toolbarRegions", "nestedRegionPairs", "editButtons", "saveButtons", "exitButtons",
  "disabledSaveButtons", "boundEditButtons", "boundSaveButtons", "boundExitButtons"];
const DISPLAY_STATES = new Set(["none", "block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "contents", "table", "other"]);
const VISIBILITY_STATES = new Set(["visible", "hidden", "collapse", "other"]);
const failure = (message) => Object.assign(new Error(message), { statusCode: 409 });
const stopIfAborted = (signal) => signal?.throwIfAborted();

export function squarespacePageNames(plan) {
  const path = new URL(normalizeWebsitePageUrl(plan.pageUrl)).pathname;
  const title = typeof plan.pageTitle === "string" ? plan.pageTitle.split(/\s[|—]\s/)[0].trim() : "";
  const year = /^\/reisen\/(\d{4})-[^/]+$/.exec(path)?.[1];
  const place = year && title.endsWith(` ${year}`) ? title.slice(0, -year.length - 1).trim() : "";
  return [...new Set([title, decodeURIComponent(path.split("/").at(-1)),
    ...(path === "/" ? ["Home"] : []), ...(place ? [`${year} - ${place}`] : [])].filter(Boolean))];
}

export function assessSquarespaceGalleryField(image, observed) {
  if (image.context !== "content" || image.kind !== "image" || !image.textCoupled) {
    return { status: "unsupported", error: "Dieser Bildfeldtyp ist für die selbstständige Übernahme noch nicht unterstützt." };
  }
  try {
    if (canonicalWebsiteImageSource(observed.sourceUrl) !== canonicalWebsiteImageSource(image.sourceUrl)) {
      return { status: "conflict", error: "Die ausgewählte CMS-Bildquelle stimmt nicht mit der Freigabe überein." };
    }
  } catch { return { status: "conflict", error: "Die CMS-Bildquelle lässt sich nicht eindeutig zuordnen." }; }
  if (observed.description === image.text) return { status: "unchanged" };
  // A public caption collapses HTML whitespace, while the observed alt retains
  // the original CMS description. Accept that representation only when the raw
  // CMS value is still exactly the previously observed alt as well.
  const matchesObservedRawText = observed.description === image.expectedAlt
    && websiteAltCaptionMatchesText(image.expectedCaption, observed.description);
  if (observed.description !== image.expectedCaption && !matchesObservedRawText) {
    return { status: "conflict", error: "Die Bildbeschreibung wurde seit der Prüfung verändert. Bitte zuerst neu abgleichen." };
  }
  if (observed.plainText !== true) {
    return { status: "unsupported", error: "Die Beschreibung enthält Formatierungen. Diese Übernahme benötigt eine gesonderte Prüfung." };
  }
  return { status: "ready" };
}

// All page interaction is confined to the visible editor DOM. No CMS APIs,
// session secrets, framework stores or undocumented server endpoints are used.
function editorDomOperation({ operation, names = [], sourceUrl = "", pageUrl = "", pageId, blockId, sectionId, modalId, kind, defaultCode, allowBlockEdit,
  framePoint = null, frameViewport = null, hovered = false }, emptyCodeLine) {
  const visible = (el) => {
    if (!el || !el.getClientRects().length) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && !["hidden", "collapse"].includes(style.visibility);
  };
  const text = (el) => String(el?.innerText || el?.textContent || "").trim();
  const controlLabel = (value) => String(value || "").replace(/\s+/gu, " ").trim().toLocaleLowerCase("de-DE");
  const hasControlLabel = (el, labels, withTitle = true) => {
    const values = [text(el), el.getAttribute("aria-label"), ...(withTitle ? [el.getAttribute("title")] : [])];
    return values.some((value) => labels.some((label) => controlLabel(value) === controlLabel(label)));
  };
  const canonical = (value) => {
    try { const url = new URL(value, document.baseURI); url.searchParams.delete("format"); return url.href; }
    catch { return ""; }
  };
  const pagePath = (value) => {
    try {
      const url = new URL(value, document.baseURI);
      if (url.protocol !== "https:" || url.username || url.password || url.port
          || !["https://www.fnwildlifetravel.de", "https://fnwildlifetravel.de", "https://vanilla-gerbil-jwnp.squarespace.com"].includes(url.origin)) return null;
      const path = url.pathname.replace(/\/+$/, "") || "/";
      // FN's Home page is publicly served at both paths with the same canonical
      // URL and collection identity; the CMS preview uses its /home slug.
      return path === "/home" ? "/" : path;
    } catch { return null; }
  };
  const buttons = [...document.querySelectorAll("button,[role=button],a")].filter(visible);
  const matchingButtons = (labels) => buttons.filter((el) => hasControlLabel(el, labels));
  const clickPoint = (el, { reveal = true } = {}) => {
    if (!visible(el)) return null;
    if (reveal) el.scrollIntoView({ block: "nearest", inline: "nearest" });
    const rect = el.getBoundingClientRect();
    const width = document.documentElement?.clientWidth, height = document.documentElement?.clientHeight;
    if (![rect.left, rect.top, rect.right, rect.bottom, width, height].every(Number.isFinite)
        || width <= 0 || height <= 0 || rect.width <= 0 || rect.height <= 0
        || rect.left < 0 || rect.top < 0 || rect.right > width || rect.bottom > height) return null;
    const point = { x: Math.floor((rect.left + rect.right) / 2), y: Math.floor((rect.top + rect.bottom) / 2) };
    const hit = document.elementFromPoint?.(point.x, point.y);
    return hit && (hit === el || el.contains(hit) || hit === el.closest('[role="button"]')) ? point : null;
  };
  const hasPageIdentity = () => /^[a-f0-9]{24}$/.test(pageId || "") && document.body?.id === `collection-${pageId}`
    && pagePath(pageUrl) && pagePath(document.URL) === pagePath(pageUrl);
  const articleForPage = () => {
    const mains = [...document.querySelectorAll("main")].filter(visible);
    const articles = mains.length === 1 ? [...mains[0].querySelectorAll("article")].filter(visible) : [];
    return articles.length === 1 ? articles[0] : null;
  };
  const sectionMarkers = "section,[data-section-id],[data-sqsp-section]";
  const pageContentMarkers = `${sectionMarkers},[id^="block-"],[data-block-id],[data-sqsp-block],[contenteditable],img,picture,video,audio,iframe,svg,canvas,object,embed`;
  const emptyLayoutRegion = (article) => {
    // Squarespace's empty page shell can have a region with no editable section or content.
    const regions = [...article.children].filter((node) => node.tagName === "SECTION" && node.children.length === 0
      && node.textContent.trim() === "" && node.getAttribute("class") === "region"
      && node.getAttributeNames().length === 3 && node.hasAttribute("data-region-id") && node.hasAttribute("data-region-source"));
    return regions.length === 1 ? regions[0] : null;
  };
  const firstSectionControlSelector = 'button[data-guidance-engine="guidance-engine-add-section-button"]';
  const knownElement = (node, tag, ...classes) => {
    if (node?.tagName.toUpperCase() !== tag) return false;
    const actual = (node.getAttribute("class") || "").trim().split(/\s+/u).filter(Boolean);
    return actual.length === classes.length && classes.every(name => actual.includes(name));
  };
  const layoutChildren = node => [...node.childNodes].every(child => child.nodeType === 1 || child.nodeType === 8
    || child.nodeType === 3 && !child.nodeValue.trim());
  const onlyChild = node => node?.children.length === 1 && layoutChildren(node) ? node.children[0] : null;
  function knownEditorArticleShell(article) {
    if (!article || article.children.length !== 2 || !layoutChildren(article)) return null;
    const [region, editContainer] = article.children;
    if (!knownElement(region, "SECTION", "region", "sqs-frontend-overlay-editor-widget-host")
        || region.hasAttribute("data-section-id") || region.hasAttribute("data-sqsp-section")
        || region.getAttribute("data-region-source") !== "collection" || !/^[a-f0-9]{24}$/.test(region.getAttribute("data-region-id") || "")
        || !knownElement(editContainer, "DIV", "page-edit-button-container", "non-focusable-button")) return null;
    const editWrapper = onlyChild(editContainer), editButton = onlyChild(editWrapper), editContent = onlyChild(editButton);
    if (!knownElement(editWrapper, "DIV", "page-edit-button-wrapper", "section-toolbar-button-wrapper")
        || editButton?.tagName !== "BUTTON" || !editButton.classList.contains("edit-tool-button") || editButton.hasAttribute("aria-label")
        || editContent?.tagName !== "DIV" || editContent.children.length !== 2 || !layoutChildren(editContent)) return null;
    const [icon, editLabel] = editContent.children, iconPath = onlyChild(icon);
    if (icon?.tagName.toUpperCase() !== "SVG" || !icon.classList.contains("edit-tool-button-icon")
        || iconPath?.tagName.toUpperCase() !== "PATH"
        || iconPath.children.length !== 0 || !layoutChildren(iconPath)
        || editLabel.tagName !== "SPAN" || editLabel.children.length !== 0
        || controlLabel(editLabel.textContent) !== controlLabel("Seite bearbeiten")) return null;
    return { region, icon };
  }
  function emptyEditorShell(article) {
    const shell = knownEditorArticleShell(article);
    if (!shell) return null;
    const { region, icon } = shell;
    const placeholder = onlyChild(region);
    if (!knownElement(placeholder, "DIV", "sqs-empty-section")
        || placeholder.getAttribute("data-section-id") !== "PAGE_SECTIONS-placeholder" || placeholder.hasAttribute("data-sqsp-section")) return null;
    const content = onlyChild(placeholder);
    if (!knownElement(content, "DIV", "sqs-empty-section-content") || !layoutChildren(content)) return null;
    const inner = content.children[content.children.length - 1];
    if (content.children.length === 2) {
      const title = content.children[0];
      if (!knownElement(title, "DIV", "sqs-empty-title") || title.children.length !== 0
          || controlLabel(title.textContent) !== controlLabel("Seiteninhalt hinzufügen")) return null;
    } else if (content.children.length !== 1) return null;
    const hitBox = onlyChild(inner), button = onlyChild(hitBox);
    if (!knownElement(inner, "DIV")
        || !knownElement(hitBox, "DIV", "add-hit-box", "sqs-empty-add-button") || !button?.matches(firstSectionControlSelector)) return null;
    const label = onlyChild(button);
    if (!knownElement(label, "SPAN", "fs-unmask") || label.children.length !== 0
        || controlLabel(label.textContent) !== controlLabel("Abschnitt hinzufügen")) return null;
    const controls = [...document.querySelectorAll(firstSectionControlSelector)];
    const markers = [...article.querySelectorAll(pageContentMarkers)];
    return controls.length === 1 && controls[0] === button && markers.length === 3
      && [region, placeholder, icon].every(node => markers.includes(node)) ? { button, placeholder } : null;
  }
  const emptyPageArticle = (article = articleForPage()) => {
    if (emptyEditorShell(article)) return true;
    if (!article || typeof article.textContent !== "string" || article.textContent.trim()) return false;
    const shell = emptyLayoutRegion(article);
    return [...article.querySelectorAll(pageContentMarkers)].every(node => node === shell);
  };
  const hasBlockIdentity = () => hasPageIdentity()
    && /^block-(?:[a-f0-9]{20}|[a-f0-9]{24}|yui_3_17_2_1_[0-9]{13}_[0-9]{1,12})$/.test(blockId || "");
  const galleryLabels = ["Galerie bearbeiten", "Edit Gallery", "Edit gallery"];
  const galleryControls = (root) => [...root.querySelectorAll("button,[role=button],a")]
    .filter((el) => hasControlLabel(el, galleryLabels));
  const matchingGallerySections = () => [...document.querySelectorAll('section[data-sqsp-section="gallery"]')]
    .filter((section) => [...section.querySelectorAll("img")]
      .some((img) => canonical(img.getAttribute("data-src") || img.currentSrc || img.src) === canonical(sourceUrl)));
  const galleryPortal = (el) => {
    for (let current = el.parentElement; current; current = current.parentElement) {
      if (/^page-region-[a-f0-9]{24}-section-editor-ui-mount$/i.test(current.getAttribute("id") || "")) return current;
    }
    return null;
  };
  const targetPortals = () => [...new Set(galleryControls(document).map(galleryPortal).filter(Boolean))];
  const controlStates = (items) => {
    const displayStates = ["none", "block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "contents", "table", "other"];
    const visibilityStates = ["visible", "hidden", "collapse", "other"];
    const styleValue = (el, key, allowed) => {
      try { const value = getComputedStyle(el)[key]; return allowed.includes(value) ? value : "other"; }
      catch { return "other"; }
    };
    return { total: Math.min(items.length, 20), visible: Math.min(items.filter(visible).length, 20),
      display: [...new Set(items.map((el) => styleValue(el, "display", displayStates)))],
      visibility: [...new Set(items.map((el) => styleValue(el, "visibility", visibilityStates)))] };
  };
  const thumbnailSelector = 'div[data-cypress="draggable-item"][data-itemid][role="button"]';
  const descriptionFields = (editor) => [...editor.querySelectorAll("textarea")].filter((field) => visible(field)
    && field.getAttribute("data-test") !== "rosetta-textarea-shadow-element"
    && ["beschreibung", "description"].includes(controlLabel(field.getAttribute("aria-label"))));
  const galleryDialog = () => {
    const candidates = [...document.querySelectorAll('[role="dialog"]')].filter((dialog) => visible(dialog)
      && (dialog.matches('[data-test="gallery-manager-modal"]') || dialog.querySelector('[data-test="gallery-manager-modal"]'))
      && [...dialog.querySelectorAll(thumbnailSelector)].some(visible) && descriptionFields(dialog).length);
    return candidates.length === 1 ? candidates[0] : null;
  };
  const inside = (rect, bounds) => rect.width > 0 && rect.height > 0
    && rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1
    && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1;
  const paneClip = (pane, editor) => {
    const editorRect = editor.getBoundingClientRect();
    const bounds = { left: editorRect.left, right: editorRect.right, top: editorRect.top, bottom: editorRect.bottom };
    let horizontalClip = false;
    for (let parent = pane.parentElement; parent && editor.contains(parent); parent = parent.parentElement) {
      const style = getComputedStyle(parent), rect = parent.getBoundingClientRect();
      if (["hidden", "clip"].includes(style.overflowX || style.overflow)) {
        horizontalClip = true;
        bounds.left = Math.max(bounds.left, rect.left);
        bounds.right = Math.min(bounds.right, rect.right);
      }
      if (["hidden", "clip"].includes(style.overflowY || style.overflow)) {
        bounds.top = Math.max(bounds.top, rect.top);
        bounds.bottom = Math.min(bounds.bottom, rect.bottom);
      }
      if (parent === editor) break;
    }
    return horizontalClip && bounds.right > bounds.left && bounds.bottom > bounds.top ? bounds : null;
  };
  const pageEditorState = (includeBlockEditor = false) => {
    const iframes = [...document.querySelectorAll("iframe#sqs-site-frame")].filter((el) => {
      const rect = el.getBoundingClientRect();
      return visible(el) && rect.width > 0 && rect.height > 0;
    });
    const rawToolbars = [...document.querySelectorAll('nav,[role="navigation"]')]
      .filter((el) => /Vorschau|Bearbeitung|preview|editing|editor|toolbar/i.test(el.getAttribute("aria-label") || ""));
    const toolbars = rawToolbars.filter(visible);
    const toolbar = toolbars.length === 1 ? toolbars[0] : null;
    const edit = matchingButtons(["Bearbeiten", "Edit"]).filter(el => !el.closest('[role="dialog"]'));
    const save = matchingButtons(["Speichern", "Save"]);
    const exit = matchingButtons(["Beenden", "Verlassen", "Exit"]);
    const bound = (matches) => matches.length === 1 && toolbar?.contains(matches[0]);
    // A selected block exposes its own Edit button outside the page toolbar.
    const blockEdit = includeBlockEditor && edit.length === 1 && edit[0].tagName === "BUTTON"
      && edit[0].getAttribute("aria-label") === "Bearbeiten" && toolbar && !toolbar.contains(edit[0]);
    const safeLabels = ["Bearbeiten", "Edit", "Speichern", "Save", "Beenden", "Verlassen", "Exit", "Fertig", "Done"];
    const controls = toolbar ? [...new Set(buttons.filter((el) => toolbar.contains(el))
      .map((el) => safeLabels.find((label) => hasControlLabel(el, [label]))).filter(Boolean))]
      .slice(0, 9) : [];
    const mode = iframes.length !== 1 ? "unknown" : bound(edit) && !edit[0].disabled ? "preview"
      : (!edit.length || blockEdit) && bound(save) && bound(exit) ? "editing" : "unknown";
    const dialogOpen = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"],[aria-modal="true"]')].some(visible);
    const count = (items) => Math.min(items.length, 20);
    const boundCount = (items) => count(items.filter((item) => toolbar?.contains(item)));
    const nestedRegionPairs = toolbars.reduce((sum, region, index) => sum + toolbars.slice(index + 1)
      .filter((other) => region.contains(other) || other.contains(region)).length, 0);
    const editor = { rawToolbarRegions: count(rawToolbars), toolbarRegions: count(toolbars), nestedRegionPairs: Math.min(nestedRegionPairs, 20),
      editButtons: count(edit), saveButtons: count(save), exitButtons: count(exit),
      disabledSaveButtons: count(save.filter((item) => item.disabled === true)), boundEditButtons: boundCount(edit),
      boundSaveButtons: boundCount(save), boundExitButtons: boundCount(exit), dialogOpen,
      toolbarRectCounts: { withRects: count(rawToolbars.filter((item) => item.getClientRects().length > 0)),
        withoutRects: count(rawToolbars.filter((item) => !item.getClientRects().length)) }, toolbarDisplays: controlStates(rawToolbars).display };
    return { exit: exit[0], save: save[0], iframe: iframes[0], state: { iframeCount: iframes.length,
      iframeSrc: iframes.length === 1 ? iframes[0].src || iframes[0].getAttribute("src") || "" : "", controls, mode,
      saveDisabled: mode === "editing" && save[0].disabled === true && save[0].getAttribute("aria-disabled") !== "false",
      dialogOpen, editor } };
  };
  if (operation === "session") return {
    adminNavigation: Boolean(document.querySelector('nav[aria-label="Website-Seiten und Funktionen"],nav[aria-label="Website pages and features"]'))
      || Boolean(visible(document.querySelector('nav[aria-label="Website-Vorschau und Bearbeitungstools"]'))
        && visible(document.querySelector("iframe#sqs-site-frame"))),
    title: document.title,
  };
  if (operation === "preview-state") {
    const { iframe, state } = pageEditorState(allowBlockEdit === true);
    if (state.iframeCount !== 1 || state.mode !== "preview") return state;
    try {
      const address = iframe.contentWindow?.location.href;
      return typeof address === "string" ? { ...state, iframeDocumentBlank: address === "about:blank" } : state;
    } catch { return state; }
  }
  if (operation === "draft-collection-identity") return Boolean(hasPageIdentity());
  if (operation === "draft-collection-observation") {
    const id = /^collection-([a-f0-9]{24})$/.exec(document.body?.id || "")?.[1];
    const epoch = performance.timeOrigin;
    return id && pagePath(pageUrl) && pagePath(document.URL) === pagePath(pageUrl)
      && Number.isFinite(epoch) && epoch > 0 ? { id, epoch } : null;
  }
  if (["draft-settings-open", "draft-settings-reveal", "draft-settings-focus", "draft-settings-focused"].includes(operation)) {
    const { state } = pageEditorState();
    if (state.mode !== "preview" || state.dialogOpen || !pagePath(pageUrl) || pagePath(state.iframeSrc) !== pagePath(pageUrl)
        || typeof names[0] !== "string" || !names[0]) return null;
    const panels = [...document.querySelectorAll('[data-test="pages-panel"]')].filter(visible);
    if (panels.length !== 1) return null;
    const settings = [...document.querySelectorAll('button[data-test="collection-settings"][aria-label]')]
      .filter(button => button.getAttribute("aria-label") === `Seiteneinstellungen ${names[0]}`);
    if (settings.length !== 1 || settings[0].disabled || settings[0].getAttribute("aria-disabled") === "true") return null;
    const [button] = settings;
    const row = button.closest('[data-test="grouped-list-item"]') || button.closest('[aria-roledescription="sortable"]');
    const labels = row && [...row.querySelectorAll("p")].filter(label => visible(label) && text(label) === names[0]);
    if (!visible(row) || !panels[0].contains(row) || labels.length !== 1 || !visible(button)
        || button.closest('[hidden],[inert],[aria-hidden="true"]')) return null;
    if (operation === "draft-settings-reveal") row.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    const rect = button.getBoundingClientRect();
    const { clientWidth, clientHeight } = document.documentElement;
    if (![rect.left, rect.top, rect.right, rect.bottom, clientWidth, clientHeight].every(Number.isFinite)
        || rect.left < 0 || rect.top < 0 || rect.left >= rect.right || rect.top >= rect.bottom
        || rect.right > clientWidth || rect.bottom > clientHeight) return null;
    const point = { x: Math.floor((rect.left + rect.right) / 2), y: Math.floor((rect.top + rect.bottom) / 2) };
    const hit = document.elementFromPoint?.(point.x, point.y);
    if (!hit || !row.contains(hit)) return null;
    if (operation === "draft-settings-reveal") return { point };
    if (operation === "draft-settings-focus" || operation === "draft-settings-focused") {
      if (button.tabIndex < 0 || typeof button.focus !== "function") return null;
      if (operation === "draft-settings-focus") button.focus({ preventScroll: true });
      return document.activeElement === button;
    }
    if (!button.contains(hit)) return null;
    for (let node = button; node; node = node.parentElement) {
      if (Number(getComputedStyle(node).opacity ?? "1") <= 0) return null;
    }
    return { point };
  }
  if (operation === "section-catalog-anchor") {
    if (!hasPageIdentity()) return false;
    if (sectionId === null) return emptyPageArticle();
    if (!/^[a-f0-9]{24}$/.test(sectionId || "")) return false;
    const sections = [...document.querySelectorAll(`section[data-section-id="${sectionId}"]`)];
    return sections.length === 1 && visible(sections[0]);
  }
  if (operation === "section-catalog-frame-trigger") {
    if (sectionId !== null || !hasPageIdentity()) return null;
    if ([...document.querySelectorAll('[role="dialog"],[role="alertdialog"],[aria-modal="true"]')].some(visible)) return null;
    const shell = emptyEditorShell(articleForPage()), button = shell?.button;
    if (!button || button.disabled
        || button.getAttribute("disabled") !== null || button.getAttribute("aria-disabled") === "true"
        || button.closest(sectionMarkers) !== shell.placeholder) return null;
    for (let parent = button; parent; parent = parent.parentElement) {
      if (parent.hidden || parent.inert || parent.getAttribute("aria-hidden") === "true"
          || Number(getComputedStyle(parent).opacity ?? "1") <= 0) return null;
    }
    const point = clickPoint(button);
    const width = globalThis.innerWidth || document.documentElement?.clientWidth;
    const height = globalThis.innerHeight || document.documentElement?.clientHeight;
    const epoch = performance.timeOrigin;
    return point && button.contains(document.elementFromPoint?.(point.x, point.y))
      && [width, height, epoch].every(value => Number.isFinite(value) && value > 0)
      ? { point, viewport: { width, height }, epoch } : null;
  }
  if (["section-catalog-trigger", "section-catalog-open", "section-catalog-blank", "fluid-block-trigger"].includes(operation)) {
    const { state, iframe } = pageEditorState(operation === "fluid-block-trigger" && allowBlockEdit === true);
    if (!pagePath(pageUrl) || pagePath(state.iframeSrc) !== pagePath(pageUrl)) return null;
    if (operation === "section-catalog-open" || operation === "section-catalog-blank") {
      const dialogs = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"],[aria-modal="true"]')].filter(visible);
      if (!state.dialogOpen || dialogs.length !== 1 || dialogs[0].getAttribute("role") !== "dialog") return null;
      const [dialog] = dialogs;
      const headings = [...dialog.querySelectorAll('h1,h2,h3,[role="heading"]')].filter(visible);
      if (headings.filter(heading => hasControlLabel(heading, ["Abschnitt hinzufügen", "Add Section"], false)).length !== 1) {
        return operation === "section-catalog-open" ? false : null;
      }
      if (operation === "section-catalog-open") return true;
      const blank = [...dialog.querySelectorAll('a[data-test="add-blank-options-button"]')].filter(visible);
      if (blank.length !== 1 || blank[0].getAttribute("aria-disabled") === "true"
          || !hasControlLabel(blank[0], ["Leeres Element hinzufügen", "Add Blank"], false)) return null;
      const point = clickPoint(blank[0]);
      return point ? { point } : null;
    }
    const first = operation === "section-catalog-trigger" && sectionId === null;
    if (state.mode !== "editing" || state.dialogOpen || !first && !/^[a-f0-9]{24}$/.test(sectionId || "")) return null;
    const addBlock = operation === "fluid-block-trigger";
    const selector = addBlock ? "button" : 'button[data-test="section-add-button"]';
    const labels = addBlock ? ["Block hinzufügen", "Add Block"] : ["Abschnitt hinzufügen", "Add Section"];
    const candidates = [...document.querySelectorAll(selector)].filter(button => !addBlock || hasControlLabel(button, labels, false));
    if (first && candidates.length === 0 && iframe && state.iframeCount === 1 && state.saveDisabled === true) return { frameTriggerAllowed: true };
    const controls = first ? candidates.filter(visible)
      : candidates.filter(button => button.closest('[data-section-id]')?.getAttribute("data-section-id") === sectionId);
    if (controls.length !== 1 || controls[0].disabled || controls[0].getAttribute("aria-disabled") === "true"
        || !hasControlLabel(controls[0], labels, false)) return null;
    if (first && controls[0].closest(sectionMarkers)) return null;
    const point = addBlock ? clickPoint(controls[0], { reveal: false }) || clickPoint(controls[0]) : clickPoint(controls[0]);
    if (first && point) {
      const rect = iframe.getBoundingClientRect();
      if (point.x < rect.left || point.x >= rect.right || point.y < rect.top || point.y >= rect.bottom) return null;
    }
    return point ? { point } : null;
  }
  if (["fluid-page-sections", "fluid-block-list", "fluid-block-choice", "fluid-section-focus", "fluid-block-placement"].includes(operation)) {
    if (!hasPageIdentity()) return null;
    const article = articleForPage();
    if (!article) return null;
    const sections = [...article.querySelectorAll('section[data-section-id]')];
    const sectionRows = sections.map(section => ({ id: section.getAttribute("data-section-id"), kind: section.getAttribute("data-sqsp-section") }));
    if (sectionRows.length > 40 || sectionRows.some(({ id, kind }) => !/^[a-f0-9]{24}$/.test(id || "") || !/^[a-z-]{2,40}$/.test(kind || ""))
        || new Set(sectionRows.map(section => section.id)).size !== sectionRows.length) return null;
    if (operation === "fluid-page-sections") {
      if (sectionId === null) {
        if (sections.length === 0) return emptyPageArticle(article) ? [] : null;
        const editorShell = knownEditorArticleShell(article);
        if (editorShell) {
          const [only] = sections;
          const { region, icon } = editorShell;
          return sections.length === 1 && onlyChild(region) === only && sectionRows[0].kind === "fluid-engine"
            && [...article.querySelectorAll(pageContentMarkers)].every(node => node === region || node === icon || only.contains(node))
            ? sectionRows : null;
        }
        const shell = emptyLayoutRegion(article);
        if ([...article.querySelectorAll(sectionMarkers)].filter(node => node !== shell).length !== sections.length) return null;
        const [only] = sections;
        if (sections.length === 1 && (article.textContent.trim() !== only.textContent.trim()
            || [...article.querySelectorAll(pageContentMarkers)].some(node => node !== shell && !only.contains(node)))) return null;
      }
      return sectionRows;
    }
    const section = sections[sectionRows.findIndex(entry => entry.id === sectionId && entry.kind === "fluid-engine")];
    if (!visible(section)) return null;
    const grids = [...section.querySelectorAll(".fluid-engine")];
    if (grids.length !== 1 || !visible(grids[0]) || getComputedStyle(grids[0]).display !== "grid") return null;
    if (operation === "fluid-section-focus") {
      const rect = grids[0].getBoundingClientRect();
      const width = globalThis.innerWidth || document.documentElement?.clientWidth;
      const height = globalThis.innerHeight || document.documentElement?.clientHeight;
      const left = Math.max(0, rect.left), right = Math.min(rect.right, document.documentElement.clientWidth);
      const top = Math.max(0, rect.top), bottom = Math.min(rect.bottom, document.documentElement.clientHeight);
      if (!(left < right && top < bottom)) return null;
      // Squarespace places editor controls over both outside edges of the grid.
      const points = [[0.5, 0.5], [0.35, 0.4], [0.65, 0.6], [0.45, 0.75]].map(([column, row]) => ({
        x: Math.floor(left + (right - left) * column), y: Math.floor(top + (bottom - top) * row),
      })).filter(({ x, y }) => {
        const hit = document.elementFromPoint?.(x, y);
        return x >= left && x < right && y >= top && y < bottom && hit?.closest('section[data-section-id]') === section
          && grids[0].contains(hit) && !hit.closest('.fe-block, [contenteditable], [role="button"], a, button, input, textarea');
      });
      return points.length ? { points, viewport: { width, height } } : null;
    }
    const pickerLabels = ["Block-Auswahl", "Block Picker"];
    const regions = [...document.querySelectorAll('[role="region"],section[aria-label],section[aria-labelledby]')].filter(region => {
      const role = region.getAttribute("role");
      if ((role && role !== "region") || !visible(region) || region.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
      const labelIds = region.getAttribute("aria-labelledby")?.trim().split(/\s+/u).filter(Boolean) || [];
      if (labelIds.length) {
        const label = labelIds.map(id => text(document.getElementById(id))).join(" ");
        return pickerLabels.some(name => controlLabel(name) === controlLabel(label));
      }
      return hasControlLabel(region, pickerLabels, false);
    });
    if (regions.length > 1) return null;
    if (operation === "fluid-block-choice") {
      if (regions.length !== 1 || !["text", "code"].includes(kind)) return null;
      const choiceId = `block-selector-button-website.components.${kind === "text" ? "html" : "code"}`;
      const choices = [...document.querySelectorAll(`[id="${choiceId}"]`)];
      const [choice] = choices;
      if (choices.length !== 1 || !regions[0].contains(choice) || !choice.matches('div[role="button"]')
          || !hasControlLabel(choice, [kind === "text" ? "Text" : "Code"], false)
          || choice.getAttribute("aria-disabled") === "true" || choice.closest('[hidden],[inert],[aria-hidden="true"]')) return null;
      const point = clickPoint(choice, { reveal: false }) || clickPoint(choice);
      const width = globalThis.innerWidth || document.documentElement?.clientWidth;
      const height = globalThis.innerHeight || document.documentElement?.clientHeight;
      return point ? { point, viewport: { width, height } } : null;
    }
    const wrappers = [...grids[0].children].filter(child => child.classList.contains("fe-block"));
    if (wrappers.length > 60) return null;
    const blocks = [];
    for (const wrapper of wrappers) {
      const fields = [...wrapper.querySelectorAll('[id^="block-"]')];
      if (fields.length !== 1 || !visible(wrapper) || !visible(fields[0])) return null;
      const [field] = fields, id = field.getAttribute("id"), kind = field.getAttribute("data-sqsp-block");
      const definition = field.getAttribute("data-definition-name"), cell = field.closest('[role="gridcell"]');
      if (!/^block-(?:[a-f0-9]{20}|[a-f0-9]{24}|yui_3_17_2_1_[0-9]{13}_[0-9]{1,12})$/.test(id || "")
          || !["text", "code"].includes(kind) || definition !== `website.components.${kind === "text" ? "html" : "code"}`
          || cell?.getAttribute("data-block-id") !== id.slice(6) || !wrapper.contains(cell)
          || document.querySelectorAll(`[id="${id}"]`).length !== 1) return null;
      blocks.push({ id, kind });
    }
    if (section.querySelectorAll('[id^="block-"],[data-sqsp-block]').length !== blocks.length) return null;
    if (operation === "fluid-block-placement") {
      if (regions.length || blocks.at(-1)?.id !== blockId) return null;
      const grid = grids[0], gridRect = grid.getBoundingClientRect();
      const rects = wrappers.map(wrapper => wrapper.getBoundingClientRect());
      if (rects.some(rect => ![rect.left, rect.right, rect.top, rect.bottom].every(Number.isFinite)
          || rect.left < gridRect.left || rect.right > gridRect.right || rect.top < gridRect.top || rect.bottom > gridRect.bottom
          || rect.right <= rect.left || rect.bottom <= rect.top)) return null;
      const preceding = rects.slice(0, -1);
      if (preceding.some((rect, index) => index > 0 && rect.top < preceding[index - 1].bottom)) return null;
      const previous = preceding.map((rect, index) => ({ id: blocks[index].id, bounds: [rect.left - gridRect.left,
        rect.top - gridRect.top, rect.right - gridRect.left, rect.bottom - gridRect.top] }));
      const rect = rects.at(-1), after = preceding.at(-1);
      if (!after || rect.top >= after.bottom) return { aligned: true, previous };
      const style = getComputedStyle(grid), rows = style.gridTemplateRows.split(/\s+/u);
      if (!/^[0-9.]+px$/.test(style.rowGap) || rows.length < 2 || rows.some(row => row !== rows[0] || !/^[0-9.]+px$/.test(row))) return null;
      const gap = Number.parseFloat(style.rowGap), pitch = Number.parseFloat(rows[0]) + gap;
      if (!(gap >= 0 && pitch >= 8 && pitch <= 250)) return null;
      const width = globalThis.innerWidth || document.documentElement?.clientWidth;
      const height = globalThis.innerHeight || document.documentElement?.clientHeight;
      const from = { x: Math.floor(rect.left + Math.min(30, rect.width / 2)), y: Math.floor(rect.top + Math.min(45, rect.height / 2)) };
      const steps = Math.ceil((after.bottom - rect.top + gap - 0.5) / pitch) + 1;
      const to = { x: from.x, y: Math.round(from.y + steps * pitch) };
      if (from.x < 0 || from.x >= width || from.y < 0 || to.y >= height || to.y >= gridRect.bottom) return null;
      const hit = document.elementFromPoint?.(from.x, from.y), target = document.elementFromPoint?.(to.x, to.y);
      const targetBlock = target?.closest(".fe-block");
      if (!hit?.classList.contains("sqs-editing-overlay") || hit.closest(".fe-block") !== wrappers.at(-1)
          || target?.closest('section[data-section-id]') !== section || targetBlock && targetBlock !== wrappers.at(-1)) return null;
      return { aligned: false, previous, from, to, viewport: { width, height } };
    }
    return { blocks, pickerOpen: regions.length === 1 };
  }
  if (operation === "document-epoch") return performance.timeOrigin;
  if (operation === "save-page") {
    const { state, save } = pageEditorState(allowBlockEdit === true);
    if (state.mode !== "editing" || state.saveDisabled || state.dialogOpen
        || !pagePath(pageUrl) || pagePath(state.iframeSrc) !== pagePath(pageUrl)
        || !save || save.disabled || save.getAttribute("aria-disabled") === "true") return null;
    const point = clickPoint(save);
    return point ? { point } : null;
  }
  if (operation === "dismiss-image-editor") {
    const { state, iframe } = pageEditorState();
    if (state.mode !== "editing" || !state.dialogOpen || !pagePath(pageUrl)
        || pagePath(state.iframeSrc) !== pagePath(pageUrl) || !iframe) return null;
    const rect = iframe.getBoundingClientRect();
    const point = { x: Math.ceil(rect.left + 6), y: Math.ceil(rect.top + 6) };
    return rect.width > 20 && rect.height > 20 && document.elementFromPoint?.(point.x, point.y) === iframe ? { point } : null;
  }
  if (operation === "exit-page") {
    const { state, exit } = pageEditorState(allowBlockEdit === true);
    if (state.mode !== "editing" || state.saveDisabled !== true || state.dialogOpen
        || !pagePath(pageUrl) || pagePath(state.iframeSrc) !== pagePath(pageUrl)
        || exit.disabled || exit.getAttribute("aria-disabled") === "true") return null;
    const point = clickPoint(exit);
    return point ? { point } : null;
  }
  if (operation === "expand-folder") {
    const buttons = [...document.querySelectorAll('button[aria-expanded="false"]')].filter((el) => visible(el)
      && /^(unterseiten erweitern|expand subpages)(?: |$)/.test(controlLabel(el.getAttribute("aria-label"))));
    if (!buttons.length) return null;
    const point = clickPoint(buttons[0]);
    return point ? { point } : null;
  }
  if (operation === "select-page") {
    const labels = [...document.querySelectorAll("p")].filter((el) => visible(el) && text(el).length <= 250
      && el.closest('[role="button"]'));
    let candidates = labels.filter((el) => names.includes(text(el)));
    // CMS navigation labels and public SEO titles can differ (e.g. Palast von Knossos).
    // Use complete words only when no exact title exists, and still demand a single row.
    // openPage subsequently proves the exact public URL before any editor field is opened.
    const words = (value) => String(value).normalize("NFKC").toLocaleLowerCase("de-DE").match(/[\p{L}\p{N}]+/gu) || [];
    const matchedName = (label) => names.find((name) => {
      const requested = words(name), present = new Set(words(label));
      return requested.length && requested.some((word) => /\p{L}/u.test(word) && word.length >= 4)
        && requested.every((word) => present.has(word));
    });
    if (!candidates.length) candidates = labels.filter((el) => matchedName(text(el)));
    if (candidates.length > 1) {
      // Repeated labels belong to separate travel folders; trip overviews live
      // inside Reisen, apart from the similarly named unlinked gallery folders.
      const path = pagePath(pageUrl);
      const overview = path && /^\/reisen\/\d{4}-[^/]+$/.test(path);
      if (!path || !overview && !/^\/reisen\/[^/]+\/[^/]+$/.test(path)) return null;
      const requested = overview ? ["reisen"] : words(decodeURIComponent(path.split("/").slice(1, -1).join(" ")));
      const folders = [...new Set([...document.querySelectorAll("button[aria-label]")].filter((el) => {
        const label = controlLabel(el.getAttribute("aria-label"));
        if (!visible(el) || !/^(unterseiten erweitern|expand subpages)(?: |$)/.test(label)) return false;
        const present = new Set(words(label.replace(/^(unterseiten erweitern|expand subpages)\s*/, "")));
        return (!overview || present.size === 1) && requested.every((word) => present.has(word));
      }).map((el) => el.parentElement?.closest('[aria-roledescription="sortable"]')).filter(visible))];
      if (folders.length !== 1) return null;
      candidates = candidates.filter((el) => folders[0].contains(el));
    }
    if (candidates.length !== 1) return null;
    const point = clickPoint(candidates[0]);
    const label = text(candidates[0]);
    return point ? { name: names.includes(label) ? label : matchedName(label), label, point } : null;
  }
  if (operation === "edit-page") {
    if (pageUrl) {
      const { state } = pageEditorState();
      if (state.mode !== "preview" || state.dialogOpen || !pagePath(pageUrl) || pagePath(state.iframeSrc) !== pagePath(pageUrl)) return null;
    }
    const candidates = matchingButtons(["Bearbeiten", "Edit"]);
    if (candidates.length !== 1 || candidates[0].disabled) return null;
    const point = clickPoint(candidates[0]);
    return point ? { point } : null;
  }
  if (operation === "text-block-activation") {
    if (!hasBlockIdentity() || !(/^block-[a-f0-9]{24}$/.test(blockId) || blockId.startsWith("block-yui_"))) return null;
    const mains = [...document.querySelectorAll("main")].filter(visible);
    const articles = mains.length === 1 ? [...mains[0].querySelectorAll("article")].filter(visible) : [];
    const blocks = [...document.querySelectorAll(`[id="${blockId}"]`)];
    const [block] = blocks;
    if (articles.length !== 1 || blocks.length !== 1 || !articles[0].contains(block)
        || block.querySelector('[id^="block-"]')) return null;
    const declaredKind = block.getAttribute("data-sqsp-block");
    if (declaredKind !== null && declaredKind !== "text") return null;
    if (blockId.startsWith("block-yui_")) {
      const cell = block.closest('[role="gridcell"]');
      if (declaredKind !== "text" || block.getAttribute("data-definition-name") !== "website.components.html"
          || cell?.getAttribute("data-block-id") !== blockId.slice(6)) return null;
    }
    const editors = [...block.querySelectorAll('[contenteditable="true"][role="textbox"]')];
    if (editors.length) {
      const [editor] = editors;
      return editors.length === 1 && visible(editor) && editor.isContentEditable
        && editor.getAttribute("aria-readonly") !== "true" && editor.getAttribute("aria-disabled") !== "true" ? { active: true } : null;
    }
    if (declaredKind !== "text" || block.getAttribute("data-definition-name") !== "website.components.html") return null;
    const rendered = [...block.querySelectorAll('div[data-sqsp-text-block-content]')];
    const [field] = rendered;
    if (rendered.length !== 1 || field.textContent.trim()
        || [...field.querySelectorAll("*")].some(node => !["P", "BR"].includes(node.tagName))) return null;
    const point = clickPoint(field);
    const width = globalThis.innerWidth || document.documentElement?.clientWidth;
    const height = globalThis.innerHeight || document.documentElement?.clientHeight;
    return point ? { point, viewport: { width, height } } : null;
  }
  if (operation === "code-block-point" || operation === "code-block-selected") {
    if (!hasBlockIdentity()) return null;
    const mains = [...document.querySelectorAll("main")].filter(visible);
    const articles = mains.length === 1 ? [...mains[0].querySelectorAll("article")].filter(visible) : [];
    const blocks = [...document.querySelectorAll(`[id="${blockId}"]`)];
    if (articles.length !== 1 || blocks.length !== 1 || !articles[0].contains(blocks[0])
        || blocks[0].getAttribute("data-sqsp-block") !== "code" || blocks[0].getAttribute("data-definition-name") !== "website.components.code") return null;
    const gridCell = blocks[0].closest('[role="gridcell"]');
    if (!visible(gridCell) || gridCell.getAttribute("data-block-id") !== blockId.slice(6)) return null;
    if (sectionId !== undefined) {
      if (!/^[a-f0-9]{24}$/.test(sectionId)) return null;
      const section = gridCell.closest('section[data-section-id]');
      if (section?.getAttribute("data-section-id") !== sectionId
          || articles[0].querySelectorAll(`[data-section-id="${sectionId}"]`).length !== 1) return null;
    }
    if (operation === "code-block-selected") {
      const selected = [...document.querySelectorAll('[role="gridcell"][aria-selected="true"]')].filter(visible);
      return selected.length === 1 && selected[0] === gridCell;
    }
    const point = clickPoint(gridCell);
    const width = globalThis.innerWidth || document.documentElement?.clientWidth;
    const height = globalThis.innerHeight || document.documentElement?.clientHeight;
    return point ? { point, viewport: { width, height } } : null;
  }
  if (operation === "classic-insert-hover" || operation === "classic-insert-trigger") {
    if (!hasBlockIdentity()) return null;
    const regions = [...document.querySelectorAll('[id="page-regions"]')];
    const blocks = [...document.querySelectorAll(`[id="${blockId}"]`)];
    if (regions.length !== 1 || blocks.length !== 1) return null;
    const [block] = blocks;
    const classic = 'section[data-sqsp-section="classic-editor"]';
    const section = block.closest(classic), sectionId = section?.getAttribute("data-section-id");
    if (!/^[a-f0-9]{24}$/.test(sectionId || "") || !regions[0].contains(section)
        || regions[0].querySelectorAll(`[data-section-id="${sectionId}"]`).length !== 1 || !visible(block)) return null;
    const containers = [...block.children].filter(el => el.classList.contains("sqs-layout-insert-point-container"));
    if (containers.length !== 1) return null;
    const anchors = [...containers[0].children].filter(el => el.classList.contains("sqs-layout-insert-point-type-block")
      && el.classList.contains("sqs-layout-insert-point-position-bottom"));
    if (anchors.length !== 1) return null;
    const triggers = [...anchors[0].children].filter(el => el.matches('button[data-test="insert-point-trigger"]'));
    if (triggers.length !== 1 || triggers[0].disabled || triggers[0].getAttribute("aria-disabled") === "true") return null;
    const [trigger] = triggers;
    const width = globalThis.innerWidth || document.documentElement?.clientWidth;
    const height = globalThis.innerHeight || document.documentElement?.clientHeight;
    if (operation === "classic-insert-trigger") {
      const style = getComputedStyle(trigger);
      const point = style.pointerEvents !== "none" && Number(style.opacity) > 0 ? clickPoint(trigger) : null;
      return point ? { point, viewport: { width, height }, sectionId } : null;
    }
    // The real line is a one-pixel child of the zero-height anchor. A layout
    // container can cover the hidden center even when the line still has a box.
    const lines = [...anchors[0].children].filter(el => el.matches("span.sqs-layout-insert-point-line"));
    if (lines.length !== 1) return null;
    const [stroke] = lines;
    stroke.scrollIntoView({ block: "nearest", inline: "nearest" });
    const line = stroke.getBoundingClientRect();
    const x = Math.floor(line.left + 12), y = Math.round(line.top + line.height / 2);
    if (!(line.left >= 0 && line.width >= 24 && line.height > 0 && line.height <= 3 && x < width)) return null;
    const points = [y, y - 2, y + 2].map(value => {
      if (value < 0 || value >= height) return null;
      const hit = document.elementFromPoint?.(x, value);
      return hit?.closest(classic) === section && !hit.closest("a,button") ? { x, y: value } : null;
    });
    return points.some(Boolean) ? { points, viewport: { width, height }, sectionId } : null;
  }
  if (["code-block-edit", "code-dialog-focus", "code-dialog-focus-empty", "code-dialog-focus-default", "code-dialog-default-selected"].includes(operation)) {
    const { state } = pageEditorState(true);
    if (state.mode !== "editing" || !pagePath(pageUrl) || pagePath(state.iframeSrc) !== pagePath(pageUrl)) return null;
    if (operation === "code-block-edit") {
      if (state.dialogOpen) return null;
      const edits = buttons.filter(button => button.tagName === "BUTTON" && button.getAttribute("aria-label") === "Bearbeiten");
      if (edits.length !== 1 || edits[0].disabled || edits[0].getAttribute("aria-disabled") === "true") return null;
      const point = clickPoint(edits[0]);
      return point ? { point } : null;
    }
    const dialogs = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"],[aria-modal="true"]')].filter(visible);
    const dialog = dialogs[0];
    if (dialogs.length !== 1 || dialog.getAttribute("data-test") !== "block-editor-container"
        || dialog.getAttribute("aria-label") !== "Block-Editor-Formular" || dialog.getAttribute("data-modal-id") !== modalId) return false;
    const editors = [...dialog.querySelectorAll('.cm-content[role="textbox"][data-language="html"]')].filter(visible);
    if (editors.length !== 1) return false;
    const [editor] = editors;
    function matchesHtmlEditor(expected) {
      const modes = [...dialog.querySelectorAll('[role="combobox"]')].filter(visible);
      const switches = [...dialog.querySelectorAll('input[type="checkbox"]')].filter(visible);
      const fields = [...dialog.querySelectorAll('[role="textbox"]')].filter(visible);
      const line = editor.children[0];
      return modes.length === 1 && text(modes[0]) === "HTML" && switches.length === 1 && switches[0].checked === false
        && fields.length === 1 && fields[0] === editor && editor.getAttribute("aria-multiline") === "true" && editor.isContentEditable
        && editor.childNodes.length === 1 && line?.tagName === "DIV" && line.classList.contains("cm-line")
        && (expected === "" ? emptyCodeLine(line) : line.textContent === expected);
    }
    const checksDefault = ["code-dialog-focus-default", "code-dialog-default-selected"].includes(operation);
    if (checksDefault && typeof defaultCode !== "string") return false;
    const expected = operation === "code-dialog-focus-empty" ? "" : checksDefault ? defaultCode : undefined;
    if (expected !== undefined && !matchesHtmlEditor(expected)) return false;
    if (operation === "code-dialog-default-selected") {
      const selection = document.getSelection();
      return document.activeElement === editor && editor.isConnected && selection?.rangeCount === 1
        && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode) && selection.toString() === expected;
    }
    editor.focus();
    return document.activeElement === editor && editor.isConnected && (expected === undefined || matchesHtmlEditor(expected));
  }
  if (operation === "gallery-control") {
    if (hovered !== true) return null;
    const controls = galleryControls(document).filter(visible);
    if (controls.length !== 1 || !galleryPortal(controls[0]) || controls[0].disabled) return null;
    const point = clickPoint(controls[0]);
    return point ? { point } : null;
  }
  if (operation === "gallery-hover") {
    const sections = matchingGallerySections();
    if (sections.length !== 1 || !visible(sections[0])) return null;
    const section = sections[0];
    section.scrollIntoView({ block: "center", inline: "nearest" });
    const rect = section.getBoundingClientRect();
    const width = globalThis.innerWidth || document.documentElement?.clientWidth;
    const height = globalThis.innerHeight || document.documentElement?.clientHeight;
    if (![rect.left, rect.top, rect.right, rect.bottom, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    const left = Math.max(0, rect.left), right = Math.min(width, document.documentElement?.clientWidth || width, rect.right);
    const top = Math.max(0, rect.top), bottom = Math.min(height, document.documentElement?.clientHeight || height, rect.bottom);
    if (right <= left || bottom <= top) return null;
    const point = { x: Math.floor((left + right) / 2), y: Math.floor((top + bottom) / 2) };
    const hit = document.elementFromPoint?.(point.x, point.y);
    return hit && (hit === section || section.contains(hit)) ? { point, viewport: { width, height } } : null;
  }
  if (operation === "map-gallery-hover") {
    const iframes = [...document.querySelectorAll("iframe#sqs-site-frame")].filter(visible);
    if (iframes.length !== 1) return { blocked: "frame-count" };
    if (!framePoint || !frameViewport) return { blocked: "dimensions" };
    const iframe = iframes[0];
    const expectedPath = pagePath(pageUrl);
    if (!expectedPath || pagePath(iframe.src || iframe.getAttribute("src")) !== expectedPath) return { blocked: "frame-url" };
    // Computed CSS matrices may include harmless translation or positive scaling.
    // Reject every other axis/3D effect before using the measured border-box ratios.
    const numberPattern = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?";
    const numeric = (value) => new RegExp(`^${numberPattern}$`, "i").test(value) && Number.isFinite(Number(value));
    const none = (value) => !value || value === "none";
    const axisAlignedMatrix = (value) => {
      if (none(value)) return true;
      const match = /^(matrix|matrix3d)\(([^()]*)\)$/.exec(value);
      if (!match) return false;
      const parts = match[2].split(",").map((part) => part.trim());
      if (!parts.every(numeric)) return false;
      const values = parts.map(Number);
      if (match[1] === "matrix") return values.length === 6 && values[0] > 0 && values[3] > 0 && values[1] === 0 && values[2] === 0;
      return values.length === 16 && values[0] > 0 && values[5] > 0 && values[10] === 1 && values[15] === 1
        && values.every((item, index) => [0, 5, 10, 12, 13, 15].includes(index) || item === 0);
    };
    const positiveScale = (value) => {
      if (none(value)) return true;
      const parts = value.trim().split(/\s+/);
      return parts.length >= 1 && parts.length <= 3 && parts.every(numeric)
        && Number(parts[0]) > 0 && (parts.length < 2 || Number(parts[1]) > 0) && (parts.length < 3 || Number(parts[2]) === 1);
    };
    const zeroRotation = (value) => none(value) || new RegExp(`^(${numberPattern})(?:deg|rad|grad|turn)?$`, "i").test(value)
      && Number.parseFloat(value) === 0;
    const planarTranslation = (value) => {
      if (none(value)) return true;
      const parts = value.trim().split(/\s+/);
      const pixels = parts.map((part) => {
        const match = new RegExp(`^(${numberPattern})(px)?$`, "i").exec(part);
        return match && numeric(match[1]) && (match[2] || Number(match[1]) === 0) ? Number(match[1]) : NaN;
      });
      return parts.length >= 1 && parts.length <= 3 && pixels.every(Number.isFinite) && (parts.length < 3 || pixels[2] === 0);
    };
    const positiveZoom = (value) => {
      if (!value || value === "normal") return true;
      const match = new RegExp(`^(${numberPattern})(%)?$`, "i").exec(value);
      if (!match || !numeric(match[1])) return false;
      const factor = Number(match[1]) / (match[2] ? 100 : 1);
      return factor >= 0.1 && factor <= 10;
    };
    for (let current = iframe; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (!axisAlignedMatrix(style.transform) || !positiveScale(style.scale) || !zeroRotation(style.rotate)
          || !planarTranslation(style.translate) || !none(style.perspective) || !positiveZoom(style.zoom)) return { blocked: "transform" };
    }
    const rect = iframe.getBoundingClientRect();
    const values = [rect.left, rect.top, rect.width, rect.height, iframe.clientWidth, iframe.clientHeight,
      iframe.offsetWidth, iframe.offsetHeight, iframe.clientLeft, iframe.clientTop,
      framePoint.x, framePoint.y, frameViewport.width, frameViewport.height];
    const sx = rect.width / iframe.offsetWidth, sy = rect.height / iframe.offsetHeight;
    const dimensions = () => ({ blocked: "dimensions", metrics: { frameWidth: frameViewport.width, frameHeight: frameViewport.height,
      clientWidth: iframe.clientWidth, clientHeight: iframe.clientHeight, offsetWidth: iframe.offsetWidth, offsetHeight: iframe.offsetHeight,
      rectLeft: rect.left, rectTop: rect.top, rectWidth: rect.width, rectHeight: rect.height, x: framePoint.x, y: framePoint.y,
      topWidth: document.documentElement?.clientWidth, topHeight: document.documentElement?.clientHeight } });
    if (!values.every(Number.isFinite) || iframe.clientWidth <= 0 || iframe.clientHeight <= 0 || iframe.offsetWidth <= 0 || iframe.offsetHeight <= 0
        || iframe.clientLeft < 0 || iframe.clientTop < 0 || framePoint.x < 0 || framePoint.y < 0
        || framePoint.x >= frameViewport.width || framePoint.y >= frameViewport.height
        || Math.abs(frameViewport.width - iframe.clientWidth) > 1 || Math.abs(frameViewport.height - iframe.clientHeight) > 1
        || !Number.isFinite(sx) || !Number.isFinite(sy) || sx < 0.1 || sx > 10 || sy < 0.1 || sy > 10) return dimensions();
    const point = { x: Math.round(rect.left + (iframe.clientLeft + framePoint.x) * sx),
      y: Math.round(rect.top + (iframe.clientTop + framePoint.y) * sy) };
    const width = document.documentElement?.clientWidth, height = document.documentElement?.clientHeight;
    if (!(point.x >= 0 && point.y >= 0 && point.x < width && point.y < height)) return dimensions();
    return document.elementFromPoint?.(point.x, point.y) === iframe ? { point } : { blocked: "hit-test" };
  }
  if (operation === "gallery-diagnostic") {
    const sections = matchingGallerySections();
    return { matchingGallerySections: Math.min(sections.length, 20),
      targetPortalCount: Math.min(targetPortals().length, 20),
      galleryButtons: controlStates(galleryControls(document)),
      matchedGalleryButtons: controlStates([...new Set(sections.flatMap(galleryControls))]) };
  }
  if (operation === "button") {
    const candidates = matchingButtons(names);
    if (candidates.length !== 1 || candidates[0].disabled) return false;
    candidates[0].click(); return true;
  }
  if (operation === "gallery-closed") return ![...document.querySelectorAll('[role="dialog"]')].some(visible);
  const editor = galleryDialog();
  if (operation === "close-gallery") {
    if (!editor) return null;
    const controls = [...editor.querySelectorAll("button,[role=button]")].filter((el) => visible(el)
      && hasControlLabel(el, ["Schließen", "Close"]));
    if (controls.length !== 1 || controls[0].disabled || controls[0].getAttribute("aria-disabled") === "true") return null;
    const point = clickPoint(controls[0]);
    return point ? { point } : null;
  }
  if (operation === "select-image") {
    if (!editor) return null;
    const targets = [...editor.querySelectorAll(thumbnailSelector)].filter((item) => visible(item)
      && item.getAttribute("data-itemid")?.trim() && [...item.querySelectorAll("img")].some((img) => visible(img)
        && canonical(img.currentSrc || img.src) === canonical(sourceUrl)));
    if (targets.length !== 1 || targets[0].disabled || targets[0].getAttribute("aria-disabled") === "true") return null;
    const point = clickPoint(targets[0]);
    return point ? { point } : null;
  }
  if (!editor) return null;
  const fields = descriptionFields(editor);
  if (fields.length !== 1) return null;
  const field = fields[0];
  // Carousel neighbours have layout rectangles even when clipped offscreen.
  // Bind the field only to one zero-offset pane whose actual geometry is visible.
  const panes = [...editor.querySelectorAll('[data-is-image="true"]')].filter((pane) => {
    if (!visible(pane)) return false;
    const style = getComputedStyle(pane);
    if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)px$/.test(style.left || "")
        || Math.abs(Number.parseFloat(style.left)) > 1 || style.transform !== "none") return false;
    const clip = paneClip(pane, editor);
    return clip && inside(pane.getBoundingClientRect(), clip);
  });
  if (panes.length !== 1) return null;
  const pane = panes[0], clip = paneClip(pane, editor), paneRect = pane.getBoundingClientRect();
  const previews = [...pane.querySelectorAll("img")].filter((img) => {
    const rect = img.getBoundingClientRect();
    return visible(img) && rect.width >= 200 && rect.height >= 100 && inside(rect, clip) && inside(rect, paneRect);
  });
  const previewSources = new Set(previews.map((img) => canonical(img.currentSrc || img.src)));
  if (previews.length !== 1 || previewSources.size !== 1 || !previewSources.has(canonical(sourceUrl))) return null;
  if (operation === "focus-description") {
    field.focus();
    if (document.activeElement !== field || typeof field.select !== "function") return false;
    field.select();
    return field.selectionStart === 0 && field.selectionEnd === field.value.length;
  }
  if (operation === "blur-description") { field.blur(); return true; }
  const rich = field.matches('[contenteditable="true"]');
  return { sourceUrl: previews[0].currentSrc || previews[0].src,
    description: rich ? field.innerText.replace(/\r\n/g, "\n").replace(/\n$/, "") : field.value,
    plainText: !rich || !field.querySelector("strong,b,em,i,a,ul,ol,h1,h2,h3,span[style]") };
}

export function createSquarespaceGalleryDriver({ waitMs = 250, timeoutMs = 20_000, fetchPublicTarget = globalThis.fetch,
  enablePageAuthoring = false } = {}) {
  const blankPageRequests = new Set();
  const appendedFluidBlocks = new WeakMap();
  const firstSectionDispatched = new WeakSet();
  const disabledNeutralDrafts = new WeakMap();
  const assignedDraftSettings = new WeakMap();
  const editorOperationSource = `(payload => (${editorDomOperation.toString()})(payload, ${isSquarespaceEmptyCodeLine.toString()}))`;
  const settingsOperationSource = `(${squarespacePageSettingsControlsDom.toString()})`;
  const searchOperationSource = `(${squarespacePageSearchDom.toString()})`;
  const creationCatalogSource = `(${squarespacePageCreationCatalogDom.toString()})`;
  async function perform(frame, payload) {
    return frame.executeJavaScript(`${editorOperationSource}(${JSON.stringify(payload)})`, true);
  }
  function mainFrame(webContents) {
    if (!webContents || webContents.isDestroyed?.()) throw failure("Das Squarespace-Fenster ist geschlossen.");
    return webContents.mainFrame;
  }
  function previewFrame(webContents, pageUrl) {
    const top = mainFrame(webContents), expected = previewPageUrl(pageUrl);
    const frames = (top.framesInSubtree || []).filter((frame) => {
      if (frame === top || frame.parent === null || frame.detached || frame.isDestroyed?.()) return false;
      try { return previewPageUrl(frame.url) === expected; }
      catch { return false; }
    });
    return frames.length === 1 ? frames[0] : null;
  }
  function previewPageUrl(value) {
    const url = new URL(value);
    if (url.origin === ADMIN) url.hostname = "www.fnwildlifetravel.de";
    const normalized = new URL(normalizeWebsitePageUrl(url.href));
    if (normalized.pathname === "/home") normalized.pathname = "/";
    return normalized.href;
  }
  function redactedAddress(value) {
    try {
      if (typeof value !== "string" || value.length > 8192) return { status: "unavailable" };
      const url = new URL(value);
      if (url.href === "about:blank") return { status: "empty" };
      if (url.protocol !== "https:" || url.username || url.password || url.port
          || ![ADMIN, "https://www.fnwildlifetravel.de", "https://fnwildlifetravel.de"].includes(url.origin)) return { status: "foreign" };
      if (url.origin === ADMIN && /^\/config(?:\/|$)/.test(url.pathname)) return { status: "unavailable" };
      const pathname = new URL(previewPageUrl(value)).pathname;
      return pathname.length <= 512 ? { status: "loaded", origin: url.origin, pathname } : { status: "unavailable" };
    } catch { return { status: "unavailable" }; }
  }
  async function boundedRead(frame, payload, read = perform) {
    let timer;
    try {
      return await Promise.race([read(frame, payload),
        new Promise((resolve) => { timer = setTimeout(() => resolve(null), Math.min(timeoutMs, 2000)); })]);
    } finally { clearTimeout(timer); }
  }
  async function previewState(webContents, allowBlockEdit = false) {
    return boundedRead(mainFrame(webContents), { operation: "preview-state", ...(allowBlockEdit && { allowBlockEdit }) });
  }
  async function inspectPreview(webContents, pageUrl, { sourceUrl = "", stage = "", access = "" } = {}) {
    const top = mainFrame(webContents);
    let state;
    try { state = await previewState(webContents); } catch { state = null; }
    const diagnostic = { target: redactedAddress(pageUrl), mode: ["preview", "editing"].includes(state?.mode) ? state.mode : "unknown",
      iframeCount: Number.isSafeInteger(state?.iframeCount) && state.iframeCount >= 0 ? Math.min(state.iframeCount, 20) : 0,
      iframe: redactedAddress(state?.iframeSrc),
      ...(typeof state?.iframeDocumentBlank === "boolean" && { iframeDocumentBlank: state.iframeDocumentBlank }),
      controls: (Array.isArray(state?.controls) ? state.controls : []).filter((value) => TOOLBAR_LABELS.has(value)).slice(0, 9),
      frames: (top.framesInSubtree || []).filter((frame) => frame !== top).slice(0, 8).map((frame) => {
        try { return { ...redactedAddress(frame.url), detached: Boolean(frame.detached || frame.isDestroyed?.()) }; }
        catch { return { status: "unavailable", detached: true }; }
      }) };
    if (state?.editor && typeof state.editor === "object") {
      const count = (value) => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 20) : 0;
      diagnostic.editor = { ...Object.fromEntries(EDITOR_COUNTS.map((key) => [key, count(state.editor[key])])),
        dialogOpen: state.editor.dialogOpen === true,
        toolbarRectCounts: { withRects: count(state.editor.toolbarRectCounts?.withRects), withoutRects: count(state.editor.toolbarRectCounts?.withoutRects) },
        toolbarDisplays: [...new Set((Array.isArray(state.editor.toolbarDisplays) ? state.editor.toolbarDisplays : [])
          .filter((value) => DISPLAY_STATES.has(value)))].slice(0, 11) };
    }
    if (sourceUrl && GALLERY_STAGES.has(stage)) {
      const frame = previewFrame(webContents, pageUrl);
      let frameState, mainState;
      try { frameState = frame && await boundedRead(frame, { operation: "gallery-diagnostic", sourceUrl }); } catch { frameState = null; }
      try { mainState = await boundedRead(top, { operation: "gallery-diagnostic" }); } catch { mainState = null; }
      const count = (value) => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 20) : 0;
      const controls = (value) => ({ total: count(value?.total), visible: count(value?.visible),
        display: [...new Set((Array.isArray(value?.display) ? value.display : []).filter((entry) => DISPLAY_STATES.has(entry)))].slice(0, 11),
        visibility: [...new Set((Array.isArray(value?.visibility) ? value.visibility : []).filter((entry) => VISIBILITY_STATES.has(entry)))].slice(0, 4) });
      diagnostic.gallery = { stage, ...(GALLERY_ACCESS.has(access) ? { access } : {}), matchingGallerySections: count(frameState?.matchingGallerySections),
        targetPortalCount: count(mainState?.targetPortalCount),
        frameGalleryButtons: controls(frameState?.matchedGalleryButtons), mainGalleryButtons: controls(mainState?.galleryButtons) };
    }
    return diagnostic;
  }
  function nativePoint(webContents, target) {
    const point = target?.point;
    if (target?.blocked || !point || ![point.x, point.y].every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 20000)) return null;
    try { if (typeof webContents.getZoomFactor === "function" && webContents.getZoomFactor() !== 1) return null; }
    catch { return null; }
    return point;
  }
  function click(webContents, target, signal) {
    stopIfAborted(signal);
    const point = nativePoint(webContents, target);
    if (!point) return false;
    webContents.sendInputEvent({ type: "mouseDown", x: point.x, y: point.y, button: "left", clickCount: 1 });
    webContents.sendInputEvent({ type: "mouseUp", x: point.x, y: point.y, button: "left", clickCount: 1 });
    return true;
  }
  function hover(webContents, target, signal) {
    stopIfAborted(signal);
    const point = nativePoint(webContents, target);
    if (!point) return false;
    webContents.sendInputEvent({ type: "mouseMove", x: point.x, y: point.y });
    stopIfAborted(signal);
    return true;
  }
  async function waitFor(operation, message, signal, readyTimeoutMs = timeoutMs) {
    const deadline = performance.now() + readyTimeoutMs;
    do {
      stopIfAborted(signal);
      const value = await operation();
      stopIfAborted(signal);
      if (value) return value;
      await delay(waitMs, undefined, { signal });
    } while (performance.now() < deadline);
    throw failure(message);
  }
  async function openBoundDraftSettings(webContents, { top, pageUrl, title, samePage, authorize, signal, message }) {
    const read = operation => boundedRead(top, { operation, pageUrl, names: [title] });
    await authorize();
    if (!await samePage()) return false;
    let control = await read("draft-settings-open");
    if (!control) {
      const target = await read("draft-settings-reveal");
      if (!target || !await samePage() || !isDeepStrictEqual(target, await read("draft-settings-reveal"))
          || !hover(webContents, target, signal)) return false;
      control = await read("draft-settings-open");
      if (!control && await samePage() && await read("draft-settings-focus") === true) {
        await authorize();
        if (!await samePage() || await read("draft-settings-focused") !== true) return false;
        stopIfAborted(signal);
        for (const type of ["keyDown", "char", "keyUp"]) webContents.sendInputEvent({ type, keyCode: "Enter" });
        return true;
      }
      if (!control) control = await waitFor(async () => await samePage() && await read("draft-settings-open"), message, signal);
    }
    await authorize();
    return await samePage() && isDeepStrictEqual(control, await read("draft-settings-open")) && click(webContents, control, signal);
  }
  async function navigate(webContents, url, signal) {
    stopIfAborted(signal);
    let timer, onAbort;
    try {
      await new Promise((resolve, reject) => {
        const stop = (error) => {
          try { if (!webContents.isDestroyed?.()) webContents.stop?.(); } catch { /* A destroyed window has already stopped navigation. */ }
          reject(error);
        };
        onAbort = () => stop(signal.reason || failure("Die Seitennavigation wurde abgebrochen."));
        signal?.addEventListener("abort", onAbort, { once: true });
        timer = setTimeout(() => stop(failure("Die Squarespace-Seitenverwaltung lädt nicht rechtzeitig. Es wurde kein Bildtext eingegeben.")), timeoutMs);
        Promise.resolve().then(() => webContents.loadURL(url)).then(resolve, reject);
      });
      stopIfAborted(signal);
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
  }
  async function getStatus(webContents) {
    try {
      const url = new URL(webContents.getURL());
      if (url.origin !== ADMIN || !(url.pathname === "/config" || url.pathname.startsWith("/config/"))) return {
        connected: false, loginRequired: true, status: "login-required", message: "Bitte im Squarespace-Fenster anmelden." };
      const dom = await perform(mainFrame(webContents), { operation: "session" });
      return dom.adminNavigation ? { connected: true, loginRequired: false, status: "connected", message: "Angemeldete FN-Websiteverwaltung erkannt." }
        : { connected: false, loginRequired: true, status: "connecting", message: "Squarespace lädt oder benötigt deine Anmeldung." };
    } catch { return { connected: false, loginRequired: true, status: "login-required", message: "Bitte den Squarespace-Zugang im geöffneten Fenster prüfen." }; }
  }
  async function prepareAdminSearch(webContents, signal) {
    const adminPages = `${ADMIN}/config/pages`;
    const unconfirmed = () => Object.assign(failure("Öffne die Squarespace-Seitenverwaltung und schließe dort laufende Bearbeitungen und Dialoge."),
      { code: "SQUARESPACE_TARGET_NOT_CONFIRMED" });
    const entry = webContents.getURL();
    stopIfAborted(signal);
    if (entry !== adminPages) {
      let dashboard;
      try { dashboard = new URL(entry); } catch { throw unconfirmed(); }
      if (dashboard.origin !== ADMIN || dashboard.username || dashboard.password
          || !["/config", "/config/"].includes(dashboard.pathname)) throw unconfirmed();
      await navigate(webContents, adminPages, signal);
    }
    const top = mainFrame(webContents);
    function bound() {
      stopIfAborted(signal);
      if (mainFrame(webContents) !== top || webContents.getURL() !== adminPages) throw unconfirmed();
    }
    bound();
    if (typeof webContents.insertText !== "function") throw unconfirmed();
    await waitFor(async () => {
      bound();
      const state = await previewState(webContents);
      bound();
      if (state?.mode === "editing" || state?.dialogOpen === true) throw unconfirmed();
      return state?.mode === "preview" && state?.dialogOpen === false;
    }, "Die Squarespace-Seitenverwaltung ist für die Adressprüfung noch nicht eindeutig bereit.", signal);
    const controls = {
      signal, waitMs, timeoutMs,
      read: async payload => {
        bound();
        const state = await boundedRead(top, payload,
          (frame, request) => frame.executeJavaScript(`${searchOperationSource}(${JSON.stringify(request)})`, true));
        bound();
        return state;
      },
      click: point => { bound(); return click(webContents, point, signal); },
      insertText: query => { bound(); return webContents.insertText(query); },
    };
    return { controls, bound, unconfirmed };
  }
  async function checkNewTarget(webContents, path, { signal } = {}) {
    cmsTargetPath(path);
    const { controls, bound, unconfirmed } = await prepareAdminSearch(webContents, signal);
    const publicResult = await observeSquarespacePublicTarget(path, { fetchImpl: fetchPublicTarget, signal });
    const admin = await observeSquarespaceAdminTarget(path, controls);
    bound();
    if (admin.path !== publicResult.path || admin.parentPath !== publicResult.parentPath) throw unconfirmed();
    return { ...admin, exists: false, parentExists: true, online: true, observationId: randomUUID(), checkedAt: new Date().toISOString() };
  }
  async function checkNeutralDraftVacancy(webContents, dispatchBinding, { signal } = {}) {
    const dispatch = validateCmsDispatchBinding(dispatchBinding);
    cmsNeutralDraftPath(dispatch);
    const { controls, bound, unconfirmed } = await prepareAdminSearch(webContents, signal);
    const publicResult = await observeSquarespacePublicNeutralDraft(dispatch, { fetchImpl: fetchPublicTarget, signal });
    const admin = await observeSquarespaceAdminNeutralDraft(dispatch, controls);
    bound();
    if (admin.path !== publicResult.path) throw unconfirmed();
    return { path: admin.path, exists: false };
  }
  function bindCreationCatalog(webContents, signal) {
    const unavailable = () => Object.assign(failure("Der Squarespace-Katalog für den unveröffentlichten Entwurf ist nicht eindeutig bereit."),
      { code: "SQUARESPACE_EDITOR_NOT_READY" });
    const top = mainFrame(webContents);
    function bound() {
      stopIfAborted(signal);
      if (mainFrame(webContents) !== top || webContents.getURL() !== `${ADMIN}/config/pages`) throw unavailable();
    }
    return {
      signal, waitMs, timeoutMs,
      read: async payload => {
        bound();
        const state = await boundedRead(top, payload,
          (frame, request) => frame.executeJavaScript(`${creationCatalogSource}(${JSON.stringify(request)})`, true));
        bound();
        return state;
      },
      click: point => { bound(); return click(webContents, point, signal); },
    };
  }
  const hasNoExistingStandardDraft = state => state?.name === null && state.defaultSettingsPresent === false
    && typeof state.previewPath === "string" && state.previewPath !== PERSISTED_BLANK_DRAFT.path;
  async function prepareUnpublishedPage(webContents, plan, { signal, contentSteps } = {}) {
    const path = cmsTargetPath(plan?.target?.path);
    const unavailable = () => Object.assign(failure("Der Plan für den unveröffentlichten Squarespace-Entwurf konnte nicht bestätigt werden."),
      { code: "SQUARESPACE_EDITOR_NOT_READY" });
    if (plan.publish !== false || plan.structure?.path !== path || !/^[a-f0-9]{64}$/.test(plan.planHash || "")
        || !isDeepStrictEqual(contentSteps, createCmsContentSteps(plan))) throw unavailable();
    const adminPagesOpen = webContents.getURL() === `${ADMIN}/config/pages`;
    const nameRead = { operation: "draft-name-state" };
    const before = adminPagesOpen ? await bindCreationCatalog(webContents, signal).read(nameRead) : null;
    if (adminPagesOpen && !hasNoExistingStandardDraft(before)) throw unavailable();
    const targetObservation = await checkNewTarget(webContents, path, { signal });
    const controls = bindCreationCatalog(webContents, signal), after = await controls.read(nameRead);
    if (!hasNoExistingStandardDraft(after) || before && !isDeepStrictEqual(before, after)) throw unavailable();
    await observeSquarespacePageCreationCatalog(controls);
    return { ready: true, planHash: plan.planHash, targetPath: path, targetObservation };
  }
  async function createNeutralDraft(webContents, dispatchBinding, { assertCurrent, signal } = {}) {
    const dispatch = validateCmsDispatchBinding(dispatchBinding);
    const key = JSON.stringify([dispatch.projectId, dispatch.attemptId, dispatch.dispatchId]);
    const denied = () => Object.assign(failure("Der Auftrag für die leere Squarespace-Seite ist nicht freigegeben oder wurde bereits ausgelöst."),
      { code: "SQUARESPACE_PAGE_CREATION_NOT_AUTHORIZED" });
    const uncertain = () => Object.assign(failure("Die neu angelegte Squarespace-Seite konnte nicht eindeutig zugeordnet werden."),
      { code: "SQUARESPACE_PAGE_CREATION_UNCONFIRMED" });
    if (typeof assertCurrent !== "function" || typeof webContents?.insertText !== "function" || blankPageRequests.has(key)) throw denied();
    const authorize = async () => {
      stopIfAborted(signal);
      if (await assertCurrent() === false) throw denied();
      stopIfAborted(signal);
    };
    blankPageRequests.add(key);
    let attempted = false;
    try {
      await authorize();
      const controls = bindCreationCatalog(webContents, signal);
      const expectedInitial = await controls.read({ operation: "catalog-state" });
      if (expectedInitial?.mode !== "closed") throw denied();
      const previous = await controls.read({ operation: "draft-name-state" });
      if (!hasNoExistingStandardDraft(previous) || previous.epoch !== expectedInitial.epoch || previous.previewPath !== expectedInitial.previewPath) throw denied();
      const vacancy = await checkNeutralDraftVacancy(webContents, dispatch, { signal });
      const confirmed = await controls.read({ operation: "draft-name-state" });
      if (!hasNoExistingStandardDraft(confirmed) || !isDeepStrictEqual(previous, confirmed)) throw denied();
      await selectSquarespaceBlankPage(controls, { expectedInitial, authorize, markAttempt: () => { attempted = true; } });

      const nameState = () => controls.read({ operation: "draft-name-state", previous });
      const nameMessage = "Die neu hinzugefügte Squarespace-Seite wurde nicht eindeutig in der Seitenliste erkannt.";
      try {
        const top = mainFrame(webContents);
        const namedDraft = { path: vacancy.path, title: dispatch.placeholderTitle };
        async function newCollection(state, { path, title }) {
          if (state?.epoch !== previous.epoch || state.previewPath !== path || state.name !== null
              || state.rowCount !== previous.rowCount + 1 || state.titles.length !== previous.titles.length + 1
              || state.firstSettingsLabel !== `Seiteneinstellungen ${title}`
              || !isDeepStrictEqual(state.titles.slice(1), previous.titles)
              || !isDeepStrictEqual(state.outsideTitles, previous.outsideTitles)) return null;
          const pageUrl = new URL(path, "https://www.fnwildlifetravel.de").href;
          const frame = previewFrame(webContents, pageUrl);
          if (frame?.parent !== top) return null;
          const observed = await boundedRead(frame, { operation: "draft-collection-observation", pageUrl });
          return /^[a-f0-9]{24}$/.test(observed?.id || "") && previewFrame(webContents, pageUrl) === frame
            && Number.isFinite(observed.epoch) && observed.epoch > 0
            && isDeepStrictEqual(state, await nameState()) ? { path, title, pageUrl, frame, observed } : null;
        }
        let collection = await waitFor(async () => {
          const state = await nameState();
          if (state?.defaultName === true) return { needsName: true };
          if (previous.previewPath === PERSISTED_BLANK_DRAFT.path || previous.defaultSettingsPresent !== false
              || state?.defaultSettingsPresent !== true || !Array.isArray(previous.outsideTitles)) return null;
          return newCollection(state, PERSISTED_BLANK_DRAFT);
        }, nameMessage, signal);
        if (collection.needsName) {
          await authorize();
          const selected = await controls.read({ operation: "draft-select-name", previous });
          if (selected?.defaultName !== true || selected.selected !== true || !isDeepStrictEqual(selected, await nameState())) throw uncertain();
          stopIfAborted(signal);
          await webContents.insertText(dispatch.placeholderTitle);
          await waitFor(async () => (await nameState())?.name === dispatch.placeholderTitle, nameMessage, signal);
          await authorize();
          if ((await nameState())?.name !== dispatch.placeholderTitle) throw uncertain();
          stopIfAborted(signal);
          webContents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
          webContents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
          collection = await waitFor(async () => newCollection(await nameState(), namedDraft),
            "Die neue Squarespace-Seite wurde nicht in der Vorschau geladen.", signal);
        }
        const { path, title, pageUrl } = collection;
        const sameCollection = async () => {
          const current = await newCollection(await nameState(), collection);
          return current?.frame === collection.frame && isDeepStrictEqual(current.observed, collection.observed);
        };
        if (!await openBoundDraftSettings(webContents, { top, pageUrl, title, samePage: sameCollection, authorize, signal,
          message: "Das Zahnrad der neu angelegten Squarespace-Seite wurde nicht eindeutig sichtbar." })) throw uncertain();
        const draft = await waitFor(() => inspectIdentifiedDraftSettings(webContents, { path, title }, { signal }),
          "Die Einstellungen der neuen Squarespace-Seite wurden nicht eindeutig geladen.", signal);
        if (draft.pageId !== collection.observed.id || draft.path !== path) throw uncertain();
        if (path === PERSISTED_BLANK_DRAFT.path) {
          // Squarespace can save a default-titled page before inline naming is available.
          // Only the just-observed collection can be deactivated here.
          const binding = bindDraftSettings(webContents, { planHash: dispatch.planHash, target: { path: dispatch.targetPath } }, {
            pageId: draft.pageId, dispatchBinding: dispatch, signal, assertWritable: async () => { await authorize(); return true; },
          });
          const saved = await deactivateIdentifiedDraft(webContents, binding, { path, title, signal });
          return rememberDisabledDraft(Object.freeze(draft), webContents, binding, path, saved);
        }
        return draft;
      } catch (error) {
        stopIfAborted(signal);
        throw error?.code ? error : uncertain();
      }
    } finally {
      if (!attempted) blankPageRequests.delete(key);
    }
  }
  function hasBoundUnloadedPreview(webContents, pageUrl, state) {
    if (state?.mode !== "preview" || state.iframeCount !== 1 || state.dialogOpen !== false) return false;
    try {
      if (webContents.getURL() !== `${ADMIN}/config/pages` || previewPageUrl(state.iframeSrc) !== previewPageUrl(pageUrl)) return false;
      const top = mainFrame(webContents);
      const directFrames = (top.framesInSubtree || []).filter(frame => frame.parent === top && !frame.detached && !frame.isDestroyed?.());
      // Auxiliary frames can coexist with the preview. Only the named iframe's
      // own blank document can qualify the multi-frame case.
      return state.iframeDocumentBlank !== false && (state.iframeDocumentBlank === true || directFrames.length === 1)
        && directFrames.some(frame => frame.url === "about:blank");
    } catch { return false; }
  }
  async function isBoundCollectionFrame(webContents, top, frame, pageUrl, pageId) {
    const current = () => webContents.getURL() === `${ADMIN}/config/pages` && mainFrame(webContents) === top
      && frame?.parent === top && previewFrame(webContents, pageUrl) === frame;
    return current() && await boundedRead(frame, { operation: "draft-collection-identity", pageUrl, pageId }) === true && current();
  }
  async function openPage(webContents, plan, signal, { allowUnloadedPreview = false, boundPageId } = {}) {
    const hasUnloadedPreview = state => allowUnloadedPreview && (!boundPageId || state?.iframeDocumentBlank === true)
      && hasBoundUnloadedPreview(webContents, plan.pageUrl, state);
    let top = mainFrame(webContents), frame = previewFrame(webContents, plan.pageUrl);
    const initialTop = top;
    const previewOnly = state => mainFrame(webContents) === initialTop && webContents.getURL() === `${ADMIN}/config/pages`
      && state?.mode === "preview" && state.iframeCount === 1 && state.dialogOpen === false;
    async function isBoundPreview(state, currentFrame) {
      if (!previewOnly(state)) return false;
      return currentFrame ? isBoundCollectionFrame(webContents, top, currentFrame, plan.pageUrl, boundPageId) : hasUnloadedPreview(state);
    }
    const changed = () => failure("Die Squarespace-Vorschau ist nicht eindeutig der gespeicherten Seite zugeordnet.");
    let state = await previewState(webContents);
    // The dashboard also embeds the public homepage, without the page toolbar.
    // It cannot authorize editing; enter the regular page administration first.
    if (new URL(webContents.getURL()).pathname !== "/config/pages" || state?.iframeCount !== 1) frame = null;
    if (!state || (state.iframeCount === 1 || new URL(webContents.getURL()).pathname === "/config/pages")
        && !["preview", "editing"].includes(state.mode)) {
      state = await waitFor(async () => {
        const current = await previewState(webContents);
        return current?.iframeCount === 1 && ["preview", "editing"].includes(current.mode) ? current : null;
      }, "Der Zustand der Squarespace-Seitenbearbeitung ist nicht eindeutig. Es wurden keine Bildtexte eingegeben.", signal);
      top = mainFrame(webContents);
      frame = previewFrame(webContents, plan.pageUrl);
    }
    if (boundPageId && !previewOnly(state)) throw changed();
    if (!frame && state?.mode === "editing") {
      state = await exitSavedPage(webContents, "", signal);
      top = mainFrame(webContents);
    }
    if (!frame && !hasUnloadedPreview(state)) {
      const current = new URL(webContents.getURL());
      if (current.origin !== ADMIN || current.pathname !== "/config/pages" || state?.iframeCount !== 1) {
        if (boundPageId) throw changed();
        await navigate(webContents, `${ADMIN}/config/pages`, signal);
        top = mainFrame(webContents);
      }
      const pageNames = squarespacePageNames(plan);
      let selected = false;
      for (let attempt = 0; attempt < 40 && !selected; attempt += 1) {
        stopIfAborted(signal);
        if (boundPageId && !previewOnly(await previewState(webContents))) throw changed();
        const target = await perform(top, { operation: "select-page", names: pageNames, pageUrl: plan.pageUrl });
        if (boundPageId && !previewOnly(await previewState(webContents))) throw changed();
        selected = pageNames.includes(target?.name) && click(webContents, target, signal);
        if (selected) break;
        const folder = await perform(top, { operation: "expand-folder" });
        if (boundPageId && !previewOnly(await previewState(webContents))) throw changed();
        click(webContents, folder, signal);
        await delay(waitMs, undefined, { signal });
      }
      if (!selected) throw failure("Die freigegebene Seite ist im Squarespace-Seitenbaum nicht eindeutig zugeordnet.");
      if (allowUnloadedPreview) {
        state = await waitFor(async () => {
          const current = await previewState(webContents);
          return previewFrame(webContents, plan.pageUrl) || hasUnloadedPreview(current) ? current : null;
        }, "Die Squarespace-Seitenvorschau lädt nicht. Es wurden keine Bildtexte eingegeben.", signal);
        frame = previewFrame(webContents, plan.pageUrl);
      } else {
        frame = await waitFor(() => previewFrame(webContents, plan.pageUrl),
          "Die Squarespace-Seitenvorschau lädt nicht. Es wurden keine Bildtexte eingegeben.", signal);
        state = await previewState(webContents);
      }
    }
    stopIfAborted(signal);
    if (state?.iframeCount !== 1 || !["preview", "editing"].includes(state?.mode)) {
      throw failure("Der Zustand der Squarespace-Seitenbearbeitung ist nicht eindeutig. Es wurden keine Bildtexte eingegeben.");
    }
    if (boundPageId && !await isBoundPreview(state, frame)) throw changed();
    if (state.mode === "editing") return frame;
    const target = await perform(top, { operation: "edit-page", ...(allowUnloadedPreview || boundPageId ? { pageUrl: plan.pageUrl } : {}) });
    if (allowUnloadedPreview) {
      const current = await previewState(webContents), currentFrame = previewFrame(webContents, plan.pageUrl);
      if (mainFrame(webContents) !== top || current?.mode !== "preview" || current.iframeCount !== 1 || current.dialogOpen !== false
          || previewPageUrl(current.iframeSrc) !== previewPageUrl(plan.pageUrl)
          || currentFrame?.parent !== top && !hasUnloadedPreview(current)) {
        throw failure("Die Squarespace-Seitenvorschau ist nicht eindeutig zugeordnet.");
      }
    }
    if (boundPageId && (!isDeepStrictEqual(target, await boundedRead(top, { operation: "edit-page", pageUrl: plan.pageUrl }))
        || !await isBoundPreview(await previewState(webContents), previewFrame(webContents, plan.pageUrl)))) throw changed();
    if (!click(webContents, target, signal)) throw failure("Die Seitenbearbeitung lässt sich nicht eindeutig öffnen.");
    return waitFor(async () => {
      const current = previewFrame(webContents, plan.pageUrl), editing = await previewState(webContents);
      if (!current || editing?.iframeCount !== 1 || editing?.mode !== "editing") return null;
      if (boundPageId && (editing.dialogOpen !== false || editing.saveDisabled !== true
          || !await isBoundCollectionFrame(webContents, top, current, plan.pageUrl, boundPageId))) throw changed();
      return current;
    }, "Die Bearbeitung der freigegebenen Seite ist noch nicht eindeutig geladen. Es wurden keine Bildtexte eingegeben.", signal);
  }
  async function closeGallery(webContents, top, signal) {
    const target = await perform(top, { operation: "close-gallery" });
    if (!click(webContents, target, signal)) throw failure("Der Galerieeditor lässt sich nicht eindeutig schließen. Bitte den Abschluss prüfen.");
    await waitFor(() => perform(top, { operation: "gallery-closed" }),
      "Das Schließen des Galerieeditors ist noch nicht bestätigt. Bitte den Abschluss prüfen.", signal);
  }
  async function exitSavedPage(webContents, expectedPageUrl, signal, allowBlockEdit = false, boundPageId) {
    const top = mainFrame(webContents), adminUrl = new URL(webContents.getURL());
    const readState = () => previewState(webContents, allowBlockEdit);
    const state = await readState();
    let previousPage;
    try { previousPage = previewPageUrl(state?.iframeSrc); } catch { /* An unknown or foreign frame never authorizes Exit. */ }
    const frame = previousPage && previewFrame(webContents, previousPage);
    if (adminUrl.origin !== ADMIN || adminUrl.pathname !== "/config/pages" || state?.iframeCount !== 1
        || state.dialogOpen !== false || !frame || frame.parent !== top
        || expectedPageUrl && previousPage !== previewPageUrl(expectedPageUrl)
        || boundPageId && !await isBoundCollectionFrame(webContents, top, frame, previousPage, boundPageId)) {
      throw failure("Die aktuelle FN-Seitenbearbeitung lässt sich nicht eindeutig einem gespeicherten Abschluss zuordnen.");
    }
    if (state.mode === "preview") return state;
    if (state.mode !== "editing" || state.saveDisabled !== true) {
      throw failure("Die FN-Seitenbearbeitung ist noch nicht eindeutig gespeichert. Bitte offene Änderungen zuerst prüfen.");
    }
    const target = await waitFor(async () => {
      const current = await readState(), currentFrame = previewFrame(webContents, previousPage);
      let samePage = false;
      try { samePage = previewPageUrl(current?.iframeSrc) === previousPage; } catch { /* Unknown frames cannot authorize Exit. */ }
      if (mainFrame(webContents) !== top || current?.iframeCount !== 1 || !samePage || !currentFrame
          || currentFrame.parent !== top || current.dialogOpen !== false) return null;
      if (boundPageId && !await isBoundCollectionFrame(webContents, top, currentFrame, previousPage, boundPageId)) return null;
      if (current.mode === "preview") return { completed: current };
      if (current.mode !== "editing" || current.saveDisabled !== true) return null;
      const action = await perform(top, { operation: "exit-page", pageUrl: previousPage, ...(allowBlockEdit && { allowBlockEdit }) });
      // Save may replace the same page's frame. Bind it freshly and require it
      // to remain unchanged throughout this read before sending one native click.
      return mainFrame(webContents) === top && previewFrame(webContents, previousPage) === currentFrame
        && (!boundPageId || await isBoundCollectionFrame(webContents, top, currentFrame, previousPage, boundPageId)) ? action : null;
    }, "Die gespeicherte FN-Seitenbearbeitung lässt sich nicht eindeutig beenden.", signal);
    if (target.completed) return target.completed;
    if (!click(webContents, target, signal)) {
      throw failure("Die gespeicherte FN-Seitenbearbeitung lässt sich nicht eindeutig beenden.");
    }
    return waitFor(async () => {
      const current = await previewState(webContents), preview = previewFrame(webContents, previousPage);
      let samePage = false;
      try { samePage = previewPageUrl(current?.iframeSrc) === previousPage; } catch { /* A changed frame is not the confirmed preview. */ }
      return current?.mode === "preview" && current.iframeCount === 1 && current.dialogOpen === false
        && samePage && preview?.parent === mainFrame(webContents)
        && (!boundPageId || await isBoundCollectionFrame(webContents, top, preview, previousPage, boundPageId)) ? current : null;
    }, "Das Beenden der FN-Seitenbearbeitung ist noch nicht als Vorschau bestätigt. Bitte den Abschluss prüfen.", signal);
  }
  const readDraftSettings = (top, payload) => boundedRead(top, payload,
    (frame, request) => frame.executeJavaScript(`${settingsOperationSource}(${JSON.stringify(request)})`, true));

  /** Read the actual collection ID when the neutral settings and its loaded preview agree. */
  async function inspectNeutralDraft(webContents, dispatchBinding, { signal } = {}) {
    stopIfAborted(signal);
    const dispatch = validateCmsDispatchBinding(dispatchBinding), path = cmsNeutralDraftPath(dispatch);
    return inspectIdentifiedDraftSettings(webContents, { path, title: dispatch.placeholderTitle }, { signal });
  }
  async function inspectIdentifiedDraftSettings(webContents, { path, title }, { signal, includeSettings = false }) {
    stopIfAborted(signal);
    if (!webContents || webContents.isDestroyed?.() || webContents.getURL() !== `${ADMIN}/config/pages`) return null;
    const top = mainFrame(webContents), pageUrl = new URL(path, "https://www.fnwildlifetravel.de").href;
    const frame = previewFrame(webContents, pageUrl);
    if (frame?.parent !== top) return null;
    const read = () => Promise.all([
      boundedRead(top, { operation: "document-epoch" }),
      readDraftSettings(top, { operation: "settings-state", pageUrl }),
      boundedRead(frame, { operation: "draft-collection-observation", pageUrl }),
    ]);
    const first = await read();
    stopIfAborted(signal);
    const [epoch, settings, observed] = first;
    if (!Number.isFinite(epoch) || epoch <= 0 || !settings || settings.title !== title
        || settings.navigationTitle !== title || `/${settings.slug}` !== path
        || settings.saveAvailable !== false || typeof settings.enabled !== "boolean"
        || typeof settings.modalId !== "string" || !/^m[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(settings.modalId)
        || typeof observed?.id !== "string" || !/^[a-f0-9]{24}$/.test(observed.id)
        || !Number.isFinite(observed.epoch) || observed.epoch <= 0) return null;
    const second = await read();
    stopIfAborted(signal);
    return isDeepStrictEqual(first, second) && !webContents.isDestroyed?.()
      && mainFrame(webContents) === top && webContents.getURL() === `${ADMIN}/config/pages`
      && frame.parent === top && previewFrame(webContents, pageUrl) === frame
      ? { pageId: observed.id, path, ...(includeSettings && { settings }) } : null;
  }
  function bindDraftSettings(webContents, plan, { pageId, dispatchBinding, assertWritable, signal }) {
    const dispatch = validateCmsDispatchBinding(dispatchBinding, { planHash: plan.planHash, targetPath: plan.target.path });
    const top = mainFrame(webContents), scope = { pageId, path: dispatch.targetPath };
    const title = dispatch.placeholderTitle, neutralPath = cmsNeutralDraftPath(dispatch);
    const message = "Die Einstellungen der neu angelegten Squarespace-Seite sind nicht eindeutig bestätigt.";
    const changed = () => Object.assign(failure(message), { code: "SQUARESPACE_DRAFT_SETTINGS_UNCONFIRMED" });
    const assertBound = () => {
      stopIfAborted(signal);
      if (mainFrame(webContents) !== top || webContents.getURL() !== `${ADMIN}/config/pages`) throw changed();
    };
    if (!/^[a-f0-9]{24}$/.test(pageId || "")
        || typeof assertWritable !== "function") throw changed();
    const pageUrl = path => new URL(path, "https://www.fnwildlifetravel.de").href;
    async function read(path, operation = "settings-state", expected, field) {
      assertBound();
      const result = await readDraftSettings(top, { operation, pageUrl: pageUrl(path), expected, field });
      assertBound();
      return result;
    }
    async function samePage(path) {
      assertBound();
      const url = pageUrl(path), frame = previewFrame(webContents, url);
      if (frame?.parent !== top) return false;
      const identity = await boundedRead(frame, { operation: "draft-collection-identity", pageUrl: url, pageId });
      assertBound();
      return identity === true && previewFrame(webContents, url) === frame;
    }
    async function authorize(path) {
      if (!await samePage(path) || await assertWritable(scope) !== true || !await samePage(path)) throw changed();
    }
    async function previewWithoutDialog(path, allowUnloaded = false) {
      assertBound();
      const state = await previewState(webContents);
      return state?.mode === "preview" && state.dialogOpen === false && state.iframeCount === 1
        && redactedAddress(state.iframeSrc).pathname === path
        && (await samePage(path) || allowUnloaded && hasBoundUnloadedPreview(webContents, pageUrl(path), state));
    }
    async function confirmSaved(path, expected, previousModal) {
      const { open } = await waitFor(async () => {
        const state = await read(path);
        if (state && isDeepStrictEqual(state, { ...expected, modalId: state.modalId }) && await samePage(path)) return { open: state };
        return await previewWithoutDialog(path) ? { open: null } : null;
      }, message, signal);
      if (open) {
        await authorize(path);
        const close = await read(path, "settings-close", open);
        if (!click(webContents, close, signal)) throw changed();
        await waitFor(() => previewWithoutDialog(path), message, signal);
      }
      if (!await openBoundDraftSettings(webContents, { top, pageUrl: pageUrl(path), title: expected.navigationTitle,
        samePage: () => samePage(path), authorize: () => authorize(path), signal, message })) throw changed();
      return waitFor(async () => {
        const state = await read(path);
        if (!state || state.modalId === previousModal || state.modalId === open?.modalId) return null;
        if (!isDeepStrictEqual(state, { ...expected, modalId: state.modalId }) || !await samePage(path)) throw changed();
        return state;
      }, message, signal);
    }
    return { dispatch, top, scope, title, neutralPath, message, changed, read, assertBound, samePage, authorize, previewWithoutDialog, confirmSaved };
  }
  async function deactivateIdentifiedDraft(webContents, draft, { path, title, signal }) {
    const { read, changed, message, authorize, samePage, confirmSaved } = draft;
    const expected = { title, navigationTitle: title, slug: path.slice(1), enabled: false, saveAvailable: false };
    const initial = await read(path);
    if (typeof initial?.enabled !== "boolean" || !isDeepStrictEqual(initial, { ...expected, enabled: initial.enabled, modalId: initial.modalId })
        || !await samePage(path)) throw changed();
    async function clickSetting(operation, state) {
      await authorize(path);
      const control = await read(path, operation, state);
      if (!control || !await samePage(path) || !isDeepStrictEqual(control, await read(path, operation, state))
          || !click(webContents, control, signal)) throw changed();
    }
    if (initial.enabled) {
      await clickSetting("settings-disable", initial);
      const disabled = { ...initial, enabled: false, saveAvailable: true };
      await waitFor(async () => isDeepStrictEqual(await read(path), disabled), message, signal);
      await clickSetting("settings-save", disabled);
    }
    return confirmSaved(path, expected, initial.modalId);
  }
  async function disableNeutralDraftSettings(webContents, plan, options) {
    const { signal } = options, draft = bindDraftSettings(webContents, plan, options);
    const saved = await deactivateIdentifiedDraft(webContents, draft, { path: draft.neutralPath, title: draft.title, signal });
    return rememberDisabledDraft(Object.freeze({}), webContents, draft, draft.neutralPath, saved);
  }
  function rememberDisabledDraft(proof, webContents, draft, sourcePath, saved) {
    disabledNeutralDrafts.set(proof, { webContents, top: draft.top, pageId: draft.scope.pageId, dispatch: draft.dispatch,
      sourcePath, saved, issued: performance.now() });
    return proof;
  }
  async function assignUnpublishedDraftSettings(webContents, plan, { disabledNeutralDraft, checkTargetAvailable, ...options }) {
    const { signal } = options, draft = bindDraftSettings(webContents, plan, options);
    const { dispatch, scope, read, authorize, changed, message } = draft;
    const proof = disabledNeutralDrafts.get(disabledNeutralDraft);
    if (!proof || proof.webContents !== webContents || proof.top !== draft.top || proof.pageId !== scope.pageId
        || !isDeepStrictEqual(proof.dispatch, dispatch) || performance.now() - proof.issued >= 60_000
        || typeof checkTargetAvailable !== "function" || typeof webContents.insertText !== "function") throw changed();
    const { sourcePath } = proof;
    const title = plan.structure.title, slug = scope.path.slice(1);
    if (typeof title !== "string" || !title.trim() || title.length > 300 || /[\r\n\x00]/u.test(title)) throw changed();
    let observationId;
    async function checkTarget() {
      const started = Date.now(), observation = validateCmsTargetObservation(await checkTargetAvailable(scope.path, { signal }), scope.path);
      const checked = Date.parse(observation.checkedAt);
      if (checked < started || checked > Date.now() || observation.observationId === observationId) throw changed();
      observationId = observation.observationId;
    }
    await checkTarget();
    await authorize(sourcePath);
    let current = proof.saved;
    if (!isDeepStrictEqual(await read(sourcePath), current)) throw changed();
    for (const [field, value] of Object.entries({ title, navigationTitle: title, slug })) {
      if (current[field] === value) continue;
      await authorize(sourcePath);
      if (await read(sourcePath, "settings-focus", current, field) !== true) throw changed();
      stopIfAborted(signal);
      await webContents.insertText(value);
      current = { ...current, [field]: value, saveAvailable: true };
      await waitFor(async () => isDeepStrictEqual(await read(sourcePath), current), message, signal);
    }
    await checkTarget();
    await authorize(sourcePath);
    const save = await read(sourcePath, "settings-save", current);
    if (!save) throw changed();
    // A failed/unclear save must be inspected rather than retried with this proof.
    disabledNeutralDrafts.delete(disabledNeutralDraft);
    if (!click(webContents, save, signal)) throw changed();
    const saved = await draft.confirmSaved(scope.path, { title, navigationTitle: title, slug, enabled: false, saveAvailable: false }, current.modalId);
    return confirmAssignedDraftSettings(webContents, plan, options, saved);
  }
  async function confirmAssignedDraftSettings(webContents, plan, options, expected) {
    const { signal } = options, draft = bindDraftSettings(webContents, plan, options);
    const { scope, dispatch, changed } = draft, { pageId, path } = scope;
    const title = plan.structure.title;
    await draft.authorize(path);
    const state = await draft.read(path);
    if (!state || state.enabled !== false || state.saveAvailable !== false || state.title !== title
        || state.navigationTitle !== title || `/${state.slug}` !== path || expected && !isDeepStrictEqual(state, expected)) throw changed();
    const proof = await confirmSquarespaceDisabledPage(webContents,
      { pageId, expectedTitle: title, dispatchBinding: dispatch, signal });
    await draft.authorize(path);
    if (!isDeepStrictEqual(await draft.read(path), state) || !await draft.samePage(path)) throw changed();
    assignedDraftSettings.set(proof, { webContents, pageId, dispatch, settings: Object.freeze(state) });
    return proof;
  }
  async function openAssignedDraftEditor(webContents, plan, { disabledPage, ...options }) {
    const { signal } = options, draft = bindDraftSettings(webContents, plan, options);
    const { top, scope, dispatch } = draft, { pageId, path } = scope;
    const pageUrl = new URL(path, "https://www.fnwildlifetravel.de").href, title = plan.structure.title;
    const expected = assignedDraftSettings.get(disabledPage)?.settings;
    const message = "Die Bearbeitung der deaktivierten Squarespace-Artseite konnte nicht eindeutig geöffnet werden.";
    let stage = "settings";
    const changed = () => Object.assign(failure(message), { code: "SQUARESPACE_DRAFT_EDITOR_UNCONFIRMED", stage });
    const current = () => isCurrentSquarespaceDisabledPage(disabledPage, webContents, pageId, dispatch, { expectedTitle: title });
    if (!expected || !current() || !isDeepStrictEqual(await draft.read(path), expected)) throw changed();
    const documentEpoch = () => boundedRead(top, { operation: "document-epoch" });
    const epoch = await documentEpoch();
    if (!Number.isFinite(epoch)) throw changed();
    async function assertDocument() {
      draft.assertBound();
      if (await documentEpoch() !== epoch || !current()) throw changed();
    }
    await draft.authorize(path);
    await assertDocument();
    const close = await draft.read(path, "settings-close", expected);
    if (!current() || !click(webContents, close, signal)) throw changed();
    try {
      stage = "preview-after-settings";
      await waitFor(async () => {
        await assertDocument();
        return draft.previewWithoutDialog(path, true);
      }, message, signal);
      stage = "edit-control";
      const edit = () => boundedRead(top, { operation: "edit-page", pageUrl });
      const first = nativePoint(webContents, await edit());
      if (!first || await options.assertWritable(scope) !== true || !await draft.previewWithoutDialog(path, true)) throw changed();
      await assertDocument();
      const confirmed = await edit();
      draft.assertBound();
      if (!isDeepStrictEqual(nativePoint(webContents, confirmed), first) || !current() || !click(webContents, confirmed, signal)) throw changed();
      stage = "empty-editor";
      // The editor toolbar and the embedded empty page can become ready separately.
      return await waitFor(async () => {
        await assertDocument();
        const state = await previewState(webContents), address = redactedAddress(state?.iframeSrc);
        if (state?.dialogOpen === true || state?.iframeCount > 1
            || address.status === "foreign" || address.status === "loaded" && address.pathname !== path) throw changed();
        if (state?.mode !== "editing" || state.dialogOpen !== false || state.iframeCount !== 1 || address.pathname !== path) return null;
        if (state.saveDisabled !== true) throw changed();
        const frame = previewFrame(webContents, pageUrl);
        if (frame?.parent !== top || !await draft.samePage(path)) return null;
        const sectionScope = { ...scope, sectionId: null };
        const empty = await boundedRead(frame, { ...sectionScope, pageUrl, operation: "section-catalog-anchor" });
        if (empty !== true) return null;
        const currentFrame = () => current() && frame === previewFrame(webContents, pageUrl);
        const control = await readSectionCatalogTrigger({ top, frame, pageUrl, scope: sectionScope, current: currentFrame });
        const after = await previewState(webContents);
        await assertDocument();
        return nativePoint(webContents, control) && isDeepStrictEqual(after, state) && currentFrame()
          ? { status: "editing", pageId, path } : null;
      }, message, signal, timeoutMs * 2);
    } catch (error) {
      stopIfAborted(signal);
      if (error?.message === message) throw changed();
      throw error;
    }
  }
  async function reconfirmAssignedDraftSettings(webContents, plan, { disabledPage, ...options }) {
    const prior = assignedDraftSettings.get(disabledPage), draft = bindDraftSettings(webContents, plan, options);
    const { top, scope, dispatch, changed } = draft, { pageId, path } = scope;
    if (!prior || prior.webContents !== webContents || prior.pageId !== pageId || !isDeepStrictEqual(prior.dispatch, dispatch)
        || prior.settings.title !== plan.structure.title) throw changed();
    const documentEpoch = () => boundedRead(top, { operation: "document-epoch" });
    const epoch = await documentEpoch();
    if (!Number.isFinite(epoch) || !await draft.previewWithoutDialog(path)) throw changed();
    const { modalId, ...expected } = prior.settings;
    const current = await draft.confirmSaved(path, expected, modalId);
    const proof = await confirmSquarespaceDisabledPage(webContents,
      { pageId, expectedTitle: expected.title, dispatchBinding: dispatch, signal: options.signal });
    if (!isDeepStrictEqual(await draft.read(path), current) || !await draft.samePage(path) || await documentEpoch() !== epoch) throw changed();
    draft.assertBound();
    assignedDraftSettings.set(proof, { webContents, pageId, dispatch, settings: Object.freeze(current) });
    return proof;
  }
  async function readSectionCatalogTrigger({ top, frame, pageUrl, scope, current }) {
    const topTrigger = () => boundedRead(top, { ...scope, pageUrl, operation: "section-catalog-trigger" });
    const topControl = await topTrigger();
    if (scope.sectionId !== null || topControl?.frameTriggerAllowed !== true) return topControl;
    if (!current()) return null;
    const frameControl = await boundedRead(frame, { ...scope, pageUrl, operation: "section-catalog-frame-trigger" });
    if (!frameControl || !current()) return null;
    const mapped = await boundedRead(top, { pageUrl, operation: "map-gallery-hover",
      framePoint: frameControl.point, frameViewport: frameControl.viewport });
    return mapped?.point && !mapped.blocked && (await topTrigger())?.frameTriggerAllowed === true
      ? { point: mapped.point, frameControl } : null;
  }
  async function openPageSectionCatalog(webContents, plan, { pageId, afterSectionId, dispatchBinding, disabledPage, assertWritable, signal }) {
    const dispatch = validateCmsDispatchBinding(dispatchBinding, { planHash: plan.planHash, targetPath: plan.target.path });
    const path = dispatch.targetPath, pageUrl = new URL(path, "https://www.fnwildlifetravel.de").href;
    const top = mainFrame(webContents), frame = previewFrame(webContents, pageUrl);
    const scope = { pageId, path, sectionId: afterSectionId };
    const current = () => frame?.parent === top && mainFrame(webContents) === top && previewFrame(webContents, pageUrl) === frame
      && isCurrentSquarespaceDisabledPage(disabledPage, webContents, pageId, dispatch, { expectedTitle: plan.structure.title });
    const message = "Die Abschnittsauswahl der deaktivierten Squarespace-Seite ist nicht eindeutig erreichbar.";
    const changed = () => Object.assign(failure(message), { code: "SQUARESPACE_SECTION_CATALOG_UNCONFIRMED" });
    const anchor = () => boundedRead(frame, { ...scope, pageUrl, operation: "section-catalog-anchor" });
    const trigger = () => readSectionCatalogTrigger({ top, frame, pageUrl, scope, current });
    stopIfAborted(signal);
    if (!current() || typeof assertWritable !== "function" || !await anchor() || !current()) throw changed();
    const initial = await trigger(), target = nativePoint(webContents, initial);
    if (!target || !current() || await assertWritable(scope) !== true || !current() || !await anchor() || !current()) throw changed();
    const confirmed = await trigger(), point = nativePoint(webContents, confirmed);
    if (!current() || !point || point.x !== target.x || point.y !== target.y
        || !isDeepStrictEqual(initial.frameControl, confirmed.frameControl) || !click(webContents, confirmed, signal)) throw changed();
    try {
      await waitFor(async () => {
        if (!current()) throw changed();
        const opened = await boundedRead(top, { pageUrl, operation: "section-catalog-open" });
        return current() && opened === true;
      }, message, signal);
    } catch (error) {
      stopIfAborted(signal);
      if (error?.message !== message) throw error;
      throw changed();
    }
    return { status: "catalog-open", pageId, path, sectionId: afterSectionId };
  }
  function bindFluidDraft(webContents, plan, { pageId, sectionId, dispatchBinding, disabledPage, assertWritable, signal }, changed) {
    const dispatch = validateCmsDispatchBinding(dispatchBinding, { planHash: plan.planHash, targetPath: plan.target.path });
    const path = dispatch.targetPath, pageUrl = new URL(path, "https://www.fnwildlifetravel.de").href;
    const top = mainFrame(webContents), frame = previewFrame(webContents, pageUrl);
    const scope = { pageId, path, sectionId };
    const assertBound = () => {
      stopIfAborted(signal);
      if (frame?.parent !== top || mainFrame(webContents) !== top || previewFrame(webContents, pageUrl) !== frame
          || !isCurrentSquarespaceDisabledPage(disabledPage, webContents, pageId, dispatch, { expectedTitle: plan.structure.title })) throw changed();
    };
    async function read(target, operation, extra = {}) {
      assertBound();
      const observed = await boundedRead(target, { ...scope, pageUrl, operation, ...extra });
      assertBound();
      return observed;
    }
    const authorize = async () => {
      assertBound();
      if (typeof assertWritable !== "function" || await assertWritable(scope) !== true) throw changed();
      assertBound();
    };
    return { top, frame, assertBound, authorize, read };
  }
  async function createBlankFluidSection(webContents, plan, { pageId, afterSectionId, dispatchBinding, disabledPage, assertWritable, signal }) {
    const message = "Der neue Squarespace-Abschnitt ist nicht eindeutig bestätigt. Bitte den offenen Entwurf prüfen.";
    const changed = () => Object.assign(failure(message), { code: "SQUARESPACE_FLUID_SECTION_UNCONFIRMED" });
    const options = { pageId, afterSectionId, dispatchBinding, disabledPage, assertWritable, signal };
    const draft = bindFluidDraft(webContents, plan, { ...options, sectionId: afterSectionId }, changed);
    const readSections = () => draft.read(draft.frame, "fluid-page-sections");
    const first = afterSectionId === null;
    if (first && firstSectionDispatched.has(disabledPage)) throw changed();
    const before = await readSections();
    if (!Array.isArray(before)) throw changed();
    const position = first ? 0 : before.findIndex(section => section.id === afterSectionId) + 1;
    if (first ? before.length !== 0 : position === 0) throw changed();
    await openPageSectionCatalog(webContents, plan, options);
    await draft.authorize();
    if (!isDeepStrictEqual(await readSections(), before)) throw changed();
    if (first && await draft.read(draft.frame, "section-catalog-anchor") !== true) throw changed();
    const blank = await draft.read(draft.top, "section-catalog-blank");
    if (first) {
      if (!nativePoint(webContents, blank) || firstSectionDispatched.has(disabledPage)) throw changed();
      // An ambiguous click may still create a section. Do not repeat it with this draft proof.
      firstSectionDispatched.add(disabledPage);
    }
    if (!click(webContents, blank, signal)) throw changed();
    return waitFor(async () => {
      const after = await readSections();
      if (!after || isDeepStrictEqual(after, before)) return null;
      const added = after[position];
      if (after.length !== before.length + 1 || added?.kind !== "fluid-engine" || before.some(section => section.id === added.id)
          || !isDeepStrictEqual(after.filter((_, index) => index !== position), before)) throw changed();
      const layout = await draft.read(draft.frame, "fluid-block-list", { sectionId: added.id });
      if (!layout) return null;
      if (layout.pickerOpen !== false || layout.blocks.length !== 0) throw changed();
      return { sectionId: added.id };
    }, message, signal);
  }
  async function appendFluidEditorBlock(webContents, plan, { pageId, sectionId, kind, dispatchBinding, disabledPage, assertWritable, signal }) {
    const message = "Der neue Squarespace-Block ist nicht eindeutig bestätigt. Bitte den offenen Entwurf prüfen.";
    let stage = "open-picker";
    let openState = "layout-unobserved";
    let choiceState;
    const changed = () => Object.assign(failure(message), { code: "SQUARESPACE_FLUID_BLOCK_UNCONFIRMED", stage,
      ...(stage === "open-picker" && { openState }),
      ...(stage === "choose-block" && choiceState && { choiceState }) });
    async function waitForBlockState(read) {
      try { return await waitFor(read, message, signal); }
      catch (error) {
        stopIfAborted(signal);
        if (error?.message === message) throw changed();
        throw error;
      }
    }
    if (!["text", "code"].includes(kind)) throw changed();
    const draft = bindFluidDraft(webContents, plan, { pageId, sectionId, dispatchBinding, disabledPage, assertWritable, signal }, changed);
    const readBlocks = () => draft.read(draft.frame, "fluid-block-list");
    const trigger = () => draft.read(draft.top, "fluid-block-trigger", { allowBlockEdit: true });
    async function map(source) {
      if (!source) return null;
      const target = await draft.read(draft.top, "map-gallery-hover", { framePoint: source.point, frameViewport: source.viewport });
      return nativePoint(webContents, target) ? target : null;
    }
    const before = await waitForBlockState(readBlocks);
    if (before.pickerOpen !== false) {
      openState = "picker-already-open";
      throw changed();
    }
    const readBoundTrigger = async () => {
      const layout = await readBlocks();
      openState = layout ? "trigger-unobserved" : "layout-unobserved";
      if (!layout) return null;
      if (!isDeepStrictEqual(layout, before)) {
        openState = "layout-changed";
        throw changed();
      }
      const target = await trigger();
      return nativePoint(webContents, target) ? target : null;
    };
    if (!await readBoundTrigger()) {
      await draft.authorize();
      const source = await draft.read(draft.frame, "fluid-section-focus");
      let focus;
      for (const point of source?.points ?? []) {
        focus = await map({ point, viewport: source.viewport });
        if (focus) break;
      }
      if (focus && !click(webContents, focus, signal)) throw changed();
    }
    const confirmed = await waitForBlockState(async () => {
      const first = await readBoundTrigger();
      if (!first) return null;
      await draft.authorize();
      const second = await readBoundTrigger();
      if (!second || !isDeepStrictEqual(second.point, first.point)) {
        openState = "trigger-changed";
        return null;
      }
      return second;
    });
    if (!click(webContents, confirmed, signal)) throw changed();
    stage = "choose-block";
    const readChoice = async () => {
      const layout = await readBlocks();
      choiceState = !layout ? "layout-unobserved" : layout.pickerOpen !== true ? "picker-unobserved" : "control-unobserved";
      if (!layout) return null;
      if (!isDeepStrictEqual(layout.blocks, before.blocks)) {
        choiceState = "layout-changed";
        throw changed();
      }
      if (layout.pickerOpen !== true) return null;
      const source = await draft.read(draft.frame, "fluid-block-choice", { kind });
      if (!source) return null;
      const target = await map(source);
      choiceState = target ? "point-confirmed" : "point-unreachable";
      return target;
    };
    const choice = await waitForBlockState(readChoice);
    await draft.authorize();
    const current = await readChoice();
    if (!current) throw changed();
    if (!isDeepStrictEqual(current.point, choice.point)) {
      choiceState = "point-changed";
      throw changed();
    }
    if (!click(webContents, current, signal)) throw changed();
    stage = "confirm-added-block";
    return waitForBlockState(async () => {
      const after = await readBlocks();
      if (!after || isDeepStrictEqual(after.blocks, before.blocks)) return null;
      const added = after.blocks.at(-1);
      if (after.blocks.length !== before.blocks.length + 1 || added?.kind !== kind
          || before.blocks.some(block => block.id === added.id) || !isDeepStrictEqual(after.blocks.slice(0, -1), before.blocks)) throw changed();
      if (after.pickerOpen !== false) return null;
      const created = appendedFluidBlocks.get(disabledPage) || new Map();
      created.set(added.id, { sectionId, kind, stage: "appended" });
      appendedFluidBlocks.set(disabledPage, created);
      return { blockId: added.id };
    });
  }
  async function placeFluidEditorBlock(webContents, plan, { pageId, sectionId, blockId, dispatchBinding, disabledPage, assertWritable, signal }) {
    const message = "Die Position des neu angelegten Squarespace-Blocks ist nicht eindeutig bestätigt.";
    const changed = () => Object.assign(failure(message), { code: "SQUARESPACE_FLUID_PLACEMENT_UNCONFIRMED" });
    const created = appendedFluidBlocks.get(disabledPage);
    const entry = created?.get(blockId);
    if (entry?.sectionId !== sectionId || entry?.stage !== "appended" || typeof sectionId !== "string") throw changed();
    const draft = bindFluidDraft(webContents, plan, { pageId, sectionId, dispatchBinding, disabledPage, assertWritable, signal }, changed);
    const readPlacement = () => draft.read(draft.frame, "fluid-block-placement", { blockId });
    const before = await readPlacement();
    if (!Array.isArray(before?.previous)) throw changed();
    if (before.aligned !== true) {
      const map = async point => nativePoint(webContents, await draft.read(draft.top, "map-gallery-hover",
        { framePoint: point, frameViewport: before.viewport }));
      if (!before.from || !before.to) throw changed();
      const from = await map(before.from), to = await map(before.to);
      await draft.authorize();
      if (!from || !to || from.x !== to.x || from.y >= to.y || !isDeepStrictEqual(await readPlacement(), before)
          || !isDeepStrictEqual(await map(before.from), from) || !isDeepStrictEqual(await map(before.to), to)) throw changed();
      // A dispatched move is single-use, including ambiguous outcomes.
      entry.stage = "placement-dispatched";
      let point = from;
      webContents.sendInputEvent({ type: "mouseDown", ...point, button: "left", clickCount: 1 });
      try {
        for (const step of [1, 2, 3, 4, 5, 6]) {
          await delay(18, undefined, { signal });
          draft.assertBound();
          point = { x: from.x, y: Math.round(from.y + (to.y - from.y) * step / 6) };
          webContents.sendInputEvent({ type: "mouseMove", ...point, modifiers: ["leftButtonDown"] });
        }
      } finally {
        if (!webContents.isDestroyed?.()) webContents.sendInputEvent({ type: "mouseUp", ...point, button: "left", clickCount: 1 });
      }
      await waitFor(async () => {
        const after = await readPlacement();
        if (after && !isDeepStrictEqual(after.previous, before.previous)) throw changed();
        return after?.aligned === true;
      }, message, signal);
    }
    if (entry.kind === "code") entry.stage = "positioned";
    else created.delete(blockId);
    return { blockId, positioned: true };
  }
  async function dispatchClassicBlockPickerClick(webContents, plan, { pageId, afterBlockId, dispatchBinding, disabledPage, assertWritable, signal }) {
    const dispatch = validateCmsDispatchBinding(dispatchBinding, { planHash: plan.planHash, targetPath: plan.target.path });
    const path = dispatch.targetPath, pageUrl = new URL(path, "https://www.fnwildlifetravel.de").href;
    const expectedTitle = plan.structure.title;
    const top = mainFrame(webContents), frame = previewFrame(webContents, pageUrl);
    const scope = { pageId, path, blockId: afterBlockId };
    const current = () => frame?.parent === top && mainFrame(webContents) === top && previewFrame(webContents, pageUrl) === frame
      && isCurrentSquarespaceDisabledPage(disabledPage, webContents, pageId, dispatch, { expectedTitle });
    const changed = () => Object.assign(failure("Der Einfügepunkt des klassischen Squarespace-Abschnitts ist nicht eindeutig erreichbar."),
      { code: "SQUARESPACE_CLASSIC_INSERT_UNCONFIRMED" });
    const assertEditing = async () => {
      stopIfAborted(signal);
      if (!current() || typeof assertWritable !== "function" || await assertWritable(scope) !== true || !current()) throw changed();
      const state = await previewState(webContents);
      if (!current() || state?.mode !== "editing" || state.dialogOpen !== false || state.iframeCount !== 1
          || redactedAddress(state.iframeSrc).pathname !== path) throw changed();
      stopIfAborted(signal);
    };
    const map = source => boundedRead(top, { operation: "map-gallery-hover", pageUrl,
      framePoint: source.point, frameViewport: source.viewport });
    const block = { pageUrl, pageId, blockId: afterBlockId };
    const readTrigger = async sectionId => {
      stopIfAborted(signal);
      if (!current()) throw changed();
      const trigger = await boundedRead(frame, { ...block, operation: "classic-insert-trigger" });
      if (!trigger) return null;
      if (trigger.sectionId !== sectionId || !current()) throw changed();
      const mapped = await map(trigger);
      return current() && nativePoint(webContents, mapped) ? mapped : null;
    };
    let sectionId;
    for (let index = 0; index < 3; index++) {
      await assertEditing();
      const anchor = await boundedRead(frame, { ...block, operation: "classic-insert-hover" });
      if (!Array.isArray(anchor?.points) || !current() || sectionId && sectionId !== anchor.sectionId) throw changed();
      sectionId = anchor.sectionId;
      const point = anchor.points[index];
      if (!point) continue;
      const hoverTarget = await map({ ...anchor, point });
      if (!current() || !hover(webContents, hoverTarget, signal)) throw changed();
      let target = await readTrigger(sectionId);
      if (!target) {
        await delay(Math.min(waitMs, timeoutMs), undefined, { signal });
        target = await readTrigger(sectionId);
      }
      if (!target) continue;
      await assertEditing();
      const confirmed = await readTrigger(sectionId);
      if (!confirmed || confirmed.point.x !== target.point.x || confirmed.point.y !== target.point.y) continue;
      if (!current() || !click(webContents, confirmed, signal)) throw changed();
      return { status: "click-dispatched", pageId, path, afterBlockId, sectionId };
    }
    throw changed();
  }
  async function activateEmptyPageText(webContents, { pageId, path, blockId, assertCurrent, changed, signal }) {
    const pageUrl = new URL(path, "https://www.fnwildlifetravel.de").href;
    const top = mainFrame(webContents), frame = previewFrame(webContents, pageUrl);
    const current = () => frame?.parent === top && mainFrame(webContents) === top && previewFrame(webContents, pageUrl) === frame;
    await assertCurrent();
    if (!current()) throw changed();
    const request = { operation: "text-block-activation", pageUrl, pageId, blockId };
    const initial = await boundedRead(frame, request);
    if (!initial || !current()) throw changed();
    if (initial.active === true) return false;
    const state = await previewState(webContents, true);
    if (!current() || state?.mode !== "editing" || state.dialogOpen !== false || state.iframeCount !== 1
        || redactedAddress(state.iframeSrc).pathname !== path) throw changed();
    const target = await boundedRead(frame, request);
    if (!target || !current()) throw changed();
    if (target.active === true) return false;
    const mapped = await boundedRead(top, { operation: "map-gallery-hover", pageUrl, framePoint: target.point, frameViewport: target.viewport });
    if (!current() || !click(webContents, mapped, signal)) throw changed();
    await waitFor(async () => {
      if (!current()) throw changed();
      const confirmed = await boundedRead(frame, request);
      return current() && confirmed?.active === true;
    }, "Der leere Squarespace-Textblock wurde nicht eindeutig zur Eingabe geöffnet.", signal);
    return true;
  }
  async function openBoundPageCode(webContents, { pageUrl, pageId, path, blockId, sectionId, module, expectedMapCode, signal }) {
    const top = mainFrame(webContents), frame = previewFrame(webContents, pageUrl);
    const current = () => mainFrame(webContents) === top && previewFrame(webContents, pageUrl) === frame;
    const state = await previewState(webContents, true);
    if (!frame || frame.parent !== top || state?.mode !== "editing" || state.dialogOpen !== false || state.iframeCount !== 1
        || redactedAddress(state.iframeSrc).pathname !== path) return null;
    const block = { pageUrl, pageId, blockId, sectionId };
    const selected = () => boundedRead(frame, { ...block, operation: "code-block-selected" });
    if (await selected() !== true) {
      const source = await boundedRead(frame, { ...block, operation: "code-block-point" });
      if (!source || !current()) return null;
      const mapped = await boundedRead(top, { operation: "map-gallery-hover", pageUrl, framePoint: source.point, frameViewport: source.viewport });
      if (!current() || !click(webContents, mapped, signal)) return null;
    }
    const edit = await waitFor(async () => {
      if (!current()) throw failure("Die Squarespace-Vorschau wurde während der Codeprüfung gewechselt.");
      if (await selected() !== true) return null;
      const readEdit = () => boundedRead(top, { operation: "code-block-edit", pageUrl });
      const first = nativePoint(webContents, await readEdit());
      if (!first || await selected() !== true || !current()) return null;
      const target = await readEdit();
      return isDeepStrictEqual(nativePoint(webContents, target), first) && await selected() === true && current() ? target : null;
    }, "Der zugehörige Squarespace-Codeblock lässt sich nicht eindeutig öffnen.", signal);
    if (!click(webContents, edit, signal)) return null;
    const readSource = { view: "code", expectedBlockId: blockId, expectedModule: module, expectedPageId: pageId, expectedPath: path, expectedMapCode, signal };
    const codeEditor = await waitFor(async () => {
      if (!current()) throw failure("Die Squarespace-Vorschau wurde während der Codeprüfung gewechselt.");
      const observation = await readSquarespacePageObservation(webContents, readSource);
      if (observation.reasonCodes.includes("code-source-mismatch")) {
        throw failure(module === "empty" ? "Der Squarespace-Codeblock enthält bereits Inhalt." : "Das Squarespace-Codefeld weicht von der freigegebenen Vorlage ab.");
      }
      return observation.codeEditor;
    }, "Das Squarespace-Codefeld konnte nicht eindeutig gelesen werden.", signal);
    return { current, selected, top, modalId: codeEditor.modalId };
  }
  async function focusBoundCode(session, pageUrl, operation) {
    return session.current() && await session.selected() === true && session.current()
      && await boundedRead(session.top, { operation, pageUrl, modalId: session.modalId, defaultCode: SQUARESPACE_DEFAULT_CODE }) === true && session.current();
  }
  async function closeBoundPageCode(webContents, session, { pageUrl, path, saveDisabled, signal }) {
    if (!await focusBoundCode(session, pageUrl, "code-dialog-focus")) return false;
    stopIfAborted(signal);
    webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
    webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
    await waitFor(async () => {
      if (!session.current()) return null;
      const state = await previewState(webContents, true);
      return state?.mode === "editing" && state.dialogOpen === false && state.iframeCount === 1
        && state.saveDisabled === saveDisabled && redactedAddress(state.iframeSrc).pathname === path;
    }, "Der Squarespace-Codeeditor wurde nicht eindeutig geschlossen.", signal);
    return true;
  }
  async function readPageCode(webContents, { pageUrl, pageId, path, contentOrder, saveDisabled, mapStep, signal }) {
    const confirmed = [];
    for (const { kind, id } of contentOrder.filter(block => ["species", "map"].includes(block.kind))) {
      const expectedMapCode = kind === "map" && mapStep?.mapElements ? mapStep.code : undefined;
      const session = await openBoundPageCode(webContents, { pageUrl, pageId, path, blockId: id, module: kind, expectedMapCode, signal });
      if (!session || !await closeBoundPageCode(webContents, session, { pageUrl, path, saveDisabled, signal })) return null;
      confirmed.push({ kind, cmsBlockId: id, ...(expectedMapCode && { sourceHash: createHash("sha256").update(expectedMapCode).digest("hex") }) });
    }
    return confirmed;
  }
  async function openNewFluidCodePlaceholder(webContents, { pageUrl, scope, entry, currentProof, assertWritable, signal }) {
    const changed = () => Object.assign(failure("Der Standardtext des neu angelegten Squarespace-Codeblocks ist nicht eindeutig bestätigt."),
      { code: "SQUARESPACE_CODE_PLACEHOLDER_UNCONFIRMED", stage: "prepare-code-replacement", codeBlockId: scope.blockId });
    const session = await openBoundPageCode(webContents, { pageUrl, ...scope, sectionId: entry.sectionId, module: "default-placeholder", signal });
    if (!session || !currentProof() || await assertWritable(scope) !== true
        || !await focusBoundCode(session, pageUrl, "code-dialog-focus-default") || !currentProof() || entry.stage !== "prepared-default") throw changed();
    stopIfAborted(signal);
    entry.stage = "replacement-started";
    webContents.sendInputEvent({ type: "keyDown", keyCode: "A", modifiers: ["control"] });
    webContents.sendInputEvent({ type: "keyUp", keyCode: "A", modifiers: ["control"] });
    await waitFor(async () => currentProof() && await focusBoundCode(session, pageUrl, "code-dialog-default-selected"),
      "Der Standardtext des Squarespace-Codeblocks ist nicht vollständig markiert.", signal);
    if (!currentProof() || await assertWritable(scope) !== true
        || !await focusBoundCode(session, pageUrl, "code-dialog-default-selected") || !currentProof()) throw changed();
    stopIfAborted(signal);
    webContents.sendInputEvent({ type: "keyDown", keyCode: "Backspace" });
    webContents.sendInputEvent({ type: "keyUp", keyCode: "Backspace" });
    await waitFor(async () => {
      if (!session.current() || !currentProof()) throw changed();
      const observation = await readSquarespacePageObservation(webContents, { view: "code", expectedPageId: scope.pageId,
        expectedPath: scope.path, expectedBlockId: scope.blockId, expectedModule: "empty", signal });
      return observation.codeEditor?.modalId === session.modalId && observation.codeEditor.status === "empty";
    }, "Der geleerte Squarespace-Codeblock ist im HTML-Editor nicht bestätigt.", signal);
    // Keep the empty field open. Closing it here can leave Squarespace's default markup in the preview.
    return session;
  }
  async function openWritablePageCode(webContents, { pageUrl, scope, disabledPage, expectedFluidSectionId, currentProof, assertWritable, changed, signal }) {
    stopIfAborted(signal);
    if (!currentProof() || typeof assertWritable !== "function" || typeof webContents.insertText !== "function"
        || await assertWritable(scope) !== true || !currentProof()) throw changed();
    const entry = appendedFluidBlocks.get(disabledPage)?.get(scope.blockId);
    if (entry && (entry.stage !== "prepared-default" || entry.kind !== "code" || entry.sectionId !== expectedFluidSectionId)) throw changed();
    const session = entry
      ? await openNewFluidCodePlaceholder(webContents, { pageUrl, scope, entry, currentProof, assertWritable, signal })
      : await openBoundPageCode(webContents, { pageUrl, ...scope, module: "empty", signal });
    if (!session || !currentProof() || await assertWritable(scope) !== true
        || !await focusBoundCode(session, pageUrl, "code-dialog-focus-empty") || !currentProof()) throw changed();
    stopIfAborted(signal);
    return session;
  }
  async function insertPageModule(webContents, plan, { pageId, blockId, kind, dispatchBinding, disabledPage, expectedFluidSectionId, assertWritable, signal }) {
    const dispatch = validateCmsDispatchBinding(dispatchBinding, { planHash: plan.planHash, targetPath: plan.target.path });
    const path = dispatch.targetPath, pageUrl = new URL(path, "https://www.fnwildlifetravel.de").href;
    const steps = createCmsContentSteps(plan);
    const scope = { pageId, path, blockId };
    const currentProof = () => isCurrentSquarespaceDisabledPage(disabledPage, webContents, pageId, dispatch, { expectedTitle: plan.structure.title });
    const changed = () => Object.assign(failure("Die deaktivierte Seite oder das leere FN-Funktionsfeld konnte nicht eindeutig bestätigt werden."),
      { code: "SQUARESPACE_PAGE_MODULE_TARGET_CHANGED" });
    const uncertain = () => Object.assign(failure("Der eingefügte FN-Funktionsblock konnte nicht eindeutig bestätigt werden. Bitte den offenen Entwurf prüfen."),
      { code: "SQUARESPACE_PAGE_MODULE_INPUT_UNCONFIRMED" });
    if (kind !== "species" && kind !== "map") throw changed();
    const step = steps.find(item => item.kind === kind);
    if (!step || typeof blockId !== "string" || !/^block-(?:[a-f0-9]{20}|[a-f0-9]{24}|yui_3_17_2_1_[0-9]{13}_[0-9]{1,12})$/.test(blockId)) throw changed();
    const readOptions = { expectedPageId: pageId, expectedPath: path, signal };
    if (!currentProof()) throw changed();
    const before = await readSquarespacePageObservation(webContents, readOptions);
    if (before.page.id !== pageId || before.page.path !== path || before.modalOpen !== false
        || before.contentOrder.some(block => block.kind === kind)) throw changed();
    const session = await openWritablePageCode(webContents, { pageUrl, scope, disabledPage, expectedFluidSectionId, currentProof, assertWritable, changed, signal });
    if (!session.current() || !currentProof()) throw changed();
    try {
      stopIfAborted(signal);
      await webContents.insertText(step.code);
      const readSource = { ...readOptions, view: "code", expectedBlockId: blockId, expectedModule: kind,
        ...(step.mapElements && { expectedMapCode: step.code }) };
      await waitFor(async () => {
        if (!session.current() || !currentProof()) throw uncertain();
        const observation = await readSquarespacePageObservation(webContents, readSource);
        return observation.codeEditor?.modalId === session.modalId && observation.codeEditor.status === "source-matched";
      }, "Das Squarespace-Funktionsfeld bestätigt den eingefügten Code noch nicht.", signal);
      if (!currentProof() || !await closeBoundPageCode(webContents, session, { pageUrl, path, saveDisabled: false, signal })) throw uncertain();
      return await waitFor(async () => {
        if (!session.current() || !currentProof()) throw uncertain();
        const observation = await readSquarespacePageObservation(webContents, readOptions);
        if (observation.page.id !== pageId || observation.page.path !== path || observation.modalOpen !== false) return null;
        const modules = observation.contentOrder.filter(block => block.kind === kind);
        return modules.length === 1 && modules[0].id === blockId && isDeepStrictEqual(modules[0].mapElements, step.mapElements)
          ? { kind, cmsBlockId: blockId } : null;
      }, "Die Squarespace-Vorschau bestätigt den FN-Funktionsblock noch nicht.", signal);
    } catch (error) { stopIfAborted(signal); throw error?.code === "SQUARESPACE_PAGE_MODULE_INPUT_UNCONFIRMED" ? error : uncertain(); }
  }
  async function insertPageGallery(webContents, plan, { pageId, dispatchBinding, disabledPage, expectedFluidSectionId, galleryUpload, assertWritable, signal }) {
    const dispatch = validateCmsDispatchBinding(dispatchBinding, { planHash: plan.planHash, targetPath: plan.target.path });
    const path = dispatch.targetPath, pageUrl = new URL(path, "https://www.fnwildlifetravel.de").href;
    createCmsContentSteps(plan);
    const gallery = prepareSquarespaceFigureGallery(plan.structure.slots.find(slot => slot.type === "gallery").items, galleryUpload);
    const readGallery = createSquarespaceGalleryReadback(plan.structure.slots, galleryUpload);
    const scope = { pageId, path, blockId: gallery.blockId };
    const currentProof = () => isCurrentSquarespaceDisabledPage(disabledPage, webContents, pageId, dispatch, { expectedTitle: plan.structure.title });
    const changed = () => Object.assign(failure("Die deaktivierte Seite oder ihr leeres Squarespace-Galeriefeld konnte nicht eindeutig bestätigt werden."),
      { code: "SQUARESPACE_PAGE_GALLERY_TARGET_CHANGED" });
    const uncertain = () => Object.assign(failure("Die Galerieeingabe konnte in der Vorschau nicht eindeutig bestätigt werden. Bitte den offenen Entwurf prüfen."),
      { code: "SQUARESPACE_PAGE_GALLERY_INPUT_UNCONFIRMED" });
    const session = await openWritablePageCode(webContents, { pageUrl, scope, disabledPage, expectedFluidSectionId, currentProof, assertWritable, changed, signal });
    if (!session.current() || !currentProof()) throw changed();
    try {
      stopIfAborted(signal);
      await webContents.insertText(gallery.html);
      if (!await closeBoundPageCode(webContents, session, { pageUrl, path, saveDisabled: false, signal })) throw uncertain();
      return await waitFor(async () => {
        if (!session.current() || !currentProof()) throw uncertain();
        const observation = await readSquarespacePageObservation(webContents, { expectedPageId: pageId, expectedPath: path, signal });
        return observation.page.id === pageId && observation.page.path === path && observation.modalOpen === false ? readGallery(observation) : null;
      }, "Die Squarespace-Vorschau bestätigt die freigegebene Galerie noch nicht vollständig.", signal);
    } catch (error) { stopIfAborted(signal); throw error?.code === "SQUARESPACE_PAGE_GALLERY_INPUT_UNCONFIRMED" ? error : uncertain(); }
  }
  async function fillPreparedPageContent(webContents, plan, { pageId, dispatchBinding, disabledPage, galleryUpload, libraryBindings, readMedia,
    uploadImage, openUploadGallery, uploadLibraryImage, appendEmptyBlock, expectedFluidSectionId, afterFluidSectionId, assertWritable, reconfirmDisabled,
    rememberSaveBinding, signal }) {
    plan = structuredClone(plan);
    galleryUpload = structuredClone(galleryUpload);
    libraryBindings = structuredClone(libraryBindings);
    const dispatch = validateCmsDispatchBinding(dispatchBinding, { planHash: plan.planHash, targetPath: plan.target.path });
    const path = dispatch.targetPath, scope = { pageId, path };
    let stage = "initial-layout";
    const changed = (layoutReasons = []) => Object.assign(failure("Die vorbereiteten Editorblöcke stimmen nicht eindeutig mit dem freigegebenen Seitenplan überein."),
      { code: "SQUARESPACE_PAGE_LAYOUT_CHANGED", stage, layoutReasons });
    const contentSteps = createCmsContentSteps(plan);
    const galleryItems = plan.structure.slots.find(slot => slot.type === "gallery").items;
    const steps = contentSteps.filter(step => step.kind !== "gallery" || galleryItems.length > 0);
    const preparedLibrary = libraryBindings !== undefined;
    const needsUpload = galleryItems.length > 0 && galleryUpload === undefined && !preparedLibrary;
    if (preparedLibrary && (!galleryItems.length || galleryUpload !== undefined || !Array.isArray(libraryBindings)
        || libraryBindings.length !== galleryItems.length || [uploadImage, openUploadGallery, uploadLibraryImage].some(upload => upload !== undefined))) throw changed();
    if (needsUpload) {
      if (typeof readMedia !== "function"
          || [uploadImage, openUploadGallery, uploadLibraryImage].filter(upload => typeof upload === "function").length !== 1) throw changed();
      if (typeof openUploadGallery === "function") {
        uploadImage = async upload => {
          await upload.assertCurrent();
          const closeUploadGallery = await openUploadGallery({ pageId, path, assertCurrent: upload.assertCurrent, signal });
          if (typeof closeUploadGallery !== "function") throw changed();
          await submitSquarespaceGalleryFile(webContents, { ...upload, path, waitFor });
          await upload.assertCurrent();
          await closeUploadGallery();
        };
      }
    } else if (!preparedLibrary) {
      if (galleryItems.length && galleryUpload?.layout !== "figures") throw changed();
      createSquarespaceGalleryReadback(plan.structure.slots, galleryUpload);
    }
    const currentProof = () => isCurrentSquarespaceDisabledPage(disabledPage, webContents, pageId, dispatch, { expectedTitle: plan.structure.title });
    if (typeof assertWritable !== "function" || typeof reconfirmDisabled !== "function") throw changed();
    const assertCurrent = async () => {
      stopIfAborted(signal);
      if (!currentProof() || await assertWritable(scope) !== true || !currentProof()) throw changed();
      stopIfAborted(signal);
    };
    await assertCurrent();
    let waitingLayoutReasons = [];
    async function readLayout({ afterInsertion = false } = {}) {
      stopIfAborted(signal);
      const observation = await readSquarespacePageObservation(webContents, { view: "editor-layout", expectedPageId: pageId, expectedPath: path,
        expectedFluidSectionId, signal });
      if (!currentProof()) throw changed();
      const reasons = observation.reasonCodes;
      if (afterInsertion && expectedFluidSectionId !== undefined && reasons.length === 1
          && ["preview-observation-changed", "fluid-visual-order-unqualified", "editor-layout-unqualified"].includes(reasons[0])) {
        waitingLayoutReasons = reasons;
        return null;
      }
      if (observation.page.id !== pageId || observation.page.path !== path || observation.modalOpen !== false
          || !Array.isArray(observation.editorBlocks) || expectedFluidSectionId !== undefined
          && !isDeepStrictEqual(observation.fluidVisualOrder, observation.editorBlocks.map(block => block.id))) throw changed(reasons);
      waitingLayoutReasons = [];
      return observation.editorBlocks;
    }
    async function waitForInsertedLayout(observe) {
      const message = "Der neu angelegte Squarespace-Block ist noch nicht eindeutig bestätigt. Bitte den offenen Entwurf prüfen.";
      try {
        return await waitFor(observe, message, signal);
      } catch (error) {
        stopIfAborted(signal);
        if (!error?.code && waitingLayoutReasons.length) throw changed(waitingLayoutReasons);
        throw error;
      }
    }
    let layout = await readLayout();
    if (afterFluidSectionId !== undefined) {
      if (layout.length || expectedFluidSectionId !== undefined || appendEmptyBlock !== undefined || galleryUpload) throw changed();
      await observeSquarespacePublicTarget(path, { fetchImpl: fetchPublicTarget, signal });
      await assertCurrent();
      if ((await readLayout()).length) throw changed();
      const draftOptions = { pageId, dispatchBinding: dispatch, disabledPage, assertWritable, signal };
      const { sectionId } = await createBlankFluidSection(webContents, plan, { ...draftOptions, afterSectionId: afterFluidSectionId });
      expectedFluidSectionId = sectionId;
      stage = "confirm-new-section";
      if ((await readLayout()).length) throw changed();
      appendEmptyBlock = async ({ kind }) => {
        const { blockId } = await appendFluidEditorBlock(webContents, plan, { ...draftOptions, sectionId, kind });
        await placeFluidEditorBlock(webContents, plan, { ...draftOptions, sectionId, blockId });
        return { blockId };
      };
    }
    if (appendEmptyBlock !== undefined) {
      // Squarespace can provide one empty text placeholder on a new page.
      // Every other pre-existing layout needs its own explicit qualification.
      const initialText = layout.length === 1 && layout[0].kind === "text"
        && layout[0].empty === true && steps[0]?.kind === "text";
      if (typeof appendEmptyBlock !== "function" || layout.length !== 0 && !initialText || galleryUpload) throw changed();
      for (const step of steps.slice(layout.length)) {
        const kind = step.kind === "text" ? "text" : "code";
        stage = "before-append";
        await assertCurrent();
        if (!isDeepStrictEqual(await readLayout(), layout)) throw changed();
        const appended = await appendEmptyBlock({ ...scope, kind, afterBlockId: layout.at(-1)?.id ?? null, assertCurrent, signal });
        stage = kind === "text" ? "confirm-new-text-block" : "confirm-new-code-block";
        layout = await waitForInsertedLayout(async () => {
          await assertCurrent();
          const updated = await readLayout({ afterInsertion: true });
          if (!updated || isDeepStrictEqual(updated, layout)) return null;
          const added = updated.at(-1);
          if (updated.length !== layout.length + 1 || !isDeepStrictEqual(updated.slice(0, -1), layout)
              || added.kind !== kind || layout.some(block => block.id === added.id)
              || afterFluidSectionId !== undefined && added.id !== appended?.blockId) throw changed();
          const created = appendedFluidBlocks.get(disabledPage), entry = created?.get(added.id);
          if (added.empty === true) {
            if (afterFluidSectionId !== undefined) created?.delete(added.id);
          } else {
            if (kind !== "code" || afterFluidSectionId === undefined || added.defaultPlaceholder !== true
                || entry?.stage !== "positioned" || entry.sectionId !== expectedFluidSectionId || entry.kind !== kind) throw changed();
            entry.stage = "prepared-default";
          }
          return updated;
        });
      }
    }
    stage = "prepared-layout";
    const preparedCode = appendedFluidBlocks.get(disabledPage);
    const isPreparedBlock = block => block.empty === true || afterFluidSectionId !== undefined && block.defaultPlaceholder === true
      && preparedCode?.get(block.id)?.stage === "prepared-default";
    if (layout.length !== steps.length || layout.some((block, index) => !isPreparedBlock(block)
        || block.kind !== (steps[index].kind === "text" ? "text" : "code")
        || steps[index].kind === "gallery" && galleryUpload && block.id !== galleryUpload.blockId)
        || new Set(layout.map(block => block.id)).size !== layout.length) throw changed();
    if (preparedLibrary) {
      const blockId = layout[steps.findIndex(step => step.kind === "gallery")].id;
      galleryUpload = { layout: "figures", blockId, mediaBindings: libraryBindings };
      createSquarespaceGalleryReadback(plan.structure.slots, galleryUpload);
    } else if (needsUpload) {
      const blockId = layout[steps.findIndex(step => step.kind === "gallery")].id;
      const assertLayout = async () => {
        await assertCurrent();
        if (!isDeepStrictEqual(await readLayout(), layout)) throw changed();
      };
      galleryUpload = typeof uploadLibraryImage === "function"
        ? { layout: "figures", blockId, mediaBindings: await uploadSquarespaceLibraryImages(galleryItems,
          { readMedia, uploadLibraryImage, assertDraft: assertLayout, signal }) }
        : await uploadSquarespaceFigureGallery(galleryItems, { blockId, readMedia, uploadImage, assertCurrent, assertLayout, signal,
          readGallery: async ({ modalId, allowEmpty }) => {
            const observation = await readSquarespacePageObservation(webContents, { expectedPageId: pageId, expectedPath: path, signal });
            const { galleryEditor } = observation;
            if (!currentProof() || observation.modalOpen !== true || modalId && galleryEditor.modalId !== modalId) return null;
            if (galleryEditor.orderObserved === true) return galleryEditor.items;
            // Zero rendered rows are an upload baseline only in the same qualified native file dialog.
            return allowEmpty && galleryEditor.renderedRowsEmpty === true ? [] : null;
          } });
      createSquarespaceGalleryReadback(plan.structure.slots, galleryUpload);
    }
    const options = { pageId, dispatchBinding: dispatch, disabledPage, expectedFluidSectionId, galleryUpload, assertWritable,
      reconfirmDisabled, rememberSaveBinding, signal };
    for (const [index, step] of steps.entries()) {
      stage = "write-prepared-content";
      const expected = layout.map((block, position) => position >= index ? block : { kind: block.kind, id: block.id, empty: false });
      if (!isDeepStrictEqual(await readLayout(), expected)) throw changed();
      const blockId = layout[index].id;
      if (step.kind === "text") {
        const activated = await activateEmptyPageText(webContents, { ...scope, blockId, assertCurrent, changed, signal });
        if (activated && !isDeepStrictEqual(await readLayout(), expected)) throw changed();
        await insertSquarespacePageText(webContents, { ...options, blockId, step });
      }
      else if (step.kind === "gallery") await insertPageGallery(webContents, plan, options);
      else await insertPageModule(webContents, plan, { ...options, blockId, kind: step.kind });
    }
    const saved = await saveAndReopenPageContent(webContents, plan, { ...options, expectedBlockIds: layout.map(block => block.id),
      verifyPublicDraft: afterFluidSectionId !== undefined });
    return needsUpload || preparedLibrary ? { ...saved, mediaBindings: galleryUpload.mediaBindings.map(({ sourceUrl, ...binding }) => binding) } : saved;
  }
  async function saveAndReopenPageContent(webContents, plan, { pageId, dispatchBinding, disabledPage, galleryUpload, assertWritable, reconfirmDisabled,
    expectedBlockIds, expectedFluidSectionId, rememberSaveBinding, verifyPublicDraft = false, signal }) {
    const dispatch = validateCmsDispatchBinding(dispatchBinding, { planHash: plan.planHash, targetPath: plan.target.path });
    const title = plan.structure.title, pageUrl = new URL(dispatch.targetPath, "https://www.fnwildlifetravel.de").href;
    const scope = { pageId, path: dispatch.targetPath };
    const { readContent, readCode, matchesEditor } = bindPageContentReadback(webContents, plan,
      { ...scope, pageUrl, expectedBlockIds, expectedFluidSectionId, galleryUpload, signal });
    let stage = "check-content-before-save";
    const targetChanged = () => Object.assign(failure("Squarespace-Seite, Inhalt oder Freigabe stimmen vor dem Speichern nicht eindeutig überein."),
      { code: "SQUARESPACE_PAGE_SAVE_TARGET_CHANGED", stage });
    const uncertain = () => Object.assign(failure("Speichern und Wiederöffnen konnten nicht vollständig bestätigt werden. Bitte den Entwurf in Squarespace prüfen."),
      { code: "SQUARESPACE_PAGE_SAVE_UNCONFIRMED", stage });
    const settingsCurrent = (proof, issuedAfter) => isCurrentSquarespaceDisabledPage(proof, webContents, pageId, dispatch, { expectedTitle: title, issuedAfter });
    if (!settingsCurrent(disabledPage) || typeof assertWritable !== "function" || typeof reconfirmDisabled !== "function") throw targetChanged();
    const top = mainFrame(webContents), frame = previewFrame(webContents, pageUrl);
    if (!frame || frame.parent !== top || await assertWritable(scope) !== true) throw targetChanged();
    const before = await readContent(), epoch = await boundedRead(top, { operation: "document-epoch" });
    const state = await previewState(webContents, true);
    if (!before || !Number.isFinite(epoch) || !matchesEditor(state, false)) throw targetChanged();
    if (verifyPublicDraft) {
      stage = "check-public-access-before-save";
      try { await observeSquarespacePublicTarget(dispatch.targetPath, { fetchImpl: fetchPublicTarget, signal }); }
      catch {
        stopIfAborted(signal);
        throw Object.assign(failure("Die öffentliche Nichterreichbarkeit des Entwurfs konnte vor dem Speichern nicht bestätigt werden."),
          { code: "SQUARESPACE_PAGE_SAVE_PUBLIC_CHECK_UNCONFIRMED", stage });
      }
      if (await boundedRead(top, { operation: "document-epoch" }) !== epoch || !settingsCurrent(disabledPage)
          || previewFrame(webContents, pageUrl) !== frame) throw targetChanged();
    }
    stage = "check-code-before-save";
    let beforeCode;
    try { beforeCode = await readCode(before, false); }
    catch (error) { stopIfAborted(signal); throw targetChanged(); }
    if (!beforeCode || await assertWritable(scope) !== true || !isDeepStrictEqual(await readContent(), before)) throw targetChanged();
    if (rememberSaveBinding !== undefined) {
      stage = "record-save-binding";
      const binding = { schemaVersion: 1, attemptId: dispatch.attemptId, dispatchId: dispatch.dispatchId, planHash: dispatch.planHash,
        pageId, path: scope.path, sectionId: expectedFluidSectionId ?? null, blockIds: before.contentOrder.map(block => block.id),
        mediaBindings: galleryUpload?.mediaBindings.map(({ sourceUrl, ...image }) => image) ?? [] };
      let recorded;
      try { recorded = await rememberSaveBinding(binding); }
      catch { stopIfAborted(signal); }
      if (recorded !== true) {
        throw Object.assign(failure("Die Zuordnung des Entwurfs konnte vor dem Speichern nicht im Auftrag festgehalten werden."),
          { code: "SQUARESPACE_PAGE_SAVE_BINDING_UNCONFIRMED", stage });
      }
      if (!isDeepStrictEqual(await readContent(), before) || !matchesEditor(await previewState(webContents, true), false)) throw targetChanged();
    }
    stage = "send-save";
    const save = await boundedRead(top, { operation: "save-page", pageUrl, allowBlockEdit: true });
    if (!save || await assertWritable(scope) !== true
        || mainFrame(webContents) !== top || await boundedRead(top, { operation: "document-epoch" }) !== epoch
        || !settingsCurrent(disabledPage) || previewFrame(webContents, pageUrl) !== frame
        || !click(webContents, save, signal)) throw targetChanged();
    try {
      stage = "confirm-save";
      await waitFor(async () => matchesEditor(await previewState(webContents, true), true),
        "Der Abschluss des Squarespace-Speichervorgangs bleibt offen.", signal);
      stage = "exit-saved-editor";
      await exitSavedPage(webContents, pageUrl, signal, true);
      stage = "reload-page-administration";
      await navigate(webContents, `${ADMIN}/config/pages`, signal);
      const freshEpoch = await boundedRead(mainFrame(webContents), { operation: "document-epoch" });
      if (!Number.isFinite(freshEpoch) || freshEpoch <= epoch) throw uncertain();
      stage = "reopen-saved-editor";
      await openPage(webContents, { pageUrl, pageTitle: title }, signal, { allowUnloadedPreview: true });
      stage = "compare-reopened-content";
      const reopened = await readContent(Math.min(timeoutMs, 30_000));
      if (!isDeepStrictEqual(reopened, before)) throw uncertain();
      stage = "compare-reopened-code";
      const reopenedCode = await readCode(reopened, true);
      if (!isDeepStrictEqual(reopenedCode, beforeCode) || !isDeepStrictEqual(await readContent(), reopened)) throw uncertain();
      stage = "reconfirm-disabled-page";
      await exitSavedPage(webContents, pageUrl, signal, true);
      const reconfirmStarted = performance.now();
      const freshSettings = await reconfirmDisabled({ ...scope, expectedTitle: title });
      stopIfAborted(signal);
      if (freshSettings === disabledPage || !settingsCurrent(freshSettings, reconfirmStarted)) throw uncertain();
      if (verifyPublicDraft) {
        stage = "check-public-access-after-save";
        const settingsTop = mainFrame(webContents);
        const settingsEpoch = await boundedRead(settingsTop, { operation: "document-epoch" });
        if (!Number.isFinite(settingsEpoch)) throw uncertain();
        await observeSquarespacePublicTarget(dispatch.targetPath, { fetchImpl: fetchPublicTarget, signal });
        if (await boundedRead(settingsTop, { operation: "document-epoch" }) !== settingsEpoch
            || !settingsCurrent(freshSettings, reconfirmStarted)) throw uncertain();
      }
      const settings = assignedDraftSettings.get(freshSettings)?.settings;
      return { pageId, path: dispatch.targetPath, ...reopened, codeBlocks: reopenedCode,
        ...(settings && { settings: { ...settings } }), savedTextConfirmed: true, reopened: true, disabledConfirmed: true };
    } catch (error) {
      stopIfAborted(signal);
      throw error?.code === "SQUARESPACE_PAGE_SAVE_UNCONFIRMED" ? error : uncertain();
    }
  }
  function bindPageContentReadback(webContents, plan, { pageId, path, pageUrl, expectedBlockIds, expectedFluidSectionId,
    galleryUpload, savedMediaBindings, signal }) {
    const steps = createCmsContentSteps(plan);
    const expected = steps.filter(step => step.kind === "text").map(step => cmsTextStepElements(step, { targetPath: path, planHash: plan.planHash }));
    const mapStep = steps.find(step => step.kind === "map");
    const galleryIndex = steps.findIndex(step => step.kind === "gallery");
    const hasGallery = plan.structure.slots[steps[galleryIndex].slotIndex].items.length > 0;
    const expectedOrder = steps.map(step => step.kind).filter(kind => kind !== "gallery" || hasGallery);
    const galleryReadback = savedMediaBindings === undefined ? createSquarespaceGalleryReadback(plan.structure.slots, galleryUpload)
      : createSquarespaceBoundGalleryReadback(plan.structure.slots, { blockId: expectedBlockIds[galleryIndex], mediaBindings: savedMediaBindings });
    const options = { expectedPageId: pageId, expectedPath: path, expectedFluidSectionId, signal };
    async function readContent(waitForContentMs = 0) {
      const observation = await readSquarespacePageObservation(webContents, { ...options, waitForContentMs });
      const blockIds = observation.contentOrder.map(block => block.id);
      if (observation.page.id !== pageId || observation.page.path !== path || observation.modalOpen !== false
          || observation.reasonCodes.length || !isDeepStrictEqual(observation.contentOrder.map(block => block.kind), expectedOrder)
          || expectedBlockIds && !isDeepStrictEqual(blockIds, expectedBlockIds)
          || expectedFluidSectionId !== undefined && !isDeepStrictEqual(observation.fluidVisualOrder, blockIds)
          || !isDeepStrictEqual(observation.contentOrder.find(block => block.kind === "map")?.mapElements, mapStep.mapElements)
          || !isDeepStrictEqual(observation.textBlocks.map(block => block.blocks), expected)) return null;
      const gallery = galleryReadback(observation);
      return gallery && { gallery, contentOrder: observation.contentOrder,
        textBlocks: observation.textBlocks.map(({ cmsBlockId, blocks }) => ({ cmsBlockId, blocks })) };
    }
    function matchesEditor(state, saveDisabled) {
      return state?.mode === "editing" && state.dialogOpen === false && state.iframeCount === 1 && state.saveDisabled === saveDisabled
        && redactedAddress(state.iframeSrc).pathname === path;
    }
    const readCode = (content, saveDisabled) => readPageCode(webContents,
      { pageUrl, pageId, path, contentOrder: content.contentOrder, saveDisabled, mapStep, signal });
    return { readContent, readCode, matchesEditor };
  }

  async function recheckUnpublishedPage(webContents, plan, { saveBinding, assertCurrent, signal } = {}) {
    const descriptors = saveBinding && typeof saveBinding === "object" && !isProxy(saveBinding)
      ? Object.getOwnPropertyDescriptors(saveBinding) : null;
    const binding = validateCmsSaveBinding(saveBinding, { plan, attempt: { id: descriptors?.attemptId?.value, dispatchId: descriptors?.dispatchId?.value } });
    const { pageId, path, sectionId, blockIds, mediaBindings } = binding;
    const title = plan.structure.title, pageUrl = new URL(path, "https://www.fnwildlifetravel.de").href;
    const top = mainFrame(webContents);
    let stage = "open-bound-editor";
    const unconfirmed = () => Object.assign(failure("Der gespeicherte Squarespace-Entwurf konnte nicht eindeutig bestätigt werden."),
      { code: "SQUARESPACE_PAGE_RECHECK_UNCONFIRMED", stage });
    const samePage = () => isBoundCollectionFrame(webContents, top, previewFrame(webContents, pageUrl), pageUrl, pageId);
    async function authorize() {
      stopIfAborted(signal);
      if (typeof assertCurrent !== "function" || await assertCurrent() === false || webContents.getURL() !== `${ADMIN}/config/pages`
          || mainFrame(webContents) !== top) throw unconfirmed();
      stopIfAborted(signal);
    }
    try {
      await authorize();
      const epoch = await boundedRead(top, { operation: "document-epoch" });
      if (!Number.isFinite(epoch) || epoch <= 0) throw unconfirmed();
      const { readContent, readCode, matchesEditor } = bindPageContentReadback(webContents, plan, { pageId, path, pageUrl,
        expectedBlockIds: blockIds, expectedFluidSectionId: sectionId ?? undefined, savedMediaBindings: mediaBindings, signal });
      const frame = await openPage(webContents, { pageUrl, pageTitle: title }, signal, { boundPageId: pageId, allowUnloadedPreview: true });
      const cleanEditor = async () => matchesEditor(await previewState(webContents, true), true)
        && await isBoundCollectionFrame(webContents, top, frame, pageUrl, pageId);
      if (!await cleanEditor()) throw unconfirmed();
      stage = "compare-saved-content";
      const content = await readContent(Math.min(timeoutMs, 30_000));
      if (!content || !await cleanEditor()) throw unconfirmed();
      stage = "compare-saved-code";
      await authorize();
      const codeBlocks = await readCode(content, true);
      if (!codeBlocks || !await cleanEditor() || !isDeepStrictEqual(await readContent(), content)) throw unconfirmed();
      stage = "recheck-disabled-page";
      await authorize();
      await exitSavedPage(webContents, pageUrl, signal, true, pageId);
      if (!await openBoundDraftSettings(webContents, { top, pageUrl, title, samePage, authorize, signal,
        message: "Die Einstellungen des gespeicherten Squarespace-Entwurfs sind nicht eindeutig erreichbar." })) throw unconfirmed();
      const readSettings = () => inspectIdentifiedDraftSettings(webContents, { path, title }, { signal, includeSettings: true });
      const observed = await waitFor(readSettings, "Die Einstellungen des gespeicherten Squarespace-Entwurfs sind nicht eindeutig lesbar.", signal);
      if (observed.pageId !== pageId || observed.settings.enabled !== false) throw unconfirmed();
      stage = "recheck-public-access";
      await observeSquarespacePublicTarget(path, { fetchImpl: fetchPublicTarget, signal });
      await authorize();
      if (await boundedRead(top, { operation: "document-epoch" }) !== epoch || !isDeepStrictEqual(await readSettings(), observed)) throw unconfirmed();
      return createSquarespacePageReadback(plan, { pageId, path, ...content, codeBlocks, mediaBindings, settings: observed.settings,
        observationId: randomUUID(), savedTextConfirmed: true, reopened: true, disabledConfirmed: true });
    } catch (error) {
      stopIfAborted(signal);
      throw error?.code === "SQUARESPACE_PAGE_RECHECK_UNCONFIRMED" ? error : unconfirmed();
    }
  }
  /** Continue only from the journal's identified neutral shell with its general settings open. */
  async function completeUnpublishedDraft(webContents, plan, { pageId, dispatchBinding, assertCurrent,
    checkTargetAvailable, readMedia, uploadLibraryImage, disabledInitialDraft, rememberSaveBinding, signal }) {
    const unavailable = () => Object.assign(failure("Die angelegte neutrale Squarespace-Seite oder der aktuelle Artseitenauftrag konnte nicht bestätigt werden."),
      { code: "SQUARESPACE_DRAFT_COMPLETION_UNCONFIRMED" });
    stopIfAborted(signal);
    plan = structuredClone(plan);
    const dispatch = validateCmsDispatchBinding(dispatchBinding, { planHash: plan.planHash, targetPath: plan.target.path });
    const steps = createCmsContentSteps(plan);
    const gallery = plan.structure.slots[steps.find(step => step.kind === "gallery").slotIndex];
    if ((pageId !== undefined && (typeof pageId !== "string" || !/^[a-f0-9]{24}$/.test(pageId)))
        || typeof assertCurrent !== "function" || typeof checkTargetAvailable !== "function"
        || gallery.items.length && (typeof readMedia !== "function" || typeof uploadLibraryImage !== "function")) throw unavailable();
    const initialProof = disabledNeutralDrafts.get(disabledInitialDraft);
    if (disabledInitialDraft !== undefined && (!initialProof || initialProof.sourcePath !== PERSISTED_BLANK_DRAFT.path
        || initialProof.webContents !== webContents || initialProof.top !== mainFrame(webContents)
        || !isDeepStrictEqual(initialProof.dispatch, dispatch))) throw unavailable();
    const neutral = initialProof
      ? await inspectIdentifiedDraftSettings(webContents, PERSISTED_BLANK_DRAFT, { signal })
      : await inspectNeutralDraft(webContents, dispatch, { signal });
    if (!neutral || pageId !== undefined && pageId !== neutral.pageId) throw unavailable();
    if (initialProof && initialProof.pageId !== neutral.pageId) throw unavailable();
    pageId = neutral.pageId;
    const scope = { pageId, path: dispatch.targetPath };
    const assertWritable = async target => {
      stopIfAborted(signal);
      if (target?.pageId !== pageId || target.path !== scope.path || await assertCurrent() === false) return false;
      stopIfAborted(signal);
      return true;
    };
    if (!await assertWritable(scope)) throw unavailable();
    const options = { pageId, dispatchBinding: dispatch, assertWritable, signal };
    const disabledNeutralDraft = disabledInitialDraft ?? await disableNeutralDraftSettings(webContents, plan, options);
    let disabledPage = await assignUnpublishedDraftSettings(webContents, plan, { ...options, disabledNeutralDraft, checkTargetAvailable });
    let libraryBindings;
    if (gallery.items.length) {
      // Keep the saved settings open through the slow media stage. Start the editor
      // with a fresh disabled proof after the last confirmed file.
      const draft = bindDraftSettings(webContents, plan, options);
      const state = assignedDraftSettings.get(disabledPage);
      const documentEpoch = () => boundedRead(draft.top, { operation: "document-epoch" });
      const epoch = await documentEpoch();
      if (!state || !Number.isFinite(epoch) || epoch <= 0) throw unavailable();
      const assertDraft = async () => {
        await draft.authorize(scope.path);
        if (!isDeepStrictEqual(await draft.read(scope.path), state.settings)
            || await documentEpoch() !== epoch || !await draft.samePage(scope.path)) {
          throw Object.assign(failure("Die gespeicherten Einstellungen des Artseitenentwurfs haben sich während der Bildübertragung geändert."),
            { code: "SQUARESPACE_ASSET_DRAFT_SETTINGS_CHANGED" });
        }
      };
      await assertDraft();
      try { await observeSquarespacePublicTarget(scope.path, { fetchImpl: fetchPublicTarget, signal }); }
      catch {
        stopIfAborted(signal);
        throw Object.assign(failure("Die öffentliche Nichterreichbarkeit des Entwurfs konnte vor dem Bildupload nicht bestätigt werden."),
          { code: "SQUARESPACE_ASSET_DRAFT_PUBLIC_CHECK_UNCONFIRMED" });
      }
      await assertDraft();
      libraryBindings = await uploadSquarespaceLibraryImages(gallery.items, { readMedia, assertDraft, signal,
        uploadLibraryImage: request => uploadLibraryImage({ ...request, pageId }) });
      disabledPage = await confirmSquarespaceDisabledPage(webContents,
        { pageId, expectedTitle: plan.structure.title, dispatchBinding: dispatch, signal });
      await assertDraft();
      assignedDraftSettings.set(disabledPage, state);
    }
    const assigned = { ...options, disabledPage };
    await openAssignedDraftEditor(webContents, plan, assigned);
    const saved = await fillPreparedPageContent(webContents, plan, { ...assigned, afterFluidSectionId: null, libraryBindings, rememberSaveBinding,
      reconfirmDisabled: () => reconfirmAssignedDraftSettings(webContents, plan, assigned),
    });
    if (!await assertWritable(scope)) throw unavailable();
    return createSquarespacePageReadback(plan, { ...saved, observationId: randomUUID(), mediaBindings: saved.mediaBindings ?? [] });
  }

  async function createUnpublishedPage(webContents, plan, options = {}) {
    const { dispatchBinding, assertCurrent, signal, contentSteps, checkTargetAvailable, readMedia, uploadLibraryImage, rememberSaveBinding } = options;
    stopIfAborted(signal);
    plan = structuredClone(plan);
    const path = cmsTargetPath(plan?.target?.path);
    const dispatch = validateCmsDispatchBinding(dispatchBinding, { planHash: plan.planHash, targetPath: path });
    const steps = createCmsContentSteps(plan);
    const gallery = plan.structure.slots[steps.find(step => step.kind === "gallery").slotIndex];
    if (plan.publish !== false || plan.structure.path !== path || !isDeepStrictEqual(contentSteps, steps)
        || typeof assertCurrent !== "function" || typeof checkTargetAvailable !== "function" || typeof rememberSaveBinding !== "function"
        || gallery.items.length && (typeof readMedia !== "function" || typeof uploadLibraryImage !== "function")) {
      throw Object.assign(failure("Der vollständige Auftrag für die unveröffentlichte Squarespace-Seite ist nicht bestätigt."),
        { code: "SQUARESPACE_EDITOR_NOT_READY" });
    }
    const draft = await createNeutralDraft(webContents, dispatch, { assertCurrent, signal });
    const disabledInitialDraft = disabledNeutralDrafts.has(draft) ? draft : undefined;
    return completeUnpublishedDraft(webContents, plan, { pageId: draft.pageId, dispatchBinding: dispatch, assertCurrent, disabledInitialDraft,
      checkTargetAvailable, readMedia, uploadLibraryImage, rememberSaveBinding, signal });
  }
  async function transfer(webContents, plan, { signal, assertCurrent } = {}) {
    const pageUrl = normalizeWebsitePageUrl(plan.pageUrl);
    if (!(await getStatus(webContents)).connected) throw failure("Bitte zuerst bei Squarespace anmelden.");
    if (typeof assertCurrent !== "function") throw failure("Die aktuelle Textfreigabe kann nicht geprüft werden.");
    if (plan.images.length && plan.images.every((image) => image.context === "content" && image.kind === "image" && image.textCoupled === false)) {
      const independent = createSquarespaceIndependentImageTransfer({ openPage, mainFrame, previewFrame, previewState,
        performPage: perform, click, hover, waitFor, exitSavedPage, inspectPreview });
      return independent.transfer(webContents, { ...plan, pageUrl }, { signal, assertCurrent });
    }
    const results = [];
    let frame = null, galleryOpen = false;
    let top = mainFrame(webContents);
    for (const image of plan.images) {
      stopIfAborted(signal);
      if (image.context !== "content" || image.kind !== "image" || !image.textCoupled) {
        results.push({ imageKey: image.imageKey, status: "unsupported",
          error: "Dieser Bildfeldtyp benötigt noch einen unterstützten Übernahmeweg; seine Freigabe bleibt offen." });
        continue;
      }
      await assertCurrent(image.imageKey, image.approvalRevision);
      let stage = "page", access = "frame";
      try {
        if (!frame) {
          frame = await openPage(webContents, { ...plan, pageUrl }, signal);
          top = mainFrame(webContents);
        }
        if (!galleryOpen) {
          stage = "open-gallery";
          await waitFor(async () => {
            access = "frame";
            const current = previewFrame(webContents, pageUrl);
            if (!current) return false;
            access = "frame-parent";
            if (current.parent !== top) return false;
            frame = current;
            access = "source-point";
            const point = await perform(frame, { operation: "gallery-hover", sourceUrl: image.sourceUrl });
            stopIfAborted(signal);
            if (!point) return false;
            access = "map";
            const mapped = await perform(top, { operation: "map-gallery-hover", pageUrl,
              framePoint: point.point, frameViewport: point.viewport });
            if (MAP_BLOCKS.has(mapped?.blocked)) { access = `map-${mapped.blocked}`; return false; }
            access = "frame-changed";
            if (previewFrame(webContents, pageUrl) !== frame) return false;
            access = "map";
            if (!hover(webContents, mapped, signal)) return false;
            access = "control";
            const target = await perform(top, { operation: "gallery-control", hovered: true });
            const opened = click(webContents, target, signal);
            if (opened) access = "opened";
            return opened;
          },
          "Der passende Galerieeditor ist nicht eindeutig erreichbar.", signal);
          galleryOpen = true;
        }
        stage = "select-image";
        await waitFor(async () => {
          const target = await perform(top, { operation: "select-image", sourceUrl: image.sourceUrl });
          if (!hover(webContents, target, signal)) return false;
          const current = await perform(top, { operation: "select-image", sourceUrl: image.sourceUrl });
          return click(webContents, current, signal);
        },
          "Das freigegebene Bild ist im Galerieeditor nicht eindeutig auswählbar.", signal);
        stage = "description";
        const observed = await waitFor(() => perform(top, { operation: "description", sourceUrl: image.sourceUrl }),
          "Beschreibung und große Bildvorschau lassen sich nicht eindeutig zuordnen.", signal);
        const assessment = assessSquarespaceGalleryField(image, observed);
        if (assessment.status !== "ready") {
          if (assessment.status === "unchanged") {
            stage = "close-gallery";
            await closeGallery(webContents, top, signal);
            galleryOpen = false;
          }
          results.push({ imageKey: image.imageKey, ...assessment });
          continue;
        }
        // Gallery descriptions save automatically. Check immediately before input.
        await assertCurrent(image.imageKey, image.approvalRevision);
        const check = await perform(top, { operation: "description", sourceUrl: image.sourceUrl });
        if (assessSquarespaceGalleryField(image, check || {}).status !== "ready") throw failure("Das Bildfeld wurde zwischenzeitlich verändert.");
        stopIfAborted(signal);
        if (!await perform(top, { operation: "focus-description", sourceUrl: image.sourceUrl })) throw failure("Das Beschreibungsfeld kann nicht sicher vollständig markiert werden. Es wurde kein Text eingegeben.");
        stopIfAborted(signal);
        stage = "input";
        if (image.text) await webContents.insertText(image.text);
        else {
          webContents.sendInputEvent({ type: "keyDown", keyCode: "Backspace" });
          webContents.sendInputEvent({ type: "keyUp", keyCode: "Backspace" });
        }
        stopIfAborted(signal);
        const after = await perform(top, { operation: "description", sourceUrl: image.sourceUrl });
        if (after?.description !== image.text) throw failure("Der eingegebene Text ist im CMS-Feld nicht bestätigt. Bitte die öffentliche Ausgabe prüfen.");
        stopIfAborted(signal);
        await perform(top, { operation: "blur-description", sourceUrl: image.sourceUrl });
        stopIfAborted(signal);
        stage = "close-gallery";
        await closeGallery(webContents, top, signal);
        galleryOpen = false;
        results.push({ imageKey: image.imageKey, status: "written" });
      } catch (error) {
        if (signal?.aborted) throw error;
        let previewDiagnostic;
        try { previewDiagnostic = await inspectPreview(webContents, pageUrl, { sourceUrl: image.sourceUrl, stage, access }); } catch { /* Diagnostic reads must not replace the original failure. */ }
        results.push({ imageKey: image.imageKey, status: "failed", error: error.message,
          ...(previewDiagnostic ? { previewDiagnostic } : {}) });
        // An unexpected UI change stops all further writes in this run.
        for (const remaining of plan.images.slice(plan.images.indexOf(image) + 1)) results.push({ imageKey: remaining.imageKey,
          status: "failed", error: "Nach dem vorherigen Fehler nicht weiter übertragen." });
        break;
      }
    }
    if (results.length && results.every((result) => ["written", "unchanged"].includes(result.status))) {
      try { await exitSavedPage(webContents, pageUrl, signal); }
      catch (error) {
        if (signal?.aborted) throw error;
        let previewDiagnostic;
        try { previewDiagnostic = await inspectPreview(webContents, pageUrl, { sourceUrl: plan.images[0]?.sourceUrl, stage: "exit-page" }); }
        catch { /* A diagnostic read must not hide the failed regular page completion. */ }
        for (const result of results) Object.assign(result, { status: "failed",
          error: `Der Bildtext ist im CMS-Feld bestätigt, aber der Seitenabschluss ist unklar. ${error.message}`,
          ...(previewDiagnostic ? { previewDiagnostic } : {}) });
      }
    }
    return { results };
  }
  // The normal desktop advertises this capability after the real CMS qualification.
  return Object.freeze({ getStatus, transfer, checkNewTarget, checkNeutralDraftVacancy, prepareUnpublishedPage, createNeutralDraft, inspectPreview,
    ...(enablePageAuthoring && { createUnpublishedPage, recheckUnpublishedPage }),
    inspectAssetLibrary: inspectSquarespaceAssetLibrary, uploadLibraryImage: uploadSquarespaceLibraryImage, inspectPageAuthoring: readSquarespacePageObservation,
    confirmDisabledPage: confirmSquarespaceDisabledPage, insertPageText: insertSquarespacePageText, insertPageModule, insertPageGallery,
    inspectNeutralDraft, disableNeutralDraftSettings, assignUnpublishedDraftSettings, confirmAssignedDraftSettings, openAssignedDraftEditor, reconfirmAssignedDraftSettings,
    openPageSectionCatalog, createBlankFluidSection, appendFluidEditorBlock, placeFluidEditorBlock,
    dispatchClassicBlockPickerClick, fillPreparedPageContent, saveAndReopenPageContent, completeUnpublishedDraft });
}
