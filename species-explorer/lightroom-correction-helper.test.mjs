import assert from "node:assert/strict";
import test from "node:test";

import { handleLightroomCorrectionRequest } from "./lightroom-correction-helper.mjs";

test("Korrekturhelfer löst die Art erneut aus dem aktiven Suchpaket auf", async () => {
  const calls = [];
  const store = {
    closed: false,
    status: () => ({ packageId: "lightroom-fixture", masterVersion: "master-fixture" }),
    taxon: (masterTaxonId) => ({
      masterTaxonId,
      acceptedScientificName: "Macroglossum stellatarum",
      rank: "species",
    }),
    close() { this.closed = true; },
  };
  const result = await handleLightroomCorrectionRequest({
    requestId: "lua-request",
    masterTaxonId: "mtx_fixture",
  }, {
    searchRoot: "D:/fixture",
    openStore: async () => store,
    createHandoff: async (payload) => {
      calls.push(payload);
      return { requestId: "handoff", launched: true };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.result.launched, true);
  assert.equal(calls[0].taxon.masterTaxonId, "mtx_fixture");
  assert.equal(calls[0].packageStatus.masterVersion, "master-fixture");
  assert.equal(store.closed, true);
});

test("Korrekturhelfer startet ohne eindeutige Art keine Übergabe", async () => {
  let handoffCalled = false;
  const result = await handleLightroomCorrectionRequest({ masterTaxonId: "mtx_missing" }, {
    searchRoot: "D:/fixture",
    openStore: async () => ({
      taxon: () => null,
      status: () => ({}),
      close() {},
    }),
    createHandoff: async () => { handoffCalled = true; },
  });
  assert.equal(result.ok, false);
  assert.match(result.error.message, /aktiven Suchpaket nicht gefunden/);
  assert.equal(handoffCalled, false);
});
