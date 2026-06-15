# Manual Map Overrides

Stand: 2026-06-15

Ziel: Karten dokumentieren, die nicht rein automatisch aus der IUCN-Pipeline stammen oder nachtraeglich manuell
gepflegt/ersetzt wurden. Diese Liste ist Teil des monatlichen Audits, damit manuell gepflegte Karten nicht durch
Automatisierung oder Asset-Migrationen uebersehen werden.

## Aktueller Stand

Aktuell sind sieben Karten als manuell gepflegt dokumentiert. Grund: IUCN liefert fuer diese Arten korrupte bzw.
fehlerhafte Kartendaten. Die produktiven Karten duerfen deshalb nicht unbemerkt durch automatisch geladene IUCN-Karten
ersetzt werden.

## Liste

| Art | SafeName | Datei | Grund | Quelle / Hinweis | Letzte manuelle Pruefung | Audit-Status |
|---|---|---|---|---|---|---|
| Blaukehlchen | Blaukehlchen | `Verbreitungskarten/Blaukehlchen.jpg` | IUCN liefert korrupte Kartendaten. | Von Felix manuell gepflegt; vor Pipeline-/Asset-Migration schuetzen. | 2026-06-15 | erledigt/geprueft |
| Fischertukan | Fischertukan | `Verbreitungskarten/Fischertukan.jpg` | IUCN liefert korrupte Kartendaten. | Von Felix manuell gepflegt; vor Pipeline-/Asset-Migration schuetzen. | 2026-06-15 | erledigt/geprueft |
| Grosstrappe | Grosstrappe | `Verbreitungskarten/Grosstrappe.jpg` | IUCN liefert korrupte Kartendaten. | Von Felix manuell gepflegt; vor Pipeline-/Asset-Migration schuetzen. | 2026-06-15 | erledigt/geprueft |
| Kernbeisser | Kernbeisser | `Verbreitungskarten/Kernbeisser.jpg` | IUCN liefert korrupte Kartendaten. | Von Felix manuell gepflegt; vor Pipeline-/Asset-Migration schuetzen. | 2026-06-15 | erledigt/geprueft |
| Reh | Reh | `Verbreitungskarten/Reh.jpg` | IUCN liefert korrupte Kartendaten. | Von Felix manuell gepflegt; vor Pipeline-/Asset-Migration schuetzen. | 2026-06-15 | erledigt/geprueft |
| Rotfuchs | Rotfuchs | `Verbreitungskarten/Rotfuchs.jpg` | IUCN liefert korrupte Kartendaten. | Von Felix manuell gepflegt; vor Pipeline-/Asset-Migration schuetzen. | 2026-06-15 | erledigt/geprueft |
| Waldkauz | Waldkauz | `Verbreitungskarten/Waldkauz.jpg` | IUCN liefert korrupte Kartendaten. | Von Felix manuell gepflegt; vor Pipeline-/Asset-Migration schuetzen. | 2026-06-15 | erledigt/geprueft |

## Pflege-Regeln

- Jede manuell gepflegte Karte bekommt genau einen Eintrag.
- `SafeName` muss der Ausgabe von `sanitizeAssetName()` entsprechen.
- `Datei` ist der produktive Pfad, aktuell z. B. `Verbreitungskarten/<SafeName>.jpg`.
- `Grund` beschreibt knapp, warum die Karte manuell gepflegt wurde.
- `Quelle / Hinweis` enthaelt Quelle, Bearbeitungshinweis oder Entscheidung.
- Im Monatssaudit reicht bei unveraenderten Karten der Status `nicht erneut manuell geprueft, unveraendert`.
- Wenn `update.mjs` oder eine Asset-Migration Kartenpfade aendert, muss diese Datei vorher geprueft werden.
