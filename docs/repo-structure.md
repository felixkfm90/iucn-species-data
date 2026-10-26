# Repo Structure And Local Workflow

Stand: 2026-10-26

Ziel: festhalten, welche Dateien ins Repository gehoeren, welche lokal bleiben sollen und welche Strukturentscheidungen
bewusst nicht ohne separaten Patch umgesetzt werden.

Repositoryweite Text- und Binärregeln stehen in `.gitattributes`: plattformunabhängige Quell-, Daten- und
Dokumentdateien verwenden LF, Windows-Start-/Wartungsskripte CRLF und Medien werden nie als Text normalisiert.

## Kurzfazit

Der aktuelle Repo-Inhalt ist fuer den bestehenden Betrieb weitgehend notwendig. Das Repository ist nicht nur Quellcode,
sondern auch GitHub-Pages-Hosting fuer JSON, JavaScript, Karten, Icons und Sounds. Deshalb sind auch generierte Assets
bewusst versioniert.

Nicht ins Repo gehoeren lokale Abhaengigkeiten, Logdateien, `.env`-Dateien, rein lokale Batch-Hilfen und Testlauf-Artefakte.
Versionierte Windows-Start- und Wiederherstellungsdateien wie `restore-start.cmd` sind dagegen Teil der Anwendung.
`README.md` und `AGENTS.md` bleiben im Root. Detaildokumentation bleibt unter `docs/`.

## Muss im Root bleiben

| Datei / Ordner | Grund |
|---|---|
| `README.md` | GitHub-Startseite und Projektueberblick. Nicht nach `docs/` verschieben. |
| `AGENTS.md` | Arbeitsregeln und Uebergabe fuer Codex/Agenten. Muss schnell auffindbar bleiben. |
| `species-core.js`, `species-info.js`, `species-taxonomy.js`, `species-hero-layout.js`, `species-status.js`, `species-portrait.js`, `species-sound.js`, `map-loader.js`, `search.js`, `sort.js`, `lightbox-zoom.js`, `header-navigation.js` | Werden im Squarespace-Footer direkt aus dem Repo-Root ueber GitHub Pages geladen. Verschieben wuerde Footer-Aenderungen erfordern. |
| `update.mjs` | Orchestriert die lokale Datenpipeline; externe Quellen liegen in `scripts/*-adapter.mjs`. |
| `species_list.json` | Manuelle Eingabeliste fuer die Pipeline: Name, Taxon, Groesse, Gewicht und Lebenserwartung. |
| `speciesData.json` | Wird von den Frontend-Modulen ueber GitHub Pages geladen. |
| `species-taxonomy-overrides.json` | Kontrollierte manuelle Taxonomiekorrekturen und zuletzt bekannte automatische Vergleichswerte. |
| `fehlende_elemente_report.json` | Aktueller Qualitaets- und Lizenzreport. |
| `lastSavedAssessmentId.json` | Pipeline-Zustand fuer Kartenaktualisierung. |
| `package.json`, `package-lock.json` | Reproduzierbare Node-Installation fuer `update.mjs`. |
| `species-explorer/` | Versionierte lokale Arbeitsoberfläche. `server.mjs` ist nur noch Kompositions- und HTTP-Adapterwurzel. `request-security.mjs`, `http-routing.mjs` und `request-router.mjs` bilden Sicherheits-, HTTP- und Routinggrenzen; `species-model.mjs` validiert einzelne Arteinträge, während `explorer-model.mjs` das vollständige read-only Explorer-Modell und seine Revision aufbaut. CRUD liegt in `species-create.mjs`, `species-delete.mjs` und `species-edit.mjs`; Medienabläufe liegen in `map-asset-workflow.mjs`, `sound-asset-workflow.mjs`, `portrait-asset-workflow.mjs` und `asset-maintenance.mjs`. `pipeline-controller.mjs`, `project-publication.mjs` und `backup-service.mjs` besitzen Pipeline, Veröffentlichung und NAS-Sicherung. `media-assets.mjs`, `asset-files.mjs`, `asset-backups.mjs`, `pipeline-log.mjs` und `manual-map-documentation.mjs` besitzen Medienprüfung, Assetdateiliste, Sicherungen, Prozessausgabe und Kartendokumentation. `public/app-foundation.js` bildet die testbare Zustands-/API-Grenze, `public/app-presentation.js` die zustandsfreie Formatierungs-/Anzeigegrenze, `public/app-measurements.js` die gemeinsame Messwert-/Formulargrenze und `public/app-dialogs.js` die gemeinsame Modal-/Medienfreigabegrenze. |
| `species-explorer/taxonomy-*.mjs` | Gekapselter Phase-9-Referenz- und Masterkern für lokalen Speicher, SQLite-Schemata, Import, read-only Suche, stabile Master-IDs, versionierte Anbieter-Ausschnitte, Provenienz, Zusammenführungsregeln, Kandidaten, Konflikte, Projektverknüpfungen, atomare Aktivierung und Rollback. `taxonomy-reference-service.mjs` stellt Status, Reiche, Suche und Taxondetails bereit; `taxonomy-master-service.mjs` schaltet bevorzugt auf die aktive Masteransicht und fällt sicher auf die CoL-Referenz zurück. `taxonomy-storage.mjs` serialisiert atomare Zeiger- und Cache-Schreibvorgänge je Zieldatei; `taxonomy-storage.test.mjs` sichert parallele Windows-Schreibvorgänge ab. |
| `species-explorer/lightroom-search-*.mjs` | Phase-10.2-Kern für das abgeleitete read-only Lightroom-Suchpaket: Schema, Aufbau, aktiver/vorheriger Stand, Prüfsumme, Suche, Suchhelfer und direkte Tests. Er bearbeitet weder Lightroom-Katalog noch XMP. |
| `species-explorer/public/app-taxonomy-reference.js`, `app-taxonomy-master.js` | Bidirektionale Taxonomievorschläge im Neue-Art-Assistenten, Quellen-/Statusanzeige, CoL-Lücken, Konfliktentscheidungen und Masterwartung mit nicht blockierendem manuellem Fallback. |
| `lightroom-plugin/FNWildlifeTaxonomy.lrplugin/` | Versioniertes deutsches Lightroom-Plug-in 0.4.24.39. Es verwendet den read-only Suchhelfer und schreibt ausschließlich über das Lightroom-SDK reservierte flache FN-Stichwörter sowie stabile Plug-in-Metadaten; Verwaltung, Statistik/Exporte und bestätigte Artänderungen sind getrennte Abläufe. KeywordIdFinalizer bindet die tatsächlich zugewiesenen Stichwortobjekte sowie vollständige erwartete FN-Nachwerte, prüft nach dem SDK-Commit alle geänderten Bereiche und vervollständigt ausschließlich bei Bedarf interne Kennungen. Quellstand, tatsächliche Ladung und native Abnahmegrenzen werden im [Lightroom-Vertrag](lightroom-search-package.md) getrennt belegt. |
| `scripts/taxonomy-prototype*.mjs` | Reproduzierbarer begrenzter Phase-9.3-Import, Fixture-Erzeugung und End-to-End-Test. |
| `scripts/taxonomy-master-migrate.mjs` | Reale, verifizierte Phase-9.12-Migration in einen Master-Kandidaten mit optionaler Aktivierung, Rollbacktest, JSON-Bericht und Messwerten. |
| `scripts/taxonomy-master-verify.mjs` | Schreibgeschützte Betriebsprüfung des aktiven realen Masters: Schema, Bestandszähler, Projektverknüpfungen, repräsentative Offline-Suchen und Laufzeiten. |
| `scripts/lightroom-search-package.mjs` | Wartungs-CLI für Status, Aufbau, Verifikation und isolierte Rollbackprobe des abgeleiteten Lightroom-Suchpakets. |
| `scripts/fixtures/taxonomy/` | Kleine versionierte Testdaten mit Release-Metadaten und Prüfsummen; keine vollständige Taxonomiedatenbank. |
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
`app-editor-portrait.js`, `app-detail-view.js` und `app-backup-history.js`. Neue Funktionen werden der passenden Grenze zugeordnet und nicht
wieder als Grossblock in `app.js` eingebaut.

`website-species-pages.mjs` liest ausschließlich die öffentliche FN-Sitemap mit Zeit-/Größen-/Hostgrenzen
und gemeinsamem Sitzungscache. `public/app-website-pages.js` besitzt Website-Verweise, fehlende öffentliche
Artseiten, Prüfstatus und Erneuerung; Änderungen an diesen UI-Slots starten keine Detailmedien neu.
Der Websitestatus bleibt von der lokalen Daten-/Assetvalidierung und dem erzeugten Projektstatus getrennt.

Im Lightroom-Plug-in besitzt `PhotoSelection.lua` die gemeinsame Auswahl für Taxonomiezuweisung und
Orts-/Zeit-Hinzufügen beziehungsweise -Aktualisieren. Sie ergänzt nur die SDK-belegten Mitglieder eines
ausgewählten oberen eingeklappten Ordnerstapels in unterstützten Ordner-/Gesamtfotoansichten und entfernt
Dubletten. Offene Stapel und Sammlungsansichten behalten die genaue Auswahl; nicht vollständig lesbare
eingeklappte Stapel stoppen vor dem Schreiben. `AssignmentWindow.lua` und `LocationTimeMenu.lua`
verwenden diesen Helfer; Entfernungsaktionen behalten die ausdrückliche Auswahl aus `PluginState.lua`.
`CatalogMaintenance.lua` besitzt davon getrennt den katalogweiten FN-Abgleich. `Statistics.lua` und
`StatisticsIndex.lua` schließen SDK-gekennzeichnete Videos aus Statistik und Statistikexporten aus,
während die FN-Zuweisung Videos zulässt. Der detaillierte Bedien-/Auswahlvertrag bleibt im
[Lightroom-Vertrag](lightroom-search-package.md).

`TaxonomyDetailsView.lua` besitzt ausschließlich die kompakte paginierte Textanzeige der vorhandenen
Taxonomievorschau. `AssignmentWindow.lua` bindet die lesende Aktion an den aktuellen Treffer und
Arbeitszustand; dieses Ansichtsmodul hat keine Katalog-, Namens- oder Helferschreibabhängigkeit.
`IdentityWriter.lua` bindet vorbereitete Zielstichwortobjekte erst nach dem SDK-Commit und verwendet
`Statistics.identitySnapshot` für die Projektion des vollständigen Journalziels bei Apply und Undo.
Journal-/Vorschau-/Katalogschutz bleiben im bestehenden Identitätsworkflow.

`KeywordWriter.lua` und `LocationTimeWriter.lua` übergeben dem gemeinsamen `KeywordIdFinalizer.lua`
die tatsächlich hinzugefügten Stichwortobjekte. Dessen Erfassung im ersten Schreibzugriff setzt keine
bereits aktualisierte rohe SDK-Stichwortliste voraus. Vor dem ersten Metadaten-Setter wird zusätzlich
der vollständige FN-/UUID-Vorzustand gebunden; erfolgreiche Setter ergänzen diese gemeinsame Erwartung
je Foto um ihre exakt geschriebenen normalisierten und begrenzten Werte. Getter innerhalb desselben
Schreibzugriffs sind kein Nachschreibbeweis. Nach Rückkehr werden Fotoidentität, erwartete vollständige
FN-Metadaten und alle geänderten reservierten Stichwortbereiche gemeinsam geprüft; unberührte Werte
bleiben exakt gebunden. Die Nachprüfung erfolgt auch bei bereits vollständigen Kennungen und leeren
Änderungsergebnissen. Nur fehlende interne Kennungen benötigen einen weiteren geschützten Schreibzugriff.
Die nativen .31-/ .32-Fehlproben, die erfolgreiche eigene .33-Orts-/Zeitprobe samt unveränderter Wiederholung
und unabhängigem vollständigem Nachvergleich sowie weitere Grenzen stehen im
[Auditauftrag, Abschnitt 10.31](audit-auftrag-phase-10-5.md#1031-native-video-datumsquellen-und-fortsetzung--15-oktober).

`species-explorer/species-creation-availability.mjs` formuliert die Artanlage-Sperre aus dem vorhandenen
Auftrags-/Betriebszustand. Der Server verbindet sie mit einer lesenden Verfügbarkeitsroute und prüft
Vorschau/Speicherung erneut; der Assistent zeigt sie vor dem Öffnen. Das Modul verändert keinen Updateauftrag.

`species-explorer/taxonomy-update-restart.mjs` besitzt die begrenzten lokalen Eingangs- und Eigentumsprüfungen
für einen ausdrücklich bestätigten Ersatz eines eigenen fehlgeschlagenen Aufbaus. Der vorhandene
`taxonomy-update-coordinator.mjs` behält Auftragsgeschichte und Reihenfolge; Request-/Schließnachweise
bleiben in den bestehenden Lightroom-Modulen. Der Server verbindet nur die geschützten Routen.

Die kontrollierte Taxonomiebearbeitung liegt serverseitig in `species-explorer/taxonomy-edit.mjs`; Normalisierung,
Override-Register und Pipeline-Wiederanwendung gehören `scripts/taxonomy-overrides.mjs`. Der Mehrabschnitt-
Soundeditor verwendet `scripts/sound-segment-editor.mjs`, während Vorschau und geschütztes Speichern im bestehenden
`species-explorer/sound-asset-workflow.mjs` bleiben. Die Aktivierung einer bereits laufenden Desktop-Instanz liegt
getrennt in `species-explorer/desktop/window-activation.mjs`.

`species-explorer/edit-backup-restoration.mjs` liest begrenzte lokale Bearbeitungsstände, bindet die Vorschau
an damalige und heutige Dateiinhalte und delegiert die artweise Übernahme an die bestehenden Editmodule.
`species-explorer/nas-backup-archives.mjs` besitzt die begrenzte lesende ZIP-/Manifestübersicht in einem
verwalteten Hilfsprozess; `backup-service.mjs` liefert den konfigurierten Sicherungspfad und verbindet sie mit
dem Server. Beide Funktionen haben direkte Modultests, die HTTP-Zusammensetzung bleibt in den Servertests.

Der lokale Server verwendet dieselben Eigentumsregeln: Neue Modell-, CRUD-, Medien-, Pipeline-, Publikations-,
Backup-, Dokumentations- oder Formatierungslogik wird dem vorhandenen Fachmodul zugeordnet und nicht wieder in
`server.mjs` eingebaut. `server-test-fixtures.mjs` enthält ausschließlich wiederverwendbare Testfixtures; direkte
Modultests liegen neben dem jeweiligen Modul. Zusammengesetzte API-Abläufe sind in `server.test.mjs`,
`server-species-workflows.test.mjs`, `server-assets.test.mjs` und `server-cleanup-search.test.mjs` fachlich
aufgeteilt. `explorer-ui-contract.test.mjs` prüft getrennt Browseroberfläche, Modulzuständigkeiten und
HTTP-Auslieferungsverträge.

Die schweren Taxonomiearbeiten besitzen eigene Prozessgrenzen: `taxonomy-master-job.mjs` bindet Eingänge und
Checkpoints, `taxonomy-master-worker.mjs` baut privat; `taxonomy-publication-process.mjs` und
`scripts/taxonomy-publication-worker.mjs` bereiten Master-/Lightroom-Paare vor. Nur die frische Eingangsprüfung
und der gemeinsame Veröffentlichungszeigerwechsel bleiben im Service. `taxonomy-build-cache.mjs` begrenzt
den Aufbaupuffer; `taxonomy-storage-maintenance.mjs` verwaltet bestätigte Speicherpläne.

Die kontrollierte Quellenreparatur liegt in `taxonomy-source-recovery*.mjs` und
`scripts/taxonomy-source-recovery.mjs`: revisionsgebundene Vorschau, separater Entwurf/Auftrag, Identitäts- und
semantische Umfangssperre, Konflikterhalt sowie bestätigte Ersatz-/Neustartwege. Keine automatischen Migrationen
oder Löschungen. `lightroom-search-inputs.mjs`, `lightroom-search-projection.mjs`, `lightroom-search-delta.mjs`
und `lightroom-search-validation*.mjs` trennen Fingerabdrücke, Projektion, Änderungen und vollständige Prüfung.
Verträge/Einordnung: [Dokumentationsübersicht](README.md), [Taxonomie-Betriebsstand](taxonomy-current-status.md).

## Muss versioniert bleiben, obwohl generiert

| Ordner | Grund |
|---|---|
| `species-assets/` | Einzige GitHub-Pages-Assetquelle pro Art: Karte, Portrait, Sound, Credits und Spektrogramm. |
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
| `taxonomy-data/`, `species-explorer/taxonomy-data/` | lokale, reproduzierbare Taxonomie-Releases und SQLite-Dateien; ignoriert und nie Bestandteil von Pages |
| `Daten/lightroom/` | lokales abgeleitetes Lightroom-Suchpaket mit Paarreleases, Vorgänger und Staging; nicht versioniert und nicht Bestandteil von Pages |
| `Daten/taxonomy/`, `Daten/taxonomy-publication/`, `Daten/corrections/`, `Daten/handoff/` | gemeinsamer konfigurierbarer Speicher für Quellen, Master, eigene Entscheidungen, Aufträge/Belege und Paarzeiger; ignoriert, im vollständigen NAS-Restorebackup enthalten |
| `storage-path.json`, `storage-migration-lock.sqlite*` | lokale Konfiguration und Speicherwechsel-Prozesssperre; ignoriert |
| `temp/`, `<Plug-in>/temp/` | eigene prozess-/sitzungsgebundene Laufzeit-, Test- und Hilfsdateien; ignoriert und nicht im NAS-Backup |
| `errors.log` | veralteter Root-Logpfad; wird nicht mehr erzeugt und kann bei Altbeständen gelöscht werden |
| `.env`, `.env.*` | lokale Token/Secrets, ignoriert |
| `update_local.bat`, `update_github_only.bat` | lokaler Windows-Workflow, ignoriert |
| `Testlauf/` | ignorierte Test-/Mess-/Prüfablage; benötigte Reparaturnachweise erhalten, keine Produktivartefakte oder Veröffentlichung |
| `list_licenses.mjs` | altes lokales Hilfsskript; nicht mehr noetig, weil Report und Sound-Review die Lizenzuebersicht abdecken |

Vorhandene `Testlauf/`-Inhalte sind historische Prüfablagen. Neue Prüfungen verwenden die eigenen
Programm-temp-Sitzungen nach dem [Testvertrag](test-temp-contract.md). Eigene entbehrliche Testordner können
nach geprüfter Eigentums- und Prozessgrenze gezielt entfernt werden; gebundene Reparatur-/Prüfbelege und
fremde Inhalte nicht pauschal löschen. Produktive Artefakte werden in die passende Struktur/Dokumentation übernommen.
Die Dokumentations-/Commitfreigabe am 1. Oktober umfasst keine Bereinigung dieser Ablagen.

Das Pages-Artefakt enthält aus `docs/` ausschließlich `squarespace-custom.css`; `README.md` und alle
anderen Dokumentdateien bleiben ausgeschlossen. Öffentlich sind daneben nur die in
`scripts/pages-artifact-policy.mjs` freigegebenen Frontendmodule, zentralen JSON-Dateien, Artassets,
benötigten PNG-Grafiken sowie die generierten Einstiegdateien. Repositoryweite Style-, Schema- und
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
  - `squarespace-custom.css`: kanonisches Standard-CSS, im CMS ausschließlich per Import eingebunden;
    Einbau und gemeinsame Cachepflege mit dem Footer nach dem [Website-Betriebsvertrag](monthly-site-audit.md)

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

Vorhandene lokale Batch-Hilfen, nur für einen ausdrücklich beauftragten Lauf oder Push:

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

Der Audit-Befehl schreibt keine Datei. Neue technische Zwischenergebnisse gehören in eigene verwaltete
Programm-temp-Sitzungen nach dem [Testvertrag](test-temp-contract.md). Gebundene Belege bleiben erhalten;
Dateialter oder fehlender Zugriff erlauben keine pauschale Löschung. Während des Gesamtaudits stehen
Ergebnisse ausschließlich im [Auditauftrag Phase 10.5](audit-auftrag-phase-10-5.md), nicht in einem zweiten Bericht.

Spektrogramm-Generator:

```bash
npm.cmd run --silent generate:spectrograms -- --dry-run
```

Testausgabe in eine vorher angelegte eigene verwaltete Sitzung; den Platzhalter durch deren Pfad ersetzen:

```bash
npm.cmd run --silent generate:spectrograms -- --species=Amsel,Graugans,Bisamratte --output-root="<eigene-verwaltete-Sitzung>/spectrograms"
```

FFmpeg wird aus `FFMPEG_PATH`, dem projektlokalen `local-tools/ffmpeg/bin/ffmpeg.exe` oder `PATH`
ermittelt; ein ausdrücklich anderer Pfad kann mit `--ffmpeg=<Pfad>` übergeben werden.

Produktive Spektrogramme duerfen erst nach Sichtpruefung erzeugt und versioniert werden. Der Generator schreibt
standardmaessig nach `species-assets/<SafeName>/spectrogram.webp`. Der Generator-Default ist auf den hellen Zielstil
eingestellt: weisser Hintergrund, dunkle Graustufen-Frequenzspuren, Rand oben und unten, Frequenzbereich bis 18 kHz.

Das NAS dient als Restore-Backupziel; die aktive Arbeitskopie bleibt lokal. Der führende
[Mehrgeräte-/Backupvertrag](multi-device-backup-plan.md) beschreibt diese Rollen und den getrennten
Mehrgeräteplan. Datierte Sicherungs- und Wiederherstellungsnachweise stehen im laufenden
[Auditauftrag Phase 10.5](audit-auftrag-phase-10-5.md).

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
