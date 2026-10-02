# Aktueller Taxonomie-Betriebsstand

Stand: 2026-10-02

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

## Plattformfehler im anschließenden Pages-Qualitätsgate

Der [GitHub-Lauf für `d7bcc76`](https://github.com/felixkfm90/iucn-species-data/actions/runs/36914212613)
scheiterte vor Build/Deployment an genau zwei CLI-Vertragstests: Die Ersatz-/Neustarttests verwendeten einen
festen Windows-Pfad für die Entscheidungsdatei. Unter Linux lehnt die unveränderte produktive
`path.isAbsolute`-Prüfung diesen Pfad korrekt ab. Der vorherige lokale Windows-Testlauf bleibt als solcher
erfolgreich; er war kein plattformübergreifender Nachweis. Build und Deployment wurden übersprungen.

Die drei CLI-Vertragstests verwenden nun absolute Testpfade aus dem temporären Verzeichnis des jeweiligen
Systems. Zusätzlich prüfen alle vier schreibenden CLI-Wege (`prepare`, `candidate`, `replacement-candidate`,
`restart-candidate`), dass relative Entscheidungsdateien und fehlende Bestätigung weiterhin abgewiesen werden.
Keine produktive Schutzregel, Reparaturdatenbank, Namenswahl, Fotozuweisung oder Plug-in-Version geändert.
Eine Korrektur der CI-Testdaten verlangt keinen erneuten produktiven Aufbau. Der GitHub-Linux-/Pages-Lauf
bleibt der gesonderte Nachweis für die Veröffentlichung.

Lokale Gegenprüfung der Korrektur: gesamte Reparatur-Testdatei mit 51 erfolgreichen Tests, darunter echte
Hilfsprozesse und alle drei CLI-Vertragstests; null Fehler/Abbrüche. Syntax, Stil, Dokumentationsverweise,
frisch synchronisierter Projektstatus und `git diff --check` erfolgreich. Nur Tests und diese Übergabe-/
Betriebsdokumentation geändert; das vollständige Linux-Qualitätsgate wird nicht umgangen.

Nachweis inzwischen bestätigt: [GitHub-Lauf für `bf953ae`](https://github.com/felixkfm90/iucn-species-data/actions/runs/36915759582)
mit erfolgreichem Linux-Qualitätsgate, Pages-Build und Deployment. Der CI-Fehler ist abgeschlossen.

## Regulärer Updateablauf: Vorprüfung am 2. Oktober

Die unterschiedlichen Start-/Datenbank-Einstiege und die fehlende fachliche Unterscheidung der abweichenden
CoL-/Reichsbeziehungen sind im Code und mit vier isolierten Datenbank-Gegenproben bestätigt. Sechs gezielte
Regressionstests erfolgreich. Felix beauftragte anschließend die gebündelte, bestätigungspflichtige Prüfung
unter Erhalt bisheriger IDs. Erste Stufe implementiert: vollständige CoL-ID-Verweise, vier Quellenkategorien,
gebündelte Übersicht und offene Aktivierungssperre für neue CoL-/Reichsgegenstücke bisheriger Referenzlücken.
Keine normale Feldentscheidung kann diese Prüfung umgehen. Zweite Stufe inzwischen implementiert:
gebundene Bündelvorschau und bestätigte Vormerkung passender Quellenfälle, erneuter Kandidatenbau mit
ursprünglicher ID, eigenen Namen/Projektlinks und unveränderten rohen Anbieterbehauptungen. Neue Vormerkung
startet keinen Aufbau oder Paketwechsel. Dritte Stufe inzwischen implementiert: separate bestätigte Zurückstellung
unklarer Fälle. Ein frischer Kandidat lässt ausschließlich die gebundenen neuen CoL-Gegenstücke aus, erhält
bisherige Arten/IDs und prüft geänderte Belege wieder offen. Beide Bündel können ohne Zwischenaufbau vorgemerkt
werden. Unentschiedene Fälle/andere Konflikte bleiben gesperrt. Der einheitliche Update-Einstieg ist noch offen.
Details und Grenzen: [regulärer Updatevertrag](taxonomy-reference-update.md).
Kein neuer Download, produktiver Aufbau, Zeigerwechsel, Katalogabgleich oder Bereinigung.
178 gezielte Tests in zehn Dateien erfolgreich; abschließende neun UI-Tests erneut bestanden. Syntax/Stil,
70 Markdown-Dateien ohne fehlende lokale Verweise, aktueller Projektstatus und Diffprüfung erfolgreich.
Echte Hilfsprozesse im erlaubten Gegenlauf geprüft, keine Windows-/Testregeländerung. Kein vollständiges
Qualitätsgate oder praktischer Bediennachweis für diese erste Stufe; Plug-in-Version unverändert `0.4.24.14`.

Prüfabschluss der zweiten Stufe: 215 gezielte Tests in 14 Dateien erfolgreich, einschließlich echter
Master-Hilfsprozesse, alter Reparatur-/Identitätswege, neuem Bündelregister und Lightroom-ID-Auflösung.
Synthetische 1.693-Fälle-Probe, Abbruch, veraltete Belege, Wiederholung, Schreibfehler, erneuter Aufbau und
Rollback geprüft; abschließende 36 Bündel-/UI-Tests in drei Dateien ebenfalls erfolgreich, einschließlich
geprüfter Eingangsgrundlage und vollständiger Übernahme von 104 passenden Fällen oberhalb der Listenbegrenzung.
Kein erneuter produktiver Vergleich und keine Freigabe des nächsten Quellenupdates.
Der [Pages-Lauf für die erste Stufe `ea55bb4`](https://github.com/felixkfm90/iucn-species-data/actions/runs/37009726984)
ist inzwischen mit Linux-Qualitätsgate, Build und Deployment erfolgreich.
Auch der [Pages-Lauf für die zweite Stufe `cca8268`](https://github.com/felixkfm90/iucn-species-data/actions/runs/37015180330)
ist vollständig erfolgreich. Das ist kein vorweggenommener Veröffentlichungsnachweis der dritten Stufe.

Prüfabschluss der dritten Stufe: 238 gezielte Tests in 14 Dateien mit Exit 0; null Fehler, Abbrüche oder
übersprungene Tests. Echte Hilfsprozesse, bisherige Reparatur-/Identitätswege und Lightroom-ID-Auflösung
eingeschlossen. Synthetische 480-Fälle-Probe, mehrere Vorgänger, 105 vollständige Zurückstellungen,
beide Bündelreihenfolgen ohne Zwischenaufbau, veraltete Belege, Fehler/Wiederholung, Fortsetzung und Rollback
geprüft. Neue CoL-Stände und unabhängige Zielbelege benötigen eine neue Entscheidung; später passende Fälle
lassen sich mit alter ID übernehmen. Syntax (356 Dateien), Stil, Dokumentationsverweise, aktueller Projektstatus
und Diffprüfung erfolgreich. Kein vollständiges Qualitätsgate oder produktiver Update-/Bedienlauf.

## Paket-Kompatibilitätsfehler nach der dritten Stufe

Der [Pages-Lauf für `2aad61e`](https://github.com/felixkfm90/iucn-species-data/actions/runs/37019314273) scheiterte
vor Build/Deployment an sechs Pakettests mit derselben Ursache: Die neue Zurückstellungsprüfung greift schon
beim Aufruf auf eine optionale Quellenübersicht zu, die im älteren/minimalen Paket-Testmanifest fehlt.
Gezielt auch unter Windows reproduziert; die allgemeine Ubuntu-Migrationsmeldung ist nicht die Ursache.
Die zuvor bestandenen 238 gezielten Tests enthielten diese Paket-Testdatei nicht und waren kein vollständiges
Qualitätsgate. Der neue Zugriff erhält die Altformat-Kompatibilität, ohne eine Zurückstellung ohne Quellenbeleg
freizugeben. Neue Regressionen prüfen beide Grenzen, einschließlich Aktivierungssperre bei fehlendem
Ausgangsmaster. 82 Tests in vier betroffenen Dateien sowie die gesamte Lightroom-Testgruppe mit 159 Tests
erfolgreich. Syntax, Stil, Dokumentationsverweise, Projektstatus und Diffprüfung bestanden;
keine produktiven Daten verändert.
Der neue GitHub-Linux-/Pages-Lauf ist der gesonderte Veröffentlichungsnachweis.
