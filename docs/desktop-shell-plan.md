# Browserunabhängiger Arten-Explorer

Stand: 2026-11-02

## Ziel

Die lokale Arten-Explorer-App wird als Windows-Anwendung gestartet und bedient. Eine manuell geöffnete
Browserseite unter `http://127.0.0.1:4177` ist für den normalen Desktopbetrieb nicht erforderlich.

Die Desktop-Hülle bettet die bestehende Node-/HTML-/CSS-/JavaScript-Anwendung ein.

## Technische Richtung

Die Desktop-Hülle nutzt Electron.

Gründe:

- bestehende Weboberfläche kann unverändert eingebettet werden
- Node.js und die vorhandenen Serverfunktionen können direkt weiterverwendet werden
- Datei-Uploads, Audio, Dialoge, Zwischenablage und lokale Prozesse funktionieren im eigenen App-Fenster
- der lokale Server kann beim Start automatisch erzeugt und beim Schließen kontrolliert beendet werden
- Windows-Verknüpfung und später ein installierbares Paket sind möglich

Nachteile:

- größeres Anwendungspaket durch die eingebettete Chromium-Laufzeit
- zusätzlicher Update- und Paketierungsaufwand

Eine WebView2-Variante wäre kleiner, erzeugt aber mehr Windows-spezifischen Integrationscode. Sie bleibt eine
Alternative, falls die Electron-Paketgröße im Prototyp nicht akzeptabel ist.

## Start- und Schließablauf

1. Desktop-Prozess startet und erzeugt das Fenster mit interner Startseite.
2. Freier lokaler Port wird ermittelt oder Port 4177 kontrolliert belegt.
3. Der bestehende Explorer-Server wird im Electron-Hauptprozess als verwalteter Server gestartet.
4. Die App wartet auf einen erfolgreichen `/api/summary`-Healthcheck.
5. Nach erfolgreicher Prüfung ersetzt die Hauptansicht die bis dahin mögliche interne Startseite.
6. Serverfehler werden als verständliche App-Fehlermeldung mit `Neu starten` angezeigt.
7. Beim Schließen beendet die App nur den von ihr selbst gestarteten lokalen Server.
8. Laufende Pipelineprozesse müssen eine bewusste Schließentscheidung auslösen.

## Sicherheitsgrenzen

- keine zweite Instanz mit konkurrierendem Schreibzugriff
- keine freie Navigation auf externe Webseiten im App-Fenster
- externe Links öffnen kontrolliert im Standardbrowser
- keine Secrets im Rendererprozess
- Git-, Pipeline- und Dateischreibfunktionen bleiben serverseitig
- Dateipfade werden weiterhin ausschließlich serverseitig konstruiert

## Bedienfunktionen

### Deutsche Rechtschreibung bei der Texteingabe

Die Desktop-Hülle aktiviert die vorhandene Chromium-/Hunspell-Prüfung ausdrücklich auf Deutsch.
Bearbeitbare Website-Bildtexte und Seitenentwürfe kennzeichnen ihre Eingabefelder als deutsche Texte.
Verdächtige Wörter können markiert und im Rechtsklick-Menü durch einen gewählten Vorschlag ersetzt
werden. Unbekannte Artnamen lassen sich ausdrücklich ins persönliche Wörterbuch aufnehmen.
Die Anwendung verändert Texte dabei nicht selbstständig und führt keine Freigabe oder Übernahme aus.

Die Prüfung läuft lokal. Electron lädt bei Bedarf das deutsche Wörterbuch vom voreingestellten
Wörterbuchserver; eingegebene Wörter oder Texte werden dafür nicht übertragen. Ein noch fehlendes
Wörterbuch kann die Prüfung beim ersten Offline-Start begrenzen. Im normalen Browser bestimmt dessen
Wörterbuch-/Spracheinstellung die Markierung. Die Rechtschreibmarkierung ist keine vollständige Prüfung
von Grammatik oder Kommasetzung. Felix bestätigt am 2. November die funktionierende Prüfung direkt
im geöffneten Textfeld. Der zusätzliche manuelle Button **Sprache prüfen** ist im neuen Quellstand
aus Website-Bildtextprüfung und Artseiteneditor entfernt. Die ergänzende automatische Grammatikprüfung
bleibt bis zu ihrer eigenen Qualifikation ausgeschaltet; Zustand und Grenzen führt der
[Sprachprüfvertrag](../species-explorer/language-check/README.md). Sachliche Quellenprüfung bleibt getrennt.
Grundlage: [Electron SpellChecker](https://www.electronjs.org/docs/latest/tutorial/spellchecker).
Der initiale Nachweis der Menü-/Ereignislogik besteht mit den damaligen Bildtext-/Fensterfällen **127/127 Tests ohne
Fehler oder Skips**, darunter sechs neue Fälle für bewusste Korrektur, Wörterbuchlernen und veraltete
Menüs. Die damaligen Syntax-, Stil- und Dokumentprüfungen bestehen; die Gegenproben verwenden
kontrollierte Ereignisse, kein echtes Wörterbuch. Felix' inzwischen bestätigte Wortprüfung ergänzt
den Bediennachweis, ersetzt aber keinen Nachweis des erstmaligen Wörterbuchdownloads.
Der persönliche Explorer wird nicht automatisch neu gestartet.

### Abgestimmte Anordnung der Kopfzeile vom 2. November

Felix schlägt vor, die breite Artbestandszeile in die Kopfzeile zu verschieben, Websitewerkzeuge dort
zusammenzufassen, Datenbank- und Bearbeitungszustand als Hinweise darzustellen und weitere Aktionen
über drei Punkte zu öffnen. Die Empfehlung ist eine dauerhaft sichtbare Artbestandswahl, ein eigener
Zugang **FN-Website**, reine Zustandsanzeigen und ein eigener Schloss-Schalter; seltenere Datenbank-,
Sicherungs- und Einstellungsaktionen gehören unter **⋮**. Verbindungs-/Konflikthinweise müssen sichtbar
bleiben und schreibende Websitefunktionen bleiben im Lesemodus gesperrt.
Felix heißt die gemeinsam beschriebene Anordnung anschließend grundsätzlich gut.

Felix ergänzt, den Modus rechts als zweite Informationszeile unter dem Report anzuzeigen und die
ausführliche Validierung aus der Hauptansicht herauszunehmen. Vorgeschlagener Zugang ist **⋮ → Prüfung
& Hinweise**. Technisch bestandene Prüfungen und zusätzliche Pflegehinweise sind getrennt darzustellen:
ein manuell geschützter Sound ist eine neutrale Information, eine nachweislich erfolglose automatische
Quellensuche ein Pflegehinweis. Tatsächliche Datei-/Datenfehler bleiben Fehler und dürfen durch das
geschlossene Menü nicht unsichtbar werden. Die aktuelle rote Sammelfläche unterscheidet diese Fälle
visuell noch nicht. Felix bestätigt, die Artenzahl sichtbar zu erhalten und die übrigen Zähler in
die Prüfung zu nehmen. Die beschriebene Platzierung ist links unter dem Programmnamen zusammen mit
der Bestandswahl; die breite bisherige Zahlenzeile entfällt. Die Auswahl ist ein Übergangszugang zum
bisherigen lokalen Bestand, kein dauerhaftes Zweibestandskonzept; maßgeblich ist der
[gemeinsame Bestandsvertrag](multi-device-backup-plan.md#technische-aufteilung-nach-der-gesamtfreigabe).

Der neue Quellstand setzt diese Anordnung über das eigene `app-header.js` und `header.css` um.
Die Zustandsanzeige verwendet ein eigenes Element. Bei `Änderungen offen` im lokalen Bearbeitungsmodus
ist an derselben Stelle die [Übertragungsvorschau](pipeline-control-plan.md#bedienoberfläche) erreichbar.
**⋮ → Einstellungen** verwendet den bestehenden Einstellungsdialog. Anmeldung und Lesen
im gemeinsamen Projekt sind auch im Lesemodus erreichbar; Pfadänderung, Fachbearbeitung, Freigabe,
Benutzer-/Geräteverwaltung, Erstübernahme und schreibender Abgleich benötigen zusätzlich die passende
Serverberechtigung und den aktuellen lokalen Bearbeitungsmodus. Ein-/Ausschalten entwertet ältere
Bestätigungen; tatsächliche Serverrechte werden nicht für andere Fachcontroller umgeschrieben.

Soundhinweise werden bereits an ihrer fachlichen Entstehung als Fehler, Pflege oder Information
gebunden. Die neutrale Sammelfläche zeigt tatsächliche Daten-/Datei-/Reportfehler rot, bekannte erfolglose
Tonquellensuche gelb und manuelle Sounds neutral; die Einordnung erfolgt nicht anhand eines Textpräfixes.
Der eigene Prüfdialog erlaubt sein ausdrücklich angefordertes Lesen/Abgleichen, während fremde Dialoge
und ein Bestandswechsel weiter geschützt sind. Tastatur, Escape und Rückfokus sind angeschlossen.
Die Sichtprüfung im tatsächlichen Electronfenster bleibt vom automatisierten UI-/HTTP-Nachweis getrennt;
die laufende Nutzerinstanz wurde für diese Arbeiten nicht neu gestartet.

Der lokale Nachlauf vom 2. November besteht aus **279/279 UI-Fällen**, einer ergänzenden
**39/39 Shared-/Importserie** und der abschließenden **36/36 Shared-Renderer-/Wrapper-/Importserie**.
Die Serien überlappen und werden nicht addiert. Neue Gegenproben belegen vor der Korrektur echte
unerlaubte Aufrufe nach einem Identitätswechsel während einer Bestätigung sowie den Verlust späterer
Eingaben durch eine verspätete Speicher-/Snapshotantwort. Frische Bindungen und während laufender
Aktionen gesperrte Fachfelder erhalten nun die aktuelle Eingabe; eine bereits berechtigte Speicherung
wird weder rückgängig gemacht noch wiederholt. Der eigene Desktopprüfstarter besteht zusätzlich
**11/11** Fälle und lädt die tatsächlichen Headerdateien über den isolierten HTTP-Dienst. Sein
synthetisches DOM ist kein Nachweis für das Aussehen oder die Bedienung des normalen Fensters.

Der Desktop-Wrapper muss mindestens unterstützen:

- Lesen und Bearbeiten aller Arten
- neue Arten und Löschen
- Pipeline- und Bereinigungsläufe
- Karten-, Sound-, Credits-, Spektrogramm- und Portraitverwaltung
- Audio-Wiedergabe
- Datei-Auswahl für Karten, Sounds und Portraits
- Zwischenablage für Portraitprompts
- Lightboxen und Dialoge
- automatische Aktualisierung bei externen Projektänderungen
- verständlicher Status für Server, Pipeline, Commit und Push

## Akzeptanzkriterien

- Start per `npm.cmd run species:desktop`, später per Windows-Verknüpfung oder EXE
- kein separates Konsolenfenster im Normalbetrieb
- kein manuelles Starten von `npm.cmd run species:explorer`
- kein manuelles Öffnen von `127.0.0.1:4177`
- App erkennt einen belegten oder abgestürzten Server
- der direkte Browser-/Servermodus meldet einen bereits laufenden Explorer verständlich statt mit `EADDRINUSE`
  abzubrechen
- App kann den eigenen Server neu starten
- zwei parallele App-Instanzen werden über Electron-Single-Instance-Schutz verhindert
- alle bestehenden Explorer-Tests bleiben erfolgreich
- zusätzlicher Desktop-Start-/Shutdown-Test
- dokumentierter Installations-, Update- und Fehlerbehebungsablauf

## Abgeschlossene Umsetzung seit 2026-06-28

Neue Dateien:

- `species-explorer/desktop/server-lifecycle.mjs`
- `species-explorer/desktop/main.mjs`
- `species-explorer/desktop/start-explorer.vbs`
- `species-explorer/desktop/install-shortcut.ps1`

Neue npm-Skripte:

```bash
npm.cmd run species:desktop
npm.cmd run species:desktop:shortcut
npm.cmd run species:explorer
npm.cmd run test:explorer
```

`species:desktop` startet Electron, zeigt zuerst eine interne Startseite, startet den lokalen Explorer-Server,
wartet auf `/api/summary` und lädt danach die bestehende Oberfläche im App-Fenster. Wenn Port `4177` belegt ist,
nutzt die App automatisch einen freien Ersatzport. Externe Links werden aus dem App-Fenster herausgehalten und im
Standardbrowser geöffnet.

Der Server wird nicht als sichtbares Konsolenfenster gestartet. Beim Schließen der App wird nur der von der
Desktop-Hülle gestartete Server beendet. Wenn ein Pipeline- oder Asset-Prüfschritt läuft, fragt die App vor dem
Schließen nach.

Die Desktop-Startprüfung hat eine gemeinsame Frist von zehn Sekunden, einschließlich vollständiger
JSON-Antwort und Wiederholungen. Beim Schließen liest die App Pipeline, Sicherung und offene Änderungen
getrennt mit jeweils fünf Sekunden Frist. Ein Lesefehler entfernt keine anderen bereits bekannten
Warnungen. Kann ein Status nicht zuverlässig geprüft werden, erscheint zusätzlich **Status nicht
vollständig geprüft**. Standard und Abbruch lassen die App offen; **Trotzdem schließen** erfordert eine
bewusste Wahl. Ein weiterer Schließversuch während derselben Prüfung oder eines offenen Dialogs startet
keine zweite Abfrage. Diese Lesefristen begrenzen nicht pauschal den anschließenden Serverabbau.

`species:desktop:shortcut` erstellt eine Desktop-Verknüpfung `Arten-Explorer.lnk`. Sie verweist auf
`wscript.exe` und startet `start-explorer.vbs`, damit beim Doppelklick kein dauerhaft sichtbares PowerShell- oder
Konsolenfenster offen bleibt. Die Prozessausgabe landet bei Bedarf in
`species-explorer/logs/desktop-launch.log`. Die Datei wird bei jedem Start überschrieben, sodass genau der letzte
Start diagnostizierbar bleibt und der Launcher-Log nicht unbegrenzt wächst.

Seit 26. Oktober verwendet die Desktop-Hülle das von Felix angenommene eigene Arten-Explorer-Symbol
unter `species-explorer/desktop/assets/`: Das PNG ist die korrigierte RGBA-Ausgabe mit transparentem
Außenbereich und weißer Flugzeugturbine. `arten-explorer-transparent.ico` enthält 16, 24, 32, 48, 64,
128 und 256 Pixel mit erhaltenem Alphakanal; die Größenumrechnung ist proportional ohne Beschnitt.
Das FN-Logo der Website gehört weiterhin zu deren eigenem Einbau.
Die gemeinsame Quelle `desktop/window-branding.mjs` bindet das Symbol für das Hauptfenster und das
zusätzliche Squarespace-Fenster. Ein Vertragstest erfasst beide Fensterkonstruktoren und die unveränderten
sieben ICO-Größen, damit ein Zusatzfenster nicht auf das Electron-Standardsymbol zurückfällt.
Electron erhält das ICO beim Erzeugen des Windows-Fensters für Fenster-/Taskleistensymbol; auf anderen
Plattformen wird das PNG verwendet. Der Verknüpfungsinstaller bindet dasselbe ICO relativ zu seinem
Installationsordner und stoppt bei fehlender Datei vor dem Speichern der Verknüpfung.

Der Quellanschluss vom **2. November** verwendet dasselbe persönliche Squarespace-Fenster jetzt auch
als vorgesehenen Besitzer neuer Artseitenaufträge. Es trägt den allgemeineren Titel **Squarespace ·
FN-Website**; Anmeldung, Symbol, erlaubte Ziele, Rückkehr zum Explorer und kontrolliertes Schließen
bleiben in derselben Instanz. Bildtextübernahme, Zielprüfung und Artseitenanlage teilen dieselbe
Auftragssperre. Die normale GalleryDriver-Instanz meldet die Anlegefähigkeit noch als nicht verfügbar;
echte Neuanlage und Speicherung bleiben nach dem [Artseitenvertrag](../species-explorer/page-authoring/README.md#anschluss-an-den-persönlichen-squarespace-browser)
gesondert nachzuweisen.

Die Quellintegration ändert weder ein laufendes Fenster noch eine vorhandene Desktop-Verknüpfung.
Ein normaler späterer App-Start lädt das Fenstersymbol; die Verknüpfung übernimmt es erst beim bewusst
erneuten Aufruf von `species:desktop:shortcut`. Bereits angeheftete Windows-Verknüpfungen können einen
eigenen Symbolcache behalten. Das angenommene transparente Symbol wurde am 26. Oktober an der
bestehenden Desktopverknüpfung und am regulär gestarteten Fenster nativ geprüft. Einzelbelege stehen
im Auditauftrag; ein globaler Iconcache wurde dafür nicht gelöscht.

Seit 2026-07-22 nutzt auch ein erneuter Doppelklick denselben verständlichen Ablauf: Electron erkennt die bereits
laufende Instanz und aktiviert deren Fenster. Ein minimiertes Fenster wird wiederhergestellt, ein verborgenes
Fenster eingeblendet und anschließend fokussiert beziehungsweise in den Vordergrund geholt. Falls der zweite Start
noch vor dem ersten sichtbaren Fenster eintrifft, wird die Aktivierung vorgemerkt und bei `ready-to-show`
nachgeholt. Eine zweite schreibende Explorer-Instanz entsteht nicht.

Der Desktop-Lifecycle ist über den Explorer-Test abgedeckt:

```bash
npm.cmd run --silent test:explorer
npm.cmd run --silent test:desktop
```

Der Test startet den verwalteten Server auf einem freien Port, prüft `/api/summary`, liest den Pipeline-Status und
stoppt den Server wieder kontrolliert. Der separate Desktop-Test prüft Wiederherstellen, Einblenden, Fokussieren
und den sicheren Umgang mit fehlenden oder bereits zerstörten Fenstern.

## Gezielte Bedientextprüfung vom 30. Oktober

Felix beauftragt weitere Vorarbeiten einschließlich verständlicherer Bedienung. Drei kleine lokale
Korrekturen sind ausgeführt: Die Archivübersicht zeigt ihre Ladephase nur einmal, der Bestätigungshinweis
ist kürzer und einheitlich formuliert; der Hinweis zur manuellen IUCN-Karte nennt kompakt dieselben
Handlungsschritte samt unveränderter Quellenbedingung; die NAS-Pfadhilfe spricht von vollständigen
Windows- oder Netzwerkpfaden statt von UNC-Pfaden. Erlaubte Pfade, Schreibwege und Bestätigungen ändern sich nicht.

Bestehende Frontend-Workflowtests **152/152** und Einstellungstests **4/4** bestanden. Private Aufnahme:
`data/website/checks/usability-preparation-20261030.json` samt Testprotokollen. Diese neuen Bedientexte
sind quellseitig geprüft; eine erneute native Abnahme nach ihrem Laden ist nicht erfolgt. Die bereits
nativ bestätigte kompakte Website-Bildtexte-Ansicht bleibt im [Alttextvertrag](image-alt-audit.md) geführt.

Für eine spätere gemeinsame Bedienabstimmung sind zwei konkrete Punkte vorbereitet: **Datenbank-Aktionen**
umfasst auch Medien-, Projekt- und Sicherungsarbeiten, weshalb Name und Gruppierung am Alltag zu prüfen
sind; längere Medienauswahltexte sollen nur mit erhaltenen Entscheidungsfolgen gekürzt werden.
Aufklappbare technische Details, kompakte Taxonomiefortschritte und konkrete Soundentscheidungen sind
bereits passend getrennt und bleiben erhalten. Keine neue Navigation oder große Umgestaltung beschlossen.

## Vorbereitung der Android-Abstimmung vom 28. Oktober

Der [bestätigte Folgeauftrag aus Auditabschnitt 10.46](audit-auftrag-phase-10-5.md#1046-nutzerauftrag-nach-dem-audit-alttextworkflow-und-android-app--20-oktober)
umfasst Konzept und Umsetzung einer Handy-App sowie die spätere praktische Abnahme ihrer vereinbarten
Kernabläufe auf Android. Funktionsumfang, Offlinebedarf, Datenzugriff und Bereitstellung sind ausdrücklich
offen. Felix beauftragt zunächst die entscheidungsfreie Vorbereitung; geprüfter Programmstand ist
`97a1b68a2663e62e87c4fa473a917fe83a3f7ec5`.

### Geprüfte Ausgangslage

- Die heutige Oberfläche besteht aus getrennten HTML-/CSS-/JavaScript-Modulen und Fachservices.
  Das sind mögliche wiederverwendbare Bausteine, keine fertige mobile Anwendung. Vorhandene schmale
  CSS-Regeln ersetzen keine Touch-/Geräteabnahme; das Desktopfenster fordert mindestens 1100 × 720 Pixel.
- Der Server bindet standardmäßig an `127.0.0.1` und schützt seine lokalen Sitzungen. Diese Adresse
  auf dem Handy bezeichnet das Handy selbst. Zugriff auf den Windows-Rechner würde einen gesonderten
  Zugriffs-/Betriebsvertrag benötigen; keine Netzwerkfreigabe oder Schutzänderung ist erfolgt.
- Öffentliche Website-JSONs und Medien sind ein anderer Datenumfang als die privaten Taxonomie-,
  Lightroom-, Entscheidungs- und Auftragsdaten unter `data`. GitHub Pages verteilt diese privaten Daten nicht.
  Vor einer Synchronisationslösung zunächst benötigte Inhalte und Schreibrechte bestimmen.
- Die heutige Electron-Hülle lässt sich nicht als Android-Paket übernehmen: Die
  [Electron-Dokumentation](https://www.electronjs.org/docs/latest/tutorial/tutorial-first-app)
  nennt Windows, Linux und macOS als Laufplattformen. Eine konkrete mobile Technik wird erst aus
  dem bestätigten Nutzungsumfang abgeleitet.
- Im versionierten Bestand liegt kein Android-/Gradle-/Capacitor-Projekt. `Get-Command` findet bei
  dieser Vorbereitung `java`, `javac`, `adb`, `sdkmanager` und `gradle` nicht im aktuellen Suchpfad;
  das ist kein vollständiger Nachweis, dass auf dem Rechner keinerlei SDK installiert ist.
  Für einen später gewählten nativen Android-Build ist die
  [offizielle Android-Einrichtung](https://developer.android.com/studio/install) die technische Grundlage.
  Noch keine SDK-Installation, Kontoeinrichtung oder Geräteverbindung nötig.

### Gemeinsam zu klären

| Kennung | Fachliche Entscheidung |
| --- | --- |
| MOB-1 | Bestätigt: Nachschlagewerk für die im Projekt angelegten Arten mit Bildern, Ton, Taxonomie, Verbreitung und Artinformationen. Bearbeitung am PC; Lightroom-Funktionen und das Durchblättern der gesamten Referenzdatenbank werden am Handy nicht benötigt. |
| MOB-2 | Bestätigt: Artenbestand und Inhalte gelangen über Aktualisierungen in die App. Zusätzliche Offlineinhalte sind optional auswählbar, auch alle Informationen ohne die auf der Website hochgeladenen Fotos. Eine Auswahl nach Texten/Taxonomie, Karten, Ton, Artbildern und Galeriefotos wird daraus für die Bedienung abgeleitet. Datenmenge und Inhalt der Auswahl sichtbar machen. |
| MOB-3 | Bestätigt: zunächst Android auf Samsung Galaxy S24 Ultra und S25 Ultra, für Felix und seinen Bruder. Installation und Aktualisierung für diese privaten Zielgeräte ableiten; eine iPhone-Fassung gehört nicht zum ersten Umfang. |

Die erste mobile Fassung ist ein lesendes Nachschlagewerk für die angelegten Arten. Felix nennt Merlin
als Orientierung für die Nutzung; verbindlich ist der konkret genannte Inhaltsumfang aus MOB-1.
Gemeinsame Inhalte und Personenanmeldung mit dem
[Mehrbenutzervertrag](multi-device-backup-plan.md#gemeinsame-rahmenklärung-vom-31-oktober-2026)
abgleichen. Spätere mobile Schreibfunktionen benötigen eine eigene Umfangsklärung einschließlich
Benutzerrechten und Konfliktfällen. Framework, Servermodell und Verteilungsweg werden aus dem
bestätigten Umfang abgeleitet.

Felix bestätigt am 31. Oktober zunächst zwei gleichberechtigte Personen auf eigenen PCs und spätere
Handynutzung zum Nachschlagen. Ein gemeinsames Projekt einschließlich Lightroom-Katalog und Auswertungen,
verschiedene Arbeitsorte, Verfügbarkeit auch bei ausgeschalteten PCs und Offlinearbeit als Option gehören zum gemeinsamen Ziel.
Die bestätigten Teile stehen in der [Rahmenklärung](multi-device-backup-plan.md#gemeinsame-rahmenklärung-vom-31-oktober-2026).
Inhaltsumfang, wählbare Offlineinhalte, Aktualisierung und erste Zielgeräte sind unter MOB-1 bis MOB-3
bestätigt. Die technische Trennung von Programmaktualisierung und Inhalts-/Medienpaketen wird daraus
abgeleitet; die Nutzerangabe zu App-Updates legt noch kein Paketformat oder Verteilungswerkzeug fest.
Eine vollständige Übernahme aller Desktopfunktionen aufs Handy ist nicht vorgesehen.

### Vorbereitete Abnahmefälle zur gemeinsamen Bestätigung

Die gewählten Kernabläufe werden auf dem vereinbarten echten Handy einschließlich Touchbedienung,
kleiner Ansicht, Datei-/Medienzugriff und Wiederöffnung geprüft. Offlineauswahl einschließlich einer
Auswahl ohne Websitefotos, Netzverlust, spätere Wiederverbindung, veraltete Daten und Inhaltsaktualisierung
prüfen. Am PC zusätzlich Offlineänderungen bestehender Arten/Seiten, den anschließenden Abgleich und
Konflikte mit einer zweiten Sitzung prüfen. Fehlende Berechtigungen oder Daten dürfen keinen erfolgreichen
Abgleich vortäuschen. Diese Fälle sind vorbereitet, keine ausgeführte Android-Abnahme.

## Schreibabschluss der Startprüfung vom 31. Oktober

Ein verzögerter Metadatenabruf reproduzierte einen Nachlauf nach dem vermeintlichen Schließen:
`TaxonomyMaintenanceService.close()` war bereits erfüllt, der Hintergrundabruf legte danach erneut
seine Cachedatei an. Der Dienst verfolgt jetzt laufende Start-/Versionsprüfungen und bestätigt das
Schließen erst nach deren Abschluss einschließlich Cache-Schreiben und begonnenem Projektvergleich.
Gleichzeitige Schließaufrufe warten denselben Abschluss ab; nach dem Schließen beginnt keine neue Startprüfung.
Drei Verhaltenstests waren vorher rot und sind danach grün; die bestehende Taxonomiewartungsgruppe
besteht mit **138/138**. Die identische private Reproduktion bestätigt, dass nach abgeschlossenem
Schließen und Fixtureabbau kein Cacheordner neu entsteht. Beleg: `data/website/checks/close-preparation-20261031.json`.

Ein laufender tatsächlicher Abruf wird bis zu seinen vorhandenen Zeit-/Wiederholungsgrenzen abgewartet;
ein sofortiger Netzwerkabbruch ist nicht ergänzt. Laufende Import-/Updateworker und alle anderen
Serverdienste sind durch diesen engen Nachweis nicht zusätzlich vollständig abgenommen. Dies ist
eine heutige Robustheitskorrektur und ein Anknüpfungspunkt für END, keine automatische Systemaktion.

## Konkrete mobile Vorbereitung vom 31. Oktober

Die technische Aufnahme trennt acht bestehende Bausteingruppen: öffentliche Artmodule/Assets, lokale
Explorer-Auswahl und Darstellung, lokale API mit Sitzungsschutz, private Fach-/Dateisystemdienste,
Electron-Fenster und Dateidialoge, Squarespace-Anmeldung/Übernahme, Lightroom-Anbindung sowie
Projektveröffentlichung/Sicherung. Für jede Gruppe sind tatsächliche Quell- und Teststellen,
Wiederverwendungskandidaten, Abhängigkeiten und spätere Geräteprüfungen gebunden.
Private Matrix: `data/website/checks/mobile-completion-preparation-20261031.json`.

Öffentliche Root-Module und JSONs sind mögliche Anzeigebausteine; `species-explorer/public` ist dagegen
die lokale Appoberfläche und kein öffentlich verteiltes Android-Paket. Private `data`-Bestände, Electron-
Dateizugriffe, die profilgebundene Squarespace-Anmeldung und Lightroom-Katalogaufträge benötigen jeweils
einen ausdrücklich festgelegten mobilen Bedarf und Zugang. Die heutige lokale API ist keine Personen-
oder Fernanmeldung. Keine SDK-Installation, Netzöffnung, neue Abhängigkeit oder mobile Technik ausgewählt.

28 zusätzliche isolierte Fälle an vorhandenen Funktionen prüfen den Update-Gesamtabschluss, vier echte
Desktop-Statusleser an einem eigenen kurzlebigen Loopback-Stub sowie lokale Zugriffs-/Pages-Grenzen.
Sie verwenden In-Memory-Abhängigkeiten und öffnen weder produktive SQL-Dateien noch UI oder Systemaktionen.
Nachweis: `mobile-completion-preparation-20261031-probe.json`. Dies ist eine Prüfung vorhandener
Anknüpfungspunkte, keine Android- oder neue Abschlussautomatikabnahme. Der inzwischen bestätigte
Rahmen von MOB-1 bis MOB-3 steht oben;
die später vereinbarten Abläufe sind am tatsächlichen Zielgerät zu prüfen.

Der Projektabgleich mit Numis vom 31. Oktober meldet bereits dort lokal gelesene und genutzte Werkzeuge:
Flutter **3.47.7**, Dart **3.13.5**, Android-Studio-JDK **25.0.3**, Android-Plattform **API 36** und
Buildtools **36.0.0**; dazu AGP **9.1.0**, Gradle **9.3.1** und Kotlin-Plug-in **2.4.0**. Dies ergänzt
die ältere Suchpfadaufnahme vom 28. Oktober: vorhandene Rechnerwerkzeuge und fehlendes Arten-Explorer-
Android-Projekt sind verschiedene Befunde. Kein Werkzeug wurde dafür neu installiert oder für unsere
mobile Architektur ausgewählt. Die begrenzte Projektmeldung ist privat in
`data/website/checks/mobile-toolchain-coordination-20261031.json` erhalten; keine eigene Geräteabnahme.

## Phasenfolge

### Android-Umsetzungsstand vom 1. November

Die bestätigte lesende App wird unter [mobile](../mobile/README.md) mit Flutter umgesetzt. Die
ARM64-Debug-APK **0.1.2+3** ist tatsächlich gebaut und enthält den vollständigen gebundenen öffentlichen
Anfangskatalog. Analyzer und **89 Domain-/Offline-/Widgetfälle** sind für diesen Paketstand bestanden;
`mobile/build-evidence/artifact.json` bindet dessen Quellen, Werkzeuge und tatsächliche APK-Bytes.
Das Paket ergänzt die wählbare Offlineübernahme der öffentlichen Galeriefotos mit eigener
Beobachtungsbindung. Ein Compilerfehler im optionalen Fototransport sowie ein veralteter Widgettext
sind nach fehlgeschlagenen Vorherläufen korrigiert; die erneute Prüfung ist bestanden. Das tatsächlich
gebaute APK ist einschließlich Debugsignatur und beider angenommenen Logoressourcen geprüft.
Die App lädt keine Lightroom-/Referenzdatenbanken.

Öffentlicher Anfangsbestand und persönlich angemeldeter Projektbereich werden getrennt gehalten.
Der Anfangsbestand enthält öffentliche Fachinhalte und Medienverweise; Bild-/Tonbytes werden nicht
alle in das Apppaket eingebettet. Inhaltsdownloads bleiben nach den bestätigten Kategorien wählbar.
Anmeldetokens gelangen nicht an Medienhosts. Private Daten bleiben an Projekt und Person gebunden.
Ein Programmpaketupdate ersetzt weder eine Anmeldung noch ungeprüft ein vorhandenes Offlinepaket.

Der erste Android-Bau hat entgegen der gewünschten unveränderten Werkzeugnutzung zusätzlich API 35
Revision 2 in der bereits gemeinsam verwendeten SDK-Ablage eingerichtet. Dieser Befund ist erhalten
und mit Numis abgestimmt; es wurde nichts zurückgelöscht. Ein anschließender eigener Bau ist mit
unverändertem SDK-Inventar nachgewiesen. Automatische SDK-Nachinstallation ist inzwischen gesperrt;
alle Teilprojekte sind auf den vorhandenen Stand abgestimmt. Weitere schwere Bauten werden mit Numis
abgestimmt. Die erneute Negativprobe vom 1. November stoppt an der absichtlich fehlenden Plattform 999;
der SDK-Komponenten-/Metadatenvergleich bleibt unverändert. Der eigene Runner und die APK-Prüfung sind
beendet und der Werkzeugabschnitt ist an Numis zurückgegeben. Eine echte S24-/S25-, NAS-/HTTPS-/Fernzugriffs- oder Android-Betriebssystemschlüssel-Abnahme ist
aus lokalen Tests und dem APK-Bau nicht abgeleitet. Zusätzlich ist die signierte Fassung **0.1.2+3**
am 1. November tatsächlich im privaten Google-Play-Test bereitgestellt. Den aktuellen Zugangs-/Paketstand
und die weiterhin getrennte Geräteabnahme führt der [mobile Modulvertrag](../mobile/README.md).

Die lokale Explorer-Abschlussprüfung vom 26. Oktober ist im
[Gesamtauditauftrag](audit-auftrag-phase-10-5.md) angenommen: vorhandene vollständige Prüfungen,
gezielte Nachprüfungen der späteren Änderungen, tatsächlicher Desktopbetrieb und isolierte Messung
bleiben getrennte Nachweise. Der normale produktive Datenbankstart wurde nicht als Leistungsprobe
gemessen; aus der kurzen Messung folgt keine Speicherleck- oder physische Geräteabnahme.
Veröffentlichung, Bereinigung und Gesamt-Go sind seit 27. Oktober im vereinbarten Auditumfang abgeschlossen;
der gezielte Lightroom-/NAS-Nachlauf vom 28. Oktober steht im selben Auftrag unter Abschnitt 10.57.

- Phase 7.7: Assetverwaltung einschließlich kostenfreiem Portrait-Prompt-/Importworkflow abgeschlossen
- Phase 7.8: browserunabhängiger Desktop-Wrapper für die gesamte App abgeschlossen und von Felix getestet
- Phase 8: Taxonomie-Pyramide, Squarespace-Portrait, kontrollierte Taxonomiebearbeitung und Soundeditor abgeschlossen
- Phase 9: globale Taxonomiedatenbank einschließlich umfassendem Abschlussaudit
- Phase 10: Lightroom-Machbarkeit, Plug-in-MVP und umfassendes Abschlussaudit
- Phase 11: Synology NAS, Backup, Mehrgerätebetrieb, Restore-Test und umfassendes Abschlussaudit
