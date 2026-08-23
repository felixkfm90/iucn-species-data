# Lightroom-Suchpaket und FN-Wildlife-Plug-in

Stand: 2026-08-23
Roadmap: Phase 10.2 bis 10.4
Status: Suchpaket und Plug-in Version 0.4.0 sind automatisiert verifiziert; Einzel- und Mehrfachzuweisung wurden im
vorbereiteten Lightroom-Testkatalog praktisch bestätigt, die neuen 0.4.0-Bedienfunktionen benötigen nach dem
Neuladen noch die gemeinsame Sichtprüfung

## Ziel

Lightroom Classic soll die vollständige aktive Taxonomie-Masterdatenbank offline durchsuchen können, ohne dass der
Arten-Explorer läuft und ohne dass Lightroom die fachlichen Stammdaten verändert. Eine ausgewählte Art kann nach
sichtbarer Prüfung einem oder mehreren gleichzeitig markierten Fotos zugewiesen werden. Geschrieben werden nur
hierarchische Lightroom-Schlüsselwörter und stabile Plug-in-Metadaten über das offizielle Lightroom-SDK.

## Architektur

```text
aktive Taxonomie-Masterdatenbank (read-only)
  -> abgeleitetes Lightroom-Suchpaket
     -> taxonomy-search.sqlite + manifest.json
     -> active / previous / staging
  -> read-only Node-Suchhelfer
  -> deutsches Lua-Plug-in
  -> Lightroom-SDK
     -> hierarchische Schlüsselwörter
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

Das Plug-in trägt die Version `0.4.0`. Enthalten sind:

- `Info.lua`: Manifest, SDK-Grenze und deutscher Bibliotheksmenüpunkt;
- `MetadataDefinition.lua`: stabile Plug-in-Metadatenfelder für Namen, Status und alle unterstützten
  Taxonomieränge;
- `MetadataTagset.lua`: die aufgeräumte Metadatenansicht `FN Wildlife – Foto & Taxonomie` mit sinnvollen
  Standard-Fotofeldern und den lesbaren fachlichen Plug-in-Feldern;
- `TaxonomyRanks.lua`: eine gemeinsame Rangdefinition für Vorschau, Metadaten, Schlüsselwörter und Statistik;
- `TaxonomyHelper.lua`: Aufruf des read-only Suchhelfers; unter Windows wird eine vorhandene Node-Installation
  auch dann automatisch unter den üblichen Installationspfaden gefunden, wenn Lightroom den System-`PATH` nicht
  vollständig übernimmt. Der lokale Suchpaketpfad wird unabhängig von Lightroom-Prozessvariablen explizit
  übergeben. Ein fehlgeschlagener Hilfsprozess liefert eine begrenzte technische Diagnose statt einer
  abgeschnittenen Sammelmeldung;
- `Json.lua`: gekapselter JSON-Codec für die Kommunikation mit dem Suchhelfer;
- `KeywordWriter.lua`: vollständige fachliche Metadaten, eine ausschließlich aus lesbaren Taxonnamen bestehende
  Schlüsselworthierarchie, Einzel-/Mehrfachzuweisung und kontrollierte Rücknahme;
- `AssignTaxonomy.lua` und `AssignmentWindow.lua`: dauerhaft geöffnetes, in vier gerahmte Arbeitsschritte
  gegliedertes Zuweisungsfenster mit Dateiname beziehungsweise `+ X weitere`, Lifelist-Zähler, geprüftem
  Suchpaketstatus, Suche per Button oder Eingabetaste, Taxonomievorschau, Konfliktprüfung, kontrollierter Rücknahme
  und den zehn zuletzt verwendeten Arten;
- `PluginState.lua`: ausschließlich lokale Bedienzustände und der verwerfbare Statistikcache;
- `ReferenceImage.lua` und `SetReferenceImage.lua`: genau ein kontrolliertes bevorzugtes Artbild je
  Master-Taxon-ID;
- `SmartCollections.lua` und `CreateCollections.lua`: wiederholbar einrichtbare intelligente Sammlungen;
- `Statistics.lua` und `ShowStatistics.lua`: Katalogstatistik mit Lifelist, Klassenübersicht und manuell
  aktualisierbarem Cache;
- `PluginInfoProvider.lua`: kompakte Version und read-only Statusanzeige des lokalen Suchpakets im
  Zusatzmodul-Manager.

Der Prototyp sucht in der vollständigen lokalen Masterableitung und nicht nur in bereits angelegten Explorer-Arten.
Vor der Zuweisung zeigt er deutsche, englische und wissenschaftliche Namen sowie alle verfügbaren Taxonomiestufen.
Ein Foto mit einer abweichenden vorhandenen `masterTaxonId` wird nicht still überschrieben.

Schlüsselwortwurzel:

```text
FN Wildlife & Travel
  Taxonomie
    Tiere
      Chordatiere
        ...
```

Die Schlüsselwörter sind für die normale Bildsuche gedacht und enthalten deshalb weder interne Kennungen noch
technische Rangpräfixe. Fehlende Ränge werden ausgelassen; Zwischenränge werden in fachlicher Reihenfolge
übernommen. Die vollständige strukturierte Taxonomie wird stattdessen in folgenden Plug-in-Metadaten gespeichert:

- `masterTaxonId`;
- `projectTaxonId`, sofern vorhanden;
- deutscher, englischer und wissenschaftlicher Name;
- Taxonrang;
- vollständiger Taxonomiepfad;
- Zuweisungszeitpunkt;
- alle vorhandenen Ränge von Domäne bis Form einschließlich Unter-, Über-, Infra- und Parvrängen;
- Kennzeichen `Bevorzugtes Artbild` mit den Werten `Ja` oder `Nein`.

Lightrooms eingebaute Ansicht `Standard` kann ein Plug-in nicht verändern. Deshalb stellt das Plug-in die eigene
Ansicht `FN Wildlife – Foto & Taxonomie` bereit. Sie kombiniert Dateiname, Aufnahmedatum, Abmessungen,
Urheber-/Kamera-/Objektiv-/Belichtungsdaten und GPS mit deutschen, englischen und wissenschaftlichen Namen sowie
der Taxonomie. Interne Master-/Projekt-IDs und der technische Taxonomiepfad bleiben dort ausgeblendet, stehen dem
Plug-in aber weiterhin stabil zur Verfügung. Master- oder Suchpaketversionen werden nicht auf Fotos geschrieben.

Die Menüaktion `Taxonomie zuweisen ...` öffnet ein kompaktes schwebendes Arbeitsfenster. Die vier sichtbaren Abschnitte
`Aktuelle Lightroom-Auswahl`, `Art suchen und auswählen`, `Taxonomie prüfen` und `Taxonomie verwalten` führen vom
ausgewählten Foto bis zur bewussten Katalogänderung. Oben steht bei einer Einzelwahl der Dateiname, bei einer
Mehrfachwahl der erste Dateiname mit `+ X weitere`; die Anzeige wird bei einem Auswahlwechsel im Hintergrund
aktualisiert. Daneben steht `Lifelist: X Arten`. Vor der Suche prüft das Fenster das lokale Suchpaket und zeigt
dessen verfügbaren Taxabestand an. Es bleibt beim Wechsel der Lightroom-Auswahl geöffnet und bringt ein bereits
geöffnetes Fenster erneut in den Vordergrund, statt ein zweites zu erzeugen. Der Button `Schließen` sitzt unten
rechts. Das reine Öffnen, Suchen und Vorschauen verändert keine Bildmetadaten.

`Ausgewählte Art zuweisen` schreibt alle Plug-in-Felder und die lesbare Schlüsselworthierarchie auf sämtliche
aktuell markierten Fotos. `Taxonomie entfernen` löscht nach Bestätigung genau diese Plug-in-Felder und trennt nur
die vom Plug-in unter `FN Wildlife & Travel > Taxonomie` verwalteten Stichwörter vom Foto. Ein manuelles Löschen
einzelner Stichwörter in Lightroom entfernt dagegen keine Plug-in-Metadaten; für eine vollständige Rücknahme ist
deshalb die Plug-in-Aktion zu verwenden. Zuweisung und Rücknahme verwerfen den Statistikcache automatisch.

`Ausgewähltes Foto als bevorzugtes Artbild markieren ...` markiert nach einer verständlichen Bestätigung genau ein
bereits taxonomisch zugeordnetes Foto als bevorzugtes Beispielfoto seiner `masterTaxonId`. Diese Markierung dient
Sammlungen und Statistik und ist nicht das Artportrait des Arten-Explorers. Die Bilddatei wird weder kopiert noch
verändert; ein früheres bevorzugtes Artbild derselben Art wird zurückgesetzt. `FN Wildlife-Sammlungen
einrichten ...`
erstellt beziehungsweise verwendet den Sammlungssatz `FN Wildlife & Travel` mit den intelligenten Sammlungen
`Taxonomie zugewiesen`, `Taxonomie fehlt`, `Bevorzugte Artbilder` und `5-Sterne-Tierbilder`. Die Aktion ist
wiederholbar und erzeugt keine gleichnamigen Dubletten. `Taxonomie-Statistik ...` zeigt Foto-, Art-, Gattungs-,
Familien-, Klassen- und bevorzugte-Artbild-Zahlen, `Lifelist: X Arten`, die Taxonomie-Abdeckung, eine
Klassenübersicht sowie `Am häufigsten fotografierte Arten:` mit höchstens zehn Einträgen. Solange noch
keine Art zugewiesen ist, wird dieser Zustand ausdrücklich angezeigt.

Der Statistikcache ist nur eine Beschleunigung und keine fachliche Datenquelle. Eigene Zuweisungs- und
Zuweisungs-, Rücknahme- und bevorzugte-Artbild-Aktionen machen ihn automatisch ungültig. Änderungen an Bewertungen
oder Plug-in-Feldern außerhalb
dieser Aktionen werden über `Neu berechnen` ausdrücklich neu eingelesen. Bereits mit einer älteren Plug-in-Version
zugewiesene Fotos erhalten Klasse, Familie und Gattung erst bei einer erneuten kontrollierten Zuweisung.

Im Zusatzmodul-Manager zeigt das Plug-in seine Version, Verfügbarkeit, Taxazahl, Masterstand und Pfad des
read-only Suchpakets. Datenbankstand, Aktualisierung, Backup und Rollback werden dort bewusst nicht dupliziert,
sondern zentral im Arten-Explorer verwaltet.

## Installation für den kontrollierten Abnahmetest

1. In Lightroom Classic einen separaten Testkatalog und mindestens zwei entbehrliche Testbilder öffnen.
2. `Datei > Zusatzmodul-Manager` öffnen.
3. Das Verzeichnis
   `D:\IUCN_Datenbank\lightroom-plugin\FNWildlifeTaxonomy.lrplugin` hinzufügen.
4. Das Zusatzmodul im Manager neu laden und prüfen, dass Version `0.4.0.0`, der Suchpaketstatus sowie die vier
   Menüaktionen ohne
   Lua-Fehler erscheinen.
5. In der Bibliothek ein Testfoto markieren und
   `Bibliothek > Zusatzmoduloptionen > Taxonomie zuweisen ...` wählen.
6. Im Zuweisungsfenster Dateiname, Lifelist, die vier gerahmten Schritte und den Hinweis
   `Lokale Masterdatenbank bereit` prüfen. Eine Art per Eingabetaste suchen, Vorschau kontrollieren, zuweisen und
   lesbare Schlüsselwörter sowie vollständige Plug-in-Felder prüfen. Danach die Auswahl bei geöffnetem Fenster
   wechseln und den aktualisierten Dateinamen prüfen.
7. Dieselbe Prüfung mit mehreren gleichzeitig ausgewählten Testfotos wiederholen; oben müssen der erste Dateiname
   und `+ X weitere` stehen.
8. Einen Konfliktfall mit einer abweichenden vorhandenen `masterTaxonId` prüfen; das Plug-in muss blockieren.
9. Eine Zuweisung über `Taxonomie entfernen` zurücknehmen. Plug-in-Metadaten und verwaltete Stichwörter müssen
   verschwinden; Statistik und intelligente Sammlungen müssen nach Neuberechnung denselben Zustand zeigen.
10. Für eine zugewiesene Art nacheinander zwei Fotos als bevorzugtes Artbild markieren. Danach darf nur das zuletzt
   gewählte Foto `Bevorzugtes Artbild = Ja` besitzen.
11. `FN Wildlife-Sammlungen einrichten ...` zweimal ausführen und prüfen, dass nur ein Sammlungssatz mit vier
    intelligenten Sammlungen vorhanden ist.
12. `Taxonomie-Statistik ...` öffnen, `Neu berechnen` ausführen und Lifelist, Abdeckung, Klassenübersicht,
    bevorzugte Artbilder sowie die höchstens zehn am häufigsten fotografierten Arten prüfen.
13. Im Metadatenbedienfeld `FN Wildlife – Foto & Taxonomie` wählen und die Kombination aus Standard-Fotodaten,
    Namen und Taxonomierängen prüfen; interne IDs dürfen dort nicht erscheinen.
14. Lightroom neu starten und prüfen, dass Zuordnung, Schlüsselwörter, bevorzugtes Artbild und Sammlungen erhalten
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
- vollständige Hierarchie, Mehrfachzuweisung, Rücknahme und Konfliktsperre im Lua-Vertrag;
- schwebendes, gerahmtes Vier-Schritt-Zuweisungsfenster mit Suchpaket-, Einzelfenster-, Auswahlwechsel- und
  Verlaufskontrakt sowie Dateiname, Lifelist und Suche per Eingabetaste;
- lesbare, längenbegrenzte Schlüsselwörter ohne technische Kennungen sowie vollständige Rang-Metadaten;
- eigene aufgeräumte Metadatenansicht und kompakte Suchpaketinformation im Zusatzmodul-Manager;
- eindeutige, bestätigungspflichtige Markierung eines bevorzugten Artbilds, idempotente Sammlungsdefinitionen sowie
  Statistik- und Cache-Grenzen einschließlich Lifelist, Klassen, Abdeckung und häufigsten Arten.

Einzel- und Mehrfachzuweisung sind im vorbereiteten Lightroom-Testkatalog praktisch bestätigt. Nach dem Neuladen
auf Version 0.4.0 steht noch die gemeinsame Sicht- und Bedienprüfung für dynamische Dateinamen, Suche per
Eingabetaste, kontrollierte Rücknahme, eigene Metadatenansicht, bevorzugtes Artbild, Sammlungen, Statistik und
Zusatzmodul-Manager aus. Bis zu dieser Prüfung gelten diese neuen Bedienerweiterungen als technisch verifiziert,
aber noch nicht vollständig praktisch abgenommen.

## Betriebs- und Sicherungsgrenze

Das Suchpaket ist abgeleitet und kann jederzeit aus dem aktiven Master neu erzeugt werden. Es gehört daher nicht in
Git, GitHub Pages oder normale Projektbackups. `previous` ist der lokale schnelle Rollback. Unersetzbar und zu
sichern bleiben Masterdatenbank, eigene Taxonomiekorrekturen, Projektverknüpfungen und später die normalen
Lightroom-Katalogbackups. Die Einbindung in Installer, NAS und Mehrgerätebetrieb bleibt Phase 11.
