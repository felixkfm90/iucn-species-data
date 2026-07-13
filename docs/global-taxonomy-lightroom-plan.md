# Globale Taxonomiedatenbank und Lightroom-Integration

Stand: 2026-07-12

Status: geplant, noch keine technische Festlegung und keine produktive Implementierung

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

Dieses Dokument beschreibt Anforderungen, Architekturvarianten, Entscheidungspunkte, Risiken und Teilphasen. Es
legt noch keine endgültige Datenquelle, Datenbanktechnik oder Lightroom-Anbindung fest.

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

Vor einer technischen Umsetzung werden die P0-Punkte aus
`docs/audits/2026-07-repository-audit.md` abgeschlossen: Assetformat und Pages-Größe stabilisieren, die schreibende
localhost-API absichern und verpflichtende CI-Qualitätsprüfungen einführen. Die neue Referenzdatenbank darf diese
Stabilisierungsarbeiten nicht umgehen oder verzweigen.

Das bereits geplante Redesign der Taxonomie-Pyramide ist ein getrenntes Thema. Es verbessert die dynamische
HTML-/CSS-Ausgabe vorhandener Taxonomiedaten. Phase 9 plant dagegen Herkunft, Suche, Speicherung und kontrollierte
Übernahme einer viel größeren Referenzdatenbasis.

## B. Zu prüfende Taxonomiequellen

Mindestens folgende Kandidaten werden in Phase 9.1 anhand derselben Kriterien untersucht:

| Kandidat | Rolle in der Prüfung | Noch zu klären |
| --- | --- | --- |
| Catalogue of Life | Kandidat für einen breit angelegten globalen Taxonomiebestand | Abdeckung, Versionierbarkeit, Lizenz, IDs, Synonyme, Namen, Download und Importaufwand |
| GBIF Backbone beziehungsweise GBIF Species-Daten | Kandidat für globale Suche, Taxon-IDs und Namensabgleich | Datenmodell, Versionen, Lizenz, Synonyme, Hierarchien, Download und Aktualisierung |
| Weitere globale Quelle | Nur aufnehmen, wenn ein dokumentierter Mehrwert gegenüber den Hauptkandidaten besteht | zusätzlicher Umfang, bessere Kuratierung, bessere Namen oder geringerer Betriebsaufwand |
| WoRMS oder andere Fachquelle | Optionale Ergänzung für klar abgegrenzte Artengruppen | fachlicher Mehrwert, Überschneidungen, Prioritätsregeln und Lizenzkompatibilität |

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

In diesem Planungsschritt wird keine Quelle ausgewählt. Auch eine Kombination mehrerer Quellen ist erst nach einer
schriftlichen Prioritäts-, Provenienz- und Konfliktregel zulässig.

## C. Lokale Speicherung

Eine lokale indexierte Datenbank, beispielsweise SQLite, ist ein zu prüfender Kandidat, aber noch keine
Festlegung. Verglichen werden mindestens:

1. eine einzelne lokale Datenbankdatei mit geeigneten Indizes,
2. eine andere eingebettete Such-/Datenbanktechnik,
3. ein kompakter, vorgenerierter read-only Suchindex zusätzlich zu getrennten Quelldaten.

Die Bewertung muss Installation, Wartbarkeit, Suchgeschwindigkeit, Datenmenge, atomare Updates, Lightroom-Zugriff
und Verteilung auf mehrere Rechner berücksichtigen.

Unabhängig von der späteren Technik gelten folgende Anforderungen:

- Speicherort außerhalb des Git-Repositories und außerhalb des Pages-Artefakts
- pfadunabhängige lokale Konfiguration statt festem Laufwerksbuchstaben
- keine vollständigen Quelldownloads, Importdateien oder Datenbanken in GitHub
- Suche nach wissenschaftlichem Namen, deutschem Namen, Synonym und Taxon-ID
- Präfix- und gegebenenfalls Volltextsuche mit messbarer Antwortzeit
- dokumentiertes Schema und kontrollierte Schema-Migrationen
- Fortschritt für Download, Entpacken, Prüfen, Importieren und Indexieren
- Prüfung des freien Speicherplatzes vor Beginn
- sicherer Abbruch und, soweit sinnvoll, Wiederaufnahme
- Checksummen und Plausibilitätsprüfung der Quelldateien
- Speicherung von Quellenversion und Importzeitpunkt
- Testimport in einen neuen Zielbestand
- atomarer Wechsel von alter zu neuer freigegebener Version
- Rollback auf die zuletzt funktionierende Version
- definierte Aufbewahrung von höchstens einer notwendigen Vorversion, sofern Tests nichts anderes erfordern
- kontrollierte Bereinigung temporärer Download- und Importdateien

Eine mögliche, noch unverbindliche Datenflussvariante ist:

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

Die Trennung der reproduzierbaren Quelldaten von eigenen, nicht reproduzierbaren Entscheidungen ist eine
verbindliche Anforderung; ihre konkrete Dateiform bleibt offen.

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

Als konzeptionelle, nicht verbindliche Entitäten sind zu prüfen:

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

Die spätere Integration wird erst nach Quellen-, Datenmodell- und Importentscheidung umgesetzt. Konzeptionell soll
der Neue-Art-Assistent dann anbieten:

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

- Catalogue of Life, GBIF und begründete Alternativen mit einer einheitlichen Matrix vergleichen
- Lizenz, Datenmodell, Umfang, Namen, IDs, Versionierung und Updateweg prüfen
- repräsentative Beispiel-Taxa und Problemfälle festlegen
- Entscheidungsvorlage erstellen, ohne bereits produktiv zu importieren

Ergebnis: freigegebene Entscheidungsvorlage für Quelle beziehungsweise Quellenstrategie.

### 9.2 Lokales Datenbank- und Importkonzept

- Speicherort und Pfadunabhängigkeit
- Datenbankschema und Provenienzmodell
- Suchindizes und erwartete Performance
- Import-, Versions-, Rollback- und Temp-Konzept
- Speicherbedarf und Git-/Pages-Ausschluss
- Trennung reproduzierbarer Referenzdaten von eigenen Entscheidungen

Ergebnis: verbindlicher technischer Entwurf, noch ohne vollständigen Datenimport.

### 9.3 Import-Prototyp mit begrenztem Testbestand

- nur ein repräsentativer Testbestand verschiedener Artengruppen
- wissenschaftliche Namen, Synonyme, Hierarchien und deutsche Namen prüfen
- Suchleistung, Datenqualität, Importdauer und Speicherbedarf messen
- Fehler-, Abbruch- und Rollbackfälle testen

Ergebnis: Messbericht und Freigabe- oder Änderungsentscheidung für das Konzept.

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

## Offene Architekturentscheidungen

Vor der jeweiligen Implementierungsphase müssen mindestens diese Entscheidungen ausdrücklich getroffen werden:

1. primäre globale Quelle, ergänzende Quellen und Prioritätsregeln
2. Lizenz- und Attributionsmodell je verwendeter Quelle
3. lokale Speichertechnik und Suchindex
4. Schema für Synonyme, Hierarchien, Sprachdaten und Provenienz
5. Speicherort und Installationsweg
6. Vollimport gegenüber möglichem inkrementellem Update
7. Sicherungsgrenze zwischen reproduzierbaren Referenzdaten und eigenen Projektentscheidungen
8. Konfliktworkflow für bestehende Arten
9. Zugriff des Lightroom-Plug-ins: Datenbank, read-only API oder Export
10. Metadaten- und XMP-Modell in Lightroom
11. Verteilung und Versionsabgleich im späteren Mehrgerätebetrieb

Keine dieser Entscheidungen wird durch dieses Planungsdokument vorweggenommen.

## Nicht Bestandteil dieses Planungsschritts

- kein vollständiger Catalogue-of-Life- oder GBIF-Download
- keine SQLite- oder andere produktive Datenbank
- keine produktive Taxonomie-API
- keine Änderung an `species_list.json` oder `speciesData.json`
- keine funktionale Änderung an `update.mjs`
- kein Umbau des Neue-Art-Assistenten
- keine Lightroom-Plug-in-Datei
- keine neue npm-Abhängigkeit
- keine große Download-, Import- oder Datenbankdatei
- keine Migration bestehender Taxonomie
- keine Änderung an NAS-, Backup- oder Mehrgerätefunktionen

## Definition of Done für die Planungsphase

- Phase 9 ist vor der NAS-/Mehrgerätephase in der Roadmap eingeordnet.
- Die NAS-/Mehrgerätephase folgt als Phase 10.
- Anforderungen, Kandidaten, Datenmodell, Integration, Update, Lightroom und Sicherheitsregeln sind dokumentiert.
- Die Teilphasen 9.1 bis 9.9 besitzen klare Ergebnisse und Freigabepunkte.
- Offene Entscheidungen sind ausdrücklich als offen gekennzeichnet.
- Bestehender produktiver Artenbestand und globale Referenzdatenbank sind eindeutig getrennt.
- Es wurden keine Programmdateien, produktiven Daten, Abhängigkeiten oder großen Datenbankdateien verändert.
