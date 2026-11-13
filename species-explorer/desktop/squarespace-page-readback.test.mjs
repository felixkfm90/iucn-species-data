import assert from "node:assert/strict";
import test from "node:test";
import { cmsTextStepElements, createCmsContentSteps } from "../page-authoring/cms-content-steps.mjs";
import { createCmsReadbackExpectation, verifyCmsReadbackProof } from "../page-authoring/cms-readback.mjs";
import { composePage } from "../page-authoring/compose.mjs";
import { sha256 } from "../page-authoring/contract.mjs";
import { initialDocument, normalizeSpeciesSnapshot } from "../page-authoring/model.mjs";
import { createSquarespacePageReadback } from "./squarespace-page-readback.mjs";

const PLAN_HASH = "a".repeat(64);
const ASSET_ID = "96379ea8-ec7f-45b3-bbbe-0b1f70c6357e";
const OBSERVATION_ID = "fb85b1de-a3e3-4083-8144-4b26c2dc652e";
const PAGE_ID = "6ae89f789cf13b0c388e4ccf";
const invalid = { code: "SQUARESPACE_PAGE_READBACK_UNCONFIRMED", statusCode: 409 };

function fixture({ images = true, longIntroduction = false } = {}) {
  const species = normalizeSpeciesSnapshot({ slug: "pruefart", commonName: "Prüfart", scientificName: "Testus figura", taxonomy: [], general: [],
    status: "", revision: "species-a", dataSha256: "a".repeat(64), runtimeReady: false,
    normalAssets: { portrait: null, map: null, sound: null, credits: null, spectrogram: null },
  }, "project-cms", "pruefart");
  const document = initialDocument({ templateId: "fn-compact-20261031", species, parentPath: "/wildlife/heimische-tierwelt", title: "Prüfart am  Fluss" });
  document.introduction = [
    { type: "paragraph", text: "Einleitung mit  zwei Leerzeichen\nZweite Zeile" }, { type: "heading", level: 5, text: "Gliederung" },
    ...(longIntroduction ? Array.from({ length: 298 }, (_, index) => ({ type: "paragraph", text: `Einleitung ${index + 3}` })) : []),
  ];
  const editorial = document.sections.find(section => section.kind === "editorial");
  editorial.blocks = [{ type: "paragraph", text: "Text vor der Liste" }, { type: "bullet-list", items: ["Erster Punkt", "Zweiter Punkt"] }];
  editorial.sources = [{ id: "interne-fachquelle", label: "Fachquelle", url: "https://example.org/art" }];
  document.sources = [{ id: "interne-abschlussquelle", label: "Abschlussquelle" }];
  if (images) {
    document.galleryRequested = true;
    const asset = { id: "lokales-original", projectId: "project-cms", sha256: "c".repeat(64), bytes: 120, mimeType: "image/png", attribution: "Foto FN" };
    document.images = [1, 2].map(number => ({ id: `bildverwendung-${number}`, assetId: asset.id,
      alt: "", decorative: true, caption: "Am Fluss", asset: { ...asset } }));
  }
  const { structure } = composePage({ id: "pruefentwurf", revision: PLAN_HASH, document }, new Map());
  const expectation = createCmsReadbackExpectation(document, structure);
  const plan = { schemaVersion: 2, publish: false, planHash: PLAN_HASH, target: { path: structure.path }, structure,
    readback: { schemaVersion: 1, expectation } };
  const contentOrder = [], textBlocks = [], codeBlocks = [];
  for (const [index, step] of createCmsContentSteps(plan).entries()) {
    if (!images && step.kind === "gallery") continue;
    const id = `block-${String(index + 1).padStart(24, "0")}`;
    contentOrder.push({ kind: step.kind, id, ...(step.mapElements && { mapElements: structuredClone(step.mapElements) }) });
    if (step.kind === "text") textBlocks.push({ cmsBlockId: id, blocks: cmsTextStepElements(step, { targetPath: structure.path, planHash: PLAN_HASH }) });
    if (["species", "map"].includes(step.kind)) codeBlocks.push({ cmsBlockId: id, kind: step.kind,
      ...(step.mapElements && { sourceHash: sha256(step.code) }) });
  }
  const mediaBindings = structure.slots.find(slot => slot.type === "gallery").items.map((image, index) => ({
    usageId: image.id, assetId: image.assetId, sha256: image.sha256, bytes: image.bytes, mimeType: image.mimeType,
    cmsAssetId: ASSET_ID, cmsItemId: `fn-figure-${String(index + 1).padStart(24, "0")}`,
  }));
  const gallery = images ? { status: "rendered-figures-confirmed", blockId: contentOrder.find(block => block.kind === "gallery").id,
    items: mediaBindings.map(({ usageId, cmsAssetId, cmsItemId }, index) => ({ usageId, cmsAssetId, cmsItemId, position: index + 1,
      alt: "", caption: "Am Fluss", attribution: "Foto FN" })),
  } : { status: "no-gallery-planned" };
  const saved = { observationId: OBSERVATION_ID, pageId: PAGE_ID, path: structure.path, savedTextConfirmed: true, reopened: true, disabledConfirmed: true,
    settings: { title: structure.title, navigationTitle: structure.title, slug: structure.path.slice(1), enabled: false, saveAvailable: false },
    contentOrder, textBlocks, codeBlocks, gallery, mediaBindings };
  return { document, plan, saved, expectation };
}

function verify(f, proof) {
  const result = verifyCmsReadbackProof({ document: f.document, structure: f.plan.structure, expected: f.expectation,
    observation: proof.readback, mediaBindings: proof.mediaBindings });
  assert.match(result.observationHash, /^[a-f0-9]{64}$/);
  assert.match(result.mediaBindingsHash, /^[a-f0-9]{64}$/);
}

test("Die Quittung gruppiert beobachtete Textblöcke und Quellen neu und bindet zwei Verwendungen derselben Datei", () => {
  const f = fixture({ longIntroduction: true });
  assert.deepEqual(f.saved.contentOrder.slice(0, 3).map(block => block.kind), ["text", "text", "species"]);
  assert.equal(f.saved.textBlocks[0].blocks.length, 300);
  const snapshot = structuredClone(f.saved);
  const proof = createSquarespacePageReadback(f.plan, f.saved);
  assert.deepEqual(f.saved, snapshot);
  assert.deepEqual(Object.keys(proof), ["readback", "mediaBindings"]);
  assert.deepEqual(proof.readback.page, { id: PAGE_ID, path: f.plan.target.path, title: "Prüfart am  Fluss", enabled: false, saved: true, reopened: true });
  assert.deepEqual(proof.readback.blocks[1], f.expectation.blocks[1]);
  assert.deepEqual(proof.readback.blocks.filter(block => block.type === "source"), [
    { type: "source", text: "Fachquelle · https://example.org/art" }, { type: "source", text: "Abschlussquelle" },
  ]);
  const gallery = proof.readback.blocks.find(block => block.type === "gallery");
  assert.deepEqual(gallery.items.map(item => item.cmsItemId), f.saved.gallery.items.map(item => item.cmsItemId));
  assert.deepEqual(gallery.items.map(item => item.cmsAssetId), [ASSET_ID, ASSET_ID]);
  assert.ok(gallery.items.every(item => item.decorative));
  assert.deepEqual(proof.mediaBindings, f.saved.mediaBindings);
  verify(f, proof);
  proof.readback.blocks[1].blocks[0].text = "Nicht mehr dieselbe Fassung";
  assert.deepEqual(f.saved, snapshot);
});

test("Abweichende Seiteneinstellungen, Textdaten, Reihenfolge oder CMS-Blockkennungen verweigern die Quittung", () => {
  for (const mutate of [
    saved => { saved.settings.title = "Andere Art"; },
    saved => { saved.settings.navigationTitle = "Andere Art"; },
    saved => { saved.settings.slug += "-2"; },
    saved => { saved.settings.enabled = true; },
    saved => { saved.settings.saveAvailable = true; },
    saved => { saved.reopened = false; },
    saved => { saved.observationId = "aus-der-vorschau"; },
    saved => { saved.textBlocks[0].blocks[0].text = "Prüfart am Fluss"; },
    saved => { saved.textBlocks[0].blocks.push({ type: "paragraph", text: "Extra" }); },
    saved => { saved.textBlocks[0].blocks.pop(); },
    saved => { saved.textBlocks[0].cmsBlockId = saved.textBlocks[1].cmsBlockId; },
    saved => { saved.codeBlocks[0].kind = "map"; },
    saved => { saved.codeBlocks.find(block => block.kind === "map").sourceHash = "a".repeat(64); },
    saved => { saved.contentOrder.find(block => block.kind === "map").mapElements[0].text = "Andere Kartenüberschrift"; },
    saved => { saved.codeBlocks[0].cmsBlockId = saved.codeBlocks[1].cmsBlockId; },
    saved => { saved.codeBlocks.pop(); },
    saved => { saved.contentOrder[1].id = saved.contentOrder[0].id; },
    saved => { [saved.contentOrder[0], saved.contentOrder[1]] = [saved.contentOrder[1], saved.contentOrder[0]]; },
  ]) {
    const { plan, saved } = fixture();
    mutate(saved);
    assert.throws(() => createSquarespacePageReadback(plan, saved), invalid);
  }
});

test("Veränderte Galerie, vertauschte Kennungen und unpassende Upload-Bindungen werden erkannt", () => {
  for (const mutate of [
    saved => { saved.gallery.items[0].caption = "Andere Bildunterschrift"; },
    saved => { saved.gallery.items[0].attribution = null; },
    saved => { saved.gallery.items[0].alt = "Andere Beschreibung"; },
    saved => { saved.gallery.items[0].position = 2; },
    saved => { saved.gallery.items[0].cmsAssetId = "fb85b1de-a3e3-4083-8144-4b26c2dc652e"; },
    saved => { [saved.gallery.items[0].cmsItemId, saved.gallery.items[1].cmsItemId] = [saved.gallery.items[1].cmsItemId, saved.gallery.items[0].cmsItemId]; },
    saved => { saved.mediaBindings[1].cmsItemId = saved.gallery.items[1].cmsItemId = saved.gallery.items[0].cmsItemId; },
    saved => { saved.mediaBindings[0].bytes += 1; },
    saved => { saved.gallery.blockId = saved.contentOrder[0].id; },
  ]) {
    const { plan, saved } = fixture();
    mutate(saved);
    assert.throws(() => createSquarespacePageReadback(plan, saved), invalid);
  }
});

test("Ein nachweislich nicht vorhandener Galerieblock ergibt den leeren Planslot und leere Medienbindungen", () => {
  const f = fixture({ images: false });
  const proof = createSquarespacePageReadback(f.plan, f.saved);
  assert.deepEqual(proof.readback.blocks.at(-2), { type: "gallery", items: [] });
  assert.deepEqual(proof.readback.blocks.at(-1), { type: "source", text: "Abschlussquelle" });
  assert.deepEqual(proof.mediaBindings, []);
  verify(f, proof);
  for (const mutate of [
    saved => { delete saved.gallery; },
    saved => { delete saved.mediaBindings; },
    saved => { saved.gallery.items = []; },
    saved => { saved.gallery.status = "rendered-figures-confirmed"; },
    saved => { saved.contentOrder.push({ kind: "gallery", id: "block-123456789012345678901234" }); },
  ]) {
    const saved = structuredClone(f.saved);
    mutate(saved);
    assert.throws(() => createSquarespacePageReadback(f.plan, saved), invalid);
  }
});
