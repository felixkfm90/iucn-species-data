import assert from "node:assert/strict";
import test from "node:test";

import { synchronizeManualMapDocumentation } from "./manual-map-documentation.mjs";

test("Automatisch übernommene Karten verlassen die manuelle Dokumentation", () => {
  const markdown = [
    "# Manual Map Overrides",
    "",
    "Stand: 2026-06-17",
    "",
    "Aktuell sind 2 Karten als manuell gepflegt dokumentiert.",
    "",
    "| Art | SafeName | Datei |",
    "|---|---|---|",
    "| Amsel | Amsel | `species-assets/Amsel/map.jpg` |",
    "| Drossel | Drossel | `species-assets/Drossel/map.jpg` |",
    "",
  ].join("\n");
  const registry = {
    version: 1,
    assets: {
      Amsel: { map: { manual: false } },
      Drossel: { map: { manual: true } },
    },
  };

  const synchronized = synchronizeManualMapDocumentation(markdown, registry, "2026-06-20");

  assert.doesNotMatch(synchronized, /species-assets\/Amsel\/map\.jpg/);
  assert.match(synchronized, /species-assets\/Drossel\/map\.jpg/);
  assert.match(synchronized, /Stand: 2026-06-20/);
  assert.match(synchronized, /Aktuell sind 1 Karte als manuell gepflegt dokumentiert\./);
});

test("Neue manuelle Karten werden mit Quelle und Pflegegrund dokumentiert", () => {
  const markdown = [
    "# Manual Map Overrides",
    "",
    "Stand: 2026-06-17",
    "",
    "Aktuell sind 0 Karten als manuell gepflegt dokumentiert.",
    "",
    "| Art | SafeName | Datei | Grund | Quelle | Datum | Status |",
    "|---|---|---|---|---|---|---|",
    "",
    "## Pflege-Regeln",
    "",
  ].join("\n");
  const registry = {
    version: 1,
    assets: {
      Amsel: {
        map: {
          manual: true,
          germanName: "Amsel",
          reason: "Automatische Karte unvollständig.",
          source: "https://example.org/map.jpg",
          importedAt: "2026-06-20T10:00:00.000Z",
        },
      },
    },
  };

  const synchronized = synchronizeManualMapDocumentation(markdown, registry, "2026-06-20");

  assert.match(synchronized, /species-assets\/Amsel\/map\.jpg/);
  assert.match(synchronized, /Automatische Karte unvollständig\./);
  assert.match(synchronized, /\[Quelle\]\(https:\/\/example\.org\/map\.jpg\)/);
  assert.match(synchronized, /Aktuell sind 1 Karte als manuell gepflegt dokumentiert\./);
});
