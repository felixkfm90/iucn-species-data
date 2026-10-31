import { check, digest, fingerprint, normalizeActor, editor, publisher, online, clone } from './contract.mjs';
import { objectJson, digest as sharedDigest } from '../shared-project/security.mjs';
import { PAGE_AUTHORING_TYPE, encodePageAuthoringDraft, pageAuthoringObjectId, validatePageAuthoringObject, validatePageAuthoringServerEvidence,
  guardPageAuthoringTransition, importPageAuthoringAsDraft } from './shared.mjs';

/** Uses the existing SharedProjectClient's durable offline queue and server CAS; no new HTTP protocol or second queue. */
export function createSharedPageDraftAdapter({ client, actorAuthority }) {
  check(client && ['getObject','createObject','editExistingObject','sync'].every(key => typeof client[key] === 'function') && typeof actorAuthority?.resolve === 'function', 'shared_adapter_required', 'Der gemeinsame Seitenadapter benötigt den vorhandenen angemeldeten Projektclient.');
  async function actor(context, operation) { return normalizeActor(await actorAuthority.resolve(context,operation)); }
  function checked(object, pageId, requireTrusted = false) {
    const id = pageAuthoringObjectId(pageId);
    check(object && object.kind === 'page' && object.id === id && typeof object.revision === 'string', 'shared_page_missing', 'Der gemeinsame Artseitenstand ist nicht verfügbar.',404);
    validatePageAuthoringObject(object.data,id);
    const evidence = validatePageAuthoringServerEvidence({objectId:id,objectRevision:object.revision,objectOrdinal:object.ordinal,data:object.data,evidence:object.pageAuthoringEvidence,requireTrusted});
    return {object:clone(object),data:clone(object.data),evidence,localPending:object.localPending === true,localConflict:object.localConflict === true};
  }
  return Object.freeze({
    async create(context,draft) {
      const a = await actor(context,'shared-page-create'); editor(a); online(a);
      check(draft.projectId === a.projectId,'foreign_project','Der Entwurf gehört zu einem anderen Projekt.',403);
      const data = importPageAuthoringAsDraft(encodePageAuthoringDraft(draft));
      return checked(await client.createObject({kind:'page',id:pageAuthoringObjectId(draft.id),data}),draft.id);
    },
    async read(context,pageId,{serverOnly=false,requireTrusted=false}={}) {
      await actor(context,'shared-page-read'); return checked(await client.getObject('page',pageAuthoringObjectId(pageId),{serverOnly}),pageId,requireTrusted);
    },
    async queue(context,{pageId,data,expectedObjectRevision,expectedDataHash}) {
      const a = await actor(context,'shared-page-save'); editor(a);
      const id = pageAuthoringObjectId(pageId), current = await client.getObject('page',id);
      const previous = checked(current,pageId);
      check(current.revision === expectedObjectRevision && fingerprint(current.data) === digest(expectedDataHash),'shared_page_conflict','Der gemeinsame Ausgangsstand hat sich geändert. Die eigene Fassung bleibt erhalten.',409);
      validatePageAuthoringObject(data,id);
      guardPageAuthoringTransition({objectId:id,before:previous.data,next:data,actorRole:a.role,projectId:a.projectId,receipts:[...previous.evidence.approvals,...previous.evidence.cms]});
      if (data.approval && (!previous.data.approval || data.approval.approvalHash !== previous.data.approval.approvalHash)) { publisher(a); online(a); }
      await client.editExistingObject('page',id,data,{baseRevision:current.revision,expectedDataHash:sharedDigest(objectJson(current.data))});
      return checked(await client.getObject('page',id),pageId);
    },
    async synchronize(context,pageId) {
      const a = await actor(context,'shared-page-sync'); online(a);
      const status = await client.sync({kind:'page',id:pageAuthoringObjectId(pageId)}), result = checked(await client.getObject('page',pageAuthoringObjectId(pageId)),pageId);
      check(!result.localPending && !result.localConflict,'shared_page_conflict','Der Seitenabgleich ist noch offen; keine gemeinsame Freigabe behaupten.',409);
      return {...result,status};
    },
  });
}
