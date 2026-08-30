import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  lightroomSearchUpdateInternals,
  rebuildLightroomSearchPackage,
} from "./lightroom-search-update.mjs";

test("Lightroom-Paketfortschritt akzeptiert nur strukturierte Fortschrittszeilen", () => {
  assert.deepEqual(
    lightroomSearchUpdateInternals.parseProgressLine(
      '{"type":"progress","phase":"copy","percent":42,"message":"Taxa"}',
    ),
    { type: "progress", phase: "copy", percent: 42, message: "Taxa" },
  );
  assert.equal(
    lightroomSearchUpdateInternals.parseProgressLine('{"type":"result"}'),
    null,
  );
  assert.equal(lightroomSearchUpdateInternals.parseProgressLine("keine JSON-Zeile"), null);
});

test("Fehlerausgabe des Paketprozesses bleibt begrenzt", () => {
  const result = lightroomSearchUpdateInternals.appendBounded("abc", "defgh", 5);
  assert.equal(result, "defgh");
});

test("Paketneubau läuft als Hilfsprozess und bestätigt die aktive Masterversion", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lightroom-search-update-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const taxonomyRoot = path.join(root, "taxonomy");
  const searchRoot = path.join(root, "lightroom");
  await Promise.all([
    fs.mkdir(path.join(taxonomyRoot, "master", "active"), { recursive: true }),
    fs.mkdir(path.join(searchRoot, "active"), { recursive: true }),
  ]);
  await Promise.all([
    fs.writeFile(
      path.join(taxonomyRoot, "master", "active", "manifest.json"),
      `${JSON.stringify({ candidateId: "master-neu" })}\n`,
    ),
    fs.writeFile(
      path.join(searchRoot, "active", "manifest.json"),
      `${JSON.stringify({ packageId: "lightroom-neu", masterVersion: "master-neu" })}\n`,
    ),
  ]);
  const progress = [];
  const calls = [];
  function spawnProcess(command, args, options) {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    queueMicrotask(() => {
      child.stdout.end('{"type":"progress","phase":"copy","percent":42,"message":"Taxa"}\n');
      child.stderr.end();
      child.emit("close", 0);
    });
    return child;
  }

  const result = await rebuildLightroomSearchPackage({
    repoRoot: root,
    taxonomyRoot,
    searchRoot,
    projectRevision: "fixture",
    execPath: "node-fixture",
    spawnProcess,
    onProgress: (entry) => progress.push(entry),
  });

  assert.equal(result.active.packageId, "lightroom-neu");
  assert.equal(result.masterVersion, "master-neu");
  assert.equal(progress[0].percent, 42);
  assert.ok(calls[0].args.includes("--activate"));
  assert.ok(calls[0].args.includes("--progress-json"));
  assert.equal(calls[0].options.windowsHide, true);
});
