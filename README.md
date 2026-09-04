# IUCN Species Data

Dieses Repository erzeugt und hostet Arten-Daten, Karten, Sounds und Frontend-Module fuer die Squarespace-Website
`https://www.fnwildlifetravel.de`.

GitHub Pages Base:
`https://felixkfm90.github.io/iucn-species-data/`

## Datenfluss

`species_list.json` ist die manuelle Eingabeliste. `update.mjs` nutzt daraus deutsche, englische und
wissenschaftliche Artennamen, Groesse, Gewicht und manuell gepflegte Lebenserwartung und erzeugt bzw.
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
- `species-info.js`: Info-Box fuer deutschen, englischen und lateinischen Namen, Groesse, Gewicht,
  Lebenserwartung, Generationsdauer und Population
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
- `docs/taxonomy-source-decision.md`
- `docs/local-taxonomy-database-design.md`
- `docs/taxonomy-import-prototype.md`
- `docs/taxonomy-explorer-integration.md`
- `docs/taxonomy-reference-update.md`
- `docs/taxonomy-reference-supplements.md`
- `docs/taxonomy-master-database-design.md`
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

Der verbindliche aktuelle Gesamtstand fuer Squarespace liegt in `docs/squarespace-custom.css`. Ein aelterer
Custom-CSS-Stand darf dort nicht zusaetzlich stehen bleiben oder an den neuen Stand angehaengt werden, weil sich
insbesondere die alten Flex- und Taxonomie-Regeln mit dem aktuellen Grid-Layout ueberschneiden. Bei einer
Uebernahme wird der bisherige Squarespace-CSS-Inhalt deshalb vollstaendig durch diese Referenz ersetzt. Der
dokumentierte Footer steht getrennt in `docs/squarespace-footer.html`.

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
Die Stufen setzen ihr Boxmodell ausdrücklich auf `border-box`, damit Squarespace Innenabstände und Rahmen nicht
zusätzlich auf die von JavaScript berechnete Breite aufschlägt und die diagonalen Außenkanten live genauso verlaufen
wie in der lokalen Vorschau.
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

## Begrenzter Taxonomieprototyp

Der Phase-9.3-Prototyp importiert ausschließlich die kleine versionierte Testfixture in einen ignorierten
Arbeitsordner unter `Testlauf/`. Er verändert keine produktiven Arten:

```bash
npm.cmd run --silent taxonomy:prototype -- --reset --json
npm.cmd run --silent test:taxonomy-prototype
```

Architektur, Quellen, Messwerte und Grenzen des Prototyps stehen in `docs/taxonomy-import-prototype.md`. Der
vollständige CoL-XR-Bestand ist lokal installiert, bleibt aber weiterhin außerhalb von Git und GitHub Pages.

## Taxonomiereferenz im Neue-Art-Assistenten

Phase 9.4 bindet den aktiven lokalen Referenzbestand read-only in Schritt 1 von `Neue Art` ein. Der Assistent
führt drei eigenständige Pflichtfelder: `Deutscher Name`, `Englischer Name` und `Wissenschaftlicher Name`.
Jedes Feld durchsucht beim Tippen die passende Sprache beziehungsweise wissenschaftliche Namen und Synonyme.
Die Suche startet 500 Millisekunden nach der letzten Eingabe; ältere Anfragen dürfen die aktuelle Trefferliste
nicht mehr überschreiben. Ein Treffer wird erst nach Auswahl mit Hierarchie, Quelle, Release, ID und Namensstatus
angezeigt. Ein Klick auf den Treffer schließt die schwebende Liste und schreibt deutschen, englischen sowie
wissenschaftlichen Namen direkt in die drei Namensfelder. Die normale Eingabeprüfung und Kollisionskontrolle bleibt
danach Pflicht.

Die Referenzsuche ist bei installierter Datenbank der reguläre geführte Eingabeweg; alle drei Felder bleiben
gleichzeitig direkt manuell beschreibbar. Über das Zahnrad neben der Reichsauswahl wird lokal festgelegt, welche
Reiche im Dropdown erscheinen. Beim ersten Start ist nur `Tiere (Animalia)` ausgewählt, kann dort aber ebenfalls
abgewählt werden. `Alle Reiche` steht vor den alphabetisch sortierten sichtbaren Reichen und durchsucht
ausschließlich diese Auswahl; ausgeblendete Reiche werden weder angezeigt noch einbezogen.
Der Einstellungsdialog bietet dafür eine Filtereingabe sowie eine kompakte scrollbar begrenzte Liste mit
Checkbox und Reichsname in derselben Zeile.
Das deutsche und englische Namensfeld verwenden explizite Sprachfilter. Die wissenschaftliche Suche berücksichtigt
akzeptierte Namen und Synonyme. Der Neue-Art-Assistent begrenzt seine API-Suche auf echte Arteinträge; exakte
Treffer werden gegenüber unpassenden Teiltreffern bevorzugt. Gattungen und Unterarten verdrängen dadurch keine
Arten aus dem Trefferlimit. Suchtreffer stehen weiterhin in einer kompakten, schwebenden Liste über dem Formular,
damit der Dialog beim Tippen nicht mit jeder Trefferzahl seine Höhe verändert.

Fehlt oder scheitert die lokale Referenz, bleibt die manuelle Artanlage vollständig nutzbar. Deutsche und
englische Namen werden getrennt gespeichert; Englisch ist kein Ersatz im deutschen Datenfeld. Fehlt in der
Referenz ein deutscher Name, kann ein vorhandener englischer Name übernommen und der deutsche Name redaktionell
ergänzt werden. Ein späterer Referenzrelease benennt bestehende Projektarten niemals still um. Für Tiere bleibt
zusätzlich der manuelle Animalia.bio-Suchlink verfügbar. Die Referenzintegration selbst ändert keine bestehende
Projektart und ist nicht Bestandteil von GitHub Pages oder Squarespace.

Fokussierte Tests:

```bash
npm.cmd run --silent test:taxonomy-reference
```

Bedien- und API-Vertrag: `docs/taxonomy-explorer-integration.md`.

## Taxonomiereferenz installieren und aktualisieren

Phase 9.5 ergänzt im Bereich `Datenbank-Aktionen > Taxonomiereferenz` den vollständigen lokalen
Catalogue-of-Life-XR-Import. Beim Explorer-Start werden nur kleine Release-Metadaten geprüft; ein Download von
mehr als 1 GB beginnt ausschließlich nach einer Vorschau und ausdrücklicher Bestätigung. Download, sicheres
Entpacken, SQLite-Import, Suchindex, Qualitätsprüfung, Projektartenabgleich und atomare Aktivierung werden mit
Fortschritt angezeigt. Das sichere Entpacken erlaubt höchstens 50.000 Archiveinträge; damit ist der reale
CoL-XR-Umfang von 21.100 Einträgen abgedeckt, ohne die übrigen Größen- und Kompressionsgrenzen zu öffnen. Die
vorherige aktive Referenz bleibt als Rollbackversion erhalten.

Reale ColDP-1.2-Exporte kennzeichnen Tabellenfelder mit Namensräumen wie `col:ID`, `col:scientificName` und
`clb:merged`. Der Importer normalisiert diese offiziellen Präfixe beim Lesen; die lokale Datenbank und die kleinen
unpräfixierten Testfixtures verwenden dadurch weiterhin denselben internen Feldvertrag.

Einzelne optionale Zeilen aus `VernacularName.tsv`, deren `taxonID` im selben Release weder als Taxon noch als
wissenschaftlicher Name existiert, werden ohne Ersatzzuordnung gezählt und übersprungen. Die zulässige Zahl wächst
kontrolliert mit der Quelldatei: 25 Zeilen Grundtoleranz, bei größeren Dateien ein Prozent aller
`VernacularName.tsv`-Zeilen und zusätzlich eine absolute Obergrenze von 100.000. Damit werden vereinzelte fehlerhafte optionale
Zusatznamen in sehr großen offiziellen Releases toleriert, während ein systematisch inkonsistentes Paket weiterhin
blockiert wird. Der reale Befund von 12.294 nicht zuordenbaren Verweisen unter 1.996.915 Namenszeilen liegt innerhalb
dieser Grenze. Der Explorer nennt die Zahl übersprungener Namen nach der Aktivierung ausdrücklich.

Die lokale SQLite-Datenbank enthält akzeptierte Taxa und ihre Hierarchie, vorhandene Zwischenränge,
wissenschaftliche Namen und Synonyme, gebräuchliche Namen soweit geliefert, darunter getrennt erkannte deutsche
und englische Namen, externe
Kennungen sowie Release- und Quellenprovenienz. Größe, Gewicht, Lebenserwartung, IUCN-Daten, Karten, Sounds und
Portraits bleiben getrennte Projektdaten. Nach erfolgreicher Aktivierung zeigt der Explorer Release und
Importzähler dauerhaft und bestätigt die Übernahme zusätzlich einmalig in einem Abschlussfenster.

Vor der Aktivierung werden alle bestehenden Arten verglichen. Eindeutig akzeptierte Namen bleiben grün,
eindeutige Synonyme erscheinen nur als Umbenennungsvorschlag und mehrdeutige oder fehlende Treffer als manuelle
Prüfung. Fehlt eine Artstufe im CoL-Release, obwohl zugehörige Unterarten enthalten sind, zeigt der Explorer dies
getrennt als `Referenzlücke` statt irreführend als unbekannte Art; die Projektart bleibt unverändert. Der
Aktualisierungslauf ändert niemals automatisch `species_list.json`, `speciesData.json`, deutsche oder
wissenschaftliche Namen, URL-Slugs, Assetnamen, Assetordner oder Overrides. Fachliche Hinweise können daher die
neue read-only Referenz nicht beschädigen; technische Import- oder Vergleichsfehler verhindern dagegen die
Aktivierung und lassen die bisherige Version aktiv.

Der Wartungsbereich trennt installierte und neueste Version ohne Textdopplung: oben steht die aktive Referenz, in
der Detailzeile ausschließlich die neueste verfügbare Version. `Manuell zu prüfen` beginnt bei vorhandenen
Konflikten oder Referenzlücken in einer eigenen Zeile.

Fokussierte Prüfung:

```bash
npm.cmd run --silent test:taxonomy-maintenance
```

Der vollständige Betriebs-, Konflikt- und Rollbackvertrag steht in `docs/taxonomy-reference-update.md`.

## Ergänzungsnamen und eigene Taxonomiekorrekturen

Catalogue of Life XR bleibt die vollständige, unveränderliche taxonomische Primärreferenz. Die lokale
Masterdatenbank ergänzt diesen Bestand proaktiv und versioniert: Ein breiter iNaturalist-Namens- und
Artlückenbestand schließt offline nutzbare CoL-Lücken; GBIF ergänzt Namen und Kennungen, WoRMS marine und
brackische Taxa und Wikidata deutsche beziehungsweise englische Namen sowie externe IDs. Danach verbleibende,
belegte Tierlücken können kontrolliert aus Animalia übernommen werden. Eigene Korrekturen besitzen den höchsten
Vorrang. Keine Ergänzungsquelle verändert die CoL-SQLite selbst.

Jede Aussage speichert Anbieter, Anbieter-ID, Quellenstand, Abrufzeitpunkt, Status und Feldprovenienz. Die
vollständigen Bestände von GBIF, WoRMS und Wikidata werden nicht gespiegelt; lokal liegen versionierte relevante
Ausschnitte. Der iNaturalist-Ausschnitt ist bewusst breiter und enthält CoL-Artlücken sowie fehlende deutsche oder
englische Namen, damit diese Treffer ohne Internetverbindung verfügbar bleiben. Ein Anbieterausfall überschreibt
den letzten funktionierenden Stand nicht. Eigene redaktionelle Korrekturen liegen getrennt in
`taxonomy-reference-corrections.json` und bleiben bei Anbieter- und CoL-Aktualisierungen erhalten.

Details, Datenvertrag, API und Tests stehen in `docs/taxonomy-reference-supplements.md`.

Phase 9.6 bis 9.12 bauen daraus eine physisch getrennte Masterdatenbank auf. Die vollständige CoL-XR-Referenz
bleibt read-only; stabile anbieterunabhängige Master-IDs verbinden CoL, den breiten iNaturalist-Ausschnitt,
relevante Ausschnitte aus GBIF, WoRMS und Wikidata, kontrollierte Animalia-Fälle sowie geschützte eigene
Korrekturen. Feldprovenienz, Konflikte, veraltete Quellenstände, Kandidatenvorschau, atomare Aktivierung und
Rollback bleiben nachvollziehbar. Der Regressionstest für `Sciurus vulgaris` bestätigt, dass eine reale
CoL-Artlücke aus exakten externen Belegen geschlossen und später ohne neue Projektart oder geänderten URL-Slug an
eine nachgelieferte CoL-Art gebunden werden kann. Die Explorer-Suche verwendet bevorzugt die aktive Masteransicht
und bleibt für alle darin enthaltenen Einträge offline. Das frühere Audit dokumentiert nur den kleinen
Ausgangsbestand. Der erweiterte reale Neuaufbau und das eigene Phase-9-Abschlussaudit wurden am 2026-08-09
erfolgreich abgeschlossen. Details stehen in `docs/taxonomy-master-database-design.md` und
`docs/audits/2026-08-phase-9-closing-audit.md`.

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
  in schmalen Drittelkarten stehen Titel und die gemeinsam ausgerichtete Aktionszeile untereinander; in der
  Einspaltenansicht bleibt das anklickbar vergrößerbare Portrait kompakt und die Tierstimme wächst nur bis zum
  tatsächlichen Inhalt
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
   Datenwert angezeigt; es gibt keine pauschale oder aus anderen Rängen abgeleitete Ersatzstufe. Fehlende optionale
   Unterstämme werden beim Schreiben vollständig aus `speciesData.json` entfernt. Das Modul lädt sein freigegebenes
   CSS aus demselben Pages-Artefakt, damit Markup und Darstellung gemeinsam veröffentlicht werden.
5. Artportrait auf der Squarespace-Artseite einbinden: seit 2026-07-18 umgesetzt. Auf Desktop steht es rechts neben
   der Taxonomie; Status und Trend stehen links direkt unter den allgemeinen Daten. Tablet und Mobil stapeln die
   Bereiche, bei fehlendem Portrait greift ein Layout-Fallback ohne Leerfläche.

Phase 8 ist seit 2026-07-22 vollständig abgeschlossen. Im Taxonomiebereich können Reich, Stamm, optionaler
Unterstamm, Klasse, Ordnung und Familie nach Pflichtvorschau und mit Änderungsgrund korrigiert werden. Manuelle
Korrekturen bleiben bei der nächsten Pipeline erhalten und können auf den automatischen Stand zurückgesetzt werden.
Details: `docs/taxonomy-edit-workflow.md`.

Der Tierstimmen-Editor kann einen vorhandenen Sound aus bis zu 20 frei gewählten Zeitabschnitten neu
zusammensetzen. Vor dem Speichern wird eine lokale FFmpeg-Vorschau erzeugt und dem bisherigen Sound
gegenübergestellt. Quellen- und Lizenzangaben bleiben erhalten; Soundpaket, Sicherung und Spektrogramm werden
konsistent aktualisiert. Details: `docs/sound-editor.md`.

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
Für das Phase-8-Artseitenlayout sind `species-core.js?v=1.0.5`, `species-info.js?v=1.0.8`,
`species-taxonomy.js?v=1.0.8` und `species-portrait.js?v=1.0.1` dokumentiert; diese Versionen werden erst nach
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
in ChatGPT erzeugtes PNG, JPEG oder WebP. Promptversion `2.0.0` fordert genau ein Einzelbild an, verbietet
Collagen, Raster, Kontaktabzuege und Mehrfachansichten und übernimmt strukturierte Bildvorgaben direkt in den
Prompt. Der standardmäßig geschlossene Bereich enthält einzeln ausklappbare Gruppen für Motiv, Körper/Blick,
Perspektive/Verhalten, Umgebung/Licht und klassenabhängige Merkmale. Ohne Anpassung bleibt alles automatisch;
das wissenschaftlich passende Habitat wird dezent angedeutet. Der Sammelprompt-Workflow wurde entfernt, weil ChatGPT daraus
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

Wird die Desktop-Verknüpfung erneut gestartet, während Electron bereits läuft, aktiviert der zweite Start das
vorhandene Explorer-Fenster. Ein minimiertes Fenster wird wiederhergestellt, ein verborgenes Fenster eingeblendet
und anschließend fokussiert; eine zweite schreibende App-Instanz entsteht nicht.

Die technischen Verbesserungen aus dem Repository-Audit wurden am 2026-07-18 abgeschlossen und schließen Phase 7
ab. Phase 8 mit Taxonomie-Pyramide, Squarespace-Portraits, kontrollierter Taxonomiebearbeitung und Soundeditor wurde
am 2026-07-22 abgeschlossen. Phase 9 hat am 2026-07-23 mit dem abgeschlossenen Quellenvergleich begonnen:
Catalogue of Life XR ist die globale Primärreferenz, WoRMS ergänzt marine Taxa, GBIF dient als Diensteschicht und
Wikidata ausschließlich als optionale Namens-/ID-Vorschlagsquelle. Animalia.bio bleibt ohne dokumentierte
maschinelle Schnittstelle eine manuelle Referenz. Phase 9.2 hat SQLite, lokales Release-/Stagingmodell,
Provenienzschema, Präfix-/Volltextsuche, Rollback und Datengrenzen verbindlich festgelegt. Der
Neue-Art-Assistent führt deutsche, englische und wissenschaftliche Namen getrennt und sucht nach 500 Millisekunden
in der passenden Namensart. `Tiere (Animalia)` ist nur beim ersten Start vorausgewählt; über das Zahnrad werden die
im Dropdown und in `Alle Reiche` berücksichtigten Reiche lokal festgelegt. Fehlt ein bestätigter deutscher Name,
kann der englische Name unabhängig davon übernommen und der deutsche Pflichtwert redaktionell ergänzt werden; bei
Tieren kann zusätzlich eine gezielte manuelle Animalia.bio-Recherche im Browser geöffnet werden. Die Website wird nicht
automatisiert ausgelesen. Phase 9.3 hat den begrenzten, reproduzierbaren Importprototyp am 2026-07-23 abgeschlossen. Eine kleine
versionierte CoL-XR-/WoRMS-Fixture bestätigt den streamenden SQLite-Import, atomare Aktivierung, Rollback,
Ein-Zeichen-Präfixsuche, deutsch-wissenschaftliche Vorschläge, Synonyme, Homonyme und Quellenprovenienz. Der
Prototyp bleibt vollständig von produktiven Arten, GitHub Pages und Squarespace getrennt; ein Vollimport wurde noch
nicht ausgeführt. Phase 9.4 hat am 2026-07-24 die lokale read-only API und die kontrollierte Referenzsuche in den
Neue-Art-Assistenten integriert. Kein Treffer wird automatisch gewählt; nur bestätigte Arteinträge gelangen in die
Namensfelder und die bisherige Prüfung bleibt maßgeblich. Phase 9.5 stellt seit 2026-07-26 den vollständigen
lokalen Import, die nicht blockierende Versionsprüfung beim Start, Fortschritt, den sicheren Abgleich vorhandener
Arten, atomare Aktivierung und Rollback bereit. Entpacken und Paketprüfung verwenden dieselbe auf 50.000 Dateien
begrenzte Sicherheitsrichtlinie; technische Import-Stacktraces werden in der Oberfläche auf den verständlichen
Fehlergrund reduziert. Fehlt die Taxonomiedatenbank oder ist sie veraltet, bietet der Explorer die Aktualisierung
nach der Startprüfung direkt an. Ein echter Vollbestand wird erst durch diese ausdrücklich bestätigte lokale
Installation geladen; automatisierte Tests verwenden weiterhin die kleine Fixture. Seit 2026-07-30 ergänzt eine
getrennte Namensschicht fehlende deutsche und englische CoL-Namen. Seit 2026-08-08 wird daraus der verbindliche
lokale Master aufgebaut: vollständiges CoL XR, ein breiter iNaturalist-Namens-/Artlückenausschnitt, relevante
versionierte GBIF-, WoRMS- und Wikidata-Ausschnitte, kontrollierte Animalia-Fälle und eigene Korrekturen. Letzte
funktionierende Anbieterstände bleiben bei Ausfällen erhalten. Die Trefferauswahl im Neue-Art-Assistenten übernimmt
alle drei Namen direkt und schließt die Ergebnisliste; einen zusätzlichen Übernahme-Button gibt es nicht mehr.
Phase 9.6 bis 9.12 stellen stabile IDs, Feldprovenienz, Konfliktvorschau, Projektverknüpfungen, atomare Aktivierung
und Rollback bereit. Die aktive CoL-Vollreferenz bleibt unverändert und read-only; die Explorer-Suche verwendet
bevorzugt die aktive Masteransicht und fällt bei Bedarf sicher auf die bisherige Referenz zurück. Der am 30. August
2026 aktualisierte aktive reale Master enthält 273.421 Taxa und 7.103.327 Suchbegriffe; alle 55 Projektarten sind
eindeutig verknüpft. Aktivierung,
Rollback, Offline-Suche, Speicher- und Temporärverhalten wurden praktisch geprüft. Das umfassende Audit unter
`docs/audits/2026-08-phase-9-closing-audit.md` schließt Phase 9 ab. Phase 10 umfasst ausschließlich Lightroom,
Phase 11 Mehrgeraetebetrieb, automatische
Updates und NAS-Restore und Phase 12 weitere Erweiterungen. Details und Abschlusskriterien stehen in
`docs/roadmap.md`, `docs/global-taxonomy-lightroom-plan.md`,
`docs/taxonomy-source-decision.md`, `docs/local-taxonomy-database-design.md`,
`docs/taxonomy-import-prototype.md`, `docs/taxonomy-explorer-integration.md`,
`docs/taxonomy-reference-update.md`, `docs/taxonomy-reference-supplements.md`,
`docs/taxonomy-master-database-design.md` und
`docs/multi-device-backup-plan.md`.

Phase 10.1 wurde am 2026-08-13 mit der Machbarkeitsstudie
`docs/lightroom-feasibility-study.md` abgeschlossen. Der technische Kern von Phase 10.2 ist ebenfalls umgesetzt:
Aus der aktiven Masterdatenbank entsteht ein vollständiges, versioniertes read-only Suchpaket, das ein kleiner
lokaler Suchhelfer ohne laufenden Arten-Explorer durchsucht. Der aktive reale Stand enthält 273.421 Taxa und 7.103.327
Suchbegriffe; repräsentative Offline-Suchen lagen lokal unter zwei Millisekunden. Ein natives deutsches
Lua-Plug-in zeigt Namen und vollständige Taxonomie vor der Übernahme an und weist sie als eindeutig mit `(FN)`
markierte, flache Lightroom-Stichwörter sowie stabile eigene Metadaten einem oder mehreren ausgewählten Fotos zu.
Paketprüfung, atomare Aktivierung, isolierter Rollback, Suchhelfer und Plug-in-Vertrag sind automatisiert getestet.
Das Plug-in besitzt in Version `0.4.24.6` ein kompaktes schwebendes, vierstufig gerahmtes Zuweisungsfenster. Es
zeigt bei einem Einzelfoto dessen Dateinamen oder `1 Foto ausgewählt`, bei Mehrfachauswahl die Gesamtzahl der Fotos
und aktualisiert sich bei einem Auswahlwechsel über eine kurze, vom Observer gestartete `LrTask`. Lifelist und
Katalogstatistik bleiben vollständig im getrennten
Statistikfenster; das Zuweisungsfenster startet beim Öffnen sowie nach Zuweisung oder Rücknahme keine
katalogweite Statistikberechnung. Taxonomie-, Orts-/Zeit- und Art-Favoriten-Aktionen aktualisieren stattdessen ausschließlich
die betroffenen Aggregate des persistenten Katalogindex. Neben dem
Button `Art suchen` startet dieselbe Suche automatisch nach 0,5 Sekunden ohne weitere Eingabe. Jede Textänderung
verwirft sofort die zuvor gewählte Art; eine zusätzliche Sicherheitsabfrage verhindert die stille Zuweisung einer
Art, deren Suchtext nicht mehr zum geladenen Treffer gehört. Das Lightroom-SDK stellt im dauerhaft geöffneten
`presentFloatingDialog` weiterhin keinen dokumentierten Enter-/Tastatur-Callback für das Suchfeld bereit. Einzel- und
Mehrfachzuweisung wurden im separaten Lightroom-Testkatalog praktisch bestätigt. Die vollständige verfügbare
Taxonomie liegt in stabilen Plug-in-Metadaten; Lightroom-Stichwörter enthalten bewusst nur lesbare Namen ohne
interne IDs oder technische Rangpräfixe. Vor dem Schreibzugriff dedupliziert das Plug-in identische sichtbare
`(FN)`-Namen; dadurch werden etwa die bei Austernfischer und Bartmeise gleich benannten Familien- und
Gattungsstufen nur einmal je Foto hinzugefügt. Schreibzugriffe besitzen einen kurzen Timeout und melden einen
anderweitig belegten Lightroom-Katalog verständlich. `Taxonomie entfernen` nimmt eine Zuweisung über denselben
kontrollierten SDK-Weg zurück und entfernt von den markierten Fotos die eindeutig reservierten Stichwörter mit den Endungen
`(FN)` und `(FN)*`. Andere manuelle Stichwörter und alte, nicht eindeutig erkennbare flache Stichwörter bleiben
erhalten. Die Aktionen sind über `Plug-in-Extras` beziehungsweise `Bibliothek > Zusatzmoduloptionen` erreichbar;
ein Eintrag direkt im normalen Foto-Rechtsklickmenü war im praktischen Test nicht verfügbar.
Version 0.4.22.1 übernimmt beim normalen Taxonomiezuweisen zusätzlich vorhandene Lightroom-Ortsfelder und die
Aufnahmezeit, sofern für das Foto noch kein FN-Orts-/Zeitstand gespeichert ist. Drei getrennte Aktionen unter
`Bibliothek > Zusatzmoduloptionen` fügen diese Werte unabhängig von der Taxonomie hinzu, entfernen sie oder
aktualisieren sie aus Ortsteil, Stadt, Bundesland/Region, Land/Region, ISO-Ländercode und Aufnahmezeit. Sichtbare
flache Stichwörter erhalten eindeutige Fachendungen, beispielsweise `Deutschland (FN Ort)`,
`Schleswig-Holstein (FN Ort)`, `Juli (FN Zeit)` und `2025 (FN Zeit)`; der ISO-Code bleibt als Plug-in-
Metadatum erhalten. Taxonomie-, Orts-/Zeit- und manuelle Stichwörter werden getrennt geschützt. Bei den drei
auswahlbezogenen Aktionen findet keine katalogweite Suche oder eigener Online-Ortsdienst statt. GPS-Koordinaten werden über das dokumentierte
Rohfeld `gps` erkannt. Sind nur Lightrooms Ortsvorschläge vorhanden, exportiert das Plug-in ausschließlich die
betroffenen ausgewählten Fotos als kleine temporäre JPEGs, liest die von Lightroom eingebetteten Ortsfelder aus
XMP beziehungsweise IPTC und löscht die temporären Dateien anschließend. Dieser neue Ablauf ist automatisiert geprüft
und benötigt noch den kontrollierten Lightroom-Test.
Version 0.4.23.0 erweitert denselben persistenten Katalogindex um zwei kompakte Orts-/Zeitauswertungen. `Alle
FN-Orts-/Zeitfotos` berücksichtigt jedes Foto mit gespeicherten FN-Orts- oder FN-Zeitfeldern unabhängig von
einer Taxonomie. `Mit Taxonomie` zeigt ausschließlich deren Schnittmenge mit einer gültigen
`mtx_`-Taxonomiezuweisung. Beide Bereiche nennen Fotozahlen sowie die Anzahl und den häufigsten Wert für Länder, Regionen, Städte,
Ortsdetails, Jahre und Monate in zwei festen nebeneinanderliegenden Blöcken ohne dynamische Scrollansicht. Die drei Orts-/
Zeitaktionen sowie normale Taxonomiezuweisung und -rücknahme halten diese Aggregate inkrementell aktuell. Wegen
des erweiterten Indexschemas ist nach dem Laden dieser Version einmalig `Statistik neu aufbauen` erforderlich.
Version 0.4.23.1 gibt nach den drei eigenständigen Orts-/Zeitaktionen ausdrücklich das innerhalb des Lightroom-
Schreibcallbacks erzeugte fachliche Ergebnis zurück. Der undokumentierte SDK-Rückgabewert wird nicht mehr
irrtümlich als Zählerobjekt verwendet; die Erfolgsmeldung normalisiert ihre Zähler zusätzlich defensiv.
Version 0.4.23.2 behandelt einen allein zurückgebliebenen internen Zeitstempel nicht mehr als vollständigen FN-
Orts-/Zeitstand. Leere sichtbare FN-Felder werden dadurch beim nächsten Hinzufügen repariert statt übersprungen.
Die Aufnahmezeitkonvertierung akzeptiert sowohl einzelne Komponenten als auch eine vom SDK gelieferte
Komponententabelle und verwendet bei Bedarf den formatierten Wert desselben Lightroom-Datumsfelds.
Version 0.4.23.3 verhindert leere Suffix-Stichwörter vollständig: Erst ein nichtleerer Quellwert wird um `(FN Ort)`
oder `(FN Zeit)` ergänzt. Die Aufnahmezeit wird vorrangig aus Lightrooms Rohfeld `captureTime` gelesen; die beiden
bisherigen Datumsfelder und ihre formatierten Werte bleiben Rückfälle. Ein erneutes Hinzufügen entfernt zuvor von
0.4.23.0 bis 0.4.23.2 gespeicherte leere Suffix-Stichwörter auf den ausgewählten Fotos.
Version 0.4.23.16 liest alle Orts-/Zeitquellen vor der nicht yield-fähigen Fehlergrenze direkt an den ausgewählten
Fotos; für die Aufnahmezeit wird das öffentliche Lightroom-Feld `dateTimeOriginal` verwendet. Der
Datumsrückfall erkennt zusätzlich lokalisierte Lightroom-Werte wie `20. August 2026`. Ein Foto
ohne gespeicherte Ortsfelder erhält damit ausschließlich `August (FN Zeit)` und `2026 (FN Zeit)`; GPS ist keine
Voraussetzung. Das dokumentierte Rohfeld `gps` erkennt den Bedarf für den auswahlbezogenen Vorschlagsexport. Damit
können kursiv angezeigte Lightroom-Ortsvorschläge ohne einzelnes Bestätigen übernommen werden. Ein Fortschrittsdialog
macht den langsameren Erstlauf sichtbar und erlaubt den Abbruch vor jeder FN-Metadaten- oder Stichwortänderung. Die
programmgesteuerte Export-Session wird vor dem Warten auf die Vorschauen ausdrücklich gestartet, damit der Lauf nicht
auf der ersten Datei stehen bleibt.
Version 0.4.24.1 ergänzt zwei ausdrücklich bestätigungspflichtige Wartungsaktionen. `Alle FN-Daten entfernen ...`
entfernt von der aktuellen Auswahl Taxonomie, Art-Favorit, FN-Orts-/Zeitdaten und ausschließlich Stichwörter mit
den reservierten Endungen `(FN)`, `(FN)*`, `(FN Ort)`, `(FN Ort)*`, `(FN Zeit)` oder `(FN Zeit)*`; die Sternformen
werden nur als bereits vorhandene Lightroom-Varianten erkannt und nie neu erzeugt. `FN-Daten im Katalog
aktualisieren ...` scannt den Katalog lesend in 500-Foto-Blöcken, zeigt zunächst eine Vorschau und schreibt erst nach
Bestätigung in 250-Foto-Blöcken. Der Lauf ist zwischen Blöcken pausierbar, löst alle vorhandenen Master-IDs mit
einer gebündelten Suchhelferanfrage auf und übernimmt benötigte Lightroom-Ortsvorschläge in einer gemeinsamen
Export-Session. Automatisch aktualisiert werden nur Taxonomien, deren gespeicherte `masterTaxonId` im während des
Laufs unveränderten Suchpaket weiterhin eindeutig aktiv ist. Ungültige oder nicht mehr auflösbare IDs,
Mehrfachfavoriten und verwaiste reservierte Stichwörter ohne passende Plug-in-Metadaten werden gemeldet und nicht
erraten oder still verändert. Erfolgreiche Schreibblöcke aktualisieren zugleich den vorhandenen Statistikindex.
Schließen beendet den Lauf nach dem aktuellen Block; ein späterer Neustart ist wegen der ersetzenden Schreibweise
idempotent, besitzt aber noch keinen dauerhaft gespeicherten Wartungscheckpoint. Ein durch Lightroom angeforderter
Bestätigungsdialog für KI-Ortsvorschläge kann vom Plug-in nicht unterdrückt werden; durch die eine Export-Session
wird er für den Lauf soweit von Lightroom unterstützt gebündelt. Version 0.4.24.1 erzeugt außerdem alle innerhalb
eines Orts-/Zeit-Schreibvorgangs benötigten sichtbaren Stichwortobjekte vorab aus einer deduplizierten Namensliste.
Gemischte Auswahlen mit mehreren Januar- und Februar-Fotos fordern `Januar (FN Zeit)` beziehungsweise
`Februar (FN Zeit)` damit jeweils nur einmal bei Lightroom an und weisen dasselbe Objekt anschließend allen
passenden Fotos zu.
Version 0.4.24.2 beschriftet die beiden FN-Orts-/Zeitauswertungen zusätzlich direkt im Inhalt. Angezeigt werden die
Fotozahlen je gespeichertem Jahr, der häufigste Monat, das häufigste Land, die häufigste Region, Stadt und das
häufigste Ortsdetail sowie die jeweilige Ortsvielfalt. Wenn alle FN-Orts-/Zeitfotos zugleich eine gültige Taxonomie
besitzen, wird die identische Schnittmenge nicht ein zweites Mal vollständig ausgegeben, sondern als vollständige
Übereinstimmung erklärt.
Version 0.4.24.3 gliedert das Statistikfenster fachlich in Katalogübersicht, Datenqualität der taxonomierten Fotos,
Taxonomieumfang, Art-Favoriten, Orte, Zeiten, Klassen und häufigste Arten. Alle sichtbaren Zähler verwenden deutsche
Tausenderpunkte. Die Taxonomieabdeckung bleibt ausschließlich `masterTaxonId`-basiert; FN-Ort und FN-Zeit bilden
getrennte Qualitäts-, Orts- und Zeitaggregate. Domäne, Reich, Stamm, Klasse, Ordnung, Familie und Gattung werden aus
den jeweiligen Plug-in-Metadaten gezählt, Arten aus eindeutigen Master-IDs. Die Zeitstatistik ergänzt Spitzenwerte
für Jahr, Monat, Monat/Jahr und Aufnahmetag; der Tag wird beim bewusst gestarteten Statistikaufbau nur als Aggregat
aus `dateTimeOriginal` gelesen und weder als Metadatum noch als Stichwort gespeichert. Das dafür erhöhte
Statistikindexschema benötigt einmalig `Statistik neu aufbauen`.
Version 0.4.24.4 fasst den Kopf zu `Lifelist: X Arten` zusammen, begrenzt sämtliche Ranglisten auf fünf Einträge
und zeigt Orte sowie Zeiten in kompakten zweispaltigen Top-5-Zeilen. Datenqualität und Klassen nennen zusätzlich
ihren Anteil an den taxonomierten Fotos. Der einzelne Button `Exportieren ...` bietet die bestehende, um englischen
Namen und Ordnung erweiterte Lifelist-CSV, eine beim ausdrücklichen Export aus FN-Metadaten aggregierte
Beobachtungsliste als CSV und eine nach Klassen gruppierte kopierfreundliche UTF-8-Artenliste als TXT. Der
Beobachtungsexport liest den Katalog mit sichtbarem Fortschritt in 500er-Blöcken; er schreibt weder Metadaten noch
Stichwörter und leitet keine Orte aus GPS ab. Indexschema 5 erfordert einmalig `Statistik neu aufbauen`.
Version 0.4.24.5 übernimmt die Beobachtungsgruppen in den persistenten Statistikindex. Der bewusste
Statistikaufbau bildet nun einmalig die Kombinationen aus FN-Datum, FN-Ort und Master-Art; spätere Plug-in-Aktionen
pflegen deren Zähler inkrementell. Dadurch exportiert auch die Beobachtungsliste ohne erneuten Katalogscan direkt
aus dem Index. Ein optionaler Beispiel-Dateiname wird platzsparend ohne Fotoliste je Gruppe geführt und darf nach
dem Entfernen des Beispielbildes leer bleiben. Indexschema 6 erfordert einmalig `Statistik neu aufbauen`.
Version 0.4.24.6 verkürzt das native Lightroom-Menü auf die häufige Direktaktion `Taxonomie zuweisen` und
`FN Wildlife verwalten ...`. Das Verwaltungsfenster führt zusätzlich die Zuweisung und damit alle zehn Aktionen.
Es trennt Auswahlaktionen von katalogweiter Pflege und stellt die beiden Aktualisierungswege gemeinsam, aber mit
eindeutiger Reichweite als `Ort/Zeit der Auswahl` und `Gesamter Katalog` dar. Diese
Alternative verwendet ausschließlich dokumentierte normale Menüeinträge; die Lightroom-SDK-Dokumentation weist
für `LrLibraryMenuItems` keine nativen Untermenüs oder Trennlinien aus.
Unter `Taxonomie prüfen` kann `Artbezeichnung korrigieren ...` die ausgewählte Art über eine kurzlebige,
einmalig konsumierbare Übergabedatei im Arten-Explorer öffnen. Lightroom erhält dadurch keinen Schreibzugriff auf
den Master. Der Explorer prüft Master-ID und wissenschaftlichen Namen erneut und speichert Änderungen ausschließlich
in der versionierten Korrekturschicht. Eigene noch nicht aktive Korrekturen werden als eigener Aktualisierungsgrund
erkannt; der Korrekturdialog wird vor der ausdrücklich gestarteten Aktivierung geschlossen, sodass Phase und
Prozentwert im Datenbankblock sichtbar bleiben. Reine neue oder geänderte Namenskorrekturen werden gegen Master und
Lightroom-Paket auf dieselbe Taxon-ID geprüft und anschließend über einen gemeinsamen atomaren Zeiger innerhalb
weniger Sekunden für beide Suchen freigegeben. Die großen Basisdatenbanken bleiben unverändert; Lightroom muss nicht
neu gestartet werden. Dessen Hierarchie übernimmt weiterhin den vollständigen bevorzugten Anbieterpfad als Fallback und
überschreibt beziehungsweise ergänzt ihn rangweise mit den ausgewählten Master-Feldwerten. Dadurch bleiben
zusätzliche Zwischenränge erhalten, ohne von einem möglicherweise unvollständigen Einzelbeleg abzuhängen.
Version 0.4.15.0 verwendet innerhalb der bereits laufenden `LrTask` direkt `withWriteAccessDo` und wartet über den
offiziellen SDK-Timeout bis zu zehn Sekunden auf einen kurz belegten Katalog. Zusätzliche Fehlerkapsel und die
irreführende pauschale Übersetzung als Katalogbelegung bleiben entfernt. Callback-Abschluss und gespeicherte
`masterTaxonId` werden vor der Erfolgsmeldung ausdrücklich geprüft.

Als abgegrenzte Erweiterungen sind genau ein bestätigungspflichtiges `Favoritenbild der Art` je Art, ein idempotenter
Satz aus den drei intelligenten Sammlungen `Art-Favoriten`, `Taxonomie fehlt` und `Taxonomie zugewiesen` sowie eine
persistente Katalogstatistik mit `Lifelist`, Taxonomie-Abdeckung, drei UTF-8-Exportformaten,
kompakter Klassenübersicht und den fünf am häufigsten fotografierten Arten umgesetzt. Die Arten je Klasse stehen
vollständig in Lifelist-CSV und TXT-Artenliste; die im Lightroom-Dialog unzuverlässig skalierende Aufklappansicht wurde entfernt. Die eigene Metadatenansicht
`FN Wildlife – Foto & Taxonomie` verbindet sinnvolle Standard-Fotofelder mit Namen und den wichtigsten
Taxonomierängen. Rangfelder heißen dort knapp `Reich`, `Klasse`, `Ordnung` und entsprechend, ohne den redundanten
Zusatz `(wissenschaftlich)`; gespeichert werden weiterhin die wissenschaftlichen Taxonwerte. Für die vollständige Hierarchie steht zusätzlich `FN Wildlife – vollständige Taxonomie` bereit;
technische IDs bleiben in beiden Ansichten ausgeblendet. Der Zusatzmodul-Manager zeigt ausschließlich
Version und Status des abgeleiteten lokalen Suchpakets, während Datenbankpflege, Updates und Sicherungen zentral im
Arten-Explorer bleiben. Der Statistikindex wird kataloggebunden gespeichert und durch Plug-in-Aktionen
inkrementell aktualisiert. Sein einmaliger Aufbau läuft in einem nichtmodalen Fenster, liest jeweils 500 Fotos
gebündelt, speichert alle 5.000 Fotos einen Checkpoint und kann pausiert sowie fortgesetzt werden. Lightroom bleibt
dabei bedienbar; Yield erfolgt nur zwischen den SDK-Lesezugriffen. Eine veränderte Kataloggröße erzwingt einen
Neuaufbau. Weil das SDK keinen allgemeinen Metadatenbeobachter bereitstellt, steht für sonstige externe Änderungen
`Statistik neu aufbauen` zur Verfügung. Version 0.4.21.1 bildet die direkten Deltas aus den beabsichtigten neuen
Plug-in-Werten statt aus Lightrooms innerhalb des Schreibcallbacks noch altem Lesestand; Zuweisung und Rücknahme
wurden damit im Großkatalog praktisch bestätigt. Version 0.4.21.2 zeigt Klassen nur noch kompakt mit Art- und
Fotoanzahl. Der CSV-Export bleibt die vollständige Artenaufschlüsselung. Der globale Statistikaufbau speichert je
Art die persistenten Lightroom-Foto-UUIDs vorhandener Favoriten. Die Art-Favoriten-Aktion löst danach nur diese
UUIDs gezielt auf und schreibt ausschließlich das neue sowie tatsächlich vorhandene bisherige Favoritenbild. Das
dafür erhöhte Indexschema erfordert nach dem Wechsel auf 0.4.21.2 genau einen Neuaufbau. Der UUID-basierte
Favoritenwechsel wurde anschließend praktisch bestätigt. Ein alter oder fehlender Index verlangt sichtbar
`Statistik neu aufbauen`; beim Klick erfolgt kein versteckter Katalogscan. Die Statistik
benötigt kein Taxonomie-Datenbankupdate. Die Sammlungen werten ausschließlich die Plug-in-Metadaten
`referenceImage` und `masterTaxonId` aus und hängen nicht von normalen Fotometadaten oder Lightroom-Stichwörtern ab.
`Taxonomie zugewiesen` erkennt das reservierte Master-ID-Präfix `mtx_`; `Taxonomie fehlt` ist die ausdrücklich
ausgeschlossene Gegenmenge. Die praktisch umgekehrt ausgewerteten Leerheitsoperationen werden nicht verwendet.
Im Testkatalog wurden bei 132 Fotos und einer Zuweisung die erwarteten Werte 131 fehlend und eine zugewiesen
bestätigt. Beim erneuten Einrichten
werden bestehende Regeln auf den aktuellen Stand gesetzt; die nicht mehr benötigten Sammlungen
`5-Sterne-Tierbilder` und `Art-Referenzbilder` werden im verwalteten Sammlungssatz automatisch entfernt. Details,
Befehle und Abnahmeablauf
stehen in `docs/lightroom-search-package.md`. Lightroom
bleibt alleiniger Besitzer von Katalog- und XMP-Schreibvorgängen. Automatische KI-Artbestimmung,
iNaturalist-Synchronisation und weitere Exporte bleiben spätere, einzeln zu priorisierende Erweiterungen.

Vor dem Start von Phase 10 wurde die Bedienung am 10. August 2026 noch einmal stabilisiert. Die lokalen
Datenbank-Aktionen zeigen Referenz und Master als eine `Taxonomiedatenbank` mit dem kompakten Umfang
`Taxa · deutsche Namen · englische Namen`. Die sichere interne Kandidaten-, Konflikt-, Aktivierungs- und
Rollbackarchitektur bleibt bestehen. Konflikte mit vorhandenen Arten werden mit Lösungsvorschlag angezeigt und
niemals still übernommen. Eine bestätigte externe Artlücke kann direkt am Konflikthinweis mit der Masterdatenbank
verknüpft werden; ein späterer exakter CoL-Treffer erhält automatisch wieder Vorrang. Über
`Datenbank ansehen und korrigieren` lässt sich der aktive Offline-Bestand durchsuchen. Seine wissenschaftliche
Taxonomie bleibt schreibgeschützt, während deutsche und englische Namen kontrolliert als eigene, updatefeste
Korrektur gespeichert oder zurückgesetzt werden können. Im Tierstimmeneditor besitzen bisheriger Sound und
Schnittvorschau jeweils das passende Spektrogramm; MP3 und Spektrogramm werden bereits vor der Übernahme gemeinsam
geprüft. Start- und Endzeiten akzeptieren Punkt oder deutsches Dezimalkomma; ein unveränderter Startwert `0` wird
beim Fokussieren geleert. Auf einspaltigen
Squarespace-Artseiten gilt die Reihenfolge Portrait, Infos, Status, Taxonomie und Sound. Die zentralen deutschen
Taxonomieanzeigen wurden für die aktuell verwendeten Reiche, Stämme, Klassen, Ordnungen, Familien und Gattungen
ergänzt; der Tooltip enthält nur den unveränderten wissenschaftlichen Rohwert.

Seit dem 11. August 2026 ist die Datenbankpflege auf genau drei sichtbare Nutzeraktionen reduziert:
`Datenbank aktualisieren`, `Vorherigen Stand wiederherstellen` und `Datenbank ansehen und korrigieren`. Die erste
Aktion führt die weiterhin getrennten technischen Prüf-, Kandidaten- und Aktivierungsschritte automatisch aus. Der
Korrekturdialog zeigt zuerst konkrete offene Prüfungen der verwendeten Projektarten und bietet anschließend die
Suche im aktiven Offline-Bestand. Die CoL-Referenzlücke `Sciurus vulgaris` wird über eine exakte Abfrage der aktiven
Masterdatenbank bestätigt. Ein Klick in die Zeitleiste der Sound-Schnittvorschau verwirft diese nicht mehr.
Die drei Datenbankaktionen sind wie die Backup-Aktionen als untereinander angeordnete Karten gestaltet. Vor einem
Neuaufbau prüft `Datenbank aktualisieren`, ob ein neuer CoL- oder Anbieterstand vorliegt. Ohne neue Quelldaten und
ohne wartenden Kandidaten wird kein Neuaufbau gestartet. Ein echter Lauf ist im Kopf und im Datenbankblock gelb als
`Taxonomie-Update läuft` sichtbar; der bisherige aktive Stand bleibt bis zum erfolgreichen Abschluss erhalten.
Der lange Masteraufbau zeigt dabei seine aktuelle Phase, echte Datensatzzähler und die Laufzeit. Relevante
CoL-Zeilen und der Vergleich mit dem bisherigen Stand werden speicherschonend schrittweise verarbeitet; ein
erhöhtes Node-Heap-Limit ist nicht erforderlich. Vor dem atomaren Aktivieren oder Wiederherstellen schließt der
Explorer eigene read-only Datenbankhandles und öffnet den neuen aktiven Stand bei der nächsten Abfrage wieder.
Mehrere eigene Namenskorrekturen können gesammelt und anschließend gemeinsam über `Datenbank aktualisieren`
aktiviert werden. Ein Fingerabdruck erkennt die Abweichung auch ohne neue externe Anbieterstände. Für reine neue
oder weiterhin vorhandene geänderte Namen entsteht nur ein kleines geprüftes Korrektur-Release; ein einzelnes
atomar geschriebenes Manifest aktiviert es gleichzeitig für Arten-Explorer und Lightroom-Suche. Das Zurücksetzen
einer bereits in einem früheren Vollmaster fest eingebauten Korrektur verwendet weiterhin den vollständigen
Kandidatenbau, weil dabei die darunterliegende Anbieterpriorität neu bestimmt werden muss.

Nach einer bestätigten Master-Aktivierung oder Wiederherstellung baut der Arten-Explorer das davon abgeleitete
Lightroom-Suchpaket automatisch neu, prüft es vollständig und aktiviert es erst danach atomar. Der Paketbau läuft
in einem getrennten Hilfsprozess; Phase, Prozentwert und Laufzeit bleiben im vorhandenen Datenbankblock sichtbar.
Scheitert nur dieser letzte Schritt, bleibt das bisherige Lightroom-Paket aktiv. `Datenbank aktualisieren` erkennt
die abweichende Masterversion und wiederholt gezielt den Paketbau, ohne die Masterdatenbank erneut aufzubauen.

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

Jede große Phase endet verbindlich mit einem umfassenden Audit von Code, Daten/Schemata, Dateistruktur,
Dokumentation, Tests/Qualitätsgate sowie den betroffenen Betriebs-, Backup-, Restore- und
Veröffentlichungsabläufen. Erst nach Bereinigung oder ausdrücklich begründeter Verschiebung aller Befunde gilt die
Phase als abgeschlossen.

Phase 11 plant Mehrgeraete-Betrieb und NAS-Restore-Backups. Grundentscheidung: GitHub bleibt die zentrale
versionierte Wahrheit, jeder Rechner arbeitet lokal in seinem eigenen Projektordner, das NAS dient als
vollstaendiges ZIP-Backup. Im späteren Installer-Konzept wird außerdem erneut bewertet, ob die große lokale
Taxonomiereferenz weiterhin unter `%LOCALAPPDATA%` oder optional auf einem anderen lokalen Laufwerk gespeichert
werden soll. Bis dahin bleibt der aktuelle Standardspeicherort unverändert. Details:
`docs/multi-device-backup-plan.md`.

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

### Desktop-Prozesse und automatische Veroeffentlichung

Wenn der Arten-Explorer in Electron laeuft, werden interne JavaScript-Hilfsprozesse mit
`ELECTRON_RUN_AS_NODE=1` gestartet. Dadurch beendet sich insbesondere der Projektstatus-Abgleich nach seiner
Erfolgsausgabe wirklich und Git-Commit sowie Git-Push koennen anschliessend ausgefuehrt werden. Der Fehler, bei dem
ein Lauf nach `Projektstatus aktualisiert` dauerhaft aktiv blieb, ist damit behoben und durch einen eigenen Test
abgesichert. Ein echter Transferlauf wurde am 2026-07-19 bis zum erfolgreichen Push geprueft.

Abgelehnte Wikimedia-Commons-Sounds werden anhand ihrer kanonischen `File:`-Identitaet verglichen. Kodierte URLs,
Beschreibungspfade und Titelvarianten derselben Datei gelten dadurch als dieselbe bereits abgelehnte Quelle. Ein
vollstaendiger Lauf prueft ausserdem manuell geschuetzte Karten erneut. Eine gefundene automatische Karte wird der
bisherigen manuellen Karte gegenuebergestellt und erst nach der ausdruecklichen Pflegeentscheidung uebernommen.

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
