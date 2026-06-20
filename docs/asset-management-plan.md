# Asset-Verwaltung im Arten-Explorer

Stand: 2026-06-20

Ziel von Phase 7.7: Karten, Sounds, Credits und Spektrogramme kontrolliert je Art ersetzen oder pflegen, ohne
beliebige Dateisystemzugriffe zu erlauben und ohne manuelle Assets beim naechsten Pipeline-Lauf unbemerkt zu
ueberschreiben.

Der Einstieg erfolgt über die allgemeine Aktion `Bearbeiten` oben rechts im Artkopf. Dort werden neben den bereits
vorhandenen manuellen Eingaben später auch Karte, Sound/Credits, Spektrogramm und Artporträt verwaltet. Die
Schaltflächen sind deshalb bewusst nicht mehr dem Abschnitt `Manuelle Daten` zugeordnet.

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
- Vier manuelle Karten sind zusätzlich in `docs/manual-map-overrides.md` dokumentiert. Maßgeblicher
  maschinenlesbarer Pipeline-Schutz ist `species-assets-overrides.json`.
- Vorhandene Sounds mit freier Lizenz bleiben normalerweise erhalten.
- Vorhandene NC-Sounds werden bei jedem Pipeline-Lauf auf freie Alternativen geprueft und koennen ersetzt werden.
- Ein Spektrogramm gehoert immer zum aktuellen `sound.mp3`. Nach einem Soundwechsel darf kein altes Spektrogramm
  unbemerkt weiter angezeigt werden.

## Grundentscheidung

Phase 7.7 wird in kontrollierten Teilstufen umgesetzt. Direkte Loeschfunktionen, beliebige Dateinamen und freie
Dateisystempfade sind nicht erlaubt.

### 7.7.1 Maschinenlesbares Override-Register

Status: technische Grundlage bereits in Phase 7.6 umgesetzt.

`species-assets-overrides.json` enthält die vier weiterhin manuell geschützten Karten. Großtrappe, Kernbeißer und
Reh wurden nach erfolgreicher automatischer Neusuche am 2026-06-20 aus der manuellen Pflege genommen. Neue Karten
und Sounds werden nach einem Pipeline-Lauf in der App geprüft und als automatisch oder manuell geschützt bestätigt.
`update.mjs` respektiert diese Entscheidungen bereits.

Ein manuell importierter Karteneintrag enthält:

- `manual` und `protectFromPipeline`
- Grund der manuellen Pflege
- Quelle beziehungsweise Original-URL und ursprünglicher Dateiname
- Importdatum
- SHA-256-Hash der produktiven Datei
- deutschen Namen innerhalb des Asseteintrags

Regeln:

- `update.mjs` muss geschuetzte Karten und Sounds explizit ueberspringen.
- Ein manueller Sound darf nicht allein registriert werden; Credits sind Pflicht.
- `docs/manual-map-overrides.md` bleibt als menschenlesbare Dokumentation bestehen und wird aus dem Register
  abgeglichen oder gemeinsam aktualisiert.
- Der Explorer zeigt die manuelle Herkunft direkt in der jeweiligen Assetzeile.

### 7.7.2 Karten ersetzen

Status: technisch lokal umgesetzt am 2026-06-20; produktiver Import und visuelle Bedienprüfung stehen noch aus.

Der Kartenimport ist im allgemeinen `Bearbeiten`-Dialog der Art integriert. Manuelle Daten und Karte besitzen
getrennte Vorschau- und Speicheraktionen. API:

- `POST /api/species/<Slug>/assets/map/preview`
- `GET /api/species/<Slug>/assets/map/preview-file?token=<Token>`
- `POST /api/species/<Slug>/assets/map/save`

Workflow:

1. Art und vorhandene Karte anzeigen.
2. Neue JPEG-Datei auswaehlen.
3. Dateityp, Signatur, JPEG-Struktur, Browser-Dekodierbarkeit, Abmessungen und Groesse pruefen.
4. Vorschau mit alter und neuer Karte sowie Dateiinformationen anzeigen.
5. Grund und Quelle fuer die manuelle Pflege erfassen.
6. Vorhandene Karte sichern.
7. Neue Karte atomar als `species-assets/<SafeName>/map.jpg` schreiben.
8. Override-Register und `docs/manual-map-overrides.md` aktualisieren.
9. Explorer-Modell und Validierung neu laden.
10. Karte, Override-Register und Dokumentation automatisch committen und pushen.

Vorgesehene Grenze:

- nur JPEG
- maximal 20 MB
- keine Loeschfunktion in der ersten Version

Umgesetzt:

- Prüfung von Dateiendung, JPEG-Magic-Bytes, Segmentstruktur, Abmessungen und Dateigröße
- zusätzliche Dekodierprüfung über die tatsächliche Browser-Vorschau
- zehn Minuten gültiges Vorschau-Token
- Schutz gegen zwischenzeitliche Änderungen an Karte, Register oder Dokumentation
- Alt-/Neu-Vorschau mit Abmessungen und Dateigröße
- Pflichtfelder `Pflegegrund` und gültige HTTP(S)-Quellen-URL
- Staging unter `species-explorer/staging/`
- atomarer Austausch von `species-assets/<SafeName>/map.jpg`
- `manual: true`, `protectFromPipeline: true`, Quelle, Grund, Importdatum und SHA-256 im Override-Register
- gemeinsamer Abgleich der menschenlesbaren Karten-Dokumentation
- höchstens drei verwaltete Kartenbackups je Art und globale Obergrenze von 500 MB
- automatischer, auf die drei Kartenpfade begrenzter Commit und Push
- Abbruch vor dem Import, wenn bereits fremde Dateien im Git-Index vorgemerkt sind

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
- kein automatischer Pipeline-Start
- nach bestätigtem und erfolgreichem Assetaustausch automatischer, eng begrenzter Git-Commit und Push

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
- komplette Pipeline aus der App starten
- automatische rechtliche Bewertung einer Lizenz
- produktives Artportraet ohne vorherige Strukturentscheidung

## Geplante Reihenfolge

1. Override-Register und Pipeline-Schutz
2. Kartenimport mit Vorschau, Backup, Dokumentationsabgleich und Git-Veröffentlichung: technisch umgesetzt
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
- Erfolgreicher Austausch wird nur mit Karte, Override-Register und Kartendokumentation committed und gepusht.
