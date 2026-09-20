# Pipeline-Steuerung im Arten-Explorer

Stand: 2026-09-13

Ziel von Phase 7.6: Die bestehende Datenpipeline kontrolliert aus dem Arten-Explorer starten und dabei klar zwischen
einem gezielten Lauf fuer neue oder unvollstaendige Arten und einem vollstaendigen Lauf ueber alle Arten
unterscheiden.

Status: abgeschlossen am 2026-06-20. Vollständige und selektive Läufe, Prozessanzeige, Karte-/Sound-Entscheidung,
automatischer Commit/Push, Bereinigung, Karten-Großansicht, sichere Dialogbedienung und Soundstopp wurden praktisch
geprüft.

## Nachbesserung Kartenabruf, Veröffentlichung und Abschlussausgaben (12. September)

Beim Grünfink-Aufbau vom 12. September dokumentiert der lokale Lauf
`pipeline-20260912T074021Z-558a22c7.log` HTTP 403 am öffentlichen IUCN-Kartenendpunkt, HTTP 404 am alternativen
API-Endpunkt und eine nicht öffentlich abrufbare Cache-Datei. Ein erneuter direkter Abruf bestätigte
HTTP 403 mit HTML-Titel `Just a moment...`. Ein im Browser funktionierender Link beweist daher nicht die
Freigabe des automatischen Abrufs. Die konkrete Ursache der unterschiedlichen Browserbehandlung ist nicht belegt.

Der [GitHub-Lauf 34681451887](https://github.com/felixkfm90/iucn-species-data/actions/runs/34681451887)
scheiterte in `Quality checks` / `Run quality gate`, weil `species-assets/Gruenfink/map.jpg` fehlte.
Artefaktbau und Deployment wurden übersprungen. Es war kein Fehler des Pages-Deploy-Schritts.
Die später vorhandene Grünfink-Karte wurde bei der Reparatur nicht verändert; kein erneuter Push/Deploy ausgelöst.

- Zwischenstand vom 12. September: Nach IUCN-Zugriffsablehnungen (HTTP 401/403) wurden zunächst keine weiteren
  Windows-/Cache-Versuche ausgeführt. Dieser Abbruch wurde später zurückgenommen (siehe Reparaturversuch unten).
  Das historische Qualitätsgate prüfte diesen Zwischenstand, nicht die anschließend wiederhergestellten Fallbacks.
- Bei dieser externen Zugriffssperre: Karte im Browser herunterladen und im vorhandenen Karteneditor als
  JPEG-/PNG-Datei auswählen. Das ist ein kontrollierter Ersatzweg, **keine Wiederherstellung eines automatischen
  Downloads** und kein Umgehen der Schutzseite. Ein langfristig freigegebener maschineller IUCN-Kartenzugang
  bleibt eine externe Voraussetzung.
- Vor den Git-Aktionen eines Pipeline-/Transferlaufs läuft dieselbe Medienprüfung wie im CI-Gate.
  Fehlende/ungültige Medien stoppen die Übertragung vor dem Vormerken. Bereits verarbeitete Daten bleiben
  lokal erhalten. Nach Ergänzung im Explorer kann `Änderungen übertragen` erneut gestartet werden.
  Die Vorprüfung ersetzt weder das vollständige Qualitätsgate noch einen erfolgreichen Pages-Lauf.
- Interne Aufrufe von `update.mjs` verwenden `--quiet-report`: Der Fehlstellenbericht wird weiterhin
  geschrieben, seine komplette Detailausgabe aber nicht bei jedem Teilschritt wiederholt. Direkte CLI-Läufe
  behalten die ausführliche Ausgabe, sofern die Option nicht gesetzt ist.
- Der Spektrogramm-Abgleich endet mit `Spektrogramm-Ergebnis`, nicht mit einer vermeintlichen
  Gesamtzusammenfassung. Ein Sound-only-Lauf bezeichnet Karten als `nicht geprüft`; umgekehrt gilt das
  für Sounds im Karten-only-Lauf.
- `finishPipelineRun` schreibt eine `Gesamtzusammenfassung` für Erfolg oder Fehler, mit Git-Übertragungsstatus
  und ausdrücklich dem **letzten gespeicherten Gesamtbestand**. War keine Übertragung nötig, behauptet der
  Lauf keinen Commit/Push. Wartende Assetentscheidungen sind noch kein Abschluss. Eine erneute Finalisierung
  ersetzt die vorherige Zusammenfassung statt sie zu verdoppeln. Git-Push und erfolgreiches Pages-Deployment
  werden ausdrücklich unterschieden.

Regressionen: HTTP-Sperre ohne Wiederholungsabruf und ohne Kartenüberschreibung; freigegebene Antwort nach
geprüfter Weiterleitung; lokale Medienprüfung; ein echter Controller-Transfer mit simulierten Git-Prozessen
stoppt bei fehlender Karte und läuft nach Ergänzung erfolgreich weiter. Keine echten Git-/Produktivaktionen
in diesen Tests. Eine praktische Explorer-Abnahme der neuen Meldungen steht noch aus.

Prüfstand 2026-09-12: Alle 21 gezielten Anbieter-, Medien- und Pipeline-Tests bestanden; das vollständige
`npm.cmd run --silent quality:ci` erfolgreich (Exitcode 0). `git diff --check` ohne Befunde.

Squarespace-Footer und dessen `?v=`-Stände wurden geprüft: Diese Nachbesserung betrifft ausschließlich lokale
Pipeline-/Explorer-Module, keine dort eingebundenen Frontend-Dateien; kein Versionswechsel im Footer erforderlich.

Zusatzbefund Zeichenkodierung: In den Windows-WebRequest-Logs standen bereits beschädigte Umlaute in
`Unzulässig` und `zurückgegeben`. Beide Karten-Hilfsprozesse legen jetzt ihre Ausgabe ausdrücklich auf UTF-8
fest; Node liest dieselbe Kodierung. Pipeline-stdout und -stderr werden getrennt über Paketgrenzen dekodiert
und zu vollständigen Zeilen zusammengesetzt. Tests prüfen echte Windows-JSON-Ausgabe ohne Netzwerk sowie
byteweise geteilte Umlaute, Emoji und letzte Zeilen ohne Umbruch. Historische Logs werden nicht umgeschrieben.
Nach dieser Zusatzkorrektur: 23 gezielte Anbieter-/Medien-/Pipeline-Tests bestanden, einschließlich der echten
Windows-Ausgabeprüfung; Stil-, Dokumentations- und Syntaxprüfung bestanden. Das vollständige Qualitätsgate
wurde für den unmittelbar vorherigen Stand ausgeführt, für diese Zusatzkorrektur nicht erneut.

## Lesender Kartenquellentest vom 12. September 2026, 19:48 MESZ

Auf Wunsch alle 57 Assessment-Kartenendpunkte aus `speciesData.json` geprüft, einschließlich Arten mit
bereits vorhandener Karte. Je Endpunkt ein sequenzieller GET mit den aktuellen Headern und dem vorhandenen
IUCN-Token, eine Sekunde Pause, 15 Sekunden Timeout und begrenztem Antwortumfang. Keine Tokens protokolliert.
Geprüft wurde `https://www.iucnredlist.org/api/v4/assessments/<Assessment ID>/distribution_map/jpg`, also der
erste Download-Endpunkt im aktuellen Adapter; keine erneuten Windows-/Cache-Versuche nach Zugriffsablehnung.

Ergebnis: **57 von 57 HTTP 403**, jeweils HTML-Schutzseite mit Titel `Just a moment...`; **0 gültige JPEGs**,
keine Netzwerkfehler oder HTTP-429-Antworten. Betroffen sind damit in diesem Test nicht nur Grünfink,
sondern sämtliche hinterlegten Assessment-Endpunkte. Ein nötiger automatischer Neuabruf würde mit dem
aktuellen Ablauf bei allen 57 Arten an dieser Sperre enden. Das beweist weder ein Fehlen der Karten noch die
Ursache oder Dauer der unterschiedlichen Browserbehandlung. Andere Zugangswege wurden nicht pauschal getestet.

Alle 57 lokalen Karten waren vor und nach dem Test vorhanden und per SHA-256 unverändert. Keine Bilddateien
gespeichert, keine Assessment-Marker geändert, kein Pipeline-/Git-/Deploy-Lauf gestartet. Temporäres Testskript
nach Abschluss entfernt. Automatischer Kartenabruf bleibt ein offener Betriebsbefund vor dem Audit.

## Reparaturversuch und verbleibende Zugangsgrenze (12. September)

Der frühere erfolgreiche Weißstorch-Lauf vom 3. September ist im lokalen Log
`pipeline-20260903T172348Z-a2226d68.log` belegt: Windows-WebRequest lieferte eine Karte. Der Kartenadapter
war laut Git-Historie seit Commit `f391ce2` vom 18. Juli unverändert. Beim ursprünglichen Grünfink-Fehler am
12. September lief dieser Windows-Weg noch und scheiterte bereits mit HTTP 403. Der später hinzugefügte
Abbruch nach HTTP 401/403 ist eine zusätzliche Verhaltensänderung, nicht die Ursache dieses ursprünglichen
Grünfink-Fehlers. Der 57-Arten-Test prüfte nur direkte Node-Abrufe, nicht den früheren vollständigen Ablauf.

Im anschließenden Reparaturversuch liefert die reguläre, angemeldete API
`GET https://api.iucnredlist.org/api/v4/assessment/<ID>` für Weißstorch (`281839847`) und Grünfink
(`132000123`) jeweils HTTP 200. Beide Antworten enthalten `assessment_ranges: true` und
`assessment_points: false`, jedoch keinen JPEG-Downloadlink. Die existierenden Token sind damit für diese
Datenabfragen nutzbar; eine grundsätzlich ausgefallene Anmeldung ist für diese Aufrufe ausgeschlossen.
Die Ursache der abweichenden Behandlung der Karten-Programmanfragen bleibt unbewiesen.

**Reparaturstand:** Der frühere Windows-WebRequest-Fallback wird nach einem direkten 403 wieder versucht;
auch Cache-/Backblaze-Prüfungen bleiben erreichbar. Der Windows-403 wird nicht mehr als vorzeitiger
Abbruchfehler weitergereicht. Das stellt den historischen Weißstorch-Ablauf wieder her,
ist aber noch kein Beleg für einen erfolgreichen aktuellen Grünfink-Download. Ein regulärer Bildlink aus dem
Browser-Network-Auszug kann als zusätzlicher, gezielt geprüfter Weg ergänzt werden. Kein Produktionslauf,
Kartenersatz und kein Commit/Push in diesem Reparaturversuch. Meldungs-/Kodierungsverbesserungen und
Bestandsschutz sind nicht mit einem erfolgreichen aktuellen Download gleichzusetzen.

Der vollständige Browser-Network-Auszug nennt
`https://www.iucnredlist.org/api/v4/assessments/132000123/distribution_map/jpg` mit HTTP 200,
`content-type: image/jpeg`, `filename="T22720330A132000123.jpg"` und rund 581 kB.
Die frühere Einordnung als Host ohne `www` war falsch. Der Adapter versucht `www` zuerst;
der Windows-WebRequest-Fallback gilt für beide Hosts. Der jüngste Benutzerlauf scheitert weiterhin mit 403.
Das belegt eine unterschiedliche Behandlung der Zugänge, nicht deren konkrete Ursache oder ein Speicherverbot.
Der Karten-Webrequest sendet dabei keinen Bearer-Token an den Website-Bildendpunkt; der Token bleibt auf
`api.iucnredlist.org`-JSON-Anfragen beschränkt. Das entspricht dem vorliegenden Browser-Network-Auszug.
Die Explorer-Hinweise wurden an diesen Befund angepasst: Sie verlangen keinen nicht vorhandenen Backblaze-Link
mehr, sondern nennen den Browser-Dateiimport als Fallback; eine Quellen-URL wird nur bei tatsächlich sichtbarem
signiertem Link angeboten. Die Squarespace-Frontend-Dateien bleiben davon unberührt.

## Vereinfachter Dateiimport im Karteneditor (13. September)

Der akzeptierte Ersatzweg vereinfacht nur die lokale Übernahme einer vom Benutzer gespeicherten Karte.
Es werden keine Browser-Sitzungen übernommen und keine geschützten Antworten automatisch nachgeladen.
Der Neue-Art-Assistent behält seinen bisherigen manuellen Import; dieser Schritt betrifft den Karteneditor.

1. Art auswählen und bei der Verbreitungskarte `Bearbeiten` öffnen.
2. `IUCN-Karte im Browser öffnen` wählen und im normalen Browser `Bild speichern unter …` verwenden.
   Der Button trägt ausschließlich die bekannte Quellenadresse ein, er lädt keine Datei im Explorer nach.
3. Die gespeicherte JPEG-/PNG-Datei in das beschriftete Feld ziehen oder über die Dateiauswahl öffnen.
   Prüfung und Vergleichsvorschau starten automatisch. `Karte prüfen` bleibt für korrigierte Angaben und
   den bisherigen ausdrücklichen URL-Import verfügbar.
4. Bisherige und neue Karte visuell vergleichen. Erst `Karte ersetzen` schreibt mit vorhandener Sicherung,
   Quellrevisionsschutz und manuellem Pipeline-Schutz. Im normalen Explorer bleibt die Änderung lokal;
   `Änderungen übertragen` veröffentlicht sie später. Die API-Warnung berücksichtigt die explizite
   `publishAssetChanges`-Konfiguration statt stets einen automatischen Push anzukündigen.

Ohne eigenen Pflegegrund wird `Karte als lokale Datei importiert.` als editierbarer Vorschlag eingesetzt.
Erkannte IUCN-Dateinamen `T<Taxon>A<Assessment>.jpg` (auch Downloads mit `(1)`-Suffix) ergänzen bei passender
Assessment-ID eine leere beziehungsweise bisherige Quellenadresse. Eigene abweichende Quellen werden nicht
überschrieben. Generische Dateinamen erfinden keine IUCN-Quelle. Eine erkannte andere Assessment-ID blockiert
die Auswahl; das ist eine Plausibilitätsprüfung, kein Beweis des Bildinhalts. Umbenannte Dateien sind visuell
der richtigen Art zuzuordnen.

Die Ablage akzeptiert genau eine nicht leere Datei bis 20 MB. Links, HTML und Mehrfachablagen werden nicht
automatisch geladen. Die bestehende Serverprüfung kontrolliert Bildsignatur, Struktur und Abmessungen und
konvertiert PNG nach JPEG. Eine falsche Auswahl entwertet vorherige Vorschauen. Änderungen an Grund oder
Quelle sperren das Speichern bis zur erneuten Prüfung. Während Prüfung/Speicherung verhindern Sperren
Doppelklicks und Dialogschließen; verspätete Antworten nach einem Reset aktivieren keine alte Vorschau.
Beim Schließen/Öffnen wird die ausgewählte Datei verworfen. Kein neuer automatischer Katalog-/Projektlauf.

Regressionen liegen in `species-explorer/app-editor-map.test.mjs` und laufen mit `test:frontend-editor-files`
im Qualitätsgate. API-/Medientests decken PNG-Konvertierung, Vorschau, Backup, manuellen Schutz und einmalige
Vorschau-Token ab. Am 13. September hat der Benutzer den Dateiimport praktisch bestätigt, einschließlich
direkter Ablage aus dem Browser. Die pauschale manuelle Pflegekennzeichnung und der reguläre automatische
IUCN-Abruf werden als letzter fachlicher Punkt vor dem Audit erneut geprüft; siehe `roadmap.md`, Punkt 8.

Prüfstand 2026-09-13: 11 neue Ablauf-Tests erfolgreich; zusammen mit Dateihilfen und Modulverträgen 21 Tests.
Weitere 13 Medien-, Kartenimport- und UI-Vertragstests erfolgreich. Vollständiges `npm.cmd run --silent quality:ci`
bestanden (Exitcode 0), einschließlich Lightroom-Vertrag und lokaler Medienprüfung. Der erste eingeschränkte
Versuch scheiterte an `spawn EPERM` im vorhandenen Windows-UTF-8-Test; der erneute Lauf mit erlaubtem
Hilfsprozessstart bestand. Keine produktiven Asset-, Pipeline-, Commit- oder Push-Aktionen dieses Arbeitsschritts.

Squarespace-Footer und Custom-CSS-Referenz geprüft: Geändert sind nur lokale Explorer-Dateien, keine dort
eingebundenen Skripte oder Styles. Keine Squarespace-Versionsänderung und keine Lightroom-Änderung erforderlich.

## Bedienoberfläche

Die Prozesssteuerung belegt keinen eigenen Seitenbereich. In der Kopfzeile steht das klickbare Feld
`Änderungen übertragen` beziehungsweise `Datenbank aktuell`. Bei manuellen Eingabeabweichungen oder lokal
gespeicherten Assetaenderungen oeffnet ein Klick direkt den Transferlauf; dabei werden keine Karten oder Sounds
gesucht. Dieser Übertragungsweg bleibt auch im Lesemodus sichtbar. Ohne offene Abweichungen oeffnet das Feld nur im
Bearbeitungsmodus den Dialog `Datenbank-Aktionen`.

Der Pipeline-Dialog fragt zuerst die Laufart ab:

- neue oder unvollstaendige Arten
- alle Arten
- manuell gepflegte und fehlende Karten erneut automatisch suchen
- NC-Sounds und fehlende Sounds erneut prüfen
- dauerhafte Bereinigung

Zusätzlich kann eine einzelne Art über `Art aktualisieren` direkt aktualisiert werden. Die App fragt nur kurz
`Automatische Aktualisierung für <Art> wirklich ausführen?` ab und startet danach den gezielten Lauf im Hintergrund,
ohne den allgemeinen Dialog `Datenbank-Aktionen` zu öffnen.

Status und letzte Prozessausgabe werden im selben Dialog `Datenbank-Aktionen` angezeigt. Nach dem Start bleibt der Dialog geöffnet und
meldet ausdrücklich `Pipeline-Lauf läuft gerade`. Der bisherige Button `Abbrechen` heißt ab diesem Zeitpunkt
`Fenster schließen`, weil er nur den Dialog schließt und den Prozess nicht beendet. Ein zusätzlicher Hinweis erklärt,
dass der Lauf im Hintergrund weiterläuft. Nach erfolgreichem Ende wechselt die Meldung auf
`Pipeline-Lauf abgeschlossen`; Fehler und die wartende Assetprüfung erhalten eigene Zustände.

Parallel zeigt das Hauptfenster unter der Kopfzeile einen dauerhaften Statusbalken. Dadurch bleiben laufender,
wartender, abgeschlossener oder fehlgeschlagener Lauf auch nach dem Schließen des Dialogs sichtbar. Über
`Details anzeigen` lässt sich der Statusdialog erneut öffnen. `X`, `Abbrechen` und `Fenster schließen` schließen seit
2026-06-29 den Dialog wieder zuverlässig; laufende Prozesse laufen im Hintergrund weiter. Im Lesemodus ist der Start einer Pipeline
ausgeblendet; ein bereits laufender Status bleibt trotzdem sichtbar.

Nach dem Speichern einer neuen Art öffnet der Explorer automatisch die Vorschau `Neue oder fehlende Arten`.
Der Lauf kann dort sofort gestartet oder abgebrochen werden. Beim Abbrechen bleibt die neue Art als ausstehender
Eintrag sichtbar und kann später über die Kopfzeile verarbeitet werden.

## Ausgangslage

`node update.mjs` verarbeitet derzeit immer die komplette `species_list.json`. Das ist fuer regelmaessige
Vollpruefungen richtig, aber unnoetig aufwendig, wenn gerade nur eine neue Art wie der Haubentaucher angelegt wurde
oder einzelne Daten beziehungsweise Assets fehlen.

Die Explorer-Validierung kennt bereits:

- Arten nur in `species_list.json`
- fehlende IUCN-Kernfelder
- fehlende Karten, Sounds, Credits und Spektrogramme
- Abweichungen zwischen Eingabe und Pipeline-Ausgabe
- Reportabweichungen

Diese Informationen bilden die Auswahlgrundlage fuer einen gezielten Lauf.

## Laufarten

### Neue oder unvollstaendige Arten

Die App ermittelt vor dem Start eine konkrete Artenliste. Aufgenommen werden Arten mit mindestens einem dieser
Merkmale:

- nur in `species_list.json`, aber noch nicht in `speciesData.json`
- geaenderte manuelle Eingabefelder aus `species_list.json`, zum Beispiel Groesse, Gewicht oder Lebenserwartung
- fehlende Assessment-ID, Status, Kategorie oder Trend
- fehlende Karte
- fehlender Sound oder fehlende Credits
- fehlendes Spektrogramm

Vor dem Start zeigt die App:

- Laufart `Neue/Unvollstaendige Arten aktualisieren`
- Anzahl und Namen der betroffenen Arten
- Gruende je Art
- voraussichtlich ausgefuehrte Schritte

Ein gezielter Lauf darf nicht die nicht ausgewaehlten Arten aus `speciesData.json` oder dem Report entfernen.
Globale Ausgabedateien muessen deshalb aus den aktualisierten Zielarten und den unveraendert uebernommenen
Bestandsarten neu zusammengesetzt werden.

### Änderungen übertragen

Dieser Kopfzeilenlauf ist bewusst enger als `Neue/Unvollstaendige Arten aktualisieren`. Er verarbeitet bereits
vorhandene Arten, bei denen Groesse, Gewicht, Lebenserwartung oder andere manuelle Eingabefelder in
`species_list.json` von `speciesData.json` abweichen, und veroeffentlicht zusaetzlich lokal gespeicherte
Assetaenderungen aus der Explorer-Oberflaeche. Fehlende Assets wie Sound, Credits oder Spektrogramm werden in diesem
Lauf ignoriert, damit bewusst fehlende oder separat gepflegte Assets nicht nebenbei erneut gesucht werden.
Der Server schreibt geaenderte Eingabefelder direkt in `speciesData.json`, nimmt lokale Dateiaenderungen aus den
bekannten Projektpfaden in die Vorschau auf und veroeffentlicht danach einen gemeinsamen Commit und Push.

### Vollstaendiger Lauf

Diese Laufart entspricht dem bisherigen Verhalten von:

```bash
node update.mjs
```

Alle Eintraege aus `species_list.json` werden verarbeitet. Dieser Lauf bleibt fuer regelmaessige Gesamtabgleiche,
Lizenzsuche, IUCN-Aktualisierungen und den Monatscheck erforderlich.

Manuell geschuetzte Karten werden in diesem Modus nicht mehr still uebersprungen. Der Lauf versucht fuer sie eine
aktuelle automatische Karte zu laden und zeigt bei Erfolg die bisherige manuelle und die gefundene automatische
Karte nebeneinander. Die bestehende Karte bleibt erhalten, bis die Entscheidung ausdruecklich gespeichert wurde.

### Electron-Prozessgrenze

Der Desktop-Wrapper verwendet fuer interne Node-Skripte ebenfalls `process.execPath`. Unter Electron ist dieser
Pfad jedoch `electron.exe`. Deshalb fuegen `pipeline-controller.mjs` und `project-publication.mjs` fuer genau diese
Unterprozesse `ELECTRON_RUN_AS_NODE=1` ein. Ohne diese Prozessgrenze konnte `scripts/project-status.mjs` zwar die
Erfolgsmeldung ausgeben, aber offen bleiben; der Lauf erreichte dadurch Git-Commit und Git-Push nicht. Die Korrektur
ist direkt getestet und wurde am 2026-07-19 mit einem echten Transfer bis zum Push geprueft.

Vor dem Start zeigt die App:

- Laufart `Alle Arten vollstaendig aktualisieren`
- aktuelle Artenzahl
- deutlichen Hinweis auf die laengere Laufzeit und alle externen API-Abfragen

### Manuelle und fehlende Karten erneut suchen

Der Kartensuchlauf wählt Arten aus, deren Karte in `species-assets-overrides.json` als manuell geschützt markiert
ist, sowie Arten mit fehlender `map.jpg`. Die aktuelle Liste steht in `docs/project-status.md`; fehlende Karten
werden bei Bedarf zusätzlich verarbeitet.

- IUCN-Daten und Sounds bleiben unverändert.
- Die vorhandene Karte wird vorübergehend lokal gesichert.
- Nur eine gültige JPEG-Antwort mit plausibler Mindestgröße ersetzt die Arbeitskopie.
- `Automatische Karte übernehmen` behält die neue Karte und entfernt den manuellen Schutz.
- Eine neu gefundene Karte kann auch abgelehnt/übersprungen werden; dann wird sie entfernt beziehungsweise die
  vorherige Karte wiederhergestellt.
- Das Register und `docs/manual-map-overrides.md` werden dabei gemeinsam aktualisiert.
- Eine ausdrückliche `manual: false`-Entscheidung im JSON-Register hat Vorrang vor einem veralteten
  Markdown-Eintrag. Dadurch erscheint eine übernommene automatische Karte sofort nicht mehr unter manueller Pflege.
- `Bisherige manuelle Karte behalten` beziehungsweise `Bisherige automatische Karte behalten` stellt die gesicherte
  Karte wieder her; die Beschriftung richtet sich nach dem vorherigen Pflegezustand.
- Seit 2026-06-27 beendet `update.mjs` den Prozess nach erfolgreichem Abschluss explizit, nachdem stdout und stderr
  geleert wurden. Damit bleibt der Explorer nach einem abgeschlossenen Kartensuchlauf nicht mehr im Status
  `Pipeline-Lauf läuft gerade` hängen und kann die Übernahme-/Ablehnentscheidung anzeigen.
- Seit 2026-06-29 prüft `update.mjs` neben dem direkten IUCN-Kartenendpunkt eine Fallback-Strategie fuer gecachte
  Einzelkarten. Seit 2026-07-02 versucht der automatische Abruf zuerst den bisherigen IUCN-Web-Endpunkt mit
  browsernahen Headern, danach den offiziellen IUCN-API-Host mit Token und extrahiert signierte Backblaze-Links aus
  Redirect-, HTML- und Fehlerantworten als `cached-individual-maps`-URL. Seit 2026-09-12 beendet eine ausdrückliche
  IUCN-Ablehnung (401/403) den automatischen Abruf ohne weitere Windows-/Cache-Versuche; Ersatzweg ist der
  Datei-Upload. Der Windows-Fallback bleibt für vorübergehende technische Fehler verfügbar. Wenn kein direkt speicherbarer Link geliefert
  wird, kann der im Browser sichtbare signierte Backblaze-JPEG-Link weiterhin im Kartenimport als Quellen-URL
  eingefügt und geprüft werden. Seit 2026-07-01 zeigt der Karten-Bearbeitungsdialog dafür direkt `IUCN-Karte im
  Browser öffnen`. Im Neue-Art-Assistenten steht derselbe manuelle URL-Schritt zur Verfügung; die Karte kann dort
  während einer pausierten Assetprüfung geprüft und übernommen werden. Der versteckte Electron-/Chromium-Fallback
  wurde verworfen, weil Headless-Browserprozesse auf dem Zielsystem mit Anwendungsfehlern abbrechen.
- Seit 2026-07-10 versucht der Windows-WebRequest-Fallback den IUCN-Kartenabruf bis zu drei Mal, damit kurzzeitige
  503-Antworten nicht sofort in den manuellen Kartenworkflow führen. Der Kartenimport kann außerdem die offizielle
  IUCN-API-URL direkt prüfen; falls der Browser dort auf einen signierten Backblaze-Link weitergeleitet wird, lädt
  der lokale Explorer die JPEG-Datei über denselben Windows-Fallback.
- Nach still gestarteten Kartenläufen aktualisiert der Explorer Kopfstatus, Validierung und offene
  Änderungsanzeige, ohne den aktuell geöffneten Bearbeitungsdialog zu schließen oder vollständig neu aufzubauen.

### NC- und fehlende Sounds erneut suchen

Der globale Soundsuchlauf wählt vorhandene, nicht manuell geschützte Sounds mit NC-Lizenz und Arten ohne
Sounddatei aus. Ein gezielter Einzellauf aus dem Bearbeitungsdialog darf zusätzlich für eine Art mit bereits
vorhandenem akzeptiertem Sound eine Alternative suchen. Dabei wird die aktuelle Quellkennung nur für diesen Lauf
übersprungen; nach freien Kandidaten werden auch die Xeno-Canto-Fallback-Stufen geprüft.

- IUCN-Daten und Karten bleiben unverändert.
- Sound, Credits und Spektrogramm werden vorübergehend lokal gesichert.
- Die Suche prüft freie Xeno-Canto-, Wikimedia-Commons- und iNaturalist-Alternativen.
- `Gefundenen Sound übernehmen (NC)` beziehungsweise `Gefundenen Sound übernehmen (frei)` übernimmt den neu
  gefundenen Kandidaten und kennzeichnet die Lizenzart eindeutig.
- `Bisherigen Sound behalten` stellt Sound, Credits und Spektrogramm wieder her, wenn ein Bestand vorhanden ist.
- `Gefundenen Sound ablehnen und weiter suchen` stellt den vorherigen Bestand wieder her beziehungsweise entfernt bei vorher
  fehlendem Sound die neu erzeugten Sounddateien wieder. Die Quellkennung wird in `species-assets-overrides.json`
  gespeichert und bei spaeteren Sound-Suchlaeufen uebersprungen. Pro Art koennen beliebig viele Quellen abgelehnt
  werden.
- Wenn ein Kandidat zwar gefunden, aber nicht übernehmbar ist, prüft `update.mjs` im selben Lauf weitere Xeno-Canto-,
  Wikimedia-Commons- oder iNaturalist-Kandidaten. Nur eine echte Windows-Dateisperre auf `sound.mp3` beendet den
  Speicherversuch mit einer klaren Sperrmeldung, weil dann kein Kandidat sicher ersetzt werden kann.
- Bei vorhandenen Sounds zeigt der Review den bisherigen Sound und den gefundenen Kandidaten nebeneinander mit
  jeweils eigenem Player und Spektrogramm. Ein gezielter Alternativlauf überspringt die aktuell gespeicherte Quelle
  temporär, damit nicht derselbe Sound erneut vorgeschlagen wird.
- Im Bearbeitungsdialog wird der aktuelle Audioplayer vor dem Alternativlauf ersetzt und kurz freigegeben, damit
  eine pausierte Vorschau unter Windows keine produktive MP3-Dateisperre hält.

### Dauerhafte Bereinigung

Die Bereinigung ist eine eigene Aktion und wird nie automatisch an einen Update-Lauf angehaengt. Sie sucht:

- nicht mehr benötigte Einträge in `speciesData.json`
- verwaiste Ordner unter `species-assets/`
- veraltete Einträge in `lastSavedAssessmentId.json`
- verwaiste Einträge in `species-assets-overrides.json`

Die App zeigt die betroffenen Datensätze, Ordner und Dateigrößen. Nach genau einer Bestätigung werden diese Inhalte
dauerhaft gelöscht und sind nicht wiederherstellbar. Details: `docs/delete-species-workflow.md`.

Seit 2026-06-28 arbeitet die Bereinigung transaktional: verwaiste Assetordner werden zuerst nach
`species-explorer/cleanup-trash/` verschoben, danach werden Daten, Register und Report geschrieben und erst danach
werden die verschobenen Ordner endgueltig geloescht. Wird eine Datei unter Windows noch gesperrt, bleiben die
produktiven JSON-Dateien dadurch trotzdem konsistent.

## Technische Reihenfolge

1. `update.mjs` um eine interne Artenauswahl erweitern: umgesetzt.
2. Rueckwaertskompatibilitaet erhalten: Aufruf ohne Parameter bleibt ein vollstaendiger Lauf: umgesetzt.
3. Auswahlmodus fuer neue/fehlende Arten einfuehren: umgesetzt.
4. Vorschau-/Dry-run-Modus fuer die Artenliste einfuehren: umgesetzt.
5. Start-, Status- und Log-API mit Einzellauf-Sperre ergaenzen: umgesetzt.
6. Bedienoberflaeche mit Vorschau und expliziter Startbestaetigung anbinden: umgesetzt.
7. Separaten permanenten Bereinigungslauf anbinden: umgesetzt.
8. Echten gezielten App-Lauf mit Höckerschwan prüfen: erledigt am 2026-06-20, Commit `55fda06`.

Geplante Kommandozeilenform:

```bash
node update.mjs --mode=missing --dry-run
node update.mjs --mode=missing
node update.mjs --mode=all
node update.mjs --mode=manual-maps
node update.mjs --mode=nc-sounds
node update.mjs --mode=missing --species=acanthisflammea
node update.mjs --report-only
```

Bereinigung:

```bash
npm.cmd run --silent cleanup:species -- --dry-run
npm.cmd run --silent cleanup:species
```

## Sicherheitsregeln

- Es darf immer nur ein Pipeline-Lauf gleichzeitig aktiv sein.
- Vor dem Start werden benoetigte Umgebungsvariablen geprueft, aber niemals im Browser oder Log ausgegeben.
- Start erst nach sichtbarer Vorschau und ausdruecklicher Bestaetigung.
- Nach erfolgreichem Lauf, Assetprüfung und Report-Abgleich werden die vorgesehenen Pipeline-Dateien automatisch
  committed und gepusht.
- Manuelle Asset-Overrides muessen auch im gezielten Lauf respektiert werden.
- Prozessausgabe, Startzeit, Laufart, Zielarten, Exit-Code und Fehler werden lokal protokolliert.
- Logs werden unter `species-explorer/logs/` geschrieben, auf 20 Dateien begrenzt und nicht versioniert.
- Nach Erfolg oder Fehler laedt der Explorer Daten, Assets und Validierung neu.
- Während des Laufs bleibt der Prozess als `Pipeline-Lauf läuft gerade` im Dialog und im Hauptfenster sichtbar.
- Das Schließen des Statusdialogs beendet keinen Lauf; der Button heißt deshalb nach dem Start `Fenster schließen`.
- Nach Ende bleibt `Pipeline-Lauf abgeschlossen` beziehungsweise die Fehlermeldung sichtbar.
- Die Meldung direkt nach dem Anlegen einer Art wird nach erfolgreichem Pipeline-Commit und Push entfernt.
- Ein fehlgeschlagener Teillauf darf vorhandene gute Daten nicht durch leere oder unvollstaendige Ergebnisse
  ersetzen.
- Die Bereinigung löscht nur Pfade, die nach Auflösung sicher innerhalb von `species-assets/` liegen.
- Der Bereinigungsmodus wird im Plan und beim Prozessstart ausdrücklich als `cleanup` weitergegeben.

## Spektrogramme

Nach erfolgreicher Soundaktualisierung wird der Spektrogramm-Schritt passend zur Laufart ausgefuehrt:

- gezielter Lauf: nur ausgewaehlte Arten mit neuem oder fehlendem Spektrogramm
- vollstaendiger Lauf: Abgleich aller Arten

Der bestehende Generator unterstuetzt bereits eine Artenauswahl ueber `--species=`.
Anschliessend baut `update.mjs --report-only` den Report erneut auf, damit ein gerade erzeugtes Spektrogramm nicht
mehr als fehlend im Report stehen bleibt.

Die Explorer-Prozessausgabe zeigt den Spektrogramm-Abgleich nicht mehr als rohes JSON. Pro Art erscheinen nur noch
die relevanten Entscheidungen:

```text
<Artname>
  Sound: vorhanden|fehlt
  Spektrogramm: vorhanden|wurde erstellt|übersprungen|Fehler - <Grund>
```

Damit ist direkt erkennbar, ob ein Sound vorhanden war und ob das Spektrogramm bereits gepasst hat oder neu erzeugt
wurde.

## Geplante Tests

- Dry-run veraendert keine Datei: getestet.
- Eine neue Art wird im Modus `missing` ausgewaehlt: getestet.
- Vollstaendige Arten ohne Fehler werden im Modus `missing` nicht ausgewaehlt: getestet.
- Modus `all` waehlt alle Eintraege: getestet.
- Modus `manual-maps` wählt die jeweils aktuell manuell geschützten Karten: mit ursprünglich sieben und nach drei
  bestätigten Übernahmen mit vier Karten getestet.
- Modus `nc-sounds` wählt die aktuellen NC-Sounds und fehlende Soundpakete: getestet.
- Nicht ausgewaehlte Bestandsdaten werden bei einem Teillauf übernommen: implementiert.
- Ein zweiter gleichzeitiger Start wird abgewiesen.
- Fehlende Tokens verhindern den Start mit klarer Meldung.
- Logs enthalten keine Tokenwerte.
- Fehlercode und letzte erfolgreiche Phase werden in der App angezeigt.
- bei Pipelinefehlern wird kein Commit oder Push gestartet
- neue Karten und Sounds pausieren den Lauf vor Git
- die Kartenvorschau im Assetdialog öffnet zur Qualitätsprüfung eine große Lightbox
- Pflegeentscheidung wird in `species-assets-overrides.json` gespeichert
- Git-Commit und Git-Push laufen erst nach vollständiger Assetentscheidung
- Löschen aus `species_list.json` lässt Assets zunächst bestehen: getestet.
- Optionale Sofortlöschung entfernt generierte Daten und Assets derselben Art dauerhaft: getestet.
- Bereinigung erkennt verwaiste Daten und Assets: getestet.
- Bereinigung löscht verwaiste Assetordner und aktualisiert Daten/Report: getestet im temporären Repository.

## Nicht Bestandteil von Phase 7.6

- Assetdateien manuell hochladen oder ersetzen
- manuelle Lizenzfreigaben
- Git-Commit oder Git-Push
- Squarespace-Seiten erzeugen
- NAS-Migration oder Backup-Einrichtung

Diese Themen folgen spaeter. Die Assetverwaltung ist jetzt Phase 7.7.
