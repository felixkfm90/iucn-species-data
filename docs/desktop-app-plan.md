# Desktop App / Arten-Explorer

Stand: 2026-06-19

Ziel von Phase 7: Eine lokale Bedienoberflaeche schaffen, mit der Arten, manuelle Daten, Assets, Sounds, Karten,
Credits, Reports und Pipeline-Status gepflegt bzw. geprueft werden koennen, ohne direkt in JSON-Dateien und Ordnern
suchen zu muessen.

## Entscheidung fuer den Start

Der erste Prototyp soll als lokale Node-Web-App mit Browseroberflaeche umgesetzt werden.

Begruendung:

- Das Projekt nutzt bereits Node.js und lokale Skripte.
- Es ist keine zusaetzliche Desktop-Packaging-Schicht noetig.
- Die App kann direkt dieselben Dateien lesen wie Pipeline, Audit und Frontend.
- Ein lokaler Browser ist fuer Tabellen, Filter, Detailansichten, Audio, Karten und Validierungslisten ausreichend.
- Die App kann spaeter immer noch in Electron oder Tauri verpackt werden, falls ein echtes Desktop-Fenster noetig wird.

Nicht fuer den ersten Schritt empfohlen:

- Sofort Electron: mehr Abhaengigkeiten, Packaging, Auto-Update-Fragen und groesserer Wartungsaufwand ohne aktuellen
  Mehrwert.
- Sofort Tauri: schlanker als Electron, aber zusaetzliche Rust-/Build-Komplexitaet.
- Direktes Bearbeiten in der ersten Version: Risiko fuer `species_list.json`, Assets und Pipeline-Stand waere zu hoch.

## Vorgeschlagene technische Basis

Start als schlanke lokale Web-App:

```text
species-explorer/
  server.mjs
  public/
    index.html
    app.css
    app.js
```

Moeglicher npm-Befehl:

```bash
npm.cmd run species:explorer
```

Server-Verhalten:

- bindet nur an `127.0.0.1`
- liest lokale Repo-Dateien
- liefert statische UI-Dateien aus
- stellt JSON-Endpunkte fuer die UI bereit
- startet zunaechst read-only
- schreibt keine Daten, solange Schreibfunktionen nicht separat geplant und getestet sind

Frontend-Verhalten:

- keine Marketing-/Landingpage, sondern direkt Arbeitsoberflaeche
- linke Liste oder Tabelle fuer Arten
- rechte Detailansicht fuer Daten, Assets und Status
- kompakte Filter fuer Region/Gruppe/Status/Soundlizenz/Assetfehler
- klare Warnungen bei fehlenden Assets oder NC-Sounds

## Read-only Prototyp

Der erste umsetzbare Prototyp soll nur lesen und anzeigen.

Datenquellen:

- `species_list.json`: manuelle Eingabeliste, Groesse, Gewicht, Lebenserwartung
- `speciesData.json`: generierte Website-Daten
- `fehlende_elemente_report.json`: fehlende Daten/Assets und NC-Sounds
- `species-assets/<SafeName>/`: `map.jpg`, `sound.mp3`, `credits.json`, `spectrogram.webp`
- `docs/manual-map-overrides.md`: Liste manuell gepflegter Karten

Funktionen:

- Artenliste anzeigen
- Suche nach deutschem Namen, wissenschaftlichem Namen und URL-Slug
- Detailansicht je Art:
  - Name, wissenschaftlicher Name, Slug
  - manuelle Felder aus `species_list.json`
  - IUCN-Felder aus `speciesData.json`
  - Assetstatus: Karte, Sound, Credits, Spektrogramm
  - Soundlizenz und Quelle aus `credits.json`
  - Hinweis, ob Karte manuell gepflegt ist
- Statusuebersicht:
  - Anzahl Arten
  - fehlende Kernassets
  - aktive NC-Sounds
  - manuell gepflegte Karten
  - Datum des letzten Reports

Nicht enthalten:

- keine Schreibfunktion
- kein automatischer Pipeline-Lauf
- kein automatischer Git-Push
- keine automatische Artanlage

## Spaetere Schreibfunktionen

Schreibfunktionen werden erst nach einem stabilen read-only Prototyp geplant.

Moegliche Schreibziele:

- `species_list.json` fuer neue Arten und manuelle Zusatzdaten
- `docs/manual-map-overrides.md` fuer manuell gepflegte Karten
- `species-assets/<SafeName>/` fuer manuell ersetzte Karten, Sounds oder Credits

Grundregeln fuer spaetere Schreibfunktionen:

- Vor jedem Schreibvorgang Backup oder Git-Diff-Hinweis anzeigen.
- Nie direkt `speciesData.json` manuell bearbeiten; diese Datei bleibt Pipeline-Ausgabe.
- Neue Arten werden nur manuell durch Felix angelegt oder bestaetigt.
- Schreibaktionen muessen validieren:
  - Pflichtfelder
  - wissenschaftlicher Name
  - URL-Slug
  - `sanitizeAssetName()` / SafeName
  - doppelte Arten
  - vorhandene Assets
  - Lizenz-/Credit-Angaben

## Pipeline- und Tool-Integration

Spaeter sinnvoll:

- `node update.mjs` aus der App starten
- `npm.cmd run --silent audit:site -- --skip-live --skip-pages` ausfuehren
- `npm.cmd run --silent generate:spectrograms` ausfuehren
- Ergebnis-JSON in der UI anzeigen
- Fehler aus `errors.log` lesbar darstellen

Diese Funktionen brauchen klare Schutzmechanismen:

- vor Start anzeigen, welche Aktion ausgefuehrt wird
- keine Tokens anzeigen
- lange Prozesse mit Statusausgabe
- nach Abschluss klarer Hinweis auf geaenderte Dateien
- Git-Push nur nach einem ausdrücklich bestätigten Pipeline- oder Bereinigungslauf; nicht bei normalen
  Formularänderungen nebenbei

## NAS und Backup

NAS-/Synology-Thema gehoert ebenfalls in Phase 7, aber nach dem ersten App-Prototyp.

Empfohlene Reihenfolge:

1. Lokale Arbeitskopie auf dem Windows-Rechner bleibt primaer.
2. Synology NAS zuerst als Backup- oder Mirror-Ziel nutzen, nicht sofort als aktive Arbeitskopie.
3. Automatisiertes Backup einrichten:
   - Repo ohne `node_modules/`, `local-tools/`, `Testlauf/`, `.env` und Tokens
   - Zeitplan definieren
   - Backup-Log pruefen
   - Restore-Test dokumentieren
4. Erst nach erfolgreichem Restore-Test pruefen, ob Arbeiten direkt auf dem Netzlaufwerk sinnvoll ist.

Risiken aktiver Arbeit auf NAS/Netzlaufwerk:

- langsamere Dateioperationen
- Git-Dateilocks
- Sync-Konflikte
- Pfad-/Encoding-Probleme unter Windows
- parallele Zugriffe durch Backup-/Sync-Dienste

## Phasenplan

### 7.1 Anforderungen und technische Basis

Status: erledigt am 2026-06-17.

Ergebnis:

- Start als lokale Node-Web-App mit Browseroberflaeche.
- Erster Prototyp bleibt read-only.
- Schreib-, Pipeline-, Git- und Backupfunktionen werden getrennt eingefuehrt.

### 7.2 Read-only Prototyp

Status: erledigt am 2026-06-18.

Umgesetzt:

- Ordner `species-explorer/` anlegen
- lokaler Node-Server unter `127.0.0.1:4177`
- Startbefehl: `npm.cmd run species:explorer`
- read-only API fuer Projektstatus, Artenliste, Detaildaten und Assets
- UI mit Artenliste, Suche, Statusfilter, Hinweisfilter und Detailbereich
- Anzeige von manuellen Daten, IUCN-Daten, Taxonomie und Assetstatus
- Vorschau von Karte und Spektrogramm
- native Soundwiedergabe und Credits-/Lizenzanzeige
- Kennzeichnung von drei NC-Sounds und sieben manuell gepflegten Karten
- Kennzeichnung fehlender oder inkonsistenter Daten/Assets
- keine Schreibfunktionen, Pipeline-Aufrufe oder Git-Aktionen

Dateien:

```text
species-explorer/
  server.mjs
  server.test.mjs
  public/
    index.html
    app.css
    filter.js
    app.js
```

API:

- `GET /api/summary`
- `GET /api/species`
- `GET /api/reload`: liest lokale Dateien erneut ein, schreibt aber nichts
- `GET /assets/<SafeName>/<Datei>`
- andere HTTP-Methoden werden mit `405 Read-only` abgewiesen

Teststand:

- 45 Arten aus `species_list.json` und `speciesData.json`
- 0 Assetinkonsistenzen
- 3 NC-Sounds erkannt
- 7 manuell gepflegte Karten erkannt
- Suche nach deutschem Namen, wissenschaftlichem Namen und Slug getestet
- Status-/Hinweisfilter getestet
- `POST /api/species` liefert 405
- Desktop-Sichtpruefung bei 1440 x 1000 Pixeln
- responsive Sichtpruefung bei 500 x 900 Pixeln
- gerenderter DOM enthaelt Artenzahl, Detaildaten, Karte, Spektrogramm und Read-only-Hinweis
- Nachbesserung vom 2026-06-18:
  - Verbreitungskarten werden ohne festen 16:9-Rahmen im vollstaendigen Originalseitenverhaeltnis angezeigt.
  - Das Spektrogramm ist direkt in den Tierstimmen-Player integriert.
  - Play/Pause, Zeit, Lautstaerke, Scrubbing im Spektrogramm und roter Positionsmarker sind miteinander gekoppelt.
  - Ein Klick ins Spektrogramm setzt die Wiedergabeposition und startet den Ton sofort an dieser Stelle.
  - Der lokale Assetserver beantwortet Byte-Range-Anfragen mit `206 Partial Content`. Das ist fuer zuverlaessiges
    MP3-Seeking erforderlich; ohne Range-Unterstuetzung fiel die Wiedergabe nach einem Klick auf Position 0 zurueck.
  - Beim Artwechsel wird die Artenliste nicht neu aufgebaut und die Fenster-Scrollposition bleibt erhalten.
  - Der Tierstimmen-Bereich belegt nur noch etwa ein Drittel der rechten Medienspalt-Hoehe; das spaetere
    Artportraet erhaelt den groesseren Bereich. Quellen- und Lizenzdaten sind standardmaessig eingeklappt.
  - Medienbereich und darunterliegendes Datenraster nutzen identische 50/50-Spalten, sodass Karten- und Datenboxen
    exakt aneinander ausgerichtet sind.
  - Das Explorer-Spektrogramm ist auf eine responsive Anzeigehoehe von 64 bis 84 Pixel begrenzt. Die produktiven
    WebP-Dateien werden dafuer nicht neu erzeugt.
  - Das Datum `Daten abgerufen` steht im Detailkopf statt in der IUCN-Datentabelle.
  - Der Statusfilter zeigt deutsche Bezeichnungen mit IUCN-Kuerzel, zum Beispiel `Gefaehrdet (VU)`.
  - Eine manuell hinzugefuegte Karte wird direkt in der Zeile `Karte` markiert. Die generische Assetkennzeichnung
    kann spaeter auch fuer manuell hinzugefuegte Sounds verwendet werden.
  - Browsermessung: Scrollposition vor/nach Artwechsel jeweils `900`; Rotfuchs-Karte im gleichen Seitenverhaeltnis
    wie das Original; echter Play-Klick bewegte Wiedergabezeit und Positionsmarker.

### 7.3 Validierung und Statusdashboard

Status: erledigt am 2026-06-19.

Umgesetzt:

- read-only API `GET /api/validation`
- kompaktes Dashboard mit Gesamtzustand und vier Bereichen:
  - Eingabe gegen Pipeline-Ausgabe
  - Assetvollstaendigkeit
  - Report-Abgleich
  - besondere Pflege mit manuellen Karten und NC-Sounds
- Abgleich aller Arten zwischen `species_list.json` und `speciesData.json`
- Feldvergleich fuer deutschen Namen, wissenschaftlichen Namen, Groesse, Gewicht, Lebenserwartung und URL-Slug
- Pruefung der IUCN-Kernfelder Assessment ID, Status, Kategorie und Trend
- getrennte artweise Listen fuer Datenabweichungen und Assetprobleme
- Filter `Datenabweichung`, `Assetproblem` und `Alle Probleme`
- Status- und Hinweis-Dropdowns alphabetisch nach den sichtbaren deutschen Bezeichnungen sortiert
- Assetzaehler fuer Karte, Sound, Credits und Spektrogramm
- neun Reportpruefungen:
  - fehlende Sounds
  - fehlende Sound-Credits
  - fehlende Karten
  - unvollstaendige Assetordner
  - fehlende Assessment IDs
  - fehlende Status
  - fehlende Kategorien
  - fehlende Trends
  - NC-Soundlizenzen
- zusaetzlicher Abgleich der Reportzaehler gegen die zugehoerigen Listen
- der gueltige IUCN-Trend `Unbekannt` wird nicht als fehlender Wert behandelt

Aktueller Pruefstand:

- 45 Eingabeeintraege
- 45 Pipeline-Eintraege
- 45 vollstaendig uebereinstimmende Datenpaare
- 0 Datenabweichungen
- 45 vollstaendige Assetpakete
- 0 Assetprobleme
- 9 von 9 Reportpruefungen konsistent
- 0 Reportzaehler-Probleme
- 7 manuell hinzugefuegte Karten
- 3 NC-Sounds
- visuelle Pruefung durch Felix am 2026-06-19 erfolgreich

### 7.4 Bearbeiten von `species_list.json`

Status: abgeschlossen am 2026-06-19.

Umgesetzt:

- Artaktionen `Bearbeiten` und `Löschen` im Detailkopf oben rechts; sie sind nicht an den Abschnitt
  `Manuelle Daten` gebunden und können in Phase 7.7 um Karten-, Sound- und weitere Assetpflege erweitert werden
- kontrollierte Formularfelder:
  - Groesse (`size`)
  - Gewicht (`weight`)
  - Lebenserwartung (`life_expectancy`)
- deutscher Name, Gattung und Art bleiben gesperrt, weil sie Slugs und Assetpfade beruehren
- generierte IUCN-Felder bleiben nicht editierbar
- serverseitige Pflichtfeld-, Laengen- und Steuerzeichenvalidierung
- Diff-Vorschau mit Vorher-/Nachher-Werten
- Speichern erst nach erfolgreicher Vorschau
- zehn Minuten gueltiges einmaliges Vorschau-Token
- Schutz gegen parallele Aenderungen durch SHA-256-Pruefung der Quelldatei
- lokale Sicherung vor jedem Schreibvorgang unter `species-explorer/backups/`
- Backupordner ist in `.gitignore` eingetragen
- automatische Aufbewahrungsgrenze von 20 verwalteten Backups; beim erfolgreichen Speichern werden aeltere passende
  `species_list-*.json`-Backups entfernt
- andere Dateien im Backupordner werden von der Bereinigung nicht beruehrt
- Schreiben ueber temporaere Datei und anschliessendes Ersetzen von `species_list.json`
- sichtbarer Hinweis, dass `speciesData.json` unveraendert bleibt und die Pipeline separat gestartet werden muss
- Dashboard zeigt nach dem Speichern erwartete Feldabweichungen bis zum naechsten Pipeline-Lauf
- keine Funktion fuer neue Arten, Namens-/Taxonomieaenderungen, Pipeline oder Git

API:

- `POST /api/species/<Slug>/preview`
- `POST /api/species/<Slug>/save`
- andere nicht definierte Schreibzugriffe liefern `405`

Teststand:

- leere oder ungueltige Felder werden mit `400` abgewiesen
- Vorschau schreibt keine Datei
- Speichern ohne gueltiges Vorschau-Token liefert `409`
- Speichern erzeugt zuerst ein inhaltlich korrektes Backup
- bei mehr als 20 verwalteten Backups bleiben exakt die neuesten 20 erhalten
- eine fremde Testdatei im Backupordner bleibt bei der Bereinigung erhalten
- nur die drei freigegebenen Felder werden geschrieben
- Vorschau-Token kann nur einmal verwendet werden
- nach dem Speichern meldet die Validierung die erwartete Pipeline-Abweichung
- echte Projektdatei bleibt bei Tests unveraendert; Schreibtests laufen in einem temporaeren Mini-Repository
- Phase-7.4-Pruefungen sind Teil der inzwischen 6 erfolgreichen Explorer-Tests
- Speichern und Korrigieren eines Testwerts von Felix visuell geprueft
- Erfolgsmeldung funktioniert auch bei einem bereits laufenden aelteren Server-Antwortformat
- automatische Aufbewahrungsgrenze ist im neu gestarteten Server aktiv

### 7.5 Neue Art anlegen

Status: abgeschlossen und am 2026-06-20 mit Haubentaucher und Höckerschwan praktisch geprüft.
Fachlicher Ablauf: `docs/add-species-workflow.md`.

Ziel:

- neue, von Felix ausgewaehlte Arten kontrolliert in `species_list.json` anlegen
- nur die fuenf redaktionellen Eingabefelder erfassen
- Pipeline und Assets weiterhin separat erzeugen

Formularfelder:

- deutscher Name
- wissenschaftlicher Name, zum Beispiel `Turdus Merula`
- Groesse
- Gewicht
- Lebenserwartung

Pflichtvalidierung:

- keine leeren Felder
- wissenschaftlicher Name besteht aus genau zwei gueltigen Namensbestandteilen
- Gattung und Artepitheton werden im Hintergrund getrennt und als `Turdus` plus `merula` normalisiert
- keine doppelte Kombination aus Gattung und Art
- kein doppelter deutscher Name
- keine Kollision des berechneten URL-Slugs
- keine Kollision des berechneten `SafeName` oder Assetordners
- Feldlaengen und Steuerzeichen pruefen

Vorschau und Speicherung:

- neuen JSON-Eintrag vollstaendig anzeigen
- erwarteten wissenschaftlichen Namen, Slug und Assetpfad anzeigen
- expliziter Hinweis: IUCN-Daten und Assets entstehen erst nach `node update.mjs`
- Speichern nur mit einmaligem Vorschau-Token
- SHA-256-Schutz gegen parallele Aenderungen
- Sicherung und 20-Dateien-Aufbewahrung wie in Phase 7.4
- atomar an `species_list.json` anhaengen
- keine automatische Pipeline und kein Git-Push

Erwarteter Zustand nach dem Speichern:

- neue Art ist sofort in der Explorer-Liste sichtbar
- Statusdashboard zeigt `nur in species_list.json`
- IUCN-Daten und Assets gelten bis zum Pipeline-Lauf als ausstehend, nicht als unerwarteter Systemfehler

Testplan:

- gueltige neue Art kann in einem temporaeren Testrepo angelegt werden: erledigt
- Duplikate nach wissenschaftlichem und deutschem Namen werden abgewiesen: erledigt
- vorhandener Assetordner wird als Kollision abgewiesen: erledigt
- Eingaben wie `Testus Avis` werden zu `Testus avis` normalisiert: erledigt
- Vorschau schreibt nichts: erledigt
- Speichern ohne Token wird abgewiesen: erledigt
- Backup entsteht vor dem Anhaengen: erledigt
- nur ein neuer Eintrag wird angehaengt; bestehende Eintraege bleiben unveraendert: erledigt
- Dashboard erkennt den erwarteten `input-only`-Zustand: erledigt
- Vorschau-Token kann nur einmal verwendet werden: erledigt
- parallele Dateiaenderung vor dem Speichern wird durch den SHA-256-Schutz abgewiesen: erledigt

API:

- `POST /api/species/new/preview`
- `POST /api/species/new/save`

Aktueller Pruefstand:

- 6 Explorer-Tests erfolgreich
- echte Projektdatei bleibt bei den Schreibtests unveraendert
- lokaler Server auf `127.0.0.1:4177` mit dem neuen Stand neu gestartet
- HTML-Auslieferung enthaelt Aktion, Dialog und alle fuenf Pflichtfelder mit Beispieltexten
- nach erfolgreichem Speichern wird die Aktion wieder freigegeben; weitere Arten koennen ohne Seitenneuladen
  angelegt werden
- Eingabedialoge schließen bei einer Textmarkierung über den Fensterrand nicht mehr versehentlich; ein
  Hintergrundklick zählt nur, wenn er vollständig auf dem Hintergrund beginnt und endet
- Haubentaucher und Höckerschwan wurden erfolgreich neu angelegt und anschließend vollständig verarbeitet
- integrierte Browsersteuerung konnte wegen der lokalen Windows-Sandbox nicht gestartet werden; deshalb ist die
  visuelle Bedienpruefung noch nicht als abgeschlossen markiert

### 7.6 Pipeline- und Audit-Steuerung

Status: abgeschlossen am 2026-06-20. Start, Prozessanzeige, Assetentscheidung, automatischer Commit/Push,
Bereinigung, Karten-Großansicht, sichere Dialogbedienung und Soundstopp wurden praktisch geprüft.
Detailplanung: `docs/pipeline-control-plan.md`.

Die Bedienoberflaeche unterscheidet zwei ausdrueckliche Laufarten:

- `Neue/Unvollstaendige Arten aktualisieren`: verarbeitet gezielt input-only Arten und Arten mit fehlenden
  Kernfeldern oder Assets
- `Alle Arten vollstaendig aktualisieren`: entspricht dem bisherigen kompletten Lauf von `node update.mjs`
- `Manuelle Karten erneut suchen`: verarbeitet nur die sieben manuell geschützten Karten
- `NC-Sounds erneut suchen`: verarbeitet nur die drei vorhandenen NC-Sounds

Vor jedem Start werden Laufart, Artenliste und Gruende angezeigt. Es darf nur ein Lauf gleichzeitig aktiv sein.
Tokenwerte werden weder an den Browser noch in Logs ausgegeben. Git-Commit und Git-Push bleiben separate Schritte.

Technische Reihenfolge:

1. `update.mjs` um Auswahl-, Voll- und Dry-run-Modus erweitern
2. bei Teillaeufen nicht ausgewaehlte Bestandsdaten sicher erhalten
3. lokale Start-/Status-/Log-API mit Einzellauf-Sperre bauen
4. Vorschau und Startbestaetigung in der App anbinden
5. Spektrogramm-Abgleich passend zur Zielartenliste ausfuehren
6. nach Laufende Explorer-Daten und Validierung neu laden

Umgesetzt:

- `update.mjs --mode=missing`: nur neue Arten sowie Arten mit fehlenden IUCN-Kernfeldern oder Assets
- `update.mjs --mode=all`: vollstaendiger Lauf; Aufruf ohne Parameter bleibt rueckwaertskompatibel ebenfalls `all`
- `--dry-run`: zeigt Artenauswahl ohne Schreibzugriff und ohne erforderliche API-Tokens
- nicht ausgewaehlte Arten werden bei einem Teillauf aus der vorhandenen `speciesData.json` uebernommen
- Pipeline-Vorschau, einmaliges Token und Schutz gegen zwischenzeitliche Datenänderungen
- nur ein Pipeline- oder Bereinigungslauf gleichzeitig
- Live-Status und begrenzte lokale Logs unter `species-explorer/logs/`
- nach Prozessstart bleibt der Statusdialog geöffnet und meldet `Pipeline-Lauf läuft gerade`
- `Abbrechen` wird nach dem Start zu `Fenster schließen`; das Schließen beendet den Hintergrundprozess nicht
- ein Statusbalken im Hauptfenster bleibt für laufende, wartende, abgeschlossene und fehlgeschlagene Läufe sichtbar
- gezielter beziehungsweise vollstaendiger Spektrogramm-Abgleich nach erfolgreicher Datenpipeline
- Git bleibt getrennt
- der zuvor separate Bereich `Phase 7.6 · Prozesssteuerung` wurde wieder entfernt, damit er keinen dauerhaften
  vertikalen Platz belegt
- die Kopfzeile enthält ein klickbares Datenbankfeld; rot bedeutet `Datenbank aktualisieren`, gruen bedeutet
  `Datenbank aktuell`
- es öffnet einen Dialog zur Auswahl von `Neue/Unvollstaendige Arten aktualisieren`, `Alle Arten aktualisieren`
  oder `Bereinigen`
- die Prozessausgabe und der letzte Status stehen ebenfalls in diesem Dialog
- die Kopfzeile schaltet mit identischer Feldbreite zwischen `Lesemodus` und `Bearbeitungsmodus`
- im Lesemodus sind `Neue Art`, Datenbankaktualisierung, Bearbeiten und Löschen ausgeblendet, ohne dass der Schalter
  seine Position veraendert
- nach dem Anlegen einer neuen Art öffnet die App automatisch die Vorschau für den selektiven Lauf; Abbrechen lässt
  die Art wie bisher als ausstehend stehen
- neue Karten und Sounds werden nach Pipeline, Spektrogramm und Report angezeigt
- neue Karten lassen sich im Prüfdialog anklicken und in einer großen Lightbox bewerten
- laufende Sounds im Prüfdialog stoppen beim Schließen sofort und springen auf Position 0 zurück
- Felix bestätigt je Asset automatische Pflege oder manuellen Schutz
- `species-assets-overrides.json` schützt manuell markierte Karten und Sounds bei späteren Pipeline-Laeufen
- danach werden die vorgesehenen Pipeline-Dateien automatisch committed und gepusht
- die Erfolgsmeldung aus dem ersten Speicherschritt einer neuen Art verschwindet nach erfolgreichem Commit und Push
- Karten- und NC-Soundsuchlauf sichern bestehende Assets lokal und stellen sie bei Ablehnung wieder her

Arten loeschen und bereinigen:

- `Löschen` in der Artansicht entfernt nach Vorschau standardmäßig nur den Eintrag aus `species_list.json`
- vorher wird ein normales `species_list.json`-Backup angelegt
- eine Checkbox kann generierte Daten, Assessment-Zuordnung, Asset-Pflegeeintrag und Assetordner derselben Art
  sofort dauerhaft mitlöschen
- ohne Checkbox bleiben generierte Daten und Assetordner zunächst bestehen
- globale Aktion `Bereinigen` zeigt verwaiste Datensaetze, Assessment-Zuordnungen, Pflegeeinträge und Assetordner
- nach genau einer Bestaetigung werden die aufgelisteten Altdateien dauerhaft und ohne Wiederherstellungsablage
  geloescht
- Detailablauf: `docs/delete-species-workflow.md`

Aktueller Teststand:

- 9 Explorer-Tests erfolgreich
- Auswahl `missing` und `all` in temporaerem Repository getestet
- Listeneintrag loeschen, optionale Sofortlöschung, Backup, erhaltene Assets und anschliessende dauerhafte
  Bereinigung getestet
- produktive Artenliste und Assets werden von diesen Tests nicht verändert

Automatische Aktualität:

- Der Server bildet eine Revision aus `species_list.json`, `speciesData.json`, Report, Asset-Overrides,
  manueller Karten-Dokumentation und allen produktiven Assetdateien.
- Vor jeder Daten-API-Antwort prüft der Server diese Revision und baut sein Modell bei externen Änderungen neu auf.
- Die Browseroberfläche fragt `GET /api/revision` alle fünf Sekunden ab.
- Ändert sich die Revision, werden Übersicht, Validierung, Artenliste und Detailansicht automatisch neu geladen.
- Damit werden auch Läufe über `update_local.bat`, manuelle CLI-Aufrufe und andere externe Dateiänderungen sichtbar,
  ohne den Server neu zu starten oder den Aktualisieren-Knopf zu drücken.
- Ein isolierter Test verändert `species_list.json` nach dem Serverstart und bestätigt die automatische
  Modellaktualisierung.

Kompakte Oberfläche:

- Die interne Roadmap-Bezeichnung `Phase 7.3 · Datenprüfung` wird nicht in der App angezeigt; sichtbar bleibt nur
  die fachliche Überschrift `Validierung und Status`.
- Die linke Artenliste zeigt maximal 15 Einträge gleichzeitig. Weitere Treffer bleiben innerhalb der Liste per
  Scrollen erreichbar, damit die Navigation bei wachsender Artenzahl nicht die Seite verlängert.

### 7.7 Asset-Verwaltung

Danach. Detailplanung: `docs/asset-management-plan.md`.

Geplante Teilstufen:

1. maschinenlesbares Override-Register und expliziter Pipeline-Schutz
2. kontrollierter Kartenimport mit Vorschau, Quelle, Grund, Backup und Dokumentationsabgleich
3. Sound und Credits nur als gemeinsames validiertes Paket ersetzen
4. Spektrogramm per Soundhash als passend oder veraltet kennzeichnen
5. Artportraet-Quelle, Lizenz, Dateiformat und Squarespace-Verwendung separat entscheiden

### 7.8 Synology NAS und automatisiertes Backup

- NAS als Backup/Mirror konzipieren
- Backup-Skript oder Synology-Job definieren
- Restore-Test dokumentieren
- erst danach aktive Arbeit auf Netzlaufwerk bewerten

## Testplan fuer 7.2

- `npm.cmd run species:explorer` startet lokalen Server: erledigt.
- Browser zeigt Artenliste mit 45 Arten: erledigt.
- Suche findet deutsche und wissenschaftliche Namen sowie Slugs: erledigt.
- Detailansicht zeigt Daten aus `species_list.json` und `speciesData.json`: erledigt.
- Assetstatus zeigt fuer alle 45 Arten Karte, Sound, Credits und Spektrogramm vorhanden: erledigt.
- NC-Sounds werden fuer `Bisamratte`, `Brauenmotmot` und `Geoffroy-Klammeraffe` markiert: erledigt.
- Manuelle Karten werden fuer die 7 dokumentierten Arten markiert: erledigt.
- Server schreibt keine Dateien und weist POST mit 405 ab: erledigt.
- Temporaere Screenshots, Browserprofile und Logs aus `Testlauf/` werden nach dem Abschluss entfernt.
