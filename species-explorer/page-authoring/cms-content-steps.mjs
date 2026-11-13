import { validateCmsReadbackExpectation } from "./cms-readback.mjs";
import { check, escapeHtml } from "./contract.mjs";
import { FN_MAP_CODE, FN_SPECIES_CODE } from "./templates.mjs";

const sectionOrder = ["species", "map", "gallery"];
const maxTextElements = 300;
const textSteps = new WeakMap();
const escapeLines = value => escapeHtml(value).replaceAll("\n", "<br>");
export const CMS_MAP_SECTION_ATTRIBUTE = "data-fn-map-section";
export const CMS_MAP_SECTION_PREFIX = `<div ${CMS_MAP_SECTION_ATTRIBUTE}="1">\n`;
export const CMS_MAP_SECTION_SUFFIX = `\n${FN_MAP_CODE}\n</div>`;
const invalid = condition => check(condition, "cms_content_plan_mismatch",
  "Die freigegebene Seitenstruktur passt nicht zur gebundenen Squarespace-Eingabe.", 409);

function textElement(block) {
  if (block.type === "heading") return `<h${block.level}>${escapeLines(block.text)}</h${block.level}>`;
  if (block.type === "paragraph") return `<p>${escapeLines(block.text)}</p>`;
  const tag = block.type === "bullet-list" ? "ul" : "ol";
  return `<${tag}>${block.items.map(item => `<li>${escapeLines(item)}</li>`).join("")}</${tag}>`;
}

/** Build paste fragments from the sealed semantic expectation, never from stored preview HTML. */
export function createCmsContentSteps(plan) {
  invalid(plan.schemaVersion === 2 && plan.publish === false && plan.readback?.schemaVersion === 1);
  const expected = validateCmsReadbackExpectation(plan.readback.expectation);
  const slots = plan.structure.slots;
  const first = expected.blocks[0];
  invalid(expected.path === plan.target.path && expected.title === plan.structure.title?.replace(/\r\n?/g, "\n")
    && first?.type === "heading" && first.level === 3 && first.text === expected.title
    && Array.isArray(slots) && slots.length === expected.blocks.length);

  const steps = [];
  const mapStart = slots.findIndex(slot => slot?.type === "heading" && slot.sectionId === "map");
  const mapEnd = slots.findIndex(slot => slot?.type === "code" && slot.module === "existing-fn-map");
  const groupMap = mapStart >= 0 && mapEnd > mapStart;
  let mapElements;
  if (groupMap) {
    const heading = expected.blocks[mapStart], intro = expected.blocks[mapStart + 1];
    invalid(heading.type === "heading" && heading.level === 4 && (mapEnd === mapStart + 1
      || mapEnd === mapStart + 2 && slots[mapStart + 1].sectionId === "map" && intro.type === "richtext"));
    mapElements = Object.freeze([heading, ...(mapEnd === mapStart + 2 ? intro.blocks : [])].map(element =>
      Object.freeze(element.items ? { ...element, items: Object.freeze(element.items) } : element)));
  }
  let elements = [], section = 0;
  function flushText() {
    if (elements.length) {
      const step = Object.freeze({ kind: "text", html: elements.map(textElement).join("\n") });
      textSteps.set(step, { elements, path: expected.path, planHash: plan.planHash });
      steps.push(step);
    }
    elements = [];
  }

  for (const [slotIndex, block] of expected.blocks.entries()) {
    const slot = slots[slotIndex];
    invalid(slot?.type === block.type);
    if (groupMap && slotIndex >= mapStart && slotIndex < mapEnd) continue;
    if (block.type === "code" || block.type === "gallery") {
      flushText();
      const kind = sectionOrder[section];
      if (block.type === "gallery") {
        invalid(kind === "gallery" && Array.isArray(slot.items) && slot.items.length === block.items.length);
        invalid(slot.items.every((item, index) => {
          const expectedImage = block.items[index];
          return item?.decorative === expectedImage.decorative && ["alt", "caption", "attribution"].every(key =>
            typeof item[key] === "string" && item[key].replace(/\r\n?/g, "\n") === expectedImage[key]);
        }));
        steps.push(Object.freeze({ kind, slotIndex }));
      } else {
        const knownCode = kind === "species" ? FN_SPECIES_CODE : kind === "map" ? FN_MAP_CODE : null;
        invalid(knownCode !== null && block.code === knownCode && slot.code === knownCode);
        if (groupMap && slotIndex === mapEnd) {
          const code = CMS_MAP_SECTION_PREFIX + mapElements.map(textElement).join("\n") + CMS_MAP_SECTION_SUFFIX;
          invalid(kind === "map");
          steps.push(Object.freeze({ kind, slotIndex, code, mapElements }));
        } else steps.push(Object.freeze({ kind, slotIndex, code: knownCode }));
      }
      section++;
      continue;
    }
    const blocks = block.type === "richtext" ? block.blocks
      : block.type === "source" ? [{ type: "paragraph", text: block.text }] : [block];
    for (const item of blocks) {
      elements.push(item);
      if (elements.length === maxTextElements) flushText();
    }
  }
  flushText();
  invalid(section === sectionOrder.length);
  return Object.freeze(steps);
}

export function cmsTextStepElements(step, { targetPath, planHash }) {
  const prepared = textSteps.get(step);
  return prepared?.path === targetPath && prepared?.planHash === planHash ? structuredClone(prepared.elements) : null;
}
