# NAS restore policy helpers. Dot-sourcing defines functions only; it never
# creates a backup, enumerates a production root or removes an archive.
function Get-NasFileHash {
  param([string]$Path)
  $sha = [Security.Cryptography.SHA256]::Create()
  $stream = [IO.File]::OpenRead($Path)
  try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace("-", "").ToLowerInvariant() }
  finally { $stream.Dispose(); $sha.Dispose() }
}

function Get-NasJsonHash {
  param($Value)
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $Value -Depth 20 -Compress))
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
  } finally { $sha.Dispose() }
}

function Get-NasVerificationToken {
  param($Proof)
  if (-not $script:NasVerificationProofKey) {
    $script:NasVerificationProofKey = New-Object byte[] 32
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($script:NasVerificationProofKey) } finally { $random.Dispose() }
  }
  $binding = [ordered]@{ archiveHash = $Proof.archiveHash; archiveId = $Proof.archiveId;
    createdAt = $Proof.createdAt; manifestHash = Get-NasJsonHash $Proof.manifest }
  $hmac = [Security.Cryptography.HMACSHA256]::new($script:NasVerificationProofKey)
  try { return ([BitConverter]::ToString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes((Get-NasJsonHash $binding))))).Replace("-", "").ToLowerInvariant() }
  finally { $hmac.Dispose() }
}

function Test-NasArchiveContents {
  param([string]$ArchivePath, $ExpectedManifest = $null, [string]$ExpectedArchiveHash = "")
  $result = [ordered]@{ ok = $false; path = [IO.Path]::GetFullPath($ArchivePath); reason = "";
    archiveHash = ""; archiveId = ""; createdAt = ""; manifest = $null }
  $zip = $null
  try {
    $file = Get-Item -LiteralPath $result.path -Force -ErrorAction Stop
    if ($file.PSIsContainer -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw "Verknuepfte oder nicht regulaere Sicherungsdatei bleibt geschuetzt."
    }
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($result.path)
    $manifestEntries = @($zip.Entries | Where-Object { $_.FullName -eq "backup-manifest.json" })
    if ($manifestEntries.Count -ne 1 -or $manifestEntries[0].Length -gt (32 * 1024 * 1024)) {
      throw "Sicherung hat kein eindeutiges, lesbares Pruefmanifest."
    }
    $reader = [IO.StreamReader]::new($manifestEntries[0].Open())
    try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json }
    finally { $reader.Dispose() }
    if ($manifest.schemaVersion -ne 2 -or $manifest.backupKind -ne "arten-explorer-nas-restore" -or
        -not $manifest.archiveId -or $manifest.gitCommit -notmatch '^[a-f0-9]{40,64}$' -or
        $manifest.localDataStateHash -notmatch '^[a-f0-9]{64}$' -or
        $manifest.sourceRecordsHash -notmatch '^[a-f0-9]{64}$' -or $manifest.projectId -notmatch '^[a-f0-9]{64}$') {
      throw "Altbestand oder unbekannter Manifestvertrag bleibt geschuetzt."
    }
    $parsedId = [guid]::Empty
    if (-not [guid]::TryParse([string]$manifest.archiveId, [ref]$parsedId)) { throw "Ungueltige Sicherungsidentitaet." }
    $createdAt = [DateTimeOffset]::Parse([string]$manifest.createdAt)
    $records = @($manifest.files)
    if ($records.Count -eq 0 -or $records.Count -ne $manifest.fileCount -or
        (Get-NasJsonHash @($records | Sort-Object path)) -ne $manifest.sourceRecordsHash) {
      throw "Dateiverzeichnis der Sicherung ist unvollstaendig oder veraendert."
    }
    $expected = [Collections.Generic.Dictionary[string, object]]::new([StringComparer]::OrdinalIgnoreCase)
    $totalBytes = [long]0
    foreach ($record in $records) {
      $name = [string]$record.path
      if (-not $name -or $name -eq "backup-manifest.json" -or $name.Contains("\") -or
          $name.StartsWith("/") -or $name.Contains(":") -or $name -match '(^|/)\.{1,2}(/|$)' -or
          $name.EndsWith("/") -or $record.sha256 -notmatch '^[a-f0-9]{64}$' -or
          $null -eq $record.bytes -or [long]$record.bytes -lt 0 -or $expected.ContainsKey($name)) {
        throw "Unsicherer, doppelter oder ungueltiger Pfad im Sicherungsverzeichnis."
      }
      $expected.Add($name, $record)
      $totalBytes += [long]$record.bytes
    }
    if ($totalBytes -ne [long]$manifest.totalBytes -or $zip.Entries.Count -ne ($records.Count + 1)) {
      throw "Sicherungsumfang passt nicht zum Manifest."
    }
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($entry in $zip.Entries) {
      if ($entry.FullName -eq "backup-manifest.json") { continue }
      if (-not $expected.ContainsKey($entry.FullName) -or -not $seen.Add($entry.FullName)) {
        throw "Unerwartete oder doppelte Datei im Sicherungsarchiv."
      }
      $record = $expected[$entry.FullName]
      if ($entry.Length -ne [long]$record.bytes) { throw "Dateigroesse stimmt nicht mit dem Sicherungsmanifest ueberein." }
      $stream = $entry.Open()
      $sha = [Security.Cryptography.SHA256]::Create()
      try { $actual = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace("-", "").ToLowerInvariant() }
      finally { $sha.Dispose(); $stream.Dispose() }
      if ($actual -ne $record.sha256) { throw "Dateiinhalt stimmt nicht mit dem Sicherungsmanifest ueberein." }
    }
    if ($ExpectedManifest -and (Get-NasJsonHash $manifest) -ne (Get-NasJsonHash $ExpectedManifest)) {
      throw "Sicherungsmanifest passt nicht zum gebundenen Ausgangsstand."
    }
    # Keep the ZIP reader open until its fingerprint is taken. On Windows this
    # also prevents a writer replacing the just-verified bytes in between.
    $result.archiveHash = Get-NasFileHash $result.path
    if ($ExpectedArchiveHash -and $result.archiveHash -ne $ExpectedArchiveHash) {
      throw "Sicherungsdatei wurde seit ihrer Pruefung veraendert."
    }
    $result.ok = $true
    $result.archiveId = [string]$manifest.archiveId
    $result.createdAt = $createdAt.ToUniversalTime().ToString("o")
    $result.manifest = $manifest
    $result.verificationToken = Get-NasVerificationToken ([pscustomobject]$result)
  } catch { $result.reason = $_.Exception.Message }
  finally { if ($zip) { $zip.Dispose() } }
  return [pscustomobject]$result
}

function Get-NasRetentionPlan {
  param([string]$BackupRoot, [int]$MaxBackups = 3, [string]$ExpectedProjectId = "", [object[]]$VerifiedProofs = @())
  if ($MaxBackups -ne 3) { throw "NAS-Regel verlangt drei gepruefte Staende: zwei aktuelle und einen aelteren Checkpoint." }
  if ($ExpectedProjectId -notmatch '^[a-f0-9]{64}$') { throw "Projektbindung fuer die NAS-Aufbewahrung fehlt; nichts entfernt." }
  $root = Get-Item -LiteralPath $BackupRoot -Force -ErrorAction Stop
  if (-not $root.PSIsContainer -or ($root.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw "Verknuepftes oder fehlendes Sicherungsziel bleibt geschuetzt."
  }
  $verified = @(); $protected = @(); $inputs = @(); $proofs = @()
  foreach ($file in @(Get-ChildItem -LiteralPath $root.FullName -Force -File | Where-Object {
      $_.Name -like "IUCN_Datenbank_*.zip" -or $_.Name -like ".nas-rotation-*.pending" -or
      $_.Name -like ".IUCN_Datenbank_*.zip.pending-*"
    } | Sort-Object Name)) {
    if ($file.Name.StartsWith(".")) {
      $protected += [pscustomobject]@{ path = $file.FullName; reason = "Unterbrochener Sicherungs-/Rotationsvorgang bleibt geschuetzt." }
      $inputs += [pscustomobject]@{ path = $file.FullName; protected = $true;
        bytes = $file.Length; lastWriteTimeUtc = $file.LastWriteTimeUtc.ToString("o") }
      continue
    }
    $cached = @($VerifiedProofs | Where-Object { $_.path -eq $file.FullName -and $_.ok -and
      $_.verificationToken -and $_.verificationToken -eq (Get-NasVerificationToken $_) } | Select-Object -First 1)
    # A process-local authenticated full-content proof can be reused only after
    # a fresh hash of these exact archive bytes. Changed/forged/exported proofs
    # require a full read again; mtime never substitutes for content checks.
    $check = if ($cached.Count -and (Get-NasFileHash $file.FullName) -eq $cached[0].archiveHash) { $cached[0] }
    else { Test-NasArchiveContents -ArchivePath $file.FullName }
    if ($check.ok -and $ExpectedProjectId -and $check.manifest.projectId -ne $ExpectedProjectId) {
      $check = [pscustomobject]@{ ok = $false; reason = "Sicherung eines anderen Projekts bleibt geschuetzt." }
    }
    if ($check.ok) {
      $item = [pscustomobject]@{ path = $file.FullName; archiveHash = $check.archiveHash;
        archiveId = $check.archiveId; createdAt = $check.createdAt }
      $verified += $item
      $proofs += $check
      $inputs += $item
    } else {
      $protected += [pscustomobject]@{ path = $file.FullName; reason = $check.reason }
      $inputs += [pscustomobject]@{ path = $file.FullName; protected = $true;
        bytes = $file.Length; lastWriteTimeUtc = $file.LastWriteTimeUtc.ToString("o") }
    }
  }
  $ordered = @($verified | Sort-Object @{Expression="createdAt";Descending=$true}, @{Expression="path";Descending=$true})
  $keep = @($ordered | Select-Object -First 2)
  $checkpoint = ""
  if ($ordered.Count -gt 2) {
    # Keep the oldest verified independent restore point, not merely the third
    # latest archive. New backups cannot silently rotate this checkpoint away.
    $checkpoint = $ordered[-1].path
    $keep += $ordered[-1]
  }
  $keepPaths = @($keep | ForEach-Object { $_.path })
  $remove = @($ordered | Where-Object { $_.path -notin $keepPaths })
  return [pscustomobject]@{ backupRoot = $root.FullName; maxBackups = 3;
    retentionPolicy = "two-newest-plus-oldest-verified-checkpoint";
    retainedCheckpoint = $checkpoint; retainedArchivePaths = $keepPaths; retainedArchives = $keep;
    removeArchives = $remove; protectedArchives = $protected; verifiedProofs = $proofs;
    projectId = $ExpectedProjectId;
    verifiedArchiveCount = $verified.Count; revision = Get-NasJsonHash @($inputs) }
}

function Invoke-NasRetentionPlan {
  param($Plan)
  $fresh = Get-NasRetentionPlan -BackupRoot $Plan.backupRoot -MaxBackups 3 -ExpectedProjectId $Plan.projectId -VerifiedProofs $Plan.verifiedProofs
  if ($fresh.revision -ne $Plan.revision -or
      (Get-NasJsonHash $fresh.retainedArchivePaths) -ne (Get-NasJsonHash $Plan.retainedArchivePaths) -or
      (Get-NasJsonHash $fresh.removeArchives) -ne (Get-NasJsonHash $Plan.removeArchives)) {
    return [pscustomobject]@{ ok = $false; reason = "Sicherungsbestand oder Bereinigungsplan wurde veraendert; nichts entfernt.";
      removedArchivePaths = @(); protectedArchives = $fresh.protectedArchives }
  }
  $removed = @(); $leases = @()
  try {
    foreach ($keep in $fresh.retainedArchives) {
      # A verified restore point is pinned throughout the complete rotation:
      # neither replacement, modification nor deletion by another process.
      $leases += [IO.File]::Open($keep.path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
      if ((Get-NasFileHash $keep.path) -ne $keep.archiveHash) {
        throw "Ein geschuetzter Ruecknahmestand wurde veraendert; keine weitere Entfernung."
      }
    }
    foreach ($item in $fresh.removeArchives) {
    $parent = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($item.path))
    if (-not $parent.Equals([IO.Path]::GetFullPath($fresh.backupRoot).TrimEnd("\", "/"), [StringComparison]::OrdinalIgnoreCase)) {
      return [pscustomobject]@{ ok = $false; reason = "Sicherungsziel liegt ausserhalb des freigegebenen Ordners.";
        removedArchivePaths = $removed; protectedArchives = $fresh.protectedArchives }
    }
    $check = Test-NasArchiveContents -ArchivePath $item.path -ExpectedArchiveHash $item.archiveHash
    if (-not $check.ok) {
      return [pscustomobject]@{ ok = $false; reason = $check.reason;
        removedArchivePaths = $removed; protectedArchives = $fresh.protectedArchives }
    }
    $pendingPath = Join-Path $fresh.backupRoot (".nas-rotation-" + [guid]::NewGuid().ToString("N") + "-" + [IO.Path]::GetFileName($item.path) + ".pending")
    try {
      # Move only into an exclusive own name, then verify the moved file again.
      # A replaced candidate therefore cannot be silently removed. Interruption
      # leaves the file intact in a recognized, protected pending location.
      [IO.File]::Move($item.path, $pendingPath)
      $moved = Test-NasArchiveContents -ArchivePath $pendingPath -ExpectedArchiveHash $item.archiveHash
      if (-not $moved.ok) { throw $moved.reason }
      Remove-Item -LiteralPath $pendingPath -Force -ErrorAction Stop
      $removed += $item.path
    }
    catch {
      $restoreWarning = ""
      if ((Test-Path -LiteralPath $pendingPath) -and -not (Test-Path -LiteralPath $item.path)) {
        try { [IO.File]::Move($pendingPath, $item.path) }
        catch { $restoreWarning = " Ruecknahmedatei bleibt geschuetzt unter $pendingPath." }
      } elseif (Test-Path -LiteralPath $pendingPath) {
        $restoreWarning = " Ruecknahmedatei bleibt geschuetzt unter $pendingPath; Fremdstand am Ausgangspfad nicht ueberschrieben."
      }
      return [pscustomobject]@{ ok = $false; reason = "Sicherungsrotation nur teilweise abgeschlossen: $($_.Exception.Message)$restoreWarning";
        removedArchivePaths = $removed; protectedArchives = $fresh.protectedArchives; recoveryWarning = $restoreWarning }
    }
  }
  return [pscustomobject]@{ ok = $true; reason = ""; removedArchivePaths = $removed;
    protectedArchives = $fresh.protectedArchives }
  } catch {
    return [pscustomobject]@{ ok = $false; reason = $_.Exception.Message; removedArchivePaths = $removed;
      protectedArchives = $fresh.protectedArchives }
  } finally { foreach ($lease in $leases) { $lease.Dispose() } }
}
