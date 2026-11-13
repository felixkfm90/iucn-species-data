import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { fixture as projectFixture,species } from './test-fixtures.mjs';
import { digest } from './security.mjs';
import { PROJECT_SCHEMA_COLUMNS,assertProjectMediaSchema,inspectImageMediaContents } from './image-media.mjs';
import { NORMAL_MEDIA_SCHEMA_COLUMNS,normalMediaContentId } from './normal-media.mjs';
import { NORMAL_MEDIA_SQL,assertNormalMediaSchema,installNormalMediaSchema } from './normal-media-schema.mjs';
import { createTestPng } from '../server-test-fixtures.mjs';
import { validateSpeciesRecord } from './species-record.mjs';

const projectId='schema-normal-project',person='schema-person',revision='11111111-1111-4111-8111-111111111111',time='2026-11-02T12:00:00.000Z';
const rejected=error=>error.code==='unsupported_schema'&&error.status===409;
function rows(db,names) {return Object.fromEntries(names.map(name=>[name,db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]));}
function retained(db) {return {version:db.prepare('PRAGMA user_version').get().user_version,
  schema:db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name').all(),
  rows:rows(db,db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name))};}
function insert(db,table,row) {
  const columns=NORMAL_MEDIA_SCHEMA_COLUMNS[table].split(',');
  return db.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...columns.map(key=>row[key]));
}
function fixture(t) {
  const project=projectFixture(),store=project.open();store.close();
  const db=new DatabaseSync(project.filename);db.exec('PRAGMA foreign_keys=ON');
  t.after(()=>{db.close();project.cleanup();});
  // Build a genuine prior-schema fixture even after the composition root starts
  // creating schema 6 by default. Only this newly created, empty test DB is reduced.
  if(db.prepare('PRAGMA user_version').get().user_version===6) {
    assertNormalMediaSchema(db);db.exec("DROP TABLE normal_media_assets; DROP TABLE normal_media_blobs; DELETE FROM meta WHERE key='reader_media_generation'; PRAGMA user_version=5;");
  }
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,5);assertProjectMediaSchema(db,5);
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?,?)').run(person,'schema-user','Synthetic schema person','synthetic-not-a-password','admin',0,1,time);
  db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?)').run('synthetic-session-hash',person,null,'full',1900000000000,time);
  db.prepare('INSERT INTO meta(key,value) VALUES (?,?)').run('project_id',projectId);
  db.prepare('INSERT INTO versions VALUES (?,?,?,?,?,?,?,?)').run('species','fixture-owl',revision,1,null,JSON.stringify(species()),person,time);
  db.prepare('INSERT INTO objects VALUES (?,?,?,?)').run('species','fixture-owl',revision,null);
  const png=createTestPng(3,2),sha=digest(png);
  db.prepare('INSERT INTO image_media_blobs VALUES (?,?,?,?,?,?)').run(sha,png.length,'image/png',3,2,png);
  db.prepare('INSERT INTO image_media_assets VALUES (?,?,?,?,?,?,?,?,?)').run('image-11111111-1111-4111-8111-111111111111',projectId,sha,png.length,'image/png',"Original 'Quelle' · unverändert",person,time,sha);
  return {db,project};
}
function normalRows({slot='map.jpg',mimeType='image/jpeg'}={}) {
  const data=Buffer.from('synthetic SQL storage bytes'),sha256=digest(data),asset={id:'original-normal:42',projectId,sha256,bytes:data.length,mimeType,attribution:"Original 'Quelle' · Lizenz"};
  return {blob:{sha256,bytes:data.length,mime_type:mimeType,width:mimeType==='audio/mpeg'?null:3,height:mimeType==='audio/mpeg'?null:2,data},
    asset:{content_id:normalMediaContentId({projectId,speciesId:'fixture-owl',slot,asset}),project_id:projectId,species_id:'fixture-owl',slot,
      source_id:asset.id,sha256,bytes:data.length,mime_type:mimeType,attribution:asset.attribution,source_revision:revision,creator_id:person,created_at:time,blob_sha256:null}};
}
function changeNormalSql(db,change) {
  const sql=NORMAL_MEDIA_SQL;db.exec('DROP TABLE normal_media_assets; DROP TABLE normal_media_blobs;');db.exec(change(sql));
}

test('qualified schema5 migrates additively to6 and preserves user/session/object/history and managed image bytes exactly',t=>{
  const {db}=fixture(t),before=rows(db,Object.keys(PROJECT_SCHEMA_COLUMNS));
  installNormalMediaSchema(db);assert.equal(db.prepare('PRAGMA user_version').get().user_version,6);
  const after=rows(db,Object.keys(PROJECT_SCHEMA_COLUMNS));after.meta=after.meta.filter(row=>row.key!=='reader_media_generation');
  assert.deepEqual(after,before);assertNormalMediaSchema(db);assertProjectMediaSchema(db,6);inspectImageMediaContents(db,projectId);
  assert.equal(db.prepare("SELECT value FROM meta WHERE key='reader_media_generation'").get().value,'0');
  for(const table of Object.keys(NORMAL_MEDIA_SCHEMA_COLUMNS))assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,0);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('second installation qualifies existing6 without duplicate tables, byte loss or resetting reader generation',t=>{
  const {db}=fixture(t);installNormalMediaSchema(db);const value=normalRows();insert(db,'normal_media_blobs',value.blob);
  insert(db,'normal_media_assets',{...value.asset,blob_sha256:value.blob.sha256});
  db.prepare("UPDATE meta SET value='17' WHERE key='reader_media_generation'").run();const before=retained(db);
  installNormalMediaSchema(db);assert.deepEqual(retained(db),before);assertNormalMediaSchema(db);
});

test('migration rolls back both new tables, generation and user_version after a post-DDL qualification failure',t=>{
  const {db}=fixture(t),before=retained(db);let seen=false;
  const failing={exec:sql=>db.exec(sql),prepare(sql){if(sql==='PRAGMA table_xinfo(normal_media_assets)'){seen=true;throw new Error('synthetic qualification failure');}return db.prepare(sql);}};
  assert.throws(()=>installNormalMediaSchema(failing),/synthetic qualification failure/);assert.equal(seen,true);
  assert.deepEqual(retained(db),before);installNormalMediaSchema(db);assertNormalMediaSchema(db);
});

test('old or unknown version numbers are not repaired or promoted by the normal-media installer',t=>{
  const {db}=fixture(t);
  for(const version of [0,1,4,7,99]) {
    db.exec(`PRAGMA user_version=${version}`);const before=retained(db);
    assert.throws(()=>installNormalMediaSchema(db),rejected);assert.deepEqual(retained(db),before);
  }
  db.exec('PRAGMA user_version=5');assertProjectMediaSchema(db,5);installNormalMediaSchema(db);
});

test('the existing structural schema1/4 qualifiers remain available without admitting new normal-media tables',t=>{
  const {db}=fixture(t);db.exec('DROP TABLE image_media_assets; DROP TABLE image_media_blobs;');
  for(const version of [1,4]){db.exec(`PRAGMA user_version=${version}`);assertProjectMediaSchema(db,version);}
  const before=retained(db);assert.throws(()=>installNormalMediaSchema(db),rejected);assert.deepEqual(retained(db),before);
});

test('partial or renamed normal tables, unexpected schema objects and a prior schema5 generation are protected without repair',t=>{
  for(const setup of [db=>db.exec(NORMAL_MEDIA_SQL.split(';')[0]+';'),
    db=>db.exec('CREATE TABLE normal_media_assets(content_id TEXT PRIMARY KEY)'),
    db=>db.exec('CREATE TABLE unknown_normal_bytes(data BLOB)'),
    db=>db.prepare('INSERT INTO meta(key,value) VALUES (?,?)').run('reader_media_generation','9')]) {
    const {db}=fixture(t);setup(db);const before=retained(db);
    assert.throws(()=>installNormalMediaSchema(db),rejected);assert.deepEqual(retained(db),before);
  }
});

test('normal SQL, MIME literals, column types and source/creator/blob foreign keys must remain exact',t=>{
  const mutations=[sql=>sql.replace('width*height<=40000000','width*height<=40000001'),
    sql=>sql.replace('bytes<=52428800','bytes<=52428801'),sql=>sql.replace("'image/jpeg'","'IMAGE/JPEG'"),
    sql=>sql.replace("'image/jpeg'","'image/ jpeg'"),sql=>sql.replace('width INTEGER','width REAL'),
    sql=>sql.replace(' REFERENCES versions(revision)',''),sql=>sql.replace(' REFERENCES users(id)',''),
    sql=>sql.replace(' REFERENCES normal_media_blobs(sha256)',''),sql=>sql.replace('source_revision TEXT NOT NULL','source_revision TEXT'),
    sql=>sql.replace('length(data)=bytes','length(data)>=bytes')];
  for(const change of mutations) {
    const {db}=fixture(t);installNormalMediaSchema(db);changeNormalSql(db,change);const before=retained(db);
    assert.throws(()=>assertNormalMediaSchema(db),rejected);assert.throws(()=>installNormalMediaSchema(db),rejected);
    assert.deepEqual(retained(db),before);
  }
});

test('formatting and unquoted keyword case are harmless while hidden extra columns or unknown indexes are rejected',t=>{
  const {db}=fixture(t);installNormalMediaSchema(db);
  changeNormalSql(db,sql=>sql.replaceAll('CREATE TABLE','create table').replaceAll('\n','\n  '));assertNormalMediaSchema(db);
  db.exec('ALTER TABLE normal_media_assets ADD COLUMN covert TEXT');const changed=retained(db);
  assert.throws(()=>assertNormalMediaSchema(db),rejected);assert.deepEqual(retained(db),changed);
  const second=fixture(t).db;installNormalMediaSchema(second);second.exec('CREATE INDEX unknown_normal_index ON normal_media_assets(slot)');
  const indexed=retained(second);assert.throws(()=>assertNormalMediaSchema(second),rejected);assert.deepEqual(retained(second),indexed);
});

test('schema6 qualification retains every preexisting managed-image condition instead of accepting weakened image checks',t=>{
  const {db}=fixture(t);installNormalMediaSchema(db);
  const blobs=db.prepare("SELECT sql FROM sqlite_schema WHERE name='image_media_blobs'").get().sql,
    assets=db.prepare("SELECT sql FROM sqlite_schema WHERE name='image_media_assets'").get().sql;
  db.exec('DROP TABLE image_media_assets; DROP TABLE image_media_blobs;');
  db.exec(blobs.replace('CHECK(width*height<=40000000)','CHECK(width*height<=40000001)'));db.exec(assets);const before=retained(db);
  assert.throws(()=>assertProjectMediaSchema(db,6),rejected);assert.throws(()=>assertNormalMediaSchema(db),rejected);
  assert.deepEqual(retained(db),before);
});

test('reader generation must be present and canonical and is never silently reset by qualification',t=>{
  for(const value of [null,'','-1','01','1.0','NaN','9007199254740992']) {
    const {db}=fixture(t);installNormalMediaSchema(db);
    if(value===null)db.prepare("DELETE FROM meta WHERE key='reader_media_generation'").run();
    else db.prepare("UPDATE meta SET value=? WHERE key='reader_media_generation'").run(value);
    const before=retained(db);assert.throws(()=>assertNormalMediaSchema(db),rejected);
    assert.throws(()=>installNormalMediaSchema(db),rejected);assert.deepEqual(retained(db),before);
  }
});

test('SQLite normal-blob constraints enforce actual blob type/length, integral image dimensions, pixel bound and null MP3 dimensions',t=>{
  const {db}=fixture(t);installNormalMediaSchema(db);const value=normalRows(),invalid=[
    {bytes:0},{bytes:-1},{bytes:1.5},{bytes:52428801},{mime_type:'image/png'},{width:null},{height:null},{width:0},{height:0},
    {width:1.5},{height:1.5},{width:10000,height:4001},{data:'synthetic SQL storage bytes'},{data:Buffer.from('different length')},
    {sha256:'A'.repeat(64)},{mime_type:'audio/mpeg',width:3,height:null},
  ];
  for(const change of invalid)assert.throws(()=>insert(db,'normal_media_blobs',{...value.blob,...change}));
  assert.equal(db.prepare('SELECT count(*) AS n FROM normal_media_blobs').get().n,0);
  insert(db,'normal_media_blobs',value.blob);assertNormalMediaSchema(db);
  const sound=normalRows({slot:'sound.mp3',mimeType:'audio/mpeg'});sound.blob.data=Buffer.from('different synthetic audio bytes');
  sound.blob.bytes=sound.blob.data.length;sound.blob.sha256=digest(sound.blob.data);insert(db,'normal_media_blobs',sound.blob);
  assert.equal(db.prepare('SELECT count(*) AS n FROM normal_media_blobs').get().n,2);
});

test('SQLite normal-asset constraints retain old IDs and enforce slot/MIME, byte budgets, attribution, bound source revision and foreign keys',t=>{
  const {db}=fixture(t);installNormalMediaSchema(db);const value=normalRows();insert(db,'normal_media_blobs',value.blob);
  const invalid=[{content_id:'normal-'+ 'A'.repeat(64)},{content_id:'normal-'+ 'a'.repeat(63)},{project_id:'../other'},
    {species_id:'fixture--owl'},{source_id:'../portrait.webp'},{sha256:'A'.repeat(64)},{bytes:0},{bytes:1.5},{bytes:20971521},
    {slot:'portrait.webp'},{slot:'credits.json'},{mime_type:'image/png'},{attribution:'a'.repeat(8001)},
    {source_revision:null},{source_revision:'not-a-version'},{source_revision:'22222222-2222-4222-8222-222222222222'},
    {creator_id:'unknown-person'},{blob_sha256:'f'.repeat(64)}];
  for(const change of invalid)assert.throws(()=>insert(db,'normal_media_assets',{...value.asset,...change}));
  assert.equal(db.prepare('SELECT count(*) AS n FROM normal_media_assets').get().n,0);
  insert(db,'normal_media_assets',{...value.asset,blob_sha256:value.blob.sha256});
  const sound=normalRows({slot:'sound.mp3',mimeType:'audio/mpeg'});sound.asset.bytes=50*1024*1024;
  insert(db,'normal_media_assets',sound.asset);assert.throws(()=>insert(db,'normal_media_assets',{...sound.asset,content_id:'normal-'+ 'f'.repeat(64),bytes:50*1024*1024+1}));
  assert.equal(db.prepare('SELECT source_id FROM normal_media_assets WHERE content_id=?').get(value.asset.content_id).source_id,'original-normal:42');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('the schema6 image inspector leaves fixed normal image-UUID files and their exact public gallery aliases to the normal registry',t=>{
  const {db}=fixture(t);installNormalMediaSchema(db);
  const file={id:'image-22222222-2222-4222-8222-222222222222',sha256:'a'.repeat(64),bytes:42,mimeType:'image/webp',url:'https://example.org/portrait.webp'};
  const record=validateSpeciesRecord({type:'fn-species-record',schemaVersion:1,id:'fixture-owl',
    input:{german:'Schema-Testkauz',genus:'Strix',species:'fixture'},generated:{},taxonomyOverride:null,assessmentBinding:null,
    assets:{assetName:'Schema-Testkauz',files:{'portrait.webp':file},overrides:{},credits:null,portraitMetadata:null},
    editorial:{websiteUrl:null,sections:[],gallery:[{...file,alt:'Bestehende Aufnahme',caption:'Unveränderte Beschriftung',order:0}],generalSectionId:null,embeddedGeneralText:null}});
  db.prepare('UPDATE versions SET data=? WHERE revision=?').run(JSON.stringify(record),revision);
  assert.equal(db.prepare('SELECT count(*) AS n FROM image_media_assets WHERE id=?').get(file.id).n,0);
  inspectImageMediaContents(db,projectId);
  const changed=structuredClone(record);changed.editorial.gallery[0].sha256='b'.repeat(64);
  db.prepare('UPDATE versions SET data=? WHERE revision=?').run(JSON.stringify(changed),revision);
  assert.throws(()=>inspectImageMediaContents(db,projectId),error=>error.code==='invalid_image_media');
});
