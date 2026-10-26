# CI-Qualitätsgate vor GitHub Pages

Stand: 2026-10-25

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

Der Job `quality` in `.github/workflows/pages.yml` verwendet Node.js 24. Die festgebundenen Stände von
`actions/checkout` v5 und `actions/setup-node` v6 verwenden ebenfalls Node 24. Die frühere
Node-20-Abkündigungswarnung dieser beiden Aktionen entfällt damit. Der Job führt aus:

1. `npm ci --ignore-scripts` auf Grundlage von `package-lock.json`;
2. FFmpeg installieren, damit JPEG/PNG/WebP tatsächlich dekodiert werden; fehlender Decoder ist kein übersprungener Erfolg;
3. `check:syntax` für alle JavaScript-/MJS-Quelldateien außerhalb lokaler Laufzeit- und Sicherungsordner;
4. `check:style` für Kodierung, Abschlusszeile, nachgestellte Leerzeichen und Tabs;
5. `check:docs` für lokale Markdown-Links und ausdrücklich genannte Dokumentpfade;
6. `check:schema` für Artenliste, generierte Artdaten, Overrides, Assessment-Zuordnungen und Fehlreport;
7. `npm test` als gemeinsamer Einstieg für direkte Modul-, Vertrags- und Integrationstests;
8. `audio:check` für alle vorhandenen Tierstimmen;
9. `assets:check` für die produktiven Karten-, Portrait-, Sound-, Credits-, Spektrogramm- und Grafikdateien;
10. `size:check` für das flexible Größenbudget des versionierten Projektstands und die Historienbeobachtung;
11. `audit:project` für Artenlisten, generierte Daten, Report, Overrides und Assessment-Zuordnungen;
12. `status:check` für den automatisch dokumentierten Projektstand;
13. den bestehenden lokalen Monatsaudit ohne Netzwerkzugriff.

Unmittelbar nach der gesperrten Abhängigkeitsinstallation prüft der Quality-Job zusätzlich
`npm audit --audit-level=high` gegen die aktuelle npm-Meldedatenbank. Hohe oder kritische Befunde
sowie eine nicht erfolgreich ausführbare Abfrage stoppen den Job vor dem Artefaktbau. Diese
Netzwerkprüfung ist bewusst ein eigener CI-Schritt; das lokale `quality:ci` bleibt ohne diese Abfrage
ausführbar. Die Prüfung umfasst auch Entwicklungsabhängigkeiten wie Electron. Sie bewertet den
Paketbestand, nicht die in einem separat installierten Node-Programm eingebauten Bibliotheken.

Workflowrechte bleiben nach Job getrennt: global nur `contents: read`, im Build zusätzlich `pages: read`,
Deployment allein mit `pages: write` und `id-token: write`. Ein lokaler grüner Lauf bestätigt weder
einen neuen Linux-Lauf noch Deployment. Den tatsächlich veröffentlichten und lokalen Auditstand führt
der [Auditauftrag Phase 10.5](audit-auftrag-phase-10-5.md).

Bewusst fehlende Sounds aus dem Report bleiben zulässig. Abweichende Karten-Assessment-Zuordnungen sind nur bei
ausdrücklich manuell gepflegten Karten zulässig. Doppelte wissenschaftliche Namen, deutsche Namen oder URL-Slugs,
verwaiste Overrides beziehungsweise Assessment-Zuordnungen und sonstige Explorer-Validierungsprobleme brechen CI ab.

## Feste Action-Stände und Aktualisierung

Alle sieben direkt im Workflow verwendeten `uses:`-Referenzen sind an volle offizielle Commit-SHAs
gebunden. Die Versionskommentare halten die bisher verwendeten Majorversionen erkennbar. Der Abgleich
vom 10. Oktober ersetzt nur bewegliche Tags durch deren zu diesem Zeitpunkt aufgelösten Commit;
Eingaben, Jobrechte, Node-Version, Jobabhängigkeiten und Artefaktregeln ändern sich dadurch nicht.
GitHub empfiehlt volle Commit-SHAs, um den unmittelbar referenzierten Action-Stand unveränderlich zu
machen: [Secure Use](https://docs.github.com/en/actions/reference/security/secure-use).

| Aktion / bisheriger Tag | Gebundener offizieller Commit | Vorkommen |
| --- | --- | --- |
| checkout v5 | [fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09](https://github.com/actions/checkout/commit/fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09) | Quality, Build |
| setup-node v6 | [249970729cb0ef3589644e2896645e5dc5ba9c38](https://github.com/actions/setup-node/commit/249970729cb0ef3589644e2896645e5dc5ba9c38) | Quality, Build |
| configure-pages v5 | [983d7736d9b0ae728b81ab479565c72886d7745b](https://github.com/actions/configure-pages/commit/983d7736d9b0ae728b81ab479565c72886d7745b) | Build |
| upload-pages-artifact v3 | [56afc609e74202658d3ffba0e8f6dda462b719fa](https://github.com/actions/upload-pages-artifact/commit/56afc609e74202658d3ffba0e8f6dda462b719fa) | Build |
| deploy-pages v5 | [368f82528645a54fb793d4d04e342629a3f51346](https://github.com/actions/deploy-pages/commit/368f82528645a54fb793d4d04e342629a3f51346) | Deploy |

Diese Bindung umfasst die direkten Referenzen. Die offizielle Composite-Aktion
[upload-pages-artifact](https://github.com/actions/upload-pages-artifact/blob/56afc609e74202658d3ffba0e8f6dda462b719fa/action.yml)
verwendet intern weiterhin `actions/upload-artifact@v4`; ihr äußerer Pin bindet diesen indirekten Tag
nicht fest. Auch `ubuntu-latest` und die installierten Systempakete bleiben externe Laufzeitabhängigkeiten.
Checkout, Setup Node und Deploy Pages verwenden Node 24, Configure Pages weiterhin Node 20.
Setup Node setzt laut [offiziellem README](https://github.com/actions/setup-node/blob/249970729cb0ef3589644e2896645e5dc5ba9c38/README.md)
einen Runner ab v2.327.1 voraus. Diese Eigenschaften bestanden bereits beim Tagstand;
eine vollständige transitive Lieferkettenbindung oder Linux-Abnahme ist daraus nicht abzuleiten.

Bei einer Aktualisierung:

1. Die gewünschte offizielle Tag-Referenz lesend über GitHubs Git-API auflösen; annotierte Tags bis zum
   Commit dereferenzieren und Herkunft im offiziellen Actions-Repository prüfen.
2. Releaseänderungen, Commit, `action.yml`, Laufzeit, Eingaben und indirekte Referenzen gegenlesen.
3. Volle SHA und Versionskommentar gemeinsam ändern, einschließlich beider Checkout-/Setup-Node-Vorkommen.
4. Workflowdiff auf die beabsichtigte Wirkung begrenzen, passende lokale Prüfungen sowie Stil und
   Dokumentverweise ausführen. Der Artefakttest allein prüft keine Action-Referenzen.
5. Commit/Push nur mit aktueller Freigabe; danach den tatsächlichen Linux-Quality-, Build- und Pages-Lauf
   gesondert nachweisen. Ein lokaler grüner Abgleich ist kein neuer Deploymentnachweis.

Der datierte Quellen- und Prüfbeleg steht ausschließlich im [Auditauftrag Phase 10.5](audit-auftrag-phase-10-5.md).

## Pages-Artefakt

Der Build-Job startet nur nach erfolgreichem Quality-Job. `scripts/pages-artifact-policy.mjs` ist die gemeinsame
Freigabeliste für Builder und Prüfer:

- im Repo-Root nur die festgelegten Frontend- und JSON-Dateien;
- zusätzlich ausschließlich `docs/squarespace-custom.css` aus dem Dokumentationsordner;
- in `species-assets/` nur die sechs bekannten Asset-/Metadatendateien je Art;
- unter `graphics/` nur PNG-Laufzeitgrafiken;
- zusätzlich die generierten Dateien `index.html` und `.nojekyll`.

`README.md`, alle übrigen Dateien unter `docs/`, lokale Sicherungen, temporäre Dateien, unbekannte Assetdateien
und Designquellen werden nicht veröffentlicht. Die
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
npm.cmd run --silent check:docs
npm.cmd run --silent check:schema
npm.cmd run --silent test
npm.cmd run --silent size:check
npm.cmd run --silent audit:project
npm.cmd run --silent pages:prepare -- --base-mib=12 --per-species-mib=2.5 --absolute-max-mib=500
npm.cmd run --silent pages:check
```

`npm ci --ignore-scripts` ist Teil des Linux-CI-Jobs. Lokal muss es für normale Prüfungen nicht erneut ausgeführt
werden und verändert keine Projekt- oder Assetdaten.

Lokale Servertests verwenden eine eigene Projektfixture und ausdrücklich eigene Taxonomie-/Lightroom-
Speicherpfade. Der installierte Explorer und ein gespeicherter produktiver Aktualisierungsauftrag sind kein
Testziel. Eine produktive Owner-Sperre darf deshalb weder durch Schließen des Explorers noch durch einen
gelockerten Sperrtest umgangen werden; ein solcher Testfehler ist in der Fixture-Isolierung zu korrigieren.

## Abgrenzung

Das CI-Gate prüft den lokalen Quellstand einschließlich der Vertragstests für die Squarespace-Module;
der nachfolgende Build prüft das Pages-Artefakt. Die maßgebliche lokale Skript- und Cacheversionenreferenz
ist der [Squarespace-Footer](squarespace-footer.html), das zugehörige Standard-CSS steht in
[squarespace-custom.css](squarespace-custom.css). Gekoppelte JS-/CSS-Änderungen gemeinsam prüfen.

Ein grünes Gate belegt weder die Übernahme des Footers im CMS noch die tatsächlich ausgelieferten
Skript-/CSS-Stände, die Darstellung in Desktop-, Tablet- und Mobilansicht oder die native Bedienung.
Diese Prüfungen und die Veröffentlichung sind getrennte Nachweise. Datierte öffentliche Beobachtungen
und offene Grenzen stehen im [Auditauftrag Phase 10.5](audit-auftrag-phase-10-5.md); ältere Live-Belege
gelten nur für ihren dort gebundenen Prüfzeitpunkt und Quellstand.

Die vollständigen Regeln, Adapter- und Testgrenzen sowie die Schwellen für die lokale Git-Historie stehen in
`docs/repository-quality-gates.md`.
