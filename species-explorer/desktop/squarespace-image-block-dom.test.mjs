import assert from "node:assert/strict";
import vm from "node:vm";
import test from "node:test";
import { squarespaceImageBlockDomOperation } from "./squarespace-image-block-dom.mjs";

const SOURCE = "https://images.squarespace-cdn.com/content/v1/site/image/IMG_8071.JPG";
const OTHER = SOURCE.replace("IMG_8071", "IMG_9000"), BLOCK = "block-ac1492f50a3605e8d31c";
const plain = (value) => value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));

// Native-DOM-shaped tree fixtures, following the existing gallery tests. CSS
// layout/hit tests are explicit deterministic fixtures, not Chromium proof.
function domFixture({ innerWidth, innerHeight } = {}) {
  const calls = [], rect = (left = 0, top = 0, width = 1200, height = 900) => ({ x: left, y: top, left, top, width, height, right: left + width, bottom: top + height });
  const style = (node) => ({ display: "block", visibility: "visible", opacity: "1", pointerEvents: "auto", backgroundImage: "none", contentVisibility: "visible",
    overflow: "visible", ...node.css, overflowX: node.css.overflowX || node.css.overflow || "visible", overflowY: node.css.overflowY || node.css.overflow || "visible" });
  const matches = (node, selector) => selector.split(",").some((candidate) => {
    const value = candidate.trim(), tag = value.match(/^[a-z][\w-]*/iu)?.[0], id = value.match(/#([\w-]+)/u)?.[1];
    if (tag && node.tagName !== tag.toUpperCase() || id && node.getAttribute("id") !== id) return false;
    for (const attr of value.matchAll(/\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/gu)) {
      const expected = attr[2] ?? attr[3] ?? attr[4], actual = node.getAttribute(attr[1]);
      if (actual === null || expected !== undefined && actual !== expected) return false;
    }
    return true;
  });
  const textNode = (value) => ({ nodeType: 3, nodeValue: value, get textContent() { return value; } });
  let document;
  function element(tag, { attrs = {}, css = {}, box = rect(), text = "", value = "" } = {}, children = []) {
    let stored = value;
    const node = { nodeType: 1, tagName: tag.toUpperCase(), attrs: { ...attrs }, css, rect: box, childNodes: [], parentNode: null,
      get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; },
      get children() { return this.childNodes.filter((child) => child.nodeType === 1); },
      get textContent() { return this.childNodes.map((child) => child.textContent).join(""); }, get innerText() { return this.textContent; },
      getAttribute(name) { return Object.hasOwn(this.attrs, name) ? this.attrs[name] : null; }, hasAttribute(name) { return Object.hasOwn(this.attrs, name); },
      setAttribute(name, value) { this.attrs[name] = String(value); }, removeAttribute(name) { delete this.attrs[name]; },
      getClientRects() { return style(this).display === "none" ? [] : [this.rect]; }, getBoundingClientRect() { return this.rect; },
      matches(selector) { return matches(this, selector); },
      querySelectorAll(selector) { return this.children.flatMap((child) => [...(matches(child, selector) ? [child] : []), ...child.querySelectorAll(selector)]); },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      closest(selector) { for (let current = this; current; current = current.parentElement) if (matches(current, selector)) return current; return null; },
      contains(target) { return target === this || this.children.some((child) => child.contains(target)); },
      append(...added) { for (const child of added) { child.parentNode = this; this.childNodes.push(child); } },
      getRootNode() { let root = this; while (root.parentNode) root = root.parentNode; return root; },
      scrollIntoView(options) { calls.push({ operation: "scroll", node: this, options }); this.onScroll?.(options); },
      focus() { calls.push({ operation: "focus", node: this }); document.activeElement = this; },
      blur() { calls.push({ operation: "blur", node: this }); if (document.activeElement === this) document.activeElement = document.body; },
      get value() { return stored; }, set value(next) { calls.push({ operation: "value-write", node: this }); stored = next; },
    };
    if (tag === "img") Object.defineProperties(node, { src: { get: () => node.getAttribute("src") || "" }, currentSrc: { value: attrs.src || "", writable: true } });
    if (text) node.append(textNode(text)); node.append(...children); return node;
  }
  const html = element("html"), body = element("body"); html.append(body); html.clientWidth = 1200; html.clientHeight = 900;
  document = { nodeType: 9, baseURI: "https://vanilla-gerbil-jwnp.squarespace.com/config/pages", documentElement: html, body,
    querySelectorAll(selector) { return [...(matches(html, selector) ? [html] : []), ...html.querySelectorAll(selector)]; },
    contains(node) { return html.contains(node); }, getElementById(id) { return this.querySelectorAll("[id]").find((node) => node.getAttribute("id") === id) || null; },
    elementFromPoint(x, y) {
      if (this.hitTest) return this.hitTest(x, y);
      return this.querySelectorAll("*").filter((node) => {
        const box = node.rect;
        return style(node).display !== "none" && style(node).visibility === "visible" && x >= box.left && x < box.right && y >= box.top && y < box.bottom;
      }).at(-1) || null;
    },
  };
  html.parentNode = document; document.activeElement = body;
  const operation = vm.runInNewContext(`(${squarespaceImageBlockDomOperation.toString()})`, { document, URL, innerWidth, innerHeight, getComputedStyle: style });
  return { document, element, rect, calls, run(input) { return plain(operation(input)); } };
}
function blockFixture(options) {
  const f = domFixture(options), main = f.element("main", { attrs: { id: "page" } }), image = f.element("img", { attrs: { src: SOURCE + "?format=1000w", alt: "Bisheriger Text aus genau diesem Bildblock" }, box: f.rect(100, 150, 400, 300) });
  const block = f.element("div", { attrs: { id: BLOCK, "data-sqsp-block": "image" }, box: f.rect(90, 140, 420, 340) }, [image]);
  main.append(block); f.document.body.append(main);
  return { ...f, main, block, image, bind(extra = {}) { return f.run({ operation: "bind-block", sourceUrl: SOURCE, ...extra }); } };
}
function editorFixture({ mapping = "aria", cssPreview = false } = {}) {
  const f = domFixture(), dialog = f.element("div", { attrs: { role: "dialog", "aria-label": "Block-Editor-Formular" }, box: f.rect(80, 80, 1000, 720) });
  const field = f.element("input", { attrs: { id: "image-alt-input", type: "text", ...(mapping === "aria" ? { "aria-label": "BILD-ALTERNATIVTEXT" } : {}) }, value: "Eigener bisheriger Bild-Alternativtext", box: f.rect(500, 500, 400, 40) });
  const filename = f.element("input", { attrs: { id: "image-file-input", type: "text", "aria-label": "ALTERNATIVER DATEINAME" }, value: "IMG_8071.JPG", box: f.rect(500, 420, 400, 40) });
  const preview = cssPreview ? f.element("div", { css: { backgroundImage: `url("${SOURCE}?format=500w")` }, box: f.rect(120, 150, 300, 230) })
    : f.element("img", { attrs: { src: SOURCE + "?format=500w" }, box: f.rect(120, 150, 300, 230) });
  const label = f.element("label", { attrs: { id: "image-alt-label", ...(mapping === "for" ? { for: "image-alt-input" } : {}) }, text: "BILD-ALTERNATIVTEXT", box: f.rect(500, 470, 400, 25) });
  if (mapping === "labelledby") field.setAttribute("aria-labelledby", "image-alt-label");
  if (mapping === "wrapping") label.append(field);
  dialog.append(preview, filename, label); if (mapping !== "wrapping") dialog.append(field);
  f.document.body.append(dialog);
  return { ...f, dialog, field, filename, preview, label,
    inspect(operation = "alt-field") { return f.run({ operation, sourceUrl: SOURCE }); } };
}

test("serialisierte Bindung liefert nur den konkreten Inhaltsbildblock, seine lokalen Texte und einen geprüften Punkt", () => {
  const f = blockFixture(), footer = f.element("footer", { box: f.rect(0, 780, 1200, 100) }, [f.element("img", { attrs: { src: SOURCE, alt: "Anderer Footertext" }, box: f.rect(20, 790, 40, 40) })]); f.document.body.append(footer);
  const bound = f.bind(); assert.equal(bound.blockId, BLOCK); assert.equal(bound.sourceUrl, SOURCE); assert.equal(bound.alt, "Bisheriger Text aus genau diesem Bildblock");
  assert.equal(bound.caption, ""); assert.deepEqual(bound.viewport, { width: 1200, height: 900 }); assert.ok(bound.point.x >= 100 && bound.point.x < 500);
  assert.equal(f.calls.some((call) => call.operation === "value-write"), false);
});

test("Bildpunkt meldet den Frameviewport einschließlich Scrollbar für die vorhandene native Projektion", () => {
  const f = blockFixture({ innerWidth: 1217, innerHeight: 917 });
  assert.deepEqual(f.bind().viewport, { width: 1217, height: 917 });
});

test("ein Bild unterhalb der Ansicht wird ohne CSS-Scrollanimation vor der Punktmessung zentriert", () => {
  const f=blockFixture();f.image.rect=f.rect(100,1800,400,300);f.block.rect=f.rect(90,1790,420,340);
  f.image.onScroll=options=>{if(options?.behavior==='instant' && options.block==='center') {
    f.image.rect=f.rect(100,250,400,300);f.block.rect=f.rect(90,240,420,340);
  }};
  const result=f.bind();assert.ok(result?.point);assert.equal(result.point.y,400);
});

test("Formatparameter allein dürfen abweichen, andere Quellen-/Queryteile und widersprüchliche Srcvarianten stoppen", () => {
  const f = blockFixture(); assert.ok(f.bind({ sourceUrl: SOURCE + "?format=original" }));
  assert.equal(f.bind({ sourceUrl: SOURCE + "?crop=1" }), null); assert.equal(f.bind({ sourceUrl: OTHER }), null);
  f.image.setAttribute("data-src", OTHER); assert.equal(f.bind(), null);
  const diag = f.run({ operation: "field-diagnostic", sourceUrl: SOURCE }); assert.equal(diag.counts.sourceConflicts, 1); assert.equal(diag.counts.bodyMatches, 1);
});

test("doppelte Quellblöcke, Mainbereiche, Blockkennungen und sichtbare Bildkonflikte werden nicht geraten", () => {
  for (const mode of ["source", "main", "id", "image"]) {
    const f = blockFixture();
    if (mode === "source") f.main.append(f.element("div", { attrs: { id: "block-another", "data-sqsp-block": "image" } }, [f.element("img", { attrs: { src: SOURCE, alt: "Andere Verwendung" } })]));
    if (mode === "main") f.document.body.append(f.element("main", { attrs: { id: "page" } }));
    if (mode === "id") f.document.body.append(f.element("span", { attrs: { id: BLOCK } }));
    if (mode === "image") f.block.append(f.element("img", { attrs: { src: OTHER, alt: "Zweites Bild" } }));
    assert.equal(f.bind(), null, mode);
  }
});

test("Galerie-, Header- und Footerblöcke sind ausgeschlossen; Diagnose bleibt auch im Vorschauframe brauchbar", () => {
  for (const location of ["header", "footer", "gallery"]) {
    const f = blockFixture(); f.main.childNodes = [];
    const parent = f.element(location === "gallery" ? "section" : location, { attrs: location === "gallery" ? { "data-sqsp-section": "gallery" } : {} }, [f.block]); f.main.append(parent);
    assert.equal(f.bind(), null); const diag = f.run({ operation: "field-diagnostic", sourceUrl: SOURCE });
    assert.equal(diag.counts.bodyMatches, 1); assert.equal(diag.counts.eligibleBlocks, 0); assert.deepEqual(diag.fields, []);
  }
});

test("sichtbare Teilflächen werden geclippt und getroffen; verdeckte, winzige und interaktive Treffer stoppen", () => {
  const f = blockFixture(); f.block.css.overflow = "hidden"; f.block.rect = f.rect(100, 200, 150, 100);
  f.document.hitTest = () => f.image;
  const bound = f.bind(); assert.ok(bound.point.x >= 100 && bound.point.x < 250); assert.ok(bound.point.y >= 200 && bound.point.y < 300);
  const overlay = f.element("button", { text: "Entfernen" }); f.document.hitTest = () => overlay; assert.equal(f.bind(), null);
  f.document.hitTest = () => f.image; f.block.rect = f.rect(0, 0, 0.5, 0.5); assert.equal(f.bind(), null);
  f.block.rect = f.rect(100, 200, 150, 100); f.block.css.opacity = "0"; assert.equal(f.bind(), null);
});

test("fehlendes Altattribut ist ein blocklokal leerer Ausgangstext; mehrere Beschriftungen sind mehrdeutig", () => {
  const f = blockFixture(); f.image.removeAttribute("alt"); assert.equal(f.bind().alt, "");
  f.block.append(f.element("figcaption", { text: "Beschriftung ohne Punkt", box: f.rect(100, 455, 400, 20) })); assert.equal(f.bind().caption, "Beschriftung ohne Punkt");
  f.block.append(f.element("figcaption", { text: "Andere Beschriftung", box: f.rect(100, 480, 400, 20) })); assert.equal(f.bind(), null);
});

test("beobachtetes pointer-events:none des Bildes darf auf genau seinen aktiven Bildblock durchreichen", () => {
  const f = blockFixture(); f.image.css.pointerEvents = "none";
  f.document.hitTest = () => f.block;
  assert.equal(f.bind()?.blockId, BLOCK);
  f.block.css.pointerEvents = "none";
  assert.equal(f.bind(), null, "Der Block selbst muss bedienbar bleiben");
  f.block.css.pointerEvents = "auto";
  const foreign = f.element("div", { attrs: { "data-sqsp-block": "image", id: "block-foreign" } });
  f.document.hitTest = () => foreign;
  assert.equal(f.bind(), null, "Ein fremder Bildblock wird nicht angeklickt");
  const control = f.element("button", { text: "Entfernen" }); f.block.append(control);
  f.document.hitTest = () => control;
  assert.equal(f.bind(), null, "Eine überlagernde Aktion bleibt gesperrt");
});

test("Menüoperation liefert ausschließlich Bearbeiten im eindeutigen beobachteten Dreiermenü", () => {
  const f = domFixture(), edit = f.element("button", { attrs: { "aria-label": "Bearbeiten" }, box: f.rect(500, 200, 100, 40) });
  const menu = f.element("div", { attrs: { role: "menu" } }, [edit,
    f.element("button", { text: "Duplizieren", box: f.rect(500, 250, 100, 40) }), f.element("button", { text: "Entfernen", box: f.rect(500, 300, 100, 40) })]); f.document.body.append(menu);
  f.document.hitTest = () => edit; assert.deepEqual(f.run({ operation: "edit-block-control" }), { point: { x: 550, y: 220 } });
  edit.disabled = true; assert.equal(f.run({ operation: "edit-block-control" }), null); edit.disabled = false;
  f.document.hitTest = () => menu; assert.equal(f.run({ operation: "edit-block-control" }), null);
  f.document.hitTest = () => edit; menu.append(f.element("button", { text: "Bearbeiten" })); assert.equal(f.run({ operation: "edit-block-control" }), null);
  assert.deepEqual(f.calls.filter((call) => !["scroll"].includes(call.operation)), []);
});

test("ein generisches Bearbeiten außerhalb des Menüs oder ohne Lösch-/Duplizieren-Zeugen ist kein Ziel", () => {
  const f = domFixture(); f.document.body.append(f.element("button", { text: "Bearbeiten" })); assert.equal(f.run({ operation: "edit-block-control" }), null);
  f.document.body.append(f.element("div", { attrs: { role: "menu" } }, [f.element("button", { text: "Bearbeiten" }), f.element("button", { text: "Entfernen" })]));
  assert.equal(f.run({ operation: "edit-block-control" }), null);
});

test("Altfield unterstützt Aria-, For-, Wrapping- und Labelledby-Zuordnung ohne das Dateinamenfeld zu verwechseln", () => {
  for (const mapping of ["aria", "for", "wrapping", "labelledby"]) {
    const f = editorFixture({ mapping }); assert.deepEqual(f.inspect(), { sourceUrl: SOURCE, alt: "Eigener bisheriger Bild-Alternativtext", isAltField: true, editable: true });
    assert.equal(f.inspect("focus-alt"), true); assert.equal(f.document.activeElement, f.field); assert.equal(f.inspect("blur-alt"), true);
    assert.equal(f.filename.value, "IMG_8071.JPG"); assert.equal(f.calls.some((call) => call.operation === "value-write"), false);
  }
});

test("CSS-Preview bindet das Feld; fehlende, andere oder sichtbar widersprüchliche Preview verhindert Fokus", () => {
  const css = editorFixture({ cssPreview: true }); assert.ok(css.inspect());
  css.preview.css.backgroundImage = `url('${OTHER}')`; assert.equal(css.inspect(), null); assert.equal(css.inspect("focus-alt"), false);
  const f = editorFixture(); f.dialog.append(f.element("img", { attrs: { src: OTHER }, box: f.rect(150, 180, 100, 100) })); assert.equal(f.inspect(), null);
  f.preview.css.display = "none"; assert.equal(f.inspect("focus-alt"), false);
});

test("readonly, disabled, inert, unsichtbare und schreibgeschützte Gruppenfelder werden nicht fokussiert", () => {
  for (const mode of ["readonly", "disabled", "aria-disabled", "inert", "hidden", "opacity", "group-readonly"]) {
    const f = editorFixture();
    if (mode === "readonly") f.field.readOnly = true;
    if (mode === "disabled") f.field.disabled = true;
    if (mode === "aria-disabled") f.dialog.setAttribute("aria-disabled", "true");
    if (mode === "inert") f.dialog.setAttribute("inert", "");
    if (mode === "hidden") f.field.css.visibility = "hidden";
    if (mode === "opacity") f.dialog.css.opacity = "0";
    if (mode === "group-readonly") f.dialog.setAttribute("aria-readonly", "true");
    assert.equal(f.inspect(), null, mode); assert.equal(f.inspect("focus-alt"), false, mode); assert.equal(f.calls.some((call) => call.operation === "focus"), false);
  }
});

test("ein aktives Alt-Eingabefeld darf pointer-events:auto innerhalb eines durchlässigen Popoverhosts verwenden", () => {
  const f = editorFixture(); f.dialog.css.pointerEvents = "none"; f.field.css.pointerEvents = "auto";
  assert.ok(f.inspect()); assert.equal(f.inspect("focus-alt"), true);
  f.field.css.pointerEvents = "none";
  assert.equal(f.inspect(), null); assert.equal(f.inspect("focus-alt"), false);
});

test("Schatten-/Messfelder werden ausgeschlossen und doppelte reale Alt-Felder bleiben mehrdeutig", () => {
  const f = editorFixture(), shadow = f.element("textarea", { attrs: { "aria-label": "BILD-ALTERNATIVTEXT", "data-test": "rosetta-textarea-shadow-element" }, value: "Falscher Spiegelwert" });
  f.dialog.append(shadow); assert.ok(f.inspect());
  f.dialog.append(f.element("textarea", { attrs: { "aria-label": "BILD-ALTERNATIVTEXT" }, value: "Ein zweites echtes Feld" })); assert.equal(f.inspect(), null);
  const closed = editorFixture(); closed.field.setAttribute("aria-label", "ALTERNATIVER DATEINAME"); closed.dialog.shadowRoot = { secret: "not inspected" };
  assert.equal(closed.inspect(), null);
});

test("konfligierende Feldlabels, doppelte Referenz-IDs, fremde Forms und doppelte Dialoge stoppen eindeutig", () => {
  for (const mode of ["label-conflict", "duplicate-id", "outside-label", "duplicate-dialog"]) {
    const f = editorFixture({ mapping: "for" });
    if (mode === "label-conflict") f.field.setAttribute("aria-label", "ALTERNATIVER DATEINAME");
    if (mode === "duplicate-id") f.document.body.append(f.element("input", { attrs: { id: "image-alt-input", "aria-label": "Andere Form" } }));
    if (mode === "outside-label") { f.label.removeAttribute("for"); f.field.setAttribute("aria-labelledby", "foreign-label"); f.document.body.append(f.element("label", { attrs: { id: "foreign-label" }, text: "BILD-ALTERNATIVTEXT" })); }
    if (mode === "duplicate-dialog") f.document.body.append(f.element("div", { attrs: { role: "dialog", "aria-label": "Block-Editor-Formular" } }));
    assert.equal(f.inspect(), null, mode); assert.equal(f.inspect("focus-alt"), false, mode);
  }
});

test("Dialogschluss verlangt tatsächlich keine sichtbaren Dialoge; fremde Dialoge werden nicht als geschlossen angenommen", () => {
  const f = editorFixture(); assert.equal(f.inspect("dialog-closed"), false); f.dialog.css.display = "none"; assert.equal(f.inspect("dialog-closed"), true);
  f.document.body.append(f.element("div", { attrs: { role: "dialog", "aria-label": "Andere Form" } })); assert.equal(f.inspect("dialog-closed"), false);
});

test("Diagnose ist lokal, begrenzt und enthält weder Feldwerte, Preview-URLs noch andere Form-/Credentialangaben", () => {
  const f = editorFixture({ mapping: "for" }); f.field.value = "PRIVATE_ALT_VALUE"; f.filename.value = "PRIVATE_FILENAME_VALUE";
  f.field.setAttribute("data-test", "image-alt-input"); f.field.setAttribute("title", "PRIVATE_TITLE_VALUE");
  f.document.body.append(f.element("form", {}, [f.element("input", { attrs: { type: "password", "aria-label": "PRIVATE_PASSWORD_LABEL", id: "PRIVATE_PASSWORD_ID" }, value: "PRIVATE_PASSWORD_VALUE" })]));
  for (let index = 0; index < 40; index++) f.dialog.append(f.element("input", { attrs: { "aria-label": "Beschreibung", id: `description-${index}` }, value: `PRIVATE_DESCRIPTION_${index}` }));
  const diag = f.inspect("field-diagnostic"), serialized = JSON.stringify(diag);
  assert.equal(diag.status, "observed-dialog"); assert.ok(diag.fields.length <= 12); assert.ok(diag.previews.length <= 8);
  assert.ok(Object.values(diag.counts).every((count) => Number.isFinite(count) && count >= 0 && count <= 20));
  assert.equal(diag.counts.altFields, 1); assert.equal(diag.counts.matchingPreviews, 1);
  assert.doesNotMatch(serialized, /PRIVATE_|IMG_8071|https?:|password|credential|value/i);
  assert.equal(diag.fields[0].ariaLabel, "File"); assert.equal(diag.fields.some((field) => field.labels.includes("Alt")), true);
});

test("bei unbekanntem Editor liest die Diagnose keine anderen Formularwerte oder Namen", () => {
  const f = editorFixture(); f.dialog.setAttribute("aria-label", "PRIVATE_LOGIN_FORM");
  Object.defineProperty(f.field, "value", { get() { throw new Error("An unrelated form value must never be read"); } });
  const diag = f.inspect("field-diagnostic"); assert.equal(diag.status, "dialog-not-found"); assert.deepEqual(diag.fields, []);
  assert.doesNotMatch(JSON.stringify(diag), /PRIVATE_|Eigener bisheriger|IMG_8071/);
});
