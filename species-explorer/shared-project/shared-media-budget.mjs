import { check } from './errors.mjs';

export const SHARED_MEDIA_LIMITS=Object.freeze({blobBytes:192*1024*1024,cacheBytes:384*1024*1024,
  backupBytes:512*1024*1024,profileBytes:1024*1024*1024,metadataReserve:64*1024});
export function sharedMediaLimits(input={}) {
  const result={...SHARED_MEDIA_LIMITS,...input};
  for(const [key,maximum] of Object.entries(SHARED_MEDIA_LIMITS))check(Number.isSafeInteger(result[key])
    && result[key]>=(key==='blobBytes'?0:1)&&result[key]<=maximum,400,'invalid_image_media','Die persönliche Medienreserve darf nur verkleinert werden.');
  return result;
}
/** Count physical bytes in every personal media pool before returning any BLOB to Node. */
export function assertSharedMediaBudget(db,{limits={},quotaCode='image_media_quota',invalidCode='image_media_changed'}={}) {
  const checked=sharedMediaLimits(limits),totals={imageBytes:0,normalBytes:0,enrichmentBytes:0};
  for(const [table,key,maximum,extra] of [
    ['image_blobs','imageBytes',20971520,'0'],
    ['normal_blobs','normalBytes',52428800,`typeof(mime_type)<>'text' OR mime_type NOT IN ('image/jpeg','image/webp','audio/mpeg')
      OR (mime_type='audio/mpeg' AND (width IS NOT NULL OR height IS NOT NULL))
      OR (mime_type<>'audio/mpeg' AND (bytes>20971520 OR typeof(width)<>'integer' OR typeof(height)<>'integer'
        OR width<=0 OR height<=0 OR width*height>40000000))`],
    ['enrichment_files','enrichmentBytes',52428800,`CASE slot
      WHEN 'sound.mp3' THEN mime_type<>'audio/mpeg'
      WHEN 'map.jpg' THEN mime_type<>'image/jpeg' OR bytes>20971520
      WHEN 'portrait.webp' THEN mime_type<>'image/webp' OR bytes>20971520
      WHEN 'spectrogram.webp' THEN mime_type<>'image/webp' OR bytes>20971520
      WHEN 'credits.json' THEN mime_type<>'application/json' OR bytes>262144
      ELSE 1 END`],
  ]) {
    if(!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(table))continue;
    const row=db.prepare(`SELECT COALESCE(sum(bytes),0) AS bytes,COALESCE(sum(length(data)),0) AS actual,
      COALESCE(sum(CASE WHEN typeof(sha256)<>'text' OR length(sha256)<>64 OR sha256 GLOB '*[^0-9a-f]*'
        OR typeof(bytes)<>'integer' OR bytes<=0 OR bytes>${maximum} OR typeof(data)<>'blob' OR length(data)<>bytes
        OR (${extra}) THEN 1 ELSE 0 END),0) AS invalid FROM ${table}`).get();
    check(row.invalid===0&&Number.isSafeInteger(row.bytes)&&row.bytes>=0&&row.bytes===row.actual,
      409,invalidCode,'Eine persönliche Mediendatei besitzt keinen begrenzten gültigen Bytebeleg.');totals[key]=row.bytes;
  }
  const mediaBytes=totals.imageBytes+totals.normalBytes+totals.enrichmentBytes,cacheBytes=db.prepare('PRAGMA page_count').get().page_count*db.prepare('PRAGMA page_size').get().page_size;
  check(Number.isSafeInteger(mediaBytes)&&mediaBytes<=checked.blobBytes,413,quotaCode,'Die gemeinsame persönliche Medienreserve ist ausgeschöpft. Vorhandene Dateien bleiben erhalten.');
  return {...totals,mediaBytes,mediaLimitBytes:checked.blobBytes,cacheBytes,cacheAdmissionLimitBytes:checked.cacheBytes,
    cacheBackupLimitBytes:checked.backupBytes,cacheReserveBytes:checked.backupBytes-checked.cacheBytes,
    remainingMediaBytes:Math.max(0,checked.blobBytes-mediaBytes),remainingCacheBytes:Math.max(0,checked.cacheBytes-cacheBytes)};
}
