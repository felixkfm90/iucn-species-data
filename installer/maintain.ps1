param([Parameter(Mandatory=$true)][string]$Base)
$ErrorActionPreference = 'Stop'
$installBase = [IO.Path]::GetFullPath($Base)
$engine = Join-Path $installBase 'program\install-engine.mjs'
$node = Join-Path $installBase 'workspace\runtime\node\node.exe'
# Read the integration script before the engine removes unchanged program files.
$integration = [scriptblock]::Create((Get-Content -LiteralPath (Join-Path $installBase 'program\windows-integration.ps1') -Raw))
$optionsPath = Join-Path $installBase ('.uninstall-' + [guid]::NewGuid().ToString() + '.json')
try {
  @{ base=$installBase; operation='uninstall'; testMode=$false } | ConvertTo-Json | Set-Content -LiteralPath $optionsPath -Encoding UTF8
  & $node $engine $optionsPath
  if ($LASTEXITCODE -ne 0) { throw 'Deinstallation wurde angehalten; die erhaltenen Dateien bitte pruefen.' }
  & $integration -Action Remove -Base $installBase
  Add-Type -AssemblyName System.Windows.Forms
  [void][Windows.Forms.MessageBox]::Show('Der Arten-Explorer wurde aus dem Startmenue entfernt. Der gesamte Arbeitsordner mit Daten, Einstellungen und Lightroom-Plug-in bleibt fuer eine erneute Einrichtung erhalten.', 'Arten-Explorer')
} finally {
  Remove-Item -LiteralPath $optionsPath -Force -ErrorAction SilentlyContinue
}
