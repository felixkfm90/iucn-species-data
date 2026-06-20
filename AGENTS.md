# AGENTS.md - Projektuebergabe Wildlife/IUCN Squarespace

Stand: 2026-06-19

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
- `species-assets-overrides.json`: maschinenlesbarer Schutzstatus fuer manuell gepflegte Karten und Sounds
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

Lokale Arbeitsoberflaeche:

- `species-explorer/server.mjs`: lokaler Server auf `127.0.0.1:4177` mit begrenzter `species_list.json`-Bearbeitung
- `species-explorer/public/`: Artenliste, Suche, Filter und Detailansicht
- `species-explorer/server.test.mjs`: Modell-, API-, Schreibschutz-, Backup-, Such- und Filtertests
- `scripts/pipeline-selection.mjs`: Zielartenauswahl fuer vollstaendige und gezielte Pipeline-Laeufe
- `scripts/species-cleanup.mjs`: Vorschau und dauerhafte Bereinigung verwaister Daten und Assetordner

## Aktueller Projektstand

- 46 Eintraege in `species_list.json`
- 45 aktive Arten
- 45 Arten in `speciesData.json`
- `Haubentaucher` ist neu angelegt und wartet auf den ersten Pipeline-Lauf
- 45 Karten
- 45 Art-Assetordner
- 45 MP3-Dateien
- 45 Credits-Dateien
- 45 Spektrogramm-Dateien
- 45 `species-assets/<SafeName>/`-Ordner mit `map.jpg`, `sound.mp3`, `credits.json` und `spectrogram.webp`
- 0 fehlende Kernassets im letzten Report fuer die 45 verarbeiteten Arten
- Haubentaucher hat bis zum Pipeline-Lauf erwartungsgemaess noch kein Assetpaket; der Report ist fuer diesen neuen
  Eintrag noch nicht aktualisiert
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

Weitere Pipeline-Modi:

```bash
node update.mjs --mode=missing --dry-run
node update.mjs --mode=missing
node update.mjs --mode=all
node update.mjs --report-only
npm.cmd run --silent cleanup:species -- --dry-run
```

Lokale Batch-Dateien:

- `update_local.bat`: fuehrt `node .\update.mjs` aus, gleicht danach Spektrogramme ab, baut den Report mit
  `node .\update.mjs --report-only` neu auf und ruft anschliessend `update_github_only.bat --no-pause` auf
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
  Relevante Footer-Versionen: `species-core.js?v=1.0.4`, `map-loader.js?v=1.0.7` und
  `species-sound.js?v=1.0.24`. Version `1.0.24` reduziert nur die sichtbare Spektrogrammhoehe; die vorhandenen
  WebP-Assets bleiben unveraendert. Der Footer wurde von Felix am 2026-06-19 angepasst und live erfolgreich getestet.
- Phase 7 - Desktop-App / Arten-Explorer:
  in Arbeit seit 2026-06-17. Die technische Basis steht in `docs/desktop-app-plan.md`.
  Entscheidung fuer den Start: lokale Node-Web-App mit Browseroberflaeche.
  Phase 7.2 ist seit 2026-06-18 erledigt: read-only Prototyp mit 45 Arten, Suche, Filtern, Detaildaten, Karte, Sound,
  Credits, Spektrogramm und Assetstatus. Karten werden vollstaendig im Originalseitenverhaeltnis angezeigt.
  Spektrogramm und Audio sind in einem Player mit Play/Pause, Zeit, Lautstaerke, Scrubbing und Positionsmarker
  gekoppelt. Ein Klick ins Spektrogramm setzt die Position und startet die Wiedergabe dort sofort. Der
  Tierstimmen-Bereich ist zugunsten des spaeteren Artportraets kompakt; Credits sind einklappbar.
  Der lokale Server liefert Assets mit HTTP-Byte-Range-Unterstuetzung aus, damit MP3-Spruenge nicht auf Position 0
  zurueckfallen.
  Medien- und Datenkarten verwenden identische 50/50-Spalten. Das Explorer-Spektrogramm ist auf 64 bis 84 Pixel
  Anzeigehoehe begrenzt, damit das Artportraet mehr Platz erhaelt.
  Das IUCN-Abrufdatum steht im Detailkopf, Statusfilter verwenden deutsche Bezeichnungen mit IUCN-Kuerzel und
  manuell hinzugefuegte Assets werden direkt in ihrer Assetzeile markiert. Artwechsel erhalten Fenster- und
  Listenposition. Start: `npm.cmd run species:explorer`; Tests: `npm.cmd run --silent test:explorer`.
  Phase 7.3 ist seit 2026-06-19 erledigt: Das read-only Statusdashboard vergleicht `species_list.json`,
  `speciesData.json`, `fehlende_elemente_report.json` und die tatsaechlichen Assetdateien. Beim Abschluss stimmten
  45 von 45 Datenpaare ueberein, 45 Assetpakete waren vollstaendig und neun Reportpruefungen konsistent. Nach dem
  Anlegen des Haubentauchers zeigt der Explorer erwartungsgemaess eine input-only Art, ein fehlendes Assetpaket und
  einen bis zum Pipeline-Lauf noch nicht aktualisierten Report. Daten- und Assetprobleme sind getrennt filterbar und
  werden artweise erklaert.
  Status- und Hinweis-Dropdowns sind alphabetisch nach ihren sichtbaren deutschen Bezeichnungen sortiert.
  Phase 7.3 wurde von Felix am 2026-06-19 visuell geprueft.
  Die interne Phasenbezeichnung ist in der App ausgeblendet. Die linke Artenliste zeigt maximal 15 Eintraege
  gleichzeitig und scrollt weitere Treffer innerhalb der Liste.
  Phase 7.4 ist seit 2026-06-19 abgeschlossen und von Felix visuell geprueft: Bestehende Arten erlauben nur die
  Bearbeitung von Groesse, Gewicht und
  Lebenserwartung. Vor dem Speichern sind Validierung und Diff-Vorschau Pflicht; Vorschau-Token laufen nach zehn
  Minuten ab und werden bei parallelen Dateiaenderungen ungueltig. Vor jedem Schreiben entsteht eine ignorierte
  Sicherung unter `species-explorer/backups/`. Automatisch bleiben nur die neuesten 20 verwalteten Backups erhalten;
  fremde Dateien im Ordner werden nicht geloescht. Name, Taxonomie, neue Arten, Pipeline und Git bleiben gesperrt
  bzw. separat. Die Phase-7.4-Pruefungen sind Teil der inzwischen sechs erfolgreichen Explorer-Tests.
  Der Speichertest, die Korrektur des Testwerts und die robuste Erfolgsmeldung wurden geprueft.
  Phase 7.5 ist seit 2026-06-19 technisch lokal umgesetzt; die visuelle Bedienpruefung durch Felix ist noch offen.
  Neue Arten werden kontrolliert nach `docs/add-species-workflow.md` angelegt. Erfasst werden
  deutscher Name, wissenschaftlicher Name, Groesse, Gewicht und Lebenserwartung. Der wissenschaftliche Name wird
  im Hintergrund in Gattung und Artepitheton getrennt und normalisiert. Duplikate, Slug-/SafeName-Kollisionen
  sowie vorhandene Assetordner werden vor einer vollstaendigen JSON-Vorschau geprueft.
  Speicherung nutzt den Backup-/Token-/Hashschutz aus 7.4. Die neue Art bleibt bis zum separaten Pipeline-Lauf
  erwartungsgemaess nur in `species_list.json`. API: `POST /api/species/new/preview` und
  `POST /api/species/new/save`. Der lokale Server wurde mit dem neuen Stand neu gestartet; die ausgelieferte
  Oberflaeche enthaelt Aktion, Dialog und alle fuenf Pflichtfelder mit Beispieltexten. Weitere Arten koennen nach
  erfolgreichem Speichern ohne Seitenneuladen angelegt werden. Der Haubentaucher ist der erste echte neue Eintrag.
  Phase 7.6 Pipeline-Steuerung nach `docs/pipeline-control-plan.md` ist technisch lokal umgesetzt. Die App
  unterscheidet `Neue/Unvollstaendige Arten aktualisieren` und `Alle Arten vollstaendig aktualisieren`. `update.mjs`
  unterstuetzt
  `--mode=missing`, `--mode=all` und `--dry-run`; die App zeigt Vorschau, Prozessstatus und lokale Logs. Nur ein
  Lauf kann gleichzeitig aktiv sein. Nach erfolgreicher Pipeline folgt der passende Spektrogramm-Abgleich.
  Neu hinzugefuegte Karten und Sounds werden danach angezeigt und je Asset als automatisch oder manuell geschuetzt
  bestaetigt. Kartenvorschauen sind dabei anklickbar und werden fuer die Qualitaetspruefung in einer grossen
  Lightbox angezeigt. Die Entscheidung steht in `species-assets-overrides.json`; Details:
  `docs/asset-review-workflow.md`. Danach werden die Pipeline-Dateien automatisch committed und gepusht.
  Arten koennen nach Vorschau und `species_list.json`-Backup aus der Eingabeliste entfernt werden. Die getrennte
  Aktion `Bereinigen` listet verwaiste Datensaetze, Assessment-Zuordnungen und Assetordner auf und loescht sie nach
  genau einer Bestaetigung dauerhaft ohne Wiederherstellungsablage. Details:
  `docs/delete-species-workflow.md`. Der separate Phase-7.6-Seitenbereich wurde entfernt. In der Kopfzeile schaltet
  `Lesemodus` den Bearbeitungsmodus; Neue Art, Datenbankaktualisierung, Bearbeiten und Loeschen sind nur dort
  sichtbar. Der Modusschalter hat in beiden Zuständen dieselbe feste Breite und Position. Das klickbare Datenbankfeld
  ist bei offenen Problemen rot mit `Datenbank aktualisieren` und bei konsistentem Stand gruen mit
  `Datenbank aktuell`. Nach dem Speichern einer neuen Art wird der selektive Lauf
  direkt angeboten und kann gestartet oder abgebrochen werden. Externe Änderungen durch `update_local.bat`,
  CLI-Aufrufe oder andere Prozesse werden über eine Dateirevision erkannt. Der Server baut sein Modell automatisch
  neu auf; die Browseroberfläche prüft alle fünf Sekunden `GET /api/revision` und lädt bei Änderungen selbstständig
  neu. Neun Explorer-Tests sind erfolgreich. Ein vollständiger externer Pipeline-Lauf und ein produktiver
  selektiver App-Lauf fuer den Hoeckerschwan wurden am 2026-06-20 erfolgreich abgeschlossen. Start,
  Prozessanzeige, Assetentscheidung sowie automatischer Commit `55fda06` und Push funktionierten. Die danach
  ergaenzte Karten-Grossansicht benoetigt noch einen kurzen visuellen Bestaetigungstest. Danach folgt 7.7
  Asset-Verwaltung nach
  `docs/asset-management-plan.md` und 7.8 NAS/Backup.
  In diese Phase gehoeren spaeter auch Projektmigration oder Spiegelung auf ein persoenliches Synology NAS und ein
  automatisiertes Backup mit dokumentiertem Restore-Test.
- Phase 8 - Ausbau:
  Affiliate-Links, Shop/Kalender und rechtliche Folgepruefung.
