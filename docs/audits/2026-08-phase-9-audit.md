# Phase-9-Abschlussaudit – globale Taxonomiereferenz und Masterdatenbank

Stand: 2026-08-01

Status: bestanden

## Umfang

Dieses Audit schließt Phase 9 vollständig ab. Geprüft wurden die lokale CoL-XR-Vollreferenz, die versionierten
Anbieter-Ausschnitte aus iNaturalist, GBIF, WoRMS und Wikidata, eigene Korrekturen, die daraus erzeugte
Masterdatenbank, die Explorer-Integration sowie Aktivierung und Wiederherstellung. Lightroom ist ausdrücklich
nicht Bestandteil dieses Audits und beginnt in Phase 10.

## Architektur und Verantwortungsgrenzen

- Die vollständige CoL-XR-Datenbank bleibt unverändert, read-only und physisch von der Masterdatenbank getrennt.
- Relevante Fremddaten werden als versionierte Anbieter-Ausschnitte statt als vollständige Spiegel gespeichert.
- Stabile anbieterunabhängige Master-Taxon-IDs verhindern, dass ein Anbieterwechsel Projekt-Slugs oder Assetpfade
  verändert.
- Taxon-, Namens- und Feldaussagen speichern ihre Quelle und ihren Quellenstand einzeln.
- Zusammenführung, Anbieter-Ausschnitte, Kandidatenbildung, Lebenszyklus, Suche und Explorer-API besitzen getrennte
  Module; `server.mjs` bleibt Kompositionswurzel.
- Die aktive Masteransicht ist bevorzugte lokale Suchquelle. Fehlt sie oder ist sie unbrauchbar, bleibt die
  bisherige CoL-Referenzsuche als sicherer read-only Rückfall erhalten.

Ergebnis: keine offene monolithische oder konkurrierende Datenhaltung gefunden.

## Datenmodell und Zusammenführungsregeln

Geprüft und durch Tests abgesichert sind:

- stabile Master-IDs und eindeutige Projektverknüpfungen;
- Zustände `col-confirmed`, `col-reference-gap`, `externally-confirmed`, `conflicting`, `stale` und
  `manually-protected`;
- Priorität manueller Bestätigungen vor CoL, danach fachbezogene WoRMS- sowie GBIF-/iNaturalist- und
  Wikidata-Aussagen;
- keine stille Hochstufung von Unterarten, keine stille Hierarchieüberschreibung und kein automatischer Vorrang
  allein aufgrund des neueren Zeitstempels;
- Erhalt von Synonymen und Aliasnamen;
- Markierung verschwundener Quelleneinträge als veraltet;
- kanonische Anbieter- und Reichsnormalisierung sowie Deduplizierung mehrfach gelieferter Anbieterzeilen;
- nachvollziehbare Konflikte, von denen bei der realen Migration keiner die Aktivierung blockierte.

## Reale Migration und Betriebsprüfung

Ausgeführt wurde:

```text
npm.cmd run --silent taxonomy:master:migrate -- --activate --verify-rollback --json
```

Ergebnis des echten lokalen Laufs:

- CoL-Release: `col-xr-2026-07-17-315834`
- CoL-Vollbestand: 4.639.747 Datensätze
- geprüfte Projektarten: 52
- fehlende Projektarten: 0
- abweichende Projektverknüpfungen: 0
- aktive Master-Taxa: 496
- Projekt-Taxa: 52
- versionierte Anbieteraussagen: 2.134
- Namen: 5.709
- Aliasse: 1.033
- Feldprovenienzen: 10.189
- Konflikte: 292, davon blockierend: 0
- Zustände: 204 durch CoL bestätigt, 292 CoL-Referenzlücken, 175 extern bestätigt, 1 manuell geschützt
- Anbieter-Ausschnitte: iNaturalist 211, GBIF 1.333, WoRMS 69, Wikidata 317
- gesamter Master-Speicher: 14.541.114 Byte, rund 13,87 MiB in 20 Dateien
- aktive SQLite-Datei: 6.230.016 Byte, rund 5,94 MiB
- zurückgebliebene temporäre Importdateien: 0

Der Kandidat `master-20260801100831380` wurde atomar aktiviert. Anschließend wurde die vorherige Version praktisch
wiederhergestellt und die neue Version erneut als aktiver Stand verifiziert. Ein fehlerhafter Staging-Stand kann
die aktive Version nicht ersetzen; schlägt die Prüfung nach der Aktivierung fehl, wird automatisch zurückgerollt.

## Regressionen und Leistung

Die Mastertests umfassen 27 direkte Fälle. Verbindlich abgedeckt sind unter anderem:

- `Sciurus vulgaris` als genau ein Masterdatensatz mit CoL-Referenzlücke;
- späteres Schließen derselben Lücke durch CoL ohne neue Master-ID, Projektart, URL oder Assetpfad;
- Homonyme in unterschiedlichen Reichen;
- Synonyme und alternative Namen;
- Umbenennungen ohne stille Projektänderung;
- Anbieter-Ausfälle und verschwundene Quelleneinträge;
- doppelte normalisierte Namen und doppelte Anbieter-IDs innerhalb eines Quellenstands;
- unterbrochene beziehungsweise ungültige Aktivierung mit Erhalt des bisherigen Standes.

Die zunächst auffällige exakte Projektsuche wurde im Audit von einem vollständigen Taxon-Scan auf vorbereitete
exakte SQLite-Abfragen umgestellt. Die Messung über alle 52 Projektarten sank dadurch von durchschnittlich rund
113,84 ms auf rund 1,55 ms je Suche; alle 52 Treffer blieben eindeutig.

## Datei-, Ordner- und Wiederherstellungsprüfung

- Referenz- und Masterdaten liegen weiterhin ausschließlich im lokalen Anwendungsdatenordner und nicht im Git-
  Repository, Pages-Artefakt oder normalen Projekt-Backup.
- Kandidat, aktive Version und genau eine Rollbackversion verwenden getrennte Slots.
- Temporäre Downloads, Entpack- und Stagingdateien werden nach Erfolg sowie nach Fehlern entfernt.
- Die spätere Installer-Phase 11 muss erneut bewerten, ob `%LOCALAPPDATA%` als Standardspeicherort beibehalten oder
  eine kontrollierte Laufwerkswahl angeboten wird. Das ist keine offene Phase-9-Funktion.

## Dokumentation und Qualitätsgate

Aktualisiert und gegengeprüft wurden:

- `AGENTS.md`
- `README.md`
- `docs/roadmap.md`
- `docs/global-taxonomy-lightroom-plan.md`
- `docs/taxonomy-master-database-design.md`
- `docs/repo-structure.md`
- `docs/documentation-lifecycle.md`

Direkte Mastertests und reale Migration sind bestanden. Das vollständige repositoryweite Qualitätsgate
`npm.cmd run --silent quality:ci` ist Bestandteil desselben Abschlussstands und wurde vor der Veröffentlichung
erfolgreich ausgeführt.

## Abschluss

Alle Befunde dieses Audits wurden innerhalb von Phase 9 bereinigt. Es bestehen keine bekannten blockierenden
Phase-9-Punkte. Der nächste große Arbeitsschritt ist Phase 10 mit Lightroom-Machbarkeitsprüfung und anschließendem
MVP; sie nutzt die Masterdatenbank nur lesend und führt keine konkurrierende Stammdatenpflege ein.
