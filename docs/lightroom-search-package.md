# Lightroom-Suchpaket und FN-Wildlife-Plug-in

Stand: 2026-08-28
Roadmap: Phase 10.2 bis 10.4
Status: Suchpaket und Plug-in Version 0.4.9.0 sind automatisiert verifiziert. Einzel- und Mehrfachzuweisung,
Zuweisungsfenster, Favoritenersetzung und das Entfernen der Taxonomie einschließlich der reservierten
FN-Stichwörter wurden im vorbereiteten Lightroom-Testkatalog praktisch geprüft. Phase 10 bleibt bis zum
umfassenden Abschlussaudit offen.

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
  -> read-only Node-Suchhelfer
  -> deutsches Lua-Plug-in
  -> Lightroom-SDK
     -> flache, mit (FN) markierte Stichwörter
     -> stabile Plug-in-Metadaten
```

Die fachliche Wahrheit bleibt die Masterdatenbank des Arten-Explorers. Das Suchpaket ist eine reproduzierbare,
unveränderliche Ableitung und keine zweite pflegbare Taxonomiedatenbank. Es enthält alle nicht veralteten Mastertaxa,
alle Suchnamen, die vollständige verfügbare Hierarchie, Status, Anbieterbelege und vorhandene Projektverknüpfungen.

Lightroom greift weder auf die interne Master-SQLite noch auf den Explorer-Server zu. Der Suchhelfer öffnet das aktive
Suchpaket ausschließlich read-only. Katalog- und XMP-Dateien werden nie direkt bearbeitet.

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
```

`staging` wird vollständig aufgebaut und geprüft. Erst danach ersetzt es atomar `active`; der zuvor aktive Stand
wandert nach `previous`. Ein Rollback tauscht `active` und `previous` kontrolliert zurück. Temporäre Rollbackproben
laufen in einem isolierten Unterordner und verändern den produktiven Zeiger nicht.

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

Schema, Zähler, Fremdschlüssel, Manifest und SHA-256-Prüfsumme wurden vollständig geprüft. Ein realer isolierter
Rollbacktest war erfolgreich; danach blieb dasselbe produktive Paket aktiv und weder `previous` noch `staging`
enthielten Prüfarbeitsstände.

Repräsentative Offline-Suchen im realen Bestand lagen lokal ungefähr zwischen 0,6 und 1,8 Millisekunden:

- `Eurasisches Eichhörnchen` -> `Sciurus vulgaris`, Status CoL-Referenzlücke;
- `Lilac-breasted Roller` -> `Coracias caudatus`;
- `Coracias caudatus`;
- `Dunlin` -> `Calidris alpina`;
- `Panthera pardus` -> `Leopard`.

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

Das Plug-in trägt die Version `0.4.9.0`. Jede Änderung an einer Plug-in-Datei erhöht diese Version in `Info.lua`
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
  abgeschnittenen Sammelmeldung;
- `Json.lua`: gekapselter JSON-Codec für die Kommunikation mit dem Suchhelfer;
- `KeywordWriter.lua`: vollständige fachliche Metadaten, flache und eindeutig mit `(FN)` markierte Stichwörter,
  gespeicherte lokale Kennungen, Einzel-/Mehrfachzuweisung und kontrollierte Rücknahme einschließlich `(FN)*`;
- `AssignTaxonomy.lua` und `AssignmentWindow.lua`: dauerhaft geöffnetes, in vier gerahmte Arbeitsschritte
  gegliedertes Zuweisungsfenster mit Dateiname beziehungsweise `+ X weitere`, Lifelist-Zähler, geprüftem
  Suchpaketstatus, Taxonomievorschau, Konfliktprüfung, kontrollierter Rücknahme und den zehn zuletzt verwendeten
  Arten. Die Suche wird ausdrücklich über `Art suchen` ausgelöst;
- `RemoveTaxonomy.lua`: eigenständige Rücknahmeaktion über `Plug-in-Extras` beziehungsweise
  `Bibliothek > Zusatzmoduloptionen`;
- `PluginState.lua`: ausschließlich lokale Bedienzustände und der verwerfbare Statistikcache;
- `ReferenceImage.lua` und `SetReferenceImage.lua`: genau ein kontrolliertes `Favoritenbild der Art` je
  Master-Taxon-ID;
- `SmartCollections.lua` und `CreateCollections.lua`: wiederholbar einrichtbare intelligente Sammlungen;
- `Statistics.lua` und `ShowStatistics.lua`: Katalogstatistik mit Lifelist, Klassenübersicht und manuell
  aktualisierbarem Cache;
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
Mehrfachwahl der erste Dateiname mit `+ X weitere`; die Anzeige wird bei einem Auswahlwechsel im Hintergrund
aktualisiert. Daneben steht `Lifelist: X Arten`. Vor der Suche prüft das Fenster das lokale Suchpaket und zeigt
dessen verfügbaren Taxabestand an. Es bleibt beim Wechsel der Lightroom-Auswahl geöffnet und bringt ein bereits
geöffnetes Fenster erneut in den Vordergrund, statt ein zweites zu erzeugen. Der Button `Schließen` sitzt unten
rechts. Das reine Öffnen, Suchen und Vorschauen verändert keine Bildmetadaten.

`Ausgewählte Art zuweisen` schreibt alle Plug-in-Felder und die lesbaren, flachen `(FN)`-Stichwörter auf sämtliche
aktuell markierten Fotos. Dabei speichert das Plug-in zusätzlich die lokalen Lightroom-Kennungen seiner erzeugten
Stichwörter. `Taxonomie entfernen` löscht nach Bestätigung die Plug-in-Felder und trennt auf jedem markierten Foto
die eindeutig reservierten Stichwörter mit den Endungen `(FN)` und `(FN)*`. Die Rücknahme rekonstruiert die bei der
Zuweisung verwendeten Namen aus den noch vorhandenen Plug-in-Metadaten und prüft ergänzend rohe Stichwortobjekte,
die formatierte Stichwortanzeige sowie gespeicherte lokale Kennungen. Andere manuelle Stichwörter und alte flache
Stichwörter ohne FN-Endung bleiben erhalten. Ein manuelles Löschen einzelner Stichwörter in Lightroom entfernt
dagegen keine Plug-in-Metadaten; für eine vollständige Rücknahme ist deshalb die Plug-in-Aktion zu verwenden.
Zuweisung und Rücknahme verwerfen den Statistikcache automatisch.

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

Der Statistikcache ist nur eine Beschleunigung und keine fachliche Datenquelle. Zuweisungs-, Rücknahme- und
Favoritenbild-Aktionen machen ihn automatisch ungültig. Die Statistik liest die Zuordnungen direkt aus dem
Lightroom-Katalog; ein erneuter Import oder ein Update der Taxonomie-Masterdatenbank ist dafür nicht erforderlich.
Änderungen an Bewertungen oder Plug-in-Feldern außerhalb dieser Aktionen werden über `Neu berechnen` ausdrücklich
neu eingelesen. Das alleinige manuelle Löschen sichtbarer Stichwörter hebt eine Taxonomiezuweisung nicht auf, weil
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
4. Das Zusatzmodul im Manager neu laden und prüfen, dass Version `0.4.9.0`, der Suchpaketstatus sowie die fünf
   Menüaktionen ohne
   Lua-Fehler erscheinen.
5. In der Bibliothek ein Testfoto markieren und
   `Bibliothek > Zusatzmoduloptionen > Taxonomie zuweisen` wählen.
6. Im Zuweisungsfenster Dateiname, Lifelist, die vier gerahmten Schritte und den Hinweis
   `Lokale Masterdatenbank bereit` prüfen. Eine Art über `Art suchen` suchen, Vorschau kontrollieren, zuweisen und
   lesbare Schlüsselwörter sowie vollständige Plug-in-Felder prüfen. Danach die Auswahl bei geöffnetem Fenster
   wechseln und den aktualisierten Dateinamen prüfen.
7. Dieselbe Prüfung mit mehreren gleichzeitig ausgewählten Testfotos wiederholen; oben müssen der erste Dateiname
   und `+ X weitere` stehen.
8. Einen Konfliktfall mit einer abweichenden vorhandenen `masterTaxonId` prüfen; das Plug-in muss blockieren.
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
12. `Taxonomie-Statistik ...` öffnen, `Neu berechnen` ausführen und Lifelist, Abdeckung, Klassenübersicht,
    Favoritenbilder sowie die höchstens zehn am häufigsten fotografierten Arten prüfen.
13. Im Metadatenbedienfeld nacheinander `FN Wildlife – Foto & Taxonomie` und
    `FN Wildlife – vollständige Taxonomie` wählen. Die kompakte Ansicht muss Standard-Fotodaten, Namen und wichtige
    Ränge zeigen, die vollständige Ansicht alle vorhandenen Ränge; interne IDs dürfen in keiner Ansicht erscheinen.
14. Lightroom neu starten und prüfen, dass Zuordnung, Schlüsselwörter, Favoritenbild der Art und Sammlungen erhalten
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
  Verlaufskontrakt sowie Dateiname, Lifelist und ausdrücklich betätigtem Suchbutton;
- lesbare, längenbegrenzte `(FN)`-Stichwörter sowie vollständige Rang-Metadaten;
- kompakte und vollständige Metadatenansicht sowie kompakte Suchpaketinformation im Zusatzmodul-Manager;
- eindeutige, bestätigungspflichtige Markierung eines Favoritenbilds der Art, idempotente Sammlungsdefinitionen sowie
  Statistik- und Cache-Grenzen einschließlich Lifelist, Klassen, Abdeckung und häufigsten Arten.

Einzel- und Mehrfachzuweisung, Suche per Button, Fensterbreite und -höhe, Lifelist-Anzeige,
Favoritenersetzungswarnung sowie die Rücknahme von `(FN)`- und `(FN)*`-Stichwörtern wurden im vorbereiteten
Lightroom-Testkatalog praktisch geprüft. Am 2026-08-28 wurden außerdem die komplementären Sammlungsregeln von
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
  `Art suchen` verfügbar. Ein erzwungener Tastatur-Hook wird nicht eingebaut.
- Die Taxonomievorschau verwendet wegen der begrenzten und versionsabhängigen Layoutsteuerung des Lightroom-SDK
  eine feste Höhe von 150 Pixeln. Ihre Breite ist an das Fenster gekoppelt; eine zuverlässige dynamische Höhe nach
  exakt vorhandener Zeilenzahl wird nicht vorausgesetzt.
- Der Favoriten-Ersetzungsdialog zeigt bewusst nur den verständlichen Arttext. Bildvorschauen und Dateinamen wurden
  nicht verwendet, weil sie in diesem Dialog nicht zuverlässig beziehungsweise nicht lesbar genug waren.
- Alte flache Taxonomie-Stichwörter ohne `(FN)`-Endung sind nicht eindeutig vom Nutzerbestand unterscheidbar und
  werden deshalb nicht automatisch gelöscht. Andere frühere Smart-Sammlungen mit unbekannten abweichenden Namen
  werden ebenfalls nicht automatisch entfernt; die beiden bekannten Alt-Sammlungen `5-Sterne-Tierbilder` und
  `Art-Referenzbilder` werden dagegen innerhalb des verwalteten Satzes automatisch bereinigt.
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
