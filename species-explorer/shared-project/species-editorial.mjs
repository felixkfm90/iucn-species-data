import { check } from './errors.mjs';
import { validateSpeciesRecord } from './species-record.mjs';
import { projectSpeciesRecordToExplorer } from './species-view.mjs';
import { validateEditorialSourceBindings } from './species-editorial-intent.mjs';
import { objectJson, digest } from './security.mjs';
import { clone, fingerprint, identifier } from '../page-authoring/contract.mjs';
import { NORMAL_ASSET_FILES, normalizeAssetMetadata, emptySectionHash, hasContent } from '../page-authoring/model.mjs';
import { validatePageAuthoringObject } from '../page-authoring/shared.mjs';

const SOURCE_KEYS = ['type', 'schemaVersion', 'id', 'input', 'generated', 'taxonomyOverride', 'assessmentBinding', 'assets'];
const NORMAL_MIMES = { portrait: 'image/webp', map: 'image/jpeg', sound: 'audio/mpeg', credits: 'application/json', spectrogram: 'image/webp' };

/** Protected authority sourceBody; an editorial-only Record 1 -> 2 upgrade keeps its version-1 source identity. */
export function speciesPageSourceBody(value) {
  const record = validateSpeciesRecord(value, value?.id);
  return clone({ ...Object.fromEntries(SOURCE_KEYS.map(key => [key, record[key]])), schemaVersion: 1 });
}

export const speciesPageSourceHash = value => fingerprint(speciesPageSourceBody(value));

function currentObject(value, kind) {
  check(value && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(entry => 'value' in entry),
  400, 'invalid_editorial_object', 'Die Projektion benötigt einen tatsächlichen gemeinsamen Objektstand.');
  check(value.kind === kind, 409, 'editorial_object_kind', 'Seitenentwurf und Artquelle besitzen nicht die erwarteten Objektarten.');
  identifier(value.id); identifier(value.revision);
  check([value.localPending, value.localConflict].every(flag => flag === undefined || flag === false)
    && (value.approval === undefined || ['draft', 'approved'].includes(value.approval)),
  409, 'editorial_source_unconfirmed', 'Offene lokale Änderungen oder Konflikte dürfen nicht als aktueller Serverstand übernommen werden.');
  return value;
}

function normalMetadata(source, view, projectId, role) {
  const attribution = role === 'map'
    ? view.assets.map.source ? `Quelle: ${view.assets.map.source}` : ''
    : role === 'portrait'
      ? [view.assets.portrait.metadata?.type, view.assets.portrait.metadata?.source, view.assets.portrait.metadata?.generation_method].filter(Boolean).join(' · ')
      : [view.credits?.recordist, view.credits?.license, view.credits?.source, view.credits?.url].filter(Boolean).join(' · ');
  const file = source.assets.files[NORMAL_ASSET_FILES[role]];
  check(!file || file.mimeType === NORMAL_MIMES[role], 409, 'normal_asset_format', 'Eine normale Artdatei besitzt nicht ihr gebundenes Dateiformat.');
  return file?.bytes > 0 ? { id: file.id, projectId, sha256: file.sha256, bytes: file.bytes, mimeType: file.mimeType, attribution } : null;
}

/** Exact original metadata for one role. Transfer budgets belong to its caller. */
export function speciesNormalAssetMetadata(record, projectId, role) {
  identifier(projectId);
  check(Object.hasOwn(NORMAL_ASSET_FILES, role), 400, 'normal_asset_format', 'Eine feste normale Artdatei ist erforderlich.');
  const source = validateSpeciesRecord(record, record?.id), view = projectSpeciesRecordToExplorer({ id: source.id, data: source });
  return normalMetadata(source, view, projectId, role);
}

export function speciesNormalAssets(record, projectId) {
  identifier(projectId);
  const source = validateSpeciesRecord(record, record?.id), view = projectSpeciesRecordToExplorer({ id: source.id, data: source });
  return Object.fromEntries(Object.keys(NORMAL_ASSET_FILES).map(role => {
    const metadata = normalMetadata(source, view, projectId, role);
    return [role, metadata ? normalizeAssetMetadata(metadata, projectId) : null];
  }));
}

function emptyDecision(section, document) {
  const decision = document.emptyConfirmations[section.id];
  if (!decision) return null;
  check(!hasContent(section.blocks) && decision.sectionHash === emptySectionHash(section),
    409, 'editorial_empty_changed', 'Die bewusste Leerstelle ist nicht mehr an diesen vollständigen Abschnitt gebunden.');
  return clone(decision);
}

/**
 * Pure, internal editorial projection. The caller supplies current authenticated
 * server heads; this function performs no lookup, writes, approval or publication.
 * A valid page approval/CMS receipt remains only part of the source fingerprint.
 * Gallery registry membership and actual media bytes need the later server boundary.
 */
export function projectPageEditorial({ pageObject, speciesObject, projectId } = {}) {
  identifier(projectId);
  const page = currentObject(pageObject, 'page'), species = currentObject(speciesObject, 'species');
  const record = validateSpeciesRecord(species.data, species.id);
  const data = validatePageAuthoringObject(page.data, page.id), document = data.document;
  check(document.slug === species.id && record.id === species.id,
    409, 'editorial_species_mismatch', 'Dieser Seitenentwurf gehört nicht zur gewählten Art.');
  const sourceHash = speciesPageSourceHash(record);
  check(document.species.dataSha256 === sourceHash,
    409, 'species_source_changed', 'Die geschützte Artgrundlage wurde seit dieser Seitenfassung geändert.');
  check(document.species.assetName === record.assets.assetName,
    409, 'editorial_asset_binding_changed', 'Der Seitenentwurf verwendet nicht die aktuelle stabile Artablage.');

  // Hash claims alone are insufficient: rebuild every role from the real record,
  // including absence/zero bytes and the existing sanitized attribution mapping.
  for (const asset of Object.values(document.species.normalAssets).filter(Boolean)) normalizeAssetMetadata(asset, projectId);
  const actualNormalAssets = speciesNormalAssets(record, projectId);
  check(fingerprint(document.species.normalAssets) === fingerprint(actualNormalAssets),
    409, 'editorial_normal_assets_changed', 'Die normalen Artdateien stimmen nicht mit der aktuellen geschützten Quelle überein.');
  const gallery = document.images.map((image, order) => ({ id: image.id,
    asset: normalizeAssetMetadata(image.asset, projectId), alt: image.alt, caption: image.caption,
    decorative: image.decorative, order }));
  const sourceBindings = validateEditorialSourceBindings({ projectId,
    page: { objectId: page.id, objectRevision: page.revision, dataRevision: data.revision,
      contentHash: data.contentHash, imagesHash: data.imagesHash, dataHash: fingerprint(data) },
    species: { id: species.id, objectRevision: species.revision, dataHash: digest(objectJson(record)), sourceHash } });

  return {
    kind: 'page-editorial-projection', schemaVersion: 1,
    sourceBindings,
    title: document.title, introduction: clone(document.introduction),
    sections: document.sections.map(section => ({ id: section.id, kind: section.kind, title: section.title,
      requested: section.requested, blocks: clone(section.blocks), sources: clone(section.sources),
      emptyDecision: emptyDecision(section, document) })),
    sources: clone(document.sources), galleryRequested: document.galleryRequested, gallery,
    normalAssets: actualNormalAssets, websiteUrl: record.editorial.websiteUrl,
    readerApproved: false, externalPublication: 'not-performed',
  };
}
