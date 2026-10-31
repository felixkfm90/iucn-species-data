import { canonicalWebsiteImageSource } from "../website-alt-parser.mjs";

const rejected = (status, error) => ({ status, error });

export function assessSquarespaceImageBlockField(image, observed) {
  if (image?.context !== "content" || image.kind !== "image" || image.textCoupled !== false) {
    return rejected("unsupported", "Diese Bildverwendung ist kein unterstützter normaler Bildblock.");
  }
  if (typeof image.text !== "string" || image.text.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(image.text)
      || typeof image.decorative !== "boolean" || !image.text.trim() && !image.decorative || image.decorative && image.text !== "") {
    return rejected("unsupported", "Die Textfreigabe ist ungültig oder zu lang; leerer Text benötigt eine dekorative Freigabe.");
  }
  if (observed?.isAltField !== true || observed.editable !== true) {
    return rejected("unsupported", "Ein eindeutig erkanntes editierbares Alternativtextfeld ist erforderlich.");
  }
  try {
    if (canonicalWebsiteImageSource(observed.sourceUrl) !== canonicalWebsiteImageSource(image.sourceUrl)) {
      return rejected("conflict", "Die ausgewählte CMS-Bildquelle stimmt nicht mit der Freigabe überein.");
    }
  } catch { return rejected("conflict", "Die CMS-Bildquelle lässt sich nicht eindeutig zuordnen."); }
  if (typeof image.expectedAlt !== "string" || typeof image.expectedCaption !== "string"
      || typeof observed.alt !== "string" || typeof observed.caption !== "string") {
    return rejected("conflict", "Alternativtext und sichtbare Bildunterschrift sind nicht eindeutig erfasst.");
  }
  if (observed.caption !== image.expectedCaption) {
    return rejected("conflict", "Die sichtbare Bildunterschrift wurde verändert. Bitte zuerst neu abgleichen.");
  }
  if (observed.alt === image.text) return { status: "unchanged" };
  if (observed.alt !== image.expectedAlt) {
    return rejected("conflict", "Der Alternativtext wurde seit der Prüfung verändert. Bitte zuerst neu abgleichen.");
  }
  return { status: "ready" };
}
