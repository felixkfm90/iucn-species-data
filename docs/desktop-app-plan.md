# Desktop App / Arten-Explorer

Stand: 2026-06-17

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

Naechster Schritt.

Umfang:

- Ordner `species-explorer/` anlegen
- lokaler Node-Server
- API fuer Artenliste, Detaildaten und Assetstatus
- UI mit Artenliste, Suche und Detailbereich
- keine Schreibfunktionen

### 7.3 Validierung und Statusdashboard

- Report- und Assetprobleme sichtbar machen
- manuell gepflegte Karten markieren
- NC-Sounds markieren
- Unterschiede zwischen `species_list.json` und `speciesData.json` anzeigen

### 7.4 Bearbeiten von `species_list.json`

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

- `npm.cmd run species:explorer` startet lokalen Server.
- Browser zeigt Artenliste mit 45 Arten.
- Suche findet deutsche und wissenschaftliche Namen.
- Detailansicht zeigt Daten aus `species_list.json` und `speciesData.json`.
- Assetstatus zeigt fuer alle 45 Arten Karte, Sound, Credits und Spektrogramm vorhanden.
- NC-Sounds werden fuer `Bisamratte`, `Brauenmotmot` und `Geoffroy-Klammeraffe` markiert.
- Manuelle Karten werden fuer die 7 dokumentierten Arten markiert.
- Server schreibt keine Dateien.
- Beenden des Servers hinterlaesst keine Dateien in `Testlauf/`.
