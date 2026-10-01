# Begrenzter SQLite-Puffer während des Aufbaus

Stand: 2026-10-01

Die [Ressourcenmessung](taxonomy-performance-profiling.md) begründet diesen begrenzten Umsetzungsschritt.
Ein größerer Verbindungspuffer verringert wiederholte logische SQLite-Ein-/Ausgaben, ersetzt aber keine
Fachprüfung und keinen Vollbestandsvergleich. Aktive Datenbanken werden dadurch weder migriert noch neu aufgebaut.

Der aktuelle Code einschließlich dieser Pufferregel wurde inzwischen im bestätigten produktiven Reparatur-/Paarweg
verwendet; vollständiger [Abschlussnachweis](taxonomy-partial-source-recovery.md) am 1. Oktober erfolgreich.
Das ist kein isolierter Nachweis eines Puffergeschwindigkeitsfaktors und kein erneuter Vergleich regulärer
Quellenupdates. Historische Messungen unten bleiben unverändert.

## Geltungsbereich

`taxonomy-build-cache.mjs` stellt einen ausdrücklich betretenen asynchronen Aufbaubereich bereit:

- Master-Kandidatenbau einschließlich Eingangsvergleich, Abhängigkeitsplanung, Wiederverwendung und Prüfung;
- Lightroom-Suchpaketbau einschließlich vorbereitender und abschließender Prüfung;
- gemeinsame Paarvorbereitung einschließlich Rücknahmeprüfung, nicht der spätere Aktivzeigerwechsel.

Verschachtelte Schritte teilen ihren Bereich. Unabhängige parallele Bereiche teilen das Verbindungsbudget
derselben JavaScript-Laufzeit. Normale Suchen, bestehende Leser, Katalogmetadaten und Korrektur-Schnellwege
betreten diesen Bereich nicht. Der separate Paket-Prüfthread erhält keinen größeren Puffer. Die Funktion
konfiguriert ausdrücklich nur neu geöffnete Aufbau-/Prüfverbindungen; keine globalen Prototypänderungen.

## Budget und Rückfall

- Höchstens **acht** gleichzeitig reservierte Hauptdatenbanken je JavaScript-Laufzeit/Worker erhalten
  `PRAGMA main.cache_size=-8192`: je 8 MiB, zusammen 64 MiB als SQLite-Richtwert.
- Weitere Verbindungen bleiben beim unveränderten Standard. Ein erschöpftes Pufferbudget ist kein
  fachlicher Fehler und verhindert keinen Aufbau. Geschlossene Handles geben ihre Plätze für neue frei.
- Angefügte Datenbanken (`ATTACH`), temporäre Datenbanken und weitere Threads erhalten keine Erhöhung.
  Ihre bisherigen Puffer sind zusätzlich zu berücksichtigen. Normale Leser bleiben ebenfalls außerhalb.
- Der Richtwert ist **keine harte Speicherobergrenze**: SQLite kann zusätzlich Speicher benötigen; JavaScript-
  Objekte, Abfrageergebnisse, andere Threads und Prozesse zählen nicht in dieses Budget. 64 MiB ist daher
  ausdrücklich keine Zusage für gesamten Prozess-RAM oder einen anwendungsweiten Mehrprozessdeckel.
- Der Master- und Paarworker desselben Aufbaus laufen nacheinander. Getrennte Prozesse haben getrennte
  Budgets; gleichzeitig geöffnete Verbraucher behalten ihre bisherigen Verbindungen.

Geändert wird ausschließlich der verbindungslokale Pufferwert der Hauptdatenbank. Journalmodus,
Schreibsynchronisierung, Transaktionen, Constraints, Checkpoints, Prüfsummen und Quellen-/Identitätsprüfungen
bleiben unverändert. Es werden weder Prüfergebnisse noch Modellentscheidungen zwischengespeichert.

## Abschluss, Fehler und Wiederanlauf

Die bisherigen Besitzer schließen ihre Handles weiterhin selbst in ihren Abschlussblöcken. Der Aufbaubereich
entfernt abgeschlossene Reservierungen; ein absichtlich länger lebender Handle erhält seinen vorherigen
Pufferwert zurück, ohne geschlossen zu werden. Auch nach Fehlern werden sämtliche eigenen Reservierungen
bearbeitet. Scheitert die Rückstellung, wird der betreffende Handle geschlossen und der Fehler gemeldet;
ein trotzdem offen gebliebener Fehlerhandle behält seine Reservierung. Die ursprüngliche Aufbaufehlerursache
bleibt in einer zusammengefassten Fehlermeldung erhalten. Andere parallele Bereiche werden nicht zurückgestellt.

Ein Konfigurationsfehler schließt den gerade geöffneten Handle vor Weitergabe des Fehlers. Nach Abbruch
oder Prozessverlust existiert keine dauerhaft gespeicherte Puffereinstellung. Die Fortsetzung öffnet neue
Verbindungen und erhält das Budget erneut. Ein verspäteter asynchroner Nachläufer eines bereits abgeschlossenen
Bereichs bekommt keinen größeren Puffer. Eine Rücknahme verändert weiterhin nur das nach Prüfung bestätigte Paar.

## Prüfabschluss

Acht direkte Puffertests prüfen Bereichsgrenzen, unveränderte normale Leser/angehängte Datenbanken,
Budgetüberschreitung, parallele Bereiche, verschachtelte Aufrufe, Konfigurations-/Rückstellfehler,
späte Nachläufer, Transaktionen und Constraints sowie Bytegleichheit einer schreibgeschützten Quelldatei.
Die vorhandenen Master-Pausen-/Fortsetzungs- und Paket-Abbruchtests kontrollieren jetzt zusätzlich die
tatsächlich genutzten und anschließend freigegebenen Reservierungen. Die profilierte kleine Prozessprobe
liest nur die internen Budgetzähler: beide echten Worker nutzen die Regel, bleiben innerhalb von acht
Reservierungen und melden nach Abschluss null aktive Reservierungen; keine experimentelle Puffer-Injektion.

Der erste gezielte Lauf bestand 58 Tests einschließlich hartem Workerabbruch, Fortsetzung, Paketfehlern,
Namenswahl, offenen Lesern und Rücknahme. Der Größenvergleich ist abgeschlossen; das vollständige
`npm.cmd run --silent quality:ci` bestand am 27. September (Exitcode 0), darunter 221 Master-/Betriebs- und
155 Lightroom-/Pakettests. Die parallele Sound-Ergänzung wurde dabei mit geprüft. Keine produktive
Großbestandsfreigabe aus den künstlichen Beständen.

### Abgeschlossener integrierter Größenvergleich

Windows, Node 24.12.0, 26. September. Kein `--profile`, kein `--windows-io`, kein `--cache-8mib`:
Die Messung verwendet ausschließlich die eingebaute Regel. Auftragssicherung, beide Hilfsprozesse,
vollständige Prüfungen und gemeinsame Freigabe sind enthalten. Downloads und reale Anbieterauswahl sind
nicht enthalten; Testbasis-Kopie, Ergebnisorakel und Aufräumen bleiben außerhalb des gemessenen Zeitfensters.

| Bestand | Messpaar | Änderungsweg | Verbesserter Vollweg |
| --- | --- | --- | --- |
| 10.000 Arten, eine Quelle | 1 | 12,795 s | 15,630 s |
| 10.000 Arten, eine Quelle | 2, umgekehrte Reihenfolge | 13,123 s | 16,519 s |
| 5.000 Arten, 12.500 Mehranbieter-Belege | 1 | 14,452 s | 16,445 s |
| 5.000 Arten, 12.500 Mehranbieter-Belege | 2, umgekehrte Reihenfolge | 14,553 s | 16,440 s |
| 20.000 Arten, eine Quelle | 1 | 28,196 s | 33,389 s |

Alle Fach-/Suchvergleiche bestanden; eigene Namenswahl, offene Altleser und Ausgangsdateien bleiben erhalten.
Der Änderungsweg liegt bei 10.000 Arten etwa 18–21 %, bei den Mehranbieter-Belegen etwa 11–12 % und beim
einzigen 20.000er-Paar etwa 16 % vor dem ebenfalls verbesserten Vollweg. Der große Vergleich hat nur ein
Messpaar und belegt keine Wiederholbarkeit. Das ist der
gemeinsame Effekt der bisherigen inkrementellen Arbeit **und** dieser Pufferintegration, nicht der isolierte
Gewinn durch den Puffer allein.

Die unmittelbar vor der Integration am 25. September unprofiliert gemessene Standardreihe benötigte
24,846 / 24,950 s im Änderungsweg und 32,152 / 32,364 s im Vollweg. Wie bereits in der Ressourcenprüfung
nachgewiesen, schwanken auch unveränderte Standardzeiten stark. Dieser datumsübergreifende Vorher-/Nachher-
Vergleich belegt daher keinen isolierten Faktor zwei und ist keine Hochrechnung auf den realen Bestand.

Masterbau/Paarvorbereitung im Änderungsweg: 9,329/3,244 und 9,658/3,191 s (10.000),
9,906/4,266 und 10,046/4,235 s (Mehranbieter), 20,556/7,202 s (20.000). Im Vollweg:
11,841/3,572 und 12,198/4,093 s, 11,685/4,481 und 11,689/4,476 s, 24,969/7,975 s.
Die Differenz zur Gesamtzeit ist die Auftragssicherung. Die Vergleichsgrundlagen blieben unverändert;
alle fünf Paare bestehen Fachgleichheit, Suchgleichheit, eigene Namenswahl und offene Altleser.

Nächster Schritt ist die vorbereitete produktive Betriebs-/Großbestandsabnahme, nicht ein weiterer
synthetischer Zeitgewinn ohne neue Fragestellung. Platz/Backup, reale Anbieterstände und offene Verbraucher
müssen vor dem ausdrücklich gestarteten Lauf geprüft werden. Keine produktive Aktivierung in diesem Schritt;
Phase 10 und der Nachweis einer deutlichen Beschleunigung des realen Gesamtupdates bleiben offen.

Die eigenen sechs temporären Vergleichs-/Testprotokolle und zwei Gate-Protokolle wurden nach Übernahme
dieser Ergebnisse entfernt; ältere fremde Testdateien bleiben erhalten. Keine Produktivdaten, Lua- oder
Squarespace-Moduländerung, kein Commit und kein Push in diesem Schritt.
