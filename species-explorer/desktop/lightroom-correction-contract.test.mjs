import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Desktop-Verknüpfung verwendet den Installationsordner statt eines festen Programmnamens", async () => {
  const installer = await readFile(new URL("./install-shortcut.ps1", import.meta.url), "utf8");
  assert.match(installer, /\$scriptDir = Split-Path -Parent \$MyInvocation\.MyCommand\.Path/);
  assert.match(installer, /\$repoRoot = \(Resolve-Path \(Join-Path \$scriptDir "\.\.\\\.\."\)\)\.Path/);
  assert.match(installer, /\$shortcut\.Arguments = .*\$launcher/);
  assert.match(installer, /\$shortcut\.WorkingDirectory = \$repoRoot/);
  assert.match(installer, /\$appIcon = Join-Path \$scriptDir "assets\\arten-explorer-transparent\.ico"/);
  assert.match(installer, /Test-Path -LiteralPath \$appIcon -PathType Leaf/);
  assert.match(installer, /\$shortcut\.IconLocation = "\$appIcon,0"/);
  assert.doesNotMatch(installer, /[A-Z]:\\(?:IUCN_Datenbank|Arten-Explorer)\b/i);
});

test("Desktopfenster und Verknüpfung verwenden das eigene vollständige Mehrgrößensymbol", async () => {
  const [main, bytes] = await Promise.all([
    readFile(new URL("./main.mjs", import.meta.url), "utf8"),
    readFile(new URL("./assets/arten-explorer-transparent.ico", import.meta.url)),
  ]);
  assert.match(main, /process\.platform === "win32" \? "\.\/assets\/arten-explorer-transparent\.ico" : "\.\/assets\/arten-explorer\.png"/);
  assert.match(main, /new BrowserWindow\(\{[\s\S]*?icon: WINDOW_ICON/);
  assert.equal(bytes.readUInt16LE(0), 0);
  assert.equal(bytes.readUInt16LE(2), 1);
  assert.equal(bytes.readUInt16LE(4), 7);
  const sizes = [];
  for (let index = 0; index < 7; index += 1) {
    const entry = 6 + index * 16;
    const width = bytes[entry] || 256;
    const height = bytes[entry + 1] || 256;
    const length = bytes.readUInt32LE(entry + 8);
    const offset = bytes.readUInt32LE(entry + 12);
    assert.equal(width, height);
    assert.equal(bytes[entry + 3], 0);
    assert.equal(bytes.readUInt16LE(entry + 6), 32);
    assert.ok(offset >= 118 && offset + length <= bytes.length);
    assert.deepEqual(bytes.subarray(offset, offset + 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(bytes.readUInt32BE(offset + 16), width);
    assert.equal(bytes.readUInt32BE(offset + 20), height);
    sizes.push(width);
  }
  assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256]);
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
