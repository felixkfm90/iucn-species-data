import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { lightroomSearchPackageCliInternals } from "./lightroom-search-package.mjs";

test("Lightroom-Suchpaket-CLI trennt Build-, Prüf- und Rollbackoptionen", () => {
  const options = lightroomSearchPackageCliInternals.parseOptions([
    "build",
    "--activate",
    "--skip-checksum",
    "--taxonomy-root=D:/Taxonomy",
    "--search-root=D:/Lightroom",
    "--project-revision=fixture",
    "--json",
    "--progress-json",
  ]);
  assert.equal(options.command, "build");
  assert.equal(options.activate, true);
  assert.equal(options.skipChecksum, true);
  assert.equal(options.taxonomyRoot, path.resolve("D:/Taxonomy"));
  assert.equal(options.searchRoot, path.resolve("D:/Lightroom"));
  assert.equal(options.projectRevision, "fixture");
  assert.equal(options.json, true);
  assert.equal(options.progressJson, true);
});

test("Status ist der sichere Standardbefehl", () => {
  const options = lightroomSearchPackageCliInternals.parseOptions([]);
  assert.equal(options.command, "status");
  assert.equal(options.activate, false);
  assert.equal(options.skipChecksum, false);
  assert.equal(options.progressJson, false);
});
