# Asset Structure Plan

Stand: 2026-06-17

Ziel: Artspezifische Assets werden dauerhaft pro Art gebuendelt. Die alte getrennte Struktur nach Assettyp wurde nach
erfolgreichem Live-Test entfernt.

## Aktueller Stand

- Produktive Struktur: `species-assets/<SafeName>/`
- 45 Artordner
- 45 Karten: `map.jpg`
- 45 Sounds: `sound.mp3`
- 45 Credits-Dateien: `credits.json`
- 45 Spektrogramme: `spectrogram.webp`
- Alte Ordner `Verbreitungskarten/` und `sounds/` sind geloescht.
- `Testlauf/` bleibt nur fuer temporaere lokale Ausgaben und ist nicht versioniert.

## Zielstruktur

```text
species-assets/
  Amsel/
    map.jpg
    sound.mp3
    credits.json
    spectrogram.webp
```

`SafeName` entspricht weiterhin `SpeciesCore.sanitizeAssetName()` und der Pipeline-Funktion `sanitizeAssetName()`.
Die Slugs der Squarespace-Artseiten bleiben unveraendert und werden nicht aus dieser Ordnerstruktur abgeleitet.

Nicht in `species-assets/` gehoeren:

- globale Icons unter `graphics/`
- JavaScript-Module
- Reports wie `fehlende_elemente_report.json`
- temporaere Testausgaben aus `Testlauf/`

## Geaenderte Komponenten

| Datei | Aktueller Stand |
|---|---|
| `species-core.js` | Liefert `getSpeciesAssetPaths(data)` ausschliesslich fuer `species-assets/<SafeName>/`. |
| `map-loader.js` | Laedt Karten aus `species-assets/<SafeName>/map.jpg`. |
| `species-sound.js` | Laedt Sound, Credits und Spektrogramm aus dem Artordner. |
| `update.mjs` | Schreibt Karten, Sounds und Credits direkt nach `species-assets/<SafeName>/`. |
| `scripts/generate-spectrograms.mjs` | Liest `species-assets/<SafeName>/sound.mp3` und schreibt `spectrogram.webp` in denselben Artordner. |
| `scripts/monthly-site-audit.mjs` | Prueft nur noch `species-assets/` als produktive Asset-Struktur. |
| `update_local.bat` | Fuehrt Suchlauf und anschliessend Spektrogramm-Abgleich aus. |
| `update_github_only.bat` | Pusht die aktuelle neue Struktur ohne alte Assetordner. |

## Manuell gepflegte Karten

Sieben Karten bleiben fachlich manuell gepflegt, weil die IUCN-Daten korrupte Kartendaten liefern:

- `Blaukehlchen`
- `Fischertukan`
- `Grosstrappe`
- `Kernbeisser`
- `Reh`
- `Rotfuchs`
- `Waldkauz`

Diese Karten liegen jetzt ausschliesslich unter `species-assets/<SafeName>/map.jpg` und sind in
`docs/manual-map-overrides.md` dokumentiert. Bei Pipeline- oder Kartenlogik-Aenderungen muss diese Liste geprueft
werden, bevor Karten ersetzt werden.

## Teststand

Lokale Checks vor der Entfernung der alten Struktur:

```powershell
node --check .\species-core.js
node --check .\map-loader.js
node --check .\species-sound.js
node --check .\update.mjs
node --check .\scripts\generate-spectrograms.mjs
node --check .\scripts\monthly-site-audit.mjs
npm.cmd run --silent audit:site -- --skip-live --skip-pages
npm.cmd run --silent generate:spectrograms -- --dry-run --species=Amsel
```

Nach der Entfernung der alten Struktur muessen diese Checks erneut laufen. Ein kompletter Suchlauf ueber
`node .\update.mjs` bzw. `update_local.bat` prueft zusaetzlich, dass die Pipeline die neue Struktur aktiv pflegt.

## Squarespace

Aktuell dokumentierter Footer-Stand:

- `species-core.js?v=1.0.4`
- `map-loader.js?v=1.0.7`
- `species-sound.js?v=1.0.22`

Wenn im Rahmen dieser Bereinigung weitere Frontend-Dateien geaendert werden, muss `docs/squarespace-footer.html`
aktualisiert und die betroffene `?v=`-Version in Squarespace erhoeht werden.
