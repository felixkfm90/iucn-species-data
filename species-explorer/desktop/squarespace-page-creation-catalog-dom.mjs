/** Serialized into the Squarespace administration document. Returns coordinates without dispatching input. */
export function squarespacePageCreationCatalogDom({ operation, expected, previous, reveal = true } = {}) {
  if (!["catalog-state", "catalog-open", "catalog-classic", "catalog-close", "catalog-blank-point",
    "draft-name-state", "draft-select-name"].includes(operation)) return null;

  const admin = "https://vanilla-gerbil-jwnp.squarespace.com";
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
  const unique = (nodes) => nodes.length === 1 ? nodes[0] : null;
  const label = (root, selector, value) => unique(all(root, selector).filter(node => visible(node) && text(node) === value));
  const closeButtons = root => all(root, "button").filter(node => visible(node) && node.textContent === "Schließen");
  const busy = '[aria-busy="true"],[role="progressbar"],progress,[role="alert"],[aria-invalid="true"]';

  function preview() {
    const frame = unique(all(document, "iframe#sqs-site-frame"));
    const source = frame?.getAttribute("src");
    if (!source || source.length > 1000 || frame.getAttribute("srcdoc") !== null || /[\u0000-\u0020\u007f\\]/u.test(source)) return null;
    try {
      const url = new URL(source, admin);
      if (url.username || url.password || url.search || url.hash || frame.src !== url.href
          || (source !== url.pathname && source !== url.href)
          || !/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/u.test(url.pathname)
          || ![admin, "https://www.fnwildlifetravel.de", "https://fnwildlifetravel.de"].includes(url.origin)) return null;
      return url.pathname;
    } catch { return null; }
  }

  function read() {
    const epoch = performance.timeOrigin;
    if (document.URL !== `${admin}/config/pages` || !Number.isFinite(epoch) || epoch <= 0 || all(document, busy).some(visible)) return null;
    const previewPath = preview();
    if (!previewPath) return null;
    const dialogs = all(document, '[role="dialog"],[role="alertdialog"],dialog[open],[aria-modal="true"]').filter(visible);
    if (!dialogs.length) {
      const panel = unique(all(document, '[data-test="pages-panel"]').filter(visible));
      if (!panel || !label(panel, "h1", "Seiten") || all(panel, 'button[aria-label="Suche schließen"]').some(visible)) return null;
      const groups = all(panel, '[data-test="pages-panel-group"]').filter(group => visible(group) && label(group, "h2", "Nicht verlinkt"));
      const group = unique(groups);
      if (!group) return null;
      const open = unique(all(group, "button[title]").filter(node => visible(node)
        && node.getAttribute("title") === "Der Navigationsgruppe „Nicht verlinkt“ eine neue Seite hinzufügen"));
      if (!enabled(open)) return null;
      return { state: { epoch, mode: "closed", modalId: null, previewPath }, open, panel, group };
    }

    const dialog = unique(dialogs);
    const modalId = dialog?.getAttribute("data-modal-id");
    if (!dialog || dialog.getAttribute("role") !== "dialog" || dialog.getAttribute("aria-label") !== "Abschnittskatalog"
        || dialog.getAttribute("data-guidance-engine") !== "guidance-engine-section-catalog"
        || !/^m[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(modalId || "")) return null;
    const blankChoices = all(dialog, 'a[data-test="category-blank_page"][data-allow-link-click="true"]').filter(visible);
    const headings = all(dialog, 'h1,h2,h3,h4,h5,h6,[role="heading"]').filter(visible);
    const classicChoices = all(dialog, 'a[role="button"][data-allow-link-click="true"]').filter(node => visible(node)
      && text(node) === "Erstellt mit dem Klassischen Editor →");
    if (headings.length) {
      const title = unique(headings.filter(node => node.tagName === "H2" && text(node) === "Seite hinzufügen"));
      const add = unique(all(dialog, 'a[data-test="add-blank-options-button"]').filter(visible));
      const classic = unique(classicChoices), close = unique(closeButtons(dialog));
      if (!title || blankChoices.length || !enabled(add) || text(add) !== "Leeres Element hinzufügen"
          || !enabled(classic) || !enabled(close)) return null;
      return { state: { epoch, mode: "pages", modalId, previewPath }, close, classic };
    }

    const blank = unique(blankChoices);
    if (!enabled(blank) || !label(blank, "p", "Eine leere Seite hinzufügen") || classicChoices.length
        || all(dialog, 'a[data-test="add-blank-options-button"]').some(visible)) return null;
    const parent = dialog.parentElement;
    if (parent?.tagName !== "DIV" || parent.children.length !== 2 || closeButtons(dialog).length) return null;
    const header = [...parent.children].find(node => node !== dialog);
    if (header?.tagName !== "DIV" || !visible(header) || header.textContent !== "Kreativer Editor SeitenKlassischer Editor SeitenSchließen") return null;
    const close = unique(closeButtons(header));
    if (!label(header, "button", "Kreativer Editor Seiten") || !enabled(close)) return null;
    return { state: { epoch, mode: "classic", modalId, previewPath }, close, blank };
  }

  const matches = state => expected && typeof expected === "object" && !Array.isArray(expected)
    && Object.keys(expected).length === Object.keys(state).length
    && Object.entries(state).every(([key, value]) => Object.hasOwn(expected, key) && expected[key] === value);
  function clickPoint(node) {
    if (!enabled(node)) return null;
    const { left, top, right, bottom } = node.getBoundingClientRect();
    const { clientWidth, clientHeight } = document.documentElement;
    if (![left, top, right, bottom, clientWidth, clientHeight].every(Number.isFinite) || left < 0 || top < 0
        || right > clientWidth || bottom > clientHeight || left >= right || top >= bottom) return null;
    const point = { x: Math.floor((left + right) / 2), y: Math.floor((top + bottom) / 2) };
    const hit = document.elementFromPoint(point.x, point.y);
    return hit && (hit === node || node.contains(hit)) ? { point } : null;
  }

  const bound = read();
  if (!bound) return null;
  if (operation === "draft-name-state" || operation === "draft-select-name") {
    if (bound.state.mode !== "closed") return null;
    const groupMarker = "pages-panel-group";
    const ordered = all(bound.panel, `[data-test="${groupMarker}"],[aria-roledescription="sortable"]`);
    const groupStart = ordered.indexOf(bound.group);
    if (groupStart < 0) return null;
    const nextGroup = ordered.findIndex((node, index) => index > groupStart && node.getAttribute("data-test") === groupMarker);
    const isVisibleRow = node => node.getAttribute("aria-roledescription") === "sortable" && visible(node);
    const rows = ordered.filter(isVisibleRow);
    // Squarespace renders the group heading separately from its sortable rows.
    const unlinked = ordered.slice(groupStart + 1, nextGroup < 0 ? ordered.length : nextGroup).filter(isVisibleRow);
    const hasSavedPage = unlinked.some(row => all(row, '[data-test="grouped-list-item"]').some(item =>
      all(item, '[data-test="pages-panel-item"]').some(page => all(page, 'button[data-test="collection-settings"][aria-label]')
        .some(settings => settings.getAttribute("aria-label").startsWith("Seiteneinstellungen ")))));
    if (!hasSavedPage) return null;
    const unlinkedRows = new Set(unlinked);
    const outsideTitles = rows.filter(row => !unlinkedRows.has(row)).map(text);
    if (previous && (!Array.isArray(previous.outsideTitles) || previous.outsideTitles.length !== outsideTitles.length
        || !outsideTitles.every((title, index) => title === previous.outsideTitles[index]))) return null;
    const defaultSettingsLabel = "Seiteneinstellungen Neue Seite";
    const defaultSettings = all(bound.panel, `button[data-test="collection-settings"][aria-label="${defaultSettingsLabel}"]`);
    const defaultSettingsPresent = defaultSettings.length > 0;
    const fields = [...new Set(rows.flatMap(row => all(row, 'input,textarea,[contenteditable="true"]')).filter(visible))];
    const field = unique(fields);
    const { epoch, previewPath } = bound.state;
    // Row titles and positions identify the pre-existing rows during this short transition.
    const titles = unlinked.map(text);
    if (!fields.length && operation === "draft-name-state") {
      const settings = unlinked[0] && unique(all(unlinked[0], 'button[data-test="collection-settings"][aria-label]'));
      const firstSettingsLabel = settings?.getAttribute("aria-label") ?? null;
      if (previous && firstSettingsLabel === defaultSettingsLabel && defaultSettings.length !== 1) return null;
      return { epoch, previewPath, rowCount: rows.length, titles, outsideTitles, name: null, firstSettingsLabel, defaultSettingsPresent };
    }
    if (previous?.name !== null || !Array.isArray(previous.titles) || previous.epoch !== epoch || previous.previewPath !== previewPath
        || rows.length !== previous.rowCount + 1 || titles.length !== previous.titles.length + 1
        || !titles.slice(1).every((title, index) => title === previous.titles[index])
        || !field || field.tagName !== "INPUT" || field.type !== "text" || !enabled(field) || field.readOnly
        || document.activeElement !== field || !unlinked[0].contains(field) || typeof field.value !== "string"
        || field.value.length > 160) return null;
    const defaultName = field.value === "Neue Seite" || field.value === ""
      && [field.getAttribute("placeholder"), field.getAttribute("aria-label")].includes("Neue Seite");
    if (operation === "draft-select-name") {
      if (!defaultName) return null;
      field.select();
    }
    return { epoch, previewPath, rowCount: rows.length, titles, outsideTitles, name: field.value, defaultName, defaultSettingsPresent,
      selected: field.selectionStart === 0 && field.selectionEnd === field.value.length };
  }
  if (operation === "catalog-state") return bound.state;
  if (!matches(bound.state)) return null;
  const key = { "catalog-open": "open", "catalog-classic": "classic", "catalog-close": "close", "catalog-blank-point": "blank" }[operation];
  const control = bound[key], point = clickPoint(control);
  if (point || !reveal || typeof control?.scrollIntoView !== "function") return point;
  control.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  const current = read();
  return current?.[key] === control && matches(current.state) ? clickPoint(control) : null;
}
