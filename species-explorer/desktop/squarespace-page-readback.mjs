import { isDeepStrictEqual } from "node:util";
import { cmsTextStepElements, createCmsContentSteps } from "../page-authoring/cms-content-steps.mjs";
import { validateCmsReadbackExpectation } from "../page-authoring/cms-readback.mjs";
import { sha256 } from "../page-authoring/contract.mjs";
import { FN_MAP_CODE, FN_SPECIES_CODE } from "../page-authoring/templates.mjs";

const collectionId = /^[a-f0-9]{24}$/;
const blockId = /^block-(?:[a-f0-9]{20}|[a-f0-9]{24}|yui_3_17_2_1_[0-9]{13}_[0-9]{1,12})$/;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const figureId = /^fn-figure-[a-f0-9]{24}$/;
const verifiedCode = { species: FN_SPECIES_CODE, map: FN_MAP_CODE };

function confirm(condition) {
  if (!condition) throw Object.assign(new Error("Die gespeicherte Squarespace-Fassung konnte nicht als vollständige Rücklesung bestätigt werden."),
    { code: "SQUARESPACE_PAGE_READBACK_UNCONFIRMED", statusCode: 409 });
}

function mapGallery(planned, gallery, mediaBindings) {
  confirm(Array.isArray(mediaBindings) && mediaBindings.length === planned.length);
  if (!planned.length) {
    confirm(gallery?.status === "no-gallery-planned" && gallery.blockId === undefined && gallery.items === undefined);
    return { items: [], bindings: [] };
  }
  confirm(gallery?.status === "rendered-figures-confirmed" && Array.isArray(gallery.items) && gallery.items.length === planned.length);
  const usedItems = new Set(), assetBytes = new Map(), bindings = [];
  const items = planned.map((image, index) => {
    const observed = gallery.items[index], binding = mediaBindings[index];
    confirm(observed && binding && observed.position === index + 1 && typeof observed.alt === "string"
      && (observed.caption === null || typeof observed.caption === "string")
      && (observed.attribution === null || typeof observed.attribution === "string"));
    const { cmsAssetId, cmsItemId } = observed;
    confirm(typeof cmsAssetId === "string" && uuid.test(cmsAssetId) && typeof cmsItemId === "string" && figureId.test(cmsItemId)
      && !usedItems.has(cmsItemId) && cmsAssetId === binding.cmsAssetId && cmsItemId === binding.cmsItemId
      && binding.usageId === image.id && observed.usageId === image.id
      && binding.assetId === image.assetId && binding.sha256 === image.sha256 && binding.bytes === image.bytes && binding.mimeType === image.mimeType);
    const { usageId, assetId, sha256, bytes, mimeType } = binding;
    const physical = { sha256, bytes, mimeType };
    confirm(!assetBytes.has(cmsAssetId) || isDeepStrictEqual(assetBytes.get(cmsAssetId), physical));
    usedItems.add(cmsItemId);
    assetBytes.set(cmsAssetId, physical);
    bindings.push({ usageId, assetId, sha256, bytes, mimeType, cmsAssetId, cmsItemId });
    return { alt: observed.alt, caption: observed.caption ?? "", attribution: observed.attribution ?? "",
      decorative: observed.alt === "", cmsItemId, cmsAssetId };
  });
  return { items, bindings };
}

/** Map the trusted, freshly reopened desktop observation to the journal's exact readback shape. */
export function createSquarespacePageReadback(plan, saved) {
  const expected = validateCmsReadbackExpectation(plan?.readback?.expectation);
  const contentSteps = createCmsContentSteps(plan);
  const plannedGallery = plan.structure.slots.find(slot => slot.type === "gallery");
  const steps = contentSteps.filter(step => step.kind !== "gallery" || plannedGallery.items.length > 0);
  confirm(saved && typeof saved.pageId === "string" && collectionId.test(saved.pageId) && saved.path === expected.path
    && typeof saved.observationId === "string" && uuid.test(saved.observationId) && saved.savedTextConfirmed === true
    && saved.reopened === true && saved.disabledConfirmed === true);
  const { pageId, path, observationId, settings, contentOrder, textBlocks, codeBlocks, gallery, mediaBindings } = saved;
  confirm(settings?.title === expected.title && settings.navigationTitle === expected.title && `/${settings.slug}` === path
    && settings.enabled === false && settings.saveAvailable === false
    && Array.isArray(contentOrder) && contentOrder.length === steps.length && Array.isArray(textBlocks) && Array.isArray(codeBlocks));
  const { items, bindings } = mapGallery(plannedGallery.items, gallery, mediaBindings);

  const ids = new Set(), atoms = [];
  let textIndex = 0, codeIndex = 0;
  for (const [index, step] of steps.entries()) {
    const placement = contentOrder[index];
    confirm(placement?.kind === step.kind && typeof placement.id === "string" && blockId.test(placement.id) && !ids.has(placement.id));
    ids.add(placement.id);
    if (step.kind === "text") {
      const observed = textBlocks[textIndex++];
      const expectedElements = cmsTextStepElements(step, { targetPath: path, planHash: plan.planHash });
      confirm(observed?.cmsBlockId === placement.id && Array.isArray(observed.blocks) && isDeepStrictEqual(observed.blocks, expectedElements));
      atoms.push(...observed.blocks);
    } else if (step.kind === "gallery") {
      confirm(gallery.blockId === placement.id);
      atoms.push({ type: "gallery", items });
    } else {
      const observed = codeBlocks[codeIndex++];
      // readPageCode only emits this record after exact source confirmation in the same CMS block.
      confirm(observed?.kind === step.kind && observed.cmsBlockId === placement.id && Object.hasOwn(verifiedCode, observed.kind));
      if (step.mapElements) {
        confirm(observed.sourceHash === sha256(step.code) && isDeepStrictEqual(placement.mapElements, step.mapElements));
        atoms.push(...placement.mapElements);
      }
      atoms.push({ type: "code", code: verifiedCode[observed.kind] });
    }
  }
  confirm(textIndex === textBlocks.length && codeIndex === codeBlocks.length);

  let next = 0;
  const blocks = expected.blocks.map(slot => {
    if (slot.type === "gallery" && !items.length) return { type: "gallery", items };
    if (slot.type === "richtext") {
      const end = next + slot.blocks.length, richtext = { type: "richtext", blocks: atoms.slice(next, end) };
      next = end;
      return richtext;
    }
    const observed = atoms[next++];
    if (slot.type !== "source") return observed;
    confirm(observed?.type === "paragraph");
    return { type: "source", text: observed.text };
  });
  const visible = blocks.map(block => block?.type === "gallery"
    ? { type: "gallery", items: block.items.map(({ alt, caption, decorative, attribution }) => ({ alt, caption, decorative, attribution })) }
    : block);
  confirm(next === atoms.length && isDeepStrictEqual(visible, expected.blocks));
  return { readback: { schemaVersion: 1, observationId,
    page: { id: pageId, path, title: settings.title, enabled: settings.enabled, saved: true, reopened: saved.reopened },
    blocks: structuredClone(blocks) }, mediaBindings: bindings };
}
