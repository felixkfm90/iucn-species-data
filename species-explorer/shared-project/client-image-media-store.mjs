import { canonicalJson, digest } from "./security.mjs";
import { check } from "./errors.mjs";
import { CLIENT_IMAGE_LIMITS, clientImageBase, validateClientImageMetadata, verifyClientImageBytes, inspectClientImage, referencedClientImages } from "./client-image-media.mjs";
import { assertSharedMediaBudget } from './shared-media-budget.mjs';

export const CLIENT_IMAGE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS image_blobs(sha256 TEXT PRIMARY KEY,bytes INTEGER NOT NULL,data BLOB NOT NULL);
  CREATE TABLE IF NOT EXISTS image_media(binding_id TEXT NOT NULL REFERENCES bindings(id),id TEXT NOT NULL,
    metadata_json TEXT NOT NULL,blob_sha256 TEXT REFERENCES image_blobs(sha256),uploaded INTEGER NOT NULL DEFAULT 0,receipt_json TEXT,
    PRIMARY KEY(binding_id,id));
`;
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const IMAGE_JSON_MAX_BYTES = 64 * 1024;
function imageJsonFields(alias = "") {
  return ["metadata_json", "receipt_json"].map((name) => {
    const column = `${alias ? alias + "." : ""}${name}`, text = `typeof(${column})='text' AND length(CAST(${column} AS BLOB))<=${IMAGE_JSON_MAX_BYTES}`;
    const valid = name === "receipt_json" ? `${column} IS NULL OR (${text})` : text;
    return `CASE WHEN ${text} THEN ${column} ELSE NULL END AS ${name},(${valid}) AS ${name}_valid`;
  }).join(",");
}
function checkedImageRow(row) {
  if (row) check(row.metadata_json_valid === 1 && row.receipt_json_valid === 1,
    409, "invalid_image_media", "Bildmetadaten und Serverbelege müssen begrenzte JSON-Textwerte bis 64 KiB sein.");
  return row;
}
function blobBudget(db, limit = CLIENT_IMAGE_LIMITS.blobBytes) {
  check(Number.isSafeInteger(limit) && limit >= 0 && limit <= CLIENT_IMAGE_LIMITS.blobBytes,
    400, "invalid_image_media", "Die persönliche Bildreserve darf nicht vergrößert werden.");
  const row = db.prepare(`SELECT COALESCE(sum(bytes),0) AS bytes,COALESCE(sum(length(data)),0) AS actual_bytes,
    COALESCE(sum(CASE WHEN typeof(sha256)<>'text' OR length(sha256)<>64 OR sha256 GLOB '*[^0-9a-f]*'
      OR typeof(bytes)<>'integer' OR bytes<=0 OR bytes>20971520 OR typeof(data)<>'blob' OR length(data)<>bytes THEN 1 ELSE 0 END),0) AS invalid
    FROM image_blobs`).get();
  check(row.invalid === 0 && Number.isSafeInteger(row.bytes) && row.bytes >= 0 && row.bytes === row.actual_bytes,
    409, "image_media_changed", "Ein persönliches Bild besitzt keinen begrenzten gültigen Bytebeleg.");
  check(row.bytes <= limit, 413, "image_media_quota", "Die persönliche Bildreserve wurde überschritten."); return row.bytes;
}
function readBlob(db, hash, expectedBytes) {
  check(Number.isSafeInteger(expectedBytes) && expectedBytes > 0 && expectedBytes <= CLIENT_IMAGE_LIMITS.imageBytes,
    409, "image_media_changed", "Die persönliche Bildgröße ist nicht sicher gebunden.");
  const row = db.prepare("SELECT bytes,length(data) AS actual_bytes,typeof(data) AS kind FROM image_blobs WHERE sha256=?").get(hash);
  check(row && row.bytes === expectedBytes && row.actual_bytes === expectedBytes && row.kind === "blob",
    409, "image_media_changed", "Die persönliche Bilddatei fehlt oder stimmt nicht mit ihrer begrenzten Größenbindung überein.");
  // Repeat the byte predicate in the actual SELECT so a second writer cannot enlarge the BLOB between reads.
  const blob = db.prepare("SELECT data FROM image_blobs WHERE sha256=? AND bytes=? AND typeof(data)='blob' AND length(data)=?").get(hash, expectedBytes, expectedBytes);
  check(blob, 409, "image_media_changed", "Die persönliche Bilddatei wurde zwischen den Leseprüfungen geändert.");
  const bytes = Buffer.from(blob.data);
  check(bytes.length === expectedBytes && digest(bytes) === hash, 409, "image_media_changed", "Die persönliche Bilddatei stimmt nicht mit ihrem Hash überein."); return bytes;
}
function assertReceipt(row, metadata, bound) {
  check([0, 1].includes(row.uploaded), 409, "image_media_changed", "Der persönliche Übertragungsstand eines Bildes ist ungültig.");
  if (row.uploaded === 0) {
    check(row.receipt_json === null, 409, "image_media_changed", "Ein unübertragenes Bild besitzt einen widersprüchlichen Serverbeleg."); return;
  }
  const receipt = JSON.parse(row.receipt_json || "null");
  check(receipt && ["admin", "publisher", "contributor", "reader"].includes(receipt.role)
    && same(receipt, { schemaVersion: 1, baseUrl: bound.baseUrl, projectId: bound.projectId, userId: bound.userId, role: receipt.role,
      id: metadata.id, metadataSha256: digest(canonicalJson(metadata)), complete: true }),
  409, "image_media_changed", "Der dauerhafte Serverbeleg eines Bildes ist nicht vollständig gebunden.");
}
export function createClientImageStore({ db, tx, binding, open, limits = CLIENT_IMAGE_LIMITS } = {}) {
  check(Number.isSafeInteger(limits.blobBytes) && limits.blobBytes >= 0 && limits.blobBytes <= CLIENT_IMAGE_LIMITS.blobBytes
    && Number.isSafeInteger(limits.cacheBytes) && limits.cacheBytes > 0 && limits.cacheBytes <= CLIENT_IMAGE_LIMITS.cacheBytes,
  400, "invalid_image_media", "Die persönliche Bildreserve darf nicht über den bestätigten Sicherungsrahmen angehoben werden.");
  function owner(bindingId) { const found = binding(bindingId); check(found, 401, "authentication_required", "Die persönliche Bildbindung fehlt."); return found; }
  function budget() {
    open();const shared=assertSharedMediaBudget(db,{limits});
    return {...shared,imageLimitBytes:limits.blobBytes,remainingImageBytes:shared.remainingMediaBytes};
  }
  function get(bindingId, id) {
    open(); owner(bindingId);
    const row = checkedImageRow(db.prepare(`SELECT ${imageJsonFields()},blob_sha256,uploaded FROM image_media WHERE binding_id=? AND id=?`).get(bindingId, id));
    if (!row) return null;
    const metadata = validateClientImageMetadata(JSON.parse(row.metadata_json), { projectId: owner(bindingId).projectId });
    assertReceipt(row, metadata, owner(bindingId));
    assertSharedMediaBudget(db,{limits});
    check(row.blob_sha256 === null || row.blob_sha256 === metadata.sha256, 409, "image_media_changed", "Die persönliche Bildkennung besitzt eine andere Bytebindung.");
    const buffer = row.blob_sha256 ? readBlob(db, row.blob_sha256, metadata.bytes) : null;
    if (buffer) verifyClientImageBytes(metadata, buffer);
    return { metadata, uploaded: row.uploaded === 1, buffer };
  }
  function save(bindingId, raw, buffer, { uploaded = false } = {}) {
    return tx(() => {
      const metadata = validateClientImageMetadata(raw, { projectId: owner(bindingId).projectId });
      if (buffer) verifyClientImageBytes(metadata, buffer);
      check(buffer || uploaded, 409, "image_media_missing", "Eine neue Bildbindung benötigt Bytes oder einen bestätigten Serverbeleg.");
      const previous = get(bindingId, metadata.id);
      check(!previous || same(previous.metadata, metadata), 409, "image_media_changed", "Die vorhandene Bildkennung besitzt einen anderen unveränderlichen Quellenbeleg.");
      const blob = db.prepare("SELECT bytes FROM image_blobs WHERE sha256=?").get(metadata.sha256), additional = buffer && !blob ? metadata.bytes : 0;
      const current = budget();
      check(current.mediaBytes + additional <= limits.blobBytes
        && current.cacheBytes + additional + CLIENT_IMAGE_LIMITS.metadataReserve <= limits.cacheBytes,
      413, "image_media_quota", "Die persönliche Bildreserve ist ausgeschöpft. Es wurde kein vorhandenes Bild gelöscht.");
      if (buffer && !blob) db.prepare("INSERT INTO image_blobs VALUES (?,?,?)").run(metadata.sha256, metadata.bytes, buffer);
      const blobHash = buffer ? metadata.sha256 : previous?.buffer ? previous.metadata.sha256 : null;
      const bound = owner(bindingId), receipt = uploaded ? canonicalJson({ schemaVersion: 1, baseUrl: bound.baseUrl, projectId: bound.projectId,
        userId: bound.userId, role: bound.user.role, id: metadata.id, metadataSha256: digest(canonicalJson(metadata)), complete: true }) : null;
      db.prepare(`INSERT INTO image_media VALUES (?,?,?,?,?,?) ON CONFLICT(binding_id,id) DO UPDATE SET
        blob_sha256=COALESCE(excluded.blob_sha256,image_media.blob_sha256),uploaded=MAX(image_media.uploaded,excluded.uploaded),
        receipt_json=COALESCE(excluded.receipt_json,image_media.receipt_json)`).run(
        bindingId, metadata.id, canonicalJson(metadata), blobHash, Number(uploaded), receipt);
      check(budget().cacheBytes <= limits.cacheBytes, 413, "image_media_quota", "Die Bilddatei überschreitet die persönliche Sicherungsreserve.");
      return metadata;
    });
  }
  return Object.freeze({ budget, get, save,
    assertReadable(bindingId, id) {
      const local = get(bindingId, id);
      check(local, 404, "image_media_unknown", "Dieses Bild ist für die aktuelle persönliche Projektbindung noch nicht bekannt.");
      let readable = false;
      for (const row of db.prepare("SELECT server_json FROM cache WHERE binding_id=? AND visible=1").iterate(bindingId)) {
        const value = JSON.parse(row.server_json);
        if (value.approval !== "approved" || value.approvedRevision !== value.revision) continue;
        const data = value.data, candidates = [...referencedClientImages(data), ...Object.values(data.assets?.files || {}),
          ...(data.editorial?.gallery || []), ...Object.values(data.media || {}).flatMap((entry) => Array.isArray(entry) ? entry : entry ? [entry] : [])];
        if (candidates.some((entry) => entry.id === id && entry.sha256 === local.metadata.sha256
          && entry.bytes === local.metadata.bytes && entry.mimeType === local.metadata.mimeType)) { readable = true; break; }
      }
      check(readable, 403, "forbidden", "Diese Bildfassung ist in der geladenen Leseansicht noch nicht intern freigegeben. Lokale Bilddateien und Entwürfe bleiben erhalten.");
    },
    admissionBytes(metadata, { buffer = false } = {}) {
      open(); return CLIENT_IMAGE_LIMITS.metadataReserve + (buffer && !db.prepare("SELECT 1 FROM image_blobs WHERE sha256=?").get(metadata.sha256) ? metadata.bytes : 0);
    },
    describe(bindingId, id) {
      const bound = owner(bindingId), row = checkedImageRow(db.prepare(`SELECT ${imageJsonFields()},blob_sha256,uploaded FROM image_media WHERE binding_id=? AND id=?`).get(bindingId, id));
      check(row, 404, "image_media_unknown", "Dieses Bild ist für die aktuelle persönliche Projektbindung noch nicht bekannt.");
      const metadata = validateClientImageMetadata(JSON.parse(row.metadata_json), { projectId: bound.projectId }); assertReceipt(row, metadata, bound);
      return { ...metadata, localAvailable: row.blob_sha256 !== null,
        remoteBacked: row.uploaded === 1, complete: row.blob_sha256 !== null || row.uploaded === 1 };
    },
    rememberRemote: (bindingId, metadata) => save(bindingId, metadata, null, { uploaded: true }),
    markUploaded(bindingId, metadata) { return save(bindingId, metadata, null, { uploaded: true }); },
  });
}

/** Exact schema/content validation for personal snapshots; no network or authentication material. */
export async function inspectClientImageStore(db, { progress = () => {}, limits = CLIENT_IMAGE_LIMITS } = {}) {
  assertSharedMediaBudget(db,{limits});
  check(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE tbl_name IN ('image_blobs','image_media') AND type NOT IN ('table','index')").get().n === 0,
    409, "invalid_image_media", "Die persönliche Bildablage enthält unbekannte ausführbare Schemaelemente.");
  for (const [table, columns] of [["image_blobs", ["sha256", "bytes", "data"]], ["image_media", ["binding_id", "id", "metadata_json", "blob_sha256", "uploaded", "receipt_json"]]]) {
    check(same(db.prepare(`PRAGMA table_info(${table})`).all().map((entry) => entry.name), columns), 409, "invalid_image_media", "Unbekanntes persönliches Bildcacheformat.");
    const indices = db.prepare(`PRAGMA index_list(${table})`).all();
    check(indices.length === 1 && indices[0].origin === "pk" && indices[0].unique === 1,
      409, "invalid_image_media", "Die eindeutige persönliche Bildbindung ist nicht vollständig erhalten.");
  }
  const links = db.prepare("PRAGMA foreign_key_list(image_media)").all();
  check(links.length === 2 && links.some((entry) => entry.table === "bindings" && entry.from === "binding_id" && entry.to === "id")
    && links.some((entry) => entry.table === "image_blobs" && entry.from === "blob_sha256" && entry.to === "sha256"),
  409, "invalid_image_media", "Die persönlichen Bildbezüge sind unvollständig.");
  const totalBytes = blobBudget(db, limits.blobBytes), blobs = new Map(); let localImageBytes = 0;
  for (const row of db.prepare("SELECT sha256,bytes FROM image_blobs").iterate()) {
    progress();
    const source = checkedImageRow(db.prepare(`SELECT ${imageJsonFields()} FROM image_media WHERE blob_sha256=? LIMIT 1`).get(row.sha256));
    check(source, 409, "image_media_changed", "Persönliche Bildbytes besitzen keinen vollständigen Quellenbeleg.");
    const metadata = validateClientImageMetadata(JSON.parse(source.metadata_json)), bytes = readBlob(db, row.sha256, row.bytes); verifyClientImageBytes(metadata, bytes);
    await inspectClientImage(bytes, { attribution: metadata.attribution, projectId: metadata.projectId, id: metadata.id });
    progress(); localImageBytes += row.bytes; blobs.set(row.sha256, metadata);
  }
  check(totalBytes === localImageBytes && blobBudget(db, limits.blobBytes) === localImageBytes,
    409, "image_media_changed", "Die persönliche Bildreserve wurde während der Prüfung geändert.");
  const references = new Map(), remoteBacked = [];
  for (const row of db.prepare(`SELECT m.binding_id,m.id,${imageJsonFields("m")},m.blob_sha256,m.uploaded,b.project_id,b.base_url,b.user_id
    FROM image_media m JOIN bindings b ON b.id=m.binding_id ORDER BY m.binding_id,m.id`).iterate()) {
    checkedImageRow(row);
    const metadata = validateClientImageMetadata(JSON.parse(row.metadata_json), { projectId: row.project_id });
    check(metadata.id === row.id && [0, 1].includes(row.uploaded) && (row.blob_sha256 !== null || row.uploaded === 1),
      409, "invalid_image_media", "Ein persönlicher Bildquellenbeleg ist unvollständig.");
    assertReceipt(row, metadata, { baseUrl: row.base_url, projectId: row.project_id, userId: row.user_id });
    if (row.blob_sha256 !== null) {
      check(row.blob_sha256 === metadata.sha256 && blobs.has(row.blob_sha256), 409, "image_media_changed", "Die persönliche Bilddatei fehlt.");
      const actual = blobs.get(row.blob_sha256);
      check(metadata.bytes === actual.bytes && metadata.mimeType === actual.mimeType && metadata.width === actual.width && metadata.height === actual.height,
        409, "image_media_changed", "Deduplizierte Bildbytes besitzen widersprüchliche Formatbelege.");
    } else remoteBacked.push({ bindingId: row.binding_id, ...clientImageBase(metadata), localBytesIncluded: false, requiredServerMedia: true });
    references.set(`${row.binding_id}/${row.id}`, metadata);
  }
  for (const row of db.prepare("SELECT binding_id,data_json FROM queue WHERE state IN ('queued','uncertain','conflict')").iterate()) {
    for (const reference of referencedClientImages(JSON.parse(row.data_json))) {
      const stored = references.get(`${row.binding_id}/${reference.id}`);
      check(stored && same(clientImageBase(stored), reference), 409, "image_media_missing", "Ein offener Seitenentwurf besitzt keinen vollständigen lokalen oder serverbestätigten Bildbeleg.");
    }
  }
  return { localImageBytes, localBlobCount: blobs.size, remoteBacked };
}
