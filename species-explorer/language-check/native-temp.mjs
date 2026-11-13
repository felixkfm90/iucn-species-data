import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { LANGUAGE_RUNTIME_LOCK, noLanguageLinks } from "./runtime.mjs";

/** Called only after the owned child's close event. Never recurses or removes unknown content. */
export async function cleanOwnLanguageNativeTemp(directory) {
  await noLanguageLinks(directory);
  const entries = await fs.readdir(directory, { withFileTypes: true }), verified = new Set();
  entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink() && /^(?:hsperfdata_[a-zA-Z0-9._-]+|jna-[0-9]+)$/.test(entry.name)) {
      await fs.rmdir(filename).catch(error => { if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error; });
    } else if (entry.isFile() && !entry.isSymbolicLink() && /^jna[0-9]+\.dll$/.test(entry.name)) {
      const before = await fs.lstat(filename), allowed = LANGUAGE_RUNTIME_LOCK.nativeTempArtifacts.filter(pin => pin.bytes === before.size);
      if (before.nlink !== 1 || !allowed.length) continue;
      const bytes = await fs.readFile(filename), sha256 = createHash("sha256").update(bytes).digest("hex"), after = await fs.lstat(filename);
      if (before.ino === after.ino && before.dev === after.dev && before.mtimeMs === after.mtimeMs && before.size === after.size
          && allowed.some(pin => pin.sha256 === sha256)) { await fs.unlink(filename); verified.add(entry.name); }
    } else if (entry.isFile() && !entry.isSymbolicLink() && /^jna[0-9]+\.dll\.x$/.test(entry.name) && verified.has(entry.name.slice(0, -2))) {
      const stat = await fs.lstat(filename); if (stat.size === 0 && stat.nlink === 1) await fs.unlink(filename);
    }
  }
}
