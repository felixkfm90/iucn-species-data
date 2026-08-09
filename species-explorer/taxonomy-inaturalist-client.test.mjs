import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { downloadInaturalistTaxonomyArchive } from "./taxonomy-inaturalist-client.mjs";

const ZIP = Buffer.from("504b030400000000", "hex");

async function root(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "taxonomy-inat-client-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

function zipResponse({ status = 200, etag = '"v1"' } = {}) {
  return new Response(status === 304 ? null : ZIP, {
    status,
    headers: status === 304 ? {} : {
      "content-length": String(ZIP.length),
      "content-type": "application/zip",
      etag,
      "last-modified": "Sat, 08 Aug 2026 08:00:00 GMT",
    },
  });
}

test("iNaturalist download is versioned and reused within the check interval", async (t) => {
  const taxonomyRoot = await root(t);
  let calls = 0;
  const first = await downloadInaturalistTaxonomyArchive({
    taxonomyRoot,
    fetchImpl: async () => {
      calls += 1;
      return zipResponse();
    },
    now: () => new Date("2026-08-08T10:00:00.000Z"),
    retryDelays: [],
  });
  assert.equal(first.cached, false);
  assert.match(first.providerVersion, /^inat-20260808-/);
  assert.equal((await fs.readFile(first.archivePath)).toString("hex"), ZIP.toString("hex"));
  const second = await downloadInaturalistTaxonomyArchive({
    taxonomyRoot,
    fetchImpl: async () => {
      calls += 1;
      throw new Error("should not be requested");
    },
    now: () => new Date("2026-08-08T11:00:00.000Z"),
    retryDelays: [],
  });
  assert.equal(second.cached, true);
  assert.equal(second.archivePath, first.archivePath);
  assert.equal(calls, 1);
});

test("iNaturalist download keeps the last working archive during an outage", async (t) => {
  const taxonomyRoot = await root(t);
  const first = await downloadInaturalistTaxonomyArchive({
    taxonomyRoot,
    fetchImpl: async () => zipResponse(),
    now: () => new Date("2026-08-01T10:00:00.000Z"),
    retryDelays: [],
  });
  const fallback = await downloadInaturalistTaxonomyArchive({
    taxonomyRoot,
    force: true,
    fetchImpl: async () => { throw new Error("offline"); },
    now: () => new Date("2026-08-08T10:00:00.000Z"),
    retryDelays: [],
  });
  assert.equal(fallback.cached, true);
  assert.equal(fallback.archivePath, first.archivePath);
  assert.match(fallback.warning, /letzte funktionierende lokale Stand/);
});

test("iNaturalist download rejects invalid archives before activation", async (t) => {
  const taxonomyRoot = await root(t);
  await assert.rejects(
    downloadInaturalistTaxonomyArchive({
      taxonomyRoot,
      fetchImpl: async () => new Response("not-a-zip", { status: 200 }),
      now: () => new Date("2026-08-08T10:00:00.000Z"),
      retryDelays: [],
    }),
    /kein gültiges ZIP-Archiv/,
  );
});
