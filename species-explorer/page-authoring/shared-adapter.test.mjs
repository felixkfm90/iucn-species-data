import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fixture as localFixture,actors } from './test-fixture.mjs';
import { fixture as sharedFixture } from '../shared-project/test-fixtures.mjs';
import { createSharedProjectHttp } from '../shared-project/http.mjs';
import { createSharedProjectClient,createMemoryCredentialStore } from '../shared-project/client.mjs';
import { createSharedPageDraftAdapter } from './shared-adapter.mjs';
import { encodePageAuthoringDraft,pageAuthoringObjectId } from './shared.mjs';
import { clone,fingerprint } from './contract.mjs';

async function scoped(t,fn) {
  const local=localFixture(t),f=sharedFixture(),clients=[];let http;
  try {
    const {store,a,b}=await f.initialized();http=createSharedProjectHttp({store});const address=await http.listen(),projectId=a.projectId;
    const authority={resolve:async context=>({...actors[context],projectId})};let offline=false;
    local.authorities.actorAuthority.resolve=authority.resolve;
    for(const metadata of local.metadata.values())metadata.projectId=projectId;
    function client(filename='cache.sqlite',credentialStore=createMemoryCredentialStore()) {const c=createSharedProjectClient({filename:path.join(f.root,filename),localStorageConfirmed:true,allowLoopbackHttp:true,credentialStore,
      fetchImpl:async(...args)=>{if(offline)throw new Error('synthetic offline');return fetch(...args);}});clients.push(c);return c;}
    const credentials=createMemoryCredentialStore(),c=client('cache.sqlite',credentials),status=await c.connect({baseUrl:address.url,username:a.user.username,password:f.password});assert.equal(status.projectId,projectId);
    const draft=await local.ready();
    const adapter=createSharedPageDraftAdapter({client:c,actorAuthority:authority});
    await fn({local,f,store,a,b,c,client,credentials,adapter,draft,projectId,authority,setOffline(value){offline=value;}});
  } finally {for(const c of clients)await c.close();if(http)await http.close();f.cleanup();}
}
test('actual shared HTTP create and cache retain a complete typed FN draft and bind true project media',t=>scoped(t,async({adapter,draft,store,a})=>{
  const created=await adapter.create('publisher',draft);assert.equal(created.data.type,'fn-species-page');assert.equal(created.evidence.trusted,true);assert.equal(created.data.document.sections.length,8);
  const persisted=store.getObject(a.token,'page',pageAuthoringObjectId(draft.id));assert.equal(persisted.data.document.images[0].asset.sha256,draft.document.images[0].asset.sha256);
  const read=await adapter.read('contributor',draft.id);assert.equal(read.data.contentHash,created.data.contentHash);
}));
test('actual SharedProjectClient offline queue survives reopen and syncs the complete edited draft by server CAS',t=>scoped(t,async({adapter,draft,c,client,credentials,authority,setOffline})=>{
  const created=await adapter.create('publisher',draft);setOffline(true);
  const next=clone(draft);next.document.title='Offline gelieferte Überschrift';next.revision=fingerprint({fixtureRevision:'offline'});
  const queued=await adapter.queue('offline',{pageId:draft.id,data:encodePageAuthoringDraft(next),expectedObjectRevision:created.object.revision,expectedDataHash:fingerprint(created.data)});assert.equal(queued.localPending,true);assert.equal(queued.data.document.title,next.document.title);
  await assert.rejects(adapter.synchronize('publisher',draft.id),error=>error.code==='offline');assert.equal((await c.status()).pending,1);await c.close();
  const reopened=client('cache.sqlite',credentials),reader=createSharedPageDraftAdapter({client:reopened,actorAuthority:authority});
  assert.equal((await reopened.status()).pending,1);assert.equal((await reader.read('contributor',draft.id)).data.document.title,next.document.title);setOffline(false);
  const synced=await reader.synchronize('publisher',draft.id);assert.equal(synced.localPending,false);assert.equal(synced.data.document.title,next.document.title);assert.equal(synced.object.ordinal,2);
}));
test('a genuine foreign shared revision preserves both versions and exposes conflict instead of overwriting',t=>scoped(t,async({adapter,draft,store,b,setOffline})=>{
  const created=await adapter.create('publisher',draft),local=clone(draft);local.document.title='Eigener Entwurf';local.revision=fingerprint('local');setOffline(true);
  await adapter.queue('offline',{pageId:draft.id,data:encodePageAuthoringDraft(local),expectedObjectRevision:created.object.revision,expectedDataHash:fingerprint(created.data)});
  const foreign=clone(draft);foreign.document.title='Fremde Fassung';foreign.revision=fingerprint('foreign');store.submitChange(b.token,{kind:'page',id:created.object.id,changeId:'foreign-fn-change',baseRevision:created.object.revision,data:encodePageAuthoringDraft(foreign)});
  setOffline(false);await assert.rejects(adapter.synchronize('publisher',draft.id),error=>error.code==='shared_page_conflict');const kept=await adapter.read('contributor',draft.id);assert.equal(kept.data.document.title,'Eigener Entwurf');assert.equal(kept.localConflict,true);assert.equal(store.getObject(b.token,'page',created.object.id).data.document.title,'Fremde Fassung');
}));
test('offline brand-new shared create and stale local baseline are refused without duplicating pages',t=>scoped(t,async({adapter,draft})=>{
  await assert.rejects(adapter.create('offline',draft),error=>error.code==='online_required');const created=await adapter.create('publisher',draft);
  await assert.rejects(adapter.queue('contributor',{pageId:draft.id,data:created.data,expectedObjectRevision:created.object.revision,expectedDataHash:fingerprint('wrong')}),error=>error.code==='shared_page_conflict');
}));
test('actual server stamps immutable publisher approval evidence; generic approval never invents domain approval',t=>scoped(t,async({adapter,draft,local,store,a})=>{
  const created=await adapter.create('publisher',draft);
  assert.throws(()=>store.approveObject(a.token,'page',created.object.id,{expectedRevision:created.object.revision}),error=>error.code==='page_approval_required');
  const {approved}=await local.approval(draft),data=encodePageAuthoringDraft(draft,{approval:approved.artifact.payload,adoptUnlinkedApprovals:true});
  await adapter.queue('publisher',{pageId:draft.id,data,expectedObjectRevision:created.object.revision,expectedDataHash:fingerprint(created.data)});
  const synced=await adapter.synchronize('publisher',draft.id);assert.equal(synced.evidence.trusted,true);assert.equal(synced.evidence.approvals.length,1);assert.equal(synced.evidence.approvals[0].actorId,a.user.id);assert.equal(synced.evidence.approvals[0].actorRole,'admin');assert.equal(synced.evidence.approvals[0].objectOrdinal,2);assert.equal(typeof synced.evidence.approvals[0].objectRevision,'string');
  const approvedObject=store.approveObject(a.token,'page',created.object.id,{expectedRevision:synced.object.revision});assert.equal(approvedObject.approvedRevision,synced.object.revision);
}));
test('real server guard rejects another project media even from actual admin',t=>scoped(t,async({draft,store,a})=>{
  const foreign=clone(draft);for(const asset of [...Object.values(foreign.document.species.normalAssets).filter(Boolean),...foreign.document.images.map(image=>image.asset)])asset.projectId='foreign-project';
  assert.throws(()=>store.createObject(a.token,{kind:'page',id:pageAuthoringObjectId(draft.id),data:encodePageAuthoringDraft(foreign)}),error=>error.code==='foreign_media');
}));

test('actual shared HTTP transport preserves stable asset binding after an explicit display-name source refresh',t=>scoped(t,async({adapter,draft,local,store,a})=>{
  const original=clone(draft.document.species);
  local.species.commonName='Grüner Baumleguan';local.species.assetName='Gruener Leguan';local.species.revision='species-stable-assets';
  const updated=(await local.service.refreshSpecies('publisher',{draftId:draft.id,mutationId:local.mutationId(),expectedRevision:draft.revision})).draft;
  const created=await adapter.create('publisher',updated),saved=store.getObject(a.token,'page',created.object.id);
  assert.equal(saved.data.document.species.commonName,'Grüner Baumleguan');
  assert.equal(saved.data.document.species.assetName,'Gruener Leguan');
  assert.equal((await adapter.read('contributor',draft.id)).data.document.species.assetName,'Gruener Leguan');
  assert.deepEqual(draft.document.species,original);
  assert.equal(saved.data.document.species.normalAssets.portrait.projectId,a.projectId);
}));
