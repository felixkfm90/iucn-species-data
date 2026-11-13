import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir,assertTestTempPath } from '../scripts/test-temp.mjs';
import { createPageAuthoringExplorerFixture } from './server-page-authoring-fixtures.mjs';
import { createWebsiteAltStore } from './website-alt-store.mjs';
import { createWebsiteAltTextsService } from './website-alt-service.mjs';
import { parseWebsiteAltPage } from './website-alt-parser.mjs';
import { pageAuthoringObjectId } from './page-authoring/shared.mjs';
import { sha256 } from './page-authoring/contract.mjs';

const PAGE='/api/page-authoring',AI='/api/local-ai';
const websiteUrl='https://www.fnwildlifetravel.de/reisen/2024-costa-rica/cordillera-de-talamanca';
const websiteSource='https://images.squarespace-cdn.com/content/v1/synthetic/language-fixture.jpg';
const TERMINAL=new Set(['completed','failed','stale','cancelled']);

async function json(response,status,code) {
  const value=await response.json();
  assert.equal(response.status,status,JSON.stringify({code:value.code,error:value.error}));
  if(code!==undefined)assert.equal(value.code,code);
  return value;
}
function deferred() {
  let resolve,settled=false;
  const promise=new Promise(yes=>{resolve=yes;});
  return {promise,resolve(){settled=true;resolve();},get settled(){return settled;}};
}
function languageReply(request) {
  const input=JSON.parse(request.messages[1].content.split('\nTEXT_DATEN=')[1]);
  return {draftSha256:input.draftSha256,findings:input.text.startsWith('das ')?[
    {kind:'capitalization',draftQuote:'das',replacement:'Das',explanation:'Satzanfang großschreiben.'},
  ]:[]};
}
function blockedResponder(entered,release) {
  return async(request,{signal})=>{
    entered.resolve();signal.throwIfAborted();
    await new Promise((resolve,reject)=>{
      const cancel=()=>{signal.removeEventListener('abort',cancel);reject(signal.reason);};
      signal.addEventListener('abort',cancel,{once:true});
      release.promise.then(()=>{signal.removeEventListener('abort',cancel);resolve();});
      if(signal.aborted)cancel();
    });
    signal.throwIfAborted();return languageReply(request);
  };
}
async function waitForWorker(f,job,entered) {
  for(let attempt=0;attempt<200;attempt++){
    if(entered.settled)return;
    const state=await f.job(job.jobId);
    assert.equal(TERMINAL.has(state.status),false,`Job ended before the controlled worker: ${state.status} ${state.error}`);
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  throw new Error('Controlled language worker was not entered within the bounded wait.');
}

async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'http-language-')),website=createWebsiteAltStore({dataRoot:root});
  let websiteTexts,f;
  t.after(async()=>{await f?.server.close();await websiteTexts?.close();await rm(assertTestTempPath(root),{recursive:true,force:true,maxRetries:8,retryDelay:25});});
  async function observe(text='Vorhandener öffentlicher Bildtext') {
    const parsed=parseWebsiteAltPage(`<html><head><title>Sprachtest</title></head><body><main><img src="${websiteSource}" alt="${text}"></main></body></html>`,websiteUrl);
    return website.mergeScan({pages:[{...parsed,checkedAt:new Date().toISOString()}],discoveredUrls:[websiteUrl],errors:[],complete:true,
      coverageNotes:['Synthetische öffentliche HTML-Beobachtung über echten Parser und Store'],completedAt:new Date().toISOString()});
  }
  const observed=await observe(),image=observed.pages[0].images[0];
  await website.draft({revision:observed.revision,pageUrl:websiteUrl,imageKey:image.key,text:'Bereits gespeicherter Bildtextentwurf',decorative:false});
  const calls={worker:[],downloads:0,normalizations:0,stops:0,closes:0};let respond=languageReply;
  // Deliberate model/cache/normalizer fakes: this qualifies HTTP, source and owner binding, never model quality.
  const worker={status:()=>({state:'stopped',busy:false,ownWorkerActive:false,errorCode:''}),
    async complete(request,options){calls.worker.push(structuredClone(request));return respond(request,options);},
    async stop(){calls.stops++;},async close(){calls.closes++;}};
  const normalizer={async normalize(){calls.normalizations++;throw new Error('A language-only HTTP request must never normalize image bytes.');},async close(){}};
  websiteTexts=createWebsiteAltTextsService({store:website,discovery:{async page(){throw new Error('No website fetch is part of language review.');},
    async discover(){throw new Error('No discovery is part of language review.');}}});
  f=await createPageAuthoringExplorerFixture(t,{websiteAltTextsService:websiteTexts,publicRuntimeAvailable:false,
    // These placeholders bind normal source metadata only. Any attempt to decode them fails explicitly.
    mediaFactory:()=>({portrait:Buffer.from('language-only portrait metadata fixture'),map:Buffer.from('language-only map metadata fixture'),
      spectrogram:Buffer.from('language-only spectrogram metadata fixture'),photo:Buffer.from('unused language-only photo fixture')}),
    imageDecode(){throw new Error('Language-only HTTP qualification must not invoke a decoder.');},
    localAiOptions:({profileRoot})=>({cacheRoot:join(profileRoot,'local-ai'),deviceId:'synthetic-language-device',normalizer,
      cacheFactory:()=>({status:async()=>({status:'not-installed'}),async download(){calls.downloads++;throw new Error('No model download in HTTP fixture.');},async close(){}}),
      workerFactory:()=>worker}),
  });
  const login=(user=f.a)=>jsonResponse(f.post('/api/shared-project/connect',{baseUrl:f.address.url,username:user.user.username,password:f.project.password}),200);
  async function jsonResponse(promise,status,code){return json(await promise,status,code);}
  await login();
  const state=await json(await fetch(`${f.base}${PAGE}`),200),sourceScope=state.sourceScope,draftId='language-http-page';
  let page=await json(await f.post(`${PAGE}/drafts`,{sourceScope,draftId,mutationId:randomUUID(),templateId:'fn-compact-20261031',
    slug:f.record.id,parentPath:'/wildlife/heimische-tierwelt'}),200);
  assert.equal(page.draft.document.species.runtimeReady,false,'No public runtime or image decode is asserted by this fixture.');
  const document=structuredClone(page.editable);
  document.sections.find(section=>section.id==='appearance').blocks=[{type:'paragraph',text:'das ist der gespeicherte Fachtext'}];
  page=await json(await f.post(`${PAGE}/drafts/${draftId}/save`,{sourceScope,mutationId:randomUUID(),expectedRevision:page.draft.revision,document}),200);
  const pageView=()=>jsonResponse(fetch(`${f.base}${PAGE}/drafts/${draftId}`),200);
  const pageRequest=(value=page)=>({type:'page-authoring',sourceScope,draftId,expectedRevision:value.draft.revision,sectionId:'appearance',requestId:randomUUID()});
  const websiteRequest=async(extra={})=>{
    const current=await website.snapshot(),currentImage=current.pages[0].images[0];
    return {type:'website-language',pageUrl:websiteUrl,imageKey:currentImage.key,observationHash:currentImage.observationHash,
      draftText:'das ist mein ungespeicherter Bildtext',requestId:randomUUID(),...extra};
  };
  const originalHashes=async()=>Object.fromEntries(await Promise.all(f.originalFiles.map(async filename=>[filename,sha256(await readFile(join(f.repoRoot,filename)))])));
  const websiteHash=async()=>sha256(await readFile(join(root,'website','alt-texts.json')));
  function journalState() {
    const db=new DatabaseSync(f.authoringFile,{readOnly:true});
    try {
      const scope=db.prepare('SELECT scope_id FROM workspace_scopes WHERE origin=? AND actor_id=?').get(f.address.url,f.a.user.id);
      assert.match(scope.scope_id,/^[a-f0-9]{64}$/);
      return Object.fromEntries(['drafts','versions','mutations','artifacts','cms_attempts','cms_receipts','workspace_links'].map(table=>
        [table,db.prepare(`SELECT * FROM ${table}_${scope.scope_id} ORDER BY rowid`).all()]));
    }finally{db.close();}
  }
  async function baseline() {
    return {hashes:await originalHashes(),websiteHash:await websiteHash(),page:await pageView(),journal:journalState(),
      remote:f.store.getObject(f.a.token,'page',pageAuthoringObjectId(draftId))};
  }
  async function unchanged(before) {
    assert.deepEqual(await originalHashes(),before.hashes);assert.equal(await websiteHash(),before.websiteHash);
    assert.equal((await pageView()).draft.revision,before.page.draft.revision);assert.deepEqual(journalState(),before.journal);
    assert.deepEqual(f.store.getObject(f.a.token,'page',pageAuthoringObjectId(draftId)),before.remote);
    assert.equal(before.journal.artifacts.length,0);assert.equal(before.journal.cms_attempts.length,0);assert.equal(before.journal.cms_receipts.length,0);
    assert.equal(calls.normalizations,0);assert.equal(calls.downloads,0);assert.equal(f.decodeCalls.length,0);
  }
  async function job(id) {return json(await fetch(`${f.base}${AI}/jobs/${id}`),200);}
  async function wait(id) {
    for(let attempt=0;attempt<200;attempt++){
      const current=await job(id);if(TERMINAL.has(current.status))return current;
      await new Promise(resolve=>setTimeout(resolve,5));
    }
    throw new Error('Synthetic language HTTP job did not finish within the bounded poll.');
  }
  return {...f,calls,website,observe,login,pageView,pageRequest,websiteRequest,baseline,unchanged,wait,job,
    setResponder(value){respond=value;}};
}

test('echter HTTP-Sprachweg prüft ungespeicherten Websitebildtext und gespeicherten Fachabschnitt ohne Quellenpicker oder Schreibwirkung',async t=>{
  const f=await fixture(t),before=await f.baseline();
  const status=await json(await fetch(`${f.base}${AI}`),200);
  assert.equal(status.pageAuthoringAvailable,true);assert.equal(status.languageReviewAvailable,true);assert.equal(f.calls.worker.length,0);
  for(const [route,payload]of [[`${AI}/review-language`,await f.websiteRequest()],[`${AI}/page-authoring/review-language`,f.pageRequest()]]){
    await t.test(`lokale Sitzung und Browserursprung schützen ${route}`,async()=>{
      await json(await fetch(`${f.base}${route}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:f.base},body:JSON.stringify(payload)}),403);
      await json(await f.post(route,payload,{Origin:'https://foreign.example','Sec-Fetch-Site':'cross-site'}),403);
      assert.equal(f.calls.worker.length,0);
    });
  }
  const website=await json(await f.post(`${AI}/review-language`,await f.websiteRequest()),200),websiteDone=await f.wait(website.jobId);
  assert.equal(websiteDone.status,'completed');assert.equal(websiteDone.result.originalText,'das ist mein ungespeicherter Bildtext');
  assert.equal(websiteDone.result.correctedText,'Das ist mein ungespeicherter Bildtext');
  assert.equal(websiteDone.result.binding.type,'website-language');assert.equal(websiteDone.result.binding.snapshotRevision,(await f.website.snapshot()).revision);
  const page=await json(await f.post(`${AI}/page-authoring/review-language`,f.pageRequest()),200),pageDone=await f.wait(page.jobId);
  assert.equal(pageDone.status,'completed');assert.equal(pageDone.result.originalText,'das ist der gespeicherte Fachtext');
  assert.equal(pageDone.result.correctedText,'Das ist der gespeicherte Fachtext');assert.equal(pageDone.result.binding.type,'page-authoring');
  assert.equal(pageDone.result.binding.revision,before.page.draft.revision);assert.equal(Object.hasOwn(pageDone.result.binding,'sourceIds'),false);
  assert.equal(f.calls.worker.length,2);
  for(const done of [websiteDone,pageDone]){
    assert.equal(done.result.approved,false);assert.equal(done.result.transferred,false);assert.equal(done.result.languageGuarantee,false);
    assert.equal(done.result.factualGuarantee,false);assert.equal(done.result.humanReviewRequired,true);
    assert.equal(JSON.stringify(done).includes('private original'),false);
  }
  assert.equal(JSON.stringify(f.calls.worker).includes('private original'),false);
  await f.unchanged(before);
  await f.login(f.b);
  await json(await fetch(`${f.base}${AI}/jobs/${website.jobId}`),409);
  const otherStatus=await json(await fetch(`${f.base}${AI}`),200);
  assert.deepEqual(otherStatus.jobs,[]);assert.equal(JSON.stringify(otherStatus).includes('ungespeicherter'),false);
  await json(await fetch(`${f.base}${AI}/jobs/${page.jobId}`,{headers:{Origin:'https://foreign.example','Sec-Fetch-Site':'cross-site'}}),403);
  await f.login();assert.equal((await f.job(page.jobId)).status,'completed');await f.unchanged(before);
});

test('HTTP-Website-Sprachweg verwirft veraltete Beobachtungen vor dem Modell und nach einer verspäteten Modellantwort',async t=>{
  const f=await fixture(t),before=await f.baseline(),old=await f.websiteRequest();
  await f.observe('Bewusst geänderte synthetische öffentliche Beobachtung');
  const afterObservation=await f.baseline(),stale=await json(await f.post(`${AI}/review-language`,old),200),rejected=await f.wait(stale.jobId);
  assert.equal(rejected.status,'failed');assert.equal(rejected.result,null);assert.equal(f.calls.worker.length,0);
  await f.unchanged(afterObservation);
  const entered=deferred(),release=deferred();
  f.setResponder(blockedResponder(entered,release));
  const started=await json(await f.post(`${AI}/review-language`,await f.websiteRequest()),200);
  await waitForWorker(f,started,entered);
  let afterLaterObservation;
  try {await f.observe('Noch eine ausdrücklich geänderte synthetische Beobachtung');afterLaterObservation=await f.baseline();}
  finally{release.resolve();}
  const done=await f.wait(started.jobId);assert.equal(done.status,'stale');assert.equal(done.result,null);
  assert.equal(f.calls.worker.length,1);await f.unchanged(afterLaterObservation);
  assert.deepEqual(afterLaterObservation.hashes,before.hashes);assert.equal(afterLaterObservation.page.draft.revision,before.page.draft.revision);
});

test('HTTP-Page-Sprachweg bindet den echten SQLite-CAS-Kopf und übernimmt keine Antwort für inzwischen geänderte Fachtexte',async t=>{
  const f=await fixture(t),before=await f.baseline(),request=f.pageRequest(),entered=deferred(),release=deferred();
  f.setResponder(blockedResponder(entered,release));
  const started=await json(await f.post(`${AI}/page-authoring/review-language`,request),200);await waitForWorker(f,started,entered);
  let saved,afterEdit;
  try {
    const document=structuredClone(before.page.editable);document.sections.find(section=>section.id==='appearance').blocks=[{type:'paragraph',text:'Der Fachtext wurde bewusst geändert.'}];
    saved=await json(await f.post(`${PAGE}/drafts/${request.draftId}/save`,{sourceScope:request.sourceScope,mutationId:randomUUID(),expectedRevision:request.expectedRevision,document}),200);
    assert.notEqual(saved.draft.revision,request.expectedRevision);afterEdit=await f.baseline();
  }finally{release.resolve();}
  const done=await f.wait(started.jobId);assert.equal(done.status,'stale');assert.equal(done.result,null);await f.unchanged(afterEdit);
  const rejected=await json(await f.post(`${AI}/page-authoring/review-language`,{...request,requestId:randomUUID()}),200);
  assert.equal((await f.wait(rejected.jobId)).status,'failed');assert.equal(f.calls.worker.length,1);
  await json(await f.post(`${AI}/page-authoring/review-language`,{...f.pageRequest(saved),sourceIds:[],expectedSourcesRevision:'a'.repeat(64)}),409);
  assert.equal(f.calls.worker.length,1);await f.unchanged(afterEdit);assert.deepEqual(afterEdit.hashes,before.hashes);
});

test('HTTP-Sprachaufträge verlieren beim echten Personen- oder Rechtewechsel ihre private Antwort und starten als Leser keine Modellarbeit',async t=>{
  const f=await fixture(t),before=await f.baseline(),entered=deferred(),release=deferred();
  f.setResponder(blockedResponder(entered,release));
  const started=await json(await f.post(`${AI}/review-language`,await f.websiteRequest({draftText:'das ist PRIVATER_UNGESPEICHERTER_TEXT'})),200);await waitForWorker(f,started,entered);
  try {
    await f.login(f.b);
    const other=await json(await fetch(`${f.base}${AI}`),200);assert.deepEqual(other.jobs,[]);assert.equal(JSON.stringify(other).includes('PRIVATER_UNGESPEICHERTER_TEXT'),false);
    await json(await fetch(`${f.base}${AI}/jobs/${started.jobId}`),409);
  }finally{release.resolve();}
  await f.login();const cancelled=await f.wait(started.jobId);assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.result,null);
  const reader=f.store.updateUser(f.b.token,f.a.user.id,{expectedVersion:f.a.user.version,role:'reader'});
  try {
    await json(await f.post('/api/shared-project/refresh'),200);
    await json(await f.post(`${AI}/review-language`,await f.websiteRequest()),403,'local_ai_unavailable');
    await json(await f.post(`${AI}/page-authoring/review-language`,f.pageRequest()),403,'local_ai_unavailable');
    await json(await fetch(`${f.base}${AI}/jobs/${started.jobId}`),409);
    assert.equal(f.calls.worker.length,1);
  }finally{
    f.store.updateUser(f.b.token,f.a.user.id,{expectedVersion:reader.version,role:'admin'});
    await json(await f.post('/api/shared-project/refresh'),200);
  }
  await f.unchanged(before);
});
