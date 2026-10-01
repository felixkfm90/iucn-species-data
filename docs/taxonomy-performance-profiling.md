# Ressourcenmessung des lokalen Master-/Lightroom-Aufbaus

Stand: 2026-09-25

Dieser isolierte Prüfbaustein untersucht die im [Betriebsbericht](taxonomy-operational-checks.md)
dokumentierte Laufzeitstreuung. Er ändert keine produktiven Aufbauregeln und ist keine Freigabe des echten
Gesamtbestands. Quelldownloads und die produktive Auswahl der Anbieter sind weiterhin nicht enthalten.

Verlaufshinweis: Die folgenden Messungen betreffen den experimentellen Stand vom 25. September.
Die anschließend am 26. September integrierte, budgetierte Aufbauregel und deren neue Prüfungen stehen in
[Begrenzter Aufbaupuffer](taxonomy-build-cache.md). Die dortige Anwendung ist keine globale Test-Injektion.

## Messgrenze und Bedienung

Der vorhandene lokale Ablaufvergleich bleibt maßgeblich: Eingänge sichern, Masterworker, Paarworker und
gemeinsame Freigabe. Vollaufbau und Änderungsweg beginnen mit derselben kopierten Basis, die Reihenfolge
wechselt. Vollständige Ergebnis-/Suchvergleiche, eigene Namenswahl, Altleser und unveränderte Ausgangsdateien
bleiben Pflicht. Die zusätzlichen Messwerte entstehen nur bei ausdrücklicher Wahl des Profilmodus:

```powershell
node --no-warnings scripts/taxonomy-pipeline-benchmark.mjs 10000 sparse 3 single --profile
node --no-warnings scripts/taxonomy-pipeline-benchmark.mjs 5000 sparse 2 multi --profile
```

Die schon vorhandenen Grenzen gelten weiter: 10–20.000 Arten, ein bis drei Messpaare, vier Änderungsszenarien.
Ohne `--profile` werden keine Beobachter in Hilfsprozesse geladen. Jede abgeschlossene Gegenprobe gibt zudem
eine kompakte Messzeile aus; ein unvollständiger Lauf bleibt dennoch kein bestandener Gesamtvergleich.

`single` entspricht dem bisherigen künstlichen CoL-Bestand. `multi` ergänzt iNaturalist-Belege für jede Art
und GBIF-Belege für jede zweite Art: bei 5.000 Arten insgesamt 12.500 Quellenbelege. Die zusätzlichen Quellen
enthalten mehrere deutsche/englische Namen und je zwei Auswahlgründe. Releasezeiten wechseln, Identitäten
bleiben gleich; Änderungen werden in sämtlichen betroffenen Quellen konsistent abgebildet. Die Prüfung
kontrolliert ausdrücklich Quellen- und Auswahlbelegzahlen, damit ein still herausgefilterter Anbieter den
Vergleich nicht scheinbar beschleunigt. Dies ist mehr Quellen-/Namensvielfalt, aber kein Abbild sämtlicher
realer Konflikte, Artaufteilungen, Meerestaxa oder Anbieter-Sonderfälle.

## Was die Zähler aussagen

- **Verstrichene Zeit:** lokaler gemessener Ablauf und einzelne Fortschrittsabschnitte. Dateikopie der
  Testbasis, vollständiges Ergebnisorakel und Aufräumen bleiben außerhalb.
- **Prozess-Rechenzeit:** Benutzer- und Kernelzeit für Masterworker und Paarworker getrennt, zusätzlich
  für den Steuerprozess. Sie umfasst alle Threads eines Prozesses; parallele Prüfer können daher mehr
  Rechenzeit als verstrichene Zeit verbrauchen. `Wartezeit = verstrichene Zeit minus Rechenzeit` wäre falsch.
- **Speicher:** Prozess-Spitzen-RSS sowie alle 50 ms und an Fortschrittswechseln beobachtete Maxima für RSS,
  Hauptthread-Heap, externe Speicherbereiche und ArrayBuffer. Beobachtete Maxima sind keine harte RAM-Grenze;
  RSS und Heap messen unterschiedliche Dinge. Prozess-Spitzen-RSS kann auch den Import vor Messbeginn enthalten.
- **Speicherbereinigung:** gemeldete Garbage-Collection-Ereignisse des Hauptthreads mit Anzahl und Dauer.
  Es wird keine Bereinigung erzwungen. Diese Werte sind kein vollständiges Profil sämtlicher Prüfer-Threads.
- **Windows-Ein-/Ausgabe:** optionale Prozesszähler für logische Lese-/Schreiboperationen und Bytes. Sie
  enthalten unter anderem Dateizugriffe und Kommunikation, auch Zugriffe aus dem Betriebssystemcache.
  Sie messen weder physische SSD-Bytes noch allein Wartezeiten auf dem Datenträger. Unverfügbare Werte
  erscheinen ausdrücklich als nicht verfügbar, niemals als gemessene Null.

Die Beobachtung selbst verursacht Aufwand. Profilierte Reihen dürfen nicht ohne Gegenprobe mit früheren
unprofilierten absoluten Zeiten verglichen werden. Phasengrenzen folgen Fortschrittsmeldungen und sind kein
vollständiger CPU-Stacktrace. Die Messung schaltet weder Virenschutz noch Caches ab und ändert keine
Prozessprioritäten oder Energieeinstellungen.

## Windows-Zähler: ausdrückliche Freigabe

`--windows-io` ist zusätzlich zu `--profile` erforderlich. Erst diese Option startet einen versteckten,
lesenden PowerShell-Beobachter für die PID des jeweiligen eigenen Testworkers. Der aktuelle Benutzer hat
am 25. September die prozessgebundene Ausführung für diese Messläufe ausdrücklich erlaubt. Die Option ist
kein Automatismus und keine allgemeine Freigabe für andere Aufgaben oder spätere Sicherheitsänderungen.

Der Aufruf nutzt `-ExecutionPolicy Bypass` ausschließlich für den gestarteten Beobachtungsprozess;
es wird kein `Set-ExecutionPolicy` ausgeführt und keine dauerhafte Richtlinie verändert. Der native
Prozesshandle erlaubt nur eingeschränkte Abfrage und Warten, nicht Beenden oder Verändern eines Prozesses.
Ausgabedateien sind auf den eigenen `Testlauf/pipeline-benchmark-*`-Ordner begrenzt. Bereits vorhandene
Dateien werden nicht überschrieben. Beobachter werden vor dem Entfernen dieses Ordners abgewartet.
Die normalen CI-Tests verwenden **keine** solche Windows-Ausführungsfreigabe.

## Abgrenzung zur Anwendung

Die Messmodule unter `scripts/taxonomy-benchmark-*` werden ausschließlich vom isolierten Ablaufvergleich
geladen. Der Beobachter wird einmal pro Prozess installiert; interne Prüfer-Threads erben zwar den
Node-Importparameter, erzeugen aber keine zweite Messdatei für dieselbe Prozess-ID. Die bestehenden
Master-/Paarworker, ihre Prüfungen, Checkpoints, Transaktionen und Veröffentlichung bleiben unverändert.
Produktive Pfade sind weder Fixture-Quelle noch Ziel des Prüflaufs.

## Kontrollierte Lesepuffer-Gegenprobe

Die normale Messung zeigt erhebliche logische Lesevolumina. Um deren Einfluss zu prüfen, erlaubt der
Benchmark zusätzlich ausschließlich `--cache-8mib` in Verbindung mit `--profile`. Der Test setzt auf den
Hauptthread-Verbindungen der beiden eigenen Worker `PRAGMA cache_size=-8192`. Der bisherige Wert wird
mitgezählt. Das ist ein verbindungslokaler SQLite-Richtwert, keine harte Prozess-Speichergrenze. Interne
Prüfer-Threads bleiben beim bisherigen Standard; die Diagnose ist deshalb kein flächendeckender Pufferumbau.

Es werden weder Journalmodus, Schreibsynchronisierung, Transaktionen noch Prüfungen geändert. Keine
aktive Datenbank wird geändert, keine SQLite-Voreinstellung dauerhaft gespeichert. Neue normale
Verbindungen und sämtliche produktiven Aufrufwege bleiben unberührt. Der Versuch ist noch keine
Übernahmeentscheidung für die Anwendung: Dazu wären ein belastbarer Nutzen, ein Budget für gleichzeitig
offene Verbindungen und die große Betriebsprüfung erforderlich.

## Ausgangsergebnisse mit zusätzlicher Prozessbeobachtung

Windows, Node 24.12.0, 25. September. Alle folgenden Wiederholungen liefen nacheinander, ohne paralleles
Qualitätsgate. Gemeinsame Freigabe, fachliche Tabellen, Suchergebnisse, eigene Namenswahl und alte Leser
bestanden in sämtlichen Messpaaren. Die Beobachtung einschließlich Windows-Zählern war jeweils eingeschaltet.

| Bestand | Messpaar | Änderungsweg | Vollweg |
| --- | --- | --- | --- |
| 10.000 Arten, eine Quelle | 1 | 25,510 s | 33,053 s |
| 10.000 Arten, eine Quelle | 2 | 24,203 s | 27,603 s |
| 10.000 Arten, eine Quelle | 3 | 24,812 s | 32,096 s |
| 5.000 Arten, drei Quellen mit 12.500 Belegen | 1 | 28,347 s | 33,776 s |
| 5.000 Arten, drei Quellen mit 12.500 Belegen | 2 | 28,120 s | 33,509 s |

Ein kleiner Mehranbieter-Vorlauf mit 1.000 Arten prüfte zusätzlich die tatsächliche Verfügbarkeit der
Windows-Zähler. Er ist kein Geschwindigkeitsvergleich mit den größeren Reihen.

### Was damit eingegrenzt ist

Im 10.000er-Vollweg beträgt die Master-Prozesszeit 23,18–27,26 s, die verbrauchte Rechenzeit dazu
22,31–25,89 s. Der langsamere Lauf verbraucht also auch mehr Rechenzeit. Die aufgezeichneten Lesevolumina
sind dabei identisch (6.412 MiB), ebenso die Schreibvolumina bis auf kleine Protokollunterschiede (1.156 MiB).
Die gemeldete Hauptthread-Speicherbereinigung beträgt nur 0,082–0,157 s. Diese Beobachtungen sprechen gegen
lange reine Wartepausen oder Hauptthread-Garbage-Collection als alleinige Erklärung dieser Messreihe.
Sie beweisen aber weder die Ursache aller früheren Ausreißer noch einen bestimmten Hardware-, Virenschutz-
oder Energieverwaltungsfehler. Es wurden keine solchen Einstellungen verändert.

Der Änderungsweg liest trotz weniger Neuberechnungen nicht weniger: bei 10.000 Arten rund 6.588 MiB im
Master und 4.408 MiB in der Paarvorbereitung, gegenüber 6.412 und 3.634 MiB im Vollweg. Die fertigen Dateien
sind nur rund 123 und 78 MiB groß. Das Verhältnis allein belegt keine physischen Mehrfachlesevorgänge der SSD,
zeigt aber erhebliche bestandsabhängige Abfrage-/Prüfarbeit. Der Kernelzeitanteil im Master liegt bei
7,27–9,02 s im Vollweg und 8,02–8,09 s im Änderungsweg.

Beim Mehranbieterbestand braucht der Änderungs-Master rund 20,9 s und 20,3–21,0 s Rechenzeit. Er liest
7.277 MiB; die Paarvorbereitung liest weitere 5.993 MiB. Hauptthread-GC bleibt mit rund 0,20–0,25 s klein.
Prozess-Spitzen-RSS des Masters: 231–281 MiB im Änderungsweg gegenüber 239–240 MiB im Vollweg; der Paarworker
liegt bei etwa 184–185 gegenüber 165–167 MiB. Peaks verschiedener Prozesse dürfen nicht als gleichzeitig
gemessener Gesamt-RAM addiert werden. Ein genereller Speichervorteil ist weiterhin nicht belegt.

## Gegenprobe mit 8-MiB-Testpuffer

Der beobachtete bisherige SQLite-Verbindungswert war durchgehend `cache_size=-2000`, also ein Richtwert von
2.000 KiB. Zwei zusätzliche Messpaare je Bestand verwenden ausschließlich im Test `-8192`:

| Bestand | Messpaar | Änderungsweg | Vollweg |
| --- | --- | --- | --- |
| 10.000 Arten, eine Quelle | 1 | 12,767 s | 15,358 s |
| 10.000 Arten, eine Quelle | 2 | 12,892 s | 15,374 s |
| 5.000 Arten, drei Quellen | 1 | 14,629 s | 16,473 s |
| 5.000 Arten, drei Quellen | 2 | 14,573 s | 16,434 s |

Sämtliche Ergebnis-, Quellen-, Präferenz- und Leserprüfungen bestanden. Die Dateigrößen sind unverändert.
Beim 10.000er-Änderungs-Master sinken die logischen Lesemengen von 6.588 auf 2.782 MiB und die Schreibmengen
von 1.240 auf 571 MiB. Die Kernelzeit sinkt von rund 8,0–8,1 auf 2,8–2,9 s, die gesamte Rechenzeit auf
9,3–9,7 s. Auch der Vollweg profitiert: 2.523 statt 6.412 MiB gelesen und 507 statt 1.156 MiB geschrieben.
Journalmodus, Synchronisierung und sämtliche Prüfungen waren dabei unverändert. Der größere Verbindungspuffer
reduziert wiederholte Ein-/Ausgaben; nicht jede geschriebene SQLite-Seite muss bereits eine zusätzliche
fachliche Änderung darstellen.

Die Gegenprobe mit mehreren Anbietern bestätigt den Zusammenhang: Änderungs-Master 3.289 statt 7.277 MiB
gelesen und 671 statt 1.325 MiB geschrieben; Rechenzeit rund 10,5–10,8 statt 20,3–21,0 s. Die Paarvorbereitung
profitiert ebenfalls, aber schwächer, da deren paralleler Prüfer bewusst unverändert bleibt.

Die Speichergrenze bleibt wichtig: Beim 10.000er-Änderungs-Master liegen die beobachteten Spitzen bei
293–303 MiB, beim Vollweg 272–274 MiB. Beim Mehranbieter-Änderungsweg sind es 286–300 MiB statt zuvor
231–281 MiB. Der neue Puffer ist also keine Speicheroptimierung. Die Zählung von insgesamt 16 Master-
beziehungsweise sieben Paarverbindungen im Änderungsweg ist **keine** Zählung gleichzeitig offener
Verbindungen. Vor einer produktiven Übernahme muss deren gleichzeitiges Budget separat geprüft werden.

## Rückkehr zum Standard: entscheidende Kontrollmessung

Nach den Pufferreihen wurde je ein weiteres Messpaar ohne Pufferänderung ausgeführt. Auch diese normalen
Verbindungen waren nun deutlich schneller als zu Beginn, obwohl ihre logischen Ein-/Ausgabemengen wieder
auf die Ausgangswerte stiegen. Deshalb darf der Unterschied zwischen erster Reihe und Pufferreihe **nicht**
vollständig dem größeren Puffer zugeschrieben werden:

| Bestand | Spätere Standard-Rückprobe, Änderungsweg | 8-MiB-Test, Änderungsweg | Beobachteter Vorsprung zur Rückprobe |
| --- | --- | --- | --- |
| 10.000 Arten, eine Quelle | 14,993 s | 12,767–12,892 s | etwa 14–15 % |
| 5.000 Arten, drei Quellen | 16,804 s | 14,573–14,629 s | etwa 13 % |

Der Standard-Vollweg benötigte in dieser Rückprobe 17,719 beziehungsweise 19,710 s. Mit Testpuffer waren
es 15,358–15,374 beziehungsweise 16,434–16,473 s. Beide Aufbauwege profitieren in dieser Gegenüberstellung;
es handelt sich nicht um einen ausschließlich inkrementellen Vorteil. Eine einzelne spätere Standardprobe
ist zudem keine statistisch abgesicherte Geschwindigkeitsgarantie. Die Behauptung „doppelt so schnell durch
den Puffer“ wäre durch diese Reihen **nicht belegt**.

Die logischen Mengen bestätigen dagegen einen reproduzierten Zusammenhang: Beim 10.000er-Änderungs-Master
kehrt der Standard auf 6.588 MiB Lesen / 1.240 MiB Schreiben zurück, beim Mehranbieter-Master auf
7.277 / 1.325 MiB. Im 8-MiB-Test waren es 2.782 / 571 beziehungsweise 3.289 / 671 MiB. Die Paarvorbereitung
zeigt dieselbe Richtung. Die Standard-Rückprobe verbraucht ebenfalls weniger Rechenzeit als die erste Reihe:
10,999 statt 18,312–19,640 s im 10.000er-Änderungs-Master. Ungeklärte Laufzeit-/Umgebungseinflüsse bestehen also
zusätzlich zur nun eingegrenzten Ein-/Ausgabearbeit. Keine Aussage über eine bestimmte Hardwareursache und
keine Hochrechnung auf den realen Gesamtkatalog.

## Abschluss und nächster Schritt

- Alle elf großen Messpaare einschließlich der Rückproben bestanden den vollständigen fachlichen Vergleich.
  Ausgangsdateien blieben unverändert; eigene Namenswahl, gemeinsame Freigabe und offene Altleser bestanden.
- Der gezielte Vergleichstest umfasst jetzt 15 erfolgreiche Tests. Acht Ergänzungen sichern die
  Ressourcenmessung, Mehranbieter-Fixtures, vier Änderungsszenarien und den ausschließlich testlokalen Puffer
  einschließlich unveränderter Transaktions-/Constraint-Prüfungen ab.
- Anschließend bestand `npm.cmd run --silent quality:ci` mit Exitcode 0, darunter 213 Master-/Betriebs-
  und 155 Lightroom-/Pakettests. Das Gate lief nicht während der Messreihen. Projektstatus synchron;
  Syntax, Stil, Dokumentationsverweise, Schema, Medien und lokales Projekt-/Assetaudit erfolgreich.
- Keine produktive Aktivierung, keine Änderung produktiver SQLite-Puffer, keine dauerhafte Änderung einer
  Windows-Richtlinie und keine Änderung des Lua-Plug-ins (0.4.24.14). Squarespace-Footer geprüft: kein dort
  eingebundenes Modul geändert. Die vorbestehenden Änderungen anderer Arbeitsschritte bleiben erhalten.
- Eigene Testdatenbanken und zehn temporäre Mess-/Prüfprotokolle sind nach Auswertung entfernt; Messwerte
  und Grenzen stehen in diesem Bericht. Andere Dateien unter `Testlauf/` bleiben unberührt.

Als Nächstes ist eine gezielte Pufferregel für die tatsächlichen Aufbauverbindungen zu entwerfen und
abzusichern: gleichzeitig offene Verbindungen und Speicherbudget, Gültigkeit nur während des Aufbaus,
Fehler-/Abbruch-/Fortsetzungsverhalten und Rollback. Die Test-Injektion über Prototypen ist **kein**
Produktionsentwurf. Erst nach dieser Absicherung den integrierten Größenvergleich ohne Mess-Injektion
wiederholen und den realen Betriebs-/Großbestandslauf vorbereiten. Vollständige Prüfungen bleiben Pflicht.
Die übrige Zeitstreuung, das Gesamtleistungsziel und Phase 10 sind nicht abgeschlossen.
