import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  discoverLatestCatalogueRelease,
  newestCatalogueRelease,
  taxonomyReleaseClientInternals,
} from "./taxonomy-release-client.mjs";

test("Releaseauswahl verwendet ausschließlich das neueste CoL-XR-Release", () => {
  const latest = newestCatalogueRelease([
    { key: 2, issued: "2026-07-01", alias: "alt", origin: "xrelease" },
    { key: 3, issued: "2026-07-20", alias: "Basis", origin: "release" },
    { key: 4, issued: "2026-07-17", alias: "neu", origin: "xrelease", size: 7_000_000 },
  ]);
  assert.equal(latest.releaseId, "col-xr-2026-07-17-4");
  assert.equal(latest.alias, "neu");
  assert.equal(latest.expectedNameUsages, 7_000_000);
  assert.match(latest.exportUrl, /dataset\/4\/export\.zip/);
});

test("Startprüfung lädt nur kleine Metadaten und verwendet danach den Cache", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "taxonomy-release-check-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const cachePath = path.join(root, "release-check.json");
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          result: [
            {
              key: 315834,
              issued: "2026-07-17",
              alias: "COL26.7 XR",
              origin: "xrelease",
              size: 7_200_000,
            },
          ],
        };
      },
    };
  };
  const now = () => new Date("2026-07-26T08:00:00.000Z");
  const first = await discoverLatestCatalogueRelease({
    fetchImpl,
    cachePath,
    now,
  });
  assert.equal(first.cached, false);
  assert.equal(urls.length, 1);
  assert.equal(urls[0], taxonomyReleaseClientInternals.RELEASE_QUERY);
  assert.doesNotMatch(urls[0], /export\.zip/);

  const second = await discoverLatestCatalogueRelease({
    fetchImpl: async () => {
      throw new Error("Der Cache hätte den Netzwerkabruf verhindern müssen.");
    },
    cachePath,
    now,
  });
  assert.equal(second.cached, true);
  assert.equal(second.latest.releaseId, first.latest.releaseId);
});

test("Downloadweiterleitungen bleiben auf freigegebene ChecklistBank-Ziele begrenzt", () => {
  const {
    isAllowedReleaseUrl,
    isAllowedDownloadUrl,
  } = taxonomyReleaseClientInternals;
  assert.equal(
    isAllowedReleaseUrl(new URL("https://api.checklistbank.org/dataset/315834/export.zip")),
    true,
  );
  assert.equal(
    isAllowedReleaseUrl(new URL("https://example.org/dataset/315834/export.zip")),
    false,
  );
  assert.equal(
    isAllowedDownloadUrl(
      new URL("https://download.checklistbank.org/job/73/01234567-89ab-cdef-0123-456789abcdef.zip"),
    ),
    true,
  );
  assert.equal(
    isAllowedDownloadUrl(new URL("https://download.checklistbank.org/other/file.zip")),
    false,
  );
});
