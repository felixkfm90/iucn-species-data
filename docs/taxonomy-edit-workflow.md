# Kontrollierte Taxonomiebearbeitung

Stand: 2026-10-10

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

## Frühere Taxonomiebearbeitungen auswählen

`Bearbeitungsstände` bei der gewählten Art zeigt zusätzlich die vorhandenen Sicherungen ihrer
Taxonomiebearbeitung. `Stand prüfen` zeigt die konkrete Vorschau. `Stand wiederherstellen…` öffnet die
Bestätigung; erst deren `Stand wiederherstellen` übernimmt den Stand. Die damaligen manuellen Werte der sechs Ränge
werden als Override übernommen; die heutige automatische Vergleichsbasis bleibt erhalten. Der Änderungsgrund
kennzeichnet den gewählten Sicherungszeitpunkt und übernimmt den damaligen Grund.

War der gewählte Stand ohne manuellen Override, nimmt die Vorschau den heutigen Override zurück und verwendet
die heutige automatische Vergleichsbasis. Damalige automatische Taxonomiewerte werden dabei nicht eingespielt.
Die Vorschau erklärt diese Unterscheidung. Ist die Taxonomie bereits automatisch, gibt es keinen Override
zurückzunehmen. Ältere vollständige `speciesData-taxonomy`-Sicherungen ohne verlässlichen Override-Nachweis
werden mit Begründung angezeigt und können über diese Auswahl nicht übernommen werden.

Auch wenn die sichtbaren Taxonomiewerte gleich bleiben, zeigt die Vorschau den Wechsel zwischen manueller
und automatischer Pflege sowie einen geänderten Grund. Eine reine Änderung dieser Pflegeangaben schreibt
keine unveränderten generierten Taxonomiewerte erneut.

Andere Arten, Artidentität und Medien bleiben erhalten. Fremde gültige Taxonomieeinzelstände erscheinen nicht
in dieser Art-Auswahl. Beschädigte, widersprüchliche oder verknüpfte Dateien sind gesperrt. Vor dem ersten
Schreiben werden Sicherungsinhalt und heutige Quelldateien erneut gegen die Vorschau geprüft; außerdem wird der
heutige Originalstand gesichert. Eine Übernahme startet keine Pipeline oder Veröffentlichung und erweitert
keine Aufbewahrung. Ein Dateizugriffsfehler kann auch die automatische Rückschreibung verhindern; der angelegte
Originalstand bleibt dann der Rückweg.

Die Auswahl verwendet `GET /api/species/:id/backups`, `POST /api/species/:id/backups/preview` und
`POST /api/species/:id/backups/restore`. Die beiden Schreibanfragen benötigen den geschützten Explorer-Kontext;
der Restore akzeptiert ausschließlich die gebundene Vorschau. Laufende Pipeline-, Sicherungs-, Medien- oder
Artanlagenvorgänge verhindern die Übernahme.

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
