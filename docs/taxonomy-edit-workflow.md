# Kontrollierte Taxonomiebearbeitung

Stand: 2026-07-22

Der Arten-Explorer kann die automatisch geladenen Taxonomiewerte kontrolliert korrigieren, ohne die nächste
Datenpipeline gegen die manuelle Entscheidung arbeiten zu lassen.

## Bearbeitbare Ränge

- Reich
- Stamm
- Unterstamm, optional
- Klasse
- Ordnung
- Familie

Gattung und Art werden nicht in diesem Dialog bearbeitet. Sie gehören zum bestehenden Ablauf für die Änderung des
wissenschaftlichen Namens, weil daran URL-Slug, Artidentität und weitere Metadaten hängen.

## Ablauf im Explorer

1. Im Bearbeitungsmodus im Bereich `Taxonomie` auf `Bearbeiten` klicken.
2. Gewünschte Werte ändern und einen nachvollziehbaren Änderungsgrund angeben.
3. Mit `Änderungen prüfen` die Diff-Vorschau erzeugen.
4. Mit `Jetzt speichern` die geprüften Werte lokal übernehmen.
5. Die lokalen Änderungen gesammelt über `Änderungen übertragen` committen und pushen.

Bei einer bereits manuell bearbeiteten Taxonomie kann `Automatische Werte wiederherstellen` gewählt werden. Auch
dieser Vorgang läuft über Vorschau und Speichern.

## Datenmodell

`species-taxonomy-overrides.json` speichert ausschließlich manuelle Abweichungen und den zuletzt bekannten
automatischen Ausgangsstand. `speciesData.json` enthält weiterhin die für Explorer und Website wirksamen Werte.
Vor dem Schreiben legt der Explorer eine lokale Sicherung an.

Bei späteren Pipeline-Läufen wird zuerst der neue automatische Taxonomiestand synchronisiert und anschließend der
manuelle Override erneut angewendet. Dadurch bleibt eine bewusste Korrektur erhalten, während die automatische
Vergleichsbasis weiter aktuell bleibt.

Beim Umbenennen oder Löschen einer Art wird der zugehörige Override mitgeführt beziehungsweise entfernt. Die
Schema-, Bereinigungs- und Veröffentlichungsprüfungen berücksichtigen das Register ebenfalls.

## Sicherheitsgrenzen

- Ein Änderungsgrund ist Pflicht.
- Vorschauen sind zehn Minuten gültig.
- Vorschau und Speichern prüfen die Quell-Hashes erneut; parallele Dateiänderungen machen eine Vorschau ungültig.
- Der Unterstamm darf leer sein; leere andere Ränge werden abgelehnt.
- Die API-Routen lauten `POST /api/species/:id/taxonomy/preview` und
  `POST /api/species/:id/taxonomy/save`.

## Tests

- `npm.cmd run --silent test:taxonomy`
- `npm.cmd run --silent test:model`
- `npm.cmd run --silent test:explorer-model`
- `npm.cmd run --silent test:explorer`
- `npm.cmd run --silent quality:ci`

Die Integrationstests decken Vorschau, Speichern, erneutes Anwenden und Wiederherstellen automatischer Werte ab.
