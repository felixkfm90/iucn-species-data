# Gemeinsamer Datenpfad und Speicherumzug

Stand: 2026-10-27

## Aktueller Standard und beauftragte Ordnerumbenennung

Felix beauftragt am 27. Oktober die Vereinheitlichung des Datenordners auf den englischen Namen
`data` einschließlich aller benötigten Programmanpassungen. Neuer Standard ist
`<Explorer-Ordner>/data`; der lokale Wechsel ist ausgeführt und nachgeprüft.
Bestehende `Daten`-Installationen bleiben lesbar, bis ihr eigener Wechsel ausdrücklich erfolgt.
Ohne Konfiguration werden vorhandene lokale Datenordner vor einem alten AppData-Bestand berücksichtigt;
sind sowohl `data` als auch `Daten` vorhanden, wird keine mehrdeutige Auswahl getroffen.

Der Wechsel benennt ausschließlich den gebundenen unmittelbaren Unterordner `Daten` zu `data` um.
Keine Kopie der großen Datenbanken und keine Verzeichnisweiterleitung. Explorer, Lightroom und gespeicherte
Aufbauprozesse müssen geschlossen sein. Zielkollisionen, Verzeichnislinks, unabhängig geänderte Konfiguration
oder Bestandsmetadaten stoppen den Wechsel. Eine Zwischenkonfiguration `migrating` sperrt Verbraucher,
bis Ordneridentität, vollständiges Metadateninventar und Schließnachweis erneut bestätigt sind.

`.storage-directory-rename.json` ist ein kleiner technischer Umbenennungsbeleg. Er bindet damaligen
Programmordner, alte/neue Datenadresse, vorherige Konfiguration und den SHA-256 des unveränderten ursprünglichen
Umzugsjournals. `directoryRenameRevision` in `storage-path.json` bindet seine Revision. Der Node-Resolver
berechnet die Revision und den Originaljournalhash erneut; Lua spiegelt die Struktur-/Herkunftsprüfung wie
beim bisherigen Umzugsjournal. Der zusätzliche Herkunftspfad bleibt auch nach späterem erneutem Umbenennen
des Programmordners auflösbar. Es entsteht kein zweiter Auditbericht.

Historische JSONs, Datenbankinhalte und Auditarchive behalten ihre ursprünglichen Bytes und Prüfsummen.
Der Resolver übersetzt die belegten alten Zugriffswege: AppData, ursprünglicher Programmordner mit `Daten`
und der bei der Umbenennung tatsächlich verwendete `Daten`-Pfad. Fremde Pfade mit ähnlichem Präfix bleiben
getrennt. Aktive Paar-/Vorgänger- und Korrekturzeiger werden dabei nicht umgeschrieben.

Der gezielte Befehl ist `node scripts/storage-migration.mjs rename-data --confirmed --consumers-closed`.
Er darf nur für einen frisch geprüften und ausdrücklich beauftragten Wechsel verwendet werden. Ein Fehler
nach der Umbenennung lässt die Daten am neuen Ort und den Zugriff gesperrt; kein blinder Wiederanlauf oder
automatisches Zurückspielen alter Daten. Für die Wiederaufnahme Konfiguration, technischen Beleg, beide
Pfadzustände und Verbraucher frisch prüfen. Der unten beschriebene AppData-Kopierrückweg gehört zum
historischen Umzug vom 4. Oktober und ist kein Rücknahmebefehl für diese Ordnerumbenennung.

### Ausführung und Nachprüfung vom 27. Oktober

Der tatsächliche Pfad ist `D:\Arten-Explorer\data`, relative Konfiguration `data`, Zustand `ready`.
`D:\Arten-Explorer\Daten` existiert nicht mehr; keine Weiterleitung und keine zweite Datenkopie.
326 bisherige Dateien mit 136.438.546.089 Inhaltsbytes wurden als dasselbe Verzeichnis umbenannt.
Die unabhängige Vorher-/Nachheraufnahme bestätigt sämtliche 463 bisherigen Datei-/Verzeichnisidentitäten
und sämtliche Dateigrößen/Änderungszeiten. Nur `.storage-directory-rename.json` kam als Betriebsbeleg hinzu.
Originaljournal sowie Paar-, Korrektur- und Referenzzeiger sind per SHA-256 unverändert. Das ist kein
neuer vollständiger 136-GB-Inhaltsprüflauf und keine erneute Datenbankintegritätsprüfung.

Vorher-/Nachher-Versionsvergleich identisch und `current`: Master `master-20261024014609415`,
Paket `lightroom-cbbd9b7e7d35ac507d35`. Der echte Lua-Resolver liest die tatsächlichen kleinen Konfigurations-,
Umzugs-, Umbenennungs-, Veröffentlichungs- und Paketbelege und bestätigt dasselbe verfügbare Paket unter `data`.
Die alten AppData-/IUCN- und bisherigen Arten-Explorer-Datenpfade werden dabei korrekt aufgelöst.
Keine SQLite-Inhaltsöffnung, Originalkatalogöffnung oder Fotoänderung für diese Betriebsgegenproben.
Die drei einschlägigen Pfadvariablen sind auf Prozess-, Benutzer- und Maschinenebene ungesetzt.

Nach den letzten Programmänderungen vollständiges lokales `quality:ci` bestanden: 50 Gruppen / 2.280 Tests,
keine Fehler, Abbrüche oder Skips; Quell-/Dokumentänderungsstand während des Laufs unverändert.
Enthalten sind Umbenennung, Abbruch-/Kollisions-/Manipulationsschutz, Windows-Pfadvarianten,
erneuter Programmordnerwechsel, einfache/absolute Alt-Konfigurationen, Lua, Sicherung und Pages-Schutz.
Log-SHA-256: `0d6e436cae5e5d1ee48a76dcc87bd15b53a10950396328b9917d5cb1444d6f5b`.
Ein früherer begrenzter Testaufruf konnte benötigte Hilfsprozesse nicht starten; die entsprechend erlaubte
Ausführung besteht. Das anfängliche Scheitern einer selbst geschriebenen Lua-Gegenprobe lag an deren
unvollständigem Datei-Schließstub; der korrigierte lesende Lauf ist bestanden.

Dauerhafte technische Belege einschließlich vorheriger Konfiguration, Identitätsinventaren, Zeigerhashes,
Lua-Ergebnis und vollständigem Gate-Log liegen unter `data/storage-directory-changes/2026-10-27/`.
Die drei geschlossenen eigenen Prüfsitzungen wurden nach Prozess-/Eigentums- und Hashprüfung dorthin
verschoben; `evidence-relocation.json` bindet ihre früheren Tempadressen an den aktuellen Belegort.
Das ursprüngliche Auditarchiv unter `data/audit-evidence/phase-10-5/` bleibt unverändert.

Plug-in-Quellstand ist **0.4.24.42**; .41 war bereits für die private Auditprobe verwendet.
Keine native .42-Neuladung oder erneute Originalkatalogabnahme beansprucht. Lightroom blieb geschlossen.
Aus dem Pfadauftrag allein wurden keine NAS-Sicherung oder Veröffentlichung abgeleitet. Der anschließende
ausdrückliche Commit-/Push-/Pages-Auftrag ist in der [Roadmap](roadmap.md) festgehalten; private Daten bleiben lokal.

## Historische Freigabe und Speicherumzug vom 4. Oktober

Felix bestätigt am 4. Oktober als gemeinsamen Datenordner `D:\Arten-Explorer\Daten`. Taxonomiereferenz, Master,
Lightroom-Suchpaket, eigene Namen/Entscheidungen, Nutzungsquittungen und Aufträge werden zusammen verschoben.
Er verlangt den alten AppData-Datenpfad zu leeren, ohne Weiterleitungsverzeichnis und ohne dortige Rückfallkopie.
Felix hat anschließend den gesamten Programmordner in `D:\Arten-Explorer` umbenannt. Die Codex-Projektbindung
zeigt bereits auf den neuen Ort; Desktop-Verknüpfung und Lightroom-Registrierung sind danach bei geschlossenen
Verbrauchern korrigiert und geprüft. Keine Weiterleitung vom alten Programmpfad.

Abgeschlossener produktiver Datenwechsel:

| Merkmal | Geprüfter Wert |
| --- | --- |
| Quelle | `C:\Users\felix\AppData\Local\FN Wildlife Travel\Arten-Explorer` |
| Endgültiges Datenziel | `D:\Arten-Explorer\Daten` |
| Bestandsdateien | 207 |
| Gesamtbytes | 98.603.910.132 |
| Kopiervergleich | alle 207 SHA-256-Prüfwerte stimmen mit den Originalen überein |
| Planrevision | `3572354f69620c3556242d10a404ef9552ab0033606e6fd9287be02ad6947be5` |
| Umzugsjournal | `Daten/.storage-migration.json`, Zustand `committed`, 207 entfernte Originaldateien |
| Aktiver Pfad nach dem Wechsel vom 4. Oktober | `D:\Arten-Explorer\Daten`, relative Konfiguration `Daten`, Zustand `ready` |
| AppData-Quellordner | leer, keine Verknüpfung oder dortige Rückfallkopie |

Keine Taxonomieaktivierung oder Änderung von Datenbankinhalten durch den Wechsel. Produktive Übernahme
nach bestandenem Gesamtgate (50 Gruppen/1.177 Tests), unabhängig geschlossenen Verbrauchern und erneuter
vollständiger Zielprüfung. Jedes Original unmittelbar vor Entfernung erneut geprüft. Lesender Resolver,
Versionsvergleich, unverändertes aktives Paar/Vorgänger sowie Weissstorch/Rebhuhn im Suchhelfer bestätigt.
Der finale Hauptordnerwechsel ist ebenfalls technisch geprüft; Felix bestätigt anschließend Weissstorch und
Rebhuhn in den Verbrauchern. Das ersetzt keine vollständige Schließ-/Bedienabnahme. Die anfängliche Kopie
nach `D:\IUCN_Datenbank\Daten` wurde dabei nicht erneut kopiert.
Der alte leere Wurzelordner ist kein Datenbestand; der gebundene Rückweg nutzt ausschließlich die neuen
unveränderten Daten. Nach neuer Bearbeitung automatische Rücknahme weiterhin gesperrt.

## Resolver und Nachweise

Seit 27. Oktober ist der neue Standard `<Explorer-Ordner>/data`; `storage-path.json` kann einen absoluten anderen Datenpfad
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

## Abgeschlossener koordinierter Hauptordnerwechsel

Nach Felix' Rückmeldung „umbenannt“ lesend geprüft: `D:\Arten-Explorer` vorhanden und kein Verzeichnislink,
`D:\IUCN_Datenbank` nicht mehr vorhanden. Das gespeicherte Codex-Projekt zeigt auf den neuen Programmpfad;
kein direkter Eingriff in Codex-Datenbanken war erforderlich.

Explorer/Lightroom waren bei den Bindungsänderungen geschlossen. Die Desktop-Verknüpfung startet jetzt
`D:\Arten-Explorer\species-explorer\desktop\start-explorer.vbs`, mit neuem Arbeits-/Symbolpfad.
In Lightroom ausschließlich die ausgewählte Plug-in-Adresse und den dazugehörigen Eintrag in der installierten
Plug-in-Liste korrigiert: zwei Zeilen/drei Pfadstellen, übrige Einstellungen einschließlich UTF-8/CRLF bytegleich.
Keine ausdrücklich gespeicherten alten Helfer-/Suchpfade im FN-Präferenzblock oder relevanten Pfadvariablen.
Keine Windows-Aufgabenaktion mit altem Programmpfad gefunden. Die zwei lokalen, nicht versionierten
Batchdateien `update_local.bat` und `update_github_only.bat` verwenden nun ihren eigenen Ordner `%~dp0`;
beide Verzeichnisblöcke in isolierten Temp-Kopien aus einem fremden Arbeitsordner mit Leerzeichen geprüft.
Ihre produktiven Verarbeitungsschritte wurden nicht ausgeführt.

Originale der vier Bindungs-/Startdateien dauerhaft und SHA-256-geprüft unter
`Daten/program-path-change/2026-10-04` gesichert, nicht im löschbaren Test-temp. Rückwechsel nur koordiniert
bei geschlossenen Verbrauchern; ältere Gesamteinstellungen nach neuen Änderungen nicht blind zurückkopieren.
Die relative Konfiguration `Daten` und der Umzugsnachweis blieben bytegleich. Historische alte Pfade sind
Herkunftsbelege, keine weiterhin verwendeten Betriebsadressen; der gebundene Resolver übersetzt die Zugriffe.

Versionsvergleich `current`, unveränderte gemeinsame Veröffentlichung/Vorgänger sowie reale Weissstorch-/
Rebhuhn-Suche mit eigenen Namen und bisherigen IDs am endgültigen Pfad bestätigt. Desktop-Verträge 5/5,
Temp/Umzug 40/40 und Plug-in-Verträge 21/21 ohne Fehler, Abbruch oder Skip bestanden. Kein erneuter Vollscan
der 98,60 GB oder fachlicher ID-Gesamtvergleich für die reine Ordnerumbenennung behauptet.
Felix bestätigt anschließend die Anzeige von Weissstorch und Rebhuhn. Keine Quellenaktualisierung,
Fotoänderung oder Taxonomieaktivierung für den Pfadwechsel erforderlich.

## Lightroom-Nachkorrektur 0.4.24.22

Die danach gemeldete Warnung „Der Datenumzug ist unvollständig oder sein Nachweis wurde verändert“
war ein reiner Lua-Pfadvergleichsfehler, kein tatsächlich unvollständiger Datenwechsel. Das Originaljournal
verwendet Rückwärtsschrägstriche, die Konfiguration vorwärts gerichtete Schrägstriche. Der Node-Resolver
normalisierte diese bereits; der Lightroom-Resolver verglich zuvor die unveränderten Zeichenketten.

Plug-in 0.4.24.22 normalisiert für genau diesen Vergleich Trenner und abschließende Schrägstriche sowie
Groß-/Kleinschreibung bei Windows-Laufwerks- und UNC-Pfaden. Tatsächlich andere Herkunftspfade, geänderte
Revision, unvollständige Dateiliste oder laufender Umzug bleiben gesperrt. Konfiguration und Originaljournal
wurden nicht umgeschrieben. Der neue Regressionstest reproduzierte die ursprüngliche Warnung vor der
Korrektur und prüft die positiven und negativen Fälle danach.

Zusätzliche lesende Gegenprobe mit dem echten Lua-Resolver und den tatsächlichen kleinen Konfigurations-,
Umzugs-, Veröffentlichungs- und Paketbelegen erfolgreich: Paket vorhanden, `D:/Arten-Explorer/Daten/lightroom`,
Master `master-20261003055911210`, Paket `lightroom-fa739bd28ec1e82a0283`, 273.476 Taxa.
Keine Datenbankabfrage, Prüfsummenvollscan oder Katalogänderung für diese Gegenprobe. Temp/Umzug 41/41 und
Plug-in-Verträge 21/21 bestanden. Felix bestätigt am 5. Oktober die anschließende native Bedienprüfung:
Lightroom-Plug-in funktioniert, die vorherige Warnmeldung erscheint nicht mehr. Keine zusätzliche
Datenbank-/Katalogprüfung aus dieser Rückmeldung ableiten.
[Reparaturnachweis](audits/2026-10-04-creation-abort-and-publication.md).

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

`data`, der historische Name `Daten`, lokale Konfiguration, Prozesslock und Temp sind aus Git/Pages und Quellscans ausgeschlossen.
Das vollständige NAS-Backup berücksichtigt Daten und Konfiguration; Temp bleibt ausgeschlossen. Ein externer
Datenpfad oder während des Backups geänderter Datenstand darf keinen vollständigen Sicherungserfolg vortäuschen.
Keine neue produktive NAS-Sicherung zur Umsetzung gestartet.

Isolierte Tests prüfen Abbruch, doppelte Vorbereitung/Übernahme, Rückfall, Zielmanipulation, Links,
relative CLI-Ziele, unabhängige Konfiguration und portable Ordnerumbenennung. Sie ersetzen keinen tatsächlichen
Explorer-/Lightroom-Neustart am neuen endgültigen Pfad. Praktische Abnahme und Phase-10.5-Audit bleiben getrennt.
