import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { identifySquarespacePageAsset, isSquarespaceEmptyCodeLine, readSquarespacePageObservation, SQUARESPACE_DEFAULT_CODE,
  squarespacePageObservationDom } from "./squarespace-page-observation.mjs";
import { confirmSquarespaceDisabledPage, insertSquarespacePageText } from "./squarespace-page-text.mjs";
import { createCmsContentSteps } from "../page-authoring/cms-content-steps.mjs";
import { createCmsDispatchBinding } from "../page-authoring/cms-dispatch.mjs";
import { FN_FIGURE_STYLES, FN_MAP_CODE, FN_SPECIES_CODE } from "../page-authoring/templates.mjs";
import { submitSquarespaceGalleryFile } from "./squarespace-page-gallery.mjs";

const ADMIN = "https://vanilla-gerbil-jwnp.squarespace.com/config/pages", PAGE_ID = "6ae89f789cf13b0c388e4ccf",
  BLOCK_ID = "block-6ae8a8cfa287dc5274ba96ff", SECTION_ID = "6ae8b0cab56a3a057a00a010", PAGE = "https://vanilla-gerbil-jwnp.squarespace.com/arten-explorer-funktionsprufung-2026-11-02",
  LIBRARY = "67556be0338df718ea064210", ASSET_A = "96379ea8-ec7f-45b3-bbbe-0b1f70c6357e", ASSET_B = "e96eee26-38cc-4958-ab2c-cf4ce5b0cd76",
  ITEM_A = "6ae8b51084121939ca3e6759", ITEM_B = "6ae8b50e8897d41645d02c50";
const imageUrl = (id, version = "v1", query = "") => `https://images.squarespace-cdn.com/content/${version === "v1" ? "v1" : "v2/namespaces/website/libraries"}/${LIBRARY}/${id}/fn-cms-bildtest.png${query}`;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function dom(url, bodyId = "") {
  let calls = 0;
  const matches = (node, selector) => {
    if (node.nodeType !== 1) return false;
    const tag = selector.match(/^[a-z][a-z0-9-]*/i)?.[0], id = selector.match(/#([a-z0-9_-]+)/i)?.[1];
    if (tag && tag.toUpperCase() !== node.tagName || id && node.getAttribute("id") !== id) return false;
    const classes = (node.getAttribute("class") || "").split(/\s+/u);
    if ([...selector.split("[", 1)[0].matchAll(/\.([a-z0-9_-]+)/gi)].some(([, name]) => !classes.includes(name))) return false;
    for (const match of selector.matchAll(/\[([a-z0-9_-]+)(\^=|=)?(?:"([^"]*)"|'([^']*)'|([^\]]+))?\]/gi)) {
      const actual = node.getAttribute(match[1]), expected = match[3] ?? match[4] ?? match[5];
      if (actual === null || match[2] === "=" && actual !== expected || match[2] === "^=" && !actual.startsWith(expected)) return false;
    }
    return true;
  };
  const text = value => ({ nodeType: 3, nodeValue: value, parentElement: null });
  const element = (name, attrs = {}, children = []) => {
    const node = { nodeType: 1, tagName: name.toUpperCase(), attrs, id: attrs.id || "", parentElement: null, childNodes: [],
      css: { display: "block", visibility: "visible", opacity: "1", contentVisibility: "visible" },
      getAttribute(key) { return Object.hasOwn(this.attrs, key) ? this.attrs[key] : null; }, getClientRects() { return this.css.display === "none" ? [] : [{}]; },
      getBoundingClientRect() { return this.rect; },
      getAttributeNames() { return Object.keys(this.attrs); },
      get textContent() { return this.childNodes.map(child => child.nodeType === 3 ? child.nodeValue : child.textContent).join(""); },
      get children() { return this.childNodes.filter(child => child.nodeType === 1); },
      querySelectorAll(selector) { return this.children.flatMap(child => [...(selector.split(",").some(part => matches(child, part)) ? [child] : []), ...child.querySelectorAll(selector)]); },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      append(...added) { for (const value of added) { const child = typeof value === "string" ? text(value) : value; child.parentElement = this; this.childNodes.push(child); } },
      click() { calls++; throw new Error("Reader must never click"); }, focus() { calls++; throw new Error("Reader must never focus"); },
      scrollIntoView() { calls++; throw new Error("Reader must never scroll"); }, dispatchEvent() { calls++; throw new Error("Reader must never dispatch input"); },
    };
    Object.defineProperty(node, "src", { get() { return this.attrs.src ? new URL(this.attrs.src, url).href : ""; } });
    Object.defineProperty(node, "currentSrc", { get() { return this.attrs.currentSrc || this.src; } });
    node.append(...children); return node;
  };
  const body = element("body", { id: bodyId }), document = { body, URL: url, querySelectorAll: selector => body.querySelectorAll(selector) };
  document.createRange = () => {
    let selected;
    return { selectNodeContents(node) { selected = node; }, getClientRects() { return selected.lineRects || []; } };
  };
  Object.defineProperty(document, "hiddenApplicationStore", { get() { throw new Error("Do not inspect hidden stores"); } });
  const execute = (code, globals) => JSON.parse(JSON.stringify(vm.runInNewContext(code, { document, URL, getComputedStyle: node => node.css, ...globals })));
  return { body, document, element, text, execute, get calls() { return calls; } };
}
function fixture(pageUrl = PAGE) {
  const topDom = dom(ADMIN), frameDom = dom(pageUrl, `collection-${PAGE_ID}`), hooks = {}, reads = [];
  const iframe = topDom.element("iframe", { id: "sqs-site-frame", src: pageUrl }); topDom.body.append(iframe);
  const editor = frameDom.element("div", { contenteditable: "true", role: "textbox" }, [
    frameDom.element("h3", {}, ["Tatsächlich beobachteter Titel"]), frameDom.element("h4", {}, ["Aussehen"]),
    frameDom.element("p", {}, ["Tatsächlicher Text mit Umlauten und &."]),
  ]), block = frameDom.element("div", { id: BLOCK_ID }, [editor]), article = frameDom.element("article", {}, [block]), main = frameDom.element("main", {}, [article]);
  frameDom.body.append(main);
  const top = { framesInSubtree: [], parent: null, url: ADMIN, async executeJavaScript(code) {
    const input = JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1)); reads.push(["top", input.scope]); await hooks.top?.(input); return topDom.execute(code);
  } };
  const frame = { parent: top, url: pageUrl, async executeJavaScript(code) {
    const input = JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1)); reads.push(["frame", input.scope]); await hooks.frame?.(input); return frameDom.execute(code);
  } };
  top.framesInSubtree = [top, frame];
  const contents = { mainFrame: top, getURL: () => ADMIN, isDestroyed: () => false };
  return { topDom, frameDom, hooks, iframe, editor, block, article, main, top, frame, contents, reads };
}
function addGallery(f, { count = 2, withEditor = true } = {}) {
  const images = [ASSET_B, ASSET_A], ids = [ITEM_B, ITEM_A], rows = [];
  const section = f.frameDom.element("section", { "data-sqsp-section": "gallery", "data-section-id": SECTION_ID });
  for (let index = 0; index < count; index++) {
    const asset = images[index] || `10000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
      id = ids[index] || `1000000000000000000000${String(index).padStart(2, "0")}`;
    section.append(f.frameDom.element("img", { src: imageUrl(asset, "v1", "?format=750w") }));
    rows.push(f.topDom.element("div", { "data-cypress": "draggable-item", "data-itemid": id, role: "button", "data-index": String(index) },
      [f.topDom.element("img", { src: imageUrl(asset, "v2", "?format=300w") })]));
  }
  f.article.append(section);
  const dialog = f.topDom.element("div", { role: "dialog", "data-test": "gallery-manager-modal" }, rows);
  if (withEditor) f.topDom.body.append(dialog);
  return { section, dialog, rows };
}
function addFnModule(f, { id, markup }) {
  const { element } = f.frameDom;
  const wrapper = element("div", { class: "sqs-code-container" });
  wrapper.innerHTML = `\n  ${markup}\n`;
  f.article.append(element("div", { id, class: "sqs-block-code", "data-block-type": "1337",
    "data-definition-name": "website.components.code", "data-sqsp-block": "code" }, [
    element("div", { class: "sqs-block-content" }, [wrapper]),
  ]));
  return wrapper;
}

function fluidSectionFixture() {
  const f = fixture(), { element } = f.frameDom;
  const codeId = "block-yui_3_17_2_1_1765559140871_2894";
  addFnModule(f, { id: codeId, markup: FN_SPECIES_CODE });
  const blocks = f.article.childNodes.splice(0);
  const wrappers = blocks.map(block => element("div", { class: "fe-block" }, [block]));
  const grid = element("div", { class: `fluid-engine fe-${SECTION_ID}` }, wrappers);
  const section = element("section", { "data-section-id": SECTION_ID, "data-sqsp-section": "fluid-engine" }, [
    element("div", { class: "content-wrapper" }, [grid]),
  ]);
  const options = { expectedPageId: PAGE_ID, expectedPath: new URL(PAGE).pathname, expectedFluidSectionId: SECTION_ID };
  grid.css.display = "grid";
  grid.rect = { left: 20, top: 100, right: 720, bottom: 440 };
  wrappers[0].rect = { left: 30, top: 110, right: 710, bottom: 190 };
  wrappers[1].rect = { left: 30, top: 200, right: 710, bottom: 330 };
  for (const heading of f.editor.querySelectorAll("h3,h4")) {
    heading.lineRects = [{ left: 30, top: 115, right: 310, bottom: 140 }];
  }
  f.article.append(section);
  return { ...f, grid, section, wrappers, blocks, options, ids: [BLOCK_ID, codeId] };
}

test("explicit Fluid Engine binding confirms exact visual IDs in content and editor layouts without exposing rectangles", async () => {
  const f = fluidSectionFixture();
  const content = await readSquarespacePageObservation(f.contents, f.options);
  assert.deepEqual(content.fluidVisualOrder, f.ids);
  assert.deepEqual(content.contentOrder.map(block => block.id), f.ids);
  assert.equal(content.fluidVisualBounds, undefined);
  assert.deepEqual(content.reasonCodes, []);
  const layout = await readSquarespacePageObservation(f.contents, { ...f.options, view: "editor-layout" });
  assert.deepEqual(layout.fluidVisualOrder, f.ids);
  assert.deepEqual(layout.editorBlocks.map(block => block.id), f.ids);
  assert.equal(layout.fluidVisualBounds, undefined);
  f.grid.childNodes = [];
  f.grid.rect.bottom = f.grid.rect.top;
  const empty = await readSquarespacePageObservation(f.contents, { ...f.options, view: "editor-layout" });
  assert.deepEqual(empty.fluidVisualOrder, []);
  assert.deepEqual(empty.editorBlocks, []);
  assert.equal(f.frameDom.calls + f.topDom.calls, 0);
});

test("Fluid Engine rejects swapped or overlapping visual positions while default content reading retains DOM order", async () => {
  for (const [name, change] of Object.entries({
    "reversed visual order": f => { [f.wrappers[0].rect, f.wrappers[1].rect] = [f.wrappers[1].rect, f.wrappers[0].rect]; },
    overlap: f => { f.wrappers[1].rect.top = 189; },
    "same row": f => { f.wrappers[0].rect.right = 350; f.wrappers[1].rect.top = 110; f.wrappers[1].rect.left = 600; },
    "outside grid": f => { f.wrappers[1].rect.bottom = 441; },
    "empty rectangle": f => { f.wrappers[1].rect.bottom = 200; },
    "nonfinite rectangle": f => { f.wrappers[1].rect.top = NaN; },
  })) {
    const f = fluidSectionFixture();
    change(f);
    const result = await readSquarespacePageObservation(f.contents, f.options);
    assert.deepEqual(result.reasonCodes, ["fluid-visual-order-unqualified"], name);
    assert.equal(result.fluidVisualOrder, undefined, name);
    const defaultObservation = await readSquarespacePageObservation(f.contents);
    assert.deepEqual(defaultObservation.contentOrder.map(block => block.id), f.ids, name);
    assert.equal(defaultObservation.fluidVisualOrder, undefined, name);
  }
});

test("Fluid Engine rejects an obscured wrapped heading even when its block ends before the next block", async () => {
  const f = fluidSectionFixture(), heading = f.editor.querySelector("h4");
  heading.childNodes[0].nodeValue = "Verbreitungskarte";
  heading.lineRects = [{ left: 30, top: 155, right: 282, bottom: 184 },
    { left: 30, top: 184, right: 82, bottom: 213 }];
  assert.ok(f.wrappers[0].rect.bottom < f.wrappers[1].rect.top);
  for (const view of ["content", "editor-layout"]) {
    const result = await readSquarespacePageObservation(f.contents, { ...f.options, view });
    assert.deepEqual(result.reasonCodes, ["fluid-visual-order-unqualified"]);
    assert.equal(result.fluidVisualOrder, undefined);
  }
  f.wrappers[1].rect.top = 215;
  const clear = await readSquarespacePageObservation(f.contents, f.options);
  assert.deepEqual(clear.fluidVisualOrder, f.ids);
  assert.deepEqual(clear.reasonCodes, []);
});

test("the map section reads the actually rendered heading and list from the same bound map block", async () => {
  const f = fixture(), { element } = f.frameDom;
  const blockId = "block-abcdeabcdeabcdeabcde";
  const code = addFnModule(f, { id: blockId, markup: "dynamic" });
  const group = element("div", { "data-fn-map-section": "1" }, [element("h4", {}, ["Karte & Verbreitung"]),
    element("ul", {}, [element("li", {}, ["Sommer"]), element("li", {}, ["Winter"])]),
    element("div", { id: "map-wrapper", style: "position:relative; width:100%; overflow:hidden;" }, [
      element("div", { id: "map-output", style: "width:100%;" }, [element("p", {}, ["Geladene Karte"])]),
    ]),
  ]);
  code.append(group);
  const read = () => readSquarespacePageObservation(f.contents, { expectedPageId: PAGE_ID, expectedPath: new URL(PAGE).pathname });
  const observed = await read();
  assert.deepEqual(observed.contentOrder.at(-1), { kind: "map", id: blockId,
    mapElements: [{ type: "heading", level: 4, text: "Karte & Verbreitung" }, { type: "bullet-list", items: ["Sommer", "Winter"] }] });
  group.append(element("div", { id: "map-wrapper" }));
  assert.equal((await read()).contentOrder.at(-1).kind, "unqualified");
});

test("Fluid Engine rejects missing, foreign, duplicate or ambiguous section, block and wrapper bindings", async () => {
  for (const [name, change] of Object.entries({
    "missing section": f => { f.section.attrs["data-section-id"] = "a".repeat(24); },
    "foreign section": f => { f.article.childNodes = []; f.frameDom.body.append(f.section); },
    "wrong section type": f => { f.section.attrs["data-sqsp-section"] = "classic-editor"; },
    "duplicate section": f => { f.article.append(f.frameDom.element("section", { "data-section-id": SECTION_ID })); },
    "missing grid": f => { f.grid.attrs.class = "content-wrapper"; },
    "duplicate grid": f => { f.section.append(f.frameDom.element("div", { class: "fluid-engine" })); },
    "hidden wrapper": f => { f.wrappers[1].css.visibility = "hidden"; },
    "missing wrapper": f => { f.grid.childNodes.pop(); f.grid.append(f.blocks[1]); },
    "moved wrapper": f => { f.grid.childNodes.pop(); f.section.append(f.wrappers[1]); },
    "nested wrapper": f => { f.grid.childNodes.pop(); f.wrappers[0].append(f.wrappers[1]); },
    "missing block": f => { f.wrappers[1].childNodes = []; },
    "ambiguous block": f => { f.wrappers[0].append(f.frameDom.element("div", { id: "block-" + "a".repeat(24) })); },
    "hidden duplicate block": f => {
      const duplicate = f.frameDom.element("div", { id: BLOCK_ID }); duplicate.css.display = "none"; f.frameDom.body.append(duplicate);
    },
    "open modal": f => { f.topDom.body.append(f.topDom.element("div", { role: "dialog" })); },
  })) {
    const f = fluidSectionFixture();
    change(f);
    const result = await readSquarespacePageObservation(f.contents, { ...f.options, view: "editor-layout" });
    assert.equal(result.status, "unknown", name);
    assert.deepEqual(result.reasonCodes, ["fluid-visual-order-unqualified"], name);
    assert.equal(result.fluidVisualOrder, undefined, name);
  }
});

test("Fluid Engine visual proof requires stable measured positions and a specific local page binding", async () => {
  const f = fluidSectionFixture();
  let frameReads = 0;
  f.hooks.frame = () => { if (++frameReads === 2) f.wrappers[1].rect.top += 5; };
  const moved = await readSquarespacePageObservation(f.contents, f.options);
  assert.deepEqual(moved.reasonCodes, ["preview-observation-changed"]);
  assert.equal(moved.fluidVisualOrder, undefined);
  for (const options of [
    { ...f.options, expectedFluidSectionId: null },
    { ...f.options, expectedFluidSectionId: "A".repeat(24) },
    { ...f.options, expectedPageId: undefined },
    { ...f.options, expectedPath: undefined },
    { ...f.options, view: "settings", expectedPageId: undefined },
  ]) await assert.rejects(readSquarespacePageObservation(f.contents, options), { code: "SQUARESPACE_OBSERVATION_INPUT" });
  assert.equal(frameReads, 2);
});

test("Fluid Engine reads the observed YUI text block with its exact nearest grid cell in both text states", async () => {
  const f = fluidSectionFixture(), id = "block-yui_3_17_2_1_1794333258856_1314";
  const cell = f.wrappers[0], block = f.block;
  Object.assign(cell.attrs, { role: "gridcell", "data-block-id": id.slice(6) });
  Object.assign(block.attrs, { id, class: "sqs-block sqs-block-html", "data-sqsp-block": "text",
    "data-definition-name": "website.components.html" });
  const read = (view) => readSquarespacePageObservation(f.contents, { ...f.options, view });
  assert.deepEqual((await read("editor-layout")).editorBlocks[0], { kind: "text", id, empty: false });
  assert.equal((await read("content")).textBlocks[0].source, "editor");
  f.editor.childNodes = [];
  f.editor.append(f.frameDom.element("p", {}, [f.frameDom.element("br")]));
  assert.deepEqual((await read("editor-layout")).editorBlocks[0], { kind: "text", id, empty: true });

  replaceWithRenderedText(f);
  for (const heading of block.querySelectorAll("h3,h4")) {
    heading.lineRects = [{ left: 30, top: 115, right: 310, bottom: 140 }];
  }
  delete block.attrs["data-block-type"];
  assert.deepEqual((await read("editor-layout")).editorBlocks[0], { kind: "text", id, empty: false });
  assert.deepEqual((await read("content")).textBlocks.map(({ cmsBlockId, source }) => ({ cmsBlockId, source })),
    [{ cmsBlockId: id, source: "rendered" }]);

  const foreignCell = f.frameDom.element("div", { role: "gridcell", "data-block-id": "wrong-block" }, [block]);
  cell.childNodes = []; cell.append(foreignCell);
  assert.deepEqual((await read("editor-layout")).reasonCodes, ["editor-layout-unqualified"]);
  const wrong = await read("content");
  assert.deepEqual(wrong.textBlocks, []);
  assert.ok(wrong.reasonCodes.includes("block-identity-unqualified"));
});

test("Fluid Engine binds the observed YUI code form without legacy type and retains the default HTML as occupied", async () => {
  const f = fluidSectionFixture(), id = "block-yui_3_17_2_1_1794333258856_1528";
  const cell = f.wrappers[1], block = f.blocks[1], code = block.children[0].children[0];
  Object.assign(cell.attrs, { role: "gridcell", "data-block-id": id.slice(6) });
  block.attrs.id = id;
  delete block.attrs["data-block-type"];
  code.innerHTML = "<p>Hello, World!</p>";
  const read = (view) => readSquarespacePageObservation(f.contents, { ...f.options, view });
  assert.deepEqual((await read("editor-layout")).editorBlocks[1], { kind: "code", id, empty: false, defaultPlaceholder: true });
  assert.deepEqual((await read("content")).contentOrder[1], { kind: "unqualified" });
  code.innerHTML = "<p>Other content</p>";
  assert.deepEqual((await read("editor-layout")).editorBlocks[1], { kind: "code", id, empty: false });
  code.innerHTML = "";
  assert.deepEqual((await read("editor-layout")).editorBlocks[1], { kind: "code", id, empty: true });
  code.innerHTML = FN_SPECIES_CODE;
  assert.deepEqual((await read("content")).contentOrder[1], { kind: "species", id });

  cell.attrs["data-block-id"] = "foreign-block";
  assert.deepEqual((await read("editor-layout")).reasonCodes, ["editor-layout-unqualified"]);
  assert.deepEqual((await read("content")).contentOrder[1], { kind: "unqualified" });
  cell.attrs["data-block-id"] = id.slice(6);
  block.attrs["data-block-type"] = "wrong-type";
  assert.deepEqual((await read("editor-layout")).reasonCodes, ["editor-layout-unqualified"]);
});

test("Fluid Engine erkennt den beobachteten Codeblock neben den beiden Squarespace-Stilelementen", async () => {
  const f = fluidSectionFixture(), id = "block-yui_3_17_2_1_1794499962056_653";
  const cell = f.wrappers[1], block = f.blocks[1], content = block.children[0], code = content.children[0];
  Object.assign(cell.attrs, { role: "gridcell", "data-block-id": id.slice(6) });
  block.attrs.id = id;
  delete block.attrs["data-block-type"];
  const { element } = f.frameDom;
  const styles = ["transform-vars", "transform-overrides-vars"].map(className => element("style", { class: className }));
  content.append(...styles);
  const read = view => readSquarespacePageObservation(f.contents, { ...f.options, view });
  code.innerHTML = "<p>Hello, World!</p>";
  assert.deepEqual((await read("editor-layout")).editorBlocks[1], { kind: "code", id, empty: false, defaultPlaceholder: true });
  code.innerHTML = "";
  assert.deepEqual((await read("editor-layout")).editorBlocks[1], { kind: "code", id, empty: true });
  code.innerHTML = FN_SPECIES_CODE;
  assert.deepEqual((await read("content")).contentOrder[1], { kind: "species", id });
  styles[1].attrs.class = "fremdes-stilelement";
  assert.deepEqual((await read("editor-layout")).reasonCodes, ["editor-layout-unqualified"]);
  styles[1].attrs.class = "transform-overrides-vars";
  content.append(element("div", { class: "sqs-code-container" }));
  assert.deepEqual((await read("editor-layout")).reasonCodes, ["editor-layout-unqualified"]);
});

test("editor layout binds blank text and HTML blocks in order without exposing their contents", async () => {
  const f = fixture();
  f.editor.childNodes = [];
  f.editor.append(f.frameDom.element("p", {}, [f.frameDom.element("br")]));
  const codeId = "block-yui_3_17_2_1_1765559140871_2894";
  const code = addFnModule(f, { id: codeId, markup: "" });
  const options = { view: "editor-layout", expectedPageId: PAGE_ID, expectedPath: new URL(PAGE).pathname };
  const read = () => readSquarespacePageObservation(f.contents, options);
  assert.deepEqual((await read()).editorBlocks, [{ kind: "text", id: BLOCK_ID, empty: true }, { kind: "code", id: codeId, empty: true }]);
  code.innerHTML = FN_SPECIES_CODE;
  assert.deepEqual((await read()).editorBlocks[1], { kind: "code", id: codeId, empty: false });
  f.article.append(f.frameDom.element("div", { id: BLOCK_ID }));
  assert.equal((await read()).editorBlocks, undefined);
  assert.equal(f.frameDom.calls + f.topDom.calls, 0);
});

test("editor layout discards changed blocks and hidden or ambiguous editing surfaces", async () => {
  const options = { view: "editor-layout", expectedPageId: PAGE_ID, expectedPath: new URL(PAGE).pathname };
  for (const failure of ["hidden", "hidden-block", "wrong-kind", "modal", "drift", "extra-gallery"]) {
    const f = fixture();
    if (failure === "hidden") f.editor.css.display = "none";
    if (failure === "hidden-block") {
      const extra = f.frameDom.element("div", { id: "block-000000000000000000000099" });
      extra.css.display = "none"; f.article.append(extra);
    }
    if (failure === "wrong-kind") f.block.attrs["data-sqsp-block"] = "code";
    if (failure === "modal") f.topDom.body.append(f.topDom.element("div", { role: "dialog" }));
    if (failure === "extra-gallery") addGallery(f, { withEditor: false });
    if (failure === "drift") {
      let reads = 0;
      f.hooks.frame = () => { if (++reads === 2) f.editor.append(f.frameDom.element("p", {}, ["Fremder Inhalt"])); };
      f.editor.childNodes = [];
    }
    assert.equal((await readSquarespacePageObservation(f.contents, options)).editorBlocks, undefined, failure);
  }
});

test("editor layout retains the same text identity when Squarespace closes the rich-text surface", async () => {
  const f = fixture(), { element } = f.frameDom;
  const codeId = "block-yui_3_17_2_1_1765559140871_2894";
  addFnModule(f, { id: codeId, markup: "" });
  const options = { view: "editor-layout", expectedPageId: PAGE_ID, expectedPath: new URL(PAGE).pathname };
  const read = () => readSquarespacePageObservation(f.contents, options);
  const focusedLayout = (await read()).editorBlocks;
  const rendered = replaceWithRenderedText(f);
  assert.deepEqual((await read()).editorBlocks, focusedLayout);
  rendered.childNodes = [];
  rendered.append(element("p", {}, [element("br")]));
  assert.deepEqual((await read()).editorBlocks, [{ kind: "text", id: BLOCK_ID, empty: true }, { kind: "code", id: codeId, empty: true }]);
  rendered.append(element("img", { alt: "Belegung ohne Text" }));
  assert.equal((await read()).editorBlocks[0].empty, false);
  delete rendered.attrs["data-sqsp-text-block-content"];
  assert.equal((await read()).editorBlocks, undefined);
  assert.equal(f.frameDom.calls + f.topDom.calls, 0);
});

test("preview reads the interleaved text, gallery and known FN module order without treating code as verified source", async () => {
  const f = fixture();
  const speciesId = "block-yui_3_17_2_1_1765559140871_2894", mapId = "block-yui_3_17_2_1_1765559140871_3821";
  const module = addFnModule(f, { id: speciesId, markup: FN_SPECIES_CODE });
  addGallery(f, { withEditor: false });
  addFnModule(f, { id: mapId, markup: FN_MAP_CODE });
  const options = { expectedPageId: PAGE_ID, expectedPath: new URL(PAGE).pathname };
  const observation = await readSquarespacePageObservation(f.contents, options);
  assert.deepEqual(observation.contentOrder, [{ kind: "text", id: BLOCK_ID }, { kind: "species", id: speciesId },
    { kind: "gallery", id: SECTION_ID }, { kind: "map", id: mapId }]);
  assert.deepEqual(observation.reasonCodes, []);
  assert.ok(observation.unsupported.includes("code-editor-source"));
  module.innerHTML += "<div>Unerwarteter Inhalt</div>";
  const changed = await readSquarespacePageObservation(f.contents, options);
  assert.deepEqual(changed.contentOrder[1], { kind: "unqualified" });
  assert.ok(changed.reasonCodes.includes("block-identity-unqualified"));
});

test("the observed grid reports the image alt and visible caption independently", async () => {
  const f = fixture(), { element } = f.frameDom;
  const section = element("section", { "data-sqsp-section": "gallery", "data-section-id": SECTION_ID });
  const image = element("img", { src: imageUrl(ASSET_A), alt: "Vogel am Fluss" });
  const caption = element("figcaption", { class: "gallery-caption" }, [element("p", { class: "gallery-caption-content" }, ["Ein anderer Text"])]);
  const first = element("figure", { class: "gallery-grid-item" }, [image, caption]);
  const second = element("figure", { class: "gallery-grid-item" }, [element("img", { src: imageUrl(ASSET_B), alt: "Am Ufer" })]);
  section.append(first, second); f.article.append(section);
  const observe = async () => (await readSquarespacePageObservation(f.contents)).galleries[0].previewImages.map(item => item.renderedText);
  assert.deepEqual(await observe(), [{ alt: "Vogel am Fluss", caption: "Ein anderer Text" }, { alt: "Am Ufer", caption: null }]);
  delete image.attrs.alt;
  assert.equal((await observe())[0], null);
  image.attrs.alt = "Vogel am Fluss";
  caption.css.display = "none";
  assert.equal((await observe())[0], null);
});

function addRenderedGalleryBlock(f, figures) {
  const { element } = f.frameDom;
  const root = element("div", { "data-fn-art-gallery": "1", style: FN_FIGURE_STYLES.grid }, figures);
  const blockId = "block-000000000000000000000099";
  f.article.append(element("div", { id: blockId, class: "sqs-block-code", "data-block-type": "1337",
    "data-definition-name": "website.components.code", "data-sqsp-block": "code" }, [
    element("div", { class: "sqs-block-content" }, [element("div", { class: "sqs-code-container" }, [root])]),
  ]));
  return { root, blockId };
}

test("the rendered HTML gallery reads separate caption, credit and explicit empty alt from the correct block", async () => {
  const f = fixture(), { element } = f.frameDom;
  const credit = element("small", { "data-fn-credit": "", style: FN_FIGURE_STYLES.text }, ["Foto: FN"]);
  const img = element("img", { src: imageUrl(ASSET_A), alt: "", style: FN_FIGURE_STYLES.image });
  const figure = element("figure", { "data-fn-position": "1", style: FN_FIGURE_STYLES.figure }, [img,
    element("figcaption", {}, [element("span", { "data-fn-caption": "", style: FN_FIGURE_STYLES.text }, ["Am Fluss"]), credit]),
  ]);
  const { root, blockId } = addRenderedGalleryBlock(f, [figure]);
  const observation = await readSquarespacePageObservation(f.contents);
  assert.deepEqual(observation.contentOrder.at(-1), { kind: "gallery", id: blockId });
  assert.deepEqual(observation.galleries[0].previewImages[0].renderedText, { alt: "", caption: "Am Fluss", attribution: "Foto: FN", position: 1 });
  for (const change of [() => { delete img.attrs.alt; }, () => { img.attrs.alt = ""; credit.css.display = "none"; },
    () => { credit.css.display = "block"; img.attrs.onerror = "injected"; },
    () => { delete img.attrs.onerror; root.append(element("script")); }]) {
    change();
    const rejected = await readSquarespacePageObservation(f.contents);
    assert.ok(rejected.reasonCodes.includes("gallery-figure-markup-unqualified"));
    assert.deepEqual(rejected.galleries, []);
  }
});

const FIGURE_ID_A = "fn-figure-111111111111111111111111", FIGURE_ID_B = "fn-figure-222222222222222222222222";

function addFiguresWithMarkers(f, itemIds) {
  const { element } = f.frameDom;
  const figures = itemIds.map((id, index) => element("figure", {
    "data-fn-position": String(index + 1), ...(id === undefined ? {} : { "data-fn-item-id": id }), style: FN_FIGURE_STYLES.figure,
  }, [element("img", { src: imageUrl(ASSET_A), alt: "Am Fluss", style: FN_FIGURE_STYLES.image })]));
  return { ...addRenderedGalleryBlock(f, figures), figures };
}

test("the rendered gallery retains distinct observed figure IDs when the same asset is used twice", async () => {
  const f = fixture(), { blockId, figures } = addFiguresWithMarkers(f, [FIGURE_ID_A, FIGURE_ID_B]);
  const observation = await readSquarespacePageObservation(f.contents);
  assert.deepEqual(observation.contentOrder.at(-1), { kind: "gallery", id: blockId });
  assert.deepEqual(observation.galleries[0].previewImages.map(item => [item.identity.assetId, item.renderedText]), [
    [ASSET_A, { alt: "Am Fluss", caption: null, attribution: null, position: 1, cmsItemId: FIGURE_ID_A }],
    [ASSET_A, { alt: "Am Fluss", caption: null, attribution: null, position: 2, cmsItemId: FIGURE_ID_B }],
  ]);

  let reads = 0;
  f.hooks.frame = () => { if (++reads === 2) figures[1].attrs["data-fn-item-id"] = "fn-figure-333333333333333333333333"; };
  const changed = await readSquarespacePageObservation(f.contents);
  assert.deepEqual(changed.reasonCodes, ["preview-observation-changed"]);
  assert.deepEqual(changed.galleries, []);
});

test("the rendered gallery rejects mixed, duplicated or invalid figure IDs and unobserved attributes", async () => {
  for (const [first, second, extra] of [
    [FIGURE_ID_A, undefined], [undefined, FIGURE_ID_B], [FIGURE_ID_A, FIGURE_ID_A],
    [FIGURE_ID_A, ""], [FIGURE_ID_A, "fn-figure-aaaaaaaaaaaaaaaaaaaaaaa"], [FIGURE_ID_A, "fn-figure-AAAAAAAAAAAAAAAAAAAAAAAA"],
    [FIGURE_ID_A, FIGURE_ID_B, "data-foreign"],
  ]) {
    const f = fixture(), { figures } = addFiguresWithMarkers(f, [first, second]);
    if (extra) figures[1].attrs[extra] = "";
    const observation = await readSquarespacePageObservation(f.contents);
    assert.ok(observation.reasonCodes.includes("gallery-figure-markup-unqualified"));
    assert.deepEqual(observation.galleries, []);
  }
});

function codeEditorFixture(module = "species") {
  const f = fixture(), blockId = "block-yui_3_17_2_1_1765559140871_2894";
  const { element } = f.topDom;
  const code = { species: FN_SPECIES_CODE, map: FN_MAP_CODE, empty: "", "default-placeholder": "<p>Hello, World!</p>" }[module];
  const selected = f.frameDom.element("div", { role: "gridcell", "aria-selected": "true", "data-block-id": blockId.slice(6) }, [
    f.frameDom.element("div", { id: blockId, "data-definition-name": "website.components.code", "data-sqsp-block": "code" }),
  ]);
  f.article.append(selected);
  const mode = element("div", { role: "combobox" }, ["HTML"]);
  const showSource = element("input", { type: "checkbox" }); showSource.checked = false;
  const lines = code.split("\n").map(line => element("div", { class: "cm-line" }, [element("span", {}, [line])]));
  const editor = element("div", { role: "textbox", class: "cm-content", "aria-multiline": "true", contenteditable: "true", "data-language": "html" }, lines);
  const dialog = element("div", { role: "dialog", "data-test": "block-editor-container", "aria-label": "Block-Editor-Formular",
    "data-modal-id": "m12345678-1234-1234-1234-1234567890ab" }, [mode, showSource, editor]);
  f.topDom.body.append(dialog);
  const options = { view: "code", expectedBlockId: blockId, expectedModule: module, expectedPageId: PAGE_ID, expectedPath: new URL(PAGE).pathname };
  return { ...f, options, selected, mode, showSource, lines, editor, dialog };
}

test("the bound HTML CodeMirror source confirms only the selected FN module and discloses no raw source", async () => {
  for (const module of ["species", "map"]) {
    const f = codeEditorFixture(module);
    const result = await readSquarespacePageObservation(f.contents, f.options);
    assert.deepEqual(result.codeEditor, { status: "source-matched", blockId: f.options.expectedBlockId, module,
      modalId: f.dialog.attrs["data-modal-id"] });
    assert.equal(result.fullCapability, false);
    assert.equal(result.page.saved, null);
    assert.deepEqual(f.reads, [["top", "code-dialog"], ["frame", "code-selection"], ["top", "code-dialog"], ["frame", "code-selection"]]);
    assert.equal(f.topDom.calls + f.frameDom.calls, 0);
  }
});

test("the Squarespace HTML default is matched exactly only in its bound block and never as empty or an FN module", async () => {
  assert.equal(SQUARESPACE_DEFAULT_CODE, "<p>Hello, World!</p>");
  const f = codeEditorFixture("default-placeholder");
  const result = await readSquarespacePageObservation(f.contents, f.options);
  assert.deepEqual(result.codeEditor, { status: "source-matched", blockId: f.options.expectedBlockId, module: "default-placeholder",
    modalId: f.dialog.attrs["data-modal-id"] });
  assert.deepEqual(f.reads, [["top", "code-dialog"], ["frame", "code-selection"], ["top", "code-dialog"], ["frame", "code-selection"]]);
  for (const expectedModule of ["empty", "species", "map"]) {
    const different = await readSquarespacePageObservation(f.contents, { ...f.options, expectedModule });
    assert.deepEqual(different.reasonCodes, ["code-source-mismatch"]);
    assert.equal(different.codeEditor, undefined);
  }
  for (const [change, reason] of [
    [g => { g.lines[0].append(" "); }, "code-source-mismatch"],
    [g => { g.lines[0].children[0].childNodes[0].nodeValue = "<p>Hello, World?</p>"; }, "code-source-mismatch"],
    [g => { g.editor.append(g.topDom.element("div", { class: "cm-line" })); }, "code-source-mismatch"],
    [g => { g.selected.attrs["data-block-id"] = "wrong-block"; }, "code-selection-unqualified"],
  ]) {
    const changed = codeEditorFixture("default-placeholder");
    change(changed);
    const rejected = await readSquarespacePageObservation(changed.contents, changed.options);
    assert.deepEqual(rejected.reasonCodes, [reason]);
    assert.equal(rejected.codeEditor, undefined);
  }
});

test("Code-Editor liest den gebundenen gerenderten Seitenrahmen unter dem modalen Fokus", async () => {
  const f = codeEditorFixture("default-placeholder");
  f.topDom.body.childNodes.splice(f.topDom.body.childNodes.indexOf(f.iframe), 1);
  const background = f.topDom.element("div", { "aria-hidden": "true", inert: "" }, [f.iframe]);
  f.topDom.body.append(background);
  const result = await readSquarespacePageObservation(f.contents, f.options);
  assert.equal(result.codeEditor?.status, "source-matched");
  assert.equal(result.codeEditor?.blockId, f.options.expectedBlockId);
  assert.deepEqual(f.reads, [["top", "code-dialog"], ["frame", "code-selection"], ["top", "code-dialog"], ["frame", "code-selection"]]);
  assert.equal((await readSquarespacePageObservation(f.contents, { expectedPageId: PAGE_ID, expectedPath: f.options.expectedPath })).page.id, null);

  background.css.display = "none";
  assert.equal((await readSquarespacePageObservation(f.contents, f.options)).codeEditor, undefined);
  background.css.display = "block";
  f.topDom.body.append(f.topDom.element("iframe", { id: "sqs-site-frame", src: PAGE, hidden: "" }));
  assert.equal((await readSquarespacePageObservation(f.contents, f.options)).codeEditor, undefined);
});

function addEmptyCodePlaceholder(f) {
  const { element } = f.topDom;
  const buffer = element("img", { class: "cm-widgetBuffer", "aria-hidden": "true" });
  const placeholder = element("span", { class: "cm-placeholder", "aria-hidden": "true", contenteditable: "false",
    style: "pointer-events: none;" }, ["Code hinzufügen\u00a0..."]);
  const lineBreak = element("br");
  f.lines[0].childNodes = [];
  f.lines[0].append(buffer, placeholder, lineBreak);
  return { buffer, placeholder, lineBreak };
}

test("empty CodeMirror proof accepts a bare blank line and the exact observed Squarespace placeholder", async () => {
  for (const layout of ["plain", "break", "placeholder"]) {
    const f = codeEditorFixture("empty"), line = f.lines[0];
    line.childNodes = [];
    if (layout === "break") line.append(f.topDom.element("br"));
    if (layout === "placeholder") addEmptyCodePlaceholder(f);
    assert.equal(isSquarespaceEmptyCodeLine(line), true, layout);
    const result = await readSquarespacePageObservation(f.contents, f.options);
    assert.deepEqual(result.codeEditor, { status: "empty", blockId: f.options.expectedBlockId, module: "empty",
      modalId: f.dialog.attrs["data-modal-id"] }, layout);
    assert.deepEqual(f.reads, [["top", "code-dialog"], ["frame", "code-selection"], ["top", "code-dialog"], ["frame", "code-selection"]]);
  }
});

test("empty CodeMirror proof does not ignore arbitrary hidden text or a lookalike placeholder", async () => {
  for (const [name, change] of Object.entries({
    "foreign hidden text": (_f, elements) => { elements.placeholder.childNodes[0].nodeValue = "Verdeckter eigener Code"; },
    "wrong locale": (_f, elements) => { elements.placeholder.childNodes[0].nodeValue = "Add code\u00a0..."; },
    "missing hidden marker": (_f, elements) => { delete elements.placeholder.attrs["aria-hidden"]; },
    "missing non-editable marker": (_f, elements) => { delete elements.placeholder.attrs.contenteditable; },
    "missing pointer style": (_f, elements) => { delete elements.placeholder.attrs.style; },
    "buffer source": (_f, elements) => { elements.buffer.attrs.src = "/unexpected.png"; },
    "unexpected break marker": (_f, elements) => { elements.lineBreak.attrs["aria-hidden"] = "true"; },
    "additional code": f => { f.lines[0].append(" "); },
    "reordered marker": f => { f.lines[0].childNodes.reverse(); },
  })) {
    const f = codeEditorFixture("empty"), elements = addEmptyCodePlaceholder(f);
    change(f, elements);
    assert.equal(isSquarespaceEmptyCodeLine(f.lines[0]), false, name);
    const result = await readSquarespacePageObservation(f.contents, f.options);
    assert.deepEqual(result.reasonCodes, ["code-source-mismatch"], name);
    assert.equal(result.codeEditor, undefined, name);
  }
});

test("source drift, selection drift, code-as-text and incomplete editor lines yield no source confirmation", async () => {
  for (const [mutate, reason] of [
    [f => f.lines[0].append(" Fremder Inhalt"), "code-source-mismatch"],
    [f => { f.selected.attrs["data-block-id"] = "anderer-block"; }, "code-selection-unqualified"],
    [f => { f.showSource.checked = true; }, "code-editor-unqualified"],
    [f => { f.lines[0].attrs.class = "cm-gap"; }, "code-editor-unqualified"],
    [f => { let reads = 0; f.hooks.top = () => { if (++reads === 2) f.dialog.attrs["data-modal-id"] = "m12345678-1234-1234-1234-1234567890ac"; }; }, "code-editor-observation-changed"],
  ]) {
    const f = codeEditorFixture(); mutate(f);
    const result = await readSquarespacePageObservation(f.contents, f.options);
    assert.deepEqual(result.reasonCodes, [reason]);
    assert.equal(result.codeEditor, undefined);
  }
});
function addPageSettings(f) {
  const { element } = f.topDom;
  const title = element("input", { type: "text", "aria-label": "Seitentitel" }); title.value = "Arten-Explorer Funktionsprüfung 2026-11-02";
  const slug = element("input", { type: "text", "aria-label": "URL-Slug" }); slug.value = new URL(PAGE).pathname.slice(1);
  const label = element("p", { id: ":r14:" }, ["Seite aktivieren"]);
  const enabled = element("input", { type: "checkbox", "aria-labelledby": ":r14:" }); enabled.checked = false;
  const notice = element("button", { disabled: "" }, ["Diese Seite ist deaktiviert"]);
  const dialog = element("div", { role: "dialog", "data-modal-id": "m12345678-1234-1234-1234-1234567890ab" },
    [title, slug, label, element("label", {}, [enabled]), notice]);
  f.topDom.body.append(dialog);
  return { title, slug, label, enabled, notice, dialog };
}
function replaceWithRenderedText(f) {
  const { element } = f.frameDom;
  Object.assign(f.block.attrs, { class: "sqs-block sqs-block-html html-block", "data-block-type": "1337",
    "data-definition-name": "website.components.html", "data-sqsp-block": "text" });
  f.block.childNodes = [];
  const rendered = element("div", { class: "sqs-html-content", "data-sqsp-text-block-content": "" }, [
    element("h3", {}, ["Gerenderter Titel"]), element("p", {}, ["Sichtbarer Text"]),
  ]);
  f.block.append(element("div", { class: "sqs-block-content" }, [element("div", { class: "sqs-text-block-container" }, [rendered])]));
  return rendered;
}

async function textWriterFixture() {
  const targetPath = "/wildlife/heimische-tierwelt/pruefart", planHash = "a".repeat(64), title = "Prüfart & <Text>";
  const f = fixture(new URL(targetPath, ADMIN).href);
  const rich = [{ type: "heading", level: 5, text: "Gefieder" }, { type: "paragraph", text: "Eine Zeile\nNoch eine Zeile" }];
  const blocks = [{ type: "heading", level: 3, text: title }, { type: "richtext", blocks: rich },
    { type: "code", code: FN_SPECIES_CODE }, { type: "code", code: FN_MAP_CODE }, { type: "gallery", items: [] }];
  const [step] = createCmsContentSteps({ schemaVersion: 2, publish: false, planHash, target: { path: targetPath }, structure: { title, slots: blocks },
    readback: { schemaVersion: 1, expectation: { schemaVersion: 1, path: targetPath, title, blocks } } });
  const dispatchBinding = createCmsDispatchBinding({ projectId: "project-a", attemptId: "attempt-a", dispatchId: "dispatch-a", planHash, targetPath });
  const settings = addPageSettings(f);
  settings.title.value = title; settings.slug.value = targetPath.slice(1);
  const confirmOptions = { pageId: PAGE_ID, expectedTitle: title, dispatchBinding };
  // The current live Squarespace preview is blank while the settings are visible.
  const frameUrl = f.frame.url;
  f.frame.url = "about:blank";
  const disabledPage = await confirmSquarespaceDisabledPage(f.contents, confirmOptions);
  f.frame.url = frameUrl; settings.dialog.css.display = "none";
  const payloads = [];
  const { document, element } = f.frameDom;
  f.editor.childNodes = [];
  f.editor.append(element("p", {}, [element("br")]));
  Object.assign(f.editor, { isConnected: true, isContentEditable: true, focus() { document.activeElement = this; } });
  f.article.contains = node => f.article.children.includes(node);
  let selected = null;
  document.createRange = () => ({ selectNodeContents(node) { selected = node; } });
  document.getSelection = () => ({ removeAllRanges() {}, addRange() {} });
  const input = f.frame.executeJavaScript;
  class Transfer extends Map { setData(key, value) { this.set(key, value); } }
  class Paste { constructor(type, options) { this.type = type; this.clipboardData = options.clipboardData; } }
  f.frame.executeJavaScript = async function (code) {
    if (!code.startsWith("(function pasteInFrame")) return input.call(this, code);
    return f.frameDom.execute(code, { DataTransfer: Transfer, ClipboardEvent: Paste });
  };
  f.editor.dispatchEvent = event => {
    assert.equal(event.type, "paste"); assert.equal(selected, f.editor);
    payloads.push(Object.fromEntries(event.clipboardData));
    f.editor.childNodes = [];
    f.editor.append(element("h3", {}, [title]), element("h5", {}, ["Gefieder"]),
      element("p", {}, ["Eine Zeile", element("br"), "Noch eine Zeile"]));
  };
  const options = { pageId: PAGE_ID, blockId: BLOCK_ID, step, dispatchBinding, disabledPage, assertWritable: async () => true };
  return { ...f, options, settings, confirmOptions, payloads, expected: [blocks[0], ...rich] };
}

test("text entry passes only approved rich content to one empty bound editor and compares the readback", async () => {
  const f = await textWriterFixture();
  f.options.assertWritable = async (binding) => {
    assert.deepEqual(binding, { pageId: PAGE_ID, path: f.options.dispatchBinding.targetPath, blockId: BLOCK_ID });
    assert.equal(f.payloads.length, 0);
    return true;
  };
  const result = await insertSquarespacePageText(f.contents, f.options);
  assert.deepEqual(result, { pageId: PAGE_ID, blockId: BLOCK_ID, blocks: f.expected });
  assert.deepEqual(f.payloads, [{ "text/html": "<h3>Prüfart &amp; &lt;Text&gt;</h3>\n<h5>Gefieder</h5>\n<p>Eine Zeile<br>Noch eine Zeile</p>",
    "text/plain": "Prüfart & <Text>\nGefieder\nEine Zeile\nNoch eine Zeile" }]);
  await assert.rejects(insertSquarespacePageText(f.contents, f.options), { code: "SQUARESPACE_TEXT_TARGET_CHANGED" });
  assert.equal(f.payloads.length, 1);
});

test("text entry stops before dispatch on missing authority, drift, cloned input or another plan", async () => {
  for (const change of [f => { f.options.assertWritable = async () => false; },
    f => { f.options.assertWritable = async () => { f.frame.url += "?different"; return true; }; },
    f => { f.options.step = { ...f.options.step }; },
    f => { f.options.disabledPage = { ...f.options.disabledPage }; },
    f => { f.options.assertWritable = async () => { f.settings.dialog.css.display = "block"; return true; }; },
    f => { f.options.dispatchBinding = { ...f.options.dispatchBinding, planHash: "b".repeat(64) }; },
    f => { f.options.assertWritable = async () => { f.editor.append("Fremde Eingabe"); return true; }; },
    f => { f.editor.focus = () => { f.editor.append("Fremde Eingabe nach Fokus"); }; },
    f => { f.options.pageId = "0".repeat(24); }]) {
    const f = await textWriterFixture(); change(f);
    await assert.rejects(insertSquarespacePageText(f.contents, f.options), { code: "SQUARESPACE_TEXT_TARGET_CHANGED" });
    assert.equal(f.payloads.length, 0);
  }
});

test("a paste event alone never qualifies input when the editor ignores or changes its contents", async () => {
  for (const accepts of [false, true]) {
    const f = await textWriterFixture(), apply = f.editor.dispatchEvent;
    let attempted = 0;
    f.editor.dispatchEvent = event => {
      attempted++;
      if (accepts) { apply(event); f.editor.childNodes[0].childNodes[0].nodeValue = "Anderer Titel"; }
    };
    await assert.rejects(insertSquarespacePageText(f.contents, f.options), { code: "SQUARESPACE_TEXT_UNCONFIRMED" });
    assert.equal(attempted, 1);
  }
});

test("disabled-page proof needs the exact settings dialog title, saved disable switch and same configured preview path", async () => {
  for (const change of [
    f => { f.settings.title.value += " andere Seite"; },
    f => { f.settings.enabled.checked = true; },
    f => { f.iframe.attrs.src = "/wildlife/heimische-tierwelt/andere-art"; },
    f => { f.iframe.attrs.src = "https://foreign.invalid" + f.confirmOptions.dispatchBinding.targetPath; },
    f => { delete f.settings.dialog.attrs["data-modal-id"]; },
    f => { f.hooks.top = () => {
      if (f.reads.length === 2) f.settings.dialog.attrs["data-modal-id"] = "m87654321-1234-1234-1234-1234567890ab";
    }; },
  ]) {
    const f = await textWriterFixture();
    f.reads.length = 0; f.settings.dialog.css.display = "block"; change(f);
    await assert.rejects(confirmSquarespaceDisabledPage(f.contents, f.confirmOptions), { code: "SQUARESPACE_TEXT_TARGET_CHANGED" });
  }
});

test("confirmed settings and a configured preview path still do not permit writing while the loaded preview is blank", async () => {
  const f = await textWriterFixture();
  f.frame.url = "about:blank";
  await assert.rejects(insertSquarespacePageText(f.contents, f.options), { code: "SQUARESPACE_TEXT_TARGET_CHANGED" });
  assert.equal(f.payloads.length, 0);
});

test("actual H3/H4/paragraph values remain partial observations, never inferred plan or persistence claims", async () => {
  const f = fixture(); f.topDom.body.append(f.topDom.element("span", {}, ["Seite · Deaktiviert"]));
  const result = await readSquarespacePageObservation(f.contents, { expectedPageId: PAGE_ID });
  assert.equal(result.status, "partial"); assert.equal(result.fullCapability, false); assert.equal(result.pendingDomRead, false);
  assert.deepEqual(result.page, { id: PAGE_ID, path: new URL(PAGE).pathname, title: null, enabled: null, saved: null, reopened: null });
  assert.deepEqual(result.textBlocks[0].blocks, [
    { type: "heading", level: 3, text: "Tatsächlich beobachteter Titel" }, { type: "heading", level: 4, text: "Aussehen" },
    { type: "paragraph", text: "Tatsächlicher Text mit Umlauten und &." },
  ]);
  assert.equal(result.textBlocks[0].observedMarkupSupported, true); assert.equal(Object.hasOwn(result.textBlocks[0], "nativeQualified"), false);
  assert.equal(result.textBlocks[0].source, "editor");
  assert.deepEqual(f.reads.map(value => value[1]), ["top", "frame", "top", "frame"]);
  assert.equal(f.topDom.calls + f.frameDom.calls, 0);
});
test("the Squarespace read-only text wrapper reports rendered markup separately from editor input", async () => {
  const f = fixture(); replaceWithRenderedText(f);
  const result = await readSquarespacePageObservation(f.contents, { expectedPageId: PAGE_ID, expectedPath: new URL(PAGE).pathname });
  assert.equal(result.status, "partial"); assert.equal(result.textBlocks[0].source, "rendered");
  assert.deepEqual(result.textBlocks[0].blocks, [{ type: "heading", level: 3, text: "Gerenderter Titel" }, { type: "paragraph", text: "Sichtbarer Text" }]);
  assert.equal(result.page.saved, null); assert.equal(result.page.reopened, null); assert.equal(result.fullCapability, false);
});
test("lookalike text wrappers, hidden paragraphs and writable descendants do not become rendered text evidence", async () => {
  for (const change of [
    (f) => { f.block.attrs["data-definition-name"] = "website.components.code"; },
    (_f, rendered) => { delete rendered.attrs["data-sqsp-text-block-content"]; },
    (_f, rendered) => { rendered.childNodes[1].attrs["aria-hidden"] = "true"; },
    (f, rendered) => { rendered.append(f.frameDom.element("div", { contenteditable: "true" }, ["Offene Eingabe"])); },
  ]) {
    const f = fixture(), rendered = replaceWithRenderedText(f); change(f, rendered);
    const result = await readSquarespacePageObservation(f.contents);
    assert.equal(result.status, "unsupported"); assert.deepEqual(result.textBlocks, []);
  }
});
test("the disabled setting can be read independently of an empty preview and a contradictory toolbar", async () => {
  const f = fixture(); f.frame.url = "about:blank"; addPageSettings(f);
  f.topDom.body.append(f.topDom.element("span", {}, ["Seite · Veröffentlicht"]));
  const result = await readSquarespacePageObservation(f.contents, { view: "settings", expectedPath: new URL(PAGE).pathname });
  assert.equal(result.status, "partial"); assert.equal(result.fullCapability, false);
  assert.deepEqual(result.pageSettings, { status: "observed", path: new URL(PAGE).pathname,
    title: "Arten-Explorer Funktionsprüfung 2026-11-02", displayedEnabled: false });
  assert.equal(result.page.enabled, null); assert.equal(result.page.saved, null); assert.equal(result.page.reopened, null);
  assert.deepEqual(f.reads, [["top", "settings"], ["top", "settings"]]); assert.equal(f.topDom.calls, 0);
});
test("a closed, foreign, edited or ambiguous settings dialog cannot qualify the bound setting", async () => {
  const expectedPath = new URL(PAGE).pathname;
  for (const [change, reason] of [
    [(_f, fields) => { fields.dialog.css.display = "none"; }, "page-settings-unobserved"],
    [(_f, fields) => { fields.slug.value = "andere-seite"; }, "page-settings-target-mismatch"],
    [(f, fields) => { fields.dialog.append(f.topDom.element("button", {}, ["Speichern"])); }, "page-settings-unsaved"],
    [(_f, fields) => { fields.enabled.checked = true; }, "page-settings-controls-unqualified"],
    [(f) => { addPageSettings(f); }, "page-settings-ambiguous"],
  ]) {
    const f = fixture(), fields = addPageSettings(f); change(f, fields);
    const result = await readSquarespacePageObservation(f.contents, { view: "settings", expectedPath });
    assert.equal(result.status, "unknown"); assert.equal(result.pageSettings.displayedEnabled, null);
    assert.deepEqual(result.reasonCodes, [reason]);
  }
});
test("changing a settings field during observation discards the first dialog snapshot", async () => {
  const f = fixture(), fields = addPageSettings(f);
  f.hooks.top = () => { if (f.reads.length === 2) fields.title.value = "Anderer sichtbarer Titel"; };
  const result = await readSquarespacePageObservation(f.contents, { view: "settings", expectedPath: new URL(PAGE).pathname });
  assert.equal(result.status, "unknown"); assert.equal(result.pageSettings.displayedEnabled, null);
  assert.deepEqual(result.reasonCodes, ["page-settings-observation-changed"]);
});
test("only observed FN v1/v2 library/UUID routes share identity and retain their original source", () => {
  for (const asset of [ASSET_A, ASSET_B]) {
    const v1 = imageUrl(asset, "v1", "?format=750w"), v2 = imageUrl(asset, "v2", "?format=300w");
    assert.deepEqual(identifySquarespacePageAsset(v1).identity, identifySquarespacePageAsset(v2).identity);
    assert.equal(identifySquarespacePageAsset(v1).originalSource, v1); assert.equal(identifySquarespacePageAsset(v2).originalSource, v2);
    assert.equal(identifySquarespacePageAsset(v2).uploadedBytes, "unobserved");
  }
  for (const value of [imageUrl(ASSET_A).replace("/v1/", "/v2/"), imageUrl(ASSET_A).replace(LIBRARY, "000000000000000000000000"),
    imageUrl(ASSET_A, "v1", "?crop=1"), imageUrl(ASSET_A, "v1", "?format=300w&format=750w"), imageUrl(ASSET_A, "v1", "?format=999w"),
    imageUrl(ASSET_A).replace("fn-cms", "bad%2Ffn-cms"), imageUrl(ASSET_A).replace("images.squarespace-cdn.com", "evil.test"),
    `https://secret@images.squarespace-cdn.com/content/v1/${LIBRARY}/${ASSET_A}/x.png`, imageUrl(ASSET_A) + "#x"]) {
    const result = identifySquarespacePageAsset(value); assert.equal(result.status, "unsupported", value); assert.equal(result.identity, null); assert.equal(result.originalSource, null);
  }
});
test("gallery manager order and the two real upload identities are observed without inventing independent fields or a section binding", async () => {
  const f = fixture(); addGallery(f);
  const result = await readSquarespacePageObservation(f.contents, { expectedPageId: PAGE_ID });
  assert.deepEqual(result.galleryEditor.items.map(item => item.cmsItemId), [ITEM_B, ITEM_A]);
  assert.deepEqual(result.galleryEditor.items.map(item => item.source.identity.assetId), [ASSET_B, ASSET_A]);
  assert.equal(result.galleryEditor.orderObserved, true); assert.equal(result.galleryEditor.boundSectionId, null);
  assert.deepEqual(result.galleryEditor.fields, { alt: "unobserved", caption: "unobserved", attribution: "unobserved", decorative: "unobserved" });
  assert.equal(result.galleries[0].sectionId, SECTION_ID); assert.equal(result.galleries[0].orderObserved, false);
  assert.equal(result.galleries[0].emptyGalleryVerified, false); assert.equal(result.page.saved, null);
});
test("gallery file submission sends one exact file and stops on changed dialog, row order, navigation or approval", async () => {
  const modalId = "m12345678-1234-1234-1234-1234567890ab";
  const bytes = Buffer.from([0, 41, 128, 255]), fileName = `fn-${"a".repeat(24)}-1.png`;
  for (const mode of ["confirmed", "pending", "missing-field", "second-field", "replaced-dialog", "row-drift", "navigation",
    "hidden-row", "existing-selection", "cancelled", "closed-after-submit", "replaced-during-confirmation"]) {
    const f = fixture(), gallery = addGallery(f);
    gallery.dialog.attrs["data-modal-id"] = modalId;
    if (mode === "hidden-row") gallery.rows.at(-1).css.display = "none";
    delete gallery.dialog.attrs["data-test"];
    const manager = f.topDom.element("div", { "data-test": "gallery-manager-modal" });
    const input = f.topDom.element("input", { type: "file", accept: "image/png,image/gif,image/jpeg,image/webp", multiple: "" });
    input.css.display = "none";
    input.files = mode === "existing-selection" ? [new File(["user file"], "user.jpg")] : [];
    input.matches = selector => selector === ":disabled" && input.getAttribute("disabled") !== null;
    manager.contains = element => manager.children.includes(element);
    if (mode !== "missing-field") manager.append(input);
    if (mode === "second-field") gallery.dialog.append(f.topDom.element("input", { type: "file" }));
    gallery.dialog.append(manager);
    const events = [];
    input.dispatchEvent = event => { events.push(event); return true; };
    class DataTransfer {
      files = [];
      items = { add: file => this.files.push(file) };
    }
    f.top.executeJavaScript = async code => f.topDom.execute(code, { atob, DataTransfer, File, Event });
    const controller = new AbortController();
    let captured = false, polls = 0;
    const task = submitSquarespaceGalleryFile(f.contents, {
      path: new URL(PAGE).pathname, fileName, bytes, mimeType: "image/png", signal: controller.signal,
      assertCurrent: async () => { if (mode === "cancelled" && captured) controller.abort(); },
      captureBeforeUpload: async (_rowIds, observedModalId) => {
        assert.equal(observedModalId, modalId);
        captured = true;
        if (mode === "replaced-dialog") gallery.dialog.attrs["data-modal-id"] = modalId.replace(/ab$/, "ac");
        if (mode === "row-drift") gallery.rows[0].attrs["data-itemid"] = "f".repeat(24);
        if (mode === "navigation") f.frame.url = `${PAGE}/anders`;
      },
      confirmUpload: async observedModalId => {
        assert.equal(observedModalId, modalId);
        if (mode === "replaced-during-confirmation") gallery.dialog.attrs["data-modal-id"] = modalId.replace(/ab$/, "ac");
        return ++polls === 2 || mode === "replaced-during-confirmation";
      },
      waitFor: async check => {
        if (mode === "closed-after-submit") gallery.dialog.css.display = "none";
        if (!await check() && (mode === "pending" || !await check())) throw new Error("no acknowledgement");
      },
    });
    if (mode === "confirmed") await task;
    else await assert.rejects(task, mode === "cancelled" ? { name: "AbortError" } : mode === "pending" ? /no acknowledgement/
      : { code: "SQUARESPACE_PAGE_GALLERY_FILE_UNAVAILABLE" });
    if (["confirmed", "pending", "closed-after-submit", "replaced-during-confirmation"].includes(mode)) {
      assert.equal(events.length, 1);
      assert.equal(events[0].type, "change");
      assert.equal(events[0].bubbles, true);
      const [file] = input.files;
      assert.equal(input.files.length, 1);
      assert.equal(file.name, fileName);
      assert.equal(file.type, "image/png");
      assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
    } else assert.equal(events.length, 0);
  }
});
test("stock or additional items are all retained in the observation and zero rendered items never certify an empty gallery", async () => {
  const f = fixture(); addGallery(f, { count: 8 });
  const result = await readSquarespacePageObservation(f.contents);
  assert.equal(result.galleryEditor.items.length, 8); assert.equal(result.galleries[0].previewImageCount, 8);
  const empty = fixture(), emptyGallery = addGallery(empty, { count: 0 });
  emptyGallery.dialog.attrs["data-modal-id"] = "m12345678-1234-1234-1234-1234567890ab";
  const value = await readSquarespacePageObservation(empty.contents);
  assert.equal(value.galleryEditor.status, "unknown"); assert.equal(value.galleryEditor.orderObserved, false); assert.equal(value.galleries[0].emptyGalleryVerified, false);
  assert.equal(value.galleryEditor.renderedRowsEmpty, true);
  const hidden = fixture(), hiddenGallery = addGallery(hidden);
  hiddenGallery.dialog.attrs["data-modal-id"] = emptyGallery.dialog.attrs["data-modal-id"];
  for (const row of hiddenGallery.rows) row.css.display = "none";
  assert.equal((await readSquarespacePageObservation(hidden.contents)).galleryEditor.renderedRowsEmpty, false);
});
test("duplicate image IDs, missing indices, index drift and ambiguous previews cannot qualify an order", async () => {
  for (const mutate of [rows => { rows[1].attrs["data-itemid"] = ITEM_B; }, rows => { delete rows[1].attrs["data-index"]; },
    rows => { rows[1].attrs["data-index"] = "3"; }, rows => { rows[0].append(rows[0].children[0]); }]) {
    const f = fixture(), gallery = addGallery(f); mutate(gallery.rows);
    const result = await readSquarespacePageObservation(f.contents);
    assert.equal(result.galleryEditor.status, "unsupported"); assert.equal(result.galleryEditor.orderObserved, false); assert.equal(result.galleryEditor.items.length, 2);
  }
});
test("missing, foreign, nested, ambiguous and detached preview frames are unknown before reading content", async () => {
  for (const mutate of [f => { f.iframe.attrs.id = "other-frame"; }, f => { f.iframe.attrs.src = "https://foreign.invalid/page"; },
    f => { f.frame.parent = {}; }, f => { f.top.framesInSubtree.push({ ...f.frame }); }, f => { f.frame.detached = true; },
    f => { f.topDom.body.append(f.topDom.element("iframe", { id: "sqs-site-frame", src: PAGE })); }]) {
    const f = fixture(); mutate(f); const result = await readSquarespacePageObservation(f.contents);
    assert.equal(result.status, "unknown"); assert.deepEqual(result.textBlocks, []); assert.equal(f.reads.some(([side]) => side === "frame"), false);
  }
});
test("collection mismatch and an empty unloaded body never supply guessed title, texts or success", async () => {
  for (const bodyId of ["", "collection-000000000000000000000000"]) {
    const f = fixture(); f.frameDom.body.id = bodyId;
    const result = await readSquarespacePageObservation(f.contents, { expectedPageId: PAGE_ID });
    assert.equal(result.status, "unknown"); assert.deepEqual(result.textBlocks, []); assert.equal(result.page.id, null); assert.equal(result.fullCapability, false);
  }
});
test("hidden/inert/transparent/content-hidden ancestors and excessive parent depth fail closed", async () => {
  for (const mutate of [f => { f.main.attrs.hidden = ""; }, f => { f.main.attrs.inert = ""; }, f => { f.main.css.opacity = "0"; },
    f => { f.main.css.contentVisibility = "hidden"; }, f => { f.main.attrs["aria-hidden"] = "true"; }, f => { f.main.css.visibility = "hidden"; },
    f => { let parent = f.frameDom.body; for (let i = 0; i < 101; i++) { const wrapper = f.frameDom.element("div"); parent.childNodes = []; parent.append(wrapper); parent = wrapper; } parent.append(f.main); }]) {
    const f = fixture(); mutate(f); const result = await readSquarespacePageObservation(f.contents);
    assert.deepEqual(result.textBlocks, []); assert.notEqual(result.status, "partial");
  }
});
test("lists are synthetically supported only; unknown inline markup and code are never flattened into plausible text", async () => {
  const f = fixture(); f.editor.append(f.frameDom.element("ul", {}, [f.frameDom.element("li", {}, ["Erster Punkt"])]));
  const result = await readSquarespacePageObservation(f.contents);
  assert.equal(result.textBlocks[0].syntheticOnlyMarkup, true); assert.deepEqual(result.textBlocks[0].blocks.at(-1), { type: "bullet-list", items: ["Erster Punkt"] });
  for (const element of ["a", "script", "code", "pre"]) {
    const unknown = fixture(); unknown.editor.append(unknown.frameDom.element(element, {}, ["Ungeprüfter Inhalt"]));
    const observed = await readSquarespacePageObservation(unknown.contents);
    assert.equal(observed.status, "unsupported"); assert.deepEqual(observed.textBlocks, []); assert.ok(observed.reasonCodes.includes("richtext-markup-unqualified"));
  }
  const code = fixture(); code.block.childNodes = [code.frameDom.element("textarea")];
  Object.defineProperty(code.block.childNodes[0], "value", { get() { throw new Error("Do not guess a code field"); } });
  assert.equal((await readSquarespacePageObservation(code.contents)).status, "unsupported");
});
test("multiple or hidden contenteditable fields and duplicate block identifiers never pick an arbitrary text", async () => {
  for (const mutate of [f => { f.block.append(f.frameDom.element("div", { contenteditable: "true", role: "textbox" })); },
    f => { f.editor.css.display = "none"; }, f => { f.article.append(f.frameDom.element("div", { id: BLOCK_ID }, [f.frameDom.element("div", { contenteditable: "true", role: "textbox" })])); }]) {
    const f = fixture(); mutate(f); const result = await readSquarespacePageObservation(f.contents);
    assert.ok(result.reasonCodes.length); assert.equal(result.fullCapability, false); assert.deepEqual(result.textBlocks, []);
  }
});
test("nested block containers invalidate both enclosing and enclosed text identities", async () => {
  const f = fixture(), nested = f.frameDom.element("div", { id: "block-000000000000000000000001" }, [
    f.frameDom.element("div", { contenteditable: "true", role: "textbox" }, [f.frameDom.element("p", {}, ["Nicht eindeutig zugeordneter Text"])]),
  ]);
  f.block.append(nested);
  const result = await readSquarespacePageObservation(f.contents);
  assert.deepEqual(result.textBlocks, []); assert.ok(result.reasonCodes.includes("block-identity-unqualified"));
});
test("duplicate gallery section identifiers invalidate every matching section instead of retaining the first", async () => {
  const f = fixture(); addGallery(f, { withEditor: false }); addGallery(f, { withEditor: false });
  const result = await readSquarespacePageObservation(f.contents);
  assert.deepEqual(result.galleries, []); assert.ok(result.reasonCodes.includes("gallery-section-identity-unqualified"));
  assert.equal(result.textBlocks.length, 1); assert.equal(result.fullCapability, false);
});
test("frame/body changes during reads invalidate the entire earlier snapshot", async () => {
  for (const mutate of [f => { f.frameDom.body.id = "collection-000000000000000000000000"; }, f => { f.frame.url = "https://foreign.invalid/changed"; },
    f => { f.top.framesInSubtree = [f.top]; }]) {
    const f = fixture(); f.hooks.frame = () => { if (f.reads.filter(([side]) => side === "frame").length === 2) mutate(f); };
    const result = await readSquarespacePageObservation(f.contents);
    assert.equal(result.status, "unknown"); assert.deepEqual(result.textBlocks, []); assert.deepEqual(result.reasonCodes, ["preview-observation-changed"]);
  }
});
test("leaving the pages administration during a read invalidates the earlier snapshot", async () => {
  const f = fixture();
  f.hooks.frame = () => {
    if (f.reads.filter(([side]) => side === "frame").length === 2) f.contents.getURL = () => new URL("/config/website", ADMIN).href;
  };
  const result = await readSquarespacePageObservation(f.contents);
  assert.equal(result.status, "unknown"); assert.deepEqual(result.textBlocks, []);
  assert.deepEqual(result.reasonCodes, ["preview-observation-changed"]);
});
test("a still-bound preview that empties or changes text during readback cannot confirm the first contents", async () => {
  for (const change of [f => { f.main.childNodes = []; }, f => {
    f.editor.childNodes[2].childNodes[0].nodeValue = "Geänderter Inhalt";
  }]) {
    const f = fixture();
    f.hooks.frame = () => { if (f.reads.filter(([side]) => side === "frame").length === 2) change(f); };
    const result = await readSquarespacePageObservation(f.contents, { expectedPageId: PAGE_ID });
    assert.equal(result.status, "unknown"); assert.deepEqual(result.textBlocks, []);
    assert.deepEqual(result.reasonCodes, ["preview-observation-changed"]);
  }
});
test("a closed or reordered gallery manager cannot supply its stale order to a later preview observation", async () => {
  for (const change of [gallery => { gallery.dialog.css.display = "none"; }, gallery => {
    gallery.dialog.childNodes.reverse();
    gallery.dialog.childNodes.forEach((row, index) => { row.attrs["data-index"] = String(index); });
  }]) {
    const f = fixture(), gallery = addGallery(f);
    f.hooks.frame = () => { if (f.reads.filter(([side]) => side === "frame").length === 1) change(gallery); };
    const result = await readSquarespacePageObservation(f.contents, { expectedPageId: PAGE_ID });
    assert.equal(result.status, "partial"); assert.equal(result.textBlocks.length, 1);
    assert.equal(result.galleryEditor.orderObserved, false); assert.deepEqual(result.galleryEditor.items, []);
    assert.ok(result.galleryEditor.reasonCodes.includes("gallery-editor-observation-changed"));
  }
});
test("timeout reports a still pending read and a late document result never upgrades the returned unknown snapshot", async () => {
  const f = fixture(), gate = deferred(); f.hooks.top = () => gate.promise;
  const result = await readSquarespacePageObservation(f.contents, { timeoutMs: 5 });
  assert.equal(result.status, "unknown"); assert.equal(result.pendingDomRead, true); assert.deepEqual(result.reasonCodes, ["preview-observation-timeout"]);
  gate.resolve(); await Promise.resolve(); assert.equal(result.status, "unknown"); assert.deepEqual(result.textBlocks, []);
});
test("a bound preview can wait for the assigned frame to leave about:blank and then read its actual content", async () => {
  const f = fixture(); f.frame.url = "about:blank";
  f.hooks.top = () => { if (f.reads.length === 2) f.frame.url = PAGE; };
  const result = await readSquarespacePageObservation(f.contents, { expectedPageId: PAGE_ID, expectedPath: new URL(PAGE).pathname, waitForContentMs: 2000 });
  assert.equal(result.status, "partial"); assert.equal(result.page.reopened, null);
  assert.deepEqual(f.reads.map(value => value[1]), ["top", "top", "frame", "top", "frame"]);
  assert.equal(result.textBlocks[0].blocks[0].text, "Tatsächlich beobachteter Titel");
});
test("a loaded preview without an article can wait for the same page's content", async () => {
  const f = fixture(); f.main.childNodes = [];
  f.hooks.frame = () => { if (f.reads.filter(([side]) => side === "frame").length === 2) f.main.append(f.article); };
  const result = await readSquarespacePageObservation(f.contents, { expectedPageId: PAGE_ID, expectedPath: new URL(PAGE).pathname, waitForContentMs: 2000 });
  assert.equal(result.status, "partial"); assert.equal(result.textBlocks.length, 1);
  assert.equal(result.page.enabled, null); assert.equal(result.page.saved, null);
});
test("waiting stops on a different selected path, ambiguous preview or replaced administration frame", async () => {
  for (const [change, reason] of [
    [f => { f.iframe.attrs.src = "/andere-seite"; }, "preview-target-mismatch"],
    [f => { f.topDom.body.append(f.topDom.element("iframe", { id: "sqs-site-frame", src: PAGE })); }, "preview-frame-ambiguous"],
    [f => { f.contents.mainFrame = { ...f.top }; }, "preview-observation-changed"],
  ]) {
    const f = fixture(); f.frame.url = "about:blank";
    f.hooks.top = () => { if (f.reads.length === 2) change(f); };
    const result = await readSquarespacePageObservation(f.contents, { expectedPageId: PAGE_ID, expectedPath: new URL(PAGE).pathname, waitForContentMs: 2000 });
    assert.equal(result.status, "unknown"); assert.deepEqual(result.reasonCodes, [reason]);
    assert.deepEqual(f.reads.map(value => value[1]), ["top", "top"]);
  }
});
test("unready content remains unconfirmed at the deadline and cancellation prevents a later DOM read", async () => {
  const f = fixture(), controller = new AbortController(); f.frame.url = "about:blank";
  const binding = { expectedPageId: PAGE_ID, expectedPath: new URL(PAGE).pathname };
  const expired = await readSquarespacePageObservation(f.contents, { ...binding, waitForContentMs: 60 });
  assert.equal(expired.status, "unknown"); assert.ok(expired.reasonCodes.includes("preview-content-wait-expired"));
  assert.deepEqual(expired.textBlocks, []);
  const nextRead = deferred(); f.hooks.top = () => { nextRead.resolve(); };
  const attempt = readSquarespacePageObservation(f.contents, { ...binding, waitForContentMs: 2000, signal: controller.signal });
  await nextRead.promise;
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await assert.rejects(attempt, { code: "SQUARESPACE_OBSERVATION_ABORTED" });
  assert.deepEqual(f.reads.map(value => value[1]), ["top", "top"]);
});
test("a timed-out DOM call blocks another observation on the same browser until it actually settles", async () => {
  const f = fixture(), gate = deferred(); f.hooks.top = () => gate.promise;
  assert.equal((await readSquarespacePageObservation(f.contents, { timeoutMs: 5 })).pendingDomRead, true);
  const blocked = await readSquarespacePageObservation(f.contents);
  assert.equal(blocked.pendingDomRead, true); assert.deepEqual(blocked.reasonCodes, ["preview-observation-reader-busy"]);
  assert.equal(f.reads.length, 1);
  gate.resolve(); await new Promise(resolve => setImmediate(resolve));
  f.hooks.top = null;
  assert.equal((await readSquarespacePageObservation(f.contents)).status, "partial");
});
test("an aborted in-flight DOM call releases its browser only after the actual call settles", async () => {
  const f = fixture(), gate = deferred(), started = deferred(), controller = new AbortController();
  f.hooks.top = () => { started.resolve(); return gate.promise; };
  const attempt = readSquarespacePageObservation(f.contents, { signal: controller.signal });
  await started.promise;
  controller.abort();
  await assert.rejects(attempt, { code: "SQUARESPACE_OBSERVATION_ABORTED" });
  assert.deepEqual((await readSquarespacePageObservation(f.contents)).reasonCodes, ["preview-observation-reader-busy"]);
  assert.equal(f.reads.length, 1);
  gate.resolve(); await new Promise(resolve => setImmediate(resolve));
  f.hooks.top = null;
  assert.equal((await readSquarespacePageObservation(f.contents)).status, "partial");
});
test("abort and renderer-style plans/options stop rather than becoming actual observations", async () => {
  const f = fixture(), abort = new AbortController(); abort.abort();
  await assert.rejects(readSquarespacePageObservation(f.contents, { signal: abort.signal }), { code: "SQUARESPACE_OBSERVATION_ABORTED" });
  await assert.rejects(readSquarespacePageObservation(f.contents, { expectedPageId: PAGE_ID, plan: { title: "Erfundener Titel" } }), { code: "SQUARESPACE_OBSERVATION_INPUT" });
  await assert.rejects(readSquarespacePageObservation(f.contents, { expectedPageId: PAGE_ID, waitForContentMs: 1000 }), { code: "SQUARESPACE_OBSERVATION_INPUT" });
  await assert.rejects(readSquarespacePageObservation(f.contents, { expectedPageId: PAGE_ID, expectedPath: "//andere-seite", waitForContentMs: 1000 }), { code: "SQUARESPACE_OBSERVATION_INPUT" });
  let getter = false;
  await assert.rejects(readSquarespacePageObservation(f.contents, { get expectedPageId() { getter = true; return PAGE_ID; } }), { code: "SQUARESPACE_OBSERVATION_INPUT" });
  assert.equal(getter, false); assert.equal(f.reads.length, 0);
});
test("the standalone DOM operation reads no settings, hidden app state, code values or save actions", () => {
  const f = fixture(), raw = f.frameDom.execute(`(${squarespacePageObservationDom.toString()})(${JSON.stringify({ scope: "frame", expectedPageId: PAGE_ID })})`);
  assert.equal(raw.status, "partial"); assert.equal(f.frameDom.calls + f.topDom.calls, 0);
});
