import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";
import { createManagedTempSession } from "../temp-session.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url)), here = fileURLToPath(new URL("./", import.meta.url));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
// Deterministic single-entry, uncompressed JAR: source build needs javac; use does not.
export function launcherJar(bytes) {
  const name = Buffer.from("org/languagetool/server/FNManagedLanguageTool.class"), crc = crc32(bytes);
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(33, 12); local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(33, 14);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(name.length, 28);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + bytes.length, 16);
  return Buffer.concat([local, name, bytes, central, name, end]);
}
export async function buildLauncher({ javacPath, runtimeRoot, write = false } = {}) {
  if (!path.isAbsolute(javacPath || "") || !path.isAbsolute(runtimeRoot || "")) throw new Error("Absolute Compiler- und LT-Pfade erforderlich.");
  const session = await createManagedTempSession({ repoRoot: root }), source = (await fs.readFile(path.join(here, "FNManagedLanguageTool.java"), "utf8")).replaceAll("\r\n", "\n");
  try {
    const sourcePath = await session.filePath("FNManagedLanguageTool.java"); await fs.writeFile(sourcePath, source, { flag: "wx" });
    const classPath = await session.filePath("FNManagedLanguageTool.class");
    await new Promise((resolve, reject) => {
      const child = spawn(javacPath, ["--release", "17", "-encoding", "UTF-8", "-cp", path.join(runtimeRoot, "languagetool-server.jar"), sourcePath],
        { windowsHide: true, shell: false, stdio: "ignore" });
      child.once("error", reject); child.once("close", code => code === 0 ? resolve() : reject(new Error("Launcherkompilierung fehlgeschlagen.")));
    });
    const compiled = await fs.readFile(classPath), jar = launcherJar(compiled);
    const lock = { schemaVersion: 1, javaRelease: 17, className: "org.languagetool.server.FNManagedLanguageTool", sourceSha256: hash(Buffer.from(source)),
      classSha256: hash(compiled), jarSha256: hash(jar), jarBytes: jar.length };
    if (write) {
      await fs.writeFile(path.join(here, "managed-launcher.jar"), jar);
      await fs.writeFile(path.join(here, "launcher-lock.json"), JSON.stringify(lock, null, 2) + "\n");
    } else if (hash(await fs.readFile(path.join(here, "managed-launcher.jar"))) !== lock.jarSha256) throw new Error("Launcher ist nicht quellengleich reproduziert.");
    return lock;
  } finally { const result = await session.close(); if (result.pending || result.errors.length || result.kept.length) throw new Error("Eigener Compiler-Tempabschluss ist offen."); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , javacPath, runtimeRoot, mode] = process.argv;
  process.stdout.write(JSON.stringify(await buildLauncher({ javacPath, runtimeRoot, write: mode === "--write" })) + "\n");
}
