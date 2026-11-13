import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listPublicCatalogFiles } from "../../scripts/pages-artifact-policy.mjs";
import { decodePublicAppCatalogManifest } from "../../species-explorer/species-content/public-app-catalog.mjs";

const manifestPath = "mobile/catalog/manifest.json";
const hash = /^[a-f0-9]{64}$/u;

export async function installPublicCatalogCandidate({ root, candidate, verification }) {
  const { status, catalogSha256, baselineSha256 } = verification;
  assert.ok(status === "verified-candidate" && hash.test(catalogSha256) && hash.test(baselineSha256)
    && catalogSha256 !== baselineSha256, "Es fehlt der Prüfnachweis für eine neue Katalogfassung.");
  const payloadPath = `mobile/catalog/${catalogSha256}.json`;
  assert.deepEqual(await listPublicCatalogFiles(candidate), [manifestPath, payloadPath],
    "Die Kandidatendateien stimmen nicht mit dem geprüften Katalog überein.");

  const previous = await listPublicCatalogFiles(root);
  if (previous.length) {
    const manifest = decodePublicAppCatalogManifest(await readFile(path.join(root, manifestPath)));
    assert.equal(manifest.catalogSha256, baselineSha256, "Die lokale Ausgangsfassung des Katalogs hat sich geändert.");
  }

  await mkdir(path.dirname(path.join(root, manifestPath)), { recursive: true });
  await copyFile(path.join(candidate, payloadPath), path.join(root, payloadPath), constants.COPYFILE_EXCL);
  await copyFile(path.join(candidate, manifestPath), path.join(root, manifestPath));
  if (previous.length) await unlink(path.join(root, previous[1]));
  assert.deepEqual(await listPublicCatalogFiles(root), [manifestPath, payloadPath]);
}

if (import.meta.main) {
  const [directory, json] = process.argv.slice(2);
  assert.ok(directory && json, "Kandidatenordner und Prüfnachweis fehlen.");
  await installPublicCatalogCandidate({ root: fileURLToPath(new URL("../../", import.meta.url)),
    candidate: directory, verification: JSON.parse(json) });
}
