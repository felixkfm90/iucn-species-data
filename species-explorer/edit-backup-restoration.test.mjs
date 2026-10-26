import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { createEditableFixture } from "./server-test-fixtures.mjs";
import { createSpeciesEditOperations } from "./species-edit.mjs";
import { createTaxonomyEditOperations } from "./taxonomy-edit.mjs";
import { createEditBackupRestorationOperations } from "./edit-backup-restoration.mjs";

const id = "turdusmerula";
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
const hashText = (value) => createHash("sha256").update(value).digest("hex");
const automaticFields = { Kingdom: "Animalia", Phylum: "Chordata", Subphylum: "", Class: "Aves", Order: "Passeriformes", Family: "Turdidae" };

async function fixture(t, options = {}) {
  const repoRoot = await createEditableFixture();
  t.after(() => rm(repoRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 }));
  const speciesListPath = join(repoRoot, "species_list.json");
  const speciesDataPath = join(repoRoot, "speciesData.json");
  const backupDir = join(repoRoot, "species-explorer", "backups");
  const taxonomyOverridesPath = join(repoRoot, "taxonomy-overrides.json");
  await mkdir(backupDir, { recursive: true });
  await writeFile(taxonomyOverridesPath, jsonText({ version: 1, species: {} }));
  const input = JSON.parse(await readFile(speciesListPath, "utf8"));
  input.push({ german: "Bachstelze", english: "White Wagtail", genus: "Motacilla", species: "alba", size: "18 cm", weight: "20 g", life_expectancy: "2 Jahre", custom: "heutiger Fremdwert" });
  input[0].custom = "heutiger Zusatz";
  await writeFile(speciesListPath, jsonText(input));
  const generated = JSON.parse(await readFile(speciesDataPath, "utf8"));
  generated.push({ URLSlug: "motacillaalba", "Deutscher Name": "Bachstelze", "Wissenschaftlicher Name": "Motacilla alba", Genus: "Motacilla", Species: "alba", ...automaticFields });
  await writeFile(speciesDataPath, jsonText(generated));
  const previewTokens = new Map();
  function getModel() {
    const current = JSON.parse(readFileSync(speciesListPath, "utf8"));
    return { species: current.map((row) => ({ id: `${row.genus}${row.species}`.toLowerCase(), germanName: row.german, englishName: row.english,
      scientificName: `${row.genus} ${row.species}`, safeName: row.german, taxonomy: { genus: row.genus, species: row.species }, inInput: true, inGenerated: true })), summary: {}, validation: {} };
  }
  const cleanupPreviewTokens = () => {
    for (const [token, record] of previewTokens) if (record.expiresAt <= Date.now()) previewTokens.delete(token);
  };
  let failWrite = null;
  const writeJsonAtomic = async (path, value) => {
    await writeFile(`${path}.fixture-next`, jsonText(value));
    await rename(`${path}.fixture-next`, path);
    if (failWrite === path) throw new Error("isolierter Schreibfehler nach Dateitausch");
  };
  const deps = { repoRoot, speciesListPath, speciesDataPath, backupDir, taxonomyOverridesPath, previewTokens, previewTokenTtlMs: 60000,
    cleanupPreviewTokens, getModel, refreshModel: async () => getModel(), hashText, compactTimestamp: () => "20261010T120000Z", writeJsonAtomic,
    assetOverridesPath: join(repoRoot, "asset-overrides.json"), assessmentIdsPath: join(repoRoot, "assessment-ids.json"),
    manualMapOverridesPath: join(repoRoot, "docs", "manual-map-overrides.md"),
    readJson: async (path) => JSON.parse(await readFile(path, "utf8")), writeTextAtomic: writeFile };
  const speciesOps = createSpeciesEditOperations(deps);
  const taxonomyOps = createTaxonomyEditOperations(deps);
  const service = createEditBackupRestorationOperations({ ...deps, ...speciesOps, ...taxonomyOps, ...options });
  const backup = async (kind, stamp, value) => {
    const backupId = `${kind === "species" ? "species_list" : "taxonomy"}-${stamp}-Amsel-aabbccdd.json`;
    await writeFile(join(backupDir, backupId), typeof value === "string" ? value : jsonText(value));
    return backupId;
  };
  const taxonomyBackup = (fields, override = true) => ({ version: 1, species: { id, germanName: "Amsel", scientificName: "Turdus merula" }, generatedTaxonomy: structuredClone(fields),
    override: override ? { fields: structuredClone(fields), automaticFields: structuredClone(automaticFields), reason: "Damals fachlich geprüft", updatedAt: "2026-10-01T12:00:00.000Z" } : null, createdAt: "2026-10-01T12:00:00.000Z" });
  return { ...deps, ...speciesOps, ...taxonomyOps, service, input, generated, backup, taxonomyBackup, failOn: (path) => { failWrite = path; } };
}

test("zwei datierte Artenlistenstände gezielt auswählen, nur passende Eingabefelder wiederherstellen", async (t) => {
  const f = await fixture(t);
  const old = structuredClone(f.input); old[0].size = "21 cm"; old[0].english = "Old English name"; old[1].weight = "veralteter Fremdwert";
  const older = structuredClone(old); older[0].size = "19 cm";
  const olderId = await f.backup("species", "20261001T100000Z", older);
  const oldId = await f.backup("species", "20261002T100000Z", old);
  const beforeGenerated = await readFile(f.speciesDataPath, "utf8");
  const beforeMedia = await readFile(join(f.repoRoot, "species-assets", "Amsel", "sound.mp3"));
  const list = await f.service.listEditBackups(id);
  assert.deepEqual(list.backups.map((row) => row.backupId), [oldId, olderId]);
  assert.equal(list.backups.every((row) => row.available && row.unavailableReason === null), true);
  assert.deepEqual(list.species, { id, germanName: "Amsel", scientificName: "Turdus merula" });
  const p = await f.service.previewEditBackupRestoration(id, { kind: "species", backupId: olderId });
  assert.equal(p.backup.backupId, olderId);
  assert.deepEqual(p.changes.find((row) => row.key === "size"), { key: "size", label: "Größe", before: "ca. 23,5-29 cm", after: "19 cm" });
  assert.equal(p.changes.some((row) => ["germanName", "scientificName", "urlSlug"].includes(row.key)), false);
  const saved = await f.service.saveEditBackupRestoration(id, { token: p.token });
  assert.equal(saved.ok, true);
  const current = JSON.parse(await readFile(f.speciesListPath, "utf8"));
  assert.equal(current[0].size, "19 cm"); assert.equal(current[0].english, "Old English name");
  assert.equal(current[0].custom, "heutiger Zusatz"); assert.deepEqual(current[1], f.input[1]);
  const expectedGenerated = JSON.parse(beforeGenerated); expectedGenerated[0]["Englischer Name"] = "Old English name";
  assert.deepEqual(JSON.parse(await readFile(f.speciesDataPath, "utf8")), expectedGenerated);
  assert.deepEqual(await readFile(join(f.repoRoot, "species-assets", "Amsel", "sound.mp3")), beforeMedia);
  assert.deepEqual(JSON.parse(await readFile(join(f.repoRoot, saved.backup), "utf8")), f.input);
  await assert.rejects(f.service.saveEditBackupRestoration(id, { token: p.token }), /ungültig|abgelaufen/);
});

test("Vorschau und Nicht-Speichern verändern keine Quelldatei oder Sicherung", async (t) => {
  const f = await fixture(t); const old = structuredClone(f.input); old[0].weight = "70 g";
  const backupId = await f.backup("species", "20261001T100000Z", old);
  const before = await readFile(f.speciesListPath, "utf8"); const backupBefore = await readFile(join(f.backupDir, backupId), "utf8");
  await f.service.previewEditBackupRestoration(id, { kind: "species", backupId });
  assert.equal(await readFile(f.speciesListPath, "utf8"), before);
  assert.equal(await readFile(join(f.backupDir, backupId), "utf8"), backupBefore);
});

test("historische manuelle Taxonomie erhält heutige automatische Basis und alle fremden Felder", async (t) => {
  const f = await fixture(t);
  const currentAutomatic = { ...automaticFields, Family: "Heutige Automatische Familie" };
  const currentManual = { ...automaticFields, Family: "Heutige Manuelle Familie" };
  f.generated[0] = { ...f.generated[0], ...currentManual };
  await writeFile(f.speciesDataPath, jsonText(f.generated));
  const otherOverride = { fields: automaticFields, automaticFields, reason: "Fremdart heute", updatedAt: "2026-10-09T12:00:00Z" };
  await writeFile(f.taxonomyOverridesPath, jsonText({ version: 1, species: {
    [id]: { fields: currentManual, automaticFields: currentAutomatic, reason: "Heutiger Grund", updatedAt: "2026-10-09T12:00:00Z" }, motacillaalba: otherOverride,
  } }));
  const oldFields = { ...automaticFields, Family: "Frühere Familie" };
  const backupId = await f.backup("taxonomy", "20261001T120000Z", f.taxonomyBackup(oldFields));
  const p = await f.service.previewEditBackupRestoration(id, { kind: "taxonomy", backupId });
  assert.deepEqual(p.changes.find((row) => row.key === "Family"), { key: "Family", label: "Familie", before: "Heutige Manuelle Familie", after: "Frühere Familie" });
  assert.equal(p.warnings.some((warning) => warning.includes("heutige automatische Vergleichsbasis")), true);
  const saved = await f.service.saveEditBackupRestoration(id, { token: p.token });
  assert.equal(saved.ok, true);
  const registry = JSON.parse(await readFile(f.taxonomyOverridesPath, "utf8"));
  assert.deepEqual(registry.species[id].automaticFields, currentAutomatic);
  assert.equal(registry.species[id].fields.Family, "Frühere Familie");
  assert.match(registry.species[id].reason, /Wiederherstellung vom 2026-10-01.*Damals fachlich geprüft/);
  assert.deepEqual(registry.species.motacillaalba, otherOverride);
  const current = JSON.parse(await readFile(f.speciesDataPath, "utf8"));
  assert.equal(current[0].Family, "Frühere Familie");
  assert.deepEqual(current[1], f.generated[1]);
  for (const [key, value] of Object.entries(f.generated[0])) if (!Object.hasOwn(automaticFields, key)) assert.equal(current[0][key], value);
  const original = JSON.parse(await readFile(join(f.repoRoot, saved.backup), "utf8"));
  assert.equal(original.generatedTaxonomy.Family, "Heutige Manuelle Familie");
});

test("historischer Stand ohne Override aktiviert die heutige Automatik statt alter Feldwerte", async (t) => {
  const f = await fixture(t);
  const manual = { ...automaticFields, Family: "Manuelle Familie" };
  const automatic = { ...automaticFields, Family: "Heutige Automatische Familie" };
  f.generated[0] = { ...f.generated[0], ...manual };
  await writeFile(f.speciesDataPath, jsonText(f.generated));
  await writeFile(f.taxonomyOverridesPath, jsonText({ version: 1, species: { [id]: { fields: manual, automaticFields: automatic, reason: "Manuelle Prüfung", updatedAt: "2026-10-09T12:00:00Z" } } }));
  const backupId = await f.backup("taxonomy", "20261001T120000Z", f.taxonomyBackup({ ...automaticFields, Family: "Alte automatische Familie" }, false));
  const p = await f.service.previewEditBackupRestoration(id, { kind: "taxonomy", backupId });
  assert.equal(p.changes.find((row) => row.key === "Family").after, "Heutige Automatische Familie");
  assert.equal(p.warnings.some((warning) => warning.includes("damalige automatische Werte werden nicht zurückgespielt")), true);
  const saved = await f.service.saveEditBackupRestoration(id, { token: p.token });
  assert.equal(saved.restoredAutomatic, true);
  assert.equal(JSON.parse(await readFile(f.speciesDataPath, "utf8"))[0].Family, "Heutige Automatische Familie");
  assert.equal(Object.hasOwn(JSON.parse(await readFile(f.taxonomyOverridesPath, "utf8")).species, id), false);
});

test("automatischer historischer Stand ist bei bereits aktiver Automatik begründet nicht auswählbar", async (t) => {
  const f = await fixture(t);
  const backupId = await f.backup("taxonomy", "20261001T120000Z", f.taxonomyBackup(automaticFields, false));
  const row = (await f.service.listEditBackups(id)).backups.find((item) => item.backupId === backupId);
  assert.equal(row.available, false); assert.match(row.unavailableReason, /bereits automatisch/);
});

for (const [name, mutate] of [
  ["deutscher Name", (value) => { value[0].german = "Anderer Name"; }],
  ["wissenschaftlicher Name", (value) => { value[0].species = "anderes"; }],
  ["mehrdeutige Art", (value) => { value.push({ ...value[0] }); }],
  ["ungültiger Feldtyp", (value) => { value[0].size = {}; }],
]) {
  test(`ungeeignete historische Artenliste verweigert: ${name}`, async (t) => {
    const f = await fixture(t); const old = structuredClone(f.input); old[0].size = "21 cm"; mutate(old);
    const backupId = await f.backup("species", "20261001T100000Z", old);
    const source = await readFile(f.speciesListPath, "utf8");
    const row = (await f.service.listEditBackups(id)).backups[0];
    assert.equal(row.available, false); assert.equal(typeof row.unavailableReason, "string");
    await assert.rejects(f.service.previewEditBackupRestoration(id, { kind: "species", backupId }), { statusCode: 409 });
    assert.equal(await readFile(f.speciesListPath, "utf8"), source);
    assert.equal(f.previewTokens.size, 0);
  });
}

test("beschädigte, fremde und alte ungebundene Taxonomiestände werden erklärt", async (t) => {
  const f = await fixture(t);
  const badJsonId = await f.backup("species", "20261001T100000Z", "{broken");
  const invalid = f.taxonomyBackup(automaticFields); invalid.override.fields.Family = {};
  const invalidId = await f.backup("taxonomy", "20261002T100000Z", invalid);
  const foreign = f.taxonomyBackup(automaticFields); foreign.species.id = "motacillaalba";
  const foreignId = await f.backup("taxonomy", "20261003T100000Z", foreign);
  const legacyId = "speciesData-taxonomy-20260725T084224Z.json";
  await writeFile(join(f.backupDir, legacyId), jsonText(f.generated));
  const list = await f.service.listEditBackups(id);
  assert.equal(list.backups.length, 4);
  assert.equal(list.backups.every((row) => !row.available), true);
  assert.match(list.backups.find((row) => row.backupId === badJsonId).unavailableReason, /gültiges UTF-8-JSON/);
  assert.match(list.backups.find((row) => row.backupId === invalidId).unavailableReason, /Override ist ungültig/);
  assert.match(list.backups.find((row) => row.backupId === foreignId).unavailableReason, /Artidentität/);
  assert.match(list.backups.find((row) => row.backupId === legacyId).unavailableReason, /keinen verlässlichen Nachweis/);
});

test("Pfadüberschreitung und vertauschte Art des Stands werden vor jedem Read verweigert", async (t) => {
  const f = await fixture(t);
  for (const backupId of ["../species_list.json", "..\\species_list.json", "D:\\species_list.json", "species_list-20261001T100000Z-Amsel-aabbccdd.json:stream", "unknown.json"]) {
    await assert.rejects(f.service.previewEditBackupRestoration(id, { kind: "species", backupId }), { statusCode: 400 });
  }
  await assert.rejects(f.service.previewEditBackupRestoration(id, { kind: "taxonomy", backupId: "species_list-20261001T100000Z-Amsel-aabbccdd.json" }), { statusCode: 400 });
  assert.equal(f.previewTokens.size, 0);
});

test("verknüpfter Sicherungsordner wird verweigert und nicht gelesen", async (t) => {
  const f = await fixture(t);
  const original = `${f.backupDir}-original`;
  await rename(f.backupDir, original);
  await symlink(original, f.backupDir, process.platform === "win32" ? "junction" : "dir");
  // Remove the link before fixture cleanup, without following its target.
  t.after(() => rm(f.backupDir, { force: true, recursive: true }));
  await assert.rejects(f.service.listEditBackups(id), /Verknüpfte/);
  await assert.rejects(f.service.previewEditBackupRestoration(id, { kind: "species", backupId: "species_list-20261001T100000Z-Amsel-aabbccdd.json" }), /Verknüpfte/);
});

test("ein Verzeichnis mit passendem Dateinamen wird als ungeeignet gemeldet", async (t) => {
  const f = await fixture(t); const backupId = "species_list-20261001T100000Z-Amsel-aabbccdd.json";
  await mkdir(join(f.backupDir, backupId));
  const row = (await f.service.listEditBackups(id)).backups[0];
  assert.equal(row.available, false); assert.match(row.unavailableReason, /reguläre JSON-Datei/);
});

test("Größenlimit wird vor dem Lesen eines großen Bearbeitungsstands durchgesetzt", async (t) => {
  const f = await fixture(t); const backupId = await f.backup("species", "20261001T100000Z", " ".repeat(2 * 1024 * 1024 + 1));
  const row = (await f.service.listEditBackups(id)).backups[0];
  assert.equal(row.available, false); assert.match(row.unavailableReason, /2 MiB/);
  assert.equal(row.bytes, 2 * 1024 * 1024 + 1);
  await assert.rejects(f.service.previewEditBackupRestoration(id, { kind: "species", backupId }), /2 MiB/);
});

for (const target of ["backup", "species-list", "generated", "registry"]) {
  test(`frische Änderungen nach der Vorschau verweigern Save ohne Überschreiben: ${target}`, async (t) => {
    const f = await fixture(t); const old = structuredClone(f.input); old[0].size = "21 cm";
    const backupId = await f.backup("species", "20261001T100000Z", old);
    const p = await f.service.previewEditBackupRestoration(id, { kind: "species", backupId });
    const path = target === "backup" ? join(f.backupDir, backupId) : target === "species-list" ? f.speciesListPath : target === "generated" ? f.speciesDataPath : f.taxonomyOverridesPath;
    const changed = `${await readFile(path, "utf8")} `;
    await writeFile(path, changed);
    const sourceBefore = await readFile(f.speciesListPath, "utf8");
    await assert.rejects(f.service.saveEditBackupRestoration(id, { token: p.token }), /seit der Vorschau geändert/);
    assert.equal(await readFile(path, "utf8"), changed);
    assert.equal(await readFile(f.speciesListPath, "utf8"), sourceBefore);
    assert.equal(f.previewTokens.size, 0);
  });
}

test("letzte Vor-Schreibprüfung erkennt eine erst innerhalb der Save-Closure geänderte Sicherung", async (t) => {
  const f = await fixture(t); const old = structuredClone(f.input); old[0].size = "21 cm";
  const backupId = await f.backup("species", "20261001T100000Z", old);
  const p = await f.service.previewEditBackupRestoration(id, { kind: "species", backupId });
  const inner = [...f.previewTokens.values()].find((record) => record.type === "edit");
  const guard = inner.beforeWriteGuard;
  inner.beforeWriteGuard = async () => { await writeFile(join(f.backupDir, backupId), jsonText({ changed: true })); return guard(); };
  const before = await readFile(f.speciesListPath, "utf8");
  await assert.rejects(f.service.saveEditBackupRestoration(id, { token: p.token }), /Bearbeitungsstand.*geändert/);
  assert.equal(await readFile(f.speciesListPath, "utf8"), before);
});

test("letzte Vor-Schreibprüfung überschreibt keine neuere Fremdänderung durch Rollback", async (t) => {
  const f = await fixture(t); const old = structuredClone(f.input); old[0].size = "21 cm";
  const backupId = await f.backup("species", "20261001T100000Z", old);
  const p = await f.service.previewEditBackupRestoration(id, { kind: "species", backupId });
  const inner = [...f.previewTokens.values()].find((record) => record.type === "edit"); const guard = inner.beforeWriteGuard;
  const foreign = structuredClone(f.input); foreign[1].weight = "ganz neue Fremdänderung";
  inner.beforeWriteGuard = async () => { await writeFile(f.speciesListPath, jsonText(foreign)); return guard(); };
  await assert.rejects(f.service.saveEditBackupRestoration(id, { token: p.token }), /heutigen Daten.*geändert/);
  assert.deepEqual(JSON.parse(await readFile(f.speciesListPath, "utf8")), foreign);
});

test("abgelaufene und artfremde Tokens führen zu keiner Wirkung", async (t) => {
  let clock = Date.now(); const f = await fixture(t, { now: () => clock });
  const old = structuredClone(f.input); old[0].size = "21 cm";
  const backupId = await f.backup("species", "20261001T100000Z", old);
  const p = await f.service.previewEditBackupRestoration(id, { kind: "species", backupId });
  const before = await readFile(f.speciesListPath, "utf8");
  await assert.rejects(f.service.saveEditBackupRestoration("motacillaalba", { token: p.token }), /ungültig|abgelaufen/);
  clock += 60001;
  await assert.rejects(f.service.saveEditBackupRestoration(id, { token: p.token }), /ungültig|abgelaufen/);
  assert.equal(await readFile(f.speciesListPath, "utf8"), before);
  assert.equal(f.previewTokens.size, 0);
});

test("parallel wiederholter Save wird vor der zweiten Wirkung abgewiesen", async (t) => {
  const f = await fixture(t); const old = structuredClone(f.input); old[0].size = "21 cm";
  const backupId = await f.backup("species", "20261001T100000Z", old);
  const p = await f.service.previewEditBackupRestoration(id, { kind: "species", backupId });
  const [first, second] = await Promise.allSettled([f.service.saveEditBackupRestoration(id, { token: p.token }), f.service.saveEditBackupRestoration(id, { token: p.token })]);
  assert.equal(first.status, "fulfilled"); assert.equal(second.status, "rejected"); assert.match(second.reason.message, /bereits gespeichert/);
  assert.equal(JSON.parse(await readFile(f.speciesListPath, "utf8"))[0].size, "21 cm");
});

for (const kind of ["species", "taxonomy"]) {
  test(`fehlgeschlagener Save stellt Original wieder her und erhält die Original-Sicherung: ${kind}`, async (t) => {
    const f = await fixture(t); const old = structuredClone(f.input); old[0].size = "21 cm";
    const value = kind === "species" ? old : f.taxonomyBackup({ ...automaticFields, Family: "Frühere Familie" });
    const backupId = await f.backup(kind, "20261001T120000Z", value);
    const beforeList = await readFile(f.speciesListPath, "utf8"); const beforeGenerated = await readFile(f.speciesDataPath, "utf8"); const beforeRegistry = await readFile(f.taxonomyOverridesPath, "utf8");
    const originalHistory = await readFile(join(f.backupDir, backupId), "utf8");
    const p = await f.service.previewEditBackupRestoration(id, { kind, backupId });
    f.failOn(kind === "species" ? f.speciesListPath : f.taxonomyOverridesPath);
    await assert.rejects(f.service.saveEditBackupRestoration(id, { token: p.token }), /isolierter Schreibfehler/);
    assert.equal(await readFile(f.speciesListPath, "utf8"), beforeList);
    assert.equal(await readFile(f.speciesDataPath, "utf8"), beforeGenerated);
    assert.equal(await readFile(f.taxonomyOverridesPath, "utf8"), beforeRegistry);
    assert.equal(await readFile(join(f.backupDir, backupId), "utf8"), originalHistory);
    const list = await f.service.listEditBackups(id);
    const safetyBackup = list.backups.find((row) => row.backupId !== backupId);
    assert.ok(safetyBackup, "Originalstand wurde vor dem Schreibversuch gesichert");
    const original = JSON.parse(await readFile(join(f.backupDir, safetyBackup.backupId), "utf8"));
    if (kind === "species") assert.deepEqual(original, JSON.parse(beforeList));
    else assert.equal(original.generatedTaxonomy.Family, "Turdidae");
    assert.equal(f.previewTokens.size, 0);
  });
}

test("Liste erhält vorhandene ältere geschützte Stände jenseits der fünf regulären", async (t) => {
  const f = await fixture(t); const old = structuredClone(f.input); old[0].size = "21 cm";
  const names = [];
  for (let day = 1; day <= 6; day += 1) names.push(await f.backup("species", `2026100${day}T100000Z`, old));
  const list = await f.service.listEditBackups(id);
  assert.equal(list.backups.length, 6);
  assert.equal(list.backups.some((row) => row.backupId === names[0]), true);
  for (const name of names) assert.deepEqual(JSON.parse(await readFile(join(f.backupDir, name), "utf8")), old);
});

test("Verknüpfung mit einem JSON-Dateinamen wird ohne Folgen ihres Ziels verweigert", async (t) => {
  const f = await fixture(t); const target = join(f.backupDir, "link-target");
  const backupId = "species_list-20261001T100000Z-Amsel-aabbccdd.json";
  await mkdir(target);
  await symlink(target, join(f.backupDir, backupId), process.platform === "win32" ? "junction" : "dir");
  const row = (await f.service.listEditBackups(id)).backups[0];
  assert.equal(row.available, false); assert.match(row.unavailableReason, /Verknüpfte/);
  await assert.rejects(f.service.previewEditBackupRestoration(id, { kind: "species", backupId }), /Verknüpfte/);
});

test("Lesegrenze umfasst auch beschädigte JSONs und beendet weitere Inhaltslesungen", async (t) => {
  const f = await fixture(t);
  for (let day = 1; day <= 9; day += 1) await f.backup("species", `2026100${day}T100000Z`, "{".padEnd(2 * 1024 * 1024 - 1, " "));
  const list = await f.service.listEditBackups(id);
  assert.equal(list.backups.length, 9);
  assert.equal(list.backups.filter((row) => /gültiges UTF-8-JSON/.test(row.unavailableReason)).length, 8);
  assert.equal(list.backups.filter((row) => /Lesegrenze/.test(row.unavailableReason)).length, 1);
});

test("Taxonomie letzte Vor-Schreibprüfung scheitert ohne Rollback über eine neuere Quelle", async (t) => {
  const f = await fixture(t);
  const backupId = await f.backup("taxonomy", "20261001T120000Z", f.taxonomyBackup({ ...automaticFields, Family: "Frühere Familie" }));
  const p = await f.service.previewEditBackupRestoration(id, { kind: "taxonomy", backupId });
  const inner = [...f.previewTokens.values()].find((record) => record.type === "taxonomy-edit"); const guard = inner.beforeWriteGuard;
  const foreign = structuredClone(f.generated); foreign[1].Family = "Neue Fremdänderung";
  inner.beforeWriteGuard = async () => { await writeFile(f.speciesDataPath, jsonText(foreign)); return guard(); };
  await assert.rejects(f.service.saveEditBackupRestoration(id, { token: p.token }), /heutigen Daten.*geändert/);
  assert.deepEqual(JSON.parse(await readFile(f.speciesDataPath, "utf8")), foreign);
  assert.equal(JSON.parse(await readFile(f.taxonomyOverridesPath, "utf8")).species[id], undefined);
});

test("Vorschau bindet eine während der inneren Vorschau geänderte Quelle nicht versehentlich neu", async (t) => {
  const f = await fixture(t); const old = structuredClone(f.input); old[0].size = "21 cm";
  const backupId = await f.backup("species", "20261001T100000Z", old);
  const foreign = structuredClone(f.input); foreign[1].weight = "Aktuelle Zwischenänderung";
  const service = createEditBackupRestorationOperations({ ...f,
    previewSpeciesEdit: async (...args) => { const result = await f.previewSpeciesEdit(...args); await writeFile(f.speciesListPath, jsonText(foreign)); return result; },
  });
  await assert.rejects(service.previewEditBackupRestoration(id, { kind: "species", backupId }), /heutigen Daten.*geändert/);
  assert.deepEqual(JSON.parse(await readFile(f.speciesListPath, "utf8")), foreign);
  assert.equal(f.previewTokens.size, 0);
});

test("nach der Vorschau entfernter Stand verweigert Save ohne Datenwirkung", async (t) => {
  const f = await fixture(t); const old = structuredClone(f.input); old[0].size = "21 cm";
  const backupId = await f.backup("species", "20261001T100000Z", old);
  const p = await f.service.previewEditBackupRestoration(id, { kind: "species", backupId });
  await rm(join(f.backupDir, backupId));
  await assert.rejects(f.service.saveEditBackupRestoration(id, { token: p.token }), /nicht mehr vorhanden/);
  assert.deepEqual(JSON.parse(await readFile(f.speciesListPath, "utf8")), f.input);
});

test("Original-Sicherung bleibt bei einem zusätzlich fehlschlagenden Dateirückschreiben lesbar", async (t) => {
  const f = await fixture(t); const old = structuredClone(f.input); old[0].size = "21 cm";
  const backupId = await f.backup("species", "20261001T100000Z", old);
  const originalText = await readFile(f.speciesListPath, "utf8");
  const speciesOps = createSpeciesEditOperations({ ...f, writeJsonAtomic: async (filename) => {
    // A directory occupying the destination rejects both the attempted write and
    // the established rollback. Only this disposable fixture is affected.
    await rm(filename); await mkdir(filename); throw new Error("Fixtureziel verweigert auch Rollback");
  } });
  const service = createEditBackupRestorationOperations({ ...f, ...speciesOps });
  const p = await service.previewEditBackupRestoration(id, { kind: "species", backupId });
  await assert.rejects(service.saveEditBackupRestoration(id, { token: p.token }), /Fixtureziel verweigert auch Rollback/);
  const savedOriginal = (await readdir(f.backupDir)).find((filename) => filename !== backupId);
  assert.ok(savedOriginal);
  assert.equal(await readFile(join(f.backupDir, savedOriginal), "utf8"), originalText);
  assert.deepEqual(JSON.parse(await readFile(join(f.backupDir, backupId), "utf8")), old);
  assert.equal(f.previewTokens.size, 0);
});

test("Artenlisten-Gesamtstände sind für enthaltene Arten nutzbar, gültige fremde Taxonomieeinzelstände erscheinen nicht", async (t) => {
  const f = await fixture(t); const old = structuredClone(f.input); old[1].size = "16 cm";
  const speciesBackupId = await f.backup("species", "20261001T100000Z", old);
  const taxonomy = f.taxonomyBackup({ ...automaticFields, Family: "Andere frühere Familie" });
  taxonomy.species = { id: "motacillaalba", germanName: "Bachstelze", scientificName: "Motacilla alba" };
  const taxonomyBackupId = await f.backup("taxonomy", "20261002T100000Z", taxonomy);
  const list = await f.service.listEditBackups(id);
  assert.deepEqual(list.backups.map((row) => row.backupId), [speciesBackupId]);
  assert.match(list.backups[0].label, /Gesamtstand/);
  await assert.rejects(f.service.previewEditBackupRestoration(id, { kind: "taxonomy", backupId: taxonomyBackupId }), /Artidentität/);
  const otherPreview = await f.service.previewEditBackupRestoration("motacillaalba", { kind: "species", backupId: speciesBackupId });
  assert.equal(otherPreview.changes.find((row) => row.key === "size").after, "16 cm");
});

test("beschädigte UTF-8-Bytes werden nicht als scheinbar gültiger Feldtext übernommen", async (t) => {
  const f = await fixture(t); const old = structuredClone(f.input); old[0].size = "21 cm";
  const backupId = await f.backup("species", "20261001T100000Z", old);
  const bytes = Buffer.from(jsonText(old)); bytes[bytes.indexOf("Eurasian")] = 0xff;
  await writeFile(join(f.backupDir, backupId), bytes);
  const row = (await f.service.listEditBackups(id)).backups[0];
  assert.equal(row.available, false); assert.match(row.unavailableReason, /UTF-8-JSON/);
  await assert.rejects(f.service.previewEditBackupRestoration(id, { kind: "species", backupId }), /UTF-8-JSON/);
});

test("gleiche Feldwerte verhindern die Wiederaktivierung der Automatik nicht", async (t) => {
  const f = await fixture(t);
  await writeFile(f.taxonomyOverridesPath, jsonText({ version: 1, species: { [id]: {
    fields: automaticFields, automaticFields, reason: "Manuell mit gleichen Werten fixiert", updatedAt: "2026-10-09T12:00:00Z",
  } } }));
  const backupId = await f.backup("taxonomy", "20261001T120000Z", f.taxonomyBackup(automaticFields, false));
  const before = await readFile(f.speciesDataPath, "utf8");
  const legacyPreview = await f.previewTaxonomyEdit(id, { restoreAutomatic: true });
  assert.deepEqual(legacyPreview.changes, [], "Vorherige Feldvorschau zeigt den Pflegewechsel nicht");
  f.previewTokens.delete(legacyPreview.token);
  const p = await f.service.previewEditBackupRestoration(id, { kind: "taxonomy", backupId });
  assert.deepEqual(p.changes, [{ key: "taxonomyMode", label: "Taxonomiepflege", before: "Manueller Override", after: "Automatische Taxonomie" }]);
  const saved = await f.service.saveEditBackupRestoration(id, { token: p.token });
  assert.equal(saved.restoredAutomatic, true);
  assert.equal(Object.hasOwn(JSON.parse(await readFile(f.taxonomyOverridesPath, "utf8")).species, id), false);
  assert.equal(await readFile(f.speciesDataPath, "utf8"), before);
});

test("bei identischen manuellen Feldern wird eine wiederhergestellte Begründung als Wirkung gezeigt", async (t) => {
  const f = await fixture(t);
  const fields = { ...automaticFields, Family: "Heutige Gleiche Familie" };
  f.generated[0] = { ...f.generated[0], ...fields };
  await writeFile(f.speciesDataPath, jsonText(f.generated));
  const currentAutomatic = { ...automaticFields, Family: "Heute Automatisch Andere Familie" };
  await writeFile(f.taxonomyOverridesPath, jsonText({ version: 1, species: { [id]: {
    fields, automaticFields: currentAutomatic, reason: "Heutige andere Begründung", updatedAt: "2026-10-09T12:00:00Z",
  } } }));
  const backupId = await f.backup("taxonomy", "20261001T120000Z", f.taxonomyBackup(fields));
  await assert.rejects(f.previewTaxonomyEdit(id, { fields, reason: "Historisch anderer Änderungsgrund" }), /keine Taxonomieänderungen/);
  const p = await f.service.previewEditBackupRestoration(id, { kind: "taxonomy", backupId });
  assert.equal(p.changes.length, 1);
  assert.equal(p.changes[0].key, "taxonomyReason"); assert.equal(p.changes[0].before, "Heutige andere Begründung");
  assert.match(p.changes[0].after, /Wiederherstellung vom.*Damals fachlich geprüft/);
  await f.service.saveEditBackupRestoration(id, { token: p.token });
  const registry = JSON.parse(await readFile(f.taxonomyOverridesPath, "utf8"));
  assert.equal(registry.species[id].reason, p.changes[0].after);
  assert.deepEqual(registry.species[id].automaticFields, currentAutomatic);
  assert.deepEqual(JSON.parse(await readFile(f.speciesDataPath, "utf8")), f.generated);
});

test("historischer manueller Override wird auch bei bisher identischen Automatikwerten kenntlich gemacht", async (t) => {
  const f = await fixture(t);
  const backupId = await f.backup("taxonomy", "20261001T120000Z", f.taxonomyBackup(automaticFields));
  const p = await f.service.previewEditBackupRestoration(id, { kind: "taxonomy", backupId });
  assert.deepEqual(p.changes.find((row) => row.key === "taxonomyMode"), { key: "taxonomyMode", label: "Taxonomiepflege", before: "Automatische Taxonomie", after: "Manueller Override" });
  assert.equal(p.changes.some((row) => row.key === "taxonomyReason"), true);
  await f.service.saveEditBackupRestoration(id, { token: p.token });
  assert.ok(JSON.parse(await readFile(f.taxonomyOverridesPath, "utf8")).species[id]);
});
