import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { tmpdir } from "../scripts/test-temp.mjs";
import { planStorageMigration, prepareStorageMigration, commitStorageMigration, restoreStorageMigration } from "./storage-migration.mjs";
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
  assert.equal(config.dataRoot, "Daten");
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
  assert.equal(paths.taxonomyRoot, path.join(renamed, "Daten", "taxonomy"));
  assert.equal(relocatedStoragePath(path.join(plan.sourceRoot, "data.sqlite"), { repoRoot: renamed }), path.join(paths.dataRoot, "data.sqlite"));
  assert.equal(relocatedStoragePath(path.join(plan.repoRoot, "species_list.json"), { repoRoot: renamed }), path.join(renamed, "species_list.json"));
  assert.equal(await fs.readFile(path.join(paths.dataRoot, ".storage-migration.json"), "utf8"), proof);
});

test("CLI deutet relative Speicherziele nicht stillschweigend als bestätigte absolute Pfade", async () => {
  for (const name of ["repo-root", "source-root", "target-root"]) {
    await assert.rejects(runStorageMigration(["plan", `--${name}=relative`]), /absoluten/);
  }
});
