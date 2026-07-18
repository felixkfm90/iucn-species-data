# CI-Qualitätsgate vor GitHub Pages

Stand: 2026-07-18

## Ziel

Kein GitHub-Pages-Artefakt wird mehr gebaut oder veröffentlicht, bevor Syntax, Tests, Audio- und Medienformate,
Projektzustand und lokaler Daten-/Reportstand erfolgreich geprüft wurden. Der Workflow trennt fachliche Qualität,
Artefaktbau und Deployment in drei voneinander abhängige Jobs.

```text
Quality checks
  -> Build Pages artifact
     -> Deploy to GitHub Pages
```

Ein Fehler im Quality-Job verhindert damit sowohl den Artefakt-Upload als auch das Deployment.

## Quality-Job

Der Job `quality` in `.github/workflows/pages.yml` verwendet Node.js 24. `actions/checkout@v5` und
`actions/setup-node@v6` laufen ebenfalls nativ auf einer aktuellen Node-Laufzeit, sodass die frühere
Node-20-Abkündigungswarnung nicht mehr entsteht. Der Job führt aus:

1. `npm ci --ignore-scripts` auf Grundlage von `package-lock.json`;
2. `check:syntax` für alle JavaScript-/MJS-Quelldateien außerhalb lokaler Laufzeit- und Sicherungsordner;
3. `check:style` für Kodierung, Abschlusszeile, nachgestellte Leerzeichen und Tabs;
4. `check:schema` für Artenliste, generierte Artdaten, Overrides, Assessment-Zuordnungen und Fehlreport;
5. `npm test` als gemeinsamer Einstieg für direkte Modul-, Vertrags- und Integrationstests;
6. `audio:check` für alle vorhandenen Tierstimmen;
7. `assets:check` für die produktiven Karten-, Portrait-, Sound-, Credits-, Spektrogramm- und Grafikdateien;
8. `size:check` für das flexible Größenbudget des versionierten Projektstands und die Historienbeobachtung;
9. `audit:project` für Artenlisten, generierte Daten, Report, Overrides und Assessment-Zuordnungen;
10. `status:check` für den automatisch dokumentierten Projektstand;
11. den bestehenden lokalen Monatsaudit ohne Netzwerkzugriff.

Bewusst fehlende Sounds aus dem Report bleiben zulässig. Abweichende Karten-Assessment-Zuordnungen sind nur bei
ausdrücklich manuell gepflegten Karten zulässig. Doppelte wissenschaftliche Namen, deutsche Namen oder URL-Slugs,
verwaiste Overrides beziehungsweise Assessment-Zuordnungen und sonstige Explorer-Validierungsprobleme brechen CI ab.

## Pages-Artefakt

Der Build-Job startet nur nach erfolgreichem Quality-Job. `scripts/pages-artifact-policy.mjs` ist die gemeinsame
Freigabeliste für Builder und Prüfer:

- im Repo-Root nur die festgelegten Frontend- und JSON-Dateien;
- in `species-assets/` nur die sechs bekannten Asset-/Metadatendateien je Art;
- unter `graphics/` nur PNG-Laufzeitgrafiken;
- zusätzlich die generierten Dateien `index.html` und `.nojekyll`.

`README.md`, `docs/`, lokale Sicherungen, temporäre Dateien, unbekannte Assetdateien und Designquellen werden nicht
veröffentlicht. Die
Photoshop-Datei `graphics/catagory/Alternativ/Blaupause.psd` bleibt im Repository als Designquelle erhalten, wird
aber bewusst nicht mehr in `_site/` kopiert. `pages:check` vergleicht das fertige Artefakt exakt mit der freigegebenen
Quelle und weist fehlende, zusätzliche oder symbolisch verlinkte Dateien zurück.

Aktuelle Arten-, Asset- und Pflegezähler stehen ausschließlich in `docs/project-status.md`. Das dynamische
Artefaktbudget wächst mit dem Artenbestand; das absolute Notfalllimit bleibt 500 MiB.

Vor automatischen Git-Veröffentlichungen aus dem Arten-Explorer wird `docs/project-status.md` serverseitig neu
erzeugt und gemeinsam mit den Daten- und Assetänderungen vorgemerkt. `status:check` bleibt zusätzlich die
unabhängige CI-Barriere für manuelle Git-Arbeiten und unerwartete Abweichungen.

## Lokale Befehle

Vollständiges Quality-Gate ohne Netzwerkzugriff:

```powershell
npm.cmd run --silent quality:ci
```

Einzelne Ebenen:

```powershell
npm.cmd run --silent check:syntax
npm.cmd run --silent check:style
npm.cmd run --silent check:schema
npm.cmd run --silent test
npm.cmd run --silent size:check
npm.cmd run --silent audit:project
npm.cmd run --silent pages:prepare -- --base-mib=12 --per-species-mib=2.5 --absolute-max-mib=500
npm.cmd run --silent pages:check
```

`npm ci --ignore-scripts` ist Teil des Linux-CI-Jobs. Lokal muss es für normale Prüfungen nicht erneut ausgeführt
werden und verändert keine Projekt- oder Assetdaten.

## Abgrenzung

Die Änderung betrifft ausschließlich Repository-Prüfung und GitHub-Pages-Bau. Squarespace-JavaScript und Custom CSS
wurden nicht geändert; Footer- oder `?v=`-Versionen bleiben deshalb unverändert.

Die vollständigen Regeln, Adapter- und Testgrenzen sowie die Schwellen für die lokale Git-Historie stehen in
`docs/repository-quality-gates.md`.
