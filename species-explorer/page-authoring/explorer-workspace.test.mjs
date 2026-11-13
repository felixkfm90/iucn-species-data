import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fixture as authoringFixture,CLOCK } from './test-fixture.mjs';
import { fixture as projectFixture } from '../shared-project/test-fixtures.mjs';
import { createSharedProjectHttp } from '../shared-project/http.mjs';
import { createSharedProjectClient,createMemoryCredentialStore } from '../shared-project/client.mjs';
import { createExplorerPageWorkspace } from './explorer-workspace.mjs';
import { createSqlitePageAuthoringRepository } from './repository.mjs';
import { editableDocument } from './model.mjs';
import { clone,fingerprint,sha256 } from './contract.mjs';
import { pageAuthoringObjectId,encodePageAuthoringDraft,pageImagesHash } from './shared.mjs';
import { assertTestTempPath } from '../../scripts/test-temp.mjs';
import { validatePageAuthoringJournal } from '../shared-project/project-journal-backup.mjs';
import { editorialIntegrationFixture } from '../shared-project/editorial-integration-fixtures.mjs';

const DEVICE='device-ec2d31f7-0485-4a04-96c4-b40e233b126a';
function inspect(filename,projectId) {const db=new DatabaseSync(filename,{readOnly:true});try{return validatePageAuthoringJournal(db,{deviceId:DEVICE,projectIds:[projectId,'project-a']});}finally{db.close();}}
async function scoped(t,operation) {
  const local=authoringFixture({after(){}}),project=projectFixture(),clients=[],servers=[],workspaces=[];
  try {
    const {store,a,b}=await project.initialized(),http=createSharedProjectHttp({store});servers.push(http);
    const address=(await http.listen()).url;
    for(const metadata of local.metadata.values())metadata.projectId=a.projectId;
    let serial=0;
    async function connect({user=a,origin=address,filename=`client-${++serial}.sqlite`,workspaceOptions={}}={}) {
      const requests=[],faults=new Map(),settings={offline:false},credentials=createMemoryCredentialStore();
      const client=createSharedProjectClient({filename:path.join(project.root,filename),localStorageConfirmed:true,allowLoopbackHttp:true,credentialStore:credentials,
        fetchImpl:async(url,options)=>{requests.push({url:String(url),method:options?.method||'GET'});if(settings.offline)throw new Error('synthetic offline');
          await settings.beforeFetch?.(url,options);return fetch(url,options);}});
      clients.push(client);await client.connect({baseUrl:origin,username:user.user.username,password:project.password});
      const calls=[];
      const proxy=new Proxy(client,{get(target,key){const value=target[key];if(typeof value!=='function')return value;
        return async(...args)=>{calls.push(key);const fault=faults.get(key);if(fault?.before)await fault.before(...args);const result=await value(...args);if(fault?.after)await fault.after(result,...args);return result;};}});
      let repo=local.repository,queue=Promise.resolve();
      const withClient=fn=>{const result=queue.then(async()=>{const status=await client.status(),online=status.connection==='online',writer=['admin','publisher','contributor'].includes(status.user?.role);
        return fn(proxy,{status,permissions:{canRead:Boolean(status.user),canEdit:writer&&!status.readOnlySession,canCreate:writer&&online,
          canApprove:['admin','publisher'].includes(status.user?.role)&&online}});});queue=result.catch(()=>{});return result;};
      const make=()=>{const workspace=createExplorerPageWorkspace({withClient,repository:repo,speciesAuthority:local.authorities.speciesAuthority,
        mediaFacade:local.authorities.mediaFacade,targetAuthority:null,now:()=>CLOCK,...workspaceOptions});workspaces.push(workspace);return workspace;};
      let workspace=make();
      return {client,proxy,requests,calls,faults,settings,user,origin,withClient,get workspace(){return workspace;},
        reopen(){repo=local.open();workspace=make();},
        async create(id='page-a',parentPath='/wildlife/heimische-tierwelt'){const list=await workspace.list();return workspace.create({sourceScope:list.sourceScope,draftId:id,mutationId:randomUUID(),
          templateId:'fn-compact-20261031',slug:local.species.slug,parentPath});},
        async save(view,edit){const document=editableDocument(view.draft.document);edit(document);return workspace.save({sourceScope:view.sourceScope,
          draftId:view.draft.id,mutationId:randomUUID(),expectedRevision:view.draft.revision,document});},
        async sync(view,extra={}){return workspace.sync({sourceScope:view.sourceScope,draftId:view.draft.id,...extra});}};
    }
    await operation({local,project,store,a,b,address,connect,servers});
  } finally {for(const workspace of workspaces)await workspace.close();for(const client of clients)await client.close();for(const http of servers)await http.close();local.close();
    fs.rmSync(assertTestTempPath(local.directory),{recursive:true,force:true,maxRetries:8,retryDelay:50});project.cleanup();}
}

test('actual shared create, local save, existing queue and explicit sync retain the exact core revision across reopen',t=>scoped(t,async({connect,local,a,store})=>{
  const pc=await connect();let view=await pc.create();assert.equal(view.sync.state,'synced');assert.equal(view.published,false);
  const initial=view.draft.revision;view=await pc.save(view,document=>{document.title='Eigener dauerhafter Seitentitel';});
  assert.notEqual(view.draft.revision,initial);assert.equal(view.sync.state,'queued');assert.equal((await pc.client.status()).pending,1);
  const revision=view.draft.revision;pc.reopen();view=await pc.workspace.get('page-a');assert.equal(view.draft.revision,revision);
  assert.equal(view.draft.document.title,'Eigener dauerhafter Seitentitel');view=await pc.sync(view);
  assert.equal(view.sync.state,'synced');assert.equal(view.sync.localPending,false);
  assert.equal(store.getObject(a.token,'page',pageAuthoringObjectId('page-a')).data.revision,revision);
  const backup=inspect(local.filename,a.projectId);assert.equal(backup.coverage.mediaBytesIncluded,false);assert.equal(backup.counts.personalScopes,1);
  assert.ok(backup.requiredMedia.length>=2);assert.equal(backup.coverage.legacyScopeAssigned,false);
}));

test('a lost create acknowledgement is read back after reopen and never automatically creates a second page',t=>scoped(t,async({connect,a,store})=>{
  const pc=await connect();let lost=true;pc.faults.set('createObject',{after(){if(lost){lost=false;throw new Error('lost create response');}}});
  let view=await pc.create();assert.equal(view.sync.state,'uncertain');assert.equal(view.localSaved,true);
  const localRevision=view.draft.revision;pc.reopen();view=await pc.workspace.get('page-a');assert.equal(view.draft.revision,localRevision);
  view=await pc.sync(view);assert.equal(view.sync.state,'synced');assert.equal(pc.calls.filter(value=>value==='createObject').length,1);
  assert.equal(store.getObject(a.token,'page',pageAuthoringObjectId('page-a')).data.document.title,view.draft.document.title);
}));

test('queue failure preserves the local version; a committed but lost queue acknowledgement resumes without a duplicate enqueue',t=>scoped(t,async({connect})=>{
  const pc=await connect();let view=await pc.create(),fail=true;
  pc.faults.set('editExistingObject',{after(){if(fail){fail=false;throw new Error('lost queue acknowledgement');}}});
  view=await pc.save(view,document=>{document.title='Trotz Quittungsverlust lokal erhalten';});
  assert.equal(view.sync.state,'local-only');assert.equal(view.localSaved,true);assert.equal((await pc.client.status()).pending,1);
  const revision=view.draft.revision;pc.reopen();view=await pc.workspace.get('page-a');assert.equal(view.draft.revision,revision);
  view=await pc.sync(view);assert.equal(view.sync.state,'synced');assert.equal(pc.calls.filter(value=>value==='editExistingObject').length,1);
}));

test('a lost server sync acknowledgement does not duplicate a server change after a later explicit retry',t=>scoped(t,async({connect,store,a})=>{
  const pc=await connect();let view=await pc.create();view=await pc.save(view,document=>{document.title='Einmaliger Serverauftrag';});
  let lost=true;pc.faults.set('sync',{after(){if(lost){lost=false;throw new Error('lost server sync response');}}});
  view=await pc.sync(view);assert.ok(view.sync.errorCode);const server=store.getObject(a.token,'page',pageAuthoringObjectId('page-a'));
  pc.reopen();view=await pc.workspace.get('page-a');view=await pc.sync(view);assert.equal(view.sync.state,'synced');
  assert.equal(store.getObject(a.token,'page',pageAuthoringObjectId('page-a')).revision,server.revision);
  assert.equal(pc.requests.filter(request=>request.method==='POST'&&new URL(request.url).pathname.endsWith('/changes')).length,1);
}));

test('a newer independent local successor after the server ACK remains untransferred instead of becoming part of the older acknowledgement',t=>scoped(t,async({connect,local,a})=>{
  const pc=await connect();let view=await pc.create();view=await pc.save(view,document=>{document.title='Übertragene Fassung';});
  let successor;
  pc.faults.set('sync',{after(){const repo=local.open().scoped({origin:pc.origin,actorId:a.user.id}),prior=repo.read(a.projectId,'page-a'),document=clone(prior.document);
    document.title='Neuere unabhängige lokale Fassung';successor=repo.commit({projectId:a.projectId,actorId:a.user.id,id:prior.id,expectedRevision:prior.revision,
      mutationId:randomUUID(),intentHash:fingerprint('independent successor'),document}).draft;}});
  view=await pc.sync(view);assert.equal(view.draft.revision,successor.revision);assert.equal(view.draft.document.title,'Neuere unabhängige lokale Fassung');
  assert.equal(view.sync.state,'local-only');assert.equal(view.sync.localPending,true);assert.equal((await pc.client.status()).pending,0);
  assert.equal(view.sync.hasNewerLocalChanges,true);assert.notEqual(view.sync.coveredLocalRevision,view.draft.revision);
}));

test('two real PCs import a shared draft without importing foreign active approval or CMS status and never automatically post the import',t=>scoped(t,async({connect,b,local})=>{
  const one=await connect();let view=await one.create();view=await one.save(view,document=>{document.title='Gemeinsamer Entwurf für zweiten PC';document.galleryRequested=false;
    for(const section of document.sections)if(section.kind!=='general-module' && section.kind!=='map-module' && !['general','map'].includes(section.id))
      section.blocks=[{type:'paragraph',text:`Menschlich gelieferter Abschnitt ${section.id}`}];});view=await one.sync(view);
  const preview=await one.workspace.preview({sourceScope:view.sourceScope,draftId:'page-a',mutationId:randomUUID(),expectedRevision:view.draft.revision});
  view=await one.workspace.approve({sourceScope:view.sourceScope,draftId:'page-a',mutationId:randomUUID(),expectedRevision:view.draft.revision,
    previewId:preview.artifact.id,reportHash:preview.report.reportHash,review:{texts:true,images:true,layout:true},missingAltAcknowledged:[]});
  const reviewed=(await one.client.getObject('page',pageAuthoringObjectId('page-a'))).data.approval.approvalHash;
  const beforeUnchangedSave=one.calls.filter(name=>name==='editExistingObject').length;
  view=await one.save(view,()=>{});assert.equal(view.result.unchanged,true);
  assert.equal((await one.client.getObject('page',pageAuthoringObjectId('page-a'))).data.approval.approvalHash,reviewed);
  assert.equal(one.calls.filter(name=>name==='editExistingObject').length,beforeUnchangedSave);
  view=await one.sync(view);assert.equal(view.externalEvidence.trusted,true);assert.equal(view.externalEvidence.approvals.length,1);
  const two=await connect({user:b});await two.client.refresh();const before=two.calls.filter(name=>['createObject','editExistingObject','sync'].includes(name)).length;
  const list=await two.workspace.list();assert.equal(list.drafts.length,0);assert.equal(list.remoteDrafts.length,1);
  let imported=await two.workspace.refreshFromProject({sourceScope:list.sourceScope,draftId:'page-a',mutationId:randomUUID()});
  assert.equal(imported.draft.document.title,'Gemeinsamer Entwurf für zweiten PC');assert.equal(imported.approval,null);assert.equal(imported.cms,null);
  assert.equal(imported.externalEvidence.approvals.length,1);assert.equal(imported.remote.data.approval.approvalHash,view.remote.data.approval.approvalHash);
  assert.equal(two.calls.filter(name=>['createObject','editExistingObject','sync'].includes(name)).length,before);
  imported=await two.save(imported,document=>{document.title='Eigene offene zweite Fassung';});
  await assert.rejects(two.workspace.refreshFromProject({sourceScope:imported.sourceScope,draftId:'page-a',mutationId:randomUUID(),expectedRevision:imported.draft.revision}),
    error=>error.code==='local_page_changed');
  assert.equal((await two.workspace.get('page-a')).draft.document.title,'Eigene offene zweite Fassung');
  assert.equal(inspect(local.filename,b.projectId).counts.personalScopes,2);
}));

test('person and Origin scopes cannot read or overwrite another local untransferred head with identical project and draft IDs',t=>scoped(t,async({connect,a,b,local,store,servers})=>{
  const one=await connect();let view=await one.create();one.faults.set('editExistingObject',{before(){throw new Error('queue unavailable');}});
  view=await one.save(view,document=>{document.title='Nur Person A lokal vorhanden';});assert.equal(view.sync.state,'local-only');
  const second=await connect({user:b});assert.equal((await second.workspace.list()).drafts.length,0);
  assert.equal((await second.workspace.get('page-a')).draft,null);
  const http=createSharedProjectHttp({store});servers.push(http);const otherAddress=(await http.listen()).url;
  const otherOrigin=await connect({user:a,origin:otherAddress});assert.equal((await otherOrigin.workspace.list()).drafts.length,0);
  assert.equal((await otherOrigin.workspace.get('page-a')).draft,null);
  assert.equal((await one.workspace.get('page-a')).draft.document.title,'Nur Person A lokal vorhanden');
  const summary=inspect(local.filename,a.projectId);assert.equal(summary.counts.personalScopes,3);assert.equal(summary.coverage.personalScopesIncluded,true);
}));

test('offline edits preserve already server-confirmed images without local bytes while new missing bytes cannot enter a local save',t=>scoped(t,async({connect,local})=>{
  const pc=await connect();let view=await pc.create();view=await pc.save(view,document=>{document.images=[{id:'photo-one',assetId:'photo-a',alt:'Vorhandene Aufnahme',caption:'Erste Beschriftung',decorative:false}];});view=await pc.sync(view);
  local.bytes.delete('photo-a');local.metadata.delete('photo-a');pc.settings.offline=true;await assert.rejects(pc.client.refresh());
  view=await pc.save(view,document=>{document.images[0].caption='Offline bewusst geänderte Beschriftung';});
  assert.equal(view.draft.document.images[0].caption,'Offline bewusst geänderte Beschriftung');assert.equal(view.sync.state,'queued');
  local.bytes.delete('photo-b');const revision=view.draft.revision;
  await assert.rejects(pc.save(view,document=>{document.images.push({id:'new-photo',assetId:'photo-b',alt:'Neue Aufnahme',caption:'',decorative:false});}),
    error=>error.code==='local_media_required');
  assert.equal((await pc.workspace.get('page-a')).draft.revision,revision);
}));

test('a cached existing page can be opened and edited offline before its first personal import, with conflicts preserved',t=>scoped(t,async({connect,b,store})=>{
  const one=await connect();let original=await one.create();
  const two=await connect({user:b,workspaceOptions:{speciesAuthority:{snapshot(){throw new Error('Offline import must not refresh the species source');}}}});
  two.settings.offline=true;await assert.rejects(two.client.refresh());
  const cached=await two.workspace.get('page-a'),requestsBefore=two.requests.length;
  assert.equal(cached.draft,null);assert.equal(cached.connection,'offline');
  const input={sourceScope:cached.sourceScope,draftId:'page-a',mutationId:randomUUID(),expectedBindingRevision:null,
    expectedCachedRevision:cached.remoteOnly.object.revision};
  await assert.rejects(two.workspace.refreshFromProject({...input,expectedCachedRevision:randomUUID()}),{code:'cached_page_changed'});
  let local=await two.workspace.refreshFromProject(input);
  assert.equal(local.connection,'offline');assert.equal(local.draft.document.title,original.draft.document.title);
  assert.equal(local.approval,null);assert.equal(local.cms,null);assert.equal(local.sync.localPending,false);
  local=await two.save(local,document=>{document.title='Zuerst offline bearbeitet';});
  assert.equal(local.sync.state,'queued');assert.equal(two.requests.length,requestsBefore);
  await assert.rejects(two.workspace.refreshFromProject({...input,mutationId:randomUUID(),expectedRevision:local.draft.revision}),{code:'local_page_changed'});
  original=await one.save(original,document=>{document.title='Inzwischen online bearbeitet';});await one.sync(original);
  two.settings.offline=false;await two.client.refresh();local=await two.sync(local);
  assert.equal(local.sync.state,'conflict');assert.equal(local.draft.document.title,'Zuerst offline bearbeitet');
  assert.equal(store.getObject(b.token,'page',pageAuthoringObjectId('page-a')).data.title,'Inzwischen online bearbeitet');
}));

test('a real foreign server edit conflicts with the existing offline queue without replacing either local working document',t=>scoped(t,async({connect,b,store})=>{
  const one=await connect();let first=await one.create();
  const two=await connect({user:b}),list=await two.workspace.list();
  let second=await two.workspace.refreshFromProject({sourceScope:list.sourceScope,draftId:'page-a',mutationId:randomUUID()});
  one.settings.offline=true;await assert.rejects(one.client.refresh());
  first=await one.save(first,document=>{document.title='Eigener Offlineentwurf auf PC1';});
  second=await two.save(second,document=>{document.title='Andere gemeinsame Fassung von PC2';});second=await two.sync(second);
  one.settings.offline=false;await one.client.refresh();first=await one.sync(first);
  assert.equal(first.sync.state,'conflict');assert.equal(first.draft.document.title,'Eigener Offlineentwurf auf PC1');
  assert.equal(store.getObject(b.token,'page',pageAuthoringObjectId('page-a')).data.document.title,'Andere gemeinsame Fassung von PC2');
  assert.equal((await two.workspace.get('page-a')).draft.document.title,'Andere gemeinsame Fassung von PC2');
  await assert.rejects(one.workspace.refreshFromProject({sourceScope:first.sourceScope,draftId:'page-a',mutationId:randomUUID(),expectedRevision:first.draft.revision}),
    error=>error.code==='local_page_changed');
}));

test('two profiles edit distinct pages while one is offline and synchronize only their own page versions',t=>scoped(t,async({connect,a,b,store})=>{
  const one=await connect(),two=await connect({user:b});
  let first=await one.create('page-a'),second=await two.create('page-b','/wildlife/costa-rica');
  one.settings.offline=true;await assert.rejects(one.client.refresh());
  [first,second]=await Promise.all([one.save(first,document=>{document.title='PC 1 offline an Seite A';}),
    two.save(second,document=>{document.title='PC 2 parallel an Seite B';})]);
  second=await two.sync(second);assert.equal(second.sync.state,'synced');
  assert.notEqual(store.getObject(b.token,'page',pageAuthoringObjectId('page-a')).data.title,first.draft.document.title);
  one.settings.offline=false;await one.client.refresh();first=await one.sync(first);
  assert.equal(first.sync.state,'synced');
  assert.equal(store.getObject(a.token,'page',pageAuthoringObjectId('page-a')).data.title,'PC 1 offline an Seite A');
  assert.equal(store.getObject(a.token,'page',pageAuthoringObjectId('page-b')).data.title,'PC 2 parallel an Seite B');
  assert.deepEqual(await one.client.listConflicts(),[]);assert.deepEqual(await two.client.listConflicts(),[]);
}));

async function submitPagesTogether(clients, queued) {
  const submissions = [];
  let release, timeout, overlapped = false;
  const bothSubmitted = new Promise(resolve => { release = resolve; });
  for (const [index, pc] of clients.entries()) {
    pc.settings.beforeFetch = async (url, options) => {
      if (options?.method !== 'POST' || !new URL(url).pathname.endsWith('/changes')) return;
      submissions.push({ account: index, change: JSON.parse(options.body) });
      if (submissions.length === 1) timeout = setTimeout(() => { timeout = null; release(); }, 4000);
      else if (submissions.length === 2 && timeout) {
        overlapped = true;
        clearTimeout(timeout);
        release();
      }
      await bothSubmitted;
    };
  }
  let results;
  try { results = await Promise.all(clients.map((pc, index) => pc.sync(queued[index]))); }
  finally {
    clearTimeout(timeout);
    release();
    for (const pc of clients) delete pc.settings.beforeFetch;
  }
  assert.deepEqual(submissions.map(item => item.account).sort(), [0, 1]);
  assert.equal(overlapped, true, 'both HTTP requests must be ready before either is sent');
  return { submissions, results };
}

test('simultaneous online submissions from two accounts on the same shared revision preserve the losing draft', t => scoped(t, async ({ connect, a, b, store }) => {
  const one = await connect(), two = await connect({ user: b });
  const first = await one.create();
  const list = await two.workspace.list();
  const second = await two.workspace.refreshFromProject({ sourceScope: list.sourceScope, draftId: 'page-a', mutationId: randomUUID() });
  const objectId = pageAuthoringObjectId('page-a');
  const initial = store.getObject(a.token, 'page', objectId);
  const queued = await Promise.all([one.save(first, document => { document.title = 'Artseite aus Konto 1'; }),
    two.save(second, document => { document.title = 'Artseite aus Konto 2'; })]);
  assert.deepEqual(queued.map(view => view.sync.state), ['queued', 'queued']);
  const { submissions, results } = await submitPagesTogether([one, two], queued);
  assert.ok(submissions.every(item => item.change.baseRevision === initial.revision && item.change.id === objectId));
  assert.deepEqual(results.map(view => view.sync.state).sort(), ['conflict', 'synced']);
  const conflictIndex = results.findIndex(view => view.sync.state === 'conflict');
  const local = results[conflictIndex], winner = results[1 - conflictIndex];
  const losingPc = [one, two][conflictIndex];
  const committed = store.getObject(a.token, 'page', objectId);
  assert.equal(committed.data.revision, winner.draft.revision);
  assert.equal(local.draft.revision, queued[conflictIndex].draft.revision);
  assert.notEqual(local.draft.document.title, committed.data.document.title);
  losingPc.reopen();
  const preserved = await losingPc.workspace.get('page-a');
  assert.equal(preserved.draft.revision, local.draft.revision);
  const comparison = await losingPc.workspace.conflictPreview({ sourceScope: preserved.sourceScope,
    draftId: preserved.draft.id, expectedRevision: preserved.draft.revision, expectedBindingRevision: preserved.sync.bindingRevision });
  assert.equal(comparison.localDocument.title, local.draft.document.title);
  assert.equal(comparison.serverDocument.title, committed.data.document.title);
}));

test('simultaneous online submissions on distinct pages commit both drafts independently', t => scoped(t, async ({ connect, a, b, store }) => {
  const one = await connect(), two = await connect({ user: b });
  const first = await one.create('page-a'), second = await two.create('page-b', '/wildlife/costa-rica');
  const queued = await Promise.all([one.save(first, document => { document.title = 'Bearbeitete Seite A'; }),
    two.save(second, document => { document.title = 'Bearbeitete Seite B'; })]);
  const { submissions, results } = await submitPagesTogether([one, two], queued);
  assert.deepEqual(results.map(view => view.sync.state), ['synced', 'synced']);
  for (const { account, change } of submissions) {
    const expected = queued[account].draft;
    assert.equal(change.id, pageAuthoringObjectId(expected.id));
    const committed = store.getObject(a.token, 'page', change.id);
    assert.equal(committed.data.revision, expected.revision);
    assert.equal(committed.data.document.title, expected.document.title);
  }
  assert.deepEqual(await one.client.listConflicts(), []);
  assert.deepEqual(await two.client.listConflicts(), []);
}));

test('a decided page conflict can adopt the reviewed common version as a fresh local revision and preserve the offline draft',t=>scoped(t,async({connect,a,b,local,store})=>{
  const one=await connect();let first=await one.create();
  const two=await connect({user:b}),list=await two.workspace.list();
  let second=await two.workspace.refreshFromProject({sourceScope:list.sourceScope,draftId:'page-a',mutationId:randomUUID()});
  one.settings.offline=true;await assert.rejects(one.client.refresh());
  first=await one.save(first,document=>{document.title='Erhaltener lokaler Offlineentwurf';});
  second=await two.save(second,document=>{document.title='Gemeinsame Fassung nach Konflikt';});second=await two.sync(second);
  one.settings.offline=false;await one.client.refresh();first=await one.sync(first);
  const base={sourceScope:first.sourceScope,draftId:first.draft.id,expectedRevision:first.draft.revision,expectedBindingRevision:first.sync.bindingRevision};
  let comparison=await one.workspace.conflictPreview(base);
  const adopt=(review,confirmed=true)=>one.workspace.conflictAdopt({...base,serverRevision:review.serverRevision,serverDataHash:review.serverDataHash,
    mutationId:randomUUID(),confirmed});
  assert.equal(comparison.localDocument.title,'Erhaltener lokaler Offlineentwurf');
  assert.equal(comparison.serverDocument.title,'Gemeinsame Fassung nach Konflikt');assert.equal(comparison.queueOpen,true);
  await assert.rejects(adopt(comparison),{code:'shared_page_conflict'});
  const [conflict]=await one.client.listConflicts();
  await one.client.resolveConflict(conflict.id,{strategy:'current',expectedRevision:comparison.serverRevision});
  await assert.rejects(one.workspace.refreshFromProject({sourceScope:first.sourceScope,draftId:'page-a',mutationId:randomUUID(),expectedRevision:first.draft.revision}),
    {code:'local_page_changed'});
  comparison=await one.workspace.conflictPreview(base);assert.equal(comparison.queueOpen,false);
  await assert.rejects(adopt(comparison,false),{code:'confirmation_required'});
  second=await two.save(second,document=>{document.title='Nochmals aktualisierte gemeinsame Fassung';});second=await two.sync(second);
  await assert.rejects(adopt(comparison),{code:'workspace_conflict'});
  assert.equal((await one.workspace.get('page-a')).draft.revision,first.draft.revision);
  comparison=await one.workspace.conflictPreview(base);
  const snapshot=local.authorities.speciesAuthority.snapshot;
  let changedDuringSpeciesRead=false;
  local.authorities.speciesAuthority.snapshot=async(context,slug)=>{
    if(!changedDuringSpeciesRead && context.actor.id===a.user.id){
      changedDuringSpeciesRead=true;
      second=await two.save(second,document=>{document.title='Während der Artprüfung neu gespeicherte Fassung';});
      second=await two.sync(second);
    }
    return snapshot(context,slug);
  };
  await assert.rejects(adopt(comparison),{code:'workspace_conflict'});
  assert.equal(changedDuringSpeciesRead,true);
  const preserved=await one.workspace.get('page-a');
  assert.equal(preserved.draft.revision,first.draft.revision);
  assert.equal(preserved.sync.bindingRevision,first.sync.bindingRevision);
  comparison=await one.workspace.conflictPreview(base);
  const before=store.getObject(a.token,'page',pageAuthoringObjectId('page-a')), adopted=await adopt(comparison);
  assert.equal(adopted.draft.document.title,'Während der Artprüfung neu gespeicherte Fassung');
  assert.equal(adopted.draft.parentRevision,first.draft.revision);assert.equal(adopted.approval,null);assert.equal(adopted.published,false);
  assert.equal(adopted.sync.state,'synced');assert.deepEqual(store.getObject(a.token,'page',pageAuthoringObjectId('page-a')),before);
  const retained=local.open().scoped({origin:one.origin,actorId:a.user.id}).read(a.projectId,'page-a',first.draft.revision);
  assert.equal(retained.document.title,'Erhaltener lokaler Offlineentwurf');
}));

test('a concurrent baseline change rolls back imported document and mutation together instead of leaving an unbound foreign head',t=>scoped(t,async({connect,b,local,a})=>{
  const one=await connect();const first=await one.create();const two=await connect({user:b}),list=await two.workspace.list();
  let other=await two.workspace.refreshFromProject({sourceScope:list.sourceScope,draftId:'page-a',mutationId:randomUUID()});
  other=await two.save(other,document=>{document.title='Neue zu importierende gemeinsame Fassung';});await two.sync(other);
  const original=local.authorities.speciesAuthority.snapshot;let changed=false;
  local.authorities.speciesAuthority.snapshot=async(context,slug)=>{
    if(!changed && context.actor.id===a.user.id){changed=true;const repo=local.open().scoped({origin:one.origin,actorId:a.user.id}),link=repo.workspaceLink(a.projectId,'page-a');
      repo.putWorkspaceLink({projectId:a.projectId,draftId:'page-a',expectedBindingRevision:link.bindingRevision,binding:{...link.binding,errorCode:'concurrent_baseline_update'}});}
    return original(context,slug);
  };
  await assert.rejects(one.workspace.refreshFromProject({sourceScope:first.sourceScope,draftId:'page-a',mutationId:randomUUID(),expectedRevision:first.draft.revision}),
    error=>error.code==='workspace_conflict');
  const preserved=await one.workspace.get('page-a');assert.equal(preserved.draft.revision,first.draft.revision);
  assert.equal(preserved.draft.document.title,first.draft.document.title);assert.equal(preserved.sync.errorCode,'concurrent_baseline_update');
}));

test('definitively missing shared creation needs a fresh explicit confirmedCreate and never follows a lost request automatically',t=>scoped(t,async({connect})=>{
  const pc=await connect();pc.faults.set('createObject',{before(){throw new Error('request never reached server');}});
  let view=await pc.create();assert.equal(view.sync.state,'uncertain');
  await assert.rejects(pc.sync(view),error=>error.code==='create_confirmation_required');
  assert.equal(pc.calls.filter(name=>name==='createObject').length,1);
  pc.faults.delete('createObject');view=await pc.sync(view,{confirmedCreate:true});assert.equal(view.sync.state,'synced');
  assert.equal(pc.calls.filter(name=>name==='createObject').length,2);
}));

test('replaying an old save acknowledgement never queues its older revision over a newer local successor',t=>scoped(t,async({connect})=>{
  const pc=await connect();let view=await pc.create();const document=editableDocument(view.draft.document);document.title='Erste gespeicherte Fassung';
  const input={sourceScope:view.sourceScope,draftId:'page-a',mutationId:randomUUID(),expectedRevision:view.draft.revision,document};
  view=await pc.workspace.save(input);view=await pc.save(view,next=>{next.title='Neuere erhaltene Fassung';});
  const calls=pc.calls.filter(name=>name==='editExistingObject').length,latestRevision=view.draft.revision;
  const replay=await pc.workspace.save(input);
  assert.equal(replay.result.idempotentReplay,true);assert.equal(replay.draft.revision,latestRevision);
  assert.equal((await pc.client.getObject('page',pageAuthoringObjectId('page-a'))).data.document.title,'Neuere erhaltene Fassung');
  assert.equal(pc.calls.filter(name=>name==='editExistingObject').length,calls);
}));

test('v0 migration preserves unassigned history and new scoped heads never inherit its ownership',async t=>{
  const f=authoringFixture(t),legacy=await f.ready();f.close();
  const db=new DatabaseSync(f.filename);db.exec('DROP TABLE workspace_links; DROP TABLE workspace_scopes; PRAGMA user_version=0;');db.close();
  assert.equal(inspect(f.filename,'project-a').counts.drafts,1);
  const repo=createSqlitePageAuthoringRepository({filename:f.filename,localStorageConfirmed:true,now:()=>CLOCK});
  try {
    assert.equal(repo.read('project-a',legacy.id).revision,legacy.revision);
    const personal=repo.scoped({origin:'https://project.example.org',actorId:'real-person'});
    assert.deepEqual(personal.list('project-a'),[]);assert.equal(personal.read('project-a',legacy.id),null);
    assert.equal(inspect(f.filename,'project-a').counts.personalScopes,1);
  }finally{repo.close();}
});

test('unknown future repository versions are rejected without a migration write or lingering database handle',async t=>{
  const f=authoringFixture(t);await f.create();f.close();const db=new DatabaseSync(f.filename);db.exec('PRAGMA user_version=2');db.close();
  const before=sha256(fs.readFileSync(f.filename));
  assert.throws(()=>createSqlitePageAuthoringRepository({filename:f.filename,localStorageConfirmed:true}),error=>error.code==='repository_version');
  assert.equal(sha256(fs.readFileSync(f.filename)),before);
});

test('independent scoped SQLite connections enforce exact core and baseline CAS without affecting legacy heads',async t=>{
  const f=authoringFixture(t),legacy=await f.ready(),origin='https://project.example.org',actorId='felix';
  const first=f.repository.scoped({origin,actorId}),second=f.open().scoped({origin,actorId});
  const d=first.commit({projectId:'project-a',actorId,id:legacy.id,create:true,mutationId:'scoped-create',intentHash:fingerprint('scoped-create'),document:clone(legacy.document)}).draft;
  const document=clone(d.document);document.title='Einziger Gewinner im persönlichen Scope';
  const winner=first.commit({projectId:'project-a',actorId,id:d.id,expectedRevision:d.revision,mutationId:'scoped-first',intentHash:fingerprint('first'),document}).draft;
  assert.throws(()=>second.commit({projectId:'project-a',actorId,id:d.id,expectedRevision:d.revision,mutationId:'scoped-second',intentHash:fingerprint('second'),document:d.document}),
    error=>error.code==='draft_conflict');
  assert.equal(second.read('project-a',d.id).revision,winner.revision);assert.equal(f.repository.read('project-a',legacy.id).revision,legacy.revision);
  const binding={origin,actorId,projectId:'project-a',draftId:d.id,baseLocalRevision:null,remoteRevision:null,remoteDataHash:null,remoteObject:null,
    confirmedObject:null,frameLocalRevision:winner.revision,frameHash:fingerprint(encodePageAuthoringDraft(winner)),approvalId:null,state:'unlinked',errorCode:null};
  const linked=first.putWorkspaceLink({projectId:'project-a',draftId:d.id,expectedBindingRevision:null,binding});
  assert.throws(()=>second.putWorkspaceLink({projectId:'project-a',draftId:d.id,expectedBindingRevision:null,binding}),error=>error.code==='workspace_conflict');
  assert.equal(second.workspaceLink('project-a',d.id).bindingRevision,linked.bindingRevision);
});

test('backup project discovery reads every registered personal scope while logged out without authentication or network work',t=>scoped(t,async({connect,b,a})=>{
  const one=await connect();await one.create();const two=await connect({user:b}),list=await two.workspace.list();
  await two.workspace.refreshFromProject({sourceScope:list.sourceScope,draftId:'page-a',mutationId:randomUUID()});
  await one.client.disconnect();await two.client.disconnect();
  const requests=one.requests.length+two.requests.length,calls=one.calls.length+two.calls.length;
  assert.deepEqual(await one.workspace.backupProjectIds(),[a.projectId]);
  assert.equal(one.requests.length+two.requests.length,requests);assert.equal(one.calls.length+two.calls.length,calls);
}));

test('workspace close waits for its accepted operation and does not close the repository injected by its owner',t=>scoped(t,async({connect,local,a})=>{
  const pc=await connect(),list=await pc.workspace.list();let release,entered;
  const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
  pc.faults.set('createObject',{before(){entered();return gate;}});
  const creating=pc.workspace.create({sourceScope:list.sourceScope,draftId:'page-a',mutationId:randomUUID(),templateId:'fn-compact-20261031',
    slug:local.species.slug,parentPath:'/wildlife/heimische-tierwelt'});await started;
  let finished=false;const closing=pc.workspace.close().then(()=>{finished=true;});await Promise.resolve();assert.equal(finished,false);
  await assert.rejects(pc.workspace.list(),error=>error.code==='workspace_closed');
  release();const created=await creating;await closing;assert.equal(finished,true);assert.equal(created.sync.state,'synced');
  assert.deepEqual(await pc.workspace.backupProjectIds(),[a.projectId]);
  assert.equal(local.repository.scoped({origin:pc.origin,actorId:a.user.id}).read(a.projectId,'page-a').revision,created.draft.revision);
}));

test('an untrusted foreign CMS success claim remains separate evidence and cannot activate local approval or CMS state',async t=>{
  const f=authoringFixture(t),draft=await f.ready(),remote={kind:'page',id:pageAuthoringObjectId(draft.id),revision:randomUUID(),ordinal:1,
    data:encodePageAuthoringDraft(draft,{cms:{status:'saved-unpublished',attemptId:'foreign-attempt',revision:draft.revision,
      contentHash:draft.contentHash,imagesHash:pageImagesHash(draft.document),
      planHash:fingerprint('untrusted plan'),receiptHash:fingerprint('untrusted receipt'),pageId:'claimed-cms-page',unpublished:true}})};
  remote.pageAuthoringEvidence={schemaVersion:1,objectId:remote.id,objectRevision:remote.revision,objectOrdinal:1,trusted:true,approvals:[],cms:[]};
  let writes=0;const client={getObject:async()=>clone(remote),listObjects:async()=>[clone(remote)],refresh:async()=>{},
    createObject:async()=>{writes++;throw new Error('No create authorized');},editExistingObject:async()=>{writes++;throw new Error('No edit authorized');},sync:async()=>{writes++;throw new Error('No sync authorized');}};
  const state={status:{baseUrl:'https://project.example.org',projectId:'project-a',user:{id:'another-person',role:'publisher'},connection:'online'},
    permissions:{canRead:true,canEdit:true,canCreate:true,canApprove:true}};
  const workspace=createExplorerPageWorkspace({withClient:callback=>callback(client,state),repository:f.repository,
    speciesAuthority:f.authorities.speciesAuthority,mediaFacade:f.authorities.mediaFacade,now:()=>CLOCK});
  const list=await workspace.list(),imported=await workspace.refreshFromProject({sourceScope:list.sourceScope,draftId:draft.id,mutationId:randomUUID()});
  assert.equal(imported.approval,null);assert.equal(imported.cms,null);assert.equal(imported.published,false);
  assert.equal(imported.externalEvidence.trusted,false);assert.equal(imported.remote.data.cms.status,'saved-unpublished');
  assert.equal(imported.sync.sharedApprovalConfirmed,false);assert.equal(writes,0);
  await workspace.close();
});

test('an actual Admin to Reader role change cannot expose the same personal scope private editorial heads through list or get',t=>scoped(t,async({connect,store,a,b})=>{
  const pc=await connect();let view=await pc.create();pc.faults.set('editExistingObject',{before(){throw new Error('retain a private local draft');}});
  view=await pc.save(view,document=>{document.title='Unfreigegebene private Redaktionsfassung';});
  assert.equal(view.sync.state,'local-only');const revision=view.draft.revision;
  const changed=store.updateUser(b.token,a.user.id,{expectedVersion:a.user.version,role:'reader'});await pc.client.refresh();
  assert.equal((await pc.client.status()).user.role,'reader');
  await assert.rejects(pc.workspace.list(),error=>error.code==='forbidden');
  await assert.rejects(pc.workspace.get('page-a'),error=>error.code==='forbidden');
  await assert.rejects(pc.workspace.preview({sourceScope:view.sourceScope,draftId:'page-a',mutationId:randomUUID(),expectedRevision:revision}),error=>error.code==='forbidden');
  assert.deepEqual(await pc.workspace.backupProjectIds(),[a.projectId]);
  store.updateUser(b.token,a.user.id,{expectedVersion:changed.version,role:'admin'});await pc.client.refresh();
  const retained=await pc.workspace.get('page-a');assert.equal(retained.draft.revision,revision);
  assert.equal(retained.draft.document.title,'Unfreigegebene private Redaktionsfassung');
}));

test('an Admin app display mode stays separate from effective readonly project-session permissions',t=>scoped(t,async({connect,local})=>{
  const pc=await connect(),created=await pc.create();
  const make=readonly=>createExplorerPageWorkspace({withClient:callback=>pc.withClient((client,state)=>callback(client,{...state,editMode:false,
    permissions:{...state.permissions,...(readonly?{canEdit:false,canCreate:false,canApprove:false}:{})}})),repository:local.repository,
    speciesAuthority:local.authorities.speciesAuthority,mediaFacade:local.authorities.mediaFacade,now:()=>CLOCK});
  const appReadMode=make(false),readSession=make(true);
  assert.equal((await appReadMode.get('page-a')).draft.revision,created.draft.revision);
  assert.equal((await appReadMode.list()).drafts.length,1);
  await assert.rejects(readSession.list(),error=>error.code==='forbidden');
  await assert.rejects(readSession.get('page-a'),error=>error.code==='forbidden');
  await appReadMode.close();await readSession.close();
}));

// These cases use the real HTTP project service/client and the same persistent
// queue as normal editing. Only timing faults/local second-writer races are injected.
function readerSource({store,a,local}) {
  const source=editorialIntegrationFixture(store,a,{id:local.species.slug});
  Object.assign(local.species,clone(source.pageObject.data.document.species));return source;
}
const readerInput=view=>({sourceScope:view.sourceScope,draftId:view.draft.id,expectedRevision:view.draft.revision,
  expectedBindingRevision:view.sync.bindingRevision});
const adoptionInput=(view,preview)=>({sourceScope:view.sourceScope,draftId:view.draft.id,token:preview.token});
const changePosts=pc=>pc.requests.filter(request=>request.method==='POST'&&new URL(request.url).pathname.endsWith('/changes')).length;
function independentPage(ctx,pc,edit) {
  const repo=ctx.local.open().scoped({origin:pc.origin,actorId:ctx.a.user.id}),prior=repo.read(ctx.a.projectId,'page-a'),document=clone(prior.document);
  edit(document);return repo.commit({projectId:ctx.a.projectId,actorId:ctx.a.user.id,id:prior.id,expectedRevision:prior.revision,
    mutationId:randomUUID(),intentHash:fingerprint({independent:randomUUID()}),document}).draft;
}

test('reader adoption: exact synced preview stages one private species draft with rich data and never syncs or approves it',t=>scoped(t,async ctx=>{
  const source=readerSource(ctx),pc=await ctx.connect();let view=await pc.create();
  const editorialId=view.draft.document.sections.find(value=>value.kind==='editorial').id;
  view=await pc.save(view,document=>{document.title='Menschlich geprüfter Seitentitel';document.galleryRequested=false;
    document.introduction=[{type:'paragraph',text:'Eigene Einleitung'}];
    const section=document.sections.find(value=>value.id===editorialId);
    section.blocks=[{type:'heading',level:5,text:'Eigene Zwischenüberschrift'},{type:'bullet-list',items:['Erster Punkt','Zweiter Punkt']}];
    section.sources=[{id:'own-source',label:'Bewusst gewählte Fachquelle',url:'https://example.org/source'}];});
  view=await pc.sync(view);const posts=changePosts(pc),localRevision=view.draft.revision,server=ctx.store.getObject(ctx.a.token,'species',source.speciesObject.id);
  let innerToken;pc.faults.set('previewPageEditorial',{after(result){innerToken=result.token;}});
  const preview=await pc.workspace.readerPreview(readerInput(view));
  assert.equal(preview.sourceScope,view.sourceScope);assert.equal(preview.draftId,'page-a');assert.notEqual(preview.token,innerToken);
  assert.deepEqual(preview.beforeEditorial,server.data.editorial);assert.equal(preview.proposedEditorial.title,view.draft.document.title);
  assert.deepEqual(preview.proposedEditorial.introduction,view.draft.document.introduction);
  assert.deepEqual(preview.proposedEditorial.sections.find(value=>value.kind==='editorial').blocks,view.draft.document.sections.find(value=>value.kind==='editorial').blocks);
  assert.equal(preview.readerApproved,false);assert.equal(preview.externalPublication,'not-performed');
  assert.ok(Date.parse(preview.expiresAt)>Date.now());assert.ok(Date.parse(preview.expiresAt)<=Date.now()+10*60*1000);
  assert.equal((await pc.client.status()).pending,0);assert.equal(changePosts(pc),posts);
  const result=await pc.workspace.readerAdopt(adoptionInput(view,preview));
  assert.deepEqual(Object.keys(result).sort(),['changeId','draftId','externalPublication','queued','readerApproved','sourceScope','speciesId'].sort());
  assert.equal(result.queued,true);assert.equal(result.speciesId,source.speciesObject.id);assert.equal(result.readerApproved,false);
  const staged=await pc.client.getObject('species',result.speciesId);assert.equal(staged.localPending,true);assert.equal(staged.data.schemaVersion,2);
  assert.deepEqual(staged.data.editorial,preview.proposedEditorial);assert.equal((await pc.client.status()).pending,1);
  assert.equal(ctx.store.getObject(ctx.a.token,'species',result.speciesId).revision,server.revision);
  assert.equal((await pc.workspace.get('page-a')).draft.revision,localRevision);assert.equal(changePosts(pc),posts);
  await assert.rejects(pc.workspace.readerAdopt(adoptionInput(view,preview)),error=>error.code==='reader_preview_required');
  await assert.rejects(pc.workspace.readerPreview(readerInput(view)),error=>error.code==='pending_review');
}));

test('reader adoption: pending local frames, stale display CAS and unconfirmed core successors stop before any client preview',t=>scoped(t,async ctx=>{
  readerSource(ctx);const pc=await ctx.connect();let view=await pc.create();const base=clone(view);
  await assert.rejects(pc.workspace.readerPreview({...readerInput(view),expectedRevision:fingerprint('stale core')}),error=>error.code==='draft_conflict');
  await assert.rejects(pc.workspace.readerPreview({...readerInput(view),expectedBindingRevision:fingerprint('stale link')}),error=>error.code==='workspace_conflict');
  view=await pc.save(view,document=>{document.title='Noch nicht abgeglichene Änderungen';});
  await assert.rejects(pc.workspace.readerPreview(readerInput(view)),error=>error.code==='shared_page_unconfirmed');
  assert.ok(!pc.calls.includes('previewPageEditorial'));view=await pc.sync(view);
  independentPage(ctx,pc,document=>{document.title='Nur eigener neuer SQLite-Kernstand';});
  const current=await pc.workspace.get('page-a');assert.equal(current.sync.localPending,true);
  await assert.rejects(pc.workspace.readerPreview(readerInput(current)),error=>error.code==='shared_page_unconfirmed');
  assert.ok(!pc.calls.includes('previewPageEditorial'));assert.notEqual(current.draft.revision,base.draft.revision);
}));

test('reader adoption: shared-source drift between local confirmation and fresh client preview never returns an applicable wrapper token',t=>scoped(t,async ctx=>{
  readerSource(ctx);const pc=await ctx.connect(),view=await pc.create(),server=ctx.store.getObject(ctx.a.token,'page',pageAuthoringObjectId('page-a'));
  pc.faults.set('previewPageEditorial',{after(result){result.sourceBindings.page.imagesHash=fingerprint('a different image binding');}});
  await assert.rejects(pc.workspace.readerPreview(readerInput(view)),error=>error.code==='editorial_adoption_changed');pc.faults.delete('previewPageEditorial');
  const document=clone(server.data.document);document.title='Inzwischen serverseitig geändert';
  const data=encodePageAuthoringDraft({id:'page-a',revision:fingerprint('foreign page successor'),document});
  ctx.store.submitChange(ctx.b.token,{changeId:randomUUID(),kind:'page',id:server.id,baseRevision:server.revision,data});
  await assert.rejects(pc.workspace.readerPreview(readerInput(view)),error=>error.code==='editorial_adoption_changed');
  assert.equal((await pc.client.status()).pending,0);assert.ok(!pc.calls.includes('adoptPageEditorial'));
  assert.equal((await pc.workspace.get('page-a')).draft.revision,view.draft.revision);
  const conflicted=await pc.save(view,local=>{local.title='Eigene konfliktbehaftete Seitenfassung';});
  assert.equal(conflicted.sync.state,'conflict');
  await assert.rejects(pc.workspace.readerPreview(readerInput(conflicted)),error=>error.code==='shared_page_unconfirmed');
  assert.equal((await pc.workspace.get('page-a')).draft.revision,conflicted.draft.revision);
}));

test('reader adoption: a concurrent local revision or baseline change while preview is delayed preserves both states and rejects the result',t=>scoped(t,async ctx=>{
  readerSource(ctx);const pc=await ctx.connect();let view=await pc.create();
  pc.faults.set('previewPageEditorial',{after(){independentPage(ctx,pc,document=>{document.title='Neuere lokale Fassung während Vorschau';});}});
  await assert.rejects(pc.workspace.readerPreview(readerInput(view)),error=>error.code==='draft_conflict');
  view=await pc.sync(await pc.workspace.get('page-a'));assert.equal(view.sync.state,'synced');
  pc.faults.set('previewPageEditorial',{after(){const repo=ctx.local.open().scoped({origin:pc.origin,actorId:ctx.a.user.id}),link=repo.workspaceLink(ctx.a.projectId,'page-a');
    repo.putWorkspaceLink({projectId:ctx.a.projectId,draftId:'page-a',expectedBindingRevision:link.bindingRevision,binding:{...link.binding,errorCode:'concurrent_read'}});}});
  await assert.rejects(pc.workspace.readerPreview(readerInput(view)),error=>error.code==='workspace_conflict');
  assert.equal((await pc.client.status()).pending,0);assert.ok(!pc.calls.includes('adoptPageEditorial'));
  assert.equal((await pc.workspace.get('page-a')).draft.document.title,'Neuere lokale Fassung während Vorschau');
}));

test('reader adoption: wrapper token cannot cross page, person, role or expiry and cannot survive close/reopen',t=>scoped(t,async ctx=>{
  readerSource(ctx);let time=Date.now();const pc=await ctx.connect({workspaceOptions:{clock:()=>time}});let view=await pc.create();await pc.create('page-b','/wildlife/afrika');
  let preview=await pc.workspace.readerPreview(readerInput(view));
  await assert.rejects(pc.workspace.readerAdopt({...adoptionInput(view,preview),draftId:'page-b'}),error=>error.code==='reader_preview_required');
  preview=await pc.workspace.readerPreview(readerInput(view));time+=10*60*1000+1;
  await assert.rejects(pc.workspace.readerAdopt(adoptionInput(view,preview)),error=>error.code==='reader_preview_required');time=Date.now();
  preview=await pc.workspace.readerPreview(readerInput(view));await pc.workspace.close();pc.reopen();
  await assert.rejects(pc.workspace.readerAdopt(adoptionInput(view,preview)),error=>error.code==='reader_preview_required');
  preview=await pc.workspace.readerPreview(readerInput(view));
  ctx.store.updateUser(ctx.b.token,ctx.a.user.id,{expectedVersion:ctx.a.user.version,role:'publisher'});await pc.client.refresh();
  await assert.rejects(pc.workspace.readerAdopt(adoptionInput(view,preview)),error=>error.code==='workspace_changed');
  view=await pc.workspace.get('page-a');preview=await pc.workspace.readerPreview(readerInput(view));
  await pc.client.connect({baseUrl:pc.origin,username:ctx.b.user.username,password:ctx.project.password});
  await assert.rejects(pc.workspace.readerAdopt(adoptionInput(view,preview)),error=>error.code==='workspace_changed');
  assert.ok(!pc.calls.includes('adoptPageEditorial'));assert.equal((await pc.client.status()).pending,0);
}));

test('reader adoption: changed identity during a delayed real preview and changed project permissions cannot expose an earlier review',t=>scoped(t,async ctx=>{
  readerSource(ctx);const pc=await ctx.connect(),view=await pc.create();
  pc.faults.set('previewPageEditorial',{after:()=>pc.client.connect({baseUrl:pc.origin,username:ctx.b.user.username,password:ctx.project.password})});
  await assert.rejects(pc.workspace.readerPreview(readerInput(view)),error=>error.code==='workspace_changed');
  await pc.client.connect({baseUrl:pc.origin,username:ctx.a.user.username,password:ctx.project.password});pc.faults.delete('previewPageEditorial');
  const denied=createExplorerPageWorkspace({withClient:callback=>pc.withClient((client,state)=>callback(client,{...state,
    permissions:{...state.permissions,canEdit:false}})),repository:ctx.local.repository,...ctx.local.authorities});
  await assert.rejects(denied.readerPreview(readerInput(view)),error=>error.code==='forbidden');await denied.close();
  const appRead=createExplorerPageWorkspace({withClient:callback=>pc.withClient((client,state)=>callback(client,{...state,editMode:false})),
    repository:ctx.local.repository,...ctx.local.authorities});
  await assert.rejects(appRead.readerPreview(readerInput(view)),error=>error.code==='forbidden');await appRead.close();
  ctx.store.updateUser(ctx.b.token,ctx.a.user.id,{expectedVersion:ctx.a.user.version,role:'reader'});await pc.client.refresh();
  await assert.rejects(pc.workspace.readerPreview(readerInput(view)),error=>error.code==='forbidden');
  assert.equal((await pc.client.status()).pending,0);assert.ok(!pc.calls.includes('adoptPageEditorial'));
}));

test('reader adoption: a new local page before the acceptance stops staging; a second writer after staging is returned honestly without leaking species data',t=>scoped(t,async ctx=>{
  readerSource(ctx);const pc=await ctx.connect();let view=await pc.create(),preview=await pc.workspace.readerPreview(readerInput(view));
  independentPage(ctx,pc,document=>{document.title='Vor dem Klick neuere eigene Seitenfassung';});
  await assert.rejects(pc.workspace.readerAdopt(adoptionInput(view,preview)),error=>error.code==='draft_conflict');
  assert.equal((await pc.client.status()).pending,0);assert.ok(!pc.calls.includes('adoptPageEditorial'));
  view=await pc.sync(await pc.workspace.get('page-a'));preview=await pc.workspace.readerPreview(readerInput(view));let later;
  pc.faults.set('adoptPageEditorial',{after(){later=independentPage(ctx,pc,document=>{document.title='Nach Stage neuere eigene Seitenfassung';});}});
  const posts=changePosts(pc),result=await pc.workspace.readerAdopt(adoptionInput(view,preview));
  assert.equal(result.queued,true);assert.equal(result.localPageChanged,true);assert.equal(result.sourceScope,view.sourceScope);assert.equal(result.draftId,'page-a');
  assert.equal(result.readerApproved,false);assert.equal(result.externalPublication,'not-performed');assert.match(result.message,/vorgemerkt/);
  assert.equal(Object.hasOwn(result,'object'),false);assert.equal(Object.hasOwn(result,'data'),false);
  const current=await pc.workspace.get('page-a');assert.equal(current.draft.revision,later.revision);assert.equal(current.sync.localPending,true);
  const staged=await pc.client.getObject('species',ctx.local.species.slug);assert.equal(staged.data.editorial.title,view.draft.document.title);
  assert.notEqual(staged.data.editorial.title,current.draft.document.title);assert.equal((await pc.client.status()).pending,1);assert.equal(changePosts(pc),posts);
}));

test('reader adoption: lost stage acknowledgement consumes the wrapper and never repeats an already queued change',t=>scoped(t,async ctx=>{
  readerSource(ctx);const pc=await ctx.connect(),view=await pc.create(),preview=await pc.workspace.readerPreview(readerInput(view));
  pc.faults.set('adoptPageEditorial',{after(){throw new Error('lost local stage acknowledgement');}});
  await assert.rejects(pc.workspace.readerAdopt(adoptionInput(view,preview)),/lost local stage acknowledgement/);
  assert.equal((await pc.client.status()).pending,1);const called=pc.calls.filter(method=>method==='adoptPageEditorial').length;
  await assert.rejects(pc.workspace.readerAdopt(adoptionInput(view,preview)),error=>error.code==='reader_preview_required');
  await assert.rejects(pc.workspace.readerPreview(readerInput(view)),error=>error.code==='pending_review');
  assert.equal(pc.calls.filter(method=>method==='adoptPageEditorial').length,called);assert.equal(changePosts(pc),0);
}));

test('reader adoption: 64 RAM previews are bounded before another client request and a close rejects an already accepted delayed preview',t=>scoped(t,async ctx=>{
  readerSource(ctx);const pc=await ctx.connect(),view=await pc.create();
  for(let index=0;index<64;index++)await pc.workspace.readerPreview(readerInput(view));
  assert.equal(pc.calls.filter(method=>method==='previewPageEditorial').length,64);
  await assert.rejects(pc.workspace.readerPreview(readerInput(view)),error=>error.code==='reader_preview_limit');
  assert.equal(pc.calls.filter(method=>method==='previewPageEditorial').length,64);assert.equal(changePosts(pc),0);
  await pc.workspace.close();pc.reopen();await pc.client.connect({baseUrl:pc.origin,username:ctx.a.user.username,password:ctx.project.password});
  let entered,release;const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
  pc.faults.set('previewPageEditorial',{after(){entered();return gate;}});
  const opening=pc.workspace.readerPreview(readerInput(view)),rejected=assert.rejects(opening,error=>error.code==='workspace_closed');await started;
  let closed=false;const closing=pc.workspace.close().then(()=>{closed=true;});await Promise.resolve();assert.equal(closed,false);
  release();await rejected;await closing;assert.equal(closed,true);assert.equal((await pc.client.status()).pending,0);
  await assert.rejects(pc.workspace.readerAdopt({sourceScope:view.sourceScope,draftId:'page-a',token:randomUUID()}),error=>error.code==='workspace_closed');
}));

test('reader adoption: an exactly imported page uses its actual remote data revision, not the newly assigned personal journal revision',t=>scoped(t,async ctx=>{
  readerSource(ctx);const one=await ctx.connect(),original=await one.create(),two=await ctx.connect({user:ctx.b}),list=await two.workspace.list();
  const imported=await two.workspace.refreshFromProject({sourceScope:list.sourceScope,draftId:'page-a',mutationId:randomUUID()});
  assert.notEqual(imported.draft.revision,original.draft.revision);assert.deepEqual(imported.draft.document,original.draft.document);
  const preview=await two.workspace.readerPreview(readerInput(imported));assert.equal(preview.sourceScope,imported.sourceScope);
  assert.equal((await two.client.status()).pending,0);assert.equal(changePosts(two),0);
  const result=await two.workspace.readerAdopt(adoptionInput(imported,preview));assert.equal(result.queued,true);
  assert.equal((await two.client.status()).pending,1);assert.equal(changePosts(two),0);assert.equal((await one.client.status()).pending,0);
  assert.equal((await two.client.getObject('species',ctx.local.species.slug)).data.editorial.sourceBindings.page.dataRevision,original.draft.revision);
}));

test('reader adoption: an imported fresh Authority snapshot stays local-only until explicit sync confirms its exact changed document',t=>scoped(t,async ctx=>{
  readerSource(ctx);const one=await ctx.connect(),original=await one.create(),two=await ctx.connect({user:ctx.b}),list=await two.workspace.list();
  ctx.local.species.runtimeReady=true;
  let view=await two.workspace.refreshFromProject({sourceScope:list.sourceScope,draftId:'page-a',mutationId:randomUUID()});
  assert.equal(view.draft.document.species.runtimeReady,true);assert.equal(view.remote.data.document.species.runtimeReady,false);
  assert.equal(view.sync.state,'local-only');assert.equal(view.sync.localPending,true);assert.equal(view.sync.hasNewerLocalChanges,true);
  assert.equal((await two.client.status()).pending,0);assert.equal(changePosts(two),0);
  await assert.rejects(two.workspace.readerPreview(readerInput(view)),error=>error.code==='shared_page_unconfirmed');
  const imported=view.draft.revision;two.reopen();view=await two.workspace.get('page-a');assert.equal(view.sync.state,'local-only');
  assert.equal(ctx.local.repository.workspacePendingState().localOnly,1);view=await two.sync(view);
  assert.equal(view.draft.revision,imported);assert.equal(view.sync.state,'synced');assert.equal(view.sync.localPending,false);assert.equal(changePosts(two),1);
  const server=ctx.store.getObject(ctx.a.token,'page',pageAuthoringObjectId('page-a'));
  assert.equal(server.data.document.species.runtimeReady,true);assert.equal(server.data.revision,imported);assert.notEqual(server.data.revision,original.draft.revision);
  assert.ok((await two.workspace.readerPreview(readerInput(view))).token);assert.equal((await two.client.status()).pending,0);
}));
