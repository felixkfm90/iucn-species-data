import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { squarespacePageSettingsControlsDom } from "./squarespace-page-settings-controls.mjs";

const ADMIN = "https://vanilla-gerbil-jwnp.squarespace.com/config/pages";
const SAVED_PATH = "/arten-explorer-funktionsprufung-2026-11-02";
const PAGE_URL = "https://www.fnwildlifetravel.de" + SAVED_PATH;
const MODAL_ID = "m12345678-1234-1234-1234-1234567890ab";

function fixture({ active = true, dirty = false } = {}) {
  function matches(node, selector) {
    const tag = selector.match(/^[a-z][\w-]*/i)?.[0], id = selector.match(/#([a-z0-9_-]+)/i)?.[1];
    if (tag && node.tagName !== tag.toUpperCase() || id && node.getAttribute("id") !== id) return false;
    return [...selector.matchAll(/\[([a-z0-9_-]+)(?:="([^"]*)")?\]/gi)].every(([, name, value]) => {
      const actual = node.getAttribute(name);
      return value === undefined ? actual !== null : actual === value;
    });
  }
  function element(tag, attrs = {}, content = "", children = []) {
    const node = { tagName: tag.toUpperCase(), attrs, textContent: content, children: [], parentElement: null,
      style: { display: "block", visibility: "visible", opacity: "1" },
      rect: { left: 2, top: 2, right: 12, bottom: 12 },
      getAttribute(key) { return Object.hasOwn(this.attrs, key) ? this.attrs[key] : null; },
      getClientRects() { return this.style.display === "none" ? [] : [this.rect]; },
      getBoundingClientRect() { return this.rect; },
      append(...nodes) { for (const child of nodes) { child.parentElement = this; this.children.push(child); } },
      contains(target) { return target === this || this.children.some(child => child.contains(target)); },
      querySelectorAll(selector) { return this.children.flatMap(child => [
        ...(selector.split(",").some(part => matches(child, part)) ? [child] : []), ...child.querySelectorAll(selector),
      ]); },
      querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; },
    };
    node.append(...children);
    return node;
  }
  const bounds = (x, y, w = 20, h = 20) => ({ left: x, top: y, right: x + w, bottom: y + h });
  const body = element("body");
  const hits = new Map(), pointFor = node => {
    const { left, top, right, bottom } = node.rect;
    return [Math.floor((left + right) / 2), Math.floor((top + bottom) / 2)];
  };
  const document = { URL: ADMIN, baseURI: ADMIN, documentElement: { clientWidth: 800, clientHeight: 600 }, activeElement: null,
    querySelectorAll: selector => body.querySelectorAll(selector), querySelector: selector => body.querySelector(selector),
    elementFromPoint: (x, y) => hits.get(`${x},${y}`) || null };
  const setHit = (control, hit) => hits.set(pointFor(control).join(","), hit);
  const frame = element("iframe", { id: "sqs-site-frame", src: SAVED_PATH }); frame.src = new URL(SAVED_PATH, ADMIN).href;
  const close = element("button", { "data-test": "nav-modal-close-button" }, dirty ? "Abbrechen" : "Schließen"); close.rect = bounds(50, 20);
  const dialog = element("div", { role: "dialog", "data-modal-id": MODAL_ID }, "", [close]);
  const fields = {};
  for (const [key, label, value] of [["title", "Seitentitel", "FN Artseitenentwurf"], ["navigationTitle", "Navigationstitel", "FN Vorschau"],
    ["slug", "URL-Slug", dirty ? "wildlife/heimische-tierwelt/neue-art" : SAVED_PATH.slice(1)]]) {
    const input = element("input", { id: key, type: "text", "aria-label": label });
    const associatedLabel = element("label", { for: key }, label);
    associatedLabel.control = input; input.labels = [associatedLabel]; input.value = value;
    input.focus = () => { document.activeElement = input; };
    input.select = () => { input.selectionStart = 0; input.selectionEnd = input.value.length; };
    dialog.append(associatedLabel, input);
    fields[key] = input;
  }
  const activationLabel = element("p", { id: ":activation:" }, "Seite aktivieren");
  const activation = element("input", { type: "checkbox", "aria-labelledby": ":activation:" });
  activation.checked = active; activation.rect = bounds(60, 90, 1, 1); activation.style.opacity = "0";
  const toggle = element("label", {}, "", [activation]); toggle.control = activation; activation.labels = [toggle];
  const qrName = element("p", { id: ":qr:" }, "QR-Code anzeigen");
  const qr = element("input", { type: "checkbox", "aria-labelledby": ":qr:" }); qr.checked = false;
  const qrToggle = element("label", {}, "", [qr]); qrToggle.control = qr; qr.labels = [qrToggle];
  dialog.append(activationLabel, toggle, qrName, qrToggle);
  const notice = element("button", { disabled: "" }, "Diese Seite ist deaktiviert");
  if (!active) dialog.append(notice);
  const save = element("button", { "data-test": "nav-modal-left-button", type: "submit" }, "Speichern"); save.rect = bounds(50, 180);
  if (dirty) dialog.append(save);
  body.append(frame, dialog);
  setHit(close, close); setHit(activation, toggle); setHit(save, save);
  const operate = (operation, extra = {}) => JSON.parse(JSON.stringify(vm.runInNewContext(
    `(${squarespacePageSettingsControlsDom.toString()})(${JSON.stringify({ operation, pageUrl: PAGE_URL, ...extra })})`,
    { document, URL, getComputedStyle: node => node.style },
  )));
  return { operate, element, document, body, dialog, frame, fields, activation, activationLabel, toggle, qrToggle, close, save, setHit };
}

test("Seiteneinstellungen lesen den gebundenen sauberen Dialog und treffen nur den zugehörigen Aktivierungsschalter", () => {
  const f = fixture(), state = f.operate("settings-state");
  assert.deepEqual(state, { modalId: MODAL_ID, title: "FN Artseitenentwurf", navigationTitle: "FN Vorschau",
    slug: SAVED_PATH.slice(1), enabled: true, saveAvailable: false });
  assert.deepEqual(f.operate("settings-disable", { expected: state }), { point: { x: 60, y: 90 } });
  f.setHit(f.activation, f.qrToggle);
  assert.equal(f.operate("settings-disable", { expected: state }), null);
  f.setHit(f.activation, f.toggle);
  assert.equal(f.operate("settings-disable", { expected: { ...state, slug: "fremd" } }), null);
  assert.equal(f.operate("settings-focus", { expected: state, field: "title" }), false);
  assert.equal(f.document.activeElement, null);
});

test("Speichern bindet den deaktivierten geänderten Dialog an den alten Vorschaupfad und blockiert Fehler oder Überlagerungen", () => {
  const f = fixture({ active: false, dirty: true }), state = f.operate("settings-state");
  assert.equal(state.enabled, false);
  assert.equal(state.saveAvailable, true);
  assert.equal(state.slug, "wildlife/heimische-tierwelt/neue-art");
  assert.deepEqual(f.operate("settings-save", { expected: state }), { point: { x: 60, y: 190 } });
  delete f.save.attrs.type;
  assert.deepEqual(f.operate("settings-state"), state);
  assert.deepEqual(f.operate("settings-save", { expected: state }), { point: { x: 60, y: 190 } });
  f.save.attrs.type = "reset";
  assert.equal(f.operate("settings-state"), null);
  delete f.save.attrs.type;
  assert.equal(f.operate("settings-close", { expected: state }), null);
  f.fields.slug.attrs["aria-invalid"] = "true";
  assert.equal(f.operate("settings-save", { expected: state }), null);
  delete f.fields.slug.attrs["aria-invalid"];
  f.setHit(f.save, f.close);
  assert.equal(f.operate("settings-save", { expected: state }), null);
  f.save.attrs["data-test"] = "foreign-button";
  assert.equal(f.operate("settings-state"), null);

  const clean = fixture({ active: false }), cleanState = clean.operate("settings-state");
  assert.deepEqual(clean.operate("settings-close", { expected: cleanState }), { point: { x: 60, y: 30 } });
  clean.setHit(clean.close, clean.toggle);
  assert.equal(clean.operate("settings-close", { expected: cleanState }), null);
  assert.equal(clean.operate("settings-disable", { expected: cleanState }), null);
});

test("Fokus markiert das richtige native Textfeld vollständig und bestätigt denselben Dialog und Feldwert erneut", () => {
  const f = fixture({ active: false }), state = f.operate("settings-state");
  const select = (field, expected = state) => f.operate("settings-focus", { field, expected });
  assert.equal(select("foreign"), false);
  assert.equal(select("slug", { ...state, modalId: "foreign" }), false);
  assert.equal(f.document.activeElement, null);
  assert.equal(select("navigationTitle"), true);
  assert.equal(f.document.activeElement, f.fields.navigationTitle);
  assert.deepEqual([f.fields.navigationTitle.selectionStart, f.fields.navigationTitle.selectionEnd], [0, state.navigationTitle.length]);
  assert.deepEqual(f.operate("settings-state"), state);
  f.fields.slug.select = () => { f.fields.slug.value = "Fremder Wert nach Fokus"; };
  assert.equal(select("slug"), false);
});

test("Fremde oder mehrdeutige Dialoge, Frames, Labels und saubere Zustände werden verworfen", () => {
  for (const mutate of [
    f => { f.body.append(f.element("div", { role: "dialog" })); },
    f => { delete f.close.attrs["data-test"]; },
    f => { f.dialog.attrs["data-modal-id"] = "foreign"; },
    f => { f.frame.src += "/"; },
    f => { f.body.append(f.element("iframe", { id: "sqs-site-frame", src: SAVED_PATH })); },
    f => { f.fields.navigationTitle.labels[0].control = f.fields.slug; },
    f => { f.fields.title.labels[0].attrs.for = "foreign"; },
    f => { f.body.append(f.element("p", { id: ":activation:" }, "Seite aktivieren")); },
    f => { f.dialog.append(f.element("button", { "data-test": "nav-modal-left-button", type: "submit", disabled: "" }, "Speichern")); },
    f => { f.dialog.append(f.element("div", { role: "button", "aria-label": "Speichern" })); },
  ]) {
    const f = fixture();
    mutate(f);
    assert.equal(f.operate("settings-state"), null);
  }
});
