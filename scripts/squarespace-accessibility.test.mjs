import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const [statusSource, portraitSource, mapSource, lightboxSource] = await Promise.all([
  readFile(new URL("../species-status.js", import.meta.url), "utf8"),
  readFile(new URL("../species-portrait.js", import.meta.url), "utf8"),
  readFile(new URL("../map-loader.js", import.meta.url), "utf8"),
  readFile(new URL("../lightbox-zoom.js", import.meta.url), "utf8"),
]);

test("Status- und Trendsymbole benennen ihre sichtbare Bedeutung", () => {
  assert.match(statusSource, /alt="IUCN-Status: \$\{categoryText\}"/);
  assert.match(statusSource, /alt="Populationstrend: \$\{trendText\}"/);
});

test("Artporträt benennt die dargestellte Art", () => {
  assert.match(portraitSource, /alt="Artporträt – \$\{speciesName\}"/);
});

test("Karten-Vollbild übernimmt den Alternativtext der Ausgangskarte", () => {
  assert.match(mapSource, /openFullscreen\(imgUrl, img\.alt\)/);
  assert.match(mapSource, /img\.alt = altText \|\| "Vergrößerte Verbreitungskarte"/);
});

test("Lightbox-Zoom übernimmt den Alternativtext des geöffneten Bildes", () => {
  assert.match(lightboxSource, /const altText = img\?\.getAttribute\("alt"\) \|\| ""/);
  assert.match(lightboxSource, /openZoom\(src, altText\)/);
  assert.match(lightboxSource, /zoomImg\.alt = altText \|\| "Vergrößerte Bildansicht"/);
});

function element() {
  const classes = new Set();
  return {
    style: {}, attributes: new Map(), children: [], listeners: new Map(), inert: false, isConnected: true,
    classList: { add: (...names) => names.forEach((name) => classes.add(name)), remove: (...names) => names.forEach((name) => classes.delete(name)), contains: (name) => classes.has(name) },
    setAttribute(name, value) { this.attributes.set(name, value); },
    getAttribute(name) { return this.attributes.get(name) ?? null; },
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; },
    addEventListener(name, listener, options) { this.listeners.set(name, { listener, options }); },
    getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400 }),
    contains(node) { return node === this || this.children.some((child) => child.contains(node)); },
  };
}

function zoomFixture() {
  const body = element(), html = element(), lightbox = element(), previousInert = element();
  previousInert.inert = true;
  body.appendChild(lightbox); body.appendChild(previousInert);
  const image = element(); image.setAttribute("alt", "Amsel auf einem Ast"); image.src = "https://example.test/amsel.jpg";
  lightbox.querySelector = () => ({ querySelector: () => image });
  const document = { body, documentElement: html, activeElement: body,
    querySelector: () => lightbox, addEventListener() {},
    createElement() {
      const node = element();
      node.focus = () => { document.activeElement = node; };
      Object.defineProperty(node, "innerHTML", { set() {
        const close = this.appendChild(document.createElement("button"));
        const zoomImage = this.appendChild(document.createElement("img"));
        this.querySelector = (selector) => selector === "#gz-close" ? close : zoomImage;
      } });
      return node;
    },
  };
  const context = vm.createContext({ document, URLSearchParams, location: { search: "?itemId=amsel" },
    innerWidth: 1200, innerHeight: 900, getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
    MutationObserver: class { observe() {} }, setInterval: () => 0, setTimeout: () => 0, addEventListener() {} });
  const events = new Map();
  context.window = context;
  context.addEventListener = (name, listener, options) => events.set(name, { listener, options });
  new vm.Script(lightboxSource, { filename: "lightbox-zoom.js" }).runInContext(context);
  const overlay = body.children.find((node) => node.id === "gz-overlay");
  const trigger = body.children.find((node) => node.className === "gz-zoom-btn");
  const close = overlay.querySelector("#gz-close");
  const open = () => trigger.listeners.get("click").listener({ preventDefault() {}, stopPropagation() {} });
  const key = (name, shiftKey = false) => {
    const event = { key: name, shiftKey, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    events.get("keydown").listener(event);
    return event;
  };
  return { document, lightbox, previousInert, overlay, trigger, close, open, key, events };
}

test("Zoom bindet Fokus und Tastatur an den benannten Dialog und erhält die CMS-Lightbox", () => {
  const f = zoomFixture();
  assert.equal(f.overlay.hidden, true);
  f.open();
  assert.equal(f.overlay.getAttribute("role"), "dialog");
  assert.equal(f.overlay.getAttribute("aria-modal"), "true");
  assert.equal(f.overlay.getAttribute("aria-label"), "Vergrößerte Bildansicht");
  assert.equal(f.overlay.hidden, false);
  assert.equal(f.document.activeElement, f.close);
  assert.equal(f.lightbox.inert, true);
  assert.equal(f.overlay.querySelector("#gz-img").alt, "Amsel auf einem Ast");
  assert.equal(f.events.get("keydown").options, true);
  for (const shifted of [false, true]) {
    const tab = f.key("Tab", shifted);
    assert.equal(tab.prevented, true);
    assert.equal(tab.stopped, true);
    assert.equal(f.document.activeElement, f.close);
  }
  f.document.activeElement = f.lightbox;
  f.events.get("focusin").listener({ target: f.lightbox, stopImmediatePropagation() {} });
  assert.equal(f.document.activeElement, f.close);
  const escape = f.key("Escape");
  assert.equal(escape.prevented, true);
  assert.equal(escape.stopped, true, "Escape darf nicht zur darunterliegenden CMS-Lightbox gelangen");
  assert.equal(f.overlay.hidden, true);
  assert.equal(f.lightbox.inert, false);
  assert.equal(f.previousInert.inert, true, "Vorherige Fremdsperre bleibt erhalten");
  assert.equal(f.document.activeElement, f.trigger);
  assert.equal(f.trigger.style.display, "");
  assert.equal(f.key("Escape").stopped, false, "Geschlossener Zoom fängt keine CMS-Tasten ab");
  f.open();
  f.close.listeners.get("click").listener();
  assert.equal(f.overlay.hidden, true);
  assert.equal(f.document.activeElement, f.trigger);
});

test("Arten-Suche benennt Eingabe und Trefferstatus und behält Suche und Escape bei", async () => {
  const searchSource = await readFile(new URL("../search.js", import.meta.url), "utf8");
  const input = element(), meta = element(), wrap = element(), list = element(), host = element();
  input.value = "";
  host.querySelector = (selector) => ({ "#ss-input": input, "#ss-meta": meta, "#ss-results": wrap, "#ss-list": list })[selector];
  const main = element();
  main.querySelectorAll = () => ["Amsel", "Rebhuhn"].map((name) => ({
    textContent: name, getAttribute: () => `/wildlife/heimische-tierwelt/${name.toLowerCase()}`,
    closest: () => ({ querySelector: () => ({ textContent: name }) }),
  }));
  const timers = [];
  const location = { pathname: "/wildlife/heimische-tierwelt", href: "https://example.test/wildlife/heimische-tierwelt", origin: "https://example.test" };
  const context = vm.createContext({ location, URL,
    document: { getElementById: () => host, querySelector: () => main, createElement: element },
    MutationObserver: class { observe() {} }, clearTimeout() {}, setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; } });
  new vm.Script(searchSource, { filename: "search.js" }).runInContext(context);
  assert.match(host.innerHTML, /id="ss-input"[^>]*aria-label="Arten durchsuchen"/);
  assert.match(host.innerHTML, /id="ss-meta"[^>]*role="status"[^>]*aria-live="polite"/);
  input.value = "amsel";
  input.listeners.get("input").listener();
  timers.find((entry) => entry.delay === 120).callback();
  assert.equal(meta.textContent, "1 Treffer");
  assert.equal(list.children[0].children[0].textContent, "Amsel");
  input.listeners.get("keydown").listener({ key: "Escape" });
  assert.equal(input.value, "");
  assert.equal(meta.textContent, "");
  assert.equal(wrap.style.display, "none");
});
