# AGENTS.md – Arten-Explorer, Lightroom und Wildlife-Website

Stand: 2026-10-08

## Aktueller Auftrag

Felix hat am 8. Oktober das Gesamtaudit in diesem neuen Hauptarbeitschat ausdrücklich gestartet.
Auftrag, Arbeitsgrenzen, Entscheidungen, laufende Befunde und Abschluss stehen ausschließlich im
[Gesamtauditauftrag Phase 10.5](docs/audit-auftrag-phase-10-5.md). Keine zweite Audit-, Manifest- oder
Übergabedatei anlegen. Dieser Chat bleibt nach dem Audit Hauptarbeitschat; weitere Arbeiten nur auf
Felix' Auftrag. Vorbereitungsfreigaben sind historische Nachweise, keine neue Betriebs-/Veröffentlichungsfreigabe.

## Projekt und führende Quellen

- Arbeitsort: `D:\Arten-Explorer`; Repository `felixkfm90/iucn-species-data`, Branch `main`.
- Gemeinsamen Datenpfad frisch über `storage-path.json` und `storage-paths.mjs` lesen.
- [Dokumentationsübersicht](docs/README.md) trennt aktuelle Verträge und historische Nachweise.
- [README](README.md) erklärt Installation und Bedienung; [Roadmap](docs/roadmap.md) den aktuellen Arbeitsstand.
- [Taxonomie-Betriebsstand](docs/taxonomy-current-status.md) ist der kompakte fachliche Einstieg.
- [Projektstatus](docs/project-status.md) ist die einzige Quelle aktueller Arten-/Assetzähler und Pflegelisten.
- [Dokumentationsregeln](docs/documentation-lifecycle.md) legen Zuständigkeiten und Abschlussgrenzen fest.

## Arbeitsweise bei späteren Einzelaufträgen

Immer nur den konkret beauftragten Punkt bearbeiten. Nutzeränderungen erhalten; historischen Arbeitsserien
keine neue Handlungserlaubnis entnehmen. Geprüfte Tatsachen, Nutzerbestätigung, automatisierte Gegenprobe,
native Beobachtung und offene Grenze getrennt berichten. Reproduzierbare Fehler vor einer Korrektur belegen.

Dateizuständigkeiten vor parallelen Änderungen verteilen. Zentrale Dokumente integriert bearbeiten;
keine konkurrierenden produktiven Aufbauten oder Großscans. Neue Tests und Messungen in den eigenen
Programm-temp-Sitzungen nach [Testvertrag](docs/test-temp-contract.md); gebundene Belege sind dauerhaft.

## Code- und Dokumentationspflicht

- Fachlogik in die vorhandene Modulgrenze einordnen; `server.mjs` und `public/app.js` sind Kompositionswurzeln.
  [Strukturvertrag](docs/repo-structure.md) und passende Fachverträge beachten.
- Kein Schritt ist abgeschlossen, solange betroffene Bedien-/Betriebsdokumente widersprüchlich sind.
  README, AGENTS und Roadmap sind knappe Einstiege; Detailregeln nur in ihrem führenden Vertrag pflegen.
- Historische Prüfberichte unverändert lassen. Die früheren langen Root-Verläufe bleiben vollständig im
  Git-Stand `d233bba3b89b4e81705fe9f6ba1edd53fd86f617` erhalten; fachliche Nachweise unter `docs/audits/`.
- `docs/project-status.md` ausschließlich mit `npm.cmd run status:sync` erzeugen; aktuelle Zähler nicht kopieren.
- Bei öffentlichen JavaScript-/CSS-Änderungen `docs/squarespace-footer.html`, Cacheversionen und
  `docs/squarespace-custom.css` gegen den tatsächlich geladenen Squarespace-Stand prüfen.
- Bei jeder Plug-in-Dateiänderung Version in `Info.lua` erhöhen, `PluginInfoProvider.lua`, Vertragstest und
  aktuelle Doku synchronisieren. Quellstand und tatsächlich geladenen Lightroom-Stand getrennt feststellen.
- Passende Verhaltenstests ausführen; bei Dokuänderungen lokale Verweise prüfen. Vollständiges Gate nach
  Änderungsbreite und Phasenauftrag, keine reine Textprüfung als Funktionsabnahme.
- Abschluss nennt Erklärung, `git diff --stat`, betroffene Dateien, Versionen, Tests und verbleibende Grenzen.
  Commit/Push und Deployment nur innerhalb der aktuellen Freigabe.

## Technische Betriebsgrenzen

Node 24 ist erforderlich (`node:sqlite`). Öffentliche Medienprüfung braucht FFmpeg; lokaler Resolver und
Linux-CI stellen das vorhandene Werkzeug bereit. Keine Zugangsdaten hardcoden oder ausgeben.
Squarespace liest öffentliche Root-Module und Artassets über
[GitHub Pages](https://felixkfm90.github.io/iucn-species-data/); bestehende URLs/Assetnamen nicht nebenbei ändern.
`graphics/catagory/Alternativ/` ist ein gebundener Livepfad. Pages verwendet die kontrollierte Positivliste
und `.github/workflows/pages.yml`, keinen ungefilterten Checkout als Artefakt.

Spezifische Betriebs-/Rücknahme-/Schutzregeln stehen in den Fachverträgen und für das laufende Audit
vollständig im Auditauftrag. Keine pauschale Bereinigung aus `.gitignore`, Dateialter oder fehlendem Textverweis ableiten.
