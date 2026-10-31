// Deliberately self-contained: the driver serializes this function into the
// selected preview frame or top frame. No CMS internals or input writes.
export function squarespaceImageBlockDomOperation({ operation, sourceUrl = "", blockId = "" } = {}) {
  const all = (root, selector) => [...root.querySelectorAll(selector)];
  const attr = (node, name) => String(node?.getAttribute?.(name) || "");
  const normalize = (value) => String(value || "").replace(/\s+/gu, " ").trim().toLocaleLowerCase("de-DE");
  const altLabel = (value) => normalize(value).replace(/\s*[-‐‑–]\s*/gu, "-").replace(/^bild alternativtext$/, "bild-alternativtext") === "bild-alternativtext";
  const cap = (value, limit = 20) => Math.min(value, limit);
  const viewport = () => ({ width: globalThis.innerWidth || document.documentElement?.clientWidth,
    height: globalThis.innerHeight || document.documentElement?.clientHeight });
  const canonical = (value) => {
    try {
      const url = new URL(value, document.baseURI);
      if (!value || url.protocol !== "https:" || url.username || url.password) return "";
      url.searchParams.delete("format"); return url.href;
    } catch { return ""; }
  };
  const expected = canonical(sourceUrl);
  function visible(node) {
    if (!node?.getClientRects?.().length) return false;
    for (let current = node; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (current.hidden || attr(current, "aria-hidden") === "true" || current.inert || current.hasAttribute?.("inert")
        || style.display === "none" || ["hidden", "collapse"].includes(style.visibility) || style.contentVisibility === "hidden"
        || String(style.opacity) === "0") return false;
    }
    return true;
  }
  function enabled(node) {
    if (!visible(node) || getComputedStyle(node).pointerEvents === "none") return false;
    for (let current = node; current; current = current.parentElement) {
      if (current.disabled || current.hasAttribute?.("disabled") || attr(current, "aria-disabled") === "true") return false;
    }
    return true;
  }
  function clippedRect(node) {
    if (!visible(node)) return null;
    const rect = node.getBoundingClientRect(), view = viewport();
    if (![rect.left, rect.top, rect.right, rect.bottom, rect.width, rect.height, view.width, view.height].every(Number.isFinite)
      || rect.width <= 0 || rect.height <= 0 || view.width <= 0 || view.height <= 0) return null;
    const result = { left: Math.max(0, rect.left), top: Math.max(0, rect.top), right: Math.min(view.width, rect.right), bottom: Math.min(view.height, rect.bottom) };
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
      if (["hidden", "clip", "auto", "scroll", "overlay"].includes(style.overflowX || style.overflow)) {
        if (![bounds.left, bounds.right].every(Number.isFinite)) return null;
        result.left = Math.max(result.left, bounds.left); result.right = Math.min(result.right, bounds.right);
      }
      if (["hidden", "clip", "auto", "scroll", "overlay"].includes(style.overflowY || style.overflow)) {
        if (![bounds.top, bounds.bottom].every(Number.isFinite)) return null;
        result.top = Math.max(result.top, bounds.top); result.bottom = Math.min(result.bottom, bounds.bottom);
      }
    }
    return result.right - result.left >= 1 && result.bottom - result.top >= 1 ? result : null;
  }
  function clickPoint(node, boundBlock = null) {
    // Fluid Engine deliberately routes image pointer input to the surrounding
    // editable block. The measured image pixel must still hit that exact block.
    if (boundBlock ? !visible(node) || !enabled(boundBlock) : !enabled(node)) return null;
    node.scrollIntoView?.({ block: boundBlock ? "center" : "nearest", inline: "nearest", behavior: "instant" });
    const rect = clippedRect(node); if (!rect) return null;
    for (const [sx, sy] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const point = { x: Math.floor(rect.left + (rect.right - rect.left) * sx), y: Math.floor(rect.top + (rect.bottom - rect.top) * sy) };
      if (point.x < rect.left || point.y < rect.top || point.x >= rect.right || point.y >= rect.bottom) continue;
      const hit = document.elementFromPoint?.(point.x, point.y);
      if (!hit) continue;
      if (hit === node || node.contains(hit)) return point;
      if (boundBlock && boundBlock.contains(hit) && hit.contains?.(node)) {
        const control = hit.closest?.("button,a,input,textarea,select,[role=button],[role=menuitem],[role=menu]");
        if (!control || control === boundBlock) return point;
      }
    }
    return null;
  }
  function imageSources(node) {
    const raw = [attr(node, "data-src"), node.currentSrc, node.src, attr(node, "src")].filter(Boolean);
    const sources = raw.map(canonical), unique = [...new Set(sources.filter(Boolean))];
    return { sources: unique, conflict: sources.some((value) => !value) || unique.length !== 1 };
  }
  function backgroundSources(node) {
    const background = String(getComputedStyle(node).backgroundImage || "");
    const raw = [...background.matchAll(/url\(\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^)'"\n]*))\s*\)/gu)].map((match) => (match[1] ?? match[2] ?? match[3]).trim());
    const sources = raw.map(canonical), unique = [...new Set(sources.filter(Boolean))];
    return { sources: unique, conflict: sources.some((value) => !value) || unique.length !== 1 };
  }
  function blockCandidates() {
    const mains = all(document, "main#page").filter(visible);
    const blocks = mains.flatMap((main) => all(main, '[data-sqsp-block="image"]'));
    const eligible = blocks.filter((block) => visible(block) && !block.closest("header,footer,[role=banner],[role=contentinfo],section[data-sqsp-section=gallery],[data-sqsp-block=gallery]"));
    const matching = eligible.filter((block) => (!blockId || attr(block, "id") === blockId)
      && all(block, "img").some((image) => image.closest("[data-sqsp-block]") === block && imageSources(image).sources.includes(expected)));
    return { mains, blocks, eligible, matching };
  }
  function labelText(node) {
    if (node?.childNodes) {
      let result = "";
      for (const child of node.childNodes) {
        if (child.nodeType === 3) result += child.nodeValue || "";
        else if (child.nodeType === 1 && !["INPUT", "TEXTAREA", "SELECT", "BUTTON", "SCRIPT", "STYLE"].includes(child.tagName)) result += labelText(child);
      }
      return result.trim();
    }
    return String(node?.innerText || node?.textContent || "").trim();
  }
  function uniqueId(id, scope = document) {
    const found = all(scope, "[id]").filter((node) => attr(node, "id") === id);
    return found.length === 1 ? found[0] : null;
  }
  function accessibleLabel(node, scope) {
    const names = [], labelled = attr(node, "aria-labelledby").trim();
    if (labelled) {
      const ids = labelled.split(/\s+/u); if (ids.length > 8) return { names: [], conflict: true };
      const labels = ids.map((id) => uniqueId(id, node.getRootNode?.() || document));
      if (labels.some((label) => !label || !scope.contains(label))) return { names: [], conflict: true };
      names.push(labels.map(labelText).join(" "));
    }
    if (attr(node, "aria-label").trim()) names.push(attr(node, "aria-label").trim());
    if (["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName)) {
      const id = attr(node, "id"), labels = [...new Set([...(node.labels || []), ...all(scope, "label").filter((label) => id && attr(label, "for") === id)])];
      const wrapping = node.closest("label"); if (wrapping && scope.contains(wrapping)) labels.push(wrapping);
      if (id && labels.length && uniqueId(id, node.getRootNode?.() || document) !== node) return { names: [], conflict: true };
      for (const label of labels) if (scope.contains(label)) names.push(labelText(label));
    }
    const unique = [...new Set(names.map(normalize).filter(Boolean))];
    return { names: unique, conflict: unique.length > 1 };
  }
  function dialogs() {
    const visibleDialogs = all(document, '[role="dialog"]').filter(visible);
    const observed = visibleDialogs.filter((dialog) => {
      const name = accessibleLabel(dialog, dialog);
      return !name.conflict && name.names.length === 1 && name.names[0] === "block-editor-formular";
    });
    return { visibleDialogs, observed };
  }
  const isShadow = (field) => /shadow|mirror|measure/iu.test(attr(field, "data-test")) || attr(field, "aria-hidden") === "true";
  function editable(field) {
    for (let current = field; current; current = current.parentElement) if (attr(current, "aria-readonly") === "true") return false;
    return enabled(field) && !isShadow(field) && !field.readOnly && !field.hasAttribute?.("readonly") && attr(field, "aria-readonly") !== "true"
      && (field.tagName === "TEXTAREA" || field.tagName === "INPUT" && (!attr(field, "type") || attr(field, "type").toLowerCase() === "text"));
  }
  function fieldState(dialog) {
    const controls = all(dialog, "input,textarea,select"), altFields = controls.filter((field) => {
      const label = accessibleLabel(field, dialog);
      return !isShadow(field) && visible(field) && !label.conflict && label.names.length === 1 && altLabel(label.names[0]);
    });
    const previews = all(dialog, "*").filter(visible).flatMap((node) => {
      const binding = node.tagName === "IMG" ? imageSources(node) : backgroundSources(node);
      return binding.sources.length || binding.conflict && node.tagName === "IMG" ? [{ node, ...binding, clipped: Boolean(clippedRect(node)) }] : [];
    });
    const matchingPreviews = previews.filter((item) => item.clipped && !item.conflict && item.sources[0] === expected);
    const otherPreviews = previews.filter((item) => item.clipped && (item.conflict || item.sources.some((source) => source !== expected)));
    return { controls, altFields, previews, matchingPreviews, otherPreviews };
  }
  if (operation === "bind-block") {
    if (!expected) return null;
    const candidates = blockCandidates();
    if (candidates.mains.length !== 1 || candidates.matching.length !== 1) return null;
    const block = candidates.matching[0], id = attr(block, "id");
    if (!/^block-[a-zA-Z0-9_-]{1,160}$/.test(id) || all(document, "[id]").filter((node) => attr(node, "id") === id).length !== 1) return null;
    const images = all(block, "img").filter((image) => visible(image) && image.closest("[data-sqsp-block]") === block);
    if (images.length !== 1) return null;
    const binding = imageSources(images[0]);
    if (binding.conflict || binding.sources[0] !== expected) return null;
    const captions = all(block, "figcaption").filter((caption) => visible(caption) && caption.closest("[data-sqsp-block]") === block);
    if (captions.length > 1) return null;
    const point = clickPoint(images[0], block); if (!point) return null;
    return { blockId: id, sourceUrl: expected, alt: attr(images[0], "alt"), caption: captions.length ? String(captions[0].innerText || captions[0].textContent || "").trim() : "", point, viewport: viewport() };
  }
  if (operation === "edit-block-control") {
    const menus = all(document, '[role="menu"]').filter(visible).map((menu) => {
      const controls = all(menu, "button,[role=button],[role=menuitem]").filter(visible);
      const named = (name) => controls.filter((control) => {
        const label = accessibleLabel(control, menu), names = label.names.length ? label.names : [normalize(labelText(control))];
        return !label.conflict && names.length === 1 && names[0] === name;
      });
      const edits = named("bearbeiten"); return edits.length === 1 && named("duplizieren").length === 1 && named("entfernen").length === 1 ? edits[0] : null;
    }).filter(Boolean);
    if (menus.length !== 1) return null;
    const point = clickPoint(menus[0]); return point ? { point } : null;
  }
  const found = dialogs();
  if (operation === "dialog-closed") return found.visibleDialogs.length === 0;
  if (operation === "field-diagnostic") {
    const candidates = blockCandidates(), body = all(document, "img").filter((node) => expected && imageSources(node).sources.includes(expected));
    const basic = { visibleDialogs: cap(found.visibleDialogs.length), observedDialogs: cap(found.observed.length), mainCount: cap(candidates.mains.length),
      imageBlocks: cap(candidates.blocks.length), eligibleBlocks: cap(candidates.eligible.length), matchingBlocks: cap(expected ? candidates.matching.length : 0),
      matchingImages: cap(candidates.matching.flatMap((block) => all(block, "img")).filter((image) => expected && imageSources(image).sources.includes(expected)).length),
      bodyMatches: cap(body.length), visibleBodyMatches: cap(body.filter(visible).length), sourceConflicts: cap(body.filter((node) => imageSources(node).conflict).length),
      blockIdMatches: cap(blockId ? all(document, "[id]").filter((node) => attr(node, "id") === blockId).length : 0) };
    if (found.observed.length !== 1) {
      const bindings = candidates.matching.slice(0, 3).map((block) => {
        const images = all(block, "img").filter(visible), image = images[0], rect = image && clippedRect(image);
        const hit = rect && document.elementFromPoint?.((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2);
        const chain = [];
        for (let node = hit; node && chain.length < 6; node = node.parentElement) chain.push({
          tag: /^[A-Z][A-Z0-9]{0,20}$/.test(node.tagName) ? node.tagName : "other",
          id: /^(?:block-[a-zA-Z0-9_-]{1,160}|yui_[0-9_]{1,120})$/.test(attr(node, "id")) ? attr(node, "id") : "",
          role: ["grid", "gridcell", "button", "img", "presentation"].includes(attr(node, "role")) ? attr(node, "role") : "",
          class: attr(node, "class").split(/\s+/u).filter((value) => /^(?:sqs-|fe-|fluid-|css-)[a-zA-Z0-9_-]{1,80}$/.test(value)).slice(0, 8).join(" "),
          block: attr(node, "data-sqsp-block") === "image" ? "image" : "" });
        return { imageCount: cap(images.length), idUnique: all(document, "[id]").filter((node) => attr(node, "id") === attr(block, "id")).length === 1,
          clipped: Boolean(rect), imageEnabled: Boolean(image && enabled(image)), blockEnabled: enabled(block),
          imagePointerEvents: image && ["none", "auto"].includes(getComputedStyle(image).pointerEvents) ? getComputedStyle(image).pointerEvents : "other",
          blockPointerEvents: ["none", "auto"].includes(getComputedStyle(block).pointerEvents) ? getComputedStyle(block).pointerEvents : "other",
          hasPoint: Boolean(image && clickPoint(image, block)), hitInsideBlock: Boolean(hit && block.contains(hit)), chain };
      });
      return { status: found.observed.length ? "ambiguous-dialog" : "dialog-not-found", counts: basic, bindings, fields: [], previews: [] };
    }
    const dialog = found.observed[0], state = fieldState(dialog);
    const safeToken = (value) => /^[a-zA-Z0-9:_-]{1,80}$/.test(value) && !/password|credential|secret|token|auth|session|cookie|bearer|^(?:sk-|hf_|ghp_|github_pat_|xox[baprs]-|eyJ)/iu.test(value) ? value : "";
    const labelKind = (value) => {
      const name = normalize(value);
      if (/alt|alternativtext/iu.test(name) && !/dateiname|filename/iu.test(name)) return "Alt";
      if (/dateiname|filename|file name/iu.test(name)) return "File";
      if (/titel|title/iu.test(name)) return "Title";
      if (/beschreibung|description/iu.test(name)) return "Description";
      return "";
    };
    const snippets = (node) => ({ tag: ["INPUT", "TEXTAREA", "SELECT", "IMG"].includes(node.tagName) ? node.tagName.toLowerCase() : "preview-background",
      id: safeToken(attr(node, "id")), role: ["textbox", "img", "presentation", "group", "button"].includes(attr(node, "role")) ? attr(node, "role") : "",
      dataTest: safeToken(attr(node, "data-test")), title: labelKind(attr(node, "title")), ariaLabel: labelKind(attr(node, "aria-label")),
      ariaLabelledby: attr(node, "aria-labelledby").split(/\s+/u).filter((id) => safeToken(id)).slice(0, 4).join(" ") });
    const fields = state.controls.flatMap((field) => {
      const names = accessibleLabel(field, dialog), labels = [...new Set(names.names.map(labelKind).filter(Boolean))];
      return labels.length ? [{ ...snippets(field), labels: labels.slice(0, 4), labelConflict: names.conflict, visible: visible(field), editable: editable(field), shadow: isShadow(field),
        type: field.tagName === "TEXTAREA" ? "textarea" : ["text", ""].includes(attr(field, "type")) ? "text" : "other" }] : [];
    }).slice(0, 12);
    return { status: "observed-dialog", counts: { ...basic, fields: cap(state.controls.length), visibleFields: cap(state.controls.filter(visible).length),
      altFields: cap(state.altFields.length), editableAltFields: cap(state.altFields.filter(editable).length), previews: cap(state.previews.length),
      matchingPreviews: cap(state.matchingPreviews.length), conflictingPreviews: cap(state.otherPreviews.length),
      shadowHosts: cap(all(dialog, "*").filter((node) => node.shadowRoot).length) }, fields,
    previews: state.previews.slice(0, 8).map((item) => ({ ...snippets(item.node), sourceMatched: !item.conflict && item.sources[0] === expected, sourceConflict: item.conflict })) };
  }
  if (!["alt-field", "focus-alt", "blur-alt"].includes(operation)) return null;
  if (!expected || found.observed.length !== 1) return operation === "alt-field" ? null : false;
  const state = fieldState(found.observed[0]);
  if (state.altFields.length !== 1 || !editable(state.altFields[0]) || !state.matchingPreviews.length || state.otherPreviews.length) return operation === "alt-field" ? null : false;
  const field = state.altFields[0], before = String(field.value ?? "");
  if (operation === "focus-alt") { field.focus({ preventScroll: true }); return document.activeElement === field && String(field.value ?? "") === before; }
  if (operation === "blur-alt") { field.blur(); return document.activeElement !== field && String(field.value ?? "") === before; }
  return { sourceUrl: expected, alt: before, isAltField: true, editable: true };
}
