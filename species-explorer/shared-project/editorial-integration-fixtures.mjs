import { fingerprint } from "../page-authoring/contract.mjs";
import { initialDocument, normalizeSpeciesSnapshot, NORMAL_ASSET_FILES } from "../page-authoring/model.mjs";
import { encodePageAuthoringDraft, pageAuthoringObjectId } from "../page-authoring/shared.mjs";
import { speciesPageSourceHash } from "./species-editorial.mjs";

/** Synthetic fixture only: no existing species, assets, accounts or website reads. */
export function editorialIntegrationFixture(store, login, { files = {}, id = "fixture-owl", pageId = "fixture-reader-page",
  epithet = "fixture", commonName = "Testkauz" } = {}) {
  const record = { type: "fn-species-record", schemaVersion: 1, id,
    input: { genus: "Strix", species: epithet, german: commonName, english: "Fixture owl", size: "30 cm",
      weight: "400 g", life_expectancy: "12 Jahre", originalUnknown: { retain: [false, 3] } },
    generated: { Class: "Aves", originalUnknown: "protected" }, taxonomyOverride: { manual: true },
    assessmentBinding: { original: 123 }, assets: { assetName: commonName, files: structuredClone(files), overrides: {}, credits: null, portraitMetadata: null },
    editorial: { websiteUrl: null, sections: [{ id: "old", title: "Voriger Fachtext", text: "Vorhandener Text", intentionallyEmpty: false }],
      gallery: [], generalSectionId: null, embeddedGeneralText: null } };
  const speciesObject = store.createObject(login.token, { kind: "species", id: record.id, data: record });
  const sourceHash = speciesPageSourceHash(record), projectId = login.projectId;
  const species = normalizeSpeciesSnapshot({ slug: record.id, scientificName: `Strix ${epithet}`, commonName, assetName: commonName,
    taxonomy: [{ rank: "Class", name: "Aves" }], general: [], status: "Least Concern", revision: `species-${sourceHash}`,
    dataSha256: sourceHash, runtimeReady: false, normalAssets: Object.fromEntries(Object.entries(NORMAL_ASSET_FILES).map(([role, name]) => {
      const file = record.assets.files[name];
      return [role, file?.bytes > 0 ? { id: file.id, projectId, sha256: file.sha256, bytes: file.bytes, mimeType: file.mimeType, attribution: "" } : null];
    })) }, projectId, record.id);
  const document = initialDocument({ templateId: "fn-compact-20261031", species, parentPath: "/wildlife/heimische-tierwelt",
    title: `${commonName} – freier menschlicher Titel` });
  document.introduction = [{ type: "paragraph", text: "Vollständige Einleitung" }];
  for (const section of document.sections) if (section.kind === "editorial") section.blocks = [{ type: "paragraph", text: `Fachtext ${section.title}` }];
  const data = encodePageAuthoringDraft({ id: pageId, revision: fingerprint("fixture-page-1"), document });
  const pageObject = store.createObject(login.token, { kind: "page", id: pageAuthoringObjectId(data.pageId), data });
  return { speciesObject, pageObject, projectId, actor: { id: login.user.id, projectId, role: login.user.role } };
}
