# Soundbar

Stand: 2026-06-14

Ziel von Phase 5.4: Der Tierstimmen-Player soll sich wie eine ordentliche kompakte Soundbar anfuehlen: klare
Play-Bedienung, grafische Tonspur, stabile Wiedergabe, saubere aber nicht aufdringliche Quellen-/Lizenzanzeige und
brauchbare mobile Bedienung.

## Geaenderte Dateien

- `species-sound.js`
- `docs/squarespace-custom.css`
- `docs/squarespace-footer.html`

## Verhalten

- Das Modul startet nur, wenn `#species-sound` existiert.
- Sound und Credits werden weiter ueber GitHub Pages geladen:
  - `sounds/<SafeName>/<SafeName>.mp3`
  - `sounds/<SafeName>/credits.json`
- Vor dem Rendern wird die MP3 per `HEAD` geprueft.
- Die aktive Soundbar nutzt ein natives `<audio>`-Element, eigene Controls und eine Canvas-Wellenform.
- Die Wellenform wird aus der MP3 decodiert. Wenn Decoding im Browser scheitert, wird eine stabile Ersatzgrafik
  gezeichnet; die Wiedergabe bleibt davon unabhaengig.
- Die Soundbar injiziert ihre gekapselten CSS-Regeln selbst unter `#species-sound`. Dadurch haengt die Optik nicht mehr
  davon ab, ob Squarespace-CSS bereits aktualisiert wurde.
- Credits werden nur kompakt in einer Zeile gezeigt. Detailinformationen liegen in einem eingeklappten
  `Quelle und Lizenz`-Bereich.
- Non-Commercial-Lizenzen werden nicht mehr als sichtbarer Warnhinweis markiert. Der NC-Status bleibt intern ueber
  `credits.json`, `fehlende_elemente_report.json` und `docs/sound-license-review.md` nachvollziehbar.

## UI-Entscheidung

Die Soundbar orientiert sich an einer kompakten Bird-ID-/Merlin-artigen Bedienung, ohne das Layout extern zu kopieren:

- grafische Tonspur oben
- roter Positionsmarker wie bei typischen Bird-ID-Playern
- runder Play-Button links unten
- Titel/Quelle kompakt neben dem Button
- Zeit rechts unten
- Quellenangaben eingeklappt unterhalb der Soundbar

## Spaeterer Ausbau

Eine Merlin-aehnlichere Darstellung ueber Frequenzinformationen bzw. ein Spektrogramm ist programmiertechnisch
moeglich, soll aber nicht mehr Teil von Phase 5.4 sein. Der Punkt liegt in Roadmap 5.9.

Bevorzugte spaetere Umsetzung:

1. `update.mjs` erzeugt pro MP3 ein kleines Spektrogramm-Asset oder reduzierte Frequenzdaten.
2. `species-sound.js` laedt diese vorbereiteten Daten bzw. die Grafik.
3. Der Browser rendert nur noch Anzeige und Positionsmarker, statt auf jeder Seitenansicht teuer zu decodieren.

Das ist stabiler fuer Squarespace und mobile Geraete als eine vollstaendige Spektrogramm-Berechnung bei jedem
Seitenaufruf.

## Squarespace-Anpassung

Nach dem GitHub-Pages-Deploy muss in Squarespace aktualisiert werden:

- Footer: `species-sound.js?v=1.0.12`
- Custom CSS: kein zwingender neuer Soundbar-Block; die Komponente injiziert ihre eigene gekapselte Optik.
- Alte Soundbar-/WaveSurfer-CSS-Regeln in Squarespace koennen spaeter aufgeraeumt werden, solange `.frame-box`
  erhalten bleibt.
- Der alte externe WaveSurfer-Eintrag kann aus dem Footer entfernt werden:
  `<script src="https://unpkg.com/wavesurfer.js@7"></script>`

Ohne CSS-Update soll der Player technisch und optisch weiter funktionieren, weil die noetigen Regeln aus
`species-sound.js` kommen.

## Testplan

Desktop:

1. Artseite mit freiem Sound oeffnen, z. B. `Amsel`.
2. Play-Button startet und pausiert die Wiedergabe.
3. Canvas-Wellenform, roter Positionsmarker, Zeit und Dauer werden angezeigt.
4. Kompakte Quelle ist sichtbar.
5. `Quelle und Lizenz` klappt Detailinformationen auf.
6. Originalquelle oeffnet in neuem Tab.

NC-Fall:

1. Artseite mit NC-Sound oeffnen, z. B. `Bisamratte`.
2. Kein sichtbarer NC-Warnhinweis wird angezeigt.
3. Quelle und Lizenz bleiben im eingeklappten Detailbereich nachvollziehbar.

Mobile:

1. Artseite auf schmalem Viewport oeffnen.
2. Play-Button bleibt gut antippbar.
3. Wellenform, Zeitangaben und eingeklappte Credits laufen nicht aus dem Container.
