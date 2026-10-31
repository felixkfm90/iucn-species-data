import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const aiError = (message, code = "LOCAL_AI_BLOCKED") => Object.assign(new Error(message), { code, statusCode: 409 });
export const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
export const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
export function safeRelative(value) {
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes(":")) throw aiError("Ungültiger lokaler KI-Dateipfad.");
  if (value.split("/").some((part) => !part || part === "." || part === ".." || /[\x00-\x1f<>"|?*]|[. ]$/.test(part)
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw aiError("Unsicherer lokaler KI-Dateipfad.");
  return value;
}
export async function noLinks(filename) {
  for (let current = path.resolve(filename);;) {
    const stat = await fs.lstat(current).catch((error) => { if (error.code !== "ENOENT") throw error; return null; });
    if (stat?.isSymbolicLink()) throw aiError("Lokale KI-Dateien dürfen keine Verzeichnisverknüpfungen verwenden.");
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
export function childPath(root, relative) {
  safeRelative(relative);
  const result = path.resolve(root, relative), back = path.relative(path.resolve(root), result);
  if (!back || back.startsWith(`..${path.sep}`) || path.isAbsolute(back)) throw aiError("KI-Dateipfad liegt außerhalb des privaten Bereichs.");
  return result;
}
export async function hashFile(filename, { signal } = {}) {
  await noLinks(filename);
  const file = await fs.open(filename, "r"), hash = crypto.createHash("sha256");
  try { for await (const chunk of file.createReadStream()) { signal?.throwIfAborted(); hash.update(chunk); } }
  finally { await file.close(); }
  signal?.throwIfAborted();
  return hash.digest("hex");
}
export async function verifyFile(filename, pin, { signal } = {}) {
  await noLinks(filename);
  const before = await fs.stat(filename);
  if (!before.isFile() || before.size !== pin.bytes || await hashFile(filename, { signal }) !== pin.sha256) throw aiError("Eine lokale KI-Datei stimmt nicht mit dem freigegebenen Original überein.", "LOCAL_AI_HASH_MISMATCH");
  const after = await fs.stat(filename);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw aiError("Eine lokale KI-Datei wurde während der Prüfung verändert.");
  return { bytes: after.size, mtimeMs: after.mtimeMs, ctimeMs: after.ctimeMs };
}
export async function readJson(filename, maxBytes = 2 * 1024 * 1024) {
  await noLinks(filename);
  try {
    const info = await fs.stat(filename);
    if (!info.isFile() || info.size > maxBytes) throw aiError("Ungültige lokale KI-Konfiguration.");
    return JSON.parse(await fs.readFile(filename, "utf8"));
  } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
export async function writeJson(filename, value) {
  await noLinks(filename); await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
  try {
    const file = await fs.open(temporary, "wx");
    try { await file.writeFile(`${JSON.stringify(value, null, 2)}\n`); await file.sync(); }
    finally { await file.close(); }
    await fs.rename(temporary, filename);
  } finally { await fs.rm(temporary, { force: true }); }
}
export async function boundedResponse(response, maxBytes, { signal } = {}) {
  if (!response.body) throw aiError("Die lokale KI hat keine Antwort geliefert.");
  const length = response.headers?.get?.("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw aiError("Die KI-Antwort überschreitet die zulässige Größe.");
  const chunks = []; let bytes = 0, abort;
  const reader = response.body.getReader();
  const aborted = new Promise((_, reject) => {
    abort = () => reject(signal.reason);
    signal?.addEventListener("abort", abort, { once: true });
  });
  try {
    for (;;) {
      signal?.throwIfAborted();
      const item = await Promise.race([reader.read(), aborted]);
      if (item.done) break;
      bytes += item.value.length;
      if (bytes > maxBytes) throw aiError("Die KI-Antwort überschreitet die zulässige Größe.");
      chunks.push(Buffer.from(item.value));
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    signal?.removeEventListener("abort", abort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
