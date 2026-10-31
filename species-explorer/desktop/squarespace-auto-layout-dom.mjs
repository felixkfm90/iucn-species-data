// Serialized into the observed Squarespace preview/top frame. Keep every helper inside this function.
// Only focus, blur and scrolling are performed here; the driver owns explicit native clicks/text input.
export function squarespaceAutoLayoutDomOperation({ operation, sourceUrl = '', sectionId = '', itemTitle = '', hovered = false }) {
  if (typeof operation !== 'string' || typeof sourceUrl !== 'string' || sourceUrl.length > 8192
      || typeof sectionId !== 'string' || typeof itemTitle !== 'string' || itemTitle.length > 500) return null;
  const all = (root, selector) => [...root.querySelectorAll(selector)];
  const text = el => String(el?.innerText ?? el?.textContent ?? '');
  const rawText = el => String(el?.textContent ?? el?.innerText ?? '');
  const compact = value => String(value ?? '').replace(/\s+/gu, ' ').trim();
  const normal = value => compact(value).toLocaleLowerCase('de-DE');
  const attr = (el, name) => el?.getAttribute(name);
  const visible = el => {
    if (!el || !el.getClientRects().length) return false;
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || style.opacity === '0'
          || attr(node, 'hidden') !== null || attr(node, 'aria-hidden') === 'true') return false;
    }
    return true;
  };
  const enabled = el => visible(el) && el.disabled !== true && el.readOnly !== true
    && attr(el, 'disabled') === null && attr(el, 'readonly') === null && attr(el, 'aria-disabled') !== 'true'
    && attr(el, 'aria-readonly') !== 'true' && !el.closest('fieldset[disabled]');
  const canonical = value => {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value, document.baseURI);
      if (url.protocol !== 'https:' || url.username || url.password || url.port
          || [...url.searchParams.keys()].some(key => /token|secret|password|credential|signature|x-amz|x-goog/i.test(key))) return '';
      if (['images.squarespace-cdn.com', 'static1.squarespace.com'].includes(url.hostname)) url.searchParams.delete('format');
      url.searchParams.sort(); url.hash = ''; return url.href;
    } catch { return ''; }
  };
  const expectedSource = /^https:\/\//i.test(sourceUrl) ? canonical(sourceUrl) : '';
  const imageSource = img => {
    const value = img.currentSrc || attr(img, 'src') || attr(img, 'data-src') || '';
    const source = canonical(value), declared = attr(img, 'data-src');
    return source && (!declared || canonical(declared) === source) ? source : '';
  };
  const labelledBy = el => {
    const ids = compact(attr(el, 'aria-labelledby')).split(' ').filter(Boolean);
    if (!ids.length || ids.length > 8) return '';
    const nodes = [];
    for (const id of ids) {
      const matches = all(document, '[id]').filter(node => attr(node, 'id') === id);
      if (matches.length !== 1) return '';
      nodes.push(matches[0]);
    }
    return nodes.map(text).join(' ');
  };
  const name = el => compact(attr(el, 'aria-label') || labelledBy(el) || text(el));
  const controlName = (el, expected) => [name(el), attr(el, 'title')].some(value => normal(value) === normal(expected));
  const controls = root => all(root, 'button,[role="button"]');
  const viewport = () => ({ width: globalThis.innerWidth || document.documentElement?.clientWidth,
    height: globalThis.innerHeight || document.documentElement?.clientHeight });
  const point = (el, avoidNested = false, scroll = true) => {
    if (!enabled(el) || getComputedStyle(el).pointerEvents === 'none') return null;
    if (scroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    const rect = el.getBoundingClientRect(), size = viewport();
    if (![rect.left, rect.top, rect.right, rect.bottom, rect.width, rect.height, size.width, size.height].every(Number.isFinite)
        || rect.width <= 0 || rect.height <= 0 || size.width <= 0 || size.height <= 0) return null;
    let left = Math.max(0, rect.left), right = Math.min(size.width, rect.right), top = Math.max(0, rect.top), bottom = Math.min(size.height, rect.bottom);
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
      if (['hidden', 'clip', 'scroll', 'auto'].includes(css.overflowX || css.overflow)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
      if (['hidden', 'clip', 'scroll', 'auto'].includes(css.overflowY || css.overflow)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
    }
    if (right - left < 2 || bottom - top < 2) return null;
    for (const fraction of [0.5, 0.3, 0.7, 0.15]) {
      const result = { x: Math.floor(left + (right - left) * fraction), y: Math.floor((top + bottom) / 2) };
      const hit = document.elementFromPoint?.(result.x, result.y);
      if (!hit || hit !== el && !el.contains(hit)) continue;
      if (avoidNested) {
        const nested = hit.closest('button,[role="button"],a,input,textarea,[contenteditable="true"]');
        if (nested && nested !== el && el.contains(nested)) continue;
      }
      return result;
    }
    return null;
  };
  const dialogs = () => all(document, '[role="dialog"],[role="alertdialog"],[aria-modal="true"]').filter(visible);
  const dialog = () => {
    const nodes = dialogs();
    return nodes.length === 1 && attr(nodes[0], 'role') === 'dialog'
      && normal(name(nodes[0])) === 'formular zur abschnittsbearbeitung' ? nodes[0] : null;
  };
  if (operation === 'dialog-closed') return dialogs().length === 0;
  if (operation === 'bind-section') {
    if (!expectedSource) return null;
    const mains = all(document, 'main#page').filter(visible);
    if (mains.length !== 1 || mains[0].closest('header,footer')) return null;
    const matches = [];
    for (const section of all(mains[0], 'section[data-sqsp-section="auto-layout"][data-section-id]').filter(visible)) {
      const id = attr(section, 'data-section-id');
      if (!/^[a-f0-9]{24}$/i.test(id || '') || section.closest('header,footer') || sectionId && sectionId !== id) continue;
      for (const img of all(section, 'img.list-image').filter(visible)) {
        const item = img.closest('li.list-item'), list = item?.closest('ul.user-items-list-simple');
        if (!item || !list || !section.contains(list) || imageSource(img) !== expectedSource) continue;
        const titles = all(item, 'h2.list-item-content__title').filter(visible);
        if (titles.length !== 1 || !compact(rawText(titles[0])) || itemTitle && compact(rawText(titles[0])) !== compact(itemTitle)) continue;
        matches.push({ section, img, item, title: compact(rawText(titles[0])), id });
      }
    }
    if (matches.length !== 1) return null;
    const match = matches[0];
    const duplicateTitles = all(match.section, 'h2.list-item-content__title').filter(el => visible(el) && compact(rawText(el)) === match.title);
    if (duplicateTitles.length !== 1) return null;
    const location = point(match.img) || point(match.item);
    return location ? { sectionId: match.id, itemTitle: match.title, sourceUrl: match.img.currentSrc || attr(match.img, 'src') || attr(match.img, 'data-src'),
      alt: attr(match.img, 'alt') ?? '', caption: '', point: location, viewport: viewport() } : null;
  }
  if (operation === 'content-control' || operation === 'content-control-diagnostic') {
    // The native editor's portal ID can differ from the public section ID.
    // Its sole visible content control is usable only after the caller's source-bound hover.
    const buttons = controls(document).filter(el => visible(el) && controlName(el, 'INHALT BEARBEITEN'));
    const portalFor = button => {
      const found = [];
      for (let current = button.parentElement; current; current = current.parentElement) {
        if (/^page-region-[a-f0-9]{24}-section-editor-ui-mount$/i.test(attr(current, 'id') || '')) found.push(current);
      }
      return found.length === 1 && visible(found[0]) && !button.closest('header,footer') ? found[0] : null;
    };
    const bound = buttons.map(button => ({ button, portal: portalFor(button) })).filter(entry => entry.portal);
    if (operation === 'content-control-diagnostic') return {
      hoverConfirmed: hovered === true, publicSectionIdValid: /^[a-f0-9]{24}$/i.test(sectionId),
      dialogCount: Math.min(dialogs().length, 20), visibleContentButtons: Math.min(buttons.length, 20),
      portalControls: Math.min(bound.length, 20), validPortalCount: Math.min(new Set(bound.map(entry => entry.portal)).size, 20),
      enabledPortalControls: Math.min(bound.filter(entry => enabled(entry.button)).length, 20),
    };
    if (hovered !== true || !/^[a-f0-9]{24}$/i.test(sectionId) || dialogs().length || bound.length !== 1) return null;
    const location = point(bound[0].button); return location ? { point: location } : null;
  }
  const editor = dialog();
  const dragControl = el => Boolean(el && (attr(el, 'draggable') === 'true'
    || /\b(sortable|draggable|sortierbar|ziehbar)\b/.test(normal(attr(el, 'aria-roledescription')))));
  const itemCandidates = () => !editor || !expectedSource || !compact(itemTitle) ? [] : controls(editor)
    .filter(button => visible(button) && controlName(button, itemTitle)
      && all(button, 'img').filter(img => visible(img) && imageSource(img) === expectedSource).length === 1
      && all(button, 'img').filter(img => visible(img) && imageSource(img)).every(img => imageSource(img) === expectedSource));
  const innerCandidates = candidates => candidates.filter(button => !candidates.some(child => child !== button && button.contains(child)));
  const fieldSelector = 'input,textarea,[contenteditable="true"],[contenteditable=""]';
  const labels = { alt: ['bild-alternativtext', 'bildalternativtext', 'alternativtext', 'image alt text', 'alt text'],
    title: ['titel', 'title'], description: ['beschreibung', 'description'] };
  const roleFor = value => Object.keys(labels).find(key => labels[key].includes(normal(value))) || null;
  const editableType = field => field.tagName?.toLowerCase() === 'textarea' || field.matches('[contenteditable="true"],[contenteditable=""]')
    || field.tagName?.toLowerCase() === 'input' && ['text', ''].includes(String(field.type ?? attr(field, 'type') ?? '').toLowerCase());
  const labelText = node => {
    if (!node.childNodes) return text(node);
    return [...node.childNodes].map(child => child.nodeType === 3 ? child.nodeValue || ''
      : child.nodeType === 1 && !child.matches('input,textarea,select,button,[contenteditable="true"],[contenteditable=""]')
        ? labelText(child) : '').join(' ');
  };
  const fieldRole = field => {
    const semantic = [attr(field, 'aria-label'), labelledBy(field)];
    const id = attr(field, 'id');
    if (id && editor) semantic.push(...all(editor, 'label').filter(label => attr(label, 'for') === id && visible(label)).map(text));
    const semanticNames = semantic.filter(value => compact(value));
    const semanticRoles = [...new Set(semanticNames.map(roleFor).filter(Boolean))];
    if (!editor) return null;
    const nearby = [];
    for (const label of all(editor, '*').filter(el => visible(el) && roleFor(labelText(el))
        && !el.closest(fieldSelector))) {
      // Rosetta can lay several label/field pairs out as siblings in one grid.
      // Bind only the immediately following, single editable field container.
      for (let carrier = label; carrier && carrier !== editor && !carrier.contains(field)
          && roleFor(labelText(carrier)) === roleFor(labelText(label))
          && !all(carrier, fieldSelector).some(candidate => visible(candidate) && editableType(candidate)); carrier = carrier.parentElement) {
        const next = carrier.nextElementSibling;
        if (!next || !(next === field || next.contains(field))) continue;
        const adjacent = [...new Set([...(next.matches(fieldSelector) ? [next] : []), ...all(next, fieldSelector)])]
          .filter(candidate => visible(candidate) && editableType(candidate));
        nearby.push(adjacent.length === 1 && adjacent[0] === field ? roleFor(labelText(label)) : 'ambiguous');
      }
      let group = label.contains(field) ? label : label.parentElement;
      while (group && group !== editor && !group.contains(field)) group = group.parentElement;
      if (!group || group === editor) continue;
      const fields = all(group, fieldSelector).filter(candidate => visible(candidate) && editableType(candidate));
      if (fields.length === 1 && fields[0] === field) nearby.push(roleFor(labelText(label)));
      else if (fields.length > 1) {
        const groupRoles = new Set(all(group, 'label,span,p,div').filter(el => visible(el)
          && !el.closest(fieldSelector)).map(el => roleFor(labelText(el))).filter(Boolean));
        if (groupRoles.size === 1) nearby.push('ambiguous');
      }
    }
    const roles = [...new Set(nearby)];
    if (roles.includes('ambiguous') || roles.length > 1 || semanticRoles.length > 1) return 'ambiguous';
    if (semanticNames.some(value => !roleFor(value))) return roles.length || semanticRoles.length ? 'ambiguous' : null;
    if (semanticRoles.length && roles.length && semanticRoles[0] !== roles[0]) return 'ambiguous';
    return semanticRoles[0] || roles[0] || null;
  };
  if (operation === 'field-diagnostic') {
    const fields = editor ? all(editor, fieldSelector).slice(0, 20) : [];
    const sourceImages = editor && expectedSource ? all(editor, 'img').filter(img => visible(img) && imageSource(img) === expectedSource) : [];
    const exactTitleControls = editor && compact(itemTitle) ? controls(editor).filter(el => visible(el) && controlName(el, itemTitle)) : [];
    const candidates = itemCandidates(), inner = innerCandidates(candidates);
    const shape = el => !el ? null : {
      tag: ['img', 'picture', 'button', 'div', 'span', 'li', 'ul', 'section', 'svg', 'path', 'a', 'input'].includes(el.tagName?.toLowerCase()) ? el.tagName.toLowerCase() : 'other',
      role: ['button', 'img', 'group', 'list', 'listitem', 'dialog', 'tab'].includes(attr(el, 'role')) ? attr(el, 'role') : attr(el, 'role') ? 'other' : null,
      visible: visible(el), exactTitleControl: Boolean(el.matches('button,[role="button"]') && compact(itemTitle) && controlName(el, itemTitle)), dragControl: dragControl(el),
    };
    const geometry = el => {
      const rect = el.getBoundingClientRect(), size = viewport();
      const x = Math.floor((rect.left + rect.right) / 2), y = Math.floor((rect.top + rect.bottom) / 2);
      const hit = Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x < size.width && y < size.height
        ? document.elementFromPoint?.(x, y) : null;
      const control = hit?.closest('button,[role="button"],a,input,textarea,[contenteditable="true"]');
      return { point: point(el, true, false), centerHit: shape(hit), hitWithinControl: Boolean(hit && (hit === el || el.contains(hit))),
        hitIsNestedControl: Boolean(control && control !== el && el.contains(control)), hitIsDragControl: dragControl(control),
        hitIsRemoveControl: Boolean(control && /\b(entfernen|löschen|delete|remove|trash)\b/.test(normal(name(control)))) };
    };
    const sourceControls = sourceImages.slice(0, 3).map(img => {
      const nearest = img.closest('button,[role="button"]'), chain = [];
      for (let node = img; node && node !== editor && chain.length < 8; node = node.parentElement) {
        chain.push({ ...shape(node), sourceImageCount: Math.min((node === img ? 1 : 0) + all(node, 'img').filter(candidate => visible(candidate) && imageSource(candidate) === expectedSource).length, 20),
          exactTitleControls: Math.min(controls(node).filter(control => visible(control) && controlName(control, itemTitle)).length, 20),
          exactTitleControlsContainingImage: Math.min(controls(node).filter(control => visible(control) && controlName(control, itemTitle) && control.contains(img)).length, 20) });
      }
      return { nearestControl: nearest && editor.contains(nearest) ? { ...shape(nearest), containsSourceImage: true, ...geometry(nearest) } : null,
        parentChain: chain };
    });
    return { dialogCount: Math.min(dialogs().length, 20), boundDialog: Boolean(editor), fields: fields.map(field => ({
      tag: ['input', 'textarea', 'div', 'p', 'span'].includes(field.tagName?.toLowerCase()) ? field.tagName.toLowerCase() : 'other',
      type: ['text', 'hidden', 'password', 'search', 'email', 'url', 'number'].includes(field.type) ? field.type : 'other',
      label: fieldRole(field) || 'unbound', visible: visible(field), editableType: editableType(field), readonly: field.readOnly === true || attr(field, 'readonly') !== null,
      disabled: field.disabled === true || attr(field, 'disabled') !== null, idPresent: Boolean(attr(field, 'id')),
      ariaLabelPresent: Boolean(attr(field, 'aria-label')), labelledByPresent: Boolean(attr(field, 'aria-labelledby')),
      attributes: ['type', 'id', 'for', 'role', 'aria-label', 'aria-labelledby', 'readonly', 'disabled', 'contenteditable'].filter(key => attr(field, key) !== null),
    })), previewImageCount: Math.min(editor ? all(editor, 'img').filter(visible).length : 0, 20),
    sourceMatches: Math.min(sourceImages.length, 20), sourceControls,
    selection: { matchingControls: Math.min(candidates.length, 20), innermostControls: Math.min(inner.length, 20),
      exactTitleControls: Math.min(exactTitleControls.length, 20),
      controls: exactTitleControls.slice(0, 8).map(control => ({ ...shape(control), containsSourceImage: sourceImages.some(img => control.contains(img)), ...geometry(control) })) } };
  }
  if (!editor) return null;
  if (operation === 'content-tab') {
    const tabs = all(editor, '[role="tab"]').filter(el => controlName(el, 'Inhalt') && visible(el));
    if (tabs.length !== 1) return null;
    const location = point(tabs[0]); return location ? { point: location } : null;
  }
  if (operation === 'select-item') {
    if (!expectedSource || !compact(itemTitle)) return null;
    const candidates = innerCandidates(itemCandidates());
    if (candidates.length !== 1 || dragControl(candidates[0])) return null;
    const location = point(candidates[0], true); return location ? { point: location } : null;
  }
  if (!['alt-field', 'focus-alt', 'blur-alt', 'back-item'].includes(operation) || !expectedSource || !compact(itemTitle)) return null;
  const previews = all(editor, 'img').filter(img => visible(img) && imageSource(img));
  if (previews.length !== 1 || imageSource(previews[0]) !== expectedSource) return null;
  const fields = all(editor, fieldSelector).filter(field => visible(field) && editableType(field));
  const alt = fields.filter(field => fieldRole(field) === 'alt'), titles = fields.filter(field => fieldRole(field) === 'title'), descriptions = fields.filter(field => fieldRole(field) === 'description');
  if (alt.length !== 1 || titles.length !== 1 || descriptions.length !== 1 || fields.some(field => fieldRole(field) === 'ambiguous')
      || !['INPUT', 'TEXTAREA'].includes(alt[0].tagName) || titles[0].tagName !== 'INPUT'
      || !enabled(alt[0]) || !enabled(titles[0]) || !enabled(descriptions[0]) || String(titles[0].value ?? '') !== itemTitle) return null;
  const field = alt[0], description = descriptions[0].matches('[contenteditable="true"],[contenteditable=""]') ? text(descriptions[0]) : String(descriptions[0].value ?? '');
  if (operation === 'back-item') {
    const backs = controls(editor).filter(button => visible(button) && (controlName(button, 'Zurück') || controlName(button, `Zurück ${itemTitle}`)));
    const leaves = backs.filter(button => !backs.some(child => child !== button && button.contains(child)));
    if (leaves.length !== 1) return null;
    const location = point(leaves[0]); return location ? { point: location } : null;
  }
  if (!point(field)) return null;
  if (operation === 'focus-alt') { field.focus({ preventScroll: true }); if (document.activeElement !== field) return null; }
  if (operation === 'blur-alt') { field.blur(); if (document.activeElement === field) return null; }
  return { sourceUrl: previews[0].currentSrc || attr(previews[0], 'src') || attr(previews[0], 'data-src'), alt: String(field.value ?? ''), caption: '',
    isAltField: true, editable: true, title: String(titles[0].value ?? ''), description };
}
