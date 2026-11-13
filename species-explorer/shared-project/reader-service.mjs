import { canonicalJson, objectJson, digest } from "./security.mjs";
import { check } from "./errors.mjs";
import { buildReaderCatalog } from "./reader-catalog.mjs";
import { projectSpeciesRecordToReader, readerMediaRequirements } from "./reader-projection.mjs";
import { IMAGE_MEDIA_ID } from "./image-media.mjs";

const MiB = 1024 * 1024;
const assetKeys = ["id", "projectId", "sha256", "bytes", "mimeType", "attribution"];

/** Authenticated reader projection over existing immutable versions and media. */
export function createReaderCatalogService({ db, actor, transaction, imageMedia, normalMedia = null, iso } = {}) {
  const projectId = () => db.prepare("SELECT value FROM meta WHERE key='project_id'").get().value;
  const revision = () => db.prepare("SELECT value FROM meta WHERE key='catalog_revision'").get().value;
  function resolve(token, metadata, context) {
    let value;
    try {
      if (["portrait", "map", "sound", "spectrogram"].includes(context.role)) {
        return normalMedia ? normalMedia.resolve(token, metadata, context) : null;
      }
      if (context.role === "gallery" && IMAGE_MEDIA_ID.test(metadata.id)) {
        value = imageMedia.get(token, metadata.id);
        return value.complete ? { kind: "project-image", ...Object.fromEntries(assetKeys.map(key => [key, value[key]])) } : null;
      }
      return null;
    } catch (error) {
      if (["image_media_not_found", "image_media_incomplete", "normal_media_not_found", "normal_media_incomplete"].includes(error.code)) return null;
      throw error;
    }
  }
  function project(token, data) {
    return projectSpeciesRecordToReader(data, { projectId: projectId(), resolveMedia: (metadata, context) => resolve(token, metadata, context) });
  }
  function snapshot(user) {
    const images = db.prepare("SELECT count(*) AS n,count(blob_sha256) AS complete FROM image_media_assets").get();
    return digest(canonicalJson({ projectId: projectId(), revision: revision(),
      user: user.id, version: user.version, role: user.role, scope: user.scope, session: user.session_hash,
      images: { count: images.n, complete: images.complete },
      normalMedia: db.prepare("SELECT value FROM meta WHERE key='reader_media_generation'").get()?.value ?? "0" }));
  }
  const approved = `SELECT o.id,v.data FROM objects o JOIN versions v
    ON v.kind=o.kind AND v.id=o.id AND v.revision=o.approved_revision WHERE o.kind='species'`;
  return Object.freeze({
    project(token, data) { actor(token); return project(token, data); },
    preview(token, id, { expectedRevision, expectedDataHash } = {}) {
      return transaction(() => {
        const user = actor(token, ["admin", "publisher"], { write: true });
        check(typeof id === "string" && id.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id),
          400, "invalid_object", "Eine vorhandene Artkennung ist erforderlich.");
        const row = db.prepare(`SELECT v.revision,v.data FROM objects o JOIN versions v
          ON v.kind=o.kind AND v.id=o.id AND v.revision=o.current_revision WHERE o.kind='species' AND o.id=?`).get(id);
        check(row, 404, "object_not_found", "Die Art ist nicht vorhanden.");
        const data = JSON.parse(row.data), dataHash = digest(objectJson(data));
        check(row.revision === expectedRevision && (expectedDataHash === undefined || expectedDataHash === dataHash),
          409, "approval_review_changed", "Die vollständige Artfassung hat sich vor der Leserprüfung geändert.");
        const readerSpecies = project(token, data);
        return { schemaVersion: 1, projectId: projectId(), user: { id: user.id, role: user.role }, speciesId: id,
          revision: row.revision, dataHash, readerHash: digest(canonicalJson(readerSpecies, { maxBytes: 4 * MiB, maxNodes: 300000 })),
          readerSpecies, missingMedia: readerMediaRequirements(readerSpecies), internalOnly: true, externalPublication: "not-performed" };
      }, { readOnly: true });
    },
    requireReady(token, data) {
      const user = actor(token, ["admin", "publisher"], { write: true });
      check(user, 403, "forbidden", "Die Leserfreigabe benötigt Freigaberechte.");
      const result = project(token, data), missing = readerMediaRequirements(result);
      check(missing.length === 0, 409, "reader_media_required", "Die Leserfassung benötigt zuerst ihre tatsächlich bereitgestellten Bild- und Tondateien.");
      return result;
    },
    catalog(token) {
      return transaction(() => {
        actor(token);
        const species = []; let bytes = 2048;
        for (const row of db.prepare(`${approved} ORDER BY o.id`).iterate()) {
          const item = project(token, JSON.parse(row.data));
          bytes += Buffer.byteLength(canonicalJson(item, { maxBytes: 4 * MiB, maxNodes: 300000 }));
          check(bytes <= 8 * MiB, 413, "reader_catalog_paging_required", "Der lesende Artenbestand benötigt einen paginierten Abruf. Es wurde nichts gekürzt.");
          species.push(item);
        }
        return buildReaderCatalog({ projectId: projectId(), revision: revision(), generatedAt: iso(), species });
      }, { readOnly: true });
    },
    page(token, { snapshot: expected, cursor, limit = 25, checkOnly = false } = {}) {
      check(Number.isInteger(limit) && limit >= 1 && limit <= 25 && typeof checkOnly === "boolean"
        && (expected === undefined || typeof expected === "string" && /^[a-f0-9]{64}$/.test(expected))
        && (cursor === undefined || typeof cursor === "string" && /^[A-Za-z0-9_-]{1,512}$/.test(cursor)),
      400, "invalid_paging", "Ungültige Grenze der Leserübertragung.");
      return transaction(() => {
        const user = actor(token), marker = snapshot(user);
        check(expected === undefined || expected === marker, 409, "reader_snapshot_changed", "Lesebestand oder Berechtigung hat sich geändert. Bitte den Abruf neu beginnen.");
        check(!checkOnly || expected !== undefined && cursor === undefined, 400, "invalid_paging", "Die Abschlussprüfung benötigt die Bestandskennung ohne Fortsetzung.");
        let afterId = "";
        if (cursor !== undefined) {
          let value; try { value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); } catch { /* checked below */ }
          check(expected === marker && Array.isArray(value) && value.length === 2 && value[0] === marker
            && typeof value[1] === "string" && value[1].length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value[1]),
          400, "invalid_paging", "Die Fortsetzung gehört nicht zu diesem Lesebestand.");
          afterId = value[1];
        }
        const totalCount = db.prepare("SELECT count(*) AS n FROM objects WHERE kind='species' AND approved_revision IS NOT NULL").get().n;
        const result = { schemaVersion: 2, projectId: projectId(), revision: String(revision()), generatedAt: iso(), snapshot: marker,
          totalCount, species: [], nextCursor: null, complete: true, checked: checkOnly };
        if (checkOnly) return result;
        let bytes = 2048;
        for (const row of db.prepare(`${approved} AND o.id>? ORDER BY o.id LIMIT ?`).iterate(afterId, limit + 1)) {
          if (result.species.length === limit) { result.complete = false; break; }
          const item = project(token, JSON.parse(row.data));
          const size = Buffer.byteLength(canonicalJson(item, { maxBytes: 4 * MiB, maxNodes: 300000 }));
          if (bytes + size > 4 * MiB && result.species.length) { result.complete = false; break; }
          result.species.push(item); bytes += size;
        }
        check(bytes <= 4 * MiB + 16 * 1024, 413, "reader_response_too_large", "Die einzelne Leserfassung überschreitet den begrenzten Übertragungsrahmen.");
        if (!result.complete) result.nextCursor = Buffer.from(JSON.stringify([marker, result.species.at(-1).id])).toString("base64url");
        return result;
      }, { readOnly: true });
    },
  });
}
