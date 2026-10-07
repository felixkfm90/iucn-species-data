param(
  [string]$BackupRoot = $(if ($env:IUCN_NAS_BACKUP_DIR) { $env:IUCN_NAS_BACKUP_DIR } else { "W:\Website Datenbank Backup" }),
  [int]$MaxBackups = 3,
  [switch]$DryRun,
  [switch]$Force,
  [switch]$Progress
)

$ErrorActionPreference = "Stop"

function Invoke-Git {
  param([string[]]$Arguments)
  $output = & git @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Arguments -join ' ') fehlgeschlagen: $output"
  }
  return ($output -join "`n").Trim()
}

function Get-Sha256Hex {
  param([string]$Text)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Get-RelativePathFromRoot {
  param(
    [string]$Root,
    [string]$FullPath
  )
  $rootWithSeparator = $Root.TrimEnd("\") + "\"
  if (-not $FullPath.StartsWith($rootWithSeparator, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Pfad liegt ausserhalb des Projektordners: $FullPath"
  }
  return $FullPath.Substring($rootWithSeparator.Length)
}

function Convert-ToZipPath {
  param([string]$RelativePath)
  return ($RelativePath -replace "\\", "/")
}

function Test-ExcludedRelativePath {
  param([string]$RelativePath)
  $normalized = Convert-ToZipPath $RelativePath
  return (
    $normalized -match '(^|/)\.env(?:\.[^/]*)?$' -or
    $normalized -eq "temp" -or
    $normalized.StartsWith("temp/") -or
    $normalized -eq "lightroom-plugin/FNWildlifeTaxonomy.lrplugin/temp" -or
    $normalized.StartsWith("lightroom-plugin/FNWildlifeTaxonomy.lrplugin/temp/") -or
    $normalized -eq "Testlauf" -or
    $normalized.StartsWith("Testlauf/") -or
    $normalized -eq "species-explorer/staging" -or
    $normalized.StartsWith("species-explorer/staging/") -or
    $normalized -eq "species-explorer/pipeline-asset-backups" -or
    $normalized.StartsWith("species-explorer/pipeline-asset-backups/") -or
    $normalized -eq "species-explorer/cleanup-trash" -or
    $normalized.StartsWith("species-explorer/cleanup-trash/") -or
    $normalized -eq "species-explorer/logs" -or
    $normalized.StartsWith("species-explorer/logs/")
  )
}

function Get-FileSha256Hex {
  param([string]$Path)
  $sha = [Security.Cryptography.SHA256]::Create()
  $stream = [IO.File]::OpenRead($Path)
  try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace("-", "").ToLowerInvariant() }
  finally { $stream.Dispose(); $sha.Dispose() }
}

function Assert-LocalDataBackupTarget {
  param([string]$RepoRoot)
  $settingsPath = Join-Path $RepoRoot "storage-path.json"
  if (-not (Test-Path -LiteralPath $settingsPath)) { return }
  $settings = Get-Content -LiteralPath $settingsPath -Raw -Force | ConvertFrom-Json
  if ($settings.schemaVersion -ne 1 -or $settings.state -ne "ready" -or -not $settings.dataRoot) {
    throw "Der gemeinsame Datenpfad ist nicht sicher gebunden. Vor dem vollstaendigen NAS-Backup Speichereinstellung pruefen."
  }
  $configuredRoot = if ([IO.Path]::IsPathRooted($settings.dataRoot)) {
    [IO.Path]::GetFullPath($settings.dataRoot)
  } elseif ($settings.dataRoot -eq "Daten") { Join-Path $RepoRoot "Daten" } else {
    throw "Unzulaessiger relativer Datenpfad in storage-path.json."
  }
  if (-not $configuredRoot.TrimEnd("\", "/").Equals((Join-Path $RepoRoot "Daten"), [StringComparison]::OrdinalIgnoreCase)) {
    throw "Der Datenpfad liegt ausserhalb des Programmordners. Fuer ein vollstaendiges Backup ist eine gesonderte Datensicherung erforderlich; es wurde kein unvollstaendiges NAS-Backup erstellt."
  }
}

function Get-LocalDataStateHash {
  param([string]$RepoRoot, [object[]]$SourceRecords = $null)
  $records = New-Object System.Collections.Generic.List[string]
  if ($null -ne $SourceRecords) {
    foreach ($record in $SourceRecords) {
      if ($record.path -eq "storage-path.json") { $records.Add("storage-path.json|$($record.sha256)") }
      elseif ($record.path.StartsWith("Daten/", [StringComparison]::OrdinalIgnoreCase)) {
        $records.Add("$($record.path)|$($record.bytes)|$($record.sha256)")
      }
    }
    return Get-Sha256Hex (@($records | Sort-Object) -join "`n")
  }
  $dataRoot = Join-Path $RepoRoot "Daten"
  $settingsPath = Join-Path $RepoRoot "storage-path.json"
  if (Test-Path -LiteralPath $settingsPath) {
    $settingsEntry = Get-Item -LiteralPath $settingsPath -Force
    if ($settingsEntry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Verknuepfte Speichereinstellung ist kein sicherer Backup-Eingang." }
    $records.Add("storage-path.json|$(Get-FileSha256Hex -Path $settingsPath)")
  }
  function Add-DataFiles {
    param([string]$Directory)
    $directoryEntry = Get-Item -LiteralPath $Directory -Force
    if (-not $directoryEntry.PSIsContainer -or ($directoryEntry.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw "Verknuepfter Datenordner kann nicht vollstaendig gesichert werden."
    }
    foreach ($entry in Get-ChildItem -LiteralPath $Directory -Force) {
      $relative = Convert-ToZipPath (Get-RelativePathFromRoot -Root $RepoRoot -FullPath $entry.FullName)
      if (Test-ExcludedRelativePath $relative) { continue }
      if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Verknuepfte Daten sind kein sicherer Backup-Eingang." }
      if ($entry.PSIsContainer) { Add-DataFiles -Directory $entry.FullName }
      else {
        $relative = Convert-ToZipPath (Get-RelativePathFromRoot -Root $RepoRoot -FullPath $entry.FullName)
        $records.Add("$relative|$($entry.Length)|$(Get-FileSha256Hex -Path $entry.FullName)")
      }
    }
  }
  if (Test-Path -LiteralPath $dataRoot) { Add-DataFiles -Directory $dataRoot }
  $sorted = @($records | Sort-Object)
  return Get-Sha256Hex ($sorted -join "`n")
}

function Get-BackupSourceFiles {
  param([string]$RepoRoot)
  function Visit-BackupDirectory {
    param([string]$Directory)
    $directoryEntry = Get-Item -LiteralPath $Directory -Force -ErrorAction Stop
    if ($directoryEntry.Attributes -band [IO.FileAttributes]::ReparsePoint) {
      throw "Verknuepfte Projektpfade sind kein sicherer Backup-Eingang."
    }
    foreach ($entry in Get-ChildItem -LiteralPath $Directory -Force) {
      $relative = Get-RelativePathFromRoot -Root $RepoRoot -FullPath $entry.FullName
      if (Test-ExcludedRelativePath $relative) { continue }
      if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw "Verknuepfte Projektdateien sind kein sicherer Backup-Eingang."
      }
      if ($entry.PSIsContainer) { Visit-BackupDirectory -Directory $entry.FullName }
      else { $entry }
    }
  }
  return @(Visit-BackupDirectory -Directory $RepoRoot | Sort-Object FullName)
}

function Get-BackupSourceRecords {
  param([string]$RepoRoot, [object[]]$Files)
  return @($Files | ForEach-Object {
    [pscustomobject][ordered]@{
      path = Convert-ToZipPath (Get-RelativePathFromRoot -Root $RepoRoot -FullPath $_.FullName)
      bytes = [long]$_.Length
      sha256 = Get-FileSha256Hex -Path $_.FullName
    }
  })
}

function Get-ArchiveManifest {
  param([string]$ArchivePath)
  try {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)
    try {
      $entry = $zip.GetEntry("backup-manifest.json")
      if (-not $entry) { return $null }
      $reader = [System.IO.StreamReader]::new($entry.Open())
      try {
        return ($reader.ReadToEnd() | ConvertFrom-Json)
      } finally {
        $reader.Dispose()
      }
    } finally {
      $zip.Dispose()
    }
  } catch {
    return $null
  }
}

function Add-FileToArchive {
  param(
    [System.IO.Compression.ZipArchive]$Archive,
    [string]$SourcePath,
    [string]$EntryName
  )
  $entry = $Archive.CreateEntry($EntryName, [System.IO.Compression.CompressionLevel]::Optimal)
  $entry.LastWriteTime = (Get-Item -LiteralPath $SourcePath -Force).LastWriteTime
  $inputStream = [System.IO.File]::OpenRead($SourcePath)
  try {
    $outputStream = $entry.Open()
    try {
      $inputStream.CopyTo($outputStream)
    } finally {
      $outputStream.Dispose()
    }
  } finally {
    $inputStream.Dispose()
  }
}

function Write-BackupProgress {
  param(
    [int]$Percent,
    [string]$Message,
    [int]$ProcessedFiles = -1,
    [int]$FileCount = -1
  )
  if (-not $Progress) { return }
  $payload = [ordered]@{
    percent = $Percent
    message = $Message
  }
  if ($ProcessedFiles -ge 0) { $payload.processedFiles = $ProcessedFiles }
  if ($FileCount -ge 0) { $payload.fileCount = $FileCount }
  [Console]::Error.WriteLine("BACKUP_PROGRESS $($payload | ConvertTo-Json -Compress)")
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "nas-backup-retention.ps1")
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$backupRootPath = $BackupRoot
Assert-LocalDataBackupTarget -RepoRoot $repoRoot

Write-BackupProgress -Percent 1 -Message "Backup-Ziel wird geprueft"

if ($MaxBackups -ne 3) {
  throw "Die NAS-Aufbewahrung verlangt drei gepruefte Staende: zwei aktuelle und einen aelteren Checkpoint."
}

if (-not (Test-Path -LiteralPath $backupRootPath)) {
  throw "NAS-Backup-Zielpfad wurde nicht gefunden: $backupRootPath"
}

$backupRootResolved = (Resolve-Path -LiteralPath $backupRootPath).Path
if ($backupRootResolved.Equals($repoRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $backupRootResolved.StartsWith($repoRoot.TrimEnd("\", "/") + "\", [StringComparison]::OrdinalIgnoreCase)) {
  throw "Das NAS-Backupziel darf nicht innerhalb des zu sichernden Programmordners liegen."
}
Write-BackupProgress -Percent 3 -Message "Git-Stand wird geprueft"
$gitCommit = Invoke-Git -Arguments @("rev-parse", "HEAD")
$projectId = Get-Sha256Hex (Invoke-Git -Arguments @("remote", "get-url", "origin"))
$gitShort = Invoke-Git -Arguments @("rev-parse", "--short=12", "HEAD")
$gitStatus = Invoke-Git -Arguments @("status", "--porcelain=v1")
$workingTreeDirty = -not [string]::IsNullOrWhiteSpace($gitStatus)
$statusHash = Get-Sha256Hex $gitStatus
Write-BackupProgress -Percent 4 -Message "Dauerhafte lokale Daten werden fuer den Backup-Nachweis geprueft"
$files = @(Get-BackupSourceFiles -RepoRoot $repoRoot)
$sourceRecords = @(Get-BackupSourceRecords -RepoRoot $repoRoot -Files $files)
$sourceRecordsHash = Get-NasJsonHash $sourceRecords
$localDataStateHash = Get-LocalDataStateHash -RepoRoot $repoRoot -SourceRecords $sourceRecords

$existingArchives = @(Get-ChildItem -LiteralPath $backupRootResolved -Filter "IUCN_Datenbank_*.zip" -Force -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending)
Write-BackupProgress -Percent 6 -Message "Vorhandene NAS-Backups werden geprueft"
$latestManifest = if ($existingArchives.Count) { Get-ArchiveManifest $existingArchives[0].FullName } else { $null }
$currentStateKey = "$gitCommit|$statusHash|$localDataStateHash|$sourceRecordsHash"
$latestStateKey = if ($latestManifest) { "$($latestManifest.gitCommit)|$($latestManifest.workingTreeStatusHash)|$($latestManifest.localDataStateHash)|$($latestManifest.sourceRecordsHash)" } else { "" }
$latestVerified = if ($latestStateKey -eq $currentStateKey) {
  Test-NasArchiveContents -ArchivePath $existingArchives[0].FullName
} else { $null }

if (-not $Force -and $latestVerified -and $latestVerified.ok -and $latestVerified.manifest.projectId -eq $projectId) {
  $rotationPlan = Get-NasRetentionPlan -BackupRoot $backupRootResolved -MaxBackups $MaxBackups -ExpectedProjectId $projectId -VerifiedProofs @($latestVerified)
  $rotation = if (-not $DryRun -and $rotationPlan.removeArchives.Count) { Invoke-NasRetentionPlan -Plan $rotationPlan }
  elseif (-not $DryRun) { [pscustomobject]@{ ok = $true; reason = ""; removedArchivePaths = @() } } else { $null }
  Write-BackupProgress -Percent 100 -Message "Kein neues Backup erforderlich"
  $result = [pscustomobject]@{
    ok = $true
    skipped = $true
    reason = "Seit dem letzten Backup wurden keine Aenderungen erkannt."
    backupRoot = $backupRootResolved
    latestBackup = if ($existingArchives.Count) { $existingArchives[0].FullName } else { "" }
    archiveSha256 = $latestVerified.archiveHash
    archiveId = $latestVerified.archiveId
    archiveVerified = $true
    gitCommit = $gitCommit
    workingTreeDirty = $workingTreeDirty
    retentionPolicy = $rotationPlan.retentionPolicy
    retainedCheckpoint = $rotationPlan.retainedCheckpoint
    retainedArchivePaths = $rotationPlan.retainedArchivePaths
    protectedArchives = $rotationPlan.protectedArchives
    rotationPlanRevision = $rotationPlan.revision
    retentionWouldRemove = $rotationPlan.removeArchives.Count
    retainedBackups = $rotationPlan.verifiedArchiveCount - $(if ($rotation) { $rotation.removedArchivePaths.Count } else { 0 })
    removedBackups = if ($rotation) { $rotation.removedArchivePaths.Count } else { 0 }
    rotationCompleted = if ($rotation) { $rotation.ok } else { $false }
    rotationWarning = if ($rotation) { $rotation.reason } else { "" }
  }
  $result | ConvertTo-Json -Depth 5
  exit 0
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$archiveName = "IUCN_Datenbank_${timestamp}_${gitShort}.zip"
$archivePath = Join-Path $backupRootResolved $archiveName
$pendingArchivePath = Join-Path $backupRootResolved ("." + $archiveName + ".pending-" + [guid]::NewGuid().ToString("N"))
Write-BackupProgress -Percent 10 -Message "Dateiliste wurde erstellt" -ProcessedFiles 0 -FileCount $files.Count

$manifest = [ordered]@{
  schemaVersion = 2
  backupKind = "arten-explorer-nas-restore"
  archiveId = [guid]::NewGuid().ToString()
  projectId = $projectId
  createdAt = (Get-Date).ToString("o")
  sourcePath = $repoRoot
  backupRoot = $backupRootResolved
  gitCommit = $gitCommit
  gitShort = $gitShort
  workingTreeDirty = $workingTreeDirty
  workingTreeStatusHash = $statusHash
  localDataStateHash = $localDataStateHash
  sourceRecordsHash = $sourceRecordsHash
  includesLocalData = (Test-Path -LiteralPath (Join-Path $repoRoot "Daten"))
  nodeVersion = (node -p "process.version")
  includesNodeModules = (Test-Path -LiteralPath (Join-Path $repoRoot "node_modules"))
  includesFfmpeg = (Test-Path -LiteralPath (Join-Path $repoRoot "local-tools\ffmpeg"))
  maxBackups = $MaxBackups
  excluded = @(
    ".env and .env.* at every level",
    "temp/",
    "lightroom-plugin/FNWildlifeTaxonomy.lrplugin/temp/",
    "Testlauf/",
    "species-explorer/staging/",
    "species-explorer/pipeline-asset-backups/",
    "species-explorer/cleanup-trash/",
    "species-explorer/logs/"
  )
  fileCount = $files.Count
  totalBytes = ($files | Measure-Object Length -Sum).Sum
  files = $sourceRecords
}

if ($DryRun) {
  $rotationPlan = Get-NasRetentionPlan -BackupRoot $backupRootResolved -MaxBackups $MaxBackups -ExpectedProjectId $projectId
  [pscustomobject]@{
    ok = $true
    dryRun = $true
    skipped = $false
    archivePath = $archivePath
    backupRoot = $backupRootResolved
    fileCount = $files.Count
    totalBytes = $manifest.totalBytes
    gitCommit = $gitCommit
    workingTreeDirty = $workingTreeDirty
    retentionPolicy = $rotationPlan.retentionPolicy
    retainedCheckpoint = $rotationPlan.retainedCheckpoint
    retainedArchivePaths = $rotationPlan.retainedArchivePaths
    protectedArchives = $rotationPlan.protectedArchives
    rotationPlanRevision = $rotationPlan.revision
    retentionWouldRemove = [Math]::Max(0, $rotationPlan.verifiedArchiveCount + 1 - $MaxBackups)
  } | ConvertTo-Json -Depth 5
  exit 0
}

if (Test-Path -LiteralPath $archivePath) {
  throw "Backup-Datei existiert bereits: $archivePath"
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$fileStream = [System.IO.File]::Open($pendingArchivePath, [System.IO.FileMode]::CreateNew)
try {
  $archive = [System.IO.Compression.ZipArchive]::new($fileStream, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    $manifestEntry = $archive.CreateEntry("backup-manifest.json", [System.IO.Compression.CompressionLevel]::Optimal)
    $manifestWriter = [System.IO.StreamWriter]::new($manifestEntry.Open(), [System.Text.UTF8Encoding]::new($false))
    try {
      $manifestWriter.Write(($manifest | ConvertTo-Json -Depth 8))
    } finally {
      $manifestWriter.Dispose()
    }

    $processedFiles = 0
    $lastProgressPercent = 10
    foreach ($file in $files) {
      $processedFiles += 1
      $relative = Get-RelativePathFromRoot -Root $repoRoot -FullPath $file.FullName
      Add-FileToArchive -Archive $archive -SourcePath $file.FullName -EntryName (Convert-ToZipPath $relative)
      $currentPercent = 10 + [int][Math]::Floor(($processedFiles / [Math]::Max(1, $files.Count)) * 85)
      if ($currentPercent -gt $lastProgressPercent -or $processedFiles -eq $files.Count) {
        $lastProgressPercent = $currentPercent
        Write-BackupProgress -Percent $currentPercent -Message "Dateien werden ins ZIP geschrieben" -ProcessedFiles $processedFiles -FileCount $files.Count
      }
    }
  } finally {
    $archive.Dispose()
  }
  $fileStream.Dispose()
  $verifiedArchive = Test-NasArchiveContents -ArchivePath $pendingArchivePath -ExpectedManifest $manifest
  if (-not $verifiedArchive.ok) { throw "NAS-Backuppruefung fehlgeschlagen: $($verifiedArchive.reason)" }
  $afterRecords = @(Get-BackupSourceRecords -RepoRoot $repoRoot -Files @(Get-BackupSourceFiles -RepoRoot $repoRoot))
  if ((Get-LocalDataStateHash -RepoRoot $repoRoot -SourceRecords $afterRecords) -ne $localDataStateHash) {
    throw "Dauerhafte Daten wurden waehrend der Sicherung geaendert. Dieses Backup wird nicht als vollstaendig uebernommen; bitte nach Abschluss der Datenaktion erneut sichern."
  }
  if ((Get-NasJsonHash $afterRecords) -ne $sourceRecordsHash -or
      (Invoke-Git -Arguments @("rev-parse", "HEAD")) -ne $gitCommit -or
      (Get-Sha256Hex (Invoke-Git -Arguments @("status", "--porcelain=v1"))) -ne $statusHash) {
    throw "Projektdateien oder Git-Stand wurden waehrend der Sicherung geaendert; kein alter Stand wird entfernt."
  }
  Move-Item -LiteralPath $pendingArchivePath -Destination $archivePath -ErrorAction Stop
  $verifiedArchive.path = $archivePath
} catch {
  $fileStream.Dispose()
  if (Test-Path -LiteralPath $pendingArchivePath) {
    Remove-Item -LiteralPath $pendingArchivePath -Force
  }
  throw
} finally {
  $fileStream.Dispose()
}

Write-BackupProgress -Percent 97 -Message "Backup-Rotation wird geprueft"
$rotationPlan = Get-NasRetentionPlan -BackupRoot $backupRootResolved -MaxBackups $MaxBackups -ExpectedProjectId $projectId -VerifiedProofs @($verifiedArchive)
$rotation = if ($archivePath -in $rotationPlan.retainedArchivePaths -and $rotationPlan.removeArchives.Count) { Invoke-NasRetentionPlan -Plan $rotationPlan }
elseif ($archivePath -in $rotationPlan.retainedArchivePaths) { [pscustomobject]@{ ok = $true; reason = ""; removedArchivePaths = @() } }
else { [pscustomobject]@{ ok = $false; reason = "Neuer Stand ist nicht sicher als aktueller Ruecknahmestand gebunden; nichts entfernt."; removedArchivePaths = @() } }
Write-BackupProgress -Percent 100 -Message "Backup abgeschlossen"

[pscustomobject]@{
  ok = $true
  dryRun = $false
  skipped = $false
  archivePath = $archivePath
  archiveSha256 = $verifiedArchive.archiveHash
  archiveId = $verifiedArchive.archiveId
  archiveVerified = $true
  backupRoot = $backupRootResolved
  fileCount = $files.Count
  totalBytes = $manifest.totalBytes
  gitCommit = $gitCommit
  workingTreeDirty = $workingTreeDirty
  retentionPolicy = $rotationPlan.retentionPolicy
  retainedCheckpoint = $rotationPlan.retainedCheckpoint
  retainedArchivePaths = $rotationPlan.retainedArchivePaths
  protectedArchives = $rotationPlan.protectedArchives
  rotationPlanRevision = $rotationPlan.revision
  retainedBackups = $rotationPlan.verifiedArchiveCount - $rotation.removedArchivePaths.Count
  removedBackups = $rotation.removedArchivePaths.Count
  rotationCompleted = $rotation.ok
  rotationWarning = $rotation.reason
} | ConvertTo-Json -Depth 5
