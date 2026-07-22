# Repo Structure And Local Workflow

Stand: 2026-07-22

Ziel: festhalten, welche Dateien ins Repository gehoeren, welche lokal bleiben sollen und welche Strukturentscheidungen
bewusst nicht ohne separaten Patch umgesetzt werden.

Repositoryweite Text- und Binärregeln stehen in `.gitattributes`: plattformunabhängige Quell-, Daten- und
Dokumentdateien verwenden LF, Windows-Start-/Wartungsskripte CRLF und Medien werden nie als Text normalisiert.

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
| `update.mjs` | Orchestriert die lokale Datenpipeline; externe Quellen liegen in `scripts/*-adapter.mjs`. |
| `species_list.json` | Manuelle Eingabeliste fuer die Pipeline: Name, Taxon, Groesse, Gewicht und Lebenserwartung. |
| `speciesData.json` | Wird von den Frontend-Modulen ueber GitHub Pages geladen. |
| `species-taxonomy-overrides.json` | Kontrollierte manuelle Taxonomiekorrekturen und zuletzt bekannte automatische Vergleichswerte. |
| `fehlende_elemente_report.json` | Aktueller Qualitaets- und Lizenzreport. |
| `lastSavedAssessmentId.json` | Pipeline-Zustand fuer Kartenaktualisierung. |
| `package.json`, `package-lock.json` | Reproduzierbare Node-Installation fuer `update.mjs`. |
| `species-explorer/` | Versionierte lokale Arbeitsoberfläche. `server.mjs` ist nur noch Kompositions- und HTTP-Adapterwurzel. `request-security.mjs`, `http-routing.mjs` und `request-router.mjs` bilden Sicherheits-, HTTP- und Routinggrenzen; `species-model.mjs` validiert einzelne Arteinträge, während `explorer-model.mjs` das vollständige read-only Explorer-Modell und seine Revision aufbaut. CRUD liegt in `species-create.mjs`, `species-delete.mjs` und `species-edit.mjs`; Medienabläufe liegen in `map-asset-workflow.mjs`, `sound-asset-workflow.mjs`, `portrait-asset-workflow.mjs` und `asset-maintenance.mjs`. `pipeline-controller.mjs`, `project-publication.mjs` und `backup-service.mjs` besitzen Pipeline, Veröffentlichung und NAS-Sicherung. `media-assets.mjs`, `asset-files.mjs`, `asset-backups.mjs`, `pipeline-log.mjs` und `manual-map-documentation.mjs` besitzen Medienprüfung, Assetdateiliste, Sicherungen, Prozessausgabe und Kartendokumentation. `public/app-foundation.js` bildet die testbare Zustands-/API-Grenze, `public/app-presentation.js` die zustandsfreie Formatierungs-/Anzeigegrenze, `public/app-measurements.js` die gemeinsame Messwert-/Formulargrenze und `public/app-dialogs.js` die gemeinsame Modal-/Medienfreigabegrenze. |
| `scripts/monthly-site-audit.mjs` | Reproduzierbarer Monatsaudit fuer Sitemap, interne Links, SEO-Grundfelder, GitHub-Pages-Assets und lokale Assetkonsistenz. |
| `scripts/generate-spectrograms.mjs` | Generator fuer optionale Tierstimmen-Spektrogramme unter `species-assets/<SafeName>/spectrogram.webp`. |
| `scripts/spectrogram-renderer.mjs` | Gemeinsamer FFmpeg-Renderer fuer CLI-Generator und manuellen Soundimport im Arten-Explorer. |
| `scripts/prepare-pages-artifact.mjs` | Baut das kontrollierte `_site/`-Artefakt fuer GitHub Pages. |
| `scripts/local-squarespace-preview.mjs` | Nur lesender lokaler Vorschau-Server fuer Phase-8-Module auf `127.0.0.1:4188`; veröffentlicht nichts. |
| `tools/squarespace-preview/` | Versionierte Vorschauhülle für Artwahl und Desktop-/Tablet-/Mobilansicht; kein Bestandteil des Pages-Artefakts. |
| `.github/workflows/pages.yml` | Eigenes GitHub-Actions-Deployment fuer GitHub Pages. |

Die lokale Explorer-Oberflaeche verwendet `public/app.js` nur als Kompositionswurzel. Pipeline und Backup,
Neue-Art-Assistent, Arteditor, allgemeine Daten, Karte, Sound, Portrait und Detailansicht liegen in den fachlichen
Modulen `app-pipeline-workflow.js`, `app-backup-workflow.js`, `app-new-species-workflow.js`,
`app-species-editor.js`, `app-editor-general.js`, `app-editor-taxonomy.js`, `app-editor-map.js`, `app-editor-sound.js`,
`app-editor-portrait.js` und `app-detail-view.js`. Neue Funktionen werden der passenden Grenze zugeordnet und nicht
wieder als Grossblock in `app.js` eingebaut.

Die kontrollierte Taxonomiebearbeitung liegt serverseitig in `species-explorer/taxonomy-edit.mjs`; Normalisierung,
Override-Register und Pipeline-Wiederanwendung gehören `scripts/taxonomy-overrides.mjs`. Der Mehrabschnitt-
Soundeditor verwendet `scripts/sound-segment-editor.mjs`, während Vorschau und geschütztes Speichern im bestehenden
`species-explorer/sound-asset-workflow.mjs` bleiben. Die Aktivierung einer bereits laufenden Desktop-Instanz liegt
getrennt in `species-explorer/desktop/window-activation.mjs`.

Der lokale Server verwendet dieselben Eigentumsregeln: Neue Modell-, CRUD-, Medien-, Pipeline-, Publikations-,
Backup-, Dokumentations- oder Formatierungslogik wird dem vorhandenen Fachmodul zugeordnet und nicht wieder in
`server.mjs` eingebaut. `server-test-fixtures.mjs` enthält ausschließlich wiederverwendbare Testfixtures; direkte
Modultests liegen neben dem jeweiligen Modul. Zusammengesetzte API-Abläufe sind in `server.test.mjs`,
`server-species-workflows.test.mjs`, `server-assets.test.mjs` und `server-cleanup-search.test.mjs` fachlich
aufgeteilt. `explorer-ui-contract.test.mjs` prüft getrennt Browseroberfläche, Modulzuständigkeiten und
HTTP-Auslieferungsverträge.

## Muss versioniert bleiben, obwohl generiert

| Ordner | Grund |
|---|---|
| `species-assets/` | Einzige GitHub-Pages-Assetquelle pro Art: Karte, Sound, Credits und Spektrogramm. |
| `graphics/trend/` | Trend-Icons fuer `species-status.js`. |
| `graphics/catagory/Alternativ/` | Status-Icons fuer `species-status.js`; Ordnername nicht ohne Pfadmigration aendern. |
| `graphics/catagory/*.png` | Eigenständiger Status-Icon-Satz des lokalen Arten-Explorers. Er ist nicht identisch mit dem Squarespace-Satz. |

## Bleibt vorerst versioniert, aber spaeter pruefen

| Datei / Ordner | Befund | Entscheidung |
|---|---|---|
| `graphics/catagory/Alternativ/Blaupause.psd` | Bearbeitbare Designquelle des Squarespace-Statussatzes. | Behalten; die Pages-Positivliste schließt PSD-Dateien zuverlässig von der Veröffentlichung aus. |
| Medien in `species-assets/` | Laufzeitdaten sind für GitHub Pages erforderlich. | Einzeldatei-, Artpaket- und mitwachsende Gesamtgrenzen werden automatisiert durch `assets:check` und `size:check` erzwungen. |

## Gehoert nicht ins Repo

| Datei / Ordner | Status |
|---|---|
| `node_modules/` | lokal installiert, ignoriert |
| `_site/` | lokales GitHub-Pages-Artefakt aus `scripts/prepare-pages-artifact.mjs`, ignoriert |
| `errors.log` | veralteter Root-Logpfad; wird nicht mehr erzeugt und kann bei Altbeständen gelöscht werden |
| `.env`, `.env.*` | lokale Token/Secrets, ignoriert |
| `update_local.bat`, `update_github_only.bat` | lokaler Windows-Workflow, ignoriert |
| `Testlauf/` | temporare Tests, ignoriert und nach Tests wieder leer zu halten |
| `list_licenses.mjs` | altes lokales Hilfsskript; nicht mehr noetig, weil Report und Sound-Review die Lizenzuebersicht abdecken |

`Testlauf/` darf waehrend eines aktiven Themas Skripte, Reports oder andere Zwischenstaende enthalten. Nach Abschluss
des Themas wird der Ordner wieder geleert; produktive Artefakte werden stattdessen in die passende Repo-Struktur oder
Dokumentation uebernommen.

Das Pages-Artefakt enthält weder `README.md` noch `docs/`. Öffentlich sind nur die explizit freigegebenen
Frontendmodule, zentralen JSON-Dateien, Artassets und benötigten PNG-Grafiken. Repositoryweite Style-, Schema- und
Größenregeln stehen in `docs/repository-quality-gates.md`.

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
  - `taxonomy-edit-workflow.md`: kontrollierte Taxonomiekorrektur und Pipeline-Wiederanwendung
  - `sound-editor.md`: Mehrabschnitt-Soundeditor, FFmpeg-Vorschau und geschützte Übernahme
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
- Keine neuen Asset-Pfade einfuehren, ohne `species-core.js`, `map-loader.js`, `species-sound.js`, `update.mjs`,
  Audit, Generator und Doku gemeinsam anzupassen.
- GitHub Pages nicht wieder auf Branch-Deployment `main:/` umstellen. Der Sollzustand ist `Source: GitHub Actions`
  mit `.github/workflows/pages.yml`; das Artefakt enthaelt nur die veroeffentlichungsrelevanten statischen Dateien.
- Phase 6.8 hat die artweise Buendelung umgesetzt: `species-assets/<SafeName>/` ist die produktive Struktur; die
  alten Ordner `sounds/` und `Verbreitungskarten/` wurden am 2026-06-17 entfernt.
- `README.md` nicht nach `docs/` verschieben.
- `AGENTS.md` nicht nach `docs/` verschieben.

## Lokaler Workflow

Phase-8-Artseitenmodule lokal und ohne Veröffentlichung prüfen:

```bash
npm.cmd run --silent preview:squarespace
```

Die Vorschau ist anschließend unter `http://127.0.0.1:4188/` erreichbar. Ihr Positivlisten- und Nur-Lese-Vertrag
wird mit `npm.cmd run --silent test:preview` geprüft. Freigaberegeln: `docs/phase-8-preview-release.md`.

Empfohlener Normalfall:

1. `update_local.bat` ausfuehren, wenn ein kompletter Suchlauf mit anschliessendem Push gewuenscht ist.
2. `update_github_only.bat` ausfuehren, wenn nur der aktuelle Arbeitsstand gepusht werden soll.
3. Beim manuellen Start per Doppelklick starten die Batch-Dateien zuerst ein dauerhaftes Konsolenfenster und fuehren
   sich darin mit `--run` erneut aus. Die komplette Ausgabe bleibt dadurch sichtbar.
4. Zum Schliessen das Fenster schliessen oder `exit` eingeben.
5. `--no-pause` ist nur fuer interne Aufrufe gedacht, damit `update_local.bat` beim Aufruf von
   `update_github_only.bat` kein zweites Fenster oeffnet.
6. `npm.cmd` innerhalb einer Batch-Datei immer mit `call npm.cmd ...` aufrufen. Ohne `call` endet die aufrufende
   Batch-Datei nach dem npm-Skript und erreicht die nachfolgenden Erfolgsmeldungen bzw. den GitHub-Push nicht.
7. Vor dem Push pruefen, dass keine Tokens in Remote-URL, Batch-Dateien oder Logs stehen.

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
standardmaessig nach `species-assets/<SafeName>/spectrogram.webp`. Der Generator-Default ist auf den hellen Zielstil
eingestellt: weisser Hintergrund, dunkle Graustufen-Frequenzspuren, Rand oben und unten, Frequenzbereich bis 18 kHz.

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
