import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { tmpdir, assertTestTempPath } from '../../scripts/test-temp.mjs';

const mobile = fileURLToPath(new URL('../', import.meta.url));
const evidence = path.join(mobile, 'build-evidence');
const previousChecks = fs.existsSync(path.join(evidence, 'checks.json'))
  ? JSON.parse(fs.readFileSync(path.join(evidence, 'checks.json'), 'utf8')) : null;
const session = tmpdir();
let cacheRoot = session;
let reusedOwner = null;
if (process.argv.includes('--reuse-own-cache')) {
  if (!previousChecks?.session) throw new Error('Keine eigene frühere mobile Prüfsitzung gebunden.');
  cacheRoot = assertTestTempPath(previousChecks.cacheRoot || previousChecks.session);
  reusedOwner = JSON.parse(fs.readFileSync(path.join(cacheRoot, 'owner.json'), 'utf8'));
  if (reusedOwner.owner !== 'fn-explorer-tests' || reusedOwner.session !== path.basename(cacheRoot)) throw new Error('Cachebesitz nicht belegt.');
  try { process.kill(reusedOwner.pid, 0); throw new Error('Der frühere Cachebesitzer ist noch aktiv.'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
  fs.writeFileSync(path.join(session, 'mobile-cache-reuse.json'), JSON.stringify({ cacheRoot, reusedOwner, currentPid: process.pid }));
}
const flutter = process.env.ARTEN_FLUTTER_ROOT || 'D:\\DevTools\\flutter';
const sdk = process.env.ARTEN_ANDROID_SDK || 'C:\\Users\\felix\\AppData\\Local\\Android\\Sdk';
const jdk = process.env.ARTEN_JAVA_HOME || 'C:\\Program Files\\Android\\Android Studio\\jbr';
const dart = path.join(flutter, 'bin/cache/dart-sdk/bin/dart.exe');
const snapshot = path.join(flutter, 'bin/cache/flutter_tools.snapshot');
for (const item of [dart, snapshot, path.join(sdk, 'platforms/android-36/android.jar'), path.join(jdk, 'bin/java.exe')]) {
  if (!fs.existsSync(item)) throw new Error(`Vorhandenes Werkzeug fehlt: ${item}. Keine Installation gestartet.`);
}
const env = { ...process.env, JAVA_HOME: jdk, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk,
  PUB_CACHE: path.join(cacheRoot, 'pub'), GRADLE_USER_HOME: path.join(cacheRoot, 'gradle'),
  ARTEN_TEST_TEMP: path.join(session, 'fixtures'), TEMP: path.join(session, 'process-temp'), TMP: path.join(session, 'process-temp'),
  FLUTTER_SUPPRESS_ANALYTICS: 'true', DART_SUPPRESS_ANALYTICS: 'true', CI: 'true' };
for (const item of [env.PUB_CACHE, env.GRADLE_USER_HOME, env.ARTEN_TEST_TEMP, env.TEMP]) {
  fs.mkdirSync(assertTestTempPath(item), { recursive: true });
}
fs.mkdirSync(evidence, { recursive: true });
fs.writeFileSync(path.join(env.GRADLE_USER_HOME, 'gradle.properties'), 'android.builder.sdkDownload=false\norg.gradle.daemon=false\n');
const results = { startedAt: new Date().toISOString(), session, runnerPid: process.pid, cacheRoot, reusedOwner, tools: { flutter, sdk, jdk }, checks: [],
  ...(previousChecks?.sdkDownloadGuard?.passed ? { sdkDownloadGuard: { ...previousChecks.sdkDownloadGuard, reusedHistoricalProof: true } } : {}) };
const sha256 = value => createHash('sha256').update(value).digest('hex');
function sdkInventory() {
  const entries = [];
  for (const family of ['platforms', 'build-tools', 'ndk', 'cmdline-tools', 'cmake', 'platform-tools']) {
    const base = path.join(sdk, family);
    if (!fs.existsSync(base)) continue;
    const directories = family === 'platform-tools' ? [''] : fs.readdirSync(base, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
    for (const name of directories) {
      entries.push({ component: `${family}/${name}`, descriptors: ['source.properties', 'package.xml'].filter(file => fs.existsSync(path.join(base, name, file)))
        .map(file => ({ file, sha256: sha256(fs.readFileSync(path.join(base, name, file))) })) });
    }
  }
  return entries.sort((a,b) => a.component.localeCompare(b.component));
}
results.sdkBefore = sdkInventory();
function persist() { fs.writeFileSync(path.join(evidence, 'checks.json'), `${JSON.stringify(results, null, 2)}\n`); }
async function runProcess(label, executable, args, cwd = mobile) {
  const log = fs.createWriteStream(path.join(evidence, `${label}.log`));
  process.stdout.write(`\nSTART ${label}\n`);
  let childPid;
  const startedAt = new Date().toISOString();
  const code = await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    results.activeChild = { pid: child.pid, label }; persist();
    childPid = child.pid;
    child.stdout.on('data', bytes => { process.stdout.write(bytes); log.write(bytes); });
    child.stderr.on('data', bytes => { process.stderr.write(bytes); log.write(bytes); });
    child.once('error', reject); child.once('exit', resolve);
  });
  await new Promise(resolve => log.end(resolve));
  results.checks.push({ label, code, childPid, args, startedAt, finishedAt: new Date().toISOString() }); persist();
  results.activeChild = null; persist();
  process.stdout.write(`FINISH ${label} ${code}\n`);
  return code;
}
async function run(label, args) { return runProcess(label, dart, [snapshot, '--no-version-check', '--suppress-analytics', ...args]); }
function gradleClasspath() {
  const distribution = path.join(env.GRADLE_USER_HOME, 'wrapper/dists/gradle-9.3.1-all');
  if (!fs.existsSync(distribution)) throw new Error('Gradle muss im eigenen Cache bereits durch den regulären Wrapper bezogen sein.');
  for (const name of fs.readdirSync(distribution)) {
    const jar = path.join(distribution, name, 'gradle-9.3.1/lib/gradle-launcher-9.3.1.jar');
    if (fs.existsSync(jar)) return jar;
  }
  throw new Error('Eigene Gradle-Laufzeit nicht gefunden.');
}
async function guard() {
  const fixture = assertTestTempPath(path.join(env.ARTEN_TEST_TEMP, 'agp-sdk-download-guard'));
  fs.mkdirSync(fixture, { recursive: true });
  fs.writeFileSync(path.join(fixture, 'settings.gradle'), "pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }\nrootProject.name = 'OwnSdkDownloadGuard'\n");
  fs.writeFileSync(path.join(fixture, 'build.gradle'), "buildscript { repositories { google(); mavenCentral() }; dependencies { classpath 'com.android.tools.build:gradle:9.1.0' } }\napply plugin: 'com.android.library'\nandroid { namespace 'de.fnwildlifetravel.sdkguard'; compileSdk 999; buildToolsVersion '36.0.0' }\n");
  fs.writeFileSync(path.join(fixture, 'gradle.properties'), 'android.builder.sdkDownload=false\nandroid.useAndroidX=true\nandroid.newDsl=false\nandroid.builtInKotlin=false\norg.gradle.daemon=false\n');
  fs.writeFileSync(path.join(fixture, 'local.properties'), `sdk.dir=${sdk.replaceAll('\\','/')}\n`);
  const before = sdkInventory();
  const code = await runProcess('sdk-download-guard', path.join(jdk, 'bin/java.exe'), ['-classpath', gradleClasspath(), 'org.gradle.launcher.GradleMain', '--no-daemon', '--max-workers=1', '--offline', 'assembleDebug'], fixture);
  const log = fs.readFileSync(path.join(evidence, 'sdk-download-guard.log'), 'utf8');
  const after = sdkInventory();
  const passed = code !== 0 && /(?:failed to find|not found|not installed|unable to locate)[^\n]*(?:android-999|platform[^\n]*999)|(?:android-999)[^\n]*(?:not found|not installed)/i.test(log)
    && !/Preparing "Install Android SDK|Installing Android SDK/i.test(log) && JSON.stringify(before) === JSON.stringify(after);
  results.sdkDownloadGuard = { checkedAt: new Date().toISOString(), passed, code, sdkUnchanged: JSON.stringify(before) === JSON.stringify(after), deliberatelyMissingPlatform: 999,
    property: 'android.builder.sdkDownload=false', reference: 'https://developer.android.com/studio/intro/update#download-with-gradle' }; persist();
  if (!passed) throw new Error('SDK-Downloadsperre nicht wie erwartet belegt; keine weitere Buildfreigabe.');
  return 0;
}
async function build() {
  if (!/^android\.builder\.sdkDownload=false$/m.test(fs.readFileSync(path.join(mobile, 'android/gradle.properties'), 'utf8'))) throw new Error('SDK-Downloadsperre fehlt.');
  const before = sdkInventory();
  const code = await run('build', ['build', 'apk', '--debug', '--no-pub', '--target-platform=android-arm64']);
  results.sdkAfter = sdkInventory(); results.sdkUnchanged = JSON.stringify(before) === JSON.stringify(results.sdkAfter); persist();
  if (!results.sdkUnchanged) throw new Error('SDK-Bestand hat sich während dieses Builds verändert.');
  return code;
}
const commands = {
  pub: () => run('pub', ['pub', 'get']),
  locked: () => run('locked', ['pub', 'get', '--offline', '--enforce-lockfile']),
  analyze: () => run('analyze', ['analyze', '--no-pub']),
  test: () => run('test', ['test', '--no-pub', '--concurrency=1', '--reporter=expanded']),
  guard, build,
};
persist();
if (process.argv.includes('--interactive')) {
  process.stdout.write(`Eigene Prüfsitzung: ${session}\nBefehle: pub, analyze, test, guard, build, quit\n`);
  for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    const command = line.trim();
    if (command === 'quit') break;
    if (commands[command]) await commands[command]();
    else process.stdout.write('Unbekannter Prüfschritt.\n');
    process.stdout.write('READY\n');
  }
} else {
  for (const command of ['pub', 'analyze', 'test', 'build', 'guard']) {
    const code = await commands[command]();
    if (code !== 0) { process.exitCode = 1; break; }
  }
}
results.finishedAt = new Date().toISOString(); persist();
process.stdin.pause();
process.stdin.unref?.();
process.stdout.write('Eigene Cache-/Belegdateien bleiben im ausgewiesenen Prüfbereich erhalten; kein gemeinsamer Cache wurde bereinigt.\n');
