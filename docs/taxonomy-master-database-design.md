# Taxonomie-Masterdatenbank – Datenmodell für Phase 9.6

Stand: 2026-07-30

Status: Phase 9.6 abgeschlossen; Schema-, Modell- und Regressionstest-Grundlage umgesetzt, noch keine produktive
Migration oder Umschaltung der Explorer-Suche

## Ziel

Die vollständige lokale Catalogue-of-Life-XR-Referenz bleibt die unveränderte, read-only Primärquelle. Daneben
entsteht eine deutlich kleinere Masterdatenbank, die belegte Aussagen aus mehreren Quellen zusammenführen kann,
ohne die Quelldatenbanken umzuschreiben:

```text
vollständige CoL-XR-Referenz (read-only)
  + relevante, versionierte Ausschnitte weiterer Anbieter
  + ausdrücklich bestätigte Projekt- und manuelle Aussagen
  -> lokale Taxonomie-Masterdatenbank
```

Die Masterdatenbank soll insbesondere echte CoL-Lücken, fehlende gebräuchliche Namen, spätere Quellenupdates und
redaktionelle Korrekturen kontrolliert abbilden. Eine neuere Anbieterdatei gewinnt niemals allein aufgrund ihres
Datums. Bestehende Projektarten, wissenschaftliche Namen, URL-Slugs und Assetpfade bleiben ohne ausdrückliche
Bestätigung unverändert.

Phase 9.6 definiert und testet nur diese Datenmodell-Grundlage. Der aktive CoL-Bestand unter
`taxonomy/releases/`, `species_list.json`, `speciesData.json`, die Explorer-Suche und Squarespace werden nicht
migriert oder umgeschaltet.

## Speichergrenze

Die Masterdatenbank liegt im bereits pfadunabhängigen lokalen Taxonomiebereich, aber physisch getrennt von den
unveränderlichen CoL-Releases:

```text
%LOCALAPPDATA%\FN Wildlife Travel\Arten-Explorer\taxonomy\
  releases\                         vollständige CoL-XR-Releases
  master\
    active\taxonomy-master.sqlite
    staging\taxonomy-master.sqlite
    previous\taxonomy-master.sqlite
```

Jeder Slot besitzt zusätzlich ein `manifest.json`. `staging` ist für einen vollständig aufgebauten und geprüften
Kandidaten vorgesehen; `active` und `previous` bilden die spätere atomare Aktivierungs- und Rollbackgrenze.
Phase 9.6 erzeugt an diesen Pfaden noch keine produktive Datei.

Die Speicherortentscheidung wird beim späteren Installer nochmals geprüft. Bis dahin bleiben große lokale
Referenzen und die Masterdatenbank außerhalb des Repositorys und der NAS-Projekt-ZIP.

## Quellenstrategie

| Quelle | Lokaler Umfang | Aufgabe |
| --- | --- | --- |
| Catalogue of Life XR | vollständig, versioniert, read-only | globale Primärreferenz |
| iNaturalist | versionierter relevanter Ausschnitt | exakte Taxa und gebräuchliche Namen |
| GBIF | versionierter relevanter Ausschnitt | exakte Taxa, IDs und Namensabgleich |
| WoRMS | versionierter relevanter Ausschnitt | marine und brackische Taxa |
| Wikidata | versionierter relevanter Ausschnitt | quellenmarkierte Labels und externe IDs |
| Projekt | versionierte Projektzuordnung | stabile Verbindung zu Art und URL-Slug |
| Manuell | versionierte redaktionelle Aussage | ausdrücklich geschützte Korrektur |

Ein relevanter Ausschnitt umfasst nur Datensätze, die mindestens einen dieser Gründe erfüllen:

- CoL besitzt für das gesuchte Taxon oder Feld eine Lücke,
- eine vorhandene Projektart benötigt die Aussage,
- ein Taxon wurde im Explorer gesucht oder ausdrücklich vorgemerkt,
- eine manuelle Korrektur oder Konfliktentscheidung verweist darauf.

Die Ausschnitte sind keine unversionierten Suchcaches. Jeder importierte Datensatz verweist auf einen
`provider_release` mit Anbieter, Version, Umfang, Importzeitpunkt, optionaler Prüfsumme, Quelle und Lizenz.

## Stabile Master-ID

Jedes zusammengeführte Taxon erhält eine anbieterunabhängige ID im Format `mtx_<UUID>`. Anbieter-IDs, ein
wissenschaftlicher Name und ein Projekt-Slug sind Attribute beziehungsweise Verknüpfungen, aber nicht die
Master-ID selbst.

Dadurch kann eine zunächst durch GBIF, iNaturalist oder Wikidata belegte CoL-Lücke später an eine neu gelieferte
CoL-Art gebunden werden, ohne:

- eine zweite Projektart anzulegen,
- den vorhandenen URL-Slug zu ändern,
- Assets umzubenennen oder
- die Master-ID auszutauschen.

## Tabellen und Zuständigkeiten

### `provider_release`

Versioniert jeden vollständigen oder ausschnittsweisen Quellenstand. Pro Anbieter darf höchstens ein Release
`active` und eines `previous` sein. Ältere vorherige Stände werden `archived`; fehlerhafte Kandidaten können
`failed` bleiben.

### `master_taxon`

Enthält die stabile Master-ID, den kanonischen wissenschaftlichen Namen, Rang, Reich und Lebenszyklusstatus.
`reference_state` unterscheidet:

- `exact-col`: exakte Art in der aktiven CoL-Referenz,
- `reference-gap`: anderweitig exakt belegtes Taxon, dessen Artstufe in CoL fehlt,
- `external-only`: noch nicht mit CoL verbunden,
- `manual`: bewusst manuell angelegtes Mastertaxon.

Taxa werden bei Quellenverlust als `stale` oder `deprecated` markiert und nicht blind gelöscht.

### `provider_taxon_assertion` und `provider_name_assertion`

Speichern die unveränderte Aussage eines konkreten Anbieter-Releases einschließlich Anbieter-ID, Name, Rang,
Status, Zuordnungszustand und gebräuchlichen beziehungsweise synonymen Namen. Eine Anbieterzeile kann bewusst
unverknüpft oder konfliktbehaftet bleiben.

### `master_field_assertion`

Speichert einzelne Feldwerte mit Sprache, Herkunft, Quellenrelease, optionaler Konfidenz und Prüfstatus. Pro
Mastertaxon, Feld und Sprache kann höchstens eine Aussage ausgewählt sein. Quellenfelder müssen auf die passende
Taxonzeile desselben Releases verweisen. Manuelle und projektbezogene Aussagen bleiben davon getrennt.

Ein neues Quellenrelease darf eine ausgewählte manuelle Aussage nur als Konfliktkandidaten ergänzen, nicht
automatisch ersetzen.

### `master_conflict`

Hält Änderungen, entfernte Quellen, mehrdeutige Zuordnungen, CoL-Lücken und das spätere Wiedererscheinen einer
CoL-Referenz nachvollziehbar fest. Konflikte bleiben offen, bis eine Entscheidung `behalten`, `übernehmen`,
`manuell` oder `verwerfen` gespeichert wurde.

### `project_taxon_link`

Verbindet eine Projektart und ihren bestehenden URL-Slug mit genau einer stabilen Master-ID. Diese Zuordnung ist
die Schutzgrenze gegen stille Umbenennungen und doppelte Projektarten.

## Verbindliche Zusammenführungsregeln

1. CoL bleibt Primärreferenz, wird aber nie durch Master- oder Anbieterdaten verändert.
2. Exakte Taxonzuordnung berücksichtigt mindestens wissenschaftlichen Namen, Rang und Reich.
3. Eine Unterart darf eine fehlende Artstufe nicht ersetzen.
4. Ein neueres Quellenrelease ist ein Kandidat und kein automatischer Gewinner.
5. Ausgewählte manuelle oder projektbezogene Werte bleiben ausgewählt, bis sie ausdrücklich geändert werden.
6. Entfernte Quellendatensätze werden als veraltet markiert; abhängige Mastertaxa werden nicht blind gelöscht.
7. Jede ausgewählte Aussage besitzt nachvollziehbare Releaseprovenienz.
8. Eine Kandidatendatenbank darf erst nach Schema-, Fremdschlüssel-, Integritäts-, Konflikt- und Projektabgleich
   aktiviert werden.
9. Bei einem Fehler bleibt die bisherige aktive Masterdatenbank unverändert; die vorherige Version bleibt für
   Rollback erhalten.

## Regressionsfall `Sciurus vulgaris`

Der Testfall bildet die reale CoL-Lücke ausdrücklich ab:

1. Das aktive CoL-Release enthält passende Unterarten, aber keine exakte Artzeile `Sciurus vulgaris`.
2. GBIF `8211070`, iNaturalist `46001` und Wikidata `Q4388` belegen dieselbe Art.
3. Es entsteht genau ein Mastertaxon mit `reference-gap`.
4. Deutscher Name `Eurasisches Eichhörnchen`, englischer Name `Eurasian Red Squirrel` und der bestehende
   Projekt-Slug `sciurusvulgaris` werden mit Provenienz an diese ID gebunden.
5. Liefert ein späteres CoL-Release die exakte Art, wird sie an dieselbe Master-ID angefügt und der Status auf
   `exact-col` gesetzt.
6. Projektart und URL-Slug bleiben unverändert.

Der Test verhindert insbesondere, dass eine vorhandene Unterart fälschlich zur Art hochgestuft oder beim späteren
CoL-Nachtrag eine zweite Art angelegt wird.

## Implementierung

- `species-explorer/taxonomy-master-storage.mjs`: pfadunabhängige aktive, Kandidaten- und vorherige Slots
- `species-explorer/taxonomy-master-schema.mjs`: SQLite-Schema, Constraints und Integritätsprüfung
- `species-explorer/taxonomy-master-model.mjs`: stabile IDs, Releaselebenszyklus, Aussagen, Auswahl, Konflikte und
  Projektverknüpfungen
- `species-explorer/taxonomy-master.test.mjs`: Release-, Schutz- und `Sciurus vulgaris`-Regressionen

Fokussierter Test:

```powershell
npm.cmd run --silent test:taxonomy-master
```

## Nächste Schritte

- Phase 9.7: versionierte relevante Anbieter-Ausschnitte importieren und die bestehende Ergänzungs-/Korrekturschicht
  ohne Datenverlust in einen Master-Kandidaten überführen.
- Phase 9.8: regelbasierten Merge-, Diff-, Veraltungs- und Konfliktworkflow umsetzen.
- Phase 9.9: Explorer-Suche, Neue-Art-Assistent und Wartungsdialog kontrolliert auf die aktive Masteransicht
  umstellen.
- Phase 9.10: echten Import, Aktivierung, Fehlerfall und Rollback mit produktionsnahen Daten prüfen.
- Phase 9.11: umfassendes Phase-9-Abschlussaudit nach der verbindlichen Auditregel.
