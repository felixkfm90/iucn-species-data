import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-website-alt-texts.js", import.meta.url), "utf8");
const syncSource = await readFile(new URL("./public/app-website-alt-sync.js", import.meta.url), "utf8");
const pageUrl = "https://www.fnwildlifetravel.de/wildlife/island/fraterculaarctica";
const imageUrl = "https://images.squarespace-cdn.com/content/v1/site/bird.jpg";
const imageKey = "image-a";
const headerLogoUrl = "https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/c043db90-3a2c-478c-a2ff-3d7cdbf6c14d/FN+Wildlife+%26+Travel+Logo+glow.jpg";
const rawLogoText = "FN Wildlife &amp; Travel", visibleLogoText = "FN Wildlife & Travel";
const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const copy = (value) => JSON.parse(JSON.stringify(value));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function seed() {
  return { revision: "revision-1", capabilities: { keepExisting: true }, pages: [{ url: pageUrl, title: "Papageientaucher", checkedAt: "2026-10-28T10:00:00Z", inventoryStatus: "current",
    images: [{ key: imageKey, src: imageUrl, previewSrc: `${imageUrl}?format=750w`, alt: "Papageientaucher auf einem Felsen", caption: "", context: "content",
      kind: "image", altPresent: true, status: "unreviewed", draftText: "", draftDecorative: false, observationHash: "observation-1", approval: null }] }],
  scan: { running: false, coverageNotes: ["Öffentliches HTML; dynamische Bilder gesondert prüfen."] },
  summary: { pages: 1, images: 1, missing: 0, unreviewed: 1, approved: 0, verified: 0 } };
}
function transferSeed(values = {}) {
  const initial = seed(), image = initial.pages[0].images[0];
  image.status = "approved";
  image.approval = { revision: "approval-for-transfer", text: image.alt, decorative: false };
  initial.summary.approved = 1;
  initial.transfer = { available: true, connected: true, windowOpen: true, running: false, status: "ready", message: "Bereit", results: [], ...values };
  return initial;
}
test("Lesemodus öffnet keine Bildtextbearbeitung und startet keine Anfrage", async () => {
  const h = harness({ canEdit: () => false });
  await h.controller.open(); h.openButton.emit("click");
  assert.equal(h.dialog.open, false);
  assert.equal(h.calls.length, 0);
  h.controller.stop();
});

test("Lesemodus sperrt Bildtextaktionen nach dem Öffnen und erhält offene eigene Eingaben", async () => {
  let editing = true;
  const h = harness({ initial: transferSeed(), canEdit: () => editing });
  await h.controller.open(); h.imageEvent(); h.input("Eigener offener Bildtext");
  const before = h.calls.length; editing = false;
  await h.controller.saveDraft(imageKey); await h.controller.approve(imageKey); await h.controller.verify(imageKey);
  await h.controller.discover(); await h.controller.scan(pageUrl); await h.controller.connectTransfer();
  await h.controller.transfer();
  assert.equal(h.calls.length, before);
  assert.equal(h.controller.hasUnsavedDrafts(), true);
  h.controller.stop();
});

test("Wechsel zum Lesemodus während der Übernahmebestätigung verhindert das Schreiben", async () => {
  let editing = true;
  const h = harness({ initial: transferSeed(), canEdit: () => editing }), confirmation = deferred();
  await h.controller.open(); h.setConfirmPending(confirmation);
  const before = h.calls.length, pending = h.controller.transfer();
  await Promise.resolve(); editing = false; confirmation.resolve(true);
  assert.equal(await pending, false);
  assert.equal(h.calls.length, before);
  h.controller.stop();
});

function headerLogoSeed() {
  const initial = seed(), image = initial.pages[0].images[0];
  Object.assign(image, { src: headerLogoUrl, previewSrc: `${headerLogoUrl}?format=750w`, context: "header", status: "approved",
    alt: rawLogoText, caption: rawLogoText, approval: { revision: "raw-logo-approval", text: rawLogoText, decorative: false } });
  initial.summary.approved = 1; return initial;
}
function element() {
  const handlers = new Map();
  return { innerHTML: "", textContent: "", className: "", hidden: false, disabled: false, value: "", checked: false,
    dataset: {}, open: false, attributes: {}, children: [], classList: { add() {} },
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } },
    replaceChildren(...children) { this.children = []; this.append(...children); },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((item) => item !== this); },
    addEventListener(type, fn) { handlers.set(type, [...(handlers.get(type) || []), fn]); },
    removeEventListener(type, fn) { handlers.set(type, (handlers.get(type) || []).filter((handler) => handler !== fn)); },
    emit(type, fields = {}) { const event = { type, target: this, ...fields }; for (const fn of handlers.get(type) || []) fn(event); },
    setAttribute(name, value) { this.attributes[name] = value; }, getAttribute(name) { return this.attributes[name] ?? null; },
    querySelectorAll() { return []; }, contains() { return true; }, focus() { this.focused = true; },
  };
}
function harness({ initial = seed(), fetch, confirm = true, now, bootstrap = false, openImageSuggestion, canEdit, sharedTextsController, sharedFactory, actualShared = false } = {}) {
  let stored = copy(initial), version = 1;
  const dialog = element(), openButton = element(), nodes = new Map(), timers = new Map(), calls = [], confirmations = [];
  let nextTimer = 0, dialogOptions, confirmPending;
  for (const name of ["message", "summary", "coverage", "pages", "page", "search", "filter", "connection", "transfer", "counts", "scan-status", "transfer-details", "transfer-summary"]) nodes.set(`[data-alt-${name}]`, element());
  dialog.querySelector = (selector) => nodes.get(selector);
  const windowHandlers = new Map();
  const body = element();
  const context = vm.createContext({ URL, AbortController, document: { body, createElement: () => element(), querySelector: (selector) => selector === "#website-alt-texts-dialog" ? dialog : openButton },
    SpeciesExplorerWebsiteAltSync: sharedFactory ? { createWebsiteAltSyncController: sharedFactory } : undefined,
    addEventListener: (name, handler) => windowHandlers.set(name, handler),
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; }, clearTimeout: (id) => timers.delete(id) });
  new vm.Script(source).runInContext(context);
  if (actualShared) new vm.Script(syncSource).runInContext(context);
  const api = context.SpeciesExplorerWebsiteAltTexts;
  const controller = (bootstrap ? api.setupWebsiteAltTexts : api.createWebsiteAltTextsController)({ dialog, openButton, escapeHtml,
    ...(now ? { now } : {}),
    openImageSuggestion, canEdit, sharedTextsController,
    createDialogController(options) {
      dialogOptions = options;
      return { open() { options.dialog.open = true; }, isOpen() { return options.dialog.open; },
        close() { if (options.beforeClose?.() === false) return false; options.dialog.open = false; options.afterClose?.(); return true; }, destroy() {} };
    },
    confirmAction: async (options) => { confirmations.push(options); return confirmPending ? confirmPending.promise : confirm; },
    fetchJson: async (url, options) => {
      const call = { url, method: options?.method || "GET", body: options?.body ? JSON.parse(options.body) : null };
      calls.push(call);
      if (fetch) { const result = await fetch(call, { stored, setStored: (value) => { stored = copy(value); } }); if (result !== undefined) return result; }
      if (call.method === "POST") {
        if (url.endsWith("/scan")) stored.scan.running = true;
        const image = stored.pages.find((page) => page.url === call.body.pageUrl)?.images.find((entry) => entry.key === call.body.imageKey);
        if (url.endsWith("/draft")) { image.draftText = call.body.text; image.draftDecorative = call.body.decorative; image.status = "draft"; }
        if (url.endsWith("/approve")) {
          image.draftText = call.body.text; image.draftDecorative = call.body.decorative; image.draftSavedAt = "2026-10-28T10:01:00Z";
          image.status = "approved"; image.approval = { revision: "approval-bound-1", text: call.body.text, decorative: call.body.decorative, approvedAt: "2026-10-28T10:01:00Z" };
          stored.summary.approved = 1;
        }
        if (url.endsWith("/verify")) { image.status = "verified"; image.verification = { checkedAt: "2026-10-28T10:02:00Z" }; stored.summary.verified = 1; stored.summary.approved = 0; }
        if (url.endsWith("/keep-existing")) {
          image.draftText = image.alt; image.draftDecorative = call.body.decorative; image.status = "verified";
          image.approval = { revision: "kept-approval", text: image.alt, decorative: call.body.decorative };
          image.verification = { checkedAt: "2026-11-01T10:02:00Z", method: "public-html", approvalRevision: image.approval.revision, observationHash: image.observationHash };
          stored.summary.verified = 1; stored.summary.approved = 0;
        }
        stored.revision = `revision-${++version}`;
      }
      return copy(stored);
    } });
  function input(text, key = imageKey) { dialog.emit("input", { target: { dataset: { altText: key }, value: text } }); }
  function decorate(checked = true) { dialog.emit("change", { target: { dataset: { altDecorative: imageKey }, checked } }); }
  function imageEvent(type = "load", src = `${imageUrl}?format=750w`) { dialog.emit(type, { target: { dataset: { altPreview: imageKey }, getAttribute: () => src } }); }
  function click(action, key) { dialog.emit("click", { target: { closest: (selector) => selector === "[data-alt-action]" ? { dataset: { altAction: action, altKey: key } } : null } }); }
  return { api, controller, dialog, body, openButton, nodes, timers, calls, confirmations, input, decorate, imageEvent, click, windowHandlers,
    replace(value) { stored = copy(value); }, nativeClose() { dialog.open = false; dialogOptions.afterClose(); },
    requestClose() { return dialogOptions.beforeClose(); }, setConfirmPending(value) { confirmPending = value; } };
}

test("composition bootstrap binds the real dialog entry and releases its timers on page unload", async () => {
  const h = harness({ bootstrap: true });
  await h.controller.open();
  assert.equal(h.dialog.open, true);
  assert.ok(h.timers.size > 0);
  assert.equal(h.windowHandlers.has("beforeunload"), false, "Ein abgebrochener Schließversuch zerstört keine Eingaben oder Timer");
  h.windowHandlers.get("pagehide")();
  assert.equal(h.timers.size, 0);
  const calls = h.calls.length;
  h.openButton.emit("click");
  await h.controller.refresh();
  assert.equal(h.calls.length, calls);
});

function sharedTextsFixture() {
  const state = { open: false, busy: false, stopped: false, input: null, opens: 0 };
  const controller = {
    getState: () => state, hasUnsavedChanges: () => state.busy,
    async openForPage(input) { state.input = input; state.opens++; state.open = true; return true; },
    close() { if (state.busy) return false; state.open = false; state.input?.onClosed?.(); return true; },
    stop() { state.open = false; state.stopped = true; },
  };
  return { state, controller };
}

test("gemeinsamer Bildtextvergleich öffnet die konkrete gespeicherte Seite ohne Schreibauftrag oder CMS-Übernahme", async () => {
  const shared = sharedTextsFixture(), h = harness({ sharedTextsController: shared.controller }); await h.controller.open();
  const before = h.calls.length;
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Bildtexte gemeinsam abgleichen/);
  assert.equal(await h.controller.openSharedTexts(), true);
  assert.equal(shared.state.input.pageUrl, pageUrl); assert.equal(shared.state.input.title, "Papageientaucher");
  assert.equal(shared.state.input.isCurrent({ pageUrl }), true);
  assert.equal(shared.state.input.isCurrent({ pageUrl: `${pageUrl}/andere` }), false);
  assert.equal(shared.state.input.hasUnsavedChanges(), false); assert.equal(h.calls.length, before);
  assert.equal(h.controller.hasUnsavedDrafts(), false);
});

test("gemeinsamer Vergleich verlangt gespeicherte Eingaben, aktuelle Bildgrundlage und Bearbeitungsmodus", async () => {
  for (const blocked of ["dirty", "read-mode", "scan", "transfer", "redirect", "old-inventory", "unscanned", "error"]) {
    const shared = sharedTextsFixture(), initial = seed(); let editing = true;
    const h = harness({ initial, canEdit: () => editing, sharedTextsController: shared.controller }); await h.controller.open();
    if (blocked === "dirty") h.input("Menschliche offene Änderung");
    else if (blocked === "read-mode") editing = false;
    else {
      const next = copy(h.controller.snapshot());
      if (blocked === "scan") next.scan.running = true;
      if (blocked === "transfer") next.transfer = { running: true };
      if (blocked === "redirect") next.pages[0].redirectUrl = `${pageUrl}/ziel`;
      if (blocked === "old-inventory") next.pages[0].inventoryStatus = "stale";
      if (blocked === "unscanned") next.pages[0].checkedAt = null;
      if (blocked === "error") next.pages[0].error = "Nicht erreichbar";
      h.replace(next); await h.controller.refresh();
    }
    assert.equal(await h.controller.openSharedTexts(), false, blocked); assert.equal(shared.state.opens, 0, blocked);
    if (blocked === "dirty") assert.equal(h.controller.hasUnsavedDrafts(), true);
  }
});

test("gemeinsamer Vergleich sperrt konkurrierende lokale Schreibschritte und wird beim Schließen berücksichtigt", async () => {
  const shared = sharedTextsFixture(), h = harness({ initial: transferSeed(), sharedTextsController: shared.controller });
  await h.controller.open(); h.imageEvent(); await h.controller.openSharedTexts(); const before = h.calls.length;
  await h.controller.saveDraft(imageKey); await h.controller.approve(imageKey); await h.controller.verify(imageKey);
  await h.controller.transfer(); await h.controller.scan(pageUrl); await h.controller.discover(); await h.controller.connectTransfer();
  assert.equal(h.calls.length, before);
  shared.state.busy = true;
  assert.equal(h.controller.hasUnsavedDrafts(), true); assert.equal(h.requestClose(), false);
  shared.state.busy = false; assert.equal(h.requestClose(), true); assert.equal(shared.state.open, false);
  assert.doesNotMatch(h.nodes.get("[data-alt-page]").innerHTML, /data-alt-action="transfer" disabled/);
});

test("erst bestätigte gemeinsame Übernahme lädt die lokale Anzeige; nachlaufende eigene Eingaben bleiben erhalten", async () => {
  const shared = sharedTextsFixture(), h = harness({ sharedTextsController: shared.controller }); await h.controller.open(); await h.controller.openSharedTexts();
  const imported = copy(h.controller.snapshot()); imported.revision = "imported-revision";
  imported.pages[0].images[0].draftText = "Gemeinsam übernommener Text"; imported.pages[0].images[0].status = "draft";
  h.replace(imported); assert.equal(await shared.state.input.onImported({ pageUrl, localRevision: "imported-revision" }), true);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Gemeinsam übernommener Text/);
  assert.equal(h.calls.at(-1).method, "GET"); assert.equal(shared.state.input.isCurrent(), true, "Die quittierte lokale Fassung ist jetzt die neue Vergleichsgrundlage");
  shared.controller.close(); await h.controller.openSharedTexts(); h.input("Meine inzwischen offene Fassung"); const before = h.calls.length;
  assert.equal(await shared.state.input.onImported({ pageUrl }), false); assert.equal(h.calls.length, before);
  assert.equal(h.controller.hasUnsavedDrafts(), true); await h.controller.refresh();
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Meine inzwischen offene Fassung/);
});

test("andere Seiten entwerten den Vergleich nicht; neue gewählte Seitenfassung und Lesemodus stoppen ihn", async () => {
  const shared = sharedTextsFixture(); let editing = true;
  const h = harness({ canEdit: () => editing, sharedTextsController: shared.controller }); await h.controller.open(); await h.controller.openSharedTexts();
  const next = copy(h.controller.snapshot()); next.revision = "unrelated-global-version";
  next.pages.push({ ...copy(next.pages[0]), url: `${pageUrl}/andere`, title: "Andere Seite" }); h.replace(next); await h.controller.refresh();
  assert.equal(shared.state.input.isCurrent(), true);
  editing = false; assert.equal(shared.state.input.isCurrent(), false); editing = true;
  next.pages[0].images[0].alt = "Neue Beobachtung"; h.replace(next); await h.controller.refresh(); assert.equal(shared.state.input.isCurrent(), false);
});

test("normaler Bootstrap verdrahtet Vergleich, Lesemodus und Entladeabschluss ohne größere Kompositionswurzel", async () => {
  const shared = sharedTextsFixture(); let factoryOptions, editing = true;
  const h = harness({ bootstrap: true, canEdit: () => editing, sharedFactory: (options) => { factoryOptions = options; return shared.controller; } });
  assert.equal(factoryOptions.canEdit(), true); editing = false; assert.equal(factoryOptions.canEdit(), false); editing = true;
  assert.equal(factoryOptions.safeImageUrl(imageUrl), imageUrl);
  await h.controller.open(); await h.controller.openSharedTexts(); h.windowHandlers.get("pagehide")();
  assert.equal(shared.state.stopped, true); assert.equal(shared.state.input.isCurrent(), false); assert.equal(h.timers.size, 0);
});

test("echter Haupt- und Vergleichscontroller übernehmen eine quittierte Fassung und halten Squarespace getrennt", async () => {
  const base = "/api/website/alt-texts/shared", initial = seed();
  const remotePage = copy(initial.pages[0]); Object.assign(remotePage.images[0], { status: "draft", draftText: "Gemeinsamer freigegebener Entwurf" });
  const permissions = { canRead: true, canEdit: true, canApprove: true, canCreate: true };
  let imported = false;
  const h = harness({ initial, bootstrap: true, actualShared: true, fetch(call, store) {
    if (!call.url.startsWith(base)) return;
    if (call.url === base) return { available: true, busy: false, permissions, binding: { origin: "https://project.example.org", projectId: "fixture-project", userId: "fixture-user" } };
    if (call.url.startsWith(`${base}/page?`)) return { pageUrl, pageRevision: imported ? "b".repeat(64) : "a".repeat(64), linked: true,
      page: copy(store.stored.pages[0]), state: imported ? "linked" : "pulled", permissions,
      remote: { id: "fixture-page", revision: "server-revision", data: { page: copy(remotePage) } } };
    if (call.url.startsWith(`${base}/conflicts?`)) return { conflicts: [] };
    if (call.url === `${base}/import`) {
      const next = copy(store.stored); next.revision = "confirmed-local-import"; next.pages[0] = copy(remotePage); store.setStored(next); imported = true;
      return { imported: true, pageRevision: "b".repeat(64), localRevision: next.revision };
    }
    throw new Error(`Unexpected shared route: ${call.url}`);
  } });
  await h.controller.open(); const baseline = h.calls.length;
  assert.equal(await h.controller.openSharedTexts(), true);
  assert.ok(h.calls.slice(baseline).every((call) => call.method === "GET"));
  const descendants = (node) => [node, ...node.children.flatMap(descendants)];
  const take = descendants(h.body).find((node) => node.textContent === "Geladene Fassung auf diesem PC übernehmen");
  assert.ok(take); take.emit("click");
  for (let i = 0; i < 12; i++) await new Promise(setImmediate);
  assert.equal(imported, true); assert.equal(h.controller.snapshot().revision, "confirmed-local-import");
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Gemeinsamer freigegebener Entwurf/);
  assert.deepEqual(h.calls.slice(baseline).filter((call) => call.method === "POST").map((call) => call.url), [`${base}/import`]);
  assert.equal(h.controller.hasUnsavedDrafts(), false); h.controller.stop(); assert.equal(h.body.children.length, 0);
});

test("Desktop-HTML lädt den gemeinsamen Vergleich vor der Kompositionswurzel", async () => {
  const html = await readFile(new URL("./public/index.html", import.meta.url), "utf8");
  assert.match(html, /<link rel="stylesheet" href="\/website-alt-sync\.css">/);
  assert.ok(html.indexOf('src="/app-website-alt-texts.js"') < html.indexOf('src="/app-website-alt-sync.js"'));
  assert.ok(html.indexOf('src="/app-website-alt-sync.js"') < html.indexOf('src="/app.js"'));
});

test("remote preview accepts only the known image hosts and the own Pages subtree", () => {
  const h = harness();
  assert.equal(h.api.safeImageUrl(`${imageUrl}?format=750w`), `${imageUrl}?format=750w`);
  assert.equal(h.api.safeImageUrl("https://felixkfm90.github.io/iucn-species-data/species-assets/test/portrait.webp"), "https://felixkfm90.github.io/iucn-species-data/species-assets/test/portrait.webp");
  for (const bad of ["javascript:alert(1)", "data:image/svg+xml,bad", "http://images.squarespace-cdn.com/a.jpg", "https://localhost/a.jpg",
    "https://images.squarespace-cdn.com.evil.example/a.jpg", "https://u:p@images.squarespace-cdn.com/a.jpg", "https://felixkfm90.github.io/another-project/a.jpg", "https://images.squarespace-cdn.com:444/a.jpg"]) {
    assert.equal(h.api.safeImageUrl(bad), "", bad);
  }
  assert.equal(h.api.safePageUrl(pageUrl), pageUrl);
  assert.equal(h.api.safePageUrl("https://www.fnwildlifetravel.de@evil.example/page"), "");
});

test("lokale Bildtexthilfe öffnet nur das konkrete Bild und übernimmt erst einen ungespeicherten Entwurf", async () => {
  let selection;
  const h = harness({ openImageSuggestion: async (input) => { selection = input; return true; } });
  await h.controller.open(); h.imageEvent();
  const before = copy(h.controller.snapshot()), count = h.calls.length;
  assert.equal(await h.controller.suggestImage(imageKey), true);
  assert.equal(selection.pageUrl, pageUrl); assert.equal(selection.imageKey, imageKey);
  assert.equal(selection.observationHash, "observation-1");
  assert.equal(selection.initialText, before.pages[0].images[0].alt);
  assert.equal(h.calls.length, count, "Der Anschluss startet keinen zusätzlichen Speicher-/Freigabe-/CMSauftrag");
  assert.equal(selection.isCurrent(), true);
  assert.equal(selection.applyProposal("Papageientaucher steht vor einer Felswand.", null), true);
  assert.equal(h.controller.hasUnsavedDrafts(), true);
  assert.deepEqual(copy(h.controller.snapshot()), before);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Papageientaucher steht vor einer Felswand\./);
  assert.match(h.nodes.get("[data-alt-message]").textContent, /noch nicht freigegeben/);
  assert.equal(h.calls.length, count);
  await h.controller.saveDraft(imageKey);
  assert.equal(h.calls.at(-1).url.endsWith("/draft"), true);
  assert.equal(h.calls.at(-1).body.text, "Papageientaucher steht vor einer Felswand.");
});

test("lokaler Vorschlag bewahrt eingegebenen Reise-Text exakt und verlangt die passende Captionkopplung", async () => {
  let selection; const initial = seed(); initial.pages[0].url = "https://www.fnwildlifetravel.de/reisen/2019-griechenland/olympia";
  initial.pages[0].images[0].textCoupled = true;
  const h = harness({ initial, openImageSuggestion: async (input) => { selection = input; return true; } });
  await h.controller.open(); h.imageEvent(); await h.controller.suggestImage(imageKey);
  assert.equal(selection.applyProposal("Säulen vor einem blühenden Baum", null), false);
  assert.equal(selection.applyProposal("Säulen vor einem blühenden Baum", "Anderer Text"), false);
  assert.equal(selection.applyProposal("Säulen vor einem blühenden Baum", "Säulen vor einem blühenden Baum"), true);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, />Säulen vor einem blühenden Baum<\/textarea>/);
});

test("zwischenzeitlicher menschlicher Text, fremde Bildbindung und neue Freigabe sperren die Vorschlagsübernahme", async () => {
  for (const drift of ["input", "observation", "approval", "reopen", "foreign-binding"]) {
    let selection; const h = harness({ openImageSuggestion: async (input) => { selection = input; return true; } });
    await h.controller.open(); h.imageEvent(); await h.controller.suggestImage(imageKey);
    if (drift === "input") h.input("Mein zwischenzeitlicher Text");
    else if (drift === "reopen") { h.nativeClose(); await h.controller.open(); }
    else if (drift === "foreign-binding") {
      assert.equal(selection.isCurrent({ pageUrl: `${pageUrl}/fremd`, imageKey, revision: "observation-1" }), false);
      assert.equal(selection.isCurrent({ pageUrl, imageKey: "fremdes-bild", revision: "observation-1" }), false);
      assert.equal(selection.isCurrent({ pageUrl, imageKey, revision: "fremde-beobachtung" }), false);
      continue;
    } else {
      const changed = seed(); changed.revision = "revision-2";
      if (drift === "observation") changed.pages[0].images[0].observationHash = "changed-observation";
      else changed.pages[0].images[0].approval = { revision: "changed-approval", text: "Fremder Text" };
      h.replace(changed); await h.controller.refresh();
    }
    assert.equal(selection.isCurrent(), false, drift);
    assert.equal(selection.applyProposal("Alter Vorschlag", null), false, drift);
    if (drift === "input") assert.equal(h.controller.hasUnsavedDrafts(), true);
    assert.doesNotMatch(h.nodes.get("[data-alt-page]").innerHTML, />Alter Vorschlag<\/textarea>/);
  }
});

test("Bildtexthilfe benötigt eine geladene aktuelle Inhaltsbildvorschau und bleibt für dekorative und erzeugte Bilder aus", async () => {
  let opened = 0; const h = harness({ openImageSuggestion: async () => { opened++; } });
  await h.controller.open();
  assert.equal(await h.controller.suggestImage(imageKey), false);
  h.imageEvent(); h.decorate();
  assert.equal(await h.controller.suggestImage(imageKey), false);
  assert.equal(opened, 0);
  for (const change of [{ context: "header" }, { kind: "background" }, { src: "https://felixkfm90.github.io/iucn-species-data/species-assets/test/portrait.webp" }]) {
    const html = h.api.renderAltImageCard({ ...seed().pages[0].images[0], ...change }, { escapeHtml, loaded: true, suggestionAvailable: true });
    assert.doesNotMatch(html, /data-alt-action="suggest"/);
  }
  for (const text of ["", " ", "x".repeat(2001), "unerlaubt\u0000"]) {
    let selection; const current = harness({ openImageSuggestion: async (input) => { selection = input; } });
    await current.controller.open(); current.imageEvent(); await current.controller.suggestImage(imageKey);
    assert.equal(selection.applyProposal(text, null), false);
  }
});

test("doppeltes Öffnen während der Bildtexthilfe-Anfrage erzeugt keinen zweiten Anschluss", async () => {
  const pending = deferred(); let opened = 0;
  const h = harness({ openImageSuggestion: async () => { opened++; await pending.promise; return true; } });
  await h.controller.open(); h.imageEvent(); const first = h.controller.suggestImage(imageKey);
  assert.equal(await h.controller.suggestImage(imageKey), false); assert.equal(opened, 1);
  pending.resolve(); assert.equal(await first, true);
});

test("image card escapes untrusted text, loads a remote preview and never equates a release with adoption", () => {
  const h = harness(), image = seed().pages[0].images[0];
  image.key = '\"><img onerror="bad">'; image.alt = "<script>bad()</script>"; image.caption = "<svg onload=bad>";
  image.draftNote = "<img onerror=bad>Beschriftung gemeinsam prüfen";
  image.status = "approved"; image.approval = { revision: "release", text: "<b>Freigegeben</b>" };
  const html = h.api.renderAltImageCard(image, { escapeHtml, loaded: true });
  assert.doesNotMatch(html, /<script>|<svg|<b>Freigegeben/);
  assert.match(html, /&lt;script&gt;/); assert.match(html, /format=750w/); assert.match(html, /referrerpolicy="no-referrer"/);
  assert.match(html, /Freigegeben · Übernahme offen/); assert.match(html, /Eintragung ist noch nicht bestätigt/);
  assert.doesNotMatch(html, /data-alt-action="(?:publish|cms|adopt)"/);
  assert.match(html, /Prüfhinweis zum Entwurf/);
  assert.match(html, /&lt;img onerror=bad&gt;Beschriftung/);
});

test("the known header logo displays its observed entity as an ampersand without changing the raw image", () => {
  const h = harness(), image = headerLogoSeed().pages[0].images[0], before = copy(image);
  const html = h.api.renderAltImageCard(image, { escapeHtml });
  assert.equal((html.match(/FN Wildlife &amp; Travel/g) || []).length, 4);
  assert.doesNotMatch(html, /FN Wildlife &amp;amp; Travel/);
  assert.deepEqual(image, before);
});

test("logo display normalization is narrowly bound and cannot decode other text, nested entities, or injected HTML", () => {
  const h = harness(), logo = headerLogoSeed().pages[0].images[0];
  for (const change of [{ context: "content" }, { src: imageUrl }, { kind: "background" }]) {
    const html = h.api.renderAltImageCard({ ...logo, ...change }, { escapeHtml });
    assert.match(html, /FN Wildlife &amp;amp; Travel/);
  }
  const nested = h.api.renderAltImageCard({ ...logo, alt: "FN Wildlife &amp;amp; Travel", caption: "&lt;script&gt;bad()&lt;/script&gt;",
    approval: { ...logo.approval, text: '<img src=x onerror="bad()">' } }, { escapeHtml });
  assert.match(nested, /FN Wildlife &amp;amp;amp; Travel/);
  assert.match(nested, /&amp;lt;script&amp;gt;/);
  assert.match(nested, /&lt;img src=x onerror=&quot;bad\(\)&quot;&gt;/);
  assert.doesNotMatch(nested, /<script>|<img src=x/);
});

test("unchanged visible logo text keeps raw identity when loaded, refreshed, saved, approved, or publicly checked", async () => {
  for (const action of ["saveDraft", "approve", "verify"]) {
    const h = harness({ initial: headerLogoSeed() }); await h.controller.open();
    assert.equal(h.calls.filter((call) => /\/(draft|approve|verify|transfer)$/.test(call.url)).length, 0);
    h.input(visibleLogoText); await h.controller.refresh();
    assert.equal(h.requestClose(), true, action);
    const before = h.controller.snapshot().pages[0].images[0];
    assert.equal(before.alt, rawLogoText); assert.equal(before.caption, rawLogoText);
    assert.equal(before.approval.text, rawLogoText); assert.equal(before.approval.revision, "raw-logo-approval");
    h.imageEvent("load", `${headerLogoUrl}?format=750w`);
    assert.equal(await h.controller[action](imageKey), true, action);
    if (action === "verify") {
      assert.equal(h.calls.at(-1).body.approvalRevision, "raw-logo-approval");
      assert.equal(Object.hasOwn(h.calls.at(-1).body, "text"), false);
    } else assert.equal(h.calls.at(-1).body.text, rawLogoText, action);
  }
});

test("real logo edits and decorative toggling retain the user's actual text across a render", async () => {
  for (const text of ["FN Wildlife & Travel · Fotografie", rawLogoText]) {
    const h = harness({ initial: headerLogoSeed() }); await h.controller.open();
    h.input(text); h.decorate(true); h.decorate(false); await h.controller.refresh();
    assert.equal(h.requestClose(), false);
    assert.ok(h.nodes.get("[data-alt-page]").innerHTML.includes(`data-alt-text="${imageKey}">${escapeHtml(text)}</textarea>`));
    assert.equal(h.controller.snapshot().pages[0].images[0].alt, rawLogoText);
    await h.controller.saveDraft(imageKey);
    assert.equal(h.calls.at(-1).body.text, text);
    assert.equal(h.calls.at(-1).body.decorative, false);
  }
});

test("prepared drafts and editorial questions remain visible and can be filtered separately", async () => {
  const initial = seed();
  initial.pages[0].images[0].status = "draft";
  initial.pages[0].images[0].draftNote = "Bildunterschrift gemeinsam prüfen";
  initial.summary.draft = 1;
  initial.pages.push({ ...copy(initial.pages[0]), url: "https://www.fnwildlifetravel.de/about", title: "Andere Seite", images: [] });
  const h = harness({ initial }); await h.controller.open();
  assert.match(h.nodes.get("[data-alt-summary]").textContent, /1 Entwürfe zur Abnahme/);
  assert.match(h.nodes.get("[data-alt-pages]").innerHTML, /1 Entwürfe/);
  const filter = h.nodes.get("[data-alt-filter]");
  for (const value of ["draft", "notes"]) {
    filter.value = value; h.dialog.emit("change", { target: filter });
    assert.match(h.nodes.get("[data-alt-pages]").innerHTML, /Papageientaucher/);
    assert.doesNotMatch(h.nodes.get("[data-alt-pages]").innerHTML, /Andere Seite/);
  }
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Bildunterschrift gemeinsam prüfen/);
});

test("automatic functional graphics describe their real text destination instead of claiming a CMS transfer", () => {
  const h = harness(), image = seed().pages[0].images[0];
  image.src = "https://felixkfm90.github.io/iucn-species-data/species-assets/Papageientaucher/spectrogram.webp";
  image.previewSrc = image.src; image.status = "approved";
  image.approval = { text: "", decorative: true, revision: "approved" };
  const html = h.api.renderAltImageCard(image, { escapeHtml, loaded: true });
  assert.match(html, /automatisch von der Website erzeugt/);
  assert.match(html, /automatische öffentliche Ausgabe ist noch zu prüfen/);
  assert.doesNotMatch(html, /über Squarespace/);
});

test("website standards identify automatic public proof only when the backend confirms the full verified state", () => {
  const h = harness();
  for (const [context, kind, text] of [["header", "image", "FN Wildlife & Travel"], ["footer", "image", ""], ["content", "background", ""]]) {
    const image = { ...seed().pages[0].images[0], context, kind, status: "verified", alt: text,
      approval: { revision: "standard-approval", method: "website-standard", text, decorative: !text },
      verification: { method: "public-html", automatic: true, approvalRevision: "standard-approval" } };
    const html = h.api.renderAltImageCard(image, { escapeHtml });
    assert.match(html, /data-status="verified">Automatisch öffentlich geprüft/);
    assert.match(html, /Website-Standard/);
    assert.match(h.api.renderAltImageCard({ ...image, approval: { ...image.approval, method: "manual" } }, { escapeHtml }), /Automatisch öffentlich geprüft/);
    for (const incomplete of [{ status: "approved" }, { status: "changed" }, { verification: null },
      { verification: { method: "public-html", automatic: false } }, { verification: { method: "manual", automatic: true } }]) {
      const pending = h.api.renderAltImageCard({ ...image, ...incomplete }, { escapeHtml });
      assert.doesNotMatch(pending, /Automatisch öffentlich geprüft/);
      assert.match(pending, new RegExp(`data-status="${incomplete.status || image.status}"`));
    }
  }
});

test("the raw empty-text count explicitly includes confirmed decorative images instead of implying open work", async () => {
  const initial = seed(), image = initial.pages[0].images[0];
  Object.assign(image, { status: "verified", alt: "", approval: { revision: "decorative", text: "", decorative: true },
    verification: { method: "public-html", automatic: true } });
  Object.assign(initial.summary, { publicMissing: 1, missing: 0, unreviewed: 0, verified: 1 });
  const h = harness({ initial }); await h.controller.open();
  const summary = h.nodes.get("[data-alt-summary]").textContent;
  assert.match(summary, /1 leere oder dateinamenartige Website-Texte \(einschließlich dekorativer Bilder\)/);
  assert.match(summary, /0 Freigaben zur Übernahme offen · 1 öffentlich bestätigt/);
  assert.equal(h.controller.snapshot().summary.publicMissing, 1);
  h.nodes.get("[data-alt-filter]").value = "open";
  h.dialog.emit("change", { target: h.nodes.get("[data-alt-filter]") });
  assert.match(h.nodes.get("[data-alt-pages]").innerHTML, /Keine Seiten für diese Auswahl/);
});

test("opening loads stored work and cheap discovery but never starts a full crawl or CMS action", async () => {
  const h = harness(); await h.controller.open();
  assert.deepEqual(h.calls.map(({ url, method }) => [url, method]), [["/api/website/alt-texts", "GET"], ["/api/website/alt-texts/discover", "POST"]]);
  assert.match(h.nodes.get("[data-alt-pages]").innerHTML, /Papageientaucher/);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Papageientaucher auf einem Felsen/);
  assert.match(h.nodes.get("[data-alt-coverage]").textContent, /dynamische Bilder/);
  assert.ok([...h.timers.values()].some((timer) => timer.delay === 300000));
});

test("an existing website text can be approved unchanged after its actual preview loads", async () => {
  const h = harness(); await h.controller.open();
  assert.equal(await h.controller.approve(imageKey), false);
  assert.equal(h.calls.filter((call) => call.url.endsWith("/approve")).length, 0);
  h.imageEvent(); await h.controller.approve(imageKey);
  const release = h.calls.find((call) => call.url.endsWith("/approve"));
  assert.equal(release.body.text, "Papageientaucher auf einem Felsen");
  assert.equal(release.body.decorative, false); assert.equal(release.body.pageUrl, pageUrl); assert.equal(release.body.imageKey, imageKey);
  assert.equal(h.controller.snapshot().pages[0].images[0].status, "approved");
  assert.equal(h.calls.filter((call) => call.url.endsWith("/verify")).length, 0);
});

test("Text freigeben speichert den geänderten Entwurf direkt ohne vorherigen Speicheraufruf", async () => {
  const h=harness();await h.controller.open();h.imageEvent();h.input('Mein geprüfter neuer Text');
  assert.equal(await h.controller.approve(imageKey),true);
  assert.equal(h.calls.filter(call=>call.url.endsWith('/draft')).length,0);
  assert.equal(h.calls.filter(call=>call.url.endsWith('/approve')).length,1);
  assert.equal(h.controller.snapshot().pages[0].images[0].draftText,'Mein geprüfter neuer Text');
  assert.equal(h.controller.snapshot().pages[0].images[0].approval.text,'Mein geprüfter neuer Text');
  assert.equal(h.controller.hasUnsavedDrafts(),false);await h.controller.refresh();
  assert.equal(h.controller.snapshot().pages[0].images[0].draftText,'Mein geprüfter neuer Text');
});

test("Entwurf speichern steht bei weiteren Aktionen und Freigeben erklärt das Mitspeichern", async () => {
  const h=harness();await h.controller.open();
  const html=h.nodes.get('[data-alt-page]').innerHTML;
  assert.ok(html.indexOf('Weitere Aktionen und Hinweise')<html.indexOf('data-alt-action="draft"'));
  assert.match(html,/data-alt-action="approve"[^>]*title="[^"]*speichert/i);
});

test("offene Eingabe benennt das genaue Bild und bleibt auch bei geschlossenem Texteditor sichtbar", async () => {
  const initial=transferSeed();const first=initial.pages[0].images[0];
  initial.pages[0].images.unshift({...copy(first),key:'logo',status:'verified'}, {...copy(first),key:'background',status:'verified'}, {...copy(first),key:'first-photo'});
  const h=harness({initial});await h.controller.open();h.input('Meine Korrektur');await h.controller.refresh();
  const html=h.nodes.get('[data-alt-page]').innerHTML;
  assert.match(html,/Ungespeicherte Eingabe bei Bild 4/);assert.match(html,/data-alt-action="show-unsaved"/);
  assert.match(html,/data-alt-unsaved="image-a"[^>]*>Ungespeicherte Änderung/);
  assert.equal(await h.controller.transfer(),false);assert.equal(h.controller.hasUnsavedDrafts(),true);
});

test("eine offene Eingabe auf einer anderen Seite wird mit ihrer Seite benannt und gezielt wieder geöffnet", async () => {
  const initial=transferSeed(), otherUrl='https://www.fnwildlifetravel.de/about';
  initial.pages.push({...copy(initial.pages[0]),url:otherUrl,title:'Über uns'});
  const h=harness({initial,now:()=>Date.parse('2026-10-28T10:00:00Z')});await h.controller.open();h.input('Noch offen');await h.controller.selectPage(otherUrl);
  assert.match(h.nodes.get('[data-alt-page]').innerHTML,/Ungespeicherte Eingabe bei Bild 1 auf/);
  assert.match(h.nodes.get('[data-alt-page]').innerHTML,/Papageientaucher/);
  await h.controller.showUnsaved();assert.match(h.nodes.get('[data-alt-page]').innerHTML,/Noch offen/);
  assert.match(h.nodes.get('[data-alt-page]').innerHTML,/Papageientaucher/);assert.equal(h.controller.hasUnsavedDrafts(),true);
});

test("frisch bestätigter gleicher gespeicherter Text entfernt eine überholte lokale Änderungsmarkierung", async () => {
  const h=harness();await h.controller.open();h.input('Bereits gespeichert');
  const fresh=seed();fresh.revision='extern-gespeichert';Object.assign(fresh.pages[0].images[0],{status:'draft',draftText:'Bereits gespeichert',draftSavedAt:'2026-10-28T10:01:00Z'});
  h.replace(fresh);await h.controller.refresh();assert.equal(h.controller.hasUnsavedDrafts(),false);
  assert.doesNotMatch(h.nodes.get('[data-alt-page]').innerHTML,/Ungespeicherte Eingabe bei/);
});

test("an uncaptioned gallery copy does not block the same image with one meaningful caption", async () => {
  const initial = seed(); initial.pages[0].images[0].caption = "Auf dem Felsen";
  initial.pages[0].images[0].captionVariants = ["Auf dem Felsen", ""];
  const h = harness({ initial }); await h.controller.open(); h.imageEvent();
  assert.equal(await h.controller.approve(imageKey), true);
  assert.equal(h.calls.filter((call) => call.url.endsWith("/approve")).length, 1);
});

test("draft, release and public verification send their own exact bound scopes", async () => {
  const h = harness(); await h.controller.open(); h.input("Papageientaucher vor dem Meer");
  await h.controller.saveDraft(imageKey);
  const saved = h.calls.at(-1); assert.match(saved.url, /\/draft$/);
  assert.deepEqual(saved.body, { revision: "revision-2", pageUrl, imageKey, text: "Papageientaucher vor dem Meer", decorative: false });
  h.imageEvent(); await h.controller.approve(imageKey);
  assert.match(h.calls.at(-1).url, /\/approve$/); assert.equal(h.calls.at(-1).body.text, saved.body.text);
  await h.controller.verify(imageKey);
  assert.deepEqual(h.calls.at(-1).body, { revision: "revision-4", pageUrl, imageKey, approvalRevision: "approval-bound-1" });
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Öffentlich bestätigt/);
});

test("intentional empty decorative drafts stay empty and are the only empty release path", async () => {
  const h = harness(); await h.controller.open(); h.input(""); h.imageEvent();
  assert.equal(await h.controller.approve(imageKey), false);
  h.decorate(); await h.controller.saveDraft(imageKey);
  assert.equal(h.calls.at(-1).body.text, ""); assert.equal(h.calls.at(-1).body.decorative, true);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /data-alt-text="image-a"[^>]*><\/textarea>/);
  await h.controller.approve(imageKey);
  assert.equal(h.calls.at(-1).body.text, ""); assert.equal(h.calls.at(-1).body.decorative, true);
});

test("an unedited decorative suggestion starts empty and needs its own saved decision", async () => {
  const initial = seed(); initial.pages[0].images[0].suggestedDecorative = true;
  const h = harness({ initial }); await h.controller.open();
  assert.equal(h.calls.filter((call) => /\/(draft|approve)$/.test(call.url)).length, 0);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /data-alt-decorative="image-a" checked/);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /data-alt-text="image-a"[^>]*><\/textarea>/);
  await h.controller.saveDraft(imageKey);
  assert.equal(h.calls.at(-1).body.text, "");
  assert.equal(h.calls.at(-1).body.decorative, true);
});

test("decorative suggestions never overwrite saved personal drafts or approved decisions", async () => {
  for (const kind of ["draft", "approved"]) {
    const initial = seed(), image = initial.pages[0].images[0];
    image.suggestedDecorative = true;
    if (kind === "draft") {
      image.status = "draft"; image.draftSavedAt = "2026-10-29T17:00:00Z";
      image.draftText = "Mein gespeicherter Text."; image.draftDecorative = false;
    } else image.approval = { text: "Meine genaue Freigabe.", decorative: false, revision: "approved-exact" };
    const h = harness({ initial }); await h.controller.open(); await h.controller.saveDraft(imageKey);
    assert.equal(h.calls.at(-1).body.text, kind === "draft" ? "Mein gespeicherter Text." : "Meine genaue Freigabe.");
    assert.equal(h.calls.at(-1).body.decorative, false);
  }
});

test("switching decoration off restores the unsaved personal text instead of losing it", async () => {
  const h = harness(); await h.controller.open(); h.input("Meine noch ungespeicherte Formulierung");
  h.decorate(true); h.decorate(true); h.decorate(false);
  await h.controller.saveDraft(imageKey);
  assert.equal(h.calls.at(-1).body.text, "Meine noch ungespeicherte Formulierung");
  assert.equal(h.calls.at(-1).body.decorative, false);
});

test("typing meaningful text into a decorative suggestion chooses an informative description", async () => {
  const initial = seed(); initial.pages[0].images[0].suggestedDecorative = true;
  const h = harness({ initial }); await h.controller.open(); h.input("Meine eigene Bildbeschreibung.");
  await h.controller.saveDraft(imageKey);
  assert.equal(h.calls.at(-1).body.text, "Meine eigene Bildbeschreibung.");
  assert.equal(h.calls.at(-1).body.decorative, false);
});

test("coupled travel captions and the read-only public check are explained without rewriting user punctuation", async () => {
  const initial = seed(); initial.pages[0].images[0].textCoupled = true;
  const h = harness({ initial }); await h.controller.open();
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Bildunterschrift und Alternativtext/);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /ohne abschließenden Punkt/);
  assert.match(h.dialog.innerHTML, /Der Button überträgt keine Texte/);
  h.input("Absichtlich unverändert mit Punkt."); await h.controller.saveDraft(imageKey);
  assert.equal(h.calls.at(-1).body.text, "Absichtlich unverändert mit Punkt.");
  const overview = seed(), other = harness({ initial: overview }); await other.controller.open();
  assert.doesNotMatch(other.nodes.get("[data-alt-page]").innerHTML, /zugleich die sichtbare Bildunterschrift/);
});

test("connection availability is checked before an initial snapshot rather than claimed unavailable", () => {
  const h = harness(), connection = h.nodes.get("[data-alt-connection]");
  assert.equal(connection.textContent, "Squarespace-Verbindung wird geprüft.");
  assert.doesNotMatch(connection.textContent, /Desktopprogramm|Erfolgreich/);
  assert.equal(h.nodes.get("[data-alt-transfer]").hidden, true);
});

test("connection success stays prominent while earlier failed transfer results remain separate", async () => {
  const initial = transferSeed({ windowHidden: true, status: "ready", pageUrl, message: "Letzter Versuch fehlgeschlagen",
    results: [{ imageKey, status: "failed", error: "Das Bild wurde nicht gefunden" }] });
  const h = harness({ initial }); await h.controller.open();
  const connection = h.nodes.get("[data-alt-connection]"), transfer = h.nodes.get("[data-alt-transfer]");
  assert.equal(connection.className, "website-alt-connection");
  assert.match(connection.textContent, /^Erfolgreich mit Squarespace verbunden\./);
  assert.match(connection.textContent, /Anmeldefenster ist ausgeblendet.*Explorer weiterarbeiten/);
  assert.doesNotMatch(connection.textContent, /fehlgeschlagen|nicht gefunden/);
  assert.equal(transfer.hidden, false);
  assert.equal(transfer.className, "website-alt-warning");
  assert.match(transfer.textContent, /Letzter Versuch fehlgeschlagen.*Bild 1: Fehlgeschlagen.*nicht gefunden/);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /data-alt-action="connect-transfer"[^>]*title="Zeigt das eigene Squarespace-Fenster wieder an[^>]*>Squarespace öffnen/);
  assert.equal(h.controller.snapshot().summary.verified, 0);
});

test("visible or disconnected windows do not produce a false hidden-window success claim", async () => {
  for (const connected of [true, false]) {
    const h = harness({ initial: transferSeed({ connected, windowHidden: !connected, status: "ready" }) });
    await h.controller.open();
    const connection = h.nodes.get("[data-alt-connection]");
    assert.doesNotMatch(connection.textContent, /ausgeblendet/);
    assert.equal(connection.textContent.startsWith("Erfolgreich mit Squarespace verbunden."), connected);
    assert.equal(connection.className === "website-alt-connection", connected);
    assert.match(h.nodes.get("[data-alt-page]").innerHTML, connected ? />Squarespace öffnen<\/button>/ : />Squarespace verbinden<\/button>/);
    assert.equal(h.nodes.get("[data-alt-transfer]").hidden, true);
  }
});

test("opening an existing connection reuses its own window without resending texts or losing old results", async () => {
  const initial = transferSeed({ windowHidden: true, pageUrl, results: [{ imageKey, status: "verification-pending" }] });
  const h = harness({ initial, fetch(call, { stored }) {
    if (call.url.endsWith("/connect-transfer")) { stored.transfer.windowHidden = false; stored.transfer.message = "Erfolgreich mit Squarespace verbunden."; }
  } });
  await h.controller.open(); assert.equal(await h.controller.connectTransfer(), true);
  assert.deepEqual(h.calls.at(-1).body, {});
  assert.match(h.calls.at(-1).url, /\/connect-transfer$/);
  assert.match(h.nodes.get("[data-alt-connection]").textContent, /^Erfolgreich mit Squarespace verbunden\./);
  assert.doesNotMatch(h.nodes.get("[data-alt-connection]").textContent, /ausgeblendet/);
  assert.match(h.nodes.get("[data-alt-transfer]").textContent, /Bild 1: Öffentliche Bestätigung offen/);
  assert.doesNotMatch(h.nodes.get("[data-alt-transfer]").textContent, /Erfolgreich mit Squarespace verbunden/);
  assert.equal(h.calls.filter((call) => call.url.endsWith("/transfer")).length, 0);
});

test("a new login prompt uses its own connection message while the previous transfer error stays visible", async () => {
  const loginMessage = "Bitte im eigenen Squarespace-Fenster anmelden.";
  const initial = transferSeed({ connected: false, windowOpen: false, status: "partial", pageUrl,
    message: "Letzte Übernahme: Ein Bild wurde nicht gefunden", results: [{ imageKey, status: "failed", error: "Bild fehlt" }] });
  const h = harness({ initial, fetch(call, { stored }) {
    if (call.url.endsWith("/connect-transfer")) Object.assign(stored.transfer, { windowOpen: true,
      connectionStatus: "login-required", connectionMessage: loginMessage });
  } });
  await h.controller.open(); await h.controller.connectTransfer();
  assert.equal(h.nodes.get("[data-alt-message]").textContent, loginMessage);
  assert.match(h.nodes.get("[data-alt-transfer]").textContent, /Letzte Übernahme: Ein Bild wurde nicht gefunden.*Bild 1: Fehlgeschlagen/);
  assert.equal(h.controller.snapshot().transfer.status, "partial");
  assert.equal(h.controller.snapshot().transfer.results[0].error, "Bild fehlt");
});

test("a later connected poll removes only the earlier login progress message", async () => {
  const initial = transferSeed({ connected: false, windowOpen: false, status: "disconnected" });
  const h = harness({ initial, fetch(call, { stored }) {
    if (call.url.endsWith("/connect-transfer")) Object.assign(stored.transfer, { windowOpen: true, status: "login-required",
      message: "Eigenes Squarespace-Browserfenster wird geöffnet. Bitte dort selbst anmelden." });
  } });
  await h.controller.open(); await h.controller.connectTransfer();
  const notice = h.nodes.get("[data-alt-message]");
  assert.match(notice.textContent, /Bitte dort selbst anmelden/);
  const fresh = transferSeed({ windowHidden: true, status: "ready", message: "Erfolgreich mit Squarespace verbunden." });
  fresh.revision = "logged-in"; h.replace(fresh); await h.controller.refresh();
  assert.equal(notice.hidden, true);
  assert.equal(notice.textContent, "");
  assert.match(h.nodes.get("[data-alt-connection]").textContent, /^Erfolgreich mit Squarespace verbunden\./);
});

test("immediate connection success never replaces draft, approval, or actual transfer messages", async () => {
  for (const action of ["saveDraft", "approve", "transfer"]) {
    const h = harness({ initial: transferSeed(), fetch(call, { stored }) {
      if (call.url.endsWith("/transfer")) Object.assign(stored.transfer, { pageUrl, status: "completed",
        message: "Eintragung erfolgt und öffentlich geprüft", results: [{ imageKey, status: "verified" }] });
      if (call.url.endsWith("/connect-transfer")) stored.transfer.message = "Erfolgreich mit Squarespace verbunden.";
    } });
    await h.controller.open(); h.imageEvent(); await h.controller[action](imageKey);
    const notice = h.nodes.get("[data-alt-message]"), previous = notice.textContent;
    assert.match(previous, action === "saveDraft" ? /Entwurf gespeichert/ : action === "approve" ? /Text freigegeben/ : /öffentlich geprüft/);
    await h.controller.connectTransfer();
    assert.equal(notice.textContent, previous, action);
    assert.equal(notice.hidden, false, action);
    assert.doesNotMatch(h.nodes.get("[data-alt-transfer]").textContent, /Erfolgreich mit Squarespace verbunden/);
    if (action === "transfer") assert.match(h.nodes.get("[data-alt-transfer]").textContent, /Bild 1: Öffentlich bestätigt/);
  }
});

test("a later connected poll preserves a newer saved draft or approval message", async () => {
  for (const action of ["saveDraft", "approve"]) {
    const initial = transferSeed({ connected: false, windowOpen: true, status: "login-required" });
    const h = harness({ initial }); await h.controller.open(); h.imageEvent(); await h.controller[action](imageKey);
    const notice = h.nodes.get("[data-alt-message]"), previous = notice.textContent, fresh = copy(h.controller.snapshot());
    fresh.revision = "logged-in"; fresh.transfer.connected = true; fresh.transfer.windowHidden = true;
    fresh.transfer.message = "Erfolgreich mit Squarespace verbunden."; h.replace(fresh); await h.controller.refresh();
    assert.equal(notice.textContent, previous, action);
    assert.equal(notice.hidden, false, action);
  }
});

test("unavailable CMS integration is visible and never sends connection or transfer writes", async () => {
  const h = harness({ initial: transferSeed({ available: false, connected: false, status: "unavailable" }) });
  await h.controller.open();
  assert.match(h.nodes.get("[data-alt-connection]").textContent, /Desktopprogramm/);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /data-alt-action="connect-transfer"[^>]* disabled/);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /data-alt-action="transfer" disabled/);
  assert.equal(await h.controller.connectTransfer(), false);
  assert.equal(await h.controller.transfer(), false);
  assert.equal(h.calls.filter((call) => /\/(?:connect-transfer|transfer)$/.test(call.url)).length, 0);
});

test("connection opens the separate login flow without credentials or a premature connected claim", async () => {
  const h = harness({ initial: transferSeed({ connected: false, windowOpen: false, status: "disconnected" }),
    fetch(call, { stored }) { if (call.url.endsWith("/connect-transfer")) stored.transfer = { ...stored.transfer,
      running: true, status: "connecting", windowOpen: true, message: "Bitte im eigenen Browserfenster anmelden" }; } });
  await h.controller.open(); await h.controller.connectTransfer();
  assert.deepEqual(h.calls.at(-1).body, {});
  assert.match(h.calls.at(-1).url, /\/connect-transfer$/);
  assert.match(h.nodes.get("[data-alt-connection]").textContent, /noch nicht verbunden/);
  assert.doesNotMatch(h.dialog.innerHTML, /type="password"/);
  assert.equal(h.requestClose(), false);
  assert.equal(await h.controller.transfer(), false);
  assert.equal(await h.controller.scan(pageUrl), false);
  assert.equal(h.calls.filter((call) => /\/(?:scan|transfer)$/.test(call.url)).length, 0);
});

test("an open login window is polled until actually connected or closed", async () => {
  for (const connected of [true, false]) {
    const initial = transferSeed({ connected: false, windowOpen: true, status: "disconnected", loginRequired: true });
    const h = harness({ initial }); await h.controller.open();
    assert.ok([...h.timers.values()].some((timer) => timer.delay === 1500));
    const fresh = transferSeed({ connected, windowOpen: connected, status: connected ? "ready" : "disconnected" });
    fresh.revision = "login-window-result"; h.replace(fresh); await h.controller.refresh();
    assert.equal([...h.timers.values()].some((timer) => timer.delay === 1500), false);
    assert.equal(h.calls.filter((call) => call.url.endsWith("/transfer")).length, 0);
  }
});

test("page transfer confirms the exact page and sends only its revision and URL", async () => {
  const h = harness({ initial: transferSeed(), fetch(call, { stored }) {
    if (call.url.endsWith("/transfer")) stored.transfer = { ...stored.transfer, running: true, status: "running",
      pageUrl: call.body.pageUrl, message: "Freigegebene Texte werden übernommen", results: [] };
  } });
  await h.controller.open();
  assert.equal(await h.controller.transfer(), true);
  assert.deepEqual(h.calls.at(-1).body, { revision: "revision-2", pageUrl });
  assert.equal(h.confirmations.length, 1);
  assert.match(h.confirmations[0].message, /1 freigegebene Bildtexte.*Papageientaucher/);
  assert.equal(h.controller.snapshot().summary.verified, 0);
  assert.equal(h.requestClose(), false);
  assert.ok([...h.timers.values()].some((timer) => timer.delay === 1500));
  const finished = transferSeed({ status: "completed", pageUrl, results: [{ imageKey, status: "verified" }], message: "Öffentlich bestätigt" });
  finished.pages[0].images[0].status = "verified"; finished.summary.verified = 1; finished.summary.approved = 0;
  h.replace(finished); await h.controller.refresh();
  assert.match(h.nodes.get("[data-alt-transfer]").textContent, /Bild 1: Öffentlich bestätigt/);
  assert.equal(h.requestClose(), true);
});

test("one page transfer establishes its own connection and only the new actual job replaces the previous outcome", async () => {
  const initial = transferSeed({ connected: false, windowOpen: false, status: "partial", pageUrl,
    message: "Ein früheres Bild konnte nicht übernommen werden", results: [{ imageKey, status: "failed", error: "Altes Ergebnis" }] });
  const h = harness({ initial, fetch(call, { stored }) {
    if (call.url.endsWith("/transfer")) Object.assign(stored.transfer, { running: true, status: "running", phase: "connecting",
      message: "Squarespace-Verbindung wird hergestellt", results: [] });
  } });
  await h.controller.open();
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /data-alt-action="transfer">In Squarespace übernehmen/);
  assert.match(h.nodes.get("[data-alt-transfer]").textContent, /Bild 1: Fehlgeschlagen.*Altes Ergebnis/);
  assert.equal(await h.controller.transfer(), true);
  assert.deepEqual(h.calls.at(-1).body, { revision: "revision-2", pageUrl });
  assert.equal(h.calls.filter((call) => call.url.endsWith("/connect-transfer")).length, 0);
  assert.match(h.confirmations[0].message, /Bei Bedarf.*Squarespace.*Anmeldung/);
  assert.doesNotMatch(h.nodes.get("[data-alt-transfer]").textContent, /Altes Ergebnis/);
  assert.equal(h.controller.snapshot().summary.verified, 0);
  assert.equal(h.requestClose(), false);
});

test("a running transfer explains the login wait and then the actual write and public verification phases", async () => {
  const initial = transferSeed({ connected: false, windowOpen: true, running: true, status: "running", phase: "login-required", pageUrl,
    loginRequired: true, message: "Bitte im eigenen Fenster anmelden", results: [{ imageKey, status: "failed", error: "Letzter Fehler" }] });
  const h = harness({ initial }); await h.controller.open();
  assert.match(h.nodes.get("[data-alt-connection]").textContent, /Übernahme wartet auf deine Anmeldung.*automatisch weiter/);
  assert.equal(h.nodes.get("[data-alt-connection]").className, "website-alt-warning");
  assert.match(h.nodes.get("[data-alt-transfer]").textContent, /Letzter Fehler/);
  assert.equal(h.requestClose(), false);
  for (const [phase, label] of [["transferring", "Freigegebene Texte werden in Squarespace übernommen"], ["verifying", "Öffentliche Ausgabe wird geprüft"]]) {
    const fresh = copy(initial); fresh.revision = phase;
    Object.assign(fresh.transfer, { connected: true, phase, loginRequired: false, message: "" }); h.replace(fresh); await h.controller.refresh();
    assert.match(h.nodes.get("[data-alt-transfer]").textContent, new RegExp(label));
    assert.match(h.nodes.get("[data-alt-transfer]").textContent, /Letzter Fehler/);
    assert.equal(h.controller.snapshot().summary.verified, 0);
  }
});

test("cancelled page transfer never writes to the CMS route", async () => {
  const h = harness({ initial: transferSeed(), confirm: false }); await h.controller.open();
  assert.equal(await h.controller.transfer(), false);
  assert.equal(h.confirmations.length, 1);
  assert.equal(h.calls.filter((call) => call.url.endsWith("/transfer")).length, 0);
});

test("transfer requires available integration and current approved work without unsaved inputs or a scan", async () => {
  for (const reason of ["unsaved", "scan", "unavailable", "draft", "verified", "missing-approval", "unavailable-page", "page-error", "redirect"]) {
    const initial = transferSeed(), page = initial.pages[0], image = page.images[0];
    if (reason === "scan") initial.scan.running = true;
    if (reason === "unavailable") initial.transfer.available = false;
    if (["draft", "verified"].includes(reason)) image.status = reason;
    if (reason === "missing-approval") image.approval = null;
    if (reason === "unavailable-page") page.inventoryStatus = "unavailable";
    if (reason === "page-error") page.error = "Abruf nicht möglich";
    if (reason === "redirect") page.redirectUrl = "https://www.fnwildlifetravel.de/about";
    const h = harness({ initial }); await h.controller.open();
    if (reason === "unsaved") h.input("Noch nicht gespeichert");
    assert.equal(await h.controller.transfer(), false, reason);
    assert.equal(h.confirmations.length, 0, reason);
    assert.equal(h.calls.filter((call) => call.url.endsWith("/transfer")).length, 0, reason);
  }
});

test("duplicate clicks during the transfer confirmation cannot start another confirmation or write", async () => {
  const confirmation = deferred(), h = harness({ initial: transferSeed() });
  await h.controller.open(); h.setConfirmPending(confirmation);
  const first = h.controller.transfer(); await Promise.resolve();
  assert.equal(await h.controller.transfer(), false);
  assert.equal(await h.controller.saveDraft(imageKey), false);
  assert.equal(h.requestClose(), false);
  assert.equal(h.confirmations.length, 1);
  confirmation.resolve(true); await first;
  assert.equal(h.calls.filter((call) => call.url.endsWith("/transfer")).length, 1);
});

test("duplicate transfer clicks waiting for the same read open only one confirmation", async () => {
  const read = deferred(), confirmation = deferred(); let reads = 0;
  const h = harness({ initial: transferSeed(), fetch(call) { if (call.method === "GET" && ++reads === 2) return read.promise; } });
  await h.controller.open(); h.setConfirmPending(confirmation);
  const refresh = h.controller.refresh(), first = h.controller.transfer(), second = h.controller.transfer();
  const latest = transferSeed(); latest.revision = "revision-2"; read.resolve(latest);
  await refresh; await Promise.resolve();
  assert.equal(h.confirmations.length, 1);
  confirmation.resolve(true); await Promise.all([first, second]);
  assert.equal(h.calls.filter((call) => call.url.endsWith("/transfer")).length, 1);
});

test("a running transfer prevents concurrent scans, image writes, and premature dialog closure", async () => {
  const h = harness({ initial: transferSeed({ running: true, status: "running", pageUrl }) });
  await h.controller.open();
  assert.equal(h.requestClose(), false);
  assert.equal(await h.controller.scan(pageUrl), false);
  assert.equal(await h.controller.saveDraft(imageKey), false);
  assert.equal(await h.controller.approve(imageKey), false);
  assert.equal(await h.controller.verify(imageKey), false);
  assert.equal(h.calls.filter((call) => call.method === "POST").length, 0);
});

test("an uncertain transfer timeout is never silently retried or presented as a completed adoption", async () => {
  const never = deferred();
  const h = harness({ initial: transferSeed(), fetch(call) { if (call.url.endsWith("/transfer")) return never.promise; } });
  await h.controller.open(); const pending = h.controller.transfer();
  for (let tick = 0; tick < 10 && !h.calls.some((call) => call.url.endsWith("/transfer")); tick += 1) await Promise.resolve();
  const timeout = [...h.timers.values()].find((timer) => timer.delay === 15000);
  assert.ok(timeout); timeout.fn();
  assert.equal(await pending, false);
  assert.equal(h.calls.filter((call) => call.url.endsWith("/transfer")).length, 1);
  assert.match(h.nodes.get("[data-alt-message]").textContent, /Ergebnis ist noch nicht bestätigt/);
  assert.equal(h.controller.snapshot().summary.verified, 0);
  assert.equal(h.controller.snapshot().pages[0].images[0].status, "approved");
});

test("a transfer confirmation cannot move to another page, new revision, or changed input", async () => {
  for (const change of ["page", "revision", "input", "leave-and-return"]) {
    const initial = transferSeed(), otherUrl = "https://www.fnwildlifetravel.de/about";
    initial.pages.push({ ...copy(initial.pages[0]), url: otherUrl, title: "Andere Seite" });
    const h = harness({ initial, now: () => Date.parse("2026-10-28T10:00:00Z") }), confirmation = deferred();
    await h.controller.open(); h.setConfirmPending(confirmation); const pending = h.controller.transfer(); await Promise.resolve();
    if (change === "page" || change === "leave-and-return") await h.controller.selectPage(otherUrl);
    if (change === "leave-and-return") await h.controller.selectPage(pageUrl);
    if (change === "revision") { initial.revision = "newer-review"; h.replace(initial); await h.controller.refresh(); }
    if (change === "input") h.input("Neu getippter Text");
    confirmation.resolve(true); assert.equal(await pending, false, change);
    assert.equal(h.calls.filter((call) => call.url.endsWith("/transfer")).length, 0, change);
  }
});

test("an old confirmation cannot clear the lock of a reopened dialog's new confirmation", async () => {
  const h = harness({ initial: transferSeed() }), old = deferred(), fresh = deferred();
  await h.controller.open(); h.setConfirmPending(old); const first = h.controller.transfer(); await Promise.resolve();
  h.nativeClose(); await h.controller.open(); h.setConfirmPending(fresh); const second = h.controller.transfer(); await Promise.resolve();
  old.resolve(true); assert.equal(await first, false);
  assert.equal(await h.controller.transfer(), false);
  assert.equal(h.confirmations.length, 2);
  fresh.resolve(true); await second;
  assert.equal(h.calls.filter((call) => call.url.endsWith("/transfer")).length, 1);
});

test("partial transfer errors remain visible and never claim an unchecked image was confirmed", async () => {
  const initial = transferSeed({ status: "partial", pageUrl, message: "Ein Bild konnte nicht übernommen werden",
    results: [{ imageKey, status: "error", error: "<script>Falsches Feld</script>" }] });
  const h = harness({ initial }); await h.controller.open();
  assert.match(h.nodes.get("[data-alt-transfer]").textContent, /Bild 1: Fehlgeschlagen/);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /&lt;script&gt;Falsches Feld&lt;\/script&gt;/);
  assert.doesNotMatch(h.nodes.get("[data-alt-page]").innerHTML, /<script>/);
  assert.equal(h.controller.snapshot().summary.verified, 0);
  assert.equal(h.controller.snapshot().pages[0].images[0].status, "approved");
});

test("refresh preserves unsaved edits and invalidates a release when its observed image basis changes", async () => {
  const h = harness(); await h.controller.open(); h.input("Mein korrigierter Text"); h.imageEvent();
  const updated = seed(); updated.revision = "new-revision"; updated.pages[0].images[0].observationHash = "new-observation";
  h.replace(updated); await h.controller.refresh();
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Mein korrigierter Text/);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Bildgrundlage hat sich geändert/);
  assert.equal(await h.controller.approve(imageKey), false);
  await h.controller.saveDraft(imageKey);
  assert.equal(h.calls.at(-1).body.revision, "new-revision"); assert.equal(h.calls.at(-1).body.text, "Mein korrigierter Text");
});

test("write failure reloads current state without losing edits or silently replaying the write", async () => {
  const h = harness({ fetch(call) { if (call.url.endsWith("/draft")) throw new Error("Der Stand wurde inzwischen geändert."); } });
  await h.controller.open(); h.input("Behaltene Korrektur");
  assert.equal(await h.controller.saveDraft(imageKey), false);
  assert.equal(h.calls.filter((call) => call.url.endsWith("/draft")).length, 1);
  assert.equal(h.calls.at(-1).method, "GET");
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Behaltene Korrektur/);
  assert.match(h.nodes.get("[data-alt-message]").textContent, /ungespeicherten Texte bleiben erhalten/);
});

test("late responses cannot replace a reopened dialog or launch discovery for the abandoned opening", async () => {
  const old = deferred(); let reads = 0;
  const h = harness({ fetch(call) { if (call.method === "GET" && ++reads === 1) return old.promise; } });
  const first = h.controller.open(); h.nativeClose();
  const fresh = seed(); fresh.revision = "fresh-revision"; fresh.pages[0].title = "Frischer Stand"; h.replace(fresh);
  await h.controller.open(); old.resolve(seed()); await first;
  assert.match(h.nodes.get("[data-alt-pages]").innerHTML, /Frischer Stand/);
  assert.equal(h.calls.filter((call) => call.url.endsWith("/discover")).length, 1);
});

test("duplicate actions are suppressed while a write is pending and close never discards unsaved text", async () => {
  const write = deferred();
  const h = harness({ fetch(call, { stored }) { if (call.url.endsWith("/draft")) return write.promise.then(() => copy(stored)); } });
  await h.controller.open(); h.input("Offener Entwurf");
  assert.equal(h.requestClose(), false);
  const first = h.controller.saveDraft(imageKey); await Promise.resolve();
  const second = h.controller.saveDraft(imageKey); await second;
  assert.equal(h.calls.filter((call) => call.url.endsWith("/draft")).length, 1);
  assert.equal(h.requestClose(), false);
  write.resolve(); await first;
});

test("failed previews, removed images and conflicting uses cannot be released", async () => {
  for (const mode of ["error", "removed", "conflict"]) {
    const initial = seed();
    if (mode === "removed") initial.pages[0].images[0].status = "removed";
    if (mode === "conflict") initial.pages[0].images[0].altVariants = ["A", "B"];
    const h = harness({ initial }); await h.controller.open(); h.imageEvent();
    if (mode === "error") h.imageEvent("error");
    assert.equal(await h.controller.approve(imageKey), false);
    assert.equal(h.calls.filter((call) => call.url.endsWith("/approve")).length, 0, mode);
  }
});

test("stopping clears every background timer and ignores pending responses", async () => {
  const pending = deferred(); let reads = 0;
  const h = harness({ fetch(call) { if (call.method === "GET" && ++reads === 2) return pending.promise; } });
  await h.controller.open(); const refresh = h.controller.refresh(); const before = h.nodes.get("[data-alt-pages]").innerHTML;
  h.controller.stop(); assert.equal(h.timers.size, 0);
  const late = seed(); late.pages[0].title = "Zu spät"; pending.resolve(late); await refresh;
  assert.equal(h.nodes.get("[data-alt-pages]").innerHTML, before);
  await h.controller.open(); assert.equal(h.calls.length, 3);
});

test("unassignable image uses keep an otherwise verified page open and visible as an incomplete page", async () => {
  const initial = seed(); initial.pages[0].images[0].status = "verified"; initial.pages[0].unsupportedImageCount = 2;
  const h = harness({ initial }); await h.controller.open();
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /2 Bildverwendung\(en\).*nicht sicher zugeordnet/);
  const filter = h.nodes.get("[data-alt-filter]"); filter.value = "verified"; h.dialog.emit("change", { target: filter });
  assert.doesNotMatch(h.nodes.get("[data-alt-pages]").innerHTML, /Papageientaucher/);
  filter.value = "open"; h.dialog.emit("change", { target: filter });
  assert.match(h.nodes.get("[data-alt-pages]").innerHTML, /Papageientaucher/);
});

test("explicit stale page selection refreshes only that page and retains unsaved edits", async () => {
  const h = harness({ now: () => Date.parse("2026-10-28T10:10:00Z") }); await h.controller.open();
  h.input("Noch nicht gespeicherter Motivtext"); await h.controller.selectPage(pageUrl);
  const scan = h.calls.find((call) => call.url.endsWith("/scan"));
  assert.deepEqual(scan.body, { pageUrl });
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Noch nicht gespeicherter Motivtext/);
  await h.controller.selectPage(pageUrl);
  assert.equal(h.calls.filter((call) => call.url.endsWith("/scan")).length, 1);
  const fresh = harness({ now: () => Date.parse("2026-10-28T10:01:00Z") }); await fresh.controller.open();
  await fresh.controller.selectPage(pageUrl);
  assert.equal(fresh.calls.filter((call) => call.url.endsWith("/scan")).length, 0);
});

test("an invalid mutation response never discards an unsaved text", async () => {
  const h = harness({ fetch(call) { if (call.url.endsWith("/draft")) return { pages: [] }; } });
  await h.controller.open(); h.input("Trotz ungültiger Antwort erhalten");
  assert.equal(await h.controller.saveDraft(imageKey), false);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Trotz ungültiger Antwort erhalten/);
  assert.match(h.nodes.get("[data-alt-message]").textContent, /Ungültiger Bildtextstand/);
});

test("a stalled write times out without retry and leaves the draft available for a conscious retry", async () => {
  const never = deferred();
  const h = harness({ fetch(call) { if (call.url.endsWith("/draft")) return never.promise; } });
  await h.controller.open(); h.input("Nicht verlieren"); const pending = h.controller.saveDraft(imageKey);
  await Promise.resolve();
  const timeout = [...h.timers.values()].find((timer) => timer.delay === 15000);
  assert.ok(timeout); timeout.fn();
  assert.equal(await pending, false);
  assert.equal(h.calls.filter((call) => call.url.endsWith("/draft")).length, 1);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Nicht verlieren/);
  assert.match(h.nodes.get("[data-alt-message]").textContent, /zu lange gedauert/);
});

for (const action of ["saveDraft", "approve", "verify"]) test(`${action} never migrates a pending image action to another page sharing its image key`, async () => {
  const pendingRead = deferred(), initial = seed(); let reads = 0;
  initial.pages[0].images[0].approval = { revision: "approval-a", text: initial.pages[0].images[0].alt, decorative: false };
  const secondPage = copy(initial.pages[0]); secondPage.url = "https://www.fnwildlifetravel.de/reisen/island";
  secondPage.title = "Reiseseite"; secondPage.images[0].approval.revision = "approval-b"; initial.pages.push(secondPage);
  const h = harness({ initial, now: () => Date.parse("2026-10-28T10:01:00Z"),
    fetch(call) { if (call.method === "GET" && ++reads === 2) return pendingRead.promise; } });
  await h.controller.open(); h.imageEvent();
  const refresh = h.controller.refresh(), mutation = h.controller[action](imageKey);
  await h.controller.selectPage(secondPage.url); h.imageEvent();
  pendingRead.resolve(copy(initial)); await refresh;
  assert.equal(await mutation, false);
  assert.equal(h.calls.filter((call) => /\/(draft|approve|verify)$/.test(call.url)).length, 0);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Reiseseite/);
});

test("conflicting visible captions disable image approval before any mutation request", async () => {
  const initial = seed(); initial.pages[0].images[0].captionVariants = ["Bildunterschrift A", "Bildunterschrift B"];
  const h = harness({ initial }); await h.controller.open(); h.imageEvent();
  assert.equal(await h.controller.approve(imageKey), false);
  assert.equal(h.calls.filter((call) => call.url.endsWith("/approve")).length, 0);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /unterschiedliche.*Bildunterschriften/);
});

test("leaving and returning to the same page still cancels its pending approval", async () => {
  const pendingRead = deferred(), initial = seed(); let reads = 0;
  const secondPage = copy(initial.pages[0]); secondPage.url = "https://www.fnwildlifetravel.de/reisen/island"; initial.pages.push(secondPage);
  const h = harness({ initial, now: () => Date.parse("2026-10-28T10:01:00Z"),
    fetch(call) { if (call.method === "GET" && ++reads === 2) return pendingRead.promise; } });
  await h.controller.open(); h.imageEvent();
  const refresh = h.controller.refresh(), release = h.controller.approve(imageKey);
  await h.controller.selectPage(secondPage.url); await h.controller.selectPage(pageUrl);
  pendingRead.resolve(copy(initial)); await refresh;
  assert.equal(await release, false);
  assert.equal(h.calls.filter((call) => call.url.endsWith("/approve")).length, 0);
});

test("closing and reopening the same page cancels an old pending image action", async () => {
  const pendingRead = deferred(); let reads = 0;
  const h = harness({ fetch(call) { if (call.method === "GET" && ++reads === 2) return pendingRead.promise; } });
  await h.controller.open(); h.imageEvent();
  const refresh = h.controller.refresh(), mutation = h.controller.saveDraft(imageKey);
  h.nativeClose(); await h.controller.open(); pendingRead.resolve(seed()); await refresh;
  assert.equal(await mutation, false);
  assert.equal(h.calls.filter((call) => call.url.endsWith("/draft")).length, 0);
});

test("a pending approval cannot silently include text typed after its click", async () => {
  const pendingRead = deferred(); let reads = 0;
  const h = harness({ fetch(call) { if (call.method === "GET" && ++reads === 2) return pendingRead.promise; } });
  await h.controller.open(); h.imageEvent(); h.input("Text beim Freigabeklick");
  const refresh = h.controller.refresh(), release = h.controller.approve(imageKey);
  h.input("Erst danach getippter Text"); pendingRead.resolve(seed()); await refresh;
  assert.equal(await release, false);
  assert.equal(h.calls.filter((call) => call.url.endsWith("/approve")).length, 0);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Erst danach getippter Text/);
});

test("healthy aliases show their target without pretending to be an incomplete or verified content page", async () => {
  const initial = seed(), aliasUrl = "https://www.fnwildlifetravel.de/alter-pfad";
  initial.pages[0].images[0].status = "verified";
  initial.pages.push({ url: aliasUrl, title: "Alter Pfad", redirectUrl: pageUrl, images: [], checkedAt: "2026-10-28T10:00:00Z" });
  initial.summary.pages = 1; initial.summary.redirects = 1;
  const h = harness({ initial, now: () => Date.parse("2026-10-28T10:01:00Z") }); await h.controller.open();
  assert.match(h.nodes.get("[data-alt-summary]").textContent, /1 Inhaltsseite · 1 Weiterleitung/);
  assert.match(h.nodes.get("[data-alt-pages]").innerHTML, /Weiterleitung/);
  await h.controller.selectPage(aliasUrl);
  const html = h.nodes.get("[data-alt-page]").innerHTML;
  assert.match(html, /Weiterleitung/); assert.match(html, /Zielseite auswählen/); assert.ok(html.includes(`href="${pageUrl}"`));
  assert.doesNotMatch(html, /noch keine Bildverwendungen erfasst|kein Nachweis einer vollständigen Prüfung/);
  const filter = h.nodes.get("[data-alt-filter]"); filter.value = "open"; h.dialog.emit("change", { target: filter });
  assert.doesNotMatch(h.nodes.get("[data-alt-pages]").innerHTML, /Alter Pfad/);
  filter.value = "verified"; h.dialog.emit("change", { target: filter });
  assert.match(h.nodes.get("[data-alt-pages]").innerHTML, /Papageientaucher/);
  assert.doesNotMatch(h.nodes.get("[data-alt-pages]").innerHTML, /Alter Pfad/);
  h.dialog.emit("click", { target: { closest: (selector) => selector === "[data-alt-page-url]" ? { dataset: { altPageUrl: pageUrl } } : null } });
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Bildvorschau zur Textprüfung/);
});

test("an unsafe or failed redirect remains open and never becomes a clickable external target", async () => {
  for (const mode of ["unsafe", "failed"]) {
    const initial = seed(), aliasUrl = "https://www.fnwildlifetravel.de/alter-pfad";
    initial.pages.push({ url: aliasUrl, title: "Zu prüfende Weiterleitung", redirectUrl: mode === "unsafe" ? "javascript:alert(1)" : pageUrl,
      images: [], checkedAt: "2026-10-28T10:00:00Z", ...(mode === "failed" ? { error: "Zielprüfung fehlgeschlagen" } : {}) });
    const h = harness({ initial, now: () => Date.parse("2026-10-28T10:01:00Z") }); await h.controller.open(); await h.controller.selectPage(aliasUrl);
    const filter = h.nodes.get("[data-alt-filter]"); filter.value = "open"; h.dialog.emit("change", { target: filter });
    assert.match(h.nodes.get("[data-alt-pages]").innerHTML, /Zu prüfende Weiterleitung/);
    assert.doesNotMatch(h.nodes.get("[data-alt-page]").innerHTML, /href="javascript:/);
  }
});

test("polling makes background scan errors and partial failures visible as text instead of leaving only the start notice", async () => {
  const initial = seed(); initial.scan.running = true;
  const h = harness({ initial }); await h.controller.open();
  const failed = copy(initial); failed.scan.running = false; failed.scan.complete = false;
  failed.scan.error = "<script>Erfassung fehlgeschlagen</script>";
  failed.scan.errors = [{ url: "https://www.fnwildlifetravel.de/<svg onload=bad>", message: "HTTP 503" }, { url: pageUrl, message: "Zeitüberschreitung" }];
  h.replace(failed);
  const poll = [...h.timers.values()].find((timer) => timer.delay === 1500); assert.ok(poll); poll.fn();
  await h.controller.refresh();
  const coverage = h.nodes.get("[data-alt-coverage]");
  assert.match(coverage.textContent, /Erfassung fehlgeschlagen/);
  assert.match(coverage.textContent, /2 Teilfehler/);
  assert.ok(coverage.textContent.includes(failed.scan.errors[0].url));
  assert.equal(coverage.innerHTML, "");
  assert.doesNotMatch(coverage.textContent, /Erfassung läuft|Erfassung erfolgreich/);
});

test("compact main view keeps inventory and help behind a closed section while the next action stays visible", async () => {
  const h = harness({ initial: transferSeed() }); await h.controller.open();
  assert.match(h.dialog.innerHTML, /<details[^>]*website-alt-management[^>]*><summary>Hilfe und Seitenbestand<\/summary>/);
  assert.equal(h.nodes.get("[data-alt-counts]").textContent, "1 Seite · 0 Entwürfe · 1 zur Übernahme · 0 bestätigt");
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /data-alt-next>1 Bildtext freigegeben\. Jetzt in Squarespace übernehmen\./);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /data-alt-action="transfer">In Squarespace übernehmen/);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /<details[^>]*data-alt-detail="page-actions"><summary>Seitenaktionen/);
  assert.equal(h.nodes.get("[data-alt-scan-status]").hidden, true);
});

test("successful transfer is summarized once while full per-image proof remains available on demand", async () => {
  const initial = transferSeed({ status: "completed", pageUrl, results: Array.from({ length: 5 }, (_, index) => ({ imageKey: `image-${index}`, status: "verified" })) });
  const h = harness({ initial }); await h.controller.open();
  const summary = h.nodes.get("[data-alt-transfer-summary]").textContent;
  assert.match(summary, /^5\/5 Bildtexte öffentlich bestätigt/);
  assert.doesNotMatch(summary, /Bild 1:|Bild 2:|Bild 5:/);
  assert.equal(h.nodes.get("[data-alt-transfer-details]").hidden, false);
  assert.match(h.nodes.get("[data-alt-transfer]").textContent, /Bild 1: Öffentlich bestätigt.*Bild 5: Öffentlich bestätigt/);
  assert.match(h.dialog.innerHTML, /<details[^>]*data-alt-transfer-details><summary/);
});

test("collapsed transfer and inventory details never hide a failure or an active login phase", async () => {
  const initial = transferSeed({ connected: false, status: "failed", pageUrl, results: [{ imageKey, status: "failed", error: "Zielbild nicht eindeutig" }] });
  initial.scan.error = "Website nicht erreichbar";
  const h = harness({ initial }); await h.controller.open();
  assert.match(h.nodes.get("[data-alt-transfer-summary]").textContent, /0\/1 Bildtext öffentlich bestätigt.*Zielbild nicht eindeutig/);
  assert.equal(h.nodes.get("[data-alt-scan-status]").hidden, false);
  assert.match(h.nodes.get("[data-alt-scan-status]").textContent, /Website nicht erreichbar/);
  assert.equal(h.nodes.get("[data-alt-scan-status]").innerHTML, "");
  const waiting = copy(initial); Object.assign(waiting.transfer, { running: true, status: "running", phase: "login-required" });
  h.replace(waiting); await h.controller.refresh();
  assert.match(h.nodes.get("[data-alt-transfer-summary]").textContent, /wartet auf deine Anmeldung/);
  assert.match(h.nodes.get("[data-alt-connection]").textContent, /Anmeldung.*automatisch weiter/);
});

test("confirmed cards archive resolved editorial questions and preserve page-scoped detail choices after refresh", async () => {
  const initial = seed(), image = initial.pages[0].images[0];
  image.status = "verified"; image.approval = { revision: "approved", text: image.alt, decorative: false };
  image.draftNote = "Motiv gemeinsam nachprüfen";
  const otherUrl = "https://www.fnwildlifetravel.de/andere-seite";
  initial.pages.push({ ...copy(initial.pages[0]), url: otherUrl, title: "Andere Seite" });
  const h = harness({ initial, now: () => Date.parse("2026-10-28T10:01:00Z") }); await h.controller.open();
  let html = h.nodes.get("[data-alt-page]").innerHTML;
  assert.match(html, /1 Bild öffentlich bestätigt/);
  assert.doesNotMatch(html, /<strong>Prüfhinweis zum Entwurf:<\/strong>/);
  assert.match(html, /Früherer Prüfhinweis · durch Freigabe erledigt/);
  assert.match(html, /data-alt-detail="image-a:actions"[\s\S]*Motiv gemeinsam nachprüfen/);
  for (const key of [imageKey, `${imageKey}:actions`, "page-actions", "page-coverage"]) {
    h.dialog.emit("toggle", { target: { dataset: { altDetail: key }, open: true } });
  }
  await h.controller.refresh(); html = h.nodes.get("[data-alt-page]").innerHTML;
  assert.match(html, /data-alt-detail="image-a" open><summary>Text bearbeiten/);
  assert.match(html, /data-alt-detail="image-a:actions" open>/);
  assert.match(html, /data-alt-detail="page-actions" open>/);
  await h.controller.selectPage(otherUrl);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /data-alt-detail="image-a"><summary>Text bearbeiten/);
  await h.controller.selectPage(pageUrl);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /data-alt-detail="image-a" open>/);
  h.dialog.emit("toggle", { target: { dataset: { altDetail: imageKey }, open: false } });
  await h.controller.refresh();
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /data-alt-detail="image-a"><summary>Text bearbeiten/);
});

test("freigegebene Fragen zählen nicht als offen; geänderte oder neue ungespeicherte Fassungen zeigen sie wieder", async () => {
  for (const status of ["approved", "verified"]) {
    const initial = seed(), image = initial.pages[0].images[0];
    image.status = status; image.approval = { revision: "approval", text: image.alt, decorative: false };
    image.draftNote = "Bezeichnung mit Felix prüfen";
    const h = harness({ initial }); await h.controller.open();
    const filter = h.nodes.get("[data-alt-filter]"); filter.value = "notes"; h.dialog.emit("change", { target: filter });
    assert.doesNotMatch(h.nodes.get("[data-alt-pages]").innerHTML, /Papageientaucher/);
    filter.value = "all"; h.dialog.emit("change", { target: filter });
    h.input("Neue ungeprüfte Beschreibung"); await h.controller.refresh();
    assert.match(h.nodes.get("[data-alt-page]").innerHTML, /<strong>Prüfhinweis zum Entwurf:<\/strong>/);
    assert.equal(h.controller.snapshot().pages[0].images[0].draftNote, image.draftNote, "Originalfrage bleibt erhalten");
    const changed = copy(initial); changed.pages[0].images[0].status = "changed";
    const second = harness({ initial: changed }); await second.controller.open();
    assert.match(second.nodes.get("[data-alt-page]").innerHTML, /<strong>Prüfhinweis zum Entwurf:<\/strong>/);
  }
});

test("Motivfragen zu Beschriftungen erscheinen bei Hintergrundbildern und Kopf-/Fußlogos überhaupt nicht", async () => {
  for (const change of [{ context: "content", kind: "background" }, { context: "header", kind: "image" }, { context: "footer", kind: "image" }]) {
    const initial = seed(), image = initial.pages[0].images[0];
    Object.assign(image, change, { alt: "", draftText: "", draftDecorative: true, status: "verified",
      approval: { revision: "standard-approval", text: "", decorative: true },
      verification: { method: "public-html", automatic: true }, draftNote: "Stiersprung mit Felix prüfen" });
    const h = harness({ initial }); await h.controller.open();
    assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Automatisch öffentlich geprüft/);
    assert.doesNotMatch(h.nodes.get("[data-alt-page]").innerHTML, /Stiersprung|Prüfhinweis zum Entwurf|Früherer Prüfhinweis/);
    const filter = h.nodes.get("[data-alt-filter]"); filter.value = "notes"; h.dialog.emit("change", { target: filter });
    assert.doesNotMatch(h.nodes.get("[data-alt-pages]").innerHTML, /Papageientaucher/);
    assert.equal(h.controller.snapshot().pages[0].images[0].draftNote, image.draftNote, "Originalaufzeichnung bleibt bytebezogen erhalten");
  }
});

test("Prüfhinweise verwenden den gewünschten unpersönlichen Satz ohne Bildtexte oder Originalaufzeichnungen umzuschreiben", () => {
  const h = harness(), image = seed().pages[0].images[0];
  image.alt = "Felix und Niko fotografieren";
  image.draftNote = "Vorhandene Beschriftung nennt Stiersprung; Foto zeigt ein Stierbild. Bezeichnung vor Übernahme mit Felix prüfen.";
  const before = copy(image), html = h.api.renderAltImageCard(image, { escapeHtml });
  assert.match(html, /Bezeichnung muss vor Übernahme geprüft werden\./);
  assert.doesNotMatch(html, /mit Felix prüfen/);
  assert.match(html, /Felix und Niko fotografieren/);
  assert.deepEqual(image, before);
});

test("Vorhandenen Text beibehalten nutzt einen gebundenen öffentlichen Prüfauftrag ohne CMS- oder separate Freigabeanfrage", async () => {
  const initial = seed(), image = initial.pages[0].images[0];
  Object.assign(image, { status: "draft", draftText: "Vorbereiteter anderer Text", draftSavedAt: "2026-11-01T10:00:00Z" });
  const h = harness({ initial }); await h.controller.open(); h.imageEvent();
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /data-alt-action="keep-existing"[^>]*>Vorhandenen Text beibehalten<\/button>/);
  const before = h.calls.length, revision = h.controller.snapshot().revision;
  assert.equal(await h.controller.keepExisting(imageKey), true);
  assert.equal(h.confirmations.length, 0, "Die bewusste Auswahl reicht bei gespeicherten reversiblen Alternativen.");
  assert.deepEqual(h.calls.slice(before), [{ url: "/api/website/alt-texts/keep-existing", method: "POST", body: {
    revision, pageUrl, imageKey, observationHash: "observation-1", approvalRevision: null, decorative: false } }]);
  assert.equal(h.controller.snapshot().pages[0].images[0].approval.text, image.alt);
  assert.match(h.nodes.get("[data-alt-message]").textContent, /frischen öffentlichen Seitenabruf bestätigt/);
  assert.equal(h.controller.hasUnsavedDrafts(), false);
});

test("Abweichende ungespeicherte Eingabe braucht ausdrückliche Bestätigung und bleibt bei Ablehnung oder Prüfabweichung erhalten", async () => {
  for (const failure of ["decline", "public-mismatch", "unconfirmed-response"]) {
    const h = harness({ confirm: failure !== "decline", fetch(call, { stored }) {
      if (!call.url.endsWith("/keep-existing")) return;
      if (failure === "public-mismatch") throw new Error("Bildunterschrift öffentlich abweichend");
      if (failure === "unconfirmed-response") return copy(stored);
    } });
    await h.controller.open(); h.imageEvent(); h.input("Ungespeicherter eigener Text");
    const before = h.calls.length;
    assert.equal(await h.controller.keepExisting(imageKey), false);
    assert.match(h.confirmations[0].message, /abweichende ungespeicherte Eingabe.*nach erfolgreicher Prüfung verworfen/);
    assert.equal(h.controller.hasUnsavedDrafts(), true);
    assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Ungespeicherter eigener Text/);
    assert.equal(h.controller.snapshot().pages[0].images[0].approval, null);
    if (failure === "decline") assert.equal(h.calls.length, before);
  }
});

test("Bestätigtes Beibehalten verwirft nur die ausdrücklich bestätigte Eingabe; neue Eingaben während der Anfrage bleiben erhalten", async () => {
  for (const lateInput of [false, true]) {
    const h = harness({ fetch(call) { if (lateInput && call.url.endsWith("/keep-existing")) h.input("Während der Prüfung neu eingegeben"); } });
    await h.controller.open(); h.imageEvent(); h.input("Ausdrücklich verworfener Entwurf");
    assert.equal(await h.controller.keepExisting(imageKey), true);
    assert.equal(h.controller.hasUnsavedDrafts(), lateInput);
    if (lateInput) assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Während der Prüfung neu eingegeben/);
    else assert.doesNotMatch(h.nodes.get("[data-alt-page]").innerHTML, /Ausdrücklich verworfener Entwurf/);
  }
});

test("Lesemodus, laufende Prüfung, entfernte oder mehrdeutige Bilder und fehlende Vorschau verhindern Beibehalten vor jeder Anfrage", async () => {
  for (const mode of ["read", "scan", "transfer", "removed", "ambiguous", "missing-preview", "changed-observation", "filename", "empty"]) {
    const initial = seed(), image = initial.pages[0].images[0];
    if (mode === "scan") initial.scan.running = true;
    if (mode === "transfer") initial.transfer = { running: true };
    if (mode === "removed") image.status = "removed";
    if (mode === "ambiguous") image.altVariants = [image.alt, "Andere Verwendung"];
    if (mode === "filename") image.alt = "bird.jpg";
    if (mode === "empty") image.alt = "";
    let editing = true;
    const h = harness({ initial, canEdit: () => editing }); await h.controller.open();
    if (mode !== "missing-preview") h.imageEvent();
    if (mode === "read") editing = false;
    if (mode === "changed-observation") {
      h.input("Eigener Text auf alter Grundlage");
      const changed = copy(initial); changed.revision = "new-revision"; changed.pages[0].images[0].observationHash = "new-observation";
      h.replace(changed); await h.controller.refresh();
    }
    const before = h.calls.length;
    assert.equal(await h.controller.keepExisting(imageKey), false, mode);
    assert.equal(h.calls.length, before, mode);
  }
});

test("Dekorativer leerer Website-Text braucht eine bewusste Einordnung und bestätigt diese vor der öffentlichen Prüfung", async () => {
  const initial = seed(); initial.pages[0].images[0].alt = "";
  const h = harness({ initial }); await h.controller.open(); h.imageEvent();
  assert.equal(await h.controller.keepExisting(imageKey), false);
  h.decorate();
  assert.equal(await h.controller.keepExisting(imageKey), true);
  assert.match(h.confirmations[0].message, /leere Website-Text.*bewusst als dekorativ/);
  assert.equal(h.calls.at(-1).body.decorative, true);
});

test("Geänderte Seite, Revision, Freigabe, Eingabe oder Bedienmodus während der Bestätigung stoppt Beibehalten", async () => {
  for (const drift of ["page", "revision", "approval", "input", "mode", "close"]) {
    let editing = true;
    const h = harness({ canEdit: () => editing }), confirmation = deferred();
    await h.controller.open(); h.imageEvent(); h.input("Abweichender eigener Entwurf"); h.setConfirmPending(confirmation);
    const pending = h.controller.keepExisting(imageKey); await Promise.resolve();
    if (drift === "mode") editing = false;
    else if (drift === "input") h.input("Nach dem Klick neuer eigener Text");
    else if (drift === "close") h.nativeClose();
    else {
      const changed = seed();
      if (drift === "page") { changed.pages.push({ ...copy(changed.pages[0]), url: `${pageUrl}-andere` }); h.replace(changed); await h.controller.refresh(); await h.controller.selectPage(`${pageUrl}-andere`); }
      else { changed.revision = "new-revision"; if (drift === "approval") changed.pages[0].images[0].approval = { revision: "new-approval", text: "Anderer Text" }; h.replace(changed); await h.controller.refresh(); }
    }
    const before = h.calls.length; confirmation.resolve(true);
    assert.equal(await pending, false, drift);
    assert.equal(h.calls.length, before, drift);
    assert.equal(h.controller.hasUnsavedDrafts(), true, drift);
  }
});

test("Doppelklick während der Bestätigung startet keine zweite Bestätigung und keinen zweiten Prüfauftrag", async () => {
  const h = harness(), confirmation = deferred(); await h.controller.open(); h.imageEvent(); h.input("Entwurf zur Entscheidung"); h.setConfirmPending(confirmation);
  const first = h.controller.keepExisting(imageKey); await Promise.resolve();
  assert.equal(await h.controller.keepExisting(imageKey), false);
  assert.equal(h.confirmations.length, 1);
  assert.equal(h.requestClose(), false);
  confirmation.resolve(true); assert.equal(await first, true);
  assert.equal(h.calls.filter((call) => call.url.endsWith("/keep-existing")).length, 1);
});

test("Ein älterer laufender Programmdienst aktiviert Beibehalten erst nach ausgewiesener Unterstützung", async () => {
  for (const capability of [undefined, false]) {
    const initial = seed();
    if (capability === undefined) delete initial.capabilities;
    else initial.capabilities.keepExisting = capability;
    const h = harness({ initial }); await h.controller.open(); h.imageEvent();
    const before = h.calls.length;
    assert.match(h.nodes.get("[data-alt-page]").innerHTML, /data-alt-action="keep-existing"[^>]* disabled/);
    assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Explorer.*neu starten/);
    assert.equal(await h.controller.keepExisting(imageKey), false);
    assert.equal(h.calls.length, before);
  }
});

test("Linke Seitenliste behält ihre Position bei Auswahlwechsel und frischem Status trotz Inhaltsneuaufbau", async () => {
  const initial = seed(), second = copy(initial.pages[0]);
  second.url = `${pageUrl}-zweiteseite`; second.title = "Zweite Seite"; initial.pages.push(second);
  const h = harness({ initial, now: () => Date.parse(initial.pages[0].checkedAt) + 1000 });
  const list = h.nodes.get("[data-alt-pages]");
  let markup = "";
  Object.defineProperty(list, "innerHTML", { get: () => markup, set(value) { markup = value; list.scrollTop = 0; } });
  await h.controller.open();
  list.scrollTop = 428;
  await h.controller.selectPage(second.url);
  assert.equal(list.scrollTop, 428);
  assert.match(h.nodes.get("[data-alt-page]").innerHTML, /Zweite Seite/);
  const updated = copy(initial); updated.revision = "updated-list-status"; h.replace(updated);
  await h.controller.refresh();
  assert.equal(list.scrollTop, 428);
  h.controller.stop();
});

test("Neue Such- und Filterauswahl beginnt die linke Liste oben; weitere Aktualisierung erhält deren neue Position", async () => {
  const h = harness(); await h.controller.open();
  const list = h.nodes.get("[data-alt-pages]"), search = h.nodes.get("[data-alt-search]"), filter = h.nodes.get("[data-alt-filter]");
  list.scrollTop = 428; search.value = "Papagei"; h.dialog.emit("input", { target: search });
  assert.equal(list.scrollTop, 0);
  list.scrollTop = 82; await h.controller.refresh(); assert.equal(list.scrollTop, 82);
  filter.value = "open"; h.dialog.emit("change", { target: filter });
  assert.equal(list.scrollTop, 0);
  h.controller.stop();
});
