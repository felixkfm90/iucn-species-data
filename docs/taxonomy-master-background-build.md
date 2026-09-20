# Fortsetzbarer Master-Hintergrundaufbau

Stand: 2026-09-20

## Freigabestand

Prozesskern, Service und Explorer-Bedienung sind implementiert und mit temporären Testbeständen geprüft.
`Datenbank aktualisieren` bereitet die heutigen Eingänge vor und lässt den Kandidaten im separaten Masterworker
aufbauen. Pause und ausdrückliche Fortsetzung sind angebunden. Seit 20. September laufen auch Kopie, Paketbau,
Prüfsummen, Datenbankprüfungen und Rücknahmevorbereitung der gemeinsamen Master-/Lightroom-Freigabe in einem
separaten Hilfsprozess. Nur der abschließende, frisch validierte Zeigerwechsel bleibt im Server.
Dies ist noch keine Großbestandsfreigabe; Aufbewahrung, Platzbudget und die unten genannten Betriebsprüfungen fehlen.
Gesamtauftrag und verbleibende Optimierungen: `taxonomy-incremental-build.md`.

## Zuständigkeiten

- `taxonomy-master-job.mjs`: vollständige Eingänge zeilenweise sichern, Auftragsrezept und Prüfsummen,
  Bindung an Regeln und Ausgangsstände, exklusive Prozesssperre.
- `taxonomy-master-process.mjs`: versteckter Node-/Electron-Hilfsprozess, Fortschrittskanal und Pausenanforderung.
- `scripts/taxonomy-master-worker.mjs`: minimaler Prozesseinstieg; bei Verlust des aufrufenden Prozesses pausieren.
- `taxonomy-master-worker.mjs`: Rezept erneut prüfen, bestehenden Kandidatenbauer ausführen, Fortschritt speichern.
- `taxonomy-master-checkpoint.mjs`: Schreibzähler und zugehörige Daten im selben SQLite-Commit bestätigen.
- `taxonomy-master-source-binding.mjs`: heutige CoL-/Anbieterauswahl und eigene Eingänge vergleichen.
- `taxonomy-master-run-controller.mjs`: letzten Auftrag wiederfinden, serviceweite Sperre, Pause/Fortsetzung
  und erneute Eingangs-/Kandidatenprüfung vor Aktivierung.
- `taxonomy-master-service.mjs` und `public/app-taxonomy-database.js`: geschützte API und sichtbare Bedienung.
- `taxonomy-publication.mjs`: schwere Paarvorbereitung getrennt von der kurzen atomaren Freigabe.
- `taxonomy-publication-process.mjs` und `scripts/taxonomy-publication-worker.mjs`: versteckter Hilfsprozess
  für Paarvorbereitung/Rücknahme, Fortschritt, Abbruch und vollständige Ergebnisübergabe.

Der Masterworker hat keine Download-, Aktivierungs-, Git- oder Lightroom-Katalogaktion. Er stellt ausschließlich
einen geprüften Staging-Kandidaten bereit. Die gemeinsame Master-/Suchpaketfreigabe bleibt ein separater Schritt.

## Speicher- und Fortsetzungsvertrag

Aufträge liegen unter `taxonomy/master/build-jobs/job-<UUID>/`. CoL- und Anbieterzeilen werden mit begrenztem
Schreibpuffer als JSONL gespeichert. Erst vollständige, per SHA-256 geprüfte Eingänge erhalten `recipe.json`.
Ein Lesefehler beim Vorbereiten entfernt nur den gerade selbst angelegten, unvollständigen Auftrag.

Das Rezept hält Erstellzeit, Quellenstände, Auswahlumfang, eigene Korrekturen, Projektwerte und Identitätsregister
fest. Zusätzlich werden die Aufbauregeln, der gemeinsame Aktivzeiger sowie aktive und vorherige Masterdateien
einschließlich ihrer Manifeste per Prüfsumme gebunden. Der Aufrufer kann weitere Eingangsdateien über `guardFiles`
binden. Vor Prozessbeginn und vor Bereitstellung des Kandidaten werden Bindung und Eingangsdateien erneut geprüft.
Gleiche Versionsnummer bei geänderten Dateiinhalten reicht nicht zur Fortsetzungsfreigabe.

Der Explorer bindet zusätzlich die aktuelle CoL-Auswahl samt Dateien, die jeweils heute neuesten fünf
Anbieterausschnitte, Projekt- und Korrekturdatei, Identitätsvormerkungen sowie dauerhaft recherchierte Taxa.
Ein neuer Anbieterrelease wird auch bei unverändert erhaltenem Vorgänger erkannt. Normale Suchcacheeinträge
und deren Zeitstempel zählen nicht zu diesen Eingängen und veralten einen Lauf nicht. Die Werte für den Bau
werden nach dem Bindungssnapshot neu gelesen; Änderungen während der Vorbereitung werden vor Workerstart
abgewiesen. Auch ein fertig gespeicherter Kandidat wird vor Aktivierung erneut gegen seine Eingänge geprüft.

Die Verbindungssperre in `execution-lock.sqlite` lässt genau einen Worker pro Taxonomieverzeichnis schreiben.
Bei Prozessende gibt das Betriebssystem die Sperre frei. Es gibt keine Sperrübernahme nach geratenem Alter,
kein Töten fremder Prozesse und keine Sperrdateilöschung anhand einer PID. `state.json` dient nur der Anzeige;
es ist weder Sperre noch Beleg für einen bestätigten Schreibblock.
`control-lock.sqlite` schützt zusammenhängende Serviceaktionen einschließlich Vorbereitung und späterer
Aktivierung. Ein nach Explorerverlust noch lebender Worker blockiert konkurrierende Master-/Referenzaktionen
auch im neu geöffneten Dienst. Namenspräferenz-Schreibaktionen im Explorer werden währenddessen abgewiesen.

Je 500 vollständig bearbeitete Artgruppen werden zusammen mit ihrem Zähler bestätigt. Der Cursor liegt als
zusätzlicher interner Schlüssel `buildCheckpoint` in der vorhandenen Tabelle `master_schema_info`; Fachschema,
Taxon-IDs und fachliche Regeln ändern sich dadurch nicht. Auch die Zahl bereits wiederverwendeter Arten wird
mitgeführt. Bei hartem Prozessabbruch rollt SQLite den noch offenen Block zurück. Ein neuer Prozess prüft die
Eingänge und Gruppenreihenfolge erneut und überspringt bereits bestätigte Schreibblöcke. Nach Fehlern in der
Abschlussprüfung bleiben die geschriebenen Gruppen erhalten. Ein vollständig bestätigter Datenbankabschluss
wird ebenfalls erkannt; Identitätshistorie und Suchdaten werden dann nicht nochmals angehängt.

Pausieren geschieht kooperativ am nächsten sicheren Haltepunkt. Eine lange synchrone Prüfoperation kann die
Reaktion verzögern; es gibt keine zugesagte maximale Pausendauer. Eingangsprüfung, Gruppierung und
Wiederverwendungsplanung werden bei Wiederaufnahme erneut durchlaufen. Auch eine unterbrochene Abschlussprüfung
wird wiederholt. **Es wird nicht jede Rechenphase mitten in ihrer Ausführung fortgesetzt.** Das verhindert weder
alle langen Wartezeiten noch den bisher erhöhten Speicherbedarf. Ein unterbrochenes Anlegen des Schemas ohne
bestätigten Cursor wird nur im privaten Kandidatenverzeichnis neu begonnen.

Bereits fertiges Staging, aktiver Master und aktives Lightroom-Paket bleiben bis zum erfolgreichen Abschluss
unverändert. Ein erneuter Aufruf desselben fertigen Auftrags ersetzt den Kandidaten nicht nochmals. Nach einer
zwischenzeitlichen Aktivierung wird die alte Ausgangsbindung ungültig. Angefangene Aufträge bleiben für eine
ausdrückliche Fortsetzung erhalten; automatische Aufbewahrung und Platzbudget sind noch zu ergänzen.

## Bedienung und Wiederfinden

Im Bereich Taxonomiedatenbank erscheint bei laufendem Masterworker **Masteraufbau pausieren**. Während
Download und Eingangsaufbereitung ist noch kein pausierbarer Schreibprozess vorhanden. Nach Anforderung
bitte warten, bis ausdrücklich **pausiert** angezeigt wird. Der gesicherte Zähler, etwa
`Gesichert: 1.500 von 2.000 Artgruppen`, steht getrennt vom momentanen Fortschritt.

`master/build-jobs/current.json` verweist auf den letzten vollständig vorbereiteten Auftrag. Der Dienst liest
beim Wiederöffnen nur dessen Status; er startet keinen Aufbau und keinen Download. **Masteraufbau fortsetzen**
verlangt Bestätigung, prüft die heutigen Eingänge und setzt nur einen passenden Auftrag fort. Eine konkurrierende
Fortsetzung darf die Pausenanforderung eines bereits laufenden Workers nicht löschen. Bei Erfolg führt der
Explorer zum bestehenden geprüften Master-/Suchpaketwechsel weiter; offene Konflikte verhindern die Aktivierung.

Bei **veraltet** wird stattdessen **Neuen Datenbankaufbau starten** angeboten. Das erstellt nach Bestätigung
einen neuen Auftrag aus den aktuell lokal vorhandenen Quellen. Der frühere Zwischenstand wird nicht gelöscht.
Ein pausierter/unterbrochener Lauf darf weder über die Oberfläche noch über die Aktivierungs-API versehentlich
ein älteres Staging aktivieren. Bei Schließen des Dienstes wird für einen laufenden Worker eine Pause angefordert;
bei hartem Prozessverlust greift zusätzlich dessen bestehender IPC-Abbruchschutz.

API: `POST /api/taxonomy/master/pause-build` und `POST /api/taxonomy/master/resume-build`
(Fortsetzen mit `confirmed: true`), unter den bestehenden lokalen Sitzungs-/Browsergrenzen.
Die Statusantwort enthält `buildJob` mit Zustand, letzter Anzeige des Checkpoints und erlaubten Aktionen.

## Gemeinsame Master-/Lightroom-Abschlussprüfung

Der Server hält vor Beginn die Eingangsrevision, aktiven Zeiger, Korrekturen und das Kandidatenmanifest fest.
Der Paarworker kopiert den Kandidaten in ein eigenes Arbeitsverzeichnis, baut beziehungsweise ergänzt das
Suchpaket und prüft die Datenbanken vollständig. Danach stellt er unveränderliche Releaseordner bereit;
**er aktiviert selbst nichts**. Vor der Freigabe prüft der Server unter der kurzen Korrektursperre erneut
die heutigen Eingänge und Manifeste. Eine zwischenzeitliche Namenswahl oder ein geänderter Kandidat sperrt
den Wechsel. Nur danach ersetzt er den gemeinsamen Aktivzeiger.

Ein Workerfehler, Abbruch oder Explorer-Schließen vor diesem Zeigerwechsel lässt das bisherige Paar aktiv.
Der Dienst beendet seine eigene laufende Paarvorbereitung; ein verlorener Elternprozess beendet den Worker.
Unfertige eigene Arbeits-/Releaseordner werden beim geordneten Fehlerweg entfernt. Nach einem unklaren
Zeigerschreibausgang bleiben Releaseordner vorsichtshalber erhalten. Bei hartem Prozessverlust können ebenfalls
inaktive Reste bleiben; deren begrenzte Aufbewahrung ist noch offen. Wiederöffnen startet keine Freigabe.
Ein erneuter bestätigter Versuch kann einen weiterhin gültigen fertigen Masterkandidaten verwenden, wiederholt
aber die Paarvorbereitung. Diese hat keine 500er-Checkpoints. Quellenbeschaffung und Eingangsaufbereitung sind
ebenfalls nicht mitten in jeder Operation fortsetzbar.

Auch die Rücknahme prüft das Vorgängerpaar und heutige Namenspräferenzen im Hilfsprozess. Die bisherige
Bestätigungspflicht und Identitätssperren bleiben bestehen; ein fehlgeschlagener Rücknahmeversuch aktiviert nichts.

## Weiter offen vor Großbestandsfreigabe

1. Aufbewahrung und Platzbudget der Jobspools, inaktiven Vorbereitungen und unveränderlichen Releases ergänzen.
2. Gesamtablauf mit tatsächlichem Explorer-Neustart, geöffnetem Lightroom, Platzmangel und Rücknahme abnehmen.
3. Speicher-/Laufzeitmessung am großen Bestand, danach gebündelte Abnahme und Audit.

Die automatische Prüfung erzeugt echte Hilfsprozesse und öffnet den Service neu, startet aber keinen produktiven
Explorerlauf. Stromausfall und kompletter Betriebssystem-Neustart wurden nicht getestet. Für diesen technischen
Schritt ist kein schreibender Lightroom-Test nötig; bitte noch keinen Großbestandslauf allein zum Button-Test starten.

## Automatisierte Prüfung

`node --test --test-isolation=none species-explorer/taxonomy-master-worker.test.mjs` prüft isoliert:

- Fortsetzung eines bestätigten Blocks ohne doppelte Arten, Quellen oder Suche; Ergebnisvergleich aller
  Fach- und Suchtabellen gegen den unveränderten Vollaufbau. Nur interne Checkpoint-Metadaten sind ausgenommen.
- Abbruch während der Schlussprüfung und nach fertigem Datenbankcommit; bisheriges Staging bleibt erhalten.
- Geänderte eigene Eingangsdatei, geänderter aktiver Master bei gleicher Version, beschädigte JSONL-Datei und
  unterbrochenes Sichern der Eingänge.
- Prozesssperre, ausdrückliche Pause/Fortsetzung, verlorener Explorer-Kanal und hart beendeter echter Worker.
- Fortsetzung inkrementell übernommener Arten samt aktuellen Quellenbelegen und unverändertem Basismaster.

`taxonomy-master-background-service.test.mjs` prüft zusätzlich den echten Service-/Workerweg, Pause,
Wiederentdeckung im neu geöffneten Dienst, explizite Fortsetzung ohne erneuten Anbieterabruf, Eingangsänderung,
Ablehnung älterer Kandidaten, neue Anbieterreleases, Suchcachegrenzen und prozessübergreifende Sperren.
Die UI-Tests prüfen Zustände, sichtbaren Schreibzähler, Bestätigung und ausbleibende Aktivierung bei Pause.
Die Tests sind Bestandteil von `test:taxonomy-master` beziehungsweise `test:lightroom` und damit `quality:ci`.
Sie verwenden ausschließlich eigene temporäre Datenbanken. Kein produktiver Quellenlauf, keine Fotoänderung.

`lightroom-search-package.test.mjs` prüft zusätzlich echte Paarworker: kein Zeigerwechsel im Worker,
weiter bedienbare Eltern-Ereignisschleife, gemeinsame Freigabe/Rücknahme, Abbruch mit erneutem Versuch,
geänderte Eingänge nach Vorbereitung und Explorer-Schließen ohne Aktivierung oder automatischen Wiederstart.
Protokolltests sichern Start-/Kanal-/Fortschrittsfehler, fehlende Ergebnisse und ein letztes IPC-Ergebnis nach
dem Prozess-Exit ab. Das prüft die Prozessgrenze, ersetzt aber keinen Laufzeitnachweis am Großbestand.

Prüfung des isolierten Kerns vor der Explorer-Anbindung am 14. September: zwölf direkte Worker-/Checkpointtests sowie das vollständige
`npm.cmd run --silent quality:ci` bestanden (Exitcode 0). Der separate Lightroom-Vertragstest bestand mit
14 Tests. Ein erster Gate-Lauf scheiterte ausschließlich beim Entfernen eines inzwischen leeren Windows-
Testordners der Versionsprüfung; dessen Fixture verwendet jetzt begrenzte Aufräumwiederholungen. Der zweite
vollständige Lauf war erfolgreich. Projektstatus synchronisiert, `git diff --check` erfolgreich. Der
Squarespace-Footer wurde geprüft: keine eingebundenen Frontendmodule betroffen. Keine Lua-Änderung in diesem
Schritt, Plug-in weiterhin 0.4.24.14. Keine produktive Aktivierung, kein Commit und kein Push.

Abschluss der Explorer-Anbindung am 20. September: Das vollständige `npm.cmd run --silent quality:ci`
ist mit Exitcode 0 bestanden. Es umfasst jetzt 13 Worker-/Checkpointtests und zehn Hintergrund-Service-Tests
mit echten Hilfsprozessen, einschließlich fertigem Kandidaten und ausdrücklich bestätigtem Master-/Paketwechsel
in temporären Testbeständen. Der separate Lightroom-Vertragstest besteht weiterhin mit 14 Tests.
Ein verlorenes letztes IPC-Ergebnis beim Prozessende wurde während dieser Anbindung korrigiert und abgesichert.
Die oben aufgeführten Großbestands-/Betriebsgrenzen bleiben offen; dies ist kein Phase-10-Gesamtaudit.
Parallel behobene Explorer-Regressionen: [Prüfabschluss](explorer-regression-fixes.md).

Fortsetzung am 20. September, Paarworker: 22 gezielte Paket-/Prozess-/Referenztests bestanden, darunter
17 Suchpaket-/Paarfälle und fünf Referenzdienstfälle. Das vollständige `npm.cmd run --silent quality:ci`
bestand erneut mit Exitcode 0; der separat wiederholte Lightroom-Vertragstest bestand mit 14 Tests.
Syntax, Stil, Dokumentationslinks, Schemata, Projektstatus und lokale Asset-/Projektprüfungen sind erfolgreich.
Der echte lokale Rebhuhn-Bestand wurde nur lesend mit einer nachgeladenen CoL-Zeile nachgestellt: ein Mastertreffer
und dieselbe Masterdetailansicht für die frühere CoL-Kennung. Keine produktive Freigabe oder neue Namenswahl.
Squarespace-Footer geprüft: Keine dort eingebundenen Module geändert, keine Versionsanhebung nötig.
Plug-in weiterhin 0.4.24.14; keine Lua-Änderung, kein Commit/Push in diesem Schritt.
