# IUCN Species Data

Dieses Repository erzeugt und hostet Arten-Daten, Karten, Sounds und Frontend-Module fuer die Squarespace-Website
`https://www.fnwildlifetravel.de`.

GitHub Pages Base:
`https://felixkfm90.github.io/iucn-species-data/`

## Datenfluss

`species_list.json` ist die manuelle Eingabeliste. `update.mjs` nutzt daraus die Artennamen, Groesse, Gewicht und
manuell gepflegte Lebenserwartung und erzeugt bzw.
aktualisiert:

- `speciesData.json`
- `species-assets/<Artname>/map.jpg`
- `species-assets/<Artname>/sound.mp3`
- `species-assets/<Artname>/credits.json`
- `species-assets/<Artname>/spectrogram.webp`
- `fehlende_elemente_report.json`
- `lastSavedAssessmentId.json`
- `species-assets-overrides.json`

Squarespace enthaelt auf den Artseiten nur Container. Die Inhalte werden im Browser aus GitHub Pages geladen.

## Wichtige Dateien

- `AGENTS.md`: aktuelle Projektuebergabe und verbindliche Arbeitsregeln
- `species-assets-overrides.json`: maschinenlesbarer Schutz für manuell gepflegte Karten und Sounds
- `species-core.js`: gemeinsamer Datenloader, Slug-Ermittlung, Cache und Assetnamen-Sanitizer
- `species-info.js`: Info-Box fuer Name, Groesse, Gewicht, Lebenserwartung, Generationsdauer und Population
- `species-taxonomy.js`: responsive Taxonomie-Pyramide mit zentralen deutschen Anzeigenamen und optionalem
  Unterstamm
- `species-status.js`: IUCN-Status und Populationstrend
- `species-portrait.js`: optionales Artporträt mit automatischem Layout-Fallback bei fehlendem Portrait
- `species-sound.js`: native Tierstimmen-Soundbar mit vorbereitetem Spektrogramm, Canvas-Fallback, Lautstaerke,
  Abspielgeschwindigkeit, Credits und Lizenzhinweisen
- `map-loader.js`: Verbreitungskarte
- `search.js`: Suche auf Uebersichtsseiten
- `sort.js`: Sortierung der sichtbaren Listen
- `lightbox-zoom.js`: Galerie-/Lightbox-Zoom
- `scripts/monthly-site-audit.mjs`: reproduzierbarer Monatsaudit fuer Sitemap, interne Links, SEO-Grundfelder,
  GitHub-Pages-Assets und lokale Assetkonsistenz
- `scripts/generate-spectrograms.mjs`: Generator fuer optionale Tierstimmen-Spektrogramme unter
  `species-assets/<SafeName>/spectrogram.webp`
- `scripts/prepare-pages-artifact.mjs`: baut das kontrollierte GitHub-Pages-Artefakt unter `_site/`
- `scripts/check-syntax.mjs`: parserbasierter Syntaxcheck für alle versionierten JavaScript-/MJS-Quellen
- `scripts/check-source-style.mjs`: schlanke Kodierungs-, Zeilenenden-, Leerzeichen- und Tabprüfung
- `scripts/validate-data-schema.mjs`: fachliche Schema-Prüfung der zentralen JSON-Datenbestände
- `scripts/repository-size-budget.mjs`: flexibles Größenbudget und Beobachtung der lokalen Git-Packhistorie
- `scripts/pipeline-error-log.mjs`: fehlertoleranter, auf 256 KiB begrenzter Pipeline-Fehlerlog unter
  `species-explorer/logs/`
- `scripts/validate-project-state.mjs`: verbindlicher lokaler Daten-, Report-, Override- und Zuordnungscheck
- `scripts/validate-pages-artifact.mjs`: vergleicht `_site/` exakt mit der öffentlichen Dateifreigabe
- `.github/workflows/pages.yml`: eigenes GitHub-Actions-Deployment fuer GitHub Pages
- `species-explorer/`: lokale Web-App fuer Arten, Daten, Karten, Sounds, Credits, Validierung und kontrollierte
  Pflege manueller Artenfelder

## Squarespace-Integration

Versionierte Referenzen liegen unter:

- `docs/squarespace-footer.html`
- `docs/squarespace-custom.css`
- `docs/soundbar.md`
- `docs/sound-license-review.md`
- `docs/spectrogram-plan.md`
- `docs/css-layout-audit.md`
- `docs/repo-file-audit.md`
- `docs/repo-structure.md`
- `docs/asset-structure-plan.md`
- `docs/asset-management-plan.md`
- `docs/pipeline-control-plan.md`
- `docs/delete-species-workflow.md`
- `docs/asset-review-workflow.md`
- `docs/monthly-site-audit.md`
- `docs/audits/2026-06-site-audit.md`
- `docs/audits/2026-07-repository-audit.md`
- `docs/audits/2026-07-pre-phase-8-audit.md`
- `docs/audio-format-validation.md`
- `docs/media-asset-validation.md`
- `docs/explorer-api-security.md`
- `docs/ci-quality-gate.md`
- `docs/repository-quality-gates.md`
- `docs/desktop-app-plan.md`
- `docs/global-taxonomy-lightroom-plan.md`
- `docs/manual-map-overrides.md`
- `docs/manual-species-fields.md`
- `docs/add-species-workflow.md`
- `docs/seo-worklist.md`
- `docs/roadmap.md`

Dokumentation ist Teil der Definition of Done: Ein Roadmap-Schritt gilt erst als abgeschlossen, wenn `AGENTS.md`,
`README.md`, `docs/roadmap.md` und betroffene Detaildokumente aktuell sind.

Bei jeder Aenderung an einer eingebundenen JavaScript-Datei muss in Squarespace die jeweilige `?v=`-Version erhoeht
werden, damit Browser- und GitHub-Pages-Caches sicher umgangen werden.

Der Abschlussaudit vor Phase 8 hat Daten, Medien, Abhängigkeiten, Sicherheit, Ordnerstruktur, Dokumentation und
Qualitätsgates erneut geprüft. Die Squarespace-Module verwenden seit dem dokumentierten Footerstand vom
2026-07-18 dynamische Alternativtexte für Status/Trend und übernehmen vorhandene Alternativtexte in Karten- und
Galerie-Vollbilder. Details: `docs/audits/2026-07-pre-phase-8-audit.md`.

Das Squarespace Custom CSS enthaelt seit 2026-06-14 einen Mobile-only-Override fuer Grid-Galerien: Galerien mit mehr
als einer Spalte werden unter 768 px auf eine Spalte gesetzt; Desktop bleibt unveraendert.

Die Artseiten-Info-Box zeigt technische Platzhalter wie `n/a`, `U`, leere Werte und `unknown` als `Unbekannt` an,
ohne die Rohdaten in `speciesData.json` umzuschreiben.

## GitHub-Pages-Deployment

GitHub Pages wird nicht mehr aus dem kompletten Branch-Root gebaut. Das Repo nutzt ein eigenes
GitHub-Actions-Deployment unter `.github/workflows/pages.yml`.

Der Workflow erzeugt mit `npm.cmd run pages:prepare` beziehungsweise `node scripts/prepare-pages-artifact.mjs` ein
kontrolliertes `_site/`-Artefakt. Veröffentlicht werden nur die fuer Squarespace benötigten Laufzeitdateien:

- Frontend-JavaScript aus dem Repo-Root
- `speciesData.json`, `species_list.json`, `fehlende_elemente_report.json`, `lastSavedAssessmentId.json` und
  `species-assets-overrides.json`
- `species-assets/`
- freigegebene PNG-Laufzeitgrafiken unter `graphics/`
- `.nojekyll`

Repository-Dokumentation, `README.md`, lokale Sicherungen, unbekannte Assetdateien und Designquellen bleiben
außerhalb des öffentlichen Artefakts.

Vor dem Build muss der getrennte Job `Quality checks` erfolgreich sein. Er installiert den gesperrten
Abhängigkeitsstand, prüft Syntax, alle Testgruppen, Audio-/Medienformate, Daten-/Reportkonsistenz und den lokalen
Monatsaudit. Der Build prüft anschließend die öffentliche Dateifreigabe; Photoshop-Designquellen, Sicherungen und
unbekannte Assetdateien gelangen nicht in `_site/`. Details: `docs/ci-quality-gate.md`.

Die GitHub-Pages-Einstellung muss auf `Source: GitHub Actions` stehen. Falls GitHub wieder auf Branch-Deployment
zeigt, laeuft erneut der alte Standardprozess ueber `main:/` und kann beim Deploy-Schritt sporadisch fehlschlagen.
Der Pages-Workflow nutzt eine gemeinsame `pages`-Concurrency-Gruppe ohne Abbruch laufender Deployments. Kurz
hintereinander ausgelöste Veröffentlichungen werden dadurch serialisiert statt einen bereits laufenden
Pages-Deploy im Hintergrund zu überholen.

## Geschützte Phase-8-Vorschau

Phase-8-Änderungen entstehen auf einem separaten Arbeitsbranch und werden vor der Freigabe nicht nach `main`
übernommen. Eine lokale, nur lesende Squarespace-nahe Artseitenvorschau startet mit:

```powershell
npm.cmd run --silent preview:squarespace
```

Unter `http://127.0.0.1:4188/` können Art, Desktop-, Tablet- und Mobilbreite ausgewählt werden. Die Vorschau lädt
die echten Taxonomie-, CSS- und Artdaten des aktuellen Branches, verändert aber weder GitHub Pages noch Squarespace.
Der aktuelle Phase-8-Entwurf zeigt jede Taxonomiestufe als vollständigen farbigen Balken mit generischem Rangicon,
Trennlinie, deutschem Rang und Wert. Der längste einzeilige Rang-/Wertinhalt bestimmt die erforderliche
Ausgangsbreite; daraus entsteht mit einem konstanten Abstand je Stufe eine gleichmäßige diagonale Verjüngung. Die
Balken liegen platzsparend Kante an Kante. Links begleitet ein durchgehender
anthrazit-schwarzer Pfeil die sichtbaren sieben beziehungsweise acht Stufen exakt von der ersten bis zur letzten
Kante. Nur in der Mobilansicht nutzt der oberste Balken die verfügbare Restbreite vollständig; die Abstände zum
Pfeil und zum rechten Rahmen bleiben dabei gleich. Der größtmögliche gemeinsame Verjüngungsschritt, bei dem die
weiteren Inhalte vollständig bleiben, erzeugt auch dort eine klar erkennbare Schräge. Sichtbare Werte beginnen mit
einem Großbuchstaben, werden aber nicht vollständig großgeschrieben. Auf Desktop und Tablet ist die kompakte Gruppe aus Pfeil und Balken im
vollbreiten Taxonomierahmen zentriert. Rang und Wert teilen in jeder Stufe eine gemeinsame typografische Grundlinie;
Desktop und Tablet verwenden denselben dezenten Zehn-Pixel-Verjüngungsschritt und dieselbe weiche Rundung. Mobil
berechnet aus der verfügbaren Breite einen sicheren Schritt von höchstens zehn Pixeln.
Auf großen Bildschirmen bildet `#species-output` drei Spalten: die Taxonomie links, Allgemeine Daten mit
Status/Trend darunter in der Mitte und das Artporträt über die volle Höhe rechts. Die Tierstimme steht unter den
beiden linken Spalten. Der Taxonomierahmen endet bündig mit Status/Trend; die kompakte Einheit aus Pfeil und
Pyramide steht darin vertikal mittig. Der Pfeil beginnt und endet exakt mit der ersten beziehungsweise letzten
Taxonomiestufe und wächst daher nicht auf die volle Rahmenhöhe. Einheitliche und nach Männchen/Weibchen getrennte
Größen- oder Gewichtswerte verwenden dieselbe Wertspalte;
die automatische Zeilenhöhe deckt alle vier möglichen Kombinationen ab. Das Portrait braucht keine sichtbare
Überschrift. Tablet und Mobil ordnen dieselben Bereiche untereinander an. Fehlt `portrait.webp`, bleibt automatisch
die zweispaltige Ansicht ohne leeren Portraitbereich erhalten. `species-portrait.js` erzeugt seinen Container
dynamisch und ordnet den vorhandenen Soundcontainer ein; bestehende Squarespace-Artseiten brauchen daher keine
zusätzliche manuelle HTML-Änderung.
Vor Livegang folgen zusätzlich eine nicht öffentlich verlinkte Squarespace-Testseite, die ausdrückliche Freigabe
durch Felix, der erfolgreiche Pages-Lauf nach der Übernahme in `main` und erst danach die produktive
Squarespace-`?v=`-Erhöhung. Der vollständige Ablauf steht in `docs/phase-8-preview-release.md`.

Artseiten brauchen diese Container:

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

Uebersichtsseiten brauchen fuer die Suche:

```html
<div id="species-search"></div>
```

## Lokaler Update-Prozess

Voraussetzungen:

- Node.js 18 oder neuer
- `npm install`
- Environment Variable `IUCN_TOKEN`
- Environment Variable `XENO_TOKEN`

Ausfuehren:

```bash
node update.mjs
```

Weitere Modi:

```bash
node update.mjs --mode=missing --dry-run
node update.mjs --mode=missing
node update.mjs --mode=all
node update.mjs --mode=manual-maps
node update.mjs --mode=nc-sounds
node update.mjs --report-only
npm.cmd run --silent cleanup:species -- --dry-run
```

`--report-only` baut den Report nach einem Spektrogramm-Abgleich aus dem aktuellen Daten- und Assetstand neu auf,
ohne externe APIs aufzurufen.

## Monatsaudit

Vollstaendiger Live-Audit fuer Squarespace, GitHub Pages und lokale Assets:

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

Lokale Dokumentverweise lassen sich zusätzlich gezielt mit `npm.cmd run --silent check:docs` prüfen; derselbe
Check ist Bestandteil von `quality:ci`.

Der Audit-Befehl schreibt keine Datei, sondern gibt JSON aus. Zwischenergebnisse gehoeren bei Bedarf nach
`Testlauf/`; gespeicherte Monatsberichte liegen unter `docs/audits/`.

Der Sound-Teil der Pipeline bevorzugt freie Xeno-Canto-Aufnahmen. Wenn fuer einen vorhandenen NC-Sound keine freie
Xeno-Canto-Alternative gefunden wird, sucht `update.mjs` zusaetzlich nach exakt zugeordneten freien
Wikimedia-Commons-Audiodateien mit erreichbarem MP3-Transcode und danach nach freien iNaturalist-MP3-Aufnahmen.
iNaturalist-Treffer werden nur uebernommen, wenn Taxon, Lizenz und MP3-Datei passen. Erst danach bleibt ein vorhandener
NC-Sound erhalten oder wird bei neuen Arten als Fallback genutzt.

NC-Sounds werden im Frontend nicht mit einem separaten Warnhinweis markiert. Die Information bleibt intern ueber
`credits.json`, `fehlende_elemente_report.json` und `docs/sound-license-review.md` nachvollziehbar.

Tokens und API-Schluessel duerfen nicht im Repository oder Browser-JavaScript gespeichert werden.

## Arten-Explorer

Der Arten-Explorer begann in Phase 7.2 als read-only Arbeitsoberflaeche und erlaubt seit Phase 7.4 das kontrollierte
Bearbeiten ausgewaehlter Felder in `species_list.json`:

`species-explorer/server.mjs` ist dabei nur noch die Kompositions- und HTTP-Adapterwurzel. CRUD, Karten-, Sound-,
Portrait- und Assetpflege, Pipeline, Git-Veröffentlichung und NAS-Sicherung liegen in getrennten Fachmodulen.
Die zusammengesetzten API-Abläufe sind in Serverbasis, Artenabläufe, Assets sowie Bereinigung/Suche aufgeteilt;
`explorer-ui-contract.test.mjs` sichert getrennt die Oberflächen-, Modulbesitz- und Auslieferungsverträge.

```bash
npm.cmd run species:explorer
```

Danach im Browser oeffnen:

```text
http://127.0.0.1:4177
```

Der Explorer zeigt:

- alle Arten aus Eingabe und Pipeline mit Suche und Filtern; der aktuelle Umfang steht in `docs/project-status.md`
- lokal gebrandete Oberflaeche `Arten-Explorer` mit FN-Wildlife-&-Travel-Logo in der Kopfzeile
- kompaktes Validierungsdashboard fuer Eingabe/Pipeline, Assetstruktur, Report-Abgleich und besondere Pflege
- manuelle Felder aus `species_list.json`
- generierte IUCN-Daten aus `speciesData.json`
- Karte, Sound, Credits und Spektrogramm je Art
- optionales, manuell freigegebenes KI-Artportraet aus `portrait.webp` und `portrait.json`
- Karten vollstaendig im jeweiligen Originalseitenverhaeltnis
- drei gleichwertige Medienbereiche fuer Verbreitungskarte, Tierstimme und Artportraet; sobald der rechte
  Detailbereich weniger als 1320 Pixel Platz hat, stehen sie lesbar untereinander statt in drei zu engen Spalten;
  in schmalen Drittelkarten stehen Titel und die gemeinsam ausgerichtete Aktionszeile untereinander
- kompakter Tierstimmen-Player mit integriertem Spektrogramm, Play/Pause, Zeit, Lautstaerke, Scrubbing,
  Positionsmarker und standardmaessig sichtbaren Quellen-/Lizenzdaten
- Klick ins Spektrogramm setzt die Position und startet die Wiedergabe sofort an dieser Stelle
- IUCN-Abrufdatum im Kopf der Detailansicht sowie grafische IUCN-Status- und Trendsymbole im Artkopf, in der linken
  Artenliste und in den IUCN-Daten
- deutsche Statusbezeichnungen mit IUCN-Kuerzel im Statusfilter
- manuell hinzugefuegte Assets direkt in der jeweiligen Assetzeile gekennzeichnet
- Pipeline-Steuerung fuer neue/fehlende Arten oder einen vollstaendigen Lauf
- gezielten Kartensuchlauf fuer jede einzelne Art sowie global fuer manuell gepflegte und fehlende Karten
- `Art aktualisieren` je Art mit kurzem Bestätigungsdialog; der Lauf startet danach direkt im Hintergrund, ohne den
  allgemeinen Datenbank-Aktionen-Dialog zu öffnen
- gezielten Suchlauf nur fuer NC-Sounds und fehlende Sounds
- separaten permanenten Bereinigungslauf fuer geloeschte Arten und verwaiste Assetordner
- roten Kopfstatus `Änderungen übertragen`, wenn manuelle Eingaben von der Pipeline-Ausgabe abweichen oder lokale
  Assetaenderungen auf Veröffentlichung warten; ein Klick überträgt diese Änderungen ohne Karten- oder Soundsuche.
  Dieser Übertragungsbutton bleibt auch im Lesemodus sichtbar, damit offene Änderungen vor dem Beenden
  veröffentlicht werden können.
- getrennte Filter fuer Datenabweichungen, Assetprobleme und alle Validierungshinweise
- aktuelle NC-Sounds und manuell gepflegte Karten aus dem automatisch erzeugten Projektstatus
- fehlende oder inkonsistente Daten und Assets
- Bearbeiten von Groesse, Gewicht und Lebenserwartung bestehender Arten
- kontrolliertes Ersetzen einer Verbreitungskarte mit JPEG-/PNG-Upload, automatischer PNG-zu-JPEG-Konvertierung,
  alternativem direktem JPEG-Link, Alt-/Neu-Vorschau, Pflegegrund und optionaler Quelle, lokalem Backup und
  manuellem Pipeline-Schutz; die Veröffentlichung erfolgt gesammelt über `Änderungen übertragen`
- serverseitige Validierung, Diff-Vorschau und explizite Speicherbestaetigung
- automatische lokale Sicherung vor jedem Schreibvorgang

Beim Wechsel zwischen Arten bleibt die aktuelle Fenster- und Listenposition erhalten.

Der Server bindet nur an `127.0.0.1`. Schreibzugriffe laufen ueber definierte Vorschau-/Speicher- und
Prozessrouten mit Token-, Hash- und Backup-Schutz. Pipeline-, Backup- und Git-Aktionen werden nur ueber die
Explorer-Oberflaeche beziehungsweise dokumentierte Skripte gestartet. Nicht freigegebene Schreibzugriffe werden mit
`405` abgewiesen.
Wenn `npm.cmd run species:explorer` gestartet wird, waehrend bereits ein Explorer auf demselben Port laeuft, erscheint
seit 2026-06-27 eine verstaendliche Meldung mit der bestehenden URL statt eines rohen `EADDRINUSE`-Stacktraces.
Audio- und andere Assetdateien unterstuetzen HTTP-Byte-Ranges (`206 Partial Content`), damit der Browser beim Klick
ins Spektrogramm zu einer beliebigen Wiedergabeposition springen und dort starten kann.

Phase 7.3 erweitert den Explorer um `GET /api/validation`. Geprueft werden:

- Artenbestand und uebernommene manuelle Felder zwischen `species_list.json` und `speciesData.json`
- Vollstaendigkeit von Karte, Sound, Credits und Spektrogramm je Art
- Listen und Zaehler aus `fehlende_elemente_report.json` gegen den tatsaechlichen Daten-/Assetstand
- NC-Soundlizenzen aus `credits.json` gegen den Report

Abschlussstand von Phase 7.3 am 2026-06-19: 45 von 45 Datenpaare stimmten ueberein, 45 Assetpakete waren vollstaendig
und neun Reportpruefungen konsistent. Nach dem Anlegen des Haubentauchers zeigt der Explorer erwartungsgemaess
46 Eingabeeintraege, 45 Pipeline-Eintraege, eine input-only Art und ein noch fehlendes Assetpaket. Der alte Report
kann diesen neuen Eintrag erst nach dem Pipeline-Lauf enthalten. Der IUCN-Trend `Unbekannt` ist ein gueltiger
Datenwert und wird nicht als fehlendes Feld behandelt. Status- und Hinweis-Dropdowns sind alphabetisch nach den
sichtbaren deutschen Bezeichnungen sortiert. Phase 7.3 wurde am 2026-06-19 visuell geprueft.
Die App zeigt dabei keine interne Phasenbezeichnung. Kopfbereich, Zusammenfassung und Validierungsstatus bleiben
im Desktopfenster sichtbar. Darunter scrollen die linke Artenliste und der rechte Detailbereich getrennt. Beim
Artwechsel springt nur der rechte Detailbereich wieder an den Anfang; die Scrollposition der linken Artenliste
bleibt erhalten.

Phase 7.4 stellt je Art einen Bearbeiten-Dialog bereit. `Löschen` steht im Artkopf oben rechts. `Bearbeiten` steht
direkt an den bearbeitbaren Bereichen `Manuelle Daten`, `Artporträt`, `Verbreitungskarte` und `Tierstimme`; der
Dialog öffnet jeweils nur den gewählten Bereich, damit nicht alle Pflegefelder gleichzeitig sichtbar sind:

- editierbar: deutscher Name, wissenschaftlicher Name nach bewusster Schlossfreigabe, `size`, `weight` und
  `life_expectancy`
- Groesse, Gewicht und Lebenserwartung verwenden dieselben Wert-/Einheitenfelder wie der Neue-Art-Assistent;
  Groesse und Gewicht lassen sich unabhaengig nach Maennchen und Weibchen trennen
- gesperrt bleiben alle automatisch generierten IUCN-Felder und die Taxonomiestufen ausser dem bewusst
  freigegebenen wissenschaftlichen Namen
- `POST /api/species/<Slug>/preview`: validiert und erzeugt eine zehn Minuten gueltige Diff-Vorschau
- `POST /api/species/<Slug>/save`: akzeptiert nur ein gueltiges Vorschau-Token
- parallele Aenderungen an `species_list.json` machen die Vorschau ungueltig
- Sicherungen werden vor dem Schreiben unter `species-explorer/backups/` angelegt und durch `.gitignore` nicht
  versioniert
- nach jedem erfolgreichen Speichern bleiben automatisch nur die neuesten 20 verwalteten Backups erhalten; andere
  Dateien im Ordner werden nicht geloescht
- nach dem Speichern zeigt das Dashboard erwartete Datenabweichungen, bis `node update.mjs` separat ausgefuehrt wurde
- der wissenschaftliche Name ist per Schloss geschuetzt; die Warnbestaetigung nennt die direkte Auswirkung auf den
  URL-Slug und die Website

Phase 7.5 zum kontrollierten Anlegen neuer Arten ist seit 2026-06-19 technisch lokal umgesetzt und seit
2026-06-28 als Schrittassistent erweitert:

- `Neue Art` oeffnet ein Formular fuer deutschen Namen, wissenschaftlichen Namen, Groesse, Gewicht und
  Lebenserwartung. Die Zahlenfelder erfassen nur den Wert oder Bereich, zum Beispiel `140-250`; `ca.` und die
  ausgewaehlte Einheit werden automatisch in den gespeicherten Text geschrieben.
- Der wissenschaftliche Name wird als ein Feld eingegeben, zum Beispiel `Turdus Merula`, und intern in
  `genus: Turdus` und `species: merula` getrennt.
- Groesse und Gewicht koennen je ueber eine eigene Checkbox nach Maennchen und Weibchen getrennt werden. Die
  Einheiten sind auswählbar: Groesse `mm/cm/m`, Gewicht `g/kg/t`, Lebenserwartung `Tage/Monate/Jahre`.
  Bei `1` wird die Lebenserwartung automatisch als `1 Tag`, `1 Monat` oder `1 Jahr` gespeichert.
- Schritt 1 prueft allgemeine Daten; ungueltige Felder werden rot markiert und erhalten eine direkte Fehlermeldung.
- Schritt 2 erzeugt optional einen Portrait-Einzelprompt, kopiert ihn, prueft ein extern erzeugtes Bild oder markiert
  das Portrait bewusst als uebersprungen. Erst `Nächster Schritt` legt die Art an.
- Mit `Nächster Schritt` nach Schritt 2 wird die Art angelegt und der gezielte Pipeline-Lauf fuer genau diese Art
  direkt im Neue-Art-Fenster gestartet. Das Datenbank-Aktionen-Fenster wird dabei nicht geöffnet.
- Bereits erreichte Schritte koennen im Assistenten wieder angeklickt werden, um die Eingaben oder Pruefansichten zu
  kontrollieren.
- Schritt 3 zeigt den Suchlauf und die Kartenprüfung. Eine gefundene Karte kann übernommen oder übersprungen werden.
- Schritt 4 zeigt den Sound mit Spektrogramm; ein Klick ins Spektrogramm springt im Audioplayer an die gewählte
  Stelle.
- Wird ein neu gefundener Sound abgelehnt, merkt die App die Quelle und startet automatisch die nächste gezielte
  Soundsuche fuer dieselbe Art, bis ein Sound akzeptiert wird oder keine taugliche Quelle mehr gefunden wird.
- `POST /api/species/new/preview` prueft Pflichtfelder, Schreibweise, wissenschaftlichen und deutschen Namen, Slug,
  `SafeName` sowie bereits vorhandene Assetordner.
- Die Vorschau zeigt den vollstaendigen Eintrag, wissenschaftlichen Namen, Slug und erwarteten Assetordner.
- `POST /api/species/new/save` verwendet ein einmaliges Vorschau-Token, SHA-256-Dateischutz, Backup-Retention und
  atomares Schreiben.
- Nach dem Anlegen startet der gezielte Pipeline-Lauf im Neue-Art-Fenster. Bis dieser Lauf abgeschlossen ist, kann
  die Art kurzzeitig nur in `species_list.json` vorhanden sein.
- Nach erfolgreichem Speichern koennen ohne Seitenneuladen weitere Arten angelegt werden.
- Text kann in Eingabefeldern über den Dialogrand hinaus markiert werden, ohne dass der Dialog schließt oder die
  Eingaben verloren gehen.
- Vor der Anlage schliesst `X`/`Abbrechen` den Dialog ohne Speicherung und verwirft die Eingaben.
- 24 Explorer-Tests sind erfolgreich; die echte Artenliste bleibt bei den Schreibtests unveraendert.
- Die Bedienung wurde mit Haubentaucher und Höckerschwan praktisch geprüft.

Den aktuellen Arten- und Assetumfang erzeugt `npm run status:sync` unter `docs/project-status.md`.

Phase 7.6 ist technisch lokal vorbereitet:

- `node update.mjs --mode=missing --dry-run`: Auswahl neuer oder fehlender Arten ohne Schreibzugriff
- `node update.mjs --mode=missing`: gezielter Lauf; übrige Bestandsdaten bleiben erhalten
- `node update.mjs --mode=all` oder weiterhin `node update.mjs`: vollständiger Lauf
- `node update.mjs --mode=manual-maps`: manuell geschützte und fehlende Karten erneut suchen
- `node update.mjs --mode=nc-sounds`: NC-Sounds auf freie Alternativen prüfen und fehlende Sounds erneut suchen
- App-Vorschau und ausdrückliche Startbestätigung
- nur ein Prozess gleichzeitig, Statusanzeige und lokale Logs unter `species-explorer/logs/`
- nach dem Start bleibt der Dialog geöffnet und meldet `Pipeline-Lauf läuft gerade`; `Fenster schließen` schließt nur
  die Anzeige, während der Lauf im Hintergrund weiterläuft
- abgeschlossene Pipeline- und Wartungsläufe beenden den Node-Prozess nach geleertem stdout/stderr explizit, damit
  die App nicht nach der letzten Erfolgsausgabe im laufenden Status hängen bleibt
- ein Statusbalken im Hauptfenster zeigt laufend, wartend, abgeschlossen oder fehlgeschlagen und öffnet bei Bedarf
  wieder die Prozessdetails
- nach erfolgreicher Pipeline passender Spektrogramm-Abgleich
- Artansicht kann einen Eintrag nach Vorschau und Backup aus `species_list.json` entfernen
- im Löschdialog können die zugehörigen generierten Daten und Assets per Checkbox sofort dauerhaft mitgelöscht werden
- bei aktivierter Sofortlöschung bereinigt der Explorer zuerst generierte Daten und Assetordner; erst danach wird
  `species_list.json` geändert. Sperrt Windows eine Assetdatei, bleibt die Art vollständig in der Eingabeliste.
- bereits teilbereinigte Arten, die nur noch in generierten Daten oder Assetordnern hängen, können direkt über den
  Löschdialog vollständig bereinigt werden; vor dem Löschen entlädt die App die Detailmedien, um Windows-Dateisperren
  auf Karte, Portrait oder Sound zu vermeiden, und wartet bei Sofortlöschung kurz auf die Freigabe der Handles
- `Bereinigen` löscht nach einer einzigen klaren Bestätigung verwaiste Daten und Assetordner dauerhaft und ohne
  Wiederherstellungsablage
- die Bereinigung verschiebt verwaiste Assetordner zuerst nach `species-explorer/cleanup-trash/`, schreibt danach
  Daten und Report und löscht erst anschließend endgültig; kurze Windows-Dateisperren beim Verschieben werden
  mehrfach erneut versucht und danach per kontrolliertem Kopieren/Original-Löschen abgefangen
- beim Neue-Art-Assistenten kann Schritt `Karte` eine fehlende automatische Karte direkt per sichtbarem
  Backblaze-/IUCN-JPEG-Link prüfen und übernehmen, ohne in den allgemeinen Bearbeitungsdialog zu wechseln
- IUCN-API-Kartenlinks werden im Kartenimport ebenfalls über den Windows-WebRequest-Fallback geprüft; temporäre
  IUCN-/Backblaze-Fehler werden mehrfach versucht, bevor der manuelle Kartenweg angezeigt wird
- nach einem manuellen Kartenimport wird der Report sofort neu aufgebaut und zusammen mit Karte, Register und
  Dokumentation veröffentlicht
- vor Sound-Alternativläufen werden die Explorer-Audioplayer technisch entladen und kurz freigegeben, damit Windows
  die produktive MP3 nicht wegen einer pausierten Vorschau weiter sperrt
- nach erfolgreichem Lauf werden die Pipeline-Dateien automatisch committed und gepusht
- neue Karten und Sounds werden vor dem Commit angezeigt; je Asset wird automatische oder manuell geschützte Pflege
  bestätigt; Kartenvorschauen sind für die Qualitätsprüfung als große Lightbox anklickbar
- abgelehnte Soundquellen werden im Override-Register gespeichert und bei späteren Suchläufen übersprungen
- manuelle Karten, NC-Sounds und fehlende Sounds können unabhängig vom Komplettlauf erneut gesucht werden; bisherige Dateien bleiben
  bis zur Übernahmeentscheidung lokal gesichert
- beim Schließen des Asset-Prüfdialogs werden laufende Prüfsounds sofort gestoppt
- die Zwischenmeldung direkt nach dem Anlegen einer Art verschwindet nach erfolgreichem Pipeline-Push
- die Kopfzeile schaltet zwischen `Lesemodus 🔒` und `Bearbeitungsmodus 🔓`; Schreibaktionen werden entsprechend
  aus- beziehungsweise eingeblendet
- das klickbare Datenbank-Feld in der Kopfzeile zeigt rot `Änderungen übertragen` oder grün `Datenbank aktuell`
- bei offenen Abweichungen oeffnet dieses Feld direkt den Übertragungslauf; dieser verarbeitet nur geaenderte
  manuelle Eingabefelder und startet keine Karten- oder Soundsuche
- nach stillen Karten- oder Soundläufen im offenen Bearbeitungsdialog werden Kopfstatus, Validierung und offene
  Git-Änderungen sofort neu gelesen, ohne den Dialog zu schließen
- der Dialog dahinter heißt `Datenbank-Aktionen` und gruppiert Aktualisieren, Backup/Einstellungen und Wartung
- Datenbank-Aktionen laufen exklusiv: während Pipeline, Assetprüfung, Transfer, Bereinigung oder NAS-Backup aktiv
  ist, blockiert der Server weitere Datenbank-Aktionen mit verständlicher Meldung
- die Laufart heißt `Neue/Unvollständige Arten aktualisieren`
- nach dem Speichern einer neuen Art wird der selektive Lauf sofort angeboten; Abbrechen lässt ihn für später offen
- externe Änderungen durch Batch-Dateien oder manuelle Pipeline-Aufrufe werden automatisch erkannt; die geöffnete
  App prüft den Projektstand alle fünf Sekunden und lädt die Anzeige bei Änderungen neu

Details:

- `docs/pipeline-control-plan.md`
- `docs/delete-species-workflow.md`
- `docs/asset-review-workflow.md`

Tests:

```bash
npm.cmd run --silent test:explorer
npm.cmd run --silent test:security
```

Phase 7.7.2 Kartenverwaltung ist seit 2026-06-20 umgesetzt. Produktive Kartenimporte werden erst
nach Vorschau bestätigt. Unterstützt werden JPEG-Dateien bis 20 MB oder direkte signierte JPEG-Links, z. B. ein im
Browser geöffneter IUCN-/Backblaze-Kartenlink. Die App lädt die URL serverseitig, prüft Signatur, Struktur,
Abmessungen, Quelle und Pflegegrund. Bestehende Karten werden unter `species-explorer/asset-backups/` gesichert. Pro
Art und Assettyp bleibt genau die letzte verwaltete Sicherung erhalten; ein erneutes Löschen oder Ersetzen
überschreibt diese Sicherung. Nach erfolgreichem Austausch bleiben
Karte, `species-assets-overrides.json`, `docs/manual-map-overrides.md` und Report lokal vorgemerkt; veröffentlicht
werden sie gesammelt über `Änderungen übertragen`.
Im Bearbeitungsdialog kann per `Automatisch suchen` für jede vorhandene Art ein gezielter Kartensuchlauf gestartet
werden, unabhängig davon, ob die Karte bisher automatisch gepflegt, manuell geschützt oder fehlend ist. Der Lauf
startet im Hintergrund, ohne den Bearbeitungsdialog oder die Desktop-App zu schließen. Wenn die Pipeline eine Karte
speichert, zeigt der Explorer sie auch dann als prüfbare automatische Alternative an, wenn die Bilddatei bytegleich
zur bisherigen manuell gepflegten Karte ist; dadurch kann die Pflegeentscheidung wieder auf automatische Pflege
zurückgestellt werden. Bei gezielten Kartenläufen zeigt der Prüfdialog die bisherige und die gefundene Karte
nebeneinander; beide Karten können einzeln vergrößert werden.
Seit 2026-07-02 versucht der automatische Kartenabruf zuerst den bisherigen IUCN-Web-Endpunkt mit browsernahen
Headern, danach den offiziellen IUCN-API-Host mit Token und zusätzlich signierte Backblaze-Links, die in Redirect-,
HTML- oder Fehlerantworten als `cached-individual-maps`-URL enthalten sind. Wenn Node lokal HTTP 403 erhält, nutzt
die Pipeline unter Windows zusätzlich `Invoke-WebRequest` als WebRequest-Fallback, weil derselbe IUCN-Endpunkt dort
die JPEG-Karte ausliefert. Seit 2026-07-10 wird dieser Fallback bei temporären IUCN-/Backblaze-Fehlern wiederholt.
Der Kartenimport kann IUCN-API-Kartenlinks ebenfalls direkt über diesen Fallback prüfen. Wenn IUCN lokal weiterhin
keinen direkt speicherbaren Link liefert, kann der im Browser sichtbare signierte Backblaze-JPEG-Link im Kartenimport
als Quellen-URL eingefügt und geprüft
werden. Beim Datei-Upload akzeptiert der Kartenimport JPEG und PNG; PNG wird serverseitig nach JPEG konvertiert und
weiterhin als `map.jpg` gespeichert. Eine Quellen-URL ist nur beim Linkimport Pflicht.
Seit 2026-07-01 bietet der Bearbeitungsdialog dafür direkt `IUCN-Karte im Browser öffnen`; ein versteckter
Electron-/Chromium-Fallback wird nicht genutzt, weil Headless-Browserprozesse auf dem Zielsystem mit
Anwendungsfehlern abbrechen können.

Priorisierte Bedienungs- und Ausbauschritte:

1. Einzelne Assets einer Art gezielt entfernen, ohne die ganze Art zu löschen: seit 2026-07-04 umgesetzt.
2. Deutschen und wissenschaftlichen Artnamen umbenennen: seit 2026-07-05 umgesetzt. Der wissenschaftliche Name ist
   per Schloss geschützt; nach Warnbestätigung kann er geändert werden. Dabei ändern sich URL-Slug, Genus/Species
   und lokale Metadaten konsistent. Beim deutschen Namen wandern Assetname/SafeName, Assetordner, Override-Einträge,
   Assessment-Zuordnung, Report und Kartendokumentation mit. Details: `docs/rename-species-workflow.md`.
3. Allgemeine Daten im Bearbeitungsdialog analog zum Neue-Art-Assistenten in strukturierte Felder für
   Männchen/Weibchen, Wert und Einheit aufteilen: seit 2026-07-11 umgesetzt.
4. Taxonomie-Pyramide mit deutschen Anzeigenamen und neuer responsiver Darstellung: lokal in Desktop-, Tablet- und
   Mobilbreite freigegeben und nach `main` übernommen. Der Unterstamm wird nur bei einem echten vorhandenen
   Datenwert angezeigt; es gibt keine pauschale oder aus anderen Rängen abgeleitete Ersatzstufe. Das Modul lädt sein
   freigegebenes CSS aus demselben Pages-Artefakt, damit Markup und Darstellung gemeinsam veröffentlicht werden.
5. Artportrait auf der Squarespace-Artseite einbinden: seit 2026-07-18 umgesetzt. Auf Desktop steht es rechts neben
   der Taxonomie; Status und Trend stehen links direkt unter den allgemeinen Daten. Tablet und Mobil stapeln die
   Bereiche, bei fehlendem Portrait greift ein Layout-Fallback ohne Leerfläche.

Seit 2026-07-04 umgesetzt: Im Neue-Art-Schritt `Karte` ist die gefundene oder manuell geprüfte Karte vergrößerbar.
Im Neue-Art-Sound-Prüfschritt und im Tierstimmen-Quellenbereich wird der Lizenzstatus `frei` oder `NC` sichtbar
angezeigt. Während des Neue-Art-Assistenten wird der Detailbereich im Hintergrund erst nach Abschluss neu gerendert,
damit die Artseite hinter dem Dialog nicht springt.

Seit 2026-07-05 umgesetzt und seit 2026-07-10 erweitert: Verbreitungskarte, Soundpaket (`sound.mp3`,
`credits.json`, `spectrogram.webp`) und Artportrait (`portrait.webp`, `portrait.json`) können direkt in der
jeweiligen Asset-Kopfzeile der Artseite einzeln gelöscht werden. Vor dem Löschen wird lokal unter
`species-explorer/asset-backups/<SafeName>/<Assettyp>/` mit den Originaldateinamen und `backup.json` gesichert. Pro
Art und Assettyp bleibt nur diese letzte Sicherung erhalten. Ist eine Sicherung vorhanden, bietet die Kopfzeile
`Wiederherstellen`; ohne Sicherung ist der Button deaktiviert. Wiederhergestellte Assets bleiben lokal vorgemerkt
und werden zusammen mit anderen offenen Änderungen über `Änderungen übertragen` veröffentlicht. Beim Artportrait-
Import kann eine geprüfte Vorschau außerdem verworfen werden, ohne das bisherige Portrait zu ersetzen.

Phase 7.7.3 Sound-/Credits-Verwaltung ist seit 2026-06-20 umgesetzt. MP3-Dateien bis 50 MB werden
nur zusammen mit vollständigen Kerncredits und einem Pflegegrund akzeptiert. Die Vorschau stellt bisherigen und
neuen Sound gegenüber, liest die Dauer im Browser und zeigt Quelle, Lizenz sowie einen NC-Hinweis. Vor dem Austausch
werden `sound.mp3`, `credits.json` und `spectrogram.webp` gemeinsam gesichert. Das alte Spektrogramm wird danach
zusammen mit Sound und Credits ersetzt; Sound und Credits erhalten manuellen Pipeline-Schutz. Der erfolgreiche
Austausch bleibt lokal vorgemerkt und wird zusammen mit anderen offenen Explorer-Änderungen über
`Änderungen übertragen` committed und gepusht. Die gemeinsame
Backup-Retention beträgt genau eine letzte Version je Art und Assettyp sowie 500 MB global.
Im selben Bearbeitungsdialog kann der aktuell produktive Sound abgelehnt werden. Dann sichert die App das
Soundpaket, entfernt Sound, Credits und Spektrogramm, merkt die Quellkennung unter `sound.rejectedSources`, baut den
Report neu auf und merkt die Änderung lokal für `Änderungen übertragen` vor. Spaetere Sound-Suchlaeufe schlagen dieselbe Quelle nicht erneut vor.
Bereits abgelehnte Quellkennungen bleiben auch dann erhalten, wenn später ein neuer Sound übernommen wird.
Fehlende, NC-Sounds oder bewusst angestoßene Alternativsuchen fuer bereits vorhandene akzeptierte Sounds koennen
gezielt fuer die aktuelle Art gestartet werden. Bei vorhandenem Sound zeigt der Bearbeitungsdialog den aktuellen
Sound direkt abspielbar an. Neu gefundene Sounds werden im strukturierten Review dem bisherigen Sound
gegenuebergestellt, mit Spektrogramm und eindeutiger Kennzeichnung `NC` oder `frei`; Klick ins Spektrogramm springt
im jeweiligen Audioplayer an die gewaehlte Stelle. Sobald ein Player gestartet wird, werden andere offene Player
gestoppt und auf den Anfang zurückgesetzt, damit beim Vergleich nicht zwei Sounds parallel laufen. Der Lauf startet im Hintergrund, ohne den Bearbeitungsdialog oder
die Desktop-App zu schließen. Der gezielte Alternativlauf ueberspringt die aktuell gespeicherte Quelle temporaer,
damit nicht derselbe Kandidat erneut vorgeschlagen wird. Wenn kein anderer freier Treffer gefunden wird, prüft der
gezielte Lauf zusätzlich die bisherigen Xeno-Canto-Fallback-Stufen, damit auch bewusst akzeptierte NC-Alternativen
als Kandidaten angezeigt werden können.
Wenn ein gefundener Kandidat wegen Download-, Format- oder Transcode-Problemen nicht übernommen werden kann, prüft
die Pipeline weitere Kandidaten. Eine Windows-Dateisperre auf der produktiven MP3 wird gesondert gemeldet; vor dem
gezielten Alternativlauf entlädt der Bearbeitungsdialog den aktuellen Player, um solche Sperren zu vermeiden. Nach
einem stillen Alternativlauf bleibt der Tierstimmen-Bearbeitungsdialog offen und befüllt aktuellen Sound und Credits
aus dem neu geladenen Modell. Wird eine gefundene Alternative abgelehnt, bleibt auch der Sound-Prüfdialog offen,
zeigt den nächsten Suchlauf an und rendert den nächsten Kandidaten im selben Dialog. Die Detailansicht hängt bei
Sound, Spektrogramm, Karte und Portrait eine Asset-Version aus Hash, Dateigröße oder Metadaten an die lokale URL,
damit nach schnellen Assetwechseln kein altes Spektrogramm neben einem neuen Sound aus dem Browsercache erscheint.

Phase 7.7.4 Spektrogramm-Konsistenz ist seit 2026-06-20 technisch umgesetzt. Vor dem Speichern eines neuen Sounds
erzeugt die App automatisch ein neues WebP mit denselben FFmpeg-Parametern wie der Kommandozeilen-Generator.
Schlägt FFmpeg oder die WebP-Prüfung fehl, werden keine Produktivdateien verändert. Sound-SHA-256 und
Spektrogramm-SHA-256 werden in `species-assets-overrides.json` gespeichert und bei jedem Modellauf gegen die
aktuellen Dateien geprüft. Der vorhandene Bestand wurde ohne Neurendering registriert: 46 von 46 vorhandenen
Spektrogrammen sind verifiziert, keines ist veraltet. Unveränderte Generatorläufe erzeugen keine erneuten
Registeränderungen.
24 Explorer-Tests sind erfolgreich. Phase 7.7 wurde am 2026-06-21 nach technischer Prüfung, produktivem
Portraitimport und visueller Freigabe der Asset- und Detailoberfläche abgeschlossen. Ein unnötiger produktiver
Austausch eines bereits gültigen Sounds ist kein verbleibendes Abschlusskriterium.

Die Karten- und Soundformulare verwenden auf Desktop feste Grid-Bereiche. Dateieingaben sind gleich hoch, der
Pflegegrund reicht jeweils von der Oberkante der ersten bis zur Unterkante der zweiten linken Feldzeile. Im
Soundformular sind Quelle, Lizenz und Ort dadurch mit Original-URL, Land und Qualität ausgerichtet. Mobile Ansichten
bleiben einspaltig.

Neue Arten werden nicht automatisch vorgeschlagen. Ausgewaehlte Arten koennen kontrolliert ueber den Explorer in
`species_list.json` angelegt werden; der genaue Ablauf ist in `docs/add-species-workflow.md` dokumentiert.

SEO- und KI-Findbarkeit werden in `docs/seo-worklist.md` gepflegt. Die Datei basiert auf einem Live-Sitemap-Audit und
enthaelt je URL den aktuellen SEO-Titel, die aktuelle Meta-Beschreibung, einen konsistenten Vorschlag und einen Status.
Beim Live-Audit vom 2026-05-30 passen alle per Sitemap auffindbaren Wildlife-Artseiten. Offene SEO-Restpunkte sind in
der Worklist markiert. Der fruehere Sonderstatus der `Kohlmeise` ist aufgehoben; die Art wird wie alle anderen Arten
in den regulaeren Live-Audits behandelt. Die Costa-Rica-Uebersicht, Graureiher-Artseite und korrigierte Griechenland-Verlinkung wurden am 2026-06-01
live nachgeprueft und passen. Am 2026-06-14 wurde ein Vollcrawl der internen Links durchgefuehrt; der gefundene
Capri-Linkfehler wurde von Felix korrigiert und live nachgeprueft. Details stehen in `docs/seo-worklist.md`.
Bild-Alt-Texte und optionale Bildtitel wurden in `docs/image-alt-audit.md` auditiert. Nachpruefung vom 2026-06-15:
Die sichtbaren Artseiten-Galeriebeschreibungen sind offenbar entfernt, die echten HTML-`alt`-Attribute enthalten live
aber weiterhin auf allen 44 aktiven Artseiten Dateinamen.
Felix hat die Artseiten am 2026-06-15 manuell visuell geprueft und sieht keinen Galerietext mehr. Fuer die sichtbare
Website-Darstellung gilt das Thema damit als erledigt. Reiseseiten-Galerietexte sind bewusst gesetzt und bleiben
bestehen; technische Dateinamen-Alt-Texte werden fuer den aktuellen Stand akzeptiert. Artseiten- und Reiseseiten-
Alt-Texte gelten damit als erledigt.

Temporare Arbeitsdateien gehoeren in `Testlauf/`. Der Ordner ist ignoriert und wird nach Abschluss eines Themas wieder
geleert.

Lokale Batch-Dateien:

- `update_local.bat`: startet den Suchlauf, aktualisiert Spektrogramme und ruft danach den GitHub-Push-Workflow mit
  `--no-pause` auf
- `update_github_only.bat`: pusht aktuelle Projektdateien ohne Token in der Remote-URL

Beim manuellen Start per Doppelklick starten die Batch-Dateien zuerst ein dauerhaftes Konsolenfenster und fuehren sich
darin mit `--run` erneut aus. Die komplette Ausgabe bleibt dadurch sichtbar. Zum Schliessen das Fenster schliessen oder
`exit` eingeben. Der Parameter `--no-pause` wird nur intern genutzt, damit `update_local.bat` beim Aufruf von
`update_github_only.bat` kein zweites Fenster oeffnet. Diese Batch-Dateien sind lokal ignoriert und nicht Teil des
GitHub-Pages-Deployments.
Die JSON-Ausgabe des Spektrogramm-Generators wird im Erfolgslauf nicht angezeigt. Bei Fehlern wird die Detailausgabe
aus `Testlauf/spectrogram-update.log` ins Fenster geschrieben. Der Arten-Explorer übersetzt den Spektrogramm-Abgleich
im Prozessdialog in kurze Zeilen pro Art: Sound vorhanden/fehlt und Spektrogramm vorhanden/erstellt/uebersprungen.
Innerhalb der Windows-Batch-Datei wird `npm.cmd` mit `call` gestartet, damit der Ablauf danach mit Erfolgsmeldung,
Commit und Push fortgesetzt wird.

Die Asset-Struktur wurde in Phase 6.8 umgesetzt; Details stehen in `docs/asset-structure-plan.md`.
`species-assets/<SafeName>/` mit `map.jpg`, `sound.mp3`, `credits.json`, `spectrogram.webp` sowie
`portrait.webp` und `portrait.json` ist die einzige produktive Struktur. Noch fehlende Portraitdateien gelten im
Arten-Explorer als Assetproblem. Die alten Ordner
`Verbreitungskarten/` und `sounds/` wurden am 2026-06-17 entfernt. Nach
GitHub-Pages-Deploy und Live-Test sind für den bisherigen Stand im Squarespace-Footer `species-core.js?v=1.0.4`,
`map-loader.js?v=1.0.7` und `species-sound.js?v=1.0.22` bestaetigt.
Für das Phase-8-Artseitenlayout sind `species-core.js?v=1.0.5`, `species-info.js?v=1.0.6`,
`species-taxonomy.js?v=1.0.5` und `species-portrait.js?v=1.0.1` dokumentiert; diese Versionen werden erst nach
erfolgreichem Pages-Deployment im produktiven Squarespace-Footer aktiviert. Die Taxonomie-Version erneuert zugleich
den Cache-Schlüssel des dynamisch geladenen Artseiten-CSS.

Manuell gepflegte Karten werden in `docs/manual-map-overrides.md` dokumentiert. Die aktuell geschützten Karten stehen
automatisch erzeugt in `docs/project-status.md`; frühere Übernahmen und Statuswechsel bleiben in den datierten
Verlaufsdokumenten nachvollziehbar.

Spektrogramme fuer Tierstimmen sind in `docs/spectrogram-plan.md` dokumentiert. Die aktuelle Anzahl steht in
`docs/project-status.md`; `species-sound.js` nutzt vorhandene `species-assets/<SafeName>/spectrogram.webp`-Assets.
Seit `species-sound.js?v=1.0.24` werden sie auf Squarespace flacher dargestellt, ohne die WebP-Dateien neu zu
erzeugen. Im Arten-Explorer stehen Verbreitungskarte, Tierstimme und Artportraet in drei gleich grossen
Medienbereichen nebeneinander; das Spektrogramm ist dort auf `64px` bis `84px` Anzeigehoehe begrenzt und die
Quellen-/Lizenzdaten sind direkt sichtbar. Ein vorhandenes 4:5-Artportraet wird in die feste Portraitzelle
eingepasst und vergroessert die Medienzeile nicht. Die vollstaendige Darstellung bleibt sichtbar; fuer Details
steht die Portrait-Lightbox bereit.
Bei geringer Fensterhoehe werden Kopfzeile, Zusammenfassung und Validierungsdashboard automatisch verdichtet,
damit Artenliste und Detailansicht eine nutzbare eigene Scrollflaeche behalten. Nach Maennchen und Weibchen
getrennte manuelle Groessen- oder Gewichtswerte stehen in der Detailansicht jeweils in eigenen Zeilen.
Der Footer mit Version `1.0.24` wurde von Felix am 2026-06-19 live erfolgreich getestet. Die dokumentierte
Folgeversion `species-sound.js?v=1.0.25` korrigiert die Squarespace-Meldung fuer fehlende Tonquellen auf
`Keine Tierstimme verfügbar` ohne Schlusspunkt.
Ohne Spektrogramm oder bei Bildladefehler bleibt die bisherige Canvas-Wellenform als Fallback aktiv. Zielstil ist eine
ruhige Schwarz-Weiss-/Graustufen-Darstellung mit hellem Hintergrund, dunklen Frequenzspuren, Rand oben/unten und
Frequenzbereich bis 18 kHz.

Die Soundbar bietet zusaetzlich einen Lautstaerkeregler von 0 bis 200 Prozent und eine Tempo-Auswahl fuer `0,25x`,
`0,5x`, `1x`, `1,5x`, `2x` und `4x`. Lautstaerke ueber 100 Prozent wird per Web-Audio-Gain verstaerkt; ohne
Web-Audio-Unterstuetzung faellt der Player auf die normale Browser-Lautstaerke bis 100 Prozent zurueck.
Seit `species-sound.js?v=1.0.15` wird Web Audio nur noch fuer Werte ueber 100 Prozent aktiviert; die normale
Wiedergabe bei 0 bis 100 Prozent bleibt dadurch nativ. Der Positionsmarker wird waehrend der Wiedergabe per
`requestAnimationFrame` geglaettet.
Seit `species-sound.js?v=1.0.16` schaltet ein Klick auf das Lautsprechersymbol temporaer auf `0%`; das Symbol wird
rot durchgestrichen und ein zweiter Klick stellt den vorherigen Wert wieder her.
Seit `species-sound.js?v=1.0.17` ist das Play-/Pause-Symbol im runden Button ohne Browser-Default-Padding vertikal
zentriert; der ganze Button ist optisch leicht nach unten versetzt, ohne das Control-Grid umzubauen.
Seit `species-sound.js?v=1.0.18` sitzt der Playbutton deutlicher in der Mitte der unteren Bedienflaeche. Die
zusaetzliche Quellenzeile unter `Tierstimme` ist entfernt; Quelle und Lizenz bleiben im ausklappbaren Detailbereich.
Seit `species-sound.js?v=1.0.20` ist die Soundbar kompakter: `Tierstimme` steht oberhalb des Spektrogramms; darunter
liegen Playbutton, Lautstaerke, Zeit und Tempo in einer gemeinsamen Zeile.

ffmpeg unter Windows installieren:

```bash
winget install "FFmpeg (Essentials Build)"
```

Danach neues Terminal oeffnen und pruefen:

```bash
ffmpeg -version
```

Der Bindestrich ist wichtig. `ffmpeg version` ist ein falscher Testbefehl und fuehrt zu einem Ausgabedatei-Fehler.
FFmpeg nicht direkt in `C:\Windows\System32` ablegen; besser ist ein Tool-Pfad wie `C:\Tools\ffmpeg\bin`.

Dry-Run:

```bash
npm.cmd run --silent generate:spectrograms -- --dry-run
```

Testausgabe fuer drei Arten nach `Testlauf/`, wenn ffmpeg im PATH verfuegbar ist:

```bash
npm.cmd run --silent generate:spectrograms -- --species=Amsel,Graugans,Bisamratte --output-root=Testlauf/spectrograms
```

Wenn ffmpeg projektlokal liegt:

```bash
npm.cmd run --silent generate:spectrograms -- --ffmpeg=D:\IUCN_Datenbank\local-tools\ffmpeg\bin\ffmpeg.exe --species=Amsel,Graugans,Bisamratte --output-root=Testlauf/spectrograms
```

`local-tools/` ist ignoriert und wird nicht versioniert.

Die Roadmap steht in `docs/roadmap.md`. Phase 5 und Phase 6 sind abgeschlossen. Phase 6 umfasst Monatsaudit,
Audit-Automatisierung, manuell gepflegte Karten, Spektrogramme, Soundbar-Regler und Asset-Buendelung. Der erste echte
Monatsaudit liegt unter `docs/audits/2026-06-site-audit.md`. Phase 7 Desktop-App/Arten-Explorer wurde am 2026-06-17
gestartet; die technische Basis steht in `docs/desktop-app-plan.md`. Der read-only Prototyp aus Phase 7.2 ist seit
2026-06-18 umgesetzt und getestet. Phase 7.3 mit vertiefter Validierung und Statusdashboard wurde am 2026-06-19
umgesetzt. Phase 7.4 fuer kontrolliertes Bearbeiten von `species_list.json` ist seit 2026-06-19 technisch und visuell
abgeschlossen. Phase 7.5 zum kontrollierten Anlegen neuer Arten nach `docs/add-species-workflow.md` ist technisch
lokal umgesetzt und praktisch geprüft. Phase 7.6 mit Pipeline-Steuerung und dauerhafter
Bereinigung ist abgeschlossen. Ein vollständiger externer Lauf sowie selektive Läufe direkt aus der App
für den Höckerschwan wurden am 2026-06-20 erfolgreich abgeschlossen. Assetentscheidung, automatischer Commit und
Push, Karten-Großansicht, Bereinigung, Dialogbedienung und Soundstopp funktionierten.
Zusätzlich gibt es kleine Wartungsläufe für manuelle und fehlende Karten sowie für NC- und fehlende Sounds, ohne
alle Arten erneut abzurufen.
Die Assetverwaltung aus Phase 7.7 ist seit 2026-06-21 abgeschlossen. Karten, Sound/Credits,
Spektrogrammverwaltung und Artportrait-Workflow sind umgesetzt. KI-Artportraets verwenden keine kostenpflichtige Image-API:
Der Explorer erstellt den Prompt lokal je Art, kopiert diesen Einzelprompt und importiert ein anschliessend selbst
in ChatGPT erzeugtes PNG, JPEG oder WebP. Promptversion `1.1.0` fordert genau ein Einzelbild an und verbietet
Collagen, Raster, Kontaktabzuege und Mehrfachansichten. Der Sammelprompt-Workflow wurde entfernt, weil ChatGPT daraus
wiederholt Collagen erzeugte. Die App prueft Format, Mindestgroesse und 4:5, erzeugt lokal
`portrait.webp` in `1280x1600` und speichert bei bestehenden Arten wie zuvor nach `Artporträt übernehmen` mit
Backup, Commit und Push. Der Neue-Art-Dialog kann aus den gerade eingegebenen Daten einen Einzelprompt erzeugen,
das erzeugte Bild vor dem Anlegen prüfen oder den Portraitschritt überspringen. Ein geprüftes Sofortportrait wird
ohne zusätzliche Electron-Bestätigung lokal übernommen und anschließend zusammen mit dem gezielten Pipeline-Lauf
veröffentlicht. Details:
`docs/portrait-generation.md`. Der erste lokale Einzelimport fuer `Alpenbirkenzeisig` ist erfolgreich; die
Squarespace-Ausgabe bleibt bewusst ein spaeterer Schritt. Phase 7.8 wurde am 2026-06-28 abgeschlossen und von
Felix erfolgreich getestet. Start:

```bash
npm.cmd run species:desktop
```

Einmalig kann eine Desktop-Verknuepfung angelegt werden:

```bash
npm.cmd run species:desktop:shortcut
```

Die Verknuepfung startet `species-explorer/desktop/start-explorer.vbs`. Dadurch oeffnet sich nur das App-Fenster;
eine PowerShell bleibt im Normalbetrieb nicht sichtbar geoeffnet. Falls `node_modules` oder Electron fehlen, zeigt
der Launcher eine kurze Windows-Meldung mit dem Hinweis auf `npm.cmd install`.

Der Desktop-Wrapper startet den lokalen Explorer-Server selbst, wartet auf `/api/summary` und laedt die bestehende
Oberflaeche im eigenen App-Fenster. `npm.cmd run species:explorer` bleibt als direkter Browser-/Servermodus fuer
Debugging verfuegbar. Details: `docs/desktop-shell-plan.md`.

Die technischen Verbesserungen aus dem Repository-Audit wurden am 2026-07-18 abgeschlossen und schließen Phase 7
ab. Danach folgen in der
verbindlichen Reihenfolge Phase 8 mit Taxonomie-Pyramide, Squarespace-Portraits und Soundeditor, Phase 9 mit globaler
lokaler Taxonomie-Referenzdatenbank und Lightroom-Integration, Phase 10 mit Mehrgeraetebetrieb, automatischen
Updates und NAS-Restore sowie Phase 11 mit weiteren Erweiterungen. Details und Abschlusskriterien stehen in
`docs/roadmap.md`, `docs/global-taxonomy-lightroom-plan.md` und `docs/multi-device-backup-plan.md`.

Vor diesen Ausbauschritten wurde ein Projektkonsolidierungs-Audit umgesetzt: `docs/project-consolidation-audit.md`.
Dabei wurden lokale Altlasten entfernt und die Pipeline von `node-fetch` auf natives Node-`fetch` umgestellt.

Vor dem Taxonomie-Redesign wurde der aktuelle Gesamtstand am 2026-07-11 erneut nicht-destruktiv geprueft. Der
priorisierte Befund mit Daten-, Code-, Datei-, Dokumentations-, Sicherheits- und CI-Analyse steht unter
`docs/audits/2026-07-repository-audit.md`. Die Daten und Reports sind konsistent. Der erste P0-Punkt wurde am
2026-07-12 abgeschlossen: Alle 48 vorhandenen Tierstimmen sind technisch gepruefte MP3-Dateien, automatische
Downloads, Uploads und Wiederherstellungen verwenden einen gemeinsamen Formatpruefer und das Pages-Artefakt sank
von rund 229,9 auf 89,86 MiB. Pruefung und Migration sind unter `docs/audio-format-validation.md` dokumentiert.
Der zweite P0-Stabilisierungspunkt wurde ebenfalls am 2026-07-12 umgesetzt: `scripts/validate-media-assets.mjs`
prüft Karten, Portraits, Sounds, Credits, Spektrogramme und veröffentlichte PNG-Grafiken anhand des Dateiinhalts. Der Pages-Bauer
erzwingt vor dem Upload Einzelgrenzen je Asset und Artpaket sowie ein mit der Artenzahl wachsendes Gesamtbudget:
12 MiB Grundbedarf plus 2,5 MiB je Art, begrenzt durch ein 500-MiB-Notfalllimit. Der aktuelle Bestand nutzt
89,86 von automatisch berechneten 134,5 MiB. Details: `docs/media-asset-validation.md`.

Der dritte P0-Stabilisierungspunkt ist ebenfalls abgeschlossen. Der lokale Explorer erzeugt pro Serverstart eine
neue Sitzung, schützt alle POST-Routen zentral durch Sitzungs-, Host-, Same-Origin-, Fetch-Site- und
JSON-Content-Type-Prüfungen und verlangt für Asset-Löschen/-Wiederherstellen zusätzliche Einmaltokens. Der
Kartenimport blockiert nach DNS-Auflösung private, lokale, Link-Local- und Metadatenziele und kontrolliert jedes
Weiterleitungsziel; Dateipfade werden über echte Verzeichnisgrenzen geprüft. Details und negative Integrationstests:
`docs/explorer-api-security.md`. Der vierte P0-Stabilisierungspunkt wurde am 2026-07-13 abgeschlossen: Ein eigener
Quality-Job führt vor dem Pages-Build Installation, Syntaxprüfung, den gemeinsamen `npm test`-Einstieg,
Audio-/Medienvalidierung sowie Projekt- und lokalen Datenaudit aus. Erst danach werden das kontrollierte Artefakt
gebaut, seine erlaubten Pfade geprüft und das Deployment freigegeben. Die öffentliche Photoshop-Designquelle wurde
aus `_site/` entfernt; der aktuelle Stand umfasst 364 Dateien mit 89,72 MiB. Details:
`docs/ci-quality-gate.md`.

Der fünfte und letzte P0-Punkt des Stabilisierungspakets A wurde am 2026-07-13 abgenommen. Der gemeinsame
Quality-Einstieg prüfte 37 JavaScript-/MJS-Dateien, 38 automatisierte Tests, 49 Arten und 263 Medien ohne Fehler. Der
vollständige Live-Audit erreichte 120 Squarespace-Sitemapseiten ohne Abruf- oder HTTP-Fehler und bestätigte die
geprüften GitHub-Pages-Dateien. Der GitHub-Actions-Lauf `29258080649` bestand Quality, Artefaktbau und
Pages-Deployment beim ersten Versuch; Explorer und Squarespace-Detailseite wurden zusätzlich visuell geprüft.

Die nachfolgende P1-Dokumentationskonsolidierung und Temp-Retention sind umgesetzt. `docs/project-status.md` ist die
einzige aktuelle Zähler- und Listenquelle; `docs/documentation-lifecycle.md` trennt aktuelle Betriebsdokumente von
historischen Zeitaufnahmen. `species-explorer/temp-retention.mjs` entfernt eindeutig verwaltete, abgelaufene
Laufzeitreste beim Start und nach Pipeline-Läufen sowie alle verwalteten Reste beim kontrollierten Schließen. Für
neue temporäre Ablagen gehören Eigentümerschaft, Lebenszyklus, Aufbewahrungsgrenze und Tests verpflichtend zur
Implementierung. Details: `docs/temp-retention.md`. `.gitattributes` legt außerdem repositoryweit LF für
plattformunabhängige Textdateien, CRLF für Windows-Skripte und unveränderte Behandlung von Binärdateien fest.
Stabilisierungspaket B wurde mit dem beim ersten Versuch erfolgreichen GitHub-Actions-Lauf `29265285193` und einem
fehlerfreien Live-Audit über 120 Squarespace-Sitemapseiten abgeschlossen.

Auditpunkt A4 wird seit 2026-07-13 schrittweise und verhaltensneutral umgesetzt. Der erste Modulschnitt verschiebt
die Verwaltung wiederherstellbarer Asset-Sicherungen sowie die Aufbewahrung von Eingabelisten- und Pipeline-
Sicherungen aus `species-explorer/server.mjs` nach `species-explorer/asset-backups.mjs`. Der zweite Schnitt buendelt
Felddefinitionen, Namensnormalisierung, Artenvalidierung, Kollisionspruefungen, Bearbeitungsdiffs und Reportvergleiche
in `species-explorer/species-model.mjs`. Der dritte Schnitt verlagert JSON-Body-Limits, Antworthelfer, sichere
Pfadauflösung, MIME-Typen, Byte-Range-Dateiauslieferung und die Freigabe aktiver Dateistreams nach
`species-explorer/http-routing.mjs`. Der vierte Schnitt verlagert die vollständige Methoden-/Pfadzuordnung,
Sitzungs- und Schreibgrenze, Body-Limit-Auswahl, Fehlerantworten sowie die Auslieferentscheidung für Vorschau-,
Asset-, Grafik- und Public-Dateien nach `species-explorer/request-router.mjs`. Die Neue-Art-Route
`portrait-preview` ist dort explizit und getrennt von der allgemeinen Artenvorschau getestet. Siebzehn direkte
Modultests ergänzen die 24 Explorer-Integrationstests; der gemeinsame Testeinstieg umfasst jetzt 59 Tests.
`server.mjs` sank über die vier Schnitte von 6.557 auf 5.654 Zeilen. HTTP-Basis und Routenzuordnung sind damit
getrennt. Der fünfte Schnitt beginnt die Oberflächentrennung mit
`species-explorer/public/app-foundation.js`: Zustandsinitialisierung, Sitzungstoken, geschützte JSON-Anfragen,
gemeinsames Laden von Zusammenfassung/Validierung/Arten/Revision/offenen Änderungen und die Revisionsabfrage sind
aus `app.js` herausgelöst. Vier direkte Frontend-Grundlagentests erhöhen den gemeinsamen Testeinstieg auf 63 Tests;
`app.js` sank dabei von 5.688 auf 5.583 Zeilen. Der sechste Schnitt ergänzt
`species-explorer/public/app-presentation.js` als reine, direkt testbare Anzeigegrenze für HTML-/URL-Sicherheit,
Größen-, Datums-, IUCN-, Asset- und Lizenzformatierung, Datenzeilen sowie versionsbasierte Medien-URLs. Fünf
direkte Präsentationstests erhöhen den gemeinsamen Testeinstieg auf 68 Tests; `app.js` sank dabei weiter auf
5.389 Zeilen. Die lokale Explorer-Anbindung lädt das Modul vor `app.js`; Squarespace-Module, Footer-Versionen und
Custom CSS wurden durch diesen lokalen A4-Schnitt nicht verändert. Der siebte Schnitt führt
`species-explorer/public/app-measurements.js` als gemeinsame Messwertgrenze für Größe, Gewicht und
Lebenserwartung ein. Neue-Art-Assistent und allgemeiner Bearbeitungsdialog verwenden jetzt dieselben Einheiten-,
Parsing-, Singular-/Plural-, Formatierungs- und Formularhelfer; die zuvor doppelte Neue-Art-Implementierung ist
entfallen. Fünf direkte Messwerttests erhöhen den gemeinsamen Testeinstieg auf 73 Tests, und `app.js` sank weiter
auf 5.241 Zeilen. Dabei wurde zugleich die Einheitenentfernung längenbasiert korrigiert, sodass `kg` nicht mehr
fälschlich als `k` stehen bleibt, wenn `g` ebenfalls zulässig ist. Das Modul wird lokal nach der Präsentationsgrenze
und vor `app.js` geladen. Squarespace-Module, Footer-Versionen und Custom CSS blieben auch in diesem Schnitt
unverändert. Der achte Schnitt ergänzt `species-explorer/public/app-dialogs.js` als gemeinsame Dialog- und
Medienfreigabegrenze. Sie vereinheitlicht modales Öffnen/Schließen, sichere Hintergrundklicks, Escape- und
Busy-Sperren, Körperklassen sowie das Stoppen und Entladen von Audio-/Videoquellen. Die fachlichen Aktionen bleiben
im jeweiligen Ablauf. Fünf direkte Dialogtests erhöhen den gemeinsamen Testeinstieg auf 78 Tests; `app.js` sank auf
5.159 Zeilen. Die lokale HTML-Reihenfolge lädt Dialogs nach Measurements und vor `app.js`. Squarespace-Module,
Footer und Custom CSS blieben unverändert. Der neunte Schnitt führt `species-explorer/public/app-media.js` als
gemeinsame Grenze für Karten- und Portrait-Markup, Bereichsaktionen, Audioplayer und Medien-Lightboxen ein. Sechs
direkte Medientests erhöhen den gemeinsamen Testeinstieg auf 84 Tests; `app.js` sank auf 4.936 Zeilen. Das lokale
HTML lädt Media nach Dialogs und vor `app.js`; ein realer lokaler Browsertest bestätigte Datenladung,
Medienaktionen und beide Lightboxen. Squarespace-Module, Footer und Custom CSS blieben auch dabei unverändert. A4
bleibt für die weitere schrittweise Trennung der fachlichen Oberflächenbereiche offen. Der zehnte Schnitt ergänzt
`species-explorer/public/app-asset-review.js` als eigenständige Grenze für sichere Karten-/Soundvergleiche,
Entscheidungstexte, Karten-Lightbox, Spektrogramm-Scrubbing, Fortschrittsmarker und Medienfreigabe. Pipelinezustand,
API-Aufrufe und Speichern bleiben in `app.js`. Fünf direkte Tests erhöhen den gemeinsamen Testeinstieg auf 89 Tests;
`app.js` sank auf 4.760 Zeilen. Das Modul wird nach Media und vor `app.js` geladen. Ein realer lokaler Browsertest
bestätigte 49 geladene Arten ohne Konsolenfehler. Squarespace-Module, Footer und Custom CSS blieben unverändert.
Der elfte Schnitt ergänzt `species-explorer/public/app-pipeline.js` als direkt testbare Präsentationsgrenze für
Modus- und Datenbankstatus, Pipeline-/Backupmeldungen, sichere Aktionsvorschauen und die automatisch nachgeführte
Prozessausgabe. Laufsteuerung, API-Aufrufe und Zustand verbleiben in `app.js`. Sieben direkte Tests erhöhen den
gemeinsamen Testeinstieg auf 96 Tests; `app.js` sank auf 4.598 Zeilen. Das Modul wird nach Asset Review und vor
`app.js` geladen. Ein lokaler HTTP-Smoke-Test bestätigte Hauptseite, Modulreferenz und Export. Squarespace-Module,
Footer und Custom CSS blieben unverändert.
Der zwölfte Schnitt ergänzt `species-explorer/public/app-dashboard.js` als direkt testbare Grenze für
Zusammenfassung, Validierungsdarstellung, Statusfilter und Artenliste. Unveränderliche Präsentationsmodelle halten
Status-, Trend-, Asset- und Pflegehinweise getrennt; die DOM-Steuerung bewahrt die Scrollposition der Artenliste und
delegiert nur die Artauswahl zurück an `app.js`. Sechs direkte Dashboardtests erhöhen den gemeinsamen Testeinstieg
auf 102 Tests; `app.js` sank auf 4.398 Zeilen. Das Modul wird nach `filter.js` und vor `app.js` geladen. Ein echter
lokaler HTTP-Smoke-Test bestätigte Hauptseite, Modulreferenz und Export jeweils mit HTTP 200. Squarespace-Module,
Footer und Custom CSS blieben unverändert.
Der dreizehnte Schnitt ergänzt `species-explorer/public/app-settings.js` als direkt testbare Grenze für den lokalen
Backup-Pfad-Einstellungsdialog. Laden, Standardpfad, Statusmeldungen und Speichern werden vom neuen Controller
gesteuert; die konkrete API-Kommunikation bleibt über `fetchJson` injiziert. Vier direkte Einstellungstests erhöhen
den gemeinsamen Testeinstieg auf 107 Tests; `app.js` sank von 4.408 auf 4.334 Zeilen. Das Modul wird nach
`app-dialogs.js` und vor `app-media.js` geladen; der Explorer-Smoke-Test prüft Auslieferung, Reihenfolge und Export.
Squarespace-Module, Footer und Custom CSS blieben unverändert.
Der vierzehnte Schnitt ergänzt `species-explorer/public/app-species-actions.js` als direkt testbare Grenze für
`Art aktualisieren` sowie Vorschau und Speichern des Art-Löschdialogs. Der Controller erhält Pipelineaufruf,
API-Client, Dialogsteuerung, Medienfreigabe und Datenreload als Abhängigkeiten; reine Bestätigungs-, Löschmodus- und
Erfolgstexte liegen ebenfalls im Modul. Fünf direkte Tests erhöhen den gemeinsamen Testeinstieg auf 112 Tests;
`app.js` sank von 4.334 auf 4.193 Zeilen. Das Modul wird nach `app-dashboard.js` und vor `app.js` geladen; der
Explorer-Smoke-Test prüft Auslieferung, Reihenfolge und Export. Squarespace-Module, Footer und Custom CSS blieben
unverändert.
Der fünfzehnte Schnitt ergänzt `species-explorer/public/app-lifecycle.js` als direkt testbare Grenze für
Bearbeitungsmodus, konsistentes Laden und Verteilen des Explorer-Schnappschusses, initiale Artauswahl,
Revisionsüberwachung und die Schließwarnung bei offenen Änderungen. Dashboard-Callbacks und Detailauswahl werden
injiziert; Pipeline-, Neue-Art- und Bearbeitungsabläufe bleiben fachlich unverändert. Sieben direkte Tests erhöhen
den gemeinsamen Testeinstieg auf 119 Tests; `app.js` sank von 4.193 auf 4.107 Zeilen. Das Modul wird nach
`app-dashboard.js` und vor `app-species-actions.js` geladen; der Explorer-Smoke-Test prüft Auslieferung,
Reihenfolge und Export. Squarespace-Module, Footer und Custom CSS blieben unverändert.
Der sechzehnte Schnitt ergänzt `species-explorer/public/app-asset-maintenance.js` als direkt testbare Grenze für
das Löschen und Wiederherstellen einzelner Karten-, Portrait- und Soundpakete. Der Controller übernimmt
Bestätigung, Medienfreigabe, Sicherungsaufrufe, Erfolgsmeldungen, Fehlerfreigabe und abschließenden Reload; die
vorhandenen Bereichsanzeigen werden injiziert. Sechs direkte Tests erhöhen den gemeinsamen Testeinstieg auf 125
Tests; `app.js` sank von 4.107 auf 4.007 Zeilen. Das Modul wird nach `app-species-actions.js` und vor `app.js`
geladen; der Explorer-Smoke-Test prüft Auslieferung, Reihenfolge und Export. Squarespace-Module, Footer und Custom
CSS blieben unverändert.

Die Schnitte 17 bis 24 wurden am 2026-07-17 gemeinsam, aber einzeln getestet umgesetzt. Neu hinzugekommen sind
`app-editor-files.js`, `app-confirmation.js`, `app-detail-media.js`, `app-selection.js`,
`app-asset-review-workflow.js`, `app-form-feedback.js`, `app-new-species-form.js` und `app-editor-form.js`. Sie
übernehmen Datei-/Metadatenvorbereitung, Bestätigungen, Detailmedien, Artauswahl, den Assetprüfablauf,
Formularrückmeldungen sowie Werteaufbau und Validierung der beiden Artenformulare. 45 direkte Tests erhöhen den
gemeinsamen Testeinstieg von 125 auf 170 Tests; `app.js` sank von 4.007 auf 3.504 Zeilen. Der Explorer-
Integrationstest bestand mit 24 von 24 Prüfungen. Die Squarespace-Module, Footer-Versionen und das Custom CSS
wurden durch diese lokalen Explorer-Schnitte nicht verändert.

Die Oberflächenschnitte 25 bis 33 schließen am 2026-07-17 die geplante Explorer-Oberflächenzerlegung ab.
Pipeline- und Backupsteuerung, Neue-Art-Assistent, Arteditor, allgemeine Daten, Karte, Sound, Portrait und
Detailansicht liegen nun in eigenen Browsermodulen. `species-explorer/public/app.js` sank von 3.504 auf 509 Zeilen
und verdrahtet nur noch Zustand, Controller und Lebenszyklus. Vier direkte Architekturtests verhindern eine
Rückverlagerung der Großblöcke, sichern Exporte und HTML-Ladereihenfolge; der Explorer-Integrationstest liefert alle
neuen Module per HTTP aus und bestand mit 24 von 24 Prüfungen. Damit ist der Oberflächenteil von Auditpunkt A4
abgeschlossen. Squarespace-Module, Footer-Versionen und Custom CSS wurden nicht geändert.

Am 2026-07-18 folgte der erste serverseitige A4-Folgeschnitt. `explorer-model.mjs`, `media-assets.mjs`,
`pipeline-log.mjs`, `manual-map-documentation.mjs` und `asset-files.mjs` trennen Explorer-Modell und Revision,
Medienprüfung und Kartenimport, lesbare Spektrogramm-Prozessausgabe, Kartendokumentation und die kanonische
Assetdateiliste aus `server.mjs`. Wiederverwendbare binäre Fixtures liegen in `server-test-fixtures.mjs`; direkte
Modultests wurden aus dem großen Serverintegrationstest herausgelöst. Zwölf neue direkte Prüfungen und die
verbleibenden 21 Serverintegrationstests sichern das Verhalten. Der Schnitt behebt zugleich eine still
übergangene Assetrevision und reduziert `server.mjs` von 5.678 auf 4.408 Zeilen sowie `server.test.mjs` von 3.098
auf 2.842 Zeilen. Squarespace-Module, Footer-Versionen und Custom CSS blieben unverändert.

Die fünf abschließenden serverseitigen A4-Pakete wurden danach einzeln umgesetzt und nach jedem Paket mit dem
Explorer-Integrationstest geprüft. Anlegen, Löschen und Bearbeiten liegen in `species-create.mjs`,
`species-delete.mjs` und `species-edit.mjs`. Karten-, Sound- und Portraitabläufe sowie Assetpflege liegen in
`map-asset-workflow.mjs`, `sound-asset-workflow.mjs`, `portrait-asset-workflow.mjs` und `asset-maintenance.mjs`.
`pipeline-controller.mjs` besitzt Pipelinezustand, Prozesssteuerung, Assetprüfung und Veröffentlichung;
`project-publication.mjs` und `backup-service.mjs` trennen Git-Übertragung und NAS-Sicherung. Der große
Oberflächen-/Quellvertrag wurde aus `server.test.mjs` nach `explorer-ui-contract.test.mjs` verschoben. Dadurch ist
`server.mjs` mit 566 Zeilen nur noch Kompositions- und Adapterwurzel; `server.test.mjs` umfasst 2.102 Zeilen und der
getrennte UI-Vertrag 784 Zeilen. Der gemeinsame Explorer-Test bestand mit 21 von 21 Prüfungen. Auditpunkt A4 ist
damit abgeschlossen. Squarespace-Module, Footer-Versionen und Custom CSS blieben unverändert.

Phase 10 plant Mehrgeraete-Betrieb und NAS-Restore-Backups. Grundentscheidung: GitHub bleibt die zentrale
versionierte Wahrheit, jeder Rechner arbeitet lokal in seinem eigenen Projektordner, das NAS dient als
vollstaendiges ZIP-Backup. Details: `docs/multi-device-backup-plan.md`.

Nach einem Restore aus einem NAS-ZIP kann `restore-start.cmd` im entpackten Projektordner per Doppelklick gestartet
werden. Das Skript prueft Node.js 18+, bietet bei fehlenden `node_modules` ein `npm install` an, erstellt die
Desktop-Verknuepfung und startet die App.

Der technische Backup-Kern nutzt als Standardziel `W:\Website Datenbank Backup`:

```bash
npm.cmd run backup:nas:dry-run
npm.cmd run backup:nas
```

In der Desktop-App ist derselbe Lauf im Datenbank-Dialog als `NAS-Backup erstellen` erreichbar. Die App zeigt vor dem
Start Zielpfad, Umfang, geplante ZIP-Datei und Rotation an. Danach zeigt sie Fortschritt in Prozent, Prozessausgabe
und Abschlussmeldung. Wenn seit dem letzten Backup nichts geaendert wurde, kann das Backup manuell trotzdem
erzwungen werden. Der Zielpfad ist im gleichen Dialog ueber `Backup-Pfad einstellen` lokal aenderbar; gespeichert wird
er in `species-explorer/local-settings.json`, das nicht in Git landet.

## Aktueller Datenstand

Aktuelle Zähler und aktive Pflege-/Hinweislisten stehen ausschließlich in `docs/project-status.md`. Die Datei wird
aus den produktiven Daten und Assets erzeugt:

```bash
npm.cmd run status:sync
npm.cmd run status:check
```

Der Quality-Job führt `status:check` aus und stoppt bei einer Abweichung. Historische Zahlen in datierten Audit- und
Verlaufsabschnitten bleiben als Zeitaufnahme erhalten und dürfen nicht als aktueller Datenstand verwendet werden.

Bei automatischen Veröffentlichungen aus dem Arten-Explorer wird der Projektstatus vor dem Commit neu erzeugt und
gemeinsam veröffentlicht. Die beiden Befehle bleiben für manuelle Daten-/Assetänderungen und lokale Prüfungen
verbindlich.

Weitere Arten werden bei Bedarf kontrolliert ueber den Arten-Explorer in `species_list.json` ergaenzt.

## Tests nach Frontend-Aenderungen

- Detailseite, z. B. `/wildlife/heimische-tierwelt/acanthisflammea`
- Tierstimmen-Player: Spektrogramm, Play/Pause, Scrubbing, Lautstaerke 0-200 Prozent, Mute-Toggle und Tempo-Auswahl
  pruefen
- Uebersichtssuche:
  - `/wildlife/heimische-tierwelt`
  - `/wildlife/costarica`
  - `/wildlife/island`
- Lightbox-Zoom auf Desktop und Android Chrome
- GitHub Pages pruefen, bevor Squarespace `?v=` erhoeht wird
