import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PRODUCT_ID = "FN.ArtenExplorer";
const STATE_FILE = "installation.json";
const HASH = /^[a-f0-9]{64}$/;

export function safeRelative(value) {
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes(":")) throw new Error("Ungültiger Paketpfad.");
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || /[\x00-\x1f<>"|?*]/.test(part)
    || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error("Ungültiger Paketpfad.");
  return value;
}

async function noLinks(filename) {
  for (let current = path.resolve(filename);;) {
    const stat = await fs.lstat(current).catch((error) => { if (error.code !== "ENOENT") throw error; return null; });
    if (stat?.isSymbolicLink()) throw new Error(`Verzeichnisverknüpfungen werden nicht verändert: ${current}`);
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

async function hashFile(filename) {
  const hash = crypto.createHash("sha256");
  const file = await fs.open(filename, "r");
  try { for await (const chunk of file.createReadStream()) hash.update(chunk); }
  finally { await file.close(); }
  return hash.digest("hex");
}

async function existingHash(filename) {
  try { return await hashFile(filename); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function readState(base) {
  let value;
  try { value = JSON.parse(await fs.readFile(path.join(base, STATE_FILE), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw new Error("Installationsnachweis ist beschädigt; vorhandene Dateien bleiben erhalten.", { cause: error }); }
  const sameBase = typeof value?.base === "string" && (process.platform === "win32" ? value.base.toLowerCase() === base.toLowerCase() : value.base === base);
  if (value?.schemaVersion !== 1 || value.productId !== PRODUCT_ID || !sameBase || !Array.isArray(value.files)
    || value.files.some((entry) => !HASH.test(entry.sha256 || "") || !["program", "seed"].includes(entry.kind))) {
    throw new Error("Vorhandener Ordner ist keine gebundene Arten-Explorer-Installation.");
  }
  for (const entry of value.files) safeRelative(entry.path);
  return value;
}

async function assertNotRunning(base) {
  const filename = path.join(base, "app-running.json");
  let record;
  try { record = JSON.parse(await fs.readFile(filename, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return; throw new Error("Der Programmabschluss kann nicht bestätigt werden."); }
  if (!Number.isSafeInteger(record.pid) || record.pid <= 0) throw new Error("Ungültiger Laufnachweis; Programmabschluss zuerst prüfen.");
  try { process.kill(record.pid, 0); }
  catch (error) { if (error.code === "ESRCH") return; throw new Error("Der Programmabschluss kann nicht bestätigt werden."); }
  throw new Error("Bitte den Arten-Explorer vor Installation, Reparatur oder Deinstallation schließen.");
}

export async function readPackage(packageRoot) {
  const root = path.resolve(packageRoot);
  await noLinks(root);
  const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));
  if (manifest.schemaVersion !== 1 || manifest.productId !== PRODUCT_ID || !/^[a-z0-9._-]{1,100}$/i.test(manifest.packageId || "")
    || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error("Ungültiger Paketnachweis.");
  const seen = new Set();
  for (const entry of manifest.files) {
    safeRelative(entry.path);
    const key = entry.path.toLowerCase();
    if (seen.has(key) || !/^(workspace|program)\//.test(entry.path) || !["program", "seed"].includes(entry.kind)
      || !HASH.test(entry.sha256 || "") || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0) throw new Error("Ungültiger oder doppelter Paketpfad.");
    if (/(^|\/)(data|Daten|temp|taxonomy-data|\.env(?:\.[^/]*)?|storage-path\.json|local-settings\.json)(\/|$)/i.test(entry.path)
      || /\.(?:sqlite|db)(?:[-.]|$)/i.test(entry.path)) throw new Error("Private Laufzeitdatei im Installationspaket.");
    seen.add(key);
    const filename = path.join(root, entry.path);
    await noLinks(filename);
    const stat = await fs.stat(filename);
    if (!stat.isFile() || stat.size !== entry.bytes || await hashFile(filename) !== entry.sha256) throw new Error(`Paketdatei beschädigt: ${entry.path}`);
  }
  return manifest;
}

// This engine performs real file operations in both modes. Test mode only omits
// native shell registration, which the setup host performs after a successful run.
export async function installPackage({ packageRoot, base, operation = "install", testMode = false, failAfterWrites = null } = {}) {
  if (!["install", "repair", "uninstall"].includes(operation)) throw new Error("Unbekannte Installationsaktion.");
  if (!path.isAbsolute(base || "")) throw new Error("Installationsziel muss absolut sein.");
  base = path.resolve(base);
  if (base === path.parse(base).root) throw new Error("Ein Laufwerksstamm ist kein Installationsziel.");
  await noLinks(base);
  const state = await readState(base);
  const stateHash = await existingHash(path.join(base, STATE_FILE));
  if (!state) {
    if (operation !== "install") throw new Error("Keine gebundene Installation vorhanden.");
    const names = await fs.readdir(base).catch((error) => { if (error.code !== "ENOENT") throw error; return []; });
    if (names.length) throw new Error("Der Zielordner enthält bereits Dateien. Bitte einen neuen leeren Ordner wählen; vorhandene Bestände werden nicht übernommen.");
  }
  await assertNotRunning(base);
  const manifest = operation === "uninstall" ? null : await readPackage(packageRoot);
  const packageSha256 = manifest ? await hashFile(path.join(path.resolve(packageRoot), "manifest.json")) : state?.packageSha256;
  if (operation === "repair" && (state.packageId !== manifest.packageId || state.packageSha256 !== packageSha256)) throw new Error("Reparatur benötigt genau das installierte Paket; für eine neue Version Aktualisieren wählen.");
  const previous = new Map((state?.files || []).map((entry) => [entry.path.toLowerCase(), entry]));
  const changes = [], preserved = [], retainedObsolete = [];
  if (operation !== "uninstall") {
    for (const entry of manifest.files) {
      const target = path.join(base, entry.path);
      await noLinks(target);
      const currentHash = await existingHash(target), old = previous.get(entry.path.toLowerCase());
      if (state && entry.kind === "seed") { preserved.push(entry.path); continue; }
      if (currentHash === entry.sha256) continue;
      if (currentHash && (!old || old.kind === "seed" || currentHash !== old.sha256)) {
        throw new Error(`Vorhandene Änderung bleibt erhalten: ${entry.path}. Installation wurde vor dem Kopieren gestoppt.`);
      }
      changes.push({ entry, target, source: path.join(path.resolve(packageRoot), entry.path), oldHash: currentHash });
    }
    const nextPaths = new Set(manifest.files.map((entry) => entry.path.toLowerCase()));
    for (const entry of state?.files || []) {
      if (nextPaths.has(entry.path.toLowerCase()) || entry.kind === "seed") continue;
      const target = path.join(base, entry.path);
      await noLinks(target);
      const currentHash = await existingHash(target);
      if (currentHash === entry.sha256) changes.push({ entry, target, source: null, oldHash: currentHash });
      else if (currentHash) { preserved.push(entry.path); retainedObsolete.push(entry); }
    }
  } else {
    // The complete writable repository, its databases, settings, runtimes and
    // plug-in remain available for recovery. Only unchanged setup-owned launchers go.
    for (const entry of state.files) {
      if (!entry.path.startsWith("program/")) { preserved.push(entry.path); continue; }
      const target = path.join(base, entry.path);
      await noLinks(target);
      const currentHash = await existingHash(target);
      if (currentHash === entry.sha256) changes.push({ entry, target, source: null, oldHash: currentHash });
      else if (currentHash) preserved.push(entry.path);
    }
  }
  await fs.mkdir(base, { recursive: true });
  const lockPath = path.join(base, ".installer.lock");
  const lock = await fs.open(lockPath, "wx").catch(() => { throw new Error("Eine weitere Einrichtung läuft oder ihr Abschluss ist ungeklärt."); });
  const transaction = path.join(base, `.installer-transaction-${crypto.randomUUID()}`);
  const journal = [];
  let writes = 0, retainTransaction = false;
  try {
    if (await existingHash(path.join(base, STATE_FILE)) !== stateHash) throw new Error("Installationsstand wurde zwischenzeitlich verändert; bitte erneut prüfen.");
    await assertNotRunning(base);
    await fs.mkdir(transaction);
    for (const change of changes) {
      await noLinks(change.target);
      if (await existingHash(change.target) !== change.oldHash) throw new Error(`Datei wurde während der Vorbereitung verändert: ${change.entry.path}`);
      const staged = path.join(transaction, "new", change.entry.path);
      const backup = path.join(transaction, "old", change.entry.path);
      if (change.source) {
        await fs.mkdir(path.dirname(staged), { recursive: true });
        await fs.copyFile(change.source, staged, fs.constants.COPYFILE_EXCL);
        if (await hashFile(staged) !== change.entry.sha256) throw new Error("Kopierprüfung fehlgeschlagen.");
      }
      await fs.mkdir(path.dirname(change.target), { recursive: true });
      if (change.oldHash) {
        await fs.mkdir(path.dirname(backup), { recursive: true });
        await fs.rename(change.target, backup);
      }
      journal.push({ target: change.target, backup: change.oldHash ? backup : null });
      if (change.source) await fs.rename(staged, change.target);
      writes += 1;
      if (failAfterWrites !== null && writes >= failAfterWrites) throw new Error("Injizierter Kopierabbruch");
    }
    const runtimeFile = path.join(base, "workspace", "installer-runtime.json");
    const runtime = { schemaVersion: 1, productId: PRODUCT_ID, workspaceRoot: path.join(base, "workspace"),
      nodePath: path.join(base, "workspace", "runtime", "node", "node.exe"),
      gitPath: path.join(base, "workspace", "runtime", "git", "cmd", "git.exe"),
      launcherPath: path.join(base, "program", "Arten-Explorer.exe"),
      dataInitialization: "shared-service-required", credentialsIncluded: false };
    if (operation !== "uninstall" && !await existingHash(runtimeFile)) {
      await fs.writeFile(runtimeFile, `${JSON.stringify(runtime, null, 2)}\n`, { flag: "wx" });
      journal.push({ target: runtimeFile, backup: null });
    }
    const next = { schemaVersion: 1, productId: PRODUCT_ID, base, packageId: manifest?.packageId || state.packageId,
      revision: manifest?.revision || state.revision, preview: manifest?.preview ?? state.preview,
      status: operation === "uninstall" ? "uninstalled-data-retained" : "installed",
      nativeRegistration: testMode ? "skipped-test-mode" : "pending-setup-host",
      installedAt: state?.installedAt || new Date().toISOString(), changedAt: new Date().toISOString(),
      files: manifest ? [...manifest.files, ...retainedObsolete] : state.files,
      packageSha256,
      notices: ["Private Projektdaten werden erst mit dem gemeinsamen Dienst verbunden.",
        "Squarespace-, Git- und Dienstanmeldungen sind nicht im Paket enthalten.",
        "Das Lightroom-Plug-in ist bereitgestellt; im Lightroom-Zusatzmodulmanager hinzufügen.",
        "Programmaktualisierung erhält den bisherigen Git-Arbeitsstand; dessen Projektabgleich erfolgt gesondert."] };
    const stateTarget = path.join(base, STATE_FILE), stateBackup = path.join(transaction, "old-state.json");
    if (state) await fs.copyFile(stateTarget, stateBackup);
    journal.push({ target: stateTarget, backup: state ? stateBackup : null });
    await fs.writeFile(stateTarget, `${JSON.stringify(next, null, 2)}\n`);
    return { operation, packageId: next.packageId, status: next.status, writes, preserved, base,
      workspace: path.join(base, "workspace"), testMode, notices: next.notices };
  } catch (error) {
    const rollbackErrors = [];
    for (const entry of journal.reverse()) {
      try {
        await noLinks(entry.target);
        await fs.rm(entry.target, { force: true });
        if (entry.backup) await fs.rename(entry.backup, entry.target);
      } catch (rollbackError) { rollbackErrors.push(rollbackError.message); }
    }
    if (rollbackErrors.length) {
      retainTransaction = true;
      error.message += ` Rücknahme benötigt Prüfung; Sicherungen bleiben in ${transaction}: ${rollbackErrors.join("; ")}`;
      error.retainTransaction = true;
    }
    throw error;
  } finally {
    await lock.close();
    await fs.rm(lockPath, { force: true });
    // Never sweep foreign remnants; this random directory belongs to this run.
    if (!retainTransaction) await fs.rm(transaction, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = JSON.parse((await fs.readFile(process.argv[2], "utf8")).replace(/^\uFEFF/, ""));
    const result = await installPackage(options);
    if (options.resultPath) await fs.writeFile(options.resultPath, `${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
