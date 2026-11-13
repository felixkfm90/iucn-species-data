import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { assertCatalogTitleQuality } from './catalog-editorial.mjs';

export const PLAY_PACKAGE = 'de.fnwildlifetravel.arten_explorer';
export const APPROVED_LOGO_SHA256 = '63922bd5c1735dd4a31aa4d7c721adf2d16cc1b2a8082bf41f55403a6d22651e';
// Qualified against the same approved 1254x1254 image: AAPT2 recompresses PNG
// and clears RGB on four alpha=0 pixels; every alpha and visible RGB is exact.
// Canonical RGBA SHA256 (RGB=0 only for alpha=0) for both images:
// b361e943e888b7be108416c1028c4c97af39ad7d19389af93fcb9f1a497880ba
const approvedAaptLogoSha256 = '8494d70906ab35e699785d809d805bcec989fb5ea4893418e72d6eab924e776b';
const androidNamespace = 'http://schemas.android.com/apk/res/android';
const maxBundle = 512 * 1024 * 1024;
const maxEntry = 256 * 1024 * 1024;
const maxManifest = 4 * 1024 * 1024;
const signatureEntry = /^META-INF\/[A-Z0-9_-]{1,8}\.(?:SF|RSA)$/;
const nativeAssetsManifest = 'base/assets/flutter_assets/NativeAssetsManifest.json';
const scannerLicenseAsset = 'base/assets/flutter_assets/assets/licenses/zxing.txt';
const scannerLicenseSha256 = '9bf4bf90e0105bff3a5a8f1594f87fb27533fc6b8665ac656b62601e6114f4bb';
const emptyNativeAssets = Buffer.from('{"format-version":[1,0,0],"native-assets":{}}');
// Exact integer representations of the activity attributes in our Android
// manifest, also observed in its AAPT2-compiled release. No generic coercion.
const activityIntegerBindings = Object.freeze({
  configChanges: { raw: 'orientation|keyboardHidden|keyboard|screenSize|smallestScreenSize|locale|layoutDirection|fontScale|screenLayout|density|uiMode', value: '1073758132' },
  launchMode: { raw: 'singleTop', value: '1' },
  windowSoftInputMode: { raw: 'adjustResize', value: '16' },
});
const scannerActivity = 'com.journeyapps.barcodescanner.CaptureActivity';
const scannerIntegerBindings = Object.freeze({
  screenOrientation: { raw: 'portrait', value: '1' },
  windowSoftInputMode: { raw: 'stateAlwaysHidden', value: '3' },
});
const cameraPermission = 'android.permission.CAMERA';
const downloadPermissionNames = Object.freeze(['RUN_USER_INITIATED_JOBS', 'FOREGROUND_SERVICE',
  'POST_NOTIFICATIONS', 'WAKE_LOCK'].map(name => `android.permission.${name}`));
// The foreground-service fallback runs only on API26–33. API34+ uses UIDT.
const legacyPermissionCaps = new Set(['android.permission.FOREGROUND_SERVICE', 'android.permission.WAKE_LOCK']);
const downloadComponents = Object.freeze({
  job: `${PLAY_PACKAGE}.OfflineDownloadJobService`,
  legacy: `${PLAY_PACKAGE}.OfflineDownloadLegacyService`,
  cancel: `${PLAY_PACKAGE}.OfflineDownloadCancelReceiver`,
});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const text = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
function ensure(value, message) { assert.ok(value, message); }

export function parsePlayVersion(pubspec) {
  const matches = [...pubspec.matchAll(/^version:\s*(\d+\.\d+\.\d+)\+([1-9][0-9]*)\s*$/gm)];
  ensure(matches.length === 1, 'Eine eindeutige Appversion mit positiver Buildnummer ist erforderlich.');
  const versionCode = Number(matches[0][2]);
  ensure(Number.isSafeInteger(versionCode) && versionCode < 2100000000, 'Die Android-Buildnummer ist zu groß.');
  return { versionName: matches[0][1], versionCode };
}

function safeName(name) {
  ensure(typeof name === 'string' && name.length > 0 && name.length < 2048 && !/^[\/]|[\\:\x00-\x1f\x7f]/.test(name), 'Unsicherer Bundlepfad.');
  for (const part of name.replace(/\/$/, '').split('/')) {
    ensure(part && part !== '.' && part !== '..' && part.length <= 255 && !/[. ]$/.test(part)
      && !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part), 'Unsicherer Bundlepfad.');
  }
  return name;
}

export const statusGraphicSources = Object.freeze(Object.fromEntries([
  ...['NE', 'DD', 'LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX']
    .map(code => [`${code}.png`, `graphics/catagory/Alternativ/${code}.png`]),
  ...['zunehmend', 'stabil', 'abnehmend', 'nodata']
    .map(trend => [`${trend}.png`, `graphics/trend/${trend}.png`]),
]));
const graphicPrefix = 'base/assets/flutter_assets/assets/status-graphics/';
const graphicPaths = new Set(Object.keys(statusGraphicSources).map(name => graphicPrefix + name));

export function readBundleEntries(archive) {
  ensure(Buffer.isBuffer(archive) && archive.length >= 22 && archive.length <= maxBundle, 'Bundlegröße ist unzulässig.');
  let end = -1;
  for (let i = archive.length - 22; i >= Math.max(0, archive.length - 65557); i--) {
    if (archive.readUInt32LE(i) === 0x06054b50 && i + 22 + archive.readUInt16LE(i + 20) === archive.length) { end = i; break; }
  }
  ensure(end >= 0, 'Bundle-ZIP-Verzeichnis fehlt.');
  const count = archive.readUInt16LE(end + 10), centralBytes = archive.readUInt32LE(end + 12), central = archive.readUInt32LE(end + 16);
  ensure(archive.readUInt16LE(end + 4) === 0 && archive.readUInt16LE(end + 6) === 0
    && archive.readUInt16LE(end + 8) === count && count > 0 && count < 10000
    && central + centralBytes === end, 'Mehrteilige/ZIP64/uneindeutige Bundles sind nicht unterstützt.');
  const entries = new Map(), folded = new Set(), ranges = [];
  let cursor = central, expanded = 0;
  for (let i = 0; i < count; i++) {
    ensure(cursor + 46 <= end && archive.readUInt32LE(cursor) === 0x02014b50, 'Ungültiger ZIP-Verzeichniseintrag.');
    const flags = archive.readUInt16LE(cursor + 8), method = archive.readUInt16LE(cursor + 10);
    const compressed = archive.readUInt32LE(cursor + 20), bytes = archive.readUInt32LE(cursor + 24);
    const length = archive.readUInt16LE(cursor + 28), extra = archive.readUInt16LE(cursor + 30), comment = archive.readUInt16LE(cursor + 32);
    const offset = archive.readUInt32LE(cursor + 42), endEntry = cursor + 46 + length + extra + comment;
    ensure(endEntry <= end && archive.readUInt16LE(cursor + 34) === 0 && !(flags & 1)
      && (method === 0 || method === 8) && compressed <= maxEntry && bytes <= maxEntry
      && ((archive.readUInt32LE(cursor + 38) >>> 16) & 0xf000) !== 0xa000, 'Verknüpfter, verschlüsselter oder zu großer ZIP-Eintrag.');
    const name = safeName(text(archive.subarray(cursor + 46, cursor + 46 + length)));
    ensure(!entries.has(name) && !folded.has(name.toLowerCase()), 'Doppelter oder mehrdeutiger Bundlepfad.');
    ensure(offset + 30 <= central && archive.readUInt32LE(offset) === 0x04034b50, 'Lokaler ZIP-Eintrag fehlt.');
    const localNameLength = archive.readUInt16LE(offset + 26), localExtra = archive.readUInt16LE(offset + 28);
    const dataStart = offset + 30 + localNameLength + localExtra, dataEnd = dataStart + compressed;
    ensure(dataEnd <= central && archive.readUInt16LE(offset + 6) === flags && archive.readUInt16LE(offset + 8) === method
      && text(archive.subarray(offset + 30, offset + 30 + localNameLength)) === name, 'Lokaler ZIP-Eintrag widerspricht dem Verzeichnis.');
    if (!(flags & 8)) ensure(archive.readUInt32LE(offset + 18) === compressed && archive.readUInt32LE(offset + 22) === bytes, 'ZIP-Größen widersprechen sich.');
    expanded += bytes;
    ensure(expanded <= 1024 * 1024 * 1024, 'Entpacktes Bundle überschreitet die Prüfgrenze.');
    const base = name.split('/').at(-1).toLowerCase();
    ensure(!/\.(?:jks|keystore|dpapi|sqlite|sqlite3|db|p12|pfx|pem|key|dng|cr2|cr3|nef|arw|lrcat)$/i.test(base)
      && !/^(?:\.env(?:\..*)?|key\.properties|local\.properties|signing\.json|password[^/]*|credentials[^/]*)$/i.test(base), 'Privater Dateiinhalt im Bundle.');
    if (/\.(?:jpe?g|webp|avif|heic|mp3|wav|flac)$/i.test(base)) ensure(name.startsWith('base/res/'), 'Nicht genehmigte Offlinefotografie oder Tondatei im Bundle.');
    if (/\.png$/i.test(base)) ensure(name.startsWith('base/res/') || name === 'base/assets/flutter_assets/assets/arten-explorer.png'
      || graphicPaths.has(name), 'Nicht genehmigtes Bildasset im Bundle.');
    if (name.startsWith('base/assets/') && !name.endsWith('/')) {
      ensure(name === nativeAssetsManifest || name === scannerLicenseAsset || /^base\/assets\/flutter_assets\/(?:assets\/(?:arten-explorer\.png|catalog\.json|catalog-manifest\.json)|AssetManifest\.(?:bin(?:\.json)?|json)|FontManifest\.json|NOTICES(?:\.Z)?|fonts\/MaterialIcons-Regular\.otf|shaders\/(?:ink_sparkle|stretch_effect)\.frag)$/.test(name)
        || graphicPaths.has(name) || /^base\/assets\/dexopt\/baseline\.profm?$/.test(name), 'Nicht ausdrücklich freigegebener Bundle-Assetpfad.');
    }
    entries.set(name, { name, bytes, read() {
      const raw = archive.subarray(dataStart, dataEnd);
      const result = method === 0 ? raw : inflateRawSync(raw, { maxOutputLength: Math.max(1, bytes) });
      ensure(result.length === bytes, 'ZIP-Inhalt hat eine abweichende Länge.');
      return result;
    } });
    ranges.push([offset, dataEnd]); folded.add(name.toLowerCase()); cursor = endEntry;
  }
  ensure(cursor === end, 'ZIP-Verzeichnis wurde nicht vollständig gelesen.');
  ranges.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i++) ensure(ranges[i - 1][1] <= ranges[i][0], 'Überlappende ZIP-Einträge.');
  return entries;
}

// AAB manifests use AAPT2's XmlNode/XmlElement protobuf, not APK binary XML.
// Wire fields are read without extraction or invoking a downloaded bundletool.
function varint(buffer, offset) {
  let value = 0n;
  for (let n = 0; n < 10; n++) {
    ensure(offset < buffer.length, 'Abgebrochener Manifestwert.');
    const byte = buffer[offset++]; value |= BigInt(byte & 127) << BigInt(n * 7);
    if (!(byte & 128)) { ensure(value <= BigInt(Number.MAX_SAFE_INTEGER), 'Manifestzahl ist zu groß.'); return [Number(value), offset]; }
  }
  throw new Error('Ungültiger Manifestwert.');
}
function fields(buffer) {
  const result = new Map(); let offset = 0, count = 0;
  while (offset < buffer.length) {
    ensure(++count < 100000, 'Zu viele Manifestfelder.');
    let tag; [tag, offset] = varint(buffer, offset);
    const number = tag >>> 3, wire = tag & 7; let value;
    ensure(number > 0, 'Ungültige Manifestfeldnummer.');
    if (wire === 0) [value, offset] = varint(buffer, offset);
    else if (wire === 2) { let size; [size, offset] = varint(buffer, offset); ensure(offset + size <= buffer.length, 'Manifestfeld abgeschnitten.'); value = buffer.subarray(offset, offset += size); }
    else if (wire === 1 || wire === 5) { const size = wire === 1 ? 8 : 4; ensure(offset + size <= buffer.length, 'Manifestfeld abgeschnitten.'); value = buffer.subarray(offset, offset += size); }
    else throw new Error('Nicht unterstütztes Manifestformat.');
    if (!result.has(number)) result.set(number, []);
    result.get(number).push({ wire, value });
  }
  return result;
}
function one(map, id, wire, required = false) {
  const values = map.get(id) || [];
  ensure(values.length <= 1 && (!required || values.length === 1) && (!values.length || values[0].wire === wire), 'Mehrdeutiges Manifestfeld.');
  return values[0]?.value;
}
function string(map, id, required = false) { const value = one(map, id, 2, required); return value === undefined ? undefined : text(value); }
function compiledValue(buffer) {
  const item = fields(buffer), variants = [1, 2, 3, 4, 5, 6, 7].filter(id => item.has(id));
  ensure(variants.length === 1, 'Mehrdeutiger kompilierter Manifestwert.');
  const kind = variants[0], nested = fields(one(item, kind, 2, true));
  if (kind === 2 || kind === 3) return { value: string(nested, 1, true), kind: 'string' };
  if (kind === 7) {
    const slots = [6, 7, 8].filter(id => nested.has(id));
    ensure(slots.length === 1, 'Nicht unterstützter primitiver Manifestwert.');
    const value = one(nested, slots[0], 0, true);
    ensure(slots[0] !== 8 || value === 0 || value === 1, 'Ungültiger Wahrheitswert.');
    return { value: slots[0] === 8 ? Boolean(value) : String(value), kind: slots[0] === 8 ? 'boolean' : 'integer' };
  }
  if (kind === 1) return { value: one(nested, 2, 0), kind: 'reference', referenceName: string(nested, 3) };
  return { value: null, kind: 'unsupported' };
}
export function parseBundleManifest(buffer) {
  ensure(Buffer.isBuffer(buffer) && buffer.length > 0 && buffer.length <= maxManifest, 'Manifestgröße ist unzulässig.');
  let nodes = 0;
  function node(bytes, depth = 0) {
    ensure(depth <= 64 && ++nodes <= 10000, 'Manifeststruktur ist zu groß.');
    const outer = fields(bytes), element = one(outer, 1, 2);
    ensure(!(element && outer.has(2)), 'Manifestknoten ist mehrdeutig.');
    if (!element) { ensure(string(outer, 2, true).trim() === '', 'Unerwarteter Text im Android-Manifest.'); return null; }
    const inner = fields(element), name = string(inner, 3, true), attrs = new Map();
    for (const field of inner.get(4) || []) {
      ensure(field.wire === 2, 'Ungültiges Manifestattribut.');
      const attr = fields(field.value), namespace = string(attr, 1) || '', attributeName = string(attr, 2, true), serializedRaw = string(attr, 3);
      const compiled = one(attr, 6, 2);
      // Proto3 omits an empty string. Our explicit android:taskAffinity=""
      // therefore has no raw/compiled payload; bind that case to its real ID.
      const emptyTaskAffinity = name === 'activity' && namespace === androidNamespace && attributeName === 'taskAffinity'
        && serializedRaw === undefined && compiled === undefined && one(attr, 5, 0) === 0x01010012;
      const raw = emptyTaskAffinity ? '' : serializedRaw;
      const value = compiled ? compiledValue(compiled) : { value: raw, kind: 'string' };
      ensure(raw !== undefined || compiled, 'Leeres Manifestattribut.');
      // AndroidX declares its own permission with the enum spelling "signature";
      // AAPT2 stores the same protection level as integer 2. Accept only this
      // exact permission attribute/enum binding, never general integer coercion.
      const signatureProtection = name === 'permission' && namespace === androidNamespace && attributeName === 'protectionLevel';
      if (signatureProtection && compiled) ensure(value.kind === 'integer' && value.value === '2'
        && (raw === undefined || ['signature', '2', '0x2'].includes(raw)), 'Eigene Android-Berechtigung ist nicht konsistent signaturgeschützt.');
      const activityBinding = name === 'activity' && namespace === androidNamespace
        ? [activityIntegerBindings, scannerIntegerBindings].map(bindings => Object.hasOwn(bindings, attributeName)
          ? bindings[attributeName] : null).find(binding => binding?.raw === raw) : null;
      if (activityBinding && compiled) ensure(value.kind === 'integer' && value.value === activityBinding.value, 'Android-Aktivitätsattribut widerspricht seiner kompilierten Integerbindung.');
      // Our only foreground service requests dataSync (the exact AAPT2 flag1).
      // This is not a generic enum or integer coercion for unrelated attributes.
      const foregroundType = name === 'service' && namespace === androidNamespace && attributeName === 'foregroundServiceType';
      if (foregroundType && compiled) ensure(value.kind === 'integer' && value.value === '1'
        && (raw === undefined || ['dataSync', '1', '0x1'].includes(raw)), 'Android-FGS-Typ ist nicht konsistent an dataSync gebunden.');
      const enumMatches = (signatureProtection && value.kind === 'integer' && value.value === '2' && ['signature', '0x2'].includes(raw))
        || (activityBinding && value.kind === 'integer' && value.value === activityBinding.value)
        || (foregroundType && value.kind === 'integer' && value.value === '1' && ['dataSync', '0x1'].includes(raw));
      if (raw !== undefined && value.kind !== 'reference') ensure(String(value.value) === raw || enumMatches, 'Roher und kompilierter Manifestwert widersprechen sich.');
      const key = `${namespace}|${attributeName}`;
      ensure(!attrs.has(key), 'Doppeltes Manifestattribut.'); attrs.set(key, value);
    }
    const children = (inner.get(5) || []).map(field => { ensure(field.wire === 2, 'Ungültiger Manifestknoten.'); return node(field.value, depth + 1); }).filter(Boolean);
    return { name, namespace: string(inner, 2) || '', attrs, children };
  }
  return node(buffer);
}
function attr(node, name, namespace = androidNamespace) { return node.attrs.get(`${namespace}|${name}`)?.value; }
function exactAttributes(node, names) {
  return !node.namespace && node.attrs.size === names.length
    && names.every(name => node.attrs.has(`${androidNamespace}|${name}`));
}
function checkNativeComponents(app, enabled, pairingScanner) {
  const kinds = new Set(['activity', 'activity-alias', 'service', 'receiver', 'provider']);
  const components = app.children.filter(node => kinds.has(node.name));
  const names = components.map(node => attr(node, 'name'));
  ensure(names.every(name => typeof name === 'string' && name.length > 0) && new Set(names).size === names.length,
    'Mehrdeutige Android-Komponenten.');
  const mainName = `${PLAY_PACKAGE}.MainActivity`;
  const main = components.filter(node => node.name === 'activity' && attr(node, 'name') === mainName);
  ensure(main.length === 1 && !main[0].namespace && attr(main[0], 'exported') === true, 'Eigene Startaktivität fehlt.');
  const scanner = components.find(node => attr(node, 'name') === scannerActivity);
  ensure(Boolean(scanner) === pairingScanner, 'Scanner-Aktivität fehlt oder ist für diese Version nicht freigegeben.');
  if (scanner) {
    const theme = scanner.attrs.get(`${androidNamespace}|theme`);
    ensure(scanner.name === 'activity' && exactAttributes(scanner, ['name', 'exported', 'clearTaskOnLaunch',
      'screenOrientation', 'stateNotNeeded', 'theme', 'windowSoftInputMode'])
      && attr(scanner, 'exported') === false && scanner.children.length === 0
      && attr(scanner, 'clearTaskOnLaunch') === true && attr(scanner, 'stateNotNeeded') === true
      && attr(scanner, 'screenOrientation') === '1' && attr(scanner, 'windowSoftInputMode') === '3'
      && theme?.kind === 'reference' && Number.isSafeInteger(theme.value) && theme.value > 0,
    'QR-Scanner muss eine private Aktivität ohne Eingangsfilter sein.');
  }
  for (const [kind, name] of Object.entries(downloadComponents)) {
    const found = components.filter(node => attr(node, 'name') === name);
    ensure(found.length === (enabled ? 1 : 0), 'Native Downloadkomponente fehlt oder ist für diese Version nicht freigegeben.');
    if (!enabled) continue;
    const node = found[0], service = kind !== 'cancel';
    const attributes = ['name', 'exported', ...(kind === 'job' ? ['permission'] : kind === 'legacy' ? ['foregroundServiceType'] : [])];
    ensure(node.name === (service ? 'service' : 'receiver') && exactAttributes(node, attributes)
      && attr(node, 'exported') === false && node.children.length === 0, 'Native Downloadkomponente hat ungeprüfte Eigenschaften oder Exporte.');
    if (kind === 'job') ensure(attr(node, 'permission') === 'android.permission.BIND_JOB_SERVICE', 'Download-Jobservice benötigt BIND_JOB_SERVICE.');
    if (kind === 'legacy') {
      const type = node.attrs.get(`${androidNamespace}|foregroundServiceType`);
      ensure(type?.kind === 'integer' && type.value === '1', 'Download-Vordergrunddienst benötigt genau den FGS-Typ dataSync.');
    }
  }
  const expectedProfileActions = ['INSTALL_PROFILE', 'SKIP_FILE', 'SAVE_PROFILE', 'BENCHMARK_OPERATION']
    .map(action => `androidx.profileinstaller.action.${action}`);
  for (const node of components) {
    const name = attr(node, 'name');
    if (name === mainName || name === scannerActivity || Object.values(downloadComponents).includes(name)) continue;
    if (node.name === 'provider' && name === 'androidx.startup.InitializationProvider') {
      ensure(exactAttributes(node, ['name', 'authorities', 'exported']) && attr(node, 'exported') === false
        && attr(node, 'authorities') === `${PLAY_PACKAGE}.androidx-startup`, 'Ungeprüfter AndroidX-Startprovider.');
      const metadata = node.children.map(child => attr(child, 'name'));
      ensure(metadata.length === 2 && new Set(metadata).size === 2
        && metadata.includes('androidx.lifecycle.ProcessLifecycleInitializer')
        && metadata.includes('androidx.profileinstaller.ProfileInstallerInitializer')
        && node.children.every(child => child.name === 'meta-data' && exactAttributes(child, ['name', 'value'])
          && attr(child, 'value') === 'androidx.startup' && child.children.length === 0), 'Ungeprüfte AndroidX-Startinitialisierung.');
      continue;
    }
    if (node.name === 'receiver' && name === 'androidx.profileinstaller.ProfileInstallReceiver') {
      ensure(exactAttributes(node, ['name', 'directBootAware', 'enabled', 'exported', 'permission'])
        && attr(node, 'directBootAware') === false && attr(node, 'enabled') === true && attr(node, 'exported') === true
        && attr(node, 'permission') === 'android.permission.DUMP', 'Ungeprüfter AndroidX-Profilexport.');
      const actions = node.children.map(filter => {
        ensure(filter.name === 'intent-filter' && exactAttributes(filter, []) && filter.children.length === 1,
          'Ungeprüfter AndroidX-Profilfilter.');
        const action = filter.children[0];
        ensure(action.name === 'action' && exactAttributes(action, ['name']) && action.children.length === 0,
          'Ungeprüfte AndroidX-Profilaktion.');
        return attr(action, 'name');
      });
      ensure(actions.length === expectedProfileActions.length && new Set(actions).size === actions.length
        && actions.every(action => expectedProfileActions.includes(action)), 'Ungeprüfte AndroidX-Profilaktionen.');
      continue;
    }
    throw new Error('Nicht geprüfte Android-Komponente oder neuer Export.');
  }
}
export function checkBundleManifest(buffer, expectedVersion) {
  const root = parseBundleManifest(buffer);
  ensure(root.name === 'manifest' && !root.namespace, 'Android-Manifestwurzel fehlt.');
  ensure(attr(root, 'package', '') === PLAY_PACKAGE, 'Falsche Android-Anwendungskennung.');
  ensure(attr(root, 'versionName') === expectedVersion.versionName && attr(root, 'versionCode') === String(expectedVersion.versionCode), 'Bundleversion stimmt nicht mit pubspec überein.');
  const sdk = root.children.filter(item => item.name === 'uses-sdk'), apps = root.children.filter(item => item.name === 'application');
  ensure(sdk.length === 1 && attr(sdk[0], 'minSdkVersion') === '26' && attr(sdk[0], 'targetSdkVersion') === '36', 'SDK-Grenzen des Bundles sind abweichend.');
  ensure(apps.length === 1 && attr(apps[0], 'allowBackup') === false && attr(apps[0], 'usesCleartextTraffic') === false
    && attr(apps[0], 'debuggable') !== true && attr(apps[0], 'testOnly') !== true, 'Release-/Transportschutz fehlt.');
  ensure(!apps[0].attrs.has(`${androidNamespace}|networkSecurityConfig`), 'Nicht geprüfte Netzwerküberschreibung.');
  const icon = apps[0].attrs.get(`${androidNamespace}|icon`);
  ensure(icon?.kind === 'reference' && Number.isSafeInteger(icon.value) && icon.value > 0, 'Gebundener nativer Logo-Ressourcenverweis fehlt.');
  const roundIcon = apps[0].attrs.get(`${androidNamespace}|roundIcon`);
  ensure(!roundIcon || (roundIcon.kind === 'reference' && roundIcon.value === icon.value), 'Abweichender runder Launcher verweist auf ein anderes Logo.');
  const permission = `${PLAY_PACKAGE}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`;
  const nativeDownloads = expectedVersion.versionCode >= 4;
  const pairingScanner = expectedVersion.versionCode >= 8;
  const permissionNodes = root.children.filter(item => item.name === 'uses-permission');
  const permissions = permissionNodes.map(item => attr(item, 'name'));
  const allowedPermissions = ['android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE', permission,
    ...(nativeDownloads ? downloadPermissionNames : []), ...(pairingScanner ? [cameraPermission] : [])];
  // The existing Media3 common/exoplayer 1.4.1 dependency contributes this
  // normal read-only permission (manifest-merger report); no network changes.
  ensure(new Set(permissions).size === permissions.length && permissions.includes('android.permission.INTERNET')
    && permissions.every(name => allowedPermissions.includes(name))
    && permissionNodes.every(node => {
      const capped = nativeDownloads && legacyPermissionCaps.has(attr(node, 'name'));
      return exactAttributes(node, capped ? ['name', 'maxSdkVersion'] : ['name']) && node.children.length === 0
        && (!capped || attr(node, 'maxSdkVersion') === '33');
    })
    && (!nativeDownloads || ['android.permission.ACCESS_NETWORK_STATE', ...downloadPermissionNames].every(name => permissions.includes(name)))
    && (!pairingScanner || permissions.includes(cameraPermission))
    && !root.children.some(item => item.name.startsWith('uses-permission-')), 'Nicht geprüfte Android-Berechtigungen.');
  if (pairingScanner) {
    const features = root.children.filter(item => item.name === 'uses-feature' && /^android\.hardware\.camera(?:\.|$)/.test(attr(item, 'name')));
    const names = features.map(item => attr(item, 'name'));
    ensure(['android.hardware.camera', 'android.hardware.camera.front', 'android.hardware.camera.autofocus', 'android.hardware.camera.flash']
      .every(name => names.includes(name)) && new Set(names).size === features.length
      && features.every(item => exactAttributes(item, ['name', 'required']) && attr(item, 'required') === false && item.children.length === 0),
    'Die Kamera muss für die optionale QR-Kopplung unverbindlich bleiben.');
  }
  for (const declared of root.children.filter(item => item.name === 'permission')) ensure(attr(declared, 'name') === permission
    && ['signature', '2'].includes(attr(declared, 'protectionLevel')), 'Nicht geprüfte eigene Android-Berechtigung.');
  checkNativeComponents(apps[0], nativeDownloads, pairingScanner);
  return { packageName: PLAY_PACKAGE, ...expectedVersion, minSdk: 26, targetSdk: 36, permissions, nativeDownloads, iconResourceId: icon.value, debuggable: false, allowBackup: false, usesCleartextTraffic: false };
}

// ResourceTable/Package/Type/Entry/ConfigValue fields follow AOSP Resources.proto:
// https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/tools/aapt2/Resources.proto
function checkLauncherResource(buffer, iconResourceId, nativePath) {
  const table = fields(buffer), matches = [], ids = new Set();
  for (const packageField of table.get(2) || []) {
    ensure(packageField.wire === 2, 'Ungültige Ressourcentabelle.');
    const pack = fields(packageField.value), packageId = one(fields(one(pack, 1, 2, true)), 1, 0) ?? 0;
    ensure(packageId > 0 && packageId <= 255, 'Ungültige Ressourcenpaketkennung.');
    for (const typeField of pack.get(3) || []) {
      ensure(typeField.wire === 2, 'Ungültiger Ressourcentyp.');
      const type = fields(typeField.value), typeId = one(fields(one(type, 1, 2, true)), 1, 0) ?? 0;
      ensure(typeId > 0 && typeId <= 255, 'Ungültige Ressourcentypkennung.');
      for (const entryField of type.get(3) || []) {
        ensure(entryField.wire === 2, 'Ungültiger Ressourceneintrag.');
        const entry = fields(entryField.value), entryId = one(fields(one(entry, 1, 2, true)), 1, 0) ?? 0;
        ensure(entryId <= 65535, 'Ungültige Ressourceneintragskennung.');
        const id = packageId * 0x1000000 + typeId * 0x10000 + entryId;
        ensure(!ids.has(id), 'Doppelte Ressourcenkennung.'); ids.add(id);
        if (id !== iconResourceId) continue;
        ensure(string(pack, 2, true) === PLAY_PACKAGE && string(type, 2, true) === 'drawable'
          && string(entry, 2, true) === 'arten_explorer' && !entry.has(8), 'Appsymbol verweist nicht auf die genehmigte eigene Logoressource.');
        const values = entry.get(6) || [];
        ensure(values.length > 0, 'Logoressource hat keinen Bildinhalt.');
        for (const config of values) {
          ensure(config.wire === 2, 'Ungültige Logokonfiguration.');
          const value = fields(one(fields(config.value), 2, 2, true));
          ensure(!value.has(5), 'Zusammengesetzte Logoressource ist nicht freigegeben.');
          const item = fields(one(value, 4, 2, true));
          ensure([1, 2, 3, 4, 5, 6, 7].filter(key => item.has(key)).join() === '5', 'Logoressource ist kein direkt gebundenes Bild.');
          const file = fields(one(item, 5, 2, true));
          ensure(`base/${string(file, 1, true)}` === nativePath && one(file, 2, 0) === 1, 'Logoressource ist an eine andere Bilddatei gebunden.');
        }
        matches.push(id);
      }
    }
  }
  ensure(matches.length === 1, 'Eindeutige Logoressourcenbindung fehlt.');
}

function jarSections(buffer) {
  ensure(buffer.length <= maxManifest && !buffer.includes(0), 'JAR-Manifestgröße ist unzulässig.');
  const unfolded = [];
  for (const line of text(buffer).replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')) {
    if (line.startsWith(' ')) { ensure(unfolded.length && unfolded.at(-1), 'Ungültige JAR-Fortsetzung.'); unfolded[unfolded.length - 1] += line.slice(1); }
    else unfolded.push(line);
  }
  const sections = [];
  for (const chunk of unfolded.join('\n').split(/\n\n+/).filter(Boolean)) {
    const section = new Map();
    for (const line of chunk.split('\n')) {
      const match = line.match(/^([A-Za-z0-9_-]{1,70}): (.*)$/);
      ensure(match && !section.has(match[1].toLowerCase()), 'Ungültiger oder doppelter JAR-Header.');
      section.set(match[1].toLowerCase(), match[2]);
    }
    sections.push(section);
  }
  ensure(sections.length > 0, 'JAR-Manifest fehlt.'); return sections;
}
function checkDigest(value, bytes) {
  ensure(typeof value === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(value)
    && createHash('sha256').update(bytes).digest('base64') === value, 'JAR-SHA256-Inhaltsbindung ist ungültig.');
}
export function checkNativeLogoSha256(sha256, nativePath) {
  ensure(sha256 === APPROVED_LOGO_SHA256 || (sha256 === approvedAaptLogoSha256 && nativePath === 'base/res/drawable-nodpi-v4/arten_explorer.png'), 'Native Logoressource ist nicht exakt an das genehmigte Logo gebunden.');
  return sha256;
}
export function verifyBundlePayload(archive, { version, catalog, catalogManifest, statusGraphics = new Map(), expectedLogoSha256 = APPROVED_LOGO_SHA256 }) {
  ensure(expectedLogoSha256 === APPROVED_LOGO_SHA256, 'Das genehmigte Logo darf nicht überschrieben werden.');
  const entries = readBundleEntries(archive);
  function read(name, max = maxEntry) { const entry = entries.get(name); ensure(entry && entry.bytes <= max, `Pflichteintrag fehlt oder ist zu groß: ${name}`); return entry.read(); }
  const signatures = [...entries.keys()].filter(name => signatureEntry.test(name));
  ensure(signatures.length === 2 && signatures.some(name => name.endsWith('.SF')) && signatures.some(name => name.endsWith('.RSA'))
    && signatures[0].replace(/\.[^.]+$/, '') === signatures[1].replace(/\.[^.]+$/, ''), 'Genau eine eigene RSA-JAR-Signatur ist erforderlich.');
  ensure(![...entries.keys()].some(name => /^META-INF\/[^/]+\.(?:SF|RSA|DSA|EC)$/i.test(name) && !signatureEntry.test(name)), 'Nicht unterstützte oder mehrdeutige JAR-Signatur.');
  const manifestBytes = read('META-INF/MANIFEST.MF', maxManifest), sections = jarSections(manifestBytes);
  ensure(sections[0].get('manifest-version') === '1.0' && !sections[0].has('name'), 'Ungültiges JAR-Hauptmanifest.');
  const sf = jarSections(read(signatures.find(name => name.endsWith('.SF')), maxManifest));
  ensure(sf[0].get('signature-version') === '1.0', 'Ungültige JAR-Signaturmetadaten.');
  checkDigest(sf[0].get('sha-256-digest-manifest'), manifestBytes);
  const payload = new Set([...entries.keys()].filter(name => !name.endsWith('/') && name !== 'META-INF/MANIFEST.MF' && !signatureEntry.test(name)));
  const seen = new Set();
  for (const section of sections.slice(1)) {
    const name = section.get('name');
    ensure(section.keys().next().value === 'name' && payload.has(name) && !seen.has(name), 'JAR-Manifest deckt nicht genau den Bundleinhalt ab.');
    checkDigest(section.get('sha-256-digest'), read(name)); seen.add(name);
  }
  ensure(seen.size === payload.size, 'Nicht signierter zusätzlicher Bundleinhalt.');
  const manifest = checkBundleManifest(read('base/manifest/AndroidManifest.xml', maxManifest), version);
  if (version.versionCode >= 8) {
    ensure(sha(read(scannerLicenseAsset, 64 * 1024)) === scannerLicenseSha256, 'Lizenztext des QR-Scanners weicht ab.');
  } else ensure(!entries.has(scannerLicenseAsset), 'QR-Scanner-Lizenz ist für diese Version nicht vorgesehen.');
  // Flutter's Android target packages this generated runtime manifest. The
  // present app has no code assets; only its exact empty v1 payload is admitted.
  // Nonempty native bindings require a separately reviewed packaging contract.
  if (entries.has(nativeAssetsManifest)) ensure(read(nativeAssetsManifest, 1024).equals(emptyNativeAssets), 'Nicht freigegebene native Flutter-Assetbindungen.');
  ensure(sha(read('base/assets/flutter_assets/assets/arten-explorer.png', 16 * 1024 * 1024)) === APPROVED_LOGO_SHA256, 'Flutter-Logo weicht vom genehmigten Logo ab.');
  const nativeLogos = [...entries.keys()].filter(name => /^base\/res\/drawable[^/]*\/arten_explorer\.png$/.test(name));
  ensure(nativeLogos.length === 1, 'Native Logoressource ist nicht eindeutig vorhanden.');
  const nativeLogoSha256 = checkNativeLogoSha256(sha(read(nativeLogos[0], 16 * 1024 * 1024)), nativeLogos[0]);
  checkLauncherResource(read('base/resources.pb', 16 * 1024 * 1024), manifest.iconResourceId, nativeLogos[0]);
  ensure(Buffer.isBuffer(catalog) && Buffer.isBuffer(catalogManifest), 'Gebundener öffentlicher Anfangsbestand fehlt.');
  const manifestData = JSON.parse(text(catalogManifest));
  ensure(manifestData.catalogSha256 === sha(catalog), 'Öffentlicher Quellkatalog hat eine abweichende Prüfsumme.');
  assertCatalogTitleQuality(JSON.parse(text(catalog)));
  ensure(read('base/assets/flutter_assets/assets/catalog.json').equals(catalog)
    && read('base/assets/flutter_assets/assets/catalog-manifest.json').equals(catalogManifest), 'Anfangsbestand im Bundle ist abweichend.');
  for (const graphicPath of graphicPaths) {
    const expected = statusGraphics.get(graphicPath);
    if (expected == null) ensure(!entries.has(graphicPath), 'Statusgrafik ohne gebundene Websitequelle.');
    else ensure(read(graphicPath, 128 * 1024).equals(expected), `Statusgrafik weicht von der Websitequelle ab: ${graphicPath}`);
  }
  return { manifest, bundleSha256: sha(archive), bytes: archive.length, payloadFiles: seen.size, approvedLogoSha256: APPROVED_LOGO_SHA256, nativeLogoSha256,
    catalogSha256: sha(catalog), statusGraphicCount: statusGraphics.size };
}

function runReleaseTool(filename, args, options) {
  const result = spawnSync(filename, args, options);
  ensure(!result.error && result.status === 0 && !result.signal, 'Signaturwerkzeug nicht erfolgreich abgeschlossen.');
  const output = `${result.stdout}\n${result.stderr}`;
  ensure(output.length <= 8 * 1024 * 1024, 'Signaturausgabe ist zu groß.');
  return output;
}
export function verifyUploadSignature(bundlePath, { jdkRoot, certificateSha256, runTool = runReleaseTool } = {}) {
  ensure(typeof certificateSha256 === 'string' && /^[a-f0-9]{64}$/.test(certificateSha256), 'Öffentlicher Uploadzertifikat-Fingerabdruck fehlt.');
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^ARTEN_PLAY_/i.test(key)) delete env[key];
  const options = { encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024, env, stdio: ['ignore', 'pipe', 'pipe'] };
  const common = ['-J-Duser.language=en', '-J-Duser.country=US'];
  const signed = runTool(path.join(jdkRoot, 'bin/jarsigner.exe'), [...common, '-verify', bundlePath], options);
  ensure(/^jar verified\.$/m.test(signed) && !/treated as unsigned|jar is unsigned|unsigned entries|has expired|not yet valid/i.test(signed), 'Vollständige gültige JAR-Signatur fehlt.');
  const cert = runTool(path.join(jdkRoot, 'bin/keytool.exe'), [...common, '-printcert', '-jarfile', bundlePath], options);
  const fingerprints = [...cert.matchAll(/^\s*SHA256:\s*([0-9a-f:]+)\s*$/gim)].map(match => match[1].replaceAll(':', '').toLowerCase());
  ensure(fingerprints.length === 1 && fingerprints[0] === certificateSha256 && [...cert.matchAll(/Signer #(\d+)/g)].map(match => match[1]).join() === '1'
    && !/CN\s*=\s*Android Debug(?:,|\s*$)/im.test(cert), 'Bundle ist nicht mit dem eigenen geprüften Uploadzertifikat signiert.');
  return { signatureVerified: true, certificateSha256 };
}

function stableFile(filename, maxBytes) {
  const full = path.resolve(filename);
  for (let part = full; ; part = path.dirname(part)) {
    const info = fs.lstatSync(part); ensure(!info.isSymbolicLink(), 'Verknüpfte Releasequelle.');
    if (part === path.dirname(part)) break;
  }
  const fd = fs.openSync(full, 'r');
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    ensure(before.isFile() && before.nlink === 1n && before.size > 0n && before.size <= BigInt(maxBytes), 'Releasequelle ist nicht regulär oder zu groß.');
    const bytes = fs.readFileSync(fd), after = fs.fstatSync(fd, { bigint: true }), final = fs.lstatSync(full, { bigint: true });
    for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']) ensure(before[key] === after[key] && before[key] === final[key], 'Releasequelle wurde beim Lesen verändert.');
    return bytes;
  } finally { fs.closeSync(fd); }
}
export function checkPlayBundle({ bundlePath, mobileRoot, jdkRoot, certificateSha256 }) {
  const read = file => stableFile(path.join(mobileRoot, file), 16 * 1024 * 1024);
  const pubspec = read('pubspec.yaml'), catalog = read('assets/catalog.json'), catalogManifest = read('assets/catalog-manifest.json');
  const readGraphic = source => stableFile(path.join(mobileRoot, '..', source), 128 * 1024);
  const statusGraphics = new Map(Object.entries(statusGraphicSources)
    .map(([name, source]) => [graphicPrefix + name, readGraphic(source)]));
  for (const logo of ['assets/arten-explorer.png', 'android/app/src/main/res/drawable-nodpi/arten_explorer.png']) ensure(sha(read(logo)) === APPROVED_LOGO_SHA256, 'Genehmigtes Quelllogo wurde verändert.');
  const archive = stableFile(bundlePath, maxBundle);
  const inspected = verifyBundlePayload(archive, { version: parsePlayVersion(text(pubspec)), catalog, catalogManifest, statusGraphics });
  const signature = verifyUploadSignature(bundlePath, { jdkRoot, certificateSha256 });
  ensure(sha(stableFile(bundlePath, maxBundle)) === inspected.bundleSha256, 'Bundle hat sich während der Signaturprüfung verändert.');
  ensure(read('pubspec.yaml').equals(pubspec) && read('assets/catalog.json').equals(catalog) && read('assets/catalog-manifest.json').equals(catalogManifest), 'Öffentliche Releasequellen wurden während der Prüfung verändert.');
  for (const [name, source] of Object.entries(statusGraphicSources)) {
    ensure(readGraphic(source).equals(statusGraphics.get(graphicPrefix + name)), 'Websitegrafik wurde während der Prüfung verändert.');
  }
  return { passed: true, ...inspected, ...signature, uploadExecuted: false, readyForUpload: false, targetAcceptance: 'pending', playConsoleAcceptance: 'pending' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    ensure(args.length === 6 && args[0] === '--bundle' && args[2] === '--jdk' && args[4] === '--certificate', 'Aufruf: --bundle DATEI --jdk ORDNER --certificate SHA256');
    const mobileRoot = fileURLToPath(new URL('../', import.meta.url));
    const result = checkPlayBundle({ bundlePath: args[1], mobileRoot, jdkRoot: args[3], certificateSha256: args[5] });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write('ARTEN_PLAY_BUNDLE_CHECK_FAILED: Bundleprüfung nicht bestanden; kein Upload ausgeführt.\n'); process.exitCode = 1;
  }
}
