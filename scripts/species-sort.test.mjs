import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../sort.js", import.meta.url), "utf8");

function overview(titles, triggerId = "species-sort") {
  const timers = new Map();
  const observers = [];
  let nextTimer = 1;
  let writes = 0;
  let mutationPending = false;
  const scope = {
    contains(node) {
      for (let current = node; current; current = current.parentElement) {
        if (current === scope) return true;
      }
      return false;
    },
    querySelectorAll: () => parent.children.map((item) => item.heading),
  };
  const parent = {
    parentElement: scope,
    children: [],
    appendChild(fragment) {
      for (const item of fragment.children) {
        item.parentElement = this;
        this.children.push(item);
      }
      fragment.children = [];
      writes += 1;
      mutationPending = true;
    },
  };
  function add(title) {
    const item = { parentElement: parent };
    item.heading = { textContent: title, closest: () => item };
    parent.children.push(item);
    mutationPending = true;
    return item;
  }
  titles.forEach(add);
  mutationPending = false;

  const document = {
    readyState: "complete",
    getElementById: (id) => id === triggerId ? {} : null,
    querySelector: (selector) => selector === "main" ? scope : null,
    createDocumentFragment() {
      return {
        children: [],
        appendChild(item) {
          const previous = item.parentElement;
          previous.children.splice(previous.children.indexOf(item), 1);
          item.parentElement = this;
          this.children.push(item);
          mutationPending = true;
        },
      };
    },
  };
  const context = vm.createContext({
    document,
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target, options) { this.target = target; this.options = options; this.active = true; }
      disconnect() { this.active = false; }
    },
    setTimeout(callback, delay) {
      const id = nextTimer++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  context.window = context;
  new vm.Script(source, { filename: "sort.js" }).runInContext(context);

  return {
    add,
    titles: () => parent.children.map((item) => item.heading.textContent),
    writes: () => writes,
    pending: (delay) => [...timers.values()].filter((timer) => timer.delay === delay).length,
    run(delay) {
      for (const [id, timer] of [...timers]) {
        if (timer.delay !== delay || !timers.has(id)) continue;
        timers.delete(id);
        timer.callback();
      }
    },
    deliverMutations() {
      if (!mutationPending) return;
      mutationPending = false;
      for (const observer of observers) {
        if (observer.active) observer.callback([{ type: "childList", target: parent }]);
      }
    },
  };
}

test("Weitere Tiere bleibt hinter Wendehals und Wintergoldhähnchen", () => {
  const page = overview(["Weißstorch", "Weitere Tiere", "Wendehals", "Wintergoldhähnchen"]);
  page.run(0);
  assert.deepEqual(page.titles(), ["Weißstorch", "Wendehals", "Wintergoldhähnchen", "Weitere Tiere"]);
});

test("Die Abschlusskachel wird trotz Großschreibung und sichtbarem Leerraum erkannt", () => {
  for (const closing of ["Weitere Tiere", "weitere tiere", "\n WEITERE\u00a0 TIERE \t"]) {
    const page = overview([closing, "Zilpzalp", "Amsel", "Wendehals"]);
    page.run(0);
    assert.deepEqual(page.titles(), ["Amsel", "Wendehals", "Zilpzalp", closing]);
  }
});

test("Nur der vollständige normalisierte Abschlusstitel erhält eine Sonderstellung", () => {
  for (const ordinary of ["Weitere Tiere Europas", "Weitere Tiere!", "Weitere Tier"]) {
    const page = overview(["Zilpzalp", "Weitere Tiere", "Wendehals", ordinary]);
    page.run(0);
    assert.deepEqual(page.titles(), [ordinary, "Wendehals", "Zilpzalp", "Weitere Tiere"]);
  }
});

test("Echte Arten behalten deutsche, numerische und bei gleichem Titel stabile Sortierung", () => {
  const page = overview(["Amsel 10", "Zilpzalp", "Amsel 2", "Ährenmaus", "amsel 2"]);
  page.run(0);
  assert.deepEqual(page.titles(), ["Ährenmaus", "Amsel 2", "amsel 2", "Amsel 10", "Zilpzalp"]);
});

test("Wiederholte Start- und eigene Observerläufe verändern die fertige Reihenfolge nicht", () => {
  const page = overview(["Weitere Tiere", "Wendehals", "Amsel"]);
  page.run(0);
  assert.deepEqual(page.titles(), ["Amsel", "Wendehals", "Weitere Tiere"]);
  assert.equal(page.writes(), 1);
  page.deliverMutations();
  page.run(200);
  for (const delay of [600, 1800, 3200]) page.run(delay);
  assert.deepEqual(page.titles(), ["Amsel", "Wendehals", "Weitere Tiere"]);
  assert.equal(page.writes(), 1, "Fertige Gruppen dürfen keine Mutation-Schleife auslösen");
  assert.equal(page.pending(200), 0);
});

test("Observer sortiert nachgeladene Arten vor die Abschlusskachel und bleibt danach ruhig", () => {
  const page = overview(["Wendehals", "Weitere Tiere"], "species-search");
  page.run(0);
  page.add("Amsel");
  page.deliverMutations();
  page.add("Zilpzalp");
  page.deliverMutations();
  assert.equal(page.pending(200), 1, "Nachladungen werden zusammengefasst");
  page.run(200);
  assert.deepEqual(page.titles(), ["Amsel", "Wendehals", "Zilpzalp", "Weitere Tiere"]);
  const writes = page.writes();
  page.deliverMutations();
  page.run(200);
  assert.equal(page.writes(), writes);
  assert.equal(page.pending(200), 0);
  page.run(8000);
  page.add("Buchfink");
  page.deliverMutations();
  assert.equal(page.pending(200), 0, "Der bestehende zeitlich begrenzte Observer bleibt begrenzt");
});


// Travel overview: actual sibling order and strictly scoped status correction.
const travelFixture = JSON.parse(await readFile(new URL("./fixtures/website/travel-overview.json", import.meta.url), "utf8"));
function travelOverviewPage({ bodyId=travelFixture.bodyId, loading=false, omit=null, duplicate=null, foreign=false, changedTitle=false, badBand=false, absentGrid=false }={}) {
  const timers=new Map(), observers=[], domEvents=new Map();let next=0,writes=0,pending=false;
  const parent={children:[],attributes:new Map(),insertBefore(node,anchor){const old=node.parentElement;old.children.splice(old.children.indexOf(node),1);const at=this.children.indexOf(anchor);assert.ok(at>=0);this.children.splice(at,0,node);node.parentElement=this;writes++;pending=true;},getAttribute(k){return this.attributes.get(k)??null;},setAttribute(k,v){this.attributes.set(k,v);writes++;},classList:new Set(['fluid-engine',travelFixture.gridClass])};
  // The original bound HTML remains in the audit fixture; its digest is the same opaque VM payload.
  function make(row){const node={...structuredClone(row),html:row.htmlDigest,parentElement:parent,classList:new Set(['fe-block','fe-block-'+row.id]),querySelector(selector){if(selector==='img')return this.image?{src:'original-image'}:null;if(selector==='.Marquee')return this.band?{getAttribute:()=>this.items}:null;if(selector==='.sqs-html-content h1, .sqs-html-content h2')return this.heading===null?null:{textContent:this.heading};return null;},remove(){this.parentElement.children.splice(this.parentElement.children.indexOf(this),1);this.parentElement=null;writes++;pending=true;}};Object.defineProperty(node,'nextElementSibling',{get(){const p=this.parentElement;return p?.children[p.children.indexOf(this)+1]??null;}});return node;}
  parent.children=travelFixture.blocks.filter(b=>b.id!==omit).map(make);
  if(duplicate)parent.children.push(make(travelFixture.blocks.find(b=>b.id===duplicate)));
  if(foreign)parent.children.push(make({id:'foreign-card',html:'foreign content',heading:'Neue Reise',image:false,band:false}));
  if(changedTitle)parent.children.find(b=>b.heading==='2023').heading='2027';
  if(badBand)parent.children.find(b=>b.id==='053f5382d53cf7f852ee').items='{broken';
  const originalNodes=new Map(parent.children.map(b=>[b.id,b]));
  const document={body:{id:bodyId},readyState:loading?'loading':'complete',querySelectorAll:selector=>selector==='.'+travelFixture.gridClass&&!absentGrid?[parent]:[],getElementById:()=>null,addEventListener(type,callback){domEvents.set(type,callback);}};
  const context=vm.createContext({document,MutationObserver:class{constructor(cb){this.callback=cb;observers.push(this);}observe(target,options){this.target=target;this.options=options;this.active=true;}disconnect(){this.active=false;}},setTimeout(callback,delay){const id=++next;timers.set(id,{callback,delay});return id;},clearTimeout:id=>timers.delete(id)});context.window=context;new vm.Script(source,{filename:'sort.js'}).runInContext(context);
  return{parent,originalNodes,writes:()=>writes,run(delay){for(const[id,timer]of[...timers])if(timer.delay===delay&&timers.has(id)){timers.delete(id);timer.callback();}},deliver(){if(!pending)return;pending=false;for(const observer of observers)if(observer.active)observer.callback([{type:'childList',target:parent}]);},domReady(){domEvents.get('DOMContentLoaded')?.();},timers,observers};
}
const travelOverviewLabels=p=>p.parent.children.filter(b=>b.heading!==null).map(b=>b.heading.toLocaleUpperCase('de'));
const expectedTravelLabels=['2019','GRIECHENLAND','2020','SIZILIEN','MARINA WENDTORF','KRETA','2021','NEAPEL UND AMALFITANA','2022','NAMIBIA','ITALIEN -LATIUM','2023','NAMIBIA','2024','COSTA RICA','MONTENEGRO','2025','NORDTHAILAND UND LAOS','ISLAND','ITALIEN - MARKEN','2026','BOTSWANA'];
test('Latium steht in der wirklichen Lesereihenfolge unter2022; alle14 Karten und50 Originalblöcke bleiben',()=>{const p=travelOverviewPage();p.run(0);assert.deepEqual(travelOverviewLabels(p),expectedTravelLabels);assert.equal(p.parent.children.filter(b=>b.image).length,14);assert.equal(p.parent.children.length,50);});
// All six native status bands belong to FN-logo placeholder content tiles.
// Their images and both native grid layouts were checked against public HTML.
const travelPlaceholderGroups = [
  ['bc4f02b8cb737d6699d8', 'b25570df8e94e9b68e6a', 'Namibia'],
  ['d3440f9a41f587d9f7bd', 'f88c7ec3db7bd5048a6f', 'Italien -Latium'],
  ['611f69c7d6955ac5c88e', '18b9c85009fdab9fabad', 'Namibia'],
  ['bafa667170fa939d3788', '053f5382d53cf7f852ee', 'Montenegro'],
  ['c034ea46bdbd20d756b4', 'd86fe3195375c23d6ffe', 'Italien - MArken'],
  ['e7e0b2cbbdfba503b2c8', '7445afd04dd6241247ed', 'Botswana'],
];
test('Alle sechs Logo-Platzhalter behalten ihr eigenes Originalband unmittelbar zwischen Bild und Titel',()=>{
  const p=travelOverviewPage();p.run(0);
  assert.equal(p.parent.children.filter(b=>b.band).length,6);
  for(const[imageId,bandId,title]of travelPlaceholderGroups){
    const band=p.originalNodes.get(bandId),at=p.parent.children.indexOf(band);
    assert.ok(at>0);
    assert.equal(p.parent.children[at-1],p.originalNodes.get(imageId));
    assert.equal(p.parent.children[at+1].heading,title);
    assert.equal(band.items,travelFixture.blocks.find(b=>b.id===bandId).items);
  }
});
test('Reisefotos erhalten kein Platzhalterband; keine neuen Blöcke oder Animation werden angelegt',()=>{
  const p=travelOverviewPage();p.run(0);
  const logos=new Set(travelPlaceholderGroups.map(([id])=>id));
  for(const node of p.parent.children.filter(b=>b.image&&!logos.has(b.id)))assert.equal(node.nextElementSibling.band,false);
  assert.equal(new Set(p.parent.children).size,50);
  assert.ok(p.parent.children.every(b=>p.originalNodes.get(b.id)===b));
});
test('Karten, Jahresknoten und alle Statusbänder bleiben dieselben Objekte mit unverändertem HTML und Raster',()=>{const p=travelOverviewPage(),before=p.parent.children.map(b=>({node:b,html:b.html,grid:b.gridArea}));p.run(0);for(const b of before){assert.ok(p.parent.children.includes(b.node));assert.equal(b.node.html,b.html);assert.equal(b.node.gridArea,b.grid);}assert.equal(p.parent.children.filter(b=>b.image).length,14);});
test('Wiederholte Timer und eigene Observermutation bleiben nach erfolgreicher Korrektur ruhig',()=>{const p=travelOverviewPage();p.run(0);const writes=p.writes();p.deliver();p.run(200);for(const delay of[600,1800,3200])p.run(delay);assert.equal(p.writes(),writes);assert.deepEqual(travelOverviewLabels(p),expectedTravelLabels);p.deliver();p.run(200);assert.equal(p.writes(),writes);});
test('Ein noch ladendes Dokument wird erst nach DOMContentLoaded bearbeitet',()=>{const p=travelOverviewPage({loading:true});p.run(0);assert.equal(p.writes(),0);p.domReady();p.run(0);assert.deepEqual(travelOverviewLabels(p),expectedTravelLabels);});
for(const[title,options]of[['falsche Seite',{bodyId:'collection-other'}],['fehlender Latiumtitel',{omit:'4b21f7e77648c6279536'}],['doppelter Block',{duplicate:'d3440f9a41f587d9f7bd'}],['neuer unbekannter Block',{foreign:true}],['geänderter Jahreskopf',{changedTitle:true}],['beschädigter Bandinhalt',{badBand:true}],['fehlendes Raster',{absentGrid:true}],['teilweise entfernte Bänder',{omit:'b25570df8e94e9b68e6a'}]])test(title+' bleibt vor jeder DOMmutation gesperrt',()=>{const p=travelOverviewPage(options),before=p.parent.children.slice();p.run(0);p.run(600);assert.equal(p.writes(),0);assert.deepEqual(p.parent.children,before);assert.equal(p.parent.attributes.size,0);});
test('Der begrenzte Observer endet nach acht Sekunden',()=>{const p=travelOverviewPage();p.run(0);p.run(8000);assert.ok(p.observers.every(o=>!o.active));const writes=p.writes();p.deliver();p.run(200);assert.equal(p.writes(),writes);});


// Known blocks in an unrecognized order must remain untouched, before marker or status changes.
function moveTravelFixtureNodeBefore(page, id, beforeId) {
  const nodes = page.parent.children;
  const node = nodes.find((entry) => entry.id === id);
  const anchor = nodes.find((entry) => entry.id === beforeId);
  assert.ok(node && anchor);
  nodes.splice(nodes.indexOf(node), 1);
  nodes.splice(nodes.indexOf(anchor), 0, node);
}

test("Bekannter Jahreskopf in anderer50erReihenfolge sperrt vor jeder Mutation", () => {
  const page = travelOverviewPage();
  moveTravelFixtureNodeBefore(page, "ca07961f7de2c5f3a904", "611f69c7d6955ac5c88e");
  const before = page.parent.children.slice();
  for (const delay of [0, 600, 1800, 3200]) page.run(delay);
  assert.equal(page.writes(), 0);
  assert.deepEqual(page.parent.children, before);
  assert.equal(page.parent.attributes.size, 0);
});

test("Bekannte MontenegroKnoten mit andererNachbarschaft sperren vor jeder Mutation", () => {
  const page = travelOverviewPage();
  moveTravelFixtureNodeBefore(page, "c3615c1d92bed7d537c4", "bafa667170fa939d3788");
  const before = page.parent.children.slice();
  for (const delay of [0, 600, 1800, 3200]) page.run(delay);
  assert.equal(page.writes(), 0);
  assert.deepEqual(page.parent.children, before);
  assert.equal(page.parent.attributes.size, 0);
});

test("Auch die neue50erFolge muss vor jeder späteren Reparatur exakt bleiben", () => {
  const page = travelOverviewPage();
  page.run(0);
  assert.equal(page.parent.children.length, 50);
  const writes = page.writes();
  moveTravelFixtureNodeBefore(page, "4b21f7e77648c6279536", "d3440f9a41f587d9f7bd");
  const before = page.parent.children.slice();
  page.deliver();
  page.run(200);
  for (const delay of [600, 1800, 3200]) page.run(delay);
  assert.equal(page.writes(), writes);
  assert.deepEqual(page.parent.children, before);
  assert.equal(page.parent.attributes.get("data-fn-travel-order"), "latium-2022-logo-status-v2");
});

test("Eine alte45erLaufzeit ohne Originalbänder bleibt bis zum normalen Neuladen unverändert", () => {
  const page=travelOverviewPage();
  const removed=new Set(travelPlaceholderGroups.map(([,id])=>id).filter(id=>id!=='053f5382d53cf7f852ee'));
  page.parent.children=page.parent.children.filter(node=>!removed.has(node.id));
  const before=page.parent.children.slice();
  for(const delay of[0,600,1800,3200])page.run(delay);
  assert.equal(page.writes(),0);
  assert.deepEqual(page.parent.children,before);
});

test("Jedes beschädigte Statusband sperrt die komplette Reisekorrektur vor Änderungen",()=>{
  for(const[,id]of travelPlaceholderGroups){
    const page=travelOverviewPage();page.originalNodes.get(id).items='[{"text":"Fremder Status"}]';
    const before=page.parent.children.slice();page.run(0);
    assert.equal(page.writes(),0);assert.deepEqual(page.parent.children,before);
  }
});

// Actual Wildlife overview siblings: each image, title and optional status band
// is its own Fluid Engine block. Preserve those objects when changing order.
const wildlifeFixture = JSON.parse(await readFile(new URL("./fixtures/website/wildlife-overview.json", import.meta.url), "utf8"));
const wildlifeHeadingSelector = ".sqs-html-content h1, .sqs-html-content h2, .sqs-html-content h3, .sqs-html-content h4, .sqs-html-content h5, .sqs-html-content h6";

function wildlifePage({ bodyId = wildlifeFixture.bodyId, loading = false, gridCount = 1, cssReady = true, prepare } = {}) {
  const timers = new Map(), observers = [], events = new Map();
  let nextTimer = 0, writes = 0, pending = false;
  function attributes() {
    return { values: new Map(), getAttribute(name) { return this.values.get(name) ?? null; }, setAttribute(name, value) { this.values.set(name, value); writes++; } };
  }
  function style() {
    return { values: new Map(), getPropertyValue(name) { return this.values.get(name) ?? ""; }, setProperty(name, value) { this.values.set(name, value); writes++; } };
  }
  const grid = { ...attributes(), style: style(), children: [], insertBefore(node, anchor) {
    this.children.splice(this.children.indexOf(node), 1);
    const at = anchor ? this.children.indexOf(anchor) : this.children.length;
    assert.ok(at >= 0);
    this.children.splice(at, 0, node);
    writes++;
    pending = true;
  } };
  function make(row) {
    return { ...structuredClone(row), ...attributes(), style: style(), parentElement: grid,
      querySelectorAll(selector) {
        if (selector === "img") return this.image ? [{ src: this.image.src, alt: this.image.alt }] : [];
        if (selector === wildlifeHeadingSelector) return this.heading && !this.band ? [{ textContent: this.heading }] : [];
        if (selector === "a[href]") return this.links.map(link => ({ getAttribute: () => link.href }));
        return [];
      },
      querySelector(selector) {
        if (selector === ".Marquee") return this.band ? { getAttribute: () => this.band } : null;
        if (selector === "hr") return this.id === "488c8303ffa45128c1b3" ? {} : null;
        if (selector === ".sqs-block-image") return this.image ? {} : null;
        if (selector === ".sqs-block-html") return this.heading && !this.band ? {} : null;
        if (selector === ".sqs-block-marquee") return this.band ? {} : null;
        if (selector === ".sqs-block-horizontalrule") return this.id === "488c8303ffa45128c1b3" ? {} : null;
        return this.querySelectorAll(selector)[0] ?? null;
      },
    };
  }
  grid.children = wildlifeFixture.blocks.map(make);
  prepare?.({ grid, make });
  const originalNodes = grid.children.slice();
  const document = { body: { id: bodyId }, readyState: loading ? "loading" : "complete",
    querySelectorAll: selector => selector === "." + wildlifeFixture.gridClass ? Array(gridCount).fill(grid) : [],
    getElementById: () => null, addEventListener: (type, callback) => events.set(type, callback) };
  const context = vm.createContext({ document, getComputedStyle: () => ({ getPropertyValue: () => cssReady ? "1" : "" }),
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target, options) { this.target = target; this.options = options; this.active = true; }
      disconnect() { this.active = false; }
    },
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  context.window = context;
  new vm.Script(source, { filename: "sort.js" }).runInContext(context);
  return { grid, originalNodes, observers, writes: () => writes, domReady: () => events.get("DOMContentLoaded")?.(),
    appendCategory(title, inProgress = false, suffix = title) { grid.children.push(...extraWildlifeCategory(make, title, inProgress, suffix)); pending = true; },
    run(delay) { for (const [id, timer] of [...timers]) if (timer.delay === delay && timers.has(id)) { timers.delete(id); timer.callback(); } },
    deliver() { if (!pending) return; pending = false; for (const observer of observers) if (observer.active) observer.callback([]); },
    pending: delay => [...timers.values()].filter(timer => timer.delay === delay).length,
  };
}

const wildlifeTitles = page => page.grid.children.slice(2).filter(node => node.heading && !node.band).map(node => node.heading);
const expectedWildlifeTitles = ["Heimische Tierwelt", "Afrika", "Costa Rica", "Island", "Asien"];

test("Wildlife: Heimische zuerst, aktive Kategorien alphabetisch und In Arbeit zuletzt", () => {
  const page = wildlifePage();
  page.run(0);
  assert.deepEqual(wildlifeTitles(page), expectedWildlifeTitles);
  assert.equal(page.grid.getAttribute("data-fn-wildlife-order"), "home-alphabetic-pending-v1");
});

test("Wildlife: Bilder, Titel, Links und Asienband bleiben als Originale zusammen", () => {
  const page = wildlifePage();
  const before = page.originalNodes.map(node => ({ node, html: node.htmlDigest, image: node.image, links: node.links, band: node.band }));
  page.run(0);
  assert.deepEqual(page.grid.children.slice(0, 2), page.originalNodes.slice(0, 2));
  assert.equal(page.grid.children.length, 13);
  for (const entry of before) {
    assert.ok(page.grid.children.includes(entry.node));
    for (const key of ["image", "links", "band"]) assert.equal(entry.node[key], entry[key]);
    assert.equal(entry.node.htmlDigest, entry.html);
  }
  const band = page.grid.children.find(node => node.band);
  const at = page.grid.children.indexOf(band);
  assert.equal(page.grid.children[at - 1].image.alt, "Logo FN Wildlife & Travel");
  assert.equal(page.grid.children[at + 1].heading, "Asien");
  assert.equal(band.getAttribute("data-fn-wildlife-role"), "status");
});

test("Wildlife: gemeinsame Rasterplätze bilden breit und mobil dieselbe Lesefolge", () => {
  const page = wildlifePage();
  page.run(0);
  for (const [index, title] of expectedWildlifeTitles.entries()) {
    const node = page.grid.children.find(node => node.heading === title);
    const at = page.grid.children.indexOf(node);
    const group = page.grid.children.slice(page.grid.children[at - 1].band ? at - 2 : at - 1, at + 1);
    assert.equal(node.style.getPropertyValue("--fn-wildlife-wide-row"), String(4 + Math.floor(index / 3) * 14));
    assert.equal(node.style.getPropertyValue("--fn-wildlife-wide-column"), String(2 + index % 3 * 8));
    assert.equal(node.style.getPropertyValue("--fn-wildlife-mobile-row"), String(3 + index * 11));
    for (const member of group) for (const name of ["--fn-wildlife-wide-row", "--fn-wildlife-wide-column", "--fn-wildlife-mobile-row"]) {
      assert.equal(member.style.getPropertyValue(name), node.style.getPropertyValue(name));
    }
  }
  assert.equal(page.grid.style.getPropertyValue("--fn-wildlife-wide-rows"), "31");
  assert.equal(page.grid.style.getPropertyValue("--fn-wildlife-mobile-rows"), "57");
});

test("Wildlife: wiederholte Timer und eigene Mutationen verursachen keine weiteren Schreibvorgänge", () => {
  const page = wildlifePage();
  page.run(0);
  const writes = page.writes();
  assert.ok(writes > 0);
  page.deliver();
  page.run(200);
  for (const delay of [600, 1800, 3200]) page.run(delay);
  page.deliver();
  assert.equal(page.pending(200), 0);
  assert.equal(page.writes(), writes);
  page.run(8000);
  assert.ok(page.observers.every(observer => !observer.active));
});

test("Wildlife: DOM-Bereitschaft und kurz nachgeladene Kategorien bleiben unterstützt", () => {
  const page = wildlifePage({ loading: true });
  assert.equal(page.pending(0), 0);
  page.domReady();
  page.run(0);
  assert.deepEqual(wildlifeTitles(page), expectedWildlifeTitles);
  page.appendCategory("Europa");
  page.deliver();
  page.run(200);
  assert.deepEqual(wildlifeTitles(page), ["Heimische Tierwelt", "Afrika", "Costa Rica", "Europa", "Island", "Asien"]);
  const writes = page.writes();
  page.deliver();
  page.run(200);
  assert.equal(page.writes(), writes);
});

function extraWildlifeCategory(make, title, pending = false, suffix = title) {
  const link = { href: "/wildlife/" + suffix, text: "" };
  return [make({ id: suffix + "-image", image: { src: suffix + ".jpg", alt: title }, heading: null, band: null, links: [link] }),
    ...(pending ? [make({ id: suffix + "-band", image: null, heading: "In Arbeit", band: '[{"text":" IN  ARBEIT "}]', links: [] })] : []),
    make({ id: suffix + "-title", image: null, heading: title, band: null, links: [{ ...link, text: title }] })];
}

test("Wildlife: neue eindeutige Kategorien werden semantisch und ohne neue Blockkennungen erkannt", () => {
  const page = wildlifePage({ prepare({ grid, make }) {
    grid.children.push(...extraWildlifeCategory(make, "Europa"), ...extraWildlifeCategory(make, "Amerika", true), ...extraWildlifeCategory(make, "Australien", true));
  } });
  page.run(0);
  assert.deepEqual(wildlifeTitles(page), ["Heimische Tierwelt", "Afrika", "Costa Rica", "Europa", "Island", "Amerika", "Asien", "Australien"]);
  assert.equal(page.grid.style.getPropertyValue("--fn-wildlife-wide-rows"), "45");
});

test("Wildlife: In Arbeit hat Vorrang auch vor Heimische; gleiche deutsche Sortierschlüssel bleiben stabil", () => {
  const page = wildlifePage({ prepare({ grid, make }) {
    grid.children.splice(3, 0, make({ id: "home-band", image: null, heading: "In Arbeit", band: '[{"text":"In Arbeit"}]', links: [] }));
    grid.children.push(...extraWildlifeCategory(make, "Ägypten"), ...extraWildlifeCategory(make, "Agypten"));
  } });
  page.run(0);
  assert.deepEqual(wildlifeTitles(page), ["Afrika", "Ägypten", "Agypten", "Costa Rica", "Island", "Asien", "Heimische Tierwelt"]);
});

test("Wildlife: sichtbarer In-Arbeit-Hinweis im Kategorietitel genügt ebenfalls", () => {
  const page = wildlifePage({ prepare({ grid, make }) {
    grid.children.push(...extraWildlifeCategory(make, "Amerika (In Arbeit)"));
  } });
  page.run(0);
  assert.deepEqual(wildlifeTitles(page), ["Heimische Tierwelt", "Afrika", "Costa Rica", "Island", "Amerika (In Arbeit)", "Asien"]);
});

for (const [label, options] of [
  ["andere Seite", { bodyId: "collection-other" }], ["fehlendes Raster", { gridCount: 0 }],
  ["doppeltes Raster", { gridCount: 2 }], ["fehlende passende Layoutregeln", { cssReady: false }],
  ["fremder Inhalt", { prepare({ grid, make }) { grid.children.push(make({ id: "unknown", heading: "Information", links: [], band: null, image: null })); } }],
  ["anderer Seitenkopf", { prepare({ grid }) { grid.children[0].heading = "Reisen"; } }],
  ["fehlender Kategorietitel", { prepare({ grid }) { grid.children.pop(); } }],
  ["falsche Bild-Titel-Zuordnung", { prepare({ grid }) { grid.children[3].links[0].href = "/wildlife/afrika"; } }],
  ["externer Link", { prepare({ grid }) { grid.children[3].links[0].href = "https://other.test/wildlife/heimische-tierwelt"; } }],
  ["beschädigtes Statusband", { prepare({ grid }) { grid.children.find(node => node.band).band = "{broken"; } }],
  ["anderer Statusbandtext", { prepare({ grid }) { grid.children.find(node => node.band).band = '[{"text":"Neu"}]'; } }],
  ["Status ohne eindeutige Gruppe", { prepare({ grid }) { const band = grid.children.splice(5, 1)[0]; grid.children.push(band); } }],
  ["unverknüpfte Kategorie ohne Status", { prepare({ grid }) { grid.children.splice(5, 1); } }],
  ["doppelte Kategorienzuordnung", { prepare({ grid, make }) { grid.children.push(...extraWildlifeCategory(make, "Afrika", false, "afrika")); } }],
]) test("Wildlife: " + label + " sperrt vor jeder Mutation", () => {
  const page = wildlifePage(options), before = page.grid.children.slice();
  for (const delay of [0, 600, 1800, 3200]) page.run(delay);
  assert.equal(page.writes(), 0);
  assert.deepEqual(page.grid.children, before);
});
