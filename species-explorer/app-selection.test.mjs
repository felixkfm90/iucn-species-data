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
    speciesList: { querySelectorAll: () => items },
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
  return { controller, elements, frames, items, rendered, reset, scrolls, state, windowRef };
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
