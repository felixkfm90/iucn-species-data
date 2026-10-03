import assert from "node:assert/strict";
import test from "node:test";
import { renderProjectStatus } from "./project-status.mjs";

test("rendert aktuelle Zähler und sortierte Pflegehinweise deterministisch", () => {
  const markdown = renderProjectStatus({
    reportGeneratedAt: "2026-07-13T00:00:00.000Z",
    counts: {
      input: 2,
      active: 2,
      generated: 2,
      assetDirectories: 2,
      maps: 2,
      sounds: 1,
      credits: 1,
      spectrograms: 1,
      portraits: 2,
      assetProblems: 0,
      validationProblems: 0,
    },
    manualMaps: ["Amsel"],
    ncSounds: ["Löwe"],
    knownMissingSounds: ["Grüner Leguan"],
  });
  assert.match(markdown, /Aktive Arten \| 2/);
  assert.match(markdown, /Geschützte Karten \(1\)[\s\S]*- Amsel/);
  assert.match(markdown, /IUCN-Browserimporte laut Nutzerangabe \(0\)/);
  assert.match(markdown, /Eigene Kartenpflege einschließlich bestehender Altmarkierungen \(1\)/);
  assert.match(markdown, /Aktive NC-Soundlizenzen \(1\)[\s\S]*- Löwe/);
  assert.match(markdown, /Bewusst fehlende Tierstimmen \(1\)[\s\S]*- Grüner Leguan/);
  assert.ok(markdown.endsWith("\n"));
});

test("Browserimport wird getrennt von eigener Pflege und Schutzstatus dargestellt", () => {
  const markdown = renderProjectStatus({ reportGeneratedAt: "fixture", counts: {},
    manualMaps: ["Amsel", "Rebhuhn"], browserImportedMaps: ["Rebhuhn"], ownCareMaps: ["Amsel"],
    ncSounds: [], knownMissingSounds: [],
  });
  assert.match(markdown, /Geschützte Karten \(2\)/);
  assert.match(markdown, /IUCN-Browserimporte laut Nutzerangabe \(1\)\s+- Rebhuhn/);
  assert.match(markdown, /Eigene Kartenpflege einschließlich bestehender Altmarkierungen \(1\)\s+- Amsel/);
  assert.match(markdown, /kein technischer Bildnachweis/);
});
