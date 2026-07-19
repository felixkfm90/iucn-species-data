# Phase 8: Vorschau- und Veröffentlichungsablauf

Stand: 2026-07-18

## Ziel

Änderungen der Phase 8 dürfen die öffentliche Squarespace-Seite erst erreichen, nachdem sie lokal, in einer
nicht öffentlich verlinkten Squarespace-Testseite und durch Felix freigegeben wurden. Zwischenstände werden weder
über GitHub Pages veröffentlicht noch durch eine vorzeitig erhöhte `?v=`-Version in Squarespace aktiviert.

## Technische Trennung

- Entwicklung erfolgt auf `codex/phase-8-taxonomy` oder einem späteren Phase-8-Arbeitsbranch.
- `.github/workflows/pages.yml` veröffentlicht ausschließlich Pushes nach `main` oder einen ausdrücklich manuell
  gestarteten Workflow.
- Der lokale Vorschau-Server bindet nur an `127.0.0.1`, erlaubt nur `GET`/`HEAD` und liefert ausschließlich eine
  feste Positivliste aus Taxonomie-Modul, dokumentiertem Squarespace-CSS, lokalen Artdaten und Vorschauoberfläche.
- Die produktive Squarespace-`?v=`-Version bleibt bis zur Endfreigabe unverändert. Dadurch verwendet die Website
  weiterhin den zuletzt freigegebenen GitHub-Pages-Stand.

### Atomare Taxonomie-Auslieferung

`species-taxonomy.js` lädt vor dem ersten Rendern den freigegebenen Stand von
`docs/squarespace-custom.css` aus demselben GitHub-Pages-Artefakt. Das Stylesheet ist deshalb ausdrücklich Teil der
Pages-Positivliste. Markup und notwendiges CSS werden damit gemeinsam veröffentlicht; ein neuer Modulstand kann auf
Squarespace nicht mehr vorübergehend mit veraltetem Taxonomie-CSS als unformatierte Symbolfolge erscheinen. Die
Squarespace-CSS-Kopie bleibt weiterhin die dokumentierte Gestaltungsreferenz.

## Lokale Vorschau

Start im Repository-Ordner:

```powershell
npm.cmd run --silent preview:squarespace
```

Danach im Browser öffnen:

```text
http://127.0.0.1:4188/
```

Die Oberfläche bietet:

- Auswahl jeder Art aus der lokalen `speciesData.json`;
- Desktop-, Tablet- und Mobilbreite;
- Neuladen nach einer Code- oder CSS-Änderung;
- Öffnen der gewählten Artvorschau in einem eigenen Fenster.

Die Artvorschau lädt neben Info, Status und Taxonomie auch Tierstimme und optionales produktives Artportrait.
Desktop zeigt die Taxonomie links, Allgemeine Daten mit Status/Trend darunter in der Mitte, die Tierstimme unter
diesen beiden Spalten und das Portrait ohne sichtbare Überschrift rechts. Der Taxonomierahmen folgt automatisch der
Höhe der mittleren beiden Bereiche; die kompakte Einheit aus Pfeil und Pyramide bleibt darin zentriert. Der Pfeil
hat dabei exakt die Höhe der sichtbaren Taxonomiestufen und wird nicht auf die volle Rahmenhöhe gestreckt.
Einheitliche und geschlechtsspezifische
Größen- oder Gewichtswerte müssen dieselbe Wertspalte verwenden. Tablet und Mobil stapeln dieselben Bereiche.
Fehlt ein Portrait, darf kein leerer dritter Bereich bleiben.

Die Vorschau simuliert die für die Artseite relevanten Squarespace-Container und verwendet die echten Dateien des
aktuellen Git-Branches. Squarespace-Navigation, Template-Chrome und fremde Squarespace-Skripte werden nicht
vollständig nachgebaut. Deshalb ist zusätzlich eine Squarespace-Testseite Teil der Endabnahme.

Automatisierter Vertrag:

```powershell
npm.cmd run --silent test:preview
```

## Verbindliche Freigabestufen

1. Änderung ausschließlich im Phase-8-Arbeitsbranch umsetzen.
2. Syntax-, Modul-, Daten-, CSS-, Vorschau- und Gesamtprüfungen lokal ausführen.
3. Desktop, Tablet und Mobil in der lokalen Vorschau visuell prüfen.
4. Den freizugebenden Branchstand auf einer nicht öffentlich verlinkten Squarespace-Testseite mit lokalen oder
   branchbezogenen Modul-URLs prüfen. Die öffentliche Footer-Version bleibt dabei unverändert.
5. Felix bestätigt den sichtbaren Endstand ausdrücklich.
6. Erst danach den freigegebenen Stand nach `main` übernehmen und den erfolgreichen GitHub-Pages-Lauf abwarten.
7. Erst nach erfolgreichem Pages-Deployment die produktiven Versionen von `species-core.js`, `species-info.js`,
   `species-taxonomy.js` und `species-portrait.js` in Squarespace und `docs/squarespace-footer.html` gemeinsam
   erhöhen. Für diesen Stand sind `1.0.5`, `1.0.6`, `1.0.5` und `1.0.1` dokumentiert. Die Taxonomie-Version
   `1.0.5` erneuert zugleich den Cache-Schlüssel des von diesem Modul geladenen Artseiten-CSS.
8. Öffentliche Desktop- und Mobilseite prüfen. Erst diese Prüfung schließt die Veröffentlichung ab.

Ohne ausdrückliche Freigabe in Schritt 5 wird weder nach `main` übernommen noch die produktive Squarespace-Version
geändert.

## Rückfall

Falls die Live-Prüfung trotz Vorabnahme fehlschlägt, wird in Squarespace sofort wieder die vorherige dokumentierte
`?v=`-Version gesetzt. Der fehlerhafte `main`-Commit wird anschließend kontrolliert rückgängig gemacht; es werden
keine nicht geprüften Direktkorrekturen auf der öffentlichen Seite vorgenommen.
