import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import { createExplorerServer } from "./server.mjs";
import { createEditableFixture, registerFixtureCleanup, serverFixtureStoragePaths,
  withServerFixtureStorageEnvironment } from "./server-test-fixtures.mjs";

test("Websiteprüfung als getrennte Lese-API mit Erneuerung; Artdaten und Assetvalidierung unverändert", async (context) => {
  const root = await createEditableFixture(), register = registerFixtureCleanup(context, root);
  const hashes = async () => Object.fromEntries(await Promise.all(["species_list.json", "speciesData.json",
    "fehlende_elemente_report.json"].map(async (file) => [file, createHash("sha256").update(await readFile(`${root}/${file}`)).digest("hex")])));
  const before = await hashes(), calls = [];
  const server = await withServerFixtureStorageEnvironment(root, () => createExplorerServer({ repoRoot: root,
    ...serverFixtureStoragePaths(root), port: 0, websitePagesService: { snapshot: async (options) => {
      calls.push(options); return { status: "ready", checkedAt: "2026-10-16T12:00:00.000Z", pages: [], cached: false };
    } } }));
  register(server);
  const address = await server.listen(), base = `http://127.0.0.1:${address.port}`;
  assert.equal(calls.length, 0, "lokale Daten müssen ohne Websiteabruf starten");
  const localBefore = await (await fetch(`${base}/api/species`)).json();
  const validationBefore = await (await fetch(`${base}/api/validation`)).json();
  assert.equal((await (await fetch(`${base}/api/website/species-pages`)).json()).status, "ready");
  await fetch(`${base}/api/website/species-pages?refresh=1`);
  assert.deepEqual(calls, [{ refresh: false }, { refresh: true }]);
  const foreign = await fetch(`${base}/api/website/species-pages?refresh=1`, {
    headers: { Origin: "https://foreign.invalid", "Sec-Fetch-Site": "cross-site" } });
  assert.equal(foreign.status, 403); assert.equal(calls.length, 2);
  assert.deepEqual(await (await fetch(`${base}/api/species`)).json(), localBefore);
  assert.deepEqual(await (await fetch(`${base}/api/validation`)).json(), validationBefore);
  assert.deepEqual(await hashes(), before);
});
