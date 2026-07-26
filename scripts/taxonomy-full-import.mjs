import fs from "node:fs/promises";
import path from "node:path";

import { importFullTaxonomyRelease } from "../species-explorer/taxonomy-full-import.mjs";

function argumentValue(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((entry) => entry.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : "";
}

async function readJsonArgument(name) {
  const filePath = argumentValue(name);
  if (!filePath) throw new Error(`Parameter --${name}=<Datei> fehlt.`);
  return JSON.parse(await fs.readFile(path.resolve(filePath), "utf8"));
}

async function main() {
  const packageDirectory = argumentValue("package");
  const taxonomyRoot = argumentValue("taxonomy-root");
  if (!packageDirectory || !taxonomyRoot) {
    throw new Error("Parameter --package und --taxonomy-root sind erforderlich.");
  }
  const release = await readJsonArgument("release");
  const archive = await readJsonArgument("archive");
  const result = await importFullTaxonomyRelease({
    packageDirectory: path.resolve(packageDirectory),
    taxonomyRoot: path.resolve(taxonomyRoot),
    release,
    archive,
    onProgress(entry) {
      process.stdout.write(`PROGRESS\t${JSON.stringify(entry)}\n`);
    },
  });
  process.stdout.write(`RESULT\t${JSON.stringify({
    releaseId: result.releaseId,
    releaseDirectory: result.releaseDirectory,
    databasePath: result.databasePath,
    manifest: result.manifest,
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
