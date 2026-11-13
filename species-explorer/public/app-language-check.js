(function initializeLanguageCheck(global) {
  "use strict";

  const MAX_TEXT = 20000, MAX_FINDINGS = 100;
  const KINDS = new Set(["spelling", "capitalization", "grammar", "punctuation", "style"]);
  const mounted = new WeakMap();
  const reviews = new WeakMap();
  let nextId = 0;
  function serializedReview(documentRef, operation) {
    const previous = reviews.get(documentRef) || Promise.resolve();
    const result = previous.then(operation), settled = result.then(() => undefined, () => undefined);
    reviews.set(documentRef, settled);
    void settled.then(() => { if (reviews.get(documentRef) === settled) reviews.delete(documentRef); });
    return result;
  }
  const boundary = (text, offset) => !(offset > 0 && offset < text.length
    && /[\uD800-\uDBFF]/.test(text[offset - 1]) && /[\uDC00-\uDFFF]/.test(text[offset]));
  const validReplacement = value => typeof value === "string" && value.length <= 4000 && !/[\x00-\x1f\x7f]/.test(value);
  function findingsFor(result, text) {
    if (!result || result.available === false) return null;
    if (result.originalText !== undefined && result.originalText !== text || !Array.isArray(result.findings)
      || result.findings.length > MAX_FINDINGS) return null;
    const findings = [];
    for (const item of result.findings) {
      if (!item || !Number.isSafeInteger(item.start) || !Number.isSafeInteger(item.end)
        || item.start < 0 || item.end < item.start || item.end > text.length || !boundary(text, item.start) || !boundary(text, item.end)
        || !validReplacement(item.replacement)
        || typeof item.explanation !== "string" || !item.explanation.trim() || item.explanation.length > 1000
        || !KINDS.has(item.kind) || item.replacement === text.slice(item.start, item.end)
        || item.draftQuote !== undefined && item.draftQuote !== text.slice(item.start, item.end)
        || item.alternative !== undefined && (!validReplacement(item.alternative) || item.kind !== "spelling"
          || item.alternative === item.replacement || item.alternative === text.slice(item.start, item.end))) return null;
      findings.push({ start: item.start, end: item.end, replacement: item.replacement,
        explanation: item.explanation, kind: item.kind, draftQuote: text.slice(item.start, item.end),
        ...(item.alternative === undefined ? {} : { alternative: item.alternative }) });
    }
    // Prefer concrete small spans over a broad sentence correction. Equal
    // spans keep the first finding; every acceptance rechecks.
    const ranked = findings.map((finding, order) => ({ finding, order })).sort((a, b) =>
      a.finding.end - a.finding.start - (b.finding.end - b.finding.start) || a.finding.start - b.finding.start || a.order - b.order);
    const selected = [], seen = new Set();
    const overlaps = (a, b) => {
      if (a.start === a.end) return b.start === b.end ? a.start === b.start : a.start >= b.start && a.start < b.end;
      if (b.start === b.end) return b.start >= a.start && b.start < a.end;
      return a.start < b.end && b.start < a.end;
    };
    for (const { finding } of ranked) {
      const key = JSON.stringify([finding.start, finding.end, finding.replacement]);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!selected.some(existing => overlaps(existing, finding))) selected.push(finding);
    }
    return selected.sort((a, b) => a.start - b.start || a.end - b.end);
  }
  function watchRemoval(documentRef, callback) {
    const Observer = documentRef.defaultView?.MutationObserver || global.MutationObserver;
    if (!Observer || !documentRef.documentElement) return () => {};
    let entry = mounted.get(documentRef);
    if (!entry) {
      const callbacks = new Set(), observer = new Observer(() => { for (const check of [...callbacks]) check(); });
      observer.observe(documentRef.documentElement, { childList: true, subtree: true });
      entry = { callbacks, observer }; mounted.set(documentRef, entry);
    }
    entry.callbacks.add(callback);
    return () => { entry.callbacks.delete(callback); if (!entry.callbacks.size) { entry.observer.disconnect(); mounted.delete(documentRef); } };
  }

  /** review(text,{signal}); isCurrent({text,signal}) must return true.
   * onApply({text,nextText,finding,signal}) is an optional gate, never a text writer.
   * Only focused/edited fields request a review; native spelling stays enabled in every field. */
  function createInlineLanguageCheck({ textarea, review, isCurrent = () => true, onApply, delayMs = 850 } = {}) {
    if (!textarea || String(textarea.tagName).toLowerCase() !== "textarea" || !textarea.parentNode
      || typeof review !== "function" || typeof isCurrent !== "function" || onApply !== undefined && typeof onApply !== "function"
      || !Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 10000) throw new TypeError("Ein Textfeld und eine lokale Sprachprüfung sind erforderlich.");
    const documentRef = textarea.ownerDocument, view = documentRef.defaultView || global;
    const timeout = view.setTimeout.bind(view), clearTimer = view.clearTimeout.bind(view);
    const make = (tag, className) => { const node = documentRef.createElement(tag); node.className = className; return node; };
    const wrapper = make("div", "language-check-field"), overlay = make("div", "language-check-overlay"), mirror = make("div", "language-check-mirror");
    overlay.setAttribute("aria-hidden", "true"); overlay.append(mirror);
    textarea.parentNode.insertBefore(wrapper, textarea); wrapper.append(textarea, overlay);
    const host = textarea.closest?.("dialog") || documentRef.body || wrapper.parentNode;
    const panel = make("div", "language-check-popover"), status = make("span", "language-check-status");
    panel.hidden = true; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Sprachhinweis");
    status.id = `language-check-status-${++nextId}`; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    host.append(panel, status);
    const described = (textarea.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
    textarea.setAttribute("aria-describedby", [...described, status.id].join(" "));
    textarea.spellcheck = true; textarea.lang = "de";
    textarea.setAttribute("spellcheck", "true"); textarea.setAttribute("lang", "de");
    let disposed = false, composing = false, focused = documentRef.activeElement === textarea;
    let generation = 0, timer = null, active = null, waiting = false, applying = null;
    let findings = [], marks = [], checkedText = null, lastReviewed = null;
    const listeners = [];
    const listen = (target, type, handler, options) => { target.addEventListener(type, handler, options); listeners.push(() => target.removeEventListener(type, handler, options)); };
    const eligible = () => !disposed && textarea.isConnected !== false && !textarea.disabled && !textarea.readOnly && !composing
      && typeof textarea.value === "string" && textarea.value.trim().length > 0 && textarea.value.length <= MAX_TEXT;
    function state(value, message = "") {
      if (disposed) return;
      textarea.setAttribute("data-language-check-state", value);
      if (status.textContent !== message) status.textContent = message;
    }
    function closePanel() { panel.hidden = true; panel.replaceChildren(); }
    function layout() {
      if (disposed || textarea.isConnected === false) return;
      const computed = view.getComputedStyle?.(textarea);
      if (!computed) return;
      overlay.style.left = `${textarea.offsetLeft + (parseFloat(computed.borderLeftWidth) || 0)}px`;
      overlay.style.top = `${textarea.offsetTop + (parseFloat(computed.borderTopWidth) || 0)}px`;
      overlay.style.width = `${textarea.clientWidth}px`; overlay.style.height = `${textarea.clientHeight}px`;
      mirror.style.width = `${textarea.clientWidth}px`;
      for (const property of ["fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariant", "fontStretch", "lineHeight", "letterSpacing", "wordSpacing",
        "textAlign", "textIndent", "textTransform", "direction", "tabSize", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "wordBreak"]) mirror.style[property] = computed[property];
      mirror.style.whiteSpace = textarea.wrap === "off" ? "pre" : "pre-wrap";
      mirror.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`;
    }
    function paint() {
      mirror.replaceChildren(); marks = []; let cursor = 0;
      const source = typeof textarea.value === "string" ? textarea.value : "";
      if (checkedText === source) for (const finding of findings) {
        mirror.append(documentRef.createTextNode(source.slice(cursor, finding.start)));
        const mark = make("mark", `language-check-mark language-check-${finding.kind}${finding.start === finding.end ? " language-check-insertion" : ""}`);
        mark.append(documentRef.createTextNode(source.slice(finding.start, finding.end))); mirror.append(mark); marks.push(mark); cursor = finding.end;
      }
      mirror.append(documentRef.createTextNode(source.slice(cursor)), documentRef.createTextNode("\n")); layout();
    }
    function clearFindings() { findings = []; checkedText = null; closePanel(); paint(); }
    function cancelTimer() { if (timer !== null) { clearTimer(timer); timer = null; } waiting = false; }
    function invalidate() {
      generation++; cancelTimer(); active?.controller.abort(); applying?.abort(); lastReviewed = null; clearFindings();
    }
    async function current(text, signal, epoch) {
      if (!eligible() || signal.aborted || generation !== epoch || textarea.value !== text) return false;
      let accepted = false;
      try { accepted = await isCurrent({ text, signal }) === true; } catch { /* Failed binding checks never authorize a result. */ }
      return accepted && eligible() && !signal.aborted && generation === epoch && textarea.value === text;
    }
    function schedule(reset = true) {
      if (disposed) return;
      if (reset) invalidate(); else cancelTimer();
      if (!eligible()) { state(textarea.value?.trim() ? "idle" : "empty"); return; }
      if (!focused && documentRef.activeElement !== textarea) { state("idle"); return; }
      state("pending");
      timer = timeout(() => { timer = null; waiting = true; void begin(); }, delayMs);
    }
    async function begin() {
      if (!waiting || disposed || active || !eligible() || !focused && documentRef.activeElement !== textarea) return;
      waiting = false;
      const text = textarea.value, epoch = generation, controller = new AbortController();
      const operation = { controller, promise: null }; active = operation;
      operation.promise = (async () => {
        if (!await current(text, controller.signal, epoch)) { if (generation === epoch && !disposed) { clearFindings(); state("idle"); } return; }
        if (lastReviewed === text && checkedText === text) { state("ready", findings.length ? `${findings.length} Sprachhinweise` : ""); return; }
        state("checking", "Sprache wird geprüft");
        let result;
        try { result = await serializedReview(documentRef, async () => await current(text, controller.signal, epoch)
          ? review(text, { signal: controller.signal }) : null); }
        catch { if (!controller.signal.aborted && generation === epoch && !disposed) { clearFindings(); state("unavailable", "Sprachprüfung gerade nicht verfügbar"); } return; }
        if (!await current(text, controller.signal, epoch)) {
          if (generation === epoch && !disposed) { clearFindings(); state("idle"); }
          return;
        }
        let checked;
        try { checked = findingsFor(result, text); } catch { checked = null; }
        if (!checked) { clearFindings(); state("unavailable", "Sprachprüfung gerade nicht verfügbar"); return; }
        findings = checked; checkedText = text; lastReviewed = text; paint();
        state("ready", findings.length ? `${findings.length} Sprachhinweise` : "");
      })().finally(() => { if (active === operation) active = null; if (waiting && !disposed) void begin(); });
      await operation.promise;
    }
    async function applyFinding(finding, replacement) {
      if (applying || checkedText === null || textarea.value !== checkedText || !findings.includes(finding)) return;
      const original = checkedText, epoch = generation, controller = new AbortController(); applying = controller;
      const nextText = original.slice(0, finding.start) + replacement + original.slice(finding.end);
      try {
        if (nextText.length > MAX_TEXT || textarea.maxLength >= 0 && nextText.length > textarea.maxLength
          || !await current(original, controller.signal, epoch)) return;
        if (onApply && await onApply({ text: original, nextText, finding: { ...finding, replacement }, signal: controller.signal }) === false) return;
        if (!await current(original, controller.signal, epoch) || !findings.includes(finding)) return;
        closePanel(); textarea.focus();
        if (!eligible() || generation !== epoch || controller.signal.aborted || textarea.value !== original || documentRef.activeElement !== textarea) return;
        textarea.setSelectionRange(finding.start, finding.end);
        let inputObserved = false, beforeInput = null;
        const observeInput = () => { inputObserved = true; }, observeBefore = event => { beforeInput = event; };
        textarea.addEventListener("input", observeInput); textarea.addEventListener("beforeinput", observeBefore);
        try {
          // Chromium's native insertText retains Ctrl+Z history. Keep a guarded
          // standard field fallback because execCommand is deprecated elsewhere.
          if (typeof documentRef.execCommand === "function") {
            try { documentRef.execCommand("insertText", false, replacement); } catch { /* Use the original unchanged field only. */ }
          }
          if (textarea.value === original && !inputObserved && !beforeInput?.defaultPrevented) {
            const Input = view.InputEvent || view.Event;
            if (!beforeInput && !textarea.dispatchEvent(new Input("beforeinput", { bubbles: true, cancelable: true,
              inputType: "insertReplacementText", data: replacement }))) return;
            if (textarea.value !== original || !eligible() || generation !== epoch || controller.signal.aborted) return;
            textarea.setRangeText(replacement, finding.start, finding.end, "end");
          }
          if (!inputObserved && textarea.value !== original) textarea.dispatchEvent(new view.Event("input", { bubbles: true }));
        } finally {
          textarea.removeEventListener("input", observeInput); textarea.removeEventListener("beforeinput", observeBefore);
        }
      } catch { if (!disposed) { closePanel(); state("unavailable", "Der Sprachhinweis konnte nicht übernommen werden"); } }
      finally { if (applying === controller) applying = null; }
    }
    function openFinding(finding, focus = false) {
      if (!eligible() || checkedText !== textarea.value || !findings.includes(finding)) return;
      closePanel();
      const explanation = make("p", "language-check-explanation"); explanation.textContent = finding.explanation;
      const suggestions = [finding.replacement];
      if (finding.alternative !== undefined) suggestions.push(finding.alternative);
      const buttons = suggestions.map(replacement => {
        const apply = make("button", "language-check-apply"); apply.type = "button";
        apply.textContent = replacement || "Textstelle entfernen";
        apply.setAttribute("aria-label", replacement ? `Vorschlag übernehmen: ${replacement}` : "Textstelle entfernen");
        apply.addEventListener("click", () => { apply.disabled = true; void applyFinding(finding, replacement).finally(() => { if (!disposed) apply.disabled = false; }); });
        return apply;
      });
      const dismiss = make("button", "language-check-dismiss"); dismiss.type = "button"; dismiss.textContent = "Schließen";
      dismiss.addEventListener("click", () => { closePanel(); textarea.focus(); });
      panel.append(explanation, ...buttons, dismiss); panel.hidden = false;
      const rect = marks[findings.indexOf(finding)]?.getBoundingClientRect?.() || textarea.getBoundingClientRect();
      const field = textarea.getBoundingClientRect(), width = view.innerWidth || documentRef.documentElement?.clientWidth || 1024;
      const height = view.innerHeight || documentRef.documentElement?.clientHeight || 768;
      panel.style.left = `${Math.max(8, Math.min(rect.left, width - Math.min(360, width - 16) - 8))}px`;
      panel.style.top = `${Math.max(8, Math.min(Math.max(field.top, Math.min(rect.bottom, field.bottom)) + 4, height - (panel.offsetHeight || 120) - 8))}px`;
      if (focus) buttons[0].focus();
    }
    function atCaret() {
      if (textarea.selectionStart !== textarea.selectionEnd) return null;
      const caret = textarea.selectionStart;
      return findings.find(finding => caret >= finding.start && caret <= finding.end) || null;
    }
    listen(textarea, "focus", () => { focused = true; schedule(false); });
    listen(textarea, "blur", event => {
      focused = false;
      if (panel.contains(event.relatedTarget)) return;
      cancelTimer(); active?.controller.abort(); closePanel();
      state(checkedText === textarea.value ? "ready" : "idle");
    });
    listen(textarea, "input", () => schedule());
    listen(textarea, "compositionstart", () => { composing = true; invalidate(); state("idle"); });
    listen(textarea, "compositionend", () => { composing = false; schedule(); });
    listen(textarea, "mouseup", event => { if (event.button !== undefined && event.button !== 0) return;
      const finding = atCaret(); if (finding) openFinding(finding); else closePanel(); });
    listen(textarea, "keydown", event => {
      if (event.key === "Escape") closePanel();
      else if (event.altKey && event.key === "ArrowDown" && checkedText === textarea.value && findings.length) {
        event.preventDefault(); openFinding(atCaret() || findings.find(item => item.start >= textarea.selectionStart) || findings[0], true);
      }
    });
    listen(panel, "keydown", event => { if (event.key === "Escape") { event.preventDefault(); closePanel(); textarea.focus(); } });
    listen(textarea, "scroll", () => { closePanel(); layout(); });
    listen(documentRef, "pointerdown", event => { if (event.target !== textarea && !panel.contains(event.target)) closePanel(); }, true);
    listen(view, "resize", () => { closePanel(); layout(); });
    listen(view, "scroll", event => { if (!panel.contains(event.target)) { closePanel(); layout(); } }, true);
    const Resize = view.ResizeObserver || global.ResizeObserver;
    const resize = Resize ? new Resize(layout) : null; resize?.observe(textarea);
    const Mutation = view.MutationObserver || global.MutationObserver;
    const attributes = Mutation ? new Mutation(() => schedule()) : null;
    attributes?.observe(textarea, { attributes: true, attributeFilter: ["disabled", "readonly", "maxlength"] });
    const unwatch = watchRemoval(documentRef, () => { if (textarea.isConnected === false) dispose(); });
    function dispose() {
      if (disposed) return;
      disposed = true; generation++; cancelTimer(); active?.controller.abort(); applying?.abort();
      for (const remove of listeners) remove(); resize?.disconnect(); attributes?.disconnect(); unwatch(); panel.remove(); status.remove();
      const remaining = (textarea.getAttribute("aria-describedby") || "").split(/\s+/).filter(value => value && value !== status.id);
      if (remaining.length) textarea.setAttribute("aria-describedby", remaining.join(" ")); else textarea.removeAttribute("aria-describedby");
      textarea.removeAttribute("data-language-check-state");
      if (textarea.parentNode === wrapper && wrapper.parentNode) wrapper.parentNode.insertBefore(textarea, wrapper);
      wrapper.remove();
    }
    layout(); paint(); if (focused) schedule(false); else state("idle");
    return Object.freeze({ refresh: () => schedule(), dispose });
  }
  global.SpeciesExplorerLanguageCheck = Object.freeze({ createInlineLanguageCheck });
})(typeof window === "undefined" ? globalThis : window);
