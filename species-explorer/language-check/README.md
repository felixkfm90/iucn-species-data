# Automatische deutsche Sprachprüfung

Stand: 2. November 2026. Lokaler Zusatz zur bereits aktiven deutschen Desktop-Rechtschreibung.
Felix wünscht Hinweise direkt beim Schreiben und keinen manuellen Sprachstart.

## Bedienung und aktueller Stand

Die normale deutsche Rechtschreibung bleibt beim Tippen aktiv. Der zusätzliche Button
**Sprache prüfen** entfällt in der Website-Bildtextprüfung und im Artseiteneditor. Bilder vorschlagen
und bewusste sachliche Quellenarbeit bleiben getrennte bestehende Funktionen.

Der neue Feldcontroller wartet 850 Millisekunden nach einer Eingabe, prüft nur den tatsächlich
bearbeiteten Text und markiert aktuelle Hinweise direkt im unveränderten Textfeld. Ein Klick auf die
Textstelle oder Alt+Pfeil-ab öffnet den konkreten Vorschlag. Seine Annahme verwendet den normalen
Eingabeablauf; Speichern, Freigeben und Websiteübernahme bleiben nachfolgende Entscheidungen.
Bildbeschriftungen und Überschriften erhalten keinen erzwungenen abschließenden Punkt.

**Die zusätzliche Grammatikprüfung ist noch nicht für den normalen Produktstart aktiviert.**
Die Feld- und Anschlussfälle sind geprüft; die tatsächliche LanguageTool-Qualifikation und sichtbare
Feld-/Undo-Probe laufen noch. Bis dahin bleibt die vorhandene Rechtschreibung nutzbar.
Für eigene begrenzte Qualifikationsinstanzen kann Root `languageCheckOptions.enabled:true` setzen.

Der begrenzte echte Windows-Nachlauf vom 2. November liefert für alle zehn synthetischen Fälle
technisch gültige Antworten und besteht **6/10 inhaltliche Erwartungen**. Drei Erwartungen betreffen
denselben künstlichen Schreibfehler, dessen erster Ersatzvorschlag den erwarteten Singular nicht
trifft; ein fehlendes Relativsatzkomma in einer kurzen Fragmentbeschriftung wird nicht erkannt.
Satz-/Substantivgroßschreibung, ein klares fehlendes Komma, korrekter Text sowie Beschriftung und
Überschrift ohne Schluss-Punktpflicht bestehen. Emoji-/CRLF-Spannen passen zum unveränderten Text.
Das ist eine begrenzte Engineprobe, keine allgemeine Sprachqualitätsfreigabe; die Produktaktivierung bleibt aus.

Die erste kalte deutsche Prüfung benötigt in dieser Probe etwa **9,5 Sekunden**, weitere meist
**8–53 Millisekunden**, ein weiterer Fall etwa **1,1 Sekunden**. Deshalb gilt eine feste serverseitige
Prüfgrenze von **10 Sekunden** bei 15 Sekunden Node-Anfragegrenze, einem Prüfthread und einer
Queueposition. Ein einziger eigener Java-Prozess verarbeitet die Serie und endet regulär mit **Exit0**;
danach ist kein eigener Java-Prozess mehr aktiv. Die 23 gezielten Backendfälle bestehen ohne Skips.

## Modulgrenzen

- `parser.mjs` prüft die tatsächliche Engineantwort, deutsche Sprache, Originaltext und UTF-16-Spannen.
- `runtime.mjs` bindet den vollständigen Herstellerbaum und den eigenen Starter an ihre Prüfsummen.
- `service.mjs` betreibt genau einen eigenen Java-Prozess auf Loopback, mit begrenzten Anfragen,
  Prüfdauer und regulärem Idle-/Schließabschluss.
- `explorer-service.mjs` prüft die persönliche Bearbeitungsberechtigung vor und nach dem Ergebnis.
- Die vorhandene lokale HTTP-Fassade bietet GET `/api/language-check` und den sitzungsgeschützten
  POST `/api/language-check/check`. Es gibt keine frei wählbare Prüferadresse und keine Ausführungsflags
  aus dem Renderer. Browserabbruch wird an den Prüfer weitergegeben.
- `public/app-language-check.js` und `public/language-check.css` erhalten das echte Textfeld samt
  Wert, Cursor, Auswahl, Scrollposition, nativer Rechtschreibung und normaler Eingabelogik.

Der Text ist auf 20.000 UTF-16-Einheiten und 80.000 UTF-8-Bytes begrenzt. Einzelne Feldgrenzen bleiben
zusätzlich wirksam. Alle Hinweise müssen zu unverändertem Text und aktueller Feld-/Personenbindung
passen. Gültige Überlappungen werden zunächst über die kleinsten konkreten Spannen angeboten;
nach einer angenommenen Änderung wird erneut geprüft. Unsichere Spannen werden verworfen.

## Laufzeit und Herkunft

Verwendet wird der freie lokale LanguageTool-Core **6.6**, vom
[Herstellerdownload](https://languagetool.org/download/LanguageTool-6.6.zip). Das ZIP enthält
251.998.221 Bytes; SHA256 `53600506b399bb5ffe1e4c8dec794fd378212f14aaf38ccef9b6f89314d11631`.
Der vollständige Baum einschließlich Lizenzdateien bleibt unter dem konfigurierten privaten
Datenpfad `local-tools/languagetool/LanguageTool-6.6` erhalten. Der zugehörige `runtime-lock.json`
bindet Version, Paket und Dateibaum. Der eigene Java-Starter bleibt mit Quelle und reproduzierbarer
Java-17-Kompilation gebunden. Es wird kein Systemdienst eingerichtet.

Eine Java-Laufzeit ab 17 ist erforderlich. Der [Windows-Installer](../../installer/README.md) bündelt
Temurin JRE 17 und LanguageTool als getrennte, hashgeprüfte Programmbestandteile unter `runtime/`.
Ein installierter Explorer bevorzugt diese Sprachprüflaufzeit. Ein ausdrücklich übergebener Prüfpfad
und der private Datenpfad für frühere Installationen und Entwicklung bleiben verfügbar. Für diese
Installationen kann Java separat konfiguriert oder über `JAVA_HOME`/`PATH` gefunden werden.
Die frühere native Probe verwendete vorhandenes JBR25. Der Pakettest vom 3. November prüft getrennt
die gebündelte Java-Laufzeit aus einer frischen isolierten Windows-Installation. Der Start, die
Tippfehlererkennung, Großschreibung und Kommas funktionieren für die beschriebenen Prüfsätze.
Für „Vogeel“ wurde im Prüfsatz „Vögel“ als erster Vorschlag gemeldet. Die Qualität einzelner
Korrekturen bleibt von der nachgewiesenen lokalen Einrichtung getrennt.

Der anschließende Quellstand ergänzt für kurze Texte eine begrenzte Gegenprobe bei doppelt getippten
Buchstaben. Bei einem eindeutigen Buchstabenlauf und einem weiter vom Original entfernten Vorschlag
prüft derselbe lokale Dienst den Text mit einem entfernten Buchstaben. Gibt es dabei keinen neuen
Sprachhinweis, erscheint die kürzere Korrektur zuerst und der ursprüngliche Vorschlag bleibt auswählbar.
Bis zu zwei Varianten teilen sich 1,2 Sekunden Zusatzzeit. Bei einem neuen Hinweis oder einer
fehlgeschlagenen Zusatzprüfung bleibt die ursprüngliche Korrektur erhalten. Jede Textänderung erfordert
weiterhin die Auswahl am markierten Textfeld.

Der private Beleg `data/website/checks/language-check-context-20261103/bundled-temurin.json` prüft
diesen Quellstand mit Electron, Temurin und LanguageTool aus dem letzten Setup. In der Einzahl wird
„Vogel“ zuerst und „Vögel“ als Alternative angeboten. In der Mehrzahl bleibt „Vögel“ der Vorschlag.
Großschreibung, Komma vor „weil“ und die kurze Beschriftung ohne Schlusspunkt bestehen ebenfalls.
Die gesonderte Probe mit der vorhandenen JBR-Laufzeit besteht neun von zehn Fällen. Der Prüfsatz
„Ein Vogel der auf einem Ast sitzt“ bleibt dort ohne Kommahinweis. Beide Java-Prozesse wurden
regulär beendet. Die Gegenprobe verwendet den neuen Quellstand und die Laufzeiten des letzten Setup.

Der nächste Quellstand prüft mögliche Relativsätze in einzeiligen Bildbeschriftungen bis 300 Zeichen
zusätzlich in einem lokalen Satzkontext. Es wird ausschließlich eine von LanguageTool vorgeschlagene
Kommaeinfügung an der exakt gebundenen Stelle im eingegebenen Text übernommen. Die Wörter des
Prüfsatzes und sein Schlusspunkt bleiben intern. Bei einer nicht verfügbaren Zusatzantwort gelten die
ursprünglichen Befunde weiter. Die zusätzliche Prüfung ist auf 1,2 Sekunden begrenzt.

Der private Beleg `data/website/checks/language-check-context-20261103/caption-jbr-qualified.json`
dokumentiert zwölf bestandene Fälle einschließlich „Ein Vogel, der …“, „Bäume, die …“ und der
Genitiv-Gegenprobe „Ein Vogel der Gattung Acanthis“. Das Wörterbuch markiert „Acanthis“ als möglichen
Tippfehler. In der Vorprobe blieb „Ein Vogel dessen Gefieder glänzt“ auch mit dem ergänzten Satzkontext
ohne Kommahinweis. Die Grenzen sind damit für diese Sprachkonstruktionen belegt.

Texte werden ausschließlich auf diesem PC geprüft. Der Hersteller beschreibt den
[lokalen HTTP-Server](https://dev.languagetool.org/http-server), die
[Java-Anforderung](https://dev.languagetool.org/java-api) und die
[LGPL-Lizenz des Core](https://github.com/languagetool-org/languagetool).
Cloudregeln, kostenpflichtige Dienste und große zusätzliche Sprachmodelle gehören nicht zu diesem Weg.
