# Manual Map Overrides

Stand: 2026-07-03

Ziel: Karten dokumentieren, die nicht rein automatisch aus der IUCN-Pipeline stammen oder nachtraeglich manuell
gepflegt/ersetzt wurden. Diese Liste ist Teil des monatlichen Audits, damit manuell gepflegte Karten nicht durch
Automatisierung oder Asset-Migrationen uebersehen werden.

Maschinenlesbarer Schutz: `species-assets-overrides.json`. Diese Markdown-Datei bleibt die menschenlesbare
Begründung; `update.mjs` verwendet das JSON-Register, um geschützte Karten nicht zu überschreiben.

## Aktueller Stand

Aktuell sind 4 Karten als manuell gepflegt dokumentiert. Grund: IUCN liefert fuer diese Arten korrupte bzw.
fehlerhafte Kartendaten. Die produktiven Karten duerfen deshalb nicht unbemerkt durch automatisch geladene IUCN-Karten
ersetzt werden. Die Karten liegen ausschliesslich unter `species-assets/<SafeName>/map.jpg`.

## Liste

| Art | SafeName | Datei | Grund | Quelle / Hinweis | Letzte manuelle Pruefung | Audit-Status |
|---|---|---|---|---|---|---|
| Blaukehlchen | Blaukehlchen | `species-assets/Blaukehlchen/map.jpg` | IUCN liefert korrupte Kartendaten. | Von Felix manuell gepflegt; vor Pipeline-/Kartenlogik-Aenderungen schuetzen. | 2026-06-17 | erledigt/geprueft |
| Fischertukan | Fischertukan | `species-assets/Fischertukan/map.jpg` | IUCN liefert korrupte Kartendaten. | Von Felix manuell gepflegt; vor Pipeline-/Kartenlogik-Aenderungen schuetzen. | 2026-06-17 | erledigt/geprueft |
| Rotfuchs | Rotfuchs | `species-assets/Rotfuchs/map.jpg` | IUCN liefert korrupte Kartendaten. | Von Felix manuell gepflegt; vor Pipeline-/Kartenlogik-Aenderungen schuetzen. | 2026-06-17 | erledigt/geprueft |
| Waldkauz | Waldkauz | `species-assets/Waldkauz/map.jpg` | IUCN liefert korrupte Kartendaten. | Von Felix manuell gepflegt; vor Pipeline-/Kartenlogik-Aenderungen schuetzen. | 2026-06-17 | erledigt/geprueft |

## Pflege-Regeln

- Jede manuell gepflegte Karte bekommt genau einen Eintrag.
- `SafeName` muss der Ausgabe von `sanitizeAssetName()` entsprechen.
- `Datei` ist der produktive Pfad `species-assets/<SafeName>/map.jpg`.
- `Grund` beschreibt knapp, warum die Karte manuell gepflegt wurde.
- `Quelle / Hinweis` enthaelt Quelle, Bearbeitungshinweis oder Entscheidung.
- Im Monatssaudit reicht bei unveraenderten Karten der Status `nicht erneut manuell geprueft, unveraendert`.
- Wenn `update.mjs` oder eine Asset-Migration Kartenpfade aendert, muss diese Datei vorher geprueft werden.
