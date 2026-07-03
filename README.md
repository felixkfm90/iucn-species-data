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

```bash
npm.cmd run species:explorer
```

Danach im Browser oeffnen:

```text
http://127.0.0.1:4177
```

Der Explorer zeigt:

- alle 47 aktuellen Arten aus Eingabe und Pipeline mit Suche und Filtern
- kompaktes Validierungsdashboard fuer Eingabe/Pipeline, Assetstruktur, Report-Abgleich und besondere Pflege
- manuelle Felder aus `species_list.json`
- generierte IUCN-Daten aus `speciesData.json`
- Karte, Sound, Credits und Spektrogramm je Art
- optionales, manuell freigegebenes KI-Artportraet aus `portrait.webp` und `portrait.json`
- Karten vollstaendig im jeweiligen Originalseitenverhaeltnis
- kompakter Tierstimmen-Player mit integriertem Spektrogramm, Play/Pause, Zeit, Lautstaerke, Scrubbing,
  Positionsmarker und einklappbaren Quellen-/Lizenzdaten
- Klick ins Spektrogramm setzt die Position und startet die Wiedergabe sofort an dieser Stelle
- IUCN-Abrufdatum im Kopf der Detailansicht
- deutsche Statusbezeichnungen mit IUCN-Kuerzel im Statusfilter
- manuell hinzugefuegte Assets direkt in der jeweiligen Assetzeile gekennzeichnet
- Pipeline-Steuerung fuer neue/fehlende Arten oder einen vollstaendigen Lauf
- gezielten Kartensuchlauf fuer jede einzelne Art sowie global fuer manuell gepflegte und fehlende Karten
- gezielten Suchlauf nur fuer NC-Sounds und fehlende Sounds
- separaten permanenten Bereinigungslauf fuer geloeschte Arten und verwaiste Assetordner
- getrennte Filter fuer Datenabweichungen, Assetprobleme und alle Validierungshinweise
- vier aktive NC-Sounds
- fuenf manuell gepflegte Karten
- fehlende oder inkonsistente Daten und Assets
- Bearbeiten von Groesse, Gewicht und Lebenserwartung bestehender Arten
- kontrolliertes Ersetzen einer Verbreitungskarte mit JPEG-Prüfung, Alt-/Neu-Vorschau, Quelle, Pflegegrund,
  lokalem Backup, manuellem Pipeline-Schutz sowie automatischem Commit und Push
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
Die App zeigt dabei keine interne Phasenbezeichnung. Die linke Navigation reicht dynamisch bis zur Unterkante des
letzten Detailblocks. Dadurch haengt die gleichzeitig sichtbare Anzahl von der tatsaechlichen Detailhoehe ab;
weitere Treffer werden innerhalb der Liste gescrollt. Die Hoehe wird bei Artwechsel und Fenstergroessenaenderung
neu an der Unterkante des letzten sichtbaren Detailblocks ausgerichtet.

Phase 7.4 stellt je Art einen Bearbeiten-Dialog bereit. `Löschen` steht im Artkopf oben rechts. `Bearbeiten` steht
direkt an den bearbeitbaren Bereichen `Manuelle Daten`, `Artporträt`, `Verbreitungskarte` und `Tierstimme`; der
Dialog öffnet jeweils nur den gewählten Bereich, damit nicht alle Pflegefelder gleichzeitig sichtbar sind:

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
- 20 Explorer-Tests sind erfolgreich; die echte Artenliste bleibt bei den Schreibtests unveraendert.
- Die Bedienung wurde mit Haubentaucher und Höckerschwan praktisch geprüft.

Aktuell stehen 47 Arten in `species_list.json` und `speciesData.json`. Der Löwe ist nach dem erneuten Neue-Art-Test
wieder produktiv vorhanden.

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
- das klickbare Datenbank-Feld in der Kopfzeile zeigt rot `Datenbank aktualisieren` oder grün `Datenbank aktuell`
- der Dialog dahinter heißt `Datenbank-Aktionen` und gruppiert Aktualisieren, Backup/Einstellungen und Wartung
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

Phase 7.7.2 Kartenverwaltung ist seit 2026-06-20 umgesetzt. Produktive Kartenimporte werden erst
nach Vorschau bestätigt. Unterstützt werden JPEG-Dateien bis 20 MB oder direkte signierte JPEG-Links, z. B. ein im
Browser geöffneter IUCN-/Backblaze-Kartenlink. Die App lädt die URL serverseitig, prüft Signatur, Struktur,
Abmessungen, Quelle und Pflegegrund. Bestehende Karten werden unter `species-explorer/asset-backups/` gesichert. Pro Art bleiben
höchstens drei verwaltete Kartenbackups erhalten, insgesamt höchstens 500 MB. Nach erfolgreichem Austausch werden
Karte, `species-assets-overrides.json` und `docs/manual-map-overrides.md` automatisch committed und gepusht.
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
die JPEG-Karte ausliefert. Wenn IUCN lokal weiterhin keinen direkt speicherbaren Link liefert, kann der im Browser
sichtbare signierte Backblaze-JPEG-Link im Kartenimport als Quellen-URL eingefügt und geprüft
werden. Seit 2026-07-01 bietet der Bearbeitungsdialog dafür direkt `IUCN-Karte im Browser öffnen`; ein versteckter
Electron-/Chromium-Fallback wird nicht genutzt, weil Headless-Browserprozesse auf dem Zielsystem mit
Anwendungsfehlern abbrechen können.

Offene Bedienungswünsche für eine spätere UI-Runde:

- einzelne Assets einer Art gezielt entfernen, ohne die ganze Art zu löschen
- deutschen Artnamen umbenennen, wenn sich die deutsche Bezeichnung ändert und der wissenschaftliche Name/Slug
  gleich bleibt; dabei müssen auch Assetname/SafeName, Assetordner, Override-Einträge und Dokumentation mitwandern
- allgemeine Daten im Bearbeitungsdialog analog zum Neue-Art-Assistenten in strukturierte Felder für
  Männchen/Weibchen, Wert und Einheit aufteilen

Phase 7.7.3 Sound-/Credits-Verwaltung ist seit 2026-06-20 umgesetzt. MP3-Dateien bis 50 MB werden
nur zusammen mit vollständigen Kerncredits und einem Pflegegrund akzeptiert. Die Vorschau stellt bisherigen und
neuen Sound gegenüber, liest die Dauer im Browser und zeigt Quelle, Lizenz sowie einen NC-Hinweis. Vor dem Austausch
werden `sound.mp3`, `credits.json` und `spectrogram.webp` gemeinsam gesichert. Das alte Spektrogramm wird danach
zusammen mit Sound und Credits ersetzt; Sound und Credits erhalten manuellen Pipeline-Schutz. Der erfolgreiche
Austausch wird automatisch auf die betroffenen Assetpfade begrenzt committed und gepusht. Die gemeinsame
Backup-Retention beträgt höchstens drei Versionen je Art und Assettyp sowie 500 MB global.
Im selben Bearbeitungsdialog kann der aktuell produktive Sound abgelehnt werden. Dann sichert die App das
Soundpaket, entfernt Sound, Credits und Spektrogramm, merkt die Quellkennung unter `sound.rejectedSources`, baut den
Report neu auf und committed/pusht die Änderung. Spaetere Sound-Suchlaeufe schlagen dieselbe Quelle nicht erneut vor.
Bereits abgelehnte Quellkennungen bleiben auch dann erhalten, wenn später ein neuer Sound übernommen wird.
Fehlende, NC-Sounds oder bewusst angestoßene Alternativsuchen fuer bereits vorhandene akzeptierte Sounds koennen
gezielt fuer die aktuelle Art gestartet werden. Bei vorhandenem Sound zeigt der Bearbeitungsdialog den aktuellen
Sound direkt abspielbar an. Neu gefundene Sounds werden im strukturierten Review dem bisherigen Sound
gegenuebergestellt, mit Spektrogramm und eindeutiger Kennzeichnung `NC` oder `frei`; Klick ins Spektrogramm springt
im jeweiligen Audioplayer an die gewaehlte Stelle. Der Lauf startet im Hintergrund, ohne den Bearbeitungsdialog oder
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
Zwanzig Explorer-Tests sind erfolgreich. Phase 7.7 wurde am 2026-06-21 nach technischer Prüfung, produktivem
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
aus `Testlauf/spectrogram-update.log` ins Fenster geschrieben. Der Arten-Explorer übersetzt den Spektrogramm-Abgleich
im Prozessdialog in kurze Zeilen pro Art: Sound vorhanden/fehlt und Spektrogramm vorhanden/erstellt/Ã¼bersprungen.
Innerhalb der Windows-Batch-Datei wird `npm.cmd` mit `call` gestartet, damit der Ablauf danach mit Erfolgsmeldung,
Commit und Push fortgesetzt wird.

Die Asset-Struktur wurde in Phase 6.8 umgesetzt; Details stehen in `docs/asset-structure-plan.md`.
`species-assets/<SafeName>/` mit `map.jpg`, `sound.mp3`, `credits.json`, `spectrogram.webp` sowie
`portrait.webp` und `portrait.json` ist die einzige produktive Struktur. Noch fehlende Portraitdateien gelten im
Arten-Explorer als Assetproblem. Die alten Ordner
`Verbreitungskarten/` und `sounds/` wurden am 2026-06-17 entfernt. Nach
GitHub-Pages-Deploy und Live-Test sind im Squarespace-Footer `species-core.js?v=1.0.4`,
`map-loader.js?v=1.0.7` und `species-sound.js?v=1.0.22` bestaetigt.

Manuell gepflegte Karten werden in `docs/manual-map-overrides.md` dokumentiert. Aktuell sind fünf Karten wegen
korrupter IUCN-Kartendaten oder lokal blockiertem signiertem Kartenabruf als manuell gepflegte Overrides markiert:
`Blaukehlchen`, `Fischertukan`, `Rotfuchs`, `Waldkauz` und `Löwe`. Großtrappe, Kernbeißer und Reh werden seit der bestätigten Übernahme funktionierender automatischer
Karten am 2026-06-20 wieder durch die Pipeline gepflegt.

Spektrogramme fuer Tierstimmen sind in `docs/spectrogram-plan.md` dokumentiert. Aktueller Stand: 46 produktive
`species-assets/<SafeName>/spectrogram.webp`-Assets sind erzeugt und `species-sound.js` nutzt sie, wenn vorhanden.
Seit `species-sound.js?v=1.0.24` werden sie auf Squarespace flacher dargestellt, ohne die WebP-Dateien neu zu
erzeugen. Im Arten-Explorer sind Medien- und Datenkarten auf identische 50/50-Spalten ausgerichtet; das Spektrogramm
ist dort auf `64px` bis `84px` Anzeigehoehe begrenzt. Ein vorhandenes 4:5-Artportraet wird in die feste Portraitzelle
eingepasst und vergroessert die Medienzeile nicht. Die vollstaendige Darstellung bleibt sichtbar; fuer Details
steht die Portrait-Lightbox bereit.
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
In Phase 7 folgen
spaeter Synology-NAS-Migration bzw. Spiegelung und automatisiertes Backup. Vor Phase 7.9 wurde ein
Projektkonsolidierungs-Audit umgesetzt: `docs/project-consolidation-audit.md`. Dabei wurden lokale Altlasten
entfernt und die Pipeline von `node-fetch` auf natives Node-`fetch` umgestellt. Phase 8 bleibt fuer Ausbau mit
Affiliate/Shop/rechtlicher Folgepruefung geplant.

Phase 7.9 plant Mehrgeraete-Betrieb und NAS-Restore-Backups. Grundentscheidung: GitHub bleibt die zentrale
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

Aktueller lokaler Stand vom 2026-07-01:

- 47 Eintraege in `species_list.json`
- 47 Arten in der letzten Pipeline-Ausgabe
- 47 Karten, 46 Sounds, 46 Credits und 46 Spektrogramme
- 47 Artportraits; 0 Portrait-Assetprobleme
- 5 manuell gepflegte Karten wegen korrupter IUCN-Kartendaten oder zuletzt lokal blockiertem signiertem Kartenabruf
- 1 Soundhinweis `S`: `Grüner Leguan` hat aktuell keine verwendbare automatische Tonquelle
- 4 aktive NC-Soundlizenzen: `Bisamratte`, `Brauenmotmot`, `Geoffroy-Klammeraffe`, `Löwe`

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
