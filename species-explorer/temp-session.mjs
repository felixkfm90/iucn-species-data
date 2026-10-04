import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rmdir, unlink } from "node:fs/promises";
import path from "node:path";

const SESSION_FILE = ".fn-temp-session.json";
const OWNER = "fn-wildlife-temp";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNERS = new Set(["explorer", "tests", "plugin"]);

function childPath(root, relative) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative)
      || relative.split(/[\\/]/).some((part) => !part || part === "." || part === "..")
      || /[:\0]/.test(relative)) throw new Error("Ungültiger eigener Temp-Pfad.");
  const target = path.resolve(root, relative);
  const resolvedRelative = path.relative(root, target);
  if (!resolvedRelative || resolvedRelative.startsWith("..") || path.isAbsolute(resolvedRelative)) {
    throw new Error("Temp-Pfad verlässt die eigene Sitzung.");
  }
  return target;
}

export async function assertNoTempLinks(root, target = root) {
  const absoluteRoot = path.resolve(root);
  const absoluteTarget = path.resolve(target);
  const relative = path.relative(absoluteRoot, absoluteTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Temp-Pfad außerhalb der Grenze.");
  // Include the root and its ancestors: a linked temp directory must not make
  // an otherwise harmless child-path check authorize writes/deletes elsewhere.
  const parts = [];
  let cursor = absoluteTarget;
  while (true) {
    parts.push(cursor);
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  for (const entry of parts.reverse()) {
    const attributes = await lstat(entry).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (attributes?.isSymbolicLink()) throw new Error(`Verzeichnis-/Dateilink im Temp-Pfad: ${entry}`);
  }
  const resolved = await realpath(absoluteRoot).catch((error) => {
    if (error.code === "ENOENT") return absoluteRoot;
    throw error;
  });
  if (path.resolve(resolved).toLowerCase() !== absoluteRoot.toLowerCase()) throw new Error("Umgeleiteter Temp-Stamm.");
}

export function tempProcessIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return true;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== "ESRCH"; }
}

async function persist(directory, manifest, { initial = false } = {}) {
  await assertNoTempLinks(directory);
  const file = path.join(directory, SESSION_FILE);
  const temporary = `${file}.${randomUUID()}.tmp`;
  await assertNoTempLinks(directory, file);
  if (initial) {
    const handle = await open(file, "wx");
    try { await handle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`); }
    finally { await handle.close(); }
    return;
  }
  const handle = await open(temporary, "wx");
  try { await handle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`); }
  finally { await handle.close(); }
  try { await rename(temporary, file); }
  finally { await unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; }); }
}

function validManifest(manifest, directory, owner) {
  return manifest?.schemaVersion === 1 && manifest?.ownership === OWNER
    && manifest.owner === owner && UUID.test(manifest.sessionId || "")
    && path.basename(directory) === manifest.sessionId
    && ((Number.isSafeInteger(manifest.pid) && manifest.pid > 0) || (owner === "plugin" && manifest.pid === null))
    && Array.isArray(manifest.artifacts) && Array.isArray(manifest.helperPids)
    && manifest.helperPids.every((pid) => Number.isSafeInteger(pid) && pid > 0)
    && manifest.artifacts.every((entry) => typeof entry?.relative === "string" && entry.type === "file"
      && typeof entry.durable === "boolean")
    && Number.isSafeInteger(manifest.operations) && manifest.operations >= 0
    && new Set(["open", "closing", "closed"]).has(manifest.state);
}

async function cleanupSession(directory, manifest, { dryRun = false } = {}) {
  const report = { path: directory, removed: [], kept: [], errors: [] };
  try { await assertNoTempLinks(directory); }
  catch (error) { report.errors.push(error.message); return report; }
  for (const artifact of manifest.artifacts) {
    let file;
    try {
      file = childPath(directory, artifact.relative);
      if (artifact.durable) { report.kept.push({ path: file, reason: "dauerhaft geschützt" }); continue; }
      await assertNoTempLinks(directory, file);
      const attributes = await lstat(file).catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (!attributes) continue;
      if (!attributes.isFile()) { report.kept.push({ path: file, reason: "kein registriertes reguläres Tempfile" }); continue; }
      if (!dryRun) await unlink(file);
      report.removed.push(file);
    } catch (error) { report.errors.push(error.message); }
  }
  // Never recursively remove a session tree. Unknown files, nested folders and
  // durable review references keep both their content and ownership evidence.
  const entries = await readdir(directory).catch((error) => { report.errors.push(error.message); return []; });
  for (const entry of entries) {
    if (entry !== SESSION_FILE) report.kept.push({ path: path.join(directory, entry), reason: "Sitzungsrest oder unbekannter Inhalt" });
  }
  if (!dryRun && report.errors.length === 0 && report.kept.length === 0) {
    await unlink(path.join(directory, SESSION_FILE));
    await rmdir(directory).catch((error) => { report.errors.push(error.message); });
  }
  return report;
}

export async function cleanupOrphanTempSessions({
  repoRoot = process.cwd(), owner = "explorer", isProcessAlive = tempProcessIsAlive, dryRun = false,
} = {}) {
  if (!OWNERS.has(owner)) throw new Error("Unbekannter Temp-Eigentümer.");
  const root = path.resolve(repoRoot, "temp", owner);
  const result = { removed: [], kept: [], errors: [] };
  try { await assertNoTempLinks(root); }
  catch (error) { result.errors.push({ path: root, error: error.message }); return result; }
  const entries = await readdir(root, { withFileTypes: true }).catch((error) => {
    if (error.code !== "ENOENT") result.errors.push({ path: root, error: error.message });
    return [];
  });
  for (const entry of entries) {
    const directory = path.join(root, entry.name);
    if (!entry.isDirectory() || !UUID.test(entry.name)) {
      result.kept.push({ path: directory, reason: "nicht verwaltet" }); continue;
    }
    try {
      await assertNoTempLinks(root, directory);
      const file = path.join(directory, SESSION_FILE);
      await assertNoTempLinks(root, file);
      const manifest = JSON.parse(await readFile(file, "utf8"));
      if (!validManifest(manifest, directory, owner)) { result.kept.push({ path: directory, reason: "kein gültiger Eigentumsnachweis" }); continue; }
      // A reused live PID conservatively keeps an orphan too. Permission errors
      // and unknown process state never count as proof that an owner stopped.
      const finishedPlugin = owner === "plugin" && manifest.state === "closed" && manifest.operations === 0;
      if ((!finishedPlugin && await isProcessAlive(manifest.pid))
          || (await Promise.all(manifest.helperPids.map(isProcessAlive))).some(Boolean)) {
        result.kept.push({ path: directory, reason: "Eigentümer oder Helfer noch aktiv" }); continue;
      }
      const report = await cleanupSession(directory, manifest, { dryRun });
      result.removed.push(...report.removed);
      result.kept.push(...report.kept);
      result.errors.push(...report.errors.map((error) => ({ path: directory, error })));
    } catch (error) { result.kept.push({ path: directory, reason: "Eigentum nicht sicher prüfbar", error: error.message }); }
  }
  return result;
}

export async function createManagedTempSession({
  repoRoot = process.cwd(), owner = "explorer", pid = process.pid, sessionId = randomUUID(), capability = null, helperPids = [],
} = {}) {
  if (!OWNERS.has(owner) || (!Number.isSafeInteger(pid) || pid <= 0) && !(owner === "plugin" && pid === null)
      || !UUID.test(sessionId) || (capability !== null && !UUID.test(capability))
      || !Array.isArray(helperPids) || helperPids.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    throw new Error("Ungültiger Temp-Eigentümer.");
  }
  const root = path.resolve(repoRoot, "temp", owner);
  await assertNoTempLinks(root);
  await mkdir(root, { recursive: true });
  await assertNoTempLinks(root);
  const directory = path.join(root, sessionId);
  await mkdir(directory); // Never reuse an existing session, even after a crash.
  const manifest = { schemaVersion: 1, ownership: OWNER, owner, sessionId, pid, createdAt: new Date().toISOString(),
    state: "open", operations: 0, helperPids: [...new Set(helperPids)], artifacts: [], ...(capability ? { capability } : {}) };
  await persist(directory, manifest, { initial: true });
  let writes = Promise.resolve();
  const save = () => {
    writes = writes.then(() => persist(directory, manifest));
    return writes;
  };
  let closedResult = null;
  let finishInProgress = null;
  const finish = async () => {
    if (manifest.state === "open" || manifest.operations > 0 || manifest.helperPids.some(tempProcessIsAlive)) {
      return { pending: true, path: directory, removed: [], kept: [], errors: [] };
    }
    if (closedResult) return closedResult;
    if (!finishInProgress) finishInProgress = (async () => {
      manifest.state = "closed";
      await save();
      closedResult = await cleanupSession(directory, manifest);
      return closedResult;
    })();
    return finishInProgress;
  };
  return {
    root: directory,
    sessionId,
    async filePath(relative, { durable = false } = {}) {
      if (manifest.state !== "open") throw new Error("Temp-Sitzung wird bereits geschlossen.");
      const file = childPath(directory, relative);
      if (path.dirname(file) !== directory) throw new Error("Temp-Artefakte müssen unmittelbar in der eigenen Sitzung liegen.");
      if (relative === SESSION_FILE || relative.startsWith(`${SESSION_FILE}.`)) throw new Error("Reservierter Eigentumsnachweis.");
      await assertNoTempLinks(directory, file);
      const existing = manifest.artifacts.find((entry) => entry.relative === relative);
      if (existing) { if (durable) existing.durable = true; }
      else {
        const attributes = await lstat(file).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
        if (attributes) throw new Error("Vorhandene fremde Tempdatei wird nicht übernommen.");
        manifest.artifacts.push({ relative, type: "file", durable });
      }
      await save();
      return file;
    },
    async protect(relative) {
      const entry = manifest.artifacts.find((artifact) => artifact.relative === relative);
      if (!entry) throw new Error("Unbekanntes Temp-Artefakt.");
      entry.durable = true;
      await save();
    },
    async beginOperation() {
      if (manifest.state !== "open") throw new Error("Keine neue Operation während Temp-Schließung.");
      manifest.operations += 1;
      await save();
      let released = false;
      return async () => {
        if (released) return closedResult;
        released = true;
        manifest.operations -= 1;
        await save();
        return finish();
      };
    },
    async registerHelper(helperPid) {
      if (manifest.state !== "open" || !Number.isSafeInteger(helperPid) || helperPid <= 0) throw new Error("Ungültiger Temp-Helfer.");
      if (!manifest.helperPids.includes(helperPid)) manifest.helperPids.push(helperPid);
      await save();
      let released = false;
      return async () => {
        if (released) return closedResult;
        if (tempProcessIsAlive(helperPid)) throw new Error("Temp-Helfer läuft noch; Freigabe erst nach exit/close.");
        released = true;
        manifest.helperPids = manifest.helperPids.filter((value) => value !== helperPid);
        await save();
        return finish();
      };
    },
    async close() {
      if (closedResult) return closedResult;
      if (manifest.state === "open") {
        manifest.state = "closing";
        await save();
      }
      return finish();
    },
  };
}

// The SDK cannot inspect Windows junctions or process ownership itself. Its
// one-shot cleanup helper uses this narrow, capability-bound entry point.
export async function readOwnedPluginTempSession({ pluginRoot, sessionId, capability }) {
  if (!UUID.test(sessionId || "") || !UUID.test(capability || "")) throw new Error("Ungültige Plug-in-Tempkennung.");
  const directory = path.resolve(pluginRoot, "temp", "plugin", sessionId);
  await assertNoTempLinks(directory);
  const file = path.join(directory, SESSION_FILE);
  await assertNoTempLinks(directory, file);
  const manifest = JSON.parse(await readFile(file, "utf8"));
  if (!validManifest(manifest, directory, "plugin") || manifest.capability !== capability) {
    throw new Error("Plug-in-Temp-Eigentum nicht bestätigt.");
  }
  for (const artifact of manifest.artifacts) childPath(directory, artifact.relative);
  return { directory, manifest };
}

export async function writeOwnedPluginTempSession(directory, manifest) {
  if (!validManifest(manifest, directory, "plugin") || !UUID.test(manifest.capability || "")) {
    throw new Error("Ungültiger Plug-in-Tempnachweis.");
  }
  for (const artifact of manifest.artifacts) childPath(directory, artifact.relative);
  await persist(directory, manifest);
}

export async function cleanupOwnedPluginTempSession(options) {
  const { directory, manifest } = await readOwnedPluginTempSession(options);
  if (manifest.state !== "closed" || manifest.operations !== 0 || manifest.helperPids.some(tempProcessIsAlive)) {
    throw new Error("Plug-in-Tempsitzung besitzt noch aktive Operationen oder Helfer.");
  }
  return cleanupSession(directory, manifest);
}
