# Arten löschen und Altdateien bereinigen

Stand: 2026-06-19

Das Löschen ist bewusst in zwei getrennte Aktionen aufgeteilt.

## 1. Art aus der Artenliste entfernen

In der Detailansicht steht bei Arten aus `species_list.json` neben `Bearbeiten` die Aktion `Löschen`.

Vor dem Entfernen zeigt der Explorer:

- deutschen und wissenschaftlichen Namen
- Hinweis, dass nur der Eintrag aus `species_list.json` entfernt wird
- Hinweis, dass generierte Daten und Assets zunächst bestehen bleiben

Beim Bestätigen:

- wird `species_list.json` vorab unter `species-explorer/backups/` gesichert
- wird nur der ausgewählte Listeneintrag atomar entfernt
- bleiben `speciesData.json`, Report und `species-assets/<SafeName>/` zunächst unverändert

Damit kann ein versehentlich entfernter Listeneintrag aus dem JSON-Backup wiederhergestellt werden.

## 2. Dauerhafter Bereinigungslauf

Die globale Aktion `Bereinigen` sucht:

- Einträge in `speciesData.json`, die nicht mehr in `species_list.json` vorkommen
- Assetordner unter `species-assets/`, für die keine aktuelle Art mehr existiert
- veraltete Einträge in `lastSavedAssessmentId.json`

Die Vorschau listet die gefundenen Datensätze und Assetordner einschließlich Dateigröße auf. Es gibt genau eine
Bestätigung:

`Dauerhaft löschen`

Nach dieser Bestätigung:

- werden verwaiste Assetordner rekursiv und dauerhaft gelöscht
- werden veraltete Einträge aus `speciesData.json` entfernt
- werden veraltete Assessment-Zuordnungen entfernt
- wird `fehlende_elemente_report.json` für den bereinigten Bestand neu aufgebaut

Für den Bereinigungslauf wird keine zusätzliche Wiederherstellungsablage erzeugt. Die in der Vorschau aufgelisteten
Assetdateien sind nach dem Lauf nicht wiederherstellbar.

## Sicherheitsgrenzen

- Ein Assetordner wird nur gelöscht, wenn sein aufgelöster Pfad sicher innerhalb von `species-assets/` liegt.
- Aktuelle `SafeName`-Ordner aus `species_list.json` werden nicht als verwaist eingestuft.
- Die Bereinigung startet nur nach einer aktuellen Vorschau mit einmaligem Token.
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
