import fs from "node:fs/promises";
import path from "node:path";

export const TAXONOMY_SPACE_RESERVE = 2 * 1024 ** 3;
const sizeLabel = (bytes) => `${(bytes / 1024 ** 3).toLocaleString("de-DE", { maximumFractionDigits: 2 })} GiB`;

export async function availableTaxonomySpace(directory, { statfs = fs.statfs } = {}) {
  let current = path.resolve(directory);
  for (;;) {
    try {
      const value = await statfs(current);
      const bytes = Number(value.bavail) * Number(value.bsize);
      if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error("Freier Speicher ist nicht zuverlässig bestimmbar.");
      return bytes;
    } catch (error) {
      if (error.code !== "ENOENT" || path.dirname(current) === current) throw error;
      current = path.dirname(current);
    }
  }
}

// An estimate plus reserve, not a promise that every provider or SQLite file
// has a fixed expansion factor. Recheck at spool/checkpoint boundaries as well.
export async function assertTaxonomySpace(directory, additionalBytes = 0, {
  reserveBytes = TAXONOMY_SPACE_RESERVE, available = availableTaxonomySpace,
} = {}) {
  if (![additionalBytes, reserveBytes].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error("Ungültige Speicherplatzschätzung.");
  }
  const freeBytes = await available(directory);
  const requiredBytes = additionalBytes + reserveBytes;
  if (freeBytes < requiredBytes) {
    const error = new Error(`Zu wenig freier Speicher für den Datenbankaufbau: ${sizeLabel(freeBytes)} verfügbar, `
      + `mindestens ${sizeLabel(requiredBytes)} einschließlich ${sizeLabel(reserveBytes)} Reserve benötigt. `
      + "Bitte Speicher freigeben oder unter Speicher prüfen und bereinigen zuerst die Vorschau ansehen. Bestehende Datenstände bleiben erhalten.");
    error.code = "TAXONOMY_DISK_SPACE";
    throw error;
  }
  return { freeBytes, requiredBytes, reserveBytes };
}

export async function taxonomyDirectoryBytes(directory) {
  let stat;
  try { stat = await fs.lstat(directory); }
  catch (error) { if (error.code === "ENOENT") return 0; throw error; }
  if (stat.isSymbolicLink()) throw new Error("Verknüpfte Datenbankverzeichnisse können nicht sicher vermessen werden.");
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) throw new Error("Unbekannter Eintrag im Datenbankspeicher.");
  let bytes = 0;
  for (const entry of await fs.readdir(directory)) bytes += await taxonomyDirectoryBytes(path.join(directory, entry));
  return bytes;
}
