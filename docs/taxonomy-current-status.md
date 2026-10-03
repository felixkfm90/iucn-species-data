# Aktueller Taxonomie-Betriebsstand

Stand: 2026-10-03

Dieses Dokument ist der kompakte Einstieg für den heutigen lokalen Taxonomie-Betrieb. Die vollständigen
Freigaben, Datenvergleiche und historischen Laufberichte stehen im
[Reparaturvertrag](taxonomy-partial-source-recovery.md). Die [Roadmap](roadmap.md) bleibt maßgeblich für die
Reihenfolge der offenen Arbeiten; aktuelle Projekt-/Assetzähler stehen ausschließlich im
[generierten Projektstatus](project-status.md).

## Reguläres Quellenupdate technisch abgeschlossen – 3. Oktober

Der von Felix bestätigte lokale Folgeweg vom 3. Oktober ist um **09:11:14 MESZ** erfolgreich abgeschlossen:
Master und Lightroom-Suchpaket sind gemeinsam aktiviert, Service `completed` / nicht aktiv, kein offener
Kandidat, keine Fehler/Warnungen und keine blockierenden Konflikte. Die 30-Minuten-Wiedervorlage ist auf
Felix' Wunsch gelöscht. Die folgenden Reparatur- und Zwischenstände sind datierte Vorgeschichte.

| Ebene | Aktueller bestätigter Stand |
| --- | --- |
| Referenz und Master-CoL-Herkunft | `col-xr-2026-09-25-316441` (`COL26.9 XR`) |
| Master | `master-20261003055911210` |
| Lightroom-Suchpaket | `lightroom-fa739bd28ec1e82a0283`, aus demselben Master |
| Gemeinsame Veröffentlichung | `publication-b64beeb2-9951-4cf0-ac4e-1a326c5c3e91` |
| Erhaltener Vorgänger | Passendes Master-/Paketpaar vom 1. Oktober |
| Lightroom-Plug-in beim produktiven Update | `0.4.24.15`; heutiger Quellstand `0.4.24.17`, Bedienregressionskorrekturen noch gezielt praktisch zu prüfen |

Einmaliger unabhängiger lesender Vergleich bestanden: sämtliche 273.466 bisherigen IDs erhalten,
kein vorher aktiver Eintrag verloren; vier technische Ersatz-IDs weiter historisch. Alle 60 Projektlinks,
46 ausgewählten eigenen Felder, fünf Namenspräferenzen und 56 genutzten Lightroom-IDs erhalten.
Alle 273.476 Pakettaxa passen zu ihrem Master; kein aktives Mastertaxon fehlt.
1.995 unbenutzte Klassifikationen mit ursprünglicher ID verarbeitet; 187 unklare neue CoL-Gegenstücke
konservativ zurückgestellt. **Diese 187 Fälle sind kein Fehler und kein aktueller offener Entscheidungsauftrag.**
Bisherige Arten bleiben erhalten; geänderte Belege werden erneut geprüft.
Details, Methodik und Grenzen: [datierter Abschlussnachweis](audits/2026-10-03-taxonomy-reference-update.md).
Lightroom darf wieder geöffnet werden. Felix hat anschließend bestätigt: Weissstorch und Rebhuhn sind in
beiden Verbrauchern vorhanden und als bevorzugt markiert. Damit ist diese gezielte Suche-/Namensprüfung des
neuen Pakets bestanden; keine zusätzliche neue Fotozuweisung oder vollständige Bedienabnahme behauptet.
Als nächstes beauftragte Felix den automatischen Gesamtweg statt der heutigen manuellen Schrittfolge:
[Folgeauftrag und Abnahmekriterien](lightroom-catalog-usage.md#folgeauftrag-automatischer-gesamtweg-statt-manueller-erstaufnahmekette).

## Neue lokale Umsetzung nach diesem Abschluss

Neuester Folgeauftrag: Pages-Veröffentlichungsgrenze, SDK-sichere Orts-/Zeitentfernung, zusätzlicher unterer
Button sowie Auswahl-/Katalogexporte mit Defaultnamen in Plug-in 0.4.24.17. Felix bestätigt den zuvor
abgefragten Öffnungscheck, bewussten Statistik-Neuaufbau und eigene Kartenherkunftsänderungen.
Keine neue produktive Taxonomie-/Katalogaktion. [Befund und Nachweis](audits/2026-10-03-acceptance-regressions.md).

Implementierung f6834fc nach main übertragen; Pages 37147560397 vollständig erfolgreich (Linux-Gate,
Build und Deployment). Neues lokales Gesamtgate: 50 Gruppen, 1.120 gemeldete Tests, 420 Master- und
231 Lightroomtests. Die konkrete SDK-/Sichtabnahme von 0.4.24.17 bleibt offen; Datenbankpaar unverändert.

Plug-in **0.4.24.16** und gespeicherter Updatekoordinator verbinden die technische Kette nach einer Startbestätigung.
Bei offenem/verändertem Lightroom werden neue requestgebundene SDK-Quittungen angefordert. Normales Schließen
wird nur bestätigt und erst nach Erfassung angefordert; selbst schließen wird im Hintergrund erkannt.
Capture-to-close bleibt ausdrücklich einmalige Nutzervereinbarung, nicht unabhängig beobachtete Vollständigkeit.
Normale Anbieteränderungen an gewählten Namen/Hierarchie geschützter Arten fragen ebenfalls nach; unveränderte
Werte/Herkunftszeiten nicht. Die letzte vollständige bestätigte Feld-/Klassifikationsentscheidung setzt denselben
Auftrag automatisch fort. Abbruch, unbekannter Katalog, fremder Auftrag oder veraltete Bindung stoppt.

Zusätzlich korrigiert: falsche Orts-/Zeit-Entfernungszähler und Paketprüfung vor jedem 250er-Pflegeblock;
belegte wiederholbare Reste nach Speicherteilfehlern; getrennte Kartenherkunft/Pflege/Schutz ohne Umschreiben
realer Altmarkierungen. Automatischer IUCN-Abruf bleibt getrennte Einschränkung, kein neuer Download-Erfolg belegt.
Kein produktiver Aufbau, Paarwechsel, Kataloglauf oder Löschvorgang durch diese Umsetzung.
Praktische neue SDK-/Menü-/Kartenabnahme bleibt offen; [Umsetzungsvertrag](taxonomy-update-automation.md).

Automatisierter Abschluss der lokalen Umsetzung am 3. Oktober: vollständiges `quality:ci` mit Exit 0,
50 Testgruppen, darunter 420 Master-/Betriebs- und 214 Lightroom-/Pakettests. Separater Plug-in-Vertrag 15/15;
enge Reparatur/Feldschutz nach gefundener und korrigierter Statusregression 65/65. Keine Schutzprüfung gelockert.
[Datierter Umsetzungsnachweis](audits/2026-10-03-pre-audit-implementation.md) trennt die bestandenen Tests von
noch offener praktischer Abnahme, Veröffentlichung und Gesamtaudit.

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

Der Startdialog bietet `Jetzt aktualisieren` oder `Später`. Er und
**Datenbank-Aktionen → Taxonomiedatenbank → Datenbank aktualisieren** verwenden jetzt denselben bestätigten
Updateweg: Quellen vorbereiten, Master aufbauen/prüfen und passendes Lightroom-Paket gemeinsam übernehmen.
Der Quellenimport allein meldet keinen Gesamtabschluss. Vorhandene Aufträge, Kandidaten und eigene Vormerkungen
haben Vorrang; ihre ausdrücklich beschriebene lokale Verarbeitung lädt keine neuen Anbieterstände. Offene
Konflikte stoppen die Übernahme. Frische Statusabfragen müssen den passenden Master-/Paketstand bestätigen.
Die Implementierung ist automatisiert geprüft; praktische Gesamtabnahme und Startfreigabe sind getrennt.

**Früher Fehlversuch am 2. Oktober:** Felix startete den regulären Quellenlauf um 19:34:35 MESZ. Der API-Export
lieferte HTTP 404; Abbruch schon beim Quelldownload, kein Masteraufbau gestartet. Die bisherige Referenz und das
passende Master-/Lightroom-Paar oben blieben aktiv. Die falsche Anzeige `Schritt 4 · Master prüfen · Abschluss`
stammte aus dem alten fertigen Auftrag; sie ist nun auf tatsächliche Quellenphase/Fehlerursache korrigiert.
Der API-Download erhält einen eng gebundenen Ersatz über das offizielle datierte XR-ColDP-Monatsarchiv, nur bei
404 und passenden Releasefeldern. Keine geänderten Größen-, Import-, Identitäts- oder Aktivierungsschutzregeln.
145 gezielte Wartungs-/Anzeige-/Sicherheitstests erfolgreich; echtes Archiv nur per HEAD und vier ZIP-Bytes
lesend bestätigt. Kein vollständiger Download oder Wiederholungsstart durch die Korrektur selbst. Details/Grenzen im
[Updatevertrag](taxonomy-reference-update.md#früher-downloadabbruch-und-enge-korrektur-am-2-oktober).

**Zwischenstand des Folgeversuchs am 2. Oktober:** Felix startete nach normalem Explorer-Neustart um 19:53:14 MESZ erneut. Die Referenz
`col-xr-2026-09-25-316441` ist importiert. Lesender API-Befund nach Kandidatenabschluss um 21:10:14 MESZ:
Auftrag `job-b7795544-1758-464f-baaf-66c7ed6f32db` und Kandidat `master-20261002182254600` sind `ready`,
ohne technischen Aufbaufehler. Die Übernahme ist bei Schritt 4/7 gesperrt: 2.182 offene Klassifikationen,
davon 1.995 passende iNaturalist-ID-Verweise und 187 unklare Fälle (6 abweichend, 2 mehrdeutig, 179 ohne Verweis).
Dies sind neue Mengen dieses Releases, nicht die historischen 2.173 beziehungsweise 1.693/480.
Der aktive Master enthält noch `col-xr-2026-08-26-316165`; das bisherige Master-/Lightroom-Paar bleibt bis zum
erfolgreich geprüften gemeinsamen Wechsel aktiv. Dieser Zwischenstand ist kein Gesamtabschluss und kein
Nachweis eines erneut beschädigten Paars. Offene Entscheidungen weiterhin nur nach frischer Vorschau und
Felix' Bestätigung; keinen parallelen Aufbau, zusätzlichen Download oder Dienstneustart auslösen.

Separater ID-Befund: Das Kandidatenmanifest meldet eine fehlende bisherige ID für `Storchodon cingulatus`.
Gezielte, nur lesende Namens-/Quellenabfragen bestätigen im aktiven Master
`mtx_6bbad0b4ee45cbfbde46c3c87b22292c` mit leerem Reich und GBIF-Kennung `181179893`, im Kandidaten dagegen
`mtx_f62f1980849cd4c78995ace17d089602` mit `Animalia`, neuem CoL-Beleg und derselben GBIF-Kennung.
Keine Projektverknüpfung für diesen Eintrag; Lightroom-Nutzung nicht geprüft. Die Aktivierungsprüfung verbietet
den ungeklärten ID-Verlust unabhängig von Klassifikationsentscheidungen. Der technische Fehler ist inzwischen
isoliert reproduziert und im Kandidatenaufbau korrigiert: bei eindeutiger Ergänzung eines bisher leeren Reichs
und fortbestehender gleicher Anbieterkennung bleibt die alte aktive ID erhalten, auch bei späteren Updates.
Rohbelege, eigene Namen und Projektlinks bleiben getrennt erhalten. Keine Namensheuristik oder bekannte
Reichsänderung; Kontinuitätssperre unverändert. Kein produktiver Folgeaufbau oder geändertes Identitätsereignis.
Der vorhandene gesperrte Kandidat ist weiterhin unverändert, nicht durch normale Konfliktbestätigung freigeben.

Felix möchte anschließend nur bei angelegten beziehungsweise Lightroom-zugewiesenen Arten Rückfragen.
Nutzungsabhängige Automatik seit 3. Oktober implementiert; echte Erstaufnahme und Gesamtbestätigung inzwischen
durch Felix durchgeführt. Der Statistikindex
liegt katalogintern; die vorhandene Artänderungs-Rücklesung ersetzt keinen vollständigen Nachweis. Felix bestätigte ausdrücklich
alle seine FN-Kataloge, nicht nur den aktuell geöffneten. Anschließend bestätigt: nur
`D:\Lightroom Katalog\Lightroomkatalog aktuell.lrcat`; historische Altstände bleiben außerhalb dieser aktiven
Nutzungsmenge. Gespeicherte SDK-Quittung: 128.871 Fotos, 5.484 FN-Zuweisungen, 56 genutzte IDs; Erfassung
07:40:53 und Gesamtbestätigung 07:42:24 MESZ am 3. Oktober. Unbekannte Nutzung darf nicht als unbenutzt gelten;
IDs und eigene Entscheidungen bleiben geschützt. Plug-in **0.4.24.15** ergänzt eine ausdrückliche Erfassung
mit zwei SDK-Lesedurchgängen; anschließend Lightroom schließen und alle Kataloge im Explorer bestätigen.
Unbenutzte passende Fälle und unklare Gegenstücke werden gemeinsam vorgemerkt, nicht sofort aktiviert.
Projektarten, genutzte IDs und eigene Entscheidungen bleiben zur Rückfrage geschützt. Geöffneter/geänderter
Katalog oder fehlende Grundlage sperren die Automatik. Keine inkrementelle SDK-Fortschreibung zugesagt;
Lesende Vorschau mit voller Katalogprüfsumme und aktuellen Projekt-/Namensgrundlagen bestätigt:
1.995 unbenutzte passende Fälle, 187 unbenutzte unklare Gegenstücke und keine geschützte Überschneidung
innerhalb dieser Klassifikationsgruppe. Keine Vormerkung durch die lesende Prüfung.
Anschließend hat Felix den gemeinsamen Updateweg bestätigt: um **07:52:59 MESZ am 3. Oktober** wurden
alle 2.182 Fälle atomar vorgemerkt und der lokale Folgeaufbau gestartet. Vormerkungsrevision:
`8aba3cdd302211c0f252971e8f00cf7505bfc87b7fdcc2c149b090512226b74b`.
Erster bestätigter Zwischenstand: `building`, `active: true`, `Eingangsstand sichern`, keine Fehler.
Der noch sichtbare alte Kandidat und dessen 2.182 Konflikte sind kein erneuter Entscheidungsauftrag.
Nicht erneut starten, keine gebundenen Eingänge/Regeln ändern und Explorer nicht neu starten.
Der geöffnete Updateweg übernimmt Master und Paket nur bei erfolgreichen Schutzprüfungen.
Diese Startgrenze ist inzwischen erfüllt: Gesamtabschluss und einmaliger lesender Paarvergleich am
3. Oktober um 09:11:14 MESZ beziehungsweise danach bestanden; Lightroom darf wieder geöffnet werden.
Bedienung und Frischegrenzen: [FN-Katalognutzung](lightroom-catalog-usage.md).
Bestätigte Vorgaben im [Updatevertrag](taxonomy-reference-update.md#nutzungsabhängige-automatik--auftrag-nach-dem-ersten-prüfkandidaten).
Automatisierte Prüfung: 281 gezielte Aufbau-/Paket-/Identitäts-/Bedientests und die vollständige
Lightroom-Testgruppe mit 170 Tests erfolgreich; nach zusätzlichem Paarwechsel-Gegenfall 95 gezielte Tests
erneut erfolgreich. Testmengen überschneiden sich. Syntax (360 Dateien), Stil, 71 Markdown-Verweise,
Projektstatus und Diffprüfung bestanden. Kein vollständiges `quality:ci` oder Pages-Nachweis dieser Änderung.
Die am früheren Entscheidungshalt pausierte 30-Minuten-Wiedervorlage wurde für diesen bestätigten lokalen
Folgeaufbau reaktiviert und nach erfolgreichem Gesamtabschluss auf Felix' Wunsch gelöscht.
Keine zusätzliche Aufbau-/Aktivierungsroute durch die Begleitung, keine Bereinigung oder Veröffentlichung.

Die obere Schaltfläche ist separat vereinfacht: `Datenbank-Update`, darunter beispielsweise
`3/7 Master aufbauen · 32 %`. Die gemessene Unterphase wird im Dialog/Tooltip weiterhin vollständig erklärt.
84 gezielte UI-/Vertragstests bestanden. Noch keine Sichtprüfung im geöffneten Explorer; neuer Text erst nach
normalem Laden der Oberfläche. Aufbau und Eingänge wurden durch die Anzeigeänderung nicht verändert;
der spätere entscheidungsabhängige Halt ist davon getrennt.

Für die aktuelle Abnahme wurde `Später` empfohlen. Kein `COL26.9 XR`-Download, weiterer Masterlauf oder
katalogweiter FN-Abgleich wurde für diese Dokumentation gestartet. Das bezeichnet die frühere Reparaturabnahme,
nicht die anschließend von Felix bestätigten regulären Quellenversuche.

## Was nach dem technischen Updateabschluss vor dem Audit offen bleibt

- Den von Felix beauftragten automatischen Gesamtweg umsetzen: FN-Nutzungsnachweis und technische
  Phasenübergänge ohne die heutigen wiederholten manuellen Aktionen, fachliche Rückfragen nur bei relevanten
  Änderungen an Projekt-/zugewiesenen Arten und eigenen Daten. Die gezielte Suche-/Namensprüfung ist bestätigt;
  Vollautomatik noch nicht implementiert. Technische Fehler oder unbekannte Nutzung nicht als Freigabe behandeln.
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
werden. Unentschiedene Fälle/andere Konflikte bleiben gesperrt. Die vierte Stufe vereinheitlicht inzwischen
Startangebot und manuelle Datenbank-Aktion; der praktische vollständige Updateweg ist noch gesondert abzunehmen.
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
Der [Pages-Lauf für die Korrektur `265032f`](https://github.com/felixkfm90/iucn-species-data/actions/runs/37020500536)
ist vollständig erfolgreich, einschließlich Linux-Qualitätsgate, Build und Deployment.

## Gemeinsamer Update-Einstieg am 2. Oktober

Startangebot, manuelle Datenbank-Aktion und alter Referenz-Updatebutton delegieren an denselben Controller.
Gemeinsame Sperre bereits während der Rückfrage, frische Status-/Quellenvorschau, bestehende serverseitige
Token-/Prozessprüfung und frischer Paketabschluss verhindern doppelte Starts und verfrühte Erfolgsmeldungen.
Gestoppte oder fehlgeschlagene Vorgänge sowie offene Entscheidungen führen nicht zur Paaraktivierung.
Nach Quellenwechsel setzt ein späterer bestätigter Klick lokal fort, ohne denselben Release erneut zu laden.

Die Verkettung der Phasen läuft weiterhin im geöffneten UI, nicht in einem neuen dauerhaften Serverauftrag.
Schließen zwischen Phasen löst nach Wiederöffnen keinen unbestätigten Folgelauf aus; vorhandener Drift und
gespeicherte Aufträge bleiben über den bestätigten lokalen Weg behandelbar. Keine Zusage eines unbeaufsichtigten
Gesamtdurchlaufs über App-/Dienstneustarts. Details: [Updatevertrag](taxonomy-reference-update.md).

201 gezielte Tests in 15 Dateien erfolgreich, einschließlich echter Hilfsprozesse und Paket-/Klassifikationswege;
zuvor 67 UI-Tests in drei Dateien und anschließend alle 76 Wartungstests erfolgreich (überlappende Testmengen).
Syntax (357 Dateien), Stil, Dokumentationsverweise, Projektstatus und Diffprüfung bestanden.
Kein vollständiges lokales Qualitätsgate, produktiver Quellenlauf, praktische Gesamtabnahme oder
Phase-10.5-Audit. Lua-Version unverändert `0.4.24.14`; Veröffentlichung dieses Schritts separat prüfen.

Veröffentlichung inzwischen bestätigt: [Pages-Lauf `37040327369` für `c1f586b`](https://github.com/felixkfm90/iucn-species-data/actions/runs/37040327369)
vollständig erfolgreich, einschließlich Linux-Qualitätsgate, Build und Deployment.

## Vorbereitung des nächsten Quellenlaufs

Lesende Prüfung am 2. Oktober um 19:28 MESZ bestätigt anhand kleiner gespeicherter Dateien weiterhin dieselbe
Referenz-/Master-/Paket-Herkunft und einen eingetragenen passenden Vorgänger. Letzter Auftrag `ready`, dessen
Kandidat bereits veröffentlicht; vier Reparaturentscheidungen im aktiven Master berücksichtigt, keine neue
Klassifikationsvormerkung im gespeicherten Register. Rund 93,83 GiB frei auf C:; bestehende dynamische Platzprüfung
bleibt erforderlich. Keine erneute Datenbank-/Integritäts-/Vollhashprüfung und keine produktiven Daten geändert.

Der Explorer-Dienst war nicht erreichbar. Der Versionscache vom Vortag meldet `COL26.9 XR`; keine heutige
Anbieterabfrage oder frische API-Vorschau. Der konkrete [Updateplan](taxonomy-reference-update.md#nächster-produktiver-quellenlauf-vorbereiteter-plan-noch-keine-startfreigabe)
ist dokumentiert, aber nicht freigegeben. Nächster Schritt: Explorer öffnen und frische Rückfrage ohne
Bestätigung prüfen. Historische 2.173 beziehungsweise 1.693/480 Fälle sind keine Sollmengen des neuen Releases.
Bei offenen Klassifikationen braucht der erste Prüfkandidat nach beiden Bündelentscheidungen einen lokalen
Folgeaufbau; zwischen den zwei Rückfragen kein zusätzlicher Aufbau. Keine automatische Migration oder Bereinigung.

Anschließend öffnete Felix den Explorer und bestätigte den sichtbaren vollständigen Rückfragetext für `COL26.9 XR`,
ohne Startbestätigung. Lesende API-Prüfung um 19:31 MESZ: kein laufender Vorgang, offener Kandidat, Referenzdrift
oder offene eigene Vormerkung; fünf eigene Korrekturen aktiv, Lightroom-Paket `current`, Rückweg verfügbar.
Frischer Versionscheck vom 2. Oktober um 19:29 MESZ bestätigt den verfügbaren/nicht installierten Release.
Startvorbereitung praktisch bestätigt. Nächster Schritt nur nach ausdrücklicher Startentscheidung; bislang kein
Quellen-/Aufbau-/Paarlauf gestartet. Historischer Vorbereitungsstand vor Felix' anschließendem Start; dessen
Downloadabbruch und heutiger nächster Schritt sind oben festgehalten.
