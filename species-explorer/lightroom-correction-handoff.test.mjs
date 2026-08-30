import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  consumeLightroomCorrectionHandoff,
  createLightroomCorrectionHandoff,
  lightroomCorrectionHandoffPath,
  parseLightroomCorrectionRequestIds,
} from "./lightroom-correction-handoff.mjs";

const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";

function fixtureTaxon() {
  return {
    masterTaxonId: "mtx_fixture",
    acceptedScientificName: "Macroglossum stellatarum",
    rank: "species",
    kingdom: "Animalia",
    germanName: "Taubenschwänzchen",
    englishName: "Hummingbird Hawk-moth",
  };
}

test("Lightroom-Korrekturübergabe ist kurzlebig, eindeutig und wird einmalig verbraucht", async (t) => {
  const handoffRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lightroom-correction-"));
  t.after(() => fs.rm(handoffRoot, { recursive: true, force: true }));
  const launched = [];
  const now = new Date("2026-08-30T10:00:00.000Z");
  const created = await createLightroomCorrectionHandoff({
    taxon: fixtureTaxon(),
    packageStatus: { packageId: "lightroom-fixture", masterVersion: "master-fixture" },
    handoffRoot,
    now: () => now,
    randomUUID: () => REQUEST_ID,
    launchExplorer: async (requestId) => launched.push(requestId),
  });
  assert.equal(created.launched, true);
  assert.deepEqual(launched, [REQUEST_ID]);
  const payload = await consumeLightroomCorrectionHandoff(REQUEST_ID, {
    handoffRoot,
    now: () => new Date("2026-08-30T10:05:00.000Z"),
  });
  assert.equal(payload.masterTaxonId, "mtx_fixture");
  assert.equal(payload.acceptedScientificName, "Macroglossum stellatarum");
  assert.equal(payload.packageId, "lightroom-fixture");
  assert.equal(
    await consumeLightroomCorrectionHandoff(REQUEST_ID, { handoffRoot, now: () => now }),
    null,
  );
});

test("Abgelaufene oder manipulierte Übergaben werden gelöscht und nicht geöffnet", async (t) => {
  const handoffRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lightroom-correction-expired-"));
  t.after(() => fs.rm(handoffRoot, { recursive: true, force: true }));
  const targetPath = lightroomCorrectionHandoffPath(handoffRoot, REQUEST_ID);
  await fs.mkdir(handoffRoot, { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify({
    schemaVersion: 1,
    requestId: REQUEST_ID,
    createdAt: "2026-08-30T09:00:00.000Z",
    expiresAt: "2026-08-30T09:15:00.000Z",
    ...fixtureTaxon(),
    packageId: "lightroom-fixture",
    masterVersion: "master-fixture",
  }));
  await assert.rejects(
    consumeLightroomCorrectionHandoff(REQUEST_ID, {
      handoffRoot,
      now: () => new Date("2026-08-30T10:00:00.000Z"),
    }),
    /abgelaufen/,
  );
  await assert.rejects(fs.access(targetPath), /ENOENT/);
});

test("Desktop-Startargument akzeptiert ausschließlich UUID-Anfragen und dedupliziert sie", () => {
  assert.deepEqual(parseLightroomCorrectionRequestIds([
    "electron.exe",
    `--taxonomy-correction-request=${REQUEST_ID}`,
    `--taxonomy-correction-request=${REQUEST_ID.toUpperCase()}`,
    "--taxonomy-correction-request=../../fremd",
    "--anderes=123",
  ]), [REQUEST_ID]);
});

test("Bei fehlgeschlagenem Explorer-Start bleibt keine Übergabedatei zurück", async (t) => {
  const handoffRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lightroom-correction-launch-"));
  t.after(() => fs.rm(handoffRoot, { recursive: true, force: true }));
  await assert.rejects(createLightroomCorrectionHandoff({
    taxon: fixtureTaxon(),
    packageStatus: { packageId: "lightroom-fixture", masterVersion: "master-fixture" },
    handoffRoot,
    randomUUID: () => REQUEST_ID,
    launchExplorer: async () => { throw new Error("Startfehler"); },
  }), /Startfehler/);
  await assert.rejects(
    fs.access(lightroomCorrectionHandoffPath(handoffRoot, REQUEST_ID)),
    /ENOENT/,
  );
});
