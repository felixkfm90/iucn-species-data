# Taxonomiereferenz aktualisieren und bestehende Arten abgleichen

Stand: 2026-10-03

Status: Phase 9 abgeschlossen; der reale große Wiederanlauf des am 2026-09-04 erkannten Drifts bis zum automatisch
aktivierten Lightroom-Paket wurde am 2026-09-05 erfolgreich geprüft. Weißstorch und Paket-/Masterstand sind in
Lightroom bestätigt, die Veröffentlichung ist freigegeben. Weitere Praxistests bleiben laut `roadmap.md` offen.

**Heutiger Betriebsstand:** Nach der am 1. Oktober gezielt praktisch abgenommenen Quellenreparatur ist auch
das separate reguläre Update auf `COL26.9 XR` technisch abgeschlossen. Felix bestätigte den lokalen Folgeweg
am 3. Oktober um 07:52:59 MESZ; erfolgreicher Gesamtabschluss um 09:11:14 MESZ. Referenz und Masterherkunft
sind `col-xr-2026-09-25-316441`, Master `master-20261003055911210` und Paket
`lightroom-fa739bd28ec1e82a0283` gemeinsam aktiv. 1.995 unbenutzte Klassifikationen mit ID-Erhalt verarbeitet,
187 unklare Gegenstücke konservativ zurückgestellt, keine blockierenden Konflikte. Einmaliger unabhängiger
lesender Vergleich bestätigt ID-/Namens-/Projektlink-Erhalt. Die Wiedervorlage ist gelöscht; Lightroom darf
wieder geöffnet werden. Felix hat anschließend beide Testarten in Explorer/Lightroom vorhanden und bevorzugt
markiert bestätigt; die gezielte Suche-/Namensprüfung ist bestanden. Gesamte Bedienabnahme und Audit bleiben getrennt.
Nachweis und Grenzen: [produktiver Abschluss am 3. Oktober](audits/2026-10-03-taxonomy-reference-update.md).
Stand und Abgrenzung: [Taxonomie-Betriebsstand](taxonomy-current-status.md).

**Heutige lokale Folgeumsetzung:** der Quellen-/Master-/Paketweg wird nach einem Start gespeichert und im
Explorer-Dienst verkettet, nicht mehr nur im offenen Dialog. Neue requestgebundene SDK-Erfassung und normales
Lightroom-Schließen gehen der Freigabe voraus; keine alte Quittung neu stempeln. Capture-to-close bleibt eine
einmalige ausdrücklich bestätigte Nutzervereinbarung. Normale Anbieteränderungen geschützter Namen/Hierarchie
benötigen ebenfalls Entscheidungen. Nach vollständiger bestätigter Entscheidung derselbe Auftrag fortgesetzt.
Noch keine praktische Gesamtabnahme oder neue Produktivaktion; [aktueller Automatisierungsvertrag](taxonomy-update-automation.md).
Die darunter datierten UI-/Erstaufnahmegrenzen beschreiben ihren jeweiligen früheren Implementierungsstand.

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

Seit der vierten Umsetzungsstufe am 2. Oktober verwenden Startnachfrage und manuelle Datenbank-Aktion denselben
bestätigten Quellen-/Master-/Paketweg. Der Referenzimport allein bestätigt keinen neuen Master-/Paketstand und
zeigt kein zusätzliches Gesamtabschlussfenster. Vorhandene lokale Arbeit hat Vorrang vor neuen Anbieterständen;
offene Entscheidungen stoppen die Übernahme. Praktische Gesamtabnahme und Freigabe des nächsten regulären
Quellenupdates bleiben getrennt; für die Implementierung wurde kein produktiver Quellenlauf gestartet.

## Regulärer Updatevertrag: Vorprüfung am 2. Oktober

Felix hat diesen Punkt mit „los“ beauftragt. Die erste Prüfung verändert keine produktiven Quellen, Master,
Suchpakete, Identitätsentscheidungen oder Fotos und startet keine Anbieterdownloads. Beide UI-Einstiege wurden
im damaligen Code vor der vierten Stufe verfolgt: Der Startdialog ruft `beginUpdate()` der Referenzwartung auf;
nur die Datenbank-Aktion wartet anschließend auf Masterbau und geprüfte Paaraktivierung. Diese unterschiedliche
Wirkung war der reproduzierte Ausgangsstand; die vierte Stufe vereinheitlicht inzwischen beide Einstiege.

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

Zum Abschluss der dritten Stufe waren Vereinheitlichung der Update-Einstiege und praktische Gesamtabnahme offen.
Die Vereinheitlichung ist inzwischen in der unten beschriebenen vierten Stufe implementiert.
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

Anschließender CI-Befund: [Pages-Lauf `37019314273` für `2aad61e`](https://github.com/felixkfm90/iucn-species-data/actions/runs/37019314273)
scheitert an sechs Pakettests. Der Zugriff auf `manifest.sources` war auch ohne neue Zurückstellung
unbedingt und ließ ältere/minimale Manifeste nicht mehr zu; unter Windows reproduziert. Korrigiert ist nur
dieser optionale Zugriff. Ohne Zurückstellung bleibt der alte Kandidat regulär prüfbar; vorhandene neue
Zurückstellungen verlangen unverändert CoL-Version und Ausgangsmaster. Beide Grenzen durch neue Regressionen
gesichert; 82 Tests in vier betroffenen Dateien und die gesamte Lightroom-Testgruppe mit 159 Tests erfolgreich.
Syntax, Stil, Dokumentationsverweise, Projektstatus und Diffprüfung bestanden. Keine Testfixture zur Umgehung umgeschrieben,
keine Schutzregel gelockert, kein produktiver Aufbau oder Paketwechsel.
Der [Pages-Lauf der Korrektur `265032f`](https://github.com/felixkfm90/iucn-species-data/actions/runs/37020500536)
bestätigt inzwischen erfolgreiches Linux-Qualitätsgate, Build und Deployment.

## Vierte Umsetzungsstufe: gemeinsamer vollständiger Update-Einstieg

Am 2. Oktober implementiert und ausschließlich mit simulierten UI-Antworten beziehungsweise temporären
Testdatenbanken geprüft:

- Startangebot `Jetzt aktualisieren`, manuelle Datenbank-Aktion und alter Referenz-Updatebutton delegieren an
  denselben Controller. Die gemeinsame Sperre gilt schon während Statuslesen und Rückfrage. Fehlt die Anbindung,
  wird keine ersatzweise reine Quellenaktualisierung gestartet. `Später`/`Abbrechen` schreibt nichts.
- Vor einer Bestätigung werden Referenz- und Masterstatus frisch gelesen; Fehler erlauben keinen Rückfall auf
  einen alten bereiten UI-Stand. Eine aktuelle Quellenvorschau mit Token ist für neue Anbieterstände Pflicht;
  die serverseitige Frische-/Prozessprüfung bleibt unverändert. Ohne neue Arbeit kein Download oder Neuaufbau.
- Gespeicherte Aufträge, Kandidaten, offene eigene Vormerkungen, Referenzdrift oder Paketnachholung haben wie
  bisher Vorrang. Die Rückfrage beschreibt dann ausdrücklich einen lokalen Weg ohne neue Anbieterstände.
  Ein zusätzlich verfügbarer neuer Release wird nicht still mit dieser lokalen Bestätigung heruntergeladen.
  Vorhandene Zwischenstände werden nicht überschrieben; Fortsetzung bleibt die gesonderte vorhandene Aktion.
- Nach bestätigter Quellenaktualisierung wartet der gemeinsame Weg auf deren Abschluss, danach auf Masterbau
  und geprüfte gemeinsame Master-/Lightroom-Übernahme über die vorhandenen APIs. Referenz-/Ergänzungsanzeigen
  heißen nur noch `CoL-Referenz vorbereitet` beziehungsweise `Ergänzungsnamen vorbereitet`; kein Quellenabschluss-
  Popup oder vorgezogener Gesamterfolg. Eigene Namen bleiben erhalten; keine automatische Foto-/Projektmigration.
- Sofortige wie später gelesene Fehler, Teilerfolge, Pause, Unterbrechung oder veraltete Aufträge stoppen die
  Verkettung. Offene Kandidatenkonflikte verhindern die Aktivierung und verweisen auf die gebündelte Prüfung/
  Zurückstellung unter `Datenbank-Aktionen → Taxonomiedatenbank`. Server-/Kandidaten-Schutzregeln bleiben bestehen.
- Der Gesamtabschluss verlangt frischen Referenz-/Masterstatus, aktiven Master, keinen laufenden Vorgang,
  keinen verbliebenen Kandidaten/Referenzdrift/offene eigene Vormerkung und ein aktuelles Lightroom-Paket.
  Erst dann erscheint einmal `Master und Lightroom-Suchpaket sind gemeinsam aktuell`.
- Die Verkettung bleibt im geöffneten UI, nicht in einem neuen dauerhaften Serverkoordinator. Schließen zwischen
  Phasen startet nach Wiederöffnen keinen automatischen Folgelauf. Nach einem Quellenwechsel bleibt der Drift
  als Arbeit erkennbar; ein späterer bestätigter Klick setzt lokal fort, ohne denselben Release erneut zu laden.
  Gespeicherte Workeraufträge und ihre bestehende ausdrückliche Fortsetzung bleiben erhalten. Kein garantierter
  unbeaufsichtigter Gesamtdurchlauf über App-/Dienstneustarts; bestehende vierstündige UI-Wartegrenze unverändert.
- Statusabfragen verwenden die bestehenden kompakten Endpunkte, keine neuen automatischen Vollscans, Schema-
  oder Lua-Änderungen. Lua-Version bleibt `0.4.24.14`; Explorer-JS nicht im Squarespace-Footer eingebunden.

Prüfabschluss: 201 gezielte Tests in 15 Dateien mit Exit 0, ohne Fehler, Abbrüche oder übersprungene Tests,
einschließlich echter Master-/Paar-Hilfsprozesse, Klassifikationsbündel, Paket-/ID-Auflösung und Korrekturübergabe.
Zuvor 67 UI-Tests in drei Dateien erfolgreich, darunter beide vollständigen Einstiege, gemeinsame Rückfrage/
Sperre, Abbruch, veraltete Vorschau, unmittelbare und spätere Fehler, offene Entscheidungen, lokale Wiederholung,
reines lesendes Wiederöffnen und frischer Abschlussnachweis. Zusätzlich alle 76 Wartungstests erfolgreich;
die Testmengen überschneiden sich. Syntax (357 Dateien), Stil, Dokumentationsverweise, Projektstatus und
Diffprüfung bestanden. Kein vollständiges lokales `quality:ci`, produktiver Download/Aufbau/Wechsel,
praktischer Gesamtbedienlauf oder Phase-10.5-Audit. Nächster Quellenlauf braucht eine eigene Planung/Freigabe.

Veröffentlichung der vierten Stufe inzwischen bestätigt: [Pages-Lauf `37040327369` für `c1f586b`](https://github.com/felixkfm90/iucn-species-data/actions/runs/37040327369)
vollständig erfolgreich, einschließlich Linux-Qualitätsgate, Build und Deployment.

## Nächster produktiver Quellenlauf: vorbereiteter Plan, noch keine Startfreigabe

Lesende Vorbereitung am 2. Oktober um 19:28 MESZ: nur kleine Zeiger-, Manifest-, Register- und Auftragsdateien
gelesen. Keine Datenbank geöffnet, keine vollständige Integritätsprüfung, keine neuen Anbieterabfragen oder
Downloads, kein Auftrag gestartet und kein Zeiger verändert. Port 4177 war nicht erreichbar; deshalb keine
frische Explorer-API-Vorschau oder praktische Rückfrage geprüft.

Gespeicherter Ausgangsstand:

- Referenz `col-xr-2026-08-26-316165` (`COL26.8 XR`); Master `master-20261001145513036` und
  Paket `lightroom-63c431a5fa43190a4c52` passen laut ihren Manifesten zur gemeinsamen Veröffentlichung
  `publication-60f9b546-49ee-4c65-ada9-7b57b965b120`. Das passende Vorgängerpaar ist eingetragen.
- Der zuletzt gespeicherte Auftrag ist `ready`; seine Kandidaten-ID ist bereits im Veröffentlichungszeiger
  als verbraucht markiert. Ein noch vorhandenes gleichnamiges Staging-Manifest ist kein neuer offener Kandidat.
  Keine Auftragsfortsetzung oder Bereinigung allein aus vorhandenen Dateien ableiten.
- Das Identitätsregister enthält vier `source-repair`-Ereignisse; seine Revision stimmt mit dem aktiven
  Mastermanifest überein. Keine zusätzliche Klassifikationsvormerkung in diesem gespeicherten Register.
  Eigene Korrekturen sind laut Mastermanifest fünf Eingänge. Das ersetzt keine frische Eingangsprüfung.
- Der Versionscache vom 1. Oktober meldet `col-xr-2026-09-25-316441` (`COL26.9 XR`); dieser Release ist
  nicht in den lokalen Releaseordnern vorhanden. Die Meldung ist ein gespeicherter Stand, kein heutiger
  Anbietercheck. Beim späteren Start muss die aktuelle Vorschau Release, Bedarf und Token frisch bestimmen.
- Rund 93,83 GiB frei auf C: zum Prüfzeitpunkt. Das ist keine Platzgarantie für den Gesamtaufbau; die bestehenden
  12-GiB-Startprüfung, 2-GiB-Reserve und wiederholten auftragsabhängigen Platzprüfungen bleiben maßgeblich.

Geplanter Ablauf und Freigabegrenzen:

1. **Rückfrage ohne Start prüfen:** Explorer mit aktuellem Dienst-/UI-Code öffnen. Startangebot oder
   `Datenbank-Aktionen → Taxonomiedatenbank → Datenbank aktualisieren` nur bis zur Rückfrage aufrufen.
   Noch nicht bestätigen. Frischen Release, Quellenauswahl, keine konkurrierende Aktion und den angekündigten
   vollständigen Master-/Lightroom-Weg prüfen. Unerwartete lokale Arbeit zuerst klären.
2. **Gesonderte Startentscheidung:** Erst nach diesem Befund den angekündigten regulären Updateweg freigeben.
   Diese Rückfrage umfasst Quellenaktualisierung, Kandidatenbau und bei bestandener Prüfung/offenen Fällen = 0
   die automatische gemeinsame Master-/Lightroom-Übernahme. Sie ist keine reine Kandidatenfreigabe.
   Während der Verkettung Explorer geöffnet lassen; keine parallelen Taxonomie-/Pipeline-/Assetänderungen.
3. **Neue Quellen und ersten Kandidaten prüfen:** neue Referenz/Ergänzungen und Anbieterstände über den
   bestehenden Updateweg vorbereiten. Tatsächliche ID-Differenzen, Herkunft, erhaltene eigene Entscheidungen
   und neue Klassifikationsgruppen aus dem frischen Kandidaten prüfen. Die historischen 2.173 Fälle und
   1.693/480 sind keine Sollmengen eines neuen `COL26.9 XR`-Laufs.
4. **Falls Klassifikationsfälle offen sind:** keine automatische Paarübernahme. Passende Gruppen über
   `Passende Klassifikationen prüfen …` nach frischer gebundener Vorschau mit ID-Erhalt vormerken.
   Unklare Gruppen separat über `Unklare Fälle zurückstellen …` nur nach ausdrücklicher Bestätigung vormerken.
   Beide Bündel vor einem einzigen Folgeaufbau speichern; keinen Aufbau zwischen den zwei Rückfragen starten.
   Andere Konflikte getrennt klären. Neue oder geänderte Quellenbelege können die Vormerkung wieder entwerten.
5. **Entscheidungen tatsächlich anwenden:** falls Schritt 4 erforderlich war, einen neuen lokalen Kandidaten
   bestätigt aufbauen, ohne denselben CoL-Download zu wiederholen. Vollständige Kandidaten-/ID-/Paketprüfung
   bleibt verpflichtend; erst ein geeigneter Kandidat darf gemeinsam übernommen werden. Der erste Prüfkandidat
   plus ein Folgeaufbau bei Entscheidungen ist kein versprochener Ein-Aufbau-Gesamtlauf.
6. **Abschluss getrennt nachweisen:** frischer Status bestätigt aktive Referenz = Master-CoL-Herkunft,
   Paket-Quellmaster = aktiver Master, erhaltene ursprüngliche IDs/fünf eigene Namen/Projektlinks und angewendete
   beziehungsweise nachvollziehbar zurückgestellte Fälle. Anschließend gezielte Explorer-/Lightroom-Suche und
   Zuweisung mit Weissstorch/Rebhuhn. Kein katalogweiter Fotoabgleich, keine Statistik-Neuberechnung oder
   Bereinigung als Bestandteil dieses Quellenupdates.

Fehler/Pause/Unterbrechung: keine Schutzprüfung umgehen und keinen zweiten Lauf parallel starten. Bestehende
Auftrags-/Statusausgabe zuerst prüfen; bei geändertem Eingang neue Vorschau/Freigabe. Gemeinsame Master-/Paket-
Rücknahme sowie gegebenenfalls Referenzrücknahme sind gesonderte Entscheidungen, kein automatischer Fehlerreflex.
Der normale Paarwechsel erhält das vorher aktive reparierte Paar als Rückweg; er ist kein rückstandsloses Löschen
aller neuen Quellen-/Auftragsdateien. Historische Fehleraufträge/Originalquellen nicht bereinigen.

Für diese Vorbereitung noch kein produktiver Lauf freigegeben. Nächste benötigte Rückmeldung: sichtbarer Text
der frischen Explorer-Rückfrage; danach konkrete Startentscheidung. Kein zusätzlicher Code-/Lua-Fix erforderlich
aus diesem lesenden Befund allein.

**Rückfrage anschließend praktisch bestätigt:** Felix öffnete den Explorer und übermittelte die Rückfrage
`Taxonomiedatenbank ist veraltet` mit `COL26.9 XR` vom 25. September, Quellenumfang/Platzbedarf, anschließendem
Master-/Paketbau, gemeinsamem Wechsel und Stopp bei offenen Konflikten. Noch keine Startbestätigung.
Lesende API-Prüfung um 19:31 MESZ: Referenz und Master inaktiv/ohne Fehler, kein offener Kandidat oder Drift;
fünf eigene Korrekturen und Identitätsregister bereits aktiv, keine offenen Vormerkungen. Lightroom-Paket
`current`, passender Quellmaster, Rückweg verfügbar. Frischer Versionscheck vom 2. Oktober um 19:29 MESZ
bestätigt `COL26.9 XR` als verfügbar/nicht installiert. Keine Update-/Aufbau-/Aktivierungsroute aufgerufen.
Damit ist die Startvorbereitung einschließlich sichtbarer gemeinsamer Rückfrage bestätigt; die konkrete
Startfreigabe fehlte zu diesem Zeitpunkt noch. Weitere reine Implementierungsprüfungen verlangen keinen produktiven Lauf.

## Früher Downloadabbruch und enge Korrektur am 2. Oktober

Felix bestätigte anschließend den Start. Gespeicherter Quellenstatus: Beginn `2026-10-02T17:34:35.236Z`,
Abbruch `2026-10-02T17:34:35.353Z` (19:34:35 MESZ), Phase `download`, HTTP 404 bei der erwarteten sicheren
API-Exportweiterleitung. Kein Master-Abgleich oder neuer Kandidat gestartet. Lesende Statusgegenprobe bestätigt
Referenz `col-xr-2026-08-26-316165`, Master `master-20261001145513036` und Paket vom selben Master weiterhin
passend/aktiv. Kein Zeigerwechsel, Katalogabgleich oder Bereinigung. Kein vollständiger neuer Datenbankscan.

Die Meldung `Schritt 4 von 7 · Master prüfen · Abschluss · fehlgeschlagen` war ein separater Anzeigefehler:
Ein alter fertiger Aufbauauftrag lieferte `Abschluss`, obwohl der aktuelle Quellenlauf vorher gescheitert war.
Zusätzlich verdrängte `Noch kein Master-Abgleich gestartet` die echte HTTP-Fehlerursache. Korrektur:
aktueller Quellenfehler zeigt Schritt 1/7 mit tatsächlicher Quellenphase und Fehler; die Zahlen werden als
`Bisheriger aktiver Bestand` gekennzeichnet. Alte Masteraktionen/fertige Aufträge liefern hierfür keine Phase.
Aktuelle Master-/Paketfehler und gestoppte Aufträge bleiben eigenständig sichtbar. Kein doppelter Schlusspunkt.

Lesender Anbieterbefund: Der API-Export für Datensatz `316441` liefert 404; derselbe Weg für `316165` liefert
weiter eine erlaubte Jobweiterleitung. Das [offizielle Monatsarchiv](https://download.checklistbank.org/col/monthly/)
enthält `2026-09-25_xr_coldp.zip`. HEAD bestätigt HTTP 200, `application/zip`, 1.416.328.110 Bytes; ein auf vier
Bytes begrenzter Abruf liefert HTTP 206 und ZIP-Kennung `504b0304`. Keine vollständige Inhalts-, Herkunfts- oder
Importprüfung aus dieser kurzen Gegenprobe ableiten; warum genau der neue API-Jobexport fehlt, ist nicht belegt.

Downloadvertrag nach Korrektur:

- API-Export/erlaubte Jobweiterleitung bleibt der erste Weg.
- Nur bei API-HTTP-404 wird ein Ersatz erwogen. Release-ID, Datensatzkennung, kalendergültiges Datum, Ursprung
  `xrelease`, Format `ColDP` und kanonische API-Exportadresse müssen zusammenpassen; auch bisherige gespeicherte
  Releaseobjekte brauchen kein neues Feld oder erzwungenes Löschen des Versionscaches.
- Ersatzadresse wird ausschließlich daraus als `https://download.checklistbank.org/col/monthly/<Datum>_xr_coldp.zip`
  abgeleitet. Kein bewegliches `latest`, fremder Host, übergebenes freies Archivziel oder weiterer Redirect.
  HTTP 403/andere API-Fehler und unsichere Jobweiterleitungen starten keinen Ersatzabruf.
- Erfolg, Datenstrom, Größenlimit und ZIP-Kennung bleiben erforderlich; tatsächliche Downloadadresse und SHA-256
  bleiben in den Archivmetadaten. Fehler entfernt ausschließlich das eigene Teilarchiv; vorhandenes Ziel bleibt
  bei fehlerhafter Übertragung erhalten. Sichere Entpackung, vollständiger Import und alle nachgelagerten
  Referenz-/Master-/ID-/Paketprüfungen bleiben unverändert.

Prüfabschluss: 109 Tests der vollständigen Wartungsgruppe und 36 zusätzliche Anzeige-/Dashboard-/Sicherheitstests
erfolgreich (145 Tests in elf Dateien). Reproduktion vor Fix, normaler Jobexport, datierter Ersatz, inkonsistente
Releasefelder, unerlaubte Antworten/Weiterleitungen, ZIP-/Größenfehler, Übertragungsabbruch/Wiederholung,
Metadatenübergabe im Wartungsweg und Erhalt des alten Referenzzeigers bei Fehler geprüft. Der Import/Entpacker
ist in der neuen Service-Gegenprobe simuliert; die bestehende Wartungsgruppe prüft deren eigene Verträge separat.
UI-Gegenprobe mit Felix' altem fertigen Auftrag prüft genaue Fehleranzeige, keine Master-/Paketaktion, bedienbare
Oberfläche und rein lesendes Wiederöffnen. Kein vollständiges lokales `quality:ci`, Phase-10.5-Audit oder
produktiver Wiederholungsstart durch diesen Fix. Lua-Version bleibt `0.4.24.14`.
Syntax (357 Dateien), Stil, 70 Markdown-Dateien ohne fehlende lokale Verweise, frisch synchronisierter
Projektstatus und Diffprüfung erfolgreich. Explorer-JS ist nicht im Squarespace-Footer eingebunden;
Footer/CSS unverändert. Commit/Push und erfolgreicher Pages-Lauf bleiben getrennte Nachweise.

**Nächste Grenze:** Arten-Explorer normal schließen/neustarten, um Backend und Anzeige neu zu laden, dann den
regulären Updateweg mit frischer Rückfrage erneut durch Felix bestätigen. Danach erst vollständigen Download,
Import, offenen Klassifikationsbefund und gemeinsamen Paarabschluss prüfen. Alte Release-/Master-/Paketstände
und Reparaturnachweise erhalten; keine Cachelöschung oder eigenständige Wiederholung.

## Nutzungsabhängige Automatik – Auftrag nach dem ersten Prüfkandidaten

Felix startete den korrigierten regulären Updateweg am 2. Oktober um 19:53:14 MESZ erneut. Quellenimport
abgeschlossen; der erste Kandidat `master-20261002182254600` ist seit 21:10:14 MESZ `ready` und nicht aktiv.
Neue Klassifikationsmengen: 2.182 Fälle, davon 1.995 passende Quellenverweise und 187 unklare (6 abweichend,
2 mehrdeutig, 179 ohne Verweis). Die bestehende Entscheidungssperre hat die gemeinsame Übernahme gestoppt.
Keine pauschale Bestätigung oder Ableitung einer Sollmenge aus früheren Reparaturnotizen.

Zusätzlich meldet die gespeicherte ID-Kontinuitätsprüfung eine fehlende ursprüngliche ID. Gezielte lesende
Abfragen zeigen `Storchodon cingulatus` mit derselben GBIF-Kennung `181179893`, jedoch bisher ohne Reich als
`mtx_6bbad0b4ee45cbfbde46c3c87b22292c` und neu mit CoL-/Animalia-Beleg als
`mtx_f62f1980849cd4c78995ace17d089602`. Keine Projektverknüpfung, Lightroom-Nutzung unbekannt. Ursache des
ID-Wechsels inzwischen isoliert reproduziert und gezielt korrigiert: der Aufbau verwendete trotz erkannter
Altzuordnung erneut den Namen-/Rang-/Reichshash. Eine eindeutige Ergänzung des unbekannten Reichs mit
fortbestehender gleicher Anbieterkennung behält jetzt die alte aktive ID; weitere Updates erhalten diese ID
ebenfalls. Gleicher Name allein, andere/fehlende/entfernte Kennung, bekannte Reichswechsel und mehrdeutige
Gegenstücke bleiben ausgeschlossen. Roher GBIF-Wert bleibt leer, CoL-/Animalia-Beleg getrennt erhalten.
Namenswahl/Projektlink, Lightroom-Export sowie Worker-Abschlussfehler/Fortsetzung sind isoliert geprüft.
Kein Eingriff in den gespeicherten produktiven Kandidaten und keine nachträgliche Änderung seiner Regelbindung.
Auch eine spätere automatische Klassifikationsbehandlung darf diese eigenständige Aktivierungssperre nicht umgehen.

Prüfabschluss dieses ID-Fixes: 220 gezielte Tests in zehn Dateien mit Exit 0, ohne Fehler/Abbrüche/übersprungene
Tests; echte Worker-/Paarprozesse und bestehende Split-/Merge-/Klassifikations-/Reparaturwege eingeschlossen.
Ein zuerst prozessbeschränkt gesperrter Testlauf wurde beendet und zulässig wiederholt. Syntax (357 Dateien),
Stil, 70 Markdown-Verweise, generierter Projektstatus und Diffprüfung bestanden. Kein vollständiges Qualitätsgate,
produktiver Neuaufbau, Paketwechsel oder Lightroom-Bedientest. Plug-in-Version bleibt `0.4.24.14`.

**Neue Nutzervorgabe (2. Oktober):** solche Quellenfälle künftig ohne Einzelrückfrage verarbeiten, außer sie betreffen
bereits angelegte Projektarten oder in Lightroom zugewiesene Arten. Noch keine Umsetzung/Freigabe des
gesperrten Kandidaten daraus ableiten. Damalige Abgrenzung, inzwischen wie unten beschrieben implementiert:

- Angelegte Projektarten, zugewiesene Master-IDs und eigene Namens-/Identitätsentscheidungen geschützt behandeln.
  Projektlinks allein belegen nicht, dass eine Art in Lightroom unbenutzt ist.
- Nur bei vollständig belegtem Nichtgebrauch und weiterhin eindeutigen Anbieter-ID-Verweisen passende
  Klassifikationen nach der bestätigten Regel verarbeiten, mit ursprünglicher Master-ID und gebundenem Journal.
  Keine Namensheuristik, automatische Fotomigration oder Änderung bestehender Projekttexte.
- Unklare unbenutzte Gegenstücke konservativ nicht übernehmen; bisherige Identität/ID erhalten und Gründe
  protokollieren, statt automatisch Reichs-/Identitätsgleichheit zu behaupten.
- Bei verwendeten Arten oder fehlendem/veraltetem Nutzungsnachweis bleibt eine gezielte Rückfrage erforderlich.
  Vollständige ID-/Quellen-/Kandidaten-/Paketprüfung und frische gemeinsame Freigabe bleiben unverändert.
- Lightroom hält den Statistikindex derzeit als Plug-in-Eigenschaft im jeweiligen Katalog. Die explizite
  Artänderungsprüfung liest ein Inventar für ihre eigene Aktion; es existiert noch kein vollständiges dauerhaftes
  Nutzungsregister für diese Master-Automatik. Felix bestätigte ausdrücklich alle seine FN-Kataloge, nicht
  nur den aktuell geöffneten. Bekannte Nutzung katalogübergreifend schützen; fehlende/unvollständige
  Kataloggrundlagen sperren eine Einstufung als unbenutzt. Keine neuen automatischen Vollscans beim Öffnen
  eines Fensters einbauen; vorhandenen Statistikindex nur mit belegter Vollständigkeit und anschließender
  Fortschreibung verwenden. Erforderliche Erstaufnahme getrennt und ausdrücklich starten, nicht still scannen.

Felix hat anschließend die Fortsetzung bis zum erfüllten Aufbauvertrag beauftragt und bestätigt, dass er nur
einen FN-Katalog verwendet: `D:\Lightroom Katalog\Lightroomkatalog aktuell.lrcat`. Lesende Dateiliste bestätigt
diesen aktuellen Katalog neben Vorschau-/Hilfsdateien und `Old Lightroom Catalogs`; historische Altstände sind
keine zusätzlichen aktiven Kataloge. Kein Inhalt des Katalogs gelesen oder verändert und noch keine vollständige
Nutzungserfassung. Künftige weitere FN-Kataloge dürfen nicht still aus der Schutzmenge fallen.

Umsetzungsreihenfolge: den unabhängigen ID-Wechsel isoliert absichern (Codefix implementiert), dann den vollständigen
katalogübergreifenden Nutzungsnachweis anbinden und dessen Frische/Änderungsgrenzen prüfen, danach automatische
passende Übernahme beziehungsweise konservative Zurückstellung ausschließlich unbenutzter Fälle integrieren.
Geschützte Fälle separat und kompakt zur Bestätigung zeigen. Neue Automatik muss mit unbekannten/fehlenden
Kataloggrundlagen, zwischenzeitlicher Zuweisung, eigener Entscheidung, Wiederholung, Fehler und Neustart geprüft
werden. Erst anschließend einen frisch gebundenen lokalen Folgeaufbau separat bestätigen; bisherige Quellen
nicht erneut herunterladen. Diese Reihenfolge war ein Umsetzungsauftrag, kein damals bereits implementierter Ablauf
und keine Freigabe eines produktiven Folgeaufbaus oder Paketwechsels.

Bis zur Klärung keine der beiden Bündel speichern und keinen Folgeaufbau starten. Die bestehende stille
Wiedervorlage ist am nutzerabhängigen Halt pausiert. Kandidat, Originalquellen und aktives Paar unverändert;
keine produktive Reparatur, Regeländerung oder unaufgeforderte Veröffentlichung in dieser Prüfung.

### Implementierte Nutzungsgrenze am 3. Oktober

Plug-in 0.4.24.15 ergänzt die ausdrückliche SDK-Erfassung, ohne Foto-/Metadaten-/Stichwortänderung.
Zwei vollständige UUID-/Master-ID-Lesedurchgänge müssen übereinstimmen. Die Quittung allein genügt nicht:
Lightroom normal schließen, unveränderte FN-Daten seit der Erfassung und alle FN-Kataloge ausdrücklich
im Explorer bestätigen. Dateistand/Prüfsumme binden die geschlossenen Kataloge. Neue/unvollständige/offene/
geänderte Grundlagen sind unbekannt, nicht leer. Keine zusätzliche automatische Vollberechnung beim Öffnen.

Die einmal bestätigte Richtlinie erlaubt gemeinsame atomare Vormerkung beider unbenutzter Gruppen:
passende Quellenfälle mit ursprünglicher ID, unklare neue CoL-Gegenstücke zurückstellen. Projektlinks,
FN-Zuweisungen sowie eigene Namen, Felder und Entscheidungen schützen Vorgänger und Gegenstück.
Jedes automatische Ereignis enthält die Nutzungsrevision. Aufbau/Fortsetzung und beide Aktivierungswege
prüfen diese Grenze erneut. Bereits aktive automatische Historie blockiert keine spätere LR-Nutzung.

Die bestätigte komplette Updateaktion kann genau einen lokalen Folgeaufbau ohne Anbieterrefresh
anschließen; verbleibende geschützte oder andere Konflikte stoppen weiter zur Rückfrage. Separate
Vormerkung per Button startet keinen Aufbau. Keine Endlosschleife, Schutzumgehung oder automatische
Fotomigration. Historische Auftrags-/Kandidatenbindungen bleiben unverändert.

Noch keine dauerhafte SDK-Deltafortschreibung: veränderten/offenen Katalog erneut erfassen und bestätigen;
alte automatische Vormerkungen nicht still umstempeln. Nutzerbestätigung schließt die Zeitlücke zwischen
SDK-Erfassung und normalem LR-Schließen; diese wird nicht unabhängig technisch beobachtet.
Praktische Erstaufnahme inzwischen durch Felix durchgeführt: 128.871 Fotos, 5.484 FN-Zuweisungen,
56 genutzte IDs. Gesamtbestätigung am 3. Oktober um 07:42:24 MESZ. Lesende vollständige Nutzungs-/Fallprüfung
bestätigt 1.995 unbenutzte passende und 187 unbenutzte unklare Fälle, keine geschützte Überschneidung in
dieser Gruppe. Keine Vormerkung oder Aktivierung durch diese lesende Prüfung. Anschließend von Felix
bestätigter Update-Einstieg um 07:52:59 MESZ: alle 2.182 Fälle atomar vorgemerkt, lokaler Folgeaufbau
zunächst `building` / `Eingangsstand sichern`, ohne Fehler. Um 09:11:14 MESZ erfolgreicher Gesamtabschluss
mit gemeinsamem Master-/Paketwechsel. Keine offenen Klassifikationen; 187 Zurückstellungen sind eine
gewollte Verarbeitung, keine jetzt ausstehende Entscheidung. Nachfolgender einmaliger lesender Vergleich
bestätigt sämtliche bisherigen IDs, vier historische Ersatz-IDs, fünf eigene Namen, 60 Projektlinks,
46 ausgewählte eigene Felder und alle 56 genutzten Lightroom-IDs. Kein zusätzlicher Vollhash-/Integritätsscan.
Der gemeinsame Update-Einstieg führt
Vormerkung, Aufbau und Paarprüfung ohne einzelne Fallbestätigung zusammen aus.
Bedienung/Grenzen: [FN-Katalognutzung](lightroom-catalog-usage.md).
Prüfabschluss: 281 Tests in 15 betroffenen Dateien und vollständige Lightroom-Testgruppe mit 170 Tests
erfolgreich. Anschließend 95 Nutzungs-/Bündel-/UI-/Lua-Tests einschließlich Fehler beim gemeinsamen
Paarwechsel erneut erfolgreich; Testmengen überschneiden sich. Zusätzliche leere SDK-Nutzung explizit als
JSON-Liste geprüft. Syntax (360 Dateien), Stil, 71 Markdown-Verweise, Projektstatus und Diffprüfung bestanden.
Dieser automatisierte Prüfabschluss enthielt kein vollständiges Qualitätsgate, produktiven SDK-Lauf,
Masteraufbau, Paarwechsel oder Pages-Nachweis; die nachfolgende echte SDK-Erfassung ist separat oben belegt.

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

Referenzaktivierung und anschließende gemeinsame Master-/Lightroom-Freigabe bleiben getrennte sichere Schritte. Der
Masterstatus vergleicht deshalb die aktive Referenz-Release-ID mit der im aktiven Master gespeicherten
CoL-Provenienz. Wurde der Ablauf nach der Referenzaktivierung beendet, behandelt `Datenbank aktualisieren` diese
Abweichung beim nächsten Aufruf weiterhin als Arbeit. Es verwendet die bereits installierte aktive Referenz, baut
und prüft daraus einen neuen Masterkandidaten und lädt den gleichen CoL-Stand nicht erneut herunter. Das passende
Lightroom-Suchpaket wird vor dem gemeinsamen atomaren Paarwechsel vorbereitet und geprüft. Ein leerer
Projektkonfliktbericht überspringt keinen dieser Ableitungsschritte.

Ein Referenzwechsel entwertet außerdem die bisherige Abkürzung für bekannte CoL-Referenzlücken. Der lokale
Masteraufbau prüft diese wissenschaftlichen Namen erneut gegen die neue aktive CoL-SQLite; bei unveränderter
Referenz bleiben bekannte Lücken weiterhin ohne unnötige Wiederholung überspringbar. Fortschrittsabfragen lesen
nur kompakte, bereits geprüfte Kandidateninformationen. Eine Statusabfrage darf keine erneute Vollvalidierung und
keine Übertragung sämtlicher nicht blockierender Konfliktzeilen auslösen.
Numerische interne SQLite-Taxon-IDs sind dabei niemals releaseübergreifend stabil. Nach einem Referenzwechsel wird
daher ausschließlich über den wissenschaftlichen Namen im neuen Release aufgelöst; auch im Schnellweg wird eine
gespeicherte ID nur bei identischem wissenschaftlichem Taxon akzeptiert.

Nach erfolgreichem Referenzimport bleiben Release und Importzähler im Bereich `Taxonomiereferenz` sichtbar.
Dieser Quellenabschluss allein meldet keinen Gesamterfolg und öffnet kein Bestätigungsfenster. Der gemeinsame
Updateweg bestätigt den Gesamtabschluss erst nach frischer Prüfung des passenden Master-/Lightroom-Stands.
Nach einem Fehler
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
<Explorer-Ordner>\Daten\taxonomy
```

Seit 4. Oktober gilt der [gemeinsame Speicherwechsel](storage-migration.md): alter AppData-Datenordner leer,
keine Verknüpfung, eigene Entscheidungen/Aufträge am neuen Ort. Gebundene historische Prüfbelege unverändert.
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
