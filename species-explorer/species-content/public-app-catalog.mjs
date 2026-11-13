import { createHash } from "node:crypto";
import { validateCatalogSpecies } from "../shared-project/catalog.mjs";
import { PAGES_ASSET_BASE } from "./export.mjs";

const websiteOrigin = "https://www.fnwildlifetravel.de";
const galleryOrigin = "https://images.squarespace-cdn.com";
const galleryPrefix = "/content/v1/67556be0338df718ea064210/";
const assetBase = new URL(`${PAGES_ASSET_BASE}/`);
export const PUBLIC_CATALOG_RAW_BASE = "https://raw.githubusercontent.com/felixkfm90/iucn-species-data/";
const rawAssetBase = new URL(PUBLIC_CATALOG_RAW_BASE);
const maxMediaBytes = 32 * 1024 * 1024;
const catalogDigest = /^[a-f0-9]{64}$/u;
export const PUBLIC_APP_CATALOG_MANIFEST_MAX_BYTES = 4096;
export const PUBLIC_APP_CATALOG_MAX_BYTES = 16 * 1024 * 1024;

function requirePublic(condition, reason) {
  if (!condition) throw new Error(`Ungültiger öffentlicher App-Katalog: ${reason}.`);
}

function decodeJson(bytes, message) {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)); }
  catch { throw new Error(message); }
}

function validateManifest(manifest) {
  if (!manifest || Object.keys(manifest).length !== 7 || manifest.schemaVersion !== 1 || manifest.kind !== "fn-public-catalog"
      || typeof manifest.catalogSha256 !== "string" || !catalogDigest.test(manifest.catalogSha256)
      || typeof manifest.revision !== "string" || !catalogDigest.test(manifest.revision)
      || typeof manifest.generatedAt !== "string" || !Number.isFinite(Date.parse(manifest.generatedAt))
      || new Date(manifest.generatedAt).toISOString() !== manifest.generatedAt
      || !Number.isSafeInteger(manifest.catalogBytes) || manifest.catalogBytes < 1 || manifest.catalogBytes > PUBLIC_APP_CATALOG_MAX_BYTES
      || !Number.isSafeInteger(manifest.speciesCount) || manifest.speciesCount < 1 || manifest.speciesCount > 20_000) {
    throw new Error("Ungültige Freigabedatei des öffentlichen App-Katalogs.");
  }
}

export function decodePublicAppCatalogManifest(bytes) {
  const message = "Ungültige Freigabedatei des öffentlichen App-Katalogs.";
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > PUBLIC_APP_CATALOG_MANIFEST_MAX_BYTES) throw new Error(message);
  const manifest = decodeJson(bytes, message);
  validateManifest(manifest);
  return manifest;
}

export function decodePublicAppCatalogPayload(bytes, manifest) {
  validateManifest(manifest);
  if (!(bytes instanceof Uint8Array) || bytes.length !== manifest.catalogBytes
      || createHash("sha256").update(bytes).digest("hex") !== manifest.catalogSha256) {
    throw new Error("Die öffentliche Katalogdatei weicht von ihrer Freigabedatei ab.");
  }
  const catalog = decodeJson(bytes, "Die öffentliche Katalogdatei ist kein gültiges UTF-8-JSON.");
  if (catalog?.schemaVersion !== 1 || Object.hasOwn(catalog, "projectId") || catalog.revision !== manifest.revision
      || catalog.generatedAt !== manifest.generatedAt || !Array.isArray(catalog.species) || catalog.species.length !== manifest.speciesCount) {
    throw new Error("Der öffentliche App-Katalog passt nicht zur Freigabedatei.");
  }
  validatePublicAppCatalog(catalog);
  return catalog;
}

function safePathSegment(segment) {
  try {
    const name = decodeURIComponent(segment);
    return name !== "." && name !== ".." && !/[\\/\u0000-\u001f\u007f]/u.test(name);
  } catch { return false; }
}

function verifyGalleryAddress({ url: address }) {
  const url = new URL(address);
  const query = [...url.searchParams];
  requirePublic(url.origin === galleryOrigin && url.pathname.startsWith(galleryPrefix)
    && /.+\.(?:jpe?g|png|webp)$/iu.test(url.pathname.slice(galleryPrefix.length))
    && url.pathname.split("/").every(safePathSegment)
    && (query.length === 0 || query.length === 1 && query[0][0] === "format" && /^\d{2,4}w$/u.test(query[0][1])),
  "Galeriequelle gehört nicht zur öffentlichen FN-Medienbibliothek");
}

export function publicCatalogAssetLocation(address) {
  const url = new URL(address);
  if (url.href.includes("?") || url.href.includes("#") || url.username || url.password) return null;
  let suffix, commit;
  if (url.origin === assetBase.origin && url.pathname.startsWith(assetBase.pathname)) {
    suffix = url.pathname.slice(assetBase.pathname.length).split("/");
  } else if (url.origin === rawAssetBase.origin && url.pathname.startsWith(rawAssetBase.pathname)) {
    const [rawCommit, directory, ...files] = url.pathname.slice(rawAssetBase.pathname.length).split("/");
    if (!/^[a-f0-9]{40}$/u.test(rawCommit) || directory !== "species-assets") return null;
    commit = rawCommit;
    suffix = files;
  } else return null;
  const [folder, filename] = suffix;
  return suffix.length === 2 && folder && safePathSegment(folder) ? { folder, filename, commit } : null;
}

function verifyAsset(asset, filename) {
  const location = publicCatalogAssetLocation(asset.url);
  requirePublic(location?.filename === filename
    && /^[a-f0-9]{64}$/u.test(asset.sha256 ?? "") && Number.isSafeInteger(asset.bytes)
    && asset.bytes > 0 && asset.bytes <= maxMediaBytes, "Artmedium hat keinen passenden öffentlichen Pfad oder Dateibeleg");
  return location;
}

/** Check the public-only app payload both at export and before Pages deployment. */
export function validatePublicAppCatalog(catalog) {
  requirePublic(catalog && Object.keys(catalog).length === 4 && catalog.schemaVersion === 1
    && Array.isArray(catalog.species) && catalog.species.length > 0 && catalog.species.length <= 20_000
    && typeof catalog.generatedAt === "string" && Number.isFinite(Date.parse(catalog.generatedAt))
    && new Date(catalog.generatedAt).toISOString() === catalog.generatedAt, "ungültiger Katalogkopf");
  const revision = createHash("sha256").update(`${JSON.stringify(catalog.species)}\n`).digest("hex");
  requirePublic(catalog.revision === revision, "Revision passt nicht zu den Artdaten");

  const ids = new Set();
  for (const entry of catalog.species) {
    requirePublic(entry?.media && Array.isArray(entry.media.sounds) && Array.isArray(entry.media.gallery),
      "fehlende oder ungültige Mediengruppen");
    const { spectrogram, ...media } = entry.media;
    let validationMedia = media;
    if (spectrogram !== undefined) {
      requirePublic(spectrogram && typeof spectrogram === "object" && media.sounds.length > 0,
        "Spektrogramm ohne Aufnahme");
      const { alt, ...asset } = spectrogram;
      requirePublic(alt === undefined || typeof alt === "string" && alt.length <= 3000
        && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(alt), "ungültiger Spektrogramm-Alternativtext");
      validationMedia = { ...media, sounds: [...media.sounds, asset] };
    }
    try { validateCatalogSpecies({ ...entry, media: validationMedia }); }
    catch { requirePublic(false, "ungültige Artfelder oder private Medienreferenzen"); }

    requirePublic(typeof entry.websiteUrl === "string", "öffentliche Artseite fehlt");
    const page = new URL(entry.websiteUrl);
    requirePublic(!ids.has(entry.id) && page.origin === websiteOrigin && !page.search
      && page.pathname.startsWith("/wildlife/") && page.pathname.split("/").at(-1) === entry.id,
    "Artseite ist falsch zugeordnet oder Artkennung mehrfach vorhanden");
    ids.add(entry.id);
    for (const photo of media.gallery) verifyGalleryAddress(photo);
    if (media.portrait) verifyAsset(media.portrait, "portrait.webp");
    if (media.map) verifyAsset(media.map, "map.jpg");
    for (const sound of media.sounds) verifyAsset(sound, "sound.mp3");
    if (spectrogram) {
      const location = verifyAsset(spectrogram, "spectrogram.webp");
      requirePublic(publicCatalogAssetLocation(media.sounds[0].url).folder === location.folder,
        "Spektrogramm ist der Aufnahme nicht zugeordnet");
    }
  }
}
