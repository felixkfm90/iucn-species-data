# Arten löschen und Altdateien bereinigen

Stand: 2026-06-28

Beim Löschen einer Art kann zwischen einem rückholbaren ersten Schritt und der sofortigen dauerhaften Entfernung
aller zugehörigen Daten gewählt werden.

## 1. Art aus der Artenliste entfernen

Im Artkopf steht bei Arten aus `species_list.json` neben `Bearbeiten` die Aktion `Löschen`.

Vor dem Entfernen zeigt der Explorer:

- deutschen und wissenschaftlichen Namen
- eine Checkbox `Zugehörige generierte Daten und Assets sofort dauerhaft löschen`
- die Auswirkungen mit und ohne aktivierte Checkbox

Ohne aktivierte Checkbox:

- wird `species_list.json` vorab unter `species-explorer/backups/` gesichert
- wird nur der ausgewählte Listeneintrag atomar entfernt
- bleiben `speciesData.json`, Report und `species-assets/<SafeName>/` zunächst unverändert

Damit kann ein versehentlich entfernter Listeneintrag aus dem JSON-Backup wiederhergestellt werden.

Mit aktivierter Checkbox werden zusätzlich sofort und dauerhaft entfernt:

- der zugehörige Eintrag aus `speciesData.json`
- der Assetordner `species-assets/<SafeName>/`
- die Assessment-Zuordnung aus `lastSavedAssessmentId.json`
- der Pflegeeintrag aus `species-assets-overrides.json`
- anschließend wird der Report neu aufgebaut

Diese Zusatzlöschung hat keine separate Wiederherstellungsablage. Danach kann dieselbe Art ohne Kollision mit alten
generierten Daten oder einem alten Assetordner wieder neu angelegt werden.

## 2. Dauerhafter Bereinigungslauf

Die globale Aktion `Bereinigen` sucht:

- Einträge in `speciesData.json`, die nicht mehr in `species_list.json` vorkommen
- Assetordner unter `species-assets/`, für die keine aktuelle Art mehr existiert
- veraltete Einträge in `lastSavedAssessmentId.json`
- verwaiste Einträge in `species-assets-overrides.json`

Die Vorschau listet die gefundenen Datensätze und Assetordner einschließlich Dateigröße auf. Es gibt genau eine
Bestätigung:

`Dauerhaft löschen`

Nach dieser Bestätigung:

- werden verwaiste Assetordner zuerst in den ignorierten Zwischenordner `species-explorer/cleanup-trash/` verschoben
- werden veraltete Einträge aus `speciesData.json` entfernt
- werden veraltete Assessment-Zuordnungen entfernt
- werden verwaiste Asset-Pflegeeinträge entfernt
- wird `fehlende_elemente_report.json` für den bereinigten Bestand neu aufgebaut
- werden die verschobenen Assetordner danach endgültig gelöscht

`cleanup-trash` ist keine Wiederherstellungsablage fuer den Anwender, sondern ein technischer Transaktionsbereich.
Wenn Windows eine Datei beim endgültigen Löschen noch sperrt, sind die produktiven Daten und der Report trotzdem
konsistent; der Restordner bleibt ignoriert liegen und kann nach Freigabe der Datei erneut entfernt werden. Die in
der Vorschau aufgelisteten Assetdateien sind nach erfolgreichem Lauf nicht wiederherstellbar.

## Sicherheitsgrenzen

- Ein Assetordner wird nur gelöscht, wenn sein aufgelöster Pfad sicher innerhalb von `species-assets/` liegt.
- Ein Assetordner wird vor dem JSON-Schreibvorgang verschoben. Schlägt dieser Schritt fehl, werden Daten und Report
  nicht verändert.
- Aktuelle `SafeName`-Ordner aus `species_list.json` werden nicht als verwaist eingestuft.
- Die Bereinigung startet nur nach einer aktuellen Vorschau mit einmaligem Token.
- Der Bereinigungsplan trägt ausdrücklich `mode: cleanup`; damit startet die App das Löschskript und nicht
  versehentlich die normale Datenpipeline.
- Ändert sich Artenliste, Pipeline-Ausgabe oder Bereinigungsplan zwischen Vorschau und Start, wird der Start
  abgewiesen.
- Es kann immer nur ein Pipeline- oder Bereinigungslauf gleichzeitig laufen.
- Der Listeneintrag allein wird noch nicht automatisch veröffentlicht. Der anschließende Pipeline- oder
  Bereinigungslauf committed und pusht die bereinigten Daten automatisch.

## Kommandozeile

Nur Vorschau:

```bash
npm.cmd run --silent cleanup:species -- --dry-run
```

Dauerhaft ausführen:

```bash
npm.cmd run --silent cleanup:species
```

Der direkte Aufruf sollte nur nach Prüfung der Dry-run-Ausgabe verwendet werden. In der App übernimmt der Dialog
diese Vorschau.
