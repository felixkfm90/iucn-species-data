# Globale Taxonomiedatenbank und Lightroom-Integration

Stand: 2026-07-23

Status: Phase 9.1 bis 9.3 abgeschlossen; Phase 9.4 als nächster Schritt; noch kein produktiver Vollimport

Roadmap: Phase 9

## Ziel und Abgrenzung

Das Erweiterungsprojekt soll prüfen und später umsetzen, wie eine umfangreiche globale Taxonomiedatenbank lokal
bereitgestellt und kontrolliert mit dem Arten-Explorer sowie einem zukünftigen deutschsprachigen
Lightroom-Classic-Plug-in verbunden werden kann.

Langfristig sollen sich sehr viele Tier-, Pflanzen-, Pilz- und weitere Taxa lokal durchsuchen lassen. Akzeptierte
wissenschaftliche Namen, Synonyme, taxonomische Hierarchien und verlässlich belegte deutsche Bezeichnungen sollen
angezeigt und nach ausdrücklicher Bestätigung in den bestehenden Artenbestand übernommen werden können. Dieselben
kontrollierten Daten sollen später auch für Lightroom zur Verfügung stehen, ohne eine zweite konkurrierende
Stammdatenpflege aufzubauen.

Der aktuelle produktive Artenbestand bleibt davon getrennt:

- `species_list.json` bleibt die maßgebliche manuell bestätigte Eingabeliste.
- `speciesData.json` bleibt die generierte Datenbasis der tatsächlich angelegten Arten.
- Die globale Taxonomiedatenbank ist zunächst ausschließlich Referenz- und Suchdatenbank.
- Ein Import darf bestehende Arten weder still verändern noch automatisch überschreiben.
- URL-Slugs, Assetnamen und Assetpfade ändern sich nicht allein aufgrund einer neuen Taxonomieversion.
- Die globale Datenbank wird weder in Git aufgenommen noch über GitHub Pages ausgeliefert.

Dieses Dokument beschreibt Anforderungen, Architektur, Entscheidungspunkte, Risiken und Teilphasen. Die
Quellenstrategie wurde in Phase 9.1 verbindlich unter `docs/taxonomy-source-decision.md` festgelegt. Speichertechnik,
Schema, Suche, Import, Staging und Rollback wurden in Phase 9.2 verbindlich unter
`docs/local-taxonomy-database-design.md` entworfen und in Phase 9.3 mit dem begrenzten, unter
`docs/taxonomy-import-prototype.md` dokumentierten Importprototyp bestätigt. Lightroom-Anbindung und
Mehrgeräteverteilung werden in den nachfolgenden Teilphasen entschieden.

## A. Ausgangslage

Der Arten-Explorer verwaltet bereits einen kleinen, redaktionell ausgewählten und produktiv genutzten Artenbestand.
`species_list.json` enthält die manuellen Eingabedaten; `speciesData.json` enthält die durch Pipeline und
Benutzerentscheidungen erzeugten beziehungsweise übernommenen Artdaten. Die bisherige Taxonomie stammt überwiegend
aus der bestehenden Datenpipeline.

Beim Anlegen einer neuen Art werden derzeit mindestens deutscher und wissenschaftlicher Name eingegeben. Die App
normalisiert den wissenschaftlichen Namen, prüft Kollisionen und startet anschließend die bestehende IUCN-/Asset-
Pipeline. Eine globale Offline-Suche nach Taxa, Synonymen oder stabilen Quellen-IDs gibt es noch nicht.

Die künftige Referenzdatenbank muss deshalb klar vom produktiven Projektbestand getrennt bleiben:

```text
Globale Referenzdatenbank
  = großer, reproduzierbarer Such- und Nachschlagebestand

Produktiver Artenbestand
  = ausdrücklich bestätigte Arten in species_list.json / speciesData.json

Projektbezogene Entscheidungen
  = eigene Namen, Übersetzungen, Ablehnungen und Quellenzuordnungen
```

Die P0-Punkte aus `docs/audits/2026-07-repository-audit.md` wurden vor Phase 9 abgeschlossen: Assetformat und
Pages-Größe sind stabilisiert, die schreibende localhost-API ist abgesichert und verpflichtende
CI-Qualitätsprüfungen sind eingeführt. Die neue Referenzdatenbank darf diese Schutzmechanismen nicht umgehen oder
verzweigen.

Das in Phase 8 abgeschlossene Redesign der Taxonomie-Pyramide ist ein getrenntes Thema. Es verbessert die
dynamische HTML-/CSS-Ausgabe vorhandener Taxonomiedaten. Phase 9 plant dagegen Herkunft, Suche, Speicherung und
kontrollierte Übernahme einer viel größeren Referenzdatenbasis.

## B. Geprüfte Taxonomiequellen

Phase 9.1 hat die Kandidaten anhand derselben Kriterien untersucht. Die vollständige Matrix, Quellenbelege,
Prioritätsregeln und Testtaxa stehen in `docs/taxonomy-source-decision.md`.

| Kandidat | Ergebnis aus Phase 9.1 | Vorgesehene Rolle |
| --- | --- | --- |
| Catalogue of Life Extended Release | breitester reproduzierbarer globaler Bestand; Base-Herkunft bleibt unterscheidbar | primäre globale Referenz |
| Catalogue of Life Base Release | fachlich stärker kuratierter Kern des XR-Bestands | Vertrauensstufe innerhalb des XR-Imports, kein zweiter Parallelbestand |
| GBIF | aktuelle Website-Taxonomie basiert selbst auf CoL XR; alter Backbone wird nicht weitergeführt | Alt-ID-Mapping, Taxonabgleich, Vorkommensdaten und Kartenbezüge |
| WoRMS | fachlich spezialisierte Quelle mit AphiaIDs, Synonymen und Hierarchien für Meerestiere | zusätzliche Validierung mariner und brackischer Taxa |
| Wikidata | breite mehrsprachige Labels und externe IDs, aber keine taxonomische Autorität | optionale quellenmarkierte Namens- und ID-Vorschläge |
| Animalia.bio | redaktionell nützlich, aber ohne dokumentierte öffentliche API und versionierten Bulk-Export | ausschließlich manuelle Referenz, kein Scraping |
| IUCN Red List | bestehende Quelle für Assessments und Schutzdaten, keine globale Taxonomie | Gefährdungs- und Assessmentdaten angelegter Projektarten |

Für jeden Kandidaten entsteht eine nachvollziehbare Entscheidungsmatrix mit mindestens diesen Prüfpunkten:

- Umfang und taxonomische Abdeckung
- wissenschaftliche Qualität, Kuratierung und dokumentierte Herkunft
- akzeptierte Namen und Synonyme
- Stabilität und Bedeutung der Taxon-IDs
- verfügbare taxonomische Ebenen
- deutsche Trivialnamen
- deutsche Namen höherer taxonomischer Gruppen
- Downloadformate und Komprimierung
- API-Verfügbarkeit und Nutzungslimits
- Lizenz- und Attributionspflichten
- Veröffentlichungs- und Aktualisierungsrhythmus
- reproduzierbare Versionsstände
- Änderungs-, Zusammenführungs- und Löschverhalten zwischen Versionen
- vollständige und inkrementelle Aktualisierungsmöglichkeiten
- erwarteter Download-, Entpack- und Datenbankumfang
- Importdauer, Speicherbedarf und Betriebsaufwand
- Verhalten bei Mehrdeutigkeiten und widersprüchlichen Quellen

Die Kombination ist streng hierarchisch: CoL XR liefert den globalen Grundbestand; WoRMS validiert Meerestiere;
GBIF, Wikidata, Animalia.bio und IUCN besitzen klar abgegrenzte Ergänzungsrollen. Keine Ergänzungsquelle darf die
CoL-Hierarchie oder bestätigte Projektdaten still überschreiben.

## C. Lokale Speicherung

Phase 9.2 hat SQLite über das in der Electron-Laufzeit verfügbare Modul `node:sqlite` als lokale Speichertechnik
festgelegt. Der verbindliche technische Entwurf steht in `docs/local-taxonomy-database-design.md`.

Wesentliche Entscheidungen:

- pfadunabhängiger Standardspeicher unter `%LOCALAPPDATA%\FN Wildlife Travel\Arten-Explorer\taxonomy`
- versionierte, unveränderliche read-only Release-Datenbanken
- vollständiger Import und Test in einem getrennten Stagingordner
- atomare Aktivierung über eine kleine `active.json`
- genau eine freigegebene Vorversion für Rollback
- Präfixindizes für Vorschläge ab dem ersten Zeichen und FTS5 für weiterführende Suche
- große reproduzierbare Quelle, Datenbank und Indizes außerhalb von Git, Pages und normalen Projekt-Backups
- kleine unersetzbare Projektzuordnungen später in `species-reference-mappings.json`
- kontrollierte Temp-Bereinigung nach Erfolg, Abbruch oder diagnostiziertem Fehler

Der verbindliche Datenfluss lautet:

```text
versionierte Quelldatei
  -> Download-/Prüfbereich
  -> Staging-Import
  -> Qualitäts- und Stichprobentests
  -> lokaler read-only Referenzbestand
  -> Explorer-Suchschicht
  -> kontrollierte Übernahme in den produktiven Artenbestand

projektbezogene Entscheidungen
  -> getrennte kleine, sicherungsrelevante Projektdatei/-datenbank
```

Die große Referenzdatenbank bleibt eine Such- und Vorschlagsquelle. `species_list.json` und `speciesData.json`
bleiben der bestätigte produktive Bestand.

## D. Datenmodell und Herkunftsnachweise

Das spätere Konzept muss mindestens folgende Informationen speichern oder eindeutig ableiten können:

- stabile Quellen-ID
- abgefragter wissenschaftlicher Name
- akzeptierter wissenschaftlicher Name
- taxonomischer Rang
- Synonyme und Beziehung zum akzeptierten Taxon
- Reich
- Stamm
- optional Unterstamm
- Klasse
- Ordnung
- optional Unterordnung
- Familie
- Gattung
- Art
- Unterart
- deutsche Trivialnamen mit Quelle
- bei späterem Bedarf weitere sprachabhängige Trivialnamen
- Datenquelle und gegebenenfalls Quellendatensatz
- Quellenversion oder Veröffentlichungskennung
- Abruf- beziehungsweise Importdatum
- Lizenz- und Attributionsinformation
- Match-, Konflikt- und Zuordnungsstatus

Phase 9.2 konkretisiert diese Informationen in den verbindlichen Tabellen `source_release`, `source_dataset`,
`taxon`, `taxon_name`, `vernacular_name`, `external_identifier` und `search_term`. Der vollständige Vertrag steht
in `docs/local-taxonomy-database-design.md`.

Die folgenden früheren konzeptionellen Entitäten werden dadurch abgedeckt:

- `source_release`: Quelle, Version, Veröffentlichung, Lizenz, Checksumme
- `taxon`: Quellen-ID, Rang, akzeptierter Status, Elternbeziehung
- `taxon_name`: wissenschaftliche Namen, Synonyme und Sprachkennzeichnung
- `vernacular_name`: Trivialname, Sprache, Quelle, Prüfstatus
- `classification`: verfügbare Hierarchie pro Taxon und Quellenstand
- `project_mapping`: bestätigte Zuordnung zwischen Projekt-Art und Referenz-Taxon
- `translation_override`: eigene kontrollierte Übersetzung mit Herkunft und Änderungsdatum

Bestehende Felder werden erst nach dokumentierter Migration, Abwärtskompatibilitätsprüfung, Website-Test und
Rollback-Plan verändert. Die globale Datenbank ist keine Berechtigung, produktive Taxonomie automatisch zu
„korrigieren“.

## E. Deutsche Bezeichnungen

### 1. Deutsche Feldbezeichnungen

Die Anwendung definiert die sichtbaren Rangbezeichnungen zentral:

| Wissenschaftlicher/technischer Rang | Deutsche Anzeige |
| --- | --- |
| Kingdom | Reich |
| Phylum | Stamm |
| Subphylum | Unterstamm |
| Class | Klasse |
| Order | Ordnung |
| Suborder | Unterordnung |
| Family | Familie |
| Genus | Gattung |
| Species | Art |
| Subspecies | Unterart |

### 2. Deutsche Artnamen

- Deutsche Namen werden nur mit nachvollziehbarer Quelle übernommen.
- Mehrere belegte Namen werden als Auswahl statt als stiller Ersatz angeboten.
- Ein bestehender Projektname wird nicht automatisch überschrieben.
- Die Quelle des bestätigten Namens bleibt nachvollziehbar.
- Fehlt ein belegter Name, bleibt die bestehende manuelle Eingabe möglich.
- Die Anwendung erfindet keine deutschen Namen.

### 3. Deutsche Namen höherer Taxa

Bezeichnungen wie `Aves` → `Vögel`, `Passeriformes` → `Sperlingsvögel` oder `Turdidae` → `Drosseln` werden nur
aus einer kontrollierten Quelle oder einer eigenen geprüften Übersetzungstabelle angezeigt. Wissenschaftliche
Taxonnamen bleiben immer zusätzlich erhalten. Eine Quelle darf nicht allein aufgrund einer scheinbar passenden
deutschen Übersetzung bevorzugt werden.

## F. Integration in den Arten-Explorer

Die spätere Integration wird erst nach dem begrenzten Importprototyp umgesetzt. Der Neue-Art-Assistent soll dann
anbieten:

- Reichsauswahl mit `Tiere (Animalia)` als Standard und weiteren Reichen aus der Referenzdatenbank
- bidirektionale Vorschläge deutsch ↔ wissenschaftlich nach jedem eingegebenen Zeichen
- globale Suche nach wissenschaftlichem Namen
- Suche nach deutschem Namen, sofern belegt vorhanden
- Trefferliste bei mehreren passenden Taxa
- Kennzeichnung akzeptierter Namen, Synonyme und unsicherer Treffer
- Anzeige der vollständigen verfügbaren Klassifikation
- Anzeige von Quelle, Taxon-ID und Datenbankversion
- Vorschau aller zu übernehmenden Felder
- explizite Benutzerbestätigung vor jeder Übernahme
- keine stille Änderung bestehender Arten
- Warnung und Feldvergleich bei abweichender vorhandener Taxonomie
- bewusste Auswahl zwischen bestehender und gefundener Klassifikation
- Möglichkeit, Treffer abzulehnen oder manuell weiterzuarbeiten
- Offline-Suche nach vollständig abgeschlossenem lokalem Import
- verständlichen Zustand bei fehlender, beschädigter oder veralteter Referenzdatenbank
- bei einem Tier ohne bestätigten deutschen Namen einen gezielten Button `Animalia.bio manuell prüfen`, der eine
  browserbasierte Einzelfallrecherche öffnet, ohne die Website automatisiert abzurufen oder zu scrapen

Für bestehende Arten ist ein getrenntes Prüfwerkzeug zu planen. Es darf Abweichungen melden und Vorschläge machen,
aber keine Massenänderung ohne artweise oder ausdrücklich bestätigte Sammelentscheidung ausführen.

Der aktuelle Neue-Art-Assistent bleibt bis Phase 9.4 funktional unverändert. `docs/add-species-workflow.md` bleibt
bis zu einer späteren, getesteten Migration die maßgebliche Bedienbeschreibung.

## G. Aktualisierung der globalen Datenbank

Der Aktualisierungsworkflow soll mindestens vorsehen:

- manuell ausgelöste Prüfung und Aktualisierung
- optional später eine zeitgesteuerte reine Versionsprüfung
- Anzeige installierter Quellenversion und Veröffentlichungsdatum
- Anzeige von Downloadgröße und benötigtem freiem Speicherplatz
- getrennten Fortschritt für Download, Entpacken, Prüfen, Importieren und Indexieren
- Checksumme und Formatprüfung vor dem Import
- Testimport und Qualitätsprüfungen vor dem Austausch
- atomaren Austausch erst nach erfolgreichem Test
- Rollback auf die vorherige freigegebene Version
- klare Wiederaufnahme oder saubere Rückabwicklung bei Netzwerkabbruch
- Abbruch vor dem Download beziehungsweise Import bei zu wenig Speicherplatz
- Protokollierung ohne Tokens, Zugangsdaten oder unnötige personenbezogene Informationen
- Prüfung, ob die gewählte Quelle echte inkrementelle Updates unterstützt und ob sie betrieblich sinnvoll sind

Ein Update der Referenzdatenbank startet nicht automatisch die produktive IUCN-/Asset-Pipeline und ändert keine
Projekt-Art. Nach einem Update können lediglich neue Prüfhinweise oder Vergleichsvorschläge entstehen.

## H. Verhältnis zum Multi-Computer-Support

Phase 9 wird bewusst vor Phase 10 „Synology NAS, Mehrgeräte und automatisiertes Backup“ eingeordnet. In
Teilphase 9.9 müssen vor dem weiteren Mehrgeräteausbau folgende Entscheidungen dokumentiert sein:

- Wird die globale Referenzdatenbank auf jedem Rechner separat installiert?
- Wird eine geprüfte Datenbankversion vom NAS kopiert?
- Wird sie bei Bedarf auf jedem Rechner neu heruntergeladen und importiert?
- Gehört die große reproduzierbare Datenbank in ein NAS-Backup oder nur ihre Installations-/Versionsinformation?
- Welche kleinen, nicht reproduzierbaren Nutzerdaten müssen zwingend gesichert werden?
- Wie werden eigene Übersetzungen, Namensentscheidungen und Taxon-Mappings synchronisiert?
- Wie erkennt die App unterschiedliche Referenzdatenbankversionen auf mehreren Rechnern?
- Welche Version muss für eine Bearbeitung mindestens vorhanden sein?

Die große, aus einer öffentlichen Quelle reproduzierbare Datenbank wird nicht automatisch wie eigene
Projektdateien behandelt. Eigene Ergänzungen, Übersetzungen, Auswahlentscheidungen, Quellenzuordnungen und
projektbezogene Mappings sind dagegen unersetzbar und müssen in Backup, Restore und späteren Mehrgeräteabgleich
einbezogen werden.

Die bisherigen Entscheidungen aus `docs/multi-device-backup-plan.md` bleiben unverändert. Phase 9.9 ergänzt nur
die noch fehlende Übergabe für Referenzdaten und projektspezifische Taxonomieentscheidungen.

## I. Eigenes deutschsprachiges Lightroom-Classic-Plug-in

Das spätere Plug-in wird eigenständig für dieses Projekt geplant. Es entsteht nicht durch Kopieren oder
Rückentwicklung eines fremden Plug-ins.

Zu prüfende Funktionen:

- vollständig deutsche Oberfläche
- Suche nach deutschem und wissenschaftlichem Namen
- Auswahl einer Art aus dem produktiven Explorer-Artenbestand
- optional spätere Suche in der globalen lokalen Referenzdatenbank
- Übernahme taxonomischer Metadaten auf ausgewählte Fotos
- Speicherung einer stabilen Projekt-Art-ID
- Speicherung von deutschem und wissenschaftlichem Namen
- Speicherung der verfügbaren bestätigten Taxonomiestufen
- lokaler read-only Cache der benötigten Explorer-Daten
- kontrollierte Aktualisierung dieses Caches
- Nutzbarkeit, wenn der Explorer nicht läuft
- Exportdatei, read-only API oder direkter read-only Datenbankzugriff als zu vergleichende Verbindung
- keine direkte Bearbeitung der globalen Taxonomiedatenbank aus Lightroom
- keine konkurrierende Stammdatenpflege in Lightroom
- Prüfung der Metadatenportabilität
- Prüfung von XMP- und Lightroom-Katalogverhalten
- Prüfung von Möglichkeiten und Grenzen des Lightroom SDK
- Performancetests mit großen Katalogen
- später optional ein Referenzbild pro Art
- später optional Statistiken und Lifelist-Funktionen

Noch offen bleibt, ob Lightroom direkt lesend auf eine lokale Datenbank, auf eine Explorer-API oder auf eine
kompakte Exportdatei zugreift. Die Entscheidung folgt erst aus Phase 9.6 und muss Offline-Verhalten,
Installationsaufwand, Dateisperren, Mehrgerätebetrieb und SDK-Grenzen berücksichtigen.

## J. Sicherheits- und Qualitätsregeln

- keine stillen Taxonomieänderungen
- keine erfundenen deutschen Namen
- keine unkontrollierte Vermischung mehrerer Quellen
- nachvollziehbare Herkunft jedes übernommenen Datensatzes
- bestehende produktive Arten nicht allein aufgrund eines Imports ändern
- große Datenbank-, Download- und Importdateien nicht committen
- keine Tokens oder Zugangsdaten in Datenbank, Logs, Exporten oder Frontend speichern
- Import und Aktualisierung zuerst mit Testdaten und in Staging prüfen
- bestehende Pipeline und GitHub-Pages-Ausgabe nicht gefährden
- vor produktiver Migration Backup, Rollback und Rückwärtskompatibilität festlegen
- Parser und Importer gegen unerwartete oder schadhafte Quelldaten absichern
- Downloads nur von freigegebenen Quellen und mit Größen-/Formatgrenzen zulassen
- lokale Schreib- und API-Grenzen aus dem Repository-Audit auch für neue Funktionen anwenden
- jede Quellenversion mit reproduzierbaren Prüfprotokollen und Stichproben freigeben

## Geplante Teilphasen

### 9.1 Anforderungen und Quellenvergleich

- **Abgeschlossen am 2026-07-23.**
- Catalogue of Life, GBIF, WoRMS, Wikidata, Animalia.bio und die bestehende IUCN-Rolle wurden mit einer
  einheitlichen Matrix verglichen.
- Lizenz, Datenmodell, Umfang, Namen, IDs, Versionierung und Updatewege wurden auf Basis offizieller
  Anbieterinformationen bewertet.
- Repräsentative Beispiel-Taxa und Problemfälle für den begrenzten Prototyp sind festgelegt.
- Die verbindliche Entscheidung steht in `docs/taxonomy-source-decision.md`; es erfolgte noch kein produktiver
  Import.

Ergebnis: CoL XR als globale Primärreferenz, WoRMS als marine Fachergänzung und klar begrenzte Rollen für GBIF,
Wikidata, Animalia.bio und IUCN.

### 9.2 Lokales Datenbank- und Importkonzept

- **Abgeschlossen am 2026-07-23.**
- SQLite über `node:sqlite` ist als lokale, gekapselte Speichertechnik festgelegt.
- Standardspeicher, lokale Pfadkonfiguration, unveränderliche Releaseordner, Staging, atomare Aktivierung und eine
  Rollbackversion sind definiert.
- Schema und Provenienzmodell bilden beliebige Ränge, akzeptierte Namen, Synonyme, Vernakularnamen, Quellen,
  Releases und externe IDs ab.
- B-Tree-Präfixsuche unterstützt Vorschläge ab dem ersten Zeichen; FTS5 ergänzt mehrteilige Suche.
- Der spätere Neue-Art-Assistent erhält ein Reich-Dropdown mit `Tiere (Animalia)` als Vorauswahl und
  bidirektionale Vorschläge deutsch ↔ wissenschaftlich.
- Bei einem Tier ohne bestätigten deutschen Namen ist eine gezielte manuelle Animalia.bio-Recherche vorgesehen;
  automatisierter Abruf oder Scraping bleibt ausgeschlossen.
- Große Referenzdaten werden aus Git, Pages und normalen Projekt-Backups ausgeschlossen; kleine eigene
  Projektentscheidungen werden separat versioniert.
- Der verbindliche Entwurf steht in `docs/local-taxonomy-database-design.md`; es erfolgte noch kein produktiver
  Vollimport.

Ergebnis: implementierungsreife technische Architektur vor dem begrenzten Phase-9.3-Prototyp.

### 9.3 Import-Prototyp mit begrenztem Testbestand

- **Abgeschlossen am 2026-07-23.**
- Eine kleine versionierte Fixture aus `COL26.7 XR`, dem zugehörigen Base-Abgleich und drei WoRMS-Vergleichen deckt
  Tiere, Pflanzen, Pilze, Bakterien, Synonyme, Homonyme, Unterart und ausgestorbene Taxa ab.
- Der Import liest ColDP-TSV-Dateien streamend, prüft Manifest, Header, Dateigrößen und SHA-256-Werte und schreibt
  erst in eine isolierte Staging-Datenbank.
- SQLite-Schema, B-Tree-Präfixindizes, FTS5, Provenienz, Hierarchie, externe Kennungen und deutsche Namen sind mit
  direkten Tests verifiziert.
- Aktivierung, beschädigter Kandidat, Abbruch, Fehler nach Zeigerumschaltung und Rollback lassen die letzte
  geprüfte Version intakt.
- Die Offline-Suche demonstriert `Animalia` als Standard, bewusste Suche über alle Reiche, deutsch ↔
  wissenschaftlich ab dem ersten Zeichen und keine stille Auswahl bei Mehrdeutigkeiten.
- Importzeit, Datenbank- und Indexgröße, Speicherverbrauch sowie kalte und warme Suchlatenz sind im Messbericht
  festgehalten. Die Werte gelten nur für die begrenzte Fixture und werden nicht auf den Vollbestand hochgerechnet.
- Produktionsdaten, Explorer-Oberfläche, GitHub Pages und Squarespace wurden nicht verändert.
- Der vollständige Bericht steht in `docs/taxonomy-import-prototype.md`.

Ergebnis: Das technische Konzept ist für den Bedien- und API-Entwurf in Phase 9.4 freigegeben. Ein produktiver
Vollimport bleibt bis nach der Freigabe von 9.4 gesperrt.

### 9.4 Explorer-Such- und Übernahmekonzept

- Suche, Trefferliste und Mehrdeutigkeiten
- Taxonomie- und Quellenvorschau
- kontrollierte Übernahme und Konfliktbehandlung
- Ablehnung, manuelles Fallback und Offline-Zustände
- keine produktive Änderung ohne Vorschau und Bestätigung

Ergebnis: abgestimmter Bedien- und API-Entwurf vor Umbau des Neue-Art-Assistenten.

### 9.5 Vollständiger lokaler Import und Aktualisierungsworkflow

- erst nach Freigabe von 9.1 bis 9.4
- vollständiger Download und Import
- Verifikation, Qualitätsgate und Suchindex
- Updatefunktion, atomarer Austausch und Rollback
- verständliche Fortschritts- und Fehleranzeige im Explorer

Ergebnis: lokal installierbarer und aktualisierbarer Referenzbestand, weiterhin getrennt von Git/Pages.

### 9.6 Lightroom-SDK- und Metadaten-Machbarkeitsprüfung

- technische SDK-Grenzen und unterstützte Lightroom-Versionen prüfen
- Datenübertragungswege vergleichen
- Projekt-Art-ID und Metadatenmodell festlegen
- XMP-, Katalog-, Offline- und Performanceverhalten testen

Ergebnis: dokumentierte Architekturentscheidung für das Plug-in.

### 9.7 Deutsches Lightroom-Plug-in als MVP

- deutsche Oberfläche
- Artensuche und Taxonomievorschau
- Übernahme auf ausgewählte Fotos
- lokaler read-only Cache
- stabile Projekt-Art-ID

Ergebnis: getestetes MVP ohne konkurrierende Stammdatenpflege.

### 9.8 Erweiterte Lightroom-Funktionen

Erst nach erfolgreichem MVP bewerten:

- Referenzbild pro Art
- intelligente Sammlungen
- Lifelist und Statistiken
- Konfliktprüfung
- kontrollierter Export für Website oder Explorer

Ergebnis: einzeln priorisierte Erweiterungen statt eines unkontrollierten Funktionsblocks.

### 9.9 Vorbereitung für Mehrgerätebetrieb

- Datenbankverteilung und Versionsabgleich entscheiden
- Sicherung eigener Ergänzungen und Mappings festlegen
- reproduzierbare und unersetzbare Daten technisch trennen
- Installations-, Restore- und Konfliktfälle dokumentieren
- Übergabe an Phase 10 aktualisieren

Ergebnis: verbindliche Schnittstelle zur bestehenden Mehrgeräte-/NAS-Planung.

## Verbleibende Architekturentscheidungen

Die primäre Quelle, Ergänzungsrollen und Prioritätsregeln wurden in Phase 9.1 entschieden. Phase 9.2 hat
Lizenz-/Attributionsspeicherung, lokale Speichertechnik, Suchindizes, Schema, Speicherort, Vollimportstrategie und
Sicherungsgrenze verbindlich geklärt; Phase 9.3 hat diese Grenzen mit einem begrenzten Prototyp bestätigt. Vor den
jeweiligen späteren Implementierungsphasen bleiben ausdrücklich:

1. Konfliktworkflow für bestehende Arten
2. Zugriff des Lightroom-Plug-ins: Datenbank, read-only API oder Export
3. Metadaten- und XMP-Modell in Lightroom
4. optionales NAS-Paket für die große Referenzdatenbank
5. Verteilung und Versionsabgleich im späteren Mehrgerätebetrieb

## Nicht Bestandteil von Phase 9.1 bis 9.3

- kein vollständiger Catalogue-of-Life-, WoRMS- oder anderer Quelldownload
- keine produktiv aktivierte SQLite-Datenbank
- keine produktive Taxonomie-API
- keine Änderung an `species_list.json` oder `speciesData.json`
- keine funktionale Änderung an `update.mjs`
- kein Umbau des Neue-Art-Assistenten
- keine Lightroom-Plug-in-Datei
- keine neue npm-Abhängigkeit
- keine große Download-, Import- oder Datenbankdatei
- keine Migration bestehender Taxonomie
- keine Änderung an NAS-, Backup- oder Mehrgerätefunktionen

## Definition of Done für Quellen-, Architektur- und Prototypphase

- Phase 9 ist vor der NAS-/Mehrgerätephase in der Roadmap eingeordnet.
- Die NAS-/Mehrgerätephase folgt als Phase 10.
- Anforderungen, Kandidaten, Datenmodell, Integration, Update, Lightroom und Sicherheitsregeln sind dokumentiert.
- Die Teilphasen 9.1 bis 9.9 besitzen klare Ergebnisse und Freigabepunkte.
- Offene Entscheidungen sind ausdrücklich als offen gekennzeichnet.
- Bestehender produktiver Artenbestand und globale Referenzdatenbank sind eindeutig getrennt.
- Der begrenzte Prototyp besitzt direkte Tests und reproduzierbare Messwerte.
- Produktive Daten, Abhängigkeiten und große Datenbankdateien wurden nicht verändert.
