$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$launcher = Join-Path $scriptDir "start-explorer.vbs"
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "IUCN Arten-Explorer.lnk"
$wscript = Join-Path $env:WINDIR "System32\wscript.exe"
$electronExe = Join-Path $repoRoot "node_modules\electron\dist\electron.exe"

if (-not (Test-Path -LiteralPath $launcher)) {
  throw "Launcher nicht gefunden: $launcher"
}

if (-not (Test-Path -LiteralPath $wscript)) {
  throw "Windows Script Host wurde nicht gefunden: $wscript"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $wscript
$shortcut.Arguments = "`"$launcher`""
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description = "IUCN Arten-Explorer starten"
if (Test-Path -LiteralPath $electronExe) {
  $shortcut.IconLocation = "$electronExe,0"
}
$shortcut.Save()

Write-Host "Desktop-Verknuepfung erstellt:"
Write-Host $shortcutPath
