import { validateImageDecode } from "../../scripts/image-validation.mjs";
import { validateAudioDecode } from "../../scripts/audio-validation.mjs";
import { inspectCompleteMp3Buffer } from "../../scripts/audio-format.mjs";
import { inspectJpeg, inspectWebp } from "../../scripts/image-header.mjs";
import { isProxy } from "node:util/types";
import { check, ProjectError } from "./errors.mjs";
import { canonicalJson, digest } from "./security.mjs";
import { NORMAL_MEDIA_LIMITS, normalMediaBinding, normalMediaContentId, validateNormalMediaDeclaration } from "./normal-media.mjs";

const WRITERS = ["admin", "publisher", "contributor"];
const ROLES = { portrait: "portrait.webp", map: "map.jpg", sound: "sound.mp3", spectrogram: "spectrogram.webp" };
const CONTENT_ID = /^normal-[a-f0-9]{64}$/;
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const changed = condition => check(condition, 409, "normal_media_changed", "Die normale Artdatei oder ihre unveränderliche Quellenbindung wurde geändert.");
function bindingCopy(value) {
  check(value && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype
    && Reflect.ownKeys(value).length === 3 && Object.keys(value).sort().join(",") === "projectId,role,userId"
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(item => item.enumerable && Object.hasOwn(item, "value"))
    && [value.projectId, value.userId].every(item => typeof item === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(item))
    && WRITERS.includes(value.role), 409, "media_binding_changed", "Die Bereitstellung benötigt die geprüfte Projekt-, Personen- und Rollenbindung.");
  return { projectId: value.projectId, userId: value.userId, role: value.role };
}
function aborted(signal) { check(!signal?.aborted, 409, "normal_media_cancelled", "Die Bereitstellung der Artdatei wurde abgebrochen."); }

/** Same project DB and short transactions; this facade never owns the connection or source files. */
export function createNormalMediaStore({ db, actor, transaction, audit, iso,
  imageDecode = validateImageDecode, audioDecode = validateAudioDecode }) {
  let decoding = false;
  const projectId = () => db.prepare("SELECT value FROM meta WHERE key='project_id'").get()?.value;
  const read = fn => db.isTransaction ? fn() : transaction(fn, { readOnly: true });
  function writer(token, binding) {
    const user = actor(token, WRITERS, { write: true });
    check(binding.projectId === projectId() && binding.userId === user.id && binding.role === user.role,
      409, "media_binding_changed", "Projekt, Person oder Rolle wurde während der Dateibereitstellung geändert.");
    return user;
  }
  function body(row) {
    return { contentId: row.content_id, projectId: row.project_id, speciesId: row.species_id, slot: row.slot,
      asset: { id: row.source_id, projectId: row.project_id, sha256: row.sha256, bytes: row.bytes, mimeType: row.mime_type, attribution: row.attribution } };
  }
  function immutable(row) { return { ...body(row), sourceRevision: row.source_revision, creatorId: row.creator_id, createdAt: row.created_at }; }
  function maxBytes(mime) { return mime === "audio/mpeg" ? NORMAL_MEDIA_LIMITS.soundBytes : NORMAL_MEDIA_LIMITS.imageBytes; }
  function dimensions(metadata) {
    return metadata.mime_type === "audio/mpeg" ? metadata.width === null && metadata.height === null
      : Number.isSafeInteger(metadata.width) && metadata.width > 0 && Number.isSafeInteger(metadata.height) && metadata.height > 0
        && metadata.width * metadata.height <= NORMAL_MEDIA_LIMITS.imagePixels;
  }
  function blob(hash, expected) {
    const result = db.prepare("SELECT sha256,bytes,mime_type,width,height,length(data) AS stored_bytes,typeof(data) AS stored_type FROM normal_media_blobs WHERE sha256=?").get(hash);
    if (!result) return null;
    changed(result.sha256 === hash && result.bytes === expected.bytes && result.mime_type === expected.mimeType
      && result.bytes > 0 && result.bytes <= maxBytes(result.mime_type) && result.stored_bytes === result.bytes
      && result.stored_type === "blob" && dimensions(result));
    return result;
  }
  function blobBytes(metadata) {
    const value = db.prepare("SELECT data FROM normal_media_blobs WHERE sha256=? AND bytes=? AND typeof(data)='blob' AND length(data)=?")
      .get(metadata.sha256, metadata.bytes, metadata.bytes);
    changed(value);
    const bytes = Buffer.from(value.data); changed(bytes.length === metadata.bytes && digest(bytes) === metadata.sha256);
    return bytes;
  }
  function checkSource(row) {
    const version = db.prepare("SELECT data FROM versions WHERE kind='species' AND id=? AND revision=?").get(row.species_id, row.source_revision);
    changed(version);
    let expected;
    try { expected = normalMediaBinding(JSON.parse(version.data), { projectId: row.project_id, slot: row.slot }); }
    catch { changed(false); }
    changed(expected && same(body(row), expected));
  }
  function find(contentId) {
    check(typeof contentId === "string" && CONTENT_ID.test(contentId), 400, "invalid_normal_media", "Eine gültige gebundene Artdateikennung ist erforderlich.");
    const row = db.prepare("SELECT * FROM normal_media_assets WHERE content_id=?").get(contentId);
    if (!row || row.project_id !== projectId()) return null;
    checkSource(row);
    changed(row.blob_sha256 === null || row.blob_sha256 === row.sha256);
    const stored = row.blob_sha256 === null ? null : blob(row.blob_sha256, body(row).asset);
    changed(row.blob_sha256 === null || stored);
    return { row, stored };
  }
  function allowed(user, row) {
    if (user.role !== "reader" && user.scope !== "read") return true;
    const approved = db.prepare("SELECT v.data FROM objects o JOIN versions v ON v.kind=o.kind AND v.id=o.id AND v.revision=o.approved_revision WHERE o.kind='species' AND o.id=?")
      .get(row.species_id);
    if (!approved) return false;
    try { return same(normalMediaBinding(JSON.parse(approved.data), { projectId: row.project_id, slot: row.slot }), body(row)); }
    catch { return false; }
  }
  function readable(token, contentId) {
    const user = actor(token), value = find(contentId);
    check(value && allowed(user, value.row), 404, "normal_media_not_found", "Die Artdatei ist für diese Projekt- oder Lesefassung nicht verfügbar.");
    return value;
  }
  function metadata(value) { return { ...body(value.row), width: value.stored?.width ?? null, height: value.stored?.height ?? null, complete: Boolean(value.stored) }; }
  function incrementGeneration() {
    const previous = db.prepare("SELECT value FROM meta WHERE key='reader_media_generation'").get()?.value;
    changed(typeof previous === "string" && /^(?:0|[1-9][0-9]*)$/.test(previous) && Number.isSafeInteger(Number(previous)) && Number(previous) < Number.MAX_SAFE_INTEGER);
    changed(db.prepare("UPDATE meta SET value=? WHERE key='reader_media_generation' AND value=?").run(String(Number(previous) + 1), previous).changes === 1);
  }
  function complete(row, user) {
    if (row.blob_sha256 !== null) return;
    changed(db.prepare("UPDATE normal_media_assets SET blob_sha256=sha256 WHERE content_id=? AND blob_sha256 IS NULL").run(row.content_id).changes === 1);
    incrementGeneration(); audit(user, "normal-media-completed", row.content_id);
  }
  return {
    assertWrite(token, expectedBinding, contentId) {
      actor(token, WRITERS, { write: true });
      const binding = bindingCopy(expectedBinding);
      return read(() => { writer(token, binding); if (contentId === undefined) return true;
        const value = find(contentId); check(value, 404, "normal_media_not_found", "Diese Artdatei wurde noch nicht deklariert."); return metadata(value); });
    },
    declare(token, input) {
      actor(token, WRITERS, { write: true });
      const declaration = validateNormalMediaDeclaration(input), binding = bindingCopy(declaration.expectedBinding);
      return transaction(() => {
        const user = writer(token, binding);
        const head = db.prepare("SELECT v.data,v.revision FROM objects o JOIN versions v ON v.kind=o.kind AND v.id=o.id AND v.revision=o.current_revision WHERE o.kind='species' AND o.id=?")
          .get(declaration.speciesId);
        check(head && head.revision === declaration.expectedRevision, 409, "object_changed", "Die Artquelle wurde geändert. Bitte die aktuelle Fassung vor der Bereitstellung prüfen.");
        const source = normalMediaBinding(JSON.parse(head.data), { projectId: binding.projectId, slot: declaration.slot });
        changed(source && same(source.asset, declaration.asset));
        let existing = find(source.contentId);
        if (existing) changed(same(body(existing.row), source));
        const stored = blob(source.asset.sha256, source.asset);
        if (stored) blobBytes(stored);
        if (!existing) {
          db.prepare("INSERT INTO normal_media_assets(content_id,project_id,species_id,slot,source_id,sha256,bytes,mime_type,attribution,source_revision,creator_id,created_at,blob_sha256) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL)")
            .run(source.contentId, source.projectId, source.speciesId, source.slot, source.asset.id, source.asset.sha256, source.asset.bytes,
              source.asset.mimeType, source.asset.attribution, head.revision, user.id, iso());
          audit(user, "normal-media-declared", source.contentId); existing = find(source.contentId);
        }
        if (stored) complete(existing.row, user);
        return metadata(find(source.contentId));
      });
    },
    get(token, contentId) { return read(() => {
      const value = readable(token, contentId);
      // This is a single explicit metadata lookup, never an object/catalog
      // listing. Confirm a ready receipt against one bounded stored original.
      if (value.stored) blobBytes(value.stored);
      return metadata(value);
    }); },
    content(token, contentId) {
      return read(() => {
        const value = readable(token, contentId);
        check(value.stored, 409, "normal_media_incomplete", "Die unveränderten Artdateibytes sind noch nicht vollständig bereitgestellt.");
        return { metadata: metadata(value), bytes: blobBytes(value.stored) };
      });
    },
    async put(token, contentId, input, { expectedBinding, mimeType, signal } = {}) {
      actor(token, WRITERS, { write: true });
      const binding = bindingCopy(expectedBinding);
      const before = read(() => { const user = writer(token, binding), value = find(contentId);
        check(value, 404, "normal_media_not_found", "Diese Artdatei wurde noch nicht deklariert."); return { user, ...value }; });
      check(!decoding, 429, "normal_media_busy", "Eine Artdatei wird bereits geprüft. Bitte diesen Abschluss abwarten.");
      check((Buffer.isBuffer(input) || input instanceof Uint8Array) && input.byteLength > 0 && input.byteLength <= maxBytes(before.row.mime_type),
        413, "normal_media_too_large", "Die unveränderte Artdatei überschreitet ihre begrenzte Bereitstellungsgröße.");
      const bytes = Buffer.from(input);
      check(bytes.length === before.row.bytes && digest(bytes) === before.row.sha256 && mimeType === before.row.mime_type,
        400, "invalid_normal_media", "Dateibytes, Hash und Medientyp stimmen nicht mit der gebundenen Originaldatei überein.");
      aborted(signal); decoding = true;
      try {
        let decoded;
        try {
          if (mimeType === "audio/mpeg") {
            inspectCompleteMp3Buffer(bytes);
            const result = await audioDecode(bytes, { signal });
            check(result?.bytes === bytes.length && result.sha256 === before.row.sha256 && result.mimeType === "audio/mpeg",
              400, "invalid_normal_media", "Die vollständige MP3-Prüfung besitzt keinen passenden Originaldateibeleg.");
            decoded = { width: null, height: null };
          } else {
            const header = (mimeType === "image/jpeg" ? inspectJpeg : inspectWebp)(bytes);
            check(header.valid && Number.isSafeInteger(header.width) && Number.isSafeInteger(header.height)
              && header.width * header.height <= NORMAL_MEDIA_LIMITS.imagePixels, 400, "invalid_normal_media", "Die Artbilddatei besitzt keine gültigen begrenzten Abmessungen.");
            decoded = await imageDecode(bytes, { format: header.format, signal });
            check(decoded?.width === header.width && decoded.height === header.height, 400, "invalid_normal_media", "Die Bildprüfung passt nicht zum gebundenen Originalbild.");
          }
        } catch (error) {
          if (signal?.aborted) aborted(signal);
          if (error instanceof ProjectError && error.status === 429 && error.code === "media_busy") throw error;
          if (error.code === "unsupported_audio_tag") check(false, 400, error.code, "Diese MP3-Metadatenform wird derzeit nicht unterstützt; das Original bleibt erhalten.");
          check(false, 400, "invalid_normal_media", "Die Artdatei konnte nicht vollständig und sicher geprüft werden; das Original bleibt erhalten.");
        }
        aborted(signal);
        return transaction(() => {
          const user = writer(token, binding), current = find(contentId);
          changed(current && user.version === before.user.version && same(immutable(current.row), immutable(before.row)) && digest(bytes) === before.row.sha256);
          db.prepare("INSERT OR IGNORE INTO normal_media_blobs(sha256,bytes,mime_type,width,height,data) VALUES (?,?,?,?,?,?)")
            .run(before.row.sha256, bytes.length, mimeType, decoded.width, decoded.height, bytes);
          const stored = blob(before.row.sha256, body(before.row).asset);
          changed(stored && stored.width === decoded.width && stored.height === decoded.height); blobBytes(stored);
          complete(current.row, user);
          return metadata(find(contentId));
        });
      } finally { decoding = false; }
    },
    resolve(token, asset, { speciesId, role } = {}) {
      return read(() => {
        const user = actor(token);
        check(Object.hasOwn(ROLES, role), 400, "invalid_normal_media", "Eine feste normale Artdateirolle ist erforderlich.");
        const contentId = normalMediaContentId({ projectId: projectId(), speciesId, slot: ROLES[role], asset });
        const value = find(contentId);
        if (!value?.stored || !allowed(user, value.row)) return null;
        return { kind: "project-normal", ...body(value.row).asset, contentId };
      });
    },
  };
}
