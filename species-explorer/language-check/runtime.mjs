import fs from "node:fs/promises";
import { createReadStream, readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { explorerStoragePaths } from "../storage-paths.mjs";
import { LanguageCheckError, requireValue } from "./errors.mjs";

export const LANGUAGE_RUNTIME_LOCK = JSON.parse(readFileSync(new URL("./runtime-lock.json", import.meta.url), "utf8"));
export const LANGUAGE_LAUNCHER_LOCK = JSON.parse(readFileSync(new URL("./launcher-lock.json", import.meta.url), "utf8"));
const LANGUAGE_RUNTIME_DIRECTORY = `LanguageTool-${LANGUAGE_RUNTIME_LOCK.version}`;
const HERE = fileURLToPath(new URL("./", import.meta.url));
const unavailable = (code = "LANGUAGE_CHECK_NOT_INSTALLED") => new LanguageCheckError(code,
  code === "LANGUAGE_CHECK_JAVA_MISSING" ? "Für die lokale Sprachprüfung fehlt eine eingerichtete Java-Laufzeit ab Version 17."
    : "Die lokale deutsche Sprachprüfung ist noch nicht vollständig eingerichtet.");
export async function noLanguageLinks(filename) {
  requireValue(typeof filename === "string" && path.isAbsolute(filename) && !/^(?:[\\/]{2}|file:)/i.test(filename)
    && !/[\x00-\x1f]/.test(filename), "LANGUAGE_CHECK_UNSAFE_RUNTIME", "Die Sprachprüfung benötigt eine sichere lokale Laufzeit.");
  for (let current = path.resolve(filename);;) {
    const stat = await fs.lstat(current).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    requireValue(!stat?.isSymbolicLink(), "LANGUAGE_CHECK_UNSAFE_RUNTIME", "Verknüpfte Sprachprüfdateien werden nicht ausgeführt.");
    const parent = path.dirname(current); if (parent === current) return; current = parent;
  }
}
const sameFile = (a, b) => a.size === b.size && a.ino === b.ino && a.dev === b.dev && a.mtimeMs === b.mtimeMs;
async function fileHash(filename, signal) {
  signal?.throwIfAborted(); const before = await fs.lstat(filename), hash = createHash("sha256");
  requireValue(before.isFile() && !before.isSymbolicLink() && before.nlink === 1 && before.size <= 100 * 1024 * 1024,
    "LANGUAGE_CHECK_RUNTIME_CHANGED", "Die lokale Sprachprüflaufzeit ist verändert oder unvollständig.");
  for await (const chunk of createReadStream(filename, { signal })) hash.update(chunk);
  requireValue(sameFile(before, await fs.lstat(filename)), "LANGUAGE_CHECK_RUNTIME_CHANGED", "Die Sprachprüflaufzeit wurde während der Prüfung geändert.");
  return { bytes: before.size, sha256: hash.digest("hex") };
}

/** Full ordered package identity, including dictionaries, licenses and empty directories. */
export async function languageRuntimeTree(root, { signal } = {}) {
  await noLanguageLinks(root); const manifest = createHash("sha256"); let entries = 0, bytes = 0, files = 0;
  async function walk(directory, prefix = "") {
    const values = await fs.readdir(directory, { withFileTypes: true }); values.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const value of values) {
      signal?.throwIfAborted(); requireValue(++entries <= 4096 && !value.isSymbolicLink(), "LANGUAGE_CHECK_RUNTIME_CHANGED", "Die Sprachprüflaufzeit besitzt unbekannte Dateien.");
      const relative = prefix + value.name, filename = path.join(directory, value.name);
      if (value.isDirectory()) { manifest.update(JSON.stringify({ path: relative, type: "directory" }) + "\n"); await walk(filename, relative + "/"); }
      else {
        const pin = await fileHash(filename, signal); bytes += pin.bytes; files++;
        requireValue(bytes <= 800 * 1024 * 1024, "LANGUAGE_CHECK_RUNTIME_CHANGED", "Die Sprachprüflaufzeit überschreitet die feste Größe.");
        manifest.update(JSON.stringify({ path: relative, type: "file", ...pin }) + "\n");
      }
    }
  }
  await walk(root); return { entries, files, bytes, treeSha256: manifest.digest("hex") };
}
async function regular(filename) {
  if (!filename || !path.isAbsolute(filename)) return false;
  await noLanguageLinks(filename);
  const stat = await fs.lstat(filename).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  return Boolean(stat?.isFile() && stat.nlink === 1);
}
async function privateJavaConfiguration(runtimeRoot) {
  const filename = path.join(path.dirname(runtimeRoot), "runtime-config.json"); await noLanguageLinks(filename);
  const stat = await fs.lstat(filename).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (!stat) return null;
  requireValue(stat.isFile() && stat.nlink === 1 && stat.size <= 16384, "LANGUAGE_CHECK_UNSAFE_RUNTIME", "Die private Sprachprüfkonfiguration ist ungültig.");
  const value = JSON.parse(await fs.readFile(filename, "utf8"));
  requireValue(value?.schemaVersion === 1 && Object.keys(value).length === 2 && Object.keys(value).every(key => ["schemaVersion", "javaPath"].includes(key))
    && typeof value.javaPath === "string" && path.isAbsolute(value.javaPath), "LANGUAGE_CHECK_UNSAFE_RUNTIME", "Die private Java-Einrichtung ist ungültig.");
  return value.javaPath;
}
export function languageRuntimeRoot(repoRoot, runtimeRoot) {
  requireValue(typeof repoRoot === "string" && path.isAbsolute(repoRoot), "LANGUAGE_CHECK_UNSAFE_RUNTIME", "Der Programmordner der Sprachprüfung fehlt.");
  requireValue(runtimeRoot === undefined || typeof runtimeRoot === "string" && path.isAbsolute(runtimeRoot),
    "LANGUAGE_CHECK_UNSAFE_RUNTIME", "Der Sprachprüfordner muss ein fester absoluter lokaler Pfad sein.");
  return runtimeRoot ? path.resolve(runtimeRoot) : path.join(explorerStoragePaths({ repoRoot }).dataRoot, "local-tools", "languagetool", LANGUAGE_RUNTIME_DIRECTORY);
}
export async function resolveLanguageRuntime({ repoRoot, runtimeRoot, javaPath, environment = process.env, signal,
  runtimeLock = LANGUAGE_RUNTIME_LOCK, launcherLock = LANGUAGE_LAUNCHER_LOCK } = {}) {
  let directory = languageRuntimeRoot(repoRoot, runtimeRoot);
  if (runtimeRoot === undefined && environment.FN_EXPLORER_INSTALLED === "1") {
    const bundled = path.join(repoRoot, "runtime", "languagetool", LANGUAGE_RUNTIME_DIRECTORY);
    await noLanguageLinks(bundled);
    const stat = await fs.lstat(bundled).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (stat) {
      requireValue(stat.isDirectory(), "LANGUAGE_CHECK_RUNTIME_CHANGED", "Die mitgelieferte Sprachprüflaufzeit ist unvollständig.");
      directory = bundled;
    }
  }
  await noLanguageLinks(directory);
  try {
    const actual = await languageRuntimeTree(directory, { signal });
    requireValue(actual.entries === runtimeLock.tree.entries && actual.files === runtimeLock.tree.files && actual.bytes === runtimeLock.tree.bytes
      && actual.treeSha256 === runtimeLock.tree.treeSha256, "LANGUAGE_CHECK_RUNTIME_CHANGED", "Die lokale Sprachprüflaufzeit passt nicht zu ihrem festen Herstellerpaket.");
  } catch (error) { if (error.code === "ENOENT") throw unavailable(); throw error; }
  const launcherPath = path.join(HERE, "managed-launcher.jar"), sourcePath = path.join(HERE, "FNManagedLanguageTool.java");
  await noLanguageLinks(launcherPath); const launcher = await fileHash(launcherPath, signal);
  const source = (await fs.readFile(sourcePath, "utf8")).replaceAll("\r\n", "\n");
  requireValue(launcher.bytes === launcherLock.jarBytes && launcher.sha256 === launcherLock.jarSha256
    && createHash("sha256").update(source).digest("hex") === launcherLock.sourceSha256,
  "LANGUAGE_CHECK_RUNTIME_CHANGED", "Der verwaltete Sprachprüfstarter passt nicht zu seiner Quelle.");
  const executable = process.platform === "win32" ? "java.exe" : "java";
  const configured = javaPath || await privateJavaConfiguration(directory);
  const candidates = [
    ...(javaPath ? [javaPath] : []), path.join(path.dirname(directory), "java", "bin", executable), path.join(repoRoot, "runtime", "java", "bin", executable),
    ...(configured && !javaPath ? [configured] : []), ...(environment.JAVA_HOME ? [path.join(environment.JAVA_HOME, "bin", executable)] : []),
    ...String(environment.PATH || "").split(path.delimiter).filter(value => path.isAbsolute(value)).map(value => path.join(value, executable)),
  ];
  for (const candidate of candidates) if (await regular(candidate)) return { directory, javaPath: candidate, launcherPath, version: runtimeLock.version, runtimeTree: runtimeLock.tree.treeSha256 };
  throw unavailable("LANGUAGE_CHECK_JAVA_MISSING");
}
