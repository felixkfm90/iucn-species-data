import { DatabaseSync } from "node:sqlite";
import { normalizeAssetMetadata, normalizeSpeciesSnapshot } from "../page-authoring/model.mjs";
import { slug } from "../page-authoring/contract.mjs";
import { canonicalJson, digest } from "./security.mjs";
import { CLIENT_IMAGE_LIMITS, clientImageBase, validateClientImageMetadata } from "./client-image-media.mjs";
import { validateClientNormalMetadata } from "./client-normal-media-store.mjs";
import { normalMediaContentId, NORMAL_MEDIA_MIMES } from "./normal-media.mjs";

const managed = /^image-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const canonical = (value) => canonicalJson(value, { maxBytes: 1024 * 1024, maxNodes: 100000 });
const equal = (a, b) => canonical(a) === canonical(b);
const ASSET_FIELDS = ["id", "projectId", "sha256", "bytes", "mimeType", "attribution"];
const NORMAL_SLOTS = { portrait: "portrait.webp", map: "map.jpg", sound: "sound.mp3", spectrogram: "spectrogram.webp" };
const check = (condition, message) => { if (!condition) throw new Error(message); };
function fields(value, keys) { check(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key)), "Die Seitenbild-Sicherungsbindung enthält unbekannte oder fehlende Felder."); }
function requirement(value) {
  value = JSON.parse(canonical(value));
  const contextual = Object.hasOwn(value, "domain");
  fields(value, ["origin", "actorId", "asset", ...(contextual ? ["domain", "speciesId", "slot"] : [])]); fields(value.asset, ASSET_FIELDS);
  const asset = normalizeAssetMetadata(value.asset, value.asset.projectId);
  check(value.origin === null && value.actorId === null || typeof value.origin === "string" && value.origin.length <= 2048
    && typeof value.actorId === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value.actorId), "Die persönliche Seitenbildzuordnung fehlt.");
  if (value.origin !== null) {
    const url = new URL(value.origin); check(!url.username && !url.password && !url.search && !url.hash
      && (url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)),
    "Die Seitenbilder besitzen keine zulässige persönliche Projektadresse.");
  }
  if (contextual) {
    slug(value.speciesId);
    check(["normal", "image", "external"].includes(value.domain)
      && (value.domain === "normal" ? Object.values(NORMAL_SLOTS).includes(value.slot) && asset.mimeType === NORMAL_MEDIA_MIMES[value.slot] && asset.bytes > 0
        : value.slot === null && (value.domain !== "image" || managed.test(asset.id))), "Die Seitenmedienrolle ist nicht vollständig an ihre tatsächliche Artdatei gebunden.");
  }
  return { origin: value.origin, actorId: value.actorId, asset, ...(contextual ? { domain: value.domain, speciesId: value.speciesId, slot: value.slot } : {}) };
}
export function pageMediaRequirementHash(value) { return digest(canonical(requirement(value))); }
export const hasManagedPageMedia = (value) => value?.scopedRequiredMedia?.some((entry) => entry.domain ? ["normal", "image"].includes(entry.domain) : managed.test(entry.asset?.id || "")) === true;

/** The validated saved page supplies roles; a filename prefix never turns a normal asset into a gallery upload. */
export function collectPageMediaRequirements(document, { projectId, origin = null, actorId = null } = {}) {
  const species = normalizeSpeciesSnapshot(document.species, projectId, document.species?.slug), result = new Map();
  const add = (asset, domain, slot = null) => {
    const entry = requirement({ origin, actorId, asset, domain, speciesId: species.slug, slot });
    result.set(pageMediaRequirementHash(entry), entry);
  };
  const normals = Object.entries(NORMAL_SLOTS).flatMap(([role, slot]) => species.normalAssets[role]?.bytes > 0
    ? [{ asset: species.normalAssets[role], slot }] : []);
  for (const { asset, slot } of normals) add(asset, "normal", slot);
  // Credits are metadata, never a supported binary-media slot.
  if (species.normalAssets.credits) add(species.normalAssets.credits, "external");
  check(Array.isArray(document.images), "Die gespeicherte Galerie fehlt.");
  for (const image of document.images) {
    const asset = normalizeAssetMetadata(image.asset, projectId); fields(image.asset, ASSET_FIELDS);
    const aliases = normals.filter((normal) => equal(normal.asset, asset));
    if (aliases.length) for (const normal of aliases) add(asset, "normal", normal.slot);
    else add(asset, managed.test(asset.id) ? "image" : "external");
  }
  return [...result.values()];
}

/** Preserve the journal validator's actual scoped requirements; no file or network reads. */
export function checkedPageJournalMedia(value) {
  if (!Object.hasOwn(value, "requiredMedia") && !Object.hasOwn(value, "scopedRequiredMedia")) return null;
  check(Array.isArray(value.requiredMedia) && Array.isArray(value.scopedRequiredMedia), "Die Seitenbildanforderungen sind nicht vollständig erhalten.");
  const requiredMedia = value.requiredMedia.map((asset) => {
    fields(asset, ["projectId", "id", "sha256", "bytes", "mimeType"]);
    normalizeAssetMetadata({ ...asset, attribution: "" }, asset.projectId); return { ...asset };
  });
  const scopedRequiredMedia = value.scopedRequiredMedia.map(requirement).sort((a, b) => pageMediaRequirementHash(a).localeCompare(pageMediaRequirementHash(b)));
  check(new Set(scopedRequiredMedia.map(pageMediaRequirementHash)).size === scopedRequiredMedia.length,
    "Die persönlichen Seitenbildanforderungen enthalten doppelte Bindungen.");
  for (const asset of requiredMedia) check(scopedRequiredMedia.some((entry) => equal({ projectId: entry.asset.projectId, id: entry.asset.id,
    sha256: entry.asset.sha256, bytes: entry.asset.bytes, mimeType: entry.asset.mimeType }, asset)), "Ein benötigtes Seitenbild besitzt keine erhaltene Quellenbindung.");
  const coverage = value.coverage, base = ["scope", "mediaBytesIncluded", "sharedSyncKnown", "authorityRevalidated", "publicVerificationPerformed"];
  check(coverage?.scope === "authoring-database-and-media-references-only" && base.every((key) => Object.hasOwn(coverage, key))
    && Object.keys(coverage).every((key) => [...base, "personalScopesIncluded", "legacyScopeAssigned"].includes(key))
    && base.slice(1).every((key) => coverage[key] === false)
    && (!Object.hasOwn(coverage, "personalScopesIncluded") || coverage.personalScopesIncluded === true)
    && (!Object.hasOwn(coverage, "legacyScopeAssigned") || coverage.legacyScopeAssigned === false), "Die Artseiten-Sicherungsgrenze ist nicht eindeutig beschrieben.");
  return { schemaVersion: scopedRequiredMedia.some(entry => entry.domain) ? 2 : 1, requiredMedia, scopedRequiredMedia, coverage: { ...coverage } };
}

/** Compare old manifests without changing their historical three-field requirement hash contract. */
export function legacyPageJournalMedia(value) {
  if (!value || value.schemaVersion === 1) return value;
  const required = new Map(), proofs = new Map();
  for (const entry of value.scopedRequiredMedia) {
    const legacy = { origin: entry.origin, actorId: entry.actorId, asset: entry.asset }, oldHash = pageMediaRequirementHash(legacy);
    required.set(oldHash, legacy);
    const proof = value.evidence?.find(item => item.requirementSha256 === pageMediaRequirementHash(entry));
    if (proof) {
      const converted = { ...proof, requirementSha256: oldHash };
      check(!proofs.has(oldHash) || equal(proofs.get(oldHash), converted), "Die alten Medienbelege unterscheiden mehrere neue Artdateiverwendungen nicht eindeutig.");
      proofs.set(oldHash, converted);
    }
  }
  const scopedRequiredMedia = [...required].sort(([a], [b]) => a.localeCompare(b)).map(([, entry]) => entry);
  return { ...value, schemaVersion: 1, scopedRequiredMedia,
    ...(value.evidence ? { evidence: scopedRequiredMedia.map(entry => proofs.get(pageMediaRequirementHash(entry))) } : {}) };
}

/** Reads only qualified, separately owned client-cache copies. BLOB bytes were checked individually by their cache validator. */
export function validatePageMediaBackup({ caches, requirements, progress = () => {}, legacyCacheOnly = false }) {
  const databases = [], evidence = [];
  try {
    for (const cache of [...caches].sort((a, b) => a.id.localeCompare(b.id))) {
      const db = new DatabaseSync(cache.filename, { readOnly: true, timeout: 1000 }); databases.push({ ...cache, db });
      db.exec("PRAGMA trusted_schema=OFF; PRAGMA query_only=ON;");
    }
    const seen = new Set();
    for (const input of requirements) {
      progress(); const entry = requirement(input), requirementSha256 = pageMediaRequirementHash(entry);
      check(!legacyCacheOnly || !Object.hasOwn(entry, "domain"), "Eine historische Medienprüfung darf keine neue Artdateidomäne umdeuten.");
      if (seen.has(requirementSha256)) continue; seen.add(requirementSha256);
      const domain = entry.domain ?? (managed.test(entry.asset.id) ? "image" : "external");
      if (domain === "external") {
        evidence.push({ requirementSha256, storage: "external-reference", localBytesIncluded: false, requiredServerMedia: false, serverBytesIncluded: false }); continue;
      }
      let found;
      for (const cache of databases) {
        const version = cache.db.prepare("PRAGMA user_version").get().user_version;
        if (domain === "normal") {
          if (![4, 5].includes(version)) continue;
          const contentId = normalMediaContentId({ projectId: entry.asset.projectId, speciesId: entry.speciesId, slot: entry.slot, asset: entry.asset });
          const rows = cache.db.prepare(`SELECT m.*,b.base_url,b.project_id,b.user_id,n.bytes AS blob_bytes,n.mime_type AS blob_mime,
            length(n.data) AS actual_bytes,typeof(n.data) AS blob_type FROM normal_media m JOIN bindings b ON b.id=m.binding_id
            JOIN normal_blobs n ON n.sha256=m.blob_sha256 WHERE b.project_id=? AND m.content_id=? ORDER BY m.binding_id`).iterate(entry.asset.projectId, contentId);
          for (const row of rows) {
            progress();
            if (entry.origin !== null && (row.base_url !== entry.origin || row.user_id !== entry.actorId)) continue;
            check(row.binding_id === digest(`${row.base_url}\n${row.project_id}\n${row.user_id}`), "Die Artdateiquelle besitzt keine echte persönliche Cachebindung.");
            const metadata = validateClientNormalMetadata(JSON.parse(row.metadata_json), { projectId: entry.asset.projectId });
            if (metadata.contentId !== contentId || metadata.speciesId !== entry.speciesId || metadata.slot !== entry.slot || !equal(metadata.asset, entry.asset)) continue;
            const receipt = JSON.parse(row.receipt_json);
            check(receipt && ["admin", "publisher", "contributor", "reader"].includes(receipt.role)
              && equal(receipt, { schemaVersion: 1, baseUrl: row.base_url, projectId: row.project_id, userId: row.user_id, role: receipt.role,
                contentId, metadataSha256: digest(canonicalJson(metadata)), complete: true }), "Der persönliche Artdatei-Serverbeleg ist nicht exakt gebunden.");
            check(row.blob_sha256 === metadata.asset.sha256 && row.blob_bytes === metadata.asset.bytes && row.actual_bytes === metadata.asset.bytes
              && row.blob_mime === metadata.asset.mimeType && row.blob_type === "blob", "Einer benötigten Artdatei fehlen ihre vollständigen lokalen Bytes.");
            found = { requirementSha256, storage: "local-normal-bytes", cacheFileId: cache.id, bindingId: row.binding_id,
              metadataSha256: digest(canonicalJson(metadata)), receiptSha256: digest(canonicalJson(receipt)),
              localBytesIncluded: true, requiredServerMedia: false, serverBytesIncluded: false }; break;
          }
          if (found) break;
          continue;
        }
        if (!(legacyCacheOnly ? version === 3 : [3, 4, 5].includes(version))) continue;
        const rows = cache.db.prepare(`SELECT m.binding_id,m.metadata_json,m.blob_sha256,m.uploaded,m.receipt_json,b.base_url,b.project_id,b.user_id,
          i.bytes AS blob_bytes,length(i.data) AS actual_bytes,typeof(i.data) AS blob_type
          FROM image_media m JOIN bindings b ON b.id=m.binding_id LEFT JOIN image_blobs i ON i.sha256=m.blob_sha256
          WHERE b.project_id=? AND m.id=? ORDER BY m.binding_id`).iterate(entry.asset.projectId, entry.asset.id);
        for (const row of rows) {
          progress();
          if (entry.origin !== null && (row.base_url !== entry.origin || row.user_id !== entry.actorId)) continue;
          check(row.binding_id === digest(`${row.base_url}\n${row.project_id}\n${row.user_id}`), "Die Seitenbildquelle besitzt keine echte persönliche Cachebindung.");
          const metadata = validateClientImageMetadata(JSON.parse(row.metadata_json), { projectId: entry.asset.projectId });
          if (!equal(clientImageBase(metadata), entry.asset)) continue;
          check([0, 1].includes(row.uploaded), "Der persönliche Seitenbild-Übertragungsstand ist ungültig.");
          const receipt = row.receipt_json === null ? null : JSON.parse(row.receipt_json);
          check(row.uploaded === 0 ? receipt === null : receipt && ["admin", "publisher", "contributor", "reader"].includes(receipt.role)
            && equal(receipt, { schemaVersion: 1, baseUrl: row.base_url, projectId: row.project_id, userId: row.user_id, role: receipt.role,
              id: metadata.id, metadataSha256: digest(canonicalJson(metadata)), complete: true }), "Der persönliche Seitenbild-Serverbeleg ist nicht exakt gebunden.");
          const local = row.blob_sha256 !== null;
          check(!local || row.blob_sha256 === metadata.sha256 && row.blob_bytes === metadata.bytes && row.actual_bytes === metadata.bytes
            && row.blob_type === "blob" && metadata.bytes <= CLIENT_IMAGE_LIMITS.imageBytes, "Einem benötigten Seitenbild fehlen seine vollständigen lokalen Bytes.");
          if (!local && (entry.origin === null || row.uploaded !== 1)) continue;
          found = { requirementSha256, storage: local ? "local-bytes" : "remote-backed", cacheFileId: cache.id, bindingId: row.binding_id,
            metadataSha256: digest(canonicalJson(metadata)), receiptSha256: receipt ? digest(canonicalJson(receipt)) : null,
            localBytesIncluded: local, requiredServerMedia: !local, serverBytesIncluded: false }; break;
        }
        if (found) break;
      }
      if (!found && domain === "normal") found = { requirementSha256, storage: "external-reference", localBytesIncluded: false, requiredServerMedia: false, serverBytesIncluded: false };
      check(found, "Einem Seitenentwurf fehlen bytegleiche lokale Bilder oder exakt persönlich gebundene Serverbelege in der Gerätesicherung."); evidence.push(found);
    }
    return evidence.sort((a, b) => a.requirementSha256.localeCompare(b.requirementSha256));
  } finally { for (const { db } of databases.reverse()) db.close(); }
}
