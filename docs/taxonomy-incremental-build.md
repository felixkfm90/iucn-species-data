# Inkrementeller Masteraufbau – Implementierungsstand

Stand: 2026-09-20

Verbindlicher Gesamtauftrag: `taxonomy-identity-incremental-plan.md`, Abschnitt 4. Dieses Dokument beschreibt
die tatsächliche Implementierung, nicht bereits erreichte Beschleunigung des produktiven Aufbaus.

## Erster Baustein: wiederaufnehmbare Eingangsvergleiche

`species-explorer/taxonomy-build-inputs.mjs` speichert normalisierte Anbieter-Datensatzfingerabdrücke in einer
eigenen SQLite-Datei. Über `taxonomy-master-inputs.mjs` ist er jetzt an den Explorer-Masterkandidatenbau
angeschlossen. Weder aktive Datenbanken noch Lightroom-Kataloge werden beim Kandidatenbau verändert.
Der bisherige Vollaufbau bleibt Rückfallweg. Seit 12. September überspringt ein begrenzter Wiederverwendungspfad
die Feldauswahl unveränderter Arten. Seit 13. September ist auch der unten beschriebene Paket-Deltapfad angebunden.

## Suchpaket und gemeinsamer Aktivstand (13. September)

Technisch umgesetzt, mit isolierten Datenbanken geprüft; **kein produktiver Neuaufbau und noch keine
Großbestandsfreigabe**. Das Lightroom-Plug-in steht für den neuen Aktivzeiger bei **0.4.24.14**.

- `lightroom-search-delta.mjs` vergleicht die gemeinsame Vollaufbau-Projektion mit einer prüfsummenverifizierten
  Kopie des bisherigen Suchpakets. Nur abweichende Datensätze und Volltext-Sucheinträge werden geschrieben;
  gleiche Suchbegriffe behalten ihre lokalen IDs, selbst bei veränderter Reihenfolge im neuen Master.
- Namen, Hierarchien, Projektlinks, Status, Quellenstände und Identitätsinformationen bleiben enthalten.
  Fehlende, beschädigte oder inkompatible Basis: vollständiger Paketaufbau. Ergebnisprüfung bleibt Pflicht.
- Das ist **kein vollständiger Verzicht auf Vollbestand-Lesen oder Dateikopien**: Die fachliche Projektion,
  Integritätsprüfungen und Prüfsummen lesen weiterhin den gesamten Bestand. Noch keine belegte
  Beschleunigung am produktiven Katalog und keine Zusage „wenige Sekunden“ für Quellenupdates.
- Die Paarvorbereitung aus `taxonomy-publication.mjs` kopiert den ausgewählten Master in einen privaten
  Kandidaten und baut/prüft das dazugehörige Suchpaket. Seit 20. September laufen alle diese schweren Arbeiten
  über `taxonomy-publication-process.mjs` in einem Hilfsprozess, einschließlich Rücknahmeprüfung. Ein einzelner
  Austausch von `taxonomy-publication/active.json` veröffentlicht danach beide unveränderlichen Releaseordner.
  Alte geöffnete Datenbankhandles dürfen weiter ihren bisherigen Stand lesen; neue Suchen öffnen den neuen.
- Korrekturen werden gegen beide vorbereiteten Datenbanken aufgelöst und als passende Korrekturschicht im Paar
  gebunden. Eine spätere Schnellkorrektur kann diese ersetzen. Rücknahme prüft heutige Präferenzen gegen die
  Vorgängeridentitäten; bei nicht eindeutiger Auflösung wird abgebrochen, nicht still eine Präferenz verworfen.
- Hat der Kandidat genau diese Korrektureingaben bereits fachlich verarbeitet, gilt sein Ergebnis ohne erneute
  Namensauflösung. Sonst könnte eine nach Split/Merge verworfene Altpräferenz nachträglich wieder auftauchen.
  Anbieterstandard und die explizite Master-ID-Bindung bleiben im Serviceeingang erhalten; die Bindung zählt
  zum Korrekturfingerabdruck. Eine frühere Baseline ohne diesen Bestandteil kann daher erneut als offen erkannt
  werden. Unveränderte alte Prüfwerte werden inzwischen anhand aller bisherigen Felder und der eindeutigen
  IDs in beiden aktiven Datenbanken erkannt; siehe `taxonomy-name-preference-plan.md`.
  Fremde ID-Bindungen werden gesperrt, nicht anhand gleichen Namens übertragen. Auch die automatische
  Baseline-Übernahme beim Explorerstart interpretiert bei paarverwalteten Beständen keine Altnamen erneut.
- Quellen-, Projekt-, Identitäts- oder Präferenzwechsel während des Baus verhindern die Veröffentlichung.
  Ein Paketfehler aktiviert keinen neuen Master. Ein verbrauchter Staging-Kandidat wird nicht nochmals angeboten.
- Bestehende Installationen ohne gemeinsamen Zeiger bleiben lesbar. Der erste Paarwechsel übernimmt einen
  passenden bisherigen Master-/Paketstand als Rückweg. Bei bereits auseinanderliegenden Altständen gibt es
  keinen behaupteten gemeinsamen Vorgänger; die alten Dateien bleiben erhalten. Separate Aktivierungsbefehle
  sind nach Umstellung gesperrt. Ein reiner Suchpaket-Wiederaufbau verwendet denselben Paarmechanismus.

Speichervertrag: gemeinsame Releases liegen in `taxonomy/master/releases/publication-<UUID>` und
`lightroom/releases/publication-<UUID>`. Ein Zeiger enthält aktives Paar, Vorgänger und gebundene Korrekturen.
Alte Releases werden derzeit bewusst nicht automatisch gelöscht; eigene fehlgeschlagene Vorbereitungen werden
entfernt, bei unklarem Zeigerschreibausgang bleiben sie vorsichtshalber erhalten. Der kurze Zeigeraustausch benutzt
die prozessübergreifende Korrektursperre und verschiebt unter Windows niemals den alten Zeiger vorab weg.
Eine fehlgeschlagene atomare Ersetzung lässt die bisherige Datei stehen.

Tests: Voll-/Delta-Ergebnisgleichheit bei Namens-, Hierarchie-, Quellenänderung und Löschung, wiederholter Delta-Lauf,
stabile Such-IDs und Volltextsuche, beschädigte Basis, Abbruch mit unverändertem Staging, offene Leser,
Paarwechsel/Rücknahme, Präferenzmitnahme, Eingangsänderung, Zeigerschreibfehler und echter Paket-Hilfsprozess.
Der Lua-Vertragstest führt die echte Statusfunktion mit dem neuen Aktivzeiger und späteren Korrekturen aus;
keine Lightroom-Katalogaufrufe. Die fachlichen Paketprüfungen sind in `test:lightroom` eingebunden.

**Weiter offen vor produktiver Abnahme:** Speicher-/Laufzeitmessung beider Deltapfade, Aufbewahrungs- und
Platzbudget für unveränderliche Releases und Jobspools sowie echter Explorer-Neustarttest. Die aufwendige
Paarprüfung ist aus dem Server ausgelagert; eine frische Eingangsprüfung und der kurze atomare Wechsel bleiben
im Elternprozess. Masterworker und dauerhafte Schreibcheckpoints sind seit 14. September
an Service und Oberfläche angeschlossen: Pause/Fortsetzung, Wiederentdeckung und heutiger Eingangsvergleich
sind mit temporären Beständen geprüft, siehe `taxonomy-master-background-build.md`.
Die atomare Paaraktivierung allein ersetzt
diese Arbeiten nicht. Ein Stromausfalltest wurde nicht durchgeführt. Der schnelle Namenskorrekturpfad bleibt
unverändert unabhängig vom großen Paketaufbau.

Abschlussprüfung dieses Bausteins am 13. September: 45 gezielte Paket-/Service-/Identitätstests bestanden,
darunter zwölf Suchpaket-/Paarfälle. Lightroom-Vertragstest: 14 Tests bestanden, einschließlich echter
Lua-Ausführung des Statuslesers. Vollständiges `npm.cmd run --silent quality:ci` erfolgreich (Exitcode 0).
Windows-Fehler beim Entfernen bereits leerer temporärer Identitäts-/Anbieterstandard-Testordner sind mit begrenzten
Aufräumwiederholungen abgesichert; auch die Paketfixture verwendet diesen Rückweg. Projektstatus synchronisiert; Squarespace-Footer geprüft und unverändert,
da keine dort eingebundenen Module geändert wurden. Keine produktive Aktivierung und keine Fotoänderung.

Der Aufbauvertrag bindet:

- Basismaster-Version, Masterschema und Normalisiererversion;
- Prüfsummen der Regeln, Identitätsentscheidungen, eigenen Korrekturen und Projektwerte;
- alle geplanten Anbieter einschließlich Version, abgegrenztem Datenumfang, Quellprüfsumme und erwarteter Zeilenzahl.

Die Eingangsaufbereitung bindet die tatsächlich geladenen lokalen Quellenstände und verifizierten
Anbieterimporte. Eine bloß deklarierte Prüfsumme oder Zeilenzahl beweist keinen vollständigen Download.
Dieses Modul ersetzt deshalb nicht die vorhandene Import-/Archivprüfung.
Vor der Fingerabdruckbildung müssen doppelte Quellen-IDs nach den bestehenden Masterregeln zusammengeführt
werden. Dort kann der Abrufzeitpunkt die Auswahl einer Trägerzeile beeinflussen; erst danach darf er als
Beobachtungsmetadatum entfallen. Die erwartete Zeilenzahl bezieht sich auf diesen eindeutigen Eingangsbestand,
nicht ungeprüft auf die Rohzeilenzahl des Downloads. Die Anbindung verwendet die bereits zusammengeführten
Datensätze des Vollaufbaus vor dem Verwerfen historischer Identitätsgruppen; sie dupliziert keine Fachregeln.

### Fachliche Fingerabdrücke

Objektschlüssel werden kanonisch sortiert; Werte, Listenreihenfolge und unbekannte Felder bleiben erhalten.
Nur die bekannten Beobachtungsfelder `retrievedAt`, `payloadSha256` und nicht-entfernende `versionChangeState`-
Markierungen werden ausgenommen. Der Zustand `removed` bleibt fachlich relevant. Namen, Taxonomiepfade,
Quellenverknüpfungen und sonstige normalisierte Inhalte verändern den Fingerabdruck weiterhin.

Ein neues Release mit identischen Datensätzen meldet damit nur geänderte Quellenprovenienz, nicht fälschlich
eine fachliche Änderung aller Taxa. Diese Provenienz muss der spätere Kandidatenbau trotzdem aktualisieren.
Der Fingerabdruck des gesamten Eingangsstands umfasst zusätzlich Quellenvertrag und Checkpoints; er kann sich
auch bei gleichem fachlichem Inhalt ändern. Er ist kein Gleichheitsbeweis für fertige Masterdatenbanken.

### Checkpoints und Vollständigkeit

Die Datei wird ausschließlich neu angelegt; existierende Dateien werden nicht überschrieben. Jeder Block
enthält höchstens 1.000 Datensätze und wird transaktional gespeichert. Eine identische Wiederholung ist erlaubt,
eine veränderte Wiederholung, doppelte ID oder übersprungene Position nicht. Datensatzschlüssel bestehen aus
Anbieter und Anbieter-ID, nicht aus einer geratenen Namensidentität.

Die Wiederaufnahme prüft den vollständigen Vertrag sowie die gespeicherten Positionen und verketteten
Prüfsummen. Quellenwechsel und zwischenzeitliche Regel-/Korrekturänderungen blockieren einen alten Checkpoint.
Erst wenn alle geplanten Quellen exakt vollständig eingelesen sind, wird der Stand versiegelt. Unfertige oder
nachträglich veränderte Stände können nicht als Vergleichsgrundlage geöffnet werden.

Der Vergleich liest beide versiegelten Stände geordnet und meldet Änderungen einzeln, ohne alle IDs als große
Liste zu sammeln. Er unterscheidet hinzugefügt, geändert, entfernt und unverändert. Die Sortierung entspricht
auch für Unicode-Schlüssel der SQLite-Reihenfolge.

- Fehlender Anbieter oder geänderter Quellenumfang: Vergleich gesperrt, kein Löschauftrag.
- Vollständige vergleichbare Quelle ohne einen bisherigen Datensatz: Verlust dieses **Anbieter-Datensatzes**.
  Das erlaubt ausdrücklich noch keine Löschung einer Masterart oder Fotozuordnung.
- Geändertes Schema, Normalisierung, Regeln, Identitäten, Korrekturen oder Projektwerte: zunächst expliziter
  Vollaufbau erforderlich. Die vorhandene schnelle Namenskorrektur ist davon unabhängig und bleibt unverändert.
- Geänderte Basisversion allein: im Vergleich zulässig; im Wiederanlauf eines begonnenen Standes dagegen nicht.

## Noch offen vor produktiver Nutzung

1. Weitere Aufrufwege, insbesondere das direkte Migrationsskript, mit einem expliziten Vollständigkeitsbeleg
   ausstatten, bevor sie ebenfalls als Deltabasis dienen. Der Explorer-Aufrufweg ist angeschlossen.
   Bestehende Master ohne solche Basis brauchen einen kontrollierten ersten Vollaufbau.
2. Erste isolierte Messungen mit 10.000 synthetischen Arten sind abgeschlossen. Laufzeitausreißer und
   höheren Speicherbedarf eingrenzen, bevor eine Freigabe für den produktiven Großbestand erfolgt.
   Weitere Struktur-/Identitätsfälle gezielt absichern; diese bleiben derzeit ausdrücklich beim Vollaufbau.
   Die Anbindung für unveränderte Arten, aktuelle Beleg-IDs und kleine Vollaufbau-Gleichheitstests ist umgesetzt.
3. Gemeinsame Master-/Suchpaketfreigabe ist seit 13. September technisch angeschlossen und isoliert geprüft;
   noch am Großbestand und mit produktiv geöffneten Verbrauchern abnehmen.
4. Masterworker mit dauerhaften 500er-Schreibblöcken, Service-/Oberflächenanbindung, aktuelle Eingangsauswahl
   und Auftragswiederentdeckung sind implementiert. Pause, Prozessverlust, harter Abbruch und bestätigte
   Fortsetzung sind isoliert geprüft. Auch die schwere Paarprüfung ist ausgelagert und mit echten Hilfsprozessen
   geprüft. Als Nächstes Aufbewahrung/Platzbudget ergänzen und den Wiederanlauf des **gesamten Aufbaus**
   einschließlich Vorbereitung/Verbrauchern abnehmen. Details und Grenzen:
   `taxonomy-master-background-build.md`. Kein produktiver Großbestandslauf in diesem Schritt.
5. Vollaufbau-/Delta-Ergebnisgleichheit, mehrstufige Updates, Fehler/Rollback mit geöffneten Verbrauchern und
   großen Testbestand messen. Es gibt noch keine belastbare Laufzeit- oder RAM-Zusage für die produktive Nutzung.

## Anbindung an den Explorer-Vollaufbau

Der Service lädt Anbieterdateien weiterhin über den bestehenden Prüfsummen-/Zeilenzahlvertrag. Danach wird der
vorhandene Auswahlfilter angewendet. Für CoL wird der gezielte Leselauf nach allen angefragten wissenschaftlichen
Namen verfolgt: Erst normales Iteratorende bestätigt Vollständigkeit. Fehler oder vorzeitiger Abbruch nicht.
Die CoL-Gesamttaxazahl wird niemals mit der Größe dieser gezielten Auswahl verwechselt. Der Quellenumfang enthält
einen Fingerabdruck der angefragten Namen. Eine andere Zielauswahl sperrt zunächst den sicheren Deltavergleich,
nicht den weiterhin vollständig ausgeführten Kandidatenbau. Anbieter-Ausschnitte beziehen sich auf die vollständig
ausgewertete lokale Auswahlregel, nicht auf einen behaupteten weltweiten Gesamtbestand des Anbieters.

Beim Schreiben entsteht `build-inputs.sqlite` ausschließlich im neuen temporären Kandidatenordner. Die
Input-Prüfsumme beschreibt die zusammengeführten effektiven Eingänge; die ursprünglichen Releaseangaben samt
verfügbaren Archivprüfsummen werden zusätzlich im Vertrag gespeichert. Die Regelrevision umfasst die beteiligten
lokalen Quellmodule mit vereinheitlichten Zeilenenden. Seit Prozessstart geänderte Build-Dateien machen den
Eingangsstand vorsichtshalber ungeeignet; kein alter Prozess behauptet damit eine neue Regelbasis.

Nach erfolgreichem Vollaufbau bindet das Manifest Kandidaten-ID, Eingangsprüfsumme und SHA-256 der fertigen
Masterdatei. Das bestehende Verzeichnis-Umschalten nimmt diese Datei bei Kandidatenersetzung, Aktivierung und
Rollback mit. Fremde Eingangsdateien, fehlende Dateien oder nachträglich veränderte Master, etwa nach einer
Konfliktentscheidung, werden nicht als gültige Wiederverwendungsbasis behandelt. Ein späterer Aufbau braucht
dann eine frische Baseline; Entscheidungen werden nicht gelöscht. Alte Aufrufer ohne Beleg funktionieren weiterhin
als Vollaufbau, erhalten aber ausdrücklich `unverified-input-coverage` statt einer vermeintlich sicheren Baseline.

Das Manifest enthält weiterhin einen **nachgelagerten Eingangsvergleich**. Der zusätzliche vorgeschaltete
Wiederverwendungspfad setzt `buildMode: incremental` nur bei tatsächlich übernommenen Arten; sonst `full`.
Die bestehenden Master-/Paketaktivierungen erfolgen unverändert
nacheinander. Noch kein gemeinsamer Aktivierungszeiger, kein neuer vollständiger Wiederanlauf des Builders,
keine automatische Reparatur oder Aktivierung beim Starten eines Fensters.

Zusätzliche Dateigröße, Leseaufwand für Masterprüfsummen und das vorübergehende Beibehalten der Datensatzreferenzen
müssen beim großen Testbestand gemessen werden. Begrenzte Schreibpuffer und Freigabe der Ereignisschleife ersetzen
noch keinen Hintergrundworker für sämtliche SQLite-Prüfungen. Es wurde kein produktiver Aufbau gestartet.

## Abhängigkeitsplan (12. September)

`taxonomy-master-dependencies.mjs` erzeugt nach einem vergleichbaren Eingangsdelta die separate Kandidatendatei
`build-dependencies.sqlite`. Beide Masterdateien bleiben read-only. Die Datei enthält indizierte Abhängigkeiten
und Warteschlangen statt großer JavaScript-Listen. Ihr Fingerabdruck und ihre Zähler stehen im Kandidatenmanifest.
Sie ist ein **konservativer Neuberechnungsplan**, keine Kopier- oder Löschfreigabe (`reuseAuthorized: false`).

Berücksichtigt werden die Vereinigung aus altem und neuem Stand:

- Besitzer eines Anbieter-Datensatzes sowie dessen Eltern- und Akzeptiert-Verweise innerhalb desselben Anbieters;
- wissenschaftliche Namen und Synonyme nach Rang, einschließlich alter Aliasse und möglicher Homonyme;
- Hierarchiepfade und die bestehende reichsübergreifende CoL-Gattungsableitung für fehlende Reichswerte;
- neue oder weggefallene Master-IDs sowie indirekt betroffene Verbraucher in der gesamten Verknüpfungskette.

Diese Namensverknüpfungen markieren ausschließlich Prüfbedarf. Sie wählen keine Nachfolger, führen keine Taxa
zusammen und ändern keine IDs. Eingebettete Pfadänderungen sind zudem bereits fachliche Datensatzänderungen.
Da der derzeitige Master überwiegend Artzeilen enthält, behauptet dieser Plan keinen eigenständigen vollständigen
CoL-Graphen aller übergeordneten Ränge. Das Lesen der ausgewählten Eingänge bleibt erforderlich.

Manuelle/Projektfelder, Entscheidungen, Konflikte, alte Aliasse, veraltete Belege und nicht exakt CoL-bestätigte
Taxa werden vorläufig auch ohne Quellenänderung neu geprüft. Das ist bewusst konservativ und kann bei vielen
externen Arten einen großen Anteil der Wiederverwendung ausschließen. Erst Vollaufbau-Gleichheitstests dürfen
diese Grenzen gezielt lockern. Reine Releasezeitänderungen allein markieren unverbundene, zustandsfreie Taxa
weiterhin nicht zur fachlichen Neuberechnung; die neue Provenienz muss später dennoch übernommen werden.

Einmalige Warteschlangeneinträge beenden Zyklen ohne Rekursion. Alte Kanten bleiben wichtig, wenn die neue Quelle
eine Verknüpfung entfernt. Ein geänderter Datensatz ohne belegbaren Verbraucher erzwingt einen Vollaufbaugrund
statt einer stillschweigenden Freigabe. `previousOnlyTaxa` zählt nur Unterschiede und erlaubt keine Fotolöschung.

Der allgemeine Plan bleibt nachgelagert. Bei nachweislich identischer Graphstruktur darf der vorgeschaltete
Wiederverwendungsweg denselben Plan auf dem alten Graphen berechnen. Zusätzliche SQLite-Größe, Laufzeit und
Arbeitsspeicher sind vor Freigabe am großen Bestand zu messen.

## Begrenzte tatsächliche Wiederverwendung (12. September)

`taxonomy-master-reuse.mjs` wird nach dem Speichern der Eingänge, aber vor dem Schreiben der Ergebnisfelder
aufgerufen. Voraussetzungen sind eine gebundene Altbaseline, unveränderte Regeln/Projektwerte/Korrekturen/
Identitätsentscheidungen und ein vergleichbarer Quellenumfang. Neue/entfernte Anbieter-Datensätze, veränderte
Quellenbesitzer, Hierarchien, Eltern-/Akzeptiert-Verweise oder wissenschaftliche Namensverknüpfungen verlangen
vorläufig einen Vollaufbau. Dadurch ist der alte Abhängigkeitsgraph auch für die neue Berechnung gültig.

Änderungen beispielsweise an deutschen Anbieternamen werden vor dem Schreiben samt allen abhängigen Arten
markiert. Unveränderte, zustandsfreie und nicht abhängige Arten überspringen die erneute Kandidatenbildung und
Feldauswahl. Eigene/Projektfelder, Konflikte, historische Aliasse, veraltete und nicht exakt CoL-bestätigte Arten
bleiben im bisherigen Schreibweg. Umgeordnete Quellen einer Art werden ebenfalls neu berechnet: Bei gleichen
Werten kann die Quellenreihenfolge den ausgewählten Beleg bestimmen.

Übernommen werden Taxon, Quellen-/Namens-/Feldbelege, Mitgliedschaften und Status. Die Übernahme vergibt neue
lokale Beleg-IDs und verknüpft sie mit den **aktuellen** Releases. Abruf-/Importzeit, Payload-Prüfsumme und
Änderungsmarkierung stammen aus den aktuellen Eingängen; Quellenprovenienz wird nicht auf dem Altstand belassen.
Der Suchindex wird weiterhin vollständig aus dem resultierenden Kandidaten gebaut. Fotos bleiben unberührt.

Das Manifest zählt `reuse.reusedTaxa` und `reuse.recomputedGroups` und nennt den Freigabe-/Rückfallgrund.
`reuseUnchanged: false` erzwingt intern den Vollaufbau für Vergleichstests; kein neuer Menüpunkt.
Die SQLite-Verbindungen zum Wiederverwendungsplan werden **vor** dem Verzeichniswechsel geschlossen; ein
Windows-Sperrbefund aus den Tests wurde damit behoben. Fehler verwerfen den neuen temporären Kandidaten.

Zwei aufeinanderfolgende Wiederverwendungsläufe wurden gegen jeweils einen Vollaufbau mit denselben Eingängen,
demselben Ausgangsmaster und derselben Zeit geprüft. Alle Mastertabellen einschließlich ausgewählter Belege,
aktueller Quellenprovenienz und Suchindex stimmen semantisch überein; lokale künstliche Zeilen-IDs werden über
ihre Beziehungen verglichen. Ein weiterer Test deckt mehrere Anbieter und geschützte Projektfelder ab.
Dies ist noch keine Leistungsfreigabe am produktiven Großbestand und kein fertiger inkrementeller Lightroom-
Paketbau. Der gemeinsame Aktivierungswechsel, Hintergrundworker und komplette Wiederanlauf bleiben offen.

Prüfstand nach der Umsetzung am 12. September: alle 20 Anbindungs-, Abhängigkeits- und
Wiederverwendungstests erfolgreich. Das vollständige `npm.cmd run --silent quality:ci` einschließlich
Lightroom-Verträgen und lokalem Projektaudit ist ebenfalls erfolgreich (Exitcode 0).
`git diff --check` ist fehlerfrei; bestehende Git-Hinweise zur LF-/CRLF-Konvertierung bleiben unkritisch.

## Tests

### Reproduzierbare Leistungs- und Grenzprüfung

`node --no-warnings scripts/taxonomy-master-benchmark.mjs 10000 sparse 2` erzeugt ausschließlich einen
eigenen Bestand unter `Testlauf/master-benchmark-*`. Zulässig sind 10 bis 20.000 synthetische Arten und
ein bis drei Messpaare. Zehn Arten teilen sich jeweils eine Gattung. `sparse` verändert einen deutschen
Anbieternamen je 1.000 Arten, `dense` alle deutschen Namen, `structure` einen Familienpfad und `unchanged`
nur den Release-/Zeitstand. Neue Prozesse verhindern die Übernahme des Node-Heaps vom vorherigen Lauf.
Die Reihenfolge Wiederverwendung/Vollaufbau wird zwischen den Messpaaren gewechselt. Beide Wege beginnen
mit einer Kopie desselben Testmasters und denselben neuen Eingängen; die künstlichen Erstellzeiten sind gleich.
Vorbereitung des Ausgangsbestands, Dateikopie, Ergebnisvergleich und Aufräumen gehören nicht zur Aufbauzeit.

Jeder Messlauf prüft die erwartete Anzahl wiederverwendeter Arten. Alle Mastertabellen werden einschließlich
Quellen-/Feldbelegen und Suchindex semantisch verglichen: künstliche Zeilen-IDs werden auf ihre Beziehungen
abgebildet, sortierte Zeilen pro Tabelle gezählt und mit SHA-256 verglichen. Die Prüfsumme des Ausgangsmasters
muss unverändert bleiben. Nur der eigens erzeugte Testordner wird anschließend entfernt; produktive Pfade
sind weder Eingabeparameter noch Aktivierungsziel. Bei gewaltsamem Prozessabbruch kann ein Testordner zurückbleiben.

Gemessen werden komplette Kandidatenbauzeit, Prozess-Spitzen-RSS vor Ergebnisvergleich, zusätzlich beobachtetes
RSS und Dateigrößen. Die nach Fortschrittsereignissen aufgeteilten Phasenzeiten sind Näherungen, kein CPU-Profil.
Der erzwungene Vollaufbau enthält die aktuelle Baseline-/Abhängigkeitsprüfung; die Werte sind kein Vergleich
mit einer historischen Plug-in-Version. Große Messläufe sind bewusst nicht im CI-Gate; zwei kleine Tests prüfen
den Messvertrag und einen echten isolierten Vergleich.

Der erste 10.000-Arten-Lauf am 12. September (Windows, Node 24.12.0, wenige Namensänderungen) zeigte trotz
9.900 wiederverwendeter Arten **19,34–19,71 s** gegenüber **16,31–16,48 s** Vollaufbau. Daraufhin wurden zwei
Kostenstellen behoben: identische Vorher-/Nachher-Dateien werden im vorgeschalteten Plan nur einmal eingelesen,
und die Kopierstrecke verwendet vorbereitete Schreibanweisungen erneut. Sämtliche Feldvalidierungen der
vorhandenen Modellfunktionen bleiben erhalten. Kopierdaten werden weiterhin nur mit aktuellen Quellenbelegen
und im neuen Kandidaten geschrieben; es wird kein Sicherheitscheck ausgelassen.

Nach dieser Optimierung ergaben die getrennten Messpaare bei 10.000 Arten:

| Fall | Automatischer Weg | Erzwungener Vollaufbau | Wiederverwendete Arten |
| --- | --- | --- | --- |
| Zehn geänderte Namen, 100 abhängige Arten | 14,64 s; weiterer Lauf 29,46 s | 16,42–16,47 s | 9.900 |
| Alle Namen geändert, vor direktem Rückfall | 19,45–19,88 s | 16,95–17,15 s | 0 |
| Ein Familienpfad geändert | 16,89 s; weiterer Lauf 33,55 s | 16,44–16,70 s | 0, korrekter Vollaufbau-Rückfall |

In allen Fällen stimmen sämtliche verglichenen Mastertabellen überein. Die langsamen Ausreißer sind
ausdrücklich **nicht** aus der Bewertung entfernt; ihre Ursache ist mit dieser Messung nicht geklärt.
Der einzelne schnellere Lauf ist kein belastbarer allgemeiner Geschwindigkeitsnachweis. Spitzen-RSS:
bei wenigen Namensänderungen rund 317–318 MiB gegenüber 253–254 MiB beim Vollaufbau; beim Struktur-Rückfall
rund 401 MiB gegenüber 253–256 MiB. Der zusätzliche Wiederverwendungsplan benötigt im Namensänderungsfall
rund 12,5 MiB Dateispeicher; die Ergebnisdatenbank selbst rund 121,3 MiB in beiden Wegen.
Keine Hochrechnung dieser synthetischen Messung auf CoL-Vollbestand, Quelldownload oder Lightroom-Paket.

Der Fall „alle Eingänge geändert“ führte zu einer weiteren Korrektur: `all-records-changed` wechselt jetzt
direkt in die Neuberechnung und erstellt keinen vorgeschalteten Wiederverwendungsplan. Quellenfreie und
manuelle Gruppen waren ohnehin nie kopierberechtigt. Der nachgelagerte Ergebnis-/Abhängigkeitsvergleich bleibt
erhalten. Ein Regressionstest prüft fehlende temporäre Plandatei, Grund und Ergebnisgleichheit.
Der abschließende 10.000-Arten-Vergleich dieses Rückfalls ergab **17,35 s** gegenüber **17,01 s** beim
erzwungenen Vollaufbau, bei identischen Ergebnissen und ohne zusätzliche Wiederverwendungs-Plandatei.
Das Spitzen-RSS blieb mit rund **400 MiB** gegenüber **254 MiB** erhöht und bleibt ausdrücklich offen.

Abschlussprüfung dieses Mess-/Optimierungsschritts: vollständiges `npm.cmd run --silent quality:ci`
erfolgreich (Exitcode 0), einschließlich der nun 22 Anbindungs-/Abhängigkeits-/Wiederverwendungstests und
zweier Messwerkzeugtests. Projektstatus synchronisiert, Dokumentationsverweise und `git diff --check` geprüft.
Der Squarespace-Footer wurde geprüft; ausschließlich lokale Backend-/Testmodule betroffen, keine neue
Footer-Version. Keine Lua-Änderung und kein Versionswechsel des Lightroom-Plug-ins in diesem Schritt.

Zusätzlich prüft ein Abbruchtest mit 1.000 Arten Fehler während Strukturprüfung, Abhängigkeitsplanung und nach
500 übernommenen Arten. Alter Master und vorhandener Kandidat bleiben bytegleich, temporäre Kandidaten werden
entfernt und ein anschließender Wiederholungsaufbau gelingt. Dieser simulierte Abbruch ist kein Stromausfall-
oder Betriebssystem-Neustarttest und ersetzt nicht die noch offenen dauerhaften Worker-Checkpoints.

`node --no-warnings --test --test-isolation=none species-explorer/taxonomy-build-inputs.test.mjs`:
16 direkte Tests für Fingerabdrücke, Quellenvertrag, Vollständigkeit, atomare Blöcke, idempotente Wiederholung,
Wiederaufnahme, Manipulationserkennung, reine Releasewechsel, Änderungen/Verluste, Vollaufbaugrenzen,
Unicode-Sortierung, Callbackabbruch, Blockgrenze und zusätzlichen Anbieter.

Die Tests verwenden ausschließlich eigene temporäre SQLite-Dateien und sind in `test:taxonomy-master` und
damit in `quality:ci` eingebunden. Diese 16 Eingangstests belegen den isolierten Eingangsvergleich;
die Ergebnisgleichheit mit dem Vollaufbau prüfen die unten beschriebenen Wiederverwendungstests.

Die neue Anbindung wird zusätzlich in zehn Tests in `taxonomy-master-inputs.test.mjs` geprüft: ausgewählter
Quellenumfang, neue Releases, Duplikate, Hierarchieänderung, Rollback, Lese-/Schreibabbruch, Dateibindung,
Legacy-Aufrufer, gefilterte Anbieter und unvollständiger Beleg. Ein weiterer Service-Integrationstest führt
den echten Explorer-Kandidatenbau bis zur gespeicherten Baseline aus, ohne Aktivierung.

Am 12. September ergänzen sieben Abhängigkeitstests in derselben Testdatei Gattungsableitung, transitive
Eltern-/Akzeptiert-Ketten samt Zyklus, entfernte Kanten, wissenschaftliche Namensvarianten, manuelle Projektfelder,
verschwundene Arten und nicht zuordenbare Eingangsänderungen. Der vorhandene Release-/Rollbacktest prüft nun auch
die unveränderten Wiederverwendungskandidaten. Der allgemeine Abhängigkeitsplan allein bleibt ohne
Kopierfreigabe; der vorgeschaltete Schreibweg verlangt zusätzlich den Beleg einer stabilen Struktur.
Alle Tests bleiben bei temporären Beständen.
Ergebnis vor der Wiederverwendung: alle 17 Anbindungs-/Abhängigkeitstests sowie das vollständige `npm.cmd run --silent quality:ci`
erfolgreich. Dokumentationsprüfung und `git diff --check` ebenfalls erfolgreich (nur bestehende Git-Hinweise
auf LF-/CRLF-Konvertierung). Squarespace-Footer bleibt unverändert, da ausschließlich lokale Backendmodule
betroffen sind. Kein produktiver Datenbanklauf und keine neue Lightroom-Plug-in-Version in diesem Schritt.

Am 11. September bestanden nach der Anbindung: vollständiges `npm.cmd run --silent quality:ci`, einschließlich
der elf neuen Anbindungstests und der bestehenden Lightroom-Tests. Squarespace-Footer geprüft: Der neue Backendbaustein wird dort nicht eingebunden;
keine neue Footer-Version erforderlich. Der Lightroom-Plug-in-Stand bleibt in diesem Baustein unverändert.
