# Lightroom-Suchpaket und FN-Wildlife-Plug-in

Stand: 2026-08-31
Roadmap: Phase 10.2 bis 10.4
Status: Suchpaket und Plug-in Version 0.4.21.0 sind automatisiert verifiziert. Einzel- und Mehrfachzuweisung,
Zuweisungsfenster, Favoritenersetzung und das Entfernen der Taxonomie einschließlich der reservierten
FN-Stichwörter wurden mit den vorherigen Ständen im vorbereiteten Lightroom-Testkatalog praktisch geprüft. Die
Zuweisung und Auswahl-Refresh bis 0.4.16.0 wurden praktisch bestätigt; der Statistikfix von 0.4.17.0 und die
Lightroom-Explorer-Korrekturübergabe von 0.4.18.0, die automatische Suche von 0.4.19.0 und die gemeinsame schnelle
Korrekturaktivierung von 0.4.20.0 sowie der persistente Statistikindex mit CSV-Export von 0.4.21.0
benötigen noch den praktischen Folgetest. Phase 10 bleibt bis zum umfassenden
Abschlussaudit offen.

## Ziel

Lightroom Classic soll die vollständige aktive Taxonomie-Masterdatenbank offline durchsuchen können, ohne dass der
Arten-Explorer läuft und ohne dass Lightroom die fachlichen Stammdaten verändert. Eine ausgewählte Art kann nach
sichtbarer Prüfung einem oder mehreren gleichzeitig markierten Fotos zugewiesen werden. Geschrieben werden nur
eindeutig markierte Lightroom-Stichwörter und stabile Plug-in-Metadaten über das offizielle Lightroom-SDK.

## Architektur

```text
aktive Taxonomie-Masterdatenbank (read-only)
  -> abgeleitetes Lightroom-Suchpaket
     -> taxonomy-search.sqlite + manifest.json
     -> active / previous / staging
  -> kleine versionierte Namenskorrektur-Releases
     -> ein gemeinsamer atomarer Aktivierungszeiger für Masteransicht und Lightroom-Suche
  -> read-only Node-Suchhelfer
  -> deutsches Lua-Plug-in
  -> Lightroom-SDK
     -> flache, mit (FN) markierte Stichwörter
     -> stabile Plug-in-Metadaten
```

Die fachliche Wahrheit bleibt die Masterdatenbank des Arten-Explorers. Das Suchpaket ist eine reproduzierbare,
unveränderliche Ableitung und keine zweite pflegbare Taxonomiedatenbank. Es enthält alle nicht veralteten Mastertaxa,
alle Suchnamen, die vollständige verfügbare Hierarchie, Status, Anbieterbelege und vorhandene Projektverknüpfungen.
Seit dem Exportstand 0.4.19.0 bildet der vollständige bevorzugte Anbieterpfad den Fallback; rangweise ausgewählte
Master-Feldwerte überschreiben beziehungsweise ergänzen ihn. Damit kann ein unvollständiger Einzelbeleg nicht mehr
einen vollständig vorhandenen Masterpfad verkürzen, während zusätzliche Zwischenränge erhalten bleiben.

Lightroom greift weder auf die interne Master-SQLite noch auf den Explorer-Server zu. Der Suchhelfer öffnet das aktive
Suchpaket ausschließlich read-only. Katalog- und XMP-Dateien werden nie direkt bearbeitet.

Seit Version 0.4.20.0 müssen reine eigene Namenskorrekturen weder die Master-SQLite noch das mehrgigabytegroße
Lightroom-Basispaket kopieren oder neu aufbauen. Der Explorer löst jedes betroffene Taxon in beiden aktiven
Datenbanken erneut auf und verlangt dieselbe stabile `masterTaxonId`, denselben wissenschaftlichen Namen sowie
passende Basisversionen. Erst nach dieser Prüfung schreibt er ein kleines unveränderliches Korrektur-Release.
Ein einziges atomar ersetztes Manifest unter dem gemeinsamen lokalen Anwendungsdatenordner aktiviert dieses Release
für Masteransicht und Lightroom-Suchhelfer gleichzeitig. Bis zu diesem Zeigerwechsel lesen beide weiterhin den
bisherigen Stand; bei einem Fehler wird nichts teilweise aktiviert. Eine neue Lightroom-Suche öffnet den aktuellen
Stand bei jeder Anfrage neu, sodass weder Lightroom noch das Plug-in neu gestartet werden müssen.
Beim ersten Explorer-Start mit Version 0.4.20.0 wird ein fehlender Baseline-Zeiger nur erzeugt, wenn Vollmaster-
Fingerabdruck, aktuelle Korrekturdatei und aktives Lightroom-Paket bereits exakt zusammenpassen.

## Lokaler Speicher

Standardpfad:

```text
%LOCALAPPDATA%\FN Wildlife Travel\Arten-Explorer\lightroom\
  active\
    manifest.json
    taxonomy-search.sqlite
  previous\
    manifest.json
    taxonomy-search.sqlite
  staging\

%LOCALAPPDATA%\FN Wildlife Travel\Arten-Explorer\corrections\
  active.json
  releases\
    corrections-<Prüfsumme>.json
```

`staging` wird vollständig aufgebaut und geprüft. Erst danach ersetzt es atomar `active`; der zuvor aktive Stand
wandert nach `previous`. Ein Rollback tauscht `active` und `previous` kontrolliert zurück. Temporäre Rollbackproben
laufen in einem isolierten Unterordner und verändern den produktiven Zeiger nicht.

Seit dem 30. August 2026 ist dieser Ableitungsschritt in die normale Datenbankpflege des Arten-Explorers
eingebunden. Nach einer bestätigten Master-Aktivierung oder Master-Wiederherstellung baut der Explorer das
Lightroom-Suchpaket automatisch in einem getrennten Node-Hilfsprozess neu auf, prüft Datenbank, Zähler und
SHA-256-Prüfsumme vollständig und aktiviert erst danach den Staging-Slot. Schema, Export, Indizes, Prüfung und
Aktivierung erscheinen als Phasen im bestehenden Fortschrittsblock; der Explorer-Server bleibt während des
SQLite-Aufbaus ansprechbar.

Schlägt ausschließlich dieser abgeleitete Schritt fehl, bleibt die bereits aktivierte Masterdatenbank bestehen und
das bisherige Lightroom-Suchpaket aktiv. Der Explorer kennzeichnet diesen Zustand ausdrücklich als Teilerfolg.
`Datenbank aktualisieren` erkennt die abweichende `masterVersion` im aktiven Paket und wiederholt dann nur den
Paketbau; ein erneuter Masteraufbau ist dafür nicht erforderlich.

Der Pfad ist über `--search-root=<Pfad>` beziehungsweise die lokalen Plug-in-Einstellungen überschreibbar. Eine
spätere Installer- und Mehrgerätephase darf ihn deshalb konfigurieren, ohne das Datenformat zu ändern.

## Real verifizierter Bestand

Der am 13. August 2026 aus dem aktiven realen Master erzeugte Stand enthält:

- 273.505 Taxa;
- 7.108.393 Suchbegriffe;
- 1.762.462 Namen;
- 54 Projektverknüpfungen;
- 430.675 Anbieterbelege;
- ein 3,17 GiB großes Suchpaket (`taxonomy-search.sqlite`).

Paket-ID: `lightroom-84c9977ebcbf5f3dc38f`.

Am 29. August 2026 wurde nach der bestätigten Namenskorrektur für `Macroglossum stellatarum` der Master
`master-20260829115042248` aktiviert und das Suchpaket vollständig neu gebaut. Der damalige Stand
`lightroom-9e5f0da24b6bc65712de` enthält 273.421 Taxa, 7.103.318 Suchbegriffe, 2.665.697 Hierarchiezeilen und 55
Projektverknüpfungen. Das vorherige Paket bleibt als kontrollierter Rollbackstand erhalten.

Am 30. August 2026 wurde `master-20260830105212577` mit drei eigenen Korrekturen aktiviert. Das daraus vollständig
geprüfte Paket `lightroom-ef6cfb4b4851d19063d8` enthält 273.421 Taxa, 7.103.327 Suchbegriffe, 2.670.983
Hierarchiezeilen und 55 Projektverknüpfungen. `Amazona autumnalis` liefert bevorzugt `Rotstirnamazone`;
`Sciurus vulgaris` enthält im Paket den vollständigen Pfad von Reich bis Art. Der vorherige Paketstand bleibt im
Slot `previous` erhalten.

Schema, Zähler, Fremdschlüssel, Manifest und SHA-256-Prüfsumme wurden vollständig geprüft. Ein realer isolierter
Rollbacktest war erfolgreich; danach blieb dasselbe produktive Paket aktiv und weder `previous` noch `staging`
enthielten Prüfarbeitsstände.

Repräsentative Offline-Suchen im realen Bestand lagen lokal ungefähr zwischen 0,6 und 1,8 Millisekunden:

- `Eurasisches Eichhörnchen` -> `Sciurus vulgaris`, Status CoL-Referenzlücke;
- `Lilac-breasted Roller` -> `Coracias caudatus`;
- `Coracias caudatus`;
- `Dunlin` -> `Calidris alpina`;
- `Panthera pardus` -> `Leopard`;
- `Macroglossum stellatarum` -> `Taubenschwänzchen` statt `Karpfenschwanz`.

## Befehle

```powershell
npm.cmd run --silent lightroom:package:status
npm.cmd run --silent lightroom:package:build
npm.cmd run --silent lightroom:package:verify
npm.cmd run --silent lightroom:package:probe-rollback
npm.cmd run --silent lightroom:package:rollback
npm.cmd run --silent test:lightroom
```

Der Suchhelfer unterstützt einen dauerhaften JSON-Zeilenstrom über stdin/stdout sowie einen atomaren
Anfrage-/Antwortdateimodus für Lua:

```powershell
node species-explorer/lightroom-search-helper.mjs --request=<Anfrage.json> --response=<Antwort.json>
```

Unterstützte Befehle sind `ping`, `status`, `search`, `taxon` und `close`. Fehler werden als strukturierte
JSON-Antworten gemeldet; technische Stacktraces gelangen nicht in die Lightroom-Oberfläche.

## Plug-in

Versionierter Pfad:

```text
lightroom-plugin/FNWildlifeTaxonomy.lrplugin/
```

Das Plug-in trägt die Version `0.4.21.0`. Jede Änderung an einer Plug-in-Datei erhöht diese Version in `Info.lua`
und in der sichtbaren Anzeige des Zusatzmodul-Managers. Dokumentation und Vertragstest werden im selben Commit
nachgezogen, damit der tatsächlich geladene Stand eindeutig kontrollierbar bleibt. Enthalten sind:

- `Info.lua`: Manifest, SDK-Grenze und deutscher Bibliotheksmenüpunkt;
- `MetadataDefinition.lua`: stabile Plug-in-Metadatenfelder für Namen, Status und alle unterstützten
  Taxonomieränge;
- `MetadataTagset.lua`, `MetadataTagsetFull.lua` und `MetadataTagsetFields.lua`: eine kompakte Metadatenansicht
  `FN Wildlife – Foto & Taxonomie` mit sinnvollen Standard-Fotofeldern und den wichtigsten fachlichen Feldern sowie
  eine getrennte vollständige Taxonomieansicht für alle unterstützten Ränge;
- `TaxonomyRanks.lua`: eine gemeinsame Rangdefinition für Vorschau, Metadaten, Schlüsselwörter und Statistik;
- `TaxonomyHelper.lua`: Aufruf des read-only Suchhelfers; unter Windows wird eine vorhandene Node-Installation
  auch dann automatisch unter den üblichen Installationspfaden gefunden, wenn Lightroom den System-`PATH` nicht
  vollständig übernimmt. Der lokale Suchpaketpfad wird unabhängig von Lightroom-Prozessvariablen explizit
  übergeben. Ein fehlgeschlagener Hilfsprozess liefert eine begrenzte technische Diagnose statt einer
  abgeschnittenen Sammelmeldung. Ein davon getrennter Korrekturhelfer erzeugt für eine ausgewählte Art ausschließlich
  eine kurzlebige Übergabe an den Arten-Explorer und erhält keinen Schreibzugriff auf Masterdatenbank oder Katalog;
- `Json.lua`: gekapselter JSON-Codec für die Kommunikation mit dem Suchhelfer;
- `KeywordWriter.lua`: vollständige fachliche Metadaten, flache und eindeutig mit `(FN)` markierte Stichwörter,
  vor dem Schreibzugriff deduplizierte sichtbare Keywordnamen, gespeicherte lokale Kennungen,
  Einzel-/Mehrfachzuweisung, kontextreiche Schreibfehler, verifizierter Write-Access-Callback und kontrollierte
  Rücknahme einschließlich `(FN)*`;
- `AssignTaxonomy.lua` und `AssignmentWindow.lua`: dauerhaft geöffnetes, in vier gerahmte Arbeitsschritte
  gegliedertes Zuweisungsfenster mit Dateiname beziehungsweise Gesamtzahl der ausgewählten Fotos, geprüftem
  Suchpaketstatus, Taxonomievorschau, Konfliktprüfung, kontrollierter Rücknahme und den zehn zuletzt verwendeten
  Arten. Unter der Vorschau öffnet `Artbezeichnung korrigieren ...` die ausgewählte Art kontrolliert im
  Arten-Explorer. Vor einer Zuweisung wird geprüft, ob noch dasselbe Basispaket und dieselbe atomar aktivierte
  Korrekturrevision aktiv sind. Das Fenster startet keine
  Statistik- oder Lifelist-Berechnung. Die Suche bleibt über `Art suchen` verfügbar und startet zusätzlich nach
  0,5 Sekunden ohne weitere Eingabe;
- `RemoveTaxonomy.lua`: eigenständige Rücknahmeaktion über `Plug-in-Extras` beziehungsweise
  `Bibliothek > Zusatzmoduloptionen`;
- `PluginState.lua`: lokale Bedienzustände sowie der kataloggebundene persistente Statistikindex und sein
  fortsetzbarer Aufbauzustand;
- `ReferenceImage.lua` und `SetReferenceImage.lua`: genau ein kontrolliertes `Favoritenbild der Art` je
  Master-Taxon-ID;
- `SmartCollections.lua` und `CreateCollections.lua`: wiederholbar einrichtbare intelligente Sammlungen;
- `StatisticsIndex.lua`, `Statistics.lua` und `ShowStatistics.lua`: kompakter Aggregatindex, gebündelter und
  pausierbarer Katalogaufbau, Lifelist-CSV, aufklappbare Klassen mit Arten sowie das Statistikfenster;
- `PluginInfoProvider.lua`: kompakte Version und read-only Statusanzeige des lokalen Suchpakets im
  Zusatzmodul-Manager.

Der Prototyp sucht in der vollständigen lokalen Masterableitung und nicht nur in bereits angelegten Explorer-Arten.
Vor der Zuweisung zeigt er deutsche, englische und wissenschaftliche Namen sowie alle verfügbaren Taxonomiestufen.
Ein Foto mit einer abweichenden vorhandenen `masterTaxonId` wird nicht still überschrieben.

Beispiele für die flachen, reservierten Plug-in-Stichwörter:

```text
Tiere (FN)
Chordatiere (FN)
Vögel (FN)
Waldkauz (FN)
```

Die Schlüsselwörter sind für die normale Bildsuche gedacht und enthalten deshalb weder interne Kennungen noch
technische Rangpräfixe. Die reservierte Endung unterscheidet sie von normalen Nutzerstichwörtern. Fehlende Ränge
werden ausgelassen; Zwischenränge werden in fachlicher Reihenfolge übernommen. Die vollständige strukturierte
Taxonomie wird stattdessen in folgenden Plug-in-Metadaten gespeichert:

- `masterTaxonId`;
- `projectTaxonId`, sofern vorhanden;
- deutscher, englischer und wissenschaftlicher Name;
- Taxonrang;
- vollständiger Taxonomiepfad;
- Zuweisungszeitpunkt;
- alle vorhandenen Ränge von Domäne bis Form einschließlich Unter-, Über-, Infra- und Parvrängen;
- Kennzeichen `Favoritenbild der Art` mit den Werten `Ja` oder `Nein`.

Lightrooms eingebaute Ansicht `Standard` kann ein Plug-in nicht verändern. Deshalb stellt das Plug-in zwei eigene
Ansichten bereit. `FN Wildlife – Foto & Taxonomie` kombiniert Dateiname, Aufnahmedatum, Abmessungen,
Urheber-/Kamera-/Objektiv-/Belichtungsdaten und GPS mit den drei Artnamen und den wichtigsten Taxonomierängen.
`FN Wildlife – vollständige Taxonomie` zeigt dieselben Fotofelder und zusätzlich alle vorhandenen Ränge. Die
sichtbaren Feldtitel verwenden die kurzen Rangnamen wie `Reich`, `Klasse` oder `Ordnung`; der bisherige Zusatz
`(wissenschaftlich)` entfällt, die gespeicherten wissenschaftlichen Taxonwerte bleiben unverändert. Interne
Master-/Projekt-IDs und der technische Taxonomiepfad bleiben in beiden Ansichten ausgeblendet, stehen dem Plug-in
aber weiterhin stabil zur Verfügung. Master- oder Suchpaketversionen werden nicht auf Fotos geschrieben.

Die Menüaktion `Taxonomie zuweisen` öffnet ein kompaktes schwebendes Arbeitsfenster. Die vier sichtbaren Abschnitte
`Aktuelle Lightroom-Auswahl`, `Art suchen und auswählen`, `Taxonomie prüfen` und `Taxonomie verwalten` führen vom
ausgewählten Foto bis zur bewussten Katalogänderung. Oben steht bei einer Einzelwahl der Dateiname, bei einer
Einzelwahl ohne verfügbaren Dateinamen `1 Foto ausgewählt` und bei einer Mehrfachwahl ausschließlich
`X Fotos ausgewählt`; der Auswahl-Observer startet dazu eine kurze `LrTask`, sodass Strg+A und Einzelklicks den
Katalog erst im zulässigen Task-Kontext lesen und die Anzeige unmittelbar aktualisieren. Lifelist und
Katalogstatistik werden in diesem Fenster weder beim Öffnen noch nach Zuweisung oder Rücknahme berechnet. Vor der
Suche prüft das Fenster das lokale Suchpaket und zeigt dessen verfügbaren Taxabestand an. Jede Änderung des
Suchtexts verwirft sofort die zuvor geladene Art. Treffen alter Auswahl und aktueller nichtleerer Text trotzdem
nicht zusammen, verlangt die Zuweisung eine ausdrückliche Bestätigung; das Öffnen einer zuletzt verwendeten Art bei
leerem Suchfeld benötigt diese Zusatzbestätigung nicht. Es bleibt beim Wechsel der Lightroom-Auswahl geöffnet und bringt ein bereits
geöffnetes Fenster erneut in den Vordergrund, statt ein zweites zu erzeugen. Der Button `Schließen` sitzt unten
rechts. Das reine Öffnen, Suchen und Vorschauen verändert keine Bildmetadaten.

`Artbezeichnung korrigieren ...` schreibt weder Masterdaten noch Lightroom-Katalogdaten. Das Plug-in erzeugt eine
auf Größe und Lebensdauer begrenzte Übergabe mit Master-ID, wissenschaftlichem Namen, sichtbaren Namen sowie Paket-
und Masterstand. Der Arten-Explorer konsumiert diese Übergabe genau einmal, prüft Master-ID und wissenschaftlichen
Namen gegen seinen aktiven Master und öffnet erst dann denselben Korrekturdialog wie bei einer manuellen Explorer-
Suche. Nach dem Speichern kann der Nutzer weitere Korrekturen sammeln oder die gemeinsame Aktivierung ausdrücklich
starten. Noch nicht aktive Korrekturen werden über einen deterministischen Fingerabdruck erkannt, auch wenn keine
externe Quelle neuer ist. Vor dem Sofortlauf schließt der Korrekturdialog, sodass Phase, Prozentwert und Laufzeit im
Datenbankblock sichtbar bleiben. Für reine Ergänzungen oder Änderungen vorhandener Korrekturen werden nur die
betroffenen Taxa gegen Master und Lightroom-Paket geprüft und anschließend durch denselben atomaren Zeiger
freigegeben. Der Vollmaster und das Lightroom-Basispaket bleiben dabei bytegenau unverändert.

`Ausgewählte Art zuweisen` schreibt alle Plug-in-Felder und die lesbaren, flachen `(FN)`-Stichwörter auf sämtliche
aktuell markierten Fotos. Vor dem Lightroom-Schreibzugriff wird aus allen sichtbaren Namen eine eindeutige
Keywordliste gebildet. Haben zwei Taxonomiestufen denselben sichtbaren Namen, wird das Keyword nur einmal erzeugt
und je Foto nur einmal hinzugefügt; der vollständige Taxonomiepfad in den Plug-in-Metadaten bleibt unabhängig davon
erhalten. Der reale Suchpaketstand enthält diesen Fall bei Austernfischer (`Haematopodidae` und `Haematopus`) sowie
Bartmeise (`Panuridae` und `Panurus`). Dabei speichert das Plug-in zusätzlich die lokalen Lightroom-Kennungen seiner
erzeugten Stichwörter. Fehler beim Erzeugen oder Hinzufügen eines Keywords beziehungsweise beim Schreiben eines
Plug-in-Felds nennen deutschen und wissenschaftlichen Artnamen, Keyword oder Arbeitsschritt sowie die Zahl der
Fotos. Nach Erfolg meldet das Fenster beispielsweise `19 Fotos wurden Bluthänfling zugewiesen.`

`Taxonomie entfernen` löscht nach Bestätigung die Plug-in-Felder und trennt auf jedem markierten Foto
die eindeutig reservierten Stichwörter mit den Endungen `(FN)` und `(FN)*`. Die Rücknahme rekonstruiert die bei der
Zuweisung verwendeten Namen aus den noch vorhandenen Plug-in-Metadaten und prüft ergänzend rohe Stichwortobjekte,
die formatierte Stichwortanzeige sowie gespeicherte lokale Kennungen. Andere manuelle Stichwörter und alte flache
Stichwörter ohne FN-Endung bleiben erhalten. Ein manuelles Löschen einzelner Stichwörter in Lightroom entfernt
dagegen keine Plug-in-Metadaten; für eine vollständige Rücknahme ist deshalb die Plug-in-Aktion zu verwenden.
Nach Erfolg lautet die Meldung beispielsweise `Von 19 Fotos wurde die Taxonomie entfernt.` Zuweisung und
Zuweisung und Rücknahme verwenden direkt `withWriteAccessDo` innerhalb der bereits vom Aufrufer gestarteten
`LrTask`; die einzelnen SDK-Schreibaufrufe werden im Lightroom-Callback direkt ausgeführt. Ein offizieller
SDK-Timeout wartet bis zu zehn Sekunden, wenn Lightroom kurzzeitig einen anderen Schreibzugriff hält. Version
0.4.15.0 prüft danach zwingend den Callback-Abschluss und liest nach der Zuweisung die
gespeicherte `masterTaxonId` jedes Fotos zurück. Erst danach wird Erfolg gemeldet. Seit Version 0.4.21.0
aktualisieren beide Aktionen einen bereits vollständig aufgebauten Statistikindex direkt innerhalb desselben
Katalogschreibzugriffs; im Zuweisungsfenster wird weiterhin keine Statistikberechnung gestartet.

`Ausgewähltes Foto als Favoritenbild der Art markieren ...` markiert nach einer verständlichen Bestätigung genau ein
bereits taxonomisch zugeordnetes Foto als Favoritenbild seiner `masterTaxonId`. Diese Markierung dient
Sammlungen und Statistik und ist nicht das Artportrait des Arten-Explorers. Die Bilddatei wird weder kopiert noch
verändert. Existiert bereits ein anderes Favoritenbild derselben Art, fragt das Plug-in vor dem Ersetzen mit
`Ja, ersetzen` und `Nein, behalten` nach. `FN Wildlife-Sammlungen einrichten ...` erstellt beziehungsweise verwendet
den Sammlungssatz `FN Wildlife & Travel` mit genau drei intelligenten Sammlungen:

- `Art-Favoriten`: `referenceImage = yes`;
- `Taxonomie zugewiesen`: `masterTaxonId` beginnt mit dem reservierten Präfix `mtx_`;
- `Taxonomie fehlt`: Gegenmenge der Fotos, deren `masterTaxonId` mit `mtx_` beginnt.

Damit sind die beiden Taxonomiesammlungen Gegenmengen. Die zuvor verwendeten Operationen `empty` und `notEmpty`
wurden im praktischen Lightroom-Test umgekehrt ausgewertet und werden daher nicht mehr eingesetzt. Stattdessen
verwendet `Taxonomie fehlt` die SDK-Verknüpfung `exclude` auf dieselbe positive ID-Prüfung. Die Regeln verwenden
ausschließlich das vom Plug-in gesetzte Taxonomiefeld und hängen weder von Aufnahmezeit und anderen normalen
Fotometadaten noch von Lightroom-Stichwörtern ab. Die
Aktion ist wiederholbar, aktualisiert die Regeln bereits bestehender gleichnamiger Smart-Sammlungen und erzeugt
keine Dubletten. Die nicht mehr benötigten Sammlungen `5-Sterne-Tierbilder` und `Art-Referenzbilder` werden dabei
innerhalb des verwalteten Sammlungssatzes automatisch gelöscht. Gleichnamige Sammlungen außerhalb dieses Satzes
bleiben unangetastet. `Taxonomie-Statistik ...` zeigt
Foto-, Art-, Gattungs-,
Familien-, Klassen- und Favoritenbild-Zahlen, `Lifelist: X Arten`, die Taxonomie-Abdeckung, eine
Klassenübersicht sowie `Am häufigsten fotografierte Arten:` mit höchstens zehn Einträgen. Solange noch
keine Art zugewiesen ist, wird dieser Zustand ausdrücklich angezeigt.

Fehlt der persistente Index oder hat sich die Kataloggröße geändert, öffnet Version 0.4.21.0 ein nichtmodales
Fortschrittsfenster. Der Erstaufbau sortiert die Fotos stabil nach ihrer lokalen Lightroom-Kennung, liest
Plug-in-Metadaten gebündelt in 500er-Blöcken und speichert nach jeweils 5.000 Fotos einen fortsetzbaren Checkpoint
als katalogweite Plug-in-Eigenschaft. Fortschrittsaktualisierung und `LrTasks.yield()` erfolgen erst nach dem
jeweiligen `withReadAccessDo`-Block. `Pausieren`, `Fortsetzen` und das Schließen des Fensters arbeiten deshalb nur
zwischen abgeschlossenen Blöcken; Lightroom bleibt währenddessen bedienbar.

Der gespeicherte Index enthält ausschließlich Aggregate pro Art, Klasse, Familie und Gattung, keine zweite
katalogweite Fotoliste. Zuweisungs-, Rücknahme- und Favoritenbild-Aktionen ziehen den Zustand der betroffenen Fotos
innerhalb desselben Lightroom-Schreibzugriffs ab und fügen den neuen Zustand hinzu. Sie lösen damit keinen
Katalogscan aus. Eine veränderte Gesamtzahl der Fotos macht den Index beim nächsten Öffnen ungültig. Das SDK bietet
keinen allgemeinen Beobachter für beliebige Änderungen an Foto- oder Plug-in-Metadaten; nach solchen Änderungen
außerhalb der Plug-in-Aktionen bleibt deshalb `Index neu aufbauen` der kontrollierte Abgleich. Bewertungen sind für
diese Statistik nicht relevant. Das alleinige manuelle Löschen sichtbarer Stichwörter hebt eine
Taxonomiezuweisung nicht auf, weil
die stabilen Plug-in-Metadaten dabei erhalten bleiben; dafür ist `Taxonomie entfernen` zu verwenden. Bereits mit
einer älteren Plug-in-Version
zugewiesene Fotos erhalten Klasse, Familie und Gattung erst bei einer erneuten kontrollierten Zuweisung.

Im Zusatzmodul-Manager zeigt das Plug-in seine Version, Verfügbarkeit, Taxazahl, Masterstand und Pfad des
read-only Suchpakets. Datenbankstand, Aktualisierung, Backup und Rollback werden dort bewusst nicht dupliziert,
sondern zentral im Arten-Explorer verwaltet.

## Installation für den kontrollierten Abnahmetest

1. In Lightroom Classic einen separaten Testkatalog und mindestens zwei entbehrliche Testbilder öffnen.
2. `Datei > Zusatzmodul-Manager` öffnen.
3. Das Verzeichnis
   `D:\IUCN_Datenbank\lightroom-plugin\FNWildlifeTaxonomy.lrplugin` hinzufügen.
4. Das Zusatzmodul im Manager neu laden und prüfen, dass Version `0.4.21.0`, der Suchpaketstatus sowie die fünf
   Menüaktionen ohne
   Lua-Fehler erscheinen.
5. In der Bibliothek ein Testfoto markieren und
   `Bibliothek > Zusatzmoduloptionen > Taxonomie zuweisen` wählen.
6. Im Zuweisungsfenster Dateiname beziehungsweise `1 Foto ausgewählt`, die vier gerahmten Schritte und den Hinweis
   `Lokale Masterdatenbank bereit` prüfen. Eine Art über `Art suchen` und anschließend durch 0,5 Sekunden
   Eingabepause suchen, Vorschau kontrollieren, zuweisen und
   lesbare Schlüsselwörter sowie vollständige Plug-in-Felder prüfen. Danach die Auswahl bei geöffnetem Fenster
   wechseln und die aktualisierte Einzelanzeige prüfen. Beim Öffnen und nach der Zuweisung darf keine Lifelist-
   oder Statistikberechnung im Zuweisungsfenster starten.
7. Dieselbe Prüfung mit mehreren gleichzeitig ausgewählten Testfotos wiederholen; oben muss ausschließlich
   `X Fotos ausgewählt` stehen. Nach der Zuweisung muss `X Fotos wurden <Deutscher Name> zugewiesen.` erscheinen,
   nach der Rücknahme `Von X Fotos wurde die Taxonomie entfernt.` Austernfischer und Bartmeise gezielt zuweisen und
   prüfen, dass die jeweils doppelt benannte Familien-/Gattungsstufe nur ein `(FN)`-Keyword je Foto erzeugt.
8. Nach einer geladenen Art den Suchtext ändern und sofort die Zuweisung versuchen. Die alte Art darf nicht still
   zugewiesen werden. Zusätzlich einen Konfliktfall mit einer abweichenden vorhandenen `masterTaxonId` prüfen; das
   Plug-in muss blockieren.
9. Eine Zuweisung über `Taxonomie entfernen` zurücknehmen. Die Aktion über `Plug-in-Extras` beziehungsweise
   `Bibliothek > Zusatzmoduloptionen` aufrufen. Ein eigener Eintrag im normalen Foto-Rechtsklickmenü wird nicht
   vorausgesetzt. Plug-in-Metadaten und Stichwörter mit `(FN)` beziehungsweise `(FN)*` müssen auf allen markierten
   Fotos verschwinden, vorhandene manuelle Stichwörter müssen erhalten bleiben;
   Statistik und intelligente Sammlungen müssen nach Neuberechnung denselben Zustand zeigen.
10. Für eine zugewiesene Art nacheinander zwei Fotos als Favoritenbild der Art markieren, die Ersetzungswarnung
    einmal mit `Nein, behalten` und einmal mit `Ja, ersetzen` prüfen. Danach darf nur das zuletzt bestätigte Foto
    `Favoritenbild der Art = Ja` besitzen.
11. `FN Wildlife-Sammlungen einrichten ...` zweimal ausführen und prüfen, dass nur ein Sammlungssatz mit den drei
    intelligenten Sammlungen `Art-Favoriten`, `Taxonomie fehlt` und `Taxonomie zugewiesen` vorhanden ist. Frühere
    Sammlungen `5-Sterne-Tierbilder` und `Art-Referenzbilder` müssen aus diesem Satz entfernt sein. Bei 132 Fotos
    mit zwei Taxonomiezuweisungen müssen `Taxonomie fehlt` 130 und `Taxonomie zugewiesen` zwei Fotos enthalten.
12. `Taxonomie-Statistik ...` öffnen. Beim ersten Aufruf den sichtbaren 500er-Fortschritt prüfen, einmal pausieren,
    das Fenster schließen und anschließend fortsetzen. Danach Lifelist, Abdeckung, Favoritenbilder und die höchstens
    zehn am häufigsten fotografierten Arten prüfen. Vögel beziehungsweise eine andere vorhandene Klasse aufklappen;
    jede enthaltene Art muss mit deutschem, wissenschaftlichem Namen und Fotoanzahl erscheinen. Die Lifelist als
    UTF-8-CSV exportieren und Spalten, Umlaute, Fotozahlen sowie Art-Favorit kontrollieren. Anschließend eine
    Zuweisung, Rücknahme und Favoritenänderung ausführen: Die Anzeige muss ohne vollständigen Neuaufbau stimmen.
13. Im Metadatenbedienfeld nacheinander `FN Wildlife – Foto & Taxonomie` und
    `FN Wildlife – vollständige Taxonomie` wählen. Die kompakte Ansicht muss Standard-Fotodaten, Namen und wichtige
    Ränge zeigen, die vollständige Ansicht alle vorhandenen Ränge; interne IDs dürfen in keiner Ansicht erscheinen.
14. Für eine Art `Artbezeichnung korrigieren ...` wählen, die eindeutige Vorbelegung im Explorer prüfen, eine neue
    begründete Korrektur speichern und `Datenbank jetzt aktualisieren` wählen. Der Korrekturdialog muss sich vor dem
    Lauf schließen; Prüf- und Aktivierungsphase müssen sichtbar werden. Nach wenigen Sekunden muss eine neue
    Lightroom-Suche den korrigierten Namen liefern, ohne dass die große Master- oder Paketdatei neu aufgebaut wurde.
    Eine bereits vor der Aktivierung im Zuweisungsfenster geladene Art muss wegen der geänderten Korrekturrevision
    vor einer Zuweisung erneut gesucht werden. Für `Sciurus vulgaris` muss die Vorschau weiterhin den im Master
    vorhandenen vollständigen Hierarchiepfad enthalten.
15. Lightroom neu starten und prüfen, dass Zuordnung, Schlüsselwörter, Favoritenbild der Art und Sammlungen erhalten
    bleiben.

Dieser Test darf nicht am persönlichen Produktivkatalog beginnen. Erst nach dem bestandenen Testkataloglauf gilt der
Lightroom-Schreibvertrag als praktisch bestätigt.

## Verifizierter und offener Umfang

Automatisch verifiziert sind:

- vollständiger Fixture- und realer Paketaufbau;
- Schema-, Zähler-, Prüfsummen- und Integritätsprüfung;
- Offline-Suche und Taxondetails;
- atomare Aktivierung und isolierter Rollbacktest;
- Suchhelfer im Datei- und Dauerprozessmodus;
- Plug-in-Manifest, Modulgrenzen und Verbot direkter `.lrcat`-/XMP-/SQLite-Zugriffe;
- vollständige Hierarchie in Plug-in-Metadaten, Mehrfachzuweisung, Rücknahme und Konfliktsperre im Lua-Vertrag;
- schwebendes, gerahmtes Vier-Schritt-Zuweisungsfenster mit Suchpaket-, Einzelfenster-, Auswahlwechsel- und
  Verlaufskontrakt sowie Einzelfoto-/Mehrfachauswahlanzeige, ohne Statistikstart, mit Suchbutton, verzögerter
  automatischer Suche, sofortiger Entwertung alter Treffer und Sicherheitsbestätigung;
- lesbare, längenbegrenzte und vor dem Schreibzugriff deduplizierte `(FN)`-Stichwörter, vollständige Rang-
  Metadaten, kontextreiche Schreibfehler sowie Callback- und Metadatenverifikation des Write-Access;
- kompakte und vollständige Metadatenansicht sowie kompakte Suchpaketinformation im Zusatzmodul-Manager;
- eindeutige, bestätigungspflichtige Markierung eines Favoritenbilds der Art, idempotente Sammlungsdefinitionen sowie
  den persistenten, inkrementellen und fortsetzbaren Statistikindex einschließlich Lifelist-CSV, aufklappbarer
  Klassen, Abdeckung und häufigsten Arten;
- abgesicherte einmalige Lightroom-Explorer-Korrekturübergabe, revisionsbasierte Erkennung noch nicht eingebauter
  Korrekturen, gemeinsame atomare Aktivierung einer kleinen Korrekturschicht ohne Basisneubau und kombinierter
  Hierarchieexport aus vollständigem Anbieterfallback und ausgewählten Masterwerten.

Einzel- und Mehrfachzuweisung, Suche per Button, Fensterbreite und -höhe, die frühere Lifelist-Anzeige,
Favoritenersetzungswarnung sowie die Rücknahme von `(FN)`- und `(FN)*`-Stichwörtern wurden mit den vorherigen
Plug-in-Ständen im vorbereiteten Lightroom-Testkatalog praktisch geprüft. Version 0.4.10.0 entfernte die Lifelist-
Berechnung aus dem Zuweisungsfenster, deduplizierte sichtbare Keywordnamen und verbesserte Auswahl- und
Erfolgsmeldungen, beschädigte aber durch normale Lua-`pcall`-Grenzen den yieldenden Schreibpfad. Version 0.4.11.0
ersetzte die Task-Grenze, konnte jedoch wegen des optionalen Timeouts einen nicht ausgeführten Schreibcallback als
Erfolg melden. Version 0.4.15.0 ergänzt zum direkten Write-Access-Aufruf den vom SDK vorgesehenen Zehn-Sekunden-
Timeout und prüft danach Callback-Abschluss sowie gespeicherte `masterTaxonId`; die Zuweisung wurde praktisch
bestätigt. Version 0.4.16.0 verlagert den Auswahl-Refresh in eine kurze `LrTask`; dies wurde praktisch bestätigt.
Version 0.4.17.0 verlagert den Statistik-Yield aus dem SDK-Lesecallback. Version 0.4.21.0 ersetzt den verwerfbaren
Ergebniscache durch den kataloggebundenen Aggregatindex und benötigt noch den praktischen Großkatalogtest. Am
2026-08-28 wurden außerdem die komplementären Sammlungsregeln von
Version 0.4.9.0 bei 132 Fotos und genau einer Taxonomiezuweisung praktisch mit `Taxonomie fehlt = 131` und
`Taxonomie zugewiesen = 1` bestätigt. Die Sammlungs- und Statistikverträge sind automatisiert abgesichert.

## Bekannte Einschränkungen und offene Punkte

- Die erneute Prüfung am 2026-08-28 gegen den offiziellen Adobe-SDK-Leitfaden bestätigt nur
  `LrExportMenuItems`, `LrLibraryMenuItems` und `LrHelpMenuItems` für die jeweiligen `Plug-in-Extras`-Untermenüs.
  Eine dokumentierte Erweiterung des normalen Foto-Rechtsklickmenüs existiert dort nicht. Die Aktionen bleiben
  über `Plug-in-Extras` beziehungsweise `Bibliothek > Zusatzmoduloptionen` erreichbar. Eine spätere Änderung darf
  erst nach einem neuen SDK-Nachweis erfolgen.
- Der offizielle SDK-Leitfaden beschreibt Enter/Return nur als Aufruf des vom umgebenden Dialog bereitgestellten
  Standardbuttons. Der praktische Test von Version 0.4.4.0 zeigt, dass dieser Weg im dauerhaft geöffneten
  `presentFloatingDialog` nicht greift. Für `edit_field` ist kein eigener Enter-/Keydown-Callback dokumentiert;
  ein Property-Observer erkennt Textänderungen, aber keine Enter-Taste bei unverändertem Text. Version 0.4.9.0
  entfernt deshalb die wirkungslose, nicht dokumentierte `is_default`-Annahme. Die Suche bleibt über
  `Art suchen` verfügbar; Version 0.4.19.0 umgeht die Enter-Grenze zusätzlich durch dieselbe automatische Suche nach
  0,5 Sekunden Eingabepause. Ein erzwungener Tastatur-Hook wird nicht eingebaut.
- Der dokumentierte `presentFloatingDialog`-Vertrag bietet keine Option, das schwebende Fenster nur relativ zu
  Lightroom, nicht aber gegenüber anderen Windows-Anwendungen im Vordergrund zu halten. `toFront()` wird nur bei
  erneutem Aufruf der Plug-in-Aktion verwendet. Das sonstige Vordergrundverhalten bestimmt Lightroom; eine
  undokumentierte Windows- oder SDK-Funktion wird nicht ergänzt.
- Der Lightroom-SDK-Vertrag dokumentiert Auswahl- und Quellenbeobachter für schwebende Dialoge, aber keinen
  allgemeinen Beobachter für beliebige Foto-, Katalog- oder Plug-in-Metadatenänderungen. Der Statistikindex wird
  deshalb bei allen eigenen Schreibaktionen sofort aktualisiert, erkennt eine geänderte Kataloggröße und bietet für
  sonstige externe Änderungen ausdrücklich `Index neu aufbauen`; eine nicht belegte Hintergrundbeobachtung wird
  nicht vorgetäuscht.
- Die Taxonomievorschau verwendet wegen der begrenzten und versionsabhängigen Layoutsteuerung des Lightroom-SDK
  eine feste Höhe von 150 Pixeln. Ihre Breite ist an das Fenster gekoppelt; eine zuverlässige dynamische Höhe nach
  exakt vorhandener Zeilenzahl wird nicht vorausgesetzt.
- Der Favoriten-Ersetzungsdialog zeigt bewusst nur den verständlichen Arttext. Bildvorschauen und Dateinamen wurden
  nicht verwendet, weil sie in diesem Dialog nicht zuverlässig beziehungsweise nicht lesbar genug waren.
- Alte flache Taxonomie-Stichwörter ohne `(FN)`-Endung sind nicht eindeutig vom Nutzerbestand unterscheidbar und
  werden deshalb nicht automatisch gelöscht. Andere frühere Smart-Sammlungen mit unbekannten abweichenden Namen
  werden ebenfalls nicht automatisch entfernt; die beiden bekannten Alt-Sammlungen `5-Sterne-Tierbilder` und
  `Art-Referenzbilder` werden dagegen innerhalb des verwalteten Satzes automatisch bereinigt.
- Der automatische Suchpaketbau benötigt lokal vorübergehend Platz für den neuen Staging-Stand zusätzlich zum
  aktiven und gegebenenfalls vorherigen Paket. Bei einem Fehler bleibt das alte Paket nutzbar, die korrigierten
  Namen stehen Lightroom aber erst nach dem erfolgreichen Wiederholungslauf zur Verfügung.
- Das Zurücksetzen einer Korrektur, die bereits in einem früheren vollständigen Masterstand als ausgewählter
  manueller Wert eingebaut wurde, kann nicht allein durch Weglassen in einer kleinen Überlagerung rückgängig gemacht
  werden. Der Schnellweg erkennt diesen Fall und verweigert eine scheinbare Teilaktivierung; dafür bleibt der
  vollständige Kandidaten- und Paketneuaufbau erforderlich. Neue Korrekturen und Änderungen weiterhin vorhandener
  Korrekturen verwenden den Sekundenpfad.
- Phase 10 ist nicht abgeschlossen. Vor dem Abschluss folgen das umfassende Audit nach
  `docs/documentation-lifecycle.md` und die darin vorgesehenen übergreifenden Regressions-, Betriebs-, Backup- und
  Wiederherstellungsprüfungen.

SDK-Nachweis: [Adobe Lightroom Classic SDK Guide](https://ioconsolerykerprodcdn.azureedge.net/static/installers/lr/sdk/2022/cross_platform/v13/doc/Lightroom%20Classic%20SDK%20Guide_1655133965.pdf),
insbesondere die Abschnitte zu Plug-in-Menüeinträgen und `edit_field`-Steuerelementen.

## Betriebs- und Sicherungsgrenze

Das Suchpaket ist abgeleitet und kann jederzeit aus dem aktiven Master neu erzeugt werden. Es gehört daher nicht in
Git, GitHub Pages oder normale Projektbackups. `previous` ist der lokale schnelle Rollback. Unersetzbar und zu
sichern bleiben Masterdatenbank, eigene Taxonomiekorrekturen, Projektverknüpfungen und später die normalen
Lightroom-Katalogbackups. Die Einbindung in Installer, NAS und Mehrgerätebetrieb bleibt Phase 11.
