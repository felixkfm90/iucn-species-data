import { randomUUID } from 'node:crypto';
import { createPageAuthoringService } from './service.mjs';
import { createSharedPageDraftAdapter } from './shared-adapter.mjs';
import { encodePageAuthoringDraft,importPageAuthoringAsDraft,validateStoredDocument,validatePageAuthoringObject,pageAuthoringObjectId,PAGE_AUTHORING_TYPE } from './shared.mjs';
import { normalizeSpeciesSnapshot } from './model.mjs';
import { check,clone,fields,digest,identifier,fingerprint,sha256,normalizeActor,PageAuthoringError } from './contract.mjs';
import { canonicalJson } from '../shared-project/security.mjs';
import { validateEditorialSourceBindings } from '../shared-project/species-editorial-intent.mjs';
import { createExplorerCmsExecution } from './explorer-cms.mjs';

const missing = error => error?.status===404 || error?.statusCode===404 || ['not_found','object_not_found','shared_page_missing'].includes(error?.code);
const errorCode = error => /^[a-zA-Z0-9_-]{1,100}$/.test(error?.code||'') ? error.code : 'shared_page_unavailable';
const assets = document => [...Object.values(document.species.normalAssets).filter(Boolean),...document.images.map(image=>image.asset)];
const READER_PREVIEW_TTL=10*60*1000,READER_PREVIEW_LIMIT=64,writers=['admin','publisher','contributor'];
const copyEditorial=value=>JSON.parse(canonicalJson(value,{maxBytes:2*1024*1024,maxNodes:300000}));

/** One core journal, the existing client queue and borrowed CMS browser. No publication or automatic network retry. */
export function createExplorerPageWorkspace({withClient,repository,speciesAuthority,mediaFacade,targetAuthority=null,cmsAdapter=null,now=()=>new Date().toISOString(),clock=Date.now,tokenId=randomUUID}={}) {
  check(typeof withClient==='function' && typeof repository?.scoped==='function' && typeof repository?.backupProjectIds==='function' && typeof speciesAuthority?.snapshot==='function'
    && typeof mediaFacade?.describe==='function' && typeof mediaFacade?.read==='function' && typeof clock==='function' && typeof tokenId==='function','workspace_required','Der Artseitenarbeitsbereich ist nicht vollständig eingerichtet.');
  let closed=false,closing=null;const pending=new Set(),readerPreviews=new Map();
  function usingClient(operation) {
    if(closed)return Promise.reject(new PageAuthoringError(409,'workspace_closed','Der Artseitenarbeitsbereich ist geschlossen.'));
    const task=Promise.resolve().then(()=>withClient(operation));pending.add(task);
    void task.finally(()=>pending.delete(task)).catch(()=>{});return task;
  }
  function setup(client,state,{trustedCms=false}={}) {
    check(state.permissions?.canRead===true && state.permissions.canEdit===true,'forbidden','Der Artseiten-Redaktionsbereich benötigt eine wirksame Bearbeitungsberechtigung. Freigegebene Arten stehen im Nachschlagewerk bereit.',403);
    const status=state.status,a=normalizeActor({id:status.user?.id,projectId:status.projectId,role:status.user?.role,online:status.connection==='online',
      ...(trustedCms?{channel:'cms-adapter'}:{})});
    const origin=status.baseUrl,sourceScope=fingerprint([origin,a.projectId,a.id]),repo=repository.scoped({origin,actorId:a.id});
    const context={client,state,actor:a,sourceScope},actorAuthority={resolve:async()=>a},shared=createSharedPageDraftAdapter({client,actorAuthority});
    function core(id) {
      const known=repo.workspaceLink(a.projectId,id)?.binding.confirmedObject;
      const confirmed=new Map(known ? assets(known.data.document).map(asset=>[asset.id,asset]) : []);
      const facade={read:(context,assetId)=>mediaFacade.read(context,assetId),async describe(context,assetId) {
        let metadata;
        try {metadata=await mediaFacade.describe(context,assetId);}catch(error){if(!confirmed.has(assetId))throw error;metadata=clone(confirmed.get(assetId));}
        const previous=confirmed.get(assetId);
        if(!previous || fingerprint(previous)!==fingerprint(metadata)) {
          const bytes=await mediaFacade.read(context,assetId);
          check((Buffer.isBuffer(bytes)||bytes instanceof Uint8Array) && bytes.byteLength===metadata.bytes && sha256(bytes)===metadata.sha256,
            'local_media_required','Neue oder geänderte Bilder müssen vor dem Speichern vollständig lokal bereitstehen.',409);
        }
        return metadata;
      }};
      return createPageAuthoringService({repository:repo,actorAuthority,speciesAuthority,mediaFacade:facade,targetAuthority,now});
    }
    return {client,state,a,origin,sourceScope,repo,context,shared,core};
  }
  function inputFor(env,input) {
    check(input?.sourceScope===env.sourceScope,'workspace_changed','Person oder Projektadresse hat sich geändert. Eigene Eingaben bleiben erhalten.',409);
    const {sourceScope,...body}=input;return body;
  }
  function initial(env,id) {return {origin:env.origin,actorId:env.a.id,projectId:env.a.projectId,draftId:id,baseLocalRevision:null,
    remoteRevision:null,remoteDataHash:null,remoteObject:null,confirmedObject:null,frameLocalRevision:null,frameHash:null,approvalId:null,state:'unlinked',errorCode:null};}
  function update(env,id,link,changes) {
    return env.repo.putWorkspaceLink({projectId:env.a.projectId,draftId:id,expectedBindingRevision:link?.bindingRevision??null,
      binding:{...(link?.binding||initial(env,id)),...changes}});
  }
  async function readRemote(env,id,serverOnly=false) {try{return await env.shared.read(env.context,id,{serverOnly});}catch(error){if(missing(error))return null;throw error;}}
  function frame(env,value,link,approvalId=null) {
    const baseline=link?.binding.remoteObject?.data;
    const history=baseline?importPageAuthoringAsDraft(baseline).history:[];
    const approval=approvalId?env.repo.artifact(env.a.projectId,approvalId):null;
    check(!approvalId || approval?.kind==='approval' && approval.revision===value.revision,'stale_approval','Die vorbereitete interne Freigabe passt nicht zur lokalen Fassung.',409);
    return encodePageAuthoringDraft(value,{history,approval:approval?.payload||null,adoptUnlinkedApprovals:Boolean(approval)});
  }
  async function view(env,id,extra={}) {
    const value=env.repo.read(env.a.projectId,id),link=env.repo.workspaceLink(env.a.projectId,id);
    const local=value?await env.core(id).getDraft(env.context,id):null;
    const cms=local?.cms ? { ...local.cms, canRecheckSave: local.cms.canRecheckSave===true
      && typeof cmsAdapter?.recheckUnpublishedPage==='function' } : null;
    const documentChanged=Boolean(value && value.contentHash!==link?.binding.confirmedObject?.data.contentHash);
    const dirty=Boolean(value && (value.revision!==link?.binding.baseLocalRevision || documentChanged));
    return {source:'shared-project',sourceScope:env.sourceScope,connection:env.state.status.connection,draft:local?.draft||null,
      editable:local?.editable||null,approval:local?.approval||null,cms,published:false,externalPublication:'not-performed',
      sync:{state:link?.binding.state==='synced' && dirty?'local-only':link?.binding.state||'unlinked',bindingRevision:link?.bindingRevision||null,
        localRevision:value?.revision||null,remoteRevision:link?.binding.remoteRevision||null,localPending:dirty||Boolean(link?.binding.frameLocalRevision),
        coveredLocalRevision:link?.binding.baseLocalRevision||null,queuedLocalRevision:link?.binding.frameLocalRevision||null,
        hasNewerLocalChanges:Boolean(value && (value.revision!==(link?.binding.frameLocalRevision||link?.binding.baseLocalRevision)
          || !link?.binding.frameLocalRevision && documentChanged)),
        localConflict:link?.binding.state==='conflict',errorCode:link?.binding.errorCode||null,
        sharedApprovalConfirmed:Boolean(local?.approval && link?.binding.confirmedObject?.pageAuthoringEvidence?.trusted
          && link.binding.confirmedObject.data.approval?.approvalHash===local.approval.payload.approvalHash)},
      externalEvidence:link?.binding.confirmedObject?.pageAuthoringEvidence||null,
      remote:link?.binding.confirmedObject||null,...extra};
  }
  function bindRemote(env,id,link,remote,localRevision,frameHash,approvalId) {
    const object={...remote.object,pageAuthoringEvidence:remote.evidence};
    return update(env,id,link,{remoteObject:object,remoteRevision:remote.object.revision,remoteDataHash:fingerprint(remote.data),
      confirmedObject:remote.localPending?link?.binding.confirmedObject||null:object,baseLocalRevision:localRevision,
      frameLocalRevision:remote.localPending?localRevision:null,frameHash:remote.localPending?frameHash:null,
      approvalId:remote.localPending?approvalId:null,state:remote.localConflict?'conflict':remote.localPending?'queued':'synced',errorCode:null});
  }
  async function stage(env,id,value,approvalId=null) {
    let link=env.repo.workspaceLink(env.a.projectId,id);
    check(link?.binding.remoteObject,'shared_page_unlinked','Der lokale Entwurf besitzt noch keine bestätigte gemeinsame Ausgangsfassung.',409);
    const data=frame(env,value,link,approvalId),hash=fingerprint(data);
    link=update(env,id,link,{state:'queueing',frameLocalRevision:value.revision,frameHash:hash,approvalId,errorCode:null});
    try {
      let current=await readRemote(env,id);
      check(current && !current.localConflict,'shared_page_conflict','Der gemeinsame Entwurf besitzt einen offenen Konflikt.',409);
      const actual=fingerprint(current.data);
      if(actual!==hash) {
        check(current.object.revision===link.binding.remoteRevision && actual===link.binding.remoteDataHash,'shared_page_conflict','Die gemeinsame Ausgangsfassung wurde geändert. Beide Fassungen bleiben erhalten.',409);
        current=await env.shared.queue(env.context,{pageId:id,data,expectedObjectRevision:current.object.revision,expectedDataHash:actual});
      }
      bindRemote(env,id,link,current,value.revision,hash,approvalId);
    } catch(error) {
      update(env,id,link,{state:error?.code==='shared_page_conflict'?'conflict':'local-only',errorCode:errorCode(error)});
    }
  }
  async function createRemote(env,id,value,link) {
    const data=frame(env,value,link),hash=fingerprint(data);
    link=update(env,id,link,{state:'creating',frameLocalRevision:value.revision,frameHash:hash,approvalId:null,errorCode:null});
    try {const remote=await env.shared.create(env.context,value);bindRemote(env,id,link,remote,value.revision,hash,null);}
    catch(error){update(env,id,link,{state:'uncertain',errorCode:errorCode(error)});}
  }
  async function saved(env,operation,input) {
    const body=inputFor(env,input),id=identifier(body.draftId),result=await env.core(id)[operation](env.context,body);
    const targetRevision=result.draft?.revision||result.artifact?.revision,value=env.repo.read(env.a.projectId,id,targetRevision),head=env.repo.read(env.a.projectId,id);
    if(result.idempotentReplay || result.unchanged || head.revision!==value.revision)
      return view(env,id,{localSaved:true,result});
    const approvalId=operation==='approve'?result.artifact.id:null;
    try {await stage(env,id,value,approvalId);}catch(error){const link=env.repo.workspaceLink(env.a.projectId,id);update(env,id,link,{state:'local-only',errorCode:errorCode(error)});}
    return view(env,id,{localSaved:true,result});
  }
  function readerActive() {
    check(!closed,'workspace_closed','Der Artseitenarbeitsbereich ist geschlossen.',409);
    const time=clock();check(Number.isFinite(time),'invalid_clock','Die Übernahmevorschau konnte zeitlich nicht gebunden werden.',500);
    for(const [token,preview] of readerPreviews)if(time>=preview.deadline||time<preview.createdAt)readerPreviews.delete(token);
    return time;
  }
  function readerAuthority(env,status=env.state.status) {
    check(env.state.permissions?.canRead===true && env.state.permissions.canEdit===true && env.state.editMode!==false && status.readOnlySession===false
      && writers.includes(status.user?.role),'forbidden','Die Artübernahme benötigt eine volle persönliche Redaktionsanmeldung.',403);
    check(status.connection==='online','online_required','Die Artübernahme benötigt eine bestätigte Onlineverbindung.',409);
    return fingerprint({origin:status.baseUrl,projectId:status.projectId,actorId:status.user.id,role:status.user.role,
      userVersion:status.user.version??null,permissions:env.state.permissions});
  }
  async function readerCurrent(env,authority) {
    readerActive();const status=await env.client.status();readerActive();
    check(readerAuthority(env,status)===authority,'workspace_changed','Person, Projekt oder Berechtigung wurde während der Artübernahme geändert. Bitte erneut prüfen.',409);
  }
  function readerBasis(env,id,expectedRevision,expectedBindingRevision) {
    readerActive();const value=env.repo.read(env.a.projectId,id),link=env.repo.workspaceLink(env.a.projectId,id);
    check(value,'draft_not_found','Dieser persönliche Seitenentwurf ist nicht vorhanden.',404);
    validateStoredDocument(value.document);
    check(value.id===id && value.projectId===env.a.projectId && value.actorId===env.a.id && value.current===true
      && value.revision===fingerprint({projectId:env.a.projectId,id,sequence:value.sequence,parent:value.parentRevision,bodyHash:value.contentHash,actorId:env.a.id}),
      'invalid_draft_source','Die persönliche Seitenfassung besitzt keine unveränderte eigene Quellenbindung.',409);
    check(value.revision===expectedRevision,'draft_conflict','Der Seitenentwurf wurde seit der Anzeige geändert. Bitte zuerst speichern und abgleichen.',409);
    check(link?.bindingRevision===expectedBindingRevision,'workspace_conflict','Die gemeinsame Seitenbasis wurde inzwischen geändert. Bitte erneut prüfen.',409);
    const binding=link.binding,confirmed=binding.confirmedObject;
    check(binding.state==='synced' && binding.baseLocalRevision===value.revision && !binding.frameLocalRevision && !binding.frameHash
      && confirmed && !confirmed.localPending && !confirmed.localConflict,'shared_page_unconfirmed',
      'Die Artübernahme benötigt eine vollständig gemeinsam bestätigte Seitenfassung ohne offene lokale Änderungen oder Konflikte.',409);
    validatePageAuthoringObject(confirmed.data,confirmed.id);
    check(confirmed.kind==='page' && confirmed.id===pageAuthoringObjectId(id) && confirmed.revision===binding.remoteRevision
      && binding.remoteObject?.revision===confirmed.revision && fingerprint(confirmed.data)===binding.remoteDataHash
      && fingerprint(binding.remoteObject.data)===binding.remoteDataHash && value.contentHash===fingerprint(value.document)
      && confirmed.data.contentHash===value.contentHash && fingerprint(confirmed.data.document)===value.contentHash,
      'shared_page_unconfirmed','Die lokale Seite entspricht nicht exakt der gemeinsam bestätigten Fassung. Bitte ausdrücklich abgleichen.',409);
    return {draftId:id,revision:value.revision,bindingRevision:link.bindingRevision,speciesId:value.document.slug,
      page:{objectId:confirmed.id,objectRevision:confirmed.revision,dataRevision:confirmed.data.revision,
        contentHash:confirmed.data.contentHash,imagesHash:confirmed.data.imagesHash,dataHash:binding.remoteDataHash}};
  }
  async function readerCheck(env,basis,authority) {
    await readerCurrent(env,authority);
    const actual=readerBasis(env,basis.draftId,basis.revision,basis.bindingRevision);
    check(fingerprint(actual)===fingerprint(basis),'workspace_conflict','Die bestätigte Seitenbasis wurde während der Übernahme geändert.',409);
  }
  function conflictBasis(env,id,body) {
    check(!closed,'workspace_closed','Der Artseitenarbeitsbereich ist geschlossen.',409);
    check(env.a.online && env.state.status.readOnlySession===false,'online_required','Die Konfliktfassung benötigt eine volle Online-Anmeldung.',409);
    const old=env.repo.read(env.a.projectId,id),link=env.repo.workspaceLink(env.a.projectId,id);
    check(old?.revision===digest(body.expectedRevision) && link?.bindingRevision===digest(body.expectedBindingRevision)
      && link.binding.state==='conflict','workspace_conflict','Der persönliche Entwurf oder seine Konfliktbasis wurde geändert. Bitte erneut vergleichen.',409);
    return {old,link};
  }
  async function conflictAuthority(env) {
    const status=await env.client.status();
    check(!closed && status.connection==='online' && !status.readOnlySession && status.baseUrl===env.origin && status.projectId===env.a.projectId
      && status.user?.id===env.a.id && status.user.role===env.a.role && status.user.version===env.state.status.user?.version,
      'workspace_changed','Die Projektanmeldung wurde während des Vergleichs geändert.',409);
  }
  async function conflictRemote(env,id,body) {
    conflictBasis(env,id,body);
    await env.client.refresh();const remote=await readRemote(env,id,true);await conflictAuthority(env);
    check(remote,'shared_page_missing','Die aktuelle gemeinsame Seite ist nicht verfügbar.',409);
    const basis=conflictBasis(env,id,body);
    check(remote.data.document.slug===basis.old.document.slug,'draft_identity_changed','Die gemeinsame Fassung ist inzwischen einer anderen Art zugeordnet.',409);
    return {...basis,remote};
  }
  function checkReviewedConflictPage(body,remote) {
    check(!remote.localPending && !remote.localConflict,'shared_page_conflict','Bitte zuerst den offenen Konflikt unter Gemeinsames Projekt entscheiden.',409);
    check(remote.object.revision===identifier(body.serverRevision) && fingerprint(remote.data)===digest(body.serverDataHash),
      'workspace_conflict','Die gemeinsame Fassung wurde seit dem Vergleich erneut geändert. Bitte neu vergleichen.',409);
  }
  async function importRemote(env,id,body,{old,link,remote,forceRevision=false,cached=false}) {
    const imported=importPageAuthoringAsDraft(remote.data),document=clone(imported.document);
    // Offline the exact embedded snapshot is part of the reviewed cached server revision.
    if(!cached)document.species=normalizeSpeciesSnapshot(await speciesAuthority.snapshot(env.context,document.slug),env.a.projectId,document.slug);
    validateStoredDocument(document);
    if(forceRevision) {
      const latest=await conflictRemote(env,id,body);
      checkReviewedConflictPage(body,latest.remote);
      remote=latest.remote;
    }
    const object={...remote.object,pageAuthoringEvidence:remote.evidence};
    const binding={...initial(env,id),remoteObject:object,confirmedObject:object,remoteRevision:remote.object.revision,
      remoteDataHash:fingerprint(remote.data),state:fingerprint(document)===remote.data.contentHash?'synced':'local-only'};
    env.repo.commit({projectId:env.a.projectId,actorId:env.a.id,id,create:!old,expectedRevision:old?.revision,mutationId:identifier(body.mutationId),
      intentHash:fingerprint({operation:forceRevision?'workspace-conflict-import':'workspace-import',input:body,remoteRevision:remote.object.revision,remoteHash:binding.remoteDataHash}),
      document,forceRevision,workspace:{expectedBindingRevision:link?.bindingRevision??null,binding}});
    return view(env,id);
  }
  const cmsExecution=createExplorerCmsExecution({withClient,setup,inputFor,view,cmsAdapter,now,mediaFacade,
    assertOpen(){check(!closed,'workspace_closed','Der Artseitenarbeitsbereich ist geschlossen.',409);}});
  return Object.freeze({
    backupProjectIds:async()=>repository.backupProjectIds(),
    cmsBlockingState:()=>cmsExecution.blockingState(),
    beginCmsAttempt:input=>cmsExecution.begin(input),
    createUnpublishedPage:input=>cmsExecution.execute(input),
    recheckSquarespaceSave:input=>cmsExecution.recheck(input),
    close(){if(!closing){closed=true;readerPreviews.clear();closing=Promise.allSettled([cmsExecution.close(),...pending]).then(()=>{});}return closing;},
    reconcileAfterProjectSync:expected=>usingClient(async(client,state)=>{
      const status=state.status;
      if(!expected || !state.permissions?.canEdit || status?.connection!=='online' || status.baseUrl!==expected.baseUrl
        || status.projectId!==expected.projectId || status.user?.id!==expected.user?.id || status.user?.role!==expected.user?.role
        || status.user?.version!==expected.user?.version || status.readOnlySession!==expected.readOnlySession)return {checked:false};
      const env=setup(client,state);
      let confirmed=0,conflicts=0;
      for(const id of env.repo.workspaceLinkIds(env.a.projectId)) {
        const link=env.repo.workspaceLink(env.a.projectId,id),binding=link.binding;
        if(!['queued','queueing'].includes(binding.state) || !binding.frameLocalRevision || !binding.frameHash)continue;
        const remote=await readRemote(env,id,true);
        if(!remote)continue;
        const hash=fingerprint(remote.data);
        if(remote.localConflict || !remote.localPending && hash!==binding.frameHash && remote.object.revision!==binding.remoteRevision) {
          update(env,id,link,{state:'conflict',errorCode:'shared_page_conflict'});conflicts++;
        } else if(!remote.localPending && hash===binding.frameHash) {
          bindRemote(env,id,link,remote,binding.frameLocalRevision,binding.frameHash,binding.approvalId);confirmed++;
        }
      }
      return {checked:true,confirmed,conflicts};
    }),
    list:()=>usingClient(async(client,state)=>{
      const env=setup(client,state),local=env.repo.list(env.a.projectId),objects=(await client.listObjects()).filter(object=>object.kind==='page' && object.data?.type===PAGE_AUTHORING_TYPE);
      for(const object of objects)validatePageAuthoringObject(object.data,object.id);
      return {source:'shared-project',sourceScope:env.sourceScope,connection:state.status.connection,
        drafts:await Promise.all(local.map(value=>view(env,value.id))),remoteDrafts:objects.filter(object=>!local.some(value=>value.id===object.data.pageId))
          .map(object=>({draftId:object.data.pageId,slug:object.data.document.slug,title:object.data.title,remoteRevision:object.revision,localPending:object.localPending===true,localConflict:object.localConflict===true})),externalPublication:'not-performed'};
    }),
    get:id=>usingClient(async(client,state)=>{const env=setup(client,state);identifier(id);const local=env.repo.read(env.a.projectId,id);
      return view(env,id,local?{}:{remoteOnly:await readRemote(env,id)});}),
    create:input=>usingClient(async(client,state)=>{
      const env=setup(client,state,true),body=inputFor(env,input),id=identifier(body.draftId);
      check(state.permissions.canCreate===true,'online_required','Neue Artseiten benötigen bestätigte Onlineberechtigung.',409);
      const result=await env.core(id).createDraft(env.context,body);
      if(!env.repo.workspaceLink(env.a.projectId,id))await createRemote(env,id,result.draft,null);
      return view(env,id,{localSaved:true,result});
    }),
    save:input=>usingClient((client,state)=>saved(setup(client,state,true),'saveDraft',input)),
    confirmEmpty:input=>usingClient((client,state)=>saved(setup(client,state,true),'confirmEmpty',input)),
    refreshSpecies:input=>usingClient((client,state)=>saved(setup(client,state,true),'refreshSpecies',input)),
    approve:input=>usingClient(async(client,state)=>{const env=setup(client,state,true);check(state.permissions.canApprove===true,'forbidden','Die menschliche Endfreigabe benötigt aktuelle Veröffentlichungsberechtigung.',403);return saved(env,'approve',input);}),
    preview:input=>usingClient(async(client,state)=>{const env=setup(client,state,true),body=inputFor(env,input),result=await env.core(body.draftId).preview(env.context,body);
      return {...await view(env,body.draftId),...result};}),
    prepareCmsPlan:input=>usingClient(async(client,state)=>{const env=setup(client,state,true),body=inputFor(env,input);check(state.permissions.canApprove===true,'forbidden','Für diesen CMS-Plan fehlt die Veröffentlichungsberechtigung.',403);
      const result=await env.core(body.draftId).prepareCmsPlan(env.context,body);return {...await view(env,body.draftId),...result};}),
    readerPreview:input=>usingClient(async(client,state)=>{
      fields(input,['sourceScope','draftId','expectedRevision','expectedBindingRevision']);
      const env=setup(client,state),body=inputFor(env,input),id=identifier(body.draftId);digest(body.expectedRevision);digest(body.expectedBindingRevision);
      const authority=readerAuthority(env),basis=readerBasis(env,id,body.expectedRevision,body.expectedBindingRevision);
      await readerCheck(env,basis,authority);
      check(readerPreviews.size<READER_PREVIEW_LIMIT,'reader_preview_limit','Es sind bereits 64 Übernahmevorschauen offen. Bitte eine abschließen oder ihren Ablauf abwarten.',429);
      const result=await client.previewPageEditorial(basis.page.objectId,basis.speciesId);
      await readerCheck(env,basis,authority);
      const source=validateEditorialSourceBindings(result?.sourceBindings);
      check(source.projectId===env.a.projectId && source.species.id===basis.speciesId && fingerprint(source.page)===fingerprint(basis.page)
        && result.readerApproved===false && result.externalPublication==='not-performed','editorial_adoption_changed',
        'Die frisch gelesene gemeinsame Seite stimmt nicht mit dieser gespeicherten Seitenfassung überein. Bitte abgleichen und erneut prüfen.',409);
      const createdAt=readerActive(),deadline=Math.min(createdAt+READER_PREVIEW_TTL,Date.parse(result.expiresAt));
      check(typeof result.token==='string' && result.token.length>0 && Number.isFinite(deadline) && deadline>createdAt,
        'reader_preview_required','Die Übernahmevorschau ist nicht mehr gültig. Bitte erneut prüfen.',409);
      const beforeEditorial=copyEditorial(result.beforeEditorial),proposedEditorial=copyEditorial(result.proposedEditorial),token=identifier(tokenId());
      check(readerPreviews.size<READER_PREVIEW_LIMIT,'reader_preview_limit','Es sind bereits 64 Übernahmevorschauen offen. Bitte eine abschließen oder ihren Ablauf abwarten.',429);
      check(!readerPreviews.has(token),'reader_preview_required','Die Übernahmevorschau konnte nicht eindeutig gebunden werden.',500);
      readerPreviews.set(token,{sourceScope:env.sourceScope,authority,basis,clientToken:result.token,createdAt,deadline});
      return {sourceScope:env.sourceScope,draftId:id,token,expiresAt:new Date(deadline).toISOString(),beforeEditorial,proposedEditorial,
        readerApproved:false,externalPublication:'not-performed'};
    }),
    readerAdopt:input=>usingClient(async(client,state)=>{
      fields(input,['sourceScope','draftId','token']);readerActive();
      const env=setup(client,state),body=inputFor(env,input),id=identifier(body.draftId),preview=readerPreviews.get(body.token);
      // A rejected or uncertain click always needs a fresh review; never retry a possibly queued adoption.
      if(preview)readerPreviews.delete(body.token);
      check(preview && preview.basis.draftId===id && preview.sourceScope===env.sourceScope,'reader_preview_required',
        'Diese Übernahmevorschau ist ungültig, verbraucht, abgelaufen oder gehört zu einer anderen Seite. Bitte erneut prüfen.',409);
      const authority=readerAuthority(env);
      check(authority===preview.authority,'workspace_changed','Die persönliche Anmeldung oder Berechtigung wurde seit der Vorschau geändert.',409);
      await readerCheck(env,preview.basis,authority);
      check(readerActive()<preview.deadline,'reader_preview_required','Die Übernahmevorschau ist abgelaufen. Bitte erneut prüfen.',409);
      const result=await client.adoptPageEditorial(preview.clientToken);
      check(typeof result?.changeId==='string' && /^[a-f0-9-]{36}$/.test(result.changeId) && result.object?.kind==='species'
        && result.object.id===preview.basis.speciesId && result.readerApproved===false && result.externalPublication==='not-performed',
        'editorial_adoption_unconfirmed','Die Vormerkung ist nicht eindeutig bestätigt. Bitte die vorhandene Projektqueue prüfen; nicht automatisch wiederholen.',409);
      const queued={sourceScope:env.sourceScope,draftId:id,queued:true,changeId:result.changeId,speciesId:preview.basis.speciesId,
        readerApproved:false,externalPublication:'not-performed'};
      try {await readerCheck(env,preview.basis,authority);}
      catch{return {...queued,localPageChanged:true,
        message:'Die geprüfte Fassung wurde als Artentwurf vorgemerkt. Inzwischen geänderte Seiteneingaben bleiben erhalten. Bitte vor einer weiteren Übernahme die aktuelle Seite erneut prüfen.'};}
      return queued;
    }),
    refreshFromProject:input=>usingClient(async(client,state)=>{
      const env=setup(client,state),body=inputFor(env,input),id=identifier(body.draftId),old=env.repo.read(env.a.projectId,id),link=env.repo.workspaceLink(env.a.projectId,id);
      if(body.expectedCachedRevision!==undefined) {
        check(state.status.connection==='offline','workspace_changed','Die Projektverbindung hat sich geändert. Bitte den Entwurf erneut öffnen.',409);
        check(!old && !link,'local_page_changed','Eine bestehende eigene Fassung bleibt erhalten. Offline wird nur ein noch nicht persönlich geöffneter Entwurf eingelesen.',409);
        const expected=identifier(body.expectedCachedRevision),remote=await readRemote(env,id,true);
        check(remote?.object.revision===expected && remote.evidence.trusted && !remote.localPending && !remote.localConflict,
          'cached_page_changed','Der zuletzt geladene Entwurf ist nicht mehr eindeutig verfügbar. Bitte den Seitenstand neu prüfen.',409);
        return importRemote(env,id,body,{old,link,remote,cached:true});
      }
      check(env.a.online,'online_required','Die gemeinsame Fassung muss ausdrücklich online gelesen werden.',409);
      if(old)check(body.expectedRevision===old.revision && link && link.binding.baseLocalRevision===old.revision && !link.binding.frameLocalRevision
        && link.binding.state==='synced','local_page_changed','Eigene lokale oder noch nicht übertragene Texte werden durch Einlesen nicht ersetzt.',409);
      if(body.expectedBindingRevision!==undefined)check(body.expectedBindingRevision===(link?.bindingRevision??null),'workspace_conflict','Die Seitenbasis wurde inzwischen geändert.',409);
      await client.refresh();const remote=await readRemote(env,id,true);
      check(remote && !remote.localPending && !remote.localConflict,'shared_page_conflict','Der gemeinsame Entwurf ist nicht eindeutig bestätigt.',409);
      return importRemote(env,id,body,{old,link,remote});
    }),
    conflictPreview:input=>usingClient(async(client,state)=>{
      fields(input,['sourceScope','draftId','expectedRevision','expectedBindingRevision']);
      const env=setup(client,state),body=inputFor(env,input),id=identifier(body.draftId);
      const {old,link,remote}=await conflictRemote(env,id,body);
      return {sourceScope:env.sourceScope,draftId:id,localRevision:old.revision,bindingRevision:link.bindingRevision,
        serverRevision:remote.object.revision,serverDataHash:fingerprint(remote.data),localDocument:old.document,
        serverDocument:importPageAuthoringAsDraft(remote.data).document,queueOpen:remote.localPending||remote.localConflict};
    }),
    conflictAdopt:input=>usingClient(async(client,state)=>{
      fields(input,['sourceScope','draftId','expectedRevision','expectedBindingRevision','serverRevision','serverDataHash','mutationId','confirmed']);
      check(input.confirmed===true,'confirmation_required','Bitte die angezeigte gemeinsame Fassung ausdrücklich bestätigen.');
      const env=setup(client,state),body=inputFor(env,input),id=identifier(body.draftId);
      const {old,link,remote}=await conflictRemote(env,id,body);
      checkReviewedConflictPage(body,remote);
      return importRemote(env,id,body,{old,link,remote,forceRevision:true});
    }),
    sync:input=>usingClient(async(client,state)=>{
      const env=setup(client,state,true),body=inputFor(env,input),id=identifier(body.draftId);
      check(env.a.online,'online_required','Der gemeinsame Abgleich benötigt eine bestätigte Verbindung.',409);
      let link=env.repo.workspaceLink(env.a.projectId,id),value=env.repo.read(env.a.projectId,id);
      check(value,'draft_not_found','Dieser persönliche Entwurf ist nicht vorhanden.',404);
      if(body.expectedRevision!==undefined)check(body.expectedRevision===value.revision,'draft_conflict','Der lokale Entwurf hat sich seit der Anzeige geändert.',409);
      if(body.expectedBindingRevision!==undefined)check(body.expectedBindingRevision===(link?.bindingRevision??null),'workspace_conflict','Die gemeinsame Ausgangsfassung wurde inzwischen geändert.',409);
      if(!link?.binding.remoteObject) {
        await client.refresh();const remote=await readRemote(env,id,true);
        if(remote) {
          const expected=link?.binding.frameHash||fingerprint(frame(env,value,link));
          check(fingerprint(remote.data)===expected,'shared_page_conflict','Die bereits vorhandene gemeinsame Fassung unterscheidet sich. Beide Fassungen bleiben erhalten.',409);
          bindRemote(env,id,link,remote,link?.binding.frameLocalRevision||value.revision,expected,null);
        } else {
          check(body.confirmedCreate===true,'create_confirmation_required','Die gemeinsame Erstellung ist nicht bestätigt. Nach dem frischen Einlesen muss eine erneute Erstellung ausdrücklich bestätigt werden.',409);
          check(state.permissions.canCreate===true,'forbidden','Die aktuelle Anmeldung erlaubt keine neue gemeinsame Seite.',403);
          await createRemote(env,id,value,link);
        }
        return view(env,id);
      }
      if(link.binding.frameLocalRevision)value=env.repo.read(env.a.projectId,id,link.binding.frameLocalRevision);
      if(link.binding.state!=='queued' && (value.revision!==link.binding.baseLocalRevision || link.binding.state!=='synced'
        || value.contentHash!==link.binding.confirmedObject?.data.contentHash))await stage(env,id,value,link.binding.approvalId);
      link=env.repo.workspaceLink(env.a.projectId,id);
      if(['conflict','local-only'].includes(link.binding.state))return view(env,id);
      const expected=link.binding.frameHash||fingerprint(link.binding.remoteObject.data),covered=link.binding.frameLocalRevision||link.binding.baseLocalRevision;
      try {
        const remote=await env.shared.synchronize(env.context,id);
        check(fingerprint(remote.data)===expected,'shared_page_conflict','Die Serverantwort gehört zu einer anderen Nachfolgefassung.',409);
        bindRemote(env,id,link,remote,covered,expected,link.binding.approvalId);
      }catch(error){update(env,id,link,{state:error?.code==='shared_page_conflict'?'conflict':link.binding.state,errorCode:errorCode(error)});}
      return view(env,id);
    }),
  });
}
