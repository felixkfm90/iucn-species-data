import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
