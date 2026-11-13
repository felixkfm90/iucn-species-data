import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { squarespacePageCreationCatalogDom } from "./squarespace-page-creation-catalog-dom.mjs";

const ORIGIN = "https://vanilla-gerbil-jwnp.squarespace.com";
const ADMIN = `${ORIGIN}/config/pages`;
const MODAL = "m12345678-1234-1234-1234-1234567890ab", EPOCH = 1794333258856;
const OPEN_TITLE = "Der Navigationsgruppe „Nicht verlinkt“ eine neue Seite hinzufügen";

function fixture(mode = "closed", src = "/") {
  function matches(node, selector) {
    const tag = selector.match(/^[a-z][\w-]*/i)?.[0];
    if (tag && node.tagName !== tag.toUpperCase()) return false;
    const id = selector.match(/#([\w-]+)/)?.[1];
    if (id && node.getAttribute("id") !== id) return false;
    return [...selector.matchAll(/\[([a-z0-9_-]+)(?:="([^"]*)")?\]/gi)].every(([, name, value]) => {
      const attr = node.getAttribute(name);
      return value === undefined ? attr !== null : attr === value;
    });
  }
  function element(tag, attrs = {}, ownText = "", children = []) {
    const node = { tagName: tag.toUpperCase(), attrs, ownText, children: [], parentElement: null,
      style: { display: "block", visibility: "visible", opacity: "1" }, rect: { left: 10, top: 20, right: 40, bottom: 50 },
      get textContent() { return this.ownText + this.children.map(child => child.textContent).join(""); },
      get src() { return new URL(this.attrs.src, ORIGIN).href; },
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
  const open = element("button", { title: OPEN_TITLE });
  const group = element("div", { "data-test": "pages-panel-group" }, "", [element("h2", {}, "Nicht verlinkt"), open]);
  const panel = element("div", { "data-test": "pages-panel" }, "", [element("h1", {}, "Seiten"), group]);
  const frame = element("iframe", { id: "sqs-site-frame", src });
  const body = element("body", {}, "", [panel, frame]);
  const dialog = element("div", { role: "dialog", "aria-label": "Abschnittskatalog", "data-modal-id": MODAL,
    "data-guidance-engine": "guidance-engine-section-catalog" });
  const close = element("button", {}, "Schließen");
  // The native button is uppercased by CSS; its textContent is "Schließen".
  close.innerText = "SCHLIESSEN";
  const creative = element("button", {}, "Kreativer Editor Seiten");
  const classicLabel = element("span", {}, "Klassischer Editor Seiten");
  const header = element("div", {}, "", [creative, classicLabel, close]);
  const heading = element("h2", {}, "Seite hinzufügen");
  const add = element("a", { "data-test": "add-blank-options-button" }, "Leeres Element hinzufügen");
  const classic = element("a", { role: "button", "data-allow-link-click": "true" }, "Erstellt mit dem Klassischen Editor →");
  const blankLabel = element("p", {}, "Eine leere Seite hinzufügen");
  const blank = element("a", { "data-test": "category-blank_page", "data-allow-link-click": "true" }, "", [blankLabel]);
  const overlay = element("div");
  if (mode === "pages") {
    dialog.append(heading, add, classic, close);
    overlay.append(dialog);
  } else if (mode === "classic") {
    dialog.append(blank);
    overlay.append(header, dialog);
  }
  if (mode !== "closed") body.append(overlay);
  const document = { URL: ADMIN, documentElement: { clientWidth: 800, clientHeight: 600 },
    querySelectorAll: selector => body.querySelectorAll(selector), elementFromPoint: () => null };
  const performance = { timeOrigin: EPOCH };
  const run = (operation, expected, previous) => JSON.parse(JSON.stringify(vm.runInNewContext(
    `(${squarespacePageCreationCatalogDom.toString()})(${JSON.stringify({ operation, expected, previous })})`,
    { document, performance, URL, getComputedStyle: node => node.style },
  )));
  const hit = (node) => { document.elementFromPoint = () => node; };
  return { run, hit, document, performance, element, body, panel, group, frame, open,
    overlay, dialog, heading, add, classic, header, creative, classicLabel, blank, blankLabel, close };
}

const state = (mode, previewPath = "/") => ({ epoch: EPOCH, mode, modalId: mode === "closed" ? null : MODAL, previewPath });
const point = { point: { x: 25, y: 35 } };

function savedRow(f, title) {
  const caption = f.element("p", {}, title);
  const settings = f.element("button", { "data-test": "collection-settings", "aria-label": `Seiteneinstellungen ${title}` });
  const page = f.element("div", { "data-test": "pages-panel-item" }, "", [caption, settings]);
  const item = f.element("div", { "data-test": "grouped-list-item" }, "", [f.element("div", {}, "", [page])]);
  return { row: f.element("div", { "aria-roledescription": "sortable" }, "", [item]), caption };
}

test("Namensfeld gehört nur zur neuen ersten unverlinkten Zeile und muss fokussiert sein", () => {
  const f = fixture(), old = savedRow(f, "Alte Prüfseite"), other = savedRow(f, "Kontakt"), trailing = savedRow(f, "Weitere Seite");
  f.panel.children.pop();
  const headerWrapper = f.element("div", {}, "", [f.element("div", {}, "", [f.group])]);
  const unlinkedList = f.element("div", {}, "", [old.row]);
  const followingGroup = f.element("div", { "data-test": "pages-panel-group" }, "", [f.element("h2", {}, "Andere Gruppe")]);
  f.panel.append(other.row, headerWrapper, unlinkedList, followingGroup, trailing.row);
  const previous = f.run("draft-name-state");
  assert.deepEqual(previous, { epoch: EPOCH, previewPath: "/", rowCount: 3, titles: ["Alte Prüfseite"],
    outsideTitles: ["Kontakt", "Weitere Seite"], name: null, firstSettingsLabel: "Seiteneinstellungen Alte Prüfseite", defaultSettingsPresent: false });

  const input = Object.assign(f.element("input"), { type: "text", value: "Neue Seite", selectionStart: 0, selectionEnd: 0,
    select() { this.selectionEnd = this.value.length; } });
  const created = f.element("div", { "aria-roledescription": "sortable" }, "", [f.element("button", {}, "Seite löschen"), input]);
  created.parentElement = unlinkedList;
  unlinkedList.children.unshift(created);
  assert.equal(f.run("draft-name-state", undefined, previous), null);
  f.document.activeElement = input;
  assert.equal(f.run("draft-name-state", undefined, previous).name, "Neue Seite");
  const selected = f.run("draft-select-name", undefined, previous);
  assert.equal(selected.selected, true);
  assert.equal(selected.defaultSettingsPresent, false);
  input.value = "";
  input.attrs.placeholder = "Neue Seite";
  assert.equal(f.run("draft-select-name", undefined, previous).defaultName, true);
  input.value = "Neue Seite";

  const competitor = f.element("input");
  other.row.append(competitor);
  assert.equal(f.run("draft-select-name", undefined, previous), null);
  other.row.children.pop();
  old.caption.ownText = "Andere Seite";
  assert.equal(f.run("draft-select-name", undefined, previous), null);
  old.caption.ownText = "Alte Prüfseite";
  trailing.caption.ownText = "Geänderte Seite außerhalb der Gruppe";
  assert.equal(f.run("draft-select-name", undefined, previous), null);
  trailing.caption.ownText = "Weitere Seite";
  input.value = "FN Artseitenentwurf test";
  assert.equal(f.run("draft-select-name", undefined, previous), null);
  assert.equal(f.run("draft-name-state", undefined, previous).name, input.value);

  created.children.pop();
  created.append(f.element("button", { "data-test": "collection-settings", "aria-label": "Seiteneinstellungen FN Artseitenentwurf test" }));
  assert.equal(f.run("draft-name-state", undefined, previous).firstSettingsLabel, "Seiteneinstellungen FN Artseitenentwurf test");
});

test("eine eindeutig gespeicherte Standardseite bleibt von ähnlichen und doppelten Einträgen unterscheidbar", () => {
  const f = fixture(), old = savedRow(f, "Alte Prüfseite"), similar = savedRow(f, "Neue Seite 2");
  const unlinkedList = f.element("div", {}, "", [old.row]);
  const followingGroup = f.element("div", { "data-test": "pages-panel-group" }, "", [f.element("h2", {}, "Andere Gruppe")]);
  f.panel.append(unlinkedList, followingGroup, similar.row);
  const previous = f.run("draft-name-state");
  assert.equal(previous.defaultSettingsPresent, false);

  const existingElsewhere = savedRow(f, "Neue Seite");
  existingElsewhere.row.style.display = "none";
  f.panel.append(existingElsewhere.row);
  assert.equal(f.run("draft-name-state").defaultSettingsPresent, true);
  f.panel.children.pop();

  const created = savedRow(f, "Neue Seite");
  created.row.parentElement = unlinkedList;
  unlinkedList.children.unshift(created.row);
  f.frame.attrs.src = "/neue-seite";
  const persisted = f.run("draft-name-state", undefined, previous);
  assert.deepEqual(persisted, { epoch: EPOCH, previewPath: "/neue-seite", rowCount: 3, titles: ["Neue Seite", "Alte Prüfseite"],
    outsideTitles: ["Neue Seite 2"], name: null, firstSettingsLabel: "Seiteneinstellungen Neue Seite", defaultSettingsPresent: true });

  f.panel.append(existingElsewhere.row);
  assert.equal(f.run("draft-name-state", undefined, previous), null);
});

test("Namensprobe verlangt eine belegte unverlinkte Zeilenfolge vor der nächsten Gruppe", () => {
  const f = fixture();
  const unrelatedSortable = f.element("div", { "aria-roledescription": "sortable" }, "Sortierbare Navigation");
  const followingGroup = f.element("div", { "data-test": "pages-panel-group" }, "", [f.element("h2", {}, "Andere Gruppe")]);
  f.panel.append(unrelatedSortable, followingGroup, savedRow(f, "Andere Seite").row);
  assert.deepEqual(f.run("catalog-state"), state("closed"));
  assert.equal(f.run("draft-name-state"), null);
});

test("Seitenkatalog liefert die Leerseitenposition nur im passenden klassischen Dialog und bei bestätigtem Treffer", () => {
  const closed = fixture();
  assert.deepEqual(closed.run("catalog-state"), state("closed"));
  closed.hit(closed.open);
  assert.deepEqual(closed.run("catalog-open", state("closed")), point);
  assert.equal(closed.run("catalog-classic", state("closed")), null);
  assert.equal(closed.run("catalog-close", state("closed")), null);

  const pages = fixture("pages");
  assert.deepEqual(pages.run("catalog-state"), state("pages"));
  pages.hit(pages.classic);
  assert.deepEqual(pages.run("catalog-classic", state("pages")), point);
  pages.hit(pages.close);
  assert.deepEqual(pages.run("catalog-close", state("pages")), point);
  pages.hit(pages.add);
  assert.equal(pages.run("catalog-blank-point", state("pages")), null);

  const path = "/arten-explorer-funktionsprufung-2026-11-02";
  const classic = fixture("classic", `https://www.fnwildlifetravel.de${path}`);
  assert.deepEqual(classic.run("catalog-state"), state("classic", path));
  classic.hit(classic.blankLabel);
  assert.deepEqual(classic.run("catalog-blank-point", state("classic", path)), point);
  assert.equal(classic.run("catalog-blank-point", state("classic", "/andere-seite")), null);
  assert.equal(classic.run("catalog-blank", state("classic", path)), null);
  assert.equal(classic.run("catalog-open", state("classic", path)), null);
  classic.hit(classic.close);
  assert.equal(classic.run("catalog-blank-point", state("classic", path)), null);
  assert.deepEqual(classic.run("catalog-close", state("classic", path)), point);
});

test("Seitenkatalog verlangt eindeutige Seitengruppe und schließt andere Fensterzustände aus", () => {
  for (const mutate of [
    f => { f.document.URL += "?shadow=1"; },
    f => { f.performance.timeOrigin = 0; },
    f => { f.panel.append(f.element("button", { "aria-label": "Suche schließen" })); },
    f => { f.panel.append(f.element("div", { "data-test": "pages-panel-group" }, "", [f.element("h2", {}, "Nicht verlinkt")])); },
    f => { f.group.append(f.element("button", { title: OPEN_TITLE })); },
    f => { delete f.open.attrs.title; f.open.attrs["aria-label"] = OPEN_TITLE; },
    f => { f.open.attrs["aria-disabled"] = "true"; },
    f => { f.panel.append(f.element("div", { role: "alertdialog" })); },
    f => { f.panel.append(f.element("div", { role: "progressbar" })); },
    f => { f.body.append(f.element("iframe", { id: "sqs-site-frame", src: "/" })); },
    f => { f.frame.attrs.srcdoc = ""; },
  ]) {
    const f = fixture();
    mutate(f);
    f.hit(f.open);
    assert.equal(f.run("catalog-state"), null);
    assert.equal(f.run("catalog-open", state("closed")), null);
  }
  for (const src of ["https://example.test/", "//www.fnwildlifetravel.de/", "/?", "/a/../", "https://name@www.fnwildlifetravel.de/"]) {
    assert.equal(fixture("closed", src).run("catalog-state"), null, src);
  }
});

test("Abschnittskatalog und unklare klassische Dialoge qualifizieren sich nicht als Seitenanlage", () => {
  for (const [mode, mutate] of [
    ["pages", f => { f.heading.ownText = "Abschnitt hinzufügen"; }],
    ["pages", f => { f.dialog.attrs["data-guidance-engine"] = "unbekannt"; }],
    ["pages", f => { f.dialog.attrs["data-modal-id"] = "m-fremd"; }],
    ["pages", f => { f.dialog.append(f.element("button", {}, "Schließen")); }],
    ["pages", f => { f.classic.attrs["data-allow-link-click"] = "false"; }],
    ["classic", f => { f.header.style.display = "none"; }],
    ["classic", f => { f.overlay.append(f.element("div")); }],
    ["classic", f => { f.classicLabel.ownText = "Seiten"; }],
    ["classic", f => { f.header.append(f.element("button", {}, "Schließen")); }],
    ["classic", f => { f.dialog.append(f.element("div", { role: "heading" }, "Andere Auswahl")); }],
    ["classic", f => { f.blankLabel.ownText = "Andere Vorlage"; }],
    ["classic", f => { f.dialog.append(f.element("a", { ...f.blank.attrs }, "", [f.element("p", {}, "Eine leere Seite hinzufügen")])); }],
  ]) {
    const f = fixture(mode);
    mutate(f);
    assert.equal(f.run("catalog-state"), null);
    assert.equal(f.run("catalog-close", state(mode)), null);
    assert.equal(f.run("catalog-blank-point", state(mode)), null);
  }
});

test("Katalogaktionen verlangen vollständige unveränderte Bindung und nativen Treffer", () => {
  const f = fixture("classic");
  f.hit(f.blank);
  for (const expected of [undefined, { ...state("classic"), unused: true }, state("closed"), state("classic", "/anderer-pfad"),
    { ...state("classic"), epoch: EPOCH + 1 }, { ...state("classic"), modalId: "m12345678-1234-1234-1234-1234567890ac" }]) {
    assert.equal(f.run("catalog-blank-point", expected), null);
  }
  f.hit(f.dialog);
  assert.equal(f.run("catalog-blank-point", state("classic")), null);
  f.hit(f.close);
  f.close.rect.bottom = 601;
  assert.equal(f.run("catalog-close", state("classic")), null);
});

test("die Plus-Schaltfläche darf in die Ansicht scrollen und wird danach erneut gebunden", () => {
  const f = fixture();
  f.hit(f.open);
  f.open.rect = { left: 10, top: 630, right: 40, bottom: 660 };
  f.open.scrollIntoView = (options) => {
    assert.equal(options.block, "center");
    assert.equal(options.behavior, "instant");
    f.open.rect = { left: 10, top: 20, right: 40, bottom: 50 };
  };
  assert.deepEqual(f.run("catalog-open", state("closed")), point);
  f.open.rect.bottom = 650;
  f.open.scrollIntoView = () => { f.frame.attrs.src = "/andere-seite"; };
  assert.equal(f.run("catalog-open", state("closed")), null);
});

test("auch der Wechsel zum klassischen Editor wird im gebundenen Dialog in die Ansicht gescrollt", () => {
  const f = fixture("pages");
  f.classic.rect = { left: 10, top: 630, right: 40, bottom: 660 };
  f.classic.scrollIntoView = () => { f.classic.rect = { left: 10, top: 20, right: 40, bottom: 50 }; };
  f.hit(f.classic);
  assert.deepEqual(f.run("catalog-classic", state("pages")), point);
});
