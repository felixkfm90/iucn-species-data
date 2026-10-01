import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { configureTaxonomyBuildDatabase as configure, withTaxonomyBuildCache as scoped,
  taxonomyBuildCacheUsage as usage, TAXONOMY_BUILD_CACHE_CONNECTIONS as limit } from "./taxonomy-build-cache.mjs";

const open = () => configure(new DatabaseSync(":memory:"));
const size = (db, schema = "main") => db.prepare(`PRAGMA ${schema}.cache_size`).get().cache_size;

test("Aufbaupuffer gilt nur im Bereich, nicht für normale Leser, Methoden oder angehängte Datenbanken", async () => {
  const prepare = DatabaseSync.prototype.prepare, exec = DatabaseSync.prototype.exec;
  const normal = open(), standard = size(normal);
  let retained;
  try {
    await scoped(async () => {
      retained = open();
      assert.equal(size(retained), -8192);
      assert.equal(size(normal), standard);
      retained.exec("ATTACH DATABASE ':memory:' AS source");
      assert.equal(size(retained, "source"), standard);
      await scoped(async () => { assert.equal(size(configure(retained)), -8192); });
      assert.equal(size(retained), -8192);
      assert.equal(usage().activeConnections, 1);
    });
    assert.equal(size(retained), standard);
    assert.equal(usage().activeConnections, 0);
    assert.equal(DatabaseSync.prototype.prepare, prepare);
    assert.equal(DatabaseSync.prototype.exec, exec);
  } finally { normal.close(); retained?.close(); }
});

test("Acht gleichzeitige Reservierungen, Standardrückfall und Wiederverwendung geschlossener Plätze", async () => {
  await scoped(async () => {
    const handles = [];
    try {
      for (let i = 0; i < limit + 2; i++) handles.push(open());
      assert.ok(handles.slice(0, limit).every((db) => size(db) === -8192));
      assert.ok(handles.slice(limit).every((db) => size(db) !== -8192));
      assert.equal(usage().reservedKiB, 65536);
      handles[0].close();
      handles.push(open());
      assert.equal(size(handles.at(-1)), -8192);
      assert.equal(usage().activeConnections, limit);
    } finally { for (const db of handles) if (db.isOpen) db.close(); }
  });
  assert.equal(usage().activeConnections, 0);
});

test("Parallele Bereiche teilen das Budget; Fehler gibt nur eigene Plätze frei und erlaubt neuen Versuch", async () => {
  let release, started;
  const wait = new Promise((resolve) => { release = resolve; });
  const ready = new Promise((resolve) => { started = resolve; });
  const handles = [];
  const first = scoped(async () => {
    for (let i = 0; i < 5; i++) handles.push(open());
    started(); await wait;
  });
  try {
    await ready;
    await assert.rejects(scoped(async () => {
      const own = [];
      try {
        for (let i = 0; i < 5; i++) own.push(open());
        assert.equal(own.filter((db) => size(db) === -8192).length, 3);
        throw new Error("simulierter Abbruch");
      } finally { own.forEach((db) => db.close()); }
    }), /simulierter Abbruch/u);
    assert.equal(usage().activeConnections, 5);
    await scoped(async () => { const db = open(); assert.equal(size(db), -8192); db.close(); });
  } finally { release(); await first; handles.forEach((db) => db.close()); }
  assert.equal(usage().activeConnections, 0);
});

test("Transaktionen und Constraints bleiben unverändert, auch beim Fehler und Wiederöffnen", async () => {
  await scoped(async () => {
    const db = open();
    try {
      const synchronous = db.prepare("PRAGMA synchronous").get().synchronous;
      db.exec("PRAGMA foreign_keys=ON; CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(id INTEGER NOT NULL REFERENCES parent);");
      db.exec("BEGIN; INSERT INTO parent VALUES(1); ROLLBACK;");
      assert.equal(db.prepare("SELECT count(*) n FROM parent").get().n, 0);
      assert.throws(() => db.exec("INSERT INTO child VALUES(NULL)"));
      assert.throws(() => db.exec("INSERT INTO child VALUES(1)"));
      assert.equal(db.prepare("PRAGMA synchronous").get().synchronous, synchronous);
    } finally { db.close(); }
  });
  const db = open(); try { assert.notEqual(size(db), -8192); } finally { db.close(); }
});

test("Puffer-Konfigurationsfehler schließt den neuen Handle ohne Reservierungsleck", async () => {
  await scoped(async () => {
    let closed = false;
    assert.throws(() => configure({ prepare() { throw new Error("Lesefehler"); }, close() { closed = true; } }), /Lesefehler/u);
    assert.equal(closed, true);
    assert.equal(usage().activeConnections, 0);
    const db = open(); try { assert.equal(size(db), -8192); } finally { db.close(); }
  });
});

test("Fehler beim Rückstellen bearbeitet alle Handles und erhält die ursprüngliche Fehlerursache", async () => {
  let calls = 0;
  const broken = { isOpen: true, prepare() { return { get: () => ({ cache_size: -2000 }) }; },
    exec() { if (++calls > 1) throw new Error("Rückstellfehler"); }, close() { this.isOpen = false; } };
  let healthy;
  try {
    await assert.rejects(scoped(async () => {
      configure(broken); healthy = open(); throw new Error("Aufbaufehler");
    }), (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.errors[0].message, /Aufbaufehler/u);
      assert.match(error.errors[1].message, /Rückstellfehler/u);
      return true;
    });
    assert.equal(broken.isOpen, false);
    assert.notEqual(size(healthy), -8192);
    assert.equal(usage().activeConnections, 0);
  } finally { healthy?.close(); }
});

test("Später asynchroner Nachläufer eines abgeschlossenen Bereichs erhält keinen Aufbaupuffer", async () => {
  let release, late;
  const wait = new Promise((resolve) => { release = resolve; });
  await scoped(async () => { late = wait.then(() => open()); });
  release();
  const db = await late;
  try { assert.notEqual(size(db), -8192); assert.equal(usage().activeConnections, 0); } finally { db.close(); }
});

test("Dateipuffer ist nicht dauerhaft, schreibgeschützte Quelle bleibt bytegleich und nach Fehler wieder offen", async () => {
  const directory = await fs.mkdtemp(path.resolve("Testlauf/build-cache-")), file = path.join(directory, "source.sqlite");
  let db = new DatabaseSync(file);
  db.exec("CREATE TABLE source(id INTEGER PRIMARY KEY); INSERT INTO source VALUES(1)");
  const standard = size(db), journal = db.prepare("PRAGMA journal_mode").get().journal_mode;
  db.close();
  const digest = async () => createHash("sha256").update(await fs.readFile(file)).digest("hex");
  try {
    const before = await digest();
    await assert.rejects(scoped(async () => {
      db = configure(new DatabaseSync(file, { readOnly: true }));
      try {
        assert.equal(size(db), -8192);
        assert.throws(() => db.exec("DELETE FROM source"));
        throw new Error("Abbruch nach Lesen");
      } finally { db.close(); }
    }), /Abbruch nach Lesen/u);
    assert.equal(await digest(), before);
    db = new DatabaseSync(file);
    assert.equal(size(db), standard);
    assert.equal(db.prepare("PRAGMA journal_mode").get().journal_mode, journal);
    assert.equal(db.prepare("SELECT count(*) n FROM source").get().n, 1);
  } finally {
    if (db.isOpen) db.close();
    assert.equal(path.dirname(directory), path.resolve("Testlauf"));
    assert.match(path.basename(directory), /^build-cache-[a-zA-Z0-9]+$/u);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
