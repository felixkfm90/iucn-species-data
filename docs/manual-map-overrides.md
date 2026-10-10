# Manual Map Overrides

Stand: 2026-10-10

Ziel: Karten dokumentieren, die nicht rein automatisch aus der IUCN-Pipeline stammen oder nachtraeglich manuell
gepflegt/ersetzt wurden. Diese Liste ist Teil des monatlichen Audits, damit manuell gepflegte Karten nicht durch
Automatisierung oder Asset-Migrationen uebersehen werden.

Maschinenlesbarer Schutz: `species-assets-overrides.json`. Diese Markdown-Datei bleibt die menschenlesbare
Begründung; `update.mjs` verwendet das JSON-Register, um geschützte Karten nicht zu überschreiben.

## Aktueller Stand

Aktuell sind 6 Karten als geschützt dokumentiert. Die Gründe sind unterschiedlich:
ein aus der Assessment-PDF ausgeschnittener Kartenstand und lokale Browser-/Dateiübernahmen. Ein HTTP-403 beim automatischen
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
| Blaukehlchen | Blaukehlchen | `species-assets/Blaukehlchen/map.jpg` | Felix hat die Karte manuell aus der IUCN-Assessment-PDF ausgeschnitten, weil der direkte Kartenlink laut seiner Rückmeldung HTTP 503 liefert. Kein Beleg für korrupte PDF-Kartendaten. | IUCN-Assessment-PDF laut Nutzerbestätigung vom 10. Oktober; konkrete PDF-Datei und damalige Ausgabe nicht unabhängig verglichen. Bild und Pipeline-Schutz erhalten. | Herkunftsbestätigung 2026-10-10; Karte nicht erneut geprüft | Herkunft nutzerbestätigt; PDF-Bildvergleich nicht ausgeführt |
| Grünfink | Gruenfink | `species-assets/Gruenfink/map.jpg` | IUCN-Browserimport laut Nutzerangabe; unverändert nicht technisch verifiziert; automatischer Ersatz geschützt. Karte als lokale Datei importiert. | [Quelle](https://www.iucnredlist.org/api/v4/assessments/132000123/distribution_map/jpg) | 2026-10-04 | erledigt/geprueft |
| Rebhuhn | Rebhuhn | `species-assets/Rebhuhn/map.jpg` | IUCN-Browserimport laut Nutzerangabe; unverändert nicht technisch verifiziert; automatischer Ersatz geschützt. Karte als lokale Datei importiert. | [Quelle](https://www.iucnredlist.org/api/v4/assessments/154496308/distribution_map/jpg) | 2026-10-04 | erledigt/geprueft |
| Rotaugenlaubfrosch | Rotaugenlaubfrosch | `species-assets/Rotaugenlaubfrosch/map.jpg` | IUCN-Browserimport laut Nutzerangabe; unverändert nicht technisch verifiziert; automatischer Ersatz geschützt. Manuell aus dem IUCN-Kartenlink übernommen, weil der lokale automatische Abruf keinen direkt speicherbaren Kartenlink erhalten hat. | [Quelle](https://www.iucnredlist.org/api/v4/assessments/3028059/distribution_map/jpg) | 2026-10-04 | erledigt/geprueft |
| Erdbeerfröschchen | Erdbeerfroeschchen | `species-assets/Erdbeerfroeschchen/map.jpg` | IUCN-Browserimport laut Nutzerangabe; unverändert nicht technisch verifiziert; automatischer Ersatz geschützt. Manuell aus dem IUCN-Kartenlink übernommen, weil der lokale automatische Abruf keinen direkt speicherbaren Kartenlink erhalten hat. | [Quelle](https://www.iucnredlist.org/api/v4/assessments/3025630/distribution_map/jpg) | 2026-10-04 | erledigt/geprueft |
| Goldbaumsteiger | Goldbaumsteiger | `species-assets/Goldbaumsteiger/map.jpg` | IUCN-Browserimport laut Nutzerangabe; unverändert nicht technisch verifiziert; automatischer Ersatz geschützt. Karte als lokale Datei importiert. | [Quelle](https://www.iucnredlist.org/api/v4/assessments/3024941/distribution_map/jpg) | 2026-10-04 | erledigt/geprueft |

## Pflege-Regeln

Der alte Grund `IUCN liefert korrupte Kartendaten.` im maschinenlesbaren Blaukehlchen-Altregister ist eine
historische Angabe. Felix' neuere Herkunftserklärung steht in obiger Zeile; diese Dokumentkorrektur verändert
weder Bilddatei noch Schutzregister, Assessment-Zuordnung oder Produktionsdaten. Eine konkrete PDF-URL oder
andere Assessment-Ausgabe wird nicht aus der heutigen Zuordnung abgeleitet.

- Jede manuell gepflegte Karte bekommt genau einen Eintrag.
- `SafeName` muss der Ausgabe von `sanitizeAssetName()` entsprechen.
- `Datei` ist der produktive Pfad `species-assets/<SafeName>/map.jpg`.
- `Grund` beschreibt knapp, warum die Karte manuell gepflegt wurde.
- `Quelle / Hinweis` enthaelt Quelle, Bearbeitungshinweis oder Entscheidung.
- Im Monatssaudit reicht bei unveraenderten Karten der Status `nicht erneut manuell geprueft, unveraendert`.
- Wenn `update.mjs` oder eine Asset-Migration Kartenpfade aendert, muss diese Datei vorher geprueft werden.
