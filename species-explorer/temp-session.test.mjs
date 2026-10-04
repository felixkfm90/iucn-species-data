import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { cleanupOrphanTempSessions, createManagedTempSession } from "./temp-session.mjs";
import { tmpdir } from "../scripts/test-temp.mjs";

async function fixture(context) {
  const directory = tmpdir();
  const repoRoot = await mkdtemp(path.join(directory, "temp-session-"));
  context.after(() => rm(repoRoot, { recursive: true, force: true }));
  return repoRoot;
}

test("own close removes only registered disposable files; durable and foreign files remain", async (context) => {
  const repoRoot = await fixture(context);
  const session = await createManagedTempSession({ repoRoot });
  const disposable = await session.filePath("preview.jpg");
  const durable = await session.filePath("pending-review.json", { durable: true });
  await writeFile(disposable, "temporary");
  await writeFile(durable, "review survives");
  await writeFile(path.join(session.root, "foreign.txt"), "foreign");
  const result = await session.close();
  assert.deepEqual(result.removed, [disposable]);
  assert.equal(await readFile(durable, "utf8"), "review survives");
  assert.equal(await readFile(path.join(session.root, "foreign.txt"), "utf8"), "foreign");
  assert.equal((await session.close()).removed.length, 1, "idempotent result; no second deletion");
});

test("shutdown refuses new operations and waits for existing helper operation before cleanup", async (context) => {
  const repoRoot = await fixture(context);
  const session = await createManagedTempSession({ repoRoot });
  const release = await session.beginOperation();
  const file = await session.filePath("command.log");
  await writeFile(file, "busy");
  assert.equal((await session.close()).pending, true);
  assert.equal(await readFile(file, "utf8"), "busy");
  await assert.rejects(session.filePath("new.txt"), /geschlossen/);
  await assert.rejects(session.beginOperation(), /Schließung/);
  assert.deepEqual((await release()).removed, [file]);
  assert.deepEqual((await release()).removed, [file]);
  await assert.rejects(readFile(file), { code: "ENOENT" });
});

test("orphan cleanup preserves all active or uncheckable owners and active helper processes", async (context) => {
  const repoRoot = await fixture(context);
  const owner = await createManagedTempSession({ repoRoot, pid: 101 });
  const helper = await createManagedTempSession({ repoRoot, pid: 102 });
  const ownerFile = await owner.filePath("a.txt");
  const helperFile = await helper.filePath("b.txt");
  await writeFile(ownerFile, "owner active");
  await writeFile(helperFile, "helper active");
  await helper.registerHelper(201);
  const result = await cleanupOrphanTempSessions({ repoRoot, isProcessAlive: (pid) => [101, 201].includes(pid) });
  assert.equal(result.removed.length, 0);
  assert.equal(result.kept.length, 2);
  assert.equal(await readFile(ownerFile, "utf8"), "owner active");
  assert.equal(await readFile(helperFile, "utf8"), "helper active");
});

test("dead-owner crash recovery removes registered files but never journals, sibling sessions or arbitrary roots", async (context) => {
  const repoRoot = await fixture(context);
  const dead = await createManagedTempSession({ repoRoot, pid: 101 });
  const sibling = await createManagedTempSession({ repoRoot, pid: 102 });
  const file = await dead.filePath("request.json");
  const journal = await dead.filePath("recovery.json", { durable: true });
  const siblingFile = await sibling.filePath("keep.txt");
  await writeFile(file, "request");
  await writeFile(journal, "recovery");
  await writeFile(siblingFile, "other running owner");
  const result = await cleanupOrphanTempSessions({ repoRoot, isProcessAlive: (pid) => pid === 102 });
  assert.deepEqual(result.removed, [file]);
  assert.equal(await readFile(journal, "utf8"), "recovery");
  assert.equal(await readFile(siblingFile, "utf8"), "other running owner");
  assert.equal((await cleanupOrphanTempSessions({ repoRoot, isProcessAlive: (pid) => pid === 102 })).removed.length, 0);
});

test("malformed ownership and traversal paths cannot authorize deletion", async (context) => {
  const repoRoot = await fixture(context);
  const session = await createManagedTempSession({ repoRoot, pid: 101 });
  await assert.rejects(session.filePath("../outside.txt"), /Ungültig/);
  await assert.rejects(session.filePath("nested/file.txt"), /unmittelbar/);
  await assert.rejects(session.filePath(".fn-temp-session.json"), /Reserviert/);
  const outside = path.join(repoRoot, "outside.txt");
  await writeFile(outside, "safe");
  const manifestPath = path.join(session.root, ".fn-temp-session.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.artifacts.push({ relative: "../../../../outside.txt", type: "file", durable: false });
  await writeFile(manifestPath, JSON.stringify(manifest));
  const result = await cleanupOrphanTempSessions({ repoRoot, isProcessAlive: () => false });
  assert.equal(result.removed.length, 0);
  assert.equal(await readFile(outside, "utf8"), "safe");
});

test("links in roots and artifacts are retained instead of followed", async (context) => {
  const repoRoot = await fixture(context);
  const session = await createManagedTempSession({ repoRoot, pid: 101 });
  const file = await session.filePath("preview.txt");
  const outside = path.join(repoRoot, "outside");
  await mkdir(outside);
  await writeFile(path.join(outside, "safe.txt"), "keep");
  // Directory junctions do not require symbolic-link privileges on Windows.
  await symlink(outside, file, process.platform === "win32" ? "junction" : "dir");
  const result = await cleanupOrphanTempSessions({ repoRoot, isProcessAlive: () => false });
  assert.equal(result.removed.length, 0);
  assert.ok(result.errors.some((item) => /link/i.test(item.error)));
  assert.equal(await readFile(path.join(outside, "safe.txt"), "utf8"), "keep");
  const linkedRepo = path.join(repoRoot, "linked-repo");
  await mkdir(linkedRepo);
  await symlink(outside, path.join(linkedRepo, "temp"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(createManagedTempSession({ repoRoot: linkedRepo }), /link/i);
});

test("foreign files are not taken over and a normal empty session close removes its directory", async (context) => {
  const repoRoot = await fixture(context);
  const session = await createManagedTempSession({ repoRoot });
  await writeFile(path.join(session.root, "foreign.txt"), "foreign");
  await assert.rejects(session.filePath("foreign.txt"), /fremde/);
  await session.close();
  const empty = await createManagedTempSession({ repoRoot });
  assert.equal((await empty.close()).errors.length, 0);
  await assert.rejects(readFile(path.join(empty.root, ".fn-temp-session.json")), { code: "ENOENT" });
});
