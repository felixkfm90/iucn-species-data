# Taxonomie-Masterdatenbank – Phasen 9.6 bis 9.12

Stand: 2026-08-08

Status: technisch erweitert; realer Neuaufbau und Abschlussprüfung laufen. Das umfassende Phase-9-Abschlussaudit
bleibt danach ein eigener Schritt.

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

Jedes zusammengeführte Taxon besitzt eine anbieterunabhängige ID `mtx_<UUID>`. Anbieter-IDs, Namen und
Projekt-Slugs sind Aussagen oder Verknüpfungen und können die Master-ID nicht ersetzen.

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

1. Ausdrücklich geschützte eigene Korrekturen und Projektwerte haben Vorrang.
2. CoL XR ist die globale Primärreferenz.
3. WoRMS ist nur für marine und brackische Taxa die bevorzugte Fachergänzung.
4. GBIF und iNaturalist ergänzen Taxonlücken und dienen dem Abgleich.
5. Wikidata ergänzt deutsche/englische Namen und externe IDs.
6. Animalia ergänzt ausschließlich danach verbleibende, kontrolliert belegte Tierlücken.
7. Eine Unterart wird niemals automatisch zur fehlenden Art hochgestuft.
8. Eine vorhandene Hierarchie wird nicht still überschrieben.
9. Synonyme, frühere Namen und alternative Namen bleiben erhalten.
10. Entfernte Anbieterzeilen werden zunächst als veraltet markiert statt gelöscht.
11. Widersprüche werden als Konflikt zur Prüfung angezeigt.
12. Ein neuerer Quellenstand gewinnt nicht automatisch.
13. Exakte Zuordnungen berücksichtigen mindestens wissenschaftlichen Namen, Rang und Reich. Die Reichssynonyme
    `Animalia`, `Animal`, `Animals` und `Metazoa` werden dabei kontrolliert als dasselbe Reich behandelt; echte
    reichsübergreifende Homonyme bleiben getrennt.

Die technische Priorität ist: eigene Korrektur, bestätigter Projektwert, CoL XR, WoRMS, GBIF, iNaturalist,
Wikidata, Animalia. Diese Reihenfolge entscheidet nur bei fachlich vergleichbaren Aussagen; ein Konflikt wird
nicht durch eine höhere Zahl unsichtbar gemacht.

## Kandidat, Konflikte und Aktivierung

Ein Update baut immer zuerst einen neuen Master-Kandidaten aus aktueller CoL-Referenz, Anbieterständen,
Projektzuordnungen und Korrekturen. Die Vorschau zeigt insbesondere:

- neue Taxa und geschlossene CoL-Lücken;
- geänderte wissenschaftliche, deutsche und englische Namen;
- neue Synonyme;
- entfernte oder veraltete Quelleneinträge;
- Hierarchieänderungen;
- Konflikte mit vorhandenen Projektarten.

Offene blockierende Konflikte verhindern die Aktivierung. In der Explorer-Oberfläche stehen die Entscheidungen
`bisherigen Wert behalten`, `neuen Wert übernehmen`, `als Alias ergänzen` und `dauerhaft manuell schützen` zur
Verfügung. Erst eine bestätigte, konfliktfreie Vorschau wird atomar aktiviert.

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
