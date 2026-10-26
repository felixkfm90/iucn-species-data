import { tmpdir } from "../scripts/test-temp.mjs";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { createTaxonomyStorageMaintenance } from "./taxonomy-storage-maintenance.mjs";
import { MasterRunController } from "./taxonomy-master-run-controller.mjs";
import { acquireMasterJobLock, prepareMasterJob } from "./taxonomy-master-job.mjs";
import { executeMasterJob } from "./taxonomy-master-worker.mjs";
import { assertTaxonomySpace, availableTaxonomySpace, TAXONOMY_SPACE_RESERVE } from "./taxonomy-space-budget.mjs";
import { writeTaxonomyPublication, publishTaxonomyPair, prepareTaxonomyPublication } from "./taxonomy-publication.mjs";
import { relocatedStoragePath } from "./storage-paths.mjs";

const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const checksum = (value) => `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
const now = () => new Date("2026-09-20T12:00:00Z"), old = new Date("2026-09-01T12:00:00Z");
async function json(file, value) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value)); }
async function age(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) await age(child);
    else await fs.utimes(child, old, old);
  }
  await fs.utimes(directory, old, old);
}
async function fixture(t, { nestedData = false } = {}) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "fn-storage-"));
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 }));
  const dataRoot = nestedData ? path.join(root, "Daten") : root;
  const taxonomyRoot = path.join(dataRoot, "taxonomy"), searchRoot = path.join(dataRoot, "lightroom");
  const controller = new MasterRunController(taxonomyRoot);
  async function pair() {
    const id = `publication-${crypto.randomUUID()}`, masterVersion = `master-${crypto.randomUUID()}`, packageId = `package-${crypto.randomUUID()}`;
    const directories = [path.join(taxonomyRoot, "master", "releases", id), path.join(searchRoot, "releases", id)];
    await json(path.join(directories[0], "manifest.json"), { candidateId: masterVersion });
    await json(path.join(directories[1], "manifest.json"), { masterVersion, packageId });
    await fs.writeFile(path.join(directories[0], "taxonomy-master.sqlite"), "master");
    await fs.writeFile(path.join(directories[1], "taxonomy-search.sqlite"), "search");
    for (const directory of directories) await age(directory);
    return { id, directories, masterVersion, packageId, masterChecksum: checksum("master"), packageChecksum: checksum("search") };
  }
  const active = await pair(), previous = await pair(), obsolete = await pair();
  const pointer = { schemaVersion: 1, taxonomyRoot, searchRoot, active, previous };
  await writeTaxonomyPublication(taxonomyRoot, pointer);
  async function job(status = "ready", files = []) {
    const id = `job-${crypto.randomUUID()}`, directory = path.join(taxonomyRoot, "master", "build-jobs", id);
    const recipe = { schemaVersion: 1, id, taxonomyRoot, binding: { files }, inputs: {}, timestamp: old.toISOString() };
    recipe.revision = hash(recipe);
    await json(path.join(directory, "recipe.json"), recipe);
    await json(path.join(directory, "state.json"), { id, status });
    await age(directory); return { id, directory, recipe };
  }
  const service = (options = {}) => createTaxonomyStorageMaintenance({ taxonomyRoot, searchRoot, controller, now, ...options });
  return { root, taxonomyRoot, searchRoot, controller, pair, job, active, previous, obsolete, pointer, service };
}

test("Speicherplan schützt aktiven Stand und genau einen geprüften Vorgänger; benötigte Aufträge bleiben", async (t) => {
  const f = await fixture(t), required = await f.pair(), paused = await f.job("paused", [[path.join(required.directories[0], "taxonomy-master.sqlite"), "hash"]]);
  const current = await f.job(), staged = await f.job(), obsoleteJob = await f.job(), failed = await f.job("failed");
  await json(path.join(f.taxonomyRoot, "master", "build-jobs", "current.json"), { schemaVersion: 1, id: current.id });
  await json(path.join(f.taxonomyRoot, "master", "staging", "manifest.json"), { buildJobRevision: staged.recipe.revision });
  const before = await fs.readFile(path.join(f.active.directories[0], "taxonomy-master.sqlite"));
  const plan = await f.service().preview(), byId = new Map(plan.items.map((item) => [item.id, item]));
  for (const item of [f.active, f.previous, required, current, staged, paused, failed]) assert.equal(byId.get(item.id).eligible, false, item.id);
  assert.deepEqual(plan.items.filter((item) => item.eligible).map((item) => item.id).sort(), [f.obsolete.id, obsoleteJob.id].sort());
  assert.equal(plan.policy.extraPairs, 0);
  assert.deepEqual(await fs.readFile(path.join(f.active.directories[0], "taxonomy-master.sqlite")), before);
  assert.ok(plan.reclaimableBytes > 0);
});

test("Bereinigung verlangt Bestätigung und unveränderte Vorschau; entfernt nur intern abgeleitete Altstände", async (t) => {
  const f = await fixture(t), service = f.service();
  const plan = await service.preview();
  await assert.rejects(service.clean({ revision: plan.revision }), /bestätigte/);
  await fs.writeFile(path.join(f.obsolete.directories[0], "taxonomy-master.sqlite"), "changed");
  await assert.rejects(service.clean({ confirmed: true, revision: plan.revision }), /seit der Vorschau/);
  await age(f.obsolete.directories[0]);
  const fresh = await service.preview();
  const result = await service.clean({ confirmed: true, revision: fresh.revision, directories: [f.root] });
  assert.equal(result.removed.length, 1);
  assert.equal(result.failed.length, 0);
  for (const dir of f.obsolete.directories) await assert.rejects(fs.access(dir));
  for (const entry of [f.active, f.previous]) for (const dir of entry.directories) await fs.access(dir);
  await assert.rejects(service.clean({ confirmed: true, revision: fresh.revision }), /seit der Vorschau/);
});

test("Fehlender oder beschädigter Rückweg gibt keine alten Datenbankpaare frei", async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.previous.directories[1], "taxonomy-search.sqlite"), "corrupt");
  let plan = await f.service().preview();
  assert.equal(plan.items.some((item) => item.kind === "pair" && item.eligible), false);
  assert.match(plan.warnings.join(), /unvollständig oder verändert/);
  await writeTaxonomyPublication(f.taxonomyRoot, { ...f.pointer, previous: null });
  plan = await f.service().preview();
  assert.match(plan.warnings.join(), /Kein gemeinsamer Vorgänger/);
});

test("Unklare Rezepte und fremde Dateien werden nicht gelöscht; ihre Paarabhängigkeiten bleiben geschützt", async (t) => {
  const f = await fixture(t), job = await f.job();
  await json(path.join(job.directory, "recipe.json"), { ...job.recipe, id: "../fremd" });
  const plan = await f.service().preview();
  assert.equal(plan.items.some((item) => item.eligible), false);
  const fresh = await fixture(t);
  await fs.writeFile(path.join(fresh.obsolete.directories[0], "meine-notizen.txt"), "nicht löschen");
  await age(fresh.obsolete.directories[0]);
  assert.match((await fresh.service().preview()).items.find((row) => row.id === fresh.obsolete.id).reason, /nicht vom Aufbau/);
});

async function historicalStorageFixture(t) {
  const f = await fixture(t, { nestedData: true });
  const sourceRoot = path.join(f.root, "old-data"), previousRepoRoot = path.join(f.root, "old-program");
  const plan = { schemaVersion: 1, repoRoot: previousRepoRoot, sourceRoot,
    targetRoot: path.join(previousRepoRoot, "Daten"), files: [], totalBytes: 0 };
  plan.revision = hash(plan);
  const journalFile = path.join(f.root, "Daten", ".storage-migration.json");
  const journal = { schemaVersion: 1, state: "committed", plan, copied: [] };
  await json(journalFile, journal);
  await json(path.join(f.root, "storage-path.json"), { schemaVersion: 1, state: "ready", dataRoot: "Daten",
    legacyDataRoot: sourceRoot, previousRepoRoot, migrationRevision: plan.revision });
  const required = await f.pair();
  const historicalFile = path.join(sourceRoot, "taxonomy", "master", "releases", required.id, "taxonomy-master.sqlite");
  const job = await f.job("paused", [[historicalFile, "original-checksum"]]);
  const recipe = { ...job.recipe, taxonomyRoot: path.join(sourceRoot, "taxonomy"), revision: undefined };
  recipe.revision = hash(recipe);
  const recipeFile = path.join(job.directory, "recipe.json");
  await json(recipeFile, recipe);
  await age(job.directory);
  const relocatePath = (filename) => relocatedStoragePath(filename, { repoRoot: f.root });
  return { ...f, sourceRoot, required, job, recipe, recipeFile, journal, journalFile, relocatePath };
}

test("Verifiziert umgezogene Originalrezepte schützen gebundene Paare ohne pauschale Sperre; Originalbytes bleiben", async (t) => {
  const f = await historicalStorageFixture(t);
  const before = await fs.readFile(f.recipeFile);
  const plan = await f.service({ relocatePath: f.relocatePath }).preview();
  const byId = new Map(plan.items.map((row) => [row.id, row]));
  assert.equal(byId.get(f.job.id).reason, "Offener oder möglicherweise fortsetzbarer Auftrag");
  assert.equal(byId.get(f.required.id).eligible, false);
  assert.equal(byId.get(f.obsolete.id).eligible, true);
  assert.deepEqual(await fs.readFile(f.recipeFile), before);
  assert.equal(JSON.parse(before).revision, f.recipe.revision);
});

test("Unbekannte historische Wurzel, verändertes Rezept und beschädigter Umzugsbeleg schützen sämtliche Paare", async (t) => {
  for (const change of ["unknown-root", "foreign-prefix", "changed-recipe", "changed-journal"]) await t.test(change, async (t) => {
    const f = await historicalStorageFixture(t);
    if (change === "changed-journal") await json(f.journalFile, { ...f.journal, state: "prepared" });
    else {
      const recipe = { ...f.recipe, taxonomyRoot: path.join(`${f.sourceRoot}${change === "foreign-prefix" ? "-foreign" : "-unknown"}`, "taxonomy") };
      if (change !== "changed-recipe") recipe.revision = hash({ ...recipe, revision: undefined });
      await json(f.recipeFile, recipe);
    }
    const before = await fs.readFile(f.recipeFile);
    const plan = await f.service({ relocatePath: f.relocatePath }).preview();
    assert.equal(plan.items.some((row) => row.kind === "pair" && row.eligible), false);
    assert.match(plan.items.find((row) => row.id === f.job.id).reason, /Unvollständiges Auftragsrezept/);
    assert.deepEqual(await fs.readFile(f.recipeFile), before);
  });
});

test("Offener Auftrag schützt transitiv Originalrezepte und Eingänge fertiger Altaufträge sowie deren Paare", async (t) => {
  const f = await fixture(t), requiredPair = await f.pair();
  const original = await f.job("ready", [[path.join(requiredPair.directories[0], "taxonomy-master.sqlite"), "pair-checksum"]]);
  await fs.writeFile(path.join(original.directory, "col.jsonl"), "unersetzbarer Originaleingang\n");
  await age(original.directory);
  const intermediate = await f.job("ready", [[path.join(original.directory, "recipe.json"), "original-checksum"]]);
  const failed = await f.job("failed", [[path.join(intermediate.directory, "recipe.json"), "intermediate-checksum"]]);
  const unbound = await f.job();
  const plan = await f.service().preview(), byId = new Map(plan.items.map((row) => [row.id, row]));
  for (const entry of [original, intermediate, failed, requiredPair]) assert.equal(byId.get(entry.id).eligible, false, entry.id);
  assert.match(byId.get(original.id).reason, /geschützten Aufbauauftrag/);
  assert.equal(byId.get(unbound.id).eligible, true);
  const originalBytes = await fs.readFile(path.join(original.directory, "col.jsonl"));
  const result = await f.service().clean({ confirmed: true, revision: plan.revision });
  assert.ok(result.removed.some((row) => row.id === unbound.id));
  assert.deepEqual(await fs.readFile(path.join(original.directory, "col.jsonl")), originalBytes);
});

test("Zyklische fertige Aufträge bleiben geschützt, ohne unverknüpfte abgeschlossene Eingänge dauerhaft zu sperren", async (t) => {
  const f = await fixture(t), first = await f.job(), second = await f.job(), unbound = await f.job();
  for (const [job, dependency] of [[first, second], [second, first]]) {
    const recipe = { ...job.recipe, binding: { files: [[path.join(dependency.directory, "recipe.json"), "checksum"]] }, revision: undefined };
    recipe.revision = hash(recipe);
    await json(path.join(job.directory, "recipe.json"), recipe);
    await age(job.directory);
  }
  const plan = await f.service().preview(), byId = new Map(plan.items.map((row) => [row.id, row]));
  for (const job of [first, second]) {
    assert.equal(byId.get(job.id).eligible, false);
    assert.match(byId.get(job.id).reason, /Zyklische Auftragsabhängigkeit/);
  }
  assert.equal(byId.get(unbound.id).eligible, true);
});

test("Eigene Auftragseingänge sind kein Zyklus; fremder UUID-Pfad entsichert keine Aufträge", async (t) => {
  for (const foreign of [false, true]) await t.test(String(foreign), async (t) => {
    const f = await fixture(t), job = await f.job();
    const input = path.join(foreign ? path.join(f.root, "foreign", job.id) : job.directory, "col.jsonl");
    const recipe = { ...job.recipe, binding: { files: [[input, "checksum"]] }, revision: undefined };
    recipe.revision = hash(recipe);
    await json(path.join(job.directory, "recipe.json"), recipe);
    await age(job.directory);
    const plan = await f.service().preview();
    assert.equal(plan.items.find((row) => row.id === job.id).eligible, !foreign);
    if (foreign) assert.equal(plan.items.some((row) => row.eligible), false);
  });
});

test("Windows-Pfadalias eines benötigten Originalauftrags wird nicht als ungebunden behandelt", async (t) => {
  const f = await fixture(t), required = await f.job(), unbound = await f.job(), requiredPair = await f.pair();
  const original = path.join(required.directory, "recipe.json");
  const alias = process.platform === "win32" ? original.toUpperCase() : original;
  const pairInput = path.join(requiredPair.directories[0], "taxonomy-master.sqlite");
  const pairAlias = process.platform === "win32" ? pairInput.toUpperCase() : pairInput;
  await fs.access(alias);
  await fs.access(pairAlias);
  await f.job("failed", [[alias, "checksum"], [pairAlias, "checksum"]]);
  const byId = new Map((await f.service().preview()).items.map((row) => [row.id, row]));
  assert.equal(byId.get(required.id).eligible, false);
  assert.equal(byId.get(requiredPair.id).eligible, false);
  assert.equal(byId.get(unbound.id).eligible, true);
  assert.equal(byId.get(f.obsolete.id).eligible, true);
});

test("Quellenreparaturbeleg schützt seinen Auftrag; geänderter Beleg invalidiert den Bereinigungsplan", async (t) => {
  const f = await fixture(t), required = await f.job(), unbound = await f.job();
  const file = path.join(f.taxonomyRoot, "master", "source-recovery", "transfers", "proof.json");
  const proof = { schemaVersion: 1, kind: "source-recovery-candidate", state: "ready",
    jobId: required.id, jobRevision: required.recipe.revision };
  await json(file, { ...proof, checksum: hash(proof) });
  const plan = await f.service().preview(), byId = new Map(plan.items.map((row) => [row.id, row]));
  assert.equal(byId.get(required.id).eligible, false);
  assert.equal(byId.get(unbound.id).eligible, true);
  await json(file, { schemaVersion: 1, state: "ready", jobId: unbound.id, changed: true });
  await assert.rejects(f.service().clean({ confirmed: true, revision: plan.revision }), /seit der Vorschau/);
  await fs.access(path.join(required.directory, "recipe.json"));
});

test("Veränderte Reparaturprüfsumme oder Auftragsrevision schützt alle Jobs und Paare", async (t) => {
  for (const change of ["checksum", "missing-checksum", "job-revision"]) await t.test(change, async (t) => {
    const f = await fixture(t), required = await f.job(), unbound = await f.job();
    const body = { schemaVersion: 1, kind: "source-recovery-candidate", state: "ready",
      jobId: required.id, jobRevision: change === "job-revision" ? "changed" : required.recipe.revision };
    const proof = { ...body, checksum: hash(body) };
    if (change === "checksum") proof.jobId = unbound.id;
    if (change === "missing-checksum") delete proof.checksum;
    await json(path.join(f.taxonomyRoot, "master", "source-recovery", "transfers", "proof.json"), proof);
    const plan = await f.service().preview();
    assert.equal(plan.items.some((row) => row.eligible), false);
    assert.ok(plan.warnings.length);
  });
});

test("Gesicherter Reparaturkandidat schützt seinen Originalauftrag über die Buildrevision", async (t) => {
  const f = await fixture(t), required = await f.job(), unbound = await f.job();
  await json(path.join(f.taxonomyRoot, "master", "source-recovery", "retained-candidates", "recovery", "manifest.json"), {
    schemaVersion: 4, candidateId: "historical-master", buildJobRevision: required.recipe.revision,
  });
  const plan = await f.service().preview(), byId = new Map(plan.items.map((row) => [row.id, row]));
  assert.equal(byId.get(required.id).eligible, false);
  assert.equal(byId.get(unbound.id).eligible, true);
});

test("Unlesbarer Status, aktueller Zeiger oder Quellenreparaturbeleg erlaubt keine Bereinigung", async (t) => {
  for (const change of ["state", "current", "source-recovery"]) await t.test(change, async (t) => {
    const f = await fixture(t), job = await f.job(), unbound = await f.job();
    const file = change === "state" ? path.join(job.directory, "state.json") : change === "current"
      ? path.join(f.taxonomyRoot, "master", "build-jobs", "current.json")
      : path.join(f.taxonomyRoot, "master", "source-recovery", "transfers", "proof.json");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "unlesbar");
    if (change === "current") await assert.rejects(f.service().preview(), SyntaxError);
    else assert.equal((await f.service().preview()).items.some((row) => row.eligible), false);
    await fs.access(path.join(unbound.directory, "recipe.json"));
  });
});

test("Fehlende, manipulierte oder unlesbare Auftragsbindung schützt auch fertige Altaufträge und Paare", async (t) => {
  for (const change of ["missing-job", "changed-binding", "malformed-binding", "unreadable-recipe"]) await t.test(change, async (t) => {
    const f = await fixture(t), needed = await f.job(), failed = await f.job("failed");
    const file = path.join(failed.directory, "recipe.json");
    const recipe = { ...failed.recipe, revision: undefined,
      binding: { files: [[path.join(needed.directory, "recipe.json"), "checksum"]] } };
    if (change === "missing-job") recipe.binding.files[0][0] = path.join(path.dirname(needed.directory), `job-${crypto.randomUUID()}`, "recipe.json");
    if (change === "malformed-binding") recipe.binding.files = [null];
    recipe.revision = hash(recipe);
    if (change === "changed-binding") recipe.binding.files = [];
    if (change === "unreadable-recipe") await fs.writeFile(file, "unlesbar");
    else await json(file, recipe);
    await age(failed.directory);
    const plan = await f.service().preview();
    assert.equal(plan.items.some((row) => row.eligible), false);
    await fs.access(path.join(needed.directory, "recipe.json"));
  });
});

test("Laufende Master-/Paarprozesse und Kontrollsperren verhindern Speicherpflege", async (t) => {
  const f = await fixture(t);
  for (const kind of ["execution", "control"]) {
    const unlock = await acquireMasterJobLock(f.taxonomyRoot, kind);
    try { await assert.rejects(f.service().preview(), /aktiv/); }
    finally { unlock(); }
  }
  assert.ok((await f.service().preview()).items.length);
});

test("Verknüpfte Speicherwurzeln und Unterordner können nicht als Löschziele benutzt werden", async (t) => {
  const f = await fixture(t), link = path.join(f.root, "linked");
  await fs.symlink(f.taxonomyRoot, link, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(f.service({ taxonomyRoot: link }).preview(), /verknüpfte/);
  await fs.symlink(f.active.directories[0], path.join(f.obsolete.directories[0], "outside"), process.platform === "win32" ? "junction" : "dir");
  const plan = await f.service().preview();
  assert.equal(plan.items.find((row) => row.id === f.obsolete.id).eligible, false);
});

test("Nur gekennzeichnete alte Vorbereitungen sind bereinigbar; Windows-Dateisperre wird als Teilergebnis gemeldet", async (t) => {
  const f = await fixture(t), id = `publication-${crypto.randomUUID()}`, work = path.join(f.searchRoot, `.${id}`);
  await json(path.join(work, "preparation.json"), { schemaVersion: 1, id, taxonomyRoot: f.taxonomyRoot, searchRoot: f.searchRoot });
  await age(work);
  const service = f.service({ remove: async () => { throw new Error("Datei wird verwendet"); } });
  const plan = await service.preview();
  assert.equal(plan.items.find((row) => row.id === id).eligible, true);
  const result = await service.clean({ confirmed: true, revision: plan.revision });
  assert.equal(result.removed.length, 0);
  assert.equal(result.failed.length, 2);
  assert.equal(result.freedBytes, 0);
  await fs.access(work);
});

test("Teilweise entfernte alte Paare zählen entfernte Bytes und sind nur nach frischer Vorschau wiederholbar", async (t) => {
  const f = await fixture(t), [master, search] = f.obsolete.directories;
  const masterBytes = (await fs.stat(path.join(master, "taxonomy-master.sqlite"))).size
    + (await fs.stat(path.join(master, "manifest.json"))).size;
  const service = f.service({ remove: async (directory) => {
    assert.ok(f.obsolete.directories.includes(directory));
    if (directory === search) throw new Error("Paketdatei wird verwendet");
    await fs.rm(directory, { recursive: true, force: false });
  } });
  const plan = await service.preview();
  const partial = await service.clean({ confirmed: true, revision: plan.revision });
  assert.equal(partial.removed.length, 0);
  assert.equal(partial.failed.length, 1);
  assert.equal(partial.freedBytes, masterBytes);
  assert.equal(partial.failed[0].freedBytes, masterBytes);
  await assert.rejects(fs.access(master));
  await fs.access(search);
  const retry = f.service(), fresh = await retry.preview();
  assert.equal(fresh.items.find((row) => row.id === f.obsolete.id).eligible, true);
  await assert.rejects(retry.clean({ confirmed: true, revision: plan.revision }), /seit der Vorschau/);
  await assert.rejects(retry.clean({ revision: fresh.revision }), /bestätigte/);
  const finished = await retry.clean({ confirmed: true, revision: fresh.revision });
  assert.equal(finished.removed.length, 1);
  assert.equal(finished.failed.length, 0);
  assert.ok(finished.freedBytes > 0);
  await assert.rejects(fs.access(search));
  for (const entry of [f.active, f.previous]) for (const directory of entry.directories) await fs.access(directory);
});

test("Bereinigungsquittung gibt veränderte Restdateien und inzwischen geschützte Paare nicht frei", async (t) => {
  const f = await fixture(t), [master, search] = f.obsolete.directories;
  const service = f.service({ remove: async (directory) => {
    assert.ok(f.obsolete.directories.includes(directory));
    if (directory === search) throw new Error("Paketdatei wird verwendet");
    await fs.rm(directory, { recursive: true, force: false });
  } });
  const plan = await service.preview();
  await service.clean({ confirmed: true, revision: plan.revision });
  await fs.writeFile(path.join(search, "taxonomy-search.sqlite"), "changed");
  const changed = await f.service().preview();
  assert.equal(changed.items.find((row) => row.id === f.obsolete.id).eligible, false);
  await writeTaxonomyPublication(f.taxonomyRoot, { ...f.pointer, previous: f.obsolete });
  const protectedPlan = await f.service().preview();
  assert.equal(protectedPlan.items.find((row) => row.id === f.obsolete.id).eligible, false);
  assert.ok(protectedPlan.warnings.length > 0);
  await assert.rejects(fs.access(master));
  await fs.access(search);
});

test("Teilweise Dateilöschung wird gezählt und setzt nur den belegten unveränderten Rest fort", async (t) => {
  const f = await fixture(t), [master, search] = f.obsolete.directories;
  const removedManifestBytes = (await fs.stat(path.join(search, "manifest.json"))).size;
  const plan = await f.service().preview(), row = plan.items.find((entry) => entry.id === f.obsolete.id);
  const service = f.service({ remove: async (directory) => {
    assert.ok(f.obsolete.directories.includes(directory));
    if (directory === search) {
      await fs.unlink(path.join(search, "manifest.json"));
      throw new Error("Restdatei wird verwendet");
    }
    await fs.rm(directory, { recursive: true, force: false });
  } });
  const partial = await service.clean({ confirmed: true, revision: plan.revision });
  assert.equal(partial.freedBytes, row.snapshots[0].bytes + removedManifestBytes);
  const retry = f.service(), fresh = await retry.preview();
  assert.equal(fresh.items.find((entry) => entry.id === f.obsolete.id).eligible, true);
  const finished = await retry.clean({ confirmed: true, revision: fresh.revision });
  assert.equal(partial.freedBytes + finished.freedBytes, row.bytes);
  for (const directory of [master, search]) await assert.rejects(fs.access(directory));
});

test("Neue Schutzabhängigkeit sperrt auch einen unveränderten belegten Bereinigungsrest", async (t) => {
  const f = await fixture(t), [master, search] = f.obsolete.directories;
  const service = f.service({ remove: async (directory) => {
    assert.ok(f.obsolete.directories.includes(directory));
    if (directory === search) throw new Error("Paketdatei wird verwendet");
    await fs.rm(directory, { recursive: true, force: false });
  } });
  const plan = await service.preview();
  await service.clean({ confirmed: true, revision: plan.revision });
  await f.job("paused", [[path.join(search, "taxonomy-search.sqlite"), "hash"]]);
  const protectedPlan = await f.service().preview();
  const retained = protectedPlan.items.find((row) => row.id === f.obsolete.id);
  assert.equal(retained.eligible, false);
  assert.match(retained.reason, /Auftrag benötigt/);
  await assert.rejects(fs.access(master));
  await fs.access(search);
});

test("Unbelegter oder manipulierter Paarrest bleibt gesperrt; keine pauschale Waisenbereinigung", async (t) => {
  const f = await fixture(t), [master, search] = f.obsolete.directories;
  await fs.rm(master, { recursive: true, force: false });
  let plan = await f.service().preview();
  assert.equal(plan.items.find((row) => row.id === f.obsolete.id).eligible, false);
  await json(path.join(f.taxonomyRoot, "master", "storage-cleanups", `${f.obsolete.id}.json`), {
    schemaVersion: 1, kind: "pair", id: f.obsolete.id, taxonomyRoot: f.taxonomyRoot,
    searchRoot: f.searchRoot, revision: "guessed", snapshots: [],
  });
  plan = await f.service().preview();
  assert.equal(plan.items.find((row) => row.id === f.obsolete.id).eligible, false);
  await fs.access(search);
});

test("Speicherreserve und Größenabschätzung sperren bei Platzmangel oder unlesbarem Laufwerk", async () => {
  const available = async () => TAXONOMY_SPACE_RESERVE + 10;
  assert.equal((await assertTaxonomySpace("unused", 10, { available })).requiredBytes, TAXONOMY_SPACE_RESERVE + 10);
  await assert.rejects(assertTaxonomySpace("unused", 11, { available }), /Zu wenig freier Speicher/);
  await assert.rejects(assertTaxonomySpace("unused", -1), /Ungültige/);
  await assert.rejects(availableTaxonomySpace("unused", { statfs: async () => ({ bavail: NaN, bsize: 1 }) }), /nicht zuverlässig/);
});

test("Platzmangel vor Spooling und Kandidatenbau erhält aktiven Master sowie erneut nutzbaren Auftrag", async (t) => {
  const f = await fixture(t);
  const checkSpace = async () => { throw new Error("Zu wenig freier Speicher"); };
  await assert.rejects(prepareMasterJob({ taxonomyRoot: f.taxonomyRoot, checkSpace }), /Zu wenig/);
  assert.deepEqual((await fs.readdir(path.join(f.taxonomyRoot, "master", "build-jobs")).catch(() => [])).filter((name) => name.startsWith("job-")), []);
  const job = await prepareMasterJob({ taxonomyRoot: f.taxonomyRoot, colRecords: [], providerSlices: [], now });
  await assert.rejects(executeMasterJob({ taxonomyRoot: f.taxonomyRoot, id: job.id, checkSpace }), /Zu wenig/);
  await fs.access(path.join(job.directory, "recipe.json"));
  assert.equal(JSON.parse(await fs.readFile(path.join(job.directory, "state.json"))).status, "failed");
  assert.equal(await fs.readFile(path.join(f.active.directories[0], "taxonomy-master.sqlite"), "utf8"), "master");
});

test("Platzmangel während des Spoolings entfernt nur den eigenen unfertigen Auftrag", async (t) => {
  const f = await fixture(t), retained = await f.job("paused");
  let checks = 0;
  await assert.rejects(prepareMasterJob({ taxonomyRoot: f.taxonomyRoot, colRecords: [{ scientificName: "Perdix perdix" }],
    checkSpace: async () => { if (++checks === 2) throw new Error("Zu wenig freier Speicher"); } }), /Zu wenig/);
  const jobs = (await fs.readdir(path.dirname(retained.directory))).filter((name) => name.startsWith("job-"));
  assert.deepEqual(jobs, [retained.id]);
  await fs.access(path.join(retained.directory, "recipe.json"));
});

test("Platzmangel vor Paarvorbereitung ändert keinen Aktivzeiger und gibt die Prozesssperre frei", async (t) => {
  const f = await fixture(t);
  const before = await fs.readFile(path.join(f.root, "taxonomy-publication", "active.json"));
  await assert.rejects(publishTaxonomyPair({ taxonomyRoot: f.taxonomyRoot, searchRoot: f.searchRoot, confirmed: true,
    sourceSlot: "active", prepare: (options) => prepareTaxonomyPublication({ ...options,
      checkSpace: async () => { throw new Error("Zu wenig freier Speicher"); } }) }), /Zu wenig/);
  assert.deepEqual(await fs.readFile(path.join(f.root, "taxonomy-publication", "active.json")), before);
  assert.ok((await f.service().preview()).items.length);
});
