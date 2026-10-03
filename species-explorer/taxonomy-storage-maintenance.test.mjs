import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createTaxonomyStorageMaintenance } from "./taxonomy-storage-maintenance.mjs";
import { MasterRunController } from "./taxonomy-master-run-controller.mjs";
import { acquireMasterJobLock, prepareMasterJob } from "./taxonomy-master-job.mjs";
import { executeMasterJob } from "./taxonomy-master-worker.mjs";
import { assertTaxonomySpace, availableTaxonomySpace, TAXONOMY_SPACE_RESERVE } from "./taxonomy-space-budget.mjs";
import { writeTaxonomyPublication, publishTaxonomyPair, prepareTaxonomyPublication } from "./taxonomy-publication.mjs";

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
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fn-storage-"));
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 }));
  const taxonomyRoot = path.join(root, "taxonomy"), searchRoot = path.join(root, "lightroom");
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
