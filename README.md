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
- `species-taxonomy.js`: Taxonomie-Pyramide
- `species-status.js`: IUCN-Status und Populationstrend
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
- `docs/desktop-app-plan.md`
- `docs/manual-map-overrides.md`
- `docs/manual-species-fields.md`
- `docs/add-species-workflow.md`
- `docs/seo-worklist.md`
- `docs/roadmap.md`

Dokumentation ist Teil der Definition of Done: Ein Roadmap-Schritt gilt erst als abgeschlossen, wenn `AGENTS.md`,
`README.md`, `docs/roadmap.md` und betroffene Detaildokumente aktuell sind.

Bei jeder Aenderung an einer eingebundenen JavaScript-Datei muss in Squarespace die jeweilige `?v=`-Version erhoeht
werden, damit Browser- und GitHub-Pages-Caches sicher umgangen werden.

Das Squarespace Custom CSS enthaelt seit 2026-06-14 einen Mobile-only-Override fuer Grid-Galerien: Galerien mit mehr
als einer Spalte werden unter 768 px auf eine Spalte gesetzt; Desktop bleibt unveraendert.

Die Artseiten-Info-Box zeigt technische Platzhalter wie `n/a`, `U`, leere Werte und `unknown` als `Unbekannt` an,
ohne die Rohdaten in `speciesData.json` umzuschreiben.

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

- Node.js
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

Der Audit-Befehl schreibt keine Datei, sondern gibt JSON aus. Zwischenergebnisse gehoeren bei Bedarf nach
`Testlauf/`; gespeicherte Monatsberichte liegen unter `docs/audits/`.

Der Sound-Teil der Pipeline bevorzugt freie Xeno-Canto-Aufnahmen. Wenn fuer einen vorhandenen NC-Sound keine freie
Xeno-Canto-Alternative gefunden wird, sucht `update.mjs` zusaetzlich nach exakt zugeordneten freien
Wikimedia-Commons-Audiodateien mit erreichbarem MP3-Transcode und danach nach freien iNaturalist-MP3-Aufnahmen.
iNaturalist-Treffer werden nur uebernommen, wenn Taxon, Lizenz und MP3-Datei passen. Erst danach bleibt ein vorhandener
NC-Sound erhalten oder wird bei neuen Arten als Fallback genutzt.

NC-Sounds werden im Frontend nicht mit einem separaten Warnhinweis markiert. Die Information bleibt intern ueber
`credits.json`, `fehlende_elemente_report.json` und `docs/sound-license-review.md` nachvollziehbar.

Tokens duerfen nicht im Repository gespeichert werden.

## Arten-Explorer

Der Arten-Explorer begann in Phase 7.2 als read-only Arbeitsoberflaeche und erlaubt seit Phase 7.4 das kontrollierte
Bearbeiten ausgewaehlter Felder in `species_list.json`:

```bash
npm.cmd run species:explorer
```

Danach im Browser oeffnen:

```text
http://127.0.0.1:4177
```

Der Explorer zeigt:

- alle 45 aktuellen Arten aus Eingabe und Pipeline mit Suche und Filtern
- kompaktes Validierungsdashboard fuer Eingabe/Pipeline, Assetstruktur, Report-Abgleich und besondere Pflege
- manuelle Felder aus `species_list.json`
- generierte IUCN-Daten aus `speciesData.json`
- Karte, Sound, Credits und Spektrogramm je Art
- Karten vollstaendig im jeweiligen Originalseitenverhaeltnis
- kompakter Tierstimmen-Player mit integriertem Spektrogramm, Play/Pause, Zeit, Lautstaerke, Scrubbing,
  Positionsmarker und einklappbaren Quellen-/Lizenzdaten
- Klick ins Spektrogramm setzt die Position und startet die Wiedergabe sofort an dieser Stelle
- IUCN-Abrufdatum im Kopf der Detailansicht
- deutsche Statusbezeichnungen mit IUCN-Kuerzel im Statusfilter
- manuell hinzugefuegte Assets direkt in der jeweiligen Assetzeile gekennzeichnet
- Pipeline-Steuerung fuer neue/fehlende Arten oder einen vollstaendigen Lauf
- gezielten Suchlauf nur für manuell gepflegte Karten
- gezielten Suchlauf nur für NC-Sounds
- separaten permanenten Bereinigungslauf fuer geloeschte Arten und verwaiste Assetordner
- getrennte Filter fuer Datenabweichungen, Assetprobleme und alle Validierungshinweise
- drei aktive NC-Sounds
- vier manuell gepflegte Karten
- fehlende oder inkonsistente Daten und Assets
- Bearbeiten von Groesse, Gewicht und Lebenserwartung bestehender Arten
- kontrolliertes Ersetzen einer Verbreitungskarte mit JPEG-Prüfung, Alt-/Neu-Vorschau, Quelle, Pflegegrund,
  lokalem Backup, manuellem Pipeline-Schutz sowie automatischem Commit und Push
- serverseitige Validierung, Diff-Vorschau und explizite Speicherbestaetigung
- automatische lokale Sicherung vor jedem Schreibvorgang

Beim Wechsel zwischen Arten bleibt die aktuelle Fenster- und Listenposition erhalten.

Der Server bindet nur an `127.0.0.1`. Schreibzugriffe sind auf die beiden definierten Vorschau-/Speicherrouten fuer
bestehende Arten begrenzt. Er startet keine Pipeline und fuehrt keine Git-Aktionen aus. Alle anderen nicht
freigegebenen Schreibzugriffe werden mit `405` abgewiesen.
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
Die App zeigt dabei keine interne Phasenbezeichnung. In der linken Navigation bleiben maximal 15 Arten gleichzeitig
sichtbar; weitere Treffer werden innerhalb der Liste gescrollt.

Phase 7.4 stellt je Art einen Bearbeiten-Dialog bereit. Die Aktionen `Bearbeiten` und `Löschen` stehen im Artkopf
oben rechts, weil sie langfristig für die gesamte Art einschließlich manueller Daten, Karten und Sounds gelten:

- editierbar: `size`, `weight`, `life_expectancy`
- gesperrt: deutscher Name, Gattung, Art und alle generierten IUCN-Felder
- `POST /api/species/<Slug>/preview`: validiert und erzeugt eine zehn Minuten gueltige Diff-Vorschau
- `POST /api/species/<Slug>/save`: akzeptiert nur ein gueltiges Vorschau-Token
- parallele Aenderungen an `species_list.json` machen die Vorschau ungueltig
- Sicherungen werden vor dem Schreiben unter `species-explorer/backups/` angelegt und durch `.gitignore` nicht
  versioniert
- nach jedem erfolgreichen Speichern bleiben automatisch nur die neuesten 20 verwalteten Backups erhalten; andere
  Dateien im Ordner werden nicht geloescht
- nach dem Speichern zeigt das Dashboard erwartete Datenabweichungen, bis `node update.mjs` separat ausgefuehrt wurde
- der Bearbeitungsdialog weist auf gesperrte Taxonomie- und Namensfelder hin, ohne eine interne Phasennummer zu nennen

Namensaenderungen, Taxonomieaenderungen, Assetpfade, Pipeline-Aufrufe und Git-Aktionen sind nicht Bestandteil von
Phase 7.4.

Phase 7.5 zum kontrollierten Anlegen neuer Arten ist seit 2026-06-19 technisch lokal umgesetzt:

- `Neue Art` oeffnet ein Formular fuer deutschen Namen, wissenschaftlichen Namen, Groesse, Gewicht und
  Lebenserwartung. Alle Felder enthalten Beispieltexte.
- Der wissenschaftliche Name wird als ein Feld eingegeben, zum Beispiel `Turdus Merula`, und intern in
  `genus: Turdus` und `species: merula` getrennt.
- `POST /api/species/new/preview` prueft Pflichtfelder, Schreibweise, wissenschaftlichen und deutschen Namen, Slug,
  `SafeName` sowie bereits vorhandene Assetordner.
- Die Vorschau zeigt den vollstaendigen JSON-Eintrag, wissenschaftlichen Namen, Slug und erwarteten Assetordner.
- `POST /api/species/new/save` verwendet ein einmaliges Vorschau-Token, SHA-256-Dateischutz, Backup-Retention und
  atomares Schreiben.
- Nach dem Speichern erscheint die Art sofort als nur in `species_list.json` vorhanden. Pipeline und Git bleiben
  separate Schritte.
- Nach erfolgreichem Speichern koennen ohne Seitenneuladen weitere Arten angelegt werden.
- Text kann in Eingabefeldern über den Dialogrand hinaus markiert werden, ohne dass der Dialog schließt oder die
  Eingaben verloren gehen.
- Sechs Explorer-Tests sind erfolgreich; die echte Artenliste bleibt bei den Schreibtests unveraendert.
- Die Bedienung wurde mit Haubentaucher und Höckerschwan praktisch geprüft.

Aktuell stehen 47 Arten in `species_list.json` und `speciesData.json`. Haubentaucher und Höckerschwan wurden nach
erfolgreicher Bereinigung erneut angelegt und vollständig verarbeitet.

Phase 7.6 ist technisch lokal vorbereitet:

- `node update.mjs --mode=missing --dry-run`: Auswahl neuer oder fehlender Arten ohne Schreibzugriff
- `node update.mjs --mode=missing`: gezielter Lauf; übrige Bestandsdaten bleiben erhalten
- `node update.mjs --mode=all` oder weiterhin `node update.mjs`: vollständiger Lauf
- `node update.mjs --mode=manual-maps`: nur die aktuell vier manuell geschützten Karten erneut suchen
- `node update.mjs --mode=nc-sounds`: nur drei NC-Sounds auf freie Alternativen prüfen
- App-Vorschau und ausdrückliche Startbestätigung
- nur ein Prozess gleichzeitig, Statusanzeige und lokale Logs unter `species-explorer/logs/`
- nach dem Start bleibt der Dialog geöffnet und meldet `Pipeline-Lauf läuft gerade`; `Fenster schließen` schließt nur
  die Anzeige, während der Lauf im Hintergrund weiterläuft
- ein Statusbalken im Hauptfenster zeigt laufend, wartend, abgeschlossen oder fehlgeschlagen und öffnet bei Bedarf
  wieder die Prozessdetails
- nach erfolgreicher Pipeline passender Spektrogramm-Abgleich
- Artansicht kann einen Eintrag nach Vorschau und Backup aus `species_list.json` entfernen
- im Löschdialog können die zugehörigen generierten Daten und Assets per Checkbox sofort dauerhaft mitgelöscht werden
- `Bereinigen` löscht nach einer einzigen klaren Bestätigung verwaiste Daten und Assetordner dauerhaft und ohne
  Wiederherstellungsablage
- nach erfolgreichem Lauf werden die Pipeline-Dateien automatisch committed und gepusht
- neue Karten und Sounds werden vor dem Commit angezeigt; je Asset wird automatische oder manuell geschützte Pflege
  bestätigt; Kartenvorschauen sind für die Qualitätsprüfung als große Lightbox anklickbar
- manuelle Karten und NC-Sounds können unabhängig vom Komplettlauf erneut gesucht werden; bisherige Dateien bleiben
  bis zur Übernahmeentscheidung lokal gesichert
- beim Schließen des Asset-Prüfdialogs werden laufende Prüfsounds sofort gestoppt
- die Zwischenmeldung direkt nach dem Anlegen einer Art verschwindet nach erfolgreichem Pipeline-Push
- die Kopfzeile schaltet zwischen Lesemodus und Bearbeitungsmodus; Schreibaktionen werden entsprechend
  aus- beziehungsweise eingeblendet
- das klickbare Datenbank-Feld in der Kopfzeile zeigt rot `Datenbank aktualisieren` oder grün `Datenbank aktuell`
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
```

Phase 7.7.2 Kartenverwaltung ist seit 2026-06-20 technisch lokal umgesetzt. Produktive Kartenimporte werden erst
nach Vorschau bestätigt. Unterstützt werden JPEG-Dateien bis 20 MB; die App prüft Signatur, Struktur, Abmessungen,
Quelle und Pflegegrund. Bestehende Karten werden unter `species-explorer/asset-backups/` gesichert. Pro Art bleiben
höchstens drei verwaltete Kartenbackups erhalten, insgesamt höchstens 500 MB. Nach erfolgreichem Austausch werden
Karte, `species-assets-overrides.json` und `docs/manual-map-overrides.md` automatisch committed und gepusht.

Phase 7.7.3 Sound-/Credits-Verwaltung ist seit 2026-06-20 technisch lokal umgesetzt. MP3-Dateien bis 50 MB werden
nur zusammen mit vollständigen Kerncredits und einem Pflegegrund akzeptiert. Die Vorschau stellt bisherigen und
neuen Sound gegenüber, liest die Dauer im Browser und zeigt Quelle, Lizenz sowie einen NC-Hinweis. Vor dem Austausch
werden `sound.mp3`, `credits.json` und `spectrogram.webp` gemeinsam gesichert. Das alte Spektrogramm wird danach
zusammen mit Sound und Credits ersetzt; Sound und Credits erhalten manuellen Pipeline-Schutz. Der erfolgreiche
Austausch wird automatisch auf die betroffenen Assetpfade begrenzt committed und gepusht. Die gemeinsame
Backup-Retention beträgt höchstens drei Versionen je Art und Assettyp sowie 500 MB global.

Phase 7.7.4 Spektrogramm-Konsistenz ist seit 2026-06-20 technisch umgesetzt. Vor dem Speichern eines neuen Sounds
erzeugt die App automatisch ein neues WebP mit denselben FFmpeg-Parametern wie der Kommandozeilen-Generator.
Schlägt FFmpeg oder die WebP-Prüfung fehl, werden keine Produktivdateien verändert. Sound-SHA-256 und
Spektrogramm-SHA-256 werden in `species-assets-overrides.json` gespeichert und bei jedem Modellauf gegen die
aktuellen Dateien geprüft. Der vorhandene Bestand wurde ohne Neurendering registriert: 47 von 47 Spektrogrammen
sind verifiziert, keines ist veraltet. Unveränderte Generatorläufe erzeugen keine erneuten Registeränderungen.
Dreizehn Explorer-Tests sind erfolgreich; produktiver manueller Soundimport und visuelle Bedienprüfung stehen noch
aus.

Neue Arten werden nicht automatisch vorgeschlagen. Ausgewaehlte Arten koennen kontrolliert ueber den Explorer in
`species_list.json` angelegt werden; der genaue Ablauf ist in `docs/add-species-workflow.md` dokumentiert.

SEO- und KI-Findbarkeit werden in `docs/seo-worklist.md` gepflegt. Die Datei basiert auf einem Live-Sitemap-Audit und
enthaelt je URL den aktuellen SEO-Titel, die aktuelle Meta-Beschreibung, einen konsistenten Vorschlag und einen Status.
Beim Live-Audit vom 2026-05-30 passen alle per Sitemap auffindbaren Wildlife-Artseiten. Offene SEO-Restpunkte sind in
der Worklist markiert. `Kohlmeise` ist bewusst geparkt und wird spaeter aktiviert, wenn Felix die Art auf Instagram
postet. Die Costa-Rica-Uebersicht, Graureiher-Artseite und korrigierte Griechenland-Verlinkung wurden am 2026-06-01
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
aus `Testlauf/spectrogram-update.log` ins Fenster geschrieben.
Innerhalb der Windows-Batch-Datei wird `npm.cmd` mit `call` gestartet, damit der Ablauf danach mit Erfolgsmeldung,
Commit und Push fortgesetzt wird.

Die Asset-Struktur wurde in Phase 6.8 umgesetzt; Details stehen in `docs/asset-structure-plan.md`.
`species-assets/<SafeName>/` mit `map.jpg`, `sound.mp3`, `credits.json` und `spectrogram.webp` ist die einzige
produktive Struktur. Die alten Ordner `Verbreitungskarten/` und `sounds/` wurden am 2026-06-17 entfernt. Nach
GitHub-Pages-Deploy und Live-Test sind im Squarespace-Footer `species-core.js?v=1.0.4`,
`map-loader.js?v=1.0.7` und `species-sound.js?v=1.0.22` bestaetigt.

Manuell gepflegte Karten werden in `docs/manual-map-overrides.md` dokumentiert. Aktuell sind vier Karten wegen
korrupter IUCN-Kartendaten als manuell gepflegte Overrides markiert: `Blaukehlchen`, `Fischertukan`, `Rotfuchs`
und `Waldkauz`. Großtrappe, Kernbeißer und Reh werden seit der bestätigten Übernahme funktionierender automatischer
Karten am 2026-06-20 wieder durch die Pipeline gepflegt.

Spektrogramme fuer Tierstimmen sind in `docs/spectrogram-plan.md` dokumentiert. Aktueller Stand: 45 produktive
`species-assets/<SafeName>/spectrogram.webp`-Assets sind erzeugt und `species-sound.js` nutzt sie, wenn vorhanden.
Seit `species-sound.js?v=1.0.24` werden sie auf Squarespace flacher dargestellt, ohne die WebP-Dateien neu zu
erzeugen. Im Arten-Explorer sind Medien- und Datenkarten auf identische 50/50-Spalten ausgerichtet; das Spektrogramm
ist dort auf `64px` bis `84px` Anzeigehoehe begrenzt, damit mehr Platz fuer das spaetere Artportraet bleibt.
Der Footer mit Version `1.0.24` wurde von Felix am 2026-06-19 live erfolgreich getestet.
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
Zusätzlich gibt es kleine Wartungsläufe nur für manuelle Karten oder NC-Sounds, ohne alle Arten erneut abzurufen.
Die Assetverwaltung folgt danach in Phase 7.7 nach `docs/asset-management-plan.md`.
In Phase 7 folgen
spaeter Synology-NAS-Migration bzw. Spiegelung und automatisiertes Backup. Phase 8 bleibt fuer Ausbau mit
Affiliate/Shop/rechtlicher Folgepruefung geplant.

## Aktueller Datenstand

Aktueller lokaler Stand vom 2026-06-20:

- 47 Eintraege in `species_list.json`
- 47 Arten in der letzten Pipeline-Ausgabe
- 47 vollständige Assetordner
- 4 manuell gepflegte Karten wegen korrupter IUCN-Kartendaten
- 0 fehlende Sounddateien unter den 47 verarbeiteten Arten
- 0 fehlende Sound-Credits unter den 47 verarbeiteten Arten
- 0 fehlende Karten unter den 47 verarbeiteten Arten
- 3 aktive NC-Soundlizenzen: `Bisamratte`, `Brauenmotmot`, `Geoffroy-Klammeraffe`

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
