# Lightroom-Suchpaket und erster Plug-in-Prototyp

Stand: 2026-08-14
Roadmap: Phase 10.2 bis 10.4
Status: Suchpaket, Plug-in-Kern und ausgewählte Bedienerweiterungen sind automatisiert verifiziert; die kontrollierte
Schreib- und Bedienabnahme im bereits vorbereiteten Lightroom-Testkatalog steht noch aus

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

## Plug-in-Prototyp

Versionierter Pfad:

```text
lightroom-plugin/FNWildlifeTaxonomy.lrplugin/
```

Das Plug-in trägt die Version `0.3.4`. Enthalten sind:

- `Info.lua`: Manifest, SDK-Grenze und deutscher Bibliotheksmenüpunkt;
- `MetadataDefinition.lua`: stabile Plug-in-Metadatenfelder;
- `TaxonomyHelper.lua`: Aufruf des read-only Suchhelfers; unter Windows wird eine vorhandene Node-Installation
  auch dann automatisch unter den üblichen Installationspfaden gefunden, wenn Lightroom den System-`PATH` nicht
  vollständig übernimmt. Der lokale Suchpaketpfad wird unabhängig von Lightroom-Prozessvariablen explizit
  übergeben. Ein fehlgeschlagener Hilfsprozess liefert eine begrenzte technische Diagnose statt einer
  abgeschnittenen Sammelmeldung;
- `Json.lua`: gekapselter JSON-Codec für die Kommunikation mit dem Suchhelfer;
- `KeywordWriter.lua`: vollständige Hierarchie- und Namensschlüsselwörter sowie Mehrfachzuweisung;
- `AssignTaxonomy.lua` und `AssignmentWindow.lua`: dauerhaft geöffnetes, in vier gerahmte Arbeitsschritte
  gegliedertes Zuweisungsfenster mit aktueller Lightroom-Auswahl, geprüftem Suchpaketstatus, Suche,
  Taxonomievorschau, Konfliktprüfung und den zehn zuletzt verwendeten Arten;
- `PluginState.lua`: ausschließlich lokale Bedienzustände und der verwerfbare Statistikcache;
- `ReferenceImage.lua` und `SetReferenceImage.lua`: genau ein kontrolliertes Referenzbild je Master-Taxon-ID;
- `SmartCollections.lua` und `CreateCollections.lua`: wiederholbar einrichtbare intelligente Sammlungen;
- `Statistics.lua` und `ShowStatistics.lua`: Katalogstatistik mit manuell aktualisierbarem Cache.

Der Prototyp sucht in der vollständigen lokalen Masterableitung und nicht nur in bereits angelegten Explorer-Arten.
Vor der Zuweisung zeigt er deutsche, englische und wissenschaftliche Namen sowie alle verfügbaren Taxonomiestufen.
Ein Foto mit einer abweichenden vorhandenen `masterTaxonId` wird nicht still überschrieben.

Schlüsselwortwurzel:

```text
FN Wildlife & Travel
  Taxonomie
    Reich: Tiere (Animalia)
      Stamm: Chordatiere (Chordata)
        ...
  Artnamen
    Deutsch
    Englisch
    Wissenschaftlich
```

Fehlende Ränge werden ausgelassen; Zwischenränge werden in fachlicher Reihenfolge übernommen. Zusätzlich schreibt
das Plug-in folgende eigene Felder:

- `masterTaxonId`;
- `projectTaxonId`, sofern vorhanden;
- deutscher, englischer und wissenschaftlicher Name;
- Taxonrang;
- vollständiger Taxonomiepfad;
- Zuweisungszeitpunkt;
- Klasse, Familie und Gattung für Sammlungen und Statistik;
- Kennzeichen `Art-Referenzbild` mit den Werten `Ja` oder `Nein`.

Die Menüaktion `Taxonomie zuweisen ...` öffnet ein kompaktes schwebendes Arbeitsfenster. Die vier sichtbaren Abschnitte
`Aktuelle Lightroom-Auswahl`, `Art suchen und auswählen`, `Taxonomie prüfen` und `Taxonomie zuweisen` führen vom
ausgewählten Foto bis zur bewussten Katalogänderung. Vor der Suche prüft das Fenster das lokale Suchpaket und zeigt
dessen verfügbaren Taxabestand an. Es bleibt beim Wechsel der Lightroom-Auswahl geöffnet, zeigt die Anzahl und den
Zuordnungszustand der aktuell markierten Fotos und bringt ein bereits geöffnetes Fenster erneut in den Vordergrund,
statt ein zweites zu erzeugen. Die Arbeitsfläche nutzt die Fensterbreite und besitzt neben dem Fensterschalter einen
am unteren rechten Fensterrand verankerten Button `Schließen`. Das reine Öffnen, Suchen und Vorschauen verändert
keine Bildmetadaten.

`Ausgewähltes Foto als Art-Referenzbild festlegen ...` markiert nach einer verständlichen Bestätigung genau ein
bereits taxonomisch zugeordnetes Foto als bevorzugtes Beispielfoto seiner `masterTaxonId`. Die Bilddatei wird weder
kopiert noch verändert; ein früheres Referenzbild derselben Art wird zurückgesetzt. `FN Wildlife-Sammlungen
einrichten ...`
erstellt beziehungsweise verwendet den Sammlungssatz `FN Wildlife & Travel` mit den intelligenten Sammlungen
`Taxonomie zugewiesen`, `Taxonomie fehlt`, `Art-Referenzbilder` und `5-Sterne-Tierbilder`. Die Aktion ist
wiederholbar und erzeugt keine gleichnamigen Dubletten. `Taxonomie-Statistik ...` zeigt Foto-, Art-, Gattungs-,
Familien-, Klassen- und Referenzbildzahlen, die Taxonomie-Abdeckung sowie `Am häufigsten fotografierte Arten:` mit
höchstens zehn Einträgen. Solange noch
keine Art zugewiesen ist, wird dieser Zustand ausdrücklich angezeigt.

Der Statistikcache ist nur eine Beschleunigung und keine fachliche Datenquelle. Eigene Zuweisungs- und
Referenzbildaktionen machen ihn automatisch ungültig. Änderungen an Bewertungen oder Plug-in-Feldern außerhalb
dieser Aktionen werden über `Neu berechnen` ausdrücklich neu eingelesen. Bereits mit einer älteren Plug-in-Version
zugewiesene Fotos erhalten Klasse, Familie und Gattung erst bei einer erneuten kontrollierten Zuweisung.

Master- oder Suchpaketversionen werden absichtlich nicht als normale Fotometadaten gespeichert. Sie gehören in das
Paketmanifest und in technische Diagnoseinformationen, weil für die Bildverwaltung nur Taxonomie und Namen relevant
sind.

## Installation für den kontrollierten Abnahmetest

1. In Lightroom Classic einen separaten Testkatalog und mindestens zwei entbehrliche Testbilder öffnen.
2. `Datei > Zusatzmodul-Manager` öffnen.
3. Das Verzeichnis
   `D:\IUCN_Datenbank\lightroom-plugin\FNWildlifeTaxonomy.lrplugin` hinzufügen.
4. Das Zusatzmodul im Manager neu laden und prüfen, dass Version `0.3.4.0` sowie die vier Menüaktionen ohne
   Lua-Fehler erscheinen.
5. In der Bibliothek ein Testfoto markieren und
   `Bibliothek > Zusatzmoduloptionen > Taxonomie zuweisen ...` wählen.
6. Im Zuweisungsfenster die vier gerahmten Schritte und den Hinweis `Lokale Masterdatenbank bereit` prüfen. Eine Art
   suchen, Vorschau kontrollieren, zuweisen und Schlüsselwörter sowie Plug-in-Felder prüfen. Danach die Auswahl bei
   geöffnetem Fenster wechseln und den aktualisierten Auswahlhinweis prüfen.
7. Dieselbe Prüfung mit mehreren gleichzeitig ausgewählten Testfotos wiederholen.
8. Einen Konfliktfall mit einer abweichenden vorhandenen `masterTaxonId` prüfen; das Plug-in muss blockieren.
9. Für eine zugewiesene Art nacheinander zwei Fotos als Referenz festlegen. Danach darf nur das zuletzt gewählte
   Foto `Art-Referenzbild = Ja` besitzen.
10. `FN Wildlife-Sammlungen einrichten ...` zweimal ausführen und prüfen, dass nur ein Sammlungssatz mit vier
    intelligenten Sammlungen vorhanden ist.
11. `Taxonomie-Statistik ...` öffnen, `Neu berechnen` ausführen und Abdeckung, Zahlen, Referenzbildhinweise sowie
    die höchstens zehn am häufigsten fotografierten Arten prüfen.
12. Lightroom neu starten und prüfen, dass Zuordnung, Schlüsselwörter, Referenzbild und Sammlungen erhalten bleiben.

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
- vollständige Hierarchie, Mehrfachzuweisung und Konfliktsperre im Lua-Vertrag;
- schwebendes, gerahmtes Vier-Schritt-Zuweisungsfenster mit Suchpaket-, Einzelfenster-, Auswahlwechsel- und
  Verlaufskontrakt;
- eindeutige, bestätigungspflichtige Referenzbildmarkierung, idempotente Sammlungsdefinitionen sowie Statistik-
  und Cache-Grenzen einschließlich Abdeckung und häufigsten Arten.

Noch offen ist die gemeinsame praktische Abnahme in Lightroom Classic mit dem vorbereiteten Testkatalog und den
123 Testbildern. Sie umfasst zunächst die vier nicht schreibenden Menü-/Fensterprüfungen und danach den vom
Anwender bewusst gestarteten Schreibtest für ein Foto, mehrere Fotos, Konfliktsperre, Referenzbild, Sammlungen und
Statistik. Bis dahin gelten Phase 10.2 und das ausgebaute Bedien-MVP aus 10.3/10.4 als technisch, aber noch nicht
praktisch abgenommen.

## Betriebs- und Sicherungsgrenze

Das Suchpaket ist abgeleitet und kann jederzeit aus dem aktiven Master neu erzeugt werden. Es gehört daher nicht in
Git, GitHub Pages oder normale Projektbackups. `previous` ist der lokale schnelle Rollback. Unersetzbar und zu
sichern bleiben Masterdatenbank, eigene Taxonomiekorrekturen, Projektverknüpfungen und später die normalen
Lightroom-Katalogbackups. Die Einbindung in Installer, NAS und Mehrgerätebetrieb bleibt Phase 11.
