import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';

const mobile = fileURLToPath(new URL('../', import.meta.url));
const root = path.dirname(mobile.replace(/[\\/]$/, ''));
const evidence = path.join(mobile, 'build-evidence');
const checks = JSON.parse(fs.readFileSync(path.join(evidence, 'checks.json'), 'utf8'));
const version = fs.readFileSync(path.join(mobile, 'pubspec.yaml'), 'utf8').match(/^version:\s*([^\s]+)$/m)?.[1];
assert.ok(version && /^\d+\.\d+\.\d+\+\d+$/.test(version));
const [versionName, versionCode] = version.split('+');
for (const label of ['analyze', 'test', 'build']) {
  assert.equal(checks.checks.findLast(entry => entry.label === label)?.code, 0, `Letzte ${label}-Prüfung war nicht erfolgreich.`);
}
assert.equal(checks.activeChild, null, 'Prüfprozess läuft noch.');
assert.equal(checks.sdkUnchanged, true, 'SDK-Nachlaufbestand nicht unverändert belegt.');
assert.equal(checks.sdkDownloadGuard?.passed, true, 'SDK-Downloadsperre nicht praktisch belegt.');
const testLog = fs.readFileSync(path.join(evidence, 'test.log'), 'utf8');
const testCount = Number(testLog.match(/\+(\d+): All tests passed!/)?.[1]);
assert.ok(testCount > 0);
const sourceApk = path.join(mobile, 'build/app/outputs/flutter-apk/app-debug.apk');
const artifactDirectory = path.join(mobile, 'artifacts');
fs.mkdirSync(artifactDirectory, { recursive: true });
const artifact = path.join(artifactDirectory, `arten-explorer-${versionName}-debug-arm64.apk`);
fs.copyFileSync(sourceApk, artifact);
const hash = value => createHash('sha256').update(value).digest('hex');
const expectedLogo = '63922bd5c1735dd4a31aa4d7c721adf2d16cc1b2a8082bf41f55403a6d22651e';
for (const file of ['assets/arten-explorer.png', 'android/app/src/main/res/drawable-nodpi/arten_explorer.png']) {
  assert.equal(hash(fs.readFileSync(path.join(mobile, file))), expectedLogo, `Logo geändert: ${file}`);
}
const androidTools = path.join(checks.tools.sdk, 'build-tools/36.0.0');
const env = { ...process.env, JAVA_HOME: checks.tools.jdk,
  TEMP: path.join(checks.session, 'process-temp'), TMP: path.join(checks.session, 'process-temp') };
const badging = execFileSync(path.join(androidTools, 'aapt.exe'), ['dump', 'badging', artifact], { encoding: 'utf8', env, windowsHide: true });
fs.writeFileSync(path.join(evidence, 'apk-badging.log'), badging);
assert.match(badging, /package: name='de\.fnwildlifetravel\.arten_explorer'/);
assert.ok(badging.includes(`versionCode='${versionCode}'`)); assert.ok(badging.includes(`versionName='${versionName}'`));
assert.match(badging, /sdkVersion:'26'/); assert.match(badging, /targetSdkVersion:'36'/);
assert.match(badging, /native-code: 'arm64-v8a'/);
const signature = execFileSync(path.join(checks.tools.jdk, 'bin/java.exe'), ['-jar', path.join(androidTools, 'lib/apksigner.jar'),
  'verify', '--verbose', '--print-certs', artifact], { encoding: 'utf8', env, windowsHide: true });
fs.writeFileSync(path.join(evidence, 'apk-signature.log'), signature);
assert.match(signature, /Verifies/);

// Read only known entries from our built APK; no extraction and no remote images.
const archive = fs.readFileSync(artifact);
let end = -1;
for (let index = archive.length - 22; index >= Math.max(0, archive.length - 65557); index--) {
  if (archive.readUInt32LE(index) === 0x06054b50) { end = index; break; }
}
assert.ok(end >= 0, 'APK-ZIP-Verzeichnis fehlt.');
const centralOffset = archive.readUInt32LE(end + 16), entries = archive.readUInt16LE(end + 10);
let cursor = centralOffset;
const zipEntries = [];
for (let index = 0; index < entries; index++) {
  assert.equal(archive.readUInt32LE(cursor), 0x02014b50);
  const length = archive.readUInt16LE(cursor + 28), extra = archive.readUInt16LE(cursor + 30), comment = archive.readUInt16LE(cursor + 32);
  zipEntries.push({ name: archive.subarray(cursor + 46, cursor + 46 + length).toString('utf8'),
    method: archive.readUInt16LE(cursor + 10), compressedBytes: archive.readUInt32LE(cursor + 20), bytes: archive.readUInt32LE(cursor + 24), offset: archive.readUInt32LE(cursor + 42) });
  cursor += 46 + length + extra + comment;
}
function entryBytes(entry) {
  assert.ok(entry.bytes < 16 * 1024 * 1024 && entry.compressedBytes < 16 * 1024 * 1024);
  assert.equal(archive.readUInt32LE(entry.offset), 0x04034b50);
  const start = entry.offset + 30 + archive.readUInt16LE(entry.offset + 26) + archive.readUInt16LE(entry.offset + 28);
  const compressed = archive.subarray(start, start + entry.compressedBytes);
  const bytes = entry.method === 0 ? compressed : entry.method === 8 ? inflateRawSync(compressed) : null;
  assert.ok(bytes); assert.equal(bytes.length, entry.bytes); return bytes;
}
const bundledLogo = zipEntries.find(entry => entry.name === 'assets/flutter_assets/assets/arten-explorer.png');
assert.ok(bundledLogo, 'Flutter-App-Logo fehlt im APK.');
assert.equal(hash(entryBytes(bundledLogo)), expectedLogo, 'APK enthält ein abweichendes App-Logo.');
const launcherLogo = zipEntries.find(entry => /res\/drawable[^/]*\/arten_explorer\.png$/.test(entry.name));
assert.ok(launcherLogo, 'Native Logoressource fehlt.');
const nativeLogoHash = hash(entryBytes(launcherLogo));
const publicManifest = JSON.parse(fs.readFileSync(path.join(mobile,'assets/catalog-manifest.json'),'utf8'));
const publicCatalogEntry = zipEntries.find(entry => entry.name === 'assets/flutter_assets/assets/catalog.json');
const publicManifestEntry = zipEntries.find(entry => entry.name === 'assets/flutter_assets/assets/catalog-manifest.json');
assert.ok(publicCatalogEntry && publicManifestEntry, 'Öffentlicher Anfangsbestand fehlt im APK.');
assert.equal(hash(entryBytes(publicCatalogEntry)), publicManifest.catalogSha256);
assert.deepEqual(JSON.parse(entryBytes(publicManifestEntry).toString('utf8')),publicManifest);
const manifestText = fs.readFileSync(path.join(mobile, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
assert.match(manifestText, /android:icon="@drawable\/arten_explorer"/);
assert.match(manifestText, /android:allowBackup="false"/);
assert.match(manifestText, /android:usesCleartextTraffic="false"/);
const ignoredDirectories = new Set(['build', '.dart_tool', '.gradle', '.idea', 'artifacts', 'build-evidence', '.pub-cache']);
const sourceBindings = [];
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { if (!ignoredDirectories.has(entry.name)) visit(file); continue; }
    if (!entry.isFile() || entry.name === 'local.properties' || /GeneratedPluginRegistrant|\.iml$/.test(entry.name)) continue;
    if (!/\.(dart|kt|kts|properties|xml|yaml|lock|md|json|mjs|png)$/.test(entry.name) && !['.gitignore','.metadata'].includes(entry.name)) continue;
    const bytes = fs.readFileSync(file);
    sourceBindings.push({ path: path.relative(root, file).replaceAll('\\','/'), bytes: bytes.length, sha256: hash(bytes) });
  }
}
visit(mobile);
sourceBindings.sort((a,b) => a.path.localeCompare(b.path));
const result = { auditedAt: new Date().toISOString(), passed: true, version, testCount,
  analyzer: 'No issues found', apk: { path: path.relative(root, artifact).replaceAll('\\','/'), bytes: fs.statSync(artifact).size,
    sha256: hash(archive), applicationId: 'de.fnwildlifetravel.arten_explorer', abi: 'arm64-v8a', minSdk: 26, targetSdk: 36, debugSignatureVerified: true },
  logo: { expectedSha256: expectedLogo, flutterApkAssetMatches: true, launcherResource: launcherLogo.name, launcherResourceSha256: nativeLogoHash, launcherByteMatch: nativeLogoHash === expectedLogo },
  licensesIncluded: zipEntries.some(entry => entry.name.endsWith('/NOTICES.Z')),
  publicCatalog: { ...publicManifest, packagedHashMatches: true },
  sdkRepeatInventoryUnchanged: checks.sdkUnchanged, sdkDownloadGuard: checks.sdkDownloadGuard,
  initialSdkSideEffect: 'Der erste Entwicklungsbuild ergänzte Android-Plattform35 Rev2; gemeldet, nicht zurückgenommen. Nur der abgesicherte Nachlauf bindet unveränderte Komponentenmetadaten.',
  sourceBindings, limits: ['Lokaler Debug-APK-/Quell-/Signaturnachweis; keine Geräte-/Keystore-/Audio-/NAS-/TLS-Betriebsabnahme',
    'SDK-Vergleich umfasst installierte Komponenten und deren Metadaten, keinen vollständigen Bytevergleich sämtlicher SDK-Dateien',
    'Kein Produktionskonto, Dienstimport oder Storepublish; öffentlicher Anfangsbestand mitgeliefert, persönlicher HTTPS-Projektdienst separat einzurichten'] };
fs.writeFileSync(path.join(evidence, 'artifact.json'), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ passed: result.passed, version: result.version, testCount, apk: result.apk, logo: result.logo,
  sourceFiles: sourceBindings.length, sdkRepeatInventoryUnchanged: result.sdkRepeatInventoryUnchanged })}\n`);
