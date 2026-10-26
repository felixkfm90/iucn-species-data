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
  assert.match(mapSource, /openFullscreen\(imgUrl, img\.alt, opener\)/);
  assert.match(mapSource, /img\.alt = altText \|\| "Vergrößerte Verbreitungskarte"/);
});

async function mapFixture({ width = 767, available = true } = {}) {
  const frames = [], scrollCalls = [], focusCalls = [], geometry = { header: null, currentTop: 300, height: 300, outlineWidth: 1.76991, outlineOffset: 3.53982, pendingSmoothTop: null };
  const events = new Map(), documentEvents = new Map();
  const body = element(), content = element(), previouslyInert = element();
  body.style.overflow = "auto";
  body.appendChild(content); body.appendChild(previouslyInert); previouslyInert.inert = true;
  const document = { body, activeElement: content, elementFromPoint: (x, y) => geometry.hitTest?.(x, y) || null,
    getElementById: (id) => id === "map-wrapper" ? content : output,
    addEventListener: (name, listener) => documentEvents.set(name, listener),
    createElement: (tag) => makeNode(tag),
  };
  function makeNode(tag) {
    const node = element(); node.tagName = tag.toUpperCase();
    node.focus = (options) => { focusCalls.push({ node, options }); document.activeElement = node; };
    node.remove = () => {
      node.parentElement.children = node.parentElement.children.filter((child) => child !== node);
      node.isConnected = false;
    };
    node.replaceWith = (next) => {
      const parent = node.parentElement, index = parent.children.indexOf(node);
      parent.children.splice(index, 1, next); next.parentElement = parent;
    };
    return node;
  }
  const output = makeNode("div"); content.appendChild(output);
  Object.defineProperty(output, "innerHTML", { set(html) {
    output.renderedHTML = html;
    output.children = [];
    if (html.includes("species-map-img")) {
      const img = makeNode("img"); img.alt = "Verbreitungskarte - Bachstelze"; output.appendChild(img);
    }
  } });
  output.querySelector = () => output.children[0];
  const window = { innerWidth: width, innerHeight: 1024,
    requestAnimationFrame: callback => frames.push(callback),
    getComputedStyle: node => node === geometry.header ? { position: geometry.position || "fixed" } : { outlineStyle: geometry.outlineWidth > 0 ? "solid" : "none", outlineWidth: geometry.outlineWidth + "px", outlineOffset: geometry.outlineOffset + "px" },
    scrollBy: options => { scrollCalls.push(options); if (options.behavior === "instant") geometry.pendingSmoothTop = null; geometry.currentTop -= options.top; },
    SpeciesCore: { getSpeciesData: async () => ({ "Deutscher Name": "Bachstelze" }),
    getSpeciesAssetPaths: () => ({ map: "https://example.test/map.jpg" }) },
    matchMedia: () => ({ matches: width <= 768 }),
    addEventListener: (name, listener) => events.set(name, listener),
    removeEventListener: (name, listener) => { if (events.get(name) === listener) events.delete(name); },
  };
  const context = vm.createContext({ window, document, fetch: async () => ({ ok: available }),
    Image: function () { return makeNode("img"); } });
  new vm.Script(mapSource, { filename: "map-loader.js" }).runInContext(context);
  documentEvents.get("DOMContentLoaded")();
  await new Promise(setImmediate);
  const opener = output.children[0];
  const open = () => opener.listeners.get("click").listener();
  const key = (value, shiftKey = false) => {
    const event = { key: value, shiftKey, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    events.get("keydown")?.(event); return event;
  };
  return { document, content, previouslyInert, output, opener, open, key, events, window, frames, scrollCalls, focusCalls, geometry, flush: () => { while (frames.length) frames.shift()(); if (geometry.pendingSmoothTop !== null) { geometry.currentTop = geometry.pendingSmoothTop; geometry.pendingSmoothTop = null; } },
    overlay: () => body.children.find((node) => node.getAttribute("role") === "dialog") };
}


test("Mobile Karte öffnet als benannter Dialog mit Tastaturfokus und vollständiger Rückgabe", async () => {
  const f = await mapFixture();
  assert.equal(f.opener.tagName, "BUTTON");
  assert.equal(f.opener.type, "button");
  assert.equal(f.opener.getAttribute("aria-label"), "Verbreitungskarte vergrößern: Bachstelze");
  f.open();
  const dialog = f.overlay(), close = dialog.children[1];
  assert.equal(dialog.getAttribute("aria-modal"), "true");
  assert.equal(dialog.getAttribute("aria-label"), "Vergrößerte Verbreitungskarte");
  assert.equal(dialog.children[0].alt, "Verbreitungskarte - Bachstelze");
  assert.equal(close.getAttribute("aria-label"), "Kartenansicht schließen");
  assert.equal(f.document.activeElement, close);
  assert.equal(f.document.body.style.overflow, "hidden");
  assert.equal(f.content.inert, true);
  for (const shifted of [false, true]) {
    const event = f.key("Tab", shifted);
    assert(event.prevented && event.stopped);
    assert.equal(f.document.activeElement, close);
  }
  f.document.activeElement = f.content;
  f.events.get("focusin")({ target: f.content });
  assert.equal(f.document.activeElement, close);
  const escape = f.key("Escape");
  assert(escape.prevented && escape.stopped);
  assert.equal(f.overlay(), undefined);
  assert.equal(f.document.activeElement, f.opener);
  assert.equal(f.document.body.style.overflow, "auto");
  assert.equal(f.content.inert, false);
  assert.equal(f.previouslyInert.inert, true);
  assert.equal(f.key("Escape").stopped, false);
});

test("Karte schließt per Schließknopf, Bildklick und Seitenwechsel ohne zurückbleibende Sperren", async () => {
  const f = await mapFixture();
  for (const method of ["close", "image", "page"]) {
    f.open(); const dialog = f.overlay();
    if (method === "close") dialog.children[1].listeners.get("click").listener();
    else if (method === "image") dialog.listeners.get("click").listener({ target: dialog.children[0] });
    else f.events.get("mercury:load")();
    assert.equal(f.overlay(), undefined);
    assert.equal(f.content.inert, false);
    assert.equal(f.previouslyInert.inert, true);
    assert.equal(f.document.body.style.overflow, "auto");
    assert.equal(f.events.has("keydown"), false);
    assert.equal(f.events.has("focusin"), false);
  }
});

for (const width of [390, 768, 820, 1280]) {
  test("Kompakte Karte bietet in jeder Ansicht denselben nativen Öffner: " + width, async () => {
    const f = await mapFixture({ width });
    assert.equal(f.opener.tagName, "BUTTON");
    assert.equal(f.opener.type, "button");
    assert.equal(f.opener.className, "species-map-opener");
    assert.equal(f.opener.getAttribute("aria-label"), "Verbreitungskarte vergrößern: Bachstelze");
    assert.equal(f.opener.children.length, 2);
    const [image, action] = f.opener.children;
    assert.equal(image.tagName, "IMG");
    assert.equal(image.alt, "Verbreitungskarte - Bachstelze");
    assert.equal(action.tagName, "SPAN");
    assert.equal(action.className, "species-map-action");
    assert.equal(action.textContent, "Karte vergrößern");
    f.open();
    const dialog = f.overlay();
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    assert.equal(dialog.children[0].src, "https://example.test/map.jpg");
    assert.equal(dialog.children[0].alt, image.alt);
    assert.equal(f.document.activeElement, dialog.children[1]);
    assert.equal(f.content.inert, true);
    for (const shifted of [false, true]) {
      const event = f.key("Tab", shifted);
      assert(event.prevented && event.stopped);
      assert.equal(f.document.activeElement, dialog.children[1]);
    }
    f.key("Escape"); f.flush();
    assert.equal(f.overlay(), undefined);
    assert.equal(f.document.activeElement, f.opener);
    assert.equal(f.content.inert, false);
    assert.equal(f.previouslyInert.inert, true);
    assert.equal(f.document.body.style.overflow, "auto");
    assert.equal(f.events.has("keydown"), false);
    assert.equal(f.events.has("focusin"), false);
  });
}

test("Fehlende Karten erzeugen auch auf breiten Ansichten keinen leeren Vergrößerungsknopf", async () => {
  for (const width of [390, 820, 1280]) {
    const f = await mapFixture({ width, available: false });
    assert.match(f.output.renderedHTML, /Verbreitungskarte aktuell nicht verfuegbar/);
    assert.equal(f.output.children.length, 0);
    assert.equal(f.overlay(), undefined);
    assert.equal(f.events.has("keydown"), false);
    assert.equal(f.events.has("focusin"), false);
  }
});

// Audit 10.54: stable native Amsel/fractional-tablet focus collision, in CSS px.
// Keep this tiny explicit fixture independent of private evidence files/URLs.
const MAP_FOCUS_BASELINE = Object.freeze({
  headerBottom: 139.90597534179688,
  openerTop: 140.2516632080078,
  openerHeight: 899.9723510742188,
  outlineWidth: 1.76991,
  outlineOffset: 3.53982,
});

async function focusReturnFixture(options = {}) {
  const f = await mapFixture(), g = f.geometry;
  g.currentTop = options.top ?? MAP_FOCUS_BASELINE.openerTop;
  g.height = options.height ?? MAP_FOCUS_BASELINE.openerHeight;
  g.outlineWidth = options.outlineWidth ?? MAP_FOCUS_BASELINE.outlineWidth;
  g.outlineOffset = options.outlineOffset ?? MAP_FOCUS_BASELINE.outlineOffset;
  g.position = options.position || "fixed";
  f.opener.getBoundingClientRect = () => ({ left: 46.0177, x: 46.0177, width: 661.9469,
    right: 707.9646, top: g.currentTop, height: g.height, bottom: g.currentTop + g.height });
  if (options.header !== false) {
    g.header = element();
    g.header.getBoundingClientRect = () => ({ left: 0, right: 767, top: options.headerTop ?? 0,
      bottom: options.headerBottom ?? MAP_FOCUS_BASELINE.headerBottom, width: 767,
      height: (options.headerBottom ?? MAP_FOCUS_BASELINE.headerBottom) - (options.headerTop ?? 0) });
    g.hitTest = (x, y) => {
      const r = g.header.getBoundingClientRect();
      return options.hit !== false && x >= r.left && x < r.right && y >= r.top && y < r.bottom
        ? { closest: () => g.header } : null;
    };
  }
  f.open();
  return f;
}

const focusMoves = (f) => f.scrollCalls.filter((call) => call.top !== 0 || call.left !== 0);
const focusAborts = (f) => f.scrollCalls.filter((call) => call.top === 0 && call.left === 0 && call.behavior === "instant");
const closeMap = (f) => f.overlay().children[1].listeners.get("click").listener();
const upperFocusLineY = (f) => f.geometry.currentTop - f.geometry.outlineOffset - f.geometry.outlineWidth / 2;

test("Kartenfokus kehrt ohne Browser-Autoscroll zurück und korrigiert nur eine gemessene Headerverdeckung", async () => {
  const f = await focusReturnFixture();
  closeMap(f);
  assert.equal(f.document.activeElement, f.opener);
  assert.equal(f.focusCalls.at(-1).options.preventScroll, true);
  assert.equal(f.document.body.style.overflow, "auto");
  assert.equal(focusMoves(f).length, 0, "Sichtprüfung erst nach wiederhergestelltem Layout");
  f.flush();
  assert.equal(focusMoves(f).length, 1);
  assert.equal(focusMoves(f)[0].behavior, "instant");
  assert.equal(focusMoves(f)[0].left, 0);
  assert(focusMoves(f)[0].top < 0);
  assert(upperFocusLineY(f) > MAP_FOCUS_BASELINE.headerBottom);
  assert(f.geometry.currentTop - f.geometry.outlineOffset - f.geometry.outlineWidth
    >= MAP_FOCUS_BASELINE.headerBottom + 2 - 1e-8);
});

for (const mode of ["free-header", "no-header", "not-actual-hit", "flow-header"]) {
  test("Kartenfokus scrollt nicht unnötig: " + mode, async () => {
    const f = await focusReturnFixture({ top: mode === "free-header" ? 300 : undefined,
      header: mode !== "no-header", hit: mode !== "not-actual-hit", position: mode === "flow-header" ? "static" : "fixed" });
    closeMap(f); f.flush();
    assert.equal(f.document.activeElement, f.opener);
    assert.equal(f.focusCalls.at(-1).options.preventScroll, true);
    assert.equal(focusMoves(f).length, 0);
  });
}

test("Entfernter Öffner oder zwischenzeitlich anderer Fokus löst kein spätes Kartenscrollen aus", async () => {
  for (const timing of ["before-close", "after-close", "focus-moved"]) {
    const f = await focusReturnFixture();
    if (timing === "before-close") f.opener.isConnected = false;
    closeMap(f);
    if (timing === "after-close") f.opener.isConnected = false;
    if (timing === "focus-moved") f.document.activeElement = f.content;
    f.flush();
    assert.equal(focusMoves(f).length, 0);
    if (timing === "before-close") assert.notEqual(f.document.activeElement, f.opener);
  }
});

test("Kleine und hohe Karten behalten ihre Maße; die Korrektur sichert nur den oberen Fokusanker", async () => {
  for (const height of [200, MAP_FOCUS_BASELINE.openerHeight]) {
    const f = await focusReturnFixture({ height });
    closeMap(f); f.flush();
    assert.equal(f.geometry.height, height);
    assert(upperFocusLineY(f) > MAP_FOCUS_BASELINE.headerBottom);
    assert.equal(focusMoves(f).length, 1);
    if (height > 800) assert(f.geometry.currentTop + height > f.window.innerHeight,
      "Keine Zusage, dass ein hoher Kartenrahmen vollständig unter den Header passt");
  }
});

test("Innenliegender Fokusrahmen und haftender Header verwenden denselben Karten-Rückgabepfad", async () => {
  const f = await focusReturnFixture({ height: 398, top: 130, outlineWidth: 3, outlineOffset: -4, position: "sticky" });
  closeMap(f); f.flush();
  assert.equal(focusMoves(f).length, 1);
  assert(upperFocusLineY(f) > MAP_FOCUS_BASELINE.headerBottom);
  assert.equal(f.geometry.height, 398);
});

test("Escape und Schließknopf geben denselben Kartenfokus zurück und entfernen alle Dialogsperren", async () => {
  for (const method of ["escape", "button"]) {
    const f = await focusReturnFixture();
    if (method === "escape") f.key("Escape"); else closeMap(f);
    f.flush();
    assert.equal(f.overlay(), undefined);
    assert.equal(f.content.inert, false);
    assert.equal(f.previouslyInert.inert, true);
    assert.equal(f.events.has("keydown"), false);
    assert.equal(f.events.has("focusin"), false);
    assert.equal(f.document.activeElement, f.opener);
    assert.equal(focusMoves(f).length, 1);
  }
});

test("Unpassendes Headerrechteck genügt ohne tatsächliche Überdeckung der Fokuskante nicht zum Scrollen", async () => {
  const f = await focusReturnFixture();
  f.geometry.hitTest = () => ({ closest: () => f.geometry.header });
  f.geometry.header.getBoundingClientRect = () => ({ top: 200, bottom: 300 });
  closeMap(f); f.flush();
  assert.equal(focusMoves(f).length, 0);
});

// Audit 10.54: delayed in-flight smooth motion model using the native Kormoran
// free first-frame and covered stable endpoints; no private evidence dependency.
const MAP_SMOOTH_MODEL = Object.freeze({"freeTop":186.62887573242188,"coveredTop":139.72621154785156,"height":909.568603515625,"headerBottom":139.90597534179688});

test("Kartenrückgabe stoppt laufenden Smoothscroll vor der einzigen Headerprüfung", async () => {
  const f = await focusReturnFixture({ top: MAP_SMOOTH_MODEL.freeTop, height: MAP_SMOOTH_MODEL.height });
  f.geometry.pendingSmoothTop = MAP_SMOOTH_MODEL.coveredTop;
  closeMap(f);
  assert.equal(focusAborts(f).length, 1);
  assert.equal(f.frames.length, 1);
  assert.equal(f.geometry.pendingSmoothTop, null);
  f.flush();
  assert.equal(f.geometry.currentTop, MAP_SMOOTH_MODEL.freeTop);
  assert.equal(focusMoves(f).length, 0);
  assert(upperFocusLineY(f) > MAP_SMOOTH_MODEL.headerBottom);
});

test("Null-Abbruch bewegt keine freie Seite und unterbleibt bei umgeleitetem Fokus", async () => {
  const f = await focusReturnFixture({ top: 300 });
  closeMap(f); f.flush();
  assert.equal(focusAborts(f).length, 1);
  assert.equal(focusMoves(f).length, 0);
  assert.equal(f.geometry.currentTop, 300);
  const redirected = await focusReturnFixture({ top: 300 }), focus = redirected.opener.focus;
  redirected.opener.focus = (options) => { focus(options); redirected.document.activeElement = redirected.content; };
  closeMap(redirected); redirected.flush();
  assert.equal(redirected.scrollCalls.length, 0);
  assert.equal(redirected.frames.length, 0);
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
  const listeners = [];
  const body = element(), html = element(), lightbox = element(), previousInert = element();
  previousInert.inert = true;
  body.appendChild(lightbox); body.appendChild(previousInert);
  const image = element(); image.setAttribute("alt", "Amsel auf einem Ast"); image.src = "https://example.test/amsel.jpg";
  lightbox.querySelector = () => ({ querySelector: () => image });
  const document = { body, documentElement: html, activeElement: body,
    querySelector: () => lightbox,
    addEventListener(name, listener, options) { listeners.push({ site: "document", name, listener, capture: options === true || Boolean(options?.capture) }); },
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
  const location = { search: "?itemId=amsel" };
  const context = vm.createContext({ document, URLSearchParams, location,
    innerWidth: 1200, innerHeight: 900, getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
    MutationObserver: class { observe() {} }, setInterval: () => 0, setTimeout: () => 0, addEventListener() {} });
  const events = new Map();
  context.window = context;
  context.addEventListener = (name, listener, options) => {
    events.set(name, { listener, options });
    listeners.push({ site: "window", name, listener, capture: options === true || Boolean(options?.capture) });
  };
  new vm.Script(lightboxSource, { filename: "lightbox-zoom.js" }).runInContext(context);
  const overlay = body.children.find((node) => node.id === "gz-overlay");
  const trigger = body.children.find((node) => node.className === "gz-zoom-btn");
  const close = overlay.querySelector("#gz-close");
  const open = () => trigger.listeners.get("click").listener({ preventDefault() {}, stopPropagation() {} });
  const dispatchKey = (type, name, { shiftKey = false, repeat = false } = {}) => {
    const event = { type, key: name, shiftKey, repeat, target: document.activeElement,
      prevented: false, stopped: false, immediateStopped: false,
      preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; },
      stopImmediatePropagation() { this.stopped = true; this.immediateStopped = true; } };
    for (const [site, capture] of [["window", true], ["document", true], ["document", false], ["window", false]]) {
      for (const entry of listeners.filter((entry) => entry.name === type && entry.site === site && entry.capture === capture)) {
        entry.listener(event);
        if (event.immediateStopped) break;
      }
      if (event.stopped) break;
    }
    return event;
  };
  const key = (name, shiftKey = false) => dispatchKey("keydown", name, { shiftKey });
  const cmsEvents = [];
  const addCmsListener = (type, { site = "document", capture = false } = {}) => {
    listeners.push({ site, name: type, capture, listener(event) {
      if (event.key !== "Escape") return;
      cmsEvents.push({ type: event.type, repeat: event.repeat });
      location.search = "";
      lightbox.setAttribute("aria-hidden", "true");
    } });
  };
  return { document, lightbox, previousInert, overlay, trigger, close, open, key, dispatchKey, events, location, cmsEvents, addCmsListener };
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
  const release = f.dispatchKey("keyup", "Escape");
  assert.equal(release.prevented, true);
  assert.equal(release.stopped, true, "Auch das Loslassen gehört noch zum Escape-Druck des Zooms");
  assert.equal(f.key("Escape").stopped, false, "Geschlossener Zoom fängt keine CMS-Tasten ab");
  f.open();
  f.close.listeners.get("click").listener();
  assert.equal(f.overlay.hidden, true);
  assert.equal(f.document.activeElement, f.trigger);
});

for (const options of [{ site: "document", capture: false }, { site: "window", capture: true }]) {
  test(`Vollständiger Escape-Druck erhält die CMS-Galerie vor späterem ${options.site}-keyup`, () => {
    const f = zoomFixture();
    f.addCmsListener("keyup", options);
    f.open();
    assert.equal(f.dispatchKey("keydown", "Escape").stopped, true);
    assert.equal(f.overlay.hidden, true);
    const release = f.dispatchKey("keyup", "Escape");
    assert.equal(release.stopped, true);
    assert.equal(release.prevented, true);
    assert.equal(f.location.search, "?itemId=amsel");
    assert.equal(f.cmsEvents.length, 0);
    assert.equal(f.document.activeElement, f.trigger);
    assert.equal(f.dispatchKey("keydown", "Escape").stopped, false);
    assert.equal(f.dispatchKey("keyup", "Escape").stopped, false);
    assert.equal(f.cmsEvents.length, 1, "Der nächste unabhängige Escape-Druck erreicht das CMS");
    assert.equal(f.location.search, "");
  });
}

test("Gehaltenes Escape konsumiert Wiederholungen bis zum Loslassen und gibt den nächsten Druck frei", () => {
  const f = zoomFixture();
  f.addCmsListener("keydown");
  f.open();
  f.dispatchKey("keydown", "Escape");
  for (let count = 0; count < 3; count++) {
    const repeat = f.dispatchKey("keydown", "Escape", { repeat: true });
    assert.equal(repeat.stopped, true);
    assert.equal(repeat.prevented, true);
  }
  assert.equal(f.location.search, "?itemId=amsel");
  assert.equal(f.cmsEvents.length, 0);
  assert.equal(f.dispatchKey("keyup", "Escape").stopped, true);
  assert.equal(f.dispatchKey("keydown", "Escape").stopped, false);
  assert.equal(f.dispatchKey("keyup", "Escape").stopped, false);
  assert.equal(f.cmsEvents.length, 1);
});

test("Schließenknopf erhält die Galerie und reserviert keinen späteren Escape-Druck", () => {
  const f = zoomFixture();
  f.addCmsListener("keyup");
  f.open();
  f.close.listeners.get("click").listener();
  assert.equal(f.overlay.hidden, true);
  assert.equal(f.location.search, "?itemId=amsel");
  assert.equal(f.document.activeElement, f.trigger);
  assert.equal(f.dispatchKey("keydown", "Escape").stopped, false);
  assert.equal(f.dispatchKey("keyup", "Escape").stopped, false);
  assert.equal(f.cmsEvents.length, 1);
});

test("Fremdes keyup beendet die Bindung eines gehaltenen Escape-Drucks nicht", () => {
  const f = zoomFixture();
  f.addCmsListener("keydown");
  f.open();
  f.dispatchKey("keydown", "Escape");
  assert.equal(f.dispatchKey("keyup", "a").stopped, false);
  assert.equal(f.dispatchKey("keydown", "Escape", { repeat: true }).stopped, true);
  assert.equal(f.cmsEvents.length, 0);
  f.dispatchKey("keyup", "Escape");
  assert.equal(f.dispatchKey("keydown", "Escape").stopped, false);
  assert.equal(f.cmsEvents.length, 1);
});

test("Fenster-Fokusverlust löst eine Escape-Bindung mit verlorenem keyup", () => {
  const f = zoomFixture();
  f.addCmsListener("keyup");
  f.open();
  f.dispatchKey("keydown", "Escape");
  f.events.get("blur")?.listener();
  assert.equal(f.dispatchKey("keydown", "Escape").stopped, false);
  assert.equal(f.dispatchKey("keyup", "Escape").stopped, false);
  assert.equal(f.cmsEvents.length, 1);
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
