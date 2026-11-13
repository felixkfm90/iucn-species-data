import { isProxy } from "node:util/types";
import { check } from "./errors.mjs";
import { canonicalJson, digest } from "./security.mjs";
import { validateSpeciesRecord } from "./species-record.mjs";
import { speciesNormalAssetMetadata } from "./species-editorial.mjs";
import { identifier, slug, text } from "../page-authoring/contract.mjs";

export const NORMAL_MEDIA_SLOTS = Object.freeze(["portrait.webp", "map.jpg", "sound.mp3", "spectrogram.webp"]);
export const NORMAL_MEDIA_MIMES = Object.freeze({ "portrait.webp": "image/webp", "map.jpg": "image/jpeg", "sound.mp3": "audio/mpeg", "spectrogram.webp": "image/webp" });
export const NORMAL_MEDIA_LIMITS = Object.freeze({ imageBytes: 20 * 1024 * 1024, imagePixels: 40_000_000, soundBytes: 50 * 1024 * 1024 });
export const NORMAL_MEDIA_SCHEMA_COLUMNS = Object.freeze({
  normal_media_blobs: "sha256,bytes,mime_type,width,height,data",
  normal_media_assets: "content_id,project_id,species_id,slot,source_id,sha256,bytes,mime_type,attribution,source_revision,creator_id,created_at,blob_sha256",
});
const ASSET_KEYS = ["id", "projectId", "sha256", "bytes", "mimeType", "attribution"];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const CODE = "invalid_normal_media";
const MESSAGE = "Die normale Artdatei benötigt eine vollständige unveränderte Art-, Projekt-, Format- und Quellenbindung.";
const roles = { "portrait.webp": "portrait", "map.jpg": "map", "sound.mp3": "sound", "spectrogram.webp": "spectrogram" };

function pureData(value, { maxBytes = 64 * 1024, maxNodes = 2000 } = {}) {
  let nodes = 0, bytes = 0;
  function visit(item, depth) {
    check(depth <= 32 && ++nodes <= maxNodes, 400, CODE, MESSAGE);
    if (item === null || ["string", "boolean"].includes(typeof item) || typeof item === "number" && Number.isFinite(item)) {
      bytes += Buffer.byteLength(JSON.stringify(item));
      check(bytes <= maxBytes, 413, "normal_media_data_too_large", "Der normale Artdateibeleg überschreitet seine begrenzte Größe."); return;
    }
    check(item && typeof item === "object" && !isProxy(item), 400, CODE, MESSAGE);
    const array = Array.isArray(item);
    check(Object.getPrototypeOf(item) === (array ? Array.prototype : Object.prototype), 400, CODE, MESSAGE);
    const descriptors = Object.getOwnPropertyDescriptors(item), keys = Reflect.ownKeys(descriptors);
    if (array) check(keys.length === item.length + 1 && keys.every(key => key === "length"
      || typeof key === "string" && /^(?:0|[1-9][0-9]*)$/.test(key) && Number(key) < item.length), 400, CODE, MESSAGE);
    for (const key of keys) {
      if (array && key === "length") continue;
      const descriptor = descriptors[key];
      check(typeof key === "string" && !["__proto__", "constructor", "prototype"].includes(key)
        && descriptor.enumerable === true && Object.hasOwn(descriptor, "value"), 400, CODE, MESSAGE);
      if (!array) bytes += Buffer.byteLength(JSON.stringify(key));
      check(bytes <= maxBytes, 413, "normal_media_data_too_large", "Der normale Artdateibeleg überschreitet seine begrenzte Größe.");
      visit(descriptor.value, depth + 1);
    }
  }
  visit(value, 0);
}
function exact(value, keys) {
  check(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key)), 400, CODE, MESSAGE);
}
function checkedIdentity(rule, value) {
  try { return rule(value); } catch { check(false, 400, CODE, MESSAGE); }
}
function checkedSlot(slot) { check(NORMAL_MEDIA_SLOTS.includes(slot), 400, CODE, MESSAGE); return slot; }
function assetMetadata(value, projectId, slot) {
  exact(value, ASSET_KEYS);
  checkedIdentity(identifier, value.id); checkedIdentity(identifier, value.projectId);
  check(value.projectId === projectId && typeof value.sha256 === "string" && /^[a-f0-9]{64}$/.test(value.sha256)
    && value.mimeType === NORMAL_MEDIA_MIMES[slot] && Number.isSafeInteger(value.bytes) && value.bytes > 0, 400, CODE, MESSAGE);
  checkedIdentity(input => text(input, 8000, true), value.attribution);
  const maximum = slot === "sound.mp3" ? NORMAL_MEDIA_LIMITS.soundBytes : NORMAL_MEDIA_LIMITS.imageBytes;
  check(value.bytes <= maximum, 413, "normal_media_too_large", slot === "sound.mp3"
    ? "Die unveränderte MP3-Datei überschreitet die Bereitstellungsgrenze von 50 MiB. Das Original bleibt erhalten."
    : "Die unveränderte Bilddatei überschreitet die Bereitstellungsgrenze von 20 MiB. Das Original bleibt erhalten.");
  return value;
}
function bindingBody(input) {
  pureData(input); exact(input, ["projectId", "speciesId", "slot", "asset"]);
  checkedIdentity(identifier, input.projectId); checkedIdentity(slug, input.speciesId); checkedSlot(input.slot);
  assetMetadata(input.asset, input.projectId, input.slot);
  return JSON.parse(canonicalJson(input));
}

/** The old file ID is retained; identity additionally binds its exact version and provenance. */
export function normalMediaContentId(input) {
  return `normal-${digest(canonicalJson(bindingBody(input)))}`;
}

/** Resolve only an existing protected normal file. No lookup, URLs, paths or byte claims. */
export function normalMediaBinding(input, { projectId, slot } = {}) {
  checkedIdentity(identifier, projectId); checkedSlot(slot);
  pureData(input, { maxBytes: 4 * 1024 * 1024, maxNodes: 300000 });
  const record = validateSpeciesRecord(input, input?.id), file = record.assets.files[slot];
  if (!file || file.bytes === 0) return null;
  const asset = speciesNormalAssetMetadata(record, projectId, roles[slot]);
  const body = bindingBody({ projectId, speciesId: record.id, slot, asset });
  return { contentId: normalMediaContentId(body), ...body };
}

/** Exact structural declaration only; actual actor, source revision and bytes must be checked by the service. */
export function validateNormalMediaDeclaration(input) {
  pureData(input); exact(input, ["speciesId", "slot", "expectedRevision", "asset", "expectedBinding"]);
  exact(input.expectedBinding, ["projectId", "userId", "role"]);
  const binding = input.expectedBinding;
  checkedIdentity(identifier, binding.projectId); checkedIdentity(identifier, binding.userId);
  check(["admin", "publisher", "contributor"].includes(binding.role) && typeof input.expectedRevision === "string"
    && UUID.test(input.expectedRevision), 400, CODE, MESSAGE);
  checkedIdentity(slug, input.speciesId); checkedSlot(input.slot); assetMetadata(input.asset, binding.projectId, input.slot);
  return JSON.parse(canonicalJson(input));
}
