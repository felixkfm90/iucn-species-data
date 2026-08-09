import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { taxonomyMasterMigrationInternals } from "./taxonomy-master-migrate.mjs";

const {
  parseOptions,
  stageRollbackProbe,
} = taxonomyMasterMigrationInternals;

async function temporaryTaxonomyRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "taxonomy-master-migrate-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test("Rollback-only wird als eigenständiger Wartungsmodus erkannt", () => {
  const options = parseOptions([
    "--rollback-only",
    "--taxonomy-root=D:/Taxonomie-Test",
  ]);

  assert.equal(options.rollbackOnly, true);
  assert.equal(options.activate, false);
  assert.equal(options.verifyRollback, false);
  assert.equal(options.taxonomyRoot, path.resolve("D:/Taxonomie-Test"));
});

test("Rollback-Prüfkandidat verwendet die aktive Datenbank ohne erneuten Masteraufbau", async (t) => {
  const taxonomyRoot = await temporaryTaxonomyRoot(t);
  const activeDirectory = path.join(taxonomyRoot, "master", "active");
  const stagingDirectory = path.join(taxonomyRoot, "master", "staging");
  await fs.mkdir(activeDirectory, { recursive: true });
  await fs.writeFile(path.join(activeDirectory, "taxonomy-master.sqlite"), "immutable-master", "utf8");
  await fs.writeFile(path.join(activeDirectory, "manifest.json"), `${JSON.stringify({
    candidateId: "master-original",
    state: "active",
    requiresConfirmation: false,
  })}\n`, "utf8");

  const result = await stageRollbackProbe(taxonomyRoot, {
    now: () => new Date("2026-08-09T12:34:56.000Z"),
  });
  const stagedDatabase = await fs.readFile(
    path.join(stagingDirectory, "taxonomy-master.sqlite"),
    "utf8",
  );
  const stagedManifest = JSON.parse(await fs.readFile(
    path.join(stagingDirectory, "manifest.json"),
    "utf8",
  ));

  assert.equal(stagedDatabase, "immutable-master");
  assert.match(result.storageMode, /^(hardlink|copy)$/);
  assert.equal(stagedManifest.candidateId, "master-original-rollback-probe-20260809123456000");
  assert.equal(stagedManifest.state, "staging");
  assert.equal(stagedManifest.requiresConfirmation, true);
  assert.equal(stagedManifest.rollbackProbe, true);
});
