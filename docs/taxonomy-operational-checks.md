# Isolierte Taxonomie-Betriebs- und Größenprüfung

Stand: 2026-10-01

## Umfang und Grenzen

Dieser Nachweis betrifft ausschließlich künstlich erzeugte Testbestände unter `Testlauf/`.
Es wurden keine produktiven Quellen aktualisiert, keine produktiven Datenbanken aktiviert oder bereinigt
und keine Lightroom-Fotos verändert. Echte Hilfsprozesse und SQLite-Leser sind Bestandteil des Tests,
nicht aber ein geöffnetes Lightroom-Fenster oder ein neu gestarteter produktiver Arten-Explorer.
Dies ist kein Phase-10-Abschlussaudit und keine Freigabe für den vollständigen Anbieterbestand.

Späterer produktiver Nachweis, außerhalb dieser synthetischen Messreihen: Der enge Reparaturmaster und das
Lightroom-Paket sind am 1. Oktober gemeinsam aktiviert und vollständig verglichen; Felix bestätigte danach
Weissstorch/Rebhuhn in beiden Verbrauchern und nach Schließen/Wiederöffnen. Details im
[Reparaturabschluss](taxonomy-partial-source-recovery.md) und [aktuellen Betriebsstand](taxonomy-current-status.md).
Dies schließt die gezielte Reparaturabnahme, nicht die folgenden regulären Update-/Leistungs-/Rollbackgrenzen.

## Zusammenhängender Betriebscheck

Erneute Prüfung am 4. Oktober nach dem produktiven Datenpfadwechsel: der isolierte 5.000-Arten-Lauf besteht
erneut. Checkpoint 500, 4.940 wiederverwendete Taxa, inkrementelles Paket gleich Vollpaket, offene Leser und
eigene Namenswahl erhalten, gemeinsame Rücknahme bestanden. Lauf liegt ausschließlich im neuen
`temp/benchmarks`; kein produktiver Quellen-/Master-/Paketlauf oder Rollback. Die folgenden Zeiten sind
ausdrücklich frühere Messungen, keine heutigen Laufzeitversprechen.

`node --no-warnings scripts/taxonomy-operation-check.mjs 2000` erzeugt einen eigenen Testbestand;
zulässig sind 1.200 bis 20.000 synthetische Arten. Der Aufruf akzeptiert keine produktiven Zielpfade.
Jeder Lauf entfernt ausschließlich seinen selbst erzeugten, auf Elternpfad und Namensmuster geprüften
Ordner `temp/benchmarks/taxonomy-operation-*`. Fremde Testdateien bleiben unverändert.

Der Ablauf prüft:

1. Vollständigen ersten Masterworker und gemeinsame Master-/Suchpaketfreigabe.
2. Zweiten Quellenstand mit wenigen Namensänderungen bei beibehaltener eigener Namenspräferenz.
3. Gezieltes hartes Beenden ausschließlich des selbst gestarteten Testworkers nach einem bestätigten
   Schreibblock; gespeicherter Zähler und tatsächlich vorhandene Arten müssen übereinstimmen.
4. Fortsetzung in einem neuen Prozess, unveränderte Prüfsummen des vorher aktiven Paars und erwartete Artenzahl.
5. Gemeinsame Freigabe aus einem echten Paarworker bei weiterhin geöffneten alten Master-/Suchpaketlesern.
   Die Ereignisschleife des aufrufenden Prozesses muss während der Vorbereitung weiterlaufen.
6. Inkrementelles Lightroom-Suchpaket gegen einen vollständigen Paketaufbau aus demselben neuen Master:
   alle sieben Fach-/Suchtabellen, ausgenommen künstliche Suchzeilen-IDs, müssen übereinstimmen.
   Die Suchfunktion wird zusätzlich mit geändertem Namen und eigener Namenspräferenz geprüft.
7. Rücknahme auf den ersten Master-/Paketstand mit weiterhin geöffneten Lesern beider Generationen.
   Neue Leser müssen gemeinsam den zurückgenommenen Stand sehen; alte Leser bleiben benutzbar.
   Eigene Namenswahl und ursprüngliche Dateiprüfsummen bleiben erhalten.

Die kleine 1.200-Arten-Variante und Eingangsgrenzen sind über zwei Tests in `test:taxonomy-master` und
damit `quality:ci` eingebunden. Der erste gezielte Lauf bestand mit zwei erfolgreichen Tests.
Die hier ausgewiesenen Abschnittszeiten umfassen jeweils auch Prozessstart und die Prüfungen dieses Abschnitts;
sie sind nicht direkt mit der reinen Kandidatenbauzeit des folgenden Benchmarks vergleichbar.

Der größere zusammenhängende Lauf mit **5.000 Arten** bestand ebenfalls: Abbruch bei 500 bestätigten Arten,
Fortsetzung bis 5.000, davon 4.940 wiederverwendet. Fünf geänderte Anbieternamen betreffen 50 Arten;
die Gattung mit der eigenen Korrektur wird vorsichtshalber ebenfalls neu berechnet.
Das inkrementelle Paket entspricht dem vollständigen Paketaufbau. Alte Leser beider Generationen bleiben
benutzbar, neue Leser sehen nach Rollback wieder gemeinsam den ersten Stand, eigene Namenswahl bleibt erhalten.

Gemessene Abschnittszeiten dieses einen Betriebschecks:

| Abschnitt | Dauer |
| --- | --- |
| Erster Masteraufbau im Worker | 6,54 s |
| Erste gemeinsame Freigabe einschließlich Paketbau | 1,79 s |
| Zweiter Aufbau bis zum gezielten Prozessabbruch | 1,30 s |
| Fortsetzung einschließlich erneuter Eingangsprüfung | 7,33 s |
| Gemeinsame Freigabe des geänderten Masters einschließlich Delta-Paketbau | 3,11 s |
| Separater vollständiger Paketbau zum Ergebnisvergleich | 0,84 s |
| Rücknahme einschließlich Paarprüfung | 0,44 s |

Freigabe und separater Paketbau sind unterschiedliche Umfänge: Die Freigabe enthält zusätzlich Prozessstart,
Masterkopie, mehrfachen Integritäts-/Prüfsummenabgleich, Eingangsprüfung und Zeigerwechsel. Aus diesen Zeiten
folgt **kein** Geschwindigkeitsvergleich Delta-Paket gegen Vollpaket. Während der zweiten Freigabe lief der
10-ms-Kontrolltimer des Elternprozesses 200-mal; das belegt verfügbare Ereignisschleifenzeit, aber keine
zugesagte maximale Antwortlatenz. Der gesonderte Paket-Leistungsvergleich mit gleichen Messgrenzen folgt unten.

## Wiederholter Größenvergleich

Werkzeug: `scripts/taxonomy-master-benchmark.mjs`, Windows, Node 24.12.0.
Verglichen werden frische getrennte Prozesse und dieselben Eingänge/Ausgangsdaten mit wechselnder Reihenfolge.
Der Benchmark misst nur den Kandidatenbau: Kopie des Test-Ausgangsmasters und semantischer Ergebnisvergleich
sind nicht in der gemessenen Aufbauzeit enthalten. Alle Mastertabellen werden einschließlich Quellenbelegen
und Suchindex verglichen; der Ausgangsmaster muss bytegleich bleiben.

| Testbestand / Änderungen | Wiederverwendung | Erzwungener Vollaufbau | Übernommene Arten |
| --- | --- | --- | --- |
| 10.000 Arten, zehn Namen / 100 abhängige Arten | 14,58 s; 14,53 s | 16,46 s; 16,53 s | 9.900 |
| 20.000 Arten, 20 Namen / 200 abhängige Arten | 30,71 s; 30,66 s | 34,71 s; 34,64 s | 19.800 |

Bei 10.000 Arten stimmen sämtliche verglichenen Daten in beiden Messpaaren überein.
Die Wiederverwendung ist in diesen Messpaaren rund 11 bis 12 Prozent schneller. Prozess-Spitzen-RSS vor
Ergebnisvergleich: 240 bis 302 MiB mit Wiederverwendung gegenüber 271 bis 274 MiB beim Vollaufbau.
Die Ergebnisdatenbank benötigt in beiden Wegen rund 121,3 MiB, der zusätzliche Wiederverwendungsplan 12,5 MiB.

Auch die beiden 20.000-Arten-Messpaare stimmen in sämtlichen verglichenen Tabellen überein. Der Änderungsaufbau
ist hier rund 11,5 Prozent schneller. Spitzen-RSS: 354 bis 355 MiB gegenüber 428 bis 429 MiB beim Vollaufbau.
Die Ergebnisdatenbank belegt in beiden Wegen 243,2 MiB; zusätzlicher Wiederverwendungsplan: 25,2 MiB.
Die verdoppelte Zahl einfacher Testarten führt ungefähr zur doppelten Kandidatenbauzeit. Das ist keine
Skalierungszusage für wesentlich größere oder fachlich komplexere Bestände.

Die früher dokumentierten langsamen Ausreißer wurden in diesen vier Messpaaren nicht reproduziert.
Ihre Ursache ist damit **nicht** erklärt oder behoben. Die Streuung des Spitzen-RSS erlaubt ebenso wenig
eine pauschale Aussage, dass der Änderungsaufbau grundsätzlich weniger Arbeitsspeicher benötigt.
Keine Hochrechnung auf CoL-Vollbestand, mehrere Anbieter, Konfliktmengen, Download oder vollständige Laufdauer.

## Vergleichbarer Paket-Leistungstest: erster Befund und Folgeumbau

Aufruf: `node --no-warnings scripts/lightroom-package-benchmark.mjs 10000 sparse 2`.
Das neue Werkzeug erzeugt zwei synthetische Masterstände und ein vollständiges Ausgangspaket ausschließlich
unter einem eigenen `Testlauf/package-benchmark-*`-Ordner. Keine produktiven Zielpfade als Argument möglich.
Es startet für jede Variante einen frischen Prozess, wechselt die Reihenfolge Delta/Voll und Voll/Delta
und entfernt anschließend nur seinen eigenen auf Elternpfad und Namensmuster geprüften Testordner.

Messgrenze ist der vollständige Aufruf von `buildLightroomSearchPackage`: Quellprüfung, bei Delta zusätzlich
Basisprüfung/-kopie, Exportprojektion, Suchindex-/Deltaarbeit, Ergebnisprüfung, Manifest und Übergabe in den
eigenen Stagingbereich. Erstellung der Testeingänge und nachgelagerter unabhängiger Ergebnisvergleich zählen
nicht zur Aufbauzeit. Beide Wege verwenden denselben Quellmaster und dieselben festen Exportparameter.
Prozessstart ist nicht in der gemessenen Aufbauzeit enthalten. Kein Test einer produktiven Paaraktivierung.

Der nachgelagerte Vergleich prüft alle sieben Fach-/Suchtabellen und `package_info` einschließlich
Identitätsregister und Provenienz. Ausgenommen sind nur die zufällige Paket-ID und künstliche Suchzeilen-IDs;
mehrfach vorhandene gleiche Suchbelege werden nicht zusammengefasst. Volltextindex-Integrität und Ergebnisse
fünf echter Suchabfragen müssen übereinstimmen. Prüfsummen des Quellmasters, Ausgangspakets und beider
Manifeste müssen nach jedem Lauf unverändert sein. Diese Prüfungen lagen bei allen folgenden Messpaaren vor.
Seit dem Teilprojektionsumbau wird zusätzlich die neue interne Fingerabdrucktabelle `export_input` verglichen.

### Historischer Ausgangsbefund vor der Teilprojektion

| 10.000 synthetische Arten, zehn geänderte deutsche Namen | Delta | Vollaufbau |
| --- | --- | --- |
| Vor Optimierung, 20. September, Messpaar 1 / 2 | 6,13 s / 6,34 s | 1,80 s / 1,79 s |
| Nach Optimierung, 21. September, Messpaar 1 / 2 | 3,17 s / 3,28 s | 1,83 s / 1,84 s |

Optimiert wurden zwei Abgleiche in `lightroom-search-delta.mjs`: gleicher Inhalt unter gleicher Suchzeilen-ID
wird vor dem aufwendigen Duplikat-/Umsortierungsabgleich erkannt; Tabellenunterschiede werden per Primärschlüssel
gesucht statt vollständige Zeilenmengen zweimal zu sortieren. Alle Felder einschließlich NULL-Werten bleiben
maßgeblich. Integritäts-, Herkunfts- und Prüfsummenprüfungen wurden nicht abgeschwächt.

**Bewertung dieses Zwischenstands: Das Ziel einer deutlichen Beschleunigung ist nicht erreicht.** Delta ist nach dieser Optimierung
noch etwa 1,7–1,8-mal so langsam wie Vollaufbau. Die Halbierung gegenüber dem vorherigen Deltaweg ist ein
Zwischenergebnis, keine erfolgreiche Leistungsabnahme. Ebenso sind die oben gemessenen 11–12 % Mastergewinn
kein Beleg für eine deutliche Beschleunigung des gesamten Updateablaufs.

Die zehn geänderten Namen verursachen 20 neue und 20 ersetzte Suchbelege: ausgewählter Name und Anbieterbeleg
bleiben getrennt erhalten. Hierarchien und Projektverknüpfungen sind unverändert. Wegen neuer Quellenversionen
und Zeitangaben ändern sich trotzdem je 10.000 Zeilen in `taxon`, `taxon_status` und `taxon_provider` sowie
globale Paket-/Anbieterangaben. Es wäre daher falsch, hier nur 20 Änderungen für das gesamte Paket zu behaupten
oder aktuelle Provenienz zur Beschleunigung still wegzulassen.

Nach Optimierung beträgt Prozess-Spitzen-RSS vor dem Ergebnisvergleich 122,4/124,7 MiB für Delta gegenüber
114,5/111,6 MiB für Vollaufbau. Die fertige Datenbank belegt bei beiden Wegen 76,70 MiB. Der höchste an
Fortschrittsereignissen beobachtete Platzbedarf im Test-Ausgabeordner beträgt 108,80 MiB für Delta und
76,70 MiB für Vollaufbau. Dies ist **kein** verlässlicher Gesamt-Spitzenwert: SQLite-System-Temporärdateien,
Testquelle und Ausgangspaket sind nicht darin enthalten. Eine Speicherfreigabe darf daraus nicht abgeleitet werden.

Die Zeitabschnitte lokalisieren die Mehrarbeit näherungsweise: Delta benötigt rund 0,79–0,81 s vor der Projektion,
0,59 s für Kopie/Projektion, 0,99–1,10 s im Index-/Abgleichabschnitt und 0,78–0,79 s zur Ergebnisprüfung.
Vollaufbau benötigt dafür etwa 0,10 s, 0,50–0,52 s, 0,46–0,47 s und 0,75–0,77 s.
Die Abschnitte folgen Fortschrittsmeldungen und sind kein feingranulares Funktionsprofil.
Dieser Zwischenstand erstellte noch eine vollständige Zwischen-Datenbank und glich sie danach mit der alten ab.

### Daraus abgeleiteter Umsetzungsschritt

Eine gezielte Paketprojektion muss diese doppelte Bestandsarbeit ersetzen. Dafür sind erforderlich:

- Eine vollständige Änderungsmenge, gebunden an verifizierten Basismaster, Basispaket, Eingänge, Schema und
  Exportregeln. Nicht nur geänderte Namen, sondern auch neue/gelöschte Taxa und abhängige Daten erfassen.
- Nur betroffene Taxa, Hierarchien und Suchbelege neu projizieren; globale Quellenversionen und geänderte
  Herkunfts-/Zeitangaben korrekt nachführen. Keine veralteten Belege zur Laufzeitverbesserung akzeptieren.
- Unklare Basis, unvollständige Änderungsmenge oder inkompatible Regeln verlangen den vollständigen Rückfallweg.
  Unveränderte Suchbeleg-IDs, Duplikatzahlen, lokale Präferenzen und Identitätsregister bleiben korrekt erhalten.
- Unabhängiger Vergleich gegen Vollaufbau, Abbruch-/Fehler-/Wiederanlauffälle und erneute vergleichbare
  Laufzeit-/Speichermessungen bei unveränderten, wenigen, vielen und strukturellen Änderungen.

Dieser gezielte Export wurde anschließend umgesetzt. Der Vertrag steht in `lightroom-incremental-export.md`.
Das übergeordnete Leistungsziel bleibt vor Audit und produktiver Großbestandsfreigabe offen.

### Ergebnis des Teilprojektionsumbaus vom 21. September

Bei 10.000 Testarten mit zehn geänderten Namen wurden nur zehn Taxa in die Zwischenprojektion geschrieben.
Die übrigen 9.990 Taxa behalten ihre fachlichen Tabellen-/Suchbelege; ihre aktuellen Herkunfts-/Zeitangaben
werden getrennt nachgeführt. Neue/entfernte Arten, Quellenverluste, ausgewählte Felder, Status-/Konfliktfilter,
Projektlinks und Suchbelege fließen in die gebundene Änderungsmenge ein. Fehlende/veraltete Vergleichsgrundlage
verlangt einen Vollaufbau. Bei mindestens 1.000 Taxa und mehr als 50 % fachlich geänderten Taxa wird ebenfalls
der Vollpfad verwendet. Diese Rückfallgrenze ist eine konservative Regel, kein universell gemessenes Optimum.

Der erste Test der reinen Teilprojektion benötigte noch 2,32/2,44 s gegenüber 2,20/2,18 s im Vollpfad.
Anschließend wurde die vollständige, rein lesende Basisprüfung in einen parallel arbeitenden Workerthread
verlagert. Ihr erfolgreicher Abschluss mit exakt passender Paket-ID und Dateiprüfsumme bleibt Voraussetzung
für die Freigabe. Die Ergebnisprüfung und die Herkunfts-/Quellprüfungen bleiben ebenfalls erhalten.

| Bestand / Änderungen, wiederholte Messpaare | Gezielter Export mit paralleler Prüfung | Heutiger Vollaufbau |
| --- | --- | --- |
| 10.000 Arten / zehn Namen | 1,78 s / 1,87 s | 2,17 s / 2,19 s |
| 20.000 Arten / 20 Namen | 4,68 s / 3,82 s | 6,51 s / 4,85 s |

Das sind rund 15–18 % weniger Zeit als im **heutigen** Vollpfad. Dieser Vollpfad erzeugt allerdings ebenfalls
die neue Fingerabdruckgrundlage und ist dadurch langsamer als der frühere Vollpfad mit etwa 1,8 s.
Gegenüber diesem früheren Ablauf ist beim 10.000-Arten-Bestand noch kein wesentlicher Laufzeitgewinn belegt.
Weder diese neue Messbasis noch der vorher langsame Deltaweg dürfen als alleiniger Vergleich einen bereits
erreichten großen Gesamtgewinn suggerieren.

Bei 20.000 Arten werden nur 20 Taxa fachlich exportiert, weitere 19.980 Herkunfts-/Zeitzeilen je betroffener
Tabelle nachgeführt. Vollständige Ergebnisse, Fingerabdrücke und Suchabfragen stimmen in beiden Messpaaren
überein; Quelle und Basis bleiben unverändert. Die beiden Messpaare sind gegenüber dem heutigen Vollpfad
rund 28 beziehungsweise 21 % schneller. Die deutliche Zeitstreuung liegt vor allem im Prüfabschnitt:
beim Vollpfad 3,34 gegenüber 1,72 s. Ihre Ursache ist nicht abschließend erklärt; kein garantierter Faktor
und keine Hochrechnung auf reale Großbestände. Ein separater erster 20.000-Arten-Lauf bestand ebenfalls,
seine abgeschnittene Werkzeugausgabe wird nicht als vollständige Zahlengrundlage verwendet.

Prozess-Spitzen-RSS bei 10.000 Arten: 185,8/185,6 MiB für Teilprojektion einschließlich Prüfthread gegenüber
169,2/170,2 MiB für heutigen Vollaufbau. Die neue Paketdatei belegt 77,86 MiB, davon etwa 1,16 MiB zusätzliche
Vergleichsgrundlage gegenüber dem alten Format. Beobachtete Arbeitsdateien: rund 79,10 MiB für Teilprojektion
und 77,86 MiB für Vollaufbau. Dieselben Einschränkungen der Platz-/RSS-Messung wie oben gelten weiterhin;
der Speicherbedarf wurde nicht pauschal reduziert.
Bei 20.000 Arten beträgt Spitzen-RSS einschließlich Prüfthread 240,1/240,9 MiB gegenüber 219,0/219,4 MiB
für Vollaufbau. Ergebnisdatei: 156,21 MiB; beobachtete Arbeitsdateien im Deltaweg: 158,62 MiB.

Der Export ist fachlich jetzt tatsächlich auf betroffene Taxa begrenzt. Fingerabdruckvergleich, Kopien,
Herkunftsaktualisierung und Integritäts-/Prüfsummenprüfungen bleiben aber bestandsabhängig. Die komplette
Aufbereitung/Neuschreibung im Master wurde in diesem Paket-Schritt nicht umgebaut. Das Ziel einer deutlichen
Verkürzung des gesamten Updateablaufs bleibt deshalb ausdrücklich offen.

## Master-Suchübernahme: Umsetzung und Vergleich am 22./23. September

Die Suchnormalisierung unveränderter, bereits zur Feldübernahme freigegebener Arten wird nun durch eine
gebündelte SQLite-Kopie ersetzt. Markierte Taxa werden zusammen mit ihrem bestätigten Schreibblock gesichert;
Suchkopie und Markerentfernung gehören zum wiederholbaren Abschlussblock. Geänderte beziehungsweise nicht
freigegebene Arten bleiben im vollständigen Suchaufbau. Quellen-/Zeitangaben der Fachbelege bleiben aktuell.
Der neue Kandidat wird vollständig geprüft; vor seiner Übergabe muss die Quellprüfsumme erneut übereinstimmen.
Fachvertrag: `taxonomy-incremental-build.md`.

Die Messgrenzen entsprechen dem Masterbenchmark oben: reiner Kandidatenbau in neuen Prozessen, gleiche
Ausgangsdaten, wechselnde Reihenfolge, vollständiger semantischer Vergleich und unveränderte Ausgangsdatei.
Künstliche Suchzeilen-IDs sind vom Inhaltsvergleich ausgenommen, alle Suchfelder einschließlich Gewicht,
Normalformen und Duplikatzahl bleiben enthalten. Direkte Regressionstests prüfen zusätzlich sechs echte
Suchabfragen, darunter Umlaute, deutschen und englischen Namen, wissenschaftlichen Namen und Anbieter-ID.

### Entwicklungsschritte und Ausreißer (keine Auswahl nur günstiger Läufe)

| Stand / 10.000 Arten, zehn geänderte Namen | Wiederverwendung | Vollaufbau |
| --- | --- | --- |
| Vor Suchübernahme, ein zusätzliches Ausgangsmesspaar | 14,63 s | 16,46 s |
| Verworfener Ansatz: Suchkopie einzeln je Art | 18,43 s | 16,21 s |
| Gebündelte Kopie, zwei Messpaare vor letzter Quellenabsicherung | 13,11 s / 13,05 s | 16,47 s / 16,48 s |
| Gebündelte Kopie mit geordnetem Tabellenscan und expliziter Hauptdatenbankprüfung, spätere Messpaare | 18,20 s / 23,90 s | 32,58 s / 32,34 s |

Alle vollständig ausgegebenen Messpaare waren fachlich gleich. Der zuerst versuchte Einzelkopierweg wurde
wegen zusätzlicher Indexschreibarbeit verworfen. Die gebündelte Variante übernimmt bei 9.900 unveränderten
Arten 168.300 Suchbelege. Nur 1.500 Eingangszeilen werden erneut zur Suchbildung ausgewertet gegenüber
150.000 im Vollaufbau; das ist **kein** Zähler aller Masterarbeiten oder aller geänderten Datenzeilen.

Die ersten gebündelten Messungen zeigten rund 20–21 % Vorteil gegenüber ihrem Vollvergleich und etwa
10–11 % gegenüber dem bisherigen Wiederverwendungsweg. Die spätere starke Verlangsamung betrifft aber auch
den unveränderten Vollvergleich. Ursache und Streuung sind nicht geklärt. Daraus wird weder ein garantierter
Geschwindigkeitsfaktor noch eine Hochrechnung auf den vollständigen CoL-/Anbieterbestand abgeleitet.
Die Ausgabe eines gestarteten 20.000-Arten-Laufs war nach einer Sitzungsunterbrechung nicht mehr verfügbar;
dieser Lauf wird weder als bestandener Test noch als Zahlenbeleg gewertet.

Die Ergebnisdatei der gebündelten Variante belegt bei 10.000 Arten rund 121,86 MiB gegenüber 121,30 MiB
im Vollpfad, zuzüglich des vorhandenen Wiederverwendungsplans. Spitzen-RSS in den ersten gebündelten
Messpaaren lag bei 230–314 MiB gegenüber 258–276 MiB. Auch hier ist kein allgemeiner Speichervorteil belegt.
Die abschließende Quellenabsicherung kam nach diesen Zwischenmessungen hinzu; ihre Kosten sind in der
nachfolgenden Abschlussmessung enthalten.

### Abschlussmessung mit erneuter Quellenprüfung am 23. September

| Testbestand / wenige Namensänderungen | Wiederverwendung, Paar 1 / 2 | Vollaufbau, Paar 1 / 2 |
| --- | --- | --- |
| 10.000 Arten / zehn Namen | 23,23 s / 23,15 s | 31,98 s / 31,65 s |
| 20.000 Arten / 20 Namen | 54,23 s / 54,04 s | 71,42 s / 69,55 s |

Die beiden 10.000-Arten-Paare sind vollständig gleich und wiederholen denselben fachlichen Anteil:
9.900 übernommene Arten, 168.300 kopierte Suchbelege, 1.500 statt 150.000 neu ausgewertete Sucheingänge.
Das sind etwa 27 % weniger Kandidatenbauzeit als der gleichzeitig gemessene Vollweg. Es ist ausdrücklich
kein Vergleich mit den schnelleren absoluten Ausgangszeiten vom Vortag und kein Nachweis für den Gesamtupdatepfad.
Die Suchphase benötigt 2,94–2,98 s statt 8,75–9,22 s. Verbleibende bestandsabhängige Arbeit im Änderungsweg:
etwa 7,09–7,20 s Schreiben der Masterbelege, 5,07–5,08 s Abhängigkeiten, 4,51–4,55 s Kandidatenprüfung,
zuzüglich Vorbereitung, Änderungsvergleich und Abschluss. Diese Ereignisabschnitte sind weiterhin kein CPU-Profil.
Spitzen-RSS: 311,9–316,5 MiB gegenüber 260,6–271,6 MiB; die Speicherverwendung ist hier also höher.

Auch beide 20.000-Arten-Paare sind vollständig gleich; alle Ausgangsprüfsummen bleiben unverändert.
19.800 Arten beziehungsweise 336.600 Suchbelege werden übernommen, 3.000 statt 300.000 Eingangszeilen zur
Suchbildung erneut ausgewertet. Der Kandidatenbau benötigt in diesen Paaren etwa 22–24 % weniger Zeit als
der jeweilige Vollvergleich. Suchphase: 6,76–6,95 s statt 18,77–19,70 s. Im Änderungsweg bleiben etwa
17,41–17,52 s Masterbelegschreiben, 13,35–13,37 s Abhängigkeiten und 9,27–9,40 s Kandidatenprüfung.
Spitzen-RSS beträgt hier 350,0–354,5 MiB gegenüber 429,4–441,8 MiB. Die Ergebnisdatei benötigt 244,52 MiB
statt 243,16 MiB, der zusätzliche Wiederverwendungsplan 25,21 MiB. Unterschiedliche RSS-Verhältnisse bei
10.000 und 20.000 Arten verbieten weiterhin eine allgemeine Speicherzusage.

Damit ist die begrenzte Suchübernahme funktional und wiederholt gegen Vollaufbau belegt. Die absoluten
Laufzeiten liegen aber weiterhin deutlich über früheren Messungen desselben Vollwegs. Weder deren Ursache
noch die Gesamtlaufzeit bei realen Anbieter-, Konflikt- und Hierarchiedaten ist damit geklärt. Der weitere
Schritt betrifft Fachbeleg-Neuschreibung und Abhängigkeitsgrundlage; Prüfungen werden nicht zugunsten
besserer Zeiten entfernt. Keine produktive Neuaktivierung und keine Großbestandsfreigabe durch diesen Test.

## Geprüfte Abschlussplan-Übernahme am 23. September

Der Masteraufbau berechnet für die freigegebene Wiederverwendung bereits vor dem Schreiben einen
Abhängigkeitsplan. Bisher wurde dieser am Ende aus Altmaster und neuem Kandidaten nochmals aufgebaut.
Der neue Weg prüft stattdessen alle graphrelevanten Eingänge beider Datenbanken in fünf beidseitigen
Mengenvergleichen. Nur bei gleicher Struktur, gebundenen Eingangsständen und passender Planprüfsumme
wird der **in diesem Lauf** erstellte Plan übernommen. Historische Releasepläne werden nicht übernommen.
Bei fehlendem Beleg oder einer Strukturabweichung bleibt der vollständige Planaufbau erhalten.
Fachvertrag, verglichene Felder und Grenzen: `taxonomy-incremental-build.md`.

### Gegenprobe und verworfener Ansatz

| 2.000 Testarten / zwei geänderte Namen | Wiederverwendung, Paar 1 / 2 | Vollaufbau, Paar 1 / 2 |
| --- | --- | --- |
| Ausgangsstand mit Suchübernahme, ohne Planübernahme | 1,989 s / 2,009 s | 2,864 s / 2,872 s |
| Verworfene gebündelte Feldschreibvorgänge | 2,012 s / 2,054 s | 2,940 s / 2,931 s |
| Geprüfte Planübernahme, Feldschreibung unverändert | 1,827 s / 1,883 s | 2,904 s / 2,932 s |

Alle Messpaare waren fachlich gleich. Die Feldbündelung brachte keinen messbaren Schreibvorteil
(etwa 488–491 ms statt 491–492 ms) und wurde einschließlich ihrer Zusatzschnittstelle verworfen.
Die bestehenden Einzelprüfungen der Masterfelder wurden nicht abgeschwächt.

Die Planübernahme spart in diesen kleinen Messpaaren gegenüber dem unmittelbar vorher gemessenen
Wiederverwendungsstand etwa 6–8 % Kandidatenbauzeit. Der Planaufbau benötigt noch 310 ms plus
47–48 ms Strukturvergleich statt zuvor 534–547 ms Abhängigkeitsarbeit. Der Vorteil gegenüber
dem Vollaufbau enthält zusätzlich die bereits zuvor umgesetzte Suchübernahme und darf nicht allein
diesem neuen Schritt zugerechnet werden. Spitzen-RSS beträgt 125,7–126,1 MiB gegenüber
101,7–110,4 MiB im Vollaufbau; ein allgemeiner Speichervorteil ist nicht belegt.

### Wiederholter 10.000-Arten-Vergleich

| 10.000 Testarten / zehn geänderte Namen | Wiederverwendung | Vollaufbau |
| --- | --- | --- |
| Abschließendes Messpaar 1 | 11,054 s | 16,272 s |
| Abschließendes Messpaar 2, umgekehrte Reihenfolge | 11,090 s | 16,496 s |

Beide Messpaare bestätigen semantische Gleichheit aller Mastertabellen, unveränderte Ausgangsprüfsumme
und tatsächlich gewählte Planübernahme (`verified-prewrite-plan`). 9.900 Arten und 168.300 Suchbelege
werden übernommen; 100 abhängige Artgruppen werden neu berechnet. Nur 1.500 statt 150.000 Eingänge
werden zur Suchnormalisierung erneut ausgewertet. Die Gesamtzeit des Kandidatenbaus ist hier etwa
32–33 % kürzer als im heutigen Vollweg. Das enthält die früheren Wiederverwendungs-/Suchoptimierungen;
es ist nicht allein der Effekt der Planübernahme und kein Nachweis für den gesamten Quellen-/Paketlauf.

Im Wiederverwendungsweg verbleiben 3,70–3,73 s Masterbelegschreibung, 1,57 s Suchaufbau,
2,37–2,38 s vollständige Prüfung, 1,01–1,03 s Vorabplanung und 0,27 s Strukturvergleich.
Der Vollweg benötigt 6,67–6,71 s Schreiben und 3,88–4,05 s Suchaufbau. Die Phasenwerte sind wie oben
Ereignisabschnitte und kein CPU-Profil. Spitzen-RSS: 305,7–310,7 MiB gegenüber 263,3–267,3 MiB.
Ergebnisdatei: 121,86 MiB gegenüber 121,30 MiB; zusätzlicher Wiederverwendungsplan: 12,53 MiB.

Der unmittelbar vorherige 10.000-Arten-Lauf war ebenfalls fachlich gleich, seine Ausgabe wurde jedoch
gekürzt: erhalten sind 10,548 s / 10,577 s Wiederverwendung und 15,739 s für den ersten Vollvergleich;
die zweite Vollzeit fehlt. Daher wurde die obige Messung zur vollständigen Dokumentation wiederholt.
Die wesentlich langsameren Messpaare des vorherigen Suchübernahmeschritts bleiben im Bericht stehen.
Der heutige Vollweg ist ebenfalls schneller als damals; diese allgemeine Veränderung darf nicht als
Optimierungsgewinn verbucht werden. Ein zusätzlicher 20.000-Arten-Vergleich des neuen Planwegs steht aus.

### Fehler- und Wiederanlaufprüfung

Fünf neue direkte Tests prüfen vollständige Graph-/Mastergleichheit zum erzwungenen Vollweg,
22 verschiedene Eingangsänderungen jeweils in beiden Vergleichsrichtungen, mehrere Generationen,
breite und strukturelle Rückfälle sowie fehlende, veränderte und falsch gebundene Plannachweise.
Ein vorhandenes Ziel wird nicht überschrieben; ein Prüfsummenfehler nach der Kopie stoppt den Lauf.
Ein abgebrochener Vergleich lässt aktiven Master und vorhandenen Kandidaten unverändert und ist
wiederholbar. Die neue Testdatei ist in `test:taxonomy-master` eingebunden.

Der zusätzliche echte Worker-Pausentest fand einen Windows-Wiederanlauffehler: Bei einem bereits
vollständig geschriebenen Checkpoint blieb der Planleser offen und verhinderte das Umbenennen des
Kandidatenordners. Dieser Leser wird jetzt auch in diesem Zweig vor Vergleich und Übergabe geschlossen.
Der Test bestätigt danach Fortsetzung mit neuem Plan, vollständige Ergebnisgleichheit und unveränderte
aktive Datei. Pausieren ist zwischen den fünf Strukturvergleichen möglich, nicht innerhalb eines
einzelnen synchronen SQLite-Vergleichs. Die vollständige Kandidatenprüfung bleibt unverändert.

## Schreibvorbereitung und Eingangsvergleich am 24. September

Ein temporäres CPU-Profil mit 2.000 synthetischen Arten grenzte die Kosten ein: Im Vollweg entfielen
etwa 0,46 s allein auf wiederholte SQL-Vorbereitung für Feld- und Namensbelege. Im Änderungsweg waren
diese Befehle bereits wiederverwendet; dort fielen unter anderem etwa 0,19 s auf das Lesen alter Belege.
Profilzeiten sind instrumentierte Diagnosewerte, keine belastbaren Benchmarkzeiten. Das Profilwerkzeug
und seine ausschließlich selbst erzeugten Daten wurden nach der Diagnose entfernt.

Der neue gemeinsame, auf 64 Einträge begrenzte Befehlsspeicher wird nun auch im normalen Masteraufbau
verwendet. Er speichert keine Ergebnisse oder Prüfentscheidungen. Feldprüfungen und SQLite-Constraints
werden weiterhin bei jedem Datensatz ausgeführt. Der Kopierweg liest nur benötigte Altspalten;
Reihenfolge, Belegzuordnung und aktuelle Herkunftsangaben bleiben erhalten. Gleiche Anbieter-/Datensatz-IDs
benötigen im Eingangsvergleich keine erneute UTF-8-Konvertierung. Unterschiedliche Schlüssel behalten
den bestehenden Bytevergleich. Vertrag: `taxonomy-incremental-build.md`.

### Kleiner Vorher-/Nachher-Vergleich

| 2.000 Testarten / zwei geänderte Namen | Änderungsweg, Paar 1 / 2 | Vollaufbau, Paar 1 / 2 |
| --- | --- | --- |
| Unmittelbarer Ausgangsstand | 1,838 s / 1,841 s | 2,896 s / 2,868 s |
| Neuer Schreibweg | 1,821 s / 1,822 s | 2,118 s / 2,153 s |

Alle vollständig ausgegebenen Messpaare waren fachlich gleich. Der Vollweg spart etwa 25–27 %,
während der Änderungsweg nur etwa 1 % unter dem Ausgangswert liegt. Letzteres gilt ohne größere
Stichprobe nicht als eigenständiger belastbarer Beschleunigungsnachweis. Ein vorher gestarteter
2.000-Arten-Nachherlauf verlor bei der Sitzungsfortsetzung seine Ausgabe; er wird nicht als Zahlenbeleg
oder bestandener Test verwendet. Die obigen Nachherwerte stammen aus der vollständigen Wiederholung.

### Größerer Vergleich gegen den ebenfalls verbesserten Vollweg

| Testbestand / wenige Namensänderungen | Änderungsweg, Paar 1 / 2 | Vollaufbau, Paar 1 / 2 |
| --- | --- | --- |
| 10.000 Arten / zehn Namen | 10,927 s / 11,065 s | 12,398 s / 12,485 s |
| 20.000 Arten / 20 Namen | 23,819 s / 23,097 s | 27,383 s / 26,630 s |

Beide Paare sind vollständig gleich; der Ausgangsmaster bleibt unverändert. 9.900 Arten und 168.300
Suchbelege werden übernommen, 100 abhängige Gruppen neu berechnet. Die geprüfte Planübernahme wurde
tatsächlich verwendet. Gegenüber dem jetzt schnelleren Vollweg beträgt der Vorteil noch etwa 11–12 %.
Die etwa 32–33 % des vorherigen Abschnitts bezogen sich auf den damals langsameren Vollweg und sind
keine aktuelle Zusage. Absolut ist der Änderungsweg nahezu unverändert; der Vollweg benötigt etwa
12,4 statt zuvor 16,3–16,5 Sekunden. Verschiedene Messzeitpunkte bleiben eine Einschränkung.

Spitzen-RSS: 307,6–310,1 MiB im Änderungsweg gegenüber 237,0–260,9 MiB im Vollweg. Die Ergebnisgrößen
bleiben 121,86 beziehungsweise 121,30 MiB, zuzüglich 12,53 MiB Wiederverwendungsplan. Es ist also
weiterhin kein allgemeiner Speichergewinn belegt. Im Änderungsweg verbleiben rund 3,62–3,64 s
Masterbelegschreibung und 2,39–2,42 s vollständige Prüfung. Diese Ereignisabschnitte sind Näherungen.

Auch beide 20.000-Arten-Paare sind fachlich gleich und erhalten die Ausgangsprüfsumme. 19.800 Arten
beziehungsweise 336.600 Suchbelege werden übernommen; 200 abhängige Gruppen neu berechnet und 3.000
statt 300.000 Sucheingänge normalisiert. Die geprüfte Planübernahme ist aktiv. Der Kandidatenbau
ist etwa 13 % kürzer als der jeweilige Vollweg. Spitzen-RSS: 353,3–361,5 MiB gegenüber 383,8–390,6 MiB.
Ergebnisdatei: 244,52 MiB gegenüber 243,16 MiB; zusätzlicher Wiederverwendungsplan: 25,21 MiB.
Die frühere Aussage, der größere Vergleich des neuen Planwegs fehle noch, ist damit für diese
synthetische 20.000-Arten-Grenze erledigt, nicht für den realen Anbieterbestand.

Die früheren sehr langsamen 20.000-Arten-Messungen lagen unter anderen Laufbedingungen. Deren absolute
Differenz wird **nicht** vollständig der neuen Schreibvorbereitung zugerechnet. Weiterhin fehlen der
isolierte Zeitvergleich des zusammenhängenden Master-/Lightroom-Ablaufs und die produktive Großbestandsabnahme
zu diesem Messzeitpunkt noch. Der nachfolgende Abschnitt ergänzt inzwischen den isolierten Ablaufvergleich.

## Zusammenhängender lokaler Ablaufvergleich (24. September)

`node --no-warnings scripts/taxonomy-pipeline-benchmark.mjs 10000 sparse 2` vergleicht den heutigen
Änderungsweg mit dem ebenfalls optimierten, ausdrücklich vollständigen **Master- und Paketaufbau**.
Es ist kein Zeitvergleich zum historischen Septemberanfang. Zulässig sind 10 bis 20.000 künstliche Arten,
die vier Szenarien `unchanged`, `sparse`, `dense`, `structure` und ein bis drei Messpaare.

Die Messgrenze umfasst in einem ununterbrochenen normalen Ablauf:

1. Eingänge dauerhaft sichern, Rezept und Bindungen erstellen.
2. Master-Hilfsprozess starten, Datenbank mit 500er-Checkpoints bauen und vollständig prüfen.
3. Zweiten Hilfsprozess starten, Kandidat kopieren, Lightroom-Paket erstellen, Herkunft und Integrität prüfen.
4. Heutige Eingänge erneut prüfen und das gemeinsame aktive Paar atomar umschalten.

Nicht enthalten sind Quelldownload, produktive Anbieter-/Projektauswahl des Explorer-Service, Erstellung oder
Wiederherstellung der Testbasis, nachgelagerter Vergleich aller Ergebnistabellen und Aufräumen. Deshalb ist dies
der **lokale technische Aufbaukern**, kein vollständiger Klick-bis-fertig-Benchmark des Arten-Explorers.
Abbruch/Fortsetzung und Rollback gehören zum separaten Betriebscheck, nicht zur normalen Updatezeit.
Es wird weder ein produktiver Pfad als Parameter akzeptiert noch ein produktiver Stand aktiviert.

Jeder Lauf beginnt mit demselben bereits gemeinsam freigegebenen Testpaar. Die gesicherte Basis wird vor jeder
Probe an denselben absoluten Testpfad zurückkopiert; andernfalls würde der pfadgebundene Paarzeiger nicht mehr
gelten. Jede Probe hat einen neuen Steuerprozess und echte Master-/Paarhilfsprozesse. Die Reihenfolge wechselt
zwischen den Paaren. Der Vollweg setzt sowohl `reuseUnchanged: false` als auch `incremental: false`; tatsächliche
Aufbaumodi und Wiederverwendungszahlen werden geprüft. Der interne Paarprozess reicht dafür nun den streng
booleschen Paketmodus durch; ohne Angabe bleibt das heutige automatische Verhalten unverändert.

Die letzte Testart besitzt zusätzlich eine eigene deutsche Namenswahl. Ihre Gattungsgruppe bleibt vorsichtig
in der Neuberechnung. Bei 10.000 Arten mit zehn geänderten Anbieternamen werden deshalb 9.890 statt 9.900
Masterarten übernommen; fachlich werden nur zehn Taxa im Paket neu projiziert. Geöffnete alte SQLite-Leser
müssen nach dem Paarwechsel weiter funktionieren; neue Leser müssen den passenden gemeinsamen Stand sehen.
Eigene Namenswahl, sechs echte Suchabfragen, Quellenprüfsummen und unveränderte Altdateien werden geprüft.

Alle Mastertabellen und fachlichen Pakettabellen einschließlich Exportfingerabdrücken werden verglichen.
Nur der arbeitsauftragsspezifische Mastercheckpoint, die zufällige Paket-ID und die physische Masterprüfsumme
werden nach separater Bindungsprüfung vom Gleichheitsvergleich ausgenommen. Die restlichen Schema-/Infowerte
bleiben enthalten. Die echte FTS-Integritätsprüfung läuft auf einer privaten Paketkopie, niemals schreibend auf
einem freigegebenen Testpaket. Jede gesicherte Basisdatei wird erneut gehasht. Die selbst angelegten Ordner
`Testlauf/pipeline-benchmark-*` werden nach Erfolg oder Fehler entfernt; andere Testdaten bleiben erhalten.

### Ausgangsmessung bei 10.000 Testarten (24. September)

Windows, Node 24.12.0, zehn Namensänderungen, zwei Messpaare mit wechselnder Reihenfolge:

| Abschnitt | Änderungsweg, Paar 1 / 2 | Vollaufbau, Paar 1 / 2 |
| --- | --- | --- |
| Auftrag vorbereiten | 0,230 s / 0,230 s | 0,230 s / 0,228 s |
| Masterworker einschließlich Ein-/Ausgangsprüfung | 12,014 s / 12,023 s | 13,308 s / 13,298 s |
| Paarvorbereitung, Paket, Prüfungen und Freigabe | 3,645 s / 3,788 s | 4,056 s / 4,014 s |
| Gesamter gemessener lokaler Kern | 15,889 s / 16,041 s | 17,594 s / 17,540 s |

Alle Tabellen, Suchergebnisse und Prüfbindungen stimmen überein; Namenswahl, Altleser und Ausgangsdateien
bleiben erhalten. Der Vorteil beträgt je Paar etwa **9,7 % und 8,5 %**, nicht die früher für Kandidatenbau
allein genannten größeren relativen Werte. Beide Paketdateien sind 81.637.376 Bytes groß; der Master braucht
129.224.704 Bytes im Änderungsweg beziehungsweise 128.188.416 Bytes im Vollweg. Kein Speichergewinn behauptet.

Die ereignisbasierten Phasenwerte zeigen im Änderungsweg etwa 4,55–4,61 s Masterbelegschreibung,
1,55 s Suchabschluss und 2,28–2,29 s vollständige Masterprüfung. Der eigentliche gemeinsame Wechsel einschließlich
kurzer letzter Eingangsprüfung liegt bei etwa 5 ms; die Paket-/Paarvorbereitung ist separat enthalten.
Diese Unterphasen sind Näherungen, kein CPU-Profil. Eine Optimierung des Zeigerwechsels ist nach diesen Daten
nicht der nächste Schwerpunkt. Unveränderte Masterbelege erneut einzeln zu schreiben bleibt der vorrangige
zu untersuchende Kostenblock; Daten-/Identitäts- und Herkunftsprüfung dürfen dabei nicht entfallen.

### Ausgangsmessung bei 20.000 Testarten (24. September)

Zwei vollständig protokollierte Messpaare mit 20 Namensänderungen und eigener Namenswahl der letzten Art:

| Abschnitt | Änderungsweg, Paar 1 / 2 | Vollaufbau, Paar 1 / 2 |
| --- | --- | --- |
| Auftrag vorbereiten | 0,439 s / 0,438 s | 0,446 s / 0,441 s |
| Masterworker einschließlich Ein-/Ausgangsprüfung | 47,785 s / 57,624 s | 60,525 s / 60,363 s |
| Paarvorbereitung, Paket, Prüfungen und Freigabe | 8,143 s / 12,968 s | 15,024 s / 14,784 s |
| Gesamter gemessener lokaler Kern | 56,368 s / 71,029 s | 75,995 s / 75,588 s |

Alle Ergebnis-, Such-, Namenswahl-, Altleser- und Basisprüfungen bestanden. 19.790 Masterarten wurden
übernommen und 210 neu berechnet; das Paket projizierte 20 Taxa. Paketgröße in beiden Wegen 163.819.520 Bytes,
Mastergröße 258.363.392 Bytes im Änderungsweg und 257.171.456 Bytes im Vollweg.

Die relativen Vorteile von etwa **25,8 % beziehungsweise 6,0 %** streuen erheblich. Auch die absoluten
Zeiten wachsen stärker als im getrennten Kandidatenvergleich. Die ungeklärten Schwankungen bleiben Teil
der Bewertung; daraus folgt weder ein fester Beschleunigungsfaktor noch eine Hochrechnung auf den echten
Gesamtbestand. Während dieser Zeitmessung lief kein zusätzlicher Qualitätslauf. Ein vorheriger Lauf ohne
vollständig gesichertes Endergebnis wird nicht als Messbeleg verwendet.

Die ereignisbasierte Schreibphase braucht im Änderungsweg 20,46 beziehungsweise 26,09 s, die Suchphase
7,33–7,46 s und die Masterprüfung 9,53–9,95 s. Der gemeinsame letzte Wechsel bleibt mit 7–12 ms klein.
Die Auswertung begründet deshalb zunächst eine Untersuchung der vielen kleinen Lese-/Schreiboperationen
beim Übertragen unveränderter Belege, nicht eine Kürzung der Prüfungen.

### Lesegruppen: direkter Vorher-/Nachher-Vergleich und Grenzen (24./25. September)

Die Kostenanalyse eines instrumentierten 2.000-Arten-Laufs zeigte viele kleine Leseabfragen je unveränderter
Art und Quelle. Der neue Leser bündelt diese in höchstens 128 Taxa pro Gruppe. Quellen bleiben schreibgeschützt;
alle übernommenen Werte werden wie zuvor einzeln im Modell geprüft und mit aktueller Provenienz geschrieben.
Das Instrumentierungswerkzeug ist kein Zeitbenchmark und wurde nach der Analyse wieder entfernt.

Direkt aufeinanderfolgende, nicht instrumentierte 2.000-Arten-Messpaare am 24. September:

| Stand | Änderungsweg, Paar 1 / 2 | Unveränderter Vollweg, Paar 1 / 2 | Schreibphase im Änderungsweg |
| --- | --- | --- | --- |
| Einzelabfragen | 1,801 s / 1,814 s | 2,160 s / 2,137 s | 0,505 s / 0,495 s |
| Lesegruppen | 1,642 s / 1,670 s | 2,138 s / 2,109 s | 0,380 s / 0,373 s |

Alle Tabellen stimmten überein, jeweils 1.980 Arten übernommen und 20 neu berechnet. Der begrenzte Versuch
zeigt etwa 8–9 % weniger Kandidatenbauzeit gegenüber dem vorherigen Änderungsweg. Der Spitzen-RSS schwankte
dabei von vorher 109–115 MiB auf 125–195 MiB mit Lesegruppen; ein Speichergewinn ist **nicht** belegt.
Es wird nur eine fertige Beleggruppe vorgehalten, aber zusätzlich ein ID-/Positionsverzeichnis für den
ausgewählten Bestand. Beim Gruppenwechsel entsteht vorübergehend eine zweite Gruppe. Viele Namen/Belege
pro Art können den Speicherbedarf erhöhen; die Taxonbegrenzung ist keine feste Byte-Obergrenze.

Der zusammenhängende 10.000-Arten-Vergleich am 25. September ergab mit Lesegruppen:

| Abschnitt | Änderungsweg, Paar 1 / 2 | Vollaufbau, Paar 1 / 2 |
| --- | --- | --- |
| Auftrag vorbereiten | 0,219 s / 0,230 s | 0,217 s / 0,213 s |
| Masterworker einschließlich Ein-/Ausgangsprüfung | 19,657 s / 11,667 s | 26,632 s / 27,002 s |
| Paarvorbereitung, Paket, Prüfungen und Freigabe | 4,424 s / 3,862 s | 5,114 s / 4,320 s |
| Gesamter gemessener lokaler Kern | 24,301 s / 15,759 s | 31,963 s / 31,536 s |

Alle Fach-, Such-, Quellen- und Leserprüfungen bestanden. Wiederverwendungszahlen und Datenbankgrößen sind
unverändert zur Ausgangsmessung. Die große Streuung betrifft auch unveränderte Prüf-/Suchphasen und den
Vollweg. Deshalb belegt diese Reihe die Korrektheit im größeren Ablauf, **nicht** einen allein durch die
Lesegruppen verursachten prozentualen Gesamtgewinn. Ein am Vorabend unterbrochener Vergleich ohne Endergebnis
wird nicht gewertet. Dessen eindeutig eigener Testordner wurde nach Prüfung auf beendete Prozesse entfernt.

Der entsprechende 20.000-Arten-Vergleich mit Lesegruppen am 25. September:

| Abschnitt | Änderungsweg, Paar 1 / 2 | Vollaufbau, Paar 1 / 2 |
| --- | --- | --- |
| Auftrag vorbereiten | 0,462 s / 0,460 s | 0,449 s / 0,447 s |
| Masterworker einschließlich Ein-/Ausgangsprüfung | 35,193 s / 25,634 s | 30,486 s / 30,274 s |
| Paarvorbereitung, Paket, Prüfungen und Freigabe | 8,063 s / 8,196 s | 9,033 s / 8,965 s |
| Gesamter gemessener lokaler Kern | 43,718 s / 34,290 s | 39,968 s / 39,686 s |

Alle Vergleichsprüfungen bestanden, mit 19.790 übernommenen Masterarten, 210 Neuberechnungen und 20
Paketprojektionen. Größen und fachliche Ergebnisse entsprechen der Ausgangsmessung. Im ersten Paar ist
der Änderungsweg **9,4 % langsamer**, im zweiten etwa **13,6 % schneller**. Der langsamere Lauf wird nicht
weggelassen. Vor allem seine Schreibphase (14,53 statt 9,14 s) und der vorgelagerte Abhängigkeitsblock
schwanken, aber auch die spätere Suchphase. Die Ursache ist damit noch nicht bewiesen. Der gleichzeitig
gemessene Vollweg ist wesentlich schneller als in der Ausgangsreihe vom Vortag; ein Vergleich nur der
absoluten Vorher-/Nachher-Zahlen würde den Effekt der Lesegruppen daher falsch zuschreiben.

Bewertung: Der kleine direkte Vergleich rechtfertigt die begrenzte Reduktion der Einzelabfragen, die
großen Reihen belegen bisher **keinen zuverlässigen Gesamtgeschwindigkeitsvorteil**. Vor produktiver
Großbestandsfreigabe sind Last-/I/O-/Speicheranteile und echte Mehranbieter-/Namensvielfalt zu prüfen.
Weitere Optimierungen dürfen keine Modell-, Identitäts-, Herkunfts- oder Integritätsprüfung entfernen.

Der anschließend getrennt ausgeführte 10.000-Arten-Kandidatenvergleich (ein Messpaar, ohne Paket/Workerwechsel)
bestand ebenfalls: 10,330 s und 296,7 MiB Prozess-Spitzen-RSS im Änderungsweg gegenüber 12,627 s und
233,8 MiB im Vollweg. 9.900 Arten wurden übernommen, 100 neu berechnet; sämtliche Tabellen gleich.
Das ist eine Speicher-Gegenprobe, keine zusätzliche Gesamtlaufmessung und kein isolierter Vorher-/Nachher-
Beleg für die Lesegruppen. Der Änderungsweg braucht in dieser Probe rund 63 MiB mehr Spitzen-RSS als der
Vollweg. Das Ergebnis erlaubt keine Hochrechnung auf den realen Mehranbieterbestand.

## Offen vor produktiver Freigabe

- Speicherbedarf und Laufzeit am vollständigen realen Bestand, einschließlich Anbieter-/Konfliktvielfalt.
- Verbleibende Vollbestandsarbeit im Master und beim Vergleich reduzieren; deutlichen Gesamtvorteil gegenüber
  dem ursprünglichen Ablauf nachweisen, nicht nur gegenüber dem zwischenzeitlich langsameren Deltaweg.
- Gemeinsamer Wechsel/Rollback bei geöffnetem Lightroom einschließlich Fehler-/Wiederanlaufzuständen.
  Normaler Explorer-/Lightroom-Neustart mit Erhalt der zwei Testzuweisungen ist am 1. Oktober bestätigt;
  das ersetzt keinen Wiederanlauf nach Worker-/Paarfehler oder Rollbacktest.
- Bedienabnahme der Speicherpflege; produktive Bereinigung nur nach aktueller Vorschau und Bestätigung.
- Gebündelte Lightroom-Abnahme und die restliche Vor-Audit-Reihenfolge in `roadmap.md`.

Die isolierten Fehler-/Platzmangeltests bleiben zusätzlich maßgeblich; siehe
`taxonomy-master-background-build.md` und `taxonomy-storage-maintenance.md`.

## Prüfabschluss

Am 20. September bestanden der gezielte Betriebscheck, alle vier Master-Messpaare und das vollständige
`npm.cmd run --silent quality:ci` mit Exitcode 0. Das Gate enthält auch die beiden neuen Betriebschecktests,
Lightroom-Verträge, Speicher-/Workerfehlerfälle und das lokale Projekt-/Assetaudit.
Projektstatus synchronisiert, `git diff --check` fehlerfrei. Die eigenen Mess-/Betriebscheckordner wurden
anschließend entfernt; andere Inhalte von `Testlauf/` wurden nicht bereinigt.

Produktive Arten-/Assetdateien und Namenskorrekturen sind unverändert. Keine Lua-Änderung, Plug-in weiterhin
0.4.24.14. Squarespace-Footer geprüft: kein dort eingebundenes Modul geändert, keine neue Footer-Version nötig.
Der vorherige Arbeitsstand wurde als `e6baa2b` veröffentlicht; Speicherpflege und dieser ergänzende Prüfschritt
sind noch lokale, nicht veröffentlichte Änderungen.

Am 21. September bestanden zusätzlich 27 gezielte Tests: die fünf neuen Benchmark-/Grenzfälle, fünf direkte
Delta-Regressionen und 17 vorhandene Paket-/Paarprüfungen. Die direkten Fälle prüfen gleiche/umsortierte
Such-IDs, gemischte Duplikate, ersetzte und vollständig entfernte Begriffe, leere Basis, NULL-Feldänderungen
und den tatsächlichen Volltextindex. Die kleinen Prozessvergleiche verwenden unveränderte, wenige, viele und
strukturelle Änderungen. Beide neuen Testdateien sind in `test:lightroom` und damit `quality:ci` eingebunden.
Die 10.000-Arten-Zeitmessung ist ein separater manueller Test, keine zeitabhängige CI-Erfolgsschwelle.

Für den Zwischenstand vor der Teilprojektion bestand am 21. September auch das vollständige
`npm.cmd run --silent quality:ci` mit Exitcode 0,
einschließlich 130 Tests in `test:lightroom`, Dokument-/Schema-/Stilprüfung und lokalem Projekt-/Assetaudit.
Projektstatus ist synchron und aktuell. Keine Änderung produktiver Art-/Assetdaten oder des Lua-Plug-ins;
Version weiterhin 0.4.24.14. Kein Squarespace-Modul geändert, Footer-Versionen bleiben unverändert.
Der positive Funktionstest hebt den oben beschriebenen Leistungsblocker ausdrücklich nicht auf.

Nach dem Teilprojektionsumbau bestand am 21. September erneut das vollständige
`npm.cmd run --silent quality:ci` mit Exitcode 0. Enthalten sind 24 neue Export-/Fehlerfallprüfungen,
sechs Paketbenchmark-/Grenzfälle sowie die vorhandenen Paket-, Paar-, Worker- und Lightroom-Verträge.
Die neuen Fälle vergleichen gezielten Export und Vollaufbau über mehrere Generationen, prüfen tatsächliche
Teilprojektion, aktuelle Provenienz, unsichere Basis, parallele Integritätsprüfung, Abbruch in drei Phasen,
Quellenänderung und Fehler im Fortschrittskanal mit anschließend erfolgreicher Wiederholung.
Auch Dokumentation, Schema, Stil, Medien, Projektstatus und das lokale Projekt-/Assetaudit bestanden.
Die beiden 10.000- und die beiden vollständig protokollierten 20.000-Arten-Messpaare bestanden separat.
Das Gate bestätigt die Korrektheit dieses isolierten Umsetzungsschritts, nicht eine produktive
Großbestandsabnahme oder das weiterhin offene Gesamtleistungsziel. Änderungen bleiben lokal unveröffentlicht.

Am 23. September bestand nach der Master-Suchübernahme das vollständige
`npm.cmd run --silent quality:ci` erneut mit Exitcode 0. Enthalten sind die sechs direkten neuen Suchübernahmefälle
und der zusätzliche Worker-Abschlussfehlerfall. Geprüft sind nur lesende Quellenanbindung mit Sonderzeichen
im Pfad, vollständige Marker, gleiche Fach-/Suchdaten und echte Treffer, unveränderte aktive Daten,
abgebrochener Abschluss mit erneuter Fortsetzung ohne Duplikate, breite/strukturelle Rückfälle, fehlende
Suchbasis und zwischenzeitliche Änderung des Altmasters. Der bestehende 500er-Pausentest prüft nun ebenfalls
gesicherte Suchmarker und die vollständige Wiederaufnahme. Zusammenhängender Prozessabbruch, Paarwechsel
und Rollback mit offenen Lesern bleiben zusätzlich Bestandteil des Gates.

Die endgültigen zwei 10.000- und zwei 20.000-Arten-Messpaare bestanden vor dem Gate separat; während der
großen Zeitmessungen lief kein zusätzlicher Qualitätslauf. Projektstatus ist synchron, produktive
Art-/Assetdaten und Namenskorrekturen sind unverändert. Lua-Plug-in bleibt 0.4.24.14; kein Squarespace-Modul
geändert, Footer-Versionen bleiben unverändert. Kein produktiver Aufbau, keine Bereinigung produktiver
Altstände, kein Commit und kein Push in diesem Schritt. Die Freigabe für den realen Großbestand und das
Gesamtleistungsziel bleiben offen.

Nach der geprüften Abschlussplan-Übernahme bestand am 23. September erneut das vollständige
`npm.cmd run --silent quality:ci` mit Exitcode 0: darunter 188 Master-/Betriebstests und 155
Lightroom-/Pakettests, einschließlich fünf neuer direkter Planprüfungen und des echten Worker-Fortsetzungsfalls.
Die zwei oben vollständig dokumentierten 10.000-Arten-Messpaare liefen vor dem Gate, nicht parallel dazu.
Syntax, Stil, Dokumentverweise, Datenverträge, Medien und lokales Projekt-/Assetaudit bestanden ebenfalls.
Projektstatus bleibt aktuell. Die eigenen Vergleichsordner sind entfernt; fremde Testdateien bleiben erhalten.
Produktive Art-/Assetdaten, Namenskorrekturen und das Lua-Plug-in bleiben unverändert. Kein dort eingebundenes
Squarespace-Modul geändert; keine neue Footer-Version. Kein produktiver Aufbau, Commit oder Push.

Am 24. September bestand nach der gemeinsamen Schreibvorbereitung das vollständige
`npm.cmd run --silent quality:ci` mit Exitcode 0. Enthalten sind 194 Master-/Betriebs- und 155
Lightroom-/Pakettests; sechs neue Fälle sichern Befehlsspeicher und Unicode-Eingangsvergleich ab.
Die direkten Modellvergleiche prüfen zwölf ungültige Feldvarianten mit identischen Fehlern, aktuelle
Bindewerte/Ergebnisse, Namen-Upsert, Rollback, Constraintfehler, begrenzte Lebensdauer und getrennte Verbindungen.
Die bestehenden echten Worker-Abbruch-/Fortsetzungstests, gemeinsame Paarfreigabe, Präferenzerhalt
und Rücknahme mit offenen Lesern bestanden erneut. Die zwei 10.000- und zwei 20.000-Arten-Zeitvergleiche
waren zuvor separat abgeschlossen, ohne parallelen Qualitätslauf.

Dokumentation und Projektstatus sind nachgezogen, eigene Profil-/Messdateien entfernt. Produktive Art-/Assetdaten,
Korrekturdateien und Lua-Plug-in sind unverändert; Plug-in-Version weiterhin 0.4.24.14. Squarespace-Footer
geprüft, kein eingebundenes Modul geändert. Kein produktiver Neuaufbau, keine produktive Bereinigung,
kein Commit und kein Push. Zu diesem Zwischenstand war der nächste Prüfbaustein der isolierte zusammenhängende
Zeitvergleich von Masteraufbau, Lightroom-Paket und gemeinsamer Freigabe. Die nachfolgend durchgeführten
Messungen stehen oben; das Gesamtleistungsziel bleibt offen.

Am 25. September bestand nach integriertem Ablaufvergleich und begrenzten Altbeleg-Lesegruppen das vollständige
`npm.cmd run --silent quality:ci` mit Exitcode 0: darunter 205 Master-/Betriebs- und 155 Lightroom-/Pakettests.
Sieben neue Prozessvergleichstests prüfen gültige Messgrenzen, unveränderte/wenige/viele/strukturelle Änderungen,
abwechselnde Reihenfolge, Namenswahl, offene Altleser und tatsächlichen Paket-Vollaufbaurückfall. Vier direkte
Lesertests sichern Quellen-/Belegreihenfolge, Gruppenwechsel, Wiederaufnahme, Lesefehler und erneuten Versuch ab.
Bestehende Mehranbieter-, aktuelle-Provenienz-, Worker-Abbruch-/Fortsetzungs- und Rollbackprüfungen bestanden
erneut. Alle übernommenen Felder durchlaufen weiterhin dieselben Modellvalidierungen und SQLite-Constraints.

Die je zwei integrierten 10.000-/20.000-Arten-Paare und die getrennte 10.000-Arten-Speicherprobe wurden vor
dem Qualitätsgate abgeschlossen, nicht parallel dazu. Der Projektstatus ist synchron. Syntax, Stil,
Dokumentationsverweise, Schema, Medien, Speicherbudget und lokales Projekt-/Assetaudit bestanden.
Die isolierten Testordner wurden entfernt; Messzahlen und Einschränkungen sind oben zusammengefasst.
Eigene temporäre Profil-/Rohprotokolldateien wurden nach diesem Abschluss entfernt; fremde Testdateien bleiben.
Produktive Art-/Assetdaten, Namenskorrekturen und Lua-Plug-in bleiben unverändert (0.4.24.14).
Squarespace-Footer geprüft: kein dort eingebundenes Modul geändert, keine neue Footer-Version erforderlich.
Kein produktiver Neuaufbau, keine Bereinigung produktiver Altstände, kein Commit und kein Push in diesem Schritt.
Das Gate schließt diesen begrenzten Mess-/Optimierungsschritt ab, nicht das Leistungsziel oder Phase 10.

## Ergänzende Ressourcenprüfung am 25. September

Die anschließenden elf profilierten Messpaare einschließlich späterer Standard-Rückproben stehen getrennt
in [Ressourcenmessung](taxonomy-performance-profiling.md). Der Vergleich umfasst jetzt zusätzlich einen
synthetischen Mehranbieterbestand. Hohe logische Ein-/Ausgabemengen sind eingegrenzt; ein nur testlokaler
größerer SQLite-Puffer reduziert sie deutlich. Der beobachtete Zeitvorteil beträgt gegenüber den späteren
Standard-Rückproben etwa 13–15 %, nicht die scheinbare Halbierung gegenüber den anfänglichen langsameren
Reihen. Die verbleibende Streuung ist nicht vollständig erklärt. Kein Speichergewinn zugesagt und keine
produktive Pufferänderung vorgenommen.

Das anschließende vollständige Qualitätsgate bestand erneut (Exitcode 0), darunter 213 Master-/Betriebs-
und 155 Lightroom-/Pakettests; gezielter Prozessvergleich 15/15. Alle Messreihen bestanden Fach-, Quellen-,
Präferenz-, Leser- und Ausgangsdateiprüfungen. Als Nächstes Aufbau-Pufferregel einschließlich gleichzeitigem
Speicherbudget und Fehler-/Wiederanlauf-/Rollbacktests absichern, anschließend den integrierten Vergleich
ohne Mess-Injektion wiederholen. Kein produktiver Neuaufbau, kein Commit oder Push in diesem Schritt.

## Integrierter Aufbaupuffer: Vergleich vom 26. September, Auswertung 27. September

Die inzwischen eingebaute, ausdrücklich begrenzte Regel und alle fünf integrierten Messpaare stehen in
[Begrenzter Aufbaupuffer](taxonomy-build-cache.md). Keine testlokale Puffer-Injektion, kein Ressourcenprofil
während der Laufzeitmessung. Je zwei Paare mit 10.000 Arten und 5.000 Arten/12.500 Mehranbieter-Belegen sowie
ein 20.000er-Paar bestehen Fach- und Suchvergleich, erhalten eigene Namenswahl, Altleser und Ausgangsdateien.

Die Gesamtzeiten des Änderungswegs sind 12,795/13,123 s, 14,452/14,553 s und 28,196 s; der verbesserte
Vollweg benötigt 15,630/16,519 s, 16,445/16,440 s und 33,389 s. Das entspricht in diesen Paaren etwa
11–21 % Vorsprung, nicht einer belegten Halbierung und nicht dem isolierten Effekt der Pufferänderung.
Der große Vergleich ist nur ein Messpaar. Quellen-Downloads und reale Anbieterauswahl fehlen weiterhin.
Das vollständige Qualitätsgate bestand am 27. September (Exitcode 0), darunter 221 Master-/Betriebs- und
155 Lightroom-/Pakettests. Acht gezielte Sound-/Assistententests bestanden ebenfalls. Ein neuer Test musste
vorher wegen falsch übergebenem Fixture-Pfad korrigiert werden; der abschließende komplette Lauf bestand.
Aktive Produktivdatenbanken, Assets, Sound-Ablehnungen und Lightroom-Plug-in bleiben unberührt.
