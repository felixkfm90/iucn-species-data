import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  assertNoTempLinks, cleanupOrphanTempSessions, cleanupOwnedPluginTempSession, createManagedTempSession,
  readOwnedPluginTempSession, writeOwnedPluginTempSession,
} from "./temp-session.mjs";

const execFileAsync = promisify(execFile);

export async function detectLightroomOwnerPid({ parentPid = process.ppid, platform = process.platform,
  execute = execFileAsync } = {}) {
  if (platform !== "win32" || !Number.isSafeInteger(parentPid) || parentPid <= 0) return null;
  // Query only the launching process chain. Missing permission/tool/provider is
  // an unknown owner, never permission to treat a live SDK session as orphaned.
  try {
    const command = `$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${parentPid}';`
      + "for($i=0;$i -lt 6 -and $p.Name -ieq 'cmd.exe';$i++){$p=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$p.ParentProcessId)};"
      + "if($p.Name -ieq 'Lightroom.exe'){[Console]::Write($p.ProcessId)}";
    const { stdout } = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command],
      { timeout: 2500, maxBuffer: 4096, windowsHide: true });
    const pid = /^\d+$/.test(String(stdout).trim()) ? Number(String(stdout).trim()) : null;
    return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
  } catch { return null; }
}

function checkArtifactPath(directory, manifest, value) {
  const absolute = path.resolve(value);
  const relative = path.relative(directory, absolute);
  const artifact = manifest.artifacts.find((entry) => entry.relative === relative && !entry.durable);
  if (!artifact || path.dirname(absolute) !== directory) throw new Error("Helferanfrage liegt nicht in der eigenen Temp-Sitzung.");
  return absolute;
}

export async function runPluginTempHelper({ command, pluginRoot, sessionId, capability, helperPath,
  requestPath, responsePath, searchRoot, ownerSession, ownerCapability, detectOwner = detectLightroomOwnerPid } = {}) {
  if (!pluginRoot || !path.isAbsolute(pluginRoot)) throw new Error("Absoluter Plug-in-Pfad erforderlich.");
  await assertNoTempLinks(pluginRoot);
  const options = { pluginRoot, sessionId, capability };
  if (command === "create" || command === "create-owner") {
    let pid;
    if (command === "create" && ownerSession) {
      const anchor = await readOwnedPluginTempSession({ pluginRoot, sessionId: ownerSession, capability: ownerCapability });
      if (anchor.manifest.role !== "plugin-owner" || anchor.manifest.state !== "open" || anchor.manifest.operations !== 0) {
        throw new Error("Plug-in-Sitzungseigentümer nicht mehr aktiv.");
      }
      pid = anchor.manifest.pid;
    } else pid = await detectOwner();
    const session = await createManagedTempSession({ repoRoot: pluginRoot, owner: "plugin", pid, sessionId, capability,
      helperPids: [process.pid] });
    const { manifest } = await readOwnedPluginTempSession(options);
    if (command === "create-owner") manifest.role = "plugin-owner";
    manifest.helperPids = [];
    await writeOwnedPluginTempSession(session.root, manifest);
    return { root: session.root };
  }
  if (command === "orphans") return cleanupOrphanTempSessions({ repoRoot: pluginRoot, owner: "plugin" });
  if (command === "cleanup") return cleanupOwnedPluginTempSession(options);
  if (command !== "run") throw new Error("Unbekannter Plug-in-Tempbefehl.");
  const { directory, manifest } = await readOwnedPluginTempSession(options);
  if (manifest.state !== "open" || manifest.operations !== 1) throw new Error("Keine laufende Plug-in-Tempoperation.");
  const request = checkArtifactPath(directory, manifest, requestPath);
  const response = checkArtifactPath(directory, manifest, responsePath);
  await assertNoTempLinks(directory, request);
  await assertNoTempLinks(directory, response);
  if (!helperPath || !path.isAbsolute(helperPath)) throw new Error("Absoluter Hilfsprogrammpfad erforderlich.");
  manifest.helperPids = [process.pid];
  await writeOwnedPluginTempSession(directory, manifest);
  let child;
  let completed;
  let registrationError = null;
  try {
    child = spawn(process.execPath, ["--no-warnings", helperPath, `--request=${request}`, `--response=${response}`,
      `--search-root=${searchRoot}`], { stdio: "inherit", windowsHide: true,
      env: { ...process.env, TMP: directory, TEMP: directory, TMPDIR: directory } });
    completed = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    if (child.pid) {
      manifest.helperPids.push(child.pid);
      try { await writeOwnedPluginTempSession(directory, manifest); }
      catch (error) { registrationError = error; }
    }
    const result = await completed;
    if (registrationError) throw registrationError;
    if (result.code !== 0) throw new Error(`Plug-in-Helfer fehlgeschlagen (${result.code ?? result.signal}).`);
    return result;
  } finally {
    // The wrapper remains listed until its child has genuinely finished. Never
    // remove a lease early or kill a writing helper to make cleanup look done.
    if (completed) await completed.catch(() => {});
    manifest.helperPids = [];
    await writeOwnedPluginTempSession(directory, manifest);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argument = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
  try {
    const result = await runPluginTempHelper({ command: argument("command"), pluginRoot: argument("plugin-root"),
      sessionId: argument("session-id"), capability: argument("capability"), helperPath: argument("helper"),
      requestPath: argument("request"), responsePath: argument("response"), searchRoot: argument("search-root"),
      ownerSession: argument("owner-session"), ownerCapability: argument("owner-capability") });
    if (result.errors?.length) { console.error(JSON.stringify(result.errors)); process.exitCode = 1; }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
