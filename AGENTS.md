# AGENTS.md - Projektuebergabe Wildlife/IUCN Squarespace

Stand: 2026-10-02

Projekt: `fnwildlifetravel.de` Wildlife-Artseiten, IUCN-Daten, Karten, Sounds, Suche und Lightbox-Zoom
Repository: `felixkfm90/iucn-species-data`
Branch: `main`
GitHub Pages Base: `https://felixkfm90.github.io/iucn-species-data/`

## Aktuelle Übergabe – 2. Oktober 2026

Maßgeblicher kompakter Betriebsstand: `docs/taxonomy-current-status.md`; Dokumentationsübersicht:
`docs/README.md`. Die Quellenreparatur ist technisch abgeschlossen und von Felix mit Weissstorch/Rebhuhn
gezielt praktisch bestätigt (Explorer-Namen, Lightroom-Zuweisung, Erhalt nach Schließen/Wiederöffnen).
Die Meldung zu `COL26.9 XR` bezeichnet ein separates Quellenupdate, keinen Drift des passenden lokalen Paars.
Als nächstes nur den gesondert beauftragten regulären Updatevertrag einschließlich der 2.173 CoL-/Reichsfälle
prüfen; keinen zusätzlichen Aufbau, Download, Katalogabgleich oder Bereinigung aus alten Laufnotizen ableiten.
Historische Schritte/Freigaben darunter bleiben Nachweise, keine noch laufenden Aufträge. Die aktuelle
Restreihenfolge steht am Anfang von `docs/roadmap.md`; Phase 10 und ihr Gesamtaudit bleiben offen.
Felix hat anschließend das Nachziehen der gesamten betroffenen Dokumentation und Commit/Push dieser bislang
unveröffentlichten Arbeitsserie beauftragt. Keine Freigabe für zusätzliche Quellenupdates oder Bereinigung.
Abschließender Dokumentations-/Veröffentlichungscheck: vollständiges `quality:ci` mit Exit 0, 50 Testgruppen/
810 gemeldete Tests, keine Fehler/Abbrüche; 70 Markdown-Dateien ohne fehlende lokale Verweise und aktueller
generierter Projektstatus. Erste sandboxbedingte Hilfsprozesssperre durch erlaubten Gegenlauf geklärt, keine
Test-/Windows-Regeländerung. Keine neue Lua-Version, Squarespace-Einbindung oder produktive Datenänderung.
Das ist kein Phase-10.5-Audit und kein vorweggenommener Pages-Deploymentnachweis.
Der anschließende Pages-Lauf für `d7bcc76` scheiterte vor Build/Deploy an zwei CLI-Tests mit fest eingetragenen
Windows-Pfaden unter Linux. Nur Testfixtures auf plattformeigene absolute Pfade umgestellt; die produktive
Pfad-/Bestätigungsprüfung bleibt unverändert. Relative Entscheidungsdateien und fehlende Bestätigung werden
für alle vier schreibenden CLI-Wege ausdrücklich gegengeprüft. Kein neuer Taxonomie-/Kataloglauf zur CI-Korrektur;
der erfolgreiche GitHub-Linux-/Pages-Lauf muss separat nachgewiesen werden.
Inzwischen bestätigt: Pages-Lauf `36915759582` für `bf953ae` vollständig erfolgreich, einschließlich Linux-
Qualitätsgate, Build und Deployment. Keine erneute CI-Reparatur erforderlich.
Aktueller Arbeitspunkt: regulärer Updatevertrag. Vorprüfung am 2. Oktober reproduziert mit vier isolierten
Datenbankpaaren die fehlende Unterscheidung passender/abweichender/mehrdeutiger/fehlender Anbieter-ID-Verweise
bei verschiedenen Reichen; alle sind bisher technisch aktivierbar. Sechs gezielte Regressionstests bestanden.
Die beiden UI-Einstiege haben weiterhin unterschiedliche Wirkung. Felix beauftragte danach die gebündelte
bestätigungspflichtige Prüfung mit ID-Erhalt. Erste Stufe implementiert: alle CoL-ID-Verweise erhalten,
passende/abweichende/mehrdeutige/fehlende Quellenbeziehung zählen, neue CoL-/Reichsgegenstücke bisheriger
Referenzlücken als offene Identitätsprüfung sperren und kompakt gruppieren. Keine normale Feldentscheidung
oder Einzel-/Paaraktivierung darf diese Fälle freigeben. Der enge Quellenreparaturweg bleibt unverändert.
Zweite Stufe inzwischen implementiert: revisionsgebundene Vorschau und bestätigte Bündelvormerkung passender
Quellenfälle, neuer Kandidatenbau mit ursprünglicher ID, Namens-/Projektlink-Erhalt und rohen Anbieterbelegen.
Neuer Typ `classification` bleibt getrennt von normalen Fortführungs-/Split-/Merge- und Reparaturereignissen;
keine Fotomigration oder künstliche Namenssynonyme. Fehlende/widersprüchliche Folgebelege stoppen zur erneuten
Prüfung. Zurückstellung unklarer Fälle und einheitlicher Update-Einstieg bleiben offen. Kein produktiver
Vergleich/Download/Aufbau/Wechsel/Kataloglauf. Details und nächste Grenze:
`docs/taxonomy-reference-update.md`.

Prüfabschluss dieser ersten Stufe: 178 gezielte Tests in zehn Dateien erfolgreich, einschließlich echter
Master-/Paar-Hilfsprozesse und bestehender Reparatur-/Identitätswege. Abschließende neun UI-Tests erneut
bestanden. Syntax/Stil, 70 Markdown-Dateien ohne fehlende lokale Verweise, aktueller Projektstatus und
Diffprüfung erfolgreich. Erlaubter Gegenlauf nach Prozessbeschränkung; keine Windows-/Testregeländerung.
Kein vollständiges Qualitätsgate oder produktiver Bedienlauf; Lua-Version bleibt `0.4.24.14`, Explorer-JS
nicht im Squarespace-Footer eingebunden. Regelbindungen für neue Aufträge umfassen die Klassifikationsprüfung;
historische Auftrags-/Reparaturbindungen nicht nachträglich umschreiben.

Prüfabschluss zweite Stufe: 215 gezielte Tests in 14 Dateien erfolgreich, einschließlich echter Hilfsprozesse,
enger Quellenreparatur, bisheriger Identitätswege und Lightroom-Auflösung der unveränderten ID. Synthetisches
1.693-Fälle-Bündel, Vorschau/Abbruch, veraltete/manipulierte Belege, doppelte Bestätigung, Schreibfehler/Wiederholung,
Vormerkungs-Neustart/Rücknahme, frischer Kandidat/Folgeaufbau und Rollback geprüft. Abschließende 36 Bündel-/UI-
Tests in drei Dateien ebenfalls erfolgreich, zusätzlich mit geprüfter Eingangsgrundlage und 104 passenden/
einem unklaren Fall oberhalb der Listenbegrenzung. Keine produktiven Daten
berührt und kein vollständiges Qualitätsgate in diesem Schritt. Pages-Lauf `37009726984` für `ea55bb4`
vollständig erfolgreich; Veröffentlichung der zweiten Stufe gesondert prüfen.

- Namenswahl: Die falsche Sperre unveränderter alter Korrekturreleases ist ID-geprüft behoben. Doppelte
  CoL-/Ergänzungstreffer für eindeutig vorhandene Masterarten werden auch nach der Ergänzungssuche unterdrückt;
  alte CoL-Auswahlen öffnen bei eindeutiger Identität dieselbe Master-Namenswahl. Keine automatische Artmigration.
- Artanlage: Entwurf/Portrait ohne Sitzungs-Ablauffrist, Karten-Dateiauswahl/Drop im Assistenten und sichtbare,
  schließbare Fehlerzustände sind implementiert. Erneute praktische Abnahme der Regressionskorrekturen offen.
- Sound-Rücksetzung am 27. September: artbezogene Freigabe gespeicherter Ablehnungen mit Rückfrage im
  Assistenten und Sound-Editor. Im Assistenten folgt nur die Soundsuche, ohne erneute Artanlage. Dateien,
  manuelle Schutzmarkierungen und fremde Ablehnungen bleiben erhalten. Ein Footer-Schließen statt zwei;
  Fehler-/Wiederholungs-/Neustarttests vorhanden. Felix bestätigte Editor und Assistent nach Suchende praktisch.
  Nun auch während offener Soundprüfung: nach Rückfrage frühere Quellen freigeben und aktuellen Kandidaten
  überspringen, gemeinsam mit der Review-Entscheidung und an deren URL gebunden. Felix hat auch diesen
  zusätzlichen Weg bestätigt; am 28. September als praktisch abgenommen dokumentiert. Keine echten Ablehnungen
  durch die Implementierung gelöscht.
  Die gemeldete kurze Eingabesperre bei aktivem Listenfilter ist nicht reproduziert; der Filter blockiert laut
  Codeprüfung die Artanlage nicht. Controller-Gegenprobe mit verzögerter Referenz bestanden. Felix betrachtet
  die Beobachtung vorerst als erledigt und meldet ein erneutes Auftreten; Ursache nicht bestätigt, keine weitere
  Untersuchung eingeplant. Parallel laufende Lightroom-Prozesse sind nur eine mögliche Auslastungsquelle.
- Hintergrundaufbau: Masterworker mit 500er-Checkpoints und ausdrücklicher Pause/Fortsetzung ist angebunden.
  Auch die schwere Master-/Lightroom-Paarvorbereitung einschließlich Rücknahme läuft nun im Hilfsprozess;
  nur frische Eingangsprüfung und gemeinsamer Zeigerwechsel bleiben im Server. Echte Hilfsprozesstests vorhanden.
- Speicherpflege: bestätigt entfernbare Altstände mit Vorschau, unverändertem Plan und Prozesssperren;
  aktives Paar plus genau ein prüfsummenbestätigter Vorgänger als Backup. Aktueller Kandidat, benötigte Aufträge
  und deren Abhängigkeiten bleiben geschützt. 2-GiB-Reserve und wiederholte Platzprüfungen sind angebunden.
  Keine produktive Bereinigung in diesem Schritt. Vertrag: `docs/taxonomy-storage-maintenance.md`.
- Betriebscheck: ein zusammenhängender Test mit echten Hilfsprozessen prüft harten Workerabbruch, Fortsetzung,
  gemeinsamen Paketwechsel, eigene Namenswahl und Rollback bei offenen SQLite-Lesern. Der Größenvergleich
  wird getrennt mit synthetischen Arten wiederholt; Ergebnisse/Grenzen: `docs/taxonomy-operational-checks.md`.
- Gezielter Paketexport: Fingerabdrücke sind an Exportregeln, Quellmaster und Paketprüfsumme gebunden;
  nur geänderte Taxa werden projiziert, Herkunftszeiten separat aktualisiert. Alte/unklare Grundlagen sowie
  breite Änderungen fallen auf Vollaufbau zurück. Vollständige Basisprüfung läuft verpflichtend parallel.
  Vertrag: `docs/lightroom-incremental-export.md`.
- Master-Suchübernahme: Bereits zur Wiederverwendung freigegebene Arten erhalten ihre geprüften Suchbegriffe
  gebündelt aus dem nur lesend angeschlossenen Altmaster. Nur betroffene Arten werden neu normalisiert.
  Freigabemarker teilen den Taxoncheckpoint; nach Abschlussfehler bleibt ein erneuter Versuch möglich.
  Eine erneute Quellprüfsumme vor Kandidatenübergabe verhindert die Nutzung zwischenzeitlich veränderter Basisdaten.
  Fachbelege und aktuelle Herkunftsangaben werden weiterhin im neuen Kandidaten geschrieben.
- Abschlussplan: Der frisch erstellte Vorabplan kann nach vollständigem, nur lesendem Strukturvergleich
  übernommen werden. Prüfsummen und beide Eingangsstände binden den Plan; jede Abweichung verlangt den
  vollständigen Abschlussplan. Die Fachbeleg-Einzelvalidierung bleibt unverändert. Ein Feldbündelungsversuch
  ohne belegbaren Vorteil wurde verworfen. Windows-Lesesperren werden auch bei Fortsetzung eines bereits
  abgeschlossenen Kandidaten vor der Verzeichnisübergabe geschlossen.
- Prüfabschluss 23. September: Suchübernahme mit je zwei 10.000-/20.000-Arten-Messpaaren; nachfolgende
  Abschlussplan-Übernahme mit zwei endgültigen 10.000-Arten-Messpaaren fachlich identisch zum Vollaufbau.
  Letzter Vergleich: 11,05–11,09 s gegenüber 16,27–16,50 s Kandidatenbau, nicht Gesamtupdate.
  Vollständiges `quality:ci` erneut erfolgreich, einschließlich 188 Master- und 155 Lightroom-/Pakettests.
  Keine produktive Neuaktivierung; der größere Vergleich des neuen Planwegs war zu diesem Zeitpunkt noch offen.
- Master-Schreibweg am 24. September: ein kandidatenlokaler, auf 64 Einträge begrenzter Befehlsspeicher
  vermeidet erneute SQL-Vorbereitung auch bei neu berechneten Taxa. Keine Werte, Prüfergebnisse oder Abfrageergebnisse
  werden zwischengespeichert; Modell- und Datenbankprüfungen bleiben unverändert. Der Kopierweg liest nur
  tatsächlich benötigte Spalten. Gleiche Eingangsschlüssel benötigen keine erneute UTF-8-Konvertierung;
  unterschiedliche Schlüssel behalten den bisherigen bytegeordneten Vergleich.
- Prüfabschluss 24. September: je zwei 10.000-/20.000-Arten-Messpaare fachlich gleich, Ausgangsmaster unverändert.
  Aktuell 10,93–11,06 s statt 12,40–12,48 s bei 10.000 und 23,10–23,82 s statt 26,63–27,38 s bei 20.000 Arten.
  Hauptgewinn dieses Schritts: schnellerer Vollweg; der Änderungsweg ist bei 10.000 Arten nahezu unverändert.
  `quality:ci` erfolgreich, darunter 194 Master-/Betriebs- und 155 Lightroom-/Pakettests. Kein produktiver Aufbau.
- Leistungsziel weiter offen: Beim Paket benötigen 10.000 synthetische Arten mit zehn Änderungen 1,78–1,87 s statt
  2,17–2,19 s im heutigen Vollpfad. Der frühere Vollpfad ohne Vergleichsgrundlage lag aber bereits bei 1,8 s.
  Das ist noch keine deutliche Verkürzung des Gesamtupdates. Neue Mastermessungen einschließlich langsamer
  Ausreißer stehen in `docs/taxonomy-operational-checks.md`; kein pauschaler Geschwindigkeitsfaktor.
- Lokaler Gesamtvergleich: Auftragssicherung, beide echten Hilfsprozesse, vollständige Prüfungen und gemeinsamer
  Wechsel sind nun zusammen gegen erzwungenen Master-/Paket-Vollaufbau geprüft. Eigene Namenswahl, alte Leser
  und Ausgangsdateien bleiben erhalten. Downloads und produktive Anbieter-/Konfliktauswahl liegen außerhalb.
  Die 10.000-/20.000-Arten-Ausgangsmessungen streuen stark; kein pauschaler Beschleunigungsfaktor.
- Begrenzte Lesegruppen: Unveränderte Altbelege werden für höchstens 128 Taxa gebündelt gelesen. Quellen bleiben
  schreibgeschützt, die bisherigen Einzelprüfungen und aktuellen Herkunftsangaben unverändert. Keine Teilgruppe
  nach Lesefehlern; spätere Checkpoints können direkt wieder einsteigen. Die kleine direkte Gegenprobe zeigt
  8–9 % weniger Kandidatenbauzeit, aber keinen Speichergewinn. Große Laufzeiten bleiben schwankend.
- Prüfabschluss 25. September: je zwei integrierte 10.000-/20.000-Arten-Messpaare fachlich gleich; zuletzt
  20.000 Arten in 43,72 / 34,29 s im Änderungsweg gegenüber 39,97 / 39,69 s im Vollweg. Ein Lauf ist langsamer,
  deshalb kein zuverlässiger Gesamtvorteil belegt. Getrennte 10.000-Arten-Speicherprobe: rund 297 statt 234 MiB
  Spitzen-RSS. Vollständiges `quality:ci` erfolgreich, darunter 205 Master-/Betriebs- und 155 Lightroom-/Pakettests.
  Details einschließlich aller Ausreißer: `docs/taxonomy-operational-checks.md`. Keine produktive Aktivierung.
- Ergänzende Ressourcenprüfung am 25. September: Prozess-Rechenzeit, RAM, Hauptthread-GC und logische
  Windows-Ein-/Ausgabe sind im isolierten Vergleich messbar; synthetischer Mehranbieterbestand ergänzt.
  Ein ausschließlich testlokaler 8-MiB-SQLite-Puffer senkt die logischen Mengen deutlich. Gegen spätere
  Standard-Rückproben: 12,77–12,89 statt 14,99 s bei 10.000 Arten und 14,57–14,63 statt 16,80 s bei 5.000
  Arten/12.500 Quellenbelegen, also beobachtete 13–15 %, keine Verdopplung der Geschwindigkeit zugesagt.
  Auch der Standard wurde im Verlauf schneller; verbleibende Streuung ist nicht erklärt. Keine produktive
  Pufferänderung. Erneutes `quality:ci` erfolgreich: 213 Master-/Betriebs- und 155 Lightroom-/Pakettests.
  Ergebnisse, Messgrenzen und prozessgebundene Windows-Messfreigabe: `docs/taxonomy-performance-profiling.md`.
- Aufbaupuffer am 26. September integriert: expliziter asynchroner Bereich für Masterbau, Paketbau und
  Paarvorbereitung/Rücknahmeprüfung. Maximal acht Hauptdatenbank-Verbindungen je Worker/Laufzeit erhalten
  8 MiB SQLite-Richtwert; weitere behalten ihren Standard. Normale Leser, angefügte Datenbanken und der
  parallele Paketprüfer bleiben unverändert. Keine Prototypänderung und keine dauerhafte Datenbankeinstellung.
  Rückstellung/Freigabe auch nach Fehlern; Pause/Fortsetzung, harter Abbruch und Rollback gezielt geprüft.
  Vertrag und Prüfabschluss: `docs/taxonomy-build-cache.md`.
- Größenvergleich abgeschlossen: je zwei Paare mit 10.000 Arten und 5.000 Arten/12.500 Mehranbieter-Belegen,
  ein Paar mit 20.000 Arten. Ohne Mess-Injektion fachlich gleich; Änderungswege 12,79–13,12 / 14,45–14,55 /
  28,20 s gegenüber verbessertem Vollweg 15,63–16,52 / 16,44–16,45 / 33,39 s. Beobachtete 11–21 % je Bestand,
  kein isolierter Puffereffekt und keine Zusage für den echten Bestand. `docs/taxonomy-build-cache.md`.
- Prüfabschluss 27. September: vollständiges `quality:ci` erfolgreich, darunter 221 Master-/Betriebs- und
  155 Lightroom-/Pakettests; nach der Zwischen-Rücksetzung erneut vollständig erfolgreich. 21 gezielte
  Sound-/Assistenten-/Pipeline-Tests bestanden. Dokumentation nachgeführt.
- Lesende Großbestandsvorprüfung am 27. September: aktive CoL-/Master-/Paket-Herkunft und Vorgängerpaar konsistent;
  vier Datenbanken mit quick_check/Foreign-Key-Prüfung ohne Befund und unveränderten Vorher-/Nachher-Hashes.
  Master-/Export-Eingangsgrundlagen fehlen im aktiven Altstand; erster neuer Lauf deshalb vollständig.
  Noch kein gemeinsamer Veröffentlichungszeiger und kein gespeicherter Masterauftrag. Kein produktiver Aufbau,
  keine Bereinigung. Einzelheiten/Grenzen: `docs/audits/2026-09-27-taxonomy-preflight.md`.
- Lokaler Grundlagen-Startweg am 28. September implementiert: Unter Datenbank-Aktionen → Taxonomiedatenbank
  erscheint bei fehlenden Altformat-Grundlagen `Vergleichsgrundlage einmalig erstellen …`. Ausdrückliche,
  an den angezeigten Stand gebundene Bestätigung; erneute Prüfung unter Prozesssperre. Nur vorhandene lokale
  Quellen, keine Anbieterdownloads. Vorhandene Aufträge/Kandidaten haben Vorrang; kein automatischer Start beim
  Öffnen. Der Anzeigencheck liest nur vorhandene Statusmanifeste, er ersetzt keine vollständige Aufbauprüfung.
  Service-, Routing-, UI- und echte Hilfsprozesstests sichern den Weg einschließlich gemeinsamer Paarfreigabe ab.
  Vertrag: `docs/taxonomy-master-background-build.md`. Felix hat Anklicken und Abbrechen der Rückfrage praktisch
  bestätigt. Der erste produktive lokale Grundlagenlauf wurde anschließend von Felix gestartet (siehe unten).
- Startvorbereitung am 28. September: Manifestvergleich bestätigt weiterhin passende CoL-/Master-/Paketkennungen,
  fehlende Eingangsgrundlagen und keinen gespeicherten Auftrag/Staging-Kandidaten. Rund 139,1 GiB frei auf C:.
  Der lokale Explorer-Dienst auf Port 4177 war nicht erreichbar; keine aktuelle API-Freigabe ableitbar. Kein
  Aufbau gestartet, keine erneute vollständige Integritätsprüfung. Explorer öffnen und reguläre Rückfrage nutzen.
- Erster produktiver Grundlagenlauf: Felix hat ihn am 28. September um 08:36:59 MESZ über die Rückfrage gestartet.
  Erste API-Prüfung: `building`, Phase `Eingangsstand sichern`, 45 %, keine gemeldeten Fehler; aktiver Master
  und Lightroom-Paket weiterhin das bisherige passende Paar. Noch kein fortsetzbarer Workerauftrag/Checkpoint
  verfügbar. Die Prozentzahl beschreibt die Phase, nicht einen gemessenen Zeitanteil. In dieser Vorbereitung
  weder Pause/Fortsetzung noch Abschluss abgenommen; noch kein Wechsel nachgewiesen.
- Produktiver Grundlagenlauf am 28. September um 10:07:59 MESZ abgeschlossen, rund 1 h 31 min insgesamt.
  Master und Lightroom-Paket gemeinsam aktiviert, Vorgänger erhalten, fünf Namenskorrekturen laut Status
  übernommen; keine Fehler/Warnungen oder blockierenden Konflikte gemeldet. Eingangs-/Exportgrundlage vorhanden.
  Nachweis/Grenzen: `docs/audits/2026-09-28-taxonomy-baseline-run.md`. Neue Taxonzahl um 106 geringer, lokale
  Anbieterstände vom 27. statt 3. September; damals genaue Identitäts-/Quelldifferenz noch ungeklärt.
- Lesender Differenzcheck am 29. September abgeschlossen: 154 alte IDs fehlen, 48 neue, netto minus 106.
  150 Arten werden trotz vorhandener Anbieter- und CoL-Belege ausgeschlossen, weil Teil-Suchtreffer im
  Anbieter-Snapshot die vorherigen Aufnahme-Merkmale ersetzen. Vier gleiche iNaturalist-IDs erhalten nach
  Leerung des Reichs neue Master-IDs. Echter Auswahlfilter und isolierte Drei-Zeilen-Gegenprobe reproduzieren
  beide Fehler. Kein bestätigter Split/Merge. Die weiteren 44 Einträge umfassen 43 neue Namen und einen
  getrennten Plantae-Beleg zu `Chloris chloris`; nicht mit dem erhaltenen Grünfink zusammenführen.
  Alle 60 Projektarten verknüpft, 56 Altverknüpfungen unverändert; fünf eigene Namen in Master und Paket korrekt.
  Beide Suchpakete entsprechen ihrem Master vollständig, kein separater Exportverlust. Lightroom-Fotobestand
  nicht abgefragt. Nachweis einschließlich aller IDs: `docs/audits/2026-09-29-taxonomy-difference.md`.
  Damals noch kein Codefix; weiterhin keine produktive Wiederherstellung, kein neuer Aufbau/Rollback/Bereinigung. Vorgänger und
  Anbieterstände erhalten; weiterer produktiver Aufbau/katalogweiter FN-Abgleich zur Reparatur erst nach Fix
  und kontrollierter Vorschau. Erfolgreicher technischer Wechsel ist keine fachliche Bestandsfreigabe.
- Fortschrittsanzeige am 28. September implementiert: gemeinsame Darstellung für Dialog und obere Schaltfläche,
  sieben logische Schritte für den Aufbau inklusive lokalem Quellenlesen; kürzere Wege für Namenswahl,
  Paketreparatur und Rücknahme. Prozent nur aus aktuellen Messmengen als ausdrücklich bezeichneter Teilfortschritt,
  sonst laufende Phase. Alte feste Prozentmarken werden nicht mehr angezeigt. Checkpoints und bisherige
  Bestandszahlen getrennt; Abschluss erst bei bestätigter erfolgreicher Aktion und passendem Paketstand.
  74 gezielte UI-/Service-/Vertragstests und 17 HTTP-/Hilfsprozesstests bestanden. Kein zusätzlicher produktiver
  Lauf und kein Neustart der geöffneten Anwendung. Praktische Anzeigeabnahme offen.
- Schutzkorrektur und lesende Vorschau am 30. September: Teil-Suchtreffer derselben belegten Anbieter-ID
  erhalten Aufnahmegrundlage und fehlende Identitäts-/Quellenfelder; widersprüchliche Identität wird abgewiesen.
  Fehlende Alt-IDs bleiben am Kandidaten prüfbar, sperren aber Einzel- und Paaraktivierung vor Veröffentlichung.
  Bestätigte Identitätsereignisse/Rücknahme bleiben möglich. 66 direkte und 68 weiterführende Tests bestanden.
  Alle 154 betroffenen Quellzeilen in der lesenden Vorschau wieder aufgenommen, ursprüngliche IDs reproduziert.
  Vollhashes beider Master, beider Pakete und beider Quellen sowie Zeiger unverändert. Vier schon aktive
  Ersatz-IDs benötigten zu diesem Prüfzeitpunkt noch eine gesonderte, nachvollziehbare Behandlung.
  Vertrag, Grenzen und nächste Schritte: `docs/taxonomy-partial-source-recovery.md`.
- Bestätigter Reparaturweg am 30. September implementiert: lesende, prüfsummengebundene Vorschau, separater
  Quellenentwurf und gespeicherter Masterauftrag mit Fortsetzung. Vier technische `source-repair`-Ereignisse
  erhalten die Ersatz-IDs historisch und stellen die ursprünglichen IDs aktiv wieder her; kein fachlicher
  Split/Merge und keine automatische Foto-/Projektmigration. Neuer unveränderlicher Quellenstand und
  Historienvormerkung werden erst nach Kandidatenprüfung übernommen; unterbrochene Übernahme ist wiederholbar.
  Gemeinsame Paaraktivierung bleibt separat bestätigt. 19 neue Reparaturtests sowie ein neuer Anzeigetest;
  insgesamt 161 gezielte Tests erfolgreich,
  einschließlich echtem Hilfsprozess, lokalem CoL-Eingangsleser und regulärer Kandidaten-Freigabeprüfung.
  Die Explorer-Historie bezeichnet den technischen Reparaturtyp verständlich, ohne neue manuelle Fallauswahl.
  Abschließende große lesende Vorschau bestätigt 154 Fälle, davon 150 Aufnahmeverluste und vier Ersatz-IDs,
  ohne Blocker; gebundene Dateien und Zeiger unverändert. Kein produktiver Entwurf, Auftrag oder Quellenwechsel.
- Produktiver Reparaturkandidat am 30. September durch Felix freigegeben. Bestätigter Wartungsaufruf gegen
  Revision `a6bdf57a5b2fcc6820dc661cb344afdd154f1f82b3aeb2d1f7e79bf2f05c003e` gestartet;
  erste Prüfung bestätigt nur laufende Eingangsprüfung, noch keinen neuen Entwurf/Workerauftrag oder Wechsel.
  Explorer-Dienst beim Start geschlossen, rund 118,48 GiB frei. Vier Historienentscheidungen ausdrücklich
  gebunden; aktive Paaraktivierung ist durch diese Freigabe nicht erlaubt. Keine parallele Eingangsänderung.
  Stand 19:46 MESZ: separater Entwurf `prepared`, 154 ergänzte von 273.517 Quellenzeilen; noch kein neuer
  Workerauftrag. Vor Auftragsstart erneute Eingangsprüfung. Veröffentlichungszeiger weiterhin vom 28. September.
  Stille 30-Minuten-Wiedervorlage `taxonomie-reparaturkandidaten-pr-fen` zur Begleitung bis Prüfung/Handlungsbedarf eingerichtet.
  Stand 19:58 MESZ: neuer Auftrag `job-bfb06bf7-94b3-4c69-be2c-42af970a1f3a`, Reparaturjournal `building`;
  Hilfsprozess seit 19:54:08 MESZ, Phase Masterdatenbank schreiben. 110.000 von 275.635 Taxa gesichert,
  etwa 39,9 % dieses Schreibteils, kein Gesamtprozent. Geplante Menge liegt über dem bisherigen Master;
  zusätzliche Bestandsdifferenz nach Abschluss ausdrücklich prüfen. Zu diesem Zeitpunkt noch kein fertiger Kandidat oder Quellenwechsel.
- Reparaturkandidat am 30. September abgeschlossen: Wartungsaufruf mit Exit 0, Auftrag und Reparaturjournal
  `ready`, Kandidat `master-20260930174712224`. Worker von 19:54:08 bis 20:12:30 MESZ; danach frische
  Abschlussprüfung sowie neuer Quellenstand `recovery-a6bdf57a5b2fcc6820dc661c` und vier Historienvormerkungen.
  Lesende Prüfung um 20:26 MESZ bestätigt alle 154 ursprünglichen IDs aktiv, vier Ersatz-IDs historisch,
  sämtliche IDs beider bisherigen Master erhalten, alle 60 Projektlinks und 46 eigene ausgewählte Felder
  einschließlich fünf deutscher Namenskorrekturen unverändert. Reguläre Kandidatenprüfung und `quick_check`
  erfolgreich, keine blockierenden Konflikte. Beide alten Master, beide Suchpakete, beide Originalquellen
  und Veröffentlichungszeiger unverändert; kein neues Lightroom-Paket und keine Aktivierung.
  Fachlicher Zusatzbefund: 275.639 IDs, davon 275.635 aktiv und vier historisch; gegenüber dem aktiven Master
  154 Reparatur-IDs plus 2.173 weitere aktive CoL-IDs. Alle weiteren IDs besitzen CoL-Belege, aber jeweils
  denselben wissenschaftlichen Namen wie eine erhaltene bisherige ID mit anderem Reich. Alle alten Gegenstücke
  waren `reference-gap`; neue Gegenstücke ausschließlich CoL-belegt. Ursache im Eingangsweg: umfassende erneute
  lokale Lückenprüfung, nicht ausschließlich die 154 Quellzeilen. Keine bestätigte Identitätsgleichheit,
  kein belegter Split/Merge und keine automatische Zusammenführung. Technische Freigabefähigkeit ist keine
  fachliche Bestandsfreigabe. Kandidat bis Klärung nicht aktivieren. Abschlussbefund und Grenzen:
  `docs/taxonomy-partial-source-recovery.md`. Wiedervorlage nach Abschlussprüfung auf `PAUSED` gesetzt;
  keine weiteren automatischen Prüfungen dieses beendeten Laufs.
- Eingrenzungsprüfung am 30. September nach Felix' „Weiter“ abgeschlossen, ohne produktiven Aufbau oder Codewechsel:
  gleicher lokaler CoL-Stand; der echte normale Eingangsleser liefert für die 2.173 Zusatznamen null CoL-Zeilen,
  der erzwungene Reparaturweg 2.173. Für alle 154 Reparaturnamen liefern beide Wege exakt dieselben 150
  CoL-Zeilen; vier verbleibende Fälle bleiben iNaturalist-belegt. Alle 154 reparierten Anbieterzeilen reproduzieren
  die ursprünglichen IDs und sind aufnahmefähig. Von 1.418 zusätzlich geschlossenen Referenzlücken würde der
  normale Weg noch eine anfassen; ein bloßer Boolean-Wechsel garantiert deshalb keine strikte 154-Fälle-Grenze.
  Explizite CoL-`inat:`-Verweise: 1.693 eindeutig auf die alte iNaturalist-ID, sechs auf eine andere ID,
  zwei mehrdeutig, 472 ohne diesen Verweis. Das ist eine Quellenklassifizierung, keine bestätigte Identitätsmigration.
  Zwei vorhandene Eingangsleser-Regressionstests erfolgreich; fünf Datenbank-Dateigrößen/Schreibzeiten und vier
  Statusdateien unverändert. Keine erneute vollständige Integritäts-/Vollhashprüfung. Detailnachweis im Reparaturvertrag.
- Enge Reparaturkorrektur anschließend durch Felix freigegeben und implementiert: ursprünglicher, prüfsummen-
  und auftragsgebundener CoL-Eingang aus dem aktiven Masteraufbau bleibt unverändert; nur bestätigte Reparaturnamen
  werden zusätzlich lokal gelesen, mit Identitäts-/Anbieter-ID-Prüfung. Kein erneuter Lückensuchlauf über alle Namen.
  Tatsächliche IDs, Status, Quellenbelege/-namen, Aufnahmegründe, Feldwerte, Aliasse, Konflikte, eigene Entscheidungen,
  Projektlinks und Suchbegriffe außerhalb des Plans müssen semantisch unverändert sein. Prüfung vor Worker-Übergabe,
  bei regulärer Kandidatenprüfung und gegen den Originalmaster bei kopierter Paarvorbereitung.
  Neuer Ersatzweg: lesendes `replacement-preview`, ausdrückliches `replacement-candidate` mit ursprünglicher
  Reparaturrevision plus frischer Planrevision und denselben Historienentscheidungen. Verwendet den bereits
  installierten Quellen-/Historienstand, erhält den alten Auftrag unverändert und verschiebt den alten Kandidaten
  erst unter bestätigtem Plan nach `master/source-recovery/retained-candidates/recovery-<Altplanrevision>`.
  Gespeichertes Ersatzjournal sichert Fehler-/Abbruch-/Wiederholungs-/Neustartwege; unbekannte Ziele und geänderte
  Eingänge sperren die Übernahme. Kein Umschreiben alter Auftrags-/Regelprüfsummen. Isolierter Prüfabschluss und
  vollständige Grenzen im Reparaturvertrag. In diesem Implementierungsschritt keine produktiven Daten verändert.
- Lesende Ersatzvorschau am 1. Oktober um 15:08 MESZ erfolgreich, Exit 0, rund 67,42 s: ursprüngliche
  Reparaturrevision, installierte Quelle, vier Historienentscheidungen, Altauftrag und Alt-Kandidat passen zusammen.
  Neue Planrevision `9beccf7fe76602f74b7d75fb938201e8c683e286795e7624b930751e25424516`;
  154 Reparaturfälle und vier historische Ersatz-IDs, 43 Eingangsdateien sowie 17 zusätzliche Auftrags-/
  Kandidaten-Dateibindungen geprüft. Aktives Paar und Vorgänger mit ihren vollständigen Prüfsummen gebunden;
  Status-/Projekt-/Korrekturdateien sowie Größen/Schreibzeiten von fünf Datenbanken vor/nach der Vorschau gleich.
  Originalquellen und installierte Reparaturquelle unverändert; Aufbewahrungsziel frei, kein Ersatzjournal.
  Nur lokales Prüfprotokoll unter ignoriertem `Testlauf/` erstellt. Kein neuer Kandidat, Verschieben oder Paarwechsel.
  Keine erneute fachliche Gesamtprüfung des Alt-Kandidaten oder Zusage der Endmenge eines künftigen Ersatzes.
- Ersatzkandidatenlauf am 1. Oktober anschließend durch Felix mit „ja“ ausdrücklich für diese Planrevision
  bestätigt und gestartet. Neues Ersatzjournal `building`, Auftrag
  `job-65f8c166-6d9e-4e00-b471-35b761e2927f`, Revision
  `0d69de1bf04090c58d30ce7bcc67ff29be30b0e41f0b33b7c922aebf69c883d7`.
  Journalzeit 15:17:26 MESZ; Hilfsprozess PID 30104 seit 15:21:07 MESZ. Stand 15:22:53 MESZ:
  Masterdatenbank schreiben, 22.000 von 273.462 geplanten aktiven Taxa gesichert, noch kein Abschluss.
  Stand 15:30:13 MESZ: alle 273.462 Taxa geschrieben, Suchindex 1.276.000 von 6.186.155 Einträgen;
  weiterhin `building`, kein Fehler gemeldet. Das sind Teilmengen, keine Gesamtprozent oder Endfreigabe.
  Alter Kandidat am exakt bestätigten Aufbewahrungsziel erhalten; alter Auftrag nicht umgeschrieben.
  Historischer Begleitstand der Ausführungssitzung `83773`. Keine vollständigen Vergleichsscans während des Aufbaus.
  Vorbereiteter lesender Abschlussvergleich: `Testlauf/taxonomy-replacement-verify-2026-10-01.mjs`, erst nach
  Exit 0 und Ersatzjournal/Auftrag `ready` ausführen. Neue Dienst-/Regelversion nicht während des Laufs ändern.
  Bestehende stille 30-Minuten-Wiedervorlage `taxonomie-reparaturkandidaten-pr-fen` für genau diesen Ersatzlauf
  aktualisiert und reaktiviert; nach Abschlussprüfung oder nutzerabhängigem Hindernis wieder deaktivieren.
- Ersatzlauf am 1. Oktober um 15:42:02 MESZ mit Exit 1 durch die enge Schutzprüfung gestoppt:
  `Reparaturumfang überschritten: Konflikte außerhalb der bestätigten Fälle verändert.` Auftrag `failed`;
  Ersatzjournal weiterhin in der zuletzt gespeicherten Workflowstufe `building`, kein laufender Worker daraus
  ableitbar. Hilfsprozess lief 20 min 54,6 s; keine fertige Staging-Übergabe und kein neues Lightroom-Paket.
  Private Datenbank im neuen Auftragsordner erhalten, alter Kandidat am bestätigten Aufbewahrungsziel erhalten.
  Lesende Fehlerprüfung um 15:46 MESZ: genau 26 zusätzliche offene `reference-gap`-Hinweise außerhalb des Plans,
  keine entfernten fremden Konflikte. Alle 154 ursprünglichen IDs aktiv, vier Ersatz-IDs historisch; keine fehlende
  ID beider Altmaster und keine zusätzliche fremde ID. Ergebnis 273.466 IDs, davon 273.462 aktiv und vier historisch.
  Alle 60 Projektlinks und 46 ausgewählten eigenen Felder einschließlich fünf deutscher Namen unverändert.
  58 gebundene Original-/Eingangs-/Aufbewahrungsdateien mit vollständigen Hashes sowie Veröffentlichungszeiger
  unverändert. Keine fachliche Freigabe: unabhängiger vollständiger Abschlussvergleich wegen `failed` nicht ausgeführt.
  Begrenzte Gegenprüfung aller 26 Einträge: im aktiven Master bereits `reference-gap`, dort ohne Konfliktzeile;
  im Vorgänger vom 5. September nicht vorhanden, ohne Projektlinks/eigene Felder. Quellenbelege und Referenzzustand
  im privaten Ergebnis gleich. Die allgemeine Aufbauregel erzeugt wegen des nun vorhandenen Vorgängers neue
  Hinweise, obwohl die enge Reparatur diese Einträge nicht ändern darf. Schutzprüfung nicht abschwächen.
  Wiedervorlage `taxonomie-reparaturkandidaten-pr-fen` nach gemeldetem Hindernis wieder `PAUSED`.
- Konflikterhalt nach Felix' gesondertem „Ja“ am 1. Oktober implementiert und isoliert geprüft:
  ausschließlich im engen `sourceRecoveryScope`-Weg werden Konflikte und zugehörige eigene Entscheidungen
  unbeteiligter IDs aus dem aktiven Master übernommen, einschließlich fehlender Hinweise, Zustände, Texte und Zeiten.
  Nur private Kandidatendaten ändern sich. Interne Feldverweise werden an dieselbe ID und exakt gleiche Feld-/
  Quellenmerkmale gebunden, fehlende/mehrdeutige Belege sperren die Übernahme. Eigener Savepoint rollt Fehler/Pause
  zurück; bestätigte Reparatur-/Historien-IDs bleiben ausgeschlossen. Allgemeine Update-Regel und semantische
  Umfangssperre unverändert. Neues Modul `taxonomy-source-recovery-conflicts.mjs` an Vorschau-/Masterregeln gebunden.
  Regression reproduzierte zuerst denselben Schutzabbruch und besteht nach der Korrektur. 160 gezielte Tests in
  acht Dateien bestanden, darunter 40 Reparaturtests mit sieben Unterfällen, echte Hilfsprozesse sowie Kandidaten-/
  Paket-/Paarprüfungen ausschließlich mit temporären Daten. Einzelner Windows-`ENOTEMPTY`-Aufräumfehler im ersten
  Gegenlauf; betroffener Test einzeln und anschließend kompletter erweiterter Gegenlauf erfolgreich, keine
  Fachregel oder fremder Test zur Umgehung geändert. Kein produktiver Vergleich/Aufbau oder Auftragswechsel.
- Kontrollierter Neustart am 1. Oktober durch Felix mit „Los mach solange weiter bis die Reparatur abgeschlossen
  ist“ freigegeben: neue lesende `restart-preview` und bestätigte `restart-candidate` binden ursprüngliche Revision,
  fehlgeschlagenen Plan und frische Planrevision. Altes Ersatzjournal, vollständiger Fehlerauftrag/private Datenbank
  und aufbewahrter erster Kandidat bleiben unverändert. Separates Neustartjournal unter `source-recovery/restarts`;
  kein Umschreiben alter Regeln oder Prüfsummen. Nur lokale Code-/Regeländerungen sind gegenüber dem Fehlerplan
  zulässig; geänderte produktive Daten, fremde Aufträge, vorhandene Kandidaten oder laufende Prozesse sperren.
  164 gezielte Tests in acht Dateien erfolgreich, einschließlich Neustart mit echten Hilfsprozessen.
  Frische lesende Produktivvorschau um 16:53 MESZ erfolgreich: genau 154 Fälle/vier Historien-IDs, Datenbindungen
  unverändert. Plan `ebd6f0815afcb8bc86bd5077ce1f7002134fb2ba025256082ff4dc8c4b0d4df0`.
  Bestätigter Neustartaufruf anschließend gestartet, Ausführungssitzung 69913; zunächst erneute Eingangsprüfung.
  Historischer Stand 17:10 MESZ: neuer Auftrag `job-1c0243c8-e1d7-477d-8e5e-b775549bb0af`, Revision
  `338ce21c8a4c0e0a9a144f1a27a9e64dc50aafe302e7ac35c7c4ad4433f48ab0`, Worker PID 3432 seit
  16:59:17 MESZ. Alle 273.462 geplanten Taxa geschrieben, Suchindex 3.434.000/6.186.155; kein gemeldeter Fehler.
  Zu diesem Zeitpunkt noch keine vollständige Kandidatenprüfung; stille 30-Minuten-Wiedervorlage reaktiviert.
- Reparaturkandidat am 1. Oktober vollständig geprüft abgeschlossen: Wartungsaufruf Exit 0, neuer Auftrag und
  Neustartjournal `ready`, Kandidat `master-20261001145513036`. Worker fertig um 17:21:21 MESZ, anschließende
  frische Serviceprüfung und unabhängiger Gesamtvergleich erfolgreich. 273.466 IDs, davon 273.462 aktiv und vier
  historisch. Alle 154 ursprünglichen IDs aktiv, vier Ersatz-IDs historisch, sämtliche IDs beider Altmaster erhalten;
  keinerlei fremde Zusatz-ID. Alle elf semantischen Umfangsprojektionen außerhalb des Plans unverändert,
  einschließlich Konflikten/eigenen Entscheidungen/Suchbegriffen. 60 Projektlinks und 46 eigene ausgewählte
  Felder einschließlich fünf deutscher Namen unverändert. Referenzhinweise 118.338 → 118.334, vier Entfälle
  ausschließlich im bestätigten Umfang; keine neuen fremden Hinweise, null blockierende Konflikte.
  Reguläre vollständige Kandidatenprüfung, `quick_check=ok`, null Fremdschlüsselverletzungen. Abschließende
  Vollhashprüfung um 17:46:52 MESZ: 70 geschützte Dateien, Kandidat und Veröffentlichungszeiger unverändert;
  alte Journale/Aufträge/private Fehlerdatenbank und aufbewahrter erster Kandidat erhalten. Belege unter
  `Testlauf/taxonomy-restart-verify-2026-10-01-result.json` und `Testlauf/taxonomy-restart-postcheck-2026-10-01-result.json`.
  Wiedervorlage nach vollständigem Prüfabschluss `PAUSED`. Dokumentation nachgeführt, kein vollständiges
  `quality:ci` oder Phasenaudit. Keine Aktivierung, Migration, Bereinigung, Anbieterdownloads, Commit oder Push.
- Gemeinsame Master-/Lightroom-Paaraktivierung am 1. Oktober anschließend durch Felix mit „ja los“ gesondert
  bestätigt. Wartungsaufruf um 17:57:36 MESZ gestartet; Hilfsprozess PID 13300 bereitete das Paar aus dem bereits
  vollständig geprüften Kandidaten vor. Bestehende Prozesssperren, frische Eingangsprüfung, vollständige
  Paketprüfung und ein gemeinsamer Veröffentlichungszeiger bleiben verbindlich. Wartungsabschluss um 18:11:42 MESZ,
  Exit 0: Paar `publication-60f9b546-49ee-4c65-ada9-7b57b965b120` aktiv, Master `master-20261001145513036`,
  Suchpaket `lightroom-63c431a5fa43190a4c52` mit 273.462 Taxa. Paketbau inkrementell: 154 Taxa neu projiziert,
  vier historische Ersatz-IDs nicht mehr im aktiven Suchbestand; deren Historie bleibt enthalten. Herkunftszeiten
  auch der unveränderten Taxa gesondert erneuert, keine pauschale Laufzeitersparnis ableiten. Kein zusätzlicher
  Master-Vollaufbau oder Foto-/Projektmigration. Vorheriges Paar vom 28. September als Rückweg erhalten.
  Unabhängige lesende Paar-/Originaldateiprüfung um 20:34:39 MESZ mit Exit 0 vollständig abgeschlossen:
  aktiver Master byteidentisch zum geprüften Kandidaten; vollständige Paketintegritäts-/Prüfsummenprüfung und
  Gesamtvergleiche aller aktiven Taxa, bevorzugten Namen, Suchbegriffe, Quellenbelege, Status, Projektlinks,
  ausgewählten Hierarchiefelder und Identitätshistorie erfolgreich. Alle 154 IDs in beiden normalen lesenden
  Verbrauchern aktiv, vier Ersatz-IDs historisch mit ausdrücklicher Rückfrage statt automatischer Fotoänderung.
  Alle 60 Projektlinks und 46 eigenen ausgewählten Felder/fünf deutschen Namen erhalten. 69 geschützte Dateien,
  privater Kandidat und Vorgänger unverändert; nur der bestätigte gemeinsame Zeigerwechsel. Reparatur damit
  produktiv abgeschlossen. Beleg: `Testlauf/taxonomy-repair-pair-verify-2026-10-01-result.json`.
  Lokaler Zusatzprüfer korrigiert, keine weiteren Produktionscodeänderungen oder neuer Masterlauf. Die ersten
  Prüferversuche sind keine vollständigen Abschlussbelege; interner ID-/Objektvergleich und ungünstiger
  Suchindex ausschließlich dort berichtigt. Dokumentations-/Projektstatusprüfung erfolgreich; kein vollständiges
  `quality:ci`, Phasenaudit, GUI-Abnahmetest, Katalogabgleich, Bereinigung, Commit oder Push.
  Die 2.173 Quellenfälle separat für reguläre Updates vor dem Audit behandeln, nicht nebenbei migrieren.
  Vor späterer Explorer-Bedienung die neue Dienstversion laden. Keine Altreleases überschreiben oder ID-Sperre umgehen.
  Keine ungeprüfte Namen-/Reichsheuristik und keine zusätzlichen Historienereignisse aus gleichem Namen ableiten.
  Quellenstand und vier technische Historienfälle sind vorbereitet. Die aktuelle Freigabe gilt ausschließlich
  für den eng geprüften Kandidaten; keine zusätzlichen Quellenfälle oder automatische ID-Migration ableiten.
  Kein weiterer langer Produktivlauf zur Diagnose.
  Gezielte praktische Verbraucherabnahme am 1. Oktober anschließend vollständig von Felix bestätigt:
  Weissstorch/Rebhuhn im Explorer mit bevorzugten Namen, erfolgreiche Lightroom-Zuweisung mit passenden
  Metadaten/Stichwörtern und Erhalt nach normalem Schließen/Wiederöffnen. Rückmeldung „1 passt / 2 passt / 3 passt“;
  nutzerbestätigte Stichprobe, keine GUI-Automation oder Abnahme aller 154 Fälle. Reparaturpunkt damit technisch
  und gezielt praktisch abgeschlossen. `COL26.9 XR` ist ein separates Quellenupdate, kein reparaturbedingter
  Drift; regulären Updateweg und die 2.173 CoL-/Reichsfälle vor Freigabe gesondert prüfen. Kein neuer Lauf gestartet.
  Die übrige Anzeige-/Betriebs-/Großbestandsabnahme bleibt offen. Produktive Pause/Fortsetzung und Rücknahme nicht durch den Erfolgsdurchlauf
  abgenommen. Sound-Rücksetzung einschließlich Zwischenweg praktisch abgenommen.
  Den Gesamtgewinn getrennt von kleinen Einzeloptimierungen bewerten; Prüfungen nicht für bessere Zeiten entfernen.
  Die übrige Laufzeitstreuung bleibt offen; der einzelne 20.000er-Vergleich belegt keine Wiederholbarkeit.
  Kein weiterer produktiver Neuaufbau für die Anzeigeänderung. Phase 10 bleibt offen.
- Maßgeblicher Restplan: `docs/roadmap.md`; Verträge: `docs/taxonomy-master-background-build.md`,
  `docs/taxonomy-incremental-build.md`, `docs/taxonomy-name-preference-plan.md`. Datierte ältere Abschnitte
  weiter unten sind Verlauf, keine erneute Freigabe des aktuellen Stands. Aktuelle Zähler nur in `docs/project-status.md`.

## Arbeitsregel: Dokumentation ist Pflicht

Kein Schritt der Roadmap gilt als abgeschlossen, solange die dazugehoerige Dokumentation nicht aktuell ist.

Bei jedem technischen Schritt pruefen und bei Bedarf aktualisieren:

- `AGENTS.md` fuer den aktuellen Uebergabe- und Arbeitsstand
- `README.md` fuer Projektueberblick, Bedienung und Betriebsablauf
- `docs/roadmap.md` fuer Status, naechste Schritte und Priorisierung
- passende Detaildokumente unter `docs/`, z. B. CSS-, Sound-, Repo-, Desktop-App- oder Squarespace-Doku

Die Zuständigkeiten, historischen Kennzeichnungen und die einzige Quelle für aktuelle Zähler sind verbindlich in
`docs/documentation-lifecycle.md` festgelegt.

Jede große Phase endet verbindlich mit einem umfassenden Audit. Dieses prüft mindestens Code und Modularisierung,
Daten und Schemata, Datei-/Ordnerstruktur einschließlich temporärer Dateien, Dokumentation und Widersprüche,
direkte sowie übergreifende Tests, das vollständige Qualitätsgate und die relevanten Betriebs-, Backup-, Restore-
und Veröffentlichungsabläufe. Gefundene Befunde werden vor dem Phasenabschluss bereinigt oder begründet einer
späteren Phase zugeordnet.

Wenn eine JS-Datei geaendert wird, muss auch `docs/squarespace-footer.html` bzw. die Squarespace-`?v=`-Version
geprueft werden. Wenn CSS geaendert wird, muss `docs/squarespace-custom.css` mit dem echten Squarespace-Stand
abgeglichen werden.

Bei jeder Änderung an einer Datei unter `lightroom-plugin/FNWildlifeTaxonomy.lrplugin/` muss die Plug-in-Version in
`Info.lua` erhöht und dieselbe Version im Zusatzmodul-Manager über `PluginInfoProvider.lua` angezeigt werden. Die
zugehörige aktuelle Dokumentation und der Lightroom-Vertragstest müssen im selben Commit angepasst werden. Dadurch
ist nach dem Neuladen im Zusatzmodul-Manager eindeutig erkennbar, ob Lightroom den neuen Stand verwendet.

## Kurzueberblick

Squarespace ist das sichtbare Frontend/CMS. Die Artseiten enthalten nur Container-IDs. Die dynamischen Inhalte werden
ueber JavaScript-Module von GitHub Pages geladen.

Zentrale Dateien:

- `species_list.json`: manuelle Artenliste und Input fuer die Pipeline, inklusive Groesse, Gewicht und
  Lebenserwartung
- `update.mjs`: Orchestrierung der Datenpipeline; externe Anbieter liegen in direkt getesteten Adaptern unter
  `scripts/*-adapter.mjs`
- `speciesData.json`: generierte Datenbank fuer die Frontend-Module
- `species-assets-overrides.json`: maschinenlesbarer Schutzstatus fuer manuell gepflegte Karten und Sounds
- `species-assets/<Artname>/map.jpg`: primaere Verbreitungskarte pro Art
- `species-assets/<Artname>/sound.mp3` und `species-assets/<Artname>/credits.json`: primaere Tierstimme und Quellen
- `species-assets/<Artname>/spectrogram.webp`: Spektrogramm fuer die Tierstimmen-Soundbar
- `fehlende_elemente_report.json`: Qualitaetsreport fuer fehlende Assets/Daten und NC-Soundlizenzen

Frontend-Module:

- `species-core.js`: gemeinsamer Datenloader, Slug-Ermittlung, Cache und Assetnamen-Sanitizer
- `species-info.js`: Info-Box mit getrennten Zeilen fuer deutschen, englischen und lateinischen Namen sowie
  manuelle und IUCN-Artdaten
- `species-taxonomy.js`: Taxonomie-Pyramide
- `species-status.js`: IUCN-Status und Populationstrend
- `species-portrait.js`: optionales Artportraet und responsiver Layout-Fallback
- `species-sound.js`: native Soundbar mit vorbereitetem Spektrogramm, Canvas-Fallback, Lautstaerke,
  Abspielgeschwindigkeit, Credits und Lizenzhinweisen
- `map-loader.js`: Verbreitungskarte
- `search.js`: Suche auf Uebersichtsseiten
- `sort.js`: Sortierung sichtbarer Listen
- `lightbox-zoom.js`: Galerie-/Lightbox-Zoom

Lokale Arbeitsoberflaeche:

- `species-explorer/server.mjs`: schlanke Kompositionswurzel des lokalen Servers auf `127.0.0.1:4177`
- `species-explorer/public/`: Artenliste, Suche, Filter und Detailansicht
- `species-explorer/request-security.mjs`: zentrale Sitzungs-, Browser-, URL-Ziel- und Pfadgrenze der lokalen API
- `species-explorer/http-routing.mjs`: JSON-/HTTP-Antworten, sichere Auslieferung lokaler Dateien und Byte-Ranges
- `species-explorer/request-router.mjs`: zentrale Methoden-/Pfadzuordnung, Body-Limits und Antwortdelegation
- `species-explorer/species-model.mjs`: Artenvalidierung, Normalisierung, Kollisionen, Diffs und öffentliche Projektionen
- `species-explorer/species-create.mjs`, `species-delete.mjs`, `species-edit.mjs`: Anlegen, Löschen und Bearbeiten
  von Arten als getrennte Fachoperationen
- `species-explorer/map-asset-workflow.mjs`, `sound-asset-workflow.mjs`, `portrait-asset-workflow.mjs` und
  `asset-maintenance.mjs`: Vorschau, Übernahme, Ablehnung, Löschung und Wiederherstellung einzelner Assets
- `species-explorer/pipeline-controller.mjs`: Pipeline-Planung, Prozesszustand, Assetprüfung und Veröffentlichung
- `species-explorer/project-publication.mjs` und `backup-service.mjs`: Git-Übertragung, offene Änderungen,
  Backup-Einstellungen und NAS-Sicherung
- `species-explorer/asset-backups.mjs`: wiederherstellbare Asset-Sicherungen und begrenzte Backup-/Log-Aufbewahrung
- `species-explorer/server.test.mjs`, `server-species-workflows.test.mjs`, `server-assets.test.mjs` und
  `server-cleanup-search.test.mjs`: fachlich getrennte API-Integrationstests
- `species-explorer/explorer-ui-contract.test.mjs`: Oberflächen-, Modulbesitz- und Auslieferungsverträge
- `species-explorer/taxonomy-storage.mjs`, `taxonomy-fixture.mjs`, `taxonomy-schema.mjs`,
  `taxonomy-import.mjs`, `taxonomy-store.mjs` und `taxonomy-search-text.mjs`: gekapselter Phase-9-Referenzkern für
  lokalen SQLite-Speicher, begrenzten Import und read-only Suche
- `species-explorer/taxonomy-reference-service.mjs` und `public/app-taxonomy-reference.js`: lokale read-only
  Taxonomie-API sowie Vorschläge für deutsche, englische und wissenschaftliche Namen, lokale Reichsauswahl und
  direkte kontrollierte Übernahme im Neue-Art-Assistenten
- `species-explorer/taxonomy-display-names.mjs`, `taxonomy-supplement-providers.mjs` und
  `taxonomy-supplement-service.mjs`: zentrale deutsche Taxonomieanzeigen, offizielle GBIF-, WoRMS- und
  Wikidata-Adapter sowie lokaler letzter-funktionierender Ergänzungscache
- `species-explorer/taxonomy-inaturalist-client.mjs`, `taxonomy-inaturalist-snapshot.mjs`,
  `taxonomy-provider-refresh-service.mjs`, `taxonomy-animalia-fallback.mjs`, `taxonomy-csv.mjs` und
  `taxonomy-taxon-quality.mjs`: breiter versionierter iNaturalist-Namens-/Artlückenausschnitt, koordinierte
  Anbieteraktualisierung, kontrollierte Animalia-Fälle sowie gemeinsame Import- und Qualitätsgrenzen
- `taxonomy-reference-corrections.json`: versionierte eigene deutsche beziehungsweise englische Namenskorrekturen
  für eindeutig vorhandene CoL-Arten; die CoL-Primärreferenz selbst bleibt unverändert
- `species-explorer/taxonomy-release-client.mjs`, `taxonomy-archive.mjs`, `taxonomy-package.mjs`,
  `taxonomy-full-import.mjs` und `taxonomy-maintenance-service.mjs`: Releaseprüfung, begrenzter Download, sichere
  Extraktion, streamender Vollimport, Projektartenabgleich, Aktivierung und Rollback
- `species-explorer/taxonomy-project-conflicts.mjs`, `public/app-taxonomy-maintenance.js` und
  `species-reference-mappings.json`: sichtbare Konflikthinweise ohne stille Projektänderung sowie stabile,
  ausdrücklich bestätigte CoL-Zuordnungen
- `species-explorer/taxonomy-master-storage.mjs`, `taxonomy-master-schema.mjs`, `taxonomy-master-model.mjs`,
  `taxonomy-master-store.mjs`, `taxonomy-master-rules.mjs`, `taxonomy-master-slices.mjs`,
  `taxonomy-master-candidate.mjs`, `taxonomy-master-diff.mjs`, `taxonomy-master-lifecycle.mjs` und
  `taxonomy-master-service.mjs`: getrennte,
  produktiv aktivierte Phase-9-Masterdatenbank mit stabilen IDs, versionierten Anbieterständen, Feldprovenienz,
  Konflikten, Projektverknüpfungen, atomarer Aktivierung und Rollback; die aktive CoL-Vollreferenz bleibt
  unverändert und read-only
- `species-explorer/taxonomy-correction-release.mjs`: kleine unveränderliche Namenskorrektur-Releases mit erneuter
  Identitätsprüfung gegen aktiven Master und aktives Lightroom-Paket sowie gemeinsamem atomarem Aktivierungszeiger
- `scripts/taxonomy-master-migrate.mjs`: kontrollierte reale Migration der CoL-Referenz, Anbieter-Ausschnitte,
  Ergänzungen und Projektarten in einen verifizierten Master-Kandidaten mit optionaler Aktivierung und
  Rollbacktest
- `scripts/taxonomy-prototype.mjs`, `taxonomy-prototype-fetch.mjs` und
  `scripts/fixtures/taxonomy/`: reproduzierbarer Phase-9.3-Prototyp und kleine versionierte Testfixture
- `scripts/backfill-english-species-names.mjs`: kontrollierte, standardmäßig schreibgeschützte Ergänzung
  englischer Artnamen aus exakten iNaturalist-Taxa und der lokalen CoL-Referenz
- `scripts/pipeline-selection.mjs`: Zielartenauswahl fuer vollstaendige und gezielte Pipeline-Laeufe
- `scripts/species-cleanup.mjs`: Vorschau und dauerhafte Bereinigung verwaister Daten und Assetordner
- `scripts/pipeline-error-log.mjs`: fehlertoleranter, auf 256 KiB begrenzter Pipeline-Fehlerlog im lokalen
  Explorer-Logordner

## Aktueller Projektstand

Regressionskorrektur vom 20. September: Neue-Art-Entwurf und zugehöriges Portrait laufen während der Sitzung
nicht mehr zeitlich ab; Quellen-/Kollisionsschutz bleibt aktiv. Der Karten-Schritt bietet lokalen JPEG-/PNG-Import
und Dateiablage, Fehler im Abschluss bleiben sichtbar und geben das Fenster wieder frei. Bereits angelegte Arten
nicht erneut anlegen oder löschen. `Manuell geschützte Karten` zählt gespeicherte Schutzentscheidungen, nicht
blockierte Downloads. Ältere aktive Namenskorrekturen werden nur bei exakt passendem Altprüfwert und bestätigter
Identität in beiden lokalen Datenbanken akzeptiert. Details: `docs/add-species-workflow.md` und
`docs/taxonomy-name-preference-plan.md`. Automatischer IUCN-Abruf und Trennung von Herkunft/Schutz bleiben vor dem
Audit offen; keine bestehenden Schutzmarkierungen pauschal ändern.

Aktuelle Zähler sowie die aktiven Listen für manuelle Karten, NC-Sounds und bewusst fehlende Tierstimmen stehen
ausschließlich in der automatisch erzeugten Datei `docs/project-status.md`. Sie wird mit `npm run status:sync`
aktualisiert; `npm run status:check` und der CI-Quality-Job verhindern eine Veröffentlichung mit veraltetem Status.
Zahlen in datierten Audit- oder Verlaufsabschnitten sind historische Zeitaufnahmen.
Vor automatischen Pipeline-, Karten-, Sound- und Portrait-Veröffentlichungen synchronisiert der Explorer diese
Datei selbst und nimmt sie in denselben Commit auf. Bei manuellen Repo-Änderungen bleibt `status:sync` Pflicht.

Der Sound-Suchlauf prueft vorhandene NC-Sounds bei jedem Update erneut auf freie Alternativen:

1. freie Xeno-Canto-Aufnahmen
2. freie Wikimedia-Commons-Audiodateien mit erreichbarem MP3-Transcode
3. freie iNaturalist-MP3-Aufnahmen mit exaktem Taxon, freier Lizenz und gueltiger MP3-Datei

Im Asset-Pruefdialog abgelehnte Soundquellen werden in `species-assets-overrides.json` unter
`sound.rejectedSources` gespeichert. `update.mjs` ueberspringt diese Xeno-Canto-, Wikimedia-Commons- oder
iNaturalist-Quelle bei spaeteren Suchlaeufen, damit ein ausdruecklich abgelehnter Sound nicht erneut vorgeschlagen
wird.
Sind alle unterstützten und lizenzgeprüften Kandidaten ausgeschöpft, bleibt der jeweilige Assistent beziehungsweise
Bearbeitungsdialog geöffnet und meldet den Zustand ausdrücklich. Die Meldung behauptet nicht, dass außerhalb der
angebundenen Quellen keine Aufnahme existiert.

Wikimedia-Commons-Ablehnungen werden kanonisch auf die jeweilige `File:`-Identitaet normalisiert. Prozentkodierte
URLs, Beschreibungspfade und Titelvarianten derselben Datei duerfen deshalb nicht als neue Quelle erscheinen.

Interne JavaScript-Hilfsprozesse des Electron-Wrappers muessen ueber
`species-explorer/child-process-environment.mjs` gestartet werden. Wenn `process.execPath` auf Electron zeigt, setzt
der Helper `ELECTRON_RUN_AS_NODE=1`; andernfalls kann ein erfolgreich ausgegebener Statusabgleich den Prozess offen
halten und Commit/Push blockieren.

Aktuell ersetzte freie Quellen:

- `Eurasisches Eichhoernchen`: freie Xeno-Canto-Alternative
- `Fischertukan`: freie Wikimedia-Commons-/iNaturalist-Aufnahme
- `Grosstrappe`: freie Wikimedia-Commons-Aufnahme
- `Mittelamerikanischer Totenkopfaffe`: freie iNaturalist-Aufnahme, CC BY 4.0
- `Panama-Kapuzineraffe`: freie iNaturalist-Aufnahme, CC BY 4.0
- `Quetzal`: freie Quelle, nicht mehr im NC-Report

Letzter vollstaendiger Pipeline-Check: 2026-06-20.
Letzter lokaler Bereinigungs-/Report-Check: 2026-06-29.

## Datenfluss

```text
species_list.json
  -> update.mjs
     -> IUCN API v4
     -> Xeno-Canto API
     -> Wikimedia Commons API
     -> iNaturalist API
     -> speciesData.json
     -> species-assets/<SafeName>/map.jpg
     -> species-assets/<SafeName>/sound.mp3
     -> species-assets/<SafeName>/credits.json
     -> species-assets/<SafeName>/spectrogram.webp
     -> fehlende_elemente_report.json
  -> GitHub Pages
  -> Squarespace Footer Scripts
  -> Squarespace Container auf Art- und Uebersichtsseiten
```

## Squarespace-Integration

Aktuell dokumentierter Footer:

- `docs/squarespace-footer.html`

Aktuell dokumentiertes Custom CSS:

- `docs/squarespace-custom.css`

Art-Detailseiten brauchen diese Container:

```html
<div id="species-output">
  <div id="species-info"></div>
  <div id="species-taxonomy"></div>
  <div id="species-status"></div>
</div>

<div id="species-sound"></div>

<div id="map-wrapper" class="frame-box">
  <div id="map-output"></div>
</div>
```

Uebersichtsseiten brauchen fuer Suche:

```html
<div id="species-search"></div>
```

Optional fuer Sortierung:

```html
<select id="species-sort"></select>
```

## Lokaler Workflow

Voraussetzungen:

- Node.js 24 für den vollständigen Explorer-/Taxonomiebetrieb einschließlich `node:sqlite`; CI verwendet Node 24
- `npm install`
- Umgebungsvariable `IUCN_TOKEN`
- Umgebungsvariable `XENO_TOKEN`
- GitHub-Anmeldung ueber Git Credential Manager oder SSH, keine Tokens in Batch-Dateien oder Git-Remote-URLs

Manuell ausfuehren:

```bash
node update.mjs
```

Weitere Pipeline-Modi:

```bash
node update.mjs --mode=missing --dry-run
node update.mjs --mode=missing
node update.mjs --mode=all
node update.mjs --report-only
npm.cmd run --silent cleanup:species -- --dry-run
```

Lokale Batch-Dateien:

- `update_local.bat`: fuehrt `node .\update.mjs` aus, gleicht danach Spektrogramme ab, baut den Report mit
  `node .\update.mjs --report-only` neu auf und ruft anschliessend `update_github_only.bat --no-pause` auf
- `update_github_only.bat`: pusht aktuelle Projektdateien ins Repo, ohne Token in der Remote-URL

Beim manuellen Start per Doppelklick starten beide Batch-Dateien zuerst ein dauerhaftes Konsolenfenster und fuehren
sich darin mit `--run` erneut aus. Die komplette Ausgabe bleibt dadurch sichtbar. Zum Schliessen das Fenster
schliessen oder `exit` eingeben. Der Parameter `--no-pause` ist nur fuer interne Aufrufe gedacht, damit
`update_local.bat` beim Aufruf von `update_github_only.bat` kein zweites Fenster oeffnet.
Die JSON-Ausgabe des Spektrogramm-Generators wird im normalen Erfolgslauf unterdrueckt; bei Fehlern wird die
Detailausgabe aus `Testlauf/spectrogram-update.log` angezeigt.
Aufrufe von `npm.cmd` innerhalb einer Batch-Datei muessen mit `call npm.cmd ...` erfolgen. Ohne `call` kehrt Windows
nach dem npm-Skript nicht zur aufrufenden Batch-Datei zurueck.

Die Batch-Dateien sind lokal ignoriert und nicht Teil des GitHub-Pages-Deployments.

Monatsaudit:

```bash
npm.cmd run --silent audit:site
```

Nur lokaler Repo-/Assetcheck ohne Netzwerk:

```bash
npm.cmd run --silent audit:site -- --skip-live --skip-pages
```

Vollständiges lokales CI-Qualitätsgate:

```bash
npm.cmd run --silent quality:ci
```

Das Qualitätsgate umfasst zusätzlich `check:style`, `check:schema` und `size:check`. Das flexible
Repository-Budget wächst mit der Artenzahl; die Git-Historie wird getrennt und ohne automatischen Rewrite
beobachtet. Details: `docs/repository-quality-gates.md`.

Das Audit-Skript `scripts/monthly-site-audit.mjs` schreibt keine Datei, sondern gibt JSON auf stdout aus. Temporare
Zwischenergebnisse gehoeren nach `Testlauf/` und werden nach Abschluss geloescht oder als zusammengefasster Bericht
unter `docs/audits/` dokumentiert.

Spektrogramm-Generator:

```bash
npm.cmd run --silent generate:spectrograms -- --dry-run
```

Echte Ausgabe braucht `ffmpeg` im PATH, `FFMPEG_PATH` oder `--ffmpeg=<Pfad>`. Erst mit Testausgabe nach
`Testlauf/spectrograms` pruefen, bevor produktive `species-assets/<SafeName>/spectrogram.webp`-Dateien erzeugt werden.

Temporare Tests gehoeren in `Testlauf/`. Dieser Ordner ist ignoriert; produktive Artefakte gehoeren dort nicht hinein.
Nach Abschluss nur eigene entbehrliche Testordner gezielt entfernen. Gebundene Reparatur-/Prüfbelege und fremde
Inhalte erhalten; der Dokumentations-/Commitauftrag ist keine pauschale Bereinigungsfreigabe.

## Bekannte Stolperstellen

- Keine Tokens oder privaten Schluessel hardcoden.
- `graphics/catagory/Alternativ/` nicht vorschnell umbenennen. Die Schreibweise ist in Live-Pfaden relevant.
- `species-assets/` ist die einzige produktive Asset-Struktur fuer Karten, Sounds, Credits und Spektrogramme.
- `speciesData.json` muss ein Array bleiben.
- Detailseiten-Slugs entsprechen dem wissenschaftlichen Namen ohne Leerzeichen, z. B. `cyanistescaeruleus`.
- Squarespace Preview kann andere Pfade liefern als die Live-Seite.
- Nach jeder eingebundenen JS-Aenderung muss die jeweilige Squarespace-`?v=`-Version erhoeht werden.
- Asset-Pfadmigrationen duerfen nicht nebenbei passieren, weil sie Loader, GitHub-Pages-Pfade und bestehende Assets betreffen.
- GitHub Pages muss auf `Source: GitHub Actions` stehen. Das Deployment laeuft ueber
  `.github/workflows/pages.yml` und das kontrollierte `_site/`-Artefakt aus `scripts/prepare-pages-artifact.mjs`.
  Branch-Deployment aus `main:/` ist nicht mehr der Sollzustand, weil dabei der komplette Repo-Root ueber den
  GitHub-Standardlauf deployed wird und der Deploy-Schritt wiederholt erst nach einem Rerun erfolgreich war.
  Pages-Laeufe verwenden die gemeinsame Concurrency-Gruppe `pages` mit `cancel-in-progress: false`, damit mehrere
  kurz nacheinander ausgelöste Veröffentlichungen serialisiert werden und ein noch synchronisierender Deploy nicht
  durch einen neuen Lauf ueberholt wird.
  Fuer Diagnose ist lokal `gh` nutzbar. Falls `gh` in Codex ueber `127.0.0.1:9` scheitert,
  Proxy-Umgebungsvariablen fuer den Befehl leeren:
  `$env:HTTP_PROXY=''; $env:HTTPS_PROXY=''; $env:ALL_PROXY=''; $env:NO_PROXY='github.com,api.github.com'`.

## Testplan

Nach Datenpipeline-Aenderungen:

- `node --check update.mjs`
- `node update.mjs`
- `fehlende_elemente_report.json` pruefen
- Anzahl Arten, Art-Assetordner, Karten, MP3s, Credits und Spektrogramme pruefen
- Anzahl Artportraets und fehlende Portrait-Assetprobleme pruefen
- Credits der ersetzten Sounds auf Quelle, Lizenz und URL pruefen

Nach Frontend-Aenderungen:

- Detailseite, z. B. `/wildlife/heimische-tierwelt/acanthisflammea`
- Uebersichtssuche:
  - `/wildlife/heimische-tierwelt`
  - `/wildlife/costarica`
  - `/wildlife/island`
- Mobile Layout pruefen
- Tierstimmen-Player pruefen: Spektrogramm, Play/Pause, Scrubbing, Lautstaerke 0-200 Prozent, Mute-Toggle und
  Tempo-Auswahl
- Lightbox-Zoom auf Desktop und Android Chrome pruefen
- GitHub Pages Deploy abwarten
- Danach erst Squarespace-`?v=` erhoehen

## Aktuelle Roadmap

Details stehen in `docs/roadmap.md`.

Phase 5 ist abgeschlossen. Erledigt wurden unter anderem:

- Repo- und Dateiaudit: `docs/repo-file-audit.md`
- Dokumentationsregel und Uebergabe: `AGENTS.md`, `README.md`, `docs/roadmap.md`
- Lokaler Workflow und Repo-Struktur: `docs/repo-structure.md`
- Soundbar: `species-sound.js`, `docs/soundbar.md`
- Manuelle Zusatzdaten: `species_list.json`, `update.mjs`, `species-info.js`, `docs/manual-species-fields.md`
- Weitere-Arten-Workflow: `docs/add-species-workflow.md`
- SEO/KI-Findbarkeit und Bild-Alt-Texte: `docs/seo-worklist.md`, `docs/image-alt-audit.md`
- Mobile Reisegalerien: `docs/squarespace-custom.css`, `docs/css-layout-audit.md`
- Asset-Strukturentscheidung: `docs/asset-structure-plan.md`

Aktuelle Planung:

- Phase 6 - Funktionsueberarbeitung: abgeschlossen am 2026-06-17.
  Erledigt und dokumentiert sind monatliches Gesamtaudit, Audit-Automatisierung, manuell gepflegte Karten,
  Spektrogramm-Konzept, Spektrogramm-Generator, produktive Spektrogramm-Integration, Soundbar-Regler und
  artweise Asset-Buendelung. `species-assets/<SafeName>/` ist die alleinige produktive Struktur; `sounds/` und
  `Verbreitungskarten/` wurden am 2026-06-17 entfernt.
  Wichtige Detaildokumente:
  - Audit-Grundlage: `docs/monthly-site-audit.md`
  - erster echter Monatsaudit: `docs/audits/2026-06-site-audit.md`
  - manuell gepflegte Karten: `docs/manual-map-overrides.md`
  - Spektrogramme: `docs/spectrogram-plan.md`
  - Soundbar: `docs/soundbar.md`
  - Asset-Struktur: `docs/asset-structure-plan.md`
  Relevante Footer-Versionen: `species-core.js?v=1.0.4`, `map-loader.js?v=1.0.7` und
  `species-sound.js?v=1.0.25`. Version `1.0.24` reduziert nur die sichtbare Spektrogrammhoehe; die vorhandenen
  WebP-Assets bleiben unveraendert. Version `1.0.25` korrigiert die Meldung fuer fehlende Tierstimmen auf
  `Keine Tierstimme verfügbar` ohne Schlusspunkt. Der Footer mit `1.0.24` wurde von Felix am 2026-06-19 angepasst
  und live erfolgreich getestet.
- Phase 7 - Desktop-App / Arten-Explorer:
  abgeschlossen am 2026-07-18. Die technische Basis steht in `docs/desktop-app-plan.md`.
  Entscheidung fuer den Start: lokale Node-Web-App mit Browseroberflaeche.
  Phase 7.2 ist seit 2026-06-18 erledigt: read-only Prototyp mit 45 Arten, Suche, Filtern, Detaildaten, Karte, Sound,
  Credits, Spektrogramm und Assetstatus. Karten werden vollstaendig im Originalseitenverhaeltnis angezeigt.
  Spektrogramm und Audio sind in einem Player mit Play/Pause, Zeit, Lautstaerke, Scrubbing und Positionsmarker
  gekoppelt. Ein Klick ins Spektrogramm setzt die Position und startet die Wiedergabe dort sofort. Der
  Tierstimmen-Bereich ist zugunsten des spaeteren Artportraets kompakt; seit 2026-07-10 stehen
  Verbreitungskarte, Tierstimme und Artportraet als drei gleich grosse Medienbereiche nebeneinander. Die
  Quellen-/Lizenzdaten der Tierstimme sind im Explorer direkt sichtbar.
  Seit 2026-07-11 werden diese Medienbereiche bei weniger als 1320 Pixel nutzbarer Breite im rechten Detailbereich
  untereinander dargestellt. In der dreispaltigen Ansicht wechseln schmale Einzelkarten auf einen zweizeiligen
  Kartenkopf: Titel oben, alle drei Assetaktionen gemeinsam in einer gleichmaessigen Zeile darunter. Bei geringer
  Fensterhoehe werden die festen Kopf-, Zusammenfassungs- und
  Validierungsbereiche verdichtet, damit die
  getrennten Scrollflaechen fuer Artenliste und Details nutzbar bleiben. Geschlechtsspezifische Groessen- und
  Gewichtswerte stehen in getrennten Zeilen. Lokale IUCN-Status- und Trendsymbole werden im Artkopf sowie neben
  Kategorie und Trend sowie in der linken Artenliste angezeigt; der lokale Server liefert dafuer ausschliesslich
  die freigegebenen PNG-Dateien
  unter `graphics/catagory/` und `graphics/trend/` aus.
  Der lokale Server liefert Assets mit HTTP-Byte-Range-Unterstuetzung aus, damit MP3-Spruenge nicht auf Position 0
  zurueckfallen.
  Das Explorer-Spektrogramm ist auf 64 bis 84 Pixel
  Anzeigehoehe begrenzt, damit das Artportraet mehr Platz erhaelt.
  Das IUCN-Abrufdatum steht im Detailkopf, Statusfilter verwenden deutsche Bezeichnungen mit IUCN-Kuerzel und
  manuell hinzugefuegte Assets werden direkt in ihrer Assetzeile markiert. Artwechsel erhalten Fenster- und
  Listenposition. Start: `npm.cmd run species:explorer`; Tests: `npm.cmd run --silent test:explorer`.
  Wenn der direkte Browser-/Servermodus erneut gestartet wird, waehrend bereits ein Explorer auf Port 4177 laeuft,
  meldet der Server seit 2026-06-27 verstaendlich die bestehende URL statt mit einem rohen `EADDRINUSE`-Stacktrace
  abzubrechen.
  Phase 7.3 ist seit 2026-06-19 erledigt: Das read-only Statusdashboard vergleicht `species_list.json`,
  `speciesData.json`, `fehlende_elemente_report.json` und die tatsaechlichen Assetdateien. Beim Abschluss stimmten
  45 von 45 Datenpaare ueberein, 45 Assetpakete waren vollstaendig und neun Reportpruefungen konsistent. Nach dem
  Anlegen des Haubentauchers zeigt der Explorer erwartungsgemaess eine input-only Art, ein fehlendes Assetpaket und
  einen bis zum Pipeline-Lauf noch nicht aktualisierten Report. Daten- und Assetprobleme sind getrennt filterbar und
  werden artweise erklaert.
  Status- und Hinweis-Dropdowns sind alphabetisch nach ihren sichtbaren deutschen Bezeichnungen sortiert.
  Phase 7.3 wurde von Felix am 2026-06-19 visuell geprueft.
  Die interne Phasenbezeichnung ist in der App ausgeblendet. Kopfbereich, Zusammenfassung und Validierungsstatus
  bleiben im Desktopfenster sichtbar; darunter scrollen linke Artenliste und rechter Detailbereich getrennt. Beim
  Artwechsel springt nur der rechte Detailbereich wieder an den Anfang, waehrend die Scrollposition der linken
  Artenliste erhalten bleibt.
  Phase 7.4 ist seit 2026-06-19 abgeschlossen und von Felix visuell geprueft. Im Bereich `Allgemeine Daten` sind
  deutscher Name, der bewusst entsperrbare wissenschaftliche Name, Groesse, Gewicht und Lebenserwartung editierbar.
  Seit 2026-07-11 verwenden Groesse, Gewicht und Lebenserwartung dieselben strukturierten Wert-/Einheitenfelder wie
  der Neue-Art-Assistent; Groesse und Gewicht koennen unabhaengig nach Maennchen und Weibchen getrennt werden.
  Vor dem Speichern sind Validierung und Diff-Vorschau Pflicht; Vorschau-Token laufen nach zehn
  Minuten ab und werden bei parallelen Dateiaenderungen ungueltig. Vor jedem Schreiben entsteht eine ignorierte
  Sicherung unter `species-explorer/backups/`. Automatisch bleiben nur die neuesten 20 verwalteten Backups erhalten;
  fremde Dateien im Ordner werden nicht geloescht. Automatische IUCN-Felder, neue Arten, Pipeline und Git bleiben
  gesperrt bzw. separat. Die Phase-7.4-Pruefungen sind Teil der Explorer-Tests.
  Der Speichertest, die Korrektur des Testwerts und die robuste Erfolgsmeldung wurden geprueft.
  `Loeschen` steht als Artaktion oben rechts im Detailkopf. `Bearbeiten` steht seit 2026-06-30 direkt an den
  bearbeitbaren Bereichen `Manuelle Daten`, `Artportraet`, `Verbreitungskarte` und `Tierstimme`; der
  Bearbeitungsdialog oeffnet jeweils nur den gewaehlten Bereich. Der Dialog kennzeichnet Taxonomie als gesperrt und
  nennt keine interne Phasennummer.
  Seit 2026-07-05 koennen deutscher und wissenschaftlicher Artname im Bereich `Allgemeine Daten` umbenannt werden.
  Der wissenschaftliche Name ist per Schloss geschuetzt; nach Warnbestaetigung werden wissenschaftlicher Name,
  Genus/Species und URL-Slug konsistent angepasst. Die Umbenennung prueft Kollisionen und fuehrt
  `species_list.json`, `speciesData.json`, Assetname/SafeName, Assetordner, `species-assets-overrides.json`,
  `lastSavedAssessmentId.json`, `fehlende_elemente_report.json`, Kartendokumentation sowie lokale Credits- und
  Portrait-Metadaten mit. Die Aenderung bleibt lokal offen und wird ueber `Änderungen übertragen` veroeffentlicht.
  Details: `docs/rename-species-workflow.md`.
  Phase 7.5 ist seit 2026-06-20 abgeschlossen und durch das erneute Anlegen von Haubentaucher und Hoeckerschwan
  praktisch geprueft.
  Neue Arten werden kontrolliert nach `docs/add-species-workflow.md` angelegt. Erfasst werden
  deutscher Name, englischer Name, wissenschaftlicher Name, Groesse, Gewicht und Lebenserwartung. Der
  wissenschaftliche Name wird
  im Hintergrund in Gattung und Artepitheton getrennt und normalisiert. Duplikate, Slug-/SafeName-Kollisionen
  sowie vorhandene Assetordner werden vor einer vollstaendigen JSON-Vorschau geprueft.
  Speicherung nutzt den Backup-/Token-/Hashschutz aus 7.4. Nach dem Abschluss startet der Explorer automatisch den
  gezielten Pipeline-Lauf fuer genau diese neue Art; bis zum erfolgreichen Lauf bleibt sie erwartungsgemaess nur in
  `species_list.json`. API: `POST /api/species/new/preview` und `POST /api/species/new/save`. Fuer optionale
  Sofortportraits liefert `POST /api/species/new/portrait-prompt`
  einen Einzelprompt aus den eingegebenen neuen Artdaten. Seit 2026-06-29 ist `Neue Art` als vierstufiger
  Schrittassistent aufgebaut: allgemeine Daten pruefen, optionales Artportrait pruefen oder ueberspringen,
  Karte/Suchlauf und Sound/Abschluss. Klickbare, noch offene Schritte sind blau markiert, abgeschlossene Schritte
  gruen und gesperrte Schritte grau. Groesse, Gewicht und Lebenserwartung werden aus Wert plus Einheit
  zusammengesetzt; `ca.` wird automatisch gespeichert und Lebenserwartung wird bei `1` automatisch auf `Tag`,
  `Monat` oder `Jahr` gebeugt. Bereits erreichte Schritte koennen angeklickt werden. `Artportrait ueberspringen`
  startet keine Anlage mehr, sondern gibt erst `Naechster Schritt` frei. Nach Schritt 2 wird die Art angelegt und der
  gezielte Pipeline-Lauf fuer genau diese Art im selben Dialog gestartet; das Datenbank-Aktionen-Fenster wird dabei
  nicht geoeffnet. Gefundene Karten
  koennen uebernommen oder uebersprungen werden. Gefundene Sounds werden mit Spektrogramm angezeigt, koennen
  uebernommen, uebersprungen oder abgelehnt werden. Bei Ablehnung merkt der Explorer die Quellkennung und sucht
  automatisch weiter. Dabei werden Asset-URLs mit einem Hash-Buster versehen, damit nach abgelehnten Sounds nicht
  versehentlich ein altes MP3 oder Spektrogramm aus dem Cache angezeigt wird. Ungueltige Eingaben werden direkt am
  Feld markiert. Groesse und Gewicht koennen unabhaengig
  voneinander per Checkbox nach Maennchen und Weibchen getrennt werden; gespeichert werden weiterhin die vorhandenen
  Textfelder. Vor der Anlage schliesst `X`/`Abbrechen` den Dialog ohne Speicherung und verwirft die Eingaben. Die
  Route `POST /api/species/new/portrait-preview` prueft ein optional sofort erzeugtes Portrait vor
  der Artanlage. Der lokale Server wurde mit dem neuen Stand neu gestartet; die ausgelieferte
  Oberflaeche enthaelt Aktion, Dialog und alle Pflichtfelder mit Beispieltexten. Weitere Arten koennen nach
  erfolgreichem Speichern ohne Seitenneuladen angelegt werden. Haubentaucher und Hoeckerschwan wurden fuer
  produktive Workflow-Tests angelegt und danach am 2026-06-28 wieder entfernt und bereinigt. Loewe wurde am
  2026-06-30 erneut fuer den Neue-Art-Test entfernt; die Sofortloeschung bereinigte Eingabeliste, generierte Daten,
  Override-Eintrag und Assetordner.
  Hintergrundklicks schließen Eingabedialoge nur, wenn Zeigerdruck und Klickende beide auf dem Hintergrund liegen.
  Dadurch bleibt das Formular bei Textmarkierungen über den Dialogrand geöffnet.
  Phase 7.6 Pipeline-Steuerung nach `docs/pipeline-control-plan.md` ist seit 2026-06-20 abgeschlossen. Die App
  unterscheidet `Neue/Unvollstaendige Arten aktualisieren`, `Alle Arten vollstaendig aktualisieren`,
  `Manuelle und fehlende Karten erneut suchen` und `NC- und fehlende Sounds erneut suchen`. `update.mjs`
  unterstuetzt
  `--mode=missing`, `--mode=all` und `--dry-run`; `missing` verarbeitet neben neuen oder unvollstaendigen Arten
  auch geaenderte manuelle Eingabefelder aus `species_list.json`. Die App zeigt Vorschau, Prozessstatus und lokale Logs. Nur ein
  Lauf kann gleichzeitig aktiv sein. Nach dem Start bleibt der Dialog geöffnet und zeigt
  `Pipeline-Lauf läuft gerade`. Der Button `Abbrechen` wechselt zu `Fenster schließen`; das Schließen beendet den
  Hintergrundprozess nicht. Ein Statusbalken im Hauptfenster zeigt laufende, wartende, abgeschlossene und
  fehlgeschlagene Läufe und öffnet die Prozessdetails erneut. Nach erfolgreicher Pipeline folgt der passende
  Spektrogramm-Abgleich. Die Prozessausgabe des Spektrogramm-Abgleichs wird im Explorer als lesbare Zeilen pro Art
  angezeigt: Sound vorhanden/fehlt und Spektrogramm vorhanden/erstellt/uebersprungen statt rohem JSON.
  Neu hinzugefuegte Karten und Sounds werden danach angezeigt und je Asset als automatisch oder manuell geschuetzt
  bestaetigt. Kartenvorschauen sind dabei anklickbar und werden fuer die Qualitaetspruefung in einer grossen
  Lightbox angezeigt. Sounds werden im Pruefdialog mit dem erzeugten Spektrogramm angezeigt; ein Klick ins
  Spektrogramm setzt die Wiedergabeposition. Sound-Optionen werden strukturiert angezeigt und nennen eindeutig,
  ob ein gefundener Kandidat `NC` oder `frei` ist. Wenn ein bisheriger Sound vorhanden ist, stehen bisheriger Sound
  und gefundener Kandidat nebeneinander, jeweils mit eigenem Player und Spektrogramm. Bei gezielten Kartenlaeufen
  stehen die bisherige Karte und die gefundene Karte nebeneinander und sind einzeln vergroesserbar. Die Entscheidung
  steht in `species-assets-overrides.json`; Details:
  `docs/asset-review-workflow.md`. Danach werden die Pipeline-Dateien automatisch committed und gepusht.
  Beim Schliessen des Asset-Pruefdialogs werden laufende Sounds gestoppt und auf Position 0 zurueckgesetzt.
  Die beiden Wartungsläufe verarbeiten die aktuell fünf manuell geschützten Karten plus Arten mit fehlender Karte
  beziehungsweise die vier NC-Sounds plus Arten mit fehlender Sounddatei. Vorhandene Dateien werden vorübergehend
  unter dem ignorierten Pfad
  `species-explorer/pipeline-asset-backups/` gesichert und bei Ablehnung einer Alternative wiederhergestellt.
  Wenn ein Sound im Pruefdialog ausdruecklich abgelehnt wird, speichert der Explorer die Quellkennung unter
  `sound.rejectedSources` und startet automatisch die naechste gezielte Soundsuche fuer dieselbe Art. Es koennen
  beliebig viele Quellen je Art abgelehnt werden; die Schleife endet erst, wenn eine Quelle uebernommen wird oder
  keine weitere taugliche Quelle vorhanden ist. Bei einer gezielten Alternative fuer einen bereits akzeptierten
  Sound wird die aktuelle Quelle nur temporaer uebersprungen; nach freien Kandidaten werden auch die bisherigen
  Xeno-Canto-Fallback-Stufen geprueft. Wenn ein gefundener Kandidat wegen Download-, Format- oder
  Transcode-Problemen nicht uebernommen werden kann, prueft `update.mjs` im selben Lauf weitere Kandidaten. Eine
  Windows-Dateisperre auf der produktiven MP3 wird als eigener Warnzustand gemeldet; der Bearbeitungsdialog entlaedt
  den aktuellen Audioplayer vor dem Alternativlauf, um solche Sperren zu vermeiden.
  Seit 2026-06-29 schliessen `X`, `Abbrechen` und `Fenster schliessen` die Datenbank- und Einstellungsdialoge
  wieder korrekt; der laufende Prozess bleibt dabei unveraendert im Hintergrund aktiv.
  Der IUCN-Kartenabruf prueft zusaetzlich eine robuste Fallback-Strategie fuer gecachte Einzelkarten. Seit
  2026-07-02 versucht `update.mjs` zuerst den bisherigen IUCN-Web-Endpunkt mit browsernahen Headern, danach den
  offiziellen IUCN-API-Host mit Token und extrahiert signierte Backblaze-Links aus Redirect-, HTML- und
  Fehlerantworten als
  `cached-individual-maps`-URL. Der Windows-Fallback nach HTTP 403 wurde am 2026-09-12 zunächst entfernt,
  dann wiederhergestellt; auch er scheitert im aktuellen Benutzerlauf. Ersatzweg ist der Datei-Upload. Seit
  2026-07-10 wiederholt die Pipeline diesen Fallback bei temporären IUCN-/Backblaze-Fehlern bis zu dreimal, damit
  ein einzelnes `503 Server nicht verfügbar` nicht direkt in den manuellen Kartenworkflow führt. Der URL-Prüfer im
  Kartenimport nutzt denselben Windows-WebRequest-Fallback für IUCN-API-Kartenlinks. Wenn
  lokal trotzdem kein direkt speicherbarer Link geliefert wird, kann der im Browser sichtbare signierte
  Backblaze-JPEG-Link weiterhin im Kartenimport als Quellen-URL eingefuegt und wie ein
  Datei-Upload geprueft und uebernommen werden. Seit 2026-07-10 akzeptiert der Karten-Dateiupload JPEG und PNG;
  PNG wird serverseitig nach JPEG konvertiert und weiterhin als `map.jpg` gespeichert. Eine Quellen-URL ist nur
  beim Linkimport Pflicht. Seit 2026-07-01 bietet der Karten-Bearbeitungsdialog dafuer direkt
  `IUCN-Karte im Browser oeffnen`. Derselbe URL-Workflow steht im Neue-Art-Assistenten im Schritt `Karte` zur
  Verfuegung, damit eine neue Art ohne Wechsel in den allgemeinen Bearbeitungsdialog mit manueller Karte
  abgeschlossen werden kann. Karten-Vorschauen skalieren hochformatige IUCN-Karten vollstaendig in die verfuegbare
  Breite ein; nach einem manuellen Kartenimport wird der Report sofort neu aufgebaut und die Aenderung lokal fuer
  `Änderungen übertragen` vorgemerkt. Seit 2026-07-02 kann `Automatisch suchen` im
  Karten-Bearbeitungsdialog fuer jede vorhandene Art gestartet werden, auch wenn die Karte bereits automatisch
  gepflegt ist. Wenn die Pipeline eine Karte speichert, zeigt der Explorer die Pflegeentscheidung auch dann an, wenn
  die Datei bytegleich zur bisherigen manuell gepflegten Karte ist; dadurch koennen Backblaze-uebernommene Karten
  nach erfolgreichem automatischem Abruf wieder auf automatische Pflege zurueckgestellt werden. Ein versteckter
  Electron-/Chromium-Fallback wird nicht genutzt, weil
  Headless-Browserprozesse auf dem Zielsystem mit Anwendungsfehlern abbrechen koennen.
  Seit 2026-06-27 beendet `update.mjs` abgeschlossene Pipeline- und Wartungsläufe nach dem Leeren von stdout und
  stderr explizit. Dadurch bleibt der Explorer nach einer finalen Erfolgsausgabe nicht mehr fälschlich im Status
  `Pipeline-Lauf läuft gerade` hängen; die anschließende Assetentscheidung kann geöffnet werden.
  Bei Übernahme einer automatischen Karte werden JSON-Register und `docs/manual-map-overrides.md` gemeinsam
  aktualisiert. Großtrappe, Kernbeißer und Reh wurden am 2026-06-20 aus der manuellen Pflege genommen, nachdem
  Felix die neu gefundenen automatischen Karten übernommen hatte. Das JSON-Register ist bei einer ausdrücklichen
  `manual`-Entscheidung maßgeblich; die Markdown-Liste wird daraus synchronisiert.
  Die Speichermeldung einer neu angelegten Art wird nach erfolgreichem Pipeline-Commit und Push entfernt.
  Arten koennen nach Vorschau und `species_list.json`-Backup aus der Eingabeliste entfernt werden. Eine Checkbox
  loescht bei Bedarf generierte Daten, Assessment-Zuordnung, Asset-Pflegeeintrag und Assetordner derselben Art sofort
  dauerhaft mit. Seit 2026-07-01 wird bei aktivierter Checkbox zuerst die dauerhafte Bereinigung ausgefuehrt und erst
  danach `species_list.json` geaendert; bei einer Windows-Dateisperre bleibt die Art vollstaendig in der Eingabeliste.
  Ohne Checkbox bleiben diese Inhalte bis zur getrennten Bereinigung bestehen. Die Aktion
  `Bereinigen` listet verwaiste Datensaetze, Assessment-Zuordnungen, Pflegeeintraege und Assetordner auf und loescht sie nach
  genau einer Bestaetigung dauerhaft ohne Wiederherstellungsablage. Details:
  `docs/delete-species-workflow.md`. Die Bereinigung verschiebt Assetordner seit 2026-06-28 zuerst in den ignorierten
  Ordner `species-explorer/cleanup-trash/`, schreibt danach Daten und Report und loescht den verschobenen Ordner erst
  anschliessend endgueltig. Seit 2026-06-30 werden kurze Windows-Dateisperren beim Verschieben mehrfach erneut
  versucht; danach nutzt der Explorer einen kontrollierten Fallback aus Kopieren und Entfernen des Originalordners.
  Dadurch bleiben Daten, Report und Assetbestand auch bei Windows-Dateisperren konsistent. Seit 2026-07-01 kann der
  Loeschdialog auch einen teilbereinigten Zwischenzustand ohne `species_list.json`-Eintrag, aber mit verbliebenen
  generierten Daten oder Assets direkt dauerhaft bereinigen. Vor dem Loeschaufruf entlaedt die Oberflaeche Audio,
  Karten- und Portraitmedien der Detailseite und wartet bei Sofortloeschung kurz, damit Windows keine produktiven
  Assetdateien sperrt.
  Gezielte Sound-Alternativlaeufe im Bearbeitungsdialog und globale `nc-sounds`-Laeufe entladen vor dem Start alle
  Audioplayer; der aktuelle Bearbeitungsplayer wird ersetzt und kurz freigegeben, damit eine pausierte Vorschau keine
  produktive MP3-Dateisperre haelt. Temporäre Pipeline-Backupordner, die Windows nach erfolgreichem Commit/Push noch
  sperrt, werden nur noch als Warnung protokolliert und machen den Lauf nicht nachtraeglich fehlgeschlagen. Beim
  spaeteren Uebernehmen einer Soundalternative bleiben bereits gespeicherte `sound.rejectedSources` erhalten. Der
  offene Tierstimmen-Bearbeitungsdialog aktualisiert nach einem still gestarteten Alternativlauf aktuellen Sound und
  Credits aus dem neu geladenen Modell. Der Sound-Pruefdialog bleibt nach einer Ablehnung geoeffnet und zeigt den
  naechsten Kandidaten im selben Fenster. Die Detailansicht nutzt versionsbasierte lokale Asset-URLs fuer Sound,
  Spektrogramm, Karte und Portrait, damit nach schnellen Assetwechseln keine alten Browsercache-Dateien neben neuen
  Dateien angezeigt werden.
  Der separate Phase-7.6-Seitenbereich wurde entfernt. In der Kopfzeile schaltet
  `Lesemodus 🔒` und `Bearbeitungsmodus 🔓`; Neue Art, Datenbankaktualisierung, Bearbeiten und Loeschen sind nur dort
  sichtbar. Der Modusschalter hat in beiden Zuständen dieselbe feste Breite und Position. Das klickbare Datenbankfeld
  ist bei manuellen Eingabeabweichungen oder lokal gespeicherten Assetaenderungen rot mit
  `Änderungen übertragen` und bei konsistentem Stand gruen mit `Datenbank aktuell`; ein Klick auf den roten Zustand
  startet den Transferlauf fuer geaenderte Eingabefelder und lokale Assetdateien ohne Karten- oder Soundsuche. Der
  Kopfstatus und die Validierung werden nach stillen Karten-/Soundläufen im geöffneten Bearbeitungsdialog ohne
  vollständiges Neurendern aktualisiert, damit ein bereits committed/gepushter Lauf nicht fälschlich weiter
  `Änderungen übertragen` anzeigt. Der
  Status- und Uebertragungsbutton bleibt auch im Lesemodus sichtbar; ohne offene Aenderungen oeffnet er dort keine
  Wartungsaktionen. Die Transfer-Vorschau zaehlt auch Arten, bei denen nur lokale Assetdateien geaendert wurden.
  Datenbank-Aktionen laufen exklusiv: waehrend Pipeline, Assetpruefung, Transfer, Bereinigung oder NAS-Backup aktiv
  ist, blockiert der Server weitere Datenbank-Aktionen. `Art aktualisieren` fragt je Art nur kurz nach und startet
  den gezielten Lauf direkt im Hintergrund, ohne den allgemeinen Datenbank-Aktionen-Dialog zu oeffnen. Beim
  Schliessen der Desktop-App warnt der Explorer vor noch nicht uebertragenen Aenderungen; der Nutzer kann zur App
  zurueckkehren oder trotzdem schliessen und die Uebertragung beim naechsten Start nachholen. Der Dialog dahinter
  heisst `Datenbank-Aktionen` und trennt Aktualisieren, Backup/Einstellungen sowie Wartung in aufklappbare Gruppen.
  Nach dem Speichern einer neuen Art startet der selektive Lauf fuer genau diese Art automatisch. Externe Änderungen durch `update_local.bat`,
  CLI-Aufrufe oder andere Prozesse werden über eine Dateirevision erkannt. Der Server baut sein Modell automatisch
  neu auf; die Browseroberfläche prüft alle fünf Sekunden `GET /api/revision` und lädt bei Änderungen selbstständig
  neu. 24 Explorer-Tests sind erfolgreich. Ein vollständiger externer Pipeline-Lauf und ein produktiver
  selektiver App-Lauf fuer den Hoeckerschwan wurden am 2026-06-20 erfolgreich abgeschlossen. Start,
  Prozessanzeige, Assetentscheidung sowie automatischer Commit `55fda06` und Push funktionierten. Die danach
  ergaenzte Karten-Grossansicht, sichere Dialogbedienung, Soundstopp und Bereinigung wurden von Felix praktisch
  geprueft.
  Ein am 2026-06-20 gefundener Fehler startete bei `Bereinigen` wegen eines fehlenden internen Modus irrtuemlich
  `update.mjs --mode=undefined`. Der Plan und Prozessstatus tragen jetzt ausdruecklich `mode: cleanup`; der
  isolierte Test prueft sowohl den Bereinigungslauf als auch die optionale Sofortloeschung und anschliessende
  kollisionsfreie Neuanlage.
  Phase 7.7 Asset-Verwaltung nach `docs/asset-management-plan.md` wurde am 2026-06-21 abgeschlossen und von Felix
  freigegeben. Die Kartenverwaltung erlaubt im allgemeinen Bearbeitungsdialog bekannten Arten eine neue
  Arten eine neue JPEG-Karte bis 20 MB mit Quelle und Pflegegrund pruefen. Der Server validiert Magic Bytes,
  JPEG-Struktur und Abmessungen, legt eine zehn Minuten gueltige Alt-/Neu-Vorschau im ignorierten Stagingbereich an
  und schuetzt gegen parallele Aenderungen. Beim Speichern wird die alte Karte gesichert, `map.jpg` atomar ersetzt,
  der manuelle Pipeline-Schutz samt SHA-256 im Override-Register gesetzt und die Kartendokumentation aktualisiert.
  Pro Art und Assettyp bleibt seit 2026-07-10 genau die letzte verwaltete Sicherung erhalten; global gilt weiter
  500 MB. Nach erfolgreichem Austausch
  bleiben Karte, Register, Dokumentation und Report lokal vorgemerkt und werden gesammelt ueber
  `Änderungen übertragen` committed und gepusht.
  Die technische Grundlage fuer 7.7.3 Sound-/Credits-Verwaltung ist ebenfalls lokal umgesetzt. Der allgemeine
  Bearbeitungsdialog akzeptiert MP3-Dateien bis 50 MB nur zusammen mit Aufnahme/Urheber, Quelle, Original-URL,
  Lizenz und Pflegegrund. Wissenschaftlicher und deutscher Name werden aus dem Arteintrag uebernommen. Vor dem
  Speichern zeigt die App alten und neuen Sound, Dateigroesse, Dauer, Credits und einen sichtbaren NC-Hinweis.
  Der Server prueft Endung und MP3-Signatur, verwendet ein zehn Minuten gueltiges Vorschau-Token und schuetzt gegen
  parallele Aenderungen. Beim Speichern werden `sound.mp3`, `credits.json` und `spectrogram.webp` gemeinsam
  gesichert. Phase 7.7.4 erzeugt vor jeder produktiven Soundaenderung automatisch ein neues Spektrogramm mit den
  gemeinsamen Parametern aus `scripts/spectrogram-renderer.mjs`. Erst wenn FFmpeg und WebP-Pruefung erfolgreich
  sind, werden Sound, Credits und Spektrogramm gemeinsam ersetzt. Schlaegt die Erzeugung fehl, bleibt das bestehende
  Produktivpaket unveraendert. `species-assets-overrides.json` speichert pro Art Sound- und Spektrogramm-SHA-256;
  der Explorer vergleicht diese Hashes mit den aktuellen Dateien und meldet Abweichungen als
  `Spektrogramm veraltet`. Der Generator registriert auch uebersprungene aktuelle Spektrogramme und veraendert bei
  einem erneuten unveraenderten Lauf keine Zeitstempel. Der bestehende Bestand wurde am 2026-06-20 migriert:
  45 von 45 vorhandenen Spektrogrammen sind hashregistriert und verifiziert, 0 sind veraltet. Der manuelle Pipeline-Schutz wird
  beim Soundimport gesetzt. Danach bleiben die betroffenen Assetpfade lokal vorgemerkt und werden gesammelt ueber
  `Änderungen übertragen` committed und gepusht. Pro Art und Assettyp bleibt seit 2026-07-10 genau die letzte
  verwaltete Sicherung erhalten; Karten-, Sound- und Portraitsicherungen teilen sich die globale Obergrenze von
  500 MB. Die Loeschaktionen fuer Verbreitungskarte, Artportraet und Soundpaket stehen direkt in den
  Asset-Kopfzeilen der Artseite neben `Bearbeiten`; beim Artportraet-Import kann eine gepruefte Vorschau verworfen
  und das bisherige Portrait beibehalten werden.
  Im Bearbeitungsmodus kann seit 2026-06-28 auch der aktuell produktive Sound abgelehnt werden. Der Explorer legt ein
  Soundpaket-Backup an, entfernt `sound.mp3`, `credits.json` und `spectrogram.webp`, merkt die Quellkennung unter
  `sound.rejectedSources`, baut den Report neu auf und merkt die Änderung lokal fuer `Änderungen übertragen` vor. Der naechste Sound-Suchlauf
  ueberspringt diese konkrete Quelle. Fehlende oder manuell geschuetzte Karten sowie fehlende/NC-Sounds koennen
  im Bearbeitungsdialog per `Automatisch suchen` gezielt fuer die aktuelle Art gesucht werden. Seit 2026-06-30 kann
  bei vorhandenem akzeptiertem Sound im Bearbeitungsdialog auch gezielt eine Alternative gesucht werden; der aktuelle
  Sound ist dort direkt abspielbar. Ein gezielter Alternativlauf ueberspringt die aktuell gespeicherte Quelle
  temporaer, damit nicht derselbe Sound erneut vorgeschlagen wird. Diese gezielte Suche startet im Hintergrund ohne
  das Bearbeitungsfenster oder die Desktop-App zu schliessen und ohne den allgemeinen Datenbank-Aktionen-Dialog
  einzublenden. Der aktuelle Audioplayer wird vor dem Start entladen, damit Windows die produktive MP3 nicht sperrt.
  Die Validierung unterscheidet in der Oberflaeche zwischen fehlendem Sound ohne verwendbare automatische Tonquelle
  und manuell gepflegten Sounds.
  Phase 7.7.5 Artportraet ist seit 2026-06-21 technisch als kostenfreier manueller Workflow umgesetzt. Die zuvor
  vorbereitete kostenpflichtige OpenAI Image API und die Abhaengigkeit von `OPENAI_API_KEY` wurden wieder
  vollstaendig entfernt. Der Explorer erzeugt den versionierten Prompt `2.0.0` lokal aus deutschem und
  wissenschaftlichem Namen, Taxonomieklasse, strukturierten Bildvorgaben und optionalen Zusatzhinweisen.
  `Erweiterte Vorgaben für die Bildgenerierung` ist standardmäßig geschlossen; die Untergruppen für Motiv,
  Körper/Blick, Perspektive/Verhalten, Umgebung/Licht und klassenabhängige Merkmale sind einzeln ausklappbar.
  Unveränderte Felder bleiben automatisch, das Habitat wird standardmäßig dezent und fachlich passend angedeutet.
  Detailaufnahmen verlangen ein freies Detailmotiv. `Prompt erstellen` übernimmt die Auswahl direkt.
  Einzelprompts koennen angezeigt und kopiert werden.
  Der Sammelprompt-/Datenbankdialog fuer alle fehlenden Portraits wurde am 2026-06-27 entfernt, weil ChatGPT daraus
  wiederholt Collagen oder Mehrfachbilder erzeugte. Die Ein-Bild-Regel verbietet Collagen, Raster,
  Mehrfachansichten und Varianten. Bilder werden deshalb artweise im vorhandenen ChatGPT-Zugang erzeugt und als PNG,
  JPEG oder WebP wieder
  in die App geladen. Der Server prueft Magic Bytes, mindestens 800x1000 Pixel und 4:5; FFmpeg vereinheitlicht die
  Vorschau auf `1280x1600` WebP. Bei bestehenden Arten fuehrt `Artporträt übernehmen` nach manueller Art- und
  Anatomiepruefung Speichern und Backup lokal aus; veroeffentlicht wird gesammelt ueber `Änderungen übertragen`.
  Beim optionalen Sofortportrait einer neu
  angelegten Art wird ein geprueftes Portrait im Neue-Art-Assistenten ohne zusaetzliche Electron-Bestaetigung lokal
  uebernommen und anschließend mit dem gezielten Pipeline-Lauf veroeffentlicht. Fehlende Portraets sind regulaere
  Assetprobleme: Gesamtvalidierung und Datenbankstatus werden rot, das Assetdashboard nennt die genaue Fehlanzahl,
  und betroffene Arten tragen die Listenmarkierung `P` und sind ueber den Hinweisfilter auffindbar. Der normale
  Datenpipeline-Lauf erzeugt weiterhin keine Portraets; sie werden nur artweise im Bearbeitungsdialog gepflegt.
  Explorer-Tests decken Prompt, Dateipruefung, Konvertierung, Speicherung, Hashpruefung und die entfernte
  Sammelroute ab. Der Neue-Art-Dialog kann seit 2026-06-27 aus den eingegebenen neuen Artdaten einen Einzelprompt
  erzeugen und ein optional sofort erzeugtes Bild nach der Artanlage pruefen und uebernehmen. Der erste produktive
  Import fuer `Alpenbirkenzeisig` wurde am 2026-06-21 gespeichert, committed und gepusht.
  Der Detailbereich behaelt mit und ohne Portrait dieselbe Medienhoehe; das vollstaendige 4:5-Bild wird innerhalb
  dieser Flaeche eingepasst und nur in der Lightbox vergroessert. Die feste Medienzeile beruecksichtigt Titel,
  Inhalt und beide aeusseren Rahmenkanten, damit die untere Border nicht abgeschnitten wird. Die weitere
  Portraitbefuellung und Squarespace-Ausgabe sind Betriebs- beziehungsweise spaetere Ausbauschritte und blockieren
  den Abschluss der lokalen Assetverwaltung nicht. Details: `docs/portrait-generation.md`.
  Phase 7.8 wurde am 2026-06-28 abgeschlossen und von Felix erfolgreich getestet. `npm.cmd run species:desktop` startet den
  bestehenden Explorer-Server im Electron-Hauptprozess, wartet auf `/api/summary` und zeigt die bestehende
  Oberflaeche im eigenen App-Fenster. Chrome und das manuelle Oeffnen von `127.0.0.1:4177` entfallen im
  Normalbetrieb; `npm.cmd run species:explorer` bleibt fuer Debugging verfuegbar. Umgesetzt sind
  Single-Instance-Schutz, Fallback auf freien Port bei belegtem 4177, externe Links im Standardbrowser,
  Server-Neustart bei Startfehlern und eine Schliessabfrage bei laufendem Pipeline-/Asset-Pruefschritt.
  `npm.cmd run species:desktop:shortcut` erstellt eine Desktop-Verknuepfung, die per `wscript.exe` den versteckten
  Launcher `species-explorer/desktop/start-explorer.vbs` nutzt. Dadurch startet die App per Doppelklick ohne
  dauerhaft sichtbares PowerShell-Fenster. Der Desktop-Lifecycle ist im Explorer-Test abgedeckt;
  `npm.cmd run --silent test:explorer` umfasst jetzt 19 Tests.
  Details: `docs/desktop-shell-plan.md`. NAS/Backup und Mehrgeraete-Lock sind fuer Phase 11 vorgesehen.
  Vor der damaligen Mehrgerätevorplanung wurde am 2026-06-28 ein nicht-destruktiver Projektkonsolidierungs-Audit
  gestartet:
  `docs/project-consolidation-audit.md`. Ergebnis: kein kritischer Blocker; Bereinigungskandidaten sind `Testlauf/`,
  `errors.log` und ein alter `species-explorer/pipeline-asset-backups/`-Lauf. Strukturkandidaten waren die
  Dependency `node-fetch`, Log-/Temp-Retention und das spaetere FFmpeg-/Installer-Konzept.
  Nach Felix' Freigabe wurden `Testlauf/`, `errors.log` und `species-explorer/pipeline-asset-backups/` geloescht.
  `node-fetch` wurde aus `package.json` und `package-lock.json` entfernt; ein danach gefundener Pipeline-Importfehler
  wurde durch Umstellung von `update.mjs` auf natives Node-`fetch` korrigiert. Node.js 18 oder neuer ist damit
  Voraussetzung. Tests, JS-/MJS-Syntax und lokaler Site-Audit sind danach erfolgreich.
  Karten-, Sound-/Credits-, Spektrogramm- und Portraitpfade sind durch Vorschau-, Validierungs-, Backup-, Hash-,
  Commit- und Push-Tests abgedeckt. Felix hat die Asset- und Detailoberflaeche zum Abschluss von Phase 7.7
  akzeptiert; ein unnoetiger Austausch eines bereits gueltigen Sounds ist kein offener Abschlussblocker.
  Seit 2026-07-04 ist die Neue-Art-Karte im Assistenten vergroesserbar, der Lizenzstatus `frei`/`NC` wird im
  Neue-Art-Soundcheck und im Tierstimmen-Quellenbereich angezeigt und der Hintergrund im Neue-Art-Assistenten bleibt
  bis zum Abschluss stabil. Seit 2026-07-04 koennen Verbreitungskarte, Soundpaket und Artportrait einzeln aus der
  Artbearbeitung geloescht werden. Vor dem Loeschen wird unter `species-explorer/asset-backups/` gesichert; Karten-
  Overrides und Kartendokumentation werden synchron entfernt, beim Soundpaket bleiben bereits gemerkte
  `sound.rejectedSources` erhalten. Seit 2026-07-10 bleibt pro Art und Assettyp genau eine letzte Sicherung mit
  Originaldateinamen und `backup.json` erhalten; erneutes Loeschen oder Ersetzen ueberschreibt diese Sicherung.
  Vorhandene Sicherungen koennen direkt in der Asset-Kopfzeile per `Wiederherstellen` zurueckkopiert werden, ohne
  Sicherung ist der Button deaktiviert. Die Loeschung oder Wiederherstellung bleibt lokal offen und wird ueber
  `Änderungen übertragen` veroeffentlicht. Soundvergleichsdialoge stoppen andere offene Audioplayer, sobald ein
  neuer Player gestartet wird. Seit 2026-07-05 ist auch das Umbenennen des deutschen Artnamens inklusive Assetname/SafeName,
  Ordner, Override-Eintraegen, Assessment-Zuordnung, Report und Dokumentation umgesetzt.
  Seit 2026-07-11 sind die Taxonomiewerte fuer Reich, Stamm, Klasse, Ordnung und Familie in bestehenden Daten
  normalisiert; `update.mjs` schreibt auch kuenftige IUCN-Daten in lesbarer Gross-/Kleinschreibung. Das einmalige
  Migrationsskript sichert `speciesData.json` vorher unter `species-explorer/backups/`.
  Die anschliessenden Phase-8-Schritte sind seit 2026-07-18 umgesetzt: Die Taxonomie-Pyramide verwendet deutsche
  Anzeigenamen und zeigt einen Unterstamm nur aus einem tatsaechlich vorhandenen Datenwert. Fehlende optionale
  Unterstämme werden seit 2026-07-25 im gemeinsamen Pipeline-/Bearbeitungsschreibpfad vollständig aus
  `speciesData.json` entfernt; leere Zeichenfolgen bleiben ausschließlich in internen Formular- und
  Override-Strukturen zulässig. Das Artportrait ist in
  das responsive Squarespace-Artseitenlayout integriert; Status und Trend stehen auf Desktop direkt unter den
  allgemeinen Daten.
  Die Assetformulare wurden am 2026-06-21 kompakter ausgerichtet: Karten- und MP3-Dateieingabe haben dieselbe
  intrinsische Hoehe. Der Pflegegrund spannt auf Desktop exakt ueber zwei linke Feldzeilen. Im Soundformular stehen
  Quelle neben Original-URL, Lizenz neben Land und Ort neben Qualitaet; Notizen bleiben ueber beide Spalten.
  Auf schmalen Ansichten werden alle Felder weiterhin einspaltig dargestellt.
  Phase 9 `Globale Taxonomiedatenbank` ist seit 2026-08-09 vollständig abgeschlossen. Der erweiterte reale
  Masterneuaufbau, Aktivierung, Rollback, Betriebstest und das davon getrennte umfassende Abschlussaudit sind
  bestanden, siehe `docs/global-taxonomy-lightroom-plan.md` und
  `docs/audits/2026-08-phase-9-closing-audit.md`.
  Phase 9.1 ist abgeschlossen; die verbindliche Quellenentscheidung steht in `docs/taxonomy-source-decision.md`.
  Catalogue of Life XR ist der vollständige Primärbestand. Ein breiter iNaturalist-Ausschnitt ergänzt fehlende
  Namen und CoL-Artlücken offline; GBIF ergänzt Namen und Kennungen, WoRMS marine und brackische Taxa und Wikidata
  deutsche beziehungsweise englische Namen sowie externe IDs. Danach verbleibende belegte Tierlücken können
  kontrolliert aus Animalia ergänzt werden. Eigene Korrekturen besitzen Vorrang. `species_list.json` und
  `speciesData.json` bleiben die bestätigte produktive Datenbasis.
  Die große Referenzdatenbank darf weder in Git noch in das GitHub-Pages-Artefakt gelangen und bestehende Arten
  nicht still verändern. Phase 9.2 ist seit 2026-07-23 abgeschlossen; der verbindliche Entwurf steht in
  `docs/local-taxonomy-database-design.md`. Vorgesehen sind SQLite über `node:sqlite`, ein pfadunabhängiger lokaler
  Release-/Stagingspeicher, atomare Aktivierung, eine Rollbackversion, getrennte Projektzuordnungen sowie
  Präfix-/FTS5-Suche. Der spätere Neue-Art-Assistent erhält ein Reich-Dropdown mit `Tiere (Animalia)` als
  Vorauswahl und Vorschläge für deutsche, englische sowie wissenschaftliche Namen. Deutsche und englische
  Vernakularnamen werden als getrennte Projektfelder geführt. Fehlt ein bestätigter deutscher Name, kann ein
  vorhandener englischer Name übernommen werden, ohne das deutsche Feld still zu ersetzen; für Tiere bleibt
  zusätzlich eine gezielte manuelle Animalia.bio-Recherche vorgesehen.
  Automatisierter Abruf oder Scraping bleibt ausgeschlossen. Phase 9.3 ist seit 2026-07-23 abgeschlossen; der Mess- und
  Implementierungsbericht steht in `docs/taxonomy-import-prototype.md`. Eine kleine festgeschriebene
  CoL-XR-/WoRMS-Fixture bestätigt streamenden SQLite-Import, Quellenprovenienz, Präfix-/FTS5-Suche,
  Mehrdeutigkeiten, atomare Aktivierung und Rollback. Die Fixture liegt unter `scripts/fixtures/taxonomy/`; die
  erzeugte Referenzdatenbank bleibt lokal und ignoriert. `npm.cmd run --silent taxonomy:prototype -- --reset
  --json` führt den isolierten Prototyp unter `Testlauf/` aus, `npm.cmd run --silent test:taxonomy-prototype` die
  direkten Tests. Messwerte dieses begrenzten Bestands dürfen nicht linear auf den etwa 1,3 GB großen XR-Vollbestand
  hochgerechnet werden. Phase 9.4 ist seit 2026-07-24 abgeschlossen. Vier lokale read-only Endpunkte liefern
  Status, Reiche, Suche und Taxondetails aus dem aktiven Release. Der Neue-Art-Assistent bietet `Animalia` beim
  ersten Start als sichtbaren Standard und getrennte Vorschläge für drei Namensfelder. Ein bewusster Klick auf
  einen Treffer schließt die Ergebnisliste, übernimmt alle drei Namen direkt und zeigt Quellen- und
  Hierarchievorschau. Nur Taxa mit Rang `Art` werden im Formular angeboten; ohne lesbare Referenz bleibt die
  manuelle Eingabe vollständig nutzbar. Animalia.bio wird bei fehlendem belegtem deutschen Tiernamen ausschließlich
  als manueller Suchlink geöffnet. Der verbindliche Vertrag steht in
  `docs/taxonomy-explorer-integration.md`. Phase 9.5 ist seit 2026-07-26 technisch abgeschlossen. Der Explorer
  prüft beim Start nur die kleinen CoL-Release-Metadaten und lädt den vollständigen XR-Bestand erst nach Vorschau
  und ausdrücklicher Bestätigung. Download, sichere Extraktion, streamender SQLite-Import, Suchindex,
  Qualitätsgate, Fortschritt, Projektartenabgleich, atomare Aktivierung und Rollback sind umgesetzt. Eindeutige
  Synonyme erzeugen nur Vorschläge; mehrdeutige oder fehlende Treffer bleiben manuell. Bestehende Namen, Slugs,
  Assets und Projektdateien werden niemals automatisch verändert. Die lokale SQLite-Referenz enthält Taxa,
  Hierarchie und vorhandene Zwischenränge, wissenschaftliche Namen und Synonyme, gebräuchliche Namen soweit im
  Release geliefert, darunter getrennt erkannte deutsche und englische Namen, externe Kennungen sowie Quellen- und
  Releaseprovenienz; Projektfachdaten und Assets bleiben
  getrennt. Der erste echte Vollimportversuch lud das Archiv vollständig, wurde aber vor dem Import am anfänglich
  zu knappen Limit von 20.000 Archiveinträgen sicher beendet. Entpacken und nachgelagerte Paketprüfung verwenden
  nun dieselbe Grenze von 50.000 Dateien und decken die realen 21.100 Einträge mit Reserve ab; Größen-,
  Kompressions-, Verschachtelungs- und Dateitypgrenzen bleiben zusätzlich erhalten. Eine Teilreferenz wurde nicht
  aktiviert. Der zweite reale Versuch erreichte die Paketprüfung und zeigte, dass der aktuelle XR-Export seine
  ColDP-1.2-Spalten mit `col:` beziehungsweise `clb:` qualifiziert. Paketvalidator und TSV-Iterator normalisieren
  diese offiziellen Namensräume jetzt gemeinsam; unpräfixierte Fixtures bleiben kompatibel. Der dritte reale Versuch
  erreichte den Import der optionalen gebräuchlichen Namen und fand mindestens eine Quellzeile, deren `taxonID`
  im selben XR-Release nicht existiert. Einzelne solche verwaisten Namen werden jetzt ohne Ersatzzuordnung gezählt
  und sicher übersprungen. Nach dem realen Befund von 12.294 nicht zuordenbaren Verweisen unter
  1.996.915 Namenszeilen gilt eine skalierende Grenze von 25 Zeilen Grundtoleranz, bei größeren Dateien einem
  Prozent der Quelldatei und absolut höchstens 100.000; größere Abweichungen blockieren das Paket weiterhin.
  Deutsche und englische Namen gültiger Taxa bleiben getrennt verfügbar. Ein später verfügbarer deutscher Name
  ändert bestehende Projektarten niemals still. Die
  Abschlussbestätigung nennt die Zahl transparent. Fehlt die lokale
  Referenz oder ist sie veraltet, bietet der Explorer die Aktualisierung nach der
  Startprüfung einmalig direkt an; `Später` hält die manuelle Wartungsaktion verfügbar. Technische Importfehler
  werden ohne Stacktrace als verständlicher Grund angezeigt. Nach einer erfolgreichen Aktivierung bleiben Release
  und Importzähler sichtbar und ein einmaliges Bestätigungsfenster meldet die erfolgreiche Übernahme. Der
  verbindliche Konflikt- und Betriebsvertrag steht in `docs/taxonomy-reference-update.md`. Der erneute echte
  Vollimport bleibt ein bewusst gestarteter lokaler Betriebstest.
  Seit 2026-07-30 bestand zunächst eine getrennte Namensschicht. Seit 2026-08-08 wird sie in die verbindliche,
  physisch getrennte Masterdatenbank überführt. Lokal versioniert werden CoL XR, ein breiter iNaturalist-Namens-
  und Artlückenausschnitt, relevante GBIF-, WoRMS- und Wikidata-Ausschnitte, kontrollierte Animalia-Fälle und
  eigene Korrekturen. Die vollständige CoL-SQLite bleibt unverändert und read-only. Stabile
  anbieterunabhängige Taxon-IDs verbinden Taxon-, Namens- und Feldaussagen, Konflikte sowie stabile
  Projekt-Slug-Verknüpfungen. Updates werden zuerst als Kandidat aufgebaut und erst nach Prüfung atomar aktiviert;
  die vorherige Version bleibt als Rollback erhalten. Die Explorer-Suche bevorzugt die aktive Masteransicht und
  bleibt für alle lokal enthaltenen Einträge offline. Die reale CoL-Lücke `Sciurus vulgaris`, Homonyme, Synonyme,
  Anbieter-Ausfälle, verschwundene Quellen, doppelte Anbieterzeilen und unterbrochene Aktivierungen sind als
  Regressionen festgeschrieben. Das Audit `docs/audits/2026-08-phase-9-audit.md` dokumentiert nur den früheren
  kleinen Ausgangsbestand. Der maßgebliche reale Abschluss steht in
  `docs/audits/2026-08-phase-9-closing-audit.md`: 273.505 Master-Taxa, 7.108.393 Suchbegriffe, 54 von 54 verknüpfte
  Projektarten, bestandene Offline-Suche und praktisch verifizierter Rollback. Atomare Taxonomie-Zeiger- und
  Versionscache-Schreibvorgänge sind je Zieldatei serialisiert und verwenden kollisionsfreie temporäre Dateien;
  der reale Explorer-Start im freigegebenen AppData-Pfad wurde ohne gespeicherten Prüfungsfehler verifiziert.
  Phase 10 mit Lightroom ist der
  nächste große Schritt.
  Phase 11 wurde am 2026-06-28 unter einer frueheren Nummerierung gestartet, siehe
  `docs/multi-device-backup-plan.md`. Beschlossen ist: GitHub bleibt
  zentrale versionierte Wahrheit, jeder Rechner arbeitet lokal in einem beliebigen Projektordner, das NAS dient als
  vollstaendiges ZIP-Restore-Backup und der Bearbeitungs-Lock liegt spaeter in einem separaten `app-lock`-Branch.
  `restore-start.cmd` ist der erste technische Baustein: Nach dem Entpacken eines NAS-Backups prueft das Skript
  Node.js 18+, richtet die Desktop-Verknuepfung ein und startet die App. Als NAS-Zielpfad wurde
  `W:\Website Datenbank Backup` festgelegt. Der Backup-Kern ist als `scripts/nas-backup.ps1` mit
  `npm.cmd run backup:nas:dry-run` und `npm.cmd run backup:nas` vorbereitet. In der Desktop-App ist
  `NAS-Backup erstellen` als manuelle Wartungsaktion im Datenbank-Dialog eingebunden: Vorschau mit Zielpfad,
  Umfang und Rotation, Start per Klick, Fortschritt in Prozent, Prozessausgabe, Abschlussmeldung und
  Schliesswarnung bei laufendem Backup. Der lokale Zielpfad kann ueber `Backup-Pfad einstellen` geaendert werden;
  die rechnerabhaengige Einstellung liegt ignoriert in `species-explorer/local-settings.json`.
  Vor dem Taxonomie-Redesign wurde am 2026-07-11 ein vollstaendiger Repository-, Code-, Daten-, Datei-,
  Dokumentations-, Test- und CI-Audit abgeschlossen: `docs/audits/2026-07-repository-audit.md`. Die Datenbasis ist
  konsistent. Der Audio-P0-Punkt wurde am 2026-07-12 abgeschlossen:
  `scripts/audio-format.mjs` prueft automatische Downloads, Uploads und Wiederherstellungen zentral, zwoelf
  WAV/PCM-Bestandsdateien wurden ruecksetzbar nach MP3 migriert und ihre Spektrogramme sowie Sound-Hashes neu
  erzeugt. Alle 48 vorhandenen Tierstimmen sind nun echte MP3-Dateien; das Pages-Artefakt sank von rund 229,9 auf
  89,86 MiB. Details: `docs/audio-format-validation.md`. Der zweite P0-Stabilisierungspunkt wurde am selben Tag
  umgesetzt:
  `scripts/validate-media-assets.mjs` prüft die tatsächlichen Formate und Abmessungen von Karten, Portraits,
  Spektrogrammen und PNG-Grafiken sowie MP3- und Credits-Pakete. Einzelgrenzen je Asset und Artpaket erkennen
  Ausreisser; das Pages-Gesamtbudget wächst ohne manuellen Eingriff mit 12 MiB Grundbedarf plus 2,5 MiB je Art und
  besitzt ein 500-MiB-Notfalllimit. Aktuell stehen 89,86 MiB einem Budget von 134,5 MiB gegenüber; Details:
  `docs/media-asset-validation.md`. Der dritte P0-Stabilisierungspunkt wurde am selben Tag abgeschlossen: Alle
  schreibenden localhost-Routen verlangen ein pro Serverstart neues Sitzungstoken und werden zentral auf lokalen
  Host, Same-Origin, Fetch-Site und JSON-Content-Type geprüft. Asset-Löschen und -Wiederherstellen verwenden
  zusätzliche Einmaltokens, Karten-URLs werden einschließlich Weiterleitungen nach DNS-Auflösung gegen lokale und
  private Ziele geprüft und Dateipfade nutzen echte Verzeichnisgrenzen. 24 Explorer- und 3 dedizierte
  Sicherheitstests bestehen; Details: `docs/explorer-api-security.md`. Der vierte P0-Stabilisierungspunkt wurde am
  2026-07-13 abgeschlossen: Der getrennte GitHub-Actions-Job `Quality checks` führt `npm ci`, einen parserbasierten
  Syntaxcheck, den gemeinsamen `npm test`-Einstieg, Audio-/Medienvalidierung sowie Projekt- und lokalen Datenaudit
  aus. Der Pages-Build hängt davon ab und vergleicht `_site/` anschließend exakt mit einer zentralen öffentlichen
  Dateifreigabe; Designquellen, Sicherungen und unbekannte Assetdateien werden abgewiesen. Der aktuelle Stand umfasst
  364 öffentliche Dateien mit 89,72 MiB. Details: `docs/ci-quality-gate.md`. Die anschließende
  Dokumentationskonsolidierung verwendet `docs/project-status.md` als einzige aktuelle Zählerquelle und ist unter
  `docs/documentation-lifecycle.md` verbindlich geregelt. Die zentrale Temp-Retention
  `species-explorer/temp-retention.mjs` bereinigt eindeutig verwaltete, abgelaufene Dateien beim Start und nach
  Pipeline-Läufen sowie alle verwalteten Laufzeitreste beim kontrollierten Explorer-Schließen. Neue temporäre
  Ablagen müssen von Anfang an Eigentümerschaft, Lebenszyklus, Sperrverhalten, Aufbewahrungsgrenze und Tests
  definieren; Details: `docs/temp-retention.md`.
  `.gitattributes` ist die verbindliche Zeilenendenregel: LF für plattformunabhängige Quell-, Daten- und
  Dokumentdateien, CRLF für Windows-Start-/Wartungsskripte und keine Textkonvertierung für Binärformate.
  Stabilisierungspaket B wurde mit dem beim ersten Versuch erfolgreichen GitHub-Actions-Lauf `29265285193` und
  einem fehlerfreien Live-Audit über 120 Squarespace-Sitemapseiten abgeschlossen.
  Der fünfte P0-Stabilisierungspunkt wurde am 2026-07-13 abgeschlossen: 37 Syntaxprüfungen, 38 automatisierte Tests,
  49 Arten und 263 Medien bestanden lokal; der vollständige Live-Audit erreichte 120 Squarespace-Sitemapseiten ohne
  Abruf- oder HTTP-Fehler und bestätigte die geprüften GitHub-Pages-Dateien. GitHub-Actions-Lauf `29258080649`
  bestand Quality, Artefaktbau und Pages-Deployment beim ersten Versuch. Stabilisierungspaket A ist abgeschlossen.
  Auditpunkt A4 wird seit 2026-07-13 in kleinen, verhaltensneutralen Modulschnitten bearbeitet. Der erste Schnitt
  verschiebt Asset-Sicherungen, Sicherungsmetadaten und die Aufbewahrung von Asset-, Eingabelisten- und Pipeline-
  Sicherungen nach `species-explorer/asset-backups.mjs`. Der zweite Schnitt verschiebt Felddefinitionen,
  Namensnormalisierung, Artenvalidierung, Kollisionspruefungen, Bearbeitungsdiffs und Reportvergleiche nach
  `species-explorer/species-model.mjs`. Der dritte Schnitt verschiebt JSON-Anfragegrenzen, HTTP-Antworten, sichere
  öffentliche/Asset-/Grafikpfade, MIME-Typen, Byte-Range-Dateiauslieferung und aktive Dateistreams nach
  `species-explorer/http-routing.mjs`. Der vierte Schnitt verschiebt Methoden-/Pfadzuordnung, Sitzungs- und
  Schreibgrenze, Body-Limit-Auswahl, Fehlerantworten und die Entscheidung über lokale Dateiauslieferung nach
  `species-explorer/request-router.mjs`. Die Neue-Art-Route `portrait-preview` ist dort explizit und getrennt von
  der allgemeinen Artenvorschau getestet. Siebzehn direkte Modultests ergänzen die 24 Explorer-Integrationsprüfungen;
  der gemeinsame Testeinstieg umfasst 59 Tests. `species-explorer/server.mjs` sank dabei von 6.557 auf 5.654 Zeilen.
  HTTP-Basis und Routenzuordnung sind getrennt. Der fünfte A4-Schnitt extrahiert mit
  `species-explorer/public/app-foundation.js` die Zustandsinitialisierung, den Sitzungstoken, geschützte
  JSON-Anfragen, das gemeinsame Explorer-Datenpaket und die Revisionsabfrage aus `public/app.js`. Vier direkte
  Frontend-Grundlagentests ergänzen den Testeinstieg auf 63 Tests; `app.js` sank von 5.688 auf 5.583 Zeilen. A4
  bleibt offen, bis weitere fachliche Oberflächenbereiche schrittweise modularisiert sind. Der sechste A4-Schnitt
  führt `species-explorer/public/app-presentation.js` als reine Anzeigegrenze ein: HTML-/URL-Sicherheit,
  Größen-, Datums-, IUCN-, Asset- und Lizenzformatierung, Datenzeilen sowie versionsbasierte Medien-URLs liegen
  nicht mehr im Oberflächenmonolithen. Fünf direkte Präsentationstests erhöhen den gemeinsamen Testeinstieg auf
  68 Tests; `app.js` sank weiter auf 5.389 Zeilen. Das Modul wird lokal vor `app.js` geladen. Squarespace-JavaScript,
  Footer-Versionen und Squarespace-CSS wurden in diesem Schnitt nicht geändert. Der siebte A4-Schnitt führt
  `species-explorer/public/app-measurements.js` als zustandsfreie Messwertgrenze ein. Größe, Gewicht und
  Lebenserwartung werden in Neue-Art-Assistent und Bearbeitungsdialog nun mit denselben Einheiten-, Parsing-,
  Singular-/Plural-, Formatierungs- und Formularhelfern verarbeitet; die doppelte Neue-Art-Logik wurde entfernt.
  Fünf direkte Messwerttests erhöhen den gemeinsamen Testeinstieg auf 73 Tests; `app.js` sank weiter auf 5.241
  Zeilen. Die Tests sichern auch die längenbasierte Einheitenerkennung ab, damit `kg` bei ebenfalls erlaubtem `g`
  vollständig entfernt wird. Das lokale HTML lädt Foundation, Presentation und Measurements in dieser Reihenfolge
  vor `app.js`. Der achte A4-Schnitt ergänzt `species-explorer/public/app-dialogs.js` als gemeinsame Grenze für
  modales Öffnen/Schließen, sichere Hintergrundklicks, Escape- und Busy-Sperren, Körperklassen sowie das Freigeben
  von Medienquellen. Fünf direkte Dialogtests erhöhen den gemeinsamen Testeinstieg auf 78 Tests; `app.js` sank auf
  5.159 Zeilen. Das lokale HTML lädt Dialogs nach Measurements und vor `app.js`. Squarespace-JavaScript,
  Footer-Versionen und Squarespace-CSS wurden nicht geändert. Der neunte A4-Schnitt ergänzt
  `species-explorer/public/app-media.js` als Mediengrenze für Karten- und Portraitdarstellung, die gemeinsamen
  Bereichsaktionen, den Explorer-Audioplayer und die Karten-/Portrait-Lightbox. Sechs direkte Medientests erhöhen
  den gemeinsamen Testeinstieg auf 84 Tests; `app.js` sank auf 4.936 Zeilen. Das lokale HTML lädt Media nach
  Dialogs und vor `app.js`. Ein realer lokaler Browsertest bestätigte Datenladung, Medienaktionen und beide
  Lightboxen. Squarespace-JavaScript, Footer-Versionen und Squarespace-CSS wurden nicht geändert.
  Der zehnte A4-Schnitt ergänzt `species-explorer/public/app-asset-review.js` als fachliche Grenze für den
  Karten-/Soundvergleich nach Pipeline-Läufen. Sicheres Vergleichs-Markup, Entscheidungstexte, Karten-Lightbox,
  Spektrogramm-Scrubbing, Fortschrittsmarker und Medienfreigabe liegen nicht mehr in `app.js`; Pipelinezustand,
  API-Aufrufe, Folgesuche und Speichern verbleiben dort. Fünf direkte Assetprüftests erhöhen den gemeinsamen
  Testeinstieg auf 89 Tests; `app.js` sank auf 4.760 Zeilen. Das lokale HTML lädt Asset Review nach Media und vor
  `app.js`. Ein realer lokaler Browsertest bestätigte 49 geladene Arten ohne Konsolenfehler. Squarespace-
  JavaScript, Footer-Versionen und Squarespace-CSS wurden nicht geändert.
  Der elfte A4-Schnitt ergänzt `species-explorer/public/app-pipeline.js` als Präsentationsgrenze für
  Modusbezeichnungen, Datenbankstatus, Pipeline-/Backupmeldungen, sichere Aktionsvorschauen und die automatisch
  nachgeführte Prozessausgabe. API-Aufrufe, Laufsteuerung und Zustand verbleiben in `app.js`. Sieben direkte
  Pipeline-Anzeigetests erhöhen den gemeinsamen Testeinstieg auf 96 Tests; `app.js` sank auf 4.598 Zeilen. Das
  lokale HTML lädt das Modul nach Asset Review und vor `app.js`; ein lokaler HTTP-Smoke-Test bestätigte
  Hauptseite, Modulreferenz und Export. Squarespace-JavaScript, Footer-Versionen und Squarespace-CSS wurden nicht
  geändert.
  Der zwölfte A4-Schnitt ergänzt `species-explorer/public/app-dashboard.js` als gemeinsame Grenze für
  Zusammenfassung, Validierungsdarstellung, Statusfilter und Artenliste. Status-, Trend-, Asset- und Pflegehinweise
  werden als unveränderliche Präsentationsmodelle erzeugt; der Dashboardcontroller rendert Filter und Artenliste,
  hält deren Scrollposition und delegiert die Artauswahl zurück an `app.js`. Sechs direkte Dashboardtests erhöhen
  den gemeinsamen Testeinstieg auf 102 Tests; `app.js` sank auf 4.398 Zeilen. Das lokale HTML lädt das Modul nach
  `filter.js` und vor `app.js`; ein echter lokaler HTTP-Smoke-Test bestätigte Hauptseite, Modulreferenz und Export
  jeweils mit HTTP 200. Squarespace-JavaScript, Footer-Versionen und Squarespace-CSS wurden nicht geändert.
  Der dreizehnte A4-Schnitt ergänzt `species-explorer/public/app-settings.js` als geschlossene Grenze für den
  lokalen Backup-Pfad-Einstellungsdialog. Das Modul lädt und normalisiert die lokale Einstellung, steuert
  Standardpfad, Statusmeldungen und Speichern und hält die API-Aufrufe hinter einem injizierten `fetchJson`.
  Vier direkte Einstellungstests erhöhen den gemeinsamen Testeinstieg auf 107 Tests; `app.js` sank von 4.408 auf
  4.334 Zeilen. Das lokale HTML lädt das Modul nach `app-dialogs.js` und vor `app-media.js`; der Explorer-Smoke-Test
  prüft Auslieferung, Reihenfolge und Export. Squarespace-JavaScript, Footer-Versionen und Squarespace-CSS wurden
  nicht geändert.
  Der vierzehnte A4-Schnitt ergänzt `species-explorer/public/app-species-actions.js` als fachliche Grenze für
  `Art aktualisieren` und das kontrollierte Entfernen beziehungsweise dauerhafte Löschen einer Art. Bestätigungs-,
  Vorschau-, Löschmodus- und Erfolgstexte sowie die Ereignissteuerung liegen im neuen Controller; Pipelineaufruf,
  API-Client, Dialoggrundlage, Medienfreigabe und erneutes Datenladen werden injiziert. Fünf direkte Tests erhöhen
  den gemeinsamen Testeinstieg auf 112 Tests; `app.js` sank von 4.334 auf 4.193 Zeilen. Das lokale HTML lädt das
  Modul nach `app-dashboard.js` und vor `app.js`; Explorer-Smoke-Tests prüfen Auslieferung, Reihenfolge und Export.
  Squarespace-JavaScript, Footer-Versionen und Squarespace-CSS wurden nicht geändert.
  Der fünfzehnte A4-Schnitt ergänzt `species-explorer/public/app-lifecycle.js` als gemeinsame Grenze für
  Bearbeitungsmodus, Explorer-Schnappschüsse, initiale Artauswahl, Revisionsüberwachung und die Schließwarnung bei
  offenen Änderungen. Dashboard-Aktualisierungen und Artauswahl werden injiziert; Pipeline-, Assistenten- und
  Bearbeitungsfachlogik bleiben unverändert. Sieben direkte Lebenszyklustests erhöhen den gemeinsamen Testeinstieg
  auf 119 Tests; `app.js` sank von 4.193 auf 4.107 Zeilen. Das lokale HTML lädt das Modul nach
  `app-dashboard.js` und vor `app-species-actions.js`; Explorer-Smoke-Tests prüfen Auslieferung, Reihenfolge und
  Export. Squarespace-JavaScript, Footer-Versionen und Squarespace-CSS wurden nicht geändert.
  Der sechzehnte A4-Schnitt ergänzt `species-explorer/public/app-asset-maintenance.js` als geschlossene Grenze für
  das Löschen und Wiederherstellen einzelner Karten-, Portrait- und Soundpakete im Art-Bearbeitungsdialog. Die
  gemeinsame Bestätigung, Medienfreigabe, Sicherungs-API, Erfolgsmeldung, Fehlerfreigabe und Datenneuladung liegen
  im neuen Controller; die bereichsspezifische Anzeige wird injiziert. Sechs direkte Asset-Wartungstests erhöhen
  den gemeinsamen Testeinstieg auf 125 Tests; `app.js` sank von 4.107 auf 4.007 Zeilen. Das lokale HTML lädt das
  Modul nach `app-species-actions.js` und vor `app.js`; Explorer-Smoke-Tests prüfen Auslieferung, Reihenfolge und
  Export. Squarespace-JavaScript, Footer-Versionen und Squarespace-CSS wurden nicht geändert.
  Die A4-Schnitte 17 bis 24 wurden am 2026-07-17 in einem kontrollierten Sammellauf umgesetzt. Acht neue, jeweils
  direkt getestete Browsermodule trennen weitere klar abgegrenzte Aufgaben aus `public/app.js`:
  `app-editor-files.js` (Datei-/Metadatenvorbereitung), `app-confirmation.js` (Bestätigungsdialog),
  `app-detail-media.js` (Detail-Lightboxen und Audiofreigabe), `app-selection.js` (Artauswahl und Scrollzustand),
  `app-asset-review-workflow.js` (Assetprüfablauf), `app-form-feedback.js` (Formularmeldungen und Feldfehler),
  `app-new-species-form.js` (Werteaufbau/Validierung des Neue-Art-Assistenten) und `app-editor-form.js`
  (Werteaufbau/Validierung der allgemeinen Artbearbeitung). 45 direkte Tests erhöhen den gemeinsamen Testeinstieg
  von 125 auf 170 Tests; `app.js` sank von 4.007 auf 3.504 Zeilen. Das lokale HTML lädt alle Abhängigkeiten in
  expliziter Reihenfolge, der Explorer-Integrationstest prüft Auslieferung, Export und Moduleigentümer und bestand
  mit 24 von 24 Prüfungen. Squarespace-JavaScript, Footer-Versionen und Squarespace-CSS blieben unverändert.
  Die Oberflächenschnitte 25 bis 33 schließen am 2026-07-17 die unter Auditpunkt A4 geplante Explorer-
  Oberflächenzerlegung ab. `app-pipeline-workflow.js`, `app-backup-workflow.js`,
  `app-new-species-workflow.js`, `app-species-editor.js`, die vier Teil-Editoren `app-editor-general.js`,
  `app-editor-map.js`, `app-editor-sound.js`, `app-editor-portrait.js` sowie `app-detail-view.js` übernehmen
  Pipeline-, Backup-, Neue-Art-, Bearbeitungs- und Detailabläufe. Der Datenbankstatus liegt im Dashboardmodul; der
  Assetprüfablauf wird ohne lokale Zwischenhülle direkt verdrahtet. `public/app.js` sank dadurch von 3.504 auf 509
  Zeilen und ist nur noch Kompositionswurzel. Vier neue Architekturtests sichern Exporte, Zuständigkeiten,
  Ladereihenfolge und die Größenbegrenzung der Verdrahtungsdatei; der Explorer-Integrationstest prüft zusätzlich
  die HTTP-Auslieferung aller neuen Module und bestand mit 24 von 24 Prüfungen. Die Oberflächenhälfte von A4 ist
  damit abgeschlossen. Eine spätere Server-/Pipeline-Zerlegung bleibt getrennt davon möglich. Squarespace-
  JavaScript, Footer-Versionen und Squarespace-CSS wurden nicht geändert.
  Der erste nachgelagerte Serverschnitt wurde am 2026-07-18 abgeschlossen. `explorer-model.mjs` besitzt den
  vollständigen Explorer-Modellaufbau und die Revision, `media-assets.mjs` Medienprüfung und Kartenimport,
  `pipeline-log.mjs` die Spektrogramm-Prozessausgabe, `manual-map-documentation.mjs` die Kartendokumentation und
  `asset-files.mjs` die kanonische Assetdateiliste. `server-test-fixtures.mjs` stellt gemeinsame binäre Fixtures
  bereit; direkte Modell-, Log-, Dokumentations- und Medienprüfungen liegen nun neben ihren Eigentümermodulen.
  Zwölf direkte Tests und 21 verbleibende Serverintegrationstests sichern die Grenzen. Dabei wurde ein stiller
  Revisionsfehler behoben, durch den Änderungen an Art-Assets übersehen werden konnten. `server.mjs` sank von
  5.678 auf 4.408 Zeilen und `server.test.mjs` von 3.098 auf 2.842 Zeilen. A4 bleibt für weitere kleine Schnitte an
  CRUD-, Pipeline-, Backup-/Publikations- und Adapterlogik offen. Squarespace-JavaScript, Footer-Versionen und
  Squarespace-CSS wurden nicht geändert.
  Die fünf verbleibenden serverseitigen A4-Pakete wurden am 2026-07-18 einzeln ausgelagert und nach jedem Paket
  geprüft. `species-create.mjs`, `species-delete.mjs` und `species-edit.mjs` besitzen die CRUD-Abläufe.
  `map-asset-workflow.mjs`, `sound-asset-workflow.mjs`, `portrait-asset-workflow.mjs` und
  `asset-maintenance.mjs` besitzen die Medienabläufe. `pipeline-controller.mjs` kapselt Pipelineplanung,
  Laufzustand, Assetprüfung und Veröffentlichung; `project-publication.mjs` und `backup-service.mjs` trennen
  offene Änderungen, Git-Übertragung, Einstellungen und NAS-Sicherung. Der Oberflächen-/Quellvertrag liegt in
  `explorer-ui-contract.test.mjs`, die API-Integration weiterhin in `server.test.mjs`. `server.mjs` sank von 4.408
  auf 566 Zeilen, `server.test.mjs` auf 2.102 Zeilen; der UI-Vertrag umfasst 784 Zeilen. Alle 21 Explorer-Prüfungen
  bestanden nach dem Gesamtschnitt. Auditpunkt A4 ist damit abgeschlossen. Squarespace-JavaScript,
  Footer-Versionen und Squarespace-CSS wurden nicht geändert.
  Der technische Abschlusslauf vom 2026-07-18 trennt zusätzlich die externen IUCN-, Karten-, Xeno-Canto-,
  Wikimedia-Commons- und iNaturalist-Anbieter aus `update.mjs`, teilt die API-Integrationstests in vier fachliche
  Dateien und schließt A8 bis A11 mit enger Pages-Positivliste, Style-/Schema-Gates und flexiblem Größenbudget.
  Phase 7 ist damit abgeschlossen; vor Phase 8 bleibt kein technischer Audit-Blocker offen.
  Ein erneuter vollständiger Abschlussaudit vor Phase 8 bestätigte am 2026-07-18 Daten-, Report-, Medien-,
  Sicherheits- und Strukturkonsistenz. Die letzten dynamischen Alternativtexte in `species-status.js`,
  `map-loader.js` und `lightbox-zoom.js` sind umgesetzt und durch einen Qualitätsvertrag abgesichert; der
  dokumentierte Squarespace-Footer verwendet dafür `species-status.js?v=1.0.9`, `map-loader.js?v=1.0.8` und
  `lightbox-zoom.js?v=1.0.7`. Pipelinefehler liegen nicht mehr als unbegrenzter Root-Log vor, sondern begrenzt unter
  `species-explorer/logs/pipeline-errors.log`; der Desktop-Startlog wird pro Start überschrieben. Die getrennten
  Status-Icon-Sätze unter `graphics/catagory/` und `graphics/catagory/Alternativ/` werden von Explorer
  beziehungsweise Squarespace benötigt und bleiben an ihren Live-Pfaden. Details:
  `docs/audits/2026-07-pre-phase-8-audit.md`.
  Die im externen Abschlusscrawl zunächst noch nicht erreichbare Gepard-Seite
  `/wildlife/namibia/acinonyxjubatus` wurde anschließend in Squarespace live geschaltet und mit HTTP 200 sowie dem
  erwarteten Artinhalt nachgeprüft. Vor Phase 8 bleibt damit auch kein externer Link-Blocker offen.
- Phase 8 - Taxonomie-Pyramide und Funktionsausbau:
  abgeschlossen am 2026-07-22. Phase-8-Änderungen entstanden über die
  nur lesende lokale Squarespace-nahe Vorschau unter `127.0.0.1:4188` in Desktop-, Tablet- und Mobilbreite geprüft.
  Danach folgen eine nicht öffentlich verlinkte Squarespace-Testseite und die ausdrückliche Freigabe durch Felix;
  erst dann sind Übernahme nach `main`, erfolgreicher Pages-Lauf und produktive Footer-`?v=`-Erhöhung erlaubt.
  Details: `docs/phase-8-preview-release.md`. Die dynamische Taxonomie-Pyramide ist im Arbeitsbranch umgesetzt:
  vollständige farbige Rang-/Wertbalken mit generischen Inline-SVGs, inhaltsabhängiger Ausgangsbreite, konstanter
  stufenweiser Verjüngung und bündig ineinandergreifender Trapezform, ohne vertikalen Zwischenraum und mit einem
  nahtlosen anthrazit-schwarzen Pfeil über die gesamte Höhe. Auf Desktop und Tablet ist die kompakte Gesamtgruppe im
  vollbreiten Rahmen zentriert; mobil nutzt die erste Stufe die verfügbare Restbreite und der größtmögliche sichere
  Verjüngungsschritt hält alle Inhalte vollständig. Rangbezeichnung und Wert teilen in jeder Zeile eine gemeinsame
  typografische Grundlinie. Desktop und Tablet verwenden denselben dezenten Zehn-Pixel-Verjüngungsschritt und
  dieselbe weiche Rundung; mobil wird dieser Schritt bei Bedarf automatisch verkleinert. Anzeigenamen beginnen mit
  einem Großbuchstaben; bekannte Rohwerte werden zentral deutsch übersetzt. Ein echter `Subphylum`-Wert wird als
  `Unterstamm` angezeigt, fehlende Werte erzeugen keine Leerzeile. Sieben und acht Stufen sind automatisiert und in
  der lokalen Vorschau ohne horizontalen Überlauf geprüft. Felix hat den lokalen Endentwurf am 2026-07-18 in allen
  drei Vorschaugrößen visuell freigegeben. Der freigegebene Stand wurde nach `main` übernommen und der erste
  Pages-Lauf war erfolgreich. `species-taxonomy.js` lädt das zugehörige Taxonomie-CSS vor dem Rendern aus demselben
  kontrollierten Pages-Artefakt; dadurch gehen Markup und Gestaltung künftig atomar live. Die dokumentierte
  Footer-Version fuer den neuen Gesamtstand ist `species-taxonomy.js?v=1.0.8`; derselbe Cache-Schluessel wird fuer
  das dynamisch geladene Artseiten-CSS verwendet. Seit 2026-07-29 setzt jede Taxonomiestufe ihr Boxmodell explizit
  auf `border-box`; damit entsprechen die berechneten Außenbreiten auch unter dem Squarespace-Standardboxmodell
  exakt der lokalen Vorschau. Artportraits sind seit 2026-07-18
  ebenfalls in die Squarespace-Artseite integriert: Auf grossen Bildschirmen steht die Taxonomie links, Allgemeine
  Daten mit Status/Trend darunter in der Mitte und das Portrait ohne sichtbare Ueberschrift ueber die volle Hoehe
  rechts. Die Tierstimme steht unter den beiden linken Spalten. Der Taxonomierahmen endet buendig mit Status/Trend
  und zentriert die kompakte Einheit aus Pfeil und Pyramide vertikal. Der Pfeil beginnt und endet exakt mit den
  sichtbaren Taxonomiestufen und wird nicht auf die volle Rahmenhoehe gestreckt. Einheitliche sowie nach
  Maennchen/Weibchen getrennte Groessen- und
  Gewichtswerte nutzen eine gemeinsame Wertspalte und koennen unabhaengig voneinander wachsen. Tablet und Mobil
  stapeln die Bereiche; fehlt `portrait.webp`, bleibt die zweispaltige Ansicht ohne leeren Portraitbereich bestehen.
  `species-portrait.js` erzeugt den Portraitcontainer dynamisch und ordnet den vorhandenen Soundcontainer ein,
  sodass bestehende Artseiten keine manuelle HTML-Ergaenzung brauchen. Dokumentierte Footer-Versionen sind
  `species-core.js?v=1.0.5`, `species-info.js?v=1.0.8` und `species-portrait.js?v=1.0.1`.
  Seit 2026-07-22 kann der Explorer Reich, Stamm, optionalen Unterstamm, Klasse, Ordnung und Familie kontrolliert
  korrigieren. Ein Änderungsgrund, Vorschau-Token, Quell-Hashes und lokale Sicherung sind Pflicht. Manuelle Werte
  stehen getrennt in `species-taxonomy-overrides.json`, werden nach dem automatischen Datenabruf erneut angewendet
  und können auf die zuletzt bekannten automatischen Werte zurückgesetzt werden. Gattung und Art bleiben dem
  geschützten Workflow für wissenschaftliche Namensänderungen zugeordnet. Details:
  `docs/taxonomy-edit-workflow.md`.
  Der Phase-8-Soundeditor verarbeitet bis zu 20 frei gewählte Start-/Endabschnitte in der eingegebenen Reihenfolge.
  FFmpeg erzeugt eine geprüfte MP3-Vorschau; vor der Übernahme stehen bisheriger und bearbeiteter Sound zum direkten
  Vergleich bereit. Beim Speichern bleiben Quellen- und Lizenzdaten erhalten, das bisherige Soundpaket wird
  gesichert und das Spektrogramm aus der neuen MP3 neu erzeugt. Details: `docs/sound-editor.md`.
  Ein zweiter Start der Electron-Verknüpfung öffnet keine weitere Instanz, sondern stellt das vorhandene Fenster
  wieder her, blendet es bei Bedarf ein und fokussiert es. Der Abschlussstand wird durch direkte Unit-, API-, UI-
  und Desktop-Tests sowie das vollständige Qualitätsgate abgesichert.
- Phase 9 - Globale Taxonomiedatenbank:
  abgeschlossen am 2026-08-09. Phase 9.1 bis 9.12, der erweiterte reale Neuaufbau und das separate umfassende
  Abschlussaudit sind bestanden. CoL XR ist der vollständige Primärbestand. SQLite,
  lokaler Release-/Stagingaufbau, Schema, Provenienz, Suchindizes und Rollback sind entworfen und mit einem
  begrenzten reproduzierbaren Importprototyp bestätigt. Read-only API, konfigurierbare Reichsauswahl, getrennte
  Vorschläge für drei Namensfelder, Detailvorschau und kontrollierte Übernahme sind im Neue-Art-Assistenten
  getestet integriert. Der vollständige
  lokale Import- und Aktualisierungsworkflow prüft beim Start nur Metadaten, vergleicht bestehende Arten ohne
  automatische Änderungen und aktiviert neue Releases atomar mit Rollback. Seit 2026-07-28 liest der
  Neue-Art-Assistent den verfügbaren Referenzbestand korrekt aus dem verschachtelten Wartungsstatus. Deutscher,
  englischer und wissenschaftlicher Name besitzen eigene Such- und Pflichtfelder. Die Suche startet 500
  Millisekunden nach der letzten Eingabe; Ergebnisse bleiben in einer kompakten, überlagernden Trefferliste ohne
  springende Dialoghöhe. Über das Zahnrad wird lokal festgelegt, welche Reiche im Dropdown und in `Alle Reiche`
  berücksichtigt werden. Beim ersten Start ist nur `Tiere (Animalia)` sichtbar, kann aber ebenfalls abgewählt
  werden. `Alle Reiche` steht vor den alphabetisch sortierten sichtbaren Reichen. Deutsche und englische
  Eingabefelder fordern über explizite API-Sprachparameter nur die jeweilige Sprache an. Der
  Neue-Art-Assistent begrenzt die API-Abfrage bereits auf Rang `Art`, damit anderssprachige
  Trivialnamen, Gattungen und Unterarten keine falschen oder verdrängten Vorschläge erzeugen. Fehlende Artstufen
  mit vorhandenen Unterarten
  werden als CoL-Referenzlücke statt als unbekannte Art ausgewiesen und führen zu keiner automatischen Zuordnung.
  Der Wartungsbereich zeigt die aktive Referenz einmalig in der Überschrift und darunter nur die neueste
  verfügbare Version; manuell zu prüfende Arten beginnen in einer eigenen Zeile.
  Seit 2026-07-29 besitzt die Reichseinstellung zusätzlich eine Filtereingabe und eine kompakte, scrollbar
  begrenzte Liste mit Checkbox und Reichsname in derselben Zeile. Alle drei Namensfelder verwenden denselben
  500-ms-Suchrhythmus. Auf der Artseite stehen deutscher, englischer und lateinischer Name jeweils in einer
  eigenen Zeile; das interne Feld bleibt `Wissenschaftlicher Name`.
  Alle bestehenden Projektarten besitzen seit 2026-07-28 einen separat gepflegten englischen Namen in
  `species_list.json` und `speciesData.json`. Die kontrollierte Ergänzung ist über
  `npm.cmd run --silent taxonomy:backfill-english` standardmäßig als Vorschau und nur mit `-- --write` schreibend
  verfügbar; vor dem Schreiben entsteht eine lokale Sicherung.
  Phase 9.6 bis 9.12 ergänzen eine davon getrennte Master-SQLite mit stabilen anbieterunabhängigen Taxon-IDs,
  versionierten Quellenständen, Feldprovenienz, Konflikten und Projektverknüpfungen. Der aktive CoL-Vollbestand
  bleibt unverändert und read-only. Verbindliche lokale Quellen sind CoL XR, ein breiter iNaturalist-Namens- und
  Artlückenausschnitt, relevante GBIF-, WoRMS- und Wikidata-Ausschnitte, kontrollierte Animalia-Fälle und eigene
  Korrekturen. `Sciurus vulgaris` ist als reale Referenzlücken-Regression abgedeckt. Das Betriebs- und Datenmodell
  steht in `docs/taxonomy-master-database-design.md`; das frühere Audit ist eine historische Aufnahme des kleinen
  Bestands. Der maßgebliche Phasenabschluss steht in `docs/audits/2026-08-phase-9-closing-audit.md`.
- Phase 10 - Lightroom:
  Vor dem Start wurde am 2026-08-10 das verbindliche Stabilisierungspaket abgeschlossen. In der Oberfläche bilden
  CoL-Referenz und Master eine gemeinsame `Taxonomiedatenbank`; intern bleiben Kandidat, Konfliktprüfung,
  Aktivierung und Rollback getrennt. Der Umfang wird als `Taxa · deutsche Namen · englische Namen` direkt aus der
  Master-SQLite ermittelt. Bestehende Arten werden nie still geändert. Sichtbare Konflikte können über einen
  begründeten Lösungsvorschlag ausdrücklich entschieden werden. Die aktive Masterdatenbank ist in einem eigenen
  Dialog durchsuchbar; wissenschaftliche Taxonomie bleibt read-only, deutsche und englische Namen können als
  versionierte eigene Korrektur gepflegt werden. Der Soundeditor erzeugt MP3 und Spektrogramm bereits im
  Vorschauschritt und zeigt beide Vergleichsseiten vollständig an. Dezimalkommas werden als echte Sekundenwerte
  interpretiert; ein noch unveränderter Startwert `0` wird beim Fokussieren geleert, positive Werte bleiben stehen.
  Das mobile
  Squarespace-Layout folgt Portrait, Infos, Status, Taxonomie und Sound. Deutsche Taxonomieanzeigen decken die
  aktuell verwendeten Ränge ab; der Tooltip zeigt ausschließlich den wissenschaftlichen Rohwert.
  Seit 2026-08-11 zeigt die Taxonomiedatenbank genau drei Nutzeraktionen: `Datenbank aktualisieren`, `Vorherigen
  Stand wiederherstellen` und `In Datenbank suchen und Namen korrigieren`. Technische Referenz-, Kandidaten- und
  Aktivierungsschritte werden intern orchestriert. Der Korrekturdialog beginnt mit offenen Prüfungen der
  Projektarten. Referenzlückenbestätigungen verwenden eine exakte aktive Masterabfrage nach wissenschaftlichem
  Namen, Rang und Reich; `Sciurus vulgaris` ist dafür der verbindliche reale Fall. Native Playeraktionen verwerfen
  eine vorhandene Sound-Schnittvorschau nicht. Die drei Aktionen stehen wie die Backup-Aktionen vollbreit
  untereinander. `Datenbank aktualisieren` prüft zuerst die CoL- und Anbieterstände und vergleicht außerdem die
  aktive CoL-Release-ID mit der im aktiven Master gespeicherten CoL-Provenienz. Ein bereits aktivierter neuerer
  Referenzstand wird dadurch auch nach einem unterbrochenen Ablauf ohne erneuten Download in einen Masterkandidaten
  übernommen. Ein vorhandener Kandidat darf nur aktiviert werden, wenn seine CoL-Provenienz zur aktiven Referenz
  passt. Erst wenn weder Quelldaten, Kandidat, Korrekturen, Referenz-Master-Drift noch ein veraltetes
  Lightroom-Paket vorliegen, startet kein Neuaufbau. Ein echter Lauf ist im Kopf und Datenbankblock gelb als
  `Taxonomie-Update läuft` sichtbar; der bisherige aktive Stand bleibt bis zur Aktivierung erhalten.
  Seit 2026-08-29 zeigt der Masteraufbau zusätzlich echte Phasen, verarbeitete/gesamte Datensätze und Laufzeit.
  CoL-Zeilen, Anbieterzusammenführung und Kandidatenvergleich werden speicherschonend schrittweise verarbeitet.
  Beim Wechsel der aktiven CoL-Referenz werden zuvor bekannte Referenzlücken erneut gegen den neuen CoL-Stand
  geprüft; release-lokale numerische SQLite-Taxon-IDs werden dabei verworfen und die wissenschaftlichen Namen im
  neuen Release exakt aufgelöst. Bei unveränderter Referenz bleibt die geprüfte Abkürzung bestehen. Die
  Statusabfrage nutzt nach der vollständigen
  Kandidatenprüfung nur kompakte Manifestzähler und blockierende Konflikte, damit Polling weder die Vollvalidierung
  der großen SQLite wiederholt noch sämtliche nicht blockierenden Lücken überträgt. Ausdrücklich gepflegte
  Projektnamen ersetzen bisherige reine Anbieterwerte; manuelle Korrekturen bleiben geschützt. Rein von Anbietern
  stammende Hierarchiefelder werden dagegen beim geprüften neuen Quellenstand auch für Projektarten automatisch
  aktualisiert und nicht als wissenschaftliche Einzelentscheidung vorgelegt. Echte verbleibende Feldkonflikte
  erscheinen mit deutschem und wissenschaftlichem Namen, verständlicher Gegenüberstellung und Quellenangabe.
  Seit 2026-09-05 übernimmt `taxonomy-master-previous-state.mjs` fehlende Anbieterfelder mit ihrem ursprünglichen
  Quellenbeleg und archivierten Release, nicht als manuelle Entscheidung. Fehlerhafte alte manuelle Trägerzeilen
  werden ausschließlich bei identischem Quellenbeleg im vorherigen Master, ohne Feldentscheidung und ohne eigene
  Korrektur zurückgeführt. Ohne diesen Nachweis bleiben sie geschützt. Der Konfliktkandidat vom 5. September
  wurde nicht aktiviert; der spätere geprüfte Wiederanlauf ist unten dokumentiert.
  Der folgende Lauf brach bei einer doppelten Quellenkennung ab: Ein neues gleichnamiges Taxon eines anderen
  Reichs erbte fälschlich die Altfelder des vorhandenen Taxons. Die Vorgängerzuordnung prüft jetzt auch Reich und
  beidseitige Eindeutigkeit; ein Regressionstest reproduziert den ursprünglichen UNIQUE-Fehler und die Trennung.
  Nach erfolgreichem vollständigem Qualitätsgate und Statusabgleich wurde am 2026-09-05 um 07:48:16 Uhr MESZ
  der reale Aufbau mit allen Korrekturen neu gestartet und um 08:16:48 Uhr konfliktfrei abgeschlossen. Master
  `master-20260905054823067` wurde um 08:28:50 Uhr, das automatisch abgeleitete Lightroom-Paket
  `lightroom-946c961bd063fd1b8f12` um 08:32:51 Uhr aktiviert. Die aktive CoL-Referenz
  `col-xr-2026-08-26-316165`, Master-Provenienz und Paket-Provenienz stimmen überein. Die read-only Endprüfung
  bestätigte Projektnamen, eigene Korrekturen mit manueller Herkunft, stabile Weißstorch-Identität mit `exact-col`
  sowie getrennte Tier-/Pflanzen-Homonyme. Kein Aufbau läuft mehr. Der Benutzer bestätigte am 5. September
  Weißstorch in Lightroom und den passenden Paket-/Masterstand im Zusatzmodul-Manager und gab Commit/Push frei.
  Das bestätigt noch keine Zuweisung oder vollständige Lightroom-Abnahme. Offen bleiben die in der Roadmap
  gebündelten Praxistests und das Abschlussaudit. Der zusätzliche lokale Versionsvergleich ist seit 0.4.24.7
  im Zusatzmodul-Manager (mit erneuter Prüfung) und beim Öffnen des Zuweisungsfensters umgesetzt und anschließend
  vom Benutzer bestätigt. `taxonomy-data-versions.mjs` vergleicht Referenz, Master, Suchpaket und
  anwendbare Korrekturschicht mit begrenzten Manifest-Lesezugriffen, ohne SQLite- oder Katalogscan. Der
  Master-Service schreibt während seiner Aktionen einen kleinen Laufhinweis mit Zeitstempel; alte oder nicht
  überprüfbare Laufhinweise werden nicht als bestätigter aktueller Stand ausgegeben. Kein automatischer Neubau.
  Master und Lightroom-Paket besitzen jeweils atomare Slotwechsel; der Vollaufbau aktiviert sie bislang
  nacheinander mit möglichem Teilerfolg. Nur die schnelle Namenskorrektur hat bereits einen gemeinsamen Zeiger.
  Seit dem 8. September ist der inkrementelle Master-/Paketaufbau ausdrücklich Pflicht vor dem Audit:
  Identitätsregeln klären, kontrollierten Zuordnungsweg implementieren, anschließend inkrementelle Kandidaten
  mit gemeinsamem Aktivierungswechsel, Wiederanlauf und Vollaufbauvergleich. Noch nicht implementiert.
  Fachregeln bestätigt; Stand 9. September: Schema-4-Identitätsregister, geschützte Review-API, geprüfter
  Kandidatenaufbau und Aktivierungssperre für fehlende Entscheidungen sowie Historie im Suchpaket implementiert.
  Alter Master bleibt lesbar; keine produktive Migration. Explorer-Fallansicht mit begrenzten Projektseiten,
  gezielter Suche, Quellenvergleich, Bestätigung und Verwerfen offener Vormerkungen implementiert.
  Die bedienbare Foto-Nachfolgerzuordnung und der Deltaaufbau sind noch offen. Projekt-Splits/Merges lassen sich
  jetzt mit ausdrücklicher Einzelzielwahl je Projekt, lokaler Namensregel und erneuter Vorschau bestätigen.
  Der Masterkandidat erhält Website-Identität/Dateien und überträgt keine alten Projektnamen auf neue Taxa.
  Am 10. September zusätzlich mit Reichsaliasen und der Kette Split/Fortführung/erneuter Split geprüft:
  Die nächste Aufteilung verlangt eine neue Zielbestätigung; Rollback stellt den vorherigen Projektlink her.
  Der Benutzer hat den kurzen Explorer-Bedienungstest (Öffnen, gezielte Suche, Schließen) bestätigt;
  keine praktische Split-/Merge-Migration. Foto-Vorschaukern, SQLite-Rücknahmejournal und isolierter
  Lua-Schreibkern sind anschließend implementiert, aber noch nicht zu einer Bedienaktion verbunden.
  Die Helferbrücke verbindet nun bestätigte Schnappschussvorschau und dauerhaftes Journal, öffnet vor
  Bestätigung den aktiven Paketstand neu und prüft Wiederaufnahme sowie Favoritenabhängigkeiten für
  250er-Blöcke. Am 11. September verbindet die lokale Lua-Orchestrierung nun ausdrücklichen Katalogleselauf,
  Zielvorbereitung, Journal und Schreiben/Rücklesen samt Sperrprüfung. Version 0.4.24.13 ergänzt
  „Artänderungen prüfen ...“ im Verwaltungsfenster: explizite Nachfolger-/Favoritenwahl, Bestätigungen,
  Fortschritt, Pause und protokollierte Fortsetzung/Rücknahme. 103 Lightroom-Tests bestanden;
  praktische Lightroom-Abnahme und Großkatalogmessung bleiben offen. Normale Zuweisung unverändert.
  Bedienung und Grenzen: `docs/lightroom-identity-workflow.md`.
  Am 11. September hat der Benutzer das Öffnen ohne Suche/Auswahl bestätigt; keine Schreib-/Rücknahmeabnahme.
  Anschließend begonnen: `taxonomy-build-inputs.mjs` mit versionsgebundenem Quellenplan, transaktionalen
  Eingangscheckpoints und streamendem Datensatzvergleich. Die Anbindung `taxonomy-master-inputs.mjs` speichert
  jetzt geprüfte Eingänge beim Explorer-Vollaufbau mit dem Kandidaten, bindet dessen fertige Datei per Prüfsumme
  und vergleicht nachgelagert gegen die aktive Baseline. CoL-Auswahlumfang ist nicht der Gesamtbestand;
  Abbruch, Fremddatei und fehlende Altbaseline ergeben keine Wiederverwendungsfreigabe. Weitere direkte
  Aufrufer ohne Beleg bleiben Vollaufbau ohne Baseline. Am 12. September ergänzt
  `taxonomy-master-dependencies.mjs` einen nachgelagerten SQLite-Abhängigkeitsplan aus altem und neuem Master:
  Quellen-/Eltern-/Akzeptiert-Verweise, wissenschaftliche Varianten, Gattungsableitung und konservative
  Neuberechnung zustandsabhängiger Taxa. Zyklen und entfernte Kanten sind getestet; keine Kopierfreigabe.
  `taxonomy-master-reuse.mjs` schaltet nun bei belegbar unveränderter Graphstruktur den Plan vor die
  Ergebnisberechnung und übernimmt nicht betroffene, zustandsfreie Arten mit aktuellen Quellenbelegen.
  Geänderte Reihenfolge gleicher Quellenwerte wird neu berechnet. Struktur-/Identitätswechsel bleiben Vollaufbau.
  Kleine mehrstufige Vollaufbau-Vergleichstests samt Mehranbieter-/Projektfeldern bestanden. Isolierte Messungen
  mit 10.000 synthetischen Arten bestätigen die Ergebnisgleichheit, zeigen aber Ausreißer und höheres RSS.
  Doppeltes Graphlesen und wiederholte SQL-Vorbereitung sind reduziert; vollständig geänderte Eingänge
  überspringen nutzlose Wiederverwendungsplanung. Abbruchtests nach 500 Kopien erhalten die alten Stände.
  Seit 13. September: Suchpaket-Deltas aus gemeinsamem Vollaufbau-Projektionsvertrag und atomare Paaraktivierung
  über `taxonomy-publication/active.json` sind angebunden. Beide Releaseordner werden zuerst geprüft;
  Paketfehler lassen beide Altstände aktiv. Präferenzen, Rücknahme, offene Leser und echter Paketworker sind
  isoliert geprüft. Lua-Version 0.4.24.14 liest denselben Zeiger. Keine produktive Aktivierung.
  Vor Großbestandsfreigabe bleiben Speicher-/Ausreißeranalyse sowie
  die Abnahme des gesamten Wiederanlaufs offen. Die schwere Paarvorbereitung/-prüfung samt Rücknahme ist
  seit 20. September in einen eigenen Hilfsprozess ausgelagert; der Elternprozess allein aktiviert das Paar.
  Worker-/Jobkern und transaktionale 500er-Schreibcheckpoints sind im Explorer angeschlossen:
  aktuelle Quellenauswahl und eigene Eingänge werden gebunden, Aufträge beim Neustart ohne automatischen
  Lauf wiedergefunden, Pause/Fortsetzung und gesicherter Zähler sind sichtbar. Serviceweite Prozesssperren
  sowie Ablehnung veralteter Läufe/älterer Kandidaten sind geprüft. Der Service-/Worker-Test öffnet den Dienst
  neu; produktive Explorer-/Lightroom-Neustart- und Großbestandsabnahme stehen aus. Keine produktiven Läufe.
  Release-/Jobaufbewahrung und Platzprüfung sind inzwischen mit bestätigter Vorschau und genau einem Backup
  angebunden; siehe `docs/taxonomy-storage-maintenance.md`. Seit 21. September ersetzt eine gebundene
  Teilprojektion die vollständige Zwischenprojektion. Ergebnisgleichheit und ein begrenzter Vorteil gegenüber
  dem heutigen Vollpfad sind geprüft; die deutliche Gesamtbeschleunigung bleibt vor der Betriebsabnahme offen.
  Vertrag und Grenzen: `docs/lightroom-incremental-export.md`.
  Vertrag: `docs/taxonomy-master-background-build.md`.
  Details: `docs/taxonomy-incremental-build.md`.
  Benutzerbefunde vom 12. September untersucht: Grünfink-Kartenabruf erhält HTTP 403/Schutzseite trotz
  funktionierendem Browserlink. Keine Umgehung; verständliche Meldung und vorhandener Datei-Upload als Ersatzweg.
  GitHub-Lauf `34681451887` scheiterte am Mediengate (fehlende Karte), nicht am Deploy-Schritt. Pipeline-/Transfer-
  veröffentlichungen prüfen Medien jetzt vor Git. Doppelte Detailberichte sind unterdrückt; eine abschließende
  Gesamtzusammenfassung trennt Verarbeitung, Fehlstellen und Git/Pages. Tests bestanden; automatische IUCN-
  Abruffreigabe und praktische Explorer-Abnahme bleiben offen. Details: `docs/pipeline-control-plan.md`.
  Beschädigte Umlaute in Kartenmeldungen: Windows-Ausgabe und Node-Eingabe auf UTF-8 vereinheitlicht;
  Pipeline-Textdecoder erhält Zeichen und Zeilen über Paketgrenzen. Historische Logs bleiben unverändert.
  Lesender Live-Test am 12. September, 19:48 MESZ: alle 57 Kartenendpunkte HTTP 403/Schutzseite, 0 JPEGs.
  Alle 57 vorhandenen Karten per SHA-256 unverändert; automatischer Neuabruf bleibt als allgemeiner Befund offen.
  Einordnung: Der 57-Arten-Test umfasst direkte Node-Abrufe, keinen vollständigen Alt-Ablauf. Reguläre
  Assessment-API für Weißstorch/Grünfink antwortet im Reparaturversuch HTTP 200, ohne JPEG-Link. Downloadfunktion
  Der historische Windows-WebRequest-Fallback nach direktem 403 ist wieder aktiv; aktueller Erfolg noch nicht
  nachgewiesen. Ein Browser-Network-Link kann als zusätzlicher regulärer Weg geprüft werden.
  Korrektur des Browserbefunds: Der vollständige Network-Auszug nennt `www.iucnredlist.org`, HTTP 200,
  `image/jpeg` und ca. 581 kB. Der Adapter priorisiert `www`; automatischer Erfolg bleibt offen.
  Karten-Webrequests senden keinen Bearer-Token an den Website-Endpunkt; Token bleibt auf API-JSON beschränkt.
  Ein 403 des Windows-Fallbacks wird nicht mehr als vorzeitiger Abbruchfehler weitergereicht; Cache-/Backblaze-
  Prüfungen bleiben Teil des vollständigen Kartenablaufs.
  Seit 13. September: vereinfachter lokaler Dateiimport im Karteneditor. JPEG/PNG auswählen oder in das
  beschriftete Feld ziehen startet ausschließlich die vorhandene lokale Vorschauprüfung, keinen IUCN-Abruf.
  Browserbutton beziehungsweise passender Assessment-Dateiname ergänzen die Quelle; leerer Pflegegrund erhält
  einen editierbaren Vorschlag. Abweichende Assessment-Dateinamen, Mehrfachablagen, ungültige Dateiformate und
  veraltete Vorschauen werden abgefangen. Speichern bleibt ausdrücklich bestätigt, mit Backup und lokalem
  Änderungsstand. Kein neuer Browser-/Session-Fallback; automatische Downloads weiterhin ungelöst.
  Dateiimport einschließlich direktem Browser-Drag-and-drop vom Benutzer bestätigt. Automatischen Kartenabruf
  und die Trennung von IUCN-Herkunft und manuellem Pflegeschutz als letzten fachlichen Punkt vor dem Audit prüfen;
  keinen bestehenden Schutz automatisch entfernen. Details: `docs/pipeline-control-plan.md`.
  Details und Grenzen: `docs/taxonomy-identity-incremental-plan.md`.
  Die vorhandene ID aus Name/Rang/Reich erkennt keinen Split bei unverändertem Identitätstupel. Unbekannte IDs
  zu überspringen ersetzt deshalb keine Nachfolgerverwaltung. Produktive Daten wurden in der Analyse nicht geändert.
  Abgenommener vorheriger Punkt: globale deutsche Namenspräferenz bei bewusster Auswahl einer Suchalternative.
  Die Namenswahl mit bestätigter Rückfrage und expliziter Rückwahl ist seit 0.4.24.8 technisch umgesetzt:
  gemeinsamer `taxonomy-name-preference-service.mjs`, vorhandene atomare Korrekturschicht und prozessübergreifende
  Korrektur-Schreibsperre. Einzelheiten und Grenzen stehen in `docs/taxonomy-name-preference-plan.md`.
  Der erste Bedienungstest zeigte, dass der Explorer einen ergänzenden Anbieternamen fälschlich als bevorzugt
  markierte, obwohl Master und Lightroom übereinstimmten. Taxondetails kennzeichnen den Masterwert nun explizit;
  der erneute praktische Speicher-/Rückwahltest mit Weißstorch/Weissstorch wurde erfolgreich bestätigt. Leere
  Datenbanksuche startet keinen verzögerten Suchlauf mehr. Version 0.4.24.9 ergänzt `Anbieterstandard verwenden`
  für den deutschen Namen mit Vorschau und Bestätigung. `germanNameMode: provider` löst auch eingebaute eigene
  Namen über den gemeinsamen Korrekturzeiger ab und folgt nach Master-Neubau erneut der Quellenpriorität;
  englische Korrekturen und vorherige Namenswahl bleiben erhalten. Fehlende oder nicht eindeutig belegbare
  Anbieterwerte blockieren die Rücksetzung. SQLite-Neubau-/Rückwahltests sind erfolgreich; der Benutzer hat
  Anbieterstandard und Rückwahl in beiden Richtungen praktisch bestätigt. Version 0.4.24.10 ergänzt in Lightroom
  `Namenswahl übernehmen` für eine direkte globale Präferenz ohne Fotozuweisung; der Benutzer hat auch diesen
  Button am 8. September praktisch bestätigt.
  Keine globale
  Änderung allein durch Suchtext oder Vorschau, keine beiläufige Projekt-/Assetumbenennung.
  Die alte Windows-Aufgabe `Datenabruf Website` wurde vom Benutzer gelöscht; ihr Lauf um 07:00
  hatte Daten und offene Dokumentation ohne aktualisierten Projektstatus veröffentlicht. Der Pages-Quality-Job
  stoppte deshalb vor dem Deployment. Die Statuskorrektur gehört zur jetzt freigegebenen gemeinsamen Veröffentlichung.
  Vor Aktivierung und Rollback schließt der Explorer seine eigenen read-only Masterhandles, damit Windows den
  atomaren Slotwechsel nicht mit `EPERM` blockiert. Mehrere Namenskorrekturen können vor einem gemeinsamen
  `Datenbank aktualisieren` gesammelt werden. Seit 2026-08-30 baut der Explorer nach bestätigter Masteraktivierung
  oder Wiederherstellung das Lightroom-Suchpaket automatisch in einem getrennten Hilfsprozess neu, prüft es
  vollständig und aktiviert es atomar. Fortschritt erscheint im bestehenden Datenbankblock. Bei einem Paketfehler
  bleibt das bisherige Paket aktiv; der Teilerfolg wird gemeldet und `Datenbank aktualisieren` wiederholt nur den
  fehlenden Paketbau. Bei einem Masterfehler bleiben Master und Paket unverändert; der Referenz-Master-Drift bleibt
  als Handlungsbedarf sichtbar und wird beim nächsten bestätigten Aufruf erneut verarbeitet.
  Phase 10.1 ist seit 2026-08-13 abgeschlossen. `docs/lightroom-feasibility-study.md` dokumentiert die reale
  Lightroom-Classic-15.5-Zielumgebung, offizielle Lua-SDK-/Metadatengrenzen und den Vergleich mit iNat Publish Pro,
  LifeListXP, Nomen und Species Tagger. Der technische Kern von Phase 10.2 ist ebenfalls umgesetzt und unter
  `docs/lightroom-search-package.md` verbindlich dokumentiert. Das reale, vollständig verifizierte read-only
  Suchpaket enthält seit dem kontrollierten Neuaufbau vom 2026-08-30 273.421 Taxa und 7.103.327 Suchbegriffe aus
  der aktiven Masterdatenbank. `Macroglossum stellatarum` verwendet dort die eigene Namenskorrektur
  `Taubenschwänzchen`; der lokale Suchhelfer
  funktioniert ohne laufenden Explorer; Paketprüfung, atomare Aktivierung und isolierter Rollback sind praktisch
  verifiziert. Das versionierte deutsche Lua-Plug-in unter `lightroom-plugin/FNWildlifeTaxonomy.lrplugin/` zeigt
  Namen und vollständige Hierarchie an und besitzt den kontrollierten Vertrag für eindeutig mit `(FN)` markierte,
  flache Lightroom-Stichwörter, stabile Plug-in-Metadaten und Mehrfachzuweisung. Direkter Zugriff auf Master-SQLite,
  `.lrcat` oder XMP ist
  verboten; Lightroom bleibt alleiniger Besitzer aller Katalogschreibvorgänge. Automatisierte Phase-10.2-Tests
  sichern Suchpaket, Suchhelfer, Plug-in-Grenzen und Konfliktsperre. Der aktuelle, automatisiert geprüfte Stand
  trägt Version `0.4.24.14`: Das kompakte schwebende Zuweisungsfenster bleibt bei Auswahlwechseln geöffnet,
  gliedert Auswahl, Prüfung und Zuweisung in vier gerahmte Schritte, prüft den lokalen Suchpaketstatus, zeigt bei
  einem Foto dessen Dateinamen oder `1 Foto ausgewählt` und bei Mehrfachauswahl ausschließlich die Gesamtzahl,
  besitzt einen unten rechts verankerten Schließen-Button und merkt die zehn zuletzt verwendeten Arten. Lifelist
  und Katalogstatistik werden ausschließlich im getrennten Statistikfenster berechnet; Öffnen, Zuweisen und
  Entfernen starten im Zuweisungsfenster keine katalogweite Statistikberechnung. Eigene Zuweisungs-, Rücknahme-
  Orts-/Zeit- und Favoritenaktionen aktualisieren stattdessen die betroffenen Aggregate des persistenten Katalogindex im
  selben Schreibzugriff. Sichtbar gleiche `(FN)`-Stichwortnamen werden vor dem Lightroom-
  Schreibzugriff dedupliziert, sodass Familie und Gattung etwa bei Austernfischer oder Bartmeise dasselbe
  Stichwort nicht zweimal anlegen oder zuweisen. Version 0.4.15.0 verwendet den direkten `withWriteAccessDo`-Aufruf
  innerhalb der bereits gestarteten `LrTask` und wartet mit dem offiziellen SDK-Timeout bis zu zehn Sekunden auf
  einen kurz belegten Katalog. Anders als 0.4.11.0 prüft sie danach zwingend Callback-Ausführung und gespeicherte
  `masterTaxonId`; ein Timeout darf deshalb keine Erfolgsmeldung erzeugen. Die zusätzliche, irreführende
  Fehlerübersetzung aus 0.4.13.0 bleibt entfernt. Version 0.4.16.0 verlagert außerdem die Aktualisierung der
  Lightroom-Auswahl aus dem Observer in eine kurze `LrTask`, damit Fotozahl und Einzelfotoanzeige unmittelbar nach
  Strg+A oder einem Einzelklick nachgezogen werden; dies wurde praktisch bestätigt. Version 0.4.17.0 verarbeitet
  große Statistikscans in 500-Foto-Leseblöcken und yieldet nur zwischen diesen SDK-Lesezugriffen. Version 0.4.21.1
  speichert den kompakten Aggregatindex und seinen alle 5.000 Fotos geschriebenen Aufbaucheckpoint als
  katalogweite Plug-in-Eigenschaft. Der nichtmodale Aufbau zeigt Zahlen und Prozentwert, bleibt pausier- und
  fortsetzbar und lässt Lightroom bedienbar. Die
  Suche bleibt über `Art suchen` verfügbar und startet zusätzlich nach 0,5 Sekunden Eingabepause. Eine Änderung
  des Suchtexts verwirft die zuvor geladene Art sofort; vor einer trotzdem abweichenden Zuweisung steht eine
  ausdrückliche Sicherheitsabfrage. Der
  praktische Test von
  Version 0.4.4.0 widerlegte die Enter-Annahme: `presentFloatingDialog` besitzt keinen SDK-dokumentierten
  Standardbutton oder Tastatur-Callback; ein Text-Observer kann Enter nicht von unverändertem Text ableiten.
  Derselbe dokumentierte Dialogvertrag bietet auch keine Option, das schwebende Fenster nur gegenüber Lightroom,
  aber nicht gegenüber anderen Windows-Anwendungen im Vordergrund zu halten. Das Plug-in ruft `toFront()` nur auf,
  wenn die Menüaktion bei bereits geöffnetem Fenster erneut gewählt wird; weitere Vordergrundsteuerung bleibt dem
  nativen Lightroom-Fenster überlassen.
  `Taxonomie entfernen` steht über `Plug-in-Extras`
  beziehungsweise `Bibliothek > Zusatzmoduloptionen` bereit; ein Eintrag direkt im normalen Foto-Rechtsklickmenü
  war im praktischen Test nicht verfügbar. Die Aktion löscht Plug-in-Metadaten und alle eindeutig reservierten
  Stichwörter mit den Endungen `(FN)` und `(FN)*` von den markierten Fotos kontrolliert über das Lightroom-SDK.
  Version 0.4.22.1 ergänzt die getrennten Aktionen `Orts- und Zeitstichwörter hinzufügen ...`, `entfernen ...` und
  `aktualisieren ...`. Sie lesen ausschließlich vorhandene Lightroom-Felder für Ortsteil, Stadt,
  Bundesland/Region, Land/Region, ISO-Ländercode und Aufnahmezeit. Ortsnamen werden als flache `(FN Ort)`-,
  deutscher Monat und Jahr als `(FN Zeit)`-Stichwörter geschrieben; der ISO-Code bleibt ein Plug-in-Metadatum. Eine normale
  Taxonomiezuweisung ergänzt Ort und Zeit nur dann automatisch, wenn noch kein FN-Orts-/Zeitstand besteht. Die
  getrennt gespeicherten Namen und Kennungen schützen Taxonomie- und Orts-/Zeitstichwörter bei ihrer jeweiligen
  Rücknahme voreinander; manuelle Stichwörter bleiben unangetastet. Das dokumentierte Rohfeld `gps` erkennt Fotos,
  deren kursiv angezeigte Lightroom-Ortsvorschläge nicht über die normale Metadaten-API lesbar sind. Für genau diese
  ausgewählten Fotos erzeugt das Plug-in kleine temporäre JPEGs, übernimmt die von Lightroom exportierten XMP-/IPTC-
  Ortswerte und bereinigt die Dateien anschließend. Ein eigener Geodienst und katalogweite Läufe gehören nicht zu
  diesem Stand. Der neue Ablauf ist automatisiert geprüft und noch praktisch abzunehmen.
  Version 0.4.23.0 erweitert den persistenten Index um zwei getrennte, kompakte Orts-/Zeitstatistiken: alle Fotos
  mit gespeicherten FN-Orts-/Zeitwerten unabhängig von der Taxonomie sowie deren Schnittmenge mit einer gültigen
  `mtx_`-Taxonomiezuweisung. Beide zeigen die Anzahl und den häufigsten Wert für Länder, Regionen, Städte, Ortsdetails, Jahre und
  Monate in zwei festen nebeneinanderliegenden Bereichen ohne dynamische Scrollhöhe. Die eigenen Orts-/Zeitaktionen schreiben
  die betroffenen Deltas direkt mit; nach dem Schemawechsel ist einmalig `Statistik neu aufbauen` erforderlich.
  Version 0.4.23.1 korrigiert den Rückgabevertrag der eigenständigen Orts-/Zeitaktionen: Verwendet wird nun das im
  Write-Access-Callback erzeugte fachliche Ergebnis statt des SDK-Rückgabewerts von `withWriteAccessDo`; die
  Meldungszähler besitzen zusätzlich einen defensiven Nullstandard.
  Version 0.4.23.2 erkennt einen vorhandenen Orts-/Zeitstand ausschließlich an tatsächlich gespeicherten FN-
  Orts-/Zeitwerten; ein verwaister interner Aktualisierungsmarker blockiert die Reparatur daher nicht. Die
  Aufnahmezeit wird sowohl aus einzelnen SDK-Komponenten als auch einer Komponententabelle gelesen und fällt bei
  Bedarf auf den formatierten Wert desselben Lightroom-Feldes zurück.
  Version 0.4.23.3 prüft Quellwerte vor dem Anhängen der reservierten Endung und erzeugt daher niemals die leeren
  Stichwörter `(FN Ort)` oder `(FN Zeit)`. Für die Aufnahmezeit wird vorrangig `captureTime` gelesen; bisherige
  Roh- und Formatfelder bleiben Rückfälle. Ein erneutes Hinzufügen bereinigt auf den ausgewählten Fotos zugleich
  bereits gespeicherte leere Suffix-Stichwörter der fehlerhaften Vorversionen.
  Version 0.4.23.16 liest die Aufnahmezeit jedes ausgewählten Fotos über das öffentliche Lightroom-Feld
  `dateTimeOriginal` vor der nicht yield-fähigen Fehlergrenze und erkennt auch
  lokalisierte Datumswerte wie `20. August 2026`. Aufnahmezeitstichwörter benötigen weder GPS noch Ortsfelder. GPS
  wird über `getRawMetadata("gps")` erkannt. Fehlen gespeicherte Ortsfelder, werden Lightrooms exportierbare
  Ortsvorschläge über kleine temporäre JPEGs übernommen; einzelne Felder müssen nicht manuell bestätigt werden.
  Version 0.4.23.16 startet die programmgesteuerte Export-Session vor `waitForRender()` ausdrücklich als neue Task;
  der erste praktische Versuch ohne diesen Start blieb beim ersten Foto im Fortschrittsdialog stehen.
  Version 0.4.24.1 erkennt bei der Orts-/Zeit-Rücknahme zusätzlich die vollständigen Lightroom-Varianten
  `(FN Ort)*` und `(FN Zeit)*`, erzeugt diese Sternformen aber nicht. `Alle FN-Daten entfernen ...` bereinigt nach
  Bestätigung auf der aktuellen Auswahl Taxonomie, Art-Favorit, FN-Orts-/Zeitdaten und ausschließlich die sechs
  reservierten Endungen `(FN)`, `(FN)*`, `(FN Ort)`, `(FN Ort)*`, `(FN Zeit)` und `(FN Zeit)*`. Die neue Aktion
  `Gesamten Katalog aktualisieren ...` führt einen lesenden 500-Foto-Scan mit Vorschau aus und schreibt erst nach
  Bestätigung pausierbar in 250-Foto-Blöcken. Alle vorhandenen Master-IDs werden in einer Suchhelferanfrage gegen
  dasselbe aktive Paket geprüft; Taxonomien werden nur bei unverändert eindeutig aktiver `masterTaxonId`
  aktualisiert. Ungültige oder nicht auflösbare IDs, Mehrfachfavoriten sowie verwaiste reservierte Stichwörter
  werden sichtbar gemeldet und nicht automatisch umgedeutet. Ortsvorschläge werden für den bestätigten Lauf in
  einer gemeinsamen Lightroom-Export-Session gebündelt; einen möglichen Adobe-Bestätigungsdialog kann das Plug-in
  nicht unterdrücken. Erfolgreiche Blöcke halten den vorhandenen Statistikindex inkrementell aktuell. Pause greift
  zwischen Blöcken beziehungsweise nach einem laufenden Export; Schließen beendet nach dem aktuellen Block. Ein
  Neustart ist idempotent, ein persistenter Katalogpflege-Checkpoint ist in diesem Stand nicht enthalten. Der neue
  Funktionsblock ist automatisiert geprüft und benötigt noch die praktische Lightroom-Abnahme. Version 0.4.24.1
  dedupliziert zusätzlich sämtliche Orts-/Zeit-Stichwortnamen eines Schreibvorgangs vor dem ersten
  `photo:addKeyword`: Ein Monats- oder Jahresstichwort wird einmal erzeugt und danach für alle passenden Fotos
  wiederverwendet. Das verhindert Lightrooms `nil`-Rückgabe bei wiederholtem `createKeyword` innerhalb einer
  gemischten Mehrfachauswahl.
  Version 0.4.24.2 beschriftet die Gesamtauswertung und deren Taxonomie-Schnittmenge im Inhalt. Sie zeigt
  Fotozahlen je Jahr, häufigsten Monat und häufigste Ortswerte sowie die Anzahl unterschiedlicher Länder, Regionen,
  Städte und Ortsdetails. Eine vollständig identische zweite Verteilung wird durch einen eindeutigen
  Übereinstimmungshinweis ersetzt.
  Version 0.4.24.3 trennt Katalogübersicht, Datenqualität der taxonomierten Fotos, vollständigen Taxonomieumfang,
  Art-Favoriten, Orte und Zeiten. Deutsche Tausenderpunkte gelten für alle sichtbaren Zähler. Die Abdeckung zählt
  ausschließlich gültige `mtx_`-Master-IDs; die Orts-/Zeit-Schnittmengen stammen ausschließlich aus FN-Feldern.
  Die Rangvielfalt wird aus den Plug-in-Metadaten für Domäne, Reich, Stamm, Klasse, Ordnung, Familie und Gattung
  sowie eindeutigen Master-IDs für Arten gebildet. Spitzenwerte für Jahr, Monat und Monat/Jahr verwenden FN-Zeit;
  der Spitzen-Aufnahmetag wird nur beim bewussten Statistikaufbau aus `dateTimeOriginal` aggregiert. Indexschema 4
  erfordert einmalig `Statistik neu aufbauen` und löst keinen Scan im Zuweisungsfenster aus.
  Version 0.4.24.4 stellt den Lifelist-Kopf einzeilig dar und begrenzt Orts-, Zeit- und Artenranglisten einheitlich
  auf Top 5. Datenqualität und Klassen zeigen Prozentanteile der taxonomierten Fotos. Der gemeinsame Button
  `Exportieren ...` bietet eine erweiterte Lifelist-CSV, eine nur auf ausdrücklichen Aufruf in 500er-Blöcken aus
  vorhandenen FN-Metadaten aggregierte Beobachtungslisten-CSV und eine gruppierte UTF-8-Artenliste als TXT.
  Indexschema 5 erfordert einmalig `Statistik neu aufbauen`; Exporte schreiben keine Metadaten oder Stichwörter und
  führen kein Geocoding aus.
  Version 0.4.24.5 führt die nach FN-Datum, FN-Ort und Master-Art gebildeten Beobachtungsgruppen im persistenten
  Statistikindex. Der bewusste Statistikaufbau erzeugt sie einmalig, danach pflegen Plug-in-Aktionen die Gruppen
  inkrementell. Die Beobachtungslisten-CSV benötigt dadurch beim Export keinen Katalogscan mehr. Der Index speichert
  keine Fotoliste je Gruppe und höchstens einen optionalen Beispiel-Dateinamen; Indexschema 6 erfordert einmalig
  `Statistik neu aufbauen`.
  Version 0.4.24.6 reduziert die native Liste unter `Bibliothek > Zusatzmoduloptionen` auf `Taxonomie zuweisen`
  und `FN Wildlife verwalten ...`. Das zweite Fenster führt alle zehn Aktionen einschließlich der zusätzlichen
  Zuweisung. Auswahlbezogene und katalogweite Aktualisierung stehen gemeinsam, bleiben durch ihre Beschriftung
  und Wirkung aber eindeutig getrennt. Native Untermenüs oder Trennlinien werden
  nicht vorgetäuscht, weil der dokumentierte `LrLibraryMenuItems`-Vertrag nur normale Einträge ausweist.
  Der Suchhelfer erkennt unter Windows eine übliche lokale
  Node-Installation auch dann, wenn Lightroom den System-`PATH` nicht vollständig übernimmt, und erhält den lokalen
  Suchpaketpfad unabhängig von Lightroom-Prozessvariablen ausdrücklich. Ein fehlgeschlagener Hilfsprozess zeigt eine
  begrenzte technische Diagnose. Die vollständige verfügbare Taxonomie wird in stabilen Plug-in-Metadaten geführt;
  Stichwörter enthalten nur lesbare Taxonnamen ohne technische IDs oder Rangpräfixe. Die kompakte Metadatenansicht
  `FN Wildlife – Foto & Taxonomie` kombiniert sinnvolle Standard-Fotofelder mit Namen und den wichtigsten
  Taxonomierängen; die Rangfelder tragen kurze Bezeichnungen wie `Reich` oder `Klasse`, während ihre Werte
  weiterhin wissenschaftlich bleiben. `FN Wildlife – vollständige Taxonomie` zeigt bei Bedarf alle unterstützten Ränge. Technische IDs
  bleiben in beiden Ansichten ausgeblendet. Der Zusatzmodul-Manager zeigt Version und Zustand des abgeleiteten Suchpakets, aber keine zweite
  Datenbankpflege. Als klar abgegrenzte 10.4-Funktionen sind genau ein erklärtes und bestätigungspflichtiges
  `Favoritenbild der Art` je Master-Taxon-ID, ein idempotenter Satz aus `Art-Favoriten`, `Taxonomie fehlt` und
  `Taxonomie zugewiesen` sowie eine vollständig neu
  berechenbare Katalogstatistik mit Lifelist, Taxonomie-Abdeckung, drei UTF-8-Exporten, kompakter Klassenübersicht
  und den fünf am häufigsten fotografierten Arten implementiert. Die Arten je Klasse werden wegen der praktisch
  unzuverlässigen dynamischen Lightroom-Ansicht vollständig im CSV statt in aufklappbaren Dialogzeilen ausgegeben. Die Statistik liest die Zuordnungen aus dem
  Lightroom-Katalog und benötigt dafür kein Taxonomie-Datenbankupdate. Eine veränderte Fotozahl macht den Index
  ungültig; für andere außerhalb des Plug-ins vorgenommene Änderungen bleibt `Statistik neu aufbauen` verbindlich,
  weil das SDK keinen allgemeinen Metadatenbeobachter dokumentiert. Die Sammlungen beruhen ausschließlich auf
  den Plug-in-Metadaten `referenceImage` und `masterTaxonId`, nicht auf normalen Foto- oder
  Lightroom-Stichwortmetadaten. Eine gültige Zuweisung wird am reservierten Master-ID-Präfix `mtx_` erkannt;
  `Taxonomie fehlt` ist die über `exclude` gebildete Gegenmenge. Die in Lightroom praktisch umgekehrt ausgewerteten
  Operationen `empty` und `notEmpty` werden dafür nicht mehr verwendet. Beim
  erneuten Einrichten werden bestehende Regeln aktualisiert; `5-Sterne-Tierbilder` und `Art-Referenzbilder` werden
  innerhalb des verwalteten Sammlungssatzes entfernt. Andere
  manuelle Stichwörter und alte flache Stichwörter ohne eindeutige FN-Endung bleiben unangetastet. Einzel- und
  Mehrfachzuweisung, Fensteraufbau, Favoritenersetzung und Rücknahme wurden im separaten Testkatalog praktisch
  geprüft. Die komplementären Taxonomiesammlungen wurden mit 132 Fotos und genau einer Zuweisung praktisch als
  `Taxonomie fehlt = 131` und `Taxonomie zugewiesen = 1` bestätigt. Phase 10 bleibt bis zum umfassenden
  Abschlussaudit offen.
  Version 0.4.18.0 ergänzte die abgesicherte Übergabe `Artbezeichnung korrigieren ...` an den Arten-Explorer.
  Version 0.4.19.0 erkennt gespeicherte, noch nicht im aktiven Master enthaltene Korrekturen über einen
  revisionsfesten Fingerabdruck als Aktualisierungsgrund, schließt vor dem Sofortlauf den Korrekturdialog für den
  sichtbaren Fortschritt und baut nach Aktivierung das Lightroom-Suchpaket automatisch neu. Dessen Hierarchie
  kombiniert den vollständigen bevorzugten Anbieterpfad mit den rangweise ausgewählten Master-Feldwerten; damit
  hängt etwa `Sciurus vulgaris` nicht mehr von einem unvollständigen Einzelbeleg ab, während zusätzliche
  Zwischenränge erhalten bleiben. Der aktive Stand `lightroom-ef6cfb4b4851d19063d8` enthält 2.670.983
  Hierarchiezeilen. Die Korrekturübergabe, der neue Paketstand und die automatische
  Suche benötigen noch den praktischen Lightroom-/Explorer-Folgetest.
  Version 0.4.20.0 ergänzt den sicheren Sekundenpfad für reine eigene Namenskorrekturen. Ein kleines
  unveränderliches Korrektur-Release wird gegen aktive Master-ID, wissenschaftlichen Namen, Rang, Reich,
  Masterversion und Lightroom-Paket-ID geprüft. Ein einziger atomarer Zeiger aktiviert es anschließend gleichzeitig
  für Masteransicht und Lightroom-Suchhelfer; die mehrgigabytegroßen Basis-SQLite-Dateien werden nicht kopiert oder
  verändert. Lightroom öffnet bei der nächsten Suche den neuen Stand ohne Neustart. Eine vor dem Zeigerwechsel
  geladene Art wird über die geänderte Korrekturrevision vor der Zuweisung gesperrt. Der damalige Schnellweg konnte
  fest eingebaute Korrekturen noch nicht entfernen. Seit 0.4.24.9 setzt `Anbieterstandard verwenden` den belegten
  Anbieterwert jedoch ohne Master-Neuaufbau als bestätigte neue Wahl; Rückwahl und seit 0.4.24.10 die direkte
  Namensübernahme wurden praktisch bestätigt. Das gilt nicht als Abnahme der späteren Regressionskorrekturen.
  Der Großkatalogtest von Version 0.4.21.0 bestätigte Fortschritt, Bedienbarkeit, unauffälligen RAM-Verlauf,
  Pause/Fortsetzen, Lifelist-CSV und Klasseninhalte. Version 0.4.21.1 korrigierte den fehlenden Dialogrand und das
  wirkungslose direkte Delta; Zuweisung und Rücknahme wurden damit praktisch bestätigt. Die dynamische Artenhöhe
  blieb in Lightroom auf eine Zeile begrenzt. Version 0.4.21.2 entfernt deshalb die instabile Aufklappansicht,
  behält Klassen-, Art- und Fotozahlen kompakt bei und überlässt die Artenaufschlüsselung dem CSV. Außerdem speichert
  der globale Statistikaufbau die persistenten Lightroom-Foto-UUIDs vorhandener Art-Favoriten. Der Favoritenbutton
  löst nur diese UUIDs auf, schreibt ausschließlich die tatsächlich betroffenen Fotos und verifiziert das Ergebnis.
  Das erhöhte Indexschema erfordert nach dem Wechsel auf 0.4.21.2 genau einen Neuaufbau; ein alter Index verlangt
  dies sichtbar statt eines versteckten Katalogscans. Der UUID-basierte Favoritenwechsel wurde praktisch bestätigt.
  Version 0.4.21.3 entfernt die wirkungslose Farbangabe des nativen Vorschau-`simple_list`: Das SDK dokumentiert
  dafür keine verlässlich steuerbare Hintergrundfarbe, während der frühere `scrolled_view`-Ersatz Taxonomiezeilen
  praktisch abschnitt beziehungsweise ausblendete. Die zuverlässige scrollbare Liste bleibt daher systembedingt weiß.
- Phase 11 - Mehrere Computer:
  automatische App-Aktualisierung, Identitaet, Bearbeitungssperre, Konfliktbehandlung, NAS-Restore und Installer.
  Beim Installer ist der Standardspeicherort der grossen Taxonomiereferenz erneut zu bewerten; bis dahin bleibt
  `%LOCALAPPDATA%` unveraendert. Eine optionale Laufwerkswahl braucht Speicherplatz-, Migrations-,
  Integritaets- und Rueckfallpruefung und darf die Referenz nicht in Git, Pages oder normale Projekt-Backups
  verschieben.
- Phase 12 - Weitere Erweiterungen:
  Affiliate-Links, Shop/Kalender und rechtliche Folgepruefung. Der fruehere Kohlmeisen-Wartepunkt ist aufgehoben.
