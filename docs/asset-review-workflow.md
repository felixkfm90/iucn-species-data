# Prüfung neuer Karten und Sounds

Stand: 2026-06-29

Nach einem erfolgreichen Pipeline-Lauf vergleicht der Arten-Explorer den Assetstand vor und nach dem Lauf.
Neu hinzugefügte `map.jpg`- und `sound.mp3`-Dateien werden vor Git-Commit und Git-Push zur Prüfung angezeigt.

## Ablauf

Für jedes neue Asset zeigt der Dialog:

- Artname und wissenschaftlichen Namen
- Assettyp Karte oder Sound
- produktiven Dateipfad
- bei Karten eine anklickbare Bildvorschau; ein Klick öffnet die Karte in einer großen Lightbox
- bei Sounds einen Audioplayer und, falls bereits erzeugt, das Spektrogramm mit rotem Positionsmarker
- bei Sounds die Lizenzart der geprüften Quelle: `NC` oder `frei`

Ein Klick in das Spektrogramm eines neu gefundenen Sounds setzt die Wiedergabeposition und startet die Wiedergabe
an dieser Stelle. Dadurch kann die Tonquelle vor der Pflegeentscheidung gezielt geprüft werden.

Beim Schließen des Prüfdialogs wird jede laufende Soundwiedergabe sofort gestoppt und auf den Anfang zurückgesetzt.
Das gilt auch, wenn der Dialog nach dem Speichern der Pflegeentscheidung automatisch geschlossen wird.

Felix muss je Asset eine Option wählen:

- `Automatisch durch Pipeline pflegen`
- `Manuell pflegen und schützen`
- bei Sounds zusätzlich `Sound ablehnen und Quelle merken`

Erst nach vollständiger Bestätigung wird der Lauf fortgesetzt.

Bei den gezielten Wiederholungsläufen ändern sich die Optionen und werden als getrennte Entscheidungskarten
angezeigt:

- Kartensuchlauf: `Automatische Karte übernehmen` oder `Bisherige manuelle Karte behalten`
- NC-Soundsuchlauf: `Aktuellen Sound übernehmen (NC)` beziehungsweise `Aktuellen Sound übernehmen (frei)`,
  `Bisherigen Sound behalten` oder
  `Sound ablehnen und Quelle merken`

Vorhandene Dateien werden dafür unter `species-explorer/pipeline-asset-backups/` vorübergehend gesichert. Der Ordner
ist ignoriert und wird nach Abschluss entfernt. Wird eine Alternative abgelehnt, stellt der Explorer die gesicherten
Dateien vor Commit und Push wieder her.

Bei der ausdrücklichen Sound-Ablehnung wird die neue Quelle in `species-assets-overrides.json` unter
`sound.rejectedSources` gespeichert. Die Pipeline vergleicht später Xeno-Canto-ID, Wikimedia-Commons-Quelle oder
iNaturalist-Soundkennung mit dieser Liste und schlägt dieselbe Quelle nicht erneut vor. Wenn vorher kein Sound
vorhanden war, werden die neu erzeugten `sound.mp3`, `credits.json` und `spectrogram.webp` wieder entfernt und der
Report danach neu aufgebaut.

Nach einer Sound-Ablehnung startet der Explorer automatisch einen weiteren gezielten Sound-Suchlauf fuer dieselbe
Art. Die Suche läuft weiter, bis Felix eine Quelle übernimmt oder keine weitere taugliche Quelle mehr gefunden wird.
Pro Art koennen beliebig viele Soundquellen abgelehnt werden; jede Quellkennung bleibt gespeichert.

Dieselbe Ablehnlogik steht seit 2026-06-28 auch im normalen Bearbeitungsdialog einer Art zur Verfügung. Dort kann
der aktuell produktive Sound abgelehnt werden. Der Explorer sichert das bestehende Soundpaket, entfernt
`sound.mp3`, `credits.json` und `spectrogram.webp`, speichert die Quellkennung unter `sound.rejectedSources`, baut
den Report neu auf und veröffentlicht die Änderung per Commit und Push. Der nächste Sound-Suchlauf schlägt diese
konkrete Quelle nicht erneut vor.

Im normalen Bearbeitungsdialog kann außerdem je Art ein gezielter Suchlauf gestartet werden:

- `Automatisch suchen` im Kartenabschnitt nutzt den Kartensuchlauf fuer genau diese Art. Bei Zielarten darf der
  Lauf auch fehlende Karten suchen, nicht nur manuell geschützte Karten.
- `Automatisch suchen` im Soundabschnitt nutzt den NC-/fehlende-Sounds-Suchlauf fuer genau diese Art.
- Beide Aktionen starten seit 2026-06-29 als stiller gezielter Hintergrundlauf, ohne den Bearbeitungsdialog oder die
  Desktop-App zu schliessen und ohne den allgemeinen Datenbank-Aktionen-Dialog einzublenden.
- Fehlende Portraits werden weiterhin im Portraitabschnitt artweise über Prompt, Bildprüfung und Import gepflegt.

Der globale Wartungslauf `Manuelle Karten erneut suchen` verarbeitet ebenfalls fehlende Karten. Er ist damit nicht
mehr ausschließlich auf manuell geschützte Karten begrenzt.

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
