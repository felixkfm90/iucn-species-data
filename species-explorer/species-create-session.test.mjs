import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createExplorerServer } from "./server.mjs";
import { createEditableFixture, createTestPng, createTestWebp } from "./server-test-fixtures.mjs";

test("Artentwurf und geprüftes Portrait bleiben tagelang gültig; Abbruch entfernt nur den eigenen Entwurf", async (t) => {
  const repoRoot = await createEditableFixture();
  t.after(() => rm(repoRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 }));
  const server = await createExplorerServer({ repoRoot, port: 0, sessionProtection: false,
    publishAssetChanges: false, rebuildReportAfterAssetSave: false,
    portraitRenderer: async ({ outputPath }) => {
      await writeFile(outputPath, createTestWebp(12));
      return { width: 1280, height: 1600 };
    },
  });
  t.after(() => server.close());
  const address = await server.listen();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const post = async (route, body) => {
    const response = await fetch(`${baseUrl}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, ...(await response.json()) };
  };
  const values = { german: "Testvogel", english: "Test Bird", scientificName: "Testus avis", size: "ca. 20 cm", weight: "ca. 50 g", lifeExpectancy: "ca. 5 Jahre" };
  const original = await readFile(join(repoRoot, "species_list.json"), "utf8");
  const draft = await post("/api/species/new/preview", { values });
  assert.equal(draft.status, 200, JSON.stringify(draft));
  assert.equal(draft.expiresAt, null);
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  t.mock.timers.tick(24 * 3600 * 1000);
  const portrait = await post("/api/species/new/portrait-preview", {
    token: draft.token, originalName: "Testvogel.png", imageBase64: createTestPng(1280, 1600).toString("base64"),
  });
  assert.equal(portrait.status, 200, JSON.stringify(portrait));
  assert.equal(portrait.expiresAt, null);
  const other = await post("/api/species/new/preview", { values: { ...values, german: "Anderer Vogel", scientificName: "Testus alter" } });
  assert.equal((await post("/api/species/new/discard", { token: other.token })).discarded, true);
  assert.equal((await post("/api/species/new/save", { token: other.token })).status, 409);
  assert.equal(await readFile(join(repoRoot, "species_list.json"), "utf8"), original);
  t.mock.timers.tick(24 * 3600 * 1000);
  const saved = await post("/api/species/new/save", { token: draft.token });
  assert.equal(saved.status, 200, JSON.stringify(saved));
  const image = await post(`/api/species/${saved.derived.slug}/assets/portrait/save`, { token: portrait.token, publish: false });
  assert.equal(image.status, 200, JSON.stringify(image));
  assert.ok((await readFile(join(repoRoot, "species-assets", "Testvogel", "portrait.webp"))).length);
  assert.equal((await post("/api/species/new/save", { token: draft.token })).status, 409);
  assert.equal((await post("/api/species/new/discard", { token: draft.token })).discarded, false);
  assert.equal(JSON.parse(await readFile(join(repoRoot, "species_list.json"), "utf8")).filter((item) => item.german === "Testvogel").length, 1);
  t.mock.timers.reset();
});
