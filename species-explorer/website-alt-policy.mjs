import { canonicalWebsiteImageSource, normalizeWebsitePageUrl } from "./website-alt-parser.mjs";

// A suggestion is never an approval and must not replace a saved human choice.
// Bind this default to the known FN asset, not every photograph in a header.
const FN_LOGO_SOURCE = "https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/c043db90-3a2c-478c-a2ff-3d7cdbf6c14d/FN+Wildlife+%26+Travel+Logo+glow.jpg";

function knownWebsiteLogo(image) {
  if (image?.kind !== "image") return false;
  try { return canonicalWebsiteImageSource(image.src) === FN_LOGO_SOURCE; }
  catch { return false; }
}

export function isWebsiteAltHeaderLogo(image) {
  return image?.context === "header" && knownWebsiteLogo(image);
}

export function suggestedWebsiteAltDecorative(image) {
  if (image?.context === "content" && image.kind === "background") return true;
  return image?.context === "footer" && knownWebsiteLogo(image);
}

// These standards describe an already correct public observation; they never
// authorize changing a CMS field or accepting a different observed wording.
export function observedWebsiteAltStandard(image) {
  if (!image || image.altVariants?.length !== 1 || image.altVariants[0] !== image.alt
      || !Array.isArray(image.captionVariants) || image.captionVariants.some((value) => value.trim())) return null;
  if (isWebsiteAltHeaderLogo(image) && image.altPresent
      && ["FN Wildlife & Travel", "FN Wildlife &amp; Travel"].includes(image.alt)) {
    return { rule: "fn-header-link-v1", text: image.alt, decorative: false };
  }
  if (image.alt !== "") return null;
  if (image.context === "footer" && knownWebsiteLogo(image) && image.altPresent) {
    return { rule: "fn-footer-decorative-v1", text: "", decorative: true };
  }
  if (image.context === "content" && image.kind === "background") {
    return { rule: "content-background-decorative-v1", text: "", decorative: true };
  }
  return null;
}

export function coupledWebsiteAltCaption(pageUrl, image) {
  if (image?.context !== "content" || image.kind !== "image") return false;
  try {
    const pathname = new URL(normalizeWebsitePageUrl(pageUrl)).pathname;
    return /^\/reisen\/\d{4}-[^/]+\/.+/.test(pathname);
  } catch { return false; }
}

// Public gallery captions are HTML text; unlike the raw alt attribute, their
// ASCII HTML whitespace is collapsed by the parser. This compares that display
// only. Callers must still bind the raw alt/CMS text, image and approval exactly.
export function websiteAltCaptionMatchesText(caption, text) {
  return typeof caption === "string" && typeof text === "string"
    && (caption === text || caption === text.replace(/[\t\n\f\r ]+/gu, " ").replace(/^ | $/gu, ""));
}

// Observed FN/Squarespace travel-detail galleries derive their public alt from
// the coupled caption with a 250 UTF-16-unit limit. This is not a general HTML
// alt limit, and this policy never truncates saved captions or human wording.
export function websiteAltTextConstraint(pageUrl, image) {
  return coupledWebsiteAltCaption(pageUrl, image)
    ? { maxLength: 250, reason: "coupled-gallery-public-alt-limit" }
    : null;
}

export function websiteAltTextLengthProblem(pageUrl, image, text) {
  if (typeof text !== "string") throw new TypeError("Ein Alternativtext muss Text sein.");
  const constraint = websiteAltTextConstraint(pageUrl, image);
  if (!constraint || text.length <= constraint.maxLength) return null;
  const length = text.length, excess = length - constraint.maxLength;
  return { maxLength: constraint.maxLength, length, excess,
    message: `Für diese gekoppelte Reisegalerie sind höchstens ${constraint.maxLength} Zeichen vorgesehen. Der Text hat ${length} Zeichen (${excess} zu viel). Die sichtbare Bildunterschrift ist zugleich der Alternativtext. Bitte den Text vor der Übernahme entsprechend kürzen.` };
}

// Apply only while preparing a new automatic proposal. Saved human wording and
// quoted punctuation are deliberately outside this conservative sentence rule.
export function normalizeWebsiteAltProposalText(pageUrl, image, text) {
  if (typeof text !== "string") throw new TypeError("Ein Textvorschlag muss Text sein.");
  if (image?.context !== "content" || image.kind !== "image" || text.length > 500 || /[\r\n]/u.test(text)) return text;
  try {
    const pathname = new URL(normalizeWebsitePageUrl(pageUrl)).pathname;
    if (!/^\/reisen\/\d{4}-[^/]+(?:\/.+)?$/.test(pathname)) return text;
  } catch { return text; }
  const whitespace = text.match(/[ \t]*$/u)[0];
  const sentence = text.slice(0, text.length - whitespace.length);
  if (!sentence.endsWith(".")) return text;
  const body = sentence.slice(0, -1);
  if (!body || /[\s.!?…]$/u.test(body) || /\p{N}$/u.test(body)
      || /(?:^|[^\p{L}\p{N}])\p{L}$/u.test(body) || /(?:^|\s)[IVXLCDM]+$/u.test(body)
      || /(?:^|[^\p{L}])(?:usw|etc|bzw|ca|vgl|nr|dr|prof|abb|jh|jhd|jhdt|chr|str|st|mt|dgl|sog|evtl|ggf|inkl|bspw)$/iu.test(body)) return text;
  return body + whitespace;
}
