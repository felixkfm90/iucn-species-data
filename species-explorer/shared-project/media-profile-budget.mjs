import fs from "node:fs/promises";
import path from "node:path";
import { assertNoTempLinks } from "../temp-session.mjs";

const DATABASES = ["project-cache.sqlite", "initial-import.sqlite", "website-alt-sync.sqlite", "page-authoring.sqlite"];
const FILES = ["device.json", ...DATABASES.flatMap(name => [name, `${name}-wal`, `${name}-shm`, `${name}-journal`])];
const denied = () => new Error("Die persönliche Ablage kann nicht sicher auf freien Sicherungsplatz geprüft werden. Vorhandene Inhalte bleiben erhalten.");

/** Conservative physical-size budget for the fixed personal backup inputs. Never traverses credentials, AI models or user files. */
export function createExplorerMediaBudgetReader({ profileRoot } = {}) {
  if (typeof profileRoot !== "string" || !path.isAbsolute(profileRoot) || /^(?:[\\/]{2}|file:)/i.test(profileRoot)
    || /[\x00-\x1f]/.test(profileRoot)) throw denied();
  const root = path.resolve(profileRoot);
  async function inspect() {
    await assertNoTempLinks(root);
    const directory = await fs.lstat(root);
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw denied();
    const entries = [];
    for (const name of FILES) {
      const filename = path.join(root, name);
      await assertNoTempLinks(root, filename);
      const stat = await fs.lstat(filename).catch(error => { if (error.code === "ENOENT") return null; throw error; });
      const limit = name === "device.json" ? 16 * 1024 * 1024 : 512 * 1024 * 1024;
      if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !Number.isSafeInteger(stat.size)
        || stat.size < 0 || stat.size > limit)) throw denied();
      entries.push(stat ? { bytes: stat.size, dev: stat.dev, ino: stat.ino, modified: stat.mtimeMs } : null);
    }
    return { directory: { dev: directory.dev, ino: directory.ino }, entries };
  }
  return async function readPersonalMediaBudget({ additionalBytes = 0 } = {}) {
    if (!Number.isSafeInteger(additionalBytes) || additionalBytes < 0) throw denied();
    const first = await inspect(), second = await inspect();
    if (JSON.stringify(first) !== JSON.stringify(second)) {
      throw new Error("Die persönliche Ablage wurde während der Speicherprüfung geändert. Bitte die Bildaufnahme erneut starten; vorhandene Inhalte bleiben erhalten.");
    }
    const totalBytes = first.entries.reduce((total, entry) => total + (entry?.bytes || 0), 0);
    if (!Number.isSafeInteger(totalBytes)) throw denied();
    return { totalBytes };
  };
}
