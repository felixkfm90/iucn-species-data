param(
  [Parameter(Mandatory=$true)][ValidateSet('Create','Extract')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$Archive,
  [Parameter(Mandatory=$true)][string]$Directory
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$directoryPath = [IO.Path]::GetFullPath($Directory).TrimEnd('\')
if ($Mode -eq 'Create') {
  if (Test-Path -LiteralPath $Archive) { throw 'Archive already exists.' }
  $zip = [IO.Compression.ZipFile]::Open($Archive, [IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($file in Get-ChildItem -LiteralPath $directoryPath -File -Recurse -Force) {
      if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Links are forbidden.' }
      $relative = $file.FullName.Substring($directoryPath.Length + 1).Replace('\','/')
      [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $relative, [IO.Compression.CompressionLevel]::Optimal)
    }
  } finally { $zip.Dispose() }
} else {
  [void][IO.Directory]::CreateDirectory($directoryPath)
  $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
  try {
    foreach ($entry in $zip.Entries) {
      $name = $entry.FullName.Replace('\','/')
      if ($name -match '(^|/)\.\.(/|$)|:|^/|[\x00-\x1f]' -or (($entry.ExternalAttributes -shr 16) -band 0xf000) -eq 0xa000) { throw "Unsafe archive entry: $name" }
      $target = [IO.Path]::GetFullPath([IO.Path]::Combine($directoryPath, $name))
      if (-not $target.StartsWith($directoryPath + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive escapes target.' }
      if ($name.EndsWith('/')) { [void][IO.Directory]::CreateDirectory($target); continue }
      [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)
    }
  } finally { $zip.Dispose() }
}
