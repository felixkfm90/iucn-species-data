# CSS Layout Audit

Stand: 2026-07-19

Quelle:

- aktuelles Squarespace Custom CSS in `docs/squarespace-custom.css`
- Live-Pruefung auf `https://www.fnwildlifetravel.de`
- Detailseite: `/wildlife/heimische-tierwelt/acanthisflammea`
- Uebersichtsseite: `/wildlife/island`
- Startseite: `/`

## Verbindliche Squarespace-Uebernahme

`docs/squarespace-custom.css` ist eine vollstaendige Referenz und kein Zusatzfragment. Der alte Squarespace-Stand
vom 2026-05-27 enthaelt unter anderem ein Flex-Layout fuer `#species-output` und fruehe Taxonomie-Regeln. Er darf
nicht parallel zum aktuellen Grid-/Taxonomie-Stand aktiv bleiben. Beim naechsten Abgleich wird deshalb der gesamte
Inhalt unter Squarespace Custom CSS durch `docs/squarespace-custom.css` ersetzt. Der Footer bleibt davon getrennt
und wird ausschliesslich aus `docs/squarespace-footer.html` uebernommen.

## Kurzfazit

Nach Phase 5.4 wurde der Soundbar-Block gezielt nachgeschaerft. Die Soundbar injiziert ihre gekapselten Modulstyles
selbst unter `#species-sound`, damit Spektrogramm, Canvas-Fallback, Play-Bedienung, Lautstaerke und Tempo nicht vom aktuellen
Squarespace-CSS abhaengen. Am 2026-06-14 wurde ein Mobile-only-Override fuer Squarespace-Grid-Galerien ergaenzt:
Galerien mit mehr als einer Spalte werden unter 768 px auf eine Spalte gesetzt. Desktop bleibt unveraendert.

## Gepruefte Risikoselektoren

| Selektor | Befund | Risiko | Empfehlung |
|---|---|---|---|
| `.frame-box` | Live nur in den erwarteten Artseiten-Modulen gefunden. | Mittel, weil globaler Klassenselektor. | Beibehalten, solange keine fremden Squarespace-Elemente `.frame-box` nutzen. |
| `.info-box` | Live nur in `#species-status` gefunden. | Mittel, weil globaler Klassenselektor. | Beibehalten; bei Konflikt spaeter auf `#species-status .info-box` scopen. |
| `#species-sound .species-sound-frame` | Einzige noetige Custom-CSS-Ergaenzung fuer den Sound-Rahmen. | Niedrig. | Beibehalten. Die eigentliche Player-Optik kommt aus `species-sound.js`. |
| `#play-toggle` | Passt zur aktuellen Ausgabe von `species-sound.js`; Modulstyle ueberschreibt alte globale Button-Regeln. | Niedrig. | Beibehalten; echter Button mit CSS-Icon statt Textsymbol. |
| `.sound-player`, `.sound-spectrogram-image`, `.sound-wave-canvas`, `.sound-cursor`, `.sound-scrubber`, `.sound-controls`, `.sound-volume-control`, `.sound-speed-control` | Spektrogramm-Anzeige, Canvas-Fallback, Scrubbing, Lautstaerke, Zeit und Tempo in kompakter Control-Zeile ohne externe Waveform-Bibliothek. | Niedrig. | Werden durch `species-sound.js` unter `#species-sound` gekapselt injiziert. |
| `.sound-details` | Eingeklappte Credits mit Quelle und Lizenz. | Niedrig. | Beibehalten; Lizenzdaten bleiben erreichbar. Ein separater sichtbarer NC-Warnhinweis wird nicht mehr ausgegeben. |
| `#gz-overlay`, `#gz-img`, `#gz-close`, `.gz-zoom-btn` | Werden durch `lightbox-zoom.js` global angelegt, sind aber ohne offene Lightbox unsichtbar. | Niedrig bis Mittel. | Beibehalten; nur bei Konflikt mit anderen Lightboxen scopen/anpassen. |
| `.gallery-grid[data-test="gallery-grid-simple"][data-columns]:not([data-columns="1"])` | Mobile-only-Override fuer Squarespace-Galerien, die auf mehr als eine Spalte eingestellt sind. | Niedrig bis Mittel, weil Squarespace-Galerieklassen global sind. | Beibehalten, wenn Reisegalerien mobil sauber einspaltig bleiben; bei Konflikt spaeter auf einzelne Collections scopen. |

## Layout-Pruefung

Desktop bei 1280 x 720:

- `#species-output` nutzt Flex-Row.
- Info, Taxonomie und Status liegen im Viewport.
- Taxonomie-Stufen haben keinen horizontalen Textueberlauf.
- Status-/Trend-Boxen haben keinen Textueberlauf.
- Soundbox, Spektrogramm, Canvas-Fallback, Lautstaerke und Tempo passen in die Breite.
- Kartenbild laedt lazy; nach Scroll ist die Karte korrekt geladen.

Mobile bei 390 x 844:

- `#species-output` nutzt Flex-Column.
- Info, Taxonomie und Status stapeln sauber.
- Keine horizontale Dokumentbreite ueber dem Viewport.
- Status-/Trend-Boxen stapeln sauber.
- Soundbox, Spektrogramm, Canvas-Fallback, Lautstaerke und Tempo bleiben im Viewport.
- Lightbox-Smoke-Test mit gueltigem `itemId`: Button sichtbar, Overlay oeffnet, Bild laedt, `gz-noscroll` aktiv.
- Reisegalerien mit `data-columns` groesser 1 werden per Custom CSS mobil auf eine Spalte gesetzt. Live-CSS
  `custom.css` Version 38 enthaelt die Regel; geprueft an `/reisen/2024-costarica/bocatapada`.

## Beobachtungspunkte

1. Falls spaeter andere Squarespace-Bereiche Klassen wie `.frame-box` oder `.info-box` verwenden, sollten die Regeln
   gezielt auf die Wildlife-Module gescoped werden.
2. Die Kartenpruefung muss wegen `loading="lazy"` nach Scroll zum Kartenbereich erfolgen.
3. Eine echte Android-Pinch-Geste kann mit dem Browser-Tool nicht vollstaendig simuliert werden; der mobile Smoke-Test
   prueft Button, Overlay, Bildladung und No-Scroll-Zustand.
4. CSS-Aufraeumen sollte weiterhin nur mit sichtbarem Anlass passieren, nicht als vorsorglicher Umbau.
