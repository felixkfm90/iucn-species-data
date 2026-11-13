import { BUNDLED_SPECIES_SOURCE } from "./bundled.mjs";
import { decodePublicAppCatalogManifest, decodePublicAppCatalogPayload, PUBLIC_APP_CATALOG_MANIFEST_MAX_BYTES } from "./public-app-catalog.mjs";

const manifestUrl = new URL("https://felixkfm90.github.io/iucn-species-data/mobile/catalog/manifest.json");
const bundled = Object.freeze({ kind: "bundled-catalog" });

async function download(fetchImpl, url, maximumBytes) {
  const response = await fetchImpl(url, { redirect: "manual", credentials: "omit", signal: AbortSignal.timeout(6000),
    headers: { Accept: "application/json" } });
  if (response.status === 404) { await response.body?.cancel(); return null; }
  if (!response.ok || response.url && response.url !== url.href || !response.body) {
    await response.body?.cancel();
    throw new Error("Die öffentliche Katalogdatei ist unter der erwarteten Adresse nicht abrufbar.");
  }
  const reader = response.body.getReader(), chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > maximumBytes) throw new Error("Die öffentliche Katalogdatei überschreitet ihre Größenbegrenzung.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks, bytes);
}

/** Use the published app release only after verifying its hash, structure and public addresses. */
export async function readWorkingEditorialRelease(fetchImpl = globalThis.fetch) {
  let manifestBytes;
  try { manifestBytes = await download(fetchImpl, manifestUrl, PUBLIC_APP_CATALOG_MANIFEST_MAX_BYTES); }
  catch (error) {
    if (error?.name === "TimeoutError" || error instanceof TypeError) return bundled;
    throw error;
  }
  if (!manifestBytes) return bundled;
  const manifest = decodePublicAppCatalogManifest(manifestBytes);
  if (manifest.generatedAt <= BUNDLED_SPECIES_SOURCE.generatedAt) return bundled;
  const bytes = await download(fetchImpl, new URL(`${manifest.catalogSha256}.json`, manifestUrl), manifest.catalogBytes);
  const payload = bytes && new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  const source = { kind: "public-release", manifest, payload };
  validateWorkingEditorialRelease(source);
  return source;
}

export function validateWorkingEditorialRelease(source) {
  if (source?.kind === "bundled-catalog" && Object.keys(source).length === 1) return null;
  if (source?.kind !== "public-release" || Object.keys(source).length !== 3 || typeof source.payload !== "string") {
    throw new Error("Die verwendete öffentliche Katalogfassung ist nicht eindeutig gebunden.");
  }
  const manifest = decodePublicAppCatalogManifest(Buffer.from(JSON.stringify(source.manifest)));
  if (manifest.generatedAt <= BUNDLED_SPECIES_SOURCE.generatedAt) throw new Error("Die gespeicherte Katalogfassung ist älter als der Anfangsbestand.");
  return decodePublicAppCatalogPayload(Buffer.from(source.payload), manifest);
}

export function workingEditorialProvenance(source) {
  const metadata = source?.kind === "public-release" ? source.manifest : source?.kind === "bundled-catalog" ? BUNDLED_SPECIES_SOURCE : null;
  if (!metadata) return null;
  return { kind: source.kind, generatedAt: metadata.generatedAt, speciesCount: metadata.speciesCount };
}
