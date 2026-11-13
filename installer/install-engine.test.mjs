import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assertTestTempPath, tmpdir } from "../scripts/test-temp.mjs";
import { installPackage, PRODUCT_ID, safeRelative } from "./install-engine.mjs";
import { packageKind, sourceAllowed, packageIdentity, stageFfmpeg, stageFfmpegCompanion } from "./build.mjs";
import { collectMingitSources } from "./mingit-sources.mjs";

const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");

test("Prüfpaketkennung unterscheidet Arbeitsstände und bindet Installer sowie Compiler bei gleichem Git-Ausgangspunkt", () => {
  const input = { revision: "a".repeat(40), preview: true, compilerSha256: sha("compiler"),
    sourceBindings: [{ path: "species-explorer/server.mjs", sha256: sha("server") }, { path: "species-explorer/public/app.js", sha256: sha("app") }],
    installerSourceBindings: [{ path: "installer/build.mjs", sha256: sha("builder") }] };
  const first = packageIdentity(input);
  assert.match(first.packageId, /^0\.1\.0-a{12}-[a-f0-9]{16}-preview$/); assert.match(first.sourceSnapshotSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(packageIdentity({ ...input, sourceBindings: [...input.sourceBindings].reverse() }), first);
  for (const change of [{ sourceBindings: [{ ...input.sourceBindings[0], sha256: sha("changed server") }, input.sourceBindings[1]] },
    { installerSourceBindings: [{ ...input.installerSourceBindings[0], sha256: sha("changed builder") }] }, { compilerSha256: sha("changed compiler") }])
    assert.notEqual(packageIdentity({ ...input, ...change }).packageId, first.packageId);
  assert.equal(packageIdentity({ ...input, preview: false }).packageId, `0.1.0-${"a".repeat(12)}`);
  assert.throws(() => packageIdentity({ ...input, sourceBindings: [...input.sourceBindings, input.sourceBindings[0]] }));
});
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "setup-"));
  t.after(() => fs.rm(assertTestTempPath(root), { recursive: true, force: true }));
  return { root, base: path.join(root, "Felix und Jörg", "Arten Explorer"),
    async package(id = "v1", overrides = {}) {
      const packageRoot = path.join(root, `payload-${id}`);
      const files = { "program/Arten-Explorer.exe": `launcher-${id}`, "program/install-engine.mjs": `engine-${id}`,
        "workspace/species-explorer/server.mjs": `server-${id}`, "workspace/runtime/node/node.exe": `node-${id}`,
        "workspace/species_list.json": `["species-${id}"]\n`, "workspace/species-assets/a/map.svg": `<svg>${id}</svg>`,
        "workspace/.git/HEAD": "ref: refs/heads/main\n", ...overrides };
      const manifest = { schemaVersion: 1, productId: PRODUCT_ID, packageId: id, revision: id, preview: true, files: [] };
      for (const [relative, contents] of Object.entries(files)) {
        const filename = path.join(packageRoot, relative);
        await fs.mkdir(path.dirname(filename), { recursive: true });
        await fs.writeFile(filename, contents);
        manifest.files.push({ path: relative, kind: packageKind(relative), bytes: Buffer.byteLength(contents), sha256: sha(contents) });
      }
      await fs.writeFile(path.join(packageRoot, "manifest.json"), JSON.stringify(manifest));
      return packageRoot;
    },
  };
}

test("FFmpeg-Paketierung prüft die tatsächlich kopierten Binär- und Quellbytes", async (t) => {
  const { root } = await fixture(t);
  const source = path.join(root, "ffmpeg-evidence");
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, "binary.exe"), "binary");
  await fs.writeFile(path.join(source, "source.tar.gz"), "source");
  const pin = { version: "8.1.1", source: "https://example.invalid/ffmpeg",
    evidenceDirectory: "ffmpeg-evidence", files: {
      "bin/ffmpeg.exe": ["binary.exe", sha("binary")],
      "sources/source.tar.gz": ["source.tar.gz", sha("source")],
    } };
  const workspace = path.join(root, "workspace");
  const result = await stageFfmpeg(root, workspace, pin);
  assert.deepEqual(result.files, [
    { path: "bin/ffmpeg.exe", sha256: sha("binary") },
    { path: "sources/source.tar.gz", sha256: sha("source") },
  ]);
  assert.equal(await fs.readFile(path.join(workspace, "local-tools/ffmpeg/sources/source.tar.gz"), "utf8"), "source");
  await fs.writeFile(path.join(source, "source.tar.gz"), "changed");
  await assert.rejects(stageFfmpeg(root, path.join(root, "changed"), pin), /sources\/source\.tar\.gz/);
});

test("FFmpeg-Quellbeilage bindet Setup, Laufzeitquellen und Signaturbytes", async (t) => {
  const { root } = await fixture(t);
  const source = path.join(root, "evidence");
  await fs.mkdir(source);
  const runtimeSources = ["gcc", "crt", "winpthreads"].map(component => ({ component, source: `${component}.tar.zst`,
    sourceSha256: sha(component), signatureSha256: sha(`${component} signature`) }));
  const runtime = JSON.stringify({ results: runtimeSources });
  const pin = { version: "8.1.1", source: "https://example.invalid/ffmpeg", evidenceDirectory: "evidence", files: {
    "bin/ffmpeg.exe": ["ffmpeg.exe", sha("ffmpeg")], "bin/ffprobe.exe": ["ffprobe.exe", sha("ffprobe")],
    "sources/compiler-runtime-source-bindings.json": ["compiler-runtime.json", sha(runtime)],
  } };
  await fs.writeFile(path.join(source, "compiler-runtime.json"), runtime);
  for (const entry of runtimeSources) {
    await fs.writeFile(path.join(source, entry.source), entry.component);
    await fs.writeFile(path.join(source, `${entry.source}.sig`), `${entry.component} signature`);
  }
  const revision = "a".repeat(40), packageId = `0.1.0-${revision.slice(0, 12)}`;
  const reportPath = path.join(root, `${packageId}-build.json`);
  const setup = path.join(root, `Arten-Explorer-Setup-${packageId}-x64.exe`);
  const files = Object.entries(pin.files).map(([relative, [, sha256]]) => ({ path: `workspace/local-tools/ffmpeg/${relative}`, sha256 }));
  const manifest = JSON.stringify({ productId: PRODUCT_ID, packageId, revision, preview: false, files });
  await fs.writeFile(path.join(root, `${packageId}-manifest.json`), manifest);
  await fs.writeFile(setup, "setup");
  await fs.writeFile(reportPath, JSON.stringify({ schemaVersion: 1, productId: PRODUCT_ID, packageId, revision, preview: false,
    passed: true, ffmpeg: { version: pin.version, source: pin.source }, executable: { bytes: 5, sha256: sha("setup") },
    manifest: { files: files.length, sha256: sha(manifest) } }));
  const input = { reportPath, provenanceRoot: root, pin };
  const target = path.join(root, "result");
  const receipt = await stageFfmpegCompanion({ ...input, target });
  assert.equal(receipt.setup.sha256, sha("setup"));
  assert.equal(receipt.ffmpeg.executables[0].sha256, sha("ffmpeg"));
  assert.equal(receipt.files.length, 8);
  assert.equal(await fs.readFile(path.join(target, "sources/gcc.tar.zst.sig"), "utf8"), "gcc signature");
  await assert.rejects(fs.stat(path.join(target, "bin")), { code: "ENOENT" });
  await fs.writeFile(setup, "swaps");
  await assert.rejects(stageFfmpegCompanion({ ...input, target: path.join(root, "wrong-setup") }), /Setup-Datei/);
  await fs.writeFile(setup, "setup");
  await fs.writeFile(path.join(source, "crt.tar.zst.sig"), "changed signature");
  await assert.rejects(stageFfmpegCompanion({ ...input, target: path.join(root, "wrong-signature") }), /crt\.tar\.zst\.sig/);
});

test("MinGit-Quellbeilage verlangt alle Paket- und Verpackungszuordnungen zur exakten Setup-Dateiliste", async () => {
  const installedFiles = ["cmd/git.exe", "usr/bin/grep.exe", "etc/gitconfig"].map(name => ({ path: `workspace/runtime/git/${name}`, sha256: sha(name) }));
  const [git, grep, config] = installedFiles;
  const core = { name: "git-2.56.src.tar.gz", sha256: sha("core") };
  const upstream = { name: "grep-1~3.0-7.src.tar.zst", sha256: sha("upstream") };
  const pin = { sha256: sha("MinGit"), sourceCompanion: { runtimeFileCount: 3, archiveCount: 2, coreArchive: core.name,
    evidence: { [`${core.name}.sig`]: sha("core signature") } } };
  const packaged = { installerPath: config.path, sha256: config.sha256, method: "sdk-input", input: "sdk/etc/gitconfig" };
  const proofs = {
    "mingit-file-provenance.json": { minGitSha256: pin.sha256, files: installedFiles.map(file => ({ ...file, installerPath: file.path,
      candidateOwners: file === git ? [{ package: "git", version: "2.56" }] : [] })) },
    "package-sources/source-coverage.json": { packages: [{ package: "git", version: "2.56", archive: core, installerFiles: [git.path] }] },
    "package-sources/source-signatures.json": [],
    "upstream-msys2/installer-source-coverage.json": { fileMatches: [{ installerPath: grep.path, fileSha256: grep.sha256,
      package: "grep", version: "1~3.0-7", archive: upstream }] },
    "upstream-msys2/source-archives/verified-source-signatures.json": { packages: [{ source: upstream,
      signature: { name: `${upstream.name}.sig`, sha256: sha("upstream signature") } }] },
    "packaging-evidence/mingit-packaging-provenance.json": { files: [packaged], inputs: { [packaged.input]: { sha256: sha("gitconfig input") } } },
    "packaging-evidence/verified-package-signatures.json": { packages: [] },
    "upstream-msys2/msys2-keyring-source.json": { files: [] },
    "pacman-release-signatures.json": [{ asset: core.name, validSignature: true }],
  };
  const input = { installedFiles, pin, readEvidence: async name => proofs[name] };
  const sources = await collectMingitSources(input);
  assert.equal(sources.installed.find(file => file.path === grep.path).sourceArchive, `upstream-msys2/source-archives/${upstream.name}`);
  assert.equal(sources.installed.find(file => file.path === config.path).input, "packaging-evidence/vendor-inputs/sdk/etc/gitconfig");
  await assert.rejects(collectMingitSources({ ...input, installedFiles: [git, grep, { ...config, sha256: sha("foreign") }] }), /weicht vom belegten/);
  proofs["packaging-evidence/mingit-packaging-provenance.json"].files = [];
  await assert.rejects(collectMingitSources(input), /nicht vollständig/);
});

test("vollständige Erstinstallation verwendet echte Dateien auch mit Leerzeichen und Umlauten, ohne native Registrierung", async (t) => {
  const f = await fixture(t), packageRoot = await f.package();
  const result = await installPackage({ packageRoot, base: f.base, testMode: true });
  assert.equal(result.status, "installed");
  assert.equal(await fs.readFile(path.join(f.base, "workspace/species-explorer/server.mjs"), "utf8"), "server-v1");
  const state = JSON.parse(await fs.readFile(path.join(f.base, "installation.json"), "utf8"));
  assert.equal(state.nativeRegistration, "skipped-test-mode");
  const runtime = JSON.parse(await fs.readFile(path.join(f.base, "workspace/installer-runtime.json"), "utf8"));
  assert.equal(runtime.nodePath, path.join(f.base, "workspace/runtime/node/node.exe"));
  assert.equal(runtime.dataInitialization, "shared-service-required");
  await assert.rejects(fs.access(path.join(f.base, "workspace/data")), { code: "ENOENT" });
  assert.deepEqual((await fs.readdir(f.base)).sort(), ["installation.json", "program", "workspace"]);
});

test("Windows-Registrierung prüft fremde Einträge und Verknüpfungen vor jeder Dateieinrichtung", {
  skip: process.platform !== "win32",
}, async (t) => {
  const { root, base } = await fixture(t);
  const integration = fileURLToPath(new URL("./windows-integration.ps1", import.meta.url));
  const probe = path.join(root, "registration-probe.ps1");
  await fs.writeFile(probe, `param([string]$Integration, [string]$Target)
$ErrorActionPreference = 'Stop'
$global:fnRegistrationProbeOwner = [IO.Path]::GetFullPath($Target)
function Get-ItemProperty {
  param([string]$LiteralPath)
  if ($LiteralPath -ne 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\FN.ArtenExplorer') {
    throw 'Unexpected registry read.'
  }
  if ($global:fnRegistrationProbeCase -eq 'registry') { return @{ InstallLocation = $global:fnRegistrationProbeOwner + '-foreign' } }
  if ($global:fnRegistrationProbeCase -eq 'owned') { return @{ InstallLocation = $global:fnRegistrationProbeOwner } }
  if ($global:fnRegistrationProbeCase -eq 'unreadable') { throw 'Registry unavailable.' }
  throw [System.Management.Automation.ItemNotFoundException]::new()
}
function Test-Path {
  param([string]$LiteralPath)
  if ([IO.Path]::GetFileName($LiteralPath) -ne 'Arten-Explorer.lnk') { throw 'Unexpected path read.' }
  return $global:fnRegistrationProbeCase -in @('owned', 'shortcut')
}
function New-Object {
  param([string]$ComObject)
  if ($ComObject -ne 'WScript.Shell') { throw 'Unexpected object creation.' }
  $shell = [pscustomobject]@{ Purpose = 'synthetic shortcut read' }
  $shell | Add-Member -MemberType ScriptMethod -Name CreateShortcut -Value {
    param([string]$ShortcutPath)
    $launcher = Join-Path $global:fnRegistrationProbeOwner 'program\\Arten-Explorer.exe'
    if ($global:fnRegistrationProbeCase -eq 'shortcut') { $launcher += '-foreign' }
    return @{ TargetPath = $launcher }
  }
  return $shell
}
function New-Item { throw 'Unexpected write.' }
function New-ItemProperty { throw 'Unexpected registry write.' }
function Remove-Item { throw 'Unexpected removal.' }
foreach ($global:fnRegistrationProbeCase in @('empty', 'owned', 'registry', 'shortcut', 'unreadable')) {
  $expected = switch ($global:fnRegistrationProbeCase) {
    'registry' { 'anderer registrierter Arten-Explorer' }
    'shortcut' { 'fremde Verknuepfung' }
    'unreadable' { 'Registry unavailable' }
  }
  try {
    & $Integration -Action Preflight -Base $Target -DesktopShortcut
    if ($expected) { throw "Expected preflight refusal for $global:fnRegistrationProbeCase." }
  } catch {
    if (!$expected -or $_.Exception.Message -notmatch $expected) { throw }
  }
}
Write-Output 'preflight-ok'
`);
  const shell = path.join(process.env.WINDIR, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  assert.equal(execFileSync(shell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", probe,
    "-Integration", integration, "-Target", base], { encoding: "utf8", windowsHide: true }).trim(), "preflight-ok");
  await assert.rejects(fs.access(base), { code: "ENOENT" });
});

test("Update ersetzt Programme und erhält fachliche Dateien, private Daten, Einstellungen und Git-Zustand", async (t) => {
  const f = await fixture(t);
  await installPackage({ packageRoot: await f.package(), base: f.base, testMode: true });
  const originals = { "workspace/species_list.json": "eigene Arten", "workspace/data/private.sqlite": "private Datenbank",
    "workspace/species-explorer/local-settings.json": "eigene Einstellungen", "workspace/.git/HEAD": "eigener Commit",
    "workspace/.env": "private Konfiguration", "workspace/storage-path.json": "eigener Datenpfad", "workspace/species-assets/a/map.svg": "eigene Karte" };
  for (const [relative, text] of Object.entries(originals)) {
    await fs.mkdir(path.dirname(path.join(f.base, relative)), { recursive: true });
    await fs.writeFile(path.join(f.base, relative), text);
  }
  const result = await installPackage({ packageRoot: await f.package("v2"), base: f.base, testMode: true });
  assert.equal(result.packageId, "v2");
  assert.equal(await fs.readFile(path.join(f.base, "workspace/species-explorer/server.mjs"), "utf8"), "server-v2");
  for (const [relative, text] of Object.entries(originals)) assert.equal(await fs.readFile(path.join(f.base, relative), "utf8"), text);
});

test("veränderte Programmdatei stoppt ein Update vor dem ersten Kopieren", async (t) => {
  const f = await fixture(t);
  await installPackage({ packageRoot: await f.package(), base: f.base, testMode: true });
  const source = path.join(f.base, "workspace/species-explorer/server.mjs");
  await fs.writeFile(source, "eigene Programmänderung");
  const state = await fs.readFile(path.join(f.base, "installation.json"), "utf8");
  await assert.rejects(installPackage({ packageRoot: await f.package("v2"), base: f.base, testMode: true }), /Vorhandene Änderung bleibt erhalten/);
  assert.equal(await fs.readFile(source, "utf8"), "eigene Programmänderung");
  assert.equal(await fs.readFile(path.join(f.base, "program/Arten-Explorer.exe"), "utf8"), "launcher-v1");
  assert.equal(await fs.readFile(path.join(f.base, "installation.json"), "utf8"), state);
});

test("Reparatur stellt fehlende Programme wieder her und erfindet keine gelöschten Fachinhalte", async (t) => {
  const f = await fixture(t), packageRoot = await f.package();
  await installPackage({ packageRoot, base: f.base, testMode: true });
  await fs.rm(path.join(f.base, "workspace/runtime/node/node.exe"));
  await fs.rm(path.join(f.base, "workspace/species_list.json"));
  await installPackage({ packageRoot, base: f.base, operation: "repair", testMode: true });
  assert.equal(await fs.readFile(path.join(f.base, "workspace/runtime/node/node.exe"), "utf8"), "node-v1");
  await assert.rejects(fs.access(path.join(f.base, "workspace/species_list.json")), { code: "ENOENT" });
  await assert.rejects(installPackage({ packageRoot: await f.package("v2"), base: f.base, operation: "repair", testMode: true }), /genau das installierte Paket/);
});

test("Deinstallation erhält den gesamten Arbeitsbestand; erneute Installation verbindet ihn wieder", async (t) => {
  const f = await fixture(t), packageRoot = await f.package();
  await installPackage({ packageRoot, base: f.base, testMode: true });
  await fs.mkdir(path.join(f.base, "workspace/data"));
  await fs.writeFile(path.join(f.base, "workspace/data/private.sqlite"), "geschützt");
  const result = await installPackage({ base: f.base, operation: "uninstall", testMode: true });
  assert.equal(result.status, "uninstalled-data-retained");
  await assert.rejects(fs.access(path.join(f.base, "program/Arten-Explorer.exe")), { code: "ENOENT" });
  assert.equal(await fs.readFile(path.join(f.base, "workspace/data/private.sqlite"), "utf8"), "geschützt");
  assert.equal(await fs.readFile(path.join(f.base, "workspace/species-explorer/server.mjs"), "utf8"), "server-v1");
  await installPackage({ packageRoot, base: f.base, testMode: true });
  assert.equal(await fs.readFile(path.join(f.base, "program/Arten-Explorer.exe"), "utf8"), "launcher-v1");
  assert.equal(await fs.readFile(path.join(f.base, "workspace/data/private.sqlite"), "utf8"), "geschützt");
});

test("Kopierabbruch nimmt ein teilweise geschriebenes Update vollständig zurück", async (t) => {
  const f = await fixture(t);
  await installPackage({ packageRoot: await f.package(), base: f.base, testMode: true });
  const state = await fs.readFile(path.join(f.base, "installation.json"), "utf8");
  await assert.rejects(installPackage({ packageRoot: await f.package("v2"), base: f.base, testMode: true, failAfterWrites: 2 }), /Kopierabbruch/);
  assert.equal(await fs.readFile(path.join(f.base, "program/Arten-Explorer.exe"), "utf8"), "launcher-v1");
  assert.equal(await fs.readFile(path.join(f.base, "program/install-engine.mjs"), "utf8"), "engine-v1");
  assert.equal(await fs.readFile(path.join(f.base, "installation.json"), "utf8"), state);
  assert.ok(!(await fs.readdir(f.base)).some((name) => name.startsWith(".installer")));
});

test("fehlgeschlagene Rücknahme erhält Sicherung und Sperre und stoppt jeden weiteren Setup-Lauf", async (t) => {
  const f = await fixture(t), v1 = await f.package(), v2 = await f.package("v2");
  await installPackage({ packageRoot: v1, base: f.base, testMode: true });
  const target = path.join(f.base, "program", "Arten-Explorer.exe"), rename = fs.rename;
  const mock = t.mock.method(fs, "rename", async (source, destination) => {
    if (destination === target && source.includes(`${path.sep}old${path.sep}`)) {
      throw Object.assign(new Error("Sicherungsdatei gerade gesperrt"), { code: "EBUSY" });
    }
    return rename(source, destination);
  });
  await assert.rejects(installPackage({ packageRoot: v2, base: f.base, testMode: true, failAfterWrites: 1 }), /Rücknahme benötigt Prüfung/);
  mock.mock.restore();
  const rootEntries = await fs.readdir(f.base);
  const transaction = rootEntries.find((name) => name.startsWith(".installer-transaction-"));
  assert.ok(transaction);
  assert.ok(rootEntries.includes(".installer.lock"));
  const backup = path.join(f.base, transaction, "old", "program", "Arten-Explorer.exe");
  assert.equal(await fs.readFile(backup, "utf8"), "launcher-v1");
  for (const operation of ["install", "repair", "uninstall"]) {
    await assert.rejects(installPackage({ packageRoot: v1, base: f.base, operation, testMode: true }), /Rücknahme einer früheren Einrichtung/);
  }
  await assert.rejects(fs.access(target), { code: "ENOENT" });
  assert.equal(await fs.readFile(backup, "utf8"), "launcher-v1");
});

test("eine frühere offene Setup-Transaktion stoppt auch ohne Sperrdatei", async (t) => {
  const f = await fixture(t), v1 = await f.package(), v2 = await f.package("v2");
  await installPackage({ packageRoot: v1, base: f.base, testMode: true });
  const previous = path.join(f.base, `.installer-transaction-${crypto.randomUUID()}`);
  await fs.mkdir(previous);
  const backup = path.join(previous, "vorherige-sicherung.txt");
  await fs.writeFile(backup, "erhalten");
  await assert.rejects(installPackage({ packageRoot: v2, base: f.base, testMode: true }), /Rücknahme einer früheren Einrichtung/);
  assert.equal(await fs.readFile(backup, "utf8"), "erhalten");
  assert.equal(await fs.readFile(path.join(f.base, "program", "Arten-Explorer.exe"), "utf8"), "launcher-v1");
});

test("Update entfernt nur unveränderte entfallene Programme und erhält abweichende Altdateien", async (t) => {
  const f = await fixture(t);
  await installPackage({ packageRoot: await f.package("v1", { "program/old.exe": "alt", "program/custom.exe": "alt" }), base: f.base, testMode: true });
  await fs.writeFile(path.join(f.base, "program/custom.exe"), "eigene Änderung");
  await installPackage({ packageRoot: await f.package("v2"), base: f.base, testMode: true });
  await assert.rejects(fs.access(path.join(f.base, "program/old.exe")), { code: "ENOENT" });
  assert.equal(await fs.readFile(path.join(f.base, "program/custom.exe"), "utf8"), "eigene Änderung");
  const state = JSON.parse(await fs.readFile(path.join(f.base, "installation.json"), "utf8"));
  assert.ok(state.files.some((entry) => entry.path === "program/custom.exe"));
});

test("gleich benanntes abweichendes Paket ist keine Reparatur desselben gebundenen Standes", async (t) => {
  const f = await fixture(t), packageRoot = await f.package();
  await installPackage({ packageRoot, base: f.base, testMode: true });
  const filename = path.join(packageRoot, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(filename, "utf8"));
  manifest.revision = "anderer Quellstand";
  await fs.writeFile(filename, JSON.stringify(manifest));
  await assert.rejects(installPackage({ packageRoot, base: f.base, operation: "repair", testMode: true }), /genau das installierte Paket/);
});

test("beschädigtes Paket und private Daten im Paket werden vor der Installation abgewiesen", async (t) => {
  const f = await fixture(t), packageRoot = await f.package();
  await fs.writeFile(path.join(packageRoot, "program/Arten-Explorer.exe"), "manipuliert");
  await assert.rejects(installPackage({ packageRoot, base: f.base, testMode: true }), /Paketdatei beschädigt/);
  await assert.rejects(fs.access(f.base), { code: "ENOENT" });
  const privatePackage = await f.package("private", { "workspace/data/private.sqlite": "darf nicht mit" });
  await assert.rejects(installPackage({ packageRoot: privatePackage, base: f.base, testMode: true }), /Private Laufzeitdatei/);
});

test("unbekannter vorhandener Bestand, laufende App und Installersperre bleiben geschützt", async (t) => {
  const f = await fixture(t), packageRoot = await f.package();
  await fs.mkdir(f.base, { recursive: true });
  await fs.writeFile(path.join(f.base, "historischer-bestand.txt"), "erhalten");
  await assert.rejects(installPackage({ packageRoot, base: f.base, testMode: true }), /bereits Dateien/);
  await fs.rm(path.join(f.base, "historischer-bestand.txt"));
  await installPackage({ packageRoot, base: f.base, testMode: true });
  await fs.writeFile(path.join(f.base, "app-running.json"), JSON.stringify({ pid: process.pid }));
  await assert.rejects(installPackage({ base: f.base, operation: "uninstall", testMode: true }), /vor Installation/);
  await fs.rm(path.join(f.base, "app-running.json"));
  await fs.writeFile(path.join(f.base, ".installer.lock"), "anderer Installer");
  await assert.rejects(installPackage({ packageRoot, base: f.base, testMode: true }), /weitere Einrichtung/);
  assert.equal(await fs.readFile(path.join(f.base, ".installer.lock"), "utf8"), "anderer Installer");
});

test("Verzeichnisverknüpfungen im Ziel werden nicht beschrieben", async (t) => {
  const f = await fixture(t), packageRoot = await f.package(), elsewhere = path.join(f.root, "anderes-ziel");
  await fs.mkdir(elsewhere);
  await fs.mkdir(path.dirname(f.base), { recursive: true });
  let nativeLink = false;
  try {
    await fs.symlink(elsewhere, f.base, process.platform === "win32" ? "junction" : "dir");
    nativeLink = true;
  } catch (error) {
    if (!["EPERM", "EACCES"].includes(error.code)) throw error;
    t.diagnostic("Native Verknüpfung ist in dieser Umgebung gesperrt; lstat meldet für diese eine eigene Fixture injiziert einen Link.");
    const original = fs.lstat;
    t.mock.method(fs, "lstat", async (filename, ...args) => path.resolve(filename) === path.resolve(f.base)
      ? { isSymbolicLink: () => true } : original(filename, ...args));
  }
  await assert.rejects(installPackage({ packageRoot, base: f.base, testMode: true }), /Verzeichnisverknüpfungen/);
  assert.deepEqual(await fs.readdir(elsewhere), []);
  if (nativeLink) await fs.unlink(f.base);
});

test("Pfadprüfung und Quellenauswahl schließen private, fremde und mehrdeutige Namen aus", () => {
  for (const candidate of ["../outside", "workspace/../outside", "workspace/C:/file", "workspace/NUL.txt", "workspace/a.", "/root", "workspace/a\\b", "workspace/a//b"]) assert.throws(() => safeRelative(candidate));
  for (const candidate of ["data/a.mjs", "Daten/b.json", ".env", ".env.example", "storage-path.json", "species-explorer/local-settings.json", "species-explorer/logs/a.txt", "taxonomy-data/a.db", "installer/build/a.exe", "node_modules/electron/index.js"]) assert.equal(sourceAllowed(candidate), false, candidate);
  for (const candidate of ["species-explorer/server.mjs", "lightroom-plugin/FNWildlifeTaxonomy.lrplugin/Info.lua", "species_list.json", "docs/manual-map-overrides.md"]) assert.equal(sourceAllowed(candidate), true, candidate);
  assert.equal(packageKind("workspace/speciesData.json"), "seed");
  assert.equal(packageKind("workspace/species-assets/a/map.svg"), "seed");
  assert.equal(packageKind("workspace/runtime/node/node.exe"), "program");
});
