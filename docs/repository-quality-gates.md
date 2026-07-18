# Repository-Qualitätsgrenzen

Stand: 2026-07-18

## Zweck

Die technischen Restpunkte des Repository-Audits sind als dauerhafte, automatisierte Grenzen umgesetzt. Neue
Arten und Assets dürfen den Bestand wachsen lassen, ohne dass feste Gesamtwerte regelmäßig manuell angehoben werden
müssen. Gleichzeitig werden fehlerhafte Daten, unerwartete Dateien und übergroße Bestände vor einer
Veröffentlichung erkannt.

## Verbindliche Prüfungen

`npm.cmd run --silent quality:ci` führt lokal und in GitHub Actions in dieser Reihenfolge aus:

1. Syntaxprüfung aller JavaScript-/MJS-Quellen;
2. schlanke Quelltextregeln für Kodierung, Zeilenenden, nachgestellte Leerzeichen und Tabs;
3. Schema- und Konsistenzprüfung der fünf zentralen JSON-Datenbestände;
4. alle direkten Modul-, Vertrags- und Integrationstests;
5. Audio- und Medienformatprüfung mit Einzelgrenzen;
6. flexibles Größenbudget des versionierten Projektstands;
7. Projekt-, Status- und lokaler Site-Audit.

Die Style-Prüfung formatiert keine Dateien automatisch. Sie schützt nur klare, repositoryweite Grundregeln und
vermeidet damit einen riskanten, großflächigen Formatierungsumbau. Generierte JSON-Dateien werden nicht als
Quelltext formatiert, sondern fachlich über `check:schema`, `audit:project` und `status:check` geprüft.

## Datenanbieter und Tests

`update.mjs` orchestriert die Pipeline. Netzwerk- und Quellenlogik liegt in direkt getesteten Adaptern:

- `scripts/iucn-data-adapter.mjs`
- `scripts/iucn-map-adapter.mjs`
- `scripts/xeno-canto-adapter.mjs`
- `scripts/wikimedia-commons-audio-adapter.mjs`
- `scripts/inaturalist-audio-adapter.mjs`
- `scripts/sound-source-license.mjs`

Die Explorer-API-Integration ist fachlich aufgeteilt:

- `species-explorer/server.test.mjs`: Serverbasis, Sicherheit, Lebenszyklus und Einstellungen;
- `species-explorer/server-species-workflows.test.mjs`: Arten anlegen, bearbeiten und löschen;
- `species-explorer/server-assets.test.mjs`: Karten-, Portrait-, Sound- und Sicherungsabläufe;
- `species-explorer/server-cleanup-search.test.mjs`: Bereinigung, Suche und Filter;
- `species-explorer/explorer-ui-contract.test.mjs`: bewusst statischer Oberflächen-, Modul- und
  Auslieferungsvertrag.

Statische Vertragsprüfungen bleiben nur dort bestehen, wo sie Modulbesitz, Browser-Ladereihenfolge oder
ausgelieferte Quellverträge günstiger und zuverlässiger absichern als ein vollständiger Browser-End-to-End-Test.

## Öffentliche Pages-Dateien

Das kontrollierte `_site/`-Artefakt enthält ausschließlich die produktiven Frontendmodule, zentralen JSON-Daten,
Artassets, benötigten PNG-Grafiken sowie die generierte Startdatei und `.nojekyll`. `README.md`, `docs/`, lokale
Sicherungen, Designquellen und unbekannte Dateien werden nicht veröffentlicht. Builder und Prüfer verwenden
dieselbe Positivliste aus `scripts/pages-artifact-policy.mjs`.

## Flexibles Größenmodell

Zwei getrennte Budgets schützen zwei unterschiedliche Ebenen:

- Pages-Artefakt: 12 MiB Grundbedarf plus 2,5 MiB je Art, maximal 500 MiB;
- versionierter Projektstand: 20 MiB Grundbedarf plus 2,5 MiB je Art, maximal 500 MiB.

Die Medienprüfung begrenzt zusätzlich jede einzelne Karte, jedes Portrait, jeden Sound, Credits, Spektrogramm und
das vollständige Artpaket. Normales Wachstum durch neue Arten erhöht beide Gesamtbudgets automatisch.

Die lokale Git-Packhistorie wird separat beobachtet. Ab 500 MiB wird gewarnt; ab 750 MiB muss vor weiteren großen
Binäränderungen eine kontrollierte Speicherentscheidung geplant werden. Eine Historienbereinigung erfolgt nicht
automatisch. Vor Git LFS, externem Objektspeicher oder History-Rewrite sind ein vollständiges NAS-Backup, ein
Wartungsfenster und ein getesteter Restore verpflichtend.

## Befehle

```powershell
npm.cmd run --silent check:style
npm.cmd run --silent check:schema
npm.cmd run --silent test:providers
npm.cmd run --silent test:size-budget
npm.cmd run --silent size:check
npm.cmd run --silent pages:prepare
npm.cmd run --silent pages:check
npm.cmd run --silent quality:ci
```

`_site/` ist ein ignoriertes, vollständig reproduzierbares Prüfartefakt und wird nach lokalen Builds wieder entfernt.
Squarespace-JavaScript, Footer-Versionen und Custom CSS wurden durch diese Repository-Grenzen nicht verändert.
