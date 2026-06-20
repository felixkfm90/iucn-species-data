# Prüfung neuer Karten und Sounds

Stand: 2026-06-20

Nach einem erfolgreichen Pipeline-Lauf vergleicht der Arten-Explorer den Assetstand vor und nach dem Lauf.
Neu hinzugefügte `map.jpg`- und `sound.mp3`-Dateien werden vor Git-Commit und Git-Push zur Prüfung angezeigt.

## Ablauf

Für jedes neue Asset zeigt der Dialog:

- Artname und wissenschaftlichen Namen
- Assettyp Karte oder Sound
- produktiven Dateipfad
- bei Karten eine anklickbare Bildvorschau; ein Klick öffnet die Karte in einer großen Lightbox
- bei Sounds einen Audioplayer

Beim Schließen des Prüfdialogs wird jede laufende Soundwiedergabe sofort gestoppt und auf den Anfang zurückgesetzt.
Das gilt auch, wenn der Dialog nach dem Speichern der Pflegeentscheidung automatisch geschlossen wird.

Felix muss je Asset eine Option wählen:

- `Automatisch durch Pipeline pflegen`
- `Manuell pflegen und schützen`

Erst nach vollständiger Bestätigung wird der Lauf fortgesetzt.

Bei den gezielten Wiederholungsläufen ändern sich die Optionen:

- Kartensuchlauf: `Automatische Karte übernehmen` oder `Bisherige manuelle Karte behalten`
- NC-Soundsuchlauf: `Freie Soundalternative übernehmen` oder `Bisherigen NC-Sound behalten`

Vorhandene Dateien werden dafür unter `species-explorer/pipeline-asset-backups/` vorübergehend gesichert. Der Ordner
ist ignoriert und wird nach Abschluss entfernt. Wird eine Alternative abgelehnt, stellt der Explorer die gesicherten
Dateien vor Commit und Push wieder her.

Die Großansicht dient der Prüfung von Kartenausschnitt, Beschriftungen, Legende und Bildqualität, bevor die Karte als
automatisch gepflegt oder manuell geschützt bestätigt wird. Sie kann über den Schließen-Knopf oder einen Klick auf
den dunklen Hintergrund geschlossen werden, ohne die bereits gewählten Pflegeoptionen zu verlieren.

## Maschinenlesbares Register

Die Entscheidung wird in `species-assets-overrides.json` gespeichert.

Weiterhin manuell geschützt sind vier Karten:

- Blaukehlchen
- Fischertukan
- Rotfuchs
- Waldkauz

Großtrappe, Kernbeißer und Reh wurden am 2026-06-20 nach visueller Bestätigung der neu gefundenen automatischen
Karten auf automatische Pipeline-Pflege umgestellt. Sie werden deshalb nicht mehr als manuell hinzugefügt angezeigt
und nicht mehr vom Wartungslauf `Manuelle Karten erneut suchen` ausgewählt.

`update.mjs` respektiert das Register:

- manuell geschützte vorhandene Karten werden nicht erneut heruntergeladen
- manuell geschützte vorhandene Sounds werden nicht durch die automatische Soundsuche ersetzt

## Git-Veröffentlichung

Nach der Assetentscheidung führt der Explorer automatisch aus:

1. gezieltes `git add` für Artenliste, Pipeline-Ausgaben, Assetregister und `species-assets/`
2. Git-Commit mit laufartabhängiger Nachricht
3. Git-Push

Bereits vor dem Lauf vorgemerkte Git-Änderungen führen zum Abbruch der automatischen Veröffentlichung, damit keine
fremden Staging-Inhalte in den Pipeline-Commit geraten.

Die lokale Datei `species-explorer/pending-asset-review.json` hält eine noch offene Assetprüfung über einen
Serverneustart hinweg fest und wird nicht versioniert.

Erster produktiver App-Durchlauf:

- Art: `Höckerschwan`
- Laufart: neue/unvollständige Arten
- Karte und Sound wurden im Prüfdialog als automatisch durch die Pipeline gepflegt bestätigt.
- Der Explorer veröffentlichte Daten, Assets und Override-Entscheidung anschließend automatisch mit Commit
  `55fda06`.
