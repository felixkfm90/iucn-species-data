# Asset-Verwaltung im Arten-Explorer

Stand: 2026-06-19

Ziel von Phase 7.7: Karten, Sounds, Credits und Spektrogramme kontrolliert je Art ersetzen oder pflegen, ohne
beliebige Dateisystemzugriffe zu erlauben und ohne manuelle Assets beim naechsten Pipeline-Lauf unbemerkt zu
ueberschreiben.

## Ausgangslage

Produktive Assets liegen ausschliesslich unter:

```text
species-assets/<SafeName>/
  map.jpg
  sound.mp3
  credits.json
  spectrogram.webp
```

Der Explorer zeigt diese Dateien bereits an und prueft ihre Vollstaendigkeit.

Aktuelle Schutzlogik:

- Karten werden von `update.mjs` nur uebersprungen, wenn die gespeicherte Assessment-ID unveraendert ist.
- Sieben manuelle Karten sind zusaetzlich in `docs/manual-map-overrides.md` dokumentiert, aber diese Markdown-Datei
  ist kein robuster maschinenlesbarer Pipeline-Schutz.
- Vorhandene Sounds mit freier Lizenz bleiben normalerweise erhalten.
- Vorhandene NC-Sounds werden bei jedem Pipeline-Lauf auf freie Alternativen geprueft und koennen ersetzt werden.
- Ein Spektrogramm gehoert immer zum aktuellen `sound.mp3`. Nach einem Soundwechsel darf kein altes Spektrogramm
  unbemerkt weiter angezeigt werden.

## Grundentscheidung

Phase 7.7 wird in kontrollierten Teilstufen umgesetzt. Direkte Loeschfunktionen, beliebige Dateinamen und freie
Dateisystempfade sind nicht erlaubt.

### 7.7.1 Maschinenlesbares Override-Register

Status: technische Grundlage bereits in Phase 7.6 umgesetzt.

`species-assets-overrides.json` enthält die sieben bestehenden manuellen Karten. Neue Karten und Sounds werden nach
einem Pipeline-Lauf in der App geprüft und als automatisch oder manuell geschützt bestätigt. `update.mjs` respektiert
diese Entscheidungen bereits. Die weitergehende Assetverwaltung mit Import und Austausch bleibt Phase 7.7.

Vor dem ersten produktiven Dateiimport wird ein strukturiertes Register eingefuehrt, zum Beispiel:

```text
manual_asset_overrides.json
```

Ein Eintrag soll mindestens enthalten:

- wissenschaftlicher Schluessel oder URL-Slug
- `SafeName`
- Assettyp: `map`, `sound`, `credits` oder `spectrogram`
- Grund der manuellen Pflege
- Quelle beziehungsweise Original-URL
- Lizenz, falls relevant
- Importdatum
- SHA-256-Hash der produktiven Datei
- Kennzeichen `protectFromPipeline`

Regeln:

- `update.mjs` muss geschuetzte Karten und Sounds explizit ueberspringen.
- Ein manueller Sound darf nicht allein registriert werden; Credits sind Pflicht.
- `docs/manual-map-overrides.md` bleibt als menschenlesbare Dokumentation bestehen und wird aus dem Register
  abgeglichen oder gemeinsam aktualisiert.
- Der Explorer zeigt die manuelle Herkunft direkt in der jeweiligen Assetzeile.

### 7.7.2 Karten ersetzen

Erster produktiver Importtyp, weil er technisch am klarsten abzugrenzen ist.

Workflow:

1. Art und vorhandene Karte anzeigen.
2. Neue JPEG-Datei auswaehlen.
3. Dateityp, Signatur, Dekodierbarkeit, Abmessungen und Groesse pruefen.
4. Vorschau mit alter und neuer Karte sowie Dateiinformationen anzeigen.
5. Grund und Quelle fuer die manuelle Pflege erfassen.
6. Vorhandene Karte sichern.
7. Neue Karte atomar als `species-assets/<SafeName>/map.jpg` schreiben.
8. Override-Register und `docs/manual-map-overrides.md` aktualisieren.
9. Explorer-Modell und Validierung neu laden.

Vorgesehene Grenze:

- nur JPEG
- maximal 20 MB
- keine Loeschfunktion in der ersten Version

### 7.7.3 Sound und Credits als gemeinsames Paket

Ein Sound darf nur zusammen mit vollstaendigen Credits ersetzt werden.

Pflichtfelder fuer Credits:

- wissenschaftlicher Name
- deutscher Name
- Aufnahme/Urheber
- Quelle
- Original-URL
- Lizenz
- Land/Ort und Qualitaet, falls bekannt

Workflow:

1. MP3 und Creditsdaten gemeinsam auswaehlen beziehungsweise eingeben.
2. MP3-Signatur, Dateigroesse und Erreichbarkeit der Quellen-URL pruefen, soweit lokal moeglich.
3. Lizenz auswerten und NC-Status vor dem Speichern sichtbar machen.
4. Alte `sound.mp3`, `credits.json` und das zugehoerige Spektrogramm gemeinsam sichern.
5. Sound und Credits atomar ersetzen.
6. Override-Register aktualisieren.
7. Das bisherige Spektrogramm als veraltet markieren und nicht als zum neuen Sound passend behandeln.

Vorgesehene Grenze:

- nur MP3
- maximal 50 MB
- kein Soundimport ohne Credits
- keine automatische Lizenzfreigabe; die Entscheidung bleibt sichtbar und pruefbar

### 7.7.4 Spektrogramm-Konsistenz

Nach einem Soundwechsel muss ein neues Spektrogramm erzeugt werden.

Geplante Regel:

- SHA-256 des Sounds wird beim Erzeugen des Spektrogramms gespeichert.
- Der Explorer vergleicht den aktuellen Soundhash mit dem dokumentierten Spektrogrammhash.
- Bei Abweichung wird `Spektrogramm veraltet` angezeigt.
- Ein veraltetes Spektrogramm wird nicht als vollstaendiges, passendes Asset gewertet.

Die eigentliche Prozesssteuerung des Generators gehoert funktional zu Phase 7.6. Phase 7.7 bereitet Status,
Sicherung und konsistente Assetzustande vor.

### 7.7.5 Artportraet

Der Explorer hat bereits einen Platzhalter fuer ein spaeteres Artportraet. Vor einer produktiven Einfuehrung muss
entschieden werden:

- Quelle des Bildes: lokale Datei, Squarespace-Galerie oder GitHub-Pages-Asset
- produktiver Dateiname und Format
- Lizenz-/Creditpflicht
- Verwendung nur in der App oder auch auf Squarespace

Das Artportraet wird nicht nebenbei in die bestehende Kernassetstruktur aufgenommen.

## Upload- und Dateisicherheit

- nur vorhandene Arten und bekannte Assettypen
- serverseitig konstruierte Zielpfade; keine vom Browser gelieferten Dateipfade
- Dateiendung und Magic Bytes muessen zusammenpassen
- Bilder muessen dekodierbar sein
- Credits-JSON beziehungsweise Formularfelder werden serverseitig validiert
- Upload zuerst in einen ignorierten Stagingordner
- Vorschau-Token vor finalem Schreiben
- Schutz gegen parallele Aenderungen durch Datei-Hash
- atomarer Austausch ueber temporaere Datei
- kein automatischer Pipeline- oder Git-Start

Geplanter lokaler Stagingpfad:

```text
species-explorer/staging/
```

Der Ordner wird ignoriert und nach Abschluss oder bei abgelaufenen Uploads bereinigt.

## Backup-Aufbewahrung

Assetbackups sind groesser als `species_list.json`-Backups und brauchen eine strengere Regel:

- hoechstens 3 verwaltete Versionen je Art und Assettyp
- zusaetzliche globale Obergrenze von 500 MB fuer verwaltete Assetbackups
- bei Ueberschreitung werden die aeltesten verwalteten Assetbackups entfernt
- fremde Dateien werden niemals automatisch geloescht
- aktuelles produktives Asset wird nie durch die Bereinigung beruehrt

## Bedienoberflaeche

Im Bereich `Assetstatus` erhaelt jede unterstuetzte Zeile eine Aktion:

- `Ansehen`
- `Ersetzen`
- spaeter optional `Vorherige Version wiederherstellen`

Vor dem Speichern zeigt die App:

- aktuelles und neues Asset
- Dateityp, Groesse und gegebenenfalls Abmessungen/Dauer
- Quelle und Lizenz
- Auswirkungen auf Override-Status und Spektrogramm
- Backup- und Pipeline-Hinweis

## Nicht Bestandteil von Phase 7.7

- neue Arten anlegen; das wird vorher in Phase 7.5 umgesetzt
- Assets loeschen
- beliebige Dateinamen oder Zielordner
- automatische Git-Commits oder Pushes
- komplette Pipeline aus der App starten
- automatische rechtliche Bewertung einer Lizenz
- produktives Artportraet ohne vorherige Strukturentscheidung

## Geplante Reihenfolge

1. Override-Register und Pipeline-Schutz
2. Kartenimport mit Vorschau, Backup und Dokumentationsabgleich
3. Sound-/Credits-Paket
4. Spektrogramm-Stale-Status und Hashabgleich
5. Entscheidung zum Artportraet
6. erst danach Restore-Funktion und weitergehende Assetaktionen

## Testplan

- Pfadmanipulation und unbekannte Assettypen werden abgewiesen.
- Falsche Dateisignaturen werden trotz passender Endung abgewiesen.
- Uebergrosse Dateien werden vor dem Schreiben abgewiesen.
- Vorschau schreibt keine produktive Datei.
- Speichern ohne gueltige Vorschau wird abgewiesen.
- Bestehendes Asset wird vor dem Austausch gesichert.
- Austausch erfolgt atomar.
- Override-Register und menschenlesbare Dokumentation bleiben konsistent.
- Geschuetzte Assets werden von `update.mjs` nicht ueberschrieben.
- Soundimport ohne Credits wird abgewiesen.
- Soundwechsel markiert das bisherige Spektrogramm als veraltet.
- Backup-Retention behaelt hoechstens 3 Versionen je Art/Asset und respektiert die globale Groessengrenze.
- Fremde Dateien in Staging- oder Backupordnern werden nicht automatisch geloescht.
- Projektvalidierung wird nach dem Import automatisch neu geladen.
