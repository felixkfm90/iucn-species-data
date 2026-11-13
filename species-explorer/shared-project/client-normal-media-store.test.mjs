import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir,assertTestTempPath } from '../../scripts/test-temp.mjs';
import { createSharedProjectClientStore } from './client-store.mjs';
import { createClientNormalStore,inspectClientNormalStore,validateClientNormalMetadata } from './client-normal-media-store.mjs';
import { createClientImageStore } from './client-image-media-store.mjs';
import { normalMediaContentId } from './normal-media.mjs';
import { digest } from './security.mjs';
import { createTestPng } from '../server-test-fixtures.mjs';
import { inspectClientImage } from './client-image-media.mjs';

// Container/header fixtures isolate durable cache invariants; decoder injection
// remains explicit for these tests. Production snapshot validation uses real decoders.
const webp=Buffer.alloc(30);webp.write('RIFF');webp.writeUInt32LE(22,4);webp.write('WEBPVP8X',8);webp.writeUInt32LE(10,16);webp.writeUIntLE(5,24,3);webp.writeUIntLE(3,27,3);
const frame=Buffer.alloc(417);Buffer.from([255,251,144,100]).copy(frame);const mp3=Buffer.concat([frame,frame,frame]);
const source={sourceRevision:'11111111-1111-4111-8111-111111111111',sourceDataHash:'a'.repeat(64)};
const decoders={imageDecode:async()=>({width:6,height:4}),audioDecode:async bytes=>({bytes:bytes.length,sha256:digest(bytes),mimeType:'audio/mpeg'})};
function metadata(projectId,slot='portrait.webp',extra={}) {
  const bytes=slot==='sound.mp3'?mp3:webp,asset={id:'original-normal:42',projectId,sha256:digest(bytes),bytes:bytes.length,
    mimeType:slot==='sound.mp3'?'audio/mpeg':'image/webp',attribution:"Eigene 'Quelle'",...extra};
  return {contentId:normalMediaContentId({projectId,speciesId:'fixture-owl',slot,asset}),projectId,speciesId:'fixture-owl',slot,asset,
    width:slot==='sound.mp3'?null:6,height:slot==='sound.mp3'?null:4,complete:true};
}
function fixture(t) {
  const root=fs.mkdtempSync(path.join(tmpdir(),'normal-cache-')),filename=path.join(root,'cache.sqlite'),connections=[];
  const store=createSharedProjectClientStore({filename,localStorageConfirmed:true}),owner=store.bind({baseUrl:'https://fixture.invalid',projectId:'project-a',
    user:{id:'user-a',username:'fixture-a',displayName:'A',role:'admin'}}),other=store.bind({baseUrl:'https://other.invalid',projectId:'project-a',
    user:{id:'user-b',username:'fixture-b',displayName:'B',role:'admin'}});
  t.after(()=>{for(const db of connections)db.close();store.close();fs.rmSync(assertTestTempPath(root),{recursive:true,force:true,maxRetries:5,retryDelay:25});});
  function connect(limits) {const db=new DatabaseSync(filename);connections.push(db);db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
    const options={db,limits,open(){},binding:id=>[owner,other].find(item=>item.id===id),tx(fn){db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}};
    return {db,normal:createClientNormalStore(options),images:createClientImageStore(options)};}
  return {root,filename,store,owner,other,connect};
}

test('normal cache4 persists exact image and MP3 bindings separately from image IDs and segregates personal Origins',async t=>{
  const f=fixture(t),{db,normal}=f.connect();assert.equal(db.prepare('PRAGMA user_version').get().user_version,4);
  for(const slot of ['portrait.webp','sound.mp3']) {const value=metadata(f.owner.projectId,slot),bytes=slot==='sound.mp3'?mp3:webp;
    normal.save(f.owner.id,value,bytes,source);assert.deepEqual(normal.get(f.owner.id,value.contentId).buffer,bytes);
    assert.deepEqual(normal.describe(f.owner.id,value.contentId),value);assert.equal(normal.get(f.other.id,value.contentId),null);}
  const checked=await inspectClientNormalStore(db,decoders);assert.equal(checked.localBlobCount,2);assert.equal(checked.localNormalBytes,webp.length+mp3.length);
  assert.equal(checked.normalReferenceCount,2);assert.match(checked.normalReferencesSha256,/^[a-f0-9]{64}$/);
  assert.equal(JSON.parse(db.prepare('SELECT receipt_json FROM normal_media LIMIT 1').get().receipt_json).baseUrl,f.owner.baseUrl);
  assert.equal(db.prepare('SELECT count(*) AS n FROM queue').get().n,0);assert.equal(db.prepare('SELECT count(*) AS n FROM image_media').get().n,0);
});

test('normal describe never materializes BLOBs; receipt and source fields remain bound after deduplicated reopen',async t=>{
  const f=fixture(t),{db,normal}=f.connect(),value=metadata(f.owner.projectId);normal.save(f.owner.id,value,webp,source);
  normal.save(f.owner.id,metadata(f.owner.projectId,'spectrogram.webp'),webp,source);
  const before=db.prepare('SELECT * FROM normal_media ORDER BY content_id').all();normal.save(f.owner.id,value,webp,{...source,sourceDataHash:'b'.repeat(64)});
  assert.deepEqual(db.prepare('SELECT * FROM normal_media ORDER BY content_id').all(),before);assert.equal(normal.budget().normalBytes,webp.length);
  let reads=0;const traced={prepare(sql){if(/SELECT\s+(?:\*|data)\s+FROM\s+normal_blobs\b/i.test(sql))reads++;return db.prepare(sql);}};
  const local=createClientNormalStore({db:traced,open(){},binding:()=>f.owner,tx:fn=>fn()});assert.deepEqual(local.describe(f.owner.id,value.contentId),value);assert.equal(reads,0);
  assert.deepEqual(f.connect().normal.get(f.owner.id,value.contentId).buffer,webp);
});

test('two SQLite writers enforce one shared image+normal reserve in both admission directions',async t=>{
  const f=fixture(t),value=metadata(f.owner.projectId),imageBytes=createTestPng(2,2),image=await inspectClientImage(imageBytes,{projectId:f.owner.projectId,decode:async()=>{}});
  const first=f.connect({blobBytes:Math.max(webp.length,imageBytes.length),cacheBytes:1024*1024}),second=f.connect({blobBytes:Math.max(webp.length,imageBytes.length),cacheBytes:1024*1024});
  first.normal.save(f.owner.id,value,webp,source);
  assert.throws(()=>second.images.save(f.owner.id,image,imageBytes),{code:'image_media_quota'});assert.equal(second.images.get(f.owner.id,image.id),null);
  const g=fixture(t),a=g.connect({blobBytes:Math.max(webp.length,imageBytes.length),cacheBytes:1024*1024}),b=g.connect({blobBytes:Math.max(webp.length,imageBytes.length),cacheBytes:1024*1024});
  a.images.save(g.owner.id,{...image,projectId:g.owner.projectId},imageBytes);
  assert.throws(()=>b.normal.save(g.owner.id,metadata(g.owner.projectId),webp,source),{code:'normal_media_quota'});
  assert.equal(b.normal.get(g.owner.id,value.contentId),null);assert.equal(a.images.budget().mediaBytes,imageBytes.length);
});

test('normal get and snapshot reject oversized/disguised bytes and JSON before BLOB materialization',async t=>{
  for(const kind of ['bytes','json','receipt']) {
    const f=fixture(t),{db,normal}=f.connect(),value=metadata(f.owner.projectId);normal.save(f.owner.id,value,webp,source);
    if(kind==='bytes')db.prepare('UPDATE normal_blobs SET data=?').run(Buffer.alloc(webp.length+1));
    else db.prepare(`UPDATE normal_media SET ${kind==='json'?'metadata_json':'receipt_json'}=?`).run(Buffer.alloc(65*1024));
    let reads=0;const traced={prepare(sql){if(/SELECT\s+(?:\*|data)\s+FROM\s+normal_blobs\b/i.test(sql))reads++;return db.prepare(sql);}};
    const local=createClientNormalStore({db:traced,open(){},binding:()=>f.owner,tx:fn=>fn()});
    assert.throws(()=>local.get(f.owner.id,value.contentId));await assert.rejects(inspectClientNormalStore(traced,decoders));assert.equal(reads,0);
  }
});

test('normal receipts, source revisions, exact MIME/dimensions and content hashes cannot be forged in snapshot validation',async t=>{
  for(const kind of ['receipt','revision','sourceHash','metadata','blobHash']) {
    const f=fixture(t),{db,normal}=f.connect(),value=metadata(f.owner.projectId);normal.save(f.owner.id,value,webp,source);
    if(kind==='receipt'){const receipt=JSON.parse(db.prepare('SELECT receipt_json FROM normal_media').get().receipt_json);receipt.userId='other-person';db.prepare('UPDATE normal_media SET receipt_json=?').run(JSON.stringify(receipt));}
    if(kind==='revision')db.prepare("UPDATE normal_media SET source_revision='invented'").run();
    if(kind==='sourceHash')db.prepare("UPDATE normal_media SET source_data_hash='bad'").run();
    if(kind==='metadata')db.prepare('UPDATE normal_media SET metadata_json=?').run(JSON.stringify({...value,width:7}));
    if(kind==='blobHash')db.prepare('UPDATE normal_blobs SET data=?').run(Buffer.alloc(webp.length));
    await assert.rejects(inspectClientNormalStore(db,decoders));
  }
  const value=metadata('project-a');for(const bad of [{...value,complete:false},{...value,asset:{...value.asset,attribution:'Another source'}},{...value,extra:true}])assert.throws(()=>validateClientNormalMetadata(bad));
});

test('cache3 to4 migration retains all inactive bindings, pending queue JSON and partial pulls without promoting them',async t=>{
  const f=fixture(t);f.store.saveObjects(f.owner.id,[{kind:'page',id:'page-a',revision:'prior',data:{title:'Original'}}]);f.store.edit(f.owner.id,'page','page-a',{title:'Retained offline draft'});
  const {db}=f.connect(),before=db.prepare('SELECT * FROM queue').all(),bindings=db.prepare('SELECT * FROM bindings').all();
  db.exec('DROP TABLE normal_media; DROP TABLE normal_blobs; PRAGMA user_version=3;');f.store.close();
  const reopened=createSharedProjectClientStore({filename:f.filename,localStorageConfirmed:true});
  try{assert.deepEqual(db.prepare('SELECT * FROM queue').all(),before);assert.deepEqual(db.prepare('SELECT * FROM bindings').all(),bindings);
    assert.equal(reopened.get(f.owner.id,'page','page-a').data.title,'Retained offline draft');assert.equal(reopened.counts(f.owner.id).pending,1);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,4);}finally{reopened.close();}
});

test('the caller guard runs inside BEGIN IMMEDIATE before source checks and a changed role leaves every existing row intact',t=>{
  const f=fixture(t),{db}=f.connect(),value=metadata(f.owner.projectId),expectedRole=f.owner.user.role;
  const currentUser={...f.owner.user,role:'contributor'};db.prepare('UPDATE bindings SET user_json=? WHERE id=?').run(JSON.stringify(currentUser),f.owner.id);
  const before={bindings:db.prepare('SELECT * FROM bindings ORDER BY id').all(),queue:db.prepare('SELECT * FROM queue').all()};let sourceChecks=0,guards=0;
  const normal=createClientNormalStore({db,open(){},binding:()=>f.owner,assertSource(){sourceChecks++;},
    tx(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}});
  assert.throws(()=>normal.save(f.owner.id,value,webp,source,()=>{
    guards++;assert.equal(db.isTransaction,true);const actual=JSON.parse(db.prepare('SELECT user_json FROM bindings WHERE id=?').get(f.owner.id).user_json);
    assert.equal(expectedRole,'admin');if(actual.role!==expectedRole)throw Object.assign(new Error('Role changed before the transaction was acquired'),{code:'normal_media_review_changed'});
  }),{code:'normal_media_review_changed'});
  assert.equal(guards,1);assert.equal(sourceChecks,0);assert.equal(db.isTransaction,false);
  assert.equal(db.prepare('SELECT count(*) AS n FROM normal_media').get().n,0);assert.equal(db.prepare('SELECT count(*) AS n FROM normal_blobs').get().n,0);
  assert.deepEqual(db.prepare('SELECT * FROM bindings ORDER BY id').all(),before.bindings);assert.deepEqual(db.prepare('SELECT * FROM queue').all(),before.queue);
});
