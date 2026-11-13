import { check, fields, identifier, digest, fingerprint, clone, canonical, text, publisher } from './contract.mjs';
import { normalizeDocument, editableDocument, normalizeAssetMetadata, normalizeSpeciesSnapshot, emptySectionHash, hasContent } from './model.mjs';

export const PAGE_AUTHORING_TYPE = 'fn-species-page';
const privileged = role => ['admin', 'publisher'].includes(role);
export const pageAuthoringObjectId = pageId => `fn-species-page-${fingerprint(identifier(pageId))}`;
export const pageImagesHash = document => fingerprint(document.images.map(({ id, assetId, alt, caption, decorative, asset }) => ({ id, assetId, alt, caption, decorative, asset })));
export function validateStoredDocument(document) {
  fields(document, ['schemaVersion','templateId','templateHash','slug','parentPath','title','introduction','sections','images','sources','galleryRequested','emptyConfirmations','species']);
  check(document.schemaVersion === 1 && document.species && document.species.slug === document.slug, 'invalid_document', 'Die Artseitenbindung ist ungültig.');
  const normalized = normalizeDocument(editableDocument(document), { species: document.species, previous: document });
  const projectId = Object.values(document.species.normalAssets).find(Boolean)?.projectId || document.images[0]?.asset?.projectId || 'unbound-project';
  const checkedSpecies = normalizeSpeciesSnapshot(document.species, projectId, document.slug);
  check(fingerprint(checkedSpecies) === fingerprint(document.species), 'invalid_species_binding', 'Die Artgrunddaten sind nicht kanonisch gebunden.');
  check(document.templateHash === normalized.templateHash, 'template_changed', 'Die gebundene Artseitenvorlage stimmt nicht überein.', 409);
  for (const image of document.images) {
    fields(image, ['id','assetId','alt','caption','decorative','asset']);
    check(image.asset && image.asset.id === image.assetId, 'invalid_media_binding', 'Die Bilddatei ist nicht an ihre Bildverwendung gebunden.');
    normalizeAssetMetadata(image.asset, projectId);
    check(image.asset.mimeType.startsWith('image/'), 'invalid_gallery_media', 'Galeriebilder benötigen eine Bilddatei.');
  }
  normalized.images = document.images.map(image => ({ ...image }));
  check(fingerprint(normalized) === fingerprint(document), 'invalid_document', 'Die gespeicherte Seite enthält ungeprüfte oder widersprüchliche Strukturfelder.');
  fields(document.emptyConfirmations, document.sections.map(section => section.id));
  for (const [id, confirmation] of Object.entries(document.emptyConfirmations)) {
    fields(confirmation, ['sectionHash','actorId','confirmedAt','reason']);
    const section = document.sections.find(value => value.id === id);
    check(section && !hasContent(section.blocks) && confirmation.sectionHash === emptySectionHash(section), 'invalid_empty_confirmation', 'Die Bestätigung gehört nicht zur unveränderten Leerstelle.');
    identifier(confirmation.actorId); text(confirmation.confirmedAt, 80); text(confirmation.reason, 1000);
  }
  check(Buffer.byteLength(canonical(document)) <= 2 * 1024 * 1024, 'document_too_large', 'Der Artseitenentwurf ist zu groß.');
  return document;
}
function approval(value, data) {
  fields(value, ['revision','contentHash','imagesHash','reportHash','previewHash','review','missingAltAcknowledged','approvalHash']);
  for (const key of ['revision','contentHash','imagesHash','reportHash','previewHash','approvalHash']) digest(value[key]);
  fields(value.review, ['texts','images','layout']);
  check(Object.values(value.review).length === 3 && Object.values(value.review).every(item => item === true), 'review_required', 'Die menschliche Endprüfung ist noch nicht vollständig bestätigt.');
  check(Array.isArray(value.missingAltAcknowledged) && value.missingAltAcknowledged.every(item => typeof item === 'string'), 'invalid_approval', 'Die Bildtextfreigabe ist ungültig.');
  const { approvalHash, ...body } = value;
  check(approvalHash === fingerprint(body) && value.revision === data.revision && value.contentHash === data.contentHash && value.imagesHash === data.imagesHash,
    'stale_approval', 'Die Endfreigabe gehört nicht zu dieser vollständigen Seitenfassung.', 409);
}
function cms(value) {
  fields(value, ['status','attemptId','revision','contentHash','imagesHash','planHash','receiptHash','pageId','unpublished']);
  check(['saved-unpublished','uncertain','failed','dispatched','prepared'].includes(value.status), 'invalid_cms_state', 'Der CMS-Zustand ist ungültig.');
  identifier(value.attemptId); for (const key of ['revision','contentHash','imagesHash','planHash']) digest(value[key]);
  if (value.receiptHash !== undefined) digest(value.receiptHash);
  if (value.pageId !== undefined) identifier(value.pageId);
  check(value.unpublished === true, 'publication_not_supported', 'Dieser Auftrag bereitet ausschließlich unveröffentlichte neue Seiten vor.');
  if (value.status === 'saved-unpublished') check(value.pageId && value.receiptHash, 'invalid_cms_receipt', 'Ein CMS-Speichern benötigt eine gebundene Quittung.');
}
export function encodePageAuthoringDraft(draft, { approval: approved = null, cms: cmsState = null, history = [], adoptUnlinkedApprovals = false } = {}) {
  validateStoredDocument(draft.document);
  const data = { type: PAGE_AUTHORING_TYPE, schemaVersion: 1, title: draft.document.title.slice(0,500), pageId: identifier(draft.id), revision: digest(draft.revision),
    document: clone(draft.document), contentHash: fingerprint(draft.document), imagesHash: pageImagesHash(draft.document), approval: approved && clone(approved),
    cms: cmsState && clone(cmsState), history: clone(history), adoptUnlinkedApprovals: adoptUnlinkedApprovals === true };
  validatePageAuthoringObject(data); return data;
}
export function validatePageAuthoringObject(data, objectId) {
  fields(data, ['type','schemaVersion','title','pageId','revision','document','contentHash','imagesHash','approval','cms','history','adoptUnlinkedApprovals']);
  check(data.type === PAGE_AUTHORING_TYPE && data.schemaVersion === 1 && typeof data.adoptUnlinkedApprovals === 'boolean', 'invalid_page_object', 'Das gemeinsame Artseitenformat ist ungültig.');
  identifier(data.pageId); digest(data.revision); validateStoredDocument(data.document);
  check(data.approval === null || data.approval && typeof data.approval === 'object', 'invalid_approval', 'Der Freigabezustand muss ausdrücklich angegeben sein.');
  check(data.cms === null || data.cms && typeof data.cms === 'object', 'invalid_cms_state', 'Der CMS-Zustand muss ausdrücklich angegeben sein.');
  check(data.title === data.document.title.slice(0,500) && (!objectId || objectId === pageAuthoringObjectId(data.pageId)) && data.contentHash === fingerprint(data.document) && data.imagesHash === pageImagesHash(data.document), 'page_binding_mismatch', 'Die gemeinsame Seite ist nicht an Inhalt, Bilder und Objektkennung gebunden.', 409);
  check(Array.isArray(data.history) && data.history.length <= 1000 && data.history.every(entry => entry && ['approval','cms'].includes(entry.kind) && entry.decision && typeof entry.decision === 'object'), 'invalid_history', 'Der Entscheidungsverlauf ist ungültig.');
  if (data.approval) approval(data.approval, data);
  if (data.cms) cms(data.cms);
  check(Buffer.byteLength(canonical(data)) <= 2 * 1024 * 1024, 'document_too_large', 'Der gemeinsame Artseitenstand ist zu groß.'); return data;
}
function matches(receipt, data, kind) {
  const decision = kind === 'approval' ? data.approval : data.cms;
  return decision && receipt.kind === kind && privileged(receipt.actorRole) && receipt.revision === decision.revision
    && receipt.contentHash === decision.contentHash && receipt.imagesHash === decision.imagesHash
    && (kind === 'approval' ? receipt.approvalHash === decision.approvalHash && receipt.reportHash === decision.reportHash
      : receipt.receiptHash === decision.receiptHash && receipt.planHash === decision.planHash && receipt.attemptId === decision.attemptId && receipt.status === decision.status);
}
/** Call only inside the authenticated server transaction, with receipts from its append-only table. */
export function guardPageAuthoringTransition({ objectId, before, next, actorRole, projectId, receipts = [] }) {
  if (before?.type !== PAGE_AUTHORING_TYPE && next?.type !== PAGE_AUTHORING_TYPE && !objectId?.startsWith('fn-species-page-')) return [];
  check(next?.type === PAGE_AUTHORING_TYPE, 'page_type_changed', 'Ein Artseitenentwurf darf nicht in ungeprüfte generische Daten umgewandelt werden.', 409);
  validatePageAuthoringObject(next, objectId);
  if (projectId !== undefined) {
    identifier(projectId);
    const assets = [...Object.values(next.document.species.normalAssets).filter(Boolean), ...next.document.images.map(image => image.asset)];
    check(assets.every(asset => asset.projectId === projectId), 'foreign_media', 'Die bereitgestellten Medien gehören nicht zu diesem Serverprojekt.', 403);
  }
  check(['admin','publisher','contributor'].includes(actorRole), 'forbidden', 'Für diese Artseitenänderung fehlt die redaktionelle Berechtigung.', 403);
  if (before) {
    validatePageAuthoringObject(before, objectId);
    check(before.pageId === next.pageId && before.document.slug === next.document.slug, 'page_identity_changed', 'Der gemeinsame Entwurf bleibt an seine Art und Kennung gebunden.', 409);
    const hashes = new Set(next.history.map(fingerprint));
    check(before.history.every(value => hashes.has(fingerprint(value))), 'page_history_lost', 'Der Entscheidungsverlauf darf nicht gelöscht werden.', 409);
    for (const kind of ['approval','cms']) if (before[kind] && fingerprint(before[kind]) !== fingerprint(next[kind])) {
      check(next.history.some(entry => entry.kind === kind && fingerprint(entry.decision) === fingerprint(before[kind])), 'page_history_lost', 'Eine ersetzte Entscheidung muss im Verlauf erhalten bleiben.', 409);
    }
  }
  const required = [];
  if (!privileged(actorRole)) {
    if (next.approval) check(before?.approval && fingerprint(before.approval) === fingerprint(next.approval)
      && before.revision === next.revision && before.contentHash === next.contentHash && before.imagesHash === next.imagesHash,
      'forbidden', 'Frühere Freigaben dürfen nicht durch einen Entwurfsbearbeiter erneut aktiviert werden.', 403);
    if (next.cms?.status === 'saved-unpublished') check(before?.cms && fingerprint(before.cms) === fingerprint(next.cms)
      && before.revision === next.revision && before.contentHash === next.contentHash && before.imagesHash === next.imagesHash,
      'forbidden', 'Ein früherer CMS-Beleg darf nicht als neuer Erfolg aktiviert werden.', 403);
  }
  if (next.approval && !receipts.some(row => matches(row, next, 'approval'))) {
    check(privileged(actorRole) && next.adoptUnlinkedApprovals, 'unproven_page_approval', 'Die Freigabe benötigt einen Serverbeleg oder eine ausdrückliche Übernahme durch einen Veröffentlichungsberechtigten.', 403);
    const { revision, contentHash, imagesHash, reportHash, approvalHash } = next.approval;
    required.push({ kind: 'approval', revision, contentHash, imagesHash, reportHash, approvalHash, origin: 'publisher-adoption' });
  }
  if (next.cms?.status === 'saved-unpublished') check(receipts.some(row => matches(row, next, 'cms')), 'unproven_cms_outcome', 'Ein mitgelieferter CMS-Erfolg ersetzt keine serverseitige Ausführungsquittung.', 403);
  return required;
}
export function validateSharedPageTransition(before, after, actualActor, receipts = []) {
  return guardPageAuthoringTransition({ objectId: pageAuthoringObjectId(after.pageId), before, next: after, actorRole: actualActor?.role, projectId:actualActor?.projectId, receipts });
}
export function pageAuthoringServerEvidence({ objectId, objectRevision, objectOrdinal, data, receipts = [] }) {
  validatePageAuthoringObject(data, objectId);
  const rows = receipts.filter(row => row.objectId === objectId && (row.objectRevision === objectRevision
    || Number.isSafeInteger(objectOrdinal) && Number.isSafeInteger(row.objectOrdinal) && row.objectOrdinal <= objectOrdinal
    || Number.isSafeInteger(objectRevision) && Number.isSafeInteger(row.objectRevision) && row.objectRevision <= objectRevision));
  const approvalRows = rows.filter(row => matches(row, data, 'approval')), cmsRows = rows.filter(row => matches(row, data, 'cms'));
  return { schemaVersion: 1, objectId, objectRevision, ...(objectOrdinal === undefined ? {} : { objectOrdinal }), trusted: (!data.approval || approvalRows.length > 0) && (data.cms?.status !== 'saved-unpublished' || cmsRows.length > 0),
    approvals: clone(approvalRows), cms: clone(cmsRows) };
}
/** Cache validation cannot mint trust: supply only evidence received outside data from the authenticated service. */
export function validatePageAuthoringServerEvidence({ objectId, objectRevision, objectOrdinal, data, evidence, requireTrusted = false }) {
  validatePageAuthoringObject(data, objectId);
  let result = { schemaVersion: 1, objectId, objectRevision, ...(objectOrdinal === undefined ? {} : { objectOrdinal }), trusted: !data.approval && data.cms?.status !== 'saved-unpublished', approvals: [], cms: [] };
  if (evidence && evidence.schemaVersion === 1 && evidence.objectId === objectId && evidence.objectRevision === objectRevision && evidence.objectOrdinal === objectOrdinal && Array.isArray(evidence.approvals) && Array.isArray(evidence.cms))
    result = pageAuthoringServerEvidence({ objectId, objectRevision, objectOrdinal, data, receipts: [...evidence.approvals, ...evidence.cms] });
  if (requireTrusted) check(result.trusted, 'page_evidence_missing', 'Die gemeinsame Freigabe oder CMS-Quittung ist nicht serverseitig belegt.', 409);
  return result;
}
export function importPageAuthoringAsDraft(data) {
  validatePageAuthoringObject(data);
  const result = clone(data);
  for (const kind of ['approval','cms']) if (result[kind]) { result.history.push({ kind, decision: result[kind] }); result[kind] = null; }
  result.adoptUnlinkedApprovals = false; return result;
}
