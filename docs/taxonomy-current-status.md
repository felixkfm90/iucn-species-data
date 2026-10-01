# Aktueller Taxonomie-Betriebsstand

Stand: 2026-10-01

Dieses Dokument ist der kompakte Einstieg für den heutigen lokalen Taxonomie-Betrieb. Die vollständigen
Freigaben, Datenvergleiche und historischen Laufberichte stehen im
[Reparaturvertrag](taxonomy-partial-source-recovery.md). Die [Roadmap](roadmap.md) bleibt maßgeblich für die
Reihenfolge der offenen Arbeiten; aktuelle Projekt-/Assetzähler stehen ausschließlich im
[generierten Projektstatus](project-status.md).

## Reparatur abgeschlossen und gezielt praktisch abgenommen

Die enge Quellenreparatur und die gesondert bestätigte gemeinsame Master-/Lightroom-Aktivierung sind
abgeschlossen. Alle 154 ursprünglichen IDs sind wieder aktiv; die vier technischen Ersatz-IDs bleiben
historisch erhalten. Der unabhängige vollständige Paarvergleich ist erfolgreich. Eigene ausgewählte Felder,
Namenspräferenzen und Projektverknüpfungen bleiben erhalten; keine automatische Foto-/Projektmigration.

Felix hat anschließend alle drei praktischen Tests für Weissstorch und Rebhuhn bestätigt:

1. Bevorzugte Namen im Arten-Explorer stimmen mit Lightroom überein.
2. Lightroom-Zuweisung funktioniert ohne Fehler mit passenden Namen, Metadaten und FN-Stichwörtern.
3. Nach normalem Schließen/Wiederöffnen bleiben die Testzuweisungen erhalten und die Arten auffindbar.

Dies ist die gezielte Abnahme des Reparaturpunkts, nicht die Abnahme aller Lightroom-Funktionen oder der
gesamten Phase 10. Kein weiterer langer Aufbau oder katalogweiter FN-Abgleich zur Reparatur erforderlich.

## Installierter Stand und neue Anbieterversion sind getrennt

| Ebene | Bestätigter lokaler Stand am 1. Oktober |
| --- | --- |
| CoL-Referenz | `COL26.8 XR`, Release `col-xr-2026-08-26-316165` |
| Master | `master-20261001145513036` |
| Lightroom-Suchpaket | `lightroom-63c431a5fa43190a4c52`, vom selben Master abgeleitet |
| Gemeinsame Veröffentlichung | `publication-60f9b546-49ee-4c65-ada9-7b57b965b120` |
| Rückweg | Das vorherige passende Paar vom 28. September ist erhalten |
| Lightroom-Plug-in | `0.4.24.14`; keine Lua-Änderung für die Quellenreparatur |

Der Explorer hat beim Versionscheck am 1. Oktober `COL26.9 XR` vom 25. September als verfügbar gemeldet.
Die Startmeldung **„Taxonomiedatenbank ist veraltet“** bezeichnet diese neue Anbieterreferenz, nicht einen
Drift zwischen den installierten lokalen Komponenten. Referenz, Master und Paket des reparierten Paars passen
zusammen; eine Verfügbarkeitsmeldung allein verlangt keine erneute Reparatur.

Der Startdialog bietet `Jetzt aktualisieren` oder `Später`. Sein bestätigter Updateweg startet zunächst nur
die Referenz-/Ergänzungswartung. Der zusammenhängende Weg unter
**Datenbank-Aktionen → Taxonomiedatenbank → Datenbank aktualisieren** führt anschließend den Masteraufbau und
die gemeinsame Paketfreigabe aus. Diese unterschiedlichen Einstiege sind vor dem nächsten Quellenupdate
gemeinsam zu prüfen; die Dokumentation ersetzt keine Implementierungskorrektur oder neue Startfreigabe.

Für die aktuelle Abnahme wurde `Später` empfohlen. Kein `COL26.9 XR`-Download, weiterer Masterlauf oder
katalogweiter FN-Abgleich wurde für diese Dokumentation gestartet.

## Was vor dem nächsten Update beziehungsweise Audit offen bleibt

- Den regulären Quellenupdatevertrag einschließlich der 2.173 separaten CoL-/Reichsfälle prüfen. Diese Fälle
  sind nicht Teil des aktivierten Reparaturbestands. Gleiche Namen allein erlauben keine Zusammenführung,
  Reichsänderung oder ID-Migration. Das nächste Quellenupdate separat planen und freigeben.
- Die gebündelte Lightroom-Abnahme und die noch offenen Neue-Art-Regressionsabläufe durchführen; die
  bestätigten zwei Arten ersetzen keine umfassende Menü-, Orts-/Zeit-, Statistik-, Export- oder Migrationstestreihe.
- Produktive Pause/Fortsetzung, Wiederanlauf und Rollback bei geöffneten Verbrauchern sowie Speicherpflege,
  Fortschrittsanzeige und Leistungsgrenzen getrennt abnehmen. Die erfolgreiche Paaraktivierung ist kein
  vollständiger Download-/Rollback- oder Geschwindigkeitsnachweis.
- Den zuletzt vorgesehenen IUCN-Kartenabruf-/Pflegekennzeichnungs-Prüfpunkt vor dem Audit behandeln.
  Funktionierender Browserimport ist kein bestätigter automatischer Downloadfix.
- Qualitätsgate, Veröffentlichung und Dokumentationsstand prüfen und danach das Phase-10.5-Gesamtaudit
  durchführen. Ein bestandener lokaler Testlauf oder Push ist kein Nachweis eines erfolgreichen Pages-Deployments.

Keine bestehende Schutzmarkierung pauschal ändern, keine Altreleases bereinigen und keine zusätzlichen
Produktivläufe ohne ihren jeweiligen Auftrag starten. Die aufbewahrten alten Kandidaten, Fehleraufträge und
Originalquellen bleiben für Nachvollziehbarkeit und Rückwege erhalten.

## Dokumentations- und Veröffentlichungsprüfung am 1. Oktober

Felix beauftragte nach seiner praktischen Abnahme das Nachziehen der gesamten betroffenen Dokumentation und
Commit/Push der bislang unveröffentlichten Arbeitsserie. Die Übersicht verlinkt sämtliche thematischen
Dokumente; historische Audits/Messwerte bleiben erhalten. Keine neuen Quellen-/Katalog-/Bereinigungsaktionen.

Der lokale finale Lauf von `npm.cmd run --silent quality:ci` ist mit Exit 0 abgeschlossen: 50 Testgruppen,
810 gemeldete Tests, null Fehler/Abbrüche; Syntax-/Stil-/Schema-, Medien-/Audio-/Größen-, Projektstatus- und
lokale Websiteprüfung ebenfalls erfolgreich. Dokumentationsprüfung: 70 Markdown-Dateien ohne fehlende lokale
Verweise. Node.js 24.12.0 verwendet; Projektstatus frisch synchronisiert und geprüft. Der erste eingeschränkte
Versuch scheiterte an einer Prozessfreigabe (`spawn EPERM`); der vollständige Gegenlauf außerhalb dieser
Beschränkung bestand, ohne Testregeln oder Windows-Einstellungen zu ändern.

Squarespace-Footer/Custom-CSS, Lua-Plug-in und produktive Arten-/Assetdateien wurden durch diesen
Dokumentationsabschluss nicht verändert. Plug-in-Version bleibt 0.4.24.14. Das lokale Qualitätsgate ist kein
Phase-10.5-Gesamtaudit; ein erfolgreicher GitHub-Pages-Lauf bleibt nach dem Push gesondert nachzuweisen.
