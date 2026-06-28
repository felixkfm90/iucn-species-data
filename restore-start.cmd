@echo off
setlocal EnableExtensions

cd /d "%~dp0"

echo IUCN Arten-Explorer Restore-Start
echo Projektordner: %CD%
echo.

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden.
  echo Bitte Node.js 18 oder neuer installieren und diese Datei erneut starten.
  pause
  exit /b 1
)

for /f "usebackq tokens=*" %%v in (`node -p "process.versions.node.split('.')[0]"`) do set NODE_MAJOR=%%v
if not defined NODE_MAJOR (
  echo Node.js-Version konnte nicht ermittelt werden.
  pause
  exit /b 1
)

if %NODE_MAJOR% LSS 18 (
  echo Node.js ist zu alt. Gefunden: Version %NODE_MAJOR%
  echo Bitte Node.js 18 oder neuer installieren und diese Datei erneut starten.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo node_modules oder Electron wurden nicht gefunden.
  echo.
  choice /C JN /M "npm install jetzt ausfuehren"
  if errorlevel 2 (
    echo Abgebrochen. Die App wurde nicht gestartet.
    pause
    exit /b 1
  )
  call npm.cmd install
  if errorlevel 1 (
    echo npm install ist fehlgeschlagen.
    pause
    exit /b 1
  )
)

call npm.cmd run species:desktop:shortcut
if errorlevel 1 (
  echo Desktop-Verknuepfung konnte nicht erstellt werden.
  pause
  exit /b 1
)

echo.
echo Desktop-Verknuepfung wurde erstellt. App wird gestartet...
start "" wscript.exe "%CD%\species-explorer\desktop\start-explorer.vbs"
exit /b 0
