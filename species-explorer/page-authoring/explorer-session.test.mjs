import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fixture as authoringFixture } from './test-fixture.mjs';
import { createExplorerPageAuthoringSession } from './explorer-session.mjs';
import { createSqlitePageAuthoringRepository } from './repository.mjs';
import { createExplorerPageWorkspace } from './explorer-workspace.mjs';
import { createTestPng } from '../server-test-fixtures.mjs';
import { pageAuthoringServerEvidence } from './shared.mjs';
import { sha256,clone } from './contract.mjs';
import { matchPageAuthoringRoute } from './routes.mjs';
import { assertTestTempPath } from '../../scripts/test-temp.mjs';

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function microtasks(){for(let turn=0;turn<12;turn++)await Promise.resolve();}
function fixture(t,{injectedRepository=false,ownAuthorities=true,authoritiesOverride,repoOverride,factories={}}={}) {
  const local=authoringFixture({after(){}}),png=createTestPng(6,4),calls=[],images=new Map(),objects=new Map(),queued=new Map(),hooks={},lifecycle=[];
  const speciesRecord={type:'fn-species-record',schemaVersion:1,id:local.species.slug,
    input:{german:'Test-Art',genus:'Testus',species:'fixture',privateWorking:'NODE_ONLY_WORKING_SENTINEL'},generated:{URLSlug:local.species.slug},taxonomyOverride:null,assessmentBinding:null,
    assets:{assetName:'Test-Art',files:{},overrides:{},credits:null,portraitMetadata:{prompt:'NODE_ONLY_PROMPT_SENTINEL'}},
    editorial:{websiteUrl:null,sections:[{id:'habitat',title:'Lebensraum',text:'Gelieferter Fachtext',intentionallyEmpty:false}],gallery:[],generalSectionId:null,embeddedGeneralText:null}};
  let state={status:{baseUrl:'https://project.example.org',projectId:'project-a',user:{id:'felix',role:'publisher'},connection:'online',readOnlySession:false},
    permissions:{canRead:true,canEdit:true,canCreate:true,canApprove:true}};
  const imageView=record=>({...record.metadata,localAvailable:Boolean(record.buffer),remoteBacked:record.remoteBacked,complete:true,
    buffer:record.buffer,privateLocalPath:'PRIVATE_PATH_SENTINEL',privateCredential:'PRIVATE_CREDENTIAL_SENTINEL'});
  function image(id){const value=images.get(id);if(!value)throw Object.assign(new Error('Bild fehlt'),{code:'image_media_missing',status:404});return value;}
  function object(kind,id,serverOnly=false) {
    const value=objects.get(id);if(!value)throw Object.assign(new Error('Seite fehlt'),{code:'not_found',status:404});
    const data=!serverOnly&&queued.has(id)?queued.get(id):value.data;
    return {...clone(value),data:clone(data),localPending:!serverOnly&&queued.has(id),localConflict:false,
      pageAuthoringEvidence:pageAuthoringServerEvidence({objectId:id,objectRevision:value.revision,objectOrdinal:value.ordinal,data,receipts:[]})};
  }
  const client={
    async status(){calls.push('status');return structuredClone(state.status);},
    async listObjects(){calls.push('listObjects');return [...objects].map(([id])=>object('page',id));},
    async getObject(kind,id,{serverOnly=false}={}){calls.push('getObject');if(kind==='species'){assert.equal(id,speciesRecord.id);return {kind,id,data:clone(speciesRecord)};}return object(kind,id,serverOnly);},
    async refresh(){calls.push('refresh');await hooks.refresh?.();},
    async capabilities(){calls.push('capabilities');throw new Error('No network capability lookup expected');},
    async createObject(input){calls.push('createObject');await hooks.create?.();const value={...clone(input),revision:randomUUID(),ordinal:1};objects.set(input.id,value);return object('page',input.id);},
    async editExistingObject(_kind,id,data){calls.push('editExistingObject');queued.set(id,clone(data));return object('page',id);},
    async sync({id}){calls.push('sync');if(queued.has(id)){const prior=objects.get(id);objects.set(id,{...prior,data:queued.get(id),revision:randomUUID(),ordinal:prior.ordinal+1});queued.delete(id);}return {pending:0};},
    media:{
      async importImage({buffer,attribution}) {
        calls.push('importImage');const projectId=state.status.projectId;await hooks.import?.();
        const id=`image-${randomUUID()}`,metadata={id,projectId,sha256:sha256(buffer),bytes:buffer.length,mimeType:'image/png',attribution,width:6,height:4};
        images.set(id,{metadata,buffer:Buffer.from(buffer),remoteBacked:false});return imageView(image(id));
      },
      async describeImage(id){calls.push('describeImage');await hooks.describe?.();return imageView(image(id));},
      async readImage(id){calls.push('readImage');const value=image(id);if(!value.buffer)throw Object.assign(new Error('Bild nicht lokal'),{code:'image_media_not_local',status:404});return {...value.metadata,buffer:Buffer.from(value.buffer)};},
      async refreshMetadata(id){calls.push('refreshMetadata');await hooks.refreshMetadata?.();return imageView(image(id));},
      async downloadImage(id){calls.push('downloadImage');await hooks.download?.();const value=image(id);value.buffer=Buffer.from(png);return imageView(value);},
    },
  };
  let queue=Promise.resolve();
  const withClient=callback=>{const task=queue.then(()=>callback(client,structuredClone(state)));queue=task.catch(()=>{});return task;};
  const authorities=authoritiesOverride||{speciesAuthority:local.authorities.speciesAuthority,
    mediaFacade:{async describe(context,id){const metadata=id.startsWith('image-')?await client.media.describeImage(id):await local.authorities.mediaFacade.describe(context,id);
      return Object.fromEntries(['id','projectId','sha256','bytes','mimeType','attribution'].map(key=>[key,metadata[key]]));},
    async read(context,id){await hooks.read?.();return id.startsWith('image-')?(await client.media.readImage(id)).buffer:local.authorities.mediaFacade.read(context,id);}},
    blockingState:()=>({known:true,busy:false}),close:async()=>{lifecycle.push('authority-close');await hooks.authorityClose?.();}};
  let repo;
  const session=createExplorerPageAuthoringSession({withClient,filename:path.join(local.directory,'session.sqlite'),localStorageConfirmed:true,repoRoot:local.directory,
    authorities,ownAuthorities,...(injectedRepository?{repository:repoOverride||local.repository}:{}),factories:{
      createRepository(options){repo=createSqlitePageAuthoringRepository(options);const close=repo.close.bind(repo);repo.close=()=>{lifecycle.push('repository-close');return close();};return repo;},
      createWorkspace(options){const workspace=createExplorerPageWorkspace(options);return {...workspace,close(){lifecycle.push('workspace-close');return workspace.close();}};},...factories}});
  t.after(async()=>{try{await session.close();}finally{local.close();await fs.rm(assertTestTempPath(local.directory),{recursive:true,force:true,maxRetries:8,retryDelay:50});}});
  return {session,client,withClient,local,png,calls,images,hooks,lifecycle,authorities,speciesRecord,get repository(){return repo||local.repository;},
    setState(change){state={...state,...change};},setStatus(change){state={...state,status:{...state.status,...change}};},
    async create(id='page-a'){const status=await session.snapshot();return session.operation({action:'create',payload:{sourceScope:status.sourceScope,draftId:id,
      mutationId:randomUUID(),templateId:'fn-compact-20261031',slug:local.species.slug,parentPath:'/wildlife/heimische-tierwelt'}});},
    rememberRemote(){const id=`image-${randomUUID()}`;images.set(id,{metadata:{id,projectId:state.status.projectId,sha256:sha256(png),bytes:png.length,
      mimeType:'image/png',attribution:'Serverbestätigte Aufnahme',width:6,height:4},buffer:null,remoteBacked:true});return id;},
  };
}
const failure=code=>error=>error.code===code;

test('cached snapshot and templates expose no editor drafts to logged-out or read-only sessions and perform no network refresh',async t=>{
  const f=fixture(t);let status=await f.session.snapshot();assert.equal(status.available,true);assert.equal(status.templates.length,2);
  const created=await f.create();assert.ok(created.draft);
  const before=f.calls.length;status=await f.session.snapshot();assert.equal(status.drafts.length,1);
  assert.ok(!f.calls.slice(before).some(call=>['refresh','capabilities','readImage','downloadImage'].includes(call)));
  f.setStatus({user:{id:'felix',role:'reader'},readOnlySession:true});f.setState({permissions:{canRead:true,canEdit:false,canCreate:false,canApprove:false}});
  status=await f.session.snapshot();assert.equal(status.available,false);assert.deepEqual(status.drafts,[]);assert.equal(status.permissions.canEdit,false);
  await assert.rejects(f.session.operation({action:'get',id:'page-a'}),failure('forbidden'));
  await assert.rejects(f.session.operation({action:'list'}),failure('forbidden'));
  f.setStatus({user:null,projectId:null,connection:'disconnected'});f.setState({permissions:{canRead:false,canEdit:false,canCreate:false,canApprove:false}});
  status=await f.session.snapshot();assert.equal(status.available,false);assert.equal(status.sourceScope,null);assert.match(status.message,/anmelden/);
  assert.deepEqual(await f.session.backupProjectIds(),['project-a']);
});

test('real default authorities and target-free workspace compose without a placeholder or a public request during status',async t=>{
  const local=authoringFixture(t);let calls=0;
  const session=createExplorerPageAuthoringSession({withClient:callback=>callback({}, {status:{connection:'disconnected'},permissions:{canRead:false}}),
    filename:path.join(local.directory,'default-session.sqlite'),localStorageConfirmed:true,repoRoot:local.directory,
    factories:{createWorkspace(options){calls++;assert.equal(options.targetAuthority,null);assert.equal(typeof options.speciesAuthority.snapshot,'function');
      assert.equal(typeof options.mediaFacade.read,'function');return createExplorerPageWorkspace(options);}}});
  try{const status=await session.snapshot();assert.equal(status.available,false);assert.equal(status.templates.length,2);assert.equal(calls,1);}
  finally{await session.close();}
});

test('route and payload draft identities must agree and the core result fields survive session dispatch',async t=>{
  const f=fixture(t),created=await f.create();
  await assert.rejects(f.session.operation({action:'save',id:'another-page',payload:{sourceScope:created.sourceScope,draftId:'page-a',
    mutationId:randomUUID(),expectedRevision:created.draft.revision,document:created.editable}}),failure('draft_identity_changed'));
  await assert.rejects(f.session.operation({action:'get',id:'page-a',payload:{draftId:'another-page'}}),failure('draft_identity_changed'));
  const preview=await f.session.operation({action:'preview',id:'page-a',payload:{sourceScope:created.sourceScope,mutationId:randomUUID(),expectedRevision:created.draft.revision}});
  assert.equal(preview.sourceScope,created.sourceScope);assert.equal(preview.report.revision,created.draft.revision);assert.equal(preview.artifact.kind,'preview');assert.match(preview.html,/<!doctype html>/i);
  assert.equal(preview.published,false);assert.equal(preview.externalPublication,'not-performed');
  const kept=await f.session.operation({action:'get',id:'page-a'});assert.equal(kept.draft.revision,created.draft.revision);
  await assert.rejects(f.session.operation({action:'dispatchCmsAttempt',payload:{}}),failure('invalid_action'));
});

test('image import accepts only canonical bounded bytes and attribution; the client alone assigns its managed ID',async t=>{
  const f=fixture(t),status=await f.session.snapshot(),scope=status.sourceScope;
  for(const dataBase64 of ['', 'Zg', 'Zg==\n', 'Zh==', '____', `data:image/png;base64,${f.png.toString('base64')}`]) {
    await assert.rejects(f.session.operation({action:'import-image',payload:{sourceScope:scope,dataBase64,attribution:''}}),
      error=>['invalid_image_data','image_media_size'].includes(error.code));
  }
  for(const extra of [{id:'chosen-id'},{url:'https://example.org/photo.png'},{path:'C:\\private.png'},{buffer:{type:'Buffer',data:[1]}}]) {
    await assert.rejects(f.session.operation({action:'import-image',payload:{sourceScope:scope,dataBase64:f.png.toString('base64'),attribution:'',...extra}}),failure('invalid_fields'));
  }
  await assert.rejects(f.session.operation({action:'import-image',payload:{sourceScope:scope,dataBase64:'A'.repeat(4*Math.ceil(20*1024*1024/3)+4),attribution:''}}),failure('image_media_size'));
  assert.equal(f.calls.filter(call=>call==='importImage').length,0);
  const result=await f.session.operation({action:'import-image',payload:{sourceScope:scope,dataBase64:f.png.toString('base64'),attribution:'Eigene Aufnahme'}});
  assert.match(result.image.id,/^image-[a-f0-9-]{36}$/);assert.equal(result.image.localAvailable,true);assert.equal(result.image.remoteBacked,false);
  assert.equal(result.image.attribution,'Eigene Aufnahme');assert.equal(result.sourceScope,scope);assert.equal(result.image.sha256,sha256(f.png));
  assert.equal(f.calls.filter(call=>call==='importImage').length,1);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_'));assert.equal(Object.hasOwn(result.image,'buffer'),false);
});

test('metadata is local and explicit download alone obtains missing bytes; imageContent returns a checked Node buffer',async t=>{
  const f=fixture(t),scope=(await f.session.snapshot()).sourceScope,id=f.rememberRemote();
  const metadata=await f.session.operation({action:'image-metadata',id,searchParams:new URLSearchParams({scope})});
  assert.equal(metadata.image.localAvailable,false);assert.equal(metadata.image.remoteBacked,true);assert.equal(metadata.image.availabilityKnown,true);
  assert.equal(f.calls.filter(call=>call==='downloadImage').length,0);assert.equal(f.calls.filter(call=>call==='readImage').length,0);
  await assert.rejects(f.session.imageContent(id,{sourceScope:scope}),failure('image_media_not_local'));
  const downloaded=await f.session.operation({action:'download-image',id,payload:{sourceScope:scope}});
  assert.equal(downloaded.image.localAvailable,true);assert.equal(downloaded.image.remoteBacked,true);assert.equal(f.calls.filter(call=>call==='downloadImage').length,1);
  const content=await f.session.imageContent(id,{sourceScope:scope});assert.deepEqual(content.buffer,f.png);assert.ok(Buffer.isBuffer(content.buffer));
  assert.equal(content.metadata.id,id);assert.equal(content.metadata.sha256,sha256(content.buffer));
  assert.ok(!JSON.stringify(await f.session.snapshot()).includes('PRIVATE_'));
});

test('foreign scope, ambiguous scope query and effective readonly rights block every image path before media work',async t=>{
  const f=fixture(t),scope=(await f.session.snapshot()).sourceScope,id=f.rememberRemote();
  await assert.rejects(f.session.operation({action:'image-metadata',id,searchParams:new URLSearchParams('scope=one&scope=two')}),failure('invalid_scope'));
  await assert.rejects(f.session.operation({action:'image-metadata',id,payload:{sourceScope:scope},searchParams:new URLSearchParams({scope:'other'})}),failure('workspace_changed'));
  await assert.rejects(f.session.imageContent(id,{sourceScope:'foreign-person'}),failure('workspace_changed'));
  await assert.rejects(f.session.operation({action:'import-image',payload:{sourceScope:'foreign-person',dataBase64:f.png.toString('base64'),attribution:''}}),failure('workspace_changed'));
  f.setStatus({readOnlySession:true});f.setState({permissions:{canRead:true,canEdit:false,canCreate:false,canApprove:false}});
  for(const action of ['image-metadata','refresh-image','download-image'])await assert.rejects(f.session.operation({action,id,payload:{sourceScope:scope}}),failure('forbidden'));
  await assert.rejects(f.session.imageContent(id,{sourceScope:scope}),failure('forbidden'));
  await assert.rejects(f.session.operation({action:'import-image',payload:{sourceScope:scope,dataBase64:f.png.toString('base64'),attribution:''}}),failure('forbidden'));
  assert.ok(!f.calls.some(call=>['importImage','describeImage','readImage','refreshMetadata','downloadImage'].includes(call)));
});

test('a changed person or role during delayed import cannot receive the earlier image acknowledgement',async t=>{
  for(const drift of [{user:{id:'other-person',role:'publisher'}},{user:{id:'felix',role:'reader'},readOnlySession:true}]) {
    const f=fixture(t),scope=(await f.session.snapshot()).sourceScope,gate=deferred(),entered=deferred();
    f.hooks.import=()=>{entered.resolve();return gate.promise;};
    const importing=f.session.operation({action:'import-image',payload:{sourceScope:scope,dataBase64:f.png.toString('base64'),attribution:''}});
    await entered.promise;f.setStatus(drift);gate.resolve();await assert.rejects(importing,failure('workspace_changed'));
  }
});

test('blocking state finds local untransferred work absent from the client queue and clears after an explicit durable recovery',async t=>{
  const f=fixture(t);assert.equal(f.session.blockingState().known,true);assert.equal(f.session.blockingState().pending,0);
  f.hooks.create=async()=>{throw new Error('create not acknowledged');};let created=await f.create();
  assert.equal(created.sync.state,'uncertain');assert.equal(f.session.blockingState().pending,1);assert.equal(f.session.blockingState().localOnly,1);
  assert.deepEqual(await f.session.backupProjectIds(),['project-a']);f.hooks.create=null;
  created=await f.session.operation({action:'sync',id:'page-a',payload:{sourceScope:created.sourceScope,confirmedCreate:true}});
  assert.equal(created.sync.state,'synced');assert.equal(created.approval,null);assert.equal(f.session.blockingState().pending,0);
});

test('unknown local pending state is not returned as a clean known result',async t=>{
  const local=authoringFixture(t),repository=new Proxy(local.repository,{get(target,key){if(key==='workspacePendingState')return undefined;const value=target[key];return typeof value==='function'?value.bind(target):value;}});
  const f=fixture(t,{injectedRepository:true,repoOverride:repository});assert.equal(f.session.blockingState().known,false);assert.equal(f.session.blockingState().pending,null);
});

test('close joins an accepted decoder/import, closes owned authorities and repository once and never closes the shared client',async t=>{
  const f=fixture(t),scope=(await f.session.snapshot()).sourceScope,gate=deferred(),entered=deferred();
  f.hooks.import=()=>{entered.resolve();return gate.promise;};
  const importing=f.session.operation({action:'import-image',payload:{sourceScope:scope,dataBase64:f.png.toString('base64'),attribution:''}});
  await entered.promise;const rejected=assert.rejects(importing,failure('page_session_closed'));
  let finished=false;const closing=f.session.close().then(()=>{finished=true;});await microtasks();
  assert.equal(finished,false);assert.equal(f.lifecycle.includes('repository-close'),false);
  assert.equal(f.session.blockingState().busy,true);gate.resolve();await rejected;await closing;
  assert.equal(finished,true);assert.equal(f.lifecycle.filter(value=>value==='repository-close').length,1);
  assert.ok(f.lifecycle.indexOf('repository-close')>f.lifecycle.indexOf('authority-close'));
  assert.ok(f.lifecycle.indexOf('repository-close')>f.lifecycle.indexOf('workspace-close'));
  await f.session.close();assert.equal(f.lifecycle.filter(value=>value==='repository-close').length,1);
});

test('injected repository ownership remains with its caller and authority cancellation settles an accepted image read before close completes',async t=>{
  const f=fixture(t,{injectedRepository:true}),scope=(await f.session.snapshot()).sourceScope,id=f.rememberRemote(),gate=deferred(),entered=deferred();
  f.images.get(id).buffer=Buffer.from(f.png);f.hooks.read=()=>{entered.resolve();return gate.promise;};
  f.hooks.authorityClose=()=>{gate.reject(Object.assign(new Error('authority cancelled'),{code:'authority_closed'}));};
  const reading=f.session.imageContent(id,{sourceScope:scope});await entered.promise;
  const rejected=assert.rejects(reading,failure('authority_closed'));await f.session.close();await rejected;
  assert.deepEqual(f.local.repository.backupProjectIds(),[]);assert.equal(f.lifecycle.includes('repository-close'),false);
  await assert.rejects(f.session.operation({action:'list'}),failure('page_session_closed'));
});

test('the injected AI reader factory receives the exact session dependencies without a renderer action or enumerable serializer',async t=>{
  let captured;const stub={readSnapshot:async()=>({internal:true}),readImage:async()=>({internal:true})};
  const f=fixture(t,{factories:{createAiReader(options){captured=options;return stub;}}});
  assert.equal(f.session.aiReader,stub);assert.equal(captured.withClient,f.withClient);assert.equal(captured.repository,f.repository);
  assert.equal(captured.mediaFacade,f.authorities.mediaFacade);assert.equal(typeof captured.run,'function');assert.equal(typeof captured.assertOpen,'function');
  assert.equal(Object.keys(f.session).includes('aiReader'),false);assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(f.session)),'aiReader'),false);
  await assert.rejects(f.session.operation({action:'ai-read-snapshot',payload:{}}),failure('invalid_action'));
  assert.equal(Object.hasOwn(await f.session.snapshot(),'aiReader'),false);await f.session.close();assert.throws(captured.assertOpen,failure('page_session_closed'));
});

async function pageWithAiImage(f) {
  const created=await f.create(),imported=await f.session.operation({action:'import-image',payload:{sourceScope:created.sourceScope,dataBase64:f.png.toString('base64'),attribution:'Eigene AI-Prüfaufnahme'}});
  const document=clone(created.editable);document.images=[{id:'ai-position',assetId:imported.image.id,alt:'Gelieferter Bildtext',caption:'',decorative:false}];
  const saved=await f.session.operation({action:'save',id:created.draft.id,payload:{sourceScope:created.sourceScope,mutationId:randomUUID(),expectedRevision:created.draft.revision,document}});
  return {saved,input:{sourceScope:saved.sourceScope,draftId:saved.draft.id,expectedRevision:saved.draft.revision,imageId:'ai-position',assetId:imported.image.id}};
}

test('the default internal reader uses a real scoped draft and existing media while public session DTOs keep raw originals private',async t=>{
  const f=fixture(t),{saved,input}=await pageWithAiImage(f),before=f.calls.length;
  const snapshot=await f.session.aiReader.readSnapshot({sourceScope:input.sourceScope,draftId:input.draftId});
  assert.equal(snapshot.draft.revision,saved.draft.revision);assert.equal(snapshot.speciesRecord.input.privateWorking,'NODE_ONLY_WORKING_SENTINEL');
  assert.equal(snapshot.speciesRecord.assets.portraitMetadata.prompt,'NODE_ONLY_PROMPT_SENTINEL');assert.equal(snapshot.permissions.canRead,true);assert.equal(snapshot.permissions.canEdit,true);
  const image=await f.session.aiReader.readImage(input);assert.deepEqual(image.buffer,f.png);assert.equal(image.metadata.id,input.assetId);assert.equal(image.metadata.sha256,sha256(f.png));
  assert.ok(!f.calls.slice(before).some(call=>['refresh','capabilities','downloadImage','importImage','editExistingObject','createObject','sync'].includes(call)));
  assert.ok(!JSON.stringify(await f.session.snapshot()).includes('NODE_ONLY_'));assert.equal(f.session.blockingState().activeOperations,0);
});

test('session close waits for an accepted AI image read and rejects later internal reads before closing its owned repository',async t=>{
  const f=fixture(t),{input}=await pageWithAiImage(f),entered=deferred(),gate=deferred();
  f.hooks.read=()=>{entered.resolve();return gate.promise;};
  const reading=f.session.aiReader.readImage(input),rejected=assert.rejects(reading,failure('page_session_closed'));await entered.promise;
  assert.equal(f.session.blockingState().busy,true);assert.equal(f.session.blockingState().activeOperations,1);
  let finished=false;const closing=f.session.close().then(()=>{finished=true;});await microtasks();
  assert.equal(finished,false);assert.equal(f.lifecycle.includes('repository-close'),false);
  await assert.rejects(f.session.aiReader.readSnapshot({sourceScope:input.sourceScope,draftId:input.draftId}),failure('page_session_closed'));
  gate.resolve();await rejected;await closing;assert.equal(finished,true);assert.equal(f.session.blockingState().activeOperations,0);
  assert.equal(f.lifecycle.filter(value=>value==='repository-close').length,1);
  assert.ok(f.lifecycle.indexOf('repository-close')>f.lifecycle.indexOf('authority-close'));
});

test('reader and bound CMS routes accept explicit POST only and retain the exact route draft identity',()=>{
  for(const action of ['reader-preview','reader-adopt','begin-cms-attempt','create-unpublished-page','recheck-squarespace-save']) {
    const pathname=`/api/page-authoring/drafts/page-a/${action}`;
    assert.deepEqual(matchPageAuthoringRoute('POST',pathname),{name:'page-authoring',action,id:'page-a'});
    for(const method of ['GET','HEAD','DELETE'])assert.equal(matchPageAuthoringRoute(method,pathname),null);
    assert.equal(matchPageAuthoringRoute('POST',`/api/page-authoring/drafts/a%2Fb/${action}`),null);
    assert.equal(matchPageAuthoringRoute('POST',`/api/page-authoring/images/image-${randomUUID()}/${action}`),null);
  }
  assert.deepEqual(matchPageAuthoringRoute('HEAD','/api/page-authoring/drafts/page-a'),{name:'page-authoring',action:'get',id:'page-a'});
});

test('the Squarespace recheck route passes only the saved personal attempt identifiers', async t => {
  const received = [];
  const f = fixture(t, { factories: { createWorkspace(options) {
    const workspace = createExplorerPageWorkspace(options);
    return { ...workspace, recheckSquarespaceSave(input) { received.push(input); return { checked: true }; } };
  } } });
  const sourceScope = (await f.session.snapshot()).sourceScope;
  const payload = { sourceScope, draftId: 'page-a', attemptId: 'attempt-a', expectedStateRevision: sha256('attempt-state') };
  const request = { action: 'recheck-squarespace-save', id: payload.draftId, payload };
  assert.deepEqual(await f.session.operation(request), { checked: true });
  assert.deepEqual(received, [payload]);
  await assert.rejects(f.session.operation({ ...request, payload: { ...payload, saveBinding: {} } }), failure('invalid_fields'));
  await assert.rejects(f.session.operation({ ...request, id: 'page-b' }), failure('draft_identity_changed'));
  await assert.rejects(f.session.operation({ ...request, searchParams: new URLSearchParams({ scope: sourceScope }) }), failure('invalid_scope'));
  assert.equal(received.length, 1);
});

test('session reader dispatch passes strict saved-source bindings to the existing workspace without accepting renderer editorial data',async t=>{
  const received=[],preview={sourceScope:'scope-from-workspace',draftId:'page-a',token:'opaque-wrapper-token',expiresAt:'2026-11-02T10:00:00.000Z',
    beforeEditorial:{sections:[]},proposedEditorial:{title:'Geprüfte Fassung'},readerApproved:false,externalPublication:'not-performed'},
    queued={sourceScope:'scope-from-workspace',draftId:'page-a',queued:true,changeId:randomUUID(),speciesId:'fixture-owl',readerApproved:false,externalPublication:'not-performed'};
  const f=fixture(t,{factories:{createWorkspace(options){const workspace=createExplorerPageWorkspace(options);return {...workspace,
    readerPreview(input){received.push({action:'preview',input});return preview;},readerAdopt(input){received.push({action:'adopt',input});return queued;}};}}});
  const sourceScope=(await f.session.snapshot()).sourceScope,expectedRevision=sha256('saved-page'),expectedBindingRevision=sha256('saved-link');
  assert.deepEqual(await f.session.operation({action:'reader-preview',id:'page-a',payload:{sourceScope,expectedRevision,expectedBindingRevision},searchParams:new URLSearchParams()}),preview);
  assert.deepEqual(received[0],{action:'preview',input:{draftId:'page-a',sourceScope,expectedRevision,expectedBindingRevision}});
  assert.deepEqual(await f.session.operation({action:'reader-adopt',id:'page-a',payload:{sourceScope,token:preview.token}}),queued);
  assert.deepEqual(received[1],{action:'adopt',input:{draftId:'page-a',sourceScope,token:preview.token}});
  for(const action of ['reader-preview','reader-adopt']) {
    const payload=action==='reader-preview'?{sourceScope,expectedRevision,expectedBindingRevision}:{sourceScope,token:preview.token};
    await assert.rejects(f.session.operation({action,id:'page-a',payload:{...payload,data:{editorial:'renderer claim'}}}),failure('invalid_fields'));
    await assert.rejects(f.session.operation({action,id:'page-a',payload:{...payload,draftId:'another-page'}}),failure('draft_identity_changed'));
    await assert.rejects(f.session.operation({action,id:'page-a',payload,searchParams:new URLSearchParams({scope:sourceScope})}),failure('invalid_scope'));
  }
  assert.equal(received.length,2);assert.ok(!f.calls.some(call=>['sync','createObject','editExistingObject'].includes(call)));
});

test('session reader actions enforce actual offline, readonly-session and effective project permission barriers before a client stage',async t=>{
  const f=fixture(t),view=await f.create();
  const preview={action:'reader-preview',id:'page-a',payload:{sourceScope:view.sourceScope,expectedRevision:view.draft.revision,expectedBindingRevision:view.sync.bindingRevision}},
    adopt={action:'reader-adopt',id:'page-a',payload:{sourceScope:view.sourceScope,token:randomUUID()}};
  f.setStatus({connection:'offline'});await assert.rejects(f.session.operation(preview),failure('online_required'));
  // Even a stale canEdit:true claim cannot override the actual readonly session.
  f.setStatus({connection:'online',readOnlySession:true});await assert.rejects(f.session.operation(preview),failure('forbidden'));
  f.setStatus({readOnlySession:false});f.setState({permissions:{canRead:true,canEdit:false,canCreate:false,canApprove:false}});
  for(const input of [preview,adopt])await assert.rejects(f.session.operation(input),failure('forbidden'));
  assert.equal((await f.session.operation({action:'status'})).available,false);
  assert.ok(!f.calls.includes('sync'));assert.ok(!f.calls.includes('editExistingObject'));
});
