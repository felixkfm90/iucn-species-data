import { tmpdir } from "./test-temp.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { runTaxonomyPrototype } from "./taxonomy-prototype.mjs";

const FIXTURE_DIRECTORY = path.resolve(
  "scripts",
  "fixtures",
  "taxonomy",
  "col-xr-2026-07-17",
);

test("Messlauf importiert, validiert und misst den begrenzten Prototyp", async (context) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "taxonomy-prototype-cli-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const result = await runTaxonomyPrototype({
    fixtureDirectory: FIXTURE_DIRECTORY,
    taxonomyRoot: path.join(root, "taxonomy"),
  });
  assert.equal(result.mode, "import");
  assert.equal(result.releaseId, "col-xr-2026-07-17");
  assert.equal(result.import.validation.integrity, "ok");
  assert.equal(result.import.counts.taxa, 115);
  assert.ok(result.import.databaseBytes > result.import.sourceBytes);
  assert.ok(result.benchmark.coldOpenMs >= 0);
  assert.ok(result.benchmark.warmP95Ms >= 0);
  assert.equal(
    result.samples.find((entry) => entry.query === "Stie").firstResult,
    "Carduelis carduelis",
  );
  assert.equal(
    result.samples.find((entry) => entry.query === "Aotus").ambiguous,
    true,
  );
});

test("Prototyp verweigert Produktivziel und Reset eines verknüpften Testziels", async (t) => {
  await assert.rejects(runTaxonomyPrototype({ taxonomyRoot: path.resolve("Daten", "taxonomy") }), /Explorer-temp/u);
  const root = await fs.mkdtemp(path.join(tmpdir(), "prototype-reset-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const target = path.join(root, "target"), link = path.join(root, "link");
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, "keep.txt"), "keep");
  await fs.symlink(target, link, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(runTaxonomyPrototype({ taxonomyRoot: link, reset: true }), /Verknüpfungen/u);
  assert.equal(await fs.readFile(path.join(target, "keep.txt"), "utf8"), "keep");
  await fs.unlink(link);
});
