import path from "node:path";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function createNasServiceConfiguration(publicOrigin) {
  let url;
  try { url = new URL(publicOrigin); } catch { throw new Error("Eine gültige persönliche HTTPS-Dienstadresse ist erforderlich."); }
  if (url.protocol !== "https:" || url.origin !== publicOrigin || url.username || url.password
    || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(url.hostname) || !url.hostname.includes(".")
    || /^(?:localhost|127\.|0\.|169\.254\.)/i.test(url.hostname)) {
    throw new Error("Die Dienstadresse muss eine genaue HTTPS-Adresse ohne Pfad oder Zugangsdaten sein.");
  }
  return { host: "0.0.0.0", port: 4317, allowNetwork: true,
    allowedHosts: [url.host, "127.0.0.1:4317", "localhost:4317"], allowedOrigins: [] };
}

export async function writeNasServiceConfiguration(filename, publicOrigin) {
  const configuration = createNasServiceConfiguration(publicOrigin);
  if (!path.isAbsolute(filename) || /^(?:\\\\|\/\/)/.test(filename)) throw new Error("Ein absoluter lokaler Konfigurationspfad ist erforderlich.");
  let current = path.parse(filename).root;
  for (const part of filename.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error("Verknüpfte Konfigurationspfade sind nicht zulässig."); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  await writeFile(filename, `${JSON.stringify(configuration, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return configuration;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [filename, publicOrigin, ...extra] = process.argv.slice(2);
  try {
    if (extra.length) throw new Error("Unerwartete Argumente.");
    await writeNasServiceConfiguration(filename, publicOrigin);
    process.stdout.write("Konfiguration angelegt; noch kein Dienst oder Netzwerkzugang gestartet.\n");
  } catch { process.stderr.write("Konfiguration nicht angelegt. Lokalen neuen Zielpfad und genaue HTTPS-Adresse prüfen.\n"); process.exitCode = 1; }
}
