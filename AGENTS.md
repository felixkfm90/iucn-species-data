# AGENTS.md - Projektuebergabe Wildlife/IUCN Squarespace

Stand: 2026-06-15

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
- passende Detaildokumente unter `docs/`, z. B. CSS-, Sound-, Repo- oder Squarespace-Doku

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
- `Verbreitungskarten/*.jpg`: Verbreitungskarten
- `sounds/<Artname>/<Artname>.mp3` und `sounds/<Artname>/credits.json`: Tierstimmen und Quellen
- `sounds/<Artname>/spectrogram.webp`: vorberechnete Spektrogramme fuer die Tierstimmen-Soundbar
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
- 45 Soundordner
- 45 MP3-Dateien
- 45 Credits-Dateien
- 45 Spektrogramm-Dateien
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

Letzter vollstaendiger Pipeline-/Report-Check: 2026-05-28.

## Datenfluss

```text
species_list.json
  -> update.mjs
     -> IUCN API v4
     -> Xeno-Canto API
     -> Wikimedia Commons API
     -> iNaturalist API
     -> speciesData.json
     -> Verbreitungskarten/*.jpg
     -> sounds/<SafeName>/<SafeName>.mp3
     -> sounds/<SafeName>/credits.json
     -> sounds/<SafeName>/spectrogram.webp
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

- `update_local.bat`: fuehrt `node .\update.mjs` aus und ruft danach `update_github_only.bat` auf
- `update_github_only.bat`: pusht aktuelle Projektdateien ins Repo, ohne Token in der Remote-URL

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
`Testlauf/spectrograms` pruefen, bevor produktive `sounds/<SafeName>/spectrogram.webp`-Dateien erzeugt werden.

Temporare Tests gehoeren in `Testlauf/`. Dieser Ordner ist ignoriert; produktive Artefakte gehoeren dort nicht hinein.
Nach Abschluss eines Themas wird `Testlauf/` wieder geleert.

## Bekannte Stolperstellen

- Keine Tokens oder privaten Schluessel hardcoden.
- `graphics/catagory/Alternativ/` nicht vorschnell umbenennen. Die Schreibweise ist in Live-Pfaden relevant.
- `Verbreitungskarten/` ist case-sensitive fuer GitHub Pages.
- `speciesData.json` muss ein Array bleiben.
- Detailseiten-Slugs entsprechen dem wissenschaftlichen Namen ohne Leerzeichen, z. B. `cyanistescaeruleus`.
- Squarespace Preview kann andere Pfade liefern als die Live-Seite.
- Nach jeder eingebundenen JS-Aenderung muss die jeweilige Squarespace-`?v=`-Version erhoeht werden.
- Asset-Migrationen pro Art duerfen nicht nebenbei passieren, weil sie Loader, GitHub-Pages-Pfade und bestehende Assets betreffen.

## Testplan

Nach Datenpipeline-Aenderungen:

- `node --check update.mjs`
- `node update.mjs`
- `fehlende_elemente_report.json` pruefen
- Anzahl Arten, Karten, Soundordner, MP3s und Credits pruefen
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

- Phase 6 - Funktionsueberarbeitung: in Arbeit.
  Dokumentation pruefen, monatliches Gesamtaudit definieren, Spektrogramm-Assets konzipieren, artweise
  Asset-Buendelung nur als geplante Migration vorbereiten und manuell gepflegte Karten dokumentieren.
  Audit-Grundlage: `docs/monthly-site-audit.md`.
  Erster echter Monatsaudit: `docs/audits/2026-06-site-audit.md`.
  Audit-Automatisierung: `scripts/monthly-site-audit.mjs`, getestet am 2026-06-15.
  Spektrogramm-Konzept und Integration: `docs/spectrogram-plan.md`; Zielpfad
  `sounds/<SafeName>/spectrogram.webp`; `species-sound.js` nutzt Spektrogramme mit Canvas-Fallback.
  Spektrogramm-Generator: `scripts/generate-spectrograms.mjs`; Dry-Run und echte Testausgabe fuer `Amsel`,
  `Graugans` und `Bisamratte` erfolgreich getestet am 2026-06-15. Zielstil im Generator-Default:
  heller Hintergrund, dunkle Graustufen-Frequenzspuren, Rand oben und unten, Frequenzbereich bis 18 kHz.
  45 produktive Spektrogramme erzeugt. `local-tools/` ist fuer projektlokales ffmpeg
  ignoriert.
  Soundbar-Regler: `species-sound.js` bietet seit 2026-06-15 Lautstaerke 0-200 Prozent per Web-Audio-Gain und
  Tempo-Auswahl `0,25x`, `0,5x`, `1x`, `1,5x`, `2x`, `4x`.
  Tonfix: Seit `species-sound.js?v=1.0.15` wird Web Audio nur noch fuer Lautstaerke ueber 100 Prozent aktiviert; der
  Positionsmarker wird waehrend der Wiedergabe per `requestAnimationFrame` geglaettet.
  Mute-Toggle: Seit `species-sound.js?v=1.0.16` setzt ein Klick auf das Lautsprechersymbol temporaer auf `0%`, zeigt
  das Symbol rot durchgestrichen und stellt beim zweiten Klick den vorherigen Wert wieder her.
  Playbutton: Seit `species-sound.js?v=1.0.17` ist das Play-/Pause-Symbol im runden Button ohne
  Browser-Default-Padding vertikal zentriert; der ganze Button ist optisch leicht nach unten versetzt.
  Seit `species-sound.js?v=1.0.18` sitzt der Playbutton deutlicher in der Mitte der unteren Bedienflaeche und die
  zusaetzliche Quellenzeile unter `Tierstimme` ist entfernt.
  Liste fuer manuell gepflegte Karten: `docs/manual-map-overrides.md` mit aktuell 7 Karten.
- Phase 7 - Desktop-App / Arten-Explorer:
  lokale Anwendung fuer manuelle Artenpflege, Datenbearbeitung, Sound-/Karten-/Assetverwaltung und Validierung.
  In diese Phase gehoeren auch Projektmigration oder Spiegelung auf ein persoenliches Synology NAS und ein
  automatisiertes Backup mit dokumentiertem Restore-Test.
- Phase 8 - Ausbau:
  Affiliate-Links, Shop/Kalender und rechtliche Folgepruefung.
