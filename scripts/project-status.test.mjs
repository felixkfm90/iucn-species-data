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
  assert.match(markdown, /Manuell gepflegte Karten \(1\)[\s\S]*- Amsel/);
  assert.match(markdown, /Aktive NC-Soundlizenzen \(1\)[\s\S]*- Löwe/);
  assert.match(markdown, /Bewusst fehlende Tierstimmen \(1\)[\s\S]*- Grüner Leguan/);
  assert.ok(markdown.endsWith("\n"));
});
