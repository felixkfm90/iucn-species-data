/** Serialized into the Squarespace administration document. Writes no search value. */
export function squarespacePageSearchDom({ operation, query, expected, reveal = true } = {}) {
  const focus = operation === "search-focus";
  const unknown = focus ? false : null;
  if (!["search-state", "search-open", "search-close", "search-focus"].includes(operation)) return null;
  const all = (root, selector) => [...root.querySelectorAll(selector)];
  const text = node => node.textContent.trim().replace(/\s+/gu, " ");
  const enabled = node => node && !node.disabled && node.getAttribute("disabled") === null
    && node.getAttribute("aria-disabled") !== "true";
  function displayed(node) {
    let depth = 0;
    for (let parent = node; parent; parent = parent.parentElement) {
      if (++depth > 100 || parent.hidden || parent.inert || parent.getAttribute("aria-hidden") === "true") return false;
      const style = getComputedStyle(parent);
      if (style.display === "none" || ["hidden", "collapse"].includes(style.visibility) || Number(style.opacity) === 0
          || style.contentVisibility === "hidden") return false;
    }
    return true;
  }
  const visible = node => node?.getClientRects().length && displayed(node);
  const buttonSelector = 'button[aria-label="Suche öffnen"],button[aria-label="Suche schließen"]';
  const blockers = '[role="dialog"],[role="alertdialog"],dialog[open],[aria-modal="true"],[aria-busy="true"],[role="progressbar"],progress,[role="alert"],[aria-invalid="true"]';

  function read() {
    if (document.URL !== "https://vanilla-gerbil-jwnp.squarespace.com/config/pages"
        || !Number.isFinite(performance.timeOrigin) || performance.timeOrigin <= 0 || all(document, blockers).some(visible)) return null;
    const panels = all(document, '[data-test="pages-panel"]').filter(visible);
    const [panel] = panels;
    if (panels.length !== 1 || all(panel, "h1").filter(node => visible(node) && text(node) === "Seiten").length !== 1) return null;
    const buttons = all(panel, buttonSelector).filter(visible), [button] = buttons;
    const inputs = all(panel, 'input[placeholder="Suche"][autocomplete="off"]'), [input] = inputs;
    if (buttons.length !== 1 || !enabled(button) || inputs.length !== 1 || !enabled(input)
        || !["text", "search"].includes((input.getAttribute("type") ?? "text").toLowerCase())) return null;
    const inputId = input.getAttribute("id"), value = input.value;
    if (!/^[A-Za-z0-9_:-]{1,80}$/.test(inputId || "") || typeof value !== "string" || value.length > 500
        || /[\u0000-\u001f\u007f]/u.test(value) || query !== undefined && query !== value) return null;
    const identified = all(document, `[id="${inputId}"]`);
    if (identified.length !== 1 || identified[0] !== input) return null;

    const open = button.getAttribute("aria-label") === "Suche schließen";
    const clear = all(panel, 'button[aria-label="Suchanfrage löschen"]').filter(visible);
    const notices = all(panel, "p").filter(node => visible(node) && text(node) === "Keine Ergebnisse");
    const hintText = "Versuche es mit anderen Keywords.";
    const hasEmptyIndicator = notices.length > 0 || all(panel, "*").some(node => text(node) === hintText && visible(node));
    let mode;
    if (!open) {
      if (value || clear.length || hasEmptyIndicator) return null;
      mode = "closed";
    } else {
      if (!visible(input) || input.getAttribute("value") !== value) return null;
      if (!value) {
        // Some Squarespace views show the clear button as soon as search opens.
        if (clear.length > 1 || hasEmptyIndicator) return null;
        mode = "empty";
      } else {
        if (clear.length !== 1 || !enabled(clear[0])) return null;
        const markers = all(panel, 'button[data-test="collection-settings"]');
        if (hasEmptyIndicator) {
          const [notice] = notices, parent = notice?.parentElement;
          if (notices.length !== 1 || markers.length || parent?.tagName !== "DIV" || parent.children.length !== 2) return null;
          const hint = [...parent.children].find(node => node !== notice);
          if (!visible(hint) || text(hint) !== hintText) return null;
          mode = "no-results";
        } else {
          if (!markers.length || !markers.every(node => node.getClientRects().length && displayed(node.parentElement))) return null;
          mode = "results";
        }
      }
    }
    return { state: { epoch: performance.timeOrigin, inputId, mode, query: value }, input, panel, button };
  }
  const matches = (state) => expected && typeof expected === "object" && !Array.isArray(expected)
    && Object.keys(expected).length === Object.keys(state).length
    && Object.entries(state).every(([key, value]) => Object.hasOwn(expected, key) && expected[key] === value);
  function clickPoint(button) {
    const { left, top, right, bottom } = button.getBoundingClientRect();
    const { clientWidth, clientHeight } = document.documentElement;
    if (![left, top, right, bottom, clientWidth, clientHeight].every(Number.isFinite) || left < 0 || top < 0
        || right > clientWidth || bottom > clientHeight || left >= right || top >= bottom) return null;
    const point = { x: Math.floor((left + right) / 2), y: Math.floor((top + bottom) / 2) };
    const hit = document.elementFromPoint(point.x, point.y);
    return hit && (hit === button || button.contains(hit)) ? { point } : null;
  }
  const bound = read();
  if (!bound) return unknown;
  const { state, input } = bound;
  if (operation === "search-state") return state;
  if (!matches(state)) return unknown;
  if (operation === "search-open" || operation === "search-close") {
    if ((operation === "search-open") !== (state.mode === "closed")) return null;
    const point = clickPoint(bound.button);
    if (point || !reveal || typeof bound.button.scrollIntoView !== "function") return point;
    bound.button.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    const current = read();
    return current?.panel === bound.panel && current.button === bound.button && current.input === input
      && matches(current.state) ? clickPoint(bound.button) : null;
  }
  if (state.mode === "closed" || input.readOnly || input.getAttribute("readonly") !== null
      || input.getAttribute("aria-readonly") === "true") return false;
  input.focus({ preventScroll: true });
  if (document.activeElement !== input) return false;
  input.select();
  const current = read();
  return Boolean(current && current.panel === bound.panel && current.input === input && matches(current.state)
    && document.activeElement === input && input.selectionStart === 0 && input.selectionEnd === input.value.length);
}
