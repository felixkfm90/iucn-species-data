import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readSmallJson } from "./proof.mjs";

export const ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const DEVICE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{7,99}$/;
export const completionError = (message, code = "UPDATE_COMPLETION_BLOCKED") => Object.assign(new Error(message), { code, statusCode: 409 });

async function noLinks(filename) {
  for (let current = path.resolve(filename);;) {
    const stat = await fs.lstat(current).catch((error) => { if (error.code !== "ENOENT") throw error; return null; });
    if (stat?.isSymbolicLink()) throw completionError("Die lokale Abschlussablage darf keine Verzeichnisverknüpfung verwenden.");
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

export async function writeCompletionJson(filename, value) {
  await noLinks(filename);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    const file = await fs.open(temporary, "wx");
    try { await file.writeFile(`${JSON.stringify(value, null, 2)}\n`); await file.sync(); }
    finally { await file.close(); }
    await fs.rename(temporary, filename);
  } finally { await fs.rm(temporary, { force: true }); }
}

export function createCompletionStore({ stateRoot, deviceId, writeJson = writeCompletionJson } = {}) {
  if (!path.isAbsolute(stateRoot || "") || /^[/\\]{2}/.test(stateRoot) || !DEVICE_PATTERN.test(deviceId || "")) {
    throw new TypeError("Eine ausdrückliche lokale Geräteablage und vertrauenswürdige Gerätekennung sind erforderlich.");
  }
  const root = path.join(path.resolve(stateRoot), deviceId);
  const current = path.join(root, "current.json");
  const selectionPath = (id) => {
    if (!ID_PATTERN.test(id || "")) throw completionError("Ungültige Abschlussauswahl.");
    return path.join(root, "selections", `${id}.json`);
  };
  const contextPath = (directory, id) => path.join(root, directory, path.basename(selectionPath(id)));
  const claimPath = (id) => contextPath("claims", id);
  async function createContextFile(filename, context) {
    await noLinks(filename);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    let file;
    try { file = await fs.open(filename, "wx"); }
    catch (error) { if (error.code === "EEXIST") return false; throw error; }
    try { await file.writeFile(`${JSON.stringify(context, null, 2)}\n`); await file.sync(); }
    finally { await file.close(); }
    return true;
  }
  const validate = (record) => {
    if (!record) return null;
    if (record.schemaVersion !== 1 || record.deviceId !== deviceId || !ID_PATTERN.test(record.selectionId || "") || !ID_PATTERN.test(record.sessionId || "")) {
      throw completionError("Der gespeicherte Abschlussauftrag gehört nicht zu diesem lokalen Gerät.");
    }
    return record;
  };
  return {
    root,
    async current() {
      await noLinks(current);
      const pointer = await readSmallJson(current);
      return pointer ? this.read(pointer.selectionId) : null;
    },
    async read(id) { const filename = selectionPath(id); await noLinks(filename); return validate(await readSmallJson(filename)); },
    async save(record) { validate(record); await writeJson(selectionPath(record.selectionId), record); },
    async pointTo(record) { validate(record); await writeJson(current, { schemaVersion: 1, selectionId: record.selectionId }); },
    async readClaim(id) { const filename = claimPath(id); await noLinks(filename); return readSmallJson(filename); },
    async claim(context) { return createContextFile(claimPath(context.selectionId), context); },
    async consumeClaimExecution(context) {
      const saved = await this.readClaim(context.selectionId);
      if (!saved || JSON.stringify(saved) !== JSON.stringify(context)) throw completionError("Keine unveränderte dauerhafte Ausführungsbindung.");
      return createContextFile(contextPath("dispatches", context.selectionId), context);
    },
    async exclusive(operation) {
      await noLinks(root);
      await fs.mkdir(root, { recursive: true });
      const lockPath = path.join(root, "owner.lock");
      let file;
      try { file = await fs.open(lockPath, "wx"); }
      catch (error) { if (error.code === "EEXIST") throw completionError("Eine lokale Abschlussprüfung läuft bereits oder ihr Abschluss ist ungeklärt.", "UPDATE_COMPLETION_LOCKED"); throw error; }
      try { await file.writeFile(JSON.stringify({ pid: process.pid, deviceId })); return await operation(); }
      finally { await file.close(); await fs.rm(lockPath, { force: true }); }
    },
  };
}
