import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assetBackupFileNames,
  collectManagedAssetBackups,
  latestAssetBackup,
  pruneAssetBackups,
  prunePipelineLogs,
  pruneSpeciesListBackups,
  writeManagedAssetBackup,
} from "./asset-backups.mjs";

async function createTemporaryRepo(context, prefix) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), prefix));
  context.after(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });
  return repoRoot;
}

test("verwaltete Asset-Sicherung ersetzt genau den vorherigen Stand", async (context) => {
  const repoRoot = await createTemporaryRepo(context, "iucn-asset-backup-");
  const assetBackupRoot = path.join(repoRoot, "species-explorer", "asset-backups");
  const species = { safeName: "Amsel", germanName: "Amsel" };

  const firstPath = await writeManagedAssetBackup({
    repoRoot,
    assetBackupRoot,
    species,
    assetType: "map",
    files: [{ fileName: "map.jpg", buffer: Buffer.from("erste Karte") }],
    metadata: { source: "erster Stand" },
  });
  const secondPath = await writeManagedAssetBackup({
    repoRoot,
    assetBackupRoot,
    species,
    assetType: "map",
    files: [{ fileName: "map.jpg", buffer: Buffer.from("zweite Karte") }],
    metadata: { source: "zweiter Stand" },
  });

  assert.equal(firstPath, "species-explorer/asset-backups/Amsel/map");
  assert.equal(secondPath, firstPath);
  assert.equal(
    await readFile(path.join(repoRoot, secondPath, "map.jpg"), "utf8"),
    "zweite Karte",
  );
  const entries = await readdir(path.join(repoRoot, secondPath));
  assert.deepEqual(entries.sort(), ["backup.json", "map.jpg"]);

  const collected = await collectManagedAssetBackups(assetBackupRoot);
  assert.equal(collected.length, 1);
  assert.equal(collected[0].metadata.source, "zweiter Stand");
  const latest = await latestAssetBackup(assetBackupRoot, repoRoot, "Amsel", "map");
  assert.equal(latest.exists, true);
  assert.equal(latest.path, secondPath);
  assert.equal(latest.metadata.source, "zweiter Stand");
});

test("Aufbewahrung löscht nur verwaltete Eingabelistenbackups und Pipeline-Logs", async (context) => {
  const repoRoot = await createTemporaryRepo(context, "iucn-backup-retention-");
  const backupDir = path.join(repoRoot, "species-explorer", "backups");
  const logDir = path.join(repoRoot, "species-explorer", "logs");
  await Promise.all([mkdir(backupDir, { recursive: true }), mkdir(logDir, { recursive: true })]);
  for (const timestamp of ["20260701T010101Z", "20260702T010101Z", "20260703T010101Z"]) {
    await writeFile(path.join(backupDir, `species_list-${timestamp}-Amsel-1234abcd.json`), "{}\n");
    await writeFile(path.join(logDir, `pipeline-${timestamp}-1234abcd.log`), "Log\n");
  }
  await writeFile(path.join(backupDir, "eigene-notiz.json"), "behalten\n");
  await writeFile(path.join(logDir, "eigene-notiz.log"), "behalten\n");

  assert.deepEqual(await pruneSpeciesListBackups(backupDir, 2), { kept: 2, removed: 1 });
  assert.deepEqual(await prunePipelineLogs(logDir, 1), { kept: 1, removed: 2 });
  assert.equal(await readFile(path.join(backupDir, "eigene-notiz.json"), "utf8"), "behalten\n");
  assert.equal(await readFile(path.join(logDir, "eigene-notiz.log"), "utf8"), "behalten\n");
});

test("globale Asset-Sicherungsgrenze entfernt nur erkannte Sicherungen", async (context) => {
  const repoRoot = await createTemporaryRepo(context, "iucn-asset-budget-");
  const assetBackupRoot = path.join(repoRoot, "species-explorer", "asset-backups");
  for (const safeName of ["Amsel", "Drossel"]) {
    const mapDir = path.join(assetBackupRoot, safeName, "map");
    await mkdir(mapDir, { recursive: true });
    await writeFile(path.join(mapDir, "map.jpg"), Buffer.from("Karte"));
    await writeFile(path.join(mapDir, "backup.json"), "{}\n");
  }
  const foreignFile = path.join(assetBackupRoot, "eigene-notiz.txt");
  await writeFile(foreignFile, "behalten\n");

  const result = await pruneAssetBackups(assetBackupRoot, { keepCount: 1, maxBytes: 0 });
  assert.deepEqual(result, { kept: 0, removed: 2, bytes: 0 });
  assert.equal(await readFile(foreignFile, "utf8"), "behalten\n");
  assert.deepEqual(assetBackupFileNames("sound"), ["sound.mp3", "credits.json", "spectrogram.webp"]);
  assert.deepEqual(assetBackupFileNames("unbekannt"), []);
});
