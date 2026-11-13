import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { assessSquarespaceGalleryField, createSquarespaceGalleryDriver, squarespacePageNames } from "./squarespace-gallery-driver.mjs";
import { createSquarespaceBrowserAdapter } from "./squarespace-browser.mjs";
import { prepareSquarespaceFigureGallery } from "./squarespace-page-gallery.mjs";
import { isCurrentSquarespaceDisabledPage } from "./squarespace-page-text.mjs";
import { createCmsDispatchBinding, validateCmsTargetObservation } from "../page-authoring/cms-dispatch.mjs";
import { createCmsContentSteps } from "../page-authoring/cms-content-steps.mjs";
import { FN_MAP_CODE, FN_SPECIES_CODE } from "../page-authoring/templates.mjs";

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

test("partielle Artseitenbeobachtung des bestehenden Drivers schaltet weder Anlage noch Schreibzugriff frei", async () => {
  const driver = createSquarespaceGalleryDriver(); let inputs = 0, reads = 0;
  const contents = { getURL: () => 'https://vanilla-gerbil-jwnp.squarespace.com/config/pages', isDestroyed: () => false,
    sendInputEvent() { inputs++; }, mainFrame: { async executeJavaScript() { reads++; return { iframeCount: 0 }; } } };
  const observation = await driver.inspectPageAuthoring(contents);
  assert.equal(observation.status, 'unknown'); assert.equal(observation.fullCapability, false);
  assert.equal(observation.page.saved, null); assert.equal(reads, 1); assert.equal(inputs, 0);
  const browser = createSquarespaceBrowserAdapter({ BrowserWindow: class {}, driver });
  assert.equal(browser.pageAuthoringAvailable, false);
  await assert.rejects(browser.createUnpublishedPage({}), { code: 'SQUARESPACE_PAGE_AUTHORING_UNAVAILABLE' });
  assert.equal(inputs, 0); await browser.close();
});

test("der Squarespace-Treiber verbindet die neue Zielprüfung mit der rein lesenden Artseitenvorbereitung", async () => {
  const admin = "https://vanilla-gerbil-jwnp.squarespace.com/config/pages";
  const parentPath = "/wildlife/heimische-tierwelt", path = parentPath + "/pruefart";
  const parentUrl = "https://www.fnwildlifetravel.de" + parentPath;
  const reads = [], queries = [], catalogActions = [], navigations = [];
  let documentUrl = admin;
  let query = "", opened = false, dirty = false, publicTarget = false, adminOccupied = false;
  let catalogMode = "closed";
  let name = null, nameSelected = false, neutralPath = "/", settingsOpen = false, draftMode = "ready";
  let existingDefault = false, defaultAppearsDuringLookup = false, baselinePreview = "/";
  const draftActions = [], collectionId = "6af48209f064221b1e6a524c";
  const previousRows = { epoch: 100, previewPath: "/", rowCount: 109, titles: ["Alte Prüfseite"], name: null,
    firstSettingsLabel: null, defaultSettingsPresent: false };
  const driver = createSquarespaceGalleryDriver({ waitMs: 1, timeoutMs: 150, fetchPublicTarget: async url => {
    reads.push(url);
    if (defaultAppearsDuringLookup) existingDefault = true;
    const isParent = url === parentUrl;
    const head = isParent ? `<title>Heimische Tierwelt</title><link rel="canonical" href="${parentUrl}">`
      : "<title>FN Wildlife &amp; Travel</title>";
    const attrs = isParent ? ' id="collection-123456789012345678901234"' : "";
    const response = new Response(`<!doctype html><html><head>${head}</head><body${attrs}></body></html>`, {
      status: isParent || publicTarget ? 200 : 404, headers: { "Content-Type": "text/html" },
    });
    Object.defineProperty(response, "url", { value: url });
    return response;
  } });
  const frame = { url: admin, async executeJavaScript(code) {
    const request = JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1));
    assert.equal(request.operation, "draft-collection-observation");
    return { id: settingsOpen && draftMode === "different-settings-page" ? "c".repeat(24) : collectionId, epoch: 101 };
  } };
  const top = { async executeJavaScript(code) {
    const request = JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1));
    if (request.operation === "preview-state") return { mode: dirty ? "editing" : "preview", dialogOpen: false };
    if (request.operation === "draft-name-state" || request.operation === "draft-select-name") {
      if (catalogMode === "closed" && !settingsOpen) return draftMode === "prior-inline-edit" ? null
        : { ...previousRows, previewPath: baselinePreview, defaultSettingsPresent: existingDefault };
      if (catalogMode !== "creation-requested" || settingsOpen || draftMode === "ambiguous-name") return null;
      assert.deepEqual(request.previous, previousRows);
      if (request.operation === "draft-select-name") nameSelected = true;
      const saved = name === null;
      return { ...previousRows, previewPath: neutralPath, rowCount: 110,
        titles: [saved ? "Neuer Entwurf" : "Seite löschen", ...previousRows.titles], name,
        ...(saved ? { firstSettingsLabel: `Seiteneinstellungen ${draftActions.at(-2)}` } : { selected: nameSelected, defaultName: name === "Neue Seite" }) };
    }
    if (request.operation === "draft-settings-open") return { point: { x: 7, y: 1 } };
    if (request.operation === "document-epoch") return 100;
    if (request.operation === "settings-state" && settingsOpen) return { title: draftActions[0], navigationTitle: draftActions[0],
      slug: neutralPath.slice(1), enabled: true, saveAvailable: false, modalId: "m12345678-1234-1234-1234-123456789012" };
    if (request.operation.startsWith("catalog-")) {
      const state = { epoch: 100, mode: catalogMode, previewPath: baselinePreview, modalId: catalogMode === "closed" ? null : "m1" };
      if (request.operation === "catalog-state") return state;
      assert.deepEqual(request.expected, state);
      switch (request.operation) {
        case "catalog-open": return { point: { x: 3, y: 1 } };
        case "catalog-classic": return { point: { x: 4, y: 1 } };
        case "catalog-close": return { point: { x: 5, y: 1 } };
        case "catalog-blank-point": return catalogMode === "classic" ? { point: { x: 6, y: 1 } } : null;
        default: throw new Error(`Unexpected operation: ${request.operation}`);
      }
    }
    if (request.query !== query) return null;
    switch (request.operation) {
      case "search-state": return { epoch: 100, inputId: ":r8:", query,
        mode: !opened ? "closed" : !query ? "empty" : adminOccupied || query === parentPath.slice(1) ? "results" : "no-results" };
      case "search-open": return { point: { x: 1, y: 1 } };
      case "search-close": return { point: { x: 2, y: 1 } };
      case "search-focus": return opened;
      default: throw new Error(`Unexpected operation: ${request.operation}`);
    }
  } };
  frame.parent = top;
  top.framesInSubtree = [top, frame];
  const contents = { getURL: () => documentUrl, isDestroyed: () => false, mainFrame: top,
    async loadURL(url) { navigations.push(url); documentUrl = url; },
    insertText(text) {
      if (catalogMode === "creation-requested" && !opened) {
        assert.equal(nameSelected, true);
        draftActions.push(text);
        name = draftMode === "wrong-title" ? `${text} fremd` : text;
        nameSelected = false;
      } else { queries.push(text); query = text; }
    },
    sendInputEvent({ type, x, keyCode }) {
      if (type === "keyUp" && keyCode === "Enter") {
        draftActions.push("Enter");
        neutralPath = `/${name.toLowerCase().replaceAll(" ", "-")}`;
        frame.url = new URL(neutralPath, admin).href;
        name = null;
      }
      if (type !== "mouseUp") return;
      if (x === 7) { settingsOpen = true; draftActions.push("settings"); return; }
      if (x >= 3) {
        catalogActions.push(x);
        catalogMode = ["pages", "classic", "closed", "creation-requested"][x - 3];
        if (x === 6) name = "Neue Seite";
      } else {
        opened = x === 1;
        if (!opened) query = "";
      }
    },
  };
  const first = await driver.checkNewTarget(contents, path);
  assert.deepEqual(validateCmsTargetObservation(first, path), first);
  assert.equal(opened, false);
  assert.deepEqual(reads, [parentUrl + "/pruefart", parentUrl]);
  assert.deepEqual(queries, [parentPath.slice(1), path.slice(1), parentPath.slice(1), path.slice(1)]);
  const second = await driver.checkNewTarget(contents, path);
  assert.notEqual(first.observationId, second.observationId);
  publicTarget = true;
  await assert.rejects(driver.checkNewTarget(contents, path), { code: "SQUARESPACE_PUBLIC_TARGET_UNCONFIRMED" });
  assert.equal(queries.length, 8);
  dirty = true;
  await assert.rejects(driver.checkNewTarget(contents, path), { code: "SQUARESPACE_TARGET_NOT_CONFIRMED" });
  assert.equal(reads.length, 6);
  assert.deepEqual(catalogActions, []);

  dirty = publicTarget = false;
  const title = "Prüfart", blocks = [{ type: "heading", level: 3, text: title }, { type: "code", code: FN_SPECIES_CODE },
    { type: "code", code: FN_MAP_CODE }, { type: "gallery", items: [] }];
  const plan = { schemaVersion: 2, publish: false, planHash: "a".repeat(64), target: { path }, structure: { title, path, slots: blocks },
    readback: { schemaVersion: 1, expectation: { schemaVersion: 1, title, path, blocks } } };
  await assert.rejects(driver.prepareUnpublishedPage(contents, plan, { contentSteps: [] }), { code: "SQUARESPACE_EDITOR_NOT_READY" });
  draftMode = "prior-inline-edit";
  await assert.rejects(driver.prepareUnpublishedPage(contents, plan, { contentSteps: createCmsContentSteps(plan) }),
    { code: "SQUARESPACE_EDITOR_NOT_READY" });
  draftMode = "ready";
  assert.equal(reads.length, 6);
  documentUrl = new URL("/config/design?tab=styles", admin).href;
  await assert.rejects(driver.prepareUnpublishedPage(contents, plan, { contentSteps: createCmsContentSteps(plan) }),
    { code: "SQUARESPACE_TARGET_NOT_CONFIRMED" });
  assert.deepEqual(navigations, []);
  documentUrl = new URL("/config/?return=dashboard#home", admin).href;
  const ready = await driver.prepareUnpublishedPage(contents, plan, { contentSteps: createCmsContentSteps(plan) });
  assert.deepEqual(navigations, [admin]);
  assert.deepEqual(Object.keys(ready), ["ready", "planHash", "targetPath", "targetObservation"]);
  assert.equal(ready.ready, true);
  assert.equal(ready.targetPath, path);
  assert.equal(ready.planHash, plan.planHash);
  assert.notEqual(validateCmsTargetObservation(ready.targetObservation, path).observationId, second.observationId);
  assert.equal(catalogMode, "closed");
  assert.deepEqual(catalogActions, [3, 4, 5]);

  const binding = createCmsDispatchBinding({ projectId: "p-test", attemptId: "a-test", dispatchId: "d-test",
    planHash: plan.planHash, targetPath: path });
  const expectedNeutralPath = "/fn-artseitenentwurf-d-test", neutralQuery = expectedNeutralPath.slice(1), controlQuery = parentPath.slice(1);
  assert.deepEqual(await driver.checkNeutralDraftVacancy(contents, binding), { path: expectedNeutralPath, exists: false });
  assert.deepEqual(reads.slice(-2), ["https://www.fnwildlifetravel.de" + expectedNeutralPath, parentUrl]);
  assert.deepEqual(queries.slice(-4), [controlQuery, neutralQuery, controlQuery, neutralQuery]);
  adminOccupied = true;
  await assert.rejects(driver.checkNeutralDraftVacancy(contents, binding), { code: "SQUARESPACE_TARGET_NOT_CONFIRMED" });
  assert.deepEqual(queries.slice(-2), [controlQuery, neutralQuery]);
  assert.equal(opened, false);
  const searchCount = queries.length;
  publicTarget = true;
  await assert.rejects(driver.checkNeutralDraftVacancy(contents, binding), { code: "SQUARESPACE_PUBLIC_TARGET_UNCONFIRMED" });
  assert.equal(queries.length, searchCount);
  assert.deepEqual(catalogActions, [3, 4, 5]);

  publicTarget = adminOccupied = false;
  let authorizationChecks = 0;
  await assert.rejects(driver.createNeutralDraft(contents, binding, { assertCurrent: async () => ++authorizationChecks === 1 }),
    { code: "SQUARESPACE_PAGE_CREATION_NOT_AUTHORIZED" });
  assert.deepEqual(catalogActions.slice(-3), [3, 4, 5]);
  const options = { assertCurrent: async () => true };
  assert.deepEqual(await driver.createNeutralDraft(contents, binding, options), { path: expectedNeutralPath, pageId: collectionId });
  assert.deepEqual(catalogActions.slice(-3), [3, 4, 6]);
  assert.deepEqual(draftActions, [binding.placeholderTitle, "Enter", "settings"]);
  const afterRequest = [...catalogActions];
  await assert.rejects(driver.createNeutralDraft(contents, binding, options), { code: "SQUARESPACE_PAGE_CREATION_NOT_AUTHORIZED" });
  assert.deepEqual(catalogActions, afterRequest);

  for (const mode of ["ambiguous-name", "wrong-title", "different-settings-page", "revoked-after-click"]) {
    Object.assign(frame, { url: admin });
    catalogMode = "closed"; neutralPath = "/"; settingsOpen = false; draftMode = mode;
    draftActions.length = 0;
    authorizationChecks = 0;
    const next = createCmsDispatchBinding({ projectId: binding.projectId, attemptId: binding.attemptId,
      dispatchId: mode, planHash: plan.planHash, targetPath: path });
    await assert.rejects(driver.createNeutralDraft(contents, next, { assertCurrent: async () => mode !== "revoked-after-click" || ++authorizationChecks <= 2 }),
      { code: mode === "revoked-after-click" ? "SQUARESPACE_PAGE_CREATION_NOT_AUTHORIZED" : "SQUARESPACE_PAGE_CREATION_UNCONFIRMED" });
    assert.deepEqual(draftActions, mode === "different-settings-page" ? [next.placeholderTitle, "Enter", "settings"]
      : mode === "wrong-title" ? [next.placeholderTitle] : []);
    const attempts = catalogActions.length;
    await assert.rejects(driver.createNeutralDraft(contents, next, options), { code: "SQUARESPACE_PAGE_CREATION_NOT_AUTHORIZED" });
    assert.equal(catalogActions.length, attempts);
  }

  catalogMode = "closed"; settingsOpen = false; draftMode = "ready";
  const guardedBinding = createCmsDispatchBinding({ projectId: binding.projectId, attemptId: binding.attemptId,
    dispatchId: "guarded-default", planHash: plan.planHash, targetPath: path });
  for (const [run, code] of [
    [() => driver.prepareUnpublishedPage(contents, plan, { contentSteps: createCmsContentSteps(plan) }), "SQUARESPACE_EDITOR_NOT_READY"],
    [() => driver.createNeutralDraft(contents, guardedBinding, options), "SQUARESPACE_PAGE_CREATION_NOT_AUTHORIZED"],
  ]) {
    for (const scenario of ["existing-default", "default-preview", "unknown-default-marker", "appears-during-lookup"]) {
      existingDefault = scenario === "unknown-default-marker" ? undefined : scenario === "existing-default";
      baselinePreview = scenario === "default-preview" ? "/neue-seite" : "/";
      defaultAppearsDuringLookup = scenario === "appears-during-lookup";
      const before = [...catalogActions], readCount = reads.length;
      await assert.rejects(run(), { code }, scenario);
      assert.deepEqual(catalogActions, before, scenario);
      assert.equal(reads.length, readCount + (defaultAppearsDuringLookup ? 2 : 0), scenario);
    }
  }
});

test("Die Inhaltsbibliothek bindet zwei identische Dateinamensbefunde an den FN-Medienursprung", async () => {
  const libraryUrl = "https://vanilla-gerbil-jwnp.squarespace.com/config/asset-library";
  const fileName = "fn-cms-bildtest-1.png", assetId = "96379ea8-ec7f-45b3-bbbe-0b1f70c6357e", library = "67556be0338df718ea064210";
  const cdn = "https://images.squarespace-cdn.com";
  const sourceUrl = `${cdn}/content/${library}/${assetId}/${fileName}?content-type=image%2Fpng`;
  const canonical = `${cdn}/content/v1/${library}/${assetId}/${fileName}`;
  const found = { epoch: 100, status: "match", fileName, sourceUrl, uploadReady: true };
  const empty = { ...found, status: "empty", sourceUrl: null };
  const driver = createSquarespaceGalleryDriver();
  let reads = 0, documentUrl = libraryUrl, observations = [];
  const contents = { getURL: () => documentUrl, isDestroyed: () => false,
    mainFrame: { async executeJavaScript(code) {
      assert.deepEqual(JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1)), { fileName });
      return observations[reads++];
    } },
  };
  async function inspect(...states) {
    observations = states;
    reads = 0;
    return driver.inspectAssetLibrary(contents, fileName);
  }
  assert.deepEqual(await inspect(found, found), { ...found, sourceUrl: canonical, assetId });
  assert.equal(reads, 2);
  assert.deepEqual(await inspect(empty, empty), { ...empty, assetId: null });
  for (const changed of [{ ...found, epoch: 101 }, { ...found, uploadReady: false }, empty, null]) {
    assert.equal(await inspect(found, changed), null);
  }
  for (const invalid of [
    { ...found, sourceUrl: sourceUrl.replace(library, "f".repeat(24)) },
    { ...found, sourceUrl: sourceUrl.replace(fileName, "anderes-bild.png") },
    { ...found, sourceUrl: sourceUrl.replace("image%2Fpng", "image%2Fjpeg") },
    { ...found, sourceUrl: sourceUrl + "&format=300w" },
    { ...found, sourceUrl: sourceUrl.replace(cdn, "https://example.test") },
    { ...found, sourceUrl: canonical },
  ]) assert.equal(await inspect(invalid, invalid), null);
  documentUrl = libraryUrl + "/file-details/" + assetId;
  assert.equal(await inspect(found, found), null);
  assert.equal(reads, 0);
});

function draftSettingsFixture({ enabled = true, occupiedOnRecheck = false, changedCollection = false, retainOldSlug = false,
  persistedBlank = false } = {}) {
  const admin = "https://vanilla-gerbil-jwnp.squarespace.com/config/pages";
  const plan = { planHash: "a".repeat(64), target: { path: "/wildlife/heimische-tierwelt/pruefart" },
    structure: { title: "Prüfart" } };
  const dispatchBinding = createCmsDispatchBinding({ projectId: "p-test", attemptId: "a-test", dispatchId: "d-test",
    planHash: plan.planHash, targetPath: plan.target.path });
  const pageId = "6ae89f789cf13b0c388e4ccf";
  const neutralPath = persistedBlank ? "/neue-seite" : "/fn-artseitenentwurf-d-test";
  const initialTitle = persistedBlank ? "Neue Seite" : dispatchBinding.placeholderTitle;
  const url = path => new URL(path, "https://www.fnwildlifetravel.de").href;
  const events = [];
  let serial = 0, observations = 0, open = true, focused = null;
  let entry, epoch = 100, editing = false, editReads = 0, editorPolls = 0, collectionReads = 0, disableReads = 0;
  let editorReadyAt = 0;
  let configuredPreview = url(neutralPath);
  let saved = { title: initialTitle, navigationTitle: initialTitle,
    slug: neutralPath.slice(1), enabled, saveAvailable: false };
  let fields = { ...saved };
  const state = () => ({ ...fields, modalId: `m12345678-1234-1234-1234-${String(serial).padStart(12, "0")}` });
  const payload = code => JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1));
  const point = x => ({ point: { x, y: 1 } });
  const top = { async executeJavaScript(code) {
    const { operation, scope, pageUrl: requested, expected, field, names } = payload(code);
    if (scope === "settings") return open ? { title: fields.title, slug: fields.slug, displayedEnabled: fields.enabled,
      modalId: state().modalId, previewSource: frame.url } : null;
    if (operation === "document-epoch") return epoch;
    if (operation === "preview-state") {
      if (editing && entry === "blank-recovers" && ++editorPolls === 3) frame.url = configuredPreview;
      return { iframeCount: 1, iframeSrc: configuredPreview, mode: editing ? "editing" : "preview", dialogOpen: open,
        saveDisabled: editing && entry !== "dirty-editor" };
    }
    if (operation === "edit-page") {
      assert.equal(requested, configuredPreview);
      return !open && !editing ? point(entry === "moved-edit" && ++editReads > 1 ? 6 : 5) : null;
    }
    if (operation === "section-catalog-trigger") {
      if (editing && entry === "slow-first-section-control") return { frameTriggerAllowed: true };
      return editing && entry !== "missing-first-section-control" ? point(8) : null;
    }
    if (operation === "map-gallery-hover" && entry === "slow-first-section-control") return point(8);
    if (operation === "draft-settings-open") {
      return !open && requested === frame.url && names[0] === saved.navigationTitle ? point(4) : null;
    }
    if (!open || requested !== frame.url) return null;
    if (operation === "settings-state") return state();
    assert.deepEqual(expected, state());
    switch (operation) {
      case "settings-disable": return fields.enabled && !fields.saveAvailable
        ? point(entry === "moved-disable" && ++disableReads > 1 ? 7 : 1) : null;
      case "settings-save":
        if (entry === "changed-page-at-deactivation-save") entry = "foreign-preview-at-deactivation-save";
        return !fields.enabled && fields.saveAvailable ? point(2) : null;
      case "settings-close": return !fields.saveAvailable ? point(3) : null;
      case "settings-focus": focused = field; return !fields.enabled;
      default: throw new Error(`Unexpected operation: ${operation}`);
    }
  } };
  const frame = { parent: top, url: url(neutralPath), async executeJavaScript(code) {
    const request = payload(code);
    if (request.operation === "draft-collection-observation") {
      if (request.pageUrl !== frame.url || changedCollection) return null;
      const second = ++collectionReads === 2;
      return { id: entry === "collection-drift" && second ? "e".repeat(24) : pageId,
        epoch: entry === "frame-reloaded" && second ? 201 : 200 };
    }
    if (request.operation === "section-catalog-anchor") {
      assert.equal(request.sectionId, null);
      return editing && (entry !== "slow-editor-frame" || performance.now() >= editorReadyAt) && entry !== "nonempty-editor"
        && request.pageId === pageId && request.pageUrl === frame.url;
    }
    if (request.operation === "section-catalog-frame-trigger" && entry === "slow-first-section-control") {
      assert.equal(request.sectionId, null);
      assert.equal(request.pageId, pageId);
      return performance.now() >= editorReadyAt ? { ...point(8), viewport: { width: 800, height: 500 }, epoch: 200 } : null;
    }
    assert.equal(request.operation, "draft-collection-identity");
    return request.pageId === pageId && request.pageUrl === frame.url && !changedCollection
      && entry !== "foreign-preview-at-deactivation-save" && !(editing && entry === "foreign-collection");
  } };
  top.framesInSubtree = [top, frame];
  const contents = { mainFrame: top, getURL: () => admin, isDestroyed: () => false, sendInputEvent({ type, x }) {
    if (type !== "mouseUp") return;
    switch (x) {
      case 1: events.push("disable"); fields = { ...fields, enabled: false, saveAvailable: true }; break;
      case 2: {
        assert.equal(fields.enabled, false);
        events.push(`save:${fields.slug}`);
        if (retainOldSlug && fields.slug !== saved.slug) break;
        saved = { ...fields, saveAvailable: false };
        fields = { ...saved };
        configuredPreview = frame.url = url(`/${saved.slug}`);
        break;
      }
      case 3: {
        events.push("close"); open = false;
        if (entry === "blank-recovers" || entry === "persistent-blank") frame.url = "about:blank";
        if (entry === "changed-epoch") epoch++;
        if (entry === "foreign-preview") configuredPreview = frame.url = url("/andere-seite");
        break;
      }
      case 4: events.push("open"); open = true; serial++; fields = { ...saved }; break;
      case 5:
        events.push("edit");
        editing = true;
        if (["slow-editor-frame", "slow-first-section-control"].includes(entry)) editorReadyAt = performance.now() + 140;
        break;
      default: throw new Error(`Unexpected input: ${x}`);
    }
  }, async insertText(value) {
    assert.ok(open && focused && !fields.enabled && !saved.enabled);
    events.push(`type:${focused}`);
    fields = { ...fields, [focused]: value, saveAvailable: true };
    focused = null;
  } };
  const options = { pageId, dispatchBinding, assertWritable: async scope => {
    assert.deepEqual(scope, { pageId, path: plan.target.path });
    return true;
  } };
  const driver = createSquarespaceGalleryDriver({ waitMs: 1, timeoutMs: 100 });
  return { driver, contents, plan, options, neutralPath, events,
    setEntry(scenario) {
      entry = scenario;
      if (scenario === "dirty-settings") fields.saveAvailable = true;
      if (scenario === "changed-modal") serial++;
      if (scenario === "foreign-title") fields.navigationTitle = "Andere Seite";
      if (scenario === "unloaded-preview") frame.url = "about:blank";
      if (scenario === "enabled-during-upload") fields.enabled = true;
    },
    exitEditor({ reenabled = false } = {}) {
      editing = open = false;
      saved.enabled = reenabled;
      epoch++;
    },
    disable: () => driver.disableNeutralDraftSettings(contents, plan, options),
    assign: disabledNeutralDraft => driver.assignUnpublishedDraftSettings(contents, plan, { ...options, disabledNeutralDraft,
      checkTargetAvailable: async path => {
        events.push("availability");
        assert.equal(path, plan.target.path);
        return { path, parentPath: "/wildlife/heimische-tierwelt", parentExists: true, online: true,
          exists: occupiedOnRecheck && observations === 1, observationId: `observation-${++observations}`, checkedAt: new Date().toISOString() };
      },
    }),
  };
}

test("neutrale Seite zuerst deaktiviert speichern und wieder öffnen, danach Ziel separat speichern und prüfen", async () => {
  const f = draftSettingsFixture();
  const neutral = await f.disable();
  const proof = await f.assign(neutral);
  assert.equal(isCurrentSquarespaceDisabledPage(proof, f.contents, f.options.pageId, f.options.dispatchBinding,
    { expectedTitle: f.plan.structure.title }), true);
  assert.deepEqual(f.events, ["disable", `save:${f.neutralPath.slice(1)}`, "close", "open", "availability",
    "type:title", "type:navigationTitle", "type:slug", "availability", `save:${f.plan.target.path.slice(1)}`, "close", "open"]);
  await assert.rejects(f.assign(neutral), { code: "SQUARESPACE_DRAFT_SETTINGS_UNCONFIRMED" });
});

test("unbekannte Seitenkennung, unbelegte Deaktivierung und neu belegter Zielslug stoppen die Zuordnung", async () => {
  const wrong = draftSettingsFixture({ changedCollection: true });
  await assert.rejects(wrong.disable(), { code: "SQUARESPACE_DRAFT_SETTINGS_UNCONFIRMED" });
  assert.deepEqual(wrong.events, []);
  const occupied = draftSettingsFixture({ enabled: false, occupiedOnRecheck: true });
  await assert.rejects(occupied.assign({}), { code: "SQUARESPACE_DRAFT_SETTINGS_UNCONFIRMED" });
  assert.deepEqual(occupied.events, []);
  await assert.rejects(occupied.assign(await occupied.disable()), { code: "target_not_new" });
  assert.deepEqual(occupied.events, ["close", "open", "availability", "type:title", "type:navigationTitle", "type:slug", "availability"]);
});

test("Deaktivierung stoppt vor einem verschobenen Schalter und speichert nicht bei geänderter Vorschauseite", async () => {
  for (const [scenario, expected] of [["moved-disable", []], ["changed-page-at-deactivation-save", ["disable"]]]) {
    const f = draftSettingsFixture();
    f.setEntry(scenario);
    await assert.rejects(f.disable(), { code: "SQUARESPACE_DRAFT_SETTINGS_UNCONFIRMED" }, scenario);
    assert.deepEqual(f.events, expected, scenario);
  }
});

test("ein unklarer Speichervorgang der Zieleinstellungen erzeugt keinen Schreibnachweis und ist nicht blind wiederholbar", async () => {
  const f = draftSettingsFixture({ enabled: false, retainOldSlug: true });
  const neutral = await f.disable();
  await assert.rejects(f.assign(neutral), /nicht eindeutig bestätigt/);
  await assert.rejects(f.assign(neutral), { code: "SQUARESPACE_DRAFT_SETTINGS_UNCONFIRMED" });
  assert.deepEqual(f.events.filter(event => event.startsWith("save:")), [`save:${f.plan.target.path.slice(1)}`]);
});

test("Der zugeordnete Entwurf öffnet nur denselben geladenen Editor und erhält danach einen frischen Deaktivierungsnachweis", async () => {
  for (const scenario of [undefined, "blank-recovers", "slow-editor-frame", "slow-first-section-control"]) {
    const f = draftSettingsFixture();
    const disabledPage = await f.assign(await f.disable());
    const options = { ...f.options, disabledPage };
    f.events.length = 0;
    f.setEntry(scenario);
    assert.deepEqual(await f.driver.openAssignedDraftEditor(f.contents, f.plan, options), {
      status: "editing", pageId: f.options.pageId, path: f.plan.target.path,
    });
    assert.deepEqual(f.events, ["close", "edit"]);
    await assert.rejects(f.driver.reconfirmAssignedDraftSettings(f.contents, f.plan, options), { code: "SQUARESPACE_DRAFT_SETTINGS_UNCONFIRMED" });
    f.exitEditor();
    const fresh = await f.driver.reconfirmAssignedDraftSettings(f.contents, f.plan, options);
    assert.notEqual(fresh, disabledPage);
    assert.equal(isCurrentSquarespaceDisabledPage(fresh, f.contents, f.options.pageId, f.options.dispatchBinding), true);
    assert.deepEqual(f.events, ["close", "edit", "open"]);
  }
});

test("Editorübergang stoppt bei geändertem Dialog, fremder Vorschau, fehlender Freigabe oder nicht sauber geladenem Editor", async () => {
  for (const [scenario, expected] of [
    ["dirty-settings", []], ["changed-modal", []], ["changed-epoch", ["close"]], ["foreign-preview", ["close"]],
    ["moved-edit", ["close"]], ["approval-withdrawn", ["close"]], ["persistent-blank", ["close", "edit"]],
    ["dirty-editor", ["close", "edit"]], ["nonempty-editor", ["close", "edit"]], ["foreign-collection", ["close", "edit"]],
    ["missing-first-section-control", ["close", "edit"]],
  ]) {
    const f = draftSettingsFixture();
    const disabledPage = await f.assign(await f.disable());
    f.events.length = 0;
    f.setEntry(scenario);
    await assert.rejects(f.driver.openAssignedDraftEditor(f.contents, f.plan, { ...f.options, disabledPage,
      assertWritable: async () => scenario !== "approval-withdrawn" || !f.events.includes("close"),
    }), { code: "SQUARESPACE_DRAFT_EDITOR_UNCONFIRMED" }, scenario);
    assert.deepEqual(f.events, expected, scenario);
  }
});

test("Erneute Deaktivierungsprüfung ist an Auftrag und Seite gebunden und meldet eine wieder aktivierte Seite", async () => {
  const f = draftSettingsFixture(), other = draftSettingsFixture();
  const disabledPage = await f.assign(await f.disable());
  const options = { ...f.options, disabledPage };
  await assert.rejects(f.driver.reconfirmAssignedDraftSettings(other.contents, f.plan, options), { code: "SQUARESPACE_DRAFT_SETTINGS_UNCONFIRMED" });
  f.events.length = 0;
  await f.driver.openAssignedDraftEditor(f.contents, f.plan, options);
  f.exitEditor({ reenabled: true });
  await assert.rejects(f.driver.reconfirmAssignedDraftSettings(f.contents, f.plan, options), { code: "SQUARESPACE_DRAFT_SETTINGS_UNCONFIRMED" });
  assert.deepEqual(f.events, ["close", "edit", "open"]);
  assert.deepEqual(other.events, []);
});

async function authoringSaveFixture({ preChanged = false, reopenedChanged = false, reloadChangesEpoch = true, keepDirty = false,
  staleSettings = false, withGallery = false, reversedAfterReload = false, extraPreviewImage = false,
  moduleDrift = null, blankAfterReload = false, blankAfterEdit = false, codeDrift = null, blankPreviewDocument, auxiliaryFramesAfterReload = [],
  showGalleryCaptions = false, galleryTextDrift = null, figuresInsertion = null, codeInsertion = null, layoutDrift = null,
  onSaveControlRead, classicPicker, sectionCatalog, renderedText, fluidOrderDrift, nativeTextIds, nativeCodeMode, nativePublicMode,
  createFromBlank = false, groupedMap, preselectedCode = false, retainsCodeSelection = false, recheckMode, restoreDefaultOnEmptyClose = false,
  corruptReplacement = false,
  timeoutMs = createFromBlank ? 200 : 14 } = {}) {
  const targetPath = "/wildlife/heimische-tierwelt/pruefart", title = "Prüfart", planHash = "a".repeat(64);
  const admin = "https://vanilla-gerbil-jwnp.squarespace.com/config/pages", preview = "https://www.fnwildlifetravel.de" + targetPath;
  const pageId = "6ae89f789cf13b0c388e4ccf";
  const publicReads = [];
  let driftDuringPublicCheck = false;
  const driver = createSquarespaceGalleryDriver({ timeoutMs, waitMs: 1, enablePageAuthoring: createFromBlank || recheckMode !== undefined,
    fetchPublicTarget: async (url, options) => {
    const parentUrl = preview.slice(0, preview.lastIndexOf("/"));
    const target = url === preview || createFromBlank && url === "https://www.fnwildlifetravel.de/fn-artseitenentwurf-d-test";
    assert.ok(target || url === parentUrl);
    assert.equal(options.credentials, "omit");
    publicReads.push(url);
    if (nativePublicMode === "reload-during-before-save-check" && publicReads.length === 3
        || nativePublicMode === "reload-during-public-check" && publicReads.length === 5) epoch++;
    if (nativePublicMode === "content-drift-during-before-save-check" && publicReads.length === 3) driftDuringPublicCheck = true;
    const targetPublic = recheckMode === "public" || nativePublicMode === "public-target" || nativePublicMode === "public-before-save" && publicReads.length > 2
      || nativePublicMode === "public-after-save" && saved;
    const status = target ? (targetPublic ? 200 : 404) : (nativePublicMode === "missing-parent" ? 404 : 200);
    const body = target ? '<title>FN Wildlife &amp; Travel</title></head><body>'
      : `<title>Heimische Tierwelt</title><link rel="canonical" href="${parentUrl}"></head><body id="collection-${pageId}">`;
    const response = new Response(`<!doctype html><html><head>${body}</body></html>`, { status, headers: { "Content-Type": "text/html" } });
    Object.defineProperty(response, "url", { value: url });
    return response;
  } });
  const sectionId = "6ae8b0cab56a3a057a00a010", assetIds = ["e96eee26-38cc-4958-ab2c-cf4ce5b0cd76", "96379ea8-ec7f-45b3-bbbe-0b1f70c6357e"];
  const figureBlockId = "block-000000000000000000000099";
  const photoText = assetIds.map((_, index) => ({ alt: `Motiv ${index + 1}`, caption: showGalleryCaptions ? `Motiv ${index + 1}` : "",
    decorative: false, attribution: "" }));
  if (figuresInsertion) Object.assign(photoText[0], { caption: "Beschriftung", attribution: "Bildnachweis" });
  const galleryImages = photoText.map((photo, order) => ({ ...photo, id: `usage-${order}`, assetId: `original-${order}`,
    sha256: String(order).repeat(64), bytes: 1000 + order, mimeType: "image/png", order }));
  const blocks = [{ type: "heading", level: 3, text: title }, { type: "code", code: FN_SPECIES_CODE },
    { type: "richtext", blocks: [{ type: "paragraph", text: "Freigegebener Fachtext" }] }, { type: "code", code: FN_MAP_CODE },
    { type: "gallery", items: withGallery ? photoText : [] }];
  const slots = [...blocks.slice(0, -1), { type: "gallery", items: withGallery ? galleryImages : [] }];
  const mapElements = groupedMap ? [{ type: "heading", level: 4, text: "Verbreitungskarte & Quellen" },
    { type: "paragraph", text: "Begleittext für <Region>" }] : undefined;
  if (mapElements) {
    const [heading, paragraph] = mapElements;
    blocks.splice(3, 0, heading, { type: "richtext", blocks: [paragraph] });
    slots.splice(3, 1, { ...heading, sectionId: "map" }, { type: "richtext", sectionId: "map" },
      { type: "code", code: FN_MAP_CODE, module: "existing-fn-map" });
  }
  const galleryUpload = withGallery ? { ...(figuresInsertion ? { layout: "figures", blockId: figureBlockId } : { sectionId }), mediaBindings: galleryImages.map((photo, index) => ({
    usageId: photo.id, assetId: photo.assetId, sha256: photo.sha256, bytes: photo.bytes, mimeType: photo.mimeType,
    cmsAssetId: assetIds[index], cmsItemId: String(index + 1).repeat(24),
    ...(figuresInsertion ? { sourceUrl: `https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/${assetIds[index]}/fixture.png` } : {}),
  })) } : undefined;
  const plan = { schemaVersion: 2, publish: false, planHash, target: { path: targetPath }, structure: { title, slots },
    readback: { schemaVersion: 1, expectation: { schemaVersion: 1, path: targetPath, title, blocks } } };
  const dispatchBinding = createCmsDispatchBinding({ projectId: "p-test", attemptId: "a-test", dispatchId: "d-test", planHash, targetPath });
  const actions = [], codeActions = [], inserted = [], pasted = [], writtenCode = new Map(), createdBlocks = [];
  const replacementEvents = [];
  const pickerEvents = [];
  let pickerTriggerReads = 0, sectionTriggerReads = 0;
  const textActivations = [];
  const textIds = nativeTextIds ? ["block-yui_3_17_2_1_1794333258856_1314", "block-yui_3_17_2_1_1794333258856_1400"]
    : ["block-000000000000000000000001", "block-000000000000000000000002"];
  const speciesId = "block-yui_3_17_2_1_1765559140871_2894", mapId = "block-yui_3_17_2_1_1765559140871_3821";
  const codeModalId = "m12345678-1234-1234-1234-1234567890ac";
  let epoch = 100, editing = true, saved = false, reloaded = false, modal = true, selectedBlock = null, activeText = null;
  let clearedBlock = null;
  let uploadRows, onNativeFile, fileFieldRowIds, selectedDefault = false;
  const input = code => JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1));
  const top = { async executeJavaScript(code) {
    const request = input(code);
    if (recheckMode && request.operation === "select-page") {
      assert.ok(request.names.includes(title));
      return !editing && !modal ? { name: title, point: { x: 162, y: 1 } } : null;
    }
    if (recheckMode && request.operation === "draft-settings-open") return !editing && !modal ? { point: { x: 161, y: 1 } } : null;
    if (recheckMode && request.operation === "settings-state") return !editing && modal ? {
      title, navigationTitle: title, slug: targetPath.slice(1), enabled: recheckMode === "enabled", saveAvailable: false, modalId: codeModalId,
    } : null;
    if (request.accept === "image/png,image/gif,image/jpeg,image/webp") {
      assert.equal(request.adminUrl, admin);
      assert.equal(request.frameUrl, preview);
      if (!modal || !onNativeFile) return null;
      if (request.confirming) return true;
      const current = { modalId: codeModalId, rowIds: fileFieldRowIds ?? uploadRows.map(row => row.cmsItemId) };
      if (!request.file) return current;
      assert.deepEqual(request.expected, current);
      onNativeFile(request.file);
      return true;
    }
    switch (request.scope || request.operation) {
      case "settings": return modal ? { title, slug: targetPath.slice(1), displayedEnabled: false,
        modalId: "m12345678-1234-1234-1234-1234567890ab", previewSource: preview } : { reason: "page-settings-unobserved" };
      case "top": return { iframeCount: 1, iframeSource: preview, modalOpen: modal, ...(uploadRows && { galleryEditor: {
        status: uploadRows.length ? "observed" : "unknown", modalId: codeModalId, renderedRowsEmpty: uploadRows.length === 0,
        items: uploadRows.map((row, index) => ({ ...row, sourceCount: 1, index: String(index) })),
      } }) };
      case "code-dialog": return modal && selectedBlock ? { modalId: codeModalId, iframeSource: preview,
        sourceMatches: request.expectedCode === (nativeCodeMode ? writtenCode.get(selectedBlock) ?? ""
          : selectedBlock === figureBlockId ? (figuresInsertion === "occupied" || writtenCode.has(selectedBlock) ? "Besetzt" : "")
          : codeInsertion ? writtenCode.get(selectedBlock) ?? (codeInsertion === "occupied" ? "Besetzt" : "")
          : selectedBlock === speciesId ? FN_SPECIES_CODE : FN_MAP_CODE)
          && !(selectedBlock === mapId && codeDrift === (reloaded ? "after" : "before")) } : null;
      case "map-gallery-hover": return { point: request.framePoint };
      case "section-catalog-trigger":
        assert.equal(request.sectionId, sectionId);
        return modal ? null : { point: { x: sectionCatalog === "moved" && ++sectionTriggerReads > 1 ? 122 : 121, y: 1 } };
      case "section-catalog-open": return modal && sectionCatalog === "open";
      case "code-block-edit": return selectedBlock ? { point: { x: 113, y: 1 } } : null;
      case "code-dialog-focus": return modal && request.modalId === codeModalId;
      case "code-dialog-focus-empty": return modal && request.modalId === codeModalId
        && figuresInsertion !== "changed-on-focus" && codeInsertion !== "changed-on-focus";
      case "code-dialog-focus-default": return modal && request.modalId === codeModalId && writtenCode.get(selectedBlock) === request.defaultCode;
      case "code-dialog-default-selected": return modal && request.modalId === codeModalId && selectedDefault
        && nativeCodeMode !== "partial-selection" && writtenCode.get(selectedBlock) === request.defaultCode;
      case "document-epoch": return epoch;
      case "preview-state": {
        const blockEditUnqualified = (preselectedCode || retainsCodeSelection) && selectedBlock && request.allowBlockEdit !== true;
        const blank = recheckMode && child.url === "about:blank";
        return { iframeCount: 1, iframeSrc: recheckMode && !blank ? child.url : preview, mode: !editing ? "preview" : blockEditUnqualified ? "unknown" : "editing",
          saveDisabled: saved, dialogOpen: modal,
          ...(reloaded && !editing && blankPreviewDocument !== undefined && { iframeDocumentBlank: blankPreviewDocument }),
          ...(blank && { iframeDocumentBlank: recheckMode !== "blank-unqualified" }) };
      }
      case "save-page": {
        onSaveControlRead?.();
        return retainsCodeSelection && selectedBlock && request.allowBlockEdit !== true ? null : { point: { x: 101, y: 1 } };
      }
      case "exit-page": return retainsCodeSelection && selectedBlock && request.allowBlockEdit !== true ? null : { point: { x: 102, y: 1 } };
      case "edit-page": return { point: { x: 103, y: 1 } };
      default: throw new Error(`Unexpected operation: ${request.operation}`);
    }
  } };
  const child = { parent: top, url: preview, async executeJavaScript(code) {
    const request = input(code);
    if (recheckMode && request.operation === "draft-collection-identity") return !["foreign-collection", "selection-foreign-collection", "blank-foreign"].includes(recheckMode)
      && request.pageId === pageId;
    if (recheckMode && request.operation === "draft-collection-observation") return { id: pageId, epoch };
    if (recheckMode === "section" && request.scope === "frame" && request.expectedFluidSectionId) return { status: "unknown" };
    if (request.scope === "editor-layout") {
      const prepared = [textIds[0], speciesId, textIds[1], mapId, ...(withGallery ? [figureBlockId] : [])]
        .map(id => ({ id, kind: textIds.includes(id) ? "text" : "code", empty: !pasted.includes(id) && !writtenCode.has(id) }));
      const editorBlocks = layoutDrift === "append-blocks"
        ? createdBlocks.map(({ id, kind }) => ({ id, kind, empty: !pasted.includes(id) && !writtenCode.has(id),
          ...(kind === "code" && writtenCode.get(id) === "<p>Hello, World!</p>" && { defaultPlaceholder: true }) }))
        : prepared;
      if (layoutDrift === "wrong-order" || layoutDrift === "moves-after-paste" && pasted.length) {
        [editorBlocks[1], editorBlocks[2]] = [editorBlocks[2], editorBlocks[1]];
      }
      if (layoutDrift === "nonempty") editorBlocks[1].empty = false;
      if (layoutDrift === "gallery-id") editorBlocks.at(-1).id = "block-000000000000000000000098";
      const fluidVisualOrder = editorBlocks.map(block => block.id);
      if (fluidOrderDrift === "editor") fluidVisualOrder.reverse();
      return { status: "partial", page: { id: pageId, url: preview }, editorBlocks,
        ...(request.expectedFluidSectionId && { fluidVisualOrder }) };
    }
    if (request.operation === "section-catalog-anchor") {
      assert.equal(request.pageId, pageId);
      assert.equal(request.sectionId, sectionId);
      return sectionCatalog !== "anchor-missing";
    }
    if (request.operation === "text-block-activation") {
      assert.equal(request.pageId, pageId);
      assert.ok(textIds.includes(request.blockId));
      if (!renderedText || activeText === request.blockId) return { active: true };
      return { point: { x: 117 + textIds.indexOf(request.blockId), y: 1 }, viewport: { width: 800, height: 500 } };
    }
    if (request.html && textIds.includes(request.blockId)) {
      if (renderedText && activeText !== request.blockId) return false;
      pasted.push(request.blockId);
      return true;
    }
    if (["classic-insert-hover", "classic-insert-trigger"].includes(request.operation)) {
      assert.equal(request.pageId, pageId);
      assert.equal(request.blockId, textIds[0]);
      const trigger = request.operation === "classic-insert-trigger";
      if (trigger && (classicPicker === "hidden" || !pickerEvents.length
        || classicPicker === "transient" && ++pickerTriggerReads > 1
        || classicPicker === "second-point" && !pickerEvents.some(([, x]) => x === 119))) return null;
      return { ...(trigger ? { point: { x: 116, y: 1 } } : { points: [115, 119, 120].map(x => ({ x, y: 1 })) }),
        viewport: { width: 800, height: 500 },
        sectionId: trigger && classicPicker === "moved" ? "b".repeat(24) : sectionId };
    }
    if (request.operation === "code-block-point") {
      if (preselectedCode && request.blockId === selectedBlock) return null;
      return { point: { x: request.blockId === figureBlockId ? 114 : request.blockId === speciesId ? 111 : 112, y: 1 }, viewport: { width: 800, height: 500 } };
    }
    if (request.operation === "code-block-selected") return request.blockId === selectedBlock;
    if (request.scope === "code-selection") return request.blockId === selectedBlock ? { page: { id: pageId, url: preview }, blockId: selectedBlock } : null;
    const drift = reloaded ? reopenedChanged : preChanged || driftDuringPublicCheck;
    const galleryOrder = reloaded && reversedAfterReload ? [...assetIds].reverse() : [...assetIds];
    if (extraPreviewImage) galleryOrder.push("10c0f620-764e-48bf-a9d9-345e0cd9c7ed");
    const libraryPath = reloaded ? "v1" : "v2/namespaces/website/libraries";
    const containsFilledCode = id => writtenCode.has(id) && writtenCode.get(id) !== "<p>Hello, World!</p>";
    const galleryReady = withGallery && (!figuresInsertion || containsFilledCode(figureBlockId) && figuresInsertion !== "not-rendered");
    const figureIds = [...(writtenCode.get(figureBlockId) || "").matchAll(/data-fn-item-id="(fn-figure-[a-f0-9]{24})"/g)].map(match => match[1]);
    if (reloaded && galleryTextDrift === "usage-marker") figureIds.reverse();
    const galleries = galleryReady ? [{ ...(figuresInsertion ? { blockId: figureBlockId } : { sectionId }), previewImageCount: galleryOrder.length,
      previewImages: galleryOrder.map((id, index) => {
        const photo = photoText[assetIds.indexOf(id)];
        const libraryId = recheckMode === "foreign-library" ? "f".repeat(24) : "67556be0338df718ea064210";
        return { sourceUrl: `https://images.squarespace-cdn.com/content/${libraryPath}/${libraryId}/${id}/fixture.png?format=750w`,
          renderedText: { alt: !reloaded && galleryTextDrift === "alt" ? "Fremder Alternativtext" : photo?.alt,
            caption: reloaded && galleryTextDrift === "caption" ? null : photo?.caption || null,
            ...(figuresInsertion ? { position: index + 1, attribution: recheckMode === "gallery-credit" ? "Anderer Bildnachweis" : photo?.attribution || null,
              ...(figureIds[index] && { cmsItemId: figureIds[index] }) } : {}) } };
      }) }] : [];
    const textBlocks = [
      { cmsBlockId: textIds[0], source: "editor", blocks: [blocks[0]] },
      { cmsBlockId: textIds[1], source: "editor", blocks: drift ? [{ type: "paragraph", text: "Anderer Fachtext" }] : blocks[2].blocks },
    ];
    if (layoutDrift) for (const block of textBlocks) if (!pasted.includes(block.cmsBlockId)) block.blocks = [{ type: "paragraph", text: "" }];
    const rendered = id => !codeInsertion || (codeInsertion !== "not-rendered" && containsFilledCode(id));
    const species = { kind: rendered(speciesId) ? "species" : "unqualified", id: speciesId };
    const map = { kind: rendered(mapId) ? "map" : "unqualified", id: mapId };
    if (mapElements && map.kind === "map") map.mapElements = groupedMap === "changed-after-save" && reloaded
      ? [{ ...mapElements[0], text: "Andere Kartenüberschrift" }, mapElements[1]] : mapElements;
    if (reloaded && moduleDrift === "identity") map.id = species.id.replace("2894", "3822");
    const contentOrder = [{ kind: "text", id: textBlocks[0].cmsBlockId }, species,
      { kind: "text", id: textBlocks[1].cmsBlockId }, map, ...(galleryReady ? [{ kind: "gallery", id: figuresInsertion ? figureBlockId : sectionId }] : [])];
    if (moduleDrift === "position") [contentOrder[1], contentOrder[3]] = [contentOrder[3], contentOrder[1]];
    if (moduleDrift === "missing") contentOrder.splice(1, 1);
    if (moduleDrift === "foreign") contentOrder.push({ kind: "unqualified" });
    const fluidVisualOrder = contentOrder.map(block => block.id);
    if (fluidOrderDrift === "before-save" || fluidOrderDrift === "after-reopen" && reloaded) fluidVisualOrder.reverse();
    return { status: "partial", page: { id: pageId, url: preview }, textBlocks, galleries, contentOrder,
      ...(request.expectedFluidSectionId && { fluidVisualOrder }) };
  } };
  top.framesInSubtree = [top, child];
  const webContents = { mainFrame: top, getURL: () => admin, async insertText(html) {
    if (clearedBlock !== null) {
      assert.equal(modal, true);
      assert.equal(selectedBlock, clearedBlock);
      assert.equal(actions.includes("save"), false);
      replacementEvents.push(["insert", selectedBlock]);
    }
    inserted.push(html);
    writtenCode.set(selectedBlock, codeInsertion === "wrong-source" || corruptReplacement && clearedBlock !== null ? "Geänderter Code" : html);
  }, async loadURL(url) {
    assert.equal(url, admin); actions.push("reload"); reloaded = true;
    if (blankAfterReload) child.url = "about:blank";
    top.framesInSubtree.push(...auxiliaryFramesAfterReload.map(url => ({ parent: top, url })));
    if (reloadChangesEpoch) epoch++;
  }, sendInputEvent(event) {
    if ([115, 116, 119, 120].includes(event.x)) pickerEvents.push([event.type, event.x]);
    if (classicPicker === "frame-changed" && event.type === "mouseMove") child.url = "about:blank";
    if (event.type === "keyDown" && event.keyCode === "Escape") {
      if (clearedBlock !== null) {
        assert.equal(selectedBlock, clearedBlock);
        replacementEvents.push(["close", clearedBlock]);
        if (restoreDefaultOnEmptyClose && !writtenCode.has(clearedBlock)) writtenCode.set(clearedBlock, "<p>Hello, World!</p>");
        clearedBlock = null;
      }
      codeActions.push("close"); modal = false; selectedDefault = false;
      if (!retainsCodeSelection) selectedBlock = null;
    }
    if (nativeCodeMode && event.type === "keyDown" && event.keyCode === "A" && event.modifiers.includes("control")) {
      selectedDefault = true; codeActions.push("select-default");
    }
    if (nativeCodeMode && event.type === "keyDown" && event.keyCode === "Backspace") {
      assert.ok(selectedDefault && modal && selectedBlock);
      assert.equal(writtenCode.get(selectedBlock), "<p>Hello, World!</p>");
      writtenCode.delete(selectedBlock); selectedDefault = false; codeActions.push("clear-default");
      clearedBlock = selectedBlock;
      replacementEvents.push(["clear", selectedBlock]);
    }
    if (event.type !== "mouseUp") return;
    if (event.x === 161) { assert.ok(recheckMode && !editing && !modal); actions.push("settings"); modal = true; }
    if (event.x === 162) {
      assert.ok(recheckMode && !editing && !modal);
      actions.push("select");
      if (recheckMode !== "blank-unqualified") child.url = preview;
    }
    if (event.x === 121) {
      actions.push("section-catalog-click");
      if (sectionCatalog === "frame-changed") child.url = "about:blank";
      else modal = true;
    }
    if ([117, 118].includes(event.x)) {
      const id = textIds[event.x - 117];
      selectedBlock = null;
      textActivations.push(id);
      if (renderedText === "page-changed") child.url = "about:blank";
      else if (renderedText !== "stays-rendered") activeText = id;
    }
    if (event.x === 111 || event.x === 112) { selectedBlock = event.x === 111 ? speciesId : mapId; codeActions.push(event.x === 111 ? "species" : "map"); }
    if (event.x === 114) { selectedBlock = figureBlockId; codeActions.push("gallery"); }
    if (event.x === 113) { modal = true; codeActions.push("open"); }
    if (event.x === 101) { actions.push("save"); if (!keepDirty) saved = true; }
    if (event.x === 102) { actions.push("exit"); editing = false; selectedBlock = null; }
    if (event.x === 103) { actions.push("reopen"); editing = true; if (!blankAfterEdit) child.url = preview; }
  } };
  const confirmation = { pageId, expectedTitle: title, dispatchBinding };
  const disabledPage = await driver.confirmDisabledPage(webContents, confirmation);
  const olderAlternative = await driver.confirmDisabledPage(webContents, confirmation);
  modal = false;
  let recheckBinding;
  if (recheckMode) {
    editing = recheckMode === "other-editing";
    if (["other-editing", "select-bound", "selection-foreign-collection"].includes(recheckMode)) child.url = new URL("/", preview).href;
    if (recheckMode.startsWith("blank-")) child.url = "about:blank";
    saved = recheckMode !== "dirty-editor";
    reloaded = true;
    const images = (galleryUpload?.mediaBindings ?? []).map(({ sourceUrl, ...binding }, index) => ({
      ...binding, cmsItemId: `fn-figure-${String(index + 1).repeat(24)}`,
    }));
    if (images.length) writtenCode.set(figureBlockId, images.map(image => `data-fn-item-id="${image.cmsItemId}"`).join(" "));
    const blockIds = [textIds[0], speciesId, textIds[1], mapId, ...(images.length ? [figureBlockId] : [])];
    recheckBinding = { schemaVersion: 1, attemptId: dispatchBinding.attemptId, dispatchId: dispatchBinding.dispatchId, planHash,
      pageId, path: targetPath, sectionId, blockIds, mediaBindings: images };
  }
  if (preselectedCode) selectedBlock = speciesId;
  const options = { pageId, dispatchBinding, disabledPage, galleryUpload, assertWritable: async () => true,
    reconfirmDisabled: async () => {
      actions.push("reconfirm");
      if (staleSettings) return olderAlternative;
      modal = true;
      return driver.confirmDisabledPage(webContents, confirmation);
    } };
  async function duringUploadDialog(rows, work) {
    modal = true;
    uploadRows = rows;
    try { return await work(); } finally { modal = false; uploadRows = undefined; }
  }
  function openUploadDialog(rows, onFile, rowIds) {
    modal = true;
    uploadRows = rows;
    onNativeFile = onFile;
    fileFieldRowIds = rowIds;
    return async () => { modal = false; uploadRows = undefined; onNativeFile = undefined; fileFieldRowIds = undefined; };
  }
  return { driver, webContents, plan, options, actions, assetIds, codeActions, inserted, pasted, speciesId, mapId, textIds,
    createdBlocks, writtenCode, figureBlockId, duringUploadDialog, openUploadDialog, sectionId, pickerEvents, textActivations, publicReads,
    recheckBinding, replacementEvents, hasCodeSelection: () => selectedBlock !== null };
}

test("Die Rückprüfung liest die konkrete gespeicherte Seite samt gebundenen Bildern, Code und öffentlichem Status ohne Schreiben", async () => {
  for (const [recheckMode, withGallery] of [["success", false], ["select-bound", true], ["blank-bound", true]]) {
    const f = await authoringSaveFixture({ recheckMode, withGallery,
      figuresInsertion: withGallery ? "ready" : null });
    const proof = await f.driver.recheckUnpublishedPage(f.webContents, f.plan, { saveBinding: f.recheckBinding, assertCurrent: async () => true });
    assert.deepEqual(proof.readback.page, { id: f.recheckBinding.pageId, path: f.plan.target.path, title: f.plan.structure.title,
      enabled: false, saved: true, reopened: true });
    assert.deepEqual(proof.mediaBindings, f.recheckBinding.mediaBindings);
    assert.deepEqual(f.actions, [...(recheckMode === "select-bound" ? ["select"] : []), "reopen", "exit", "settings"]);
    assert.deepEqual(f.codeActions, ["species", "open", "close", "map", "open", "close"]);
    assert.equal(f.publicReads.length, 2);
    assert.deepEqual(f.pasted, []);
    assert.deepEqual(f.inserted, []);
  }
});

test("Eine fremde oder veränderte Seite bleibt bei der rein lesenden Rückprüfung offen", async () => {
  for (const [recheckMode, stage, actions] of [
    ["other-editing", "open-bound-editor", []],
    ["foreign-collection", "open-bound-editor", []],
    ["selection-foreign-collection", "open-bound-editor", ["select"]],
    ["blank-unqualified", "open-bound-editor", ["select"]],
    ["blank-foreign", "open-bound-editor", ["reopen"]],
    ["dirty-editor", "open-bound-editor", ["reopen"]],
    ["section", "compare-saved-content", ["reopen"]],
    ["block", "compare-saved-content", ["reopen"]],
    ["different-text", "compare-saved-content", ["reopen"]],
    ["wrong-code", "compare-saved-code", ["reopen"]],
    ["gallery-order", "compare-saved-content", ["reopen"]],
    ["foreign-library", "compare-saved-content", ["reopen"]],
    ["gallery-credit", "compare-saved-content", ["reopen"]],
    ["enabled", "recheck-disabled-page", ["reopen", "exit", "settings"]],
    ["public", "recheck-public-access", ["reopen", "exit", "settings"]],
    ["actor-changed", "open-bound-editor", []],
  ]) {
    const withGallery = ["gallery-order", "foreign-library", "gallery-credit"].includes(recheckMode);
    const f = await authoringSaveFixture({ recheckMode, withGallery, figuresInsertion: withGallery ? "ready" : null,
      reopenedChanged: recheckMode === "different-text", moduleDrift: recheckMode === "block" ? "identity" : null,
      codeDrift: recheckMode === "wrong-code" ? "after" : null, reversedAfterReload: recheckMode === "gallery-order" });
    await assert.rejects(f.driver.recheckUnpublishedPage(f.webContents, f.plan,
      { saveBinding: f.recheckBinding, assertCurrent: async () => recheckMode !== "actor-changed" }),
    { code: "SQUARESPACE_PAGE_RECHECK_UNCONFIRMED", stage }, recheckMode);
    assert.deepEqual(f.actions, actions, recheckMode);
    assert.deepEqual(f.pasted, [], recheckMode);
    assert.deepEqual(f.inserted, [], recheckMode);
  }
});

test("Abschnittsauswahl öffnet einmal und bestätigt den Dialog ausschließlich am gebundenen deaktivierten Entwurf", async () => {
  for (const sectionCatalog of ["open", "moved", "anchor-missing", "wrong-dialog", "frame-changed", "approval-withdrawn"]) {
    const f = await authoringSaveFixture({ sectionCatalog });
    const operation = f.driver.openPageSectionCatalog(f.webContents, f.plan, { ...f.options, afterSectionId: f.sectionId,
      assertWritable: async scope => {
        assert.deepEqual(scope, { pageId: f.options.pageId, path: f.plan.target.path, sectionId: f.sectionId });
        return sectionCatalog !== "approval-withdrawn";
      } });
    if (sectionCatalog === "open") assert.deepEqual(await operation, {
      status: "catalog-open", pageId: f.options.pageId, path: f.plan.target.path, sectionId: f.sectionId,
    });
    else await assert.rejects(operation, { code: "SQUARESPACE_SECTION_CATALOG_UNCONFIRMED" });
    assert.deepEqual(f.actions, ["open", "wrong-dialog", "frame-changed"].includes(sectionCatalog) ? ["section-catalog-click"] : []);
    assert.deepEqual(f.pasted, []);
    assert.deepEqual(f.inserted, []);
  }
});

async function nativeFluidFixture({ sectionFailure, blockFailure, blockMapping, blockFocus, blockTriggerDrift, placement, fullFlowMode, layoutAfterFirstBlock, withGallery = false, nativePublicMode,
  firstSection = false, firstSectionControl, createFromBlank = false, groupedMap, retainsCodeSelection = false,
  restoreDefaultOnEmptyClose = false, corruptReplacement = false } = {}) {
  const f = await authoringSaveFixture({
    ...(fullFlowMode && { nativeTextIds: true, codeInsertion: "ready", layoutDrift: "append-blocks", nativeCodeMode: fullFlowMode,
      withGallery, nativePublicMode, createFromBlank, groupedMap, retainsCodeSelection, renderedText: retainsCodeSelection ? "clickable" : undefined,
      figuresInsertion: withGallery ? "ready" : null, restoreDefaultOnEmptyClose, corruptReplacement }),
    ...((blockMapping || blockTriggerDrift || layoutAfterFirstBlock || restoreDefaultOnEmptyClose) && { timeoutMs: 100 }),
  });
  const afterSectionId = firstSection ? null : "6ae8a8ce46aa540e7bd07797", sectionId = "6af35a7b8156a8608eec7c4f";
  const blockIds = { text: "block-yui_3_17_2_1_1794333258856_1314", code: "block-yui_3_17_2_1_1794333258856_1528" };
  const controls = { section: 171, blank: 172, picker: 173, text: 174, code: 175, focus: 176 };
  const point = name => ({ point: { x: controls[name], y: 1 } });
  const events = [], dragEvents = [], mappedPoints = [];
  const sections = firstSection ? [] : [{ id: afterSectionId, kind: "classic-editor" }, { id: f.sectionId, kind: "gallery" }];
  if (sectionFailure === "existing-section") sections.push({ id: f.sectionId, kind: "gallery" });
  const blocks = fullFlowMode ? f.createdBlocks : [];
  const plannedBlocks = [f.textIds[0], f.speciesId, f.textIds[1], f.mapId, ...(withGallery ? [f.figureBlockId] : [])];
  if (fullFlowMode === "existing-default") {
    blocks.push({ id: f.speciesId, kind: "code" });
    f.writtenCode.set(f.speciesId, "<p>Hello, World!</p>");
  }
  const from = { x: 402, y: 210 }, to = { x: 402, y: 333 };
  const map = ({ x, y }) => ({ x: x + 20, y: y + 40 });
  const frameSectionPoint = { x: 151, y: 71 }, frameSectionViewport = { width: 800, height: 500 };
  let dropped = false, placementActive = false, sectionTriggerReads = 0, frameSectionReads = 0;
  let blockMappings = 0, firstLayoutReads = 0;
  let blockTriggerReads = 0;
  let sectionFocused = false;
  let catalogOpen = sectionFailure === "already-open", pickerOpen = blockFailure === "already-open";
  const top = f.webContents.mainFrame, frame = top.framesInSubtree[1];
  const readTop = top.executeJavaScript.bind(top), readFrame = frame.executeJavaScript.bind(frame);
  const readRequest = code => JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1));
  top.executeJavaScript = async (code) => {
    const request = readRequest(code);
    if (request.operation === "preview-state") {
      const state = await readTop(code);
      return { ...state, dialogOpen: catalogOpen || state.dialogOpen };
    }
    if (request.operation === "section-catalog-trigger") {
      if (catalogOpen || sectionFailure === "missing-trigger") return null;
      if (!firstSectionControl) return point("section");
      assert.equal(request.sectionId, null);
      return firstSectionControl === "top-drift" && ++sectionTriggerReads > 1 ? point("section") : { frameTriggerAllowed: true };
    }
    if (request.operation === "section-catalog-open") return catalogOpen;
    if (request.operation === "section-catalog-blank") return catalogOpen && sectionFailure !== "ambiguous-choice" ? point("blank") : null;
    if (request.operation === "fluid-block-trigger") {
      if (pickerOpen || blockFocus && !sectionFocused || retainsCodeSelection && f.hasCodeSelection() && request.allowBlockEdit !== true) return null;
      blockTriggerReads++;
      return blockTriggerDrift === "transient" && blockTriggerReads === 3
        || blockTriggerDrift === "persistent" && blockTriggerReads % 2 === 1 ? { point: { x: 177, y: 1 } } : point("picker");
    }
    if (blockFocus && !sectionFocused && request.operation === "map-gallery-hover") {
      mappedPoints.push(request.framePoint);
      return blockFocus === "all-blocked" || request.framePoint.x === 290 ? { blocked: "hit-test" } : point("focus");
    }
    if (blockMapping && pickerOpen && request.operation === "map-gallery-hover") {
      blockMappings++;
      const blocked = blockMapping === "blocked" || blockMapping === "transient" && blockMappings === 1
        || blockMapping === "blocked-after-confirmation" && blockMappings > 1;
      return blocked ? { blocked: "hit-test" } : { point: request.framePoint };
    }
    if (firstSectionControl && request.operation === "map-gallery-hover") {
      assert.deepEqual(request.frameViewport, frameSectionViewport);
      assert.deepEqual(request.framePoint, frameSectionPoint);
      mappedPoints.push(request.framePoint);
      return firstSectionControl === "mapping-blocked" ? { blocked: "hit-test" } : point("section");
    }
    if (placementActive && request.operation === "map-gallery-hover") {
      mappedPoints.push(request.framePoint);
      return { point: map(request.framePoint) };
    }
    return readTop(code);
  };
  frame.executeJavaScript = async (code) => {
    const request = readRequest(code);
    if (request.scope === "editor-layout" && blocks.length === 1 && layoutAfterFirstBlock
        && (++firstLayoutReads === 1 || layoutAfterFirstBlock !== "settles")) {
      return { status: "unknown", reasonCodes: [layoutAfterFirstBlock === "wrong-page"
        ? "collection-identity-mismatch" : "editor-layout-unqualified"] };
    }
    if (request.operation === "section-catalog-anchor") {
      return request.sectionId === afterSectionId && (!firstSection || !sections.length
        && sectionFailure !== "unconfirmed-empty" && !(catalogOpen && sectionFailure === "baseline-drift"));
    }
    if (request.operation === "section-catalog-frame-trigger") {
      assert.equal(request.sectionId, null);
      assert.equal(request.pageId, f.options.pageId);
      if (firstSectionControl === "frame-changed") frame.url = "about:blank";
      if (firstSectionControl === "ambiguous") return null;
      return { point: frameSectionPoint, viewport: frameSectionViewport,
        epoch: firstSectionControl === "epoch-changed" && ++frameSectionReads > 1 ? 101 : 100 };
    }
    if (request.operation === "fluid-page-sections") return structuredClone(sections);
    if (request.operation === "fluid-block-list") return { blocks: structuredClone(blocks), pickerOpen };
    if (request.operation === "fluid-section-focus" && blockFocus) return {
      points: [{ x: 290, y: 210 }, { x: 480, y: 255 }], viewport: { width: 800, height: 500 },
    };
    if (request.operation === "fluid-block-placement") {
      assert.equal(request.pageId, f.options.pageId);
      assert.equal(request.sectionId, sectionId);
      if (fullFlowMode) return { aligned: true, previous: [] };
      assert.equal(request.blockId, blockIds.code);
      const aligned = ["already-aligned", "not-created"].includes(placement) || dropped;
      const previousTop = placement === "previous-moved" && dropped ? 180 : 170;
      const previous = [{ id: blockIds.text, bounds: [140, previousTop, 760, 240] }];
      return { aligned, previous, ...(!aligned && { from, to, viewport: { width: 800, height: 500 } }) };
    }
    if (request.operation === "fluid-block-choice") {
      if (!pickerOpen || blockFailure === "ambiguous-choice") return null;
      assert.ok(request.kind === "text" || request.kind === "code");
      return { ...point(request.kind), viewport: { width: 800, height: 500 } };
    }
    return readFrame(code);
  };
  const send = f.webContents.sendInputEvent.bind(f.webContents);
  f.webContents.sendInputEvent = event => {
    if (placementActive) {
      dragEvents.push(event);
      const end = map(to);
      if (event.type === "mouseUp" && event.x === end.x && event.y === end.y) dropped = true;
      return send(event);
    }
    const control = Object.keys(controls).find(name => controls[name] === event.x);
    if (!control) return send(event);
    if (event.type === "mouseDown" || event.type === "mouseUp") events.push([event.type, control]);
    if (event.type !== "mouseUp") return;
    if (control === "section") catalogOpen = true;
    if (control === "blank") {
      catalogOpen = false;
      if (sectionFailure === "unobserved") return;
      const position = firstSection ? 0 : sectionFailure === "wrong-position" ? sections.length : 1;
      sections.splice(position, 0, { id: sectionId, kind: sectionFailure === "wrong-kind" ? "classic-editor" : "fluid-engine" });
      if (sectionFailure === "additional") sections.push({ id: "c".repeat(24), kind: "fluid-engine" });
      if (sectionFailure === "nonempty-new") blocks.push({ id: blockIds.text, kind: "text" });
    }
    if (control === "picker") pickerOpen = true;
    if (control === "focus") sectionFocused = true;
    if (control === "text" || control === "code") {
      pickerOpen = false;
      const kind = blockFailure === "wrong-kind" ? "code" : control;
      const id = fullFlowMode ? plannedBlocks[blocks.length] : blockIds[kind];
      blocks.push({ id, kind });
      if (fullFlowMode && fullFlowMode !== "already-empty" && kind === "code") f.writtenCode.set(id,
        fullFlowMode === "different-source" ? "<p>Geänderter Inhalt</p>" : "<p>Hello, World!</p>");
      if (blockFailure === "additional") blocks.push({ id: "block-" + "d".repeat(24), kind: "code" });
    }
  };
  return { ...f, afterSectionId, sectionId, blockIds, events, sections, blocks, dragEvents, mappedPoints, from, to, map,
    beginPlacement: () => { placementActive = true; } };
}

const nativeClicks = (...controls) => controls.flatMap(name => [["mouseDown", name], ["mouseUp", name]]);

test("Der erste leere Abschnitt öffnet den Katalog über den stabil auf das Inhaltsiframe abgebildeten Button", async () => {
  for (const firstSectionControl of ["frame", "ambiguous", "frame-changed", "epoch-changed", "mapping-blocked", "top-drift"]) {
    const f = await nativeFluidFixture({ firstSection: true, firstSectionControl });
    const create = f.driver.createBlankFluidSection(f.webContents, f.plan, { ...f.options, afterSectionId: null });
    if (firstSectionControl === "frame") {
      assert.deepEqual(await create, { sectionId: f.sectionId });
      assert.deepEqual(f.mappedPoints, [{ x: 151, y: 71 }, { x: 151, y: 71 }]);
      assert.deepEqual(f.events, nativeClicks("section", "blank"));
    } else {
      await assert.rejects(create, { code: "SQUARESPACE_SECTION_CATALOG_UNCONFIRMED" });
      assert.deepEqual(f.events, []);
      assert.deepEqual(f.sections, []);
    }
  }
});

test("Native Fluid-Engine-Anlage bestätigt genau einen Abschnitt und je einen ausgewählten Text- und Codeblock", async () => {
  const f = await nativeFluidFixture();
  assert.deepEqual(await f.driver.createBlankFluidSection(f.webContents, f.plan, { ...f.options, afterSectionId: f.afterSectionId }),
    { sectionId: f.sectionId });
  for (const kind of ["text", "code"]) {
    assert.deepEqual(await f.driver.appendFluidEditorBlock(f.webContents, f.plan, { ...f.options, sectionId: f.sectionId, kind }),
      { blockId: f.blockIds[kind] });
  }
  assert.deepEqual(f.events, nativeClicks("section", "blank", "picker", "text", "picker", "code"));
  assert.deepEqual(f.actions, []);
  assert.deepEqual([f.pasted, f.inserted], [[], []]);
});

test("Native Abschnittsanlage stoppt bei offenem oder mehrdeutigem Katalog und bei abweichendem Abschnittszuwachs", async () => {
  for (const sectionFailure of ["already-open", "ambiguous-choice", "additional", "wrong-kind", "wrong-position"]) {
    const f = await nativeFluidFixture({ sectionFailure });
    await assert.rejects(f.driver.createBlankFluidSection(f.webContents, f.plan, { ...f.options, afterSectionId: f.afterSectionId }),
      { statusCode: 409 }, sectionFailure);
    const clicks = sectionFailure === "already-open" ? [] : sectionFailure === "ambiguous-choice" ? ["section"] : ["section", "blank"];
    assert.deepEqual(f.events, nativeClicks(...clicks), sectionFailure);
    assert.deepEqual(f.actions, [], sectionFailure);
  }
});

test("Der erste Abschnitt verlangt eine nachgewiesen leere Seite und wird nach unklarem Klick nicht erneut angelegt", async () => {
  for (const [sectionFailure, clicks] of [
    [undefined, ["section", "blank"]], ["existing-section", []], ["unconfirmed-empty", []], ["missing-trigger", []],
    ["baseline-drift", ["section"]], ["additional", ["section", "blank"]], ["wrong-kind", ["section", "blank"]],
    ["nonempty-new", ["section", "blank"]], ["unobserved", ["section", "blank"]],
  ]) {
    const f = await nativeFluidFixture({ firstSection: true, sectionFailure });
    const create = () => f.driver.createBlankFluidSection(f.webContents, f.plan, { ...f.options, afterSectionId: null });
    if (sectionFailure) await assert.rejects(create(), { statusCode: 409 });
    else assert.deepEqual(await create(), { sectionId: f.sectionId });
    if (sectionFailure === "unobserved") await assert.rejects(create(), { code: "SQUARESPACE_FLUID_SECTION_UNCONFIRMED" });
    assert.deepEqual(f.events, nativeClicks(...clicks), sectionFailure);
    assert.deepEqual([f.actions, f.pasted, f.inserted], [[], [], []]);
  }
});

test("Native Fluid-Blockanlage stoppt bei offener oder mehrdeutiger Auswahl und bei abweichendem Blockzuwachs", async () => {
  for (const blockFailure of ["already-open", "ambiguous-choice", "additional", "wrong-kind"]) {
    const f = await nativeFluidFixture({ blockFailure });
    f.sections.splice(1, 0, { id: f.sectionId, kind: "fluid-engine" });
    await assert.rejects(f.driver.appendFluidEditorBlock(f.webContents, f.plan, { ...f.options, sectionId: f.sectionId, kind: "text" }),
      { statusCode: 409, ...(blockFailure === "ambiguous-choice" && { stage: "choose-block", choiceState: "control-unobserved" }) }, blockFailure);
    const clicks = blockFailure === "already-open" ? [] : blockFailure === "ambiguous-choice" ? ["picker"] : ["picker", "text"];
    assert.deepEqual(f.events, nativeClicks(...clicks), blockFailure);
    assert.deepEqual(f.actions, [], blockFailure);
  }
});

test("Die Blockauswahl wartet auf einen treffbaren Punkt und bestätigt ihn erneut vor dem Klick", async () => {
  for (const blockMapping of ["transient", "blocked", "blocked-after-confirmation"]) {
    const f = await nativeFluidFixture({ blockMapping });
    f.sections.splice(1, 0, { id: f.sectionId, kind: "fluid-engine" });
    const append = f.driver.appendFluidEditorBlock(f.webContents, f.plan, { ...f.options, sectionId: f.sectionId, kind: "text" });
    if (blockMapping === "transient") {
      assert.deepEqual(await append, { blockId: f.blockIds.text });
      assert.deepEqual(f.events, nativeClicks("picker", "text"));
    } else {
      await assert.rejects(append, { code: "SQUARESPACE_FLUID_BLOCK_UNCONFIRMED", stage: "choose-block", choiceState: "point-unreachable" });
      assert.deepEqual(f.events, nativeClicks("picker"));
      assert.deepEqual(f.blocks, []);
    }
  }
});

test("Die Blockauswahl fokussiert nur eine unverdeckte Stelle im gebundenen Raster", async () => {
  for (const blockFocus of ["second-point", "all-blocked"]) {
    const f = await nativeFluidFixture({ blockFocus });
    f.sections.splice(1, 0, { id: f.sectionId, kind: "fluid-engine" });
    const append = f.driver.appendFluidEditorBlock(f.webContents, f.plan, { ...f.options, sectionId: f.sectionId, kind: "text" });
    if (blockFocus === "all-blocked") {
      await assert.rejects(append, { code: "SQUARESPACE_FLUID_BLOCK_UNCONFIRMED", stage: "open-picker" });
      assert.deepEqual(f.events, []);
    } else {
      assert.deepEqual(await append, { blockId: f.blockIds.text });
      assert.deepEqual(f.events, nativeClicks("focus", "picker", "text"));
    }
    assert.deepEqual(f.mappedPoints, [{ x: 290, y: 210 }, { x: 480, y: 255 }]);
  }
});

test("Die Blockauswahl wartet auf eine stabile Abschnittswerkzeugleiste vor dem einzigen Klick", async () => {
  for (const blockTriggerDrift of ["transient", "persistent"]) {
    const f = await nativeFluidFixture({ blockTriggerDrift });
    f.sections.splice(1, 0, { id: f.sectionId, kind: "fluid-engine" });
    const append = f.driver.appendFluidEditorBlock(f.webContents, f.plan, { ...f.options, sectionId: f.sectionId, kind: "text" });
    if (blockTriggerDrift === "transient") {
      assert.deepEqual(await append, { blockId: f.blockIds.text });
      assert.deepEqual(f.events, nativeClicks("picker", "text"));
    } else {
      await assert.rejects(append, { code: "SQUARESPACE_FLUID_BLOCK_UNCONFIRMED", stage: "open-picker", openState: "trigger-changed" });
      assert.deepEqual(f.events, []);
    }
  }
});

test("Native Fluid-Blockpositionierung zieht nur bei Bedarf und verlangt unveränderte vorherige Blöcke", async () => {
  for (const placement of ["already-aligned", "needs-drag", "previous-moved", "not-created"]) {
    const f = await nativeFluidFixture({ placement });
    const blockId = f.blockIds.code;
    const { sectionId } = await f.driver.createBlankFluidSection(f.webContents, f.plan, { ...f.options, afterSectionId: f.afterSectionId });
    const append = kind => f.driver.appendFluidEditorBlock(f.webContents, f.plan, { ...f.options, sectionId, kind });
    await append("text");
    if (placement === "not-created") f.blocks.push({ id: blockId, kind: "code" });
    else assert.deepEqual(await append("code"), { blockId });
    f.beginPlacement();
    const place = () => f.driver.placeFluidEditorBlock(f.webContents, f.plan, { ...f.options, sectionId, blockId });
    const result = place();
    if (placement === "previous-moved" || placement === "not-created") await assert.rejects(result, { statusCode: 409 });
    else assert.deepEqual(await result, { blockId, positioned: true });
    if (placement === "previous-moved") await assert.rejects(place(), { statusCode: 409 });
    assert.deepEqual(f.actions, [], placement);
    if (placement === "already-aligned" || placement === "not-created") {
      assert.deepEqual(f.dragEvents, []);
      assert.deepEqual(f.mappedPoints, []);
      continue;
    }
    const [down, ...rest] = f.dragEvents;
    const up = rest.pop();
    assert.deepEqual({ type: down.type, x: down.x, y: down.y }, { type: "mouseDown", ...f.map(f.from) }, placement);
    assert.deepEqual({ type: up.type, x: up.x, y: up.y }, { type: "mouseUp", ...f.map(f.to) }, placement);
    assert.ok(rest.length >= 2 && rest.every(event => event.type === "mouseMove"), placement);
    assert.ok(f.mappedPoints.some(point => point.x === f.from.x && point.y === f.from.y), placement);
    assert.ok(f.mappedPoints.some(point => point.x === f.to.x && point.y === f.to.y), placement);
  }
});

test("Der Klickversuch trifft das bestätigte Plus auch bei Sichtbarkeit erst an der zweiten Position", async () => {
  for (const classicPicker of [undefined, "second-point"]) {
    const f = await authoringSaveFixture({ classicPicker });
    const afterBlockId = f.textIds[0];
    assert.deepEqual(await f.driver.dispatchClassicBlockPickerClick(f.webContents, f.plan, { ...f.options, afterBlockId }), {
      status: "click-dispatched", pageId: f.options.pageId, path: f.plan.target.path, afterBlockId, sectionId: f.sectionId,
    });
    assert.deepEqual(f.pickerEvents, [["mouseMove", 115], ...(classicPicker ? [["mouseMove", 119]] : []), ["mouseDown", 116], ["mouseUp", 116]]);
    assert.deepEqual(f.actions, []);
  }
});

test("Der Klickversuch stoppt bei verborgenem Plus, Sichtverlust, Seitenwechsel oder fehlender Freigabe", async () => {
  for (const classicPicker of ["hidden", "transient", "moved", "frame-changed", "denied", "withdrawn", "unconfirmed"]) {
    const f = await authoringSaveFixture({ classicPicker });
    const options = { ...f.options, afterBlockId: f.textIds[0] };
    let authorityReads = 0;
    if (classicPicker === "denied") options.assertWritable = async () => false;
    if (classicPicker === "withdrawn") options.assertWritable = async () => ++authorityReads === 1;
    if (classicPicker === "unconfirmed") options.disabledPage = {};
    await assert.rejects(f.driver.dispatchClassicBlockPickerClick(f.webContents, f.plan, options), /Einfügepunkt/u);
    const expected = ["denied", "unconfirmed"].includes(classicPicker) ? [] : [["mouseMove", 115]];
    if (["hidden", "transient"].includes(classicPicker)) expected.push(["mouseMove", 119], ["mouseMove", 120]);
    assert.deepEqual(f.pickerEvents, expected, classicPicker);
    assert.deepEqual(f.actions, []);
  }
});

test("Artseitentext speichert genau einmal und gilt erst nach frischem Wiederöffnen und erneuter Deaktivierungsprüfung als bestätigt", async () => {
  const f = await authoringSaveFixture();
  const result = await f.driver.saveAndReopenPageContent(f.webContents, f.plan, f.options);
  assert.deepEqual(f.actions, ["save", "exit", "reload", "reopen", "exit", "reconfirm"]);
  assert.equal(result.textBlocks[1].blocks[0].text, "Freigegebener Fachtext");
  assert.equal(result.savedTextConfirmed && result.reopened && result.disabledConfirmed, true);
  assert.deepEqual(result.gallery, { status: "no-gallery-planned" });
  assert.deepEqual(result.codeBlocks.map(block => block.kind), ["species", "map"]);
  const codePass = ["species", "open", "close", "map", "open", "close"];
  assert.deepEqual(f.codeActions, [...codePass, ...codePass]);
  assert.equal(Object.hasOwn(result, "readback"), false);
});

test("A drifted Squarespace source prevents the save or leaves the single save unconfirmed", async () => {
  for (const codeDrift of ["before", "after"]) {
    const f = await authoringSaveFixture({ codeDrift });
    const afterSave = codeDrift === "after";
    await assert.rejects(f.driver.saveAndReopenPageContent(f.webContents, f.plan, f.options),
      { code: afterSave ? "SQUARESPACE_PAGE_SAVE_UNCONFIRMED" : "SQUARESPACE_PAGE_SAVE_TARGET_CHANGED",
        stage: afterSave ? "compare-reopened-code" : "check-code-before-save" });
    assert.deepEqual(f.actions, afterSave ? ["save", "exit", "reload", "reopen"] : []);
    assert.deepEqual(f.codeActions.slice(-5), ["species", "open", "close", "map", "open"]);
  }
});

test("Artseiten-Speichern stoppt vor der Eingabe bei verändertem Text oder fehlender bestätigter Deaktivierung", async () => {
  for (const settings of [{ preChanged: true }, {}]) {
    const f = await authoringSaveFixture(settings);
    if (!settings.preChanged) f.options.disabledPage = {};
    await assert.rejects(f.driver.saveAndReopenPageContent(f.webContents, f.plan, f.options), { code: "SQUARESPACE_PAGE_SAVE_TARGET_CHANGED" });
    assert.deepEqual(f.actions, []);
  }
});

test("Eine beim Ermitteln der Speichern-Schaltfläche zurückgezogene Freigabe verhindert den Speicherklick", async () => {
  let approved = true;
  const f = await authoringSaveFixture({ onSaveControlRead: () => { approved = false; } });
  f.options.assertWritable = async () => approved;
  await assert.rejects(f.driver.saveAndReopenPageContent(f.webContents, f.plan, f.options),
    { code: "SQUARESPACE_PAGE_SAVE_TARGET_CHANGED" });
  assert.equal(approved, false);
  assert.deepEqual(f.actions, []);
});

test("Artseiten-Speichern wiederholt sich nach einem ungewissen Ausgang niemals automatisch", async () => {
  for (const [settings, actions, stage] of [
    [{ keepDirty: true }, ["save"], "confirm-save"],
    [{ reloadChangesEpoch: false }, ["save", "exit", "reload"], "reload-page-administration"],
    [{ reopenedChanged: true }, ["save", "exit", "reload", "reopen"], "compare-reopened-content"],
    [{ staleSettings: true }, ["save", "exit", "reload", "reopen", "exit", "reconfirm"], "reconfirm-disabled-page"],
  ]) {
    const f = await authoringSaveFixture(settings);
    await assert.rejects(f.driver.saveAndReopenPageContent(f.webContents, f.plan, f.options), { code: "SQUARESPACE_PAGE_SAVE_UNCONFIRMED", stage });
    assert.deepEqual(f.actions, actions);
  }
});

test("Die Artseitengalerie bestätigt dieselben Asset-UUIDs vor und nach dem Speichern trotz geändertem CDN-Pfad", async () => {
  const f = await authoringSaveFixture({ withGallery: true });
  const result = await f.driver.saveAndReopenPageContent(f.webContents, f.plan, f.options);
  assert.equal(result.gallery.status, "rendered-image-order-confirmed");
  assert.equal(result.gallery.renderedTextConfirmed, true);
  assert.deepEqual(result.gallery.items.map(item => item.cmsAssetId), f.assetIds);
  assert.deepEqual(f.actions, ["save", "exit", "reload", "reopen", "exit", "reconfirm"]);
});

test("Die native Artseitengalerie prüft gekoppelten Alternativtext und sichtbare Beschriftung getrennt in der Vorschau", async () => {
  const options = { withGallery: true, showGalleryCaptions: true };
  const valid = await authoringSaveFixture(options);
  assert.equal((await valid.driver.saveAndReopenPageContent(valid.webContents, valid.plan, valid.options)).gallery.renderedTextConfirmed, true);
  for (const galleryTextDrift of ["alt", "caption"]) {
    const f = await authoringSaveFixture({ ...options, galleryTextDrift });
    const saved = galleryTextDrift === "caption";
    await assert.rejects(f.driver.saveAndReopenPageContent(f.webContents, f.plan, f.options),
      { code: saved ? "SQUARESPACE_PAGE_SAVE_UNCONFIRMED" : "SQUARESPACE_PAGE_SAVE_TARGET_CHANGED" });
    assert.deepEqual(f.actions, saved ? ["save", "exit", "reload", "reopen"] : []);
  }
});

test("Eine native Artseitengalerie lässt eigenständige Beschriftungen, Credits und absichtlich leeren Alternativtext zur Prüfung offen", async () => {
  for (const change of [{ caption: "Eigenständige Bildunterschrift" }, { attribution: "Bildnachweis" },
    { alt: "", decorative: true }, { alt: "x".repeat(251) }, { alt: "Zwei\nZeilen" }]) {
    const f = await authoringSaveFixture({ withGallery: true });
    Object.assign(f.plan.structure.slots.at(-1).items[0], change);
    Object.assign(f.plan.readback.expectation.blocks.at(-1).items[0], change);
    await assert.rejects(f.driver.saveAndReopenPageContent(f.webContents, f.plan, f.options), { code: "SQUARESPACE_PAGE_GALLERY_TEXT_UNSUPPORTED" });
    assert.deepEqual(f.actions, []);
    assert.deepEqual(f.codeActions, []);
  }
});

test("Die HTML-Galerie erhält getrennte freigegebene Angaben und bindet ausschließlich passende Squarespace-Medien", async () => {
  const f = await authoringSaveFixture({ withGallery: true });
  const items = f.plan.structure.slots.at(-1).items;
  Object.assign(items[0], { alt: 'Bild "1"', caption: "<script>Wortlaut</script>\r\nweiter", attribution: "Foto: FN & Travel" });
  Object.assign(items[1], { alt: "", decorative: true, caption: "Sichtbare Beschriftung" });
  const mediaBindings = f.options.galleryUpload.mediaBindings.map((binding, index) => ({ ...binding,
    sourceUrl: `https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/${f.assetIds[index]}/probe.png?format=750w` }));
  const upload = { layout: "figures", blockId: "block-000000000000000000000099", mediaBindings };
  const gallery = prepareSquarespaceFigureGallery(items, upload);
  assert.ok(gallery.html.includes('alt="Bild &quot;1&quot;"') && gallery.html.includes('alt=""'));
  assert.ok(gallery.html.includes("&lt;script&gt;Wortlaut&lt;/script&gt;\nweiter") && gallery.html.includes("Foto: FN &amp; Travel"));
  assert.ok(!gallery.html.includes("<script>") && !gallery.html.includes(items[0].id) && !gallery.html.includes(items[0].sha256));
  assert.deepEqual(gallery.figures.map(item => item.cmsAssetId), f.assetIds);
  for (const sourceUrl of [mediaBindings[1].sourceUrl, mediaBindings[0].sourceUrl.replace("images.squarespace-cdn.com", "example.invalid")]) {
    assert.throws(() => prepareSquarespaceFigureGallery(items, { ...upload, mediaBindings: [{ ...mediaBindings[0], sourceUrl }, mediaBindings[1]] }),
      { code: "SQUARESPACE_PAGE_GALLERY_BINDING" });
  }
});

test("Die HTML-Galerie wird einmal in den bestätigten leeren Editor eingegeben und aus der Vorschau gelesen", async () => {
  const f = await authoringSaveFixture({ withGallery: true, figuresInsertion: "ready" });
  const result = await f.driver.insertPageGallery(f.webContents, f.plan, f.options);
  assert.equal(result.status, "rendered-figures-confirmed");
  assert.equal(f.inserted.length, 1);
  assert.ok(f.inserted[0].includes("Beschriftung") && f.inserted[0].includes("Bildnachweis"));
  assert.deepEqual(f.codeActions, ["gallery", "open", "close"]);
  assert.deepEqual(f.actions, []);
  assert.equal((await f.driver.saveAndReopenPageContent(f.webContents, f.plan, f.options)).gallery.status, "rendered-figures-confirmed");
});

test("Die Galerieeingabe überschreibt keinen vorhandenen Code und wiederholt einen unbestätigten Versuch nicht", async () => {
  for (const figuresInsertion of ["occupied", "changed-on-focus", "not-rendered", "stale-approval"]) {
    const f = await authoringSaveFixture({ withGallery: true, figuresInsertion });
    if (figuresInsertion === "stale-approval") { let calls = 0; f.options.assertWritable = async () => ++calls === 1; }
    await assert.rejects(f.driver.insertPageGallery(f.webContents, f.plan, f.options),
      figuresInsertion === "occupied" ? /bereits Inhalt/ : { code: figuresInsertion === "not-rendered"
        ? "SQUARESPACE_PAGE_GALLERY_INPUT_UNCONFIRMED" : "SQUARESPACE_PAGE_GALLERY_TARGET_CHANGED" });
    assert.equal(f.inserted.length, figuresInsertion === "not-rendered" ? 1 : 0);
    assert.deepEqual(f.actions, []);
  }
});

test("Die beiden FN-Funktionsblöcke werden in ihre gebundenen leeren HTML-Felder eingefügt und gemeinsam wieder gelesen", async () => {
  const f = await authoringSaveFixture({ withGallery: true, figuresInsertion: "ready", codeInsertion: "ready" });
  for (const [kind, blockId] of [["species", f.speciesId], ["map", f.mapId]]) {
    assert.deepEqual(await f.driver.insertPageModule(f.webContents, f.plan, { ...f.options, kind, blockId }), { kind, cmsBlockId: blockId });
  }
  await assert.rejects(f.driver.insertPageModule(f.webContents, f.plan, { ...f.options, kind: "species", blockId: f.mapId }),
    { code: "SQUARESPACE_PAGE_MODULE_TARGET_CHANGED" });
  await f.driver.insertPageGallery(f.webContents, f.plan, f.options);
  assert.deepEqual(f.inserted.slice(0, 2), [FN_SPECIES_CODE, FN_MAP_CODE]);
  assert.equal(f.inserted.length, 3);
  assert.deepEqual(f.actions, []);
  const saved = await f.driver.saveAndReopenPageContent(f.webContents, f.plan, f.options);
  assert.deepEqual(saved.codeBlocks.map(block => block.cmsBlockId), [f.speciesId, f.mapId]);
  assert.deepEqual(f.actions, ["save", "exit", "reload", "reopen", "exit", "reconfirm"]);
});

test("Ein bereits eindeutig ausgewählter Codeblock wird ohne zweiten Blockklick bearbeitet", async () => {
  const f = await authoringSaveFixture({ codeInsertion: "ready", preselectedCode: true });
  assert.deepEqual(await f.driver.insertPageModule(f.webContents, f.plan, { ...f.options, kind: "species", blockId: f.speciesId }),
    { kind: "species", cmsBlockId: f.speciesId });
  assert.deepEqual(f.codeActions, ["open", "close"]);
  assert.deepEqual(f.inserted, [FN_SPECIES_CODE]);
});

test("Funktionscode überschreibt keine vorhandene Eingabe und ein unbestätigter Versuch bleibt ohne Speicherklick", async () => {
  for (const codeInsertion of ["occupied", "changed-on-focus", "wrong-source", "not-rendered", "stale-approval"]) {
    const f = await authoringSaveFixture({ codeInsertion });
    if (codeInsertion === "stale-approval") { let calls = 0; f.options.assertWritable = async () => ++calls === 1; }
    await assert.rejects(async () => f.driver.insertPageModule(f.webContents, f.plan, { ...f.options, kind: "map", blockId: f.mapId }),
      codeInsertion === "occupied" ? /bereits Inhalt/ : { code: ["wrong-source", "not-rendered"].includes(codeInsertion)
        ? "SQUARESPACE_PAGE_MODULE_INPUT_UNCONFIRMED" : "SQUARESPACE_PAGE_MODULE_TARGET_CHANGED" });
    assert.equal(f.inserted.length, ["wrong-source", "not-rendered"].includes(codeInsertion) ? 1 : 0);
    assert.deepEqual(f.actions, []);
  }
});

test("Die vorbereitete Artseite ordnet alle Editorblöcke dem Plan zu und speichert genau einmal", async () => {
  for (const withGallery of [false, true]) {
    const f = await authoringSaveFixture({ withGallery, figuresInsertion: withGallery ? "ready" : null, codeInsertion: "ready", layoutDrift: "none" });
    const saved = await f.driver.fillPreparedPageContent(f.webContents, f.plan, f.options);
    assert.deepEqual(saved.contentOrder.map(block => block.kind), ["text", "species", "text", "map", ...(withGallery ? ["gallery"] : [])]);
    assert.equal(f.pasted.length, 2);
    assert.deepEqual(f.inserted.slice(0, 2), [FN_SPECIES_CODE, FN_MAP_CODE]);
    assert.equal(f.inserted.length, withGallery ? 3 : 2);
    assert.deepEqual(f.actions, ["save", "exit", "reload", "reopen", "exit", "reconfirm"]);
  }
});

test("Nach einem neu eingefügten Fluid-Textblock wartet der Treiber auf den Layoutnachweis ohne erneuten Klick", async () => {
  for (const layoutAfterFirstBlock of ["settles", "unobserved", "wrong-page"]) {
    const f = await nativeFluidFixture({ firstSection: true, fullFlowMode: "ready", layoutAfterFirstBlock });
    const operation = f.driver.fillPreparedPageContent(f.webContents, f.plan, { ...f.options, afterFluidSectionId: null });
    if (layoutAfterFirstBlock === "settles") {
      assert.equal((await operation).reopened, true);
    } else {
      await assert.rejects(operation, { code: "SQUARESPACE_PAGE_LAYOUT_CHANGED", stage: "confirm-new-text-block",
        layoutReasons: [layoutAfterFirstBlock === "wrong-page" ? "collection-identity-mismatch" : "editor-layout-unqualified"] });
      assert.equal(f.events.filter(([event, control]) => event === "mouseUp" && control === "text").length, 1);
      assert.deepEqual([f.pasted, f.inserted], [[], []]);
      assert.ok(!f.actions.includes("save"));
    }
  }
});

test("Gerenderte leere Textblöcke werden einzeln geöffnet und ein fehlender Fokus verhindert die Eingabe", async () => {
  for (const renderedText of ["activates", "stays-rendered", "page-changed"]) {
    const f = await authoringSaveFixture({ codeInsertion: "ready", layoutDrift: "none", renderedText });
    const operation = f.driver.fillPreparedPageContent(f.webContents, f.plan, f.options);
    if (renderedText === "activates") {
      await operation;
      assert.deepEqual(f.textActivations, f.textIds);
      assert.deepEqual(f.pasted, f.textIds);
      assert.equal(f.actions.filter(action => action === "save").length, 1);
    } else {
      await assert.rejects(operation, renderedText === "page-changed" ? { code: "SQUARESPACE_PAGE_LAYOUT_CHANGED" } : /Textblock wurde nicht/u);
      assert.deepEqual(f.textActivations, [f.textIds[0]]);
      assert.deepEqual(f.pasted, []);
      assert.deepEqual(f.actions, []);
    }
  }
});

test("Der leere Seiteneditor erhält nur die einzeln beobachteten Blöcke in der Reihenfolge des freigegebenen Plans", async () => {
  for (const mode of ["complete", "existing-placeholder", "already-prepared", "missing", "duplicate", "wrong-kind", "approval-withdrawn"]) {
    const f = await authoringSaveFixture({ codeInsertion: "ready", layoutDrift: mode === "already-prepared" ? "none" : "append-blocks" });
    const ids = [f.textIds[0], f.speciesId, f.textIds[1], f.mapId];
    let added = mode === "existing-placeholder" ? 1 : 0;
    if (added) f.createdBlocks.push({ id: ids[0], kind: "text" });
    const operation = f.driver.fillPreparedPageContent(f.webContents, f.plan, { ...f.options,
      assertWritable: async () => mode !== "approval-withdrawn" || added === 0,
      appendEmptyBlock: async ({ pageId, path, kind, afterBlockId, assertCurrent }) => {
        assert.equal(pageId, f.options.pageId);
        assert.equal(path, f.plan.target.path);
        assert.equal(afterBlockId, ids[added - 1] ?? null);
        assert.equal(kind, ["text", "code", "text", "code"][added]);
        await assertCurrent();
        if (mode !== "missing") f.createdBlocks.push({
          id: mode === "duplicate" && added === 1 ? ids[0] : ids[added],
          kind: mode === "wrong-kind" ? "code" : kind,
        });
        added++;
      },
    });
    if (mode === "complete" || mode === "existing-placeholder") {
      const proof = await operation;
      assert.deepEqual(proof.contentOrder.map(block => block.id), ids);
      assert.equal(added, ids.length);
      assert.equal(f.actions.filter(action => action === "save").length, 1);
    } else {
      await assert.rejects(operation, mode === "missing" ? /neu angelegte Squarespace-Block/ : { code: "SQUARESPACE_PAGE_LAYOUT_CHANGED" });
      assert.equal(added, mode === "already-prepared" ? 0 : mode === "duplicate" ? 2 : 1);
      assert.deepEqual(f.pasted, []);
      assert.deepEqual(f.inserted, []);
      assert.deepEqual(f.actions, []);
    }
  }
});

test("Zusätzlicher Inhalt, falsche Galeriebindung oder verschobene Editorblöcke verhindern die weitere Eingabe", async () => {
  for (const layoutDrift of ["nonempty", "wrong-order", "gallery-id", "moves-after-paste"]) {
    const f = await authoringSaveFixture({ withGallery: true, figuresInsertion: "ready", codeInsertion: "ready", layoutDrift });
    await assert.rejects(f.driver.fillPreparedPageContent(f.webContents, f.plan, f.options), { code: "SQUARESPACE_PAGE_LAYOUT_CHANGED" });
    assert.equal(f.pasted.length, layoutDrift === "moves-after-paste" ? 1 : 0);
    assert.deepEqual(f.inserted, []);
    assert.deepEqual(f.actions, []);
  }
});

test("Gebundene Fluid-Engine-Blockpositionen müssen bei Eingabe, Speichern und Wiederöffnen zur Dokumentfolge passen", async () => {
  for (const fluidOrderDrift of [undefined, "editor", "before-save", "after-reopen"]) {
    const f = await authoringSaveFixture({ codeInsertion: "ready", layoutDrift: "none", fluidOrderDrift, nativeTextIds: true });
    const operation = f.driver.fillPreparedPageContent(f.webContents, f.plan, { ...f.options, expectedFluidSectionId: f.sectionId });
    if (fluidOrderDrift === undefined) assert.equal((await operation).reopened, true);
    else await assert.rejects(operation, { code: ({ editor: "SQUARESPACE_PAGE_LAYOUT_CHANGED",
      "before-save": "SQUARESPACE_PAGE_SAVE_TARGET_CHANGED", "after-reopen": "SQUARESPACE_PAGE_SAVE_UNCONFIRMED" })[fluidOrderDrift] });
    assert.equal(f.actions.filter(action => action === "save").length, fluidOrderDrift === undefined || fluidOrderDrift === "after-reopen" ? 1 : 0);
    if (fluidOrderDrift === "editor") assert.deepEqual([f.pasted, f.inserted], [[], []]);
  }
});

test("Die native Inhaltsübernahme entfernt ausschließlich den exakt markierten Standardcode neu angelegter Blöcke", async () => {
  for (const fullFlowMode of ["ready", "different-source", "partial-selection", "existing-default"]) {
    const f = await nativeFluidFixture({ fullFlowMode });
    const operation = f.driver.fillPreparedPageContent(f.webContents, f.plan, { ...f.options, afterFluidSectionId: f.afterSectionId });
    if (fullFlowMode === "ready") {
      assert.equal((await operation).reopened, true);
      assert.deepEqual(f.events, nativeClicks("section", "blank", "picker", "text", "picker", "code", "picker", "text", "picker", "code"));
      assert.equal(f.codeActions.filter(action => action === "clear-default").length, 2);
      assert.deepEqual(f.inserted, [FN_SPECIES_CODE, FN_MAP_CODE]);
      assert.equal(f.actions.filter(action => action === "save").length, 1);
      assert.equal(f.publicReads.length, 6);
    } else {
      await assert.rejects(operation, /Codefeld|Standardtext|Editorblöcke/u);
      assert.equal(f.codeActions.includes("clear-default"), false);
      assert.deepEqual(f.pasted, fullFlowMode === "partial-selection" ? [f.textIds[0]] : []);
      assert.deepEqual([f.inserted, f.actions], [[], []]);
      if (fullFlowMode === "existing-default") assert.deepEqual(f.events, []);
    }
  }
});

test("Neu gebundener Standardcode wird im selben Dialog durch den freigegebenen Inhalt ersetzt", async () => {
  for (const withGallery of [false, true]) {
    const f = await nativeFluidFixture({ firstSection: true, fullFlowMode: "ready", withGallery, restoreDefaultOnEmptyClose: true });
    const slots = f.plan.structure.slots;
    const libraryBindings = slots.at(-1).items.map((image, index) => ({
      usageId: image.id, assetId: image.assetId, sha256: image.sha256, bytes: image.bytes, mimeType: image.mimeType,
      cmsAssetId: f.assetIds[index], cmsItemId: `fn-figure-${String(index + 1).repeat(24)}`,
      sourceUrl: `https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/${f.assetIds[index]}/fixture.png`,
    }));
    const options = { ...f.options, afterFluidSectionId: null, galleryUpload: undefined, ...(withGallery && { libraryBindings }) };
    const result = await f.driver.fillPreparedPageContent(f.webContents, f.plan, options);
    const content = [FN_SPECIES_CODE, FN_MAP_CODE];
    const blocks = [f.speciesId, f.mapId];
    if (withGallery) {
      blocks.push(f.figureBlockId);
      content.push(prepareSquarespaceFigureGallery(slots.at(-1).items,
        { layout: "figures", blockId: f.figureBlockId, mediaBindings: libraryBindings }).html);
      assert.deepEqual(result.mediaBindings, libraryBindings.map(({ sourceUrl, ...binding }) => binding));
    }
    assert.equal(result.reopened, true);
    assert.deepEqual(f.inserted, content);
    assert.deepEqual(f.replacementEvents, blocks.flatMap(id => [["clear", id], ["insert", id], ["close", id]]));
    assert.deepEqual(f.actions, ["save", "exit", "reload", "reopen", "exit", "reconfirm"]);
  }
});

test("Der gebundene Standardcode wird nach Berechtigungsentzug oder abweichender Eingabebestätigung nicht gespeichert", async () => {
  for (const mode of ["revoked-after-clear", "corrupt-input"]) {
    const corruptReplacement = mode === "corrupt-input";
    const f = await nativeFluidFixture({ firstSection: true, fullFlowMode: "ready", restoreDefaultOnEmptyClose: true, corruptReplacement });
    await assert.rejects(f.driver.fillPreparedPageContent(f.webContents, f.plan, { ...f.options, afterFluidSectionId: null,
      assertWritable: async () => corruptReplacement || f.replacementEvents.length === 0 }));
    assert.deepEqual(f.replacementEvents, [["clear", f.speciesId], ...(corruptReplacement ? [["insert", f.speciesId]] : [])]);
    assert.deepEqual(f.inserted, corruptReplacement ? [FN_SPECIES_CODE] : []);
    assert.deepEqual(f.actions, []);
  }
});

test("Ein nach dem Leeren in einen fremden Abschnitt verschobener Codeblock erhält keinen freigegebenen Inhalt", async () => {
  const f = await nativeFluidFixture({ firstSection: true, fullFlowMode: "ready", restoreDefaultOnEmptyClose: true });
  const frame = f.webContents.mainFrame.framesInSubtree[1];
  const read = frame.executeJavaScript.bind(frame);
  const sectionReads = [];
  const foreignSectionId = "f".repeat(24);
  frame.executeJavaScript = async code => {
    const { operation, blockId, sectionId } = JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1));
    if (["code-block-point", "code-block-selected"].includes(operation) && blockId === f.speciesId) {
      const actualSectionId = f.replacementEvents.length ? foreignSectionId : f.sectionId;
      sectionReads.push({ operation, sectionId, actualSectionId });
      if (sectionId !== undefined && sectionId !== actualSectionId) return operation === "code-block-point" ? null : false;
    }
    return read(code);
  };
  await assert.rejects(f.driver.fillPreparedPageContent(f.webContents, f.plan, { ...f.options, afterFluidSectionId: null }),
    { code: "SQUARESPACE_PAGE_MODULE_TARGET_CHANGED" });
  assert.ok(sectionReads.some(entry => entry.operation === "code-block-point" && entry.actualSectionId === f.sectionId));
  assert.deepEqual(sectionReads.at(-1), { operation: "code-block-selected", sectionId: f.sectionId, actualSectionId: foreignSectionId });
  assert.ok(sectionReads.every(entry => entry.sectionId === f.sectionId));
  assert.deepEqual(f.replacementEvents, [["clear", f.speciesId]]);
  assert.deepEqual(f.inserted, []);
  assert.deepEqual(f.actions, []);
});

test("Neu gebundene bereits leere Codeblöcke werden ohne Standardtextersetzung befüllt", async () => {
  const f = await nativeFluidFixture({ firstSection: true, fullFlowMode: "already-empty" });
  const result = await f.driver.fillPreparedPageContent(f.webContents, f.plan, { ...f.options, afterFluidSectionId: null });
  assert.equal(result.reopened, true);
  assert.deepEqual(f.replacementEvents, []);
  assert.deepEqual(f.inserted, [FN_SPECIES_CODE, FN_MAP_CODE]);
  assert.equal(f.actions.filter(action => action === "save").length, 1);
});

test("Die Inhaltsübernahme kann mit dem ersten Abschnitt beginnen und bestätigt den gespeicherten deaktivierten Entwurf", async () => {
  const f = await nativeFluidFixture({ firstSection: true, fullFlowMode: "ready" });
  const result = await f.driver.fillPreparedPageContent(f.webContents, f.plan, { ...f.options, afterFluidSectionId: null });
  assert.equal(result.reopened, true);
  assert.deepEqual(f.sections, [{ id: f.sectionId, kind: "fluid-engine" }]);
  assert.deepEqual(f.events, nativeClicks("section", "blank", "picker", "text", "picker", "code", "picker", "text", "picker", "code"));
  assert.deepEqual(f.inserted, [FN_SPECIES_CODE, FN_MAP_CODE]);
  assert.deepEqual(f.actions, ["save", "exit", "reload", "reopen", "exit", "reconfirm"]);
  assert.equal(f.publicReads.length, 6);
});

test("Artseitenübernahme bleibt beim nächsten Block und Speichern sicher, wenn der Codeblock nach Escape ausgewählt bleibt", async () => {
  const f = await nativeFluidFixture({ firstSection: true, fullFlowMode: "ready", retainsCodeSelection: true });
  const result = await f.driver.fillPreparedPageContent(f.webContents, f.plan, { ...f.options, afterFluidSectionId: null });
  assert.equal(result.reopened, true);
  assert.equal(result.disabledConfirmed, true);
  assert.equal(f.codeActions.filter(action => action === "clear-default").length, 2);
  assert.deepEqual(f.inserted, [FN_SPECIES_CODE, FN_MAP_CODE]);
  assert.deepEqual(f.actions, ["save", "exit", "reload", "reopen", "exit", "reconfirm"]);
});

test("Native Abschnitts- und Inhaltseingaben warten auf die bestätigte öffentliche Sperre und die aktuelle Freigabe", async () => {
  for (const nativePublicMode of ["public-target", "missing-parent", "approval-revoked"]) {
    const f = await nativeFluidFixture({ fullFlowMode: "ready", nativePublicMode });
    await assert.rejects(f.driver.fillPreparedPageContent(f.webContents, f.plan, { ...f.options, afterFluidSectionId: f.afterSectionId,
      assertWritable: async () => nativePublicMode !== "approval-revoked" || !f.publicReads.length }), {
      code: nativePublicMode === "approval-revoked" ? "SQUARESPACE_PAGE_LAYOUT_CHANGED" : "SQUARESPACE_PUBLIC_TARGET_UNCONFIRMED",
    });
    assert.equal(f.publicReads.length, 2);
    assert.deepEqual([f.events, f.actions, f.pasted, f.inserted], [[], [], [], []]);
  }
});

test("Eine öffentliche Artseite oder ein Dokumentwechsel während der öffentlichen Nachprüfung lässt den Abschluss offen", async () => {
  for (const nativePublicMode of ["public-after-save", "reload-during-public-check"]) {
    const f = await nativeFluidFixture({ fullFlowMode: "ready", nativePublicMode });
    await assert.rejects(f.driver.fillPreparedPageContent(f.webContents, f.plan, { ...f.options, afterFluidSectionId: f.afterSectionId }),
      { code: "SQUARESPACE_PAGE_SAVE_UNCONFIRMED" });
    assert.equal(f.publicReads.length, 6);
    assert.deepEqual(f.actions, ["save", "exit", "reload", "reopen", "exit", "reconfirm"]);
  }
});

test("Die erneute öffentliche Prüfung verhindert den Speicherklick nach geänderter Erreichbarkeit, Inhalt oder Dokumentwechsel", async () => {
  for (const nativePublicMode of ["public-before-save", "reload-during-before-save-check", "content-drift-during-before-save-check"]) {
    const f = await nativeFluidFixture({ fullFlowMode: "ready", nativePublicMode });
    await assert.rejects(f.driver.fillPreparedPageContent(f.webContents, f.plan, { ...f.options, afterFluidSectionId: f.afterSectionId }), {
      code: nativePublicMode === "public-before-save" ? "SQUARESPACE_PAGE_SAVE_PUBLIC_CHECK_UNCONFIRMED" : "SQUARESPACE_PAGE_SAVE_TARGET_CHANGED",
    });
    assert.equal(f.publicReads.length, 4);
    assert.equal(f.pasted.length, 2);
    assert.deepEqual(f.actions, []);
  }
});

test("Die Artseitenanlage bindet geprüfte Uploads an die Galerie und stoppt bei fehlender Zuordnung", async () => {
  for (const mode of ["ready", "fluid-ready", "first-fluid-ready", "native-ready", "native-empty", "native-baseline-drift", "native-reopen-drift", "altered-bytes", "foreign-response", "reused-item",
    "approval-withdrawn", "wrong-order", "missing-observation", "extra-item"]) {
    const fluid = mode === "fluid-ready" || mode === "first-fluid-ready";
    const f = fluid ? await nativeFluidFixture({ fullFlowMode: "ready", withGallery: true, firstSection: mode === "first-fluid-ready" })
      : await authoringSaveFixture({ withGallery: true, figuresInsertion: "ready", codeInsertion: "ready", layoutDrift: "none" });
    const items = f.plan.structure.slots.at(-1).items;
    const approved = new Map(items.map((item, index) => {
      const bytes = Buffer.from(`Prüfdatei ${index}`);
      Object.assign(item, { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
      return [item.assetId, bytes];
    }));
    const uploads = [];
    const rows = mode === "native-empty" ? [] : [1, 2].map(index => ({ cmsItemId: `ab${String(index).repeat(22)}`, sourceUrl: `https://images.example.test/sample-${index}.jpg` }));
    const options = { ...f.options, galleryUpload: undefined, assertWritable: async () => mode !== "approval-withdrawn" || !uploads.length,
      readMedia: async id => mode === "altered-bytes" ? Buffer.alloc(approved.get(id).length) : approved.get(id),
      uploadImage: async ({ fileName, bytes, mimeType, assertCurrent, captureBeforeUpload, confirmUpload }) => f.duringUploadDialog(rows, async () => {
        await captureBeforeUpload();
        assert.equal(await confirmUpload(), false);
        await assertCurrent();
        const index = uploads.length;
        assert.deepEqual(bytes, approved.get(items[index].assetId));
        assert.equal(mimeType, "image/png");
        assert.match(fileName, new RegExp(`^fn-[a-f0-9]{24}-${index + 1}\\.png$`));
        uploads.push(fileName);
        if (mode === "missing-observation") return;
        if (mode === "wrong-order") [rows[0], rows[1]] = [rows[1], rows[0]];
        if (mode === "extra-item") rows.push({ cmsItemId: "f".repeat(24), sourceUrl });
        if (mode === "reused-item" && index === 1) rows.pop();
        rows.push({ sourceUrl: `https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/${f.assetIds[index]}/${mode === "foreign-response" ? "anderes-bild.png" : fileName}?format=300w`,
          cmsItemId: String(mode === "reused-item" ? 1 : index + 1).repeat(24) });
        assert.equal(await confirmUpload(), true);
      }) };
    if (mode.startsWith("native-")) {
      delete options.uploadImage;
      options.openUploadGallery = async ({ pageId, path, assertCurrent }) => {
        assert.equal(pageId, f.options.pageId);
        assert.equal(path, f.plan.target.path);
        await assertCurrent();
        if (mode === "native-reopen-drift" && uploads.length === 1) rows.pop();
        if (mode === "native-ready" && uploads.length === 1) {
          rows.at(-1).sourceUrl = rows.at(-1).sourceUrl.replace("/content/v1/", "/content/v2/namespaces/website/libraries/");
        }
        return f.openUploadDialog(rows, file => {
          const index = uploads.length;
          assert.deepEqual(Buffer.from(file.base64, "base64"), approved.get(items[index].assetId));
          assert.equal(file.type, "image/png");
          uploads.push(file.name);
          rows.push({ sourceUrl: `https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/${f.assetIds[index]}/${file.name}`,
            cmsItemId: String(index + 1).repeat(24) });
        }, mode === "native-baseline-drift" ? rows.map(row => row.cmsItemId).reverse() : undefined);
      };
    }
    if (fluid) options.afterFluidSectionId = f.afterSectionId;
    if (fluid || ["ready", "native-ready", "native-empty"].includes(mode)) {
      const saved = await f.driver.fillPreparedPageContent(f.webContents, f.plan, options);
      assert.equal(uploads.length, 2);
      assert.deepEqual(saved.mediaBindings.map(binding => [binding.usageId, binding.cmsAssetId]), items.map((item, index) => [item.id, f.assetIds[index]]));
      assert.equal(f.actions.filter(action => action === "save").length, 1);
      assert.ok(!f.inserted.at(-1).includes("format=300w"));
      if (mode === "first-fluid-ready") {
        assert.deepEqual(f.sections, [{ id: f.sectionId, kind: "fluid-engine" }]);
        assert.equal(saved.reopened, true);
        assert.equal(f.publicReads.length, 6);
      }
    } else {
      await assert.rejects(f.driver.fillPreparedPageContent(f.webContents, f.plan, options),
        { code: mode === "approval-withdrawn" ? "SQUARESPACE_PAGE_LAYOUT_CHANGED" : "SQUARESPACE_PAGE_GALLERY_BINDING",
          ...(["native-baseline-drift", "native-reopen-drift"].includes(mode) && { message: /Für dieses Bild wurde keine Datei übergeben/ }) });
      assert.equal(uploads.length, ["altered-bytes", "native-baseline-drift"].includes(mode) ? 0 : mode === "reused-item" ? 2 : 1);
      assert.deepEqual(f.pasted, []);
      assert.deepEqual(f.inserted, []);
      assert.deepEqual(f.actions, []);
    }
  }
});

test("Der Bibliotheksupload belegt die einzelne Bildverwendung auch nach dem Wiederöffnen", async () => {
  for (const mode of ["ready", "wrong-filename", "altered-bytes", "usage-marker"]) {
    const f = await authoringSaveFixture({ withGallery: true, figuresInsertion: "ready", codeInsertion: "ready",
      layoutDrift: "none", galleryTextDrift: mode === "usage-marker" ? mode : null });
    const items = f.plan.structure.slots.at(-1).items;
    const originals = new Map(items.map((item, index) => {
      const bytes = Buffer.from(`Freigegebenes Foto ${index}`);
      Object.assign(item, { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
      return [item.assetId, bytes];
    }));
    const uploads = [];
    const operation = f.driver.fillPreparedPageContent(f.webContents, f.plan, {
      ...f.options, galleryUpload: undefined,
      readMedia: async id => mode === "altered-bytes" ? Buffer.alloc(originals.get(id).length) : originals.get(id),
      uploadLibraryImage: async ({ image, fileName, bytes, assertCurrent }) => {
        await assertCurrent();
        assert.deepEqual(image, items[uploads.length]);
        assert.deepEqual(bytes, originals.get(image.assetId));
        assert.match(fileName, new RegExp(`^fn-[a-f0-9]{24}-${image.order + 1}\\.png$`));
        uploads.push(fileName);
        const assetId = f.assetIds[image.order];
        return { fileName, assetId,
          sourceUrl: `https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/${assetId}/${mode === "wrong-filename" ? "other.png" : fileName}` };
      },
    });
    if (mode === "ready") {
      const saved = await operation;
      assert.equal(saved.reopened, true);
      assert.equal(uploads.length, 2);
      const ids = saved.mediaBindings.map(binding => binding.cmsItemId);
      assert.equal(new Set(ids).size, 2);
      for (const id of ids) assert.match(id, /^fn-figure-[a-f0-9]{24}$/);
      assert.deepEqual(saved.gallery.items, items.map(({ id }, index) => ({
        usageId: id, cmsAssetId: f.assetIds[index], cmsItemId: ids[index],
        position: index + 1, alt: items[index].alt, caption: items[index].caption || null, attribution: items[index].attribution || null,
      })));
    } else {
      await assert.rejects(operation, { code: mode === "usage-marker" ? "SQUARESPACE_PAGE_SAVE_UNCONFIRMED" : "SQUARESPACE_PAGE_GALLERY_BINDING" });
      assert.equal(uploads.length, mode === "usage-marker" ? 2 : mode === "wrong-filename" ? 1 : 0);
    }
    assert.equal(f.actions.filter(action => action === "save").length, ["ready", "usage-marker"].includes(mode) ? 1 : 0);
  }
});

async function completedDraftFixture({ withGallery, reenabled = false, nativePublicMode, createFromBlank = false,
  persistedBlank = false, defaultFailure, settingsGear = "visible", groupedMap } = {}) {
  const f = await nativeFluidFixture({ firstSection: true, fullFlowMode: "ready", withGallery, nativePublicMode, createFromBlank, groupedMap });
  const settings = draftSettingsFixture({ persistedBlank });
  const top = f.webContents.mainFrame, frame = top.framesInSubtree[1];
  const settingsTop = settings.contents.mainFrame, settingsFrame = settingsTop.framesInSubtree[1];
  const nativeRead = top.executeJavaScript.bind(top), nativeFrameRead = frame.executeJavaScript.bind(frame);
  const nativeInput = f.webContents.sendInputEvent.bind(f.webContents);
  const nativeText = f.webContents.insertText.bind(f.webContents);
  const readRequest = code => JSON.parse(code.slice(code.lastIndexOf(")(") + 2, -1));
  const creationActions = [];
  const initialRows = { epoch: 100, previewPath: "/", rowCount: 109, titles: ["Alte Prüfseite"], outsideTitles: ["Startseite"],
    name: null, defaultSettingsPresent: defaultFailure === "preexisting-default" };
  const { placeholderTitle } = f.options.dispatchBinding;
  const insertedTitle = persistedBlank ? "Neue Seite" : placeholderTitle;
  const point = x => ({ point: { x, y: 1 } });
  const controls = { "search-open": 201, "search-close": 202, "catalog-open": 203,
    "catalog-classic": 204, "catalog-blank-point": 205, "draft-settings-open": 206 };
  let creating = createFromBlank, searching = false, query = "", mode = "closed", name = null, selected = false, named = false;
  let editingContent = false, gearHovered = false;
  frame.url = creating ? new URL("/", settingsFrame.url).href : settingsFrame.url;
  top.executeJavaScript = async code => {
    const request = readRequest(code), { scope, operation } = request;
    if (creating) {
      if (operation === "preview-state") return { mode: "preview", dialogOpen: false };
      if (operation === "catalog-state") return { epoch: 100, mode, previewPath: "/", modalId: mode === "closed" ? null : "m1" };
      if (operation === "search-state") return { epoch: 100, inputId: ":r8:", query,
        mode: !searching ? "closed" : !query ? "empty" : query === "wildlife/heimische-tierwelt" ? "results" : "no-results" };
      if (operation === "search-focus") return searching;
      if (operation === "draft-name-state" || operation === "draft-select-name") {
        if (name === null && !named) return initialRows;
        assert.deepEqual(request.previous, initialRows);
        if (operation === "draft-select-name") selected = true;
        return { ...initialRows, rowCount: defaultFailure === "two-new-rows" ? 111 : 110,
          titles: ["Neue Zeile", ...(defaultFailure === "two-new-rows" ? ["Zweite neue Zeile"] : []), ...initialRows.titles],
          outsideTitles: defaultFailure === "outside-row-drift" ? ["Andere Startseite"] : initialRows.outsideTitles,
          name, selected, defaultName: name === "Neue Seite", defaultSettingsPresent: persistedBlank,
          ...(named && { previewPath: settings.neutralPath, firstSettingsLabel: `Seiteneinstellungen ${insertedTitle}` }) };
      }
      if (operation === "draft-settings-reveal") return point(controls["draft-settings-open"]);
      if (operation === "draft-settings-open" && settingsGear !== "visible" && !(settingsGear === "hover" && gearHovered)) return null;
      if (Object.hasOwn(controls, operation)) return point(controls[operation]);
      throw new Error(`Unexpected creation operation: ${operation}`);
    }
    if (!editingContent && (scope === "settings" || operation?.startsWith("settings-")
        || ["preview-state", "draft-settings-open", "edit-page"].includes(operation))) return settingsTop.executeJavaScript(code);
    const result = await nativeRead(code);
    if (operation === "preview-state" && editingContent && !f.blocks.length) return { ...result, saveDisabled: true };
    return result;
  };
  frame.executeJavaScript = code => {
    const { operation } = readRequest(code);
    if (operation === "draft-collection-observation" && !creating && defaultFailure === "foreign-settings-collection") {
      return { id: "c".repeat(24), epoch: 200 };
    }
    return ["draft-collection-identity", "draft-collection-observation"].includes(operation)
      ? settingsFrame.executeJavaScript(code) : nativeFrameRead(code);
  };
  f.webContents.insertText = value => {
    if (!creating) return editingContent ? nativeText(value) : settings.contents.insertText(value);
    if (searching) query = value;
    else { assert.equal(selected, true); name = value; selected = false; creationActions.push(value); }
  };
  f.webContents.sendInputEvent = event => {
    if (creating) {
      if (event.type === "mouseMove" && event.x === controls["draft-settings-open"]) {
        gearHovered = true;
        creationActions.push("Zahnrad anzeigen");
      }
      if (event.type === "keyUp" && event.keyCode === "Enter") {
        assert.equal(name, placeholderTitle);
        name = null; named = true; frame.url = settingsFrame.url;
        creationActions.push("Enter");
      }
      if (event.type !== "mouseUp") return;
      const action = Object.keys(controls).find(key => controls[key] === event.x);
      switch (action) {
        case "search-open": searching = true; break;
        case "search-close": searching = false; query = ""; break;
        case "catalog-open": mode = "pages"; break;
        case "catalog-classic": mode = "classic"; break;
        case "catalog-blank-point":
          mode = "closed";
          if (persistedBlank) { named = true; frame.url = settingsFrame.url; }
          else name = "Neue Seite";
          creationActions.push("Leere Seite");
          break;
        case "draft-settings-open": assert.equal(named, true); creating = false; creationActions.push("Einstellungen"); break;
        default: throw new Error(`Unexpected creation click: ${event.x}`);
      }
      return;
    }
    if (!editingContent) {
      settings.contents.sendInputEvent(event);
      frame.url = settingsFrame.url;
      if (event.type === "mouseUp" && event.x === 5) editingContent = true;
      return;
    }
    nativeInput(event);
    if (event.type === "mouseUp" && event.x === 102 && f.actions.filter(action => action === "exit").length === 2) {
      settings.exitEditor({ reenabled });
      editingContent = false;
    }
  };
  f.plan.structure.path = f.plan.target.path;
  let lookups = 0;
  const saveBindings = [];
  const options = { pageId: f.options.pageId, dispatchBinding: f.options.dispatchBinding, assertCurrent: async () => {},
    rememberSaveBinding: async binding => {
      assert.equal(f.actions.includes("save"), false);
      saveBindings.push(binding);
      return true;
    },
    checkTargetAvailable: async path => {
      assert.equal(path, f.plan.target.path);
      return { path, parentPath: path.slice(0, path.lastIndexOf("/")), exists: false, parentExists: true, online: true,
        checkedAt: new Date().toISOString(), observationId: `fresh-lookup-${++lookups}` };
    } };
  return { ...f, settings, options, creationActions, saveBindings };
}

test("Die vollständige lokale Artseitenanlage führt vom Leerseiten-Klick bis zur deaktivierten gespeicherten Fassung", async () => {
  const f = await completedDraftFixture({ createFromBlank: true });
  await assert.rejects(f.driver.createUnpublishedPage(f.webContents, f.plan, { ...f.options, contentSteps: [] }),
    { code: "SQUARESPACE_EDITOR_NOT_READY" });
  assert.deepEqual(f.creationActions, []);

  const proof = await f.driver.createUnpublishedPage(f.webContents, f.plan,
    { ...f.options, contentSteps: createCmsContentSteps(f.plan) });
  assert.deepEqual(f.creationActions, ["Leere Seite", f.options.dispatchBinding.placeholderTitle, "Enter", "Einstellungen"]);
  assert.deepEqual(f.settings.events.slice(0, 2), ["disable", `save:${f.settings.neutralPath.slice(1)}`]);
  assert.deepEqual(proof.readback.page, { id: f.options.pageId, path: f.plan.target.path, title: f.plan.structure.title,
    enabled: false, saved: true, reopened: true });
  assert.equal(f.actions.filter(action => action === "save").length, 1);
  assert.deepEqual(f.saveBindings, [{ schemaVersion: 1, attemptId: f.options.dispatchBinding.attemptId,
    dispatchId: f.options.dispatchBinding.dispatchId, planHash: f.plan.planHash, pageId: f.options.pageId,
    path: f.plan.target.path, sectionId: f.sectionId, blockIds: f.blocks.map(block => block.id), mediaBindings: [] }]);
  assert.equal(f.publicReads.length, 8);
});

test("Der Artseiteneditor hält vor dem Speichern an, wenn die Zuordnung fehlt oder der Inhalt danach wechselt", async () => {
  for (const outcome of ["refused", "unavailable", "changed"]) {
    const f = await authoringSaveFixture();
    let editorChanged = false;
    const frame = f.webContents.mainFrame.framesInSubtree[1];
    const read = frame.executeJavaScript.bind(frame);
    frame.executeJavaScript = async script => {
      if (editorChanged && script.includes('"scope":"frame"')) return { status: "unknown" };
      return read(script);
    };
    await assert.rejects(f.driver.saveAndReopenPageContent(f.webContents, f.plan, { ...f.options,
      async rememberSaveBinding() {
        assert.deepEqual(f.actions, []);
        if (outcome === "unavailable") throw new Error("Journal unavailable");
        if (outcome === "changed") editorChanged = true;
        return outcome === "changed";
      },
    }), { code: outcome === "changed" ? "SQUARESPACE_PAGE_SAVE_TARGET_CHANGED" : "SQUARESPACE_PAGE_SAVE_BINDING_UNCONFIRMED",
      stage: "record-save-binding" });
    assert.deepEqual(f.actions, []);
  }
});

test("Eine automatisch als Neue Seite gespeicherte Leerseite wird vor der Zieleingabe deaktiviert", async () => {
  const f = await completedDraftFixture({ createFromBlank: true, persistedBlank: true });
  const proof = await f.driver.createUnpublishedPage(f.webContents, f.plan,
    { ...f.options, contentSteps: createCmsContentSteps(f.plan) });
  assert.deepEqual(f.creationActions, ["Leere Seite", "Einstellungen"]);
  assert.deepEqual(f.settings.events.slice(0, 7), ["disable", "save:neue-seite", "close", "open",
    "type:title", "type:navigationTitle", "type:slug"]);
  assert.deepEqual(proof.readback.page, { id: f.options.pageId, path: f.plan.target.path, title: f.plan.structure.title,
    enabled: false, saved: true, reopened: true });
  assert.equal(f.publicReads.length, 8);
});

test("Die Kartenüberschrift wird zusammen mit der Karte gespeichert und nach dem Öffnen tatsächlich zurückgelesen", async () => {
  for (const groupedMap of ["ready", "changed-after-save"]) {
    const f = await completedDraftFixture({ createFromBlank: true, persistedBlank: true, groupedMap });
    const result = f.driver.createUnpublishedPage(f.webContents, f.plan,
      { ...f.options, contentSteps: createCmsContentSteps(f.plan) });
    if (groupedMap === "ready") {
      const proof = await result;
      assert.deepEqual(proof.readback.blocks, f.plan.readback.expectation.blocks);
      assert.equal(proof.readback.page.enabled, false);
    } else await assert.rejects(result, { code: "SQUARESPACE_PAGE_SAVE_UNCONFIRMED" });
    assert.match(f.writtenCode.get(f.mapId), /<h4>Verbreitungskarte &amp; Quellen<\/h4>\n<p>Begleittext für &lt;Region&gt;<\/p>\n<div id="map-wrapper"/u);
    assert.equal(f.actions.filter(action => action === "save").length, 1);
  }
});

test("Das erst beim Überfahren sichtbare Zahnrad öffnet dieselbe Leerseite, ein verdecktes Zahnrad bleibt unangeklickt", async () => {
  for (const settingsGear of ["hover", "covered"]) {
    const f = await completedDraftFixture({ createFromBlank: true, persistedBlank: true, settingsGear });
    const result = f.driver.createUnpublishedPage(f.webContents, f.plan,
      { ...f.options, contentSteps: createCmsContentSteps(f.plan) });
    if (settingsGear === "hover") {
      assert.equal((await result).readback.page.enabled, false);
      assert.deepEqual(f.creationActions, ["Leere Seite", "Zahnrad anzeigen", "Einstellungen"]);
      assert.deepEqual(f.settings.events.slice(0, 2), ["disable", "save:neue-seite"]);
    } else {
      await assert.rejects(result, { code: "SQUARESPACE_PAGE_CREATION_UNCONFIRMED" });
      assert.deepEqual(f.creationActions, ["Leere Seite", "Zahnrad anzeigen"]);
      assert.deepEqual(f.settings.events, []);
    }
  }
});

test("Nur die neu eingefügte Standardseite mit eindeutig bestätigter Vorschau darf automatisch deaktiviert werden", async () => {
  for (const defaultFailure of ["preexisting-default", "two-new-rows", "outside-row-drift", "foreign-settings-collection"]) {
    const f = await completedDraftFixture({ createFromBlank: true, persistedBlank: true, defaultFailure });
    const run = () => f.driver.createUnpublishedPage(f.webContents, f.plan,
      { ...f.options, contentSteps: createCmsContentSteps(f.plan) });
    const blockedBeforeClick = defaultFailure === "preexisting-default";
    await assert.rejects(run(), { code: blockedBeforeClick ? "SQUARESPACE_PAGE_CREATION_NOT_AUTHORIZED"
      : "SQUARESPACE_PAGE_CREATION_UNCONFIRMED" }, defaultFailure);
    assert.deepEqual(f.creationActions, blockedBeforeClick ? [] : defaultFailure === "foreign-settings-collection"
      ? ["Leere Seite", "Einstellungen"] : ["Leere Seite"], defaultFailure);
    assert.deepEqual(f.settings.events, [], defaultFailure);
    assert.deepEqual(f.actions, [], defaultFailure);
    await assert.rejects(run(), { code: "SQUARESPACE_PAGE_CREATION_NOT_AUTHORIZED" }, defaultFailure);
  }

  const preexisting = await completedDraftFixture({ persistedBlank: true });
  await assert.rejects(preexisting.driver.completeUnpublishedDraft(preexisting.webContents, preexisting.plan,
    { ...preexisting.options, disabledInitialDraft: { path: "/neue-seite", pageId: preexisting.options.pageId } }),
  { code: "SQUARESPACE_DRAFT_COMPLETION_UNCONFIRMED" });
  assert.deepEqual(preexisting.settings.events, []);
});

test("Eine nach der Adresszuweisung öffentlich erreichbare Artseite stoppt vor dem Lesen und Hochladen der Bilder", async () => {
  const f = await completedDraftFixture({ withGallery: true, nativePublicMode: "public-target" });
  const mediaActions = [];
  await assert.rejects(f.driver.completeUnpublishedDraft(f.webContents, f.plan, { ...f.options,
    readMedia: async id => { mediaActions.push(id); },
    uploadLibraryImage: async ({ fileName }) => { mediaActions.push(fileName); },
  }), { code: "SQUARESPACE_ASSET_DRAFT_PUBLIC_CHECK_UNCONFIRMED" });
  assert.deepEqual(f.settings.events.slice(0, 2), ["disable", `save:${f.settings.neutralPath.slice(1)}`]);
  assert.ok(f.settings.events.includes(`save:${f.plan.target.path.slice(1)}`));
  assert.equal(f.publicReads.length, 2);
  assert.deepEqual(mediaActions, []);
  assert.ok(!f.settings.events.includes("edit"));
  assert.deepEqual(f.actions, []);
});

test("Der erkannte neutrale Entwurf führt vom Deaktivieren bis zur Explorer-Quittung", async t => {
  let uploadTime = 0;
  const now = performance.now.bind(performance);
  t.mock.method(performance, "now", () => now() + uploadTime);
  for (const mode of ["text-only", "library-images", "library-settings-drift", "reenabled-after-save", "public-after-save", "foreign-shell", "revoked-journal"]) {
    const withGallery = mode === "library-images" || mode === "library-settings-drift";
    const createFromBlank = mode === "library-images";
    const f = await completedDraftFixture({ withGallery, createFromBlank, reenabled: mode === "reenabled-after-save",
      nativePublicMode: mode === "public-after-save" ? mode : undefined });
    const options = { ...f.options };
    const uploads = [];
    if (mode === "foreign-shell") options.pageId = "e".repeat(24);
    if (mode === "text-only") delete options.pageId;
    if (mode === "revoked-journal") options.assertCurrent = async () => false;
    if (withGallery) {
      const items = f.plan.structure.slots.at(-1).items;
      const originals = new Map(items.map((item, index) => {
        const bytes = Buffer.from(`Prüfbild ${index}`);
        Object.assign(item, { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
        return [item.assetId, bytes];
      }));
      options.readMedia = async id => originals.get(id);
      options.uploadLibraryImage = async ({ pageId, image, fileName, bytes, assertCurrent }) => {
        await assertCurrent();
        assert.equal(pageId, f.options.pageId);
        assert.deepEqual(bytes, originals.get(image.assetId));
        assert.ok(!f.settings.events.includes("edit"));
        const assetId = f.assetIds[image.order];
        uploads.push(assetId);
        uploadTime += 65_000;
        if (mode === "library-settings-drift") f.settings.setEntry("enabled-during-upload");
        return { fileName, assetId, sourceUrl: `https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/${assetId}/${fileName}` };
      };
    }
    const complete = createFromBlank
      ? f.driver.createUnpublishedPage(f.webContents, f.plan, { ...options, contentSteps: createCmsContentSteps(f.plan) })
      : f.driver.completeUnpublishedDraft(f.webContents, f.plan, options);
    if (mode === "library-settings-drift") {
      await assert.rejects(complete, { code: "SQUARESPACE_ASSET_DRAFT_SETTINGS_CHANGED" });
      assert.equal(uploads.length, 1);
      assert.ok(!f.settings.events.includes("edit"));
      assert.deepEqual(f.actions, []);
      continue;
    }
    if (mode === "foreign-shell" || mode === "revoked-journal") {
      await assert.rejects(complete, { code: "SQUARESPACE_DRAFT_COMPLETION_UNCONFIRMED" });
      assert.deepEqual(f.settings.events, []);
      assert.deepEqual(f.events, []);
      assert.deepEqual(f.actions, []);
      continue;
    }
    if (mode === "reenabled-after-save" || mode === "public-after-save") {
      await assert.rejects(complete, { code: "SQUARESPACE_PAGE_SAVE_UNCONFIRMED" });
    }
    else {
      const proof = await complete;
      assert.deepEqual(Object.keys(proof), ["readback", "mediaBindings"]);
      assert.deepEqual(proof.readback.page, { id: f.options.pageId, path: f.plan.target.path, title: f.plan.structure.title,
        enabled: false, saved: true, reopened: true });
      assert.deepEqual(proof.readback.blocks.slice(0, -1), f.plan.readback.expectation.blocks.slice(0, -1));
      assert.deepEqual(proof.mediaBindings.map(binding => binding.cmsAssetId), uploads);
      assert.deepEqual(proof.readback.blocks.at(-1).items.map(item => item.cmsItemId), proof.mediaBindings.map(binding => binding.cmsItemId));
      assert.equal(f.publicReads.length, createFromBlank ? 10 : 6);
      if (createFromBlank) assert.deepEqual(f.creationActions,
        ["Leere Seite", f.options.dispatchBinding.placeholderTitle, "Enter", "Einstellungen"]);
    }
    assert.deepEqual(f.settings.events.slice(0, 2), ["disable", `save:${f.settings.neutralPath.slice(1)}`]);
    assert.ok(f.settings.events.includes(`save:${f.plan.target.path.slice(1)}`));
    assert.equal(f.actions.filter(action => action === "save").length, 1);
    assert.equal(uploads.length, mode === "library-images" ? 2 : 0);
  }
});

test("Die neutrale Seitenkennung wird aus stabilen Einstellungen und dem geladenen Vorschau-Dokument gelesen", async () => {
  for (const entry of ["loaded", "foreign-title", "dirty-settings", "unloaded-preview", "collection-drift", "frame-reloaded"]) {
    const f = draftSettingsFixture();
    f.setEntry(entry);
    const observed = await f.driver.inspectNeutralDraft(f.contents, f.options.dispatchBinding);
    assert.deepEqual(observed, entry === "loaded" ? { pageId: f.options.pageId, path: f.neutralPath } : null);
    assert.deepEqual(f.events, []);
  }
});

test("Fremde Bilder oder widersprüchliche Uploadbindungen verhindern den Artseiten-Speicherklick", async () => {
  for (const kind of ["extra", "missing", "bytes", "duplicateAsset", "duplicateItem"]) {
    const f = await authoringSaveFixture({ withGallery: true, extraPreviewImage: kind === "extra" });
    const binding = f.options.galleryUpload.mediaBindings;
    if (kind === "missing") f.options.galleryUpload = undefined;
    if (kind === "bytes") binding[0].bytes++;
    if (kind === "duplicateAsset") binding[1].cmsAssetId = binding[0].cmsAssetId;
    if (kind === "duplicateItem") binding[1].cmsItemId = binding[0].cmsItemId;
    await assert.rejects(f.driver.saveAndReopenPageContent(f.webContents, f.plan, f.options),
      { code: kind === "extra" ? "SQUARESPACE_PAGE_SAVE_TARGET_CHANGED" : "SQUARESPACE_PAGE_GALLERY_BINDING" });
    assert.deepEqual(f.actions, []);
  }
});

test("Eine nach Wiederöffnen vertauschte Galerie bleibt nach dem einzelnen Speichern unbestätigt", async () => {
  const f = await authoringSaveFixture({ withGallery: true, reversedAfterReload: true });
  await assert.rejects(f.driver.saveAndReopenPageContent(f.webContents, f.plan, f.options), { code: "SQUARESPACE_PAGE_SAVE_UNCONFIRMED" });
  assert.deepEqual(f.actions, ["save", "exit", "reload", "reopen"]);
});

test("Artseitenspeicherung verlangt die freigegebene Blockfolge und dieselben Funktionsblöcke nach dem Wiederöffnen", async () => {
  for (const moduleDrift of ["position", "missing", "foreign", "identity"]) {
    const f = await authoringSaveFixture({ withGallery: true, moduleDrift });
    const changedAfterSave = moduleDrift === "identity";
    await assert.rejects(f.driver.saveAndReopenPageContent(f.webContents, f.plan, f.options),
      { code: changedAfterSave ? "SQUARESPACE_PAGE_SAVE_UNCONFIRMED" : "SQUARESPACE_PAGE_SAVE_TARGET_CHANGED" });
    assert.deepEqual(f.actions, changedAfterSave ? ["save", "exit", "reload", "reopen"] : []);
  }
});

test("Der Artseiteneditor öffnet eine korrekt zugeordnete leere Vorschau genau einmal und verlangt den tatsächlich geladenen Inhalt", async () => {
  const ready = await authoringSaveFixture({ withGallery: true, blankAfterReload: true });
  const result = await ready.driver.saveAndReopenPageContent(ready.webContents, ready.plan, ready.options);
  assert.equal(result.reopened, true);
  assert.deepEqual(ready.actions, ["save", "exit", "reload", "reopen", "exit", "reconfirm"]);
  const stalled = await authoringSaveFixture({ blankAfterReload: true, blankAfterEdit: true });
  await assert.rejects(stalled.driver.saveAndReopenPageContent(stalled.webContents, stalled.plan, stalled.options),
    { code: "SQUARESPACE_PAGE_SAVE_UNCONFIRMED" });
  assert.deepEqual(stalled.actions, ["save", "exit", "reload", "reopen"]);
});

test("Beim Wiederöffnen neben Hilfsrahmen gilt nur der nachweislich leere benannte Seitenrahmen", async () => {
  const auxiliaryFramesAfterReload = ["https://example.invalid/helper", "about:blank", "https://example.invalid/session"];
  for (const blankPreviewDocument of [true, false, undefined]) {
    const f = await authoringSaveFixture({ withGallery: true, blankAfterReload: true, blankPreviewDocument, auxiliaryFramesAfterReload });
    const operation = f.driver.saveAndReopenPageContent(f.webContents, f.plan, f.options);
    if (blankPreviewDocument === true) {
      assert.equal((await operation).reopened, true);
      assert.deepEqual(f.actions, ["save", "exit", "reload", "reopen", "exit", "reconfirm"]);
    } else {
      await assert.rejects(operation, { code: "SQUARESPACE_PAGE_SAVE_UNCONFIRMED", stage: "reopen-saved-editor" });
      assert.deepEqual(f.actions, ["save", "exit", "reload"]);
    }
  }
});

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
    for (const attr of simple.matchAll(/\[([\w-]+)(?:(\^=|=)(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/g)) {
      const value = node.getAttribute(attr[1]);
      const expected = attr[3] ?? attr[4] ?? attr[5];
      if (value === null || attr[2] === "=" && value !== expected || attr[2] === "^=" && !value.startsWith(expected)) return false;
    }
    return true;
  });
  const box = (left = 0, top = 0, width = 288, height = 432) => ({ left, top, width, height,
    right: left + width, bottom: top + height, x: left, y: top });
  function element(tag, { attrs = {}, css = {}, rect = box(), text = "", value = "" } = {}, children = []) {
    const node = {
      nodeType: 1, tagName: tag.toUpperCase(), attrs, css: { visibility: "visible", display: "block", transform: "none", ...css },
      rect, innerText: text, textContent: text, value, children: [], parentElement: null,
      get childNodes() { return [...(node.textContent ? [{ nodeType: 3, nodeValue: node.textContent }] : []), ...node.children]; },
      getAttribute: (name) => Object.hasOwn(attrs, name) ? attrs[name] : null,
      getAttributeNames: () => Object.keys(attrs), hasAttribute: (name) => Object.hasOwn(attrs, name),
      classList: { contains: name => (attrs.class || "").split(/\s+/u).includes(name) },
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
  const operation = vm.runInNewContext(`(${domBody})`, { document, URL, innerWidth, innerHeight, performance: { timeOrigin: 123 },
    getComputedStyle: (node) => node.css, MouseEvent: class { constructor(type) { this.type = type; } } });
  return { document, element, box, calls, operation };
}

test("Seiteneinstellungen benötigen den treffbaren Zahnrad-Button der sichtbaren Seitenzeile", () => {
  const { document, element, box, operation } = cmsDomFixture();
  const button = element("button", { attrs: { "data-test": "collection-settings", "aria-label": "Seiteneinstellungen Neue Seite" },
    rect: box(240, 270, 24, 24), css: { opacity: "0" } });
  button.tabIndex = 0;
  button.focus = () => { document.activeElement = button; };
  const row = element("div", { attrs: { "data-test": "grouped-list-item" }, rect: box(25, 260, 270, 44) }, [
    element("p", { text: "Neue Seite", rect: box(45, 270, 145, 24) }), button,
  ]);
  const url = "https://vanilla-gerbil-jwnp.squarespace.com/neue-seite";
  document.append(element("nav", { attrs: { "aria-label": "Website-Vorschau und Bearbeitungstools" }, rect: box(320, 0, 1080, 60) }, [
    element("button", { text: "Bearbeiten", rect: box(330, 10, 100, 30) }),
  ]), element("iframe", { attrs: { id: "sqs-site-frame", src: url }, rect: box(320, 60, 1080, 940) }),
  element("nav", { attrs: { "data-test": "pages-panel" }, rect: box(0, 0, 310, 1000) }, [row]));
  const read = name => JSON.parse(JSON.stringify(operation({ operation: name, pageUrl: url, names: ["Neue Seite"] })));
  assert.equal(read("draft-settings-open"), null, "ein durchsichtiges Zahnrad darf keinen Klickpunkt liefern");
  assert.deepEqual(read("draft-settings-reveal"), { point: { x: 252, y: 282 } });
  assert.equal(read("draft-settings-focused"), false);
  assert.equal(read("draft-settings-focus"), true);
  assert.equal(read("draft-settings-focused"), true);
  button.css.opacity = "1";
  assert.deepEqual(read("draft-settings-open"), { point: { x: 252, y: 282 } });
  const rowHit = document.elementFromPoint;
  document.elementFromPoint = () => row;
  assert.equal(read("draft-settings-open"), null, "die Zeile selbst ist kein Zahnrad");
  document.elementFromPoint = () => document;
  assert.equal(read("draft-settings-reveal"), null, "ein fremdes Element darf nicht gehovert werden");
  assert.equal(read("draft-settings-focused"), null, "eine verdeckte Zeile darf keine Tasteneingabe erhalten");
  document.elementFromPoint = rowHit;
  row.append(element("p", { text: "Neue Seite" }));
  assert.equal(read("draft-settings-open"), null, "eine mehrdeutige Seitenzeile bleibt geschützt");
});

test("Die Collection-Kennung wird nur aus dem geladenen Dokument am erwarteten Pfad gelesen", () => {
  const { document, operation } = cmsDomFixture();
  const pageUrl = "https://www.fnwildlifetravel.de/fn-artseitenentwurf-d-test", id = "a".repeat(24);
  const observe = () => operation({ operation: "draft-collection-observation", pageUrl });
  document.body = { id: `collection-${id}` };
  document.URL = "https://www.fnwildlifetravel.de/andere-seite";
  assert.equal(observe(), null);
  document.URL = pageUrl;
  assert.deepEqual({ ...observe() }, { id, epoch: 123 });
  document.body.id = `other-${id}`;
  assert.equal(observe(), null);
});

test("Textaktivierung trifft nur einen nachgewiesenen leeren Textblock", () => {
  const { document, element, box, operation } = cmsDomFixture();
  const pageId = "6ae89f789cf13b0c388e4ccf", blockId = "block-6ae8a8cfa287dc5274ba96ff";
  const pageUrl = "https://www.fnwildlifetravel.de/arten-explorer-funktionsprufung-2026-11-02";
  document.body = { id: `collection-${pageId}` };
  document.URL = pageUrl;
  const field = element("div", { attrs: { "data-sqsp-text-block-content": "" }, rect: box(100, 200, 250, 60) });
  const block = element("div", { attrs: { id: blockId, "data-sqsp-block": "text", "data-definition-name": "website.components.html" },
    rect: box(90, 190, 300, 100) }, [field]);
  document.append(element("main", {}, [element("article", {}, [block])]));
  const payload = { operation: "text-block-activation", pageUrl, pageId, blockId };
  assert.equal(operation(payload)?.point.x, 225);
  assert.equal(operation({ ...payload, pageUrl: pageUrl + "-andere" }), null);
  field.append(element("a", { attrs: { href: "https://www.fnwildlifetravel.de/" }, rect: box(200, 200, 55, 55) }));
  assert.equal(operation(payload), null);
  field.children.pop();
  field.textContent = "Vorhandener Inhalt";
  assert.equal(operation(payload), null);
  field.textContent = "";
  Object.assign(field.attrs, { contenteditable: "true", role: "textbox" });
  field.isContentEditable = true;
  assert.equal(operation(payload)?.active, true);
  field.attrs["aria-readonly"] = "true";
  assert.equal(operation(payload), null);
});

test("Neu angelegter Fluid-Engine-Text benötigt seine eigene Grid-Kennung zur Aktivierung", () => {
  const { document, element, operation } = cmsDomFixture();
  const pageId = "6ae89f789cf13b0c388e4ccf", blockId = "block-yui_3_17_2_1_1794333258856_1314";
  document.body = { id: `collection-${pageId}` };
  document.URL = pageUrl;
  const field = element("div", { attrs: { contenteditable: "true", role: "textbox" } });
  field.isContentEditable = true;
  const block = element("div", { attrs: { id: blockId, "data-sqsp-block": "text", "data-definition-name": "website.components.html" } }, [field]);
  const cell = element("div", { attrs: { role: "gridcell", "data-block-id": blockId.slice(6) } }, [block]);
  document.append(element("main", {}, [element("article", {}, [cell])]));
  const payload = { operation: "text-block-activation", pageUrl, pageId, blockId };
  assert.equal(operation(payload)?.active, true);
  cell.attrs["data-block-id"] = "andere-kennzeichnung";
  assert.equal(operation(payload), null);
});

test("Abschnittskatalog bindet den sichtbaren Editor-Rahmen und verwirft fremde oder doppelte Kontrollen", () => {
  const { document, element, box, operation } = cmsDomFixture();
  const sectionId = "6ae8a8ce46aa540e7bd07797";
  const control = (y) => element("button", { attrs: { "data-test": "section-add-button" }, text: "Abschnitt hinzufügen", rect: box(500, y, 180, 36) });
  const button = control(300);
  const boundOverlay = element("div", { attrs: { "data-section-id": sectionId }, rect: box(400, 270, 400, 110) }, [button]);
  document.append(element("iframe", { attrs: { id: "sqs-site-frame", src: pageUrl }, rect: box(0, 60, 1200, 900) }),
    element("nav", { attrs: { "aria-label": "Website-Vorschau und Bearbeitungstools" }, rect: box(0, 0, 1200, 60) }, [
      element("button", { text: "Speichern", rect: box(10, 10, 100, 30) }),
      element("button", { text: "Beenden", rect: box(120, 10, 100, 30) }),
    ]), boundOverlay, element("div", { attrs: { "data-section-id": "b".repeat(24) }, rect: box(400, 420, 400, 110) }, [control(450)]));
  const trigger = { operation: "section-catalog-trigger", pageUrl, sectionId };
  const open = { operation: "section-catalog-open", pageUrl };
  const target = operation(trigger)?.point;
  assert.deepEqual([target?.x, target?.y], [590, 318]);
  assert.equal(operation({ ...trigger, pageUrl: pageUrl + "-fremd" }), null);
  boundOverlay.append(control(340));
  assert.equal(operation(trigger), null);
  boundOverlay.children.pop();
  const dialog = element("div", { attrs: { role: "dialog", "aria-modal": "true" }, rect: box(200, 100, 800, 700) }, [
    element("h2", { text: "Abschnitt hinzufügen", rect: box(240, 140, 300, 30) }),
  ]);
  document.append(dialog);
  assert.equal(operation(trigger), null);
  assert.equal(operation(open), true);
  dialog.children[0].innerText = "Anderer Dialog";
  assert.equal(operation(open), false);
});

test("Eine noch nicht geladene Seite oder unbekannte Struktur zählt nicht als leerer Artseitenentwurf", () => {
  const { document, element, operation } = cmsDomFixture();
  const pageId = "6ae89f789cf13b0c388e4ccf";
  document.body = { id: `collection-${pageId}` };
  document.URL = pageUrl;
  const anchor = { operation: "section-catalog-anchor", pageUrl, pageId, sectionId: null };
  const sections = { ...anchor, operation: "fluid-page-sections" };
  assert.equal(operation(anchor), false);
  const article = element("article"), main = element("main", {}, [article]);
  document.append(main);
  assert.equal(operation(anchor), true);
  assert.equal(operation({ ...anchor, pageId: "b".repeat(24) }), false);
  assert.equal(operation({ ...anchor, pageUrl: pageUrl + "-andere" }), false);
  for (const content of [
    element("section"),
    element("div", { attrs: { "data-sqsp-section": "unbekannt" } }),
    element("div", { attrs: { "data-block-id": "unbekannt" }, css: { display: "none" } }),
    element("img"),
  ]) {
    article.append(content);
    assert.equal(operation(anchor), false);
    if (content.tagName === "SECTION" || content.attrs["data-sqsp-section"]) assert.equal(operation(sections), null);
    article.children.pop();
  }
  article.textContent = "Vorhandener Inhalt";
  assert.equal(operation(anchor), false);
  const sectionId = "a".repeat(24);
  const created = element("section", { attrs: { "data-section-id": sectionId, "data-sqsp-section": "fluid-engine" } });
  article.append(created);
  assert.equal(operation(sections), null);
  article.textContent = "";
  assert.equal(operation(sections)?.[0].id, sectionId);
  article.append(element("img", { css: { display: "none" } }));
  assert.equal(operation(sections), null);
});

test("Die beobachtete leere Squarespace-Region zählt weder als Inhalt noch als bearbeitbarer Abschnitt", () => {
  const { document, element, operation } = cmsDomFixture();
  const pageId = "6af4934c305b39408cc75520";
  document.body = { id: `collection-${pageId}` };
  document.URL = pageUrl;
  const anchor = { operation: "section-catalog-anchor", pageUrl, pageId, sectionId: null };
  const sections = { ...anchor, operation: "fluid-page-sections" };
  const attrs = { class: "region", "data-region-id": "page", "data-region-source": "collection" };
  const region = element("section", { attrs });
  const article = element("article", {}, [region]);
  document.append(element("main", {}, [article]));
  assert.equal(operation(anchor), true);
  assert.equal(operation(sections)?.length, 0);

  for (const change of [
    () => { region.textContent = "Vorhandener Text"; return () => { region.textContent = ""; }; },
    () => { region.append(element("img")); return () => region.children.pop(); },
    () => { attrs["data-section-id"] = "a".repeat(24); return () => { delete attrs["data-section-id"]; }; },
    () => { article.append(element("section", { attrs: { ...attrs } })); return () => article.children.pop(); },
  ]) {
    const restore = change();
    assert.equal(operation(anchor), false);
    assert.equal(operation(sections), null);
    restore();
  }

  const sectionId = "b".repeat(24);
  article.append(element("section", { attrs: { "data-section-id": sectionId, "data-sqsp-section": "fluid-engine" } }));
  assert.equal(operation(anchor), false);
  assert.equal(operation(sections)?.[0]?.id, sectionId);
});

test("Der erste Abschnitt bindet genau eine ungebundene native Schaltfläche im Editor-Rahmen", () => {
  const { document, element, box, operation } = cmsDomFixture();
  const add = y => element("button", { attrs: { "data-test": "section-add-button" }, text: "Abschnitt hinzufügen", rect: box(500, y, 180, 36) });
  const button = add(300);
  const wrapper = element("div", { rect: box(400, 270, 400, 110) }, [button]);
  document.append(element("iframe", { attrs: { id: "sqs-site-frame", src: pageUrl }, rect: box(200, 60, 1000, 900) }),
    element("nav", { attrs: { "aria-label": "Website-Vorschau und Bearbeitungstools" }, rect: box(0, 0, 1200, 60) }, [
      element("button", { text: "Speichern", rect: box(10, 10, 100, 30) }),
      element("button", { text: "Beenden", rect: box(120, 10, 100, 30) }),
    ]), wrapper);
  const trigger = { operation: "section-catalog-trigger", pageUrl, sectionId: null };
  const target = operation(trigger)?.point;
  assert.deepEqual([target?.x, target?.y], [590, 318]);
  assert.equal(operation({ ...trigger, sectionId: undefined }), null);
  wrapper.append(add(350));
  assert.equal(operation(trigger), null);
  wrapper.children.pop();
  wrapper.attrs["data-section-id"] = "a".repeat(24);
  assert.equal(operation(trigger), null);
  delete wrapper.attrs["data-section-id"];
  button.rect = box(10, 300, 180, 36);
  assert.equal(operation(trigger), null);
  button.css.display = "none";
  assert.equal(operation(trigger), null, "Ein verborgener Treffer erlaubt keinen Wechsel der Bedienfläche");
  wrapper.children.pop();
  assert.equal(operation(trigger), null, "Ein geänderter Editor erlaubt keinen ersten Abschnitt über den Framepfad");
  document.querySelectorAll("button").find(control => control.innerText === "Speichern").disabled = true;
  assert.equal(operation(trigger)?.frameTriggerAllowed, true);
  assert.equal(operation({ ...trigger, sectionId: "a".repeat(24) }), null);
});

test("Nur das beobachtete Squarespace-Bediengerüst zählt als leerer Inhaltsartikel und bindet die erste Schaltfläche", () => {
  const { document, element, box, operation } = cmsDomFixture();
  const pageId = "6af4934c305b39408cc75520";
  document.body = { id: `collection-${pageId}` };
  document.URL = pageUrl;
  const label = element("span", { attrs: { class: "fs-unmask" }, text: "Abschnitt hinzufügen" });
  const button = element("button", { attrs: { "data-guidance-engine": "guidance-engine-add-section-button", class: "empty-section-node-new" },
    rect: box(400, 300, 180, 36) }, [label]);
  const div = (classes, child) => element("div", { attrs: classes ? { class: classes } : {} }, [child]);
  const hitBox = div("add-hit-box sqs-empty-add-button", button), inner = div(null, hitBox);
  const content = div("sqs-empty-section-content", inner);
  const placeholder = div("sqs-empty-section", content);
  placeholder.attrs["data-section-id"] = "PAGE_SECTIONS-placeholder";
  const region = element("section", { attrs: { class: "region sqs-frontend-overlay-editor-widget-host",
    "data-region-id": "d".repeat(24), "data-region-source": "collection" } }, [placeholder]);
  const editLabel = element("span", { text: "Seite bearbeiten" });
  const iconClasses = "edit-tool-button-icon css-y880pu";
  const icon = element("svg", { attrs: { class: iconClasses } }, [element("path")]);
  const editContent = element("div", { attrs: { class: "css-dynamic" } }, [icon, editLabel]);
  const editButton = element("button", { attrs: { class: "edit-tool-button css-new" } }, [editContent]);
  const editContainer = div("page-edit-button-container non-focusable-button", div("page-edit-button-wrapper section-toolbar-button-wrapper", editButton));
  const article = element("article", {}, [region, editContainer]);
  document.append(element("main", {}, [article]));
  const trigger = { operation: "section-catalog-frame-trigger", pageUrl, pageId, sectionId: null };
  const anchor = { ...trigger, operation: "section-catalog-anchor" };
  const sections = { ...trigger, operation: "fluid-page-sections" };
  const result = operation(trigger);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { point: { x: 490, y: 318 }, viewport: { width: 1400, height: 1000 }, epoch: 123 });
  assert.equal(operation(anchor), true);
  assert.equal(operation(sections)?.length, 0);
  assert.equal(operation({ ...trigger, sectionId: "a".repeat(24) }), null);
  assert.equal(operation({ ...trigger, pageId: "b".repeat(24) }), null);
  assert.equal(operation({ ...trigger, pageUrl: pageUrl + "-andere" }), null);
  const contentTitle = element("div", { attrs: { class: "sqs-empty-title" }, text: "Seiteninhalt hinzufügen" });
  content.children.unshift(contentTitle);
  assert.equal(operation(anchor), true);
  assert.equal(operation(sections)?.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(operation(trigger))), JSON.parse(JSON.stringify(result)));
  for (const change of [
    () => { document.append(element("button", { attrs: { ...button.attrs }, css: { display: "none" } })); return () => document.children.pop(); },
    () => { placeholder.attrs["data-section-id"] = "a".repeat(24); return () => { placeholder.attrs["data-section-id"] = "PAGE_SECTIONS-placeholder"; }; },
    () => { region.attrs["data-sqsp-section"] = "fluid-engine"; return () => { delete region.attrs["data-sqsp-section"]; }; },
    () => { region.attrs["data-region-source"] = "foreign"; return () => { region.attrs["data-region-source"] = "collection"; }; },
    () => { inner.textContent = "Vorhandener Text"; return () => { inner.textContent = ""; }; },
    () => { contentTitle.textContent = "Vorhandener Titel"; return () => { contentTitle.textContent = "Seiteninhalt hinzufügen"; }; },
    () => { contentTitle.append(element("img")); return () => contentTitle.children.pop(); },
    () => { label.textContent = "Anderer Abschnitt"; return () => { label.textContent = "Abschnitt hinzufügen"; }; },
    () => { editLabel.append(element("img")); return () => editLabel.children.pop(); },
    () => { icon.append(element("path")); return () => icon.children.pop(); },
    () => { icon.attrs.class = "foreign-svg"; return () => { icon.attrs.class = iconClasses; }; },
    () => { article.append(element("div", { attrs: { "data-block-id": "fremd" }, css: { display: "none" } })); return () => article.children.pop(); },
    () => { article.append(element("section", { attrs: { "data-section-id": "b".repeat(24), "data-sqsp-section": "fluid-engine" } }));
      return () => article.children.pop(); },
  ]) {
    const restore = change();
    assert.equal(operation(trigger), null);
    assert.equal(operation(anchor), false);
    assert.equal(operation(sections), null);
    restore();
  }
  for (const change of [
    () => { hitBox.attrs["aria-hidden"] = "true"; return () => { delete hitBox.attrs["aria-hidden"]; }; },
    () => { button.attrs["aria-disabled"] = "true"; return () => { delete button.attrs["aria-disabled"]; }; },
    () => { document.append(element("div", { attrs: { role: "dialog" }, rect: box(600, 390, 160, 36) })); return () => document.children.pop(); },
    () => { document.append(element("div", { rect: box(400, 300, 180, 36) })); return () => document.children.pop(); },
  ]) {
    const restore = change();
    assert.equal(operation(trigger), null);
    restore();
  }
  region.children.length = 0;
  const id = "e".repeat(24);
  const fluid = element("section", { attrs: { "data-section-id": id, "data-sqsp-section": "fluid-engine" } },
    [element("div", { attrs: { class: "fluid-engine" } }), element("svg")]);
  region.append(fluid);
  assert.equal(operation(anchor), false);
  assert.deepEqual(JSON.parse(JSON.stringify(operation(sections))), [{ id, kind: "fluid-engine" }]);
  region.append(element("p", { text: "Fremder Inhalt außerhalb des Abschnitts" }));
  assert.equal(operation(sections), null);
  region.children.pop();
  editLabel.append(element("img"));
  assert.equal(operation(sections), null);
});

test("Der sichtbare Block-hinzufügen-Knopf bleibt an seinem Treffpunkt und ist an den Abschnitt gebunden", () => {
  const { document, element, box, operation, calls } = cmsDomFixture();
  const sectionId = "e".repeat(24);
  const regionAttributes = { "data-section-id": sectionId };
  const toolbar = element("nav", { attrs: { "aria-label": "Website-Vorschau und Bearbeitungstools" }, rect: box(0, 0, 1200, 60) }, [
    element("button", { text: "Speichern", rect: box(30, 10, 80, 30) }),
    element("button", { text: "Beenden", rect: box(120, 10, 100, 30) }),
  ]);
  const add = element("button", { text: "Block hinzufügen", rect: box(80, 235, 190, 45) });
  const region = element("div", { attrs: regionAttributes, rect: box(10, 200, 900, 500) }, [add]);
  document.append(element("iframe", { attrs: { id: "sqs-site-frame", src: pageUrl }, rect: box(0, 60, 1200, 900) }), toolbar, region);
  const request = { operation: "fluid-block-trigger", pageUrl, sectionId };
  assert.deepEqual(JSON.parse(JSON.stringify(operation(request))), { point: { x: 175, y: 257 } });
  assert.equal(calls.some(([name]) => name === "scroll"), false);
  regionAttributes["data-section-id"] = "a".repeat(24);
  assert.equal(operation(request), null);
  regionAttributes["data-section-id"] = sectionId;
  document.append(element("div", { rect: box(80, 235, 190, 45) }));
  assert.equal(operation(request), null);
});

test("Fluid-Engine-Blockauswahl bindet den nativen Eintrag und belässt einen sichtbaren Treffer an seiner Position", () => {
  const { document, element, box, operation, calls } = cmsDomFixture({ innerWidth: 1400, innerHeight: 1000 });
  const pageId = "6af4934c305b39408cc75520", sectionId = "e".repeat(24);
  document.body = { id: `collection-${pageId}` };
  document.URL = pageUrl;
  const grid = element("div", { attrs: { class: "fluid-engine" }, css: { display: "grid" }, rect: box(300, 200, 900, 500) });
  const section = element("section", { attrs: { "data-section-id": sectionId, "data-sqsp-section": "fluid-engine" } }, [grid]);
  const attrs = { id: "block-selector-button-website.components.html", role: "button" };
  const choice = element("div", { attrs, text: "Text", rect: box(40, 360, 140, 44) });
  const region = element("section", { attrs: { role: "region", "aria-label": "Block-Auswahl" }, rect: box(20, 250, 310, 480) }, [choice]);
  document.append(element("main", {}, [element("article", {}, [section])]), region);
  const request = { operation: "fluid-block-choice", pageUrl, pageId, sectionId, kind: "text" };
  assert.deepEqual(JSON.parse(JSON.stringify(operation(request))), { point: { x: 110, y: 382 }, viewport: { width: 1400, height: 1000 } });
  assert.equal(calls.some(([name]) => name === "scroll"), false);
  assert.equal(operation({ ...request, kind: "code" }), null);
  document.append(element("div", { attrs: { ...attrs }, text: "Text", css: { display: "none" } }));
  assert.equal(operation(request), null);
  document.children.pop();
  attrs["aria-disabled"] = "true";
  assert.equal(operation(request), null);
  delete attrs["aria-disabled"];
  const list = { ...request, operation: "fluid-block-list" };
  assert.equal(operation(list)?.pickerOpen, true);
  document.children.pop();
  const label = element("span", { attrs: { id: "picker-label" }, text: "Block-Auswahl" });
  const namedPortal = element("div", {
    attrs: { role: "region", "aria-labelledby": "picker-label" }, rect: box(20, 250, 310, 480),
  }, [label, choice]);
  document.append(namedPortal);
  assert.equal(operation(list)?.pickerOpen, true);
  assert.equal(operation(request)?.point.x, 110);
  const otherPicker = element("section", { attrs: { "aria-label": "Block-Auswahl" }, rect: box(370, 250, 310, 480) });
  document.append(otherPicker);
  assert.equal(operation(list), null, "Zwei sichtbare Auswahlen sind nicht eindeutig");
  document.children.pop();
  document.children.pop();
  const nativeRegion = element("section", {
    attrs: { "aria-label": "Block-Auswahl" }, rect: box(20, 250, 310, 480),
  }, [choice]);
  document.append(nativeRegion);
  assert.equal(operation(list)?.pickerOpen, true);
  assert.equal(operation(request)?.point.x, 110);
  document.children.pop();
  document.append(choice);
  assert.equal(operation(list)?.pickerOpen, false, "Ein alleinstehender Eintrag öffnet keine Auswahl");
  assert.equal(operation(request), null);
  document.children.pop();
  document.append(nativeRegion);
  document.append(element("div", { rect: box(40, 360, 140, 44) }));
  assert.equal(operation(request), null);
});

test("Fluid-Engine-Blockauswahl bestätigt den Code-Eintrag erst nach dem Scrollen in den sichtbaren Bereich", () => {
  const { document, element, box, operation } = cmsDomFixture({ innerWidth: 1264, innerHeight: 780 });
  const pageId = "6af4934c305b39408cc75520", sectionId = "e".repeat(24);
  document.body = { id: `collection-${pageId}` };
  document.URL = pageUrl;
  document.documentElement = { clientWidth: 1249, clientHeight: 780 };
  const grid = element("div", { attrs: { class: "fluid-engine" }, css: { display: "grid" }, rect: box(300, 200, 900, 500) });
  const section = element("section", { attrs: { "data-section-id": sectionId, "data-sqsp-section": "fluid-engine" } }, [grid]);
  const code = element("div", { attrs: { id: "block-selector-button-website.components.code", role: "button" },
    text: "Code", rect: box(38, 966, 138.5, 44) });
  const picker = element("section", { attrs: { "aria-label": "Block-Auswahl" }, rect: box(20, 200, 310, 480) }, [code]);
  document.append(element("main", {}, [element("article", {}, [section])]), picker);
  const request = { operation: "fluid-block-choice", pageUrl, pageId, sectionId, kind: "code" };
  let scrolls = 0, canReveal = false;
  code.scrollIntoView = () => {
    scrolls++;
    if (canReveal) code.rect = box(38, 618, 138.5, 44);
  };
  assert.equal(operation(request), null);
  assert.equal(scrolls, 1);
  canReveal = true;
  const target = { point: { x: 107, y: 640 }, viewport: { width: 1264, height: 780 } };
  assert.deepEqual(JSON.parse(JSON.stringify(operation(request))), target);
  assert.deepEqual(JSON.parse(JSON.stringify(operation(request))), target);
  assert.equal(scrolls, 2);
});

test("Klassischer Blockeinfügepunkt bindet Plus, Abschnitt und Seite auch neben anderen Einfügepunkten", () => {
  const dom = cmsDomFixture(), { document, element, box, operation } = dom;
  const pageId = "6ae89f789cf13b0c388e4ccf", sectionId = "6ae8a8ce46aa540e7bd07797";
  const blockId = "block-6ae8a8cfa287dc5274ba96ff", pageUrl = "https://www.fnwildlifetravel.de/arten-explorer-funktionsprufung-2026-11-02";
  document.body = { id: `collection-${pageId}` };
  document.URL = pageUrl;
  const trigger = element("button", { attrs: { "data-test": "insert-point-trigger" }, rect: box(590, 391, 24, 18),
    css: { opacity: "0", pointerEvents: "none" } });
  const bottomAnchor = () => element("div", { attrs: { class: "sqs-layout-insert-point-type-block sqs-layout-insert-point-position-bottom" },
    rect: box(20, 400, 1000, 0) });
  const anchor = bottomAnchor();
  anchor.append(element("span", { attrs: { class: "sqs-layout-insert-point-line" }, rect: box(20, 399.4, 1000, 1) }));
  anchor.append(trigger);
  const topAnchor = element("div", { attrs: { class: "sqs-layout-insert-point-type-block sqs-layout-insert-point-position-top" },
    rect: box(20, 100, 1000, 0) }, [element("button", { attrs: { "data-test": "insert-point-trigger" }, rect: box(590, 91, 24, 18) })]);
  const container = element("div", { attrs: { class: "sqs-layout-insert-point-container" }, rect: box(20, 400, 1000, 0) }, [topAnchor, anchor]);
  const block = element("div", { attrs: { id: blockId }, rect: box(20, 100, 1000, 300) }, [container]);
  const section = element("section", { attrs: { "data-section-id": sectionId, "data-sqsp-section": "classic-editor" }, rect: box(20, 80, 1000, 450) }, [block]);
  const regions = element("main", { attrs: { id: "page-regions" }, rect: box(0, 0, 1400, 1000) }, [section]);
  document.append(regions);
  const hit = document.elementFromPoint;
  document.elementFromPoint = (x, y) => hit(x, y) === trigger && trigger.css.pointerEvents === "none" ? block : hit(x, y);
  const payload = { operation: "classic-insert-hover", pageId, pageUrl, blockId };
  const clickPayload = { ...payload, operation: "classic-insert-trigger" };
  assert.deepEqual(JSON.parse(JSON.stringify(operation(payload)?.points)), [{ x: 32, y: 400 }, { x: 32, y: 398 }, { x: 32, y: 402 }]);
  assert.equal(operation(payload)?.sectionId, sectionId);
  assert.equal(operation(clickPayload), null);
  trigger.css.opacity = "1";
  trigger.css.pointerEvents = "auto";
  assert.equal(operation(clickPayload)?.point.y, 400);
  assert.equal(operation({ ...clickPayload, pageUrl: pageUrl + "-andere" }), null);
  document.append(element("div", { rect: box(590, 391, 24, 18) }));
  assert.equal(operation(clickPayload), null, "Überlagerte Schaltfläche bleibt unbedienbar");
  document.children.pop();
  container.append(bottomAnchor());
  assert.equal(operation(payload), null, "Zwei Einfügepunkte unter dem Block bleiben unbedienbar");
});

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

test("Die Vorschaudiagnose prüft nur das Dokument des sichtbaren benannten Seitenrahmens", () => {
  const dom = cmsDomFixture();
  const toolbar = dom.element("nav", { attrs: { "aria-label": "Website-Vorschau und Bearbeitungstools" } },
    [dom.element("button", { text: "Bearbeiten" })]);
  const iframe = dom.element("iframe", { attrs: { id: "sqs-site-frame", src: pageUrl } });
  const helper = dom.element("iframe");
  helper.contentWindow = { location: { href: "about:blank" } };
  dom.document.append(toolbar, iframe, helper);
  const observe = () => dom.operation({ operation: "preview-state" }).iframeDocumentBlank;
  assert.equal(observe(), undefined);
  iframe.contentWindow = { location: { href: pageUrl } };
  assert.equal(observe(), false);
  iframe.contentWindow.location.href = "about:blank";
  assert.equal(observe(), true);
  Object.defineProperty(iframe.contentWindow, "location", { get() { throw new Error("Cross-origin document"); } });
  assert.equal(observe(), undefined);
});

test("Codeprüfung erkennt den Seiteneditor bei genau einem eigenen Bearbeiten-Knopf des Blocks", () => {
  const dom = cmsDomFixture();
  const save = dom.element("button", { text: "Speichern" });
  const toolbar = dom.element("nav", { attrs: { "aria-label": "Website-Vorschau und Bearbeitungstools" } },
    [save, dom.element("button", { text: "Beenden" })]);
  const blockEdit = dom.element("button", { attrs: { "aria-label": "Bearbeiten" }, rect: dom.box(300, 300, 34, 34) });
  dom.document.append(toolbar, dom.element("iframe", { attrs: { id: "sqs-site-frame", src: pageUrl } }), blockEdit);
  const regular = { operation: "preview-state" };
  const code = { ...regular, allowBlockEdit: true };
  assert.equal(dom.operation(regular).mode, "unknown");
  assert.equal(dom.operation(code).mode, "editing");
  assert.equal(dom.operation(code).saveDisabled, false);
  assert.equal(dom.operation({ operation: "code-block-edit", pageUrl })?.point.x, 317);
  dom.document.append(dom.element("button", { attrs: { "aria-label": "Bearbeiten" } }));
  assert.equal(dom.operation(code).mode, "unknown");
  assert.equal(dom.operation({ operation: "code-block-edit", pageUrl }), null);
  dom.document.children.pop();
  delete blockEdit.attrs["aria-label"];
  blockEdit.innerText = "Bearbeiten";
  assert.equal(dom.operation(code).mode, "unknown");
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

test("Dyrholaey: rohe doppelte Leerzeichen bleiben exakt am beobachteten Alttext gebunden", () => {
  const raw = "...  um hier ihre Nester zu bauen ...", caption = "... um hier ihre Nester zu bauen ...";
  const target = { ...image, expectedAlt: raw, expectedCaption: caption, text: caption };
  assert.equal(assessSquarespaceGalleryField(target, { ...observed, description: raw }).status, "ready");
  assert.equal(assessSquarespaceGalleryField(target, { ...observed, description: raw, plainText: false }).status, "unsupported");
  for (const description of ["...   um hier ihre Nester zu bauen ...", "...\tum hier ihre Nester zu bauen ...",
    "...\u00a0um hier ihre Nester zu bauen ...", "...  um dort ihre Nester zu bauen ..."]) {
    assert.equal(assessSquarespaceGalleryField(target, { ...observed, description }).status, "conflict", description);
  }
  assert.equal(assessSquarespaceGalleryField({ ...target, expectedAlt: undefined }, { ...observed, description: raw }).status, "conflict");
  assert.equal(assessSquarespaceGalleryField({ ...target, expectedCaption: "Fremde Bildunterschrift" }, { ...observed, description: raw }).status, "conflict");
});

test("Dyrholaey: gebundener CMS-Leerraum wird übertragen, eine weitere CMS-Änderung stoppt vor Eingabe", async () => {
  const raw = "...  um hier ihre Nester zu bauen ...", caption = "... um hier ihre Nester zu bauen ...";
  const target = { ...image, expectedAlt: raw, expectedCaption: caption, text: caption };
  const fixture = browserFixture({ description: raw }), result = await createSquarespaceGalleryDriver().transfer(fixture.webContents,
    { pageUrl, images: [target] }, { assertCurrent: async () => {} });
  assert.equal(result.results[0].status, "written");
  assert.deepEqual(fixture.inputs.filter((value) => typeof value === "string"), [caption]);
  const changed = browserFixture({ description: raw });
  let checks = 0;
  const stopped = await createSquarespaceGalleryDriver().transfer(changed.webContents, { pageUrl, images: [target] },
    { assertCurrent: async () => { if (++checks === 2) await changed.webContents.insertText("...   um hier ihre Nester zu bauen ..."); } });
  assert.equal(stopped.results[0].status, "failed");
  assert.deepEqual(changed.inputs.filter((value) => typeof value === "string"), ["...   um hier ihre Nester zu bauen ..."]);
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
