import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createExplorerRequestHandler, matchExplorerRoute } from "./request-router.mjs";
import { invokeSharedProjectOperation, matchProjectFeatureRoute } from "./project-feature-routes.mjs";
import { createLocalMutationBarrier } from "./local-mutation-barrier.mjs";
import { startUpdateWithCompletion } from "./update-completion/start.mjs";

test("Projekt- und Abschlussrouten bleiben hinter lokalen Sitzungs-/Originprüfungen", async (t) => {
  const calls = [];
  const handler = createExplorerRequestHandler({ host: "127.0.0.1", sessionToken: "fixture-token", publicDir: ".", repoRoot: ".",
    operations: { sharedProject: async (value) => { calls.push(value); return { ok: true }; },
      updateCompletion: async (value) => { calls.push(value); return { available: true }; } } });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  let response = await fetch(`${origin}/api/shared-project/connect`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(response.status, 403); await response.text(); assert.equal(calls.length, 0);
  response = await fetch(`${origin}/api/shared-project`, { headers: { origin: "https://foreign.invalid" } });
  assert.equal(response.status, 403); await response.text(); assert.equal(calls.length, 0);
  response = await fetch(`${origin}/api/shared-project/objects/species/eisvogel`, { method: "POST",
    headers: { "content-type": "application/json", "x-species-explorer-session": "fixture-token", origin },
    body: JSON.stringify({ data: { commonName: "Eisvogel" }, expectedEditRevision: "shown" }) });
  assert.equal(response.status, 200); await response.text();
  assert.equal(calls[0].action, "editExisting"); assert.equal(calls[0].id, "eisvogel");
  response = await fetch(`${origin}/api/taxonomy/update-completion/cancel`, { method: "POST",
    headers: { "content-type": "application/json", "x-species-explorer-session": "fixture-token", origin }, body: "{}" });
  assert.equal(response.status, 200); await response.text(); assert.equal(calls[1].action, "cancel");
  response = await fetch(`${origin}/api/shared-project/objects/species/eisvogel`, { method: "POST",
    headers: { "content-type": "application/json", "x-species-explorer-session": "fixture-token", origin },
    body: JSON.stringify({ data: { title: "Vollständige Seite", text: "x".repeat(30000) }, expectedEditRevision: "shown" }) });
  assert.equal(response.status, 200, "complete structured pages must fit beyond the small control-message limit"); await response.text();
  response = await fetch(`${origin}/api/shared-project/connect`, { method: "POST",
    headers: { "content-type": "application/json", "x-species-explorer-session": "fixture-token", origin },
    body: JSON.stringify({ password: "x".repeat(30000) }) });
  assert.equal(response.status, 413, "control and login requests retain the small limit"); await response.text();
  const pairing = `${origin}/api/shared-project/devices/pairing`;
  response = await fetch(pairing, { method: "POST", headers: { "content-type": "application/json", origin }, body: "{}" });
  assert.equal(response.status, 403); await response.text();
  response = await fetch(pairing, { method: "POST", headers: {
    "content-type": "application/json", "x-species-explorer-session": "fixture-token", origin },
  body: JSON.stringify({ projectId: "project", userId: "user" }) });
  assert.equal(response.status, 200); await response.text();
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(calls.at(-1).action, "issueReadPairing");
  assert.deepEqual(calls.at(-1).payload, { projectId: "project", userId: "user" });
});

test("lokale Routen stellen keine freie Bindungs-, Claim- oder native Ausführungsaktion bereit", () => {
  for (const path of ["/api/taxonomy/update-completion/execute", "/api/taxonomy/update-completion/bind", "/api/taxonomy/update-completion/claim"]) {
    assert.notEqual(matchExplorerRoute("POST", path).name, "update-completion");
  }
  assert.notEqual(matchExplorerRoute("GET", "/api/shared-project/users/11111111-1111-4111-8111-111111111111").name, "shared-project");
  assert.deepEqual(matchExplorerRoute("POST", "/api/shared-project/devices/11111111-1111-4111-8111-111111111111/revoke"),
    { name: "shared-project", action: "revokeDevice", id: "11111111-1111-4111-8111-111111111111" });
});

test("Projektadapter gibt nur benannte Methoden weiter und bleibt ohne Einrichtung ehrlich nicht verfügbar", async () => {
  assert.equal((await invokeSharedProjectOperation(null, { action: "snapshot" })).available, false);
  await assert.rejects(invokeSharedProjectOperation(null, { action: "connect" }), { statusCode: 503 });
  const received = [];
  await invokeSharedProjectOperation({ editExisting: (...args) => received.push(args) },
    { action: "editExisting", kind: "page", id: "athen", payload: { data: { title: "Athen" }, expectedEditRevision: "revision" } });
  assert.deepEqual(received, [["page", "athen", { data: { title: "Athen" }, expectedEditRevision: "revision" }]]);
  await assert.rejects(invokeSharedProjectOperation({}, { action: "close" }), { statusCode: 404 });
});

test("normaler gemeinsamer Arteditor erhält benannte Lese-/Vorschau-/Speicherrouten ohne lokale JSON-Umleitung", async () => {
  assert.deepEqual(matchExplorerRoute("GET", "/api/shared-project/species"), { name: "shared-project", action: "species-list" });
  assert.deepEqual(matchExplorerRoute("GET", "/api/shared-project/species/testkauz"), { name: "shared-project", action: "species-get", id: "testkauz" });
  assert.deepEqual(matchExplorerRoute("POST", "/api/shared-project/species/testkauz/preview"), { name: "shared-project", action: "species-preview", id: "testkauz" });
  assert.deepEqual(matchExplorerRoute("POST", "/api/shared-project/species/testkauz/save"), { name: "shared-project", action: "species-save", id: "testkauz" });
  for (const [method, url] of [["POST", "/api/shared-project/species"], ["GET", "/api/shared-project/species/testkauz/save"], ["POST", "/api/shared-project/species/testkauz/delete"]]) {
    assert.notEqual(matchExplorerRoute(method, url).name, "shared-project");
  }
  const calls = [], editor = Object.fromEntries(["list", "get", "preview", "save"].map((method) => [method, (...args) => { calls.push([method, ...args]); return { ok: true }; }]));
  for (const action of ["list", "get", "preview", "save"]) await invokeSharedProjectOperation({ speciesEditor: editor }, { action: `species-${action}`, id: "testkauz", payload: { token: "reviewed" } });
  assert.deepEqual(calls, [["list"], ["get", "testkauz"], ["preview", "testkauz", { token: "reviewed" }], ["save", "testkauz", { token: "reviewed" }]]);
});

test("gemeinsame Neuanlage hat ausschließlich ihre benannten bestätigungspflichtigen POST-Routen", async () => {
  const calls = [], service = { speciesCreation: Object.fromEntries(["preview", "create", "recover"].map(operation => [operation, payload => calls.push([operation, payload])])) };
  for (const operation of ["preview", "create", "recover"]) {
    const route = matchExplorerRoute("POST", `/api/shared-project/species/new/${operation}`);
    assert.deepEqual(route, { name: "shared-project", action: `species-create-${operation}` });
    await invokeSharedProjectOperation(service, { ...route, payload: { token: "own-preview" } });
    assert.notEqual(matchExplorerRoute("GET", `/api/shared-project/species/new/${operation}`).name, "shared-project");
  }
  assert.deepEqual(calls, [["preview", { token: "own-preview" }], ["create", { token: "own-preview" }], ["recover", { token: "own-preview" }]]);
});

test("Verfügbarkeit der gemeinsamen Artanlage ist ausdrücklich lesend und erhält keine Rendererquellen", async () => {
  const calls = [], service = { speciesCreation: { availability: (...args) => { calls.push(args); return { available: true }; } } };
  for (const method of ["GET", "HEAD"]) {
    assert.deepEqual(matchExplorerRoute(method, "/api/shared-project/species/new/availability"), { name: "shared-project", action: "species-create-availability" });
  }
  assert.notEqual(matchExplorerRoute("POST", "/api/shared-project/species/new/availability").name, "shared-project");
  await invokeSharedProjectOperation(service, { action: "species-create-availability", payload: { untrustedSource: "ignored" } });
  assert.deepEqual(calls, [[]]);
});

test("gemeinsame Artenansicht und Revision werden vor dem Art-ID-Matcher ausschließlich lesend zugeordnet", async () => {
  for (const method of ["GET", "HEAD"]) {
    assert.deepEqual(matchExplorerRoute(method, "/api/shared-project/species/workspace"), { name: "shared-project", action: "species-workspace" });
    assert.deepEqual(matchExplorerRoute(method, "/api/shared-project/species/workspace/revision"), { name: "shared-project", action: "species-workspace-revision" });
  }
  for (const path of ["/api/shared-project/species/workspace", "/api/shared-project/species/workspace/revision"]) {
    assert.notEqual(matchExplorerRoute("POST", path).name, "shared-project");
  }
  const calls = [], service = { speciesWorkspace: { read: () => { calls.push("read"); return { species: [] }; }, revision: () => { calls.push("revision"); return { revision: "bound" }; } } };
  assert.deepEqual(await invokeSharedProjectOperation(service, { action: "species-workspace" }), { species: [] });
  assert.deepEqual(await invokeSharedProjectOperation(service, { action: "species-workspace-revision" }), { revision: "bound" });
  assert.deepEqual(calls, ["read", "revision"]);
  await assert.rejects(invokeSharedProjectOperation(null, { action: "species-workspace" }), { statusCode: 503 });
});

test("Schließbarriere wartet begonnene Mutation ab und verhindert neue Aufträge bis zur Freigabe", async () => {
  const barrier = createLocalMutationBarrier(), finishWrite = barrier.enter();
  const acquiring = barrier.acquire();
  assert.equal(barrier.closing, true); assert.equal(barrier.active, 1);
  assert.throws(() => barrier.enter(), { statusCode: 409 });
  finishWrite(); finishWrite();
  const release = await acquiring;
  assert.equal(barrier.active, 0); assert.throws(() => barrier.enter());
  release(); release();
  barrier.enter()(); assert.equal(barrier.active, 0);
});

test("vollständige Artkonflikte verwenden eigene gebundene Lese-, Vorschau- und Übernahmewege", async () => {
  const id = "12345678-1234-4234-8234-123456789abc", root = "/api/shared-project/species/conflicts", calls = [];
  for (const method of ["GET", "HEAD"]) {
    assert.equal(matchProjectFeatureRoute(method, root).action, "species-conflicts-list");
    assert.equal(matchProjectFeatureRoute(method, `${root}/${id}`).action, "species-conflicts-get");
  }
  for (const method of ["POST", "GET", "DELETE"]) {
    for (const suffix of ["preview", "resolve"]) {
      const route = matchProjectFeatureRoute(method, `${root}/${id}/${suffix}`);
      assert.equal(route?.action ?? null, method === "POST" ? `species-conflicts-${suffix}` : null);
    }
  }
  const service = { speciesConflicts: Object.fromEntries(["list", "get", "preview", "resolve"].map((name) => [name, async (...args) => { calls.push([name, ...args]); return { name }; }])) };
  for (const [name, payload] of [["list"], ["get"], ["preview", { choices: {} }], ["resolve", { token: "shown" }]]) {
    await invokeSharedProjectOperation(service, { action: `species-conflicts-${name}`, id, payload });
  }
  assert.deepEqual(calls, [["list"], ["get", id], ["preview", id, { choices: {} }], ["resolve", id, { token: "shown" }]]);
  await assert.rejects(invokeSharedProjectOperation(null, { action: "species-conflicts-list" }), { statusCode: 503 });
});

test("interne Artfreigabe besitzt ausschließlich geschützte POST-Vorschau und expliziten Freigabeweg", async () => {
  const root = "/api/shared-project/species/fixture-owl/approval", calls = [];
  for (const method of ["GET", "HEAD", "DELETE", "POST"]) {
    for (const action of ["preview", "approve"]) {
      const route = matchProjectFeatureRoute(method, `${root}/${action}`);
      assert.equal(route?.action ?? null, method === "POST" ? `species-approval-${action}` : null);
    }
  }
  const service = { speciesApproval: { preview: async (...args) => { calls.push(["preview", ...args]); }, approve: async (...args) => { calls.push(["approve", ...args]); } } };
  await invokeSharedProjectOperation(service, { action: "species-approval-preview", id: "fixture-owl", payload: { expectedRevision: "shown" } });
  await invokeSharedProjectOperation(service, { action: "species-approval-approve", id: "fixture-owl", payload: { token: "reviewed" } });
  assert.deepEqual(calls, [["preview", "fixture-owl", { expectedRevision: "shown" }], ["approve", "fixture-owl", { token: "reviewed" }]]);
});

test("nicht abgeschlossene Mutation hebt nur den misslungenen Schließversuch wieder auf", async () => {
  const barrier = createLocalMutationBarrier({ timeoutMs: 10 }), finish = barrier.enter();
  await assert.rejects(barrier.acquire(), { statusCode: 409 });
  assert.equal(barrier.closing, false); assert.equal(barrier.active, 1);
  finish(); barrier.enter()();
});

test("Startadapter bindet Auswahl vor wirklichem Start und wiederholt keinen bestätigten Lauf", async () => {
  const events = [], choice = { action: "shutdown", deviceId: "device-fixture", requestId: "request" };
  const selection = { selectionId: "selection", deviceId: choice.deviceId };
  const completion = { prepareSelection: async () => { events.push("select"); return selection; },
    bindStartedRun: async ({ updateRunId }) => { events.push("bind"); selection.updateRunId = updateRunId; }, cancel: async () => events.push("cancel") };
  const workflow = { updateRunId: "actual-run", status: "waiting-lightroom" };
  const coordinator = { start: async (payload) => { assert.equal(payload.completion, undefined); events.push("start"); return workflow; }, status: async () => workflow };
  assert.deepEqual(await startUpdateWithCompletion({ coordinator, completion, payload: { confirmed: true, completion: choice } }), workflow);
  assert.deepEqual(events, ["select", "start", "bind"]);
  assert.deepEqual(await startUpdateWithCompletion({ coordinator, completion, payload: { completion: choice } }), workflow);
  assert.deepEqual(events, ["select", "start", "bind", "select"]);
});

test("Startfehler wählt Aktion ab; verlorene optionale Bindung behauptet keinen fehlgeschlagenen wirklichen Updatebeginn", async () => {
  let cancelled = 0;
  const completion = { prepareSelection: async () => ({ selectionId: "s", deviceId: "d" }),
    bindStartedRun: async () => { throw new Error("Binding failure"); }, cancel: async () => { cancelled++; } };
  await assert.rejects(startUpdateWithCompletion({ completion, coordinator: { start: async () => { throw new Error("Start failure"); } }, payload: { completion: {} } }), /Start failure/);
  assert.equal(cancelled, 1);
  const result = await startUpdateWithCompletion({ completion, coordinator: { start: async () => ({ updateRunId: "real" }) }, payload: { completion: {} } });
  assert.equal(result.updateRunId, "real"); assert.ok(result.completionWarning); assert.equal(cancelled, 2);
  await assert.rejects(startUpdateWithCompletion({ coordinator: {}, payload: { completion: { action: "shutdown" } } }), { statusCode: 409 });
});
