import { createSqlitePageAuthoringRepository } from './repository.mjs';
import { createExplorerPageWorkspace } from './explorer-workspace.mjs';
import { createExplorerPageAuthorities } from './explorer-authorities.mjs';
import { createPageAuthoringAiReader } from './ai-source-reader.mjs';
import { listPageTemplates } from './templates.mjs';
import { normalizeAssetMetadata } from './model.mjs';
import { MANAGED_IMAGE_ID } from '../shared-project/client-image-media.mjs';
import { check,fields,text,identifier,fingerprint,normalizeActor,sha256,PageAuthoringError } from './contract.mjs';

const MAX_IMAGE_BYTES=20*1024*1024,MAX_BASE64=4*Math.ceil(MAX_IMAGE_BYTES/3);
const writers=['admin','publisher','contributor'],publishers=['admin','publisher'];
const actions=Object.freeze({create:'create',save:'save','confirm-empty':'confirmEmpty',preview:'preview',approve:'approve',
  'refresh-species':'refreshSpecies',refresh:'refreshFromProject',sync:'sync','prepare-cms-plan':'prepareCmsPlan',
  'begin-cms-attempt':'beginCmsAttempt','create-unpublished-page':'createUnpublishedPage','recheck-squarespace-save':'recheckSquarespaceSave',
  'reader-preview':'readerPreview','reader-adopt':'readerAdopt','conflict-preview':'conflictPreview','conflict-adopt':'conflictAdopt'});
const scopeOf=status=>status?.baseUrl && status.projectId && status.user?.id?fingerprint([status.baseUrl,status.projectId,status.user.id]):null;
function permissions(state) {
  const status=state?.status||{},active=Boolean(status.user?.id)&&!['disconnected','authentication-required','closed','forbidden'].includes(status.connection);
  const canRead=active&&state.permissions?.canRead===true;
  const canEdit=canRead&&!status.readOnlySession&&writers.includes(status.user.role)&&state.permissions?.canEdit===true;
  return {canRead,canEdit,canCreate:canEdit&&status.connection==='online'&&state.permissions?.canCreate===true,
    canApprove:canEdit&&status.connection==='online'&&publishers.includes(status.user.role)&&state.permissions?.canApprove===true};
}
function queryScope(searchParams) {
  if(searchParams===undefined || searchParams===null)return undefined;
  if(searchParams instanceof URLSearchParams) {
    check([...searchParams.keys()].every(key=>key==='scope')&&searchParams.getAll('scope').length<=1,'invalid_scope','Die Bildanfrage benötigt eine eindeutige Projektbindung.');
    return searchParams.get('scope')??undefined;
  }
  fields(searchParams,['scope']);return searchParams.scope;
}
function boundScope(payload,searchParams) {
  const query=queryScope(searchParams);
  check(query===undefined || payload.sourceScope===undefined || query===payload.sourceScope,'workspace_changed','Die Projektbindung der Anfrage ist widersprüchlich.',409);
  return payload.sourceScope??query;
}
function base64Image(value) {
  check(typeof value==='string'&&value.length>0&&value.length<=MAX_BASE64,'image_media_size','Bitte eine Bilddatei bis 20 MiB auswählen.',413);
  const padding=value.indexOf('=');
  check(value.length%4===0&&!/[^A-Za-z0-9+/=]/.test(value)&&(padding===-1||padding===value.length-1||padding===value.length-2&&value.endsWith('==')),
    'invalid_image_data','Die Bilddatei benötigt unveränderte vollständige Base64-Daten.');
  const buffer=Buffer.from(value,'base64');
  check(buffer.length>0&&buffer.length<=MAX_IMAGE_BYTES,'image_media_size','Bitte eine Bilddatei bis 20 MiB auswählen.',413);
  check(buffer.toString('base64')===value,'invalid_image_data','Die Bilddaten sind nicht eindeutig kodiert.');return buffer;
}
function imageMetadata(raw,projectId) {
  const base=normalizeAssetMetadata(Object.fromEntries(['id','projectId','sha256','bytes','mimeType','attribution'].map(key=>[key,raw?.[key]])),projectId);
  check(['image/jpeg','image/png','image/webp'].includes(base.mimeType)&&base.bytes<=MAX_IMAGE_BYTES,'invalid_image_media','Diese Bilddatei besitzt kein zulässiges geprüftes Bildformat.');
  const result={...base,localAvailable:raw.localAvailable===true,remoteBacked:raw.remoteBacked===true,complete:raw.complete===true,
    availabilityKnown:typeof raw.localAvailable==='boolean'&&typeof raw.remoteBacked==='boolean'};
  if(Number.isSafeInteger(raw.width)&&raw.width>0)result.width=raw.width;
  if(Number.isSafeInteger(raw.height)&&raw.height>0)result.height=raw.height;
  return result;
}

/** Node composition only. CMS requests name stored plans/attempts; no renderer paths, free URLs, proofs or publication. */
export function createExplorerPageAuthoringSession({withClient,filename,localStorageConfirmed=false,repoRoot,
  authorities:injectedAuthorities,repository:injectedRepository,ownRepository=injectedRepository==null,ownAuthorities=true,cmsAdapter=null,factories={}}={}) {
  check(typeof withClient==='function','session_required','Der Artseitenbereich benötigt eine eingerichtete persönliche Projektverbindung.');
  const createRepository=factories.createRepository||createSqlitePageAuthoringRepository;
  const createAuthorities=factories.createAuthorities||createExplorerPageAuthorities;
  const createWorkspace=factories.createWorkspace||createExplorerPageWorkspace;
  const createAiReader=factories.createAiReader||createPageAuthoringAiReader;
  let closed=false,closing=null;const pending=new Set();
  let repository,authorities,workspace,aiReader;
  try {
    repository=injectedRepository||createRepository({filename,localStorageConfirmed});
    authorities=injectedAuthorities||createAuthorities({repoRoot});
    const targetAuthority=cmsAdapter?.pageAuthoringAvailable===true&&typeof cmsAdapter.checkNewTarget==='function'
      ?{checkNew:(_context,path)=>cmsAdapter.checkNewTarget(path)}:null;
    workspace=createWorkspace({withClient,repository,speciesAuthority:authorities.speciesAuthority,mediaFacade:authorities.mediaFacade,targetAuthority,cmsAdapter});
    aiReader=createAiReader({withClient,repository,mediaFacade:authorities.mediaFacade,run,assertOpen:ensureOpen});
    check(typeof aiReader?.readSnapshot==='function'&&typeof aiReader?.readImage==='function','ai_source_required','Die interne Artseitenquelle ist nicht vollständig eingerichtet.');
  }catch(error){if(ownRepository)repository?.close();throw error;}
  function ensureOpen(){check(!closed,'page_session_closed','Der Artseitenbereich ist geschlossen.',409);}
  function run(operation) {
    if(closed)return Promise.reject(new PageAuthoringError(409,'page_session_closed','Der Artseitenbereich ist geschlossen.'));
    const task=Promise.resolve().then(operation);pending.add(task);void task.finally(()=>pending.delete(task)).catch(()=>{});return task;
  }
  function context(client,state,wantedScope) {
    check(permissions(state).canEdit,'forbidden','Dieser Artseitenbereich benötigt effektive Redaktionsrechte. Freigegebene Arten stehen im Nachschlagewerk bereit.',403);
    const sourceScope=scopeOf(state.status);check(typeof wantedScope==='string'&&wantedScope===sourceScope,'workspace_changed','Die persönliche Projektbindung wurde geändert.',409);
    return {client,state,sourceScope,actor:normalizeActor({id:state.status.user.id,projectId:state.status.projectId,role:state.status.user.role,online:state.status.connection==='online'})};
  }
  async function current(ctx) {
    ensureOpen();const fresh=await ctx.client.status();
    check(scopeOf(fresh)===ctx.sourceScope&&fresh.user?.role===ctx.actor.role&&!fresh.readOnlySession&&writers.includes(fresh.user?.role)
      &&!['disconnected','authentication-required','closed','forbidden'].includes(fresh.connection),'workspace_changed','Die Anmeldung oder Berechtigung wurde während der Bildprüfung geändert.',409);
  }
  function blockingState() {
    const authority=authorities.blockingState?.()||{},cms=workspace.cmsBlockingState?.()||{};
    let local={known:false};try{if(typeof repository.workspacePendingState==='function')local=repository.workspacePendingState();}catch{/* unknown local state must not become a green result */}
    return {known:local.known===true,busy:pending.size>0||authority.busy===true||cms.busy===true,closed,activeOperations:pending.size,activePublicRequests:authority.activePublicRequests||0,
      pending:local.known===true?local.pending:null,localOnly:local.known===true?local.localOnly:null,conflicts:local.known===true?local.conflicts:null,
      legacyUnassignedDrafts:local.known===true?local.legacyUnassignedDrafts:null,
      message:pending.size||authority.busy?'Artseiten oder Bilddateien werden noch verarbeitet.':local.known!==true?'Der lokale Artseiten-Abgleichsstand ist nicht vollständig lesbar.':local.pending?'Lokale Artseitenstände sind noch nicht gemeinsam bestätigt.':''};
  }
  function unavailable(connection='disconnected',message='Bitte am gemeinsamen Projekt anmelden.') {
    return {available:false,permissions:{canRead:false,canEdit:false,canCreate:false,canApprove:false},sourceScope:null,connection,message,
      templates:listPageTemplates(),drafts:[],remoteDrafts:[],cmsAvailable:false,externalPublication:'not-performed'};
  }
  function snapshot() {
    if(closed)return Promise.resolve(unavailable('closed','Der Artseitenbereich ist geschlossen.'));
    return run(async()=>{
      const captured=await withClient(async(_client,state)=>({permissions:permissions(state),sourceScope:scopeOf(state.status),connection:state.status?.connection||'disconnected'}));
      if(!captured.permissions.canRead)return {...unavailable(captured.connection),permissions:captured.permissions};
      const base={...captured,available:captured.permissions.canEdit,templates:listPageTemplates(),drafts:[],remoteDrafts:[],externalPublication:'not-performed',
        message:captured.permissions.canEdit?(captured.connection==='online'?'':'Offline: Vorhandene Entwürfe bleiben bearbeitbar.'):'Der Redaktionsbereich benötigt Bearbeitungsrechte. Freigegebene Arten stehen im Nachschlagewerk bereit.'};
      if(!base.available)return base;
      const listed=await workspace.list();check(listed.sourceScope===base.sourceScope,'workspace_changed','Die Projektanmeldung wurde während der Anzeige geändert.',409);
      return {...base,drafts:listed.drafts,remoteDrafts:listed.remoteDrafts,cmsAvailable:cmsAdapter?.pageAuthoringAvailable===true};
    });
  }
  async function mediaOperation(action,id,payload,searchParams) {
    fields(payload,action==='import-image'?['sourceScope','dataBase64','attribution']:['sourceScope']);
    const wantedScope=boundScope(payload,searchParams);
    if(action!=='import-image')identifier(id);
    if(['refresh-image','download-image'].includes(action))check(MANAGED_IMAGE_ID.test(id),'invalid_image_media','Diese Aktion benötigt eine verwaltete Bildkennung.');
    let buffer;
    if(action==='import-image'){check(id===undefined || id===null,'invalid_image_media','Die Bildkennung wird ausschließlich vom Projektclient vergeben.');
      text(payload.attribution??'',8000,true);check(!/\x7f/.test(payload.attribution??''),'invalid_text','Die Quellenangabe enthält unzulässige Zeichen.');buffer=base64Image(payload.dataBase64);}
    return withClient(async(client,state)=>{
      const ctx=context(client,state,wantedScope);let raw;
      if(action==='import-image') {
        raw=await client.media.importImage({buffer,attribution:payload.attribution??''});
        check(MANAGED_IMAGE_ID.test(raw.id)&&raw.sha256===sha256(buffer)&&raw.bytes===buffer.length,'image_media_changed','Die importierte Bilddatei wurde nicht eindeutig bestätigt.',409);
      }else if(action==='refresh-image')raw=await client.media.refreshMetadata(id);
      else if(action==='download-image')raw=await client.media.downloadImage(id);
      else raw=MANAGED_IMAGE_ID.test(id)?await client.media.describeImage(id):await authorities.mediaFacade.describe(ctx,id);
      const expected=imageMetadata(raw,ctx.actor.projectId);
      check(action==='import-image'||expected.id===id,'image_media_changed','Die Bildrückmeldung gehört zu einer anderen Datei.',409);
      if(action!=='image-metadata') {
        const described=await client.media.describeImage(expected.id),fresh=imageMetadata(described,ctx.actor.projectId);
        check(fresh.id===expected.id&&fresh.sha256===expected.sha256&&fresh.bytes===expected.bytes&&fresh.mimeType===expected.mimeType,'image_media_changed','Die lokale Bildbasis wurde verändert.',409);
        raw=described;
      }
      await current(ctx);return {source:'shared-project',sourceScope:ctx.sourceScope,image:imageMetadata(raw,ctx.actor.projectId),externalPublication:'not-performed'};
    });
  }
  function operation(input={}) {
    fields(input,['action','id','payload','searchParams']);const {action,id,searchParams}=input,payload=input.payload??{};
    check(payload&&typeof payload==='object'&&!Array.isArray(payload),'invalid_fields','Eine gültige Artseitenanfrage ist erforderlich.');
    if(action==='status')return snapshot();
    return run(async()=>{
      if(action==='templates')return {templates:listPageTemplates(),externalPublication:'not-performed'};
      if(['import-image','refresh-image','download-image','image-metadata'].includes(action))return mediaOperation(action,id,payload,searchParams);
      if(action==='list'){fields(payload,[]);return workspace.list();}
      if(action==='get') {
        fields(payload,['draftId','sourceScope']);identifier(id);
        check(payload.draftId===undefined||payload.draftId===id,'draft_identity_changed','Pfad und Nutzereingabe bezeichnen unterschiedliche Entwürfe.',409);
        const result=await workspace.get(id),wantedScope=boundScope(payload,searchParams);
        check(wantedScope===undefined||result.sourceScope===wantedScope,'workspace_changed','Die Projektanmeldung wurde geändert.',409);return result;
      }
      check(Object.hasOwn(actions,action),'invalid_action','Diese Artseitenaktion ist nicht verfügbar.');
      if(['begin-cms-attempt','create-unpublished-page','recheck-squarespace-save'].includes(action)) {
        fields(payload,action==='begin-cms-attempt'?['sourceScope','draftId','expectedRevision','planId','mutationId']
          :['sourceScope','draftId','attemptId','expectedStateRevision']);
        check(queryScope(searchParams)===undefined,'invalid_scope','Die Websitevorbereitung benötigt ihre gespeicherte persönliche Projektbindung.');
      }
      if(action==='reader-preview'||action==='reader-adopt') {
        fields(payload,action==='reader-preview'?['sourceScope','draftId','expectedRevision','expectedBindingRevision']:['sourceScope','draftId','token']);
        check(queryScope(searchParams)===undefined,'invalid_scope','Die Artübernahme bindet ihre Projektquelle ausschließlich über die gespeicherte Anfrage.');
      }
      if(action==='conflict-preview'||action==='conflict-adopt') {
        fields(payload,['sourceScope','draftId','expectedRevision','expectedBindingRevision',...(action==='conflict-adopt'
          ?['serverRevision','serverDataHash','mutationId','confirmed']:[])]);
        check(queryScope(searchParams)===undefined,'invalid_scope','Der Seitenvergleich benötigt die persönliche Projektbindung in der Anfrage.');
      }
      check(id===undefined||payload.draftId===undefined||id===payload.draftId,'draft_identity_changed','Pfad und Nutzereingabe bezeichnen unterschiedliche Entwürfe.',409);
      const body=id===undefined?payload:{...payload,draftId:identifier(id)};
      return workspace[actions[action]](body);
    });
  }
  const session={snapshot,operation,blockingState,
    backupProjectIds:()=>workspace.backupProjectIds(),
    reconcileAfterProjectSync:status=>run(()=>workspace.reconcileAfterProjectSync(status)),
    imageContent:(id,input={})=>run(async()=>{
      fields(input,['sourceScope']);identifier(id);
      return withClient(async(client,state)=>{
        const ctx=context(client,state,input.sourceScope),metadata=imageMetadata(await authorities.mediaFacade.describe(ctx,id),ctx.actor.projectId);
        check(metadata.id===id,'image_media_changed','Die Bildkennung wurde verändert.',409);
        const bytes=await authorities.mediaFacade.read(ctx,id);
        check((Buffer.isBuffer(bytes)||bytes instanceof Uint8Array)&&bytes.byteLength===metadata.bytes&&sha256(bytes)===metadata.sha256,
          'image_media_changed','Die Bilddatei stimmt nicht mit ihrem Quellenbeleg überein.',409);
        await current(ctx);return {metadata,buffer:Buffer.from(bytes)};
      });
    }),
    close(){
      if(!closing){closed=true;const finish=[];
        if(ownAuthorities)finish.push(Promise.resolve().then(()=>authorities.close?.()));
        finish.push(Promise.resolve().then(()=>workspace.close()));
        closing=Promise.all([Promise.allSettled(finish),Promise.allSettled([...pending])]).then(([results])=>{
          if(ownRepository)repository.close();const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;});}
      return closing;
    },
  };
  // Internal Node dependency only; snapshots and accidental object serialization never expose raw AI inputs.
  Object.defineProperty(session,'aiReader',{value:aiReader,enumerable:false});
  return Object.freeze(session);
}
