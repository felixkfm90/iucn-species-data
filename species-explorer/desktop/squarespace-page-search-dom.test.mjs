import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { squarespacePageSearchDom } from "./squarespace-page-search-dom.mjs";

const ADMIN = "https://vanilla-gerbil-jwnp.squarespace.com/config/pages";
const CONTROL = "wildlife/heimische-tierwelt", TARGET = CONTROL + "/pruefart";
const EPOCH = 1794333258856, INPUT_ID = ":r8:";

function fixture(mode = "closed", query = "") {
  function matches(node, selector) {
    const tag = selector.match(/^[a-z][\w-]*/i)?.[0];
    if (tag && node.tagName !== tag.toUpperCase()) return false;
    return [...selector.matchAll(/\[([a-z0-9_-]+)(?:="([^"]*)")?\]/gi)].every(([, name, value]) => {
      const attr = node.getAttribute(name);
      return value === undefined ? attr !== null : attr === value;
    });
  }
  function element(tag, attrs = {}, textContent = "", children = []) {
    const node = { tagName: tag.toUpperCase(), attrs, textContent, children: [], parentElement: null,
      style: { display: "block", visibility: "visible", opacity: "1" }, rect: { left: 10, top: 20, right: 40, bottom: 50 },
      getAttribute(key) { return Object.hasOwn(this.attrs, key) ? this.attrs[key] : null; },
      getClientRects() { return this.style.display === "none" ? [] : [this.rect]; },
      getBoundingClientRect() { return this.rect; },
      append(...nodes) { for (const child of nodes) { child.parentElement = this; this.children.push(child); } },
      contains(target) { return this === target || this.children.some(child => child.contains(target)); },
      querySelectorAll(selector) { return this.children.flatMap(child => [
        ...(selector.split(",").some(part => matches(child, part)) ? [child] : []), ...child.querySelectorAll(selector),
      ]); },
    };
    node.append(...children);
    return node;
  }
  const button = element("button", { "aria-label": mode === "closed" ? "Suche öffnen" : "Suche schließen" });
  const input = element("input", { id: INPUT_ID, placeholder: "Suche", autocomplete: "off", value: query });
  input.value = query;
  if (mode === "closed") input.style.display = "none";
  const heading = element("h1", {}, "Seiten"), panel = element("div", { "data-test": "pages-panel" }, "", [heading, button, input]);
  const clear = element("button", { "aria-label": "Suchanfrage löschen" });
  if (query) panel.append(clear);
  const noResults = element("p", {}, "Keine Ergebnisse"), hint = element("div", {}, "Versuche es mit anderen Keywords.");
  const notice = element("div", {}, "", [noResults, hint]);
  const marker = element("button", { "data-test": "collection-settings" }), row = element("div", {}, "", [marker]);
  if (mode === "no-results") panel.append(notice);
  if (mode === "results") panel.append(row);
  const body = element("body", {}, "", [panel]);
  const document = { URL: ADMIN, activeElement: null, documentElement: { clientWidth: 800, clientHeight: 600 },
    querySelectorAll: selector => body.querySelectorAll(selector), elementFromPoint: () => button };
  input.focus = () => { document.activeElement = input; };
  input.select = () => { input.selectionStart = 0; input.selectionEnd = input.value.length; };
  const performance = { timeOrigin: EPOCH };
  const run = (operation, options = {}) => JSON.parse(JSON.stringify(vm.runInNewContext(
    `(${squarespacePageSearchDom.toString()})(${JSON.stringify({ operation, ...options })})`,
    { document, performance, getComputedStyle: node => node.style },
  )));
  return { run, document, performance, element, body, panel, button, input, clear, noResults, hint, notice, marker, row };
}

test("Die Admin-Suche liest vier eindeutig gebundene Zustände und den aktuellen kontrollierten Suchwert", () => {
  for (const [mode, query] of [["closed", ""], ["empty", ""], ["results", CONTROL], ["no-results", TARGET]]) {
    const f = fixture(mode, query);
    assert.deepEqual(f.run("search-state", { query }), { epoch: EPOCH, inputId: INPUT_ID, mode, query });
    assert.equal(f.run("search-state", { query: "veraltet" }), null);
  }
  const result = fixture("results", CONTROL);
  result.marker.style.opacity = "0";
  assert.equal(result.run("search-state").mode, "results");

  const empty = fixture("empty");
  empty.panel.append(empty.clear);
  const emptyState = empty.run("search-state", { query: "" });
  assert.deepEqual(emptyState, { epoch: EPOCH, inputId: INPUT_ID, mode: "empty", query: "" });
  assert.equal(empty.run("search-focus", { expected: emptyState }), true);
  empty.panel.append(empty.element("button", { "aria-label": "Suchanfrage löschen" }));
  assert.equal(empty.run("search-state", { query: "" }), null);
});

test("Der Leerbefund verlangt den bestätigten Suchwert und die beiden Hinweise ohne montierte Treffer", () => {
  for (const mutate of [
    f => { f.input.attrs.value = CONTROL; },
    f => { f.clear.style.display = "none"; },
    f => { f.hint.style.opacity = "0"; },
    f => { f.hint.textContent = "Andere Meldung"; },
    f => { f.notice.children.pop(); f.panel.append(f.hint); },
    f => { f.notice.children.shift(); f.panel.append(f.row); },
    f => { f.notice.append(f.element("div")); },
    f => { f.row.style.display = "none"; f.panel.append(f.row); },
    f => { f.notice.append(f.element("p", {}, "Keine Ergebnisse")); },
  ]) {
    const f = fixture("no-results", TARGET);
    mutate(f);
    assert.equal(f.run("search-state", { query: TARGET }), null);
  }
});

test("Die Admin-Suche weist fremde Dokumente, mehrdeutige Kontrollen sowie Dialoge, Lade- und Fehlerzustände ab", () => {
  for (const mutate of [
    f => { f.document.URL += "?shadow=1"; },
    f => { f.performance.timeOrigin = NaN; },
    f => { f.body.append(f.element("div", { "data-test": "pages-panel" })); },
    f => { f.body.append(f.element("span", { id: INPUT_ID })); },
    f => { f.input.attrs.type = "number"; },
    f => { f.panel.append(f.element("button", { "aria-label": "Suche öffnen" })); },
    f => { f.body.append(f.element("div", { role: "dialog" })); },
    f => { f.panel.attrs["aria-busy"] = "true"; },
    f => { f.panel.append(f.element("progress")); },
    f => { f.panel.append(f.element("div", { role: "alert" }, "Fehler")); },
  ]) {
    const f = fixture("no-results", TARGET);
    mutate(f);
    assert.equal(f.run("search-state"), null);
  }
});

test("Suchaktionen prüfen die vollständige Erwartung sowie den nativen Treffer oder die vollständige Auswahl erneut", () => {
  const closed = fixture(), closedState = closed.run("search-state");
  assert.deepEqual(closed.run("search-open", { expected: closedState }), { point: { x: 25, y: 35 } });
  assert.equal(closed.run("search-close", { expected: closedState }), null);
  assert.equal(closed.run("search-focus", { expected: closedState }), false);
  closed.document.elementFromPoint = () => closed.panel;
  assert.equal(closed.run("search-open", { expected: closedState }), null);

  const open = fixture("no-results", TARGET), openState = open.run("search-state");
  assert.deepEqual(open.run("search-close", { expected: openState }), { point: { x: 25, y: 35 } });
  assert.equal(open.run("search-open", { expected: openState }), null);
  assert.equal(open.run("search-focus", { expected: { ...openState, query: CONTROL } }), false);
  assert.equal(open.document.activeElement, null);
  assert.equal(open.run("search-focus", { expected: openState }), true);
  assert.equal(open.document.activeElement, open.input);
  assert.deepEqual([open.input.selectionStart, open.input.selectionEnd], [0, TARGET.length]);
  assert.equal(open.input.value, TARGET);
  open.input.select = () => { open.input.attrs.value = CONTROL; };
  assert.equal(open.run("search-focus", { expected: openState }), false);
});

test("die geschlossene Suche holt ihren Kopf nach dem Katalog in die Ansicht und bestätigt dasselbe Feld", () => {
  const f = fixture(), expected = f.run("search-state");
  f.button.rect.top = -30;
  f.button.scrollIntoView = options => {
    assert.equal(options.behavior, "instant");
    f.button.rect.top = 20;
  };
  assert.equal(f.run("search-open", { expected, reveal: false }), null);
  assert.deepEqual(f.run("search-open", { expected }), { point: { x: 25, y: 35 } });

  f.button.rect.top = -30;
  f.button.scrollIntoView = () => { f.input.attrs.id = ':r9:'; };
  assert.equal(f.run("search-open", { expected }), null);
});
