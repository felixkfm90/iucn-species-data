# Manual Map Overrides

Stand: 2026-10-03

Ziel: Karten dokumentieren, die nicht rein automatisch aus der IUCN-Pipeline stammen oder nachtraeglich manuell
gepflegt/ersetzt wurden. Diese Liste ist Teil des monatlichen Audits, damit manuell gepflegte Karten nicht durch
Automatisierung oder Asset-Migrationen uebersehen werden.

Maschinenlesbarer Schutz: `species-assets-overrides.json`. Diese Markdown-Datei bleibt die menschenlesbare
Begründung; `update.mjs` verwendet das JSON-Register, um geschützte Karten nicht zu überschreiben.

## Aktueller Stand

Aktuell sind fünf Karten durch bestehende manuelle Altmarkierungen geschützt. Die Gründe sind unterschiedlich:
ein dokumentierter korrupter Kartenstand und vier lokale Browser-/Dateiübernahmen. Ein HTTP-403 beim automatischen
Abruf belegt keine korrupte sichtbare Karte. Die produktiven Karten dürfen nicht unbemerkt ersetzt werden und
liegen ausschließlich unter `species-assets/<SafeName>/map.jpg`. Bestehende Markierungen wurden nicht umklassifiziert.

Neue Importe trennen Herkunft, Pflegeart und Schutz. Standard bleibt eigene/manuell bearbeitete Karte.
Alternativ ausdrücklich `Unveränderte IUCN-Karte aus dem Browser (eigene Bestätigung)` wählen: lokale Datei,
kanonische Quellenadresse und aktuelle Assessment-ID erforderlich. Diese Herkunft ist `user-declared`, nicht
unabhängig technisch verifiziert. `careMode: provider` ist keine eigene fachliche Kartenpflege; beide Varianten
bleiben mit `protectFromPipeline: true` geschützt. Altes `manual: true` schützt zusätzlich und wird durch
`protectFromPipeline: false` nicht aufgehoben. Kopf/Projektstatus zeigen Schutz, Browserimporte und eigene
Pflege/Altmarkierungen getrennt. Der automatische IUCN-Download wurde damit nicht repariert; kein neuer
erfolgreicher maschineller Abruf belegt.

## Liste

| Art | SafeName | Datei | Grund | Quelle / Hinweis | Letzte manuelle Pruefung | Audit-Status |
|---|---|---|---|---|---|---|
| Blaukehlchen | Blaukehlchen | `species-assets/Blaukehlchen/map.jpg` | IUCN liefert korrupte Kartendaten. | Von Felix manuell gepflegt; vor Pipeline-/Kartenlogik-Aenderungen schuetzen. | 2026-06-17 | erledigt/geprueft |
| Grünfink | Gruenfink | `species-assets/Gruenfink/map.jpg` | Karte als lokale Datei importiert. | [Quelle](https://www.iucnredlist.org/api/v4/assessments/132000123/distribution_map/jpg) | 2026-09-27 | erledigt/geprueft |
| Rebhuhn | Rebhuhn | `species-assets/Rebhuhn/map.jpg` | Karte als lokale Datei importiert. | [Quelle](https://www.iucnredlist.org/api/v4/assessments/154496308/distribution_map/jpg) | 2026-09-27 | erledigt/geprueft |
| Rotaugenlaubfrosch | Rotaugenlaubfrosch | `species-assets/Rotaugenlaubfrosch/map.jpg` | Manuell aus dem IUCN-Kartenlink übernommen, weil der lokale automatische Abruf keinen direkt speicherbaren Kartenlink erhalten hat. | [Quelle](https://www.iucnredlist.org/api/v4/assessments/3028059/distribution_map/jpg) | 2026-09-27 | erledigt/geprueft |
| Erdbeerfröschchen | Erdbeerfroeschchen | `species-assets/Erdbeerfroeschchen/map.jpg` | Manuell aus dem IUCN-Kartenlink übernommen, weil der lokale automatische Abruf keinen direkt speicherbaren Kartenlink erhalten hat. | [Quelle](https://www.iucnredlist.org/api/v4/assessments/3025630/distribution_map/jpg) | 2026-09-27 | erledigt/geprueft |

## Pflege-Regeln

- Jede manuell gepflegte Karte bekommt genau einen Eintrag.
- `SafeName` muss der Ausgabe von `sanitizeAssetName()` entsprechen.
- `Datei` ist der produktive Pfad `species-assets/<SafeName>/map.jpg`.
- `Grund` beschreibt knapp, warum die Karte manuell gepflegt wurde.
- `Quelle / Hinweis` enthaelt Quelle, Bearbeitungshinweis oder Entscheidung.
- Im Monatssaudit reicht bei unveraenderten Karten der Status `nicht erneut manuell geprueft, unveraendert`.
- Wenn `update.mjs` oder eine Asset-Migration Kartenpfade aendert, muss diese Datei vorher geprueft werden.
