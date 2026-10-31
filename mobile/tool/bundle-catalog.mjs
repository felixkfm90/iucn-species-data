import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from '../../species-explorer/shared-project/catalog.mjs';

const mobile = fileURLToPath(new URL('../', import.meta.url));
const root = path.resolve(mobile, '..');
const source = path.join(root, 'data/website/checks/species-content-20261031-catalog.json');
const receiptPath = path.join(root, 'data/website/checks/species-content-20261031-validation.json');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const receiptBytes = fs.readFileSync(receiptPath), receipt = JSON.parse(receiptBytes);
assert.equal(receipt.passed, true); assert.equal(receipt.parity.passed, true);
assert.equal(receipt.parity.issues.length, 0); assert.equal(receipt.tests.exitCode, 0);
const bytes = fs.readFileSync(source), catalog = JSON.parse(bytes);
assert.equal(digest(bytes), receipt.catalogSha256, 'Katalog weicht von der stabilen Paritätsquittung ab.');
assert.equal(receipt.boundInputs['data/website/checks/species-content-20261031-catalog.json'], receipt.catalogSha256);
assert.deepEqual(buildCatalog(catalog), catalog, 'Katalog enthält nicht freigegebene oder unerwartete Felder.');
assert.equal(catalog.species.length, receipt.parity.speciesCount);
assert.ok(!/file:\/\/|[a-z]:\\|\\\\(?:[a-z0-9]|\d)/i.test(bytes.toString('utf8')), 'Lokaler Pfad gehört nicht in den öffentlichen Anfangsbestand.');
const galleryCount = catalog.species.reduce((sum, entry) => sum + entry.media.gallery.length, 0);
assert.equal(galleryCount, receipt.parity.galleryImagesChecked);
const manifest = { schemaVersion: 1, kind: 'bundled-public-catalog', label: 'Mitgelieferte öffentliche Daten',
  catalogSha256: digest(bytes), catalogBytes: bytes.length, revision: catalog.revision, generatedAt: catalog.generatedAt,
  speciesCount: catalog.species.length, galleryReferenceCount: galleryCount, bundledMediaFiles: 0 };
const target = path.join(mobile, 'assets/catalog.json');
fs.writeFileSync(`${target}.next`, bytes); fs.renameSync(`${target}.next`, target);
fs.writeFileSync(path.join(mobile, 'assets/catalog-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
assert.equal(digest(fs.readFileSync(source)), manifest.catalogSha256, 'Quelldrift während der Übernahme.');
assert.equal(digest(fs.readFileSync(receiptPath)), digest(receiptBytes), 'Paritätsquittung wurde während der Übernahme verändert.');
fs.mkdirSync(path.join(mobile, 'build-evidence'), { recursive: true });
fs.writeFileSync(path.join(mobile, 'build-evidence/bundled-catalog.json'), `${JSON.stringify({ copiedAt: new Date().toISOString(), passed: true,
  source: path.relative(root, source).replaceAll('\\','/'), receipt: path.relative(root, receiptPath).replaceAll('\\','/'),
  receiptSha256: digest(receiptBytes), publicManifest: manifest, mediaDownloads: 0 }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(manifest)}\n`);
