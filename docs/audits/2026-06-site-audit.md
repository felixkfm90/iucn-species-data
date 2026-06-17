# Monatsaudit 2026-06

Stand: 2026-06-17

## Kurzfazit

- Gesamtzustand: stabil. Sitemap, Live-Seiten, SEO-Grundfelder, GitHub-Pages-Daten und Kernassets passen im aktuellen
  Audit.
- Kritische offene Punkte: keine neu gefundenen kritischen Fehler.
- Bewusst akzeptiert/geparkt: `Kohlmeise` bleibt bewusst geparkt; technische Dateinamen-`alt`-Attribute auf Artseiten
  und bewusste Reiseseiten-Galerietexte bleiben fuer den aktuellen Stand akzeptiert.
- Nicht erneut manuell geprueft, weil unveraendert: Mobile Lightbox, Artseiten-Module im Browser, Suche/Sortierung und
  rechtliche Texte wurden nicht erneut manuell getestet, weil seit den letzten passenden Checks keine betroffenen
  JS-/CSS-/Squarespace-Strukturen geaendert wurden.

## Gepruefte Quellen

| Bereich | Quelle | Ergebnis |
|---|---|---|
| Live-Sitemap | `https://www.fnwildlifetravel.de/sitemap.xml` | 200, 117 URLs |
| Live-Seiten | alle 117 Sitemap-URLs | 117 erreichbar, 0 Fetch-Fehler, 0 Non-200 |
| SEO-Grundfelder | Titel und Meta-Description je Sitemap-URL | 0 fehlende Titel, 0 fehlende Meta-Beschreibungen |
| Interne Links | HTML-Crawl der 117 Sitemap-URLs | nur bekannte System-/Ordnerpfade ausserhalb der Sitemap |
| GitHub Pages | `speciesData.json`, `fehlende_elemente_report.json`, JS- und Asset-Stichproben | erreichbar, 45 Arten, Report konsistent |
| Lokale Assets | `speciesData.json` gegen Karten, Sounds, Credits und Spektrogramme | 45/45 konsistent, keine fehlenden Kernassets |
| Manuell gepflegte Karten | Rueckmeldung von Felix am 2026-06-15 | 7 Karten dokumentiert |
| Soundlizenzen | `fehlende_elemente_report.json` und `species-assets/*/credits.json` | 3 aktive NC-Lizenzen, unveraendert bekannt |

## Offen

- 3 aktive NC-Soundlizenzen bleiben bekannt:
  - `Bisamratte`
  - `Brauenmotmot`
  - `Geoffroy-Klammeraffe`
- Keine kritischen offenen Punkte zur Asset-Struktur. Die alte Struktur wurde nach erfolgreichem Live-Test entfernt.

## Erledigt/geprueft

- Sitemap live geladen:
  - Status: 200
  - URLs: 117
- Alle 117 Sitemap-URLs live abgerufen:
  - 117 erfolgreich
  - 0 Fetch-Fehler
  - 0 Non-200-Antworten
- SEO-Grundfelder live geprueft:
  - 0 fehlende `<title>`-Werte
  - 0 fehlende Meta-Descriptions
- Interne Links ausserhalb der Sitemap separat geprueft:
  - `/` liefert 200
  - `/cart` liefert 200 und ist Squarespace-Systempfad
  - `/reisen-1` liefert 200 und endet auf `/reisen/uebersicht`
  - `/wildlife` liefert 200 und endet auf `/wildlife/uebersicht`
  - `/universal/svg/social-accounts.svg` liefert 200 und ist ein Squarespace-SVG-Systemasset
- GitHub Pages live geprueft:
  - `speciesData.json`: 45 Arten
  - `fehlende_elemente_report.json`: Report vom `2026-06-17T16:07:45.206Z`
  - Stichproben erreichbar: `species-core.js`, `species-info.js`, `species-sound.js`, `map-loader.js`, `search.js`,
    `lightbox-zoom.js`, `species-assets/Amsel/map.jpg`, `species-assets/Amsel/sound.mp3`,
    `species-assets/Amsel/credits.json`, `species-assets/Amsel/spectrogram.webp`
- Lokaler Assetabgleich:
  - `speciesData.json`: 45 Arten
  - `species_list.json`: 45 Arten
  - Karten: 45 JPG-Dateien
  - Soundordner: 45
  - MP3-Dateien: 45
  - Credits-Dateien: 45
  - Spektrogramm-Dateien: 45 WebP-Dateien, ca. 1,22 MB
  - per-Art-Abgleich: 0 Inkonsistenzen
- Reportwerte:
  - fehlende MP3s: 0
  - fehlende Credits: 0
  - fehlende Karten: 0
  - fehlende Assessment-IDs: 0
  - fehlender Status: 0
  - fehlende Kategorie: 0
  - fehlender Trend: 0
  - aktive NC-Soundlizenzen: 3
- Manuell gepflegte Karten nach Felix' Rueckmeldung vom 2026-06-15 dokumentiert:
  - `Blaukehlchen`
  - `Fischertukan`
  - `Grosstrappe`
  - `Kernbeisser`
  - `Reh`
  - `Rotfuchs`
  - `Waldkauz`
- Audit-Automatisierung am 2026-06-15 eingerichtet und getestet:
  - Befehl: `npm.cmd run --silent audit:site`
  - Skript: `scripts/monthly-site-audit.mjs`
  - Ergebnis im Volltest: 117 Sitemap-URLs, 0 Fetch-Fehler, 0 Non-200, 0 fehlende SEO-Grundfelder,
    0 lokale Asset-Inkonsistenzen, 7 manuelle Karten dokumentiert, 3 NC-Sounds erkannt.
  - Nach Spektrogramm-Erweiterung prueft der lokale Audit zusaetzlich Spektrogramme und fehlende Assets unter
    `species-assets/<SafeName>/`.
- Spektrogramm-Konzept am 2026-06-15 dokumentiert:
  - Datei: `docs/spectrogram-plan.md`
  - Zielpfad seit Asset-Migration: `species-assets/<SafeName>/spectrogram.webp`
- Spektrogramm-Generator-Prototyp am 2026-06-15 umgesetzt:
  - Skript: `scripts/generate-spectrograms.mjs`
  - Befehl: `npm.cmd run --silent generate:spectrograms`
  - Dry-Run: 45 MP3s erkannt, 45 Spektrogramme geplant, 0 fehlende MP3s
  - echte Testausgabe mit projektlokalem `ffmpeg` fuer `Amsel`, `Graugans` und `Bisamratte` erfolgreich erzeugt
  - bevorzugter Zielstil im Generator-Default abgebildet: heller Hintergrund, dunkle Graustufen-Frequenzspuren,
    Rand oben und unten, Frequenzbereich bis 18 kHz
- Spektrogramm-Assets und Soundbar-Integration am 2026-06-15 umgesetzt:
  - 45 produktive Spektrogramm-Dateien; seit Asset-Migration primaer unter
    `species-assets/<SafeName>/spectrogram.webp`
  - Gesamtgroesse ca. 1,22 MB
  - Generator-Default nach Sichtpruefung auf `stop=18000`, `drange=80`, `gain=3` angepasst, damit leisere und
    hochfrequentere Arten nicht zu leer wirken
  - `species-sound.js` nutzt Spektrogramme optional und behaelt Canvas-Wellenform als Fallback
- Soundbar-Regler am 2026-06-15 umgesetzt:
  - Lautstaerke 0 bis 200 Prozent, ueber 100 Prozent per Web-Audio-Gain
  - Tempo-Auswahl `0,25x`, `0,5x`, `1x`, `1,5x`, `2x`, `4x`
  - Nachfix: Web Audio wird seit `species-sound.js?v=1.0.15` nur noch fuer Lautstaerke ueber 100 Prozent aktiviert,
    damit die normale Wiedergabe nicht stummgeschaltet wird.
  - Nachfix: Der Positionsmarker wird waehrend der Wiedergabe per `requestAnimationFrame` geglaettet.
  - Mute-Toggle seit `species-sound.js?v=1.0.16`: Lautsprechersymbol setzt temporaer auf `0%`, wird rot
    durchgestrichen und stellt beim zweiten Klick den vorherigen Wert wieder her.
  - Playbutton-Zentrierung seit `species-sound.js?v=1.0.17`: Play-/Pause-Symbol im runden Button ohne
    Browser-Default-Padding vertikal zentriert; ganzer Button optisch leicht nach unten versetzt.
  - Playbutton-Position und reduzierte Quellenanzeige seit `species-sound.js?v=1.0.18`: Button deutlicher in der
    Mitte der unteren Bedienflaeche, keine zusaetzliche Quellenzeile unter `Tierstimme`.
  - Kompakte Control-Zeile seit `species-sound.js?v=1.0.20`: `Tierstimme` oberhalb des Spektrogramms, darunter
    Playbutton, Lautstaerke, Zeit und Tempo in einer gemeinsamen Control-Zeile.
  - damalige dokumentierte Footer-Version: `species-sound.js?v=1.0.20`
- Asset-Migration am 2026-06-16 umgesetzt:
  - primaere Struktur: `species-assets/<SafeName>/map.jpg`, `sound.mp3`, `credits.json`, `spectrogram.webp`
  - lokaler Audit: 45 Artordner, 45 Karten, 45 Sounds, 45 Credits, 45 Spektrogramme, 0 fehlende neue Artassets
  - damalige dokumentierte Footer-Versionen wurden am 2026-06-17 durch die bereinigte Assetstruktur abgeloest.
- Asset-Struktur am 2026-06-17 final bereinigt:
  - alte Ordner `Verbreitungskarten/` und `sounds/` entfernt
  - Pipeline, Frontend-Loader, Spektrogramm-Generator und Audit pruefen nur noch `species-assets/`
  - dokumentierte Footer-Versionen fuer den Live-Betrieb nach Deploy:
    `species-core.js?v=1.0.4`, `map-loader.js?v=1.0.7`, `species-sound.js?v=1.0.22`

## Nicht erneut manuell geprueft, unveraendert

- Mobile Lightbox / Pinch-Zoom: kein erneuter manueller Android-Test, weil `lightbox-zoom.js` und relevantes CSS seit
  dem letzten passenden Check nicht geaendert wurden.
- Artseiten-Module im Browser: keine erneute visuelle Vollpruefung, weil `species-info.js`, `species-taxonomy.js`,
  `species-status.js`, `species-sound.js`, `map-loader.js` und die Containerstruktur seit den letzten Checks nicht
  geaendert wurden.
- Suche und Sortierung: keine erneute manuelle Bedienpruefung, weil `search.js`, `sort.js` und die dokumentierten
  Uebersichtsseiten unveraendert sind.
- Rechtliche Texte, Cookie-Banner und externe Dienste: keine erneute juristische Detailpruefung, weil keine neuen
  Tracking-, Shop-, Zahlungs-, Affiliate- oder externen Medienfunktionen aktiviert wurden.

## Noch nicht geprueft

- Kein echter Mobile-Browser-Test im Rahmen dieses Audits.
- Kein visueller Browser-Screenshot-Test einzelner Artseiten im Rahmen dieses Audits.
- Kein neuer kompletter Pipeline-Lauf, weil der Audit keine Datenaktualisierung ausloesen sollte.

## Bewusst akzeptiert/geparkt

- `Kohlmeise` (`/wildlife/heimische-tierwelt/parusmajor`) bleibt bewusst geparkt und ist nicht als aktiver SEO-Fehler
  zu behandeln.
- Technische Dateinamen-`alt`-Attribute auf Artseiten sind fuer den aktuellen Stand akzeptiert, weil die sichtbaren
  Galerietexte laut Felix entfernt und manuell geprueft wurden.
- Reiseseiten-Galerietexte sind bewusst gesetzt und bleiben bestehen.
- Die bekannten Squarespace-System-/Ordnerpfade ausserhalb der Sitemap werden nicht als Fehler behandelt.

## Empfohlene naechste Schritte

1. Nach GitHub-Pages-Deploy Squarespace-Footer auf `species-core.js?v=1.0.4`, `map-loader.js?v=1.0.7` und
   `species-sound.js?v=1.0.22` setzen und Artseiten mobil/desktop pruefen.
2. NC-Soundfaelle bei kuenftigen Pipeline-Laeufen weiter automatisch auf freie Alternativen pruefen lassen.
