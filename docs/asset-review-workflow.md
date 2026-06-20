# Prüfung neuer Karten und Sounds

Stand: 2026-06-20

Nach einem erfolgreichen Pipeline-Lauf vergleicht der Arten-Explorer den Assetstand vor und nach dem Lauf.
Neu hinzugefügte `map.jpg`- und `sound.mp3`-Dateien werden vor Git-Commit und Git-Push zur Prüfung angezeigt.

## Ablauf

Für jedes neue Asset zeigt der Dialog:

- Artname und wissenschaftlichen Namen
- Assettyp Karte oder Sound
- produktiven Dateipfad
- bei Karten eine Bildvorschau
- bei Sounds einen Audioplayer

Felix muss je Asset eine Option wählen:

- `Automatisch durch Pipeline pflegen`
- `Manuell pflegen und schützen`

Erst nach vollständiger Bestätigung wird der Lauf fortgesetzt.

## Maschinenlesbares Register

Die Entscheidung wird in `species-assets-overrides.json` gespeichert.

Bereits migriert sind die sieben manuell gepflegten Karten:

- Blaukehlchen
- Fischertukan
- Grosstrappe
- Kernbeisser
- Reh
- Rotfuchs
- Waldkauz

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
