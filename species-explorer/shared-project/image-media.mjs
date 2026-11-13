import { check } from "./errors.mjs";
import { digest } from "./security.mjs";
import { inspectJpeg, inspectPng, inspectWebp } from "../../scripts/image-header.mjs";
import { NORMAL_MEDIA_SCHEMA_COLUMNS } from "./normal-media.mjs";
import { imageRegistryReferences } from "./media-reference-context.mjs";

export const IMAGE_MEDIA_MAX_BYTES = 20 * 1024 * 1024;
export const IMAGE_MEDIA_MAX_PIXELS = 40_000_000;
export const IMAGE_MEDIA_ID = /^image-[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const IMAGE_MEDIA_MIMES = Object.freeze({ "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" });
export const PROJECT_SCHEMA_COLUMNS = Object.freeze({
  meta: "key,value", users: "id,username,display_name,password_hash,role,blocked,version,created_at",
  devices: "id,user_id,token_hash,label,expires_at,revoked,created_at", sessions: "token_hash,user_id,device_id,scope,expires_at,created_at",
  login_attempts: "key,failures,started_at,blocked_until", objects: "kind,id,current_revision,approved_revision",
  versions: "kind,id,revision,ordinal,parent_revision,data,author_id,created_at",
  conflicts: "id,kind,object_id,author_id,base_revision,current_revision,base_data,current_data,proposed_data,created_at,resolved_at,resolved_by,resolution,resulting_revision",
  changes: "author_id,change_id,request_hash,result", audit: "sequence,actor_id,action,target,created_at",
  website_alt_receipts: "id,object_id,version_revision,body", page_authoring_receipts: "id,object_id,version_revision,body",
  image_media_blobs: "sha256,bytes,mime_type,width,height,data",
  image_media_assets: "id,project_id,sha256,bytes,mime_type,attribution,creator_id,created_at,blob_sha256",
});
const mediaSql = `
  CREATE TABLE image_media_blobs(sha256 TEXT PRIMARY KEY,bytes INTEGER NOT NULL CHECK(bytes>0 AND bytes<=20971520),
    mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
    width INTEGER NOT NULL CHECK(width>0),height INTEGER NOT NULL CHECK(height>0),data BLOB NOT NULL,
    CHECK(width*height<=40000000),CHECK(length(data)=bytes));
  CREATE TABLE image_media_assets(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,sha256 TEXT NOT NULL,
    bytes INTEGER NOT NULL CHECK(bytes>0 AND bytes<=20971520),mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
    attribution TEXT NOT NULL,creator_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,
    blob_sha256 TEXT REFERENCES image_media_blobs(sha256),CHECK(blob_sha256 IS NULL OR blob_sha256=sha256));
`;
function compactSql(sql) {
  let result = "", quote = null;
  for (let index = 0; index < sql.length; index++) {
    const character = sql[index];
    if (quote) {
      result += character;
      if (character === quote) {
        if (sql[index + 1] === quote) result += sql[++index];
        else quote = null;
      }
    } else if (character === "'" || character === '"' || character === "`") {
      quote = character; result += character;
    } else if (character === "[") {
      quote = "]"; result += character;
    } else if (!/\s/u.test(character)) result += character.toLowerCase();
  }
  return result;
}
const fields = (value, keys) => check(value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)),
400, "invalid_image_media", "Die Bilddateibindung ist unvollständig oder enthält unbekannte Felder.");
export function validateImageMediaId(id) { check(typeof id === "string" && IMAGE_MEDIA_ID.test(id), 400, "invalid_image_media", "Eine gültige Bildkennung ist erforderlich."); return id; }
export function validateImageMediaIntent(input) {
  fields(input, ["id", "sha256", "bytes", "mimeType", "attribution", "expectedBinding"]);
  validateImageMediaId(input.id);
  check(/^[a-f0-9]{64}$/.test(input.sha256) && Number.isSafeInteger(input.bytes) && input.bytes > 0 && input.bytes <= IMAGE_MEDIA_MAX_BYTES
    && Object.hasOwn(IMAGE_MEDIA_MIMES, input.mimeType) && typeof input.attribution === "string" && input.attribution.length <= 8000
    && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input.attribution), 400, "invalid_image_media", "Bildhash, Größe, Format oder Quellenangabe ist ungültig.");
  validateImageMediaBinding(input.expectedBinding);
  return input;
}
export function validateImageMediaBinding(binding) {
  fields(binding, ["projectId", "userId", "role"]);
  check([binding.projectId, binding.userId].every((value) => typeof value === "string" && value.length > 0 && value.length <= 160)
    && ["admin", "publisher", "contributor"].includes(binding.role), 409, "media_binding_changed", "Die Bildübernahme benötigt die geprüfte Projekt-, Personen- und Rollenbindung.");
  return binding;
}
export function projectImageMedia(row) {
  return { id: row.id, projectId: row.project_id, sha256: row.sha256, bytes: row.bytes, mimeType: row.mime_type,
    attribution: row.attribution, width: row.width ?? null, height: row.height ?? null, complete: row.blob_sha256 !== null };
}
export function imageMediaReferences(data) {
  if (data?.type === "fn-species-page") return [...Object.values(data.document?.species?.normalAssets || {}), ...(data.document?.images || []).map((image) => image.asset)].filter(Boolean);
  if (data?.type === "fn-species-record") return [...Object.values(data.assets?.files || {}),
    ...(data.schemaVersion === 2 ? [...(data.editorial?.gallery || []).map(usage => usage.asset), ...Object.values(data.editorial?.normalAssets || {})]
      : data.editorial?.gallery || [])].filter(Boolean);
  return data?.media ? [data.media.portrait, data.media.map, ...(data.media.sounds || []), ...(data.media.gallery || [])].filter(Boolean) : [];
}
export function imageMediaReferenceMatches(reference, asset) {
  return reference?.id === asset.id && reference.sha256 === asset.sha256 && reference.bytes === asset.bytes && reference.mimeType === asset.mimeType
    && (reference.projectId === undefined || reference.projectId === asset.projectId)
    && (reference.attribution === undefined || reference.attribution === asset.attribution);
}
export function assertProjectMediaSchema(db, version = 5) {
  check([1, 4, 5, 6, 7].includes(version), 409, "unsupported_schema", "Die Projektversion entspricht keinem unterstützten Format.");
  const columns = version >= 6 ? { ...PROJECT_SCHEMA_COLUMNS, ...NORMAL_MEDIA_SCHEMA_COLUMNS } : PROJECT_SCHEMA_COLUMNS;
  const names = Object.keys(columns).filter((name) => version >= 5 || !name.startsWith("image_media_"));
  const actual = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
  check(JSON.stringify(actual) === JSON.stringify(names.sort()), 409, "unsupported_schema", "Die Projekttabellen entsprechen keinem unterstützten Format.");
  for (const name of names) check(db.prepare(`PRAGMA table_xinfo(${name})`).all().map((column) => column.name).join(",") === columns[name],
    409, "unsupported_schema", "Die Projektspalten entsprechen keinem unterstützten Format.");
  const allowed = new Set(["versions_object", "website_alt_receipt_object", "page_authoring_receipt_object", "objects_insert_generation", "objects_update_generation"]);
  check(db.prepare("SELECT name FROM sqlite_schema WHERE type<>'table' AND name NOT LIKE 'sqlite_%'").all().every((row) => allowed.has(row.name)),
    409, "unsupported_schema", "Unbekannte Projekt-Schemaobjekte bleiben geschützt.");
  if (version < 5) return;
  for (const statement of mediaSql.split(";").map((sql) => sql.trim()).filter(Boolean)) {
    const name = /^CREATE TABLE (\w+)/.exec(statement)[1];
    check(compactSql(db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").get(name)?.sql || "") === compactSql(statement),
      409, "unsupported_schema", "Die Bildtabellenbedingungen entsprechen keinem exakt unterstützten Format.");
  }
  for (const [table, types, pks, nullable] of [
    ["image_media_blobs", ["TEXT", "INTEGER", "TEXT", "INTEGER", "INTEGER", "BLOB"], [1, 0, 0, 0, 0, 0], [0]],
    ["image_media_assets", ["TEXT", "TEXT", "TEXT", "INTEGER", "TEXT", "TEXT", "TEXT", "TEXT", "TEXT"], [1, 0, 0, 0, 0, 0, 0, 0, 0], [0, 8]],
  ]) {
    const columns = db.prepare(`PRAGMA table_xinfo(${table})`).all();
    check(columns.every((column, index) => column.type === types[index] && column.pk === pks[index] && column.notnull === (nullable.includes(index) ? 0 : 1)
      && column.hidden === 0 && column.dflt_value === null), 409, "unsupported_schema", "Die Bildtabellenspalten sind nicht exakt qualifiziert.");
  }
  const refs = db.prepare("PRAGMA foreign_key_list(image_media_assets)").all().map((row) => `${row.from}:${row.table}:${row.to}:${row.on_update}:${row.on_delete}`).sort();
  check(JSON.stringify(refs) === JSON.stringify(["blob_sha256:image_media_blobs:sha256:NO ACTION:NO ACTION", "creator_id:users:id:NO ACTION:NO ACTION"]),
    409, "unsupported_schema", "Die Bildbezüge entsprechen keinem unterstützten Format.");
  check(db.prepare("PRAGMA foreign_key_list(image_media_blobs)").all().length === 0,
    409, "unsupported_schema", "Unbekannte Bildbytebezüge bleiben geschützt.");
}
export function installImageMediaSchema(db) {
  db.exec("BEGIN IMMEDIATE");
  try { db.exec(mediaSql + "PRAGMA user_version=5;"); assertProjectMediaSchema(db); db.exec("COMMIT"); }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}
export function inspectImageMediaContents(db, projectId) {
  const version = db.prepare("PRAGMA user_version").get().user_version;
  check([5, 6, 7].includes(version), 409, "unsupported_schema", "Die Bildbyteprüfung benötigt Projektschema 5, 6 oder 7.");
  assertProjectMediaSchema(db, version);
  for (const row of db.prepare("SELECT sha256,bytes,mime_type,width,height,length(data) AS stored_bytes,typeof(data) AS stored_type FROM image_media_blobs").iterate()) {
    check(/^[a-f0-9]{64}$/.test(row.sha256) && Number.isSafeInteger(row.bytes) && row.bytes > 0 && row.bytes <= IMAGE_MEDIA_MAX_BYTES
      && row.bytes === row.stored_bytes && row.stored_type === "blob" && Object.hasOwn(IMAGE_MEDIA_MIMES, row.mime_type) && Number.isSafeInteger(row.width) && row.width > 0
      && Number.isSafeInteger(row.height) && row.height > 0 && row.width * row.height <= IMAGE_MEDIA_MAX_PIXELS,
    409, "invalid_image_media", "Ein gespeichertes Bild besitzt ungültige Größen-/Formatbelege.");
    const bytes = Buffer.from(db.prepare("SELECT data FROM image_media_blobs WHERE sha256=?").get(row.sha256).data);
    check(digest(bytes) === row.sha256,
      409, "invalid_image_media", "Gespeicherte Bildbytes stimmen nicht mit ihrem Hash überein.");
    const header = { "image/jpeg": inspectJpeg, "image/png": inspectPng, "image/webp": inspectWebp }[row.mime_type](bytes);
    check(header.valid && header.width === row.width && header.height === row.height, 409, "invalid_image_media", "Die gespeicherten Bilddimensionen stimmen nicht mit den tatsächlichen Bytes überein.");
  }
  for (const row of db.prepare("SELECT a.*,b.width,b.height,b.bytes AS blob_bytes,b.mime_type AS blob_mime FROM image_media_assets a LEFT JOIN image_media_blobs b ON b.sha256=a.blob_sha256").iterate()) {
    validateImageMediaIntent({ id: row.id, sha256: row.sha256, bytes: row.bytes, mimeType: row.mime_type, attribution: row.attribution,
      expectedBinding: { projectId, userId: row.creator_id, role: "admin" } });
    check(row.project_id === projectId && (row.blob_sha256 === null || row.blob_sha256 === row.sha256 && row.blob_bytes === row.bytes && row.blob_mime === row.mime_type),
      409, "invalid_image_media", "Eine Bildreferenz gehört nicht zu den gespeicherten Projektbytes.");
  }
  for (const query of ["SELECT data FROM versions", "SELECT base_data AS data FROM conflicts", "SELECT current_data AS data FROM conflicts", "SELECT proposed_data AS data FROM conflicts"]) {
    for (const { data } of db.prepare(query).iterate()) for (const ref of imageRegistryReferences(JSON.parse(data))) if (IMAGE_MEDIA_ID.test(ref.id || "")) {
      const row = db.prepare("SELECT a.*,b.width,b.height FROM image_media_assets a LEFT JOIN image_media_blobs b ON b.sha256=a.blob_sha256 WHERE a.id=?").get(ref.id);
      check(row?.blob_sha256 && imageMediaReferenceMatches(ref, projectImageMedia(row)), 409, "invalid_image_media", "Einer historischen Seitenfassung fehlen passende vollständige Bildbytes.");
    }
  }
}
