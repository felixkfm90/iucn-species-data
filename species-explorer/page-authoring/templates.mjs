import { check, clone, fingerprint } from "./contract.mjs";

export const FN_SPECIES_CODE = '<div id="species-output">\n  <div id="species-info"></div>\n  <div id="species-taxonomy"></div>\n  <div id="species-status"></div>\n  <div id="species-sound"></div>\n</div>';
export const FN_MAP_CODE = '<div id="map-wrapper" style="position:relative; width:100%; overflow:hidden;">\n  <div id="map-output" style="width:100%;"></div>\n</div>';
export const FN_FIGURE_STYLES = Object.freeze({
  grid: "display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr));gap:1rem",
  figure: "margin:0;min-width:0",
  image: "display:block;width:100%;height:auto",
  text: "display:block;white-space:pre-wrap;overflow-wrap:anywhere",
});
export const FN_MODULE_IDS = ["species-output", "species-info", "species-taxonomy", "species-status", "species-sound", "map-wrapper", "map-output"];
const compact = [["general", "Allgemein", "general-module"], ["appearance", "Aussehen"], ["distribution", "Verbreitung"],
  ["habitat", "Lebensraum"], ["reproduction", "Brut"], ["food", "Nahrung"], ["observation", "Beobachtungstipp"], ["map", "Verbreitungskarte", "map-module"]];
const extended = [["general", "Allgemein", "general-module"], ["appearance", "Aussehen"], ["distribution", "Verbreitung"],
  ["habitat", "Lebensraum"], ["reproduction", "Fortpflanzung"], ["development", "Entwicklung"], ["food", "Nahrung"],
  ["features", "Besonderheiten"], ["observation", "Beobachtungstipp"], ["map", "Verbreitungskarte", "map-module"]];
function definition(id, sourceSlug, url, checkedAt, htmlSha256, sections) {
  const value = { id, schemaVersion: 1, source: { slug: sourceSlug, url, checkedAt, htmlSha256 }, titleLevel: 3,
    sections: sections.map(([id, title, kind = "editorial"]) => ({ id, title, kind, headingLevel: 4 })),
    moduleIds: FN_MODULE_IDS, speciesCode: FN_SPECIES_CODE, mapCode: FN_MAP_CODE,
    galleryPosition: "after-map", siteShell: "existing-fn-header-and-footer", runtimeScripts: "existing-site-footer-only" };
  return { ...value, templateHash: fingerprint(value) };
}
const definitions = [
  definition("fn-compact-20261031", "alcedoatthis", "https://www.fnwildlifetravel.de/wildlife/heimische-tierwelt/alcedoatthis",
    "2026-10-31T08:16:33.239Z", "844a11724f439f2207bee2a671a34da6a0322248c51f130041a5dad48fec9452", compact),
  definition("fn-extended-20261031", "acinonyxjubatus", "https://www.fnwildlifetravel.de/wildlife/afrika/acinonyxjubatus",
    "2026-10-31T08:16:37.291Z", "93435e74598679de2b45820e5c78fc279af690e2aeb84b534b9141699e7f586e", extended),
];
export function listPageTemplates() { return clone(definitions); }
export function getPageTemplate(id) {
  const value = definitions.find(item => item.id === id);
  check(value, "unknown_template", "Eine vorhandene FN-Artseitenvariante auswählen."); return clone(value);
}
