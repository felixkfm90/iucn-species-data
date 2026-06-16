# Spectrogram Plan

Stand: 2026-06-15

Ziel: Phase 6.4 bewertet, wie Tierstimmen spaeter mit einer Merlin-aehnlicheren Frequenzdarstellung bzw. einem
Spektrogramm erweitert werden koennen, ohne die aktuell stabile Soundbar oder den Squarespace-Betrieb zu gefaehrden.
Es wurde noch kein Frontend- oder Pipeline-Code fuer Spektrogramme aktiviert; der Generator liegt als separates Skript
bereit.

## Kurzfazit

Spektrogramme sind technisch sinnvoll, sollten aber als vorberechnete Assets erzeugt werden. Eine vollstaendige
Spektrogramm-Berechnung im Browser ist fuer Squarespace und Mobilgeraete nicht die beste Loesung, weil dafuer MP3s
decodiert, FFT-Daten berechnet und Canvas-Grafiken erzeugt werden muessten. Das waere besonders bei grossen MP3s
unnoetig teuer.

Empfohlener Weg:

1. Aktuelle Soundbar bleibt unveraendert.
2. Das separate Generator-Skript `scripts/generate-spectrograms.mjs` erzeugt die Spektrogramm-Assets.
3. Spektrogramme als optionale Dateien unter `sounds/<SafeName>/spectrogram.webp` speichern.
4. `species-sound.js` minimal erweitern:
   - Spektrogramm laden, wenn vorhanden
   - sonst aktuelle Canvas-Wellenform beibehalten
   - roter Positionsmarker und Bedienlogik bleiben wie heute

## Aktueller Soundbestand

Lokaler Check am 2026-06-15:

- MP3-Dateien: 45
- Gesamtgroesse: ca. 147,55 MB
- Durchschnitt: ca. 3,28 MB
- kleinste MP3: ca. 0,03 MB
- groesste MP3: ca. 38,9 MB

Groesste Dateien:

| Art | Groesse |
|---|---:|
| Graugans | ca. 38,9 MB |
| Buntspecht | ca. 36,89 MB |
| Blaesshuhn | ca. 11,69 MB |
| Kleiber | ca. 10,72 MB |
| Kohlmeise | ca. 7,51 MB |

Diese Groessen sprechen gegen eine vollstaendige Browser-Berechnung bei jedem Seitenaufruf.

## Bewertete Varianten

| Variante | Beschreibung | Vorteile | Nachteile | Bewertung |
|---|---|---|---|---|
| Browser berechnet Spektrogramm live | `species-sound.js` laedt MP3, decodiert Audio, berechnet FFT und zeichnet Canvas. | Keine neuen Asset-Dateien. Immer synchron zur MP3. | Schwer auf Mobilgeraeten, grosse MP3s kosten Zeit/RAM, komplexere Fehlerfaelle, Squarespace-Seiten koennen traeger wirken. | Nicht empfohlen. |
| Vorberechnetes Bild pro Sound | Lokal oder Pipeline erzeugt `spectrogram.webp`; Browser zeigt Bild und Cursor. | Schnell, mobil stabil, einfache Fallbacks, gut cachebar ueber GitHub Pages. | Generator und neue Assets noetig; Repo waechst leicht. | Empfohlen. |
| Vorberechnete Frequenzdaten | Generator schreibt reduzierte Matrix als JSON/Binary; Browser rendert Canvas. | Flexibler als Bild, Design spaeter anpassbar. | Mehr Frontend-Code, groessere Komplexitaet als Bild, kein klarer Vorteil fuer aktuellen Bedarf. | Spaeter moeglich, aktuell nicht bevorzugt. |

## Empfohlene Asset-Struktur

Aktuelle Struktur beibehalten:

```text
sounds/
  Amsel/
    Amsel.mp3
    credits.json
    spectrogram.webp      # optional spaeter
```

Begruendung:

- Sound und Spektrogramm gehoeren fachlich zusammen.
- Der Pfad passt zur bestehenden `species-sound.js`-Logik.
- Keine Migration von Karten, Sounds oder Credits noetig.
- Falls spaeter `species-assets/<SafeName>/` eingefuehrt wird, kann `spectrogram.webp` mit migriert werden.

Nicht empfohlen:

- Spektrogramme in `graphics/` speichern. Dort liegen globale Icons, keine artspezifischen Soundassets.
- Spektrogramme sofort in eine neue Asset-Struktur verschieben. Das waere eine groessere Pfadmigration.

## Generierung

`ffmpeg` ist fuer den aktuellen Teststand projektlokal unter `local-tools/ffmpeg/bin/ffmpeg.exe` verfuegbar. Der
Ordner `local-tools/` ist ignoriert und wird nicht versioniert. Fuer spaetere Laeufe gibt es zwei saubere Optionen:

1. `ffmpeg` lokal installieren und ueber PATH nutzen.
2. Einen konfigurierbaren Pfad verwenden, z. B. `FFMPEG_PATH`, falls ein portables ffmpeg auf dem Rechner oder NAS
   liegt.

Generator-Skript:

```text
scripts/generate-spectrograms.mjs
```

Der Generator wurde am 2026-06-15 als Prototyp umgesetzt. Er erzeugt standardmaessig produktive Spektrogramme unter
`sounds/<SafeName>/spectrogram.webp`, sofern kein `--output-root` gesetzt wird. Fuer Tests wird deshalb bewusst
`--output-root=Testlauf/spectrograms` genutzt.

Installation von ffmpeg unter Windows:

```powershell
winget install "FFmpeg (Essentials Build)"
```

Danach ein neues Terminal oeffnen und pruefen:

```powershell
ffmpeg -version
```

Wichtig: `ffmpeg version` ist nicht dasselbe. Ohne Bindestrich interpretiert ffmpeg `version` als Ausgabedatei und
meldet danach einen Ausgabeformat-Fehler.

Nicht empfohlen ist eine Installation direkt nach `C:\Windows\System32`. Wenn ffmpeg dort manuell abgelegt wurde, nur
die FFmpeg-Dateien entfernen (`ffmpeg.exe`, `ffprobe.exe`, `ffplay.exe`) und danach einen normalen Tool-Pfad wie
`C:\Tools\ffmpeg\bin` verwenden.

Alternativ kann ein portables ffmpeg genutzt werden:

```powershell
$env:FFMPEG_PATH = "C:\Tools\ffmpeg\bin\ffmpeg.exe"
```

oder beim Aufruf:

```powershell
npm.cmd run --silent generate:spectrograms -- --ffmpeg=C:\Tools\ffmpeg\bin\ffmpeg.exe
```

Aktuelles Verhalten:

- scannt `sounds/<SafeName>/<SafeName>.mp3`
- erzeugt `sounds/<SafeName>/spectrogram.webp`
- ueberspringt vorhandene Spektrogramme, wenn sie neuer als die MP3 sind
- unterstuetzt `--force`
- unterstuetzt `--species=<SafeName>` fuer Einzeltests
- unterstuetzt `--dry-run`
- unterstuetzt `--output-root=Testlauf/spectrograms` fuer Testausgaben
- schreibt keine Dateien nach `Testlauf/`, ausser explizit per `--output-root`
- unterstuetzt `--format=webp` und `--format=png`
- unterstuetzt `--width`, `--height`, `--inner-height`, `--top-padding`, `--color`, `--scale`, `--gain`, `--stop`,
  `--drange`, `--contrast`, `--brightness` und `--quality`
- meldet Dateigroessen und Fehler je Art

Aktuelle Zielparameter fuer den Merlin-aehnlichen hellen Stil:

- Ausgabe: 1000 x 240 px
- innere Spektrogrammhoehe: 200 px
- oberer Rand: 20 px, unterer Rand ergibt sich automatisch
- Format: WebP, Qualitaet 90; ersatzweise PNG
- Frequenzbereich: bis 18 kHz (`--stop=18000`)
- Dynamik: `--drange=80`, `--gain=3`
- Nachbearbeitung: Graustufen, invertiert auf hellen Hintergrund, `contrast=1.25`, `brightness=0.08`
- Legende/Achsen nicht ins Bild rendern
- roter Positionsmarker wird spaeter im Frontend daruebergelegt

## Frontend-Integration spaeter

`species-sound.js` sollte minimal erweitert werden:

1. `spectrogramUrl = ${ASSET_BASE}/sounds/${encodedName}/spectrogram.webp`
2. per `HEAD` pruefen, ob die Datei existiert
3. wenn vorhanden:
   - Bild in `.sound-visual` anzeigen
   - Cursor und Scrubber bleiben unveraendert
   - keine MP3-Decodierung fuer Canvas-Wellenform noetig
4. wenn nicht vorhanden:
   - aktuelle Canvas-Wellenform verwenden
   - aktueller Fallback bleibt erhalten

Damit bleibt die Bedienung stabil und Seiten ohne Spektrogramm funktionieren weiter.

## Lizenz- und Rechtsnotiz

Ein Spektrogramm ist aus der jeweiligen Audioaufnahme abgeleitet. Fuer NC- oder anderweitig eingeschraenkte Sounds muss
das Spektrogramm intern genauso vorsichtig behandelt werden wie die Tonaufnahme selbst. Es soll kein sichtbarer
NC-Warnhinweis in der Soundbar erscheinen; die Nachvollziehbarkeit bleibt intern ueber `credits.json`,
`fehlende_elemente_report.json`, `docs/sound-license-review.md` und kuenftig den Audit erhalten.

## Speicher- und Performance-Einschaetzung

Grobe Erwartung:

- WebP-Spektrogramm pro Art: typischerweise ca. 30-150 KB, abhaengig von Motivlaenge, Kontrast und Kompression.
- Bei 45 Arten: grob ca. 1,5-7 MB zusaetzlich.
- Im Vergleich zu 147,55 MB vorhandenen MP3s ist das Repo-Wachstum wahrscheinlich vertretbar.
- Der Seitenaufruf wird stabiler als bei Live-Berechnung, weil ein Bild schneller angezeigt und gut gecacht werden
  kann.

## Testplan fuer spaetere Umsetzung

1. ffmpeg installieren oder `FFMPEG_PATH` setzen.
2. Generator zunaechst als Dry-Run pruefen:
   ```powershell
   npm.cmd run --silent generate:spectrograms -- --dry-run --species=Amsel,Graugans,Bisamratte --output-root=Testlauf/spectrograms
   ```
3. Generator nur fuer 3 Testarten laufen lassen:
   - `Amsel` als Standardfall
   - `Graugans` als sehr grosse MP3
   - `Bisamratte` als NC-Fall
   ```powershell
   npm.cmd run --silent generate:spectrograms -- --species=Amsel,Graugans,Bisamratte --output-root=Testlauf/spectrograms
   ```
4. Dateien und Groessen pruefen.
5. Erst nach Sichtpruefung produktiv nach `sounds/<SafeName>/` schreiben.
6. `species-sound.js` mit Fallback testen, sobald die Frontend-Integration gebaut wird:
   - Art mit Spektrogramm
   - Art ohne Spektrogramm
   - fehlende MP3
   - NC-Sound ohne sichtbaren Warnhinweis
7. Desktop und Mobile pruefen:
   - Layout passt in Container
   - roter Positionsmarker laeuft synchron
   - Scrubbing funktioniert
   - keine spuerbare Verzoegerung beim Seitenaufruf
8. Nach GitHub-Pages-Deploy Squarespace-`?v=` nur fuer `species-sound.js` erhoehen, falls Frontend-Code geaendert
   wurde.

## Entscheidung fuer Phase 6.4

Phase 6.4 ist als Konzept abgeschlossen; die produktive Umsetzung erfolgte danach in Phase 6.6:

- empfohlene Umsetzung: vorberechnete optionale `sounds/<SafeName>/spectrogram.webp`
- Generator-Prototyp: `scripts/generate-spectrograms.mjs`
- Testausgabe mit projektlokalem `ffmpeg` fuer `Amsel`, `Graugans` und `Bisamratte` erfolgreich erzeugt und nach
  Zielstil angepasst
- 45 produktive Spektrogramm-Assets erzeugt
- `species-sound.js` nutzt Spektrogramme optional mit Canvas-Fallback
- Aktuelle Squarespace-`?v=` fuer den Live-Betrieb nach kompakter Control-Zeile:
  `species-sound.js?v=1.0.19`

## Generator-Test 2026-06-15

ffmpeg wurde lokal unter `local-tools/ffmpeg/bin/ffmpeg.exe` verfuegbar gemacht. `local-tools/` ist bewusst ignoriert
und wird nicht versioniert.

Testbefehl:

```powershell
npm.cmd run --silent generate:spectrograms -- --ffmpeg=D:\IUCN_Datenbank\local-tools\ffmpeg\bin\ffmpeg.exe --species=Amsel,Graugans,Bisamratte --output-root=Testlauf/spectrograms
```

Ergebnis:

| Art | Ausgabe | Groesse | Status |
|---|---|---:|---|
| Amsel | `Testlauf/spectrograms/Amsel/spectrogram.webp` | 8.504 Bytes | erzeugt |
| Bisamratte | `Testlauf/spectrograms/Bisamratte/spectrogram.webp` | 15.150 Bytes | erzeugt |
| Graugans | `Testlauf/spectrograms/Graugans/spectrogram.webp` | 7.534 Bytes | erzeugt |

Sichtpruefung:

- Die Spektrogramme werden korrekt erzeugt und sind sehr klein.
- Zielstil ist eine helle Schwarz-Weiss-/Graustufen-Darstellung: heller Hintergrund, dunkle Frequenzspuren,
  sichtbarer Rand oben und unten.
- `drange=80`, `gain=3`, `stop=18000`, Graustufen-Invertierung und leichter Kontrast-/Helligkeitsabgleich sind
  aktuell der beste Default.
- `intensity`, `viridis` und `magma` wurden als Varianten getestet. Sie sind sichtbarer bzw. farbiger, aber fuer die
  Website voraussichtlich zu dominant.
- `color=gray` ist kein gueltiger ffmpeg-`showspectrumpic`-Wert.

Die Testparameter wurden produktiv uebernommen. Anschliessend wurden 45 produktive
`sounds/<SafeName>/spectrogram.webp`-Assets erzeugt und `species-sound.js` mit Spektrogramm-Anzeige plus
Canvas-Fallback erweitert.
