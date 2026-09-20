import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { previewLightroomIdentity, confirmLightroomIdentity, identitySuccessorOptions } from "./lightroom-identity-plan.mjs";
import { IDENTITY_FIELDS, identitySnapshotHash, normalizeIdentitySnapshot, prepareIdentityJournalChanges } from "./lightroom-identity-snapshot.mjs";
import { openLightroomIdentityJournal } from "./lightroom-identity-journal.mjs";
import { createLightroomSearchRequestHandler } from "./lightroom-search-helper.mjs";
import { previewIdentityBlock } from "./lightroom-identity-block.mjs";
import { identityPackageStamp } from "./lightroom-identity-plan.mjs";
import { identityInventoryFromRead } from "./lightroom-identity-inventory.mjs";

const id = (n) => `mtx_${String(n).padStart(32, "0")}`;
const hash = (n) => String(n).repeat(64);
const catalogKey = "D:/Fotos/Testkatalog.lrcat";
function snapshot(photoUuid = "photo-one", masterTaxonId = id(1), referenceImage = "no") {
  return { photoUuid, values: { ...Object.fromEntries(IDENTITY_FIELDS.map((field) => [field, ""])),
    masterTaxonId, referenceImage, germanName: "Bisherige Art", scientificName: "Testus alpha",
    taxonomyKeywordIds: "k1", assignedAt: "2026-09-01T00:00:00Z" }, keywords: [{ id: "k1", name: "Bisherige Art (FN)*" }] };
}
const summary = (photo) => ({ photoUuid: photo.photoUuid, masterTaxonId: photo.values.masterTaxonId,
  germanName: photo.values.germanName, scientificName: photo.values.scientificName,
  referenceImage: photo.values.referenceImage, snapshotHash: identitySnapshotHash(photo) });
function storeFixture(type = "split") {
  const graph = new Map([[id(1), { state: "historical", type, masterTaxonId: id(1), scientificName: "Testus alpha",
    successorIds: type === "split" ? [id(2), id(3)] : [id(2)], eventId: hash(1) }]]);
  const taxa = new Map([2, 3].map((n) => [id(n), { masterTaxonId: id(n), germanName: `Neue Art ${n}`,
    acceptedScientificName: `Testus target${n}`, rank: "species", lifecycleState: "active" }]));
  return { graph, taxa, identityRevision: hash(2), packageId: "package-two", correctionRevision: "",
    status() { return { available: true, packageId: this.packageId, masterVersion: "master-two", correctionRevision: this.correctionRevision }; },
    identityResolution(taxonId) { return graph.get(taxonId) || { state: taxa.has(taxonId) ? "current" : "unresolved", masterTaxonId: taxonId, successorIds: [] }; },
    taxon(taxonId) { return taxa.get(taxonId); }, close() {} };
}
function planFixture({ type = "split", favorite = false, existing = false } = {}) {
  const store = storeFixture(type);
  const before = snapshot("photo-one", id(1), favorite ? "yes" : "no");
  const photos = [summary(before)];
  const previousFavorite = existing ? snapshot("photo-existing", id(2), "yes") : null;
  const request = { catalogKey, photos, choices: [{ sourceMasterTaxonId: id(1), targetMasterTaxonId: id(2) }],
    favoriteInventory: { complete: true, taxonomyPhotos: [...photos, ...(previousFavorite ? [summary(previousFavorite)] : [])] } };
  const after = structuredClone(before);
  Object.assign(after.values, { masterTaxonId: id(2), germanName: "Neue Art 2", scientificName: "Testus target2", taxonomyKeywordIds: "k2" });
  after.keywords = [{ id: "k2", name: "Neue Art 2 (FN)" }];
  return { store, before, after, request, previousFavorite };
}
async function journalFixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fn-photo-journal-"));
  const journals = [];
  t.after(async () => { journals.forEach((journal) => { try { journal.close(); } catch {} }); await fs.rm(root, { recursive: true, force: true }); });
  const open = async (overrides = {}) => {
    const journal = await openLightroomIdentityJournal({ journalRoot: root, catalogKey, ...options, ...overrides });
    journals.push(journal);
    return journal;
  };
  return { root, open, journal: await open() };
}

test("Foto-Vorschau wählt keinen Nachfolger selbst und hält aktuelle/unbekannte IDs unverändert", () => {
  const { store, request } = planFixture();
  const preview = previewLightroomIdentity(store, { ...request, choices: [] });
  assert.equal(preview.ready, false);
  assert.equal(preview.skippedPhotoCount, 1);
  assert.equal(preview.cases[0].targets.length, 2);
  assert.equal(preview.changesPhotos, false);
  assert.equal(preview.changesLocationTime, false);
  for (const taxonId of [id(2), id(99)]) {
    const result = previewLightroomIdentity(store, { catalogKey, photos: [summary(snapshot("p", taxonId))], choices: [] });
    assert.deepEqual(result.transfers, []);
    assert.throws(() => previewLightroomIdentity(store, { ...request, choices: [{ sourceMasterTaxonId: id(1), targetMasterTaxonId: id(99) }] }), /nicht.*belegt/);
  }
});

test("Kompaktes Lightroom-Inventar braucht volle Schnappschüsse nur für betroffene Fotos und Favoriten", async (t) => {
  const { root } = await journalFixture(t);
  const { store, request, before } = planFixture();
  const outsider = snapshot("other", id(3), "no");
  const row = (photo) => ({ photoUuid: photo.photoUuid, masterTaxonId: photo.values.masterTaxonId, referenceImage: photo.values.referenceImage });
  const rows = [row(before), row(outsider)];
  const inventory = identityInventoryFromRead(rows, [before]);
  assert.equal(inventory.taxonomyPhotos[0].snapshotHash, identitySnapshotHash(before));
  assert.equal(inventory.taxonomyPhotos[1].snapshotHash, null);
  assert.equal(previewLightroomIdentity(store, { ...request, favoriteInventory: inventory }).ready, true);
  assert.throws(() => identityInventoryFromRead([{ ...rows[1], referenceImage: "yes" }], []), /unvollständig/);
  assert.throws(() => identityInventoryFromRead([{ ...rows[0], referenceImage: "yes" }], [before]), /widersprechen/);
  assert.throws(() => identityInventoryFromRead(rows, [before, before]), /Doppelte/);
  assert.throws(() => identityInventoryFromRead([], [before]), /fehlen/);
  assert.throws(() => previewLightroomIdentity(store, { ...request, favoriteInventory: identityInventoryFromRead(rows, []) }), /passen nicht/);
  const helper = await createLightroomSearchRequestHandler({ searchRoot: root, openStore: async () => store });
  try {
    const result = await helper.handle({ ...request, favoriteInventory: undefined, snapshots: [before], observed: [before],
      inventoryRows: rows, command: "photo-identity-plan" });
    assert.equal(result.ok, true);
    assert.equal(result.result.ready, true);
  } finally { helper.close(); }
});

test("Split überträgt nur gewählte Fotos; Paket, Präferenz, Foto und Zielwahl invalidieren die Bestätigung", () => {
  const { store, request } = planFixture();
  const preview = previewLightroomIdentity(store, request);
  assert.equal(preview.transfers.length, 1);
  assert.throws(() => confirmLightroomIdentity(store, { ...request, token: preview.token }), /Bestätigung/);
  assert.equal(confirmLightroomIdentity(store, { ...request, token: preview.token, confirmed: true }).ready, true);
  for (const field of ["packageId", "correctionRevision", "identityRevision"]) {
    const old = store[field]; store[field] = `${old}-changed`;
    assert.throws(() => confirmLightroomIdentity(store, { ...request, token: preview.token, confirmed: true }), /aktuelle/);
    store[field] = old;
  }
  assert.throws(() => confirmLightroomIdentity(store, { ...request, choices: [{ sourceMasterTaxonId: id(1), targetMasterTaxonId: id(3) }], token: preview.token, confirmed: true }), /aktuelle/);
  const changed = structuredClone(request);
  changed.photos[0] = { ...changed.photos[0], snapshotHash: hash(5) };
  assert.throws(() => previewLightroomIdentity(store, changed), /passen nicht/);
});

test("Bestätigte Nachfolgerketten bleiben explizit, auch wenn ein späterer Merge nur noch ein Ziel lässt", () => {
  const store = storeFixture();
  for (const n of [2, 3]) {
    store.taxa.delete(id(n));
    store.graph.set(id(n), { state: "historical", type: "merge", successorIds: [id(4)], eventId: hash(3) });
  }
  store.taxa.set(id(4), { masterTaxonId: id(4), germanName: "Nachfolger", acceptedScientificName: "Testus delta", rank: "species", lifecycleState: "active" });
  const result = identitySuccessorOptions(store, id(1));
  assert.equal(result.targets.length, 1);
  assert.equal(result.containsSplit, true);
  assert.equal(result.events.length, 3);
  const preview = previewLightroomIdentity(store, { catalogKey, photos: [summary(snapshot())], choices: [] });
  assert.equal(preview.ready, false);
  store.taxa.delete(id(4));
  assert.equal(identitySuccessorOptions(store, id(1)).unresolved, true);
});

test("Merge-Favoriten brauchen vollständige Katalogprüfung und eine ausdrückliche Gewinnerwahl", () => {
  const { store, request, before, after, previousFavorite } = planFixture({ type: "merge", favorite: true, existing: true });
  assert.throws(() => previewLightroomIdentity(store, { ...request, favoriteInventory: { complete: false } }), /vollständig/);
  const conflict = previewLightroomIdentity(store, request);
  assert.equal(conflict.ready, false);
  assert.equal(conflict.favoriteConflicts[0].photoUuids.length, 2);
  const choices = { ...request, favoriteDecisions: [{ targetMasterTaxonId: id(2), photoUuid: before.photoUuid }] };
  const preview = previewLightroomIdentity(store, choices);
  assert.equal(preview.ready, true);
  const demoted = structuredClone(previousFavorite);
  demoted.values.referenceImage = "no";
  const changes = [{ before, after }, { before: previousFavorite, after: demoted }];
  assert.equal(prepareIdentityJournalChanges(preview, changes).length, 2);
  demoted.values.germanName = "Unbestätigte Änderung";
  assert.throws(() => prepareIdentityJournalChanges(preview, changes), /ausschließlich/);
  const changed = structuredClone(previousFavorite); changed.values.referenceImage = "no";
  assert.throws(() => prepareIdentityJournalChanges(preview, [{ before, after }, { before: changed, after: changed }]), /seit der Vorschau/);
});

test("Schnappschussvertrag schützt Orts-/Zeitfelder, fremde Keywords und vollständige FN-Ränge", async () => {
  const original = snapshot();
  assert.equal(identitySnapshotHash(original), identitySnapshotHash({ ...original, values: Object.fromEntries(Object.entries(original.values).reverse()) }));
  const changed = structuredClone(original); changed.values.germanName += " ";
  assert.notEqual(identitySnapshotHash(original), identitySnapshotHash(changed));
  assert.throws(() => normalizeIdentitySnapshot({ ...original, values: { ...original.values, fnCountry: "Deutschland" } }), /fremde Felder/);
  assert.throws(() => normalizeIdentitySnapshot({ ...original, keywords: [{ id: "k1", name: "Deutschland (FN Ort)*" }] }), /Nur vorhandene/);
  assert.throws(() => normalizeIdentitySnapshot({ ...original, values: { masterTaxonId: id(1) } }), /fehlt/);
  const ranks = await fs.readFile(new URL("../lightroom-plugin/FNWildlifeTaxonomy.lrplugin/TaxonomyRanks.lua", import.meta.url), "utf8");
  const luaRankFields = [...ranks.matchAll(/\{ id = "([a-z]+)", label/g)].map(([, rank]) => `taxonomy${rank[0].toUpperCase()}${rank.slice(1)}`).sort();
  assert.deepEqual(IDENTITY_FIELDS.filter((field) => field.startsWith("taxonomy") && !["taxonomyPath", "taxonomyKeywordIds"].includes(field)), luaRankFields);
});

test("Journal ist nach Wiederöffnung vollständig, idempotent und bestätigt nur zurückgelesene Ergebnisse", async (t) => {
  const { journal, open } = await journalFixture(t);
  const { store, request, before, after } = planFixture();
  const plan = previewLightroomIdentity(store, request);
  const runId = randomUUID();
  assert.throws(() => journal.prepare({ runId, plan, changes: [{ before, after }] }), /Bestätigung/);
  const args = { runId, plan, changes: [{ before, after }], confirmed: true };
  journal.prepare(args);
  assert.equal(journal.prepare(args).photos[0].state, "prepared");
  assert.throws(() => journal.checkpoint(runId, [before]), /Schreibabschluss/);
  assert.equal(journal.read(runId).photos[0].state, "prepared");
  const second = await open();
  assert.equal(second.reconcile(runId, [after])[0].observed, "after");
  assert.equal(second.read(runId).photos[0].state, "prepared", "Read-only recovery must not claim success");
  second.checkpoint(runId, [after]);
  assert.equal(journal.read(runId).photos[0].state, "applied");
  assert.equal(journal.checkpoint(runId, [after]).photos[0].state, "applied");
  const altered = structuredClone(args); altered.changes[0].after.values.germanName = "Andere Änderung";
  assert.throws(() => journal.prepare(altered), /Laufkennung/);
});

test("Rücknahme lässt geänderte Fotos und gelöschte/umbenannte Altstichwörter unangetastet", async (t) => {
  const { journal } = await journalFixture(t);
  const { store, request, before, after } = planFixture();
  const runId = randomUUID();
  journal.prepare({ runId, plan: previewLightroomIdentity(store, request), changes: [{ before, after }], confirmed: true });
  journal.checkpoint(runId, [after]);
  const changed = structuredClone(after); changed.values.referenceImage = "yes";
  const favoriteInventory = { complete: true, taxonomyPhotos: [summary(after)] };
  assert.equal(journal.undoPreview(runId, [changed], before.keywords, favoriteInventory).eligible.length, 0);
  assert.equal(journal.undoPreview(runId, [after], [], favoriteInventory).conflicts.length, 1);
  assert.equal(journal.undoPreview(runId, [after], [{ id: "k1", name: "Umbenannt (FN)" }], favoriteInventory).eligible.length, 0);
  const preview = journal.undoPreview(runId, [after], before.keywords, favoriteInventory);
  assert.equal(preview.eligible.length, 1);
  assert.throws(() => journal.prepareUndo({ runId, observed: [changed], availableKeywords: before.keywords, favoriteInventory, token: preview.token, confirmed: true }), /aktuelle/);
  journal.prepareUndo({ runId, observed: [after], availableKeywords: before.keywords, favoriteInventory, token: preview.token, confirmed: true });
  assert.equal(journal.read(runId).photos[0].state, "undo-prepared");
  assert.throws(() => journal.checkpoint(runId, [after], "undo"), /Schreibabschluss/);
  assert.equal(journal.reconcile(runId, [before])[0].observed, "before");
  journal.checkpoint(runId, [before], "undo");
  assert.equal(journal.read(runId).photos[0].state, "reverted");
});

test("Unterbrochene Läufe sperren parallele Übernahmen; ein nachweislich ungeschriebenes Foto kann abgeschlossen werden", async (t) => {
  const { journal } = await journalFixture(t);
  const { store, request, before, after } = planFixture();
  const args = { runId: randomUUID(), plan: previewLightroomIdentity(store, request), changes: [{ before, after }], confirmed: true };
  journal.prepare(args);
  assert.throws(() => journal.prepare({ ...args, runId: randomUUID() }), /unterbrochenen/);
  assert.throws(() => journal.checkpoint(args.runId, [after], "not-applied"), /Schreibabschluss/);
  journal.checkpoint(args.runId, [before], "not-applied");
  assert.equal(journal.prepare({ ...args, runId: randomUUID() }).photos[0].state, "prepared");
});

test("Rücknahme prüft auch inzwischen neu gesetzte Favoriten außerhalb des Journals", async (t) => {
  const { journal } = await journalFixture(t);
  const { store, request, before, after } = planFixture({ favorite: true });
  const runId = randomUUID();
  journal.prepare({ runId, plan: previewLightroomIdentity(store, request), changes: [{ before, after }], confirmed: true });
  journal.checkpoint(runId, [after]);
  const unrelated = snapshot("photo-new-favorite", id(1), "yes");
  const inventory = { complete: true, taxonomyPhotos: [summary(after), summary(unrelated)] };
  assert.throws(() => journal.undoPreview(runId, [after], before.keywords), /vollständig/);
  const preview = journal.undoPreview(runId, [after], before.keywords, inventory);
  assert.equal(preview.eligible.length, 0);
  assert.match(preview.conflicts[0].reason, /mehrere Art-Favoriten/);
  assert.equal(journal.read(runId).photos[0].state, "applied");
});

test("Journalgrenzen bewahren vorhandene Rücknahmedaten und verschiedene Kataloge bleiben getrennt", async (t) => {
  const { journal, open } = await journalFixture(t, { maxRuns: 1 });
  const { store, request, before, after } = planFixture();
  const args = { runId: randomUUID(), plan: previewLightroomIdentity(store, request), changes: [{ before, after }], confirmed: true };
  journal.prepare(args); journal.checkpoint(args.runId, [after]);
  assert.throws(() => journal.prepare({ ...args, runId: randomUUID() }), /voll/);
  assert.equal(journal.read(args.runId).photos[0].before.values.masterTaxonId, id(1));
  const other = await open({ catalogKey: "D:/Fotos/AndererKatalog.lrcat", maxBytes: 1 });
  assert.deepEqual(other.list(), []);
  assert.throws(() => other.prepare(args), /Katalogkennung/);
  assert.throws(() => other.prepare({ ...args, plan: { ...args.plan, catalogKey: "D:/Fotos/AndererKatalog.lrcat" } }), /voll/);
  assert.deepEqual(other.list(), []);
});

test("Fehlerhafte Blockrücklesung wird atomar verworfen; manipuliertes Journal sperrt Rücknahme", async (t) => {
  const { journal } = await journalFixture(t);
  const { store, request, before, after } = planFixture();
  const before2 = { ...structuredClone(before), photoUuid: "photo-two" };
  const after2 = { ...structuredClone(after), photoUuid: "photo-two" };
  request.photos.push(summary(before2)); request.favoriteInventory.taxonomyPhotos = request.photos;
  const runId = randomUUID();
  journal.prepare({ runId, plan: previewLightroomIdentity(store, request), changes: [{ before, after }, { before: before2, after: after2 }], confirmed: true });
  assert.throws(() => journal.checkpoint(runId, [after, before2]), /Schreibabschluss/);
  assert.deepEqual(journal.read(runId).photos.map((photo) => photo.state), ["prepared", "prepared"]);
  journal.checkpoint(runId, [after]);
  assert.deepEqual(journal.read(runId).photos.map((photo) => photo.state), ["applied", "prepared"]);
  const db = new DatabaseSync(journal.filename);
  try { db.prepare("UPDATE identity_photo SET after_json=? WHERE photo_uuid=?").run(JSON.stringify(before), before.photoUuid); }
  finally { db.close(); }
  assert.throws(() => journal.read(runId), /Prüfsumme/);
});

test("Suchhelfer bietet begrenzte Foto-Fallauswahl und Vorschau, aber keine direkte Foto-Schreibaktion", async () => {
  const { store, request } = planFixture();
  const helper = await createLightroomSearchRequestHandler({ openStore: async () => store });
  try {
    const options = await helper.handle({ command: "photo-identity-options", masterTaxonIds: [id(1)] });
    assert.equal(options.ok, true);
    assert.equal(options.result.cases[0].targets.length, 2);
    assert.equal(options.result.changesPhotos, false);
    for (const ids of [[], Array(101).fill(id(1)), [id(1), id(1)], ["unbekannt"]]) {
      assert.equal((await helper.handle({ command: "photo-identity-options", masterTaxonIds: ids })).ok, false);
    }
    const preview = await helper.handle({ ...request, command: "photo-identity-preview" });
    assert.equal(preview.ok, true);
    assert.equal(preview.result.ready, true);
    assert.equal(preview.result.changesPhotos, false);
    assert.equal((await helper.handle({ command: "photo-identity-apply" })).error.code, "unknown-command");
  } finally { helper.close(); }
});

test("Workflow bindet echte Schnappschüsse, frischen Paketstand und Bestätigung vor dem dauerhaften Journal", async (t) => {
  const { root } = await journalFixture(t);
  const { store, request, before, after } = planFixture();
  let opens = 0;
  let closes = 0;
  let available = true;
  const helper = await createLightroomSearchRequestHandler({ searchRoot: root, openStore: async () => {
    opens += 1;
    if (!available) throw new Error("Kein Paket verfügbar");
    return { ...store, close() { closes += 1; } };
  } });
  t.after(() => helper.close());
  const base = { ...request, snapshots: [before], writerIdle: true, confirmed: true, runId: randomUUID(), changes: [{ before, after }] };
  const call = (command, input = {}) => helper.handle({ ...base, ...input, command: `photo-identity-${command}` });
  await helper.handle({ command: "status" }); // deliberately cache the old package
  const preview = await call("plan");
  assert.equal(preview.ok, true);
  assert.equal(preview.result.token, previewLightroomIdentity(store, request).token);
  assert.equal((await call("prepare", { token: preview.result.token, confirmed: false })).ok, false);
  assert.equal((await call("prepare", { token: preview.result.token, writerIdle: false })).ok, false);
  assert.equal(await fs.stat(path.join(root, "identity-journals")).then(() => true, () => false), false);
  store.packageId = "changed-after-preview";
  assert.equal((await call("confirm", { token: preview.result.token })).ok, false);
  store.packageId = "package-two";
  const confirmed = await call("confirm", { token: preview.result.token });
  assert.equal(confirmed.result.targets[0].masterTaxonId, id(2));
  const prepared = await call("prepare", { token: preview.result.token, journalRoot: "Z:/must-never-be-used" });
  assert.equal(prepared.ok, true);
  assert.equal(prepared.result.journalPrepared, true);
  assert.equal(prepared.result.run.photos[0].state, "prepared");
  assert.equal(prepared.result.changesPhotos, false);
  assert.equal((await fs.readdir(path.join(root, "identity-journals"))).length, 1);
  const badSnapshot = structuredClone(before); badSnapshot.values.germanName += " verändert";
  assert.equal((await call("prepare", { token: preview.result.token, snapshots: [badSnapshot] })).ok, false);
  available = false;
  assert.equal((await call("read")).ok, true); // recovery must work without active package
  assert.equal((await call("list")).result.runs.length, 1);
  assert.equal(opens - closes, 1); // only the ordinary cached search store remains open
  const candidateHelper = await createLightroomSearchRequestHandler({ searchRoot: root, slot: "candidate",
    openStore: async () => { throw new Error("Must not open candidate for photo work"); } });
  try {
    const result = await candidateHelper.handle({ ...base, command: "photo-identity-prepare", token: preview.result.token });
    assert.equal(result.ok, false);
    assert.match(result.error.message, /aktiven Datenbankstand/);
  } finally { candidateHelper.close(); }
});

test("Wiederaufnahme protokolliert Rücklesung statt Wiederholung; unklare Fotos bleiben gesperrt", async (t) => {
  const { journal, open } = await journalFixture(t);
  const { store, request, before, after } = planFixture();
  const second = { ...structuredClone(before), photoUuid: "photo-two" };
  const secondAfter = { ...structuredClone(after), photoUuid: "photo-two" };
  request.photos.push(summary(second)); request.favoriteInventory.taxonomyPhotos = request.photos;
  const runId = randomUUID();
  journal.prepare({ runId, plan: previewLightroomIdentity(store, request), changes: [{ before, after }, { before: second, after: secondAfter }], confirmed: true });
  const reopened = await open();
  const preview = reopened.recoveryPreview(runId, [after]);
  assert.equal(preview.effects[0].toState, "applied");
  assert.equal(preview.conflicts.length, 1);
  assert.throws(() => reopened.confirmRecovery({ runId, observed: [after], token: preview.token }), /Bestätigung/);
  assert.throws(() => reopened.confirmRecovery({ runId, observed: [after, second], token: preview.token, confirmed: true }), /aktuelle/);
  const result = reopened.confirmRecovery({ runId, observed: [after], token: preview.token, confirmed: true });
  assert.deepEqual(result.run.photos.map((photo) => photo.state), ["applied", "prepared"]);
  const kept = reopened.recoveryPreview(runId, [after, second]);
  assert.equal(kept.effects[0].toState, "prepared");
  const canceled = reopened.recoveryPreview(runId, [after, second], true);
  reopened.confirmRecovery({ runId, observed: [after, second], abandonPending: true, token: canceled.token, confirmed: true });
  assert.deepEqual(reopened.read(runId).photos.map((photo) => photo.state), ["applied", "not-applied"]);
  assert.throws(() => reopened.confirmRecovery({ runId, observed: [after, second], abandonPending: true, token: canceled.token, confirmed: true }), /aktuelle/);
});

test("Unterbrochene Rücknahme unterscheidet bereits zurückgenommen, noch angewendet und ausdrücklich abgebrochen", async (t) => {
  const { journal } = await journalFixture(t);
  const { store, request, before, after } = planFixture();
  const runId = randomUUID();
  journal.prepare({ runId, plan: previewLightroomIdentity(store, request), changes: [{ before, after }], confirmed: true });
  journal.checkpoint(runId, [after]);
  const input = { runId, observed: [after], availableKeywords: before.keywords,
    favoriteInventory: { complete: true, taxonomyPhotos: [summary(after)] }, confirmed: true };
  let undo = journal.undoPreview(runId, input.observed, input.availableKeywords, input.favoriteInventory);
  journal.prepareUndo({ ...input, token: undo.token });
  const aborted = journal.recoveryPreview(runId, [after], true);
  journal.confirmRecovery({ runId, observed: [after], abandonPending: true, token: aborted.token, confirmed: true });
  assert.equal(journal.read(runId).photos[0].state, "applied");
  undo = journal.undoPreview(runId, input.observed, input.availableKeywords, input.favoriteInventory);
  journal.prepareUndo({ ...input, token: undo.token });
  const completed = journal.recoveryPreview(runId, [before]);
  journal.confirmRecovery({ runId, observed: [before], token: completed.token, confirmed: true });
  assert.equal(journal.read(runId).photos[0].state, "reverted");
});

test("Rücknahme sperrt noch ungeklärte Übernahmen desselben und anderer Läufe", async (t) => {
  const { journal } = await journalFixture(t);
  const { store, request, before, after } = planFixture();
  const runId = randomUUID();
  const plan = previewLightroomIdentity(store, request);
  journal.prepare({ runId, plan, changes: [{ before, after }], confirmed: true });
  assert.throws(() => journal.prepareUndo({ runId }), /offenen Journallauf/);
  journal.checkpoint(runId, [after]);
  const runId2 = randomUUID();
  journal.prepare({ runId: runId2, plan, changes: [{ before, after }], confirmed: true });
  assert.throws(() => journal.prepareUndo({ runId }), /offenen Journallauf/);
});

test("250er Blöcke berücksichtigen Favoritenabhängigkeiten auch nach Pause und Rücknahme", async (t) => {
  const { journal } = await journalFixture(t);
  const { store, request, before, after, previousFavorite } = planFixture({ type: "merge", favorite: true, existing: true });
  before.photoUuid = "a-winner"; after.photoUuid = before.photoUuid;
  previousFavorite.photoUuid = "z-demote-first";
  const demoted = structuredClone(previousFavorite); demoted.values.referenceImage = "no";
  const changes = [{ before, after }, { before: previousFavorite, after: demoted }];
  for (let n = 0; n < 251; n += 1) {
    const next = snapshot(`neutral-${String(n).padStart(3, "0")}`);
    const nextAfter = structuredClone(after); nextAfter.photoUuid = next.photoUuid; nextAfter.values.referenceImage = "no";
    changes.push({ before: next, after: nextAfter });
  }
  request.photos = changes.filter((entry) => entry.before !== previousFavorite).map((entry) => summary(entry.before));
  request.favoriteInventory.taxonomyPhotos = changes.map((entry) => summary(entry.before));
  request.favoriteDecisions = [{ targetMasterTaxonId: id(2), photoUuid: before.photoUuid }];
  const runId = randomUUID();
  journal.prepare({ runId, plan: previewLightroomIdentity(store, request), changes, confirmed: true });
  let observed = changes.map((entry) => entry.before);
  const block = (direction = "apply") => previewIdentityBlock(journal.read(runId), { direction, observed,
    favoriteInventory: { complete: true, taxonomyPhotos: observed.map(summary) }, packageStamp: identityPackageStamp(store) });
  let preview = block();
  assert.equal(preview.changes.length, 250);
  assert.equal(preview.changes.some((photo) => photo.photoUuid === before.photoUuid), false);
  journal.checkpoint(runId, preview.changes.map((photo) => photo.after));
  let updated = new Map(preview.changes.map((photo) => [photo.photoUuid, photo.after]));
  observed = observed.map((photo) => updated.get(photo.photoUuid) || photo);
  preview = block();
  assert.equal(preview.changes.length, 3);
  assert.equal(preview.changes.at(-1).photoUuid, before.photoUuid);
  assert.equal(preview.changes.at(-2).photoUuid, previousFavorite.photoUuid);
  const external = snapshot("external-new-favorite", id(2), "yes");
  assert.throws(() => previewIdentityBlock(journal.read(runId), { observed,
    favoriteInventory: { complete: true, taxonomyPhotos: [...observed.map(summary), summary(external)] },
    packageStamp: identityPackageStamp(store) }), /Art-Favorit/);
  journal.checkpoint(runId, preview.changes.map((photo) => photo.after));
  updated = new Map(preview.changes.map((photo) => [photo.photoUuid, photo.after]));
  observed = observed.map((photo) => updated.get(photo.photoUuid) || photo);
  const undoInput = { runId, observed, availableKeywords: changes.flatMap((entry) => entry.before.keywords),
    favoriteInventory: { complete: true, taxonomyPhotos: observed.map(summary) } };
  const undo = journal.undoPreview(runId, observed, undoInput.availableKeywords, undoInput.favoriteInventory);
  journal.prepareUndo({ ...undoInput, token: undo.token, confirmed: true });
  preview = block("undo");
  assert.equal(preview.changes.length, 250);
  // Moving the chosen favorite BACK first is allowed; restoring the other
  // target favorite cannot happen until the next block after that move.
  assert.equal(preview.changes.some((photo) => photo.photoUuid === previousFavorite.photoUuid), false);
  journal.checkpoint(runId, preview.changes.map((photo) => photo.before), "undo");
  updated = new Map(preview.changes.map((photo) => [photo.photoUuid, photo.before]));
  observed = observed.map((photo) => updated.get(photo.photoUuid) || photo);
  preview = block("undo");
  assert.equal(preview.changes.length, 3);
  assert.equal(preview.changes.at(-2).photoUuid, before.photoUuid);
  assert.equal(preview.changes.at(-1).photoUuid, previousFavorite.photoUuid);
  journal.checkpoint(runId, preview.changes.map((photo) => photo.before), "undo");
  assert.equal(journal.read(runId).photos.every((photo) => photo.state === "reverted"), true);
});

test("Workflow-Schreibblock benötigt frische Rücklesung und bestätigt keine veraltete oder wiederholte Aktion", async (t) => {
  const { root } = await journalFixture(t);
  const { store, request, before, after } = planFixture();
  const helper = await createLightroomSearchRequestHandler({ searchRoot: root, openStore: async () => ({ ...store }) });
  t.after(() => helper.close());
  const base = { ...request, snapshots: [before], runId: randomUUID(), writerIdle: true, confirmed: true };
  const call = (command, input = {}) => helper.handle({ ...base, ...input, command: `photo-identity-${command}` });
  const plan = await call("plan");
  assert.equal((await call("prepare", { token: plan.result.token, changes: [{ before, after }] })).ok, true);
  const readback = { observed: [before] };
  const preview = await call("block-preview", readback);
  assert.equal(preview.ok, true);
  assert.equal(preview.result.ready, true);
  assert.equal((await call("block-confirm", { ...readback, token: preview.result.token })).ok, true);
  assert.equal((await call("block-confirm", { ...readback, token: preview.result.token, confirmed: false })).ok, false);
  store.packageId = "new-active-package";
  assert.equal((await call("block-confirm", { ...readback, token: preview.result.token })).ok, false);
  store.packageId = "package-two";
  assert.equal((await call("block-preview", { observed: [after] })).ok, false); // uncertain write, reconcile first
  assert.equal((await call("checkpoint", { observed: [after], writerIdle: false })).ok, false);
  assert.equal((await call("checkpoint", { observed: [after] })).ok, true);
  assert.equal((await call("block-confirm", { ...readback, token: preview.result.token })).ok, false);
  const undoInput = { observed: [after], availableKeywords: before.keywords,
    favoriteInventory: { complete: true, taxonomyPhotos: [summary(after)] } };
  const undo = await call("undo-preview", undoInput);
  assert.equal((await call("undo-prepare", { ...undoInput, token: undo.result.token })).ok, true);
  const undoBlock = await call("block-preview", { ...undoInput, direction: "undo" });
  assert.equal(undoBlock.ok, true);
  assert.equal(undoBlock.result.ready, true);
  assert.equal((await call("block-confirm", { ...undoInput, direction: "undo", token: undoBlock.result.token })).ok, true);
});
