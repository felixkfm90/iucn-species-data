import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { tmpdir } from "../scripts/test-temp.mjs";
import { planStorageMigration, prepareStorageMigration, commitStorageMigration, restoreStorageMigration, renameStorageDataDirectory } from "./storage-migration.mjs";
import { explorerStoragePaths, relocatedStoragePath } from "./storage-paths.mjs";
import { runStorageMigration } from "../scripts/storage-migration.mjs";

async function fixture(t) {
  const parent = await fs.mkdtemp(path.join(tmpdir(), "storage-move-"));
  t.after(() => fs.rm(parent, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 }));
  const repoRoot = path.join(parent, "program"), sourceRoot = path.join(parent, "legacy");
  await fs.mkdir(repoRoot); await fs.mkdir(path.join(sourceRoot, "taxonomy"), { recursive: true });
  await fs.writeFile(path.join(sourceRoot, "taxonomy", "proof.json"), '{"id":"original","revision":"unchanged"}');
  await fs.writeFile(path.join(sourceRoot, "data.sqlite"), "unchanged database bytes");
  const plan = await planStorageMigration({ repoRoot, sourceRoot });
  return { ...plan, parent };
}

test("Plan ist lesend; Freigabe, geänderter Eingang, fremdes Ziel und Platzmangel stoppen", async (t) => {
  const plan = await fixture(t);
  assert.equal(plan.files.length, 2);
  await assert.rejects(fs.access(plan.targetRoot));
  await assert.rejects(prepareStorageMigration(plan), /bestätigt/);
  await fs.writeFile(path.join(plan.sourceRoot, "new"), "new");
  await assert.rejects(prepareStorageMigration(plan, { confirmed: true }), /geändert/);
  await fs.unlink(path.join(plan.sourceRoot, "new"));
  await fs.mkdir(plan.targetRoot); await fs.writeFile(path.join(plan.targetRoot, "foreign"), "keep");
  await assert.rejects(prepareStorageMigration(plan, { confirmed: true }), /nicht leer/);
  await fs.unlink(path.join(plan.targetRoot, "foreign"));
  await assert.rejects(prepareStorageMigration(plan, { confirmed: true, minimumReserveBytes: Number.MAX_SAFE_INTEGER }), /Platz/);
});

test("kopieren, prüfen, geschlossen umziehen ohne Link, unveränderte Belege und Rückfall", async (t) => {
  const plan = await fixture(t), options = { confirmed: true, minimumReserveBytes: 0 };
  const result = await prepareStorageMigration(plan, options);
  assert.equal(result.state, "prepared");
  assert.deepEqual((await prepareStorageMigration(plan, options)).copied, result.copied);
  assert.equal((await fs.readdir(plan.sourceRoot)).length, 2);
  await assert.rejects(commitStorageMigration(plan), /geschlossen/);
  await assert.rejects(commitStorageMigration({ ...plan, consumersClosed: true, checkConsumersClosed: async () => false }), /laufen noch/);
  const closed = { consumersClosed: true, checkConsumersClosed: async () => true };
  const config = await commitStorageMigration({ ...plan, ...closed });
  assert.equal(config.dataRoot, "data");
  assert.deepEqual(await fs.readdir(plan.sourceRoot), []);
  assert.equal((await fs.lstat(plan.sourceRoot)).isSymbolicLink(), false);
  assert.equal(explorerStoragePaths({ repoRoot: plan.repoRoot }).dataRoot, plan.targetRoot);
  assert.equal(await fs.readFile(path.join(plan.targetRoot, "taxonomy", "proof.json"), "utf8"), '{"id":"original","revision":"unchanged"}');
  await commitStorageMigration({ ...plan, ...closed });
  const restored = await restoreStorageMigration({ ...plan, ...closed });
  assert.equal(restored.state, "restored");
  assert.equal(await fs.readFile(path.join(plan.sourceRoot, "data.sqlite"), "utf8"), "unchanged database bytes");
  await assert.rejects(fs.access(path.join(plan.repoRoot, "storage-path.json")));
});

test("Abbruch erhält Original und erlaubt bestätigte Wiederholung der eigenen Teilkopie", async (t) => {
  const plan = await fixture(t), controller = new AbortController();
  const options = { confirmed: true, minimumReserveBytes: 0 };
  await assert.rejects(prepareStorageMigration(plan, { ...options, signal: controller.signal,
    onProgress: (event) => { if (event.state === "verifying") controller.abort(); } }), /abort/i);
  assert.equal(await fs.readFile(path.join(plan.sourceRoot, "data.sqlite"), "utf8"), "unchanged database bytes");
  assert.equal((await prepareStorageMigration(plan, options)).state, "prepared");
});

test("Zieländerung verhindert Originalentfernung und spätere automatische Rücknahme", async (t) => {
  const plan = await fixture(t), options = { confirmed: true, minimumReserveBytes: 0 };
  await prepareStorageMigration(plan, options);
  await fs.writeFile(path.join(plan.targetRoot, "data.sqlite"), "tampered");
  await assert.rejects(commitStorageMigration({ ...plan, consumersClosed: true, checkConsumersClosed: async () => true }), /Ziel verändert/);
  assert.equal(await fs.readFile(path.join(plan.sourceRoot, "data.sqlite"), "utf8"), "unchanged database bytes");
});

test("überlappende Ziele, nicht absolute Pfade und Links sind gesperrt", async (t) => {
  const plan = await fixture(t);
  await assert.rejects(planStorageMigration({ ...plan, targetRoot: plan.sourceRoot }), /überlappend/);
  await assert.rejects(planStorageMigration({ ...plan, sourceRoot: "relative" }), /absolute/);
  const link = path.join(plan.sourceRoot, "linked");
  try { await fs.symlink(plan.repoRoot, link, "junction"); }
  catch (error) { if (["EPERM", "EACCES"].includes(error.code)) return; throw error; }
  await assert.rejects(planStorageMigration(plan), /link/);
});

test("unabhängig geänderte Konfiguration und manipulierte Umzugsbelege bleiben gesperrt", async (t) => {
  const plan = await fixture(t), closed = { consumersClosed: true, checkConsumersClosed: async () => true };
  await prepareStorageMigration(plan, { confirmed: true, minimumReserveBytes: 0 });
  const configFile = path.join(plan.repoRoot, "storage-path.json");
  await fs.writeFile(configFile, '{"foreign":true}');
  await assert.rejects(commitStorageMigration({ ...plan, ...closed }), /unabhängig geändert/);
  assert.equal(await fs.readFile(configFile, "utf8"), '{"foreign":true}');
  await fs.unlink(configFile);
  await commitStorageMigration({ ...plan, ...closed });
  const journalFile = path.join(plan.targetRoot, ".storage-migration.json");
  const original = await fs.readFile(journalFile, "utf8");
  const journal = JSON.parse(original); journal.state = "moving";
  await fs.writeFile(journalFile, JSON.stringify(journal));
  assert.throws(() => explorerStoragePaths({ repoRoot: plan.repoRoot }), /nicht vollständig/);
  await fs.writeFile(journalFile, original);
  await fs.writeFile(configFile, '{"foreign":true}');
  await assert.rejects(restoreStorageMigration({ ...plan, ...closed }), /unabhängig geändert/);
});

test("gemeinsam umbenannter Programmordner findet Daten und historische Pfade ohne Belegänderung", async (t) => {
  const plan = await fixture(t), closed = { consumersClosed: true, checkConsumersClosed: async () => true };
  await prepareStorageMigration(plan, { confirmed: true, minimumReserveBytes: 0 });
  await commitStorageMigration({ ...plan, ...closed });
  const proof = await fs.readFile(path.join(plan.targetRoot, ".storage-migration.json"), "utf8");
  const renamed = path.join(plan.parent, "Arten-Explorer");
  await fs.rename(plan.repoRoot, renamed);
  const paths = explorerStoragePaths({ repoRoot: renamed });
  assert.equal(paths.taxonomyRoot, path.join(renamed, "data", "taxonomy"));
  assert.equal(relocatedStoragePath(path.join(plan.sourceRoot, "data.sqlite"), { repoRoot: renamed }), path.join(paths.dataRoot, "data.sqlite"));
  assert.equal(relocatedStoragePath(path.join(plan.repoRoot, "species_list.json"), { repoRoot: renamed }), path.join(renamed, "species_list.json"));
  assert.equal(await fs.readFile(path.join(paths.dataRoot, ".storage-migration.json"), "utf8"), proof);
});

test("CLI deutet relative Speicherziele nicht stillschweigend als bestätigte absolute Pfade", async () => {
  for (const name of ["repo-root", "source-root", "target-root"]) {
    await assert.rejects(runStorageMigration(["plan", `--${name}=relative`]), /absoluten/);
  }
});

async function oldDirectoryFixture(t) {
  const fixturePlan = await fixture(t);
  const plan = await planStorageMigration({ ...fixturePlan, targetRoot: path.join(fixturePlan.repoRoot, "Daten") });
  await prepareStorageMigration(plan, { confirmed: true, minimumReserveBytes: 0 });
  const closed = { consumersClosed: true, checkConsumersClosed: async () => true };
  await commitStorageMigration({ ...plan, ...closed });
  return { ...plan, ...closed, confirmed: true };
}

test("Daten zu data benennt denselben Ordner um und erhält Journal, Dateien und historische Zugriffe", async (t) => {
  const options = await oldDirectoryFixture(t), from = options.targetRoot;
  const journal = await fs.readFile(path.join(from, ".storage-migration.json"));
  const before = await fs.stat(path.join(from, "data.sqlite"), { bigint: true });
  const result = await renameStorageDataDirectory(options);
  assert.equal(result.state, "renamed");
  assert.equal(result.config.dataRoot, "data");
  await assert.rejects(fs.access(from));
  assert.deepEqual(await fs.readFile(path.join(result.targetRoot, ".storage-migration.json")), journal);
  assert.equal((await fs.stat(path.join(result.targetRoot, "data.sqlite"), { bigint: true })).ino, before.ino);
  assert.equal(await fs.readFile(path.join(result.targetRoot, "data.sqlite"), "utf8"), "unchanged database bytes");
  assert.equal(explorerStoragePaths({ repoRoot: options.repoRoot }).dataRoot, result.targetRoot);
  assert.equal(relocatedStoragePath(path.join(from, "data.sqlite"), { repoRoot: options.repoRoot }), path.join(result.targetRoot, "data.sqlite"));
  await assert.rejects(renameStorageDataDirectory(options), /existiert bereits/);
});

test("Ordnerwechsel verweigert fehlende Bestätigung, aktive Verbraucher und bestehende Ziele", async (t) => {
  const options = await oldDirectoryFixture(t), configFile = path.join(options.repoRoot, "storage-path.json");
  const originalConfig = await fs.readFile(configFile, "utf8");
  await assert.rejects(renameStorageDataDirectory({ ...options, confirmed: false }), /bestätigt/);
  await assert.rejects(renameStorageDataDirectory({ ...options, checkConsumersClosed: async () => false }), /laufen noch/);
  let checks = 0;
  await assert.rejects(renameStorageDataDirectory({ ...options, checkConsumersClosed: async () => ++checks === 1 }), /vor dem Ordnerwechsel/);
  assert.equal(await fs.readFile(configFile, "utf8"), originalConfig);
  const target = path.join(options.repoRoot, "data");
  await fs.mkdir(target); await fs.writeFile(path.join(target, "foreign"), "preserve");
  await assert.rejects(renameStorageDataDirectory(options), /existiert bereits/);
  assert.equal(await fs.readFile(path.join(target, "foreign"), "utf8"), "preserve");
});

test("fehlgeschlagene Nachprüfung lässt neue Daten vollständig und Konfiguration gesperrt", async (t) => {
  const options = await oldDirectoryFixture(t);
  let checks = 0;
  await assert.rejects(renameStorageDataDirectory({ ...options, checkConsumersClosed: async () => ++checks < 3 }), /gesperrt/);
  assert.throws(() => explorerStoragePaths({ repoRoot: options.repoRoot }), /Ungültige Speicherkonfiguration/);
  assert.equal(await fs.readFile(path.join(options.repoRoot, "data", "data.sqlite"), "utf8"), "unchanged database bytes");
});

test("Umbenennungsbeleg erhält Zwischenpfade auch nach erneutem Programmordnerwechsel und sperrt Manipulation", async (t) => {
  const options = await oldDirectoryFixture(t);
  await renameStorageDataDirectory(options);
  const renamedRepo = `${options.repoRoot}-renamed`;
  await fs.rename(options.repoRoot, renamedRepo);
  const dataRoot = path.join(renamedRepo, "data");
  assert.equal(explorerStoragePaths({ repoRoot: renamedRepo }).dataRoot, dataRoot);
  assert.equal(relocatedStoragePath(path.join(options.targetRoot, "data.sqlite"), { repoRoot: renamedRepo }), path.join(dataRoot, "data.sqlite"));
  const recordFile = path.join(dataRoot, ".storage-directory-rename.json"), original = await fs.readFile(recordFile, "utf8");
  const record = JSON.parse(original); record.sourceRoot = path.join(renamedRepo, "foreign");
  await fs.writeFile(recordFile, JSON.stringify(record));
  assert.throws(() => explorerStoragePaths({ repoRoot: renamedRepo }), /Ordnerwechsel/);
  await fs.writeFile(recordFile, original);
  const journalFile = path.join(dataRoot, ".storage-migration.json");
  await fs.appendFile(journalFile, "\n");
  assert.throws(() => explorerStoragePaths({ repoRoot: renamedRepo }), /Originaler Umzugsnachweis/);
});

test("einfache relative und absolute Daten-Konfigurationen erhalten ebenfalls gebundene alte Pfade", async (t) => {
  for (const absolute of [false, true]) {
    const options = await fixture(t), sourceRoot = path.join(options.repoRoot, "Daten");
    await fs.mkdir(sourceRoot);
    await fs.writeFile(path.join(sourceRoot, "fixture.json"), "original");
    await fs.writeFile(path.join(options.repoRoot, "storage-path.json"), JSON.stringify({ schemaVersion: 1, state: "ready",
      dataRoot: absolute ? sourceRoot : "Daten" }));
    const result = await renameStorageDataDirectory({ repoRoot: options.repoRoot, confirmed: true, consumersClosed: true,
      checkConsumersClosed: async () => true });
    assert.equal(relocatedStoragePath(path.join(sourceRoot, "fixture.json"), { repoRoot: options.repoRoot }), path.join(result.targetRoot, "fixture.json"));
  }
});
