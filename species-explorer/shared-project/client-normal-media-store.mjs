import { isProxy } from 'node:util/types';
import { createHash } from 'node:crypto';
import { check } from './errors.mjs';
import { canonicalJson,digest } from './security.mjs';
import { NORMAL_MEDIA_LIMITS,normalMediaContentId,normalMediaBinding } from './normal-media.mjs';
import { inspectJpeg,inspectWebp } from '../../scripts/image-header.mjs';
import { inspectCompleteMp3Buffer } from '../../scripts/audio-format.mjs';
import { validateImageDecode } from '../../scripts/image-validation.mjs';
import { validateAudioDecode } from '../../scripts/audio-validation.mjs';
import { sharedMediaLimits,assertSharedMediaBudget } from './shared-media-budget.mjs';

export const CLIENT_NORMAL_SCHEMA=`
  CREATE TABLE normal_blobs(sha256 TEXT PRIMARY KEY,bytes INTEGER NOT NULL,mime_type TEXT NOT NULL,width INTEGER,height INTEGER,data BLOB NOT NULL);
  CREATE TABLE normal_media(binding_id TEXT NOT NULL REFERENCES bindings(id),content_id TEXT NOT NULL,metadata_json TEXT NOT NULL,
    source_revision TEXT NOT NULL,source_data_hash TEXT NOT NULL,blob_sha256 TEXT NOT NULL REFERENCES normal_blobs(sha256),receipt_json TEXT NOT NULL,
    PRIMARY KEY(binding_id,content_id));
`;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,HASH=/^[a-f0-9]{64}$/,CONTENT=/^normal-[a-f0-9]{64}$/;
const META=['contentId','projectId','speciesId','slot','asset','width','height','complete'];
const ASSET=['id','projectId','sha256','bytes','mimeType','attribution'];
const ROLES=['admin','publisher','contributor','reader'];
const json=value=>canonicalJson(value,{maxBytes:64*1024,maxNodes:2000}),same=(a,b)=>json(a)===json(b);
const changed=condition=>check(condition,409,'normal_media_changed','Die persönliche Normaldatei besitzt eine andere oder unvollständige Quellen-/Bytebindung.');
function exact(value,keys) {
  changed(value&&typeof value==='object'&&!isProxy(value)&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype);
  const descriptors=Object.getOwnPropertyDescriptors(value);
  changed(Reflect.ownKeys(descriptors).length===keys.length&&Reflect.ownKeys(descriptors).every(key=>typeof key==='string'&&keys.includes(key)
    &&descriptors[key].enumerable&&Object.hasOwn(descriptors[key],'value')));
}
export function validateClientNormalMetadata(value,{projectId}={}) {
  exact(value,META);exact(value.asset,ASSET);
  changed(value.complete===true&&(projectId===undefined||value.projectId===projectId)
    &&value.contentId===normalMediaContentId({projectId:value.projectId,speciesId:value.speciesId,slot:value.slot,asset:value.asset}));
  changed(value.asset.mimeType==='audio/mpeg'?value.width===null&&value.height===null
    :Number.isSafeInteger(value.width)&&value.width>0&&Number.isSafeInteger(value.height)&&value.height>0&&value.width*value.height<=NORMAL_MEDIA_LIMITS.imagePixels);
  return JSON.parse(json(value));
}
function verifyBytes(metadata,buffer) {
  changed(Buffer.isBuffer(buffer)&&buffer.length===metadata.asset.bytes&&digest(buffer)===metadata.asset.sha256);
  if(metadata.asset.mimeType==='audio/mpeg'){inspectCompleteMp3Buffer(buffer);return 'mp3';}
  const header=(metadata.asset.mimeType==='image/jpeg'?inspectJpeg:inspectWebp)(buffer);
  changed(header.valid&&header.width===metadata.width&&header.height===metadata.height);return header.format;
}
const boundedFields=(alias='')=>Object.entries({metadata_json:65536,receipt_json:65536,source_revision:36,source_data_hash:64,blob_sha256:64})
  .map(([name,size])=>{const column=`${alias?alias+'.':''}${name}`,safe=`typeof(${column})='text' AND length(CAST(${column} AS BLOB))<=${size}`;
    return `CASE WHEN ${safe} THEN ${column} ELSE NULL END AS ${name},(${safe}) AS ${name}_valid`;}).join(',');
function checkedRow(row) {if(row)changed(['metadata_json','receipt_json','source_revision','source_data_hash','blob_sha256'].every(name=>row[`${name}_valid`]===1));return row;}
function receiptFor(bound,metadata,role=bound.user.role) {return {schemaVersion:1,baseUrl:bound.baseUrl,projectId:bound.projectId,userId:bound.userId,
  role,contentId:metadata.contentId,metadataSha256:digest(json(metadata)),complete:true};}
function validateRow(row,bound) {
  checkedRow(row);const metadata=validateClientNormalMetadata(JSON.parse(row.metadata_json),{projectId:bound.projectId}),receipt=JSON.parse(row.receipt_json);
  changed(UUID.test(row.source_revision)&&HASH.test(row.source_data_hash)&&row.blob_sha256===metadata.asset.sha256
    &&receipt&&ROLES.includes(receipt.role)&&same(receipt,receiptFor(bound,metadata,receipt.role)));
  return {metadata,receipt,sourceRevision:row.source_revision,sourceDataHash:row.source_data_hash};
}
function blobShape(db,metadata) {
  const row=db.prepare('SELECT bytes,mime_type,width,height,length(data) AS actual,typeof(data) AS kind FROM normal_blobs WHERE sha256=?').get(metadata.asset.sha256);
  changed(row&&row.bytes===metadata.asset.bytes&&row.actual===row.bytes&&row.kind==='blob'&&row.mime_type===metadata.asset.mimeType&&row.width===metadata.width&&row.height===metadata.height);return row;
}
function readBlob(db,metadata) {
  blobShape(db,metadata);const expected=metadata.asset;
  const row=db.prepare("SELECT data FROM normal_blobs WHERE sha256=? AND bytes=? AND typeof(data)='blob' AND length(data)=?").get(expected.sha256,expected.bytes,expected.bytes);
  changed(row);const buffer=Buffer.from(row.data);verifyBytes(metadata,buffer);return buffer;
}
export function assertClientNormalSchema(db) {
  const compact=value=>value.replace(/\s+/gu,'').toLowerCase();
  for(const statement of CLIENT_NORMAL_SCHEMA.split(';').map(value=>value.trim()).filter(Boolean)) {
    const table=/^CREATE TABLE (\w+)/.exec(statement)[1];
    changed(compact(db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").get(table)?.sql||'')===compact(statement));
    changed(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE tbl_name=? AND type<>'table' AND sql IS NOT NULL").get(table).n===0);
  }
  for(const [table,names,types,pks,nullable] of [
    ['normal_blobs',['sha256','bytes','mime_type','width','height','data'],['TEXT','INTEGER','TEXT','INTEGER','INTEGER','BLOB'],[1,0,0,0,0,0],[0,3,4]],
    ['normal_media',['binding_id','content_id','metadata_json','source_revision','source_data_hash','blob_sha256','receipt_json'],['TEXT','TEXT','TEXT','TEXT','TEXT','TEXT','TEXT'],[1,2,0,0,0,0,0],[]],
  ]) {const columns=db.prepare(`PRAGMA table_xinfo(${table})`).all();changed(same(columns.map(column=>column.name),names)
      &&columns.every((column,index)=>column.type===types[index]&&column.pk===pks[index]&&column.notnull===(nullable.includes(index)?0:1)&&column.hidden===0&&column.dflt_value===null));}
  const refs=db.prepare('PRAGMA foreign_key_list(normal_media)').all().map(row=>`${row.from}:${row.table}:${row.to}:${row.on_update}:${row.on_delete}:${row.match}`).sort();
  changed(same(refs,['binding_id:bindings:id:NO ACTION:NO ACTION:NONE','blob_sha256:normal_blobs:sha256:NO ACTION:NO ACTION:NONE']));
  changed(db.prepare('PRAGMA foreign_key_list(normal_blobs)').all().length===0);
}

/** Personal binding rows over one shared SQLite/queue; no network, paths or own lifecycle. */
export function createClientNormalStore({db,tx,binding,open,limits={},assertSource=()=>{}}={}) {
  const allowed=sharedMediaLimits(limits);
  function owner(id){open();const found=binding(id);check(found,401,'authentication_required','Die persönliche Normaldateibindung fehlt.');return found;}
  const budget=()=>{open();return assertSharedMediaBudget(db,{limits:allowed,quotaCode:'normal_media_quota',invalidCode:'normal_media_changed'});};
  function row(id,contentId){changed(typeof contentId==='string'&&CONTENT.test(contentId));return checkedRow(db.prepare(`SELECT ${boundedFields()} FROM normal_media WHERE binding_id=? AND content_id=?`).get(id,contentId));}
  function describe(id,contentId) {const bound=owner(id),value=row(id,contentId);check(value,404,'normal_media_not_local','Diese Artdatei wurde für diese persönliche Bindung noch nicht offline bereitgestellt.');
    const checked=validateRow(value,bound);changed(checked.metadata.contentId===contentId);budget();blobShape(db,checked.metadata);return checked.metadata;}
  function get(id,contentId) {const bound=owner(id),value=row(id,contentId);if(!value)return null;const checked=validateRow(value,bound);
    changed(checked.metadata.contentId===contentId);budget();return {metadata:checked.metadata,sourceRevision:checked.sourceRevision,sourceDataHash:checked.sourceDataHash,buffer:readBlob(db,checked.metadata)};}
  return Object.freeze({budget,get,describe,
    admissionBytes(metadata){const value=validateClientNormalMetadata(metadata);open();return allowed.metadataReserve+(db.prepare('SELECT 1 FROM normal_blobs WHERE sha256=?').get(value.asset.sha256)?0:value.asset.bytes);},
    save(id,raw,bytes,source,assertCurrent=()=>{}) {
      const metadata=validateClientNormalMetadata(raw);exact(source,['sourceRevision','sourceDataHash']);changed(typeof source.sourceRevision==='string'&&typeof source.sourceDataHash==='string'&&UUID.test(source.sourceRevision)&&HASH.test(source.sourceDataHash));verifyBytes(metadata,bytes);
      return tx(()=>{assertCurrent();const bound=owner(id);changed(bound.projectId===metadata.projectId);assertSource(id,metadata,source);
        const previous=get(id,metadata.contentId);if(previous){changed(same(previous.metadata,metadata));return previous.metadata;}
        const stored=db.prepare('SELECT 1 FROM normal_blobs WHERE sha256=?').get(metadata.asset.sha256),additional=stored?0:metadata.asset.bytes,current=budget();
        check(current.mediaBytes+additional<=allowed.blobBytes&&current.cacheBytes+additional+allowed.metadataReserve<=allowed.cacheBytes,
          413,'normal_media_quota','Die gemeinsame persönliche Medienreserve ist ausgeschöpft. Vorhandene Dateien bleiben erhalten.');
        if(stored)readBlob(db,metadata);else db.prepare('INSERT INTO normal_blobs VALUES (?,?,?,?,?,?)').run(metadata.asset.sha256,metadata.asset.bytes,metadata.asset.mimeType,metadata.width,metadata.height,bytes);
        db.prepare('INSERT INTO normal_media VALUES (?,?,?,?,?,?,?)').run(id,metadata.contentId,json(metadata),source.sourceRevision,source.sourceDataHash,metadata.asset.sha256,json(receiptFor(bound,metadata)));
        check(budget().cacheBytes<=allowed.cacheBytes,413,'normal_media_quota','Die Normaldatei überschreitet die persönliche Sicherungsreserve.');return metadata;
      });
    },
    assertReadable(id,contentId) {
      const metadata=describe(id,contentId),row=db.prepare(`SELECT CASE WHEN typeof(server_json)='text' AND length(CAST(server_json AS BLOB))<=4210688 THEN server_json ELSE NULL END AS value
        FROM cache WHERE binding_id=? AND kind='species' AND id=? AND visible=1`).get(id,metadata.speciesId);let allowed=false;
      if(row?.value){const object=JSON.parse(row.value);if(object.kind==='species'&&object.id===metadata.speciesId&&object.approval==='approved'&&object.approvedRevision===object.revision)
        try{const normal=normalMediaBinding(object.data,{projectId:metadata.projectId,slot:metadata.slot});allowed=normal?.contentId===contentId&&same(normal.asset,metadata.asset);}catch{/* no approval from an invalid source */}}
      check(allowed,403,'forbidden','Diese Normaldatei ist in der geladenen Leserfassung nicht exakt freigegeben. Eigene Cachebytes und Entwürfe bleiben erhalten.');
    },
  });
}

/** Whole-cache integrity for a separately owned snapshot; never authenticates or fetches. */
export async function inspectClientNormalStore(db,{progress=()=>{},limits={},imageDecode=validateImageDecode,audioDecode=validateAudioDecode,
  imageDecodeOptions={},audioDecodeOptions={}}={}) {
  assertClientNormalSchema(db);const checkedLimits=sharedMediaLimits(limits),first=assertSharedMediaBudget(db,{limits:checkedLimits,quotaCode:'normal_media_quota',invalidCode:'normal_media_changed'});
  const rows=db.prepare(`SELECT m.binding_id,m.content_id,${boundedFields('m')},b.base_url,b.project_id,b.user_id FROM normal_media m
    JOIN bindings b ON b.id=m.binding_id ORDER BY m.binding_id,m.content_id`).iterate(),referenceHash=createHash('sha256'),byHash=new Map();let normalReferenceCount=0;
  for(const row of rows) {progress();changed(row.binding_id===digest(`${row.base_url}\n${row.project_id}\n${row.user_id}`));
    const value=validateRow(row,{baseUrl:row.base_url,projectId:row.project_id,userId:row.user_id});changed(value.metadata.contentId===row.content_id);blobShape(db,value.metadata);
    const prior=byHash.get(value.metadata.asset.sha256);changed(!prior||same([prior.asset.bytes,prior.asset.mimeType,prior.width,prior.height],[value.metadata.asset.bytes,value.metadata.asset.mimeType,value.metadata.width,value.metadata.height]));
    byHash.set(value.metadata.asset.sha256,{asset:{sha256:value.metadata.asset.sha256,bytes:value.metadata.asset.bytes,mimeType:value.metadata.asset.mimeType},width:value.metadata.width,height:value.metadata.height});
    const serialized=json({bindingId:row.binding_id,...value});referenceHash.update(`${Buffer.byteLength(serialized)}:`).update(serialized);normalReferenceCount++;}
  changed(normalReferenceCount===db.prepare('SELECT count(*) AS n FROM normal_media').get().n);
  changed(byHash.size===db.prepare('SELECT count(*) AS n FROM normal_blobs').get().n);let localNormalBytes=0;
  for(const metadata of byHash.values()) {progress();assertSharedMediaBudget(db,{limits:checkedLimits,quotaCode:'normal_media_quota',invalidCode:'normal_media_changed'});
    const bytes=readBlob(db,metadata),format=verifyBytes(metadata,bytes);
    if(format==='mp3'){const decoded=await audioDecode(bytes,{...audioDecodeOptions});changed(decoded?.bytes===bytes.length&&decoded.sha256===metadata.asset.sha256&&decoded.mimeType==='audio/mpeg');}
    else{const decoded=await imageDecode(bytes,{...imageDecodeOptions,format});changed(decoded?.width===metadata.width&&decoded.height===metadata.height);}
    progress();verifyBytes(metadata,bytes);readBlob(db,metadata);localNormalBytes+=metadata.asset.bytes;}
  const after=assertSharedMediaBudget(db,{limits:checkedLimits,quotaCode:'normal_media_quota',invalidCode:'normal_media_changed'});changed(localNormalBytes===first.normalBytes&&localNormalBytes===after.normalBytes);
  return {localNormalBytes,localBlobCount:byHash.size,normalReferenceCount,normalReferencesSha256:referenceHash.digest('hex')};
}
