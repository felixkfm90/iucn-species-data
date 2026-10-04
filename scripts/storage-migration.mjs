import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planStorageMigration, prepareStorageMigration, commitStorageMigration, restoreStorageMigration } from "../species-explorer/storage-migration.mjs";
import { EXPLORER_REPO_ROOT, legacyExplorerDataRoot } from "../species-explorer/storage-paths.mjs";

export async function runStorageMigration(args) {
  const command = args[0] || "plan";
  const option = (name, fallback) => args.find((entry) => entry.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
  const absoluteOption = (name, fallback) => {
    const value = option(name, fallback);
    if (!path.isAbsolute(value)) throw new Error(`Speicherwechsel verlangt einen absoluten ${name}-Pfad.`);
    return path.resolve(value);
  };
  const repoRoot = absoluteOption("repo-root", EXPLORER_REPO_ROOT);
  const sourceRoot = absoluteOption("source-root", legacyExplorerDataRoot());
  const targetRoot = absoluteOption("target-root", path.join(repoRoot, "Daten"));
  if (command === "plan") return planStorageMigration({ repoRoot, sourceRoot, targetRoot });
  if (command === "prepare") {
    const planPath = option("plan", "");
    if (!path.isAbsolute(planPath)) throw new Error("Geprüfte Plandatei als absoluten Pfad angeben.");
    const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
    return prepareStorageMigration(plan, { confirmed: args.includes("--confirmed"), onProgress: (value) => console.log(JSON.stringify(value)) });
  }
  if (command === "commit") return commitStorageMigration({ repoRoot, sourceRoot, targetRoot, consumersClosed: args.includes("--consumers-closed") });
  if (command === "restore") return restoreStorageMigration({ repoRoot, targetRoot, consumersClosed: args.includes("--consumers-closed") });
  throw new Error(`Unbekannter Speicherwechsel-Schritt: ${command}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = await runStorageMigration(process.argv.slice(2)); console.log(JSON.stringify(result, null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
