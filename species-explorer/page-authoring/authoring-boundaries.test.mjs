import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture,CLOCK } from './test-fixture.mjs';
import { clone,fingerprint } from './contract.mjs';
import { editableDocument,normalizeSpeciesSnapshot } from './model.mjs';
import { normalAssetUrls } from './compose.mjs';
import { encodePageAuthoringDraft,guardPageAuthoringTransition,pageAuthoringObjectId,validateStoredDocument } from './shared.mjs';

const fails = (promise,code) => assert.rejects(promise,error=>error.code === code);
const approvalInput = (f,d,p) => ({draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision,
  previewId:p.artifact.id,reportHash:p.report.reportHash,review:{texts:true,images:true,layout:true},missingAltAcknowledged:[]});
const target = path => ({path,parentPath:path.slice(0,path.lastIndexOf('/')),parentExists:true,online:true,exists:false,
  checkedAt:CLOCK,observationId:'fresh-target-observation'});

test('complete editorial work and explicit empty sections need no CMS target adapter, but CMS preparation does',async t=>{
  const f=fixture(t);delete f.authorities.targetAuthority;f.service=f.build(f.repository);
  let d=await f.ready();d=await f.save(d,document=>{document.sections.find(section=>section.id==='appearance').blocks=[];});
  d=(await f.service.confirmEmpty('contributor',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision,
    sectionId:'appearance',confirmed:true,reason:'Für diese Seite bewusst leer gelassen'})).draft;
  const {preview,approved}=await f.approval(d);
  assert.equal(preview.report.technicalReady,true);assert.equal(preview.report.publicVerification,'not-performed');
  assert.equal(f.targetCalls,0);assert.equal(f.repository.counts().cms_attempts,0);
  await fails(f.service.prepareCmsPlan('publisher',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision,
    approvalId:approved.artifact.id}),'target_authority_required');
  const kept=await f.service.getDraft('publisher',d.id);
  assert.equal(kept.draft.revision,d.revision);assert.equal(kept.approval.id,approved.artifact.id);assert.equal(kept.published,false);
  assert.equal(kept.cms,null);assert.equal(f.repository.counts().cms_attempts,0);
});

test('CMS attempt still requires its own fresh target authority and cannot reuse plan-time collision evidence',async t=>{
  const f=fixture(t),d=await f.ready(),plan=await f.plan(d),input={draftId:d.id,expectedRevision:d.revision,planId:plan.id};
  delete f.authorities.targetAuthority;const noAdapter=f.build(f.repository);
  await fails(noAdapter.beginCmsAttempt('publisher',{...input,mutationId:f.mutationId()}),'target_authority_required');
  for(const changes of [{exists:true},{parentExists:false},{online:false},{checkedAt:'2026-10-30T10:00:00Z'},
    {checkedAt:'2026-11-01T10:00:00Z'},{path:'/wildlife/anderer-bereich/test-art'}]) {
    f.authorities.targetAuthority={checkNew:async(_context,path)=>({...target(path),...changes})};
    const service=f.build(f.repository);
    await assert.rejects(service.beginCmsAttempt('publisher',{...input,mutationId:f.mutationId()}),
      error=>['target_not_new','target_observation_stale'].includes(error.code));
    assert.equal(f.repository.counts().cms_attempts,0);
  }
});

test('CMS preparation retains publication rights and offline restrictions before querying any target',async t=>{
  const f=fixture(t),d=await f.ready(),{approved}=await f.approval(d),input={draftId:d.id,expectedRevision:d.revision,approvalId:approved.artifact.id};
  let queried=0;f.authorities.targetAuthority.checkNew=async(_context,path)=>{queried++;return target(path);};
  await fails(f.service.prepareCmsPlan('contributor',{...input,mutationId:f.mutationId()}),'forbidden');
  await fails(f.service.prepareCmsPlan('offline',{...input,mutationId:f.mutationId()}),'forbidden');
  assert.equal(queried,0);assert.equal(f.repository.counts().cms_attempts,0);
});

test('trusted stable asset binding survives a German display-name change and shared canonical validation',async t=>{
  const f=fixture(t);f.species.commonName='Grüner Baumleguan';f.species.assetName='Gruener Leguan';
  const d=await f.ready(),read=f.open().read('project-a',d.id);
  assert.equal(read.document.species.commonName,'Grüner Baumleguan');assert.equal(read.document.species.assetName,'Gruener Leguan');
  assert.equal(normalAssetUrls(read.document.species).portrait,
    'https://felixkfm90.github.io/iucn-species-data/species-assets/Gruener%20Leguan/portrait.webp');
  const transport=encodePageAuthoringDraft(d);
  assert.deepEqual(guardPageAuthoringTransition({objectId:pageAuthoringObjectId(d.id),before:null,next:transport,
    actorRole:'contributor',projectId:'project-a'}),[]);
  assert.deepEqual(validateStoredDocument(clone(transport.document)),d.document);
});

test('old snapshots without explicit asset input retain their exact canonical document and content hashes',async t=>{
  const f=fixture(t),d=await f.ready(),normalized=normalizeSpeciesSnapshot(clone(f.species),'project-a',f.species.slug);
  assert.deepEqual(normalized,d.document.species);
  assert.equal(normalized.assetName,'Test-Art');
  const checked=normalizeSpeciesSnapshot(clone(d.document.species),'project-a',f.species.slug);
  assert.equal(fingerprint(checked),fingerprint(d.document.species));
  const shared=encodePageAuthoringDraft(d);assert.equal(shared.contentHash,d.contentHash);
  assert.equal(fingerprint(validateStoredDocument(clone(shared.document))),d.contentHash);
});

test('explicit asset bindings reject traversal, invalid file components and untrusted renderer overrides',async t=>{
  const f=fixture(t);
  for(const assetName of ['',null,'.','..','../Gruener Leguan','Gruener/Leguan','Gruener\\Leguan','C:\\privat','x?y',
    'x*y','x:y','x|y','x<y','x"y',' Gruener Leguan','Gruener Leguan.','Gruener Leguan ','name\u0000','name\u007f','NUL','aux.txt']) {
    assert.throws(()=>normalizeSpeciesSnapshot({...clone(f.species),assetName},'project-a',f.species.slug),error=>error.code==='invalid_asset_name',String(assetName));
  }
  const d=await f.create();
  await fails(f.save(d,document=>{document.assetName='Rendererablage';}),'invalid_fields');
  assert.equal((await f.service.getDraft('contributor',d.id)).draft.revision,d.revision);
});

test('actual species revision drift after preview blocks final approval without silently changing the draft',async t=>{
  const f=fixture(t),d=await f.ready(),preview=await f.service.preview('publisher',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision});
  f.species.revision='species-2';f.species.general[0].value='Frisch geänderte Artgrunddaten';
  await fails(f.service.approve('publisher',approvalInput(f,d,preview)),'species_source_changed');
  const kept=await f.service.getDraft('publisher',d.id);
  assert.deepEqual(kept.draft.document,d.document);assert.equal(kept.approval,null);assert.equal(kept.published,false);
});

test('actual data hash or stable asset drift blocks CMS preparation and begin even when media bytes remain available',async t=>{
  for(const phase of ['prepare','begin']) {
    const f=fixture(t),d=await f.ready(),{approved}=await f.approval(d);
    let plan;if(phase==='begin')plan=(await f.service.prepareCmsPlan('publisher',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision,approvalId:approved.artifact.id})).artifact;
    f.species.assetName='Stabile andere Ablage';f.species.dataSha256=fingerprint({source:'new'});
    const operation=phase==='prepare'?f.service.prepareCmsPlan('publisher',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision,approvalId:approved.artifact.id})
      :f.service.beginCmsAttempt('publisher',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision,planId:plan.id});
    await fails(operation,'species_source_changed');assert.equal(f.repository.counts().cms_attempts,0);
    assert.equal((await f.service.getDraft('publisher',d.id)).draft.revision,d.revision);
  }
});

test('source drift during a target observation is caught before a CMS plan or attempt can be journaled',async t=>{
  for(const phase of ['prepare','begin']) {
    const f=fixture(t),d=await f.ready(),{approved}=await f.approval(d);
    let plan;if(phase==='begin')plan=(await f.service.prepareCmsPlan('publisher',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision,approvalId:approved.artifact.id})).artifact;
    const before=f.repository.counts();
    f.authorities.targetAuthority.checkNew=async(_context,path)=>{f.species.revision='changed-during-target-read';return target(path);};
    const operation=phase==='prepare'?f.service.prepareCmsPlan('publisher',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision,approvalId:approved.artifact.id})
      :f.service.beginCmsAttempt('publisher',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision,planId:plan.id});
    await fails(operation,'species_source_changed');
    assert.equal(f.repository.counts().artifacts,before.artifacts);assert.equal(f.repository.counts().cms_attempts,0);
  }
});

test('explicit species refresh preserves all editorial work and empty decisions while invalidating old approval artifacts',async t=>{
  const f=fixture(t);let d=await f.ready();d=await f.save(d,document=>{
    document.title='Eigener genauer Seitentitel';document.sections.find(section=>section.id==='appearance').blocks=[];
    document.images.push({id:'image-b',assetId:'photo-b',alt:'Zweites Bild',caption:'Zweite eigene Beschriftung',decorative:false});
    document.images.reverse();
  });
  d=(await f.service.confirmEmpty('contributor',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision,sectionId:'appearance',confirmed:true,reason:'Bewusste Leerstelle bleibt erhalten'})).draft;
  const {preview,approved}=await f.approval(d),editable=editableDocument(d.document),empty=clone(d.document.emptyConfirmations);
  f.species.commonName='Neuer Anzeigename';f.species.assetName='Test-Art';f.species.revision='species-2';
  const refreshed=await f.service.refreshSpecies('contributor',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision});
  const next=refreshed.draft;
  assert.notEqual(next.revision,d.revision);assert.deepEqual(editableDocument(next.document),editable);
  assert.deepEqual(next.document.emptyConfirmations,empty);assert.equal(next.document.species.commonName,'Neuer Anzeigename');
  assert.equal(next.document.species.assetName,'Test-Art');assert.equal((await f.service.getDraft('publisher',d.id)).approval,null);
  assert.equal(f.repository.artifact('project-a',approved.artifact.id).revision,d.revision);
  await fails(f.service.approve('publisher',approvalInput(f,next,preview)),'stale_preview');
  await fails(f.service.prepareCmsPlan('publisher',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:next.revision,approvalId:approved.artifact.id}),'stale_approval');
  const fresh=await f.approval(next);assert.equal(fresh.preview.report.technicalReady,true);assert.equal(fresh.approved.artifact.revision,next.revision);
});

test('species refresh enforces online editor rights, CAS and persistent exact mutation replay without automatic subsequent refresh',async t=>{
  const f=fixture(t),d=await f.ready();
  await fails(f.service.refreshSpecies('reader',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision}),'forbidden');
  await fails(f.service.refreshSpecies('offline',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision}),'online_required');
  const changed=await f.save(d,document=>{document.title='Neuere eigene Arbeit';});
  await fails(f.service.refreshSpecies('contributor',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision}),'draft_conflict');
  f.species.revision='species-2';const input={draftId:d.id,mutationId:f.mutationId(),expectedRevision:changed.revision};
  const first=await f.service.refreshSpecies('contributor',input);f.species.revision='species-3';
  const replay=await f.build(f.open()).refreshSpecies('contributor',input);
  assert.equal(replay.idempotentReplay,true);assert.equal(replay.draft.revision,first.draft.revision);assert.equal(replay.draft.document.species.revision,'species-2');
  assert.equal((await f.service.getDraft('publisher',d.id)).draft.document.title,'Neuere eigene Arbeit');
  const updated=await f.service.refreshSpecies('contributor',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:first.draft.revision});
  assert.equal(updated.draft.document.species.revision,'species-3');
  const counts=f.repository.counts(),same=await f.service.refreshSpecies('contributor',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:updated.draft.revision});
  assert.equal(same.unchanged,true);assert.equal(same.draft.revision,updated.draft.revision);assert.equal(f.repository.counts().versions,counts.versions);
});

test('historical approval and plan mutation replay cannot bypass actual species-source drift',async t=>{
  const f=fixture(t),d=await f.ready(),preview=await f.service.preview('publisher',{draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision});
  const input=approvalInput(f,d,preview),approved=await f.service.approve('publisher',input);
  const planInput={draftId:d.id,mutationId:f.mutationId(),expectedRevision:d.revision,approvalId:approved.artifact.id};
  await f.service.prepareCmsPlan('publisher',planInput);
  assert.equal((await f.service.approve('publisher',input)).idempotentReplay,true);
  f.species.revision='species-2';
  await fails(f.service.approve('publisher',input),'species_source_changed');
  await fails(f.service.prepareCmsPlan('publisher',planInput),'species_source_changed');
  assert.equal(f.repository.counts().cms_attempts,0);
});
