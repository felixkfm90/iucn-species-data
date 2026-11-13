import { check } from './errors.mjs';
import { NORMAL_MEDIA_SCHEMA_COLUMNS } from './normal-media.mjs';
import { assertProjectMediaSchema } from './image-media.mjs';

const unsupported=message=>check(false,409,'unsupported_schema',message);
const hash=name=>`typeof(${name})='text' AND length(${name})=64 AND ${name} NOT GLOB '*[^a-f0-9]*'`;
const identifier=name=>`typeof(${name})='text' AND length(${name}) BETWEEN 1 AND 160 AND substr(${name},1,1) GLOB '[A-Za-z0-9]' AND ${name} NOT GLOB '*[^A-Za-z0-9._:-]*'`;
const enrichmentFormat = 'species_enrichment_format';

// This is only the durable SQL contract. The store checks actual SHA-256,
// canonical contentId, decoded bytes and the protected species-version binding.
export const NORMAL_MEDIA_SQL=`
  CREATE TABLE normal_media_blobs(sha256 TEXT PRIMARY KEY NOT NULL CHECK(${hash('sha256')}),
    bytes INTEGER NOT NULL CHECK(typeof(bytes)='integer' AND bytes>0 AND bytes<=52428800),
    mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/webp','audio/mpeg')),
    width INTEGER,height INTEGER,data BLOB NOT NULL,
    CHECK(typeof(data)='blob' AND length(data)=bytes),
    CHECK((mime_type='audio/mpeg' AND width IS NULL AND height IS NULL)
      OR (mime_type IN ('image/jpeg','image/webp') AND bytes<=20971520
        AND typeof(width)='integer' AND typeof(height)='integer' AND width>0 AND height>0
        AND width<=40000000 AND height<=40000000 AND width*height<=40000000)));
  CREATE TABLE normal_media_assets(content_id TEXT PRIMARY KEY NOT NULL
      CHECK(typeof(content_id)='text' AND length(content_id)=71 AND substr(content_id,1,7)='normal-'
        AND substr(content_id,8) NOT GLOB '*[^a-f0-9]*'),
    project_id TEXT NOT NULL CHECK(${identifier('project_id')}),
    species_id TEXT NOT NULL CHECK(typeof(species_id)='text' AND length(species_id) BETWEEN 1 AND 120
      AND species_id NOT GLOB '*[^a-z0-9-]*' AND substr(species_id,1,1) GLOB '[a-z0-9]'
      AND substr(species_id,-1,1) GLOB '[a-z0-9]' AND instr(species_id,'--')=0),
    slot TEXT NOT NULL CHECK(slot IN ('portrait.webp','map.jpg','sound.mp3','spectrogram.webp')),
    source_id TEXT NOT NULL CHECK(${identifier('source_id')}),
    sha256 TEXT NOT NULL CHECK(${hash('sha256')}),
    bytes INTEGER NOT NULL CHECK(typeof(bytes)='integer' AND bytes>0 AND bytes<=52428800),
    mime_type TEXT NOT NULL,
    attribution TEXT NOT NULL CHECK(typeof(attribution)='text' AND length(attribution)<=8000 AND instr(attribution,char(0))=0),
    source_revision TEXT NOT NULL REFERENCES versions(revision)
      CHECK(typeof(source_revision)='text' AND length(source_revision)=36 AND length(replace(source_revision,'-',''))=32
        AND source_revision NOT GLOB '*[^a-f0-9-]*'
        AND substr(source_revision,9,1)='-' AND substr(source_revision,14,1)='-'
        AND substr(source_revision,19,1)='-' AND substr(source_revision,24,1)='-'
        AND substr(source_revision,15,1) GLOB '[1-8]' AND substr(source_revision,20,1) GLOB '[89ab]'),
    creator_id TEXT NOT NULL REFERENCES users(id) CHECK(${identifier('creator_id')}),
    created_at TEXT NOT NULL CHECK(typeof(created_at)='text' AND length(created_at) BETWEEN 1 AND 100),
    blob_sha256 TEXT REFERENCES normal_media_blobs(sha256),
    CHECK(blob_sha256 IS NULL OR (typeof(blob_sha256)='text' AND blob_sha256=sha256)),
    CHECK((slot='portrait.webp' AND mime_type='image/webp' AND bytes<=20971520)
      OR (slot='map.jpg' AND mime_type='image/jpeg' AND bytes<=20971520)
      OR (slot='sound.mp3' AND mime_type='audio/mpeg')
      OR (slot='spectrogram.webp' AND mime_type='image/webp' AND bytes<=20971520)));
`;

// Keep literal spelling and whitespace exact inside quotes. SQL formatting and
// unquoted keyword case may differ; a different CHECK/FK is never repaired.
function compactSql(sql) {
  let result='',quote=null;
  for(let index=0;index<sql.length;index++) {
    const character=sql[index];
    if(quote) {
      result+=character;
      if(character===quote){if(sql[index+1]===quote)result+=sql[++index];else quote=null;}
    }else if(["'",'"','`'].includes(character)){quote=character;result+=character;}
    else if(character==='['){quote=']';result+=character;}
    else if(!/\s/u.test(character))result+=character.toLowerCase();
  }
  return result;
}

/** Full media qualification, including the enrichment compatibility boundary. */
export function assertNormalMediaSchema(db) {
  const version = db.prepare('PRAGMA user_version').get().user_version;
  check([6, 7].includes(version),409,'unsupported_schema','Die normale Medienablage benötigt Projektschema 6 oder 7.');
  assertProjectMediaSchema(db,version);
  const marker = db.prepare('SELECT value FROM meta WHERE key=?').get(enrichmentFormat)?.value;
  check(version === 7 ? marker === '1' : marker === undefined, 409, 'unsupported_schema', 'Die gespeicherte Artvorschlagsgrenze passt nicht zur Projektversion.');
  for(const statement of NORMAL_MEDIA_SQL.split(';').map(value=>value.trim()).filter(Boolean)) {
    const name=/^CREATE TABLE (\w+)/.exec(statement)[1],actual=db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").get(name)?.sql;
    check(typeof actual==='string' && compactSql(actual)===compactSql(statement),409,'unsupported_schema',
      'Die normalen Medienbedingungen entsprechen keinem exakt unterstützten Format.');
  }
  for(const [table,types,nullable] of [
    ['normal_media_blobs',['TEXT','INTEGER','TEXT','INTEGER','INTEGER','BLOB'],[3,4]],
    ['normal_media_assets',['TEXT','TEXT','TEXT','TEXT','TEXT','TEXT','INTEGER','TEXT','TEXT','TEXT','TEXT','TEXT','TEXT'],[12]],
  ]) {
    const columns=db.prepare(`PRAGMA table_xinfo(${table})`).all();
    check(columns.map(column=>column.name).join(',')===NORMAL_MEDIA_SCHEMA_COLUMNS[table]
      && columns.every((column,index)=>column.type===types[index] && column.pk===(index===0?1:0)
        && column.notnull===(nullable.includes(index)?0:1) && column.hidden===0 && column.dflt_value===null),
      409,'unsupported_schema','Die normalen Medienspaltentypen sind nicht exakt qualifiziert.');
  }
  const refs=db.prepare('PRAGMA foreign_key_list(normal_media_assets)').all()
    .map(row=>`${row.from}:${row.table}:${row.to}:${row.on_update}:${row.on_delete}:${row.match}`).sort();
  check(JSON.stringify(refs)===JSON.stringify(['blob_sha256:normal_media_blobs:sha256:NO ACTION:NO ACTION:NONE',
    'creator_id:users:id:NO ACTION:NO ACTION:NONE','source_revision:versions:revision:NO ACTION:NO ACTION:NONE']),
    409,'unsupported_schema','Die normalen Medienbezüge sind nicht exakt an Quelle, Person und Bytes gebunden.');
  check(db.prepare('PRAGMA foreign_key_list(normal_media_blobs)').all().length===0,
    409,'unsupported_schema','Unbekannte Normalmedien-Bytebezüge bleiben geschützt.');
  const generation=db.prepare("SELECT value FROM meta WHERE key='reader_media_generation'").get()?.value;
  check(typeof generation==='string' && /^(?:0|[1-9][0-9]*)$/.test(generation)
    && Number.isSafeInteger(Number(generation)),409,'unsupported_schema','Die Lesemedienrevision ist nicht vollständig qualifiziert.');
}

/** Advance only in the transaction that first accepts an enrichment draft. */
export function enableSpeciesEnrichmentSchema(db) {
  const version = db.prepare('PRAGMA user_version').get().user_version;
  check(db.isTransaction && [6, 7].includes(version), 409, 'unsupported_schema', 'Artvorschläge benötigen die gebundene Projekttransaktion.');
  if (version === 7) return;
  db.prepare('INSERT INTO meta(key,value) VALUES (?,?)').run(enrichmentFormat, '1');
  db.exec('PRAGMA user_version=7');
}

/** Additive, transactional 5 -> 6 migration; an already qualified 6 is unchanged. */
export function installNormalMediaSchema(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const version=db.prepare('PRAGMA user_version').get().user_version;
    if([6,7].includes(version))assertNormalMediaSchema(db);
    else {
      if(version!==5)unsupported('Nur ein frisch qualifiziertes Projektschema 5 darf die normale Medienablage erhalten.');
      assertProjectMediaSchema(db,5);
      check(!db.prepare("SELECT 1 FROM meta WHERE key='reader_media_generation'").get(),409,'unsupported_schema',
        'Eine unbekannte bereits vorhandene Lesemedienrevision bleibt unverändert geschützt.');
      db.exec(NORMAL_MEDIA_SQL);
      db.prepare('INSERT INTO meta(key,value) VALUES (?,?)').run('reader_media_generation','0');
      db.exec('PRAGMA user_version=6');assertNormalMediaSchema(db);
    }
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
}
