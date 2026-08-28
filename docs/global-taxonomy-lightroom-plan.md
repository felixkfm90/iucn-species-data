# Globale Taxonomiedatenbank (Phase 9) und Lightroom-Integration (Phase 10)

Stand: 2026-08-28

Status: Phase 9 ist seit 2026-08-09 abgeschlossen. Die Lightroom-Machbarkeitsprüfung aus Phase 10.1 wurde am
2026-08-13 abgeschlossen. Suchpaket, technischer Plug-in-Kern und die priorisierten Bedienerweiterungen aus
10.2 bis 10.4 sind bis Plug-in-Version 0.4.8.0 umgesetzt und automatisiert geprüft. Einzel- und Mehrfachzuweisung,
Fensteraufbau, Favoritenersetzung und Taxonomierücknahme wurden im separaten Lightroom-Testkatalog praktisch
geprüft. Phase 10 bleibt bis zum umfassenden Abschlussaudit offen.

Roadmap: Phase 9 und Phase 10

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

Dieses Dokument beschreibt die gemeinsame fachliche Schnittstelle, ordnet die Umsetzung aber verbindlich in zwei
getrennte Phasen ein: Phase 9 liefert und auditiert die globale Taxonomiereferenz; Phase 10 prüft und implementiert
erst danach die Lightroom-Integration. Die
Quellenstrategie wurde in Phase 9.1 verbindlich unter `docs/taxonomy-source-decision.md` festgelegt. Speichertechnik,
Schema, Suche, Import, Staging und Rollback wurden in Phase 9.2 verbindlich unter
`docs/local-taxonomy-database-design.md` entworfen und in Phase 9.3 mit dem begrenzten, unter
`docs/taxonomy-import-prototype.md` dokumentierten Importprototyp bestätigt. Phase 9.4 hat die lokale read-only
API und die kontrollierte Übernahme im Neue-Art-Assistenten umgesetzt; der verbindliche Vertrag steht in
`docs/taxonomy-explorer-integration.md`. Phase 9.5 setzt den vollständigen lokalen Installations- und
Aktualisierungsworkflow nach `docs/taxonomy-reference-update.md` um. Phase 9.6 bis 9.12 ergänzen nach
`docs/taxonomy-master-database-design.md` die physisch getrennte Masterdatenbank mit stabilen IDs, versionierten
Anbieterausschnitten, Feldprovenienz, Zusammenführungs- und Konfliktregeln, Explorer-Integration, atomarer
Aktivierung und Rollback. Die aktive CoL-Vollreferenz bleibt dabei unverändert und read-only. Der alte kleine
Masterlauf vom 2026-08-01 ist nur eine historische technische Basis. Der erweiterte reale Neuaufbau und das
umfassende Abschlussaudit vom 2026-08-09 ersetzen dessen Messwerte und Freigabe.
Lightroom-Anbindung folgt in Phase 10, Mehrgeräteverteilung in Phase 11.

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
| iNaturalist | großer, versioniert abrufbarer Namens- und Taxonbestand | breiter lokaler Artlücken- und Namensausschnitt für CoL-Lücken sowie fehlende deutsche/englische Namen |
| GBIF | aktuelle Website-Taxonomie basiert selbst auf CoL XR; alter Backbone wird nicht weitergeführt | Alt-ID-Mapping, Taxonabgleich, Vorkommensdaten und Kartenbezüge |
| WoRMS | fachlich spezialisierte Quelle mit AphiaIDs, Synonymen und Hierarchien für Meerestiere | zusätzliche Validierung mariner und brackischer Taxa |
| Wikidata | breite mehrsprachige Labels und externe IDs, aber keine taxonomische Autorität | optionale quellenmarkierte Namens- und ID-Vorschläge |
| Animalia.bio | redaktionell nützlich, aber ohne dokumentierte öffentliche API und versionierten Bulk-Export | kontrollierter, quellenbelegter letzter Fallback für verbleibende Tierlücken; kein automatisches Scraping |
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

Die lokale Masterdatenbank wird verbindlich in dieser Reihenfolge aufgebaut:

```text
CoL XR
+ iNaturalist-Namensbestand
+ GBIF-Namen und Kennungen
+ WoRMS für marine Taxa
+ Wikidata-Taxonauszug
+ Animalia für restliche belegte Lücken
+ eigene Korrekturen
────────────────────────────────────
= lokale Masterdatenbank
```

CoL XR liefert den vollständigen globalen Primärbestand. iNaturalist wird nicht nur bedarfsgesteuert verwendet,
sondern als breiter lokaler, versionierter Artlücken- und Namensausschnitt importiert. GBIF, WoRMS und Wikidata
liefern relevante versionierte Ausschnitte; Animalia ergänzt nur danach verbleibende, kontrolliert belegte
Tierlücken. Eigene bestätigte Korrekturen besitzen den höchsten Vorrang. Keine Ergänzungsquelle darf die
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

Die read-only Integration wurde in Phase 9.4 nach dem begrenzten Importprototyp umgesetzt. Der Neue-Art-Assistent
bietet:

- lokal konfigurierbare Reichsauswahl mit `Tiere (Animalia)` als erstem Standard und weiteren Reichen aus der
  Referenzdatenbank
- getrennte Vorschläge für deutsche, englische und wissenschaftliche Namen nach 500 Millisekunden
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

Für bestehende Arten führt Phase 9.5 vor jeder Aktivierung einen getrennten Abgleich aus. Er meldet eindeutige
Synonyme als Vorschlag sowie mehrdeutige oder fehlende Treffer als manuelle Prüfung. Er verändert keine Art und
trifft keine stille Auswahl. Eine spätere fachlich bestätigte Umbenennung läuft weiterhin über den geschützten
artweisen Umbenennungsworkflow.

Die Referenzsuche ändert nur die Namensvorbereitung in Schritt 1. Die bisherige Validierung, Kollisionsprüfung,
Vorschau und bestätigte Speicherung bleiben maßgeblich. `docs/add-species-workflow.md` beschreibt den Gesamtprozess;
`docs/taxonomy-explorer-integration.md` beschreibt die neue Referenzgrenze.

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

Dieser Ablauf ist seit Phase 9.5 umgesetzt. Die kleine Versionsprüfung startet nicht blockierend beim
Explorer-Start; vollständiger Download und Import bleiben ausdrücklich bestätigte Wartungsaktionen. Details:
`docs/taxonomy-reference-update.md`.

## H. Verhältnis zum Multi-Computer-Support

Die Taxonomiedatenbank aus Phase 9 und die Lightroom-Integration aus Phase 10 werden bewusst vor Phase 11
„Synology NAS, Mehrgeräte und automatisiertes Backup“ eingeordnet. In Phase 11 müssen vor dem eigentlichen
Mehrgeräteausbau folgende Entscheidungen dokumentiert sein:

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

Die bisherigen Entscheidungen aus `docs/multi-device-backup-plan.md` bleiben unverändert. Phase 11 ergänzt die
noch fehlende Übergabe für Referenzdaten, Lightroom-Daten und projektspezifische Taxonomieentscheidungen.

## I. Phase 10: eigenes deutschsprachiges Lightroom-Classic-Plug-in

Das spätere Plug-in wird eigenständig für dieses Projekt geplant. Es entsteht nicht durch Kopieren oder
Rückentwicklung eines fremden Plug-ins.

Zu prüfende Funktionen:

- vollständig deutsche Oberfläche
- Suche nach deutschen, englischen und wissenschaftlichen Namen sowie Synonymen in der vollständigen aktiven
  Masterdatenbank, unabhängig davon, ob die Art bereits im Arten-Explorer angelegt ist
- Übernahme der vollständigen verfügbaren Taxonomie auf ein oder mehrere gleichzeitig ausgewählte Fotos
- Speicherung einer stabilen Master-Taxon-ID und, falls vorhanden, zusätzlich der Projekt-Art-ID
- Speicherung deutscher, englischer und wissenschaftlicher Namen
- Speicherung aller verfügbaren bestätigten Taxonomiestufen einschließlich optionaler Zwischenränge
- vollständiges, versioniertes und read-only genutztes Lightroom-Suchpaket aus der aktiven Masterdatenbank
- kontrollierte und atomare Aktualisierung dieses Suchpakets mit Rollback
- Nutzbarkeit, wenn der Explorer nicht läuft
- keine direkte Bearbeitung der globalen Taxonomiedatenbank aus Lightroom
- keine konkurrierende Stammdatenpflege in Lightroom
- Prüfung der Metadatenportabilität
- Prüfung von XMP- und Lightroom-Katalogverhalten
- Prüfung von Möglichkeiten und Grenzen des Lightroom SDK
- Performancetests mit großen Katalogen
- genau ein kontrolliertes `Favoritenbild der Art` pro Art
- intelligente Sammlungen und verwerfbar gecachte Katalogstatistiken
- Lifelist- und Klassenstatistiken sowie höchstens zehn am häufigsten fotografierte Arten
- später optional weiterführende Export- und Abgleichsfunktionen

Die Machbarkeitsprüfung hat ein vollständig aus der aktiven Masterdatenbank abgeleitetes, kontrolliertes Suchpaket
als bevorzugten MVP-Zugriffsweg bestätigt. Das Paket enthält einen kompakten SQLite-Suchindex mit allen Taxa,
Namen und Hierarchien und wird über einen kleinen lokalen read-only Suchhelfer angesprochen. Direkter Zugriff auf
die interne Master-SQLite wurde wegen Größe, Schema-, Pfad- und Sperrkopplung verworfen. Der Arten-Explorer muss
für die Offline-Suche nicht laufen. Details und Produktvergleich stehen in `docs/lightroom-feasibility-study.md`.

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
- Der Neue-Art-Assistent erhält ein Reich-Dropdown mit `Tiere (Animalia)` als erster Vorauswahl, eine lokale
  Sichtbarkeitseinstellung und getrennte Vorschläge für deutsche, englische und wissenschaftliche Namen.
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

- **Abgeschlossen am 2026-07-24.**
- Vier lokale read-only Endpunkte liefern Status, Reiche, Suche und Taxondetails aus dem aktiven SQLite-Release.
- Deutsche und wissenschaftliche Eingaben suchen bidirektional nach jedem Zeichen; ältere Antworten dürfen neue
  Eingaben nicht überschreiben.
- `Tiere (Animalia)` ist Standard, `Alle Reiche` muss bewusst gewählt werden.
- Trefferliste und Detailvorschau zeigen Rang, akzeptierten Namen, Synonym, Klassifikation, Quelle, Release,
  Quellen-ID und Vertrauensstufe.
- Ein bewusst angeklickter Treffer schließt die schwebende Trefferliste und füllt deutschen, englischen und
  wissenschaftlichen Namen direkt. Die bestehende Eingabeprüfung und Speicherung bleiben danach verpflichtend;
  ein zusätzlicher Button `Vorschlag übernehmen` ist nicht erforderlich.
- Der Neue-Art-Assistent bietet ausschließlich Taxa mit Rang `Art` an. Unterarten bleiben vorbereitet, aber bis
  zur kontrollierten Erweiterung des dreiteiligen Namens- und Slugmodells gesperrt.
- Fehlende oder beschädigte Referenzdaten blockieren die manuelle Artanlage nicht.
- Für Tiere ohne belegten deutschen Namen wird nur eine manuelle Animalia.bio-Suche angeboten; es findet kein
  automatischer Abruf statt.
- Bestehende Projektarten, `species_list.json`, `speciesData.json`, GitHub Pages und Squarespace werden durch die
  Suche nicht verändert.
- Bedien-, API-, Fehler- und Testvertrag: `docs/taxonomy-explorer-integration.md`.

Ergebnis: getestete read-only Explorer-Integration auf Basis des begrenzten Referenzbestands. Der vollständige
lokale Referenzimport ist für Phase 9.5 freigegeben.

### 9.5 Vollständiger lokaler Import und Aktualisierungsworkflow

- **Technisch abgeschlossen am 2026-07-26.**
- nicht blockierende Versionsprüfung beim Start mit lokalem Zwölf-Stunden-Cache
- vollständiger Download erst nach Vorschau und ausdrücklicher Bestätigung
- begrenzte, sichere Extraktion und streamender SQLite-Vollimport
- Verifikation, Qualitätsgate und Suchindex
- vollständiger Abgleich der bestehenden Projektarten ohne automatische Änderung
- sichtbare eindeutige Synonymvorschläge sowie manuelle Mehrdeutigkeits-/Fehlhinweise
- atomarer Austausch und genau eine Rollbackversion
- verständliche Fortschritts- und Fehleranzeige im Explorer
- fokussierter, reproduzierbarer Fixture-Test ohne automatischen Gigabyte-Download

Ergebnis: lokal installierbarer und aktualisierbarer Referenzbestand, weiterhin getrennt von Git/Pages. Die erste
echte Vollinstallation bleibt ein ausdrücklich gestarteter lokaler Betriebstest. Verbindlicher Vertrag:
`docs/taxonomy-reference-update.md`.

### 9.6 Masterdatenbank und stabile Identitäten

- **Abgeschlossen am 2026-08-01.**
- physisch getrennte Master-SQLite mit stabilen anbieterunabhängigen Taxon-IDs
- versionierte Quellenstände, Taxon-, Namens- und Feldaussagen sowie Projektverknüpfungen
- nachvollziehbare Zustände `durch CoL bestätigt`, `CoL-Referenzlücke`, `extern bestätigt`, `widersprüchlich`,
  `veraltet` und `manuell geschützt`
- CoL-Vollreferenz bleibt unverändert, read-only und separat aktiv

### 9.7 Verbindliche Zusammenführungsregeln

- **Abgeschlossen am 2026-08-01.**
- Priorität: manuell bestätigte Projektdaten, CoL XR, WoRMS für marine/brackische Taxa, GBIF/iNaturalist für
  Lücken und Abgleich, Wikidata für gebräuchliche Namen und externe IDs
- keine stille Hierarchieänderung, keine automatische Hochstufung von Unterarten und kein Vorrang allein aufgrund
  eines neueren Zeitstempels
- Synonyme und alternative Namen bleiben erhalten; entfernte Quelleneinträge werden zunächst als veraltet markiert

### 9.8 Versionierte Anbieterbestände und -ausschnitte

- **Abgeschlossen am 2026-08-09.** Der reale Neuaufbau und Betriebstest sind Bestandteil des freigegebenen
  Phase-9-Masterbestands.
- breiter lokaler, versionierter iNaturalist-Namens- und Artlückenausschnitt für alle gegen CoL erkannten
  Artlücken sowie CoL-Arten mit fehlenden deutschen oder englischen Namen
- relevante, versionierte Ausschnitte aus GBIF, WoRMS und Wikidata für Projektarten, CoL-Lücken, recherchierte
  Taxa und eigene Korrekturen
- kontrollierte, quellenbelegte Animalia-Einzelfälle als letzter Fallback für danach verbleibende Tierlücken
- Anbieter-ID, wissenschaftlicher Name, Rang, Hierarchie, deutsche/englische Namen, Abrufzeitpunkt und
  Versionsstatus werden einzeln gespeichert
- der bisherige Ergänzungscache wird kontrolliert übernommen; vollständige GBIF-, WoRMS-, Wikidata- und
  Animalia-Bestände werden nicht gespiegelt

### 9.9 Master-Kandidat, Konflikte und Rollback

- **Abgeschlossen am 2026-08-01.**
- Updates bauen zunächst einen getrennten Kandidaten aus CoL, Anbieter-Ausschnitten und manuellen Korrekturen
- Vorschau umfasst neue Taxa, geschlossene Lücken, Namens- und Hierarchieänderungen, Synonyme, veraltete Einträge
  sowie Konflikte mit Projektarten
- Aktivierung erfolgt erst nach Prüfung atomar; genau eine vorherige Masterversion bleibt als Rollback erhalten

### 9.10 Explorer-Integration

- **Abgeschlossen am 2026-08-01.**
- Neue-Art-Suche verwendet bevorzugt die aktive Masterdatenbank und bleibt für lokal enthaltene Einträge offline
- Treffer zeigen Quelle, Status und CoL-Referenzlücken; ohne aktive Masterdatenbank greift die bisherige
  Referenzsuche sicher weiter
- kontrollierte Entscheidungen unterstützen bisherigen Wert, neuen Wert, Alias und dauerhaften manuellen Schutz
- Aktualisierung, Fortschritt, Abschlussmeldung und Rollback sind in die lokale Wartung eingebunden

### 9.11 Verbindliche Regressionen

- **Abgeschlossen am 2026-08-01.**
- `Sciurus vulgaris` wird genau einmal als Art mit Status `CoL-Referenzlücke` geführt, obwohl CoL im geprüften
  Bestand nur zugehörige Unterarten enthält
- ein späterer CoL-Artbeleg schließt dieselbe Lücke, ohne einen zweiten Masterdatensatz, Projekt-Slug oder
  Assetpfad zu erzeugen
- weitere Regressionen decken Homonyme, Synonyme, Umbenennungen, Anbieter-Ausfälle, verschwundene Quellen,
  doppelte Anbieterzeilen und unterbrochene Aktivierungen ab

### 9.12 Reale Migration und Betriebstest

- **Abgeschlossen am 2026-08-09.**
- Der kleine Lauf vom 2026-08-01 mit 496 Taxa war eine historische technische Basis und ist keine Freigabe des
  nun geforderten breiten Offline-Masters.
- Der reale Lauf migrierte den vollständigen CoL-XR-Primärbestand zusammen mit dem breiten iNaturalist-Lücken- und
  Namensbestand, relevanten GBIF-/WoRMS-/Wikidata-Ausschnitten, kontrollierten Animalia-Fällen und eigenen
  Korrekturen.
- Nachgewiesen sind 54 von 54 vollständige Projektverknüpfungen, die reale Regression `Sciurus vulgaris`, die
  Offline-Suche, Anbieter- und Feldprovenienz, Konfliktvorschau, unterbrochene Läufe, atomare Aktivierung,
  Rollback, Suchlatenz, Speicherbedarf und Temp-Bereinigung.
- Der aktive Kandidat enthält 273.505 Master-Taxa, 430.675 Anbieteraussagen, 1.762.462 Namen und 7.108.393
  Suchbegriffe. Exakte repräsentative Offline-Suchen benötigen etwa 1 bis 7 ms.
- Aktive und vorherige SQLite-Datei belegen jeweils rund 5.773 MiB; der gesamte Masterbereich einschließlich
  Anbieterständen belegt rund 12.453 MiB.

Ergebnis: technisch und betrieblich geprüfter lokaler Master. Das vollständige Abschlussaudit ist unter
`docs/audits/2026-08-phase-9-closing-audit.md` dokumentiert und schließt Phase 9 ab.

### 10.1 Lightroom-SDK- und Metadaten-Machbarkeitsprüfung

- **Abgeschlossen am 2026-08-13.**
- Die reale Windows-Zielumgebung mit Lightroom Classic 15.5 und die offiziellen Lua-SDK-Grenzen wurden geprüft.
- Direkte Master-SQLite, lokale Explorer-API und kontrollierter Export wurden verglichen.
- Lightroom bleibt alleiniger Besitzer von Katalog-, Schlüsselwort- und XMP-Schreibvorgängen.
- iNat Publish Pro, LifeListXP, Nomen und Species Tagger wurden als Funktionsinspiration bewertet.
- Offline-Suche, menschliche Bestätigung, Hierarchieschlüsselwörter, stabile Metadaten und Stapelverarbeitung sind
  für das MVP vorgesehen; KI-Bilderkennung, Cloud-Zwang und konkurrierende Taxonomiepflege ausdrücklich nicht.

Ergebnis: `docs/lightroom-feasibility-study.md` bestätigt die Machbarkeit und empfiehlt ein vollständiges,
versioniertes read-only Suchpaket aus der aktiven Masterdatenbank mit lokalem Suchhelfer.

### 10.2 Suchpaket, Suchhelfer und Plug-in-Prototyp

- **Technischer Kern am 2026-08-13 umgesetzt.** Das reale abgeleitete Suchpaket enthält 273.505 Taxa,
  7.108.393 Suchbegriffe, 1.762.462 Namen, 54 Projektverknüpfungen und 430.675 Anbieterbelege.
- Schema, Fremdschlüssel, Zähler, SHA-256-Prüfsumme, atomare Aktivierung und isolierter Rollback wurden am realen
  Bestand geprüft; repräsentative Offline-Suchen lagen lokal ungefähr zwischen 0,6 und 1,8 Millisekunden.
- Der read-only Suchhelfer besitzt Datei- und Dauerprozessmodus. Das deutsche Lua-Plug-in zeigt die vollständige
  Taxonomie an und besitzt den kontrollierten Schreibvertrag für ein oder mehrere ausgewählte Fotos.
- Der Plug-in-Vertrag schreibt nur eindeutig mit `(FN)` markierte, flache Stichwörter und stabile fachliche
  Metadaten über das
  Lightroom-SDK. Paket- und Masterversion bleiben technische Diagnoseinformationen und werden nicht als normale
  Fotometadaten abgelegt.
- Automatisierte Tests sichern Suchpaket, Suchhelfer, Modulgrenzen, Konfliktsperre und das Verbot direkter
  `.lrcat`-, XMP- oder SQLite-Schreibzugriffe.
- Einzel- und Mehrfachzuweisung wurden im separaten Lightroom-Testkatalog praktisch bestätigt. Fensteraufbau,
  Favoritenersetzung und kontrollierte Rücknahme wurden ebenfalls praktisch geprüft.

Ergebnis: verbindliche Architektur und technischer Prototyp stehen; der grundlegende Lightroom-Schreibvertrag ist
praktisch bestätigt. Der verbindliche aktuelle Bedien- und Teststand steht in `docs/lightroom-search-package.md`.

### 10.3 Deutsches Lightroom-Plug-in als MVP

- **Bis Plug-in-Version 0.4.8.0 am 2026-08-28 umgesetzt und automatisiert geprüft; grundlegende Einzel- und
  Mehrfachzuweisung praktisch bestätigt.**
- Die deutsche Oberfläche verwendet ein kompaktes schwebendes, in vier gerahmte Arbeitsschritte gegliedertes
  Arbeitsfenster mit unten rechts verankertem Schließen-Button. Es prüft vor der Suche den lokalen Paketstatus,
  erkennt unter Windows die lokale Node-Installation unabhängig vom durch Lightroom übergebenen `PATH`, übergibt
  den lokalen Suchpaketpfad ausdrücklich, meldet Hilfsprozessfehler diagnostizierbar und bleibt bei
  Auswahlwechseln geöffnet. Es zeigt Dateiname beziehungsweise ersten Dateinamen plus Anzahl weiterer Fotos,
  Lifelist, aktuellen Zuweisungszustand und die zehn zuletzt verwendeten Arten an. Die Suche wird über `Art suchen`
  ausgelöst. Das dauerhaft geöffnete `presentFloatingDialog` besitzt keinen SDK-dokumentierten Standardbutton oder
  Enter-/Tastatur-Callback für das Suchfeld.
- Die Artensuche verwendet die vollständige lokale Masterdatenbank und zeigt vor der Zuweisung den gesamten
  verfügbaren Taxonomiepfad.
- Alle verfügbaren Taxonomiestufen werden kontrolliert auf ein oder mehrere gleichzeitig ausgewählte Fotos
  übernommen; abweichende bestehende Master-Taxon-IDs blockieren stille Änderungen. Eine eigene Aktion entfernt
  nach Bestätigung Plug-in-Metadaten und nur die bei der Zuweisung gespeicherten beziehungsweise eindeutig
  eindeutig mit `(FN)` beziehungsweise `(FN)*` markierten Plug-in-Stichwortverknüpfungen wieder vollständig. Sie
  steht über `Plug-in-Extras` beziehungsweise `Bibliothek > Zusatzmoduloptionen` bereit; eine dokumentierte
  Erweiterung des normalen Foto-Rechtsklickmenüs bietet das geprüfte SDK nicht. Sonstige manuelle Stichwörter
  bleiben erhalten.
- Fachliche Plug-in-Metadaten speichern die vollständige strukturierte Taxonomie. Die flachen Lightroom-Stichwörter
  enthalten lesbare Taxonnamen mit reservierter FN-Endung, aber keine internen IDs, Tabellenkennungen oder
  technischen Rangpräfixe. Gemeinsame Rangdefinitionen verhindern Abweichungen zwischen Vorschau, Metadaten,
  Stichwörtern und Statistik.
- Die kompakte Metadatenansicht `FN Wildlife – Foto & Taxonomie` verbindet sinnvolle Standard-Fotofelder mit Namen
  und wichtigen Rängen. Die Rangfelder tragen kurze Titel ohne `(wissenschaftlich)`; ihre Werte bleiben
  wissenschaftlich. `FN Wildlife – vollständige Taxonomie` zeigt bei Bedarf alle unterstützten Ränge.
  Lightrooms eingebaute Ansicht `Standard` bleibt unverändert.
- Versioniertes read-only Suchpaket, atomarer Wechsel, Rollback, stabile Master-Taxon-ID und optionale
  Projekt-Art-ID bleiben unverändert die technische Grundlage.

Ergebnis: automatisiert getestetes und in den zentralen Bedienabläufen praktisch geprüftes MVP ohne konkurrierende
Stammdatenpflege; das umfassende Phase-10-Abschlussaudit steht noch aus.

### 10.4 Erweiterte Lightroom-Funktionen

- **Priorisierter Funktionsblock bis Plug-in-Version 0.4.8.0 am 2026-08-28 technisch umgesetzt und in den zentralen
  Bedienabläufen praktisch geprüft.**
- Ein bereits taxonomisch zugeordnetes Foto kann nach erklärender Bestätigung als eindeutiges `Favoritenbild der Art`
  seiner Master-Taxon-ID markiert werden; die Datei bleibt unverändert und eine neue Auswahl setzt die bisherige
  Markierung derselben Art zurück. Diese Lightroom-Markierung ist unabhängig vom Artporträt des Arten-Explorers.
- Der wiederholbar einrichtbare Sammlungssatz `FN Wildlife & Travel` enthält `Art-Favoriten`, `Taxonomie fehlt`
  und `Taxonomie zugewiesen`. Die Regeln verwenden ausschließlich `referenceImage`, `masterTaxonId` und
  `scientificName` aus den Plug-in-Metadaten. Eine gültige Taxonomie erfordert Master-ID und wissenschaftlichen
  Namen; fehlt eines davon, gehört das Foto zur Gegenmenge `Taxonomie fehlt`. Normale Fotometadaten und
  Lightroom-Stichwörter bleiben unberücksichtigt. Bereits vorhandene Regeln werden
  aktualisiert; `5-Sterne-Tierbilder` und `Art-Referenzbilder` werden innerhalb dieses Satzes automatisch entfernt.
- Eine lokale Katalogstatistik zählt Fotos, Lifelist-Arten, Gattungen, Familien, Klassen und Favoritenbilder,
  berechnet Taxonomie-Abdeckung und Klassenverteilung und zeigt höchstens zehn am häufigsten fotografierte Arten.
  Ihr Cache ist verwerfbar und kann jederzeit vollständig neu berechnet werden. Dafür ist kein Import oder Update
  der Taxonomie-Masterdatenbank nötig; gezählt werden die Plug-in-Zuordnungen im Lightroom-Katalog.
- Im Zusatzmodul-Manager stehen nur Plug-in-Version und read-only Suchpaketstatus. Aktualisierung, Backup und
  Rollback bleiben zentral im Arten-Explorer und werden nicht im Plug-in dupliziert.
- Der fachliche Taxonomiestand bleibt ausschließlich im Master/Suchpaket. Favoritenbild der Art, Sammlungen und Statistik
  sind abgeleitete Lightroom-Funktionen und bilden keine zweite Stammdatenbank.
- Eine spätere Ortsauswertung verwendet vorhandene IPTC-Ortsfelder vorrangig, kann GPS kontrolliert per
  Reverse-Geocoding ergänzen und führt abgeleitete Ortsstichwörter in einem eigenen Plug-in-Zweig. Länder,
  Regionen, Orte und benutzerdefinierte Fotoplätze dürfen vorhandene manuelle Stichwörter niemals überschreiben.
- Kontrollierter Export, Konfliktauflösung bestehender Zuordnungen sowie optionale iNaturalist-Anbindung bleiben
  spätere, einzeln zu priorisierende Ausbauschritte.

Ergebnis: drei klar abgegrenzte Erweiterungen statt eines unkontrollierten Funktionsblocks; Annahme erst nach dem
gemeinsamen Test im separaten Katalog.

### 10.5 Umfassendes Lightroom-Abschlussaudit

- Plug-in-Code, Datenmodell, XMP-/Katalogverhalten, Dateistruktur und Dokumentation prüfen
- Direkt-, Integrations-, Offline-, Performance-, Installations- und Restore-Tests ausführen
- alle Befunde bereinigen oder begründet Phase 11 beziehungsweise Phase 12 zuordnen

Ergebnis: Phase 10 kann erst nach dokumentiert bestandenem Audit abgeschlossen werden.

## Verbleibende Architekturentscheidungen

Die primäre Quelle, Ergänzungsrollen und Prioritätsregeln wurden in Phase 9.1 entschieden. Phase 9.2 hat
Lizenz-/Attributionsspeicherung, lokale Speichertechnik, Suchindizes, Schema, Speicherort, Vollimportstrategie und
Sicherungsgrenze verbindlich geklärt; Phase 9.3 hat diese Grenzen mit einem begrenzten Prototyp bestätigt und
Phase 9.4 den read-only Bedien- und API-Vertrag umgesetzt. Phase 9.5 hat Vollimport, Aktualisierung und den
Konfliktworkflow für bestehende Arten umgesetzt. Vor den jeweiligen späteren Implementierungsphasen bleiben
ausdrücklich:

Phase 10.1 hat Suchpaket, Suchhelfer und Grundgrenzen des Metadatenmodells entschieden. Phase 10.2 hat Paket- und
API-Vertrag, stabile Feldkennungen, vollständige Taxonomiehierarchie in Plug-in-Metadaten, eindeutig markierte
flache Stichwörter, Mehrfachzuordnung und Konfliktsperre technisch umgesetzt. Einzel- und Mehrfachzuweisung wurden
im Testkatalog bestätigt. Phase 10.3/10.4 ergänzen bis Version 0.4.8.0 die nutzergeführte Rücknahme, dynamische
Auswahl, Lifelist-/Klassenstatistik, Favoritenbild der Art, Sammlungen, eigene Metadatenansicht und
Suchpaketstatus. Offen ist das umfassende Phase-10-Abschlussaudit. Danach bleiben für Phase 11:

1. optionales NAS-Paket für die große Referenzdatenbank;
2. Verteilung und Versionsabgleich im Mehrgerätebetrieb;
3. Installerpfad, Plug-in-Aktualisierung und konfigurierbarer Exportspeicherort.

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

## Definition of Done für Phase 9 und Übergabe an Phase 10

- Phase 9 umfasst ausschließlich Taxonomiereferenz und Abschlussaudit.
- Phase 10 umfasst ausschließlich Lightroom-Machbarkeit, MVP, optionale Erweiterungen und Abschlussaudit.
- Die NAS-/Mehrgerätephase folgt als Phase 11.
- Anforderungen, Kandidaten, Datenmodell, Integration, Update, Lightroom und Sicherheitsregeln sind dokumentiert.
- Die Teilphasen 9.1 bis 9.12 sowie 10.1 bis 10.5 besitzen klare Ergebnisse und Freigabepunkte.
- Offene Entscheidungen sind ausdrücklich als offen gekennzeichnet.
- Bestehender produktiver Artenbestand und globale Referenzdatenbank sind eindeutig getrennt.
- Der begrenzte Prototyp besitzt direkte Tests und reproduzierbare Messwerte.
- Produktive Daten, Abhängigkeiten und große Datenbankdateien wurden nicht verändert.
- Keine Phase wird ohne dokumentiertes umfassendes Abschlussaudit als abgeschlossen markiert.
