import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fixture,actors,CLOCK } from './test-fixture.mjs';
import { fingerprint,sha256,clone,canonical } from './contract.mjs';
import { editableDocument } from './model.mjs';
import { createSqlitePageAuthoringRepository } from './repository.mjs';
import { listPageTemplates,FN_SPECIES_CODE,FN_MAP_CODE,FN_MODULE_IDS } from './templates.mjs';
import { normalAssetUrls } from './compose.mjs';
import { encodePageAuthoringDraft,pageAuthoringObjectId,guardPageAuthoringTransition,pageAuthoringServerEvidence,validatePageAuthoringServerEvidence,importPageAuthoringAsDraft,validatePageAuthoringObject } from './shared.mjs';

const fails = (promise,code) => assert.rejects(promise,error=>error.code === code);
test('two observed FN structures retain real nesting, levels, source hashes and distinct reproduction headings',()=>{
  const [compact,extended]=listPageTemplates();assert.equal(compact.titleLevel,3);assert.ok(compact.sections.every(item=>item.headingLevel===4));
  assert.equal(compact.sections.find(item=>item.id==='reproduction').title,'Brut');assert.equal(extended.sections.find(item=>item.id==='reproduction').title,'Fortpflanzung');
  assert.ok(extended.sections.some(item=>item.id==='development'));assert.ok(extended.sections.some(item=>item.id==='features'));
  assert.deepEqual(FN_MODULE_IDS,['species-output','species-info','species-taxonomy','species-status','species-sound','map-wrapper','map-output']);
  assert.match(FN_SPECIES_CODE,/^<div id="species-output">\n  <div id="species-info">/);assert.match(FN_MAP_CODE,/id="map-wrapper".*\n  <div id="map-output"/);
  assert.equal(compact.source.htmlSha256,'844a11724f439f2207bee2a671a34da6a0322248c51f130041a5dad48fec9452');
  assert.equal(extended.source.htmlSha256,'93435e74598679de2b45820e5c78fc279af690e2aeb84b534b9141699e7f586e');
});
test('new page requires online actual contributor and uses the real German-name asset path',async t=>{
  const f=fixture(t);await fails(f.create('offline'),'online_required');await fails(f.create('reader'),'forbidden');const d=await f.create();
  assert.equal(d.sequence,1);assert.equal(d.actorId,'bruder');assert.equal(f.targetCalls,1);assert.equal(normalAssetUrls(d.document.species).portrait,'https://felixkfm90.github.io/iucn-species-data/species-assets/Test-Art/portrait.webp');
});
test('renderer actor/role fields are rejected',async t=>{const f=fixture(t);await fails(f.create('contributor',{role:'publisher'}),'invalid_fields');assert.equal(f.repository.counts().drafts,0);});
test('new target collision and stale checks prevent creation without touching existing data',async t=>{
  const f=fixture(t);f.authorities.targetAuthority.checkNew=async(_c,p)=>({path:p,online:true,exists:true,checkedAt:CLOCK,observationId:'x'});
  await fails(f.create(),'target_not_new');assert.equal(f.repository.counts().drafts,0);
  f.authorities.targetAuthority.checkNew=async(_c,p)=>({path:p,parentPath:p.slice(0,p.lastIndexOf('/')),parentExists:true,online:true,exists:false,checkedAt:'2026-10-30T10:00:00Z',observationId:'x'});await fails(f.create(),'target_observation_stale');
});
test('existing draft edits work offline, retain exact punctuation, never call target/CMS',async t=>{
  const f=fixture(t);let d=await f.create();const targetCalls=f.targetCalls;d=await f.save(d,doc=>{doc.sections[1].blocks=[{type:'paragraph',text:'Gelieferter Text ohne Punkt'}];},'offline');
  assert.equal(d.sequence,2);assert.equal(d.document.sections[1].blocks[0].text,'Gelieferter Text ohne Punkt');assert.equal(f.targetCalls,targetCalls);
});
test('actual readers cannot mutate or persist preview; projects are isolated',async t=>{
  const f=fixture(t),d=await f.create();await fails(f.save(d,()=>{},'reader'),'forbidden');await fails(f.service.preview('reader',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision}),'forbidden');await fails(f.service.getDraft('foreign',d.id),'draft_not_found');
});
test('persisted CAS rejects another writer and survives a second connection/reopen',async t=>{
  const f=fixture(t),old=await f.create(),repo2=f.open(),service2=f.build(repo2);const d=await f.save(old,doc=>{doc.title='Neue Überschrift';});
  await fails(service2.saveDraft('contributor',{draftId:old.id,mutationId:f.mutationId(),expectedRevision:old.revision,document:editableDocument(old.document)}),'draft_conflict');
  assert.equal(repo2.read('project-a',d.id).revision,d.revision);f.repository.close();assert.equal(f.open().read('project-a',d.id).document.title,'Neue Überschrift');
});
test('durable mutation replay neither duplicates a version nor repeats new target observation',async t=>{
  const f=fixture(t),input={draftId:'draft-a',mutationId:f.mutationId(),templateId:'fn-compact-20261031',slug:'test-art',parentPath:'/wildlife/heimische-tierwelt'};
  const first=await f.service.createDraft('contributor',input),replay=await f.build(f.open()).createDraft('contributor',input);assert.equal(first.draft.revision,replay.draft.revision);assert.equal(replay.idempotentReplay,true);assert.equal(f.targetCalls,1);assert.equal(f.repository.counts().versions,1);
  await fails(f.service.createDraft('contributor',{...input,title:'Anders'}),'mutation_reused');
});
test('foreign SQLite file and missing local-storage confirmation are refused before modification',t=>{
  const f=fixture(t),filename=path.join(f.directory,'foreign.sqlite'),db=new DatabaseSync(filename);db.exec('CREATE TABLE keep(value TEXT);INSERT INTO keep VALUES (\'geschützt\');');db.close();const hash=sha256(fs.readFileSync(filename));
  assert.throws(()=>createSqlitePageAuthoringRepository({filename}),e=>e.code==='storage_confirmation_required');assert.throws(()=>createSqlitePageAuthoringRepository({filename,localStorageConfirmed:true}),e=>e.code==='foreign_repository');assert.equal(sha256(fs.readFileSync(filename)),hash);
});
test('requested missing sections remain open; module-backed Allgemein/map are not invented missing prose',async t=>{
  const f=fixture(t),d=await f.create(),p=await f.service.preview('contributor',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision});
  assert.equal(p.report.findings.filter(item=>item.code==='section_missing').length,6);assert.equal(p.report.technicalReady,false);assert.ok(!p.report.findings.some(item=>['general','map'].includes(item.id)));
});
test('explicit empty confirmation persists and never generates factual text',async t=>{
  const f=fixture(t);let d=await f.create();await fails(f.service.confirmEmpty('contributor',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision,sectionId:'appearance',confirmed:false,reason:'Bewusst leer'}),'empty_confirmation_required');
  d=(await f.service.confirmEmpty('contributor',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision,sectionId:'appearance',confirmed:true,reason:'Für diese Seite bewusst leer'})).draft;
  const confirmation=clone(d.document.emptyConfirmations.appearance);assert.equal(confirmation.actorId,'bruder');assert.deepEqual(d.document.sections[1].blocks,[]);
  d=await f.save(d,doc=>{doc.title='Titel geändert';});assert.deepEqual(d.document.emptyConfirmations.appearance,confirmation);
  d=await f.save(d,doc=>{doc.sections[1].title='Anderer Abschnitt';});assert.equal(d.document.emptyConfirmations.appearance,undefined);
});
test('clearing requested flag never bypasses explicit intentional-empty confirmation',async t=>{
  const f=fixture(t);let d=await f.create();d=await f.save(d,doc=>{for(const section of doc.sections)section.requested=false;doc.galleryRequested=false;});const p=await f.service.preview('publisher',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision});assert.equal(p.report.findings.filter(item=>item.code==='section_missing').length,6);assert.equal(p.report.technicalReady,false);
});
test('duplicate image IDs, fake renderer file paths and unsafe richtext are rejected',async t=>{
  const f=fixture(t),d=await f.ready();await fails(f.save(d,doc=>{doc.images.push({...doc.images[0]});}),'duplicate_id');
  await fails(f.save(d,doc=>{doc.images[0].path='C:\\private.jpg';}),'invalid_fields');await fails(f.save(d,doc=>{doc.sections[1].blocks=[{type:'html',text:'<script>alert(1)</script>'}];}),'unsafe_richtext');
  await fails(f.save(d,doc=>{doc.sections[1].blocks=[{type:'heading',level:1,text:'Titel'}];}),'unsafe_heading');
});
test('image format mismatch and missing managed media are explicit open results',async t=>{
  const f=fixture(t),d=await f.ready();f.bytes.set('photo-a',Buffer.alloc(f.metadata.get('photo-a').bytes));f.metadata.set('photo-a',{...f.metadata.get('photo-a'),sha256:sha256(f.bytes.get('photo-a'))});
  const changed=await f.save(d,doc=>{doc.images[0].caption='Metadaten neu gebunden';}),p=await f.service.preview('publisher',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:changed.revision});assert.ok(p.report.findings.some(item=>item.code==='media_format_mismatch'));assert.equal(p.report.technicalReady,false);
  f.bytes.delete('photo-a');const missing=await f.service.preview('publisher',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:changed.revision});assert.ok(missing.report.findings.some(item=>item.code==='media_missing'));
});
test('unsafe source URLs and cyclic/getter inputs are rejected without execution',async t=>{
  const f=fixture(t),d=await f.ready();await fails(f.save(d,doc=>{doc.sources=[{id:'bad',label:'Quelle',url:'javascript:alert(1)'}];}),'unsafe_url');
  await fails(f.save(d,doc=>{doc.sources=[{id:'private',label:'Quelle',url:'https://example.org/?token=private'}];}),'unsafe_url');
  const cyclic={};cyclic.self=cyclic;assert.throws(()=>canonical(cyclic),e=>e.code==='invalid_data');let called=false;const getter={};Object.defineProperty(getter,'x',{enumerable:true,get(){called=true;return 'x';}});assert.throws(()=>canonical(getter),e=>e.code==='invalid_data');assert.equal(called,false);
});
test('trusted media metadata is project-bound and cannot be substituted by renderer hashes',async t=>{
  const f=fixture(t),d=await f.ready();f.metadata.set('photo-a',{...f.metadata.get('photo-a'),projectId:'project-b'});await fails(f.save(d,doc=>{doc.images[0].caption='Geändert';}),'foreign_media');
});
test('preview escapes hostile text, exposes attribution, uses no external media/scripts and does not call target',async t=>{
  const f=fixture(t);let d=await f.ready();d=await f.save(d,doc=>{doc.title='<img src=x onerror=alert(1)>';doc.images[0].alt='" onerror="alert(2)';doc.images[0].caption='<script>alert(3)</script>';doc.sections[1].blocks=[{type:'paragraph',text:'<svg onload=alert(4)>'}];doc.sources=[{id:'source-a',label:'Vorhandene Quelle',url:'https://example.org/source'}];});
  const calls=f.targetCalls,p=await f.service.preview('contributor',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision});assert.equal(f.targetCalls,calls);assert.equal(p.report.technicalReady,true);
  assert.ok(!p.html.includes('<script>'));assert.ok(!p.html.includes('<svg'));assert.ok(p.html.includes('&lt;script&gt;'));assert.ok(p.html.includes('Felix · eigene Aufnahme'));assert.match(p.html,/connect-src &#39;none&#39;/);assert.ok(!/\b(?:src|href)="https?:/.test(p.html));assert.ok(!p.html.includes('<a '));assert.equal(p.report.modelReview,'not-performed');
});
test('image order and edited caption/alt remain exact in preview, structure and hash',async t=>{
  const f=fixture(t);let d=await f.ready();d=await f.save(d,doc=>{doc.images.push({id:'image-b',assetId:'photo-b',alt:'Zweites Motiv',caption:'Zweite Beschriftung',decorative:false});doc.images.reverse();});
  const p=await f.service.preview('contributor',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision});assert.deepEqual(p.structure.slots.at(-1).items.map(item=>item.id),['image-b','image-a']);assert.ok(p.html.indexOf('data-image="image-b"')<p.html.indexOf('data-image="image-a"'));assert.equal(p.structure.slots.at(-1).items[1].caption,'Beschriftung ohne Punkt');
});
test('exact full preview is required for human approval and contributors cannot approve',async t=>{
  const f=fixture(t),d=await f.ready(),preview=await f.service.preview('publisher',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision});
  const input={draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision,previewId:preview.artifact.id,reportHash:preview.report.reportHash,review:{texts:true,images:true,layout:true},missingAltAcknowledged:[]};
  await fails(f.service.approve('contributor',input),'forbidden');await fails(f.service.approve('publisher',{...input,review:{texts:true,images:true,layout:false}}),'review_required');
  const approved=await f.service.approve('publisher',input);assert.equal(approved.artifact.payload.contentHash,d.contentHash);assert.equal((await f.service.getDraft('contributor',d.id)).published,false);
});
test('missing alt can only be explicitly acknowledged for the exact currently missing image',async t=>{
  const f=fixture(t);let d=await f.ready();d=await f.save(d,doc=>{doc.images[0].alt='';});const p=await f.service.preview('publisher',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision});assert.equal(p.report.technicalReady,true);
  const input={draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision,previewId:p.artifact.id,reportHash:p.report.reportHash,review:{texts:true,images:true,layout:true},missingAltAcknowledged:[]};await fails(f.service.approve('publisher',input),'alt_acknowledgement_required');
  const approved=await f.service.approve('publisher',{...input,mutationId:f.mutationId(),missingAltAcknowledged:['image-a']});assert.deepEqual(approved.artifact.payload.missingAltAcknowledged,['image-a']);
});
test('a changed version clears active approval and old approval cannot prepare CMS',async t=>{
  const f=fixture(t),d=await f.ready(),{approved}=await f.approval(d),changed=await f.save(d,doc=>{doc.images[0].caption='Neue Bildunterschrift';});
  assert.equal((await f.service.getDraft('publisher',d.id)).approval,null);await fails(f.service.prepareCmsPlan('publisher',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:changed.revision,approvalId:approved.artifact.id}),'stale_approval');assert.equal(f.repository.artifact('project-a',approved.artifact.id).revision,d.revision);
});
test('file drift after preview prevents approval and file drift after approval prevents plan',async t=>{
  const f=fixture(t),d=await f.ready(),{preview,approved}=await f.approval(d);f.bytes.set('photo-a',Buffer.from('changed'));
  await fails(f.service.approve('publisher',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision,previewId:preview.artifact.id,reportHash:preview.report.reportHash,review:{texts:true,images:true,layout:true},missingAltAcknowledged:[]}),'stale_preview');
  await fails(f.service.prepareCmsPlan('publisher',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision,approvalId:approved.artifact.id}),'stale_approval');
});
test('actual plan composes real FN modules and ordered gallery but never invents an API or performs website action',async t=>{
  const f=fixture(t),d=await f.ready(),plan=await f.plan(d);assert.equal(plan.payload.publish,false);assert.equal(plan.payload.automaticRetry,false);assert.equal(plan.payload.requiresObservedEditorAdapter,true);assert.equal(plan.payload.structure.siteShell,'existing-fn-header-and-footer');
  assert.equal(plan.payload.structure.slots.find(slot=>slot.module==='existing-fn-species').code,FN_SPECIES_CODE);assert.equal(plan.payload.structure.slots.find(slot=>slot.module==='existing-fn-map').code,FN_MAP_CODE);assert.equal(plan.payload.structure.slots.at(-1).items[0].assetId,'photo-a');
  assert.ok(!canonical(plan).includes('selector'));assert.equal(f.repository.counts().cms_attempts,0);
});
async function attemptFixture(f) {const d=await f.ready(),plan=await f.plan(d),a=(await f.service.beginCmsAttempt('publisher',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision,planId:plan.id})).attempt;return {d,plan,a};}
async function dispatch(f,a) {return (await f.service.dispatchCmsAttempt('adapter',{mutationId:f.mutationId(),attemptId:a.id,expectedStateRevision:a.stateRevision,dispatchId:'dispatch-a'})).attempt;}
function receipt(plan,a,extra={}) {return {id:'receipt-a',attemptId:a.id,planHash:plan.payload.planHash,contentHash:plan.payload.contentHash,imagesHash:plan.payload.imagesHash,status:'saved-unpublished',pageId:'cms-page-a',path:plan.payload.target.path,unpublished:true,readbackStructureHash:plan.payload.structureHash,observedAt:CLOCK,...extra};}
test('CMS attempt journals once before dispatch, survives reopen, and never automatically retries',async t=>{
  const f=fixture(t),{d,plan,a}=await attemptFixture(f);assert.equal(a.status,'prepared');await fails(f.service.beginCmsAttempt('publisher',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision,planId:plan.id}),'cms_repeat_blocked');
  await fails(f.service.dispatchCmsAttempt('publisher',{mutationId:f.mutationId(),attemptId:a.id,expectedStateRevision:a.stateRevision,dispatchId:'dispatch-a'}),'trusted_adapter_required');const started=await dispatch(f,a);assert.equal(started.status,'dispatched');assert.equal(f.open().attempt('project-a',a.id).status,'dispatched');await fails(dispatch(f,started),'cms_repeat_blocked');
});
test('only trusted adapter receipt with matching readback can record unpublished save; never public success',async t=>{
  const f=fixture(t),{d,plan,a}=await attemptFixture(f);await dispatch(f,a);await fails(f.service.recordCmsOutcome('publisher',{attemptId:a.id,receipt:receipt(plan,a)}),'trusted_adapter_required');
  await fails(f.service.recordCmsOutcome('adapter',{attemptId:a.id,receipt:receipt(plan,a,{readbackStructureHash:fingerprint('wrong')})}),'cms_readback_mismatch');
  const done=await f.service.recordCmsOutcome('adapter',{attemptId:a.id,receipt:receipt(plan,a)});assert.equal(done.attempt.status,'saved-unpublished');assert.equal(done.attempt.repeatAllowed,false);const view=await f.service.getDraft('contributor',d.id);assert.equal(view.published,false);assert.equal(view.cms.matchesCurrentRevision,true);
});
test('duplicate exact receipts are idempotent; contradictory receipts become uncertain with no retry',async t=>{
  const f=fixture(t),{plan,a}=await attemptFixture(f);await dispatch(f,a);const input={attemptId:a.id,receipt:receipt(plan,a)};await f.service.recordCmsOutcome('adapter',input);const replay=await f.service.recordCmsOutcome('adapter',input);assert.equal(replay.idempotentReplay,true);
  const conflict=await f.service.recordCmsOutcome('adapter',{attemptId:a.id,receipt:receipt(plan,a,{id:'receipt-b',pageId:'different-page'})});assert.equal(conflict.attempt.status,'uncertain');assert.equal(conflict.attempt.uncertainty,'conflicting-receipts');assert.equal(conflict.attempt.repeatAllowed,false);
});
test('a success before dispatch stays uncertain; old receipts never apply to a newer draft',async t=>{
  const f=fixture(t),{d,plan,a}=await attemptFixture(f),done=await f.service.recordCmsOutcome('adapter',{attemptId:a.id,receipt:receipt(plan,a)});assert.equal(done.attempt.status,'uncertain');assert.equal(done.attempt.uncertainty,'receipt-before-dispatch');
  await f.save(d,doc=>{doc.title='Nächste Fassung';});assert.equal((await f.service.getDraft('publisher',d.id)).cms.matchesCurrentRevision,false);
});
test('shared object validates exact content/image binding; draft import removes untrusted approval',async t=>{
  const f=fixture(t),d=await f.ready(),{approved}=await f.approval(d),data=encodePageAuthoringDraft(d,{approval:approved.artifact.payload});
  assert.equal(data.title,d.document.title);assert.equal(data.type,'fn-species-page');const imported=importPageAuthoringAsDraft(data);assert.equal(imported.approval,null);assert.equal(imported.history[0].kind,'approval');
  const forged=clone(data);forged.document.images.reverse();forged.document.title='Forged';assert.throws(()=>validatePageAuthoringObject(forged),e=>e.code==='page_binding_mismatch');
});
test('shared server guard refuses forged publisher role in JSON and requires explicit real publisher adoption',async t=>{
  const f=fixture(t),d=await f.ready(),{approved}=await f.approval(d),data=encodePageAuthoringDraft(d,{approval:approved.artifact.payload}),id=pageAuthoringObjectId(d.id);
  assert.throws(()=>guardPageAuthoringTransition({objectId:id,before:null,next:data,actorRole:'contributor'}),e=>e.code==='forbidden');
  assert.throws(()=>guardPageAuthoringTransition({objectId:id,before:null,next:data,actorRole:'publisher'}),e=>e.code==='unproven_page_approval');
  data.adoptUnlinkedApprovals=true;const requirements=guardPageAuthoringTransition({objectId:id,before:null,next:data,actorRole:'publisher'});assert.equal(requirements.length,1);assert.equal(requirements[0].approvalHash,approved.artifact.payload.approvalHash);
});
test('server evidence accepts UUID+ordinal, rejects wrong binding and future ordinal; numeric compatibility retained',async t=>{
  const f=fixture(t),d=await f.ready(),{approved}=await f.approval(d),data=encodePageAuthoringDraft(d,{approval:approved.artifact.payload,adoptUnlinkedApprovals:true}),id=pageAuthoringObjectId(d.id);
  const request=guardPageAuthoringTransition({objectId:id,before:null,next:data,actorRole:'publisher'})[0],row={...request,objectId:id,objectRevision:'uuid-old',objectOrdinal:1,actorRole:'publisher',actorId:'felix',recordedAt:CLOCK};
  const evidence=pageAuthoringServerEvidence({objectId:id,objectRevision:'uuid-new',objectOrdinal:2,data,receipts:[row]});assert.equal(evidence.trusted,true);assert.equal(validatePageAuthoringServerEvidence({objectId:id,objectRevision:'uuid-new',objectOrdinal:2,data,evidence}).trusted,true);
  assert.equal(pageAuthoringServerEvidence({objectId:id,objectRevision:'uuid-new',objectOrdinal:0,data,receipts:[row]}).trusted,false);assert.equal(validatePageAuthoringServerEvidence({objectId:id,objectRevision:'uuid-other',objectOrdinal:2,data,evidence}).trusted,false);
  assert.equal(pageAuthoringServerEvidence({objectId:id,objectRevision:2,data,receipts:[{...row,objectRevision:1}]}).trusted,true);
});
test('contributor may retain only currently active server-proven approval, never reactivate history',async t=>{
  const f=fixture(t),d=await f.ready(),{approved}=await f.approval(d),data=encodePageAuthoringDraft(d,{approval:approved.artifact.payload,adoptUnlinkedApprovals:true}),id=pageAuthoringObjectId(d.id),request=guardPageAuthoringTransition({objectId:id,before:null,next:data,actorRole:'publisher'})[0],row={...request,actorRole:'publisher'};
  assert.deepEqual(guardPageAuthoringTransition({objectId:id,before:data,next:data,actorRole:'contributor',receipts:[row]}),[]);
  const draft=importPageAuthoringAsDraft(data);assert.throws(()=>guardPageAuthoringTransition({objectId:id,before:draft,next:{...data,history:draft.history},actorRole:'contributor',receipts:[row]}),e=>e.code==='forbidden');
  const lost=clone(draft);lost.history=[];assert.throws(()=>guardPageAuthoringTransition({objectId:id,before:draft,next:lost,actorRole:'publisher',receipts:[row]}),e=>e.code==='page_history_lost');
});
test('generic shared JSON can never manufacture a saved CMS result, even for publisher',async t=>{
  const f=fixture(t),{d,plan,a}=await attemptFixture(f),data=encodePageAuthoringDraft(d,{cms:{status:'saved-unpublished',attemptId:a.id,revision:d.revision,contentHash:d.contentHash,imagesHash:plan.payload.imagesHash,planHash:plan.payload.planHash,receiptHash:fingerprint('forged'),pageId:'fake',unpublished:true}});
  assert.throws(()=>guardPageAuthoringTransition({objectId:pageAuthoringObjectId(d.id),before:null,next:data,actorRole:'publisher'}),e=>e.code==='unproven_cms_outcome');
});
