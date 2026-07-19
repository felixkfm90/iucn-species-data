import assert from "node:assert/strict";
import test from "node:test";
import { childProcessEnvironment } from "./child-process-environment.mjs";

test("Node-Unterprozesse verwenden im Electron-Kontext den Node-Modus", () => {
  const sourceEnv = { IUCN_TOKEN: "test" };
  const result = childProcessEnvironment("C:\\App\\electron.exe", {
    env: sourceEnv,
    execPath: "C:\\App\\electron.exe",
    electronVersion: "42.7.0",
  });

  assert.notEqual(result, sourceEnv);
  assert.equal(result.IUCN_TOKEN, "test");
  assert.equal(result.ELECTRON_RUN_AS_NODE, "1");
});

test("Andere Programme erhalten im Electron-Kontext unveraendert die Umgebung", () => {
  const sourceEnv = { PATH: "test" };
  const result = childProcessEnvironment("git", {
    env: sourceEnv,
    execPath: "C:\\App\\electron.exe",
    electronVersion: "42.7.0",
  });

  assert.equal(result, sourceEnv);
  assert.equal(result.ELECTRON_RUN_AS_NODE, undefined);
});

test("Ein normaler Node-Prozess benoetigt keinen Electron-Node-Modus", () => {
  const sourceEnv = { PATH: "test" };
  const result = childProcessEnvironment("C:\\Node\\node.exe", {
    env: sourceEnv,
    execPath: "C:\\Node\\node.exe",
    electronVersion: "",
  });

  assert.equal(result, sourceEnv);
  assert.equal(result.ELECTRON_RUN_AS_NODE, undefined);
});
