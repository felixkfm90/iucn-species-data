# Soundbar

Stand: 2026-05-27

Ziel von Phase 5.4: Der Tierstimmen-Player soll sich wie eine ordentliche kompakte Soundbar anfuehlen: klarer
Play-Button, robuste Fortschrittsleiste, stabile Wiedergabe, saubere Quellen-/Lizenzanzeige und brauchbare mobile
Bedienung.

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
- Die aktive Soundbar nutzt ein natives `<audio>`-Element und eigene Controls. Es gibt keine WaveSurfer-Abhaengigkeit
  mehr fuer die Grundfunktion.
- Credits werden als strukturierte Zeilen gerendert: Quelle, Aufnahme, Ort, Qualitaet, Lizenz und Originalquelle.
- Non-Commercial-Lizenzen werden sichtbar markiert.

## UI-Entscheidung

Die Soundbar orientiert sich an einer kompakten Bird-ID-/Merlin-artigen Bedienung, ohne das Layout extern zu kopieren:

- grosser runder Play-Button links
- Fortschrittsleiste als Hauptbedienelement
- Zeitangabe unter der Leiste
- Lizenz-Badge rechts im Kopfbereich
- Quellenangaben unterhalb der Soundbar

## Squarespace-Anpassung

Nach dem GitHub-Pages-Deploy muss in Squarespace aktualisiert werden:

- Footer: `species-sound.js?v=1.0.9`
- Custom CSS: Soundbar-Block aus `docs/squarespace-custom.css`
- Der alte externe WaveSurfer-Eintrag kann aus dem Footer entfernt werden:
  `<script src="https://unpkg.com/wavesurfer.js@7"></script>`

Ohne CSS-Update funktioniert der Player technisch weiter, sieht aber nicht wie der neue Soll-Stand aus.

## Testplan

Desktop:

1. Artseite mit freiem Sound oeffnen, z. B. `Amsel`.
2. Play-Button startet und pausiert die Wiedergabe.
3. Fortschrittsleiste, Zeit und Dauer werden angezeigt.
4. Lizenz-Badge und Credits sind sichtbar.
5. Originalquelle oeffnet in neuem Tab.

NC-Fall:

1. Artseite mit NC-Sound oeffnen, z. B. `Bisamratte`.
2. Lizenz-Badge und NC-Hinweis sind sichtbar.

Mobile:

1. Artseite auf schmalem Viewport oeffnen.
2. Play-Button bleibt gut antippbar.
3. Fortschrittsleiste, Zeitangaben und Credits laufen nicht aus dem Container.
