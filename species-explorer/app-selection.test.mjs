import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-selection.js", import.meta.url), "utf8");
const context = vm.createContext({});
new vm.Script(source, { filename: "app-selection.js" }).runInContext(context);
const selection = context.SpeciesExplorerSelection;

function createItem(id) {
  const classes = new Set();
  const attributes = new Map();
  return {
    dataset: { id },
    hidden: false,
    disabled: false,
    tabIndex: 0,
    focus() { this.focused = true; },
    scrollIntoView(options) { this.scrolled = options; },
    getAttribute(name) { return attributes.get(name) ?? null; },
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
    },
    setAttribute(name, value) { attributes.set(name, value); },
    classes,
    attributes,
  };
}

function createFixture({ openDialog = null } = {}) {
  const items = [createItem("amsel"), createItem("loewe")];
  const rendered = [];
  const reset = [];
  const scrolls = [];
  const frames = [];
  const state = {
    species: [{ id: "amsel" }, { id: "loewe" }],
    selectedId: "",
  };
  const elements = {
    speciesList: {
      listeners: new Map(),
      querySelectorAll: () => items,
      addEventListener(type, handler) { this.listeners.set(type, handler); },
    },
    detailPanel: {},
  };
  const windowRef = {
    scrollX: 17,
    scrollY: 93,
    location: { href: "http://127.0.0.1:4177/?mode=test" },
    history: {
      replaceState(_state, _title, url) { this.url = String(url); },
    },
    scrollTo(position) { scrolls.push(position); },
  };
  const controller = selection.createSpeciesSelectionController({
    state,
    elements,
    windowRef,
    documentRef: { querySelector: () => openDialog },
    URLClass: URL,
    renderDetail: (species) => rendered.push(species),
    resetScrollableToTop: (element) => reset.push(element),
    requestFrame: (callback) => frames.push(callback),
  });
  function key(key, target = items.find((item) => item.focused) || items[0], modifiers = {}) {
    const event = { key, target, ...modifiers, preventDefault() { this.defaultPrevented = true; } };
    elements.speciesList.listeners.get("keydown")?.(event);
    return event;
  }
  return { controller, elements, frames, items, rendered, reset, scrolls, state, windowRef, key };
}

test("Artauswahl aktualisiert Zustand, URL und genau einen aktiven Listeneintrag", () => {
  const fixture = createFixture();
  assert.equal(fixture.controller.selectSpecies("loewe"), true);
  assert.equal(fixture.state.selectedId, "loewe");
  assert.equal(fixture.rendered[0].id, "loewe");
  assert.match(fixture.windowRef.history.url, /mode=test&species=loewe/);
  assert.equal(fixture.items[0].classes.has("active"), false);
  assert.equal(fixture.items[0].attributes.get("aria-selected"), "false");
  assert.equal(fixture.items[1].classes.has("active"), true);
  assert.equal(fixture.items[1].attributes.get("aria-selected"), "true");
});

test("Nur der rechte Detailbereich springt nach oben, die Fensterposition bleibt erhalten", () => {
  const fixture = createFixture();
  fixture.controller.selectSpecies("amsel");
  assert.equal(fixture.reset[0], fixture.elements.detailPanel);
  assert.equal(fixture.scrolls.length, 1);
  assert.equal(fixture.scrolls[0].left, 17);
  assert.equal(fixture.scrolls[0].top, 93);
  fixture.frames[0]();
  assert.equal(fixture.scrolls.length, 2);
  assert.equal(fixture.scrolls[1].top, 93);
});

test("Unbekannte Arten verändern weder Auswahl noch Darstellung", () => {
  const fixture = createFixture();
  assert.equal(fixture.controller.selectSpecies("unbekannt"), false);
  assert.equal(fixture.state.selectedId, "");
  assert.equal(fixture.rendered.length, 0);
  assert.equal(fixture.scrolls.length, 0);
});

test("Offene Dialoge werden unabhängig von der Artauswahl erkannt", () => {
  assert.equal(createFixture().controller.hasOpenDialog(), false);
  assert.equal(createFixture({ openDialog: {} }).controller.hasOpenDialog(), true);
});

test("Pfeile, Home und End führen sichtbare Auswahl, Detail, URL und Fokus zusammen", () => {
  const fixture = createFixture();
  const right = fixture.items[1];
  assert.equal(fixture.key("ArrowDown").defaultPrevented, true);
  assert.equal(fixture.state.selectedId, "loewe");
  assert.equal(right.focused, true);
  assert.equal(right.attributes.get("aria-selected"), "true");
  assert.equal(right.tabIndex, 0);
  assert.equal(fixture.items[0].tabIndex, -1);
  assert.equal(fixture.rendered.at(-1).id, "loewe");
  assert.match(fixture.windowRef.history.url, /species=loewe/);
  fixture.key("Home", right);
  assert.equal(fixture.state.selectedId, "amsel");
  fixture.key("End", fixture.items[0]);
  assert.equal(fixture.state.selectedId, "loewe");
  fixture.key("ArrowUp", right);
  assert.equal(fixture.state.selectedId, "amsel");
});

test("Listenränder, geänderte Filter, leere Listen und Modifizierertasten bleiben sicher", () => {
  const fixture = createFixture();
  fixture.key("ArrowUp");
  assert.equal(fixture.state.selectedId, "amsel");
  fixture.key("End");
  fixture.items[0].hidden = true;
  fixture.key("Home", fixture.items[1]);
  assert.equal(fixture.state.selectedId, "loewe");
  const before = fixture.rendered.length;
  assert.equal(fixture.key("Home", fixture.items[1], { ctrlKey: true }).defaultPrevented, undefined);
  assert.equal(fixture.key("Tab", fixture.items[1]).defaultPrevented, undefined);
  assert.equal(fixture.rendered.length, before);
  fixture.items[1].disabled = true;
  assert.equal(fixture.key("ArrowDown").defaultPrevented, undefined);
});

test("Tastatur darf eine dahinterliegende Artenliste bei offenem Dialog nicht ändern", () => {
  const fixture = createFixture({ openDialog: {} });
  fixture.key("ArrowDown");
  assert.equal(fixture.state.selectedId, "");
  assert.equal(fixture.rendered.length, 0);
});

test("Ein direkt fokussierter Listeneintrag wird zum einzigen Tab-Einstieg, ohne fachlich gewählt zu werden", () => {
  const fixture = createFixture();
  fixture.elements.speciesList.listeners.get("focusin")?.({ target: fixture.items[1] });
  assert.equal(fixture.items[0].tabIndex, -1);
  assert.equal(fixture.items[1].tabIndex, 0);
  assert.equal(fixture.state.selectedId, "");
  assert.equal(fixture.rendered.length, 0);
});
