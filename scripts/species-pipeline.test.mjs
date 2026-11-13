import assert from "node:assert/strict";
import test from "node:test";
import { createSpeciesDataPipeline } from "./species-data-pipeline.mjs";
import { createSpeciesPipeline } from "./species-pipeline.mjs";

const input = { genus: "Turdus", species: "merula", german: "Amsel" };
const data = { "Wissenschaftlicher Name": "Turdus merula", "Deutscher Name": "Amsel", "Assessment ID": 123,
  Status: "LC", Kategorie: "Nicht gefährdet", Trend: "Stabil" };
function fixture({ sound = "ok", map = "ok", protectedMap = false, dataError = false } = {}) {
  const calls = [], messages = [];
  const { prepareSpeciesData } = createSpeciesDataPipeline({ fetchSpeciesData: async () => {
    calls.push(["data"]); if (dataError) throw new Error("fixture data failed"); return structuredClone(data);
  } });
  const pipeline = createSpeciesPipeline({ prepareSpeciesData, sanitizeAssetName: name => name,
    isManualAsset: (name, slot) => { calls.push(["protected", name, slot]); return protectedMap; },
    downloadSoundIfMissing: async (...args) => { calls.push(["sound", ...args]); return sound; },
    downloadMapForSpecies: async (...args) => { calls.push(["map", ...args]); return map; },
    logger: { log: message => messages.push(message) } });
  return { pipeline, calls, messages };
}

test("Vollständiger Einartlauf verwendet dieselben Ergebnisse in der Reihenfolge Daten, Ton, Karte", async () => {
  const f = fixture(), result = await f.pipeline.runSpecies(input);
  assert.deepEqual(f.calls.map(([name]) => name), ["data", "sound", "protected", "map"]);
  assert.deepEqual(f.calls[1], ["sound", "Turdus", "merula", "Amsel", { forceAlternativeSearch: false }]);
  assert.strictEqual(f.calls[3][1], result.data);
  assert.equal(f.calls[3][2], undefined);
  assert.equal(result.mapLabel, "ok");
  assert.equal(result.soundLabel, "ok");
  assert.match(f.messages[0], /^✅ Fertig: Amsel - Turdus merula/);
});

test("Geschützte Karte wird im vollständigen Lauf nur als nicht bindende Suchalternative erneut geprüft", async () => {
  const f = fixture({ protectedMap: true });
  await f.pipeline.runSpecies(input);
  assert.deepEqual(f.calls.find(([name]) => name === "map")[2], { force: true, allowManual: true, recordAssessment: false });
});

test("Fehlstellensuche überschreibt den Kartenschutz nicht durch erzwungenes Suchen", async () => {
  const f = fixture({ protectedMap: true });
  await f.pipeline.runSpecies(input, { mode: "missing" });
  assert.equal(f.calls.some(([name]) => name === "protected"), false);
  assert.equal(f.calls.find(([name]) => name === "map")[2], undefined);
});

test("Gezielter Kartenlauf lädt keine Tonquelle oder neuen Fachdaten und meldet Ton ungeprüft", async () => {
  const f = fixture(), result = await f.pipeline.runSpecies(input, { mode: "manual-maps", existingData: data });
  assert.deepEqual(f.calls.map(([name]) => name), ["map"]);
  assert.deepEqual(f.calls[0][2], { force: true, allowManual: true, recordAssessment: false });
  assert.equal(result.soundLabel, "nicht geprüft");
  assert.equal(result.usedExistingData, true);
});

test("NC-Suchlauf prüft nur Tonalternativen und behält den Kartenstand ungeprüft", async () => {
  const f = fixture(), result = await f.pipeline.runSpecies(input, { mode: "nc-sounds", existingData: data });
  assert.deepEqual(f.calls, [["sound", "Turdus", "merula", "Amsel", { forceAlternativeSearch: true }]]);
  assert.equal(result.mapLabel, "nicht geprüft");
});

test("Ein Datenfehler startet keine nachfolgenden Downloads", async () => {
  const f = fixture({ dataError: true });
  await assert.rejects(f.pipeline.runSpecies(input), /fixture data failed/);
  assert.deepEqual(f.calls, [["data"]]);
  assert.equal(f.messages.length, 0);
});

test("Unbekannter Einartmodus stoppt vor jedem Quellenzugriff", async () => {
  const f = fixture();
  await assert.rejects(f.pipeline.runSpecies(input, { mode: "publish" }), /Ungültiger Einartmodus/);
  assert.deepEqual(f.calls, []);
});

for (const [sound, map, icon] of [["locked", "ok", "⚠"], ["missing", "ok", "⚠"], ["ok", "n/a", "⚠"], ["error", "locked", "❌"]]) {
  test(`Einartmeldung erhält den tatsächlichen Status Ton=${sound}, Karte=${map}`, async () => {
    const f = fixture({ sound, map }), result = await f.pipeline.runSpecies(input);
    assert.equal(result.soundLabel, sound);
    assert.equal(result.mapLabel, map);
    assert.ok(f.messages[0].startsWith(icon));
  });
}
