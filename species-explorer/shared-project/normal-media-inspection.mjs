import { check } from "./errors.mjs";
import { digest } from "./security.mjs";
import { normalMediaBinding, NORMAL_MEDIA_LIMITS } from "./normal-media.mjs";
import { assertNormalMediaSchema } from "./normal-media-schema.mjs";
import { inspectJpeg, inspectWebp } from "../../scripts/image-header.mjs";
import { inspectCompleteMp3Buffer } from "../../scripts/audio-format.mjs";

/** Read-only snapshot proof. Decode receipts are retained; originals are never rewritten. */
export function inspectNormalMediaContents(db, projectId) {
  assertNormalMediaSchema(db);
  for (const row of db.prepare("SELECT sha256,bytes,mime_type,width,height,length(data) AS stored_bytes,typeof(data) AS stored_type FROM normal_media_blobs").iterate()) {
    const sound = row.mime_type === "audio/mpeg";
    check(/^[a-f0-9]{64}$/.test(row.sha256) && Number.isSafeInteger(row.bytes) && row.bytes > 0
      && row.bytes <= (sound ? NORMAL_MEDIA_LIMITS.soundBytes : NORMAL_MEDIA_LIMITS.imageBytes)
      && row.stored_type === "blob" && row.stored_bytes === row.bytes,
    409, "invalid_normal_media", "Eine gespeicherte Artdatei besitzt keine gültige begrenzte Bytebindung.");
    const bytes = Buffer.from(db.prepare("SELECT data FROM normal_media_blobs WHERE sha256=?").get(row.sha256).data);
    check(digest(bytes) === row.sha256, 409, "invalid_normal_media", "Die gespeicherten Artdateibytes stimmen nicht mit ihrem Hash überein.");
    if (sound) {
      check(row.width === null && row.height === null, 409, "invalid_normal_media", "Eine Tondatei darf keine Bilddimensionen behaupten.");
      try { inspectCompleteMp3Buffer(bytes); }
      catch { check(false, 409, "invalid_normal_media", "Die gespeicherte MP3-Datei besitzt keine vollständige belegte Framefolge."); }
    } else {
      const inspect = { "image/jpeg": inspectJpeg, "image/webp": inspectWebp }[row.mime_type];
      const header = inspect ? inspect(bytes) : null;
      check(header?.valid && header.width === row.width && header.height === row.height
        && row.width * row.height <= NORMAL_MEDIA_LIMITS.imagePixels,
      409, "invalid_normal_media", "Die Bilddimensionen der gespeicherten Artdatei passen nicht zu ihren tatsächlichen Bytes.");
    }
  }
  for (const row of db.prepare(`SELECT a.*,v.kind AS version_kind,v.id AS version_id,v.data AS version_data,
    b.bytes AS blob_bytes,b.mime_type AS blob_mime FROM normal_media_assets a
    LEFT JOIN versions v ON v.revision=a.source_revision LEFT JOIN normal_media_blobs b ON b.sha256=a.blob_sha256`).iterate()) {
    check(row.project_id === projectId && row.version_kind === "species" && row.version_id === row.species_id,
      409, "invalid_normal_media", "Der gespeicherte Artdateibeleg gehört nicht zu seiner tatsächlichen Artfassung.");
    const expected = normalMediaBinding(JSON.parse(row.version_data), { projectId, slot: row.slot });
    check(expected && expected.contentId === row.content_id && expected.speciesId === row.species_id
      && expected.asset.id === row.source_id && expected.asset.sha256 === row.sha256 && expected.asset.bytes === row.bytes
      && expected.asset.mimeType === row.mime_type && expected.asset.attribution === row.attribution
      && (row.blob_sha256 === null || row.blob_sha256 === row.sha256 && row.blob_bytes === row.bytes && row.blob_mime === row.mime_type),
    409, "invalid_normal_media", "Der unveränderliche Artdateibeleg stimmt nicht mit seiner Quelle oder den bereitgestellten Bytes überein.");
  }
}
