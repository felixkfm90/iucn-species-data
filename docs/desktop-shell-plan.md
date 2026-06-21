# Browserunabhängiger Arten-Explorer

Stand: 2026-06-21

## Ziel

Die gesamte lokale Arten-Explorer-App soll wie eine normale Windows-Anwendung gestartet und bedient werden.
Chrome, eine manuell geöffnete Browserseite und die sichtbare URL `http://127.0.0.1:4177` sollen für den normalen
Betrieb nicht mehr erforderlich sein.

Die bestehende Node-/HTML-/CSS-/JavaScript-Anwendung bleibt erhalten. Sie wird nicht neu geschrieben, sondern in
einen Desktop-Wrapper eingebettet.

## Empfohlene technische Richtung

Für den ersten Prototyp wird Electron geprüft.

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
3. Der bestehende Explorer-Server wird als verwalteter Kindprozess gestartet.
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

- Start per Windows-Verknüpfung oder EXE
- kein separates Konsolenfenster im Normalbetrieb
- kein manuelles Starten von `npm.cmd run species:explorer`
- kein manuelles Öffnen von `127.0.0.1:4177`
- App erkennt einen belegten oder abgestürzten Server
- App kann den eigenen Server neu starten
- zwei parallele schreibende App-Instanzen werden verhindert
- alle bestehenden Explorer-Tests bleiben erfolgreich
- zusätzlicher Desktop-Start-/Shutdown-Test
- dokumentierter Installations-, Update- und Fehlerbehebungsablauf

## Phasenfolge

- Phase 7.7: Assetverwaltung einschließlich kostenfreiem Portrait-Prompt-/Importworkflow abgeschlossen
- Phase 7.8: browserunabhängiger Desktop-Wrapper für die gesamte App als nächster aktiver Schritt
- Phase 7.9: Synology NAS, Backup und Restore-Test
- Phase 8: weiterer funktionaler Ausbau
