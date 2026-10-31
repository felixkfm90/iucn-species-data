import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { EventEmitter } from "node:events";
import path from "node:path";
import test from "node:test";
import { tmpdir, assertTestTempPath } from "../../scripts/test-temp.mjs";
import { launchInstalledExplorer, resolveInstalledLauncher } from "./installed-launcher.mjs";

async function fixture(t, { redirectedProgram = false } = {}) {
  const base = await mkdtemp(path.join(tmpdir(), "installed-launch-"));
  t.after(() => rm(assertTestTempPath(base), { recursive: true, force: true }));
  const workspace = path.join(base, "workspace"), launcher = path.join(base, "program", "Arten-Explorer.exe");
  await mkdir(workspace);
  if (redirectedProgram) {
    const linked = path.join(base, "other");
    await mkdir(linked); await writeFile(path.join(linked, "Arten-Explorer.exe"), "synthetic executable");
    await symlink(linked, path.join(base, "program"), process.platform === "win32" ? "junction" : "dir");
  } else { await mkdir(path.dirname(launcher)); await writeFile(launcher, "synthetic executable"); }
  const marker = { schemaVersion: 1, productId: "FN.ArtenExplorer", workspaceRoot: workspace,
    launcherPath: launcher, nodePath: path.join(workspace, "runtime", "node", "node.exe"),
    gitPath: path.join(workspace, "runtime", "git", "cmd", "git.exe") };
  const state = { schemaVersion: 1, productId: "FN.ArtenExplorer", base, status: "installed" };
  await writeFile(path.join(workspace, "installer-runtime.json"), JSON.stringify(marker));
  await writeFile(path.join(base, "installation.json"), JSON.stringify(state));
  return { base, workspace, marker, state, launcher };
}

test("installierter Lightroom-Rückweg startet ausschließlich den gebundenen nativen Starter ohne Shell", async (t) => {
  const f = await fixture(t), args = ["--taxonomy-correction-request=11111111-1111-4111-8111-111111111111"];
  let calls = 0;
  await launchInstalledExplorer(f.workspace, args, { spawnImpl(exe, passed, options) {
    calls++; assert.equal(exe, f.launcher); assert.deepEqual(passed, args);
    assert.equal(options.shell, false); assert.equal(options.cwd, f.workspace); assert.equal(options.windowsHide, true);
    const child = new EventEmitter(); child.unref = () => {};
    queueMicrotask(() => child.emit("spawn")); return child;
  } });
  assert.equal(calls, 1);
});

test("Startanfrage weist fremde Befehle, geänderte Pfadbindung und deinstallierte Starter zurück", async (t) => {
  const f = await fixture(t);
  for (const args of [["--other=x"], ["--taxonomy-correction-request=bad"], ["x", "y"]]) {
    await assert.rejects(resolveInstalledLauncher(f.workspace, args));
  }
  f.marker.launcherPath = process.execPath;
  await writeFile(path.join(f.workspace, "installer-runtime.json"), JSON.stringify(f.marker));
  await assert.rejects(resolveInstalledLauncher(f.workspace), /Pfadbindung/);
  f.marker.launcherPath = f.launcher; f.state.status = "uninstalled-data-retained";
  await writeFile(path.join(f.workspace, "installer-runtime.json"), JSON.stringify(f.marker));
  await writeFile(path.join(f.base, "installation.json"), JSON.stringify(f.state));
  await assert.rejects(resolveInstalledLauncher(f.workspace), /unvollständig/);
});

test("Startanfrage folgt keiner Verzeichnisverknüpfung", async (t) => {
  let f;
  try { f = await fixture(t, { redirectedProgram: true }); }
  catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.skip("Dieser Testprozess darf keine native Verzeichnisverknüpfung anlegen."); return;
    }
    throw error;
  }
  await assert.rejects(resolveInstalledLauncher(f.workspace), /verknüpft/);
});
