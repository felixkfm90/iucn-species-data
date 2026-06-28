# AGENTS.md - Projektuebergabe Wildlife/IUCN Squarespace

Stand: 2026-06-28

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
- 46 aktive Arten
- 46 Arten in `speciesData.json`
- 46 Karten
- 46 Art-Assetordner
- 45 MP3-Dateien
- 45 Credits-Dateien
- 45 Spektrogramm-Dateien
- 46 Artportraets
- 0 Assetprobleme im Explorer-Modell
- 1 Soundhinweis `S`: `Gruener Leguan` hat nach vollstaendigem Pipeline-Lauf keine verwendbare automatische Tonquelle.
  Sound, Credits und Spektrogramm fehlen dort bewusst und zaehlen nicht als Assetproblem.
- 4 manuell gepflegte Karten wegen korrupter IUCN-Kartendaten:
  - `Blaukehlchen`
  - `Fischertukan`
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

Im Asset-Pruefdialog abgelehnte Soundquellen werden in `species-assets-overrides.json` unter
`sound.rejectedSources` gespeichert. `update.mjs` ueberspringt diese Xeno-Canto-, Wikimedia-Commons- oder
iNaturalist-Quelle bei spaeteren Suchlaeufen, damit ein ausdruecklich abgelehnter Sound nicht erneut vorgeschlagen
wird.

Aktuell ersetzte freie Quellen:

- `Eurasisches Eichhoernchen`: freie Xeno-Canto-Alternative
- `Fischertukan`: freie Wikimedia-Commons-/iNaturalist-Aufnahme
- `Grosstrappe`: freie Wikimedia-Commons-Aufnahme
- `Mittelamerikanischer Totenkopfaffe`: freie iNaturalist-Aufnahme, CC BY 4.0
- `Panama-Kapuzineraffe`: freie iNaturalist-Aufnahme, CC BY 4.0
- `Quetzal`: freie Quelle, nicht mehr im NC-Report

Letzter vollstaendiger Pipeline-Check: 2026-06-20.
Letzter lokaler Bereinigungs-/Report-Check: 2026-06-28.

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
  Die interne Phasenbezeichnung ist in der App ausgeblendet. Die linke Artenliste reicht dynamisch bis zur
  Unterkante des letzten Detailblocks. Je nach Detailhoehe sind unterschiedlich viele Arten gleichzeitig sichtbar;
  weitere Treffer bleiben innerhalb der Liste scrollbar. Die Desktop-Hoehe wird nach jedem Artwechsel und bei
  Fenstergroessenaenderungen explizit aus der Unterkante des letzten sichtbaren Detailblocks berechnet, damit die
  Artenliste die Grid-Zeile nicht selbst verlaengert.
  Phase 7.4 ist seit 2026-06-19 abgeschlossen und von Felix visuell geprueft: Bestehende Arten erlauben nur die
  Bearbeitung von Groesse, Gewicht und
  Lebenserwartung. Vor dem Speichern sind Validierung und Diff-Vorschau Pflicht; Vorschau-Token laufen nach zehn
  Minuten ab und werden bei parallelen Dateiaenderungen ungueltig. Vor jedem Schreiben entsteht eine ignorierte
  Sicherung unter `species-explorer/backups/`. Automatisch bleiben nur die neuesten 20 verwalteten Backups erhalten;
  fremde Dateien im Ordner werden nicht geloescht. Name, Taxonomie, neue Arten, Pipeline und Git bleiben gesperrt
  bzw. separat. Die Phase-7.4-Pruefungen sind Teil der inzwischen sechs erfolgreichen Explorer-Tests.
  Der Speichertest, die Korrektur des Testwerts und die robuste Erfolgsmeldung wurden geprueft.
  `Bearbeiten` und `Loeschen` stehen als allgemeine Artaktionen oben rechts im Detailkopf. Phase 7.7 erweitert
  diesen Einstieg spaeter um Karten-, Sound- und weitere Assetpflege. Der Bearbeitungsdialog kennzeichnet
  Taxonomie und Name als gesperrt, nennt dabei aber keine interne Phasennummer.
  Phase 7.5 ist seit 2026-06-20 abgeschlossen und durch das erneute Anlegen von Haubentaucher und Hoeckerschwan
  praktisch geprueft.
  Neue Arten werden kontrolliert nach `docs/add-species-workflow.md` angelegt. Erfasst werden
  deutscher Name, wissenschaftlicher Name, Groesse, Gewicht und Lebenserwartung. Der wissenschaftliche Name wird
  im Hintergrund in Gattung und Artepitheton getrennt und normalisiert. Duplikate, Slug-/SafeName-Kollisionen
  sowie vorhandene Assetordner werden vor einer vollstaendigen JSON-Vorschau geprueft.
  Speicherung nutzt den Backup-/Token-/Hashschutz aus 7.4. Die neue Art bleibt bis zum separaten Pipeline-Lauf
  erwartungsgemaess nur in `species_list.json`. API: `POST /api/species/new/preview` und
  `POST /api/species/new/save`. Fuer optionale Sofortportraits liefert `POST /api/species/new/portrait-prompt`
  einen Einzelprompt aus den eingegebenen neuen Artdaten. Seit 2026-06-28 ist `Neue Art` als Schrittassistent
  aufgebaut: allgemeine Daten pruefen, optionales Artportrait pruefen oder ueberspringen, Abschluss. Ungueltige
  Eingaben werden direkt am Feld markiert. Groesse und Gewicht koennen unabhaengig voneinander per Checkbox nach
  Maennchen und Weibchen getrennt werden; gespeichert werden weiterhin die vorhandenen Textfelder. Die Route
  `POST /api/species/new/portrait-preview` prueft ein optional sofort erzeugtes Portrait vor der Artanlage. Der
  lokale Server wurde mit dem neuen Stand neu gestartet; die ausgelieferte
  Oberflaeche enthaelt Aktion, Dialog und alle Pflichtfelder mit Beispieltexten. Weitere Arten koennen nach
  erfolgreichem Speichern ohne Seitenneuladen angelegt werden. Haubentaucher, Hoeckerschwan und Loewe wurden fuer
  produktive Workflow-Tests angelegt und danach am 2026-06-28 wieder entfernt und bereinigt.
  Hintergrundklicks schließen Eingabedialoge nur, wenn Zeigerdruck und Klickende beide auf dem Hintergrund liegen.
  Dadurch bleibt das Formular bei Textmarkierungen über den Dialogrand geöffnet.
  Phase 7.6 Pipeline-Steuerung nach `docs/pipeline-control-plan.md` ist seit 2026-06-20 abgeschlossen. Die App
  unterscheidet `Neue/Unvollstaendige Arten aktualisieren`, `Alle Arten vollstaendig aktualisieren`,
  `Manuelle Karten erneut suchen` und `NC- und fehlende Sounds erneut suchen`. `update.mjs`
  unterstuetzt
  `--mode=missing`, `--mode=all` und `--dry-run`; die App zeigt Vorschau, Prozessstatus und lokale Logs. Nur ein
  Lauf kann gleichzeitig aktiv sein. Nach dem Start bleibt der Dialog geöffnet und zeigt
  `Pipeline-Lauf läuft gerade`. Der Button `Abbrechen` wechselt zu `Fenster schließen`; das Schließen beendet den
  Hintergrundprozess nicht. Ein Statusbalken im Hauptfenster zeigt laufende, wartende, abgeschlossene und
  fehlgeschlagene Läufe und öffnet die Prozessdetails erneut. Nach erfolgreicher Pipeline folgt der passende
  Spektrogramm-Abgleich. Die Prozessausgabe des Spektrogramm-Abgleichs wird im Explorer als lesbare Zeilen pro Art
  angezeigt: Sound vorhanden/fehlt und Spektrogramm vorhanden/erstellt/uebersprungen statt rohem JSON.
  Neu hinzugefuegte Karten und Sounds werden danach angezeigt und je Asset als automatisch oder manuell geschuetzt
  bestaetigt. Kartenvorschauen sind dabei anklickbar und werden fuer die Qualitaetspruefung in einer grossen
  Lightbox angezeigt. Die Entscheidung steht in `species-assets-overrides.json`; Details:
  `docs/asset-review-workflow.md`. Danach werden die Pipeline-Dateien automatisch committed und gepusht.
  Beim Schliessen des Asset-Pruefdialogs werden laufende Sounds gestoppt und auf Position 0 zurueckgesetzt.
  Die beiden Wartungsläufe verarbeiten nur die aktuell vier manuell geschützten Karten beziehungsweise die drei
  NC-Sounds plus Arten mit fehlender Sounddatei. Vorhandene Dateien werden vorübergehend unter dem ignorierten Pfad
  `species-explorer/pipeline-asset-backups/` gesichert und bei Ablehnung einer Alternative wiederhergestellt.
  Wenn ein Sound im Pruefdialog ausdruecklich abgelehnt wird, speichert der Explorer die Quellkennung unter
  `sound.rejectedSources`; der naechste Sound-Suchlauf ueberspringt diese konkrete Quelle.
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
  dauerhaft mit. Ohne Checkbox bleiben diese Inhalte bis zur getrennten Bereinigung bestehen. Die Aktion
  `Bereinigen` listet verwaiste Datensaetze, Assessment-Zuordnungen, Pflegeeintraege und Assetordner auf und loescht sie nach
  genau einer Bestaetigung dauerhaft ohne Wiederherstellungsablage. Details:
  `docs/delete-species-workflow.md`. Die Bereinigung verschiebt Assetordner seit 2026-06-28 zuerst in den ignorierten
  Ordner `species-explorer/cleanup-trash/`, schreibt danach Daten und Report und loescht den verschobenen Ordner erst
  anschliessend endgueltig. Dadurch bleiben Daten, Report und Assetbestand auch bei Windows-Dateisperren konsistent.
  Der separate Phase-7.6-Seitenbereich wurde entfernt. In der Kopfzeile schaltet
  `Lesemodus 🔒` und `Bearbeitungsmodus 🔓`; Neue Art, Datenbankaktualisierung, Bearbeiten und Loeschen sind nur dort
  sichtbar. Der Modusschalter hat in beiden Zuständen dieselbe feste Breite und Position. Das klickbare Datenbankfeld
  ist bei offenen Problemen rot mit `Datenbank aktualisieren` und bei konsistentem Stand gruen mit
  `Datenbank aktuell`; der Dialog dahinter heisst `Datenbank-Aktionen` und trennt Aktualisieren,
  Backup/Einstellungen sowie Wartung in aufklappbare Gruppen. Nach dem Speichern einer neuen Art wird der selektive Lauf
  direkt angeboten und kann gestartet oder abgebrochen werden. Externe Änderungen durch `update_local.bat`,
  CLI-Aufrufe oder andere Prozesse werden über eine Dateirevision erkannt. Der Server baut sein Modell automatisch
  neu auf; die Browseroberfläche prüft alle fünf Sekunden `GET /api/revision` und lädt bei Änderungen selbstständig
  neu. Elf Explorer-Tests sind erfolgreich. Ein vollständiger externer Pipeline-Lauf und ein produktiver
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
  Pro Art bleiben hoechstens drei verwaltete Kartenbackups, global hoechstens 500 MB. Nach erfolgreichem Austausch
  folgen automatisch ein auf Karte, Register und Dokumentation begrenzter Git-Commit und Push.
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
  45 von 45 Spektrogrammen sind hashregistriert und verifiziert, 0 sind veraltet. Der manuelle Pipeline-Schutz wird
  beim Soundimport gesetzt. Danach folgen automatisch ein eng begrenzter Commit und Push. Pro Art bleiben
  hoechstens drei verwaltete Soundpaket-Backups; Karten- und Soundbackups teilen sich die globale Obergrenze von
  500 MB.
  Im Bearbeitungsmodus kann seit 2026-06-28 auch der aktuell produktive Sound abgelehnt werden. Der Explorer legt ein
  Soundpaket-Backup an, entfernt `sound.mp3`, `credits.json` und `spectrogram.webp`, merkt die Quellkennung unter
  `sound.rejectedSources`, baut den Report neu auf und published die Änderung. Der naechste Sound-Suchlauf
  ueberspringt diese konkrete Quelle.
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
  Anatomiepruefung wie zuvor Speichern, Backup, Commit und Push aus. Beim optionalen Sofortportrait einer neu
  angelegten Art fragt die App vor diesem Schritt zusaetzlich nach. Fehlende Portraets sind regulaere
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
  Details: `docs/desktop-shell-plan.md`. NAS/Backup und Mehrgeraete-Lock verschieben sich auf Phase 7.9.
  Vor Phase 7.9 wurde am 2026-06-28 ein nicht-destruktiver Projektkonsolidierungs-Audit gestartet:
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
  Die Assetformulare wurden am 2026-06-21 kompakter ausgerichtet: Karten- und MP3-Dateieingabe haben dieselbe
  intrinsische Hoehe. Der Pflegegrund spannt auf Desktop exakt ueber zwei linke Feldzeilen. Im Soundformular stehen
  Quelle neben Original-URL, Lizenz neben Land und Ort neben Qualitaet; Notizen bleiben ueber beide Spalten.
  Auf schmalen Ansichten werden alle Felder weiterhin einspaltig dargestellt.
  Phase 7.9 wurde am 2026-06-28 gestartet, siehe `docs/multi-device-backup-plan.md`. Beschlossen ist: GitHub bleibt
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
- Phase 8 - Ausbau:
  Affiliate-Links, Shop/Kalender und rechtliche Folgepruefung.
