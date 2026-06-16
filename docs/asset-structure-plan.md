# Asset Structure Plan

Stand: 2026-06-16

Ziel: Karten, Sounds, Credits und Spektrogramme sind pro Art nach sanitisiertem Namen gebuendelt. Die Migration wurde
bewusst als Parallelbetrieb umgesetzt: `species-assets/<SafeName>/` ist die neue primaere Struktur, die bisherigen
Pfade bleiben zunaechst als Fallback bestehen.

## Kurzfazit

Die Asset-Struktur ist umgesetzt:

- 45 Arten in `speciesData.json`
- 45 Artordner in `species-assets/<SafeName>/`
- 45 Karten in `species-assets/<SafeName>/map.jpg`
- 45 Sounds in `species-assets/<SafeName>/sound.mp3`
- 45 Credits-Dateien in `species-assets/<SafeName>/credits.json`
- 45 Spektrogramme in `species-assets/<SafeName>/spectrogram.webp`
- alte Pfade bleiben parallel bestehen:
  - `Verbreitungskarten/<SafeName>.jpg`
  - `sounds/<SafeName>/<SafeName>.mp3`
  - `sounds/<SafeName>/credits.json`
  - `sounds/<SafeName>/spectrogram.webp`

Die Frontend-Module bevorzugen die neue Struktur und fallen bei fehlenden neuen Dateien auf die alten Pfade zurueck.
Dadurch kann GitHub Pages und Squarespace ohne harten Bruch getestet werden.

## Neue primaere Struktur

```text
species-assets/
  Amsel/
    map.jpg
    sound.mp3
    credits.json
    spectrogram.webp
  Bluthaenfling/
    map.jpg
    sound.mp3
    credits.json
    spectrogram.webp
  ...
```

Nicht in `species-assets/` gehoeren:

- `graphics/catagory/Alternativ/*.png`
- `graphics/trend/*.png`
- globale Website- oder Statusgrafiken
- JavaScript-Dateien
- `speciesData.json`

## Legacy-Fallbacks

Diese Pfade bleiben fuer den Parallelbetrieb versioniert:

```text
Verbreitungskarten/<SafeName>.jpg
sounds/<SafeName>/<SafeName>.mp3
sounds/<SafeName>/credits.json
sounds/<SafeName>/spectrogram.webp
```

Sie duerfen erst entfernt werden, wenn:

1. GitHub Pages die neue Struktur live ausliefert.
2. Squarespace-Footer auf die neuen JS-Versionen gesetzt wurde.
3. Artseiten live auf Desktop und Mobile getestet wurden.
4. Ein kompletter Auditlauf mit GitHub-Pages-Checks erfolgreich war.
5. Mindestens ein normaler Pipeline-/Suchlauf die neue Struktur korrekt weiterpflegt.

## Betroffene Dateien

| Datei / Bereich | Neuer Stand |
|---|---|
| `species-core.js` | Liefert `getSpeciesAssetPaths(data)` mit primaeren und Legacy-Pfaden. |
| `map-loader.js` | Bevorzugt `species-assets/<SafeName>/map.jpg`, fallbackt auf `Verbreitungskarten/<SafeName>.jpg`. |
| `species-sound.js` | Bevorzugt `species-assets/<SafeName>/sound.mp3`, `credits.json`, `spectrogram.webp`; fallbackt auf `sounds/<SafeName>/...`. |
| `update.mjs` | Pflegt Legacy-Pfade weiter und synchronisiert danach nach `species-assets/<SafeName>/`. |
| `scripts/generate-spectrograms.mjs` | Liest bevorzugt `species-assets/<SafeName>/sound.mp3` und schreibt produktiv nach `species-assets/<SafeName>/spectrogram.webp`; Legacy-Spektrogramm wird mit synchronisiert. |
| `scripts/monthly-site-audit.mjs` | Prueft Legacy und `species-assets`; fehlende neue Artassets werden separat gemeldet. |
| `docs/manual-map-overrides.md` | Manuell gepflegte Karten bleiben Schutzpunkt; sie muessen in beiden Strukturen vorhanden sein. |
| Squarespace Footer | Muss nach Deploy `species-core.js`, `map-loader.js` und `species-sound.js` mit neuen `?v=`-Versionen laden. |

## Manuell Gepflegte Karten

Diese Karten bleiben wegen korrupter IUCN-Daten besonders zu schuetzen:

- `Blaukehlchen`
- `Fischertukan`
- `Grosstrappe`
- `Kernbeisser`
- `Reh`
- `Rotfuchs`
- `Waldkauz`

Fuer diese Arten muessen sowohl `Verbreitungskarten/<SafeName>.jpg` als auch
`species-assets/<SafeName>/map.jpg` vorhanden bleiben, bis der Legacy-Pfad bewusst entfernt wird.

## Test- Und Auditstand

Lokaler Check am 2026-06-16:

- `speciesAssetDirCount`: 45
- `speciesAssetMapCount`: 45
- `speciesAssetSoundCount`: 45
- `speciesAssetCreditsCount`: 45
- `speciesAssetSpectrogramCount`: 45
- `speciesAssetMissingCount`: 0

Gepruefte Befehle:

```bash
node --check species-core.js
node --check map-loader.js
node --check species-sound.js
node --check update.mjs
node --check scripts/generate-spectrograms.mjs
node --check scripts/monthly-site-audit.mjs
npm.cmd run --silent audit:site -- --skip-live --skip-pages
npm.cmd run --silent generate:spectrograms -- --dry-run --species=Amsel
```

Der Spektrogramm-Dry-Run fuer `Amsel` nutzt bereits:

- Eingabe: `species-assets/Amsel/sound.mp3`
- Ausgabe: `species-assets/Amsel/spectrogram.webp`

## Squarespace-Versionen

Nach GitHub-Pages-Deploy muessen diese Footer-Versionen gesetzt werden:

- `species-core.js?v=1.0.3`
- `map-loader.js?v=1.0.6`
- `species-sound.js?v=1.0.21`

## Naechste Schritte

1. GitHub Pages Deploy abwarten.
2. Squarespace-Footer auf die dokumentierten Versionen setzen.
3. Live-Test:
   - Heimische Artseite
   - Costa-Rica-Artseite
   - Island-Artseite
   - Karte vorhanden
   - Sound vorhanden
   - Spektrogramm vorhanden
   - Quelle/Lizenz klappt aus
4. Vollstaendigen Audit mit GitHub-Pages-Checks ausfuehren:

```bash
npm.cmd run --silent audit:site
```

5. Legacy-Entfernung erst spaeter separat entscheiden.
