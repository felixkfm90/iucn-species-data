import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from '../../species-explorer/shared-project/catalog.mjs';
import { BUNDLED_SPECIES_SOURCE } from '../../species-explorer/species-content/bundled.mjs';
import { statusGraphicSources } from './release-check.mjs';
import { reviewedMobileCatalog } from './catalog-editorial.mjs';
import { writeMobileTaxonomyNames } from './taxonomy-names.mjs';

const mobile = fileURLToPath(new URL('../', import.meta.url));
const root = path.resolve(mobile, '..');
const source = path.join(root, 'data/website/checks/species-content-20261031-catalog.json');
const receiptPath = path.join(root, 'data/website/checks/species-content-20261031-validation.json');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const receiptBytes = fs.readFileSync(receiptPath), receipt = JSON.parse(receiptBytes);
assert.equal(receipt.passed, true); assert.equal(receipt.parity.passed, true);
assert.equal(receipt.parity.issues.length, 0); assert.equal(receipt.tests.exitCode, 0);
const sourceBytes = fs.readFileSync(source), sourceCatalog = JSON.parse(sourceBytes);
assert.equal(digest(sourceBytes), receipt.catalogSha256, 'Katalog weicht von der stabilen Paritätsquittung ab.');
assert.equal(receipt.boundInputs['data/website/checks/species-content-20261031-catalog.json'], receipt.catalogSha256);
assert.deepEqual(buildCatalog(sourceCatalog), sourceCatalog, 'Katalog enthält nicht freigegebene oder unerwartete Felder.');
const { catalog, changes } = reviewedMobileCatalog(sourceCatalog);
assert.deepEqual(buildCatalog(catalog), catalog, 'Redaktionelle Fassung weicht vom Katalogformat ab.');
const bytes = changes.length ? Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`) : sourceBytes;
const catalogSha256 = digest(bytes);
const { bytes: pinnedBytes, sha256: pinnedSha256, speciesCount: pinnedCount, generatedAt: pinnedDate } = BUNDLED_SPECIES_SOURCE;
assert.deepEqual([bytes.length, catalogSha256, catalog.species.length, catalog.generatedAt], [pinnedBytes, pinnedSha256, pinnedCount, pinnedDate],
  'Den geprüften Anfangskatalog zuerst auch für den Desktop in species-content/bundled.mjs binden.');
assert.equal(catalog.species.length, receipt.parity.speciesCount);
assert.ok(!/file:\/\/|[a-z]:\\|\\\\(?:[a-z0-9]|\d)/i.test(bytes.toString('utf8')), 'Lokaler Pfad gehört nicht in den öffentlichen Anfangsbestand.');
const galleryCount = catalog.species.reduce((sum, entry) => sum + entry.media.gallery.length, 0);
assert.equal(galleryCount, receipt.parity.galleryImagesChecked);
const publishedCommit = execFileSync('git', ['rev-parse', 'refs/remotes/origin/main'], { cwd: root, encoding: 'utf8' }).trim();
const publishedAssets = new Map(execFileSync('git', ['ls-tree', '-r', '-z', publishedCommit, '--', 'species-assets'],
  { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean).map(row => {
  const [metadata, filename] = row.split('\t');
  return [filename, metadata.split(' ').at(-1)];
}));
const spectrograms = {};
for (const entry of catalog.species) {
  const sound = entry.media.sounds[0];
  if (!sound) continue;
  const url = new URL(sound.url);
  const match = /^\/iucn-species-data\/species-assets\/([^/]+)\/sound\.mp3$/.exec(url.pathname);
  if (url.origin !== 'https://felixkfm90.github.io' || url.search || !match || !sound.sha256) continue;
  const folder = decodeURIComponent(match[1]);
  assert.ok(!/[\\/:\0]/u.test(folder) && folder !== '.' && folder !== '..');
  const base = `species-assets/${folder}`;
  if (!publishedAssets.has(`${base}/spectrogram.webp`)) continue;
  assert.equal(digest(fs.readFileSync(path.join(root, base, 'sound.mp3'))), sound.sha256, `Aufnahme verändert: ${entry.id}`);
  const image = fs.readFileSync(path.join(root, base, 'spectrogram.webp'));
  const gitBlob = createHash('sha1').update(`blob ${image.length}\0`).update(image).digest('hex');
  assert.equal(gitBlob, publishedAssets.get(`${base}/spectrogram.webp`), `Spektrogramm weicht vom veröffentlichten Commit ab: ${entry.id}`);
  assert.ok(image.length > 0 && image.length <= 512 * 1024, `Spektrogramm außerhalb des Medienlimits: ${entry.id}`);
  spectrograms[entry.id] = { soundSha256: sound.sha256, bytes: image.length, sha256: digest(image) };
}
const manifestPath = path.join(mobile, 'assets/catalog-manifest.json');
const photoUrls = [...new Set(catalog.species.flatMap(entry => entry.media.gallery)
  .filter(photo => !photo.sha256)
  .map(photo => {
    const url = new URL(photo.url);
    assert.equal(url.origin, 'https://images.squarespace-cdn.com');
    assert.match(url.pathname, /^\/content\/v1\/67556be0338df718ea064210\/.+\.(?:jpe?g|png|webp)$/iu);
    assert.deepEqual([...url.searchParams.keys()].filter(key => key !== 'format'), []);
    url.search = '?format=750w';
    return url.href;
  }))].sort();
const validPhotoSize = size => Number.isSafeInteger(size) && size > 0 && size <= 32 * 1024 * 1024;
const priorSizes = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath)).photoSizes ?? {} : {};
const pendingSizes = photoUrls.filter(url =>
  process.argv.includes('--measure-photo-sizes') || !validPhotoSize(priorSizes[url]));
const measured = new Map();
if (pendingSizes.length) {
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let index = next++; index < pendingSizes.length; index = next++) {
      const url = pendingSizes[index];
      try {
        const response = await fetch(url, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(10_000),
          headers: { accept: 'image/jpeg, image/png, image/webp', 'accept-encoding': 'identity' } });
        const type = response.headers.get('content-type')?.split(';')[0];
        const size = Number(response.headers.get('content-length'));
        if (response.ok && ['image/jpeg', 'image/png', 'image/webp'].includes(type) && validPhotoSize(size)) {
          measured.set(url, size);
        }
      } catch {
        // An unavailable public CDN entry must not invent a size.
      }
    }
  }));
  process.stderr.write(`Fotogrößen gemessen: ${measured.size}/${pendingSizes.length}\n`);
}
const photoSizes = Object.fromEntries(photoUrls.flatMap(url => {
  const size = measured.get(url) ?? priorSizes[url];
  return validPhotoSize(size) ? [[url, size]] : [];
}));
const manifest = { schemaVersion: 1, kind: 'bundled-public-catalog', label: 'Mitgelieferte öffentliche Daten',
  catalogSha256, catalogBytes: bytes.length, revision: catalog.revision, generatedAt: catalog.generatedAt,
  speciesCount: catalog.species.length, galleryReferenceCount: galleryCount, bundledMediaFiles: 0, spectrograms, photoSizes };
const target = path.join(mobile, 'assets/catalog.json');
fs.writeFileSync(`${target}.next`, bytes); fs.renameSync(`${target}.next`, target);
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const graphicDirectory = path.join(mobile, 'assets/status-graphics');
fs.mkdirSync(graphicDirectory, { recursive: true });
for (const [name, source] of Object.entries(statusGraphicSources)) {
  fs.copyFileSync(path.join(root, source), path.join(graphicDirectory, name));
}
writeMobileTaxonomyNames();
assert.equal(digest(fs.readFileSync(source)), receipt.catalogSha256, 'Quelldrift während der Übernahme.');
assert.equal(digest(fs.readFileSync(receiptPath)), digest(receiptBytes), 'Paritätsquittung wurde während der Übernahme verändert.');
fs.mkdirSync(path.join(mobile, 'build-evidence'), { recursive: true });
fs.writeFileSync(path.join(mobile, 'build-evidence/bundled-catalog.json'), `${JSON.stringify({ copiedAt: new Date().toISOString(), passed: true,
  source: path.relative(root, source).replaceAll('\\','/'), receipt: path.relative(root, receiptPath).replaceAll('\\','/'),
  receiptSha256: digest(receiptBytes), sourceCatalogSha256: receipt.catalogSha256, editorialTitleCorrections: changes,
  publicManifest: manifest, publishedSpectrogramCommit: publishedCommit, mediaDownloads: 0 }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(manifest)}\n`);
