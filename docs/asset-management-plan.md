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

Status: technisch lokal umgesetzt am 2026-06-20; produktiver Import und visuelle Bedienprüfung stehen noch aus.

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
5. Neues Spektrogramm aus der vorgemerkten MP3 erzeugen und als WebP prüfen.
6. Sound, Credits und Spektrogramm gemeinsam ersetzen.
7. Override-Register mit Sound- und Spektrogramm-SHA-256 aktualisieren.

Vorgesehene Grenze:

- nur MP3
- maximal 50 MB
- kein Soundimport ohne Credits
- keine automatische Lizenzfreigabe; die Entscheidung bleibt sichtbar und pruefbar

API:

- `POST /api/species/<Slug>/assets/sound/preview`
- `GET /api/species/<Slug>/assets/sound/preview-file?token=<Token>`
- `POST /api/species/<Slug>/assets/sound/save`

Umgesetzt:

- Einbindung in den allgemeinen `Bearbeiten`-Dialog der Art
- Pflichtfelder `Pflegegrund`, `Aufnahme/Urheber`, `Quelle`, `Original-URL` und `Lizenz-URL`
- wissenschaftlicher und deutscher Name werden serverseitig aus dem Arteintrag übernommen
- Prüfung von Dateiendung, ID3- beziehungsweise MPEG-Frame-Signatur und Dateigröße
- zusätzliche Browserprüfung der neuen MP3-Datei einschließlich ausgelesener Dauer
- Alt-/Neu-Wiedergabe, Dateigröße, neue Credits und sichtbarer NC-Status vor dem Speichern
- zehn Minuten gültiges Vorschau-Token und Staging unter `species-explorer/staging/`
- Schutz gegen zwischenzeitliche Änderungen an Sound, Credits, Spektrogramm oder Override-Register
- gemeinsames Backup von `sound.mp3`, `credits.json` und `spectrogram.webp`
- automatische Spektrogramm-Erzeugung vor jeder produktiven Soundänderung
- keine Änderung an Produktivdateien, wenn FFmpeg oder die WebP-Prüfung fehlschlägt
- gemeinsamer Ersatz von `sound.mp3`, `credits.json` und `spectrogram.webp`
- `manual: true`, `protectFromPipeline: true`, Quellangaben, Credits-Hash und Sound-SHA-256 im Override-Register
- Spektrogrammstatus `stale: false` mit Sound- und Spektrogramm-SHA-256
- höchstens drei verwaltete Soundpaket-Backups je Art und gemeinsame globale Backupgrenze von 500 MB
- automatischer, auf Sound, Credits, Spektrogramm und Override-Register begrenzter Commit und Push
- Abbruch vor dem Import, wenn bereits fremde Dateien im Git-Index vorgemerkt sind
- laufende Vorschau-Audios stoppen und springen beim Schließen des Bearbeitungsdialogs auf Position 0 zurück
- festes Desktop-Grid mit kompakter Dateieingabe und Pflegegrund über zwei linke Zeilen
- Quelle neben Original-URL, Lizenz neben Land und Ort neben Qualität; mobile Darstellung einspaltig

### 7.7.4 Spektrogramm-Konsistenz

Status: technisch umgesetzt am 2026-06-20. Der Bestand mit 47 Arten ist vollständig hashregistriert und verifiziert.

Umgesetzte Regel:

- SHA-256 des Sounds wird beim Erzeugen des Spektrogramms gespeichert.
- zusätzlich wird der SHA-256 der erzeugten WebP-Datei gespeichert.
- Der Explorer vergleicht beide registrierten Hashes mit den aktuellen Dateien.
- Bei Abweichung wird `Spektrogramm veraltet` angezeigt.
- Ein veraltetes Spektrogramm wird nicht als vollstaendiges, passendes Asset gewertet.
- Der gemeinsame Renderer `scripts/spectrogram-renderer.mjs` stellt identische Parameter für App und CLI sicher.
- Der CLI-Generator registriert erzeugte und bereits aktuelle Spektrogramme.
- Ein unveränderter erneuter Generatorlauf ändert das Register nicht.
- Bei einem NC-Soundsuchlauf wird beim Ablehnen einer Alternative auch der vorherige Spektrogramm-Hashstatus
  wiederhergestellt.

Migrationsstand vom 2026-06-20:

- 47 Spektrogramme vorhanden
- 47 Soundhashes registriert
- 47 Spektrogrammhashes registriert
- 47 Hashpaare verifiziert
- 0 veraltete Spektrogramme

### 7.7.5 Artportraet

Seit 2026-06-21 ist der erste sichere Einzelart-Workflow technisch umgesetzt:

- keine kostenpflichtige Image-API und kein `OPENAI_API_KEY`
- lokaler versionierter Prompt `1.0.0`
- deutscher und wissenschaftlicher Name automatisch aus der Artenliste
- optionale artspezifische Zusatzhinweise
- Prompt anzeigen und kopieren
- externe Bilderzeugung im vorhandenen ChatGPT-Zugang
- Upload von PNG, JPEG oder WebP bis 20 MB
- Magic-Byte-, Mindestgroessen- und 4:5-Pruefung
- lokale Vereinheitlichung auf WebP in `1280x1600`
- Stagingvorschau ohne produktive Aenderung
- verpflichtende manuelle Art- und Anatomiepruefung vor der Uebernahme
- produktive Dateien `portrait.webp` und `portrait.json`
- SHA-256-Registrierung und Abweichungspruefung
- gemeinsames Backup beim Ersetzen
- automatischer, eng begrenzter Commit und Push nach Freigabe
- Markierung `P` und Filter fuer Arten ohne Portrait
- Sammelworkflow zum Kopieren aller fehlenden Portraitprompts

Details und Promptstandard: `docs/portrait-generation.md`.

Noch offen:

- echter Einzelimport eines in ChatGPT erzeugten Bildes
- visuelle und fachliche Freigabe
- Squarespace-Ausgabe ausdruecklich erst nach Abschluss dieser Pruefungen

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
3. Sound-/Credits-Paket mit Backup und Git-Veröffentlichung: technisch umgesetzt
4. automatische Spektrogramm-Neuerzeugung und vollständiger Hashabgleich: technisch umgesetzt
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
- Fehlgeschlagene Spektrogramm-Erzeugung verändert keine Produktivdatei.
- Erfolgreicher Soundwechsel erzeugt ein neues WebP und registriert beide SHA-256-Hashes.
- Nachträgliche Änderung an Sound oder Spektrogramm wird als `Spektrogramm veraltet` erkannt.
- Backup-Retention behaelt hoechstens 3 Versionen je Art/Asset und respektiert die globale Groessengrenze.
- Fremde Dateien in Staging- oder Backupordnern werden nicht automatisch geloescht.
- Projektvalidierung wird nach dem Import automatisch neu geladen.
- Erfolgreicher Kartenaustausch wird nur mit Karte, Override-Register und Kartendokumentation committed und gepusht.
- Erfolgreicher Soundaustausch wird nur mit Sound, Credits, Spektrogrammstatus und Override-Register committed und
  gepusht.
