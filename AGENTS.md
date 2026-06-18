# AGENTS.md - Projektuebergabe Wildlife/IUCN Squarespace

Stand: 2026-06-18

Projekt: `fnwildlifetravel.de` Wildlife-Artseiten, IUCN-Daten, Karten, Sounds, Suche und Lightbox-Zoom
Repository: `felixkfm90/iucn-species-data`
Branch: `main`
GitHub Pages Base: `https://felixkfm90.github.io/iucn-species-data/`

## Arbeitsregel: Dokumentation ist Pflicht

Kein Schritt der Roadmap gilt als abgeschlossen, solange die dazugehoerige Dokumentation nicht aktuell ist.

Bei jedem technischen Schritt pruefen und bei Bedarf aktualisieren:

- `AGENTS.md` fuer den aktuellen Uebergabe- und Arbeitsstand
- `README.md` fuer Projektueberblick, Bedienung und Betriebsablauf
- `docs/roadmap.md` fuer Status, naechste Schritte und Priorisierung
- passende Detaildokumente unter `docs/`, z. B. CSS-, Sound-, Repo-, Desktop-App- oder Squarespace-Doku

Wenn eine JS-Datei geaendert wird, muss auch `docs/squarespace-footer.html` bzw. die Squarespace-`?v=`-Version
geprueft werden. Wenn CSS geaendert wird, muss `docs/squarespace-custom.css` mit dem echten Squarespace-Stand
abgeglichen werden.

## Kurzueberblick

Squarespace ist das sichtbare Frontend/CMS. Die Artseiten enthalten nur Container-IDs. Die dynamischen Inhalte werden
ueber JavaScript-Module von GitHub Pages geladen.

Zentrale Dateien:

- `species_list.json`: manuelle Artenliste und Input fuer die Pipeline, inklusive Groesse, Gewicht und
  Lebenserwartung
- `update.mjs`: Datenpipeline fuer IUCN, Karten, Xeno-Canto, Wikimedia Commons, iNaturalist, Sounds und Reports
- `speciesData.json`: generierte Datenbank fuer die Frontend-Module
- `species-assets/<Artname>/map.jpg`: primaere Verbreitungskarte pro Art
- `species-assets/<Artname>/sound.mp3` und `species-assets/<Artname>/credits.json`: primaere Tierstimme und Quellen
- `species-assets/<Artname>/spectrogram.webp`: Spektrogramm fuer die Tierstimmen-Soundbar
- `fehlende_elemente_report.json`: Qualitaetsreport fuer fehlende Assets/Daten und NC-Soundlizenzen

Frontend-Module:

- `species-core.js`: gemeinsamer Datenloader, Slug-Ermittlung, Cache und Assetnamen-Sanitizer
- `species-info.js`: Info-Box
- `species-taxonomy.js`: Taxonomie-Pyramide
- `species-status.js`: IUCN-Status und Populationstrend
- `species-sound.js`: native Soundbar mit vorbereitetem Spektrogramm, Canvas-Fallback, Lautstaerke,
  Abspielgeschwindigkeit, Credits und Lizenzhinweisen
- `map-loader.js`: Verbreitungskarte
- `search.js`: Suche auf Uebersichtsseiten
- `sort.js`: Sortierung sichtbarer Listen
- `lightbox-zoom.js`: Galerie-/Lightbox-Zoom

## Aktueller Projektstand

- 45 aktive Arten
- 45 Karten
- 45 Art-Assetordner
- 45 MP3-Dateien
- 45 Credits-Dateien
- 45 Spektrogramm-Dateien
- 45 `species-assets/<SafeName>/`-Ordner mit `map.jpg`, `sound.mp3`, `credits.json` und `spectrogram.webp`
- 0 fehlende Kernassets laut Report
- 7 manuell gepflegte Karten wegen korrupter IUCN-Kartendaten:
  - `Blaukehlchen`
  - `Fischertukan`
  - `Grosstrappe`
  - `Kernbeisser`
  - `Reh`
  - `Rotfuchs`
  - `Waldkauz`
- 3 aktive NC-Soundlizenzen laut Report:
  - `Bisamratte`
  - `Brauenmotmot`
  - `Geoffroy-Klammeraffe`

Der Sound-Suchlauf prueft vorhandene NC-Sounds bei jedem Update erneut auf freie Alternativen:

1. freie Xeno-Canto-Aufnahmen
2. freie Wikimedia-Commons-Audiodateien mit erreichbarem MP3-Transcode
3. freie iNaturalist-MP3-Aufnahmen mit exaktem Taxon, freier Lizenz und gueltiger MP3-Datei

Aktuell ersetzte freie Quellen:

- `Eurasisches Eichhoernchen`: freie Xeno-Canto-Alternative
- `Fischertukan`: freie Wikimedia-Commons-/iNaturalist-Aufnahme
- `Grosstrappe`: freie Wikimedia-Commons-Aufnahme
- `Mittelamerikanischer Totenkopfaffe`: freie iNaturalist-Aufnahme, CC BY 4.0
- `Panama-Kapuzineraffe`: freie iNaturalist-Aufnahme, CC BY 4.0
- `Quetzal`: freie Quelle, nicht mehr im NC-Report

Letzter vollstaendiger Pipeline-/Report-Check: 2026-06-17.

## Datenfluss

```text
species_list.json
  -> update.mjs
     -> IUCN API v4
     -> Xeno-Canto API
     -> Wikimedia Commons API
     -> iNaturalist API
     -> speciesData.json
     -> species-assets/<SafeName>/map.jpg
     -> species-assets/<SafeName>/sound.mp3
     -> species-assets/<SafeName>/credits.json
     -> species-assets/<SafeName>/spectrogram.webp
     -> fehlende_elemente_report.json
  -> GitHub Pages
  -> Squarespace Footer Scripts
  -> Squarespace Container auf Art- und Uebersichtsseiten
```

## Squarespace-Integration

Aktuell dokumentierter Footer:

- `docs/squarespace-footer.html`

Aktuell dokumentiertes Custom CSS:

- `docs/squarespace-custom.css`

Art-Detailseiten brauchen diese Container:

```html
<div id="species-output">
  <div id="species-info"></div>
  <div id="species-taxonomy"></div>
  <div id="species-status"></div>
</div>

<div id="species-sound"></div>

<div id="map-wrapper" class="frame-box">
  <div id="map-output"></div>
</div>
```

Uebersichtsseiten brauchen fuer Suche:

```html
<div id="species-search"></div>
```

Optional fuer Sortierung:

```html
<select id="species-sort"></select>
```

## Lokaler Workflow

Voraussetzungen:

- Node.js
- `npm install`
- Umgebungsvariable `IUCN_TOKEN`
- Umgebungsvariable `XENO_TOKEN`
- GitHub-Anmeldung ueber Git Credential Manager oder SSH, keine Tokens in Batch-Dateien oder Git-Remote-URLs

Manuell ausfuehren:

```bash
node update.mjs
```

Lokale Batch-Dateien:

- `update_local.bat`: fuehrt `node .\update.mjs` aus, gleicht danach Spektrogramme ab und ruft anschliessend
  `update_github_only.bat --no-pause` auf
- `update_github_only.bat`: pusht aktuelle Projektdateien ins Repo, ohne Token in der Remote-URL

Beim manuellen Start per Doppelklick starten beide Batch-Dateien zuerst ein dauerhaftes Konsolenfenster und fuehren
sich darin mit `--run` erneut aus. Die komplette Ausgabe bleibt dadurch sichtbar. Zum Schliessen das Fenster
schliessen oder `exit` eingeben. Der Parameter `--no-pause` ist nur fuer interne Aufrufe gedacht, damit
`update_local.bat` beim Aufruf von `update_github_only.bat` kein zweites Fenster oeffnet.
Die JSON-Ausgabe des Spektrogramm-Generators wird im normalen Erfolgslauf unterdrueckt; bei Fehlern wird die
Detailausgabe aus `Testlauf/spectrogram-update.log` angezeigt.
Aufrufe von `npm.cmd` innerhalb einer Batch-Datei muessen mit `call npm.cmd ...` erfolgen. Ohne `call` kehrt Windows
nach dem npm-Skript nicht zur aufrufenden Batch-Datei zurueck.

Die Batch-Dateien sind lokal ignoriert und nicht Teil des GitHub-Pages-Deployments.

Monatsaudit:

```bash
npm.cmd run --silent audit:site
```

Nur lokaler Repo-/Assetcheck ohne Netzwerk:

```bash
npm.cmd run --silent audit:site -- --skip-live --skip-pages
```

Das Audit-Skript `scripts/monthly-site-audit.mjs` schreibt keine Datei, sondern gibt JSON auf stdout aus. Temporare
Zwischenergebnisse gehoeren nach `Testlauf/` und werden nach Abschluss geloescht oder als zusammengefasster Bericht
unter `docs/audits/` dokumentiert.

Spektrogramm-Generator:

```bash
npm.cmd run --silent generate:spectrograms -- --dry-run
```

Echte Ausgabe braucht `ffmpeg` im PATH, `FFMPEG_PATH` oder `--ffmpeg=<Pfad>`. Erst mit Testausgabe nach
`Testlauf/spectrograms` pruefen, bevor produktive `species-assets/<SafeName>/spectrogram.webp`-Dateien erzeugt werden.

Temporare Tests gehoeren in `Testlauf/`. Dieser Ordner ist ignoriert; produktive Artefakte gehoeren dort nicht hinein.
Nach Abschluss eines Themas wird `Testlauf/` wieder geleert.

## Bekannte Stolperstellen

- Keine Tokens oder privaten Schluessel hardcoden.
- `graphics/catagory/Alternativ/` nicht vorschnell umbenennen. Die Schreibweise ist in Live-Pfaden relevant.
- `species-assets/` ist die einzige produktive Asset-Struktur fuer Karten, Sounds, Credits und Spektrogramme.
- `speciesData.json` muss ein Array bleiben.
- Detailseiten-Slugs entsprechen dem wissenschaftlichen Namen ohne Leerzeichen, z. B. `cyanistescaeruleus`.
- Squarespace Preview kann andere Pfade liefern als die Live-Seite.
- Nach jeder eingebundenen JS-Aenderung muss die jeweilige Squarespace-`?v=`-Version erhoeht werden.
- Asset-Pfadmigrationen duerfen nicht nebenbei passieren, weil sie Loader, GitHub-Pages-Pfade und bestehende Assets betreffen.

## Testplan

Nach Datenpipeline-Aenderungen:

- `node --check update.mjs`
- `node update.mjs`
- `fehlende_elemente_report.json` pruefen
- Anzahl Arten, Art-Assetordner, Karten, MP3s, Credits und Spektrogramme pruefen
- Credits der ersetzten Sounds auf Quelle, Lizenz und URL pruefen

Nach Frontend-Aenderungen:

- Detailseite, z. B. `/wildlife/heimische-tierwelt/acanthisflammea`
- Uebersichtssuche:
  - `/wildlife/heimische-tierwelt`
  - `/wildlife/costarica`
  - `/wildlife/island`
- Mobile Layout pruefen
- Tierstimmen-Player pruefen: Spektrogramm, Play/Pause, Scrubbing, Lautstaerke 0-200 Prozent, Mute-Toggle und
  Tempo-Auswahl
- Lightbox-Zoom auf Desktop und Android Chrome pruefen
- GitHub Pages Deploy abwarten
- Danach erst Squarespace-`?v=` erhoehen

## Aktuelle Roadmap

Details stehen in `docs/roadmap.md`.

Phase 5 ist abgeschlossen. Erledigt wurden unter anderem:

- Repo- und Dateiaudit: `docs/repo-file-audit.md`
- Dokumentationsregel und Uebergabe: `AGENTS.md`, `README.md`, `docs/roadmap.md`
- Lokaler Workflow und Repo-Struktur: `docs/repo-structure.md`
- Soundbar: `species-sound.js`, `docs/soundbar.md`
- Manuelle Zusatzdaten: `species_list.json`, `update.mjs`, `species-info.js`, `docs/manual-species-fields.md`
- Weitere-Arten-Workflow: `docs/add-species-workflow.md`
- SEO/KI-Findbarkeit und Bild-Alt-Texte: `docs/seo-worklist.md`, `docs/image-alt-audit.md`
- Mobile Reisegalerien: `docs/squarespace-custom.css`, `docs/css-layout-audit.md`
- Asset-Strukturentscheidung: `docs/asset-structure-plan.md`

Aktuelle Planung:

- Phase 6 - Funktionsueberarbeitung: abgeschlossen am 2026-06-17.
  Erledigt und dokumentiert sind monatliches Gesamtaudit, Audit-Automatisierung, manuell gepflegte Karten,
  Spektrogramm-Konzept, Spektrogramm-Generator, produktive Spektrogramm-Integration, Soundbar-Regler und
  artweise Asset-Buendelung. `species-assets/<SafeName>/` ist die alleinige produktive Struktur; `sounds/` und
  `Verbreitungskarten/` wurden am 2026-06-17 entfernt.
  Wichtige Detaildokumente:
  - Audit-Grundlage: `docs/monthly-site-audit.md`
  - erster echter Monatsaudit: `docs/audits/2026-06-site-audit.md`
  - manuell gepflegte Karten: `docs/manual-map-overrides.md`
  - Spektrogramme: `docs/spectrogram-plan.md`
  - Soundbar: `docs/soundbar.md`
  - Asset-Struktur: `docs/asset-structure-plan.md`
  Relevante Footer-Versionen nach erfolgreichem GitHub-Pages-Deploy und Live-Test: `species-core.js?v=1.0.4`,
  `map-loader.js?v=1.0.7` und `species-sound.js?v=1.0.22`.
- Phase 7 - Desktop-App / Arten-Explorer:
  in Arbeit seit 2026-06-17. Die technische Basis steht in `docs/desktop-app-plan.md`.
  Entscheidung fuer den Start: lokale Node-Web-App mit Browseroberflaeche, erster Prototyp read-only.
  Naechster Schritt ist 7.2: Read-only Prototyp mit Artenliste, Suche, Detaildaten und Assetstatus.
  In diese Phase gehoeren spaeter auch Projektmigration oder Spiegelung auf ein persoenliches Synology NAS und ein
  automatisiertes Backup mit dokumentiertem Restore-Test.
- Phase 8 - Ausbau:
  Affiliate-Links, Shop/Kalender und rechtliche Folgepruefung.
