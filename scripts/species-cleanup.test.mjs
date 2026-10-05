import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { tmpdir } from "./test-temp.mjs";
import { buildCleanupPlan, runCleanup, runSpeciesCleanup } from "./species-cleanup.mjs";
import { validateProjectState } from "./validate-project-state.mjs";
import { createEditableFixture, createTestWebp, registerFixtureCleanup } from "../species-explorer/server-test-fixtures.mjs";

const jsonFiles = ["species_list.json", "speciesData.json", "lastSavedAssessmentId.json",
  "species-assets-overrides.json", "species-taxonomy-overrides.json", "fehlende_elemente_report.json"];

function snapshot(root) {
  return Object.fromEntries(jsonFiles.map((name) => {
    const filename = path.join(root, name);
    return [name, fs.existsSync(filename) ? fs.readFileSync(filename) : null];
  }));
}

function assertUnchanged(root, before, names = jsonFiles) {
  const after = snapshot(root);
  for (const name of names) assert.deepEqual(after[name], before[name], `${name} unverändert`);
}

function writeJson(root, filename, value) {
  fs.writeFileSync(path.join(root, filename), `${JSON.stringify(value, null, 2)}\n`);
}

test("Bereinigung ohne Artreste verändert keine Dateien und legt keine Registries an", (context) => {
  const root = fs.mkdtempSync(path.join(tmpdir(), "cleanup-noop-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeJson(root, "species_list.json", []);
  writeJson(root, "speciesData.json", []);
  writeJson(root, "fehlende_elemente_report.json", { generatedAt: "unchanged", counts: { totalSpecies: 0 } });
  const before = snapshot(root);

  const cleaned = runSpeciesCleanup(root, { slug: "ciconianigra", safeName: "Schwarzstorch" });
  assert.equal(cleaned.generatedDataDeleted, false);
  assert.equal(cleaned.overrideDeleted, false);
  assert.equal(cleaned.taxonomyOverrideDeleted, false);
  assert.equal(cleaned.assetDirectoryDeleted, false);
  assertUnchanged(root, before);
  assert.equal(runCleanup(root).cleaned, false);
  assertUnchanged(root, before);
  assert.equal(fs.existsSync(path.join(root, "species-explorer", "cleanup-trash")), false);
});

test("Artbereinigung entfernt nur die Zielart und erhält fremde Taxonomie bytegetreu", async (context) => {
  const root = await createEditableFixture();
  registerFixtureCleanup(context, root);
  const generated = JSON.parse(fs.readFileSync(path.join(root, "speciesData.json"), "utf8"));
  writeJson(root, "speciesData.json", [...generated, { URLSlug: "ciconianigra", "Deutscher Name": "Schwarzstorch" }]);
  writeJson(root, "lastSavedAssessmentId.json", { Amsel: 1, Schwarzstorch: 2 });
  const registry = { version: 1, assets: { Amsel: { sound: { manual: true, reason: "behalten" } },
    Schwarzstorch: { sound: { manual: true } } }, spectrogramGenerator: { version: 3 } };
  writeJson(root, "species-assets-overrides.json", registry);
  fs.writeFileSync(path.join(root, "species-taxonomy-overrides.json"),
    '{"version":1,"species":{"turdusmerula":{"fields":{"Family":"Turdidae"}}}}\n');
  const assetDir = path.join(root, "species-assets", "Schwarzstorch");
  fs.mkdirSync(assetDir);
  fs.writeFileSync(path.join(assetDir, "map.jpg"), "test-map");
  const before = snapshot(root);

  const cleaned = runSpeciesCleanup(root, { slug: "ciconianigra", safeName: "Schwarzstorch" });
  assert.equal(cleaned.generatedDataDeleted, true);
  assert.equal(cleaned.assessmentDeleted, true);
  assert.equal(cleaned.overrideDeleted, true);
  assert.equal(cleaned.taxonomyOverrideDeleted, false);
  assert.equal(cleaned.assetDirectoryDeleted, true);
  assert.equal(fs.existsSync(assetDir), false);
  assertUnchanged(root, before, ["species_list.json", "species-taxonomy-overrides.json"]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "speciesData.json"), "utf8")), generated);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "lastSavedAssessmentId.json"), "utf8")), { Amsel: 1 });
  delete registry.assets.Schwarzstorch;
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "species-assets-overrides.json"), "utf8")), registry);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "fehlende_elemente_report.json"), "utf8")).counts.totalSpecies, 1);
  for (const name of jsonFiles) assert.equal(fs.readFileSync(path.join(root, name), "utf8").endsWith("\n"), true);

  const after = snapshot(root);
  runSpeciesCleanup(root, { slug: "ciconianigra", safeName: "Schwarzstorch" });
  assertUnchanged(root, after);
});

test("Verwaister Schwarzstorch-Override wird gezielt bereinigt und besteht die Publikationsprüfung", async (context) => {
  const root = await createEditableFixture();
  registerFixtureCleanup(context, root);
  fs.writeFileSync(path.join(root, "species-assets", "Amsel", "portrait.webp"), createTestWebp());
  writeJson(root, "species-assets/Amsel/portrait.json", { german_name: "Amsel" });
  writeJson(root, "lastSavedAssessmentId.json", { Amsel: 1 });
  writeJson(root, "species-assets-overrides.json", { version: 1, assets: {
    Schwarzstorch: { sound: { manual: true, reason: "Nach Pipeline-Import" } },
  } });
  fs.writeFileSync(path.join(root, "species-taxonomy-overrides.json"), '{"version":1,"species":{}}\n');
  const before = snapshot(root);
  const rejected = await validateProjectState(root);
  assert.deepEqual(rejected.errors, ["Verwaister Override-Eintrag: Schwarzstorch"]);
  assert.deepEqual(buildCleanupPlan(root).obsoleteOverrideKeys, ["Schwarzstorch"]);

  assert.equal(runCleanup(root).cleaned, true);
  assertUnchanged(root, before, jsonFiles.filter((name) => name !== "species-assets-overrides.json"));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "species-assets-overrides.json"), "utf8")).assets, {});
  const accepted = await validateProjectState(root);
  assert.equal(accepted.ok, true, accepted.errors.join("\n"));
  const after = snapshot(root);
  assert.equal(runCleanup(root).cleaned, false);
  assertUnchanged(root, after);
});

test("Fehlgeschlagene Bereinigung erhält Originaldatei und Assets ohne JSON-Tempdatei", async (context) => {
  const root = await createEditableFixture();
  registerFixtureCleanup(context, root);
  writeJson(root, "species_list.json", []);
  const before = snapshot(root);
  const dataPath = path.join(root, "speciesData.json");
  const originalRename = fs.renameSync;
  fs.renameSync = function failDataRename(source, target) {
    if (target === dataPath) throw new Error("simulierter JSON-Schreibfehler");
    return originalRename.call(fs, source, target);
  };
  try {
    assert.throws(() => runSpeciesCleanup(root, { slug: "turdusmerula", safeName: "Amsel" }), /JSON-Schreibfehler/);
  } finally {
    fs.renameSync = originalRename;
  }
  assertUnchanged(root, before);
  assert.equal(fs.existsSync(path.join(root, "species-assets", "Amsel", "map.jpg")), true);
  assert.equal(fs.readdirSync(root).some((name) => name.includes(".tmp-")), false);
  assert.equal(runSpeciesCleanup(root, { slug: "turdusmerula", safeName: "Amsel" }).generatedDataDeleted, true);
});

async function createRollbackFixture(context) {
  const root = await createEditableFixture();
  registerFixtureCleanup(context, root);
  writeJson(root, "species_list.json", []);
  writeJson(root, "lastSavedAssessmentId.json", { Amsel: 1 });
  writeJson(root, "species-assets-overrides.json", { version: 1, assets: { Amsel: { sound: { manual: true } } } });
  fs.writeFileSync(path.join(root, "species-taxonomy-overrides.json"),
    '{"version":1,"species":{"turdusmerula":{"fields":{"Family":"Turdidae"}}}}\n');
  return root;
}

for (const [label, cleanup] of [
  ["Einzelart", (root) => runSpeciesCleanup(root, { slug: "turdusmerula", safeName: "Amsel" })],
  ["Bereinigungslauf", runCleanup],
]) {
  test(`${label}: späterer Report-Schreibfehler stellt alle eigenen JSONs und Assets bytegetreu wieder her`, async (context) => {
    const root = await createRollbackFixture(context);
    const before = snapshot(root);
    const reportPath = path.join(root, "fehlende_elemente_report.json");
    const dataPath = path.join(root, "speciesData.json");
    const originalAsset = fs.readFileSync(path.join(root, "species-assets", "Amsel", "map.jpg"));
    const originalRename = fs.renameSync;
    let completedWrites = 0;
    fs.renameSync = function failFinalJson(source, target) {
      if (target === reportPath) {
        assert.ok(completedWrites >= 4, "Fehler erst nach vier tatsächlichen JSON-Änderungen");
        assert.deepEqual(JSON.parse(fs.readFileSync(dataPath, "utf8")), []);
        throw new Error("simulierter späterer Report-Schreibfehler");
      }
      const result = originalRename.call(fs, source, target);
      if (jsonFiles.some((name) => target === path.join(root, name))) completedWrites += 1;
      return result;
    };
    try {
      assert.throws(() => cleanup(root), /späterer Report-Schreibfehler/);
    } finally {
      fs.renameSync = originalRename;
    }
    assertUnchanged(root, before);
    assert.deepEqual(fs.readFileSync(path.join(root, "species-assets", "Amsel", "map.jpg")), originalAsset);
    assert.equal(fs.readdirSync(root).some((name) => name.includes(".tmp-")), false);
    assert.deepEqual(fs.readdirSync(path.join(root, "species-explorer", "cleanup-trash")), []);
    cleanup(root);
    assert.deepEqual(JSON.parse(fs.readFileSync(dataPath, "utf8")), []);
    assert.equal(fs.existsSync(path.join(root, "species-assets", "Amsel")), false);
  });
}

test("Rücknahme überschreibt keine fremde Änderung an bereits geschriebener JSON-Datei", async (context) => {
  const root = await createRollbackFixture(context);
  const before = snapshot(root);
  const dataPath = path.join(root, "speciesData.json");
  const reportPath = path.join(root, "fehlende_elemente_report.json");
  const foreignBytes = Buffer.from('[{"URLSlug":"anderetesteart","userChange":"erhalten"}]\n');
  const originalRename = fs.renameSync;
  fs.renameSync = function changeEarlierOutput(source, target) {
    if (target === reportPath) {
      assert.deepEqual(JSON.parse(fs.readFileSync(dataPath, "utf8")), []);
      fs.writeFileSync(dataPath, foreignBytes);
      throw new Error("simulierter späterer Report-Schreibfehler");
    }
    return originalRename.call(fs, source, target);
  };
  try {
    assert.throws(() => runSpeciesCleanup(root, { slug: "turdusmerula", safeName: "Amsel" }),
      /Report-Schreibfehler.*Fremde Änderung erhalten.*speciesData\.json/);
  } finally {
    fs.renameSync = originalRename;
  }
  assert.deepEqual(fs.readFileSync(dataPath), foreignBytes);
  assertUnchanged(root, before, jsonFiles.filter((name) => name !== "speciesData.json"));
  assert.equal(fs.existsSync(path.join(root, "species-assets", "Amsel", "map.jpg")), true);
  assert.equal(fs.readdirSync(root).some((name) => name.includes(".tmp-")), false);
});

test("Bereinigung schützt fremde Änderung vor dem nächsten JSON-Schreibschritt", async (context) => {
  const root = await createRollbackFixture(context);
  const before = snapshot(root);
  const dataPath = path.join(root, "speciesData.json");
  const overridesPath = path.join(root, "species-assets-overrides.json");
  const foreignBytes = Buffer.from('{"version":1,"assets":{"Amsel":{"sound":{"manual":true,"reason":"fremde Änderung"}}}}\n');
  const originalRename = fs.renameSync;
  let foreignWrite = false;
  fs.renameSync = function changeNextSource(source, target) {
    const result = originalRename.call(fs, source, target);
    if (target === dataPath && !foreignWrite) {
      fs.writeFileSync(overridesPath, foreignBytes);
      foreignWrite = true;
    }
    return result;
  };
  try {
    assert.throws(() => runSpeciesCleanup(root, { slug: "turdusmerula", safeName: "Amsel" }),
      /Datei wurde während der Bereinigung geändert: species-assets-overrides\.json/);
  } finally {
    fs.renameSync = originalRename;
  }
  assert.equal(foreignWrite, true);
  assert.deepEqual(fs.readFileSync(overridesPath), foreignBytes);
  assertUnchanged(root, before, jsonFiles.filter((name) => name !== "species-assets-overrides.json"));
  assert.equal(fs.existsSync(path.join(root, "species-assets", "Amsel", "map.jpg")), true);
  assert.equal(fs.readdirSync(root).some((name) => name.includes(".tmp-")), false);
});
