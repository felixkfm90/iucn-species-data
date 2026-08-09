import path from "node:path";

import { importInaturalistTaxonomySnapshot } from "../species-explorer/taxonomy-inaturalist-snapshot.mjs";

function argumentValue(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((entry) => entry.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : "";
}

async function main() {
  const taxonomyRoot = argumentValue("taxonomy-root");
  const colDatabasePath = argumentValue("col-database");
  const archivePath = argumentValue("archive");
  const packageDirectory = argumentValue("package");
  const providerVersion = argumentValue("provider-version");
  const retrievedAt = argumentValue("retrieved-at") || new Date().toISOString();
  if (!taxonomyRoot || !colDatabasePath || (!archivePath && !packageDirectory)) {
    throw new Error(
      "Parameter --taxonomy-root, --col-database und --archive beziehungsweise --package sind erforderlich.",
    );
  }
  const result = await importInaturalistTaxonomySnapshot({
    taxonomyRoot: path.resolve(taxonomyRoot),
    colDatabasePath: path.resolve(colDatabasePath),
    archivePath: archivePath ? path.resolve(archivePath) : null,
    packageDirectory: packageDirectory ? path.resolve(packageDirectory) : null,
    providerVersion: providerVersion || null,
    retrievedAt,
    onProgress(entry) {
      process.stdout.write(`PROGRESS\t${JSON.stringify(entry)}\n`);
    },
  });
  process.stdout.write(`RESULT\t${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  process.stderr.write(`error: ${error?.message || error}\n`);
  process.exitCode = 1;
});
