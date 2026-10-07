import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { tmpdir } from "./test-temp.mjs";

const source = fs.readFileSync(new URL("./nas-backup.ps1", import.meta.url), "utf8");
const functionNames = ["Get-Sha256Hex", "Get-FileSha256Hex", "Get-RelativePathFromRoot", "Convert-ToZipPath", "Test-ExcludedRelativePath",
  "Assert-LocalDataBackupTarget", "Get-LocalDataStateHash", "Get-BackupSourceFiles", "Get-BackupSourceRecords"];
const functions = functionNames.map((name) => {
  const start = source.indexOf(`function ${name} {`);
  assert.ok(start >= 0);
  const end = source.slice(start + 1).search(/\r?\nfunction [A-Za-z-]+ \{/u);
  return end < 0 ? source.slice(start, source.indexOf("$scriptDir =", start)) : source.slice(start, start + 1 + end);
}).join("\n");
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;

function powershell(command) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `$ErrorActionPreference='Stop'; ${functions}\n${command}`], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.error || ""} ${result.stderr}`);
  return result.stdout.trim();
}

test("Vollbackup schließt Daten und Speicherkonfiguration ein, nur Temp bleibt ausgeschlossen", () => {
  const policy = functions.slice(functions.indexOf("function Test-ExcludedRelativePath"), functions.indexOf("function Assert-LocalDataBackupTarget"));
  assert.match(policy, /StartsWith\("temp\/"\)/u);
  assert.match(policy, /FNWildlifeTaxonomy\.lrplugin\/temp\//u);
  assert.doesNotMatch(policy, /Daten|storage-path\.json/u);
  assert.match(source, /localDataStateHash = \$localDataStateHash/u);
  assert.match(source, /\$currentStateKey = "\$gitCommit\|\$statusHash\|\$localDataStateHash\|\$sourceRecordsHash"/u);
  assert.match(source, /Get-LocalDataStateHash -RepoRoot \$repoRoot -SourceRecords \$afterRecords\) -ne \$localDataStateHash/u);
});

test("derived durable-state hash equals direct file hashing without a second full data read", { skip: process.platform !== "win32" }, (t) => {
  const root = fs.mkdtempSync(path.join(tmpdir(), "nas-derived-snapshot-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "Daten"));
  fs.writeFileSync(path.join(root, "storage-path.json"), JSON.stringify({ schemaVersion: 1, state: "ready", dataRoot: "Daten" }));
  fs.writeFileSync(path.join(root, "Daten", "private.json"), "private fixture");
  fs.writeFileSync(path.join(root, "Daten", ".env.local"), "excluded fixture");
  fs.writeFileSync(path.join(root, "source.mjs"), "public fixture");
  const result = JSON.parse(powershell(`$records=@(Get-BackupSourceRecords -RepoRoot ${quote(root)} -Files @(Get-BackupSourceFiles -RepoRoot ${quote(root)}));
    [pscustomobject]@{ direct = Get-LocalDataStateHash -RepoRoot ${quote(root)};
      derived = Get-LocalDataStateHash -RepoRoot ${quote(root)} -SourceRecords $records } | ConvertTo-Json -Compress`));
  assert.match(result.direct, /^[a-f0-9]{64}$/u);
  assert.equal(result.derived, result.direct);
});

test("NAS policy excludes credential files at every level and uses the verified three-slot policy", () => {
  assert.match(source, /MaxBackups = 3/u);
  assert.match(source, /\.env\(\?:/u);
  assert.match(source, /Test-NasArchiveContents -ArchivePath \$pendingArchivePath -ExpectedManifest \$manifest/u);
  assert.match(source, /Move-Item -LiteralPath \$pendingArchivePath -Destination \$archivePath/u);
  assert.match(source, /Invoke-NasRetentionPlan -Plan \$rotationPlan/u);
  assert.doesNotMatch(source, /Select-Object -Skip \$MaxBackups/u);
  assert.doesNotMatch(source, /[^\x00-\x7F]/u, "Windows PowerShell 5 receives plain ASCII source/status text, no encoding workaround");
  for (const line of source.split(/\r?\n/u).filter((line) => /\bGet-Item -LiteralPath/u.test(line))) {
    assert.match(line, /-Force/u, "hidden source files must retain the same safety checks");
  }
  assert.ok(source.indexOf("Test-NasArchiveContents -ArchivePath $pendingArchivePath") <
    source.indexOf("Move-Item -LiteralPath $pendingArchivePath"));
});

test("source snapshot excludes .env variants, includes private durable files and detects source changes", { skip: process.platform !== "win32" }, (t) => {
  const root = fs.mkdtempSync(path.join(tmpdir(), "nas-source-snapshot-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "nested"));
  fs.writeFileSync(path.join(root, ".env"), "fixture credentials, never real secrets");
  fs.writeFileSync(path.join(root, "nested", ".env.local"), "fixture credentials");
  fs.writeFileSync(path.join(root, "nested", "keep.json"), "first");
  const command = `@(Get-BackupSourceRecords -RepoRoot ${quote(root)} -Files @(Get-BackupSourceFiles -RepoRoot ${quote(root)})) | ConvertTo-Json -Compress`;
  const before = JSON.parse(powershell(command));
  assert.equal(before.path, "nested/keep.json");
  fs.writeFileSync(path.join(root, "nested", "keep.json"), "other");
  const after = JSON.parse(powershell(command));
  assert.notEqual(before.sha256, after.sha256);
  const exclusions = JSON.parse(powershell(`@('.env', 'nested/.env.local', '.env.example', 'other/env.json') | ForEach-Object { Test-ExcludedRelativePath $_ } | ConvertTo-Json -Compress`));
  assert.deepEqual(exclusions, [true, true, true, false]);
});

test("Backup-Pfadgrenze schließt temp aus und erhält dauerhafte Daten", { skip: process.platform !== "win32" }, () => {
  const paths = ["temp/tests/a.sqlite", "lightroom-plugin/FNWildlifeTaxonomy.lrplugin/temp/a.json",
    "Daten/taxonomy/active.json", "Daten/taxonomy/master/journals/a.sqlite", "storage-path.json"];
  const result = JSON.parse(powershell(`@(${paths.map((filename) => `@(Test-ExcludedRelativePath ${quote(filename)})[0]`).join(";")}) | ConvertTo-Json -Compress`));
  assert.deepEqual(result, [true, true, false, false, false]);
});

test("Backup erkennt ignorierte Datenänderungen und verweigert externen oder ungültigen Datenpfad", { skip: process.platform !== "win32" }, (t) => {
  const root = fs.mkdtempSync(path.join(tmpdir(), "nas-data-contract-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dataRoot = path.join(root, "Daten");
  fs.mkdirSync(dataRoot);
  fs.writeFileSync(path.join(root, "storage-path.json"), JSON.stringify({ schemaVersion: 1, state: "ready", dataRoot: "Daten" }));
  fs.writeFileSync(path.join(dataRoot, "durable.sqlite"), "first");
  powershell(`Assert-LocalDataBackupTarget -RepoRoot ${quote(root)}`);
  const before = powershell(`Get-LocalDataStateHash -RepoRoot ${quote(root)}`);
  fs.writeFileSync(path.join(dataRoot, "durable.sqlite"), "other");
  const after = powershell(`Get-LocalDataStateHash -RepoRoot ${quote(root)}`);
  assert.match(before, /^[a-f0-9]{64}$/u);
  assert.notEqual(before, after);
  fs.mkdirSync(path.join(root, "temp"));
  fs.writeFileSync(path.join(root, "temp", "scratch.log"), "does not change durable data");
  assert.equal(powershell(`Get-LocalDataStateHash -RepoRoot ${quote(root)}`), after);
  for (const dataRoot of [path.join(root, "external"), "../external"]) {
    fs.writeFileSync(path.join(root, "storage-path.json"), JSON.stringify({ schemaVersion: 1, state: "ready", dataRoot }));
    const message = powershell(`try { Assert-LocalDataBackupTarget -RepoRoot ${quote(root)}; throw 'expected rejection' } catch { $_.Exception.Message }`);
    assert.match(message, /gesonderte Datensicherung|Unzulaessiger relativer/u);
  }
});
