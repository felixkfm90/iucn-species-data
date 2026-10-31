import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { assessSquarespaceGalleryField, createSquarespaceGalleryDriver, squarespacePageNames } from "./squarespace-gallery-driver.mjs";

const sourceUrl = "https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/9622dd4a-4c08-4910-b3ed-32487f5454cb/IMGP2101.JPG";
const pageUrl = "https://www.fnwildlifetravel.de/reisen/2019-griechenland/athen";
const image = { imageKey: "parthenon", sourceUrl, context: "content", kind: "image", textCoupled: true,
  expectedCaption: "Das Parthenon auf der Akropolis", text: "Der Parthenon auf der Akropolis über den Hängen Athens",
  approvalRevision: "approved" };
const observed = { sourceUrl: `${sourceUrl}?format=750w`, description: image.expectedCaption, plainText: true };
const galleryRegionId = "0fd9aa7d7699c708014b3e64";
const domSource = await readFile(new URL("./squarespace-gallery-driver.mjs", import.meta.url), "utf8");
const domBody = domSource.slice(domSource.indexOf("function editorDomOperation("),
  domSource.indexOf("\nexport function createSquarespaceGalleryDriver"));

test("beobachtete CMS-Namen Home und 2019 - Griechenland ergänzen die genaue URL-gebundene Seitenauswahl", () => {
  assert.deepEqual(squarespacePageNames({ pageUrl: "https://www.fnwildlifetravel.de/", pageTitle: "FN Wildlife & Travel" }),
    ["FN Wildlife & Travel", "Home"]);
  assert.deepEqual(squarespacePageNames({ pageUrl: "https://www.fnwildlifetravel.de/reisen/2019-griechenland",
    pageTitle: "Griechenland 2019 | Reisebericht & Fotos — FN Wildlife & Travel" }),
  ["Griechenland 2019", "2019-griechenland", "2019 - Griechenland"]);
  assert.deepEqual(squarespacePageNames({ pageUrl, pageTitle: "Athen | Griechenland 2019 — FN Wildlife & Travel" }), ["Athen", "athen"]);
  assert.throws(() => squarespacePageNames({ pageUrl: "https://evil.test/", pageTitle: "Home" }));
  const dom = cmsDomFixture(), row = label => dom.element("div", { attrs: { role: "button" },
    rect: dom.box(40, label.endsWith("Reisen") ? 300 : 200, 220, 40) }, [dom.element("p", { text: label,
    rect: dom.box(40, label.endsWith("Reisen") ? 300 : 200, 220, 40) })]);
  dom.document.append(row("2019 - Griechenland"), row("2019 - Griechenland - Reisen"));
  assert.equal(dom.operation({ operation: "select-page", names: squarespacePageNames({
    pageUrl: "https://www.fnwildlifetravel.de/reisen/2019-griechenland", pageTitle: "Griechenland 2019 | Reisebericht" }) }).name, "2019 - Griechenland");
});

function cmsDomFixture({ innerWidth, innerHeight } = {}) {
  const calls = [];
  let document;
  const matches = (node, selector) => selector.split(",").some((part) => {
    const simple = part.trim();
    const tag = simple.match(/^[a-z][\w-]*/i)?.[0];
    const id = simple.match(/#([\w-]+)/)?.[1];
    if (tag && tag.toLowerCase() !== node.tagName.toLowerCase() || id && node.getAttribute("id") !== id) return false;
    for (const attr of simple.matchAll(/\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/g)) {
      const value = node.getAttribute(attr[1]);
      if (value === null || attr[2] !== undefined && value !== attr[2]
          || attr[3] !== undefined && value !== attr[3] || attr[4] !== undefined && value !== attr[4]) return false;
    }
    return true;
  });
  const box = (left = 0, top = 0, width = 288, height = 432) => ({ left, top, width, height,
    right: left + width, bottom: top + height, x: left, y: top });
  function element(tag, { attrs = {}, css = {}, rect = box(), text = "", value = "" } = {}, children = []) {
    const node = {
      tagName: tag.toUpperCase(), attrs, css: { visibility: "visible", display: "block", transform: "none", ...css },
      rect, innerText: text, textContent: text, value, children: [], parentElement: null,
      getAttribute: (name) => Object.hasOwn(attrs, name) ? attrs[name] : null,
      getClientRects: () => node.css.display === "none" ? [] : [node.rect],
      getBoundingClientRect: () => node.rect,
      matches: (selector) => matches(node, selector),
      contains: (target) => node === target || node.children.some((child) => child.contains(target)),
      querySelectorAll(selector) {
        return node.children.flatMap((child) => [...(matches(child, selector) ? [child] : []), ...child.querySelectorAll(selector)]);
      },
      querySelector(selector) { return node.querySelectorAll(selector)[0] || null; },
      closest(selector) { for (let current = node; current; current = current.parentElement) if (matches(current, selector)) return current; return null; },
      click: () => calls.push(["click", node]),
      dispatchEvent: (event) => calls.push([event.type, node]),
      scrollIntoView: () => calls.push(["scroll", node]),
      focus: () => { document.activeElement = node; calls.push(["focus", node]); },
      blur: () => calls.push(["blur", node]),
    };
    if (tag === "img") node.src = node.currentSrc = attrs.src || "";
    if (tag === "textarea") {
      node.selectionStart = node.selectionEnd = value.length;
      node.select = () => { node.selectionStart = 0; node.selectionEnd = node.value.length; };
    }
    if (tag === "label") node.htmlFor = attrs.for || "";
    node.append = (...added) => { for (const child of added) { child.parentElement = node; node.children.push(child); } };
    node.append(...children);
    return node;
  }
  document = element("body", { rect: box(0, 0, 1400, 1000) });
  document.documentElement = { clientWidth: 1400, clientHeight: 1000 };
  document.baseURI = "https://vanilla-gerbil-jwnp.squarespace.com/config/pages";
  document.title = "FN Websiteverwaltung";
  document.getElementById = (id) => document.querySelectorAll("*").find((node) => node.getAttribute("id") === id) || null;
  document.elementFromPoint = (x, y) => document.querySelectorAll("*").filter((node) => {
    const rect = node.rect;
    return node.css.display !== "none" && rect.width > 0 && rect.height > 0
      && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }).at(-1) || null;
  const operation = vm.runInNewContext(`(${domBody})`, { document, URL, innerWidth, innerHeight,
    getComputedStyle: (node) => node.css, MouseEvent: class { constructor(type) { this.type = type; } } });
  return { document, element, box, calls, operation };
}

test("gleichnamige Reiseseiten werden nur innerhalb des eindeutig passenden Reiseordners gewählt", () => {
  const dom=cmsDomFixture(),targetUrl='https://www.fnwildlifetravel.de/reisen/2019-griechenland/sonstige';
  const makeFolder=(title,y)=>{
    const expand=dom.element('button',{attrs:{'aria-label':`Unterseiten erweitern ${title}`},rect:dom.box(10,y,25,35)});
    const label=dom.element('p',{text:'Sonstige Bilder',rect:dom.box(60,y+45,190,35)});
    const row=dom.element('div',{attrs:{role:'button','aria-roledescription':'sortable'},rect:dom.box(40,y+40,240,45)},[label]);
    const folder=dom.element('div',{attrs:{role:'button','aria-roledescription':'sortable'},rect:dom.box(0,y,320,100)},[expand,row]);
    dom.document.append(folder);return {folder,row,label};
  };
  const greek=makeFolder('2019 - Griechenland - Reisen',100);makeFolder('2020 - Kreta - Reisen',300);
  const payload={operation:'select-page',names:['Weitere Eindrücke','sonstige'],pageUrl:targetUrl};
  const selected=dom.operation(payload);assert.equal(selected?.label,'Sonstige Bilder');
  assert.equal(dom.document.elementFromPoint(selected.point.x,selected.point.y),greek.label);
  assert.equal(dom.operation({...payload,pageUrl:'https://evil.test/reisen/2019-griechenland/sonstige'}),null);
  assert.equal(dom.operation({...payload,pageUrl:targetUrl.replace('2019-griechenland','2021-island')}),null);
  greek.folder.append(dom.element('div',{attrs:{role:'button'},rect:dom.box(40,220,240,40)},[
    dom.element('p',{text:'Sonstige Bilder',rect:dom.box(60,220,190,35)})]));
  assert.equal(dom.operation(payload),null,'Zwei gleiche Seiten im selben Ordner bleiben gesperrt');
});

test("Reiseübersichten mit abweichendem Titel werden vom gleichnamigen Reiseordner unterschieden", () => {
  for (const [slug, title, cmsName] of [
    ["2021-neapel", "Neapel & Amalfiküste 2021 | Reisebericht & Fotos", "2021 - Neapel und Amalfitana"],
    ["2025-nordthailandlaos", "Nordthailand & Laos 2025 | Reisebericht & Fotos", "2025 - Nordthailand und Laos"],
  ]) {
    const dom = cmsDomFixture(), pageUrl = `https://www.fnwildlifetravel.de/reisen/${slug}`;
    const row = (label, y) => dom.element("div", { attrs: { role: "button", "aria-roledescription": "sortable" },
      rect: dom.box(40, y, 300, 40) }, [dom.element("p", { text: label, rect: dom.box(60, y, 260, 35) })]);
    const overview = row(cmsName, 180), other = row(`${cmsName} - Reisen`, 300);
    const expand = dom.element("button", { attrs: { "aria-label": "Unterseiten erweitern Reisen" }, rect: dom.box(10, 100, 25, 35) });
    const folder = dom.element("div", { attrs: { role: "button", "aria-roledescription": "sortable" },
      rect: dom.box(0, 100, 350, 150) }, [expand, overview]);
    dom.document.append(folder, other);
    const payload = { operation: "select-page", pageUrl, names: squarespacePageNames({ pageUrl, pageTitle: title }) };
    assert.equal(dom.operation(payload)?.label, cmsName);
    assert.equal(dom.operation({ ...payload, pageUrl: "https://foreign.invalid/reisen/2021-neapel" }), null);
    expand.attrs["aria-label"] = "Unterseiten erweitern Andere Reisen";
    assert.equal(dom.operation(payload), null, "Ein beliebiger Ordner mit Reisen im Namen reicht nicht");
    expand.attrs["aria-label"] = "Unterseiten erweitern Reisen";
    folder.append(row(cmsName, 220));
    assert.equal(dom.operation(payload), null, "Mehrdeutige Unterseiten im Reisen-Ordner bleiben gesperrt");
  }
});

test("die Seitenauswahl erhält den freigegebenen Pfad für die Reiseordnerzuordnung", async () => {
  const fixture=browserFixture({previewUrl:'https://vanilla-gerbil-jwnp.squarespace.com/',selectNavigates:false});
  const target='https://www.fnwildlifetravel.de/reisen/2019-griechenland/sonstige';
  const top=fixture.webContents.mainFrame,execute=top.executeJavaScript,send=fixture.webContents.sendInputEvent;
  top.executeJavaScript=async code=>{
    const payload=JSON.parse(code.slice(code.lastIndexOf(')(')+2,-1));
    if(payload.operation==='select-page' && payload.pageUrl!==target)return null;
    return execute(code);
  };
  fixture.webContents.sendInputEvent=event=>{
    send(event);if(event.type==='mouseUp' && event.x===160 && event.y===220)top.framesInSubtree[1].url=target;
  };
  const result=await createSquarespaceGalleryDriver({waitMs:1,timeoutMs:100}).transfer(fixture.webContents,
    {pageUrl:target,pageTitle:'Weitere Eindrücke | Griechenland 2019',images:[image]},{assertCurrent:async()=>{}});
  assert.equal(result.results[0].status,'written');
});

test("Galeriebeschriftung wird vor der Eingabe vollständig und quellgebunden markiert", () => {
  const dom = galleryModalFixture();
  const before = dom.field.value;
  assert.equal(dom.operation({ operation: "focus-description", sourceUrl }), true);
  assert.equal(dom.field.selectionStart, 0);
  assert.equal(dom.field.selectionEnd, before.length);
  assert.equal(dom.field.value, before, "Markieren verändert keine Beschriftung");
  dom.field.select = () => { dom.field.selectionStart = 1; };
  assert.equal(dom.operation({ operation: "focus-description", sourceUrl }), false, "Eine unvollständige Auswahl autorisiert keine Eingabe");
  assert.equal(dom.operation({ operation: "focus-description", sourceUrl: sourceUrl.replace("IMGP2101", "IMGP9999") }), null);
});

function hoverMappingFixture() {
  const dom = cmsDomFixture(), iframe = dom.element("iframe", { attrs: { id: "sqs-site-frame", src: pageUrl }, rect: dom.box(200, 80, 1000, 700) });
  Object.assign(iframe, { clientWidth: 1000, clientHeight: 700, offsetWidth: 1000, offsetHeight: 700, clientLeft: 0, clientTop: 0 });
  dom.document.append(iframe);
  return { dom, iframe, payload: { operation: "map-gallery-hover", pageUrl, framePoint: { x: 500, y: 300 }, frameViewport: { width: 1000, height: 700 } } };
}

function galleryModalFixture({ active = 0, paneCount = 6, clip = true, marker = true } = {}) {
  const fixture = cmsDomFixture();
  const { element, box, document } = fixture;
  const field = element("textarea", { attrs: { "aria-label": "Beschreibung" }, value: image.expectedCaption,
    rect: box(1050, 650, 288, 90) });
  const shadow = element("textarea", { attrs: { "aria-label": "Beschreibung", "data-test": "rosetta-textarea-shadow-element" },
    css: { visibility: "hidden" }, rect: box(1050, 650, 288, 90) });
  const sources = Array.from({ length: paneCount }, (_value, index) => index ? sourceUrl.replace("IMGP2101", `IMGP${2200 + index}`) : sourceUrl);
  const panes = sources.map((src, index) => {
    const offset = (index - active) * 288;
    return element("div", { attrs: { "data-is-image": "true" }, css: { left: `${offset}px`, transform: "none" },
      rect: box(1050 + offset, 180) }, [element("img", { attrs: { src, alt: `Bild-${index}.JPG` }, rect: box(1050 + offset, 180) })]);
  });
  const viewport = element("div", { css: { overflowX: clip ? "hidden" : "visible", overflowY: clip ? "hidden" : "visible" },
    rect: box(1050, 180) }, panes);
  const thumbnails = sources.map((src, index) => element("div", { attrs: {
    "data-cypress": "draggable-item", "data-itemid": `image-${index}`, role: "button" }, rect: box(150, 150 + index * 90, 100, 80) },
  [element("img", { attrs: { src }, rect: box(150, 150 + index * 90, 100, 80) })]));
  // The observed marker may identify only the upload host, not the field's ancestor.
  const manager = element("div", { attrs: marker ? { "data-test": "gallery-manager-modal" } : {},
    rect: box(150, 100, 100, 50) });
  const dialog = element("div", { attrs: { role: "dialog" }, rect: box(100, 100, 1280, 800) },
    [manager, ...thumbnails, viewport, field, shadow]);
  document.append(dialog);
  return { ...fixture, field, shadow, panes, viewport, dialog, thumbnails, sources };
}

function browserFixture({ description = image.expectedCaption, preview = true, plainText = true,
  previewUrl = pageUrl, editing = false, replaceOnEdit = false, selectNavigates = true, saved = true, exitWorks = true } = {}) {
  const operations = [], inputs = [], clicks = [], loads = [];
  let value = description, editingNow = editing, child;
  const enterEditing = () => {
    editingNow = true;
    if (replaceOnEdit) {
      const old = child;
      child = { ...old, executeJavaScript };
      old.executeJavaScript = async () => { throw new Error("Alter Vorschauframe ist verworfen"); };
      main.framesInSubtree = [main, child];
    }
  };
  const executeJavaScript = async (code) => {
    const payload = JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1));
    operations.push(payload.operation);
    if (payload.operation === "session") return { adminNavigation: true };
    if (payload.operation === "preview-state") return { iframeCount: preview ? 1 : 0,
      iframeSrc: child?.url || "", mode: editingNow ? "editing" : "preview", saveDisabled: saved, dialogOpen: false };
    if (payload.operation === "select-page") return { name: payload.names[0], point: { x: 160, y: 220 } };
    if (payload.operation === "edit-page") return { point: { x: 100, y: 40 } };
    if (payload.operation === "exit-page") return editingNow && saved ? { point: { x: 220, y: 40 } } : null;
    if (payload.operation === "gallery-hover") return { point: { x: 400, y: 300 }, viewport: { width: 1000, height: 700 } };
    if (payload.operation === "map-gallery-hover") return payload.framePoint && payload.frameViewport ? { point: { x: 500, y: 350 } } : null;
    if (payload.operation === "gallery-control") return payload.hovered === true ? { point: { x: 290, y: 120 } } : null;
    if (payload.operation === "select-image") return { point: { x: 200, y: 190 } };
    if (payload.operation === "close-gallery") return { point: { x: 150, y: 100 } };
    if (payload.operation === "gallery-closed") return true;
    if (payload.operation === "button" && payload.names.includes("Bearbeiten")) enterEditing();
    if (["button", "gallery", "focus-description", "blur-description"].includes(payload.operation)) return true;
    if (payload.operation === "description") return { ...observed, description: value, plainText };
    return false;
  };
  const main = { url: "https://vanilla-gerbil-jwnp.squarespace.com/config/pages", executeJavaScript };
  child = { url: previewUrl, executeJavaScript, parent: main };
  main.framesInSubtree = preview ? [main, child] : [main];
  return { operations, inputs, clicks, loads, webContents: { mainFrame: main, isDestroyed: () => false,
    getURL: () => main.url, loadURL: async (url) => { loads.push(url); main.url = url; },
    sendInputEvent: (event) => {
      if (event.type.startsWith("mouse")) {
        clicks.push(event);
        if (event.type === "mouseUp" && event.x === 160 && event.y === 220 && selectNavigates) child.url = pageUrl;
        if (event.type === "mouseUp" && event.x === 100 && event.y === 40) enterEditing();
        if (event.type === "mouseUp" && event.x === 220 && event.y === 40 && exitWorks) editingNow = false;
      } else inputs.push(event);
    }, insertText: async (text) => { inputs.push(text); value = text; } } };
}

test("FN-Vorschauvarianten bleiben seitenidentisch, ohne fremde Ziele oder den Topframe zu akzeptieren", async () => {
  for (const previewUrl of [pageUrl, pageUrl.replace("www.fnwildlifetravel.de", "fnwildlifetravel.de"),
    pageUrl.replace("https://www.fnwildlifetravel.de", "https://vanilla-gerbil-jwnp.squarespace.com"), `${pageUrl}/`]) {
    const fixture = browserFixture({ previewUrl });
    const result = await createSquarespaceGalleryDriver({ timeoutMs: 5, waitMs: 1 }).transfer(fixture.webContents,
      { pageUrl, pageTitle: "Athen | Griechenland", images: [image] }, { assertCurrent: async () => {} });
    assert.equal(result.results[0].status, "written", previewUrl);
  }
  for (const previewUrl of [pageUrl.replace("www.fnwildlifetravel.de", "evil.test"), pageUrl.replace("/athen", "/delphi"),
    pageUrl.replace("https:", "http:"), "about:blank", ""]) {
    const fixture = browserFixture({ previewUrl, selectNavigates: false });
    const result = await createSquarespaceGalleryDriver({ timeoutMs: 2, waitMs: 1 }).transfer(fixture.webContents,
      { pageUrl, images: [image] }, { assertCurrent: async () => {} });
    assert.equal(result.results[0].status, "failed", previewUrl);
    assert.deepEqual(fixture.inputs, []);
  }
  for (const duplicate of [false, true]) {
    const fixture = browserFixture();
    if (duplicate) fixture.webContents.mainFrame.framesInSubtree.push({ ...fixture.webContents.mainFrame.framesInSubtree[1] });
    else {
      fixture.webContents.mainFrame.url = pageUrl;
      fixture.webContents.getURL = () => "https://vanilla-gerbil-jwnp.squarespace.com/config/pages";
      fixture.webContents.mainFrame.framesInSubtree = [fixture.webContents.mainFrame];
    }
    const result = await createSquarespaceGalleryDriver({ timeoutMs: 2, waitMs: 1 }).transfer(fixture.webContents,
      { pageUrl, images: [image] }, { assertCurrent: async () => {} });
    assert.equal(result.results[0].status, "failed", duplicate ? "Mehrdeutigkeit" : "Topframe");
    assert.deepEqual(fixture.inputs, []);
  }
});

test("Passende offene Vorschau wird ohne Neunavigation verwendet und bestehende Bearbeitung nicht erneut geöffnet", async () => {
  for (const editing of [false, true]) {
    const fixture = browserFixture({ editing });
    const result = await createSquarespaceGalleryDriver().transfer(fixture.webContents,
      { pageUrl, images: [image] }, { assertCurrent: async () => {} });
    assert.equal(result.results[0].status, "written");
    assert.deepEqual(fixture.loads, []);
    assert.equal(fixture.operations.includes("select-page"), false);
    assert.equal(fixture.clicks.some((event) => event.x === 100 && event.y === 40), !editing);
  }
});

test("Die Dashboard-Startseitenvorschau ersetzt nicht die gebundene Seitenverwaltung", async () => {
  const root = "https://www.fnwildlifetravel.de/";
  const fixture = browserFixture({ previewUrl: root, selectNavigates: false });
  const top = fixture.webContents.mainFrame, execute = top.executeJavaScript;
  top.url = "https://vanilla-gerbil-jwnp.squarespace.com/config";
  top.executeJavaScript = async (code) => {
    const payload = JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1));
    if (payload.operation === "preview-state" && top.url.endsWith("/config")) {
      return { iframeCount: 0, mode: "unknown", dialogOpen: false };
    }
    return execute(code);
  };
  const result = await createSquarespaceGalleryDriver({ timeoutMs: 100, waitMs: 1 }).transfer(fixture.webContents,
    { pageUrl: root, pageTitle: "FN Wildlife & Travel", images: [image] }, { assertCurrent: async () => {} });
  assert.equal(result.results[0].status, "written");
  assert.deepEqual(fixture.loads, ["https://vanilla-gerbil-jwnp.squarespace.com/config/pages"]);
});

test("Der öffentlich belegte FN-Startseitenalias home bleibt auf diese eine Seite begrenzt", async () => {
  const root = "https://www.fnwildlifetravel.de/";
  for (const previewUrl of ["https://vanilla-gerbil-jwnp.squarespace.com/home", "https://www.fnwildlifetravel.de/home/"]) {
    const fixture = browserFixture({ previewUrl, selectNavigates: false });
    const result = await createSquarespaceGalleryDriver({ timeoutMs: 50, waitMs: 1 }).transfer(fixture.webContents,
      { pageUrl: root, pageTitle: "FN Wildlife & Travel", images: [image] }, { assertCurrent: async () => {} });
    assert.equal(result.results[0].status, "written", previewUrl);
    assert.equal(fixture.operations.includes("select-page"), false);
  }
  for (const previewUrl of ["https://evil.test/home", "https://vanilla-gerbil-jwnp.squarespace.com/home-other",
    "https://vanilla-gerbil-jwnp.squarespace.com/reisen/home"]) {
    const fixture = browserFixture({ previewUrl, selectNavigates: false });
    const result = await createSquarespaceGalleryDriver({ timeoutMs: 5, waitMs: 1 }).transfer(fixture.webContents,
      { pageUrl: root, pageTitle: "FN Wildlife & Travel", images: [image] }, { assertCurrent: async () => {} });
    assert.equal(result.results[0].status, "failed", previewUrl);
    assert.deepEqual(fixture.inputs, []);
  }
  const { dom, iframe, payload } = hoverMappingFixture();
  iframe.attrs.src = "https://vanilla-gerbil-jwnp.squarespace.com/home";
  assert.ok(dom.operation({ ...payload, pageUrl: root }).point);
  iframe.attrs.src = "https://evil.test/home";
  assert.equal(dom.operation({ ...payload, pageUrl: root }).blocked, "frame-url");
});

test("Der reguläre Seitenabschluss wartet auf einen nach Save erneuerten identischen Vorschauframe", async () => {
  const fixture = browserFixture({ editing: true }), top = fixture.webContents.mainFrame, execute = top.executeJavaScript;
  let replaced = false;
  top.executeJavaScript = async (code) => {
    const payload = JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1));
    if (payload.operation === "exit-page" && !replaced) {
      replaced = true;
      top.framesInSubtree = [top, { ...top.framesInSubtree[1] }];
    }
    return execute(code);
  };
  const result = await createSquarespaceGalleryDriver({ timeoutMs: 100, waitMs: 1 }).transfer(fixture.webContents,
    { pageUrl, images: [image] }, { assertCurrent: async () => {} });
  assert.equal(result.results[0].status, "written");
  assert.equal(replaced, true);
  assert.equal(fixture.clicks.filter(event => event.type === "mouseUp" && event.x === 220 && event.y === 40).length, 1);
});

test("Seitenzuordnung verlangt einen echten Klick und anschließend die geladene Zielvorschau", async () => {
  for (const selectNavigates of [false, true]) {
    const fixture = browserFixture({ previewUrl: "https://vanilla-gerbil-jwnp.squarespace.com/#", selectNavigates });
    const result = await createSquarespaceGalleryDriver({ timeoutMs: 5, waitMs: 1 }).transfer(fixture.webContents,
      { pageUrl, pageTitle: "Athen | Griechenland", images: [image] }, { assertCurrent: async () => {} });
    assert.equal(result.results[0].status, selectNavigates ? "written" : "failed");
    assert.ok(fixture.clicks.some((event) => event.type === "mouseUp" && event.x === 160 && event.y === 220));
    if (!selectNavigates) assert.deepEqual(fixture.inputs, []);
  }
});

test("Nach Bearbeiten wird der ersetzte Inhaltsframe neu gebunden", async () => {
  const fixture = browserFixture({ replaceOnEdit: true });
  const result = await createSquarespaceGalleryDriver().transfer(fixture.webContents,
    { pageUrl, images: [image] }, { assertCurrent: async () => {} });
  assert.equal(result.results[0].status, "written");
  assert.equal(fixture.inputs.find((entry) => typeof entry === "string"), image.text);
});

test("Vorschaudiagnose begrenzt Adressen auf Ursprung und Pfad ohne Queries, Hashes oder Zugangsdaten", async () => {
  const fixture = browserFixture({ previewUrl: `${pageUrl}?loginToken=do-not-show#secret-hash` });
  const diagnostic = await createSquarespaceGalleryDriver().inspectPreview(fixture.webContents, pageUrl);
  assert.equal(diagnostic.frames.length, 1);
  assert.equal(diagnostic.frames[0].origin, "https://www.fnwildlifetravel.de");
  assert.equal(diagnostic.frames[0].pathname, "/reisen/2019-griechenland/athen");
  assert.doesNotMatch(JSON.stringify(diagnostic), /do-not-show|secret-hash|loginToken/);
  fixture.webContents.mainFrame.framesInSubtree[1].url = "https://user:password@evil.test/private-token?secret=1";
  const foreign = await createSquarespaceGalleryDriver().inspectPreview(fixture.webContents, pageUrl);
  assert.equal(foreign.frames[0].status, "foreign");
  assert.doesNotMatch(JSON.stringify(foreign), /password|private-token|secret/);
});

test("Seitentitel liefern nur frische unverdeckte Textkoordinaten, niemals den Drag- oder Einstellungscontainer", () => {
  const dom = cmsDomFixture(), label = dom.element("p", { text: "Athen", rect: dom.box(30, 210, 140, 24) });
  const row = dom.element("div", { attrs: { role: "button" }, rect: dom.box(10, 180, 300, 70) }, [label]);
  dom.document.append(row);
  const result = dom.operation({ operation: "select-page", names: ["Athen"] });
  assert.equal(result.name, "Athen");
  assert.equal(result.point.x, 100);
  assert.equal(result.point.y, 222);
  assert.equal(dom.calls.some(([kind]) => kind === "click"), false);
  const cover = dom.element("button", { text: "Löschen", rect: dom.box(30, 210, 140, 24) });
  dom.document.append(cover);
  assert.equal(dom.operation({ operation: "select-page", names: ["Athen"] }), null);
  dom.document.children.pop();
  for (const change of [() => { label.css.display = "none"; }, () => { label.rect = dom.box(30, 210, 0, 24); },
    () => { label.rect = dom.box(-20, 210, 140, 24); }]) {
    label.css.display = "block"; label.rect = dom.box(30, 210, 140, 24); change();
    assert.equal(dom.operation({ operation: "select-page", names: ["Athen"] }), null);
  }
  label.rect = dom.box(30, 1210, 140, 24);
  label.scrollIntoView = () => { label.rect = dom.box(30, 210, 140, 24); };
  assert.equal(dom.operation({ operation: "select-page", names: ["Athen"] }).point.y, 222);
  row.append(dom.element("p", { text: "Athen", rect: dom.box(30, 240, 140, 24) }));
  assert.equal(dom.operation({ operation: "select-page", names: ["Athen"] }), null);
});

test("Geschlossene Seitenordner liefern nur den gemessenen beschrifteten Aufklappknopf", () => {
  const dom = cmsDomFixture();
  const button = dom.element("button", { attrs: { "aria-expanded": "false", "aria-label": "Unterseiten erweitern" },
    rect: dom.box(10, 120, 24, 24) });
  dom.document.append(button);
  const result = dom.operation({ operation: "expand-folder" });
  assert.equal(result.point.x, 22);
  assert.equal(result.point.y, 132);
  assert.equal(dom.calls.some(([kind]) => kind === "click"), false);
  button.attrs["aria-label"] = "Seite löschen";
  assert.equal(dom.operation({ operation: "expand-folder" }), null);
});

test("abweichender CMS-Name Palast von Knossos ist als eindeutiger ganzer Titelbestandteil auswählbar", () => {
  const dom = cmsDomFixture(), label = dom.element("p", { text: "Palast von Knossos", rect: dom.box(30, 210, 190, 24) });
  const row = dom.element("div", { attrs: { role: "button" }, rect: dom.box(10, 180, 300, 70) }, [label]); dom.document.append(row);
  const result = dom.operation({ operation: "select-page", names: ["Knossos", "knossos"] });
  assert.equal(result?.name, "Knossos"); assert.equal(result?.label, "Palast von Knossos");
  assert.equal(result?.point.x, 125);
  assert.equal(dom.calls.some(([kind]) => kind === "click"), false, "Nur gemessener Titelklick, kein synthetisches Öffnen oder CMSschreiben");
});

test("CMS-Titelfallback bleibt wortgebunden, mehrdeutigkeitsfrei und einem exakten Titel nachgeordnet", () => {
  const dom = cmsDomFixture();
  const add = (text, y) => {
    const label = dom.element("p", { text, rect: dom.box(30, y, 200, 24) });
    const row = dom.element("div", { attrs: { role: "button" }, rect: dom.box(10, y - 10, 300, 40) }, [label]); dom.document.append(row); return label;
  };
  add("Palast von Knossos", 210); add("Museum von Knossos", 260);
  assert.equal(dom.operation({ operation: "select-page", names: ["Knossos"] }), null, "Zwei Worttreffer autorisieren keine Auswahl");
  add("Knossos", 310);
  assert.equal(dom.operation({ operation: "select-page", names: ["Knossos"] })?.point.y, 322, "Exakter Titel hat Vorrang");
  assert.equal(dom.operation({ operation: "select-page", names: ["nos", "2020"] }), null);
  assert.equal(dom.operation({ operation: "select-page", names: ["Knoss"] }), null, "Kein beliebiger Teilworttreffer");
  assert.equal(dom.operation({ operation: "select-page", names: ["Knossos Museum"] })?.label, "Museum von Knossos");
  const cover = dom.element("button", { text: "Seite löschen", rect: dom.box(30, 250, 200, 60) }); dom.document.append(cover);
  assert.equal(dom.operation({ operation: "select-page", names: ["Knossos Museum"] }), null, "Verdeckter Titel bleibt gesperrt");
});

test("Bearbeitungszustand verlangt genau eine sichtbare Vorschau und eine eindeutige CMS-Werkzeugleiste", () => {
  const dom = cmsDomFixture(), edit = dom.element("button", { text: "Bearbeiten" });
  const toolbar = dom.element("nav", { attrs: { "aria-label": "Website-Vorschau und Bearbeitungstools" } }, [edit]);
  const iframe = dom.element("iframe", { attrs: { id: "sqs-site-frame", src: pageUrl } });
  dom.document.append(toolbar, iframe);
  assert.equal(dom.operation({ operation: "preview-state" }).mode, "preview");
  toolbar.children.length = 0;
  dom.document.append(dom.element("button", { text: "Speichern" }), dom.element("button", { text: "Verlassen" }));
  assert.equal(dom.operation({ operation: "preview-state" }).mode, "unknown");
  toolbar.append(dom.element("button", { text: "Speichern" }), dom.element("button", { text: "Verlassen" }));
  assert.equal(dom.operation({ operation: "preview-state" }).mode, "unknown", "Mehrdeutige nicht gebundene Speichern-Buttons reichen nicht");
  dom.document.children.splice(-2);
  assert.equal(dom.operation({ operation: "preview-state" }).mode, "editing");
  toolbar.append(dom.element("button", { text: "https://account.example/?token=do-not-show" }));
  toolbar.append(dom.element("button", { text: "Privater Accountname" }));
  const state = dom.operation({ operation: "preview-state" });
  assert.doesNotMatch(JSON.stringify(state.controls), /https:|do-not-show|Privater/);
  assert.ok(state.controls.includes("Speichern"));
  iframe.css.display = "none";
  assert.equal(dom.operation({ operation: "preview-state" }).mode, "unknown");
});

test("Unklare Toolbarbindung diagnostiziert nur begrenzte Regionen- und Buttonzähler ohne die Auswahl zu lockern", async () => {
  const dom = cmsDomFixture(), save = dom.element("button", { text: "Speichern" }); save.disabled = true;
  const inner = dom.element("div", { attrs: { role: "navigation", "aria-label": "Editor toolbar" } },
    [save, dom.element("button", { text: "Beenden" })]);
  const outer = dom.element("nav", { attrs: { "aria-label": "Website-Vorschau und Bearbeitungstools" } }, [inner]);
  dom.document.append(outer, dom.element("iframe", { attrs: { id: "sqs-site-frame", src: pageUrl } }),
    dom.element("textarea", { value: "Keine privaten Inhalte ausgeben" }));
  const state = dom.operation({ operation: "preview-state" });
  assert.equal(state.mode, "unknown");
  assert.deepEqual(JSON.parse(JSON.stringify(state.editor)), { rawToolbarRegions: 2, toolbarRegions: 2, nestedRegionPairs: 1,
    editButtons: 0, saveButtons: 1, exitButtons: 1, disabledSaveButtons: 1, boundEditButtons: 0,
    boundSaveButtons: 0, boundExitButtons: 0, dialogOpen: false, toolbarRectCounts: { withRects: 2, withoutRects: 0 }, toolbarDisplays: ["block"] });
  const fixture = browserFixture();
  fixture.webContents.mainFrame.executeJavaScript = async () => state;
  const diagnostic = await createSquarespaceGalleryDriver().inspectPreview(fixture.webContents, pageUrl);
  assert.deepEqual(diagnostic.editor, JSON.parse(JSON.stringify(state.editor)));
  assert.doesNotMatch(JSON.stringify(diagnostic), /Keine privaten|Editor toolbar|navigation|textarea/);
});

test("Toolbar ohne eigene Layoutrechtecke bleibt gesperrt und meldet nur display:contents und feste Rechteckzähler", () => {
  const dom = cmsDomFixture(), save = dom.element("button", { text: "Speichern" }); save.disabled = true;
  const toolbar = dom.element("nav", { attrs: { "aria-label": "Website-Vorschau und Bearbeitungstools" }, css: { display: "contents" } },
    [save, dom.element("button", { text: "Beenden" })]);
  toolbar.getClientRects = () => [];
  dom.document.append(toolbar, dom.element("iframe", { attrs: { id: "sqs-site-frame", src: pageUrl } }));
  const state = dom.operation({ operation: "preview-state" });
  assert.equal(state.mode, "unknown");
  assert.equal(state.editor.rawToolbarRegions, 1);
  assert.equal(state.editor.toolbarRegions, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(state.editor.toolbarRectCounts)), { withRects: 0, withoutRects: 1 });
  assert.deepEqual(Array.from(state.editor.toolbarDisplays), ["contents"]);
  assert.equal(dom.operation({ operation: "exit-page", pageUrl }), null);
});

test("Externe Editorzähldiagnose begrenzt fremde Werte und verwirft beliebige Zusatzfelder", async () => {
  const fixture = browserFixture(), execute = fixture.webContents.mainFrame.executeJavaScript;
  fixture.webContents.mainFrame.executeJavaScript = async (code) => {
    const state = await execute(code);
    if (code.includes('"operation":"preview-state"')) state.editor = { rawToolbarRegions: 25, toolbarRegions: 51, nestedRegionPairs: -2,
      editButtons: 0.5, saveButtons: 2, exitButtons: "secret", disabledSaveButtons: 1,
      boundEditButtons: 0, boundSaveButtons: 1, boundExitButtons: 1, dialogOpen: true,
      toolbarRectCounts: { withRects: 999, withoutRects: -2, account: "secret" }, toolbarDisplays: ["contents", "url(secret)"],
      account: "secret-account", html: "<textarea>secret</textarea>" };
    return state;
  };
  const diagnostic = await createSquarespaceGalleryDriver().inspectPreview(fixture.webContents, pageUrl);
  assert.deepEqual(diagnostic.editor, { rawToolbarRegions: 20, toolbarRegions: 20, nestedRegionPairs: 0, editButtons: 0, saveButtons: 2,
    exitButtons: 0, disabledSaveButtons: 1, boundEditButtons: 0, boundSaveButtons: 1, boundExitButtons: 1, dialogOpen: true,
    toolbarRectCounts: { withRects: 20, withoutRects: 0 }, toolbarDisplays: ["contents"] });
  assert.doesNotMatch(JSON.stringify(diagnostic), /secret|account|html|textarea/);
});

test("Andere aktive oder unklare Bearbeitung wird nicht durch Seitenauswahl verlassen", async () => {
  for (const unknown of [false, true]) {
    const fixture = browserFixture({ previewUrl: pageUrl.replace("/athen", "/delphi"), editing: true, saved: false });
    if (unknown) {
      const execute = fixture.webContents.mainFrame.executeJavaScript;
      fixture.webContents.mainFrame.executeJavaScript = async (code) => {
        const payload = JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1));
        return payload.operation === "preview-state" ? { iframeCount: 1, mode: "unknown" } : execute(code);
      };
    }
    const result = await createSquarespaceGalleryDriver({ timeoutMs: 3, waitMs: 1 }).transfer(fixture.webContents,
      { pageUrl, images: [image] }, { assertCurrent: async () => {} });
    assert.equal(result.results[0].status, "failed");
    assert.deepEqual(fixture.loads, []);
    assert.deepEqual(fixture.clicks, []);
    assert.deepEqual(fixture.inputs, []);
  }
});

test("Eine eindeutig gespeicherte andere FN-Bearbeitung wird nativ beendet, bevor die Zielseite gewählt wird", async () => {
  const fixture = browserFixture({ previewUrl: pageUrl.replace("/athen", "/delphi"), editing: true });
  const result = await createSquarespaceGalleryDriver({ timeoutMs: 5, waitMs: 1 }).transfer(fixture.webContents,
    { pageUrl, images: [image] }, { assertCurrent: async () => {} });
  assert.equal(result.results[0].status, "written");
  const clicked = fixture.clicks.filter((event) => event.type === "mouseUp").map(({ x, y }) => `${x},${y}`);
  assert.ok(clicked.indexOf("220,40") >= 0 && clicked.indexOf("220,40") < clicked.indexOf("160,220"));
  assert.equal(fixture.operations.filter((operation) => operation === "exit-page").length, 2);
  assert.equal(fixture.operations.includes("button"), false, "Kein synthetisches Speichern oder Verwerfen");
  assert.deepEqual(fixture.loads, []);
});

test("Gespeicherter Seitenwechsel stoppt vor jeder Eingabe bei fremdem, fehlendem oder mehrdeutigem Vorschauframe und ignoriertem Exit", async () => {
  for (const variant of ["foreign", "missing", "duplicate", "wrong-parent", "mismatched-dom", "ignored-exit", "dialog", "enabled-save", "missing-save", "unknown"]) {
    const fixture = browserFixture({ previewUrl: pageUrl.replace("/athen", "/delphi"), editing: true, exitWorks: variant !== "ignored-exit" });
    const main = fixture.webContents.mainFrame, execute = main.executeJavaScript;
    if (variant === "foreign") main.framesInSubtree[1].url = "https://evil.test/reisen/2019-griechenland/delphi";
    if (variant === "missing") main.framesInSubtree = [main];
    if (variant === "duplicate") main.framesInSubtree.push({ ...main.framesInSubtree[1] });
    if (variant === "wrong-parent") main.framesInSubtree[1].parent = {};
    main.executeJavaScript = async (code) => {
      const payload = JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1));
      const value = await execute(code);
      if (payload.operation !== "preview-state") return value;
      if (variant === "mismatched-dom") value.iframeSrc = pageUrl.replace("/athen", "/mykene");
      if (variant === "dialog") value.dialogOpen = true;
      if (variant === "enabled-save") value.saveDisabled = false;
      if (variant === "missing-save") delete value.saveDisabled;
      if (variant === "unknown") value.mode = "unknown";
      return value;
    };
    const result = await createSquarespaceGalleryDriver({ timeoutMs: 2, waitMs: 1 }).transfer(fixture.webContents,
      { pageUrl, images: [image] }, { assertCurrent: async () => {} });
    assert.equal(result.results[0].status, "failed", variant);
    assert.equal(fixture.operations.includes("select-page"), false, variant);
    assert.deepEqual(fixture.inputs, [], variant);
    if (variant !== "ignored-exit") assert.deepEqual(fixture.clicks, [], variant);
  }
});

test("Erfolgreiche Textübernahme endet erst nach bestätigtem Vorschauzustand; unklarer Exit meldet keinen blinden Erfolg", async () => {
  for (const unchanged of [false, true]) for (const exitWorks of [true, false]) {
    const fixture = browserFixture({ editing: true, exitWorks, description: unchanged ? image.text : image.expectedCaption });
    const result = await createSquarespaceGalleryDriver({ timeoutMs: 2, waitMs: 1 }).transfer(fixture.webContents,
      { pageUrl, images: [image] }, { assertCurrent: async () => {} });
    assert.equal(result.results[0].status, exitWorks ? unchanged ? "unchanged" : "written" : "failed");
    assert.equal(fixture.operations.includes("exit-page"), true);
    if (!exitWorks) {
      assert.match(result.results[0].error, /Bearbeitung|Vorschau/);
      assert.equal(result.results[0].previewDiagnostic.gallery.stage, "exit-page");
    }
    assert.equal(fixture.inputs.filter((value) => typeof value === "string").length, unchanged ? 0 : 1);
  }
});

test("Finaler Seitenabschluss speichert oder verwirft keine noch offenen Änderungen", async () => {
  const fixture = browserFixture({ editing: true, saved: false });
  const result = await createSquarespaceGalleryDriver({ timeoutMs: 2, waitMs: 1 }).transfer(fixture.webContents,
    { pageUrl, images: [image] }, { assertCurrent: async () => {} });
  assert.equal(result.results[0].status, "failed");
  assert.equal(fixture.operations.includes("exit-page"), false);
  assert.equal(fixture.operations.includes("button"), false);
  assert.equal(fixture.clicks.some((event) => event.x === 220 && event.y === 40), false);
  assert.deepEqual(fixture.inputs.filter((value) => typeof value === "string"), [image.text]);
});

test("Beenden-Punkt bindet gespeicherte Toolbar und dieselbe FN-Vorschauseite ohne Dialog oder Verdeckung", () => {
  const create = () => {
    const dom = cmsDomFixture(), save = dom.element("button", { text: "Speichern", rect: dom.box(10, 10, 100, 30) });
    save.disabled = true;
    const exit = dom.element("button", { text: "Beenden", rect: dom.box(120, 10, 100, 30) });
    const toolbar = dom.element("nav", { attrs: { "aria-label": "Website-Vorschau und Bearbeitungstools" } }, [save, exit]);
    const iframe = dom.element("iframe", { attrs: { id: "sqs-site-frame", src: pageUrl }, rect: dom.box(200, 80, 1000, 700) });
    dom.document.append(toolbar, iframe);
    return { dom, save, exit, toolbar, iframe };
  };
  const fixture = create(), point = fixture.dom.operation({ operation: "exit-page", pageUrl });
  assert.deepEqual(point?.point && [point.point.x, point.point.y], [170, 25]);
  assert.equal(fixture.dom.calls.some(([kind]) => kind === "click"), false);
  for (const mutate of [
    ({ save }) => { save.disabled = false; },
    ({ save }) => { save.attrs["aria-disabled"] = "false"; },
    ({ toolbar }) => { toolbar.children.shift(); },
    ({ dom, toolbar }) => { toolbar.append(dom.element("button", { text: "Save" })); },
    ({ exit }) => { exit.disabled = true; },
    ({ exit }) => { exit.attrs["aria-disabled"] = "true"; },
    ({ dom }) => { dom.document.append(dom.element("div", { attrs: { role: "dialog" } })); },
    ({ dom }) => { dom.document.append(dom.element("div", { attrs: { "aria-modal": "true" } })); },
    ({ dom }) => { dom.document.append(dom.element("button", { text: "Overlay", rect: dom.box(120, 10, 100, 30) })); },
    ({ iframe }) => { iframe.attrs.src = pageUrl.replace("/athen", "/delphi"); },
    ({ iframe }) => { iframe.attrs.src = pageUrl.replace("www.fnwildlifetravel.de", "evil.test"); },
  ]) {
    const current = create(); mutate(current);
    assert.equal(current.dom.operation({ operation: "exit-page", pageUrl }), null);
    assert.equal(current.dom.calls.some(([kind]) => kind === "click"), false);
  }
});

test("Speichern bindet die eigene eindeutige aktive Seite und verweigert Dialog, Fremdseite und verdeckten Schalter", () => {
  const create = () => {
    const dom = cmsDomFixture(), save = dom.element("button", { text: "Speichern", rect: dom.box(10, 10, 100, 30) });
    save.disabled = false;
    const toolbar = dom.element("nav", { attrs: { "aria-label": "Website-Vorschau und Bearbeitungstools" } },
      [save, dom.element("button", { text: "Beenden", rect: dom.box(120, 10, 100, 30) })]);
    const iframe = dom.element("iframe", { attrs: { id: "sqs-site-frame", src: pageUrl }, rect: dom.box(0, 80, 1000, 700) });
    dom.document.append(toolbar, iframe);
    return { dom, save, toolbar, iframe };
  };
  const base = create(), result = base.dom.operation({ operation: "save-page", pageUrl });
  assert.deepEqual([result.point.x, result.point.y], [60, 25]);
  for (const mutate of [
    ({ save }) => { save.disabled = true; },
    ({ save }) => { save.attrs["aria-disabled"] = "true"; },
    ({ dom }) => { dom.document.append(dom.element("div", { attrs: { role: "dialog" } })); },
    ({ toolbar, dom }) => { toolbar.append(dom.element("button", { text: "Save" })); },
    ({ iframe }) => { iframe.attrs.src = pageUrl.replace("/athen", "/mykene"); },
    ({ iframe }) => { iframe.attrs.src = pageUrl.replace("www.fnwildlifetravel.de", "evil.test"); },
    ({ dom }) => { dom.document.append(dom.element("div", { rect: dom.box(10, 10, 100, 30) })); },
  ]) {
    const fixture = create(); mutate(fixture);
    assert.equal(fixture.dom.operation({ operation: "save-page", pageUrl }), null);
    assert.equal(fixture.dom.calls.some(([kind]) => kind === "click"), false);
  }
});

test("Bildformular wird nur über einen unbedeckten Rand der eindeutigen FN-Vorschau geschlossen", () => {
  const dom = cmsDomFixture(), save = dom.element("button", { text: "Speichern" }); save.disabled = true;
  const toolbar = dom.element("nav", { attrs: { "aria-label": "Website-Vorschau und Bearbeitungstools" }, rect: dom.box(0, 0, 1400, 60) },
    [save, dom.element("button", { text: "Beenden" })]);
  const iframe = dom.element("iframe", { attrs: { id: "sqs-site-frame", src: pageUrl }, rect: dom.box(0, 80, 1000, 700) });
  const dialog = dom.element("div", { attrs: { role: "dialog" }, rect: dom.box(800, 200, 300, 500) });
  dialog.append(dom.element("button", { text: "BEARBEITEN", rect: dom.box(850, 300, 100, 30) }));
  dom.document.append(toolbar, iframe, dialog);
  assert.equal(dom.operation({ operation: "preview-state" }).mode, "editing");
  const point = dom.operation({ operation: "dismiss-image-editor", pageUrl });
  assert.deepEqual([point.point.x, point.point.y], [6, 86]);
  dialog.rect = dom.box(0, 80, 1000, 700);
  assert.equal(dom.operation({ operation: "dismiss-image-editor", pageUrl }), null);
  assert.equal(dom.operation({ operation: "dismiss-image-editor", pageUrl: pageUrl.replace("/athen", "/mykene") }), null);
});

test("Galeriebindung stoppt fremde Quelle, fremden Beschreibungstext und formatierte Texte", () => {
  assert.equal(assessSquarespaceGalleryField(image, observed).status, "ready");
  assert.equal(assessSquarespaceGalleryField(image, { ...observed, sourceUrl: sourceUrl.replace("IMGP2101", "IMGP9999") }).status, "conflict");
  assert.equal(assessSquarespaceGalleryField(image, { ...observed, description: "Zwischenzeitlich vom Nutzer geändert" }).status, "conflict");
  assert.equal(assessSquarespaceGalleryField(image, { ...observed, plainText: false }).status, "unsupported");
  assert.equal(assessSquarespaceGalleryField(image, { ...observed, description: image.text }).status, "unchanged");
  assert.equal(assessSquarespaceGalleryField({ ...image, context: "header" }, observed).status, "unsupported");
});

test("Eigenständiger Galerieablauf bindet Freigabe vor Eingabe und lässt Text samt fehlendem Punkt unverändert", async () => {
  const fixture = browserFixture(), checks = [];
  const result = await createSquarespaceGalleryDriver().transfer(fixture.webContents, { pageUrl, pageTitle: "Athen | Griechenland", images: [image] },
    { assertCurrent: async (...args) => checks.push(args) });
  assert.deepEqual(result.results, [{ imageKey: image.imageKey, status: "written" }]);
  assert.equal(fixture.inputs.filter((value) => typeof value === "string")[0], image.text);
  assert.equal(checks.length, 2);
  assert.ok(fixture.operations.includes("blur-description"));
});

test("Geändertes CMS-Feld und bereits passender Text lösen keine Eingabe aus", async () => {
  for (const [description, status] of [["Anderer Text", "conflict"], [image.text, "unchanged"]]) {
    const fixture = browserFixture({ description });
    const result = await createSquarespaceGalleryDriver().transfer(fixture.webContents, { pageUrl, images: [image] }, { assertCurrent: async () => {} });
    assert.equal(result.results[0].status, status);
    assert.deepEqual(fixture.inputs, []);
  }
});

test("Leere Vorschau und vor Eingabe zurückgenommene Freigabe stoppen alle weiteren Bildtexte", async () => {
  const blank = browserFixture({ preview: false });
  const result = await createSquarespaceGalleryDriver({ timeoutMs: 1, waitMs: 1 }).transfer(blank.webContents,
    { pageUrl, images: [image, { ...image, imageKey: "second" }] }, { assertCurrent: async () => {} });
  assert.equal(result.results.length, 2);
  assert.ok(result.results.every((entry) => entry.status === "failed"));
  assert.deepEqual(blank.inputs, []);
  const revoked = browserFixture();
  let checks = 0;
  const revokedResult = await createSquarespaceGalleryDriver().transfer(revoked.webContents, { pageUrl, images: [image] },
    { assertCurrent: async () => { if (++checks === 2) throw new Error("Freigabe zurückgenommen"); } });
  assert.equal(revokedResult.results[0].status, "failed");
  assert.deepEqual(revoked.inputs, []);
});

test("Headerlogo erhält keinen Schreibversuch und kein globaler Website-Titel wird geleert", async () => {
  const fixture = browserFixture();
  const result = await createSquarespaceGalleryDriver().transfer(fixture.webContents, { pageUrl,
    images: [{ ...image, context: "header", decorative: true, text: "" }] }, { assertCurrent: async () => {} });
  assert.equal(result.results[0].status, "unsupported");
  assert.deepEqual(fixture.operations, ["session"]);
  assert.deepEqual(fixture.inputs, []);
});

test("Anmeldung wird nur für die konkrete FN-Verwaltung erkannt; Abbruch schreibt nichts", async () => {
  const driver = createSquarespaceGalleryDriver(), fixture = browserFixture();
  assert.equal((await driver.getStatus({ ...fixture.webContents, getURL: () => "https://account.squarespace.com/" })).connected, false);
  assert.equal((await driver.getStatus({ ...fixture.webContents, getURL: () => "https://foreign.squarespace.com/config/pages" })).connected, false);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(driver.transfer(fixture.webContents, { pageUrl, images: [image] },
    { signal: abort.signal, assertCurrent: async () => {} }), { name: "AbortError" });
  assert.deepEqual(fixture.inputs, []);
});

test("Hängende Seitennavigation wird beim Zeitlimit und Abbruch gestoppt, ohne Bildtexte einzugeben", async () => {
  for (const cancel of [false, true]) {
    const fixture = browserFixture({ preview: false }), controller = new AbortController();
    fixture.webContents.mainFrame.url = "https://vanilla-gerbil-jwnp.squarespace.com/config";
    let stopped = 0;
    fixture.webContents.loadURL = () => new Promise(() => {});
    fixture.webContents.stop = () => { stopped += 1; };
    const pending = createSquarespaceGalleryDriver({ timeoutMs: 10 }).transfer(fixture.webContents,
      { pageUrl, images: [image] }, { signal: controller.signal, assertCurrent: async () => {} });
    if (cancel) setImmediate(() => controller.abort());
    if (cancel) await assert.rejects(pending, { name: "AbortError" });
    else assert.equal((await pending).results[0].status, "failed");
    assert.equal(stopped, 1);
    assert.deepEqual(fixture.inputs, []);
  }
});

test("Abbruch während Texteingabe erzeugt keinen weiteren Blur oder Erfolgsstatus", async () => {
  const fixture = browserFixture(), controller = new AbortController();
  fixture.webContents.insertText = async (text) => { fixture.inputs.push(text); controller.abort(); };
  await assert.rejects(createSquarespaceGalleryDriver().transfer(fixture.webContents, { pageUrl, images: [image] },
    { signal: controller.signal, assertCurrent: async () => {} }), { name: "AbortError" });
  assert.equal(fixture.operations.includes("blur-description"), false);
});

test("Ein Zielbild hinter einem fremden Beschreibungsfeld wird nicht als gemeinsame Feldbindung akzeptiert", async () => {
  const source = await readFile(new URL("./squarespace-gallery-driver.mjs", import.meta.url), "utf8");
  const body = source.slice(source.indexOf("function editorDomOperation("), source.indexOf("\nexport function createSquarespaceGalleryDriver"));
  const rects = () => [{}];
  let focused = false;
  const field = { value: image.expectedCaption, getClientRects: rects, getAttribute: () => null,
    matches: () => false, closest: () => null, querySelector: () => null,
    focus: () => { focused = true; document.activeElement = field; } };
  const label = { innerText: "Beschreibung", htmlFor: "other-image-description", getClientRects: rects };
  const background = { currentSrc: sourceUrl, getClientRects: rects, getBoundingClientRect: () => ({ width: 600, height: 400 }) };
  const document = { baseURI: "https://vanilla-gerbil-jwnp.squarespace.com/config/pages",
    querySelectorAll: (selector) => selector === "img" ? [background] : selector === "label" ? [label]
      : selector === 'textarea,input,[contenteditable="true"]' ? [field] : [], getElementById: () => field };
  const operation = vm.runInNewContext(`(${body})`, { document, URL, getComputedStyle: () => ({ visibility: "visible" }) });
  assert.equal(operation({ operation: "description", sourceUrl }), null);
  assert.equal(operation({ operation: "focus-description", sourceUrl }), null);
  assert.equal(focused, false);
  const editor = { getClientRects: rects, querySelectorAll: () => [background] };
  field.closest = () => editor;
  // A generic shared sidebar still does not prove the observed gallery editor.
  assert.equal(operation({ operation: "description", sourceUrl }), null);
  assert.equal(operation({ operation: "focus-description", sourceUrl }), null);
  assert.equal(focused, false);
});

test("Beobachteter Seiteneditor mit Vorschau-Werkzeugen und sqs-site-frame gilt nur auf der FN-Verwaltung als verbunden", async () => {
  const dom = cmsDomFixture();
  dom.document.append(dom.element("nav", { attrs: { "aria-label": "Website-Vorschau und Bearbeitungstools" } }),
    dom.element("iframe", { attrs: { id: "sqs-site-frame" } }));
  const fixture = browserFixture();
  fixture.webContents.mainFrame.executeJavaScript = async (code) => vm.runInNewContext(code, {
    document: dom.document, URL, getComputedStyle: (node) => node.css,
  });
  const driver = createSquarespaceGalleryDriver();
  assert.equal((await driver.getStatus(fixture.webContents)).connected, true);
  assert.equal((await driver.getStatus({ ...fixture.webContents, getURL: () => "https://foreign.squarespace.com/config/pages" })).connected, false);
  dom.document.children.pop();
  assert.equal((await driver.getStatus(fixture.webContents)).connected, false);
});

test("Sechs Carouselpanes binden ausschließlich die aktive unverdeckte Bildvorschau an das Dialogfeld", () => {
  const dom = galleryModalFixture();
  const result = dom.operation({ operation: "description", sourceUrl });
  assert.equal(result?.sourceUrl, sourceUrl);
  assert.equal(result?.description, image.expectedCaption);
  assert.equal(dom.operation({ operation: "focus-description", sourceUrl }), true);
  assert.equal(dom.document.activeElement, dom.field);
  assert.notEqual(dom.document.activeElement, dom.shadow);
  assert.equal(dom.operation({ operation: "description", sourceUrl: dom.sources[1] }), null);
  const selectedThird = galleryModalFixture({ active: 3 });
  assert.equal(selectedThird.operation({ operation: "description", sourceUrl: selectedThird.sources[3] })?.sourceUrl,
    selectedThird.sources[3]);
  selectedThird.dialog.append(selectedThird.element("img", { attrs: { src: sourceUrl },
    rect: selectedThird.box(1050, 180) }));
  assert.equal(selectedThird.operation({ operation: "description", sourceUrl }), null);
});

test("Carouselbindung stoppt ohne Clip, bei mehrdeutiger aktiver Pane oder widersprüchlicher Geometrie", () => {
  const noClip = galleryModalFixture({ paneCount: 1, clip: false });
  assert.equal(noClip.operation({ operation: "description", sourceUrl }), null);
  const ambiguous = galleryModalFixture();
  ambiguous.panes[1].css.left = "0px";
  ambiguous.panes[1].rect = ambiguous.box(1050, 180);
  ambiguous.panes[1].children[0].rect = ambiguous.box(1050, 180);
  assert.equal(ambiguous.operation({ operation: "description", sourceUrl }), null);
  const shifted = galleryModalFixture({ paneCount: 1 });
  shifted.panes[0].rect = shifted.box(1338, 180);
  shifted.panes[0].children[0].rect = shifted.box(1338, 180);
  assert.equal(shifted.operation({ operation: "description", sourceUrl }), null);
  const unknown = galleryModalFixture({ paneCount: 1, marker: false });
  assert.equal(unknown.operation({ operation: "description", sourceUrl }), null);
});

test("Bildauswahl liefert nur einen frisch gemessenen quellgebundenen Thumbnailpunkt im beobachteten Dialog", () => {
  const dom = galleryModalFixture();
  const backgroundButton = dom.element("div", { attrs: { role: "button" }, rect: dom.box(1000, 0, 100, 100) },
    [dom.element("img", { attrs: { src: sourceUrl }, rect: dom.box(1000, 0, 100, 100) })]);
  dom.document.append(backgroundButton);
  const target = dom.operation({ operation: "select-image", sourceUrl });
  assert.deepEqual(target.point && [target.point.x, target.point.y], [200, 190]);
  assert.deepEqual(dom.calls.filter(([kind]) => kind === "click" || kind === "mouseover"), []);
  assert.ok(dom.calls.some(([kind, node]) => kind === "scroll" && node === dom.thumbnails[0]));
  dom.dialog.append(dom.element("div", { attrs: { "data-cypress": "draggable-item", "data-itemid": "duplicate", role: "button" } },
    [dom.element("img", { attrs: { src: sourceUrl } })]));
  assert.equal(dom.operation({ operation: "select-image", sourceUrl }), null);
});

test("Thumbnailpunkte bleiben bei fremder Quelle, Verdeckung, verstecktem, gesperrtem oder außerhalb liegendem Ziel gesperrt", () => {
  for (const mutate of [
    (dom) => { dom.thumbnails[0].children[0].src = dom.thumbnails[0].children[0].currentSrc = sourceUrl.replace("IMGP2101", "IMGP9999"); },
    (dom) => { dom.document.append(dom.element("button", { text: "Löschen", rect: dom.box(150, 150, 100, 80) })); },
    (dom) => { dom.thumbnails[0].css.visibility = "hidden"; },
    (dom) => { dom.thumbnails[0].attrs["aria-disabled"] = "true"; },
    (dom) => { dom.thumbnails[0].rect = dom.box(-10, 150, 100, 80); },
    (dom) => { dom.thumbnails[0].rect = dom.box(150, 150, 0, 0); },
  ]) {
    const dom = galleryModalFixture(); mutate(dom);
    assert.equal(dom.operation({ operation: "select-image", sourceUrl }), null);
    assert.equal(dom.calls.some(([kind]) => kind === "click"), false);
  }
});

test("Zwei Galeriebilder wechseln ausschließlich durch native Thumbnailwahl; ausbleibender Wechsel stoppt die zweite Eingabe", async () => {
  const second = { ...image, imageKey: "second", sourceUrl: sourceUrl.replace("IMGP2101", "IMGP2201"),
    expectedCaption: "Alte zweite Beschreibung", text: "Freigegebene zweite Beschreibung" };
  for (const switches of [true, false]) {
    const fixture = browserFixture({ editing: true }), main = fixture.webContents.mainFrame;
    const execute = main.executeJavaScript, send = fixture.webContents.sendInputEvent, texts = [image.expectedCaption, second.expectedCaption];
    let active = 0, descriptionReads = 0;
    const images = [image, second];
    main.executeJavaScript = async (code) => {
      const payload = JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1));
      if (payload.operation === "select-image") return { point: { x: 200, y: payload.sourceUrl === sourceUrl ? 190 : 280 } };
      if (payload.operation === "description") {
        if (payload.sourceUrl !== images[active].sourceUrl) return null;
        // The large preview settles after the thumbnail highlight/description change.
        if (active === 1 && ++descriptionReads === 1) return null;
        return { sourceUrl: images[active].sourceUrl, description: texts[active], plainText: true };
      }
      return execute(code);
    };
    fixture.webContents.sendInputEvent = (event) => {
      send(event);
      if (switches && event.type === "mouseUp" && event.x === 200 && event.y === 280) active = 1;
    };
    fixture.webContents.insertText = async (text) => { fixture.inputs.push(text); texts[active] = text; };
    // The positive case crosses a real timer tick; Windows may schedule a 1 ms
    // timer after more than 10 ms under a concurrent native workload.
    const result = await createSquarespaceGalleryDriver({ timeoutMs: switches ? 100 : 10, waitMs: 1 }).transfer(fixture.webContents,
      { pageUrl, images }, { assertCurrent: async () => {} });
    assert.equal(result.results[0].status, "written");
    assert.equal(result.results[1].status, switches ? "written" : "failed");
    assert.deepEqual(fixture.inputs.filter((value) => typeof value === "string"), switches ? [image.text, second.text] : [image.text]);
    assert.ok(fixture.clicks.some((event) => event.type === "mouseMove" && event.x === 200 && event.y === 280));
  }
});

test("Thumbnailpunkt wird nach nativer Mausbewegung erneut geprüft und bei neuer Verdeckung nicht geklickt", async () => {
  const fixture = browserFixture({ editing: true }), main = fixture.webContents.mainFrame;
  const execute = main.executeJavaScript, send = fixture.webContents.sendInputEvent;
  let covered = false;
  main.executeJavaScript = async (code) => {
    const payload = JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1));
    if (payload.operation === "select-image") return covered ? null : { point: { x: 200, y: 190 } };
    return execute(code);
  };
  fixture.webContents.sendInputEvent = (event) => { send(event); if (event.type === "mouseMove" && event.x === 200) covered = true; };
  const result = await createSquarespaceGalleryDriver({ timeoutMs: 2, waitMs: 1 }).transfer(fixture.webContents,
    { pageUrl, images: [image] }, { assertCurrent: async () => {} });
  assert.equal(result.results[0].status, "failed");
  assert.equal(fixture.clicks.some((event) => event.type === "mouseDown" && event.x === 200), false);
  assert.deepEqual(fixture.inputs, []);
});

test("Galerieabschluss verwendet nur den eindeutigen sichtbaren Schließen-Knopf im gebundenen Dialog", () => {
  const fixture = galleryModalFixture(), { document, element, box, dialog } = fixture;
  const close = element("button", { text: " SCHLIESSEN\n", attrs: { "aria-label": "Schließen" }, rect: box(150, 110, 100, 30) });
  dialog.append(close);
  document.append(element("button", { text: "Schließen", rect: box(0, 0, 100, 30) }));
  const target = fixture.operation({ operation: "close-gallery" });
  assert.deepEqual(target.point && [target.point.x, target.point.y], [200, 125]);
  assert.equal(fixture.calls.some(([kind]) => kind === "click"), false);
  dialog.append(element("button", { text: "Close", rect: box(260, 110, 100, 30) }));
  assert.equal(fixture.operation({ operation: "close-gallery" }), null);
  dialog.children.pop();
  for (const mutate of [() => { close.css.visibility = "hidden"; }, () => { close.disabled = true; },
    () => { close.attrs["aria-disabled"] = "true"; },
    () => { document.append(element("button", { text: "Löschen", rect: box(150, 110, 100, 30) })); }]) {
    close.css.visibility = "visible"; close.disabled = false; close.attrs["aria-disabled"] = "false";
    mutate();
    assert.equal(fixture.operation({ operation: "close-gallery" }), null);
  }
});

test("Geschlossene Galerie ist erst nach Verschwinden des sichtbaren Dialogs bestätigt", () => {
  const fixture = galleryModalFixture();
  assert.equal(fixture.operation({ operation: "gallery-closed" }), false);
  fixture.dialog.children = [];
  assert.equal(fixture.operation({ operation: "gallery-closed" }), false, "Leere sichtbare Dialoghülle ist noch nicht geschlossen");
  fixture.dialog.css.visibility = "hidden";
  assert.equal(fixture.operation({ operation: "gallery-closed" }), true);
  fixture.document.append(fixture.element("div", { attrs: { role: "dialog" } }));
  assert.equal(fixture.operation({ operation: "gallery-closed" }), false, "Unbekannter sichtbarer Folgedialog stoppt den Abschluss");
});

test("Geschriebene und bereits passende Texte erhalten vor Rückgabe einen nativen bestätigten Galerieabschluss", async () => {
  for (const unchanged of [false, true]) for (const closes of [true, false]) {
    const fixture = browserFixture({ editing: true, description: unchanged ? image.text : image.expectedCaption });
    const main = fixture.webContents.mainFrame, execute = main.executeJavaScript, send = fixture.webContents.sendInputEvent;
    let closed = false;
    main.executeJavaScript = async (code) => {
      const payload = JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1));
      if (payload.operation === "gallery-closed") return closed;
      return execute(code);
    };
    fixture.webContents.sendInputEvent = (event) => {
      send(event);
      if (event.type === "mouseUp" && event.x === 150 && event.y === 100 && closes) closed = true;
    };
    const result = await createSquarespaceGalleryDriver({ timeoutMs: 2, waitMs: 1 }).transfer(fixture.webContents,
      { pageUrl, images: [image] }, { assertCurrent: async () => {} });
    assert.equal(result.results[0].status, closes ? unchanged ? "unchanged" : "written" : "failed");
    assert.ok(fixture.clicks.some((event) => event.type === "mouseUp" && event.x === 150 && event.y === 100));
    if (!closes) assert.equal(result.results[0].previewDiagnostic.gallery.stage, "close-gallery");
    if (unchanged) assert.deepEqual(fixture.inputs, []);
  }
});

test("Ein nicht gebundener Galerieabschluss stoppt alle weiteren Bildtexte statt einen globalen Close zu verwenden", async () => {
  const fixture = browserFixture({ editing: true }), main = fixture.webContents.mainFrame, execute = main.executeJavaScript;
  main.executeJavaScript = async (code) => {
    const payload = JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1));
    return payload.operation === "close-gallery" ? null : execute(code);
  };
  const result = await createSquarespaceGalleryDriver({ timeoutMs: 2, waitMs: 1 }).transfer(fixture.webContents,
    { pageUrl, images: [image, { ...image, imageKey: "second" }] }, { assertCurrent: async () => {} });
  assert.deepEqual(result.results.map((entry) => entry.status), ["failed", "failed"]);
  assert.equal(result.results[0].previewDiagnostic.gallery.stage, "close-gallery");
  assert.deepEqual(fixture.inputs.filter((value) => typeof value === "string"), [image.text]);
  assert.equal(fixture.clicks.some((event) => event.x === 150 && event.y === 100), false);
});

test("Galeriesektion liefert nur einen quellgebundenen Hoverpunkt und keinen synthetischen Klick", () => {
  const dom = cmsDomFixture();
  const section = dom.element("section", { attrs: { "data-sqsp-section": "gallery" } },
    [dom.element("img", { attrs: { src: sourceUrl } })]);
  dom.document.append(section);
  const result = dom.operation({ operation: "gallery-hover", sourceUrl });
  assert.ok(result?.point);
  assert.equal(dom.calls.some(([kind]) => kind === "click" || kind === "mouseover"), false);
});

test("Bekannte Galerieknöpfe erkennen Großschreibung und umgebrochenen Weißraum ohne die Zielbindung zu erweitern", () => {
  for (const label of ["GALERIE BEARBEITEN", "\n GALERIE\n  BEARBEITEN \t", "EDIT GALLERY", "\u00a0Edit\nGallery\u00a0"]) {
    const portal = cmsDomFixture();
    const button = portal.element("button", { text: label });
    const unrelated = portal.element("button", { text: "ABSCHNITT HINZUFÜGEN" });
    portal.document.append(button, unrelated);
    assert.equal(portal.operation({ operation: "button", names: ["Galerie bearbeiten", "Edit Gallery", "Edit gallery"] }), true, label);
    assert.deepEqual(portal.calls.filter(([kind]) => kind === "click").map(([_kind, node]) => node), [button]);

    const portalDom = cmsDomFixture();
    const portalButton = portalDom.element("button", { attrs: { "aria-label": label } });
    portalDom.document.append(portalDom.element("div", { attrs: { id: `page-region-${galleryRegionId}-section-editor-ui-mount` } }, [portalButton]));
    assert.ok(portalDom.operation({ operation: "gallery-control", hovered: true })?.point, label);
    assert.equal(portalDom.calls.some(([kind]) => kind === "click"), false);
  }
});

test("Normalisierte Galerieknöpfe bleiben bei Mehrdeutigkeit oder unbekanntem Zusatztext gesperrt", () => {
  const dom = cmsDomFixture();
  dom.document.append(dom.element("button", { text: "Galerie bearbeiten" }), dom.element("button", { text: "GALERIE\nBEARBEITEN" }));
  assert.equal(dom.operation({ operation: "button", names: ["Galerie bearbeiten"] }), false);
  assert.equal(dom.calls.some(([kind]) => kind === "click"), false);
  dom.document.children.length = 0;
  dom.document.append(dom.element("button", { text: "Galerie bearbeiten und löschen" }));
  assert.equal(dom.operation({ operation: "button", names: ["Galerie bearbeiten"] }), false);
});

test("Normalisierte bekannte Feld- und Toolbarlabels verändern keine Bildbeschreibung", () => {
  const dom = galleryModalFixture();
  dom.field.attrs["aria-label"] = "\n BESCHREIBUNG\u00a0";
  dom.field.value = "Beschreibung\n\nmit  eigenem Abstand und Punkt.";
  assert.equal(dom.operation({ operation: "description", sourceUrl })?.description, dom.field.value);
  const toolbarDom = cmsDomFixture();
  toolbarDom.document.append(toolbarDom.element("nav", { attrs: { "aria-label": "Website-Vorschau und Bearbeitungstools" } },
    [toolbarDom.element("button", { text: " SPEICHERN\n" }), toolbarDom.element("button", { text: " BEENDEN " })]),
  toolbarDom.element("iframe", { attrs: { id: "sqs-site-frame", src: pageUrl } }));
  const state = toolbarDom.operation({ operation: "preview-state" });
  assert.equal(state.mode, "editing");
  assert.deepEqual(Array.from(state.controls), ["Speichern", "Beenden"]);
});

test("Galerieportal liefert nach dem gebundenen Hover nur einen eindeutigen sichtbaren Knopfpunkt", () => {
  const dom = cmsDomFixture(), button = dom.element("button", { text: "GALERIE BEARBEITEN", rect: dom.box(200, 100, 180, 40) });
  const portal = dom.element("div", { attrs: { id: `page-region-${galleryRegionId}-section-editor-ui-mount` } }, [button]);
  const unrelated = dom.element("button", { text: "Galerie bearbeiten", rect: dom.box(600, 100, 180, 40) });
  dom.document.append(unrelated, portal);
  assert.equal(dom.operation({ operation: "gallery-control", hovered: true }), null);
  unrelated.css.visibility = "hidden";
  assert.equal(dom.operation({ operation: "gallery-control", hovered: true }).point.x, 290);
  assert.equal(dom.calls.some(([kind]) => kind === "click"), false);
  assert.equal(dom.operation({ operation: "gallery-control" }), null);
  assert.equal(dom.operation({ operation: "gallery-control", hovered: false }), null);
  button.css.display = "none";
  assert.equal(dom.operation({ operation: "gallery-control", hovered: true }), null);
  button.css.display = "block";
  portal.append(dom.element("button", { text: "Galerie bearbeiten", rect: dom.box(200, 150, 180, 40) }));
  assert.equal(dom.operation({ operation: "gallery-control", hovered: true }), null);
});

test("Top-Galerieportal wird durch den geprüften nativen Knopf geöffnet, bevor Bildtexte auswählbar sind", async () => {
  const fixture = browserFixture({ editing: true }), main = fixture.webContents.mainFrame;
  const execute = main.executeJavaScript;
  let opened = false;
  main.executeJavaScript = async (code) => {
    const payload = JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1));
    if (payload.operation === "gallery-control") return payload.hovered === true ? { point: { x: 290, y: 120 } } : null;
    if (payload.operation === "select-image") return opened ? { point: { x: 200, y: 190 } } : null;
    return execute(code);
  };
  const send = fixture.webContents.sendInputEvent;
  fixture.webContents.sendInputEvent = (event) => {
    send(event);
    if (event.type === "mouseUp" && event.x === 290 && event.y === 120) opened = true;
  };
  const result = await createSquarespaceGalleryDriver({ timeoutMs: 3, waitMs: 1 }).transfer(fixture.webContents,
    { pageUrl, images: [image] }, { assertCurrent: async () => {} });
  assert.equal(result.results[0].status, "written");
  assert.ok(fixture.clicks.some((event) => event.type === "mouseUp" && event.x === 290));
});

test("Galeriezugriffsdiagnose enthält nur gebundene Zähler, Stufe und erlaubte CSS-Zustände", async () => {
  const fixture = browserFixture(), frameDom = cmsDomFixture(), topDom = cmsDomFixture();
  frameDom.document.append(frameDom.element("section", { attrs: { "data-sqsp-section": "gallery", "data-section-id": "67659e40a4738c63398a0578" } },
    [frameDom.element("img", { attrs: { src: sourceUrl } }), frameDom.element("button", { text: "Galerie bearbeiten", css: { display: "none" } }),
      frameDom.element("textarea", { value: "Private Beschreibung nicht ausgeben" })]));
  topDom.document.append(topDom.element("nav", { attrs: { "aria-label": "Website-Vorschau und Bearbeitungstools" } },
    [topDom.element("button", { text: "Speichern" }), topDom.element("button", { text: "Beenden" })]),
  topDom.element("iframe", { attrs: { id: "sqs-site-frame", src: pageUrl } }),
  topDom.element("div", { attrs: { id: `page-region-${galleryRegionId}-section-editor-ui-mount` } },
    [topDom.element("button", { text: "GALERIE BEARBEITEN", css: { display: "flex", visibility: "visible" } })]));
  const run = (dom, code) => vm.runInNewContext(code, { document: dom.document, URL,
    getComputedStyle: (node) => node.css, MouseEvent: class { constructor(type) { this.type = type; } } });
  fixture.webContents.mainFrame.executeJavaScript = async (code) => run(topDom, code);
  fixture.webContents.mainFrame.framesInSubtree[1].executeJavaScript = async (code) => run(frameDom, code);
  const diagnostic = await createSquarespaceGalleryDriver().inspectPreview(fixture.webContents, pageUrl,
    { sourceUrl, stage: "open-gallery" });
  assert.equal(diagnostic.gallery.stage, "open-gallery");
  assert.equal(diagnostic.gallery.matchingGallerySections, 1);
  assert.equal(diagnostic.gallery.targetPortalCount, 1);
  assert.equal(diagnostic.gallery.frameGalleryButtons.total, 1);
  assert.equal(diagnostic.gallery.frameGalleryButtons.visible, 0);
  assert.equal(diagnostic.gallery.mainGalleryButtons.visible, 1);
  assert.deepEqual(Array.from(diagnostic.gallery.mainGalleryButtons.display), ["flex"]);
  assert.doesNotMatch(JSON.stringify(diagnostic), /Private|Beschreibung|section-editor-ui-mount|data-section-id/);
});

test("Reale unterschiedliche Sektions- und Portal-IDs mit verborgenem Werkzeug verlangen nativen Hover statt Bildklick", async () => {
  const fixture = browserFixture({ editing: true }), topDom = cmsDomFixture(), frameDom = cmsDomFixture();
  frameDom.document.documentElement = { clientWidth: 1000, clientHeight: 700 };
  frameDom.document.append(frameDom.element("section", { attrs: { "data-sqsp-section": "gallery", "data-section-id": "67659e40a4738c63398a0578" },
    rect: frameDom.box(100, 100, 800, 400) }, [frameDom.element("img", { attrs: { src: sourceUrl }, rect: frameDom.box(100, 100, 800, 400) })]));
  const iframe = topDom.element("iframe", { attrs: { id: "sqs-site-frame", src: pageUrl }, rect: topDom.box(200, 80, 1000, 700) });
  Object.assign(iframe, { clientWidth: 1000, clientHeight: 700, offsetWidth: 1000, offsetHeight: 700, clientLeft: 0, clientTop: 0 });
  const button = topDom.element("button", { text: "GALERIE BEARBEITEN", rect: topDom.box(650, 60, 180, 40), css: { visibility: "hidden" } });
  const save = topDom.element("button", { text: "Speichern", rect: topDom.box(10, 10, 100, 30) }); save.disabled = true;
  const toolbar = topDom.element("nav", { attrs: { "aria-label": "Website-Vorschau und Bearbeitungstools" } },
    [save, topDom.element("button", { text: "Beenden", rect: topDom.box(170, 25, 100, 30) })]);
  topDom.document.append(toolbar, iframe,
  topDom.element("div", { attrs: { id: "page-region-0fd9aa7d7699c708014b3e64-section-editor-ui-mount" }, rect: topDom.box(650, 60, 180, 40) }, [button]));
  const run = (dom, code) => vm.runInNewContext(code, { document: dom.document, URL,
    getComputedStyle: (node) => node.css, MouseEvent: class { constructor(type) { this.type = type; } } });
  const main = fixture.webContents.mainFrame, execute = main.executeJavaScript, send = fixture.webContents.sendInputEvent;
  let opened = false;
  main.executeJavaScript = async (code) => {
    const payload = JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1));
    if (["preview-state", "exit-page", "gallery-control", "map-gallery-hover", "gallery-diagnostic"].includes(payload.operation)) return run(topDom, code);
    if (payload.operation === "select-image") return opened ? { point: { x: 200, y: 190 } } : null;
    return execute(code);
  };
  main.framesInSubtree[1].executeJavaScript = async (code) => run(frameDom, code);
  fixture.webContents.sendInputEvent = (event) => {
    send(event);
    if (event.type === "mouseMove" && event.x === 700 && event.y === 380) button.css.visibility = "visible";
    if (event.type === "mouseUp" && event.x === 740 && event.y === 80) opened = true;
    if (event.type === "mouseUp" && event.x === 220 && event.y === 40) {
      toolbar.children = []; toolbar.append(topDom.element("button", { text: "Bearbeiten", rect: topDom.box(10, 10, 100, 30) }));
    }
  };
  const result = await createSquarespaceGalleryDriver({ timeoutMs: 10, waitMs: 1 }).transfer(fixture.webContents,
    { pageUrl, images: [image] }, { assertCurrent: async () => {} });
  assert.equal(result.results[0].status, "written", JSON.stringify(result));
  assert.equal(fixture.clicks.filter((event) => event.type === "mouseDown").length, 4);
  assert.ok(fixture.clicks.some((event) => event.type === "mouseMove" && event.x === 700 && event.y === 380));
  assert.equal(frameDom.calls.some(([kind]) => kind === "click" || kind === "mouseover"), false);
});

test("Hoverpunkt-Projektion verlangt ein passendes achsenparalleles Einzelframe und einen freien Iframe-Hit", () => {
  const good = hoverMappingFixture();
  assert.equal(good.dom.operation(good.payload).point.x, 700);
  assert.equal(good.dom.operation(good.payload).point.y, 380);
  for (const [blocked, mutate] of [["frame-count", ({ iframe }) => { iframe.css.visibility = "hidden"; }],
    ["transform", ({ iframe }) => { iframe.css.transform = "matrix(-0.5, 0, 0, 0.5, 0, 0)"; }],
    ["dimensions", ({ iframe }) => { iframe.rect.width = 99; }],
    ["frame-url", ({ iframe }) => { iframe.attrs.src = pageUrl.replace("/athen", "/delphi"); }],
    ["dimensions", ({ payload }) => { payload.framePoint.x = 1001; }],
    ["hit-test", ({ dom }) => { dom.document.append(dom.element("button", { text: "Löschen", rect: dom.box(650, 350, 100, 60) })); }],
    ["frame-count", ({ dom }) => { dom.document.append(dom.element("iframe", { attrs: { id: "sqs-site-frame", src: pageUrl } })); }]]) {
    const current = hoverMappingFixture(); mutate(current);
    assert.equal(current.dom.operation(current.payload)?.blocked, blocked);
  }
});

test("Hoverpunkt-Projektion bildet positive achsenparallele CSS-Matrizen und individuelle 2D-Transformationen exakt ab", () => {
  for (const [label, css, rect, expected] of [
    ["identity", { transform: "matrix(1, 0, 0, 1, 0, 0)" }, [200, 80, 1000, 700], [700, 380]],
    ["translation", { transform: "matrix(1, 0, 0, 1, 40, 30)" }, [240, 110, 1000, 700], [740, 410]],
    ["scale", { transform: "matrix(0.8, 0, 0, 0.8, 0, 0)" }, [200, 80, 800, 560], [600, 320]],
    ["matrix3d", { transform: "matrix3d(0.5, 0, 0, 0, 0, 0.75, 0, 0, 0, 0, 1, 0, 20, 30, 0, 1)" }, [220, 110, 500, 525], [470, 335]],
    ["individual", { scale: "0.8 0.8 1", rotate: "0deg", translate: "30px -20px 0px" }, [200, 80, 800, 560], [600, 320]],
    ["zoom", { zoom: "0.8" }, [200, 80, 800, 560], [600, 320]],
    ["percent zoom", { zoom: "80%" }, [200, 80, 800, 560], [600, 320]],
  ]) {
    const { dom, iframe, payload } = hoverMappingFixture();
    Object.assign(iframe.css, css); iframe.rect = dom.box(...rect);
    const mapped = dom.operation(payload);
    assert.deepEqual(mapped.point && [mapped.point.x, mapped.point.y], expected, label);
  }
  const { dom, iframe, payload } = hoverMappingFixture();
  const ancestor = dom.element("div", { css: { transform: "matrix(0.5, 0, 0, 1.2, 40, 30)" } });
  dom.document.children = []; dom.document.append(ancestor); ancestor.append(iframe);
  Object.assign(iframe, { offsetWidth: 1004, offsetHeight: 706, clientLeft: 2, clientTop: 3 });
  iframe.rect = dom.box(200, 80, 502, 847.2);
  const mapped = dom.operation(payload);
  assert.deepEqual([mapped.point?.x, mapped.point?.y], [451, 444]);
});

test("Hoverpunkt-Projektion sperrt Rotation, Scherung, Spiegelung, Perspektive und unbekannte oder unplausible Transformationen", () => {
  for (const css of [
    { transform: "matrix(-1, 0, 0, 1, 0, 0)" }, { transform: "matrix(0, 0, 0, 1, 0, 0)" },
    { transform: "matrix(0, 1, -1, 0, 0, 0)" }, { transform: "matrix(1, 0.1, 0, 1, 0, 0)" },
    { transform: "matrix(1, 0, 0.1, 1, 0, 0)" }, { transform: "matrix(1, 0, 0, 1, Infinity, 0)" },
    { transform: "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0.001, 0, 0, 0, 1)" },
    { transform: "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1)" },
    { transform: "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 20, 1)" },
    { transform: "scale(0.8)" }, { scale: "-1 1" }, { scale: "0 1" }, { scale: "1 1 2" },
    { rotate: "1deg" }, { rotate: "360deg" }, { translate: "30% 20px" }, { translate: "20px 0px 1px" },
    { perspective: "1000px" }, { zoom: "0" }, { zoom: "-1" }, { zoom: "11" },
  ]) {
    const { dom, iframe, payload } = hoverMappingFixture();
    Object.assign(iframe.css, css);
    assert.equal(dom.operation(payload).blocked, "transform", JSON.stringify(css));
  }
  const ancestorCase = hoverMappingFixture();
  ancestorCase.dom.document.css.perspective = "1000px";
  assert.equal(ancestorCase.dom.operation(ancestorCase.payload).blocked, "transform");
  for (const mutate of [
    ({ iframe }) => { iframe.rect.width = 99; }, ({ iframe }) => { iframe.rect.width = 10001; },
    ({ iframe }) => { iframe.rect.height = 69; }, ({ iframe }) => { iframe.offsetWidth = 0; },
    ({ payload }) => { payload.frameViewport.width = 998; },
  ]) {
    const fixture = hoverMappingFixture(); mutate(fixture);
    assert.equal(fixture.dom.operation(fixture.payload).blocked, "dimensions");
  }
});

test("Native Galeriezugriffe stoppen bei verfügbarem abweichendem oder unlesbarem Hauptfensterzoom vor allen Eingaben", async () => {
  for (const editing of [false, true]) for (const zoom of [1.25, 0.8, NaN, undefined, "error"]) {
    const fixture = browserFixture({ editing });
    fixture.webContents.getZoomFactor = () => { if (zoom === "error") throw new Error("Zoom unlesbar"); return zoom; };
    const result = await createSquarespaceGalleryDriver({ timeoutMs: 2, waitMs: 1 }).transfer(fixture.webContents,
      { pageUrl, images: [image] }, { assertCurrent: async () => {} });
    assert.equal(result.results[0].status, "failed");
    assert.deepEqual(fixture.clicks, []);
    assert.deepEqual(fixture.inputs, []);
  }
  const fixture = browserFixture(); fixture.webContents.getZoomFactor = () => 1;
  const result = await createSquarespaceGalleryDriver().transfer(fixture.webContents,
    { pageUrl, images: [image] }, { assertCurrent: async () => {} });
  assert.equal(result.results[0].status, "written");
});

test("Galeriezugriffsfehler benennen ausschließlich die konkret blockierte feste Zugriffsstufe", async () => {
  for (const access of ["frame", "frame-parent", "source-point", "map", "map-frame-count", "map-frame-url", "map-transform", "map-dimensions",
    "map-hit-test", "frame-changed", "control", "opened"]) {
    const fixture = browserFixture({ editing: true }), main = fixture.webContents.mainFrame;
    const execute = main.executeJavaScript;
    if (access === "frame-parent") main.framesInSubtree[1].parent = {};
    main.executeJavaScript = async (code) => {
      const payload = JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1));
      if (payload.operation === "gallery-hover" && access === "source-point") return null;
      if (payload.operation === "map-gallery-hover") {
        if (access.startsWith("map-")) return { blocked: access.slice(4) };
        if (access === "map") return { blocked: "secret-non-enum" };
        if (access === "frame-changed") main.framesInSubtree[1] = { ...main.framesInSubtree[1] };
      }
      if (payload.operation === "gallery-control" && access === "control" || payload.operation === "select-image" && access === "opened") return null;
      return execute(code);
    };
    main.framesInSubtree[1].executeJavaScript = (code) => main.executeJavaScript(code);
    if (access === "frame") {
      const frames = main.framesInSubtree;
      let reads = 0;
      Object.defineProperty(main, "framesInSubtree", { get: () => ++reads === 1 ? frames : [main] });
    }
    const result = await createSquarespaceGalleryDriver({ timeoutMs: 2, waitMs: 1 }).transfer(fixture.webContents,
      { pageUrl, images: [image] }, { assertCurrent: async () => {} });
    assert.equal(result.results[0].status, "failed", access);
    assert.equal(result.results[0].previewDiagnostic?.gallery?.access, access);
    assert.deepEqual(fixture.inputs, []);
    assert.doesNotMatch(JSON.stringify(result), /secret-non-enum/);
  }
});

test("Externe Vorschaudiagnose verwirft unbekannte Zugriffsstufen statt beliebige Texte auszugeben", async () => {
  const fixture = browserFixture();
  const driver = createSquarespaceGalleryDriver();
  const allowed = await driver.inspectPreview(fixture.webContents, pageUrl, { sourceUrl, stage: "open-gallery", access: "map-transform" });
  assert.equal(allowed.gallery.access, "map-transform");
  const rejected = await driver.inspectPreview(fixture.webContents, pageUrl,
    { sourceUrl, stage: "open-gallery", access: "secret-private-account-value" });
  assert.equal(Object.hasOwn(rejected.gallery, "access"), false);
  assert.doesNotMatch(JSON.stringify(rejected), /secret-private/);
});

test("Quellgebundener Hoverpunkt bleibt bei fremdem, mehrdeutigem oder verdecktem Galerieinhalt gesperrt", () => {
  const dom = cmsDomFixture(), section = dom.element("section", { attrs: { "data-sqsp-section": "gallery" }, rect: dom.box(100, 100, 800, 400) },
    [dom.element("img", { attrs: { src: sourceUrl }, rect: dom.box(100, 100, 800, 400) })]);
  dom.document.append(section);
  const result = dom.operation({ operation: "gallery-hover", sourceUrl });
  assert.equal(result.point.x, 500);
  assert.equal(result.point.y, 300);
  assert.equal(dom.operation({ operation: "gallery-hover", sourceUrl: sourceUrl.replace("IMGP2101", "IMGP9999") }), null);
  dom.document.append(dom.element("button", { text: "Fremde Abdeckung", rect: dom.box(450, 250, 100, 100) }));
  assert.equal(dom.operation({ operation: "gallery-hover", sourceUrl }), null);
  const tall = cmsDomFixture({ innerWidth: 1000, innerHeight: 700 });
  tall.document.documentElement = { clientWidth: 985, clientHeight: 700 };
  tall.document.append(tall.element("section", { attrs: { "data-sqsp-section": "gallery" }, rect: tall.box(0, -500, 1000, 1800) },
    [tall.element("img", { attrs: { src: sourceUrl }, rect: tall.box(0, -500, 1000, 1800) })]));
  const withScrollbar = tall.operation({ operation: "gallery-hover", sourceUrl });
  assert.equal(withScrollbar.viewport.width, 1000);
  assert.equal(withScrollbar.point.x, 492);
  assert.equal(withScrollbar.point.y, 350);
  dom.document.children.pop();
  dom.document.append(dom.element("section", { attrs: { "data-sqsp-section": "gallery" } }, [dom.element("img", { attrs: { src: sourceUrl } })]));
  assert.equal(dom.operation({ operation: "gallery-hover", sourceUrl }), null);
});

test("Top-Portal wird nur nach eindeutiger Auswahl der Zielgalerie geöffnet", async () => {
  for (const selected of [false, true]) {
    const fixture = browserFixture();
    const execute = fixture.webContents.mainFrame.executeJavaScript;
    let portalClicks = 0;
    fixture.webContents.mainFrame.executeJavaScript = async (code) => {
      const payload = JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1));
      if (payload.operation === "gallery-control") {
        portalClicks += 1;
        return payload.hovered === true ? { point: { x: 290, y: 120 } } : null;
      }
      return execute(code);
    };
    fixture.webContents.mainFrame.framesInSubtree[1].executeJavaScript = async () => selected
      ? { point: { x: 400, y: 300 }, viewport: { width: 1000, height: 700 } } : null;
    const result = await createSquarespaceGalleryDriver({ timeoutMs: 2, waitMs: 1 }).transfer(fixture.webContents,
      { pageUrl, images: [image] }, { assertCurrent: async () => {} });
    assert.equal(portalClicks, selected ? 1 : 0);
    assert.equal(result.results[0].status, selected ? "written" : "failed");
  }
});
