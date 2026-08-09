import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { atomicWriteJson } from "./taxonomy-storage.mjs";

test("parallele atomare JSON-Schreibvorgänge verwenden getrennte temporäre Dateien", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "taxonomy-atomic-write-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const target = path.join(root, "release-check.json");

  await Promise.all(Array.from({ length: 12 }, (_, index) => (
    atomicWriteJson(target, { index, value: `Prüfung ${index}` })
  )));

  const stored = JSON.parse(await fs.readFile(target, "utf8"));
  assert.equal(stored.index, 11);
  assert.equal(stored.value, "Prüfung 11");
  assert.deepEqual(await fs.readdir(root), ["release-check.json"]);
});
