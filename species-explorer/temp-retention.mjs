import { fileURLToPath } from "node:url";
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

export const TEMP_RETENTION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

export const MANAGED_TEMP_POLICIES = Object.freeze([
  {
    id: "asset-staging",
    root: ["species-explorer", "staging"],
    ownership: "Arten-Explorer Assetvorschau",
    entryType: "file",
    pattern: new RegExp(`^${UUID}(?:\\.jpg|\\.mp3|\\.webp|\\.portrait\\.webp|\\.portrait-input\\.(?:png|jpe?g|webp))$`, "i"),
  },
  {
    id: "pipeline-asset-backups",
    root: ["species-explorer", "pipeline-asset-backups"],
    ownership: "Arten-Explorer Pipeline-Rücksicherung",
    entryType: "directory",
    pattern: new RegExp(`^${UUID}$`, "i"),
  },
  {
    id: "cleanup-trash",
    root: ["species-explorer", "cleanup-trash"],
    ownership: "Arten-Explorer Artbereinigung",
    entryType: "directory",
    pattern: /^cleanup-\d{4}-\d{2}-\d{2}T.+-\d+$/,
  },
  {
    id: "chrome-map-tests",
    root: ["Testlauf"],
    ownership: "Veralteter verwalteter Karten-Browsertest",
    entryType: "directory",
    pattern: /^chrome-map-test-[0-9a-f]+$/i,
  },
]);

function isExpectedType(entry, expectedType) {
  return expectedType === "file" ? entry.isFile() : entry.isDirectory();
}

export async function cleanupManagedExplorerTemp({
  repoRoot = process.cwd(),
  phase = "maintenance",
  now = Date.now(),
  maxAgeMs = TEMP_RETENTION_MAX_AGE_MS,
  dryRun = false,
} = {}) {
  if (!new Set(["startup", "shutdown", "maintenance"]).has(phase)) {
    throw new Error(`Unbekannte Temp-Bereinigungsphase: ${phase}`);
  }
  const result = { phase, removed: [], kept: [], errors: [] };
  for (const policy of MANAGED_TEMP_POLICIES) {
    const root = path.resolve(repoRoot, ...policy.root);
    const entries = await readdir(root, { withFileTypes: true }).catch((error) => {
      if (error.code !== "ENOENT") result.errors.push({ policy: policy.id, path: root, error: error.message });
      return [];
    });
    for (const entry of entries) {
      if (!isExpectedType(entry, policy.entryType) || !policy.pattern.test(entry.name)) {
        result.kept.push({ policy: policy.id, path: path.join(root, entry.name), reason: "nicht verwaltet" });
        continue;
      }
      const entryPath = path.join(root, entry.name);
      const details = await stat(entryPath).catch((error) => {
        result.errors.push({ policy: policy.id, path: entryPath, error: error.message });
        return null;
      });
      if (!details) continue;
      const expired = now - details.mtimeMs >= maxAgeMs;
      // Beim Start können andere Entwicklungsinstanzen noch laufen. Deshalb
      // werden dort – wie bei der Wartung – nur abgelaufene Einträge entfernt.
      // Erst ein kontrolliertes Herunterfahren besitzt die eindeutige Freigabe,
      // alle verwalteten Laufzeitreste dieser Arbeitskopie zu löschen.
      const removeNow = phase === "shutdown" || expired;
      if (!removeNow) {
        result.kept.push({ policy: policy.id, path: entryPath, reason: "Aufbewahrungsfrist aktiv" });
        continue;
      }
      if (!dryRun) {
        try {
          await rm(entryPath, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
        } catch (error) {
          result.errors.push({ policy: policy.id, path: entryPath, error: error.message });
          continue;
        }
      }
      result.removed.push({ policy: policy.id, path: entryPath, dryRun });
    }
  }
  return result;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const phaseArgument = process.argv.find((argument) => argument.startsWith("--phase="));
  const phase = phaseArgument?.slice("--phase=".length) || "maintenance";
  const dryRun = process.argv.includes("--dry-run");
  try {
    const result = await cleanupManagedExplorerTemp({ phase, dryRun });
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
