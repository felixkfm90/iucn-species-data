import { check } from "./errors.mjs";

function text(value, max = 1000, empty = false) {
  check(typeof value === "string" && value.length <= max && (empty || value.trim().length > 0)
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value), 400, "invalid_catalog", "Ungültiger Katalogtext.");
  return value;
}
function fields(value, allowed) {
  check(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).every((key) => allowed.includes(key)), 400, "invalid_catalog", "Unzulässiges Katalogfeld.");
}
function https(value) {
  text(value, 2048);
  let url;
  try { url = new URL(value); } catch { /* handled below */ }
  check(url && url.protocol === "https:" && !url.username && !url.password && !url.hash,
    400, "invalid_catalog", "Katalogadressen müssen öffentliche HTTPS-Adressen ohne Zugangsdaten sein.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  check(host.includes(".") && !host.includes(":") && !/^\d+(?:\.\d+){3}$/.test(host)
    && !["localhost", "local", "internal", "test", "invalid"].some((suffix) => host === suffix || host.endsWith(`.${suffix}`)),
  400, "invalid_catalog", "Lokale Adressen gehören nicht in den Katalog.");
  // Signed/private URLs would disclose their authorization to every reader.
  check(![...url.searchParams.keys()].some((key) => /token|secret|password|credential|signature|x-amz|x-goog/i.test(key)),
    400, "invalid_catalog", "Private Freigabeparameter gehören nicht in den Katalog.");
  return value;
}
export function validatePublicCatalogUrl(value) { return https(value); }
function unique(values, label) {
  check(new Set(values).size === values.length, 400, "invalid_catalog", `${label} müssen eindeutig sein.`);
}
function media(value, gallery = false) {
  fields(value, ["id", "url", "bytes", "sha256", "mimeType", "attribution", ...(gallery ? ["alt", "caption", "order"] : [])]);
  const result = { id: text(value.id, 160), url: https(value.url) };
  check(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(result.id), 400, "invalid_catalog", "Ungültige Medienkennung.");
  if (value.bytes !== undefined) {
    check(Number.isSafeInteger(value.bytes) && value.bytes >= 0, 400, "invalid_catalog", "Ungültige Dateigröße.");
    result.bytes = value.bytes;
  }
  if (value.sha256 !== undefined) {
    check(typeof value.sha256 === "string" && /^[a-f0-9]{64}$/.test(value.sha256), 400, "invalid_catalog", "Ungültige Medienprüfsumme.");
    result.sha256 = value.sha256;
  }
  if (value.mimeType !== undefined) {
    check(typeof value.mimeType === "string" && /^(image|audio)\/[a-zA-Z0-9.+-]{1,80}$/.test(value.mimeType),
      400, "invalid_catalog", "Ungültiger Medientyp.");
    result.mimeType = value.mimeType;
  }
  if (value.attribution !== undefined) result.attribution = text(value.attribution, 8000, true);
  if (gallery) {
    result.alt = text(value.alt ?? "", 3000, true);
    result.caption = text(value.caption ?? "", 3000, true);
    check(Number.isSafeInteger(value.order) && value.order >= 0, 400, "invalid_catalog", "Ungültige Bildreihenfolge.");
    result.order = value.order;
  }
  return result;
}

export function validateCatalogSpecies(value, expectedId) {
  fields(value, ["id", "scientificName", "commonName", "taxonomy", "sections", "websiteUrl", "media"]);
  const id = text(value.id, 120);
  check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && (!expectedId || id === expectedId),
    400, "invalid_catalog", "Die Artkennung muss dem bestehenden Slug entsprechen.");
  check(Array.isArray(value.taxonomy) && value.taxonomy.length <= 30 && Array.isArray(value.sections)
    && value.sections.length <= 100, 400, "invalid_catalog", "Ungültige Taxonomie oder Textabschnitte.");
  const result = { id, scientificName: text(value.scientificName, 300), commonName: text(value.commonName, 300, true),
    taxonomy: value.taxonomy.map((entry) => { fields(entry, ["rank", "name"]); return { rank: text(entry.rank, 80), name: text(entry.name, 300) }; }),
    sections: value.sections.map((entry) => {
      fields(entry, ["id", "title", "text", "intentionallyEmpty"]);
      check(typeof entry.intentionallyEmpty === "boolean", 400, "invalid_catalog", "Fehlende Leerabschnittsentscheidung.");
      const section = { id: text(entry.id, 120), title: text(entry.title, 300), text: text(entry.text, 100000, true), intentionallyEmpty: entry.intentionallyEmpty };
      check(!section.intentionallyEmpty || section.text.trim() === "", 400, "invalid_catalog", "Ein bewusst leerer Abschnitt enthält Text.");
      return section;
    }), media: { sounds: [], gallery: [] } };
  if (value.websiteUrl !== undefined) result.websiteUrl = https(value.websiteUrl);
  fields(value.media, ["portrait", "map", "sounds", "gallery"]);
  for (const key of ["portrait", "map"]) if (value.media[key] !== undefined) result.media[key] = media(value.media[key]);
  for (const key of ["sounds", "gallery"]) {
    const entries = value.media[key] ?? [];
    check(Array.isArray(entries) && entries.length <= 500, 400, "invalid_catalog", "Zu viele Medien.");
    result.media[key] = entries.map((entry) => media(entry, key === "gallery"));
  }
  result.media.gallery.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  unique(result.sections.map((entry) => entry.id), "Abschnittskennungen");
  unique([...Object.values(result.media).flat()].map((entry) => entry.id), "Medienkennungen");
  return result;
}

export function buildCatalog({ revision, generatedAt = new Date().toISOString(), species }) {
  check((typeof revision === "string" || Number.isSafeInteger(revision)) && String(revision).length > 0
    && String(revision).length <= 120 && typeof generatedAt === "string"
    && !Number.isNaN(Date.parse(generatedAt)) && new Date(generatedAt).toISOString() === generatedAt
    && Array.isArray(species) && species.length <= 100000, 400, "invalid_catalog", "Ungültiger Katalogkopf.");
  const entries = species.map((entry) => validateCatalogSpecies(entry));
  unique(entries.map((entry) => entry.id), "Artkennungen");
  return { schemaVersion: 1, revision: String(revision), generatedAt,
    species: entries.sort((a, b) => a.id.localeCompare(b.id)) };
}
