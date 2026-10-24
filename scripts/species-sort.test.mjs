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
test('Latium steht in der wirklichen Lesereihenfolge unter2022; alle14 Karten und Folgejahre bleiben',()=>{const p=travelOverviewPage();p.run(0);assert.deepEqual(travelOverviewLabels(p),expectedTravelLabels);assert.equal(p.parent.children.filter(b=>b.image).length,14);assert.equal(p.parent.children.length,45);});
test('Ausschließlich Montenegro trägt das verbleibende Band unmittelbar zwischen Bild und Titel',()=>{const p=travelOverviewPage();p.run(0);const bands=p.parent.children.filter(b=>b.band);assert.equal(bands.length,1);const at=p.parent.children.indexOf(bands[0]);assert.equal(p.parent.children[at-1].id,'bafa667170fa939d3788');assert.equal(p.parent.children[at+1].heading.toLocaleUpperCase('de'),'MONTENEGRO');});
test('Karten und Jahresknoten bleiben dieselben Objekte mit unverändertem HTML und Raster',()=>{const p=travelOverviewPage(),before=p.parent.children.map(b=>({node:b,html:b.html,grid:b.gridArea}));p.run(0);for(const b of before.filter(b=>!b.node.band||b.node.id==='053f5382d53cf7f852ee')){assert.ok(p.parent.children.includes(b.node));assert.equal(b.node.html,b.html);assert.equal(b.node.gridArea,b.grid);}assert.equal(p.parent.children.filter(b=>b.image).length,14);});
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

test("Auch die45erFolge muss vor jeder späteren Reparatur exakt bleiben", () => {
  const page = travelOverviewPage();
  page.run(0);
  assert.equal(page.parent.children.length, 45);
  const writes = page.writes();
  moveTravelFixtureNodeBefore(page, "4b21f7e77648c6279536", "d3440f9a41f587d9f7bd");
  const before = page.parent.children.slice();
  page.deliver();
  page.run(200);
  for (const delay of [600, 1800, 3200]) page.run(delay);
  assert.equal(page.writes(), writes);
  assert.deepEqual(page.parent.children, before);
  assert.equal(page.parent.attributes.get("data-fn-travel-order"), "latium-2022-montenegro-v1");
});
