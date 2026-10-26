# Browserunabhängiger Arten-Explorer

Stand: 2026-10-26

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
Electron erhält das ICO beim Erzeugen des Windows-Fensters für Fenster-/Taskleistensymbol; auf anderen
Plattformen wird das PNG verwendet. Der Verknüpfungsinstaller bindet dasselbe ICO relativ zu seinem
Installationsordner und stoppt bei fehlender Datei vor dem Speichern der Verknüpfung.

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

## Phasenfolge

Die lokale Explorer-Abschlussprüfung vom 26. Oktober ist im
[Gesamtauditauftrag](audit-auftrag-phase-10-5.md) angenommen: vorhandene vollständige Prüfungen,
gezielte Nachprüfungen der späteren Änderungen, tatsächlicher Desktopbetrieb und isolierte Messung
bleiben getrennte Nachweise. Der normale produktive Datenbankstart wurde nicht als Leistungsprobe
gemessen; aus der kurzen Messung folgt keine Speicherleck- oder physische Geräteabnahme.
Veröffentlichung, abschließende Bereinigung und Gesamt-Go gehören zum noch laufenden Gesamtaudit.

- Phase 7.7: Assetverwaltung einschließlich kostenfreiem Portrait-Prompt-/Importworkflow abgeschlossen
- Phase 7.8: browserunabhängiger Desktop-Wrapper für die gesamte App abgeschlossen und von Felix getestet
- Phase 8: Taxonomie-Pyramide, Squarespace-Portrait, kontrollierte Taxonomiebearbeitung und Soundeditor abgeschlossen
- Phase 9: globale Taxonomiedatenbank einschließlich umfassendem Abschlussaudit
- Phase 10: Lightroom-Machbarkeit, Plug-in-MVP und umfassendes Abschlussaudit
- Phase 11: Synology NAS, Backup, Mehrgerätebetrieb, Restore-Test und umfassendes Abschlussaudit
