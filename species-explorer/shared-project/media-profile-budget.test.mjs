import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "../../scripts/test-temp.mjs";
import { createExplorerMediaBudgetReader } from "./media-profile-budget.mjs";

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "media-budget-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test("personal media budget counts only the fixed backup inputs and their live SQLite sidecars", async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, "device.json"), Buffer.alloc(30));
  await fs.writeFile(path.join(root, "project-cache.sqlite"), Buffer.alloc(100));
  await fs.writeFile(path.join(root, "project-cache.sqlite-wal"), Buffer.alloc(80));
  await fs.writeFile(path.join(root, "initial-import.sqlite"), Buffer.alloc(200));
  await fs.writeFile(path.join(root, "website-alt-sync.sqlite"), Buffer.alloc(300));
  await fs.writeFile(path.join(root, "page-authoring.sqlite"), Buffer.alloc(400));
  await fs.mkdir(path.join(root, "credentials"));
  await fs.writeFile(path.join(root, "credentials", "unread-private.bin"), Buffer.alloc(7000));
  await fs.mkdir(path.join(root, "local-ai"));
  await fs.writeFile(path.join(root, "local-ai", "unread-model.gguf"), Buffer.alloc(8000));
  await fs.writeFile(path.join(root, "other-user-file.bin"), Buffer.alloc(9000));
  const before = await fs.readdir(root), read = createExplorerMediaBudgetReader({ profileRoot: root });
  assert.deepEqual(await read({ additionalBytes: 70 }), { totalBytes: 1110 }, "the client adds the proposed admission reserve exactly once");
  assert.deepEqual(await fs.readdir(root), before, "budget reading creates no files or database handles");
  await fs.writeFile(path.join(root, "page-authoring.sqlite-wal"), Buffer.alloc(90));
  assert.deepEqual(await read(), { totalBytes: 1200 }, "every request reads current sizes rather than a cached former budget");
});

test("absent journals remain zero, oversized files stop and the existing total-package limit remains observable", async t => {
  const root = await fixture(t), read = createExplorerMediaBudgetReader({ profileRoot: root });
  assert.deepEqual(await read(), { totalBytes: 0 });
  const handle = await fs.open(path.join(root, "project-cache.sqlite"), "wx");
  try { await handle.truncate(512 * 1024 * 1024 + 1); } finally { await handle.close(); }
  await assert.rejects(read(), /nicht sicher/);
  await fs.truncate(path.join(root, "project-cache.sqlite"), 512 * 1024 * 1024);
  const second = await fs.open(path.join(root, "initial-import.sqlite"), "wx");
  try { await second.truncate(512 * 1024 * 1024); } finally { await second.close(); }
  await fs.writeFile(path.join(root, "device.json"), "x");
  assert.deepEqual(await read(), { totalBytes: 1024 * 1024 * 1024 + 1 });
});

test("unexpected directories and hardlinked profile files stop admission rather than being counted or followed", async t => {
  const root = await fixture(t), read = createExplorerMediaBudgetReader({ profileRoot: root });
  await fs.mkdir(path.join(root, "project-cache.sqlite"));
  await assert.rejects(read(), /nicht sicher/);
  await fs.rmdir(path.join(root, "project-cache.sqlite"));
  await fs.writeFile(path.join(root, "device.json"), "owned");
  await fs.link(path.join(root, "device.json"), path.join(root, "second-link.json"));
  await assert.rejects(read(), /nicht sicher/);
  assert.equal(await fs.readFile(path.join(root, "device.json"), "utf8"), "owned");
});

test("nonlocal roots and malformed requested reservations are rejected without directory discovery", async t => {
  for (const profileRoot of [undefined, "relative", "\\\\server\\share", "//server/share", "file:///private", `${path.parse(process.cwd()).root}\0bad`]) {
    assert.throws(() => createExplorerMediaBudgetReader({ profileRoot }));
  }
  const root = await fixture(t), read = createExplorerMediaBudgetReader({ profileRoot: root });
  for (const additionalBytes of [-1, 0.5, NaN, Infinity, "1"]) await assert.rejects(read({ additionalBytes }), /nicht sicher/);
});
