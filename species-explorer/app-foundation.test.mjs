import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./public/app-foundation.js", import.meta.url), "utf8");
const context = vm.createContext({ Headers });
new vm.Script(source, { filename: "app-foundation.js" }).runInContext(context);
const { createInitialExplorerState, createExplorerApiClient } = context.SpeciesExplorerFoundation;

function jsonResponse(payload, { ok = true } = {}) {
  return {
    ok,
    async json() {
      return payload;
    },
  };
}

test("Explorer-Zustand wird vollständig und je Aufruf unabhängig erzeugt", () => {
  const first = createInitialExplorerState();
  const second = createInitialExplorerState();

  assert.notEqual(first, second);
  assert.notEqual(first.species, second.species);
  assert.notEqual(first.filtered, second.filtered);
  assert.equal(first.selectedId, "");
  assert.equal(first.databaseNeedsUpdate, true);
  assert.equal(first.validationNeedsUpdate, true);
  assert.equal(first.sessionToken, "");

  first.species.push({ id: "test" });
  first.sessionToken = "session-a";
  assert.equal(second.species.length, 0);
  assert.equal(second.sessionToken, "");
});

test("API-Client baut die Sitzung einmal auf und schützt schreibende Anfragen", async () => {
  const calls = [];
  let sessionToken = "";
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/session") return jsonResponse({ token: "session-token" });
    return jsonResponse({ ok: true, url });
  };
  const client = createExplorerApiClient({
    fetchImpl,
    HeadersImpl: Headers,
    getSessionToken: () => sessionToken,
    setSessionToken: (token) => {
      sessionToken = token;
    },
  });

  await client.fetchJson("/api/settings/backup", {
    method: "POST",
    headers: { "X-Test": "value" },
    body: "{}",
  });
  await client.fetchJson("/api/pipeline/start", { method: "POST", body: "{}" });
  await client.fetchJson("/api/settings");

  assert.equal(calls.filter((call) => call.url === "/api/session").length, 1);
  assert.equal(sessionToken, "session-token");
  assert.equal(calls[1].options.credentials, "same-origin");
  assert.equal(calls[1].options.headers.get("Content-Type"), "application/json");
  assert.equal(calls[1].options.headers.get("X-Species-Explorer-Session"), "session-token");
  assert.equal(calls[1].options.headers.get("X-Test"), "value");
  assert.equal(calls[3].options.headers, undefined);
});

test("API-Client lädt einen konsistenten Explorer-Schnappschuss", async () => {
  const calls = [];
  const payloads = new Map([
    ["/api/reload", { ok: true }],
    ["/api/summary", { speciesCount: 49 }],
    ["/api/validation", { issueCount: 0 }],
    ["/api/species", [{ id: "turdusmerula" }]],
    ["/api/revision", { revision: "revision-1" }],
    ["/api/pending-changes", { hasPendingChanges: false }],
  ]);
  const client = createExplorerApiClient({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      return jsonResponse(payloads.get(url));
    },
    HeadersImpl: Headers,
  });

  const snapshot = await client.loadExplorerSnapshot({ reload: true });

  assert.deepEqual(calls.map((call) => call.url), [
    "/api/reload",
    "/api/summary",
    "/api/validation",
    "/api/species",
    "/api/revision",
    "/api/pending-changes",
  ]);
  assert.ok(calls.every((call) => call.options.credentials === "same-origin"));
  assert.equal(snapshot.summary.speciesCount, 49);
  assert.equal(snapshot.validation.issueCount, 0);
  assert.equal(snapshot.species[0].id, "turdusmerula");
  assert.equal(snapshot.revision.revision, "revision-1");
  assert.equal(snapshot.pendingChanges.hasPendingChanges, false);
});

test("API-Client erhält strukturierte Fehler und behandelt nicht erreichbare Revisionen", async () => {
  const errorClient = createExplorerApiClient({
    fetchImpl: async () => jsonResponse({
      error: "Eingabe ungültig",
      details: ["Detail"],
      fieldErrors: { german: "Pflichtfeld" },
    }, { ok: false }),
    HeadersImpl: Headers,
  });

  await assert.rejects(
    errorClient.fetchJson("/api/settings"),
    (error) => {
      assert.equal(error.message, "Eingabe ungültig");
      assert.deepEqual([...error.details], ["Detail"]);
      assert.equal(error.fieldErrors.german, "Pflichtfeld");
      return true;
    },
  );
  assert.equal(await errorClient.fetchRevision(), null);

  await assert.rejects(
    errorClient.loadExplorerSnapshot({ failureMessage: "Explorer-Daten unvollständig" }),
    /Explorer-Daten unvollständig/,
  );
});
