param(
  [string]$BackupRoot = $(if ($env:IUCN_NAS_BACKUP_DIR) { $env:IUCN_NAS_BACKUP_DIR } else { "W:\Website Datenbank Backup" }),
  [int]$MaxBackups = 10,
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
  $entry.LastWriteTime = (Get-Item -LiteralPath $SourcePath).LastWriteTime
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
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$backupRootPath = $BackupRoot

Write-BackupProgress -Percent 1 -Message "Backup-Ziel wird geprüft"

if ($MaxBackups -lt 1) {
  throw "MaxBackups muss mindestens 1 sein."
}

if (-not (Test-Path -LiteralPath $backupRootPath)) {
  throw "NAS-Backup-Zielpfad wurde nicht gefunden: $backupRootPath"
}

$backupRootResolved = (Resolve-Path -LiteralPath $backupRootPath).Path
Write-BackupProgress -Percent 3 -Message "Git-Stand wird geprüft"
$gitCommit = Invoke-Git -Arguments @("rev-parse", "HEAD")
$gitShort = Invoke-Git -Arguments @("rev-parse", "--short=12", "HEAD")
$gitStatus = Invoke-Git -Arguments @("status", "--porcelain=v1")
$workingTreeDirty = -not [string]::IsNullOrWhiteSpace($gitStatus)
$statusHash = Get-Sha256Hex $gitStatus

$existingArchives = @(Get-ChildItem -LiteralPath $backupRootResolved -Filter "IUCN_Datenbank_*.zip" -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending)
Write-BackupProgress -Percent 6 -Message "Vorhandene NAS-Backups werden geprüft"
$latestManifest = if ($existingArchives.Count) { Get-ArchiveManifest $existingArchives[0].FullName } else { $null }
$currentStateKey = "$gitCommit|$statusHash"
$latestStateKey = if ($latestManifest) { "$($latestManifest.gitCommit)|$($latestManifest.workingTreeStatusHash)" } else { "" }

if (-not $Force -and $latestStateKey -eq $currentStateKey) {
  Write-BackupProgress -Percent 100 -Message "Kein neues Backup erforderlich"
  $result = [pscustomobject]@{
    ok = $true
    skipped = $true
    reason = "Seit dem letzten Backup wurden keine Aenderungen erkannt."
    backupRoot = $backupRootResolved
    latestBackup = if ($existingArchives.Count) { $existingArchives[0].FullName } else { "" }
    gitCommit = $gitCommit
    workingTreeDirty = $workingTreeDirty
  }
  $result | ConvertTo-Json -Depth 5
  exit 0
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$archiveName = "IUCN_Datenbank_${timestamp}_${gitShort}.zip"
$archivePath = Join-Path $backupRootResolved $archiveName

$files = @(Get-ChildItem -LiteralPath $repoRoot -Recurse -File -Force | Where-Object {
  $relative = Get-RelativePathFromRoot -Root $repoRoot -FullPath $_.FullName
  -not (Test-ExcludedRelativePath $relative)
})
Write-BackupProgress -Percent 10 -Message "Dateiliste wurde erstellt" -ProcessedFiles 0 -FileCount $files.Count

$manifest = [ordered]@{
  createdAt = (Get-Date).ToString("o")
  sourcePath = $repoRoot
  backupRoot = $backupRootResolved
  gitCommit = $gitCommit
  gitShort = $gitShort
  workingTreeDirty = $workingTreeDirty
  workingTreeStatusHash = $statusHash
  nodeVersion = (node -p "process.version")
  includesNodeModules = (Test-Path -LiteralPath (Join-Path $repoRoot "node_modules"))
  includesFfmpeg = (Test-Path -LiteralPath (Join-Path $repoRoot "local-tools\ffmpeg"))
  maxBackups = $MaxBackups
  excluded = @(
    "Testlauf/",
    "species-explorer/staging/",
    "species-explorer/pipeline-asset-backups/",
    "species-explorer/cleanup-trash/",
    "species-explorer/logs/"
  )
  fileCount = $files.Count
  totalBytes = ($files | Measure-Object Length -Sum).Sum
}

if ($DryRun) {
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
    retentionWouldRemove = [Math]::Max(0, ($existingArchives.Count + 1) - $MaxBackups)
  } | ConvertTo-Json -Depth 5
  exit 0
}

if (Test-Path -LiteralPath $archivePath) {
  throw "Backup-Datei existiert bereits: $archivePath"
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$fileStream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::CreateNew)
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
} catch {
  if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
  }
  throw
} finally {
  $fileStream.Dispose()
}

$allArchives = @(Get-ChildItem -LiteralPath $backupRootResolved -Filter "IUCN_Datenbank_*.zip" -File |
  Sort-Object LastWriteTime -Descending)
Write-BackupProgress -Percent 97 -Message "Backup-Rotation wird geprüft"
$removeArchives = @($allArchives | Select-Object -Skip $MaxBackups)
foreach ($archiveToRemove in $removeArchives) {
  Remove-Item -LiteralPath $archiveToRemove.FullName -Force
}
Write-BackupProgress -Percent 100 -Message "Backup abgeschlossen"

[pscustomobject]@{
  ok = $true
  dryRun = $false
  skipped = $false
  archivePath = $archivePath
  backupRoot = $backupRootResolved
  fileCount = $files.Count
  totalBytes = $manifest.totalBytes
  gitCommit = $gitCommit
  workingTreeDirty = $workingTreeDirty
  retainedBackups = [Math]::Min($allArchives.Count, $MaxBackups)
  removedBackups = $removeArchives.Count
} | ConvertTo-Json -Depth 5
