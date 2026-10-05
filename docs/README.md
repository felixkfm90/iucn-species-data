# Dokumentationsübersicht

Stand: 2026-10-04

Aktuelle Bedien- und Betriebsverträge stehen neben ausdrücklich datierten Messungen und historischen
Planungs-/Auditberichten. Ein älteres Datum allein macht einen unveränderten Vertrag nicht ungültig; ein
historischer Erfolgsnachweis ersetzt jedoch keine Abnahme späterer Änderungen.

## Einstieg und verbindlicher aktueller Stand

- [Projekt-README](../README.md): Installation, Bedienung und Betrieb.
- [Roadmap](roadmap.md): aktuelle Restreihenfolge und offene Abnahmen vor dem Audit.
- [Taxonomie-Betriebsstand](taxonomy-current-status.md): abgeschlossene Reparatur und reguläres Quellenupdate, aktives lokales Paar und offene Abnahmen.
- [Projektstatus](project-status.md): einzige aktuelle Quelle für Arten-/Assetzähler und Pflege-/Lizenzlisten; automatisch erzeugt.
- [Dokumentationsregeln](documentation-lifecycle.md): Zuständigkeiten, historische Berichte und Prüfpflichten.
- [Repositorystruktur](repo-structure.md), [Qualitätsgrenzen](repository-quality-gates.md),
  [CI und Veröffentlichung](ci-quality-gate.md).

## Taxonomie und Lightroom

- [Gesamtplan Phase 9/10](global-taxonomy-lightroom-plan.md).
- [Quellenentscheidung](taxonomy-source-decision.md), [Ergänzungsnamen](taxonomy-reference-supplements.md).
- [Referenzaktualisierung](taxonomy-reference-update.md), [Explorer-Suche und Übernahme](taxonomy-explorer-integration.md).
- [Masterarchitektur](taxonomy-master-database-design.md), [Namenspräferenzen](taxonomy-name-preference-plan.md).
- [Identität und inkrementeller Gesamtauftrag](taxonomy-identity-incremental-plan.md).
- [Inkrementeller Masteraufbau](taxonomy-incremental-build.md), [Hintergrundaufbau und Fortschritt](taxonomy-master-background-build.md).
- [Lightroom-Suchpaket und Plug-in](lightroom-search-package.md), [gezielter Export](lightroom-incremental-export.md).
- [Bestätigte Lightroom-Artänderungen](lightroom-identity-workflow.md).
- [FN-Katalognutzung und unbenutzte Klassifikationen](lightroom-catalog-usage.md).
- [Gespeicherter Gesamtweg, SDK-Anforderung und Schließungsgrenze](taxonomy-update-automation.md).
- [Vor-Audit-Umsetzungsprüfung vom 3. Oktober](audits/2026-10-03-pre-audit-implementation.md): lokale Prüfergebnisse und noch nötige praktische Abnahmen, kein Gesamtaudit.
- [Bedienbefunde und Regressionskorrekturen vom 3. Oktober](audits/2026-10-03-acceptance-regressions.md): Pages-Vorabgrenze, Orts-/Zeitentfernung, Auswahlexporte und Plug-in 0.4.24.17.
- [Kontrollierte Quellenreparatur und vollständiger Abschluss](taxonomy-partial-source-recovery.md).
- [Speicherpflege](taxonomy-storage-maintenance.md), [begrenzter Aufbaupuffer](taxonomy-build-cache.md).
- [Isolierte Betriebs-/Größenprüfungen](taxonomy-operational-checks.md),
  [Ressourcenmessungen](taxonomy-performance-profiling.md): Messwerte und ihre Grenzen, keine pauschale Laufzeitzusage.
- [Manuelle Taxonomiebearbeitung](taxonomy-edit-workflow.md).
- Historische Grundlagen: [Referenzarchitektur Phase 9.2](local-taxonomy-database-design.md),
  [Importprototyp](taxonomy-import-prototype.md), [Lightroom-Machbarkeitsentscheidung](lightroom-feasibility-study.md).

## Artanlage, Medien und Datenpipeline

- [Neue Art anlegen](add-species-workflow.md), [Art umbenennen](rename-species-workflow.md),
  [Art löschen](delete-species-workflow.md), [manuelle Datenfelder](manual-species-fields.md).
- [Artanlage-/Namenswahl-Regressionsstand](explorer-regression-fixes.md): datierter technischer Prüfstand.
- [Artabbruch, verspätete Medienentscheidung und Lightroom-Pfadwarnung vom 4. Oktober](audits/2026-10-04-creation-abort-and-publication.md): jüngste gezielte Fehlerkorrektur und separate Prüfgrenzen.
- [Pipeline-Steuerung und Abschlussausgaben](pipeline-control-plan.md).
- [Prüfung neuer Karten/Sounds](asset-review-workflow.md), [manuelle Kartenschutzmarkierungen](manual-map-overrides.md).
- [Soundeditor und Ablehnungsrücksetzung](sound-editor.md), [Soundbar](soundbar.md).
- [Artporträts](portrait-generation.md), [Spektrogramme](spectrogram-plan.md).
- [Audioformat](audio-format-validation.md), [Medienprüfung](media-asset-validation.md).
- [Assetstruktur](asset-structure-plan.md), [Asset-Verwaltungsplan](asset-management-plan.md): abgeschlossener Phasenverlauf.

## Desktop, Sicherheitsgrenzen und Aufbewahrung

- [Desktop-Betrieb](desktop-shell-plan.md), [historischer Desktop-App-Plan](desktop-app-plan.md).
- [Lokale API-Sicherheit](explorer-api-security.md), [temporäre Dateien](temp-retention.md).
- [Gemeinsamer Datenpfad und geprüfter Umzug](storage-migration.md), [Test- und Messpfade](test-temp-contract.md).
- [Datenwechsel und Artassistent-Prüfabschluss vom 4. Oktober](audits/2026-10-04-storage-and-species-wizard.md).
- [Mehrgeräte-/Update-/NAS-Plan](multi-device-backup-plan.md): offene Phase 11 von heutigen Funktionen trennen.

## Squarespace und Website

- [Footer](squarespace-footer.html), [Custom CSS](squarespace-custom.css): versionierte Einbindungsvorlagen.
- [Vorschau-/Veröffentlichungsvertrag Phase 8](phase-8-preview-release.md).
- [Monatsaudit-Ablauf](monthly-site-audit.md), [SEO-Arbeitsliste](seo-worklist.md),
  [Bild-Alternativtexte](image-alt-audit.md), [CSS-Prüfung](css-layout-audit.md).
- [Taxonomie-Pyramiden-Übergabe](taxonomy-redesign-handoff.md): historischer Auftrag; keine neue Umsetzungsfreigabe.

## Historische Bestands- und Auditnachweise

Diese Berichte bleiben Zeitaufnahmen. Ihre Daten und damaligen Blocker werden nicht auf den heutigen Stand
umgeschrieben; die oben verlinkten aktuellen Verträge ordnen spätere Änderungen ein.

- [Repository-Bestandsaufnahme Phase 5](repo-file-audit.md), [Projektkonsolidierung](project-consolidation-audit.md),
  [historische Soundlizenzprüfung](sound-license-review.md).
- [Website-Audit Juni](audits/2026-06-site-audit.md).
- [Repository-Audit Juli](audits/2026-07-repository-audit.md), [Abschluss vor Phase 8](audits/2026-07-pre-phase-8-audit.md).
- [Frühes Phase-9-Audit](audits/2026-08-phase-9-audit.md), [realer Phase-9-Abschluss](audits/2026-08-phase-9-closing-audit.md).
- [Großbestandsvorprüfung 27. September](audits/2026-09-27-taxonomy-preflight.md).
- [Grundlagenlauf 28. September](audits/2026-09-28-taxonomy-baseline-run.md).
- [Bestandsdifferenz 29. September](audits/2026-09-29-taxonomy-difference.md).
- [Reguläres CoL-Update 3. Oktober](audits/2026-10-03-taxonomy-reference-update.md): produktiver Paarabschluss, ID-/Namens-/Projektlink-Erhalt und 187 konservative Zurückstellungen; kein Gesamtaudit.
