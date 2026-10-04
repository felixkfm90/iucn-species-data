import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Desktop-Verknüpfung verwendet den Installationsordner statt eines festen Programmnamens", async () => {
  const installer = await readFile(new URL("./install-shortcut.ps1", import.meta.url), "utf8");
  assert.match(installer, /\$scriptDir = Split-Path -Parent \$MyInvocation\.MyCommand\.Path/);
  assert.match(installer, /\$repoRoot = \(Resolve-Path \(Join-Path \$scriptDir "\.\.\\\.\."\)\)\.Path/);
  assert.match(installer, /\$shortcut\.Arguments = .*\$launcher/);
  assert.match(installer, /\$shortcut\.WorkingDirectory = \$repoRoot/);
  assert.match(installer, /\$shortcut\.IconLocation = "\$electronExe,0"/);
  assert.doesNotMatch(installer, /[A-Z]:\\(?:IUCN_Datenbank|Arten-Explorer)\b/i);
});

test("Desktop-Start bleibt nach gemeinsamem Umbenennen des Programmordners relativ auflösbar", async () => {
  const [launcher, restore] = await Promise.all([
    readFile(new URL("./start-explorer.vbs", import.meta.url), "utf8"),
    readFile(new URL("../../restore-start.cmd", import.meta.url), "utf8"),
  ]);
  assert.match(launcher, /scriptDir = fso\.GetParentFolderName\(WScript\.ScriptFullName\)/);
  assert.match(launcher, /repoRoot = fso\.GetParentFolderName\(fso\.GetParentFolderName\(scriptDir\)\)/);
  assert.match(launcher, /shell\.CurrentDirectory = repoRoot/);
  assert.match(restore, /cd \/d "%~dp0"/);
  assert.doesNotMatch(`${launcher}\n${restore}`, /[A-Z]:\\(?:IUCN_Datenbank|Arten-Explorer)\b/i);
});

test("Desktop-Hülle übergibt nur validierte Lightroom-Korrekturanfragen an eine isolierte Preload-Brücke", async () => {
  const [main, preload, launcher] = await Promise.all([
    readFile(new URL("./main.mjs", import.meta.url), "utf8"),
    readFile(new URL("./preload.cjs", import.meta.url), "utf8"),
    readFile(new URL("./start-explorer.vbs", import.meta.url), "utf8"),
  ]);
  assert.match(main, /consumeLightroomCorrectionHandoff/);
  assert.match(main, /parseLightroomCorrectionRequestIds/);
  assert.match(main, /preload: fileURLToPath/);
  assert.match(main, /webContents\.send\("taxonomy-correction-request"/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\("speciesExplorerDesktop"/);
  assert.match(preload, /onTaxonomyCorrectionRequest/);
  assert.doesNotMatch(preload, /ipcRenderer\.invoke|sendSync|executeJavaScript/);
  assert.match(launcher, /--taxonomy-correction-request=/);
  assert.match(launcher, /\[0-9a-fA-F\]\{8\}/);
});
