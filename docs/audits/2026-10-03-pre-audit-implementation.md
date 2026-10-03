# Vor-Audit-Umsetzungsprüfung – 3. Oktober 2026

Stand: lokal implementiert und automatisiert geprüft, praktische Gesamtabnahme und Veröffentlichung offen.
Dies ist **kein Phase-10.5-Gesamtaudit**.

Diese erste Umsetzungsprüfung dokumentiert Plug-in 0.4.24.16. Nachfolgende Nutzerbefunde, Korrekturen
in 0.4.24.17 und der neue Prüf-/Veröffentlichungsstand stehen im
[aktuellen Regressionsnachweis](2026-10-03-acceptance-regressions.md); die früheren Abnahmepunkte unten
sind keine Aufforderung, eine alte Version neu zu installieren.

## Auftrag und eingehaltene Grenzen

Felix beauftragte die vor dem Audit noch sicher ausführbaren Arbeiten parallel. Startregel: einmal
`Jetzt aktualisieren`, alternativ `Später` bis zur nächsten Explorer-Öffnung. Bei offenem Lightroom nach
neuer SDK-Erfassung ausdrücklich normales Schließen anfordern oder selbst schließen und im Hintergrund
darauf warten; danach kein zweiter Startklick. Fachliche Entscheidungen bleiben bei relevanten Änderungen
an Projektarten, zugewiesenen Arten oder eigenen Daten erforderlich.

Der bereits abgeschlossene produktive Wechsel auf COL26.9 XR bleibt unverändert. Keine neue Quelle geladen,
kein produktiver Master-/Paketaufbau oder gemeinsamer Wechsel, keine Lightroom-Fotoaktion, keine Bereinigung,
kein Dienstneustart und keine Git-Veröffentlichung durch diese Umsetzungsprüfung. Der produktive
[Updateabschluss](2026-10-03-taxonomy-reference-update.md) ist ein separater Nachweis.

## Implementierter Umfang

| Bereich | Ergebnis | Grenze |
| --- | --- | --- |
| Updatekette | Gespeicherter Koordinator verbindet Quellen, Master, Paket und gemeinsamen Abschluss; Dialogschließen beendet ihn nicht | Kein dauerhafter Windows-Dienst; unterbrochene aktive Phase benötigt sichere technische Fortsetzung |
| FN-Nutzung | Plug-in 0.4.24.16 prüft kleine gebundene Requestdatei; zwei neue SDK-Durchgänge nur bei bestätigtem Auftrag | Einmalige vollständige Katalogregistrierung; unbekannter Katalog niemals leer |
| Lightroom schließen | Normale Schließanforderung erst nach Erfassung; selbständiges Schließen wird erkannt | Kein Kill; Adobe-Rückfragen bleiben beim Nutzer; Lightroom muss während des Updates geschlossen bleiben |
| Schutz vorhandener Daten | Gewählte Namen und Hierarchie bei Projektarten, verwendeten IDs und eigenen Entscheidungen vor unbestätigter Änderung geschützt | Keine automatische Identitäts-, Foto- oder Projektmigration |
| Entscheidungen | Letzte bestätigte Feldentscheidung setzt denselben Auftrag fort; vollständige gebundene Klassifikationsbündel führen zu einem lokalen Folgeaufbau | Andere offene oder veränderte Belege bleiben gesperrt; allgemeine Split-/Merge-Entscheidungen behalten ihren separaten bestätigten Kandidatenweg |
| Orts-/Zeitaktionen | Entfernungszählung zählt nur tatsächliche Änderungen; Pflege prüft das Paket erneut vor jedem 250er-Block | Kein neuer produktiver Kataloglauf |
| Statistik und Exporte | Echte Lua-Gegenproben für Januar/Februar ohne GPS, Mengen/Schnittmengen, Top-5 und drei Exportwege | SDK-Simulation ersetzt keine Sichtabnahme in Lightroom |
| Speicherpflege | Teilfehler speichern belegten Rest; frische Vorschau/Bestätigung erlaubt nur unveränderte noch ungeschützte Restdateien | Keine automatische oder produktive Bereinigung |
| Karten | Herkunft, erklärte Pflegeart und Überschreibschutz getrennt; ausdrücklicher IUCN-Browserimport als Nutzerangabe, getrennte Zähler | Automatischer IUCN-Abruf nicht repariert; fünf vorhandene Altmarkierungen unverändert |

Verträge: [Gesamtweg](../taxonomy-update-automation.md), [FN-Nutzung](../lightroom-catalog-usage.md),
[Kartenpflege](../manual-map-overrides.md), [Speicherpflege](../taxonomy-storage-maintenance.md).

Die Erfassungs-/Schließungslücke wird in der einmaligen Startbestätigung ausdrücklich als Nutzervereinbarung
abgedeckt. Sie wird nicht als lückenloser SDK-Änderungsbeobachter oder nachträglich neu gestempelte Quittung
dargestellt. Prozessstand, Arbeitsdateien, Dateistand und geschlossene Prüfsummen werden zusätzlich geprüft.

## Tatsächliche Prüfergebnisse

- `npm.cmd run --silent quality:ci`: **Exit 0**, alle **50 Testgruppen**; darunter **420 Master-/Betriebstests**
  und **214 Lightroom-/Pakettests** ohne Fehler, Abbrüche oder übersprungene Tests.
- `node scripts/lightroom-plugin-contract.test.mjs`: **15 von 15 bestanden**, Exit 0, nochmals separat ausgeführt.
- Enge Reparatur plus Feldschutz nach der Abschlusskorrektur: **65 von 65 bestanden**. Enger Reparaturweg
  erhält echte Entscheidungen und vorhandene Schutzmarker ohne neue Statusänderungen außerhalb der freigegebenen Fälle.
- Syntaxprüfung: **371 JavaScript-/MJS-Dateien**; Stil-, Schema- und Dokumentationsprüfung erfolgreich.
- Medien-/Projekt-/Größenprüfung und generierter Projektstatus erfolgreich. Lokaler Website-Prüfweg mit
  `--skip-live --skip-pages`; kein Live-Website- oder GitHub-Pages-Nachweis.
- `git diff --check`: Exit 0. Git meldet nur bestehende plattformspezifische Zeilenenden-Hinweise, keine Diff-Fehler.

Der erste vollständige Lauf scheiterte an einer echten Regression: die neue Markerfortschreibung veränderte
im engen Reparaturweg einen unbeteiligten Status. Die bestehende Umfangsprüfung blieb unverändert und blockierte
korrekt. Markerfortschreibung nun nur im regulären Aufbau; der enge Weg kopiert echte Entscheidungen und
vorhandene Marker. Beide Altzustände ausdrücklich geprüft, anschließend das gesamte Gate erneut erfolgreich.

Hilfsprozessstarts waren in der beschränkten Ausführungsumgebung zunächst gesperrt. Die Gegenläufe nutzten
erlaubte isolierte Testprozesse außerhalb dieser Beschränkung; keine Windows-Einstellung, Sicherheitsregel,
Testregel oder fachliche Schutzprüfung wurde gelockert.

## Noch nötige praktische Abnahme, in dieser Reihenfolge

1. Explorer normal neu öffnen und Lightroom-Plug-in normal neu laden; Version **0.4.24.16** prüfen.
   Allein Öffnen darf keinen Update oder zusätzlichen SDK-Vollscan starten.
2. Neue Karten-Pflegeauswahl und getrennte Zähler ansehen. Ohne gewünschte Datenänderung nicht speichern.
   Ein echter IUCN-Browserimport bleibt ausdrücklich Nutzerangabe und geschützt, nicht automatisch überprüfte Herkunft.
3. Restliche gebündelte Lightroom-Sichtabnahme: Menü, Suche/Namenswahl, Einzel-/Mehrfachzuweisung,
   Orts-/Zeit-Stapel, Statistik und drei Exporte. Schreibende Pflege-/Entfernungsaktionen nur an bewusst
   gewählten Testfotos oder isoliertem Testkatalog nach eigenem Vorschau-/Bestätigungsvertrag.
4. Den gespeicherten Gesamtweg beim nächsten **separat bestätigten** realen Update prüfen: neuer SDK-Nachweis,
   beide normalen Schließungswege, kein zweiter Start, Dialogschließen, relevante Entscheidungen und echter Paarabschluss.
   Kein weiterer Anbieterdownload allein für eine künstliche Abnahme dieses bereits aktuellen Bestands.
5. Git-Übertragung nur nach eigener Freigabe; danach Linux-Qualitätsgate und Pages-Deployment separat nachweisen.
6. Die fortbestehende automatische IUCN-Abrufgrenze und noch fehlende produktive Großbestands-/Betriebsproben
   ausdrücklich einordnen; keine pauschale Geschwindigkeitszusage aus kleinen synthetischen Testläufen ableiten.
7. Erst anschließend **Phase 10.5 – Gesamtaudit** mit den aktuellen Verträgen und ausgewiesenen Grenzen.

Maßgebliche Restreihenfolge: [Roadmap](../roadmap.md). Ein bestandener automatisierter Test ist nicht als
Bestätigung einer noch nicht ausgeführten realen Lightroom-/Explorer-Bedienhandlung verbucht.

## Dateien der unveröffentlichten Arbeitsserie

Arbeitsbaum: **76 geänderte versionierte Dateien und 23 neue Dateien**.
`git diff --stat` für die versionierten Änderungen: **76 files changed, 2116 insertions(+), 241 deletions(-)**.
Neue, noch nicht versionierte Dateien sind in dieser Git-Statistik nicht enthalten; unten sind beide Gruppen erfasst.
Die Liste beschreibt die gesamte derzeit unveröffentlichte Arbeitsserie, nicht ausschließlich den letzten Reparaturschritt.

- Geändert: [AGENTS.md](../../AGENTS.md)
- Geändert: [README.md](../../README.md)
- Geändert: [docs/README.md](../../docs/README.md)
- Geändert: [docs/lightroom-search-package.md](../../docs/lightroom-search-package.md)
- Geändert: [docs/manual-map-overrides.md](../../docs/manual-map-overrides.md)
- Geändert: [docs/project-status.md](../../docs/project-status.md)
- Geändert: [docs/roadmap.md](../../docs/roadmap.md)
- Geändert: [docs/taxonomy-current-status.md](../../docs/taxonomy-current-status.md)
- Geändert: [docs/taxonomy-reference-update.md](../../docs/taxonomy-reference-update.md)
- Geändert: [docs/taxonomy-storage-maintenance.md](../../docs/taxonomy-storage-maintenance.md)
- Geändert: [lightroom-plugin/FNWildlifeTaxonomy.lrplugin/CatalogMaintenance.lua](../../lightroom-plugin/FNWildlifeTaxonomy.lrplugin/CatalogMaintenance.lua)
- Geändert: [lightroom-plugin/FNWildlifeTaxonomy.lrplugin/Info.lua](../../lightroom-plugin/FNWildlifeTaxonomy.lrplugin/Info.lua)
- Geändert: [lightroom-plugin/FNWildlifeTaxonomy.lrplugin/LocationTimeWriter.lua](../../lightroom-plugin/FNWildlifeTaxonomy.lrplugin/LocationTimeWriter.lua)
- Geändert: [lightroom-plugin/FNWildlifeTaxonomy.lrplugin/PluginInfoProvider.lua](../../lightroom-plugin/FNWildlifeTaxonomy.lrplugin/PluginInfoProvider.lua)
- Geändert: [lightroom-plugin/FNWildlifeTaxonomy.lrplugin/PluginMenu.lua](../../lightroom-plugin/FNWildlifeTaxonomy.lrplugin/PluginMenu.lua)
- Geändert: [package.json](../../package.json)
- Geändert: [scripts/data-schema.mjs](../../scripts/data-schema.mjs)
- Geändert: [scripts/data-schema.test.mjs](../../scripts/data-schema.test.mjs)
- Geändert: [scripts/lightroom-plugin-contract.test.mjs](../../scripts/lightroom-plugin-contract.test.mjs)
- Geändert: [scripts/pipeline-selection.mjs](../../scripts/pipeline-selection.mjs)
- Geändert: [scripts/project-status.mjs](../../scripts/project-status.mjs)
- Geändert: [scripts/project-status.test.mjs](../../scripts/project-status.test.mjs)
- Geändert: [species-explorer/app-editor-map.test.mjs](../../species-explorer/app-editor-map.test.mjs)
- Geändert: [species-explorer/app-new-species-workflow.test.mjs](../../species-explorer/app-new-species-workflow.test.mjs)
- Geändert: [species-explorer/app-taxonomy-database.test.mjs](../../species-explorer/app-taxonomy-database.test.mjs)
- Geändert: [species-explorer/app-taxonomy-master.test.mjs](../../species-explorer/app-taxonomy-master.test.mjs)
- Geändert: [species-explorer/app-taxonomy-progress.test.mjs](../../species-explorer/app-taxonomy-progress.test.mjs)
- Geändert: [species-explorer/explorer-model.mjs](../../species-explorer/explorer-model.mjs)
- Geändert: [species-explorer/explorer-ui-contract.test.mjs](../../species-explorer/explorer-ui-contract.test.mjs)
- Geändert: [species-explorer/lightroom-search-helper.mjs](../../species-explorer/lightroom-search-helper.mjs)
- Geändert: [species-explorer/manual-map-documentation.mjs](../../species-explorer/manual-map-documentation.mjs)
- Geändert: [species-explorer/manual-map-documentation.test.mjs](../../species-explorer/manual-map-documentation.test.mjs)
- Geändert: [species-explorer/map-asset-workflow.mjs](../../species-explorer/map-asset-workflow.mjs)
- Geändert: [species-explorer/pipeline-controller.mjs](../../species-explorer/pipeline-controller.mjs)
- Geändert: [species-explorer/public/app-dashboard.js](../../species-explorer/public/app-dashboard.js)
- Geändert: [species-explorer/public/app-detail-view.js](../../species-explorer/public/app-detail-view.js)
- Geändert: [species-explorer/public/app-editor-map.js](../../species-explorer/public/app-editor-map.js)
- Geändert: [species-explorer/public/app-new-species-workflow.js](../../species-explorer/public/app-new-species-workflow.js)
- Geändert: [species-explorer/public/app-species-editor.js](../../species-explorer/public/app-species-editor.js)
- Geändert: [species-explorer/public/app-taxonomy-database.js](../../species-explorer/public/app-taxonomy-database.js)
- Geändert: [species-explorer/public/app-taxonomy-master.js](../../species-explorer/public/app-taxonomy-master.js)
- Geändert: [species-explorer/public/app-taxonomy-progress.js](../../species-explorer/public/app-taxonomy-progress.js)
- Geändert: [species-explorer/public/index.html](../../species-explorer/public/index.html)
- Geändert: [species-explorer/request-router.mjs](../../species-explorer/request-router.mjs)
- Geändert: [species-explorer/request-router.test.mjs](../../species-explorer/request-router.test.mjs)
- Geändert: [species-explorer/server-assets.test.mjs](../../species-explorer/server-assets.test.mjs)
- Geändert: [species-explorer/server.mjs](../../species-explorer/server.mjs)
- Geändert: [species-explorer/taxonomy-build-inputs.mjs](../../species-explorer/taxonomy-build-inputs.mjs)
- Geändert: [species-explorer/taxonomy-build-inputs.test.mjs](../../species-explorer/taxonomy-build-inputs.test.mjs)
- Geändert: [species-explorer/taxonomy-classification-batch.test.mjs](../../species-explorer/taxonomy-classification-batch.test.mjs)
- Geändert: [species-explorer/taxonomy-classification-service.mjs](../../species-explorer/taxonomy-classification-service.mjs)
- Geändert: [species-explorer/taxonomy-identity-registry.mjs](../../species-explorer/taxonomy-identity-registry.mjs)
- Geändert: [species-explorer/taxonomy-identity-registry.test.mjs](../../species-explorer/taxonomy-identity-registry.test.mjs)
- Geändert: [species-explorer/taxonomy-identity-review.mjs](../../species-explorer/taxonomy-identity-review.mjs)
- Geändert: [species-explorer/taxonomy-maintenance-service.mjs](../../species-explorer/taxonomy-maintenance-service.mjs)
- Geändert: [species-explorer/taxonomy-maintenance-service.test.mjs](../../species-explorer/taxonomy-maintenance-service.test.mjs)
- Geändert: [species-explorer/taxonomy-master-background-service.test.mjs](../../species-explorer/taxonomy-master-background-service.test.mjs)
- Geändert: [species-explorer/taxonomy-master-candidate.mjs](../../species-explorer/taxonomy-master-candidate.mjs)
- Geändert: [species-explorer/taxonomy-master-candidate.test.mjs](../../species-explorer/taxonomy-master-candidate.test.mjs)
- Geändert: [species-explorer/taxonomy-master-dependencies.mjs](../../species-explorer/taxonomy-master-dependencies.mjs)
- Geändert: [species-explorer/taxonomy-master-graph-reuse.mjs](../../species-explorer/taxonomy-master-graph-reuse.mjs)
- Geändert: [species-explorer/taxonomy-master-graph-reuse.test.mjs](../../species-explorer/taxonomy-master-graph-reuse.test.mjs)
- Geändert: [species-explorer/taxonomy-master-inputs.mjs](../../species-explorer/taxonomy-master-inputs.mjs)
- Geändert: [species-explorer/taxonomy-master-inputs.test.mjs](../../species-explorer/taxonomy-master-inputs.test.mjs)
- Geändert: [species-explorer/taxonomy-master-job.mjs](../../species-explorer/taxonomy-master-job.mjs)
- Geändert: [species-explorer/taxonomy-master-lifecycle.mjs](../../species-explorer/taxonomy-master-lifecycle.mjs)
- Geändert: [species-explorer/taxonomy-master-previous-state.mjs](../../species-explorer/taxonomy-master-previous-state.mjs)
- Geändert: [species-explorer/taxonomy-master-reuse.mjs](../../species-explorer/taxonomy-master-reuse.mjs)
- Geändert: [species-explorer/taxonomy-master-run-controller.mjs](../../species-explorer/taxonomy-master-run-controller.mjs)
- Geändert: [species-explorer/taxonomy-master-service.mjs](../../species-explorer/taxonomy-master-service.mjs)
- Geändert: [species-explorer/taxonomy-master-source-binding.mjs](../../species-explorer/taxonomy-master-source-binding.mjs)
- Geändert: [species-explorer/taxonomy-publication.mjs](../../species-explorer/taxonomy-publication.mjs)
- Geändert: [species-explorer/taxonomy-source-recovery.test.mjs](../../species-explorer/taxonomy-source-recovery.test.mjs)
- Geändert: [species-explorer/taxonomy-storage-maintenance.mjs](../../species-explorer/taxonomy-storage-maintenance.mjs)
- Geändert: [species-explorer/taxonomy-storage-maintenance.test.mjs](../../species-explorer/taxonomy-storage-maintenance.test.mjs)
- Geändert: [update.mjs](../../update.mjs)
- Neu: [docs/audits/2026-10-03-pre-audit-implementation.md](../../docs/audits/2026-10-03-pre-audit-implementation.md)
- Neu: [docs/audits/2026-10-03-taxonomy-reference-update.md](../../docs/audits/2026-10-03-taxonomy-reference-update.md)
- Neu: [docs/lightroom-catalog-usage.md](../../docs/lightroom-catalog-usage.md)
- Neu: [docs/taxonomy-update-automation.md](../../docs/taxonomy-update-automation.md)
- Neu: [lightroom-plugin/FNWildlifeTaxonomy.lrplugin/CaptureCatalogUsage.lua](../../lightroom-plugin/FNWildlifeTaxonomy.lrplugin/CaptureCatalogUsage.lua)
- Neu: [lightroom-plugin/FNWildlifeTaxonomy.lrplugin/CatalogUsageCapture.lua](../../lightroom-plugin/FNWildlifeTaxonomy.lrplugin/CatalogUsageCapture.lua)
- Neu: [lightroom-plugin/FNWildlifeTaxonomy.lrplugin/CatalogUsageUpdateWatcher.lua](../../lightroom-plugin/FNWildlifeTaxonomy.lrplugin/CatalogUsageUpdateWatcher.lua)
- Neu: [lightroom-plugin/FNWildlifeTaxonomy.lrplugin/PluginInit.lua](../../lightroom-plugin/FNWildlifeTaxonomy.lrplugin/PluginInit.lua)
- Neu: [lightroom-plugin/FNWildlifeTaxonomy.lrplugin/PluginShutdown.lua](../../lightroom-plugin/FNWildlifeTaxonomy.lrplugin/PluginShutdown.lua)
- Neu: [scripts/lightroom-catalog-usage-lua.test.mjs](../../scripts/lightroom-catalog-usage-lua.test.mjs)
- Neu: [scripts/lightroom-statistics-location-lua.test.mjs](../../scripts/lightroom-statistics-location-lua.test.mjs)
- Neu: [scripts/map-provenance.mjs](../../scripts/map-provenance.mjs)
- Neu: [scripts/map-provenance.test.mjs](../../scripts/map-provenance.test.mjs)
- Neu: [species-explorer/lightroom-catalog-usage.mjs](../../species-explorer/lightroom-catalog-usage.mjs)
- Neu: [species-explorer/lightroom-catalog-usage.test.mjs](../../species-explorer/lightroom-catalog-usage.test.mjs)
- Neu: [species-explorer/lightroom-close-gate.mjs](../../species-explorer/lightroom-close-gate.mjs)
- Neu: [species-explorer/lightroom-close-gate.test.mjs](../../species-explorer/lightroom-close-gate.test.mjs)
- Neu: [species-explorer/lightroom-usage-request.mjs](../../species-explorer/lightroom-usage-request.mjs)
- Neu: [species-explorer/lightroom-usage-request.test.mjs](../../species-explorer/lightroom-usage-request.test.mjs)
- Neu: [species-explorer/taxonomy-classification-automation.mjs](../../species-explorer/taxonomy-classification-automation.mjs)
- Neu: [species-explorer/taxonomy-master-field-protection.test.mjs](../../species-explorer/taxonomy-master-field-protection.test.mjs)
- Neu: [species-explorer/taxonomy-update-coordinator.mjs](../../species-explorer/taxonomy-update-coordinator.mjs)
- Neu: [species-explorer/taxonomy-update-coordinator.test.mjs](../../species-explorer/taxonomy-update-coordinator.test.mjs)
