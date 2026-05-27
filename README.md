# IUCN Species Data

Dieses Repository erzeugt und hostet Arten-Daten, Karten, Sounds und Frontend-Module fuer die Squarespace-Website
`https://www.fnwildlifetravel.de`.

GitHub Pages Base:
`https://felixkfm90.github.io/iucn-species-data/`

## Datenfluss

`species_list.json` ist die manuelle Eingabeliste. `update.mjs` nutzt daraus die Artennamen und erzeugt bzw.
aktualisiert:

- `speciesData.json`
- `Verbreitungskarten/*.jpg`
- `sounds/<Artname>/<Artname>.mp3`
- `sounds/<Artname>/credits.json`
- `fehlende_elemente_report.json`
- `lastSavedAssessmentId.json`

Squarespace enthaelt auf den Artseiten nur Container. Die Inhalte werden im Browser aus GitHub Pages geladen.

## Wichtige Dateien

- `AGENTS.md`: aktuelle Projektuebergabe und verbindliche Arbeitsregeln
- `species-core.js`: gemeinsamer Datenloader, Slug-Ermittlung, Cache und Assetnamen-Sanitizer
- `species-info.js`: Info-Box fuer Name, Groesse, Gewicht, Generationsdauer und Population
- `species-taxonomy.js`: Taxonomie-Pyramide
- `species-status.js`: IUCN-Status und Populationstrend
- `species-sound.js`: Tierstimmen-Player mit WaveSurfer
- `map-loader.js`: Verbreitungskarte
- `search.js`: Suche auf Uebersichtsseiten
- `sort.js`: Sortierung der sichtbaren Listen
- `lightbox-zoom.js`: Galerie-/Lightbox-Zoom

## Squarespace-Integration

Versionierte Referenzen liegen unter:

- `docs/squarespace-footer.html`
- `docs/squarespace-custom.css`
- `docs/soundbar.md`
- `docs/sound-license-review.md`
- `docs/css-layout-audit.md`
- `docs/repo-file-audit.md`
- `docs/repo-structure.md`
- `docs/roadmap.md`

Dokumentation ist Teil der Definition of Done: Ein Roadmap-Schritt gilt erst als abgeschlossen, wenn `AGENTS.md`,
`README.md`, `docs/roadmap.md` und betroffene Detaildokumente aktuell sind.

Bei jeder Aenderung an einer eingebundenen JavaScript-Datei muss in Squarespace die jeweilige `?v=`-Version erhoeht
werden, damit Browser- und GitHub-Pages-Caches sicher umgangen werden.

Artseiten brauchen diese Container:

```html
<div id="species-output">
  <div id="species-info"></div>
  <div id="species-taxonomy"></div>
  <div id="species-status"></div>
</div>

<div id="species-sound"></div>

<div id="map-wrapper" class="frame-box">
  <div id="map-output"></div>
</div>
```

Uebersichtsseiten brauchen fuer die Suche:

```html
<div id="species-search"></div>
```

## Lokaler Update-Prozess

Voraussetzungen:

- Node.js
- `npm install`
- Environment Variable `IUCN_TOKEN`
- Environment Variable `XENO_TOKEN`

Ausfuehren:

```bash
node update.mjs
```

Der Sound-Teil der Pipeline bevorzugt freie Xeno-Canto-Aufnahmen. Wenn fuer einen vorhandenen NC-Sound keine freie
Xeno-Canto-Alternative gefunden wird, sucht `update.mjs` zusaetzlich nach exakt zugeordneten freien
Wikimedia-Commons-Audiodateien mit erreichbarem MP3-Transcode und danach nach freien iNaturalist-MP3-Aufnahmen.
iNaturalist-Treffer werden nur uebernommen, wenn Taxon, Lizenz und MP3-Datei passen. Erst danach bleibt ein vorhandener
NC-Sound erhalten oder wird bei neuen Arten als Fallback genutzt.

Tokens duerfen nicht im Repository gespeichert werden.

Lokale Batch-Dateien:

- `update_local.bat`: startet den Suchlauf und ruft danach den GitHub-Push-Workflow auf
- `update_github_only.bat`: pusht aktuelle Projektdateien ohne Token in der Remote-URL

Diese Batch-Dateien sind lokal ignoriert und nicht Teil des GitHub-Pages-Deployments.

## Aktueller Datenstand

Laut aktuellem Report:

- 45 Arten
- 0 fehlende Sounddateien
- 0 fehlende Sound-Credits
- 0 fehlende Karten
- 3 aktive NC-Soundlizenzen: `Bisamratte`, `Brauenmotmot`, `Geoffroy-Klammeraffe`

## Tests nach Frontend-Aenderungen

- Detailseite, z. B. `/wildlife/heimische-tierwelt/acanthisflammea`
- Uebersichtssuche:
  - `/wildlife/heimische-tierwelt`
  - `/wildlife/costarica`
  - `/wildlife/island`
- Lightbox-Zoom auf Desktop und Android Chrome
- GitHub Pages pruefen, bevor Squarespace `?v=` erhoeht wird
