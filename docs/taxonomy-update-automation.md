# Gespeicherter Gesamtweg für Taxonomie-Updates

Stand: 2026-10-31 · Update-Abschlussaktion bestätigt und lokal integriert; native Prüfung offen

Der aktuelle Update-/Paarstand steht im [Taxonomie-Betriebsstand](taxonomy-current-status.md);
das Gesamtaudit ist seit 27. Oktober im vereinbarten Umfang abgeschlossen. Abschluss und Grenzen führt
der [Auditauftrag, Abschnitt 10.55](audit-auftrag-phase-10-5.md#1055-lightroom-großprobe-und-gemeinsamer-abschluss--27-oktober).

## Historischer Update- und Wiederanlaufstand bis 23. Oktober

Dieser Vertrag ergänzt den [Quellenupdatevertrag](taxonomy-reference-update.md) und
[FN-Nutzungsnachweis](lightroom-catalog-usage.md). Der freigegebene lokale Ersatzauftrag
`update-337cbac5-9664-4c8f-af6f-1f5b4d09a57c` ist am **13. Oktober um 18:09:17 MESZ** vollständig
abgeschlossen: Master `master-20261013143021566` und Lightroom-Paket `lightroom-dd834fb15dbd6f1c3257`
sind gemeinsam aktiv, alle 273.480 vorherigen IDs erhalten. Das geprüfte Paar vom 3. Oktober ist sein
direkter Rückweg. Dieser Abschluss verlangt keinen weiteren Aufbau. Tatsächlicher Wiederanlauf,
Prüfgrenzen und aktueller Betriebsstand stehen im [Auditauftrag](audit-auftrag-phase-10-5.md#1024-freigegebener-realer-lokaler-wiederanlauf--11-und-12-oktober)
und im [Taxonomie-Betriebsstand](taxonomy-current-status.md).

Der zusätzliche reguläre Updateauftrag vom 23. Oktober hat die neue CoL-Referenz eingelesen, ist jedoch
an der erneuten Quellenprüfung alter Klassifikationen angehalten. Das Paar vom 13. Oktober bleibt aktiv.
Felix' neue Nichtnutzungs-/Schutzregel wird über einen eigenen Retentionsbeleg umgesetzt; sie ändert
keine früheren Rezepte oder Quittungen. Nach geänderten Aufbauregeln folgt ein frisch gebundener lokaler
Aufbau aus den schon vorhandenen Quellen. Die inzwischen erneut geöffneten Kataloge benötigen dafür
wieder einen aktuellen requestgebundenen Nutzungsnachweis und normalen Lightroomabschluss.
Details und tatsächlicher Ausführungsstand ausschließlich unter
[Auditauftrag, Abschnitt 10.51](audit-auftrag-phase-10-5.md#1051-fortsetzung-und-neues-col-update--23-oktober).

## Vorgemerkt: wählbare Abschlussaktion nach erfolgreichem Update

Felix ergänzt am 27. Oktober als To-do, bereits vor einer Datenbankaktualisierung festlegen zu können,
was nach ihrem erfolgreichen Abschluss geschieht. Dieses Vorhaben ist in der [Roadmap](roadmap.md) aufgenommen;
eine Abschlussautomatik ist damit noch nicht umgesetzt oder gestartet.

Felix bestätigt am 31. Oktober den Umfang: vier Aktionen und keine zusätzliche NAS-Sicherung als
Abschlussschritt. Die routinemäßige NAS-Sicherung behält ihren eigenen Zeitplan.

- Vor dem konkreten Updateauftrag zwischen **nichts tun**, **Explorer beenden**, **Computer
  herunterfahren** und **Computer neu starten** wählen können. Energiesparen und Ruhezustand gehören
  nicht zum ersten Umfang. Die Aktion betrifft den dafür eindeutig festgelegten PC, nicht das NAS.
- **Nichts tun** bleibt der sichere Standard. Die Auswahl an den konkreten Auftrag binden und vor
  der Auslösung erkennbar machen; eine vorgemerkte Systemaktion muss rechtzeitig abwählbar sein.
- Erst nach dem vollständig erfolgreichen Gesamtweg einschließlich geprüftem Master-/Suchpaketpaar
  auslösen. Ein bloß abgeschlossener Quellenimport, wartende Schritte, Fehler oder Abbruch reichen nicht.
- Vor Beenden oder Herunterfahren eigene Schreibvorgänge regulär abschließen. Keine erzwungene
  Prozessbeendigung oder Umgehung offener Speicherrückfragen anderer Programme vorsehen.
- Keine zusätzliche Sicherung vor der Abschlussaktion starten. Eine bereits laufende routinemäßige
  Sicherung bleibt im regulären Schließschutz berücksichtigt; ihr eigener Zeitplan wird nicht verändert.
- Spätere Abnahme: Auswahl vor Start, erfolgreicher Abschluss, Fehler/Abbruch und rechtzeitige Abwahl
  gezielt praktisch prüfen. Heute keine Datenbankaktualisierung oder Systemaktion für dieses To-do ausführen.

### Entscheidungsfreie technische Vorbereitung vom 28. Oktober

Felix beauftragt die Vorarbeiten vor der gemeinsamen Umfangsklärung. Lesend geprüfter Programmstand:
`97a1b68a2663e62e87c4fa473a917fe83a3f7ec5`. Keine neue Aktualisierung oder Systemaktion gestartet.

| Vorhandener Baustein | Bedeutung und Grenze für die spätere Umsetzung |
| --- | --- |
| `TaxonomyUpdateCoordinator.start()` | Speichert bereits einen konkreten `updateRunId` und bestätigten Startumfang. Noch keine Auswahl oder Quittung einer Abschlussaktion. |
| `assertPairCurrent()` und `finish()` in `taxonomy-update-coordinator.mjs` | Prüfen den gemeinsamen Quellen-/Master-/Suchpaketabschluss vor dem gespeicherten Zustand `completed`. Ein Quellenimport oder ein bloßer UI-Prozentwert ist kein Gesamterfolg. |
| Gespeicherte Warte-/Fehler-/Wiederanlaufzustände | `waiting-lightroom`, `waiting-usage`, `waiting-decisions`, Fehler, Pause und Unterbrechung bestehen bereits. Sie sind keine Auslösegründe für eine Erfolgsaktion. |
| `desktop/main.mjs` und `desktop/server-lifecycle.mjs` | Regulärer Schließweg mit getrennten Prüfungen für Pipeline, NAS-Sicherung und offene Änderungen vorhanden. Keine automatische Betriebssystemaktion oder entsprechende Desktop-Schnittstelle im heutigen `preload.cjs`. |
| Koordinator-/Wiederanlauf-/Desktoptests | Vorhandene Grundlagen für Erfolg, fremde Aufträge, Wiederanlauf und Schließschutz. Sie prüfen noch keine vorgemerkte Abschlussaktion. |

Für die spätere Umsetzung Auswahl, Abwahl, Auslösestatus und Ergebnis an den konkreten Auftrag binden.
Wiederholte Statusabfragen, Neustart oder alte Abschlussquittungen dürfen keine erneute Aktion auslösen.
Die genaue Zustandsfortschreibung und die Grenze zwischen Fachservice, Desktop und Betriebssystem
erst nach bestätigtem Verhalten festlegen; keine Systembefehle in Browsermodule einbauen.

### Bestätigte Entscheidungen

| Kennung | Fachliche Entscheidung |
| --- | --- |
| END-1 | Bestätigt: nichts tun, Explorer beenden, PC herunterfahren, PC neu starten. Energiesparen und Ruhezustand zunächst nicht benötigt. |
| END-2 | Vor dem konkreten Lauf auswählen; Standard nichts tun und rechtzeitige Abwahl bestätigt. Benachrichtigung, Auftragsbindung und Verhalten bei Wiederöffnung daraus ableiten; keine unbemerkte erneute Aktivierung einer alten Auswahl. |
| END-3 | Bestätigt: keine zusätzliche NAS-Sicherung vor der Aktion; Sicherungen laufen routinemäßig nach Zeitplan. Aktion an den eindeutig festgelegten PC binden, NAS nicht herunterfahren. Die erste mobile Fassung ist ein lesendes Nachschlagewerk. |

Bereits bestätigt bleiben der Standard **nichts tun**, ausschließliche Auslösung nach vollständigem
Erfolg, rechtzeitige Abwahl und regulärer Abschluss eigener Schreibvorgänge. Andere Programme nicht
zwangsweise beenden. Diese Grundregeln stehen nicht erneut zur Auswahl.

### Umsetzung nach Gesamtfreigabe vom 31. Oktober

Die [Abschlussmodule](../species-explorer/update-completion/README.md) und der Desktopbesitzer sind
mit dem tatsächlichen gespeicherten Updateweg verbunden. Die Auswahl im Updatebereich wird vor
dem Start gespeichert und intern an dessen neue Run-ID gebunden. Eine wiederholte identische
Startanfrage gibt den gebundenen Auftrag zurück. Schlägt nur die optionale Bindung fehl, bleibt der
wirklich gestartete Updateauftrag erhalten und die Abschlussaktion wird deaktiviert.

Erfolg verlangt den gespeicherten Gesamtabschluss, aktuelle Statusdienste und passende konkrete
Master-/Suchpaket-/Veröffentlichungskennungen. Ein sichtbarer abbrechbarer Countdown läuft erst
danach volle 60 Sekunden. Eigene Writer, Routinebackup, Websiteübernahme, wartende gemeinsame
Änderungen, offene Formulare und unbekannte Prüfwerte halten die Aktion an. Beim Schließen wird
eine Mutationsbarriere erworben; danach werden Auftrag und Paar erneut geprüft und die eigenen
Dienste abgeschlossen. Der dauerhafte Ausführungsclaim wird höchstens einmal verwendet.

Die native Anforderung enthält kein erzwungenes Schließen anderer Programme. Keine Systemaktion
wurde im Entwicklungslauf ausgeführt. Isolierte Zustands-/Adapter-/UI- und zusätzliche wirkliche
Loopback-Integrationstests sind von der noch offenen Prüfung im neu gestarteten Desktop und der
späteren tatsächlichen Windows-Abschlussaktion getrennt. Die Sicherungsroutine bleibt unabhängig.

### Vorbereitete zusätzliche Abnahmefälle

Als Vorschläge für die gemeinsame Bestätigung: Jede gewählte Aktion einmal nach frischem Gesamterfolg
auslösen; keine Aktion bei Fehler, Abbruch, Pause, wartender Entscheidung oder unbekanntem Status.
Abwahl vor Auslösung, mehrfaches Statuslesen, Wiederöffnung, Absturz/Wiederanlauf und ein fremder Auftrag
dürfen keine ungewollte Aktion erzeugen. Laufende Sicherung, offene Schreibvorgänge und Speicherrückfragen
beachten. Zunächst mit austauschbarer Testausführung prüfen; eine echte Abschaltung erst im vereinbarten
praktischen Abnahmefall. Heute sind keine solchen Systemaktionstests ausgeführt.

### Vertiefte Abschlussvorbereitung vom 31. Oktober

28 zusätzliche isolierte Fälle prüfen tatsächliche vorhandene Funktionen mit injizierten kleinen
Diensten, ohne Datenbankaufbau oder Systemaktion. Ein gesunder gemeinsamer Quellen-/Master-/Suchpaketstand
wird genau einmal als `completed` gespeichert; wiederholtes Fortschreiben dupliziert diesen Abschluss nicht.
Offene Kandidaten, fehlende oder veraltete Pakete, aktive Dienste, offene Korrekturen/Identitäten,
Quellenfehler, Pause und Wartezustände erzeugen keinen erfolgreichen Gesamtabschluss. Vier vorhandene
Desktop-Statusleser sind zusätzlich an einem eigenen kurzlebigen Loopback-Stub geprüft.
Private Quellen-/Testmatrix und Ergebnisse: `data/website/checks/mobile-completion-preparation-20261031.json`
beziehungsweise `-probe.json`; keine neue Aktionsfunktion ist damit implementiert.

Für die spätere Integration sind drei Grenzen konkret belegt: Der reguläre Desktop-Schließweg prüft
Pipeline, Sicherung, gespeicherte Projektänderungen und Website-Übernahme, aber nicht selbst den
erfolgreichen Update-Gesamtabschluss. Der serverseitige Projektänderungsstand umfasst keine flüchtigen
ungespeicherten Dialogfelder; deren bestehende eigene Schutzwege sind einzubeziehen. Schließlich muss
der tatsächliche Abschluss eigener Hintergrundschreiber und des Servers vor der gewählten Systemaktion
bestätigt sein. Ein akzeptierter Schließversuch allein genügt nicht. Diese Grenzen gehören in den später
Integrations-/Abnahmeumfang. Die inzwischen bestätigten Rahmenbedingungen zu END-1 bis END-3 stehen oben;
eine neue Abschlussautomatik oder Zielgeräteabnahme folgt daraus noch nicht.

## Bedienung

- Beim Start wird die verfügbare CoL-Version im Hintergrund geprüft. Ein Startangebot erscheint nur bei
  einer tatsächlich bekannten neuen CoL-Version beziehungsweise einer notwendigen Erstinstallation,
  nicht allein wegen einer verstrichenen Prüffrist für Ergänzungsnamen. `Später` startet keinen Update-/
  Aufbau-/Aktivierungslauf. Die manuelle Datenbankaktion nutzt weiterhin denselben vollständigen Weg.
- iNaturalist, GBIF, WoRMS und Wikidata liefern in dieser Anbindung keine gemeinsam vergleichbare
  Releasekennung. Ihre lokalen Snapshotkennungen bezeichnen den Erfassungsstand, keine neu erkannte
  Anbieterveröffentlichung. Eine Ergänzungsprüfung bleibt bewusst manuell möglich; ihr Alter öffnet kein Popup.
- Die einmalige Startbestätigung gilt für die technische Quellen-/Master-/Paketkette. Sie nennt den bereits
  bestätigten vollständigen FN-Katalogsatz und die Vereinbarung, bis zum normalen Schließen keine weiteren
  FN-Zuweisungen, Importe oder Katalogwechsel vorzunehmen. Unbekannte Kataloge benötigen zuerst die einmalige
  vollständige Registrierung; sie werden nicht als leer angenommen.
- Bei offenem Lightroom wird eine neue SDK-Erfassung angefordert. `Lightroom jetzt schließen` merkt ausschließlich
  das normale Schließen vor, das erst nach erfolgreicher Erfassung angefordert wird. Adobe-Rückfragen bleiben
  sichtbar; weder Prozessbeendigung erzwingen noch Sperrdateien löschen. Alternativ Lightroom selbst schließen:
  der gespeicherte Startauftrag wartet im Hintergrund, danach kein zweiter Startklick.
- Nach abgebrochener Erfassung erhält ein gezielter Retry die bereits ausdrücklich vorgemerkte normale
  Schließung nur für denselben Updateauftrag, dieselbe Startvereinbarung und dieselbe Katalogmenge.
  Eine neue gültige Erfassung bleibt Voraussetzung; alte Quittungen und frühere Schließversuche werden
  nicht übernommen. Fremde oder stornierte Aufträge erhalten keine Schließabsicht.
- Die Statistik ist eine gespeicherte Auswertung und ersetzt keinen frischen, requestgebundenen FN-
  Nutzungsnachweis für einen Datenbankwechsel. Eine vorhandene Statistik löst keinen Statistikneuaufbau
  für das Update aus; bei erforderlicher neuer FN-Erfassung werden die tatsächlichen verwendeten Master-IDs
  über das SDK gelesen. Ein wirklich aktueller Nachweis eines unverändert geschlossenen Katalogs kann
  nach den bestehenden Frischeprüfungen weiterverwendet werden, ohne seine Quittung neu zu datieren.
- Erst neue requestgebundene Quittungen aller bestätigten Kataloge, geschlossenes Lightroom, fehlende
  Arbeitsdateien sowie stabile Dateistände/Prüfsummen erlauben die Registrierung und den Start.
  Bei beendetem Lightroom-Prozess mit verbliebenen Arbeitsdateien nennt die Anzeige ausdrücklich den
  noch nicht nachgewiesenen Katalogabschluss. Die bestehenden Freigabeprüfungen bleiben erhalten.
- Quellenabschluss ist kein Gesamtabschluss. Master, Suchpaket und gemeinsame Veröffentlichung müssen
  sämtliche bisherigen Schutzprüfungen bestehen und anschließend zusammenpassen.
- Die Fortschrittsanzeige trennt gemessene Auswahlmengen von der weiteren Vorbereitung. Sobald die CoL-
  Auswahl vollständig gelesen ist, folgt „CoL-Auswahl gelesen. Eingänge werden weiter vorbereitet und
  geprüft.“ ohne Prozentwert für diesen ungemessenen Folgeteil. Anbieterdateien und vollständige
  Eingangs-/Master-Prüfsummen werden weiterhin gesichert und geprüft, bevor das Rezept und der Worker
  bereit sind. Vor der vollständigen Prüfung der gesicherten Eingänge folgt nun der eigene Hinweis
  „Gesicherte Eingänge und bisherige Datenstände werden anhand ihrer Prüfsummen geprüft.“ ohne
  Prozentwert oder Restdauer. Er benennt den tatsächlich folgenden Prüfschritt; ein bereits vollständiger
  CoL-Zähler beschreibt nicht die Dauer dieser Prüfsummenlesung. Die neue Aufbauregelrevision gilt für
  zukünftige Rezepte; vorhandene historische Rezepte wurden dafür nicht geändert.

## Gespeicherte Steuerung und Wiederanlauf

`taxonomy/master/update-workflow.json` enthält Auftrag, bestätigten Quellenplan, Ausgangsrevisionen,
tatsächliche Phase, Nutzungsrevision, Kandidatenbindung und Ergebnis. Eine eigene SQLite-Lebenszeitsperre
verhindert zwei Koordinatoren; sie ist von den Master-/Kontrollsperren getrennt. Statusabfragen lesen nur den
gespeicherten Zustand und erteilen keine neue Startfreigabe.

Bei einem tatsächlichen Wechsel in einen laufenden oder wartenden Zustand wird ein vorheriger
`completedAt`-Wert gelöscht. Erst ein echter Abschluss oder ein neuer Fehler erhält einen passenden
Abschlusszeitpunkt. So wird eine ältere Endzeit nicht zusammen mit dem fortgesetzten Auftrag als aktueller
Abschluss ausgegeben. Eine abgewiesene fremde Auftragsbindung verändert dessen gespeicherte Bytes nicht.

Die Verkettung läuft im lokalen Explorer-Dienst, nicht mehr nur im geöffneten Datenbankdialog. Schließen
des Dialogs beendet sie nicht. Schließen des gesamten Explorers/Servers ist davon verschieden: die Absicht
bleibt gespeichert, es wird kein dauerhafter Windows-Dienst eingerichtet. Eine bereits bestätigte Startwartephase
wird beim Wiederöffnen wieder aufgenommen. Ein unterbrochener eigener Aufbau benötigt eine gezielte technische
Fortsetzung mit frischen Eingangsprüfungen; fremde Aufträge werden nicht adoptiert. Ein unterbrochener Quellenlauf
ist nicht allein durch importiertes CoL vollständig. Dafür eine frische Quellenprüfung/Bestätigung; der alte
Auftrag wird archiviert, nicht seine Quellen oder Berichte gelöscht.

Ein eigener fehlgeschlagener oder veralteter Aufbau mit vollständig abgeschlossener Quellenphase besitzt
den gesonderten Weg **„Mit lokalen Daten neu aufbauen“**. Die kurze Vorschau bindet alten Update-/Buildauftrag,
Rezeptrevision, heutigen Ausgangsstand, lokale Quellen und den vollständigen registrierten Katalogsatz.
Abbrechen startet nichts. Erst die ausdrückliche neue Bestätigung sichert den alten Workflow in der
Auftragshistorie und legt einen neuen eigenen Auftrag an. Altes Rezept und Buildverzeichnis bleiben erhalten;
ihre Regeln werden nicht umgeschrieben. Der neue Aufbau verwendet vorhandene lokale Quellen ohne Download.

Dieser Weg ist auch bei einem eigenen Folgeaufbau in `waiting-usage/resume-build` verfügbar, wenn dessen
FN-Nachweis durch zwischenzeitliche Lightroom-Arbeit veraltet ist. Ein erhaltener vorheriger Kandidat ist
nur zulässig, wenn sein Zustand und unverändertes Rezept eindeutig denselben ursprünglichen Updateauftrag
belegen. Die Vorschau bindet diesen Kandidaten zusätzlich; fremde oder unklare Herkunft bleibt gesperrt.
Die Oberfläche kennzeichnet seine bereits vorgemerkten Klassifikationsfälle als alten Zwischenstand;
weitere echte Konflikte und der tatsächliche Aufbaufehler bleiben sichtbar.

Noch nicht aktivierte automatische Identitätsereignisse werden nicht auf die neue FN-Revision umgeschrieben.
Nach erfolgreicher neuer Erfassung und regulärem Katalogabschluss prüft der Ersatzauftrag stattdessen
alle betroffenen ursprünglichen Fälle erneut gegen heutige FN-Nutzung, Projektarten, eigene Entscheidungen,
Korrekturen und unveränderte Quellen. Nur bei unverändertem Schutzresultat wird ein separater verketteter
Nachweis in `master/classification-usage-renewals.json` angehängt. Das Erneuerungsziel ist im neuen Auftrag
und dessen Neustartschutz gebunden; geänderte Eingänge, neu verwendete betroffene IDs oder fehlende Belege
stoppen den Aufbau. Alte Ereignisse, Quittungen, Rezepte und private Kandidaten bleiben erhalten.
Während dieser erneuten Prüfung nennt der gespeicherte Hinweis die registrierte FN-Nutzung und die
Prüfung der gespeicherten Entscheidungen; er fordert kein bereits geschlossenes Lightroom weiter an.
Die bestehenden Warte-/Phasen- und Schutzregeln bleiben erhalten.

Ein Programmneustart löscht den gespeicherten Fehlzustand nicht und startet keinen neuen Aufbau. Für diesen
Fall erklärt die Oberfläche den nötigen lokalen Neuaufbau, nennt den letzten Fehler einmal und blendet den
zusätzlichen Fortsetzenknopf sowie den unpassenden Checkpointhinweis aus. Aktuelle separate Quellenfehler
bleiben sichtbar; ein brauchbarer pausierter Schreibstand behält seinen Fortsetzenweg. Vorschau und Abbruch
wurden am 11. Oktober zusätzlich im tatsächlich geöffneten Windows-Explorer geprüft; Auftrags- und aktive
Veröffentlichungsdatei blieben unverändert. Vor dem Anlegen eines Ersatzauftrags ist dessen ausdrückliche
neue Startbestätigung erforderlich.

Nach einem bestätigten neuen lokalen Ersatzauftrag gehören Fehler und Checkpoints des exakt im
`restartGuard` gebundenen alten Aufbaus nicht zum neuen Fortschritt. In dessen FN-/Lightroom-Wartephase
zeigt die Oberfläche den aktuellen Auftrag; solange sein eigener Buildjob noch nicht vorliegt, zeigt sie
die Eingangsprüfung und Vorbereitung. Der Pausenknopf heißt dort „Updateauftrag pausieren“. Sobald ein
eigener Schreibstand existiert, werden dessen Fortschritt, Checkpoint und Master-Pausenweg angezeigt.
Eigene aktuelle Fehler und gesonderte Quellenfehler bleiben sichtbar. Diese Zuordnung bereinigt nur die
Darstellung, weder gespeicherte Zustände noch Aufbau-/Aktivierungsprüfungen.

Verarbeitet ein eigener laufender Folgeaufbau die bereits gespeicherte automatische Identitätsentscheidung,
erklärt die Anzeige die Klassifikationsfälle des vorherigen Kandidaten als diesen Zwischenstand. Dafür müssen
Auftrag und Buildjob, Folgerevision und aktuelle Identitätsrevision sowie die genaue alte Kandidaten-ID
zusammenpassen. Weitere echte Konflikte bleiben entscheidungspflichtig sichtbar. Der Hinweis ist kein
Aktivierungsnachweis und ersetzt keine erneute Kandidatenprüfung.

Eine gespeicherte Pause beweist allein keinen bestätigten Schreibblock. Ist noch kein Schreibcheckpoint
vorhanden, prüft eine gezielte Fortsetzung die erhaltenen Eingänge erneut und bereitet sie auf. Vorhandene
passende Schreibcheckpoints bleiben auf dem bisherigen Wiederanlaufweg erhalten. Der reale Pause-/
Neustart-/Fortsetzungsnachweis vom 11./12. Oktober steht ausschließlich im
[Auditauftrag, Abschnitt 10.24](audit-auftrag-phase-10-5.md#1024-freigegebener-realer-lokaler-wiederanlauf--11-und-12-oktober).

Dieser Ersatzauftrag verlangt stets neue requestgebundene FN-Quittungen, auch wenn ein älterer globaler
Nutzungsnachweis noch aktuell erscheint. Die neu bestätigte Katalogmenge bleibt während der Erfassung gebunden;
die erwartete neue Quittung darf die Registerrevision ändern. Eine frühere Schließbestätigung wird nicht auf den
neuen Auftrag übertragen. Normales Schließen kann im folgenden Dialog erneut ausdrücklich vorgemerkt werden.
Vor dem tatsächlichen Aufbau werden Eigentümer, Quellen, Projektdateien, zurückbehaltene Taxa und Ausgangsstand
erneut geprüft. Große Datenbank-/Anbieterdateien werden in dieser Vorschau nur über Dateistände gebunden;
die vollständigen Prüfsummen bleiben an der bestehenden Aufbaugrenze. Änderungen, fremde/aktive Aufträge,
ein nicht eindeutig zum Ursprung gebundener Kandidat oder eine unvollständige Quellenphase stoppen den Ersatzweg. Ein brauchbarer pausierter
Zwischenstand bleibt auf dem bisherigen Fortsetzungsweg. Der Ersatzweg ist lokal automatisiert geprüft;
Vorschau und Abbruch sind nativ bestätigt. Den realen freigegebenen Wiederanlauf und seine noch offene
vollständige Betriebsabnahme führt der Auditauftrag, Abschnitt 10.24.

Ändern sich die Eingänge während des FN-Wartens, bleibt auch der dadurch vor dem Aufbau fehlgeschlagene
Ersatzauftrag erneut bestätigbar. Die neue öffentliche Vorschau bindet diesen aktuellen Auftrag; die
Build-Eigentumsprüfung bleibt auf den ursprünglichen unveränderten Build samt gebundener Ursprungshistorie
gerichtet. Eine weitere ausdrückliche Bestätigung erhält beide früheren Aufträge und fordert wieder eine
neue eigene FN-Erfassung. Eine veränderte Ursprungshistorie oder ein inzwischen fremder/aktiver Build
wird nicht übernommen. Dadurch führt die Aufforderung zur neuen Vorschau tatsächlich zu einem ausführbaren
Weg, ohne den alten veralteten Guard wiederholt als neue Zustimmung zu behandeln.

Neue Masterrezepte und der aktuelle Zeiger binden `updateRunId`. Auch ein fertiger fremder Kandidat darf nicht
aktiviert werden. Ein älterer besitzerloser Kandidat benötigt ausdrücklich bestätigte Kandidaten-, Auftrags-
und Rezeptrevision. Der Quellenplan wird vor dem Warten gebunden: eine spätere neue Anbieterversion ersetzt
nicht heimlich das bestätigte Ziel. Fehlerhafte/veränderte Bindungen stoppen sicher.

Nach einer bestätigten letzten normalen Feldentscheidung setzt derselbe Auftrag automatisch fort.
Klassifikationsbündel starten erst dann einen lokalen Folgeaufbau, wenn alle zu diesem Kandidaten gebundenen
Fälle vorgemerkt sind und keine anderen blockierenden Fälle verbleiben. Ein ungewisser Speicherausgang wird
nicht blind wiederholt. Technische Fehler bleiben Fehler, keine künstlichen fachlichen Entscheidungen.

## Schutz vorhandener Daten

Projektarten, nachgewiesen genutzte Lightroom-IDs, eigene ausgewählte Felder/Namen und belegte eigene
Entscheidungen schützen auch normale Anbieteränderungen an ausgewählten Namen und Hierarchie, nicht nur
CoL-Reichsfälle. Tatsächlich geänderte Werte werden als `changed-value` zur Entscheidung gezeigt.
Reine Herkunftszeiten, Quellenkennungen und unveränderte Werte erzeugen keine zusätzliche Rückfrage.
Eine ausdrücklich neue eigene Namenswahl, Anbieterstandard-Rückkehr oder bestätigte Identitätsfortführung
gilt weiterhin als bewusste Entscheidung; daraus folgt keine pauschale Freigabe anderer Hierarchiefelder.

Positive FN-Nutzung bleibt selbst bei veraltetem Abwesenheitsnachweis geschützt. Der kanonische Satz
`protectedMasterIds` ist an Rezept, Eingangsvergleich, Kandidatenmanifest und frische Paarfreigabe gebunden.
Geschützte Taxa werden bei Wiederverwendung fachlich neu geprüft. Belegte eigene Quellenfeldentscheidungen
behalten einen nachvollziehbaren Schutzmarker in Folgegenerationen, ohne Anbieterwerte zu manuellen Werten
umzuschreiben oder neue Nutzerentscheidungen zu erfinden.

Unbenutzte passende Klassifikationen erhalten ihre ursprüngliche ID. Unklare unbenutzte Gegenstücke werden
konservativ zurückgestellt. Ein automatischer lokaler Folgeaufbau genügt für beide Gruppen; verbleibende
geschützte Änderungen bleiben gesperrt. Keine Namensheuristik, Foto-/Projektmigration oder Schutzumgehung.

## SDK-Erfassung und ehrliche Grenze

Ab Plug-in **0.4.24.16** gibt es Initialisierungs-/Shutdown-Hooks und einen Task, der alle zehn Sekunden nur die
kleine Datei `taxonomy/catalog-usage/update-request.json` prüft. Ohne expliziten bestätigten Auftrag kein
Katalogscan, keine Suchdatenbanköffnung und keine neue Hilfsprozessabfrage. Vor der eigentlichen Erfassung
validiert der Helfer Request-ID, unveränderliche Capture-Revision und den genauen Katalogpfad.

Zwei vollständige SDK-Durchgänge vergleichen Foto-UUIDs, Master-IDs und Mengen. Gespeichert werden nur
Katalogpfad, Summen je Master-ID und neue Quittungs-/Requestbindung; keine Foto-UUIDs oder Bildpfade.
Abbruch, ungültige IDs, doppelte UUID, Katalogwechsel, Auftragswechsel, Neuladen oder Helferfehler geben
keine Freigabe. Erfassungsfehler werden auch im gespeicherten Auftrag sichtbar. Ein ausdrücklich bestätigter
Retry erstellt eine neue Request-ID; eine alte Quittung erhält keinen neuen Zeitstempel.

Das SDK besitzt in den geprüften Verträgen keinen allgemeinen lückenlosen Katalogänderungsbeobachter.
Die Zeit zwischen Erfassung und normalem Schließen ist deshalb **durch die einmalige Startvereinbarung
mit dem Nutzer**, nicht durch einen behaupteten unabhängigen Änderungsnachweis abgedeckt. Shutdown ist
kein Crash-Zertifikat. Bleiben Arbeitsdateien zurück oder wird Lightroom vor der Erfassung geschlossen,
wartet der Auftrag; unbekannte Nutzung bleibt unbekannt. Wiederöffnen/Ändern während des Aufbaus veraltet
die Grundlage und verhindert die automatische Veröffentlichung. Lightroom muss für diesen Updateweg geschlossen bleiben.

Dokumentierte Grundlage: [Adobe-authored API-Referenz, LrCatalog](https://lrc.mcor.dev/modules/LrCatalog.html)
(`getAllPhotos`, `getPath`), sowie der
[Adobe SDK Guide, Initialisierung/Shutdown S. 23–24](https://ioconsolerykerprodcdn.azureedge.net/static/installers/lr/sdk/2022/cross_platform/v13/doc/Lightroom%20Classic%20SDK%20Guide_1655133965.pdf).
API-Spiegel und älterer offizieller Guide sind keine Zusage eines allgemeinen Beobachters in neueren Versionen.

## Historische Prüfstände und damalige Abnahmegrenzen

Die folgenden datierten Nachweise beschreiben den Stand bis Mitte Oktober. Der aktuelle Auditabschluss
steht in Abschnitt 10.55 des Auditauftrags; offene Prüfungen einer künftigen Abschlussaktion stehen oben.

Am **13. Oktober** bestanden die abschließenden Koordinator-/Jobgruppen **142/142** Fälle für die
Endzeitkorrektur und den neuen Prüfsummenhinweis. Das anschließende vollständige lokale Endgate bestand
**1.740 Tests in 50 Gruppen**, ohne Fehler, Abbrüche oder Skips. Plug-in **0.4.24.27** wurde am 13. und
14. Oktober nativ geladen und aktiviert nachgewiesen. Diese Ladekontrolle ersetzt keine vollständige
Schreib-/Statistikabnahme. Der am 14. Oktober eigens freigegebene FN-Katalogabgleich ist ein separater
Foto-/Metadatenlauf; sein tatsächliches Ergebnis wird ausschließlich im laufenden
[Auditauftrag](audit-auftrag-phase-10-5.md#1027-produktiver-fn-katalogabgleich--14-oktober) fortgeschrieben.

Isolierte Koordinator-/Request-/SDK-Lua-Gegenproben prüfen ein Startangebot, Später, normale und selbständige
Schließung, unveränderte Quellenbindung, Abbruch/Neuladen, unbekannte Kataloge, doppelte Quittung, Speicherfehler,
Wiederanlauf, eigene/fremde Aufträge, offene Entscheidungen und falsche Gesamtabschlussanzeigen.
Echte Master-/Paar-Hilfsprozesse bleiben zusätzlich in den bestehenden Testgruppen enthalten.

Der neue lokale Ersatz-/Wiederbestätigungsweg vom 11. Oktober ist zusätzlich gezielt und im vollständigen
lokalen Endgate geprüft; der unabhängige Nachreview bestätigt die Quellen-/Eigentumsgrenzen. Aktuelle
Reparaturbelege und die weiterhin offene native Abnahme stehen ausschließlich im
[Auditauftrag, Abschnitt 10.22](audit-auftrag-phase-10-5.md#1022-vorrangige-fn--und-artanlage-reparaturen--11-oktober).

Vollständiges `quality:ci` am 3. Oktober erneut mit Exit 0: alle 50 Testgruppen, darunter 420 Master-/Betriebs-
und 214 Lightroom-/Pakettests ohne Fehler/Abbruch/Skip. Plug-in-Vertrag zusätzlich separat 15/15 erfolgreich.
Eine Überschneidung der neuen Entscheidungsmarker mit dem engen Quellenreparaturweg wurde dabei gefunden
und behoben, ohne die Umfangsprüfung zu lockern: im engen Weg echte Entscheidungen und vorhandene Marker
unverändert erhalten, neue Markerfortschreibung nur im regulären Aufbau. 65 Reparatur-/Feldschutztests bestanden.
[Datierter Umsetzungsnachweis und Abnahmeliste](audits/2026-10-03-pre-audit-implementation.md).

Diese früheren Prüfungen ersetzten damals nicht die noch ausstehende praktische SDK-/Explorer-Gesamtabnahme.
Deren späteren Abschluss und bewusste Nachweisgrenzen führt der Auditauftrag. Keine weitere Quellenversion
oder lange Produktivaktion allein für einen erneuten Nachweis starten; ein nächster realer Updateweg benötigt
einen eigenen Auftrag. Aktuelle Folgevorhaben und Betriebsgrenzen stehen in der [Roadmap](roadmap.md).
