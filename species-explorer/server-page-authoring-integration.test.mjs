import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { encodePageAuthoringDraft, pageAuthoringObjectId } from './page-authoring/shared.mjs';
import { fingerprint, sha256 } from './page-authoring/contract.mjs';
import { createPageAuthoringExplorerFixture } from './server-page-authoring-fixtures.mjs';
import { createCmsBoundSaveTestProof, createCmsReadbackTestProof } from './page-authoring/cms-readback-test-fixture.mjs';

const PUBLIC='https://felixkfm90.github.io/iucn-species-data/';
const ROOT='/api/page-authoring';
async function json(response,status,code) {
  const value=await response.json();
  assert.equal(response.status,status,JSON.stringify({code:value.code,error:value.error}));
  if(code!==undefined)assert.equal(value.code,code);
  return value;
}

test('offline Explorer restart retains queued pages and images, permits existing species edits, and only sends on explicit sync',async t=>{
  const f=await createPageAuthoringExplorerFixture(t),draftId='offline-restart-page',pagePath=`${ROOT}/drafts/${draftId}`;
  const speciesPath=`/api/shared-project/species/${f.record.id}`;
  await json(await f.post('/api/shared-project/connect',{baseUrl:f.address.url,username:f.a.user.username,password:f.project.password}),200);
  const {sourceScope}=await json(await fetch(`${f.base}${ROOT}`),200);
  let page=await json(await f.post(`${ROOT}/drafts`,{sourceScope,draftId,mutationId:randomUUID(),templateId:'fn-compact-20261031',slug:f.record.id,parentPath:'/wildlife/heimische-tierwelt'}),200);
  const image=await json(await f.post(`${ROOT}/images/import`,{sourceScope,dataBase64:f.photo.toString('base64'),attribution:'Eigenes Testfoto'}),200);
  const document={...page.editable,title:'Bereits gespeicherter lokaler Seitentext',images:[{
    id:'offline-gallery-image',assetId:image.image.id,alt:'Synthetische Aufnahme',caption:'Vor dem Neustart',decorative:false}]};
  page=await json(await f.post(`${pagePath}/save`,{sourceScope,mutationId:randomUUID(),expectedRevision:page.draft.revision,document}),200);
  assert.equal(page.sync.state,'queued');
  const remotePageId=pageAuthoringObjectId(draftId),beforePage=f.store.getObject(f.a.token,'page',remotePageId);
  const beforeSpecies=f.store.getObject(f.a.token,'species',f.record.id);
  const seenProject=f.projectRequests.length,seenPublic=f.publicRequests.length;
  f.setOffline(true);
  const first=await f.restart();
  const cached=await json(await fetch(`${first.base}${ROOT}`),200);
  assert.equal(cached.connection,'offline');assert.equal(cached.sourceScope,sourceScope);
  assert.equal(cached.permissions.canEdit,true);assert.equal(cached.permissions.canCreate,false);assert.equal(cached.permissions.canApprove,false);
  const local=await json(await fetch(`${first.base}${pagePath}`),200);
  assert.equal(local.sync.state,'queued');assert.equal(local.draft.revision,page.draft.revision);
  const media=await fetch(`${first.base}${ROOT}/images/${image.image.id}?scope=${sourceScope}`);
  assert.equal(media.status,200);assert.deepEqual(Buffer.from(await media.arrayBuffer()),f.photo);
  const updated={...local.editable,images:[{...local.editable.images[0],caption:'Nach dem Neustart offline geändert'}]};
  page=await json(await first.post(`${pagePath}/save`,{sourceScope,mutationId:randomUUID(),expectedRevision:local.draft.revision,document:updated}),200);
  assert.equal(page.sync.state,'queued');
  const shown=await json(await fetch(`${first.base}${speciesPath}`),200);
  const speciesPreview=await json(await first.post(`${speciesPath}/preview`,{sourceScope,expectedEditRevision:shown.editRevision,
    values:{germanName:shown.germanName,englishName:shown.englishName,scientificName:shown.scientificName,...shown.manual,size:'24 cm'}}),200);
  const species=await json(await first.post(`${speciesPath}/save`,{token:speciesPreview.token}),200);
  assert.equal(species.queued,true);assert.equal(species.species.manual.size,'24 cm');
  const second=await f.restart();
  assert.equal((await json(await fetch(`${second.base}${speciesPath}`),200)).manual.size,'24 cm');
  const persisted=await json(await fetch(`${second.base}${pagePath}`),200);
  assert.equal(persisted.draft.revision,page.draft.revision);assert.equal(persisted.editable.images[0].caption,updated.images[0].caption);
  assert.equal(f.projectRequests.length,seenProject);assert.equal(f.publicRequests.length,seenPublic);
  assert.deepEqual(f.store.getObject(f.a.token,'page',remotePageId),beforePage);
  assert.deepEqual(f.store.getObject(f.a.token,'species',f.record.id),beforeSpecies);
  assert.equal((await second.server.readLocalWorkState()).pendingChanges.hasPendingChanges,true);
  f.setOffline(false);
  await json(await second.post('/api/shared-project/refresh'),200);
  assert.deepEqual(f.store.getObject(f.a.token,'page',remotePageId),beforePage);
  const completed=await json(await second.post('/api/shared-project/sync'),200);
  assert.deepEqual(completed.pageAuthoringReconciliation,{checked:true,confirmed:1,conflicts:0});
  assert.equal(f.store.getObject(f.a.token,'page',remotePageId).data.document.images[0].caption,updated.images[0].caption);
  const remoteSpecies=f.store.getObject(f.a.token,'species',f.record.id);
  assert.equal(remoteSpecies.data.input.size,'24 cm');assert.equal(remoteSpecies.approvedRevision,null);
  const synced=await json(await fetch(`${second.base}${pagePath}`),200);
  assert.equal(synced.sync.state,'synced');assert.equal(synced.sync.localPending,false);
  assert.equal((await second.server.readLocalWorkState()).pendingChanges.hasPendingChanges,false);
  assert.equal(synced.published,false);
  for(let index=0;index<f.originalFiles.length;index++)assert.deepEqual(await readFile(join(f.repoRoot,f.originalFiles[index])),f.originalBytes[index]);
});

test('regular Explorer routes review and adopt a decided shared page conflict without a new remote version',async t=>{
  const f=await createPageAuthoringExplorerFixture(t),draftId='page-conflict-http',objectId=pageAuthoringObjectId(draftId),path=`${ROOT}/drafts/${draftId}`;
  await json(await f.post('/api/shared-project/connect',{baseUrl:f.address.url,username:f.a.user.username,password:f.project.password}),200);
  const {sourceScope}=await json(await fetch(`${f.base}${ROOT}`),200);
  let local=await json(await f.post(`${ROOT}/drafts`,{sourceScope,draftId,mutationId:randomUUID(),templateId:'fn-compact-20261031',slug:f.record.id,parentPath:'/wildlife/heimische-tierwelt'}),200);
  const initial=f.store.getObject(f.a.token,'page',objectId),localDocument={...local.editable,title:'Persönliche Fassung für den Verlauf'};
  local=await json(await f.post(`${path}/save`,{sourceScope,mutationId:randomUUID(),expectedRevision:local.draft.revision,document:localDocument}),200);
  const serverDocument={...initial.data.document,title:'Parallel bearbeitete gemeinsame Fassung'};
  f.store.submitChange(f.b.token,{changeId:'page-conflict-http-edit',kind:'page',id:objectId,baseRevision:initial.revision,
    data:encodePageAuthoringDraft({id:draftId,revision:fingerprint('http fixture remote revision'),document:serverDocument,contentHash:fingerprint(serverDocument)})});
  const completed=await json(await f.post('/api/shared-project/sync'),200);
  assert.deepEqual(completed.pageAuthoringReconciliation,{checked:true,confirmed:0,conflicts:1});
  local=await json(await fetch(`${f.base}${path}`),200);
  assert.equal(local.sync.state,'conflict');
  const input={sourceScope,expectedRevision:local.draft.revision,expectedBindingRevision:local.sync.bindingRevision};
  const preview=await json(await f.post(`${path}/conflict-preview`,input),200);
  assert.equal(preview.queueOpen,true);assert.equal(preview.serverDocument.title,serverDocument.title);assert.equal(preview.localDocument.title,localDocument.title);
  await json(await f.post(`${path}/conflict-preview?scope=${sourceScope}`,input),400,'invalid_scope');
  const [conflict]=await json(await fetch(`${f.base}/api/shared-project/conflicts`),200);
  assert.match(conflict.pageReview.hash,/^[a-f0-9]{64}$/);
  const decision={expectedRevision:preview.serverRevision,pageChoice:{reviewHash:conflict.pageReview.hash,changeId:null}};
  await json(await f.post(`/api/shared-project/conflicts/${conflict.id}/resolve`,{...decision,pageChoice:{...decision.pageChoice,reviewHash:'0'.repeat(64)}}),409,'conflict_review_changed');
  await json(await f.post(`/api/shared-project/conflicts/${conflict.id}/resolve`,decision),200);
  const ready=await json(await f.post(`${path}/conflict-preview`,input),200);assert.equal(ready.queueOpen,false);
  const before=f.store.getObject(f.a.token,'page',objectId);
  const updated=await json(await f.post(`${path}/conflict-adopt`,{...input,serverRevision:ready.serverRevision,serverDataHash:ready.serverDataHash,mutationId:randomUUID(),confirmed:true}),200);
  assert.equal(updated.draft.document.title,serverDocument.title);assert.equal(updated.draft.parentRevision,local.draft.revision);
  assert.equal(updated.approval,null);assert.equal(updated.cms,null);assert.equal(updated.published,false);
  assert.deepEqual(f.store.getObject(f.a.token,'page',objectId),before);
});

for (const chooseLocal of [true,false]) test(`two retained local page versions support an explicit ${chooseLocal?'local':'server'} choice against the latest server revision`,async t=>{
  const f=await createPageAuthoringExplorerFixture(t),draftId='page-followups-http',objectId=pageAuthoringObjectId(draftId),path=`${ROOT}/drafts/${draftId}`;
  await json(await f.post('/api/shared-project/connect',{baseUrl:f.address.url,username:f.a.user.username,password:f.project.password}),200);
  const {sourceScope}=await json(await fetch(`${f.base}${ROOT}`),200);
  let local=await json(await f.post(`${ROOT}/drafts`,{sourceScope,draftId,mutationId:randomUUID(),templateId:'fn-compact-20261031',slug:f.record.id,parentPath:'/wildlife/heimische-tierwelt'}),200);
  async function save(title) {local=await json(await f.post(`${path}/save`,{sourceScope,mutationId:randomUUID(),expectedRevision:local.draft.revision,document:{...local.editable,title}}),200);}
  await save('Erster lokaler Entwurf');
  f.setChangeRequestsUncertain(true);
  local=await json(await f.post(`${path}/sync`,{sourceScope,expectedRevision:local.draft.revision,expectedBindingRevision:local.sync.bindingRevision}),200);
  assert.equal(local.sync.errorCode,'offline');
  await save('Zweiter lokaler Entwurf');
  const history=[{kind:'approval',decision:{marker:'historische Serverentscheidung'}}];
  function foreign(title,base){const document={...base.data.document,title};return f.store.submitChange(f.b.token,{changeId:randomUUID(),kind:'page',id:objectId,baseRevision:base.revision,
    data:encodePageAuthoringDraft({id:draftId,revision:fingerprint(title),document,contentHash:fingerprint(document)},{history})}).object;}
  const firstServer=foreign('Änderung am zweiten PC',f.store.getObject(f.b.token,'page',objectId));
  f.setChangeRequestsUncertain(false);
  await json(await f.post('/api/shared-project/sync'),200);
  const getConflict=async()=> (await json(await fetch(`${f.base}/api/shared-project/conflicts`),200))[0];
  let conflict=await getConflict();
  assert.deepEqual(conflict.localVersions.map(version=>version.data.document.title),['Erster lokaler Entwurf','Zweiter lokaler Entwurf']);
  const resolve=entry=>f.post(`/api/shared-project/conflicts/${entry.id}/resolve`,{expectedRevision:entry.latestServer.revision,
    pageChoice:{reviewHash:entry.pageReview.hash,changeId:chooseLocal?entry.localVersions[1].changeId:null}});
  const newerServer=foreign('Spätere Änderung am zweiten PC',firstServer);
  await json(await resolve(conflict),409,'object_changed');
  assert.deepEqual(f.store.getObject(f.b.token,'page',objectId),newerServer);
  await json(await f.post('/api/shared-project/refresh'),200);
  conflict=await getConflict();
  assert.equal(conflict.latestServer.revision,newerServer.revision);
  const chosen=await json(await resolve(conflict),200);
  assert.equal(chosen.data.document.title,chooseLocal?'Zweiter lokaler Entwurf':'Spätere Änderung am zweiten PC');
  if(!chooseLocal)assert.equal(chosen.revision,newerServer.revision);
  assert.deepEqual(chosen.data.history,history);
  assert.equal(chosen.data.approval,null);assert.equal(chosen.data.cms,null);
  assert.equal(chosen.localPending,false);assert.equal(chosen.localConflict,false);
  assert.equal(f.store.getObject(f.b.token,'page',objectId).revision,chosen.revision);
});

for(const recover of [false,true])test(recover ? 'HTTP recheck confirms only the already bound draft after an Explorer restart'
  : 'bound CMS HTTP actions use the borrowed Node adapter and keep synthetic readback distinct from public publication',async t=>{
  const calls=[];let f,observed;
  const cmsAdapter={pageAuthoringAvailable:true,async checkNewTarget(path){calls.push('target');return {path,exists:false,parentPath:path.slice(0,path.lastIndexOf('/')),
    parentExists:true,online:true,observationId:randomUUID(),checkedAt:new Date().toISOString()};},
  async createUnpublishedPage(payload,{beforeWrite,assertCurrent,readMedia,rememberSaveBinding,signal}) {
    calls.push('browser');signal.throwIfAborted();const dispatch=await beforeWrite({signal});calls.push('dispatched');await assertCurrent();
    const gallery=payload.structure.slots.find(slot=>slot.type==='gallery');
    for(const image of gallery.items)assert.deepEqual(await readMedia(image.assetId),f.photo);
    if(recover) {
      observed=createCmsBoundSaveTestProof(payload,dispatch);
      await rememberSaveBinding(observed.binding);
      throw Object.assign(new Error('Synthetic save response lost'),{code:'SQUARESPACE_PAGE_SAVE_UNCONFIRMED'});
    }
    return createCmsReadbackTestProof({payload});
  },async recheckUnpublishedPage(payload,{saveBinding,assertCurrent,signal,...options}) {
    calls.push('recheck');assert.equal(recover,true);assert.equal(payload.planHash,observed.binding.planHash);
    assert.deepEqual(options,{});assert.deepEqual(saveBinding,observed.binding);signal.throwIfAborted();await assertCurrent();
    return observed.proof;
  }};
  f=await createPageAuthoringExplorerFixture(t,{cmsAdapter});
  await json(await f.post('/api/shared-project/connect',{baseUrl:f.address.url,username:f.a.user.username,password:f.project.password}),200);
  const state=await json(await fetch(`${f.base}${ROOT}`),200);assert.equal(state.cmsAvailable,true);
  const sourceScope=state.sourceScope,draftId='cms-http-fixture',path=`${ROOT}/drafts/${draftId}`;
  let page=await json(await f.post(`${ROOT}/drafts`,{sourceScope,draftId,mutationId:randomUUID(),templateId:'fn-compact-20261031',slug:f.record.id,parentPath:'/wildlife/heimische-tierwelt'}),200);
  const image=await json(await f.post(`${ROOT}/images/import`,{sourceScope,dataBase64:f.photo.toString('base64'),attribution:'Nur synthetische CMS-Prüfung'}),200);
  const document=structuredClone(page.editable);
  for(const section of document.sections)if(!['general','map'].includes(section.id))section.blocks=[{type:'paragraph',text:`Synthetischer Fachtext ${section.id}`}];
  document.images=[{id:'cms-http-image',assetId:image.image.id,alt:'Synthetische Aufnahme',caption:'Geprüfte Beschriftung',decorative:false}];
  page=await json(await f.post(`${path}/save`,{sourceScope,mutationId:randomUUID(),expectedRevision:page.draft.revision,document}),200);
  const expectedRevision=page.draft.revision,preview=await json(await f.post(`${path}/preview`,{sourceScope,mutationId:randomUUID(),expectedRevision}),200);
  page=await json(await f.post(`${path}/approve`,{sourceScope,mutationId:randomUUID(),expectedRevision,previewId:preview.artifact.id,
    reportHash:preview.report.reportHash,review:{texts:true,images:true,layout:true},missingAltAcknowledged:[]}),200);
  const plan=await json(await f.post(`${path}/prepare-cms-plan`,{sourceScope,mutationId:randomUUID(),expectedRevision,approvalId:page.approval.id}),200);
  const begun=await json(await f.post(`${path}/begin-cms-attempt`,{sourceScope,mutationId:randomUUID(),expectedRevision,planId:plan.artifact.id}),200);
  assert.equal(begun.cms.status,'prepared');assert.equal(calls.includes('browser'),false);
  const execute={sourceScope,draftId,attemptId:begun.cms.id,expectedStateRevision:begun.cms.stateRevision};
  await json(await f.post(`${path}/create-unpublished-page`,{...execute,readback:{page:{enabled:false}},role:'admin'}),400,'invalid_fields');
  let done=await json(await f.post(`${path}/create-unpublished-page`,execute),200);
  const active=recover ? await f.restart() : f;
  if(recover) {
    assert.equal(done.cms.status,'uncertain');assert.equal(done.cms.canRecheckSave,true);
    await json(await active.post('/api/shared-project/refresh'),200);
    const pending=await json(await fetch(`${active.base}${path}`),200);
    assert.equal(pending.connection,'online');
    assert.equal(pending.cms.canRecheckSave,true);
    const recheck={...execute,expectedStateRevision:pending.cms.stateRevision};
    await json(await active.post(`${path}/recheck-squarespace-save`,{...recheck,saveBinding:observed.binding}),400,'invalid_fields');
    done=await json(await active.post(`${path}/recheck-squarespace-save`,recheck),200);
    assert.equal(done.cms.canRecheckSave,false);
    assert.equal(calls.filter(call=>call==='recheck').length,1);
  }
  assert.equal(done.cms.status,'saved-unpublished');assert.equal(done.cms.matchesCurrentRevision,true);assert.equal(done.published,false);
  assert.equal(done.externalPublication,'not-performed');assert.equal(done.cms.receipt.schemaVersion,2);
  assert.equal(done.cms.receipt.readback.page.enabled,false);assert.equal(done.cms.receipt.mediaBindings[0].assetId,image.image.id);
  await json(await active.post(`${path}/create-unpublished-page`,execute),409,'cms_repeat_blocked');
  assert.equal(calls.filter(call=>call==='browser').length,1);
  const remote=f.store.getObject(f.a.token,'page',pageAuthoringObjectId(draftId));
  assert.equal(remote.data.cms,null,'local CMS proof does not invent a trusted shared execution receipt');
  for(let index=0;index<f.originalFiles.length;index++)assert.deepEqual(await readFile(join(f.repoRoot,f.originalFiles[index])),f.originalBytes[index]);
});

test('echter Explorer verbindet Artseitenredaktion, verwaltete Bilder und interne Freigabe mit Shared HTTP und erhält Originaldateien',async t=>{
  const f=await createPageAuthoringExplorerFixture(t);
  const loggedOut=await json(await fetch(`${f.base}${ROOT}`),200);
  assert.equal(loggedOut.available,false);assert.deepEqual(loggedOut.drafts,[]);assert.equal(f.publicRequests.length,0);
  await t.test('fremder Browserursprung und fehlende lokale Sitzung werden vor jeder Entwurfsaktion abgewiesen',async()=>{
    await json(await fetch(`${f.base}${ROOT}`,{headers:{Origin:'https://foreign.example','Sec-Fetch-Site':'cross-site'}}),403);
    await json(await fetch(`${f.base}${ROOT}/drafts`,{method:'POST',headers:{'Content-Type':'application/json',Origin:f.base},body:'{}'}),403);
    await json(await f.post(`${ROOT}/drafts`,{}, {Origin:'https://foreign.example'}),403);
    assert.equal(f.store.listObjects(f.a.token).filter(object=>object.kind==='page').length,0);
  });
  await json(await f.post('/api/shared-project/connect',{baseUrl:f.address.url,username:f.a.user.username,password:f.project.password}),200);
  const status=await json(await fetch(`${f.base}${ROOT}`),200);
  assert.equal(status.available,true);assert.equal(status.permissions.canApprove,true);assert.equal(status.templates.length,2);
  assert.equal(f.publicRequests.length,0,'status reads only cached/local state');
  const sourceScope=status.sourceScope,badScope=sourceScope==='a'.repeat(64)?'b'.repeat(64):'a'.repeat(64),draftId='http-page-fixture';
  const createInput={sourceScope,draftId,mutationId:randomUUID(),templateId:'fn-compact-20261031',slug:f.record.id,parentPath:'/wildlife/heimische-tierwelt'};
  await t.test('ungültige Fachfelder ergeben HTTP 400 statt eines internen Serverfehlers',async()=>{
    await json(await f.post(`${ROOT}/drafts`,{...createInput,mutationId:randomUUID(),role:'admin'}),400,'invalid_fields');
  });
  await t.test('eine fremde persönliche Quellenbindung ergibt HTTP 409 und erstellt keine Seite',async()=>{
    await json(await f.post(`${ROOT}/drafts`,{...createInput,mutationId:randomUUID(),sourceScope:badScope}),409,'workspace_changed');
    assert.equal(f.store.listObjects(f.a.token).filter(object=>object.kind==='page').length,0);
  });
  let page=await json(await f.post(`${ROOT}/drafts`,createInput),200);
  assert.equal(page.draft.document.species.runtimeReady,true);assert.equal(page.draft.document.species.assetName,'Amsel');
  assert.equal(page.draft.document.species.slug,f.record.id);assert.equal(page.sync.state,'synced');assert.equal(page.cms,null);
  assert.equal(JSON.stringify(page).includes('private original'),false);
  const createdRevision=page.draft.revision,objectId=pageAuthoringObjectId(draftId),initialRemote=f.store.getObject(f.a.token,'page',objectId);
  const image=await json(await f.post(`${ROOT}/images/import`,{sourceScope,dataBase64:f.photo.toString('base64'),attribution:'Eigene synthetische Aufnahme'}),200);
  assert.match(image.image.id,/^image-[a-f0-9-]{36}$/);assert.equal(image.image.localAvailable,true);assert.equal(image.image.remoteBacked,false);
  assert.equal(image.image.sha256,sha256(f.photo));assert.equal(Object.hasOwn(image.image,'buffer'),false);
  const beforeUpload=await fetch(`${f.address.url}/api/v1/media/${image.image.id}`,{headers:{Authorization:`Bearer ${f.a.token}`}});
  assert.equal(beforeUpload.status,404);await beforeUpload.text();
  const imagePath=`${ROOT}/images/${image.image.id}`;
  await t.test('die Bildroute verlangt Browserursprung und eindeutige aktuelle Quellenbindung',async()=>{
    await json(await fetch(`${f.base}${imagePath}`),400,'invalid_image_scope');
    await json(await fetch(`${f.base}${imagePath}?scope=${sourceScope}`,{headers:{Origin:'https://foreign.example','Sec-Fetch-Site':'cross-site'}}),403);
    await json(await fetch(`${f.base}${imagePath}?scope=${badScope}`),409,'workspace_changed');
  });
  const served=await fetch(`${f.base}${imagePath}?scope=${sourceScope}`);
  assert.equal(served.status,200);assert.equal(served.headers.get('content-type'),'image/png');
  assert.equal(served.headers.get('x-content-type-options'),'nosniff');assert.equal(served.headers.get('cache-control'),'no-store');
  assert.deepEqual(Buffer.from(await served.arrayBuffer()),f.photo);
  const document=structuredClone(page.editable);document.title='Vollständiger synthetischer Amselentwurf';
  document.introduction=[{type:'paragraph',text:'Nur synthetischer Prüfinhalt, keine Veröffentlichung.'}];
  for(const section of document.sections)if(!['general','map'].includes(section.id))section.blocks=[{type:'paragraph',text:`Gelieferter synthetischer Fachtext für ${section.id}`}];
  document.images=[{id:'gallery-use-one',assetId:image.image.id,alt:'Synthetisches Amsel-Prüfbild',caption:'Bewusst erhaltene Beschriftung ohne Punkt',decorative:false}];
  page=await json(await f.post(`${ROOT}/drafts/${draftId}/save`,{sourceScope,mutationId:randomUUID(),expectedRevision:page.draft.revision,document}),200);
  assert.equal(page.sync.state,'queued');assert.equal(page.draft.document.images[0].asset.sha256,image.image.sha256);
  assert.equal(page.draft.document.images[0].caption,document.images[0].caption);
  const savedRevision=page.draft.revision;
  await t.test('veraltetes Entwurfs-CAS ergibt HTTP 409 und überschreibt keine neuere Fassung',async()=>{
    await json(await f.post(`${ROOT}/drafts/${draftId}/save`,{sourceScope,mutationId:randomUUID(),expectedRevision:createdRevision,document}),409,'draft_conflict');
    const kept=await json(await fetch(`${f.base}${ROOT}/drafts/${draftId}`),200);assert.equal(kept.draft.revision,savedRevision);
  });
  const preview=await json(await f.post(`${ROOT}/drafts/${draftId}/preview`,{sourceScope,mutationId:randomUUID(),expectedRevision:savedRevision}),200);
  assert.equal(preview.report.technicalReady,true,JSON.stringify(preview.report.findings));
  assert.equal(preview.report.publicVerification,'not-performed');assert.equal(preview.artifact.kind,'preview');
  assert.match(preview.html,/Bewusst erhaltene Beschriftung ohne Punkt/);assert.match(preview.html,/data:image\/png;base64,/);
  assert.equal(f.store.getObject(f.a.token,'page',objectId).revision,initialRemote.revision,'preview never synchronizes');
  page=await json(await f.post(`${ROOT}/drafts/${draftId}/approve`,{sourceScope,mutationId:randomUUID(),expectedRevision:savedRevision,
    previewId:preview.artifact.id,reportHash:preview.report.reportHash,review:{texts:true,images:true,layout:true},missingAltAcknowledged:[]}),200);
  assert.equal(page.approval.revision,savedRevision);assert.equal(page.sync.sharedApprovalConfirmed,false);
  assert.equal(page.externalPublication,'not-performed');assert.equal(page.published,false);assert.equal(page.cms,null);
  assert.equal(f.store.getObject(f.a.token,'page',objectId).revision,initialRemote.revision,'human review does not silently sync');
  const completed=await json(await f.post('/api/shared-project/sync'),200);
  assert.deepEqual(completed.pageAuthoringReconciliation,{checked:true,confirmed:1,conflicts:0});
  page=await json(await fetch(`${f.base}${ROOT}/drafts/${draftId}`),200);
  assert.equal(page.sync.state,'synced');assert.equal(page.sync.localPending,false);assert.equal(page.sync.sharedApprovalConfirmed,true);
  const persisted=f.store.getObject(f.a.token,'page',objectId);
  assert.equal(persisted.data.revision,savedRevision);assert.equal(persisted.data.document.images[0].asset.sha256,sha256(f.photo));
  assert.equal(persisted.pageAuthoringEvidence.trusted,true);assert.equal(persisted.pageAuthoringEvidence.approvals.length,1);
  assert.equal(persisted.data.cms,null);assert.equal(persisted.approvedRevision,null,'no generic catalog or public publication is invented');
  const remoteImage=f.store.getImageMedia(f.a.token,image.image.id);assert.equal(remoteImage.complete,true);assert.equal(remoteImage.sha256,sha256(f.photo));
  const metadata=await json(await fetch(`${f.base}${imagePath}/metadata?scope=${sourceScope}`),200);
  assert.equal(metadata.image.localAvailable,true);assert.equal(metadata.image.remoteBacked,true);assert.equal(metadata.sourceScope,sourceScope);
  await t.test('fehlende CMS-Zielautorität bleibt HTTP 409 und erzeugt keinen CMS-Plan oder Schreibversuch',async()=>{
    await json(await f.post(`${ROOT}/drafts/${draftId}/prepare-cms-plan`,{sourceScope,mutationId:randomUUID(),expectedRevision:savedRevision,approvalId:page.approval.id}),
      409,'target_authority_required');
  });
  const changed=f.store.updateUser(f.b.token,f.a.user.id,{expectedVersion:f.a.user.version,role:'reader'});
  try {
    await json(await f.post('/api/shared-project/refresh'),200);
    const reader=await json(await fetch(`${f.base}${ROOT}`),200);assert.equal(reader.available,false);assert.deepEqual(reader.drafts,[]);
    await t.test('tatsächlich entzogene Redaktionsrechte ergeben HTTP 403 für private Entwürfe und Bildbytes',async()=>{
      await json(await fetch(`${f.base}${ROOT}/drafts/${draftId}`),403,'forbidden');
      await json(await fetch(`${f.base}${imagePath}?scope=${sourceScope}`),403,'forbidden');
    });
  }finally {
    f.store.updateUser(f.b.token,f.a.user.id,{expectedVersion:changed.version,role:'admin'});
    await json(await f.post('/api/shared-project/refresh'),200);
  }
  const final=await json(await fetch(`${f.base}${ROOT}/drafts/${draftId}`),200);
  assert.equal(final.draft.revision,savedRevision);assert.equal(final.draft.document.images[0].caption,document.images[0].caption);
  assert.equal(final.published,false);assert.equal(final.cms,null);
  assert.deepEqual(await Promise.all(f.originalFiles.map(filename=>readFile(join(f.repoRoot,filename)))),f.originalBytes);
  assert.ok(f.publicRequests.length>0);assert.ok(f.publicRequests.every(request=>request.url.startsWith(PUBLIC)));
  assert.ok(['jpeg','webp','png'].every(format=>f.decodeCalls.some(call=>call.format===format)));
  await f.server.close();await f.server.close();assert.equal(f.authorityCloseCount(),1);assert.equal(f.server.server.listening,false);
  const db=new DatabaseSync(f.authoringFile,{readOnly:true});
  try {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,1);
    const scopes=db.prepare('SELECT * FROM workspace_scopes').all();assert.equal(scopes.length,1);assert.equal(scopes[0].actor_id,f.a.user.id);assert.equal(scopes[0].origin,f.address.url);
    for(const table of ['cms_attempts','cms_receipts'])assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}_${scopes[0].scope_id}`).get().n,0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='table' AND name LIKE '%image_blobs%'").get().n,0);
  }finally{db.close();}
  assert.deepEqual(await Promise.all(f.originalFiles.map(filename=>readFile(join(f.repoRoot,filename)))),f.originalBytes);
});
