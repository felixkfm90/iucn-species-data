import { check, fields, identifier, slug, digest, text, fingerprint, clone, normalizeActor, editor, publisher, online } from './contract.mjs';
import { initialDocument, normalizeDocument, normalizeSpeciesSnapshot, normalizeAssetMetadata, editableDocument, emptySectionHash, hasContent } from './model.mjs';
import { composePage, verifyDocumentMedia } from './compose.mjs';
import { isProxy } from 'node:util/types';
import { createCmsReadbackExpectation, verifyCmsReadbackProof } from './cms-readback.mjs';
import { validateCmsTargetObservation } from './cms-dispatch.mjs';
import { assertCmsSaveReadback } from './cms-save-binding.mjs';
import { canRecoverCmsSave } from './repository.mjs';

function visibleCmsAttempt(attempt) {
  if (!attempt) return attempt;
  const view = { ...attempt };
  delete view.saveBinding;
  if (view.receipt?.recovery !== undefined) {
    const { recovery, ...receipt } = view.receipt;
    view.receipt = receipt;
  }
  return view;
}

function requireCmsReceiptData(receipt) {
  check(receipt && typeof receipt === 'object' && !isProxy(receipt)
    && [Object.prototype,null].includes(Object.getPrototypeOf(receipt))
    && Reflect.ownKeys(receipt).every(key=>typeof key === 'string')
    && Object.values(Object.getOwnPropertyDescriptors(receipt)).every(item=>item.enumerable && Object.hasOwn(item,'value')),
  'invalid_receipt','Die CMS-Quittung benötigt vollständige reine Beobachtungsdaten.');
}

/** Authorities and repository are main/server-owned, never renderer-supplied. No method performs CMS I/O. */
export function createPageAuthoringService({ repository, actorAuthority, speciesAuthority, mediaFacade, targetAuthority, now = () => new Date().toISOString() }) {
  check(repository && typeof actorAuthority?.resolve === 'function' && typeof speciesAuthority?.snapshot === 'function'
    && typeof mediaFacade?.describe === 'function' && typeof mediaFacade?.read === 'function', 'authority_required', 'Der Artseitenkern benötigt eingerichtete Projekt- und Medienzuständigkeiten.');
  const actor = async (context, operation) => normalizeActor(await actorAuthority.resolve(context, operation));
  function mutation(a, operation, input) {
    return { projectId: a.projectId, actorId: a.id, mutationId: identifier(input.mutationId), intentHash: fingerprint({ operation, input }) };
  }
  function draft(a,input) { return repository.assertCurrent(a.projectId,identifier(input.draftId),digest(input.expectedRevision)); }
  async function newTarget(context,a,path) {
    online(a);
    check(typeof targetAuthority?.checkNew === 'function', 'target_authority_required', 'Die CMS-Vorbereitung benötigt einen eingerichteten Adapter zur frischen Prüfung des neuen Websiteziels.', 409);
    return validateCmsTargetObservation(await targetAuthority.checkNew(context,path),path,Date.parse(now()));
  }
  async function attachMedia(context,a,document,previous) {
    for (const image of document.images) {
      const prior = previous?.images.find(value => value.id === image.id && value.assetId === image.assetId)?.asset;
      const metadata = normalizeAssetMetadata(await mediaFacade.describe({ ...context, pageSpecies: document.species,
        ...(prior ? { mediaAsset: prior } : {}) },image.assetId),a.projectId);
      check(metadata.id === image.assetId && metadata.mimeType.startsWith('image/'), 'invalid_gallery_media', 'Eine Galerieposition benötigt genau die bereitgestellte Bilddatei.');
      image.asset = metadata;
    }
    return document;
  }
  async function composed(context,value) {
    const verified = await verifyDocumentMedia(value.document,mediaFacade,context); return composePage(value,verified);
  }
  async function currentSpecies(context,a,value) {
    const fresh = normalizeSpeciesSnapshot(await speciesAuthority.snapshot(context,value.document.slug),a.projectId,value.document.slug);
    check(fingerprint(fresh) === fingerprint(value.document.species), 'species_source_changed', 'Die Artgrunddaten oder gebundene Artablage haben sich geändert. Bitte die Artgrundlage ausdrücklich aktualisieren und die neue Vorschau prüfen.', 409);
  }
  async function replayCurrent(context,a,input,base) {
    const replay = repository.replay(base);
    if (replay) {
      const value = repository.read(a.projectId,identifier(input.draftId),digest(input.expectedRevision));
      check(value, 'draft_not_found', 'Die gebundene Artseitenfassung ist nicht vorhanden.', 404);
      await currentSpecies(context,a,value);
    }
    return replay;
  }
  function currentApproval(a,value) { return repository.latestArtifact(a.projectId,value.id,'approval',value.revision); }
  function trustedAdapter(a,{allowOffline=false}={}) { publisher(a); if(!allowOffline)online(a); check(a.channel === 'cms-adapter','trusted_adapter_required','CMS-Ausführungsquittungen dürfen nur vom eingerichteten Ausführungsadapter stammen.',403); }
  function readbackPlan(value, plan) {
    check(plan?.payload?.schemaVersion === 2 && plan.payload.readback?.schemaVersion === 1,
      'cms_readback_required','Der CMS-Plan benötigt zuerst den vollständigen Rücklesevertrag. Bitte Vorschau, Freigabe und Plan neu erstellen.',409);
    fields(plan.payload.readback,['schemaVersion','expectation','expectationHash']);
    const expected = createCmsReadbackExpectation(value.document,plan.payload.structure), hash = fingerprint(expected);
    const {planHash,...body}=plan.payload;
    check(planHash === fingerprint(body) && plan.payload.readback.expectationHash === hash
      && fingerprint(plan.payload.readback.expectation) === hash,
    'stale_cms_plan','Die gespeicherte Rückleseerwartung gehört nicht mehr zur vollständigen Seitenfassung.',409);
    return expected;
  }
  function verifiedCmsReceipt(value, plan, attempt, receipt) {
    check(receipt.schemaVersion === 2,'cms_readback_required','Ein passender Hash allein bestätigt keine gespeicherte Seite. Die tatsächliche Rücklesebeobachtung und Bildzuordnung fehlen.',409);
    const required=['schemaVersion','id','attemptId','planHash','contentHash','imagesHash','status','pageId','path','unpublished','observedAt','readback','mediaBindings'];
    fields(receipt,[...required,'reason']);
    check(Reflect.ownKeys(receipt).length === required.length + Number(Object.hasOwn(receipt,'reason'))
      && required.every(key=>Object.hasOwn(receipt,key)),'invalid_receipt','Die CMS-Beobachtungsquittung ist unvollständig oder enthält ungeprüfte Hashwerte.');
    identifier(receipt.id); text(receipt.observedAt,80);
    check(Number.isFinite(Date.parse(receipt.observedAt)),'invalid_receipt','Die CMS-Beobachtungszeit ist ungültig.');
    check(['saved-unpublished','uncertain','failed'].includes(receipt.status) && receipt.attemptId === attempt.id && receipt.planHash === plan.payload.planHash
      && receipt.contentHash === plan.payload.contentHash && receipt.imagesHash === plan.payload.imagesHash && receipt.path === plan.payload.target.path,
    'receipt_binding_mismatch','Die CMS-Beobachtung gehört nicht zum gebundenen unveröffentlichten Auftrag.',409);
    if (receipt.reason !== undefined) text(receipt.reason,1000,true);
    const expected=readbackPlan(value,plan);
    let readbackStructureHash=null,mediaBindingsHash=null;
    if (receipt.readback !== null) {
      identifier(receipt.pageId);
      check(receipt.unpublished === true && receipt.pageId === receipt.readback?.page?.id,
        'cms_readback_mismatch','Seitenkennung oder unveröffentlichter Zustand wurde nicht passend beobachtet.',409);
      const proof=verifyCmsReadbackProof({document:value.document,structure:plan.payload.structure,expected,observation:receipt.readback,mediaBindings:receipt.mediaBindings});
      if (attempt.saveBinding) assertCmsSaveReadback(attempt.saveBinding, receipt.readback, receipt.mediaBindings);
      readbackStructureHash=proof.observationHash;mediaBindingsHash=proof.mediaBindingsHash;
    } else check(receipt.status !== 'saved-unpublished' && receipt.pageId === null && receipt.unpublished === null
      && !isProxy(receipt.mediaBindings) && Array.isArray(receipt.mediaBindings)
      && Object.getPrototypeOf(receipt.mediaBindings) === Array.prototype
      && Reflect.ownKeys(receipt.mediaBindings).length === 1 && receipt.mediaBindings.length === 0,
    'cms_readback_required','Eine unbestätigte Rücklesung bleibt ausdrücklich offen; halbe Erfolgsbelege sind nicht zulässig.',409);
    return {...clone(receipt),readbackStructureHash,mediaBindingsHash};
  }
  const api = {
    async createDraft(context,input) {
      fields(input,['draftId','mutationId','templateId','slug','parentPath','title']);
      const a = await actor(context,'create'); editor(a); online(a); const base = mutation(a,'create',input), replay = repository.replay(base); if (replay) return replay;
      const species = normalizeSpeciesSnapshot(await speciesAuthority.snapshot(context,slug(input.slug)),a.projectId,input.slug);
      const document = initialDocument({ templateId: input.templateId, species, parentPath: input.parentPath, ...(input.title === undefined ? {} : { title: input.title }) });
      return repository.commit({ ...base,id:identifier(input.draftId),create:true,document });
    },
    async getDraft(context,draftId) {
      const a = await actor(context,'read'), value = repository.read(a.projectId,identifier(draftId));
      check(value,'draft_not_found','Dieser Artseitenentwurf ist nicht vorhanden.',404);
      const approval = currentApproval(a,value), attempt = repository.attemptForDraft(a.projectId,value.id);
      const cms = attempt && { ...visibleCmsAttempt(attempt), matchesCurrentRevision: attempt.revision === value.revision,
        canReplacePrepared: a.online && ['admin', 'publisher'].includes(a.role)
          && repository.canReplacePrepared(a.projectId, attempt, value.revision, a.id),
        canRecheckSave: a.online && ['admin', 'publisher'].includes(a.role) && attempt.actorId === a.id
          && attempt.revision === value.revision && canRecoverCmsSave(attempt) };
      return { draft:value,editable:editableDocument(value.document),approval,cms,published:false };
    },
    async saveDraft(context,input) {
      fields(input,['draftId','mutationId','expectedRevision','document']);
      const a = await actor(context,'save'); editor(a); const base = mutation(a,'save',input), replay = repository.replay(base); if (replay) return replay;
      const prior = draft(a,input), document = normalizeDocument(input.document,{ species:prior.document.species,previous:prior.document });
      // A pre-existing offline draft can retain already managed images. The authority remains responsible for local metadata access.
      await attachMedia(context,a,document,prior.document);
      return repository.commit({ ...base,id:prior.id,expectedRevision:prior.revision,document });
    },
    async refreshSpecies(context,input) {
      fields(input,['draftId','mutationId','expectedRevision']);
      const a = await actor(context,'refresh-species'); editor(a); online(a);
      const base = mutation(a,'refresh-species',input), replay = repository.replay(base); if (replay) return replay;
      const prior = draft(a,input), species = normalizeSpeciesSnapshot(await speciesAuthority.snapshot(context,prior.document.slug),a.projectId,prior.document.slug);
      const document = { ...clone(prior.document),species };
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
      const a = await actor(context,'approve'); publisher(a); online(a); const base = mutation(a,'approve',input), replay = await replayCurrent(context,a,input,base); if (replay) return replay;
      const value = draft(a,input), preview = repository.artifact(a.projectId,identifier(input.previewId));
      check(preview?.kind === 'preview' && preview.draftId === value.id && preview.revision === value.revision && preview.payload.reportHash === input.reportHash,'stale_preview','Die Endfreigabe benötigt die aktuelle gebundene Vorschau.',409);
      const result = await composed(context,value);
      await currentSpecies(context,a,value);
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
      const a = await actor(context,'prepare-cms'); publisher(a); online(a); const base = mutation(a,'prepare-cms',input), replay = await replayCurrent(context,a,input,base); if (replay) return replay;
      const value = draft(a,input), approval = repository.artifact(a.projectId,identifier(input.approvalId));
      check(approval?.kind === 'approval' && approval.draftId === value.id && approval.revision === value.revision,'stale_approval','Für diese Fassung fehlt die menschliche Endfreigabe.',409);
      const result = await composed(context,value);
      await currentSpecies(context,a,value);
      check(result.report.technicalReady && approval.payload.reportHash === result.report.reportHash,'stale_approval','Die freigegebenen Texte, Bilder oder Dateien haben sich verändert.',409);
      const target = await newTarget(context,a,result.structure.path);
      await currentSpecies(context,a,value);
      const expectation = createCmsReadbackExpectation(value.document,result.structure);
      const readback = {schemaVersion:1,expectation,expectationHash:fingerprint(expectation)};
      const body = { schemaVersion:2,draftId:value.id,revision:value.revision,contentHash:value.contentHash,imagesHash:result.report.imagesHash,approvalHash:approval.payload.approvalHash,
        reportHash:result.report.reportHash,structureHash:result.report.structureHash,structure:result.structure,target,publish:false,automaticRetry:false,
        readback,
        requiresObservedEditorAdapter:true,steps:[{action:'confirm-new-target',path:target.path,observationId:target.observationId},{action:'create-unpublished-page',title:value.document.title,path:target.path},
          ...result.structure.slots.map((slot,index) => ({action:'insert-observed-editor-block',index,slot})),{action:'save-unpublished'},{action:'readback-and-compare',expectedStructureHash:result.report.structureHash,expectedReadbackHash:readback.expectationHash},{action:'record-adapter-receipt'}] };
      return repository.recordArtifact({ ...base,draftId:value.id,expectedRevision:value.revision,kind:'cms-plan',payload:{...body,planHash:fingerprint(body)} });
    },
    async beginCmsAttempt(context,input) {
      fields(input,['draftId','mutationId','expectedRevision','planId']);
      const a = await actor(context,'begin-cms'); publisher(a); online(a); const base = mutation(a,'begin-cms',input), replay = await replayCurrent(context,a,input,base); if (replay) return replay;
      const value = draft(a,input), plan = repository.artifact(a.projectId,identifier(input.planId));
      check(plan?.kind === 'cms-plan' && plan.draftId === value.id && plan.revision === value.revision && currentApproval(a,value)?.payload.approvalHash === plan.payload.approvalHash,'stale_cms_plan','Der CMS-Plan gehört nicht zur aktuellen Freigabe.',409);
      const current = await composed(context,value); check(current.report.reportHash === plan.payload.reportHash,'stale_cms_plan','Die bereitgestellten Dateien stimmen nicht mehr mit dem Plan überein.',409);
      readbackPlan(value,plan);
      await currentSpecies(context,a,value);
      await newTarget(context,a,plan.payload.target.path);
      await currentSpecies(context,a,value);
      return repository.createAttempt({ ...base,draftId:value.id,expectedRevision:value.revision,planId:plan.id });
    },
    async dispatchCmsAttempt(context,input) {
      fields(input,['mutationId','attemptId','expectedStateRevision','dispatchId']);
      const a = await actor(context,'dispatch-cms'); trustedAdapter(a);
      const request = { ...mutation(a,'dispatch-cms',input),attemptId:identifier(input.attemptId),expectedStateRevision:digest(input.expectedStateRevision),dispatchId:identifier(input.dispatchId) };
      const replay = repository.replay(request); if (replay) return replay;
      const attempt = repository.attempt(a.projectId,request.attemptId);
      check(attempt && attempt.actorId === a.id,'cms_attempt_not_found','Dieser CMS-Auftrag gehört nicht zu diesem Ausführungskontext.',404);
      const value = draft(a,{draftId:attempt.draftId,expectedRevision:attempt.revision}), plan = repository.artifact(a.projectId,attempt.planId);
      const structureHash = composePage(value,new Map()).report.structureHash;
      check(plan?.kind === 'cms-plan' && plan.draftId === value.id && plan.revision === value.revision
        && currentApproval(a,value)?.payload.approvalHash === plan.payload.approvalHash
        && plan.payload.structureHash === structureHash && fingerprint(plan.payload.structure) === structureHash,
      'stale_cms_plan','Der vorbereitete CMS-Plan enthält nicht mehr die vollständige aktuelle Seitenstruktur. Bitte Vorschau und Freigabe erneuern.',409);
      readbackPlan(value,plan);
      const verified=await composed(context,value);
      check(verified.report.technicalReady&&verified.report.reportHash===plan.payload.reportHash,
        'stale_cms_plan','Die freigegebenen Dateien sind vor dem Schreibbeginn nicht mehr unverändert bestätigt. Bitte Vorschau und Freigabe erneuern.',409);
      await currentSpecies(context,a,value);
      return repository.dispatch(request);
    },
    async recordCmsSaveBinding(context,input) {
      fields(input,['attemptId','expectedStateRevision','binding']);
      const a = await actor(context,'cms-save-binding'); trustedAdapter(a);
      return repository.recordCmsSaveBinding({ projectId:a.projectId,actorId:a.id,attemptId:identifier(input.attemptId),
        expectedStateRevision:digest(input.expectedStateRevision),binding:input.binding });
    },
    async recordRecoveredCmsOutcome(context,input) {
      fields(input,['attemptId','expectedStateRevision','receipt']);
      const a = await actor(context,'cms-recovery-outcome'); trustedAdapter(a);
      const attemptId=identifier(input.attemptId),expectedStateRevision=digest(input.expectedStateRevision);
      const attempt=repository.attempt(a.projectId,attemptId);
      check(attempt && attempt.actorId === a.id,'cms_attempt_not_found','Dieser CMS-Versuch gehört nicht zu diesem Ausführungskontext.',404);
      const value=repository.assertCurrent(a.projectId,attempt.draftId,attempt.revision);
      check(attempt.stateRevision === expectedStateRevision && canRecoverCmsSave(attempt),'cms_recovery_unavailable',
        'Dieser CMS-Auftrag kann nicht mehr durch eine lesende Nachprüfung abgeschlossen werden.',409);
      const plan=repository.artifact(a.projectId,attempt.planId);
      check(plan?.kind === 'cms-plan' && plan.draftId === value.id && plan.revision === value.revision && plan.payload.schemaVersion === 2,
        'stale_cms_plan','Die Speicherbindung gehört zu keinem passenden aktuellen CMS-Plan.',409);
      const receipt=input.receipt;
      requireCmsReceiptData(receipt);
      check(receipt.status === 'saved-unpublished','invalid_receipt','Die lesende CMS-Nachprüfung benötigt eine vollständige Erfolgsquittung.',409);
      const outcome=repository.recordRecoveredCmsOutcome({projectId:a.projectId,actorId:a.id,attemptId,expectedStateRevision,
        receipt:verifiedCmsReceipt(value,plan,attempt,receipt)});
      return { ...outcome,attempt:visibleCmsAttempt(outcome.attempt) };
    },
    async recordCmsOutcome(context,input) {
      fields(input,['attemptId','receipt']);
      const a = await actor(context,'cms-outcome'); trustedAdapter(a,{allowOffline:true}); const attempt = repository.attempt(a.projectId,identifier(input.attemptId));
      check(attempt,'cms_attempt_not_found','Dieser CMS-Versuch ist nicht vorhanden.',404);
      check(attempt.actorId === a.id,'cms_attempt_not_found','Dieser CMS-Versuch gehört zu einer anderen persönlichen Ausführung.',404);
      const plan = repository.artifact(a.projectId,attempt.planId), receipt = input.receipt;
      requireCmsReceiptData(receipt);
      if(!a.online)check(receipt.schemaVersion===2&&receipt.status==='uncertain'&&receipt.readback===null,
        'online_required','Offline darf ausschließlich ein ungewisser lokaler Ausgang ohne Erfolgsnachweis gespeichert werden.',409);
      if (plan.payload.schemaVersion === 2) {
        const value=repository.read(a.projectId,attempt.draftId,attempt.revision);
        const outcome = repository.recordOutcome({projectId:a.projectId,attemptId:attempt.id,receipt:verifiedCmsReceipt(value,plan,attempt,receipt)});
        return { ...outcome, attempt: visibleCmsAttempt(outcome.attempt) };
      }
      fields(receipt,['id','attemptId','planHash','contentHash','imagesHash','status','pageId','path','unpublished','readbackStructureHash','observedAt','reason']);
      identifier(receipt.id); text(receipt.observedAt,80); check(Number.isFinite(Date.parse(receipt.observedAt)),'invalid_receipt','Die CMS-Beobachtungszeit ist ungültig.');
      check(['saved-unpublished','uncertain','failed'].includes(receipt.status) && receipt.attemptId === attempt.id && receipt.planHash === plan.payload.planHash
        && receipt.contentHash === plan.payload.contentHash && receipt.imagesHash === plan.payload.imagesHash && receipt.path === plan.payload.target.path && receipt.unpublished === true,'receipt_binding_mismatch','Die CMS-Quittung ist nicht an den unveröffentlichten Auftrag gebunden.',409);
      if (receipt.reason !== undefined) text(receipt.reason,1000,true);
      if (receipt.status === 'saved-unpublished') {
        identifier(receipt.pageId); check(receipt.readbackStructureHash === plan.payload.structureHash,'cms_readback_mismatch','Die gespeicherte Seite stimmt nicht mit der freigegebenen Struktur überein.',409);
        check(repository.hasCmsReceipt?.(a.projectId,attempt.id,receipt.id,fingerprint(receipt)) === true,
          'cms_readback_required','Ein alter Hashbeleg darf nur als bereits gespeicherte Historie gelesen werden. Ein neuer Erfolg benötigt vollständige Rücklesedaten.',409);
      }
      else {
        check(receipt.pageId === null || receipt.pageId === undefined || receipt.pageId === '' || typeof receipt.pageId === 'string','invalid_receipt','Die CMS-Quittung ist ungültig.');
        if (receipt.pageId) identifier(receipt.pageId);
        check(receipt.readbackStructureHash === undefined || receipt.readbackStructureHash === ''
          || typeof receipt.readbackStructureHash === 'string' && /^[a-f0-9]{64}$/.test(receipt.readbackStructureHash),
        'invalid_receipt','Ein alter unbestätigter CMS-Beleg benötigt einen begrenzten Prüfwert.');
      }
      return repository.recordOutcome({projectId:a.projectId,attemptId:attempt.id,receipt:clone(receipt)});
    },
  };
  return Object.freeze(api);
}
