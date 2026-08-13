# Lightroom-Suchpaket und erster Plug-in-Prototyp

Stand: 2026-08-13
Roadmap: Phase 10.2
Status: technischer Kern umgesetzt und lokal verifiziert; kontrollierter Schreibtest in einem Lightroom-Testkatalog
steht noch aus

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

Enthalten sind:

- `Info.lua`: Manifest, SDK-Grenze und deutscher Bibliotheksmenüpunkt;
- `MetadataDefinition.lua`: stabile Plug-in-Metadatenfelder;
- `TaxonomyHelper.lua`: Aufruf des read-only Suchhelfers;
- `KeywordWriter.lua`: vollständige Hierarchie- und Namensschlüsselwörter sowie Mehrfachzuweisung;
- `AssignTaxonomy.lua`: deutsche Suche, Trefferauswahl, Taxonomievorschau, Konfliktprüfung und Bestätigung.

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
- Zuweisungszeitpunkt.

Master- oder Suchpaketversionen werden absichtlich nicht als normale Fotometadaten gespeichert. Sie gehören in das
Paketmanifest und in technische Diagnoseinformationen, weil für die Bildverwaltung nur Taxonomie und Namen relevant
sind.

## Installation für den kontrollierten Abnahmetest

1. In Lightroom Classic einen separaten Testkatalog und mindestens zwei entbehrliche Testbilder öffnen.
2. `Datei > Zusatzmodul-Manager` öffnen.
3. Das Verzeichnis
   `D:\IUCN_Datenbank\lightroom-plugin\FNWildlifeTaxonomy.lrplugin` hinzufügen.
4. In der Bibliothek ein Testfoto markieren und
   `Bibliothek > Zusatzmoduloptionen > Art und Taxonomie zuweisen ...` wählen.
5. Eine Art suchen, Vorschau kontrollieren, zuweisen und Schlüsselwörter sowie Plug-in-Felder prüfen.
6. Dieselbe Prüfung mit mehreren gleichzeitig ausgewählten Testfotos wiederholen.
7. Einen Konfliktfall mit einer abweichenden vorhandenen `masterTaxonId` prüfen; der Prototyp muss blockieren.
8. Lightroom neu starten und prüfen, dass Zuordnung und Schlüsselwörter erhalten bleiben.

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
- vollständige Hierarchie, Mehrfachzuweisung und Konfliktsperre im Lua-Vertrag.

Noch offen ist ausschließlich die praktische Phase-10.2-Abnahme in Lightroom Classic mit einem Testkatalog: ein
Foto, mehrere Fotos, persistierte Schlüsselwörter/Plug-in-Felder und Konfliktsperre. Danach kann Phase 10.2
abgeschlossen und das Bedien-MVP aus Phase 10.3 ausgebaut werden.

## Betriebs- und Sicherungsgrenze

Das Suchpaket ist abgeleitet und kann jederzeit aus dem aktiven Master neu erzeugt werden. Es gehört daher nicht in
Git, GitHub Pages oder normale Projektbackups. `previous` ist der lokale schnelle Rollback. Unersetzbar und zu
sichern bleiben Masterdatenbank, eigene Taxonomiekorrekturen, Projektverknüpfungen und später die normalen
Lightroom-Katalogbackups. Die Einbindung in Installer, NAS und Mehrgerätebetrieb bleibt Phase 11.
