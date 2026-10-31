import { check, fields, identifier, slug, digest, text, fingerprint, clone, normalizeActor, editor, publisher, online } from './contract.mjs';
import { initialDocument, normalizeDocument, normalizeSpeciesSnapshot, normalizeAssetMetadata, editableDocument, emptySectionHash, hasContent } from './model.mjs';
import { composePage, verifyDocumentMedia } from './compose.mjs';

/** Authorities and repository are main/server-owned, never renderer-supplied. No method performs CMS I/O. */
export function createPageAuthoringService({ repository, actorAuthority, speciesAuthority, mediaFacade, targetAuthority, now = () => new Date().toISOString() }) {
  check(repository && typeof actorAuthority?.resolve === 'function' && typeof speciesAuthority?.snapshot === 'function'
    && typeof mediaFacade?.describe === 'function' && typeof mediaFacade?.read === 'function' && typeof targetAuthority?.checkNew === 'function', 'authority_required', 'Der Artseitenkern benötigt eingerichtete Projekt-, Medien- und Zielzuständigkeiten.');
  const actor = async (context, operation) => normalizeActor(await actorAuthority.resolve(context, operation));
  function mutation(a, operation, input) {
    return { projectId: a.projectId, actorId: a.id, mutationId: identifier(input.mutationId), intentHash: fingerprint({ operation, input }) };
  }
  function draft(a,input) { return repository.assertCurrent(a.projectId,identifier(input.draftId),digest(input.expectedRevision)); }
  async function newTarget(context,a,path) {
    online(a);
    const value = await targetAuthority.checkNew(context,path);
    fields(value,['path','exists','parentPath','parentExists','online','observationId','checkedAt']);
    check(value.path === path && value.exists === false && value.online === true && value.parentExists === true && value.parentPath === path.slice(0,path.lastIndexOf('/')),
      'target_not_new', 'Der freie neue Seitenpfad und sein vorhandener Websitebereich konnten nicht bestätigt werden.', 409);
    identifier(value.observationId); text(value.checkedAt,80);
    check(Number.isFinite(Date.parse(value.checkedAt)), 'target_observation_invalid', 'Die Zielbeobachtung ist ungültig.',409);
    const age = Date.parse(now()) - Date.parse(value.checkedAt);
    check(Number.isFinite(age) && age >= -30000 && age <= 120000,'target_observation_stale','Der freie neue Zielpfad muss unmittelbar vor diesem Auftrag geprüft werden.',409);
    return clone(value);
  }
  async function attachMedia(context,a,document) {
    for (const image of document.images) {
      const metadata = normalizeAssetMetadata(await mediaFacade.describe(context,image.assetId),a.projectId);
      check(metadata.id === image.assetId && metadata.mimeType.startsWith('image/'), 'invalid_gallery_media', 'Eine Galerieposition benötigt genau die bereitgestellte Bilddatei.');
      image.asset = metadata;
    }
    return document;
  }
  async function composed(context,value) {
    const verified = await verifyDocumentMedia(value.document,mediaFacade,context); return composePage(value,verified);
  }
  function currentApproval(a,value) { return repository.latestArtifact(a.projectId,value.id,'approval',value.revision); }
  function trustedAdapter(a) { publisher(a); online(a); check(a.channel === 'cms-adapter','trusted_adapter_required','CMS-Ausführungsquittungen dürfen nur vom eingerichteten Ausführungsadapter stammen.',403); }
  const api = {
    async createDraft(context,input) {
      fields(input,['draftId','mutationId','templateId','slug','parentPath','title']);
      const a = await actor(context,'create'); editor(a); online(a); const base = mutation(a,'create',input), replay = repository.replay(base); if (replay) return replay;
      const species = normalizeSpeciesSnapshot(await speciesAuthority.snapshot(context,slug(input.slug)),a.projectId,input.slug);
      const document = initialDocument({ templateId: input.templateId, species, parentPath: input.parentPath, ...(input.title === undefined ? {} : { title: input.title }) });
      await newTarget(context,a,`${document.parentPath}/${document.slug}`);
      return repository.commit({ ...base,id:identifier(input.draftId),create:true,document });
    },
    async getDraft(context,draftId) {
      const a = await actor(context,'read'), value = repository.read(a.projectId,identifier(draftId));
      check(value,'draft_not_found','Dieser Artseitenentwurf ist nicht vorhanden.',404);
      const approval = currentApproval(a,value), attempt = repository.attemptForDraft(a.projectId,value.id);
      return { draft:value,editable:editableDocument(value.document),approval, cms:attempt && { ...attempt,matchesCurrentRevision:attempt.revision === value.revision },published:false };
    },
    async saveDraft(context,input) {
      fields(input,['draftId','mutationId','expectedRevision','document']);
      const a = await actor(context,'save'); editor(a); const base = mutation(a,'save',input), replay = repository.replay(base); if (replay) return replay;
      const prior = draft(a,input), document = normalizeDocument(input.document,{ species:prior.document.species,previous:prior.document });
      // A pre-existing offline draft can retain already managed images. The authority remains responsible for local metadata access.
      await attachMedia(context,a,document);
      return repository.commit({ ...base,id:prior.id,expectedRevision:prior.revision,document });
    },
    async confirmEmpty(context,input) {
      fields(input,['draftId','mutationId','expectedRevision','sectionId','confirmed','reason']);
      const a = await actor(context,'confirm-empty'); editor(a); const base = mutation(a,'confirm-empty',input), replay = repository.replay(base); if (replay) return replay;
      check(input.confirmed === true,'empty_confirmation_required','Die bewusste Leerstelle muss ausdrücklich bestätigt werden.');
      const prior = draft(a,input), document = clone(prior.document), section = document.sections.find(value => value.id === input.sectionId);
      check(section?.kind === 'editorial' && !hasContent(section.blocks),'not_empty','Nur ein tatsächlich leerer Fachabschnitt kann bestätigt werden.');
      document.emptyConfirmations[section.id] = { sectionHash:emptySectionHash(section),actorId:a.id,confirmedAt:now(),reason:text(input.reason,1000) };
      return repository.commit({ ...base,id:prior.id,expectedRevision:prior.revision,document });
    },
    async preview(context,input) {
      fields(input,['draftId','mutationId','expectedRevision']);
      const a = await actor(context,'preview'); editor(a); const base = mutation(a,'preview',input), value = draft(a,input), result = await composed(context,value);
      const stored = repository.recordArtifact({ ...base,draftId:value.id,expectedRevision:value.revision,kind:'preview',payload:result.report });
      return { ...result,...stored };
    },
    async approve(context,input) {
      fields(input,['draftId','mutationId','expectedRevision','previewId','reportHash','review','missingAltAcknowledged']);
      const a = await actor(context,'approve'); publisher(a); online(a); const base = mutation(a,'approve',input), replay = repository.replay(base); if (replay) return replay;
      const value = draft(a,input), preview = repository.artifact(a.projectId,identifier(input.previewId));
      check(preview?.kind === 'preview' && preview.draftId === value.id && preview.revision === value.revision && preview.payload.reportHash === input.reportHash,'stale_preview','Die Endfreigabe benötigt die aktuelle gebundene Vorschau.',409);
      const result = await composed(context,value);
      check(result.report.reportHash === preview.payload.reportHash,'stale_preview','Seit der Vorschau wurde eine gebundene Datei oder Grundlage verändert.',409);
      check(result.report.technicalReady,'open_content','Vor der Endfreigabe sind noch Fachabschnitte oder bereitgestellte Dateien offen.',409,{findings:result.report.findings});
      fields(input.review,['texts','images','layout']);
      check(Object.keys(input.review).length === 3 && Object.values(input.review).every(value => value === true),'review_required','Fachtexte, Bilder und gesamte Darstellung müssen menschlich geprüft und bestätigt sein.');
      check(Array.isArray(input.missingAltAcknowledged),'alt_acknowledgement_required','Die noch fehlenden Alternativtexte müssen ausdrücklich bestätigt werden.');
      const missing = result.report.findings.filter(value => value.code === 'alt_missing').map(value => value.id).sort();
      check(fingerprint([...input.missingAltAcknowledged].sort()) === fingerprint(missing),'alt_acknowledgement_required','Die Liste der bewusst noch offenen Alternativtexte stimmt nicht mit dieser Vorschau überein.');
      const body = { revision:value.revision,contentHash:result.report.contentHash,imagesHash:result.report.imagesHash,reportHash:result.report.reportHash,previewHash:result.report.previewHash,review:clone(input.review),missingAltAcknowledged:missing };
      return repository.recordArtifact({ ...base,draftId:value.id,expectedRevision:value.revision,kind:'approval',payload:{ ...body,approvalHash:fingerprint(body) } });
    },
    async prepareCmsPlan(context,input) {
      fields(input,['draftId','mutationId','expectedRevision','approvalId']);
      const a = await actor(context,'prepare-cms'); publisher(a); online(a); const base = mutation(a,'prepare-cms',input), replay = repository.replay(base); if (replay) return replay;
      const value = draft(a,input), approval = repository.artifact(a.projectId,identifier(input.approvalId));
      check(approval?.kind === 'approval' && approval.draftId === value.id && approval.revision === value.revision,'stale_approval','Für diese Fassung fehlt die menschliche Endfreigabe.',409);
      const result = await composed(context,value);
      check(result.report.technicalReady && approval.payload.reportHash === result.report.reportHash,'stale_approval','Die freigegebenen Texte, Bilder oder Dateien haben sich verändert.',409);
      const target = await newTarget(context,a,result.structure.path);
      const body = { schemaVersion:1,draftId:value.id,revision:value.revision,contentHash:value.contentHash,imagesHash:result.report.imagesHash,approvalHash:approval.payload.approvalHash,
        reportHash:result.report.reportHash,structureHash:result.report.structureHash,structure:result.structure,target,publish:false,automaticRetry:false,
        requiresObservedEditorAdapter:true,steps:[{action:'confirm-new-target',path:target.path,observationId:target.observationId},{action:'create-unpublished-page',title:value.document.title,path:target.path},
          ...result.structure.slots.map((slot,index) => ({action:'insert-observed-editor-block',index,slot})),{action:'save-unpublished'},{action:'readback-and-compare',expectedStructureHash:result.report.structureHash},{action:'record-adapter-receipt'}] };
      return repository.recordArtifact({ ...base,draftId:value.id,expectedRevision:value.revision,kind:'cms-plan',payload:{...body,planHash:fingerprint(body)} });
    },
    async beginCmsAttempt(context,input) {
      fields(input,['draftId','mutationId','expectedRevision','planId']);
      const a = await actor(context,'begin-cms'); publisher(a); online(a); const base = mutation(a,'begin-cms',input), replay = repository.replay(base); if (replay) return replay;
      const value = draft(a,input), plan = repository.artifact(a.projectId,identifier(input.planId));
      check(plan?.kind === 'cms-plan' && plan.draftId === value.id && plan.revision === value.revision && currentApproval(a,value)?.payload.approvalHash === plan.payload.approvalHash,'stale_cms_plan','Der CMS-Plan gehört nicht zur aktuellen Freigabe.',409);
      const current = await composed(context,value); check(current.report.reportHash === plan.payload.reportHash,'stale_cms_plan','Die bereitgestellten Dateien stimmen nicht mehr mit dem Plan überein.',409);
      await newTarget(context,a,plan.payload.target.path);
      return repository.createAttempt({ ...base,draftId:value.id,expectedRevision:value.revision,planId:plan.id });
    },
    async dispatchCmsAttempt(context,input) {
      fields(input,['mutationId','attemptId','expectedStateRevision','dispatchId']);
      const a = await actor(context,'dispatch-cms'); trustedAdapter(a);
      return repository.dispatch({ ...mutation(a,'dispatch-cms',input),attemptId:identifier(input.attemptId),expectedStateRevision:digest(input.expectedStateRevision),dispatchId:identifier(input.dispatchId) });
    },
    async recordCmsOutcome(context,input) {
      fields(input,['attemptId','receipt']);
      const a = await actor(context,'cms-outcome'); trustedAdapter(a); const attempt = repository.attempt(a.projectId,identifier(input.attemptId));
      check(attempt,'cms_attempt_not_found','Dieser CMS-Versuch ist nicht vorhanden.',404);
      const plan = repository.artifact(a.projectId,attempt.planId), receipt = input.receipt;
      fields(receipt,['id','attemptId','planHash','contentHash','imagesHash','status','pageId','path','unpublished','readbackStructureHash','observedAt','reason']);
      identifier(receipt.id); text(receipt.observedAt,80); check(Number.isFinite(Date.parse(receipt.observedAt)),'invalid_receipt','Die CMS-Beobachtungszeit ist ungültig.');
      check(['saved-unpublished','uncertain','failed'].includes(receipt.status) && receipt.attemptId === attempt.id && receipt.planHash === plan.payload.planHash
        && receipt.contentHash === plan.payload.contentHash && receipt.imagesHash === plan.payload.imagesHash && receipt.path === plan.payload.target.path && receipt.unpublished === true,'receipt_binding_mismatch','Die CMS-Quittung ist nicht an den unveröffentlichten Auftrag gebunden.',409);
      if (receipt.reason !== undefined) text(receipt.reason,1000,true);
      if (receipt.status === 'saved-unpublished') { identifier(receipt.pageId); check(receipt.readbackStructureHash === plan.payload.structureHash,'cms_readback_mismatch','Die gespeicherte Seite stimmt nicht mit der freigegebenen Struktur überein.',409); }
      else check(!receipt.pageId || typeof receipt.pageId === 'string','invalid_receipt','Die CMS-Quittung ist ungültig.');
      return repository.recordOutcome({projectId:a.projectId,attemptId:attempt.id,receipt:clone(receipt)});
    },
  };
  return Object.freeze(api);
}
