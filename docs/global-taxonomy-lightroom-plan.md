# Globale Taxonomiedatenbank (Phase 9) und Lightroom-Integration (Phase 10)

Stand: 2026-07-26

Status: Phase 9.1 bis 9.5 technisch abgeschlossen; erste produktive Vollinstallation und Phase-9-Abschlussaudit
noch offen; Lightroom beginnt getrennt in Phase 10

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
Aktualisierungsworkflow nach `docs/taxonomy-reference-update.md` um. Phase 9.6 schließt die Taxonomiephase mit
realem Betriebstest, Rollbackprüfung und umfassendem Audit ab. Lightroom-Anbindung folgt in Phase 10,
Mehrgeräteverteilung in Phase 11.

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

Die read-only Integration wurde in Phase 9.4 nach dem begrenzten Importprototyp umgesetzt. Der Neue-Art-Assistent
bietet:

- lokal konfigurierbare Reichsauswahl mit `Tiere (Animalia)` als erstem Standard und weiteren Reichen aus der
  Referenzdatenbank
- getrennte Vorschläge für deutsche, englische und wissenschaftliche Namen nach 300 Millisekunden
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
kompakte Exportdatei zugreift. Die Entscheidung folgt erst aus Phase 10.1 und muss Offline-Verhalten,
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
- Kein Treffer wird still ausgewählt. Erst `Vorschlag übernehmen` füllt die Namensfelder; die bestehende
  Eingabeprüfung und Speicherung bleiben danach verpflichtend.
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

### 9.6 Realer Betriebstest und umfassendes Abschlussaudit

- Vollreferenz mit dem echten CoL-XR-Paket installieren
- Suchindizes, Zähler, Zwischenränge und Stichproben gegen die Quelle prüfen
- Konfliktabgleich vorhandener Projektarten kontrollieren
- Abbruch, fehlerhafte Pakete, atomare Aktivierung und Rollback praktisch prüfen
- Code, Daten/Schemata, Datei-/Ordnerstruktur, Dokumentation, Tests, Qualitätsgate sowie Betriebs- und
  Wiederherstellungsabläufe vollständig auditieren
- alle Befunde bereinigen oder begründet einer späteren Phase zuordnen

Ergebnis: Phase 9 kann erst nach dokumentiert bestandenem Audit abgeschlossen werden.

### 10.1 Lightroom-SDK- und Metadaten-Machbarkeitsprüfung

- technische SDK-Grenzen und unterstützte Lightroom-Versionen prüfen
- Datenübertragungswege vergleichen
- XMP-, Katalog-, Offline- und Performanceverhalten testen

Ergebnis: dokumentierter Machbarkeitsbericht mit belastbaren technischen Grenzen.

### 10.2 Architekturentscheidung

- read-only Zugriff über SQLite, lokale Explorer-API und kontrollierten Export vergleichen
- Projekt-Art-ID und Metadatenmodell festlegen
- Cache-, Offline-, Aktualisierungs- und Konfliktverhalten entscheiden
- Installations-, Backup- und Restoregrenzen zur späteren Phase 11 dokumentieren

Ergebnis: verbindliche Architekturentscheidung für das Plug-in.

### 10.3 Deutsches Lightroom-Plug-in als MVP

- deutsche Oberfläche
- Artensuche und Taxonomievorschau
- Übernahme auf ausgewählte Fotos
- lokaler read-only Cache
- stabile Projekt-Art-ID

Ergebnis: getestetes MVP ohne konkurrierende Stammdatenpflege.

### 10.4 Erweiterte Lightroom-Funktionen

Erst nach erfolgreichem MVP bewerten:

- Referenzbild pro Art
- intelligente Sammlungen
- Lifelist und Statistiken
- Konfliktprüfung
- kontrollierter Export für Website oder Explorer

Ergebnis: einzeln priorisierte Erweiterungen statt eines unkontrollierten Funktionsblocks.

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

1. Zugriff des Lightroom-Plug-ins: Datenbank, read-only API oder Export
2. Metadaten- und XMP-Modell in Lightroom
3. optionales NAS-Paket für die große Referenzdatenbank in Phase 11
4. Verteilung und Versionsabgleich im späteren Mehrgerätebetrieb der Phase 11

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
- Die Teilphasen 9.1 bis 9.6 sowie 10.1 bis 10.5 besitzen klare Ergebnisse und Freigabepunkte.
- Offene Entscheidungen sind ausdrücklich als offen gekennzeichnet.
- Bestehender produktiver Artenbestand und globale Referenzdatenbank sind eindeutig getrennt.
- Der begrenzte Prototyp besitzt direkte Tests und reproduzierbare Messwerte.
- Produktive Daten, Abhängigkeiten und große Datenbankdateien wurden nicht verändert.
- Keine Phase wird ohne dokumentiertes umfassendes Abschlussaudit als abgeschlossen markiert.
