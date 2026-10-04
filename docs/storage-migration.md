# Gemeinsamer Datenpfad und Speicherumzug

Stand: 2026-10-04

## Freigabe und tatsächlicher Stand

Felix bestätigt als finalen gemeinsamen Datenordner `D:\Arten-Explorer\Daten`. Taxonomiereferenz, Master,
Lightroom-Suchpaket, eigene Namen/Entscheidungen, Nutzungsquittungen und Aufträge werden zusammen verschoben.
Er verlangt den alten AppData-Datenpfad zu leeren, ohne Weiterleitungsverzeichnis und ohne dortige Rückfallkopie.
Der laufende Programm-/Codex-Pfad lautet noch `D:\IUCN_Datenbank`; die koordinierte Hauptordnerumbenennung
ist ein eigener letzter Schritt und darf nicht Desktop, Plug-in oder den aktuellen Arbeitschat unerreichbar machen.

Abgeschlossener produktiver Datenwechsel:

| Merkmal | Geprüfter Wert |
| --- | --- |
| Quelle | `C:\Users\felix\AppData\Local\FN Wildlife Travel\Arten-Explorer` |
| Derzeitiges Datenziel | `D:\IUCN_Datenbank\Daten` |
| Bestandsdateien | 207 |
| Gesamtbytes | 98.603.910.132 |
| Kopiervergleich | alle 207 SHA-256-Prüfwerte stimmen mit den Originalen überein |
| Planrevision | `3572354f69620c3556242d10a404ef9552ab0033606e6fd9287be02ad6947be5` |
| Umzugsjournal | `Daten/.storage-migration.json`, Zustand `committed`, 207 entfernte Originaldateien |
| Aktiver Pfad | `D:\IUCN_Datenbank\Daten`, Konfiguration `ready` |
| AppData-Quellordner | leer, keine Verknüpfung oder dortige Rückfallkopie |

Keine Taxonomieaktivierung oder Änderung von Datenbankinhalten durch den Wechsel. Produktive Übernahme
nach bestandenem Gesamtgate (50 Gruppen/1.177 Tests), unabhängig geschlossenen Verbrauchern und erneuter
vollständiger Zielprüfung. Jedes Original unmittelbar vor Entfernung erneut geprüft. Lesender Resolver,
Versionsvergleich, unverändertes aktives Paar/Vorgänger sowie Weissstorch/Rebhuhn im Suchhelfer bestätigt.
Das ist noch keine native Explorer-/Lightroom-Neustartabnahme oder finaler Hauptordnerwechsel.
Der alte leere Wurzelordner ist kein Datenbestand; der gebundene Rückweg nutzt ausschließlich die neuen
unveränderten Daten. Nach neuer Bearbeitung automatische Rücknahme weiterhin gesperrt.

## Resolver und Nachweise

Neuer Standard ist `<Explorer-Ordner>/Daten`; `storage-path.json` kann einen absoluten anderen Datenpfad
angeben. Die Einstellungsoberfläche dafür ist noch nicht eingeführt. `FN_EXPLORER_DATA_ROOT` bleibt der
explizite technische Override. Eine vorhandene Altinstallation wird bis zur bestätigten Migration weiterhin
erkannt, nicht durch einen leeren neuen Ordner ersetzt.

Eine Migrationskonfiguration verlangt ein passendes vollständig abgeschlossenes Journal mit gebundener
Planrevision, vollständiger Dateiliste und Prüfwerten. Verzeichnislinks, manipulierte/unvollständige Belege,
fehlende Ziele und Zustand `migrating` stoppen statt stillen Leerbestand zu öffnen.

Historische Belege behalten ihre ursprünglichen Bytes und Revisionswerte. Der Resolver übersetzt nur ihre
belegten alten absoluten Zugriffswege auf den gemeinsamen neuen Speicher. Es gibt keine AppData-Junction,
kein Umstempeln gebundener Quellen-/Regelstände und keine Lockerung von Wiederanlaufprüfungen.
Ein tatsächlich anderer Eingangs-/Regelstand darf einen alten Auftrag weiter als veraltet erkennen.
Die relative Standardkonfiguration bleibt nach gemeinsamem Umbenennen des Programmordners portabel;
auch bisherige Programmdateiverweise werden über die verifizierte Herkunft aufgelöst.

## Noch notwendiger koordinierter Hauptordnerwechsel

Der aktuelle Codex-Arbeitschat ist weiterhin an `D:\IUCN_Datenbank` gebunden. Die verfügbaren Werkzeuge
bieten keinen verifizierten Weg, diese laufende Projektbindung gemeinsam mit einer Umbenennung zu ändern.
Ein eigenmächtiger Eingriff in die laufende Codex-Datenbank oder ein alter Programmpfad als Junction ist
deshalb kein Ersatz für den koordinierten Wechsel. Der aktuelle Datenpfad bleibt bis dahin vollständig nutzbar.

Für den letzten Wechsel müssen die Verbraucher geschlossen sein und die Codex-Projektbindung den alten
Arbeitsordner freigeben. Danach den gesamten Programmordner genau einmal in `D:\Arten-Explorer` umbenennen,
Desktop-Verknüpfung sowie Lightroom-Plug-in-Registrierung und ausdrücklich gespeicherte Helfer-/Suchpfade
auf den neuen Programmpfad prüfen/umstellen und das Codex-Projekt am neuen Ort wieder anbinden.
Die relative Konfiguration `Daten` und der unveränderte Umzugsnachweis sind für diesen Gesamtwechsel
isoliert geprüft; die großen Daten werden nicht noch einmal kopiert. Danach beide Programme normal öffnen
und den gemeinsamen Datenstand/Suche sowie das kontrollierte Schließen prüfen. Keine neue Quellen-
aktualisierung, Fotoänderung oder Taxonomieaktivierung ist für diesen Pfadcheck erforderlich.

## Übernahme und Wiederherstellung

`scripts/storage-migration.mjs` trennt lesenden Plan, bestätigte Vorbereitung, geschlossene Übernahme und
geschlossene Wiederherstellung. Ein eigener Prozesslock verhindert parallele Speicherwechsel.
Der Plan bindet absolute, getrennte Ziele, sämtliche Dateinamen/Größen/Änderungszeiten und eine Revision.
Die Vorbereitung kopiert ohne Überschreiben und vergleicht Quelle/Ziel. Abbruch erhält Originale und
eindeutig belegte Teilkopien; unbekannte oder veränderte Zielinhalte bleiben gesperrt.

Vor der Übernahme werden sämtliche Zielprüfwerte erneut geprüft, danach jedes einzelne Original direkt vor
seiner Entfernung. Quellinventar und Konfiguration dürfen nicht unabhängig geändert sein. Explorer, Lightroom
und gespeicherte Aufbauprozesse müssen beendet bleiben; diese Grenze wird während des Wechsels erneut geprüft.
Entfernt werden ausschließlich die 207 frisch geprüften Originaldateien und anschließend leere Unterordner,
kein breiter rekursiver Löschlauf. Der alte Wurzelordner bleibt leer, ohne Link. Zeitstempel am Ziel bleiben erhalten.
Eine Zwischenkonfiguration verhindert Lesen eines halb geleerten Bestands. Das Journal ermöglicht die
Erkennung eigener unterbrochener Entfernungsschritte; fremde Änderungen werden nicht automatisch aufgelöst.

Der Rückweg kopiert dieselben unveränderten Zielbytes kontrolliert an die Originalpfade zurück und stellt die
vorherige Konfiguration wieder her. Die neue Datenkopie wird dabei nicht gelöscht. Nach neuer produktiver
Bearbeitung ist diese automatische Rücknahme ausdrücklich gesperrt; aktuelle Daten dürfen nicht durch einen
alten Stand ersetzt werden.

## Ausschlüsse und Prüfgrenzen

`Daten`, lokale Konfiguration, Prozesslock und Temp sind aus Git/Pages und Quellscans ausgeschlossen.
Das vollständige NAS-Backup berücksichtigt Daten und Konfiguration; Temp bleibt ausgeschlossen. Ein externer
Datenpfad oder während des Backups geänderter Datenstand darf keinen vollständigen Sicherungserfolg vortäuschen.
Keine neue produktive NAS-Sicherung zur Umsetzung gestartet.

Isolierte Tests prüfen Abbruch, doppelte Vorbereitung/Übernahme, Rückfall, Zielmanipulation, Links,
relative CLI-Ziele, unabhängige Konfiguration und portable Ordnerumbenennung. Sie ersetzen keinen tatsächlichen
Explorer-/Lightroom-Neustart am neuen endgültigen Pfad. Praktische Abnahme und Phase-10.5-Audit bleiben getrennt.
