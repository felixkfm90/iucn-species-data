import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { tmpdir } from "./test-temp.mjs";

const helperSource = fs.readFileSync(new URL("./nas-backup-retention.ps1", import.meta.url), "utf8");
const mainSource = fs.readFileSync(new URL("./nas-backup.ps1", import.meta.url), "utf8");
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const windows = { skip: process.platform !== "win32" };
const fixtures = `
function New-FixtureArchive {
  param([string]$Root, [int]$Index, [switch]$WrongContent, [switch]$Legacy, [switch]$Duplicate, [switch]$OtherProject)
  $filename = Join-Path $Root ("IUCN_Datenbank_fixture_{0:00}.zip" -f $Index)
  $data = [Text.Encoding]::UTF8.GetBytes("fixture-private-data-" + $Index)
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $hash = ([BitConverter]::ToString($sha.ComputeHash($data))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
  $records = @([pscustomobject][ordered]@{ path = 'Daten/private.json'; bytes = [long]$data.Length; sha256 = $hash })
  $manifest = [ordered]@{ schemaVersion = 2; backupKind = 'arten-explorer-nas-restore'; archiveId = [guid]::NewGuid().ToString();
    projectId = ('e' * 64);
    createdAt = ('2026-09-{0:00}T12:00:00+00:00' -f $Index); gitCommit = ('a' * 40);
    localDataStateHash = ('b' * 64); sourceRecordsHash = (Get-NasJsonHash $records);
    fileCount = 1; totalBytes = [long]$data.Length; files = $records }
  if ($Legacy) { $manifest = [ordered]@{ fileCount = 1; gitCommit = ('a' * 40); createdAt = '2026-06-01T12:00:00Z' } }
  elseif ($OtherProject) { $manifest.projectId = ('f' * 64) }
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $stream = [IO.File]::Open($filename, [IO.FileMode]::Create)
  $zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
  try {
    $entry = $zip.CreateEntry('backup-manifest.json')
    $writer = [IO.StreamWriter]::new($entry.Open(), [Text.UTF8Encoding]::new($false))
    try { $writer.Write((ConvertTo-Json -InputObject $manifest -Depth 15 -Compress)) } finally { $writer.Dispose() }
    $entry = $zip.CreateEntry('Daten/private.json')
    $output = $entry.Open()
    try {
      if ($WrongContent) { $data[0] = [byte]($data[0] + 1) }
      $output.Write($data, 0, $data.Length)
    } finally { $output.Dispose() }
    if ($Duplicate) { $duplicateEntry = $zip.CreateEntry('Daten/private.json'); $duplicateEntry.Open().Dispose() }
  } finally { $zip.Dispose(); $stream.Dispose() }
  return $filename
}
function Get-FixturePlan {
  param([string]$Root)
  return Get-NasRetentionPlan -BackupRoot $Root -ExpectedProjectId ('e' * 64)
}
`;

function run(t, command, prepare) {
  const root = fs.mkdtempSync(path.join(tmpdir(), "nas-rotation-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  if (prepare) prepare(root);
  const output = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `$ErrorActionPreference='Stop'; ${helperSource}\n${fixtures}\n$root=${quote(root)}; ${command}`],
  { encoding: "utf8", timeout: 60000 });
  assert.equal(output.status, 0, `${output.error || ""} ${output.stderr}\n${output.stdout}`);
  return JSON.parse(output.stdout.trim());
}

test("helper is definition-only and guards revisions, checksum proofs, restore leases and pending files", () => {
  assert.match(helperSource, /function Test-NasArchiveContents/u);
  assert.match(helperSource, /sourceRecordsHash/u);
  assert.match(helperSource, /ExpectedArchiveHash/u);
  assert.match(helperSource, /\$fresh\.revision -ne \$Plan\.revision/u);
  assert.match(helperSource, /\[IO\.FileShare\]::Read/u);
  assert.match(helperSource, /\.nas-rotation-/u);
  assert.match(helperSource, /\$ordered\[-1\]\.path/u);
  assert.doesNotMatch(helperSource, /Get-NasRetentionPlan -BackupRoot ['"](?:W:|D:)/u);
});

function prepareMain(root) {
  const program = path.join(root, "program");
  const scripts = path.join(program, "scripts");
  fs.mkdirSync(scripts, { recursive: true });
  fs.mkdirSync(path.join(program, "Daten"));
  fs.mkdirSync(path.join(root, "nas"));
  fs.writeFileSync(path.join(program, "storage-path.json"), JSON.stringify({ schemaVersion: 1, state: "ready", dataRoot: "Daten" }));
  fs.writeFileSync(path.join(program, "Daten", "private.json"), "private fixture, not production data");
  fs.writeFileSync(path.join(program, "public.json"), "public fixture");
  fs.writeFileSync(path.join(program, ".env"), "fake-secret-must-not-be-copied");
  const code = mainSource.replace("$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path", `$scriptDir=${quote(scripts)}`)
    .replace('. (Join-Path $scriptDir "nas-backup-retention.ps1")', () => helperSource)
    // The real entry point exits its own PowerShell process after a skip. The
    // command-block fixture returns to its caller to inspect both responses.
    .replace("  exit 0", "  return");
  fs.writeFileSync(path.join(root, "main-fixture.ps1"), code);
}

const mockGit = `
$script:headChecks = 0
function git {
  $global:LASTEXITCODE = 0
  $command = $args -join ' '
  if ($command -eq 'rev-parse HEAD') {
    $script:headChecks++
    if ($script:simulateChangedHead -and $script:headChecks -gt 1) { return ('b' * 40) }
    return ('a' * 40)
  }
  if ($command -eq 'rev-parse --short=12 HEAD') { return ('a' * 12) }
  if ($command -eq 'status --porcelain=v1') { return '' }
  if ($command -eq 'remote get-url origin') { return 'https://example.invalid/isolated/fixture.git' }
  throw 'unexpected fixture git command'
}
`;

test("actual main script creates a verified private-data backup, excludes credentials and skips an unchanged source", windows, (t) => {
  const result = run(t, `${mockGit}
    $code = Get-Content -LiteralPath (Join-Path $root 'main-fixture.ps1') -Raw -Encoding UTF8
    $nas = Join-Path $root 'nas'
    $first = ((& ([scriptblock]::Create($code)) -BackupRoot $nas) -join [Environment]::NewLine) | ConvertFrom-Json
    $second = ((& ([scriptblock]::Create($code)) -BackupRoot $nas) -join [Environment]::NewLine) | ConvertFrom-Json
    $check = Test-NasArchiveContents $first.archivePath
    [pscustomobject]@{ first = $first.ok; firstSkipped = $first.skipped; secondSkipped = $second.skipped;
      verified = $check.ok; archiveCount = @(Get-ChildItem -LiteralPath $nas -Filter 'IUCN_Datenbank_*.zip').Count;
      pendingCount = @(Get-ChildItem -LiteralPath $nas -Force -File | Where-Object { $_.Name -like '*.pending-*' }).Count;
      files = @($check.manifest.files | ForEach-Object { $_.path }); rotation = $first.rotationCompleted;
      archiveHash = $first.archiveSha256; archiveVerified = $first.archiveVerified; archiveId = $first.archiveId } | ConvertTo-Json -Depth 6 -Compress
  `, prepareMain);
  assert.equal(result.first, true);
  assert.equal(result.firstSkipped, false);
  assert.equal(result.secondSkipped, true);
  assert.equal(result.verified, true);
  assert.equal(result.archiveCount, 1);
  assert.equal(result.pendingCount, 0);
  assert.equal(result.rotation, true);
  assert.equal(result.archiveVerified, true);
  assert.match(result.archiveHash, /^[a-f0-9]{64}$/u);
  assert.match(result.archiveId, /^[a-f0-9-]{36}$/u);
  assert.deepEqual(result.files, ["Daten/private.json", "public.json", "storage-path.json"]);
});

test("actual main script rejects a changed bound Git state and removes only its own incomplete ZIP", windows, (t) => {
  const result = run(t, `${mockGit}
    $script:simulateChangedHead = $true
    $code = Get-Content -LiteralPath (Join-Path $root 'main-fixture.ps1') -Raw -Encoding UTF8
    $nas = Join-Path $root 'nas'
    $legacy = New-FixtureArchive $nas 1 -Legacy
    $rejected = $false
    try { $null = & ([scriptblock]::Create($code)) -BackupRoot $nas } catch { $rejected = $_.Exception.Message -like '*Git-Stand*' }
    [pscustomobject]@{ rejected = $rejected; oldPresent = Test-Path -LiteralPath $legacy;
      archiveCount = @(Get-ChildItem -LiteralPath $nas -Filter 'IUCN_Datenbank_*.zip').Count;
      pendingCount = @(Get-ChildItem -LiteralPath $nas -Force -File | Where-Object { $_.Name -like '*.pending-*' }).Count } | ConvertTo-Json -Compress
  `, prepareMain);
  assert.deepEqual(result, { rejected: true, oldPresent: true, archiveCount: 1, pendingCount: 0 });
});

test("actual main script includes hidden .git, nested hidden data and hidden settings; verification also accepts a hidden ZIP", windows, (t) => {
  const result = run(t, `${mockGit}
    $program = Join-Path $root 'program'
    $hiddenPaths = @((Join-Path $program '.git'), (Join-Path $program 'Daten/hidden.json'), (Join-Path $program 'storage-path.json'))
    foreach ($filename in $hiddenPaths) { [IO.File]::SetAttributes($filename, ([IO.File]::GetAttributes($filename) -bor [IO.FileAttributes]::Hidden)) }
    $code = Get-Content -LiteralPath (Join-Path $root 'main-fixture.ps1') -Raw -Encoding UTF8
    $nas = Join-Path $root 'nas'
    $first = ((& ([scriptblock]::Create($code)) -BackupRoot $nas) -join [Environment]::NewLine) | ConvertFrom-Json
    [IO.File]::SetAttributes($first.archivePath, ([IO.File]::GetAttributes($first.archivePath) -bor [IO.FileAttributes]::Hidden))
    $check = Test-NasArchiveContents $first.archivePath
    $plan = Get-NasRetentionPlan -BackupRoot $nas -ExpectedProjectId $check.manifest.projectId
    [pscustomobject]@{ ok = $first.ok; verified = $check.ok; verifiedCount = $plan.verifiedArchiveCount;
      files = @($check.manifest.files | ForEach-Object { $_.path }) } | ConvertTo-Json -Depth 6 -Compress
  `, (root) => {
    prepareMain(root);
    fs.mkdirSync(path.join(root, "program", ".git"));
    fs.writeFileSync(path.join(root, "program", ".git", "config"), "fixture git metadata, no real repository");
    fs.writeFileSync(path.join(root, "program", "Daten", "hidden.json"), "private hidden fixture");
  });
  assert.equal(result.ok, true);
  assert.equal(result.verified, true);
  assert.equal(result.verifiedCount, 1);
  assert.deepEqual(result.files, [".git/config", "Daten/hidden.json", "Daten/private.json", "public.json", "storage-path.json"]);
});

test("full archive verification accepts only complete matching hashes and manifests", windows, (t) => {
  const result = run(t, `
    $good = New-FixtureArchive $root 1
    $bad = New-FixtureArchive $root 2 -WrongContent
    $duplicate = New-FixtureArchive $root 3 -Duplicate
    $legacy = New-FixtureArchive $root 4 -Legacy
    $verified = Test-NasArchiveContents $good
    $expected = $verified.manifest
    $expected.gitCommit = ('c' * 40)
    [pscustomobject]@{ good = $verified.ok; bad = (Test-NasArchiveContents $bad).ok;
      duplicate = (Test-NasArchiveContents $duplicate).ok; legacy = (Test-NasArchiveContents $legacy).ok;
      wrongSource = (Test-NasArchiveContents -ArchivePath $good -ExpectedManifest $expected).ok;
      wrongArchive = (Test-NasArchiveContents -ArchivePath $good -ExpectedArchiveHash ('d' * 64)).ok } | ConvertTo-Json -Compress
  `);
  assert.deepEqual(result, { good: true, bad: false, duplicate: false, legacy: false, wrongSource: false, wrongArchive: false });
});

test("rotation keeps two latest verified archives plus the older checkpoint rather than the last three", windows, (t) => {
  const result = run(t, `
    1..6 | ForEach-Object { $null = New-FixtureArchive $root $_ }
    $plan = Get-FixturePlan $root
    $result = Invoke-NasRetentionPlan $plan
    [pscustomobject]@{ ok = $result.ok; removed = $result.removedArchivePaths.Count;
      checkpoint = [IO.Path]::GetFileName($plan.retainedCheckpoint);
      remaining = @(Get-ChildItem -LiteralPath $root -File | Sort-Object Name | ForEach-Object { $_.Name }) } | ConvertTo-Json -Compress
  `);
  assert.equal(result.ok, true);
  assert.equal(result.removed, 3);
  assert.equal(result.checkpoint, "IUCN_Datenbank_fixture_01.zip");
  assert.deepEqual(result.remaining, ["IUCN_Datenbank_fixture_01.zip", "IUCN_Datenbank_fixture_05.zip", "IUCN_Datenbank_fixture_06.zip"]);
});

test("legacy, corrupt and interrupted archives are protected without pretending they are verified slots", windows, (t) => {
  const result = run(t, `
    1..5 | ForEach-Object { $null = New-FixtureArchive $root $_ }
    $legacy = New-FixtureArchive $root 6 -Legacy
    $wrong = New-FixtureArchive $root 7 -WrongContent
    [IO.File]::WriteAllText((Join-Path $root 'IUCN_Datenbank_broken.zip'), 'not a ZIP')
    [IO.File]::WriteAllText((Join-Path $root '.nas-rotation-interrupted.pending'), 'do not remove')
    $plan = Get-FixturePlan $root
    $result = Invoke-NasRetentionPlan $plan
    [pscustomobject]@{ ok = $result.ok; removed = $result.removedArchivePaths.Count;
      verified = $plan.verifiedArchiveCount; protected = $plan.protectedArchives.Count;
      legacyPresent = Test-Path -LiteralPath $legacy; wrongPresent = Test-Path -LiteralPath $wrong;
      pendingPresent = Test-Path -LiteralPath (Join-Path $root '.nas-rotation-interrupted.pending') } | ConvertTo-Json -Compress
  `);
  assert.deepEqual(result, { ok: true, removed: 2, verified: 5, protected: 4, legacyPresent: true, wrongPresent: true, pendingPresent: true });
});

test("checked archive replacement invalidates the old deletion plan even with unchanged timestamps", windows, (t) => {
  const result = run(t, `
    1..5 | ForEach-Object { $null = New-FixtureArchive $root $_ }
    $plan = Get-FixturePlan $root
    $path = Join-Path $root 'IUCN_Datenbank_fixture_03.zip'
    $timestamp = (Get-Item -LiteralPath $path).LastWriteTimeUtc
    $null = New-FixtureArchive $root 3
    (Get-Item -LiteralPath $path).LastWriteTimeUtc = $timestamp
    $result = Invoke-NasRetentionPlan $plan
    [pscustomobject]@{ ok = $result.ok; removed = $result.removedArchivePaths.Count;
      remaining = @(Get-ChildItem -LiteralPath $root -File).Count } | ConvertTo-Json -Compress
  `);
  assert.deepEqual(result, { ok: false, removed: 0, remaining: 5 });
});

test("modified retained set or a newly added archive invalidates preview without deletion", windows, (t) => {
  const result = run(t, `
    1..5 | ForEach-Object { $null = New-FixtureArchive $root $_ }
    $plan = Get-FixturePlan $root
    $plan.retainedArchivePaths = @()
    $tampered = Invoke-NasRetentionPlan $plan
    $plan = Get-FixturePlan $root
    $null = New-FixtureArchive $root 6
    $stale = Invoke-NasRetentionPlan $plan
    [pscustomobject]@{ tampered = $tampered.ok; stale = $stale.ok;
      removed = ($tampered.removedArchivePaths.Count + $stale.removedArchivePaths.Count);
      remaining = @(Get-ChildItem -LiteralPath $root -File).Count } | ConvertTo-Json -Compress
  `);
  assert.deepEqual(result, { tampered: false, stale: false, removed: 0, remaining: 6 });
});

test("partial deletion reports actual effects, restores the blocked candidate and resumes with a fresh plan", windows, (t) => {
  const result = run(t, `
    1..6 | ForEach-Object { $null = New-FixtureArchive $root $_ }
    $plan = Get-FixturePlan $root
    $script:removeCalls = 0
    function Remove-Item {
      [CmdletBinding()] param([string]$LiteralPath, [switch]$Force)
      $script:removeCalls++
      if ($script:removeCalls -eq 2) { throw 'fixture locked file' }
      Microsoft.PowerShell.Management\\Remove-Item -LiteralPath $LiteralPath -Force -ErrorAction Stop
    }
    $partial = Invoke-NasRetentionPlan $plan
    Microsoft.PowerShell.Management\\Remove-Item -LiteralPath Function:\\Remove-Item
    $stale = Invoke-NasRetentionPlan $plan
    $fresh = Invoke-NasRetentionPlan (Get-FixturePlan $root)
    [pscustomobject]@{ partial = $partial.ok; partialRemoved = $partial.removedArchivePaths.Count;
      stale = $stale.ok; resumed = $fresh.ok; resumedRemoved = $fresh.removedArchivePaths.Count;
      pending = @(Get-ChildItem -LiteralPath $root -Force -File | Where-Object { $_.Name -like '*.pending' }).Count;
      remaining = @(Get-ChildItem -LiteralPath $root -File | Sort-Object Name | ForEach-Object { $_.Name }) } | ConvertTo-Json -Compress
  `);
  assert.equal(result.partial, false);
  assert.equal(result.partialRemoved, 1);
  assert.equal(result.stale, false);
  assert.equal(result.resumed, true);
  assert.equal(result.resumedRemoved, 2);
  assert.equal(result.pending, 0);
  assert.deepEqual(result.remaining, ["IUCN_Datenbank_fixture_01.zip", "IUCN_Datenbank_fixture_05.zip", "IUCN_Datenbank_fixture_06.zip"]);
});

test("empty or small verified sets do not require duplicate backups or remove existing restore points", windows, (t) => {
  const result = run(t, `
    $empty = Get-FixturePlan $root
    $null = New-FixtureArchive $root 1
    $one = Get-FixturePlan $root
    $null = New-FixtureArchive $root 2
    $two = Get-FixturePlan $root
    [pscustomobject]@{ empty = $empty.verifiedArchiveCount; one = $one.retainedArchivePaths.Count;
      two = $two.retainedArchivePaths.Count; checkpoint = $two.retainedCheckpoint;
      remove = $two.removeArchives.Count } | ConvertTo-Json -Compress
  `);
  assert.deepEqual(result, { empty: 0, one: 1, two: 2, checkpoint: "", remove: 0 });
});

test("another project's valid archive remains protected and omission of project binding is rejected", windows, (t) => {
  const result = run(t, `
    1..5 | ForEach-Object { $null = New-FixtureArchive $root $_ }
    $other = New-FixtureArchive $root 6 -OtherProject
    $plan = Get-FixturePlan $root
    $rotated = Invoke-NasRetentionPlan $plan
    $missingBinding = $false
    try { $null = Get-NasRetentionPlan $root } catch { $missingBinding = $true }
    [pscustomobject]@{ ok = $rotated.ok; removed = $rotated.removedArchivePaths.Count;
      protected = $plan.protectedArchives.Count; foreignPresent = Test-Path -LiteralPath $other;
      missingBinding = $missingBinding } | ConvertTo-Json -Compress
  `);
  assert.deepEqual(result, { ok: true, removed: 2, protected: 1, foreignPresent: true, missingBinding: true });
});

test("authenticated same-process proofs avoid repeated full content reads but tampering forces revalidation", windows, (t) => {
  const result = run(t, `
    1..2 | ForEach-Object { $null = New-FixtureArchive $root $_ }
    $plan = Get-FixturePlan $root
    $originalVerification = (Get-Command Test-NasArchiveContents).ScriptBlock
    $script:fullChecks = 0
    function Test-NasArchiveContents {
      [CmdletBinding()] param([string]$ArchivePath, $ExpectedManifest = $null, [string]$ExpectedArchiveHash = '')
      $script:fullChecks++
      & $originalVerification @PSBoundParameters
    }
    $cached = Get-NasRetentionPlan -BackupRoot $root -ExpectedProjectId ('e' * 64) -VerifiedProofs $plan.verifiedProofs
    $cachedChecks = $script:fullChecks
    $wrong = New-FixtureArchive $root 1 -WrongContent
    $forged = @($plan.verifiedProofs | Where-Object { $_.path -eq $wrong })[0]
    $forged.archiveHash = Get-NasFileHash $wrong
    $after = Get-NasRetentionPlan -BackupRoot $root -ExpectedProjectId ('e' * 64) -VerifiedProofs $plan.verifiedProofs
    [pscustomobject]@{ cachedChecks = $cachedChecks; rechecked = $script:fullChecks;
      cachedVerified = $cached.verifiedArchiveCount; afterVerified = $after.verifiedArchiveCount;
      protected = $after.protectedArchives.Count } | ConvertTo-Json -Compress
  `);
  assert.deepEqual(result, { cachedChecks: 0, rechecked: 1, cachedVerified: 2, afterVerified: 1, protected: 1 });
});
