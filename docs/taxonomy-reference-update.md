# Taxonomiereferenz aktualisieren und bestehende Arten abgleichen

Stand: 2026-10-02

Status: Phase 9 abgeschlossen; der reale große Wiederanlauf des am 2026-09-04 erkannten Drifts bis zum automatisch
aktivierten Lightroom-Paket wurde am 2026-09-05 erfolgreich geprüft. Weißstorch und Paket-/Masterstand sind in
Lightroom bestätigt, die Veröffentlichung ist freigegeben. Weitere Praxistests bleiben laut `roadmap.md` offen.

**Heutiger Betriebsstand:** Die Quellenreparatur vom 1. Oktober ist gemeinsam für Master und Lightroom aktiviert,
vollständig geprüft und mit Weissstorch/Rebhuhn gezielt praktisch abgenommen. Lokale CoL-Referenz `COL26.8 XR`,
Master und Suchpaket passen zusammen. Die inzwischen gemeldete Verfügbarkeit von `COL26.9 XR` ist ein separates
Quellenupdate, keine erneute Reparaturpflicht. Stand und Abgrenzung: [Taxonomie-Betriebsstand](taxonomy-current-status.md).

## Ziel

Der Arten-Explorer kann die neueste Catalogue-of-Life-XR-Referenz erkennen, vollständig lokal importieren,
technisch prüfen und atomar aktivieren. Die große Referenzdatenbank bleibt außerhalb von Git, GitHub Pages,
Squarespace und den produktiven Artdateien.

Eine Aktualisierung darf insbesondere keine vorhandene Art still umbenennen. Deshalb werden Referenzimport und
Projektabgleich strikt getrennt:

1. Eine neue Referenz wird in einem eigenen Arbeitsbereich heruntergeladen und importiert.
2. Schema, Relationen, Hierarchie, Suchindizes und Datenbankintegrität werden geprüft.
3. Alle vorhandenen Einträge aus `species_list.json` werden gegen den neuen Release verglichen.
4. Erst nach einem technisch erfolgreichen Vergleich wird der aktive Referenzzeiger atomar umgeschaltet.
5. `species_list.json`, `speciesData.json`, Namen, Slugs, Assetnamen, Assetordner und Overrides bleiben unverändert.

## Inhalt der lokalen Referenzdatenbank

Die SQLite-Referenz enthält aus dem jeweils aktivierten Catalogue-of-Life-XR-Release:

- akzeptierte Taxa aller enthaltenen Reiche mit stabiler Quellen-ID, Rang und Elternbeziehung,
- die vollständige verfügbare Hierarchie einschließlich vorhandener Zwischenränge wie Unterstamm oder Unterart,
- akzeptierte wissenschaftliche Namen, Autorenschaft, Synonyme und weitere Namensbeziehungen,
- gebräuchliche Namen einschließlich getrennt erkannter deutscher und englischer Namen, soweit sie im
  Quellrelease geliefert werden,
- Angaben zu ausgestorbenen Taxa, Umwelt und taxonomischem Code, soweit vorhanden,
- externe Identifikatoren aus dem Referenzpaket,
- Release, Quelldatensatz, Lizenz und Vertrauensstufe als Provenienz sowie
- normalisierte Präfix- und FTS5-Suchbegriffe für deutsche und wissenschaftliche Vorschläge.

Die Tabelle für einen späteren WoRMS-Abgleich ist vorbereitet, wird durch den reinen CoL-Vollimport aber noch nicht
automatisch befüllt. Projektfachdaten wie Größe, Gewicht, Lebenserwartung, IUCN-Kategorie, Population und Trend
sowie Karten, Sounds und Artportraits gehören bewusst nicht in diese Referenz. Sie verbleiben in den bestehenden
Projektdateien und Assetordnern.

## Prüfung beim Start

Beim Start des Arten-Explorers wird ausschließlich die kleine Release-Metadatenantwort von Catalogue of Life
abgerufen. Die Prüfung:

- läuft nicht blockierend im Hintergrund,
- verwendet einen lokalen Zwölf-Stunden-Cache,
- lädt kein vollständiges Exportarchiv herunter,
- beeinträchtigt den Explorer bei Netzwerkfehlern nicht und
- bietet bei fehlender oder veralteter Referenz einmalig direkt `Jetzt aktualisieren` oder `Später` an.

`Später` unterdrückt die Nachfrage für den aktuellen App-Start. Der manuelle zusammenhängende Auslöser unter
`Datenbank-Aktionen > Taxonomiedatenbank > Datenbank aktualisieren` bleibt verfügbar. Der vollständige Download
beginnt erst nach einer aktuellen Vorschau und ausdrücklicher Bestätigung.

Wichtige Grenze im heutigen Code: Die Startnachfrage `Jetzt aktualisieren` ruft zunächst nur die
Referenz-/Ergänzungswartung auf. Die zusammenhängende Datenbank-Aktion führt anschließend den Masterbau und
die gemeinsame Lightroom-Paketfreigabe aus. Der Referenzimport allein bestätigt deshalb noch keinen neuen
Master-/Paketstand. Beide Einstiegspfade sowie die 2.173 separaten CoL-/Reichsfälle werden vor der Freigabe des
nächsten regulären Quellenupdates geprüft; in der aktuellen Reparaturabnahme wurde kein neues Update gestartet.

## Regulärer Updatevertrag: Vorprüfung am 2. Oktober

Felix hat diesen Punkt mit „los“ beauftragt. Die erste Prüfung verändert keine produktiven Quellen, Master,
Suchpakete, Identitätsentscheidungen oder Fotos und startet keine Anbieterdownloads. Beide UI-Einstiege wurden
im aktuellen Code verfolgt: Der Startdialog ruft `beginUpdate()` der Referenzwartung auf; nur die Datenbank-Aktion
wartet anschließend auf Masterbau und geprüfte Paaraktivierung. Die Vereinheitlichung ist noch nicht umgesetzt.

Die historische Quellenklassifizierung der 2.173 Fälle steht im
[Reparaturvertrag](taxonomy-partial-source-recovery.md): 1.693 CoL-Verweise passen eindeutig zur bisherigen
iNaturalist-ID, sechs verweisen auf eine andere ID, zwei sind mehrdeutig und 472 fehlen. Diese Zahlen stammen
aus der Prüfung vom 30. September; heute kein erneuter produktiver Gesamtvergleich oder neuer Anbieterstand.
Eine passende Anbieter-ID ist ein Quellenbeleg, keine bestätigte Reichsänderung oder Identitätsmigration.

Eine neue isolierte Gegenprobe vom 2. Oktober verwendet vier selbst erzeugte kleine Datenbankpaare, denselben
synthetischen Namen und unterschiedliche Reichsangaben. Passender, abweichender, mehrdeutiger und fehlender
Anbieter-ID-Verweis führten vor dieser Korrektur jeweils zu zwei getrennten Master-IDs; die ursprüngliche ID blieb erhalten.
Alle vier Kandidaten waren technisch aktivierbar, mit null blockierenden Konflikten und nur einem
`reference-gap`-Hinweis. Das ist der reproduzierte Ausgangsfehler, nicht der neue Freigabestand.
Probe und Ergebnis liegen unter dem ignorierten `Testlauf/taxonomy-regular-update-probe-2026-10-02.mjs`
beziehungsweise `Testlauf/taxonomy-regular-update-probe-2026-10-02-result.json`; kein produktiver Kandidat.

Die bestehende Identitätsfortführung verbietet außerdem das Gleichsetzen verschiedener bekannter Reiche.
Der technische `source-repair`-Sonderweg gilt nur für die zuvor bestätigten vier Ersatz-ID-Fälle und ist kein
Ausweg für diese neue fachliche Entscheidung. Keine pauschalen Reichs-Aliasse oder gelockerte Schutzprüfung.

**Von Felix mit „Weiter“ beauftragte Richtung:** passende Quellenverweise als mögliche Klassifikationswechsel
gebündelt zur ausdrücklichen Prüfung anbieten, bei bestätigter Übernahme die bisherige Master-ID erhalten und
unklare Fälle getrennt zurückstellen. Auch eine gebündelte Prüfung darf Namensgleichheit nicht als Beweis
verwenden oder vorhandene Fotos migrieren. Diese Umsetzungsfreigabe ist keine Freigabe eines produktiven Updates.

Sechs gezielte bestehende Regressionstests bestanden: Homonyme, Fremdfelder-/Quellenkennungs-Erhalt, geleertes
Reich, Startangebot, Aufschieben sowie Aktivierungssperre bei gestopptem Aufbau. Die Tests sichern bestehende
Grenzen; sie belegen keinen neuen Klassifikationsworkflow oder vereinheitlichten Update-Einstieg.

## Erste Umsetzungsstufe: gebündelte Prüfung und Aktivierungssperre

Am 2. Oktober implementiert, ausschließlich mit temporären Datenbanken geprüft:

- Bei einem regulären Kandidatenbau werden neu hinzukommende CoL-Artgruppen gegen bisher aktive, gleichnamige
  Arten gleichen Rangs mit Referenzlücke und anderem bekannten Reich geprüft. Bereits vorhandene exakte
  Zielidentitäten, historische Vorgänger und die bekannten Animalia-/Metazoa-Reichssynonyme sind keine solchen
  Neufälle. Diese enge Prüfung ist noch kein allgemeiner automatischer Klassifikationswechsel.
- Alle CoL-Identifikatoren bleiben bei Normalisierung und Zusammenführung von Teilzeilen erhalten. Mehrere,
  widersprüchliche oder ungültige `inat`-Verweise werden nicht durch einen letzten Einzelwert verdeckt.
- Fälle werden anhand tatsächlicher alter iNaturalist-Belege als passend, abweichend, mehrdeutig oder fehlend
  eingeordnet. Mehrere mögliche Vorgänger/CoL-Belege bleiben mehrdeutig. Auch eine passende ID verlangt
  ausdrückliche Identitätsprüfung; sie verändert weder das Reich noch die ID.
- Jeder Fall ist als offener `ambiguous-match` mit reservierter `classification_`-Kennung gespeichert. Die
  Fallprüfsumme bindet Ausgangsmaster, CoL-Version, Vorgänger-IDs/-Belege, Zielreich und sämtliche Quellenverweise.
  Einzelaktivierung und gemeinsame Master-/Lightroom-Vorbereitung bleiben gesperrt. Eine normale Feldentscheidung
  wie `keep-current` darf die Prüfung nicht auflösen. Die Übersichtszähler werden gegen die offenen Fälle geprüft.
- Der Explorer zeigt Gesamtmengen und höchstens acht Reichs-/Quellengruppen mit jeweils zwei Beispielen,
  auch bei mehr als 100 offenen Fällen. Normale Feldkonflikte bleiben getrennt sichtbar. Kein zusätzlicher
  produktiver Vollscan beim Öffnen: Gruppierung entsteht im ohnehin beauftragten Kandidatenbau, der Status
  liest Manifest und Konfliktzähler. Der streng abgegrenzte `sourceRecoveryScope` bleibt unverändert.

**Grenze der ersten Stufe (durch die zweite Stufe unten teilweise erweitert):** revisionsgebundene,
ausdrücklich bestätigte Bündelübernahme in das Identitätsregister,
erneuter Kandidatenbau unter Erhalt der ursprünglichen IDs sowie die Behandlung zurückgestellter unklarer Fälle
an der abschließenden Freigabegrenze. Die Oberfläche sagte in dieser ersten Stufe ausdrücklich, dass die Übernahme
noch nicht verfügbar war, und bot keine wirkungslose Bestätigung an. Auch die Vereinheitlichung der beiden
Update-Einstiege blieb als anschließender Schritt offen. Keinen regulären produktiven Quellenlauf zur Bedienabnahme starten.

Die historischen Mengen 1.693/480 und 2.173 wurden nicht erneut über den produktiven Bestand berechnet;
zukünftige Kandidaten zählen die Fälle aus ihrem tatsächlich gebundenen Eingang. Alte Kandidaten ohne diese
Prüfstufe erhalten rückwirkend keine neue fachliche Freigabe. Aufbewahrte Reparatur-/Fehlerkandidaten unverändert
lassen; für das nächste Update ist ein frisch gebundener regulärer Kandidat erforderlich.

Prüfabschluss dieser ersten Stufe: 178 gezielte Tests in zehn Dateien erfolgreich, darunter echte
Master-/Paar-Hilfsprozesse, Wiederaufnahme, enge Quellenreparatur, bestehende Identitätsregeln, Kandidatenbau,
Vergleichsgrundlagen und Suchpaket. Die neun UI-Tests nach der abschließenden Kategorienbeschriftung erneut
erfolgreich. Geprüft sind auch alle vier gesperrten Quellenfälle, Wiederholung ohne doppelte Konflikte,
mehr als 100 Fälle, veränderte Übersichtszähler und unzulässig ausgeräumte Konfliktzeilen. Syntax/Stil,
Dokumentationsverweise, aktueller Projektstatus und `git diff --check` bestanden. Der erste eingeschränkte
Hilfsprozesslauf konnte nicht vollständig abschließen; der erlaubte Gegenlauf außerhalb der Prozessbeschränkung
bestand, ohne Windows-/Testregeln zu ändern. Kein vollständiges `quality:ci`, produktiver Kandidatenbau,
Bediennachweis oder Phase-10.5-Audit in diesem Schritt. Explorer-JS ist nicht im Squarespace-Footer eingebunden;
Footer/CSS und Lua-Version `0.4.24.14` bleiben unverändert.

## Zweite Umsetzungsstufe: bestätigte Bündelvormerkung mit ID-Erhalt

Am 2. Oktober nach Felix' erneutem „Weiter“ implementiert; keine produktiven Daten verändert:

- `Passende Klassifikationen prüfen …` liest ausschließlich gespeicherte Kandidatenfälle und die betroffenen,
  indiziert abgefragten Arten. Vorschau und bestätigte Übernahme verwenden geschützte POST-Routen und die
  bestehende Master-/Korrektursperre. Kein Download, Kandidatenbau, Paketwechsel oder Fotoabgleich durch den Button.
- Nur `matching-provider-id` mit genau einem aktiven Referenzlücken-Vorgänger, einem CoL-Ziel, gleichem
  wissenschaftlichem Namen/Rang und eindeutig gleicher iNaturalist-ID ist bündelweise vormerkbar. Sämtliche
  ID-Verweise und Fallprüfsummen werden erneut geprüft. Besetzte Ziele, doppelte Vorgänger/Ziele und veränderte
  Eingangs- oder Registerstände werden abgewiesen; Zähler oder Kategorie allein sind keine Freigabe.
- Die Rückfrage nennt Fallzahl, Reichsgruppen, verbleibende unklare Fälle und die unveränderten Master-IDs,
  eigenen Namen und Projektlinks. Abbrechen schreibt nichts. Bestätigung speichert nur ein neues, append-only
  Registerereignis `classification` je passendem Fall in der bestehenden Vormerkungsdatei. Historie, komplette
  Quellenbelege, Batchrevision, Zeit und Eingangsrevisionen sind gebunden. Große Bündel werden linear gehasht.
- Die gewöhnliche Identitätsvorschau darf dieses Ereignis nicht erzeugen. Ihre Reichssperre für Fortführung,
  Split und Merge bleibt unverändert; der technische `source-repair`-Sonderweg bleibt getrennt. Klassifikation
  erhält dieselbe aktive ID und erzeugt weder historische Nachfolgerumleitungen noch künstliche Namenssynonyme.
- Erst ein ausdrücklich gestarteter, frischer Kandidat darf die Vormerkung verarbeiten. Er prüft die alte
  Referenzlücke und die tatsächlichen CoL-/Anbietereingänge erneut. Die bestätigte Zielklassifikation gilt für
  dieselbe Master-ID; Projekttexte/Slugs/Assets werden nicht umgeschrieben. Eigene Namen und Projektlinks folgen
  dieser ID. Alte Anbieterzeilen behalten ihre ursprüngliche Reichsbehauptung und Herkunft.
- Folgende reguläre Aufbauten erhalten diese Klassifikation nur bei weiterhin eindeutig passendem CoL-Verweis
  und eindeutig vorhandener iNaturalist-ID. Fehlende/widersprüchliche Belege oder eine weitere abweichende
  Identitätskette stoppen zur erneuten Prüfung, statt eine automatische Migration abzuleiten. Diese enge
  Wiederverwendung ersetzt noch keinen allgemeinen Workflow für sämtliche späteren Identitätsänderungen.
- Zu diesem Zwischenstand bleiben unklare Fälle auch nach der Bündelbestätigung offen und blockieren die Einzel-/Paarfreigabe. Eine
  vorhandene eigene geschützte Hierarchieentscheidung wird nicht pauschal überschrieben. Offen bleibt der
  nächste Schritt: ausdrückliche Zurückstellung unklarer Fälle an der Freigabegrenze sowie einheitlicher
  Update-Einstieg. Deshalb weiterhin keinen produktiven `COL26.9 XR`-Lauf zur Bedienabnahme starten.

Prüfnachweis: 215 gezielte Tests in 14 Dateien erfolgreich, einschließlich echter Master-Hilfsprozesse,
aller bisherigen engen Reparaturwege, Master-/Identitäts-/Router- und UI-Gegenproben. Neue Gegenproben prüfen
ein synthetisches 1.693-Fälle-Bündel, Abbruch ohne Schreibzugriff, veraltete/manipulierte Belege, doppelte
Bestätigung, Schreibfehler und erneuten Versuch, Wiederöffnen/Verwerfen der Vormerkung, ID-/Namens-/Projekt-
und Rohquellenerhalt, erneuten Aufbau, Lightroom-Auflösung als aktuelle gleiche ID sowie Rollback. Abschließende
36 Bündel-/UI-Tests in drei Dateien ebenfalls erfolgreich: geprüfte Eingangsgrundlage/Folgeabgleich, vollständige
Übernahme von 104 passenden Fällen plus einem gesperrten unklaren Fall sowie geschützte Hierarchie und historischer
ID-Erhalt nach einem weiteren Split. Die
Produktivmengen 1.693/480 wurden nicht erneut berechnet; sie bleiben historische Werte vom 30. September.
Keine pauschale Geschwindigkeitszusage oder produktive Bedienabnahme. Der neue Test ist im Master-Testskript
enthalten; kein vollständiges `quality:ci` in dieser Stufe. Explorer-JS ist nicht im Squarespace-Footer eingebunden;
Lua-Version weiterhin `0.4.24.14`.

Der [Pages-Lauf für die erste Stufe `ea55bb4`](https://github.com/felixkfm90/iucn-species-data/actions/runs/37009726984)
und der [Lauf für die zweite Stufe `cca8268`](https://github.com/felixkfm90/iucn-species-data/actions/runs/37015180330)
sind vollständig erfolgreich. Das ist kein vorweggenommener Deploymentnachweis der folgenden dritten Stufe.

## Dritte Umsetzungsstufe: unklare Fälle ausdrücklich zurückstellen

Am 2. Oktober nach Felix' erneutem „weiter“ implementiert; keine produktiven Daten verändert:

- `Unklare Fälle zurückstellen …` verwendet eine eigene gebundene Vorschau und ausdrückliche Rückfrage.
  Abweichende, mehrdeutige oder fehlende Quellenverweise sind keine Gleichsetzung von Arten. Die Vorschau
  prüft alle betroffenen bisherigen IDs, Quellenbelege, neue CoL-Gegenstücke, Eingangs-/Korrekturrevisionen und
  bereits gespeicherte Vormerkungen. Geschützte POST-Routen `classification/deferral-preview` und
  `classification/deferral-save` nutzen die bestehende Master-/Korrektursperre; kein automatischer Aufbau.
- Bestätigung speichert ausschließlich append-only Ereignisse `classification-deferred` in der vorhandenen
  Vormerkungsdatei. Quellen und Ziele enthalten dieselben bisherigen IDs/Tupel; keine neue ID, historische
  Nachfolgerumleitung, künstliches Synonym oder Projektzuweisung. Passende Fälle können nicht über diesen
  Weg zurückgestellt werden. Die allgemeine Identitätsvorschau kann den Sondertyp nicht erzeugen.
- Passende Übernahme und unklare Zurückstellung können in beiden Reihenfolgen zum selben unveränderten
  Kandidaten vorgemerkt werden. Jede neue Vorschau bindet den inzwischen erweiterten Registerstand; alte Tokens
  werden abgewiesen. Kein teurer Zwischenaufbau allein zwischen den zwei Rückfragen erforderlich. Fremde
  Identitätsvormerkungen, ein anderer Kandidat oder geänderte Quellen-/Projektwerte sperren diese Abkürzung.
- Erst ein ausdrücklich gestarteter frischer Kandidat regeneriert die tatsächlichen Quellenfälle und verarbeitet
  die Entscheidung. Er lässt ausschließlich die gebundenen neuen CoL-Gruppen aus. Bestehende Identitäten,
  Projektwerte, eigene Korrekturen oder zusätzliche unabhängige Anbieterbelege am Ziel dürfen nicht ausgeblendet
  werden. Alle bisherigen Arten müssen weiterhin aktiv und aktuell belegt sein; mehrdeutige Fälle erhalten
  sämtliche bisherigen IDs getrennt. Andere Arten/Quellenkonflikte bleiben unverändert zu prüfen.
- Ausgelassene rohe CoL-Eingänge bleiben in der geprüften Vergleichsgrundlage, der Fallbeleg in der Historie.
  Der neue Master führt pro angewendetem Ereignis eine gebundene `classification_hold_`-Prüfzeile im Zustand
  `dismissed`, keine normale Feldentscheidung. Die kompakte Manifestübersicht bindet alle Fälle/Entscheidungen
  per Revision und zeigt höchstens acht Gruppen, ohne tausende Ereignisse bei jeder Statusabfrage zu übertragen.
  Die Kandidaten-/Aktivierungsprüfung prüft ID-Erhalt, fehlendes neues Ziel, Registerbeleg und vollständige
  Anwendung frischer Vormerkungen; manipulierte Zähler, entfernte oder wieder geöffnete Prüfzeilen sperren.
- Unverändert belegte Fälle dürfen bei einem folgenden Aufbau zurückgestellt bleiben. Ein neuer CoL-Release,
  andere ID-Verweise, veränderte bisherige Belege oder zusätzliche unabhängige Zielquellen entwerten diese
  fallbezogene Freigabe: der Fall bleibt wieder offen. Eine später eindeutig passende Verbindung kann nach
  neuer Vorschau ausdrücklich mit ursprünglicher ID übernommen werden. Die alte Zurückstellung bleibt als
  Nachweis erhalten, gilt aber nicht als Identitätsentscheidung oder pauschale Dauerfreigabe.
- Der normale Eingangsleser kann bekannte Lücken bei unverändertem CoL-Stand weiter überspringen. Eine dann
  nicht erneut gelesene Gegenstelle erzeugt keine neue angewendete Prüffallzahl; die gespeicherte Historie bleibt
  erhalten. Die Übersicht zählt tatsächlich im aktuellen Kandidaten geprüfte/anwendbare Fälle, nicht alle
  jemals gespeicherten Zurückstellungen. Neue CoL-Stände müssen wie bisher die Lücken erneut lesen.
- Abbrechen schreibt nichts. Offene Vormerkungen lassen sich über die bestehende bestätigte Rücknahme verwerfen;
  aktive Entscheidungen nur über den kontrollierten Rollback. Keine Quellen-/Historienbereinigung, Fotomigration,
  Projekt-/Assetumbenennung oder produktive Paaraktivierung. Alte Kandidaten ohne `deferralAvailable` bekommen
  keine rückwirkende Freigabe. Registergrenze 10.000 Ereignisse; höchstens 100 bisherige Arten je Quellenfall.

Offen bleibt die Vereinheitlichung der Update-Einstiege und die anschließende praktische Gesamtabnahme.
Weiterhin keinen produktiven `COL26.9 XR`-Lauf allein für diese Implementierungsprüfung starten. Der synthetische
480-Fälle-Test ist kein neuer Vergleich der historischen produktiven 480 unklaren Fälle. Lua-Version bleibt
`0.4.24.14`; Explorer-JS ist nicht im Squarespace-Footer eingebunden, Footer/CSS unverändert.

Prüfabschluss dieser dritten Stufe: 238 gezielte Tests in 14 Dateien mit Exit 0, ohne Fehler, Abbrüche oder
übersprungene Tests. Enthalten sind echte Master-Hilfsprozesse, enge Quellenreparatur, bisherige Identitätswege,
Lightroom-ID-Auflösung, synthetische 480 unklare Fälle, mehrere bisherige Arten und 105 vollständig angewendete
Zurückstellungen oberhalb der Listenbegrenzung. Beide Bündelreihenfolgen ohne Zwischenaufbau, Abbruch,
veraltete/quermodale Freigaben, Schreibfehler mit Wiederholung, Fortsetzung, Rollback, manipulierte/entfernte
Prüfzeilen und alte Kandidaten geprüft. Neue CoL-Version und unabhängige Zielquellen öffnen den Fall wieder;
später passende Übernahme erhält die alte ID. Syntax (356 Dateien), Stil, 70 Markdown-Dateien ohne fehlende
lokale Verweise, aktueller Projektstatus und Diffprüfung bestanden. Kein vollständiges `quality:ci`,
produktiver Vergleich/Aufbau, praktischer Bediennachweis oder Phase-10.5-Audit in diesem Schritt.

## Download, Import und Aktivierung

Der Explorer reserviert vor einer Erstinstallation mindestens 12 GB freien Speicher. Das komprimierte Archiv darf
höchstens 2,5 GB groß sein. Beim sicheren Entpacken gelten zusätzlich Grenzen für Pfadtiefe, Dateianzahl,
entpackte Gesamtgröße und Kompressionsverhältnis; Pfadausbrüche und symbolische Links werden abgewiesen.
Entpacken und nachgelagerte Paketprüfung verwenden dieselbe Dateigrenze von 50.000 Einträgen. Der erste echte
CoL-XR-Download enthielt 21.100 Einträge und überschritt damit das anfänglich in beiden Stufen zu knapp angesetzte
Limit von 20.000. Der Lauf wurde vor Import und Aktivierung sicher beendet, alle Arbeitsdateien wurden entfernt und
keine Teilreferenz übernommen. Das vereinheitlichte Limit lässt den realen Umfang mit Sicherheitsreserve zu,
während Größen-, Kompressions-, Verschachtelungs- und Dateitypgrenzen unverändert gelten.

Der Vollimport:

- liest das ColDP-Paket streamend und in begrenzten Transaktionen,
- behandelt `NameUsage.tsv` als Pflichtdatei und `VernacularName.tsv` als optionale Datei,
- normalisiert die offiziellen ColDP-Namensräume `col:` und `clb:` beim Lesen der TSV-Kopfzeilen, sodass sowohl
  die unpräfixierten Testfixtures als auch reale ColDP-1.2-Exporte mit Spalten wie `col:ID`,
  `col:scientificName` und `clb:merged` denselben internen Feldvertrag verwenden,
- überspringt einzelne gebräuchliche Namen nur dann, wenn ihre `taxonID` im selben Release weder als Taxon noch
  als wissenschaftlicher Name existiert; diese verwaisten optionalen Zusatzdaten werden gezählt und niemals einem
  anderen Taxon zugeordnet,
- berechnet die zulässige Obergrenze abhängig von der Größe der optionalen Namensdatei: 25 Zeilen
  Grundtoleranz, bei größeren Dateien ein Prozent aller Vernakularnamenszeilen und zusätzlich eine absolute
  Obergrenze von 100.000,
- toleriert damit den real beobachteten Befund von 12.294 nicht zuordenbaren Verweisen unter
  1.996.915 `VernacularName.tsv`-Zeilen, blockiert aber weiterhin eine systematisch inkonsistente Referenz,
- erzeugt eine lokale SQLite-Datenbank mit Präfix- und FTS5-Suchindex,
- validiert Schema, Fremdschlüssel, Elternbeziehungen, Zyklen, Suchindex und Manifest,
- installiert einen unveränderlichen Releaseordner und
- aktiviert diesen noch nicht, solange der Projektartenabgleich fehlt.

Die Oberfläche zeigt einen zusammengefassten Fortschritt für Download, Entpacken, Import, Indexierung,
Projektvergleich und Aktivierung. Taxonomieaktualisierung, normale Datenpipeline, Backup und schreibende
Assetoperationen dürfen nicht parallel laufen.

## Getrennte gebräuchliche Namen

Die nicht zuordenbaren Verweise aus `VernacularName.tsv` sind fehlerhafte optionale Quellzeilen und nicht mit
fehlenden deutschen Übersetzungen gleichzusetzen. Für alle gültig zugeordneten Taxa gilt unabhängig davon:

1. Bestätigte deutsche Vernakularnamen werden nur für das Feld `Deutscher Name` vorgeschlagen.
2. Bestätigte englische Vernakularnamen werden unabhängig davon für das Feld `Englischer Name` vorgeschlagen.
3. Fehlt eine der Sprachen, bleibt das zugehörige Pflichtfeld redaktionell manuell zu ergänzen; die andere Sprache
   überschreibt es nicht.
4. Fehlen beide Sprachen, bleibt der wissenschaftliche Name als Referenz für die manuelle Namenseingabe.
5. Liefert ein späterer Release erstmals einen deutschen oder englischen Namen, erscheint dieser nur bei künftigen
   Suchen als Vorschlag.
6. Bereits bestätigte Projektarten werden dabei nicht still umbenannt. Eine Änderung bleibt eine bewusste
   Übernahme beziehungsweise nutzt den geschützten Umbenennungsworkflow.

Für Tierarten ohne bestätigten deutschen Namen bleibt die manuelle Animalia.bio-Recherche zusätzlich verfügbar.

Automatisierte Ergänzungen stammen ausschließlich aus den offiziellen Schnittstellen von iNaturalist, GBIF, WoRMS
und Wikidata. Sie dürfen nur deutsche oder englische Namen ergänzen, wenn der gelieferte wissenschaftliche Name
eindeutig als Art in der aktiven CoL-Referenz existiert. Externe Taxa, Hierarchien oder Synonyme werden nicht in die
CoL-Datenbank importiert. Ein lokaler Cache bewahrt Quellen, Vertrauensgewichtung und Prüfzeitpunkt; schlägt die
Aktualisierung fehl, bleibt der letzte funktionierende Bestand aktiv. Eigene Korrekturen werden getrennt
versioniert und überleben sowohl einen neuen Ergänzungslauf als auch einen neuen CoL-Release. Der vollständige
Vertrag steht in `docs/taxonomy-reference-supplements.md`.

Die ab Phase 9.6 eingeführte Masterdatenbank ändert diesen sicheren CoL-Releaseablauf nicht. Sie liegt separat,
verweist mit versionierter Provenienz auf CoL und weitere Anbieter und wird erst nach Kandidatenbau,
Konfliktprüfung und atomarer Aktivierung für die Explorer-Suche verwendet. Details:
`docs/taxonomy-master-database-design.md`.

Referenzaktivierung, Masteraktivierung und Lightroom-Paketaktivierung bleiben getrennte sichere Schritte. Der
Masterstatus vergleicht deshalb die aktive Referenz-Release-ID mit der im aktiven Master gespeicherten
CoL-Provenienz. Wurde der Ablauf nach der Referenzaktivierung beendet, behandelt `Datenbank aktualisieren` diese
Abweichung beim nächsten Aufruf weiterhin als Arbeit. Es verwendet die bereits installierte aktive Referenz, baut
und prüft daraus einen neuen Masterkandidaten und lädt den gleichen CoL-Stand nicht erneut herunter. Erst nach der
atomaren Masteraktivierung wird das passende Lightroom-Suchpaket gebaut und atomar aktiviert. Ein leerer
Projektkonfliktbericht überspringt keinen dieser Ableitungsschritte.

Ein Referenzwechsel entwertet außerdem die bisherige Abkürzung für bekannte CoL-Referenzlücken. Der lokale
Masteraufbau prüft diese wissenschaftlichen Namen erneut gegen die neue aktive CoL-SQLite; bei unveränderter
Referenz bleiben bekannte Lücken weiterhin ohne unnötige Wiederholung überspringbar. Fortschrittsabfragen lesen
nur kompakte, bereits geprüfte Kandidateninformationen. Eine Statusabfrage darf keine erneute Vollvalidierung und
keine Übertragung sämtlicher nicht blockierender Konfliktzeilen auslösen.
Numerische interne SQLite-Taxon-IDs sind dabei niemals releaseübergreifend stabil. Nach einem Referenzwechsel wird
daher ausschließlich über den wissenschaftlichen Namen im neuen Release aufgelöst; auch im Schnellweg wird eine
gespeicherte ID nur bei identischem wissenschaftlichem Taxon akzeptiert.

Nach erfolgreicher Aktivierung bleibt der Abschluss im Bereich `Taxonomiereferenz` sichtbar. Zusätzlich erscheint
ein einmaliges Bestätigungsfenster mit aktivem Release, importierten Taxa, wissenschaftlichen und gebräuchlichen
Namen, der gegebenenfalls gezählten Anzahl sicher übersprungener verwaister Namen sowie dem Hinweis, dass keine
bestehenden Projektdaten automatisch verändert wurden. Nach einem Fehler
bleiben stattdessen die verständlich zusammengefasste Fehlerursache und die weiterhin aktive bisherige Referenz
eindeutig sichtbar; interne JavaScript-Stacktraces werden nicht in die Oberfläche übernommen.

## Konflikte bei vorhandenen Arten

Der Abgleich ordnet jede bestehende Art genau einer dieser Gruppen zu:

| Ergebnis | Darstellung | Automatische Änderung |
| --- | --- | --- |
| Wissenschaftlicher Name ist eindeutig akzeptiert | grün, eindeutig | keine |
| Bereits bestätigte Zuordnung über stabile CoL-Quellen-ID | grün, zugeordnet | keine |
| Bisheriger Name ist ein Synonym mit genau einem akzeptierten Ziel | gelber Umbenennungsvorschlag `Alt → Neu` | keine |
| Name verweist auf mehrere akzeptierte Taxa oder Synonymziele | rot, mehrdeutig mit Kandidaten | keine Auswahl |
| Name wird nicht eindeutig gefunden | rot, manuell prüfen | keine |

Fachliche Hinweise verhindern die Aktivierung der neuen Referenz nicht. Das ist sicher, weil die Referenz nur als
lokale Such- und Prüfhilfe dient und keine bestätigten Projektdaten überschreibt. Dagegen verhindern technische
Fehler beim Import, bei der Validierung oder beim Artenabgleich die Aktivierung vollständig; die bisherige
Referenz bleibt dann aktiv.

Einen eindeutigen Namensvorschlag übernimmt der Explorer nicht direkt. Soll er später fachlich bestätigt werden,
läuft die Änderung artweise über den bestehenden geschützten Umbenennungsworkflow mit Vorschau, Kollisionsprüfung,
Backup und bewusster Bestätigung. Mehrdeutige Treffer werden niemals vorausgewählt.

Kleine, ausdrücklich bestätigte Zuordnungen können in `species-reference-mappings.json` über die stabile
CoL-Quellen-ID festgehalten werden. Diese Datei ist versionierbar; die große reproduzierbare SQLite-Datenbank
dagegen nicht. Ändert Catalogue of Life später den akzeptierten Namen derselben Quellen-ID, bleibt die Zuordnung
erkennbar, ohne den Projektnamen automatisch anzupassen.

## Konfliktbericht

Jeder importierte Release erhält lokal eine Datei `project-conflicts.json`. Sie enthält:

- Release-ID und Prüfzeit,
- Anzahl eindeutiger, vorgeschlagener, mehrdeutiger und fehlender Zuordnungen,
- betroffene deutsche und wissenschaftliche Projektnamen,
- mögliche Zielnamen und Quellen-IDs sowie
- die verbindliche Aussage, dass keine Projektart automatisch verändert wurde.

Der Bericht wird nach einem Neustart erneut angezeigt, solange der betreffende Release aktiv ist. Er gehört zur
lokalen Referenzinstallation und nicht zum Git- oder Pages-Bestand.

## Rollback und Fehlerverhalten

Der aktive Zeiger wird erst nach erfolgreichem Import und Projektvergleich atomar ausgetauscht. Die zuvor aktive
Version bleibt als genau eine Rollbackversion erhalten. `Vorherige Version wiederherstellen` schaltet nur die
lokale Referenz zurück; Arten, Namen, Slugs und Assets bleiben unverändert.

Bei Download-, Speicher-, Entpack-, Import-, Prüf- oder Aktivierungsfehlern:

- bleibt die bisherige Referenz aktiv,
- erscheint eine verständliche Fehlermeldung,
- werden temporäre Arbeitsdateien bestmöglich entfernt und
- startet weder eine IUCN-/Assetpipeline noch ein Git-Commit.

## Lokaler Speicher

Der Referenzbestand liegt pfadunabhängig unter:

```text
%LOCALAPPDATA%\FN Wildlife Travel\Arten-Explorer\taxonomy
```

Er enthält Releaseordner, aktiven Zeiger, eine Rollbackversion, Versionsprüfungs-Cache und temporäre
Arbeitsverzeichnisse sowie den reproduzierbaren Ergänzungsnamencache. Der Bestand gehört nicht in normale
Projekt-ZIP-Backups. Die spätere
Verteilung auf mehrere Rechner wird in Phase 11 entschieden.

## Lokale API

Bestehende Leseendpunkte:

```text
GET  /api/taxonomy/status
GET  /api/taxonomy/kingdoms
GET  /api/taxonomy/search
GET  /api/taxonomy/taxa/:id
```

Verwaltungsendpunkte aus Phase 9.5:

```text
POST /api/taxonomy/update/preview
POST /api/taxonomy/update/start
POST /api/taxonomy/update/rollback
POST /api/taxonomy/corrections/save
POST /api/taxonomy/corrections/reset
```

Alle Endpunkte verwenden die vorhandene localhost-, Origin- und Sitzungsgrenze des Arten-Explorers.

## Prüfungen

Der reale Wiederanlauf am 5. September schloss die falsche CoL-Lücke für `Ciconia ciconia`, deckte jedoch
fehlerhaft als manuell gespeicherte Anbieter-Altfelder auf. Dieser Kandidat wurde nicht aktiviert. Die abgesicherte
Herkunftsreparatur und ihre Beweisgrenzen sind in `taxonomy-master-database-design.md` beschrieben. Der anschließende Lauf
brach beim Übernehmen einer bereits belegten Quellenkennung ab; Ursache war die fälschliche Übernahme von
Altfeldern zwischen gleichnamigen Taxa unterschiedlicher Reiche. Die Vorgängerzuordnung berücksichtigt jetzt
Reich und beidseitige Eindeutigkeit; ein gezielter Test reproduziert und verhindert diesen Abbruch.
Der folgende reale Lauf vom 5. September aktivierte Master `master-20260905054823067` und anschließend automatisch
Lightroom-Paket `lightroom-946c961bd063fd1b8f12`. Die aktive CoL-Referenz `col-xr-2026-08-26-316165` entspricht
deren Quellenständen; Paket-`masterVersion` und aktive Master-ID stimmen überein. Eigene Namen, manuelle Herkunft,
Weißstorch-Identität und getrennte Homonyme wurden read-only geprüft. Dieser Reparaturlauf nutzte bereits
vorhandene Downloads. Der Benutzer bestätigte anschließend Weißstorch und den passenden Paket-/Masterstand in
Lightroom. Dies ersetzt nicht die übrige praktische Abnahme; Details stehen in `roadmap.md`.

Fokussierter Test:

```powershell
npm.cmd run --silent test:taxonomy-maintenance
npm.cmd run --silent test:taxonomy-reference
```

Der Testbestand deckt Releaseerkennung, Cache, URL-Grenzen, sicheren Vollimport, optionale Vernakularnamen,
offizielle `col:`-/`clb:`-Spaltennamen, einzeln tolerierte und systematisch blockierte verwaiste
Vernakularnamen, Aktivierungssperre vor dem Artenvergleich, eindeutige Synonyme, Mehrdeutigkeiten, fehlende Arten,
stabile Quellen-ID-Zuordnungen, unveränderte Projektdateien, Fortschritt und Rollback ab.
Die Referenztests decken zusätzlich die vier Ergänzungsanbieter, Sprachcodes, exakte CoL-Artzuordnung,
Trefferpriorität, Provenienz, Offline-/Teilausfall, letzter funktionierender Cache, eigene Korrekturen und
serverseitige Eingabegrenzen ab.

Ein mehrere Gigabyte großer Produktionsdownload ist bewusst kein automatischer Testbestand. Die Mechanik wird mit
der versionierten Fixture reproduzierbar geprüft; die erste echte Vollinstallation wird im Explorer ausdrücklich
gestartet und anschließend anhand von Release, Artabgleich und Suchstichproben kontrolliert.
