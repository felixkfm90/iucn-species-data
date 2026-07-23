# Lokale Taxonomiedatenbank – Architektur für Phase 9.2

Stand: 2026-07-23

Status: Phase 9.2 abgeschlossen; verbindlicher technischer Entwurf, noch kein produktiver Vollimport

Roadmap: Phase 9.2

## 1. Ergebnis

Die globale Referenzsuche wird als lokale, versionierte SQLite-Datenbank umgesetzt. Sie liegt außerhalb des
Repositories, außerhalb des GitHub-Pages-Artefakts und außerhalb fest codierter Projektpfade. Die produktiven
Projektarten bleiben davon getrennt:

```text
globale Taxonomiedatenbank
  = reproduzierbare Referenz-, Such- und Vorschlagsdaten

species_list.json / speciesData.json
  = ausdrücklich bestätigter produktiver Artenbestand

species-reference-mappings.json
  = kleine, versionierte Zuordnungen und eigene Quellenentscheidungen
```

Die Referenzdatenbank darf keine bestehende Art, URL, Taxonomie oder Assetstruktur still ändern. Ein Suchtreffer
wird erst nach ausdrücklicher Auswahl in den vorhandenen Vorschau- und Bestätigungsworkflow übernommen.

Die Quellenstrategie aus `docs/taxonomy-source-decision.md` bleibt verbindlich:

- Catalogue of Life Extended Release als globaler Primärbestand
- Catalogue of Life Base als höhere Vertrauensstufe innerhalb des XR-Bestands
- WoRMS als zusätzliche Validierung und Ergänzung mariner beziehungsweise brackischer Taxa
- GBIF als Diensteschicht für Alt-IDs, Taxonabgleich und Vorkommensdaten
- Wikidata nur als quellenmarkierte Vorschlagsquelle für deutsche Namen und externe IDs
- Animalia.bio ausschließlich als gezielt geöffnete manuelle Referenz
- IUCN weiterhin ausschließlich für Schutz-, Assessment- und Verbreitungsdaten

## 2. Abgrenzung von Phase 9.2

Dieser Entwurf entscheidet:

- lokale Speichertechnik und Zugriffsschicht
- pfadunabhängigen Speicherort und Releaseaufbau
- Datenbank- und Provenienzmodell
- Such- und Indexstrategie
- Import-, Staging-, Aktivierungs- und Rollbackablauf
- Trennung reproduzierbarer Referenzdaten von Projektentscheidungen
- Git-, Pages-, Backup- und Temp-Grenzen
- API-Verträge für die spätere Explorer-Integration
- Suchverhalten des Neue-Art-Assistenten einschließlich vorausgewähltem Reich `Tiere`
- manuellen Animalia.bio-Rechercheweg bei fehlendem deutschen Namen

Phase 9.2 erzeugt ausdrücklich noch nicht:

- keinen vollständigen Catalogue-of-Life-Download
- keine produktiv aktivierte Taxonomiedatenbank
- keine neue Taxonomie-API im Explorer
- keinen Umbau des Neue-Art-Assistenten
- keine Migration vorhandener Arten
- keine neue npm-Abhängigkeit
- keine Lightroom-Plug-in-Datei

Diese Implementierungen beginnen kontrolliert mit dem begrenzten Prototyp in Phase 9.3.

## 3. Speichertechnik und Laufzeit

### 3.1 Entscheidung

Die Referenzdaten werden in einer dateibasierten SQLite-Datenbank gespeichert. Der Zugriff wird hinter einem
eigenen Adapter gekapselt, voraussichtlich `species-explorer/taxonomy-store.mjs`. Fachmodule dürfen weder
SQL-Abfragen noch Dateipfade duplizieren.

Verwendet wird das in Node.js enthaltene Modul `node:sqlite`. Dadurch entsteht keine native npm-Abhängigkeit und
kein zusätzlicher Buildschritt für unterschiedliche Windows- oder Electron-Versionen.

Die Entscheidung basiert auf einem lokalen Machbarkeitstest:

- Node.js 24.12 konnte eine Dateidatenbank, vorbereitete Abfragen und FTS5 verwenden; das Modul ist dort noch als
  experimentell gekennzeichnet.
- Electron 42.7.0 enthält Node.js 24.18 und konnte dieselben SQLite-/FTS5-Funktionen im Node-Modus verwenden.
- Node.js dokumentiert `node:sqlite` ab 24.15 als Release Candidate.

### 3.2 Laufzeitgrenze

- Die produktive Taxonomiesuche wird zuerst über die gebündelte Electron-Laufzeit bereitgestellt.
- Ein direkt gestarteter Browser-/Servermodus aktiviert die Taxonomiedatenbank nur, wenn `node:sqlite` verfügbar
  ist.
- Für einen später offiziell unterstützten Standalone-Betrieb der Taxonomiesuche gilt mindestens Node.js 24.15.
- Die bisherige Kernanforderung Node.js 18+ für den Arten-Explorer wird in Phase 9.2 nicht still angehoben. Ohne
  passende SQLite-Laufzeit bleibt nur die neue Referenzsuche deaktiviert; bestehende Funktionen laufen weiter.
- Die Laufzeitprüfung liefert einen verständlichen Status statt eines Import-Stacktraces.

### 3.3 Warum keine große JSON-Datei

Der recherchierte Catalogue-of-Life-XR-Stand umfasst mehrere Millionen Namen. Eine vollständig in den Speicher
geladene JSON-Datei wäre für Präfixsuche, Synonyme, Hierarchien, Versionstausch und Lightroom-Zugriff ungeeignet.
SQLite ermöglicht:

- indizierte Präfix- und Volltextsuche
- vorbereitete, begrenzte Abfragen
- Transaktionen und Integritätsprüfungen
- eine einzelne read-only aktivierbare Release-Datei
- messbaren Speicher- und Laufzeitbedarf
- reproduzierbare Staging- und Rollbackstände

## 4. Pfade und Releaseaufbau

### 4.1 Standardspeicherort

Der Standardpfad unter Windows lautet:

```text
%LOCALAPPDATA%\FN Wildlife Travel\Arten-Explorer\taxonomy\
```

Der Pfad wird zur Laufzeit ermittelt und niemals aus `D:\IUCN_Datenbank` oder einem anderen Installationspfad
abgeleitet. Ein späterer Einstellungsdialog darf ihn über die bereits ignorierte lokale Datei
`species-explorer/local-settings.json` ändern. Nur absolute lokale Windows- oder UNC-Pfade sind zulässig.

### 4.2 Verzeichnisstruktur

```text
taxonomy/
  active.json
  releases/
    col-xr-<release-id>/
      taxonomy.sqlite
      manifest.json
  staging/
    <operation-id>/
      download/
      extract/
      taxonomy.sqlite.tmp
      import.json
      import.log
```

`manifest.json` enthält mindestens:

- Quelle und exakte Releasekennung
- Veröffentlichungs- und Importdatum
- ColDP-Version
- Download-URL und SHA-256-Prüfsumme
- Lizenz- und Zitationshinweis
- importierte Datensätze und Zähler
- Schema- und Importerversion
- Größe von Quelle, entpacktem Bestand, Datenbank und Indizes
- Ergebnis der Integritäts- und Stichprobentests

### 4.3 Aktivierung und Aufbewahrung

- Release-Datenbanken sind nach Fertigstellung unveränderlich und werden nur lesend geöffnet.
- Eine neue Datenbank wird vollständig im Stagingbereich aufgebaut und geprüft.
- Erst danach wird die kleine Datei `active.json` atomar auf die neue Releasekennung umgestellt.
- Der vorherige freigegebene Stand bleibt als genau eine Rollbackversion erhalten.
- Vor dem Entfernen einer alten Version werden alle zugehörigen Datenbankverbindungen geschlossen.
- Abgebrochene und fehlgeschlagene Stagingordner werden nach der Diagnose kontrolliert bereinigt.
- Temporäre Dateien dürfen weder im Repository noch dauerhaft neben der aktiven Datenbank liegen bleiben.

Die unveränderlichen Releasepfade vermeiden insbesondere Windows-Dateisperren beim Ersetzen einer gerade
gelesenen SQLite-Datei.

## 5. Git, Pages und Sicherung

### 5.1 Große reproduzierbare Daten

Folgende Inhalte gehören weder in Git noch in GitHub Pages:

- Quelldownloads und Archive
- entpackte CoL-/WoRMS-Dateien
- SQLite-Datenbanken einschließlich Journal- und WAL-Dateien
- Suchindizes
- Importlogs und Stagingdaten

Zusätzliche Ignore-Grenzen im Repository verhindern, dass ein irrtümlich lokal angelegter Fallbackordner
committed wird:

```text
taxonomy-data/
species-explorer/taxonomy-data/
```

Die normale tägliche Projekt-ZIP-Sicherung enthält diese reproduzierbaren Massendaten nicht. Ob eine fertig
importierte Referenzdatenbank später zusätzlich als eigenes NAS-Paket verteilt und wiederhergestellt wird, wird in
Phase 9.9 gemeinsam mit dem Mehrgerätebetrieb entschieden.

### 5.2 Kleine unersetzbare Projektentscheidungen

Eigene Zuordnungen, bestätigte Namen und Quellenentscheidungen sind keine reproduzierbaren Massendaten. Für sie
wird in der Implementierungsphase eine kleine versionierte Datei `species-reference-mappings.json` eingeführt.
Sie speichert unter anderem:

- Projektart beziehungsweise URL-Slug
- bestätigte CoL-Taxon-ID und CoL-Release
- gewählte deutsche Namensquelle
- optionale AphiaID, GBIF-ID oder Wikidata-ID
- Match-, Konflikt- und Bestätigungsstatus
- Zeitpunkt und Herkunft der Benutzerentscheidung

Diese Datei wird durch bestehende Projekt-Backups, Git, Commit/Push und spätere Mehrgerätesynchronisierung
geschützt. Sie ersetzt nicht:

- `species-taxonomy-overrides.json` für manuelle Korrekturen einzelner sichtbarer Taxonomieränge
- `species_list.json` als bestätigte manuelle Eingabeliste
- `speciesData.json` als generierte produktive Datenbasis

## 6. Datenbank- und Provenienzmodell

### 6.1 Grundsatz

Taxonomische Ränge werden als Eltern-Kind-Graph gespeichert, nicht als starre Folge fest codierter Spalten.
Dadurch bleiben sieben, acht oder mehr Stufen möglich, beispielsweise Unterstamm, Unterordnung, Unterfamilie,
Tribus und Unterart. Die kompakte Website-Pyramide bleibt davon unabhängig und zeigt nur ihre freigegebenen
Ränge.

### 6.2 Verbindliche Tabellen

#### `schema_info`

- Schema- und Importerversion
- Erstellungszeitpunkt
- erforderliche Mindestlaufzeit

#### `source_release`

- Quellenname
- Releasekennung
- Veröffentlichungs- und Importdatum
- Format- und ColDP-Version
- Download-URL und Prüfsumme
- Lizenz, Zitation und Attribution
- importierte Zähler

#### `source_dataset`

- integrierter CoL-Quelldatensatz
- Dataset-ID, Titel, Herausgeber und Zitation
- gegebenenfalls belastbare Kennzeichnung als Base- oder XR-Bestand

Die Base-/XR-Vertrauensstufe darf nur importiert werden, wenn Phase 9.3 im echten Export ein zuverlässiges
Quellenmerkmal bestätigt. Sie wird nicht aus Namen, Reihenfolge oder Vermutungen abgeleitet.

#### `taxon`

- interne numerische ID
- Quellen- und akzeptierte Taxon-ID
- Eltern-Taxon-ID
- akzeptierter wissenschaftlicher Name und Autorschaft
- Rang und taxonomischer Status
- nomenklatorischer Code
- ausgestorben/rezent, soweit belegt
- Umwelt beziehungsweise mariner Bezug, soweit belegt
- Reichsbezug
- Quelldatensatz

#### `taxon_name`

- Quellen- und Namens-ID
- wissenschaftlicher Name und Autorschaft
- NameUsage-/Synonymstatus
- Beziehung zum akzeptierten Taxon

#### `vernacular_name`

- Taxon-ID
- sichtbarer Name
- Sprache und gegebenenfalls Region
- bevorzugt/nicht bevorzugt
- Quelle, Quellen-ID und Provenienz
- Bestätigungs- beziehungsweise Vorschlagsstatus

#### `external_identifier`

- Taxon-ID
- Kennungstyp, zum Beispiel CoL, Aphia, GBIF oder Wikidata
- externe ID
- Quelle und Abrufstand

#### `search_term`

- Taxon-ID
- Original- und normalisierte Schreibweise
- Namensart: akzeptiert, Synonym, deutscher/anderer Vernakularname oder ID
- Sprache
- akzeptiert, bevorzugt und Vertrauensstufe
- Reichsbezug
- vorberechnete Sortierbewertung

Projektbezogene Mappings werden bewusst nicht in der austauschbaren Referenzdatenbank gespeichert.

### 6.3 Indizes und Integrität

Mindestens erforderlich sind:

- eindeutige Indizes auf Quelle plus Quellen-ID
- Index auf Eltern-Taxon-ID
- Index auf akzeptierte Taxon-ID
- Index auf Rang und Reich
- B-Tree-Präfixindex auf Reich, Namensart und normalisierter Schreibweise
- FTS5-Suchindex für mehrteilige und fehlertolerantere Folgesuche
- Fremdschlüsselprüfung und Integritätsprüfung vor Aktivierung

## 7. Suche im Arten-Explorer

### 7.1 Reichsauswahl

Der Neue-Art-Assistent erhält ein Dropdown `Reich`. Die Einträge kommen aus der installierten Referenzdatenbank.

- `Tiere (Animalia)` ist standardmäßig vorausgewählt, weil der aktuelle Arten-Explorer primär Tierarten verwaltet.
- Weitere verfügbare Reiche, beispielsweise Pflanzen oder Pilze, können bewusst gewählt werden.
- Eine Option `Alle Reiche` bleibt für Homonyme und unsichere Fälle verfügbar.
- Die Auswahl filtert Treffer, verändert aber keine bereits bestätigte Projektart.

### 7.2 Bidirektionale Vorschläge

Die Suche arbeitet in beiden Feldern:

- Eingabe `Stieg...` im deutschen Feld schlägt beispielsweise `Stieglitz – Carduelis carduelis` vor.
- Eingabe `Card...` im wissenschaftlichen Feld schlägt denselben akzeptierten Treffer und – falls belegt – den
  deutschen Namen vor.
- Akzeptierte wissenschaftliche Namen, Synonyme, deutsche Namen und Quellen-IDs sind suchbar.
- Ein Synonym wird als `eingegebener Name → akzeptierter Name` dargestellt.
- Mehrere Taxa werden als Trefferliste angezeigt; kein Treffer wird still ausgewählt.

Nach jedem Eingabeereignis wird mit ungefähr 150 Millisekunden Verzögerung gesucht. Ältere noch laufende Anfragen
werden verworfen; nur die Antwort zur neuesten Eingabe darf die Liste aktualisieren.

### 7.3 Suche ab dem ersten Zeichen

Auch ein einzelnes Zeichen ist zulässig. Damit diese Suche bei Millionen Namen schnell bleibt:

1. Ein normalisierter B-Tree-Präfixindex liefert bereits ab einem Zeichen höchstens zwölf Ergebnisse innerhalb
   des ausgewählten Reichs.
2. Ab mehreren Zeichen ergänzt FTS5 die Suche für mehrteilige Begriffe und weitere Treffer.
3. Eine Trigramm-Substring-Suche wird nur übernommen, wenn der Prototyp in Phase 9.3 ihren zusätzlichen
   Speicherbedarf und Nutzen rechtfertigt.

Die Normalisierung berücksichtigt:

- Unicode und Groß-/Kleinschreibung
- wiederholte Leer- und Satzzeichen
- deutsche Suchvarianten `ä/a/ae`, `ö/o/oe`, `ü/u/ue` und `ß/ss`
- unveränderte Originalschreibweise für die Anzeige

### 7.4 Rangfolge und Darstellung

Die Treffer werden bevorzugt nach folgender Reihenfolge sortiert:

1. exakter akzeptierter wissenschaftlicher Name
2. exakter bestätigter deutscher Name
3. Präfix des akzeptierten wissenschaftlichen Namens
4. Präfix eines bestätigten deutschen Namens
5. wissenschaftliches Synonym
6. weitere quellenmarkierte Vernakular- oder ID-Treffer

Jeder Treffer zeigt:

- deutschen Namen, sofern belegt
- akzeptierten wissenschaftlichen Namen
- Rang
- akzeptiert oder Synonym
- Reich
- Quelle, Vertrauensstufe und Release
- bei marinen Treffern gegebenenfalls den getrennten WoRMS-Status

Erst ein Klick oder eine bewusste Tastaturbestätigung übernimmt einen Treffer in die Eingabefelder. Bloßes Tippen,
Fokussieren oder Überfahren erzeugt keine produktive Änderung.

### 7.5 Übernahme eines ausgewählten Taxons

Ein bestätigter Treffer kann später folgende Vorschau füllen:

- wissenschaftlicher Name
- belegter deutscher Name
- Gattung, Art und gegebenenfalls Unterart
- vollständige verfügbare Klassifikation
- Quellen-IDs und Release
- Synonym- oder Konflikthinweise

Der vorhandene Prüfen-/Vorschau-/Speichern-Ablauf bleibt Pflicht. Eine Unterart darf technisch vorbereitet werden,
ändert aber nur dann den wissenschaftlichen Projektnamen und den URL-Slug, wenn der Benutzer ausdrücklich diese
Unterart statt der Art als Projekt-Taxon auswählt.

## 8. Fehlender deutscher Name und Animalia.bio

Ja, bei einem Tier ohne bestätigten deutschen Namen kann gezielt auf Animalia.bio recherchiert werden. Weil
Animalia.bio keine dokumentierte öffentliche API und keinen versionierten Bulk-Export anbietet, erfolgt dies
bewusst nicht als Hintergrundabruf.

Der spätere Ablauf lautet:

1. Die lokale Suche findet ein Tier-Taxon, aber keinen ausreichend belegten deutschen Namen.
2. Der Assistent zeigt `Kein bestätigter deutscher Name in der Referenzdatenbank`.
3. Zusätzlich erscheint der Button `Animalia.bio manuell prüfen`.
4. Der Button öffnet im Systembrowser eine auf Animalia.bio begrenzte Suche mit dem wissenschaftlichen Namen,
   beispielsweise eine Suchanfrage nach `site:animalia.bio/de "Panthera leo"`.
5. Die App scrapt, parst und importiert die Zielseite nicht.
6. Der Benutzer kann einen dort nachvollziehbar gefundenen Namen manuell eintragen.
7. Bei Übernahme werden Quellen-URL, Kennzeichnung `manuelle Referenz` und Bestätigung in den kleinen
   Projektzuordnungen gespeichert.

Der Button wird nur für Taxa im Reich Animalia und nur bei fehlendem bestätigtem deutschen Namen angeboten. Ein
fehlendes Suchergebnis ist kein Datenbankfehler und blockiert die vorhandene manuelle Eingabe nicht.

## 9. Import- und Aktualisierungsablauf

### 9.1 Festgeschriebene Quelle

Der Prototyp verwendet ein ausdrücklich festgeschriebenes Catalogue-of-Life-XR-Release im ColDP-Format. Für die
erste Umsetzung gilt ColDP 1.2; eine spätere ColDP-2-Migration benötigt einen eigenen Schematest.

Importiert werden mindestens:

- `NameUsage` oder die äquivalent getrennten Entitäten `Name`, `Taxon` und `Synonym`
- `VernacularName`
- Quellen- und Release-Metadaten
- Datensatz- und Zitationsinformationen

### 9.2 Sicherer Stagingimport

1. Zielrelease und erwartete Metadaten festlegen; kein stilles `latest`.
2. Downloadziel, freien Speicher und erlaubte HTTPS-Quelle prüfen.
3. Redirects und Hostgrenzen kontrollieren.
4. Archivsignatur, Größe und SHA-256-Prüfsumme prüfen.
5. Beim Entpacken Pfadtraversal, absolute Pfade, unzulässige Symlinks und ZIP-Bomben verhindern.
6. UTF-8, ColDP-Version, Pflichtdateien und Pflichtspalten prüfen.
7. Datensätze stromweise lesen; keinen vollständigen Export in den Arbeitsspeicher laden.
8. In Batchtransaktionen in eine neue Stagingdatenbank importieren.
9. Suchindizes nach dem Massendatenimport aufbauen.
10. Fremdschlüssel, SQLite-Integrität, akzeptierte Beziehungen, Elternzyklen und Zähler prüfen.
11. Repräsentative Testtaxa und Suchlaufzeiten prüfen.
12. Manifest schreiben und erst danach atomar aktivieren.

Ein inkrementelles Update wird nicht angenommen. Standard ist ein vollständiger Neuaufbau aus einem
reproduzierbaren Release. Ein späteres Delta-Verfahren ist nur zulässig, wenn Quelle, Semantik und Rollback
offiziell dokumentiert und im Prototyp belegt sind.

### 9.3 WoRMS und Ergänzungsquellen

- Phase 9.3 fragt WoRMS nur artweise für die festgelegten marinen Testtaxa ab.
- Ein vollständiger WoRMS-Import benötigt zuvor den offiziellen Datenantrag und dokumentierte Bedingungen.
- GBIF und Wikidata werden nicht als parallele Vollbestände importiert.
- Animalia.bio wird nicht automatisch abgerufen.
- IUCN-Daten werden erst nach Bestätigung einer Projektart über die bestehende Pipeline ergänzt.

## 10. Geplante lokale API-Verträge

Die konkrete API wird erst in Phase 9.4 implementiert. Der Architekturvertrag sieht vor:

```text
GET  /api/taxonomy/status
GET  /api/taxonomy/kingdoms
GET  /api/taxonomy/search
GET  /api/taxonomy/taxa/:id
POST /api/taxonomy/import/preview
POST /api/taxonomy/import/start
POST /api/taxonomy/activate
POST /api/taxonomy/rollback
```

Beispielparameter der Suche:

```text
q=<Eingabe>
kind=vernacular|scientific|all
kingdomId=<lokale Referenz>
limit=12
```

Die Endpunkte verwenden die bestehende localhost-Sitzungs- und Origin-Grenze. Import, Aktivierung und Rollback
sind schreibende Exklusivoperationen und verwenden dieselbe zentrale Prozesssperre wie andere lang laufende
Datenbankaktionen.

## 11. Leistungs- und Qualitätsziele

Der Phase-9.3-Prototyp misst die Werte statt sie aus Datensatzanzahlen zu schätzen.

Zielwerte:

- Statusprüfung beziehungsweise Öffnen der aktiven Datenbank: unter 500 Millisekunden
- warme Autocomplete-Abfrage p95: höchstens 100 Millisekunden
- kalte Autocomplete-Abfrage p95: höchstens 250 Millisekunden
- höchstens zwölf sichtbare Treffer pro Anfrage
- Ein-Zeichen-Präfixsuche mit vorausgewähltem Animalia-Filter innerhalb desselben Budgets
- kein vollständiges Laden der Datenbank in den Arbeitsspeicher
- Import in getrenntem Worker beziehungsweise Hilfsprozess mit Fortschritt
- bestehende Explorer-Oberfläche bleibt während des Imports bedienbar

Zu messen sind getrennt:

- Größe des komprimierten Releases
- entpackte Quellgröße
- SQLite-Daten
- Suchindizes
- Importdauer
- Spitzenarbeitsspeicher
- Suchlatenzen für exakte Namen, Präfixe, Synonyme, deutsche Namen, Homonyme und ein Zeichen

## 12. Fehler- und Wiederherstellungsfälle

Die Oberfläche unterscheidet mindestens:

- keine Referenzdatenbank installiert
- installierte Datenbank ist kompatibel und aktuell
- neuere Releaseversion verfügbar
- Download oder Import läuft
- Import abgebrochen; bisherige Version bleibt aktiv
- Kandidat fehlerhaft; bisherige Version bleibt aktiv
- aktive Datenbank fehlt oder ist beschädigt
- Rollbackversion verfügbar
- Laufzeit unterstützt `node:sqlite` nicht

Ein Quellen- oder Importfehler startet weder die IUCN-/Assetpipeline noch einen Git-Commit. Die letzte geprüfte
Referenz bleibt lesbar, solange ihre Integrität bestätigt ist.

## 13. Übergabe an Phase 9.3

Phase 9.3 baut keinen Vollbestand für den täglichen Betrieb, sondern einen begrenzten, reproduzierbaren
Importprototyp. Er muss:

- ein festgeschriebenes CoL-XR-ColDP-Release verwenden
- die in `docs/taxonomy-source-decision.md` festgelegten Testtaxa importieren
- das Schema und die tatsächlichen ColDP-Felder verifizieren
- Base-/XR-Kennzeichnung nur bei belastbarem Exportmerkmal übernehmen
- SQLite-, Präfix- und FTS5-Indizes messen
- die Reichsauswahl mit `Tiere (Animalia)` als Standard demonstrieren
- deutsch ↔ wissenschaftlich ab dem ersten Zeichen demonstrieren
- Synonym, Homonym, Unterart, ausgestorbenes und marines Taxon korrekt behandeln
- den manuellen Animalia.bio-Button ohne Scraping demonstrieren
- Importabbruch, fehlerhaften Kandidaten, Aktivierung und Rollback testen
- bestätigen, dass keine produktive Projektdatei und kein Pages-Artefakt verändert wird

Erst nach diesen Messungen werden Vollimport, genaue lokale Speicherreserve und produktive Explorer-Integration
freigegeben.

## 14. Nach Phase 9.2 bewusst offene Entscheidungen

Folgende Punkte werden nicht vorweggenommen:

- konkreter Konflikt- und Sammelprüfworkflow für bestehende Projektarten
- endgültiger Lightroom-Zugriffsweg: SQLite, read-only Explorer-API oder kompakter Export
- Lightroom-XMP- und Metadatenmodell
- optionales dediziertes NAS-Paket für die große Referenzdatenbank
- Verteilung und Mindestversion im späteren Mehrgerätebetrieb
- endgültige Gestaltung der Suchtreffer im Neue-Art-Assistenten

## 15. Offizielle technische Referenzen

- [Node.js: `node:sqlite`](https://nodejs.org/api/sqlite.html)
- [SQLite FTS5](https://www.sqlite.org/fts5.html)
- [Catalogue of Life: Downloads](https://www.catalogueoflife.org/data/download)
- [Catalogue of Life: Releases](https://www.catalogueoflife.org/building/releases)
- [Catalogue of Life: Metadaten](https://www.catalogueoflife.org/data/metadata)
- [Catalogue of Life Data Package 1.2](https://github.com/CatalogueOfLife/coldp)
- [WoRMS-Webservice](https://www.marinespecies.org/aphia.php?p=webservice)
- [WoRMS-Datenantrag](https://www.marinespecies.org/usersrequest.php)
- [GBIF: CoL-XR-Migration](https://data-blog.gbif.org/post/catalogue-of-life-taxonomic-backbone/)
- [Wikidata: Datenzugriff](https://www.wikidata.org/wiki/Help:Data_access)
- [Animalia.bio](https://animalia.bio/)
