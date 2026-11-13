import { validateImageDecode } from "../../scripts/image-validation.mjs";
import { check, ProjectError } from "./errors.mjs";
import { digest } from "./security.mjs";
import { IMAGE_MEDIA_ID, IMAGE_MEDIA_MIMES, IMAGE_MEDIA_MAX_BYTES, validateImageMediaId, validateImageMediaIntent, validateImageMediaBinding,
  projectImageMedia, imageMediaReferenceMatches } from "./image-media.mjs";
import { imageRegistryReferences } from "./media-reference-context.mjs";

export function createImageMediaStore({ db, actor, transaction, audit, iso, decode = validateImageDecode }) {
  let decoding = false;
  const projectId = () => db.prepare("SELECT value FROM meta WHERE key='project_id'").get()?.value;
  function writer(token, binding) {
    validateImageMediaBinding(binding);
    const user = actor(token, ["admin", "publisher", "contributor"], { write: true });
    check(binding.projectId === projectId() && binding.userId === user.id && binding.role === user.role,
      409, "media_binding_changed", "Projekt, Person oder Rolle wurde während der Bildübernahme geändert.");
    return user;
  }
  function row(id) {
    validateImageMediaId(id);
    const value = db.prepare("SELECT a.*,b.width,b.height FROM image_media_assets a LEFT JOIN image_media_blobs b ON b.sha256=a.blob_sha256 WHERE a.id=?").get(id);
    check(value && value.project_id === projectId(), 404, "image_media_not_found", "Das Bild ist für dieses Projekt nicht vorhanden."); return value;
  }
  function readable(token, id) {
    const user = actor(token), value = row(id), media = projectImageMedia(value);
    if (user.role === "reader" || user.scope === "read") {
      let allowed = false;
      for (const object of db.prepare("SELECT v.data FROM objects o JOIN versions v ON v.kind=o.kind AND v.id=o.id AND v.revision=o.approved_revision").iterate()) {
        if (imageRegistryReferences(JSON.parse(object.data)).some((ref) => imageMediaReferenceMatches(ref, media))) { allowed = true; break; }
      }
      check(allowed, 404, "image_media_not_found", "Das Bild ist für diese Lesefassung nicht freigegeben.");
    }
    return { user, value, media };
  }
  function assertReferences(data) {
    for (const ref of imageRegistryReferences(data)) if (IMAGE_MEDIA_ID.test(ref.id || "")) {
      const value = row(ref.id);
      check(value.blob_sha256 && imageMediaReferenceMatches(ref, projectImageMedia(value)), 409, "image_media_incomplete", "Die Seitenfassung benötigt zunächst ihre vollständig bereitgestellten Bildbytes.");
    }
  }
  return {
    assertReferences,
    assertWrite(token, binding, id) { writer(token, binding); if (id) row(id); return true; },
    declare(token, input) {
      validateImageMediaIntent(input);
      return transaction(() => {
        const user = writer(token, input.expectedBinding), existing = db.prepare("SELECT id,project_id,sha256,bytes,mime_type,attribution FROM image_media_assets WHERE id=?").get(input.id);
        if (existing) {
          check(existing.project_id === projectId() && existing.sha256 === input.sha256 && existing.bytes === input.bytes && existing.mime_type === input.mimeType && existing.attribution === input.attribution,
            409, "image_media_changed", "Diese Bildkennung gehört bereits zu anderen unveränderlichen Bilddaten.");
          return projectImageMedia(row(input.id));
        }
        const blob = db.prepare("SELECT sha256,bytes,mime_type FROM image_media_blobs WHERE sha256=?").get(input.sha256);
        check(!blob || blob.bytes === input.bytes && blob.mime_type === input.mimeType, 409, "image_media_changed", "Der vorhandene Bildhash besitzt eine andere Formatbindung.");
        db.prepare("INSERT INTO image_media_assets VALUES (?,?,?,?,?,?,?,?,?)").run(input.id, projectId(), input.sha256, input.bytes, input.mimeType, input.attribution, user.id, iso(), blob?.sha256 ?? null);
        audit(user, "image-media-declared", input.id); return projectImageMedia(row(input.id));
      });
    },
    get(token, id) { return readable(token, id).media; },
    content(token, id) {
      const { value, media } = readable(token, id);
      check(value.blob_sha256, 409, "image_media_incomplete", "Die Bildbytes sind noch nicht vollständig bereitgestellt.");
      const size = db.prepare("SELECT length(data) AS bytes,typeof(data) AS type FROM image_media_blobs WHERE sha256=?").get(value.blob_sha256);
      check(size && size.type === "blob" && size.bytes === media.bytes && size.bytes <= IMAGE_MEDIA_MAX_BYTES,
        409, "invalid_image_media", "Die gespeicherten Bildbytes besitzen keine begrenzte gültige Dateibindung.");
      const bytes = Buffer.from(db.prepare("SELECT data FROM image_media_blobs WHERE sha256=?").get(value.blob_sha256).data);
      check(bytes.length === media.bytes && digest(bytes) === media.sha256, 409, "invalid_image_media", "Die gespeicherten Bildbytes stimmen nicht mit ihrer Bindung überein.");
      return { metadata: media, bytes };
    },
    async put(token, id, input, { expectedBinding, mimeType, signal } = {}) {
      const user = writer(token, expectedBinding), before = row(id);
      check(!decoding, 429, "image_media_busy", "Ein Bild wird bereits geprüft. Bitte diesen Abschluss abwarten.");
      check((Buffer.isBuffer(input) || input instanceof Uint8Array) && input.byteLength > 0 && input.byteLength <= IMAGE_MEDIA_MAX_BYTES,
        413, "image_media_too_large", "Eine einzelne Bilddatei darf höchstens 20 MiB groß sein.");
      const bytes = Buffer.from(input);
      check(bytes.length === before.bytes && digest(bytes) === before.sha256 && mimeType === before.mime_type,
        400, "invalid_image_media", "Bildbytes, Hash oder Medientyp stimmen nicht mit der Bildabsicht überein.");
      signal?.throwIfAborted(); decoding = true;
      try {
        let dimensions;
        try { dimensions = await decode(bytes, { format: IMAGE_MEDIA_MIMES[before.mime_type] }); }
        catch (error) {
          if (error instanceof ProjectError && error.status === 429 && error.code === "media_busy") throw error;
          check(false, 400, "invalid_image_media", "Die Bilddatei konnte nicht vollständig und sicher dekodiert werden.");
        }
        signal?.throwIfAborted();
        return transaction(() => {
          const currentUser = writer(token, expectedBinding), current = row(id);
          check(currentUser.version === user.version && current.sha256 === before.sha256 && current.bytes === before.bytes && current.mime_type === before.mime_type
            && digest(bytes) === before.sha256, 409, "media_binding_changed", "Die Bild- oder Personenbindung hat sich während der Prüfung geändert.");
          db.prepare("INSERT OR IGNORE INTO image_media_blobs VALUES (?,?,?,?,?,?)").run(before.sha256, bytes.length, before.mime_type, dimensions.width, dimensions.height, bytes);
          const blob = db.prepare("SELECT bytes,mime_type,width,height FROM image_media_blobs WHERE sha256=?").get(before.sha256);
          check(blob.bytes === before.bytes && blob.mime_type === before.mime_type && blob.width === dimensions.width && blob.height === dimensions.height,
            409, "image_media_changed", "Der vorhandene Bildhash besitzt widersprüchliche Bilddaten.");
          db.prepare("UPDATE image_media_assets SET blob_sha256=sha256 WHERE id=?").run(id);
          if (!before.blob_sha256) audit(currentUser, "image-media-completed", id);
          return projectImageMedia(row(id));
        });
      } finally { decoding = false; }
    },
  };
}
