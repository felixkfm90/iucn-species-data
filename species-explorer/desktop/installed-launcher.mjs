import { lstat, readFile, appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const REQUEST = /^--taxonomy-correction-request=[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const samePath = (left, right) => typeof left === "string" && path.isAbsolute(left)
  && (process.platform === "win32"
    ? path.normalize(left).toLowerCase() === path.normalize(right).toLowerCase()
    : path.normalize(left) === path.normalize(right));

async function plainPath(filename, directory = false) {
  const absolute = path.resolve(filename);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || (current !== absolute && !stat.isDirectory())) {
      throw new Error("Die Installation enthält einen verknüpften oder ungültigen Pfad.");
    }
    if (current === absolute && (directory ? !stat.isDirectory() : !stat.isFile())) {
      throw new Error("Eine benötigte Installationsdatei fehlt.");
    }
  }
}

// Only the installer's fixed sibling launcher may be used. A marker is never
// an arbitrary command, and Lightroom arguments never pass through a shell.
export async function resolveInstalledLauncher(workspaceRoot, args = []) {
  if (!path.isAbsolute(workspaceRoot) || args.length > 1 || args.some((arg) => !REQUEST.test(arg))) {
    throw new Error("Die Lightroom-Startanfrage ist ungültig.");
  }
  const workspace = path.resolve(workspaceRoot);
  const base = path.dirname(workspace);
  if (path.basename(workspace).toLowerCase() !== "workspace") throw new Error("Der Installationsordner ist ungültig.");
  await plainPath(workspace, true);
  const markerPath = path.join(workspace, "installer-runtime.json");
  const statePath = path.join(base, "installation.json");
  for (const file of [markerPath, statePath]) {
    await plainPath(file);
    if ((await lstat(file)).size > 2_000_000) throw new Error("Der Installationsnachweis ist zu groß.");
  }
  const marker = JSON.parse(await readFile(markerPath, "utf8"));
  const state = JSON.parse(await readFile(statePath, "utf8"));
  const launcher = path.join(base, "program", "Arten-Explorer.exe");
  if (marker.schemaVersion !== 1 || marker.productId !== "FN.ArtenExplorer"
    || state.schemaVersion !== 1 || state.productId !== "FN.ArtenExplorer" || state.status !== "installed"
    || !samePath(state.base, base) || !samePath(marker.workspaceRoot, workspace)
    || !samePath(marker.launcherPath, launcher)
    || !samePath(marker.nodePath, path.join(workspace, "runtime", "node", "node.exe"))
    || !samePath(marker.gitPath, path.join(workspace, "runtime", "git", "cmd", "git.exe"))) {
    throw new Error("Die Installation ist unvollständig oder ihre Pfadbindung stimmt nicht mehr.");
  }
  await plainPath(launcher);
  return { launcher, args: [...args], cwd: workspace };
}

export async function launchInstalledExplorer(workspaceRoot, args = [], { spawnImpl = spawn } = {}) {
  const command = await resolveInstalledLauncher(workspaceRoot, args);
  await new Promise((resolve, reject) => {
    const child = spawnImpl(command.launcher, command.args, {
      cwd: command.cwd, detached: true, stdio: "ignore", windowsHide: true, shell: false,
    });
    child.once("error", () => reject(new Error("Der installierte Arten-Explorer konnte nicht gestartet werden.")));
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
  try { await launchInstalledExplorer(workspaceRoot, process.argv.slice(2)); }
  catch {
    const directory = path.join(workspaceRoot, "species-explorer", "logs");
    await mkdir(directory, { recursive: true }).catch(() => {});
    await appendFile(path.join(directory, "desktop-launch.log"),
      `${new Date().toISOString()} Installierter Lightroom-Start fehlgeschlagen; Installation und Pfadbindung prüfen.\n`).catch(() => {});
    process.exitCode = 1;
  }
}
