import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { applyLightroomSearchDelta } from "./lightroom-search-delta.mjs";
import { createLightroomSearchSchema, finalizeLightroomSearchSchema } from "./lightroom-search-schema.mjs";

async function fixture(t, before, after, { previousName = null, desiredName = null } = {}) {
  const scratch = fileURLToPath(new URL("../Testlauf/", import.meta.url));
  await fs.mkdir(scratch, { recursive: true });
  const root = await fs.mkdtemp(path.join(scratch, "search-delta-"));
  const databases = [];
  t.after(async () => {
    for (const database of databases) database.close();
    assert.equal(path.dirname(root), path.resolve(scratch));
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
  });
  for (const [index, terms] of [before, after].entries()) {
    const database = new DatabaseSync(path.join(root, `${index}.sqlite`));
    databases.push(database);
    createLightroomSearchSchema(database);
    database.prepare(`INSERT INTO taxon VALUES ('taxon', 'Testus species', 'species', 'Animalia', ?, NULL, 'active', 'exact-col', 'now')`)
      .run(index ? desiredName : previousName);
    const insert = database.prepare("INSERT INTO search_term VALUES (?, 'taxon', ?, ?, ?, ?, 'vernacular', 'de', 'fixture', 2)");
    for (const [id, term] of terms) insert.run(id, term, term.toLowerCase(), term.toLowerCase(), term.toLowerCase());
    if (!index) finalizeLightroomSearchSchema(database);
  }
  return { database: databases[0], incoming: path.join(root, "1.sqlite") };
}
const terms = (database) => database.prepare("SELECT search_term_id id, term FROM search_term ORDER BY search_term_id").all()
  .map((row) => [row.id, row.term]);
const checkIndex = (database) => database.exec("INSERT INTO search_fts(search_fts, rank) VALUES('integrity-check', 1)");

test("Delta behält gleiche IDs und gleiche Duplikate ohne Suchschreibvorgänge", async (t) => {
  const original = [[1, "Alpha"], [2, "Alpha"], [9, "Beta"]];
  const f = await fixture(t, original, original);
  const delta = applyLightroomSearchDelta(f.database, f.incoming);
  assert.deepEqual(delta.changes.search_term, { written: 0, removedOrReplaced: 0 });
  assert.deepEqual(terms(f.database), original);
  checkIndex(f.database);
});

test("Delta mischt gleiche IDs und umsortierte Duplikate ohne neue Belege", async (t) => {
  const original = [[1, "Alpha"], [2, "Alpha"], [9, "Beta"]];
  const f = await fixture(t, original, [[1, "Beta"], [2, "Alpha"], [9, "Alpha"]]);
  const delta = applyLightroomSearchDelta(f.database, f.incoming);
  assert.deepEqual(delta.changes.search_term, { written: 0, removedOrReplaced: 0 });
  assert.deepEqual(terms(f.database), original);
  checkIndex(f.database);
});

test("Delta ersetzt einen Begriff bei wiederverwendeter Quell-ID, erhält andere Duplikate und NULL-Felder", async (t) => {
  const f = await fixture(t, [[1, "Alpha"], [2, "Alpha"], [9, "Beta"]], [[1, "Neu"], [2, "Alpha"], [9, "Beta"]],
    { previousName: null, desiredName: "Neuer Name" });
  const delta = applyLightroomSearchDelta(f.database, f.incoming);
  assert.deepEqual(delta.changes.search_term, { written: 1, removedOrReplaced: 1 });
  assert.deepEqual(delta.changes.taxon, { written: 1, removedOrReplaced: 1 });
  assert.deepEqual(terms(f.database), [[2, "Alpha"], [9, "Beta"], [10, "Neu"]]);
  assert.equal(f.database.prepare("SELECT german_name FROM taxon").get().german_name, "Neuer Name");
  assert.equal(f.database.prepare("SELECT count(*) n FROM search_fts WHERE search_fts MATCH 'Alpha'").get().n, 1);
  assert.equal(f.database.prepare("SELECT count(*) n FROM search_fts WHERE search_fts MATCH 'Neu'").get().n, 1);
  checkIndex(f.database);
});

test("Delta bewahrt Multimenge bei komplett neuen IDs sowie zusätzlichen und entfernten Duplikaten", async (t) => {
  const f = await fixture(t, [[1, "Alpha"], [2, "Alpha"], [9, "Beta"], [10, "Gamma"]],
    [[20, "Alpha"], [21, "Beta"], [22, "Beta"], [23, "Neu"]], { previousName: "Name", desiredName: null });
  const delta = applyLightroomSearchDelta(f.database, f.incoming);
  assert.deepEqual(delta.changes.search_term, { written: 2, removedOrReplaced: 2 });
  assert.equal(f.database.prepare("SELECT german_name FROM taxon").get().german_name, null);
  assert.deepEqual(terms(f.database).map((row) => row[1]).sort(), ["Alpha", "Beta", "Beta", "Neu"]);
  assert.deepEqual(terms(f.database).filter(([id]) => id <= 10), [[1, "Alpha"], [9, "Beta"]]);
  checkIndex(f.database);
});

test("Delta entfernt alle Suchzeilen und kann anschließend aus leerer Basis neu aufbauen", async (t) => {
  const f = await fixture(t, [[1, "Alpha"], [2, "Alpha"]], []);
  assert.equal(applyLightroomSearchDelta(f.database, f.incoming).changes.search_term.removedOrReplaced, 2);
  assert.deepEqual(terms(f.database), []);
  checkIndex(f.database);
  const empty = await fixture(t, [], [[99, "Alpha"], [100, "Alpha"]]);
  assert.equal(applyLightroomSearchDelta(empty.database, empty.incoming).changes.search_term.written, 2);
  assert.deepEqual(terms(empty.database), [[1, "Alpha"], [2, "Alpha"]]);
  checkIndex(empty.database);
});
