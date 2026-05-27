# CSS Layout Audit

Stand: 2026-05-27

Quelle:

- aktuelles Squarespace Custom CSS in `docs/squarespace-custom.css`
- Live-Pruefung auf `https://www.fnwildlifetravel.de`
- Detailseite: `/wildlife/heimische-tierwelt/acanthisflammea`
- Uebersichtsseite: `/wildlife/island`
- Startseite: `/`

## Kurzfazit

Nach Phase 5.4 wurde der Soundbar-Block gezielt nachgeschärft. Die Soundbar injiziert ihre gekapselten Modulstyles jetzt
selbst unter `#species-sound`, damit die Canvas-Wellenform und die Play-Bedienung nicht vom aktuellen Squarespace-CSS
abhaengen. Das restliche Squarespace-CSS funktioniert mit der bestehenden Artseitenstruktur auf Desktop und Mobile.

## Gepruefte Risikoselektoren

| Selektor | Befund | Risiko | Empfehlung |
|---|---|---|---|
| `.frame-box` | Live nur in den erwarteten Artseiten-Modulen gefunden. | Mittel, weil globaler Klassenselektor. | Beibehalten, solange keine fremden Squarespace-Elemente `.frame-box` nutzen. |
| `.info-box` | Live nur in `#species-status` gefunden. | Mittel, weil globaler Klassenselektor. | Beibehalten; bei Konflikt spaeter auf `#species-status .info-box` scopen. |
| `#species-sound .species-sound-frame` | Einzige noetige Custom-CSS-Ergaenzung fuer den Sound-Rahmen. | Niedrig. | Beibehalten. Die eigentliche Player-Optik kommt aus `species-sound.js`. |
| `#play-toggle` | Passt zur aktuellen Ausgabe von `species-sound.js`; Modulstyle ueberschreibt alte globale Button-Regeln. | Niedrig. | Beibehalten; echter Button mit CSS-Icon statt Textsymbol. |
| `.sound-player`, `.sound-wave-canvas`, `.sound-cursor`, `.sound-scrubber` | Canvas-Wellenform und Scrubbing ohne externe Waveform-Bibliothek. | Niedrig. | Werden durch `species-sound.js` unter `#species-sound` gekapselt injiziert. |
| `.sound-details`, `.sound-warning` | Eingeklappte Credits und sichtbarer NC-Hinweis. | Niedrig. | Beibehalten; reduziert sichtbare Informationsmenge, Lizenzdaten bleiben erreichbar. |
| `#gz-overlay`, `#gz-img`, `#gz-close`, `.gz-zoom-btn` | Werden durch `lightbox-zoom.js` global angelegt, sind aber ohne offene Lightbox unsichtbar. | Niedrig bis Mittel. | Beibehalten; nur bei Konflikt mit anderen Lightboxen scopen/anpassen. |

## Layout-Pruefung

Desktop bei 1280 x 720:

- `#species-output` nutzt Flex-Row.
- Info, Taxonomie und Status liegen im Viewport.
- Taxonomie-Stufen haben keinen horizontalen Textueberlauf.
- Status-/Trend-Boxen haben keinen Textueberlauf.
- Soundbox und Canvas-Wellenform passen in die Breite.
- Kartenbild laedt lazy; nach Scroll ist die Karte korrekt geladen.

Mobile bei 390 x 844:

- `#species-output` nutzt Flex-Column.
- Info, Taxonomie und Status stapeln sauber.
- Keine horizontale Dokumentbreite ueber dem Viewport.
- Status-/Trend-Boxen stapeln sauber.
- Soundbox und Canvas-Wellenform bleiben im Viewport.
- Lightbox-Smoke-Test mit gueltigem `itemId`: Button sichtbar, Overlay oeffnet, Bild laedt, `gz-noscroll` aktiv.

## Beobachtungspunkte

1. Falls spaeter andere Squarespace-Bereiche Klassen wie `.frame-box` oder `.info-box` verwenden, sollten die Regeln
   gezielt auf die Wildlife-Module gescoped werden.
2. Die Kartenpruefung muss wegen `loading="lazy"` nach Scroll zum Kartenbereich erfolgen.
3. Eine echte Android-Pinch-Geste kann mit dem Browser-Tool nicht vollstaendig simuliert werden; der mobile Smoke-Test
   prueft Button, Overlay, Bildladung und No-Scroll-Zustand.
4. CSS-Aufraeumen sollte weiterhin nur mit sichtbarem Anlass passieren, nicht als vorsorglicher Umbau.
