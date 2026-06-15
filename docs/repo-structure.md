# Repo Structure And Local Workflow

Stand: 2026-06-15

Ziel: festhalten, welche Dateien ins Repository gehoeren, welche lokal bleiben sollen und welche Strukturentscheidungen
bewusst nicht ohne separaten Patch umgesetzt werden.

## Kurzfazit

Der aktuelle Repo-Inhalt ist fuer den bestehenden Betrieb weitgehend notwendig. Das Repository ist nicht nur Quellcode,
sondern auch GitHub-Pages-Hosting fuer JSON, JavaScript, Karten, Icons und Sounds. Deshalb sind auch generierte Assets
bewusst versioniert.

Nicht ins Repo gehoeren lokale Abhaengigkeiten, Logdateien, `.env`-Dateien, Batch-Dateien und Testlauf-Artefakte.
`README.md` und `AGENTS.md` bleiben im Root. Detaildokumentation bleibt unter `docs/`.

## Muss im Root bleiben

| Datei / Ordner | Grund |
|---|---|
| `README.md` | GitHub-Startseite und Projektueberblick. Nicht nach `docs/` verschieben. |
| `AGENTS.md` | Arbeitsregeln und Uebergabe fuer Codex/Agenten. Muss schnell auffindbar bleiben. |
| `species-core.js`, `species-info.js`, `species-taxonomy.js`, `species-status.js`, `species-sound.js`, `map-loader.js`, `search.js`, `sort.js`, `lightbox-zoom.js` | Werden im Squarespace-Footer direkt aus dem Repo-Root ueber GitHub Pages geladen. Verschieben wuerde Footer-Aenderungen erfordern. |
| `update.mjs` | Zentrale lokale Datenpipeline. |
| `species_list.json` | Manuelle Eingabeliste fuer die Pipeline: Name, Taxon, Groesse, Gewicht und Lebenserwartung. |
| `speciesData.json` | Wird von den Frontend-Modulen ueber GitHub Pages geladen. |
| `fehlende_elemente_report.json` | Aktueller Qualitaets- und Lizenzreport. |
| `lastSavedAssessmentId.json` | Pipeline-Zustand fuer Kartenaktualisierung. |
| `package.json`, `package-lock.json` | Reproduzierbare Node-Installation fuer `update.mjs`. |
| `scripts/monthly-site-audit.mjs` | Reproduzierbarer Monatsaudit fuer Sitemap, interne Links, SEO-Grundfelder, GitHub-Pages-Assets und lokale Assetkonsistenz. |
| `scripts/generate-spectrograms.mjs` | Generator fuer optionale Tierstimmen-Spektrogramme unter `sounds/<SafeName>/spectrogram.webp`. |

## Muss versioniert bleiben, obwohl generiert

| Ordner | Grund |
|---|---|
| `Verbreitungskarten/` | GitHub-Pages-Assetquelle fuer `map-loader.js`. |
| `sounds/` | GitHub-Pages-Assetquelle fuer `species-sound.js`; MP3s und Credits werden live geladen. |
| `graphics/trend/` | Trend-Icons fuer `species-status.js`. |
| `graphics/catagory/Alternativ/` | Status-Icons fuer `species-status.js`; Ordnername nicht ohne Pfadmigration aendern. |

## Bleibt vorerst versioniert, aber spaeter pruefen

| Datei / Ordner | Befund | Entscheidung |
|---|---|---|
| `graphics/catagory/*.png` | Aktuell nutzt das Frontend `graphics/catagory/Alternativ/*.png`. | Nicht loeschen, bis Phase 5 Asset-Struktur entschieden ist. |
| `graphics/catagory/Alternativ/Blaupause.psd` | Vermutlich Quelldatei fuer Status-Icons. | Vorerst behalten; spaeter entscheiden, ob Designquellen in `graphics/source/` gehoeren. |
| grosse MP3-Dateien in `sounds/` | Einige Dateien sind gross, aber unter GitHub-Grenzen und live benoetigt. | Nicht entfernen; optional spaeter gezielt komprimieren oder neu beziehen. |

## Gehoert nicht ins Repo

| Datei / Ordner | Status |
|---|---|
| `node_modules/` | lokal installiert, ignoriert |
| `errors.log` | lokaler Laufzeitlog, ignoriert |
| `.env`, `.env.*` | lokale Token/Secrets, ignoriert |
| `update_local.bat`, `update_github_only.bat` | lokaler Windows-Workflow, ignoriert |
| `Testlauf/` | temporare Tests, ignoriert und nach Tests wieder leer zu halten |
| `list_licenses.mjs` | altes lokales Hilfsskript; nicht mehr noetig, weil Report und Sound-Review die Lizenzuebersicht abdecken |

`Testlauf/` darf waehrend eines aktiven Themas Skripte, Reports oder andere Zwischenstaende enthalten. Nach Abschluss
des Themas wird der Ordner wieder geleert; produktive Artefakte werden stattdessen in die passende Repo-Struktur oder
Dokumentation uebernommen.

## Dokumentationsstruktur

- Root:
  - `README.md`: Projektueberblick und Bedienung
  - `AGENTS.md`: Arbeitsregeln, aktueller Stand und Uebergabe
- `docs/`:
  - `roadmap.md`: Phasen, Status, naechste Schritte
  - `monthly-site-audit.md`: Monatsaudit-Regeln und Audit-Befehl
  - `audits/`: gespeicherte Monatsberichte
  - `repo-file-audit.md`: Befunde zum Dateibestand
  - `repo-structure.md`: diese Struktur- und Workflow-Entscheidung
  - `asset-structure-plan.md`: Bewertung der artweisen Asset-Buendelung und Migrationsentscheidung
  - `manual-map-overrides.md`: manuell gepflegte Karten wegen korrupter IUCN-Kartendaten
  - `spectrogram-plan.md`: Konzept fuer spaetere Spektrogramm-Assets der Tierstimmen
  - `manual-species-fields.md`: manuell gepflegte Artenfelder
  - `add-species-workflow.md`: manueller Ablauf fuer neue Arten
  - `sound-license-review.md`: Soundquellen und NC-Lizenzen
  - `css-layout-audit.md`: CSS-/Layout-Befunde
  - `squarespace-footer.html`: dokumentierter Squarespace-Footer
  - `squarespace-custom.css`: dokumentiertes Squarespace-CSS

## `.gitignore`-Regel

`.gitignore` soll nur lokale oder sensible Dateien ignorieren. Keine breiten Regeln wie `*.js`, `*.mjs`, `*.json`,
`*.mp3` oder `*.jpg`, weil diese Dateitypen produktiv benoetigt werden.

## Nicht jetzt verschieben

- Keine Frontend-JS-Dateien in `docs/`, `js/` oder `assets/` verschieben, weil Squarespace den Root-Pfad laedt.
- Keine Sounds/Karten pro Art buendeln, bevor Loader, Pipeline, GitHub-Pages-Pfade und Squarespace-Tests geplant sind.
- Phase 5.8 hat entschieden: aktueller Asset-Aufbau bleibt bestehen; artweise Buendelung ist nur eine spaetere
  Migrationsoption, siehe `docs/asset-structure-plan.md`.
- `README.md` nicht nach `docs/` verschieben.
- `AGENTS.md` nicht nach `docs/` verschieben.

## Lokaler Workflow

Empfohlener Normalfall:

1. `update_local.bat` ausfuehren, wenn ein kompletter Suchlauf mit anschliessendem Push gewuenscht ist.
2. `update_github_only.bat` ausfuehren, wenn nur der aktuelle Arbeitsstand gepusht werden soll.
3. Vor dem Push pruefen, dass keine Tokens in Remote-URL, Batch-Dateien oder Logs stehen.

Monatsaudit:

```bash
npm.cmd run --silent audit:site
```

Nur lokaler Asset-/Reportcheck ohne Netzwerk:

```bash
npm.cmd run --silent audit:site -- --skip-live --skip-pages
```

Der Audit-Befehl schreibt keine Datei. Wenn Zwischenergebnisse gespeichert werden, gehoeren sie nach `Testlauf/` und
werden nach Abschluss geloescht oder als zusammengefasster Bericht unter `docs/audits/` dokumentiert.

Spektrogramm-Generator:

```bash
npm.cmd run --silent generate:spectrograms -- --dry-run
```

Testausgabe nach `Testlauf/`:

```bash
npm.cmd run --silent generate:spectrograms -- --species=Amsel,Graugans,Bisamratte --output-root=Testlauf/spectrograms
```

Mit projektlokalem ffmpeg:

```bash
npm.cmd run --silent generate:spectrograms -- --ffmpeg=D:\IUCN_Datenbank\local-tools\ffmpeg\bin\ffmpeg.exe --species=Amsel,Graugans,Bisamratte --output-root=Testlauf/spectrograms
```

Produktive Spektrogramme duerfen erst nach Sichtpruefung erzeugt und versioniert werden. Der Generator schreibt
standardmaessig nach `sounds/<SafeName>/spectrogram.webp`. Der Generator-Default ist auf den hellen Zielstil
eingestellt: weisser Hintergrund, dunkle Graustufen-Frequenzspuren, Rand oben und unten, Frequenzbereich bis 12 kHz.

Ein spaeterer Umzug oder eine Spiegelung auf ein persoenliches Synology NAS wird separat geprueft. Bis dahin bleibt die
lokale Arbeitskopie massgeblich. Fuer das NAS ist zuerst ein Backup-/Mirror- oder Testklon-Ansatz sinnvoll, weil Git
und die Pipeline auf Netzlaufwerken durch Latenz, Dateilocks und Sync-Konflikte stoeranfaelliger sein koennen.

Manueller Fallback:

```bash
node update.mjs
git status
git add <relevante Dateien>
git commit -m "..."
git push origin main
```

Dokumentation bleibt Pflicht: Wenn ein Workflow-Schritt eine Datei- oder Prozessentscheidung aendert, muessen
`AGENTS.md`, `README.md`, `docs/roadmap.md` und die passende Detaildoku aktualisiert werden.
