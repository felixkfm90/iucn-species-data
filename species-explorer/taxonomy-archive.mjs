import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const SCRIPT_PATH = fileURLToPath(
  new URL("../scripts/extract-taxonomy-archive.ps1", import.meta.url),
);

export const TAXONOMY_ARCHIVE_LIMITS = Object.freeze({
  maxExpandedBytes: 24 * 1024 ** 3,
  maxEntries: 50_000,
  maxCompressionRatio: 300,
});

export function validateArchiveEntryName(value) {
  const name = String(value ?? "");
  if (
    !name
    || name.includes("\0")
    || path.win32.isAbsolute(name)
    || path.posix.isAbsolute(name)
    || /(^|[\\/])\.\.([\\/]|$)/.test(name)
    || /^[A-Za-z]:/.test(name)
  ) {
    throw new Error(`Unzulässiger Pfad im Taxonomiearchiv: ${name || "(leer)"}`);
  }
  return name;
}

export async function extractTaxonomyArchive({
  archivePath,
  destinationPath,
  onProgress,
  powershell = "powershell.exe",
  spawnImpl = spawn,
} = {}) {
  if (!archivePath || !destinationPath) {
    throw new TypeError("Archiv- und Zielpfad sind erforderlich.");
  }
  return new Promise((resolve, reject) => {
    const child = spawnImpl(powershell, [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      SCRIPT_PATH,
      "-ArchivePath",
      path.resolve(archivePath),
      "-DestinationPath",
      path.resolve(destinationPath),
      "-MaxExpandedBytes",
      String(TAXONOMY_ARCHIVE_LIMITS.maxExpandedBytes),
      "-MaxEntries",
      String(TAXONOMY_ARCHIVE_LIMITS.maxEntries),
      "-MaxCompressionRatio",
      String(TAXONOMY_ARCHIVE_LIMITS.maxCompressionRatio),
    ], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let result = null;
    let errorText = "";
    const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on("line", (line) => {
      if (line.startsWith("PROGRESS\t")) {
        const [, current, total] = line.split("\t");
        onProgress?.({
          phase: "extract",
          current: Number(current),
          total: Number(total),
          message: "Referenzpaket wird sicher entpackt",
        });
      } else if (line.startsWith("RESULT\t")) {
        result = JSON.parse(line.slice("RESULT\t".length));
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      errorText += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      lines.close();
      if (code !== 0) {
        reject(new Error(
          errorText.trim() || `Das Taxonomiearchiv konnte nicht entpackt werden (Code ${code}).`,
        ));
        return;
      }
      if (!result) {
        reject(new Error("Der Entpackvorgang hat kein prüfbares Ergebnis geliefert."));
        return;
      }
      resolve(result);
    });
  });
}
