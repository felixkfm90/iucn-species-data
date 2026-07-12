# Medienprüfung und Pages-Größenbudget

Stand: 2026-07-12

## Zweck

Vor jedem GitHub-Pages-Upload werden die produktiven Medien anhand ihres tatsächlichen Dateiinhalts geprüft. Eine
passende Dateiendung genügt nicht. Zusätzlich verhindert ein kontrolliertes Größenbudget, dass eine versehentlich
unkomprimierte oder unerwartet große Datei unbemerkt veröffentlicht wird.

## Medienvalidator

Der Validator `scripts/validate-media-assets.mjs` prüft für jede Art aus `species_list.json`:

- `map.jpg`: echte JPEG-Signatur und lesbare, positive Bildabmessungen;
- `portrait.webp`: echter WebP-Container und lesbare, positive Bildabmessungen;
- `sound.mp3`: mehrere aufeinanderfolgende gültige MPEG-Audioframes über den zentralen Audioinspektor;
- `credits.json`: gültiges JSON;
- `spectrogram.webp`: echter WebP-Container und lesbare, positive Bildabmessungen.

Zusätzlich werden alle veröffentlichten PNG-Dateien unter `graphics/` auf PNG-Signatur und Abmessungen geprüft.
Verwaiste Art-Assetordner werden abgewiesen. Ein laut `fehlende_elemente_report.json` bewusst fehlendes Soundpaket
wie beim Grünen Leguan ist erlaubt; ein nur teilweise vorhandenes Soundpaket oder ein Widerspruch zum Report ist
hingegen ein Fehler.

Lokale Befehle:

```powershell
npm.cmd run --silent test:media
npm.cmd run --silent assets:check
```

## Größenbudget

`scripts/prepare-pages-artifact.mjs` misst das vollständig vorbereitete `_site/`-Verzeichnis. Das Standardbudget
beträgt 120 MiB. Wird es überschritten, endet der Build mit einer verständlichen Meldung, bevor das Artefakt zu
GitHub Pages hochgeladen wird.

```powershell
npm.cmd run --silent pages:prepare -- --max-mib=120
```

Alternativ sind `--max-bytes=<Bytes>` oder die Umgebungsvariable `PAGES_MAX_BYTES` möglich. Der Workflow setzt die
Grenze sichtbar in `.github/workflows/pages.yml`.

120 MiB sind keine technische Plattformgrenze und keine Obergrenze für die zukünftige fachliche Datenbank. Es ist
eine anpassbare Frühwarnschwelle. Wenn der reguläre Artenbestand die Grenze erreicht, werden zunächst aktuelle
Artefaktgröße und größte Dateien geprüft. Ist das Wachstum fachlich plausibel und alle Formate sind korrekt, wird
der Workflowwert in einem dokumentierten Commit kontrolliert erhöht. Lokale Daten werden bei einer Überschreitung
weder verändert noch gelöscht.

Der Stand vom 2026-07-12 umfasst 362 Dateien mit 89,86 MiB und besitzt damit rund 30 MiB Reserve. Die geplante
globale Taxonomiereferenz aus Phase 7.9 bleibt vollständig außerhalb von Git und GitHub Pages und belastet dieses
Budget nicht.

## CI-Ablauf

Der Pages-Build verwendet Node.js 24 und führt vor Artefaktbau und Upload `assets:check` aus. Danach baut
`pages:prepare` das Artefakt mit dem expliziten 120-MiB-Budget. Ein Medien- oder Größenfehler verhindert daher den
Upload und den Deploy-Job.

Der folgende Auditpunkt ergänzt darüber hinaus einen vollständigen Quality-Job mit Installation, Syntaxprüfung,
Explorer-/Medientests und lokalem Datenaudit. Diese umfassendere CI-Barriere bleibt getrennt, damit ihre Fehler
eindeutig vom hier abgeschlossenen Medien-/Größenschutz unterscheidbar sind.
