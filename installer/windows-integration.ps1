param(
  [Parameter(Mandatory=$true)][ValidateSet('Preflight','Install','Remove')][string]$Action,
  [Parameter(Mandatory=$true)][string]$Base,
  [switch]$DesktopShortcut
)
$ErrorActionPreference = 'Stop'
$installBase = [IO.Path]::GetFullPath($Base)
$registryPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\FN.ArtenExplorer'
$programs = [Environment]::GetFolderPath('Programs')
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutName = 'Arten-Explorer.lnk'
$launcher = Join-Path $installBase 'program\Arten-Explorer.exe'
$icon = Join-Path $installBase 'program\arten-explorer.ico'
$shell = New-Object -ComObject WScript.Shell
function Remove-OwnedShortcut([string]$ShortcutPath) {
  if (Test-Path -LiteralPath $ShortcutPath) {
    $shortcut = $shell.CreateShortcut($ShortcutPath)
    if ($shortcut.TargetPath -eq $launcher) { Remove-Item -LiteralPath $ShortcutPath }
  }
}
$shortcutFolders = @($programs) + $(if ($DesktopShortcut) { @($desktop) } else { @() })
if ($Action -ne 'Remove') {
  $existing = $null
  try { $existing = Get-ItemProperty -LiteralPath $registryPath -ErrorAction Stop }
  catch [System.Management.Automation.ItemNotFoundException] {}
  if ($existing -and $existing.InstallLocation -ne $installBase) { throw 'Ein anderer registrierter Arten-Explorer bleibt erhalten; zuerst dessen Einrichtung pruefen.' }
  foreach ($folder in $shortcutFolders) {
    $shortcutPath = Join-Path $folder $shortcutName
    if (Test-Path -LiteralPath $shortcutPath) {
      $existingShortcut = $shell.CreateShortcut($shortcutPath)
      if ($existingShortcut.TargetPath -ne $launcher) { throw "Vorhandene fremde Verknuepfung bleibt erhalten: $shortcutPath" }
    }
  }
  if ($Action -eq 'Preflight') { return }
}
$record = Get-Content -LiteralPath (Join-Path $installBase 'installation.json') -Raw | ConvertFrom-Json
if ($record.productId -ne 'FN.ArtenExplorer' -or $record.base -ne $installBase) { throw 'Installationsnachweis passt nicht zum Ziel.' }
if ($Action -eq 'Install') {
  foreach ($folder in $shortcutFolders) {
    $shortcutPath = Join-Path $folder $shortcutName
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $launcher
    $shortcut.WorkingDirectory = Join-Path $installBase 'workspace'
    $shortcut.IconLocation = "$icon,0"
    $shortcut.Description = 'Arten-Explorer - FN Wildlife & Travel'
    $shortcut.Save()
  }
  [void](New-Item -Path $registryPath -Force)
  $maintenance = Join-Path $installBase 'program\maintain.ps1'
  $powershell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $uninstall = '"' + $powershell + '" -NoProfile -ExecutionPolicy Bypass -File "' + $maintenance + '" -Base "' + $installBase + '"'
  $values = @{ DisplayName='Arten-Explorer'; DisplayVersion=$record.packageId; Publisher='FN Wildlife & Travel';
    InstallLocation=$installBase; DisplayIcon=$icon; UninstallString=$uninstall; NoModify=1; NoRepair=1 }
  foreach ($name in $values.Keys) {
    $valueType = if ($name -in @('NoModify','NoRepair')) { 'DWord' } else { 'String' }
    [void](New-ItemProperty -Path $registryPath -Name $name -Value $values[$name] -PropertyType $valueType -Force)
  }
  $record.nativeRegistration = 'registered-current-user'
  $stateText = $record | ConvertTo-Json -Depth 20
  [IO.File]::WriteAllText((Join-Path $installBase 'installation.json'), $stateText, (New-Object Text.UTF8Encoding($false)))
} else {
  $existing = Get-ItemProperty -LiteralPath $registryPath -ErrorAction SilentlyContinue
  if ($existing -and $existing.InstallLocation -eq $installBase) { Remove-Item -LiteralPath $registryPath }
  Remove-OwnedShortcut (Join-Path $programs $shortcutName)
  Remove-OwnedShortcut (Join-Path $desktop $shortcutName)
}
