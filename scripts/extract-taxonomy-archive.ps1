param(
  [Parameter(Mandatory = $true)]
  [string]$ArchivePath,
  [Parameter(Mandatory = $true)]
  [string]$DestinationPath,
  [long]$MaxExpandedBytes = 25769803776,
  [int]$MaxEntries = 20000,
  [int]$MaxCompressionRatio = 300
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$archiveFull = [System.IO.Path]::GetFullPath($ArchivePath)
$destinationFull = [System.IO.Path]::GetFullPath($DestinationPath)
$destinationPrefix = $destinationFull.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar

if (-not [System.IO.File]::Exists($archiveFull)) {
  throw "Taxonomiearchiv wurde nicht gefunden: $archiveFull"
}

[System.IO.Directory]::CreateDirectory($destinationFull) | Out-Null
$stream = [System.IO.File]::OpenRead($archiveFull)
$zip = $null

try {
  $zip = [System.IO.Compression.ZipArchive]::new(
    $stream,
    [System.IO.Compression.ZipArchiveMode]::Read,
    $false
  )
  if ($zip.Entries.Count -gt $MaxEntries) {
    throw "Das Taxonomiearchiv enthält zu viele Einträge: $($zip.Entries.Count)."
  }

  [long]$expandedBytes = 0
  foreach ($entry in $zip.Entries) {
    $name = [string]$entry.FullName
    if (
      [string]::IsNullOrWhiteSpace($name) -or
      [System.IO.Path]::IsPathRooted($name) -or
      $name.Contains([char]0) -or
      $name -match '(^|[\\/])\.\.([\\/]|$)' -or
      $name -match '^[A-Za-z]:'
    ) {
      throw "Unzulässiger Pfad im Taxonomiearchiv: $name"
    }

    $unixMode = (($entry.ExternalAttributes -shr 16) -band 0xF000)
    if ($unixMode -eq 0xA000) {
      throw "Symbolischer Link im Taxonomiearchiv ist nicht erlaubt: $name"
    }

    $expandedBytes += [long]$entry.Length
    if ($expandedBytes -gt $MaxExpandedBytes) {
      throw "Das entpackte Taxonomiearchiv überschreitet das Sicherheitslimit."
    }
    if (
      $entry.Length -gt 1048576 -and
      $entry.CompressedLength -gt 0 -and
      ($entry.Length / $entry.CompressedLength) -gt $MaxCompressionRatio
    ) {
      throw "Verdächtige Kompressionsrate im Taxonomiearchiv: $name"
    }

    $target = [System.IO.Path]::GetFullPath(
      [System.IO.Path]::Combine($destinationFull, $name.Replace('/', '\'))
    )
    if (-not $target.StartsWith($destinationPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Archivpfad verlässt das Zielverzeichnis: $name"
    }
  }

  $index = 0
  foreach ($entry in $zip.Entries) {
    $index += 1
    $target = [System.IO.Path]::GetFullPath(
      [System.IO.Path]::Combine($destinationFull, $entry.FullName.Replace('/', '\'))
    )
    if ([string]::IsNullOrEmpty($entry.Name)) {
      [System.IO.Directory]::CreateDirectory($target) | Out-Null
    } else {
      [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($target)) | Out-Null
      $inputStream = $entry.Open()
      $outputStream = [System.IO.File]::Create($target)
      try {
        $inputStream.CopyTo($outputStream)
      } finally {
        $outputStream.Dispose()
        $inputStream.Dispose()
      }
    }
    if (($index % 25) -eq 0 -or $index -eq $zip.Entries.Count) {
      [Console]::Out.WriteLine("PROGRESS`t$index`t$($zip.Entries.Count)")
    }
  }

  [Console]::Out.WriteLine(
    "RESULT`t" + (@{
      entries = $zip.Entries.Count
      expandedBytes = $expandedBytes
      destination = $destinationFull
    } | ConvertTo-Json -Compress)
  )
} finally {
  if ($null -ne $zip) { $zip.Dispose() }
  $stream.Dispose()
}
