import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createExplorerServer } from "./server.mjs";
import { createEditableFixture, registerFixtureCleanup, serverFixtureStoragePaths } from "./server-test-fixtures.mjs";
import { fixture } from "./shared-project/test-fixtures.mjs";
import { createSharedProjectHttp } from "./shared-project/http.mjs";
import { createMemoryCredentialStore } from "./shared-project/client.mjs";

const values = { german: "Gemeinsamer Testvogel", english: "Shared test bird", scientificName: "Fictus communis", size: "20 cm", weight: "50 g", lifeExpectancy: "5 Jahre" };
async function setup(t, { loseResponse = false, changeUserAtPost = false } = {}) {
  const project = fixture(); let remote, server, writes = 0;
  t.after(async () => { await server?.close(); await remote?.close(); project.cleanup(); });
  const initialized = await project.initialized(); remote = createSharedProjectHttp({ store: initialized.store }); const address = await remote.listen();
  const repoRoot = await createEditableFixture(), register = registerFixtureCleanup(t, repoRoot);
  const localFiles = ["species_list.json", "speciesData.json"];
  const original = await Promise.all(localFiles.map(name => fs.readFile(path.join(repoRoot, name))));
  server = await createExplorerServer({ repoRoot, ...serverFixtureStoragePaths(repoRoot), port: 0,
    websitePagesService: { snapshot: async () => ({ pages: [] }) },
    websiteAltTextsService: { snapshot: async () => ({ transfer: { running: false } }), close: async () => {} },
    sharedProjectOptions: { filename: path.join(project.root, "personal.sqlite"), localStorageConfirmed: true, allowLoopbackHttp: true,
      credentialStore: createMemoryCredentialStore(), fetchImpl: async (url, options) => {
        if (changeUserAtPost && options?.method === "POST" && String(url).endsWith("/api/v1/objects")) {
          changeUserAtPost = false;
          const input = JSON.parse(options.body), current = initialized.store.me(initialized.a.token);
          assert.equal(input.boundSpeciesCreation, true); assert.equal(input.expectedUserVersion, current.version);
          initialized.store.updateUser(initialized.b.token, current.id, { expectedVersion: current.version, displayName: "Updated during own creation test" });
        }
        const response = await fetch(url, options);
        if (options?.method === "POST" && String(url).endsWith("/api/v1/objects")) {
          writes++;
          if (loseResponse) { loseResponse = false; await response.arrayBuffer(); throw new Error("Own lost write acknowledgement"); }
        }
        return response;
      } } });
  register(server); const local = await server.listen(), origin = `http://127.0.0.1:${local.port}`;
  const { token } = await (await fetch(`${origin}/api/session`)).json();
  const post = async (route, body) => {
    const response = await fetch(`${origin}${route}`, { method: "POST", headers: { "Content-Type": "application/json", origin,
      "x-species-explorer-session": token }, body: JSON.stringify(body) });
    return { status: response.status, value: await response.json() };
  };
  const connected = await post("/api/shared-project/connect", { baseUrl: address.url, username: initialized.a.user.username, password: project.password });
  assert.equal(connected.status, 200); assert.ok(connected.value.status.user.version > 0);
  const workspace = await (await fetch(`${origin}/api/shared-project/species/workspace`)).json();
  return { ...initialized, repoRoot, post, sourceScope: workspace.workspace.sourceScope, writes: () => writes,
    async availability() {
      const response = await fetch(`${origin}/api/shared-project/species/new/availability`);
      return { status: response.status, value: await response.json() };
    },
    async assertLocalPreserved() {
      assert.deepEqual(await Promise.all(localFiles.map(name => fs.readFile(path.join(repoRoot, name)))), original);
      await assert.rejects(fs.access(path.join(repoRoot, "species-assets", values.german)), { code: "ENOENT" });
    } };
}

test("actual Explorer creates one source-bound shared draft while local species and media stay untouched", async t => {
  const f = await setup(t), availability = await f.availability();
  assert.equal(availability.status, 200); assert.deepEqual(availability.value, { available: true, source: "shared-project", sourceScope: f.sourceScope });
  assert.equal(f.writes(), 0); await f.assertLocalPreserved();
  const preview = await f.post("/api/shared-project/species/new/preview", { sourceScope: f.sourceScope, values });
  assert.equal(preview.status, 200, JSON.stringify(preview)); assert.equal(preview.value.species.id, "fictuscommunis");
  assert.equal(f.writes(), 0); await f.assertLocalPreserved();
  const created = await f.post("/api/shared-project/species/new/create", { token: preview.value.token });
  assert.equal(created.status, 200, JSON.stringify(created)); assert.equal(created.value.created, true);
  assert.equal(created.value.approvalPerformed, false); assert.equal(created.value.externalPublication, "not-performed");
  const object = f.store.getObject(f.a.token, "species", "fictuscommunis");
  assert.equal(object.approval, "draft"); assert.equal(object.data.input.german, values.german);
  assert.equal(object.data.generated, null); assert.deepEqual(object.data.assets.files, {});
  assert.equal(object.data.editorial.websiteUrl, null); assert.equal(f.writes(), 1); await f.assertLocalPreserved();
  const repeated = await f.post("/api/shared-project/species/new/create", { token: preview.value.token });
  assert.equal(repeated.status, 409); assert.equal(f.writes(), 1);
});

test("lost shared creation response recovers through explicit fresh server read without a second POST", async t => {
  const f = await setup(t, { loseResponse: true });
  const preview = await f.post("/api/shared-project/species/new/preview", { sourceScope: f.sourceScope, values }); assert.equal(preview.status, 200);
  const lost = await f.post("/api/shared-project/species/new/create", { token: preview.value.token }); assert.notEqual(lost.status, 200);
  assert.equal(f.writes(), 1); assert.equal(f.store.listObjects(f.a.token).length, 1);
  const refreshed = await f.post("/api/shared-project/refresh", {}); assert.equal(refreshed.status, 200);
  const recovered = await f.post("/api/shared-project/species/new/recover", { token: preview.value.token });
  assert.equal(recovered.status, 200, JSON.stringify(recovered)); assert.equal(recovered.value.recovered, true);
  assert.equal(recovered.value.created, false); assert.equal(f.writes(), 1); await f.assertLocalPreserved();
});

test("read-only recovery before any delivered create request cannot turn its ready token into a write", async t => {
  const f = await setup(t), preview = await f.post("/api/shared-project/species/new/preview", { sourceScope: f.sourceScope, values });
  assert.equal(preview.status, 200); assert.equal(f.writes(), 0);
  const recovered = await f.post("/api/shared-project/species/new/recover", { token: preview.value.token });
  assert.equal(recovered.status, 409); assert.equal(f.writes(), 0); assert.equal(f.store.listObjects(f.a.token).length, 0);
  const delayed = await f.post("/api/shared-project/species/new/create", { token: preview.value.token });
  assert.equal(delayed.status, 409); assert.equal(f.writes(), 0); await f.assertLocalPreserved();
});

test("actual Explorer creation stops a user-version change after client verification and before server commit", async t => {
  const f = await setup(t, { changeUserAtPost: true });
  const preview = await f.post("/api/shared-project/species/new/preview", { sourceScope: f.sourceScope, values }); assert.equal(preview.status, 200);
  const changed = await f.post("/api/shared-project/species/new/create", { token: preview.value.token });
  assert.equal(changed.status, 409, JSON.stringify(changed)); assert.match(JSON.stringify(changed.value), /Berechtigung|Person/);
  assert.equal(f.store.listObjects(f.a.token).length, 0); assert.equal(f.writes(), 1); await f.assertLocalPreserved();
});
