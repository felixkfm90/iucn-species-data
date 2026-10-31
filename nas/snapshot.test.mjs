import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createSharedProjectStore } from "../species-explorer/shared-project/store.mjs";
import { tmpdir, assertTestTempPath } from "../scripts/test-temp.mjs";
import { createNasServiceConfiguration, writeNasServiceConfiguration } from "./configure.mjs";
import { createSharedProjectSnapshot, validateAndRestoreSharedProjectSnapshot } from "./snapshot.mjs";

const projectId = "11111111-1111-4111-8111-111111111111";
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "nas-snapshot-"));
  const filename = path.join(root, "live.sqlite");
  const store = createSharedProjectStore({ filename, localStorageConfirmed: true });
  const writer = new DatabaseSync(filename);
  writer.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;");
  writer.prepare("INSERT INTO meta VALUES ('project_id',?)").run(projectId);
  writer.prepare("INSERT INTO users VALUES (?,?,?,?,?,0,1,?)").run("author", "synthetic", "Synthetic person", "synthetic-nonlogin", "admin", new Date().toISOString());
  const insert = writer.prepare("INSERT INTO audit(actor_id,action,target,created_at) VALUES (?,?,?,?)");
  writer.exec("BEGIN");
  for (let i = 0; i < 100; i++) insert.run("author", "synthetic-write", `row-${i}-${"x".repeat(1500)}`, "2026-10-31");
  writer.exec("COMMIT");
  t.after(async () => { writer.close(); store.close(); await fs.rm(assertTestTempPath(root), { recursive: true, force: true }); });
  return { root, filename, writer };
}

test("NAS-Sicherung enthält echte noch nicht eingecheckte WAL-Daten und wird getrennt bytegleich wiederhergestellt", async (t) => {
  const f = await fixture(t), destination = path.join(f.root, "snapshot");
  assert.ok((await fs.stat(`${f.filename}-wal`)).size > 0);
  const original = await fs.readFile(f.filename);
  const manifest = await createSharedProjectSnapshot({ filename: f.filename, destination, localStorageConfirmed: true });
  assert.equal(manifest.projectId, projectId); assert.equal(manifest.counts.audit, 100);
  assert.deepEqual(await fs.readFile(f.filename), original);
  assert.equal(f.writer.prepare("SELECT count(*) AS n FROM audit").get().n, 100);
  f.writer.prepare("INSERT INTO audit(action,created_at) VALUES (?,?)").run("after-backup", "2026-10-31");
  const target = path.join(f.root, "restored.sqlite");
  const result = await validateAndRestoreSharedProjectSnapshot({ snapshotDirectory: destination, destination: target, localStorageConfirmed: true });
  assert.equal(result.verified, true); assert.equal(result.existingProjectReplaced, false);
  const probe = new DatabaseSync(target, { readOnly: true });
  try { assert.equal(probe.prepare("SELECT count(*) AS n FROM audit").get().n, 100); } finally { probe.close(); }
  assert.equal(f.writer.prepare("SELECT count(*) AS n FROM audit").get().n, 101);
});

test("NAS-Sicherung überschreibt weder vorhandene Sicherung noch ein bestehendes Restoreziel", async (t) => {
  const f = await fixture(t), snapshotDirectory = path.join(f.root, "snapshot");
  await createSharedProjectSnapshot({ filename: f.filename, destination: snapshotDirectory, localStorageConfirmed: true });
  await assert.rejects(createSharedProjectSnapshot({ filename: f.filename, destination: snapshotDirectory, localStorageConfirmed: true }), { code: "EEXIST" });
  const bytes = await fs.readFile(f.filename);
  await assert.rejects(validateAndRestoreSharedProjectSnapshot({ snapshotDirectory, destination: f.filename, localStorageConfirmed: true }), { code: "EEXIST" });
  assert.deepEqual(await fs.readFile(f.filename), bytes);
});

test("veränderte Sicherungsbytes und fehlende lokale Bestätigung stoppen vor Restoreanlage", async (t) => {
  const f = await fixture(t), snapshotDirectory = path.join(f.root, "snapshot"), target = path.join(f.root, "restore.sqlite");
  await assert.rejects(createSharedProjectSnapshot({ filename: f.filename, destination: snapshotDirectory }), /bestätigt/);
  await createSharedProjectSnapshot({ filename: f.filename, destination: snapshotDirectory, localStorageConfirmed: true });
  await fs.appendFile(path.join(snapshotDirectory, "project.sqlite"), "corrupted");
  await assert.rejects(validateAndRestoreSharedProjectSnapshot({ snapshotDirectory, destination: target, localStorageConfirmed: true }), /Sicherungsbytes/);
  await assert.rejects(fs.stat(target), { code: "ENOENT" });
});

test("Konfiguration erlaubt nur explizite HTTPS-Adresse, keinen fremden Browserursprung und kein Überschreiben", async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "nas-config-"));
  t.after(() => fs.rm(assertTestTempPath(root), { recursive: true, force: true }));
  const configuration = createNasServiceConfiguration("https://project.example.org");
  assert.equal(configuration.host, "0.0.0.0"); assert.deepEqual(configuration.allowedOrigins, []);
  assert.ok(configuration.allowedHosts.includes("project.example.org"));
  for (const input of ["http://project.example.org", "https://a:b@project.example.org", "https://project.example.org/path", "https://localhost", "https://127.0.0.1"]) {
    assert.throws(() => createNasServiceConfiguration(input));
  }
  const filename = path.join(root, "service.json");
  await writeNasServiceConfiguration(filename, "https://project.example.org");
  await assert.rejects(writeNasServiceConfiguration(filename, "https://other.example.org"), { code: "EEXIST" });
  assert.deepEqual(JSON.parse(await fs.readFile(filename, "utf8")), configuration);
});
