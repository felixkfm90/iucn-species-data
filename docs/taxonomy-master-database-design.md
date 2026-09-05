# Taxonomie-Masterdatenbank – Phasen 9.6 bis 9.12

Stand: 2026-09-05

Status: Phase 9 abgeschlossen; der reale Wiederanlauf des am 2026-09-04 erkannten Referenz-Master-Drifts samt
automatischer Lightroom-Ableitung wurde am 2026-09-05 erfolgreich abgeschlossen und read-only geprüft.
Weißstorch und der Paket-/Masterstand sind inzwischen auch in Lightroom vom Benutzer bestätigt; Commit/Push sind
freigegeben. Die restliche Lightroom-Abnahme und die Auditpunkte stehen in `roadmap.md`.

## Ziel und verbindliche Quellenarchitektur

Die vollständige lokale Catalogue-of-Life-XR-Referenz bleibt unverändert und read-only. Eine getrennte lokale
Masterdatenbank verbindet sie mit versionierten Ergänzungen und eigenen Korrekturen:

```text
CoL XR
+ iNaturalist-Namens- und Lückenbestand
+ GBIF-Namen und Kennungen
+ WoRMS für marine und brackische Taxa
+ Wikidata-Taxonauszug
+ Animalia-Fallback für danach verbleibende, belegte Tierlücken
+ eigene Korrekturen
────────────────────────────────────────────────────────────
= lokale Masterdatenbank
```

Das Pluszeichen bedeutet nicht, dass externe Quellen CoL still überschreiben. CoL bleibt Primärbestand. Die
zusätzlichen Quellen schließen belegte Artlücken, ergänzen deutsche und englische Namen, Kennungen und bei Bedarf
Hierarchiestufen. Herkunft, Quellenstand und Entscheidung bleiben je Aussage nachvollziehbar. Ein neuer
Quellenstand wird nie allein aufgrund seines Datums als fachlich richtiger behandelt.

## Speichergrenze und Versionen

Die Daten liegen außerhalb von Repository, GitHub Pages und normalem Projekt-Backup:

```text
%LOCALAPPDATA%\FN Wildlife Travel\Arten-Explorer\taxonomy\
  releases\                         vollständige CoL-XR-Releases
  master\
    active\taxonomy-master.sqlite
    staging\taxonomy-master.sqlite
    previous\taxonomy-master.sqlite
    providers\                      versionierte Anbieterstände
```

Jeder Master-Slot besitzt ein `manifest.json`. `staging` enthält einen vollständig aufgebauten Kandidaten. Erst
nach Schema-, Integritäts-, Projekt- und Konfliktprüfung wird er atomar nach `active` verschoben. Genau eine
vorherige Version bleibt unter `previous` für Rollback erhalten. Abgebrochene Aktivierungen stellen den vorherigen
Stand automatisch wieder her; temporäre Staging- und Rollbackverzeichnisse werden bereinigt.

Die Speicherortentscheidung wird beim späteren Installer erneut geprüft.

## Quellen und lokaler Umfang

| Quelle | Lokaler Umfang | Aufgabe |
| --- | --- | --- |
| Catalogue of Life XR | vollständig, versioniert, read-only | globale Primärreferenz |
| iNaturalist | breiter versionierter Art-/Namensbestand | CoL-Artlücken sowie fehlende deutsche/englische CoL-Namen offline schließen |
| GBIF | versionierter relevanter Ausschnitt | Taxonlücken, Namen, Anbieter-IDs und Abgleich |
| WoRMS | versionierter relevanter Ausschnitt | marine und brackische Taxa |
| Wikidata | versionierter relevanter Ausschnitt | deutsche/englische Namen und externe IDs |
| Animalia | kontrollierter, quellenbelegter Fallback-Ausschnitt | verbleibende Tierlücken, für die kein freigegebener automatischer Massenzugriff besteht |
| Projekt | versionierte Projektzuordnung | stabile Verbindung zu Art und URL-Slug |
| Eigene Korrekturen | versionierte redaktionelle Aussagen | höchste Priorität und dauerhafter Schutz |

Der iNaturalist-Stand ist bewusst breiter als die übrigen externen Ausschnitte. Lokal aufgenommen werden exakte
Arten, die in CoL fehlen, sowie iNaturalist-Namen für CoL-Arten ohne deutschen oder englischen Namen. Dadurch sind
diese Lücken bereits vor einer konkreten Explorer-Suche offline verfügbar. GBIF, WoRMS und Wikidata werden dagegen
als versionierte relevante Ausschnitte für Projektarten, recherchierte Arten, offene CoL-Lücken, fehlende Namen
oder Hierarchiestufen und eigene Korrekturen gespeichert. Ihre vollständigen Weltbestände werden nicht gespiegelt.

Animalia besitzt keine dokumentierte, freigegebene, versionierte Bulk- oder API-Schnittstelle. Es wird deshalb
nicht automatisiert gescrapt. Belegte Animalia-Einzelfälle werden kontrolliert in
`taxonomy-animalia-fallbacks.json` gepflegt, beim Masteraufbau versioniert importiert und nur verwendet, wenn die
höher priorisierten Quellen die betreffende Tierlücke nicht schließen.

Jeder Anbieterstand enthält Anbieter und ID, wissenschaftlichen Namen, Rang, Hierarchie, deutsche und englische
Namen, Abrufzeitpunkt, Anbieterstand, Quellen-URL/Lizenz und den Zustand gegenüber der vorherigen Version.
Entfernte Quellenzeilen bleiben als `removed` beziehungsweise `stale` nachvollziehbar.

## Stabile Master-ID und Zustände

Jedes zusammengeführte Taxon besitzt eine anbieterunabhängige ID `mtx_<32 Hexzeichen>`. Der produktive
Master-Kandidatenbau leitet sie deterministisch aus normalisiertem wissenschaftlichem Namen, Rang und Reich ab.
Deutsche beziehungsweise englische Namen, Hierarchie, Anbieter-IDs und Projekt-Slugs sind Aussagen oder
Verknüpfungen und ändern diese Master-ID nicht. Ändert sich dagegen eine der drei Identitätskomponenten, entsteht
ohne eine ausdrücklich modellierte Nachfolgerbeziehung eine neue ID. Taxonomische Splits und Merges besitzen in
diesem Stand noch keine automatisch nutzbare Vorgänger-/Nachfolgerzuordnung.

Folgende kombinierbare Zustände werden geführt:

- `col-confirmed`: durch CoL bestätigt;
- `col-reference-gap`: exakte Art ist durch andere Quellen bestätigt, fehlt aber in CoL;
- `externally-confirmed`: mindestens eine geeignete externe Quelle bestätigt das Taxon;
- `conflicting`: relevante Aussagen widersprechen sich;
- `stale`: eine zuvor vorhandene Quellenaussage fehlt im neuen Quellenstand;
- `manually-protected`: ein Feld ist ausdrücklich redaktionell geschützt.

## Tabellen und Provenienz

- `provider_release`: versionierter Quellenstand mit Anbieter, Version, Umfang, Prüfsumme, Zeitpunkt und Lizenz;
- `master_taxon`: stabile ID, kanonischer wissenschaftlicher Name, Rang, Reich und Lebenszyklus;
- `provider_taxon_assertion`: unveränderte Taxonaussage eines Anbieter-Releases;
- `provider_slice_membership`: Grund, weshalb eine Anbieterzeile lokal gespeichert wird;
- `provider_name_assertion`: wissenschaftliche, synonyme und gebräuchliche Namen mit Sprache;
- `master_taxon_alias`: erhaltene Synonyme, frühere und projektbezogene Namen;
- `master_field_assertion`: einzelne Feldwerte mit Herkunft, Release, Konfidenz und Prüfstatus;
- `master_taxon_status`: kombinierbare Masterzustände;
- `master_conflict`: geänderte, entfernte, mehrdeutige oder zurückgekehrte Aussagen;
- `project_taxon_link`: stabile Verbindung zwischen Projektart, URL-Slug und Master-ID;
- `master_decision`: nachvollziehbare Entscheidungen zum Behalten, Übernehmen, Alias oder manuellen Schutz;
- `master_search_term`: vorberechneter Offline-Suchindex über wissenschaftliche, deutsche, englische und alternative
  Namen.

Damit ist für jeden ausgewählten Namen, Rang und Hierarchiewert nachvollziehbar, aus welchem Quellenstand er stammt.

## Verbindliche Zusammenführungsregeln

1. Ausdrücklich geschützte eigene Korrekturen und konkret gepflegte Projektfelder haben Vorrang.
2. CoL XR ist die globale Primärreferenz.
3. WoRMS ist nur für marine und brackische Taxa die bevorzugte Fachergänzung.
4. GBIF und iNaturalist ergänzen Taxonlücken und dienen dem Abgleich.
5. Wikidata ergänzt deutsche/englische Namen und externe IDs.
6. Animalia ergänzt ausschließlich danach verbleibende, kontrolliert belegte Tierlücken.
7. Eine Unterart wird niemals automatisch zur fehlenden Art hochgestuft.
8. Rein aus Anbietern stammende Hierarchiefelder folgen beim geprüften Neuaufbau der aktuellen Quellenpriorität;
   auch bei Projektarten entsteht daraus keine redaktionelle Fachentscheidung.
9. Synonyme, frühere Namen und alternative Namen bleiben erhalten.
10. Entfernte Anbieterzeilen werden zunächst als veraltet markiert statt gelöscht.
11. Widersprüche mit einem konkret manuell oder im Projekt gepflegten Feld werden als Konflikt zur Prüfung angezeigt.
12. Ein neuerer Quellenstand gewinnt bei ungeschützten Anbieterfeldern gemäß der festgelegten Quellenpriorität.
13. Exakte Zuordnungen berücksichtigen mindestens wissenschaftlichen Namen, Rang und Reich. Die Reichssynonyme
    `Animalia`, `Animal`, `Animals` und `Metazoa` werden dabei kontrolliert als dasselbe Reich behandelt; echte
    reichsübergreifende Homonyme bleiben getrennt.

Die technische Priorität ist: eigene Korrektur, bestätigter Projektwert, CoL XR, WoRMS, GBIF, iNaturalist,
Wikidata, Animalia. Diese Reihenfolge entscheidet nur bei fachlich vergleichbaren Aussagen; ein Konflikt wird
nicht durch eine höhere Zahl unsichtbar gemacht. Ein im Projekt ausdrücklich gepflegter deutscher oder englischer
Artname ersetzt jedoch einen bisherigen reinen Anbieterwert ohne zusätzlichen Scheinkonflikt; eine eigene manuelle
Korrektur bleibt weiterhin geschützt. Die bloße Verknüpfung eines Taxons mit einer Projektart schützt nicht pauschal
dessen alte Anbieterhierarchie. Alternative verifizierte Anbieternamen bleiben als Suchnamen erhalten.

## Kandidat, Konflikte und Aktivierung

Ein Update baut immer zuerst einen neuen Master-Kandidaten aus aktueller CoL-Referenz, Anbieterständen,
Projektzuordnungen und Korrekturen. Die Vorschau zeigt insbesondere:

- neue Taxa und geschlossene CoL-Lücken;
- geänderte wissenschaftliche, deutsche und englische Namen;
- neue Synonyme;
- entfernte oder veraltete Quelleneinträge;
- Hierarchieänderungen;
- Konflikte mit vorhandenen Projektarten.

Offene blockierende Konflikte verhindern die Aktivierung. Sie entstehen nur für konkret geschützte Felder oder
echte Mehrdeutigkeiten, nicht für gewöhnliche Änderungen einer CoL-Hierarchie. Die Explorer-Oberfläche nennt zuerst
den deutschen und danach den wissenschaftlichen Artnamen, erklärt das betroffene Feld und stellt bisherigen sowie
neuen Wert mit verständlicher Quellenbezeichnung gegenüber. Eine Aliasentscheidung wird ausschließlich bei
Namensfeldern angeboten. Unerwartet große technische Konfliktmengen werden nicht als tausende Einzelentscheidungen
ausgegeben, sondern verlangen einen erneuten Masteraufbau. Erst eine bestätigte, konfliktfreie Vorschau wird atomar
aktiviert.

Die laufende Statusanzeige verwendet nach der vollständigen Kandidatenprüfung nur noch die bereits geschriebenen
Manifestwerte, kompakte Differenzzähler und die wenigen blockierenden Konflikte. Sie wiederholt weder die
Vollvalidierung der mehrgigabytegroßen SQLite-Datei noch lädt sie alle nicht blockierenden Referenzlücken. Die
vollständige Integritäts- und Fachprüfung bleibt unmittelbar im Kandidatenbau und erneut an der Aktivierungsgrenze
verbindlich.

Interne numerische Zeilen-IDs einer CoL-SQLite sind ausdrücklich release-lokal. Anbieter-Ausschnitte dürfen sie
beim Wechsel auf einen neuen CoL-Release nicht als stabile Taxonkennung wiederverwenden. Der Neuaufbau löst die
gespeicherten wissenschaftlichen Namen deshalb erneut exakt im aktiven Release auf und akzeptiert einen
beschleunigten ID-Zugriff nur, wenn Referenzrelease und wissenschaftliche Identität nachweislich übereinstimmen.

## Explorer-Integration

Der Neue-Art-Assistent sucht bevorzugt in der aktiven Masterdatenbank. Für alle lokal enthaltenen Einträge ist die
Suche vollständig offline. Treffer zeigen Namen, Rang, Reich, Quellen und Masterstatus; eine CoL-Referenzlücke wird
verständlich gekennzeichnet. Eine bewusst ausgewählte extern recherchierte Art wird für den nächsten
Anbieterabgleich vorgemerkt. Der breite iNaturalist-Stand sorgt zusätzlich dafür, dass bekannte CoL-Lücken und
fehlende Namen nicht erst durch diese Auswahl lokal werden. Falls noch keine Masterdatenbank installiert ist,
bleibt die bisherige lokale CoL-/Ergänzungssuche als sichere Rückfallebene erhalten.

Unter `Datenbank-Aktionen > Taxonomiereferenz` können Anbieterstände aktualisiert, ein neuer Master-Kandidat
aufgebaut, Konflikte entschieden, der Kandidat aktiviert oder die vorherige Version wiederhergestellt werden.
Fortschritt und Abschlusszustand bleiben im Dialog sichtbar.

## Regression `Sciurus vulgaris`

Der reale Sonderfall ist verbindlich abgesichert:

1. CoL enthält im verwendeten Stand nur zugehörige Unterarten, aber keine exakte Artzeile `Sciurus vulgaris`.
2. GBIF und iNaturalist bestätigen die Art; Wikidata liefert den deutschen Namen.
3. `Animalia`, `Metazoa` und ein fehlender Reichswert werden zu genau einem Projekt-Taxon zusammengeführt.
4. Es entsteht genau eine stabile Master-ID mit `col-reference-gap`.
5. Der bestehende Projekt-Slug `sciurusvulgaris` bleibt unverändert.
6. Liefert CoL später die exakte Art, wird nur die Referenzlücke geschlossen; es entsteht kein zweiter Datensatz.

Beim Wechsel der aktiven CoL-Referenz werden auch in vorhandenen Anbieter-Ausschnitten als Referenzlücke markierte
Arten erneut gegen die neue CoL-Version geprüft. Nur bei unveränderter Referenz darf die bekannte Lückenklassifikation
als Abkürzung wiederverwendet werden. So wird etwa `Ciconia ciconia` nicht wegen eines älteren
iNaturalist-Ausschnitts fälschlich weiter als Referenzlücke geführt, wenn die aktive CoL-Datenbank inzwischen eine
exakte Artzeile enthält.

Weitere Tests decken Homonyme, Synonyme, manuell geschützte Werte, doppelte Anbieter-IDs, Anbieter-Ausfälle,
entfernte Quelleneinträge, unterbrochene Aktivierung und Rollback ab.

## Reale Migration vom 9. August 2026

Der reale Neuaufbau verwendet die vollständige aktive CoL-XR-Referenz und den breiten vorbereiteten
iNaturalist-DwC-Ausschnitt für CoL-Artlücken und fehlende deutsche beziehungsweise englische CoL-Namen. Danach
folgen die versionierten relevanten GBIF-, WoRMS-, Wikidata- und Animalia-Stände sowie Projektarten und eigene
Korrekturen. Der Kandidat `master-20260809091930709` wurde im lokalen Anwendungsdatenordner atomar aktiviert.

Der aktive reale Bestand enthält:

- 273.505 Master-Taxa und 430.675 Anbieteraussagen;
- 1.762.462 Namen, 707.152 Aliasse und 4.665.388 feldweise Provenienzeinträge;
- 7.108.393 vorbereitete Suchbegriffe;
- 155.684 durch CoL bestätigte Taxa, 117.821 CoL-Referenzlücken, 174 extern bestätigte und 17 manuell geschützte
  Taxa;
- 54 von 54 eindeutig verknüpfte Projektarten ohne fehlende oder abweichende Zuordnung;
- eine aktive SQLite-Datei mit rund 5.773 MiB und genau eine gleich große Rollbackversion. Der gesamte
  Masterbereich einschließlich versionierter Anbieterstände belegt rund 12.453 MiB in 34 Dateien.

Die vollständige Projektprüfung benötigte rund 76 ms beziehungsweise durchschnittlich rund 1,4 ms je Art.
Exakte Offline-Suchen nach `Sciurus vulgaris`, `Coracias caudatus`, `Panthera pardus` und `Calidris alpina`
antworteten jeweils in etwa 1 bis 7 ms. Die vier zuvor fehlenden Master-Reichswerte werden nur bei einem
eindeutigen CoL-Gattungsbeleg ergänzt; Rohwerte der Anbieter bleiben davon getrennt erhalten. Zusätzlich werden
die Anbieterwerte `Animal` und `Viridiplantae` an der Mastergrenze nachvollziehbar zu `Animalia` und `Plantae`
normalisiert.

Der reale Rollbacktest stellte die vorherige Version wieder her und aktivierte anschließend den geprüften
Kandidaten erneut. `active`, `previous`, `staging` und `work` waren danach konsistent; temporäre Test- und
Importartefakte blieben nicht zurück.

## Implementierung und Tests

Zentrale Module:

- `taxonomy-master-schema.mjs`, `taxonomy-master-model.mjs`, `taxonomy-master-store.mjs`;
- `taxonomy-master-rules.mjs`, `taxonomy-master-slices.mjs`, `taxonomy-master-candidate.mjs`;
- `taxonomy-master-lifecycle.mjs`, `taxonomy-master-service.mjs`;
- `taxonomy-inaturalist-client.mjs`, `taxonomy-inaturalist-snapshot.mjs` und
  `scripts/taxonomy-inaturalist-import.mjs` für den breiten, versionierten iNaturalist-Bestand;
- `taxonomy-provider-refresh-service.mjs` für die verbindliche Quellenreihenfolge;
- `taxonomy-animalia-fallback.mjs` und `taxonomy-animalia-fallbacks.json` für kontrollierte letzte Tierlücken;
- `public/app-taxonomy-master.js` und die Master-Routen im lokalen Server;
- `scripts/taxonomy-master-migrate.mjs` für Migration, Verifikation, Messung, Aufräumen und Rollbacktest.

Fokussierte Prüfung:

```powershell
npm.cmd run --silent test:taxonomy-master
```

Reale, ausdrücklich bestätigte Migration:

```powershell
npm.cmd run --silent taxonomy:master:migrate -- --refresh-providers --activate --verify-rollback
```

Read-only Betriebsprüfung eines bereits aktiven Masters:

```powershell
npm.cmd run --silent taxonomy:master:verify -- --json
```

Das frühere Audit `docs/audits/2026-08-phase-9-audit.md` bleibt als historische Aufnahme des kleinen
Masterbestands erhalten. Der erweiterte reale Bestand und der vollständige Phasenabschluss sind im maßgeblichen
Bericht `docs/audits/2026-08-phase-9-closing-audit.md` dokumentiert.

## Bedienoberfläche vor Phase 10

Die technische Trennung zwischen read-only CoL-Referenz und aktivem Master bleibt für sichere Updates und
Rollback erhalten. In der Anwenderoberfläche werden beide seit dem 10. August 2026 als eine
`Taxonomiedatenbank` geführt. Der Normalzustand zeigt nur:

```text
273.505 Taxa · <Anzahl> deutsche Namen · <Anzahl> englische Namen
```

Die Namenszähler werden direkt aus der aktiven beziehungsweise geprüften Master-SQLite ermittelt. Eine
Aktualisierung erzeugt weiterhin zuerst einen Kandidaten. Konflikte mit bereits angelegten Arten zeigen den
bisherigen und neuen Wert, einen begründeten Lösungsvorschlag und die vier bestehenden Entscheidungen. Ohne
Bestätigung verändert sich keine Projektart. Zusätzliche Namen aus einer älteren Quelle bleiben erhalten, wenn
ein neuer Quellenstand sie nicht mehr liefert; entfernte Aussagen werden zunächst als veraltet behandelt.

Der Explorer ergänzt diese kompakte Statusanzeige um `Datenbank ansehen und korrigieren`. Der Dialog durchsucht
die aktive Masteransicht vollständig offline. Hierarchie, Rang, Quellen und Masterstatus sind lesbar, aber nicht
direkt überschreibbar. Für Art-Taxa können deutsche und englische Namen als eigene Korrektur gespeichert oder
zurückgesetzt werden; diese Korrekturen stehen bei späteren Aktualisierungen über den Anbieterwerten.
Der vorhandene Button `Korrektur speichern` in der Taxonomie-Datenbank schreibt diese redaktionelle Schicht. Damit
die Änderung auch in der aktiven Masteransicht und im Lightroom-Suchpaket erscheint, muss sie anschließend über
`Datenbank aktualisieren` aktiviert werden. Mehrere Namenskorrekturen können davor gesammelt werden. Das Speichern
einer einzelnen Korrektur behauptet nicht, der abgeleitete Master- oder Lightroom-Bestand sei bereits erneuert.
Seit dem 30. August 2026 enthält jedes Kandidatenmanifest zusätzlich einen deterministischen Fingerabdruck der
eingebauten Korrekturschicht. Weicht die aktuelle Korrekturdatei davon ab, ist dies unabhängig von externen
Anbieterständen ein eigener Aktualisierungsgrund. Ein vorhandener älterer Kandidat wird nur aktiviert, wenn sein
Fingerabdruck bereits dem aktuellen Korrekturstand entspricht; andernfalls entsteht ein neuer lokaler Kandidat.
Beim ausdrücklich gewählten Sofortlauf schließt der Korrekturdialog, bevor die Bestätigung und der Lauf beginnen,
damit Phase, Prozentwert und Laufzeit im Datenbankblock sichtbar bleiben.

Seit dem 30. August 2026 besitzt dieser Ablauf für reine eigene Namenskorrekturen einen getrennten Sekundenpfad.
`species-explorer/taxonomy-correction-release.mjs` normalisiert die aktuelle Korrekturdatei, löst jedes betroffene
Taxon unabhängig in aktiver Master- und Lightroom-SQLite auf und verlangt identische stabile Master-ID,
wissenschaftlichen Namen, Rang, Reich, Masterversion und Paket-ID. Danach wird ein kleines unveränderliches Release
unter dem gemeinsamen lokalen Korrekturspeicher vorbereitet. Erst ein einzelnes atomar geschriebenes `active.json`
macht dieses Release gleichzeitig für die Masteransicht und den Lightroom-Suchhelfer sichtbar. Die großen
Basisdatenbanken bleiben dabei unverändert; schlägt Vorbereitung oder Prüfung fehl, bleibt der alte Zeiger aktiv.
Die Reader wenden ein Release nur an, wenn seine Basisversion exakt zum geöffneten Master beziehungsweise Paket
passt. Dadurch kann ein späterer Vollaufbau oder Rollback keine Korrekturschicht auf einen falschen Grundstand legen.
Fehlt nach dem Upgrade noch ein solcher Zeiger, legt der Explorer beim Start nur dann eine Baseline an, wenn der im
aktiven Vollmaster gespeicherte Korrektur-Fingerabdruck exakt zur aktuellen Korrekturdatei und zum aktiven
Lightroom-Paket passt. Damit sind spätere Entfernungen gegenüber einem bekannten Ausgangsbestand erkennbar.

Das Entfernen einer Korrektur, die bereits in einem früheren Vollmaster als ausgewählte manuelle Aussage eingebaut
wurde, ist bewusst kein Überlagerungsfall: Der Schnellweg erkennt ihn und bricht verständlich ab. Nur der normale
vollständige Kandidatenbau kann dann die darunterliegende Anbieterpriorität neu bestimmen. Neue Korrekturen und
Änderungen weiterhin vorhandener Korrekturen benötigen dagegen keinen Vollimport und keinen Lightroom-Paketneubau.

Projektkonflikte erscheinen unter demselben Datenbankblock. Bei einer eindeutig extern bestätigten
CoL-Referenzlücke bietet die Oberfläche eine ausdrückliche Verknüpfung mit der stabilen Master-ID an. Die
Entscheidung wird in `species-reference-mappings.json` dokumentiert. Liefert ein späteres CoL-Release einen
exakten akzeptierten Arteintrag, hat dieser trotz der vorhandenen Lückenbestätigung automatisch wieder Vorrang.

Seit dem 11. August 2026 zeigt dieser Block genau drei anwenderseitige Aktionen:

1. `Datenbank aktualisieren` führt Versionsprüfung, Referenzimport, Anbieteraktualisierung, Kandidatenbau,
   Konfliktprüfung und Aktivierung in der sicheren technischen Reihenfolge aus;
2. `Vorherigen Stand wiederherstellen` setzt den zuletzt aktiven Gesamtstand zurück;
3. `Datenbank ansehen und korrigieren` öffnet zuerst die offenen Prüfungen der verwendeten Projektarten und danach
   die Suche im aktiven Offline-Bestand.

Technische Zwischenaktionen bleiben intern und getestet, werden aber nicht mehr als gleichwertige Schaltflächen
angezeigt. Die Bestätigung einer CoL-Referenzlücke verwendet zuerst eine exakte Suche nach wissenschaftlichem Namen,
Rang und Reich in der aktiven Masterdatenbank. `Sciurus vulgaris` wird dadurch eindeutig mit dem vorhandenen,
durch GBIF und iNaturalist bestätigten Mastertaxon verknüpft.

Seit dem 11. August 2026 prüft `Datenbank aktualisieren` zuerst die verfügbaren CoL- und Anbieterstände. Seit dem
4. September 2026 vergleicht der Masterstatus zusätzlich die aktive CoL-Release-ID mit der im aktiven Master
gespeicherten `catalogue-of-life`-Provenienz. Eine bereits aktivierte neuere Referenz bleibt dadurch auch dann
sichtbarer Handlungsbedarf, wenn die Quellenprüfung selbst keine Arbeit mehr findet. Der Wiederanlauf baut aus der
bereits aktiven Referenz einen neuen Masterkandidaten, ohne denselben CoL-Stand erneut herunterzuladen oder die
Anbieter-Ausschnitte unnötig neu abzurufen. Ein vorhandener Kandidat wird nur aktiviert, wenn seine Provenienz zur
aktiven Referenz passt; ein Kandidat aus einem älteren Referenzstand wird ersetzt. Nur wenn weder neue Quelldaten,
ein Kandidat, offene Korrekturen, Referenz-Master-Drift noch eine Master-Paket-Abweichung vorhanden sind, meldet der
Explorer den aktuellen Stand ohne Neuaufbau. Während eines Laufs sind Kopfstatus und Datenbankstatus gelb als
`Taxonomie-Update läuft` gekennzeichnet; die bestehende Datenbank bleibt bis zur erfolgreichen Aktivierung lesbar.
Die drei Aktionen stehen wie im Backup-Bereich als untereinander angeordnete, vollbreite Aktionskarten.

Seit dem 29. August 2026 zeigt der Masteraufbau im selben Datenbankblock zusätzlich seine aktuelle Fachphase,
echte Zähler im Format `verarbeitet von gesamt` und die verstrichene Laufzeit. Sichtbare Phasen sind insbesondere
Anbieterquellen, CoL-Referenz, Anbieter-Datensätze, Schreiben der Masterdatenbank, Suchindex,
Änderungsvergleich, Prüfung und Abschluss. Lange JavaScript- und SQLite-Schleifen geben die Ereignisschleife in
begrenzten Abständen frei, damit Statusabfragen und Oberfläche während des Aufbaus reagieren können.

Der Kandidatenbau verarbeitet die relevanten CoL-Zeilen schrittweise, führt doppelte Anbieterzeilen direkt in den
jeweiligen Taxongruppen zusammen und liest bisherige Aliasse nur bei Bedarf. Der abschließende Vergleich zwischen
aktivem Stand und Kandidat läuft zeilenweise statt beide SQLite-Datenbanken vollständig in JavaScript-Maps zu
duplizieren; dieser Vergleich ist in `species-explorer/taxonomy-master-diff.mjs` vom Kandidatenbau getrennt.
Die Herkunft bisheriger Felder kapselt `species-explorer/taxonomy-master-previous-state.mjs`. Ein Anbieterfeld ohne
frischen Ersatz behält `origin_kind = source`, seinen ursprünglichen Beleg und dessen Release. Ein nicht mehr
aktueller Beleg wird als `stale`/`removed` aus einem archivierten Release übernommen und behauptet damit keine
aktuelle Quellenbestätigung; der weiterhin ausgewählte letzte Feldwert bleibt nachvollziehbar. Neue Anbieterwerte
können ihn bei einem späteren Aufbau ersetzen, ohne eine künstliche manuelle Sperre auszulösen.
Vor dem 5. September 2026 erzeugte Trägerzeilen werden nur dann als nachweisliche Quellenwerte gelesen, wenn der
vorherige Master für dieselbe Master-ID, dasselbe Feld, dieselbe Sprache und denselben exakten Wert einen
Quellenbeleg besitzt. Zusätzlich müssen Erstellzeit und manuelles Build-Release übereinstimmen; eigene aktuelle
Korrekturen, Projektfelder oder gespeicherte Feldentscheidungen schließen die Rückführung aus. Ohne Beweis bleibt
die manuelle Herkunft geschützt. Beide bisherigen SQLite-Dateien bleiben dabei read-only; nur der neue Kandidat
erhält die korrigierte Herkunft. Schema und manuelle Taxonomieentscheidungen werden nicht verändert.
Eine ausdrückliche manuelle Feldauswahl bleibt auch dann als manuell gespeichert, wenn ein Anbieter denselben
Text liefert. Textgleichheit allein darf den Schutz nicht für den nächsten Aufbau verlieren lassen.
Die Vorgängerzuordnung verwendet zuerst die vollständige Identität aus wissenschaftlichem Namen, Rang und Reich.
Die Ergänzung eines vorher fehlenden Reichs über Name und Rang ist nur bei beidseitig eindeutiger Zuordnung und
ohne widersprüchliche bekannte Reiche zulässig. Ein neu auftauchendes Homonym eines anderen Reichs erbt deshalb
weder Felder, Aliasse noch Quellenbelege des bisherigen Taxons. Der zuvor damit ausgelöste UNIQUE-Fehler für eine
vorzeitig übernommene Anbieterkennung wird durch einen mehrstufigen Neuaufbau-Test abgesichert.
Der reale Lauf vom 5. September 2026 bestätigte diese Grenzen: Der vollständig geprüfte Master
`master-20260905054823067` wurde ohne blockierende Konflikte aktiviert. Die eigenen Namenskorrekturen behalten
ihre manuelle Herkunft; Projektnamen bleiben bevorzugt. `Ciconia ciconia` besitzt die aktuelle CoL-Aussage und
`exact-col` bei unveränderter Master-ID. Die Homonyme `Acmella pusilla` bleiben nach Reich getrennt, und die
globale Feld-/Quellenverknüpfungsprüfung fand keine taxonfremden Belege. Das automatisch aktivierte Paket
`lightroom-946c961bd063fd1b8f12` verweist auf genau diesen Master; alle drei CoL-Provenienzen stimmen überein.
Zeitpunkte und abschließende Praxistestgrenzen stehen in `roadmap.md`.
Dadurch benötigt der Vollaufbau kein erhöhtes Node-Heap-Limit mehr. Vor Aktivierung und Rollback
schließt der Explorer seine eigenen read-only Referenz- und Masterhandles, bevor Windows die Slotverzeichnisse
atomar umbenennt; die nächste Suche öffnet den dann aktiven Stand wieder bedarfsgesteuert. Bei einem Fehler bleibt
der zuvor aktive Stand unverändert verfügbar.

Seit dem 30. August 2026 endet eine bestätigte Aktivierung oder Wiederherstellung nicht mehr beim Master-Slotwechsel.
Der Explorer startet anschließend automatisch den reproduzierbaren Lightroom-Suchpaketbau als getrennten
Hilfsprozess und zeigt dessen Schema-, Export-, Index-, Prüf- und Aktivierungsphase im selben Fortschrittsblock.
Der aktive Suchpaketstand wird über die `masterVersion` mit der aktiven Master-`candidateId` verglichen. Scheitert
der Paketbau, bleibt das vorherige Suchpaket aktiv; der Masterwechsel wird als Teilerfolg gemeldet und
`Datenbank aktualisieren` holt gezielt nur die fehlende Ableitung nach.
Scheitert schon der Masterbau, werden weder aktiver Master noch aktives Lightroom-Paket umgeschaltet. Der weiterhin
bestehende Referenz-Master-Drift wird beim nächsten Statusabruf erneut erkannt und der bestätigte Wiederholungslauf
beginnt wieder beim Masterkandidaten. Der konfliktfreie Projektartenabgleich allein gilt ausdrücklich nicht als
Beleg, dass Master und Suchpaket bereits nachgezogen wurden.
Der Hierarchieexport setzt keinen einzelnen Anbieterbeleg als vollständig voraus. Er übernimmt zunächst den
vollständigen bevorzugten Anbieterpfad und überschreibt beziehungsweise ergänzt jeden im Master ausgewählten Rang.
Dadurch bleibt beispielsweise der vollständige Pfad von `Sciurus vulgaris` im Lightroom-Paket erhalten, auch wenn
ein zusätzlicher GBIF-Beleg nur Reich und Art liefert; zusätzliche Zwischenränge anderer Taxa gehen nicht verloren.

Der inkrementelle Korrekturweg ist vor dem Phase-10-Abschluss umgesetzt. Statt die mehrgigabytegroßen Slots zu
klonen, hält er die Basisstände unverändert und versioniert nur die betroffenen redaktionellen Namen. Der gemeinsame
Aktivierungszeiger ist der atomare Commitpunkt für Arten-Explorer und Lightroom. Vollständige Quellenupdates,
Hierarchieänderungen sowie das Zurücksetzen bereits fest eingebauter manueller Aussagen verwenden weiterhin den
normalen Kandidaten-, Integritäts-, Paket- und Rollbackablauf.
