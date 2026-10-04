import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir, assertTestTempPath } from "./test-temp.mjs";
import { benchmarkScratchRoot, assertScratchPath, ensureBenchmarkScratch } from "./scratch-paths.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

test("Test-temp ist prozessgebunden im Explorer und unabhängig vom Arbeits-/Systemtemp", () => {
  const root = tmpdir();
  assert.equal(path.dirname(root), path.join(repoRoot, "temp", "tests"));
  assert.match(path.basename(root), new RegExp(`^s-${process.pid}-[a-f0-9]{8}$`, "u"));
  const owner = JSON.parse(fs.readFileSync(path.join(root, "owner.json"), "utf8"));
  assert.equal(owner.owner, "fn-explorer-tests");
  assert.equal(owner.pid, process.pid);
  assert.equal(tmpdir(), root);
  assert.throws(() => assertTestTempPath(path.join(repoRoot, "Daten")), /außerhalb/u);
  assert.throws(() => assertTestTempPath(path.join(repoRoot, "temp", "tests")), /außerhalb/u);
  assert.throws(() => assertTestTempPath(path.join(repoRoot, "temp", "tests-extra", "file")), /außerhalb/u);
});

test("Test- und Messpfade verweigern Verknüpfungen statt ihnen zu folgen", (t) => {
  const root = fs.mkdtempSync(path.join(tmpdir(), "no-links-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const target = path.join(root, "target"), link = path.join(root, "link");
  fs.mkdirSync(target);
  fs.symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => assertTestTempPath(path.join(link, "file")), /Verknüpfungen/u);
  assert.throws(() => assertScratchPath(root, { allowTests: true, inspectTree: true }), /Verknüpfte/u);
  fs.unlinkSync(link);
  assert.equal(assertTestTempPath(target), target);
});

test("Messungen/Prototypen bleiben unter temp und dürfen keinen übergeordneten Ordner bereinigen", () => {
  assert.equal(ensureBenchmarkScratch(), path.join(repoRoot, "temp", "benchmarks"));
  assert.throws(() => assertScratchPath(benchmarkScratchRoot), /eigenen Explorer-temp/u);
  assert.throws(() => assertScratchPath(path.join(repoRoot, "Testlauf", "old-proof")), /eigenen Explorer-temp/u);
  assert.throws(() => assertScratchPath(path.join(repoRoot, "Daten", "taxonomy")), /eigenen Explorer-temp/u);
});

test("Normales Testprozessende entfernt nur die leere eigene Session", () => {
  const helperUrl = new URL("./test-temp.mjs", import.meta.url).href;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e",
    `import { tmpdir } from ${JSON.stringify(helperUrl)}; console.log(tmpdir());`], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const root = result.stdout.trim();
  assertTestTempPath(root);
  assert.equal(fs.existsSync(root), false);
});

test("Unvollständig geschlossene Testreste bleiben erhalten statt pauschal gelöscht zu werden", () => {
  const helperUrl = new URL("./test-temp.mjs", import.meta.url).href;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e",
    `import fs from "node:fs"; import path from "node:path"; import { tmpdir } from ${JSON.stringify(helperUrl)};
     const root=tmpdir(); fs.writeFileSync(path.join(root,"own-leftover.txt"),"recoverable"); console.log(root);`], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const root = assertTestTempPath(result.stdout.trim());
  try { assert.equal(fs.readFileSync(path.join(root, "own-leftover.txt"), "utf8"), "recoverable"); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
});
