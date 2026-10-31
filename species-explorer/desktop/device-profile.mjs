import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

export async function loadLocalDeviceProfile(directory, { deviceName = os.hostname() } = {}) {
  if (!path.isAbsolute(directory || "") || /^[/\\]{2}/.test(directory)) throw new Error("Ein lokales persönliches Geräteprofil ist erforderlich.");
  let current = path.parse(directory).root;
  for (const part of directory.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current).catch((error) => { if (error.code !== "ENOENT") throw error; return null; });
    if (stat?.isSymbolicLink() || stat && !stat.isDirectory()) throw new Error("Das Geräteprofil darf keinen verknüpften Pfad verwenden.");
  }
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, "device.json");
  const validate = (value) => {
    if (value?.schemaVersion !== 1 || !/^device-[a-f0-9-]{36}$/.test(value.id || "") || typeof value.name !== "string"
      || !value.name.trim() || value.name.length > 100 || /[\u0000-\u001f]/.test(value.name)) throw new Error("Die gespeicherte lokale Gerätekennung ist ungültig.");
    return value;
  };
  const read = async () => {
    const stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw new Error("Die lokale Gerätekennung ist ungültig.");
    return validate(JSON.parse(await fs.readFile(filename, "utf8")));
  };
  try { return await read(); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const value = validate({ schemaVersion: 1, id: `device-${randomUUID()}`, name: deviceName });
  try { await fs.writeFile(filename, `${JSON.stringify(value)}\n`, { flag: "wx", mode: 0o600 }); return value; }
  catch (error) { if (error.code === "EEXIST") return read(); throw error; }
}
