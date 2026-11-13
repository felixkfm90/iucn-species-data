/** Serialized into the Squarespace administration frame. Writes no field values. */
export function squarespacePageSettingsControlsDom({ operation, pageUrl, expected, field } = {}) {
  const focus = operation === "settings-focus";
  const unqualified = focus ? false : null;
  if (!["settings-state", "settings-disable", "settings-save", "settings-focus", "settings-close"].includes(operation)) return null;

  const all = (root, selector) => [...root.querySelectorAll(selector)];
  const text = node => node.textContent.trim().replace(/\s+/gu, " ");
  const enabled = node => node && !node.disabled && node.getAttribute("disabled") === null
    && node.getAttribute("aria-disabled") !== "true";
  function visible(node) {
    if (!node?.getClientRects().length) return false;
    let depth = 0;
    for (let parent = node; parent; parent = parent.parentElement) {
      if (++depth > 100 || parent.hidden || parent.inert || parent.getAttribute("aria-hidden") === "true") return false;
      const style = getComputedStyle(parent);
      if (style.display === "none" || ["hidden", "collapse"].includes(style.visibility) || Number(style.opacity) === 0
          || style.contentVisibility === "hidden") return false;
    }
    return true;
  }
  function path(value) {
    try {
      const url = new URL(value, document.baseURI);
      if (!value || url.username || url.password || url.search || url.hash
          || !["https://vanilla-gerbil-jwnp.squarespace.com", "https://www.fnwildlifetravel.de", "https://fnwildlifetravel.de"].includes(url.origin)) return null;
      return url.pathname;
    } catch { return null; }
  }
  const targetPath = path(pageUrl);
  if (!targetPath || path(document.URL) !== "/config/pages"
      || new URL(document.URL).origin !== "https://vanilla-gerbil-jwnp.squarespace.com") return unqualified;
  const uniqueId = (node, id) => {
    if (!/^[A-Za-z0-9_:-]{1,120}$/.test(id || "")) return false;
    const matches = all(document, `[id="${id}"]`);
    return matches.length === 1 && matches[0] === node;
  };
  const labelFor = (input, dialog) => {
    const labels = [...(input.labels || [])];
    const [label] = labels;
    return labels.length === 1 && label.tagName === "LABEL" && label.control === input
      && dialog.contains(label) && visible(label) ? label : null;
  };
  const fieldNames = { title: "Seitentitel", navigationTitle: "Navigationstitel", slug: "URL-Slug" };
  function read() {
    const dialogs = all(document, '[role="dialog"],[role="alertdialog"],dialog[open]').filter(visible);
    const frames = all(document, "iframe#sqs-site-frame");
    const [dialog] = dialogs, [frame] = frames;
    if (dialogs.length !== 1 || dialog.getAttribute("role") !== "dialog" || frames.length !== 1
        || path(frame.src || frame.getAttribute("src")) !== targetPath) return null;
    const modalId = dialog.getAttribute("data-modal-id");
    const closes = all(dialog, 'button[data-test="nav-modal-close-button"]').filter(visible);
    if (!/^m[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(modalId || "") || closes.length !== 1) return null;

    const fields = {};
    for (const [key, name] of Object.entries(fieldNames)) {
      const candidates = all(dialog, `input[type="text"][aria-label="${name}"]`).filter(visible);
      const [input] = candidates;
      if (candidates.length !== 1 || typeof input.value !== "string" || input.value.length > (key === "slug" ? 1023 : 300)
          || !uniqueId(input, input.getAttribute("id"))) return null;
      const label = labelFor(input, dialog);
      if (!label || label.getAttribute("for") !== input.getAttribute("id") || text(label) !== name) return null;
      fields[key] = input;
    }
    const activationLabels = all(dialog, "p[id]").filter(node => visible(node) && text(node) === "Seite aktivieren");
    const [activationLabel] = activationLabels, activationId = activationLabel?.getAttribute("id");
    if (activationLabels.length !== 1 || !uniqueId(activationLabel, activationId)) return null;
    const switches = all(dialog, `input[type="checkbox"][aria-labelledby="${activationId}"]`).filter(node => node.getClientRects().length);
    const [activation] = switches;
    if (switches.length !== 1 || typeof activation.checked !== "boolean") return null;
    const toggleLabel = labelFor(activation, dialog);
    if (!toggleLabel?.contains(activation)) return null;

    const buttons = all(dialog, 'button,[role="button"]').filter(visible);
    const notices = buttons.filter(button => text(button) === "Diese Seite ist deaktiviert");
    if (activation.checked ? notices.length !== 0 : notices.length !== 1 || notices[0].tagName !== "BUTTON" || enabled(notices[0])) return null;
    const saves = buttons.filter(button => button.getAttribute("data-test") === "nav-modal-left-button" || text(button) === "Speichern"
      || button.getAttribute("aria-label") === "Speichern");
    const [save] = saves;
    const saveType = save?.getAttribute("type");
    // An unavailable dirty form is never reported as a clean dialog.
    if (saves.length > 1 || (save && (save.tagName !== "BUTTON" || save.getAttribute("data-test") !== "nav-modal-left-button"
        || (saveType !== null && saveType !== "submit") || text(save) !== "Speichern" || !enabled(save)))) return null;
    const state = { modalId, title: fields.title.value, navigationTitle: fields.navigationTitle.value,
      slug: fields.slug.value, enabled: activation.checked, saveAvailable: Boolean(save) };
    return { state, dialog, frame, close: closes[0], save, activation, toggleLabel, fields };
  }
  const matches = (state, expectation) => expectation && typeof expectation === "object" && !Array.isArray(expectation)
    && Object.keys(expectation).length === Object.keys(state).length
    && Object.entries(state).every(([key, value]) => Object.hasOwn(expectation, key) && expectation[key] === value);
  function clickPoint(node, isHit = hit => hit === node || node.contains(hit)) {
    if (!enabled(node)) return null;
    const { left, top, right, bottom } = node.getBoundingClientRect();
    const { clientWidth, clientHeight } = document.documentElement;
    if (![left, top, right, bottom, clientWidth, clientHeight].every(Number.isFinite) || left < 0 || top < 0
        || right > clientWidth || bottom > clientHeight || left >= right || top >= bottom) return null;
    const point = { x: Math.floor((left + right) / 2), y: Math.floor((top + bottom) / 2) };
    const hit = document.elementFromPoint(point.x, point.y);
    return hit && isHit(hit) ? { point } : null;
  }

  const bound = read();
  if (!bound) return unqualified;
  const { state } = bound;
  if (operation === "settings-state") return state;
  if (!matches(state, expected)) return unqualified;
  if (operation === "settings-close") return state.saveAvailable ? null : clickPoint(bound.close);
  if (operation === "settings-disable") {
    return state.enabled && !state.saveAvailable
      ? clickPoint(bound.activation, hit => hit === bound.activation || hit === bound.toggleLabel) : null;
  }
  if (operation === "settings-save") {
    const errors = all(bound.dialog, '[role="alert"],[aria-invalid="true"]').some(visible)
      || Object.values(bound.fields).some(input => input.validity?.valid === false);
    return !state.enabled && state.saveAvailable && !errors ? clickPoint(bound.save) : null;
  }
  const input = Object.hasOwn(fieldNames, field) ? bound.fields[field] : null;
  if (state.enabled || !enabled(input) || input.readOnly || input.getAttribute("readonly") !== null
      || input.getAttribute("aria-readonly") === "true") return false;
  input.focus({ preventScroll: true });
  if (document.activeElement !== input) return false;
  input.select();
  const current = read();
  return Boolean(current && current.dialog === bound.dialog && current.frame === bound.frame && current.fields[field] === input
    && matches(current.state, expected) && document.activeElement === input
    && input.selectionStart === 0 && input.selectionEnd === input.value.length);
}
