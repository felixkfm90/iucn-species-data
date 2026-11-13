import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { squarespaceAssetsLibraryDom } from "./squarespace-assets-library-dom.mjs";

const URL = "https://vanilla-gerbil-jwnp.squarespace.com/config/asset-library";
const NAME = "fn-cms-bildtest-1.png", EPOCH = 1794333258856;
const SOURCE = `https://images.squarespace-cdn.com/content/67556be0338df718ea064210/96379ea8-ec7f-45b3-bbbe-0b1f70c6357e/${NAME}?content-type=image%2Fpng`;
const ACCEPT = "image/jpeg, image/png, image/gif, image/webp, video/mp4, video/x-m4v, video/quicktime, audio/mp3, audio/mpeg, audio/m4a";
const UPLOAD_NAME = "fn-1234567890abcdef12345678-1.png";
const BYTES = Buffer.from([0, 1, 99, 255]);
const FILE = { name: UPLOAD_NAME, type: "image/png", size: BYTES.length, base64: BYTES.toString("base64") };

function fixture(status = "match", fileName = NAME) {
  function element(tag, attrs = {}, ownText = "", children = []) {
    const node = { tagName: tag.toUpperCase(), attrs, ownText, children: [], parentElement: null,
      style: { display: "block", visibility: "visible", opacity: "1" },
      get textContent() { return this.ownText + this.children.map(child => child.textContent).join(""); },
      getAttribute(key) { return Object.hasOwn(this.attrs, key) ? this.attrs[key] : null; },
      getClientRects() { return this.style.display === "none" ? [] : [{ width: 1, height: 1 }]; },
      append(...nodes) { for (const child of nodes) { child.parentElement = this; this.children.push(child); } },
      contains(target) { return this === target || this.children.some(child => child.contains(target)); },
      matches(selector) {
        if (selector === ":disabled") return this.fieldsetDisabled || this.disabled || this.getAttribute("disabled") !== null;
        const expectedTag = selector.match(/^[a-z][\w-]*/i)?.[0];
        if (expectedTag && this.tagName !== expectedTag.toUpperCase()) return false;
        return [...selector.matchAll(/\[([a-z0-9_-]+)(?:="([^"]*)")?\]/gi)].every(([, name, value]) => {
          const attr = this.getAttribute(name);
          return value === undefined ? attr !== null : attr === value;
        });
      },
      querySelectorAll(selector) { return this.children.flatMap(child => [
        ...(selector.split(",").some(part => child.matches(part)) ? [child] : []), ...child.querySelectorAll(selector),
      ]); },
    };
    node.append(...children);
    return node;
  }
  const search = element("input", { type: "text", role: "combobox", "data-test": "asset-search-field",
    "aria-label": "asset-search-field", "aria-expanded": "true", value: fileName });
  search.value = fileName;
  const upload = element("button", { "data-test": "upload-files-button" }, "Hochladen");
  const field = element("input", { type: "file", "data-test": "file-input", "aria-hidden": "true", tabindex: "-1", multiple: "", accept: ACCEPT });
  field.form = null;
  const assignments = [], changes = [], searchActions = [];
  let files = [];
  Object.defineProperty(field, "files", { get: () => files, set: value => { assignments.push(value); files = value; } });
  field.dispatchEvent = event => { changes.push(event); };
  const tools = element("div", {}, "", [upload, field]);
  const permanentStorageDisplay = element("div", { role: "progressbar", "aria-valuenow": "0" });
  const main = element("main", {}, "", [element("h1", {}, "Inhaltsbibliothek"), tools, search, permanentStorageDisplay]);
  const checkbox = element("input", { type: "checkbox", "aria-label": `Asset ${fileName}` });
  const image = element("img", { src: SOURCE });
  const card = element("button", { "data-test": "asset-item", "aria-label": fileName }, "", [element("div", {}, "", [image, checkbox])]);
  const notice = element("h1", {}, "Keine Ergebnisse"), hint = element("div", {}, "Versuche es mit anderen Keywords.");
  const empty = element("div", {}, "", [notice, hint]);
  const allFiles = element("p", {}, "Alle Dateien");
  if (status === "root") {
    search.value = search.attrs.value = "";
    search.attrs["aria-expanded"] = "false";
    main.append(allFiles);
  }
  main.append(status === "empty" ? empty : card);
  const body = element("body", {}, "", [main]);
  const document = { URL, activeElement: null, querySelectorAll: selector => body.querySelectorAll(selector) };
  search.focus = () => { searchActions.push("focus"); document.activeElement = search; };
  search.select = () => { searchActions.push("select"); search.selectionStart = 0; search.selectionEnd = search.value.length; };
  const performance = { timeOrigin: EPOCH };
  const globals = { atob, File, Event, DataTransfer: class {
    constructor() {
      this.files = [];
      this.items = { add: file => { this.files.push(file); } };
    }
  } };
  const run = (request = fileName) => {
    const payload = typeof request === "string" ? { fileName: request } : { fileName, ...request };
    return JSON.parse(JSON.stringify(vm.runInNewContext(
      `(${squarespaceAssetsLibraryDom.toString()})(${JSON.stringify(payload)})`,
      { document, performance, getComputedStyle: node => node.style, ...globals },
    )));
  };
  return { run, document, performance, body, main, tools, search, field, upload, card, checkbox, image, notice, hint, empty,
    allFiles, element, globals, assignments, changes, searchActions };
}

test("Mediathek liest einen exakten Bildtreffer und einen ausdrücklich bestätigten Leertreffer", () => {
  const found = fixture();
  assert.deepEqual(found.run(), { epoch: EPOCH, status: "match", fileName: NAME, sourceUrl: SOURCE, uploadReady: true });
  found.image.currentSrc = `${SOURCE}&width=500`;
  assert.equal(found.run().sourceUrl, found.image.currentSrc);

  const candidate = "fn-1234567890abcdef12345678-1.webp";
  assert.deepEqual(fixture("empty", candidate).run(), {
    epoch: EPOCH, status: "empty", fileName: candidate, sourceUrl: null, uploadReady: true,
  });
  assert.equal(fixture("empty", "Grünes Blatt (1).JPG").run().status, "empty");
});

test("Mediathek weist unbestätigte Suche, mehrdeutige Dateien und gemischte Ergebniszustände ab", () => {
  for (const mutate of [
    f => { f.search.value = "anderes-bild.png"; },
    f => { f.search.attrs.value = "anderes-bild.png"; },
    f => { f.search.attrs["aria-expanded"] = "false"; },
    f => { f.main.append(f.element("input", { ...f.search.attrs })); },
    f => { f.card.attrs["aria-label"] = "fn-cms-bildtest-1-kopie.png"; },
    f => { f.checkbox.attrs["aria-label"] = "Asset anderes-bild.png"; },
    f => { f.card.append(f.element("input", { ...f.checkbox.attrs })); },
    f => { f.card.append(f.element("img", { src: SOURCE })); },
    f => { f.image.style.display = "none"; },
    f => { delete f.image.attrs.src; },
    f => { f.main.append(f.empty); },
    f => { f.main.append(f.hint); },
    f => { const second = f.element("button", { "data-test": "asset-item" }); second.style.display = "none"; f.main.append(second); },
  ]) {
    const f = fixture();
    mutate(f);
    assert.equal(f.run(), null);
  }
  for (const mutate of [
    f => { f.main.append(f.card); },
    f => { f.hint.ownText = "Andere Meldung"; },
    f => { f.empty.children.pop(); f.main.append(f.hint); },
    f => { f.empty.append(f.element("span", {}, f.hint.textContent)); },
  ]) {
    const f = fixture("empty");
    mutate(f);
    assert.equal(f.run(), null);
  }
});

test("Mediathek blockiert fremde Dokumente, sichtbare Dialoge, Warnungen und Ladezustände", () => {
  for (const mutate of [
    f => { f.document.URL += "?shadow=1"; },
    f => { f.performance.timeOrigin = NaN; },
    f => { f.body.append(f.element("main")); },
    f => { f.main.append(f.element("div", { role: "dialog" })); },
    f => { f.main.append(f.element("div", { role: "alert" })); },
    f => { f.search.attrs["aria-busy"] = "true"; },
  ]) {
    const f = fixture();
    mutate(f);
    assert.equal(f.run(), null);
  }
  for (const fileName of ["../bild.png", "dir/bild.png", "dir\\bild.png", "Bild .png", "bild.exe", "bild.png\n"]) {
    assert.equal(fixture("empty", fileName).run(), null, fileName);
  }
});

test("Treffer bleibt beobachtbar, wenn das versteckte Uploadfeld nicht eindeutig einsatzbereit ist", () => {
  for (const mutate of [
    f => { f.field.attrs.accept = "image/*"; },
    f => { f.field.attrs.tabindex = "0"; },
    f => { f.field.attrs["aria-hidden"] = "false"; },
    f => { delete f.field.attrs.multiple; },
    f => { f.field.fieldsetDisabled = true; },
    f => { f.field.form = {}; },
    f => { f.field.files = [{}]; },
    f => { f.field.style.display = "none"; },
    f => { f.main.append(f.element("input", { ...f.field.attrs })); },
    f => { f.tools.children.pop(); f.main.append(f.field); },
    f => { f.upload.attrs.disabled = ""; },
  ]) {
    const f = fixture();
    mutate(f);
    assert.deepEqual(f.run(), { epoch: EPOCH, status: "match", fileName: NAME, sourceUrl: SOURCE, uploadReady: false });
  }
});

test("Uploadvorbereitung akzeptiert nur die saubere Mediathekwurzel mit eigenem Uploadfeld", () => {
  const start = { operation: "start" };
  const root = fixture("root");
  assert.deepEqual(root.run(start), { epoch: EPOCH });
  assert.deepEqual(root.searchActions, []);
  assert.equal(fixture("empty").run(start), null);
  for (const mutate of [
    f => { f.search.attrs["aria-expanded"] = "true"; },
    f => { delete f.search.attrs.value; },
    f => { f.allFiles.ownText = "Geteilte Dateien"; },
    f => { f.main.append(f.hint); },
    f => { f.main.append(f.empty); },
    f => { f.field.form = {}; },
  ]) {
    const f = fixture("root");
    mutate(f);
    assert.equal(f.run(start), null);
    assert.deepEqual(f.assignments, []);
  }
});

test("Native Suche fokussiert und markiert nur das bestätigte Feld desselben Dokuments", () => {
  const root = fixture("root"), focus = { operation: "focus-search", epoch: EPOCH, previousQuery: "" };
  assert.equal(root.run({ ...focus, epoch: EPOCH + 1 }), false);
  assert.equal(root.run({ ...focus, previousQuery: "anderes-bild.png" }), false);
  assert.deepEqual(root.searchActions, []);
  assert.equal(root.run(focus), true);
  assert.deepEqual(root.searchActions, ["focus", "select"]);
  assert.deepEqual([root.search.selectionStart, root.search.selectionEnd, root.search.value], [0, 0, ""]);
  assert.equal(root.run({ operation: "search-ready", epoch: EPOCH }), false);

  const result = fixture("match"), ready = { operation: "search-ready", epoch: EPOCH };
  assert.equal(result.run(ready), false);
  assert.equal(result.run({ ...focus, previousQuery: NAME }), true);
  assert.deepEqual([result.search.selectionStart, result.search.selectionEnd, result.search.value], [0, NAME.length, NAME]);
  assert.equal(result.run(ready), true);
  result.search.attrs.value = "";
  assert.equal(result.run(ready), false);
  result.search.attrs.value = NAME;
  result.search.attrs["aria-expanded"] = "false";
  assert.equal(result.run(ready), false);

  const swapped = fixture("root");
  swapped.search.select = () => {
    swapped.search.selectionStart = swapped.search.selectionEnd = 0;
    swapped.search.style.display = "none";
    swapped.main.append(swapped.element("input", { ...swapped.search.attrs }));
  };
  assert.equal(swapped.run(focus), false);
});

test("Ein bestätigter Leertreffer übernimmt genau die vorgegebenen Dateibytes und löst ein change aus", async () => {
  const f = fixture("empty", UPLOAD_NAME), request = { operation: "submit-file", epoch: EPOCH, file: FILE };
  assert.equal(f.run(request), true);
  assert.equal(f.assignments.length, 1);
  assert.equal(f.field.files.length, 1);
  const [file] = f.field.files;
  assert.deepEqual([file.name, file.type, file.size], [UPLOAD_NAME, FILE.type, FILE.size]);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), BYTES);
  assert.deepEqual(f.changes.map(event => [event.type, event.bubbles, event.composed]), [["change", true, true]]);
  assert.equal(f.run(request), false);
  assert.equal(f.assignments.length, 1);
  assert.equal(f.changes.length, 1);
});

test("Dateiübergabe stoppt bei falschen Daten, vorhandenen Treffern und wechselnden Controls", () => {
  const request = { operation: "submit-file", epoch: EPOCH, file: FILE };
  for (const [status, fileName, mutate] of [
    ["match", UPLOAD_NAME, f => f.run(request)],
    ["empty", NAME, f => f.run({ ...request, file: { ...FILE, name: NAME } })],
    ["empty", UPLOAD_NAME, f => f.run({ ...request, epoch: EPOCH + 1 })],
    ["empty", UPLOAD_NAME, f => f.run({ ...request, file: { ...FILE, name: NAME } })],
    ["empty", UPLOAD_NAME, f => f.run({ ...request, file: { ...FILE, type: "image/jpeg" } })],
    ["empty", UPLOAD_NAME, f => f.run({ ...request, file: { ...FILE, size: 32 * 1024 * 1024 + 1 } })],
    ["empty", UPLOAD_NAME, f => f.run({ ...request, file: { ...FILE, size: 5 } })],
    ["empty", UPLOAD_NAME, f => f.run({ ...request, file: { ...FILE, base64: "........" } })],
    ["empty", UPLOAD_NAME, f => {
      f.globals.atob = value => { f.main.append(f.card); return atob(value); };
      return f.run(request);
    }],
    ["empty", UPLOAD_NAME, f => {
      f.globals.atob = value => { f.field.form = {}; return atob(value); };
      return f.run(request);
    }],
  ]) {
    const f = fixture(status, fileName);
    assert.equal(mutate(f), false);
    assert.deepEqual(f.assignments, []);
    assert.deepEqual(f.changes, []);
  }
});
