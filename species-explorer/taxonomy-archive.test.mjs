import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  extractTaxonomyArchive,
  TAXONOMY_ARCHIVE_LIMITS,
  validateArchiveEntryName,
} from "./taxonomy-archive.mjs";
import { TAXONOMY_PACKAGE_LIMITS } from "./taxonomy-package.mjs";

function createSuccessfulSpawn(capture) {
  return (_command, args, options) => {
    capture.args = args;
    capture.options = options;
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    queueMicrotask(() => {
      child.stdout.write("PROGRESS\t25\t21100\n");
      child.stdout.write(
        `RESULT\t${JSON.stringify({
          entries: 21_100,
          expandedBytes: 1_024,
          destination: "D:\\taxonomy",
        })}\n`,
      );
      child.stdout.end();
      child.stderr.end();
      setImmediate(() => child.emit("close", 0));
    });
    return child;
  };
}

test("Archivgrenze erlaubt den realen CoL-Umfang mit Sicherheitsreserve", () => {
  assert.ok(TAXONOMY_ARCHIVE_LIMITS.maxEntries >= 50_000);
  assert.ok(TAXONOMY_ARCHIVE_LIMITS.maxEntries > 21_100);
  assert.equal(
    TAXONOMY_PACKAGE_LIMITS.maxFiles,
    TAXONOMY_ARCHIVE_LIMITS.maxEntries,
    "Entpack- und Paketprüfung müssen dieselbe Dateigrenze verwenden.",
  );
  assert.equal(TAXONOMY_ARCHIVE_LIMITS.maxExpandedBytes, 24 * 1024 ** 3);
  assert.equal(TAXONOMY_ARCHIVE_LIMITS.maxCompressionRatio, 300);
});

test("Entpackprozess übergibt alle Sicherheitsgrenzen ausdrücklich", async () => {
  const capture = {};
  const progress = [];
  const result = await extractTaxonomyArchive({
    archivePath: "catalogue.zip",
    destinationPath: "taxonomy-package",
    spawnImpl: createSuccessfulSpawn(capture),
    onProgress: (entry) => progress.push(entry),
  });
  const valueAfter = (name) => capture.args[capture.args.indexOf(name) + 1];
  assert.equal(
    valueAfter("-MaxExpandedBytes"),
    String(TAXONOMY_ARCHIVE_LIMITS.maxExpandedBytes),
  );
  assert.equal(valueAfter("-MaxEntries"), String(TAXONOMY_ARCHIVE_LIMITS.maxEntries));
  assert.equal(
    valueAfter("-MaxCompressionRatio"),
    String(TAXONOMY_ARCHIVE_LIMITS.maxCompressionRatio),
  );
  assert.equal(capture.options.windowsHide, true);
  assert.equal(result.entries, 21_100);
  assert.deepEqual(progress, [{
    phase: "extract",
    current: 25,
    total: 21_100,
    message: "Referenzpaket wird sicher entpackt",
  }]);
});

test("Archivpfade bleiben innerhalb des vorgesehenen Zielverzeichnisses", () => {
  assert.equal(validateArchiveEntryName("dataset/NameUsage.tsv"), "dataset/NameUsage.tsv");
  assert.throws(() => validateArchiveEntryName("../active.json"), /Unzulässiger Pfad/);
  assert.throws(() => validateArchiveEntryName("C:\\Windows\\system.ini"), /Unzulässiger Pfad/);
  assert.throws(() => validateArchiveEntryName("/etc/passwd"), /Unzulässiger Pfad/);
});
