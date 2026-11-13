import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { deflateRawSync } from 'node:zlib';
import { tmpdir } from '../../scripts/test-temp.mjs';
import { APPROVED_LOGO_SHA256, PLAY_PACKAGE, parsePlayVersion, parseBundleManifest, checkBundleManifest,
  readBundleEntries, checkNativeLogoSha256, verifyBundlePayload, verifyUploadSignature } from './release-check.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const android = 'http://schemas.android.com/apk/res/android';
const logo = fs.readFileSync(path.join(here, '../assets/arten-explorer.png'));
const version = { versionName: '0.1.2', versionCode: 3 };
const downloadVersion = { versionName: '0.1.3', versionCode: 4 };
const pairingVersion = { versionName: '0.1.8', versionCode: 8 };
const downloadPermissions = ['RUN_USER_INITIATED_JOBS', 'FOREGROUND_SERVICE', 'POST_NOTIFICATIONS', 'WAKE_LOCK']
  .map(name => `android.permission.${name}`);
function downloadPermissionNodes({ omit = [], limits = {} } = {}) {
  return downloadPermissions.filter(name => !omit.includes(name)).map(name => {
    const limit = Object.hasOwn(limits, name) ? limits[name]
      : ['android.permission.FOREGROUND_SERVICE', 'android.permission.WAKE_LOCK'].includes(name) ? '33' : null;
    return element('uses-permission', [attribute('name', name), ...(limit === null ? [] : [attribute('maxSdkVersion', limit)])]);
  });
}
const catalog = Buffer.from('{"species":[]}\n');
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => createHash('sha256').update(value).digest('base64');
const catalogManifest = Buffer.from(`${JSON.stringify({ catalogSha256: hash(catalog) })}\n`);
const activityFixture = {
  configChanges: { raw: 'orientation|keyboardHidden|keyboard|screenSize|smallestScreenSize|locale|layoutDirection|fontScale|screenLayout|density|uiMode', compiled: 1073758132 },
  launchMode: { raw: 'singleTop', compiled: 1 },
  windowSoftInputMode: { raw: 'adjustResize', compiled: 16 },
};

function vint(number) {
  let value = BigInt(number); const bytes = [];
  do { let byte = Number(value & 127n); value >>= 7n; if (value) byte |= 128; bytes.push(byte); } while (value);
  return Buffer.from(bytes);
}
function field(id, value) {
  if (typeof value === 'number') return Buffer.concat([vint(id * 8), vint(value)]);
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return Buffer.concat([vint(id * 8 + 2), vint(bytes.length), bytes]);
}
function attribute(name, value, namespace = android) {
  const fields = [field(1, namespace), field(2, name), field(3, String(value))];
  if (typeof value === 'boolean') fields.push(field(6, field(7, field(8, value ? 1 : 0))));
  return field(4, Buffer.concat(fields));
}
function referenceAttribute(name, id) {
  return field(4, Buffer.concat([field(1, android), field(2, name), field(6, field(1, field(2, id)))]));
}
function compiledAttribute(name, { raw, compiled, kind = 'integer' }, namespace = android) {
  const fields = [field(1, namespace), field(2, name)];
  if (raw !== undefined) fields.push(field(3, raw));
  const item = kind === 'string' ? field(2, field(1, compiled))
    : field(7, field(kind === 'boolean' ? 8 : 6, compiled));
  fields.push(field(6, item));
  return field(4, Buffer.concat(fields));
}
function omittedEmptyAttribute(name, namespace = android, resourceId = 0x01010012) {
  return field(4, Buffer.concat([field(1, namespace), field(2, name), field(5, resourceId)]));
}
function element(name, attrs = [], children = []) {
  const namespaces = name === 'manifest' ? [field(1, Buffer.concat([field(1, 'android'), field(2, android)]))] : [];
  return field(1, Buffer.concat([...namespaces, field(3, name), ...attrs, ...children.map(child => field(5, child))]));
}
function manifest({ packageName = PLAY_PACKAGE, target = '36', versionName = version.versionName, versionCode = '3', backup = false, debug = false, iconId = 0x7f030000,
  ownProtection = { raw: 'signature', compiled: 2 }, activityOptions = {}, affinityAttribute = omittedEmptyAttribute('taskAffinity'),
  extraPermission, extraPermissions = [], extraComponents = [], extraFeatures = [], extraAttrs = [], permissionAttributes = {} } = {}) {
  const usesPermission = name => element('uses-permission', [attribute('name', name), ...(permissionAttributes[name] || [])]);
  return element('manifest', [attribute('package', packageName, ''), attribute('versionName', versionName), attribute('versionCode', versionCode), ...extraAttrs], [
    element('uses-sdk', [attribute('minSdkVersion', '26'), attribute('targetSdkVersion', target)]),
    usesPermission('android.permission.INTERNET'),
    usesPermission('android.permission.ACCESS_NETWORK_STATE'),
    usesPermission(`${PLAY_PACKAGE}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`),
    element('permission', [attribute('name', `${PLAY_PACKAGE}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`), compiledAttribute('protectionLevel', ownProtection)]),
    ...(extraPermission ? [element('uses-permission', [attribute('name', extraPermission)])] : []),
    ...extraPermissions.map(permission => typeof permission === 'string'
      ? element('uses-permission', [attribute('name', permission)]) : permission),
    ...extraFeatures,
    element('application', [attribute('allowBackup', backup), attribute('usesCleartextTraffic', false), attribute('debuggable', debug), referenceAttribute('icon', iconId)], [
      element('activity', [attribute('name', `${PLAY_PACKAGE}.MainActivity`), attribute('exported', true),
        affinityAttribute, ...Object.entries({ ...activityFixture, ...activityOptions }).map(([name, binding]) => compiledAttribute(name, binding))]),
      ...extraComponents,
    ]),
  ]);
}
function downloadManifest({ permissions = downloadPermissionNodes(), versionCode = '4', versionName = downloadVersion.versionName,
  jobAttrs = [], legacyAttrs = [], receiverAttrs = [], jobPermission = 'android.permission.BIND_JOB_SERVICE',
  jobExported = false, legacyExported = false, receiverExported = false,
  foregroundType = { raw: 'dataSync', compiled: 1 }, omit = [], additionalComponents = [], extraFeatures = [], componentChildren = [], permissionAttributes = {} } = {}) {
  const components = [
    ['job', element('service', [attribute('name', `${PLAY_PACKAGE}.OfflineDownloadJobService`), attribute('exported', jobExported),
      ...(jobPermission == null ? [] : [attribute('permission', jobPermission)]), ...jobAttrs], componentChildren)],
    ['legacy', element('service', [attribute('name', `${PLAY_PACKAGE}.OfflineDownloadLegacyService`), attribute('exported', legacyExported),
      ...(foregroundType === null ? [] : [compiledAttribute('foregroundServiceType', foregroundType)]), ...legacyAttrs], componentChildren)],
    ['cancel', element('receiver', [attribute('name', `${PLAY_PACKAGE}.OfflineDownloadCancelReceiver`), attribute('exported', receiverExported), ...receiverAttrs], componentChildren)],
  ].filter(([kind]) => !omit.includes(kind)).map(([, node]) => node);
  return manifest({ versionName, versionCode, extraPermissions: permissions, extraComponents: [...components, ...additionalComponents], extraFeatures, permissionAttributes });
}
function androidXComponents({ profilePermission = 'android.permission.DUMP', profileActions,
  providerExported = false, profileExtras = [] } = {}) {
  const actions = profileActions || ['INSTALL_PROFILE', 'SKIP_FILE', 'SAVE_PROFILE', 'BENCHMARK_OPERATION'];
  return [element('provider', [attribute('name', 'androidx.startup.InitializationProvider'),
    attribute('authorities', `${PLAY_PACKAGE}.androidx-startup`), attribute('exported', providerExported)],
  ['androidx.lifecycle.ProcessLifecycleInitializer', 'androidx.profileinstaller.ProfileInstallerInitializer']
    .map(name => element('meta-data', [attribute('name', name), attribute('value', 'androidx.startup')]))),
  element('receiver', [attribute('name', 'androidx.profileinstaller.ProfileInstallReceiver'), attribute('directBootAware', false),
    attribute('enabled', true), attribute('exported', true), attribute('permission', profilePermission), ...profileExtras],
  actions.map(action => element('intent-filter', [], [element('action', [attribute('name', `androidx.profileinstaller.action.${action}`)])])))];
}
function resources(filePath = 'res/drawable-nodpi-v4/arten_explorer.png') {
  const fileReference = Buffer.concat([field(1, filePath), field(2, 1)]);
  const item = field(5, fileReference), value = field(4, item), config = field(2, value);
  const entry = Buffer.concat([field(1, field(1, 0)), field(2, 'arten_explorer'), field(6, config)]);
  const type = Buffer.concat([field(1, field(1, 3)), field(2, 'drawable'), field(3, entry)]);
  return field(2, Buffer.concat([field(1, field(1, 0x7f)), field(2, PLAY_PACKAGE), field(3, type)]));
}
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(files, { compress = false } = {}) {
  const locals = [], central = []; let offset = 0;
  for (const [name, source] of files) {
    const filename = Buffer.from(name), bytes = Buffer.from(source), encoded = compress ? deflateRawSync(bytes) : bytes;
    const local = Buffer.alloc(30), header = Buffer.alloc(46), crc = crc32(bytes);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(compress ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(encoded.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(filename.length, 26);
    header.writeUInt32LE(0x02014b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(20, 6); header.writeUInt16LE(compress ? 8 : 0, 10);
    header.writeUInt32LE(crc, 16); header.writeUInt32LE(encoded.length, 20); header.writeUInt32LE(bytes.length, 24); header.writeUInt16LE(filename.length, 28); header.writeUInt32LE(offset, 42);
    locals.push(local, filename, encoded); central.push(header, filename); offset += local.length + filename.length + encoded.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
function signedPayload({ xml = manifest(), resourceTable = resources(), replaceLogo, replaceNativeLogo, extraFiles = [],
  omitDigest, mutatePayload, catalogBytes = catalog, catalogManifestBytes = catalogManifest } = {}) {
  const files = [
    ['base/manifest/AndroidManifest.xml', xml], ['base/resources.pb', resourceTable], ['base/assets/flutter_assets/assets/arten-explorer.png', replaceLogo || logo],
    ['base/res/drawable-nodpi-v4/arten_explorer.png', replaceNativeLogo || logo], ['base/assets/flutter_assets/assets/catalog.json', catalogBytes],
    ['base/assets/flutter_assets/assets/catalog-manifest.json', catalogManifestBytes], ...extraFiles,
  ];
  const mf = Buffer.from('Manifest-Version: 1.0\r\n\r\n' + files.filter(([name]) => name !== omitDigest)
    .map(([name, bytes]) => `Name: ${name}\r\nSHA-256-Digest: ${digest(bytes)}\r\n\r\n`).join(''));
  const sf = Buffer.from(`Signature-Version: 1.0\r\nSHA-256-Digest-Manifest: ${digest(mf)}\r\n\r\n`);
  const actualFiles = files.map(([name, bytes]) => [name, mutatePayload === name ? Buffer.concat([bytes, Buffer.from('changed')]) : bytes]);
  return zip([...actualFiles, ['META-INF/MANIFEST.MF', mf], ['META-INF/ARTEN.SF', sf], ['META-INF/ARTEN.RSA', Buffer.from('synthetic signature; cryptographic tool verified separately')]], { compress: true });
}
const payloadOptions = { version, catalog, catalogManifest };

test('QR scanner requires its exact private activity, optional camera and intact license in version 8', () => {
  const camera = 'android.permission.CAMERA';
  const features = ['camera', 'camera.front', 'camera.autofocus', 'camera.flash']
    .map(name => element('uses-feature', [attribute('name', 'android.hardware.' + name), attribute('required', false)]));
  const scanner = (exported = false, children = []) => element('activity', [
    attribute('name', 'com.journeyapps.barcodescanner.CaptureActivity'), attribute('exported', exported),
    attribute('clearTaskOnLaunch', true), attribute('stateNotNeeded', true), referenceAttribute('theme', 0x7f100001),
    compiledAttribute('screenOrientation', { raw: 'portrait', compiled: 1 }),
    compiledAttribute('windowSoftInputMode', { raw: 'stateAlwaysHidden', compiled: 3 }),
  ], children);
  const fixture = { versionCode: '8', versionName: '0.1.8', extraFeatures: features,
    permissions: [...downloadPermissionNodes(), camera], additionalComponents: [scanner()] };
  const options = { ...payloadOptions, version: pairingVersion };
  const xml = downloadManifest(fixture);
  assert.ok(checkBundleManifest(xml, pairingVersion).permissions.includes(camera));
  assert.throws(() => checkBundleManifest(downloadManifest({ ...fixture, permissions: downloadPermissionNodes() }), pairingVersion), /Android-Berechtigungen/);
  assert.throws(() => checkBundleManifest(downloadManifest({ ...fixture, extraFeatures: [] }), pairingVersion), /Kamera.*unverbindlich/);
  for (const additionalComponents of [[], [scanner(true)], [scanner(false, [element('intent-filter')])]]) {
    assert.throws(() => checkBundleManifest(downloadManifest({ ...fixture, additionalComponents }), pairingVersion), /Scanner-Aktivität|private Aktivität/);
  }
  assert.throws(() => checkBundleManifest(downloadManifest({ ...fixture, versionCode: '4', versionName: '0.1.3' }), downloadVersion), /Android-Berechtigungen/);
  const file = 'base/assets/flutter_assets/assets/licenses/zxing.txt';
  const license = fs.readFileSync(path.join(here, '../assets/licenses/zxing.txt'));
  assert.equal(verifyBundlePayload(signedPayload({ xml, extraFiles: [[file, license]] }), options).manifest.versionCode, 8);
  assert.throws(() => verifyBundlePayload(signedPayload({ xml, extraFiles: [[file, Buffer.from('changed')]] }), options), /Lizenztext/);
});

test('only source-bound status and trend graphics are accepted in the signed payload', () => {
  const entry = 'base/assets/flutter_assets/assets/status-graphics/NT.png';
  const source = fs.readFileSync(path.join(here, '../../graphics/catagory/Alternativ/NT.png'));
  const statusGraphics = new Map([[entry, source]]);
  const options = { ...payloadOptions, statusGraphics };
  const bundle = signedPayload({ extraFiles: [[entry, source]] });
  const changed = Buffer.from(source);
  changed[changed.length - 1] ^= 1;
  assert.equal(verifyBundlePayload(bundle, options).statusGraphicCount, 1);
  assert.throws(() => verifyBundlePayload(bundle, payloadOptions), /ohne gebundene Websitequelle/);
  assert.throws(() => verifyBundlePayload(signedPayload({ extraFiles: [[entry, changed]] }), options), /weicht von der Websitequelle ab/);
  assert.throws(() => verifyBundlePayload(signedPayload({ extraFiles: [[entry.replace('NT.png', 'other.png'), logo]] }), options), /Nicht genehmigtes Bildasset/);
});

test('Play version requires exactly one positive Android build number within its limit', () => {
  assert.deepEqual(parsePlayVersion('name: arten_explorer\nversion: 0.1.2+3\n'), version);
  for (const invalid of ['version: 0.1.2+0', 'version: 0.1.2+2100000000', 'version: 0.1.2+3\nversion: 0.1.2+4', 'version: 0.1.2']) assert.throws(() => parsePlayVersion(invalid));
});

test('AAB protobuf binds exact package/version, SDK 26/36, release and transport protections', () => {
  assert.equal(checkBundleManifest(manifest(), version).packageName, PLAY_PACKAGE);
  for (const invalid of [{ packageName: 'de.numis.katalog' }, { target: '35' }, { versionCode: '4' }, { backup: true }, { debug: true }, { extraPermission: 'android.permission.CAMERA' }]) {
    assert.throws(() => checkBundleManifest(manifest(invalid), version));
  }
  assert.throws(() => parseBundleManifest(Buffer.from([0x0a, 0x80])));
  assert.throws(() => checkBundleManifest(manifest({ extraAttrs: [attribute('package', PLAY_PACKAGE, '')] }), version), /Doppeltes/);
});

test('only the observed Media3 network-status permission supplements internet and own signature permission', () => {
  const result = checkBundleManifest(manifest(), version);
  assert.ok(result.permissions.includes('android.permission.ACCESS_NETWORK_STATE'));
  for (const extraPermission of ['android.permission.CAMERA', 'android.permission.CHANGE_NETWORK_STATE', 'android.permission.ACCESS_WIFI_STATE',
    'android.permission.RECORD_AUDIO', 'android.permission.ACCESS_NETWORK_STATE']) {
    assert.throws(() => checkBundleManifest(manifest({ extraPermission }), version), /Nicht geprüfte Android-Berechtigungen/);
  }
});

test('download manifest v4: exact native configuration is accepted while version3 remains unchanged', () => {
  const checked = checkBundleManifest(downloadManifest(), downloadVersion);
  assert.deepEqual(checked.permissions.filter(name => downloadPermissions.includes(name)), downloadPermissions);
  assert.equal(checked.versionCode, 4);
  assert.equal(checkBundleManifest(manifest(), version).versionCode, 3);
});

test('download manifest v4: permissions are version-gated, complete and bounded to the actual API range', () => {
  assert.throws(() => checkBundleManifest(manifest({ versionCode: '4', versionName: downloadVersion.versionName }), downloadVersion), /Berechtigungen/);
  for (const permission of downloadPermissions) {
    assert.throws(() => checkBundleManifest(manifest({ extraPermission: permission }), version), /Berechtigungen/);
    assert.throws(() => checkBundleManifest(downloadManifest({ permissions: downloadPermissionNodes({ omit: [permission] }) }), downloadVersion), /Berechtigungen/);
  }
  for (const name of ['android.permission.CAMERA', 'android.permission.FOREGROUND_SERVICE_DATA_SYNC', 'android.permission.RECEIVE_BOOT_COMPLETED']) {
    const permissions = [...downloadPermissionNodes(), element('uses-permission', [attribute('name', name)])];
    assert.throws(() => checkBundleManifest(downloadManifest({ permissions }), downloadVersion), /Berechtigungen/);
  }
  for (const name of ['android.permission.FOREGROUND_SERVICE', 'android.permission.WAKE_LOCK']) {
    for (const limit of [null, '32', '34', '36', '033']) {
      assert.throws(() => checkBundleManifest(downloadManifest({ permissions: downloadPermissionNodes({ limits: { [name]: limit } }) }), downloadVersion), /Berechtigungen/);
    }
  }
  for (const name of ['android.permission.RUN_USER_INITIATED_JOBS', 'android.permission.POST_NOTIFICATIONS']) {
    assert.throws(() => checkBundleManifest(downloadManifest({ permissions: downloadPermissionNodes({ limits: { [name]: '33' } }) }), downloadVersion), /Berechtigungen/);
  }
  for (const name of ['android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE', `${PLAY_PACKAGE}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`]) {
    assert.throws(() => checkBundleManifest(downloadManifest({ permissionAttributes: { [name]: [attribute('maxSdkVersion', '33')] } }), downloadVersion), /Berechtigungen/);
  }
});

test('download manifest v4: both private services and the private cancel receiver must exist exactly once', () => {
  for (const kind of ['job', 'legacy', 'cancel']) {
    assert.throws(() => checkBundleManifest(downloadManifest({ omit: [kind] }), downloadVersion), /Downloadkomponente/);
  }
  for (const override of [{ jobExported: true }, { legacyExported: true }, { receiverExported: true },
    { jobExported: 'false' }, { jobPermission: null }, { jobPermission: 'android.permission.INTERNET' },
    { jobAttrs: [attribute('process', ':other')] }, { legacyAttrs: [attribute('isolatedProcess', true)] },
    { receiverAttrs: [attribute('permission', 'android.permission.INTERNET')] },
    { componentChildren: [element('intent-filter', [], [element('action', [attribute('name', 'unapproved')])])] }]) {
    assert.throws(() => checkBundleManifest(downloadManifest(override), downloadVersion), /Downloadkomponente|BIND_JOB_SERVICE/);
  }
  const duplicate = element('service', [attribute('name', `${PLAY_PACKAGE}.OfflineDownloadJobService`),
    attribute('exported', false), attribute('permission', 'android.permission.BIND_JOB_SERVICE')]);
  assert.throws(() => checkBundleManifest(downloadManifest({ additionalComponents: [duplicate] }), downloadVersion), /Mehrdeutige Android-Komponenten/);
  assert.throws(() => checkBundleManifest(manifest({ extraComponents: [duplicate] }), version), /diese Version/);
});

test('download manifest v4: the foreground-service type binds only dataSync to compiled flag1', () => {
  for (const raw of ['dataSync', '1', '0x1', undefined]) {
    const xml = downloadManifest({ foregroundType: { raw, compiled: 1 } });
    assert.equal(checkBundleManifest(xml, downloadVersion).nativeDownloads, true);
    assert.equal(verifyBundlePayload(signedPayload({ xml }), { ...payloadOptions, version: downloadVersion }).manifest.versionCode, 4);
  }
  for (const foregroundType of [null, { raw: 'dataSync', compiled: 2 }, { raw: 'location', compiled: 1 },
    { raw: 'dataSync', compiled: 'dataSync', kind: 'string' }, { raw: '1', compiled: 1, kind: 'boolean' }]) {
    assert.throws(() => checkBundleManifest(downloadManifest({ foregroundType }), downloadVersion), /FGS|Downloadkomponente/);
  }
  const unbound = compiledAttribute('foregroundServiceType', { raw: 'dataSync', compiled: 1 });
  assert.throws(() => checkBundleManifest(manifest({ extraAttrs: [unbound] }), version), /widersprechen/);
  const foreignNamespace = compiledAttribute('foregroundServiceType', { raw: 'dataSync', compiled: 1 }, 'urn:untrusted');
  assert.throws(() => checkBundleManifest(downloadManifest({ foregroundType: null, legacyAttrs: [foreignNamespace] }), downloadVersion), /widersprechen|Downloadkomponente/);
});

test('download manifest v4: existing AndroidX components stay bound and no new exports are admitted', () => {
  assert.equal(checkBundleManifest(downloadManifest({ additionalComponents: androidXComponents() }), downloadVersion).nativeDownloads, true);
  assert.equal(checkBundleManifest(manifest({ extraComponents: androidXComponents() }), version).versionCode, 3);
  for (const overrides of [{ profilePermission: 'android.permission.INTERNET' }, { profileActions: ['INSTALL_PROFILE'] },
    { profileActions: ['INSTALL_PROFILE', 'SKIP_FILE', 'SAVE_PROFILE', 'UNAPPROVED'] }, { providerExported: true },
    { profileExtras: [attribute('process', ':other')] }]) {
    assert.throws(() => checkBundleManifest(downloadManifest({ additionalComponents: androidXComponents(overrides) }), downloadVersion), /AndroidX/);
  }
  for (const kind of ['service', 'receiver', 'provider', 'activity', 'activity-alias']) {
    for (const exported of [true, false]) {
      const foreign = element(kind, [attribute('name', `${PLAY_PACKAGE}.Unapproved`), attribute('exported', exported)]);
      assert.throws(() => checkBundleManifest(downloadManifest({ additionalComponents: [foreign] }), downloadVersion), /Nicht geprüfte Android-Komponente/);
    }
  }
});

test('AndroidX signature permission binds its raw enum exclusively to compiled integer 2', () => {
  for (const raw of ['signature', '2', '0x2', undefined]) {
    const xml = manifest({ ownProtection: { raw, compiled: 2 } });
    const declared = parseBundleManifest(xml).children.find(child => child.name === 'permission');
    assert.deepEqual(declared.attrs.get(`${android}|protectionLevel`), { value: '2', kind: 'integer' });
    assert.equal(checkBundleManifest(xml, version).packageName, PLAY_PACKAGE);
    assert.equal(verifyBundlePayload(signedPayload({ xml }), payloadOptions).manifest.packageName, PLAY_PACKAGE);
  }
  for (const ownProtection of [
    { raw: 'signature', compiled: 1 }, { raw: 'signature', compiled: 3 }, { raw: 'normal', compiled: 2 },
    { raw: 'signature', compiled: 'signature', kind: 'string' }, { raw: '2', compiled: '2', kind: 'string' },
    { raw: 'signature', compiled: 1, kind: 'boolean' },
  ]) assert.throws(() => checkBundleManifest(manifest({ ownProtection }), version), /signaturgeschützt/);
  // The exception must not normalize an unrelated attribute or namespace.
  for (const extra of [compiledAttribute('protectionLevel', { raw: 'signature', compiled: 2 }),
    compiledAttribute('otherInteger', { raw: 'signature', compiled: 2 }),
    compiledAttribute('protectionLevel', { raw: 'signature', compiled: 2 }, 'urn:untrusted')]) {
    assert.throws(() => checkBundleManifest(manifest({ extraAttrs: [extra] }), version), /widersprechen/);
  }
});

test('the three actual activity enum/flag spellings bind only to their exact compiled integers', () => {
  const xml = manifest(), activity = parseBundleManifest(xml).children.find(child => child.name === 'application').children.find(child => child.name === 'activity');
  for (const [name, binding] of Object.entries(activityFixture)) {
    assert.deepEqual(activity.attrs.get(`${android}|${name}`), { value: String(binding.compiled), kind: 'integer' });
    assert.throws(() => checkBundleManifest(manifest({ activityOptions: { [name]: { ...binding, compiled: binding.compiled + 1 } } }), version), /Integerbindung/);
    assert.throws(() => checkBundleManifest(manifest({ activityOptions: { [name]: { raw: binding.raw, compiled: binding.raw, kind: 'string' } } }), version), /Integerbindung/);
    assert.throws(() => checkBundleManifest(manifest({ extraAttrs: [compiledAttribute(name, binding)] }), version), /widersprechen/);
  }
  assert.equal(verifyBundlePayload(signedPayload({ xml }), payloadOptions).manifest.packageName, PLAY_PACKAGE);
});

test('Proto3 omitted empty task affinity is bound to the exact Android activity attribute ID', () => {
  const xml = manifest(), activity = parseBundleManifest(xml).children.find(child => child.name === 'application').children.find(child => child.name === 'activity');
  assert.deepEqual(activity.attrs.get(`${android}|taskAffinity`), { value: '', kind: 'string' });
  assert.equal(checkBundleManifest(xml, version).packageName, PLAY_PACKAGE);
  for (const affinityAttribute of [omittedEmptyAttribute('taskAffinity', android, 0x01010013),
    omittedEmptyAttribute('taskAffinity', 'urn:untrusted'), omittedEmptyAttribute('otherAttribute')]) {
    assert.throws(() => checkBundleManifest(manifest({ affinityAttribute }), version), /Leeres Manifestattribut/);
  }
  assert.throws(() => checkBundleManifest(manifest({ extraAttrs: [omittedEmptyAttribute('taskAffinity')] }), version), /Leeres Manifestattribut/);
});

test('public payload verifies every JAR digest, catalog and both exact approved logos', () => {
  assert.equal(hash(logo), APPROVED_LOGO_SHA256);
  const result = verifyBundlePayload(signedPayload(), payloadOptions);
  assert.equal(result.payloadFiles, 6); assert.equal(result.approvedLogoSha256, APPROVED_LOGO_SHA256);
  assert.equal(result.manifest.targetSdk, 36);
  assert.throws(() => verifyBundlePayload(signedPayload({ replaceLogo: Buffer.from('different logo') }), payloadOptions), /Logo/);
  assert.throws(() => verifyBundlePayload(signedPayload({ mutatePayload: 'base/assets/flutter_assets/assets/catalog.json' }), payloadOptions), /Inhaltsbindung/);
  assert.throws(() => verifyBundlePayload(signedPayload({ omitDigest: 'base/assets/flutter_assets/assets/catalog.json' }), payloadOptions), /Nicht signierter/);
  assert.throws(() => verifyBundlePayload(signedPayload(), { ...payloadOptions, catalog: Buffer.from('{}') }), /Quellkatalog/);
});

test('Play-Paketprüfung weist auch korrekt hashgebundene fehlerhafte Überschriften zurück', () => {
  const verifyTitle = (id, title) => {
    const catalogBytes = Buffer.from(JSON.stringify({ species: [{ id, sections: [{ title }] }] }));
    const catalogManifestBytes = Buffer.from(JSON.stringify({ catalogSha256: hash(catalogBytes) }));
    return verifyBundlePayload(signedPayload({ catalogBytes, catalogManifestBytes }),
      { version, catalog: catalogBytes, catalogManifest: catalogManifestBytes });
  };
  assert.throws(() => verifyTitle('cebusimitator', 'Panama-Kapuzineraffe – klugeR Akrobat Des RegenWaldes'), /cebusimitator.*klugeR/);
  assert.throws(() => verifyTitle('other-animal', 'Beispiel – Stiller Jäger Des Waldes'), /other-animal.*Des Waldes/);
  assert.throws(() => verifyTitle('other-animal', 'Beispiel – Stiller Jäger des RegenWaldes'), /other-animal.*RegenWaldes/);
  assert.doesNotThrow(() => verifyTitle('cebusimitator', 'Panama-Kapuzineraffe – Kluger Akrobat des Regenwaldes'));
});

test('only the exact generated empty Flutter NativeAssetsManifest is admitted', () => {
  const name = 'base/assets/flutter_assets/NativeAssetsManifest.json';
  const bytes = Buffer.from('{"format-version":[1,0,0],"native-assets":{}}');
  const result = verifyBundlePayload(signedPayload({ extraFiles: [[name, bytes]] }), payloadOptions);
  assert.equal(result.payloadFiles, 7);
  for (const invalid of ['{"format-version":[2,0,0],"native-assets":{}}',
    '{"format-version":[1,0,0],"native-assets":{"android_arm64":{"secret":"private"}}}',
    '{"format-version":[1,0,0],"native-assets":{},"privateData":"must not ship"}']) {
    assert.throws(() => verifyBundlePayload(signedPayload({ extraFiles: [[name, Buffer.from(invalid)]] }), payloadOptions), /native Flutter-Assetbindungen/);
  }
  assert.throws(() => verifyBundlePayload(signedPayload({ extraFiles: [[`${name}.bak`, bytes]] }), payloadOptions), /Assetpfad/);
});

test('a packaged correct PNG cannot conceal a launcher referencing a different resource', () => {
  assert.throws(() => verifyBundlePayload(signedPayload({ xml: manifest({ iconId: 0x7f030001 }) }), payloadOptions), /Logoressourcenbindung/);
  assert.throws(() => verifyBundlePayload(signedPayload({ resourceTable: resources('res/drawable/other.png') }), payloadOptions), /andere Bilddatei/);
});

test('native logo accepts only the original pin or the independently qualified AAPT result', () => {
  const qualified = '8494d70906ab35e699785d809d805bcec989fb5ea4893418e72d6eab924e776b';
  const nativePath = 'base/res/drawable-nodpi-v4/arten_explorer.png';
  assert.equal(checkNativeLogoSha256(APPROVED_LOGO_SHA256), APPROVED_LOGO_SHA256);
  assert.equal(checkNativeLogoSha256(qualified, nativePath), qualified);
  for (const invalid of ['0'.repeat(64), `${qualified.slice(0, -1)}0`, qualified.toUpperCase(), null]) assert.throws(() => checkNativeLogoSha256(invalid, nativePath), /genehmigte Logo/);
  for (const path of [undefined, 'base/res/drawable-hdpi-v4/arten_explorer.png', 'base/assets/flutter_assets/assets/arten-explorer.png']) assert.throws(() => checkNativeLogoSha256(qualified, path), /genehmigte Logo/);
  assert.throws(() => verifyBundlePayload(signedPayload({ replaceNativeLogo: Buffer.from('not the native logo') }), payloadOptions), /genehmigte Logo/);
  assert.throws(() => verifyBundlePayload(signedPayload({ replaceLogo: Buffer.from('not the approved original') }), payloadOptions), /Flutter-Logo/);
});

test('a new fully declared but unapproved secret or original photo never passes archive admission', () => {
  for (const name of ['base/assets/upload.jks', 'base/assets/password.dpapi', 'base/assets/local.properties', 'base/assets/.env', 'base/assets/original.jpg', 'base/assets/gallery.png', 'base/assets/unapproved-profile.json']) {
    assert.throws(() => verifyBundlePayload(signedPayload({ extraFiles: [[name, Buffer.from('not public')]] }), payloadOptions));
  }
});

test('ZIP admission rejects traversal, case duplicates, local-name drift and expansion claims', () => {
  for (const name of ['../outside', 'base/../outside', 'C:/outside', 'base/CON.txt', 'base/evil\\name', 'base/trailing.']) assert.throws(() => readBundleEntries(zip([[name, Buffer.from('x')]])));
  assert.throws(() => readBundleEntries(zip([['base/a', Buffer.from('x')], ['base/A', Buffer.from('y')]])), /mehrdeutiger/);
  const localDrift = zip([['base/a', Buffer.from('x')]]); localDrift[30] = 0x78;
  assert.throws(() => readBundleEntries(localDrift), /widerspricht/);
  const sizeDrift = zip([['base/a', Buffer.from('x')]]); const central = sizeDrift.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); sizeDrift.writeUInt32LE(300 * 1024 * 1024, central + 24);
  assert.throws(() => readBundleEntries(sizeDrift), /großer/);
});

test('a valid JAR signature requires own public pin, one signer, no debug or partial signature', () => {
  const certificateSha256 = 'ab'.repeat(32), calls = [];
  const runTool = (filename, args, options) => {
    calls.push({ filename, args, options });
    return filename.endsWith('jarsigner.exe') ? 'jar verified.\n' : `Signer #1:\nOwner: CN=Arten Explorer Upload\nSHA256: ${certificateSha256}\n`;
  };
  assert.deepEqual(verifyUploadSignature('owned.aab', { jdkRoot: 'trusted-jdk', certificateSha256, runTool }), { signatureVerified: true, certificateSha256 });
  assert.equal(calls.length, 2); assert.equal(calls[0].options.timeout, 120000);
  assert.deepEqual(calls[0].args.slice(-2), ['-verify', 'owned.aab']);
  assert.ok(!Object.keys(calls[0].options.env).some(key => /^ARTEN_PLAY_/i.test(key)));
  for (const response of ['jar is unsigned.\n', 'jar verified.\nThis jar contains unsigned entries.\n', 'jar verified.\nThe signer certificate has expired.\n']) {
    assert.throws(() => verifyUploadSignature('owned.aab', { jdkRoot: 'trusted-jdk', certificateSha256, runTool: () => response }));
  }
  for (const certificate of [`Signer #1:\nSHA256: ${'cd'.repeat(32)}\n`, `Signer #1:\nOwner: CN=Android Debug, O=Android\nSHA256: ${certificateSha256}\n`, `Signer #1:\nSHA256: ${certificateSha256}\nSigner #2:\nSHA256: ${certificateSha256}\n`]) {
    assert.throws(() => verifyUploadSignature('owned.aab', { jdkRoot: 'trusted-jdk', certificateSha256, runTool: file => file.endsWith('jarsigner.exe') ? 'jar verified.\n' : certificate }));
  }
});

test('dot-source and real File CheckOnly without signing neither start children nor write files', { skip: process.platform !== 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'play-check-'));
  try {
    const mobile = path.join(root, 'mobile'), androidRoot = path.join(mobile, 'android');
    fs.mkdirSync(path.join(androidRoot, 'app'), { recursive: true });
    fs.writeFileSync(path.join(androidRoot, 'app/build.gradle.kts'), 'applicationId = "de.fnwildlifetravel.arten_explorer"\nminSdk = 26\ntargetSdk = 36\nARTEN_PLAY_SIGNING_REQUIRED\n');
    fs.writeFileSync(path.join(androidRoot, 'gradle.properties'), 'android.builder.sdkDownload=false\n');
    fs.mkdirSync(path.join(mobile, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(androidRoot, 'app/src/main/res/drawable-nodpi'), { recursive: true });
    fs.writeFileSync(path.join(mobile, 'assets/arten-explorer.png'), logo);
    fs.writeFileSync(path.join(androidRoot, 'app/src/main/res/drawable-nodpi/arten_explorer.png'), logo);
    const settings = { Workspace: root, Mobile: mobile, Signing: path.join(root, 'data/mobile-signing'),
      Runtime: path.join(root, 'data/mobile-signing/runtime'), Reports: path.join(root, 'data/mobile-signing/reports'),
      Flutter: path.join(root, 'flutter'), Jdk: path.join(root, 'jdk'), Sdk: path.join(root, 'sdk'), Package: PLAY_PACKAGE };
    const fixtureData = Buffer.from(JSON.stringify(settings)).toString('base64');
    const helper = path.join(here, 'build-play.ps1').replaceAll("'", "''");
    const script = `. '${helper}'\n$fixtureSettings = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${fixtureData}')) | ConvertFrom-Json\nfunction Get-ArtenPlaySettings { return $fixtureSettings }\nfunction Invoke-ArtenPlayChild { throw 'UNEXPECTED_CHILD' }\nfunction Initialize-ArtenPlayNative { throw 'UNEXPECTED_NATIVE_COMPILER' }\nInvoke-ArtenPlayCheck | ConvertTo-Json -Depth 8\n`;
    const before = fs.readdirSync(root, { recursive: true });
    const pwsh = process.env.ARTEN_PLAY_PWSH || 'pwsh.exe';
    const output = execFileSync(pwsh, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
    const result = JSON.parse(output.trim());
    assert.equal(result.checkCompleted, true); assert.equal(result.signingInitialized, false);
    assert.equal(result.filesChanged, false); assert.equal(result.childProcessesStarted, false);
    assert.equal(result.sdkDownloadsStarted, false); assert.equal(result.uploadExecuted, false); assert.equal(result.readyForUpload, false);
    assert.deepEqual(fs.readdirSync(root, { recursive: true }), before);
    const cli = runPlayCheckOnlyCli(root);
    assert.equal(cli.checkCompleted, true); assert.equal(cli.signingInitialized, false);
    assert.equal(cli.filesChanged, false); assert.equal(cli.childProcessesStarted, false);
    assert.equal(cli.sdkDownloadsStarted, false); assert.equal(cli.readyForUpload, false); assert.equal(cli.toolsPresent, false);
    assert.deepEqual(cli.missingTools.slice(-4), ['adb.exe', 'cmake.exe', 'ninja.exe', 'apkanalyzer.bat']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

function runPowerShellFixture(root, extra, { setup = '' } = {}) {
  const helper = path.join(here, 'build-play.ps1').replaceAll("'", "''");
  const settings = { Workspace: root, Mobile: path.join(root, 'mobile'), Signing: path.join(root, 'data/mobile-signing'),
    Runtime: path.join(root, 'data/mobile-signing/runtime'), Reports: path.join(root, 'data/mobile-signing/reports'),
    Flutter: path.join(root, 'flutter'), Jdk: path.join(root, 'jdk'), Sdk: path.join(root, 'sdk'),
    Package: PLAY_PACKAGE, Alias: 'arten-explorer-play-upload' };
  const fixtureData = Buffer.from(JSON.stringify(settings)).toString('base64');
  const script = `. '${helper}'\n$fixtureSettings = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${fixtureData}')) | ConvertFrom-Json\n$fixtureSettings | Add-Member Entropy ([Text.Encoding]::UTF8.GetBytes('synthetic-test-only'))\nfunction Get-ArtenPlaySettings { return $fixtureSettings }\n${setup}\n${extra}`;
  const pwsh = process.env.ARTEN_PLAY_PWSH || 'pwsh.exe';
  const output = execFileSync(pwsh, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  return JSON.parse(output.trim());
}

function runPlayCheckOnlyCli(root) {
  // Use the genuine -File entry point, without function overrides. Its actual
  // PSScriptRoot must be our own fixture, never the installed signing directory.
  const helper = path.join(root, 'mobile/tool/build-play.ps1');
  fs.mkdirSync(path.dirname(helper));
  fs.copyFileSync(path.join(here, 'build-play.ps1'), helper, fs.constants.COPYFILE_EXCL);
  function snapshot() {
    return fs.readdirSync(root, { recursive: true }).sort().map(name => {
      const filename = path.join(root, name), info = fs.lstatSync(filename, { bigint: true });
      assert.equal(info.isSymbolicLink(), false);
      return { name, bytes: info.size.toString(), written: info.mtimeNs.toString(), mode: info.mode.toString(),
        links: info.nlink.toString(), sha256: info.isFile() ? hash(fs.readFileSync(filename)) : null };
    });
  }
  const before = snapshot(), env = { ...process.env };
  for (const key of Object.keys(env)) if (/^ARTEN_PLAY_/i.test(key)) delete env[key];
  env.ARTEN_FLUTTER_ROOT = path.join(root, 'fixture-tools/flutter');
  env.ARTEN_JAVA_HOME = path.join(root, 'fixture-tools/jdk');
  env.ARTEN_ANDROID_SDK = path.join(root, 'fixture-tools/sdk');
  const pwsh = process.env.ARTEN_PLAY_PWSH || 'pwsh.exe';
  const output = execFileSync(pwsh, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', helper, '-CheckOnly'],
    { encoding: 'utf8', windowsHide: true, timeout: 30000, env });
  assert.deepEqual(snapshot(), before, 'real -File CheckOnly must preserve the entire existing fixture');
  return JSON.parse(output.trim());
}

test('two installed Node PATH matches resolve to one existing executable without starting it', { skip: process.platform !== 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'play-node-'));
  try {
    for (const folder of ['first runtime', 'second runtime']) {
      fs.mkdirSync(path.join(root, folder));
      fs.writeFileSync(path.join(root, folder, 'node.exe'), 'synthetic path fixture; never execute');
    }
    const result = runPowerShellFixture(root, `
$first = Join-Path $fixtureSettings.Workspace 'first runtime\\node.exe'
$second = Join-Path $fixtureSettings.Workspace 'second runtime\\node.exe'
function Get-Command {
    param($Name,$CommandType,$ErrorAction)
    if ($Name -cne 'node.exe' -or $CommandType -cne 'Application') { throw 'UNEXPECTED_COMMAND_LOOKUP' }
    return @([pscustomobject]@{Source=$first},[pscustomobject]@{Source=$second})
}
function Invoke-ArtenPlayChild { throw 'UNEXPECTED_CHILD' }
$resolved = Resolve-ArtenPlayNode
[ordered]@{resolved=$resolved;isSingleString=($resolved -is [string]);exists=(Test-Path -LiteralPath $resolved -PathType Leaf)} | ConvertTo-Json
`);
    assert.equal(result.resolved, path.join(root, 'first runtime/node.exe'));
    assert.equal(result.isSingleString, true); assert.equal(result.exists, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('dot-source and real File CheckOnly with private signing preserve all files and start no child', { skip: process.platform !== 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'play-existing-'));
  try {
    const mobile = path.join(root, 'mobile'), androidRoot = path.join(mobile, 'android');
    fs.mkdirSync(path.join(root, 'data'));
    fs.mkdirSync(path.join(androidRoot, 'app/src/main/res/drawable-nodpi'), { recursive: true });
    fs.mkdirSync(path.join(mobile, 'assets'));
    fs.writeFileSync(path.join(androidRoot, 'app/build.gradle.kts'), 'applicationId = "de.fnwildlifetravel.arten_explorer"\nminSdk = 26\ntargetSdk = 36\nARTEN_PLAY_SIGNING_REQUIRED\n');
    fs.writeFileSync(path.join(androidRoot, 'gradle.properties'), 'android.builder.sdkDownload=false\n');
    fs.writeFileSync(path.join(mobile, 'assets/arten-explorer.png'), logo);
    fs.writeFileSync(path.join(androidRoot, 'app/src/main/res/drawable-nodpi/arten_explorer.png'), logo);
    const result = runPowerShellFixture(root, `
$sid = Get-ArtenPlaySid
New-ArtenPlayPrivateDirectory $fixtureSettings.Signing $sid $fixtureSettings.Workspace
New-ArtenPlayPrivateDirectory $fixtureSettings.Runtime $sid $fixtureSettings.Signing
New-ArtenPlayPrivateDirectory $fixtureSettings.Reports $sid $fixtureSettings.Signing
# These are intentionally synthetic opaque bytes, never an upload key/password.
$opaque = [byte[]](10,20,30)
foreach($name in @('upload-key.dpapi','password.dpapi','upload-cert.der')) {
    Write-ArtenPlayNewFile (Join-Path $fixtureSettings.Signing $name) $opaque $fixtureSettings.Signing
}
$metadata = @{formatVersion=1;userSid=$sid;packageName=$fixtureSettings.Package;alias=$fixtureSettings.Alias;storeType='JKS';algorithm='RSA';keyBits=4096
    keystoreCiphertextSha256=(Get-ArtenPlayHash $opaque);passwordCiphertextSha256=(Get-ArtenPlayHash $opaque);certificateSha256=(Get-ArtenPlayHash $opaque)}
Write-ArtenPlayNewFile (Join-Path $fixtureSettings.Signing 'signing.json') ([Text.UTF8Encoding]::new($false).GetBytes(($metadata|ConvertTo-Json))) $fixtureSettings.Signing
function Get-FixtureSnapshot {
    $rows = @(Get-ChildItem -LiteralPath $fixtureSettings.Signing -File -Recurse | Sort-Object FullName | ForEach-Object {
        [ordered]@{name=$_.FullName;bytes=$_.Length;written=$_.LastWriteTimeUtc.Ticks;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
            acl=(Get-Acl -LiteralPath $_.FullName).Sddl}
    })
    return ConvertTo-Json -InputObject $rows -Depth 6 -Compress
}
function Invoke-ArtenPlayChild { throw 'UNEXPECTED_CHILD' }
$before = Get-FixtureSnapshot
$checked = Invoke-ArtenPlayCheck
$after = Get-FixtureSnapshot
[ordered]@{checked=$checked;filesUnchanged=($before -ceq $after);files=@(Get-ChildItem -LiteralPath $fixtureSettings.Signing -File -Recurse).Count}|ConvertTo-Json -Depth 10
`);
    assert.equal(result.checked.signingInitialized, true); assert.equal(result.checked.checkCompleted, true);
    assert.equal(result.checked.childProcessesStarted, false); assert.equal(result.checked.sdkDownloadsStarted, false);
    assert.equal(result.checked.filesChanged, false); assert.equal(result.checked.readyForUpload, false);
    assert.equal(result.filesUnchanged, true); assert.equal(result.files, 4);
    const cli = runPlayCheckOnlyCli(root);
    assert.equal(cli.checkCompleted, true); assert.equal(cli.signingInitialized, true);
    assert.equal(cli.filesChanged, false); assert.equal(cli.childProcessesStarted, false);
    assert.equal(cli.sdkDownloadsStarted, false); assert.equal(cli.readyForUpload, false); assert.equal(cli.toolsPresent, false);
    assert.equal(cli.certificateSha256, result.checked.certificateSha256);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('build success is emitted only after owned runtime cleanup and all signing handles close', { skip: process.platform !== 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'play-close-'));
  try {
    fs.mkdirSync(path.join(root, 'data/mobile-signing/runtime'), { recursive: true });
    fs.mkdirSync(path.join(root, 'data/mobile-signing/reports'));
    fs.mkdirSync(path.join(root, 'mobile/build/app/outputs/bundle/release'), { recursive: true });
    const result = runPowerShellFixture(root, buildCleanupScenario('success'));
    assert.equal(result.outcome, 'success'); assert.equal(result.positiveReportBeforeClose, false);
    assert.equal(result.reports.length, 1); assert.equal(result.reports[0].passed, true);
    assert.equal(result.reports[0].privateArtifactReadyForReview, true); assert.equal(result.reports[0].cleanupComplete, true);
    assert.equal(result.remainingKeys, 0); assert.equal(result.lockExists, false); assert.equal(result.signingStreamsClosed, true);
    assert.match(result.reports[0].operationId, /^[0-9a-f]{32}$/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a locked or replaced owned runtime file leaves only a bound negative report and preserves foreign files', { skip: process.platform !== 'win32' }, () => {
  for (const mode of ['key-blocked', 'key-replaced', 'lock-replaced']) {
    const root = fs.mkdtempSync(path.join(tmpdir(), 'play-failure-'));
    try {
      fs.mkdirSync(path.join(root, 'data/mobile-signing/runtime'), { recursive: true });
      fs.mkdirSync(path.join(root, 'data/mobile-signing/reports'));
      fs.mkdirSync(path.join(root, 'mobile/build/app/outputs/bundle/release'), { recursive: true });
      const result = runPowerShellFixture(root, buildCleanupScenario(mode));
      assert.equal(result.outcome, 'ARTEN_PLAY_CLEANUP_FAILED', mode);
      assert.equal(result.positiveReportBeforeClose, false, mode); assert.equal(result.signingStreamsClosed, true, mode);
      assert.equal(result.reports.length, 1, mode);
      const report = result.reports[0];
      assert.equal(report.passed, false); assert.equal(report.signatureVerified, false); assert.equal(report.privateArtifactReadyForReview, false);
      assert.equal(report.cleanupComplete, false); assert.equal(report.failureCode, 'ARTEN_PLAY_CLEANUP_FAILED');
      assert.equal(report.readyForUpload, false); assert.equal(report.uploadExecuted, false);
      assert.match(report.operationId, /^[0-9a-f]{32}$/); assert.equal(report.bundleSha256, hash(Buffer.from('synthetic bundle')));
      assert.ok(report.artifact.endsWith(`arten-explorer-play-${report.operationId}.aab`));
      if (mode.endsWith('replaced')) assert.equal(result.foreignContent, 'foreign runtime file must survive');
      if (mode !== 'lock-replaced') assert.equal(result.lockExists, false, 'own lock still closes after failed key removal');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
});

function buildCleanupScenario(mode) {
  // Exercise the actual orchestration and actual Windows file handles. Only the
  // SDK/model/build children and their prerequisite cache are synthetic here.
  return `
$script:Mode = '${mode}'
$script:Blocker = $null; $script:ForeignPath = $null; $script:PositiveReportBeforeClose = $false
$password = [Text.Encoding]::UTF8.GetBytes(('A' * 64))
$key = [byte[]](1..200)
$pCipher = [Security.Cryptography.ProtectedData]::Protect($password,$fixtureSettings.Entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
$kCipher = [Security.Cryptography.ProtectedData]::Protect($key,$fixtureSettings.Entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
$script:SigningState = [pscustomobject]@{ UserSid = 'synthetic-user'; Metadata = [pscustomobject]@{certificateSha256 = ('ab' * 32)}
    Streams = @{password = [IO.MemoryStream]::new($pCipher,$false); keystore = [IO.MemoryStream]::new($kCipher,$false)} }
function Invoke-ArtenPlayCheck { return @{signingInitialized=$true;toolsPresent=$true} }
function Open-ArtenPlayBuildCache { return $fixtureSettings.Workspace }
function Open-ArtenPlaySigningState { return $script:SigningState }
function Assert-ArtenPlayAcl { }
function Get-ArtenPlaySdkInventory { return 'unchanged synthetic SDK descriptors' }
function Close-ArtenPlaySigningState($State) {
    $script:PositiveReportBeforeClose = @((Get-ChildItem -LiteralPath $fixtureSettings.Reports -Filter 'build-*.json') | ForEach-Object {
        $value = [IO.File]::ReadAllText($_.FullName) | ConvertFrom-Json
        if ($value.passed) { $true }
    }).Count -gt 0
    foreach ($stream in $State.Streams.Values) { $stream.Dispose() }
}
function Invoke-ArtenPlayChild($Executable,$Arguments,$Environment,$Secrets,$TimeoutSeconds) {
    if ($Arguments[0].EndsWith('flutter_tools.snapshot')) {
        $script:KeyPath = $Environment.ARTEN_PLAY_STORE_FILE
        [IO.File]::WriteAllText((Join-Path $fixtureSettings.Mobile 'build\\app\\outputs\\bundle\\release\\app-release.aab'),'synthetic bundle',[Text.UTF8Encoding]::new($false))
        return [pscustomobject]@{ExitCode=0;Output='synthetic build completed';Error=''}
    }
    if ($script:Mode -eq 'key-blocked') {
        $script:Blocker = [IO.File]::Open($script:KeyPath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    } elseif ($script:Mode -in @('key-replaced','lock-replaced')) {
        $script:ForeignPath = if ($script:Mode -eq 'key-replaced') {$script:KeyPath} else {Join-Path $fixtureSettings.Runtime 'build.lock'}
        [IO.File]::Move($script:ForeignPath,$script:ForeignPath+'.moved')
        [IO.File]::WriteAllText($script:ForeignPath,'foreign runtime file must survive')
    }
    $payload = @{passed=$true;signatureVerified=$true;manifest=@{packageName=$fixtureSettings.Package};certificateSha256=('ab' * 32)
        bundleSha256=(Get-FileHash -LiteralPath $Arguments[2] -Algorithm SHA256).Hash.ToLowerInvariant();uploadExecuted=$false;readyForUpload=$false}
    return [pscustomobject]@{ExitCode=0;Output=($payload|ConvertTo-Json -Depth 8 -Compress);Error=''}
}
$outcome = 'success'
try { $null = Invoke-ArtenPlayBuild } catch {$outcome = $_.Exception.Message}
finally { if ($null -ne $script:Blocker) {$script:Blocker.Dispose()} }
$reports = @((Get-ChildItem -LiteralPath $fixtureSettings.Reports -Filter 'build-*.json') | ForEach-Object {[IO.File]::ReadAllText($_.FullName)|ConvertFrom-Json})
[ordered]@{outcome=$outcome;positiveReportBeforeClose=$script:PositiveReportBeforeClose;reports=$reports
    remainingKeys=@(Get-ChildItem -LiteralPath $fixtureSettings.Runtime -Filter '*.jks').Count
    lockExists=(Test-Path -LiteralPath (Join-Path $fixtureSettings.Runtime 'build.lock'))
    signingStreamsClosed=(-not $script:SigningState.Streams.password.CanRead -and -not $script:SigningState.Streams.keystore.CanRead)
    foreignContent=$(if($script:ForeignPath -and (Test-Path -LiteralPath $script:ForeignPath)){[IO.File]::ReadAllText($script:ForeignPath)}else{$null})
} | ConvertTo-Json -Depth 12
`;
}
