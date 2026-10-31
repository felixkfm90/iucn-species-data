import { setTimeout as delay } from "node:timers/promises";
import { canonicalWebsiteImageSource, normalizeWebsitePageUrl } from "../website-alt-parser.mjs";
import { createSquarespaceIndependentImageTransfer } from "./squarespace-independent-images.mjs";

const ADMIN = "https://vanilla-gerbil-jwnp.squarespace.com";
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
  if (observed.description !== image.expectedCaption) {
    return { status: "conflict", error: "Die Bildbeschreibung wurde seit der Prüfung verändert. Bitte zuerst neu abgleichen." };
  }
  if (observed.plainText !== true) {
    return { status: "unsupported", error: "Die Beschreibung enthält Formatierungen. Diese Übernahme benötigt eine gesonderte Prüfung." };
  }
  return { status: "ready" };
}

// All page interaction is confined to the visible editor DOM. No CMS APIs,
// session secrets, framework stores or undocumented server endpoints are used.
function editorDomOperation({ operation, names = [], sourceUrl = "", pageUrl = "", framePoint = null, frameViewport = null, hovered = false }) {
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
  const clickPoint = (el) => {
    if (!visible(el)) return null;
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    const rect = el.getBoundingClientRect();
    const width = document.documentElement?.clientWidth, height = document.documentElement?.clientHeight;
    if (![rect.left, rect.top, rect.right, rect.bottom, width, height].every(Number.isFinite)
        || width <= 0 || height <= 0 || rect.width <= 0 || rect.height <= 0
        || rect.left < 0 || rect.top < 0 || rect.right > width || rect.bottom > height) return null;
    const point = { x: Math.floor((rect.left + rect.right) / 2), y: Math.floor((rect.top + rect.bottom) / 2) };
    const hit = document.elementFromPoint?.(point.x, point.y);
    return hit && (hit === el || el.contains(hit) || hit === el.closest('[role="button"]')) ? point : null;
  };
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
  const pageEditorState = () => {
    const iframes = [...document.querySelectorAll("iframe#sqs-site-frame")].filter((el) => {
      const rect = el.getBoundingClientRect();
      return visible(el) && rect.width > 0 && rect.height > 0;
    });
    const rawToolbars = [...document.querySelectorAll('nav,[role="navigation"]')]
      .filter((el) => /Vorschau|Bearbeitung|preview|editing|editor|toolbar/i.test(el.getAttribute("aria-label") || ""));
    const toolbars = rawToolbars.filter(visible);
    const toolbar = toolbars.length === 1 ? toolbars[0] : null;
    // The observed image form has its own BEARBEITEN image-tool button.
    // It is not the page toolbar's preview/edit-mode switch.
    const edit = matchingButtons(["Bearbeiten", "Edit"]).filter((el) => !el.closest('[role="dialog"]'));
    const save = matchingButtons(["Speichern", "Save"]);
    const exit = matchingButtons(["Beenden", "Verlassen", "Exit"]);
    const bound = (matches) => matches.length === 1 && toolbar?.contains(matches[0]);
    const safeLabels = ["Bearbeiten", "Edit", "Speichern", "Save", "Beenden", "Verlassen", "Exit", "Fertig", "Done"];
    const controls = toolbar ? [...new Set(buttons.filter((el) => toolbar.contains(el))
      .map((el) => safeLabels.find((label) => hasControlLabel(el, [label]))).filter(Boolean))]
      .slice(0, 9) : [];
    const mode = iframes.length !== 1 ? "unknown" : bound(edit) && !edit[0].disabled ? "preview"
      : !edit.length && bound(save) && bound(exit) ? "editing" : "unknown";
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
  if (operation === "preview-state") return pageEditorState().state;
  if (operation === "save-page") {
    const { state, save } = pageEditorState();
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
    const { state, exit } = pageEditorState();
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
    const candidates = matchingButtons(["Bearbeiten", "Edit"]);
    if (candidates.length !== 1 || candidates[0].disabled) return null;
    const point = clickPoint(candidates[0]);
    return point ? { point } : null;
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

export function createSquarespaceGalleryDriver({ waitMs = 250, timeoutMs = 20_000 } = {}) {
  async function perform(frame, payload) {
    return frame.executeJavaScript(`(${editorDomOperation.toString()})(${JSON.stringify(payload)})`, true);
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
  async function boundedRead(frame, payload) {
    let timer;
    try {
      return await Promise.race([perform(frame, payload),
        new Promise((resolve) => { timer = setTimeout(() => resolve(null), Math.min(timeoutMs, 2000)); })]);
    } finally { clearTimeout(timer); }
  }
  async function previewState(webContents) {
    return boundedRead(mainFrame(webContents), { operation: "preview-state" });
  }
  async function inspectPreview(webContents, pageUrl, { sourceUrl = "", stage = "", access = "" } = {}) {
    const top = mainFrame(webContents);
    let state;
    try { state = await previewState(webContents); } catch { state = null; }
    const diagnostic = { target: redactedAddress(pageUrl), mode: ["preview", "editing"].includes(state?.mode) ? state.mode : "unknown",
      iframeCount: Number.isSafeInteger(state?.iframeCount) && state.iframeCount >= 0 ? Math.min(state.iframeCount, 20) : 0,
      iframe: redactedAddress(state?.iframeSrc),
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
  async function waitFor(operation, message, signal) {
    const deadline = performance.now() + timeoutMs;
    do {
      stopIfAborted(signal);
      const value = await operation();
      stopIfAborted(signal);
      if (value) return value;
      await delay(waitMs, undefined, { signal });
    } while (performance.now() < deadline);
    throw failure(message);
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
  async function openPage(webContents, plan, signal) {
    let top = mainFrame(webContents), frame = previewFrame(webContents, plan.pageUrl);
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
    if (!frame && state?.mode === "editing") {
      state = await exitSavedPage(webContents, "", signal);
      top = mainFrame(webContents);
    }
    if (!frame) {
      const current = new URL(webContents.getURL());
      if (current.origin !== ADMIN || current.pathname !== "/config/pages" || state?.iframeCount !== 1) {
        await navigate(webContents, `${ADMIN}/config/pages`, signal);
        top = mainFrame(webContents);
      }
      const pageNames = squarespacePageNames(plan);
      let selected = false;
      for (let attempt = 0; attempt < 40 && !selected; attempt += 1) {
        stopIfAborted(signal);
        const target = await perform(top, { operation: "select-page", names: pageNames, pageUrl: plan.pageUrl });
        selected = pageNames.includes(target?.name) && click(webContents, target, signal);
        if (selected) break;
        click(webContents, await perform(top, { operation: "expand-folder" }), signal);
        await delay(waitMs, undefined, { signal });
      }
      if (!selected) throw failure("Die freigegebene Seite ist im Squarespace-Seitenbaum nicht eindeutig zugeordnet.");
      frame = await waitFor(() => previewFrame(webContents, plan.pageUrl),
        "Die Squarespace-Seitenvorschau lädt nicht. Es wurden keine Bildtexte eingegeben.", signal);
      state = await previewState(webContents);
    }
    stopIfAborted(signal);
    if (state?.iframeCount !== 1 || !["preview", "editing"].includes(state?.mode)) {
      throw failure("Der Zustand der Squarespace-Seitenbearbeitung ist nicht eindeutig. Es wurden keine Bildtexte eingegeben.");
    }
    if (state.mode === "editing") return frame;
    const target = await perform(top, { operation: "edit-page" });
    if (!click(webContents, target, signal)) throw failure("Die Seitenbearbeitung lässt sich nicht eindeutig öffnen.");
    return waitFor(async () => {
      const current = previewFrame(webContents, plan.pageUrl), editing = await previewState(webContents);
      return current && editing?.iframeCount === 1 && editing?.mode === "editing" ? current : null;
    }, "Die Bearbeitung der freigegebenen Seite ist noch nicht eindeutig geladen. Es wurden keine Bildtexte eingegeben.", signal);
  }
  async function closeGallery(webContents, top, signal) {
    const target = await perform(top, { operation: "close-gallery" });
    if (!click(webContents, target, signal)) throw failure("Der Galerieeditor lässt sich nicht eindeutig schließen. Bitte den Abschluss prüfen.");
    await waitFor(() => perform(top, { operation: "gallery-closed" }),
      "Das Schließen des Galerieeditors ist noch nicht bestätigt. Bitte den Abschluss prüfen.", signal);
  }
  async function exitSavedPage(webContents, expectedPageUrl, signal) {
    const top = mainFrame(webContents), adminUrl = new URL(webContents.getURL());
    const state = await previewState(webContents);
    let previousPage;
    try { previousPage = previewPageUrl(state?.iframeSrc); } catch { /* An unknown or foreign frame never authorizes Exit. */ }
    const frame = previousPage && previewFrame(webContents, previousPage);
    if (adminUrl.origin !== ADMIN || adminUrl.pathname !== "/config/pages" || state?.iframeCount !== 1
        || state.dialogOpen !== false || !frame || frame.parent !== top
        || expectedPageUrl && previousPage !== previewPageUrl(expectedPageUrl)) {
      throw failure("Die aktuelle FN-Seitenbearbeitung lässt sich nicht eindeutig einem gespeicherten Abschluss zuordnen.");
    }
    if (state.mode === "preview") return state;
    if (state.mode !== "editing" || state.saveDisabled !== true) {
      throw failure("Die FN-Seitenbearbeitung ist noch nicht eindeutig gespeichert. Bitte offene Änderungen zuerst prüfen.");
    }
    const target = await waitFor(async () => {
      const current = await previewState(webContents), currentFrame = previewFrame(webContents, previousPage);
      let samePage = false;
      try { samePage = previewPageUrl(current?.iframeSrc) === previousPage; } catch { /* Unknown frames cannot authorize Exit. */ }
      if (mainFrame(webContents) !== top || current?.iframeCount !== 1 || !samePage || !currentFrame
          || currentFrame.parent !== top || current.dialogOpen !== false) return null;
      if (current.mode === "preview") return { completed: current };
      if (current.mode !== "editing" || current.saveDisabled !== true) return null;
      const action = await perform(top, { operation: "exit-page", pageUrl: previousPage });
      // Save may replace the same page's frame. Bind it freshly and require it
      // to remain unchanged throughout this read before sending one native click.
      return mainFrame(webContents) === top && previewFrame(webContents, previousPage) === currentFrame ? action : null;
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
        && samePage && preview?.parent === mainFrame(webContents) ? current : null;
    }, "Das Beenden der FN-Seitenbearbeitung ist noch nicht als Vorschau bestätigt. Bitte den Abschluss prüfen.", signal);
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
  return Object.freeze({ getStatus, transfer, inspectPreview });
}
