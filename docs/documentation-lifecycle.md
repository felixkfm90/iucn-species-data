# Lebenszyklus der Projektdokumentation

Stand: 2026-08-27

Diese Regeln verhindern, dass aktuelle Zähler, aktive Pflegelisten und historische Projektstände wieder
widersprüchlich an mehreren Stellen gepflegt werden.

## Verbindliche Quellen

- `docs/project-status.md` ist die einzige dokumentarische Quelle für aktuelle Zähler sowie aktive Listen zu
  manuellen Karten, NC-Sounds und bewusst fehlenden Tierstimmen.
- Die Datei wird nicht manuell bearbeitet. `npm.cmd run status:sync` erzeugt sie aus dem Explorer-Modell und den
  produktiven Dateien; `npm.cmd run status:check` vergleicht den gespeicherten Stand exakt mit den Quelldaten.
- `AGENTS.md` enthält Arbeitsregeln, Architektur, aktuelle Blocker und die kompakte Projektübergabe.
- `README.md` beschreibt Installation, Bedienung und Betrieb.
- `docs/roadmap.md` beschreibt Gegenwart, nächste Schritte und Priorisierung.
- `docs/taxonomy-source-decision.md` ist die verbindliche Quellen-, Prioritäts- und Konfliktentscheidung für
  Phase 9.1. Änderungen an der globalen Taxonomiestrategie müssen dort und im Phase-9-Plan gemeinsam dokumentiert
  werden.
- `docs/local-taxonomy-database-design.md` ist die verbindliche Speicher-, Schema-, Such-, Import- und
  Rollbackarchitektur für Phase 9.2. Änderungen an lokaler Taxonomiedatenbank, Reichsauswahl, Autocomplete,
  Animalia-Fallback oder Referenzdatenpfaden müssen dort und im Phase-9-Plan gemeinsam dokumentiert werden.
- `docs/taxonomy-import-prototype.md` dokumentiert Implementierung, Fixture, Messwerte, Tests und Grenzen des
  begrenzten Phase-9.3-Prototyps. Produktive Integrationen dürfen daraus erst nach dem Bedien- und API-Entwurf in
  Phase 9.4 abgeleitet werden.
- `docs/taxonomy-explorer-integration.md` ist der verbindliche Bedien-, API-, Fehler- und Übernahmevertrag der
  read-only Taxonomiereferenz im Neue-Art-Assistenten aus Phase 9.4.
- `docs/taxonomy-master-database-design.md` ist der verbindliche Daten-, Quellen-, Zusammenführungs-, Konflikt-,
  Aktivierungs-, Rollback- und Betriebsvertrag der Phase-9-Masterdatenbank aus 9.6 bis 9.12.
- `docs/audits/2026-08-phase-9-audit.md` ist eine unveränderliche historische Aufnahme des am 1. August geprüften
  kleinen Masterbestands. Nach dem erweiterten realen Aufbau aus CoL, breitem iNaturalist-Lücken-/Namensbestand,
  GBIF, WoRMS, Wikidata, kontrolliertem Animalia-Fallback und eigenen Korrekturen war ein neues umfassendes
  Phase-9-Abschlussaudit erforderlich.
- `docs/audits/2026-08-phase-9-closing-audit.md` ist der maßgebliche Abschlussbericht für den real aktivierten
  breiten Masterbestand und die Freigabe von Phase 9.
- `docs/lightroom-feasibility-study.md` ist die verbindliche Phase-10.1-Entscheidung zu SDK-Grenzen,
  Produktvergleich, Datenzugriff, Metadatenmodell, MVP-Umfang und ausdrücklich verschobenen Funktionen.
- `docs/lightroom-search-package.md` ist der verbindliche Phase-10.2-bis-10.4-Vertrag für Suchpaket, Suchhelfer,
  Lua-Plug-in, Lightroom-Stichwörter, Plug-in-Metadaten, Mehrfachzuweisung, Konfliktsperre, Rollback und die
  praktisch geprüften Bedienabläufe. Phase 10 bleibt bis zum umfassenden Abschlussaudit offen.
- Thematische Detaildokumente erklären jeweils genau einen fachlichen oder technischen Ablauf.

## Historische Dokumente

- Datierte Berichte unter `docs/audits/` sind unveränderliche Zeitaufnahmen. Ihre Zahlen werden nicht nachträglich
  auf den aktuellen Projektstand umgeschrieben.
- Abgeschlossene Planungs- und Verlaufsdokumente erhalten am Anfang einen sichtbaren Hinweis mit Verweis auf die
  heute maßgeblichen Dokumente.
- Historische Zahlen dürfen in einem ausdrücklich datierten Verlauf stehen, aber nicht als „aktueller Stand“
  formuliert sein.

## Pflicht bei künftigen Änderungen

1. Der Arten-Explorer führt vor seinen automatischen Pipeline-, Karten-, Sound- und Portrait-Veröffentlichungen
   `status:sync` selbst aus und nimmt `docs/project-status.md` in denselben Commit auf. Nach manuellen Änderungen
   außerhalb dieses Ablaufs `npm.cmd run status:sync` ausführen.
2. Die fachlich betroffenen Dokumente aktualisieren; keine aktuellen Zähler in README oder AGENTS kopieren.
3. Bei Dokumentänderungen `npm.cmd run --silent check:docs` ausführen.
4. `npm.cmd run status:check` beziehungsweise `npm.cmd run quality:ci` ausführen.
5. Erst danach committen und veröffentlichen.

## Pflicht am Ende jeder großen Phase

Keine große Projektphase gilt als abgeschlossen, bevor ein umfassendes Abschlussaudit durchgeführt, dokumentiert
und bereinigt wurde. Das Audit umfasst mindestens:

- Codequalität, Verantwortungsgrenzen, Modularisierung und vermeidbare Doppelungen
- Datenmodell, Schema, Migrationen und Rückwärtsverträglichkeit
- Ordnerstruktur, ungenutzte Dateien sowie temporäre Arbeits- und Build-Artefakte
- Dokumentationsstand, Widersprüche, lokale Verweise und aktuelle Betriebsabläufe
- automatisierte Tests, vollständiges Qualitätsgate und den produktiven Veröffentlichungsweg
- Backup, Wiederherstellung und betrieblich relevante Fehlerszenarien

Gefundene Punkte werden innerhalb der Phase behoben oder mit Begründung, Zielphase und überprüfbarem
Abnahmekriterium in `docs/roadmap.md` verschoben.

Der GitHub-Actions-Quality-Job führt `status:check` vor jedem Pages-Build aus. Ein veralteter Projektstatus blockiert
damit die Veröffentlichung.
