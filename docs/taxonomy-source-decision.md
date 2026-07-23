# Quellenentscheidung für die globale Taxonomiereferenz

Stand: 2026-07-23

Status: Phase 9.1 abgeschlossen; verbindliche Grundlage für Phase 9.2 und alle folgenden Importphasen

## 1. Ergebnis

Für die spätere lokale Taxonomiereferenz gilt folgende Quellenstrategie:

1. **Catalogue of Life Extended Release (CoL XR)** ist die primäre globale Referenz für Suche, akzeptierte
   wissenschaftliche Namen, Synonyme, Hierarchien und stabile Quellen-IDs.
2. **Catalogue of Life Base Release** wird nicht als zweiter Datenbestand importiert. Die XR-Daten müssen jedoch
   erkennen lassen, welche Einträge aus dem fachlich stärker kuratierten Base Release stammen und welche nur durch
   die erweiterte Zusammenführung ergänzt wurden.
3. **WoRMS** ist die fachliche Ergänzungs- und Validierungsquelle für marine und brackische Taxa. WoRMS überschreibt
   CoL nicht still. Abweichungen werden mit beiden Quellen-IDs sichtbar als Konflikt dargestellt.
4. **GBIF** ist keine zweite aktuelle Primärtaxonomie. GBIF wird für die Zuordnung alter GBIF-Backbone-IDs, spätere
   Vorkommensabfragen und Kartenbezüge genutzt. Die aktuelle GBIF-Webtaxonomie basiert selbst auf CoL XR.
5. **Wikidata** darf später ausschließlich deutsche Namensvorschläge, Aliasse und externe Kennungen ergänzen.
   Wikidata ist keine taxonomische Autorität; jeder Vorschlag bleibt quellenmarkiert und bestätigungspflichtig.
6. **Animalia.bio** bleibt eine manuell nutzbare redaktionelle Referenz für Tiere. Es erfolgt kein automatisches
   Auslesen und kein Scraping, solange keine dokumentierte öffentliche API, kein versionierter Bulk-Export und
   keine belastbare maschinelle Nutzungsvereinbarung vorliegen.
7. **IUCN Red List** bleibt die bestehende Quelle für Gefährdungs- und Assessmentdaten der tatsächlich angelegten
   Projektarten. IUCN ist nicht der globale Taxonomie-Backbone.

Phase 9.1 führt noch keinen produktiven Download oder Import aus. `species_list.json`, `speciesData.json`, Assets,
URLs und die bestehende Website bleiben unverändert.

## 2. Verbindliche Anforderungen

Die Quellenstrategie und die in Phase 9.2 zu planende lokale Technik müssen folgende Anforderungen erfüllen:

- globale Abdeckung von Tieren, Pflanzen, Pilzen und weiteren taxonomischen Gruppen
- akzeptierte wissenschaftliche Namen, Synonyme, Rang und Elternbeziehung
- reproduzierbare, fest angegebene Quellenversion statt eines stillen Imports von `latest`
- dauerhafte Speicherung von Quelle, Quellen-ID, Release, Abrufdatum und Lizenzhinweis
- Unterscheidung zwischen fachlich kuratierten Base-Einträgen und ausschließlich in XR ergänzten Einträgen
- kontrollierte Behandlung von Synonymen, Homonymen, infraspezifischen Rängen und ausgestorbenen Taxa
- deutsche Namen nur mit Herkunft, Sprache und Bestätigungsstatus
- keine erfundenen Übersetzungen und keine automatische Ersetzung bestehender Projektnamen
- Offline-Suche nach abgeschlossenem lokalem Import
- kontrollierte Vorschau und Bestätigung vor einer Übernahme in den produktiven Artenbestand
- keine stille Änderung vorhandener Taxonomie, URL-Slugs, Assetnamen oder Assetordner
- vollständiger Ausschluss großer Quelldateien und lokaler Referenzdatenbanken aus Git und GitHub Pages
- atomare Aktualisierung, Qualitätsprüfung und Rollback auf den letzten freigegebenen Stand
- nachvollziehbare Konfliktanzeige, wenn globale und fachliche Quelle voneinander abweichen

## 3. Bewertete Quellen

### 3.1 Catalogue of Life

Die offizielle [Downloadseite von Catalogue of Life](https://www.catalogueoflife.org/data/download) bietet
versionierte Base- und Extended-Releases in ColDP, Darwin Core Archive und weiteren Formaten. Zum
Recherchezeitpunkt waren dort unter anderem veröffentlicht:

| Release | Datum | Namen | Arten | integrierte Quellen |
| --- | --- | ---: | ---: | ---: |
| Extended Release | 2026-07-17 | 7.871.065 | 2.496.219 | 226 plus 21.085 Publisher-Quellen |
| Base Release | 2026-07-14 | 5.413.595 | 2.258.977 | 160 |

Catalogue of Life beschreibt auf der Seite
[Releases](https://www.catalogueoflife.org/building/releases) das Base Release als fachlich kuratierten,
überschneidungsarmen Kernbestand und das Extended Release als auf Vollständigkeit ausgerichtete Erweiterung. Die
[Metadatendokumentation](https://www.catalogueoflife.org/data/metadata) beschreibt, dass XR den Base-Bestand
erhält und ergänzte Datensätze unterscheidbar bleiben. Monatliche und jährliche Versionen sowie historische
Releases ermöglichen reproduzierbare Importe. Die
[Datennutzungsseite](https://www.catalogueoflife.org/data) nennt CC BY 4.0, wobei Provenienz und Zitation der
integrierten Quelldatensätze erhalten bleiben müssen.

**Entscheidung:** CoL XR ist der einzige globale Primärbestand. Dadurch wird die breite Abdeckung von XR genutzt,
ohne den fachlichen Vertrauensunterschied zum Base-Kern zu verlieren. Der spätere Import muss die entsprechenden
Herkunfts- beziehungsweise Merge-Merkmale mitführen.

### 3.2 GBIF

GBIF hat 2026 die Standardtaxonomie seiner Website auf Catalogue of Life XR umgestellt. Der offizielle
[Migrationshinweis](https://data-blog.gbif.org/post/catalogue-of-life-taxonomic-backbone/) beschreibt CoL XR als
neuen Backbone und dokumentiert den `checklistKey` `7ddf754f-d193-4cc9-b351-99906754a03b`. Der frühere
[GBIF Backbone Taxonomy](https://www.gbif.org/dataset/d7dddbf4-2cf0-4f39-9b2a-bb099caae36c) bleibt aus
Kompatibilitätsgründen erreichbar, wurde zuletzt 2023 aktualisiert und wird nicht weitergeführt.

**Entscheidung:** Ein separater Import des alten GBIF Backbone würde veraltete beziehungsweise doppelte
Taxonomie erzeugen. GBIF wird später nur als Diensteschicht für Alt-ID-Mapping, Taxonabgleich, Vorkommensdaten und
Kartenbezüge angebunden.

### 3.3 World Register of Marine Species

Der offizielle [WoRMS-Webservice](https://www.marinespecies.org/aphia.php?p=webservice) stellt AphiaIDs,
akzeptierte Namen, Synonyme, Klassifikationen, Vernakularnamen, Quellen, Änderungsinformationen und externe
Kennungen bereit. WoRMS weist ausdrücklich darauf hin, dass die API nicht zum vollständigen Harvesting gedacht ist.
Für einen vollständigen Bestand existiert ein
[separater Datenantrag](https://www.marinespecies.org/usersrequest.php) mit Darwin-Core-Export,
Attributionspflichten und Bedingungen für regelmäßige Aktualisierungen.

**Entscheidung:** Für den begrenzten Prototyp in Phase 9.3 darf die API artweise für marine Testtaxa verwendet
werden. Ein vollständiger lokaler WoRMS-Import ist erst nach dokumentierter Zustimmung zu den Dump-Bedingungen
zulässig. CoL-ID und AphiaID werden getrennt gespeichert. Ein WoRMS-Konflikt erzeugt einen Prüfhinweis und niemals
einen automatischen Austausch.

### 3.4 Wikidata

Wikidata bietet laut offizieller
[Datenzugriffsdokumentation](https://www.wikidata.org/wiki/Help:Data_access) JSON-Entitäten, APIs, SPARQL und
vollständige Dumps. Die strukturierten Daten stehen laut
[Wikidata Copyright](https://www.wikidata.org/wiki/Wikidata:Copyright) unter CC0. Mehrsprachige Labels und Aliasse
sind verfügbar, aber nicht eindeutig und nicht automatisch taxonomisch verlässlich.

**Entscheidung:** Wikidata ist eine optionale Vorschlagsquelle für deutsche Bezeichnungen und externe IDs. Ein
Vorschlag muss über eine bereits bekannte CoL-ID, eine belastbare externe ID oder eine explizite Benutzerentscheidung
zugeordnet werden. Wikidata definiert weder den akzeptierten Namen noch die Hierarchie.

### 3.5 Animalia.bio

[Animalia.bio](https://animalia.bio/) bietet redaktionelle Tierprofile, wissenschaftliche Klassifikationen und
mehrsprachige Inhalte. Auf den öffentlich sichtbaren Seiten wird für Textinhalte CC BY-SA 3.0 genannt; Bildrechte
können abweichen. Bei der Recherche wurde jedoch keine dokumentierte öffentliche API, kein versionierter
Bulk-Download, kein Releasearchiv und kein stabiler maschineller Taxon-ID-Vertrag gefunden.

**Entscheidung:** Animalia.bio kann bei einer redaktionellen Einzelfallprüfung im Browser herangezogen werden,
aber nicht automatisiert importiert oder gescrapt werden. Eine spätere Neubewertung ist nur sinnvoll, wenn der
Anbieter eine offizielle maschinelle Schnittstelle und eindeutige Nutzungsbedingungen veröffentlicht.

### 3.6 IUCN Red List

IUCN bleibt für die bereits angebundene Gefährdungskategorie, Populationstrends, Assessments und
Verbreitungskarten zuständig. Diese Daten gelten nur für bewertete Arten und ersetzen deshalb keinen globalen
Taxonomie-Backbone.

## 4. Entscheidungsmatrix

| Quelle | Abdeckung | Namen, Synonyme und Hierarchie | Versionierung und Zugriff | Deutsche Namen | Rolle |
| --- | --- | --- | --- | --- | --- |
| CoL XR | globaler All-life-Ansatz über zahlreiche taxonomische Reiche | akzeptierte Namen, Synonyme, Ränge, Elternbeziehungen und Provenienz | monatliche/jährliche versionierte Releases; ColDP/DwCA; CC BY 4.0 mit Quellenprovenienz | teilweise, nicht vollständig | **primärer globaler Referenzbestand** |
| CoL Base | globaler kuratierter Kern | fachlich stärker kuratierter, überschneidungsarmer Kern | Teil von XR unterscheidbar; eigene versionierte Releases | teilweise | Vertrauensstufe innerhalb des XR-Imports |
| GBIF | globaler Daten- und Vorkommensdienst | aktueller Website-Backbone basiert auf CoL XR; Alt-IDs weiterhin relevant | APIs, Alt-ID-Mapping und Occurrence-Dienste | teilweise | Diensteschicht, kein zweiter Backbone |
| WoRMS | marine und brackische Taxa | hohe Fachspezialisierung, AphiaID, Synonyme, Hierarchie, Quellen | REST für Einzelabfragen; vollständiger Dump nur nach Antrag und Bedingungen | teilweise | marine Validierung und Ergänzung |
| Wikidata | global, heterogen | Labels, Aliasse und externe IDs; keine verlässliche Primärhierarchie | API/SPARQL/Dumps; CC0 | breit, aber uneinheitlich | optionale Namens- und ID-Vorschläge |
| Animalia.bio | Tiere, redaktionell | sichtbare Profile und Klassifikation, kein dokumentierter Massenzugriff | kein freigegebener versionierter Bulk-/API-Weg festgestellt | mehrsprachige Redaktion | ausschließlich manuelle Referenz |
| IUCN | bewertete Arten | Assessment-Taxon und Schutzdaten, keine vollständige globale Taxonomie | bestehende API-Anbindung | nicht maßgeblich | Schutzstatus und bestehende Projektdaten |

### 4.1 Größen- und Betriebsbewertung

Die knapp 7,9 Millionen Namen des recherchierten CoL-XR-Stands schließen eine einfache JSON-Datei als belastbare
Volltext- und Synonymsuche aus. Phase 9.2 muss deshalb einen indexierten lokalen Bestand, freien Speicher,
Staging und atomaren Austausch entwerfen. Eine konkrete MiB-/GiB-Zahl wird nicht aus Datensatzanzahlen geschätzt,
sondern im begrenzten Importprototyp mit komprimierter Quelle, entpackten Dateien, Datenbank und Indizes getrennt
gemessen.

Für WoRMS genügt in Phase 9.3 die artweise API-Prüfung der marinen Testtaxa. Ein vollständiger WoRMS-Dump würde
zusätzliche Vertrags-, Import- und Aktualisierungspflichten auslösen und ist nicht Teil des ersten Prototyps.
GBIF, Wikidata und Animalia.bio werden ebenfalls nicht als parallele Vollbestände importiert. Damit bleibt der
erste technische Entwurf auf genau einen globalen Primärbestand plus kleine, klar abgegrenzte Ergänzungsabfragen
beschränkt.

## 5. Prioritäts- und Konfliktregeln

1. Der akzeptierte globale wissenschaftliche Name und die Standardhierarchie stammen aus dem fest installierten
   CoL-XR-Release.
2. Die Qualitätseinstufung `Base` beziehungsweise `XR-Ergänzung` wird sichtbar gespeichert. Ein XR-Eintrag ist
   suchbar, wird aber nicht als gleich stark kuratiert ausgegeben.
3. Für marine oder brackische Taxa wird WoRMS zusätzlich abgefragt beziehungsweise aus einem später genehmigten
   Bestand verglichen.
4. Stimmen CoL und WoRMS überein, werden beide IDs und Quellenbelege gespeichert.
5. Weichen akzeptierter Name, Rang oder Hierarchie ab, bleiben beide Werte erhalten. Der Explorer zeigt den
   Konflikt und verlangt eine Entscheidung; keine Quelle überschreibt die andere automatisch.
6. GBIF darf einen alten GBIF-Key auf den aktuellen CoL-XR-Taxonbezug abbilden, aber keine konkurrierende
   Hierarchie erzeugen.
7. Deutsche Namen sind Vorschläge mit Sprache, Quelle und Status. Ein bereits bestätigter Projektname hat Vorrang.
8. Wikidata- und Animalia-Namen werden nie allein durch Zeichenkettenähnlichkeit produktiv übernommen.
9. IUCN-Daten werden erst nach bestätigter Projektart und bestehender Assessment-Zuordnung ergänzt.
10. Jede produktive Übernahme bleibt eine explizite Benutzerentscheidung mit Vorschau.

## 6. Release- und Aktualisierungsstrategie

- Die installierte Referenz nennt immer Quelle, exakte Releasekennung, Veröffentlichungsdatum, Importdatum und
  Prüfsumme.
- Der spätere Produktionskanal verwendet ein freigegebenes jährliches CoL-XR-Release als stabilen Stand.
- Monatliche CoL-XR-Releases dürfen als Kandidat in einen getrennten Staging-Bestand importiert werden.
- Ein Kandidat wird erst nach Schema-, Mengen-, Stichproben- und Konflikttests freigegeben.
- Der Wechsel erfolgt atomar; der letzte freigegebene Stand bleibt für Rollback verfügbar.
- Ein Quellenupdate ändert keine Projektart und startet keine IUCN-/Assetpipeline.
- WoRMS-API-Abfragen werden im Prototyp mit Abrufzeitpunkt protokolliert. Ein späterer Bulk-Bestand braucht eine
  eigene Release-/Dumpkennung und die dokumentierte Einhaltung der WoRMS-Bedingungen.
- GBIF-, Wikidata- oder IUCN-Onlinedaten werden nicht unkontrolliert in den globalen Primärbestand gemischt.

Die Rechercheaufnahme vom 2026-07-23 dokumentiert CoL XR 2026-07-17 und Base 2026-07-14. Der konkrete
Phase-9.3-Testimport muss beim Start erneut eine exakte, dann verfügbare Releasekennung festschreiben; `latest` ist
kein zulässiger reproduzierbarer Teststand.

## 7. Mindest-Provenienz für Phase 9.2

Das technische Schema wird erst in Phase 9.2 festgelegt. Unabhängig von der Speichertechnik müssen mindestens
folgende Informationen verlustfrei abbildbar sein:

- interne, quellenunabhängige Referenz
- Quellenname und Quelldatensatz
- exakte Release- oder Abrufkennung
- Quellen-Taxon-ID
- akzeptierte Quellen-Taxon-ID
- Eltern-Taxon-ID
- wissenschaftlicher Name und Autorschaft
- Rang und taxonomischer Status
- Synonymbeziehung
- vollständige verfügbare Klassifikation
- CoL-Vertrauensstufe `Base` oder `XR-Ergänzung`
- zusätzlicher AphiaID-Bezug und WoRMS-Status bei Meerestieren
- Vernakularname, Sprachcode, Quelle und Bestätigungsstatus
- Lizenz- und Zitationshinweis
- Import- oder Abrufzeitpunkt
- Konflikt-, Match- und Prüfstatus
- Prüfsumme beziehungsweise reproduzierbarer Quelldateibezug

## 8. Repräsentative Testtaxa für Phase 9.3

| Testtaxon | Prüffall | Erwartung |
| --- | --- | --- |
| `Turdus merula` | häufige Projektart mit deutschem Namen | exakter akzeptierter Treffer, vollständige Hierarchie, deutscher Namensvorschlag mit Quelle |
| `Cyanistes caeruleus` / `Parus caeruleus` | historisches Synonym und Gattungswechsel | Synonym führt eindeutig zum akzeptierten Taxon, ohne den eingegebenen Namen zu verlieren |
| `Saimiri oerstedii` | bestehende außereuropäische Tierart | exakter Treffer und reproduzierbare Quellen-ID |
| `Megaptera novaeangliae` | marines Säugetier | CoL- und WoRMS-Bezug, AphiaID und Konfliktvergleich |
| `Solea solea` | mariner Fisch | marine Hierarchie, Synonyme und Vernakularnamen aus CoL/WoRMS getrennt nachvollziehbar |
| `Asterias rubens` | marines Wirbelloses | WoRMS-Fachabdeckung außerhalb der bisherigen Wirbeltierlastigkeit |
| `Quercus robur` | Pflanze | globale Suche funktioniert außerhalb von Animalia |
| `Amanita muscaria` | Pilz | Hierarchie und deutsche Namensquelle außerhalb von Tierdaten |
| `Escherichia coli` | Bakterium | abweichende Rang- und Namenskonventionen werden ohne Annahmen importiert |
| `Aotus` | Homonym in Tier- und Pflanzenreich | Suche zeigt mehrere Taxa und wählt keines still aus |
| `Panthera leo persica` | infraspezifischer Rang | Unterart und Beziehung zur Art bleiben erhalten |
| `Tyrannosaurus rex` | ausgestorbenes Taxon | Status und Hierarchie werden erhalten; fehlende aktuellen Schutzdaten sind kein Fehler |

Zusätzlich werden mindestens ein Fall mit fehlendem deutschem Namen, ein Konflikt zwischen CoL und WoRMS, ein
ungültiger Name, eine unbekannte Quellen-ID und ein beschädigter beziehungsweise abgebrochener Import getestet.

## 9. Abnahmekriterien für den Phase-9.3-Prototyp

Der spätere begrenzte Prototyp gilt nur dann als fachlich erfolgreich, wenn:

- alle Testtaxa reproduzierbar aus demselben festgeschriebenen CoL-Release geladen werden,
- Synonym, Homonym, Unterart und ausgestorbenes Taxon korrekt unterschieden werden,
- CoL-Base- und XR-Ergänzungsstatus erhalten bleiben,
- marine Testtaxa zusätzlich mit WoRMS verglichen und über AphiaID nachvollziehbar sind,
- deutsche Namen ausschließlich mit Quelle und Bestätigungsstatus erscheinen,
- Mehrdeutigkeiten keine automatische Auswahl auslösen,
- ein Konflikt beide Quellensichten erhält,
- Offline-Suche, Importdauer und Speicherbedarf gemessen werden,
- Abbruch und Rollback keine halbfertige Referenz aktivieren,
- keine produktive Projektdatei, kein Asset und kein GitHub-Pages-Artefakt verändert wird.

## 10. Übergabe an Phase 9.2

Phase 9.2 erstellt auf dieser Grundlage den verbindlichen technischen Entwurf für:

- lokale Speichertechnik und Pfadkonfiguration,
- Schema für Releases, Taxa, Namen, Hierarchien, Provenienz und Konflikte,
- Import von CoL XR mit Base-/XR-Vertrauensstufe,
- begrenzten WoRMS-Abgleich,
- Suchindizes und erwartete Antwortzeiten,
- Staging, atomare Freigabe, Rollback und Temp-Bereinigung,
- Ausschluss der großen Referenzdaten aus Git, Pages und normalen Projekt-Commits,
- getrennte Sicherung eigener Übersetzungen, Projektzuordnungen und Entscheidungen.

Diese Übergabe wurde am 2026-07-23 mit `docs/local-taxonomy-database-design.md` abgeschlossen. Darin sind
Datenbanktechnik, lokaler Installationspfad, Indexdesign, Import-, Staging- und Rollbackablauf sowie die Trennung
von Referenz- und Projektdaten verbindlich festgelegt. Der tatsächliche Speicherbedarf wird in Phase 9.3 gemessen.
Lightroom-Zugriffsweg und spätere Datenverteilung auf mehrere Computer bleiben Themen der dafür vorgesehenen
Teilphasen.
