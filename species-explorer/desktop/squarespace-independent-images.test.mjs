import assert from "node:assert/strict";
import test from "node:test";
import { createSquarespaceIndependentImageTransfer } from "./squarespace-independent-images.mjs";

const pageUrl = "https://www.fnwildlifetravel.de/reisen/2019-griechenland";
const textInputs = (events) => events.filter(event => ["key", "insertText"].includes(event.event));
const saves = (events) => events.filter(event => event.event === "click" && event.action === "save-page");

function fixture(options = {}) {
  const events = [], records = (options.types || ["block"]).map((type, index) => {
    const image = { imageKey: `image-${index + 1}`, sourceUrl: `https://images.squarespace-cdn.com/content/v1/synthetic/image-${index + 1}.jpg`,
      context: "content", kind: "image", textCoupled: false, expectedAlt: `Alter Alttext ${index + 1}`,
      expectedCaption: `Sichtbare Bildunterschrift ${index + 1}. `, text: `Freigegebener Alttext ${index + 1}.`, decorative: false,
      approvalRevision: `approval-${index + 1}` };
    const fields = { sourceUrl: image.sourceUrl, alt: options.unchanged ? image.text : image.expectedAlt,
      caption: image.expectedCaption, title: `Unveränderter Titel ${index + 1}`, description: `Unveränderte Beschreibung ${index + 1}` };
    return { type, image, fields, initial: structuredClone(fields), altReads: 0, bindingReads: { "bind-block": 0, "bind-section": 0 } };
  });
  const plan = { pageUrl, pageTitle: "Griechenland", images: records.map(record => record.image) };
  let current, focused = "", dialogOpen = Boolean(options.dialog), saveDisabled = !options.dirty;
  let activePreview, activeTop, approvals = 0;
  const log = (event, extra = {}) => events.push({ event, imageKey: current?.image.imageKey, ...extra });
  const controls = {
    driftPreview() { activePreview = { stale: true }; },
    driftTop() { activeTop = { stale: true }; },
  };
  async function execute(script) {
    const payload = JSON.parse(script.slice(script.lastIndexOf(")(") + 2, -1)), operation = payload.operation;
    log("dom", { operation });
    if (operation === "alt-field") current.altReads += 1;
    if (Object.hasOwn(current.bindingReads, operation)) current.bindingReads[operation] += 1;
    const override = options.onOperation?.({ operation, payload, record: current, controls, events });
    if (override !== undefined) return override;
    if (["bind-block", "bind-section"].includes(operation)) {
      const matches = current.type === "both" || current.type === (operation === "bind-block" ? "block" : "auto");
      return matches ? { blockId: "block-synthetic", sectionId: "section-synthetic", itemTitle: current.fields.title,
        alt: current.fields.alt, caption: current.fields.caption, point: { x: 200, y: 200 }, viewport: { width: 1000, height: 800 } } : null;
    }
    if (["edit-block-control", "content-control", "content-tab", "select-item"].includes(operation)) return { action: operation };
    if (operation === "alt-field") return { ...current.fields, isAltField: true, editable: true };
    if (operation === "focus-alt") { focused = "alt"; return true; }
    if (operation === "blur-alt") { focused = ""; return true; }
    if (operation === "dialog-closed") return !dialogOpen;
    throw new Error(`Unexpected DOM operation: ${operation}`);
  }
  const frame = { executeJavaScript: execute }, top = { executeJavaScript: execute };
  activePreview = frame; activeTop = top;
  const webContents = {
    sendInputEvent(event) {
      log("key", { keyCode: event.keyCode, type: event.type, focused });
      assert.equal(focused, "alt");
      if (event.type === "keyDown" && event.keyCode === "Backspace") { current.fields.alt = ""; saveDisabled = false; }
    },
    async insertText(text) {
      log("insertText", { text, focused }); assert.equal(focused, "alt");
      current.fields.alt = text; saveDisabled = false;
      if (options.autoSaved) saveDisabled = true;
      options.onInsert?.({ record: current, controls, events });
    },
  };
  const helpers = {
    async openPage(_contents, openedPlan, signal) {
      signal?.throwIfAborted(); assert.equal(openedPlan, plan);
      current = records[events.filter(event => event.event === "open").length];
      log("open"); return frame;
    },
    mainFrame: () => activeTop,
    previewFrame: (_contents, url) => { assert.equal(url, pageUrl); return activePreview; },
    async previewState() { log("state"); return { mode: "editing", saveDisabled, dialogOpen }; },
    async performPage(_frame, payload) {
      log("page", { operation: payload.operation });
      const override = options.onPage?.({payload,record:current,events});
      if (override !== undefined) return override;
      if (["map-gallery-hover", "dismiss-image-editor", "save-page"].includes(payload.operation)) return { action: payload.operation };
      throw new Error(`Unexpected page operation: ${payload.operation}`);
    },
    click(_contents, target, signal) {
      signal?.throwIfAborted();
      if (!target) return false;
      log("click", { action: target.action });
      if (target.action === "save-page") {
        if (options.saveFailure === "click") return false;
        if (options.saveFailure !== "confirmation") saveDisabled = true;
      } else if (target.action === "dismiss-image-editor") dialogOpen = false;
      else if (["edit-block-control", "content-control"].includes(target.action)) dialogOpen = true;
      return true;
    },
    hover(_contents, target, signal) { signal?.throwIfAborted(); log("hover"); return Boolean(target); },
    async waitFor(predicate, message, signal) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        signal?.throwIfAborted(); const value = await predicate(); signal?.throwIfAborted();
        if (value) return value;
      }
      throw new Error(message);
    },
    async exitSavedPage(_contents, url, signal) { signal?.throwIfAborted(); assert.equal(url, pageUrl); log("exit"); },
  };
  async function assertCurrent(imageKey, revision) {
    approvals += 1; events.push({ event: "approval", imageKey, revision });
    const record = records.find(entry => entry.image.imageKey === imageKey);
    assert.equal(revision, record.image.approvalRevision);
    if (options.rejectApproval === approvals) throw new Error("Freigabe wurde geändert");
  }
  const driver = createSquarespaceIndependentImageTransfer(helpers);
  return { records, plan, events, controls, run: (signal) => driver.transfer(webContents, plan, { assertCurrent, signal }) };
}

test("normaler Bildblock und Auto Layout schreiben nur das Alttextfeld und erhalten Titel, Caption und Beschreibung", async () => {
  const f = fixture({ types: ["block", "auto"] }), beforePlan = structuredClone(f.plan);
  assert.deepEqual((await f.run()).results.map(result => result.status), ["written", "written"]);
  for (const record of f.records) {
    assert.equal(record.fields.alt, record.image.text);
    for (const name of ["caption", "title", "description", "sourceUrl"]) assert.equal(record.fields[name], record.initial[name]);
    const events = f.events.filter(event => event.imageKey === record.image.imageKey);
    assert.equal(events.filter(event => event.event === "insertText").length, 1);
    assert.equal(events.filter(event => event.event === "approval").length, 3);
    const approvalIndexes = events.flatMap((event, index) => event.event === "approval" ? [index] : []);
    const inputIndex = events.findIndex(event => event.event === "key"), saveIndex = events.findIndex(event => event.event === "click" && event.action === "save-page");
    assert.ok(approvalIndexes[0] < events.findIndex(event => event.event === "open"));
    assert.ok(approvalIndexes[1] < inputIndex && approvalIndexes[1] > events.findIndex(event => event.operation === "alt-field"));
    assert.ok(approvalIndexes[2] > inputIndex && approvalIndexes[2] < saveIndex);
    assert.ok(textInputs(events).every(event => event.focused === "alt"));
    assert.equal(saves(events).length, 1);
  }
  assert.deepEqual(f.plan, beforePlan);
});

test("vorher schmutzige Seite oder vorhandener Dialog verhindert Eingabe und Speichern", async () => {
  for (const options of [{ dirty: true }, { dialog: true }]) {
    const f = fixture(options), result = await f.run();
    assert.equal(result.results[0].status, "failed");
    assert.deepEqual(textInputs(f.events), []); assert.deepEqual(saves(f.events), []);
    assert.equal(f.events.some(event => event.event === "dom"), false);
  }
});

test("späte Bildblock- und Kachelzuordnung nach ein oder zwei leeren Durchgängen wird begrenzt abgewartet", async () => {
  for (const type of ["block", "auto"]) for (const emptyRounds of [1, 2]) {
    const f = fixture({ types: [type], onOperation({ operation, record }) {
      if (Object.hasOwn(record.bindingReads, operation) && record.bindingReads[operation] <= emptyRounds) return null;
    } });
    assert.equal((await f.run()).results[0].status, "written");
    assert.deepEqual(f.records[0].bindingReads, { "bind-block": emptyRounds + (type === "block" ? 2 : 1), "bind-section": emptyRounds + (type === "auto" ? 2 : 1) });
    const firstInput = f.events.findIndex(event => event.event === "key");
    const beforeInput = f.events.slice(0, firstInput);
    assert.equal(beforeInput.filter(event => event.operation === "bind-block").length, emptyRounds + (type === "block" ? 2 : 1));
    assert.equal(beforeInput.filter(event => event.operation === "bind-section").length, emptyRounds + (type === "auto" ? 2 : 1));
    assert.equal(f.events.filter(event => event.event === "insertText").length, 1);
    assert.equal(saves(f.events).length, 1);
  }
});

test("dauerhaft fehlende Bildzuordnung endet nach begrenztem Warten failed und stoppt weitere Bilder", async () => {
  const f = fixture({ types: ["none", "block"] });
  assert.deepEqual((await f.run()).results.map(result => result.status), ["failed", "failed"]);
  assert.deepEqual(f.records[0].bindingReads, { "bind-block": 3, "bind-section": 3 });
  assert.equal(f.events.filter(event => event.event === "open").length, 1);
  assert.deepEqual(textInputs(f.events), []); assert.deepEqual(saves(f.events), []);
});

test("eine noch wechselnde Vorschaugröße wird mit frischer Bildbindung begrenzt abgewartet", async () => {
  for (const permanent of [false,true]) {
    let calls=0;
    const f=fixture({onPage({payload}) {
      if(payload.operation==="map-gallery-hover" && (permanent || ++calls<3)) return {blocked:"dimensions"};
    }});
    const result=await f.run();
    assert.equal(result.results[0].status,permanent?"failed":"written");
    assert.equal(f.events.filter(event=>event.event==="insertText").length,permanent?0:1);
    assert.equal(f.records[0].bindingReads["bind-block"],4);
  }
});

test("doppelte Block- und Kachelzuordnung bleibt unsupported ohne Eingabe oder Save", async () => {
  const f = fixture({ types: ["both"] });
  assert.equal((await f.run()).results[0].status, "unsupported");
  assert.deepEqual(f.records[0].bindingReads, { "bind-block": 1, "bind-section": 1 });
  assert.deepEqual(textInputs(f.events), []); assert.deepEqual(saves(f.events), []);
});

test("Framewechsel nach leerem Zuordnungsdurchgang stoppt vor dem nächsten Quellenlesen", async () => {
  const f = fixture({ onOperation({ operation, record, controls }) {
    if (operation === "bind-block") return null;
    if (operation === "bind-section") { controls.driftPreview(); return null; }
  } });
  assert.equal((await f.run()).results[0].status, "failed");
  assert.deepEqual(f.records[0].bindingReads, { "bind-block": 1, "bind-section": 1 });
  assert.deepEqual(textInputs(f.events), []); assert.deepEqual(saves(f.events), []);
});

test("fremder Alttext im identifizierten Feld stoppt auch alle nachfolgenden Bilder", async () => {
  const f = fixture({ types: ["auto", "block"], onOperation({ operation, record }) {
    if (operation === "alt-field") record.fields.alt = "Zwischenzeitlich manuell geändert";
  } });
  assert.deepEqual((await f.run()).results.map(result => result.status), ["failed", "failed"]);
  assert.equal(f.events.filter(event => event.event === "open").length, 1);
  assert.deepEqual(textInputs(f.events), []); assert.deepEqual(saves(f.events), []);
});

test("abweichende Bildquelle im Feld wird vor Eingabe abgewiesen", async () => {
  const f = fixture({ onOperation({ operation, record }) {
    if (operation === "alt-field") record.fields.sourceUrl = record.image.sourceUrl.replace("image-1", "foreign-image");
  } });
  assert.equal((await f.run()).results[0].status, "failed");
  assert.deepEqual(textInputs(f.events), []); assert.deepEqual(saves(f.events), []);
});

test("Änderung zwischen erstem Feldlesen und Eingabeprüfung wird nicht überschrieben", async () => {
  const f = fixture({ onOperation({ operation, record }) {
    if (operation === "alt-field" && record.altReads === 2) record.fields.alt = "Spätere Nutzeränderung";
  } });
  assert.equal((await f.run()).results[0].status, "failed");
  assert.deepEqual(textInputs(f.events), []); assert.deepEqual(saves(f.events), []);
});

test("Preview- und Topframewechsel während der Feldprüfung verhindern Eingabe und Save", async () => {
  for (const drift of ["driftPreview", "driftTop"]) {
    const f = fixture({ onOperation({ operation, controls }) { if (operation === "alt-field") controls[drift](); } });
    assert.equal((await f.run()).results[0].status, "failed");
    assert.deepEqual(textInputs(f.events), []); assert.deepEqual(saves(f.events), []);
  }
});

test("Framewechsel während des asynchronen Fokussierens verhindert jede nachfolgende Eingabe", async () => {
  const f = fixture({ types: ["block", "auto"], onOperation({ operation, controls }) { if (operation === "focus-alt") controls.driftPreview(); } });
  assert.deepEqual((await f.run()).results.map(result => result.status), ["failed", "failed"]);
  assert.deepEqual(textInputs(f.events), []); assert.deepEqual(saves(f.events), []);
});

test("erneute Freigabeprüfung blockiert veraltete Freigabe direkt vor Eingabe und direkt vor Save", async () => {
  for (const rejectApproval of [2, 3]) {
    const f = fixture({ types: ["auto", "block"], rejectApproval });
    assert.deepEqual((await f.run()).results.map(result => result.status), ["failed", "failed"]);
    assert.equal(f.events.filter(event => event.event === "open").length, 1);
    assert.equal(f.events.filter(event => event.event === "insertText").length, rejectApproval === 2 ? 0 : 1);
    assert.deepEqual(saves(f.events), []);
  }
});

test("mitveränderter Titel, Caption oder Beschreibung wird nach der Eingabe nicht als Erfolg gespeichert", async () => {
  for (const field of ["title", "caption", "description"]) {
    const f = fixture({ types: ["auto", "block"], onInsert({ record }) { record.fields[field] = "Unerwartet mitverändert"; } });
    assert.deepEqual((await f.run()).results.map(result => result.status), ["failed", "failed"]);
    assert.equal(f.events.filter(event => event.event === "insertText").length, 1);
    assert.equal(f.events.filter(event => event.event === "open").length, 1);
    assert.deepEqual(saves(f.events), []);
  }
});

test("unveränderte Bildtexte benötigen weder Eingabe noch Seitenspeicherung", async () => {
  const f = fixture({ types: ["block", "auto"], unchanged: true });
  assert.deepEqual((await f.run()).results.map(result => result.status), ["unchanged", "unchanged"]);
  assert.deepEqual(textInputs(f.events), []); assert.deepEqual(saves(f.events), []);
});

test("bereits automatisch gespeicherter eigener Alttext wird ohne unnötigen Save regulär abgeschlossen", async () => {
  const f=fixture({autoSaved:true});
  assert.equal((await f.run()).results[0].status,'written');
  assert.equal(f.events.filter(event=>event.event==='insertText').length,1);
  assert.deepEqual(saves(f.events),[]);assert.equal(f.events.some(event=>event.event==='exit'),true);
  const changed=fixture({autoSaved:true,onInsert({controls}){controls.driftPreview();}});
  assert.equal((await changed.run()).results[0].status,'failed');assert.deepEqual(saves(changed.events),[]);
});

test("Abbruch vor Start und nach erster Eingabe speichert nichts und beginnt kein nächstes Bild", async () => {
  const before = new AbortController(); before.abort();
  const first = fixture(); await assert.rejects(first.run(before.signal), { name: "AbortError" });
  assert.deepEqual(first.events, []);
  const after = new AbortController(), second = fixture({ types: ["auto", "block"], onInsert() { after.abort(); } });
  await assert.rejects(second.run(after.signal), { name: "AbortError" });
  assert.equal(second.events.filter(event => event.event === "insertText").length, 1);
  assert.equal(second.events.filter(event => event.event === "open").length, 1);
  assert.deepEqual(saves(second.events), []);
});

test("fehlgeschlagener Save oder ausbleibende Speicherbestätigung meldet keinen Erfolg und stoppt die Folge", async () => {
  for (const saveFailure of ["click", "confirmation"]) {
    const f = fixture({ types: ["block", "auto"], saveFailure }), result = await f.run();
    assert.deepEqual(result.results.map(entry => entry.status), ["failed", "failed"]);
    assert.equal(f.events.filter(event => event.event === "insertText").length, 1);
    assert.equal(f.events.filter(event => event.event === "open").length, 1);
    assert.equal(saves(f.events).length, 1);
    assert.equal(f.events.some(event => event.event === "exit"), false);
  }
});
