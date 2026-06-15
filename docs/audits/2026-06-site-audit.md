# Monatsaudit 2026-06

Stand: 2026-06-15

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
| Lokale Assets | `speciesData.json` gegen Karten, Sounds und Credits | 45/45 konsistent, keine fehlenden Kernassets |
| Soundlizenzen | `fehlende_elemente_report.json` und `sounds/*/credits.json` | 3 aktive NC-Lizenzen, unveraendert bekannt |

## Offen

- 3 aktive NC-Soundlizenzen bleiben bekannt:
  - `Bisamratte`
  - `Brauenmotmot`
  - `Geoffroy-Klammeraffe`
- Spektrogramm-/Frequenzdarstellungen fuer Tierstimmen sind noch nicht konzipiert.
- Artweise Asset-Buendelung bleibt eine spaetere Migrationsoption, aber keine aktuelle Umsetzung.
- Es ist noch keine konkrete Karte als manuell gepflegt dokumentiert. Wenn es solche Karten gibt, muessen sie in
  `docs/manual-map-overrides.md` eingetragen werden.
- Teile des Monatsaudits sind noch nicht automatisiert. Sinnvolle Kandidaten bleiben Sitemap-/Status-Check, interner
  Link-Crawl, GitHub-Pages-Assetcheck und Report-Zusammenfassung.

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
  - `fehlende_elemente_report.json`: Report vom `2026-05-30T08:57:16.202Z`
  - Stichproben erreichbar: `species-core.js`, `species-info.js`, `species-sound.js`, `map-loader.js`, `search.js`,
    `lightbox-zoom.js`, `Verbreitungskarten/Amsel.jpg`, `sounds/Amsel/Amsel.mp3`, `sounds/Amsel/credits.json`
- Lokaler Assetabgleich:
  - `speciesData.json`: 45 Arten
  - `species_list.json`: 45 Arten
  - Karten: 45 JPG-Dateien
  - Soundordner: 45
  - MP3-Dateien: 45
  - Credits-Dateien: 45
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

1. `docs/manual-map-overrides.md` mit Felix abgleichen: Gibt es konkret manuell gepflegte Karten?
2. Audit-Automatisierung vorbereiten, mindestens fuer Sitemap-/Status-Check, internen Link-Crawl und GitHub-Pages-
   Assetcheck.
3. Spektrogramm-Konzept fuer Tierstimmen ausarbeiten, bevor `species-sound.js` oder Assets geaendert werden.
4. NC-Soundfaelle bei kuenftigen Pipeline-Laeufen weiter automatisch auf freie Alternativen pruefen lassen.
