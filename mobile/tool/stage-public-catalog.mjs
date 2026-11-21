import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual, promisify } from "node:util";
import { tmpdir } from "../../scripts/test-temp.mjs";
import { BUNDLED_SPECIES_SOURCE, readBundledSpeciesCatalog } from "../../species-explorer/species-content/bundled.mjs";
import { captureSpeciesPages } from "../../species-explorer/species-content/capture.mjs";
import { exportSpeciesCatalog, PAGES_ASSET_BASE, selectSpeciesPageUrls } from "../../species-explorer/species-content/export.mjs";
import { decodePublicAppCatalogManifest, decodePublicAppCatalogPayload, PUBLIC_APP_CATALOG_MANIFEST_MAX_BYTES,
  PUBLIC_APP_CATALOG_MAX_BYTES, PUBLIC_CATALOG_RAW_BASE, publicCatalogAssetLocation, validatePublicAppCatalog }
  from "../../species-explorer/species-content/public-app-catalog.mjs";
import { validateSpeciesSnapshot } from "../../species-explorer/species-content/validate.mjs";
import { createWebsiteSpeciesPagesService } from "../../species-explorer/website-species-pages.mjs";
import { observeWebsitePublicHtmlIdentity, parseWebsiteEditorialPage, parseWebsiteSpeciesOverviewCard,
  websiteCrawlerExcluded } from "../../species-explorer/website-alt-parser.mjs";
import { sanitizeAssetName } from "../../species-explorer/species-model.mjs";
import { normalizeMobileCatalogGeneral, reviewedMobileCatalog } from "./catalog-editorial.mjs";

const pagesRoot = new URL("../", `${PAGES_ASSET_BASE}/`);
const manifestUrl = new URL("mobile/catalog/manifest.json", pagesRoot);
const repo = fileURLToPath(new URL("../../", import.meta.url));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const catalogDigest = /^[a-f0-9]{64}$/u;
const gitCommit = /^[a-f0-9]{40}$/u;
const jsonBytes = value => Buffer.from(`${JSON.stringify(value)}\n`);
const coreMedia = media => [media.portrait, media.map, ...media.sounds, media.spectrogram].filter(Boolean);
const execGit = promisify(execFile);
const websiteOrigin = "https://www.fnwildlifetravel.de";
const regionPath = /^\/wildlife\/[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const candidateSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

async function readGit(args, maxBuffer = 16 * 1024) {
  const { stdout } = await execGit("git", args, { cwd: repo, windowsHide: true, timeout: 10_000, encoding: "buffer", maxBuffer });
  return stdout;
}

export function selectPublicCatalogSpecies(speciesData, sitemapPages, baseline) {
  assert.ok(Array.isArray(speciesData) && speciesData.length > 0, "Die veröffentlichte Artendatei ist leer oder ungültig.");
  const sourceIds = new Set(speciesData.map(record => record?.URLSlug));
  assert.ok(sourceIds.size === speciesData.length && [...sourceIds].every(id => typeof id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id)),
    "Ungültige oder doppelte Artkennungen in der veröffentlichten Artendatei.");
  const previous = new Set(baseline.species.map(entry => entry.id));
  const { selected, issues } = selectSpeciesPageUrls(speciesData, [], sitemapPages);
  const pending = [], blocked = [];
  for (const issue of issues) {
    if (issue.code === "missing-species-page" && !previous.has(issue.slug)) pending.push(issue.slug);
    else blocked.push(issue);
  }
  for (const slug of previous) {
    if (!sourceIds.has(slug)) blocked.push({ code: "previous-public-species-missing-from-data", slug });
  }
  assert.deepEqual(blocked, [], "Der zuletzt veröffentlichte Bestand oder eine neue Seitenzuordnung ist nicht eindeutig bestätigt.");
  assert.ok(selected.size > 0, "Keine öffentlich bestätigte Art für den App-Katalog vorhanden.");
  return { selected, speciesData: speciesData.filter(record => selected.has(record.URLSlug)), pending: pending.sort() };
}

function decidePublicCatalogRelease(catalog, baseline) {
  const previous = new Map(baseline.catalog.species.map(entry => [entry.id, entry]));
  const addedSpecies = [], changedSpecies = [];
  for (const entry of catalog.species) {
    const existing = previous.get(entry.id);
    if (!existing) addedSpecies.push(entry.id);
    else if (!isDeepStrictEqual(entry, existing)) changedSpecies.push(entry.id);
    previous.delete(entry.id);
  }
  assert.deepEqual([...previous.keys()].sort(), [], "Bereits erfasste Arten fehlen im geprüften App-Katalog.");
  const status = baseline.source === "published" && addedSpecies.length === 0 && changedSpecies.length === 0
    ? "unchanged" : "candidate";
  if (status === "candidate") {
    assert.ok(Date.parse(catalog.generatedAt) > Date.parse(baseline.catalog.generatedAt),
      "Der geänderte App-Katalog muss neuer als die veröffentlichte Fassung sein.");
  }
  return { status, addedSpecies: addedSpecies.sort(), changedSpecies: changedSpecies.sort(),
    baseline: { source: baseline.source, sha256: baseline.sha256, revision: baseline.catalog.revision,
      generatedAt: baseline.catalog.generatedAt, speciesCount: baseline.catalog.species.length } };
}

function pinCatalogMedia(catalog, commit, baseline) {
  assert.ok(typeof commit === "string" && gitCommit.test(commit), "Die vollständige Git-Kennung für den App-Medienstand fehlt.");
  const previous = new Map(baseline?.catalog.species.map(entry => [entry.id, entry.media]));
  const pinned = [];
  for (const entry of catalog.species) {
    const oldMedia = previous.get(entry.id);
    const oldFiles = new Map(oldMedia && coreMedia(oldMedia).map(file => [file.id, file]));
    for (const file of coreMedia(entry.media)) {
      const current = publicCatalogAssetLocation(file.url);
      assert.ok(current && !current.commit, "Nur die geprüften öffentlichen Pages-Medien dürfen fest gebunden werden.");
      const old = oldFiles.get(file.id);
      const oldLocation = old && publicCatalogAssetLocation(old.url);
      const reuse = oldLocation?.commit && oldLocation.folder === current.folder && oldLocation.filename === current.filename
        && old.sha256 === file.sha256 && old.bytes === file.bytes && old.mimeType === file.mimeType;
      file.url = reuse ? old.url : `${PUBLIC_CATALOG_RAW_BASE}${commit}/species-assets/${current.folder}/${current.filename}`;
      pinned.push({ media: { ...file, pinned: true }, reused: Boolean(reuse),
        sameAttribution: reuse && old.attribution === file.attribution });
    }
  }
  return pinned;
}

export async function buildPublicCatalogRelease({ snapshot, speciesData, pages, mediaRegistry, missingMediaReport, verifyMedia, baseline, commit,
  verifyGalleryPhoto, verifyUnchangedMedia = true }) {
  const parity = await validateSpeciesSnapshot({ snapshot, speciesData, pages, missingMediaReport });
  assert.ok(parity.passed && parity.sourcePagesChecked === speciesData.length,
    `Der öffentliche Katalog weicht von seinen Quellen ab: ${JSON.stringify(parity.issues)}`);
  const { catalog, changes } = reviewedMobileCatalog(snapshot.catalog);
  normalizeMobileCatalogGeneral(catalog, speciesData);
  const evidence = new Map(snapshot.results.map(row => [row.slug, row.evidence]));
  const assetFolders = new Map(speciesData.map(row => [row.URLSlug, sanitizeAssetName(row["Deutscher Name"])]));
  const publicMedia = [], metadataFiles = [];
  let spectrograms = 0;
  for (const entry of catalog.species) {
    const { media } = entry;
    const core = coreMedia(media);
    publicMedia.push(...core.map(file => ({ ...file })));
    const files = evidence.get(entry.id).assetFiles;
    const folder = assetFolders.get(entry.id);
    for (const filename of ["portrait.json", "credits.json"]) {
      const metadata = files.find(file => file.path === `${folder}/${filename}`);
      if (metadata) {
        const associated = filename === "portrait.json" ? media.portrait : media.sounds[0];
        metadataFiles.push({ file: { id: `${entry.id}:${filename}`, url: `${PAGES_ASSET_BASE}/${encodeURIComponent(folder)}/${filename}`,
          bytes: metadata.bytes, sha256: metadata.sha256, mimeType: "application/json" }, assetUrl: associated?.url });
      }
    }
    const [sound] = media.sounds;
    const spectrum = files.find(file => file.role === "derived-spectrogram-not-in-v1-media-schema");
    if (!spectrum) continue;
    assert.ok(sound, `Spektrogramm ohne Aufnahme: ${entry.id}`);
    const soundUrl = new URL(sound.url);
    const binding = mediaRegistry.assets?.[folder]?.spectrogram;
    assert.ok(spectrum.path === `${folder}/spectrogram.webp` && spectrum.bytes > 0 && spectrum.bytes <= 512 * 1024
      && binding?.stale === false && binding.soundSha256 === sound.sha256 && binding.spectrogramSha256 === spectrum.sha256,
    `Spektrogramm und Aufnahme stimmen nicht mit dem öffentlichen Register überein: ${entry.id}`);
    media.spectrogram = { id: `${entry.id}:spectrogram`, url: new URL("spectrogram.webp", soundUrl).href,
      bytes: spectrum.bytes, sha256: spectrum.sha256, mimeType: "image/webp", alt: "Spektrogramm der Tierstimme" };
    publicMedia.push({ ...media.spectrogram });
    spectrograms++;
  }
  const pinned = commit === undefined ? [] : pinCatalogMedia(catalog, commit, baseline);
  catalog.revision = digest(jsonBytes(catalog.species));
  validatePublicAppCatalog(catalog);
  const decision = baseline ? decidePublicCatalogRelease(catalog, baseline) : null;
  const incremental = !verifyUnchangedMedia && baseline?.source === "published" && commit !== undefined;
  const checkedPins = pinned.filter(({ reused }) => !incremental || !reused).map(({ media }) => media);
  const reusedUrls = new Map(pinned.filter(({ reused }) => incremental && reused)
    .map(({ media, sameAttribution }) => {
      const { folder, filename } = publicCatalogAssetLocation(media.url);
      return [`${folder}/${filename}`, { sameAttribution }];
    }));
  const reusedFile = url => {
    if (!url) return undefined;
    const { folder, filename } = publicCatalogAssetLocation(url);
    return reusedUrls.get(`${folder}/${filename}`);
  };
  const checkedPublic = publicMedia.filter(file => !reusedFile(file.url));
  const checkedMetadata = metadataFiles.filter(({ assetUrl }) => !reusedFile(assetUrl)?.sameAttribution).map(({ file }) => file);
  assert.ok([...publicMedia, ...metadataFiles.map(({ file }) => file)].every(media =>
    catalogDigest.test(media.sha256 ?? "") && Number.isSafeInteger(media.bytes)
    && media.bytes > 0 && media.bytes <= 32 * 1024 * 1024), "Ungültiger Größen- oder Hashbeleg für eine öffentliche Mediendatei.");
  const mediaChecks = [...checkedPublic, ...checkedMetadata, ...checkedPins];
  await verifyInParallel(mediaChecks, verifyMedia);
  const galleryChecks = verifyGalleryPhoto ? changedGalleryUrls(catalog, incremental ? baseline.catalog : null) : [];
  await verifyInParallel(galleryChecks, verifyGalleryPhoto);
  const bytes = jsonBytes(catalog);
  assert.ok(bytes.length <= PUBLIC_APP_CATALOG_MAX_BYTES && catalog.species.length > 0 && catalog.species.length <= 20_000,
    "Der öffentliche Katalog überschreitet das App-Format.");
  const checks = { parity, editorialCorrections: changes, publishedMediaChecked: checkedPublic.length,
    publishedMetadataChecked: checkedMetadata.length, pinnedMediaChecked: checkedPins.length,
    reusedMedia: publicMedia.length - checkedPublic.length, gallerySourcesChecked: galleryChecks.length, spectrograms };
  if (decision?.status === "unchanged") return { bytes: null, manifest: null, decision, ...checks };
  const manifest = { schemaVersion: 1, kind: "fn-public-catalog", catalogSha256: digest(bytes),
    catalogBytes: bytes.length, revision: catalog.revision, generatedAt: catalog.generatedAt, speciesCount: catalog.species.length };
  return { bytes, manifest, decision, ...checks };
}

async function verifyInParallel(files, check) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, files.length) }, async () => {
    while (next < files.length) await check(files[next++]);
  }));
}

function changedGalleryUrls(catalog, previous) {
  const phoneUrls = value => new Set(value.species.flatMap(({ media }) => media.gallery.map(photo => {
    const url = new URL(photo.url);
    url.searchParams.set("format", "750w");
    return url.href;
  })));
  const known = previous ? phoneUrls(previous) : new Set();
  return [...phoneUrls(catalog)].filter(url => !known.has(url));
}

export async function fetchPublicCatalogSource(url, options, fetchImpl = globalThis.fetch) {
  const retryDelays = [0, 750, 2_000];
  for (const [index, delay] of retryDelays.entries()) {
    if (delay) await wait(delay, undefined, { signal: options.signal });
    const lastAttempt = index === retryDelays.length - 1;
    try {
      const response = await fetchImpl(url, options);
      if (lastAttempt || ![408, 429, 500, 502, 503, 504].includes(response.status)) return response;
      await response.body?.cancel().catch(() => {});
    } catch (error) {
      const networkFailure = error instanceof TypeError && ["ECONNRESET", "EAI_AGAIN", "ETIMEDOUT", "UND_ERR_SOCKET",
        "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT"].includes(error.cause?.code);
      if (lastAttempt || !networkFailure || options.signal?.aborted) throw error;
    }
  }
}

async function readPublic(url, maxBytes, type, { fetchImpl = globalThis.fetch, allowMissing = false, pinned = false } = {}) {
  const accepted = Array.isArray(type) ? [...type] : type === "audio/mpeg" ? ["audio/mpeg", "audio/mp3"] : [type];
  if (pinned) accepted.push("application/octet-stream");
  const response = await fetchPublicCatalogSource(url, { redirect: "error", credentials: "omit", signal: AbortSignal.timeout(20_000),
    headers: { Accept: accepted.join(", "), "Cache-Control": "no-cache" } }, fetchImpl);
  const reader = response.body?.getReader(), chunks = [];
  let length = 0;
  try {
    assert.ok(!response.redirected && (!response.url || response.url === String(url)),
      `Unerwartete Weiterleitung beim öffentlichen Abruf: ${url}`);
    if (allowMissing && response.status === 404 && !response.headers.has("location")) return null;
    assert.equal(response.status, 200, `Öffentlicher Abruf fehlgeschlagen: ${url}`);
    assert.ok(reader, `Öffentliche Datei fehlt: ${url}`);
    assert.ok(accepted.includes(response.headers.get("content-type")?.split(";")[0]), `Unerwarteter Dateityp: ${url}`);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      assert.ok(length <= maxBytes, `Öffentliche Datei überschreitet die erwartete Größe: ${url}`);
      chunks.push(value);
    }
  } finally { await reader?.cancel().catch(() => {}); }
  return Buffer.concat(chunks, length);
}

// A native, public regional card is an independent proof of publication while the sitemap lags.
// A robots exclusion always wins over this optional secondary source.
export async function verifyRegionalCatalogAdditions(sitemapPages, pending, { fetchImpl = globalThis.fetch } = {}) {
  const found = new Map();
  if (!pending.length || pending.length > 24 || !pending.every(slug => typeof slug === "string" && slug.length <= 120 && candidateSlug.test(slug))) return found;
  const overviewUrls = [...new Set(sitemapPages.flatMap(({ url }) => {
    const candidate = new URL(url), parent = candidate.pathname.slice(0, candidate.pathname.lastIndexOf("/"));
    return candidate.origin === websiteOrigin && regionPath.test(parent) ? [`${websiteOrigin}${parent}`] : [];
  }))];
  if (!overviewUrls.length || overviewUrls.length > 12) return found;
  let disallowed;
  try {
    const robots = (await readPublic(`${websiteOrigin}/robots.txt`, 64 * 1024, "text/plain", { fetchImpl })).toString("utf8");
    disallowed = robots.split(/\r?\n/u).flatMap(line => {
      const path = /^\s*disallow\s*:\s*(\/[^\s#]*)/iu.exec(line)?.[1];
      return path ? [path] : [];
    });
  } catch { return found; }
  const mayRead = url => !disallowed.some(pattern => {
    const pathname = new URL(url).pathname, anchored = pattern.endsWith("$");
    const [prefix, ...middle] = (anchored ? pattern.slice(0, -1) : pattern).split("*");
    if (!pathname.startsWith(prefix)) return false;
    if (anchored && !middle.length) return pathname === prefix;
    const suffix = anchored ? middle.pop() : "";
    if (!pathname.endsWith(suffix)) return false;
    const limit = pathname.length - suffix.length;
    let offset = prefix.length;
    for (const part of middle) {
      const position = pathname.indexOf(part, offset);
      if (position === -1) return false;
      offset = position + part.length;
    }
    return offset <= limit;
  });
  const eligible = overviewUrls.filter(mayRead);
  const regionalFetch = async (url, options) => {
    const response = await fetchPublicCatalogSource(url, { ...options, credentials: "omit" }, fetchImpl);
    if (response.redirected || response.url && response.url !== String(url) || websiteCrawlerExcluded(response.headers.get("x-robots-tag"))) {
      await response.body?.cancel().catch(() => {});
      throw new Error("Die Adresse besitzt keine eindeutige frei erreichbare Seite.");
    }
    return response;
  };
  const overviews = await captureSpeciesPages(new Map(eligible.map(url => [url, url])), { fetchImpl: regionalFetch });
  if (overviews.issues.length) return found;
  const candidates = new Map(pending.map(slug => [slug, []]));
  for (const { url: overviewUrl, html } of overviews.pages.values()) {
    let observed;
    try { observed = observeWebsitePublicHtmlIdentity(html); } catch { return found; }
    if (observed.canonicalUrl !== overviewUrl || observed.robotsExcluded) continue;
    for (const [slug, matches] of candidates) {
      const url = `${overviewUrl}/${slug}`;
      if (!html.includes(`${new URL(overviewUrl).pathname}/${slug}`) || !mayRead(url)) continue;
      try {
        if (parseWebsiteSpeciesOverviewCard(html, overviewUrl, url, { requireUnambiguous: true })) matches.push({ url, overviewUrl });
      } catch { return found; }
    }
  }
  const uniqueCandidates = new Map([...candidates].filter(([, matches]) => matches.length === 1).map(([slug, matches]) => [slug, matches[0]]));
  const captured = await captureSpeciesPages(new Map([...uniqueCandidates].map(([slug, match]) => [slug, match.url])), { fetchImpl: regionalFetch });
  for (const [slug, page] of captured.pages) {
    try {
      const identity = observeWebsitePublicHtmlIdentity(page.html);
      if (identity.canonicalUrl !== page.url || identity.robotsExcluded) continue;
      const editorial = parseWebsiteEditorialPage(page.html, page.url);
      if (editorial.sections.some(section => section.heading && section.paragraphs.length > 0)) {
        found.set(slug, { ...page, overviewUrl: uniqueCandidates.get(slug).overviewUrl });
      }
    } catch { /* Keep an unverifiable page pending. */ }
  }
  return found;
}

export async function discoverPublicCatalogSources(speciesData, sitemapPages, baseline, options) {
  const previous = new Map(baseline.species.map(entry => [entry.id, entry.websiteUrl]));
  const { selected: sitemapSelected, issues } = selectSpeciesPageUrls(speciesData, [], sitemapPages);
  const missing = issues.filter(issue => issue.code === "missing-species-page");
  const regional = await verifyRegionalCatalogAdditions(sitemapPages, missing.map(issue => issue.slug), options);
  for (const [slug, { url }] of regional) {
    if (previous.has(slug) && previous.get(slug) !== url) regional.delete(slug);
  }
  const selection = selectPublicCatalogSpecies(speciesData, [...sitemapPages, ...regional.values()], baseline);
  return { ...selection, sitemapSelected, regional };
}

export async function readPublicCatalogBaseline({ fetchImpl = globalThis.fetch } = {}) {
  const manifestBytes = await readPublic(manifestUrl, PUBLIC_APP_CATALOG_MANIFEST_MAX_BYTES, "application/json", { fetchImpl, allowMissing: true });
  if (manifestBytes === null) {
    const bytes = await readBundledSpeciesCatalog(fileURLToPath(new URL("../../", import.meta.url)));
    const catalog = JSON.parse(bytes);
    assert.ok(catalog.schemaVersion === 1 && catalog.generatedAt === BUNDLED_SPECIES_SOURCE.generatedAt
      && catalog.species.length === BUNDLED_SPECIES_SOURCE.speciesCount, "Der geprüfte App-Anfangsbestand passt nicht zu seinem Nachweis.");
    return { source: "bundled", sha256: BUNDLED_SPECIES_SOURCE.sha256, catalog };
  }
  const manifest = decodePublicAppCatalogManifest(manifestBytes);
  const catalogUrl = new URL(`${manifest.catalogSha256}.json`, manifestUrl);
  const bytes = await readPublic(catalogUrl, manifest.catalogBytes, "application/json", { fetchImpl });
  return { source: "published", sha256: manifest.catalogSha256, catalog: decodePublicAppCatalogPayload(bytes, manifest) };
}

export function verifyPublicCatalogCandidate({ manifestBytes, catalogBytes, expectedBaselineSha256, checkoutCatalogSha256, currentRelease }) {
  assert.ok(typeof expectedBaselineSha256 === "string" && catalogDigest.test(expectedBaselineSha256),
    "Die Prüfsumme der freigegebenen Ausgangsfassung fehlt oder ist ungültig.");
  const { decision, bytes, manifest: currentManifest } = currentRelease;
  assert.equal(decision.baseline.sha256, expectedBaselineSha256,
    "Die öffentliche Ausgangsfassung hat sich seit der Vorbereitung geändert. Bitte einen neuen Kandidaten prüfen.");
  assert.equal(checkoutCatalogSha256, decision.baseline.source === "bundled" ? null : expectedBaselineSha256,
    "Im Git-Zielstand liegt eine andere App-Katalogfassung. Bitte den laufenden Veröffentlichungsstand prüfen.");
  assert.equal(decision.status, "candidate", "Die öffentliche Katalogprüfung ergibt keinen zu veröffentlichenden Kandidaten mehr.");

  const manifest = decodePublicAppCatalogManifest(manifestBytes);
  const candidate = decodePublicAppCatalogPayload(catalogBytes, manifest);
  const current = decodePublicAppCatalogPayload(bytes, currentManifest);
  assert.ok(Date.parse(candidate.generatedAt) <= Date.parse(current.generatedAt)
    && Date.parse(candidate.generatedAt) > Date.parse(decision.baseline.generatedAt),
    "Der Zeitpunkt des Kandidaten passt nicht zur öffentlich geprüften Ausgangsfassung.");
  assert.ok(isDeepStrictEqual(candidate.species, current.species),
    "Die öffentlichen Artinhalte oder Medien haben sich seit der Vorbereitung geändert. Bitte einen neuen Kandidaten prüfen.");
  return { status: "verified-candidate", catalogSha256: manifest.catalogSha256, revision: manifest.revision,
    speciesCount: manifest.speciesCount, baselineSha256: decision.baseline.sha256 };
}

async function readPublicCatalogCandidate(directory) {
  assert.ok((await lstat(directory)).isDirectory(), "Der Katalogkandidat muss in einem regulären Ordner liegen.");
  const read = async (filename, maximum) => {
    const filepath = path.join(directory, filename);
    const info = await lstat(filepath);
    assert.ok(info.isFile() && info.size > 0 && info.size <= maximum, `Ungültige Datei im Katalogkandidaten: ${filename}`);
    return readFile(filepath);
  };
  const manifestBytes = await read("manifest.json", PUBLIC_APP_CATALOG_MANIFEST_MAX_BYTES);
  const manifest = decodePublicAppCatalogManifest(manifestBytes), filename = `${manifest.catalogSha256}.json`;
  assert.deepEqual((await readdir(directory)).sort(), [filename, "manifest.json"].sort(),
    "Der Katalogkandidat muss genau aus Freigabedatei und gebundener Katalogdatei bestehen.");
  const catalogBytes = await read(filename, manifest.catalogBytes);
  return { manifestBytes, catalogBytes };
}

async function readGitCatalogSha256(commit) {
  const directory = "mobile/catalog", manifestPath = `${directory}/manifest.json`;
  const tracked = (await readGit(["ls-tree", "-z", "--name-only", commit, "--", directory])).toString("utf8");
  if (!tracked) return null;
  const manifest = decodePublicAppCatalogManifest(await readGit(["show", `${commit}:${manifestPath}`]));
  const payload = await readGit(["show", `${commit}:${directory}/${manifest.catalogSha256}.json`], manifest.catalogBytes + 1);
  decodePublicAppCatalogPayload(payload, manifest);
  return manifest.catalogSha256;
}

async function prepareFromPublicSources({ verifyUnchangedMedia = false } = {}) {
  const assetsRoot = fileURLToPath(new URL("../../species-assets/", import.meta.url));
  const filenames = ["speciesData.json", "species_list.json", "species-assets-overrides.json", "fehlende_elemente_report.json"];
  const inputLimit = 4 * 1024 * 1024;
  const commit = (await readGit(["rev-parse", "--verify", "HEAD^{commit}"])).toString("utf8").trim();
  const [inputs, sitemap, baseline, checkoutCatalogSha256] = await Promise.all([
    Promise.all(filenames.map(async name => {
      const [published, tracked] = await Promise.all([
        readPublic(new URL(name, pagesRoot), inputLimit, "application/json"),
        readGit(["show", `${commit}:${name}`], inputLimit),
      ]);
      assert.ok(published.equals(tracked), `Pages und der geprüfte Git-Stand enthalten unterschiedliche Daten: ${name}.`);
      return published;
    })),
    createWebsiteSpeciesPagesService({ timeoutMs: 20_000, fetchImpl: fetchPublicCatalogSource }).snapshot(),
    readPublicCatalogBaseline(),
    readGitCatalogSha256(commit),
  ]);
  assert.equal(checkoutCatalogSha256, baseline.source === "published" ? baseline.sha256 : null,
    "Die öffentliche Katalogfassung und der geprüfte Git-Stand stimmen nicht überein.");
  assert.equal(sitemap.status, "ready", sitemap.error);
  const [sourceSpeciesData, speciesList, mediaRegistry, missingMediaReport] = inputs.map(bytes => JSON.parse(bytes));
  const { speciesData, pending, regional, sitemapSelected } = await discoverPublicCatalogSources(sourceSpeciesData, sitemap.pages, baseline.catalog);
  const captured = await captureSpeciesPages(sitemapSelected, { fetchImpl: fetchPublicCatalogSource });
  assert.deepEqual(captured.issues, [], "Einige veröffentlichte Artseiten konnten nicht gelesen werden.");
  const pages = new Map([...captured.pages, ...regional]);
  const snapshot = await exportSpeciesCatalog({ speciesData, speciesList, pages, assetsRoot, missingMediaReport });
  const release = await buildPublicCatalogRelease({ snapshot, speciesData, pages, mediaRegistry, missingMediaReport, baseline, commit, verifyUnchangedMedia,
    async verifyMedia(media) {
      const bytes = await readPublic(media.url, media.bytes, media.mimeType, { pinned: media.pinned === true });
      assert.ok(bytes.length === media.bytes && digest(bytes) === media.sha256,
        `Veröffentlichte Medienbytes weichen vom Export ab: ${media.id}`);
    },
    async verifyGalleryPhoto(url) {
      const bytes = await readPublic(url, 32 * 1024 * 1024, ["image/jpeg", "image/png", "image/webp"]);
      assert.ok(bytes.length > 0, `Öffentliches Galeriefoto ist leer: ${url}`);
    } });
  assert.equal((await readGit(["rev-parse", "--verify", "HEAD^{commit}"])).toString("utf8").trim(), commit,
    "Der Git-Zielstand hat sich während der Prüfung geändert.");
  return { release, pending, filenames, inputs, pages, commit, checkoutCatalogSha256 };
}

async function stageFromPublicSources({ verifyUnchangedMedia }) {
  const { release, pending, filenames, inputs, pages, commit } = await prepareFromPublicSources({ verifyUnchangedMedia });
  const directory = tmpdir();
  const { bytes, manifest, decision, parity, ...checks } = release;
  if (decision.status === "candidate") {
    const payload = path.join(directory, "catalog");
    await mkdir(payload);
    await writeFile(path.join(payload, `${manifest.catalogSha256}.json`), bytes, { flag: "wx" });
    await writeFile(path.join(payload, "manifest.json"), jsonBytes(manifest), { flag: "wx" });
  }
  await writeFile(path.join(directory, "public-catalog-check.json"), jsonBytes({ ...decision, manifest, parity, ...checks,
    sourceCommit: commit,
    pendingWebsiteSpecies: pending,
    publicSources: Object.fromEntries(filenames.map((name, index) => [name, digest(inputs[index])])),
    pages: [...pages].map(([slug, { url, sha256, checkedAt, overviewUrl }]) => ({ slug, url, sha256, checkedAt, ...(overviewUrl && { overviewUrl }) })) }), { flag: "wx" });
  process.stdout.write(JSON.stringify({ directory, ...decision, ...manifest, sourceCommit: commit, mediaChecked: checks.publishedMediaChecked,
    pinnedMediaChecked: checks.pinnedMediaChecked, metadataChecked: checks.publishedMetadataChecked,
    reusedMedia: checks.reusedMedia, gallerySourcesChecked: checks.gallerySourcesChecked,
    spectrograms: checks.spectrograms, galleryImages: parity.galleryImagesChecked,
    pendingWebsiteSpecies: pending.length }) + "\n");
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.length === 1 && ["--scheduled", "--full-media-check"].includes(args[0])) {
    await stageFromPublicSources({ verifyUnchangedMedia: args[0] === "--full-media-check" });
  }
  else {
    const [mode, directory, expectedBaselineSha256] = args;
    assert.ok(args.length === 3 && mode === "--verify-candidate" && catalogDigest.test(expectedBaselineSha256),
      "Aufruf: node mobile/tool/stage-public-catalog.mjs --verify-candidate <Katalogordner> <SHA-256 der Ausgangsfassung>");
    const candidate = await readPublicCatalogCandidate(directory);
    const { release: currentRelease, checkoutCatalogSha256 } = await prepareFromPublicSources();
    process.stdout.write(`${JSON.stringify(verifyPublicCatalogCandidate({ ...candidate, expectedBaselineSha256, checkoutCatalogSha256, currentRelease }))}\n`);
  }
}
