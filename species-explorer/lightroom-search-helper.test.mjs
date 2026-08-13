import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createLightroomSearchRequestHandler,
  handleLightroomSearchRequestFile,
  LIGHTROOM_SEARCH_PROTOCOL_VERSION,
} from "./lightroom-search-helper.mjs";

function fakeStore() {
  return {
    closed: false,
    status: () => ({ available: true, packageId: "fixture" }),
    search: (query, options) => [{ query, options, masterTaxonId: "mtx_fixture" }],
    taxon: (id) => id === "mtx_fixture" ? { masterTaxonId: id } : null,
    close() { this.closed = true; },
  };
}

test("Suchhilfe beantwortet Status, Suche und Taxondetail über einen stabilen JSON-Vertrag", async () => {
  const store = fakeStore();
  const handler = await createLightroomSearchRequestHandler({
    searchRoot: "D:/fixture",
    openStore: async () => store,
  });
  try {
    const ping = await handler.handle({ requestId: "1", command: "ping" });
    assert.equal(ping.result.protocolVersion, LIGHTROOM_SEARCH_PROTOCOL_VERSION);
    assert.equal((await handler.handle({ command: "status" })).result.packageId, "fixture");
    const search = await handler.handle({
      command: "search",
      query: "Dunlin",
      kingdom: "Animalia",
      limit: 8,
    });
    assert.equal(search.result[0].query, "Dunlin");
    assert.deepEqual(search.result[0].options, { limit: 8, kingdom: "Animalia" });
    assert.equal(
      (await handler.handle({ command: "taxon", masterTaxonId: "mtx_fixture" }))
        .result.masterTaxonId,
      "mtx_fixture",
    );
    const missing = await handler.handle({ command: "taxon", masterTaxonId: "missing" });
    assert.equal(missing.error.code, "taxon-not-found");
  } finally {
    handler.close();
  }
  assert.equal(store.closed, true);
});

test("Nicht installiertes Paket wird verständlich gemeldet", async () => {
  const handler = await createLightroomSearchRequestHandler({
    searchRoot: "D:/missing",
    openStore: async () => ({ available: false, reason: "not-installed", close() {} }),
  });
  try {
    const response = await handler.handle({ command: "search", query: "Dunlin" });
    assert.equal(response.ok, false);
    assert.equal(response.error.code, "package-not-installed");
  } finally {
    handler.close();
  }
});

test("Einmalmodus schreibt genau eine atomare Antwortdatei", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lightroom-helper-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const requestPath = path.join(root, "request.json");
  const responsePath = path.join(root, "response.json");
  await fs.writeFile(requestPath, JSON.stringify({ requestId: "file", command: "status" }));
  const store = fakeStore();
  const response = await handleLightroomSearchRequestFile({
    requestPath,
    responsePath,
    searchRoot: root,
    createHandler: (options) => createLightroomSearchRequestHandler({
      ...options,
      openStore: async () => store,
    }),
  });
  assert.equal(response.result.packageId, "fixture");
  assert.deepEqual(JSON.parse(await fs.readFile(responsePath, "utf8")), response);
  assert.equal(store.closed, true);
});
