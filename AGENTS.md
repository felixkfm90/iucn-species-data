# AGENTS.md - Projektuebergabe Wildlife/IUCN Squarespace

Stand: 2026-07-23

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

Die Zuständigkeiten, historischen Kennzeichnungen und die einzige Quelle für aktuelle Zähler sind verbindlich in
`docs/documentation-lifecycle.md` festgelegt.

Wenn eine JS-Datei geaendert wird, muss auch `docs/squarespace-footer.html` bzw. die Squarespace-`?v=`-Version
geprueft werden. Wenn CSS geaendert wird, muss `docs/squarespace-custom.css` mit dem echten Squarespace-Stand
abgeglichen werden.

## Kurzueberblick

Squarespace ist das sichtbare Frontend/CMS. Die Artseiten enthalten nur Container-IDs. Die dynamischen Inhalte werden
ueber JavaScript-Module von GitHub Pages geladen.

Zentrale Dateien:

- `species_list.json`: manuelle Artenliste und Input fuer die Pipeline, inklusive Groesse, Gewicht und
  Lebenserwartung
- `update.mjs`: Orchestrierung der Datenpipeline; externe Anbieter liegen in direkt getesteten Adaptern unter
  `scripts/*-adapter.mjs`
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
- `species-portrait.js`: optionales Artportraet und responsiver Layout-Fallback
- `species-sound.js`: native Soundbar mit vorbereitetem Spektrogramm, Canvas-Fallback, Lautstaerke,
  Abspielgeschwindigkeit, Credits und Lizenzhinweisen
- `map-loader.js`: Verbreitungskarte
- `search.js`: Suche auf Uebersichtsseiten
- `sort.js`: Sortierung sichtbarer Listen
- `lightbox-zoom.js`: Galerie-/Lightbox-Zoom

Lokale Arbeitsoberflaeche:

- `species-explorer/server.mjs`: schlanke Kompositionswurzel des lokalen Servers auf `127.0.0.1:4177`
- `species-explorer/public/`: Artenliste, Suche, Filter und Detailansicht
- `species-explorer/request-security.mjs`: zentrale Sitzungs-, Browser-, URL-Ziel- und Pfadgrenze der lokalen API
- `species-explorer/http-routing.mjs`: JSON-/HTTP-Antworten, sichere Auslieferung lokaler Dateien und Byte-Ranges
- `species-explorer/request-router.mjs`: zentrale Methoden-/Pfadzuordnung, Body-Limits und Antwortdelegation
- `species-explorer/species-model.mjs`: Artenvalidierung, Normalisierung, Kollisionen, Diffs und öffentliche Projektionen
- `species-explorer/species-create.mjs`, `species-delete.mjs`, `species-edit.mjs`: Anlegen, Löschen und Bearbeiten
  von Arten als getrennte Fachoperationen
- `species-explorer/map-asset-workflow.mjs`, `sound-asset-workflow.mjs`, `portrait-asset-workflow.mjs` und
  `asset-maintenance.mjs`: Vorschau, Übernahme, Ablehnung, Löschung und Wiederherstellung einzelner Assets
- `species-explorer/pipeline-controller.mjs`: Pipeline-Planung, Prozesszustand, Assetprüfung und Veröffentlichung
- `species-explorer/project-publication.mjs` und `backup-service.mjs`: Git-Übertragung, offene Änderungen,
  Backup-Einstellungen und NAS-Sicherung
- `species-explorer/asset-backups.mjs`: wiederherstellbare Asset-Sicherungen und begrenzte Backup-/Log-Aufbewahrung
- `species-explorer/server.test.mjs`, `server-species-workflows.test.mjs`, `server-assets.test.mjs` und
  `server-cleanup-search.test.mjs`: fachlich getrennte API-Integrationstests
- `species-explorer/explorer-ui-contract.test.mjs`: Oberflächen-, Modulbesitz- und Auslieferungsverträge
- `scripts/pipeline-selection.mjs`: Zielartenauswahl fuer vollstaendige und gezielte Pipeline-Laeufe
- `scripts/species-cleanup.mjs`: Vorschau und dauerhafte Bereinigung verwaister Daten und Assetordner
- `scripts/pipeline-error-log.mjs`: fehlertoleranter, auf 256 KiB begrenzter Pipeline-Fehlerlog im lokalen
  Explorer-Logordner

## Aktueller Projektstand

Aktuelle Zähler sowie die aktiven Listen für manuelle Karten, NC-Sounds und bewusst fehlende Tierstimmen stehen
ausschließlich in der automatisch erzeugten Datei `docs/project-status.md`. Sie wird mit `npm run status:sync`
aktualisiert; `npm run status:check` und der CI-Quality-Job verhindern eine Veröffentlichung mit veraltetem Status.
Zahlen in datierten Audit- oder Verlaufsabschnitten sind historische Zeitaufnahmen.
Vor automatischen Pipeline-, Karten-, Sound- und Portrait-Veröffentlichungen synchronisiert der Explorer diese
Datei selbst und nimmt sie in denselben Commit auf. Bei manuellen Repo-Änderungen bleibt `status:sync` Pflicht.

Der Sound-Suchlauf prueft vorhandene NC-Sounds bei jedem Update erneut auf freie Alternativen:

1. freie Xeno-Canto-Aufnahmen
2. freie Wikimedia-Commons-Audiodateien mit erreichbarem MP3-Transcode
3. freie iNaturalist-MP3-Aufnahmen mit exaktem Taxon, freier Lizenz und gueltiger MP3-Datei

Im Asset-Pruefdialog abgelehnte Soundquellen werden in `species-assets-overrides.json` unter
`sound.rejectedSources` gespeichert. `update.mjs` ueberspringt diese Xeno-Canto-, Wikimedia-Commons- oder
iNaturalist-Quelle bei spaeteren Suchlaeufen, damit ein ausdruecklich abgelehnter Sound nicht erneut vorgeschlagen
wird.
Sind alle unterstützten und lizenzgeprüften Kandidaten ausgeschöpft, bleibt der jeweilige Assistent beziehungsweise
Bearbeitungsdialog geöffnet und meldet den Zustand ausdrücklich. Die Meldung behauptet nicht, dass außerhalb der
angebundenen Quellen keine Aufnahme existiert.

Wikimedia-Commons-Ablehnungen werden kanonisch auf die jeweilige `File:`-Identitaet normalisiert. Prozentkodierte
URLs, Beschreibungspfade und Titelvarianten derselben Datei duerfen deshalb nicht als neue Quelle erscheinen.

Interne JavaScript-Hilfsprozesse des Electron-Wrappers muessen ueber
`species-explorer/child-process-environment.mjs` gestartet werden. Wenn `process.execPath` auf Electron zeigt, setzt
der Helper `ELECTRON_RUN_AS_NODE=1`; andernfalls kann ein erfolgreich ausgegebener Statusabgleich den Prozess offen
halten und Commit/Push blockieren.

Aktuell ersetzte freie Quellen:

- `Eurasisches Eichhoernchen`: freie Xeno-Canto-Alternative
- `Fischertukan`: freie Wikimedia-Commons-/iNaturalist-Aufnahme
- `Grosstrappe`: freie Wikimedia-Commons-Aufnahme
- `Mittelamerikanischer Totenkopfaffe`: freie iNaturalist-Aufnahme, CC BY 4.0
- `Panama-Kapuzineraffe`: freie iNaturalist-Aufnahme, CC BY 4.0
- `Quetzal`: freie Quelle, nicht mehr im NC-Report

Letzter vollstaendiger Pipeline-Check: 2026-06-20.
Letzter lokaler Bereinigungs-/Report-Check: 2026-06-29.

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

- Node.js 18 oder neuer
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

Vollständiges lokales CI-Qualitätsgate:

```bash
npm.cmd run --silent quality:ci
```

Das Qualitätsgate umfasst zusätzlich `check:style`, `check:schema` und `size:check`. Das flexible
Repository-Budget wächst mit der Artenzahl; die Git-Historie wird getrennt und ohne automatischen Rewrite
beobachtet. Details: `docs/repository-quality-gates.md`.

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
- GitHub Pages muss auf `Source: GitHub Actions` stehen. Das Deployment laeuft ueber
  `.github/workflows/pages.yml` und das kontrollierte `_site/`-Artefakt aus `scripts/prepare-pages-artifact.mjs`.
  Branch-Deployment aus `main:/` ist nicht mehr der Sollzustand, weil dabei der komplette Repo-Root ueber den
  GitHub-Standardlauf deployed wird und der Deploy-Schritt wiederholt erst nach einem Rerun erfolgreich war.
  Pages-Laeufe verwenden die gemeinsame Concurrency-Gruppe `pages` mit `cancel-in-progress: false`, damit mehrere
  kurz nacheinander ausgelöste Veröffentlichungen serialisiert werden und ein noch synchronisierender Deploy nicht
  durch einen neuen Lauf ueberholt wird.
  Fuer Diagnose ist lokal `gh` nutzbar. Falls `gh` in Codex ueber `127.0.0.1:9` scheitert,
  Proxy-Umgebungsvariablen fuer den Befehl leeren:
  `$env:HTTP_PROXY=''; $env:HTTPS_PROXY=''; $env:ALL_PROXY=''; $env:NO_PROXY='github.com,api.github.com'`.

## Testplan

Nach Datenpipeline-Aenderungen:

- `node --check update.mjs`
- `node update.mjs`
- `fehlende_elemente_report.json` pruefen
- Anzahl Arten, Art-Assetordner, Karten, MP3s, Credits und Spektrogramme pruefen
- Anzahl Artportraets und fehlende Portrait-Assetprobleme pruefen
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
  `species-sound.js?v=1.0.25`. Version `1.0.24` reduziert nur die sichtbare Spektrogrammhoehe; die vorhandenen
  WebP-Assets bleiben unveraendert. Version `1.0.25` korrigiert die Meldung fuer fehlende Tierstimmen auf
  `Keine Tierstimme verfügbar` ohne Schlusspunkt. Der Footer mit `1.0.24` wurde von Felix am 2026-06-19 angepasst
  und live erfolgreich getestet.
- Phase 7 - Desktop-App / Arten-Explorer:
  abgeschlossen am 2026-07-18. Die technische Basis steht in `docs/desktop-app-plan.md`.
  Entscheidung fuer den Start: lokale Node-Web-App mit Browseroberflaeche.
  Phase 7.2 ist seit 2026-06-18 erledigt: read-only Prototyp mit 45 Arten, Suche, Filtern, Detaildaten, Karte, Sound,
  Credits, Spektrogramm und Assetstatus. Karten werden vollstaendig im Originalseitenverhaeltnis angezeigt.
  Spektrogramm und Audio sind in einem Player mit Play/Pause, Zeit, Lautstaerke, Scrubbing und Positionsmarker
  gekoppelt. Ein Klick ins Spektrogramm setzt die Position und startet die Wiedergabe dort sofort. Der
  Tierstimmen-Bereich ist zugunsten des spaeteren Artportraets kompakt; seit 2026-07-10 stehen
  Verbreitungskarte, Tierstimme und Artportraet als drei gleich grosse Medienbereiche nebeneinander. Die
  Quellen-/Lizenzdaten der Tierstimme sind im Explorer direkt sichtbar.
  Seit 2026-07-11 werden diese Medienbereiche bei weniger als 1320 Pixel nutzbarer Breite im rechten Detailbereich
  untereinander dargestellt. In der dreispaltigen Ansicht wechseln schmale Einzelkarten auf einen zweizeiligen
  Kartenkopf: Titel oben, alle drei Assetaktionen gemeinsam in einer gleichmaessigen Zeile darunter. Bei geringer
  Fensterhoehe werden die festen Kopf-, Zusammenfassungs- und
  Validierungsbereiche verdichtet, damit die
  getrennten Scrollflaechen fuer Artenliste und Details nutzbar bleiben. Geschlechtsspezifische Groessen- und
  Gewichtswerte stehen in getrennten Zeilen. Lokale IUCN-Status- und Trendsymbole werden im Artkopf sowie neben
  Kategorie und Trend sowie in der linken Artenliste angezeigt; der lokale Server liefert dafuer ausschliesslich
  die freigegebenen PNG-Dateien
  unter `graphics/catagory/` und `graphics/trend/` aus.
  Der lokale Server liefert Assets mit HTTP-Byte-Range-Unterstuetzung aus, damit MP3-Spruenge nicht auf Position 0
  zurueckfallen.
  Das Explorer-Spektrogramm ist auf 64 bis 84 Pixel
  Anzeigehoehe begrenzt, damit das Artportraet mehr Platz erhaelt.
  Das IUCN-Abrufdatum steht im Detailkopf, Statusfilter verwenden deutsche Bezeichnungen mit IUCN-Kuerzel und
  manuell hinzugefuegte Assets werden direkt in ihrer Assetzeile markiert. Artwechsel erhalten Fenster- und
  Listenposition. Start: `npm.cmd run species:explorer`; Tests: `npm.cmd run --silent test:explorer`.
  Wenn der direkte Browser-/Servermodus erneut gestartet wird, waehrend bereits ein Explorer auf Port 4177 laeuft,
  meldet der Server seit 2026-06-27 verstaendlich die bestehende URL statt mit einem rohen `EADDRINUSE`-Stacktrace
  abzubrechen.
  Phase 7.3 ist seit 2026-06-19 erledigt: Das read-only Statusdashboard vergleicht `species_list.json`,
  `speciesData.json`, `fehlende_elemente_report.json` und die tatsaechlichen Assetdateien. Beim Abschluss stimmten
  45 von 45 Datenpaare ueberein, 45 Assetpakete waren vollstaendig und neun Reportpruefungen konsistent. Nach dem
  Anlegen des Haubentauchers zeigt der Explorer erwartungsgemaess eine input-only Art, ein fehlendes Assetpaket und
  einen bis zum Pipeline-Lauf noch nicht aktualisierten Report. Daten- und Assetprobleme sind getrennt filterbar und
  werden artweise erklaert.
  Status- und Hinweis-Dropdowns sind alphabetisch nach ihren sichtbaren deutschen Bezeichnungen sortiert.
  Phase 7.3 wurde von Felix am 2026-06-19 visuell geprueft.
  Die interne Phasenbezeichnung ist in der App ausgeblendet. Kopfbereich, Zusammenfassung und Validierungsstatus
  bleiben im Desktopfenster sichtbar; darunter scrollen linke Artenliste und rechter Detailbereich getrennt. Beim
  Artwechsel springt nur der rechte Detailbereich wieder an den Anfang, waehrend die Scrollposition der linken
  Artenliste erhalten bleibt.
  Phase 7.4 ist seit 2026-06-19 abgeschlossen und von Felix visuell geprueft. Im Bereich `Allgemeine Daten` sind
  deutscher Name, der bewusst entsperrbare wissenschaftliche Name, Groesse, Gewicht und Lebenserwartung editierbar.
  Seit 2026-07-11 verwenden Groesse, Gewicht und Lebenserwartung dieselben strukturierten Wert-/Einheitenfelder wie
  der Neue-Art-Assistent; Groesse und Gewicht koennen unabhaengig nach Maennchen und Weibchen getrennt werden.
  Vor dem Speichern sind Validierung und Diff-Vorschau Pflicht; Vorschau-Token laufen nach zehn
  Minuten ab und werden bei parallelen Dateiaenderungen ungueltig. Vor jedem Schreiben entsteht eine ignorierte
  Sicherung unter `species-explorer/backups/`. Automatisch bleiben nur die neuesten 20 verwalteten Backups erhalten;
  fremde Dateien im Ordner werden nicht geloescht. Automatische IUCN-Felder, neue Arten, Pipeline und Git bleiben
  gesperrt bzw. separat. Die Phase-7.4-Pruefungen sind Teil der Explorer-Tests.
  Der Speichertest, die Korrektur des Testwerts und die robuste Erfolgsmeldung wurden geprueft.
  `Loeschen` steht als Artaktion oben rechts im Detailkopf. `Bearbeiten` steht seit 2026-06-30 direkt an den
  bearbeitbaren Bereichen `Manuelle Daten`, `Artportraet`, `Verbreitungskarte` und `Tierstimme`; der
  Bearbeitungsdialog oeffnet jeweils nur den gewaehlten Bereich. Der Dialog kennzeichnet Taxonomie als gesperrt und
  nennt keine interne Phasennummer.
  Seit 2026-07-05 koennen deutscher und wissenschaftlicher Artname im Bereich `Allgemeine Daten` umbenannt werden.
  Der wissenschaftliche Name ist per Schloss geschuetzt; nach Warnbestaetigung werden wissenschaftlicher Name,
  Genus/Species und URL-Slug konsistent angepasst. Die Umbenennung prueft Kollisionen und fuehrt
  `species_list.json`, `speciesData.json`, Assetname/SafeName, Assetordner, `species-assets-overrides.json`,
  `lastSavedAssessmentId.json`, `fehlende_elemente_report.json`, Kartendokumentation sowie lokale Credits- und
  Portrait-Metadaten mit. Die Aenderung bleibt lokal offen und wird ueber `Änderungen übertragen` veroeffentlicht.
  Details: `docs/rename-species-workflow.md`.
  Phase 7.5 ist seit 2026-06-20 abgeschlossen und durch das erneute Anlegen von Haubentaucher und Hoeckerschwan
  praktisch geprueft.
  Neue Arten werden kontrolliert nach `docs/add-species-workflow.md` angelegt. Erfasst werden
  deutscher Name, wissenschaftlicher Name, Groesse, Gewicht und Lebenserwartung. Der wissenschaftliche Name wird
  im Hintergrund in Gattung und Artepitheton getrennt und normalisiert. Duplikate, Slug-/SafeName-Kollisionen
  sowie vorhandene Assetordner werden vor einer vollstaendigen JSON-Vorschau geprueft.
  Speicherung nutzt den Backup-/Token-/Hashschutz aus 7.4. Nach dem Abschluss startet der Explorer automatisch den
  gezielten Pipeline-Lauf fuer genau diese neue Art; bis zum erfolgreichen Lauf bleibt sie erwartungsgemaess nur in
  `species_list.json`. API: `POST /api/species/new/preview` und `POST /api/species/new/save`. Fuer optionale
  Sofortportraits liefert `POST /api/species/new/portrait-prompt`
  einen Einzelprompt aus den eingegebenen neuen Artdaten. Seit 2026-06-29 ist `Neue Art` als vierstufiger
  Schrittassistent aufgebaut: allgemeine Daten pruefen, optionales Artportrait pruefen oder ueberspringen,
  Karte/Suchlauf und Sound/Abschluss. Klickbare, noch offene Schritte sind blau markiert, abgeschlossene Schritte
  gruen und gesperrte Schritte grau. Groesse, Gewicht und Lebenserwartung werden aus Wert plus Einheit
  zusammengesetzt; `ca.` wird automatisch gespeichert und Lebenserwartung wird bei `1` automatisch auf `Tag`,
  `Monat` oder `Jahr` gebeugt. Bereits erreichte Schritte koennen angeklickt werden. `Artportrait ueberspringen`
  startet keine Anlage mehr, sondern gibt erst `Naechster Schritt` frei. Nach Schritt 2 wird die Art angelegt und der
  gezielte Pipeline-Lauf fuer genau diese Art im selben Dialog gestartet; das Datenbank-Aktionen-Fenster wird dabei
  nicht geoeffnet. Gefundene Karten
  koennen uebernommen oder uebersprungen werden. Gefundene Sounds werden mit Spektrogramm angezeigt, koennen
  uebernommen, uebersprungen oder abgelehnt werden. Bei Ablehnung merkt der Explorer die Quellkennung und sucht
  automatisch weiter. Dabei werden Asset-URLs mit einem Hash-Buster versehen, damit nach abgelehnten Sounds nicht
  versehentlich ein altes MP3 oder Spektrogramm aus dem Cache angezeigt wird. Ungueltige Eingaben werden direkt am
  Feld markiert. Groesse und Gewicht koennen unabhaengig
  voneinander per Checkbox nach Maennchen und Weibchen getrennt werden; gespeichert werden weiterhin die vorhandenen
  Textfelder. Vor der Anlage schliesst `X`/`Abbrechen` den Dialog ohne Speicherung und verwirft die Eingaben. Die
  Route `POST /api/species/new/portrait-preview` prueft ein optional sofort erzeugtes Portrait vor
  der Artanlage. Der lokale Server wurde mit dem neuen Stand neu gestartet; die ausgelieferte
  Oberflaeche enthaelt Aktion, Dialog und alle Pflichtfelder mit Beispieltexten. Weitere Arten koennen nach
  erfolgreichem Speichern ohne Seitenneuladen angelegt werden. Haubentaucher und Hoeckerschwan wurden fuer
  produktive Workflow-Tests angelegt und danach am 2026-06-28 wieder entfernt und bereinigt. Loewe wurde am
  2026-06-30 erneut fuer den Neue-Art-Test entfernt; die Sofortloeschung bereinigte Eingabeliste, generierte Daten,
  Override-Eintrag und Assetordner.
  Hintergrundklicks schließen Eingabedialoge nur, wenn Zeigerdruck und Klickende beide auf dem Hintergrund liegen.
  Dadurch bleibt das Formular bei Textmarkierungen über den Dialogrand geöffnet.
  Phase 7.6 Pipeline-Steuerung nach `docs/pipeline-control-plan.md` ist seit 2026-06-20 abgeschlossen. Die App
  unterscheidet `Neue/Unvollstaendige Arten aktualisieren`, `Alle Arten vollstaendig aktualisieren`,
  `Manuelle und fehlende Karten erneut suchen` und `NC- und fehlende Sounds erneut suchen`. `update.mjs`
  unterstuetzt
  `--mode=missing`, `--mode=all` und `--dry-run`; `missing` verarbeitet neben neuen oder unvollstaendigen Arten
  auch geaenderte manuelle Eingabefelder aus `species_list.json`. Die App zeigt Vorschau, Prozessstatus und lokale Logs. Nur ein
  Lauf kann gleichzeitig aktiv sein. Nach dem Start bleibt der Dialog geöffnet und zeigt
  `Pipeline-Lauf läuft gerade`. Der Button `Abbrechen` wechselt zu `Fenster schließen`; das Schließen beendet den
  Hintergrundprozess nicht. Ein Statusbalken im Hauptfenster zeigt laufende, wartende, abgeschlossene und
  fehlgeschlagene Läufe und öffnet die Prozessdetails erneut. Nach erfolgreicher Pipeline folgt der passende
  Spektrogramm-Abgleich. Die Prozessausgabe des Spektrogramm-Abgleichs wird im Explorer als lesbare Zeilen pro Art
  angezeigt: Sound vorhanden/fehlt und Spektrogramm vorhanden/erstellt/uebersprungen statt rohem JSON.
  Neu hinzugefuegte Karten und Sounds werden danach angezeigt und je Asset als automatisch oder manuell geschuetzt
  bestaetigt. Kartenvorschauen sind dabei anklickbar und werden fuer die Qualitaetspruefung in einer grossen
  Lightbox angezeigt. Sounds werden im Pruefdialog mit dem erzeugten Spektrogramm angezeigt; ein Klick ins
  Spektrogramm setzt die Wiedergabeposition. Sound-Optionen werden strukturiert angezeigt und nennen eindeutig,
  ob ein gefundener Kandidat `NC` oder `frei` ist. Wenn ein bisheriger Sound vorhanden ist, stehen bisheriger Sound
  und gefundener Kandidat nebeneinander, jeweils mit eigenem Player und Spektrogramm. Bei gezielten Kartenlaeufen
  stehen die bisherige Karte und die gefundene Karte nebeneinander und sind einzeln vergroesserbar. Die Entscheidung
  steht in `species-assets-overrides.json`; Details:
  `docs/asset-review-workflow.md`. Danach werden die Pipeline-Dateien automatisch committed und gepusht.
  Beim Schliessen des Asset-Pruefdialogs werden laufende Sounds gestoppt und auf Position 0 zurueckgesetzt.
  Die beiden Wartungsläufe verarbeiten die aktuell fünf manuell geschützten Karten plus Arten mit fehlender Karte
  beziehungsweise die vier NC-Sounds plus Arten mit fehlender Sounddatei. Vorhandene Dateien werden vorübergehend
  unter dem ignorierten Pfad
  `species-explorer/pipeline-asset-backups/` gesichert und bei Ablehnung einer Alternative wiederhergestellt.
  Wenn ein Sound im Pruefdialog ausdruecklich abgelehnt wird, speichert der Explorer die Quellkennung unter
  `sound.rejectedSources` und startet automatisch die naechste gezielte Soundsuche fuer dieselbe Art. Es koennen
  beliebig viele Quellen je Art abgelehnt werden; die Schleife endet erst, wenn eine Quelle uebernommen wird oder
  keine weitere taugliche Quelle vorhanden ist. Bei einer gezielten Alternative fuer einen bereits akzeptierten
  Sound wird die aktuelle Quelle nur temporaer uebersprungen; nach freien Kandidaten werden auch die bisherigen
  Xeno-Canto-Fallback-Stufen geprueft. Wenn ein gefundener Kandidat wegen Download-, Format- oder
  Transcode-Problemen nicht uebernommen werden kann, prueft `update.mjs` im selben Lauf weitere Kandidaten. Eine
  Windows-Dateisperre auf der produktiven MP3 wird als eigener Warnzustand gemeldet; der Bearbeitungsdialog entlaedt
  den aktuellen Audioplayer vor dem Alternativlauf, um solche Sperren zu vermeiden.
  Seit 2026-06-29 schliessen `X`, `Abbrechen` und `Fenster schliessen` die Datenbank- und Einstellungsdialoge
  wieder korrekt; der laufende Prozess bleibt dabei unveraendert im Hintergrund aktiv.
  Der IUCN-Kartenabruf prueft zusaetzlich eine robuste Fallback-Strategie fuer gecachte Einzelkarten. Seit
  2026-07-02 versucht `update.mjs` zuerst den bisherigen IUCN-Web-Endpunkt mit browsernahen Headern, danach den
  offiziellen IUCN-API-Host mit Token und extrahiert signierte Backblaze-Links aus Redirect-, HTML- und
  Fehlerantworten als
  `cached-individual-maps`-URL. Wenn Node lokal HTTP 403 erhaelt, nutzt die Pipeline unter Windows zusaetzlich
  `Invoke-WebRequest` als WebRequest-Fallback, weil derselbe IUCN-Endpunkt dort die JPEG-Karte ausliefert. Seit
  2026-07-10 wiederholt die Pipeline diesen Fallback bei temporären IUCN-/Backblaze-Fehlern bis zu dreimal, damit
  ein einzelnes `503 Server nicht verfügbar` nicht direkt in den manuellen Kartenworkflow führt. Der URL-Prüfer im
  Kartenimport nutzt denselben Windows-WebRequest-Fallback für IUCN-API-Kartenlinks. Wenn
  lokal trotzdem kein direkt speicherbarer Link geliefert wird, kann der im Browser sichtbare signierte
  Backblaze-JPEG-Link weiterhin im Kartenimport als Quellen-URL eingefuegt und wie ein
  Datei-Upload geprueft und uebernommen werden. Seit 2026-07-10 akzeptiert der Karten-Dateiupload JPEG und PNG;
  PNG wird serverseitig nach JPEG konvertiert und weiterhin als `map.jpg` gespeichert. Eine Quellen-URL ist nur
  beim Linkimport Pflicht. Seit 2026-07-01 bietet der Karten-Bearbeitungsdialog dafuer direkt
  `IUCN-Karte im Browser oeffnen`. Derselbe URL-Workflow steht im Neue-Art-Assistenten im Schritt `Karte` zur
  Verfuegung, damit eine neue Art ohne Wechsel in den allgemeinen Bearbeitungsdialog mit manueller Karte
  abgeschlossen werden kann. Karten-Vorschauen skalieren hochformatige IUCN-Karten vollstaendig in die verfuegbare
  Breite ein; nach einem manuellen Kartenimport wird der Report sofort neu aufgebaut und die Aenderung lokal fuer
  `Änderungen übertragen` vorgemerkt. Seit 2026-07-02 kann `Automatisch suchen` im
  Karten-Bearbeitungsdialog fuer jede vorhandene Art gestartet werden, auch wenn die Karte bereits automatisch
  gepflegt ist. Wenn die Pipeline eine Karte speichert, zeigt der Explorer die Pflegeentscheidung auch dann an, wenn
  die Datei bytegleich zur bisherigen manuell gepflegten Karte ist; dadurch koennen Backblaze-uebernommene Karten
  nach erfolgreichem automatischem Abruf wieder auf automatische Pflege zurueckgestellt werden. Ein versteckter
  Electron-/Chromium-Fallback wird nicht genutzt, weil
  Headless-Browserprozesse auf dem Zielsystem mit Anwendungsfehlern abbrechen koennen.
  Seit 2026-06-27 beendet `update.mjs` abgeschlossene Pipeline- und Wartungsläufe nach dem Leeren von stdout und
  stderr explizit. Dadurch bleibt der Explorer nach einer finalen Erfolgsausgabe nicht mehr fälschlich im Status
  `Pipeline-Lauf läuft gerade` hängen; die anschließende Assetentscheidung kann geöffnet werden.
  Bei Übernahme einer automatischen Karte werden JSON-Register und `docs/manual-map-overrides.md` gemeinsam
  aktualisiert. Großtrappe, Kernbeißer und Reh wurden am 2026-06-20 aus der manuellen Pflege genommen, nachdem
  Felix die neu gefundenen automatischen Karten übernommen hatte. Das JSON-Register ist bei einer ausdrücklichen
  `manual`-Entscheidung maßgeblich; die Markdown-Liste wird daraus synchronisiert.
  Die Speichermeldung einer neu angelegten Art wird nach erfolgreichem Pipeline-Commit und Push entfernt.
  Arten koennen nach Vorschau und `species_list.json`-Backup aus der Eingabeliste entfernt werden. Eine Checkbox
  loescht bei Bedarf generierte Daten, Assessment-Zuordnung, Asset-Pflegeeintrag und Assetordner derselben Art sofort
  dauerhaft mit. Seit 2026-07-01 wird bei aktivierter Checkbox zuerst die dauerhafte Bereinigung ausgefuehrt und erst
  danach `species_list.json` geaendert; bei einer Windows-Dateisperre bleibt die Art vollstaendig in der Eingabeliste.
  Ohne Checkbox bleiben diese Inhalte bis zur getrennten Bereinigung bestehen. Die Aktion
  `Bereinigen` listet verwaiste Datensaetze, Assessment-Zuordnungen, Pflegeeintraege und Assetordner auf und loescht sie nach
  genau einer Bestaetigung dauerhaft ohne Wiederherstellungsablage. Details:
  `docs/delete-species-workflow.md`. Die Bereinigung verschiebt Assetordner seit 2026-06-28 zuerst in den ignorierten
  Ordner `species-explorer/cleanup-trash/`, schreibt danach Daten und Report und loescht den verschobenen Ordner erst
  anschliessend endgueltig. Seit 2026-06-30 werden kurze Windows-Dateisperren beim Verschieben mehrfach erneut
  versucht; danach nutzt der Explorer einen kontrollierten Fallback aus Kopieren und Entfernen des Originalordners.
  Dadurch bleiben Daten, Report und Assetbestand auch bei Windows-Dateisperren konsistent. Seit 2026-07-01 kann der
  Loeschdialog auch einen teilbereinigten Zwischenzustand ohne `species_list.json`-Eintrag, aber mit verbliebenen
  generierten Daten oder Assets direkt dauerhaft bereinigen. Vor dem Loeschaufruf entlaedt die Oberflaeche Audio,
  Karten- und Portraitmedien der Detailseite und wartet bei Sofortloeschung kurz, damit Windows keine produktiven
  Assetdateien sperrt.
  Gezielte Sound-Alternativlaeufe im Bearbeitungsdialog und globale `nc-sounds`-Laeufe entladen vor dem Start alle
  Audioplayer; der aktuelle Bearbeitungsplayer wird ersetzt und kurz freigegeben, damit eine pausierte Vorschau keine
  produktive MP3-Dateisperre haelt. Temporäre Pipeline-Backupordner, die Windows nach erfolgreichem Commit/Push noch
  sperrt, werden nur noch als Warnung protokolliert und machen den Lauf nicht nachtraeglich fehlgeschlagen. Beim
  spaeteren Uebernehmen einer Soundalternative bleiben bereits gespeicherte `sound.rejectedSources` erhalten. Der
  offene Tierstimmen-Bearbeitungsdialog aktualisiert nach einem still gestarteten Alternativlauf aktuellen Sound und
  Credits aus dem neu geladenen Modell. Der Sound-Pruefdialog bleibt nach einer Ablehnung geoeffnet und zeigt den
  naechsten Kandidaten im selben Fenster. Die Detailansicht nutzt versionsbasierte lokale Asset-URLs fuer Sound,
  Spektrogramm, Karte und Portrait, damit nach schnellen Assetwechseln keine alten Browsercache-Dateien neben neuen
  Dateien angezeigt werden.
  Der separate Phase-7.6-Seitenbereich wurde entfernt. In der Kopfzeile schaltet
  `Lesemodus 🔒` und `Bearbeitungsmodus 🔓`; Neue Art, Datenbankaktualisierung, Bearbeiten und Loeschen sind nur dort
  sichtbar. Der Modusschalter hat in beiden Zuständen dieselbe feste Breite und Position. Das klickbare Datenbankfeld
  ist bei manuellen Eingabeabweichungen oder lokal gespeicherten Assetaenderungen rot mit
  `Änderungen übertragen` und bei konsistentem Stand gruen mit `Datenbank aktuell`; ein Klick auf den roten Zustand
  startet den Transferlauf fuer geaenderte Eingabefelder und lokale Assetdateien ohne Karten- oder Soundsuche. Der
  Kopfstatus und die Validierung werden nach stillen Karten-/Soundläufen im geöffneten Bearbeitungsdialog ohne
  vollständiges Neurendern aktualisiert, damit ein bereits committed/gepushter Lauf nicht fälschlich weiter
  `Änderungen übertragen` anzeigt. Der
  Status- und Uebertragungsbutton bleibt auch im Lesemodus sichtbar; ohne offene Aenderungen oeffnet er dort keine
  Wartungsaktionen. Die Transfer-Vorschau zaehlt auch Arten, bei denen nur lokale Assetdateien geaendert wurden.
  Datenbank-Aktionen laufen exklusiv: waehrend Pipeline, Assetpruefung, Transfer, Bereinigung oder NAS-Backup aktiv
  ist, blockiert der Server weitere Datenbank-Aktionen. `Art aktualisieren` fragt je Art nur kurz nach und startet
  den gezielten Lauf direkt im Hintergrund, ohne den allgemeinen Datenbank-Aktionen-Dialog zu oeffnen. Beim
  Schliessen der Desktop-App warnt der Explorer vor noch nicht uebertragenen Aenderungen; der Nutzer kann zur App
  zurueckkehren oder trotzdem schliessen und die Uebertragung beim naechsten Start nachholen. Der Dialog dahinter
  heisst `Datenbank-Aktionen` und trennt Aktualisieren, Backup/Einstellungen sowie Wartung in aufklappbare Gruppen.
  Nach dem Speichern einer neuen Art startet der selektive Lauf fuer genau diese Art automatisch. Externe Änderungen durch `update_local.bat`,
  CLI-Aufrufe oder andere Prozesse werden über eine Dateirevision erkannt. Der Server baut sein Modell automatisch
  neu auf; die Browseroberfläche prüft alle fünf Sekunden `GET /api/revision` und lädt bei Änderungen selbstständig
  neu. 24 Explorer-Tests sind erfolgreich. Ein vollständiger externer Pipeline-Lauf und ein produktiver
  selektiver App-Lauf fuer den Hoeckerschwan wurden am 2026-06-20 erfolgreich abgeschlossen. Start,
  Prozessanzeige, Assetentscheidung sowie automatischer Commit `55fda06` und Push funktionierten. Die danach
  ergaenzte Karten-Grossansicht, sichere Dialogbedienung, Soundstopp und Bereinigung wurden von Felix praktisch
  geprueft.
  Ein am 2026-06-20 gefundener Fehler startete bei `Bereinigen` wegen eines fehlenden internen Modus irrtuemlich
  `update.mjs --mode=undefined`. Der Plan und Prozessstatus tragen jetzt ausdruecklich `mode: cleanup`; der
  isolierte Test prueft sowohl den Bereinigungslauf als auch die optionale Sofortloeschung und anschliessende
  kollisionsfreie Neuanlage.
  Phase 7.7 Asset-Verwaltung nach `docs/asset-management-plan.md` wurde am 2026-06-21 abgeschlossen und von Felix
  freigegeben. Die Kartenverwaltung erlaubt im allgemeinen Bearbeitungsdialog bekannten Arten eine neue
  Arten eine neue JPEG-Karte bis 20 MB mit Quelle und Pflegegrund pruefen. Der Server validiert Magic Bytes,
  JPEG-Struktur und Abmessungen, legt eine zehn Minuten gueltige Alt-/Neu-Vorschau im ignorierten Stagingbereich an
  und schuetzt gegen parallele Aenderungen. Beim Speichern wird die alte Karte gesichert, `map.jpg` atomar ersetzt,
  der manuelle Pipeline-Schutz samt SHA-256 im Override-Register gesetzt und die Kartendokumentation aktualisiert.
  Pro Art und Assettyp bleibt seit 2026-07-10 genau die letzte verwaltete Sicherung erhalten; global gilt weiter
  500 MB. Nach erfolgreichem Austausch
  bleiben Karte, Register, Dokumentation und Report lokal vorgemerkt und werden gesammelt ueber
  `Änderungen übertragen` committed und gepusht.
  Die technische Grundlage fuer 7.7.3 Sound-/Credits-Verwaltung ist ebenfalls lokal umgesetzt. Der allgemeine
  Bearbeitungsdialog akzeptiert MP3-Dateien bis 50 MB nur zusammen mit Aufnahme/Urheber, Quelle, Original-URL,
  Lizenz und Pflegegrund. Wissenschaftlicher und deutscher Name werden aus dem Arteintrag uebernommen. Vor dem
  Speichern zeigt die App alten und neuen Sound, Dateigroesse, Dauer, Credits und einen sichtbaren NC-Hinweis.
  Der Server prueft Endung und MP3-Signatur, verwendet ein zehn Minuten gueltiges Vorschau-Token und schuetzt gegen
  parallele Aenderungen. Beim Speichern werden `sound.mp3`, `credits.json` und `spectrogram.webp` gemeinsam
  gesichert. Phase 7.7.4 erzeugt vor jeder produktiven Soundaenderung automatisch ein neues Spektrogramm mit den
  gemeinsamen Parametern aus `scripts/spectrogram-renderer.mjs`. Erst wenn FFmpeg und WebP-Pruefung erfolgreich
  sind, werden Sound, Credits und Spektrogramm gemeinsam ersetzt. Schlaegt die Erzeugung fehl, bleibt das bestehende
  Produktivpaket unveraendert. `species-assets-overrides.json` speichert pro Art Sound- und Spektrogramm-SHA-256;
  der Explorer vergleicht diese Hashes mit den aktuellen Dateien und meldet Abweichungen als
  `Spektrogramm veraltet`. Der Generator registriert auch uebersprungene aktuelle Spektrogramme und veraendert bei
  einem erneuten unveraenderten Lauf keine Zeitstempel. Der bestehende Bestand wurde am 2026-06-20 migriert:
  45 von 45 vorhandenen Spektrogrammen sind hashregistriert und verifiziert, 0 sind veraltet. Der manuelle Pipeline-Schutz wird
  beim Soundimport gesetzt. Danach bleiben die betroffenen Assetpfade lokal vorgemerkt und werden gesammelt ueber
  `Änderungen übertragen` committed und gepusht. Pro Art und Assettyp bleibt seit 2026-07-10 genau die letzte
  verwaltete Sicherung erhalten; Karten-, Sound- und Portraitsicherungen teilen sich die globale Obergrenze von
  500 MB. Die Loeschaktionen fuer Verbreitungskarte, Artportraet und Soundpaket stehen direkt in den
  Asset-Kopfzeilen der Artseite neben `Bearbeiten`; beim Artportraet-Import kann eine gepruefte Vorschau verworfen
  und das bisherige Portrait beibehalten werden.
  Im Bearbeitungsmodus kann seit 2026-06-28 auch der aktuell produktive Sound abgelehnt werden. Der Explorer legt ein
  Soundpaket-Backup an, entfernt `sound.mp3`, `credits.json` und `spectrogram.webp`, merkt die Quellkennung unter
  `sound.rejectedSources`, baut den Report neu auf und merkt die Änderung lokal fuer `Änderungen übertragen` vor. Der naechste Sound-Suchlauf
  ueberspringt diese konkrete Quelle. Fehlende oder manuell geschuetzte Karten sowie fehlende/NC-Sounds koennen
  im Bearbeitungsdialog per `Automatisch suchen` gezielt fuer die aktuelle Art gesucht werden. Seit 2026-06-30 kann
  bei vorhandenem akzeptiertem Sound im Bearbeitungsdialog auch gezielt eine Alternative gesucht werden; der aktuelle
  Sound ist dort direkt abspielbar. Ein gezielter Alternativlauf ueberspringt die aktuell gespeicherte Quelle
  temporaer, damit nicht derselbe Sound erneut vorgeschlagen wird. Diese gezielte Suche startet im Hintergrund ohne
  das Bearbeitungsfenster oder die Desktop-App zu schliessen und ohne den allgemeinen Datenbank-Aktionen-Dialog
  einzublenden. Der aktuelle Audioplayer wird vor dem Start entladen, damit Windows die produktive MP3 nicht sperrt.
  Die Validierung unterscheidet in der Oberflaeche zwischen fehlendem Sound ohne verwendbare automatische Tonquelle
  und manuell gepflegten Sounds.
  Phase 7.7.5 Artportraet ist seit 2026-06-21 technisch als kostenfreier manueller Workflow umgesetzt. Die zuvor
  vorbereitete kostenpflichtige OpenAI Image API und die Abhaengigkeit von `OPENAI_API_KEY` wurden wieder
  vollstaendig entfernt. Der Explorer erzeugt den versionierten Prompt `1.1.0` lokal aus deutschem und
  wissenschaftlichem Namen sowie optionalen Zusatzhinweisen. Einzelprompts koennen angezeigt und kopiert werden.
  Der Sammelprompt-/Datenbankdialog fuer alle fehlenden Portraits wurde am 2026-06-27 entfernt, weil ChatGPT daraus
  wiederholt Collagen oder Mehrfachbilder erzeugte. Die Ein-Bild-Regel verbietet Collagen, Raster,
  Mehrfachansichten und Varianten. Bilder werden deshalb artweise im vorhandenen ChatGPT-Zugang erzeugt und als PNG,
  JPEG oder WebP wieder
  in die App geladen. Der Server prueft Magic Bytes, mindestens 800x1000 Pixel und 4:5; FFmpeg vereinheitlicht die
  Vorschau auf `1280x1600` WebP. Bei bestehenden Arten fuehrt `Artporträt übernehmen` nach manueller Art- und
  Anatomiepruefung Speichern und Backup lokal aus; veroeffentlicht wird gesammelt ueber `Änderungen übertragen`.
  Beim optionalen Sofortportrait einer neu
  angelegten Art wird ein geprueftes Portrait im Neue-Art-Assistenten ohne zusaetzliche Electron-Bestaetigung lokal
  uebernommen und anschließend mit dem gezielten Pipeline-Lauf veroeffentlicht. Fehlende Portraets sind regulaere
  Assetprobleme: Gesamtvalidierung und Datenbankstatus werden rot, das Assetdashboard nennt die genaue Fehlanzahl,
  und betroffene Arten tragen die Listenmarkierung `P` und sind ueber den Hinweisfilter auffindbar. Der normale
  Datenpipeline-Lauf erzeugt weiterhin keine Portraets; sie werden nur artweise im Bearbeitungsdialog gepflegt.
  Explorer-Tests decken Prompt, Dateipruefung, Konvertierung, Speicherung, Hashpruefung und die entfernte
  Sammelroute ab. Der Neue-Art-Dialog kann seit 2026-06-27 aus den eingegebenen neuen Artdaten einen Einzelprompt
  erzeugen und ein optional sofort erzeugtes Bild nach der Artanlage pruefen und uebernehmen. Der erste produktive
  Import fuer `Alpenbirkenzeisig` wurde am 2026-06-21 gespeichert, committed und gepusht.
  Der Detailbereich behaelt mit und ohne Portrait dieselbe Medienhoehe; das vollstaendige 4:5-Bild wird innerhalb
  dieser Flaeche eingepasst und nur in der Lightbox vergroessert. Die feste Medienzeile beruecksichtigt Titel,
  Inhalt und beide aeusseren Rahmenkanten, damit die untere Border nicht abgeschnitten wird. Die weitere
  Portraitbefuellung und Squarespace-Ausgabe sind Betriebs- beziehungsweise spaetere Ausbauschritte und blockieren
  den Abschluss der lokalen Assetverwaltung nicht. Details: `docs/portrait-generation.md`.
  Phase 7.8 wurde am 2026-06-28 abgeschlossen und von Felix erfolgreich getestet. `npm.cmd run species:desktop` startet den
  bestehenden Explorer-Server im Electron-Hauptprozess, wartet auf `/api/summary` und zeigt die bestehende
  Oberflaeche im eigenen App-Fenster. Chrome und das manuelle Oeffnen von `127.0.0.1:4177` entfallen im
  Normalbetrieb; `npm.cmd run species:explorer` bleibt fuer Debugging verfuegbar. Umgesetzt sind
  Single-Instance-Schutz, Fallback auf freien Port bei belegtem 4177, externe Links im Standardbrowser,
  Server-Neustart bei Startfehlern und eine Schliessabfrage bei laufendem Pipeline-/Asset-Pruefschritt.
  `npm.cmd run species:desktop:shortcut` erstellt eine Desktop-Verknuepfung, die per `wscript.exe` den versteckten
  Launcher `species-explorer/desktop/start-explorer.vbs` nutzt. Dadurch startet die App per Doppelklick ohne
  dauerhaft sichtbares PowerShell-Fenster. Der Desktop-Lifecycle ist im Explorer-Test abgedeckt;
  `npm.cmd run --silent test:explorer` umfasst jetzt 19 Tests.
  Details: `docs/desktop-shell-plan.md`. NAS/Backup und Mehrgeraete-Lock sind fuer Phase 10 vorgesehen.
  Vor Phase 10 wurde am 2026-06-28 ein nicht-destruktiver Projektkonsolidierungs-Audit gestartet:
  `docs/project-consolidation-audit.md`. Ergebnis: kein kritischer Blocker; Bereinigungskandidaten sind `Testlauf/`,
  `errors.log` und ein alter `species-explorer/pipeline-asset-backups/`-Lauf. Strukturkandidaten waren die
  Dependency `node-fetch`, Log-/Temp-Retention und das spaetere FFmpeg-/Installer-Konzept.
  Nach Felix' Freigabe wurden `Testlauf/`, `errors.log` und `species-explorer/pipeline-asset-backups/` geloescht.
  `node-fetch` wurde aus `package.json` und `package-lock.json` entfernt; ein danach gefundener Pipeline-Importfehler
  wurde durch Umstellung von `update.mjs` auf natives Node-`fetch` korrigiert. Node.js 18 oder neuer ist damit
  Voraussetzung. Tests, JS-/MJS-Syntax und lokaler Site-Audit sind danach erfolgreich.
  Karten-, Sound-/Credits-, Spektrogramm- und Portraitpfade sind durch Vorschau-, Validierungs-, Backup-, Hash-,
  Commit- und Push-Tests abgedeckt. Felix hat die Asset- und Detailoberflaeche zum Abschluss von Phase 7.7
  akzeptiert; ein unnoetiger Austausch eines bereits gueltigen Sounds ist kein offener Abschlussblocker.
  Seit 2026-07-04 ist die Neue-Art-Karte im Assistenten vergroesserbar, der Lizenzstatus `frei`/`NC` wird im
  Neue-Art-Soundcheck und im Tierstimmen-Quellenbereich angezeigt und der Hintergrund im Neue-Art-Assistenten bleibt
  bis zum Abschluss stabil. Seit 2026-07-04 koennen Verbreitungskarte, Soundpaket und Artportrait einzeln aus der
  Artbearbeitung geloescht werden. Vor dem Loeschen wird unter `species-explorer/asset-backups/` gesichert; Karten-
  Overrides und Kartendokumentation werden synchron entfernt, beim Soundpaket bleiben bereits gemerkte
  `sound.rejectedSources` erhalten. Seit 2026-07-10 bleibt pro Art und Assettyp genau eine letzte Sicherung mit
  Originaldateinamen und `backup.json` erhalten; erneutes Loeschen oder Ersetzen ueberschreibt diese Sicherung.
  Vorhandene Sicherungen koennen direkt in der Asset-Kopfzeile per `Wiederherstellen` zurueckkopiert werden, ohne
  Sicherung ist der Button deaktiviert. Die Loeschung oder Wiederherstellung bleibt lokal offen und wird ueber
  `Änderungen übertragen` veroeffentlicht. Soundvergleichsdialoge stoppen andere offene Audioplayer, sobald ein
  neuer Player gestartet wird. Seit 2026-07-05 ist auch das Umbenennen des deutschen Artnamens inklusive Assetname/SafeName,
  Ordner, Override-Eintraegen, Assessment-Zuordnung, Report und Dokumentation umgesetzt.
  Seit 2026-07-11 sind die Taxonomiewerte fuer Reich, Stamm, Klasse, Ordnung und Familie in bestehenden Daten
  normalisiert; `update.mjs` schreibt auch kuenftige IUCN-Daten in lesbarer Gross-/Kleinschreibung. Das einmalige
  Migrationsskript sichert `speciesData.json` vorher unter `species-explorer/backups/`.
  Die anschliessenden Phase-8-Schritte sind seit 2026-07-18 umgesetzt: Die Taxonomie-Pyramide verwendet deutsche
  Anzeigenamen und zeigt einen Unterstamm nur aus einem tatsaechlich vorhandenen Datenwert. Das Artportrait ist in
  das responsive Squarespace-Artseitenlayout integriert; Status und Trend stehen auf Desktop direkt unter den
  allgemeinen Daten.
  Die Assetformulare wurden am 2026-06-21 kompakter ausgerichtet: Karten- und MP3-Dateieingabe haben dieselbe
  intrinsische Hoehe. Der Pflegegrund spannt auf Desktop exakt ueber zwei linke Feldzeilen. Im Soundformular stehen
  Quelle neben Original-URL, Lizenz neben Land und Ort neben Qualitaet; Notizen bleiben ueber beide Spalten.
  Auf schmalen Ansichten werden alle Felder weiterhin einspaltig dargestellt.
  Phase 9 `Globale Taxonomiedatenbank und Lightroom-Integration` ist seit 2026-07-23 in Arbeit, siehe
  `docs/global-taxonomy-lightroom-plan.md`. Phase 9.1 ist abgeschlossen; die verbindliche Quellenentscheidung steht
  in `docs/taxonomy-source-decision.md`. Catalogue of Life XR ist die globale Primärreferenz. Der im XR
  unterscheidbare Base-Kern bildet eine höhere Vertrauensstufe; WoRMS ergänzt und validiert marine beziehungsweise
  brackische Taxa. GBIF bleibt Diensteschicht für Alt-IDs, Taxonabgleich und Vorkommensdaten. Wikidata darf nur
  quellenmarkierte Namens-/ID-Vorschläge liefern; Animalia.bio bleibt ohne dokumentierte maschinelle Schnittstelle
  eine manuelle Referenz. `species_list.json` und `speciesData.json` bleiben die bestätigte produktive Datenbasis.
  Die große Referenzdatenbank darf weder in Git noch in das GitHub-Pages-Artefakt gelangen und bestehende Arten
  nicht still verändern. Phase 9.2 entwirft als Nächstes Speichertechnik, Schema, Provenienz, Import, Staging,
  Rollback und Suchindizes. Die Teilphasen 9.1 bis 9.9 reichen vom Quellenvergleich und begrenzten Importprototyp
  bis zum Lightroom-MVP und zur ausdrücklichen Übergabe der Datenverteilung an Phase 10.
  Phase 10 wurde am 2026-06-28 unter einer frueheren Nummerierung gestartet, siehe
  `docs/multi-device-backup-plan.md`. Beschlossen ist: GitHub bleibt
  zentrale versionierte Wahrheit, jeder Rechner arbeitet lokal in einem beliebigen Projektordner, das NAS dient als
  vollstaendiges ZIP-Restore-Backup und der Bearbeitungs-Lock liegt spaeter in einem separaten `app-lock`-Branch.
  `restore-start.cmd` ist der erste technische Baustein: Nach dem Entpacken eines NAS-Backups prueft das Skript
  Node.js 18+, richtet die Desktop-Verknuepfung ein und startet die App. Als NAS-Zielpfad wurde
  `W:\Website Datenbank Backup` festgelegt. Der Backup-Kern ist als `scripts/nas-backup.ps1` mit
  `npm.cmd run backup:nas:dry-run` und `npm.cmd run backup:nas` vorbereitet. In der Desktop-App ist
  `NAS-Backup erstellen` als manuelle Wartungsaktion im Datenbank-Dialog eingebunden: Vorschau mit Zielpfad,
  Umfang und Rotation, Start per Klick, Fortschritt in Prozent, Prozessausgabe, Abschlussmeldung und
  Schliesswarnung bei laufendem Backup. Der lokale Zielpfad kann ueber `Backup-Pfad einstellen` geaendert werden;
  die rechnerabhaengige Einstellung liegt ignoriert in `species-explorer/local-settings.json`.
  Vor dem Taxonomie-Redesign wurde am 2026-07-11 ein vollstaendiger Repository-, Code-, Daten-, Datei-,
  Dokumentations-, Test- und CI-Audit abgeschlossen: `docs/audits/2026-07-repository-audit.md`. Die Datenbasis ist
  konsistent. Der Audio-P0-Punkt wurde am 2026-07-12 abgeschlossen:
  `scripts/audio-format.mjs` prueft automatische Downloads, Uploads und Wiederherstellungen zentral, zwoelf
  WAV/PCM-Bestandsdateien wurden ruecksetzbar nach MP3 migriert und ihre Spektrogramme sowie Sound-Hashes neu
  erzeugt. Alle 48 vorhandenen Tierstimmen sind nun echte MP3-Dateien; das Pages-Artefakt sank von rund 229,9 auf
  89,86 MiB. Details: `docs/audio-format-validation.md`. Der zweite P0-Stabilisierungspunkt wurde am selben Tag
  umgesetzt:
  `scripts/validate-media-assets.mjs` prüft die tatsächlichen Formate und Abmessungen von Karten, Portraits,
  Spektrogrammen und PNG-Grafiken sowie MP3- und Credits-Pakete. Einzelgrenzen je Asset und Artpaket erkennen
  Ausreisser; das Pages-Gesamtbudget wächst ohne manuellen Eingriff mit 12 MiB Grundbedarf plus 2,5 MiB je Art und
  besitzt ein 500-MiB-Notfalllimit. Aktuell stehen 89,86 MiB einem Budget von 134,5 MiB gegenüber; Details:
  `docs/media-asset-validation.md`. Der dritte P0-Stabilisierungspunkt wurde am selben Tag abgeschlossen: Alle
  schreibenden localhost-Routen verlangen ein pro Serverstart neues Sitzungstoken und werden zentral auf lokalen
  Host, Same-Origin, Fetch-Site und JSON-Content-Type geprüft. Asset-Löschen und -Wiederherstellen verwenden
  zusätzliche Einmaltokens, Karten-URLs werden einschließlich Weiterleitungen nach DNS-Auflösung gegen lokale und
  private Ziele geprüft und Dateipfade nutzen echte Verzeichnisgrenzen. 24 Explorer- und 3 dedizierte
  Sicherheitstests bestehen; Details: `docs/explorer-api-security.md`. Der vierte P0-Stabilisierungspunkt wurde am
  2026-07-13 abgeschlossen: Der getrennte GitHub-Actions-Job `Quality checks` führt `npm ci`, einen parserbasierten
  Syntaxcheck, den gemeinsamen `npm test`-Einstieg, Audio-/Medienvalidierung sowie Projekt- und lokalen Datenaudit
  aus. Der Pages-Build hängt davon ab und vergleicht `_site/` anschließend exakt mit einer zentralen öffentlichen
  Dateifreigabe; Designquellen, Sicherungen und unbekannte Assetdateien werden abgewiesen. Der aktuelle Stand umfasst
  364 öffentliche Dateien mit 89,72 MiB. Details: `docs/ci-quality-gate.md`. Die anschließende
  Dokumentationskonsolidierung verwendet `docs/project-status.md` als einzige aktuelle Zählerquelle und ist unter
  `docs/documentation-lifecycle.md` verbindlich geregelt. Die zentrale Temp-Retention
  `species-explorer/temp-retention.mjs` bereinigt eindeutig verwaltete, abgelaufene Dateien beim Start und nach
  Pipeline-Läufen sowie alle verwalteten Laufzeitreste beim kontrollierten Explorer-Schließen. Neue temporäre
  Ablagen müssen von Anfang an Eigentümerschaft, Lebenszyklus, Sperrverhalten, Aufbewahrungsgrenze und Tests
  definieren; Details: `docs/temp-retention.md`.
  `.gitattributes` ist die verbindliche Zeilenendenregel: LF für plattformunabhängige Quell-, Daten- und
  Dokumentdateien, CRLF für Windows-Start-/Wartungsskripte und keine Textkonvertierung für Binärformate.
  Stabilisierungspaket B wurde mit dem beim ersten Versuch erfolgreichen GitHub-Actions-Lauf `29265285193` und
  einem fehlerfreien Live-Audit über 120 Squarespace-Sitemapseiten abgeschlossen.
  Der fünfte P0-Stabilisierungspunkt wurde am 2026-07-13 abgeschlossen: 37 Syntaxprüfungen, 38 automatisierte Tests,
  49 Arten und 263 Medien bestanden lokal; der vollständige Live-Audit erreichte 120 Squarespace-Sitemapseiten ohne
  Abruf- oder HTTP-Fehler und bestätigte die geprüften GitHub-Pages-Dateien. GitHub-Actions-Lauf `29258080649`
  bestand Quality, Artefaktbau und Pages-Deployment beim ersten Versuch. Stabilisierungspaket A ist abgeschlossen.
  Auditpunkt A4 wird seit 2026-07-13 in kleinen, verhaltensneutralen Modulschnitten bearbeitet. Der erste Schnitt
  verschiebt Asset-Sicherungen, Sicherungsmetadaten und die Aufbewahrung von Asset-, Eingabelisten- und Pipeline-
  Sicherungen nach `species-explorer/asset-backups.mjs`. Der zweite Schnitt verschiebt Felddefinitionen,
  Namensnormalisierung, Artenvalidierung, Kollisionspruefungen, Bearbeitungsdiffs und Reportvergleiche nach
  `species-explorer/species-model.mjs`. Der dritte Schnitt verschiebt JSON-Anfragegrenzen, HTTP-Antworten, sichere
  öffentliche/Asset-/Grafikpfade, MIME-Typen, Byte-Range-Dateiauslieferung und aktive Dateistreams nach
  `species-explorer/http-routing.mjs`. Der vierte Schnitt verschiebt Methoden-/Pfadzuordnung, Sitzungs- und
  Schreibgrenze, Body-Limit-Auswahl, Fehlerantworten und die Entscheidung über lokale Dateiauslieferung nach
  `species-explorer/request-router.mjs`. Die Neue-Art-Route `portrait-preview` ist dort explizit und getrennt von
  der allgemeinen Artenvorschau getestet. Siebzehn direkte Modultests ergänzen die 24 Explorer-Integrationsprüfungen;
  der gemeinsame Testeinstieg umfasst 59 Tests. `species-explorer/server.mjs` sank dabei von 6.557 auf 5.654 Zeilen.
  HTTP-Basis und Routenzuordnung sind getrennt. Der fünfte A4-Schnitt extrahiert mit
  `species-explorer/public/app-foundation.js` die Zustandsinitialisierung, den Sitzungstoken, geschützte
  JSON-Anfragen, das gemeinsame Explorer-Datenpaket und die Revisionsabfrage aus `public/app.js`. Vier direkte
  Frontend-Grundlagentests ergänzen den Testeinstieg auf 63 Tests; `app.js` sank von 5.688 auf 5.583 Zeilen. A4
  bleibt offen, bis weitere fachliche Oberflächenbereiche schrittweise modularisiert sind. Der sechste A4-Schnitt
  führt `species-explorer/public/app-presentation.js` als reine Anzeigegrenze ein: HTML-/URL-Sicherheit,
  Größen-, Datums-, IUCN-, Asset- und Lizenzformatierung, Datenzeilen sowie versionsbasierte Medien-URLs liegen
  nicht mehr im Oberflächenmonolithen. Fünf direkte Präsentationstests erhöhen den gemeinsamen Testeinstieg auf
  68 Tests; `app.js` sank weiter auf 5.389 Zeilen. Das Modul wird lokal vor `app.js` geladen. Squarespace-JavaScript,
  Footer-Versionen und Squarespace-CSS wurden in diesem Schnitt nicht geändert. Der siebte A4-Schnitt führt
  `species-explorer/public/app-measurements.js` als zustandsfreie Messwertgrenze ein. Größe, Gewicht und
  Lebenserwartung werden in Neue-Art-Assistent und Bearbeitungsdialog nun mit denselben Einheiten-, Parsing-,
  Singular-/Plural-, Formatierungs- und Formularhelfern verarbeitet; die doppelte Neue-Art-Logik wurde entfernt.
  Fünf direkte Messwerttests erhöhen den gemeinsamen Testeinstieg auf 73 Tests; `app.js` sank weiter auf 5.241
  Zeilen. Die Tests sichern auch die längenbasierte Einheitenerkennung ab, damit `kg` bei ebenfalls erlaubtem `g`
  vollständig entfernt wird. Das lokale HTML lädt Foundation, Presentation und Measurements in dieser Reihenfolge
  vor `app.js`. Der achte A4-Schnitt ergänzt `species-explorer/public/app-dialogs.js` als gemeinsame Grenze für
  modales Öffnen/Schließen, sichere Hintergrundklicks, Escape- und Busy-Sperren, Körperklassen sowie das Freigeben
  von Medienquellen. Fünf direkte Dialogtests erhöhen den gemeinsamen Testeinstieg auf 78 Tests; `app.js` sank auf
  5.159 Zeilen. Das lokale HTML lädt Dialogs nach Measurements und vor `app.js`. Squarespace-JavaScript,
  Footer-Versionen und Squarespace-CSS wurden nicht geändert. Der neunte A4-Schnitt ergänzt
  `species-explorer/public/app-media.js` als Mediengrenze für Karten- und Portraitdarstellung, die gemeinsamen
  Bereichsaktionen, den Explorer-Audioplayer und die Karten-/Portrait-Lightbox. Sechs direkte Medientests erhöhen
  den gemeinsamen Testeinstieg auf 84 Tests; `app.js` sank auf 4.936 Zeilen. Das lokale HTML lädt Media nach
  Dialogs und vor `app.js`. Ein realer lokaler Browsertest bestätigte Datenladung, Medienaktionen und beide
  Lightboxen. Squarespace-JavaScript, Footer-Versionen und Squarespace-CSS wurden nicht geändert.
  Der zehnte A4-Schnitt ergänzt `species-explorer/public/app-asset-review.js` als fachliche Grenze für den
  Karten-/Soundvergleich nach Pipeline-Läufen. Sicheres Vergleichs-Markup, Entscheidungstexte, Karten-Lightbox,
  Spektrogramm-Scrubbing, Fortschrittsmarker und Medienfreigabe liegen nicht mehr in `app.js`; Pipelinezustand,
  API-Aufrufe, Folgesuche und Speichern verbleiben dort. Fünf direkte Assetprüftests erhöhen den gemeinsamen
  Testeinstieg auf 89 Tests; `app.js` sank auf 4.760 Zeilen. Das lokale HTML lädt Asset Review nach Media und vor
  `app.js`. Ein realer lokaler Browsertest bestätigte 49 geladene Arten ohne Konsolenfehler. Squarespace-
  JavaScript, Footer-Versionen und Squarespace-CSS wurden nicht geändert.
  Der elfte A4-Schnitt ergänzt `species-explorer/public/app-pipeline.js` als Präsentationsgrenze für
  Modusbezeichnungen, Datenbankstatus, Pipeline-/Backupmeldungen, sichere Aktionsvorschauen und die automatisch
  nachgeführte Prozessausgabe. API-Aufrufe, Laufsteuerung und Zustand verbleiben in `app.js`. Sieben direkte
  Pipeline-Anzeigetests erhöhen den gemeinsamen Testeinstieg auf 96 Tests; `app.js` sank auf 4.598 Zeilen. Das
  lokale HTML lädt das Modul nach Asset Review und vor `app.js`; ein lokaler HTTP-Smoke-Test bestätigte
  Hauptseite, Modulreferenz und Export. Squarespace-JavaScript, Footer-Versionen und Squarespace-CSS wurden nicht
  geändert.
  Der zwölfte A4-Schnitt ergänzt `species-explorer/public/app-dashboard.js` als gemeinsame Grenze für
  Zusammenfassung, Validierungsdarstellung, Statusfilter und Artenliste. Status-, Trend-, Asset- und Pflegehinweise
  werden als unveränderliche Präsentationsmodelle erzeugt; der Dashboardcontroller rendert Filter und Artenliste,
  hält deren Scrollposition und delegiert die Artauswahl zurück an `app.js`. Sechs direkte Dashboardtests erhöhen
  den gemeinsamen Testeinstieg auf 102 Tests; `app.js` sank auf 4.398 Zeilen. Das lokale HTML lädt das Modul nach
  `filter.js` und vor `app.js`; ein echter lokaler HTTP-Smoke-Test bestätigte Hauptseite, Modulreferenz und Export
  jeweils mit HTTP 200. Squarespace-JavaScript, Footer-Versionen und Squarespace-CSS wurden nicht geändert.
  Der dreizehnte A4-Schnitt ergänzt `species-explorer/public/app-settings.js` als geschlossene Grenze für den
  lokalen Backup-Pfad-Einstellungsdialog. Das Modul lädt und normalisiert die lokale Einstellung, steuert
  Standardpfad, Statusmeldungen und Speichern und hält die API-Aufrufe hinter einem injizierten `fetchJson`.
  Vier direkte Einstellungstests erhöhen den gemeinsamen Testeinstieg auf 107 Tests; `app.js` sank von 4.408 auf
  4.334 Zeilen. Das lokale HTML lädt das Modul nach `app-dialogs.js` und vor `app-media.js`; der Explorer-Smoke-Test
  prüft Auslieferung, Reihenfolge und Export. Squarespace-JavaScript, Footer-Versionen und Squarespace-CSS wurden
  nicht geändert.
  Der vierzehnte A4-Schnitt ergänzt `species-explorer/public/app-species-actions.js` als fachliche Grenze für
  `Art aktualisieren` und das kontrollierte Entfernen beziehungsweise dauerhafte Löschen einer Art. Bestätigungs-,
  Vorschau-, Löschmodus- und Erfolgstexte sowie die Ereignissteuerung liegen im neuen Controller; Pipelineaufruf,
  API-Client, Dialoggrundlage, Medienfreigabe und erneutes Datenladen werden injiziert. Fünf direkte Tests erhöhen
  den gemeinsamen Testeinstieg auf 112 Tests; `app.js` sank von 4.334 auf 4.193 Zeilen. Das lokale HTML lädt das
  Modul nach `app-dashboard.js` und vor `app.js`; Explorer-Smoke-Tests prüfen Auslieferung, Reihenfolge und Export.
  Squarespace-JavaScript, Footer-Versionen und Squarespace-CSS wurden nicht geändert.
  Der fünfzehnte A4-Schnitt ergänzt `species-explorer/public/app-lifecycle.js` als gemeinsame Grenze für
  Bearbeitungsmodus, Explorer-Schnappschüsse, initiale Artauswahl, Revisionsüberwachung und die Schließwarnung bei
  offenen Änderungen. Dashboard-Aktualisierungen und Artauswahl werden injiziert; Pipeline-, Assistenten- und
  Bearbeitungsfachlogik bleiben unverändert. Sieben direkte Lebenszyklustests erhöhen den gemeinsamen Testeinstieg
  auf 119 Tests; `app.js` sank von 4.193 auf 4.107 Zeilen. Das lokale HTML lädt das Modul nach
  `app-dashboard.js` und vor `app-species-actions.js`; Explorer-Smoke-Tests prüfen Auslieferung, Reihenfolge und
  Export. Squarespace-JavaScript, Footer-Versionen und Squarespace-CSS wurden nicht geändert.
  Der sechzehnte A4-Schnitt ergänzt `species-explorer/public/app-asset-maintenance.js` als geschlossene Grenze für
  das Löschen und Wiederherstellen einzelner Karten-, Portrait- und Soundpakete im Art-Bearbeitungsdialog. Die
  gemeinsame Bestätigung, Medienfreigabe, Sicherungs-API, Erfolgsmeldung, Fehlerfreigabe und Datenneuladung liegen
  im neuen Controller; die bereichsspezifische Anzeige wird injiziert. Sechs direkte Asset-Wartungstests erhöhen
  den gemeinsamen Testeinstieg auf 125 Tests; `app.js` sank von 4.107 auf 4.007 Zeilen. Das lokale HTML lädt das
  Modul nach `app-species-actions.js` und vor `app.js`; Explorer-Smoke-Tests prüfen Auslieferung, Reihenfolge und
  Export. Squarespace-JavaScript, Footer-Versionen und Squarespace-CSS wurden nicht geändert.
  Die A4-Schnitte 17 bis 24 wurden am 2026-07-17 in einem kontrollierten Sammellauf umgesetzt. Acht neue, jeweils
  direkt getestete Browsermodule trennen weitere klar abgegrenzte Aufgaben aus `public/app.js`:
  `app-editor-files.js` (Datei-/Metadatenvorbereitung), `app-confirmation.js` (Bestätigungsdialog),
  `app-detail-media.js` (Detail-Lightboxen und Audiofreigabe), `app-selection.js` (Artauswahl und Scrollzustand),
  `app-asset-review-workflow.js` (Assetprüfablauf), `app-form-feedback.js` (Formularmeldungen und Feldfehler),
  `app-new-species-form.js` (Werteaufbau/Validierung des Neue-Art-Assistenten) und `app-editor-form.js`
  (Werteaufbau/Validierung der allgemeinen Artbearbeitung). 45 direkte Tests erhöhen den gemeinsamen Testeinstieg
  von 125 auf 170 Tests; `app.js` sank von 4.007 auf 3.504 Zeilen. Das lokale HTML lädt alle Abhängigkeiten in
  expliziter Reihenfolge, der Explorer-Integrationstest prüft Auslieferung, Export und Moduleigentümer und bestand
  mit 24 von 24 Prüfungen. Squarespace-JavaScript, Footer-Versionen und Squarespace-CSS blieben unverändert.
  Die Oberflächenschnitte 25 bis 33 schließen am 2026-07-17 die unter Auditpunkt A4 geplante Explorer-
  Oberflächenzerlegung ab. `app-pipeline-workflow.js`, `app-backup-workflow.js`,
  `app-new-species-workflow.js`, `app-species-editor.js`, die vier Teil-Editoren `app-editor-general.js`,
  `app-editor-map.js`, `app-editor-sound.js`, `app-editor-portrait.js` sowie `app-detail-view.js` übernehmen
  Pipeline-, Backup-, Neue-Art-, Bearbeitungs- und Detailabläufe. Der Datenbankstatus liegt im Dashboardmodul; der
  Assetprüfablauf wird ohne lokale Zwischenhülle direkt verdrahtet. `public/app.js` sank dadurch von 3.504 auf 509
  Zeilen und ist nur noch Kompositionswurzel. Vier neue Architekturtests sichern Exporte, Zuständigkeiten,
  Ladereihenfolge und die Größenbegrenzung der Verdrahtungsdatei; der Explorer-Integrationstest prüft zusätzlich
  die HTTP-Auslieferung aller neuen Module und bestand mit 24 von 24 Prüfungen. Die Oberflächenhälfte von A4 ist
  damit abgeschlossen. Eine spätere Server-/Pipeline-Zerlegung bleibt getrennt davon möglich. Squarespace-
  JavaScript, Footer-Versionen und Squarespace-CSS wurden nicht geändert.
  Der erste nachgelagerte Serverschnitt wurde am 2026-07-18 abgeschlossen. `explorer-model.mjs` besitzt den
  vollständigen Explorer-Modellaufbau und die Revision, `media-assets.mjs` Medienprüfung und Kartenimport,
  `pipeline-log.mjs` die Spektrogramm-Prozessausgabe, `manual-map-documentation.mjs` die Kartendokumentation und
  `asset-files.mjs` die kanonische Assetdateiliste. `server-test-fixtures.mjs` stellt gemeinsame binäre Fixtures
  bereit; direkte Modell-, Log-, Dokumentations- und Medienprüfungen liegen nun neben ihren Eigentümermodulen.
  Zwölf direkte Tests und 21 verbleibende Serverintegrationstests sichern die Grenzen. Dabei wurde ein stiller
  Revisionsfehler behoben, durch den Änderungen an Art-Assets übersehen werden konnten. `server.mjs` sank von
  5.678 auf 4.408 Zeilen und `server.test.mjs` von 3.098 auf 2.842 Zeilen. A4 bleibt für weitere kleine Schnitte an
  CRUD-, Pipeline-, Backup-/Publikations- und Adapterlogik offen. Squarespace-JavaScript, Footer-Versionen und
  Squarespace-CSS wurden nicht geändert.
  Die fünf verbleibenden serverseitigen A4-Pakete wurden am 2026-07-18 einzeln ausgelagert und nach jedem Paket
  geprüft. `species-create.mjs`, `species-delete.mjs` und `species-edit.mjs` besitzen die CRUD-Abläufe.
  `map-asset-workflow.mjs`, `sound-asset-workflow.mjs`, `portrait-asset-workflow.mjs` und
  `asset-maintenance.mjs` besitzen die Medienabläufe. `pipeline-controller.mjs` kapselt Pipelineplanung,
  Laufzustand, Assetprüfung und Veröffentlichung; `project-publication.mjs` und `backup-service.mjs` trennen
  offene Änderungen, Git-Übertragung, Einstellungen und NAS-Sicherung. Der Oberflächen-/Quellvertrag liegt in
  `explorer-ui-contract.test.mjs`, die API-Integration weiterhin in `server.test.mjs`. `server.mjs` sank von 4.408
  auf 566 Zeilen, `server.test.mjs` auf 2.102 Zeilen; der UI-Vertrag umfasst 784 Zeilen. Alle 21 Explorer-Prüfungen
  bestanden nach dem Gesamtschnitt. Auditpunkt A4 ist damit abgeschlossen. Squarespace-JavaScript,
  Footer-Versionen und Squarespace-CSS wurden nicht geändert.
  Der technische Abschlusslauf vom 2026-07-18 trennt zusätzlich die externen IUCN-, Karten-, Xeno-Canto-,
  Wikimedia-Commons- und iNaturalist-Anbieter aus `update.mjs`, teilt die API-Integrationstests in vier fachliche
  Dateien und schließt A8 bis A11 mit enger Pages-Positivliste, Style-/Schema-Gates und flexiblem Größenbudget.
  Phase 7 ist damit abgeschlossen; vor Phase 8 bleibt kein technischer Audit-Blocker offen.
  Ein erneuter vollständiger Abschlussaudit vor Phase 8 bestätigte am 2026-07-18 Daten-, Report-, Medien-,
  Sicherheits- und Strukturkonsistenz. Die letzten dynamischen Alternativtexte in `species-status.js`,
  `map-loader.js` und `lightbox-zoom.js` sind umgesetzt und durch einen Qualitätsvertrag abgesichert; der
  dokumentierte Squarespace-Footer verwendet dafür `species-status.js?v=1.0.9`, `map-loader.js?v=1.0.8` und
  `lightbox-zoom.js?v=1.0.7`. Pipelinefehler liegen nicht mehr als unbegrenzter Root-Log vor, sondern begrenzt unter
  `species-explorer/logs/pipeline-errors.log`; der Desktop-Startlog wird pro Start überschrieben. Die getrennten
  Status-Icon-Sätze unter `graphics/catagory/` und `graphics/catagory/Alternativ/` werden von Explorer
  beziehungsweise Squarespace benötigt und bleiben an ihren Live-Pfaden. Details:
  `docs/audits/2026-07-pre-phase-8-audit.md`.
  Die im externen Abschlusscrawl zunächst noch nicht erreichbare Gepard-Seite
  `/wildlife/namibia/acinonyxjubatus` wurde anschließend in Squarespace live geschaltet und mit HTTP 200 sowie dem
  erwarteten Artinhalt nachgeprüft. Vor Phase 8 bleibt damit auch kein externer Link-Blocker offen.
- Phase 8 - Taxonomie-Pyramide und Funktionsausbau:
  abgeschlossen am 2026-07-22. Phase-8-Änderungen entstanden über die
  nur lesende lokale Squarespace-nahe Vorschau unter `127.0.0.1:4188` in Desktop-, Tablet- und Mobilbreite geprüft.
  Danach folgen eine nicht öffentlich verlinkte Squarespace-Testseite und die ausdrückliche Freigabe durch Felix;
  erst dann sind Übernahme nach `main`, erfolgreicher Pages-Lauf und produktive Footer-`?v=`-Erhöhung erlaubt.
  Details: `docs/phase-8-preview-release.md`. Die dynamische Taxonomie-Pyramide ist im Arbeitsbranch umgesetzt:
  vollständige farbige Rang-/Wertbalken mit generischen Inline-SVGs, inhaltsabhängiger Ausgangsbreite, konstanter
  stufenweiser Verjüngung und bündig ineinandergreifender Trapezform, ohne vertikalen Zwischenraum und mit einem
  nahtlosen anthrazit-schwarzen Pfeil über die gesamte Höhe. Auf Desktop und Tablet ist die kompakte Gesamtgruppe im
  vollbreiten Rahmen zentriert; mobil nutzt die erste Stufe die verfügbare Restbreite und der größtmögliche sichere
  Verjüngungsschritt hält alle Inhalte vollständig. Rangbezeichnung und Wert teilen in jeder Zeile eine gemeinsame
  typografische Grundlinie. Desktop und Tablet verwenden denselben dezenten Zehn-Pixel-Verjüngungsschritt und
  dieselbe weiche Rundung; mobil wird dieser Schritt bei Bedarf automatisch verkleinert. Anzeigenamen beginnen mit
  einem Großbuchstaben; bekannte Rohwerte werden zentral deutsch übersetzt. Ein echter `Subphylum`-Wert wird als
  `Unterstamm` angezeigt, fehlende Werte erzeugen keine Leerzeile. Sieben und acht Stufen sind automatisiert und in
  der lokalen Vorschau ohne horizontalen Überlauf geprüft. Felix hat den lokalen Endentwurf am 2026-07-18 in allen
  drei Vorschaugrößen visuell freigegeben. Der freigegebene Stand wurde nach `main` übernommen und der erste
  Pages-Lauf war erfolgreich. `species-taxonomy.js` lädt das zugehörige Taxonomie-CSS vor dem Rendern aus demselben
  kontrollierten Pages-Artefakt; dadurch gehen Markup und Gestaltung künftig atomar live. Die dokumentierte
  Footer-Version fuer den neuen Gesamtstand ist `species-taxonomy.js?v=1.0.5`; derselbe Cache-Schluessel wird fuer
  das dynamisch geladene Artseiten-CSS verwendet. Artportraits sind seit 2026-07-18
  ebenfalls in die Squarespace-Artseite integriert: Auf grossen Bildschirmen steht die Taxonomie links, Allgemeine
  Daten mit Status/Trend darunter in der Mitte und das Portrait ohne sichtbare Ueberschrift ueber die volle Hoehe
  rechts. Die Tierstimme steht unter den beiden linken Spalten. Der Taxonomierahmen endet buendig mit Status/Trend
  und zentriert die kompakte Einheit aus Pfeil und Pyramide vertikal. Der Pfeil beginnt und endet exakt mit den
  sichtbaren Taxonomiestufen und wird nicht auf die volle Rahmenhoehe gestreckt. Einheitliche sowie nach
  Maennchen/Weibchen getrennte Groessen- und
  Gewichtswerte nutzen eine gemeinsame Wertspalte und koennen unabhaengig voneinander wachsen. Tablet und Mobil
  stapeln die Bereiche; fehlt `portrait.webp`, bleibt die zweispaltige Ansicht ohne leeren Portraitbereich bestehen.
  `species-portrait.js` erzeugt den Portraitcontainer dynamisch und ordnet den vorhandenen Soundcontainer ein,
  sodass bestehende Artseiten keine manuelle HTML-Ergaenzung brauchen. Dokumentierte Footer-Versionen sind
  `species-core.js?v=1.0.5`, `species-info.js?v=1.0.6` und `species-portrait.js?v=1.0.1`.
  Seit 2026-07-22 kann der Explorer Reich, Stamm, optionalen Unterstamm, Klasse, Ordnung und Familie kontrolliert
  korrigieren. Ein Änderungsgrund, Vorschau-Token, Quell-Hashes und lokale Sicherung sind Pflicht. Manuelle Werte
  stehen getrennt in `species-taxonomy-overrides.json`, werden nach dem automatischen Datenabruf erneut angewendet
  und können auf die zuletzt bekannten automatischen Werte zurückgesetzt werden. Gattung und Art bleiben dem
  geschützten Workflow für wissenschaftliche Namensänderungen zugeordnet. Details:
  `docs/taxonomy-edit-workflow.md`.
  Der Phase-8-Soundeditor verarbeitet bis zu 20 frei gewählte Start-/Endabschnitte in der eingegebenen Reihenfolge.
  FFmpeg erzeugt eine geprüfte MP3-Vorschau; vor der Übernahme stehen bisheriger und bearbeiteter Sound zum direkten
  Vergleich bereit. Beim Speichern bleiben Quellen- und Lizenzdaten erhalten, das bisherige Soundpaket wird
  gesichert und das Spektrogramm aus der neuen MP3 neu erzeugt. Details: `docs/sound-editor.md`.
  Ein zweiter Start der Electron-Verknüpfung öffnet keine weitere Instanz, sondern stellt das vorhandene Fenster
  wieder her, blendet es bei Bedarf ein und fokussiert es. Der Abschlussstand wird durch direkte Unit-, API-, UI-
  und Desktop-Tests sowie das vollständige Qualitätsgate abgesichert.
- Phase 9 - Globale Taxonomiedatenbank und Lightroom:
  Phase 9.1 abgeschlossen; CoL XR ist die globale Primärreferenz, WoRMS die marine Fachergänzung. Als Nächstes
  folgen lokales Datenbank-/Importkonzept, Prototyp, Aktualisierungsworkflow und Lightroom-MVP.
- Phase 10 - Mehrere Computer:
  automatische App-Aktualisierung, Identitaet, Bearbeitungssperre, Konfliktbehandlung, NAS-Restore und Installer.
- Phase 11 - Weitere Erweiterungen:
  Affiliate-Links, Shop/Kalender und rechtliche Folgepruefung. Der fruehere Kohlmeisen-Wartepunkt ist aufgehoben.
