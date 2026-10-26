$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$launcher = Join-Path $scriptDir "start-explorer.vbs"
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Arten-Explorer.lnk"
$wscript = Join-Path $env:WINDIR "System32\wscript.exe"
$appIcon = Join-Path $scriptDir "assets\arten-explorer-transparent.ico"

if (-not (Test-Path -LiteralPath $launcher)) {
  throw "Launcher nicht gefunden: $launcher"
}

if (-not (Test-Path -LiteralPath $wscript)) {
  throw "Windows Script Host wurde nicht gefunden: $wscript"
}

if (-not (Test-Path -LiteralPath $appIcon -PathType Leaf)) {
  throw "App-Symbol nicht gefunden: $appIcon"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $wscript
$shortcut.Arguments = "`"$launcher`""
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description = "Arten-Explorer starten"
$shortcut.IconLocation = "$appIcon,0"
$shortcut.Save()

Write-Host "Desktop-Verknuepfung erstellt:"
Write-Host $shortcutPath
