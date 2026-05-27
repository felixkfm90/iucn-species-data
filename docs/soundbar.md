# Soundbar

Stand: 2026-05-27

Ziel von Phase 5.4: Der Tierstimmen-Player soll sich wie eine ordentliche kompakte Soundbar anfuehlen: klarer
Play-Button, gut lesbare Waveform, stabile Fallbacks, saubere Quellen-/Lizenzanzeige und brauchbare mobile Bedienung.

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
- Wenn WaveSurfer nicht geladen werden kann oder die Waveform fehlschlaegt, wird ein nativer `<audio controls>`-Player
  als Fallback angezeigt.
- Credits werden als strukturierte Zeilen gerendert: Quelle, Aufnahme, Ort, Qualitaet, Lizenz und Originalquelle.
- Non-Commercial-Lizenzen werden sichtbar markiert.

## UI-Entscheidung

Die Soundbar orientiert sich an einer kompakten Bird-ID-/Merlin-artigen Bedienung, ohne das Layout extern zu kopieren:

- grosser runder Play-Button links
- Waveform als Hauptbedienelement
- Zeitangabe unter der Waveform
- Lizenz-Badge rechts im Kopfbereich
- Quellenangaben unterhalb der Soundbar

## Squarespace-Anpassung

Nach dem GitHub-Pages-Deploy muss in Squarespace aktualisiert werden:

- Footer: `species-sound.js?v=1.0.8`
- Custom CSS: Soundbar-Block aus `docs/squarespace-custom.css`

Ohne CSS-Update funktioniert der Player technisch weiter, sieht aber nicht wie der neue Soll-Stand aus.

## Testplan

Desktop:

1. Artseite mit freiem Sound oeffnen, z. B. `Amsel`.
2. Play-Button startet und pausiert die Wiedergabe.
3. Waveform laedt, Zeit und Dauer werden angezeigt.
4. Lizenz-Badge und Credits sind sichtbar.
5. Originalquelle oeffnet in neuem Tab.

NC-Fall:

1. Artseite mit NC-Sound oeffnen, z. B. `Bisamratte`.
2. Lizenz-Badge und NC-Hinweis sind sichtbar.

Mobile:

1. Artseite auf schmalem Viewport oeffnen.
2. Play-Button bleibt gut antippbar.
3. Waveform, Zeitangaben und Credits laufen nicht aus dem Container.

Fallback:

1. WaveSurfer blockieren oder testweise nicht laden.
2. Native Audio-Steuerung erscheint statt leerer Soundbox.
