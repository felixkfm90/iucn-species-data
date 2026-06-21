import { createHash } from "node:crypto";

export const PORTRAIT_STANDARD = Object.freeze({
  promptVersion: "1.0.0",
  size: "1280x1600",
  outputFormat: "webp",
  source: "Extern in ChatGPT erzeugt und manuell geprüft",
});

export function buildPortraitPrompt({
  germanName,
  scientificName,
  additionalInstructions = "",
}) {
  const optionalInstructions = String(additionalInstructions ?? "").trim();
  return `Create one scientifically accurate natural-history illustration of the following animal species.

German common name: ${String(germanName ?? "").trim()}
Scientific name: ${String(scientificName ?? "").trim()}

STYLE STANDARD
- Traditional natural-history plate rendered as detailed watercolor with fine colored-pencil linework.
- Realistic and scientifically informative, while remaining visibly hand-painted rather than photographic.
- Warm ivory watercolor-paper background with a very subtle natural paper texture.
- Softly fading watercolor edges around the minimal supporting element.
- Neutral, even lighting without dramatic shadows.
- Use natural, restrained colors. Avoid artificial saturation, glossy digital effects, cartoon styling, and photorealism.

SPECIES ACCURACY
- Depict exactly one recognizable adult specimen typical of ${String(scientificName ?? "").trim()}.
- Accurately reproduce species-specific anatomy, proportions, coloration, plumage, fur, scales, beak, eyes, ears, limbs, feet, claws, fins, tail, and diagnostic markings.
- Do not invent, combine, exaggerate, omit, duplicate, or deform anatomical features.
- Do not introduce characteristics from similar or related species.
- If the sexes differ substantially, depict the visually most characteristic adult form unless the additional instructions specify otherwise.

COMPOSITION
- Vertical 4:5 composition.
- Show the complete animal whenever anatomically possible.
- Keep every important body part fully inside the image.
- The animal should occupy approximately 65 to 75 percent of the canvas.
- Leave generous safe margins around the beak, ears, wings, feet, fins, and tail.
- Position the animal naturally for its body shape. Long-bodied animals may be arranged slightly diagonally.
- Leave slightly more open space in the direction the animal is facing.
- Use only one minimal species-appropriate support such as a branch, rock, sand, subtle ground, or a pale watercolor suggestion of water.
- Do not force an unnatural perch or pose.

EXCLUSIONS
- No second animal, prey, decorative plants, detailed landscape, scenery, border, frame, text, caption, scientific label, signature, logo, or watermark.
- No cropped limbs, tail, wings, beak, fins, or feet.
- No fantasy elements.

FINAL CHECK
- Before finishing, verify the number and shape of all visible limbs, toes, claws, wings, fins, teeth, ears, eyes, and tail structures.
- Verify that the diagnostic markings belong specifically to ${String(scientificName ?? "").trim()}.

OUTPUT
- Use a vertical 4:5 canvas.
- Create the highest available image quality.
- Keep the warm ivory paper background opaque.
- Do not add text, labels, logos, signatures, borders, or watermarks.
${optionalInstructions ? `
ADDITIONAL SPECIES INSTRUCTIONS
${optionalInstructions}
` : ""}`.trim();
}

export function portraitPromptSha256(prompt) {
  return createHash("sha256").update(String(prompt ?? "")).digest("hex");
}
