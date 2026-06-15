# Asset Structure Plan

Stand: 2026-06-15

Ziel: Phase 5.8 bewertet, ob Karten, Sounds, Credits und spaetere artbezogene Zusatzassets pro Art nach sanitisiertem
Namen gebuendelt werden sollten. Diese Datei beschreibt den aktuellen Stand, Risiken und einen moeglichen
Migrationspfad. Es wurden keine produktiven Asset-Pfade geaendert.

## Kurzfazit

Der aktuelle Asset-Aufbau bleibt fuer den laufenden Betrieb bestehen. Er ist konsistent, einfach und live getestet:

- 45 Arten in `speciesData.json`
- 45 Karten in `Verbreitungskarten/<SafeName>.jpg`
- 45 Soundordner in `sounds/<SafeName>/`
- 45 MP3-Dateien in `sounds/<SafeName>/<SafeName>.mp3`
- 45 Credits-Dateien in `sounds/<SafeName>/credits.json`
- 0 fehlende Kernassets im aktuellen lokalen Konsistenzcheck

Eine Buendelung pro Art ist technisch moeglich, aber kein kleiner Aufraeumpatch. Sie wuerde Pipeline, Frontend-Loader,
Reportlogik, GitHub-Pages-Pfade, Dokumentation und Live-Tests betreffen. Deshalb: nicht jetzt migrieren.

## Aktuelle produktive Struktur

```text
Verbreitungskarten/
  Amsel.jpg
  Bluthaenfling.jpg
  ...

sounds/
  Amsel/
    Amsel.mp3
    credits.json
  Bluthaenfling/
    Bluthaenfling.mp3
    credits.json
  ...

graphics/
  catagory/Alternativ/*.png
  catagory/*.png
  trend/*.png
```

Die Art-Assetnamen werden aus dem deutschen Namen erzeugt. Die relevante Logik liegt aktuell doppelt vor:

- `species-core.js`: `sanitizeAssetName()`
- `update.mjs`: `sanitizeAssetName()`

Frontend-Pfade:

- `map-loader.js`: `Verbreitungskarten/${SafeName}.jpg`
- `species-sound.js`: `sounds/${SafeName}/${SafeName}.mp3` und `sounds/${SafeName}/credits.json`
- `species-status.js`: globale Icons unter `graphics/catagory/Alternativ/` und `graphics/trend/`

Pipeline-Pfade:

- `update.mjs`: schreibt Karten nach `Verbreitungskarten/`
- `update.mjs`: schreibt Sounds und Credits nach `sounds/<SafeName>/`
- `lastSavedAssessmentId.json`: nutzt aktuell `SafeName` als Cache-Key fuer Karten
- `fehlende_elemente_report.json`: prueft Karten, Sounds und Credits ueber dieselben Pfade

## Bewertung

| Bereich | Aktueller Stand | Bewertung |
|---|---|---|
| Betrieb | Alle Kernassets vorhanden und live ueber GitHub Pages erreichbar. | Stabil. |
| Lesbarkeit | Karten und Sounds sind nach Assettyp getrennt. | Fuer 45 Arten noch gut wartbar. |
| Skalierung | Bei deutlich mehr Arten werden Karten, Sounds, Credits und spaetere Assets verteilt gesucht. | Mittel. |
| Frontend | Pfade sind fest in `map-loader.js` und `species-sound.js` kodiert. | Einfach, aber migrationssensibel. |
| Pipeline | `update.mjs` schreibt direkt in die aktuellen Zielordner. | Funktional, aber nicht zentral abstrahiert. |
| Globale Icons | Status-/Trend-Icons sind keine Artassets. | Nicht in Artordner verschieben. |
| Repo-Groesse | Assets ca. 171,71 MB, davon Sounds ca. 147,57 MB und Karten ca. 23,68 MB. | Aktuell akzeptabel. |

## Moegliche Zielstruktur fuer spaeter

Falls spaeter pro Art gebuendelt werden soll, ist diese Struktur sinnvoll:

```text
species-assets/
  Amsel/
    map.jpg
    sound.mp3
    credits.json
    spectrogram.png        # optional spaeter
    metadata.json          # optional spaeter
  Bluthaenfling/
    map.jpg
    sound.mp3
    credits.json
```

Nicht in `species-assets/` gehoeren:

- `graphics/catagory/Alternativ/*.png`
- `graphics/trend/*.png`
- globale Website- oder Statusgrafiken
- JavaScript-Dateien
- `speciesData.json`

## Warum keine Sofortmigration

Eine direkte Verschiebung wuerde mehrere Risiken gleichzeitig ausloesen:

- GitHub-Pages-URLs fuer Karten und Sounds wuerden sich aendern.
- `map-loader.js` und `species-sound.js` muessten gleichzeitig geaendert und versioniert werden.
- `update.mjs` muesste neue Pfade schreiben und bestehende Assets migrieren.
- `fehlende_elemente_report.json` und Reportlogik muessten angepasst werden.
- `lastSavedAssessmentId.json` muesste geprueft werden, damit Karten-Caching nicht neu oder falsch triggert.
- Bestehende Live-Seiten muessten nach GitHub-Pages-Deploy und Squarespace-`?v=`-Update erneut getestet werden.

Der Nutzen ist aktuell vor allem organisatorisch. Fuer den stabilen Live-Betrieb ist der bestehende Aufbau besser.

## Empfohlener Migrationspfad, falls spaeter gewuenscht

1. Zentrale Assetpfad-Funktion in `species-core.js` einfuehren, z. B. `getSpeciesAssetPaths(data)`.
2. Frontend zunaechst kompatibel machen:
   - neue Pfade bevorzugen
   - alte Pfade als Fallback behalten
3. `update.mjs` so erweitern, dass es neue Artordner schreiben kann, ohne alte produktive Pfade sofort zu entfernen.
4. Einen kompletten Pipeline-Lauf in `Testlauf/` bzw. mit klarer Trockenlauf-Strategie pruefen.
5. GitHub Pages deployen, Squarespace-`?v=` erhoehen und live testen:
   - Detailseite mit heimischer Art
   - Detailseite Costa Rica
   - Detailseite Island
   - Sound vorhanden
   - Karte vorhanden
   - Fallback bei fehlendem Asset
6. Erst nach erfolgreichem Parallelbetrieb alte Pfade entfernen.

## Entscheidung fuer Phase 5.8

Phase 5.8 ist fuer den aktuellen Stand abgeschlossen:

- keine Asset-Pfade migriert
- keine Dateien verschoben
- keine produktiven URLs geaendert
- keine Squarespace-`?v=`-Aenderung noetig
- aktueller Aufbau bleibt massgeblich
- artweise Buendelung bleibt als spaetere Migrationsoption dokumentiert

