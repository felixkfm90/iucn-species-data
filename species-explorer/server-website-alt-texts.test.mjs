import assert from "node:assert/strict";
import test from "node:test";
import { createExplorerServer } from "./server.mjs";
import { createEditableFixture, registerFixtureCleanup, serverFixtureStoragePaths,
  withServerFixtureStorageEnvironment } from "./server-test-fixtures.mjs";

test("Bildtext-API schützt Freigaben und konkrete Übernahmeaufträge mit lokaler Sitzung", async (context) => {
  const root = await createEditableFixture(), register = registerFixtureCleanup(context, root), calls = [];
  const snapshot = { revision: "r1", pages: [], scan: { running: false }, summary: { pages: 0, images: 0 } };
  const service = Object.fromEntries(["snapshot", "discover", "scan", "draft", "approve", "verify", "connectTransfer", "transfer", "close"].map((action) =>
    [action, async (payload) => { calls.push({ action, payload }); return snapshot; }]));
  const server = await withServerFixtureStorageEnvironment(root, () => createExplorerServer({ repoRoot: root,
    ...serverFixtureStoragePaths(root), port: 0, websiteAltTextsService: service }));
  register(server);
  const address = await server.listen(), base = `http://127.0.0.1:${address.port}`;
  assert.deepEqual(calls, [], "kein automatischer Websiteabruf beim Serverstart");
  assert.deepEqual(await (await fetch(`${base}/api/website/alt-texts`)).json(), snapshot);
  assert.equal((await fetch(`${base}/api/website/alt-texts`, {
    headers: { Origin: "https://foreign.invalid", "Sec-Fetch-Site": "cross-site" } })).status, 403);
  assert.equal(calls.length, 1, "fremder Browser darf keine privaten Bildtextdaten lesen");
  const token = (await (await fetch(`${base}/api/session`)).json()).token;
  const post = (action, headers = {}) => fetch(`${base}/api/website/alt-texts/${action}`, { method: "POST",
    headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ revision: "r1", text: "Bildtext" }) });
  assert.equal((await post("approve")).status, 403);
  assert.equal((await post("transfer")).status, 403);
  assert.equal((await post("connect-transfer")).status, 403);
  assert.equal((await post("approve", { "X-Species-Explorer-Session": token, Origin: "https://foreign.invalid" })).status, 403);
  for (const action of ["discover", "scan", "draft", "approve", "verify", "connect-transfer", "transfer"]) {
    assert.equal((await post(action, { "X-Species-Explorer-Session": token })).status, 200);
  }
  assert.deepEqual(calls.map((call) => call.action), ["snapshot", "discover", "scan", "draft", "approve", "verify", "connectTransfer", "transfer"]);
  assert.equal((await post("publish", { "X-Species-Explorer-Session": token })).status, 405);
  const index = await (await fetch(base)).text();
  assert.match(index, /id="website-alt-texts-open"/);
  assert.match(index, /src="\/app-website-alt-texts.js"/);
  assert.equal((await fetch(`${base}/app-website-alt-texts.js`)).status, 200);
  assert.equal((await fetch(`${base}/website-alt-texts.css`)).status, 200);
});
