# Soundbar

Stand: 2026-06-15

Ziel von Phase 5.4 und Phase 6.7: Der Tierstimmen-Player soll sich wie eine ordentliche kompakte Soundbar anfuehlen:
klare Play-Bedienung, grafische Tonspur, stabile Wiedergabe, Lautstaerke- und Tempo-Regler, saubere aber nicht
aufdringliche Quellen-/Lizenzanzeige und brauchbare mobile Bedienung.

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
- Die aktive Soundbar nutzt ein natives `<audio>`-Element, eigene Controls und eine grafische Tonspur.
- Wenn `sounds/<SafeName>/spectrogram.webp` vorhanden ist, wird dieses vorberechnete Spektrogramm angezeigt.
- Wenn kein Spektrogramm vorhanden ist oder das Bild nicht geladen werden kann, faellt der Player auf die bisherige
  Canvas-Wellenform zurueck.
- Der Lautstaerkeregler arbeitet von 0 bis 200 Prozent. Werte bis 100 Prozent nutzen die normale Audio-Lautstaerke;
  Werte darueber werden per Web-Audio-Gain verstaerkt.
- Die Abspielgeschwindigkeit kann auf `0,25x`, `0,5x`, `1x`, `1,5x`, `2x` und `4x` gesetzt werden.
- Lautstaerke und Tempo werden lokal im Browser gespeichert, sofern `localStorage` verfuegbar ist.
- Die Canvas-Wellenform wird nur noch als Fallback aus der MP3 decodiert. Wenn Decoding im Browser scheitert, wird
  eine stabile Ersatzgrafik gezeichnet; die Wiedergabe bleibt davon unabhaengig.
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
- Lautstaerke und Tempo in einer kompakten zweiten Bedienzeile
- Quellenangaben eingeklappt unterhalb der Soundbar

## Spektrogramm-Ausbau

Eine Merlin-aehnlichere Darstellung ueber Frequenzinformationen bzw. ein Spektrogramm ist umgesetzt. Das Konzept und
die Generator-Parameter stehen in `docs/spectrogram-plan.md`.

Aktuelle Umsetzung:

1. Ein separates Generator-Skript erzeugt pro MP3 ein kleines Spektrogramm-Asset.
2. Zielpfad: `sounds/<SafeName>/spectrogram.webp`.
3. `species-sound.js` laedt die Grafik nur, wenn sie vorhanden ist.
4. Der Browser rendert dann nur noch Bild, Scrubber und Positionsmarker, statt auf jeder Seitenansicht teuer ein
   Spektrogramm zu berechnen.

Das ist stabiler fuer Squarespace und mobile Geraete als eine vollstaendige Spektrogramm-Berechnung bei jedem
Seitenaufruf.

Aktueller Stand:

- 45 produktive `spectrogram.webp`-Dateien erzeugt.
- Gesamtgroesse: ca. 1,22 MB.
- Zielstil: heller Hintergrund, dunkle Graustufen-Frequenzspuren, Rand oben/unten, Frequenzbereich bis 18 kHz.

## Squarespace-Anpassung

Nach dem GitHub-Pages-Deploy muss in Squarespace aktualisiert werden:

- Footer: `species-sound.js?v=1.0.14`
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
3. Spektrogramm, roter Positionsmarker, Zeit und Dauer werden angezeigt.
4. Lautstaerkeregler veraendert die Wiedergabe von 0 bis 200 Prozent.
5. Tempo-Auswahl schaltet zwischen `0,25x`, `0,5x`, `1x`, `1,5x`, `2x` und `4x`.
6. Kompakte Quelle ist sichtbar.
7. `Quelle und Lizenz` klappt Detailinformationen auf.
8. Originalquelle oeffnet in neuem Tab.

NC-Fall:

1. Artseite mit NC-Sound oeffnen, z. B. `Bisamratte`.
2. Kein sichtbarer NC-Warnhinweis wird angezeigt.
3. Quelle und Lizenz bleiben im eingeklappten Detailbereich nachvollziehbar.

Mobile:

1. Artseite auf schmalem Viewport oeffnen.
2. Play-Button bleibt gut antippbar.
3. Lautstaerke- und Tempo-Regler bleiben bedienbar.
4. Spektrogramm, Zeitangaben und eingeklappte Credits laufen nicht aus dem Container.
