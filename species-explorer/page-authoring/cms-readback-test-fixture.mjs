import { validateCmsReadbackExpectation } from "./cms-readback.mjs";
import { createCmsContentSteps } from "./cms-content-steps.mjs";

/** Synthetic complete observations for tests only; never evidence of a real CMS save. */
export function createCmsReadbackTestProof(plan, { pageId = "cms-page-a", observationId = "observation-a" } = {}) {
  if (plan?.payload?.schemaVersion !== 2 || plan.payload.readback?.schemaVersion !== 1) throw new Error("The test proof requires an actual version-2 plan.");
  const expected = validateCmsReadbackExpectation(plan.payload.readback.expectation);
  const gallery = plan.payload.structure.slots.filter(slot => slot.type === "gallery");
  if (gallery.length !== 1) throw new Error("The test proof requires one bound gallery slot.");
  const assets = new Map();
  const mediaBindings = gallery[0].items.map((image, index) => {
    const byteIdentity = JSON.stringify([image.sha256, image.bytes, image.mimeType]);
    if (!assets.has(byteIdentity)) assets.set(byteIdentity, `cms-asset-${assets.size + 1}`);
    return { usageId: image.id, assetId: image.assetId, sha256: image.sha256, bytes: image.bytes, mimeType: image.mimeType,
      cmsAssetId: assets.get(byteIdentity), cmsItemId: `cms-item-${index + 1}` };
  });
  const blocks = structuredClone(expected.blocks).map(block => {
    if (block.type !== "gallery") return block;
    if (block.items.length !== mediaBindings.length) throw new Error("The observed gallery must match every original usage.");
    return { ...block, items: block.items.map((item, index) => ({ ...item,
      cmsAssetId: mediaBindings[index].cmsAssetId, cmsItemId: mediaBindings[index].cmsItemId })) };
  });
  return { readback: { schemaVersion: 1, observationId,
    page: { id: pageId, path: expected.path, title: expected.title, enabled: false, saved: true, reopened: true }, blocks }, mediaBindings };
}

export function createCmsBoundSaveTestProof(payload, dispatch) {
  const pageId = "a".repeat(24), proof = createCmsReadbackTestProof({ payload }, { pageId });
  const gallery = proof.readback.blocks.find(block => block.type === "gallery");
  const assets = new Map();
  for (const [index, image] of proof.mediaBindings.entries()) {
    if (!assets.has(image.cmsAssetId)) assets.set(image.cmsAssetId, `12345678-1234-1234-1234-${(assets.size + 1).toString(16).padStart(12, "0")}`);
    const cmsIds = { cmsAssetId: assets.get(image.cmsAssetId), cmsItemId: `fn-figure-${(index + 1).toString(16).padStart(24, "0")}` };
    Object.assign(image, cmsIds);
    Object.assign(gallery.items[index], cmsIds);
  }
  const binding = { schemaVersion: 1, attemptId: dispatch.attemptId, dispatchId: dispatch.dispatchId, planHash: payload.planHash,
    pageId, path: payload.target.path, sectionId: "b".repeat(24), blockIds: createCmsContentSteps(payload)
      .filter(step => step.kind !== "gallery" || proof.mediaBindings.length > 0)
      .map((_, index) => `block-${index.toString(16).padStart(24, "0")}`), mediaBindings: proof.mediaBindings };
  return { binding, proof };
}
