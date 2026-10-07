import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "../scripts/test-temp.mjs";
import path from "node:path";
import {
  assetBackupFileNames,
  collectManagedAssetBackups,
  latestAssetBackup,
  planAssetBackupRetention,
  pruneAssetBackups,
  prunePipelineLogs,
  pruneSpeciesListBackups,
  writeManagedAssetBackup,
  SPECIES_LIST_BACKUP_RETENTION_COUNT,
} from "./asset-backups.mjs";
import { TAXONOMY_BACKUP_RETENTION_COUNT } from "./taxonomy-edit.mjs";
import { createSpeciesCreationSessionStore } from "./species-creation-session.mjs";

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

test("fehlgeschlagener Austausch stellt letzte gültige Mediensicherung wieder her und ist wiederholbar", async (context) => {
  const repoRoot = await createTemporaryRepo(context, "iucn-asset-backup-rollback-");
  const assetBackupRoot = path.join(repoRoot, "species-explorer", "asset-backups");
  const options = { repoRoot, assetBackupRoot, species: { safeName: "Amsel", germanName: "Amsel" },
    assetType: "map", files: [{ fileName: "map.jpg", buffer: Buffer.from("alte gültige Karte") }] };
  await writeManagedAssetBackup(options);
  let moves = 0;
  await assert.rejects(writeManagedAssetBackup({ ...options,
    files: [{ fileName: "map.jpg", buffer: Buffer.from("neue Karte") }],
    async renameDirectory(from, to) {
      if (++moves === 2) throw new Error("simulierte Dateisperre beim endgültigen Austausch");
      return rename(from, to);
    },
  }), /simulierte Dateisperre/);
  assert.equal(await readFile(path.join(assetBackupRoot, "Amsel", "map", "map.jpg"), "utf8"), "alte gültige Karte");
  assert.deepEqual(await readdir(path.join(assetBackupRoot, "Amsel")), ["map"]);
  await assert.rejects(writeManagedAssetBackup({ ...options, files: [] }), /Leere oder unbekannte/);
  await assert.rejects(writeManagedAssetBackup({ ...options,
    files: [{ fileName: "../foreign.jpg", buffer: Buffer.from("fremd") }] }), /unbekannten Dateinamen/);
  assert.equal(await readFile(path.join(assetBackupRoot, "Amsel", "map", "map.jpg"), "utf8"), "alte gültige Karte");
  await writeManagedAssetBackup({ ...options, files: [{ fileName: "map.jpg", buffer: Buffer.from("neue Karte") }] });
  assert.equal(await readFile(path.join(assetBackupRoot, "Amsel", "map", "map.jpg"), "utf8"), "neue Karte");
});

test("gesperrte Wiederherstellung behält gültigen Vorgänger samt verständlichem Dateihinweis", async (context) => {
  const repoRoot = await createTemporaryRepo(context, "iucn-asset-backup-blocked-rollback-");
  const assetBackupRoot = path.join(repoRoot, "species-explorer", "asset-backups");
  const options = { repoRoot, assetBackupRoot, species: { safeName: "Amsel", germanName: "Amsel" },
    assetType: "map", files: [{ fileName: "map.jpg", buffer: Buffer.from("alte Karte") }] };
  await writeManagedAssetBackup(options);
  let moves = 0;
  await assert.rejects(writeManagedAssetBackup({ ...options,
    files: [{ fileName: "map.jpg", buffer: Buffer.from("neue Karte") }],
    async renameDirectory(from, to) {
      if (++moves >= 2) throw new Error("Dateisperre");
      return rename(from, to);
    },
  }), /Vorherige Sicherung liegt weiterhin unter/);
  const names = await readdir(path.join(assetBackupRoot, "Amsel"));
  assert.equal(names.length, 1);
  assert.match(names[0], /^map\.previous-/);
  assert.equal(await readFile(path.join(assetBackupRoot, "Amsel", names[0], "map.jpg"), "utf8"), "alte Karte");
  assert.deepEqual(await pruneAssetBackups(assetBackupRoot), { kept: 0, removed: 0, bytes: 0 }, "Ungeklärter Rücknahmerest ist kein löschbares Legacy-Backup");
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

test("Mediensicherungen besitzen kein gemeinsames Größenbudget und behalten jede Art", async (context) => {
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
  assert.deepEqual(result, { kept: 2, removed: 0, bytes: 10 });
  assert.equal(await readFile(foreignFile, "utf8"), "behalten\n");
  assert.deepEqual(assetBackupFileNames("sound"), ["sound.mp3", "credits.json", "spectrogram.webp"]);
  assert.deepEqual(assetBackupFileNames("unbekannt"), []);
});

test("Medienplanung behält auch über 500 MiB genau einen Stand je Art und Typ ohne große Testdateien", () => {
  const backups = [
    { backupPath: "Amsel/map/latest", species: "Amsel", assetType: "map", name: "latest", bytes: 400 * 1024 ** 2, mtimeMs: 2 },
    { backupPath: "Amsel/map/older", species: "Amsel", assetType: "map", name: "older", bytes: 1, mtimeMs: 1 },
    { backupPath: "Drossel/sound/latest", species: "Drossel", assetType: "sound", name: "latest", bytes: 300 * 1024 ** 2, mtimeMs: 2 },
  ];
  assert.deepEqual(planAssetBackupRetention(backups), {
    removePaths: ["Amsel/map/older"], kept: 2, removed: 1, bytes: 700 * 1024 ** 2,
  });
  assert.deepEqual(planAssetBackupRetention(backups, { protectedSafeNames: ["Amsel"] }), {
    removePaths: [], kept: 3, removed: 0, bytes: 700 * 1024 ** 2 + 1,
  });
  assert.equal(planAssetBackupRetention(backups.map((backup) => backup.name === "older"
    ? { ...backup, mtimeMs: 99 } : backup)).removePaths[0], "Amsel/map/older", "Kopierzeitstempel verdrängt keinen latest-Stand");
  assert.throws(() => planAssetBackupRetention(backups, { keepCount: 0 }), /Mindestens eine/);
});

test("beide kleinen Bearbeitungssicherungsklassen verwenden fünf Stände", async (context) => {
  assert.equal(SPECIES_LIST_BACKUP_RETENTION_COUNT, 5);
  assert.equal(TAXONOMY_BACKUP_RETENTION_COUNT, 5);
  const repoRoot = await createTemporaryRepo(context, "iucn-backup-five-");
  const backupDir = path.join(repoRoot, "species-explorer", "backups");
  await mkdir(backupDir, { recursive: true });
  for (let day = 1; day <= 8; day += 1) {
    await writeFile(path.join(backupDir, `species_list-2026070${day}T010101Z-Amsel-1234abcd.json`), "{}\n");
  }
  assert.deepEqual(await pruneSpeciesListBackups(backupDir), { kept: 5, removed: 3 });
});

test("offene Artanlage pinnt ihren ursprünglichen Listenstand zusätzlich zu fünf jüngeren", async (context) => {
  const repoRoot = await createTemporaryRepo(context, "iucn-backup-open-");
  const backupDir = path.join(repoRoot, "species-explorer", "backups");
  await mkdir(backupDir, { recursive: true });
  await writeFile(path.join(repoRoot, "species_list.json"), "[]\n");
  const backupPath = path.join(backupDir, "species_list-20260701T010101Z-Testvogel-1234abcd.json");
  const store = createSpeciesCreationSessionStore({ repoRoot });
  const id = await store.begin({ entry: { german: "Testvogel", genus: "Testus", species: "avis" },
    derived: { slug: "testusavis", safeName: "Testvogel" }, backupPath });
  await writeFile(backupPath, "[]\n");
  for (let day = 2; day <= 8; day += 1) {
    await writeFile(path.join(backupDir, `species_list-2026070${day}T010101Z-Amsel-1234abcd.json`), "{}\n");
  }
  assert.deepEqual(await pruneSpeciesListBackups(backupDir), { kept: 6, removed: 2, protected: 1 });
  assert.equal(await readFile(backupPath, "utf8"), "[]\n");
  await store.detach(id);
  assert.deepEqual(await pruneSpeciesListBackups(backupDir), { kept: 5, removed: 1 });
});

test("latest und ältere Legacy-Medien werden gemeinsam gezählt; offene Prüfung verhindert deren Rotation", async (context) => {
  const repoRoot = await createTemporaryRepo(context, "iucn-backup-legacy-");
  const assetBackupRoot = path.join(repoRoot, "species-explorer", "asset-backups");
  const mapDir = path.join(assetBackupRoot, "Amsel", "map");
  await mkdir(mapDir, { recursive: true });
  await writeFile(path.join(mapDir, "map.jpg"), "neu");
  const older = path.join(mapDir, "map-20260701T010101Z-1234abcd.jpg");
  await writeFile(older, "alt");
  await utimes(older, new Date("2099-07-01"), new Date("2099-07-01"));
  assert.equal((await collectManagedAssetBackups(assetBackupRoot)).length, 2);
  const latest = await latestAssetBackup(assetBackupRoot, repoRoot, "Amsel", "map");
  assert.equal(latest.path, "species-explorer/asset-backups/Amsel/map", "Kopierzeitstempel ändert weder Auswahl noch Rotation");
  const pendingPath = path.join(repoRoot, "species-explorer", "pending-asset-review.json");
  await writeFile(pendingPath, JSON.stringify({ targets: [{ safeName: "Amsel" }], reviewAssets: [] }));
  assert.deepEqual(await pruneAssetBackups(assetBackupRoot), { kept: 2, removed: 0, bytes: 6 });
  await rm(pendingPath);
  assert.deepEqual(await pruneAssetBackups(assetBackupRoot), { kept: 1, removed: 1, bytes: 3 });
  assert.equal(await readFile(path.join(mapDir, "map.jpg"), "utf8"), "neu");
  await assert.rejects(readFile(older), { code: "ENOENT" });
});

test("unlesbare offene Aufträge stoppen Rotation vor jeder Löschung", async (context) => {
  const repoRoot = await createTemporaryRepo(context, "iucn-backup-unreadable-");
  const backupDir = path.join(repoRoot, "species-explorer", "backups");
  await mkdir(backupDir, { recursive: true });
  for (let day = 1; day <= 8; day += 1) {
    await writeFile(path.join(backupDir, `species_list-2026070${day}T010101Z-Amsel-1234abcd.json`), "{}\n");
  }
  await writeFile(path.join(repoRoot, "species-explorer", "pending-asset-review.json"), "{}");
  await assert.rejects(pruneSpeciesListBackups(backupDir), /Offene Medienprüfung/);
  assert.equal((await readdir(backupDir)).length, 8);
  await writeFile(path.join(repoRoot, "species-explorer", "pending-asset-review.json"), "null");
  await assert.rejects(pruneSpeciesListBackups(backupDir), /Offene Medienprüfung/);
  assert.equal((await readdir(backupDir)).length, 8);
  await rm(path.join(repoRoot, "species-explorer", "pending-asset-review.json"));
  const sessionsDir = path.join(repoRoot, "species-explorer", "creation-sessions");
  await mkdir(sessionsDir);
  await writeFile(path.join(sessionsDir, "00000000-0000-0000-0000-000000000000.json"), "{}");
  await assert.rejects(pruneSpeciesListBackups(backupDir), /keinen gültigen Herkunftsnachweis/);
  assert.equal((await readdir(backupDir)).length, 8);
});

test("gestartete Veröffentlichung und Abbruchwunsch sind kein Abschlussnachweis für Rücknahmesicherungen", async (context) => {
  const repoRoot = await createTemporaryRepo(context, "iucn-backup-publishing-");
  const backupDir = path.join(repoRoot, "species-explorer", "backups");
  await mkdir(backupDir, { recursive: true });
  await writeFile(path.join(repoRoot, "species_list.json"), "[]\n");
  const entry = { german: "Testvogel", genus: "Testus", species: "avis" };
  const backupPath = path.join(backupDir, "species_list-20260701T010101Z-Testvogel-1234abcd.json");
  const store = createSpeciesCreationSessionStore({ repoRoot });
  const id = await store.begin({ entry, derived: { slug: "testusavis", safeName: "Testvogel" }, backupPath });
  await writeFile(backupPath, "[]\n");
  for (let day = 2; day <= 8; day += 1) {
    await writeFile(path.join(backupDir, `species_list-2026070${day}T010101Z-Amsel-1234abcd.json`), "{}\n");
  }
  await store.requestAbort(id);
  assert.deepEqual(await pruneSpeciesListBackups(backupDir), { kept: 6, removed: 2, protected: 1 });
  const jobPath = path.join(repoRoot, "species-explorer", "creation-sessions", `${id}.json`);
  const job = JSON.parse(await readFile(jobPath, "utf8"));
  job.publicationStarted = true;
  await writeFile(jobPath, JSON.stringify(job));
  assert.deepEqual(await pruneSpeciesListBackups(backupDir), { kept: 6, removed: 0, protected: 1 });
  assert.equal(await readFile(backupPath, "utf8"), "[]\n");
});

test("offene Medienprüfung friert den ersten vollständigen Karten-/Soundrücknahmesatz ein, ohne weitere Auswahl zu sperren", async (context) => {
  const repoRoot = await createTemporaryRepo(context, "iucn-backup-frozen-review-");
  const assetBackupRoot = path.join(repoRoot, "species-explorer", "asset-backups");
  for (const assetType of ["map", "sound"]) {
    const files = assetBackupFileNames(assetType).map((fileName) => ({ fileName, buffer: Buffer.from(`original:${fileName}`) }));
    const options = { repoRoot, assetBackupRoot, species: { safeName: "Amsel", germanName: "Amsel" }, assetType, files };
    const firstPath = await writeManagedAssetBackup(options);
    const original = await Promise.all([...files.map((file) => file.fileName), "backup.json"]
      .map((file) => readFile(path.join(repoRoot, firstPath, file))));
    const pendingPath = path.join(repoRoot, "species-explorer", "pending-asset-review.json");
    await writeFile(pendingPath, JSON.stringify({ targets: [{ safeName: "Amsel" }], reviewAssets: [] }));
    for (const choice of ["zweite Wahl", "dritte Wahl"]) {
      assert.equal(await writeManagedAssetBackup({ ...options,
        files: files.map((file) => ({ ...file, buffer: Buffer.from(`${choice}:${file.fileName}`) })),
      }), firstPath);
    }
    const retained = await Promise.all([...files.map((file) => file.fileName), "backup.json"]
      .map((file) => readFile(path.join(repoRoot, firstPath, file))));
    assert.deepEqual(retained, original, "Erster Rücknahmesatz samt Herkunft bleibt bytegleich");
    await writeFile(path.join(repoRoot, firstPath, "foreign.txt"), "fremd");
    await assert.rejects(writeManagedAssetBackup(options), /Unbekannte oder verknüpfte Dateien/);
    await rm(path.join(repoRoot, firstPath, "foreign.txt"));
    await rm(pendingPath);
  }
});

test("offene Artanlage erhält ursprüngliche Mediensicherung und stoppt bei verändertem Herkunftsbeleg", async (context) => {
  const repoRoot = await createTemporaryRepo(context, "iucn-backup-frozen-creation-");
  const assetBackupRoot = path.join(repoRoot, "species-explorer", "asset-backups");
  const options = { repoRoot, assetBackupRoot, species: { safeName: "Testvogel", germanName: "Testvogel" },
    assetType: "map", files: [{ fileName: "map.jpg", buffer: Buffer.from("original") }] };
  const firstPath = await writeManagedAssetBackup(options);
  const metadata = await readFile(path.join(repoRoot, firstPath, "backup.json"));
  await writeFile(path.join(repoRoot, "species_list.json"), "[]\n");
  const backupPath = path.join(repoRoot, "species-explorer", "backups", "own.json");
  const store = createSpeciesCreationSessionStore({ repoRoot });
  const id = await store.begin({ entry: { german: "Testvogel", genus: "Testus", species: "avis" },
    derived: { slug: "testusavis", safeName: "Testvogel" }, backupPath });
  assert.equal(await writeManagedAssetBackup({ ...options,
    files: [{ fileName: "map.jpg", buffer: Buffer.from("zweite Wahl") }] }), firstPath);
  assert.equal(await readFile(path.join(repoRoot, firstPath, "map.jpg"), "utf8"), "original");
  await writeFile(path.join(repoRoot, firstPath, "map.jpg"), "fremd geändert");
  await assert.rejects(writeManagedAssetBackup(options), /gespeicherten Artanlage-Auftrag/);
  assert.equal(await readFile(path.join(repoRoot, firstPath, "map.jpg"), "utf8"), "fremd geändert");
  await writeFile(path.join(repoRoot, firstPath, "map.jpg"), "original");
  await writeFile(path.join(repoRoot, firstPath, "backup.json"), "null");
  await assert.rejects(writeManagedAssetBackup(options), /Herkunftsangaben passen nicht/);
  await writeFile(path.join(repoRoot, firstPath, "backup.json"), metadata);
  await store.detach(id);
  await writeManagedAssetBackup({ ...options, files: [{ fileName: "map.jpg", buffer: Buffer.from("nach Abschluss") }] });
  assert.equal(await readFile(path.join(repoRoot, firstPath, "map.jpg"), "utf8"), "nach Abschluss");
});
