# Browserunabhängiger Arten-Explorer

Stand: 2026-07-12

## Ziel

Die gesamte lokale Arten-Explorer-App soll wie eine normale Windows-Anwendung gestartet und bedient werden.
Chrome, eine manuell geöffnete Browserseite und die sichtbare URL `http://127.0.0.1:4177` sollen für den normalen
Betrieb nicht mehr erforderlich sein.

Die bestehende Node-/HTML-/CSS-/JavaScript-Anwendung bleibt erhalten. Sie wird nicht neu geschrieben, sondern in
einen Desktop-Wrapper eingebettet.

## Technische Richtung

Der erste Prototyp nutzt Electron.

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

## Geplanter Ablauf

1. Desktop-Prozess startet.
2. Freier lokaler Port wird ermittelt oder Port 4177 kontrolliert belegt.
3. Der bestehende Explorer-Server wird im Electron-Hauptprozess als verwalteter Server gestartet.
4. Die App wartet auf einen erfolgreichen `/api/summary`-Healthcheck.
5. Erst danach öffnet sich das App-Fenster.
6. Serverfehler werden als verständliche App-Fehlermeldung mit `Neu starten` angezeigt.
7. Beim Schließen beendet die App nur den von ihr selbst gestarteten Serverprozess.
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

`species:desktop:shortcut` erstellt eine Desktop-Verknüpfung `Arten-Explorer.lnk`. Sie verweist auf
`wscript.exe` und startet `start-explorer.vbs`, damit beim Doppelklick kein dauerhaft sichtbares PowerShell- oder
Konsolenfenster offen bleibt. Die Prozessausgabe landet bei Bedarf in
`species-explorer/logs/desktop-launch.log`.

Der Desktop-Lifecycle ist über den Explorer-Test abgedeckt:

```bash
npm.cmd run --silent test:explorer
```

Der Test startet den verwalteten Server auf einem freien Port, prüft `/api/summary`, liest den Pipeline-Status und
stoppt den Server wieder kontrolliert.

## Phasenfolge

- Phase 7.7: Assetverwaltung einschließlich kostenfreiem Portrait-Prompt-/Importworkflow abgeschlossen
- Phase 7.8: browserunabhängiger Desktop-Wrapper für die gesamte App abgeschlossen und von Felix getestet
- Phase 7.9: globale Taxonomiedatenbank und Lightroom-Integration planen und schrittweise prüfen
- Phase 7.10: Synology NAS, Backup, Mehrgerätebetrieb und Restore-Test
- Phase 8: weiterer funktionaler Ausbau
