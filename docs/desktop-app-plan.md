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
- Git-Push nur separat und bewusst, nicht automatisch nebenbei

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

- naechster Schritt
- erst nach stabilem read-only Prototyp
- kontrollierte Formularfelder
- Validierung vor Speichern
- Backup-/Diff-Hinweis

### 7.5 Asset-Verwaltung

- Karten, Sound, Credits und Spektrogramme je Art anzeigen
- manuelle Kartenwechsel dokumentieren
- spaeter Datei-Import pruefen

### 7.6 Pipeline- und Audit-Steuerung

- Update, Audit und Spektrogramm-Generator aus UI starten
- Ausgabe und Fehler in der UI anzeigen
- Git-Push weiterhin separat bestaetigen

### 7.7 Synology NAS und automatisiertes Backup

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
