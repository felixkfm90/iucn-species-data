# Lebenszyklus der Projektdokumentation

Stand: 2026-07-18

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
4. Erst danach committen und veröffentlichen.

Der GitHub-Actions-Quality-Job führt `status:check` vor jedem Pages-Build aus. Ein veralteter Projektstatus blockiert
damit die Veröffentlichung.
