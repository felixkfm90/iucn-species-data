import { randomUUID } from "node:crypto";
import { inspectJpeg, inspectPng, inspectWebp } from "../../scripts/image-header.mjs";
import { validateImageDecode, IMAGE_DECODE_LIMITS } from "../../scripts/image-validation.mjs";
import { check, ProjectError } from "./errors.mjs";
import { canonicalJson, digest } from "./security.mjs";
import { imageRegistryReferences } from "./media-reference-context.mjs";

export const CLIENT_IMAGE_LIMITS = Object.freeze({ imageBytes: IMAGE_DECODE_LIMITS.bytes, pixels: IMAGE_DECODE_LIMITS.pixels,
  blobBytes: 192 * 1024 * 1024, cacheBytes: 384 * 1024 * 1024, backupBytes: 512 * 1024 * 1024, profileBytes: 1024 * 1024 * 1024, metadataReserve: 64 * 1024 });
export const MANAGED_IMAGE_ID = /^image-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const mimes = { "image/jpeg": ["jpeg", inspectJpeg], "image/png": ["png", inspectPng], "image/webp": ["webp", inspectWebp] };
const baseKeys = ["id", "projectId", "sha256", "bytes", "mimeType", "attribution"];
export function clientImageBase(value) { return Object.fromEntries(baseKeys.map((key) => [key, value[key]])); }
export function validateClientImageMetadata(value, { projectId, incomplete = false } = {}) {
  check(value && Object.keys(value).every((key) => [...baseKeys, "width", "height", "complete"].includes(key))
    && (value.complete === undefined || typeof value.complete === "boolean")
    && MANAGED_IMAGE_ID.test(value.id) && typeof value.projectId === "string" && value.projectId.length > 0 && value.projectId.length <= 100
    && (!projectId || value.projectId === projectId) && /^[a-f0-9]{64}$/.test(value.sha256)
    && Number.isSafeInteger(value.bytes) && value.bytes > 0 && value.bytes <= CLIENT_IMAGE_LIMITS.imageBytes && Object.hasOwn(mimes, value.mimeType)
    && typeof value.attribution === "string" && value.attribution.length <= 8000 && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value.attribution),
  409, "invalid_image_media", "Die Bilddatei ist nicht vollständig an Projekt, Quelle und Format gebunden.");
  const dimensions = Number.isSafeInteger(value.width) && Number.isSafeInteger(value.height) && value.width > 0 && value.height > 0
    && value.width * value.height <= CLIENT_IMAGE_LIMITS.pixels;
  check(dimensions || incomplete && value.complete === false && value.width === null && value.height === null,
    409, "invalid_image_media", "Die Bildabmessungen sind nicht vollständig geprüft.");
  return { ...clientImageBase(value), width: value.width, height: value.height };
}
export function verifyClientImageBytes(value, buffer) {
  const metadata = validateClientImageMetadata(value);
  check(Buffer.isBuffer(buffer) && buffer.length === metadata.bytes && digest(buffer) === metadata.sha256,
    409, "image_media_changed", "Die Bildbytes stimmen nicht mit ihrem Quellenbeleg überein.");
  const [format, inspect] = mimes[metadata.mimeType], header = inspect(buffer);
  check(header.valid && header.width === metadata.width && header.height === metadata.height,
    409, "invalid_image_media", "Bildformat und Abmessungen passen nicht zum Quellenbeleg.");
  return { metadata, format };
}
export async function inspectClientImage(buffer, { attribution = "", projectId, id = `image-${randomUUID()}`, decode = validateImageDecode, decodeOptions = {} } = {}) {
  check(Buffer.isBuffer(buffer) && buffer.length > 0 && buffer.length <= CLIENT_IMAGE_LIMITS.imageBytes,
    413, "image_media_size", "Bitte eine Bilddatei bis 20 MiB auswählen.");
  const candidate = Object.entries(mimes).map(([mimeType, [format, inspect]]) => ({ mimeType, format, header: inspect(buffer) })).find(({ header }) => header.valid);
  check(candidate, 400, "invalid_image_media", "Bitte eine gültige JPEG-, PNG- oder WebP-Datei auswählen.");
  const { width, height } = candidate.header;
  const metadata = validateClientImageMetadata({ id, projectId, sha256: digest(buffer), bytes: buffer.length, mimeType: candidate.mimeType, attribution, width, height });
  try { await decode(buffer, { ...decodeOptions, format: candidate.format }); }
  catch (error) { throw new ProjectError(400, "invalid_image_media", error.message); }
  return metadata;
}
export function referencedClientImages(data) {
  // Preserve the existing personal-client domain. Old Catalog1/Record1 public
  // media do not acquire a new local download or image-register requirement.
  const candidates = data?.type === "fn-species-page" || data?.type === "fn-species-record" && data.schemaVersion === 2
    ? imageRegistryReferences(data) : [];
  const found = new Map();
  for (const value of candidates.filter((entry) => MANAGED_IMAGE_ID.test(entry?.id || ""))) {
    const base = clientImageBase(value), previous = found.get(base.id);
    check(!previous || canonicalJson(previous) === canonicalJson(base), 409, "image_media_changed", "Dieselbe Bildkennung verweist auf unterschiedliche Quellenbelege.");
    found.set(base.id, base);
  }
  return [...found.values()];
}

/** Node-only media facade. All methods share the existing client queue; internal helpers never re-enter run(). */
export function createClientImageMedia({ run, store, capture, online, ensureOpen, authenticated, actionError,
  decode = validateImageDecode, decodeOptions = {}, mediaBudgetReader } = {}) {
  const same = (a, b) => canonicalJson(clientImageBase(a)) === canonicalJson(clientImageBase(b));
  function bindingStill(binding, role = false) {
    const current = capture();
    check(binding.id === current.id && (!role || binding.user.role === current.user.role), 409, "media_binding_changed", "Projekt, Person oder Berechtigung wurde während der Bildübernahme geändert.");
    return current;
  }
  async function budget(additionalBytes = 0) {
    const result = store.media.budget();
    if (!mediaBudgetReader) return { ...result, profileBudgetChecked: false };
    const supplied = await mediaBudgetReader({ additionalBytes });
    check(supplied && Number.isSafeInteger(supplied.totalBytes) && supplied.totalBytes >= 0,
      409, "image_media_budget_unavailable", "Die persönliche Sicherungsreserve konnte nicht verlässlich bestimmt werden.");
    check(supplied.totalBytes + additionalBytes <= CLIENT_IMAGE_LIMITS.profileBytes, 413, "image_media_quota", "Die Bilddatei würde den persönlichen Sicherungsrahmen überschreiten. Vorhandene Daten bleiben erhalten.");
    return { ...result, profileBudgetChecked: true, profileBytes: supplied.totalBytes, profileLimitBytes: CLIENT_IMAGE_LIMITS.profileBytes,
      remainingProfileBytes: Math.max(0, CLIENT_IMAGE_LIMITS.profileBytes - supplied.totalBytes) };
  }
  async function supported(binding) {
    const current = await online(); bindingStill(binding, true);
    const result = await authenticated("capabilities", { method: "GET" });
    check(result.status !== 404 && result.status === 200 && result.value?.managedImageMedia === 1,
      409, "image_media_server_required", "Der Projektdienst benötigt zuerst die verwaltete Bildablage. Es wurden keine Bildbytes übertragen.");
    check(result.value.projectId === current.projectId && result.value.user?.id === current.userId && result.value.user.role === current.user.role,
      409, "media_binding_changed", "Die Bildablage gehört nicht mehr zur geprüften Anmeldung.");
    return bindingStill(binding, true);
  }
  async function remoteMetadata(id, binding) {
    const result = await authenticated(`media/${id}`);
    if (result.status !== 200) throw actionError(result);
    const metadata = validateClientImageMetadata(result.value, { projectId: binding.projectId, incomplete: true });
    check(metadata.id === id, 409, "image_media_changed", "Der Dienst hat eine andere Bildkennung geliefert.");
    bindingStill(binding, true); return { metadata, complete: result.value.complete === true };
  }
  async function remember(id, binding) {
    const value = await remoteMetadata(id, binding);
    check(value.complete, 409, "image_media_incomplete", "Diese Bilddatei liegt auf dem Projektdienst noch nicht vollständig vor.");
    await budget(CLIENT_IMAGE_LIMITS.metadataReserve); ensureOpen(); bindingStill(binding, true);
    store.media.rememberRemote(binding.id, value.metadata); return value.metadata;
  }
  async function upload(reference, binding) {
    const local = store.media.get(binding.id, reference.id);
    check(local && same(local.metadata, reference), 409, "image_media_missing", "Die Bilddatei oder ihr geprüfter Quellenbeleg fehlt im persönlichen Bestand.");
    if (local.uploaded) return;
    check(local.buffer, 409, "image_media_missing", "Die noch nicht übertragene Bilddatei fehlt im persönlichen Bestand.");
    const { format } = verifyClientImageBytes(local.metadata, local.buffer); await decode(local.buffer, { ...decodeOptions, format });
    await supported(binding);
    check(["admin", "publisher", "contributor"].includes(binding.user.role), 403, "forbidden", "Für das Bereitstellen eines Bildes fehlt die Bearbeitungsberechtigung.");
    const { projectId: _projectId, ...intentMetadata } = clientImageBase(local.metadata);
    const intent = await authenticated("media", { method: "POST", data: { ...intentMetadata,
      expectedBinding: { projectId: binding.projectId, userId: binding.userId, role: binding.user.role } } });
    if (intent.status !== 200 && intent.status !== 201) throw actionError(intent);
    const observed = validateClientImageMetadata(intent.value, { projectId: binding.projectId, incomplete: true });
    check(same(observed, local.metadata), 409, "image_media_changed", "Der Dienst hat einen abweichenden Bildquellenbeleg geliefert.");
    if (intent.value.complete === true) check(observed.width === local.metadata.width && observed.height === local.metadata.height,
      409, "image_media_changed", "Die bestätigten Bildabmessungen passen nicht zur lokalen Datei.");
    if (intent.value.complete !== true) {
      bindingStill(binding, true);
      const completed = await authenticated(`media/${reference.id}/content`, { method: "PUT", buffer: local.buffer,
        headers: { "Content-Type": local.metadata.mimeType, "X-Shared-Project-Id": binding.projectId,
          "X-Shared-User-Id": binding.userId, "X-Shared-Role": binding.user.role } });
      if (completed.status !== 200 && completed.status !== 201) throw actionError(completed);
      const confirmed = validateClientImageMetadata(completed.value, { projectId: binding.projectId });
      check(completed.value.complete === true && same(confirmed, local.metadata) && confirmed.width === local.metadata.width && confirmed.height === local.metadata.height,
        409, "image_media_changed", "Die vollständige Bildübernahme wurde nicht eindeutig bestätigt.");
    }
    bindingStill(binding, true); ensureOpen(); store.media.markUploaded(binding.id, local.metadata);
  }
  return Object.freeze({
    api: Object.freeze({
      importImage({ buffer, attribution = "" } = {}) {
        const bytes = Buffer.isBuffer(buffer) ? Buffer.from(buffer) : buffer;
        return run(async () => {
          const binding = capture(); check(["admin", "publisher", "contributor"].includes(binding.user.role) && !binding.readOnly,
            403, "forbidden", "Für einen lokalen Bildimport fehlt die Bearbeitungsberechtigung.");
          const metadata = await inspectClientImage(bytes, { attribution, projectId: binding.projectId, decode, decodeOptions });
          await budget(store.media.admissionBytes(metadata, { buffer: true })); ensureOpen(); bindingStill(binding, true);
          return { ...store.media.save(binding.id, metadata, bytes), complete: true };
        });
      },
      readImage: (id) => run(async () => {
        const binding = capture(), local = store.media.get(binding.id, id);
        if (binding.readOnly) store.media.assertReadable(binding.id, id);
        check(local?.buffer, 404, "image_media_not_local", "Dieses Bild wurde auf diesem Gerät noch nicht heruntergeladen.");
        const { format } = verifyClientImageBytes(local.metadata, local.buffer); await decode(local.buffer, { ...decodeOptions, format });
        ensureOpen(); const current = bindingStill(binding);
        if (current.readOnly) store.media.assertReadable(current.id, id);
        return { ...local.metadata, buffer: Buffer.from(local.buffer) };
      }),
      describeImage: (id) => run(() => { const binding = capture(); if (binding.readOnly) store.media.assertReadable(binding.id, id); return store.media.describe(binding.id, id); }),
      refreshMetadata: (id) => run(async () => {
        check(MANAGED_IMAGE_ID.test(id), 400, "invalid_image_media", "Die Bildkennung ist ungültig.");
        const binding = capture(); await supported(binding); await remember(id, binding); return store.media.describe(binding.id, id);
      }),
      downloadImage: (id) => run(async () => {
        check(MANAGED_IMAGE_ID.test(id), 400, "invalid_image_media", "Die Bildkennung ist ungültig.");
        const binding = capture(); await supported(binding); const metadata = await remember(id, binding);
        const result = await authenticated(`media/${id}/content`, { responseType: "buffer", maxResponseBytes: CLIENT_IMAGE_LIMITS.imageBytes });
        if (result.status !== 200) throw actionError(result);
        check(result.headers?.get("content-type")?.split(";")[0].trim().toLowerCase() === metadata.mimeType
          && result.headers?.get("x-content-sha256") === metadata.sha256
          && (!result.headers?.has("content-length") || Number(result.headers.get("content-length")) === metadata.bytes),
        409, "image_media_changed", "Die Bildantwort besitzt keine passende Format- und Quellenbindung.");
        const { format } = verifyClientImageBytes(metadata, result.value); await decode(result.value, { ...decodeOptions, format });
        await budget(store.media.admissionBytes(metadata, { buffer: true })); ensureOpen(); bindingStill(binding, true);
        store.media.save(binding.id, metadata, result.value, { uploaded: true }); return { ...metadata, complete: true };
      }),
      budget: () => run(() => budget()),
    }),
    requireReferences(data) {
      const binding = capture();
      for (const reference of referencedClientImages(data)) {
        const local = store.media.get(binding.id, reference.id);
        check(local && same(local.metadata, reference) && (local.buffer || local.uploaded), 409, "image_media_missing",
          "Eine neue Bildverwendung benötigt ihre lokale Datei oder einen bereits bestätigten Serverbeleg.");
      }
    },
    async ensureReferences(data) {
      const references = referencedClientImages(data); if (!references.length) return;
      const binding = capture();
      for (const reference of references) {
        if (!store.media.get(binding.id, reference.id)) { await supported(binding); await remember(reference.id, binding); }
        await upload(reference, binding);
      }
    },
  });
}
