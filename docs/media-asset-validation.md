# Medienprüfung und Pages-Größenbudget

Stand: 2026-10-09

## Zweck

Vor jedem GitHub-Pages-Upload werden die produktiven Medien anhand ihres tatsächlichen Dateiinhalts geprüft. Eine
passende Dateiendung genügt nicht. Zusätzlich verhindert ein kontrolliertes Größenbudget, dass eine versehentlich
unkomprimierte oder unerwartet große Datei unbemerkt veröffentlicht wird.

## Medienvalidator

Der Validator `scripts/validate-media-assets.mjs` prüft für jede Art aus `species_list.json`:

- `map.jpg`: JPEG-Struktur, positive Bildabmessungen und tatsächliche Dekodierbarkeit;
- `portrait.webp`: vollständiger WebP-Container, positive Bildabmessungen und tatsächliche Dekodierbarkeit;
- `sound.mp3`: mehrere aufeinanderfolgende gültige MPEG-Audioframes über den zentralen Audioinspektor;
- `credits.json`: gültiges JSON;
- `spectrogram.webp`: vollständiger WebP-Container, positive Bildabmessungen und tatsächliche Dekodierbarkeit.

Zusätzlich werden alle veröffentlichten PNG-Dateien unter `graphics/` auf PNG-Signatur und Abmessungen geprüft.
Der gemeinsame asynchrone Decoder prüft JPEG/PNG/WebP mit FFmpeg, begrenzt Datei-/Pixelgröße, Zeit,
Einzelallokation, Threads und Ausgabe und wartet auf das tatsächliche Prozessende. Ein Dateikopf allein
beweist keine darstellbare Karte. Inhaltshashgebundene Erfolge werden nur in einem begrenzten Prozesscache
gehalten; geänderte Bytes werden erneut geprüft. Der Kartenimport nutzt dieselbe Prüfung vor Übernahme;
Fehler erhalten das vorherige Medium und Register. Die Veröffentlichung bindet ihre Eingänge erneut nach
der asynchronen Prüfung. Linux-CI installiert FFmpeg ausdrücklich, statt fehlende Dekodierbarkeit zu überspringen.
Verwaiste Art-Assetordner werden abgewiesen. Ein laut `fehlende_elemente_report.json` bewusst fehlendes Soundpaket
wie beim Grünen Leguan ist erlaubt; ein nur teilweise vorhandenes Soundpaket oder ein Widerspruch zum Report ist
hingegen ein Fehler.

Der Pipeline-Kartenadapter `scripts/iucn-map-adapter.mjs` verwendet dieselbe tatsächliche JPEG-Prüfung
vor Dateiersatz und Bewertungsquittung. Direkter Abruf und Cacheweg prüfen Startadresse und jedes manuell
verfolgte Weiterleitungsziel auf öffentliche HTTP-/HTTPS-Adressen; API-Zugangsdaten bleiben ausschließlich
am Origin `https://api.iucnredlist.org`. Eine HTTP-Zugriffssperre wird nicht durch einen anderen Host,
Cache oder Windows-Abruf umgangen. Windows darf ausschließlich einen geeigneten initialen Transportfehler
vor jeder HTTP-Antwort ersetzen; Zertifikat-, Weiterleitungs-, Antwortstream- und Bildfehler sind terminal.
Fehler erhalten die bisherige Karte und ihren Bewertungsstand. Der Browserimport bleibt der vorgesehene
Bedienweg bei einer Anbietersperre.

Die Transportgrenzen gelten je Abruf, nicht als Gesamtbudget einer Art: höchstens fünf Weiterleitungen,
20 MiB je Antwort und 30 Sekunden für den Node-Abruf einschließlich Weiterleitungskette und Antwortlesen.
Der Windows-Helfer verbietet Weiterleitungen, begrenzt seinen Stream vor Dateischreiben und schließt
Antwort und Dateien bei Fehlern. Seine Verbindungs-/Lese-Wartezeit beträgt jeweils 30 Sekunden,
der gesamte Helfer ist auf 60 Sekunden je Versuch begrenzt; maximal drei Versuche nur bei geeigneten
Transportfehlern. Die JPEG-Dekodierung ist zusätzlich auf 15 Sekunden und 40 Millionen Pixel begrenzt.
Jede der drei direkten Quellenvarianten besitzt einen eigenen Satz mit höchstens 50 Quellen; anschließend
teilen alle Cachekandidaten und der öffentliche Cachepfad einen solchen Satz. Mehrere erlaubte Abrufe
werden nacheinander versucht; kein globales 30-Sekunden-, 20-MiB- oder 50-Quellen-Budget ist zugesichert.

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

Der Bau darf ausschließlich `_site` direkt unter seiner Projektwurzel ersetzen. Isolierte Prüfungen
verwenden eine eigene kleine Projektkopie in ihrer gebundenen Temp-Sitzung; fremde Temp-Unterordner
werden auch dann verweigert, wenn ihr Endname `_site` lautet.
Quelldaten-/Datenordner und verknüpfte Zielpfade werden vor jeder Löschwirkung abgewiesen. Neue Testartefakte
liegen in der eigenen Programm-temp-Sitzung. Auditbefunde und konkrete Gegenproben:
[Gesamtaudit Phase 10.5](audit-auftrag-phase-10-5.md).

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

Der Stand vom 2026-07-13 umfasst 364 Dateien mit 89,72 MiB bei einem automatisch berechneten Budget von 134,5 MiB.
Die geplante globale Taxonomiereferenz aus Phase 7.9 bleibt vollständig außerhalb von Git und GitHub Pages und
belastet dieses Budget nicht.

Unabhängig vom öffentlichen Artefakt prüft `size:check` den versionierten Projektstand mit 20 MiB Grundbedarf plus
2,5 MiB je Art und ebenfalls 500 MiB absolutem Limit. Bei 50 Arten nutzt der Stand vom 2026-07-18 92,6 von
145,0 MiB. Die lokale Git-Packhistorie wird nur beobachtet: Warnung ab 500 MiB und verpflichtende
Speicherplanung ab 750 MiB. Ein History-Rewrite erfolgt niemals automatisch. Details:
`docs/repository-quality-gates.md`.

## CI-Ablauf

Der Pages-Workflow verwendet Node.js 24. Der getrennte Quality-Job führt `assets:check` zusammen mit Syntaxprüfung,
allen Testgruppen, Audioformatprüfung und Datenaudit aus. Erst danach baut `pages:prepare` das Artefakt mit dem
expliziten dynamischen Budgetmodell; `pages:check` prüft anschließend dessen vollständige öffentliche Pfadliste.
Ein Qualitäts-, Medien-, Größen- oder Pfadfehler verhindert daher Artefakt-Upload und Deploy-Job. Details zum
Gesamtablauf stehen in `docs/ci-quality-gate.md`.
