# Ergänzungsnamen und eigene Taxonomiekorrekturen

Stand: 2026-07-30

Status: technisch umgesetzt und bis zur geprüften Phase-9.7-Migration aktive Übergangsschicht

## Aktueller Übergangsvertrag

Catalogue of Life (CoL) bleibt die unveränderliche taxonomische Primärreferenz. Externe Dienste dürfen den lokalen
CoL-Bestand nicht durch eigene Taxa, Hierarchien oder Synonymbeziehungen ersetzen. Sie ergänzen ausschließlich
deutsche und englische gebräuchliche Namen für eine wissenschaftlich exakt zuordenbare CoL-Art.

Ein externer Treffer wird deshalb nur gespeichert, wenn:

1. der Anbieter einen wissenschaftlichen Artnamen liefert,
2. dieser Name in der aktiven CoL-Referenz eindeutig auf dem Rang `species` vorhanden ist und
3. der Treffer gegebenenfalls zum ausgewählten Reich gehört.

Ohne exakte CoL-Zuordnung wird ein externer Treffer verworfen. Damit können iNaturalist, GBIF, WoRMS oder Wikidata
keine fremde Art in die lokale Referenz einschleusen.

Diese strikte Artgrenze beschreibt den bis Phase 9.6 produktiv verwendeten `supplements.json`-Ablauf. Sie ist
nicht das endgültige Masterdatenmodell: Phase 9.6 hat dafür eine separate SQLite-Grundlage geschaffen, die echte
CoL-Lücken künftig als quellenbelegte `reference-gap`-Taxa abbilden kann, ohne CoL selbst zu verändern. Erst
Phase 9.7 migriert vorhandene Ergänzungen und Korrekturen in einen geprüften Master-Kandidaten. Bis zu dessen
Aktivierung bleibt der hier dokumentierte Ablauf unverändert maßgeblich.

## Ergänzungsquellen

Die automatisierte Namenssuche verwendet ausschließlich dokumentierte öffentliche Schnittstellen:

| Quelle | Verwendung | Lokale Vertrauensgewichtung |
| --- | --- | ---: |
| iNaturalist API | deutsche und englische bevorzugte gebräuchliche Namen | 0,86 |
| GBIF Species API | wissenschaftlicher Abgleich und de-/en-Vernakularnamen | 0,82 |
| WoRMS REST API | insbesondere marine/brackische Arten und de-/en-Vernakularnamen | 0,90 |
| Wikidata API | deutsches/englisches Label nur bei vorhandenem Taxonnamen `P225` | 0,76 |

Die Gewichtung ist eine lokale Sortierhilfe und keine fachliche Neubewertung der Quelle. Eigene ausdrücklich
gespeicherte Korrekturen besitzen Vorrang. Exakte deutsche Eigennamen werden vor Präfix- und Teiltreffern
einsortiert; beispielsweise steht `Leopard` vor `Leopard-Drückerfisch`.

Animalia.bio besitzt keine für dieses Projekt freigegebene dokumentierte API und wird daher nicht automatisiert
ausgelesen. Der vorhandene Link bleibt eine manuelle Recherchehilfe.

## Speicherung und Provenienz

Automatisch ergänzte Namen liegen im lokalen, ignorierten Referenzbereich:

```text
%LOCALAPPDATA%\FN Wildlife Travel\Arten-Explorer\taxonomy\supplements.json
```

Jeder Namenseintrag enthält:

- wissenschaftlichen CoL-Zielnamen,
- Sprache und gebräuchlichen Namen,
- Quellname und Quellen-ID,
- lokale Vertrauensgewichtung,
- Prüfzeitpunkt sowie
- die zusammengefassten beteiligten Quellen.

Die Datei ist ein reproduzierbarer Cache und gehört nicht in Git, GitHub Pages oder Squarespace. Suchanfragen
werden höchstens sieben Tage als frisch betrachtet. Ein vollständiger Ergänzungsabgleich besitzt einen davon
getrennten Zeitstempel `lastFullRefreshAt`.

Wenn alle Anbieter ausfallen, wird weder ein erfolgreicher Prüfzeitpunkt vorgetäuscht noch der letzte
funktionierende Cache überschrieben. Bei Teilausfällen bleiben vorhandene Einträge erhalten und die
Quellenwarnungen werden sichtbar protokolliert.

## Eigene Korrekturen

Redaktionell bestätigte Ergänzungen liegen getrennt und versioniert in:

```text
taxonomy-reference-corrections.json
```

Diese Datei verändert CoL nicht. Sie überlagert nur die sichtbaren deutschen beziehungsweise englischen
Vorschlagsnamen eines exakt vorhandenen CoL-Taxons. Dadurch bleiben Korrekturen über einen neuen CoL-Import und
einen neu aufgebauten Ergänzungscache hinweg erhalten.

Im Detail eines ausgewählten Taxons können deutscher Name, englischer Name und ein kurzer Prüfhinweis gespeichert
oder wieder auf die automatischen Quellen zurückgesetzt werden. Server und Oberfläche begrenzen:

- wissenschaftlicher Name: 160 Zeichen,
- deutscher und englischer Name: jeweils 120 Zeichen,
- Prüfhinweis: 240 Zeichen.

Mindestens ein deutscher oder englischer Name ist erforderlich. Speichern und Zurücksetzen sind nur möglich, wenn
der wissenschaftliche Name eindeutig in der aktiven CoL-Referenz als Art vorhanden ist.

## Suche und Auswahl im Neue-Art-Assistenten

Der Assistent durchsucht nach einer Eingabepause von 300 Millisekunden zuerst CoL und den vorhandenen lokalen
Ergänzungscache. Fehlt ein exakter lokaler Namensmatch und besteht der Suchbegriff aus mindestens drei Zeichen,
werden die Ergänzungsquellen abgefragt.

Ein Klick auf einen Treffer:

1. schließt die schwebende Trefferliste,
2. übernimmt deutschen, englischen und wissenschaftlichen Namen direkt in die drei Felder und
3. zeigt Taxonomie, Quellen und Ergänzungsprovenienz an.

Ein zusätzlicher Button `Vorschlag übernehmen` ist nicht mehr erforderlich. Die anschließende Eingabe-,
Kollisions- und Artanlageprüfung bleibt unverändert Pflicht.

Die Taxonomiehierarchie zeigt, soweit zentral übersetzt, den deutschen Rangwert zusammen mit dem
wissenschaftlichen Rohwert, zum Beispiel `Katzen (Felidae)`. Die wissenschaftlichen CoL-Werte bleiben
unverändert.

## Aktualisierung

`Datenbank-Aktionen > Taxonomiereferenz` entscheidet in der Vorschau getrennt:

- neue CoL-Version installieren und danach Ergänzungsnamen prüfen,
- bei aktueller CoL-Version ausschließlich Ergänzungsnamen aktualisieren oder
- ohne Änderung abbrechen.

Ein Ergänzungsabgleich umfasst die wissenschaftlichen Namen aller Projektarten sowie bereits lokal bekannte oder
korrigierte Taxa. Die normale Suche kann weitere Namen bei Bedarf in den lokalen Cache aufnehmen.

Die Aktualisierung ändert niemals automatisch `species_list.json`, `speciesData.json`, Namen, Slugs,
Assetordner oder Overrides. Erst die bewusste Auswahl im Neue-Art-Assistenten beziehungsweise ein geschützter
Bearbeitungsworkflow verändert Projektdaten.

## Lokale API

Die vorhandenen Leseendpunkte liefern CoL-Daten zusammen mit der getrennten Ergänzungsprovenienz:

```text
GET  /api/taxonomy/status
GET  /api/taxonomy/search
GET  /api/taxonomy/taxa/:id
```

Eigene Korrekturen verwenden die geschützten lokalen Schreibendpunkte:

```text
POST /api/taxonomy/corrections/save
POST /api/taxonomy/corrections/reset
```

Sie unterliegen derselben Sitzung-, Origin- und lokalen Bearbeitungsgrenze wie andere Explorer-Schreibaktionen.

## Prüfungen

Fokussierte Tests:

```powershell
npm.cmd run --silent test:taxonomy-reference
npm.cmd run --silent test:taxonomy-maintenance
npm.cmd run --silent test:router
```

Abgedeckt sind die vier Anbieteradapter, Sprachcodes, exakte CoL-Zuordnung, Trefferpriorität, Provenienz,
Offline-/Teilausfall, letzter funktionierender Cache, eigener Vollabgleichzeitpunkt, Korrekturvorrang,
serverseitige Eingabegrenzen, Zurücksetzen, direkte Trefferauswahl, kombinierte Wartung und lokale API-Routen.

Die spätere Migration in die Masterdatenbank muss Cacheeinträge, Quellen-IDs, Korrekturvorrang und
Projektzuordnungen verlustfrei erhalten. Der Zielvertrag steht in
`docs/taxonomy-master-database-design.md`.
