# Taxonomie-Masterdatenbank – Phasen 9.6 bis 9.12

Stand: 2026-08-01

Status: umgesetzt, real migriert, aktiviert und geprüft

## Ziel

Die vollständige lokale Catalogue-of-Life-XR-Referenz bleibt unverändert und read-only. Eine getrennte,
wesentlich kleinere Masterdatenbank verbindet diese Primärreferenz mit relevanten versionierten Ausschnitten
weiterer Anbieter sowie ausdrücklich bestätigten Projekt- und Korrekturwerten:

```text
vollständige CoL-XR-Referenz (read-only)
  + relevante, versionierte Ausschnitte weiterer Anbieter
  + bestätigte Projekt- und manuelle Aussagen
  -> prüfbarer Master-Kandidat
  -> atomar aktivierte lokale Masterdatenbank
```

Die Masterdatenbank schließt belegte CoL-Lücken, ergänzt Namen und Hierarchiestufen und bewahrt zugleich bestehende
Projektarten, URL-Slugs und Assetpfade. Ein neuer Quellenstand wird nie allein aufgrund seines Datums als fachlich
richtiger behandelt.

## Speichergrenze und Versionen

Die Daten liegen außerhalb von Repository, GitHub Pages und normalem Projekt-Backup:

```text
%LOCALAPPDATA%\FN Wildlife Travel\Arten-Explorer\taxonomy\
  releases\                         vollständige CoL-XR-Releases
  master\
    active\taxonomy-master.sqlite
    staging\taxonomy-master.sqlite
    previous\taxonomy-master.sqlite
```

Jeder Slot besitzt ein `manifest.json`. `staging` enthält einen vollständig aufgebauten Kandidaten. Erst nach
Schema-, Integritäts-, Projekt- und Konfliktprüfung wird er atomar nach `active` verschoben. Genau eine vorherige
Version bleibt unter `previous` für Rollback erhalten. Abgebrochene Aktivierungen stellen den vorherigen Stand
automatisch wieder her; temporäre Staging- und Rollbackverzeichnisse werden bereinigt.

Die Speicherortentscheidung wird beim späteren Installer erneut geprüft.

## Quellen und lokale Ausschnitte

| Quelle | Lokaler Umfang | Aufgabe |
| --- | --- | --- |
| Catalogue of Life XR | vollständig, versioniert, read-only | globale Primärreferenz |
| WoRMS | relevanter versionierter Ausschnitt | marine und brackische Taxa |
| GBIF | relevanter versionierter Ausschnitt | Taxonlücken, IDs und Abgleich |
| iNaturalist | relevanter versionierter Ausschnitt | Taxonlücken und gebräuchliche Namen |
| Wikidata | relevanter versionierter Ausschnitt | deutsche/englische Namen und externe IDs |
| Projekt | versionierte Projektzuordnung | stabile Verbindung zu Art und URL-Slug |
| Manuell | versionierte redaktionelle Aussage | geschützte Korrektur |

Ein Anbieter-Ausschnitt wird nur für vorhandene Projektarten, CoL-Referenzlücken, fehlende Namen oder
Hierarchiestufen, im Explorer recherchierte Taxa und eigene bestätigte Korrekturen gespeichert. Die vollständigen
GBIF-, iNaturalist-, WoRMS- und Wikidata-Bestände werden nicht gespiegelt.

Jeder Ausschnitt enthält Anbieter und ID, wissenschaftlichen Namen, Rang, Hierarchie, deutsche und englische Namen,
Abrufzeitpunkt, Anbieterstand, Quellen-URL/Lizenz und den Zustand gegenüber der vorherigen Version. Entfernte
Quellenzeilen bleiben als `removed` beziehungsweise `stale` nachvollziehbar.

## Stabile Master-ID und Zustände

Jedes zusammengeführte Taxon besitzt eine anbieterunabhängige ID `mtx_<UUID>`. Anbieter-IDs, Namen und Projekt-Slugs
sind Aussagen oder Verknüpfungen und können die Master-ID nicht ersetzen.

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
- `master_decision`: nachvollziehbare Entscheidungen zum Behalten, Übernehmen, Alias oder manuellen Schutz.

Damit ist für jeden ausgewählten Namen, Rang und Hierarchiewert nachvollziehbar, aus welchem Quellenstand er stammt.

## Verbindliche Zusammenführungsregeln

1. Ausdrücklich geschützte Projekt- und manuelle Werte haben Vorrang.
2. CoL XR ist die globale Primärreferenz.
3. WoRMS ist nur für marine und brackische Taxa die bevorzugte Fachergänzung.
4. GBIF und iNaturalist ergänzen Taxonlücken und dienen dem Abgleich.
5. Wikidata ergänzt deutsche/englische Namen und externe IDs.
6. Eine Unterart wird niemals automatisch zur fehlenden Art hochgestuft.
7. Eine vorhandene Hierarchie wird nicht still überschrieben.
8. Synonyme, frühere Namen und alternative Namen bleiben erhalten.
9. Entfernte Anbieterzeilen werden zunächst als veraltet markiert statt gelöscht.
10. Widersprüche werden als Konflikt zur Prüfung angezeigt.
11. Ein neuerer Quellenstand gewinnt nicht automatisch.
12. Exakte Zuordnungen berücksichtigen mindestens wissenschaftlichen Namen, Rang und Reich. Die Reichssynonyme
    `Animalia`, `Animal`, `Animals` und `Metazoa` werden dabei kontrolliert als dasselbe Reich behandelt; echte
    reichsübergreifende Homonyme bleiben getrennt.

## Kandidat, Konflikte und Aktivierung

Ein Update baut immer zuerst einen neuen Master-Kandidaten aus aktueller CoL-Referenz, Anbieter-Ausschnitten,
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
verständlich gekennzeichnet. Falls noch keine Masterdatenbank installiert ist, bleibt die bisherige lokale
CoL-/Ergänzungssuche als sichere Rückfallebene erhalten.

Unter `Datenbank-Aktionen > Taxonomiereferenz` kann ein neuer Master-Kandidat aufgebaut, geprüft, bestätigt
aktiviert oder auf die vorherige Version zurückgerollt werden. Fortschritt und Abschlusszustand bleiben im Dialog
sichtbar.

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

## Reale Migration vom 1. August 2026

Der produktionsnahe Lauf wurde mit echter CoL-Vollreferenz und echten Anbieter-Ausschnitten ausgeführt:

| Messwert | Ergebnis |
| --- | ---: |
| Projektarten geprüft/verknüpft | 52 / 52 |
| fehlende Projektarten / fehlerhafte Links | 0 / 0 |
| Mastertaxa | 496 |
| Anbieter-Aussagen | 2.134 |
| Namen / Aliasse | 5.709 / 1.033 |
| Feldprovenienzen | 10.189 |
| CoL-Vollreferenz | 4.639.747 Taxa |
| iNaturalist-/GBIF-/WoRMS-/Wikidata-Ausschnitt | 211 / 1.333 / 69 / 317 |
| aktiver SQLite-Bestand | ca. 5,94 MiB |
| gesamter Masterbereich einschließlich Rollback | ca. 13,87 MiB |
| exakte Offline-Abfrage nach Optimierung | Ø ca. 1,55 ms pro Projektart |
| temporäre Importartefakte nach Abschluss | 0 |

Ein echter zweiter Kandidat wurde aktiviert und anschließend erfolgreich auf die zuvor aktive Version
zurückgerollt. Die aktive CoL-Vollreferenz, Projektarten, Slugs und Assets blieben unverändert.

## Implementierung und Tests

Zentrale Module:

- `taxonomy-master-schema.mjs`, `taxonomy-master-model.mjs`, `taxonomy-master-store.mjs`;
- `taxonomy-master-rules.mjs`, `taxonomy-master-slices.mjs`, `taxonomy-master-candidate.mjs`;
- `taxonomy-master-lifecycle.mjs`, `taxonomy-master-service.mjs`;
- `public/app-taxonomy-master.js` und die Master-Routen im lokalen Server;
- `scripts/taxonomy-master-migrate.mjs` für Migration, Verifikation, Messung, Aufräumen und Rollbacktest.

Fokussierte Prüfung:

```powershell
npm.cmd run --silent test:taxonomy-master
```

Reale, ausdrücklich bestätigte Migration:

```powershell
npm.cmd run --silent taxonomy:master:migrate -- --activate --verify-rollback
```

Der vollständige Abschlussaudit steht in `docs/audits/2026-08-phase-9-audit.md`.
