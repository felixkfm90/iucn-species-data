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

## Einzelgrenzen und dynamisches Größenbudget

Der Medienvalidator begrenzt Ausreißer unabhängig vom Gesamtbestand:

- Karte: 2 MiB;
- Artportrait: 2 MiB;
- Tierstimme: 10 MiB;
- Credits: 128 KiB;
- Spektrogramm: 0,5 MiB;
- veröffentlichte PNG-Grafik: 2 MiB;
- vollständiges Artpaket: 15 MiB.

`scripts/prepare-pages-artifact.mjs` misst zusätzlich das vollständig vorbereitete `_site/`-Verzeichnis. Sein
Budget wächst automatisch mit dem fachlichen Artenbestand: 12 MiB Grundbedarf plus 2,5 MiB je Eintrag in
`species_list.json`. Ein absolutes Notfalllimit von 500 MiB schützt zusätzlich vor einem grundsätzlich entgleisten
Artefakt. Wird eine Grenze überschritten, endet der Build mit einer verständlichen Meldung, bevor Daten zu GitHub
Pages hochgeladen werden.

```powershell
npm.cmd run --silent pages:prepare -- --base-mib=12 --per-species-mib=2.5 --absolute-max-mib=500
```

Für einen gezielten Test kann das dynamische Modell mit `--max-mib=<MiB>`, `--max-bytes=<Bytes>` oder der
Umgebungsvariable `PAGES_MAX_BYTES` durch eine feste Grenze ersetzt werden. Der Workflow setzt alle produktiven
Werte sichtbar in `.github/workflows/pages.yml`.

Das dynamische Budget ist keine technische Plattformgrenze. Normales Wachstum durch zusätzliche Arten vergrößert
die Grenze ohne manuellen Eingriff. Nur wenn der durchschnittliche Speicher je Art dauerhaft über 2,5 MiB steigt,
werden aktuelle Artefaktgröße und größte Dateien geprüft. Ist eine fachliche Anpassung tatsächlich nötig, können
die offen dokumentierten Faktoren kontrolliert geändert werden. Lokale Daten werden bei einer Überschreitung weder
verändert noch gelöscht.

Der Stand vom 2026-07-12 umfasst 364 Dateien mit 89,86 MiB bei einem automatisch berechneten Budget von 134,5 MiB.
Die geplante globale Taxonomiereferenz aus Phase 7.9 bleibt vollständig außerhalb von Git und GitHub Pages und
belastet dieses Budget nicht.

## CI-Ablauf

Der Pages-Build verwendet Node.js 24 und führt vor Artefaktbau und Upload `assets:check` aus. Danach baut
`pages:prepare` das Artefakt mit dem expliziten dynamischen Budgetmodell. Ein Medien- oder Größenfehler verhindert
daher den Upload und den Deploy-Job.

Der folgende Auditpunkt ergänzt darüber hinaus einen vollständigen Quality-Job mit Installation, Syntaxprüfung,
Explorer-/Medientests und lokalem Datenaudit. Diese umfassendere CI-Barriere bleibt getrennt, damit ihre Fehler
eindeutig vom hier abgeschlossenen Medien-/Größenschutz unterscheidbar sind.
