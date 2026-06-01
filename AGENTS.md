# AGENTS.md - Projektuebergabe Wildlife/IUCN Squarespace

Stand: 2026-06-01

Projekt: `fnwildlifetravel.de` Wildlife-Artseiten, IUCN-Daten, Karten, Sounds, Suche und Lightbox-Zoom
Repository: `felixkfm90/iucn-species-data`
Branch: `main`
GitHub Pages Base: `https://felixkfm90.github.io/iucn-species-data/`

## Arbeitsregel: Dokumentation ist Pflicht

Kein Schritt der Roadmap gilt als abgeschlossen, solange die dazugehoerige Dokumentation nicht aktuell ist.

Bei jedem technischen Schritt pruefen und bei Bedarf aktualisieren:

- `AGENTS.md` fuer den aktuellen Uebergabe- und Arbeitsstand
- `README.md` fuer Projektueberblick, Bedienung und Betriebsablauf
- `docs/roadmap.md` fuer Status, naechste Schritte und Priorisierung
- passende Detaildokumente unter `docs/`, z. B. CSS-, Sound-, Repo- oder Squarespace-Doku

Wenn eine JS-Datei geaendert wird, muss auch `docs/squarespace-footer.html` bzw. die Squarespace-`?v=`-Version
geprueft werden. Wenn CSS geaendert wird, muss `docs/squarespace-custom.css` mit dem echten Squarespace-Stand
abgeglichen werden.

## Kurzueberblick

Squarespace ist das sichtbare Frontend/CMS. Die Artseiten enthalten nur Container-IDs. Die dynamischen Inhalte werden
ueber JavaScript-Module von GitHub Pages geladen.

Zentrale Dateien:

- `species_list.json`: manuelle Artenliste und Input fuer die Pipeline, inklusive Groesse, Gewicht und
  Lebenserwartung
- `update.mjs`: Datenpipeline fuer IUCN, Karten, Xeno-Canto, Wikimedia Commons, iNaturalist, Sounds und Reports
- `speciesData.json`: generierte Datenbank fuer die Frontend-Module
- `Verbreitungskarten/*.jpg`: Verbreitungskarten
- `sounds/<Artname>/<Artname>.mp3` und `sounds/<Artname>/credits.json`: Tierstimmen und Quellen
- `fehlende_elemente_report.json`: Qualitaetsreport fuer fehlende Assets/Daten und NC-Soundlizenzen

Frontend-Module:

- `species-core.js`: gemeinsamer Datenloader, Slug-Ermittlung, Cache und Assetnamen-Sanitizer
- `species-info.js`: Info-Box
- `species-taxonomy.js`: Taxonomie-Pyramide
- `species-status.js`: IUCN-Status und Populationstrend
- `species-sound.js`: native Soundbar mit Canvas-Wellenform, Credits und Lizenzhinweisen
- `map-loader.js`: Verbreitungskarte
- `search.js`: Suche auf Uebersichtsseiten
- `sort.js`: Sortierung sichtbarer Listen
- `lightbox-zoom.js`: Galerie-/Lightbox-Zoom

## Aktueller Projektstand

- 45 aktive Arten
- 45 Karten
- 45 Soundordner
- 45 MP3-Dateien
- 45 Credits-Dateien
- 0 fehlende Kernassets laut Report
- 3 aktive NC-Soundlizenzen laut Report:
  - `Bisamratte`
  - `Brauenmotmot`
  - `Geoffroy-Klammeraffe`

Der Sound-Suchlauf prueft vorhandene NC-Sounds bei jedem Update erneut auf freie Alternativen:

1. freie Xeno-Canto-Aufnahmen
2. freie Wikimedia-Commons-Audiodateien mit erreichbarem MP3-Transcode
3. freie iNaturalist-MP3-Aufnahmen mit exaktem Taxon, freier Lizenz und gueltiger MP3-Datei

Aktuell ersetzte freie Quellen:

- `Eurasisches Eichhoernchen`: freie Xeno-Canto-Alternative
- `Fischertukan`: freie Wikimedia-Commons-/iNaturalist-Aufnahme
- `Grosstrappe`: freie Wikimedia-Commons-Aufnahme
- `Mittelamerikanischer Totenkopfaffe`: freie iNaturalist-Aufnahme, CC BY 4.0
- `Panama-Kapuzineraffe`: freie iNaturalist-Aufnahme, CC BY 4.0
- `Quetzal`: freie Quelle, nicht mehr im NC-Report

Letzter vollstaendiger Pipeline-/Report-Check: 2026-05-28.

## Datenfluss

```text
species_list.json
  -> update.mjs
     -> IUCN API v4
     -> Xeno-Canto API
     -> Wikimedia Commons API
     -> iNaturalist API
     -> speciesData.json
     -> Verbreitungskarten/*.jpg
     -> sounds/<SafeName>/<SafeName>.mp3
     -> sounds/<SafeName>/credits.json
     -> fehlende_elemente_report.json
  -> GitHub Pages
  -> Squarespace Footer Scripts
  -> Squarespace Container auf Art- und Uebersichtsseiten
```

## Squarespace-Integration

Aktuell dokumentierter Footer:

- `docs/squarespace-footer.html`

Aktuell dokumentiertes Custom CSS:

- `docs/squarespace-custom.css`

Art-Detailseiten brauchen diese Container:

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

Uebersichtsseiten brauchen fuer Suche:

```html
<div id="species-search"></div>
```

Optional fuer Sortierung:

```html
<select id="species-sort"></select>
```

## Lokaler Workflow

Voraussetzungen:

- Node.js
- `npm install`
- Umgebungsvariable `IUCN_TOKEN`
- Umgebungsvariable `XENO_TOKEN`
- GitHub-Anmeldung ueber Git Credential Manager oder SSH, keine Tokens in Batch-Dateien oder Git-Remote-URLs

Manuell ausfuehren:

```bash
node update.mjs
```

Lokale Batch-Dateien:

- `update_local.bat`: fuehrt `node .\update.mjs` aus und ruft danach `update_github_only.bat` auf
- `update_github_only.bat`: pusht aktuelle Projektdateien ins Repo, ohne Token in der Remote-URL

Die Batch-Dateien sind lokal ignoriert und nicht Teil des GitHub-Pages-Deployments.

Temporare Tests gehoeren in `Testlauf/`. Dieser Ordner ist ignoriert; produktive Artefakte gehoeren dort nicht hinein.
Nach Abschluss eines Themas wird `Testlauf/` wieder geleert.

## Bekannte Stolperstellen

- Keine Tokens oder privaten Schluessel hardcoden.
- `graphics/catagory/Alternativ/` nicht vorschnell umbenennen. Die Schreibweise ist in Live-Pfaden relevant.
- `Verbreitungskarten/` ist case-sensitive fuer GitHub Pages.
- `speciesData.json` muss ein Array bleiben.
- Detailseiten-Slugs entsprechen dem wissenschaftlichen Namen ohne Leerzeichen, z. B. `cyanistescaeruleus`.
- Squarespace Preview kann andere Pfade liefern als die Live-Seite.
- Nach jeder eingebundenen JS-Aenderung muss die jeweilige Squarespace-`?v=`-Version erhoeht werden.
- Asset-Migrationen pro Art duerfen nicht nebenbei passieren, weil sie Loader, GitHub-Pages-Pfade und bestehende Assets betreffen.

## Testplan

Nach Datenpipeline-Aenderungen:

- `node --check update.mjs`
- `node update.mjs`
- `fehlende_elemente_report.json` pruefen
- Anzahl Arten, Karten, Soundordner, MP3s und Credits pruefen
- Credits der ersetzten Sounds auf Quelle, Lizenz und URL pruefen

Nach Frontend-Aenderungen:

- Detailseite, z. B. `/wildlife/heimische-tierwelt/acanthisflammea`
- Uebersichtssuche:
  - `/wildlife/heimische-tierwelt`
  - `/wildlife/costarica`
  - `/wildlife/island`
- Mobile Layout pruefen
- Lightbox-Zoom auf Desktop und Android Chrome pruefen
- GitHub Pages Deploy abwarten
- Danach erst Squarespace-`?v=` erhoehen

## Aktuelle Phase-5-Roadmap

Phase 5 laeuft. Bereits erledigt:

- Repo- und Dateiaudit: `docs/repo-file-audit.md`
- Dokumentationsregel und aktuelle Uebergabe: `AGENTS.md`, `README.md`, `docs/roadmap.md`
- Lokaler Workflow und Repo-Struktur: `docs/repo-structure.md`
- Soundbar: `species-sound.js`, `docs/soundbar.md`, `docs/squarespace-custom.css`, `docs/squarespace-footer.html`
  - aktueller Stand: native Audio-Wiedergabe mit gekapselter Canvas-Wellenform; keine WaveSurfer-Abhaengigkeit
- Manuelle Zusatzdaten: `species_list.json`, `update.mjs`, `species-info.js`, `docs/manual-species-fields.md`
  - aktueller Stand: `life_expectancy` wird als `Lebenserwartung` oberhalb der Generationsdauer angezeigt
- Weitere Arten: `docs/add-species-workflow.md`
  - aktueller Stand: Arten werden nur manuell von Felix in `species_list.json` ergaenzt; keine automatische
    Artenauswahl oder automatische Listenaenderung
  - Pipeline-Check am 2026-05-28 ohne neue Arten erfolgreich: 45 Arten, 45 Karten, 45 MP3s, keine fehlenden Kernassets
- SEO/KI-Findbarkeit: `docs/seo-worklist.md`
  - aktueller Stand: Live-Sitemap-Audit fuer 117 URLs erstellt, inklusive Root-Startseite und gemeldetem
    Costa-Rica-Reisepfad
  - zusaetzlicher interner Link-Crawl fand Legacy-, Redirect- und Systempfade ausserhalb der Sitemap, z. B. `/cart`,
    `/wildlife`, `/reisen-1` und einen alten 404-Pfad
  - enthaelt aktuelle Live-SEO-Titel, aktuelle Meta-Beschreibungen, konsistente Vorschlaege, Status je URL und
    Hinweise zu doppelten Site-Namen, fehlenden Beschreibungen, Legacy-Redirects und auffaelligen Pfaden
  - Live-Audit vom 2026-05-30 plus Nachpruefung vom 2026-06-01: 118 dokumentierte URLs/Seiten stehen auf `passt`;
    alle 44 per aktueller Sitemap auffindbaren Wildlife-Artseiten passen live
  - Die zuvor offenen Reise-Detailseiten `Creta Maris Beach Resort` und `Rio Bebedero` wurden nach Felix' Anpassung
    live geprueft und stehen jetzt auf `passt`
  - `/reisen/2024-costarica` wurde nach Felix' Freigabe am 2026-06-01 live geprueft und steht jetzt auf `passt`
  - 1 aktive Art aus `species_list.json` hat noch keine oeffentliche Artseite und liefert 404:
    `Kohlmeise` (`parusmajor`)
  - Legacy-/Beacon-Pfade sind erklaert: mehrere sind nicht intern verlinkt, `/reisen-1`, `/wildlife` und `/cart`
    kommen aus Squarespace-Navigation/Systemlinks; `/2019-griechenland` liefert weiter 404, ist nach Felix' Korrektur
    aber nicht mehr aus der Reiseuebersicht verlinkt und bleibt nur als optionales Redirect-Thema fuer externe Altlinks
  - Bild-Alt-Texte und optionale Bildtitel sind als eigener SEO-/Barrierefreiheits-Audit aufgenommen, aber noch nicht
    systematisch geprueft

Naechste sinnvolle Schritte:

1. SEO-Restpunkt entscheiden: `Kohlmeise` als Artseite erstellen/freigeben oder bewusst parken. Optional kann der alte
   Legacy-Pfad `/2019-griechenland` per Redirect auf `/reisen/2019-griechenland` abgefangen werden, falls externe
   Altlinks existieren.
2. Bild-Alt-Texte/Bildtitel auditieren: wichtige Seiten und Galerien auf fehlende oder ungenaue Alternativtexte
   pruefen und konsistente Vorschlaege dokumentieren.
3. Asset-Struktur pro Art nach sanitisiertem Namen konzipieren.
4. Projektumzug oder Spiegelung auf ein persoenliches Synology NAS spaeter pruefen. Bis dahin bleibt die lokale
   Arbeitskopie massgeblich; das NAS zuerst als Backup, Mirror oder Testklon bewerten, weil Git- und Pipeline-Laeufe
   auf Netzlaufwerken durch Latenz, Dateilocks und Sync-Konflikte stoeranfaelliger sein koennen.
5. Spaeter: Ausruestung, Affiliate, Shop/Kalender, rechtliche Folgepruefung und optional vorberechnete
   Spektrogramm-/Frequenzdarstellungen fuer Tierstimmen.
