import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(process.env.FN_SPECIES_HERO_TEST_SOURCE || new URL("../species-hero-layout.js", import.meta.url), "utf8");
const stylesheet = await readFile(process.env.FN_SPECIES_HERO_TEST_CSS || new URL("../docs/squarespace-custom.css", import.meta.url), "utf8");
const fixture = JSON.parse(await readFile(new URL("./fixtures/website/species-hero-structures.json", import.meta.url), "utf8"));
const markerName = "data-fn-species-hero";
const markerValue = "full-bleed-responsive-title-v3";
const heightName = "--fn-species-hero-header-height";

function heroStylesheet(text = stylesheet) {
  const markers = [...text.matchAll(/\/\* Species hero /g)];
  assert.equal(markers.length, 1, "One distinct Species hero block is required");
  const start = markers[0].index;
  assert(start === 0 || text[start - 1] === "\n", "Hero heading must start its own line");
  let depth = 0, quote = null, foundHero = false;
  for (let cursor = 0; cursor < text.length; cursor++) {
    const character = text[cursor];
    if (quote) {
      if (character === "\\") cursor++;
      else if (character === quote) quote = null;
      continue;
    }
    if (text.startsWith("/*", cursor)) {
      const end = text.indexOf("*/", cursor + 2);
      assert(end >= 0, "Closed stylesheet comment is required");
      if (cursor === start) {
        assert.equal(depth, 0, "Hero heading must be at stylesheet top level");
        foundHero = true;
      } else if (foundHero && depth === 0) {
        assert(!text.slice(text.lastIndexOf("\n", cursor) + 1, cursor).trim(),
          "The next stylesheet heading must start its own line");
        assert(!text.slice(end + 2, text.indexOf("\n", end + 2) < 0
          ? text.length : text.indexOf("\n", end + 2)).trim(),
        "The next stylesheet heading must end its own line");
        return text.slice(start, cursor).trimEnd();
      }
      cursor = end + 1;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "{") {
      depth++;
    } else if (character === "}") {
      depth--;
      assert(depth >= 0, "Balanced stylesheet before the next heading");
    }
  }
  assert(foundHero, "Hero heading must be an actual top-level comment");
  assert.equal(quote, null, "Closed stylesheet string is required");
  assert.equal(depth, 0, "Balanced hero stylesheet block is required");
  return text.slice(start).trimEnd();
}

function page({ sample = fixture.samples[0], path = sample.path, loading = false, resizeObserver = true, mutationObserver = true, initialHeight = 83.808, prepare } = {}) {
  let writes = 0, height = initialHeight, nextFrame = 0;
  const frames = new Map(), events = new Map(), documentEvents = new Map(), observers = [], headerLoads = [], fontLoads = [];
  function matches(node, selector) {
    return selector.split(",").some(part => {
      const bits = part.trim().match(/^([a-z0-9-]+)?(?:#([a-z0-9-]+))?(?:\.([a-z0-9-]+))?(?:\[([a-z0-9-]+)\])?$/i);
      assert.ok(bits, "Unsupported fixture selector: " + part);
      return (!bits[1] || node.tagName === bits[1].toUpperCase())
        && (!bits[2] || node.getAttribute("id") === bits[2])
        && (!bits[3] || node.classList.has(bits[3])) && (!bits[4] || node.attributes.has(bits[4]));
    });
  }
  function element(tagName, attrs = {}, children = [], text = "") {
    const node = { nodeType: 1, tagName: tagName.toUpperCase(), children: [], parentElement: null, attributes: new Map(Object.entries(attrs)), classList: new Set((attrs.class || "").split(/\s+/).filter(Boolean)), ownText: text,
      style: { values: new Map(), getPropertyValue(name) { return this.values.get(name) || ""; }, setProperty(name, value) { this.values.set(name, value); writes++; } },
      getAttribute(name) { return this.attributes.get(name) ?? null; },
      getAttributeNames() { return [...this.attributes.keys()]; },
      setAttribute(name, value) { this.attributes.set(name, value); writes++; },
      removeAttribute(name) { this.attributes.delete(name); writes++; },
      append(child) { child.parentElement = this; this.children.push(child); return child; },
      contains(other) { for (let n = other; n; n = n.parentElement) if (n === this) return true; return false; },
      querySelectorAll(selector) { const found = []; for (const child of this.children) { if (matches(child, selector)) found.push(child); found.push(...child.querySelectorAll(selector)); } return found; },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    };
    Object.defineProperty(node, "childNodes", { get() { return [...(this.ownText ? [{ nodeType: 3, nodeValue: this.ownText, parentElement: this }] : []), ...this.children]; } });
    Object.defineProperty(node, "textContent", { get() { return this.ownText + this.children.map(child => child.textContent).join(""); }, set(value) { this.ownText = value; this.children = []; } });
    node.classList.contains = value => node.classList.has(value);
    children.forEach(child => node.append(child));
    return node;
  }
  const richText = element("span", { class: sample.blocks[0].textColorClasses.join(" ") }, [], sample.blocks[0].headings[0]);
  const heading = element(sample.blocks[0].headingTags[0], {}, [richText]);
  const titleContent = element("div", { class: "sqs-html-content" }, [heading]);
  const titleBlock = element("div", { class: "fe-block" }, [element("div", { class: "sqs-block-html" }, [titleContent])]);
  const linkData = sample.blocks[1].links[0];
  const link = element("a", { href: linkData.href, class: linkData.classes }, [], linkData.text);
  const buttonBlock = element("div", { class: "fe-block" }, [element("div", { class: "sqs-block-button" }, [link])]);
  const grid = element("div", { class: sample.heroGridClass }, [titleBlock, buttonBlock]);
  const image = element("img", { src: sample.heroImage.src, "data-image-dimensions": sample.heroImage.dimensions, alt: sample.heroImage.alt || "" });
  const background = element("div", { class: "section-background" }, [image]);
  const border = element("div", { class: "section-border" }, [background]);
  const content = element("div", { class: "content-wrapper" }, [grid]);
  const hero = element("section", { class: "page-section", "data-section-id": sample.heroSectionId }, [border, content]);
  const modules = element("div", { id: "species-output" }, [element("div", { id: "species-info" }), element("div", { id: "species-taxonomy" }), element("div", { id: "species-status" })]);
  const main = element("main", { id: "page" }, [hero, element("section", { class: "page-section", "data-section-id": "species-details" }, [modules])]);
  const headerImage = element("img", { src: "header-logo.jpg" });
  headerImage.complete = false;
  headerImage.addEventListener = (name, callback) => { if (name === "load") headerLoads.push(callback); };
  const header = element("header", { id: "header" }, [headerImage]);
  header.getBoundingClientRect = () => ({ height });
  const root = element("body", {}, [header, main]);
  const documentElement = element("html", {}, [root]);
  const document = { documentElement, body: root, readyState: loading ? "loading" : "complete", baseURI: "https://www.fnwildlifetravel.de" + sample.path,
    querySelectorAll: selector => documentElement.querySelectorAll(selector), querySelector: selector => documentElement.querySelector(selector),
    getElementById: id => documentElement.querySelector("#" + id), addEventListener: (name, callback) => documentEvents.set(name, callback),
    fonts: { ready: { then: callback => fontLoads.push(callback) } },
  };
  const parts = { element, root, documentElement, main, hero, header, grid, titleBlock, titleContent, heading, richText, buttonBlock, link, image, background, border, content, modules };
  prepare?.(parts);
  const window = { location: { pathname: path }, requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; }, cancelAnimationFrame: id => frames.delete(id),
    addEventListener(name, callback) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(callback); },
    removeEventListener: (name, callback) => events.get(name)?.delete(callback),
  };
  const context = vm.createContext({ document, window, URL,
    MutationObserver: mutationObserver ? class {
      constructor(callback) { this.callback = callback; this.kind = "mutation"; this.registrations = []; observers.push(this); }
      observe(target, options) { this.registrations = this.registrations.filter(entry => entry.target !== target); this.registrations.push({ target, options }); this.active = true; }
      disconnect() { this.active = false; this.registrations = []; }
    } : undefined,
    ResizeObserver: resizeObserver ? class { constructor(callback) { this.callback = callback; this.kind = "resize"; observers.push(this); } observe(target) { this.target = target; this.active = true; } disconnect() { this.active = false; } } : undefined,
  });
  const evaluate = () => new vm.Script(source, { filename: "species-hero-layout.js" }).runInContext(context);
  evaluate();
  function mutation(record) {
    for (const observer of observers.filter(entry => entry.kind === "mutation" && entry.active)) {
      const delivered = observer.registrations.some(({ target, options }) => {
        if (record.target !== target && !(options.subtree && target.contains(record.target))) return false;
        if (!options[record.type]) return false;
        return record.type !== "attributes" || !options.attributeFilter || options.attributeFilter.includes(record.attributeName);
      });
      if (delivered) observer.callback([record]);
    }
  }
  return { ...parts, document, window, observers, frames, evaluate, writes: () => writes,
    measure: value => { height = value; }, flush() { const batch = [...frames]; frames.clear(); batch.forEach(([, callback]) => callback()); },
    event: name => { for (const callback of [...events.get(name) || []]) callback(); },
    mutation: (target = hero) => mutation({ type: "childList", target }),
    attributeMutation: (name, target = hero) => mutation({ type: "attributes", attributeName: name, target }),
    textMutation: (target = heading) => mutation({ type: "characterData", target }),
    resize() { observers.filter(observer => observer.kind === "resize" && observer.active).forEach(observer => observer.callback([])); },
    logoLoad: () => headerLoads.forEach(callback => callback()), fontsReady: () => fontLoads.forEach(callback => callback()),
    domReady: () => documentEvents.get("DOMContentLoaded")?.(), listeners: name => events.get(name)?.size || 0,
  };
}

for (const sample of fixture.samples) test("Gebundene Artseitenstruktur: " + sample.path + " / " + (sample.blocks[0].textColorClasses.join() || "Standardfarbe"), () => {
  const p = page({ sample });
  assert.equal(p.hero.getAttribute(markerName), markerValue);
  assert.equal(p.hero.style.getPropertyValue(heightName), "84px");
  assert.equal(p.observers.length, 2);
});

test("Originalfoto, verschachtelter Titel, Rücklink und Knotenfolge bleiben unverändert", () => {
  const p = page(), children = p.hero.children.slice(), gridChildren = p.grid.children.slice();
  const before = { src: p.image.getAttribute("src"), dimensions: p.image.getAttribute("data-image-dimensions"), title: p.heading.textContent, href: p.link.getAttribute("href"), label: p.link.textContent, span: p.richText };
  p.measure(191.9); p.resize(); p.flush();
  assert.deepEqual(p.hero.children, children); assert.deepEqual(p.grid.children, gridChildren);
  assert.equal(p.image.getAttribute("src"), before.src); assert.equal(p.image.getAttribute("data-image-dimensions"), before.dimensions);
  assert.equal(p.heading.textContent, before.title); assert.equal(p.link.getAttribute("href"), before.href); assert.equal(p.link.textContent, before.label);
  assert.equal(p.heading.children[0], before.span);
});

test("Headerreserve folgt Mobil/Tablet/Desktop aufgerundet, unabhängig von der Breite", () => {
  const p = page();
  for (const [height, expected] of [[83.808, "84px"], [191.875, "192px"], [116.2, "117px"], [82.05, "83px"]]) {
    p.measure(height); p.resize(); p.flush(); assert.equal(p.hero.style.getPropertyValue(heightName), expected);
  }
});

test("Resize-Ersatz, Logo- und Schriftladung funktionieren auch ohne ResizeObserver", () => {
  const p = page({ resizeObserver: false });
  p.measure(191.5); p.event("resize"); p.flush(); assert.equal(p.hero.style.getPropertyValue(heightName), "192px");
  p.measure(116.5); p.logoLoad(); p.flush(); assert.equal(p.hero.style.getPropertyValue(heightName), "117px");
  p.measure(84.1); p.fontsReady(); p.flush(); assert.equal(p.hero.style.getPropertyValue(heightName), "85px");
});

test("Wiederholte Ereignisse, Eigenmutationen und doppelte Skriptladung bleiben ruhig", () => {
  const p = page(), writes = p.writes();
  p.resize(); p.mutation(); p.logoLoad(); p.fontsReady();
  assert.equal(p.frames.size, 1); p.flush(); assert.equal(p.writes(), writes);
  p.evaluate(); assert.equal(p.observers.length, 2); assert.equal(p.listeners("resize"), 1);
  assert.equal(p.writes(), writes);
  const registrations = p.observers.find(o => o.kind === "mutation").registrations;
  assert.ok(registrations.some(entry => entry.target === p.hero && entry.options.subtree));
  assert.ok(registrations.some(entry => entry.target === p.documentElement && entry.options.subtree
    && JSON.stringify(entry.options.attributeFilter) === '["id"]' && !entry.options.characterData));
  assert.equal(p.observers.find(o => o.kind === "resize").target, p.header);
});

test("Bekannte, später fremd erweiterte Hero-Struktur verliert den Layoutmarker", () => {
  const p = page();
  p.grid.append(p.element("div", { class: "fe-block" }, [], "Fremder Inhalt"));
  p.mutation(); p.flush(); assert.equal(p.hero.getAttribute(markerName), null);
  p.grid.children.pop(); p.mutation(); p.flush(); assert.equal(p.hero.getAttribute(markerName), markerValue);
});

test("Geänderter Rücklink stoppt die Gestaltung; Originalwerte werden nicht zurückgeschrieben", () => {
  const p = page();
  p.link.setAttribute("href", "/contact"); p.mutation(); p.flush();
  assert.equal(p.hero.getAttribute(markerName), null); assert.equal(p.link.getAttribute("href"), "/contact");
});

test("Das Entfernen beider Bildquellen wird durch die tatsächlichen Attributfilter erkannt", () => {
  const p = page({ prepare({ image }) { image.attributes.set("data-src", image.getAttribute("src")); } });
  p.image.attributes.delete("src"); p.attributeMutation("src"); p.flush();
  assert.equal(p.hero.getAttribute(markerName), markerValue, "Noch vorhandenes data-src bleibt eine gültige Quelle");
  p.image.attributes.delete("data-src"); p.attributeMutation("data-src"); p.flush();
  assert.equal(p.hero.getAttribute(markerName), null);
  p.image.attributes.set("src", "https://images.squarespace-cdn.com/restored.jpg"); p.attributeMutation("src"); p.flush();
  assert.equal(p.hero.getAttribute(markerName), markerValue);
});

test("Unlesbare Headerhöhe deaktiviert und gültige spätere Messung aktiviert wieder", () => {
  const p = page();
  for (const invalid of [0, -2, NaN, Infinity]) { p.measure(invalid); p.resize(); p.flush(); assert.equal(p.hero.getAttribute(markerName), null); }
  p.measure(116.2); p.resize(); p.flush(); assert.equal(p.hero.getAttribute(markerName), markerValue);
});

test("Ein zunächst noch leerer Header bekommt erst nach gültiger Messung das Layout", () => {
  const p = page({ initialHeight: 0 }); assert.equal(p.hero.getAttribute(markerName), null);
  p.measure(191.2); p.logoLoad(); p.flush(); assert.equal(p.hero.getAttribute(markerName), markerValue);
  assert.equal(p.hero.style.getPropertyValue(heightName), "192px");
});

test("Absoluter regionaler Rücklink mit abschließendem Schrägstrich bleibt erhalten", () => {
  const target = "https://www.fnwildlifetravel.de/wildlife/heimische-tierwelt/";
  const p = page({ prepare({ link }) { link.attributes.set("href", target); } });
  assert.equal(p.hero.getAttribute(markerName), markerValue); assert.equal(p.link.getAttribute("href"), target);
});

test("Ausstehendes DOM wird erst nach DOMContentLoaded erkannt", () => {
  const p = page({ loading: true }); assert.equal(p.writes(), 0); assert.equal(p.observers.length, 0);
  p.domReady(); assert.equal(p.hero.getAttribute(markerName), markerValue);
});

test("Neue Art mit gleichem Template braucht keine neue Block-ID-Liste", () => {
  const p = page({ path: "/wildlife/heimische-tierwelt/neueart", prepare({ hero, heading, image }) {
    hero.setAttribute("data-section-id", "new-unlisted-section"); heading.textContent = "Neue Art – Titel"; image.setAttribute("src", "https://images.squarespace-cdn.com/new-photo.jpg");
  } });
  assert.equal(p.hero.getAttribute(markerName), markerValue); assert.equal(p.heading.textContent, "Neue Art – Titel");
});

test("Pagehide hält Beobachter an, Pageshow verbindet genau einmal und misst neu", () => {
  const p = page(); p.resize(); assert.equal(p.frames.size, 1);
  p.event("pagehide"); assert.equal(p.frames.size, 0); assert.ok(p.observers.every(o => !o.active)); assert.equal(p.listeners("resize"), 0);
  const writes = p.writes(); p.resize(); p.event("resize"); p.flush(); assert.equal(p.writes(), writes);
  p.measure(191.2); p.event("pageshow"); p.event("pageshow");
  assert.equal(p.hero.style.getPropertyValue(heightName), "192px"); assert.equal(p.listeners("resize"), 1); assert.ok(p.observers.every(o => o.active));
});

test("Ein Seitenwechsel ohne Neuladung wendet das alte Hero-Layout nicht anderswo an", () => {
  const p = page(); p.window.location.pathname = "/home"; p.resize(); p.flush(); assert.equal(p.hero.getAttribute(markerName), null);
});

test("Das Entfernen einer Artmodulgruppe wird ohne Resize bemerkt und kann wieder freigegeben werden", () => {
  const p = page(), removed = p.main.children.pop();
  p.mutation(p.main); p.flush();
  assert.equal(p.hero.getAttribute(markerName), null);
  p.main.append(removed); p.mutation(p.main); p.flush();
  assert.equal(p.hero.getAttribute(markerName), markerValue);
});

test("Geänderte oder außerhalb des Heros duplizierte Modulkennungen werden ohne Resize bemerkt", () => {
  const p = page(), module = p.modules.children[0];
  module.setAttribute("id", "removed-species-info"); p.attributeMutation("id", module); p.flush();
  assert.equal(p.hero.getAttribute(markerName), null);
  module.setAttribute("id", "species-info"); p.attributeMutation("id", module); p.flush();
  assert.equal(p.hero.getAttribute(markerName), markerValue);
  p.root.append(p.element("div", { id: "species-info" })); p.mutation(p.root); p.flush();
  assert.equal(p.hero.getAttribute(markerName), null);
});

test("Header- und Seitenanker müssen auch nach einer Kennungsänderung die ursprünglichen sein", () => {
  for (const anchor of ["header", "main"]) {
    const p = page(), node = p[anchor], id = node.getAttribute("id");
    node.setAttribute("id", "foreign-anchor"); p.attributeMutation("id", node); p.flush();
    assert.equal(p.hero.getAttribute(markerName), null, anchor);
    node.setAttribute("id", id); p.attributeMutation("id", node); p.flush();
    assert.equal(p.hero.getAttribute(markerName), markerValue, anchor);
  }
});

test("Doppelte Header-/Seitenanker und ein ersetzter Body entziehen die Freigabe ohne Resize", () => {
  for (const [tag, id] of [["header", "header"], ["main", "page"]]) {
    const p = page(); p.root.append(p.element(tag, { id })); p.mutation(p.root); p.flush();
    assert.equal(p.hero.getAttribute(markerName), null, id);
  }
  const p = page(), body = p.documentElement.children.pop();
  p.mutation(p.documentElement); p.flush(); assert.equal(p.hero.getAttribute(markerName), null);
  p.documentElement.append(body); p.mutation(p.documentElement); p.flush();
  assert.equal(p.hero.getAttribute(markerName), markerValue);
});

test("Neu hinzugefügte Interaktivität am bekannten Wrapper stoppt das Layout sofort", () => {
  for (const [name, value] of [["contenteditable", "true"], ["tabindex", "0"], ["role", "button"], ["onclick", "foreignAction()"]]) {
    const p = page();
    p.content.setAttribute(name, value); p.attributeMutation(name, p.content); p.flush();
    assert.equal(p.hero.getAttribute(markerName), null, name);
    p.content.attributes.delete(name); p.attributeMutation(name, p.content); p.flush();
    assert.equal(p.hero.getAttribute(markerName), markerValue, name);
  }
});

test("Eigene Marker- und Reserveschreibvorgänge erzeugen keine Beobachterschleife", () => {
  const p = page(), writes = p.writes();
  p.attributeMutation(markerName); p.attributeMutation("style");
  assert.equal(p.frames.size, 0);
  p.mutation(p.modules); p.flush();
  assert.equal(p.writes(), writes);
});

test("Bekannte leere CMS-Wrapper, Inlineformatierungen und unveränderte Styleknoten bleiben erhalten", () => {
  const p = page({ prepare({ element, content, heading, richText }) {
    content.append(element("div", { class: "empty-cms-wrapper" }));
    content.append(element("style", {}, [], ".existing-cms-grid { display: grid; }"));
    richText.append(element("strong", {}, [], ""));
    heading.append(element("br"));
  } });
  assert.equal(p.hero.getAttribute(markerName), markerValue);
  assert.equal(p.content.children.at(-1).textContent, ".existing-cms-grid { display: grid; }");
});

for (const [name, value] of [["usemap", "#audit-map"], ["usemap", ""], ["ismap", ""], ["ismap", "ismap"]]) {
  test("Bildkartenattribut " + name + "=" + JSON.stringify(value) + " verhindert jede Layoutmarkierung", () => {
    const p = page({ prepare({ image, root, element }) {
      image.setAttribute(name, value);
      root.append(element("map", { name: "audit-map" }, [element("area", { shape: "rect", coords: "0,0,30,30", href: "/contact" })]));
    } });
    assert.equal(p.hero.getAttribute(markerName), null);
    assert.equal(p.hero.style.getPropertyValue(heightName), "");
    assert.equal(p.observers.length, 0);
    assert.equal(p.image.getAttribute(name), value, "Die Bildkartenfunktion bleibt unverändert");
  });
}

test("Später hinzugefügte Bildkartenattribute entziehen die Markierung auch bei leerem Wert", () => {
  for (const name of ["usemap", "ismap"]) {
    const p = page();
    p.image.setAttribute(name, ""); p.attributeMutation(name, p.image); p.flush();
    assert.equal(p.hero.getAttribute(markerName), null, name);
    assert.equal(p.image.getAttribute(name), "", name);
    p.image.attributes.delete(name); p.attributeMutation(name, p.image); p.flush();
    assert.equal(p.hero.getAttribute(markerName), markerValue, name);
  }
});

for (const [label, options] of [
  ["Home", { path: "/home" }], ["Spenden", { path: "/spenden" }], ["Reiseseite", { path: "/reisen/2021-neapel/vesuv" }],
  ["Artenliste", { path: "/wildlife/heimische-tierwelt" }], ["nicht inventarisierte Region", { path: "/wildlife/asien/neueart" }],
  ["fehlender Header", { prepare({ root }) { root.children.shift(); } }],
  ["fehlendes Artmodul", { prepare({ modules }) { modules.children.pop(); } }],
  ["doppeltes Artmodul", { prepare({ root, element }) { root.append(element("div", { id: "species-info" })); } }],
  ["fremder Hero-Zusatz", { prepare({ hero, element }) { hero.append(element("div", {}, [], "Unbekannt")); } }],
  ["freier DIV-Text neben dem Hintergrund", { prepare({ border, element }) { border.append(element("div", {}, [], "Unbekannte wichtige Zusatzinformation")); } }],
  ["Bildlegende neben dem Hintergrund", { prepare({ border, element }) { border.append(element("p", {}, [], "Unbekannte Bildlegende")); } }],
  ["freier DIV-Text neben dem Raster", { prepare({ content, element }) { content.append(element("div", {}, [], "Unbekannter Zusatzinhalt")); } }],
  ["freier DIV-Text neben dem Titelcontainer", { prepare({ titleBlock, element }) { titleBlock.append(element("div", {}, [], "Unbekannter Titelzusatz")); } }],
  ["fremder Link neben dem Hintergrund", { prepare({ border, element }) { border.append(element("a", { href: "https://other.test/" }, [], "Fremder wichtiger Link")); } }],
  ["Eingabe neben dem Raster", { prepare({ content, element }) { content.append(element("input")); } }],
  ["zweites Bild neben dem Raster", { prepare({ content, element }) { content.append(element("img", { src: "extra.jpg" })); } }],
  ["freier Text direkt im Hero", { prepare({ hero }) { hero.ownText = "Unbekannter freier Hero-Text"; } }],
  ["freier Text direkt im Rückknopfblock", { prepare({ buttonBlock }) { buttonBlock.ownText = "Unbekannter freier Button-Zusatz"; } }],
  ["Frame neben dem Raster", { prepare({ content, element }) { content.append(element("iframe", { src: "https://other.test/" })); } }],
  ["weiterer Link außerhalb des Rasters", { prepare({ content, element }) { content.append(element("a", { href: "/contact" }, [], "Zusätzliche Kontaktaktion")); } }],
  ["weitere Überschrift außerhalb des Rasters", { prepare({ content, element }) { content.append(element("h3", {}, [], "Zweite wichtige Überschrift")); } }],
  ["leerer bearbeitbarer Zusatz", { prepare({ border, element }) { border.append(element("div", { contenteditable: "true" })); } }],
  ["leerer Tastaturfokus-Zusatz", { prepare({ content, element }) { content.append(element("div", { tabindex: "0" })); } }],
  ["leere unbekannte Aktionsrolle", { prepare({ content, element }) { content.append(element("div", { role: "button" })); } }],
  ["leerer Ereigniszusatz", { prepare({ content, element }) { content.append(element("div", { onpointerdown: "foreignAction()" })); } }],
  ["unbekannte Zeichenfläche", { prepare({ content, element }) { content.append(element("canvas")); } }],
  ["unbekanntes SVG neben dem Hintergrund", { prepare({ border, element }) { border.append(element("svg")); } }],
  ["fremdes Element im Titel", { prepare({ heading, element }) { heading.append(element("object", { data: "foreign.svg" })); } }],
  ["drittes Rasterelement", { prepare({ grid, element }) { grid.append(element("div", { class: "fe-block" }, [], "Unbekannt")); } }],
  ["zweites Hintergrundbild", { prepare({ background, element }) { background.append(element("img", { src: "second.jpg" })); } }],
  ["Videohintergrund", { prepare({ background, element }) { background.append(element("video")); } }],
  ["Hintergrund-Eingabefeld", { prepare({ background, element }) { background.append(element("input")); } }],
  ["Hintergrund-Auswahlliste", { prepare({ background, element }) { background.append(element("select")); } }],
  ["Hintergrund-Textfeld", { prepare({ background, element }) { background.append(element("textarea")); } }],
  ["leeres Bildziel", { prepare({ image }) { image.attributes.delete("src"); } }],
  ["leerer Titel", { prepare({ heading }) { heading.textContent = " "; } }],
  ["zusätzlicher Titeltext", { prepare({ titleContent, element }) { titleContent.append(element("p", {}, [], "Zusatz")); } }],
  ["zusätzlicher freier Titeltext", { prepare({ titleContent }) { titleContent.ownText = "Zusatz"; } }],
  ["fremdes Eingabefeld", { prepare({ buttonBlock, element }) { buttonBlock.append(element("input")); } }],
  ["Titel als Unterüberschrift", { prepare({ heading }) { heading.tagName = "H4"; } }],
  ["andere Linkregion", { prepare({ link }) { link.attributes.set("href", "/wildlife/afrika"); } }],
  ["externer Rücklink", { prepare({ link }) { link.attributes.set("href", "https://other.test/wildlife/heimische-tierwelt"); } }],
  ["Rücklink mit Aktion", { prepare({ link }) { link.attributes.set("href", "/wildlife/heimische-tierwelt?change=1"); } }],
  ["anderer Knopftext", { prepare({ link }) { link.textContent = "Weiter"; } }],
  ["fehlender MutationObserver", { mutationObserver: false }],
]) test(label + " bleibt vollständig ohne Layoutschreibvorgang oder Beobachter", () => {
  const p = page(options);
  // Fixture setup may itself set attributes; only module-owned writes matter here.
  assert.equal(p.hero.getAttribute(markerName), null); assert.equal(p.hero.style.getPropertyValue(heightName), ""); assert.equal(p.observers.length, 0);
});

// These are stylesheet scope/breakpoint contracts. Actual geometry and readability
// still require the separate native desktop/tablet/mobile browser acceptance.
function assertHeroCssScope(text) {
  const css = heroStylesheet(text).replace(/\/\*[\s\S]*?\*\//g, "");
  assert(!css.includes("contained-title-below-v1"));
  for (const [, head] of css.matchAll(/([^{}]+)\{/g)) {
    if (head.trim().startsWith("@media")) continue;
    for (const selector of head.trim().split(/,(?![^()]*\))/)) {
      assert(selector.trim().startsWith('section[data-fn-species-hero="' + markerValue + '"]'), "Unscoped hero selector: " + selector);
    }
  }
  assert.match(css, /object-fit:\s*cover\s*!important/);
  assert(!/object-fit:\s*contain/.test(css));
  assert(!/object-position\s*:/.test(css), "Each original image focal point stays inherited");
  assert.match(css, /white-space:\s*normal/);
  assert.match(css, /word-break:\s*normal/);
}

test("Hero-CSS bleibt auf den erkannten responsiven Art-Hero beschränkt", () => {
  assertHeroCssScope(stylesheet);
});

test("Hero-Testgrenze trennt nachfolgenden Fachblock, ohne fremde Selektoren im Hero zu erlauben", () => {
  const hero = heroStylesheet();
  const appended = hero + '\n\n/* Separate map layout. */\n@media (width < 768px) { body { margin: 0; } }';
  assert.equal(heroStylesheet(appended), hero);
  assertHeroCssScope(appended);
  assert.throws(() => assertHeroCssScope(hero + '\nbody { margin: 0; }'), /Unscoped hero selector/);
});

test("Hero-Testgrenze verlangt einen eindeutigen vollständigen Marker", () => {
  assert.throws(() => heroStylesheet("body { margin: 0; }"), /One distinct Species hero block/);
  assert.throws(() => heroStylesheet(heroStylesheet() + '\n/* Species hero duplicate. */'), /One distinct Species hero block/);
  assert.throws(() => heroStylesheet('body {\n' + heroStylesheet()), /Hero heading must be at stylesheet top level/);
  assert.throws(() => heroStylesheet('/* Unrelated comment\n/* Species hero hidden. */'), /actual top-level comment/);
});

test("Hero-Testgrenze weist unvollständige Regeln, Kommentare und Zeichenketten zurück", () => {
  const hero = heroStylesheet();
  assert.throws(() => heroStylesheet(hero + '\n@media (min-width: 768px) {\n/* Separate map layout. */'), /Balanced hero stylesheet/);
  assert.throws(() => heroStylesheet(hero + '\n/* Incomplete heading'), /Closed stylesheet comment/);
  assert.throws(() => heroStylesheet(hero + '\nbody { content: "unfinished'), /Closed stylesheet string/);
  assert.throws(() => heroStylesheet(hero + '\n}'), /Balanced stylesheet before/);
  assert.throws(() => heroStylesheet(hero + '\n/* Separate map layout. */ body {}'), /heading must end its own line/);
});

test("Hero-Testgrenze behandelt innere Kommentare und Klammern in Zeichenketten nicht als Fachgrenze", () => {
  const hero = heroStylesheet();
  const nested = hero + '\n@media (min-width: 768px) {\n/* Inner comment. */\nbody { content: "}"; }\n}';
  assert.equal(heroStylesheet(nested), nested);
  assert.throws(() => assertHeroCssScope(nested), /Unscoped hero selector/);
});

test("Nur unter 768px steht der Titel darunter; Desktop und Tablet behalten ihre native Überlagerung", () => {
  const css = heroStylesheet();
  const pieces = css.split("@media not all and (min-width: 768px)");
  assert.equal(pieces.length, 2, "One complementary mobile transition is required");
  assert.match(pieces[0], /--fn-species-hero-title-mode:\s*overlay/);
  assert.match(pieces[1], /--fn-species-hero-title-mode:\s*below/);
  assert.match(pieces[1], /> \.section-border\s*\{[^}]*position:\s*relative/s);
  assert.match(pieces[1], /> \.content-wrapper\s*\{[^}]*position:\s*relative/s);
  assert(!/background(?:-color)?\s*:/.test(css), "No newly invented photo background or title panel");
});

test("Mobilfarbe und Overlay haben auch bei 767.5 CSS-px genau komplementäre Grenzen", () => {
  const css = heroStylesheet();
  const media = [...css.matchAll(/@media\s+([^{}]+)\{([\s\S]*?)\n\}/g)].map(([, query, body]) => ({ query: query.trim(), body }));
  const mobile = media.find(rule => /color:\s*#000000/.test(rule.body));
  assert(mobile, "The actual mobile stylesheet query is required");
  assert.match(css.slice(0, css.indexOf("@media")), /--fn-species-hero-title-mode:\s*overlay/);
  // Evaluate only the conventional min/max-width queries used by this block.
  // This regression guards the actual source boundary, not a native layout claim.
  function matches(query, width) {
    const bound = query.match(/\((min|max)-width:\s*([\d.]+)px\)/);
    assert(bound, "Unexpected hero media query");
    const result = bound[1] === "min" ? width >= Number(bound[2]) : width <= Number(bound[2]);
    return query.startsWith("not all and ") ? !result : result;
  }
  for (const width of [390, 767, 767.5, 767.999, 768, 768.1, 1280]) {
    assert.equal(matches(mobile.query, width), width < 768, "Schwarze Mobilfarbe bei " + width);
    assert.equal(!matches(mobile.query, width), width >= 768, "Native Überlagerung bei " + width);
  }
});

for (const originalColor of ["#ffffff", "#ffff00"]) {
  test("Mobile Überschrift ist auch aus " + originalColor + " exakt schwarz; ab 768px bleibt die Ursprungsfarbe", () => {
    const css = heroStylesheet();
    const mobile = css.match(/@media not all and \(min-width: 768px\)\s*\{([\s\S]*?)\n\}/);
    assert(mobile, "The exact complementary mobile rule is required");
    assert.match(mobile[1], /\.sqs-html-content\s*,/);
    assert.match(mobile[1], /\.sqs-html-content \*\s*\{/);
    const color = mobile[1].match(/(?:^|[;{])\s*color:\s*(#[0-9a-f]{6})\s*!important\s*;/i);
    assert(color, "The mobile rule must override nested white/accent title spans");
    const outsideMobile = css.replace(mobile[0], "");
    const headingRules = [...outsideMobile.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selector]) => /\.sqs-html-content|\.sqsrte-text-color--/.test(selector));
    assert(headingRules.every(([, , body]) => !/(?:^|;)\s*color\s*:/.test(body)), "Desktop/tablet title colors must stay inherited");
    // This checks the actual scoped declaration and source boundary. Browser
    // computed colors and CSS cascade remain part of Root's native acceptance.
    for (const width of [390, 767, 767.5, 767.999, 768, 1280]) {
      const resolved = width < 768 ? color[1].toLowerCase() : originalColor;
      assert.equal(resolved, width < 768 ? "#000000" : originalColor, "Title color at " + width);
    }
  });
}

// A small declaration model for this scoped block, not a browser renderer. Its
// native defaults are the 2026-10-25 Erdbeerfröschchen HTML/site.css reference:
// full-bleed, medium min-height 66vh, cover, authored focus and 0.11 overlay.
// This tests geometry consequences of the actual declarations, including the old
// contain/clamp regression; screenshots and complete CSS cascade remain native.
function heroGeometryStyles(width) {
  const css = heroStylesheet().replace(/\/\*[\s\S]*?\*\//g, "");
  const root = css.match(/section\[data-fn-species-hero="[^"]+"\]/)?.[0];
  assert(root);
  const rules = [];
  function parse(text, active = true) {
    for (let cursor = 0; cursor < text.length;) {
      const open = text.indexOf("{", cursor);
      if (open < 0) break;
      let end = open + 1, depth = 1;
      while (depth && end < text.length) { if (text[end] === "{") depth++; if (text[end] === "}") depth--; end++; }
      assert.equal(depth, 0, "Balanced hero stylesheet block");
      const head = text.slice(cursor, open).trim(), body = text.slice(open + 1, end - 1);
      if (head.startsWith("@media")) {
        const query = head.slice(6).trim(), bound = query.match(/\((min|max)-width:\s*([\d.]+)px\)/);
        assert(bound, "Known width query only");
        const matches = bound[1] === "min" ? width >= Number(bound[2]) : width <= Number(bound[2]);
        parse(body, active && (query.startsWith("not all and ") ? !matches : matches));
      } else if (active) {
        const declarations = Object.fromEntries(body.split(";").filter(line => line.includes(":")).map(line => {
          const colon = line.indexOf(":");
          return [line.slice(0, colon).trim(), line.slice(colon + 1).replace(/\s*!important\s*$/, "").trim()];
        }));
        for (const selector of head.split(/,(?![^()]*\))/)) rules.push({ selector: selector.trim(), declarations });
      }
      cursor = end;
    }
  }
  parse(css);
  const style = suffix => Object.assign({}, ...rules.filter(rule => rule.selector === root + suffix).map(rule => rule.declarations));
  return { hero: style(""), border: style(" > .section-border"), image: style(" .section-background img"),
    wrapper: style(" > .content-wrapper"), overlay: style(" .section-background-overlay") };
}

function photoGeometry(width, height, imageWidth, imageHeight) {
  const styles = heroGeometryStyles(width);
  const length = value => {
    if (/^var\(--[a-z-]+\)$/.test(value)) return length(styles.hero[value.slice(4, -1)]);
    const clamp = value.match(/^clamp\(([^,]+),([^,]+),([^,]+)\)$/);
    if (clamp) return Math.max(length(clamp[1].trim()), Math.min(length(clamp[2].trim()), length(clamp[3].trim())));
    const unit = value.match(/^([\d.]+)(px|vw|vh)$/);
    assert(unit, "Known photo length: " + value);
    return Number(unit[1]) * (unit[2] === "vw" ? width / 100 : unit[2] === "vh" ? height / 100 : 1);
  };
  const boxHeight = length(styles.border.height || "66vh");
  const fit = styles.image["object-fit"] || "cover";
  assert(["cover", "contain"].includes(fit));
  const scale = (fit === "cover" ? Math.max : Math.min)(width / imageWidth, boxHeight / imageHeight);
  return { styles, boxHeight, visibleWidth: imageWidth * scale, visibleHeight: imageHeight * scale };
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
  test("Referenzgeometrie füllt die Breite ohne helle Balken: " + viewport.width, () => {
    for (const [width, height] of [[7450, 4967], [4081, 3061], [4000, 6000], [6000, 2000]]) {
      const result = photoGeometry(viewport.width, viewport.height, width, height);
      assert(result.visibleWidth >= viewport.width - 0.001, "No horizontal letterboxing for " + width + "x" + height);
      assert(result.visibleHeight >= result.boxHeight - 0.001, "No vertical letterboxing");
      assert(Math.abs(result.boxHeight - 0.66 * viewport.height) < 0.001, "Native medium reference, no 580px cap");
      assert.equal(result.styles.image["object-position"], undefined, "Authored non-central focus stays untouched");
      assert.deepEqual(result.styles.overlay, {}, "Neither original overlay display nor opacity is overridden");
    }
  });
}

test("Desktop/Tablet-Fotogeometrie und Titelcontainer bleiben im nativen Squarespace-Modell", () => {
  for (const width of [768, 1024, 1280, 1920]) {
    const styles = heroGeometryStyles(width);
    assert.deepEqual(styles.border, {}, "Native full-bleed background still owns the original section height");
    assert.deepEqual(styles.wrapper, {}, "Native middle-aligned grid retains its title overlay");
    assert.equal(styles.hero["--fn-species-hero-title-mode"], "overlay");
    for (const property of ["height", "min-height", "max-height", "padding", "padding-top", "padding-bottom", "background"]) {
      assert.equal(styles.hero[property], undefined, "Do not replace native " + property);
    }
  }
});

test("Mobil fließen Fotoblock und Titelcontainer nacheinander, ohne absolut überlagerten Titel", () => {
  for (const width of [320, 390, 767, 767.5, 767.999]) {
    const styles = heroGeometryStyles(width);
    assert.equal(styles.hero.display, "block");
    assert.equal(styles.hero["--fn-species-hero-title-mode"], "below");
    assert.equal(styles.border.position, "relative");
    assert.equal(styles.wrapper.position, "relative");
    assert.equal(styles.border.inset, "auto");
    assert.equal(styles.wrapper.inset, "auto");
  }
});
