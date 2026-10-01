# Inkrementeller Masteraufbau – Implementierungsstand

Stand: 2026-10-01

Verbindlicher Gesamtauftrag: `taxonomy-identity-incremental-plan.md`, Abschnitt 4. Dieses Dokument beschreibt
die tatsächliche Implementierung, nicht bereits erreichte Beschleunigung des produktiven Aufbaus.

**Bestandsschutz vom 30. September:** Teil-Suchtreffer erhalten belegte Aufnahme-/Identitätsfelder derselben
Anbieter-ID. Ungeklärte Verluste alter Master-IDs sperren Einzel- und Paaraktivierung, nicht den prüfbaren
Kandidaten. Beide Schutzmodule gehören zum Regelfingerabdruck; die Änderung kann daher einen Vollweg verlangen.
Die produktive Quellenreparatur einschließlich vier historisch erhaltener Ersatz-IDs ist am 1. Oktober vollständig
geprüft und gemeinsam aktiviert. Felix bestätigte anschließend die gezielte Explorer-/Lightroom-Abnahme mit
Weissstorch/Rebhuhn. Kein weiterer Aufbau zur Reparatur/Diagnose. Das reparierte Paket wurde inkrementell
erzeugt; das ist kein Leistungsnachweis eines vollständigen regulären Quellenupdates und keine Abnahme von
Pause/Fortsetzung oder Rollback. Die 2.173 separaten CoL-/Reichsfälle bleiben außerhalb der Freigabe.
Vertrag und vollständiger Abschluss: [Quellenreparatur](taxonomy-partial-source-recovery.md);
aktueller [Betriebsstand](taxonomy-current-status.md).

**Leistungsstand vom 21. September:** Nach dem negativen ersten Paketvergleich ist eine gebundene Änderungsmenge
mit gezieltem Export statt Vollprojektion implementiert. Vollständige Basisprüfung läuft verpflichtend parallel.
Bei 10.000 Testarten werden zehn Taxa neu exportiert: 1,78–1,87 s gegenüber 2,17–2,19 s im heutigen Vollpfad.
Der frühere Vollpfad ohne zusätzliche Vergleichsgrundlage lag allerdings bereits bei etwa 1,8 s.
Deutliche Gesamtbeschleunigung und produktive Abnahme bleiben offen. Vertrag: `lightroom-incremental-export.md`;
Messvertrag und Grenzen: `taxonomy-operational-checks.md`.

Seit 22. September übernimmt auch der Masteraufbau die Suchbegriffe nachweislich unveränderter Arten,
statt diese erneut zu normalisieren. Der Nachweis und die noch offenen Gesamtlaufgrenzen stehen unten.
Seit 23. September entfällt zusätzlich die erneute Erstellung des Abschlussplans, wenn ein vollständiger
Strukturvergleich die Übernahme des frisch erzeugten Vorabplans bestätigt. Wiederholte 10.000-Arten-Vergleiche
zeigen etwa 11,1 s Kandidatenbau gegenüber 16,3–16,5 s im heutigen Vollpfad. Das ist weiterhin kein
Zeitnachweis für das Gesamtupdate oder den realen Anbieterbestand.

## Erster Baustein: wiederaufnehmbare Eingangsvergleiche

`species-explorer/taxonomy-build-inputs.mjs` speichert normalisierte Anbieter-Datensatzfingerabdrücke in einer
eigenen SQLite-Datei. Über `taxonomy-master-inputs.mjs` ist er jetzt an den Explorer-Masterkandidatenbau
angeschlossen. Weder aktive Datenbanken noch Lightroom-Kataloge werden beim Kandidatenbau verändert.
Der bisherige Vollaufbau bleibt Rückfallweg. Seit 12. September überspringt ein begrenzter Wiederverwendungspfad
die Feldauswahl unveränderter Arten. Seit 13. September ist auch der unten beschriebene Paket-Deltapfad angebunden.

## Suchpaket und gemeinsamer Aktivstand (13. September)

Technisch umgesetzt, mit isolierten Datenbanken geprüft; **kein produktiver Neuaufbau und noch keine
Großbestandsfreigabe**. Das Lightroom-Plug-in steht für den neuen Aktivzeiger bei **0.4.24.14**.

- `lightroom-search-delta.mjs` vergleicht seit 21. September nur noch die Projektion geänderter Taxa mit einer
  prüfsummenverifizierten Kopie des bisherigen Suchpakets. Der SQL-Vertrag bleibt mit Vollaufbau gemeinsam.
  Nur abweichende Datensätze und Volltext-Sucheinträge werden geschrieben;
  gleiche Suchbegriffe behalten ihre lokalen IDs, selbst bei veränderter Reihenfolge im neuen Master.
- Namen, Hierarchien, Projektlinks, Status, Quellenstände und Identitätsinformationen bleiben enthalten.
  Fehlende, beschädigte oder inkompatible Basis: vollständiger Paketaufbau. Ergebnisprüfung bleibt Pflicht.
- Das ist **kein vollständiger Verzicht auf Vollbestand-Lesen oder Dateikopien**: Fingerabdruckvergleich,
  Herkunftsaktualisierung, Integritätsprüfungen und Prüfsummen lesen weiterhin den gesamten Bestand. Noch keine belegte
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

**Weiter offen vor produktiver Abnahme:** deutliche Gesamtbeschleunigung über den inzwischen gezielten Paketexport hinaus,
Speicher-/Laufzeitnachweis am realen Großbestand und echter Explorer-Neustarttest. Isolierte vergleichbare
Messungen beider Deltapfade liegen vor, belegen aber noch nicht das Gesamtziel.
Aufbewahrung/Platzprüfung sind mit Vorschau, einem geprüften Vorgänger als Backup, geschützten Jobabhängigkeiten
und 2-GiB-Reserve angebunden; Vertrag: `taxonomy-storage-maintenance.md`. Die aufwendige
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

## Verbleibende reguläre Update- und Betriebsabnahme

1. Weitere Aufrufwege, insbesondere das direkte Migrationsskript, mit einem expliziten Vollständigkeitsbeleg
   ausstatten, bevor sie ebenfalls als Deltabasis dienen. Der Explorer-Aufrufweg ist angeschlossen.
   Bestehende Master ohne solche Basis brauchen einen kontrollierten ersten Vollaufbau.
2. Isolierte Größenmessungen und zusammenhängender Wiederanlaufcheck werden in
   `taxonomy-operational-checks.md` dokumentiert. Laufzeitausreißer und
   höheren Speicherbedarf eingrenzen, bevor eine Freigabe für den produktiven Großbestand erfolgt.
   Die ergänzende Ressourcenprüfung mit synthetischen Mehranbieterbelegen steht in
   `taxonomy-performance-profiling.md`. Die anschließend integrierte, auf acht gleichzeitige Hauptdatenbanken
   je Laufzeit begrenzte Aufbau-Pufferregel samt Fehler-/Wiederanlaufprüfungen steht in `taxonomy-build-cache.md`.
   Weitere Struktur-/Identitätsfälle gezielt absichern; diese bleiben derzeit ausdrücklich beim Vollaufbau.
   Die Anbindung für unveränderte Arten, aktuelle Beleg-IDs und kleine Vollaufbau-Gleichheitstests ist umgesetzt.
3. Gemeinsame Master-/Suchpaketfreigabe ist seit 13. September technisch angeschlossen und isoliert geprüft.
   Im engen Reparaturweg am 1. Oktober zusätzlich produktiv aktiviert und vollständig verglichen; anschließende
   normale Explorer-/Lightroom-Stichprobe bestätigt. Reguläre Quellenupdates sowie Fehler-/Rollbackzustände
   mit geöffneten Verbrauchern bleiben getrennt abzunehmen.
4. Masterworker mit dauerhaften 500er-Schreibblöcken, Service-/Oberflächenanbindung, aktuelle Eingangsauswahl
   und Auftragswiederentdeckung sind implementiert. Pause, Prozessverlust, harter Abbruch und bestätigte
   Fortsetzung sind isoliert geprüft. Auch die schwere Paarprüfung ist ausgelagert und mit echten Hilfsprozessen
   geprüft. Aufbewahrung/Platzprüfung sind ebenfalls angebunden. Nach Eingrenzung von Laufzeitstreuung und
   Speicherbedarf den Wiederanlauf des **gesamten produktiven Aufbaus** einschließlich Vorbereitung und
   geöffneten Verbrauchern abnehmen. Details und Grenzen:
   `taxonomy-master-background-build.md`. Kein produktiver Großbestandslauf in diesem Schritt.
5. Die isolierten Tests decken Vollaufbau-/Delta-Ergebnisgleichheit, mehrstufige Updates und Fehler/Rollback
   mit offenen Datenbanklesern ab. Integrierte 10.000-/20.000-Arten-Vergleiche einschließlich Paarfreigabe
   sind durchgeführt. Die Übertragung auf reale Anbieter-/Namensvielfalt und produktive Verbraucher bleibt
   offen; es gibt noch keine belastbare Laufzeit- oder RAM-Zusage für die produktive Nutzung.

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
Zum damaligen Stand wurde der Suchindex weiterhin vollständig aus dem resultierenden Kandidaten gebaut.
Seit 22. September gilt die nachfolgende begrenzte Suchübernahme. Fotos bleiben unberührt.

Das Manifest zählt `reuse.reusedTaxa` und `reuse.recomputedGroups` und nennt den Freigabe-/Rückfallgrund.
`reuseUnchanged: false` erzwingt intern den Vollaufbau für Vergleichstests; kein neuer Menüpunkt.
Die SQLite-Verbindungen zum Wiederverwendungsplan werden **vor** dem Verzeichniswechsel geschlossen; ein
Windows-Sperrbefund aus den Tests wurde damit behoben. Fehler verwerfen den neuen temporären Kandidaten.

Zwei aufeinanderfolgende Wiederverwendungsläufe wurden gegen jeweils einen Vollaufbau mit denselben Eingängen,
demselben Ausgangsmaster und derselben Zeit geprüft. Alle Mastertabellen einschließlich ausgewählter Belege,
aktueller Quellenprovenienz und Suchindex stimmen semantisch überein; lokale künstliche Zeilen-IDs werden über
ihre Beziehungen verglichen. Ein weiterer Test deckt mehrere Anbieter und geschützte Projektfelder ab.
Zum damaligen Stand vom 12. September war dies noch keine Leistungsfreigabe am produktiven Großbestand;
Paket-Deltas, gemeinsamer Aktivierungswechsel und Hintergrundworker folgten später. Der heutige Stand steht
am Anfang dieses Dokuments und in `taxonomy-master-background-build.md`.

Prüfstand nach der Umsetzung am 12. September: alle 20 Anbindungs-, Abhängigkeits- und
Wiederverwendungstests erfolgreich. Das vollständige `npm.cmd run --silent quality:ci` einschließlich
Lightroom-Verträgen und lokalem Projektaudit ist ebenfalls erfolgreich (Exitcode 0).
`git diff --check` ist fehlerfrei; bestehende Git-Hinweise zur LF-/CRLF-Konvertierung bleiben unkritisch.

## Gezielte Suchübernahme im Master (22. September)

`taxonomy-master-search-reuse.mjs` übernimmt ausschließlich Suchbegriffe der bereits zur Feldübernahme
freigegebenen Arten. Unveränderte Eingänge, Regeln, Identitäten und Abhängigkeiten sowie gleiche Quellenreihenfolge
bleiben Voraussetzungen. Eigene Entscheidungen, Konflikte, frühere Aliasse und betroffene Arten bleiben im
vollständigen bisherigen Rechenweg. Die neue Datei ist Teil des Regelprüfwerts; alte Regelstände verlangen
zunächst wieder einen Vollaufbau, nicht die ungeprüfte Nutzung alter abgeleiteter Suchdaten.

- Der private Kandidat merkt freigegebene Taxon-IDs in `master_build_reused_search`, zusammen mit dem
  jeweiligen Taxon-Schreibblock. Noch werden dabei keine Suchbegriffe geschrieben.
- Im Abschlussblock liest SQLite die alte Suchtabelle einmal in bisheriger Zeilenreihenfolge und übernimmt
  nur markierte Arten. Der Anschluss der Quelle ist ausdrücklich read-only (`mode=ro`). Eine zusätzliche
  Sortierung über den Taxonindex wird vermieden; Kopieren einzeln je Art war im Test langsamer.
- Neue Suchbegriffe werden nur für die übrigen Arten normalisiert. Begriff, Normalformen, deutsche
  Suchschlüssel, Sprache, Quellenanbieter, Art des Begriffs und Gewicht bleiben erhalten. Suchzeilen-IDs sind
  interne Schlüssel ohne stabile fachliche Bedeutung; Inhaltsvergleich und echte Suchabfragen prüfen das Ergebnis.
- Herkunfts-/Zeitangaben der Fachbelege werden weiterhin aus den heutigen Eingängen übernommen. Suchbegriffe
  selbst enthalten keine Release-Zeitangaben oder Feldbeleg-IDs.
- Anzahl der Marker muss zum gespeicherten Wiederverwendungszähler passen; eine markierte Art ohne alte
  Suchbegriffe wird nicht als Erfolg behandelt. Die Marker werden vor erfolgreichem Abschluss entfernt.
- Bei Fehler im Abschlussblock werden Suchkopie und Markerentfernung gemeinsam zurückgerollt. Die zuvor
  bestätigten Taxonblöcke samt Markern bleiben fortsetzbar. Nach Wiederholung entsteht kein doppelter Suchbestand.
- Die vollständige Integritäts-/Fremdschlüsselprüfung bleibt für den neuen Kandidaten verbindlich und benennt
  ausdrücklich die Hauptdatenbank. Der nur lesend angeschlossene, bereits gebundene Altstand wird dabei nicht
  versehentlich als weiterer Kandidat erneut geprüft.
- Unmittelbar vor der Übergabe des fertigen Kandidaten wird die Dateiprüfsumme des Altmasters erneut mit der
  gebundenen Ausgangsprüfsumme verglichen. Eine zwischenzeitlich veränderte Quelle verhindert die Übergabe;
  ein zuvor vorhandener Kandidat bleibt erhalten. Der Regressionstest verändert ausschließlich die Testquelle,
  prüft die abgelehnte Übergabe und danach den erfolgreichen Versuch mit wiederhergestellter gültiger Basis.

Das Manifest ergänzt `buildInputs.reuse.search`: `reusedTaxa`, `reusedTerms` und `rebuiltSources`.
Letzteres zählt neu ausgewertete Eingangszeilen der Suchbildung, nicht neue Arten und nicht fertige Suchbegriffe.
Bei unveränderten Eingängen kann dieser Zähler null sein, obwohl Suchbegriffe kopiert und vollständig geprüft werden.
Der Aufbau bleibt ein neuer, erst nach Prüfung freizugebender Kandidat. Er aktualisiert keine aktive Datenbank
an Ort und Stelle. Fachbelege, Vergleichsstände, Abhängigkeitspläne und Prüfungen verursachen weiterhin
Bestandsarbeit. Dies ist kein Nachweis einer nur von der Änderungszahl abhängigen Gesamtlaufzeit.
Messreihen, verworfener langsamer Zwischenansatz und Leistungsgrenzen: `taxonomy-operational-checks.md`.

## Geprüfte Übernahme des Abschlussplans (23. September)

Der Wiederverwendungsweg erzeugt vor dem Taxonschreiben einen vollständigen Abhängigkeitsplan aus dem
gebundenen Altmaster und den heutigen Eingängen. Zuvor wurde nach dem Schreiben derselbe Graph nochmals
aus altem und neuem Master aufgebaut, auch wenn seine Struktur identisch blieb.

`taxonomy-master-graph-reuse.mjs` erlaubt die Übernahme ausschließlich des **frisch im selben Lauf** erzeugten
Vorabplans. Ein früherer Releaseplan kann zusätzliche historische Kanten enthalten und wird dafür nicht verwendet.
Voraussetzungen sind feste interne Dateinamen, gleiche Vorher-/Nachher-Eingangsfingerabdrücke, Bindung an die
Prüfsumme des Altmasters und unveränderte Plan-Dateiprüfsumme. Die neue Datei gehört zum Aufbauregel-Prüfwert.

Ein nur lesender SQL-Vergleich prüft in beiden Richtungen sämtliche Eingänge der Graphbildung:

- Master-IDs, wissenschaftliche Namen, Ränge, Lebenszyklus und Referenzstatus;
- Quellenbesitzer, Anbieter-/Datensatz-IDs, Eltern-/Akzeptiert-Verweise, Hierarchien sowie relevante Quellzustände;
- wissenschaftliche Quellen-/Synonymnamen und aufgelöste Alias-Ränge;
- Markierungen durch Entscheidungen, Konflikte, Projektverknüpfungen und eigene beziehungsweise Projektfelder.

Die Mengenprüfung bildet die bisherigen eindeutigen Kanten/Markierungen ab. Künstliche Beleg-IDs werden über
ihre tatsächlichen Beziehungen aufgelöst; reine Provenienzzeiten sind keine Graphkanten. Rohwerte müssen
übereinstimmen, was strenger ist als Gleichheit nach Namensnormalisierung. Bei jeder Abweichung wird der
bisherige vollständige Plan erstellt. Graphbildung und Vergleichsprojektionen müssen bei Regeländerungen
gemeinsam gepflegt werden; die Regressionen verändern jede dieser Eingangsarten in beiden Richtungen.

Die Übernahme überschreibt keine bestehende Zieldatei und prüft die kopierte Datei erneut. Fehler vor
Kandidatenübergabe erhalten den alten Kandidaten. Das Ergebnis kennzeichnet den Weg mit
`buildInputs.comparison.dependencyPlan.graphReuse = verified-prewrite-plan`; der Leistungsprüflauf gibt
dies zusätzlich als `dependencyGraphReuse` aus. Die Entscheidung zur Wiederverwendung von Taxondaten wird
dadurch nicht erweitert: `reuseAuthorized` im Plan bleibt ausdrücklich `false`.

Prüfschritte geben zwischen den fünf Vergleichsabschnitten die Ereignisschleife frei. Ein einzelner SQLite-
Vergleich ist nicht unterbrechbar. Nach Pause wird die Planungsgrundlage neu erstellt und geprüft, während
bestätigte Taxonblöcke beziehungsweise der abgeschlossene Master erhalten bleiben. Der neue Wiederanlauftest
deckte eine Windows-Lesesperre beim bereits abgeschlossenen Kandidaten auf: Planleser werden nun unabhängig
vom gewählten Fortsetzungszweig vor dem Verzeichniswechsel geschlossen.

Unveränderte Fachbelege durchlaufen weiterhin alle vorhandenen Modellvalidierungen. Ein Versuch, ihre
Schreibanweisungen bei gleicher Validierung zu bündeln, brachte im direkten Vergleich keinen belastbaren
Vorteil und wurde vollständig entfernt. Messwerte und Restgrenzen: `taxonomy-operational-checks.md`.

## Kandidatenlokale Schreibvorbereitung (24. September)

Das CPU-Profil eines isolierten 2.000-Arten-Laufs zeigte wiederholte SQL-Vorbereitung als wesentlichen
Kostenanteil des Vollwegs, nicht eine teure Feldnormalisierung. `taxonomy-master-writer.mjs` hält deshalb
innerhalb einer Kandidatenverbindung höchstens 64 vorbereitete Befehle vor. Er wird sowohl für die normale
Neuberechnung als auch im bestehenden Kopierweg verwendet. Er speichert **keine** Bindewerte, Ergebnisse
oder Validierungsentscheidungen. Die vorhandenen Funktionen aus `taxonomy-master-model.mjs` und sämtliche
SQLite-Constraints werden weiterhin bei jedem Schreiben ausgeführt; das Modellmodul ist unverändert.

Transaktionen, 500er-Checkpoints, Rollback und Verbindungsschließung bleiben beim bisherigen Besitzer.
Der Helfer öffnet keine zusätzliche Datenbank und nimmt keine automatische Fortsetzung vor. Ein neuer
Worker erhält einen neuen Befehlsspeicher. Die Begrenzung gilt auch für künftig dynamisch erzeugte SQL-Texte;
beim Überschreiten wird der lokale Speicher geleert. Fehler beim Vorbereiten werden nicht gespeichert.

Der Kopierweg liest nur noch die tatsächlich verbrauchten Altspalten. Quellenreihenfolge und Belegzuordnung,
Feldwerte, eigene Schutzentscheidungen und die Erneuerung von Herkunftsangaben sind unverändert.
Der streamende Eingangsvergleich vermeidet bei exakt gleichen Anbieter-/Datensatzschlüsseln die erneute
UTF-8-Konvertierung. Unterschiedliche Schlüssel werden weiterhin als UTF-8-Bytes verglichen; eine
JavaScript-Zeichenfolgensortierung wäre für bestimmte Unicode-Zeichen fachlich falsch und wird nicht verwendet.

Fünf direkte Schreibhelfertests vergleichen unter anderem gekapselte und direkte Modellaufrufe,
zwölf ungültige Feldvarianten, aktuelle Parameter, wiederholte Namen, Transaktionsrücknahme, Constraintfehler,
Speichergrenze, getrennte Verbindungen und Verhalten nach Schließen. Ein weiterer Eingangstest prüft
Anbieter- und ID-Wechsel einschließlich Unicode-Reihenfolge, Hinzufügen, Entfernen und Änderungen.
Beide Testdateien gehören zu `test:taxonomy-master`. Die neue Regelgrundlage ist in den Aufbau-Fingerabdruck
aufgenommen; ältere Regelstände werden nicht ungeprüft wiederverwendet. Leistungsbelege und Einschränkungen:
`taxonomy-operational-checks.md`.

## Begrenzte Lesegruppen für vorhandene Belege (25. September)

`taxonomy-master-reuse-reader.mjs` bündelt die zuvor je Art beziehungsweise Quelle ausgeführten Altmaster-
Leseabfragen. Ein Verzeichnis der heutigen Quellenbesitzer legt die Gruppen fest. Pro Gruppe werden höchstens
128 Taxa mit ihren Quellen, Namen, Feldbelegen, Mitgliedschaften und Statuszeilen gelesen. Der Leser hält nur
eine fertige Gruppe vor; beim Wechsel entsteht die nächste zunächst privat. Ein Abfragefehler veröffentlicht
keine unvollständige Gruppe. Ein erneuter Aufruf liest diese vollständig neu. Die ID-/Positionsliste wächst
mit dem ausgewählten Bestand, nicht mit der Zahl aller Belegzeilen. Die Zeilenzahl innerhalb einer Gruppe
hängt weiterhin von Quellen- und Namensvielfalt ab; 128 Taxa sind keine feste Byte-Grenze.

Die Quelle bleibt nur lesend geöffnet. Gebundene Parameter und die bisherige Belegreihenfolge erhalten
Quellenzuordnung und Gleichstandsentscheidungen. Die übernommenen Werte laufen weiterhin einzeln durch
sämtliche Modellfunktionen und Datenbank-Constraints. Heutige Release-IDs, Prüfwerte und Herkunftszeiten
werden neu gesetzt. Dies ist kein Speicher für Validierungsentscheidungen und keine Erweiterung der
Kopierfreigabe. Eigene Felder, geänderte Quellenreihenfolge oder unsichere Identität bleiben im bisherigen
Neuberechnungs-/Fehlerweg. Vollständige Endprüfung und erneute Altmaster-Prüfsumme bleiben bestehen.

Bei Fortsetzung wird die Gruppe des benötigten Taxons direkt geladen; frühere Gruppen müssen nicht gelesen
werden. Schließen verwirft Gruppe und ID-Verzeichnis, die Datenbankverbindung bleibt beim bisherigen Besitzer.
Der neue Baustein gehört zum Aufbauregel-Prüfwert. Alte Regelgrundlagen fallen weiterhin auf Vollaufbau zurück.
Vier direkte Tests prüfen Mehranbieter-/Belegreihenfolge, Gruppenwechsel und spätere Wiederaufnahme,
fehlgeschlagene Teilabfragen mit Wiederholung sowie ungültige Grenzen. Bestehende vollständige
Mastervergleiche und echte Worker-Abbruch-/Fortsetzungstests prüfen zusätzlich den integrierten Ablauf.
Leistungsbewertung und Speichergrenzen stehen in `taxonomy-operational-checks.md`.

## Tests

### Reproduzierbare Leistungs- und Grenzprüfung

Zusätzlich zum nachfolgenden Kandidatenvergleich misst seit 24. September
`node --no-warnings scripts/taxonomy-pipeline-benchmark.mjs 10000 sparse 2` den lokalen technischen Ablauf
von dauerhafter Auftragserstellung über beide echten Hilfsprozesse bis zum gemeinsamen Zeigerwechsel.
Er erzwingt im Vergleichsweg Master- **und** Paket-Vollaufbau, erhält eine eigene Namenswahl und lässt
vorherige SQLite-Leser geöffnet. Alle Fach-/Suchtabellen müssen gleich bleiben; reine Auftrags-/Paketkennungen
und physische Quellenprüfsummen werden getrennt gebunden geprüft. Downloads, produktive Auswahlvorbereitung
und Testorakel sind nicht Teil der Zeitmessung. Grenzen, Messzahlen und nächster Schwerpunkt:
`taxonomy-operational-checks.md`. Die kleinen Prozess-, Reihenfolge- und Rückfalltests gehören zu
`test:taxonomy-master`; große Zeitmessungen bleiben ohne zeitabhängige CI-Schwelle separat.

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
oder Betriebssystem-Neustarttest. Die damals noch offenen dauerhaften Worker-Checkpoints sind inzwischen
implementiert; die Betriebsgrenzen stehen in `taxonomy-master-background-build.md`.

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
