# Fortsetzbarer Master-Hintergrundaufbau

Stand: 2026-10-01

## Freigabestand

Prozesskern, Service und Explorer-Bedienung sind implementiert und mit temporären Testbeständen geprüft.
`Datenbank aktualisieren` bereitet die heutigen Eingänge vor und lässt den Kandidaten im separaten Masterworker
aufbauen. Pause und ausdrückliche Fortsetzung sind angebunden. Seit 20. September laufen auch Kopie, Paketbau,
Prüfsummen, Datenbankprüfungen und Rücknahmevorbereitung der gemeinsamen Master-/Lightroom-Freigabe in einem
separaten Hilfsprozess. Nur der abschließende, frisch validierte Zeigerwechsel bleibt im Server.
Aufbewahrung und Platzprüfung sind mit bestätigter Vorschau, genau einem geprüften Vorgänger als Backup und
Schutz aller benötigten Aufträge angebunden; siehe `taxonomy-storage-maintenance.md`.
Dies ist noch keine Großbestandsfreigabe; die unten genannten Betriebsprüfungen fehlen.
Der am 29. September festgestellte, inzwischen kontrolliert reparierte Befund: Teil-Suchtreffer können bisherige
Aufnahme-Merkmale und belegte Identitätsfelder verdrängen. Dadurch fehlen Arten beziehungsweise ändern sich
IDs trotz weiter vorhandener Quellen. Quellenvereinigung und Aktivierungsschutz sind seit 30. September
implementiert und gezielt getestet. Kandidaten mit fehlenden Alt-IDs bleiben für Identitätsentscheidungen
prüfbar, können aber weder einzeln noch als Paar aktiviert werden. Lesende Vorschau reproduziert alle 154
ursprünglichen IDs. Der bestätigte Reparaturweg verwendet separaten Quellenentwurf, gespeicherten Workerauftrag
und technische Historie der vier Ersatz-IDs. Nach dem breiten Erstkandidaten und einem kontrollierten Schutzabbruch
ist der neue enge Reparaturkandidat am 1. Oktober vollständig unabhängig geprüft: 154 Original-IDs aktiv,
vier Ersatz-IDs historisch, keine zusätzlichen fachlich ungeklärten IDs und keine unbeteiligten Datenänderungen.
164 gezielte Regressionstests in acht Dateien einschließlich echter Hilfsprozesse erfolgreich.
Felix bestätigte anschließend die Paaraktivierung separat. Wartungsaufruf um 18:11:42 MESZ mit Exit 0 abgeschlossen:
Master `master-20261001145513036` / Lightroom-Paket `lightroom-63c431a5fa43190a4c52` gemeinsam aktiv,
vorheriges Paar vom 28. September als Rückweg erhalten. Unabhängiger lesender Paar-/Dateivergleich um
20:34:39 MESZ mit Exit 0 erfolgreich: alle 154 IDs in Master und Paket aktiv, vier Ersatz-IDs historisch,
eigene Namen/46 eigene ausgewählte Felder/60 Projektlinks erhalten; aktiver Master byteidentisch zum geprüften
Kandidaten, Paket vollständig auf Integrität und Prüfsummen geprüft. 69 geschützte Originaldateien unverändert.
Die Quellenreparatur ist damit produktiv abgeschlossen. Felix bestätigte anschließend am 1. Oktober die
gezielte Verbraucherabnahme mit Weissstorch/Rebhuhn: bevorzugte Namen im Explorer, Lightroom-Zuweisung und
Erhalt nach Schließen/Wiederöffnen. Die übrige Anzeigeabnahme, Betriebsprüfungen und das vollständige Phasenaudit
bleiben getrennt offen; die Stichprobe ist kein produktiver Pause-/Fortsetzungs- oder Rollbacktest.
Kein neuer Masterbau in der Aktivierung; inkrementeller Paketexport mit vollständiger Prüfung. Keine
Foto-/Projektmigration oder Katalogaktion. Vorgänger und Anbieterstände nicht bereinigen.
Vertrag und Tests: [Kontrollierte Wiederherstellung](taxonomy-partial-source-recovery.md).
Nachweis/Abgrenzung: [Masterdifferenz](audits/2026-09-29-taxonomy-difference.md).
Gesamtauftrag und verbleibende Optimierungen: `taxonomy-incremental-build.md`.
Der seit 24. September verwendete kandidatenlokale Befehlsspeicher enthält nur vorbereitete SQL-Texte,
keine Daten oder Prüfergebnisse. Er überlebt keinen Worker-Neustart; Fortsetzung und Rollback verwenden
weiterhin dieselben bestätigten 500er-Checkpoints und Datenbanktransaktionen.

Seit 22. September werden Suchbegriffe wiederverwendbarer Arten gebündelt aus dem gebundenen Altmaster
übernommen. Freigegebene Taxon-IDs werden mit dem jeweiligen 500er-Schreibblock gesichert, die Suchkopie selbst
gehört zum Abschlussblock. Fehler nach der Kopie lassen die Marker und bestätigten Taxa fortsetzbar zurück;
erneutes Ausführen erzeugt keine doppelten Suchbegriffe. Dieser Abschlussblock besitzt weiterhin keinen eigenen
Teilcursor: Nach Unterbrechung wird er wiederholt. Vor Kandidatenübergabe muss die Quellprüfsumme nochmals
mit der gebundenen Basis übereinstimmen. Vertrag: `taxonomy-incremental-build.md`.
Seit 23. September prüft der Abschluss außerdem die mögliche Übernahme seines heutigen Vorabplans.
Pause zwischen den Strukturvergleichen ist fortsetzbar; beim erneuten Aufruf wird der Plan neu gebunden.
Auch der Fortsetzungszweig für einen vollständig geschriebenen Master schließt Planleser vor der Übergabe,
damit offene SQLite-Dateien unter Windows den Verzeichniswechsel nicht blockieren.

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

Der Paarprozess übernimmt zusätzlich einen internen booleschen Parameter `incremental` für den Paketbau.
Standard ist unverändert `true`; `false` erzwingt den bestehenden vollständigen Export mit allen Prüfungen.
Der isolierte Vergleich `scripts/taxonomy-pipeline-benchmark.mjs` verwendet dies, damit sein vollständiger
Vergleichsweg nicht versehentlich weiterhin einen inkrementellen Paketbau misst. Es gibt keine neue UI-Aktion
oder automatische produktive Neuaktivierung. Ungültige Werte werden vor Prozessstart zurückgewiesen und im
Hilfsprozess nochmals geprüft. Aktivierungsbefugnis und frische Eingangsprüfung bleiben beim Elternprozess.
Messumfang und Grenzen: `taxonomy-operational-checks.md`.

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
ausdrückliche Fortsetzung erhalten. Die Speicherpflege bietet nur eindeutig überholte fertige Aufträge nach
Schonfrist an; sie löscht nichts ohne Bestätigung. Platzprüfungen mit 2 GiB Reserve schützen Spooling und Aufbau.

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

## Einmalige Vergleichsgrundlage für alte aktive Stände

Seit 28. September steht im Dialog **Datenbank-Aktionen → Taxonomiedatenbank** die Aktion
**Vergleichsgrundlage einmalig erstellen …** bereit. Sie ist nur sichtbar, wenn beim aktiven Master oder
Lightroom-Paket die aufgezeichneten Eingangsgrundlagen fehlen. Der normale Updateweg bleibt unverändert:
Aktuelle Anbieterstände lösen allein wegen dieses alten Formats keinen automatischen Vollaufbau aus.

Bedienung:

1. Nach Übernahme der Codeänderung den Arten-Explorer neu öffnen und den Datenbank-Aktionen-Dialog öffnen.
2. Unter Taxonomiedatenbank **Vergleichsgrundlage einmalig erstellen …** wählen. Zunächst wird der Status
   frisch gelesen; eine fehlgeschlagene Abfrage darf keinen alten Bestätigungsstand verwenden.
3. Für einen reinen Bediencheck die Rückfrage **abbrechen**. Das erzeugt keinen Aufbauauftrag und ändert
   keine aktiven Datenbanken. Erst **Lokal aufbauen und geprüft übernehmen** startet den tatsächlichen Lauf.
4. Der erste Aufbau verwendet ausschließlich die bereits lokalen CoL-/Anbieterstände, eigenen Entscheidungen
   und Projekteingänge. Es werden keine neuen Anbieterstände heruntergeladen. Dieser vollständige Erstlauf
   kann lange dauern; die kleinen synthetischen Messungen liefern dafür keine belastbare Dauerzusage.
5. Der alte Master und das alte Lightroom-Suchpaket bleiben bis zur vollständig geprüften gemeinsamen Freigabe
   aktiv und danach als Vorgänger erhalten. Eigene Namensentscheidungen werden berücksichtigt; Konflikte werden
   nicht still entschieden. Bestehende Fotos werden nicht geändert. Nach erfolgreicher Freigabe mit vorhandenen
   Eingangsgrundlagen verschwindet die einmalige Aktion.

`taxonomy-baseline-setup.mjs` bewertet nur die bereits gelesenen Statusmanifeste (`check: manifest-only`).
Es öffnet keine SQLite-Datenbank und berechnet keine Prüfsummen großer Dateien beim Anzeigen des Buttons.
Diese Anzeige ist **kein Integritätsnachweis und keine Freigabe zur inkrementellen Wiederverwendung**:
Aufbau, Quellbindung, Kandidatenprüfung und Paarfreigabe behalten ihre vollständigen Prüfungen. Beschädigte
oder nicht mehr passende Grundlagen werden weiter vom eigentlichen Aufbau behandelt.

`POST /api/taxonomy/master/build-baseline` verlangt `confirmed: true` und die frische `baselineSetup.revision`
aus `/api/taxonomy/master/status`. Die Revision bindet Master-/Paketkennungen und ihre aufgezeichneten
Prüfwerte, aktive Referenz sowie eigene Namens-/Identitätsentscheidungen. Die Berechtigung wird vor Start und
erneut unter der bestehenden Prozesssperre geprüft. Ein abweichender Stand benötigt eine neue Bestätigung;
der Aufrufer kann keine Anbieterdownloads über diesen Endpunkt einschalten. Die vollständigen Eingangsdateien
werden anschließend weiterhin durch den vorhandenen Auftrags-/Workerweg gebunden und geprüft.

Unvollständige oder veraltete Aufträge, vorhandene Kandidaten, laufende Aktionen sowie ein inkonsistenter
Referenz-/Paketstand sperren diesen Einstieg. Dann sind zuerst Fortsetzung, Kandidatenprüfung oder die reguläre
Aktualisierung erforderlich. Pause, Fehler, offene Konflikte und eine fehlgeschlagene Paarvorbereitung dürfen
nicht als Erfolg erscheinen. Die Rückfrage autorisiert Aufbau **und** geprüfte Übernahme; der Browser führt
nach einem erfolgreichen Aufbau zum vorhandenen Aktivierungsweg weiter. Schließen beziehungsweise Wiederöffnen
startet keinen Lauf und aktiviert keinen Kandidaten automatisch. Gesicherte Aufträge bleiben über den bestehenden
Wiederanlauf auffindbar; ein fertiger Kandidat kann nach erneuter Prüfung über die normale Aktualisierung
übernommen werden.

Der Aufbaupfad ist mit isolierten Testbeständen und inzwischen einem erfolgreichen produktiven Grundlagenlauf
geprüft. Felix hat zusätzlich das Öffnen und Abbrechen der Rückfrage praktisch bestätigt. Produktive Pause/
Fortsetzung, vollständige Verbraucher- und Rollback-Abnahme stehen weiterhin aus. Lightroom muss für den reinen Button-/Abbrechen-Test weder neu gestartet noch
ein Foto verändert werden. Squarespace-Footer und Lightroom-Plug-in-Version bleiben unverändert, da dieser
Schritt ausschließlich den lokalen Explorer betrifft.

Startvorbereitung am 28. September: Die erneut gelesenen Manifeste nennen unverändert
`master-20260905054823067`, das dazu passende Paket `lightroom-946c961bd063fd1b8f12` und die gemeinsame
CoL-Herkunft `col-xr-2026-08-26-316165`. Master-Eingangsgrundlage und Paket-Exportvertrag fehlen weiterhin.
Kein gespeicherter Aufbauauftrag, Staging-Kandidat oder gemeinsamer Veröffentlichungszeiger vorhanden.
Auf C: waren rund 139,1 GiB frei. Dies war nur ein Manifest-/Platzcheck, keine erneute Integritätsprüfung,
Dateiprüfsummenbestätigung oder dauerhafte Platzfreigabe. Der lokale Dienst auf `127.0.0.1:4177` war auch bei
der direkten lesenden Gegenprobe nicht erreichbar; ein aktueller API-Status konnte nicht bestätigt werden.
Deshalb kein automatischer Start: Explorer öffnen und den oben beschriebenen Bestätigungsweg nutzen. Dieser
prüft den heutigen Stand frisch. Es wurde weder ein Aufbau noch eine Aktivierung oder Bereinigung ausgeführt.

Anschließender Start durch Felix: 28. September, 08:36:59 MESZ (API-Startzeit `2026-09-28T06:36:59.942Z`).
Die erste lesende API-Prüfung bestätigte `building`, Phase `Eingangsstand sichern`, 45 % und ein leeres Fehlerfeld.
Aktiver Master und Lightroom-Paket waren weiterhin das oben genannte alte Paar; die Referenz passte dazu.
`buildJob.available: false` ist zu diesem Zeitpunkt die noch nicht abgeschlossene Auftragsvorbereitung,
kein nachgewiesener Auftragsverlust. Noch kein gesicherter Worker-Checkpoint und damit kein Pausentest.
45 % ist eine feste Phasenmarke während der Eingangsbindung, keine Messung von 45 % der Gesamtlaufzeit.
Die Meldung zur fehlenden Vergleichsgrundlage bezieht sich weiterhin auf den alten aktiven Stand.
Dieser Nachweis bestätigt ausschließlich den Start; Erfolg, Fortsetzung und Rücknahme sind nicht abgenommen.

Der nachfolgend lesend bestätigte Abschluss erfolgte um 10:07:59 MESZ; der neue Master und das Lightroom-Paket
sind gemeinsam aktiv, der bisherige Stand ist als Vorgänger vorhanden. Die Eingangs-/Exportgrundlage fehlt nun
nicht mehr. Details, Zeitangaben und die damals noch zu klärende Taxondifferenz stehen im
[Abschlussnachweis](audits/2026-09-28-taxonomy-baseline-run.md). Der Erfolgsdurchlauf ersetzt keinen Pause-/Rollbacktest.
Die nachfolgende [lesende Diagnose](audits/2026-09-29-taxonomy-difference.md) erklärt die Differenz durch
verlorene Aufnahme-Merkmale und vier unbestätigte ID-Wechsel bei fehlendem Reich. Der gemeinsame technische
Wechsel ist damit nachgewiesen, die fachliche Bestandsfreigabe aber bis zur Reparatur blockiert.

## Fortschrittsanzeige

Auftrag vom 28. September, nach dem erfolgreichen Grundlagenlauf **implementiert und gezielt automatisiert geprüft**.
Die frühere Anzeige fester Phasenmarken wie 45 % war als Gesamtfortschritt missverständlich. Das reine Modul
`public/app-taxonomy-progress.js` liefert nun dieselbe Darstellung für Dialog, Kopf und vorhandene Detailbalken.
Der produktive Aufbau wurde dafür nicht verändert, wiederholt oder zurückgenommen; die geöffnete Anwendung
wurde nicht neu gestartet. Die praktische Anzeigeabnahme bleibt offen.

- Darstellung: `Schritt X von Y · Phase · Z % dieses Teilschritts`. Der Aufbau hat sieben logische Meilensteine:
  Quellen vorbereiten, Eingänge sichern/lesen, Master aufbauen, Master prüfen, Lightroom-Paket erstellen,
  Gesamtstand prüfen, gemeinsam übernehmen. Auch offline werden zuerst lokale Quellen ausgewählt; der erste
  Schritt behauptet keinen Download. Unterphasen wie Schreiben und Suchindex haben eigene Messmengen, keinen
  gemeinsamen geschätzten Prozentwert. Namenswahl/Rücknahme nutzen zwei, reine Paketreparatur drei Schritte.
  Bei Wiederaufnahme wird die erneute Eingangsprüfung sichtbar. Keine Gleichsetzung von Schrittanzahl und Zeitanteil.
- Teilprozente nur aus belegten Mengen wie bearbeiteten Datensätzen oder Bytes berechnen. Bei unbekanntem Umfang
  ausschließlich Phase und laufende Tätigkeit zeigen, keine erfundenen 0/45/100 %. Ein späterer Gesamtprozentwert
  verlangt eine nachvollziehbare Messgrundlage über alle Arbeitsschritte, keine geratenen Zeitgewichte.
- Gesicherte Checkpoints getrennt vom gerade bearbeiteten Umfang anzeigen. Taxonzahlen des noch aktiven Altstands
  nicht als Zähler bereits verarbeiteter Datensätze des neuen Laufs darstellen.
- Obere Schaltfläche mit kompakter Anzeige derselben Schritt-/Fortschrittsquelle versorgen; vollständige Phase
  im Dialog beziehungsweise zugänglichen Detailtext. Auch bei geschlossenem Datenbankdialog aktuell halten,
  ohne zusätzliche Katalogscans, doppelte Statusabfrageschleifen oder einen automatischen Aufbau auszulösen.
- Abgeschlossener Masterbau bedeutet noch nicht abgeschlossener Gesamtvorgang. Erst nach erfolgreicher geprüfter
  gemeinsamer Freigabe `abgeschlossen` anzeigen. Pause, Unterbrechung, offene Entscheidungen und Fehler müssen in
  Kopf und Dialog übereinstimmend erkennbar sein; eine neue Phase darf nicht als Rücksprung einer Gesamtprozentzahl wirken.
- Gezielt prüfen: Voll-/Änderungsweg, lokaler Grundlagenlauf ohne Download, unbekannte Mengen, Phasenwechsel,
  geschlossener Dialog, Pause/Fortsetzung/Wiederöffnung, Konflikt, Paketfehler und erfolgreicher Gesamtabschluss.

Die bestehende Statusübertragung liefert bei Referenzphasen und wiedergefundenen Masteraufträgen die gemessenen
Zähler zusätzlich als `progressCurrent`/`progressTotal`. Alte `progressPercent`-Felder bleiben API-kompatibel,
werden aber von der Taxonomieanzeige nicht mehr verwendet. `null` wird nicht als 0 % interpretiert; 100 % einer
Teilphase ist erst bei tatsächlich erreichtem Gesamtzähler möglich. Gespeicherte Checkpoints autorisieren
weiterhin keine Aktivierung. Das Modul liest keine Datenbanken und startet keine Statusabfragen. Die vorhandenen
Controller aktualisieren den Kopf auch bei geschlossenem Dialog; keine zusätzliche Pollschleife.

Abnahme am 28. September: 74 gezielte Fortschritts-/Dialog-/Dashboard-/Service-/Vertragstests und 17 HTTP-/echte
Hilfsprozesstests bestanden. Syntax-, Stil-, Dokumentations- und Projektstatusprüfungen bestanden. Kein erneutes
vollständiges `quality:ci` und kein neuer produktiver Lauf. Lightroom-Plug-in, Squarespace-JS/CSS und Footer
bleiben unverändert. Der Modul-Auslieferungstest ist ergänzt; die neuen Fortschrittstests laufen über
`test:frontend-dashboard` auch im regulären Qualitätsgate.

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
inaktive Reste bleiben; markierte alte Vorbereitungen können über die bestätigte Speicherpflege entfernt werden.
Unmarkierte oder unbekannte Reste bleiben geschützt. Wiederöffnen startet keine Freigabe oder Bereinigung.
Ein erneuter bestätigter Versuch kann einen weiterhin gültigen fertigen Masterkandidaten verwenden, wiederholt
aber die Paarvorbereitung. Diese hat keine 500er-Checkpoints. Quellenbeschaffung und Eingangsaufbereitung sind
ebenfalls nicht mitten in jeder Operation fortsetzbar.

Auch die Rücknahme prüft das Vorgängerpaar und heutige Namenspräferenzen im Hilfsprozess. Die bisherige
Bestätigungspflicht und Identitätssperren bleiben bestehen; ein fehlgeschlagener Rücknahmeversuch aktiviert nichts.

## Weiter offen vor Großbestandsfreigabe

Die [lesende Vorprüfung vom 27. September](audits/2026-09-27-taxonomy-preflight.md) ist abgeschlossen:
aktive und vorherige Paare konsistent, vier Datenbanken ohne Integritätsbefund und unverändert. Dem aktiven
Altstand fehlten die gebundenen Master-/Export-Eingangsgrundlagen. Der erste vollständige Grundlagenlauf wurde
am 28. September erfolgreich abgeschlossen; damit ist eine Basis für den noch ausstehenden inkrementellen
Vergleich vorhanden. Die normale Updateentscheidung bleibt unverändert. Keine produktive Rücknahme oder
Bereinigung ausgeführt; die folgenden Abnahmen bleiben offen.

Zusammenhängender Workerabbruch, Fortsetzung, gemeinsamer Wechsel und Rollback bei offenen SQLite-Lesern
sind zusätzlich als eigenständiger isolierter Betriebscheck verbunden. Messgrößen und Grenzen stehen in
`taxonomy-operational-checks.md`; dieser Nachweis ersetzt keinen tatsächlichen Lightroom-/Explorer-Neustart.

Die normale Verbraucher-Stichprobe nach Schließen/Wiederöffnen wurde anschließend am 1. Oktober von Felix
für Weissstorch/Rebhuhn bestätigt. Offen bleiben Fehler-/Worker-Wiederanlauf, produktive Pause/Fortsetzung,
Rücknahme und die übrigen Anzeige-/Großbestandsgrenzen; keinen weiteren Aufbau nur für diese Anzeige starten.

1. Gesamtablauf mit tatsächlichem Explorer-Neustart, geöffnetem Lightroom, Platzmangel und Rücknahme abnehmen,
   einschließlich der technisch implementierten Speicherpflege/Platzprüfung.
2. Speicher-/Laufzeitmessung am großen Bestand, danach gebündelte Abnahme und Audit.

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

Der Grundlagen-Startweg ergänzt Status-/Bestätigungstests im Masterservice, Routingtests und Controllerprüfungen
für Öffnen ohne Schreibzugriff, Abbrechen, Doppelklick, Lesefehler, veraltete Bestätigung, konkurrierende Aufträge,
Pause, Konflikte und fehlgeschlagene Paarfreigabe. Ein echter Worker baut aus einem kleinen Altstand ohne
Eingangsgrundlage einen neuen Kandidaten. Der Test prüft den unveränderten Altmaster bis zur ausdrücklichen
Paarfreigabe, den erhaltenen Vorgänger sowie das anschließende Ausblenden und die Ablehnung einer Wiederholung.

Prüfabschluss 28. September: 36 gezielte Service-/Dialog-/Routing-/Oberflächen-Vertragstests und 11 Tests
mit echten Hilfsprozessen bestanden. Dokumentations-, Quellstil- und Projektstatusprüfung bestanden ebenfalls.
Das vollständige `quality:ci` wurde für diesen begrenzten Schritt nicht erneut ausgeführt; sein letzter
dokumentierter Gesamtlauf vom 27. September ersetzt nicht die noch offene produktive Bedien-/Großbestandsabnahme.

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
