# Asset Structure Plan

Stand: 2026-06-16

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
- 45 Spektrogramme in `sounds/<SafeName>/spectrogram.webp`
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
    spectrogram.webp
  Bluthaenfling/
    Bluthaenfling.mp3
    credits.json
    spectrogram.webp
  ...

graphics/
  catagory/Alternativ/*.png
  catagory/*.png
  trend/*.png
```

Die Art-Assetnamen werden aus dem deutschen Namen erzeugt. Die relevante Logik liegt aktuell mehrfach vor:

- `species-core.js`: `sanitizeAssetName()`
- `update.mjs`: `sanitizeAssetName()`
- `scripts/monthly-site-audit.mjs`: `sanitizeAssetName()`
- `scripts/generate-spectrograms.mjs`: nutzt bestehende `sounds/<SafeName>/`-Ordner als Quelle

Frontend-Pfade:

- `map-loader.js`: `Verbreitungskarten/${SafeName}.jpg`
- `species-sound.js`: `sounds/${SafeName}/${SafeName}.mp3`, `sounds/${SafeName}/credits.json` und
  `sounds/${SafeName}/spectrogram.webp`
- `species-status.js`: globale Icons unter `graphics/catagory/Alternativ/` und `graphics/trend/`

Pipeline-Pfade:

- `update.mjs`: schreibt Karten nach `Verbreitungskarten/`
- `update.mjs`: schreibt Sounds und Credits nach `sounds/<SafeName>/`
- `scripts/generate-spectrograms.mjs`: schreibt Spektrogramme nach `sounds/<SafeName>/spectrogram.webp`
- `scripts/monthly-site-audit.mjs`: prueft Karten, Sounds, Credits und Spektrogramme an den aktuellen Pfaden
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
| Audit | `scripts/monthly-site-audit.mjs` prueft aktuelle Pfade inklusive Spektrogrammen. | Gut fuer Betrieb, bei Migration anzupassen. |
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
    spectrogram.webp
    metadata.json          # optional spaeter
  Bluthaenfling/
    map.jpg
    sound.mp3
    credits.json
    spectrogram.webp
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
- Manuell gepflegte Karten aus `docs/manual-map-overrides.md` muessten ausdruecklich geschuetzt werden.
- Die Spektrogramm-Erzeugung muesste auf den neuen Zielpfad umgestellt oder fuer eine Uebergangszeit doppelt
  schreiben.

Der Nutzen ist aktuell vor allem organisatorisch. Fuer den stabilen Live-Betrieb ist der bestehende Aufbau besser.

## Phase-6-Migrationsvorbereitung

Phase 6 greift die artweise Buendelung erneut auf, aber weiter ohne produktive Pfadverschiebung. Der Zweck ist, die
spaetere Migration so vorzubereiten, dass sie nicht versehentlich Loader, Pipeline oder Live-Seiten bricht.

Betroffene Dateien bei einer echten Migration:

| Datei / Bereich | Aktuelle Aufgabe | Migrationsbedarf |
|---|---|---|
| `species-core.js` | Gemeinsame Slug- und Assetnamenlogik im Frontend. | Zentrale Pfadfunktion ergaenzen, z. B. `getSpeciesAssetPaths(data)`. |
| `map-loader.js` | Laedt `Verbreitungskarten/<SafeName>.jpg`. | Neuen Pfad bevorzugen, alten Pfad als Fallback behalten. |
| `species-sound.js` | Laedt MP3, Credits und Spektrogramm aus `sounds/<SafeName>/`. | Neuen Pfad bevorzugen, alte Soundpfade als Fallback behalten. |
| `update.mjs` | Schreibt Karten, MP3s und Credits in die aktuelle Struktur. | Zielpfade zentralisieren; optional Parallelbetrieb schreiben. |
| `scripts/generate-spectrograms.mjs` | Schreibt `spectrogram.webp` in den Soundordner. | Neuer Zielpfad oder Parallelbetrieb. |
| `scripts/monthly-site-audit.mjs` | Prueft aktuelle Karten-, Sound-, Credits- und Spektrogrammpfade. | Beide Strukturen pruefen, solange Parallelbetrieb aktiv ist. |
| `lastSavedAssessmentId.json` | Cache-Key fuer Karten per `SafeName`. | Key kann bleiben, Zielpfad muss aber eindeutig sein. |
| `docs/manual-map-overrides.md` | Schutzliste fuer manuell gepflegte Karten. | Overrides muessen vor Migration kopiert und nach Migration geprueft werden. |
| Squarespace Footer | Laedt Root-JS-Dateien mit `?v=`. | Nach Loader-Aenderungen neue Versionen setzen. |

Empfohlene Reihenfolge, falls die Migration spaeter gestartet wird:

1. Zentrale Pfadfunktion nur im Frontend einfuehren, aber noch aktuelle Pfade zurueckgeben.
2. `map-loader.js` und `species-sound.js` auf diese Funktion umstellen, ohne Pfade zu aendern.
3. Tests und Squarespace-Versionen fuer diese reine Refaktor-Stufe.
4. Pipeline- und Generator-Zielpfade in einem Dry-Run bzw. `Testlauf/` pruefen.
5. Neue `species-assets/<SafeName>/`-Struktur parallel schreiben, alte Struktur beibehalten.
6. Frontend: neue Pfade bevorzugen, alte Pfade als Fallback behalten.
7. Monatsaudit: beide Strukturen erfassen und fehlende Parallel-Assets melden.
8. GitHub Pages deployen, Squarespace-`?v=` erhoehen und Live-Test fuer Heimische Tierwelt, Costa Rica und Island.
9. Alte Pfade erst entfernen, wenn alle Live-Tests bestanden sind und mindestens ein kompletter Pipeline-/Auditlauf
   mit neuer Struktur sauber war.

Stop-Kriterien:

- irgendeine manuell gepflegte Karte fehlt oder wird ueberschrieben
- ein Sound, Credits oder Spektrogramm fehlt im neuen Pfad
- Frontend-Fallback greift nicht sauber
- GitHub Pages liefert neue Assetpfade nicht zuverlaessig aus
- Squarespace Live-Test zeigt kaputte Karten oder Ton

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

## Entscheidung fuer Phase 6

Phase 6.8 ist eine Migrationsvorbereitung, keine Migration:

- aktuelle Pfadnutzer wurden erneut konkret erfasst
- Spektrogramme wurden in die Bewertung aufgenommen
- `scripts/monthly-site-audit.mjs` und `scripts/generate-spectrograms.mjs` sind als betroffene Dateien dokumentiert
- die manuell gepflegten Karten sind als Stop-Kriterium aufgenommen
- produktive Pfade bleiben unveraendert
- kein Squarespace-`?v=`-Update noetig

Naechster technischer Schritt waere erst dann sinnvoll, wenn die Migration wirklich gestartet werden soll:
eine zentrale Pfadfunktion in `species-core.js`, zunaechst ohne Pfadaenderung.
