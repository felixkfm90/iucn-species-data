# Auditauftrag Phase 10.5 – Gesamtprojekt, Betrieb und Weiterentwicklung

Stand: 2026-10-26

Status: **Gesamtaudit läuft; lokale Explorer-Abschlussprüfung und vereinbartes Websitepaket am 26. Oktober abgeschlossen. Lightroom und Gesamtabschluss stehen aus.** Felix hat den Start des Gesamtaudits am 8. Oktober in diesem
neuen Hauptarbeitschat ausdrücklich beauftragt. Der laufende Nachweis steht in Abschnitt 10; ein Abschluss
oder eine pauschale Freigabe zum Löschen, Umziehen oder Veröffentlichen ist damit nicht verbunden.
Dies ist die **einzige führende Datei für Auditauftrag, Vorabregeln, Entscheidungen, offene Auditfragen und
den späteren Audit-Abschlussbericht**.
Aktuelle Reihenfolge nach Felix' Auftrag: Explorer lokal abgeschlossen → Website abgeschlossen → Lightroom →
gemeinsame Abschluss-/Veröffentlichungsprüfung und Bereinigung. Die Explorer-Teilabnahme ist kein
Gesamt-Go und keine zusätzliche Veröffentlichungs- oder Löschfreigabe.
Die zuvor getrennten Vorabregeln sind vollständig hier eingeordnet; andere Projekteinstiege verlinken nur
hierher. Bestehende Fachverträge und datierte Prüfberichte bleiben Belegquellen, keine zweite Audit-Anweisung.

## 1. Auftrag und Ergebnis

Prüfe das gesamte Projekt: Arten-Explorer einschließlich Taxonomiequellen und Masterdatenbank,
Lightroom-Suchpaket und Plug-in, Artanlage, Medienpflege, Datenpipeline sowie **die vollständige Website
mit Squarespace-Einbindungen und GitHub einschließlich Repository, Workflows und Pages**.
Website und GitHub sind eigenständige vollständige Auditbereiche, keine optionalen Verbraucher-Anhänge.
Nicht nur die zuletzt reparierten Fehler prüfen: Untersuche auch systematische Fehlerklassen,
unnötige Arbeitsschritte, Speicherwachstum, Architekturgrenzen und die Tragfähigkeit für Erweiterungen.

Ziel ist ein nachweislich zuverlässiger, verständlicher und wartbarer Gesamtbetrieb. Sichere, im Auditauftrag
enthaltene Fehlerkorrekturen und begründete kleine Vereinheitlichungen umsetzen und erneut prüfen. Größere
Umbauten zunächst mit Nutzen, Risiko, Kompatibilität und Abnahmeplan begründen; kein pauschaler Komplettumbau.
Künftige Funktionen werden auf Erweiterbarkeit geprüft, nicht ohne fachliche Entscheidung vorab eingebaut.

Erwartete Ergebnisse:

- belegter Gesamtbefund mit nachvollziehbaren Fehlern, Korrekturen und ausdrücklich offenen Grenzen;
- vollständige Speicherübersicht und freigabefähiger Bereinigungsplan statt pauschaler Löschvorschläge;
- überprüfte Struktur mit klaren Zuständigkeiten für Code, Laufzeitdaten, öffentliche Daten, Tests und Doku;
- einheitliche Bedienkonzepte, wiederverwendbare Oberflächen und weniger notwendige Nutzeraktionen;
- nachgewiesene Datenintegrität, Wiederaufnahme, Rücknahme und Wiederherstellung;
- konkrete, priorisierte Weiterentwicklungsaufträge mit Abnahmekriterien und ohne spekulative Großbaustellen.

## 2. Ausgangsstand und Startgrenze

Zum Schreiben dieses Auftrags ist `b13afd861ad753335835d9a60aa1075598e4d6ee` der dokumentierte veröffentlichte
Stand nach Reparaturserie `550829f006078629b620d40525eca0643c030e74`; Plug-in-Quellstand ist 0.4.24.22.
Das damalige lokale Gesamtgate meldete 50 Gruppen/1.218 bestandene Tests. Pages-Läufe `37319639341` und
`37320497936` waren erfolgreich. Diese Nachweise sind eine Ausgangsbasis, **kein bestandenes Gesamtaudit**.
Zu Auditbeginn HEAD, installierte Versionen, aktive Datenstände und Veröffentlichung frisch feststellen.

Felix hat am 5. Oktober die beiden abschließenden nativen Bedienprüfungen zurückgemeldet:

1. **Artanlage abbrechen** mit Schwarzstorch ausgeführt; nach seiner Beobachtung vollständig zurückgenommen.
2. Lightroom-Plug-in funktioniert, die zuvor gemeldete Warnung erscheint nicht mehr.

Beide gezielten Bedienabnahmen sind damit nutzerbestätigt und nicht mehr ausstehend. Diese Rückmeldung
ist keine neue unabhängige Datei-/Git-Restprüfung oder ein vollständig ausgeführtes Gesamtaudit.
**Fenster schließen** bedeutet weiterhin Fortsetzen, nicht Abbruch. Bereits konkret bestätigte Bedienprüfungen
nicht ohne Regressionsgrund als unerledigt zurücksetzen; weitergehende Fehler-/Wiederanlauffälle der
Auditmatrix separat nachweisen. Lokale Tests, native Bedienung und Veröffentlichung sind verschiedene Nachweise.

Aktueller Programmordner ist `D:\Arten-Explorer`; Standard-Datenordner ist `D:\Arten-Explorer\Daten`.
Konfiguration lesen, nicht den alten Codex-Arbeitsordner `D:\IUCN_Datenbank` als gültig voraussetzen.
Die Nutzerangabe von rund **93 GB** ist noch keine aktuelle Speicherinventur. Der frühere Umzugsnachweis
umfasste 98.603.910.132 Bytes, rund 98,60 GB beziehungsweise 91,83 GiB; das ist keine heutige Größe des
gesamten Programmordners. Keine Einsparung versprechen, bevor die tatsächlich entbehrlichen Bestände belegt sind.

## 3. Verbindliche Arbeitsgrenzen

- **Offene Grundregeln vor dem Audit klären**, nicht in die spätere Durchführung verschieben.
  Vorabregeln und Entscheidungen stehen ausschließlich in dieser Datei. V-01 für bislang ungeregelte
  Zusatzsicherungen und B-02 sind bestätigt. Die Umsetzung der Sicherungsregeln und tatsächliche Bereinigung
  vor dem Audit sind am 7. Oktober zusätzlich beauftragt; genaue Löschziele bleiben gesondert freizugeben.
- Erst nach dem Auftrag zum Audit beginnen. Die bestätigte Vorarbeit ist kein Gesamtaudit; die separat
  freigegebene aktuelle NAS-Sicherung ist kein Anbieterdownload, Aufbau oder Taxonomie-Paketwechsel.
- Nutzeränderungen und einen schmutzigen Git-Arbeitsstand erhalten; Herkunft eigener Änderungen festhalten.
- Keine produktiven Anbieterdownloads, Master-/Paketwechsel, Lightroom-Katalogänderungen, Rollbacks oder
  Veröffentlichungen allein für einen Test anstoßen. Möglichst isolierte Kopien kleiner Testbestände nutzen.
  Notwendige reale Betriebsabnahmen mit genauer Wirkung und bestehender oder neuer Freigabe abgrenzen.
- Keine Schutzsperren lockern, Namen zur Identitätsheuristik verwenden oder Konflikte durch Löschen verstecken.
- Destruktive Bereinigung verlangt eine **frische, konkrete Freigabe**: genaue absolute Ziele, Anzahl, Größe,
  Begründung, ausgeschlossene Bestände, Folgen und Rückweg. Dieser Auditauftrag ersetzt sie nicht.
  Ergänzung vom 23. Oktober: Felix beauftragt unmittelbar vor dem Auditabschluss die Entfernung nachweislich
  entbehrlicher Test-/Arbeitsdateien und sonstiger sicher unbenutzter Dateien. Ziele und Schutzbindungen zuerst
  konkret feststellen und hier belegen; bei unklarer Verwendung vor dem Löschen fragen. Fehlender Zugriff,
  Dateialter oder `.gitignore` allein beweisen keine Entbehrlichkeit. Noch benötigte Audit-/Restorebelege erhalten.
- Keine neuen riesigen Sicherungskopien als vermeintlich kostenlosen Vorsichtsschritt. Vor großen Kopien
  klären, ob Wiederherstellung oder Bereinigung benötigt wird, und Platz-/Zeitkosten benennen.
- Alle neuen Test-/Messdateien ausschließlich in eigenen Sitzungen unter Programm-`temp`; Plug-in-Tests in
  dessen eigenem Temp-Bereich. Dauerhafte Aufträge, Belege, Entscheidungen und offene Prüfungen sind kein Temp.
- Keine wiederholten vollständigen Datenbank-/Prüfsummenscans während eines laufenden Aufbaus. Zunächst kleine
  Status-/Manifestdaten lesen; nie zwei konkurrierende produktive Aufbauten starten.
- Bei benötigter zusätzlicher Entscheidung fragen, aber davon unabhängige sichere Auditarbeit fortsetzen.
  Kein künstlicher Erfolg durch verschobene Tests, deaktivierte Qualitätsgrenzen oder stillschweigende Annahmen.

## 4. Reihenfolge und Zusammenarbeit

1. **Startaufnahme:** bestätigte Abnahmen, Git-/Installationsstand, aktuelle Verträge, Prozesse, laufende Aufträge,
   aktive Veröffentlichung und Datenpfade feststellen. Widersprüche im aktuellen Stand zuerst klären.
2. **Lesende Bestandsaufnahme:** Speicherstruktur, Abhängigkeiten und Schutzbindungen erfassen. Dabei nur
   Dateimetadaten/kleine Manifeste lesen, soweit das für die erste Zuordnung genügt.
3. **Kernfunktionen und Datenintegrität:** Taxonomie, Gesamtupdate, Artassistent, Lightroom und Veröffentlichung
   mit Erfolgs-, Fehler-, Abbruch- und Wiederanlauffällen prüfen. Risikoreiche Befunde vor Kosmetik korrigieren.
4. **Architektur, Bedienung und Automatisierung:** gemeinsame Ursachen und sinnvolle Wiederverwendung bewerten;
   kleine begründete Änderungen mit Regressionstests umsetzen, größere Strukturänderungen gesondert planen.
5. **Bereinigung:** vollständigen, revisionsgebundenen Vorschlag vorlegen. Nach ausdrücklicher Freigabe nur
   exakt bestätigte Ziele bearbeiten, Folgen prüfen und tatsächlichen Platzgewinn messen.
6. **Abschlussprüfung:** passende Teilprüfungen, vollständiges lokales Gate, erforderliche native Abnahmen und
   gegebenenfalls freigegebene Veröffentlichung getrennt nachweisen.
7. **Abschlussbericht:** Go/No-Go, Restaufträge und kommende Erweiterungen klar priorisiert festhalten.

Felix bestätigt am 23. Oktober die abschließende Datei- und Dokumentationsbereinigung als Pflicht direkt vor
dem Auditabschluss. Eine führende Datei je Thema, kurze Einstiege und eindeutiger aktueller Betriebsstand;
Doppelungen, widersprüchliche Hinweise und überholte Anweisungen auflösen. Historische Nachweise bleiben
als solche erkennbar. Keine zusätzliche Auditdatei oder bloße Umformulierung des gesamten Verlaufs anlegen.

Parallele Agentarbeit ist von Felix ausdrücklich erlaubt. Unabhängige Fachreviews für Taxonomie/Betrieb,
Lightroom/Statistik, Artanlage/Medien, UI/Architektur, Speicher/Sicherheit und Website/GitHub verwenden. Dateizuständigkeiten
vorher verteilen; ein Integrationsverantwortlicher führt Befunde und Tests zusammen. Keine konkurrierenden
Edits zentraler Dateien, parallelen Großscans oder eigenen produktiven Läufe. Risikoreiche Korrekturen durch
eine zweite Prüfung gegenlesen lassen. Ein Review ohne konkrete Belege ersetzt keinen ausgeführten Test.

## 5. Speicherbedarf, Aufbewahrung und Bereinigung

Sicherungszweck, Notwendigkeit und maximale Anzahl pro Klasse müssen **vor Auditbeginn** anhand der
nachfolgenden Regeln und Entscheidungstabelle entschieden sein. Aktive Daten, Cache, Quelle und Herkunftsbeleg
nicht pauschal als Backup behandeln. Jede später neu erkannte Sicherungsklasse vor ihrer Erstellung,
Rotation oder Entfernung gesondert klären; erforderliche Schutzbindungen niemals für ein Zahlenlimit opfern.

### 5.1 Einmalige nachvollziehbare Inventur

Programmordner, tatsächlich konfigurierten Datenordner und ausdrücklich zugehörige externe Ablagen getrennt
inventarisieren. Dateianzahl, logische Bytes, soweit zuverlässig ermittelbar belegten Speicher, GB/GiB und
Messzeitpunkt ausgeben. Große Unterordner und Dateien nach Anteil ordnen. Verknüpfungen/Hardlinks gesondert
erkennen; keine Schleifen, unbemerkten externen Traversierungen oder doppelten Größenangaben.

Mindestens diese Gruppen unterscheiden:

- aktiver Master, aktives Lightroom-Paket und gemeinsam gebundene Veröffentlichung;
- genau ein vorheriges verifiziertes, kompatibles Master-/Paketpaar als vereinbarter Rücknahmestand;
- aktive CoL-/Ergänzungsquellen, Roharchive und Snapshots einschließlich tatsächlicher Aufbauabhängigkeiten;
- inkrementelle Vergleichsgrundlagen, wiederverwendbare Indizes und abgeleitete Caches;
- Kandidaten, fertige/fehlgeschlagene/pausierte Aufträge, Zwischenstände und Veröffentlichungsvorbereitungen;
- Identitätsregister, eigene Namen, Konfliktentscheidungen, Quellenreparatur und historische Herkunftsbelege;
- Projektmedien, Originale, Designquellen, offene Medienprüfungen und deren Sicherungen;
- Umzugskopien/-sicherungen, Testbestände, Messdateien, alte Logs und automatisch verwaltete Temp-Sitzungen;
- Werkzeuge, Abhängigkeiten, Installations-/Builddateien und Git-Daten, getrennt von fachlichen Laufzeitdaten.

Nicht alles außerhalb des aktiven Master-/Paketpaars ist unnötig. Für jeden großen Bestand Besitzer,
Erzeugungsweg, Leser, Wiederaufbaukosten und Löschbedingung feststellen. Ein nicht gefundener Textverweis
beweist keine Entbehrlichkeit: dynamische Pfade, Manifeste, SDK-Aufrufe und externe Website-Nutzung prüfen.

### 5.2 Schutzmenge und konkrete Löschbarkeit

Die vereinbarte Aufbewahrung **aktiv plus ein vorheriges verifiziertes Paar** ist der Zielzustand für
Master-/Paket-Rücknahmestände, keine Erlaubnis, dafür noch benötigte Quellen oder Nachweise zu entfernen.
Eine Abhängigkeitsprüfung muss mindestens aktive/vorherige Veröffentlichung, offene Aufträge und Prüfungen,
gebundene Quellen, eigene Entscheidungen, Identität, inkrementelle Baselines und noch lesende Prozesse schützen.
Unbekannte Zuordnung oder unlesbares Manifest bedeutet geschützt, nicht leer oder verwaist.

Besonders beachten:

- Die **187 zurückgestellten Klassifikationsfälle** sind echte fachliche Entscheidungen mit erhaltenen
  bisherigen IDs/Zuordnungen, keine alten Test-Rückstellungen und kein zu löschender Datenmüll.
- Vier historische technische Ersatz-IDs und ursprüngliche Aufnahme-/Reparaturbelege bleiben geschützt,
  solange sie Identität, Herkunft oder Wiederaufnahme belegen. Alter allein begründet keine Löschung.
- Historische Umzugs-/Reparaturjournale nicht nachträglich umschreiben, wenn Prüfsummen oder Revisionen daran
  gebunden sind. Aktuelle Pfadauflösung und historische Dokumentation getrennt konsistent halten.
- SQLite-WAL/SHM, Prozess-Leases, aktive Temp-Dateien und Review-Backups nicht nach Dateinamen löschen.
- Alte `Testlauf`-/Umzugs-/Sicherungsbestände einzeln zuordnen. Frühere Freigaben nur für ihre exakten Ziele
  verwenden, nicht als Freigabe einer ganzen Ordnerklasse.
- Keine Git-Historie umschreiben, Geheimnis-/Kontocaches entfernen, Werkzeuge deinstallieren oder
  Entwurfs-/Originalmedien löschen, nur weil sie nicht im öffentlichen Artefakt benötigt werden.

Der Bereinigungsplan enthält je Ziel: aufgelösten absoluten Pfad, Dateien/Bytes, Kategorie, Referenzprüfung,
aktuellen Fingerabdruck, ausgeschlossene Unterbestände, erwartete Einsparung, Wiederherstellbarkeit und Kosten.
Vor Ausführung Schutzmenge/Prozesse/Revision frisch prüfen; geänderte Eingänge machen den Plan ungültig.
Keine Sammellöschung am Programm- oder Datenwurzelordner. Bei Teilfehlern tatsächliche Wirkung erfassen;
keine Wiederholung gegen inzwischen veränderte Ziele. Danach aktiven Stand und Rücknahmestand erneut prüfen.

### 5.3 Nachhaltige Größenbegrenzung

Vorhandene [Speicherpflege](taxonomy-storage-maintenance.md) gegen das ganze Inventar abgleichen: ihre
Zuständigkeit für bestimmte Auftrags-/Releaseordner nicht als vollständige Quellen-/Medienbereinigung verkaufen.
Für bislang ungeregelte Klassen Aufbewahrung und Zuständigkeit definieren. Automatisierung nur für eindeutig
eigene, freigegebene und nachweislich nicht mehr gebundene Ableitungen; Unklarheiten konservativ behalten.
Vorhersagbares Speicherbudget, benötigten freien Platz, Wachstumsursachen und verständliche Vorabhinweise prüfen.
Cache-Löschung darf einen schnellen inkrementellen Lauf nicht ohne dokumentierten Grund wieder zum Vollaufbau machen.

### 5.4 Kritische Sicherungsbewertung und bestätigte Grenzen – 7. Oktober

Nicht die vorhandenen Zahlen ungeprüft fortschreiben. Maßstab ist jeweils: Welchen konkreten Verlust
verhindert die Kopie, ist das Original unersetzbar, gibt es bereits eine verifizierte unabhängige Kopie,
wie schnell erkennt man Fehler und wie teuer/unsicher wäre eine Neuerzeugung? Ein lokaler Rücknahmestand
schützt nicht gegen Laufwerksverlust; viele gleichartige Kopien schützen nicht automatisch besser.

Ausgangsstand des Codeabgleichs am 7. Oktober: zehn NAS-Archive, je 20 kleine Bearbeitungsstände und ein
Medienvorgänger je Art/Typ mit gemeinsamem 500-MiB-Budget. Felix hat die folgenden reduzierten Grenzen
und ausdrücklich den vollständigen Wegfall dieses Medienbudgets bestätigt. Umsetzung, Testnachweise und
tatsächliche Bereinigung getrennt unter 5.6 führen; die Bestätigung allein ist noch kein Ausführungsnachweis.

| Klasse | Ausgangsstand | Bestätigte Zielregel | Warum / notwendige Bedingungen |
| --- | --- | --- | --- |
| Lokales Master-/Lightroom-Paar | aktiver Stand plus ein verifizierter Vorgänger, bereits von Felix entschieden | **beibehalten: ein Vorgängerpaar** | schneller gemeinsamer Rollback, keine parallelen zusätzlichen Vollkopien desselben Paars; benötigte Quellen/Belege weiterhin schützen |
| Externe vollständige Wiederherstellung | höchstens 10 NAS-Archive | **3 geprüfte Wiederherstellungsstände**: zwei jüngere plus ein bewusst älterer geprüfter Kontrollstand | Laufwerksverlust und erst später bemerkte Fehler sind andere Risiken als sofortiger Rollback; 10 große Vollarchive ohne zeitliche Staffelung unnötig teuer, nur der allerletzte Stand dagegen zu fragil |
| Kleine Artenlisten-Bearbeitungssicherung | 20 Stände | **5 abgeschlossene, ungebundene sinnvolle Stände** | direkter Rückweg für noch nicht übertragene Änderungen; ältere veröffentlichte Änderungen zusätzlich über Git nachvollziehbar; 20 ist nicht fachlich begründet, spart als JSON aber voraussichtlich wenig Großbestandsspeicher |
| Kleine Taxonomie-Bearbeitungssicherung | 20 Stände | **5 abgeschlossene, ungebundene sinnvolle Stände** | gleicher Zweck; nicht mit privaten globalen Namens-/Identitätsregistern verwechseln, deren Historie nicht pauschal auf fünf Einträge kürzen |
| Vorheriges Medium je Art und Typ | 1, gemeinsames Budget 500 MiB | **1 logischen Rücknahmestand behalten, kein globales Medienbudget** | die einzige Rücksicherung einer anderen Art nicht zur Einhaltung einer pauschalen Bytegrenze verdrängen; offene Vorgänge/Originale zusätzlich schützen |
| Rücknahme eines offenen Eingriffs/Reviews | V-01 bestätigt | **1 notwendiger Rücknahmesatz je offenem Vorgang** | vollständig bis zum geprüften Abschluss; nach Abschluss **0 entbehrliche Zusatzkopien**; Inhalt und Eigentum an Vorgang binden |
| Kopien eines abgeschlossenen Umzugs / abgeschlossene zusätzliche Reparaturkopien | unterschiedlich, keine Bestandsinventur | **0**, sobald belegbar ungebunden und entbehrlich | kein dauerhafter Nutzen neben geprüftem aktiven Stand und verifiziertem Rückweg; echte Herkunfts-/Entscheidungsbelege separat behalten |
| Temp, Testfixtures/-logs und reproduzierbare Build-/Cachekopien | nicht als Sicherungen begründet | **0 zusätzliche Sicherungen** | erneut erzeugbar; das benötigte Original eines Auftrags, ein Testquelltext oder eine inkrementelle Baseline ist nicht automatisch entbehrlicher Temp |
| Originale benötigter Anbieterquellen / Reparaturaufnahmegrundlagen | an Veröffentlichungen, Identität oder Aufträge gebunden | **keine zusätzlichen Kopien desselben Inhalts**; gebundene Originalversionen behalten | exakter älterer Quellenstand möglicherweise nicht erneut lieferbar; ein neuer Download ist kein Ersatz desselben historischen Inputs |
| Eigene Namen, Identitätsentscheidungen, Nutzungs-/Herkunftsbelege und noch unveröffentlichte Originalmedien | nicht vollständig durch öffentliches Git abgedeckt | **in verifizierter externer Sicherung enthalten**, keine verstreuten Vollklone | hohe Unersetzbarkeit; diese Inhalte nicht löschen, nur weil es wenige oder viele davon gibt |

**Warum drei externe Stände statt zehn oder nur einem?** Zwei jüngere erlauben Rückkehr vom zuletzt
gesicherten fehlerhaften Zustand; ein älterer geprüfter Stand erhält eine längere Entdeckungsfrist. Nicht
einfach bei jedem kleinen Speichern drei unmittelbar aufeinanderfolgende Vollarchive erzeugen. Den älteren
Kontrollstand bewusst halten und erst nach geprüftem Ersatz wechseln; bei unverändertem Inhalt kein neues
Archiv. Ohne gesonderte Langzeitpflicht ist zehn keine überzeugende Standardanzahl für große Vollarchive.
Die tatsächliche zeitliche Abdeckung muss aus dem später gemessenen Änderungs-/Sicherungsverhalten hervorgehen.
Der Ausgangscode rotierte lediglich nach Änderungsdatum. Der bestätigte Auftrag verlangt zusätzlich
echte Inhaltsprüfung und einen geschützten älteren Kontrollstand; `MaxBackups = 3` allein genügt nicht.
Alte Archive ohne nachprüfbares Inhaltsmanifest zählen nicht als moderne verifizierte Wiederherstellungsstände
und werden nicht ungefragt für dieses Limit gelöscht. Drei geprüfte Stände sind nicht drei beliebige ZIP-Dateien.

**Umfang wichtiger als Anzahl:** Gegenwärtig sichert das NAS-Skript den breiten Projektbestand einschließlich
`Daten`, Git und lokal installierten Werkzeugen. Nicht vorschnell `Daten` ausschließen: genau dort liegen
private Entscheidungen und der teure aktuelle Datenstand. Nach vollständiger Restoreprüfung kann ein
präziserer Wiederherstellungssatz ohne unnötige fertige Testkandidaten, wiederholte Quellkopien, ersetzbare
Installationsdateien und bereits separat gesicherte Duplikate sinnvoll sein. Installer/Lockfiles/Versionen
und Offlinebedarf vorher prüfen; nicht behaupten, jeder Anbieterstand oder jedes Werkzeug sei jederzeit
identisch neu ladbar. Inhaltsbasierte/incrementelle externe Ablage als spätere Optimierung bewerten, keine
neue abhängige Sicherungskette ohne getestete Wiederherstellung einführen.

**Prüfen vor Rotation:** Neues Backup zuerst vollständig prüfen und Restorefähigkeit nachweisen, erst danach
ein älteres ersetzen. Gleicher Git-Commit ist kein Nachweis identischer lokaler Daten. Die aktuelle
Bestandsbindung ist hilfreich, ersetzt aber keinen tatsächlichen Restoretest. Die Anzahl kleiner
Bearbeitungsstände gilt nur für nicht mehr an offene Vorgänge gebundene Stände; Schutzbindungen niemals
zum Erfüllen eines Limits opfern. Die fünf kleinen Stände gelten **global je Sicherungsklasse**, nicht fünf
pro Art. Der alte globale Budgetpruner konnte den einzigen Rücknahmestand einer anderen Art entfernen;
deshalb entfällt er vollständig. Offene Vorgänge und unersetzbare Originale einschließlich manuell
übernommener Karten bleiben geschützt. Ein unlesbarer Auftrags-/Reviewstand darf nicht als leere Schutzmenge
gelten; eine begonnene Veröffentlichung ist noch kein nachgewiesener Abschluss.
Ein Rückverweis auf Git ist nur Ersatz einer **zusätzlichen identischen Medienkopie**, wenn die exakte
Version vorhanden, erreichbar und isoliert wiederherstellbar ist. Unveröffentlichte Originale oder allein
lokale Zwischenstände lassen sich nicht aus Git rekonstruieren. Diese Optimierung ist nicht implementiert;
ein erforderliches Medium niemals allein wegen eines vermuteten Git-Vorkommens entsichern.

**93 GB nicht als garantierten Einsparbetrag behandeln:** Externe NAS-Archive liegen normalerweise außerhalb
des Programmordners; ihre Reduzierung verkleinert nicht automatisch diesen Ordner. Seine Größe kann durch
aktive Daten, verschiedene notwendige Quellen, Kandidaten oder Umzugskopien entstehen. Rohgröße und
komprimierte Archivgröße getrennt messen; kein geschätzter Kompressionsfaktor oder pauschales Löschversprechen.

Quellen der Istgrenzen: [Speicherpflege](taxonomy-storage-maintenance.md),
[NAS-Vertrag](multi-device-backup-plan.md), `species-explorer/asset-backups.mjs`,
`species-explorer/taxonomy-edit.mjs`, `species-explorer/backup-service.mjs` und `scripts/nas-backup.ps1`.
Pipeline-Logs sind Diagnoseausgaben, keine Sicherungen; ihre Lebensdauer separat als Log-/Tempregel bewerten.

### 5.5 Vorabentscheidungen und Startgrenze

| Entscheidung | Inhalt | Status |
| --- | --- | --- |
| V-01 | für bisher ungeregelte Zusatzsicherungen ein notwendiger Rücknahmesatz je offenem Vorgang; nach geprüftem Abschluss keine entbehrlichen Zusatzkopien dauerhaft | **von Felix am 5. Oktober bestätigt**, keine Freigabe konkreter Löschziele |
| B-02 | NAS drei geprüfte Stände mit älterem Kontrollstand, kleine Bearbeitungsstände je fünf, Medien ein Vorgänger je Art/Typ ohne globales Budget; sonstige Schutzbedingungen aus 5.4 | **von Felix am 7. Oktober zur Umsetzung vor dem Audit bestätigt**, einschließlich tatsächlicher Bereinigung; Ausführungsnachweise unter 5.6 |
| Parallelität | unabhängige Agentarbeit mit getrennten Zuständigkeiten und gemeinsamer Integration | **von Felix erlaubt** |
| Native Restabnahmen | Schwarzstorch-Artabbruch und Lightroom ohne vorherige Warnmeldung | **nutzerbestätigt**, nicht erneut pauschal als ausstehend führen |
| Eine führende Auditdatei | Auftrag, Vorabregeln, Empfehlungen, Entscheidungen und spätere Auditfragen nur hier pflegen | **von Felix am 7. Oktober beauftragt** |

Die Zielwerte sind geklärt. Ihre Umsetzung benötigt Code-/Vertragstest und Dokuabgleich. Für bislang andersartige neu
entdeckte Sicherungsklassen vor Erstellung/Rotation/Entfernung Zweck und Grenze ausdrücklich klären.
Konkrete Bereinigung, produktive Änderungen und Veröffentlichung bleiben getrennte Freigaben.
Auch nach Klärung der Empfehlungen benötigt das Gesamtaudit seinen Startauftrag.

### 5.6 Vor-Audit-Umsetzung und reale Bereinigung – 7. Oktober

Diese Vorarbeit ist noch kein Phase-10.5-Audit. Die folgenden Befunde stammen aus kleinen Bindungsdateien
und einer einmaligen Dateimetadaten-Inventur, nicht aus erneutem produktivem Datenbankaufbau.

- Gemeinsamer Datenordner: 215 Dateien, 98.604.281.432 Bytes. Eine Einsparung in dieser Größenordnung ist
  nicht zugesagt. Aktiver/verifizierter Vorgänger, Originalquellen und Reparaturaufnahmegrundlagen bleiben geschützt.
- NAS-Ausgangsbestand: vier Programmarchive von Juni bis August, zusammen 3.847.906.114 Bytes; keines
  enthält den heutigen `Daten`-Ordner. Ihre alten Manifeste enthalten keine vollständigen Datei-Prüfwerte.
  Felix hat eine aktuelle vollständige, rückgelesene NAS-Sicherung nach bestandenen Tests gesondert freigegeben.
  Bis zu diesem Nachweis bleiben diese vier Archive erhalten. Felix hat anschließend genau die beiden
  Juli-Archive `IUCN_Datenbank_2026-07-02_182815_9e9660a226e4.zip` und
  `IUCN_Datenbank_2026-07-05_100456_fc92430634c9.zip` mit zusammen 2.079.388.285 Bytes zur endgültigen
  Entfernung nach erfolgreicher aktueller Vollsicherung freigegeben. Die fehlende vollständige Überdeckung
  einiger historischer lokaler Originalvarianten in Juni/August wurde vorher ausdrücklich erläutert.
  Juni und August bleiben erhalten, sind aber keine heutigen verifizierten vollständigen Datenbanksicherungen.
- Artenlisten: 19 verwaltete Sicherungen; fünf jüngste behalten. Felix hat die 14 älteren Stände vor dem
  26. September mit zusammen 149.071 Bytes zur endgültigen Entfernung bestätigt. Keine passenden kleinen
  `taxonomy-…`-Bearbeitungssicherungen vorhanden; andere JSON-/Backfillfamilien nicht pauschal löschen.
- Frühere verschobene Altdateien: Felix hat genau 15 Testbilder, Test-MP3 und Serverlogs unter
  `temp/altreste-2026-10-04` mit 3.037.671 Bytes zur endgültigen Entfernung bestätigt. Das kleine
  Verschiebungs-/Prüfmanifest bleibt als Beleg erhalten. Zusammen 29 freigegebene Dateien, 3.186.742 Bytes;
  Entfernung ausgeführt: alle 29 einzeln vor Entfernung gegen aufgenommene SHA-256-Prüfwerte und aktuelle
  Schutzmenge geprüft; nachher alle 29 abwesend, genau fünf Listenstände und Verschiebungsmanifest erhalten.
  3.186.742 logische Bytes entfernt; keine neue Kopie dieser entbehrlichen Altdateien erstellt.
  Dauerhafte Einzelziel-/Prüfwertquittung unter `Daten/backup-cleanups/2026-10-07-local-altfiles.json`.
- Medienbestand: 20 Rücknahmesätze mit 12.402.885 Bytes, keine überzähligen Gruppenstände. Keine aktive
  Artanlagen-/Medienreview-Pinmenge bei der aktuellen lesenden Prüfung. Daher keine Medienlöschung nötig.
- Zusätzliche große Masterslots bleiben vorerst gebunden: Legacy `active`/`previous`, konsumiertes `staging`
  und der ursprüngliche Source-Recovery-Kandidat sind in Auftrags-/Reparaturbelegen referenziert. Nicht als
  beliebige alte Vollkopien entfernen. Für `staging` ist der Verbrauch durch die aktive Veröffentlichung
  dokumentiert; der Speichervertrag schützt den aktuellen Auftrag dennoch. Eine sichere Abschluss-/Entbindungsregel
  ist als Auditthema zu prüfen, ohne historische Originalrezepte oder Prüfsummen nachträglich umzuschreiben.
- Die historische Pfadbindung wird im Speicherpflege-Rezeptvergleich noch nicht überall über die verifizierte
  Umzugsauflösung projiziert. Die Folge ist konservativer Gesamtschutz, keine freigegebene Löschmenge.
  Im Audit korrigierbar mit Umzugs-/Schutzregression, nicht durch Änderung der Originaljournale.
- Kleiner Pfadwechsel-Rücknahmesatz, Audio-Migrationsoriginale und Reparaturbelege sind nicht allein wegen
  ihres Alters entbehrlich. Ihre jeweilige Abschluss-/Rückwegbedingung vor gesonderter Bereinigung prüfen.

Technische Umsetzung vor dem Audit abgeschlossen: lokale fünf/fünf/Medien-eins-Regeln ohne globales
Medienbudget; Schutz offener Vorgänge auch beim Ersetzen des Vorgängers; bytegeprüfter Austausch und
Fehlerrücknahme. Wiederholte Karten-/Soundwahl bleibt bedienbar, ursprünglicher offener Rücknahmesatz unverändert.
NAS-Vertrag mit vollständigem v2-Inhaltsmanifest, Projektbindung, tatsächlicher Rückleseprüfung,
geschütztem älteren Kontrollstand und revisions-/prüfwertgebundener Rotation implementiert. Unbekannte,
defekte, fremde und unterbrochene Archive bleiben zusätzlich geschützt. Vor-/Nach-Datenzustand aus derselben
Datei-Hashinventur abgeleitet, keine redundanten zusätzlichen vollständigen Datenlesungen nur für diesen Hash.

Erste gezielte Gegenproben: 60/60 lokale Sicherungs-/Artanlagen-/Medien-/Oberflächenfälle und 18/18 NAS-Fälle
bestanden, keine Fehler/Abbrüche/Skips. NAS umfasst Hauptskript mit echten kleinen ZIP-Fixtures, unveränderten
Skip, geänderten Eingangsstand, falsche/ersetzte Archive, Teilfehler und Wiederaufnahme. Syntax/Stil und
lokale Dokumentationsverweise bestanden. Vollständiges `quality:ci` bestanden: 50 Gruppen, 1.247 Tests,
  null Fehler, Abbrüche oder Skips, Exit 0. Der erste reale NAS-Aufruf stoppte noch vor Archiv-Erzeugung,
  weil `Get-Item` den versteckten `.git`-Ordner ohne `-Force` nicht lesen konnte. Eng korrigiert mit
  unveränderten Pfad-/Reparse-/Prüfwertsperren; zusätzliche echte Hidden-Git-/Hidden-Daten-/Hidden-ZIP-Probe.
  Danach 19/19 NAS-Tests und Syntax/Stil erneut bestanden. Keine alten Archive durch den Fehlversuch entfernt.
  Danach das vollständige Gate erneut bestanden: 50 Gruppen, 1.248 Tests, null Fehler/Abbrüche/Skips.
  Beim zusätzlichen Abschlusscheck zeigte sich ein tatsächlich fehlender Artanlage-Abschlussnachweis:
  ein fertig gepushter Auftrag hätte seinen Rücknahmesatz dauerhaft geschützt und spätere zweite
  Medienbearbeitung blockiert. Den eigenen noch ungeprüften NAS-Lauf dafür kontrolliert angehalten;
  ausschließlich dessen 9.343.638.274-Byte-Zwischen-ZIP nach Prozessende entfernt, keine alte Sicherung.
  Der Arttransfer besitzt nun einen gebundenen vorbereiteten Commit-/Art-/Medienstand und eine dauerhafte
  Pushquittung; erst danach kompakter historischer Abschluss und Freigabe der normalen Medienpflege.
  Erfolgreicher Push, Pushfehler mit erneuter Übertragung ohne zweiten Commit, Wiederaufnahme nach Push
  vor Quittung, alte Tokens, unverändert geschützte historische `publicationStarted`-Aufträge und zweimalige
  spätere echte Karten-/Soundbearbeitung gezielt bestanden. Pages-Fehler bleibt vom lokalen Abschluss getrennt.
  Gemeinsame abschließende Sicherungs-/Artanlage-/Pipeline-/Medien-/Oberflächenprüfung: 73/73 bestanden,
  null Fehler/Abbrüche/Skips. Syntax/Stil und 80 lokale Markdown-Verweise erneut bestanden.
  Vollständiges Gate für diesen Stand: 50 Gruppen, 1.255 Tests, null Fehler/Abbrüche/Skips.
  Zusätzliches Gegenreview bindet auch generische, vor dem Arttransfer erzeugte Medienvorschau-Tokens
  an den ursprünglichen Artauftrag; frische spätere Vorschauen bleiben unabhängig davon frei.
  Ein geänderter Git-Stand bei Wiederholung eines vorbereiteten Transfers meldet einen Schutzfehler
  statt einer wirkungslosen No-op-Erfolgsschleife. Keine automatische Neubindung historischer Belege.
  Abschließendes unabhängiges Review: 27/27 Artanlage-Abschlussfälle bestanden. Die beiden zusätzlich
  gefundenen Randfälle mit echten alten HTTP-Medientokens und einem nach Pushfehler geänderten Git-Stand
  sind korrigiert und separat mit 5/5 gezählten Fällen abgesichert. Gemeinsame abschließende
  Sicherungs-/Artanlage-/Pipeline-/Medien-/Oberflächenprüfung danach: 75/75 bestanden, null Fehler,
  Abbrüche oder Skips. Vollständiges finales `quality:ci`: 50 Gruppen, 1.257 Tests, null Fehler,
  Abbrüche oder Skips, Exit 0. Der tatsächliche aktuelle NAS-Abschluss ist nachfolgend belegt;
eine geprüfte Archiv-Inhaltsrücklesung nicht mit nativer Wiederherstellung/Programmstart aus dem Großarchiv gleichsetzen.
Keine zweite Audit-/Vorabentscheidungsdatei anlegen.

Reale NAS-Ausführung und Abschluss am 7. Oktober:

- Vollsicherung `W:\Website Datenbank Backup\IUCN_Datenbank_2026-10-07_215313_b13afd861ad7.zip`
  erfolgreich erzeugt und vollständig zurückgelesen: **3.459 Dateien, 100.066.048.623 Inhaltsbytes**;
  ZIP-Größe **21.785.161.273 Bytes**. Darin der gesamte gemeinsame Datenordner mit **217 Dateien,
  98.604.289.329 Bytes**, einschließlich der neu hinzugekommenen kleinen Bereinigungsbelege.
- Manifest v2 und SHA-256 sämtlicher archivierter Dateien geprüft; Vor-/Nach-Eingangsstand identisch.
  Gesamtarchiv-Prüfwert `33920bbd3d3231f181043b5033e6698795c43c7bb645e87d2ddcf8c607320daa`;
  Archiv-ID `9f50eb9e-be21-454d-b29f-b0bd18cdcff8`. Sicherung enthält den bewusst unveröffentlichten
  Arbeitsstand auf Basis `b13afd861ad753335835d9a60aa1075598e4d6ee`, nicht lediglich diesen alten Commit.
  Gesamtlauf Exit 0, `archiveVerified = true`, Rotation abgeschlossen ohne Warnung und ohne alte Archive
  zu entfernen. Die vier Altarchive wurden zuvor ausdrücklich als geschützt nachgewiesen.
- Danach ausschließlich die zwei frisch bestätigten Juli-Archive entfernt: **2 Dateien, 2.079.388.285 Bytes**.
  Größe/Hash jedes Löschziels und die aktuelle Vollsicherung erneut geprüft. Tatsächlicher Endzustand:
  neue Vollsicherung plus Juni/August vorhanden, beide Juli-Originale und eigene Quarantänereste abwesend.
  Diese historische Entfernung ist endgültig, einschließlich des vorher ausdrücklich erläuterten Verlusts
  nicht vollständig in Juni/August nachgewiesener damaliger lokaler Originalvarianten.
- Das einmalige Bereinigungshilfswerkzeug stoppte zunächst bei einem nicht verfügbaren PowerShell-Hashbefehl
  ohne Löschwirkung und danach bei der eigenen Delete-pending-Lesesperre mit einer tatsächlichen Teilwirkung.
  Beide Zustände lesend geprüft; .NET-Hash und Freigabe eigener Handles vor der Nachkontrolle korrigiert.
  Bekannter SHA-Testwert und echte kleine Windows-PowerShell-Temp-Löschprobe bestanden. Teilwirkung im
  Vorgangsbeleg nach tatsächlicher Abwesenheitsprüfung nachgetragen, ausschließlich das übrige genehmigte
  Archiv entfernt; Abschluss Exit 0. Summenfeld aus beiden Einzelfällen berichtigt, nachdem PowerShell die
  neu hinzugefügte Dictionary-Zeile beim Mischtyp-Aggregat ausgelassen hatte. Kein weiterer Löschvorgang.
- Mit den bereits entfernten 29 lokalen Altdateien ergibt das **31 freigegebene Altdateien,
  2.082.575.027 Bytes**. Der lokale Großbestand wurde dadurch nicht pauschal verkleinert: gebundene
  Datenbanken, aktive/verifizierte Vorgänger, Herkunfts-/Reparaturbelege und aktuelle Medien blieben erhalten.
  Die neue Vollsicherung belegt ihrerseits zusätzlichen NAS-Speicher; entfernte Altbytes nicht als
  Netto-Speichergewinn über beide Laufwerke ausgeben.
- Die **drei physisch verbleibenden NAS-Archive sind ein moderner geprüfter Vollstand und zwei geschützte
  Altarchive**, nicht drei gleichwertige moderne Vollsicherungen. Die bestätigte Drei-Stände-Rotation ist
  implementiert und isoliert geprüft; weitere echte jüngere Stände entstehen bei künftigen Änderungen,
  keine künstlichen identischen Großkopien nur zum Erreichen der Anzahl erzeugen.
- Dauerhafte operative Quittungen: `Daten/backup-cleanups/2026-10-07-local-altfiles.json` und
  `Daten/backup-cleanups/2026-10-07-nas-july-archives.json`. Dies sind Dateivorgangsbelege, keine zweite
  Audit-Anweisungsdatei. Gesamtaudit und native Großarchiv-Wiederherstellung weiterhin nicht ausgeführt;
  keine produktive Taxonomie-/Katalog-/Medienaktion oder neue Veröffentlichung.
- Nach dauerhaftem Abschlussbeleg die 14 selbst erzeugten NAS-/Bereinigungs-Hilfsdateien mit 25.620 Bytes
  aus fünf exakt eigentumsgeprüften, prozessbeendeten Temp-Sitzungen entfernt, anschließend deren leere
  Verzeichnisse. Keine unbekannte Sitzung oder pauschale Temp-Wurzel bereinigt. Diese eigenen Laufhilfen
  zusätzlich zu den 31 genehmigten Altdateien zählen, nicht als weitere Nutzerdatei-Löschfreigabe ausgeben.
- Felix hat anschließend ausdrücklich Commit und Push der abgeschlossenen Vorbereitungsserie beauftragt.
  Nur Quell-/Test-/Dokumentationsdateien veröffentlichen; Datenbanken, private Konfiguration und Temp
  bleiben außerhalb von Git. GitHub-Qualitätsprüfung und Pages des konkreten neuen Commits bis zum
  Endzustand begleiten; lokale Tests allein sind kein Deploymentnachweis. Keine Audit-Ausführung ableiten.

## 6. Fachliche und technische Arbeitspakete

### A. Projektgliederung und Architektur

- Je Datei/Dateiklasse Bereich, Rolle, Verbraucher, Erzeuger und Notwendigkeit erfassen, auch für kleine
  Grafiken, Skripte, Designquellen und Werkzeuge. Ergebnis: erkennbare Gliederung Explorer/LR-Plug-in/Website/
  gemeinsame Bausteine/Daten/Tests/Temp/Doku mit begründeten, falls nötigen Strukturänderungen.
- Git-Zuordnung nach den Regeln dieses Auftrags dokumentieren: versioniert, erzeugtes Artefakt, dauerhafte lokale Daten,
  extern gesichert oder entbehrlicher Tempbestand. Je Klasse das Warum und den Wiederherstellungsweg nennen;
  tatsächliche Git-Dateiliste, `.gitignore`, Pages-Artefakt und Backupumfang gegenprüfen.
- Grundzuordnung: Quellcode, notwendige kontrollierte Tests/Fixtures, Schemas, Lockfile, Build-/Workflows und
  aktuelle Doku ins Git; öffentliche Projekt-Artendaten/Overrides/Medien/Credits nach bestehendem Vertrag
  ebenfalls. Große Datenbanken/Quellen, private globale Entscheidungen, lokale Aufträge/Nutzungsbelege,
  persönliche Einstellungen und Exporte nicht öffentlich versionieren, aber bei Unersetzbarkeit extern sichern.
  Zugangsdaten niemals veröffentlichen; erzeugte öffentliche Dateien nur bei belegtem Projektvertrag ins Git,
  sonst reproduzierbare Artefakte. Temp, Abhängigkeiten und ersetzbare Builds nicht als Projektinhalt versionieren.
  Git-ignoriert bedeutet weder entbehrlich noch bereits gesichert. Fachliche Projekt-Overrides nicht mit
  privaten globalen Namens-/Identitätsregistern verwechseln.
- Tatsächliche Zuständigkeiten von Website, Explorer-Desktop/Server, Taxonomiediensten, Datenpipeline,
  Lightroom-Plug-in und gemeinsamen Modellen dokumentieren; Kreislaufabhängigkeiten und Doppelwissen suchen.
- Quellcode, versionierte öffentliche Daten/Medien, lokale Laufzeitdaten, erzeugte Artefakte, Tests und
  Betriebsdokumentation klar trennen. Strukturänderungen an einem belegten Problem ausrichten.
- Geschäftsregeln und Zustandswechsel nicht in UI/Eventhandlern mehrfach pflegen. Gemeinsame Services,
  validierte Schnittstellen, wiederverwendbare Präsentationsbausteine und isoliert prüfbare Module bevorzugen.
- Große Einstiegsmodule, verstreute Pfad-/Versions-/Formatkonstanten, versteckte Seiteneffekte, tote Zweige und
  Doppelimplementierungen prüfen. Nicht bloß nach Dateigröße oder fehlendem `rg`-Treffer umbauen/löschen.
- Bestehende öffentliche URLs, Squarespace-Einbindungen, Assetnamen und Plug-in-Registrierungen erhalten.
  Jede erforderliche Pfadänderung braucht Verbraucherplan, Kompatibilität und Rückweg.
- `AGENTS.md` und Doku auf einen klaren aktuellen Einstieg reduzieren; alte Arbeitsserien ausdrücklich
  historisch ablegen/verlinken. Widersprüchliche aktuelle Pfade, Versionen oder Freigaben dürfen nicht fortleben.
- Gesamte Doku, nicht nur AGENTS, nach Themen konsolidieren, kürzen und komprimieren. Überholte aktive
  Anweisungen und unnötige Dopplungen entfernen, notwendige historische Nachweise getrennt erhalten.
  Generierte Fakten nicht mehrfach manuell pflegen; Archiv ist kein Ersatz für eine klare aktuelle Anleitung.

### B. Taxonomie, Identität und Datenherkunft

- Quellenstände, Master-Provenienz und Lightroom-Paket als konsistentes Paar prüfen, einschließlich
  Referenz-/Master-Drift, fehlendem Downloadbedarf und gezieltem Wiederanlauf des noch fehlenden Folgeschritts.
- Original-IDs, historische Ersatz-IDs, Reparaturaufnahmegrundlagen einschließlich `Storchodon cingulatus`,
  eigene Namen, Projektlinks und katalogverwendete IDs erhalten. Prüfmenge aus aktuellen Belegen ableiten,
  nicht alte feste Projekt-/Artenzahlen als heutigen Sollwert verwenden.
- Wissenschaftliche Umbenennung, Namenspräferenz, Klassifikationswechsel, Aufteilung und Zusammenführung
  sauber unterscheiden. Keine automatische Namensähnlichkeitsmigration oder neue IDs für bloße Umbenennung.
- Automatische Behandlung unbenutzter Fälle nur mit belegter Quellenidentität und vollständiger FN-Nutzung;
  unklare neue Gegenstücke konservativ behandeln. Verwendete/projektangelegte/eigens entschiedene Arten schützen.
- Mehrere Quellen, Synonyme, Ränge, Sprachen, Anbieterstandard und eigene Korrekturen fachlich nachvollziehen.
  Herkunft nicht durch nachträglichen Mastereinfluss oder doppelte Quellenresultate verlieren.
- Die Anzeige erhaltener bisheriger Zuordnungen neutral formulieren. Einen neuen geschützten Konflikt dagegen
  nicht durch dieselbe neutrale Meldung verstecken; genau betroffene Art und erforderliche Entscheidung nennen.

### C. Ein-Klick-Gesamtupdate und inkrementelle Verarbeitung

- Ein Klick startet; „Später“ verschiebt bis zur nächsten Explorer-Öffnung. Keine versteckten Großdownloads.
- Bei geöffnetem Lightroom verständliche Rückfrage/Anleitung; auch auf selbst geschlossenes Lightroom im
  Hintergrund warten und anschließend genau einmal starten. Kein hartes Beenden und kein zweiter Auftrag.
- FN-Nutzung aller bestätigten Kataloge aktuell, vollständig und an den Auftrag gebunden erfassen.
  Nicht erreichbare/nicht registrierte Kataloge sind nicht leer; neue Zuweisungen/Revisionen korrekt behandeln.
- Download, Import, Zusammenführung, Schutzprüfung, Paketbau und gemeinsame Übernahme ohne vermeidbare
  zusätzliche Bestätigungen ausführen. Bisheriges Paar bis zum geprüften Wechsel verfügbar halten.
- Unterbrechung, Neustart und Teilerfolg nach jeder Phase prüfen: gleiche Eingänge, passende Revision,
  gezielte Fortsetzung statt unnötigem Quellenlauf oder pauschalem zweitem Vollaufbau.
- Inkrementeller und vollständiger Aufbau müssen fachlich gleichwertige Ergebnisse liefern. Geänderte,
  entfernte und ergänzte Einträge, Suchindizes und eigene Entscheidungen einbeziehen; ungeeignete Baseline
  nachvollziehbar zum sicheren Vollaufbau führen, nicht still zu einem unvollständigen Ergebnis.
- Laufzeit, Lese-/Schreibmenge, Speicher/RAM, UI-Reaktionsfähigkeit und Startaufwand an reproduzierbaren
  isolierten Beständen messen. Kein weiterer produktiver Millionenlauf nur zur Messung ohne Freigabe.
- Fortschritt als Schritt X/Y und korrekt bezeichneten Teilfortschritt zeigen. Keine erfundene lineare
  Gesamtprozentzahl, kein dauerhaftes „Noch kein Abgleich“ nach bereits gestartetem Aufbau.
- Ein eindeutiger Endzustand/eine Zusammenfassung; Quellenabschluss ist kein erfolgreicher Gesamtabschluss.

### D. Artanlage, Bearbeitung und Medien

- Vollständiger Assistent für Allgemeines, Portrait, Karte, Sound und Abschluss; optionale Schritte klar.
  Lange Portraitbearbeitung darf nicht durch ablaufende Vorschau einen kompletten Neuanfang erzwingen.
- Fehlende Karte/HTTP 403 muss Import oder begründetes Überspringen und danach Sound ermöglichen.
  Fehlende Pflichtmedien blockieren Veröffentlichung, nicht Bedienung/Fortsetzung der lokalen Anlage.
- JPEG-/PNG-Datei, Drag-and-drop, Quellen-URL, Herkunft und Prüfung unterscheiden. Sichtbare Browserkarte
  bedeutet nicht automatischen Download; kein gesperrter Abrufweg umgehen oder Erfolg aus HTML/403 ableiten.
- „IUCN-Quelle“, manueller Transport und dauerhaft eigene Kartenpflege fachlich unterscheiden. Zähler und
  spätere Aktualisierungsrechte aus tatsächlicher Herkunft/Pflegeentscheidung berechnen, nicht aus Importknopf.
- Soundablehnung jederzeit zurücksetzbar, auch vor Ausschöpfen aller Treffer; Schnitt, Lizenzentscheidung,
  Spektrogramm und erzeugte Metadaten ohne verwaiste Einträge oder Doppelübertragung behandeln.
- Echter Abbruch nimmt nur eigene unveröffentlichte Anlage zurück; fremde Änderungen und veröffentlichte
  Daten bleiben geschützt. Schließen/Fortsetzen und Löschen einer bestehenden Art sind andere Aktionen.
- Vor/nach erster Speicherung, in jedem Schritt, während eines Workers und nach Prozessneustart testen.
  Kein nötiger Git-Lauf allein für erfolgreich zurückgenommene eigene Anlage, keine dauerhaft rote Altanzeige.
- Späte Medienbestätigung nach Abbruch/Löschen, erneute Anlage gleichen Slugs, doppelte Anfrage und
  detached Sitzung prüfen. Alte Tokens/Reviews dürfen keine neue Art oder fremde Dateien verändern.
- Veröffentlichung darf nicht zwischen Abbruchwunsch und Workerende durchlaufen; wiederholte Fortsetzung/
  Rücknahme muss sicher sein. JSON-/Dateiteilfehler erhalten einen prüfbaren und wiederherstellbaren Zustand.

### E. Lightroom und globale Namen

- Metadatenzugriff gegen tatsächlich dokumentierte SDK-Felder und Rückgabewerte prüfen; keine geratenen Keys.
  Plug-in-Info, installierter Quellstand, Datenvergleich und Pfadauflösung gemeinsam betrachten.
- Einzel-/Mehrfachzuweisung, fehlendes GPS, vorhandene GPS-Daten, Ort/Zeit, Datumsgrenzen und Teilfehler testen.
  Kein Bestätigungsdialog je Foto und keine neuen Vollkatalogscans beim Öffnen des Zuweisungsfensters.
- Taxonomie entfernen, Ort/Zeit entfernen und alle FN-Daten entfernen sauber abgrenzen. FN-eigene Stichwörter
  einschließlich `(FN)*`-Varianten konsistent entfernen, fremde gleichnamige/manuelle Stichwörter erhalten.
  Metadaten- und Keyword-Ergebnis zusammen prüfen; ein leerer Metadatensatz allein genügt nicht.
- Globale Namenswahl ohne Fotozuweisung, Rückwahl, Anbieterstandard und Wiederholen nach Teilerfolg in beiden
  Anwendungen prüfen. Offene Fenster sollen den neuen Stand ohne unnötigen Neustart erkennen.
- Namenswahl ändert keine Identität und bestehende Fotos nicht heimlich. Katalogweite Aktualisierung nur
  innerhalb der fachlichen Eigentums-/Schutzregeln, mit Pause/Abbruch und eindeutigen Teilresultaten.
- Alle bestätigten FN-Kataloge, neu hinzukommende Kataloge, Katalogkopien, virtuelle Kopien und Auswahlwechsel
  untersuchen; tatsächliche SDK-Semantik dokumentieren, nicht einfach vom aktuellen Einzelkatalog ableiten.
- Echte Warnungen von bloßen Pfadschreibweisen unterscheiden. Unvollständige/revisionsfremde Belege weiterhin
  sperren; keine „Reparatur“ durch Ausschalten des Herkunfts- oder Vollständigkeitsvergleichs.

### F. Statistik und Exporte

- Taxonomieabdeckung nur aus zugewiesener Taxonomie (`masterTaxonId`), geteilt durch den Kataloggesamtbestand;
  Ort/Zeit nicht hinzuzählen. Datenqualität der taxonomierten Fotos separat und vollständig berechnen.
- Zeit-/Ort-Schnittmenge und nur Zeit/nur Ort/weder noch aus derselben Grundmenge prüfen. Kein Mischen mit
  allen FN-Orts-/Zeitfotos ohne Taxonomie oder mehrfaches Zählen durch mehrere Stichwörter.
- Ränge aus Metadaten zählen; Arten/Favoriten nach eindeutiger Identität, Favorit bei mindestens einem
  `referenceImage = yes`. Klassen und Artenfotozahlen mit geeigneten Kontrollsummen abgleichen.
- Top-5-Listen, Gleichstände, Jahre/Monate/Monat-Jahr/Tage, Ortsvielfalt und häufigste Orte konsistent;
  Aufnahmedatum/Zeitzone klären. Tagesstatistik benötigt kein neues Stichwort.
- Deutsche Tausenderpunkte, Dezimalkomma, Prozent, korrekte Einzahl/Mehrzahl und einheitlich „Fotos“;
  Null-/Leer-/Unbekanntfälle ohne irreführende Spitzenwerte oder doppelte Statistikblöcke.
- Lifelist, Artenliste und Beobachtungsliste: sinnvoll vorbelegter Dateiname, passende Formate, Gesamtbestand
  oder markierte Fotos, korrekte Gruppierung, Unicode/Trennzeichen/CSV-Escaping und Schutz vor Tabellenformeln.
- Persistenter Index statt erneuter unnötiger Export-Vollscans; Revision, Neuaufbau nach externen Änderungen,
  inkrementelle Aktualisierung, Störung/Abbruch und verständliche veraltete Anzeige prüfen.

### G. Einheitliche Oberfläche und Wiederverwendung

- Drei eigene vollständige Layout-/Bedienchecklisten und Nachweise: **LR-Plug-in**, **Arten-Explorer** und
  **Website**. Alle zugehörigen Fenster/Seitentypen einbeziehen, nicht nur letzte Screenshots.
- Gemeinsame Begriffe, Formate, Abstandssystem, Buttonrollen, Hinweise und Zustandsanzeigen über Explorer,
  Lightroom und Website prüfen. Native SDK-Oberflächen müssen nicht technisch HTML-Komponenten verwenden,
  sollen aber dieselbe fachliche Bedienlogik ausdrücken.
- Gemeinsame Dialog-/Formular-/Feedback-/Listenbausteine ausbauen, wo sie echte Doppelpflege beseitigen.
  Kein neues Framework nur aus Stilgründen; gemeinsame Regeln nicht in mehrere Oberflächen kopieren.
- Buttontexte müssen Wirkung und Reichweite erklären, insbesondere Namenswahl, Rückwahl, Anbieterstandard,
  Speichern wiederholen, Entfernen, Abbruch und Schließen. Obsolete/identische Aktionen zusammenführen;
  unterschiedliche Reichweiten nicht unbemerkt unter einem Knopf vermischen.
- Mouseover/Tooltips aller erklärungsbedürftigen Aktionen auf Vorhandensein und Verständlichkeit prüfen:
  Wirkung, Umfang, Datenfolgen und gegebenenfalls Rückweg. Keine bloße Wiederholung des Labels;
  wesentliche Hilfe auch ohne Hover/per Tastatur, auf Touch-Geräten und bei deaktivierten Buttons zugänglich machen.
- Ränder/Ausrichtung, Hinweisbeginn unter dem zugehörigen Button, Vorschau-/Scrollbreite, überflüssige
  Leerflächen, doppelte Abschlussbuttons und nicht gewählte „Zuletzt verwendet“-Vorauswahl prüfen.
- Leere Suche nicht unnötig automatisch starten. Debounce, parallele Antworten, Suchzustand, Filter,
  Fokusblockaden und neue Artanlage bei aktivem Filter gegentesten.
- Kleine/große Fenster, lange deutsche Namen, leere/große Ergebnislisten und Windows-Skalierung prüfen.
  Tastaturreihenfolge, Fokus, Escape/Abbruch, Screenreader-Beschriftung, Kontrast und Farb-unabhängige Hinweise.
- Fehler-/Hilfetexte für normale Anwender ohne Programmier- und Programmkenntnisse: Was ist passiert,
  sind Daten betroffen/erhalten, und was soll ich jetzt konkret tun? Details optional. Technische Lua-/
  Providertexte nicht ungefiltert als alleinige Anleitung zeigen; Warnungen weder inflationär noch versteckt.

### H. Automatisierung und notwendige Entscheidungen

Für jede Wartungs-/Menüaktion eine Tabelle anlegen: Auslöser, aktuelle Klicks, automatische Voraussetzung,
geschützte Ausnahmen, Nutzerentscheidung, Fehler-/Wiederanlaufweg und messbarer Nutzen.
Nordstern: **keine vermeidbaren Nutzeraktionen nach dem einen bestätigten Start**.

- Versionsprüfung, Folgeschritt nach Teilerfolg, Nutzungserfassung, Warten auf Lightroom, Index-/Paketpflege,
  begrenztes Retry und eindeutig eigene Temp-Pflege als Automatisierungskandidaten untersuchen.
- Nur bei Auswirkungen auf vorhandene/verwendete/eigens gepflegte Daten oder echten Unklarheiten fachlich
  rückfragen. Vollständige Schutzdaten bleiben Voraussetzung; fehlende Belege nicht als „unbenutzt“ auslegen.
- Destruktive Bereinigung, externe Veröffentlichung und große Downloads nicht durch unsichtbare neue
  Automatik autorisieren. Vereinbarte Start-/Aufbewahrungsregeln ausdrücklich beibehalten.
- Dauerhafte Zustände statt bloßer UI-Timer; genau-einmal-Wirkung beziehungsweise sichere Wiederholung,
  begrenzte Backoffs, Prozessende, Nutzerabbruch und Neustart überprüfen.

### I. Sicherheit, Datenschutz und Drittanbieter

- Lokale API/IPC: erlaubte Herkunft, Loopback-Bindung, Zugriffsgrenzen und unbeabsichtigte Fernsteuerung;
  Pfad-Traversal, absolute Fremdpfade, Reparse-Points, Uploadnamen und Kommandoargumente prüfen.
- Dateiinhalt statt Dateiendung validieren; unerwartetes HTML, beschädigte Bilder, übergroße Antworten,
  unvollständige Downloads und Ressourcenerschöpfung sicher behandeln.
- Zugangsdaten/Token, private Katalog-/GPS-Daten, Nutzungsbelege, lokale Logs und eigene Entscheidungen
  dürfen nicht im öffentlichen Pages-Artefakt, Git oder unnötigen Fehlerausgaben landen.
- Electron-/Node-/SDK-Abhängigkeiten, Berechtigungen, Herkunft, Lockfile und Installationsweg bewerten;
  konkrete Risiken beheben, keine unbegründeten Großupdates während fachlicher Reparaturen.
- Quellenbedingungen, Bild-/Soundcredits, NC-Lizenzen und manuelle Pflegekennzeichnung prüfen. Bei
  ungeklärten rechtlichen/aktuellen Anbieterfragen Primärquellen verifizieren, keine Erlaubnis vermuten.

### J. Veröffentlichung, Betrieb, Sicherung und Wiederherstellung

- Code-/Datenvorabgrenze, erzeugten Projektstatus, Validierung, Veröffentlichungsvorschau und Git-/Pages-
  Ergebnis gemeinsam prüfen. Fehlende Medien und verwaiste Pflegeeinträge ehrlich verhindern, Gate nicht lockern.
- Aktuelle letzte freigegebene Commit-ID tatsächlich durch Qualität, Artefakt und Deployment begleiten;
  früherer grüner Lauf oder lokales Gate beweist kein erfolgreiches Deployment neuer Änderungen.
- Windows/Linux-Unterschiede, erwartete plattformspezifische Skips, reproduzierbare Installation und
  Testisolation prüfen. Live-Squarespace/Pages und lokale Offline-Prüfungen getrennt dokumentieren.
- Normales Schließen, harter Prozessabbruch, mehrere Instanzen, offene Leser, Dateisperren, fehlender Platz,
  Schreibrechte, defekte Konfiguration und nicht erreichbare Dienste/NAS testen.
- Vorheriges Paar ist ein Rücknahmestand, **keine externe Sicherung**. NAS-/Backupumfang mit tatsächlichem
  Datenordner, Namen/IDs, Belegen, Aufträgen und Konfiguration abgleichen; Ausschlüsse offen benennen.
- Wiederherstellung zunächst isoliert an geeignetem Bestand nachweisen, inklusive Pfadwechsel, Paarbindung,
  eigenen Entscheidungen und Medien. Große reale Restorekopie nur bei begründetem Bedarf und Freigabe.
- Temp-Lebenszyklus darf beim Schließen nur eigene freigegebene Dateien nach Ende der benötigten Prozesse
  entfernen; offener Review/Wiederanlauf bleibt erhalten. Crashreste sicher erkennen statt blind löschen.

### K. Kommende Erweiterungen

Erweiterungsfähigkeit mit konkreten Schnittstellen- und Migrationsrisiken bewerten:

- frei einstellbarer gemeinsamer Datenordner mit Standard beim Explorer, portable Installation und sicherer
  späterer Wechsel; Konfiguration, Verbraucher, Sicherung und historische Belege müssen zusammenpassen;
- weitere Kataloge/Geräte, NAS-Nutzung und konkurrierende Prozesse ohne falsche „unbenutzt“-Entscheidung;
- zusätzliche Quellen, Sprachen/Ränge/Metadatenfelder und Anbieteränderungen ohne verstreute Sonderregeln;
- größere Datenbestände, inkrementelle Änderungen, Index-/Schemawechsel und versionierte Schnittstellen;
- neue Pflege-/Exportfunktionen auf gemeinsamen Services und Oberflächen statt eigener paralleler Logik;
- Diagnose/Telemetrie nur mit Datenminimierung, verständlicher Zustimmung und kontrollierter Aufbewahrung.

Für jeden Vorschlag: heutiger Bedarf, passende Modulgrenze, Kompatibilität, Migration, Schutzinvarianten,
Abnahmekriterium und sinnvolle spätere Phase. Pflichtfehler, heutige Vereinfachung und Zukunftsoption nicht
vermischen. Keine hypothetische Erweiterung als Voraussetzung für den aktuellen Auditabschluss erklären.

### L. Vollständige Website- und GitHub-Prüfung

- Alle projektbezogenen Website-Seitentypen und Funktionen einschließlich Squarespace-Footer/Custom-CSS,
  Navigation, Artenseiten, Suche/Filter, Karten/Portraits, Galerie/Lightbox und Audio prüfen.
- Mobile/Desktopdarstellung, Tastatur/Barrierefreiheit, externe/interne Links, öffentliche Datenkonsistenz,
  Cacheversionen, Lade-/Fehlerzustände, Datenschutz und vollständige Lizenz-/Quellenangaben einbeziehen.
  Lokalen Preview-/Artefakttest und den tatsächlich geladenen Livezustand getrennt nachweisen.
- GitHub vollständig prüfen: Repository-/Branch-/Releasezustand, lokal/remote Synchronität, Workflows/Trigger,
  Berechtigungen, Actions-Versionen, Concurrency/Retry, Artefaktinhalt und -Aufbewahrung, Pages-Einstellungen,
  Schutzregeln, Zugangsdatenverwendung und unbeabsichtigte öffentliche Dateien.
- Nur nachweisbar zugängliche Einstellungen als geprüft melden; fehlender Zugriff ist eine Prüfgrenze,
  kein erfundener Fehler oder Erfolg. Geheimnisse nie ausgeben. Externe Änderungen, History-Rewrite oder
  Artefakt-/Release-Löschung nicht allein durch einen Prüfauftrag autorisieren.

### M. Performance und Temp über das Gesamtprojekt

- Neben dem Masteraufbau Explorerstart, Suche, Listen/Rendering, Filter, Medien und UI-Blockaden messen;
  Lightroom-Dialogstart, Katalogaktionen, Statistikindex und Exporte; Website-Netzwerk-/Bild-/Scriptlast
  und Interaktion; CI-Artefaktbau. Geeignete Größen, Kalt-/Warmlauf und Ressourcenbedingungen festhalten.
- Optimierung nur mit belastbarem Engpass, messbarem Vorher/Nachher und fachlich gleichem Ergebnis;
  Hintergrundverlagerung darf Fehler nicht verbergen oder nutzlos doppelte Arbeit erzeugen.
- Alle temporär schreibenden Code-/Test-/Messpfade inventarisieren und auf eigene Temp-Ablage prüfen.
  Normales Explorerende, Lightroomende, Plug-in-Reload, Test-/Helferende und Crashfolgebereinigung gesondert
  nachweisen. Keine aktiven Leser, fremden Dateien oder dauerhaften Wiederanlaufbelege mitlöschen.

## 7. Mindest-Regressionsmatrix

Die Fälle nach Risiko ergänzen; nicht ausschließlich erfolgreiche Normalwege oder Text-/Regexverträge prüfen.
Ausgeführte Verhaltenstests, reales SDK und nötige native Bedienung passend kombinieren.

| Szenario | Geforderter Nachweis |
| --- | --- |
| Unveränderte Quellen / Referenz-Master-Drift | Kein unnötiger Download; fehlender Folgeschritt trotzdem erkannt. |
| Inkrementell gegen Vollaufbau | Gleiche fachliche Ergebnisse, IDs, Namen und Suchbarkeit; nachvollziehbarer Fallback. |
| Unbenutzte versus geschützte Quellenänderung | Automatik nur bei gültiger Nutzung; geschützter Fall fordert Entscheidung. |
| Fehlender/alter Katalognachweis | Sperre statt falscher Nullnutzung, ohne falsche Umzugswarnung. |
| Lightroom selbst schließen | Gespeicherter Auftrag wartet und startet genau einmal nach tatsächlichem Ende. |
| Unterbrechung jeder Updatephase | Wiederaufnahme mit gebundenem Eingang, altes Paar bis gültigem gemeinsamen Wechsel. |
| Platzmangel / gesperrte Datei / Schreibfehler | Kein beschädigter aktiver Bestand; ehrlicher und wiederherstellbarer Teilzustand. |
| Namenswahl und Anbieterstandard in beiden Clients | Gleiche Präferenz ohne Fotozwang, keine Identitäts-/Fotoänderung. |
| Lange Artvorbereitung / Portrait ohne Zeitlimit | Kein Entwurfsverlust, Wiederöffnung desselben Auftrags. |
| Karte blockiert oder beschädigt | Dateiimport/Überspringen erreichbar, danach Sound, keine falsche Veröffentlichung. |
| Sound ablehnen und früh zurücksetzen | Früher Treffer erneut wählbar, keine verwaisten Erzeugungsmetadaten. |
| Echter Abbruch vor/nach Speicherung und während Worker | Nur eigene unveröffentlichte Reste weg, keine rote Altanzeige, kein nötiger Git-Lauf. |
| Fremdänderung oder bereits veröffentlicht | Abbruchschutz bleibt; keine fremden Daten zurücknehmen. |
| Schließen / Neustart / detached Sitzung | Fortsetzen oder Abbruch möglich, keine zweite Artanlage und keine Dauersperre. |
| Späte Bestätigung und gleiche Art neu anlegen | Alte Entscheidungen schreiben weder gelöschte noch neue/fremde Art um. |
| Einzel-/Mehrfach-Ort/Zeit-Entfernung einschließlich FN-Stern | Eigene Keywords und Metadaten konsistent, fremde Keywords erhalten. |
| Statistik mit/ohne Taxonomie und Ort/Zeit | Korrekte Grundmengen, Schnittmengen, Ränge/Favoriten und deutsche Formate. |
| Alle drei Exporte, Auswahl und Gesamtbestand | Gleiche fachliche Zählweise, sicherer Inhalt, passende Namen, kein unnötiger Scan. |
| Veralteter Bereinigungsplan / Leser / unbekannte Bindung | Keine Löschung; neuer Plan beziehungsweise Rückfrage. |
| Teilfehler bei Bereinigung oder Rücknahme | Tatsächliche Wirkung belegt, frische Wiederholung ohne fremde Änderungen. |
| Isolierte Sicherungswiederherstellung | Konsistentes Paar, Entscheidungen/Links/Medien erhalten, Pfade korrekt. |
| Aktueller freigegebener Commit bis Pages | Qualitätsprüfung und veröffentlichtes Artefakt genau dieses Stands nachgewiesen. |
| Gesamte Website lokal und live | Alle Seitentypen/Funktionen mit passenden responsiven, zugänglichen und inhaltlichen Nachweisen. |
| GitHub-Regeln und Artefakte | Tatsächlich zugängliche Einstellungen geprüft, keine Geheimnisse/private Daten veröffentlicht. |
| Maus-/Tastaturhilfe und Fehlertext | Normale Anwender verstehen Wirkung, Datenfolgen und nächste Handlung ohne Programmkenntnisse. |
| Temp bei normalem Ende und nach Absturz | Eigene entbehrliche Dateien weg, offene/fremde Zustände erhalten, kein verteilter Testmüll. |

## 8. Nachweise, Dokumentation und Abschluss

Den datierten Auditbericht nach dem freigegebenen Auditstart **in dieser Datei** ergänzen, nicht in einer
zweiten Audit-/Manifestdatei. Bestehende historische Prüfbelege bleiben unverändert verlinkte Quellen.
Der Abschlussbericht muss mindestens enthalten:

1. geprüfter Stand, Umgebung, Eingangsrevisionen, tatsächlicher Umfang und bewusst nicht ausgeführte Aktionen;
2. Befundregister mit ID, Priorität, Beleg/Reproduktion, Auswirkung, Ursache, Lösung, Gegenprobe und Restgrenze;
3. Speicherinventur, Schutzmenge, Bereinigungsfreigabe und tatsächliche Vorher-/Nachherwerte;
4. Architektur-/Strukturentscheidung mit betroffenen Verbrauchern und Gründen für nicht vorgenommene Umbauten;
5. UI-/Automatisierungsbefund: vereinheitlichte Abläufe, entfallene Klicks, verbleibende bewusste Entscheidungen;
6. Testergebnisse mit Trennung automatisiert/nativ/offline/live; Commit-/Deploynachweis, sofern freigegeben;
7. offene Fragen, begründet zurückgestellte Punkte und priorisierte Folgeaufträge mit Abnahmekriterien.

Zusätzlich je Bereich eine Datei-/Git-Zuordnung, getrennte Layoutchecklisten, Tooltip-/Fehlertextbefunde,
gesamtprojektbezogene Performancewerte und einen vollständigen Website-/GitHub-Prüfbefund liefern.

Prioritäten: P0 für Datenverlust/Identitätsbruch/schwere Sicherheitslücke, P1 für blockierende Kernfunktion oder
unzuverlässigen Betrieb, P2 für relevante Bedien-/Wartungs-/Leistungsprobleme, P3 für begründete spätere Optionen.
Schwere richtet sich nach belegtem Risiko, nicht nur nach Häufigkeit oder Größe einer Datei.

Während Korrekturen jeweils passende Tests ausführen; vor Abschluss nach tatsächlicher Änderungsbreite
`npm.cmd run --silent quality:ci` und die betroffenen realen Betriebsszenarien prüfen. Keine grüne Gesamtaussage
aus ausschließlich Vertrags-/Regexprüfungen. Bei Lua-Änderung Plug-in-/Provider-Version konsistent erhöhen
und Vertragstest/Doku anpassen. Relevante öffentliche JS/CSS-Einbindungen und Cacheversionen mitziehen.

Aktuelle Verträge, README, Roadmap und Einstieg in AGENTS synchronisieren. Historische Audit-/Reparaturnachweise
nicht nachträglich zu aktuellen Abnahmen umdeuten. Generierte Arten-/Assetzähler aus dem Projektstatus beziehen,
nicht an zahlreichen Stellen manuell pflegen. Für neue Anweisungen einen klaren führenden Einstieg behalten.

Das Audit ist erst abgeschlossen, wenn alle vereinbarten Bereiche einen belegten Befund haben, P0/P1 behoben
oder ausdrücklich mit Felix entschieden sind, nötige native Nachweise vorliegen und sichere Wiederherstellung/
Betriebsgrenzen dokumentiert sind. Unfreigegebene Bereinigung oder Veröffentlichung als offen ausweisen, nicht
als erledigt zählen. Ein reparierter Einzelfehler oder ein grünes Gate ist für sich kein Auditabschluss.

Abschluss an Felix: wichtigste Ergebnisse, Änderungen, verbleibende Risiken, tatsächlicher Speichergewinn,
`git diff --stat`, betroffene Dateien, neue Versionen und Prüfresultate. Für noch nötige Nutzerhandlungen genau
sagen, was er klicken soll, welche Wirkung das hat und wie es rückgängig gemacht werden kann.

## 9. Verbindliche Einstiegsquellen

- [Dokumentationsübersicht](README.md), [Roadmap](roadmap.md), [Dokumentationsregeln](documentation-lifecycle.md).
- [Projektstruktur](repo-structure.md), [Qualitätsgrenzen](repository-quality-gates.md), [CI](ci-quality-gate.md).
- [Aktueller Taxonomiestand](taxonomy-current-status.md), [Gesamtupdate](taxonomy-reference-update.md),
  [Update-Automatisierung](taxonomy-update-automation.md), [Katalognutzung](lightroom-catalog-usage.md).
- [Identität/inkrementeller Auftrag](taxonomy-identity-incremental-plan.md),
  [Betriebsprüfungen](taxonomy-operational-checks.md), [Ressourcenmessungen](taxonomy-performance-profiling.md).
- [Speicherwechsel](storage-migration.md), [Speicherpflege](taxonomy-storage-maintenance.md),
  [Temp](temp-retention.md), [Test-/Messpfade](test-temp-contract.md), [Sicherungsplan](multi-device-backup-plan.md).
- [Artanlage](add-species-workflow.md), [Medienprüfung](media-asset-validation.md),
  [Medienreview](asset-review-workflow.md), [Soundlizenzen](sound-license-review.md).
- [Jüngster Reparatur-/Veröffentlichungsnachweis](audits/2026-10-04-creation-abort-and-publication.md).

Bei Widersprüchen aktuellen belegten Zustand und Nutzerentscheidungen klären. Ein alter Plan oder früherer
Arbeitsauftrag ist keine neue Handlungserlaubnis.

## 10. Laufendes Gesamtaudit – 8./9. Oktober 2026

### 10.1 Freigabe und frische Startaufnahme

Felix' übergebener Startauftrag lautet: „Starte das Gesamtaudit in einem neuen Chat nach den Vorgaben
unseres Auftrags“. Dieser Chat bleibt danach Hauptarbeitschat für Explorer, Lightroom-Plug-in und Website;
weitere Arbeiten benötigen weiterhin Felix' fachlichen Auftrag. Unabhängige Agentreviews sind freigegeben.

Frisch geprüft um 15:13 MESZ:

- Bestehendes Checkout `D:\Arten-Explorer`, Branch `main...origin/main`, HEAD
  `d233bba3b89b4e81705fe9f6ba1edd53fd86f617`. Bei Start `git status --short` und `git diff --stat` leer.
  Der lokale Vergleich mit `origin/main` ist noch kein frischer GitHub-API-/Remote-Nachweis.
- Node 24.12.0, npm 11.6.2, GitHub CLI 2.96.0. Quellversion des Plug-ins und registrierte Installation
  werden gesondert verglichen; die übergebene Version 0.4.24.22 ist noch keine frische SDK-Beobachtung.
- `storage-path.json`: schemaVersion 1, state `ready`, relativer Datenpfad `Daten`; der zentrale Resolver
  bestätigt `D:\Arten-Explorer\Daten`, Modus `configured`, gültige gebundene Umzugsrevision
  `3572354f69620c3556242d10a404ef9552ab0033606e6fd9287be02ad6947be5`.
- Kleine Zeiger: aktive CoL-Referenz `col-xr-2026-09-25-316441`, vorherige Referenz
  `col-xr-2026-08-26-316165`; gemeinsame Veröffentlichung
  `publication-b64beeb2-9951-4cf0-ac4e-1a326c5c3e91`, Master `master-20261003055911210`,
  Paket `lightroom-fa739bd28ec1e82a0283`. Gemeinsamer Vorgänger
  `publication-60f9b546-49ee-4c65-ada9-7b57b965b120`. Dies ist eine Manifestaufnahme, noch keine neue
  vollständige Datenbank-/Prüfsummenprüfung. Legacy-Ordner `active`/`previous` enthalten ältere Stände;
  ihr Name bestimmt nicht das heute von den Verbrauchern gelesene Paar.
- `update-presence.json` meldet `active: false`, letzter gespeicherter Abschluss 3. Oktober.
  Prozessliste über `Get-Process` ohne Lightroom-/Electron-/Node-Treffer zum Aufnahmezeitpunkt.
  CIM-Abfrage war in der Sandbox nicht zugänglich; keine vollständige Befehlszeilenaufnahme behauptet.
- Schwarzstorch-Abbruch, Lightroom ohne frühere Umzugswarnung und Weissstorch/Rebhuhn mit bevorzugter
  Namenswahl bleiben als gezielte **Nutzerbestätigungen** erhalten; keine neue native Vollabnahme daraus.

Die Vorbereitungsnachweise in 5.6 bleiben historisch. Keine erneute Entfernung der bereits quittierten
31 Altdateien, kein produktiver Aufbau, Download, Paarwechsel, Kataloglauf oder neue Veröffentlichung.

### 10.2 Reviewzuständigkeit und Nachweisführung

| Verantwortlicher | Fachreview / Dateizuständigkeit | Arbeitsgrenze |
| --- | --- | --- |
| Integration / Hauptagent | Startaufnahme, einmalige Metadateninventur, Speicher/Backup/Restore, Gesamtarchitektur, Doku und zentrale Integration | einzige Redaktion dieser Auditdatei; keine parallelen Großscans |
| Taxonomie-Review | Taxonomie, Identität, Updatekoordinator, inkrementeller Aufbau und Speicherpflege | kleine isolierte Verhaltenstests; Quellkorrektur erst koordiniert |
| Lightroom-Review | Plug-in, Namen, Katalognutzung, Statistik und alle Exporte | keine produktive SDK-/Katalogaktion; Simulation und native Beobachtung getrennt |
| Art-/Medienreview | Artauftrag, Medienreview, Pipeline und Git-/Pushabschluss | isolierte Fixtures; keine produktive Artanlage oder Veröffentlichung |

Die Fachagenten führen anschließend auch unabhängige Reviews für Website/GitHub sowie
UI/Architektur/Sicherheit aus. Nach einer Unterbrechung durch das Nutzungslimit wurden sie auf Felix'
ausdrücklichen Auftrag wieder gestartet; erhaltene Teilergebnisse sind kein ausgefallenes Gesamt-Go.
Rohresultate eigener Test-/Messsitzungen dürfen im geschützten Programm-temp liegen;
laufende Befunde, Entscheidungen und der Abschlussbericht werden ausschließlich hier integriert.

### 10.3 Befundregister und offene Nachweise

Die folgenden Fehler sind mit isolierten Verhaltenstests reproduziert, nicht aus Dateigröße oder alten
Notizen abgeleitet. Korrekturen sind lokale Auditänderungen; gemeinsames Endgate und native/live Abnahme
bleiben gesonderte Nachweise.

| ID / Priorität | Beleg und Auswirkung | Ursache / Korrektur / Gegenprobe | Restgrenze |
| --- | --- | --- | --- |
| A-01 / P0 | Echter Pages-Bau in kleiner eigener Testumgebung mit `--out=Daten`: Exit 0, privater Marker entfernt. Gegenreview reproduzierte zusätzlich Verlust eines fremden Temp-Reviews bei einem dortigen `_site`-Ziel. | Nur direktes Projektwurzel-`_site` erlaubt, früh und unmittelbar vor Ersetzen geprüft; Links/Quell-/Daten-/Fremdtemp-/externe Ziele verweigert. 7/7 Gegenproben einschließlich echter CLI und Windows-Junction bestanden; zwei unabhängige Gegenreviews Go. | Bestehende produktive Daten nicht berührt; integriert und vollständiges lokales Endgate bestanden, siehe 10.15. |
| A-02 / P1 | Unterbrechung nach Speichern von `applying-corrections` oder `syncing-lightroom`, vor Wirkung: Wiederaufnahme versuchte nur Abschluss, neuer Start blieb gesperrt. | `taxonomy-update-coordinator.mjs`: gezielte Wiederaufnahme des ursprünglichen idempotenten Wegs, Eingangsbindung vor und nach neuem Nutzungsnachweis; bereits erfolgreiche Wirkung nur abschließen. Erfolgs-/Fehler-/Retry-/Neustart-/Fremdänderungsfälle reproduziert. | Produktiver Ersatzlauf einschließlich frischer FN-Erfassung, normalem Lightroom-Schluss und gemeinsamem Paarwechsel am 13. Oktober belegt, siehe 10.24. Nicht jede Unterbrechungsphase wurde damit nativ ausgeführt; die gezielten Wiederanlauffälle bleiben automatisierte Gegenproben. |
| A-03 / P2 | Gültiges historisches Auftragsrezept am verifizierten neuen Pfad meldete unvollständiges Rezept und konservativen Gesamtschutz. | `taxonomy-storage-maintenance.mjs`: Originalrevision zuerst prüfen, nur Zugriffspfad über verifizierten Umzug projizieren. Negative Fremdpfad-/geänderte Journal-/Rezeptfälle, Originalbyte-Erhalt. | Keine Entbindung historischer Originale; Schutzclosure A-04 ist Voraussetzung. |
| A-04 / P1 | Nach Pfadauflösung bot alte Speicherpflege Eingänge eines geschützten fehlgeschlagenen Reparaturauftrags zum Entfernen an. Regression gegen unveränderten HEAD-Code reproduziert. Ein weiterer echter Windows-Pfadalias mit Großbuchstaben wurde übersehen. | Transitive benötigte Aufbauaufträge vor Paarpins; Recovery-Originalchecksums/Jobrevisionen und kanonische Graphpfade prüfen. Eigeninputs sind keine Fremdzyklen. Windows-Aliasse nur im Graph normalisieren, Originalbytes erhalten. Fehlende/unlesbare/manipulierte Bindungen schützen Jobs und Paare. Letzte Kombigruppe 184/184 erfolgreich. | Am 13. Oktober genau zwei ausdrücklich freigegebene Aufbauordner mit insgesamt 2.154.452.155 Bytes regulär entfernt; Zielpfade abwesend und Aktivzeiger bytegleich, siehe 10.26. Weitere geschützte Bestände bleiben erhalten; daraus folgt keine neue Löschfreigabe. |
| A-05 / P1 | SDK-Map ohne Foto: Statistik meldete `complete` und persistierte 0 Taxonomiefotos. 501-Foto-Pause plus eigene Ortsentfernung ergab nach Fortsetzen 501 statt richtiger 500 Ortsfotos. | Gemeinsamer vollständiger Batchleser; dauerhafte Statistikrevision, Invalidation alter Pausenstände bei eigenen FN-Aktionen und erneute Prüfung im privaten Schreibcallback. Tatsächliche Lua-/Katalogproperty-Gegenproben mit Retry, Reload, Yield/Race und Erhalt des alten Index. Instrumentierte native bewusste Pause/Fortsetzung und FN-Revisionsänderung am 19. Oktober bestanden, siehe 10.37. | Externe gleich große Katalogänderungen brauchen weiterhin bewussten Neuaufbau. Kein automatischer 5.000er-Checkpoint-/Stromausfallnachweis aus dem 501er-Fall. |
| A-06 / P2 | CSV-Quotes beließen führende Formel-/Steuerzeichen im Text. | Zentraler `csvField` in `ShowStatistics.lua` schützt entsprechende Textwerte mit Apostroph und behält CSV-Escaping/Unicode. Echte Lua-Gegenproben. | Sechs eigene Exportvarianten nativ erzeugt, streng dekodiert und inhaltlich geprüft, siehe 10.17 und neue Video-/Exportrunde 10.31. Keine native Tabellenprogrammöffnung; Formel-/Steuerzeichenschutz ist durch Lua-Gegenproben belegt, nicht durch einen nativen Schadwertfall. |
| A-07 / P1 | Ohne aktive Fotoauswahl liefert Filmstreifenfallback Fotos; echte Lua-Menüprobe entfernte Taxonomie/FN-Daten eines unmarkierten Fotos. | Gemeinsame frische Auswahl in `PluginState.selectedPhotos` mit `getTargetPhoto`-Guard für Auswahlaktionen; explizite Katalogaktionen bleiben getrennt. Leere/Einzel-/Mehrfachauswahl und virtuelle Kopien gegengeprüft. | Eigene native Runde bestätigt Anzeige und gesperrte Aktionen ohne aktive Auswahl, Einzel-/Mehrfachzuweisung und virtuelle Kopie, siehe 10.17; weitere Schreib-/Entfernungs- und Kontrollfälle unter 10.32 bestanden. Kein pauschaler Nachweis jeder Menüaktion, Katalogkopien- oder Mehrkatalogsemantik. |
| A-08 / P2 | Zwei unterschiedliche reservierte Keywordobjekte mit gleichem FN-Namen: nur eines entfernt, Metadaten schon leer. | Taxonomieentfernung dedupliziert zugewiesene Keywordobjekte nach Objekt statt sichtbarem Namen; fremde manuelle Wörter erhalten. Echte Lua-Gegenprobe. | Native getrennte Taxonomie-/Ortszeit-/Gesamtrücknahmen mit erhaltenen manuellen Keywords und ursprünglichen IPTC-/Zeitwerten unter 10.32 bestanden. Der konkrete Fall zweier unterschiedlicher reservierter Keywordobjekte mit gleichem FN-Namen bleibt eine Lua-Gegenprobe, keine native Duplikatobjektabnahme. |
| A-09 / P1 | 39-Byte-JPEG ohne Bilddaten wurde per HTTP-Vorschau/Übernahme gespeichert und im öffentlichen Mediengate akzeptiert; tatsächlicher Decoder scheiterte. | Gemeinsame Headerleser und tatsächliche begrenzte JPEG/PNG/WebP-Dekodierung vor Vorschau, Übernahme und Veröffentlichung. | Positive Import-/Neustart-/Abbruchrunde unter 10.33 bestanden. Am 24. Oktober zusätzlich Original-Editor mit echtem Dateiauswahldialog isoliert bedient: beschädigtes JPEG → HTTP 400, verständlicher Fehler und Übernahme gesperrt; gültiger Folgeversuch → 200 und Vorschau. Editor ohne Speichern geschlossen, alle 13 eigenen Ausgangsdateien unverändert. Keine offene negative Bedienprobe mehr; Beleg am Ende von 10.54. |
| A-10 / P2 | Root-Verläufe enthielten gleichzeitig aktuelle und überholte Temp-/Pfad-/Versions-/Sicherungsaussagen; Restorestart verlangte Node 18 statt benötigtem Node 24. | AGENTS/README zu aktuellen Einstiegen verdichtet, unveränderte komplette Historie in Ausgangscommit; Fachverträge korrigiert. Restorestart Node 24 und Lockfileinstallation über `npm ci`. Frisches unabhängiges Doku-Gegenreview ergänzt aktuelle Plug-in-/Identitätsgrenzen, Schutzpfade und transitive Jobregeln sowie CI-Decoder-/Rechtevertrag. | Keine ausgeführte Neuinstallation/Produktivwiederherstellung; lokale Verweis-/Styleprüfung getrennt vom Programmtest. |
| A-11 / P1 | Isolierter echter Kartenservice gab nach HTTP 403 oder gesperrter privater Weiterleitung Erfolg über den Windows-Fallback zurück. | Fallback nur bei ausdrücklich geeignetem Transportfehler vor erster HTTP-Antwort; native Weiterleitungen gesperrt. Kontrollierte Servicehooks, keine Anbieterumgehung im Audit; unabhängiges Mediengegenreview Go. | Gemeinsamer Decoder und Ressourcenobergrenze des Explorerwegs durch A-09/A-16 belegt; eigenständiger Pipelineweg zusätzlich A-23. |
| A-12 / P1 | Eigene HTTP-/Windows-Junction-Fixture lieferte eine private Datei außerhalb des öffentlichen Baums mit HTTP 200. | `http-routing.mjs`: Link/Junction in Datei und allen Vorfahren vor Stat/Stream verweigern; GET/HEAD/Range-Gegenproben. Unabhängiges Zweitreview Go. | Paralleler lokaler Austausch zwischen Prüfung und Stream ist keine atomar ausgeschlossene Raceklasse. |
| A-13 / P2 | Gerenderte Übersichtssuche ohne zugänglichen Namen; Rebhuhn-Artstufe nur `Perdix`; Zoom ohne Dialogsemantik/Fokus, Escape schloss zugleich CMS-Lightbox. | Gemeinsame binominale Anzeige, Suchlabel/Statusansage und benannter Zoomdialog mit Fokus-/Tab-/Escape-Rückweg. Lokale Footer-Versionen Taxonomie 1.0.9, Suche 1.0.3, Zoom 1.0.8; 37/37 passende Tests und echte lokale Browsergegenprobe für Suche/Binomen/Zoom/Fokus/Tab/Escape. | Lokales CMS-Harness ersetzt keinen neuen Live-CMS-Nachweis; Liveversionen sind noch der veröffentlichte Ausgangsstand. |
| A-14 / P2 | Startangebot fokussierte direkt den Update-Start; 12 GiB wurden als `12288.0 MB` angezeigt. | Startup-/Gefahrdialog startet auf Abbrechen/Später, explizite reversible Bestätigung bleibt möglich; gemeinsames deutsches KiB/MiB/GiB-Format. 79/79 passende Gegenproben, unabhängiges Zweitreview Go; echter lokaler Browser fokussiert Später, Enter startet keinen Auftrag. | Eigene kleine Fixture, keine produktive Quellenaktualisierung gestartet. |
| A-15 / P1 – Sicherheitsupdates und Funktionsgegenprobe abgeschlossen | Frühere hohe Befunde bei Electron 42.10.0/Undici 7.29.1 sowie veraltete getrennte Systemlaufzeit Node 24.12.0. | Nach ausdrücklicher Freigabe tatsächlich Node 24.22.1/npm 11.19.1 und Electron samt Windows-Binary 42.11.18/Installations-Undici 7.30.1 installiert. Offizielle Herkunft, SHA und Signatur geprüft; frisches npm-Audit mit null Befunden. | Normaler Desktopstart, lesende Artsuche, Nachladen und normales Explorerende sowie Lightroom-Suche bestanden. Abschließendes funktionales Gate 50 Gruppen/2.256 Tests bestanden, alle Quellen stabil. Keine allgemeine Sicherheits-, Veröffentlichungs- oder Gesamtauditfreigabe; Belege am Ende von 10.54. |
| A-16 / P1 | Tatsächliche Karten-ReadableStream-Probe lud 30 MiB vollständig und wies erst danach ab; Windows-OutFile ebenfalls unbegrenzt. | Laufende 20-MiB-Grenze, frühe Headerprüfung, Abbruch/Cancel/Release; native HTTP-Streams mit Redirectverbot, Timeout und Dispose. 100-MiB-Header, 21-MiB-Chunking, private Weiterleitung, endloser Stream, HTTP 403/ungültiges 200 und frischer JPEG-Retry geprüft. 45/45 Medien-/HTTP-/Servertests. | Kleine eigene Loopback-Proben, keine Anbieterumgehung; unabhängiges Medienreview Go. |
| A-17 / P2 | Eigene reale HTTP-Probe entfernte Datei zwischen Stat und Öffnen: Client wartete bis eigenen 500-ms-Abbruch. | ReadStream-Fehler beendet die HTTP-Antwort und registrierten Leser; GET/Range sowie anschließender frischer 200-/206-Retry. 11/11 HTTP-/Routertests, unabhängiges Gegenreview Go. | Lokaler paralleler Pfadtausch bleibt nicht atomar ausgeschlossen. |
| A-18 / P2 | Native Statistik ohne aktuellen Index und Exportauswahl zeigten vollständigen AX-Text, schnitten aber den sichtbaren Hinweis einzeilig ab. | Beide SDK-Hinweise erhalten vier Zeilen; echter Lua-Viewtest und Version 0.4.24.24 synchronisiert, 57/57 passende Fälle und unabhängiges Gegenreview Go. .24 im Lightroom-Statusfeld nach Reload bestätigt; nach Nutzer-Neuaufbau vollständige Statistik und Exportauswahlhinweis am 9. Oktober unabhängig nativ gesehen. Eigene freigegebene Testkatalogrunde am 10. Oktober bestätigt auch den vollständigen sichtbaren Hinweis ohne aktuellen Index sowie den Auswahlhinweis, siehe 10.17. | Am 9. Oktober ohne Dateiausgabe abgebrochen; am 10. Oktober sechs eigene Exporte erstellt und gelesen. Weitere DPI-Stufen bleiben offen, kein produktiver Index zur Sichtprüfung gelöscht. |
| A-19 / P2 | Gerenderter Explorer meldete laufenden Quellenaufbau, während lediglich das Startangebot auf Bestätigung wartete. | Controller und gemeinsame Anzeige trennen Vorschau/offene Bestätigung von tatsächlicher Arbeit bei erhaltenem Busy-/Doppelstartschutz; 97/97 passende Fälle und Zweitreview Go. Echter Browser zeigt „Vorschau wird geprüft“, Abbrechen führt zu „Kein Lauf aktiv“. | Kein echter Updateauftrag zur Reproduktion; zugängliche Bestätigung verdeckt die darunterliegende Anzeige. |
| A-20 / P2 | Pages-Schreibrecht und OIDC lagen auch bei Qualitäts-/Buildjobs. | Global nur `contents: read`, Build `contents: read`/`pages: read`, Deployment allein `pages: write`/`id-token: write`; configure-pages mit standardmäßig deaktiviertem Enablement braucht nur lesenden Pages-Zugriff. | Offizieller Action-/REST-Vertrag und unabhängiges Review Go; neuer GitHub-Lauf erst nach Veröffentlichung. |
| A-21 / P2 | Erstes Vollgate endet im eigenen Temp-Fixture-after-Hook mit ENOTEMPTY; keine Assertion über aktiven Eigentumsschutz fehlgeschlagen. | Ausschließlich eigener Testteardown erhält acht begrenzte Wiederholungen mit 80-ms-Basis. Unveränderte Einzelprobe 30/30; eigene 350-ms-Windows-Dateisperre reproduziert EBUSY, Retry erfolgreich; anschließend test:temp 57/57 und Root-Diffreview Go. | Konkreter externer Handle-Verursacher des sporadischen ENOTEMPTY nicht belegt; dauerhafte Fehler bleiben sichtbar, Kern-Schutzregeln unverändert. |
| A-22 / P2 | Schmale echte Exploreransicht: CSS-Viewport 345 × etwa 747, Header 136 px bei 172 px Inhalt und Summary 124 px bei 141 px Inhalt/406 px Breite; Inhalte sichtbar abgeschnitten. | Nur Breakpoint bis 720 px: natürliche Seitenhöhe/vertikaler Seitenfluss, Workspace ohne Außenclip, Summary-Zellen und Herkunftshinweis umbrechbar. Zweitreview Go; tatsächliche Gegenprobe am gleichen Viewport Header 185 px/Inhalt 184, Summary 151 px/Inhalt 150, jeweils ohne Überbreite; untere Hinweise bei ScrollY 3.258 erreichbar. | Normale 1.133 × 796-Ansicht ebenfalls ohne horizontalen Überlauf; vollständiges lokales Endgate bestanden. Browsergrößenprobe ist keine Windows-DPI-/Screenreader-Abnahme. |
| A-23 / P1 | Älterer Pipeline-Kartenadapter besitzt denselben Fehler unabhängig vom Explorer: eigene Gegenprobe HTTP 403 + Windows-Hook überschreibt alte Karte; 302 erreicht private Loopbackroute; 30-MiB-Stream vollständig akzeptiert. | Öffentliche manuelle Redirectprüfung, 20-MiB-Streams/Timeouts, origin-gebundenes API-Token, Transportfallback nur vor erster HTTP-Antwort und echter Decoder vor Ersatz. Cachekandidaten teilen einen Quellensatz. 56/56 passende Tests in sieben Dateien; finaler offizieller test:providers 26/26 überlappend. Echte sechs Fälle des Windows-Loopbacktransports, Original-/Bewertungserhalt und frischer Retry; unabhängiges Lightroom-Gegenreview und Root-Quelllektüre Go. | Keine echte Anbieteranfrage. Grenzen je Abruf/Quellensatz, kein globales 30-s-/20-MiB-/50-Quellen-Budget; DNS-/Socketbindung bleibt bekannte Grenze. A-11/A-16 belegten vorher nur den Explorerpfad. |
| A-26 / P2 – Zeitlimit und Wiederaufnahme tatsächlich im Browser bestanden | Einzelner Status-GET-Fehler beendet die Anzeige; eine nie beantwortete Abfrage konnte unbegrenzt hängen. | Begrenzter lesender Backoff und gebundene Antworten/Timer; seit 24. Oktober zusätzlich 15-Sekunden-Grenze je Status-GET für Backup/Pipeline. Letzter bestätigter Stand bleibt erhalten, verspätete Antworten überschreiben keinen neueren Zustand und öffnen keinen geschlossenen Dialog. Vier rote Vorherproben, abschließend 148/148 passende Tests; README und Fachvertrag angepasst. | Eigene Browserprobe belegt je fünf echte Hänge-GETs mit etwa 15 s Grenze und Pausen 1/2/4/8 s, anschließend Ruhe und erfolgreiche frische Statusöffnung. Geschlossener Dialog bleibt auch bei später tatsächlicher Antwort geschlossen. Kein Start-/Write- oder Abschlusswirkungsretry. Neues vollständiges lokales Gate am 25. Oktober mit 50 Gruppen/2.215 Tests bestanden; unabhängige Annahme und genauer Umfang am Ende von 10.54. Separater sichtbarer Aktionsrasterfehler A-75. |
| A-27 / P2 | Mehrere kleine Bearbeitungssicherungen wurden erhalten, aber Artenlisten-/Taxonomie-Oberflächen und API boten keine Auswahl historischer Stände; NAS ebenfalls ohne integrierte Übersicht. | Nach Felix' „Vorschlag umsetzen“ datierte Auswahl je Art mit Vorschau, ausdrücklicher Bestätigung und unmittelbar vor Schreiben geprüfter Bindung implementiert. NAS liest begrenzt ZIP-Verzeichnis/Manifest und zeigt Umfang sowie ehrlichen Nachweisstatus. Gegenreview ergänzt die gegenseitige Sperre von Restore und Quellen-/Masterwartung; neuer Fall vorher rot, nachher grün. | Datierte Auswahl mit Vorschau isoliert unter 10.16 abgenommen; tatsächliche große Archivkopie mit vollständiger Integritätsprüfung und getrenntem Programmstart einschließlich Paar-/Namenslesung unter 10.41/10.43 bestanden. Keine Produktivübernahme, vollautomatische NAS-Restaurierung oder Änderung der vereinbarten Aufbewahrung daraus. |
| A-28 / P2 | Kurzbestätigung ohne zugänglichen Titel; Feldfehler ohne eindeutige Fehler-/Eingabebindung; beide Listen ohne vollständige Pfeil-/Home-/End-Navigation. Zusätzlich verspäteter Taxondetailabruf zieht Fokus aus bewusst gewähltem Fremdfeld zurück. | Benannte dynamische Dialoge, feldbezogene aria-invalid/describedby unter Erhalt vorhandener Hilfe und anderer Fehler; roving Fokus an tatsächlich sichtbaren Listen. Namensvorschläge übernehmen erst per bewusster Aktivierung. Gegenproben vor/nach, 116/116 Integration vor letzter Fokus-Race-Korrektur und danach 15/15 Referenztests; echte isolierte Browserrunde unter 10.20. | Keine vollständige native Screenreader-/DPI-/Touchabnahme; eigenes Browserharness und lokal geprüfte Quellen, kein produktiver Explorer-Neustart daraus. |
| A-29 / P2 | Siebentagesfrist für Ergänzungsnamen erzeugt „Namensbestand ist veraltet“/Startangebot und behauptet in der Übersicht eine neue Datenbankversion, obwohl CoL aktuell ist. Starttext zu lang, FN-Erfassung unerwartet. | Auf Felix' Auftrag stiller vorhandener CoL-Metadatencheck, Startangebot nur für bekannte fehlerfrei geprüfte andere Releasekennung oder Installation; Ergänzungsalter allein still. Vorschau erneut gebunden prüfen; bewusste manuelle Ergänzungsprüfung erhalten. Kurzer Handlungsdialog mit direkter vollständiger Einwilligung, FN-Frischeprüfung und nur bei Bedarf Erfassung. 95/95 passende Fälle. | Zwölf-Stunden-Metadatencache bleibt; Ergänzungsanbieter haben in dieser Anbindung keine vergleichbare Upstream-Releasekennung. Prototyp-Installationssonderfall hat noch allgemeinen Versionstitel. Keine automatische Aktualisierung oder neue produktive Freigabe. |
| A-30 / P2 | Felix bestätigt „Lightroom jetzt schließen“ vor FN-Abbruch. Erneuerte Erfassung verliert im Code die Schließvormerkung, aktueller Request ohne Schließversuch. Eigene synthetische Gegenprobe reproduziert den Verlust. | Vormerkung ausschließlich bei Retry desselben Updates, derselben Startvereinbarung und Katalogmenge erhalten; keine alten Quittungs-/Versuchserfolge übernehmen. Fremder/stornierter Auftrag oder fehlende Zustimmung bleiben gesperrt. Nach neuer gültiger Erfassung genau ein normaler Schließversuch. 82/82 Service-/Koordinatorgegenproben. | Normaler Schluss des neuen requestgebundenen Auftrags unter 10.51 nativ bestätigt; kein nativer Retry nach abgebrochener FN-Erfassung daraus. Vormerkungserhalt bleibt automatisiert geprüft; alte ursprüngliche Schließzeit nicht rekonstruiert. |
| A-31 / P3 – Quelle korrigiert | Ein Wiederholungsversuch behält completedAt des vorausgehenden Fehlers. | Zentraler Save setzt bei tatsächlich laufendem/wartendem Auftrag completedAt auf null; neue Fehler erhalten frischen Zeitpunkt, abgewiesene Fremdfortsetzung erhält Journalbytes. 142/142 Coordinator-/Jobfälle und finales Gesamtgate bestanden; Belege unter 10.26. | Kein produktiver Retry allein für den Zeitstempel gestartet. Vorhandene historische Aufträge/Rezepte unverändert. |
| A-32 / P1 – Testisolierung korrigiert | Zwei Servertests starten ohne eigene repoRoot und treffen beim Wiederherstellen auf die Sperre des produktiven Nutzerupdates. Damaliges Vollgate mit 1.522 bestandenen und zwei fehlgeschlagenen Fällen belegt; Quellenpfad führt über die produktive storage-path.json. | Beide Serverfälle und ihr Testwrapper erhalten vollständig eigene Projekt-/Taxonomie-/Lightroom-Fixtures; erwartetes Modell/Grafik ebenfalls eigene Fixture. Lifecycle-Test begrenzt geerbte Speicheroptionen nur im eigenen Testprozess und restauriert sie auch bei Fehler. 34/34 gesamte Explorergruppe bestanden; kein erneuter produktiver Reproduktionsstart. | Der rote Vor-Gate ist ein historischer Nachweis. Spätere vollständige Gates bis 50 Gruppen/2.086 Tests sind bestanden; die erneute Gesamtprüfung nach den laufenden Änderungen bleibt ein eigener Abschlussnachweis. |
| A-33 / P2 | Felix meldet lange CoL-Anzeige bei 273.470/273.470 und 100 %. Prozessprobe belegt fortgesetzte Aktivität während weiterer Eingangsprüfung. | Reine Anzeigeänderung zeigt nach vollständiger CoL-Auswahl neutral die weitere Vorbereitung ohne ungemessenen Prozentwert. Tatsächlicher Presenter und beide Verbraucher, 89/89 Gegenproben; alle 41 Aufbauregelquellen währenddessen unverändert. | Kein produktiver Neustart; neue Anzeige dort noch nicht nativ abgenommen. Späterer echter Aufbaufehler ist A-34 und wird nicht als Anzeigeproblem behandelt. |
| A-34 / P1 – Wiederanlauf abgeschlossen | Aufbau am 11. Oktober scheitert an einer nicht erneut belegbaren Klassifikationsentscheidung. | Auswahlfix und geschützte frische Erneuerung umgesetzt/geprüft. Tatsächlicher Ersatzauftrag am 13. Oktober, 18:09 MESZ completed; alle 273.480 vorherigen IDs erhalten, neues Master-/Lightroom-Paar konsistent. | Alte Aufträge/Rezeptbytes erhalten; keine neue Schutzregel aus historischen Freigaben. Lauf und Abschluss unter 10.24; Gesamtaudit bleibt offen. |
| A-35 / P2 – FN-Abgleich und Auswahl abgenommen | `Hinzufügen` überspringt schon bei einem vorhandenen FN-Feld das gesamte Foto. Eigene Auswahl mit 130 März-Teilständen und 130 April-Neuzuweisungen reproduziert nur 130 Änderungen. | 0.4.24.25 ergänzt fehlende Felder und Stichwörter unter Erhalt vorhandener FN-Werte. Produktive .27-Katalogpflege passend; zusätzlich .28 nativ: Taxonomiezuweisung und separater Hinzufügen-Menüweg an eingeklapptem eigenem März-/April-Stapel erfolgreich, vollständiger Vorher-/Nachvergleich. | Vorhandene Jahres-/Orts-/Taxonomiewerte und tatsächliche Keywordzuordnungen erhalten; nur fehlende Monate und passende interne Kennungen ergänzt. Felix' frühere 260er-Auswahlsituation nicht nachträglich rekonstruiert. Abschnitt 10.30. |
| A-36 / P2 – Katalogpflege abgenommen | Katalogpflege zählt jede Taxonomieprüfung als Aktualisierung und Ort/Zeit nur ohne auflösbare Taxonomie. GPS-Hinweis missverständlich. | Native .27-Katalogpflege und unabhängiger Nachvergleich am 14. Oktober: 412 Taxonomieänderungen / 6.060 unverändert, unabhängig 938 Orts-/Zeitänderungen / 5.534 unverändert; sämtliche 6.472 Zuordnungen passend. 4.862 ohne Ortsquelle/GPS separat, keine Fehler. | Kein zweiter Produktivlauf allein als Wiederholung; durch den Nachvergleich nicht sämtliche manuellen Fremdstichwörter geprüft. Native Zähler und Grenzen unter 10.27. |
| A-37 / P2 – eigene Browserabnahme bestanden | `Neue Art` öffnet trotz gesperrtem Datenbankauftrag das Formular; der Hinweis erscheint erst später. Fehlgeschlagen/offen wird nicht früh unterschieden. | Frische lesende Verfügbarkeitsprüfung vor Öffnen/Reset, kurzer Hinweis für failed/offen und erneute serverseitige Sperre vor Vorschau/Schreiben. Eigenes HTTP-Fixture erhält Artenliste und Auftrag bytegleich. Tatsächliche Browserprobe failed/frei/Lesefehler einschließlich sieben Fokus-Rückkehrwegen unter 10.49/A-50 bestanden. | Kein Entsperren oder Verwerfen des offenen Nutzerauftrags und keine Artanlage durch diese Reparatur. Künstliche Verfügbarkeitsantworten mit unverändertem echtem Fachkern; kein Windows-DPI-/Screenreadernachweis. |
| A-38 / P1 – Wiederanlauf abgeschlossen | Offener eigener failed/build-Auftrag besitzt keinen sicheren Ersatzweg bei veralteter Regel-/FN-Bindung. | Frische gebundene Vorschau, erhaltener Originauftrag, neue eigene FN-Anfrage/normaler Schluss, gespeicherter Schutzvergleich und gemeinsamer Wechsel produktiv am 13. Oktober ausgeführt. | Neuer eigener Job d72503… completed/ready, altes Rezept unverändert. Abschlussbeleg und Grenzen unter 10.24. |
| A-39 / P1 – Wiederanlauf abgeschlossen | Folgejob f1dc scheitert an EPERM beim Umbenennen des bisherigen Stagingordners. | Begrenzte Wiederholung und ehrliche Rückstellungsfehler lokal korrigiert; 9/9 isolierte und 7/7 native Windows-Leserfälle. Neuer eigener Kandidat im freigegebenen Ersatzlauf erfolgreich übergeben und Paar aktiviert. | Ursprünglicher konkrete Sperrverursacher weiterhin nicht bewiesen. Keine Locks/WAL-Dateien entfernt und kein Prozess erzwungen; tatsächlicher Abschluss unter 10.24. |
| A-40 / P2 – Wiederanlauf abgeschlossen | Fehlgeschlagener eigener Job wird fälschlich als neuer Auftrag für die 187 alten Kandidatenentscheidungen gezeigt. | Eigentümer-/Jobprüfung vor Kandidatenanzeige, strenge fertige Kandidatenbindung und frische FN-Frischegrenze korrigiert. Produktiver eigener Ersatzlauf am 13. Oktober abgeschlossen. | Die 187 bisherigen Ereignisse wurden neu geschützt geprüft, kein pauschales Entscheiden und keine historische Quittung neu datiert. Abschnitt 10.24. |
| A-41 / P2 – Produktiver Erfolgsfall abgenommen | Ortsvorschlags-Export-/Lesefehler werden als bloß fehlende Vorschläge gezählt. | 0.4.24.27 trennt fehlende Vorschläge, Export-/Lesefehler und FN-Schreibfehler; 90/90 integrierte Lua-/Vertragsfälle. Produktiver Abgleich am 14. Oktober erfolgreich, 741 Ortsanfragen, keine fehlenden Vorschläge/Export-/Schreibfehler gemeldet, unabhängiger Nachvergleich passend. | Negativer nativer Export-/Lesefehler wird durch diesen erfolgreichen Lauf nicht erzeugt oder abgenommen; entsprechende Fehlerzweige weiterhin isoliert geprüft. Abschnitt 10.27. |
| A-42 / P2 – Direkte Auswahl nativ abgenommen | Verborgene Bachstelzen in eingeklappten Stapeln werden bei sichtbarer Auswahl nicht zugewiesen. | .28 nativ im eigenen Testkatalog: ein sichtbares oberes Foto ausgewählt, zwei Originale einschließlich verborgenem Mitglied erkannt; Taxonomie und separater Ort/Zeit-Hinzufügenweg schreiben beide, jeweils eigener Monat März/April 2025. Vorher/Nachher samt tatsächlichen Keywords passend, Kontrollfoto/Kopie erhalten. | Produktive Bachstelzen zuvor durch Felix zugewiesen; native Auswahlprobe ausschließlich eigene neue Fixtures. Konflikt und genaue Rücknahme bleiben gesonderte Fälle; keine pauschale Erweiterung an Sammlungsstapeln. Abschnitt 10.30. |
| A-43 / P2 – Eigene native Statistik-/Exportrunde bestanden | Videos werden bislang wie Fotos in Statistik/Exporten gezählt; Nutzer verlangt Video-FN-Zuweisung ohne Statistikteilnahme. | SDK-isVideo vor Aggregaten/Favoritenpools überspringen, Schema 7; eigene native .29-Statistik zählt vier Fotos und schließt MOV samt nur dort verwendeter Art aus. Sechs neue Exportvarianten mit 45/45 unabhängigen Inhaltsprüfungen, darunter alle drei Auswahlwege nur mit MOV und korrekt null Arten/Beobachtungen. Produktiver FN-Lauf enthält zehn Videos mit passenden FN-Daten; sechs Bartmeisen-Zeiten ergänzt. | Eigene Statistik-/Exportfälle und produktiver FN-Abgleich sind getrennte Nachweise; keine vollständige native Favoriten-/Rücknahme-/Großbestandsmatrix daraus ableiten. Aktuelle Belege und Versionsgrenzen unter 10.31. |
| A-44 / P2 – Korrigiert, eigene Browserrunde bestanden | Verspätete Sessions-/Statusantwort eines geschlossenen Neue-Art-Dialogs überschrieb einen inzwischen neu geöffneten und weiter bedienten Dialog; alte Fehlermeldung konnte neue Eingabenprüfung ersetzen. | Öffnungsgeneration bindet asynchrone Fortsetzungen einschließlich verschachteltem Datenladen und Polling. 32/32 Controllerprüfungen, unabhängiger Review und echte eigene Browserrunde mit Wiederaufnahme, kontrolliertem Serverneustart, Abbruch und anschließend freigegebener alter Antwort bestanden. | Kein harter Windows-/Electron-Neustart und keine vollständige Veröffentlichung aus dieser bewusst medienlosen Fixture behauptet. Gesamtgate 16. Oktober mit 50 Gruppen / 1.805 Tests bestanden. Abschnitt 10.32. |
| A-45 / P2 – Korrigiert, eigene Runde vollständig bestanden | Nach tatsächlichem Prozessneustart öffnet ein gespeicherter geleiteter Medienauftrag die allgemeine Karten-/Soundprüfung wiederholt und blockiert den Artassistenten. | Ausdrücklicher Einstieg „Artanlage fortsetzen“, vollständige ursprüngliche Klickidentität über alle Wartefenster gebunden. 83/83 gezielte Tests und unabhängiges Code-Go. Eigene Prozessneustart-/Karten-/Soundreset-/Übernahme-/Abbruchrunde mit unabhängigem Dateischlussvergleich bestanden. Finales Gate 50 Gruppen / 1.819 Tests bestanden. | Sämtliche 13 Ausgangsdateien exakt zurück, nur kleiner Abbruchbeleg bleibt. Synthetische Medien, echter separater Serverprozess; Windows-Neustart und erfolgreiche Veröffentlichung sind andere Nachweise. Abschnitt 10.33. |
| A-46 / P2 – Korrigiert, eigene Browser-/Lightroomrunde bestanden | Bestätigte globale Namenswahl erneuert das Detail, während derselbe Suchtreffer in Explorer und Lightroom noch den alten Namen zeigt. | Bestehenden passenden Treffer aus frischen Details erneuern; alte Antworten bei geänderter Anfrage/ID verwerfen. Explorer 55/55, Plug-in .34 70/70; native Rückwahl/Anbieterstandard, Gegenrichtung und kontrollierter Aktivierungsfehler mit erfolgreicher Wiederholung bestanden. Gesamtgate 50 Gruppen / 1.863 Tests bestanden. | Alle fünf vollständigen Katalogeinträge unverändert. Begleitender Präferenzweg nach Fotozuweisung automatisiert geprüft; eigene reine Namensrunde führt keine Fotozuweisung oder produktive Namensänderung aus. Abschnitt 10.36. |
| A-47 / P2 – Korrigiert, Browsergegenprobe bestanden | Nach Abbruch/Escape der Explorer-Namensvorschau verlor die Oberfläche den Tastaturfokus; eine alte Vorschauantwort konnte noch eine Bestätigung öffnen. | Namensworkflow bindet Vorschau vor Bestätigung an Anfrage/Taxon/Auswahl und stellt tatsächlich verlorenen Fokus nach Reaktivierung des Auslösers wieder her. 70/70 gezielte Fälle; echter Browser mit Escape, gezieltem Klickabbruch und schmaler Ansicht bestanden. Gesamtgate 50 Gruppen / 1.878 Tests bestanden. | Andere bewusst fokussierte Eingaben bleiben erhalten; keine gespeicherte Namensänderung in dieser Gegenprobe. Keine Windows-DPI-/Screenreader-Gesamtabnahme. Abschnitt 10.38. |
| A-48 / P2 – Korrigiert und nativ bestätigt | Sommer- und Wintergoldhähnchen öffentlich erreichbar, Explorer meldet trotz „Website prüfen“ nicht veröffentlicht: Squarespace liefert am nackten Sitemap-Pfad weiterhin den alten öffentlichen Cache. | Reproduzierter Vergleich: alter Stand 135 Seiten ohne beide Arten; frische gebundene Sitemapabfrage 137 mit beiden genauen Artkennungen. Jede tatsächliche neue Sitemap-/Untersitemapabfrage erhält ausschließlich eine eigene Erneuerungskennung. Lokaler Cache, Host-/Weiterleitungs-/XML-/Größen-/Zeitgrenzen unverändert. | Vor Fix 10/12 mit zwei erwarteten Fehlern; danach gezielt 26/26, Live-Service sowie tatsächlicher regulärer Neustart, beide nativen Links, erneute Websiteprüfung und passend geöffnete öffentliche Zielseiten bestanden. Vollgate unter 10.40 mit 50 Gruppen/1.881 Tests bestanden; erneuter Live-Servicebeleg vom 20. Oktober unter 10.43. Keine CMS-/Veröffentlichungs- oder Artdatenänderung. |
| A-49 / P2 – korrigiert; native Grund-, Mehrblock- und Störfälle angenommen | Echte IdentityWriter-/StatisticsIndex-Module mit künstlich verzögerter SDK-Lesesicht: erste Zielstichwortkennung wird vor Commit gelesen; Artänderungsstatistik übernimmt noch den alten FN-Stand. | .35 bindet reale Zielobjekte nach Commit mit frischem Schutzvergleich und projiziert Statistik aus vollständigem Journalziel plus erhaltenem Vorzustand. Gültige Vorherprobe 14/16 mit genau beiden Fehlern, nach Korrektur erweitert 170/170 gezielt und unabhängiges Code-Go. | Split B/C und Merge F mit vollständiger Rücknahme angenommen. Mehrblockpause/Wiederöffnung mit 250+3 in beiden Richtungen sowie SDK-Rollback, Commit-vor-Journal-Wiederanlauf und Konflikt-/Teil-/Endrücknahme unabhängig bestanden. Repräsentative Großkatalogprobe für Laufzeit, Prozess-RAM und Abbruch bleibt gesondert offen; 10.50/10.51 und aktueller Endstand 10.54. |
| A-50 / P2 – korrigiert und im Browser bestätigt | Eigene Browserprobe der Artanlage: Nach fehlgeschlagenem Verfügbarkeitsstatus und nach Escape aus dem freien Artassistenten landet der tatsächliche Fokus auf BODY. Neue Art wird vor dem asynchronen Vorabcheck deaktiviert; dadurch geht der Rückkehrpunkt verloren. | Eigener ursprünglicher Auslöser wird nach dem Vorabcheck nur bei verlorenem Fokus und unverändertem gültigem Auftrag wieder fokussiert; bewusst anderweitig gesetzter Fokus bleibt erhalten. Reproduktion 46/51 mit fünf erwarteten Fehlern, anschließend 51/51. | Vollgate 50 Gruppen/1.904 bestanden. Tatsächlich sieben Browser-Schließwege mit Fokus auf Neue Art sowie Anfangsfokus im freien Formular bestätigt; sauberer unveränderter Laufabschluss unter 10.49. Kein Hauptkatalog-/Artenschreiben. |
| A-51 / P2 – native Schließ-/Suchmatrix bestanden; Skalierungsgrenze benannt | Der modale Taxonomiedetail-Leser war hinter dem Zuweisungsfenster verdeckt; später Nichtbedienbarkeit nach wiederholter Rückkehr beobachtet. | .36 schließt den eigenen Floater vor der Anzeige; .39 erzeugt eine neue Viewhierarchie je Generation bei erhaltenen Properties/einmaligen Observern. Ergänzend am 24. Oktober private .46 mit unveränderter .39-Detail-/Suchlogik: Escape auf erster/letzter Seite, normaler Schließknopf, Fertig, Zurück/Weiter, fünf erneute Detailaufrufe, neue Gamma-Suche, nutzbarer Tabfokus und normaler Fensterschluss bestanden. | Geschlossene Kopien vor/nach dem Lauf bestätigen alle sechs Rohidentitäten/FN-Felder/IPTC/Stichwortrelationen/Statistik unverändert; Original .39 und Hauptkatalog D: zurückgestellt. Aussage gilt für die tatsächlich verwendete Windows-Anzeige; andere Systemschrift-/DPI-Einstellungen nicht abgenommen. Genaue SDK-Ursache nicht behauptet; 10.51 und Fortsetzung vom 24. Oktober. |
| A-52 / P2 – Kennungskorrektur nativ bestätigt | Eigene Split-Übernahme stoppte vor Journalanlage: Lua reicht SDK-UUID großgeschrieben weiter, Journal verlangt Kleinschreibung. | .37 normalisiert und prüft Typ/Gruppenform am Erzeuger; gekoppelte Vorherprobe 8/19, danach 19/19 und Integration 93/93. Vollgate .37 50/1.923. Die folgende native Runde legt genau einen gültigen Lauf an; .38 setzt ihn erfolgreich fort. | Der konkrete UUID-Fehler ist überwunden. Das ersetzt nicht die separate vollständige Übernahme-/Rücknahmematrix; A-53 und 10.50 führen deren Grenzen. |
| A-53 / P2 – korrigiert; native Grund-, Mehrblock- und Störfälle angenommen | .37 bereitete das Journal vor, meldete aber vorhandenes `Tiere (FN)` als gelöscht/umbenannt. | .38 verwendet dokumentierten Batch-SDK-Zugriff mit numerischen IDs/exakter Objektbindung. Identische Vorherprobe 10/32, danach 32/32; Integration 227/227, Vollgate 50/1.937. Vorhandenen Ein-Foto-Lauf nativ fortgesetzt und angewendet. | Split B/C und Merge F einschließlich Rücknahme, 250+3 in beiden Richtungen sowie die getrennten SDK-/Journal-/Konfliktfälle unabhängig bestanden. Keine Wiederholung des alten B-Übernahmelaufs. Repräsentativer Großkatalogbetrieb bleibt offen; heutiger vollständiger Endvergleich und Rückkehr zu Original .39/Hauptkatalog D: unter 10.54. |
| A-54 / P2 – Schutzregel und produktiver Paarabschluss bestanden | Neues CoL-Update stoppt an 17 bereits bestätigten Klassifikationen ohne aktuellen Zielgruppenbeleg; allgemeiner Fehler zunächst ohne Art/Grund. | Genau eine lesende Quellprüfung: 1.978 passende/17 fehlende Belege, gültige Historie. Felix erlaubt abgesicherten Erhalt unbenutzter, ungeschützter IDs/Tupel/Daten bei gesperrter neuer Auswahl. Eigener gebundener Retentionsbeleg; bestehende Erstprüfung bleibt streng. | Core, Workflow und Such-/Zuweisungspfad einschließlich Raw-CoL-/Supplement-Umgehung unabhängig geprüft; damaliges Gate 50 Gruppen/1.993 Tests bei 165 unveränderten Quellen bestanden. Neuer Auftrag 0d0b6e9e… besteht nach A-66/A-69 am 24. Oktober frische FN-Erfassung, normales Lightroomende und die gemeinsame Übernahme. Kein Umbiegen gleichnamiger Arten; aktive Fortschritts-/Leistungsgrenze A-64 getrennt offen, 10.51/10.53/10.54. |
| A-55 / P2 – CMS-CSS-Kompilierungsfehler nach gesonderter Freigabe live behoben | Version 42 enthielt trotz HTTP 200 nur 557 Byte Compilerfehler. Roher CMS-Text war bytegleich der gültigen Standard-CSS-Datei. Zwei vollständige `clip-path`-Werte ausschließlich im CMS LESS-escaped; Koordinaten und Rechenwerte unverändert. | Vor Speichern frischer Quellhash unverändert; unabhängige CMS-Neuladung bestätigt exakt den Kandidaten. Öffentliche Version 43 enthält 10.951 Byte Stilregeln ohne Compilerfehler und beide unveränderten Formeln. Artseite und Übersicht laden 43; nachhaltige CMS-Eingaberegel in README ergänzt. | Eng begrenzte Freigabe ausgeführt und nachgeprüft, keine Root-Modul-/Footer-/Pages-Veröffentlichung. Eigenständiges Wendehals-Rasterproblem A-56 anschließend gesondert korrigiert; Belege 10.52/10.53. |
| A-56 / P2 – visuelle Kartenüberschrift auf Wendehals live korrigiert | Zweizeilige Überschrift im zu schmalen CMS-Raster reichte rund 22,55–22,75 Pixel in das Kartenbild. | Überschrift auf Kartenbreite erweitert; unabhängige öffentliche Neuladung bestätigt eine vollständige Zeile und 6,78125 Pixel positiven Abstand zum geladenen Kartenbild. Alle 22 rohen Textarrays unverändert. | Desktop und CMS-Mobilvorschau visuell bestanden; keine physische Mobil-/Screenreader-Abnahme. Logische Karten-/Überschriftenreihenfolge unverändert. Belege und unabhängiger Review unter 10.53. |
| A-57 / P2 – veröffentlicht und öffentlich bestätigt | Tatsächliche Übersicht mit `sort.js?v=1.0.1` zeigte Weitere Tiere vor Wendehals und Wintergoldhähnchen. | Exakt diese normalisierte Kachel steht zuletzt; echte Arten bleiben alphabetisch. Gegenprobe zuerst 1/6, danach 6/6; registrierte Gruppe 31/31 bestanden. | Freigegebener Commit 0db6a69 und Pages 40006195707 erfolgreich; CMS lädt 1.0.2. Öffentliche Reihenfolge Weißstorch → Wendehals → Wintergoldhähnchen → Weitere Tiere samt Originalbild bestätigt. Vollständige Drei-Ansichtenprüfung separat offen; 10.54. |
| A-58 / P2 – Zoom 1.0.9 veröffentlicht und öffentlich nachgeprüft | In 1.0.8 schloss einmal Escape eigenen Zoom und umgebende Galerie. | Gekoppelte vollständige Tastensequenz einschließlich Loslassen und Wiederholungen abgesichert; 37/37 registrierte Prüfungen. Echte Galerie: Tab/Shift-Tab im Dialog, erster Escape erhält Foto, Galerie, `itemId` und Fokus am Zoomknopf; nächster Escape schließt Galerie. | Enger Vier-Dateien-Commit fae6d4f, Pages 40009956926 erfolgreich; CMS lädt 1.0.9. Frische unverdeckte Originalbilder und AX unter 10.54. Keine physische Touch-/Screenreaderabnahme. |
| A-59 / P2 – Kontakt-/Footer-/Ausrüstungslayout veröffentlicht und geprüft | Formular und Datenschutzhinweis, Footercredit und Spenden sowie mehrzeilige Produktüberschriften überlagerten sich; schmale Footerzelle schnitt Mailadressen ab. | Freigegebene enge Raster-/Umbruchregeln, compilerfeste Langformen. Öffentliche CSS 46; neun vollständige Ansichten, 33 Originalbilder und 42 Produktüberschrift-/Textpaare unabhängig geprüft. | Alle genannten Überlagerungen behoben, Mailadressen vollständig. Referenzcommit 5bfe3a6, Pages 40015107621 mit drei erfolgreichen Jobs; 10.54. |
| A-60 / P3 – veröffentlicht und öffentlich geprüft | Kontaktüberschrift und einzelne Ausrüstungsüberschriften brachen innerhalb von Wörtern; Tabletphotos auf Kontakt/Über uns beschnitten eine Person. | V3 ausdrücklich freigegeben; unabhängige CMS-Neuladung bestätigt den exakten Kandidaten, öffentlich CSS 48. Zwölf Zellen einschließlich Sizilien und alle 47 Originale unabhängig angesehen. | Beide Personen in schmalen Ansichten vollständig, freigegebene Wörter und Abstände lesbar, 42 Ausrüstungspaare weiterhin getrennt. Keine vollständige Funktionsabnahme daraus; 10.54. |
| A-61 / P3 – Tabletvarianten lokal angenommen; Home-Hinweis veröffentlicht | Home-Personenfotos/-Formular und Spenden-Textfluss/Titel auf Tablet. | Felix’ gewählte vollständige Fotos, gestapelte Home-Bereiche, breite Spendentexte und kompaktere Spendentitel integriert und nativ bestätigt; Knopf etwa 164 × 44 bei 768/820. Vorhandener Kontakthinweis bei Home ergänzt, öffentlich in drei Ansichten sowie tatsächliches Linkziel geprüft. | Gemeinsame CSS-/Footer-/Pages-Veröffentlichung offen. Die anschließend gezeigte mobile Variante „Ganze Wörter“ ist ebenfalls angenommen, integriert und bei 320/390/768/1280 bestätigt. Kein Formularversand oder Zahlung. Endstand in 10.54. |
| A-62 / P2 – veröffentlicht und öffentlich geprüft | Latium steht Desktop/Tablet unter 2022, mobil nach 2023; das „In Arbeit“-Band liegt breit bei Montenegro, mobil bei Costa Rica. | Felix bestätigt damals Latium überall unter 2022 und ausschließlich Montenegro mit Band. Exakte alte oder vollständig reparierte Blockfolge vor Mutation geprüft; 23 Sortiertests und drei vollständige lokale Ansichten bestanden. | Sort 1.0.3 / CSS 49 veröffentlicht, beide Pagesläufe erfolgreich; alle 31 öffentlichen Originale in drei Ansichten unabhängig GO, 10.54. Die neue Statusregel vom 25. Oktober erweitert diesen damaligen Auftrag unter A-76. |
| A-63 / P3 – gewählte Typografie lokal integriert und nativ bestätigt | Mobile Wortzerlegung bei Datenschutz, Haithabu und Lütjenburg. | Angenommene „Ganze Wörter“-Varianten exakt übernommen; tatsächliche mobile Browseransichten ohne horizontalen Überlauf bestätigt. Wildlife Tablet bleibt nach Felix’ Entscheidung in ganzen Wörtern zweizeilig wie bisher; Reiseübersicht ebenfalls erhalten. | Kein Rechtsinhalt geändert. Gemeinsame Veröffentlichung/öffentliche Nachprüfung bleibt offen; Kategorienfolge bei A-76 bereits entschieden. Endstand in 10.54. |
| A-64 / P2 – Abschlussanzeige lokal korrigiert und nativ bestätigt | Veralteter Suchindexfortschritt, hängende/überholte GET-Antworten und historischer179er-Konfliktdetailtext konnten dem tatsächlichen Ablauf widersprechen. | Bestehende Statusleser und Detailrenderer korrigiert; reproduzierte rote Gegenproben jetzt grün. Aktuelles Gesamtgate50 Gruppen/2.086 bestanden. Native Neuladung zeigt Abschluss und korrekte historische Quellenhinweise ohne Sperrtext. | Abschlussanzeige abgenommen. Leistungs-/Fortschrittsabnahme während eines künftigen echten aktiven Aufbaus bleibt gesondert offen; dafür keinen unnötigen produktiven Aufbau starten, 10.54. |
| A-65 / P3 – acht Textkorrekturen und Katzenfokus öffentlich umgesetzt | Belegte Griechenland-Schreibfehler und stark angeschnittene Klosterkatze. | Acht freigegebene minimale Korrekturen in echten CMS-Feldern gespeichert, auf allen fünf betroffenen öffentlichen Seiten bestätigt; Buttonziel tatsächlich geöffnet. Nur das bestehende Katzenbild auf Fokus 50 % / 100 % gestellt, drei Ansichten und Galerie/Zoom/Escape geprüft. | Bildquellen, Reihenfolge, quadratische Vorschauen und Nachbarbeschriftungen erhalten. Keine neuen Seiten/Knöpfe ohne Ziel ergänzt. Allgemeiner Alternativtext-Workflow bleibt nach dem Audit; keine gemeinsame Pages-/CSS-Veröffentlichung daraus. Endstand Schritt 5 in 10.54. |
| A-66 / P1 – Retentionskorrektur produktiv bestanden | Job und Updateworkflow seit 20:46:03 UTC `failed`: „Die Identitätshistorie der Retention wurde verändert.“ Native Anzeige verblieb beim alten Job. | Fehler mit echten Buildern reproduziert; getrennte historische/finale Bindung und zwölf neue Regressionen unabhängig geprüft und lokal übernommen. Gemeinsame Regression 186/186 und Gesamtgate 50 Gruppen/2.034 bestanden. | Neuer gebundener Auftrag 0d0b6e9e… mit eigener FN-Erfassung und normalem Lightroomende besteht am 24. Oktober den gemeinsamen Paarabschluss. Alter Fehlauftrag erhalten; Anzeigegrenze A-64 getrennt offen, 10.54. |
| A-67 / P2 – veröffentlicht und öffentlich geprüft | Bei 768 × 1024 überlagerte „FRÜHLINGS“ den Corona-Abbruchhinweis. | Ein gezielter Rasterentwurf in drei Größen und 16 Originalen unabhängig geprüft; Felix genehmigt die Veröffentlichung. Exakter Kandidat im CMS und öffentliche CSS 48 bestätigt. | Alle drei öffentlichen Ansichten unabhängig erneut angesehen: Titel, Hinweis und Knopf getrennt, vier Karten erhalten; keine Textänderung, 10.54. |
| A-68 / P1 – Vorschau korrigiert und nativ bestanden | Nach regulärem Neustart meldet der Wiederanlauf „Die Neustartvorschau benötigt einen begrenzten, lesbaren Eingangsstand.“ | Tatsächliches Kandidatenmanifest 1.138.867 Bytes trifft allgemeine 512-KiB-Grenze. Eigene Manifestgrenze 12 MiB; vollständige Herkunfts-/Bytehashprüfung und allgemeines Limit erhalten. Reproduziertes RED, isoliert 18/18 und integriert 141/141 bestanden. | Regulär frisch geladen, Bestätigung und neue FN-Erfassung bestanden. Zusätzlicher Erneuerungsfehler A-69 ebenfalls behoben; neuer Auftrag besteht am 24. Oktober den gemeinsamen Paarabschluss, 10.54. |
| A-69 / P1 – Erneuerungsgrenze produktiv bestanden | Neue Erfassung gültig gespeichert und akzeptiert, Lightroom regulär geschlossen. Auftrag 96253471… seit 00:53:19 UTC `failed/start`, `buildStarted:false`: „Die Klassifikations-Erneuerungsdatei überschreitet die zulässige Größe.“ | Zwei Manifestlesestellen korrigiert; isoliert 31/31, integriert 243/243 und Gesamtgate 50 Gruppen/2.065 Tests bestanden. Regulär neu geladen, neuer Auftrag 0d0b6e9e… besteht frische Erfassung, 179 erneuerte Entscheidungen und fertigen Kandidaten. | Seit 03:18:42 UTC `completed/completed`, neues gemeinsames Paar und passende aktive Manifeste bestätigt. Alter Fehlauftrag erhalten; native Anzeigeabnahme A-64 bleibt getrennt, 10.54. |
| A-70 / P3 – gestalterisch und redaktionell im vereinbarten Umfang abgeschlossen | Große quadratische Tabletgalerien vergrößern kurze Bildkanten und beschneiden Panoramen; einzelne Hero-/Textgestaltungen und redaktionelle Formulierungen unterscheiden sich. | Weitere zwölf Reiseseiten in allen drei Ansichten unabhängig vollständig angesehen. Felix bestätigt am 25. Oktober ausdrücklich quadratische Vorschaubilder; beim Klick großes Foto. Der Beschnitt ist damit gewollt. | Quadratische Reisevorschauen bleiben gewollt; reale Galerie/Zoom öffentlich bedient. Die konkreten Inhaltsentscheidungen und 19 Textstellen auf 15 Seiten sind umgesetzt und öffentlich bestätigt. Individuelle Nachbartexte erhalten; Alttextworkflow bleibt nach dem Audit. Website-Schritt 6 in 10.54. |
| A-71 / P2 – veröffentlicht und öffentlich nachgeprüft | Bachstelze mobil und weitere Artseiten: Überschrift und Karte überdecken sich. Amsel zeigt zusätzlich eine Überdeckung des inneren Kartenkopfs. | Alle 41 Kartenkörper mit Legende, Quellenzeile und geladenem Galerieanfang in drei Ansichten unabhängig bildlich angenommen; 38 Zielüberschriften je Ansicht separat bestätigt. Frischer Wendehalskontext in drei Ansichten vollständig angenommen. Amsel bei 320/390/767/768/1280 geprüft. Zusätzliche Kormoran-/Kleiber-Grenzserie mit 23 Originalen bestätigt freien Kandidaten bei 767 und unveränderten Bestand bei 768; lokales integriertes CSS übernommen. | Die angenommenen Regeln und kompakte Karte 1.0.11 sind über den kanonischen Import veröffentlicht. Wendehals in drei öffentlichen Ansichten einschließlich vollständiger Vorschau, linker Ausrichtung auf Desktop/Tablet und Vergrößerung geprüft. Frühere Grenzserien bleiben eigene private Nachweise; 10.54, Website-Schritt 6. |
| A-72 / P2 – veröffentlicht; öffentliche Einbindung bestätigt | Geoffroy-Klammeraffe: Lebensraum/Fortpflanzung. Buckelwal: Aussehen/Verbreitung. Haubenmeise: Lebensraum/Brut. Gabelracke: Besonderheiten/Beobachtungstipps. Goldbaumsteiger: Aussehen/Verbreitung. | Alle 29 mobilen Übergangsoriginale sowie sämtliche zehn breiten Kontexte mit Baselinevergleich unabhängig angesehen. Zusätzlich alle fünf Arten bei 767/768, Baseline/Kandidat, mit vollständigen Textregionen in 78 Originalen geprüft: Gabelracke/767 rot zu frei, fehlerfreie Kontrollen ehrlich erhalten, breite Darstellung unverändert. Lokale CSS-Integration erfolgt. | Vollständige frühere Absatz-/Grenzvergleiche bleiben erhalten; die identischen Regeln sind im geprüften öffentlichen Standard-CSS eingebunden. Öffentliche Kontrollen und Grenzen in Website-Schritt 6; keine erneute vollständige Absatzlektüre aller Grenzzellen behauptet. |
| A-73 / P2 – freigegebenen Bildtext übernommen und öffentlich geprüft | Boca Tapada beschreibt Kahnschnabel als afrikanischen Vogel mit schuhförmigem Schnabel. | Den von Felix festgelegten Wortlaut am 25. Oktober im Beschreibungsfeld von `_7R53584-Verbessert-RR.JPG` übernommen. Frische öffentliche Neuladung bestätigt genau eine geänderte Bildbeschriftung sowie ihre zwei davon abgeleiteten Altattribute. | Alle 37 Bilder, Links, Reihenfolgen und übrigen Texte unverändert. Öffentliche Desktop-/Tablet-/Mobilansichten aufgenommen; unabhängiger Bildreview und genauer Wortlaut am Ende von 10.54. Kein allgemeiner Alternativtext-Umbau. |
| A-74 / P2 – veröffentlicht und öffentlich bedient | Die frühere mobile Kartenansicht hatte keine zugängliche Dialog-/Tastaturführung. Beim aktuellen integrierten Stand kann zudem die feste Kopfzeile nach der Rückgabe den oberen Fokusrahmen verdecken. | Zugänglicher Öffner und Dialog lokal korrigiert. Map 1.0.10 stoppt beim Rückfokus laufendes weiches Scrollen ohne Positionsänderung und prüft anschließend einmal den tatsächlich verdeckten oberen Fokusanker. Amsel/Kormoran frisch bei 390/767 mit Schließen und Escape stabil bestätigt; 27 Repositoryfälle und unabhängiger Quellenreview. | Kompakte Karte 1.0.11 öffentlich: Klick und Tastatur öffnen, Tab/Umschalt-Tab bleiben im Dialog, Escape schließt und gibt den Fokus zurück. Verdeckte DOM-Reste sind keine offene Ansicht. Physische Touch-/Screenreaderabnahme nicht beansprucht; 10.54. |
| A-75 / P2 – eng korrigiert und tatsächlich im Browser geprüft | Tatsächliche A-26-Originalaufnahmen zeigen die vollständige Aktionsauswahl unter dem laufenden oder nicht bestätigten Backup-/Pipeline-Status. | Die Handler setzen `pipelineModeChoice.hidden=true`; die Rasterregel überschreibt die Standardausblendung. Nur `.pipeline-mode-choice[hidden] { display: none; }` ergänzt. Rote CSS-Gegenprobe, danach 64/64 passende Tests und Stilprüfung bestanden; keine JavaScript- oder globale Hidden-Änderung. | Neue eigene Browserrunde bestätigt bei Backup/Pipeline jeweils laufend und abgeschlossen das echte Hidden-Attribut, berechnetes `display:none` und null sichtbare Auswahlknöpfe. Ausdrücklicher freier Aktionswähler bleibt `display:grid`, ohne Hidden-Attribut, mit 13 sichtbaren Knöpfen. Eigene Probe geschlossen/0, alle 13 Ausgangsdateien und 182 gebundenen Quellen unverändert. Neues vollständiges lokales Gate am 25. Oktober mit 50 Gruppen/2.215 Tests bestanden; Beleg am Ende von 10.54. |
| A-76 / P2 – veröffentlicht und in drei Ansichten geprüft | Reise-Logo-Platzhalter für Namibia 2022/2023, Latium, Marken und Botswana erscheinen ohne „In Arbeit“. | Sort 1.0.5 erhält alle sechs Originalbänder und 50 Blöcke; 48 Sortier- und 15 Accessibilityfälle bestanden. Sechs vollständige Übersichts-/Statuskontexte mit 68 Originalbildern unabhängig angesehen: richtige Plätze/Jahre/Sortierung sowie tatsächliche Bandbewegung. Wildlife steht Heimische Tierwelt zuerst, danach alphabetisch, Asien/In Arbeit zuletzt. | CMS/Footer und öffentliches Sort 1.0.5 gemeinsam bestätigt. Alle 50 Blöcke, 14 Reisekacheln und sechs sichtbaren Originalbänder erhalten; Latium bei 2022, Kategorien wie angenommen sortiert. Keine physische Touchabnahme; 10.54. |
| A-77 / P2 – angenommen, veröffentlicht und öffentlich nachgeprüft | Blässhuhn, Buntspecht, Totenkopfaffe, Kormoran, Austernfischer, Grüner Leguan und Gabelracke: Teile der ursprünglichen Desktop-Titel sind über dem Foto schlecht lesbar. | 28 neue Originalaufnahmen, alle 14 Vorher-/Nachher-Paare mit gleicher Fotoquelle, Farbe und Geometrie. Felix akzeptiert am 26. Oktober ausdrücklich die gezeigten Varianten auf Desktop und Tablet. | Die angenommenen Kontur-/Schattenregeln sind veröffentlicht, Cache 1.0.18. Titel-/Bildpositionen und ursprüngliche Farben auf Desktop/Tablet bleiben erhalten; mobile Titel schwarz unter dem Foto. Details und Prüfumfang in Website-Schritt 6. |
| A-78 / P2 – alle neun angenommen, veröffentlicht und öffentlich geprüft | Bei neun Tablet-Artseiten liegt ein Teil des Tierkopfs hinter dem festen Header; beim Papageientaucher fast vollständig. | Felix nimmt zunächst Papageientaucher, Buchfink und Kormoran an, danach ausdrücklich alle sechs gezeigten Nachher-Varianten. Alle neun Versätze ausschließlich für Tablet lokal integriert. Nach dem ersten 26-Zustände-Lauf weitere 45 gültige native Zustände im gemeinsamen Stand geprüft; alle sechs Einbauten stimmen mit den angenommenen Vorschauen überein. | Alle neun individuellen Tabletversätze öffentlich bei 768 CSS-Pixeln bestätigt; Kopfzeilenüberlagerung, volle Breite, Fotoquelle und ursprüngliche Farben erhalten. Weitere breite/schmale Kontrollen sowie sieben Taxonomiestufen ohne Ladefehler in 10.54. |
| A-79 / P2 – angenommen und öffentlich bestätigt | Die mobile Heroaufnahme zeigt geladene Baumstämme, aber keinen eindeutig sichtbaren Eichelhäher. | Frische stabile Aufnahme und Originalvergleich bestätigen denselben bisherigen Fokus, dieselbe Quelle und denselben Beschnitt; kein Ladefehler. Titel-/Layoutabnahme trotzdem 63/63, Motivabnahme 62/63. | Freigegebener Fokus 83 % horizontal veröffentlicht und mobil mit sichtbarem Tier bestätigt. Bisheriger Y-Fokus, Quelle und Geometrie erhalten; breite Kontrollansichten ohne mobile Verschiebung. Website-Schritt 6. |
| A-80 / P2 – leere Bildquelle korrigiert; Gesamtgate und Frontendproben bestanden | Warmer Explorer-Prüfstart meldet einen Ressourcenfehler mit der Dokumentadresse; das versteckte globale Kartenbild trägt `src=""`. Der genaue ursprüngliche Ereignisknoten wurde damals nicht erfasst. | Nur das leere Attribut entfernt; bestehende Öffner setzen weiterhin vor Anzeige eine geprüfte Quelle. Neue rote Gegenprobe, danach 34/34 passende Fälle, unabhängiger Review und vollständiges Gate 50/2.215 bestanden. Keine Abschwächung des Fehlerzählers oder Bereitschaftskriteriums. | 64er- und 2.048er-Frontendrunden mit jeweils vier Starts und 15 Aktionen funktionell angenommen; größere Runde mit belegten Hauptthreadpausen. Zusätzlich drei isolierte echte Electronstarts mit Startzeit-/Windows-Speicherwerten am 26. Oktober bestanden. Produktiver Datenbankstart, physische Erstbildausgabe und langfristiger Speicherverlauf bleiben davon getrennt. Details am Ende von 10.54. |
| A-81 / P2 – fehlgeschlagenen Temp-Erwerb und Speicherwarteschlange korrigiert | Scheitert die Speicherung eines Operationserwerbs, bleibt dessen Zähler erhöht; spätere Speicheraufträge übernehmen die bereits abgewiesene Warteschlange. | Nur die eigene Erhöhung beim fehlgeschlagenen Erwerb zurücknehmen und nach gemeldetem Speicherfehler weitere Speicheraufträge wieder ermöglichen. Zwei echte Dateisystem-Rot-Grünproben, vier unabhängige Gegenfälle und neun gezielte Tests bestanden. | Genau ein vollständiges lokales Gate mit 50 Gruppen/2.217 Tests bestanden; keine Fehler/Abbrüche/Skips. Detaillierter Quellen- und Lognachweis am Ende von 10.54. Keine Bereinigungs- oder Veröffentlichungsfreigabe daraus. |
| A-82 / P1 – Quelle korrigiert, funktionales Gesamtgate bestanden | Desktop-Startprüfung kann trotz Zehn-Sekunden-Grenze unbegrenzt auf HTTP-Header oder JSON-Ende warten; dieselbe unbegrenzte Lesung betrifft drei Schließprüfungen. Schlägt nur eine davon fehl, verwirft der bisherige gemeinsame Fehlerpfad auch bekannte laufende Sicherung und offene Änderungen und beendet ohne Warnung. | Gemeinsame absolute Healthfrist bis zum JSON-Ende und fünf Sekunden je Schließstatus. Getrennte Ergebnisse erhalten bekannte Warnungen; unbekannte Werte verlangen eine ausdrückliche Wahl, Vorgabe offen lassen. Reentrancy-Sperre verhindert doppelte Abfragen/Dialoge. Neue Originalgegenprobe 11/13 rot, danach 13/13 und bestehende gezielte Desktop-/Servergruppe 25/25 grün; unabhängiger Root-Quellreview und Gesamtgate 50/2.234 bestanden. | Vorherbeleg `79ef4c45…` (`5184bf12…`), gezielter Lauf `3fb08bd4…` (`a0ed7477…`), Rootreview `53eb764a…/a82-root-independent-source-review-25oct.json` (`0508bf29…`). Aktuelle Fensterhang-Ursache nicht bewiesen. Regulärer Start, Artsuche, Nachladen und normales Ende nach Runtimeupdate bestanden; die frühere Hang-Erstursache bleibt offen. Keine pauschale Frist für Serverabbau und kein Zwangsende. |
| A-83 / P2 – veröffentlicht und öffentlich bedient | Per Hover sichtbares Untermenü meldet aria-expanded=false und bleibt unter dem Mauszeiger nach Escape offen. | header-navigation.js 1.0.0 ergänzt ausschließlich vorhandene Desktopfolder und eine eigene begrenzte Ausblendung. Eigene Änderungen folgen dem belegten Anbieterhandler. | header-navigation.js 1.0.0, CSS und Footer gemeinsam übernommen. Hover, Escape, Wiederöffnen sowie Enter/Leertaste/Tab und Tabletmenü einschließlich Rückfokus öffentlich geprüft; 10.54. |
| A-84 / P2 – Websitehinweis W geprüft und nach Neustart nutzerbestätigt | Fehlende FN-Artseiten sind in der Artenliste nicht direkt erkennbar; zusätzlich kann eine gültige Nichtverfügbarkeitsantwort bereits bestätigte Links verdrängen. | W ausschließlich bei bestätigt fehlender Seite, mit Tooltip und zugänglichem Namen. Gefundene Seite entfernt W; Fehler/ungeklärter Stand erzeugen keinen Fehlhinweis, bestätigte Links bleiben erhalten. | Vier rote Vorherfälle, danach 21/21 gezielte Tests. Echte Frontendmodule in getrennter Browserfixture bestätigen die Zustandswechsel mit erhaltenem Listenfokus und K/S/P. Felix bestätigt am 26. Oktober ausdrücklich vorhandenes W nach regulärem Explorer-Neustart. Dies ist eine Nutzerabnahme, keine neue unabhängige native Aufnahme; 10.54. |
| A-85 / P2 – veröffentlicht; öffentliche Pyramide bestätigt | Nach Reparatur des privaten CSS-Ladewegs werden sieben Taxonomiestufen geladen, bei tatsächlichen Breiten zwischen 768 und 769 Pixeln aber auf 19,73 Pixel zusammengeschoben. Die alten Medienregeln lassen diese Lücke offen. | Native Rot-Grün-Aufnahme bei derselben gebrochenen Breite: vorher drei Rasterspalten, danach eine 693,45 Pixel breite Modulspalte und alle sieben Stufen sichtbar. Nur die untere Tabletgrenze von mindestens 769 auf größer 768 geändert; Ganzzahlverhalten erhalten. | Unveränderte Rangebedingung im kanonischen Standard-CSS veröffentlicht; kein verlustbehaftetes Umrechnen durch LESS. Öffentlicher Kormoran bei 768/820 mit sieben Stufen ohne Ladefehler, zuletzt Root-CSS/Taxonomiecache 1.0.18 bestätigt. Ursprünglicher privater Ladefehler und Rasterlücke bleiben getrennte Ursachen; 10.54. |

Zusätzlicher Prüfvertragsbefund A-24 / P2: Der neue vollständige Lauf erreicht alle 50 Testgruppen,
endet aber mit Exit 1 bei genau einer veralteten Quellenassertion des letzten Explorerblocks:
explorer-ui-contract.test.mjs:588 verlangt noch Invoke-WebRequest -UseBasicParsing, obwohl A-23 diesen
unbegrenzten Transport durch den begrenzten nativen HTTP-Stream ersetzt. 1.370/1.371 gemeldete Tests
bestanden, 0 Abbrüche/Skips; test:temp 57/57. Ausschließlich die veraltete Builtin-Bindung entfernt,
angrenzende UI-/Backend-/Manuellschutzverträge erhalten. Sicherheitsgrenzen liegen bei den tatsächlichen
Transport-/Sperr-/Größen-/Decoder-Verhaltenstests; kein neuer Implementierungsspiegeltest.
Offizieller test:explorer anschließend 31/31, 8,091 s, ohne Fehler/Abbrüche/Skips; Root-Diffreview Go.
Audio-/Medien-/Größen-/Projekt-/Status-/Site-Endprüfungen sind in diesem Lauf nicht mehr erreicht.

### 10.4 Einmalige Metadaten- und Speicherinventur

Aufnahme 8. Oktober, 15:15:15–15:15:16 MESZ, `lstat`/Dateilängen, ohne Datenbankinhalte oder große Hashscans.
4.313 reguläre Dateien, **100.070.347.944 logische Bytes = 100,0703 GB = 93,1978 GiB**.
Keine Verzeichnis-/Dateilinks oder Dateien mit mehr als einem Hardlink im aufgenommenen Baum.
Physisch belegte Clusterbytes sind nicht gemessen; logische Bytes nicht damit gleichsetzen.
Temp enthält dabei gleichzeitig eigene laufende Auditfixtures und ist keine dauerhafte Leerstandszahl.

| Bereich | Dateien | Logische Bytes | GB | GiB |
| --- | ---: | ---: | ---: | ---: |
| `Daten` | 217 | 98.604.295.574 | 98,6043 | 91,8324 |
| `.git` | 1550 | 461.075.500 | 0,4611 | 0,4294 |
| `node_modules` | 683 | 386.831.183 | 0,3868 | 0,3603 |
| `local-tools` | 3 | 305.647.104 | 0,3056 | 0,2847 |
| `species-explorer` | 421 | 193.267.156 | 0,1933 | 0,1800 |
| `species-assets` | 357 | 112.084.989 | 0,1121 | 0,1044 |
| `temp` | 760 | 1.751.479 | 0,0018 | 0,0016 |
| `docs` | 81 | 1.660.630 | 0,0017 | 0,0015 |
| `Testlauf` | 34 | 1.451.928 | 0,0015 | 0,0014 |
| `scripts` | 103 | 775.814 | 0,0008 | 0,0007 |
| `[root files]` | 31 | 681.449 | 0,0007 | 0,0006 |
| `graphics` | 22 | 486.402 | 0,0005 | 0,0005 |
| `lightroom-plugin` | 47 | 325.428 | 0,0003 | 0,0003 |
| `tools` | 3 | 11.690 | 0,0000 | 0,0000 |
| `.github` | 1 | 1.618 | 0,0000 | 0,0000 |

Der Datenordner ist der wesentliche Größenanteil, nicht die Dokumentation oder der kleine Tempbestand.
Die folgenden großen Gruppen sind Metadatenklassen, noch keine freigegebene Löschmenge:

| Klasse / Bestand | Bytes | Besitzer / Erzeuger / Leser / Wiederaufbau und Schutz |
| --- | ---: | --- |
| aktive und vorherige CoL-Referenz | 11.081.668.674 + 10.760.458.041 | Referenzimport; Master-/Auftragsherkunft, teurer exakter Anbieterinput; historischen Stand nicht durch vermuteten neuen Download ersetzen |
| aktives gemeinsames Master-/Paketpaar | 6.078.456.683 + 3.646.502.774 | Paarworker und gemeinsamer Zeiger; Explorer/LR; geprüfte aktive Bindung schützen |
| gemeinsamer verifizierter Vorgänger | 6.065.432.667 + 3.496.224.549 | Paarworker; gemeinsamer Rücknahmeweg, ein kompatibler Vorgänger geschützt |
| ältere Paarveröffentlichung `publication-98c20464…` | 6.027.517.898 + 3.434.234.739 | historischer Paarworker; Auftragsabhängigkeiten prüfen, alter Ordnername allein keine Entbehrlichkeit |
| Legacy-Master `active` und `previous`, Datenbanken | 6.024.601.600 + 6.165.925.888 | alte aktive/Referenz-/Reparaturgrundlagen; Originalrezepte referenzieren sie weiterhin |
| konsumiertes Master-`staging`, Datenbank | 6.016.413.696 | aktiver Auftrag/aktives Paar gleicher Herkunft; Verbrauch beweist noch keine sichere Entbindung |
| historischer Recovery-Kandidat, gesamte Gruppe | 6.092.519.333 | Quellenreparaturaufnahme; Originalbelege und Identitätsherkunft schützen |
| sechs Aufbauauftragsgruppen | 7.122.541.341; 1.081.290.927; 1.073.161.228; 1.070.550.271; 1.057.472.181; 1.055.823.191 | Worker-Spools/Rezepte/Checkpoints; aktueller, gescheiterter und transitiv benötigte Aufträge, A-04 beachten |
| Legacy-LR `active` und `previous`, Datenbanken | 3.406.684.160 + 3.724.148.736 | ältere Paare/Herkunft, keine heute aktive Consumerwahl durch bloßen Ordnernamen |
| iNaturalist-Providergruppen | 3.752.384.895 | Snapshot-/Lücken-/Namensinputs und Aufbauherkunft, mehrere gebundene Versionen |
| kleine Entscheidungen/Identität/Quittungen/Umzugs-/Reparaturbelege | im Daten-Gesamtwert enthalten | eigene unersetzbare Entscheidungen, 187 konservative Zuordnungen und vier historische Ersatz-IDs; dauerhafte Daten |

Git-Zuordnung und Rückweg:

| Dateiklasse | Zuständigkeit / Git / Wiederherstellung |
| --- | --- |
| Explorer-/Plug-in-/Website-Quellen, Schemas, kleine echte Fixtures, Tests, Lockfile und Workflows | versioniert; Gitstand plus passende Installation; Modulgrenzen statt neuer paralleler Fachregeln |
| öffentliche Artdaten/Overrides/Medien/Credits und benötigte Grafiken | versioniert und Pages-Positivliste; fachliche Projektentscheidungen, keine privaten globalen Register |
| PSD-Designquelle | Git als bearbeitbares Original; Positivliste veröffentlicht keine PSD; kein funktionaler Nachweis einer Löschbarkeit |
| große Referenz-/Master-/LR-Daten, private globale Namen/Identität, lokale Aufträge/Nutzungsbelege und Konfiguration | Git-ignoriert, externe Vollsicherung; genaues Paar und Originalbelege wiederherstellen, nicht nur Code klonen |
| `species-explorer/backups`, Medien-/Pipeline-Rücknahmesätze, Review-/Creation-Aufträge | lokaler dauerhafter Rückweg bis gebundenem Abschluss; bei Unersetzbarkeit externe Sicherung, kein Schließ-Temp |
| `node_modules`, `local-tools` | Installations-/Werkzeugstand, reproduzierbarer Aufbau mit Lockfile/Version; vorhandene Vollsicherung enthält Offlinewerkzeuge |
| `.git` | Historie/Remotezustand; GitHub plus komplette NAS-Sicherung; kein History-Rewrite |
| `_site`, eigene neue temp-Fixtures/-Logs | erzeugtes Artefakt/entbehrliche eigene Sitzung nach Helferende; kein öffentliches oder NAS-Dauerbackup |
| alte `Testlauf`- und andere Reparaturablagen | Besitzer/Belegbindung einzeln prüfen; nicht aufgrund des ignorierten Pfads löschen |

NAS frisch lesend: drei ZIP-Dateien mit 822.199.096, 946.318.733 und 21.785.161.273 Bytes.
Das aktuelle Manifest v2 wurde ohne erneute Großinhaltslesung geöffnet: Archiv-ID
`9f50eb9e-be21-454d-b29f-b0bd18cdcff8`, 3.459 Inhaltsdateien und 100.066.048.623 Inhaltsbytes,
3.460 ZIP-Einträge einschließlich Manifest. Der SHA-/Vollrücklesenachweis vom 7. Oktober ist historisch;
heute kein zweiter 100-GB-Hashscan. Juni/August bleiben geschützte Altarchive, nicht zwei moderne Vollstände.
**Bisheriger tatsächlicher Speichergewinn dieses Audits: 0 Bytes**; kein Löschauftrag ausgeführt.

### 10.5 Betriebs-/Leistungsmessung und unabhängige Gegenreviews

Neuer isolierter Betriebslauf mit 1.200 synthetischen Arten, Node 24.12.0, Windows, eigener
`temp/benchmarks`-Sitzung: harter Workerabbruch nach 500, Wiederaufnahme, 1.170 wiederverwendete Arten,
inkrementelles Paket fachlich identisch zum Vollpaket, Namenswahl und offene Altleser erhalten,
gemeinsame Rücknahme und ursprüngliche Bytes geprüft. Keine produktiven Daten/Kataloge beteiligt.

| Messabschnitt | Verstrichene Millisekunden |
| --- | ---: |
| erster Masteraufbau | 1.144,25 |
| erstes Paar bereitstellen | 481,09 |
| unterbrochener Änderungsaufbau | 801,73 |
| Wiederaufnahme | 1.446,57 |
| Änderungspaar bereitstellen | 735,82 |
| vollständiges Vergleichspaket | 236,13 |
| gemeinsame Rücknahme | 413,22 |

44 Steuerprozess-Ticks während Paarveröffentlichung belegen dessen laufende Ereignisverarbeitung,
keine gemessene native Bildrate. Ein einzelner kleiner Lauf unter parallelen Auditprozessen ist keine
Großbestandsprognose oder isolierte Optimierungs-Vorher-/Nachherreihe. Keine zusätzlichen produktiven
Millionenläufe gestartet. Weitere Explorer-/LR-/Website-/Artefaktmessungen und native Grenzen folgen.

Zweitreviews: Taxonomie-/Speicherpflegekorrekturen durch Integration gegengelesen; konservativer
Originalhash-/Pfad-/Inputschutz bleibt erhalten. LR-Statistik-/CSV-Diff unabhängig durch Taxonomie-Reviewer
geprüft, ohne konkrete neue Regression. Medienreview durch Integration verlangte tatsächlichen Decoder,
asynchronen statt blockierenden Helfer, echte Pixelgrenze und frische Eingangsprüfung nach awaits;
diese Gegenreviewpunkte sind umgesetzt. Finale Gruppen-/Gesamtprüfungen bleiben gesondert auszuweisen.

### 10.6 Frische Taxonomie-/Identitätsprüfung und Schutzmenge

Lesende enge Readerproben am 8. und 9. Oktober: tatsächlicher Masterreader und Kern des LR-Suchreaders,
SQLite `readOnly`/`query_only`, Schema-/Tabellenvertrag und gebundener Korrekturstand. Der übliche
LR-Öffnungsinspektor zählt mehrere gesamte Tabellen auch bei `full: false`; deshalb für diese bewusst
begrenzte Aufnahme nicht benutzt. Keine neuen DB-Hashes oder vollständigen Integritätsläufe.

- 220 aus Original-Reparaturplan, Ersatz-IDs, Namenswahlen und Projektlinks abgeleitete IDs per Primärschlüssel
  in aktivem und vorherigem Master geprüft: jeweils 216 aktiv und exakt vier historisch `deprecated`,
  keine fehlende/unerwartete ID. Alle 154 Original-IDs stimmen zusätzlich in Name, Rang und Reich mit dem Plan überein.
- `Storchodon cingulatus` bleibt `mtx_6bbad0b4ee45cbfbde46c3c87b22292c`, aktuell Animalia mit CoL-/GBIF-Beleg.
  Die frühere fehlende Reichszuordnung und die heutige ursprüngliche ID sind verschiedene Eigenschaften.
- Vier technische Ersatz-IDs bleiben historisch; Originale aktiv, im LR-Bestand keine zweite aktive Art
  und keine automatische Fotoänderung. Eigene Namen Rotstirnamazone, Taubenschwänzchen, Leopard,
  Weissstorch und Rebhuhn sowie die zugehörigen drei englischen Wahlen erhalten.
- 60 gespeicherte Projektlinks wertgleich zum Vorgänger und im Paket, 56 positive genutzte IDs frisch
  aus den kleinen gespeicherten Quittungen abgeleitet und in beiden Verbrauchern vorhanden. Quittung vom
  3. Oktober 05:40:53.192 UTC: Schutzbeleg, keine neue Erfassung des heute geöffneten Katalogs.
- Die zusätzliche heutige Projektart ist Goldbaumsteiger / `Dendrobates auratus`, aktiver Taxon
  `mtx_1070de25cb543b2ef282d5ae594d33ed`, `exact-col`. Das Paar vom 3. Oktober hat seinen später ergänzten
  Projektbezug noch nicht. Keine neue/doppelte Identität; kein unaufgeforderter Paketaufbau daraus.
- 184 ausgewählte eigene/projektbezogene Felder in der gezielt abgeleiteten Menge wertgleich zum Vorgänger:
  176 mit Projektherkunft und acht mit manueller Herkunft. Acht manuelle Felder in den 220 IDs sind ein
  Teilmengenzähler. Historische 46 waren eine globale Auswahl; die alten Ergebnisbelege enthalten
  keine vollständige Feld-/Taxonliste über die bekannten Namensfelder hinaus. Nach gesonderter
  Quellenprüfung wurde deshalb am 9. Oktober genau ein read-only Helferlauf beschlossen und ausgeführt:
  historisch und heute als Vorgänger gebundener Master master-20261001145513036 in publication-60f9b546…,
  aufgezeichneter DB-Prüfwert f994a9c4… und originale Auftragsrevision 338ce21c… passen zu den Belegen.
  Maximal 47 Ergebniszeilen, kein zweiter Versuch, Elternprozess auf 60 s begrenzt. Tatsächlich
  **46 eindeutige historische Felder aus zwölf Taxa** vollständig ermittelt; anschließend 46 gezielte
  Indexseeks im aktuellen Master: **46 Werte identisch, 46 weiterhin origin_kind manual, alle accepted,
  0 Änderungen**. Der historische Abruf benötigt einen Scan des ausgewählten Feldindex; Ergebnisgrenze
  und 8-MiB-DB-Cache begrenzen nicht vorab die gelesene Datenmenge. Gesamtdauer des Readers 33,605 s.
  Acht kleine Inhaltsbindungen und zwei DB-Statwerte vor/nach gleich, beide Reader vor Erfolg geschlossen;
  Eltern-/Helfersitzung geschlossen mit 0 Operationen/0 Helfern. Kein aktiver produktiver Aufbau vor
  Start festgestellt, keine DB-Schreibwirkung, kein neuer großer Datei-Prüfsummenscan.
  Dauerhafter Rohbeleg: temp/explorer/bcd5e6ee-1a70-4b84-9b6d-8018e96db122/manual-fields-result.json
  mit vollständigen Tupeln und Ausführungsquelle in derselben eigenen Sitzung. Unabhängiges Medien-
  Gegenreview bestätigt alle 46 Tupel und die Bindungs-/Schließaussage. **Erhalt der historischen 46 heute
  geprüft; daraus folgt kein neuer globaler Zähler aller heute manuellen Felder.**
- 19 kleine Bindungen/vier DB-Statwerte am 8. Oktober und sieben Bindungen/zwei Master-Statwerte im
  Nachlauf byte-/größen-/zeitgleich; alle Reader im `finally` geschlossen. Aufgezeichnete Checksumbindungen
  verglichen, tatsächliche Datenbank-Prüfsummen nicht neu berechnet.

Aktive Korrekturrevision `35bea2af676b3eb3864425e14217852dcdfa0c6f044008c27647eab42b52b5d8`,
Identitätsrevision `8aba3cdd302211c0f252971e8f00cf7505bfc87b7fdcc2c149b090512226b74b` und gespeicherte
Nutzungsrevision `2fde87b8fc14ea3bcf4e240e6f89bd9e01f68cc7fd542036658e7fe2e287290e` passen zum erfassten Paar.
Die 187 erhaltenen bisherigen Zuordnungen sind fachliche Zurückstellungen, kein heutiger Fehler-/Löschauftrag.

Die frische kleine Schutzbindungsprüfung validiert sechs originale Rezeptrevisionen und drei
Recovery-Journale mit Originalchecksums/Jobrevision; Originalbytes unverändert. Am 9. Oktober wurden
zusätzlich die sechs hier genannten absoluten Jobpfade samt recipe.json einzeln auf Existenz geprüft
und das zuvor ausgelassene echte Ordnerpräfix job- in der Tabelle ergänzt, ohne Datenbestände zu ändern.
Die korrigierte transitive
Schutzmenge erklärt den Großbestand und verhindert gerade die vermeintlich einfache Freigabe älterer Inputs:

| Absolutes Ziel / Klasse | Metadatenmenge | Nachweis / heutige Löschbedingung |
| --- | --- | --- |
| `D:\Arten-Explorer\Daten\taxonomy\master\build-jobs\job-1c0243c8-e1d7-477d-8e5e-b775549bb0af` | 8 Dateien / 1.057.472.181 B | fertiger Wiederanlaufauftrag, benötigte Originalinputs; geschützt |
| `D:\Arten-Explorer\Daten\taxonomy\master\build-jobs\job-5ca4836e-1cce-418d-80cc-e93a3a59b61f` | 8 / 1.055.823.191 B | transitiver Input von `65f…` und `1c…`; geschützt |
| `D:\Arten-Explorer\Daten\taxonomy\master\build-jobs\job-65f8c166-6d9e-4e00-b471-35b761e2927f` | 10 / 7.122.541.341 B | fehlgeschlagene Quellenreparatur, noch gebundener Wiederanlauf; geschützt |
| `D:\Arten-Explorer\Daten\taxonomy\master\build-jobs\job-8006153d-67c0-4e4f-97e7-224fd15d120e` | 8 / 1.081.290.927 B | aktuelles Paar/verbrauchtes Staging und Originalinputs; geschützt |
| `D:\Arten-Explorer\Daten\taxonomy\master\build-jobs\job-b7795544-1758-464f-baaf-66c7ed6f32db` | 8 / 1.073.161.228 B | fertiger Auftrag, Alters-/Frische-/Schutzprüfung vor künftiger Vorschau; heute keine gültige Löschrevision |
| `D:\Arten-Explorer\Daten\taxonomy\master\build-jobs\job-bfb06bf7-94b3-4c69-be2c-42af970a1f3a` | 8 / 1.070.550.271 B | Transfer/retained Recovery-Kandidat braucht Originalaufbau; geschützt |
| `D:\Arten-Explorer\Daten\taxonomy\master\active`, `previous`, `staging`, `source-recovery` | große Gruppen aus 10.4 | originale Rezepte, Paar und Reparaturherkunft; alte Namen/verbrauchter Kandidat sind keine Entbindung |
| ältere gemeinsame Veröffentlichung `publication-98c20464-c570-441e-9675-2772526774b1` | Master 6.027.517.898 B plus LR 3.434.234.739 B | von vier erfassten Originalaufträgen weiter benötigt; nicht frei als „zweiter Vorgänger“ |
| iNaturalist-Snapshots/Quellenoriginale | 14 Verzeichnisse / 28 Dateien in der Providerklasse | aktive und Reparaturbindungen, nicht allein wegen Alter entfernen |
| drei NAS-ZIPs unter `W:\Website Datenbank Backup` | 23.553.679.102 B zusammen | ein modernes geprüftes Vollarchiv, zwei geschützte ältere Altarchive; kein Auftrag zum Ersetzen/Löschen |

**Freigabefähige tatsächliche Löschmenge jetzt: keine.** Obige Tabelle ist eine konkrete Ausschluss-/
Vorprüfmenge, kein gültiger Löschplan. Ein künftiger Plan muss die aktuellen Integritäts-/Prozess-/Revision-
Voraussetzungen erfüllen; die produktive Speicherpflegevorschau würde dafür große Paarprüfsummen neu lesen.
Das wurde in dieser Aufnahme nicht still als kleine Metadatenabfrage ausgeführt. Vor einem solchen späteren
Lauf Verbraucher/Aufträge prüfen, genau einmal Vorschau erzeugen und nur deren konkret bestätigte Ziele
bearbeiten. Erwartete Einsparung bis dahin nicht als garantiert ausgeben. **Auditbereinigung: 0 Dateien/0 Bytes.**

### 10.7 Tatsächliche isolierte Sicherung und Wiederherstellung

Echter kleiner Bestand mit aktuellem und vorherigem Master-/LR-Paar, bestätigter Fortführung
`Testus alpha → Testus gamma`, unveränderter ID `mtx_aa2f1ecd6b1bcd3eb3c919fff7dd7844`, eigener Namenswahl
„Mein Name“, Projektlink und Medien. Tatsächlicher Storage-Plan/Prepare/Commit in `Daten`, Zustand `ready`,
gültiges Umzugsjournal. Die kopierte echte NAS-Routine lief mit der bestehenden lokalen PowerShell-
Ausführungsoption, ohne globale Richtlinienänderung; eigene Git-Fixture mit `example.invalid`, kein Push.

Archiv tatsächlich geschrieben, **162 Dateien/1.430.448 Inhaltsbytes**, SHA-256
`d79bd585c33e3fa4da98d26f19005a1b029a1d72b85b8a833e3c71c7f6cd7b20`, `archiveVerified: true` nach vollständigem
Wiederlesen aller Inhalte. ZIP in neuen eigenen Pfad entpackt. Echte kopierte Resolver und Explorer-/LR-
Reader bestätigten gleiche ID, Namen, Suche, Projektbezug, Identitätsentscheidung und `automaticPhotoChange: false`.
Register, Regelbytes und Portraitprüfwert identisch; vorheriges Paar mit `Testus alpha` weiterhin lesbar.
Ursprüngliche Zeigerbytes unverändert, `.env`/Temp ausgeschlossen. Reader und Helfer geschlossen, nur diese
eigene kleine Fixture entfernt. Das ist ein tatsächlicher Restore, keine bloße Dateiexistenzprobe.

Das NAS-Produktivarchiv vom 7. Oktober bleibt separat: Inhalt rund 100 GB, aktueller v2-Manifestumfang
frisch gelesen, Großinhalte heute nicht erneut gehasht oder an einen zweiten Ort kopiert. Der aktuelle
Datenbestand ist 6.245 Bytes größer als der damalige Daten-Manifestumfang; das beweist weder Medienverlust
noch Gleichheit jedes privaten neuen Belegs. Sicherungsalter/Änderungen verständlich anzeigen.
Freier Platz auf D: bei Aufnahme 111.971.266.560 Bytes; keine Platzgarantie für einen gleichzeitigen
Vollrestore plus Aufbau. Keine neue große Kopie beauftragt.

LR-Katalogindex/-revisionen befinden sich im Katalog, Adobe-Prefs im Benutzerbereich und persönliche Exporte
an ihrem bewusst gewählten Ort. Die Explorer-NAS-Sicherung allein ist **keine vollständige Sicherung des
externen Lightroom-Katalogs oder der Fotooriginale**. Gemeinsame Namen/Identität/Nutzungsbelege unter Daten
werden gesichert. Export-`.fn-export.tmp` und Rückweg im gewählten Ziel sind begründete atomare Dateiswap-
Stagingdateien auf demselben Volume, keine fremde allgemein zu leerende Tempablage.

### 10.8 Drei Bedien-/Layoutmatrizen

Datierter Zwischenstand der ersten Auditaufnahme. Spätere Korrekturen und gezielte native Abnahmen
unter 10.17–10.32 ergänzen diese Tabellen; deren frühere Offen-Spalten sind keine erneut auszuführende
aktuelle Aufgabenliste. Insbesondere Artassistent heute vier sichtbare Schritte, Accessibilitykorrekturen
unter 10.20 und neue eigene Lightroom-Schreib-/Rücknahme-/Exportfälle unter 10.30–10.32 beachten.

**Lightroom – Quelle/echte Lua-Simulation und tatsächliches Windows-SDK getrennt:**

| Fenster / Wege | Ausgeführter Nachweis | Offene Grenze |
| --- | --- | --- |
| Plug-in-Info/Registrierung | .23 am 8. Oktober; .24 am 9. Oktober nach Reload im Lightroom-Statusfeld, korrekter D:-Pfad, matching CoL/Master/Paket und 273.476 Taxa sichtbar | Version im eigenen Infofeld allein wäre kein Ladungsbeleg; Statusfeld jetzt separat geprüft |
| Hauptmenü, Ort/Zeit, Weitere Aktionen | alle nativen Seiten geöffnet; 330-Pixel-Karten, bündige Kurztexte, sechs Hauptwege, Zurück/Schließen ohne Fotoaktion | keine Ausführung der Katalog-/Entfernungsaktionen zur Sichtprüfung |
| Zuweisung/Namen/Recents | echte Lua-Steuerung: 960/940-Spalten, gleiche Ränder, V7, keine implizite Artauswahl, gemeinsame Status-/Tooltippfläche, vier Namensaktionen; am 10. Oktober native kleine Zuweisungsrunde und reguläre Papageientaucher-Suche unter 10.17 | vollständige native Namensspeicher-/Recentsmatrix und weitere DPI-Stufen bleiben separat |
| Statistik ohne Index / fertiger Index | Vorher ohne Index nativ geöffnet; .24 mit vier Zeilen korrigiert. Nutzer-Neuaufbau und persistenter Stand 09.10.2026, 14:41 geprüft. Am 10. Oktober eigener Testkatalog ohne aktuellen Index mit vollständig sichtbarem Hinweis und danach passender Vier-Eintrag-Statistik, siehe 10.17 | keine zusätzliche produktive Indexlöschung oder Vollerhebung; größere Pause-/Race-Probe und weitere DPI-Stufen offen |
| Lifelist/Beobachtungen/Artenliste | drei Formate nativ ausgewählt; vollständiger Auswahlhinweis. Sechs eigene tatsächliche CSV-/CSV-/TXT-Dateien für Katalog/Auswahl am 10. Oktober erstellt, strikt UTF-8 dekodiert und inhaltlich gelesen. Gruppierung/CSV/Null-/Scope zusätzlich in echtem Lua-Test | keine Öffnung im nativen Tabellenprogramm; positive Favoritenmatrix separat |
| FN-Aktualisierung, Identitätsprüfung, Nutzungserfassung | echte Lua-Verhaltenstests für Scope, Vorschau, Pause/Retry/Teilwirkung und geschützte IDs; virtuelle Kopie, kleine SDK-Zuweisungs-/Zeit-/Orts-/Rücknahmerunde unter 10.17 | weitere native Katalog-/Identitäts-/Nutzungserfassungs- und Handoffmatrix offen |
| lange Texte, DPI, Tastatur/Hilfe | sichtbare Kurztexte statt Hoverpflicht; native .23-Menüs passen in bestehender Einstellung; Fehler/Deaktivierung funktional geprüft | 125/150/200-%-Matrix, Screenreader und große Statistik-/Identitätsdialoge nicht nativ abgenommen |

**Explorer – gerenderte kleine eigene Umgebung und Module:**

| Fenster / Wege | Nachweis | Offene Grenze |
| --- | --- | --- |
| Haupt-/Detailfenster, Suche/Filter | echte kleine Amsel-Fixture, Lesemodus, Status/Größen/Lizenzinformationen; gemeinsame Formatfunktion | künstliches MP3 ist keine reale Audioabnahme; große DOM-Liste nicht gemessen |
| Schmale Ansicht / vertikaler Seitenfluss | echte 345 × 747-CSS-Ansicht bei DevicePixelRatio 1,13: korrigierte Kopf-/Summaryhöhen, Dokument 4.005 px hoch/332 px breit bei 345 px Viewport, letzte Validierungshinweise durch tatsächliches Scrollen erreichbar; 1.133 × 796 ohne horizontalen Überlauf | Größe 390 × 844 am Browser angefordert, tatsächliche CSS-Maße separat gemessen; Browseroverride danach zurückgesetzt |
| Startangebot und Datenbank-Aktionen | tatsächlicher Dialog zeigt 12 GiB, Fokus „Später“, Enter schließt ohne Start; A-19 danach korrigiert: Browser zeigt Vorschau, Abbrechen ohne Lauf, weitere Aktionen anfangs zu | kein Anbieter-/Paarstart; vollständige Dialog-/Screenreadermatrix offen |
| Artassistent | fünf fachliche Schritte, Abbruch vs Schließen, leere Karte und Folgesound, langlebige Portraitvorbereitung in Verhaltenstests | native Schreib-/Abbruchmatrix mit echtem Desktop noch nicht vollständig |
| Bearbeitung/Portrait/Karte/Sound/Review | Vorschau, Vergleich, Datei-/Pflegefolgen, Token/SHA/Revision und Medienrelease in Verhaltenstests | Explorer-Ende/Reload und Fehlerfälle im eigenen kleinen Bestand ergänzen |
| Datenbanksuche/Namen/Identität | 350-ms-Debounce, mindestens zwei Zeichen, stale Antwort-/Schließschutz, fachliche Auswahl statt Namensheuristik | keine neue produktive Namens-/Identitätsentscheidung |
| Einstellungen/Backup/Wartung | Wirkung/Umfang unter Buttons, absolute lokale Windows-/UNC-Pfade, Close/Escape/Fehler; Backend und echte kleine NAS-/Restoreprobe | kein Speichern persönlicher Pfade oder produktive Bereinigung zur UI-Prüfung |
| Zugänglichkeit | gemeinsame Dialog-/Feedbackbausteine, sichere Backdropgesten, Escape-Sperren, sichtbare Hilfe | P2: QuickConfirm ohne dynamisches aria-labelledby, Formularfehler ohne aria-invalid/describe-Bezug, Listbox ohne vollständige Pfeilnavigation; kein Screenreader-Go |

**Website – vollständig lesende Bestandsaufnahme, gerenderte Stichproben und lokale Korrektur:**

| Seitentyp / Funktion | Nachweis | Offene Grenze |
| --- | --- | --- |
| Home, Wildlife-Navigation, Übersicht | tatsächlich Home → heimische Übersicht → Rebhuhn; alle Sitemapseiten lesend erreichbar, benannte lokale Suche | einzelne CMS-Alttexte/H1/Überschriftpflege und vollständige Tastatur-/Screenreadermatrix |
| Artinfo/Taxonomie/Status/Portrait | Rebhuhn nativ gerendert; lokale Binomenkorrektur „Perdix perdix“, alle vorhandenen Arten im Verhaltenstest | neue Version noch nicht live; sichtbare KI-Herkunft ist eine getrennte Transparenzoption, siehe 10.19 |
| Karte/Audio/Credits | Rebhuhn-Karte lazy geladen, echte 24,571-s-Aufnahme abgespielt/pausiert, Quelle/Lizenz sichtbar; Portrait geladen | nicht sämtliche Anbieter-/fehlenden Soundzustände nativ, keine Lizenzfreigabe vermutet |
| CMS-Galerie/Zoom | echte Live-Galerie geöffnet; dort alte Escape-/Fokusregression belegt. Lokale echte neue JS-Datei: benannter Dialog, Fokus Schließen, Tab bleibt, Escape nur Zoom, Fokus zum Zoomknopf, zweites Escape normal im darunterliegenden Galerieharness | lokales CMS-Harness ist kein neuer Live-CMS-Deploymentnachweis; Touch-Pinch/Android offen |
| Desktop/Mobil | tatsächliche Rebhuhn-Stichprobe bei 390 × 844, lokale Responsive-Vorschau erreichbar | kein Gesamt-Go für alle mobilen Seitentypen/Kontrastzustände |

### 10.9 Automatisierung und notwendige Entscheidungen

Klickzahlen bezeichnen logische Wege/Entscheidungen ab dem sichtbaren Einstieg, keine gemessene universelle
Pixelklickzahl. Sichtbare Vorschau und fachliche Bestätigung sind begründet; keine neue automatische
Veröffentlichung, Löschung oder Wiederholung schreibender Teilschritte.

| Aktion / Auslöser | Heute nötige Entscheidung | Automatik / Schutz / Wiederanlauf / Nutzen |
| --- | --- | --- |
| Versionsangebot beim Start | Jetzt oder Später | nur lesende Versions-/Vorschauprüfung; Später wieder bei neuem Öffnen, kein großer Download ohne Start |
| Datenbank aktualisieren | ein Start plus gebundene Katalogvereinbarung | neue SDK-Erfassung, selbst schließen/warten, Quellen/Master/Paket gemeinsam; gespeicherter Auftrag und klare Konfliktstopps, kein zweiter Start nach Schließen |
| Vergleichsgrundlage | seltener bewusster Aufbau + Bestätigung | nur passende lokale Quellen; Inputs/Revision/Schutz, keine automatische Neuinstallation |
| Pause/Fortsetzen | Pause bzw. bestätigte Fortsetzung | gleicher eigener Checkpoint, frische Eingänge, keine unnötige Quellenwiederholung; A-02 korrigiert Phase vor Wirkung |
| Name/Anbieterstandard | Art/Namenswahl auswählen und speichern | gemeinsame Namensentscheidung ohne Fotozwang; stale/Teilerfolg gleicher Auftrag, erneuter Speicherweg statt zweite Identität |
| Artänderung | Vorschau, belegte Beziehung, fachliche Bestätigung | keine Namensähnlichkeitsautomatik, Revision/Identität/Foto-Scope geschützt |
| Hauptlauf/Unvollständige/Sonderkarte/Sondersound | Modus, Vorschau, Start | Medienentscheidungen bewusst offen; belegter Wiederanlauf/Persistenz, keine zweite Artanlage |
| Medienimport/Pflege/Restore | ausgewählte Art und konkrete Vorschau/Bestätigung | gleiche Token-/SHA-/Revisionsdienste, Original/Backup bei Fehler erhalten, frischer Retry |
| Übertragen | bestehende Publikationsentscheidung | Code-/Datenvorabgrenze, Git/Push/Pages separat; kein Push allein aus Audit-/Namensanzeige |
| Statistik/Export | Neuaufbau bewusst, Exportformat/Scope/Ziel | persistenter Index, markierte Auswahl frisch; Export ohne pauschalen Vollscan, Revision gegen eigenen Änderungsrace |
| NAS-Backup | Vorschau und Start | Inhaltsvergleich, Vollrücklesen, geschützter Kontrollstand vor Rotation; unveränderten Inhalt nicht neu vollkopieren |
| Backup-Pfad | lokales Speichern | keine Änderung beim Öffnen, Rückkehr zu Standard explizit, absolute Pfade |
| Speicherpflege | frische Vorschau, genaue Löschbestätigung | transitive Job-/Paar-/Recovery-Schutzmenge, Revision vor Wirkung; A-04 verhindert falsche Entbindung |
| Temp-Ende | keine zusätzliche Bedienung für eigene entbehrliche Reste | eigener Besitzer/Operation/Helfer beendet; fremde/aktive/Review-/Restartdaten bleiben; Plug-in-Reload ist kein pauschaler LR-Schließbeweis |

Reproduzierter P2-Fehler im vorherigen Stand: Backup-/Pipeline-Poll endete nach einem Lesefehler. Das bloße
Wiederöffnen des Statusdialogs zeigte den gespeicherten Snapshot und las nicht erneut; erst App-Neuladen
oder ein anderweitiger Refresh belebte die Abfrage. Am 10. Oktober anhand beider Workflowmodule bestätigt.
A-26 unter 10.16 lokal korrigiert: begrenzter lesender Backoff mit sichtbarer Aktualitätsgrenze, kein
Start-/Schreib- oder Abschlusswirkungsretry. Passende Gegenproben und neues Gesamtgate bestanden.

### 10.10 Sicherheit, Laufzeit und Drittanbieter

Lokale Server binden Loopback, schreibende API braucht erlaubte Herkunft und 32-Byte-Sitzungstoken.
Electron nutzt `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, empfangsseitig begrenztes
Preload, verweigerte externe In-App-Navigation. Tatsächlich erreichte externe Linkwege waren HTTP(S);
kein produktiv erreichbarer eigener Protokollhandler gefunden. A-01/A-09/A-11/A-12/A-16/A-17 schließen
konkret reproduzierte Datenverlust-, Medien-, Netz- und Pfadklassen. Restgrenzen: DNS-Prüfung ist nicht an
die spätere Socket-IP gepinnt, lokale `lstat → open`-Prüfung nicht atomar gegen parallelen Pfadtausch.
Keinen tatsächlichen produktiven Angriff daraus behaupten; spätere gezielte Härtung separat.

Abhängigkeiten nach primären Advisories geprüft und eng aktualisiert:

| Komponente | Tatsächlicher Stand / Nachweis | Entscheidung / Grenze |
| --- | --- | --- |
| Electron | installiert 42.10.0, vorher 42.7.0, vier gemeldete Electron-CVEs korrigiert; Registryintegrität und gleiche Major-/Enginegrenze | Version-/Desktop-/HTTP-/Medien-/Lua-Gruppe 63/63; kein ungeprüfter Majorwechsel |
| npm Undici | 7.29.1 statt 7.28.0, optional via Electron-Installationshelfer, 15 Advisorybereiche primär verifiziert | 0 High/0 Critical im npm-Baum, nicht Aussage über alle eingebauten Laufzeitkomponenten |
| Fengari/sprintf-js | Fengari 0.1.5, sprintf-js 1.1.3, zwei Moderate-Knoten derselben ungepatchten Formatstring-DoS-Ursache | nur Lua-Tests mit Repo-Skripten/Fixtures, kein Explorer-/Pages-Bestand; kein passender Patch verfügbar |
| eingebauter Node/Undici | Electron: Node 24.18.1/Undici 7.29.0/Chromium 148.0.7778.280; allgemeiner Node 24.12.0/Undici 7.16.0 unverändert | npm-Patch ersetzt Built-ins nicht; betroffene Cache-/Retry-/BalancedPool-/WebSocket-/decompress-Interceptorwege im Projekt nicht gefunden, keine globale Nodeinstallation vorgenommen |

Primärbelege: [Electron Preload-Cache](https://github.com/electron/electron/security/advisories/GHSA-qmv3-fv6v-rmhq),
[Sandbox/Kindfenster](https://github.com/electron/electron/security/advisories/GHSA-gr2m-v5gq-v685),
[Protokollhandler](https://github.com/electron/electron/security/advisories/GHSA-j84w-jfhq-vhvj),
[Webview/Worker](https://github.com/electron/electron/security/advisories/GHSA-9qh4-3jw8-366w),
[Undici Cache](https://github.com/nodejs/undici/security/advisories/GHSA-4cwx-7wf7-3272),
[WebSocket](https://github.com/nodejs/undici/security/advisories/GHSA-rfgv-xxqx-mfg5),
[BalancedPool/TLS](https://github.com/nodejs/undici/security/advisories/GHSA-w293-vg96-wgc3),
[decompress-Interceptor](https://github.com/nodejs/undici/security/advisories/GHSA-3xpg-4rpp-hhhm),
[sprintf-js](https://github.com/advisories/GHSA-hp3w-g68c-fv3c).
Der Dekompressionsbefund betrifft ausdrücklich den Interceptor; gewöhnliches `fetch` nicht ohne diesen
Trigger als betroffen behaupten. Fremde künstliche Throwwerte ohne belegten Erzeuger sind keine
reproduzierte heutige Betriebsregression und rechtfertigen keinen pauschalen Routerumbau.

### 10.11 Vollständiger Website-/GitHub-Bereich

Ein vollständiger Sitemaplauf am 8. Oktober: **134/134 HTML-Seiten HTTP 200**, keine Abruffehler,
alle mit Titel und Meta-Beschreibung; fünf zusätzliche interne Pfade erreichbar/korrekt weitergeleitet.
60 von 61 Projekt-Slugs in der Live-Sitemap, keine doppelten Art-Slugs. Erwarteter
[Löwe-Pfad](https://www.fnwildlifetravel.de/wildlife/afrika/pantheraleo) HTTP 404. Felix erklärt am 10. Oktober,
dass Löwe eine frühere Testart ohne beabsichtigte Website-Seite ist. Frische Dateiprüfung findet die Art
weiterhin in Eingabeliste, erzeugten Daten, Report/Assessmentzuordnung und sechs Assets. Daher keine fehlende
CMS-Artseite als Pflichtfehler; verbliebener Testbestand und gewünschter Projektumfang getrennt unter 10.19.
Existenz einer verborgenen/unveröffentlichten Seite ohne Administration unbekannt. Vollständige Erreichbarkeit
ist kein vollständiger Inhalt-/Interaktions-/Screenreadernachweis jeder Seite.

Zehn tatsächlich geladene Projektmodule HTTP 200, zum unveränderten Ausgangsstand bytegleich,
Portrait zuletzt in korrekter Reihenfolge. Live Taxonomie/Suche/Zoom 1.0.8/1.0.2/1.0.7; lokal neue
1.0.9/1.0.3/1.0.8 im Footer vorbereitet. Neues CSS nicht erforderlich. Bestehende URLs und
`graphics/catagory/Alternativ/` bleiben gebundene Livepfade. Kein Cacheversionswechsel bereits live behauptet.

[W3C Nu](https://validator.w3.org/nu/) an drei Live-Seiten, vorhandene Ausgaben am 9. Oktober korrekt getrennt:
Home 435 Fehler/36 Warnungen/32 andere Infos; Übersicht 325/19/25; Amsel 428/35/25. Vorwiegend
Squarespace-/Fluid-Markup, doppelte IDs/ALT und Verschachtelungen. Kein Roh-HTML-Fehler einem Projekt-
Modulziel zugeordnet; dynamisches DOM damit nicht pauschal gültig. Lokale Taxonomie/Footer 0 Fehler/0 Warnungen,
Vorschau nach zwei echten Markupkorrekturen 0 Fehler/1 H1-in-Section-Warnung. Keine gesamte Website als
W3C-fehlerfrei ausgeben. Beobachtete CMS-Alttexte Otter/Hasen/Papagei sind konkrete Pflegepunkte;
ohne Bildvergleich keine falsche Fotodarstellung behaupten.

Herkunft/Lizenz: drei bewusst fehlende Soundfälle und zwölf NC-Sounds im geprüften Stand. Quellen-/Lizenz-
URLs in Credits, teils ND. Kommerzielle Berechtigung/Bearbeitung daraus nicht vollständig beweisbar;
keine pauschale Rechtsverletzung behauptet. [CC NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/)
und [NC-ND](https://creativecommons.org/licenses/by-nc-nd/4.0/) primär geprüft. IUCN-Nutzungsbedingungen
beim lesenden Abruf 403, nicht umgangen. Die bei der ersten Aufnahme unklare Blaukehlchen-Kartenherkunft
ist am 10. Oktober von Felix als manueller Ausschnitt aus der IUCN-Assessment-PDF erklärt; Dokumentation
korrigiert, kein Bildvergleich mit der konkreten PDF behauptet. Die Angabe IUCN ist damit durch seine
Rückmeldung plausibel. ChatGPT-/Promptbelege in Portraitmetadaten, sichtbarer KI-Herkunftshinweis fehlt;
seine Einordnung als pauschaler Pflichtbefund ist zurückgenommen, getrennte Transparenzoption unter 10.19.
Felix berichtet keine verfügbaren offen lizenzierten Soundalternativen in ausreichender Qualität; keine
neue Suche, Entfernung oder Lizenzfreigabe daraus ableiten. Bestehende Lizenzhinweise erhalten.

Frischer Remote-/API-Beleg des freigegebenen Vorbereitungsstands: HEAD/Remote `d233bba…` identisch,
Run **37686572550** erfolgreich, Deployment **6920894570** am 7. Oktober 21:06:39 UTC erfolgreich.
Tatsächliches Artefakt ZIP 110.318.382 B, SHA-256 identisch API-Digest
`88cfbb84415bdbeca5acb70a1be75d6762ced88b42ad9d4869ee21690652db42`;
**396/396 erlaubte Dateien**, keine fehlenden/zusätzlichen Dateien oder Links. 136 Textdateien auf konkrete
private Pfad-/Credentialmuster geprüft, keine Treffer; keine Garantie gegen jede denkbare Geheimnisform.
Eigener echter Bau aus vollständiger eigener Quellenkopie: 396 Dateien/107,4 MiB, Budget 164,5 MiB,
895 ms ohne Kopierzeit, Artefaktvalidator erfolgreich. Laufzeitdaten/SQLite/Kataloge/Temp/Tests/PSD nicht im
Artefakt. Öffentlich beabsichtigte Portraitprompts und Originalbasenames sind weiterhin öffentlich.

GitHub öffentlich, Default `main`, beobachtet nur main mit `protected: false`, Rulesets/Releases/Tags leer.
Pages-Environment erlaubt genau main, `can_admins_bypass: true`, keine Reviewerregel im zugänglichen Payload.
Kein pauschales Security-Go: detaillierte Branchprotection 403, Actions-Settings 401/nicht unterstützter
Connector; Secrets, Collaborators und globale Retention-/Security-Administration nicht zugänglich.
Unauthentifiziertes Pages-404 wurde nicht als deaktiviertes Pages interpretiert.
[Deploymentstatus](https://api.github.com/repos/felixkfm90/iucn-species-data/deployments/6920894570/statuses),
[Branchpolicy](https://api.github.com/repos/felixkfm90/iucn-species-data/environments/github-pages/deployment-branch-policies).

Workflow: main-Push/manueller Start, Quality → kontrollierter Build → Deploy, Concurrency pages mit
`cancel-in-progress: false`, begrenzte Joblaufzeiten, keine PR-Ausführung fremden Checkouts oder fremde
Inline-Eingaben. Standard-GITHUB_TOKEN/OIDC statt ausgegebener Zugangsdaten; keine expliziten Secrets.
FFmpeg im Linux-Qualityjob neu ausdrücklich installiert. A-20 begrenzt Jobrechte nach
[configure-pages v5](https://github.com/actions/configure-pages/blob/v5/src/api-client.js) und
[Pages-RESTvertrag](https://docs.github.com/en/rest/pages/pages#get-a-github-pages-site).
Beim ersten lesenden Workflowaudit verwendeten die Actions bewegliche Versionstags. P3 ist am
10. Oktober lokal durch volle offizielle Commit-SHAs bei denselben Majorständen umgesetzt; Quellen,
Updateweg, indirekte Abhängigkeit und getrennte Prüfgrenzen unter 10.18. Kein neuer Deploymentnachweis.
Artefaktretention beobachtet ungefähr ein Tag, passend zum offiziellen upload-pages-artifact-v3-Default;
globale Logretention unbekannt. Zweiter generierter Workfloweintrag beweist keine parallelen aktuellen Trigger.
Neuer Auditdiff **nicht veröffentlicht**; Ausgangsdeployment ist kein Linux-/Deploymentnachweis der Korrekturen.

### 10.12 Architektur, Doku und kommende Erweiterungen

Kein belegter Bedarf für Frameworkwechsel oder Komplettumbau. Explorer-Kompositionswurzeln verdrahten
Services und 39 globale Fabrik-/Fachmodule in dokumentierter HTML-Reihenfolge. Pfade über zentralen Resolver,
Businesszustände über Services/gebundene Aufträge, Darstellung über gemeinsame Dialog-/Präsentations-/
Feedbackkerne; neue Regeln nicht zusätzlich im UI pflegen. Decoder/Header entkoppelt für Websitegate und
Explorerimport; Auswahlguard/Statistikrevision gemeinsam im Plug-in. Zusätzliche Absicherung ist an konkrete
Defekte gebunden. Öffentliche Website-Rootpfade/Designgrafiken nicht nur aus Stilgründen umsortieren.

AGENTS von 2.252 auf 62 Zeilen, README von 1.950 auf 131 Zeilen im neuen Arbeitsstand verdichtet;
vollständige frühere Texte unverändert in Ausgangscommit d233bba. Keine neue Audit-/Übergabe-/Manifestdatei.
Docsübersicht trennt führende Verträge und historische Belege; Roadmap datierte abgeschlossene Serien
historisch, aktuelles Gesamtaudit am Anfang. Temp-, Medien-, Restore-/Versionsregeln vereinheitlicht;
Projektstatus bleibt allein generiert. Kleine Dokumentgröße ist kein versprochener Datenbank-Platzgewinn.

| Spätere Erweiterung / Bedarf | Modulgrenze / Kompatibilität und Migration | Schutz / Abnahmekriterium / Phase |
| --- | --- | --- |
| Datenordner auswählbar/portabel | bestehender Resolver und journalisierte Migration, alle Verbraucher/Zeiger/Backuphistorie gemeinsam | isolierter Pfadwechsel, Teilfehler/Retry/Rückweg, Originalbelege bytegleich; eigene spätere Freigabe |
| weitere Kataloge/Geräte | eindeutige Geräte-/Katalogbindung statt Pfadkopie still als gleiche Nutzung; vorhandene Registry/SDK-Pässe erweitern | neue explizite Registrymitglieder, frische vollständige Nutzung, konkurrierende Sperren; native Clone/virtuelle Kopie vorher messen |
| zusätzliche Ränge/Sprachen/Quellen | TaxonomyRanks/Schema/Paketprojektion/Regelversion, vorhandene Providergrenzen | IDs/Herkunft/eigene Entscheidungen erhalten, Batch-/Exportvertrag+Schema-/Restoremigration; erst konkreter Fachauftrag |
| große Listen/LR-Indizes | Filter heute schnell, DOM ungefenstert; LR-JSONindex hält Gesamtsnapshots trotz 500er-Batches | erst native RAM/DOM-Profilmessung, dann ggf revisions-/kataloggebundener lokaler Index oder Windowing mit Migration; kein vorsorglicher zweiter Datenbestand |
| neue Pflege/Exporte | bestehende Token-/SHA-/Revision-/Dateiswapservices, Dialog-/Feedbackkern | Scope, Stale-/Retry-/Teilwirkung, Unicode/CSV/Originalschutz und Rücknahme nachweisen |
| Diagnose/Telemetrie | reduzierte lokale Zeiten/Counts statt private Foto-/GPS-/UUID-/Namensdaten | verständliche Zustimmung bei externer Übertragung, kontrollierte Aufbewahrung; heute keine neue Telemetrie |

Weitere Performancebelege: synthetischer Filter 100/1.000/10.000 Zeilen, sieben warme Wiederholungen,
50/500/5.000 gleiche Treffer, Median 0,059/0,285/2,488 ms, Max 0,115/0,372/2,999 ms. Das misst Filterlogik,
kein DOMrendering oder native Großkatalogaktion. Öffentliches Mediengate 61 Arten/317 Medien: kalt 9,698 s,
warm 0,210 s bei identischen Bytes; neuer begrenzter Inhalts-/Decodercache, keine DB-Suche. CI-Artefaktbau
oben, LR-259er-Verhaltensgruppe 28,57 s: Testdauer, keine gemessene SDK-Kataloglaufzeit.
Große native RAM-/I/O-/Katalog-/Website-Interaktionsreihen sind noch nicht vollständig gemessen;
keine unbelegte Optimierungsprognose.

### 10.13 Mindestmatrix und Nachweisstufen

Zwischenstand vor den späteren Reparatur-/Abnahmerunden; für aktuelle Ergebnisse und Grenzen zuletzt
10.32 heranziehen. Frühere gezielte Testzahlen bleiben historische Nachweise und werden nicht addiert.

| Risikogruppe | Ausgeführte Gegenprobe / Ergebnis | Was damit nicht behauptet wird |
| --- | --- | --- |
| Quellen-/Masterdrift, gebundener Neustart, Paketfehler | Koordinator-/Master-/Paar-/Klassifikationsgruppe 184/184, echte Hilfsprozesse, Stale-/Retry-/Fremdänderungsfälle | kein neuer produktiver Update-/Millionenlauf |
| inkrementell/Vollaufbau, offene Leser, harter Workerabbruch | eigener 1.200er-Betriebslauf, Checkpoint 500, 1.170 wiederverwendet, gleiches Paket/IDs/Name/Rücknahme | kein Großbestandsbenchmark |
| fehlende/alte Nutzungsbelege, Pause/Race/Indexfehler | echte Lua-/Katalogproperty-/Koordinatortests, bisheriger Index/Paar geschützt | vollständige Nutzung des heute geöffneten Hauptkatalogs nicht neu erfasst |
| Auswahl/Entfernung/Keywords/CSV | echte Lua-SDK-Simulation, leere/Einzel-/Mehrfachauswahl, Objektduplikate, Formelinhalte, Revision nach Yield/Reload; zusätzlich kleine freigegebene native Runde mit virtueller Kopie und sechs echten Exporten unter 10.17 | Simulation ersetzt keine native Abnahme; kleine Runde ist keine vollständige Favoriten-/Großbestands-/Pause-/Race-Matrix |
| Artauftrag/Medien/Abort/Publication | 135/135 in 15 Dateien: echte Temp-Git-Fixtures, Pushfehler/Retry ohne zweiten Commit, Crash nach Push vor ACK, Pagesfehler, alte Tokens/gleicher Slug, eigene Rücknahme/Fremderhalt/Workerende | nicht jeder harte Prozessabbruch/Diskfull/ACL-Zeitpunkt oder neue native Gesamtanlage ausgeführt |
| beschädigte/gesperrte/überlange Medien | echte FFmpeg-/HTTP-/PowerShellproben, falscher Header, Zeit-/Pixel-/Ausgabelimit, Inputänderung, Cancel/Retry/Originalerhalt | kein Anbieter-403 umgangen oder fehlende Karte als Download bezeichnet |
| NAS/Restore/Pfadwechsel | tatsächliches kleines Archiv voll rückgelesen und an neuem Pfad geöffnet, vorheriges Paar/Namen/IDs/Medien gleich | kein 100-GB-Produktivrestore/ausreichender Platz garantiert |
| Dateien/HTTP/Sicherheitsgrenzen | echtes Junction-/ReadStream-/Pages-CLI-Verhalten, GET/HEAD/Range, Fremdtemp geschützt | keine atomare lokale Dateisystem-/DNS-Isolation bewiesen |
| Layout/Versions-/Startrollen | native Menüs/Index-/Exportwahl, lokale gerenderte Suche/Binomen/Zoom/Enter, Controller-/UIgruppen | keine vollständige DPI-/Screenreader-/Touchmatrix |
| Windows/Linux/GitHub | Windowsgezielte echte Helferproben; tatsächliches Ausgangsartefakt/-deployment und kontrollierter eigener Bau | Linux/Pages der neuen Korrekturen erst mit freigegebener Veröffentlichung |

Gezielte Testzahlen überschneiden sich und werden nicht addiert. Das vollständige lokale Gesamtgate ist
mit konkretem Endstand unter 10.15 bestanden; Grün allein erfüllt die offenen nativen/zugriffsabhängigen Nachweise nicht.

### 10.14 Priorisierte Restaufträge und jetzige Freigabegrenze

Die folgende Liste beschreibt den damaligen Stand vor den Reparatur- und Abnahmerunden vom 11. bis
14. Oktober. Der aktuelle Vorrang und die Grenze zur weiteren Auditbearbeitung stehen unter 10.29;
die späteren konkreten Abschlussnachweise ersetzen keine pauschale Gesamtfreigabe.

| Priorität / Auftrag | Konkretes Abnahmekriterium / Entscheidung |
| --- | --- |
| P0/P1 lokale Korrekturen integrieren – abgeschlossen | sämtliche Registerkorrekturen gegengelesen, vollständiges quality:ci nach finalem Code bestanden, keine Schutzlockerung; Nachweise unter 10.15 und 10.16 |
| P1 native SDK-Schreibregressionen – kleine freigegebene Runde abgeschlossen | Eigener Testkatalog mit drei künstlichen JPEGs und virtueller Kopie: Einzel/Mehrfach/keine Auswahl, Taxonomie, positive und fehlende Zeit-/Ortswerte, getrennte Rücknahmen, manuelles Stichwort, Kontrollfoto, Statistik und sechs tatsächliche Exporte belegt. Ursprüngliches Plug-in und Hauptkatalog zurückgestellt; Papageientaucher-Suche dort lesend bestätigt. Quellen-/Exportbeleg und genaue Grenzen unter 10.17. Native positive Favoritenmatrix, größere Pause-/Race-Probe, interne SDK-Revisionsrücklesung und Explorer-Handoff bleiben separat. |
| P2 verbleibende Sicht-/Hilfematrix | .24-Ladung, Statistik, Exportauswahl, Anzeige ohne aktuellen Index und beide vollständigen Hinweistexte sowie A-19-Vorschau/Abbrechen nativ bzw. im echten lokalen Browser belegt. Weitere DPI-Stufen und vollständige Hilfematrix bleiben offen; kein produktiver Index allein zur Sichtprüfung gelöscht. |
| P2 CMS/Herkunft/Lizenzen | schlechte Galerie-Alttexte und Überschriften bearbeiten; Löwe als frühere Testart mit verbleibenden Projekteinträgen einordnen. Blaukehlchen-PDF-Herkunft nutzerbestätigt und dokumentiert, konkreter PDF-Vergleich nicht ausgeführt. Sichtbare KI-Kennzeichnung bei den konkret angesehenen erkennbaren Illustrationen als Transparenzoption; bedingte Deepfake-/Offenlegungspflicht getrennt prüfen, keine globale Freistellung. Für NC-Sounds laut Felix keine geeigneten offenen Alternativen; Lizenzhinweise erhalten, keine automatische Entfernung oder kommerzielle Freigabe. Einzelheiten unter 10.19. |
| P2 GitHub-Verwaltung | zugängliche Adminansicht zu Protection/Token-/Secret-/Retentionrechten lesen; konkrete gewünschte Schutzregeln entscheiden, keine Rechte still erweitern |
| P2 Zugänglichkeit/Skalierung/Leistung | DPI-/lange-Namen-/Screenreader-/Touch-/Großindexmatrix gezielt an kleinen sicheren Zuständen, bei gemessenem Engpass erst Optimierung |
| P2 lesender Statusretry – lokal abgeschlossen | A-26: 53/53 passende Verhaltenfälle und unabhängiges Go, vollständiges quality:ci 1.402/1.402 unter 10.16. Begrenzter Backoff und eindeutige Dialogbindung; keine native produktive Abnahme oder zusätzliche Anfrage-Gesamtfrist. |
| P2 Sicherungsstände auswählen – umgesetzt und isoliert abgenommen | A-27: bestätigte datierte Auswahl je Art mit Vorschau und frischer Bestandsbindung, dazu NAS-Archivübersicht mit Umfang/Prüfstatus und getrenntem manuellem Restore. Echte Browserabnahme und gezielte Gegenproben unter 10.16; finales Gesamtgate nach letzter Sperrkorrektur getrennt. Vollautomatischer NAS-Restore bleibt größerer eigener Betriebsweg. Master/CoL und Medien behalten den vereinbarten einzelnen Vorgänger; kein zusätzlicher Großstand allein für Auswahl. |
| P3 Actions-Härtung – lokal umgesetzt | sieben direkte Referenzen auf fünf frisch geprüfte offizielle Commit-SHAs festgelegt; dieselben Majorstände und dokumentierter Updateweg. Vergleich und gezielte Nachprüfung unter 10.18. Indirektes upload-artifact@v4 und externer Runner bleiben eigene Grenzen; kein neuer Linux-/Pages-Lauf. |
| spätere Bereinigung | genau ein frischer revisionsgebundener Plan nach Verbraucher-/Inputprüfung, konkrete Ziele/Bytes/Rückweg, anschließende Freigabe; aktuell keine gültige Löschmenge |
| Veröffentlichung | konkrete erfolgreich geprüfte lokale Serie separat freigeben, Commit/Push und neuen Linux-/Pages-/Squarespacezustand nachweisen |

**Noch kein Gesamt-Go.** Sichere lokale Korrekturserien und isolierter Restore sind belegt. Die offenen
native SDK-/Skalierungs-/Zugriffsgrenzen sind weder durch Simulation noch durch alte Nutzerabnahmen
automatisch geschlossen. Kein neuer produktiver Download, Aufbau, Katalogeingriff, Cleanup oder Push
durch Agenten. Felix' eigener Statistik-Neuaufbau ist separat als Nutzeraktion dokumentiert.
Der bisherige Restpunkt zum Erhalt der historischen 46 manuellen Felder ist durch den einmaligen
gebundenen Vergleich in 10.6 abgeschlossen; keine erneute globale Zählung daraus ableiten.

### 10.15 Integrierter Prüfabschluss

Erster vollständiger lokaler Gateversuch am 9. Oktober: **Exit 1**, wegen A-21 im eigenen Testteardown.
Rohlog: `temp/explorer/96fd988a-1cd5-4d07-af6b-ab78962f68d8/quality-ci.log` in gebundener dauerhafter
Audit-Tempsitzung. Vorab Syntax 397 JS/MJS, Style und lokale Verweise in 80 Markdown-Dateien bestanden;
die davor durchlaufenen Testgruppen bestanden. Nicht erreichte Endprüfungen werden nicht als bestanden gezählt.
Nach A-21: test:temp 57/57, Rootreview Go. A-23 anschließend final integriert und unabhängig
gegengelesen; neuer vollständiger Gesamtlauf erreicht alle 50 Testgruppen, aber Exit 1 durch A-24:
1.370/1.371 gemeldete Tests, keine Abbrüche/Skips. Rohlog:
`temp/explorer/4ac2da4b-de45-48f0-a82d-4d8886837ce7/quality-ci.log`, gebunden und dauerhaft.
Nach dem engen A-24-Abgleich endet der folgende vollständige Versuch wiederum Exit 1, diesmal
wegen A-25: 714/715 Tests in neun erreichten Gruppen, Masterblock 475/476; übrige Gruppen/Endprüfungen
nicht erreicht. Rohlog: `temp/explorer/744e02ee-d43e-4caf-b251-703e1cbb142d/quality-ci.log`.
A-25 ist ein weiterer eigener Testteardown mit sporadischem ENOTEMPTY: nur
taxonomy-animalia-fallback.test.mjs erhält acht begrenzte Wiederholungen/80-ms-Basis im bestehenden
Fixture-after-Hook. Alle Writes/Imports/Leser einschließlich atomarer Tempdatei-Rückbauten abgewartet;
konkreter externer Handle-Verursacher nicht belegt. Kein Kern-/Schutzcode geändert, keine neue Testsuite.
Passende native drei Fälle 3/3, 36,55 ms, ohne Fehler/Abbrüche/Skips; unabhängiges Root-Diffreview Go.
Vierter vollständiger Versuch nach finalem A-25-Abgleich: **Exit 0**, abgeschlossen am 9. Oktober
2026 um 17:49:38 UTC. Dauerhaftes Rohlog:
`temp/explorer/a44b71ee-102f-49f0-8dff-95066c9d8f85/quality-ci.log`.
**50/50 Testgruppen, 1.371/1.371 gemeldete Tests, null Fehler, Abbrüche und Skips.** Summe der
50 gemeldeten Gruppentestdauern 681.360,4251 ms (rund 11 min 21 s), keine behauptete Gesamt-Wanduhrzeit.
Syntax 397 JS/MJS, Style, Verweise in 80 Markdown-Dateien und sechs zentrale JSON-Schemabestände bestanden.
Auch sämtliche nachfolgenden Gateabschnitte erreicht und bestanden: Audio-Check, tatsächliches
Mediengate 61 Arten/317 Medien ohne Fehler, Größenbudget 113,9 MiB von 172,5 MiB, Projektkonsistenz,
generierter Projektstatus und lokale Websiteprüfung mit ausdrücklich `--skip-live --skip-pages`.
Die drei bekannten fehlenden Sounds sind dokumentierte Pflegepunkte, keine neu entstandenen Medienfehler.
Live-/Pages-Nachweise der neuen Korrekturen werden aus diesem lokalen Gate nicht abgeleitet.

Native .24-Ladung und Datenstandsübereinstimmung bestätigt. Felix startet selbst einen Statistik-Neuaufbau,
meldet ihn zunächst laufend und danach das offene Statistikfenster zur Kontrolle. Im neuen Durchlauf war
die Windows-Steuerung wieder verfügbar. Unabhängige native Kontrolle:
persistenter Katalogindex **09.10.2026, 14:41**, Lifelist **56 Arten**, **128.309 Katalogfotos**, **5.249 mit
Taxonomie**, **123.060 ohne**, Abdeckung **4,1 %**. Qualitätsgruppen: **5.237 mit Zeit**, **1.415 mit Ort**,
davon **1.413 mit beidem**, **3.824 nur Zeit**, **2 nur Ort**, **10 ohne beides**. Angezeigte Summen passen:
5.249 + 123.060 = 128.309 und 1.413 + 3.824 + 2 + 10 = 5.249; Klassen 4.719 + 424 + 87 + 10 + 9 = 5.249.
Diese Werte sind frisch gelesene native Anzeige, keine erneute Erhebung sämtlicher Foto-IDs/Metadaten.

Statistikfenster 1.067 × 1.199 logische Pixel vollständig sichtbar in aktueller Einstellung; Gruppen,
Stand, Hilfe und untere Schaltflächen ohne sichtbaren Clip. Exportdialog 781 × 335: Default Lifelist CSV
und gesamter gespeicherter Katalogindex, korrigierter Hinweis über markierte Fotos vollständig zweizeilig
sichtbar. Abbrechen kehrt zum unveränderten Statistikfenster zurück; keine Exportdatei erstellt. Anzeige
ohne Index nach dem erfolgreichen Nutzer-Neuaufbau nicht erneut geöffnet; durch Agenten kein Index
gelöscht oder zusätzlich zur Sichtprüfung aufgebaut. Native SDK-Schreibregressionen und andere DPI-Stufen
bleiben getrennte Restgrenzen.

**Historische Vorbereitung am 9. Oktober, vor der später erteilten Testkatalogfreigabe:** Die kleine
native Schreibabnahme ist zu diesem Zeitpunkt vollständig vorbereitet, noch ohne Lightroom-Aktivierung.
Die damaligen Aussagen zu fehlendem Katalog, ausstehender Freigabe und unterlassenen nativen Aktionen
gelten für diesen Vorbereitungszeitpunkt; die ausgeführte Runde und der Rückweg folgen unter 10.17.
Neue eigene Sitzung:
`temp/explorer/2c80e3ae-4b7c-48da-889c-cbc1b7c45327/`. Darin `sdk-program` als physische Positivlistenkopie
von **75 MJS und 47 Lua-Dateien, 122 Dateien/1.039.379 Bytes**. Alle kopierten Quellbytes einzeln vor/nach
gegen den geprüften Arbeitsstand SHA-256-gleich; keine produktiven Daten, Prefs, Journale, .env oder Links
übernommen. Eigene minimale ready-Konfiguration mit dataRoot Daten, eigener leerer Namenskorrekturstand.
Die vorhandenen kleinen Bauhilfen aus lightroom-search-package.test.mjs als eigene Tempdatei nachgebildet,
das Testmodul nicht importiert. Beide künstlichen IDs mit bestehendem Kern als mtx_ plus 32 Hexzeichen
erzeugt und durchgehend ersetzt. Tatsächlicher unveränderter publishTaxonomyPair-Kern prüft Kandidat,
ID-Erhalt, Suchpaket und Prüfsummen und bindet nur das eigene künstliche Paar. CoL fixture ist eine
synthetische Versionsbezeichnung, kein heruntergeladener Anbieterbestand.

Anschließend eigenes Paket wirklich geprüft, Helperstatus current mit **zwei Taxa**, beide Namenssuchen
und beide Taxondetails erfolgreich; Leser geschlossen. Produktive storage-path.json und aktiver Paarpointer
vor/nach SHA-256 und Dateimetadaten identisch. Nur diese kleinen produktiven Bindungen kontrolliert;
kein produktiver SQLite-/Vollprüfsummenscan. Dauerhafte Rohbelege in dieser Sitzung:
`prepare-native-fixture.mjs` und `native-preparation.json`; keine zweite Audit-Anweisung.
Unabhängiges Taxonomiereview prüft Skript, JSON, Eigentumsmanifest und kleine Release-Manifeste:
Dateivorbereitung Go, keine Prüfkerne ersetzt oder Tests importiert. Quellen-/Produktiv-SHA-Vergleiche
von diesem Reviewer anhand des aufgezeichneten Belegs gegengelesen, nicht erneut ausgeführt.
Unabhängiges Art-/Betriebsreview bestätigt zusätzlich 122/122 Quell-/Kopie-SHA-256, Bildhashes und
fehlende Links an acht Wurzel-/Vorfahrenbindungen. Vollständige eigene Vorbereitungssitzung nach
Abschluss: **140 Dateien/1.509.748 logische Bytes, null Links**; geschlossen, null Operationen/Helper.

Drei eigene JPEGs per FFmpeg erzeugt und tatsächlich dekodiert: **3 × 239 Bytes, zusammen 717 Bytes**.
Originalbeleg in `temp/explorer/74e3e4c3-b303-4e8f-806e-aa0aadb6f25e/native-image-preparation.json`,
SHA-gleich nach der neuen Sitzung/photos kopiert. Die Bilder enthalten noch keine definierten Aufnahmezeit-/
IPTC-Ortswerte. Positive Ort-/Zeitfälle benötigen erst später ausdrücklich gesetzte Lightroom-Quelldaten
an den künstlichen Testfotos; ein Bild bleibt unmarkierte Kontrolle. Eigener Katalog-/Exportordner bereit,
geplanter Katalog ausschließlich `temp/explorer/2c80e3ae-4b7c-48da-889c-cbc1b7c45327/catalog/FN-Audit.lrcat`;
**noch kein nativer Katalog angelegt oder geöffnet, keine Foto-/Katalogschreibaktion und kein Export**.
Geplante positive Fälle ausschließlich im Testkatalog: Foto 1 Aufnahmezeit 15.01.2024, 11:22:33 ohne
zusätzlich gesetzten Ort; Foto 2 Aufnahmezeit 03.02.2024, 11:22:33, Deutschland/DE, Baden-Württemberg,
Stuttgart/Audit-Testplatz ohne GPS. Nur künstliche Quelldaten, anschließend FN-Ergebnis und Stichwörter
zurücklesen. Kontrollfoto nicht auswählen oder beschreiben; seine tatsächlichen SDK-Quelldaten vorher
lesen, statt aus fehlenden EXIF-Segmenten ungeprüft fehlende Lightroom-Werte zu folgern.

Beide Fachagenten grenzen den kleineren Aktivierungsweg im heutigen Profil gegenüber einem neuen
Windows-Profil ab: ein separates Benutzerprofil ist eine konservative Option, keine technische Pflicht
oder ausdrückliche Auditregel. Die frisch gelesene gespeicherte FN-Prefsgruppe enthält keine searchRoot-,
helperPath- oder nodePath-Overrides; dies ist bei laufendem Lightroom kein Nachweis seines Arbeitsspeichers.
Vor einem erlaubten Testwechsel ursprüngliches FN-Plug-in deaktivieren, Haupt-Lightroom normal schließen,
danach fehlende Pfadprefs erneut binden. Nur im eigenen Testkatalog die physische Testkopie mit gleicher
unveränderter Toolkit-ID als einzige aktive FN-Registrierung laden und ihren Pfad frisch kontrollieren.
Die Deaktivierung schützt vor dem bedingten Fehlerpfad des ursprünglichen Init-Watchers, der einen
produktiven pending-Nutzungsauftrag bei fremdem Katalog pausieren könnte; kein solcher aktueller Auftrag
wird daraus behauptet. Geerbte FN_*/IUCN_TAXONOMY_DIR-Overrides vor dem Start ausschließen. Keine
systemweiten Umgebungswerte ändern; Lightroom-eigenes System-temp nicht ungeprüft auf D umlegen, weil
die Laufzeitauflösung daraus das Windows-/Node-Laufwerk ableitet. Plug-in-/Fachhelper-temp liegt bereits
in der eigenen physischen Kopie beziehungsweise Operation.
Aktuelle Prozess-, Benutzer- und Maschinenumgebung rein lesend auf FN_*/IUCN_TAXONOMY_DIR geprüft:
keine solchen Variablennamen vorhanden. Das ersetzt die frische Start-/Pfadprüfung vor Aktivierung nicht.

Für den kleineren Profilweg verbleiben ausdrücklich gemeinsame UI-Prefs-Teilwirkungen: Zuletzt verwendet,
Watcher-Generation, Tempwarnung, Fenstergeometrie und Start-/Katalogpräferenzen. Aktuelle Statistik und
Revision sind dagegen kataloggebunden; alte globale statisticsCacheJson/statisticsDirty werden nicht mehr
gelesen. Rückweg: Test-Lightroom normal schließen, ursprüngliche Registrierung/Pfade wiederherstellen,
Hauptkatalog bewusst öffnen und Stand frisch kontrollieren; keine pauschale Rückkopie aller Lightroom-Prefs.
Vor Aktivierung genaue Freigabe dieses Wechsels, künstlicher Quelldaten-/FN-/Keyword-Schreib- und
Entfernungsschritte sowie Exporte ausschließlich im eigenen Exportordner einholen. Kleine Runde umfasst
keine aktive Auswahl, Einzel/Mehrfach/virtuelle Kopie, Erhalt manueller Keywords/Kontrollfoto, Anzeige ohne
Index, Statistik/Wiederöffnung und drei Exportformate. Drei Bilder plus Kopie ersetzen keine verlässlich
bedienbare Pause-/Race-Probe über mehrere 500er-Blöcke; exakte interne statisticsRevision ist nicht über
die heutige UI rücklesbar. Beides und Explorer-Handoff bleiben gesondert offen.
Die konkrete Aktivierungsentscheidung ist Felix als Rückfrage vorgelegt, noch ohne Antwort/Freigabe:
vorübergehender Plugin-/Katalogwechsel, nur drei künstliche Bilder plus virtuelle Kopie, die genannten
Schreib-/Entfernungsschritte sowie sechs eigene Exportdateien (drei Formate für Katalog und Auswahl),
danach ursprüngliche Registrierung und Hauptkatalog wiederherstellen. Gemeinsame UI-Prefs-Teilwirkung
ausdrücklich genannt; kein neues Windows-Konto vorgeschlagen. Bis zur Antwort keine abhängigen
nativen Aktionen ausführen.

Aktualisierung 10. Oktober: Die unter 10.16 erneut vorgelegte konkrete Testkatalogfreigabe wurde mit
„Testkatalog-Prüfung freigeben“ bestätigt. Die oben beschriebenen Grenzen und der Rückweg gelten weiter.

Eigene Browser-Prüftab geschlossen, Größenoverride bereits zurückgesetzt. Der ausschließlich eigene
UI-Helfer 30060 wurde nach frischer PID-/Startparameter-/Eigentumsprüfung beendet; sein Eingabekanal
war geschlossen, daher keine Behauptung eines über stdin ausgeführten geordneten Serviceabschlusses.
Nach bestätigtem Prozessende und Prüfung aller absoluten Ziel-/Vorfahrenpfade sowie fehlender Links
wurde nur die eigene Fixture unter temp/tests/s-30060-5b7ab44c/species-explorer-edit-jeSdyh entfernt:
10 Dateien/4.418 Bytes. Eigentumsmanifest und dauerhafte Auditbelege bleiben erhalten. Keine andere
Testsession und keine produktiven Daten bereinigt; das native Lightroom-Statistikfenster bleibt offen.

Vollständiges lokales Gate bestanden; abschließender Abgleich der letzten Dokumentänderungen:
Stil, lokale Verweise in 80 Markdown-Dateien und git diff --check bestanden. A-23-Code, A-24-Vertrag und ihre Gegenreviews
sind abgeschlossen. Kein Gesamt-Go, keine produktive Bereinigung,
kein Commit/Push/Deployment.

Historischer Änderungszwischenstand vor Umsetzung von A-27 gegen den sauber aufgenommenen Ausgangscommit d233bba: 81 bereits versionierte Dateien
und drei neue Decoder-/Headerdateien. Die drei neuen Dateien sind in git diff --stat nicht enthalten:
image-header.mjs 84 Zeilen, image-validation.mjs 93 Zeilen, image-validation.test.mjs 82 Zeilen.
Historische Berichte unter docs/audits bleiben unverändert; Laufzeitdaten und eigene Testbelege werden
nicht als Quelländerung gezählt. Git diff --stat: 81 Dateien, 4.173 Ergänzungen und
4.762 Löschungen; die drei neuen Dateien zusätzlich 259 Zeilen. Große Textlöschungen betreffen
vor allem die Verdichtung von AGENTS/README; ihre vollständigen historischen Inhalte bleiben im Ausgangscommit.

**Aktuelle vollständige Dateimenge nach A-28 bis A-38, 11. Oktober:** Frischer Git-Abgleich bestätigt
124 versionierte Änderungen und 13 neue Quellen, insgesamt 137 eindeutige Pfade.
Die folgende Tabelle ersetzt die frühere 103-Pfad-Zwischentabelle; Laufzeitdaten sind nicht enthalten.

| Bereich | Betroffene Dateien | Vollständige Dateimenge |
| --- | ---: | --- |
| Workflow, Abhängigkeiten und Start | 4 | `.github/workflows/pages.yml`, `package-lock.json`, `package.json`, `restore-start.cmd` |
| Dokumentation und Einbindungen | 24 | `AGENTS.md`, `README.md`, `docs/README.md`, `docs/add-species-workflow.md`, `docs/audit-auftrag-phase-10-5.md`, `docs/ci-quality-gate.md`, `docs/documentation-lifecycle.md`, `docs/lightroom-catalog-usage.md`, `docs/lightroom-search-package.md`, `docs/manual-species-fields.md`, `docs/media-asset-validation.md`, `docs/monthly-site-audit.md`, `docs/multi-device-backup-plan.md`, `docs/portrait-generation.md`, `docs/repo-structure.md`, `docs/roadmap.md`, `docs/squarespace-footer.html`, `docs/taxonomy-current-status.md`, `docs/taxonomy-edit-workflow.md`, `docs/taxonomy-master-database-design.md`, `docs/taxonomy-reference-update.md`, `docs/taxonomy-storage-maintenance.md`, `docs/taxonomy-update-automation.md`, `docs/temp-retention.md` |
| Website-Module und Vorschau | 4 | `lightbox-zoom.js`, `search.js`, `species-taxonomy.js`, `tools/squarespace-preview/index.html` |
| Lightroom-Plug-in | 14 | `lightroom-plugin/FNWildlifeTaxonomy.lrplugin/AssignmentWindow.lua`, `lightroom-plugin/FNWildlifeTaxonomy.lrplugin/CatalogMaintenance.lua`, `lightroom-plugin/FNWildlifeTaxonomy.lrplugin/IdentityAction.lua`, `lightroom-plugin/FNWildlifeTaxonomy.lrplugin/Info.lua`, `lightroom-plugin/FNWildlifeTaxonomy.lrplugin/KeywordWriter.lua`, `lightroom-plugin/FNWildlifeTaxonomy.lrplugin/LocationTimeMenu.lua`, `lightroom-plugin/FNWildlifeTaxonomy.lrplugin/LocationTimeWriter.lua`, `lightroom-plugin/FNWildlifeTaxonomy.lrplugin/PluginInfoProvider.lua`, `lightroom-plugin/FNWildlifeTaxonomy.lrplugin/PluginState.lua`, `lightroom-plugin/FNWildlifeTaxonomy.lrplugin/RemoveAllFnData.lua`, `lightroom-plugin/FNWildlifeTaxonomy.lrplugin/RemoveTaxonomy.lua`, `lightroom-plugin/FNWildlifeTaxonomy.lrplugin/SetReferenceImage.lua`, `lightroom-plugin/FNWildlifeTaxonomy.lrplugin/ShowStatistics.lua`, `lightroom-plugin/FNWildlifeTaxonomy.lrplugin/Statistics.lua` |
| Pipeline, Medien und Prüfwerkzeuge | 16 | `scripts/image-header.mjs`, `scripts/image-validation.mjs`, `scripts/image-validation.test.mjs`, `scripts/iucn-map-adapter.mjs`, `scripts/lightroom-catalog-usage-lua.test.mjs`, `scripts/lightroom-identity-ui.test.mjs`, `scripts/lightroom-keyword-removal-lua.test.mjs`, `scripts/lightroom-plugin-contract.test.mjs`, `scripts/lightroom-statistics-location-lua.test.mjs`, `scripts/pages-artifact-policy.mjs`, `scripts/pages-artifact-policy.test.mjs`, `scripts/prepare-pages-artifact.mjs`, `scripts/provider-adapters.test.mjs`, `scripts/species-taxonomy.test.mjs`, `scripts/squarespace-accessibility.test.mjs`, `scripts/validate-media-assets.mjs` |
| Explorer und Verhaltenstests | 75 | `species-explorer/app-backup-history.test.mjs`, `species-explorer/app-confirmation.test.mjs`, `species-explorer/app-dashboard.test.mjs`, `species-explorer/app-form-feedback.test.mjs`, `species-explorer/app-new-species-workflow.test.mjs`, `species-explorer/app-presentation.test.mjs`, `species-explorer/app-selection.test.mjs`, `species-explorer/app-taxonomy-database.test.mjs`, `species-explorer/app-taxonomy-maintenance.test.mjs`, `species-explorer/app-taxonomy-master.test.mjs`, `species-explorer/app-taxonomy-progress.test.mjs`, `species-explorer/app-taxonomy-reference.test.mjs`, `species-explorer/app-taxonomy-update.test.mjs`, `species-explorer/app-workflow-modules.test.mjs`, `species-explorer/backup-service.mjs`, `species-explorer/edit-backup-restoration.mjs`, `species-explorer/edit-backup-restoration.test.mjs`, `species-explorer/explorer-ui-contract.test.mjs`, `species-explorer/http-routing.mjs`, `species-explorer/http-routing.test.mjs`, `species-explorer/lightroom-close-gate.mjs`, `species-explorer/lightroom-close-gate.test.mjs`, `species-explorer/lightroom-usage-request.mjs`, `species-explorer/lightroom-usage-request.test.mjs`, `species-explorer/media-assets.mjs`, `species-explorer/media-assets.test.mjs`, `species-explorer/nas-backup-archives.mjs`, `species-explorer/nas-backup-archives.test.mjs`, `species-explorer/pipeline-controller.mjs`, `species-explorer/pipeline-log.test.mjs`, `species-explorer/pipeline-publication-check.mjs`, `species-explorer/portrait-asset-workflow.mjs`, `species-explorer/public/app-backup-history.js`, `species-explorer/public/app-backup-workflow.js`, `species-explorer/public/app-confirmation.js`, `species-explorer/public/app-dashboard.js`, `species-explorer/public/app-detail-view.js`, `species-explorer/public/app-editor-general.js`, `species-explorer/public/app-form-feedback.js`, `species-explorer/public/app-new-species-workflow.js`, `species-explorer/public/app-pipeline-workflow.js`, `species-explorer/public/app-presentation.js`, `species-explorer/public/app-selection.js`, `species-explorer/public/app-taxonomy-database.js`, `species-explorer/public/app-taxonomy-maintenance.js`, `species-explorer/public/app-taxonomy-master.js`, `species-explorer/public/app-taxonomy-progress.js`, `species-explorer/public/app-taxonomy-reference.js`, `species-explorer/public/app.css`, `species-explorer/public/app.js`, `species-explorer/public/index.html`, `species-explorer/request-router.mjs`, `species-explorer/request-router.test.mjs`, `species-explorer/server-assets.test.mjs`, `species-explorer/server-species-workflows.test.mjs`, `species-explorer/server-test-fixtures.mjs`, `species-explorer/server.mjs`, `species-explorer/server.test.mjs`, `species-explorer/species-create.mjs`, `species-explorer/species-creation-availability.mjs`, `species-explorer/species-creation-availability.test.mjs`, `species-explorer/species-creation-session.test.mjs`, `species-explorer/species-edit.mjs`, `species-explorer/taxonomy-animalia-fallback.test.mjs`, `species-explorer/taxonomy-classification-candidate.test.mjs`, `species-explorer/taxonomy-edit.mjs`, `species-explorer/taxonomy-master-service.mjs`, `species-explorer/taxonomy-master-service.test.mjs`, `species-explorer/taxonomy-storage-maintenance.mjs`, `species-explorer/taxonomy-storage-maintenance.test.mjs`, `species-explorer/taxonomy-update-coordinator.mjs`, `species-explorer/taxonomy-update-coordinator.test.mjs`, `species-explorer/taxonomy-update-restart.mjs`, `species-explorer/taxonomy-update-restart.test.mjs`, `species-explorer/temp-session.test.mjs` |

Versionsgrenzen: Plug-in-Quelle 0.4.24.25; zuletzt nativ bestätigtes Lightroom 0.4.24.24. Lokale Websitevorlage
Taxonomie 1.0.9, Suche 1.0.3 und Zoom 1.0.8; gelesener Live-Stand weiter 1.0.8, 1.0.2 und 1.0.7.
Installierter Electron-Stand 42.10.0 und Installations-Undici 7.29.1; Built-ins separat unter 10.10.
Keine zusätzliche Plug-in-Version allein für Dokumentänderungen. Keine Veröffentlichung aus dem Auditgate.

### 10.16 Weekly-Review-Abgleich und Sicherungsfrage – 10. Oktober

Felix legt das neue Weekly Project Review vor und beauftragt Gegenprüfung sowie Fortsetzung mit Agenten.
Das Review liest den veröffentlichten main-Stand, nicht den unveröffentlichten lokalen Arbeitsbaum.
Heute frisch per GitHub-API bestätigt: main weiter d233bba3b89b4e81705fe9f6ba1edd53fd86f617 vom
7. Oktober, 21:02:19 UTC; zugehöriger Pages-Lauf 37686572550 weiter completed/success, letzte Änderung
21:06:39 UTC. Der veröffentlichte Auditauftrag bezeichnet den Stand deshalb noch als vorbereitet.
Das erklärt die Differenz, ändert aber den ausdrücklich erteilten lokalen Auditstart am 8. Oktober nicht.
Kein Commit, Push oder Deployment zur nachträglichen Angleichung des Reviews ausgelöst.

| Weekly-Aussage | Heute bestätigte Einordnung |
| --- | --- |
| Audit noch nicht begonnen; Auditstart als nächster Schritt | Für diesen Hauptchat überholt: begonnen am 8. Oktober, sichere Korrekturen und mehrere echte isolierte Nachweise ausgeführt. Vollständiger Abschluss weiterhin offen. |
| Letztes Gate 1.257 Tests; Plug-in 0.4.24.22 | Historischer veröffentlichter Ausgangsstand. Lokal am 9. Oktober 50 Gruppen/1.371 bestandene Tests und Endprüfungen unter 10.15; jüngstes vollständiges lokales Gate am 10. Oktober 50 Gruppen/1.488 bestandene Tests unter 10.16. Quelle und tatsächlich geladenes Lightroom 0.4.24.24, nativ erneut unter 10.17 bestätigt. Workflow-Pins danach gesondert unter 10.18 geprüft. |
| Kein Taxonomiedrift; 273.466 frühere IDs und 56 Nutzungs-IDs erhalten, 187 zurückgestellt | Keine neue Inkonsistenz gefunden. Heute nur kleine Resolver-/Release-/Paar-/Nutzungsmanifeste gelesen; aktive Veröffentlichung weiterhin publication-b64beeb2-9951-4cf0-ac4e-1a326c5c3e91. Historischer Vollerhalt bleibt datiert; gezielte echte Prüfungen und 46 unveränderte manuelle Felder unter 10.6 ergänzen ihn, kein neuer globaler DB-/Katalogscan. |
| Tatsächliche Wiederherstellung noch nicht ausgeführt | Für das große Produktivarchiv weiterhin zutreffend. Echter kleiner Restore mit 162 Dateien/1.430.448 Inhaltsbytes und echten Lesern bereits belegt, siehe 10.7. |
| Wiederanlauf/Rollback und Lightroom-Abnahme vollständig offen | Isolierter harter Workerabbruch, Wiederaufnahme und gemeinsamer Rollback sowie native .24-Statistik-/Exporthinweisprüfung sind belegt. Kleine freigegebene SDK-Schreib-/Rücknahme-/Exportrunde unter 10.17 abgeschlossen; vollständige native Gesamtmatrix und weitere SDK-Schreibfälle bleiben getrennt offen. Schwarzstorch-Artabbruch bleibt als frühere Nutzerbestätigung erhalten. |
| IUCN-Kartenabruf weiterhin 403 | Anbieterbehebung nicht nachgewiesen. Eigene Transport-/Redirect-/Größen-/Decoderfehler wurden zusätzlich korrigiert; daraus folgt keine Umgehung oder behobene Anbietersperre. |

Beim damaligen Weekly-Gegenreview prüften zwei unabhängige Agenten Taxonomie/Sicherung beziehungsweise
UI/Artanlage/Lightroom lesend, ohne produktiven Download, Aufbau, Datenbankscan, Katalogwechsel oder
Schreibtest. Der damals noch offene Statusabfragefehler wurde dabei bestätigt; Dateizuständigkeit für seine isolierte Gegenprobe
und kleine Korrektur ausschließlich an den UI-Agenten vergeben. Zentrale Dokumentation bleibt hier.

**Felix' Sicherungsfrage:** Braucht es mehrere Sicherungen, wenn ältere angeblich nicht mehr
wiederherstellbar seien? Diese Prämisse ist am vorhandenen Bestand nicht belegt. Heute ausschließlich
ZIP-Verzeichnisse, kleine Manifeste und die drei kleinen eingebetteten Restorestarter gelesen; kein
Entpacken, Programmstart, vollständiger Hashlauf, zusätzliche Sicherung oder Löschen.

| Vorhandenes NAS-Archiv | Heute unmittelbar lesend festgestellt | Wiederherstellungsgrenze |
| --- | --- | --- |
| Juni: IUCN_Datenbank_2026-06-28_1118_07b5c8a84ab2.zip, 822.199.096 Bytes | ZIP-Verzeichnis lesbar, 1.023 Einträge, Manifest 800 Bytes, historischer Starter und speciesData.json, 285 Asseteinträge | Kein Daten/-Eintrag oder storage-path.json, kein v2-Inhaltsmanifest mit Datei-SHAs. Historischer Restore ungetestet; Unbrauchbarkeit nicht belegt. |
| August: IUCN_Datenbank_2026-08-13_185058_89a11d78c64e.zip, 946.318.733 Bytes | ZIP-Verzeichnis lesbar, 1.388 Einträge, Manifest 858 Bytes, historischer Starter und speciesData.json, 318 Asseteinträge | Gleiche Grenze; keine vollständige Sicherung des heutigen Taxonomiebestands. Welche historischen Originalvarianten anderweitig überdeckt sind, bleibt ungeprüft. |
| Oktober: IUCN_Datenbank_2026-10-07_215313_b13afd861ad7.zip, 21.785.161.273 Bytes | Moderner v2-Vollstand, 217 Daten/-Einträge und storage-path.json; vollständige historische Inhalts-/SHA-Rücklesung unter 5.6 | Großer tatsächlicher Restore/Programmstart weiterhin offen; heutige Quellkorrekturen sind nicht nachträglich Bestandteil dieses historischen Archivs. |

Die beiden Altarchive belegen zusammen **1.768.517.829 Bytes**, rund 1,77 GB; alle drei zusammen
23.553.679.102 Bytes. Sie sind historische Teilrückwege, keine zwei weiteren modernen Vollsicherungen
des aktuellen 100-GB-Bestands. ZIP-Lesbarkeit belegt weder vollständige Integrität noch Entbehrlichkeit.
Der heutige manuelle Restoreweg sperrt alte Archive nicht wegen ihres Manifestschemas. Die v2-Anforderung
betrifft vollständige Verifikation und automatische Rotation; unbekannte/alte Stände bleiben geschützt.

Auch der im tatsächlichen Oktoberarchiv enthaltene Starter ist noch der damalige 1.443-Byte-Stand mit
Node-18-Mindestprüfung und npm install. A-10 korrigiert den lokalen Starter auf Node 24/npm ci; bei einer
späteren Wiederherstellung ist diese Laufzeit-/Startgrenze ausdrücklich zu berücksichtigen. Das historische
Archiv bleibt unverändert; kein Archiv-SHA wird durch einen nachträglichen Austausch ungültig gemacht.
Keine Aussage, dass ein Start mit richtigem Node 24 unmöglich oder das Archiv beschädigt sei.

Eine einzige aktuelle unabhängige Sicherung schützt gegen den Verlust der Arbeitskopie, aber nicht gegen
einen erst später bemerkten Fehler im zuletzt gesicherten Inhalt oder gegen Verlust dieses einzigen Archivs.
Die am 7. Oktober bestätigte Zielregel bleibt **drei geprüfte zeitlich versetzte Vollstände**, zwei jüngere
und ein älterer Kontrollstand. Keine identischen Großarchive allein zum Erreichen dieser Zahl erzeugen;
bei unverändertem Inhalt bleibt es bei vorhandenen Ständen. Drei Generationen auf demselben NAS ersetzen
auch keine getrennte Sicherung gegen NAS-Ausfall. Der externe Lightroom-Katalog und die Fotooriginale
bleiben ein eigener, von dieser Explorer-Sicherung nicht vollständig abgedeckter Umfang.

Damit lautet der heutige Bestand weiterhin **ein moderner vollständig rückgelesener Vollstand plus zwei
geschützte historische Archive**, nicht drei bereits nativ abgenommene Wiederherstellungsstände. Felix'
Frage ist keine bestätigte Änderung der Aufbewahrungsregel oder Löschfreigabe. Künftige Reduktion nur
nach konkreter Verlust-/Überdeckungsbewertung und Entscheidung; ebenso keine Zusatzkopie aus dem Audit.

**A-27, Vorherbefund vor der Umsetzung am 10. Oktober:** Felix fragt ausdrücklich nach der
gezielten Wiederherstellung älterer Stände. Unabhängige lesende Prüfung von sichtbaren Buttons,
gesendeten Parametern, Routen und tatsächlichen Servicelesern bestätigt am 10. Oktober:

| Sicherungsklasse | Tatsächlich angebotene Wiederherstellung | Auswahlgrenze |
| --- | --- | --- |
| NAS-Gesamtarchive | Erstellen, Pfad einstellen, Vorschau und Status; der dokumentierte Restore erfolgt durch Auswahl/Entpacken eines ZIPs und dessen Starter außerhalb des Explorers | Keine Archivauswahl oder Restore-API im Explorer. Ältere ZIPs sind dadurch nicht technisch auf den letzten Stand beschränkt; historischer Umfang/Startweg gesondert prüfen. |
| Master und Lightroom-Suchpaket | Gemeinsames verifiziertes previous-Paar; UI sendet nur confirmed:true | Genau der gebundene Vorgänger, entsprechend der bestätigten Aufbewahrung aktiv plus ein vorheriges Paar. Keine beliebige Veröffentlichungsauswahl. |
| CoL-Grunddaten | Vorherigen Grunddatenstand wiederherstellen | Nur gespeicherter Vorgänger; keine Releaseauswahl. |
| Artenlisten-Bearbeitung | Vollständige alte Artenliste vor Änderung als Sicherung; regulär fünf passende jüngere Stände plus Schutzbindungen | Keine historische Auswahl oder Wiederherstellungsroute in der Oberfläche/API. |
| Manuelle Taxonomiebearbeitung einer Art | Automatische Werte wiederherstellen entfernt die manuelle Überschreibung; zusätzlich regulär fünf passende JSON-Sicherungen plus Schutzbindungen | Rückführung auf automatische Werte ist keine Wiederherstellung einer ausgewählten früheren manuellen Bearbeitung. |
| Karte, Sound und Artporträt | Letzte lokale Sicherung je Art/Typ, Backend bestimmt den neuesten passenden Kandidaten | Ein regulärer Rücknahmestand je Art/Typ; zusätzliche geschützte/historische Dateien ergeben keine Auswahl. |

Quellbezüge: NAS-[Routen](../species-explorer/request-router.mjs) und
[Serviceoberfläche](../species-explorer/backup-service.mjs),
[Master-UI](../species-explorer/public/app-taxonomy-database.js) und
[gemeinsamer Paarrollback](../species-explorer/taxonomy-publication.mjs),
[CoL-UI](../species-explorer/public/app-taxonomy-maintenance.js),
[Artenlisten-Sicherung](../species-explorer/species-edit.mjs),
[Taxonomiebearbeitung](../species-explorer/taxonomy-edit.mjs) sowie
[Medienauswahl](../species-explorer/asset-backups.mjs) und
[Medienwiederherstellung](../species-explorer/asset-maintenance.mjs).
Root prüft Routen, Paarbindung, letzten Medienkandidaten und gespeicherte Taxonomie-JSONs zusätzlich.
Dies ist ein belegter Fähigkeits-/Bedienbefund, keine neue native Restoreprobe oder implementierte Funktion.

Mehrere erhaltene Bearbeitungsstände sind mögliche manuelle Reparaturbelege, aber ihr einfacher gezielter
Bedienweg fehlt. Ein alter kompletter Artenlistenstand darf nicht ungeprüft spätere Änderungen anderer
Arten ersetzen. Ein Restore muss außerdem Identität, Medienreferenzen und heutige Bestandsbindung erhalten
oder einen ungeeigneten Stand mit verständlichem Grund verweigern. Die bisherige Auswahl allein des
Vorgängers schließt diesen Bedienpunkt für die mehrfach erhaltenen Bearbeitungssicherungen nicht.

**Konkreter Vorschlag zur Entscheidung, noch keine Umsetzung:** Kleine Bearbeitungssicherungen je Art
mit Datum, Art, Umfang und Vorschau auswählbar machen; vor Wirkung frische Bindung an ausgewählte
Sicherung und aktuellen Bestand, explizite Bestätigung sowie Erhalt anderer Arten/IDs/Medien.
NAS zunächst als Archivübersicht mit Datum, Umfang und ehrlichem Prüfstatus anbieten, mit verständlichem
Weg zur getrennten manuellen Wiederherstellung. Ein vollautomatischer NAS-Restore ist eine größere
Betriebsfunktion: Zielordner, Platzbedarf, laufende Leser, Pfadwechsel, Node-/Archivkompatibilität und
Programmstart müssen vor Umsetzung konkret abgegrenzt werden. Keine große Entpackaktion daraus ableiten.
Abnahme der kleinen Auswahl mit eigenen Fixtures: zwei unterschiedliche ältere Stände gezielt wählen,
fremde Änderungen/ID und Referenzen erhalten, zwischen Vorschau und Bestätigung geänderte oder beschädigte
Sicherung verweigern, Fehler und Abbruch ohne Teilübernahme. Danach unabhängiges Gegenreview und passende
Verhaltenstests. Bestehende Einzelvorgänger für Master/CoL und Medien nicht nebenbei erweitern.

Felix fragt anschließend, ob vor Fortsetzung Klärungen/Entscheidungen nötig sind. Unmittelbar offen sind
der gewünschte Umfang dieser neuen Bedienfunktion und die bereits konkret vorbereitete native
Lightroom-Testkatalogfreigabe unter 10.15. Aktuelle Aufbewahrungsgrenzen müssen nicht neu entschieden
werden; Löschen, Großrestore und Veröffentlichung sind spätere eigene konkrete Entscheidungen, keine
Voraussetzung für weitere sichere lesende Auditarbeit. CMS-/Lizenz-/GitHub-Verwaltungsfragen bleiben
unter 10.14 gesondert offen. Keine ausstehende Antwort als Zustimmung werten.

**Aktuelle Entscheidungen, 10. Oktober:** Felix bestätigt den kleinen Auswahl-/NAS-Übersichtsvorschlag
mit „Vorschlag umsetzen“ und die vorbereitete native Lightroom-Runde mit „Testkatalog-Prüfung freigeben“.
Damit sind die beiden unmittelbar benötigten Entscheidungen getroffen. Die früher als ausstehend
bezeichnete native Freigabe unter 10.15 ist jetzt erteilt; ihre genaue Wirkung und Rücknahme gelten weiter.
Umsetzung mit getrennten Dateizuständigkeiten: Taxonomie-Agent kleine Bearbeitungsrestorelogik und Tests,
UI-Agent Auswahl/Vorschau/Bestätigung und NAS-Übersicht, NAS-Agent lesendes Archiv-/Manifestinventar,
Root HTTP-Komposition, Integration, zentrale Doku und native Prüfung. Keine produktive Wiederherstellung
oder Änderung der Aufbewahrung aus der Funktionserstellung abgeleitet.

**A-26 ausgeführt:** Nur app-backup-workflow.js, app-pipeline-workflow.js und ihr bestehender
app-workflow-modules.test.mjs geändert. Acht gezielte neue Fälle scheitern zuerst an den unveränderten
Programmquellen; Rohbeleg temp/explorer/75975c9f-231f-48eb-9124-01ea09c22b7b/status-retry-before.log.
Die erste Korrektur wird unabhängig erweitert geprüft: 10 von 12 Recovery-/Routingfällen scheitern,
danach zwei gezielte fremde Dialogdetailfälle beide. Das sind getrennte Gegenproben, keine summierte
Testsuite. Weitere Rohbelege in temp/explorer/99a9da5a-dacc-4453-a85a-07cece6d1519/status-recovery-before.log
und temp/explorer/c73a81eb-f5fb-41b6-92f6-d6d9a2d96b71/status-dialog-detail-before.log.

Finale passende Prüfung in vier Dateien: **53/53 bestanden**, null Fehler, Abbrüche und Skips,
76,2401 ms; 31 neue Verhaltenfälle plus bestehende Verträge. Finaler Nachher-Rohlog und gebundener JSON-
Beleg in temp/explorer/c73a81eb-f5fb-41b6-92f6-d6d9a2d96b71/status-final-after.log und
status-final-result.json. Reviewer bestätigt alle drei Quell-SHAs und vier gebundenen Rohlog-SHAs
unabhängig. Eigene finale Sitzung geschlossen, null Operationen/Hilfsprozesse. Stil und passender
git diff --check bestanden. Root prüft zusätzlich die tatsächlichen Workflowquellen; finales lokales Go.

Ausschließlich GET-Statusabfragen nach 1/2/4/8 Sekunden wiederholen; nach vier Wiederholungen endet die
Fehlerfolge. Erfolg setzt sie zurück, aktive Aufträge behalten den normalen Sekundenpoll. Ein Read/ein
Timer je Dienst, mehrere Wiederöffnungen während einer offenen Antwort zu einer frischen Folge gebunden;
überholte Antwort oder abgelöster Timer ersetzt keinen jüngeren Stand. Statusfehler bleibt bis zum
erfolgreichen GET desselben Dienstes sichtbar, Fehleröffner priorisiert betroffene Dienste; bei zwei
Fehlern beide frisch lesen. Offenes Statusfenster aktualisiert Titel/Meldung/Details auch zu idle,
completed/running/awaiting-review; fremde Vorschau oder Backupdialog bleibt erhalten. Pipelineabschluss
vor erwartetem Ansichtsfehler verbraucht, loadData-/Abschlusswirkung nicht automatisch wiederholen.
Keine POST-/Start-/anderen schreibenden Aufrufe in den Gegenproben oder neue Retryregel dafür.

Grenzen: kein neuer Timeout einer einzelnen nie aufgelösten GET-Anfrage; die vier endlichen Wartezeiten
sind keine Gesamt-Wanduhrfrist. VM-Verhalten ist keine native Browser-/Produktivauftragsabnahme. Die
Explorerdateien werden lokal mit Cache-Control no-store geladen; kein Squarespace-Cachewechsel nötig.
Kein geladener Explorer nativ neu gestartet. Plug-in-Quelle/geladene Version weiterhin 0.4.24.24.

Neuer vollständiger quality:ci-Lauf am 10. Oktober, **Exit 0**, 06:13:02,346–06:20:32,117 UTC.
Eigener dauerhafter Rohlog temp/explorer/1fad0d41-115f-409b-a5db-7f06e507b9ce/quality-ci.log,
quality-result.json bindet Quelle, Rohlog-SHA und ausgezählte Ergebnisse. **50/50 Testgruppen,
1.402/1.402 bestanden**, null Fehler, Abbrüche oder Skips. Summe der Gruppentestdauern 423.956,8484 ms;
separat gemessene Runner-Wanduhrzeit 449.771 ms. Kein Leistungsfortschritt aus einem anderen Gatevergleich
abgeleitet. Alle 70 gebundenen Quell-/Test-/Konfigurationsdateien vor/nach SHA-identisch, kein produktiver
Hashscan. Sitzung nach Helferende geschlossen, null Operationen und Hilfsprozesse.

Vorprüfungen bestanden: Syntax 397 JS/MJS, Stil, lokale Verweise in 80 Markdown-Dateien und sechs zentrale
JSON-Schemabestände. Sämtliche nachfolgenden Gateabschnitte erreicht und bestanden: Audio, tatsächliche
Medienprüfung **61 Arten/317 Medien ohne Fehler**, Größenbudget **114,0 MiB von 172,5 MiB**, Projektkonsistenz, aktueller generierter Status und
lokales Websiteaudit ausdrücklich mit skipLive/skipPages. Die bekannten drei fehlenden Sounds bleiben
Pflegepunkte; kein neuer Live-/Pages-/CMS-Nachweis aus diesem lokalen Gate. Kein Commit/Push/Deployment,
keine neue Sicherung, produktive Bereinigung oder native Katalogaktion. Gesamtaudit weiter offen.

Nach damaligen Dokumentergänzungen erneut Stil, lokale Verweise in 80 Markdown-Dateien und git diff --check
bestanden. Die damalige Dateimengentabelle unter 10.15 war gegen Git geprüft: 84/84 Dateien,
keine fehlenden, zusätzlichen oder doppelten Einträge. Dies ist der Zwischenstand vor Umsetzung von A-27;
der aktuelle Mengenabgleich steht in der aktualisierten Tabelle unter 10.15. Historische Prüfberichte unverändert.

**A-27 umgesetzt und isoliert geprüft, 10. Oktober:** Eigene Fachmodule
edit-backup-restoration.mjs, nas-backup-archives.mjs und app-backup-history.js in vorhandene
Server-/Router-/UI-Grenzen integriert. `Bearbeitungsstände` zeigt je Art Datum, Art, Umfang und Sperrgrund;
`Stand prüfen` bindet die konkrete Vorschau, `Stand wiederherstellen…` verlangt eine eigene Bestätigung.
Artenlisten-Gesamtstände übernehmen nur englischen Namen, Größe, Gewicht und Lebenserwartung der gewählten
Art. Andere Arten, deutscher/wissenschaftlicher Name, stabile Identität und Medien bleiben erhalten.
Historische manuelle Taxonomie übernimmt sechs Ränge und ihren Grund bei heutiger automatischer Basis;
ein damaliger Stand ohne Override führt auf die heutigen automatischen Werte zurück. Pflegeart und Grund
bleiben auch bei identischen sichtbaren Rangwerten als Vorschauänderung erkennbar. Alte generierte
Gesamtstände ohne verlässliche Override-Herkunft sind begründet gesperrt.

Ausgewählte Sicherung, heutige Eingaben, generierte Daten und Registry werden frisch gehasht und nochmals
unmittelbar vor der ersten Quelländerung geprüft. Überholte/verbrauchte/abgelaufene Vorschauen,
zwischenzeitliche fremde Änderungen, Identitätsabweichungen, beschädigte Dateien oder Verzeichnislinks
verhindern die Übernahme. Der unmittelbar letzte Schutz liegt außerhalb der Rückschreibung, damit ein
frisch geänderter Fremdstand nicht durch Rollback ersetzt wird. Originalsicherung vor Änderung bleibt
erhalten. Ein tatsächlicher Dateizugriffsfehler kann dennoch auch die Rückschreibung verhindern; kein
pauschaler Erfolgsnachweis für jeden denkbaren Rollback. Begrenzte Dateizahl und Dateigrößen, Browserkontext,
Schreibsitzung und bestehende Betriebs-/Artanlagensperren bleiben wirksam. Kein automatischer Schreibretry.

NAS-Archivübersicht in `Backup und Einstellungen` ist ausschließlich lesend. Eigenes verborgenes Hilfsprogramm
liest begrenzt ZIP-Verzeichnis und Manifest, ohne Inhaltsdateien zu entpacken oder zu hashen. Ein passendes
v2-Manifest bedeutet `manifest-only`, keine heute wiederholte vollständige SHA-Prüfung oder erfolgreiche
Wiederherstellung. Historische, fehlende und beschädigte Manifeste/ZIPs werden getrennt erklärt; unbekannter
Umfang erscheint nicht als null Bytes. Abbruchfrist 20 Sekunden mit anschließendem Prozessende ist keine
mathematisch harte Gesamtfrist einschließlich jeder Betriebssystemlatenz. Frische reale kleine
Metadatenlesung bestätigt die drei vorhandenen NAS-Archive, circa 1,3 Sekunden, ohne Änderung.
Beleg temp/explorer/dc9088ce-fd42-482a-8002-2f8728e0b431/nas-archive-result.json; 13/13 passende NAS-/Servicefälle.
Kein Archiv wurde neu erstellt, gelöscht, entpackt oder gestartet. Manuelle Auswahl älterer Archive in
eigenem Ordner bleibt möglich; die neue Übersicht ist kein automatischer Restoreweg.

Finale Fachgegenproben **44/44** (36 neue Restorefälle und acht echte HTTP-Artenabläufe) unter
temp/explorer/fa15c03d-25e3-453f-8706-734349de2ad3/edit-restoration-final-result.json;
UI-Abschluss **73/73** (35 neue Fälle plus 38 vorhandene) unter
temp/explorer/64a308bb-310f-4f43-a495-0f2825c502a0/backup-history-ui-result.json.
Zwei unabhängige Reviews prüfen insbesondere Mode-/Grundvorschau, tatsächliche CSS-Spezifität,
ehrlichen unbekannten Archivumfang, Quell-/Backupbindung und späte Antworten. Weitere passende
Root-Router-/Serverintegration **13/13** unter temp/explorer/495146a6-3e2e-4740-8df2-8a3f31949acf.
Die ersten und letzten Testzahlen sind getrennte, teilweise überlappende Läufe; keine Summe daraus.

**Echte Browserabnahme:** eigener Explorer und createEditableFixture, leerer Zustand und zwei alte
Artenlistenstände sichtbar, konkrete Vorschau und getrennte Abbruchbestätigung. Bestätigter Amsel-Restore
ändert exakt `Historic Blackbird`/19 cm. Bachstelze bleibt in Eingabe und generiertem Stand vollständig
unverändert, trotz absichtlich altem 999-g-Wert der Gesamtlistensicherung. Karte, Sound, Spektrogramm und
Credits entsprechen vier ursprünglichen Testmedien. Taxonomievorschau zeigt Familie, Pflegeart und Grund,
ohne Speichern. Vier kleine echte synthetische ZIP-Fälle in der NAS-Übersicht korrekt angezeigt; keinerlei
Restore-/Entpack-/Startknopf. Desktop tatsächlich 1.133 px Dokument/1.000 px Dialog, schmal 376/338,09 px;
Tabellen scrollen innerhalb des Dialogs, kein horizontaler Seiten-/Dialogüberlauf, Fußaktionen erreichbar.
14 erfolgreiche Abschlusschecks, elf gebundene Quellen und zehn Screenshotbindungen im führenden Beleg
temp/explorer/8c6376a5-d5f4-49c3-888c-5df744bba426/browser-final-result.json.

Nach Werkzeugunterbrechung endet der erste eigene Server vor dauerhafter Speicherung seines HTTP-/DOM-
Puffers; diese Puffer wurden nicht nachgebildet. Erste Abbruch-/Restorebeobachtungen sind durch Screenshots
und exakten Dateiendezustand mit passenden Anfangsprüfsummen gestützt. Fortsetzung speichert jede Anfrage
und enthält keinen weiteren Restore-POST. Alte Browserschreibsitzung verweigert die Vorschau korrekt mit
403; keine automatische Übernahme. Eigene Server beendet, konkrete Fixture/eigene leere Prozessreste nach
Eigentumsprüfung entfernt, Testtab geschlossen und Ansichtsgröße zurückgesetzt. Dauerhafte Belege erhalten.
Browserquellbindung liegt vor der folgenden alleinigen Serversperrkorrektur; alle sechs UI-Quellen bleiben identisch.

**Letzte Sperrgegenprobe:** Root-Restore war gegen bereits aktive Quellen-/Masteraktionen gesperrt, die
umgekehrte Richtung berücksichtigte creationMutationActive zunächst nicht. Echter Server mit eigenen
kleinen Readiness-Doubles, angehaltenem Restore und beiden wirklichen Start-Routen: vor Korrektur beide
HTTP 200 statt 409. Kein produktiver Download/Aufbau oder Korruptionsbehauptung. Nur beide vorhandenen
isProjectBusy-Callbacks in server.mjs um denselben Schalter ergänzt. Neuer echter HTTP-Fall prüft beide
Richtungen, unveränderte Daten nach Abweisung und erneute Freigabe nach Restore. Vorher **13/14**, nachher
**14/14**, null Fehler/Abbrüche/Skips, Exit 0, 1.221,2774 ms; fünf Quellen während Nachlauf unverändert.
Rohbelege temp/explorer/fabe945e-06fb-45f2-84a6-919246e33016/busy-before.log und
temp/explorer/48f28610-91cd-44e7-b7bb-9af4cb4ff8b0/busy-after.log plus busy-after-result.json.
Unabhängiges Abschlussreview danach Go; Syntax und diff-Prüfung erfolgreich. Beide Quellen eingefroren.

Vollgate vor dieser letzten Sperrergänzung: **50/50 Gruppen, 1.487/1.487 Tests**, null Fehler/Abbrüche/Skips,
Exit 0, 07:54:29,228–08:02:03,091 UTC; Rohlog/Quellbindung unter
temp/explorer/1dd35e8f-b353-40c6-af35-8eb44240a92b. Alle 86 Programm-/Test-/Konfigurationsquellen unverändert,
403 JS/MJS Syntax, Stil, 80 Markdown-Verweise, sechs Schemabestände und sämtliche übrigen Gateabschnitte
bestanden. Dieser Stand ist historische Zwischenabnahme; erneutes vollständiges Gate nach den zwei
Serversperr-/Testdeltas separat gestartet. Keine Veröffentlichung und kein Abschluss des Gesamtaudits daraus.

**Finales Gesamtgate nach Sperrkorrektur:** quality:ci am 10. Oktober **Exit 0**, 13:16:52,989–13:24:31,189 UTC.
**50/50 Gruppen, 1.488/1.488 Tests**, null Fehler, Abbrüche oder Skips. Eigener dauerhafter Rohlog und
quality-result.json unter temp/explorer/fe84f0b8-b128-41fc-aa4f-81b74de06b95; Rohlog-SHA
26937a3f517f8780dd00d2d4e61800acb9e38a3794ce42cd59ae7d804c29fe33. Alle 86 gebundenen
Programm-/Test-/Konfigurationsdateien vor/nach unverändert. Gruppentestdauer 430.162,4939 ms,
Runner-Wanduhr 458.200 ms; keine Aussage über Leistungsgewinn. Nach Ende geschlossene eigene Sitzung,
null Operationen und Hilfsprozesse. Syntax 403 JS/MJS, Stil, 80 Markdown-Verweise und sechs Schemabestände
sowie alle übrigen Gateabschnitte bestanden: tatsächliche Medienprüfung 61 Arten/317 Medien ohne Fehler,
Größenbudget 114,0 MiB von 172,5 MiB, Projektkonsistenz, generierter Status aktuell und lokales Websiteaudit
mit skipLive/skipPages. Drei bekannte fehlende Sounds bleiben Pflegepunkte. Kein neuer Live-/Pages-/CMS-
Nachweis, keine Veröffentlichung oder produktive Wiederherstellung aus diesem lokalen Gate.

### 10.17 Native Testkatalogabnahme und Papageientaucher-Suche – 10. Oktober

Felix' Freigabe unter 10.16 wurde ausgeführt. Eigene physische Plug-in-Kopie 0.4.24.24 mit zwei
künstlichen Taxa, drei eigene JPEGs und eine virtuelle Kopie. Der tatsächlich angelegte Katalog liegt
unter `temp/explorer/2c80e3ae-4b7c-48da-889c-cbc1b7c45327/catalog/FN-Audit/FN-Audit.lrcat`;
der zusätzliche FN-Audit-Unterordner ersetzt die damalige geplante Pfadangabe unter 10.15.
Schreib-/Entfernungsschritte und sechs Exporte ausschließlich an diesen eigenen Testdaten.
Hauptkatalog-FN-Daten waren kein Schreibziel. Gemeinsame Start-/Dialog-/Zuletzt-verwendet-Einstellungen
sind entsprechend der Freigabe mögliche Teilwirkungen; keine Behauptung byteidentischer Lightroom-Prefs
oder Hauptkatalogdateien nach normalem Öffnen.

| Native Prüfung | Tatsächlich beobachtetes Ergebnis |
| --- | --- |
| Keine aktive Fotoauswahl | FN-Fenster meldet keine ausgewählten Fotos; Zuweisung und die gezielten Rücknahmen deaktiviert. |
| Einzel, Mehrfach und virtuelle Kopie | Zwei Original-Testfotos erhalten Alpenstrandläufer/Calidris alpina; die virtuelle Kopie des ersten erhält Eurasisches Eichhörnchen/Sciurus vulgaris und das manuelle Stichwort ManualAuditKeep. Drittes Original bleibt Kontrolle. |
| Fehlende verwertbare Aufnahmezeit | Die synthetischen JPEGs haben zunächst keine vom SDK bereitgestellte Ursprungsaufnahmezeit; sichtbare Dateizeit ersetzt diese nicht. Erste Ort-/Zeitübernahme meldet zwei fehlende Zeitwerte, übernimmt vorhandene Ortsfelder des zweiten Testfotos. Kein erfundenes Datum aus Dateimtime. |
| Positive Zeit-/Ortswerte | In Lightrooms eigenem Datumeditor einzeln 15.01.2024 11:22:33.174 und 03.02.2024 11:22:33.175 gesetzt. Foto 2 erhält Deutschland/DE, Baden-Württemberg, Stuttgart/Audit-Testplatz, GPS bleibt leer. FN-Aktualisierung bestätigt zwei geänderte Fotos; Zeit auf Foto 1 funktioniert trotz fehlendem Ort. |
| Statistik ohne aktuellen Index | Nach den externen Lightroom-Datumsänderungen zeigt FN den fehlenden aktuellen Index. Vollständiger Hinweis erklärt Neuaufbau für Katalogstatistik/-export und sofort möglichen Auswahl-Export. Im Exportdialog ist der vollständige Auswahlhinweis sichtbar und Nur markierte Fotos eingestellt. Kein produktiver Index gelöscht. |
| Kleiner eigener Statistikneuaufbau | Vier Katalogeinträge, drei taxonomierte/ein nicht taxonomierter, zwei Arten, 75,0 % Abdeckung. Zwei Fotos mit Zeit, eines mit Ort, eines mit beidem, eines nur mit Zeit, keines nur mit Ort, eines ohne beides. Persistenter Stand 10.10.2026, 15:37. Summen und Jahres-/Monats-/Ortsgruppen passen. |
| Alle FN-Daten auf virtueller Kopie entfernen | Bestätigung betrifft ein Foto. Ergebnis: eine Taxonomiezuordnung, null Favoriten, sieben Taxonomiestichwortzuordnungen, null Orts-/Zeitzuordnungen entfernt. Danach am Foto ausschließlich ManualAuditKeep; Kopienname Kopie 1 erhalten. Kein positiver Favoritenentfernungsnachweis aus null Favoriten. |
| Nur Taxonomie auf Foto 1 entfernen | Ein Foto betroffen. Danach bleiben 2024 (FN Zeit), Januar (FN Zeit) und Lightrooms Ursprungs-/Aufnahmedatum 15.01.2024 erhalten. |
| Nur FN-Ort/Zeit auf Foto 2 entfernen | Ein Foto und sechs verwaltete Stichwortzuordnungen entfernt. Taxonomiestichwörter bleiben; ursprüngliche Lightroom-Ortsfelder einschließlich DE und Aufnahmezeit 03.02.2024 bleiben erhalten. |
| Kontrollfoto | native-test-3.jpg hat nach den Rücknahmen weiterhin ein leeres Stichwortfeld. Alle drei JPEG-Dateien bleiben SHA-256-gleich zur Vorbereitung; keine Behauptung, dass nur anhand der Dateihashes sämtliche Katalogmetadaten unverändert seien. |

Die Exporte wurden vor den Rücknahmen erstellt. Tatsächliche Formate sind **Lifelist-CSV,
Beobachtungslisten-CSV und Artenlisten-TXT**, jeweils Katalog und Auswahl; keine JSON-/HTML-Exporte.
Alle sechs Dateien liegen im eigenen exports-Ordner, zusammen **2.624 Bytes**, strikt gültiges UTF-8 mit
BOM. Katalog-Lifelist: Alpenstrandläufer zwei Fotos, Eichhörnchen ein Foto, zwei Arten. Auswahl-Lifelist:
nur Alpenstrandläufer, zwei Fotos/eine Art. Beobachtungen entsprechend drei beziehungsweise zwei Gruppen
mit jeweils einem Foto: Januar ohne Ort, Februar mit den vier gesetzten Ortswerten; Eichhörnchen ohne
Zeit/Ort und mit dem gleichen Beispieldateinamen wie sein Original. TXT-Art-/Klassenumfang passt dazu.
CSV enthält keine virtuelle-Kopie-ID, exakte Uhrzeit, Ländercode oder GPS; diese Details sind getrennte
native Beobachtungen, keine aus dem Export abgeleiteten Eigenschaften. Alle Favoritenfelder zeigen Nein.
Dateien wurden streng dekodiert und inhaltlich gelesen, nicht in einem nativen Tabellenprogramm geöffnet.

**Unterbrechung und gemeldete Papageientaucher-Suche:** Vor Abschluss des Rückwegs wurde Lightroom
geschlossen und der Hauptkatalog wieder geöffnet; die Testregistrierung blieb zunächst aktiv. Felix
meldete deshalb fehlende Treffer bei Papageientaucher, während der Explorer ihn fand. Direkte native
Kontrolle des Zusatzmodulmanagers bestätigt genau die aktive Zweitaxa-Testkopie mit
lightroom-91fa8b4f09daa536f4d5/master-native-audit-fixture-v1. Ein Agent reproduziert lesend null Treffer
für Papageientaucher und Fratercula arctica in dieser Kopie. Der reguläre indizierte Suchweg findet beide
Namen jeweils genau einmal mit Master-ID `mtx_9c3ac66c935bc933dee31294af677a0e`, aktiv und projektgebunden.
Master enthält den Papageientaucher-Suchterm aus Projekt und CoL; kein produktiver Neuaufbau oder
Vollscan dafür. Beide Plug-ins teilen die Toolkit-ID; der Pfad allein reicht daher nicht als Standbeleg.

Gleichzeitige Eingaben blockierten zunächst die Windows-Steuerung; Felix gab Lightroom danach frei.
Ein physisches Esc beendet anschließend die Steuerung, und die abhängigen UI-Schritte wurden sofort
gestoppt. Nach seinem erneuten Auftrag „weiter mit dem audit und dem problem des papageientauchers“ ist
der Rückweg vollständig ausgeführt: Testregistrierung deaktiviert, ursprüngliches Plug-in
`D:\Arten-Explorer\lightroom-plugin\FNWildlifeTaxonomy.lrplugin` wieder aktiv. Nativ bestätigte
Version **0.4.24.24**, Suchwurzel `D:\Arten-Explorer\Daten\lightroom`, **273.476 Taxa**, Master
master-20261003055911210, Paket lightroom-fa739bd28ec1e82a0283 und übereinstimmender CoL-/Master-/LR-Stand.
Testregistrierung bleibt deaktiviert vorhanden; ihre Dateien wurden nicht gelöscht.

Im wieder geöffneten Hauptkatalog „Lightroomkatalog aktuell“ zeigt die native Suche anschließend
**Papageientaucher · Atlantic Puffin · Fratercula arctica**, bevorzugten Namen Papageientaucher und
**„Art ist zur Zuweisung bereit.“** Suchfenster ohne Zuweisung, Namensspeichern, Rücknahme oder Export
geschlossen. Der aktuelle Hauptkatalogfoto-/FN-Bestand wurde dabei nicht beschrieben; die Anwahl einer
Zuweisungsaktion war kein Teil dieser lesenden Kontrolle. Gemeldete Suchstörung durch Rückstellung
behoben; kein belegter Datenverlust oder produktiver Suchalgorithmusfehler. Unterschiedliche historische
und heutige Gesamtfotomengen werden nicht als unveränderter Hauptkatalogbestand behauptet.

**Gebundener Abschlussbeleg:**
`temp/explorer/da5f0325-d873-497f-bb61-7f7fa3fb6eb9/native-completion-result.json`, SHA-256
12fa44b05bae268098bf1af7248da2c3d5c9e8f07a20685c5158c708b9659ff9. Dazu dauerhaft eigene
native-observations.json und native-finish-proof.mjs. 28 tatsächlich gelesene UI-Beobachtungen und
19 erfolgreiche Beleg-/Konsistenzprüfungen; keine 19 zusätzlichen Programmtests aus diesen Prüfungen.
122/122 kopierte Quellen stimmen weiterhin mit dem Vorbereitungsbeleg überein; alle 47 heutigen
Plug-in-Lua-Quellen entsprechen der nativ geprüften Kopie. Drei Bildhashes, sechs Exportbindungen,
kleine storage-path-/aktive-Paarpointer samt Metadaten und alle 86 Programm-/Test-/Konfigurationsquellen
des finalen 1.488-Test-Gates zum Zeitpunkt dieses Abschlussbelegs unverändert. Der anschließende
Workflow-Pin-Abgleich mit gesonderter Nachprüfung steht unter 10.18. Kein neuer produktiver SQLite-/
Vollhashscan. Eigener Testkatalog
hat keine Lockdatei; Lightroom arbeitet wieder im Hauptkatalog. Abschlussbelegsitzung geschlossen,
null Operationen und Hilfsprozesse. Der erste Abschlussleser verwendete einen falschen JSON-Feldnamen;
nur der eigene Belegleser auf copiedSources korrigiert, keine Programmquelle oder Schutzprüfung geändert.

Beleggrenzen: Einzelne UI-Beobachtungen besitzen keinen separat aufgezeichneten Zeitstempel. Die native
Auswahlzusammenfassung war gelegentlich eine Aufnahme verspätet; tatsächliche Bildschirmmarkierung,
Dateiname/Kopienname und späterer Live-FN-Umfang waren maßgeblich. Größere native 500er-Pause-/Race-Probe,
exakte interne SDK-Revision, positive Favoritenmatrix, Explorer-Handoff und weitere DPI-/Screenreader-/
Touchstufen bleiben offen. Diese kleine echte SDK-Runde schließt weder Großrestore/Programmstart noch
Gesamtaudit oder Veröffentlichung ab. Nach letzten Dokumentänderungen Stil-/Verweis-/Diffabgleich separat.

### 10.18 Direkte Action-Stände festgebunden – 10. Oktober

P3 aus 10.11/10.14 lokal umgesetzt. Alle sieben direkten `uses:`-Referenzen für fünf offizielle Actions
in `.github/workflows/pages.yml` verwenden volle Commit-SHAs mit ihren bisherigen Majorversionen als
Kommentar. Checkout v5 und Setup Node v6 jeweils in Quality und Build, Configure Pages v5,
Upload Pages Artifact v3 und Deploy Pages v5 jeweils einmal. Führender Betrieb-/Updatevertrag samt
offiziellen Commitlinks: [CI-Qualitätsgate](ci-quality-gate.md#feste-action-stände-und-aktualisierung).

Der unabhängige Agent hat alle fünf offiziellen Git-Tagreferenzen vor und nach dem Abgleich sowie
Commitobjekt und `action.yml` über Tag/SHA lesend geprüft: **25 kleine unauthentifizierte GET-Abrufe**,
fünf stabile direkte Commitreferenzen, fünf bytegleiche Manifestpaare. Keine annotierten Tags in dieser
konkreten Aufnahme; der Updatevertrag berücksichtigt deren notwendige Dereferenzierung für spätere
Änderungen. Dauerhafter Roh-/Ergebnisbeleg mit URLs, Abrufzeiten, Größen und Hashes:
`temp/explorer/469f3318-fcef-49ff-977c-d6ee8a22ec76/actions-pin-upstream-result.json`, SHA-256
f5c3352f4c2fd3559cb7c04311af22cd35d88cdfe9a92eeda6a8dff02d0ed9eb.

Root bindet den Workflow vor/nach diesem Abgleich: nach LF-Normalisierung **genau die sieben geplanten
Referenzersetzungen**, keine weitere Änderung gegenüber dem unmittelbar davor bereits geprüften
Auditworkflow. Insbesondere bleiben dessen neue FFmpeg-Installation, getrennte Jobrechte, Eingaben,
Jobabhängigkeiten, Node-Version, Runnerwahl und Artefaktregeln erhalten. Alle **85 übrigen Quellen**
aus der 86er Bindung des letzten vollständigen 1.488-Test-Gates sind unverändert; allein pages.yml
weicht wegen dieser Pin-Ersetzungen ab. Alle 86 Quellen bleiben während der gezielten Nachprüfung
hashgleich zu deren eigenem Ausgangsstand. Kein erneuter achtminütiger Volllauf allein für denselben
offiziellen Action-Stand; das vorherige Vollgate und diese Nachprüfung bleiben zeitlich getrennt.

Gezielte Nachprüfung: **test:pages 7/7**, null Fehler/Abbrüche/Skips; Stil, lokale Dokumentverweise und
git diff --check jeweils Exit 0. Neun erfolgreiche Beleg-/Diff-/Quellbindungsprüfungen sind keine neun
zusätzlichen Programmtests. Dauerhafter Rootbeleg samt vier Rohlogs und Workflowkopien:
`temp/explorer/17ccb227-f770-471a-8774-06b33a67fe99/actions-pin-result.json`, SHA-256
77150df704c0a5181765ec67974f609555700632bafb232a562e0de646e27597.
Unabhängiger Agentgegenreview bestätigt den exakten Diff, alle offiziellen Rohbeleg-/Loghashes,
Quellbindungen und den Betrieb-/Updatevertrag ohne Nachbesserung; lokales Go für diesen begrenzten Abgleich.
Beide Belegsitzungen geschlossen, null Operationen und Hilfsprozesse. Die Sandbox blockierte anfangs
die vorhandene Temp-realpath-Prüfung; identischer eigener Beleglauf mit erlaubter gezielter Freigabe,
keine Programm-Schutzregel verändert. Abschließende Stil-/Verweis-/Diffprüfung nach Einordnung dieses
Abschnitts erfolgreich; 80 Markdown-Dateien ohne fehlende lokale Verweise.

**Grenzen:** Der äußere SHA-Pin von Upload Pages Artifact bindet dessen interne Referenz
actions/upload-artifact@v4 weiterhin nicht fest. Configure Pages verwendet weiterhin Node 20,
die anderen drei JavaScript-Actions Node 24; externe Runner-/Systempaketstände bleiben veränderlich.
Keine vollständige transitive Lieferkettenbindung, GitHub-Administrationsabnahme oder tatsächlich
ausgeführte Linux-Action aus dem lokalen Abgleich ableiten. Kein Commit, Push, Workflowstart oder
Deployment; Veröffentlichung und übergreifendes Gesamt-Go bleiben separat offen.

### 10.19 Nutzerkorrekturen zu Website, Herkunft und Startangebot – 10. Oktober

Felix beauftragt die konkrete Barrierefreiheitskorrektur und präzisiert die Websitebefunde: Löwe ist eine
frühere Testart ohne gewünschte öffentliche Seite; die Blaukehlchen-Karte stammt aus einem manuellen
Ausschnitt der Assessment-PDF wegen HTTP 503 am direkten Link; geeignete offen lizenzierte Ersatzsounds
sind laut seiner Einschätzung derzeit nicht in ausreichender Qualität verfügbar. Der bekannte automatische
IUCN-Kartenabruf bleibt ein Todo. Diese Angaben ersetzen keine unabhängigen Bild-/Lizenz-/Anbieterprüfungen.

**Löwe:** Kleine aktuelle Dateiprüfung findet den Eintrag weiterhin in species_list.json, speciesData.json,
fehlende_elemente_report.json und lastSavedAssessmentId.json sowie sechs Dateien unter species-assets/Loewe
(Karte, Porträt und Metadaten, Sound, Spektrogramm und Credits). Der allein führende generierte Projektstatus
zählt deshalb weiterhin 61 Arten. Der früher gemessene HTTP 404 bleibt als Messung wahr; er begründet nach
Felix' Erklärung keinen Auftrag, eine neue Löwe-Seite anzulegen. Verbliebene Testarteinträge sind ein eigener
Bestandsklärungs-/Bereinigungspunkt. Keine Art-/Asset-/ID-Entfernung oder handgeschriebene Zählerkorrektur.
Die datierten Juni-/Juli-Einträge zur damaligen produktiven Wiederaufnahme in der Roadmap bleiben historisch.

**Blaukehlchen:** Herkunftserklärung als Nutzerbestätigung in
[manuelle Karten-Overrides](manual-map-overrides.md) berichtigt. Die frühere Formulierung „korrupte
Kartendaten“ wird daraus nicht als heutiger technischer Befund übernommen. Konkrete ursprüngliche PDF-
Ausgabe und Ausschnitt sind nicht unabhängig verglichen; die heute gespeicherte Assessment-ID beweist
nicht die Ausgabe des damals verwendeten PDFs. Herkunftsbestätigung ist ausdrücklich kein neuer
manueller Bildprüftermin. Karte, maschinenlesbarer Altgrund und Pipeline-Schutz bleiben erhalten; keine
Kartenübernahme oder Quellenumgehung aus der Dokumentkorrektur. Individueller 503 und allgemeiner 403
beim automatischen Abruf sind getrennte Sachverhalte.

**Artporträts und KI-Frage:** Amsel und Papageientaucher tatsächlich als lokale Bilder angesehen: deutlich
erkennbare gemalte Illustrationen, keine als echte Aufnahme dargestellten Fotos. Aktuelles öffentliches
species-portrait.js 1.0.1 und lokale Datei bytegleich, SHA-256
f1e8f7b0ac200737609a43d6ab488f388e54c46c0aee1e9a317f3202cc203c4a;
artbezogener Alternativtext ohne sichtbare Bildunterschrift. ChatGPT-Herkunft bleibt intern dokumentiert.
Allein ein fehlendes sichtbares KI-Schild ist für diese konkret angesehenen Illustrationen kein belegter
Pflichtverstoß oder Bildfehler. Keine Behauptung einer rechtlichen Freistellung sämtlicher 61 Porträts.

Frisch gelesene Primärgrundlage: [konsolidierte EU-KI-Verordnung, Artikel 3 Absatz 60 und Artikel 50](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02024R1689-20260727).
Artikel 50 Absatz 2 richtet die maschinenlesbare Markierungspflicht an Anbieter; Absatz 4 verlangt von
Betreibern die Offenlegung bei Bild-/Audio-/Videoinhalten, die ein Deepfake darstellen. Maßgeblich ist
die mögliche falsche Wahrnehmung als authentisch/wahr. Die Kunstregel beschränkt gegebenenfalls die
Art der Offenlegung, beseitigt eine bestehende Pflicht nicht pauschal. Die vorläufige Einordnung der
angesehenen Illustrationen als Transparenzoption folgt aus deren konkreter Darstellung, nicht aus einer
generellen Kunstausnahme. Fotorealistische oder irreführend als Aufnahme verwendete Bilder gesondert
beurteilen. Kein Label und kein öffentlicher Darstellungswechsel ausgeführt.
[Porträtvertrag](portrait-generation.md) auf die bereits eingebundene Ausgabe und den bestätigten einzelnen
Medienvorgänger je Art/Typ korrigiert; keine alte globale 500-MB-Regel daraus weiterführen.

**Galerie-Alternativtexte:** Felix erklärt die bisherigen automatisch erzeugten Texte für unbrauchbar.
Die historische Abnahme unter docs/image-alt-audit.md bleibt unverändert; aktuelle Entscheidung öffnet
die Qualität wieder. Zwei konkrete öffentliche GET-Aufnahmen bestätigen in rohen Galeriefiguren
Papageientaucher 24 und Rebhuhn acht eindeutige Bildidentitäten, jeweils Dateiname als Altwert und ein
zweites leeres alt-Attribut. Keine globale Websitezählung oder gerenderte Screenreaderbeobachtung daraus.
Beispiel Papageientaucher _8020665.JPG, Rebhuhn _5041298_20260504_20_47_50.jpg. Geschützter konkreter
Bildidentitäts-/Vorherwertbeleg mit Roh-HTML, Zeit-/URL-/Hashbindungen und getrennten offenen Motivprüffeldern:
temp/explorer/fd26f00e-3e0a-446a-8d67-f0305e95242a/gallery-alt-preview-result.json, SHA-256
de06fac5330caad7cf8330d57a282cfd2c74d13db1a838bf7220ed7f5aa07072.
Sitzung geschlossen, null Operationen/Helfer; keine Bildpayloads heruntergeladen und keine Motive erfunden.

Automatisierbarer Folgeschritt: jedes konkrete Bild visuell prüfen, knappen sachlichen Alttext an stabiler
Bildidentität und CMS-Feld binden, Vorher/Nachher vorschauen und ausschließlich bestätigte Zeilen übernehmen.
Gute bestehende Texte und dekorative Entscheidungen erhalten; Header/Logo/Fremdbilder nicht über den
Seitennamen umlabeln. [Aktueller offizieller Squarespace-Vertrag](https://support.squarespace.com/hc/en-us/articles/206542357-Add-alt-text-to-images-for-accessibility-and-SEO)
ordnet Galerie-Alttexte je Galerieart Titel/Beschreibung zu; KI-Vorschläge sind zu prüfen und zu speichern,
die Suche nach fehlendem Alttext ist keine Prüfung schlechter vorhandener Dateinamenwerte. Tatsächliche
CMS-Speicherung, unerwünschte sichtbare Captions, Lazy-Loading und Lightbox anschließend gesondert abnehmen.
Nur JavaScript-Übersteuerung würde den gelieferten HTML-/Ohne-JavaScript-Stand nicht beheben. Konkrete
CMS-Übernahme noch nicht freigegeben/ausgeführt; die gebundene Vorschau erteilt keine Automationsfreigabe.

**Sounds und Karten:** Nutzerbestätigung fehlender geeigneter offener Alternativen dokumentiert, keine
neue umfassende Suche oder Rechtefreigabe daraus. Vorhandene Quellen-/Lizenzhinweise erhalten. Bekannte
NC-Nutzungsgrenze bleibt; keine automatische Soundentfernung/-ersetzung oder kommerzielle Freigabe.
Automatischer IUCN-Kartenabruf bleibt getrenntes Todo; Browser-/Dateiimport bleiben vorhandene Wege.

**Startmeldung:** Kleine lesende Statusaufnahme 10. Oktober, 19:57:50 UTC, über frisch aufgelösten
Datenpfad D:\Arten-Explorer\Daten: CoL aktiv/latest col-xr-2026-09-25-316441; letzte vollständige Ergänzungs-
prüfung 2. Oktober 18:19:14,671 UTC, eingestellte Siebentagesfrist seit 9. Oktober überschritten.
Einzelne Nachfragen vom 5. Oktober datieren diese Vollprüfung nicht neu. Kein offener gespeicherter
Updatekoordinator; letzter eigener Aufbau ready. Snapshotdatum/-alter ist kein Nachweis neuer Anbieter-
informationen und kein Master-/Lightroom-Fehler. Geschützter begrenzter Statusbeleg unter
temp/explorer/e134ea54-d4ad-4f63-a0a0-3bd19d5d49f7/status-evidence.json, SHA-256
747f90f543b3c5204af89557666f31d59c424571bdb4e5ee19af6c18b1635d98; kein produktiver Vollscan.

Zunächst kleine Titelkorrektur „Ergänzungsnamen erneut prüfen“/„Ergänzungsnamen prüfen“ statt „Namensbestand
ist veraltet“, 158/158 passende Fälle und unabhängiges begrenztes Go. Rohbelege vor/nach unter
temp/explorer/2674973c-9fd2-46af-8187-4bce2cec9c61 und e134ea54-d4ad-4f63-a0a0-3bd19d5d49f7.
Das Ablehnen startet keinen Update-/Aufbau-/Aktivierungslauf; die vorgelagerte Vorschauanfrage ist davon
zu unterscheiden. Felix entscheidet danach ausdrücklich: automatische Versionsprüfung beim Start,
Meldung nur für tatsächlich neu verfügbaren Stand; bloßes Alter soll kein Popup erzeugen. Diese weitergehende
Startkorrektur und die beauftragte Barrierefreiheitsserie sind in Arbeit; endgültige Gegenproben separat
unter 10.20, kein Abschluss aus der vorausgehenden Titelprobe. Kein produktiver Updateauftrag gestartet.

### 10.20 Barrierefreiheit, stiller Start und FN-Wiederanlauf – 11. Oktober

Felix startet zwischenzeitlich selbst den angebotenen Datenbankupdateweg und beauftragt parallel die
Auditfortsetzung. Er beanstandet die lange Meldung, unerwartete FN-Erfassung trotz Statistik und den
ausgebliebenen Lightroom-Schließversuch nach Abbruch/Wiederöffnen. Auf konkrete Rückfrage bestätigt er
den vorherigen Klick auf „Lightroom jetzt schließen“. Dies ist Nutzerbestätigung, kein erhaltener alter
Request-Zeitstempel. Auftrag und produktive Daten wurden zur Diagnose nur begrenzt lesend betrachtet;
kein Explorer-/Lightroom-Neustart, keine neue Erfassung, kein Schließen durch die Auditagenten.

**Barrierefreiheit A-28:** Drei zunächst gezielt reproduzierte Lücken lokal korrigiert. Benannte
Kurzbestätigung mit eindeutigem dynamischem Titel-/Beschreibungspfad und Abbruchfokus. Feldfehler
markieren genau passende Eingaben, behalten vorhandene Hilfe und den Fehler eines anderen Feldes;
lokale Korrektur prüft das betroffene Feld erneut. Artenliste navigiert sichtbare Arten mit Up/Down/Home/End,
einem Tab-Einstieg und konsistenter Auswahl; Neurendern erhält den passenden Fokus ohne Filterfokusentzug.
Namensvorschläge navigieren ohne Namens-/Detailübernahme durch Pfeiltasten; erst Enter/Leerzeichen oder
Klick aktivieren den Kandidaten. Neuer unabhängiger Review findet anschließend eine verzögerte Fokus-
übernahme nach Detailantwort; Erfolg/Fehler/neue Suchgeneration vor/nach gezielt gegengeprüft und korrigiert.

Vorproben temp/explorer/430dab62-3eba-46bd-8915-06d04ae2a7ed und nach erster Korrektur
5129886a-c6d5-4285-af06-20b55b42fc45; Integration vor zusätzlicher Fokuskorrektur **116/116**, null Fehler/
Abbrüche/Skips unter f72bd046-a1c0-4e4d-ad53-72a5854262ce/integration-result.json, Rohlog-SHA
841501d9fabe11e73e8ad211d516e530715a245a5ec91f416f1a449504938a8c. Unabhängiger Fokus-Vorbeleg
da5dbb56-682b-4092-9de6-2a453a90ba85/async-focus-review-result.json, SHA
dd65f596ddee057647b204e96db474172ac720384cf7e8edf1175a17e02babf0;
nach Korrektur **15/15** Referenztests unter d7f5861b-2416-4c8e-8e33-304fe432c99a, Ergebnis-SHA
c5e6b127fe837b7f8f0d1309a80f12e4ce14d86c0551d1c7fd19029cddeed66f. Überlappende Testmengen nicht addieren.

**Echte Root-Browserrunde:** Fester Loopback-Dateiserver mit bytegleichen aktuellen Modulkopien und
künstlichen Daten; keine Verbindung zu produktivem Explorer/Lightroom. Zwölf echte DOM-/Bedienbeobachtungen:
Dialogname/Beschreibung, Escape und Fokusauslöser, zwei Fehler und einzelne Korrektur, Arten-Pfeil-/End-/
Home-Auswahl, gefilterte Liste mit einem Tab-Einstieg und ohne Buttonfokusentzug, Vorschlags-Pfeile ohne
Übernahme, Enter und verzögerte Leerzeichen-Aktivierung. Nach später Detailantwort bleibt der inzwischen
bewusst angeklickte Freigabebutton fokussiert. Genau zwei künstliche Namensübernahmen, null Schreib-/
Netzwerkaktionen; kein FN-/Projektwrite. Fixture-Panel aktualisiert alle 100 ms und kann alten Fokus zeigen;
direkte DOM-Fokus-/Eingabewerte waren maßgeblich. Ein exakter Labelselektor scheiterte nach Erweiterung
des bestehenden verschachtelten Labels um Fehlertext; frische DOM-Aufnahme und beobachtete Eingabe-ID
ergaben die erfolgreiche Probe, kein Programmfehler aus diesem Locator-Timeout.

Gebundene Kopien/Fixture unter d7f5861b-2416-4c8e-8e33-304fe432c99a/fixture-binding-result.json,
SHA 2d52ba084ee3b5c5a88970b0bf7fe39d27765d7a2e0580e9a1259ac7039d7d88;
Rootrunde unter temp/explorer/71fa7bd3-cd90-4710-a2a6-7134dad3718f/browser-status.json und finish.json.
Acht gebundene Quellen während Rootrunde unverändert. Eigener Server beendet, Tab geschlossen,
Sitzung geschlossen mit null Operationen/Helfern. Sandbox-realpath-Sperre durch identischen erlaubten
eigenen Prüflauf gelöst, keine Schutzregel gelockert. Reale Screenreader-/DPI-/Touch-/vollständige
Produktivbedienmatrix bleibt separat; Browserrunde ist keine neue allgemeine WCAG-Konformitätsbescheinigung.

**Start und kurze Meldungen A-29:** Bekannter anderer CoL-Release beziehungsweise Erstinstallation kann
Startangebot erzeugen. Bloßes Ergänzungsalter, unbekannter Stand, ungültiger Termin oder Fehler trotz
gecachter neuer Kennung erzeugen kein Ersatzangebot. Vorschau prüft nach Statuswechsel nochmals das
tatsächliche CoL-Ziel; manuelle Prüfung bleibt möglich. Übersicht und Button sprechen bei bloßem
Ergänzungsalter von Prüfung statt neuer Version. Handlungsdialog mit vollständiger FN-Startvereinbarung
direkt im Text unter 120 Wörtern; normaler Schließweg separat kurz erklärt. Ausführliche Betriebsgrenzen
im [Gesamtupdatevertrag](taxonomy-update-automation.md), Startregel auch im
[Quellenupdatevertrag](taxonomy-reference-update.md) und README aktualisiert.

Vorprobe **92 Tests mit sieben reproduzierten Fehlern** unter
temp/explorer/5fbf6be5-14fb-41cf-b756-ce3154f62c2c. Danach **95/95**, null Fehler/Abbrüche/Skips,
fünf Quellen während Lauf unverändert. Endbeleg 79e2266d-a379-4e99-9579-310dae35a1a5/
startup-update-final-result.json, SHA b6c03ed1005aba5555ad004b4ae536c0bfa332e21d41e0b77495f5aa34aa12fb,
Log-SHA 20b600955ff3e8bbfe43141a219220cc4cdf8cae61caa4848acd19174dfabdbb.
Zwölf-Stunden-CoL-Metadatencache unverändert; kein neuer Anbieterabruf bei jeder Öffnung versprochen.
Vier Ergänzungsanbieter haben in der bestehenden Einzelabfrageanbindung keine gemeinsame Releasekennung;
lokales snapshot-Datum ist keine neu erkannte Upstream-Version. Prototyp-Vervollständigung wird weiterhin
als Installation behandelt, hat aber noch allgemeinen Versionstitel; produktive Vollreferenz nicht betroffen.

**FN-Erfassung und Schließretry A-30:** Statistik ist gespeicherte Auswertung, keine neue requestgebundene
zweifache SDK-Vollständigkeitsprüfung der UUID-/Master-ID-Menge. Ein tatsächlich aktueller Nachweis eines
unverändert geschlossenen Katalogs bleibt nach vorhandenen Frischeprüfungen verwendbar; keine immer
zwangsweise Neuerfassung und kein Vollscan beim bloßen Programmstart. Neue nötige Erfassung fordert der
explizit bestätigte Updateauftrag an. Eigene synthetische Vorprobe reproduziert den verlorenen normalen
Schließwunsch beim Retry. Service erhält ihn nur bei gleicher Update-ID, Startvereinbarung und Katalogmenge,
nicht bei Stornierung/Fremdauftrag/fehlender Zustimmung. Neue Capturebindung erforderlich, frühere
Quittung oder Schließversuche werden nicht umgestempelt. Keine erzwungene Prozessbeendigung.

Vorbeleg temp/explorer/38e3a2ad-162e-48bb-9775-3fdcb6d517ef/update-resume-diagnosis-result.json,
SHA 911a530a3ec4e1b3aae6b7f0701a8e49f47587732bc87b0e1b5dc1cee3731ccb. Neue drei Fälle vor Fix
zwei rot/einer grün; nach Servicefix drei grün, gesamter letzter Service-/Koordinatorlauf **82/82**,
null Fehler/Abbrüche/Skips. Nachbeleg 75606171-12e8-47b1-9715-37ccb09ef1ac/
update-resume-verification-result.json, SHA d1d3b54ba74066bc4dff8864651ae499f07f72ad5b9c395235a8d79f19cae2fa.
Zwei vorausgehende Läufe jeweils 81/82 scheiterten ausschließlich im eigenen vorhandenen Windows-Fixture-
Teardown mit ENOTEMPTY; nur dessen begrenzter vierfacher 80-ms-Retry ergänzt. Vollständige ursprüngliche
Ausgaben liegen im Toolverlauf; zusätzlich gesicherte Fehlerauszüge sind ausdrücklich Transkriptionen,
keine nachträglich behaupteten vollständigen Rohlogs. Programm-Koordinator unverändert.

**Zeitgebundener Betriebsstand:** 11. Oktober etwa 07:44 MESZ gespeichert building/build, Quellenabschluss
bestätigt und kein aktueller Fehler. Gleiche CoL-Version wiederverwendet, Ergänzungsquellen geprüft.
Neue SDK-Quittung 07:27:11 MESZ, Requestabschluss 07:30:00 MESZ. Kleine vorhandene Quittung gelesen,
kein Katalog-/Datenbank-/Vollhashscan; keine Aussage über unabhängig gemessenen Workerfortschritt.
Noch kein Gesamtabschluss oder neue aktive Paarkennung daraus. A-31: früherer Fehlerzeitstempel
completedAt 07:22:37 MESZ steht noch im wieder laufenden Auftrag und beweist keinen fertigen Aufbau.
Neue lokale Korrekturen wurden nicht durch Neustart in den laufenden Nutzerauftrag eingebracht;
native erneute Abbruch-/Schließrunde bleibt gesondert. Plug-in unverändert 0.4.24.24.

**Frischer Git-Abgleich:** Lokaler HEAD und lesend abgefragter Remote-main stehen am 11. Oktober auf
e03d49d716e006740fdda543e3f15c97a685cbc2, Commitzeit 10. Oktober 22:04:22 MESZ,
„Transfer pending Explorer changes“. Dieser zwischenzeitliche Commit enthält ausschließlich die elfzeilige
Dokumentkorrektur von docs/manual-map-overrides.md (acht Ergänzungen/drei Entfernungen). Die Auditagenten
haben ihn weder angelegt noch veröffentlicht; ausführender Akteur wird aus dem Committext nicht behauptet.
Damit ist die vorangehende d233bba-Aufnahme unter 10.16 ausdrücklich historisch. Neue Programmkorrekturen
dieser Serie weiterhin uncommittet; kein CI-/Pages-Erfolg für e03d49d aus dem reinen Remote-Abgleich ableiten.
Die Aufnahme vor A-32 zählte 110 ausstehende versionierte Pfade plus neun neue Quellen, insgesamt 119;
die bereits separat übertragene Kartendokumentation ist darin nicht mehr als offen enthalten. Der frische
vollständige Abgleich einschließlich der neuen Testisolierung steht unter 10.15.

Unabhängiges begrenztes Gegenreview bestätigt die 95 Start-/Dialogfälle und 82 FN-/Koordinatorfälle,
erhaltene Zustimmungsgrenzen und unveränderte gebundene Quellen. Dieses Go gilt für die lokal geprüften
Korrekturen, nicht für eine native Produktivabnahme oder den gesamten Auditauftrag.

Vollständiges lokales quality:ci nach eingefrorenen Korrekturen unter
temp/explorer/f791cd84-be99-4967-aa78-faedff660d95 vom 11. Oktober 07:45:10 bis 07:52:43 MESZ:
**50 Gruppen, 1.524 Fälle, 1.522 bestanden, zwei Fehler, null Abbrüche/Skips, Exit 1.** Alle 99 gebundenen
Programm-/Test-/Konfigurationsquellen unverändert. Rohlog-SHA-256
e24cf491b31f01bcf52e156b0745d9b5d1552f218867e46f84e06707bb8352e0; Ergebnispfad quality-result.json.
Beide Fehler in server.test.mjs (Zeilen 67 und 339 des Vorstands): Testserver ohne eigene repoRoot verwenden
den echten Datenpfad und scheitern beim Updatekoordinator-restore an dessen produktiver Owner-Sperre.
Keinen weiteren echten Serverstart als Vorprobe ausgeführt; vorhandener Fehlerlog und eindeutiger Quellpfad
genügen. Keine erfolgreiche Koordinatorübernahme und keine daraus abgeleitete globale Aussage über alle
vor der Sperre ausgeführten Startpfade. A-32 gezielt als Testisolierungsfehler aufgenommen; nach Korrektur
erneut prüfen. Das Gate endet vor den nachgelagerten Audio-/Asset-/Projekt-/Status-/Monatsprüfungen.
Belegsitzung geschlossen, null Operationen/Helfer. Keine Veröffentlichung oder Gesamtauditabnahme.

**Testisolierung A-32 nach Korrektur:** Gesamte Explorergruppe **34/34**, null Fehler/Abbrüche/Skips,
Exit 0. Beide früheren Defaultstarts, Portduplikat, geschützter Sitzungsserver und verwalteter Lifecycle
verwenden eigene Datenpfade; bisherige API-/Asset-/Bereichsabruf-/Sitzungs-/Schreibschutzassertionen erhalten.
Neue Gegenprobe schützt gegen fehlende/fremde Fixturewurzel und prüft die Wiederherstellung der geerbten
Speicheroptionen im eigenen Testprozess auch bei Fehler. Nur server.test.mjs und server-test-fixtures.mjs
für diese Korrektur geändert; zusätzlich gebundene Produktionsquellen server.mjs/storage-paths.mjs/
taxonomy-update-coordinator.mjs unverändert. Beleg temp/explorer/64917369-5406-43f2-ad8d-8b699b4ff66b/
server-test-isolation-result.json, SHA-256 8a05716ee7c6b5d09f98c6306ac6b2fca99f228c74977a5744eb13cd465e36b1;
Rohlog-SHA-256 0c320822674e150cf818dfe63d834e751e5ebe3217d1d31ae7009756a207933a.
Quellen während Lauf unverändert, Belegsitzung geschlossen. Keine produktive Vorprobe wiederholt.

Unabhängiger enger Gegenreview bestätigt alle fünf Quellen- und Rohlogbindungen, eigene Fixturepfade
auch im geschützten Server-/Lifecycleweg und unveränderte fachliche Assertions. Neues vollständiges Gate
auf diesem eingefrorenen Stand unter temp/explorer/e61875d2-9eed-408d-bdc9-9c3ce1969910 vom 11. Oktober
**08:01:32 bis 08:09:05 MESZ: 50 Gruppen, 1.525/1.525 Fälle bestanden, null Fehler/Abbrüche/Skips, Exit 0.**
Alle 100 gebundenen Programm-/Test-/Konfigurationsquellen unverändert; Rohlog-SHA-256
92b694415457c56bbbeff8706873dc3917dc16cb3d7a1c4cb14e36e42b610387, Ergebnis quality-result.json.
Syntax/Stil/Dokumentverweise/Schema, sämtliche Tests, Audio-/Assetprüfung, Größenbudget,
Projekt-/generierter Status und Offline-Monatsaudit durchlaufen. Belegsitzung geschlossen, null
Operationen/Helfer. Dieser vollständige Erfolg liegt zeitlich vor der anschließend beauftragten reinen
Anzeigeverbesserung A-33; er ist kein Gesamt-Go, neuer Linux-/Pages-/CMS- oder nativer Bediennachweis.

### 10.21 Länger stehender CoL-Fortschritt – 11. Oktober

Felix meldet „Relevante CoL-Taxa werden gelesen“, Schritt 2/7, 273.470 von 273.470 und 100 % dieses
Teilschritts. Diese UI-Werte sind seine aktuelle Beobachtung; sie sind kein Gesamtabschluss und kein
aktueller unabhängiger Taxazähler. Der Hinweis auf den bisherigen aktiven Bestand bleibt davon getrennt.

**Lesende Prozess-/Metadatenprobe:** Frisch aufgelöster konfigurierter Datenpfad D:\Arten-Explorer\Daten.
Gleicher Explorerprozess PID 15864 mit Startzeit 07:23:30 MESZ, gespeicherter Nutzerauftrag
update-af75a1c2-0508-45cb-88b2-29821b3cf6f8 weiterhin building/build, error leer und unveränderte gebundene
FN-Nutzungsrevision. Presence-Heartbeat wird erneuert. Neue Vorbereitung
job-94caaaca-e7d2-4a3c-89fc-c89fdf45997b enthält sechs Eingangsdateien, davon CoL 814.315.227 Bytes und
erster Anbieter 240.006.332 Bytes. Übrige drei kleine Dateien und ein leerer Anbieterausschnitt; leerer Slice
allein kein Fehler. Letzte Dateiänderungen 07:38:28 bis 07:38:30 MESZ. Noch kein recipe.json/state.json,
aktueller Jobzeiger deshalb weiterhin letzter fertiger Aufbau vom 3. Oktober. Drei direkte Electronkinder
gehören zur Oberfläche/Infrastruktur; kein neuer Masterworker erkannt.

Doppelprobe **08:00:09 bis 08:00:44 MESZ, 35,481 Sekunden:** CPU +34,84375 Sekunden, OS-Lesezähler
+1.201.736.300 Bytes, Schreibzähler +8.498 Bytes. Alle sechs Eingangsdateigrößen/-termine unverändert.
Dies belegt aktuelle Prozess- und Leseaktivität, nicht nur alte kumulierte Werte. Eine vorausgehende
20,451-Sekunden-Probe ergab Rechenarbeit ohne neue Ein-/Ausgabe und wird nicht nachträglich als
Lesefortschritt ausgegeben. Fehlender Stacknachweis: genaue Funktion, verbleibende Dauer und fehlerfreier
Gesamtabschluss sind nicht bewiesen. Kein Stillstand oder konkreter neuer Fehler daraus belegbar.

Hauptbeleg temp/explorer/b8c4debf-88df-4604-bd27-86b34d005c25/master-progress-observation-result.json,
SHA-256 ca03b75e671d751db6996cc60f12900632287c585e79d81b6fd20ab6f048b13b; eigener Runner und vier
relevante Quellhashes gebunden. Sitzung geschlossen, null Operationen/Helfer. Große Eingänge ausschließlich
über Dateimetadaten betrachtet; keine zusätzliche produktive Datenbank-/Kataloglesung oder Vollhashprobe.
Kein vorhandenes Workerlog für die noch ungebundene Vorbereitung; spätere stderr-Ausgabe liegt laut Code
im Speicher. Keine erfundene Logende-Prüfung, kein Schließen/Neustart/Abbruch.

**Unabhängige Quellprüfung A-33:** streamColRecords meldet den vollständigen Namenumfang beim Konsum
des CoL-Generators. Danach folgen Restpuffer/fsync, Anbieter-JSONL, Rezeptserialisierung und verifyMasterJob.
Diese bindet ursprüngliche Quellen inklusive CoL-Datenbank und aktive/vorige Masterdateien erneut mit
vollständigen Prüfsummen; anschließend werden sämtliche JSONL-Eingänge geprüft. Die sechs Spool-Größen
begrenzen daher nicht die gesamte gelesene Datenmenge. Erst nach recipe.json folgt „Auftrag gesichert“,
anschließend aktueller Zeiger und Workerstart. Weitere einmalige Worker-Eingangsprüfung folgt später.
Keine erkennbare unbeschränkte Wiederholung oder vollständige Quellenprüfung pro CoL-Taxon in diesem
engen Pfad; kein Nachweis quadratischen Gesamtverhaltens. CPU-/Lesetätigkeit allein identifiziert trotzdem
nicht die gerade laufende Prüffunktion. Belegte Lücke: keine Zwischenanzeige zwischen letztem CoL-Zähler
und gesichertem Rezept. Keine Zeit-/Erfolgsprognose aus dieser Diagnose.

Die gebundenen Aufbauquellen bleiben während des Nutzerlaufs unverändert: neue Hashes der in
masterBuildRulesRevision gelisteten Quellen würden dessen frische Eingangsprüfung ungültig machen.
Fachliche Aufbau-/Prüfsummenkorrektur erst außerhalb dieses laufenden gebundenen Eingriffs. Eine reine
Anzeigeverbesserung ohne Änderung dieser Regeln wird separat eng beurteilt; daraus kein verdeckter
Neustart oder produktiver Zweitaufbau.

Root-Gegenprüfung um 08:04:27 MESZ: derselbe Prozess mit weiter gestiegenem OS-Lesezähler
65.927.888.908 Bytes; Auftrag building/build, error leer und weiterhin kein recipe/state. Zunächst
Sandbox-CIM-Lesung verweigert, danach identische ausschließlich lesende Prozessmetadatenprobe erlaubt;
kein Nullwert aus der verweigerten Probe als Prozessende interpretiert. CoL-Originaldatenbank aus der
konkreten aktiven Releasekennung ausschließlich per Dateimetadatum: 11.081.637.888 Bytes. Diese Größe
erklärt den Prüfumfang, beweist für sich keine angemessene Laufzeit oder genaue laufende Funktion.

**Reine Anzeigevorprobe:** Tatsächlicher Presenter und beide vorhandenen UI-Verbraucher mit künstlichem
273.470/273.470-Masterstatus ausgeführt: Kopf/Detail weiter 100 % und „werden gelesen“, während running
true und completed false korrekt bleiben. Sieben Gegenfälle für Unvollständigkeit, andere Phase, ungültige
Mengen, Fehler/Pause und Quellenvorrang erhalten. Null API-Aufrufe und Bestätigungen; keine produktiven
Daten oder Programmsteuerung. Vorbeleg temp/explorer/876d5f25-f96e-49fa-ae7f-166822cff08b/
progress-completion-before-result.json, SHA-256
95f017caf5c63704ede479c56989f436fb8f3de0cfdafc2eaa3f6c4ad5ea6eab. Quellen vor/nach unverändert,
Belegsitzung geschlossen. Drei Frontendmodule sind ausdrücklich nicht Teil von RULE_FILES. Nach
vollständigem Ende des vorausgehenden Gates die eng begrenzte Anzeigeänderung beauftragt: nur bei
aktiver Masterphase CoL-Referenz und gültigem vollständigem Auswahlzähler neutralen Vorbereitungstext
verwenden, keinen Prozentwert für den ungemessenen Folgeteil. Backend, Rezeptbindung und Lauf unverändert.

**Anzeige nach Korrektur A-33:** 89/89 Presenter-/Datenbank-/Master-/Dashboardfälle bestanden. Beide
Verbraucher zeigen den neutralen Vorbereitungshinweis genau einmal; Pause/Fehler, Quellenvorrang,
unvollständige oder ungültige Messung und nachfolgende Phase behalten ihren bisherigen Zustand.
Beleg temp/explorer/79eb073b-3485-4cb8-b0e2-5350a67d3ffa/progress-ui-result.json, SHA-256
3528ccfe2bd5549ed00e665b611e2b689fd77efa6df8e38f6fa39138a14b7518; Rohlog-SHA-256
d2f3d1a86256f92cda8018c631ba47e1152be655c592c9b460c307649806b6d3. Sechs UI-/Testquellen
und alle 41 RULE_FILES vor/nach unverändert. Sitzung geschlossen; keine native Neuladung.

**Danach echter Fehler A-34:** Um 08:11:06 MESZ erhält der neue Auftrag sein Rezept und der Worker
beginnt. state.json endet um 08:12:55 MESZ als failed, zuletzt „Anbieter-Datensätze“, 275.000/275.230.
Fehler: „Die Klassifikationsentscheidung hat keinen unveränderten, eindeutigen Quellenbeleg mit gleicher
Anbieter-ID.“ Presence danach inaktiv, Koordinator failed/build mit Abschlusszeit 08:13:03 MESZ. Der
bisherige aktive gemeinsame Stand wurde nicht ersetzt. Die vorstehenden fehlenden Rezept-/Workerangaben
sind ausdrücklich frühere Beobachtungen. Keine Wiederholung/Übernahme oder Änderung am Nutzerjournal.

### 10.22 Vorrangige FN- und Artanlage-Reparaturen – 11. Oktober

Felix beauftragt diese Punkte vor weiterer Auditbearbeitung. Zwischenzeitlich hat er in Lightroom Fotos
gelöscht und fehlende Taxonomie zugewiesen. Der vorher gebundene FN-Nutzungsnachweis ist damit kein
Nachweis des jetzt weiterbearbeiteten Katalogs; vor einer späteren Datenbankübernahme ist die Frische neu
zu prüfen. Keine neue Erfassung oder produktive Fotoänderung durch diese Reparaturserie.

**Vorbelege:** Der echte bisherige Lua-Writer mit 260 künstlichen Fotos (130 März mit Jahres-/Ortsfeld,
130 April ohne FN-Teilstand) ändert nur die 130 Aprilfotos; fehlende Märzmonate bleiben leer. Zwei
UI-Gegenproben öffnen das Artformular trotz fehlgeschlagen/offen beziehungsweise nicht erreichbarer
Prüfung. Diese roten Vorproben verwenden eigene In-Memory-Fixtures; keine produktiven Fotos.

**Korrekturen A-35/A-36:** `Hinzufügen` ergänzt Feld-/Keywordlücken unter Erhalt nicht leerer FN-Werte;
`Aktualisieren` verwendet aktuelle nutzbare Quellen, ergänzt aus bekannten FN-Werten bei fehlenden Quellen
und korrigiert reservierte Zuordnungen. Unveränderte Felder, Keywords und Zeitmarker werden nicht neu
geschrieben. Taxonomieprüfung umfasst alle vorhandenen Metadatenfelder, tatsächlich zugeordnete
Stichwortobjekte und Kennungen; weder andere Master-ID noch manuelle Keywords, Originalzeit/GPS oder
Favoriten werden umgedeutet. Entfernung im Taxonomieersatz verwendet reale Objekte und erzeugt dafür
keine später im selben Block erneut benötigten Keywordnamen. Ergebnis zählt tatsächliche Taxonomie-
und Orts-/Zeitänderungen getrennt; Ort/Zeit an Taxonomiefotos zählt mit. GPS ohne nutzbaren exportierten
Lightroom-Ortsvorschlag, fehlendes GPS/Ort und nicht vollständig ermittelbare Aufnahmezeit sind getrennte
Hinweise. Fehlende Vorschläge werden nicht als fehlendes GPS bezeichnet. Bereits bekannte FN-Ortswerte
vermeiden einen neuen Vorschlagsexport; ungelöste GPS-Fotos können bei explizitem neuem Abgleich erneut
geprüft werden. Aus der früheren Meldung allein ist nicht beweisbar, wann ein Ort früher zugewiesen war.

**Korrektur A-37:** Eigene lesende Verfügbarkeitsroute aus dem tatsächlichen Koordinator-/Betriebsstatus,
vor Formularöffnung/Reset frisch gelesen. Fehler/offener Auftrag korrekt erklärt; bei Lesefehler bleibt das
Formular geschlossen. Vorschau/Portrait-/Schreibaufrufe prüfen serverseitig erneut. Eigene frühere
Artanlage-Aufträge bleiben getrennt lesbar und abbrechbar. Keine pauschale Freigabe des fehlgeschlagenen
Updateauftrags und keine neue Art Wendehals; dessen gebundene Eingänge bleiben erhalten.

**Gezielte Prüfung:** Neun relevante Lua-/Plug-in-/Workflow-/Router-/Server-Testdateien, **157/157 Fälle**,
null Fehler/Abbrüche/Skips, Exit 0. Auswahl 260/260 korrigiert; zweiter Lauf ohne Feld-/Keywordänderung.
FN-Wiederholung hält auch Statistikrevision unverändert; geänderte Zeit und gelöschter Monatskeyword
werden korrigiert. Bekannter FN-Ort löst keinen Vorschlagsexport aus; ungelöstes GPS und fehlendes GPS
bleiben getrennt. Echte eigene HTTP-Probe schützt Vorschau mit 409 und erhält Artenliste sowie
Updateauftrag bytegleich. Beleg temp/explorer/50be2d60-2657-42c7-94e2-3efae72129bc/
fn-repairs-result.json; Rohlog-SHA-256 0c8ccb184f62b71043799f6854b817754ecaf1e0e80928e2dcf039a38cdb61ea.
Gebundene Quellen während Lauf unverändert, Sitzung geschlossen. Isolierte SDK-Gegenproben sind keine
native Lightroom-Abnahme. Neuer Quellstand 0.4.24.25 synchron mit Info/Vertrag/Doku; zuletzt nativ
bestätigt ist 0.4.24.24. Keine Hauptkatalog-Neuzuweisung, Plug-in-Umschaltung, Explorer-Neustart oder Veröffentlichung.

**Zwischen-Gesamtgate vor dem Randfall-/CoL-Auswahlfix:** 11. Oktober, 13:03:09 bis 13:11:17 MESZ,
50 Testgruppen/**1.552 bestandene Fälle**, null Fehler/Abbrüche/Skips. Syntax (405 Dateien), Stil, lokale
Dokuverweise (80 Markdown-Dateien), Schema, Medien, Größenbudget, Projektstatus und Offline-Websiteprüfung
bestanden. 107 gebundene Programm-/Test-/Konfigurationsquellen unverändert. Beleg
temp/explorer/14ff0701-1f28-41c9-8258-17acc7e8862d/quality-result.json, SHA-256
8a927382ab10dd300833fd1ad8a518c1879685b128fcacab0a524a6d8ea4dbfd;
Rohlog-SHA-256 79f79b9b9b999045da6ac15b2a2b28107a774a6c3c59368b923b8b85b7d8b219.
Sitzung geschlossen. Dieser Lauf liegt ausdrücklich vor den nachfolgend beschriebenen neuen Korrekturen;
er ersetzt deren abschließendes Gesamtgate nicht.

**Begrenzte lesende Fehlerdiagnose A-34:** Die 7.555.662-Byte-Identitätsvorschau enthält 2.186 historische
Ereignisse. Alle 1.995 Klassifikationsbelege bestehen für sich die gegenwärtige strenge Prüfung; kein
ungültiger gespeicherter Beleg. Beleg temp/explorer/f1d5da53-54dc-40b5-a995-4320ffa1feba/
classification-proof-result.json; Eingangsdatei-SHA-256
6fb25b559b00c823e5d97e9dd00002f2c3769d9c3d1a4dd44b9d4505645a5878. Diese Gegenprobe bestimmt noch
nicht die neue Quellenbeziehung, an der der Aufbau scheitert; A-34 bleibt offen. Keine Großdatenbank-/
Kataloglesung, kein Prüfschritt gelockert und kein neuer Masteraufbau.

**Unabhängiger Gegenreview und Randfallkorrektur:** Der Review findet noch vier konkrete Leerplanfälle:
vollständig leere Fotos erhalten unnötige Feldschreibungen, ein allein gespeicherter ISO-Ländercode wird
geleert, und die Bereinigung verwaister interner Belege beziehungsweise realer FN-Stichwörter zählt nicht
als Änderung. Vier zusätzliche Lua-Gegenproben sind vor Korrektur rot. Die neue Prüfung unterscheidet
vorhandene FN-Werte von erzeugbaren Stichwörtern: ISO bleibt ein gültiges Metadatum ohne eigenes Keyword;
vollständig leere unveränderte Fotos werden nicht geschrieben. Bereinigte verwaiste Belege/Zuordnungen
zählen als echte Änderung und führen zum Statistikdelta. Erneuter relevanter Neun-Dateien-Prüfblock
**161/161**, null Fehler/Abbrüche/Skips, Exit 0, alle 20 gebundenen Quellen unverändert. Beleg
temp/explorer/7af90a10-688f-4f2d-a8c0-2fb3a445fceb/fn-repairs-result.json, SHA-256
d08ec6119cc8c77ae9b2b07bc97cfcd556b5629d3533b0f37f95cff92f3ae69b;
Rohlog-SHA-256 eb882bfed93153a2a6cbea09d5669d75af5b23e96a8ca9df263d6c036da49d46.
Sitzung geschlossen, null offene Operationen/Hilfsprozesse. Lesender Nachreview bestätigt zusätzlich
ISO-Quellenänderung CH → DE: Hinzufügen erhält CH schreibfrei, Aktualisieren übernimmt DE einmal,
Wiederholung hält Feld-/Keyword-/Statistikrevision unverändert. Quellenbezogenes Go, keine native Abnahme.

**Konkrete Auswahlursache A-34:** Elf lesende/isolierte Gegenprüfungen belegen den ersten betroffenen Fall
Alphacoronavirus rousetti, iNaturalist 1598323/CoL KSGSQ, gleiche CoL-Version. Die 2.186 Registry-Ereignisse
im Rezept, heutigen Speicher und aktiven Master stimmen überein. Die indexiert gelesene heutige CoL-Art
regeneriert exakt dieselbe historische Belegrevision. Der neue rohe Anbietereingang trägt weiterhin den
alten Marker `col-reference-gap` ohne `colTaxonId`. Die Auswahlabkürzung bei unverändertem CoL überspringt
diesen inzwischen bestätigten Klassifikationsfall vollständig; der Fortführungsschutz meldet deshalb
genau den echten Workerfehler. Einbezogen als tatsächlicher heutiger CoL-Eingang besteht der Schutztest.
Begrenzte binäre Suche liest 2.228.224 Bytes statt des vollständigen 240-MB-Anbietereingangs; keine
CoL-/Master-Vollinventur. Beleg temp/explorer/1439dfd3-1841-44ad-ab3b-ad51ee66d444/
classification-failure-diagnosis-result.json, SHA-256
59174046117b94c8bbb46ac8247b827be92594fb191b5652c1c3671dadd24c38. Produktiver Workflow bytegleich,
Sitzung geschlossen. Historische Belege werden nicht als aktuelle Quellen eingesetzt; die strenge
Fortführungsprüfung bleibt erhalten. Eine Quellenkorrektur ersetzt weder einen neuen gebundenen Aufbau
noch den frischen FN-Nachweis für Felix' inzwischen bearbeiteten Katalog.

**Gezielte Auswahlreparatur A-34:** `taxonomy-master-service.mjs` liest das bereits validierte Register
vor der CoL-Auswahl einmal und verwendet dieselbe Registry anschließend im Kandidatenbau. Namen von
`classification` und `classification-deferred` verhindern nur für ohnehin ausgewählte Eingänge den alten
Referenzlücken-Shortcut. Die Quellenauswahl wird nicht durch historische Entscheidungen selbst erweitert;
aktuelle CoL-Zeilen stammen weiterhin ausschließlich aus dem heutigen Store. Die Schutzmodule bleiben
unverändert. Echte kleine Folgeaufbauten reproduzieren vor Korrektur den Quellenbelegfehler; auch eine
unverändert gültige Zurückstellung fehlt im bestätigten Zähler, und eine geänderte Quellenbeziehung bleibt
fälschlich ohne neuen offenen Fall. Vorbeleg temp/explorer/fc7e0d01-ccbd-40d2-9589-9bd19d9c2e9b/
classification-selection-before-result.json, SHA-256
65d185e0c3f1819bd202b0deba9cfea8564cd75fa0281a45413e7fafa7a6e052.
Nach Korrektur **76/76 Fälle**, null Fehler/Abbrüche/Skips, Exit 0. Geprüft: ID/eigene Namen/Projektlinks
erhalten, heutige fehlende/fremde/mehrdeutige Anbieterkennungen und fehlender heutiger CoL-Datensatz
weiterhin gesperrt, unveränderte Zurückstellung angewendet und geänderter Fall wieder blockierend offen.
Unbeteiligte echte Referenzlücken behalten die Abkürzung. Acht gebundene Quellen unverändert; Sitzung
geschlossen. Beleg temp/explorer/17226297-00c1-4c28-8874-1875d6c0cf6f/
classification-selection-after-result.json, SHA-256
ef6e050286ef74d14e4576c70edf3ee537d8ec47c2914b9e9281886eecb4dad9;
Rohlog-SHA-256 aab8c8d818964301351056341c0a88dff0bbc80a66f2f332bf603b232d8c588f.
Unabhängiger lesender Review bestätigt Quellen-/Belegtrennung und unveränderte fachliche Guards;
keine produktive Gegenprobe oder Freigabe der vollständigen heutigen Fälle.

**Zusätzliche Bedienlücke A-38:** Bei vorhandenem offenem `failed/build` leitet die Oberfläche auf
`sequence-resume`; Einzelaufbau und `sequence-start` werden vom selben gespeicherten Eigentümer gesperrt.
Eine geänderte Aufbauregel muss beim Altrezept korrekt `MASTER_JOB_STALE` auslösen. Ein sicherer
öffentlicher Weg zu einem frischen eigenen Aufbau fehlt bislang; die vorhandene Ersetzung betrifft nur
fehlgeschlagene Quellenphasen. Die beauftragte enge Reparatur erhält alten Workflow/Buildjob, bindet eine
neue ausdrückliche Startvorschau an heutige lokale Eingänge und verlangt eine neue FN-Anfrage. Kein
Umschreiben alter Regelhashes, kein Download oder tatsächlicher produktiver Start während dieser Umsetzung.

**Lokale Reparatur und abschließende Gegenprobe A-38:** Die beiden sitzungsgeschützten Routen für
Neustartvorschau und bestätigten Ersatzauftrag delegieren an den vorhandenen Koordinator. Ein begrenztes
Fachmodul bindet alten Eigentümer/Rezept, aktuelle kleine Quellen-/Projektdateien, große Quellen über
Dateistände, zurückbehaltene Taxa, Ausgangsstand und vollständigen Katalogsatz. Vorschau/Abbruch verändern
keinen Auftrag. Neue Bestätigung archiviert zuerst den alten Workflow; ein Fehler dabei lässt ihn als
aktuellen Auftrag erhalten. Alter Build und Rezept bleiben unverändert. Fremde/aktive/fertige Aufträge,
Kandidaten, unvollständige Quellenphase, falsche Kennungen/Revisionen, neue Eingänge oder Katalogpfade
verhindern den Ersatz. Vor dem tatsächlichen Aufbau werden die Eingänge nach dem FN-Warten erneut geprüft.
Die neue registrierte Quittung darf die erwartete Registerrevision ändern, nicht den bestätigten Katalogsatz.
Unbeteiligte Suchcache-Zeitstempel sind keine Änderung zurückbehaltener Taxa. Große Quelldaten werden nicht
für die Vorschau geöffnet/gehasht; vollständige Eingangsprüfungen bleiben an der bestehenden Aufbaugrenze.

Der neue Auftrag verlangt auch bei global aktueller Nutzung eine eigene frische SDK-Quittung. Abbruch bleibt
als Fehler sichtbar; eine alte abgeschlossene oder unvollständig registrierte Quittung gibt nicht frei.
Echte synthetische Request-/Capture-/geschlossene Registerkette startet anschließend genau einen neuen
eigenen lokalen Aufbau ohne zweiten Quellenabruf. Pausierte brauchbare Checkpoints behalten `sequence-resume`.
Kurze neue UI-Bestätigung und verständliche Aktionsbezeichnung; kein automatischer Start beim Öffnen.
**144/144 Fälle**, null Fehler/Abbrüche/Skips, Exit 0; 14 gebundene Programm-/Test-/Konfigurationsquellen
unverändert. Beleg temp/explorer/bbd4e6b3-71de-4c5d-8b0f-76f4e33795ec/update-restart-tests-result.json,
SHA-256 c53787b7eff26629884f3d9c6049e66b272f373bb10f0d1d6b14225664225223.
Rohlog-SHA-256 444b1b11f364a123103c2d86859bf2dc31267f931fe9b59ccdef83a71cda7bcc.
Sitzung geschlossen, keine offenen Operationen/Hilfsprozesse. Der abschließende Quellreview erfolgte durch
die Integration; die Agenten waren nach ihren abgeschlossenen A-34/FN-Gegenreviews durch ihr Nutzungslimit
nicht mehr verfügbar. Keine behauptete unabhängige A-38-Agentenabnahme oder native Betriebsfreigabe.

**Nachreview und Wiederbestätigung nach Drift:** Nach dem Reset des Agentenlimits war ein unabhängiger
lesender A-38-Review wieder möglich. Er findet eine konkrete weitere Bedienlücke: Bei geänderten Eingängen
während des FN-Wartens hält der neue Auftrag korrekt an, bleibt jedoch `failed/start/buildStarted=false`;
gewöhnliches Fortsetzen prüft nur denselben veralteten Guard, eine neue Vorschau ist zunächst nicht erreichbar.
Das laufende Zwischen-Gate e53174ac-add1-4066-822f-158250d00c05 wurde deshalb bewusst abgebrochen und
ist kein Abschlussbeleg. Die Korrektur bindet eine erneute öffentliche Vorschau an den jetzt aktuellen
fehlgeschlagenen Ersatzauftrag. Intern müssen ursprünglicher Build, unveränderte Rezeptrevision und
Ursprungshistorie samt Hash weiterhin passen. Beide früheren Aufträge bleiben erhalten; nach erneuter
Bestätigung wird wieder eine eigene neue FN-Anfrage benötigt. Veränderte Ursprungshistorie stoppt sowohl
Vorschau als auch tatsächlichen Start nach dem Warten. Neue UI bietet diesen Weg auch für die fehlgeschlagene
Vor-Aufbauphase an; brauchbare pausierte Checkpoints behalten ihren bisherigen Resumeweg.

Erneuter gezielter Lauf **148/148 Fälle**, null Fehler/Abbrüche/Skips, Exit 0, alle 14 gebundenen Quellen
unverändert. Echte synthetische FN-Request-/Capture-/geschlossene Registerkette sowohl unverändert als auch
nach Eingangsänderung und neuer Bestätigung geprüft: danach genau ein neuer eigener lokaler Aufbau, keine
zweite Quellenaktion. Beleg temp/explorer/7d767e86-bcb2-4033-85e6-34a94b9014d6/update-restart-tests-result.json,
SHA-256 8a0a9d768c0cde778854a6465880e56526b617bacf0b20e1b5f196a0e584fdbe.
Sitzung geschlossen. Gesamtgate und abschließender unabhängiger Nachreview werden an diesen neuen Endstand gebunden.

**Unabhängiger Abschlussreview A-38:** Zweiter lesender Review bestätigt den korrigierten Vor-Aufbau-
Wiederholungsweg, die öffentliche aktuelle Auftragsbindung bei interner Ursprungseigentümerschaft,
erneute Historienprüfung, tatsächlich erreichbare UI-Vorschau und beide erfolgreichen echten synthetischen
FN-Ketten. 148/148-Beleg, Rohlog und alle 14 aktuellen Quellenbindungen unabhängig abgeglichen; keine
Abweichung oder weiterer konkreter Fehler. Rohlog-SHA-256
57e7c275dbccc56c575030e89e0bb8b5e6045da6ed88876e427e1a84b5480a0b. Quellenbezogenes Go; keine
Dateiänderungen, produktiven Aktionen oder native Betriebsfreigabe durch den Review.

**Vollständiges Endgate nach allen Reparaturen:** 11. Oktober, **18:55:03 bis 19:02:32 MESZ**, `quality:ci`
mit Exit 0, **50 Testgruppen / 1.600 bestandene Fälle**, null Fehler/Abbrüche/Skips. Syntax (407 JavaScript-/
MJS-Dateien), Stil, lokale Dokuverweise (80 Markdown-Dateien), Schema, Lua-/Plug-in-/Koordinator-/Server-
Verhaltenstests, Medienprüfung, Größenbudget, Projekt-/Statusprüfung und Offline-Websiteprüfung bestanden.
Alle **114 gebundenen Programm-/Test-/Konfigurationsquellen** während des Laufs unverändert. Beleg
temp/explorer/b79bfebb-b870-4d5b-b97d-a7343aaf194b/quality-result.json, SHA-256
3e2ee7aeec03b5e7b99fe67efac17fd52e8a0d1c56344b002693230fe513c8da;
Rohlog-SHA-256 26d126d30228c7f2a43eeca78ff4fa934551fc5fcda0fe178320e57dc40f5711.
Sitzung geschlossen, null offene Operationen/Hilfsprozesse. Das bewusst abgebrochene Zwischen-Gate bleibt
mit erhaltenem Rohlog als `interrupted` gekennzeichnet; seine bekannten Prozesse sind beendet und seine
Sitzungsmetadata geschlossen, keine Dateien gelöscht. Nur das neue vollständige Endgate ist Abschlussbeleg.

**Frisch gelesene Betriebsgrenze nach dem Gate:** Nutzerauftrag update-af75a1c2-0508-45cb-88b2-29821b3cf6f8
weiterhin `failed/build`, unveränderte Aktualisierungszeit 08:13:03 MESZ. Aktives Paar weiterhin
publication-b64beeb2-9951-4cf0-ac4e-1a326c5c3e91 mit master-20261003055911210 und
lightroom-fa739bd28ec1e82a0283. Kein produktiver Ersatzauftrag, neuer Master, Paketwechsel oder katalogweiter
Fotoabgleich ausgeführt. Plug-in-Quelle 0.4.24.25; zuletzt native Bestätigung 0.4.24.24. Die native Windows-Steuerung war in diesem Abschluss noch nicht über das vorgesehene Computer-Use-
Skill geprüft; die nachfolgende Prüfung in Abschnitt 10.23 korrigiert diese Nachweisgrenze. Abnahme der neuen
Plug-in-Quelle im freigegebenen Testkatalog und der vollständige produktive Wiederanlauf bleiben gesonderte Nachweise.
Die allgemeineren Auditpunkte bleiben gemäß Felix' Reparaturpriorität bis zur praktischen Abnahme zurückgestellt.


### 10.23 Verbleibender Explorerfehler nach Nutzerneustart: Anzeige und echte Wiederanlaufvorschau

Felix meldet weiterhin den Explorerfehler trotz bereits ausgeführtem Beenden und Neustarten. Frisch geprüft:
der neue Electron-Hauptprozess 34460 läuft seit 19:31:43 MESZ aus dem aktuellen Programmordner und hält
selbst den lokalen Port 4177. Kein alter wiederverwendeter Hintergrundserver. Der echte Status zeigt weiterhin
den unveränderten ursprünglichen failed/build-Auftrag update-af75a1c2-0508-45cb-88b2-29821b3cf6f8 vom
11. Oktober, 08:13:03 MESZ. Neue Arten bleiben deshalb gesperrt; ein Programmneustart erteilt keine neue
Aufbau-/FN-Vereinbarung und löscht diesen Fehler nicht. Die aktuelle sitzungsgeschützte lokale Neustartvorschau
liefert HTTP 200, available=true, den richtigen Build job-94caaaca-e7d2-4a3c-89fc-c89fdf45997b und einen
registrierten Katalog. Keine weitere Freigabesperre im heutigen Vorschauumfang.

**Verbliebene Bedienlücke:** Das Datenbankfenster bot neben dem neuen lokalen Aufbau noch „Masteraufbau
fortsetzen“ und einen Checkpointhinweis zum Fortsetzen an. Sein Handler führte zwar bereits zur neuen Vorschau,
nicht in einen ungeschützten alten Resume; seine Beschriftung war dennoch irreführend. Derselbe historische
Quellenbelegfehler wurde mehrfach angezeigt. Neuer Verhaltenstest reproduziert dies auf dem bisherigen Code:
150 Fälle, davon 149 bestanden/1 Fehler; Beleg temp/explorer/aed6ade7-1a27-42b1-af8c-2e3ef803748d/
update-restart-tests-result.json, SHA-256 e8a5bfe1860bf1db241f4e69e50dd19a6ec3a50dd7e152cec5dd29e92f78e16a.

**Enge Korrektur:** Gemeinsames Prädikat für den lokalen Vorschauweg. Die Anzeige erklärt „Letzter Aufbau
fehlgeschlagen · Neuaufbau erforderlich“ und dass der bisherige aktive Bestand erhalten bleibt und ein
Programmneustart keinen Aufbau startet. Für diesen Fall nur der eindeutig bezeichnete lokale Neuaufbau, kein
zusätzlicher Fortsetzenknopf oder falscher Checkpointhinweis. Historischer Fehler einmal; keine grüne
Abschlussbehauptung. Aktuelle separate Quellenfehler bleiben ebenfalls einmal sichtbar. Eine unabhängige
Quellenprüfung fand zunächst einen überdeckten gleichzeitigen Quellenfehler; zusätzliche rote Gegenprobe
151 Fälle/150 bestanden/1 Fehler in 0b1cffe4-ccf7-40a4-93e0-f29b1ef6c527; der Vorrang wurde vor Abschluss
korrigiert. Pausierte passende Schreibstände behalten ihren bisherigen Fortsetzenweg und gesicherten Fortschritt.

Endstand **151/151 Fälle**, Exit 0, null Fehler/Abbrüche/Skips; alle 14 gebundenen Quellen unverändert.
Beleg temp/explorer/6347f934-a1f4-4cd5-901c-10973bb9795e/update-restart-tests-result.json, SHA-256
39dd7ab403ff446079c99abeae38aa7f7096b9cc920adc23622814d0d63dd00f; Rohlog-SHA-256
05393307f5c74b1114b692f944825542a1338bea976a50bd51dd2c558ecb84ec. Sitzung geschlossen. Unabhängiger
lesender Abschlussreview gleicht Beleg und Quellen ab; drei zusätzliche isolierte Gegenproben bestätigen
Altfehler einmal, gleichzeitigen Quellenfehler einmal und erhaltenen 500/1000-Pausencheckpoint. Kein weiterer
konkreter Fehler. Quellbezogenes Go; keine produktive Aufbau-/Aktivierungsabnahme.

**Native Prüfung:** Computer-Use-Skill vollständig gelesen und vorgesehene Windows-Steuerung verwendet.
Die frühere Aussage, native Bedienung sei nicht verfügbar, beruhte auf einem nicht hinreichend geprüften
Zugang und ist damit korrigiert. Aktuellen Quellenstand in das tatsächlich geöffnete Explorerfenster geladen,
Datenbankfenster geöffnet: korrigierte Erklärung, Altfehler einmal, lokaler Neuaufbau und fehlender zusätzlicher
Fortsetzenknopf sichtbar. Den lokalen Weg bis zur kurzen Startbestätigung bedient und abgebrochen. Kein
Ersatzauftrag angelegt, keine FN-Erfassung/Lightroom-Schließung/neuer Aufbau/Paketwechsel ausgelöst.
API-/nativer Beleg temp/explorer/633e2651-0b20-4186-8c9f-282f5a83b93f/native-restart-preview-result.json,
SHA-256 94308134eb974e60c13bbfd73f4b6f240ca2fd450f67ec78180b6567daf94488. Auftrags- und aktive
Veröffentlichungsdatei vor/nach Vorschau SHA-256-identisch; native Ansichten in derselben gebundenen
Sitzung: native-restart-overview.jpg und native-restart-confirmation.jpg. Die ursprüngliche Sitzungsdatei und ihre
Bilder bleiben erhalten; der Endbeleg bindet die unverändert kopierten JPEG-Bildbytes und ihre Herkunft. Dies belegt Vorschau und Abbruch,
keinen erfolgreichen produktiven Neuaufbau.

**Nächste Betriebsgrenze:** Konkrete neue Bestätigung für den vollständigen registrierten Katalogsatz, keine
FN-Zuweisungen/Importe/Katalogwechsel bis zum normalen Schließen, neue lesende SDK-Erfassung und anschließend
lokaler Master-/Suchpaketaufbau samt geschützter gemeinsamer Übernahme angefragt. Laufende Lightroom-Arbeit
soll vorher abgeschlossen sein. Hauptkatalog-Massenkorrektur und allgemeines Audit damit nicht freigegeben.
Plug-in-Quelle bleibt 0.4.24.25, zuletzt native bestätigter Ladestand 0.4.24.24.

Syntaxprüfung mit den vorgesehenen VM-Optionen (407 JavaScript-/MJS-Dateien), Stilprüfung und lokale
Dokumentationsprüfung (80 Markdown-Dateien) bestanden. Der 1.600-Fälle-Gesamtlauf in Abschnitt 10.22
ist der frühere Endstand; für die danach geänderte enge Oberflächenkorrektur gilt der neue 151/151-Beleg
mit nativem Vorschau-/Abbruchnachweis. Kein erneutes vollständiges Gesamtaudit oder produktiver Erfolg daraus abgeleitet.

### 10.24 Freigegebener realer lokaler Wiederanlauf – 11. und 12. Oktober

Felix bestätigt ausdrücklich „Ja, Wiederanlauf und normales Lightroom-Schließen freigeben“ für den
vollständigen registrierten FN-Katalogsatz, neue lesende FN-Erfassung, normales Schließen und lokalen
Master-/Suchpaketaufbau aus vorhandenen Quellen mit geschützter gemeinsamer Übernahme. Nach erkannten
gleichzeitigen Lightroom-Eingaben meldet er „ich habe den aufbau gerade selbst gestartet“. Root startet
keinen zweiten Auftrag. Keine Freigabe für gewaltsames Beenden, neue Anbieterdownloads, katalogweite
Foto-/Keywordkorrekturen, Bereinigung oder Veröffentlichung.

Frische Auftragsdatei: update-43a99435-7839-4b33-af63-e589097845d8, gestartet 20:03:42 MESZ,
decision=rebuild-master, sourceCompleted=true, freshUsageCapture=true; die ursprüngliche Workflow-/
Rezeptbindung bleibt im restartGuard erhalten. Ein bestätigter Katalog, beide Nutzungseinwilligungen
gespeichert. Eigene Anfrage capture-request-8b029898-9712-4280-b411-a58a8e4d55b2 desselben Updates;
normalCloseRequestedAt=20:03:45 MESZ. Die Schließvormerkung ist bereits vorhanden und wird nicht erneut
ausgelöst. Native Lightroom-Ansicht zeigt „FN-Katalognutzung erfassen“. Der neue Auftrag wartet zunächst
in waiting-lightroom/start; buildStarted=false, error leer. Der weiterhin angezeigte failed-Build mit
job-94caaaca-e7d2-4a3c-89fc-c89fdf45997b gehört zum alten Update und ist kein neuer Fehlschlag.

Eigene nur lesende Betriebsbeobachtung in temp/explorer/ac4115aa-f435-448d-b736-94646022247d/:
authorized-restart-observations.jsonl und native-fresh-fn-capture.jpg. Kleine Status-/Auftrags-/Paarbelege,
keine konkurrierende DB-Vollprüfung oder produktive Startwiederholung. Abschluss, neue Buildbindung,
FN-Quittung und Paaraktivierung sind zu diesem Zwischenstand noch nicht nachgewiesen.

Ein Anschlussagent meldete zunächst einen historischen roten Teststand. Frischer Vergleich korrigiert
diese Meldung: seine zehn Anschlussreparatur-Dateien sind SHA-256-identisch zum 151/151-Go unter 10.23;
seit Wiederaufnahme nur lesende Prüfungen. Der historische Testfehler ist kein aktueller Befund.

Zwischenstand 20:11 MESZ: Capture usage-5a794f28-974e-41c7-a6ed-101136bc659b am 20:09:30 MESZ
mit **127.093 Fotos, 6.100 FN-Zuweisungen und 64 genutzten Taxon-IDs**. captureRequestId und
requestRevision stimmen zur eigenen neuen Anfrage; keine alte Quittung neu datiert. Ein normaler
Schließversuch um 20:09:31 MESZ. Lightroom-Fenster verschwunden; der Prozess 9624 ohne Fenster lebt
noch. open=true sperrt deshalb weiterhin den Aufbau. Fensterabwesenheit allein wird nicht als
vollständiges Prozessende oder fertige geschlossene Registrierung gewertet. Dokumentationsverweise
80/80 und git diff --check erfolgreich; keine neue Quellkorrektur oder daraus abgeleitete Funktionsabnahme.

**Katalogabschlussgrenze und sicherer Rückweg:** Danach processes=[] bei weiterhin vorhandenen WAL
(69.652.752 B) und SHM (163.840 B), ohne .lock/-journal. Beide bestehenden Prüfungen sperren diese
Dateiexistenz; allein das Weglassen eines Guards würde den geschlossenen Register-Fingerprint unvollständig
machen. Synthetische nur lesende Agentgegenprobe bestätigt die Sperre, aber keinen aktiven externen Leser.
[SQLite dokumentiert mögliche erhaltene WAL-Dateien und deren Zugehörigkeit zum dauerhaften Katalogzustand](https://sqlite.org/wal.html#the_wal_file).
Keine Datei gelöscht/verschoben, keine SQLite-Schreib-/Checkpointoperation, keine Schutzregel verändert.
Eine gesonderte Windows-Dateinutzungsabfrage konnte wegen deaktivierter PowerShell-Skriptausführung nicht
laufen; Ergebnisbeleg temp/explorer/295bcde4-3465-40b6-8c9e-e527009e736f/catalog-resource-users.json,
SHA-256 6735e57aa9a2e772a4c696f1df4a92eff9cba956b626091aea56e3512f1d0ffc. Keine Richtlinienänderung,
kein daraus abgeleiteter Negativnachweis.

Root öffnet denselben Hauptkatalog kontrolliert erneut, ohne Foto-/FN-/Keywordänderung, und wählt nativ
Datei → Beenden → Ja. Die vorhandene wöchentliche Lightroom-Sicherungsabfrage wird ausschließlich diesmal
übersprungen; weder Sicherungsplan geändert noch zusätzliches NAS-Großarchiv angelegt. Anschließend fehlen
alle vier Arbeitsdateien: Lightroom stellt den Abschluss selbst her. Die Erfassungs-/Schließzeiten werden
nicht umgestempelt und keine zweite automatische Schließanforderung erzeugt.

**20:19:06 MESZ:** Neue Anfrage abgeschlossen und geschlossen registriert. Registryrevision
837dcb05c82d073d4305e5e17c81615f34a4d9c713c7c41073f2e230425dc524; Lightroom open=false,
usageReady=true, ein erfasster Katalog. Workflow building/build, error leer, lokaler Aufbau läuft.
Die erste Eingangsaufbereitung zeigt noch den alten failed-Buildjob eines anderen updateRunId; dies ist
kein neuer Fehler. Die ungeeignete Anzeige alter Fortschritts-/Fehlerdetails bei neuem noch nicht gebundenem
Buildjob bleibt als enger UI-Befund für die anschließende Korrektur erfasst. Noch keine gemeinsame Aktivierung.

**Pause, Computerneustart und eigene Fortsetzung – 12. Oktober:** Felix meldet, gestern den Aufbau
pausiert und den Computer heruntergefahren zu haben, und setzt ihn selbst fort. Frische lesende Prüfung
des gespeicherten Auftrags bestätigt denselben update-43a99435-7839-4b33-af63-e589097845d8 und Folgejob
job-f1dc67ac-741e-4edd-a35d-3831a7119311. Pause gespeichert am 11. Oktober um 21:54:43 MESZ;
Fortsetzung am 12. Oktober um 15:14:08 MESZ, neuer Workerstart 15:14:10 MESZ. Root startet keinen
zweiten Lauf. Die zunächst noch gestrige paused-Workerdatei wird nach der erneuten Eingangsprüfung
automatisch durch building ersetzt; diese frühe Differenz zum schon fortgesetzten Workflow ist kein
zusätzlicher Fehlbefund.

Lesender Anschlussreview belegt den gestern bereits erreichten ersten Kandidaten master-20261011182313311:
erstellt 20:23:13 MESZ, Manifest zuletzt geschrieben 21:12:26 MESZ. Dort Identitätskontinuität für sämtliche
273.480 vorherigen IDs geprüft, fehlend 0; noch 187 Klassifikationsfälle. Danach eigene automatische
Folgerevision b18b1536fbbdb026736649187f7a8cac53db99b6ca7b7a374ac3863ac961b7ef gespeichert,
automaticProtected=0 und eigener Folgejob angelegt. Das ist keine Abnahme seines heutigen Endergebnisses.
Aktuelles Folgerezept e71cccf45313357aff3789097bc2131e45787150ac59c630d3a6e9136768a146
bindet 64 genutzte geschützte Master-IDs und die gespeicherten Identitätsereignisse. Das Erstmanifest mit
anderer buildJobRevision wird nicht als Nachweis des fertigen Folgeaufbaus verwendet.

Der pausierte Folgejob hatte gestern keinen gespeicherten Schreibcheckpoint und zunächst keinen
candidate-Unterordner. Damit keine belegte bestätigte 500er-Schreibgruppe für diesen Pausenstand.
Die Fortsetzung prüft seine erhaltenen Eingänge erneut und bereitet sie auf. Um 15:23:58 MESZ jetzt
Masterdatenbank schreiben; gespeicherter Checkpoint 37.000 von 273.485, aktueller Fortschritt 38.000;
error leer. Die Fortschrittsanzeige kann dem zuletzt bestätigten Schreibblock voraus sein.
Eigene FN-Anfrage weiterhin abgeschlossen,
Nutzungsrevision 837dcb05c82d073d4305e5e17c81615f34a4d9c713c7c41073f2e230425dc524,
Lightroom geschlossen. Aktives produktives Paar weiterhin vom 3. Oktober, neue Artanlage gesperrt.
Nur lesende aktuelle Beobachtung unter temp/explorer/a5438571-5525-4d4a-ab7a-0cae3ac0838c/;
native-local-build.jpg belegt die tatsächlich geöffnete Zwischenansicht vor dem Quellen-Neuladen.

**Katalogabschluss-Hinweis lokal korrigiert:** Wenn kein Lightroom-Prozess mehr existiert, aber
Arbeitsdateien zurückbleiben, nennt die Status-/Warteanzeige nun den fehlenden Katalogabschluss.
workingFiles wird als Statusfeld ausgegeben; die bestehende open-/Frische-/Request-/Bind-/Schließlogik
bleibt erhalten. Alle vier Dateisuffixe, eigene neue noch nicht registrierte Erfassung sowie eine nach
Bindung auftauchende Arbeitsdatei sind mit Vorher-/Nachherfällen geprüft. Roter Vorbeleg: 8 Fälle,
5 bestanden/3 Fehler, temp/explorer/b0601f08-855c-4363-909d-8d8315732313/close-status-tests-result.json,
SHA-256 007f995f690ae7a0f24896071e0e0ae9f355ec33dd7b05693de3be7ced43c413.
Endbeleg 15:22:30 MESZ: **8/8**, Exit 0, keine Fehler/Abbrüche/Skips, beide Quellen unverändert;
temp/explorer/a4ec1ada-3cb1-4b9e-a492-1cfcf304dcff/close-status-tests-result.json, SHA-256
beb31729c306d1e879baabf0b2f28e5044ec9c62a7cc4c65d08ff7204424a349. Sitzungen geschlossen.
Keine Dateien gelöscht, kein Katalog geöffnet oder Prüfsummenscan im Polling. Der laufende Server wird
während des Aufbaus nicht neu gestartet; neue Backend-Meldung erst nach regulärem Programmneustart geladen.

**Enge Fortschrittskorrektur integriert:** Die im Ersatzauftrag exakt gebundene alte failed-/stale-Job-ID
mit anderer updateRunId wird während der neuen FN-/Lightroom-Wartephase und vor dem eigenen Rezept nur
für die Darstellung ausgeblendet. Keine alte Fehler-/Schreibcheckpointanzeige als neuer Fortschritt; neue
Vorbereitung zeigt Schritt 2, Warte-Pausenknopf „Updateauftrag pausieren“. Eigene aktuelle Jobs, deren
Checkpoints, Workflowfehler und gesonderte Quellenfehler bleiben sichtbar. Aktivierungsprüfungen benutzen
weiterhin den unveränderten Rohstatus. Roter Vorlauf 101 Fälle/96 bestanden/5 Fehler in d6996802-1146-4838-a128-f5e22d9aa1c6,
SHA-256 65bd1a718431b7d9aeadc4bd7fd4696e0145689b0360cf00b40a628726a910a2;
erster grüner Stand 101/101 in cfa19b64-0d87-43d7-85f8-14885b77013f, SHA-256
05c2a722e34ca2e219bb2053024d271d5dac0a6a456ea32531b4382e7fd454bb. Jeweils progress-ui-result.json
im eigenen temp/explorer-Verzeichnis, Sitzungen geschlossen.

Die reale native Zwischenansicht und unabhängige Quellprüfung belegen zusätzlich eine widersprüchliche
Anweisung: Der Erstkandidat fordert noch 187 Entscheidungen, obwohl der eigene Folgeaufbau bereits die
gespeicherte automatische Entscheidung verarbeitet. Neuer reiner Anzeigehelfer bindet diesen Zwischenstand
an aktiven building/build-Workflow, eigenen building-Job, gleiche nichtleere Folgerevision/Identitätsrevision,
pending=true, candidateIncludesCurrent=false und genau diesen alten Kandidaten in der Versuchshistorie.
Dann „187 Klassifikationsfälle gehören zum vorherigen Kandidaten. Der laufende Folgeaufbau verarbeitet
die gespeicherte Entscheidung.“ Weitere echte Konflikte bleiben sichtbar: 189 Gesamtfälle/187 alte
Klassifikationsfälle ergeben weiterhin 2 Fälle mit Entscheidungsbedarf. Bei neuer Kandidaten-ID, falscher
Revision, fremdem Job, widersprüchlichen Zahlen oder echtem Fehler keine Überdeckung. Verhaltenstest
bestätigt weiterhin die verweigerte Aktivierung während des Folgeaufbaus.

Rote Zusatzprobe 104 Fälle/102 bestanden/2 Fehler in deadf62e-08bc-4e01-b242-4ee3204eb97a,
SHA-256 66c32f383444cb9e0e11cf000fdb03cdaed8876579783f3d22700a6dd28f88c9.
Grüner UI-Endstand **104/104** in 70e79897-088b-43c9-96e3-3bc1bd31f716, SHA-256
bc817c92374230a7b0f1876a5cb6794926da57268456d416b4f521b8d6e8e7a8; Log-SHA-256
91ac62ea2f3463d86b880bc3ccc279ea7f73de45cc160d2c7a6cb4ed7e20c14b. Zwischen Rot und Grün
zusätzliche positive Gegenprobe für mehrere historische Kandidaten ergänzt; die Testquelle ist daher nicht
als bytegleich behauptet. Sechs UI-/Testquellen während des Endlaufs stabil, 41 Aufbau-Regelquellen gegenüber
der eigenen Vor-Edit-Aufnahme unverändert. Kein Backend-/Plug-in-/CSS-/Squarespace-Edit durch den Agenten.

Root integriert anschließend Wiederanlauf-, Koordinator-, FN-Anfrage-, CloseGate-, Fortschritts-, Datenbank-,
Master-, Dashboard- und Routerprüfungen: **224/224**, Exit 0, keine Fehler/Abbrüche/Skips, alle **20**
Programm-/Test-/Konfigurationsbindungen stabil. Beleg vom 12. Oktober, 15:32:01 MESZ:
temp/explorer/c173930b-9a2f-465d-807b-229c70bc66b2/update-restart-tests-result.json, SHA-256
3b894e6732f14010fef9da0d07d12e01e03caeebe91cb223271830564fc85754; Log-SHA-256
e00d338d17702bd73b606c662ef371e92acd2c15e6c97b96632c8553c171dcff. Eigene Sitzung geschlossen,
keine Helfer/Operationen offen. Unabhängiger lesender Endreview bestätigt letzte UI- und Gatequellen,
104/104- und 8/8-Belege samt Rohlogs und erhaltene Schutzgrenzen; kein weiterer enger Quellfehler.
Syntax (407 Dateien), Stil und lokale Dokuverweise (80 Markdown-Dateien) bestanden. Das vollständige
1.600-Fälle-Gate unter 10.22 bleibt der frühere Stand; kein neuer vollständiger Gesamtlauf aus den 224 Fällen abgeleitet.

**Native Neuladeabnahme:** Nur die Exploreroberfläche neu geladen, den laufenden Server/Worker nicht
beendet. Datenbankfenster geöffnet; neuer Zwischenhinweis zu den 187 Fällen vollständig sichtbar,
eigener realer Suchindexfortschritt und bestätigter Schreibstand weiterhin vorhanden. Kein Start, Pause,
Retry, Erfassung oder Aktivierung durch diese Ansicht ausgelöst. native-restart-result.jpg in der laufenden
Belegsitzung a5438571-5525-4d4a-ab7a-0cae3ac0838c belegt diese korrigierte Zwischenansicht, trotz seines
Dateinamens ausdrücklich keinen fertigen Updateabschluss. Die historische Wartephasen-Zuordnung ist
isoliert getestet; heute keine zusätzliche neue FN-Wartephase nur für eine Sichtprüfung erzeugt.

**15:46 MESZ – neues eigenes Manifest, noch kein Paarabschluss:** Im Kandidatenverzeichnis des laufenden
Folgejobs liegt nun master-20261011193245272 mit genau dessen buildJobRevision e71cccf45313357aff3789097bc2131e45787150ac59c630d3a6e9136768a146.
Manifestprüfung meldet 273.489 Taxa, Identitätskontinuität für sämtliche 273.480 vorherigen IDs, fehlend 0,
Inhaltsprüfung gültig, Klassifikationsprüfung 0 und 187 zurückgestellte Gegenstücke. Folgerevision b18b1536…
ist enthalten. Dies ist ein lesender Vergleich der integrierten Buildbelege, keine zusätzliche unabhängige
DB-Vollprüfung oder Freigabe. Workeranwesenheit um 15:45:58 MESZ bestätigt, Status weiterhin building;
temp/explorer/e1105949-ee94-4550-bd51-eb8e2578dc8b/resumed-worker-presence.json, SHA-256
750aea4e828d0a1d6a85e8fe10d2e590691499367fff7193be52040e643a3a36. Keine Prozesse verändert.
Die weitere Abschlussprüfung bleibt an den tatsächlichen ready-Job und die gemeinsame neue Veröffentlichung gebunden.

**15:48:43 MESZ – neuer tatsächlicher Übergabefehler A-39:** Der eigene Folgeworker beendet sich mit
failed und EPERM beim ersten Umbenennen von D:\Arten-Explorer\Daten\taxonomy\master\staging nach
.staging-old-3cfd42fd-af3b-4ad9-86b4-267e10aeefbf. candidate/manifest.json, build-inputs.sqlite,
taxonomy-master.sqlite und der vollständige Checkpoint bleiben im eigenen Job erhalten. Aktives
Master-/Suchpaketpaar weiterhin unverändert. Die zuvor belegte Workeranwesenheit und das Kandidatenmanifest
sind Zwischenbelege und werden nicht zum abgeschlossenen Update umgedeutet.

**Fehlzuordnung A-40:** Gleichzeitig Workflow waiting-decisions/build mit „187 relevante
Aktualisierungskonflikte benötigen eine Entscheidung“, error leer. Frische Rohbeobachtung 15:52:03 MESZ
zeigt dagegen master.status=failed, active=false und denselben EPERM im eigenen failed-Buildjob,
canResume=true. lifecycle.candidate ist weiterhin Erstkandidat master-20261011182313311 mit
buildJobRevision 3f8de269… und 187 Fällen; der neue eigene Manifeststand hat e71cccf4…, Prüfgruppe 0
und die gespeicherte Folgerevision. Enge technische Reader-/Übergabe- und Koordinatordiagnose mit getrennten
Agenten beauftragt. Keine neue Entscheidung, kein zweiter Produktivstart, Löschen oder erzwungenes Beenden
aus diesem falschen Workflowhinweis. Der reale gemeinsame Abschluss bleibt offen.

**Windows-Gegenprobe und unveränderte Fortsetzungsgrundlage:** Tatsächliche
buildTaxonomyMasterCandidate-Funktion unter Windows mit zehn künstlichen Taxa und zweitem regulär
gestartetem readOnly-SQLite-Prozess geprüft. Der offene Leser erzeugt genau EPERM beim ersten
staging-Verzeichniswechsel. Alter staging- und neuer privater Kandidat bleiben byteidentisch erhalten,
Checkpoint 10/10. Nach normalem Schließen des Lesers (Exit 0, kein Signal) gelingt dieselbe Fortsetzung
mit identischem Checkpointvertrag und unveränderter Kandidaten-SQLite, ohne erneutes Taxon-/Suchindexschreiben.
**11/11 Prüfungen**, eigene Sitzung geschlossen, keine Helfer offen; Beleg
temp/explorer/9941ad35-3616-4c67-83cc-9acb7ddf002a/native-staging-reader-result.json, SHA-256
e38ff5cb9951f9feedb0a4a554e40cac0762b3c5072ca60bab7938ed6025d4d8. Konkreter produktiver
Sperrhalter nicht bewiesen. Der zunächst blockierte Sandbox-realpath-Zugriff ist ein getrenntes
Werkzeugproblem; erfolgreiche Probe über den regulären Approvalpfad, keine Windows-/Policyänderung.

Frische kleine Produktiv-Metadatenprüfung vor der erneuten Fortsetzung: eigener Auftrag/Job/Rezept,
vollständiger gespeicherter Schreibstand **273.485 Einträge**, Kandidaten-Rezeptbindung,
273.480 erhaltene bisherige IDs/0 fehlend, gültiger Inhalt, 0 offene Klassifikationsfälle,
enthaltene gespeicherte Folgerevision, unverändertes aktives Ausgangspaar sowie geschlossenes Lightroom
mit eigener aktueller FN-Nutzung bestätigt. Alle 41 Regeldateien ergeben weiterhin exakt
recipe.binding.rules=cb8ae3c164b0ffaef7332ca026d1c9d443e87098c8b9d5363ce08a0d17441c18.
Beleg temp/explorer/2361c220-eb74-4b96-98dc-7f2be32c6868/checkpoint-resume-inputs.json,
SHA-256 d542a0214f1970fdddae2c6f0a298368fa12299664dc0922b4356a11def6154f.
Keine Datenbank geöffnet/gescannt; vollständige erneute Eingangsprüfung bleibt dem geschützten
Fortsetzungsweg vorbehalten. Früherer lesender API-Beobachter regulär beendet; sein Journal bindet
16c76ef6a7bd2816e9d4fb4d33f9fe194d4c1947a5dbfd0c65c93a7bb777d9f7.
Explorer bei fehlgeschlagenem, beendetem Worker regulär geschlossen; erneutes Laden erst nach dem
engen Koordinator-Go. Noch keine weitere produktive Fortsetzung oder erfolgreiche Übergabe behauptet.

**Koordinator-Go und erneute Betriebsaufnahme am Abend:** Eigener failed-/paused-/interrupted-/building-Job
wird vor jeder Kandidatenentscheidung geprüft. Ein konkreter EPERM bleibt erhalten; ein alter Kandidat kann
keinen laufenden Folgejob in waiting-decisions überführen. Pausenhinweise im gespeicherten error-Feld
bleiben Stopzustände. Ready verlangt eindeutigen eigenen Zustands-/Kandidatenbeleg; bei älteren Zuständen
ohne candidateId nur begrenzt das eigene Rezept, keine Datenbankprüfung pro Poll. Vorher 90/92 Fälle,
zusätzliche Pausengrenze zunächst 103/110; Endstand **110/110**, Beleg
temp/explorer/6a2545a3-d170-4d98-aa45-0b765cf63301/coordinator-readiness-result.json, SHA-256
8179b846a4d0d957dfb897dee83d6c8fc52e8189a42ab5a0aebdb2165280280f. Root integriert
**244/244**, Exit 0, keine Fehler/Abbrüche/Skips, alle 20 Bindungen stabil; Beleg
temp/explorer/c5f64fc3-a6d0-4a8a-8292-b912f346cb4a/update-restart-tests-result.json, SHA-256
cf8df2ff6caaca91aaf50037a5cf85b7408243956b31704d3a958ddd87880a52. Unabhängiger lesender
Nachreview bestätigt genau diese Quellen und Belege; kein produktiver Abschluss daraus abgeleitet.

Explorer regulär neu gestartet. Geschützte eigene Fortsetzungsanforderung einmal ausgeführt, Beleg
temp/explorer/4b3eadc9-04a5-4b6b-8664-932e0023900e/own-checkpoint-resume-request.json, SHA-256
345e20006c2e2d0cb706d1cfbc66d5a95d06445aa0d55c11ca903d6746b71e24. Lightroom war inzwischen
wieder geöffnet; der Auftrag wartet zunächst korrekt auf Lightroom. Nach der freigegebenen lesenden
Prüfung der neun Nutzerordner regulär Datei/Beenden bestätigt und wöchentliche Sicherung ausschließlich
diesmal übersprungen. Lightroom-Fenster anschließend nicht vorhanden; keine Foto-/FN-/Keywordschreibaktion
durch Root. Jetzt waiting-usage/resume-build mit „Aktueller FN-Nutzungsnachweis erforderlich.“

**Neue echte Bindungslücke:** Nutzerzuweisungen am 12. Oktober nach der Erfassung vom 11. Oktober sind
im Katalog belegt. Die alte geschlossene FN-Quittung ist daher veraltet. Ein neuer Nachweis ändert
registry/captures-Fingerprints und macht das alte Rezept unpassend. Auch die noch nicht aktivierten
automatischen Klassifikationsereignisse verlangen bisher die alte Nutzungsrevision. Der vorhandene
Neustartweg erlaubt noch keinen eigenen erhaltenen Kandidaten in waiting-usage/resume-build. Geschützter
Ersatzlauf mit neuer eigener Anfrage und erneuter expliziter Schutzprüfung der bisherigen Ereignisse
in Arbeit; alte Quittung, Ereignishistorie, Rezept und Checkpoint werden nicht umgebunden oder neu datiert.
Die vorherige geschlossene Frischeprüfung war ein datierter Zwischenstand und belegt nicht die heutige Frische.

**Windows-Übergabekorrektur, noch keine produktive Abnahme:** Bei EPERM/EBUSY/EACCES höchstens acht
Wiederholungen nach dem ersten Versuch, Wartezeiten 60 bis 480 ms, derselbe zufällige Backup-Pfad.
Andere Fehler sofort. ENOENT ist ausschließlich beim optionalen bisherigen Ziel erlaubt. Fehler beim
Installieren stellen den Vorgänger zurück; scheitert auch die Rückstellung, werden beide Ursachen und
beide erhaltenen Pfade gemeldet. Backupbereinigung liegt nach erfolgreichem Wechsel außerhalb der
Rückstellung, damit ein Bereinigungsfehler keinen alten Stand über den bereits installierten neuen bewegt.
**9/9** isolierte Verhaltensfälle. Native Windows-Gegenprobe mit künstlicher SQLite-Datei und eigenem
readOnly-Prozess: dauerhafte Sperre stoppt begrenzt und erhält beide Dateien; normale Leserfreigabe
während der Wiederholung erlaubt denselben Wechsel ohne Neuschreiben. **7/7**, Sitzung geschlossen,
temp/explorer/779e6843-1269-4df0-b76c-901dedb60a48/native-handoff-retry-result.json, SHA-256
85939c33d7ce3f855a8a5d37fb4c51ebd92584e12ce19b25074bfc6e1a114b5c. Diese bewusste Änderung
einer Aufbau-Regelquelle gilt für neue Rezepte; kein Fortsetzungs-Go für das unveränderte alte Rezept.

**Geschützter Ersatzlauf – Quellabschluss am 13. Oktober:** Der Ersatzweg unterstützt jetzt den eigenen
fehlgeschlagenen Folgeaufbau mit veralteter FN-Nutzung in waiting-usage/resume-build und eindeutig zum
selben Ursprung gebundenem erhaltenem Kandidaten. Der neue Auftrag bindet ursprüngliches Rezept,
Quellen, Projekt-/Korrekturstände, vollständigen Katalogsatz und genaues Erneuerungsziel. Erst eine neue
eigene geschlossene FN-Quittung erlaubt den erneuten Schutzvergleich der noch nicht aktivierten
Identitätsereignisse. Ein gesonderter verketteter Nachweis wird angehängt; alte Ereignisse/Quittungen,
Workflowhistorie, Rezept und Checkpoint bleiben unverändert. Neu verwendete betroffene IDs, eigene
Entscheidungen, Quellenänderungen oder fehlende Nachweise stoppen den Weg.

Koordinator-/Neustartgruppe **127/127**, Klassifikationsgruppe **65/65**; Belege
temp/explorer/4bb550eb-1e2b-443e-ae60-6ba259491489/ und
temp/explorer/93f96376-f88d-4806-9a69-444c127f756a/.
Unabhängiger lesender Endreview prüft Rohlogs, Prüfsummen und finale Quellen sowie Service-/Serverbindung:
kein Quellblocker. Root prüft den integrierten Endstand am 13. Oktober erneut: **362/362**, Exit 0,
keine Fehler/Abbrüche/Skips, alle 28 Quellen-/Konfigurationsbindungen stabil. Beleg
temp/explorer/006f3ae9-4e76-4223-addc-88e80271330d/update-restart-tests-result.json, SHA-256
a2293de3f2aed322edc4b93d80a890d000fb1f9b8865f3fb082bea6cf616f023;
dies ersetzt weder neue SDK-Erfassung noch produktiven Paarabschluss.

Explorer am 13. Oktober regulär geschlossen und mit diesen Quellen neu gestartet. Die automatische
Freigabeprüfung lehnt zunächst einen nicht eindeutig im Textbaum verifizierten Klick im Lightroom-
Beendigungsdialog ab. Frischer Screenshot bestätigt Ja als fokussiertes Ziel; normale Bestätigung gelingt
per Eingabetaste. Das einmalige Überspringen der folgenden regulären Katalogsicherung wird gesondert
abgelehnt, da die Schließfreigabe dieses Auslassen nicht ausdrücklich umfasst. Stattdessen wird die
angebotene reguläre Katalogsicherung ausgeführt; Sicherungsplan/Ordner und Optimierungsoptionen bleiben
unverändert. Kein erzwungenes Beenden, keine Arbeitsdateien gelöscht, keine FN-/Keywordschreibaktion.

**Vollständiges lokales Endgate am 13. Oktober, 15:37:20 MESZ:** quality:ci mit Exit 0, alle **50 Testgruppen**,
**1.701 Fälle** bestanden, keine Fehler/Abbrüche/Skips. Syntax, Stil, lokale Dokuverweise, Schema,
Audio-/Asset-/Größenprüfung, Projekt-/Statusabgleich und isolierter Websiteaudit erfolgreich. Alle **118**
gebundenen Programm-/Konfigurationsquellen während des Laufs unverändert. Beleg
temp/explorer/8e92ff38-8af0-4908-9bf2-c1eadf56a968/quality-result.json, SHA-256
10ef5f81c665fc965d0f06e9c2442ca61ea80f108b704afb4bd3eed8b014ef2a; Rohlog-SHA-256
9c13f0c7c220b14e98a064af2b34d5c45793f2d00f98d7a0c6276a867f964f53. Sitzung geschlossen.
Windows-Übergaberegression jetzt auch im regulären Master-Testskript enthalten. Kein Live-/Pagescheck,
Commit, Push, Deployment oder produktiver Paarabschluss aus diesem Gate abgeleitet.

**15:46 MESZ – regulärer Abschluss und tatsächlicher Ersatzauftrag:** Lightroom beendet sich nach seiner
angebotenen Sicherung. Nur die normale Katalogdatei vorhanden, keine lock/wal/shm-Arbeitsdatei.
Auftrag wieder waiting-usage/resume-build. Geschützte Vorschau/Bestätigung einmal ausgeführt:
neuer update-337cbac5-9664-4c8f-af6f-1f5b4d09a57c, eigene Anfrage
capture-request-b8d76e48-66d7-4a8d-9267-a043f9749d07. Normales Schließen ausdrücklich für diese
neue Anfrage vorgemerkt. Alle **9/9 Nachbedingungen** bestätigt: Ursprungshistorie exakt erhalten,
altes Rezept und aktives Paar unverändert, neue eigene Update-/Requestkennung, identischer vollständiger
Katalogsatz, kein Aufbau vor neuer nativer Erfassung, eigene Schließabsicht und gebundenes Schutzprüfziel.
Beleg temp/explorer/722a5480-759e-4fdb-ad63-da593c71dd1b/protected-usage-replacement-request.json,
SHA-256 8aa2461a7487d13f838452ca3b589cb4b5376219374e7531e6898eb3408ed2cb.
Nur kleine Metadatendateien werden anschließend beobachtet, keine API-/DB-Polls im Beobachter:
temp/explorer/ba6e4654-870f-487d-8c6d-4fbb2727d4e0/protected-replacement-observations.jsonl.

Beim regulären Wiederöffnen zeigt Lightroom zunächst „Katalog schreibgeschützt/nicht verwendbar“.
Lesende Gegenprüfung: tatsächliches IsReadOnly=false, normale vorhandene Rechte, rund 100,5 GB frei
auf D:, genau ein Lightroom-Prozess; Arbeitsdateien stammen vom neuen Öffnungsversuch. Keine
Rechte-/Dateiänderung. Einmaliger regulärer Dialogweg „Erneut versuchen“ öffnet denselben Hauptkatalog
erfolgreich. Die anschließende native Ansicht bestätigt laufende **FN-Katalognutzung erfassen**.
Konkrete Ursache des ersten Öffnungsversuchs nicht nachgewiesen; keine verlorenen oder falschen FN-Daten
daraus abgeleitet. Native Erfassungsquittung und neuer Paarabschluss noch offen.

Zusätzlicher lesender A-39-Quellenreview findet keinen dauerhaft gehaltenen Staging-SQLite-Reader:
Kandidaten-/Identitätsprüfungen schließen im finally; Erneuerung schließt aktive/Staging-Leser vor
Fingerprints; Wiederverwendungsleser gehört zum aktiven Vorgänger und wird vor Übergabe geschlossen.
Lang lebende Explorer-/SDK-Suchcaches gehören zum aktiven Master/Suchpaket, nicht zum Stagingordner.
Kurzzeitige Kandidatenleser können Windows-Renames während des Aufrufs behindern. Der konkrete frühere
produktive Sperrhalter bleibt unbewiesen; keine dauerhafte Sperre aus diesem Quellreview erfunden.

**Frische Erfassung und Schutzabschluss – 13. Oktober:** Neue SDK-Quittung
usage-c9eac2d5-5132-4351-82fc-75e4607f9f1f um **15:55:48 MESZ** gespeichert: 127.093 Katalogdateien,
6.110 mit FN-Taxonomie, 64 verwendete Master-IDs. Normales Schließen für genau diese neue Anfrage
automatisch um 15:55:56 angefordert. Der erste Eingabetastenversuch ließ die Adobe-Rückfrage stehen;
nach frischer Vordergrund-/Textprüfung eindeutig ausgelesene Ja-Schaltfläche bestätigt. Anschließend
Lightroom tatsächlich beendet, keine Arbeitsdateien. Neue geschlossene Nutzungsrevision
be721a6ab849dd932656cc43375355bc7f70657f3007afaeea698bacbdb4a670 um **16:00:01 MESZ** registriert.
Keine zweite Erfassung, alte Quittung nicht neu datiert, keine FN-/Keywordschreibaktion durch Root.

Die Vorbereitung zeigt während der folgenden erneuten Schutzprüfung weiterhin die vorherige Wartemeldung,
obwohl Lightroom bereits geschlossen und die neue Nutzungsrevision im Workflow gespeichert ist. Dies ist
ein offener enger Fortschrittsbefund; kein daraus abgeleiteter Erfassungs- oder Datenfehler.
Unabhängige kleine EXPLAIN-/Indexprobe bestätigt zehn tatsächliche Abfragepläne je Master-Slot: große
Einzelabfragen indexiert. Einziger Scan master_decision; beide bestehenden vollständigen Manifestprüfungen
melden decisions=0, kein neuer produktiver Countscan. Hauptdateistempel vor/nach Probe unverändert,
Reader regulär geschlossen. Beleg temp/explorer/888d7f2f-dd1c-4221-a18d-68007b65b360/
renewal-query-plan-result.json, SHA-256 f1f75e69152934cfa256d76f9f3c0cd03b93443ebbfa7ec6b7d5d3b52df39262.

Reine stat-/begrenzte Manifestprobe ergibt **23.429.878.252 Bytes** Kern-Fingerprints pro neuer
Erneuerungsvorschau beziehungsweise Speicherung: 11,08 GB CoL, 6,02 GB aktiver Master, 6,01 GB erhaltener
Kandidat und rund 0,32 GB Anbieter. Beide Übergänge prüfen vollständig, zusammen rund 46,86 GB zuzüglich
Katalognachweis. Kein aus dem kumulativen Prozesszähler abgeleiteter Vollscan pro Statuspoll: der lesende
Quellreview bestätigt lightweight-Kandidaten-/Zustands-/Paketstatus ohne Integritätsprüfung oder volle
Masterhashes pro Poll. Beleg temp/explorer/c05c2eec-6cc7-47e9-9d8c-816511383c25/
renewal-fingerprint-inputs-result.json, SHA-256 53b15778c0e0686d768ed298ee77cd541d29d5cdb514e2ccae1581c9625566f9.
Keine weitere Performancekorrektur aus diesem Negativbefund abgeleitet.

Um **16:15:28 MESZ** Workflow building/build, error leer. Erneuter Schutzvergleich gespeichert als
5870ace84e7c5e10a4a03510a32bf56d6cc00f7cfbdb2467d1e4eedf2d5ea262; ursprüngliche Ereignisse und
Kandidatenherkunft erhalten. Der eigene neue Aufbau bereitet die vorhandenen lokalen Eingänge vor.
Der aktuelle Buildzeiger kann in dieser Vorbereitung noch auf den alten f1dc-Job zeigen; daraus kein
neuer eigener Fehler/Checkpoint. Neue Rezept-/Workerbindung und gemeinsamer Paarabschluss bleiben offen.

**Enger Zwischenhinweis lokal korrigiert:** Vor der erneuten Schutzprüfung speichert der Koordinator nach
erfolgreichem geschlossenen FN-Nachweis jetzt waiting-usage und „FN-Nachweis registriert. Gespeicherte
Entscheidungen werden erneut geprüft.“ Die vorhandene Phase bleibt erhalten. Kein neuer Status/Timer/
Freigabeweg; Schließen während der Hinweisspeicherung verhindert den anschließenden Erneuerungsaufruf.
Roter Ausgangsfall **0/1**, grüner Koordinator-/Neustart-Endstand **129/129**, keine Fehler/Abbrüche/Skips;
Syntax und Diffprüfung bestanden. Belege
temp/explorer/d40d3a69-2b5f-48cf-899c-87a29d962396/coordinator-renewal-status-red-result.json,
SHA-256 bf237dbf1ee81d2755ddd71150a5262961b3d3934a195be4be1e00037c10e173, und
temp/explorer/1b367a4f-b636-4067-86c6-8a4d09594da7/coordinator-renewal-status-green-result.json,
SHA-256 e51fd5fb81dd7c8c73bb9c695057de16d0a007d40d0338adb145d64c5744a73d.
Alle 41 Aufbauregeldateien vor/nach unverändert, Revision
ba4562c345c83413a3fdb0ab082a26107ffcff8a8b0f6c52eadcca3f3190a53b. Laufender Server/Worker bleiben
unverändert; die neue Koordinatoranzeige gilt nach regulärem Neuladen für zukünftige Übergänge.

Root integriert die endgültige Hinweiskorrektur erneut mit allen betroffenen Wiederanlauf-/FN-/Master-/
UI-/Übergabefällen: **364/364**, Exit 0, keine Fehler/Abbrüche/Skips, 28 Quell-/Konfigurationsbindungen
stabil. Beleg temp/explorer/7fa52039-5091-4078-8098-3380878c0436/update-restart-tests-result.json,
SHA-256 60b179d603dd1174b3b74b53f7c1ff168613a3afa903dae8c5bd43c0fae5dc2b. Sitzung geschlossen.
Das vollständige 1.701-Fälle-Gate oben beschreibt den Stand vor diesen drei Koordinatorprogrammzeilen;
kein aktualisierter Gesamtzähler oder native Abnahme dieser neuen Wartemeldung daraus abgeleitet.
Um **16:31 MESZ** eigener Aufbau weiterhin aktiv/error leer, Eingangsstand gesichert und jetzt relevante
CoL-Taxa lesen. Alter Buildzeiger während der Vorbereitung unverändert; neuer Worker noch nicht behauptet.

**Endgate des endgültigen Quellstands – 13. Oktober, 16:40:18 MESZ:** quality:ci erneut nach der engen
Koordinator-Hinweiskorrektur erfolgreich, Exit 0, **50 Gruppen / 1.703 bestandene Fälle**, keine Fehler,
Abbrüche oder Skips. Alle 118 gebundenen Programm-/Konfigurationsquellen während des Laufs unverändert.
Beleg temp/explorer/60137712-9df3-406d-a333-ce767a726058/quality-result.json, SHA-256
6e692390b969c818de5982775311edb94f03e825aaf1549ffa8e526e5ba97e6a;
Rohlog-SHA-256 5979cc47e9d618411957868038c0fab03f6da2db6ebc6a762b9d2f3c7c5953b0.
Eigene Sitzung geschlossen. Der echte Aufbau läuft daneben weiter; kein produktiver Abschluss daraus abgeleitet.

Lesende kleine Jobmetadatenaufnahme zeigt den bereits vorbereiteten neuen Ordner
job-d72503b6-edc4-4de5-8719-afe9c78cb837: angelegt 16:23:31 MESZ, CoL-Spool fertig 16:30:09,
Anbieterspools 16:30:21. Nur Dateigrößen/-zeiten gelesen, keine Spool-/DB-Prüfsumme oder Inhaltsprüfung
im Beobachter. Rezept und eigener current-Zeiger noch nicht geschrieben; der Ordner allein beweist keinen
gestarteten Worker. Ein einzelner lesender Host-Statusaufruf während dieser Aufbereitung erreicht sein
15-Sekunden-Zeitlimit. Dies ist kein gespeicherter Auftragsfehler und keine Freigabe zum Zweitstart.

**Übergang in den eigenen Worker – 13. Oktober, 16:55:46 MESZ:** Die erneute Eingangsprüfung ist
erfolgreich abgeschlossen; recipe.json und current.json binden jetzt ausdrücklich
job-d72503b6-edc4-4de5-8719-afe9c78cb837 an update-337cbac5-9664-4c8f-af6f-1f5b4d09a57c.
Der Worker schreibt seinen eigenen Kandidaten. Kleine Zustandsaufnahme um 17:03:35 MESZ:
building, „Aufbaueingänge sichern“, 419.000 von 432.486; build-inputs.sqlite vorhanden.
Anschließende native Exploreransicht zeigt Schritt 3 von 7, „Masterdatenbank schreiben“,
34.500 von 273.485 Artgruppen, 33.500 gesichert. Kein erneuter failed-Status beobachtet;
Paarabschluss und Artanlagefreigabe daraus noch nicht abgeleitet.

Unabhängige reine Quellprüfung erklärt den Abstand zwischen fertigen Spools und Rezept:
prepareMasterJob ruft verifyMasterJob vor dem Rezeptschreiben auf. Dort werden CoL, Anbieter,
aktiver und vorheriger Master samt Bindungsdateien erneut vollständig gehasht und anschließend
die fertigen Spools geprüft. Erst danach wird der neue Job als aktueller fortsetzbarer Auftrag
eingetragen. Im untersuchten Zwischenabschnitt keine weitere CoL-Abfrage- oder Sperrwarteschleife.
**Offener Darstellungsbefund:** Während dieser späteren Prüfsummenlesung fehlt ein neuer
onProgress-Hinweis; der alte Text „Relevante CoL-Taxa werden gelesen“ bleibt stehen. Kein
Regeldateieingriff während des produktiven Aufbaus. Die Wartezeit allein beweist weder Stillstand
noch Erfolg; belegt ist hier der nachfolgende eigene Workerstart.

**Tatsächlicher gemeinsamer Abschluss – 13. Oktober, 18:09:17 MESZ:** Der eigene Ersatzauftrag
update-337cbac5-9664-4c8f-af6f-1f5b4d09a57c ist completed/completed, error leer.
job-d72503b6-edc4-4de5-8719-afe9c78cb837 ist ready und bindet
master-20261013143021566; 273.485 Artgruppen geschrieben. Gemeinsamer Aktivzeiger seit
17:43:24 MESZ: publication-eec8a0ea-dd2d-4c30-9a5e-89398e6536e4,
Lightroom-Paket lightroom-dd834fb15dbd6f1c3257. Der passende direkte Vorgänger ist das Paar
publication-b64beeb2-9951-4cf0-ac4e-1a326c5c3e91 vom 3. Oktober. Felix bestätigt danach
„der Lauf ist durch und ich kann wieder den Explorer nutzen“.

Lesende Abschlussgegenprobe um **21:04:44 MESZ** nach erneutem regulärem Explorerstart:
16 der 17 eng definierten Prüfbedingungen erfüllt. Originworkflow/-rezept unverändert,
frische eigene Erfassung und tatsächlicher Erneuerungsrecord samt Revisionskette/Target/Usage korrekt,
expliziter eigener Job/Rezept/Kandidat, abgeschlossener Workflow, alle 273.480 vorherigen IDs erhalten,
gültige Inhaltsqualität/keine offenen Klassifikationen, gespeicherte Entscheidungen enthalten,
gemeinsame Master-/Paketprüfsummen und direkter Vorgänger konsistent, aktive Korrekturen aktuell,
Artanlage verfügbar. Der normale lesende Suchhelfer findet Papageientaucher/Fratercula arctica.
Der einzige aktuelle false-Wert betrifft **heutige FN-Frische**: Lightroom geschlossen, aber
usageReady=false/catalog-changed-or-open. Dies ist keine Wiederöffnung oder ein Fehler des bereits
abgeschlossenen Paars und kein Anlass zum ungefragten Neuaufbau; der Abschlussprüfer berichtet
seinen insgesamt false-Wert unverändert. Frische Nutzungsbindung wäre vor einem späteren erneuten
Paarwechsel wieder erforderlich. Keine neue Quittung datiert und keine Schutzregel gelockert.
Beleg temp/explorer/3a38216c-ebfb-48b3-b400-b5ae0a5110bd/resumed-publication-check.json,
SHA-256 70bbbb59a5a82e6a394ce201d67da0b91cb4bf5c4eb49345d9f1f8b3a95897b3.
Sitzung geschlossen. Die mitkopierten älteren nativen Zwischenbilder bleiben als Zwischenbilder
gekennzeichnet und beweisen keine neue native Endansicht.

### 10.25 Neun markierte Lightroom-Ordner – 12. Oktober

Felix beauftragt die lesende Prüfung der im Screenshot markierten, tatsächlich in Lightroom vorhandenen
Dateien sowie die Erklärung von FN-Daten aktualisieren und erneuter Taxonomie-/Orts-/Zeitzuweisung.
Umfang ausschließlich die neun 0-Ordner unter Heimische Tierwelt, nicht namensgleiche Urlaubsordner.
Hauptkatalog readOnly in konsistenter Lesetransaktion geöffnet und regulär geschlossen. Kein SQL-Schreiben,
Checkpoint, Reimport oder FN-/Keywordschreiben. Native SDK-Schreibprüfung daraus nicht abgeleitet.

| Ordner | Vorhandene Dateien | Ohne FN-Taxonomie | Ohne FN-Monat/Jahr |
| --- | ---: | ---: | ---: |
| Bisamratte | 51 | 0 | 0 |
| Eurasisches Eichhörnchen | 61 | 0 | 0 |
| Reh | 284 | 0 | 0 |
| Rotfuchs | 38 | 0 | 0 |
| Alpenstrandläufer | 8 | 0 | 0 |
| Amsel | 39 | 0 | 0 |
| Austernfischer | 26 | 0 | 0 |
| Bachstelze | 63 | 2 | 2 |
| Bartmeise | 208 | 0 | 6 |

Gesamt 778 Dateien. Alle **776 bestehenden** FN-Taxonomien stimmen hinsichtlich Master-ID,
Namens-/Rangfeldern und tatsächlich zugewiesenen reservierten Stichwörtern mit dem aktiven Paket überein.
Vorhandene FN-Zeit-/Ortswerte passen zu den verfügbaren Katalogquellen; keine falschen oder veralteten
FN-Stichwort-IDs/-Namen festgestellt. Fehlende Ortsquellen werden nicht als Zuweisungsfehler gewertet.
145 Dateien besitzen GPS und IPTC-Ortswerte; davon 144 entsprechende FN-Ortswerte. Einzige Lücke ist
die unten aufgeführte insgesamt unzugeordnete Bachstelze _7R55915.ARW.

Konkrete fehlende FN-Zuordnungen: Bachstelze _7R51834(1).ARW, Aufnahme 24. März 2025, und
_7R55915.ARW, Aufnahme 12. April 2025. Beide besitzen überhaupt keine FN-Taxonomie-/Orts-/Zeitzuweisung
und keinen FN-Stichwortsatz. FN-Daten aktualisieren erkennt dadurch keine gespeicherte Art und darf sie
nicht aus dem Ordnernamen erraten. Sie benötigen eine ausdrückliche Taxonomiezuweisung.

Sechs Bartmeisen besitzen korrekte FN-Taxonomie, aber weder Monat noch Jahr: PB230597-2_20251123_10_09_37,
PB230598-2_20251123_10_10_00, PB230599-2_20251123_10_10_30, PB230682-2_20251123_10_12_18,
PB230683-2_20251123_10_12_43, PB230684-2_20251123_10_13_31. Alle sechs sind MOV-Videos vom
23. November 2025. Katalog-Aufnahmezeit vorhanden; bisheriger Plug-in-Zeitleser berücksichtigt nur
dateTimeOriginal. Dokumentierter SDK-Aufnahmezeitersatz dateTime wird eng geprüft/ergänzt; tatsächlicher
SDK-Wert der produktiven Videos noch nicht unabhängig gelesen. Kein Dateinamen-/Dateiänderungszeit-Raten.

Quellkorrektur in **0.4.24.26** abgeschlossen: gültige ursprüngliche Aufnahmezeit hat Vorrang; andernfalls
SDK-dateTime als Aufnahmezeitersatz. Ungültige/null/negative/nicht endliche Werte und Lesefehler erzeugen
keine erfundene Zeit. Scanzeit, Dateiname und Dateiänderungsdatum werden nicht verwendet. Isolation mit
unveränderter alter Writerquelle zeigt 1/6 bestanden und 5 Fehler; neuer Endstand **70/70**, keine
Fehler/Abbrüche/Skips, 49 Quell-/Testbindungen stabil. Belege
temp/explorer/e47c1a5d-b650-412f-af3e-a87e9ee1c556/video-time-tests-result.json,
SHA-256 e5fc0acfbd1fbc2e819fcbc725d78e2ab054d9d369a0de70c8fb7227c035b0d0, und
temp/explorer/dcced774-d6e4-4af7-8024-4640135ecf15/video-time-tests-result.json,
SHA-256 e7934db57c4731f8161978e2bef75da7f3841e11210064b2d2d368bdd3d8d4f1.
Sitzungen geschlossen. Tatsächlicher geladener Plug-in-Stand und produktive Reparatur bleiben getrennt
von diesen künstlichen SDK-/Lua-Gegenproben; bisher nativ bestätigt 0.4.24.24.

Unveränderte vollständige Ausgangsdaten: temp/explorer/cd867327-52ef-46de-9843-d34a39ef0dec/
selected-fn-metadata.json, SHA-256 816619f10371107f42453ad3b8726ff653eea5fa36bedb6c1738a074d13edda3.
Unabhängiger lesender Vergleich: temp/explorer/96c722c3-bb14-4060-a93d-2f4da8760c84/
selected-fn-comparison.json, SHA-256 e7d0d4ba292117256323ea912104d869807a5f5ab36104fae14778ecd901bbc8.
Sechs Quellen-/Helperbindungen und Ausgangssnapshot frisch abgeglichen. Diese Prüfung beschreibt den
gespeicherten Katalogstand und ersetzt keine native Nachprüfung nach einer tatsächlichen Korrektur.

**Befehlsgrenzen:** FN-Daten aktualisieren verwendet bestehende gültige FN-Master-IDs, löst sie gegen
das aktuelle Suchpaket auf und gleicht vorhandene verfügbare Quellen für Ort/Zeit ab; fehlende Werte
und gelöschte reservierte Stichwörter werden ergänzt. Unveränderte Zuweisungen brauchen keinen erneuten
Schreibvorgang. Ohne verfügbare Quelle bleiben bekannte FN-Werte erhalten. Reines Hinzufügen von Ort/Zeit
erhält vorhandene FN-Werte und ergänzt Lücken; Ort/Zeit aktualisieren gleicht verfügbare Quellen ab.
Erneute Taxonomiezuweisung gleicht Taxonomie ab und verwendet für Ort/Zeit den Hinzufügenmodus.
Die zwei vollständig unzugeordneten Bachstelzen gehören damit nicht zum automatischen FN-Aktualisieren.

Ortsvorschläge ohne Ergebnis bedeuten GPS vorhanden, aber Lightroom liefert aus seinem Vorschlagsweg
keinen verwertbaren gespeicherten Ortsnamen. Es bedeutet nicht „kein GPS“. Der Vorschlagsweg verwendet
eigene temporäre Lightroom-JPEG-Renditions, 64 Pixel, Metadaten vollständig, ohne Reimport. Wenn weiterhin
keine effektiven Ortswerte vorhanden sind, kann ein späterer Update erneut nach Vorschlägen fragen.
Vorhandene verwertbare FN-/Lightroom-Ortswerte vermeiden diese Anfrage. Keine Ortsnamensgarantie allein
aus GPS und keine Nutzer-/Quellenänderung erfunden.


### 10.26 Abschluss der beauftragten FN-/Stapel-/Video-Reparaturen und Speicherpflege – 13. Oktober

Frische konsistente lesende Aufnahme der neun markierten Ordner um **21:06:09 MESZ** nach erfolgreichem
Paarabschluss: weiterhin 778 Katalogeinträge, 776 gültige vollständig passende Taxonomien, zwei ohne FN-ID,
sechs taxonomierte Bartmeisen-MOV ohne FN-Monat/Jahr. Kein falscher Monat/Jahr/Taxonomie-/Stichwortsatz;
eine fehlende Ortszuweisung an der vollständig unzugeordneten Bachstelze. Alle acht Einträge noch im
Katalog. Diese Aufnahme liegt vor Felix’ anschließenden eigenen Zuweisungen; kein aktueller unveränderter
Stand nach dessen Arbeit behauptet. Snapshot temp/explorer/210163b2-fdfb-470f-8c02-eb3775f42022/selected-fn-metadata.json,
SHA-256 bc8030f72a4ada7f3d2dbba28c9cc5470452c5f38e70482ba6fefa66dc847ce7.
Vergleich mit dem neuen aktiven Master/Paket: temp/explorer/a7df9cd0-3f63-4141-b43c-df6bf0f05be4/selected-fn-comparison.json,
SHA-256 9b834da1883569f47c856f9332fcf65a0f44007d8d52234a9c646010b46dcc3f.

**Nutzerbestätigung und neue Vorgabe:** Die zwei Bachstelzen waren unter eingeklappten Stapeln verborgen.
Videos sollen FN-Taxonomie, Ort, Zeit und Stichwörter bekommen, aber nicht in Statistik/Statistikexporte
einfließen. Farblich markierte Lightroom-Ordner sind laut Felix sein relevanter fachlicher Bereich; Farbe
oder Dateiname erlauben keine automatische neue Artzuordnung. Die bestehenden FN-IDs werden katalogweit
gepflegt. Umsetzung in gemeinsamem Quellstand **0.4.24.27**; Betrieb/Quellenvertrag in
[Lightroom-Vertrag](lightroom-search-package.md). Keine produktiven FN-Daten durch den Assistenten geschrieben.

- Stapel: alte Auswahl 1 statt 3 reproduziert; neue Auswahl, genaue offene-/Sammlungsgrenze und echte
  Konfliktsperre **13/13**. Finalbeleg temp/explorer/f8e1e465-be5d-4748-ac0f-63100c9c35ec/stack-selection-green-result.json,
  SHA-256 5f62987937da3684b4465accd4d5f4623c387478caa2deca3fb1e8d92ff93c8c.
- Video-Statistik: **0/10** vor Korrektur, final **10/10**, echte Katalog-/Auswahlberechnung, Delta/Pause,
  Schema-Altindex und tatsächliche CSV-/TXT-Funktionen. Finalbeleg temp/explorer/d2e0a955-f4db-4385-9b22-26a33fdec10a/video-statistics-final-result.json,
  SHA-256 2b7bf0654d4ca30e7303da3c9317ec9446601a232fe109ee537d7e4ecdbf82d6.
- Vorschlagsfehler und Menüintegration: final **90/90**, 51 gebundene Quellen stabil, einschließlich
  wirklichem Menü für sichtbares April-/verborgenes März-Foto und gezielter sichtbarer Rücknahme.
  temp/explorer/9d03ea39-ca6b-4251-bca6-038f9f1a0596/green-result.json,
  SHA-256 15ea6670c626a79bb586b3d521fae5174a7f8b2639ea8b1f579a4aa28d6cc7a1.
- A-31 und neue Prüfsummenhint: **142/142** in vollständigen Coordinator-/Jobgruppen, Quellen stabil.
  temp/explorer/7af363f9-aff1-45c3-951b-9dd5346b8cb1/taxonomy-small-repair-result.json,
  SHA-256 96b89dcdee1aff7443fb76f87ccd4b69767ec695a6149359ac7f19ef813b38db.
  Prüfhint vor verifyMasterJob lautet „Gesicherte Eingänge und bisherige Datenstände werden anhand ihrer
  Prüfsummen geprüft.“ ohne Prozent/ETA. Neue Regelrevision für zukünftige Aufbauten; keine alten Rezepte
  geändert. Erster Hint-Test mit zu kleiner Benchmark-Fixture ist kein gültiger RED-Nachweis; valider
  RED danach gegen gebundene Originalquelle, siehe Agentbelege.

**Endgate – 21:48:34 MESZ:** quality:ci Exit 0, **50 Testgruppen / 1.740 bestanden**, keine Fehler,
Abbrüche oder Skips. 124 gebundene Programm-/Konfigurationsquellen vor/nach unverändert. Lokale
Produkt-/Medien-/Artefakt- und Linkprüfungen erfolgreich; --skip-live/--skip-pages sind keine neue
Veröffentlichungs-/Liveabnahme. temp/explorer/e5726ab8-0761-45dc-aa08-0a14165802aa/quality-result.json,
SHA-256 086e5fd5d599fbcdf3ab7005efbde9378233a39b3d4eb593cbf9f659dea46928;
Log f66f30e00c5ca14098ca3eceec10fe485fad255840261c826f01572133c65324.
Der vorige Lauf 9e6d34e5… scheiterte an einer alten Fotoblock-Textassertion nach Root-Anpassung der
Fortschrittsbezeichnung; korrigiert, keine Produktfehler daraus abgeleitet.

**Native .27-Ladung/Aktivierung:** Lightroom nach regulärem Neustart im Hauptkatalog; Manager zeigt
0.4.24.27 vom Pfad D:\Arten-Explorer\lightroom-plugin\FNWildlifeTaxonomy.lrplugin, 273.485 Taxa,
master-20261013143021566/lightroom-dd834fb15dbd6f1c3257 und übereinstimmende Referenz. Felix entfernt
anschließend den alten deaktivierten zweiten .24-Testeintrag selbst; er meldet vorübergehende Deaktivierung
und aktiviert .27 erneut. Unabhängige frische AX-/Bildkontrolle bestätigt genau eine FN-Registrierung,
richtigen Pfad/Version und „Dieses Zusatzmodul ist aktiviert“, keine Diagnosemeldungen.
Beleg temp/explorer/a08b0c87-3534-436d-9f98-2f204df4b9cb/loaded-plugin-proof.json,
SHA-256 772b242da45937ac2ef04ad2bede23b5e28922f332543e194e551176b6c7cd0e;
Manager-JPEG 7974b91f5d7a4e80208aa302db706c581c0411e8917a13ec4f94498023c1b255.
Beleg schreibt zehn Quellhashes. Die eigene Beleghilfe registrierte sich irrtümlich selbst als lebenden
Helfer; ihr finally konnte danach nicht schließen. Nach regulärem Prozessende wurden ausschließlich die
zwei eigenen Ledger geschlossen, tatsächliche beendete PIDs geprüft und sämtliche dauerhaften Belege
erhalten. Keine pauschale Tempbereinigung/Dateilöschung; Hilfsquellfehler korrigiert. Manager danach beendet.
Natives Laden ist keine produktive Schreib-/Statistik-Gesamtabnahme.

**Konkrete Speicherpflege:** Reguläre Vorschau um 21:12:27 MESZ, keine Warnungen, aktives Paar und
Vorgänger mittels aufgezeichneter SHA-256 erneut geprüft. Exakt job-8006153d-67c0-4e4f-97e7-224fd15d120e
(1.081.290.927 B) und job-b7795544-1758-464f-baaf-66c7ed6f32db (1.073.161.228 B) freigegeben.
Felix bestätigt das dauerhafte Entfernen beider Ordner. Reguläre storage-clean mit dieser unveränderten
Vorschaurevision um **21:25:41 MESZ** erfolgreich: zwei entfernt, failed leer, **2.154.452.155 Bytes**
entfernt, beide Zielpfade tatsächlich nicht mehr vorhanden, Aktivzeiger bytegleich.
Vorschau temp/explorer/aa4a9a99-4b35-4bd0-914f-83b2a9107bc7/postbuild-storage-preview.json,
SHA-256 85583a6ab7d9e9bb8f5d33908d28fcf04d78aad472f7ea8bc14e35749761e7bd.
Quittung temp/explorer/cb4d8b54-95af-4165-a56c-e307bd962380/postbuild-storage-clean.json,
SHA-256 87e19a801d7069561da46de7ecf6b6bc27f14930f1584d6b54c60792803aee72.
Dies ist eine tatsächliche Löschmenge, kein behaupteter vollständiger Nettospeichergewinn aller heutigen
Aufbau-/Sicherungs-/Testarbeiten. Andere alte Paare/Legacy-/Recovery-/Fehlerbestände bleiben durch
Originalinputs, direkte/transitive Abhängigkeiten oder offene Fehler geschützt. Keine automatisierte
Verwerfung solcher Aufträge. Historische Aufnahmen „0 Löschungen“ bleiben als datierte Vorgeschichte erhalten.

### 10.27 Produktiver FN-Katalogabgleich – 14. Oktober

Felix meldet Lightroom und Arten-Explorer geöffnet und den beabsichtigten Start von FN-Daten aktualisieren.
Er erlaubt anschließend ausdrücklich, dass der Assistent den geprüften Lauf direkt startet. Die vorherige
Shutdown-Anweisung endet damit für diesen Auftrag. Keine neue Datenbankübernahme oder Quellenprüfung.

Frische native Startkontrolle im Hauptkatalog: regulärer Plug-in-Pfad, **0.4.24.27 aktiviert**, 273.485 Taxa,
master-20261013143021566 und lightroom-dd834fb15dbd6f1c3257. Der Manager meldet vollständig:
„Lokale Datenstände stimmen überein: CoL, Master und Lightroom-Suchpaket.“ Korrekturen im Master enthalten.
Die verzögerte native Accessibility-Antwort ist keine Datenstandsabweichung; die abgeschlossene Anzeige
wurde visuell kontrolliert. Kein Plug-in-Wechsel/Neuladen und keine erzwungene Lightroombeendigung.

Vor Übernahme konsistente lesende Aufnahme der neun beauftragten Ordner: alle **778** Katalogeinträge
besitzen jetzt eine FN-Master-ID, einschließlich beider zuvor fehlender Bachstelzen. Dies berücksichtigt
Felix' zwischenzeitliche eigene Zuweisungen. Beleg
temp/explorer/665e065b-626c-4e41-8710-b02e8cb35381/selected-fn-metadata.json,
SHA-256 a5fd4596c4d2198fbcc84232dcb70762e128775b59adcfdb603b44025f1a84b0.
Kein SQL-Schreiben oder Checkpoint. Der erste Sandboxversuch konnte die eigene Tempwurzel nicht auflösen;
derselbe lesende Prüfer lief anschließend mit regulärer lokaler Werkzeugfreigabe erfolgreich.

Native Vorschau liest **127.093** Katalogeinträge vollständig. **6.472** aktualisierbare Taxonomiedateien
in **65 Taxa**, keine eigenständigen FN-Orts-/Zeitdateien, keine angezeigten unbekannten/ungültigen IDs,
Favoritenkonflikte oder verwaisten FN-Stichwörter. Vorschau ausdrücklich im freigegebenen Umfang
übernommen. **Damals dokumentierter Zwischenstand: Ortsvorschlagsexport lief; aktueller Abschluss unten.**
Nach Lesen aller 6.472 Quelldatensätze fragt Lightroom für **741** Dateien mit GPS und ohne verwertbare
gespeicherte Ortsfelder Vorschläge an. Die eigene aktuelle Plug-in-Operation
3DE8B0DB-E9AD-42CC-BE18-99C863B1F4AB wurde um 14:27:36 MESZ angelegt und enthält um 14:32:44 MESZ
86, um 14:35:48 MESZ 130 temporäre JPEG-Vorschauen. Damit ist Weiterarbeit lesend nachgewiesen;
die 100-%-Anzeige beschreibt hier die abgeschlossene Quellvorbereitung, nicht den ganzen Export.
Keine Vorschau-Dateien dieser aktiven Operation gelesen/verändert/gelöscht; nur Manifestfelder und Dateianzahl
für die Fortschrittskontrolle betrachtet. GPS garantiert weiterhin keinen nutzbaren Ortsnamen.
Um **14:42:42 MESZ** sind 276 Vorschauen erzeugt; native Anzeige weiter Ortsvorschlagsexport, noch kein
FN-Abschluss und keine sichtbare Fehlermeldung. Die bestehende Überwachung
lightroom-fn-abgleich-am-14-oktober-berwachen war während des Laufs ACTIVE und prüfte alle 15 Minuten
auf Fehler oder nativen Abschluss. Unveränderte laufende Zustände blieben still. Nach der bestandenen
Abschlussprüfung wurde diese erledigte einmalige Überwachung regulär entfernt (deleteStatus: deleted);
es sind keine weiteren geplanten Kontrollen dieses abgeschlossenen Laufs aktiv. Kein zweiter FN-Lauf gestartet.
Eigene native Start-/Fortschrittsbelegsitzung regulär geschlossen, während der produktive Lightroom-Lauf
weiterläuft. Beleg temp/explorer/c2d8b157-efb1-41c4-b7e3-60963d4e6582/native-fn-run-proof.json,
SHA-256 b0d763882d2aecc567b0d355888b2796c04997d6bcde4573bf63d52e88184150, fünf Beobachtungen und
gebundene Screenshots/Quellhashes, Helfer Exit 0. Dieser Startbeleg behauptet ausdrücklich keinen FN-
Gesamtabschluss. Er ersetzt nicht den noch ausstehenden Abschlussnachweis.
Anschließend: tatsächliche Abschlusszähler, konsistenter lesender Vergleich aller FN-Zuordnungen mit dem
aktiven Paar und gezielte Nachkontrolle der neun Ordner einschließlich Bartmeisen-MOV-Zeiten. Die neue
Statistik-/Exportabnahme mit Videoausschluss bleibt gesondert; kein ungefragter Statistik-Neuaufbau.


**Vorbereiteter einmaliger Abschlussprüfer:** 14/14 synthetische Gegenproben, keine Fehler; künstliche
SQLite-Datei nach readOnly-Prüfung bytegleich, produktiver Katalog durch diese Vorbereitung ungeöffnet.
Beleg temp/explorer/ca6a687f-8643-4aa5-ac55-26a97520130a/fn-postcheck-fixture-result.json,
SHA-256 5cfc95db133389bbb9fa041a268fc139312256e3af6a9f01bbd6b2dd1c9fce8d.
Helper temp/explorer/350ee964-5983-4183-b0cd-058730e6aa3e/fn-catalog-postcheck.mjs,
SHA-256 000575db03bbbe7fcc62e9bc14b64787d1cfb5aade67f6b790bd0aa5d5626856; Fachlogik
fn-postcheck-logic.mjs, SHA-256 09a5404d0e2bcfeea3abd702879edeb3260702b5b1b65e6d7904b4003d0b83be;
Gegenprobentest SHA-256 d3bc4471b92af13743eaf1cac29dca93787b73c3df85930dc0dbc717e58d7c28.
Root hat alle drei Dateibindungen frisch gegengeprüft. Nach tatsächlich beobachtetem nativen Gesamtabschluss
einmal mit --after-completed-fn-run und --before-snapshot
temp/explorer/665e065b-626c-4e41-8710-b02e8cb35381/selected-fn-metadata.json ausführen. Dieser eine
konsistente Katalogscan deckt alle bestehenden FN-Zuordnungen und den Neun-Ordner-Vorher/Nachher-Vergleich
ab; keine zweite Katalogaufnahme erforderlich. Aktive eigene Namen werden über den Suchpaketspeicher
berücksichtigt. Keine Vollhashlesung der großen Datenbanken, keine Artinferenz aus Ordnerfarben.

Der unabhängige Vergleich der bereits erlaubten Vorheraufnahme bestätigt **778/778** vollständig passende
Taxonomiefelder, Rangpfade und tatsächliche reservierte Stichwortkennungen. Einzige Abweichung: fehlender
Monat/Jahr an sechs bekannten Bartmeisen-MOV; EXIF-Jahr/Monat und captureTime ergeben übereinstimmend
November/2025. Beide Bachstelzen sind inzwischen passend mit März/April 2025 zugewiesen. Beleg
temp/explorer/0591ad53-e9f6-4e11-92e9-43d592f810e5/fn-catalog-postcheck-result.json,
SHA-256 f3a35a04f3a5f5a1ee7c1e4e0260ac5da453e58f53f0756072a406de9a8c2108. Dies ist weiterhin der
Stand vor dem heutigen FN-Lauf und keine vorweggenommene produktive Reparaturabnahme.

**Begleitender Dokumentationsabschluss am 14. Oktober:** Acht betroffene Einstiegs-/Fachverträge
abgeglichen: Auditauftrag, Lightroom-Suchpaket, Taxonomie-Betriebsstand, Roadmap, Updateautomatisierung,
Speicherpflege, FN-Katalognutzung und Strukturvertrag. Tatsächlich abgeschlossener Paarwechsel, regulär
bestätigte Zwei-Ordner-Löschung und natives Laden von .27 werden nicht mehr als Vorbereitung geführt.
Historische Nachweise und eingehende Anker bleiben erhalten. 80 Markdown-Dateien ohne fehlenden lokalen
Verweis, git diff --check bestanden; keine Programm-/Plug-in-Quelle für diesen Start geändert, deshalb
kein zusätzlicher vollständiger Testlauf während des Lightroom-Exports. Der Gesamtdiff gegenüber HEAD
(130 Dateien, 11.165 hinzugefügte / 5.107 entfernte Zeilen vor diesem kurzen Abschlussvermerk) umfasst die
gesamte noch offene Auditserie und ist nicht die Größe des heutigen Dokumentationspakets.
Kein Commit, Push, Deployment oder CMS-Schreiben. Historische Testlauf-/FFmpeg-Beispielpfade im
Strukturvertrag bleiben als eigenständig einzuordnender späterer Dokumentationspunkt erhalten.

**Abschluss und einmaliger produktiver Nachvergleich – 14. Oktober:** Die Überwachung beobachtet die
native vollständige Abschlussanzeige; gesichert um 15:27:37 MESZ. Dies ist der Beobachtungs-/Sicherungszeitpunkt,
kein rekonstruierter exakter Laufendzeitpunkt. 6.472/6.472 Einträge fertig; Vorschauübernahme nicht wiederholt.

| Native Abschlussangabe | Einträge |
| --- | ---: |
| Taxonomie aktualisiert | 412 |
| Taxonomie bereits vollständig und aktuell | 6.060 |
| Orts-/Zeitdaten aktualisiert, unabhängig von Taxonomie | 938 |
| Orts-/Zeitdaten unverändert | 5.534 |
| Nicht auflösbare Taxonomie übersprungen | 0 |
| FN-Daten konnten nicht geschrieben werden | 0 |
| Keine nutzbaren Ortsangaben und kein GPS | 4.862 |

Keine Warnung für fehlende nutzbare Ortsvorschläge, Export-/Lesefehler oder nicht ermittelbare Zeit im
vollständig sichtbaren Abschluss. Die ursprünglichen 741 GPS-Ortsanfragen sind damit erfolgreich bearbeitet;
keine Ortsnamensgarantie für andere zukünftige Quelldaten abgeleitet. Native Abschlussbelegsitzung
temp/explorer/170e85e7-b09b-4a5b-9f33-65c05e5eae79/native-fn-run-proof.json,
SHA-256 f3d5530aaba9c6b18be49551bdb56f09b3eb554f2bf8465f41785b4f08ad74c8;
Screenshot-SHA-256 e2fa00f8e03a6331f7d56846bd1948e72224852767bb4c950fa34ffefa52a060.
Acht Plug-in-Quellbindungen, eigene Sitzung regulär geschlossen, Helfer Exit 0. Keine weiteren nativen
Eingaben oder Änderungen durch die Überwachung.

Genau **ein** produktiver konsistenter readOnly/query_only-Nachvergleich danach, um 15:27:42 bis
15:27:51 MESZ: 127.093 Katalogeinträge gelesen, **6.472** FN-Einträge in **65** aktiven Master-IDs,
**6.462 Fotos und zehn katalogseitig bestätigte Videos**. Alle Taxonomiefelder/Rangpfade und tatsächlichen
reservierten Stichwortnamen/-kennungen passen zum aktiven Master/Paket einschließlich eigener Namen;
verfügbare Orts-/Zeitquellen vollständig passend. **0 betroffene Fehlerdateien**, keine ungültigen oder
unauflösbaren IDs, keine verwaisten FN-Stichwörter, keine widersprüchlichen doppelten Plug-in-Properties,
keine unbekannte Medienklassifikation. Quellhashes, Veröffentlichungszeiger sowie Suchpaket/Korrekturfreigabe
vor/nach unverändert. Keine vollständige Prüfsummenlesung der großen Datenbanken.

Ergebnis temp/explorer/119a4755-f38c-4c87-9871-a67ada785606/fn-catalog-postcheck-result.json,
SHA-256 d537914820c018517f5d3d54220912e4d73d1fee64a64eeaabf8669e1927c088;
zugehöriger Snapshot fn-catalog-readonly-snapshot.json in derselben Sitzung,
SHA-256 79ec0b98acffb8b6d83f4576cf83908ce5dafbfd919a0b64564161706ef19e38.
Prüfer/Fachlogik frisch an die oben aufgezeichneten geprüften SHA-Bindungen gebunden. Exit 0, Sitzung
regulär geschlossen; keine zweite produktive Kataloglesung.

Alle **778/778** Dateien der neun beauftragten Ordner im selben Snapshot gefunden: keine verlorene
FN-Zuweisung, keine Master-ID-/Taxonomiefeldänderung. Gegenüber dem heutigen Vorherstand genau sechs
Orts-/Zeit- und reservierte Stichwortänderungen, ausschließlich die sechs bekannten Bartmeisen-MOV:
**November/2025** ergänzt, entsprechende Zeitstichwörter tatsächlich zugewiesen, vorher leere
Orts-/Zeit-Zuweisungszeit gesetzt. Die übrigen 772 zuvor vollständigen Ordnerdateien behalten ihre
FN-Felder, reservierten Stichwörter und Zuweisungszeiten. Beide Bachstelzen bleiben korrekt mit
März beziehungsweise April 2025; zweite mit vorhandenen Ortswerten. Alle neun Ordner ohne Befund.

Die **4.862** Einträge ohne Ortsquelle und GPS sind Information, keine Zuweisungsfehler. Es werden
keine Orte erfunden. Der Prüfer liest nicht alle nicht reservierten manuellen Stichwörter und beweist
daher nicht deren katalogweiten Vorher/Nachher-Erhalt; die bestehende isolierte Schutzprüfung bleibt
getrennt. Gespeicherte Quellzeiten werden verglichen, rohe SDK-Zeitwerte nicht unabhängig in einer
zusätzlichen Hauptkatalog-Schreib-/Leserunde abgefragt. FN-Zuweisung an Videos ist jetzt produktiv
belegt; neue Statistik/Statistikexporte mit Videoausschluss und gezielte native eingeklappte
Auswahlzuweisung bleiben gesondert offen. Kein Statistikaufbau, erneuter FN-Lauf, Taxonomieaufbau,
Backup-/Speichereingriff, Commit/Push oder Veröffentlichung gestartet. Führender Lightroom-Vertrag,
Taxonomie-Betriebsstand und Roadmap auf den bestandenen FN-Abgleich aktualisiert; 80 Markdown-Dateien
ohne fehlende lokale Verweise und git diff --check bestanden. Plug-in-Version bleibt .27; keine
Programmquelle für diese Abschlussprüfung geändert, keine zusätzliche Volltestwiederholung. Offener
Gesamtdiff der bestehenden Auditserie vor diesem Statusvermerk: 130 Dateien, 11.239 hinzugefügte und
5.107 entfernte Zeilen. Der Gesamtauditabschluss bleibt offen.

### 10.28 Visuell geprüfte Galerie-Alternativtexte – Vorarbeit vom 13. Oktober

Die zuvor offene Bildsichtung ist für die beiden beauftragten Galerien abgeschlossen: 24 Papageientaucher-
und acht Rebhuhnbilder wurden tatsächlich gesehen; die Entwürfe beschreiben die sichtbaren Motive.
Die ersten drei Bilder wurden in der Live-Lightbox, die übrigen über die zuvor gebundenen CDN-Bildidentitäten
im Browser geprüft. Zwei zunächst im Übergang erfasste Bilder wurden anschließend vollständig nachgeprüft.
Keine Orts-, Geschlechts-, Jahreszeit- oder Beuteartenannahme aus Dateinamen. Kein Medienfile heruntergeladen,
keine CMS-/Websiteänderung ausgeführt. Die folgende Tabelle ist ein konkreter Entwurf; CMS-Zielfeld,
Speicherung, Veröffentlichungswirkung und tatsächliche Live-Alternativtexte bleiben offen. Kein
websiteweiter Bildbestand oder vollständiger Barrierefreiheitsabschluss daraus abgeleitet.

Beleg temp/explorer/8b50d68b-25e4-4713-b86c-2cd8e15b27d9/gallery-alt-visual-draft.json,
SHA-256 bd44746726a82c0febca5db3201a06cc30e13e66d49290dc636018537d516b94.
Bildidentitäten, bisherige Alternativtexte, einzelne Sichtungsmethode und nicht erteilte automatische
CMS-Anwendungsfreigabe sind darin gebunden. Keine zweite Auditdatei angelegt.

**Papageientaucher – [Galerie Papageientaucher](https://www.fnwildlifetravel.de/wildlife/island/fraterculaarctica)**

| Bilddatei | Geprüfter Alternativtext-Entwurf |
| --- | --- |
| _8020665.JPG | Papageientaucher steht auf einem Felsen und blickt nach rechts. |
| _8020503.JPG | Papageientaucher steht auf einem Felsvorsprung neben grünen Zweigen. |
| _1M28509.JPG | Papageientaucher auf einem grasbewachsenen Hang, von der Seite gesehen. |
| _8020568.JPG | Papageientaucher steht zwischen trockenen Grashalmen und blickt nach links. |
| _8020463.JPG | Drei Papageientaucher auf einem Felsen; einer putzt sein Gefieder. |
| _8020409.JPG | Drei Papageientaucher auf felsigen Vorsprüngen; einer breitet die Flügel aus. |
| _1M28236.JPG | Nahaufnahme eines Papageientauchers auf einem grasbewachsenen Hang. |
| _7312059.JPG | Papageientaucher schwimmt auf blauem Wasser mit sanften Wellen. |
| _1M28633.JPG | Papageientaucher fliegt frontal mit ausgebreiteten Flügeln und sichtbaren orangefarbenen Füßen. |
| _1M28145.JPG | Papageientaucher steht zwischen Gräsern am Rand eines Hangs. |
| _1M23241.JPG | Papageientaucher sitzt neben einem Jungvogel mit geöffnetem Schnabel im Gras. |
| _1M23168.JPG | Papageientaucher putzt sein Gefieder neben einem Jungvogel im Gras. |
| _1M27874.JPG | Papageientaucher auf einem schmalen Felsvorsprung; grüne Zweige ragen ins Bild. |
| _1M27704.JPG | Papageientaucher fliegt von einer Felskante ab; weitere Papageientaucher sitzen daneben. |
| _1M22814.JPG | Nahaufnahme eines Papageientauchers mit orange-grauem Schnabel vor grünem Gras. |
| _1M27842.JPG | Papageientaucher im Flug mit weit ausgebreiteten Flügeln vor blauem Hintergrund. |
| _8051689.JPG | Papageientaucher hebt von einem grasbewachsenen Felsen ab; weitere Vögel sitzen am Hang. |
| _1M22583.JPG | Zwei Papageientaucher im Regen; einer öffnet den Schnabel, der andere hebt einen Flügel. |
| _8020711.JPG | Mehrere Papageientaucher sitzen auf kleinen Vorsprüngen einer steilen Felswand. |
| _8051531.JPG | Papageientaucher putzt sein Gefieder im Regen auf einem grasbewachsenen Vorsprung. |
| _8020923.JPG | Nahaufnahme eines Papageientauchers mit schräg gehaltenem Kopf vor grünem Gras. |
| _1M21981.JPG | Papageientaucher fliegt mit Beute im Schnabel vor blauem Hintergrund. |
| _8020638.JPG | Papageientaucher steht zwischen trockenen Gräsern neben einer mit Flechten bewachsenen Felswand. |
| _8020813.JPG | Nahaufnahme eines Papageientauchers mit nach links gerichtetem Schnabel vor blauem Hintergrund. |

**Rebhuhn – [Galerie Rebhuhn](https://www.fnwildlifetravel.de/wildlife/heimische-tierwelt/perdixperdix)**

| Bilddatei | Geprüfter Alternativtext-Entwurf |
| --- | --- |
| _5041298_20260504_20_47_50.jpg | Zwei Rebhühner am Rand eines Stoppelfelds; eines mit gesenktem Kopf. |
| _5042212_20260504_19_48_04.jpg | Rebhuhn steht aufrecht am Rand eines Stoppelfelds vor hohem grünem Gras. |
| _5041771_20260504_19_42_30.jpg | Zwei Rebhühner stehen neben einem Feldhasen am grasbewachsenen Rand eines Stoppelfelds. |
| _5041826_20260504_19_43_12.jpg | Zwei Rebhühner auf einem Stoppelfeld; eines steht aufrecht, das andere duckt sich. |
| _4182552_20260418_12_48_33.jpg | Kopf und Hals eines Rebhuhns ragen zwischen hohen grünen Halmen hervor. |
| _4182597_20260418_12_49_11.jpg | Zwei Rebhühner laufen auf einer schmalen Erdspur zwischen grünen Halmen. |
| _5032288_20260503_19_47_25.jpg | Rebhühner im hohen Gras, teilweise von Halmen verdeckt. |
| _2200740_20260220_16_29_22.jpg | Rebhuhn zwischen trockenen Gräsern und kahlen Zweigen am Gebüschrand. |

### 10.29 Restgrenze nach FN-Abschluss – 14. Oktober

Felix fragt, was vor Fortsetzung des Gesamtaudits noch offen ist. Aktueller belegter Stand: geschützter
Master-/Suchpaketwechsel vom 13. Oktober abgeschlossen, Explorer wieder nutzbar, .27 regulär geladen/
aktiviert und katalogweiter FN-Abgleich vom 14. Oktober einschließlich eines unabhängigen Nachvergleichs
bestanden. Keine bekannte offene Datenbank-/FN-Datenblockade aus diesen Reparaturen; kein erneuter
CoL-Abruf, Masteraufbau, Plug-in-Wechsel oder vollständiger FN-Lauf allein zur Fortsetzung erforderlich.

Die zwei unmittelbar verbleibenden Lightroom-Abnahmen sind nächste Arbeitsschritte des bestehenden
Audits, keine neue grundsätzliche Entscheidung:

1. **Statistik und Exporte:** den wegen Schema 7 erforderlichen Statistik-Neuaufbau einmal bewusst
   ausführen und die tatsächlichen FN-Foto-/Arten-/Orts-/Zeitwerte sowie Exporte prüfen. Videos besitzen
   jetzt nachweislich passende FN-Daten, dürfen aber nicht in diesen Foto-/Statistikwerten erscheinen.
   Der erfolgreiche FN-Lauf und die 10/10 isolierten Statistiktests ersetzen diese native Abnahme nicht.
2. **Direkte Auswahlzuweisung:** in der bereits freigegebenen eigenen Testkatalogrunde .27 gezielt
   Taxonomie und Ort/Zeit mit eingeklappten Ordnerstapeln, März-/April-Mischung und vorhandenen Teilwerten
   prüfen. Verborgene Mitglieder müssen eingeschlossen werden, jedes erhält seinen eigenen Monat,
   bestehende gültige Werte bleiben beim Hinzufügen erhalten; Konflikt-/Rücknahmegrenzen bewahren.
   Die zwei Bachstelzen waren vor dem heutigen Abgleich bereits vom Nutzer zugewiesen und beweisen
   deshalb nicht allein diesen Auswahlweg. Keine neue Massenprobe am Hauptkatalog aus der Statusfrage.

Danach weitere bestehende Auditmatrix: gezielte native Explorer-/Artanlage-/Wiederanlauf- und Lightroom-
Favoriten-/Pause-/Auswahlfälle; vollständige Oberflächen-/Skalierungs-/Zugänglichkeitsgrenzen. Kleine
Restoreprobe ist belegt, reale Wiederherstellung des großen NAS-Archivs mit anschließendem Programmstart
bleibt separat vorzubereiten (isoliertes Ziel, Platzbedarf, konkrete Freigabe). Website: 32 Galerie-
Alternativtextentwürfe visuell geprüft, CMS-Zielfeld/Speicherung/Livezustand und Veröffentlichung der lokal
korrigierten Module noch offen. GitHub: fehlende Administrationsnachweise und spätere neue Linux-/Pages-
Abnahme der freigegebenen Serie; am Ende frische Abschlussprüfung, unabhängiger Review und Gesamt-Go/No-Go.

Großrestore, konkrete neue Löschziele und externe Veröffentlichung werden erst mit konkretem prüfbaren
Umfang getrennt freigegeben; solche Entscheidungen blockieren die übrige lesende/isolierte Auditarbeit
nicht. Bekannte IUCN-Abrufbeschränkung, fehlende geeignete offene Ersatzsounds und eingeordnete frühere
Test-/Herkunftsfragen sind keine neue Voraussetzung für die Fortsetzung. Keine pauschale Portrait-
Kennzeichnungspflicht aus dieser Statusabgrenzung abgeleitet. Der Gesamtauditabschluss bleibt offen.

Diese Statusfrage löst keinen Statistikaufbau, Katalogwechsel, SDK-Schreibtest, Restore, Download, Cleanup
oder Veröffentlichung aus. Nur der bestehende Auditauftrag wird mit der aktuellen Restabgrenzung ergänzt.

### 10.30 Buckelwal-Statistik und neue Auditreihenfolge – 14. Oktober

Felix beauftragt ausdrücklich diese Reihenfolge: zuerst den nach selbst ausgeführtem Statistikneuaufbau
kurz fehlenden Buckelwal prüfen und einen belegten Fehler korrigieren, anschließend die freigegebene native
Stapel-/Monatsprobe, danach Explorer/Lightroom, Sicherung/Wiederherstellung, Website/GitHub und Gesamtabschluss.
Weitere Agenten sind erlaubt; Zuständigkeiten vor Änderungen getrennt. Spätere Stufen werden vorbereitet,
aber nicht als bereits abgenommen dargestellt. Keine neue produktive FN-Massenkorrektur daraus abgeleitet.

**Nutzerbeobachtung:** Buckelwal erschien nach kurzer Zeit doch. Felix klärt nachträglich: Statistik frisch
geöffnet; sichtbare Stichwörter am Foto, aber nicht sicher, ob der Zuweisungsdialog schon den Erfolg gemeldet
hatte. Daraus wird weder ein verlorenes Statistikdelta noch ein Export-Rückkehrablauf behauptet. Sichtbare
Stichwörter während einer laufenden Aktion beweisen nicht deren vollständig abgeschlossenen Gesamtschritt.

**Gezielte lesende Feststellung:** 702 gespeicherte Buckelwal-FN-Zuordnungen mit genau der Master-ID
mtx_fb0a4563a9585df6ba81d2b0d5c19add; persistierter Statistikindex Schema 7, complete, Revision 149,
Stand 14.10.2026 16:06, 66 Arten, Buckelwal photoCount 702. Megaptera novaeangliae/Mammalia/Cetacea/
Balaenopteridae sind gespeichert. Der Index enthält 127.093 geprüfte Katalogdateien und videoCount 80;
diese internen Dateizähler sind keine Foto- oder FN-Zuweisungszahlen. Keine verlorene aktuelle
Buckelwal-Zuordnung festgestellt; ursprünglicher kurzer Übergang nicht nachträglich reproduziert.
Nur gezielte Buckelwal-Properties und vorhandener Index wurden query_only/readOnly gelesen, keine zweite
katalogweite FN-Nachprüfung, kein Indexaufbau oder Katalogschreibzugriff.

Belege temp/explorer/f214b5ba-1c79-44b7-a5c2-a577975a38eb/buckelwal-catalog-read.json,
SHA-256 d7d59903f309247cc4a41a9577d2c9cfb1239422185d37e84c10562a3b3c3596,
und temp/explorer/84f28fa3-a817-4e5a-902e-ca061ae99b58/buckelwal-statistics-index-read.json,
SHA-256 bd032a965ae7c0f9039c92cf173b04534fec57b6dfcace0afd73ab07ef24dd5d,
zweiter geprüft um 16:24 MESZ. Beide eigenen verwalteten Sitzungen regulär geschlossen.

**Unabhängig reproduzierter Anzeigefehler:** Eine bereits gestartete FN-Aktion kann während eines
Exportdialogs fertig werden. Nach dessen Abbruch zeigte das Statistikfenster bisher seinen alten Snapshot;
ein Katalogexport konnte denselben alten Stand übernehmen. Ursprüngliche .27-Anzeigequelle dauerhaft
gebunden; fünf neue Verhaltenstests zeigen vier erwartete Fehler, Auswahlbindung bestand schon zuvor.
RED temp/explorer/2574e844-4c02-4ddb-940a-8fd7e3970481/statistics-freshness-result.json,
SHA-256 0c19ef45f8b86a8802fc7404750a1d2cb4e4dad914d1dfb1d5ae0eda4c8d6e65.

**Quellkorrektur .28:** ShowStatistics lädt den vorhandenen Index vor jeder erneuten Dashboardanzeige
und nach bestätigter Katalogexportauswahl frisch. Ein inzwischen ungültiger Index stoppt vor dem Dateidialog;
Auswahlexporte bleiben an ihre konkrete Fotoliste gebunden. Kein zusätzlicher Vollscan und keine laufende
automatische Aktualisierung eines bereits sichtbaren Fensters. Info.lua, PluginInfoProvider und beide
Versionsassertionen des Vertrags auf .28 synchronisiert. Statistik-/Ortszeit-Lua, Video-Statistik-Lua und
Plug-in-Vertrag bestehen final mit 93/93, Fehler/Abbruch/Skip 0, sechs Quellbindungen unverändert.
GREEN temp/explorer/0bc13b7f-2f5d-40d3-bda0-a2c92e3bd89a/statistics-freshness-result.json,
SHA-256 25b3c6d01c6bbee520e8ca36146a22b71013861c34f5e5b317a6252b417f1d7c.
ShowStatistics SHA-256 80b324e3346e9480a590a9e888b26e8a7c36deaff7bd2c220c8b4d829998eeb3.
Tatsächlich geladen ist vor der anschließenden Neuladekontrolle noch der nativ bestätigte Stand .27.
Native .28-Abnahme, Exporte und Stapel-/Monatsprobe bleiben bis zu ihren eigenen Belegen offen.

**Native Fortsetzung am Abend:** Original explizit neu geladen. Lightrooms eigene Versionszeile bestätigt
.28, regulärer Projektpfad, aktiviert, 273.485 Taxa und vollständiges passendes Produktionspaar. Eigene
native Belegsitzung temp/explorer/4b5fd233-1c27-4707-9e03-f988619e241e/loaded-plugin-proof.json,
SHA-256 5cc5024474b6bc9456042c9fd4c121cc5237da1bf5b249ded72e000e6391c4cb,
22:04 MESZ. Vor dem kontrollierten Neuladen wurde durch eine fehlerhafte AX-Zuordnung kurz das Feld
„bei jeder Verwendung neu laden“ gesetzt und direkt anhand der sichtbaren Schaltfläche wieder abgewählt;
finaler Zustand unverändert aus. Keine Foto-/FN-Schreibaktion.

Anschließend native Statistik frisch geöffnet: **66 Arten, 702 Buckelwal-Fotos, 127.013 Katalogfotos,
7.190 taxonomierte und 119.823 nicht taxonomierte Fotos**. 7.190 mit Zeit, 1.717 mit Ort und Zeit,
5.473 nur Zeit, kein Foto nur Ort oder ohne beides. Klassen-Fotozahlen 5.202/1.589/250/139/10 ergeben
7.190; ein Art-Favorit. Gesamte sichtbare Statistik vollständig, Indexstand weiterhin 16:06. 127.093
interne Katalogdateien minus 80 katalogseitige Videos ergeben genau die sichtbaren 127.013 Fotos.
Keine vollständige erneute Gegenprüfung aller zwischenzeitlichen Nutzerschreibaktionen; die heutigen
7.190 sind nicht pauschal mit der früheren FN-Abschlussmenge gleichgesetzt. Native Exportwirkung und
direkte synthetische Video-FN-/Statistikprobe bleiben nächste getrennte Schritte.
Beleg temp/explorer/ac0c1434-e36a-485b-86fa-c476a07b76e4/native-audit-proof.json,
SHA-256 8f1d027b377a3ae6cc1dbbaad7af8653ab574155379a59fd5e631989a9a75fd6.

Die sichere kleine native Testkopie .28 ist unter temp/explorer/5b8eddff-3479-49e6-8a5e-f33752f7b11c
vorbereitet: 48 Lua-/62 MJS-Dateien, eigenes kleines Zweitaxa-Paar, kopierter Vier-Eintrag-Testkatalog,
drei eigene JPEGs und zusätzlich ein ausschließlich synthetisches fünfsekündiges Video (5.804 Bytes,
320×240 H.264, tatsächlich dekodiert). Keine produktiven Medien oder großen Datenkopien. Beleg
native-round-28-preparation.json in derselben Sitzung,
SHA-256 5296505d9833a23fba88044fe06ef3015af76b7f63d240c6b28687e3196fd651.
Vor der ersten Metadatenaktion ist der Bildordner im neuen Katalog nativ auf dessen eigene neue Kopie
umzubinden: der alte absolute Pfad ist im Klon noch gespeichert. Historische Hauptkatalogdatei der
ursprünglichen Testprobe byte-/mtimegleich; eine vorherige lesende SQLite-WAL-Öffnung erzeugte dort
0-Byte-WAL/32.768-Byte-SHM, keine SQL-/FN-Schreibaktion, nichts davon bereinigt. Alle tatsächlichen
neuen Schreibtests ausschließlich im neuen Klon. Originalregistrierung und Produktionspaar sind vor
erneutem Hauptkatalogöffnen zwingend zurückzustellen.

Ein zusätzlicher Gesamtgateversuch scheiterte früh an einer Temp-Testassertion: nach abgeschlossenem
Kartenfixturetransport war der bereits bereinigte Eigentumsdatensatz zwischen Ordnerliste und Lesen nicht
mehr vorhanden. Der Prüfer akzeptiert nun ausschließlich entfernte oder nachweislich leere Sitzungsreste;
bei jeder verbleibenden Datei sind die vollständigen Eigentums-/Helfer-/Abschlussprüfungen weiterhin Pflicht.
Kein Produktionsschutz geändert. Betroffene Providergruppe danach 21/21; neues gebundenes Gesamtgate läuft.
Fehlbeleg temp/explorer/1a4c3036-80af-4aa2-9a03-39d2ba62427a/quality-result.json;
neuer Lauf temp/explorer/1a34273b-48ab-489c-bc31-929804026f63/quality-result.json, Ergebnis noch offen.

**Gesamtgate abgeschlossen:** 22:02:54 bis 22:10:58 MESZ, Exit 0, **50 Gruppen / 1.745 bestanden**,
keine Fehler/Abbrüche/Skips, 124 gebundene Quellen unverändert. Log-SHA-256
2ac20350e7f7e5ff82b6358b917262da35da718ddb82aad7dab3bf76c6526295, Ergebnis im oben benannten neuen Lauf.
80 Markdown-Dateien ohne fehlende lokale Verweise und git diff --check bestanden. Gesamtdiff der bisherigen
Auditserie zu diesem Zeitpunkt: 130 Dateien, 11.587 hinzugefügte/5.110 entfernte Zeilen; keine isolierte
Größenbehauptung für die heutige einzelne Korrektur.

**Native Testwechsel begonnen:** Original im Manager ausdrücklich deaktiviert; normaler Katalog-Öffnenweg
schließt Lightroom und startet den vorbereiteten neuen FN-Audit-Katalog. Dessen „Speicherort von Ordner
photos aktualisieren“ zeigt die neue eigene Session; diese nativ bestätigt. Anschließende gezielte
query_only-Abfrage nur am neuen Klon bestätigt AgLibraryRootFolder.absolutePath exakt
D:/Arten-Explorer/temp/explorer/5b8eddff-3479-49e6-8a5e-f33752f7b11c/photos/,
relativePathFromCatalog ../../photos/. Keine SQL-Schreibaktion und kein Zugriff auf historische Bilder
für Metadatenaktionen. Testregistrierung wird erst danach hinzugefügt; Abschluss/Rückweg noch offen.

**Native Teilabnahme Taxonomie/Stapel/Monate:** Physische Testkopie .28 aktiviert, Original deaktiviert,
Manager bestätigt genau zwei künstliche Taxa und das passende eigene Paar. Ladestand belegt unter
temp/explorer/33032ead-e2e9-4c56-9184-bd9a72fdc5d9/native-audit-proof.json,
SHA-256 2a9d7cd50ddc7e8228cbf686eebe162fef55ee45b9abf159938e72d870fab3f7.
Mit normalem Lightroom-Aufnahmezeit-Editor ausschließlich die neuen eigenen Originale vorbereitet:
193/native-test-1.jpg am 15.03.2025, 194/native-test-2.jpg am 03.04.2025. Native FN-Felder als bewusst
unvollständige eigene Fixtures vorbereitet: gültiges Jahr 2025 ohne Monat; beim zweiten Land Deutschland
vorhanden, weitere FN-Ortsfelder noch leer, normale IPTC-Ortsquelle im Testfoto vorhanden. Keine SQL-Writes.
Den alten eigenen Original-/Kopiestapel nativ aufgelöst; danach ausschließlich Original 193 und 194
gruppiert. Virtuelle Kopie 543 und Kontrolloriginal 195 bleiben separat.

Nur oberes Foto markiert, Ordnerkontext, Stapel eingeklappt: Lightroom zeigt 3 von 4 Fotos/1 ausgewählt;
FN-Zuweisungsfenster liest **2 Fotos einschließlich 1 aus eingeklappten Stapeln**, davon eines bereits
zugeordnet. Native Vorschau für Calidris alpina vor dem Schreiben belegt unter
temp/explorer/f1561e40-57fe-40b6-a41f-9e5ef5e2a310/native-audit-proof.json,
SHA-256 1af786c0bea661681a9438674ec3917869999626c6bf18d05835570599f1d8b8.
Vorheraufnahme temp/explorer/35a0028f-e234-4511-926f-b057b914ad61/native-test-catalog-read.json,
SHA-256 cc11c3c200554e47242fc22c843419fed77adc6802e43d40215f3d767e9ba461.

Zuweisung bewusst bestätigt, zunächst „Taxonomie wird zugewiesen“, danach tatsächlich **„2 Fotos wurden
Alpenstrandläufer zugewiesen“**. Erst nach dieser Erfolgsmeldung lesender konsistenter Vier-Eintrag-
Nachvergleich: beide Master-IDs und vollständige Rang-/Taxonomiestichwörter passend, 193 März/2025,
194 April/2025, jeweils echte verwaltete Zeitstichwörter; veraltete Januar-/2024-Zuordnungen am ersten
Testfoto entfernt. Beim zweiten Jahr/Land erhalten, Stadt Stuttgart, Region Baden-Württemberg,
Detail Audit-Testplatz und ISO DE aus den vorhandenen eigenen Quellen ergänzt. Kontrollfoto und virtuelle
Kopie unverändert, nur deren manuelles ManualAuditKeep weiterhin zugewiesen. Exakte Auswahlreichweite und
unterschiedliche Monate im Taxonomie-Zuweisungsweg damit nativ abgenommen. Separater Ort/Zeit-Menüweg,
Konflikt-/Rücknahme-, neue Statistik-/Video-/Exportfälle bleiben nächste getrennte Prüfschritte.

Nachher temp/explorer/e027c32f-0e2d-49d5-ae0c-32abf1a2f8dc/native-test-catalog-read.json,
SHA-256 1fce2e7c47825040cf34c3ed043dfab86b4f188c23cf684328ef30605ae12250;
native Erfolgsmeldung temp/explorer/149aaa13-2ab1-4540-bdcb-7fe807834443/native-audit-proof.json,
SHA-256 5b9e893c198966bd59d4c0c6c1bf934970bf2e9e76c54bfa82fd195542ce674f.
Alle genannten eigenen Belegsitzungen regulär geschlossen; Testkatalog bleibt für nächste eigene Fälle offen.

**Separater Ort/Zeit-Hinzufügenweg nativ bestanden:** Nur die FN-Monatsfelder beider eigenen Originale
über die nativen editierbaren FN-Felder geleert; Jahr, Ortswerte, Taxonomie und bestehende Stichwörter
stehen gelassen. Vorher temp/explorer/f4e0170d-e0aa-4f9e-8093-e0828f70f639/native-test-catalog-read.json,
SHA-256 6e17bb50b1246a117c1349cd480307494b0ea858e622a9669208d1e86f0a112a.
Stapel wieder eingeklappt, nur oberes Foto markiert. Eigenständiges „Ort und Zeit → Hinzufügen“ bestätigt
ausdrücklich zwei ausgewählte Fotos und meldet danach zwei Änderungen. Fehlende Ortsquelle/GPS nur beim
ersten künstlichen Foto als passende Information; dessen Zeit trotzdem ergänzt.

Nachher temp/explorer/7a68172f-13f7-46ef-b7e8-32d0d1cab0a3/native-test-catalog-read.json,
SHA-256 55d16b75f0536cae21ca165ee84672c2d2b208cfa35fa45aec6bc62d564b1146.
193 wieder März/2025, verborgenes 194 wieder April/2025. Sämtliche anderen fachlichen FN-Werte und alle
tatsächlichen Stichwortzuordnungen exakt erhalten, Kontrollfoto/Kopie vollständig gleich. Zusätzlich
interne Orts-/Zeitkennungen repariert: 193 leer → 1164,1166; 194 bisher nur vier Ortskennungen → bisherige
vier plus 1168,1166. Jede neue Kennung ist als tatsächlich zugewiesenes Keywordobjekt unabhängig gelesen.
Die erste Vergleichsassertion hatte diese zulässige Kennungsreparatur fälschlich als unverändertes Feld
gefordert; fachlich korrigierter Vergleich besteht, ohne Werte oder Ergebnisdateien zu ändern.
Native Erfolgsmeldung temp/explorer/46894e3b-d02f-46aa-a5b4-9e9186603bcd/native-audit-proof.json,
SHA-256 9fca97054eeefd27cf55077968867bf211b8a86b783a13e56b5729dd4efcf1f2.
Die gezielte native März-/April-Hinzufügen- und eingeklappte Auswahlabnahme aus A-35/A-42 ist damit
abgeschlossen; Konflikt-/exakte Rücknahme und neue Video-/Exportfälle bleiben getrennte Fortsetzung.

### 10.31 Native Video-Datumsquellen und Fortsetzung – 15. Oktober

Die anschließende eigene Videoprobe hat zwei zusätzliche Fehler belegt. Noch kein Gesamtabschluss:

- Direkte „Taxonomie zuweisen“ ist bei ausschließlicher Videoauswahl ausgegraut; der Verwaltungsweg
  nimmt dasselbe Video bereits an. Die reine Entfernung von `photosSelected` ist keine hinreichende
  native Abnahme. Adobe dokumentiert `anythingSelected` ausdrücklich für Fotos und Videos; der lokale
  Quellstand .29 setzt diese Bedingung. Verschärfter Vertrag vor Korrektur erwartungsgemäß rot,
  vollständiger Plug-in-Vertrag danach 22/22. Native .29-Menüabnahme folgt separat.
- Das eigene fünfsekündige MOV zeigt in Lightroom Aufnahmezeit **23.11.2025 10:09:37.000**, während
  .28 ihm FN-Oktober/2026 zuweist. Das ist ein echter weiterer Quellenwahlfehler und keine Aussage über
  die bereits unabhängig korrekt geprüften sechs produktiven Bartmeisen-MOV. Ausschließlich das neue
  künstliche Video wurde hierfür importiert und beschrieben.

Ein eigener Diagnosehelfer liest genau dieses eine Video und stoppt bei jedem anderen Katalog oder
Dateipfad. Nativ erfasst: `isVideo=true`, `fileFormat=VIDEO`, `dateTimeOriginal=nil`,
`dateTime=813703041` → SDK-Komponenten 2026/10/14 22:37:21; `dateTimeDigitized=785581777` →
2025/11/23 10:09:37. `formatted.dateTime` ist ebenfalls Oktober/2026. Der bisherige Ersatzwert ist hier
damit nicht das sichtbare Aufnahmedatum. Zusätzliche Videoquelle wird gezielt korrigiert; Foto-Scanzeiten
bleiben davon getrennt. Umsetzung, automatisierte Gegenprobe und native Wiederholung noch offen.

Nativer SDK-Beleg temp/explorer/f4347f88-53bf-4f7f-b09a-85be118406d3/native-audit-proof.json,
SHA-256 b5827f51aea7fa0b75f0a226ca0a669cbddc96179727860b536a49cdf49139fa.
Alter .28-Writer unverändert vor Korrektur gesichert unter
temp/explorer/8e40c6dc-f59a-46b4-9247-5f40921cf3e3/loaded-28-LocationTimeWriter.lua,
SHA-256 efbf2d5aad646c798fe0f4db732e5b7e89e5a184b9c7e2a74d9f926987c63ab0.
Diagnosevorbereitung ce54dab6-e17e-42e3-bcfd-c2f2d7c70187/read-only-probe-preparation.json;
deren ausführbarer Code ist ausschließlich lesend, keine zweite produktive Katalognachprüfung.

**Unterbrechungsgrenze:** Am Morgen ist der Hauptkatalog wieder geöffnet, während noch die kleine
.28-Testregistrierung mit zwei Taxa aktiviert ist. Vor jeder weiteren Aktion diese nativ deaktiviert;
keine neue FN-Schreibaktion im Hauptkatalog durch den Assistenten. Danach den eigenen FN-Audit-Katalog
regulär geöffnet, Original und Test-FN-Plug-in bleiben für die lesende Diagnose deaktiviert. Aus dem
zwischenzeitlich geöffneten Hauptkatalog wird keine erfolgreiche Rückstellung behauptet. Vor der
abschließenden Rückkehr müssen Test-/Diagnosekopien deaktiviert und Original samt vollständigem
Produktionspaar nativ bestätigt werden. Der Rückweg bleibt bis dahin offen.

SDK-Menüquelle: [Adobe Lightroom Classic SDK Guide, Seite 35](https://ioconsolerykerprodcdn.azureedge.net/static/installers/lr/sdk/2022/cross_platform/v13/doc/Lightroom%20Classic%20SDK%20Guide_1655133965.pdf).

**.29 umgesetzt und nativ getrennt geprüft:** gültige Originalzeit weiter zuerst; nur bestätigte Videos
verwenden anschließend `dateTimeDigitized`, dann den bisherigen `dateTime`-Ersatz. Foto-/Scanquellen
bleiben getrennt. RED de1177eb-dba1-4d95-b57b-725067bd6d85/video-capture-red-result.json,
SHA-256 2a06f8f7e61329355f1fb0628fdb1638a1c61101de5a4ffb52f05f19d47dac7d: 62/65 bestanden,
genau drei erwartete Fehler. GREEN a70d585e-9c4b-48c5-91e3-d830269aa4b4/video-capture-green-result.json,
SHA-256 a316d6489c178380b7dad815c6c49672851bbd3f5e9baef5fe204b27913e5abb: vier Gruppen 110/110,
keine Fehler/Abbrüche/Skips, 16 Quellen unverändert. Das vollständige .29-Gate vom 15. Oktober,
07:22:12–07:30:41 MESZ, besteht mit **50 Gruppen / 1.749 Tests**, Exit 0, 124 Quellen unverändert;
temp/explorer/1cb4533f-091b-4d81-adc9-d85b1fc8c565/quality-result.json,
Log-SHA-256 732d6a0282208e5108cdeaeb7cea9849ea9cc7773716724968ad8251362fd1d5.

Neue eigene physische .29-Programmkopie mit unverändertem kleinen Zweitaxa-Paar; die alte .28-Kopie
bleibt unangetastet. Vorbereitung e278445c-f18d-4292-bd7c-c2948b27435a/native-program-29-preparation.json,
SHA-256 6ec1e48a05e15500847fc763f88d2a14b3f06476f584dc0d00c491f725d0de70. Manager bestätigt .29,
aktiviert und passende eigene CoL/Master/Paketstände. Direkter Menüpunkt mit ausschließlich dem MOV
ausgewählt aktiv, Zuweisungsfenster erreichbar; derselbe bereits gespeicherte Orts-/Zeitwert bleibt im
Hinzufügenweg erwartungsgemäß erhalten. Das ist keine verfehlte .29-Aktualisierung: der gewählte
Taxonomie-Zuweisungsweg überschreibt bestehende FN-Orts-/Zeitwerte bewusst nicht.
Beleg b10ef2f1-7faf-4a0c-9ddb-ca0e8172813c/native-audit-proof.json,
SHA-256 4eefd9d73c8ac8e58d91a53cb5d334ba18c3018fcadcfb7998d6abca4b7d5a8a.

Anschließend ausschließlich im eigenen Fünf-Eintrag-Testkatalog „FN-Daten aktualisieren“ vollständig
vorgeschaut und übernommen: drei auflösbare FN-Einträge in zwei Taxa, Taxonomie 0 geändert/3 aktuell,
Ort/Zeit 1 geändert/2 unverändert, nicht auflösbar 0, Schreibfehler 0, zwei ohne Ortsangaben/GPS.
Native Zähler 0c9fabaa-6bee-42a1-907c-b858ca635831/native-audit-proof.json,
SHA-256 11bb34cd06f06019443e4619de5130c12693d8d67661c76b52f78f61e9fd2a59.
Lesender Nachvergleich 98f35b6a-2c43-4aba-aa16-623364b2371e/native-test-catalog-read.json,
SHA-256 88ad62dc7ad2d592b78726c2f306f2bb2d339bcb52f88908574abf8cd2b31d1a:
MOV November/2025 und beide echten Zeitstichwörter korrekt, alte Oktober-/2026-Zuordnungen entfernt,
Taxonomie erhalten; sämtliche übrigen vier Einträge samt tatsächlichen Stichwörtern unverändert.
Gebundener Vergleich e731990c-43e3-4d6d-8b4b-fbea5ecec957/native-video-29-comparison.json,
SHA-256 2967fa8b37e6cc1efd58dfdb574112a0929ddcb660641ce0473b58eaf595c16f.
Eine erste Vergleichsassertion verlangte fälschlich eine Schreibweise ohne die äquivalenten .000-Millisekunden;
nur den Vergleich präzisiert, keine Ergebnisdatei oder Quelldaten geändert.

**Zusätzlicher Wiederholungsbefund:** Der erste .29-Lauf speichert beim neu erstellten Novemberkeyword
noch keine lokale Kennung: tatsächliche Zeitkeywords 1555/1166, internes Feld nur 1166. Der native zweite
Lauf ohne Quellenänderung meldet deshalb erneut eine Orts-/Zeitänderung; Nachvergleich zeigt nur die
Kennungsvervollständigung und einen erneut geschriebenen Zuweisungszeitstempel, keine fachlich neue Zeit.
Native Anzeige cf7819a9-614d-44ca-9538-8a0bbd7e749f/native-audit-proof.json,
SHA-256 4147bae92017a7b34140dad7ee483aa693fd668cdbba94153a9f6be1696b37b1;
Nachher e2e55243-0c7e-444b-a222-ce93f4906128/native-test-catalog-read.json,
SHA-256 8bbd89debfb4c86f2e2b0e975899c9dea0dc56744361a632774509abd8121247.
Das ist eine belegte unnötige Wiederholung, keine behauptete Endlosschleife. Dieselbe vorzeitige
ID-Speicherung ist im Taxonomie-Schreibweg reproduzierbar; IdentityWriter ist nur eine getrennte
technisch begründete Prüfgrenze und nicht als weiterer nativer Fehler oder als behoben erklärt.

**.30-Quellkorrektur:** neuer KeywordIdFinalizer sammelt nur wirklich geänderte Einträge mit noch
unvollständigen Kennungen. Nach Rückkehr des äußeren Schreibzugriffs werden tatsächliche IDs frisch
gelesen und in einem kurzen weiteren Zugriff ausschließlich die internen Kennungsfelder vervollständigt.
UUID, alle FN-Metadaten einschließlich Favorit, exakte reservierte Namen ohne Dubletten und Keywordidentitäten
werden vor und innerhalb dieses Zugriffs geprüft; Änderungen stoppen vor dem Überschreiben. Kein weiterer
Keyword-/Zeitstempel-/Statistikschreibvorgang; bereits vollständige IDs benötigen keinen zweiten Zugriff.
Klare Abschlussfehler benennen schon gespeicherte Teilschritte, ohne diese zu verbergen oder zu wiederholen.
Version/Info/Provider/Vertrag .30 synchron, weitere reale Fixtureloader um Schema/Helfer ergänzt.

Gegenprobe modelliert die SDK-Kennungen erst nach dem ersten Commit. Führender RED-Beleg
ccaf114d-b48f-47fc-b6dd-9935433da04b/delayed-keyword-identifiers-red-result.json,
SHA-256 fa66bf7f29ccd98cb90eff79f3e710c77de816e1f43f9bc72b705b45e24a101a, 71/77 bestanden,
sechs erwartete Fehler. Finaler GREEN cc344509-eed0-4eb7-81cc-f6c0eb2c752b/delayed-keyword-identifiers-green-result.json,
SHA-256 cfc96554a5c055f258c05a23c7a2e61924c6116c61f05792781a43c399720bf4, 83/83 bestanden,
Quellen unverändert, keine Fehler/Abbrüche/Skips. Weitere fünf bestehende Lua-/Vertragsgruppen 70/70.
Native .30-Probe muss ausdrücklich ein neues reserviertes Keyword erzeugen; der inzwischen vervollständigte
Novemberfall genügt dafür nicht. Gesamtgate unter 61fbf8a4-0234-428d-8c9e-78d18923d9df abgeschlossen:
07:39:02–07:47:06 MESZ, Exit 0, **50 Gruppen / 1.767 Tests**, keine Fehler/Abbrüche/Skips,
126 gebundene Quellen unverändert; Log-SHA-256
49b0c08584cad94aba01e99c5a2c940835f54ed0062e7a980b5cbe2d55ef1292.

**Original-Rückstellung frisch bestätigt:** Der Hauptkatalog war erneut mit der privaten .29-Registrierung
geöffnet. Diese zuerst deaktiviert; keine neue FN-Fotoaktion durch den Assistenten. Anschließend die
reguläre Registrierung am Pfad D:/Arten-Explorer/lightroom-plugin/FNWildlifeTaxonomy.lrplugin gewählt
und aktiviert. Lightrooms eigene Versionszeile und Provider zeigen beide **0.4.24.30**; 273.485 Taxa,
Master master-20261013143021566, Paket lightroom-dd834fb15dbd6f1c3257 und passende CoL-Herkunft.
Beide privaten FN-Kopien und beide Diagnosekopien sichtbar deaktiviert. Beleg
fb1b6baf-531a-4e64-a581-7baa0132efe5/native-audit-proof.json,
SHA-256 62e418e5a4a421362a58c8b6e0b1190c428d703a6ffac805c38301f622e8acc6.
Diese Rückstellung ist keine native .30-Schreibabnahme. Für die nächste private Runde wird eine neue,
auf den exakten eigenen Katalog beschränkte Kopie vorbereitet; alte gebundene Kopien bleiben unverändert.

**Video-Statistik nativ:** Nur den eigenen Fünf-Eintrag-Katalog ausdrücklich neu aufgebaut. Anzeige danach
vier Fotos, zwei taxonomiert/zwei ohne Taxonomie, eine Art Alpenstrandläufer mit zwei Fotos, zwei Zeit-/ein
Ortsfoto. Die ausschließlich dem MOV zugewiesene Sciurus-Art und das Video fehlen korrekt in allen Zahlen.
Beleg d74ef0d8-2635-46d7-9287-03ef9fc73a02/native-audit-proof.json,
SHA-256 6d0069dc55ebb8bf7a63e415ceb16ef5b58014d5355cc920594203314537efbf.
Kein produktiver Statistikneuaufbau. Neue Exporte laufen ausschließlich in der eigenen exports-Ablage;
abschließender Sechsvariantenvergleich noch offen.

Bisher tatsächlich mit .29 gespeichert: native-29-catalog-lifelist.csv (eine Art/zwei Fotos) und
native-29-catalog-observations.csv (zwei Beobachtungen März/April 2025), ausschließlich unter
temp/explorer/5b8eddff-3479-49e6-8a5e-f33752f7b11c/exports. Die nur im MOV verwendete Sciurus-Art
fehlt passend. Der dritte Dateidialog wurde vor der Unterbrechung geöffnet, daraus wird kein gespeicherter
Export behauptet; die vollständige neue Variantenabnahme bleibt offen.

**Geschützte neue Testkopien und unabhängige Review:** Die private .30-Kopie
9d76139e-f8e6-4109-8626-e6c2a244377f erlaubt ihre beiden FN-Menüs und Initialisierung ausschließlich
im exakten eigenen FN-Audit-Katalog. Private Info enthält nur drei deklarierte Entry-Umleitungen;
48 funktionale Lua-/62 MJS-Dateien bleiben bytegleich, vier zusätzliche private Guarddateien.
37/37 Guard-Gegenproben bestanden. Nativ blockiert ihr Taxonomieaufruf im Hauptkatalog ausdrücklich
vor jedem Zuweisungsdialog: 3a88947b-349f-481e-93c9-1930fc643a9e/native-audit-proof.json,
SHA-256 c37f7a582cc1c52eaaaae65cfca0f258c1bc4c53279aa51ba2bccb8cd5925d48.
Danach kontrollierter Wechsel in den eigenen Katalog; Original und alte Testkopien deaktiviert.

Die unabhängige Review führt zu neun verschärften Race-Assertions mit ausdrücklichem Fehlernachweis
und vier neuen Gegenproben für bereits vorhandene anders großgeschriebene reservierte Basisnamen.
RED 1d719392-fd24-4d7a-8425-244a2bc5a3ec/case-insensitive-keyword-red-result.json,
SHA-256 5877ed12e493c648c9d757952f1b1f3b513c1b635e3688af3664fe5ae916b682: 83/87 bestanden,
vier erwartete Fehler. Quelle .31 gleicht nur die erwarteten Namen wie die bisherigen Writer ohne
Beachtung der Großschreibung ab; exakte reservierte Endungen, tatsächliche Snapshot-Schreibweise,
Dubletten-/Objektschutz und beide Gateprüfungen bleiben erhalten. GREEN
49861798-1c56-4de4-9d09-e9872f0c1135/case-insensitive-keyword-green-result.json,
SHA-256 a6b1fb0a340ccbbce35d4356fc24eaf5291ca47dd80e7ae1e2bdfd4754127a1f: 87/87 bestanden,
16 Quellen unverändert. Dies ist ein gezielt modelliertes SDK-Verhalten, noch kein nativer Case-Befund.

Neue eigene geschützte .31-Kopie 26c3e89a-3340-4af5-bdf0-285b1fd351a0,
guarded-native-program-31-preparation.json SHA-256
aa1363d0396ee2387a1366b578cd23ce9a676924d51745dec303d679a01df053;
37/37 Guard-Gegenproben. .31 und kleines passendes Zweitaxa-Paar im richtigen FN-Audit-Katalog nativ
aktiviert bestätigt: 496bfe80-d4c4-4c84-8c66-25f435abb689/native-audit-proof.json,
SHA-256 e9e19e9fc6e44412152be2a3203b4fc25ccae28b12f7bf54ed9071f9760d44da.

**Native .31-Erstkennungsprobe fehlgeschlagen:** Nur am künstlichen Video mit Lightrooms Aufnahmezeit-
Editor 23.12.2027 gesetzt, damit neue Dezember-/2027-Stichwörter erforderlich sind. Vollständige eigene
Fünf-Eintrag-Vorschau, drei FN-Zuordnungen/zwei Taxa. Einmalige Übernahme meldet danach 0 Taxonomie-/
0 Ortszeitänderungen, zwei vollständig aktuelle Zuordnungen, einen FN-Schreibfehler:
„Ein gerade zugewiesenes FN-Stichwort fehlt am Foto“. Kein erneuter Lauf gestartet.
Vorher 17db6996-b54a-455d-808b-97b11383c2fe/native-test-catalog-read.json,
SHA-256 87405a6e876ffb5e3255b0638d95b3c5182b83b18739a289621250901ff43a37;
nachher 1af634bf-8a66-4869-9f88-fa2cf2b8c33d/native-test-catalog-read.json,
SHA-256 b337e8c047927bd2006228b37343a00273be6c6e39181de6cb5aaeea728afb3b.
MOV-FN-Werte und tatsächlich gespeicherte Stichwörter bleiben November/2025; kein erfolgreicher
erster Schreibabschluss behauptet. Native Zähler/Fehler
3d893f0b-6d9b-4924-8653-901a5ec7c1fd/native-audit-proof.json,
SHA-256 17f26c38e8afbb7a4c742fcbfc2c988a50a9468ef29ad2aaf6a53690b680dc12.
Prüfverdacht: Die SDK-Stichwortlesesicht innerhalb des ersten Schreibzugriffs ist noch nicht aktuell;
die bisherigen Gegenproben verzögern nur Kennungen. Ursache und Korrektur werden vor weiterer FN-Probe
untersucht. Das .31-Gesamtgate 8098989c-8496-45c5-88c4-7c7a3787e8f6 endete mit 50 Gruppen /
1.771 bestanden, Exit 0, Quellen unverändert; Log-SHA-256
9530957491e1faf4490aaf9896aced98963e891f00c78873a13f35376507ab7b.
Dieser automatisierte Erfolg ersetzt ausdrücklich nicht die fehlgeschlagene native Erstprobe.

**.32 behebt die vorzeitige Stichwortprüfung:** Die Writer binden jetzt die tatsächlich an addKeyword
übergebenen Objekte und gewünschten Namen. Erst nach Rückkehr des äußeren SDK-Schreibzugriffs wird
die wirkliche Zuordnung dagegen geprüft. Unveränderte reservierte Bereiche behalten ihren gebundenen
Vorzustand; alle geänderten Bereiche werden gemeinsam erwartet, einschließlich vollständiger Kennungen
und leerem Endzustand. Keine nachträglich frei angenommene Basis und kein erneuter Zuweisungsversuch.
Ein anderer Handle gleichen Namens darf einen ursprünglich weiterhin kennungslosen Handle nicht ersetzen.
UUID, vollständige FN-Metadaten, exakte Endungen, Dubletten, tatsächliche Objektidentitäten und beide
Prüfungen vor einem zweiten Zugriff bleiben geschützt. Nur fehlende interne Kennungsfelder werden ergänzt.

Neue SDK-Fixtures modellieren alte Raw-Keywordsicht und getrennt noch unlesbare neue Objektnamen.
RED eb2a0799-c617-4b1e-9cc9-affe2d38ea23/delayed-keyword-visibility-red-result.json,
SHA-256 64e9a435cf899693f5c3e48ec5aa78d7f25d4521ff974e2f0097994b37873baf: 87/95 bestanden,
acht erwartete Fehler. GREEN 6d523db1-07ec-4e1c-80fc-6d7f2a6b6598/delayed-keyword-visibility-green-result.json,
SHA-256 b599bddf5e84c821c7aaff08faa544432d98895ae5773fd8fc0728741218937e: 95/95.
Enger Identitäts-RED 65c033de-f384-4bd3-8242-0f0bd6f6a693/keyword-handle-identity-red-result.json,
SHA-256 48227ee1b76ea2532e32319f59569198ef43e98f3b053962297565db01e987c9: 96/97.
Finaler GREEN 50b79315-071d-4e3e-aa82-4cc275538305/keyword-handle-identity-green-result.json,
SHA-256 b1ebe012718c5cf4abc7e3d6587726709933e94c97303db90ccbd7c01493bdb6: **97/97**,
16 Quellen unverändert. Unabhängige lesende Review ohne weiteren Blocker. Die bislang nicht nativ
belegte verzögerte Sichtbarkeit geschriebener FN-Felder bleibt eine getrennte Grenze, kein neuer Fehler.

Vollständiges .32-Gate 8a6e9550-2301-4f64-87ac-e1e0fa2881f0/quality-result.json abgeschlossen:
15. Oktober 09:27:16–09:35:06 MESZ, Exit 0, **50 Gruppen / 1.781 Tests**, keine Fehler/Abbrüche/Skips,
126 Quellen unverändert; Log-SHA-256 c93c60863734017dc27790b3e24f44c7ba27b5549c1f49d6d7124925c22c6465.
Native .32-Erstprobe und unveränderte Wiederholung bleiben bis zu den eigenen Nachweisen offen.

**Nutzerauftrag Registrierungen bereinigt:** Zwei alte Video-Diagnosen und die nicht mehr verwendeten
Testregistrierungen .28/.29/.30 nativ entfernt. Die .31-Kopie blieb zunächst für die laufende Probe.
Zwischenbeleg 11fc71f8-2cb5-4a47-bc38-160286ef62ed/native-audit-proof.json,
SHA-256 f3289551ea9607a5c6af6218f21127c66412d9ec8517437f5ca284195803979a.
Nach der Nutzungsgrenze der automatischen Freigabeprüfung wurde der Hauptkatalog erneut geöffnet
vorgefunden. Die aktive .31-Entfernung wurde von der automatischen Prüfung abgelehnt: zuerst Original
wiederherstellen. Diesen sicheren Weg ausgeführt: Original .32 aktiviert/vollständiges Paar geprüft,
.31 dann sichtbar deaktiviert entfernt. Lightroom deaktiviert beim Entfernen einer Registrierung derselben
Toolkit-ID auch das Original; dieses anschließend wieder aktiviert. Final genau **ein** regulärer FN-Eintrag,
.32, 273.485 Taxa, übereinstimmendes Produktionspaar. Kein FN-Foto-/SQL-Schreiben und keine Belegdatei gelöscht.
Beleg 11978652-1abf-44f6-b810-9799ea676812/native-audit-proof.json,
SHA-256 e3847b12f1ca42e8fd6cbf8434567a1619214577a409a2302357afb0f001e2b7.

Die nächste private .32-Kopie heißt ausdrücklich **FN-Audit - nur Testkatalog**, mit derselben exakten
Katalogsperre. Vier private Info-Abweichungen (drei Einstiege und Name), sonst 48 funktionale Lua-/62 MJS-
Dateien bytegleich, 37/37 Guard-Gegenproben. Vorbereitung
86edd0d9-f6ec-41c1-a5cc-db35b9a3990b/guarded-native-program-32-preparation.json,
SHA-256 e92e49aebbbcebc9d0a3045d2b7b133fed09e475867fac92557ab9062a716494.
Sie ist zu diesem Nachweisstand noch nicht nativ geladen; nach der Runde wieder entfernen und genau das
reguläre Original aktiviert im Hauptkatalog bestätigen. Kein Gesamtabschluss.

**Native .32-Metadaten-Grenze:** .32-Kopie mit passendem eigenen Paar nativ geladen, erneut nur der
Fünf-Eintrag-Testkatalog und dessen künstliches MOV. Erste Übernahme mit neuen Dezember-/2027-Keywords
meldet 0 Taxonomie-/0 Ortszeitänderungen, zwei aktuelle/unveränderte Einträge und einen FN-Schreibfehler:
„Die FN-Metadaten wurden seit der Zuweisung geändert“. Kein Wiederholungslauf.
Native Anzeige samt .32-Ladetext 2b8af708-c8ac-41ce-b624-623b05956da2/native-audit-proof.json,
SHA-256 ea4dc5f720c1bab438b90be4b64a8d2d426c26f93f66624d3d462ee10c85c0f5.
Vorher 2d99b4ff-f5a9-42ba-8270-32a6dc534e58/native-test-catalog-read.json,
SHA-256 e67288e87ed370df14f8c135bb0701fc07cdda6a82da102207bcc5ec7f32f14b;
nachher def76595-a7dd-4d08-8c12-5c3e5bed005a/native-test-catalog-read.json,
SHA-256 b1df451254c259001714d778a2dfcfeaeb86c949cc80dbd64bcd8fdd67569184.
Anders als beim .31-Fehler ist der erste Schritt tatsächlich gespeichert: FN-Dezember/2027, echte neue
Keywords 1575/1577, alte November-/2025-Zuordnung entfernt, internes ID-Feld noch leer. Taxonomie erhalten.
Der vollständige Abschluss bleibt fehlgeschlagen; die Anzeige wird nicht als erfolgreich umgedeutet.

**.33-Quelle:** Vollständiger FN-/UUID-Vorzustand vor dem ersten Metadaten-Setter, danach exakt die
tatsächlich geschriebenen, bereits normalisierten/begrenzten Werte aufzeichnen. Beide Writer verwenden
dieselbe Erwartung je Foto; Leeren und Neusetzen einschließlich interner Namen/IDs/Zeitstempel sind
vollständig erfasst. Unberührte FN-Felder bleiben exakt gebunden. Kein FN-Getter als Nachschreibbeweis
innerhalb desselben Zugriffs, keine neue Basis nach Commit, keine nil-/Leerstring-Gleichsetzung und kein Retry.
Fehlermeldungen nennen jetzt den deutschen Feldtitel ohne Datenwerte. Unabhängige lesende Review ohne
weiteren Blocker; native Wiederholung bleibt eigener Nachweis.
RED c7298dde-5a3f-43de-ac24-75b2a76707ab/delayed-fn-metadata-red-result.json,
SHA-256 1976afe59cf7c729291db7cf706e5dfdf13548d9f8cdfb7b89afbd7ca872cb95: 98/107 bestanden,
neun erwartete Fehler. GREEN 31c58fb3-994f-41cd-885c-b9f1631e8531/delayed-fn-metadata-green-result.json,
SHA-256 57b6fa625ee3a09b42ee605164e0a8ecc7197a6684c0ad12a2c25665d1dde350: **107/107**,
16 Quellen unverändert; unberührtes Favoritenfeld nach Commit weiter geschützt.
Info/Provider/Vertrag .33 synchron; Gesamtgate 25367a75-1a3a-4699-be3e-43a2f9c23973/quality-result.json
abgeschlossen: 15. Oktober **14:14:45–14:26:45 MESZ**, **50 Gruppen / 1.791 Tests**, Exit 0,
keine Fehler/Abbrüche/Skips, alle 126 gebundenen Quellen unverändert; Log-SHA-256
8044b9fb1b2c223ff42ec2f7a27a090320bdce315a87a38c0b79d3683d410a5b.
Neue geschützte Kopie 9cc1cfcd-1fb7-41ba-8a7d-31c2912fabb6,
guarded-native-program-33-preparation.json SHA-256
de0705416f2e077f38c7c93e107cb8a8af5c0efc49698002c68fdbbdf96c1ec6,
37/37 Guard-Gegenproben. Name weiterhin FN-Audit - nur Testkatalog; native Folgebelege unten.
Für die neue echte Erstprobe Aufnahmezeit des eigenen MOV nativ auf **23.05.2028** gesetzt; zuvor
gespeicherte FN-Dezember/2027-Werte bleiben als bewusst abweichende eigene Testeingabe bestehen.

**Neue Sechsvarianten-Exportmatrix abgeschlossen:** Drei Katalogvarianten tatsächlich gespeichert:
.29-Lifelist eine Art/zwei Fotos, .29-Beobachtungsliste genau 15.03./03.04.2025, .31-TXT eine Artzeile
Alpenstrandläufer. Drei Auswahlexporte jeweils nur mit dem künstlichen MOV ausgewählt: .31-Lifelist-CSV,
.31-Beobachtungs-CSV und .32-Arten-TXT enthalten korrekt null Arten/Beobachtungen. TXT besitzt den
0-Arten-/0-Fotos-Kopf, keine Artzeile; keine byteleere Datei behauptet. Native letzte Erfolgsmeldung
3650ecee-faed-4ceb-a42e-c021902f26c8/native-audit-proof.json,
SHA-256 505072310ff322072aa52fa7fe23dc2488a71000be41d3ce026aa6b9e79fa45f.
Unabhängiger konsistenter Inhalts-/Hashvergleich: **45/45** Assertions,
6c7720b0-1fdc-4ba2-a40c-074b421a5b90/native-six-exports-verification.json,
SHA-256 bc46d2a7d663e4f3be745113d6d1da5855052a2ff194694d05b4ad6ca7a91a6b.
Alle sechs Dateien vor/nach unverändert, gültiges UTF-8, keine Sciurus-/MOV-/fremde Fotoreferenz.
Die sieben Export-/Statistikmodule sind über die tatsächlichen physischen .29/.31/.32-Kopien und den
aktuellen Produktstand .33 bytegleich; keine Gleichheit von Info/Guards oder Versionen behauptet.
Diese Runde belegt die Katalogvarianten positiv und alle drei Auswahlwege mit Videoausschluss. Die
frühere .24-Foto-Auswahlrunde bleibt ein eigener historischer Positivbeleg; neue positive Favoriten-/
Konflikt-/exakte Rücknahmefälle sowie Gesamtabschluss bleiben getrennt offen.

**Native .33-Erstprobe und unveränderte Wiederholung bestanden:** Nur im eigenen Fünf-Eintrag-Katalog,
private .33 nativ mit eigenem Zweitaxapaar geladen. Erste Übernahme: 0 Taxonomieänderungen / 3 bereits
aktuell, 1 Orts-/Zeitänderung / 2 unverändert, 0 unauflösbare Taxonomien / 0 FN-Schreibfehler.
Das künstliche MOV erhält Mai/2028 und beide echten internen Zeitstichwortkennungen **1593/1595** bereits
nach dem ersten Lauf vollständig. Native Anzeige samt .33-Ladetext
a538bc4f-1a51-420f-9d7e-078e51c88c11/native-audit-proof.json,
SHA-256 cde8241541fbbe22f6b04c0cf86371c29986c35b5f5ab0818d3fa32d15fa80b8.
Vorher d5cd99de-651f-4dcf-aba9-a54905359cd3/native-test-catalog-read.json,
SHA-256 7c6e8f4c11351e81a9172e1dea8650a1bc29e49ce1bbe9c02334c61ebdc8f171;
nach erstem Lauf 265589bd-e725-42bd-b9e9-e04b8bd11e01/native-test-catalog-read.json,
SHA-256 2227f8435ec886c37521baa1dee7e63cca761aacc78101164d0a8d34a10fe592.

Unveränderte zweite Übernahme: **0 Taxonomieänderungen / 3 aktuell, 0 Orts-/Zeitänderungen / 3 unverändert,
0 Schreibfehler**. Zwei Einträge besitzen keine nutzbaren Ortsangaben und kein GPS; das sind bewusst
quellenlose Testeingaben und keine Zuweisungsfehler. Native Zähler
f773895f-ac39-4b3e-9e85-d001055b9ff9/native-audit-proof.json,
SHA-256 959979976afa6827ef0174f6f2d5b114829d841c2b925becbe7af82f40f8ea7c;
eigener konsistenter lesender Nachbeleg 035bda50-861d-4254-ae02-c0176a059328/native-test-catalog-read.json,
SHA-256 b8b143affd3f9e034abd11c1c69ec36dc2f61f1174bdb7717dfff7f5f6e282ca.
Unabhängiger Vergleich **31/31**:
c61fcad9-e595-4512-bcc5-a44c2650b977/native-33-first-and-repeat-comparison.json,
SHA-256 d6dcb52c5f77c57a087cd8797738bb2a52ebb2789f190d41b46afcfccaf98b74.
Erstlauf: sieben Taxonomiestichwörter/IDs erhalten, nur fünf erwartete MOV-Zeitfelder geändert,
Dezember-/2027-Zuordnungen entfernt; vier Kontrollen samt allen FN-Werten/Keywords exakt unverändert.
Statistikzahlen gleich und Video ausgeschlossen; legitime Buchführung beim Erstlauf Revision 14→15 und
generatedAt 14:05→14:25 getrennt erfasst. Bei der Wiederholung sind dagegen **alle fünf vollständigen
Einträge einschließlich FN-Zeitstempeln, sämtliche tatsächlichen Keywordrelationen und die gesamten
Statistikvariablen einschließlich Revision/generatedAt exakt gleich**. Kein weiterer Reparaturdurchlauf nötig.
Dies belegt native neue Zeitkeywords; neue Taxonomiestichwörter bleiben getrennte native Abnahme.

**Original und Übersicht abschließend wiederhergestellt:** Original zuerst aktiviert und ausdrücklich
auf .33 neu geladen, passendes vollständiges Produktionspaar geprüft. Danach die deaktivierten privaten
.32-/ .33-Registrierungen nativ anhand ihrer exakten Pfade entfernt, Original abschließend aktiviert
vorgefunden und geprüft. Lightroom deaktiviert nach dem Entfernen derselben Toolkit-ID das Original
zwischenzeitlich ebenfalls; kein Daten- oder Belegordner gelöscht. Hauptkatalog über den nativen
Zuletzt-verwendet-Eintrag **D:/Lightroom Katalog/Lightroomkatalog aktuell.lrcat** normal wieder geöffnet.
Frische Abschlussanzeige: genau **ein** FN-Eintrag am regulären Projektpfad, tatsächlich geladene und
aktivierte Version **0.4.24.33**, 273.485 Taxa, master-20261013143021566 /
lightroom-dd834fb15dbd6f1c3257 und übereinstimmende CoL-Herkunft. Beleg
ad7821a8-803d-49d8-a399-e4e48ccc5468/native-audit-proof.json,
SHA-256 bb04b1b1bd566d64f71fc8e570178ba7afeb76b678099deb735477ca197412d9.
Manager anschließend geschlossen, Hauptkatalog zur normalen Nutzung offen. Kein neuer FN-Massenlauf,
Hauptkatalogscan, Statistikaufbau, Taxonomieaufbau, Backupwechsel, Commit/Push oder Deployment.
Alle neuen Belegsitzungen regulär geschlossen; bestehende Belege und private Dateien bleiben erhalten.

**Dokumentations- und Quellenabschluss dieser Runde:** Die fünf betroffenen Fach-/Einstiegsdokumente
auf .33, bestandene Erst-/Wiederholungsprobe, 31/31-Nachvergleich, sechs Exporte und abschließend
wiederhergestelltes Original synchronisiert. Lokale Verweise in **80 Markdown-Dateien** und
`git diff --check` bestanden. Frischer Hashabgleich nach den nativen Proben bestätigt weiterhin
**alle 126 Quellen des bestandenen Gesamtgates unverändert**. Änderungszwischenstand vor dieser
Abschlussnotiz: `git diff --stat` kumuliert seit Auditbeginn **131 versionierte Dateien, 12.905 Ergänzungen,
5.135 Löschungen**; zusätzlich 18 neue Quelldateien, darunter `KeywordIdFinalizer.lua` mit 288 Zeilen.
Dies ist der Umfang der gesamten unveröffentlichten Auditserie, nicht nur der heutigen Bereinigung.

Nächster fachlicher Abschnitt bleibt Explorer/Lightroom nach Felix' Reihenfolge: weitere native
Artassistent-/Wiederanlauf-/Zugänglichkeitsfälle und noch nicht belegte Lightroom-Neuanlage von
Taxonomiestichwörtern, Favoriten-, Konflikt- und genaue Rücknahmefälle. Der aktuelle Abschluss ist keine
vollständige native Lightroom-/Explorer- oder Gesamtabnahme. Danach isolierten Großrestore samt Programmstart
konkret vorbereiten, anschließend Website/CMS und GitHub und zuletzt Gesamt-Go/No-Go. Die registrierten
Testkopien müssen dafür nicht dauerhaft in Lightrooms Liste verbleiben. Keine neue Grundsatzentscheidung
für die übrigen lesenden oder isolierten Prüfungen erforderlich; Großrestore, Löschziele und externe
Veröffentlichung behalten die bereits festgelegten konkreten Freigabegrenzen.

### 10.32 Fortsetzung Explorer und Lightroom nach Reparaturabschluss – 15. Oktober

Felix fragt nach Voraussetzungen und beauftragt bei fehlender Blockade die unmittelbare Auditfortsetzung.
Frischer Abgleich mit §10.31: keine noch offene neue Grundsatzentscheidung oder Reparatur-Vorabfreigabe,
die die lesenden und isolierten Prüfungen aufhält. Die zuletzt geprüfte .33-Orts-/Zeitrunde samt vollständigem
Nachvergleich und Original-Rückstellung ist abgeschlossen. Restliche native Explorer-/Lightroom-Fälle
sind Teil des bereits laufenden Audits, keine Voraussetzung für einen erneuten Auditstart.

Nächste eigene Runde: Artassistent mit aktuellem Frontend und echtem lokalem Server auf kleinem eigenen
Bestand, Schließen/Fortsetzen desselben gespeicherten Auftrags, echter Abbruch und späte Medienantworten.
Vor Start werden künstlicher Bestand, sämtliche Speicherpfade, externe Wirkungsgrenzen, Herkunft und
Stopweg gebunden. Bisherige §10.20-Browserrunde belegt Fokus/Listen/Dialoge, nicht den ganzen gespeicherten
Artanlageweg. Parallel lesender Abgleich der minimalen restlichen Lightroom-Favoriten-/Konflikt-/
Rücknahmerunde; keine gleichzeitige native Bedienung und keine produktive Katalogaktion durch Agenten.

Ein Dokumentationswiderspruch im Artanlagevertrag korrigiert: Der Schwarzstorch-Abbruch ist seit 5. Oktober
als gezielte Nutzerbestätigung anerkannt und wird nicht erneut pauschal als unerledigt bezeichnet. Die
weitergehenden Soundreset-/Wiederanlauf-/späten Medienfälle bleiben getrennte Auditnachweise. Die vier
sichtbaren Assistentenschritte entsprechen dagegen dem aktuellen HTML und Controller; keine Änderung
der Schrittzahl erforderlich. Keine Art angelegt oder Anbieterabfrage durch diesen Dokumentationsabgleich.

**A-44 vor Korrektur unabhängig reproduziert:** Die unveränderte Quelle
`species-explorer/public/app-new-species-workflow.js`, SHA-256
a792003168a7890fe0d277c2b07faa71a7d90740643b02dd4f0242db4ed784ff, akzeptiert alte Antworten nach
Schließen/Wiederöffnen ohne Bindung an den aktuellen Öffnungsvorgang. Kontrolliert verspäteter
Sessions-Erfolg schaltet den bereits neu bedienten Portraitschritt 2 auf alten Auftrag in Schritt 4;
später Pipeline-Status schaltet ihn auf alte Kartenprüfung in Schritt 3. Ein alter Sessions-Fehler ersetzt
die neue Formularmeldung. Leere alte Sessions-Antwort ruft nach Schließen Referenzinitialisierung und
Fokusfunktion auf; tatsächlicher Browserfokus wird aus dieser VM-Probe nicht behauptet. Ununterbrochene
Wiederaufnahme ist als Kontrolle erfolgreich. Beleg
415c068d-6fec-4218-a4e4-0d496e29728c/new-species-open-response-race-repro.json,
SHA-256 4048fa0f2a19bec8355c7afb1398d0e5943139ae95ce82f5393d3b2e214eeb31.
Nur im kopierten vorhandenen Testharness wurde ein gezielt verzögerbarer Antwortpfad ergänzt; keine
Produktquellen, Daten, Oberfläche oder Netzwerkverbindung durch die Reproduktion verändert.

Originalserver-Vorprüfung unter 248c80ce-685f-4179-a42b-20acfe8ef9da regulär beendet, bevor die Korrektur
beginnt: Initialisierung und eigene Amsel-Oberfläche erreichbar, 187 Quellen unverändert, keine neue
Art angelegt. Alle vier versuchten externen Versionsabfragen an ChecklistBank wurden vom eigenen
Netzwerkhaken gesperrt; keine externe Anfrage ausgeführt. Tab geschlossen, Server/Session geschlossen.
Diese Vorprüfung ersetzt keine Artanlage-Bedienabnahme; nach Korrektur folgt ein neuer gebundener Lauf.

**A-44 korrigiert und unabhängig geprüft:** `dialogGeneration` bindet jede Öffnung und wird beim
Schließen/Zurücksetzen ungültig. Sessions-, Status-, Fehler- und Pollingfortsetzungen einschließlich
beider verschachtelten Datenladewege prüfen ihre Generation vor Zustandsänderung und Rendering.
Keine zusätzliche Schließsperre. Regressionen vor Korrektur: zehn erwartete Fehler, 21/31 bestanden,
`12b7881d-1317-4985-b61c-4bc3d75abe85/open-generation-red-result.json`, SHA-256
14d8e9de5bf67db9f8514e9c95e2e27869e4405d48636a616fcc71c3daee5ea3.
Danach **32/32** bestanden, `67b79cb6-cbe5-4002-aeb0-95cd442ef334/open-generation-final-green-result.json`,
SHA-256 1bc927f1db0f8751cc679e8aa1767270549ce2ecd66837b3fc9bdcd79117b505.
Unabhängiger lesender Review ohne Blocker; Produktquelle SHA-256
800c318ae55dd82bf0807d146013c21cdabbb2b0f864b0377c588a0d0581c3ab,
Regressionstest SHA-256 93b602e19ffedcacd0818d4b8eb1f5d9ed8205dd0b601c46cfaa34bdd84b96be.

**Echte eigene Browserrunde nach Korrektur bestanden:** Originalserver, Router, Frontend und
persistierte Artanlage auf vollständig eigenen Pfaden unter
`7a0e3939-3b99-4c13-b48e-f69db179d141`. Externe Anfragen/Kindprozesse durch eigene Testhaken gesperrt;
acht versuchte CoL-Metadatenabfragen vor Netzwerkzugriff abgefangen, keine acht Produktfehler.
187 Runtime-Quellen unverändert. Eigene Art Auditvogel / Testus avis einmal gespeichert und gezielten
Suchlauf einmal gestartet. Fehlende Karte hält Import/Überspringen erreichbar. Schließen/Wiederöffnen
und kontrolliertes `app.close`/erneutes `createExplorerServer` im selben Prozess und Port erhalten
dieselbe Artanlage 41d6edfc-16ad-4bf6-a47d-a13f1f9e2bd7 und denselben Lauf
beb8fe91-1359-4168-a284-dcb65a1b1827. Kein harter Prozess-/Windows-/Electron-Neustart daraus abgeleitet.
Karte überspringen und Soundabschluss erreichbar; Veröffentlichung korrekt gesperrt. Auch die künstliche
Ausgangs-Amsel besitzt bewusst fehlende Assets: keine vollständige positive Medien-/Veröffentlichungsprobe
und keine allein auf Auditvogel-Karte eingegrenzte Veröffentlichungssperre behauptet.

Danach echten eigenen Abbruch bestätigt: acht gebundene Ausgangszustände wiederhergestellt
(sieben Dateien bytegleich, pending-review weiterhin abwesend), nur kleine fünfteilige Abbruchquittung
erhalten. Neuer ungespeicherter Portraitentwurf Neuer Auditvogel / Testus nova bleibt vollständig gleich,
nachdem die vor dem Abbruch absichtlich zurückgehaltene reale Sessions-Antwort freigegeben wird.
Journalreihenfolge: Abbruch 18:30:37.618 UTC, neue Vorschau 18:30:56.687 UTC, alte Antwort erst
18:31:09.901 UTC. Danach neuen Entwurf verworfen; nur Ausgangs-Amsel sichtbar. Keine Produktdaten berührt.
UI-Beleg `98027bec-4442-49d9-a5e6-de5466f5ae25/browser-ui-proof.json`, SHA-256
bedfc8bbd72b40e6203203665bf62639568e24125e71896cc0ceb37db97900e0, samt
`artassistent-after-old-response.jpg`. Unabhängiger Inhalts-/Hashvergleich **387/387** Assertions,
einschließlich 187 Quellenbindungen, nicht 387 verschiedene Bedienfälle:
`50058a91-0c35-48d8-8077-4a436a40e32d/explorer-browser-file-comparison.json`, SHA-256
672020b2d10c7c03deed2e0911705dbc82332b1304385c3e84cc1522783a79e4.
Server/Browser beendet, alle Belegsitzungen geschlossen. Am 16. Oktober zusätzlich den während dieser
Runde erkannten falschen Speichersatz in Schritt 1 korrigiert: lokale Anlage erfolgt nach dem Portrait,
nicht erst im letzten Schritt. Kein neuer Funktionsumfang.

**Gesamtgate vom 15. Oktober mit einem NAS-Testfehler beendet:**
`fe94a99f-7e68-45ee-86aa-62fbfc5b8b86/quality-result.json`, Exit 1, UTC 18:26:08–18:37:49,
126 Quellen unverändert; Log-SHA-256 7794e991ed1ac863c8abc8bf8e11416110115b07ea1de8544d2c59b48f9958c3.
Der Rotationstest sah nach synchroner Entfernung kurzfristig eine zusätzliche leere
`.NAS-ROTATION-…PENDING.tmp`-Datei. Isolierte Diagnose: 30 erfolgreiche Rotationen; in Runde 23
zunächst null Byte großer Rest, nach 250 ms ohne Eingriff verschwunden. Kein bestimmter Fremdprozess
als Ursache bewiesen. Beleg `02dd02b5-a107-4cfb-9b3c-0e5efae8380e/diagnosis-result.json`, SHA-256
283e2895c60f200031edac0ae7928c7bf5c727ba249ec487bf0c35693691fafb.

**Enge Testkorrektur am 16. Oktober:** Nur der isolierte Rotationstest beobachtet maximal zwei Sekunden
in 25-ms-Schritten die vollständige Verzeichnisliste einschließlich versteckter Dateien und Verzeichnisse.
Exakter Abschlussvergleich bleibt erhalten; keine Filter, Wiederholung der Rotation oder Entfernung
zusätzlicher Inhalte. Dauerhafte normale/versteckte Zusatzdatei und Zusatzverzeichnis führen weiter zum
Gleichheitsfehler. Root-Review bestätigt unveränderte produktive Sicherungs-/Rotationsskripte.
Gezielte Gruppe **14/14**, keine Fehler/Skips/Abbrüche:
`e1af2468-3766-4727-867a-a61249cba06d/completion-check-result.json`, SHA-256
f0580516bb4a0ba7d21747b516c8f058efeacb0aa5a994dcc5f6c98eb25e635f.
Weitere 30 winzige eigene Rotationen alle exakt mit Archiven 01/05/06 und Kontrollstand 01 erfolgreich;
diesmal kein verzögerter Rest, deshalb kein zweiter positiver Verzögerungsbeleg behauptet:
`a14ab072-a56c-40c9-89ca-e4026b39c999/completion-rounds-result.json`, SHA-256
b15db80a52bacc06a9caa62a5edadd08efaba54a4f63e25339fb500fa7d5f2a7.
Testquelle SHA-256 6bdd1cdd061099571b55b83a377d25ec45d3d5a1fdcb560421aea46b0fc0976e,
Produktivrotation unverändert db97a0be07eb334df4c02ca2c0f0fd5779ce73b11bc9ea7caf8e3c4c69bf7796.
Beide neuen Sessions geschlossen/0 Operationen/keine Helfer. Neue vollständige Prüfung unter
`4a22f3b5-4536-4c8d-940c-32731176718a` gestartet; Erfolg erst nach tatsächlichem Abschluss berichten.

**Native neue Taxonomiekennung erstmals vollständig gespeichert:** Eigener Fünf-Eintrag-Katalog,
geschützte .33 am exakten privaten Pfad 9cc1cfcd-1fb7-41ba-8a7d-31c2912fabb6, passendes Zweitaxapaar.
Nur eigenes MOV: altes Keyword 603 nativ bewusst in manuellen Namen Audit Altobjekt Sciurus 603
umbenannt. Einmalige Sciurus-Zuweisung erzeugt echte neue Relation 1621 und speichert bereits im Erstlauf
alle sieben Taxonomiekennungen 579/583/587/591/595/599/1621; manuelle 603 bleibt erhalten.
Mai/2028 samt Zeitkennungen 1593/1595 bleibt korrekt. Vorher
`63e9d254-1a7d-4a12-8bfb-6331b893f1f2/native-test-catalog-read.json`, SHA-256
d390ddda98a45f650f762284f5ebf9cf68502d644413e10b94bf5faefeaec123;
nach Umbenennung `9887f2fd-54a1-489f-b57f-3e3dc5ec4849`, SHA-256
5f5541e3dbb3439cefaa779dc3132f01d89c2bcabbb0da8ce010d4b563fe8b3e;
nach erster Zuweisung `714f7ec2-39eb-48c9-a8f8-4cf367d0070c`, SHA-256
102eb688528ccfada1a0e76279a24a1d49d46b24f8f381505ecf2a9e0f6793a8;
jeweils `native-test-catalog-read.json`. Native Erfolgsmeldung
`19630cf2-820c-415b-b543-3133aea80feb/native-audit-proof.json`, SHA-256
9085e62d22213ac24cf0d3285ae4017b2dfa8d7efb31f2e9dc79b5d285157d38.
Am 16. Oktober ist nach Nutzer-Neustart zunächst Hauptkatalog mit Testkopie offen; deshalb zuerst
Original .33 wieder aktiviert. Nun ausschließlich eigenen FN-Audit-Katalog geöffnet und geschützte
Testkopie dort aktiviert. Reopen-Beleg `28e345f1-2b9e-4794-8365-3b907b561914`, SHA-256
3e31860cd667cef45be03a069cf3f0711ded2db1c845122eb180a1a42cdd061b.
Unveränderte Wiederholungsprobe, unabhängiger Nachvergleich und erneute Original-Rückstellung folgen.

**Gesamtgate 16. Oktober erfolgreich:** `4a22f3b5-4536-4c8d-940c-32731176718a/quality-result.json`,
08:17:02–08:24:56 MESZ, **50 Gruppen / 1.805 Tests bestanden**, Exit 0, keine Fehler/Abbrüche/Skips,
alle 127 gebundenen Quellen unverändert. Log-SHA-256
f210c69b5fecc5d995c89f6df78e847105d547953ba681614c038d0c65dc6aae.
Die 14 zusätzlichen Tests gegenüber dem .33-Gate sind 13 Artassistent-Regressionen und die eine
NAS-Verzeichnislisten-Gegenprobe. Keine produktive Sicherung oder Rotation durch dieses Testgate.

**Neue Taxonomiekennung samt unveränderter Wiederholung nativ abgenommen:** Die einmalige eigene
FN-Wiederholung meldet 0 Taxonomieänderungen / 3 aktuell, 0 Orts-/Zeitänderungen / 3 unverändert,
0 unauflösbare Taxonomien / 0 Schreibfehler. Zwei quellenlose Einträge ohne Ort und GPS sind erwartete
Testeingaben. Native Zähler `11a9293e-bff8-469a-a4e7-fcbdaa1c5f94/native-audit-proof.json`, SHA-256
1100b56bc98609d90d8a8ae547c1242cc7495fb5e0b0f9379e144dab0fb0f895.
Nachbeleg `f453ed71-be21-41b2-8487-d4cd7ddb3e68/native-test-catalog-read.json`, SHA-256
b3397dea9aa680069a48fb9ad84170e5d95945e722af352db0f1b8640f4cf5a6.
Unabhängiger vollständiger Vergleich **178/178** und **11/11** Korruptionsgegenproben:
`3cde9aaa-91b3-4987-bae0-c24d63f8ef0d/native-taxonomy-new-id-comparison.json`, SHA-256
9e3f4650f2121056ee9e2003e5cfa011b0ab193e95f45bc1afdfcb9f4dbf4dad.
Erstlauf ändert ausschließlich MOV-Taxonomiekennungen, assignedAt und fügt tatsächliche Relation 1621
hinzu; manueller Name 603 bleibt. Statistik nur Revision 15→16/generatedAt als legitime Buchführung,
fachliche Aggregate identisch und MOV weiter ausgeschlossen. Alle vier Kontrollen unverändert.
Bei Reopen und Wiederholung sind dagegen alle fünf vollständigen Einträge samt sämtlichen FN-Werten
und Zeitstempeln, reale Stichwortrelationen, Ordner, Schema und gesamte Statistikvariablen exakt gleich.
Alle fünf Eingänge gehasht unverändert, Ergebnis- und UI-Belegsitzungen geschlossen.
Favoriten-, Konflikt-, genaue Rücknahmefälle und abschließende Original-Rückstellung bleiben getrennt.

**Native positive Favoritenrunde .33 bestanden:** Bei geöffnetem eigenen Zweierstapel nur Foto 193
gewählt und Art-Favorit gesetzt; native Erfolgsmeldung für Alpenstrandläufer. Danach nur Foto 194 gewählt.
Ersetzen-Rückfrage zuerst mit Nein, behalten abgewiesen und anschließend erneut geöffnet mit Ja,
ersetzen bestätigt. Native Erfolgsmeldung erneut Alpenstrandläufer. Vier konsistente eigene Katalogbelege:
Ausgang f453ed71, gesetzt `4e01f08f-7b7f-42cd-b47e-2df609ccf4f1`, abgelehnt
`d580fcc3-8cfb-4857-9058-0576d0bffea0`, ersetzt `bb0cbb6f-e00b-47dc-9c0f-017a8aeab116`,
jeweils `native-test-catalog-read.json`. Unabhängiger Vergleich **123/123** und **11/11** erkannte
Korruptionsgegenproben: `fce4a531-3dbd-414b-921f-ebfddad6b048/native-favorites-comparison.json`,
SHA-256 be199b57aae0586f0451d20037a44de2b3622d8dce24351800af41e69ccb338a.
Setzen ändert nur referenceImage 193 no→yes, genau eine Favoriten-UUID im Artindex, Count 0→1 und
Revision 16→17/generatedAt. Ablehnung lässt alle fünf vollständigen Einträge, Keywords, Schema, Ordner
und gesamte Statistik exakt gleich. Bestätigung ändert nur 193 yes→no / 194 fehlend→yes, richtige
Favoriten-UUID 700EF59E-E9B0-4519-80A5-1C861DF12C5F, Revision 17→18/generatedAt; Count bleibt eins.
Alle Taxonomie-/Ort-/Zeitwerte samt Zeitstempeln und sämtliche realen Stichwortrelationen erhalten.
Kontrollen und Videoausschluss unverändert; eigene Vergleichssitzung geschlossen.

**Taxonomierücknahme und verdeckter Stapelkonflikt .33 bestanden:** Nur eigenem Foto 194 zusätzlich
vorhandenes manuelles Kontrollstichwort ManualAuditKeep zugewiesen; Kopie 543 behält dieselbe Relation.
Danach nur Taxonomie 194 nativ entfernt. Genau acht tatsächliche Taxonomierelationen entfernt,
Taxonomiefelder geleert/Favorit zurückgenommen. Alle sechs FN-Orts-/Zeitrelationen, deren vollständige
Werte/Zeitstempel und ManualAuditKeep 575 erhalten; vier andere Einträge exakt unverändert. Statistik
Taxonomiefotos 2→1, nur April-Taxonomiebeobachtung/Favorit entfernt, allgemeine Ort/Zeitaggregate erhalten,
Revision 18→19. Danach Sciurus nur 194 zugewiesen: genau sieben Taxonomierelationen einschließlich
1621 vollständig ergänzt, April/2025/gespeicherte Orte/Zeitstempel/manual575 unverändert;
Statistik je ein Calidris-/Sciurus-Foto, Revision 19→20, MOV weiter ausgeschlossen.

Zweierstapel 193/194 im Fotoordner eingeklappt, nur oberste 193 sichtbar ausgewählt. Native Zuweisung
erfasst zwei Fotos einschließlich eines verborgenen Mitglieds. Calidris-Zuweisung weist genau einen
Artkonflikt ab: „1 Foto besitzt bereits eine andere Taxonomie. Es wurde nichts geändert.“ Alle fünf
vollständigen Einträge, FN-Zeitstempel, tatsächlichen Stichwortrelationen und die gesamte Statistik
einschließlich Revision/generatedAt, Ordner und Schema bleiben gegenüber dem Konfliktvorzustand exakt
gleich. Native Anzeige `af1b71f7-bfe1-4f65-96f0-7fabd9a15d45/native-audit-proof.json`, SHA-256
98cd2e6f5e9bd5dcc57c4edfc3a247327cc7904976cb22f0f249b16a5a27bfbb.
Vier Vor-/Nachbelege e13eee79 / 2bbdedcc / 58764e05 / 54e0d1a5, jeweils
`native-test-catalog-read.json`, unabhängig vollständig verglichen: **102/102** und **14/14** erkannte
Korruptionsgegenproben, `1b159cce-857b-4b30-9371-a347b516d02d/native-removal-stack-conflict-comparison.json`,
SHA-256 1ebf6baa87dfcfee4bfe85d0d03aeb9ecd2165b1b7f9b9b8d0dae019f3118bc8.
Alle Eingänge unverändert, Vergleichssitzung geschlossen. Dieser Leser bindet keine originalen IPTC-
Ortsfelder; deren Unverändertheit durch diese Runde allein nicht behauptet. Vollständige FN-Rücknahme
und getrennte Orts-/Zeitrücknahme mit ergänztem eigenen IPTC-Vor-/Nachbeleg folgen.

Original-IPTC-Nachweis ergänzt: schmale Schemaabfrage ausschließlich im eigenen Fünf-Eintrag-Katalog,
`fb4b5b45-709b-4a30-bbe1-31fec1205fd0/own-iptc-schema.json`, SHA-256
a03db02d95f4b2bf3a02ad94c75fcdd03255f1940e554a8db7f787c738e05c29.
Neuer vollständig gelesener Helper `d0e1dba2-4613-4cca-9bb2-2bd76c4db6ec/native-test-catalog-with-iptc-read.mjs`,
SHA-256 65f389cd76b5d5e9395423bc9b4cb1f5d73d25b50b7bbba76b11db9a35a31035,
weiter readOnly/query_only/konsistente Transaktion/harter eigener Katalogpfad/20er-Grenze.
Zusätzlich je Eintrag die fünf originalen IPTC-Ortsfelder gespeichert. Erst dieser folgende Vor-/Nach-
Vergleich kann deren Erhalt belegen, keine rückwirkende Erweiterung früherer Nachweise.
Vor vollständiger FN-Rücknahme bei 194 nochmals eigenen Sciurus-Artfavorit gesetzt. Vorbeleg
`8179acfa-6ae4-4539-821c-ed960b9aa516/native-test-catalog-with-iptc-read.json`, SHA-256
03720486e01bf4287c035725b322d43bf9dce9b1ddc12ccb9233c10f94e5036f.
Native Rückfrage nennt genau ein Foto; eigene bestätigte Rücknahme meldet danach **1 Taxonomie,
1 Favorit, 7 Taxonomie- und 6 Orts-/Zeitstichwortzuordnungen entfernt**. Anzeige
`e39ae11b-1078-4284-8f7f-84a208690420/native-audit-proof.json`, SHA-256
08deba7c427c643bb7f3798ecd0f1d46a988b7c0f7a56c858772d159943de764.
Nachbeleg `bf29f981-8c53-45b2-8988-ba68b9228a6b/native-test-catalog-with-iptc-read.json`, SHA-256
ba4077fdb975578cd9ee0c2cf624ffbc937394ab67b06e8679ad26c37909ff2b.
Unabhängiger Vorvergleich bestätigt nur ManualAuditKeep575 bei 194 erhalten, sämtliche ursprünglichen
IPTC-Felder und Aufnahmezeit bei allen fünf Einträgen exakt gleich, vier andere Einträge unverändert.
Die gebundene Gesamtfolge mit Wiederzuweisung und getrennter Orts-/Zeitrücknahme wird noch abgeschlossen.

**Vollständige FN-/Ortszeitrücknahme und Ergänzung .33 unabhängig abgenommen:** Nach der oben
gesicherten vollständigen Rücknahme nur 194 Calidris zugewiesen. Native Meldung genau ein Foto; acht
Taxonomie- und sechs Orts-/Zeitrelationen vollständig ergänzt. April/2025 und vier gespeicherte Orte
wieder vorhanden; manuelles575 erhalten. Danach im Taxonomiefenster ausschließlich Orts-/Zeit entfernen
bestätigt. Native separate Information: ein Foto geändert, sechs verwaltete Zuordnungen entfernt.
Alle acht Taxonomierelationen und vollständige Taxonomie samt Zuweisungszeitstempel bleiben erhalten.
Zuletzt über FN Wildlife verwalten → Ort und Zeit → Hinzufügen nur 194 ergänzt; native Meldung ein
Foto geändert. Alle sechs ursprünglichen Orts-/Zeitrelationen und Werte wiederhergestellt.

Fünf Phasen unabhängig vollständig verglichen: **183/183**, **19/19** Korruptionsgegenproben,
`76546c4f-370f-4da6-a12f-6f30b9782a44/native-all-fn-location-iptc-comparison.json`, SHA-256
8702b6ab301261ffbb722f73359cdd03151e5757538c480252a8cf0564367d4d.
Folgebelege 46cf96ec-7996-42fc-8cef-ee704d6baf3b / 6991abbb-1738-4388-add9-04c34a21fb26 /
e6865b22-78b4-4bf0-a258-6d113d7d2800, jeweils `native-test-catalog-with-iptc-read.json`.
Bei allen fünf Einträgen in jeder Phase ursprüngliche Aufnahmezeit und die fünf Original-IPTC-
Ortsfelder exakt gleich, bei 194 Deutschland/DE/Baden-Württemberg/Stuttgart/Audit-Testplatz und
03.04.2025 11:22:33.175. Keine darüber hinausgehenden GPS-/Metadatenfelder daraus abgeleitet.
Vier andere vollständige Einträge samt FN-Werten und realen Keywords unverändert; ManualAuditKeep auf
194 und virtueller Kopie543 bleibt. Statistik folgt den tatsächlichen Änderungen mit Revision21→22→23→24→25;
nach separatem Hinzufügen entspricht der Zustand der Calidris-Wiederzuweisung bis auf neuen erlaubten
Orts-/Zeitzeitstempel und Statistikbuchführung exakt. Video weiter ausgeschlossen. Alle Eingänge unverändert,
Vergleichssitzung geschlossen. Die wenigen zusätzlichen manuellen eigenen Testrelationen bleiben als
kontrollierter Belegzustand im eigenen Testkatalog, kein globales Stichwort gelöscht.

Die genannten neuen nativen Erst-/Wiederholungs-, Favoriten-, verdeckten Konflikt- und genauen
Rücknahme-/Ergänzungsfälle sind damit bestanden. Dies ist keine pauschale vollständige Lightroom-
Großbestands-, Identitäts-/Handoff-, DPI-/Screenreader-/Touch- oder Explorer-Gesamtabnahme.
Keine Produktquellenänderung während der nativen Runde; Plug-in-Version bleibt .33.

**Abschließende Rückstellung 16. Oktober:** Original am regulären Projektpfad aktiviert; deaktivierte
private FN-Audit-Registrierung am exakten Pfad 9cc1cfcd nativ entfernt. Alle Test-/Belegdateien bleiben
erhalten. Lightroom deaktiviert bei derselben Toolkit-ID auch das Original; deshalb anschließend
Original wieder aktiviert und geprüft. Hauptkatalog
`D:/Lightroom Katalog/Lightroomkatalog aktuell.lrcat` normal erneut geöffnet. Frischer Manager zeigt genau
**einen** FN-Eintrag, Originalpfad, grün aktiviert, Info und tatsächliches Lightroom-Statusfeld jeweils
**0.4.24.33**, keine Diagnosemeldungen. Vollständiges Produktionspaar weiterhin übereinstimmend:
273.485 Taxa / master-20261013143021566 / lightroom-dd834fb15dbd6f1c3257 /
col-xr-2026-09-25-316441. Abschließender eigener Beleg
`45091645-4b29-4eb7-beb9-33cd73789362/native-audit-proof.json`, SHA-256
40113d7b558593c1842e97d1f22577352a6a8d61a5fd19275ae11c03308f3d53.
Manager danach geschlossen; Hauptkatalog zur normalen Nutzung offen. Kein neuer Massen-FN-Lauf,
Hauptkatalogscan, Indexaufbau, Taxonomieaufbau, produktive Sicherung/Rotation, Löschung von Belegen,
Commit/Push oder Deployment. Sämtliche neuen nativen Belegsitzungen regulär geschlossen.

**Integrierte Dokumentations-/Quellenkontrolle dieser Runde:** Fachverträge Artanlage und Lightroom,
Roadmap und Taxonomie-Betriebsstand auf die tatsächlich abgeschlossenen eigenen Fälle synchronisiert.
Lokale Verweise in 80 Markdown-Dateien bestanden. Nach Abschluss der nativen Runde nochmals alle
**127 Quellen** des bestandenen Gates frisch gehasht: keine Abweichung. Kein neuer Gate-Lauf erforderlich,
da seitdem ausschließlich Dokumentation und eigene Belege ergänzt wurden. Kumulierte Auditserie vor
dieser Abschlussnotiz: `git diff --stat` **132 versionierte Dateien / 13.475 Ergänzungen / 5.146 Löschungen**;
dies ist nicht der isolierte Umfang dieser Fortsetzung. Weiterhin 18 neue Quelldateien der Auditserie.

**Frischer Restabgleich vor dem nächsten Abschnitt:** Keine neue Vorabentscheidung oder bekannte
Reparaturblockade. Bereits abgeschlossene neue Keyword-, Wiederholungs-, Favoriten-, Stapelkonflikt-,
Rücknahme-/Ergänzungs- und Exportfälle nicht erneut pauschal als offen führen. Produktive FN-Erfassung,
normales requestgebundenes Lightroom-Schließen und gemeinsamer Paarwechsel sind unter 10.24 real
belegt; kein zweiter produktiver Lauf allein zum Schließen alter Tabellen.
Gezielte Explorer-/Lightroom-Restabnahmen in dieser Reihenfolge:

1. Ein eigenes Taxon: globale Namenswahl, Rückwahl/Anbieterstandard und unmittelbare Sichtbarkeit
   zwischen eigenem Explorer und geschütztem Lightroom, einschließlich gebundenem Handoff soweit benutzt.
   Foto-IDs, Metadaten und reale Stichwortrelationen dabei unverändert halten (§6E, §7).
2. Kleine eigene native Statistikprobe knapp über der 500er-Checkpointgrenze: Pause/Fortsetzung und
   eigene zwischenzeitliche FN-Änderung, alter Index bis vollständigem gültigem Ergebnis erhalten (§6F/A-05).
3. Artassistent mit gültigem eigenem lokalen Bild-/Soundimport, Ablehnen/Zurücksetzen desselben Treffers
   und echtem Ende/Neustart eines separaten eigenen Serverprozesses bei selben gespeicherten Pfaden;
   abschließend echter eigener Abbruch. Failed-/freier Neue-Art-Zustand in derselben kleinen Umgebung
   zur praktischen A-37-Anzeige ergänzen (§6D, §7). Vorige kontrollierte Same-Process-Probe bleibt bestanden.
4. Dichteste Explorer-/Lightroomansicht: langer Name/Hinweis, Tastaturfokus, Tab/Escape und deaktivierte
   Hilfe, begrenzte Skalierungsstichproben. Echter Screenreader- und Touchnachweis bleibt ohne passende
   tatsächliche Umgebung eine getrennte Grenze, keine neue pauschale WCAG-Bescheinigung (§6G).

Komplexe produktive Identitätswechsel/mehrere Vollkataloge sind für diese Restabnahme kein angemessener
Testersatz. Anschließend wie beauftragt Großrestore mit Programmstart konkret vorbereiten, dann Website,
GitHub und Gesamtabschluss. Großrestore, Löschziele und Veröffentlichung behalten konkrete Freigabegrenzen.

### 10.33 Eigene positive Medien-/Prozessneustartrunde – 16. Oktober

Nach Abschluss der nativen .33-Matrix die nächste konkret offene Explorer-Abnahme begonnen. Zwei Agenten
erreichen bei der Vorbereitung ihre Nutzungsgrenze; keine fertige Vorbereitung durch deren Ankündigung
behauptet. Root übernimmt die kleine eigene Vorbereitung. Für diese Vorbereitung keine Änderung produktiver Quellen/Daten.
Vorbereitung `bf36fab7-9257-4a17-abce-e19df95a79d4/media-round-preparation.json`, SHA-256
3a9b55cab83f4ca71538e6d07cce1aac6abe710869e13cbab0dc29ced9309061: 125.856 Bytes für sechs kleine
synthetische Bild-/MP3-Dateien und zwei Helper. Tatsächlich vom vorhandenen lokalen FFmpeg erzeugt;
keine Tieraufnahme, kein biologischer Karten-/Portraitnachweis. Gesondert geprüfte Kopie
`dbb71f31-1074-468a-b441-93020eac0401/media-round-reviewed-preparation.json`, SHA-256
3a7d0ccd29afa9f8e92e328e80815846c161c8b1398e02ad0897dccda1084390.
Ein eigener Medienpfad erlaubt, vier unzulässige Prozess-/Netzwerk-/Fremdpfad-/relative Eingaben abgewiesen.
Echte FFmpeg-Leser werden vor Sessionabschluss abgewartet; Supervisor-/Kindkontrollpfade getrennt.
Beide Vorbereitungen geschlossen. Noch kein positiver Medien-/Neustartabschluss aus Syntax/Guards abgeleitet.

Eigener Supervisor unter `5c065f54-a635-4170-a7c2-736a3541fb4e`, Originalserver-Kind zunächst unter
`53d4b14a-ae16-4986-b522-1e6a1318fdfe`, Browser ausschließlich auf eigenem zufälligen Loopback-Port64425.
Gemeinsamer persistenter Bestand allein im `fixture`-Unterordner des Supervisors. Alle Daten-, Taxonomie-,
LR-, NAS-Pfade dorthin gebunden, erlaubte POST-Routen eng auf die eigene Artanlage/Medienprüfung begrenzt,
externe Requests und Veröffentlichung gesperrt. Originalserver/-Frontend/-Importprüfung, synthetischer
Offline-Suchworker mit zwei ehrlich gekennzeichneten Prüftönen. Geplanter Neustart beendet den tatsächlichen
Node-Kindprozess und startet einen anderen Prozess auf demselben eigenen Bestand/Port; kein Windows-Neustart.

Ausgangs-Amsel enthält echte dekodierbare synthetische Medien. Beim Browser-Vorabcheck fehlte zunächst
deren eigene Portraitbeschreibungsdatei; vor jeder Artanlage diese eigene Fixture ergänzt. Frische UI danach:
null Assetprobleme, ein vollständiger Bestand, Report konsistent. Keine Produktkorrektur aus diesem
Fixturefehler abgeleitet. Eigener begrenzter Vor-/Nachleser unter
`c3b5552a-0e75-481d-b581-0ba7e6aee2f3/media-fixture-snapshot.mjs`, SHA-256
16a225bc11786ad9e27e2616beb682f268b487ee9242ed27a8bf0f2b9b8b345e, erfasst ausschließlich maximal
zwei künstliche Arten und deren kleine eigene Dateien. Lauf/Browser und tatsächliche Medien-/Neustart-
Ergebnisse werden erst nach Ausführung ergänzt; Haupt-Lightroom bleibt Original .33 offen.

**Tatsächlicher Neustartbefund A-45:** Karte über die Original-Dateiauswahl importiert, neue Vorschau
mit ehrlicher synthetischer Begründung geprüft und als eigene geschützte Karte übernommen. Sound A ist
eine tatsächliche dekodierbare 3-Sekunden-MP3-Datei, kein bloßer UI-Platzhalter. Spektrogrammbild bleibt
ein synthetisches Prüfbild; daraus kein Nachweis einer echten Spektralanalyse. Creation
`2b51282d-ae52-4478-ba16-2534f1613695`, Lauf `f78ef756-d48a-4292-9dd4-e659df593052`.
Vor-/Nachlesungen `b381501e-1868-4293-a5bc-736e4a41172c/media-fixture-snapshot.json`
(SHA-256 2c7d60f353b9d31a5a43d2034a4d1d5065a26e4ca47f42c8951a1a274110600d) und
`ff50f4e9-98ee-4a20-abe0-08a74ab62f1f/media-fixture-snapshot.json`
(0f56310dc802be2a6a6b00d75a8cc55607b113a5e04fcf0976205eb3a13f6264): jeweils 20 Dateien,
114.938 Bytes. PID 13172 geordnet mit Exit 0 beendet, neuer Originalserver PID 2072 auf demselben
eigenen Bestand/Port gestartet. Browser danach in wiederkehrender allgemeiner Medienprüfung gefangen.
Beleg `4709b288-4b65-45f0-896c-bb16f41e1de0/browser-ui-proof.json`, SHA-256
f5475eb7aa0ce9d007161ca3ad7279becaef16f99f042b414420ce8129983f89. Beide Kindprozesse mit
unveränderten 187 gebundenen Quellen geordnet geschlossen, Supervisor geschlossen/0 Operationen/0 Helfer.

Erste Korrektur unterdrückt die allgemeine Zwangsprüfung ausschließlich für eindeutig gespeicherte,
geleitete Ein-Art-Aufträge und führt beide Statusaktionen in denselben Artassistenten. Keine neue
Artanlage/Suche durch das Öffnen. Reguläre Verfügbarkeit, konkrete Sessions-/Creation-/Run-/Artbindung
und A-44-Dialoggeneration bleiben wirksam. Nichtgeleitete Reviews und Lesefehler behalten ihren Weg.
Verlässlicher RED-Lauf `51178ec7-e63c-4895-a791-364b2d2825eb/guided-resume-final-baseline-red-result.json`,
SHA-256 da6a02c75e929051e05e4547e3600f0b37dc758bbea9766fef2a5352219f0f2c: 71/76 bestanden,
fünf erwartete Fehler. Frühere zwei weitere Fehler im ersten RED waren unvollständige Test-DOM-Labels,
keine zusätzlichen Produktfehler. Zusätzlicher Run-/Creation-/Artwechsel nach Sessions zunächst RED
76/77, danach GREEN `5a24169c-1657-4f90-8952-d697d73f668c/guided-resume-final-green-result.json`,
SHA-256 512303353f35f83041cc3b0924eda76e4eee89bb8c7eb16b5f6e74959e9fcfc4: 77/77, keine Skips/Abbrüche.

Unabhängiger Review reproduziert noch eine engere Wartegrenze: Bei gleicher Creation/Art, aber neuer
Run-ID während der Verfügbarkeitsantwort wird der geänderte Stand als neue Basis akzeptiert.
Drei kleine VM-Fälle einschließlich passender Positivkontrolle und bereits korrekt abgefangenem
Wechsel nach Sessions: `dc60d0fb-0d58-46ee-b228-595d989f1e20/guided-resume-availability-identity-repro.json`,
SHA-256 4d577e6f7bbd7449bf1aa9c29c983dfa5e9bf9bd90c3546410f54d97dc4293cf. Keine UI oder
Produktdatei geändert. Noch kein finales unabhängiges Go; vollständige ursprüngliche Klickidentität wird ergänzt.

Eigene Fortsetzungsrunde auf derselben erhaltenen Fixture mit korrigiertem Frontend: neue Vorbereitung
`3d381abf-8d4b-4c80-b687-fe6b46437ce7/A45-resume-preparation.json`, SHA-256
b54234cd9b48acbe176ab3a116223d8869c2d8808ea3581f28d142d3b7e38a1d, ohne Neubesäen des Bestands.
Supervisor `779b36e7-80ce-4825-954a-f146b9a97649`, Kind `2b7fa9a0-a506-4bdd-a1ca-2b449e1373e1`.
Frische Startseite zeigt „Artanlage fortsetzen“, keine allgemeine Zwangsprüfung. Klick öffnet Schritt 4,
gleiche Creation/Lauf/Karte/Sound; lesender Stand `2f83ea5d-90b5-42cd-a77c-a45f6f03d547/media-fixture-snapshot.json`,
SHA-256 2c94ae37994aef1b3fc507c85ff35eaec9766e48e2b7c72712864857de81fd03. Browserbeleg
`790e40be-59a3-458f-98de-2b239df535df/browser-ui-proof.json`, SHA-256
6b190476ed300e007f8967e5244141b44d30ddb8106ca238080d2aa3e726183d.

Sound A tatsächlich abgelehnt, A artbezogen gespeichert, Suchworker bietet B (660 Hz) an; danach
ausdrückliche Rückfrage „Frühere Sounds erneut suchen“ bestätigt. A wieder zugelassen, gerade angezeigtes
B abgelehnt und A (440 Hz) erneut gefunden. Kein zweiter Artanlageaufruf, gespeicherte manuelle Karte bleibt.
Dateibelege `364abb12-ca0e-48b1-ba42-ea71333531d7/media-fixture-snapshot.json`
(c109fabf0805c93f0ed053b835ca67c824c02a98afe4058c261836f46bffe5f2) und
`0dda5243-e0b7-430a-8cbc-b715db3a1d93/media-fixture-snapshot.json`
(d91a23b14e671fb9ef151691672b24c01a613fc10335105992451f8521036b60).
Browserbeleg `5495c5d5-17ba-4239-b171-ea543fff316f/browser-ui-proof.json`, SHA-256
c9b15a06f1084e0e7e316d59865015ed9b5a4ea33e998e206789389a61017a20. Fenster geschlossen,
Auftrag zum finalen Neustart erhalten; eigener Server/Supervisor danach geordnet beendet. Soundübernahme,
Veröffentlichungsschutz, exakte Abbruchrücknahme und abschließende Quellen-/Dateivergleiche noch offen.

**Finale A-45-Korrektur:** Der ausdrückliche Klick bindet jetzt Status/Creation/Run und kopierte Zielobjekte
vor jeder wartenden Verfügbarkeitsabfrage. Geänderte Identität wird vor Formularreset, Öffnung und
Sessions-Lesung zurückgewiesen; danach bleibt auch die frische Statusprüfung vor `loadData` an genau
diesen ursprünglichen Snapshot gebunden. Normales Neue-Art-Öffnen behält den später gelesenen Status.
Sechs unabhängige neue RED-Fälle (Austausch/In-place × Creation/Run/Slug), Vorschlagsbeleg
`829f01f3-ef64-4237-9fb1-35678d76096d/guided-resume-availability-test-proposal-result.json`, SHA-256
0d096c77b9d9e634e028221ba99cf937cd04aaeab580a07ce671c2904a966e3e. Integriert **83/83 bestanden**:
`ca52aa1a-74a7-4d72-90f6-ab2841461fef/guided-resume-complete-green-result.json`, SHA-256
341402f7e357e606f541d9b7cb251d514be2b8c35b6b5498b3ff0c87d491afff; keine Skips/Abbrüche.
Abschließendes unabhängiges Code-Go `89de78c6-69a7-437e-88ee-180ceb76b2d8/guided-resume-independent-final-review.json`,
SHA-256 b3f8778d79b032d06576679ba956e924abd8245987f3158af5ed229d755e0eaf.
Ein älterer Drei-VM-Prüfer besitzt eine unpassende Mock-`hidden`-Beobachtung für den jetzt vor Öffnung
gestoppten Dialog; daraus kein weiterer Abnahmezähler und kein Produktfehler. Keine Wiederholung dieses Helpers.

Erster Gesamtgate auf der vorigen 77er-Fassung 14:16:14–14:23:56 MESZ: **50 Gruppen / 1.813 Tests**,
Exit 0, 127 gebundene Quellen unverändert; `6e9a0c61-98dd-41fe-9d33-882ef4f19062/quality-result.json`,
Log-SHA-256 6a28d76739cd95afec6a646f9153ca5dae7396f441cac57a5da1bb48476d82bc.
Wegen der anschließenden sechs neuen Fälle und engen Korrektur gilt dies nicht als finaler unveränderter
Quellnachweis. Neuer vollständiger Lauf unter `12fab358-287b-4a3d-927a-31b4f2063ae3` gestartet.

**Eigene Browserrunde auf finaler Quelle:** Supervisor `02af5b4a-4efc-4f6e-a638-c34724603420`,
neuer tatsächlicher Prozess PID 40332 / Kind `2e758c9d-3655-42a6-8c17-39afee256fe3` liest denselben
erhaltenen Bestand. Startseite ohne Zwangsdialog; explizites Fortsetzen wieder Schritt 4 mit gleichem
Auftrag, Karte, Sound und artbezogener Ablehnung. Stand `d6d013a4-daa7-4c74-bb03-88291e114e78/media-fixture-snapshot.json`,
SHA-256 f373a0e343eee4d1ed6324733fd51b1b6d87038ce53112c745a6adb13402ba6f.
Browserbeleg `de1f6ce8-ed58-41d3-bd69-f59b6d935808/browser-ui-proof.json`, SHA-256
a2cf25317a087c59e504e4a8b26534a13f195ad5005607799e33c0bfdd899cf6.
„Sound übernehmen“ übernimmt die tatsächliche MP3 lokal. Bewusst fehlendes eigenes Portrait stoppt
die Veröffentlichung vorher nachvollziehbar; keine Veröffentlichungserlaubnis oder Erfolg behauptet.
Dateistand `973919b0-9d7f-4737-bc36-cf15afaa1fbd/media-fixture-snapshot.json`, SHA-256
3945f39edae056d934836e37f754fa0dd0c25706abc5c17c23e494eb04a7ef08. Sichtbare Meldung trennt
lokal angelegt und Übertragung offen; Beleg `2054015a-da26-4a7f-a696-9d8f3951075b/browser-ui-proof.json`,
SHA-256 178c42453faaddc574241c095bf8e9443b58591c8e7a9026489db261c081ce59.

Danach tatsächliches „Artanlage abbrechen“ samt artbezogener Rückfrage bestätigt. UI wieder eine
vollständige Ausgangsart, null Assetprobleme und geschützte Karten, konsistenter Report, alle Prüfungen
bestanden. Dateistand `5c422adc-667a-4f13-a7a4-11bd367cc258/media-fixture-snapshot.json`, SHA-256
31d6ff88ae52df0e1710567fd4696f14b872b4ca35d15b724f2decc0016281b1: 14 Dateien / 52.732 Bytes;
kleiner 170-Byte-Abbruchbeleg bleibt bewusst erhalten. Browserbeleg
`a65e55ee-83b9-4bcd-a02f-877cc44db0af/browser-ui-proof.json`, SHA-256
adb06d3061594d2225b74a9abce897f1598b2b79c515c51d7bd9c10144e2b964.
Browser geschlossen, Kind Exit 0, alle 187 gebundenen Quellen unverändert, Supervisor/Kind regulär
geschlossen mit null laufenden Operationen/Helfern. Vier tatsächliche FFmpeg-Leser für lokale Prüfung;
keine biologische Spektrogrammerzeugung aus dem synthetischen Prüfbild abgeleitet. Abschließender
unabhängiger Dateivergleich unten ergänzt; Haupt-Lightroom weiterhin unberührt.

**Finales vollständiges Qualitätsgate 16. Oktober, 14:24:48–14:32:29 MESZ:** 50 Testgruppen,
**1.819 bestanden**, null Fehler/Abbrüche/Skips; anschließend Audio-/Bild-/Größen-/Projekt-/Status-
und lokale Website-Endprüfungen ebenfalls erfolgreich, Gesamt-Exit 0. Ergebnis
`12fab358-287b-4a3d-927a-31b4f2063ae3/quality-result.json`, Log-SHA-256
049c90f973c8ed78c187f8f7c5fa873dc68468c5d53c15d78c87f7c5bfc4a161.
Alle **127 gebundenen Quellen unverändert**. Das ist keine Live-Website-/CMS-/GitHub-Veröffentlichungs-
oder Großrestoreabnahme. Original-Plug-in bleibt **0.4.24.33**, keine Plug-in-Quelländerung in A-45.

**Unabhängiger Datei-/Journalschlussvergleich bestanden:**
`9749b8d4-921b-4823-81f9-e787c4d75b8f/media-process-round-final-comparison.json`, SHA-256
fc1e4e7af6c88cda777654e44148add96be0e7962b2a7817367b40390e9d41bd.
**982/982 Assertions und 16/16 erkannte Korruptionsgegenproben**; dies sind Datei-/Zustands-/Journal-
und Quellenassertionen, keine 982 unterschiedlichen Bedienfälle. Alle 54 Eingangs-/Zusatzbelege unverändert.
Alle 20 Dateien vor/nach ursprünglichem Prozessrestart/erster Fortsetzung exakt gleich; alle 21 Dateien
nach Soundreset/finaler Fortsetzung exakt gleich. Original-PNG, übernommenes JPG und vollständiger
manueller Schutz-/Herkunfts-/Sessionkontext gebunden. A→B→A durch tatsächliche MP3-Hashes/Credits und
jeweils genau passende Ablehnungslisten bestätigt. Lokaler Abschluss ohne `publicationStarted`.
Nach Abbruch **alle 13 Ausgangsdateien bytegleich**; einziger Zusatz der passende 170-Byte-Abbruchbeleg.
Keine Art-/Review-/Medien-/Sicherungsreste außerhalb dieses Belegs. Amsel über alle Phasen unverändert.

Vier Runtimejournale mit jeweils 187 unveränderten Quellen; finale 187 zusätzlich frisch gegen die
aktuellen Quellen verglichen. Tatsächliche unterschiedliche Prozesse, alle Exit 0/geschlossen/0 Helfer.
Über die gesamte eigene Runde genau ein `/new/save` und ein `/pipeline/start`, drei Medienentscheidungen
und ein Artabbruch. Reset/Fortsetzung erzeugen keinen zweiten Artanlage-/Pipelineauftrag. Acht lokale
FFmpeg-Leser über die gesamte Runde; 16 automatische externe Versionsabfrageversuche vor jeder
Netzwerkverbindung vom Testhook gesperrt, keine echte Git-/Veröffentlichungsaktion. Die drei Root-DOM-/
Bildbelege einschließlich Bildprüfsummen zusätzlich gebunden; unabhängig geprüft sind die gespeicherten
Dateien/Journale/Hashes, keine weitere Agent-Browserbedienung. Anfänglicher enger Prüferfehler für einen
fehlenden Dateieintrag korrigiert, anschließend sämtliche Assertions/Gegenproben neu ausgewertet.
Prüfersitzung geschlossen, null Operationen/Helfer. **A-45 und die eigene Medien-/Prozessneustart-/
Abbruchrunde abgeschlossen.** Weitere native Namens-/Checkpoint-/Bedienfälle, Großrestore und Website/
GitHub-Gesamtabschluss bleiben gemäß der vereinbarten Reihenfolge offen.

Abschließende Root-Quellen-/Sitzungsprüfung nach Dokumentintegration:
`9ced4efe-aff7-4a07-bd27-e835766bd179/A45-completion-source-check.json`, SHA-256
7366693869454995786df6bc0f5afcfa086163a14f7e85f8bc9ce0915d65e360: alle 127 Gatequellen frisch
unverändert; gezielte GREEN-/Review-/Dateivergleichs-/Vorbereitungsbelege neu gebunden, fünf geprüfte
Lauf-/Belegsitzungen geschlossen/0 Operationen/0 Helfer. Lokale Verweise in 80 Markdown-Dateien und
`git diff --check` bestanden. Keine neue Bereinigung, Produktivkorrektur, Veröffentlichung oder Sicherung.

### 10.34 Globale Namenswahl – kleine Vorbereitung, 16. Oktober

Nächster offener eigener Bedienfall aus dem Restabgleich 10.32 vorbereitet, noch nicht ausgeführt.
Eigene geschützte Programm-/Plug-in-Kopie unter `ac5bfdc1-6835-438d-98da-868fe777d46c/sdk-program`:
123 Dateien / **1.211.639 Bytes**, genau zwei künstliche Arten. Basis-Master (163.840 Bytes),
Suchpaket (98.304 Bytes) und Manifeste zur vorhandenen eigenen .33-Vorlage bytegleich; nur gemeinsamer
Datenzeiger auf den neuen eigenen Ordner umgebunden. Vorbereitungsbeleg
`ac5bfdc1-6835-438d-98da-868fe777d46c/global-name-choice-preparation.json`, SHA-256
b87fa6b8bfc55720a49e725043e9adf4a1de2eacc8ebe48f49c94c1a0af9eac4.
Frischer Vergleich **111/111** gebundene Quellkopien zu unverändertem aktuellen .33-Stand:
`e54d548d-6ad6-4c1e-b6c3-d6acbc9a7afc/global-name-frozen-source-check.json`, SHA-256
146b7a83c4a41ab6dcc36bb9139f1b80a88c359f85c545852356ef91c025bf83. Dateivergleich, keine Testsuite.

Beide Arten haben bislang nur eine deutsche Variante. Darum ein separat gespeicherter, **nicht aktiver**
Seed für Calidris alpina / `mtx_a0000000000040008000000000000001`: „Audit-Strandläufer“ mit bisherigem
Anbieternamen „Alpenstrandläufer“. `proposed-name-seed.json`, SHA-256
21ae438352b511f9dfba53da1fc263ab30e321d329413305f7a9c561d2d07064. Später ausschließlich in diesem
eigenen Testprogramm als kleiner Namenskorrektur-Release aktivieren; kein Vollmaster-/Paketaufbau nötig.

Wichtige vor dem Start erkannte Pfadgrenze: `--search-root` allein isoliert den Namens-CLI-Helfer nicht;
sein Korrekturpfad hängt am eigenen physischen Programmordner (`import.meta.url`). Deshalb ausschließlich
Helfer aus der neuen Kopie verwenden. Vor UI-Start noch eigener Originalserver mit minimalem Projektmodell,
`repoRoot`/Taxonomie/Suche/Korrekturen auf denselben eigenen Ordner und Netz-/Veröffentlichungsschutz
vorbereiten. Die vorhandenen Katalogguards begrenzen auf die fünf künstlichen Einträge des bekannten
eigenen Katalogs `5b8eddff-3479-49e6-8a5e-f33752f7b11c`; vor jeder Nutzung neue Vorlesung einschließlich
IPTC/FN/echter Stichwortrelationen/Statistik. Optionaler Handoff nur mit eigenem Ziel und gebundenem Stub.

Geplanter tatsächlicher Bedienfall: Explorerwahl → unmittelbarer Lightroom-Leser; Rückwahl zunächst nur
vorauswählen, dann ausdrücklich speichern; Anbieterstandard erst abbrechen/unverändert prüfen, danach
bestätigen; Gegenrichtung und wirkungslose Wiederholung. Fotos und Basisdateien unverändert halten.
Kontrollierter Aktivierungsfehler/„Speichern wiederholen“ getrennt vorbereiten. Danach Original .33 und
Hauptkatalog wiederherstellen. **Noch kein Server-/Release-/Plug-in-/Katalogstart und keine Namensänderung**
aus dieser Vorbereitung behauptet. Vorbereitungs- und Quellvergleichssitzungen geschlossen, null Operationen/Helfer.

### 10.35 Nutzerergänzung FN-Artseitenverknüpfung – 16. Oktober

Felix beauftragt zusätzlich einen FN-Website-Verweis direkt im Explorer-Artkopf sowie fehlende Seiten
als Hinweis und automatische Erkennung neuer Seiten ohne zweiten manuellen Linkeintrag. Dieser konkrete
Einzelauftrag wird vor weiterer nativer Auditbedienung bearbeitet. Keine CMS-/Veröffentlichungsänderung.
Öffentliche FN-Sitemap tatsächlich lesend geladen: HTTP 200, 586.302 Bytes, 135 Seitenadressen,
Beleg `a2032068-5d61-4af0-ac79-047a2efa17ea/fn-public-sitemap-result.json`; XML-SHA-256
a312dfbf04cf79c871ab10797b87e7c8d13d6c41c19d04d8c76961c04654768a.
Wendehals darin bereits unter `https://www.fnwildlifetravel.de/wildlife/heimische-tierwelt/jynxtorquilla`.
Erkennung bindet die vorhandene exakte Artkennung an veröffentlichte Sitemap-Adressen; keine deutschen
Namensheuristiken oder geratenen Bereichspfade. Unveröffentlichte Squarespace-Entwürfe bleiben unsichtbar.

Neue Fachmodule `website-species-pages.mjs` und `public/app-website-pages.js`; serverseitige Lese-API
`/api/website/species-pages`, getrennt vom lokalen Explorer-Modell. RAM-Cache fünf Minuten, gemeinsame
gleichzeitige Anfrage, Fehlerwiederholungsabstand, begrenzter Gesamtzeitraum von acht Sekunden,
maximal acht gebundene XML-Dokumente/je 4 MiB/gesamt 8 MiB, keine Fremdhost-/freien Redirectziele.
Nur vollständige erfolgreiche Seitenlisten begründen „noch nicht veröffentlicht“. Quellenfehler behalten
letzte belegte Links mit altem Prüfdatum; unbekannte Seiten gelten dann als ungeklärt. Kein Platten-Cache,
Katalog-/Art-/Assetschreiben oder automatischer Anbieter-/Datenbanklauf.

UI im Artkopf, getrennte Links für mehrere belegte Bereiche, Website-Hinweis an der Art und Filter
„FN-Website fehlt“. Eigene Übersicht mit „Website prüfen“, Start-/Fünfminutenprüfung und sofortige
Erneuerung über „Aktualisieren“. Nur Website-Slots werden erneuert, laufendes Audio/Formulare bleiben erhalten.
Agenten erreichen für diese neue Aufgabe ihre Nutzungsgrenze; Root übernimmt vollständig. Keine nicht
erfolgte unabhängige Agentimplementierung oder -freigabe behauptet.

Gezielter gebundener Lauf nach Verdrahtungs-/Filterkorrektur **86/86 bestanden**, null Fehler/Abbrüche/Skips:
`c83eeed8-c1ce-41f6-84b3-2551b2445229/website-link-tests-result.json`, SHA-256
25a516e209f751c3a62e748a16be14885453d7bf44aeca04028a3e07371a0d6d,
Log-SHA-256 2994d656b67fb236b7fc1c66e3d6cd7009c2568df0527300257d6b1fab5cb6a5.
Enthält Parser-/Zeit-/Größen-/Fremdhost-/Teilindex-/Ausfall-/Cache-/Mehrfachbereichsfälle,
automatische spätere Veröffentlichung, sichere Links, Websitefilter, verspätete Antwort bei Artwechsel,
keinen Detail-/Medienneuaufbau und Originalserver-API ohne Änderungen der lokalen Art-/Validierungsdateien.
Erste Zwischenläufe scheiterten ausschließlich an der kompakten Kompositionsgrenze und der bisherigen
Filterposition; beide Grenzen unverändert erhalten.

**Eigene tatsächliche Browserrunde bestanden:** Originalserver und aktuelles Frontend lesen einen
eigenen kleinen Drei-Arten-Bestand mit kopierten Wendehalsmedien, gespeicherter echter FN-Sitemap und
kontrollierten Antworten. Vorhandener Wendehals-Link, fehlende künstliche Art einschließlich Hinweis
und Filter, anschließend simulierte Veröffentlichung ohne Linkeingabe sowie Quellenausfall geprüft.
Nach Veröffentlichung verschwinden Hinweis und Filtertreffer; bei Ausfall bleibt ein belegter Link mit
altem Prüfdatum erhalten, eine unbekannte Seite wird nicht als fehlend ausgegeben. Der bereits beendete
Audio-Abspielstand bleibt beim Websitewechsel erhalten; keine laufende Wiedergabe aus dieser Beobachtung
abgeleitet. Tatsächliche öffentliche Wendehals-Zielseite zusätzlich lesend geöffnet, Titel/Artinhalt passend;
keine CMS-/öffentliche Änderung und keine zusätzliche Popup-Abnahme behauptet.

Browserbelege jeweils unter `temp/explorer/`:
`5939bb2f-7333-4f62-b96e-3a699c6bebdb/browser-ui-proof.json`, SHA-256
b821a2df41e4b1348435ecec3616d55eb41cfd06a373b1f39030b0810fd8cf61;
`c31e97a2-a45e-47cf-b73c-6aefd084d458/browser-ui-proof.json`, SHA-256
adf31acd2a47ced55853fb6cdca588b4fc58eb784811f775a100ab5b719ecead;
`063d2315-011e-44b7-93e0-2b84dc3fe59e/browser-ui-proof.json`, SHA-256
90b584736b4f43edaadec742b005c267172b7d63642f6c26813d244dfb8a2423.
Die fünfminütige Terminierung ist automatisiert geprüft; die spätere Veröffentlichung wurde im eigenen
Browser durch ausdrückliche Prüfung eingelesen, keine zusätzliche fünfminütige Warteabnahme behauptet.
Beide eigenen Browser geschlossen, eigene Runtime `5b742d75-c73f-4cf6-903b-a40b657aad85` regulär mit
Exit 0 beendet; alle gebundenen Quellen unverändert und Sitzung geschlossen/0 Operationen/0 Helfer.

**Finales vollständiges Qualitätsgate 16. Oktober, 23:46:02–23:54:25 MESZ:** 50 Testgruppen,
**1.835 bestanden**, null Fehler/Abbrüche/Skips; anschließende Medien-/Projekt-/Status-/lokale Website-
Prüfungen ebenfalls erfolgreich, Gesamt-Exit 0. Ergebnis
`d0aee872-ed1c-4d83-b831-7b56e78718b6/quality-result.json`, Log-SHA-256
3c2487612d3b1c12de74e129cef3a4f83a360250862c8369a5425bfe1c69c7ae.
Alle **134 gebundenen Quellen unverändert**. README und Strukturvertrag beschreiben Bedienung und
Modulgrenzen. Original-Plug-in bleibt **0.4.24.33**, keine Plug-in-Änderung in diesem Einzelauftrag.

Regulären Explorer aus dem vorhandenen lokalen Electron-Paket gestartet; lesende API am regulären
Port 4177 verfügbar, Pipeline untätig und aktuelle öffentliche Seitenliste erfolgreich. Wendehals-Adresse
im tatsächlichen Regelbetrieb passend. Die native Fensterinventur liefert für diesen Start kein sichtbares
Explorerfenster; der laufende Prozess besitzt kein Fensterhandle. Deshalb keine native sichtbare
Desktopabnahme aus dem API-Nachweis ableiten. Eigene Browserabnahme und regulären API-Nachweis trennen.

Felix beauftragt nach Abschluss ausdrücklich das Herunterfahren des Rechners. Nach Beleg-/Dokumentabschluss
und Ende der eigenen Prüfläufe reguläres Windows-Herunterfahren ohne erzwungenes Anwendungsschließen
ausführen. Gesamtaudit ausdrücklich **nicht abgeschlossen**: Namens-/Checkpoint-/weitere native Bedienfälle,
Großrestore sowie Website/GitHub und Gesamtabschluss bleiben in vereinbarter Reihenfolge offen.

Abschließender Quellen-/Belegvergleich nach Dokumentintegration bestanden:
`4834b038-aac5-4679-a9b5-072a2332ec66/website-link-completion.json`, SHA-256
11a6e20009a53ff4025fa5573d090be0dc61e37aafe8e8b7f4e0f96d8011a17f.
Alle 134 Gatequellen frisch unverändert; sechs gezielte Lauf-/Browser-/Journalbelege neu gebunden,
deren Sitzungen geschlossen/0 Operationen/0 Helfer. Regel-API am 16. Oktober um 23:59 MESZ frisch
HTTP 200 / vollständige Seitenliste / passende Wendehals-Adresse. Dokumentationsprüfung in 80
Markdown-Dateien und `git diff --check` bestanden. Kumulativer unveröffentlichter Arbeitsbaum umfasst
134 bereits versionierte geänderte Dateien und 23 neue Dateien aus der gesamten Auditserie; dies ist
keine Größenangabe allein für diese Ergänzung. Kein Commit, Push oder Deployment aus diesem Abschluss.

Herunterfahren nach ausdrücklichem Nutzerauftrag vorbereitet unter
`ec0716b0-de92-4460-b4c6-01097c2c5ea3/shutdown-plan.json` und getrenntem eigenen Einmalhelfer.
Dessen Laufbeleg liegt unter `022904ab-5112-45ce-b1da-44b5cdff7e59/normal-shutdown-request.json`:
45 Sekunden für die Abschlussantwort, anschließend ausschließlich Windows `shutdown /s /t 0`, ohne
`/f` und ohne einen Windows-Timeout, der erzwungenes Schließen implizieren würde. Ein erfolgreicher
Start dieses Helfers ist noch kein Nachweis der später tatsächlich ausgeschalteten Maschine.

### 10.36 Globale Namenswahl und widersprüchliche Trefferbeschriftung – 17. Oktober

Felix beauftragt die nächste Auditfortsetzung und gibt Lightroom ausdrücklich mit „Lightroom ist frei“
für den bereits freigegebenen Testkatalogwechsel frei. Vorher nativ Original **0.4.24.33** am regulären
Pfad aktiviert und vollständiges Produktionspaar passend festgestellt: 273.485 Taxa,
`master-20261013143021566`, `lightroom-dd834fb15dbd6f1c3257`, `col-xr-2026-09-25-316441`.
Anschließend ausschließlich eigener fünfteiliger Testkatalog aus 10.34 und geschützte eigene .33-Kopie.
Keine Fotozuweisung, keine Hauptkatalogkorrektur und kein produktiver Namens-/Master-/Paketwechsel.

Eigener Originalserver und Originalfrontend verwenden die neue isolierte Programmkopie
`4630504b-182c-4551-a30a-6163245b813c/sdk-program`; ausgehendes Netz, Veröffentlichung und sämtliche
Schreibendpunkte außer Namensvorschau/-speicherung gesperrt. Laufjournal
`4630504b-182c-4551-a30a-6163245b813c/name-choice-runtime-journal.json` bindet die einzelnen Phasen.
Die frühere reine Lightroom-Fixture hatte keine gültige lesbare CoL-Referenz. Deshalb ausschließlich
in der neuen Kopie den kleinen versionierten lokalen Prototyp `col-xr-2026-07-17` ergänzt und das
Referenzlabel des eigenen Mastermanifests angepasst. Originalpointer/-manifest separat erhalten;
beide Basis-SQLite-Dateien unverändert. Dies ist keine Abnahme echter CoL-Quellversionsbeziehungen.
Anfängliche eigene Serverstarts mit nicht umgebundenem absolutem Paarzeiger beziehungsweise nicht
erreichbarem eingeschränktem Listener sind beendet; keine Produktdatenfehler daraus abgeleitet.

**A-46 reproduziert:** Nach bestätigter Namensänderung zeigt der Explorer bereits den richtigen
bevorzugten Namen im Detail, jedoch weiter den alten Namen in derselben Suchtrefferzeile. Tatsächlicher
Browserbeleg `80a7072e-8981-4cd8-a695-e3345575ff36/browser-ui-proof.json`, SHA-256
ddd670fbb3e413f2b3a5ccee051264bcf5b8581008acad800568444d04fcf3cd.
Agent ergänzt genau `public/app-taxonomy-database.js` und den zugehörigen Verhaltenstest:
Erfolgreiche passende Detailantwort erneuert denselben Treffer ohne zusätzliche Suche; verspätete
Detail-/Speicherantworten dürfen inzwischen geänderte Auswahl oder Meldung nicht überschreiben.
Unveränderte Quelle mit neuen Gegenproben RED: 43 bestanden / acht fehlgeschlagen;
`15aad28f-af58-423f-be42-9e478f615854/red-name-choice-suite-result.json`, SHA-256
107e08c39888c21d144de8f1db45d98a49c375898b74e890feda699a04057209.
Korrigiert **55/55 bestanden**, null Fehler/Abbrüche/Skips;
`c1facf09-2eb7-451d-bc77-3ce78fde6b93/name-choice-suite-result.json`, SHA-256
8e3ce72119470bd01d7a3c2aa5937583c2775d20b001c133088cd5a0512cd698.
Root prüft die Änderung lesend unabhängig und lädt das Originalfrontend neu. Bestätigte Rückwahl
aktualisiert Treffer und Detail unmittelbar gemeinsam; wissenschaftliche Suchanfrage bleibt erhalten.
Browserbeleg `dfb6b523-0bb2-4484-8bdd-07746db975be/browser-ui-proof.json`, SHA-256
2c18db9270576ee3eaf7f636c85553ec93b16bdd4eac2a3bb413ea32eeafce10.

**Native Namensrunde .33 ausgeführt, zusätzlicher Teilbefund offen:** Explorerwahl wird ohne Neustart
über „Auswahl prüfen“ in Lightroom eingelesen. „Vorherigen Namen auswählen“ wählt nur voraus;
eigener Paketleser bleibt bei Audit-Strandläufer, bis die Rückwahl ausdrücklich bestätigt gespeichert
wird. Danach Alpenstrandläufer in beiden Verbrauchern. Anbieterstandard mit identischem sichtbarem
Text ausdrücklich rückgefragt und zuerst abgebrochen; Korrekturdatei und Aktivzeiger dabei bytegleich.
Späterer Anbieterwechsel von Audit-Strandläufer zu Alpenstrandläufer bestätigt, Basisdateien und zweite
Kontrollart unverändert. Keine Fotozuweisung aus diesen Namensaktionen.
Native Beobachtungen unter `54e113ed-f235-4cc8-8be0-06e4506d6067/native-audit-proof.json`, SHA-256
b6cd7d80e455a2d721e5f80580ee43215919577f68ab3ea729a9ead103156796.
Dabei auch in Lightroom dieselbe Beschriftungslücke belegt: bevorzugter Name korrekt, bestehende
Trefferliste weiter alt. Agent bestätigt lesend die unveränderte `resultItems`-Liste in
`AssignmentWindow.loadTaxon`; Korrektur und neuer .34-Quell-/Ladestand sind noch nicht abgenommen.

Frische ausschließlich lesende Katalogvorlesungen vor Wechsel und nach eigener Plug-in-Initialisierung
sind vollständig gleich: alle fünf Einträge einschließlich FN/IPTC, realer Stichwortrelationen und
Statistikvariablen. Vergleich `52339a75-e8b1-476b-95e4-70c410015b37/catalog-json-comparison.json`,
SHA-256 b6eded0da9d1efbf56e254766cb855b10dc4c777190083d517d667d09f6f8080.
Der unabhängige JSON-Vergleicher erkennt 29/29 synthetische Gegenproben. Ein erster Phasenvergleich
gegen eine zu alte Zwischenaufnahme enthielt korrekt die inzwischen bestätigte Explorer-Rückwahl;
das war eine unpassende Vergleichsbasis des Prüfers, kein Schreibeffekt der nativen Vorauswahl.
Ein vollständiger Katalogschlussvergleich und Rückstellung auf das Original folgen erst nach Ende
der eigenen Runde. Kontrollierter Aktivierungsfehler/„Speichern wiederholen“, optionaler Handoff,
Checkpoint-/weitere Bedienfälle, Großrestore und Website/GitHub bleiben getrennte offene Nachweise.

**Fortsetzung 18. Oktober:** Das am 17. Oktober nach dem Explorerfix ausgeführte vollständige Gate
ist beendet: **50 Gruppen / 1.847 bestanden**, null Fehler/Abbrüche/Skips, Gesamt-Exit 0;
08:18:21–08:26:18 MESZ. Ergebnis `6d2233ed-7167-4ba0-8957-18ac4d9f2abe/quality-result.json`,
Log-SHA-256 26f0e472b668c53bdf8686be3eb5caa5bb607b1f49ddd80938f5bcebf811b8b3.
Alle 134 gebundenen Quellen im Lauf unverändert. Dieser Lauf liegt vor der folgenden .34-Korrektur.
Die eigene Namensruntime besitzt nach der Unterbrechung keinen sauberen Abschlussbeleg; ihr Journal
wird unverändert erhalten, kein reguläres Schließen behauptet. Frische native Inventur zeigt jetzt den
Hauptkatalog mit noch aktiver geschützter Testregistrierung. Original .33 wieder aktiviert, eigene
Testkopie dadurch deaktiviert; Produktionspaar weiterhin vollständig übereinstimmend. Keine FN-Aktion
im Hauptkatalog ausgeführt. Derselbe kleine Testkatalog ist frisch gegen den Stand vor der gesamten
Namensrunde vollständig unverändert: `db635b90-92f0-4b2d-ba7f-8fcbaacc9b7a/catalog-json-comparison.json`,
SHA-256 0979c250329c09a3d1b2e93a184d9247dfbedff1b77f579f192cf6b978fea95f.

Vorbereitung der folgenden Statistikprobe ausdrücklich getrennt: **500 ist die Leseblockgrenze**,
der automatische periodische Checkpoint liegt bei zehn Blöcken/5.000 Einträgen. 501 kleine eigene
JPEG-Einträge genügen für bewusste Pause/Fortsetzung und Revisionsinvalidierung, belegen aber keinen
automatischen 5.000er-Checkpoint. Neuer eigener Katalog; der fünfteilige Namenskatalog wird dafür
nicht erweitert. Die rein lesend erkannte Wiederöffnungsgrenze bei noch gültigem altem Index
(`restart=true`) ist zunächst ein Prüfhinweis, noch kein nativ reproduzierter Fehler.

**A-46 Quellkorrektur .34 übernommen und nativ gegengeprüft:** Vier Plug-in-/Vertragstestdateien
aktualisiert, inklusive beider sichtbarer Versionsangaben und beider Versionsprüfungen. Neue eigene
Gegenprobe gegen unveränderte .33: 15 Fälle, drei bestanden / zwölf Fehler reproduziert; erweiterter
Entwurf 15/15. Beleg `1769cf0b-8877-4cd1-a7f9-07d9f8af258a/result-refresh-finish-preparation.json`,
SHA-256 0a48b29570f2ac4f71e59d6aa7489d54ce583cdf2aa701e788f83c9910e895a3.
Passende Detailantwort erneuert ausschließlich vorhandenen Treffer derselben ID. Query-/ID-Guard
steht vor jeder alten Erfolgs-/Fehlerantwort; zuletzt verwendete Arten erzeugen keinen fremden Treffer.
Der enge begleitende Präferenzweg nach Fotozuweisung liest einmal frisch und erhält Zähler/Lesefehler,
ohne zweiten Fotowriter. Dieser zusätzliche Zuweisungszweig ist automatisiert, nicht neu nativ schreibend
geprüft. Root liest Änderung und Gegenproben unabhängig gegen. **70/70 gezielte Tests** einschließlich
Lua-Verhalten/-Parser, JS-Syntax 415 Dateien und Stilprüfung bestanden;
`82d05057-fe36-4d5f-ae7e-a619b1a657ee/result-refresh-final-tests.json`, SHA-256
5f209359d5d7cad263756003c5ef6b628a0d6fd9d488f228d4e1fe881fb27152.
Erste Produktrunde 69/70 wegen einer zweiten noch alten Versionsprüfung, anschließend vollständig
korrigiert und wiederholt; kein Anwendungsfehler daraus abgeleitet.

Eigene neue Runtime `3857d741-c869-4be6-b91f-8f9e818b863b` verwendet denselben erhaltenen eigenen
Bestand, bindet aktuelle Quellen und kopiert ausschließlich die drei geänderten Lua-Dateien neu.
Vier private Manifestumleitungen und alle exakten Katalogguards erhalten; Originalbytes separat gebunden.
Geschützte .34 im fünfteiligen Katalog nativ geladen/aktiviert: zwei Taxa, eigenes Paar passend.
Vorauswahl bleibt nach Vor-/Nachlesung bytegleich ohne globale Änderung. Bestätigte native Rückwahl
und Anbieterstandard erneuern unmittelbar **Trefferzeile und bevorzugten Namen**. Explorer liest beide
Werte passend; erneute bestätigte Explorer-Rückwahl erscheint über „Auswahl prüfen“ sofort in Lightroom.
Native Korrekturbeleg `e28c5125-9253-4f07-bb08-7c29aae3c502/native-audit-proof.json`, SHA-256
d3bfa376875a443c76365850f55a9146ab7dd66e5f6cd50a26e05a4e67872897;
Explorer-Gegenrichtung `877da7ce-101b-428e-8ba3-18bb990c207e/browser-ui-proof.json`, SHA-256
6554295513d9ff7626d7c4b06e04711fba0099c83e222bb32873f74f1cb80fc1.
Alle fünf vollständigen Foto-/Videoeinträge, Original-IPTC, reale Stichwortrelationen und Statistik
nach dieser .34-Runde weiterhin exakt unverändert: Vergleich
`3df9a656-6d85-4130-a5fe-9fd4186e16ca/catalog-json-comparison.json`, SHA-256
d9405dba59bcc496399be509b77be3a51c1b7e8926a315d6dd3ef879d4f45463.

**Neues Gesamtgate noch nicht grün:** `161c06f4-95b6-419c-962f-0a6844eadaa9/quality-result.json`,
Exit 1, alle 134 gebundenen Quellen unverändert; Log-SHA-256
c0680996b31bd4d3f5c0384df0e6a53e49e5357eec029d8b45c1ff0918ef5669.
„Lua-FN-Änderung nach Pause …“ vergleicht zwei getrennte Neubauten einschließlich `generatedAt`.
Lesende Ursache: tatsächliches `os.date` wechselt während der Probe über eine Minutengrenze.
Gezielte reproduzierbare Zeitgegenprobe und eng begrenzte Fixturekorrektur laufen; keine Änderung
der Produkt-Statistiklogik und kein bestandener Gesamtabschluss aus den übrigen grünen Gruppen behauptet.

**Zeitgegenprobe abgeschlossen:** Der unveränderte alte Testkörper ist bei gleicher synthetischer Minute
grün und scheitert beim ausdrücklich gesteuerten Wechsel 08:59 → 09:00 exakt an `result.generatedAt`.
RED-Beleg `f829bb1e-b1e4-43fd-a0b3-cd64c1047ccb/statistics-clock-red-result.json`, SHA-256
e12e955dfb50e4b317ce4a8f41803c5ad9ce1bb754e950d6332bac891d9c04a7. Ausschließlich die Testfixture
erhält explizite Werte der zwei tatsächlich benutzten Datumsformate. Vollständige rekursive Vergleiche
einschließlich Erstellungszeit bleiben erhalten; Minutenwechsel während Pause/FN-Änderung sowie zwei
fachlich gleiche Neubauten mit jeweils korrektem gespeichertem Zeitpunkt werden ausdrücklich geprüft.
Gesamte Statistik-/Orts-/Zeitdatei **108/108 bestanden**, null Fehler/Abbrüche/Skips; GREEN-Beleg
`cf019b2d-4f2d-4c88-84fa-621368267a24/statistics-clock-green-result.json`, SHA-256
92b28f4a5076534719e31f69b20c3c246ffcfae13561e89f10cc21804694a98d. Alle elf gebundenen Lua-
Produktmodule unverändert. Root prüft die enge Testkorrektur und startet das gesamte Gate neu unter
`19608085-bb98-41ec-8a1a-eef7a6059d1b`; Ergebnis erst nach tatsächlichem Ende bewerten.

**Kontrollierter nativer Aktivierungsfehler und Wiederholung bestanden:** Ausschließlich die physische
eigene CLI-Modulkopie wird nach unabhängigem Rootreview um einen einmaligen Haken unmittelbar vor
dem Aktivzeigerwechsel ergänzt. Acht synthetische Guard-Gegenproben; Bindung an eigene Modul-/CLI-
und Datenpfade, exakten Zweitaxonbestand, Entscheidung und alten Zeiger. Keine Produktquellenänderung.
Vorbereitung `ebf98b46-69ec-4e90-8fac-69693a333c42/native-activation-fault-preparation.json`, SHA-256
c7c03982a454a7bc7ea584353e8c8f6736723064143c223572b64252ddc5114d. Bewaffnung mit gesicherten
Originalbytes unter `464bfc8a-4d1d-4e35-a429-116a0f73ebc1/native-activation-fault-operation.json`.
Native bestätigte reine Namenswahl erzeugt echte `pending`-Antwort und aktiviertes „Speichern
wiederholen“; bisheriger aktiver Name, Zeiger und beide Basisdatenbanken unverändert. Einmalflag
verbraucht, Quittung bindet gespeicherten Operationstoken und Revision. Pending-Beleg
`2950ddf7-e90f-4c37-b750-c868e996fadb/native-audit-proof.json`, SHA-256
38528137b0d7c23169f9e7a4055cc2f62f7b7a1e405bac2a49ed60d3de4ab330.

Eigene Moduldatei **vor** Wiederholung exakt auf Original-SHA zurückgestellt, belegter unveränderter
Aktivzeiger: `fa1ea690-be6d-4eec-9c25-4dca4c36fa7b/native-activation-fault-operation.json`, SHA-256
4cdaac48069b7602ecc639196973d675bb3e86cfd452feaa08ed210d83b476d9. Genau ein nativer Klick auf
„Speichern wiederholen“ aktiviert die bereits gespeicherte Wahl; Schaltfläche danach deaktiviert,
Treffer und bevorzugter Name passend. Keine erneute Fotozuweisung. Native Beleg
`3c3f28be-a6b8-4652-ba83-1577cb1e2f33/native-audit-proof.json`, SHA-256
ea27846fa9923b0b61c0eaa3aabfb6cb7ec833dc17af5a20ea49011c84259253. Explorer übernimmt den neuen
Namen beim erneuten Auswählen desselben Treffers bei unveränderter Anfrage ebenfalls passend:
`ee5b7bb7-a366-4652-a76d-8f558f36ecbf/browser-ui-proof.json`, SHA-256
a57c14131dcaf7254d41a122e0492af6d42f40005d0bec95c1ff0ad551855df5. Dies belegt einen kontrollierten
Fehlerzweig, keinen spontan auftretenden produktiven Aktivierungsfehler oder jeden Betriebssystemfehler.

Vollständige Katalogschlusslesung nach Fehler und Wiederholung gegen den Stand vor der .34-Runde
**gleich, null geänderte Pfade**: `881f70ec-5cfe-430c-9c5c-5392bb449890/catalog-json-comparison.json`,
SHA-256 22739dc417384e018aa85d3bc58737ce1f87f5a40c369c432fc9dc46e238d80b. Eigene Browserseite,
Namensfenster und Server regulär geschlossen; Runtimejournal `3857d741…/name-choice-finish-journal.json`
ohne Fehler beendet. Genau eine erwartete Quellabweichung gegenüber Laufbeginn: die oben unabhängig
nachgewiesene Statistik-Testuhrkorrektur; alle funktionalen Quellen unverändert. Original **.34** nativ
wieder aktiviert und vollständiges produktives Paar passend, private Registrierung deaktiviert.
Hauptkatalog wird nach der nächsten getrennten Statistikrunde wieder geöffnet. Kein optionaler Handoff
ausgeführt; aus reiner Namenswahl ist kein solcher Übergabeschritt erforderlich.

**Erneutes vollständiges Gate abgeschlossen, 18. Oktober 08:29:31–08:37:32 MESZ:** **50 Testgruppen /
1.863 bestanden**, null Fehler/Abbrüche/Skips; Syntax, Stil, lokale Dokumentverweise, Schema, Medien-,
Projekt-, Status- und lokale Websiteprüfungen ebenfalls erfolgreich, Gesamt-Exit 0. Ergebnis
`19608085-bb98-41ec-8a1a-eef7a6059d1b/quality-result.json`, Log-SHA-256
658a016ab249b3a120ecfbfffb58eb321a09faec366becd02f4043bbd1cffb45. Alle 134 gebundenen Quellen
im Lauf unverändert. Dieses Gate enthält .34 und die explizite Statistik-Testuhrkorrektur. Nachträgliche
Dokumentintegration zusätzlich über alle 80 Markdown-Dateien lokal geprüft; `git diff --check` bestanden.
Dies ist ein bestandenes lokales Gate und Ende der beschriebenen Namensrunde, kein Gesamt-Auditabschluss.

### 10.37 Eigene native Statistikprobe über eine Leseblockgrenze – 18. Oktober

501 künstliche JPEGs, zusammen nur 119.739 Bytes, und exakt kataloggebundene private Guards vorbereitet
unter `1e17c836-dfe5-45f3-9761-26c046f68429/statistics-501-preparation.json`, SHA-256
a945de6ecd5b38b0f35f9ce9c75d982487d1a1b86bab7c851c0d45954480bd17. Neuer eigener Katalog
`catalog/FN-Statistics-501/FN-Statistics-501.lrcat`; Hauptkatalog und fünfteiliger Namensbestand werden
nicht erweitert. Ziel: vollständiger Ausgangsindex, echte bewusste Pause/Fortsetzung nach 500 und eigene
FN-Änderung während Pause. Alter fertiger Index bleibt bis gültigem Abschluss erhalten. Ein gegebenenfalls
für bedienbare Pausen nötiger eigener Wartehaken ist als Instrumentierung gesondert nachzuweisen;
ein zu schneller unveränderter Lauf beweist keinen Pausenfall. Noch keine ausgeführte Statistikabnahme
aus diesen Vorbereitungen ableiten.

Eigener Katalog inzwischen nativ angelegt, genau 501 JPEGs über „Hinzufügen“ importiert. Lightroom
markiert zehn der absichtlich inhaltsgleichen Testbilder als mögliche Duplikate; für diese Probe die
vorher aktive Duplikaterkennung vorübergehend ausgeschaltet und tatsächliche 501er-Auswahl geprüft.
**Importoption vor Rückkehr in den Hauptkatalog wieder einschalten.** Lesende Ausgangsaufnahme
`d206d0e9-f2ab-4a0d-ad1f-5b9357a55693/statistics-501-catalog-read.json`: 501 eigene Einträge,
keine Stichwortrelationen und keine Statistikvariablen. Vier eigene Guards nach Deaktivierung der
privaten Registrierung exakt umgestellt, Info/Fachmodule unverändert:
`5bbf37db-ee81-4d20-a02f-6ea7df9f30f5/statistics-501-guard-operation.json`, SHA-256
df55d3f96074b9bcc0c72b800e35e6751d5fb49c4ca05ce9674ba664be282482. Dieselbe vorhandene
Registrierung wird verwendet, keine zusätzliche FN-Instanz angelegt.

Die Ortsvorbereitung war während einer mehrstündigen Unterbrechung nicht abgeschlossen. Bei der
Fortsetzung Hauptkatalog wieder geöffnet vorgefunden; Original .34 zuerst dort aktiviert und passendes
produktives Paar nativ bestätigt, keine FN-Aktion ausgeführt. Danach denselben eigenen 501er-Katalog
wieder geöffnet. Alte Fensterbindungen verworfen. Eine danach noch unzuverlässige native Feld-/Geometrie-
Zuordnung setzt versehentlich ausschließlich im eigenen Katalog „Luftaufnahme“ an allen 501 Bildern.
Das ist eine Prüfbedienungsabweichung, kein Produktfehler; als manuelles Kontrollkeyword erhalten.
Beleg `79ba784a-435c-405c-9a6e-dbcf06d25e97/native-audit-proof.json`, SHA-256
e0bf95c594923bafe763dfc652619af8659d1d02a736fde0e158375158b1ac7d. Steuerung neu initialisiert;
Auswahlwerte zusätzlich per Tastatur tatsächlich bestätigt. Kein Erfolg aus nur geändertem AX-Wert
oder einer unbestätigten Eingabe abgeleitet.

Native Mehrfachbestätigung „Auf Auswahl anwenden“ ausdrücklich für 501 eigene Bilder ausgeführt.
Erst folgende lesende Transaktion bestätigt `Deutschland` bei **allen 501 Original-IPTC-Ortsquellen**:
`a8a57688-9d1c-49da-819c-604909107dd0/statistics-501-catalog-read.json`, SHA-256
08c5c139503baa89f622914904a5de6fa134d2783245aeafea1fcf2116930043. Alle 501 manuellen
„Luftaufnahme“-Relationen vorhanden; noch kein FN-Aufbauindex. Frühere Zwischenaufnahme mit Label
`country-source-all-committed` liegt tatsächlich **vor** der nativen Mehrfachbestätigung und belegt
deshalb noch nicht alle Ortsquellen; maßgeblich sind die tatsächlichen Werte der späteren Aufnahme.
Private .34 erneut nativ mit zwei eigenen Taxa und passendem eigenen Paar aktiviert, Calidris alpina
eindeutig gewählt. Genau eine Zuweisung für diese 501er-Auswahl gestartet, keine zweite Zuweisung.
Quellvorbereitung mit mehreren Tausend einzelnen SDK-Leseaufrufen zeigt keinen Zwischenzähler;
Fortschritt inzwischen nativ von „Orts- und Zeitdaten werden geprüft“ zu „Taxonomie wird zugewiesen“.
Abschluss, vollständiger Ausgangsindex und Pausenfälle stehen weiterhin aus; keine Bedien- oder
Geschwindigkeitsabnahme aus dem unveränderten Zwischenstatus ableiten.

**Eigene FN-Zuweisung tatsächlich abgeschlossen:** Native Anzeige „501 Fotos wurden Alpenstrandläufer
zugewiesen“, Beleg `f8ec1f57-9954-48f4-b24e-15a0aef28c95/native-audit-proof.json`, SHA-256
fdd265ad93c50c8c8abdc0a4eb6b0d7cf1609aacf004bdcc39c592facc28867b. Anschließend konsistent
lesender Katalogbeleg `49db3f28-eb20-4e8b-8789-7b859ba67d63/statistics-501-catalog-read.json`,
SHA-256 9b1c322220320a770fa6794e85c5ca3046f4412a65a8784727fbd3ea87bc5eb8.
Unabhängiger JSON-Prüfer mit 26/26 synthetischen Gegenfällen: alle 501 eindeutigen FN-Masterzuordnungen,
deutsche/englische/wissenschaftliche Namen und die belegten Rangfelder vorhanden; 501 FN-Länder,
4.008 reale FN-Taxonomiestichwortrelationen, 501 FN-Ortsrelationen und sämtliche 501 bisherigen
Luftaufnahme-Objektrelationen erhalten. Original-IPTC und Fotoidentitäten unverändert, Revision 1.
Ergebnis `dd9231ed-81d9-4335-ad6a-0880d1336169/statistics-501-json-inspection.json`, SHA-256
9d6116002565e0c5dd654d549860c601052f3a5638bfb443691816e58ddd89e0, `passed:true`.
Keine FN-Zeitfelder in diesen JPEGs ohne eingebettetes Aufnahme-EXIF: Ein im Katalog angezeigtes
`captureTime` ist kein Nachweis der tatsächlich verfügbaren SDK-Aufnahmezeitquellen. Daraus keinen
Monatsfehler behauptet und keine Zeit künstlich ergänzt. Der Ortsdeltafall braucht diese Zeitfelder
nicht; die getrennten März-/April-/MOV-Nachweise bleiben maßgeblich.

**Erster vollständiger nativer Statistikindex bestanden:** Anzeige und konsistente Kataloglesung
`56ae0ad1-47a0-4678-be43-05dcdca55116/statistics-501-catalog-read.json`, SHA-256
f14c331eafa939c1de48821c9a6f00bcac07b8d4de5fb5a52984936d4fbbac6e, bestätigen 501 Fotos,
501 Taxonomiezuordnungen, 501 Orte, eine Art, keine Favoriten; vollständiger Index, Revision 1,
Stand 18.10.2026 13:29. Unabhängige JSON-Gegenprüfung `1404ffd3-dcb1-4490-ba7f-6066c4985728/
statistics-501-json-inspection.json`, SHA-256 e23cf43cc1a5d1da3106e8112c019a5703be3d399da75eb2704c6653ac20f52d,
`passed:true`. Alle manuellen Kontrollrelationen und Originalquellen erhalten.

Ein weiterer unveränderter nativer Neuaufbau ist um 13:35 bereits vor dem nächsten bedienbaren
Fensterzustand vollständig fertig; kein Pausenfall daraus behauptet. Neuer vollständiger Ausgangsindex
für die anschließende Pause: `ccf12030-a48c-4ecc-a01c-a3a7fb835001/statistics-501-catalog-read.json`,
SHA-256 727e0785f568193d1ed35a1b18824b32dd8bd9aa50692c41b03dd67ec967d562.
Private Registrierung danach nativ deaktiviert. Für den ausdrücklich als instrumentiert zu kennzeichnenden
Pausentest wird ein einmalig bewaffneter, kataloggebundener UI-Wartehaken vorbereitet; kein Eingriff in
Produktquellen, Statistikberechnung oder Katalogzustand durch den Haken. Als positive FN-Änderung
während Pause ist eine einzelne Art-Favorit-Setzung vorgesehen. Ein direkter Wechsel auf das zweite
Fixture-Taxon wird vom regulären Konfliktschutz korrekt abgelehnt und ist kein geeigneter Deltaweg.

**Prüfhelferabweichung bei Fortsetzung am Abend:** Der ausschließlich private UI-Wartehaken scheitert
bei 500/501, weil die Lightroom-Lua-Umgebung `os.rename` nicht anbietet. Der synthetische bisherige
SDK-Ersatz hatte diese Funktion bereitgestellt und diese Grenze deshalb nicht erkannt. Native Anzeige
`fe078062-dc66-4178-a239-bc59332f1afb/native-audit-proof.json`, SHA-256
808e00ea0696cc05b4dcab348884c7a60af64cf975369ed1cf6a94bbbc05843d. Kein Produktfehler und
kein Pausennachweis daraus. Konsistente Aufnahme `f15e2541-a295-4c35-bfa4-df44f86198dc/
statistics-501-catalog-read.json`, SHA-256 8303d4267011009b9ba48751a1c53350dc6ce5c6f950c95e9d6efe7362c40819,
und strenger Vergleich aller Einträge, FN-Propertyzeilen, realer Keywordrelationen und Statistikvariablen
gegen I0: vollständig gleich. Erster irrtümlicher Vergleich eines nicht vorhandenen JSON-Schlüssels
verworfen; maßgeblich ist der danach ausdrücklich auf vorhandene Schlüssel geprüfte Vergleich.
Private Registrierung nativ deaktiviert, beide eigenen UI-Dateien exakt zurückgestellt:
`9ffff9eb-8023-4ee2-b23a-eb4486c4f10f/statistics-ui-probe-operation.json`, SHA-256
72887c086993a62d4a3b29a5794c3c2c789e03f65d1b7a21d8cf56d176d11236.
Unverbrauchter Token als eigener Beleg erhalten, kein noch aktiver Armmarker:
`2b93ebf7-6dc0-4940-a1aa-9519bb3fc751/own-probe-unconsumed-arm-preserved.json`, SHA-256
d769a5f8d03e8b266f61753144aa8d32fb8b79662fa55975e8cc4ac463cac0ad.
Neue private Fassung nutzt ausschließlich den bereits im Produkt eingesetzten SDK-Dateitransport.

**Weitere private Instrumentierung und Rückstellung, 18./19. Oktober:** V3 und V4 erreichen erneut
einen vollständigen Index, verbrauchen aber den eigenen Armmarker nicht. V4 lädt das Probe-Modul per
`dofile`; ein alter bereits geöffneter UI-Closure wird dadurch allein nicht erneuert. Die Probe kehrt bei
Guard-, Lese-, Token- oder abgefangenem SDK-Move-Fehler still zurück. Deshalb ist weder „Callback nicht
erreicht“ noch ein konkreter SDK-Pfadfehler belegt. Statischer Vergleich bestätigt konsistente Pfad-/
Slashnormalisierung und den exakten 36-Byte-Token ohne BOM/Zeilenende. `LrFileUtils.exists` wird dort
nicht benutzt. Letzter vollständiger eigener Index 22:40 MESZ, Revision 1: `ad7317b4-e754-4826-875d-62e10526cdac/
statistics-501-catalog-read.json`, SHA-256 9bc692211ef16d26fd68169c63a28fcc4c59306d3e46779db14523023f757302.
Das ist weiterhin **kein nativer Pause-/Fortsetzungsnachweis**.

Nach regulär angestoßenem Lightroom-Neustart öffnete sich zunächst der Hauptkatalog; der anschließende
Versuch, denselben eigenen 501er-Katalog zu öffnen, blieb ohne Rückmeldung. Kein erzwungenes Beenden
oder erfolgreicher eigener Neustart daraus behauptet. Bei Fortsetzung am 19. Oktober ist Lightroom
wieder mit Hauptkatalog bedienbar. Private Registrierung nativ deaktiviert; beide eigenen UI-Dateien
exakt zurückgestellt, Operation `1ff64779-7e10-492e-ae03-c4d5efa8f749/statistics-ui-probe-operation.json`,
SHA-256 59b174127f3e11ec29922d95e3a69c4821b40802efddee01299a2886829eb726.
Original **0.4.24.34** frisch nativ aktiv, Produktions-CoL/Master/Paket passend und private Registrierung
inaktiv: `aeef3edb-ce6c-4db3-b84d-7b4730f1ac51/native-audit-proof.json`, SHA-256
c99f1eaa8a0fb6b58f69e356de476b2339d1bd24cb773c168c90ccbf53a41da8.

Die Import-Duplikaterkennung ist bei frischer leerer Importansicht bereits eingeschaltet; nicht erneut
umgeschaltet. Keine Quelle gewählt und kein Import ausgeführt; Ansicht regulär abgebrochen. Metadaten-
anzeige auf vorherige `FN Wildlife – Foto & Taxonomie` zurückgestellt, ohne ausgewähltes Foto.
Beleg `040fe5f9-96a1-4d1a-b5a9-cd6b33acde76/native-audit-proof.json`, SHA-256
646259338340c4887261b23674b92570173e6ed0f1092f117f8aabc3d8769259. Alte unverbrauchte Armdatei
36 Bytes als Beleg exklusiv kopiert, Inhalt geprüft und ursprünglichen aktiven Marker entfernt;
keine pauschale Tempbereinigung. Erster Schlussprüfhelfer stoppte erst danach an einer zu strikten
JSON-Assertierung auf ein optionales Fehlerfeld; korrigierte rein lesende Schlussprüfung verwendet die
erhaltene Belegkopie. Vollständiger Beleg `2427c82e-cf1a-4556-a4cf-50d06820cf32/
19-october-source-and-clean-close.json`, SHA-256 9a8fd9ac4e0f7fbe1510718ac1a9e2aefe8a8cbbd0f57f4a5039443a4eba32f3.
Nächster enger Ansatz wird nur vorbereitet: sichtbarer kataloggebundener kooperativer Startaufschub
vor dem unveränderten Aufbau, echter Pausierenknopf und normaler erster 500er-Checkpoint. Keine weitere
Instrumentierung ohne Review; Pause, Fortsetzen und FN-Änderung während Pause bleiben offen.

Vor neuer Instrumentierung am 19. Oktober nochmals nur lesend geprüft: `db775ec6-a8bf-4fed-bb13-92ac63ddbec0/
statistics-501-catalog-read.json`, SHA-256 27063de4c9ba238c63af3dd286b40e5e5318c030c76a577920ffc0a60225c829.
Unabhängiger JSON-Prüfer `7e03a8cd-088a-4afd-9064-3d9793242269/statistics-501-json-inspection.json`,
SHA-256 50bf41e47a9a41557d30a1f83930d3473ec5c2f76ad898f0e0a095bd59a31292: alle 501 FN-Zuordnungen,
501 Länder, 4.008 FN-Taxonomie-, 501 FN-Orts- und 501 manuelle Kontrollrelationen passend; vollständiger
Index, Revision 1, keine gespeicherte Teilberechnung. Vollständige vorhandene Schlüssel `entries`,
`fnPropertyRows`, `keywords`, `statistics` gegen letzte Aufnahme vom Abend exakt gleich:
`1a65ef74-306d-41b9-a4f9-b9a314cb15ec/statistics-501-restart-comparison.json`, SHA-256
df861e9c97e32493c9155d754b9fc4a8a6b2db423fa6b839bdcc872035b71a8a. Derselbe eigene 501er-Katalog
anschließend nativ wieder normal geöffnet, private Kopie vor Vorbereitung weiterhin deaktiviert.
Der zwischenzeitliche Rückstand beim Wiederöffnen ist damit heute nicht erneut reproduziert; kein
unbelegter dauerhaft korrigierter Lightroom-Startfehler daraus. Keine Fotos im Hauptkatalog verändert.

**Native Pause/Fortsetzung einschließlich FN-Änderung am 19. Oktober bestanden:** Nach unabhängigem
Rootreview genau eine private UI-Datei instrumentiert. Vorbereitung `896a1d85-f6b4-4a41-a61b-0bb1b24a0214/
statistics-start-delay-preparation.json`, SHA-256 622f5fdf3af98ae115abc292c8a4997d276d01075fc5ad5bfd74b552a6757a03;
29/29 Gegenproben mit echten unveränderten Statistics-/PluginState-/JSON-Modulen, originaler
Pausenbuttonaction und vollständigem bisherigen Index. Einmaliger kooperativer 30-Sekunden-Aufschub
vor erstem Lesen, exakter privater Pfad/aktiver 501er-Katalog/Anzahl geprüft, tatsächliche Pfade und
eindeutiger A5-Fenstertitel sichtbar. Keine Dateitokens oder Transportabhängigkeit. Fortschrittsfunktion,
Pausenaktion und Fachmodule unverändert; kein programmatisches Setzen der Pausenanforderung.
Private Registrierung vor Einbau frisch nativ deaktiviert; Installation `cae3ef7c-9795-4411-a396-e48df78d51c7/
statistics-start-delay-operation.json`, SHA-256 88f2ba5f4e0dd572be6f3a1e9afea9b65b5af15677f697def5fa71ffa0b6f5a0.
Privatkopie ausdrücklich neu geladen, aktiviert; keine weitere Registrierung angelegt.

Erster tatsächlicher Klick auf **Pausieren** während sichtbarem Countdown: nach originalem ersten
Leseblock **500/501**, letzte Foto-ID 1212, Revision 1 und eigener Zwischenindex korrekt gespeichert.
Alter vollständiger Index vollständig bytegleich erhalten. Native Bildbeleg `82b47080-8ad3-4d3f-b00d-9b7e98124cb9/
native-audit-proof.json`, SHA-256 e0dc86f06460141e59e46bb9a6ad4ed2c3656129e70f4d10fcb58fcfd6cf7105;
AX dieses ersten Belegs liegt noch unmittelbar am Countdownende, das Bild zeigt bereits die Pause.
Nachfolgende frische AX-Lesung bestätigt „Aufbau pausiert“, 500/501 und **Fortsetzen**. Konsistente
Katalogaufnahme `2209fe33…`, SHA-256 56364f71e81faafd4bc1bec5151ccaa02208da7fbf198fcb43d3a9c1e4dbd402;
unabhängiger Prüfer `e70b13e0-2e4a-4791-90cb-b840d7c43b36/statistics-501-json-inspection.json`, SHA-256
10c47a0b21fb2ecc595a71e86c76334dcdfcc8183df115ca3cb70c09c572b1a1, `passed:true`.

Genau ein **Fortsetzen** ohne Änderung: vollständiger Index 501/501, keine Doppelzählung, kein Rest-
zwischenstand. Native Beleg `390e367c…/native-audit-proof.json`, SHA-256
c7da66bdaff5f0bef2e600a79c1aa9ee8777fa43c8553397e0237f4b4bd79e38. Katalogaufnahme `af5fbff4…`,
SHA-256 77a5196a05ce4ed867463bcf6131fe50ccdb14d25ec60da19ced0717ca43f839; unabhängiger Prüfer
`d7ee52d8…`, SHA-256 2c30bac895bd8977016a48123b7efabe31ba27353797bb59fdf310deab50b8bf, bestanden.

Zweiter echter Neuaufbau und erneute Pause **500/501**. Ein erster AX-Klick wurde wegen fehlender
Geometrie verweigert; erst nach frischem Screenshot tatsächlich geklickt und sichtbare Anforderung
bestätigt. Native Beleg `ca153c01…`, SHA-256 3d44f33554f8052c3f70942b7307fe0908521ecb937ad7980faf12b1aa13e30e;
Katalogaufnahme `01b3286a…`, SHA-256 7f12838ec44cd49c011a46f96352854574cede12425e3a9578d59c18b0ab452f.
Prüfer `863ce2f2…`, SHA-256 19ac866bfe5c15638ad6377bc28e1fe03b501dffc8c3a794415f27643c6f3d6c, bestanden.
Bei weiter offenem Pausenfenster über reguläres Menü genau das ausgewählte eigene Foto als Art-Favorit
gesetzt. Native Erfolgstext vollständig per AX; zusammengesetztes Bild ist teilweise vom Pausenfenster
überdeckt: `575d4d26…`, SHA-256 c3bb0ab7eec6dec7157490b2d43f69a59c8c41bde759149dc6a40e19d1bc44c5.

Konsistente Aufnahme **vor Fortsetzen** `046fd228…`, SHA-256
8f9e75f64b537a0e4a84b75125b7415f55af9b842c96a2e425195e72e72e9a75: Revision genau 1 → 2,
genau ein Favoritenfeld, gespeicherter alter Teilaufbau entfernt. Alle übrigen FN-Felder, Original-IPTC,
Fotoidentitäten und realen Keywordobjektrelationen unverändert; vollständiger bisheriger Index nur um
erwarteten Favorit/Revision/Zeitstempel verändert. Prüfer `a188ff0c…`, SHA-256
e1e4e6cddeb371f33240f7f29117fc9159e8dd8fab209af4c6ccceeadcb62b49, bestanden.
Danach genau ein **Fortsetzen**: gültiger vollständiger Neuaufbau mit Revision 2, allen 501 Taxonomie-
und Ortszuordnungen und genau einem passenden Favoriten; kein Teilaufbau oder Doppelzählen.
Native Beleg `efea31d1…`, SHA-256 ea31d8239f4b9a63b372ea7bd4c6e00d7b80ec5161e366d5224ebdeaa93c2b4a;
Katalogaufnahme `cf6cf27e…`, SHA-256 cf9857669d2b183baf92a38cdf5bf9b03ca83e1b35e7724a50ebbd499fc343fa;
vollständiger unabhängiger Schlussprüfer `b597e177-1732-4993-9883-1c3622d58f25/
statistics-501-json-inspection.json`, SHA-256 0e9fccc2f8f1b4fb3c1927f60b58bd1fcaa04f055eb2c794cf8d87df5ad3f9a7,
`passed:true`, keine fehlgeschlagenen Checks.

Dies schließt den ausdrücklich instrumentierten nativen **bewussten** Pause-/Fortsetzungs-/FN-
Revisionsfall. Keine automatische 5.000er-Checkpoint-, Stromausfall- oder Großbestandsabnahme daraus.
Die einzige erwartete Testkatalogänderung bleibt der gesetzte eigene Favorit samt Revision/Index;
keine FN-Daten im Hauptkatalog geändert. Private Registrierung frisch nativ deaktiviert und A5-Datei
exakt zurückgestellt: `99ade149-a467-4da1-9d37-14e554430d9c/statistics-start-delay-operation.json`,
SHA-256 2e272af5d3f92eb29db73f1daabee6d6c591b61773d26016cbe27ec1981af231; Originalhash der privaten
`ShowStatistics.lua` wieder 80b324e3346e9480a590a9e888b26e8a7c36deaff7bd2c220c8b4d829998eeb3.

**Frisch geänderter Nutzerzustand am Mittag:** Vor dem nächsten eigenen Katalogwechsel zeigt Lightroom
in den Katalogeinstellungen tatsächlich **D:\Lightroom Katalog\Lightroomkatalog aktuell.lrcat**,
erstellt 18. Oktober. Der frühere H:-Pfad wird deshalb nicht ungeprüft wieder geöffnet. Native Beleg
`ff2972b7-2fc2-41f0-88a6-7051fbc71603/native-audit-proof.json`, SHA-256
854204d629b327c640976948e91dd8579a8632461aca0f433f05dde334a56867. Übrige vom Nutzer deaktivierte
Plug-ins und Metadatenansicht `Standard` erhalten. Nach der begrenzten dichten Sichtprobe (10.38)
Original **0.4.24.34** wieder aktiviert und genau dieser aktuelle Hauptkatalog regulär geöffnet;
CoL/Master/Paket passend, private Testkopie inaktiv. Native Schlussbeleg
`1e8aa02d-d325-4053-9a06-c82d515604a1/native-audit-proof.json`, SHA-256
cba7104ca4ec80280f30c9cdcfebbc08a503a054352eee3b3ffb3766c8c01115. Manager danach geschlossen.
Eigener 501er-Katalog nach reiner Sichtprobe konsistent gelesen: `10355311-7144-4d0d-a1d2-5de44a5246a7/
statistics-501-catalog-read.json`, SHA-256 e2e13828276b006f4abc6e4c53140f855a20647834d2be113b3b56e82c955990.
Alle vorhandenen Einträge/FN-Propertyzeilen/realen Keywords/Statistikvariablen/Ordner/Schemata exakt wie
nach der erfolgreichen Revisionsprobe `cf6cf27e…`. Schlussbindung `dc6c41d6-2923-4f7e-873a-a695d28f18e0/
19-october-audit-continuation-close.json`, SHA-256 89c6dd5663f1dec4b595ff63763df165120ab60466f4be2119e7a2b6ae1b7898:
134 Produktquellen weiterhin identisch zum bestandenen 1.878er-Gate; geprüfte Belegsitzungen geschlossen,
null offene Operationen/Hilfsprozesse. Keine neue Produkt-Plug-in-Änderung durch diese Instrumentierung.

### 10.38 Dichte Exploreransicht und Fokus nach Namensvorschau – 18. Oktober

Neue minimale eigene Umgebung: 18 gebundene Eingänge, 722.811 Bytes, zwei synthetische Taxa,
unveränderte Originaloberfläche und Originalserver. Speicherung, Aufbauten, NAS, Unterprozesse und
externe Abrufe gesperrt; einziger erlaubter POST ist die reine Namensvorschau. Eigener Helfer nach
Vollreview um Verknüpfungsprüfung je Schreiboperation und Schlussprüfung **nach** Serverende ergänzt.
Gegenproben `6f9d5bb7-84bf-4694-9238-4d36bcad2439/dense-runtime-review-and-guards.json`, SHA-256
a829be39b3fa5bf56336f9d960b223b91aa2965ae23ede7ff645a3a4b509f789. Erstlauf `bd5abe33…`
startet technisch, wird aus dem Browser in der abgeschirmten Umgebung jedoch nicht erreicht; regulär
ohne Fehler/Quellenänderung geschlossen. Danach erlaubter eigener lokaler Listener außerhalb dieser
Abschirmung: `9ab33256-98ec-4234-8321-9b2d3abd1ee3/dense-explorer-journal.json`.

Tatsächlich geprüft: Namensdetail mit Taxonomie, Herkunft und deaktivierter Übernahme samt sichtbarer
Erklärung; langer ungespeicherter Hinweis; Tab erreicht die untere Speicheraktion mit sichtbarem Fokus.
Namensvorschau vollständig erreichbar. Standardansicht 1.133 × 637 CSS-Pixel; kleinere Browservorgabe
700 × 600 entspricht hier gemessen 619 × 531 CSS-Pixeln bei DPR etwa 1,13. Kein horizontaler Überlauf
des Dokuments oder der sichtbaren Dialoge, notwendiger vertikaler Dialogscroll vorhanden. Zwei
Zoomtastenkürzel allein belegen keine gemessene Zoomänderung. Browsergrößenvorgabe danach zurückgesetzt.
Diese Prüfung ist keine Windows-DPI-, Touch- oder native Screenreaderabnahme.

**Neuer reproduzierter P2-Befund A-47:** Nach Escape **und** nach Klick auf „Abbrechen“ in der
Anbieternamensvorschau fällt der Fokus auf `BODY`, obwohl der auslösende Knopf wieder aktiviert und
verbunden ist. Sichtbarer Tastaturfokus geht damit verloren. RED-Browserbeleg
`9e2c8900-a4d6-4295-b3e2-efeaa1c5b8f6/browser-ui-proof.json`, SHA-256
0fb47f9a207eaa136807982b2052775506e8e83a8460d8a206ded008d4252d53.
Eigene Browserseite und Server vor Quelländerung regulär geschlossen; alle 134 gebundenen Quellen,
18 ursprünglichen Eingänge und beide Basisdatenbanken dabei unverändert. Keine Namenswahl gespeichert.

Enger Codefix ausschließlich im Namensworkflow: Fokusbesitz vor Deaktivierung merken; nach tatsächlichem
Abbruch erst reaktivieren, dann nur bei unveränderter Anfrage/Art/Auswahl, offenem Hauptdialog,
verbundenem Auslöser und tatsächlichem BODY-/HTML-Fokusverlust zurückkehren. Andere Eingaben behalten
ihren Fokus. Zusätzlich alte Vorschauantwort bereits **vor** Öffnen der Bestätigung an denselben Zustand
binden. RED gegen unveränderten Code: 69 Fälle, 61 bestanden/acht erwartete Fehler, Beleg `806c8710…`,
SHA-256 e544a894dcf0fb826d76bb4df418d3b947f013914764140d1c6f11030bdee753.
GREEN: 70/70, keine Fehler/Abbrüche/Skips; Beleg `34fc2cb7…/name-choice-focus-green-result.json`,
SHA-256 03e54491a4ddf1f36e57b9669ab67c33c1cbf67877408a17bb0bb76157166961.
Rootreview der zwei Dateien abgeschlossen. Keine Plug-in-Dateiänderung daraus.

**Vollständiges Gate abgeschlossen:** Erster abgeschirmter Lauf `f53bac55-fa2c-4b00-9a25-52256efda3d7`
scheitert ausschließlich an verweigertem Windows-Linkanlegen in eigener Testfixture; kein erfolgreicher
Gesamtlauf daraus. Erlaubte Wiederholung mit unveränderten Quellen am 18. Oktober 22:38:51–22:46:43 MESZ:
**50 Gruppen / 1.878 Tests bestanden**, null Fehler/Abbrüche/Skips, Gesamt-Exit 0. Ergebnis
`111cbb1f-50f3-42d0-88c9-55b438620a49/quality-result.json`, Log-SHA-256
5a390a25204731df67409820b0da69e65b7e43856ff74ede346d6af883724743. Alle 134 Quellen währenddessen
unverändert. Die danach gestartete eigene Browserruntime `4fea59b3…` hat nach Unterbrechung keinen
Schlussnachweis; kein nachträglich erfundenes sauberes Ende. Am 19. Oktober frische eigene Runtime
`32373cc8-7690-4fa2-8cc9-9dfd86e20846` mit demselben gebundenen Quellstand gestartet.

**Tatsächliche Browsernachprobe am 19. Oktober bestanden:** Escape bringt den Fokus sichtbar zum
wieder aktivierten Anbieterknopf zurück. Anschließend gezielt im obersten Bestätigungsdialog geklicktes
Abbrechen, sowohl nach Tastatur- als auch Mausauslösung: Fokus zurück am Anbieterknopf, Bestätigung
geschlossen, Suchanfrage `Calidris` erhalten. Ein erster nicht auf den obersten Dialog begrenzter
Klick traf den unterliegenden gleichnamigen Abbrechenknopf und wird ausdrücklich als Prüfbedienungs-
abweichung verworfen; maßgeblich sind die danach getrennten sauberen Abläufe. Bei Mausbedienung ist
`:focus-visible` erwartungsgemäß nicht erzwungen, nach Escape wahr. Beleg
`6b5daa80-ca8b-496d-ae72-01577b81ecd6/browser-ui-proof.json`, SHA-256
5b02befc5b7b88e3022a53ff81ed5622445fe8023865903853fc4c6ff9e10532.

Schmale Ansicht erneut gemessen: 619 × 531 CSS-Pixel, Dokument 606/606 und Dialog 553/553 Client-/
Scrollbreite; vollständiger Vorschautext und beide Aktionen sichtbar, Escape-Rückweg mit sichtbarem
Fokus bestanden. Beleg `c7d38cff-1343-416e-acf1-d4535398d0d7/browser-ui-proof.json`, SHA-256
ad5911e299a534f489c7f2509a1797283e11d9a249fb92a2daa885a2f1791777. Fenstergrößenvorgabe zurückgesetzt,
eigene Seite geschlossen, Server regulär per eigenem Stopweg beendet. Runtimejournal SHA-256
0d96cf8494a986de1f2c461fe687b3b5d2f1376cabd236587d5be3a729b7c60b, Abschluss 08:03:26 MESZ,
124 Anfragen, kein Fehler. Alle 134 Quellen, 18 Eingänge und zwei Basisdatenbanken unverändert;
zusätzliche Quellen-/Schlussbindung unter `2427c82e…` (10.37). Keine Namenswahl gespeichert.

**Begrenzte native Lightroom-Sichtprobe am 19. Oktober:** Nach A5-Rückstellung eigener 501er-Katalog
und vorhandene private .34-Kopie; keine neue Registrierung und keine Zuweisung/Namensspeicherung.
Dialog 966 × 801, alle vier Bereiche, lange Erklärung zur globalen Namenswirkung und untere Aktionen
vollständig sichtbar. Suchfeld `Calidris` liefert die eigene Art; Tab erreicht sichtbar `Art suchen`
und die untere Zuweisungsaktion. Deaktiviertes `Öffnen` wird zwischen letzter Auswahl und Korrektur
übersprungen. Escape schließt die geöffnete Namensauswahl ohne Übernahme; anschließendes Tab bleibt
im Dialog. Vollständiger Hierarchiepfad einschließlich Gattung/Art per tatsächlichem Scrollen gelesen.
Native Beleg mit einzelnen AX-Schritten `26ca53b4-0593-43a0-ad08-8656394a7ded/native-audit-proof.json`,
SHA-256 c4ee22e3f52053d2eef2732af94df091856f5413a8ff65785f0e9b521c447238.

**Ehrliche Bediengrenze:** Die native Detail-Liste wird in der normalen Tab-Reihenfolge übersprungen;
ein erster Ende-Tastendruck bei tatsächlich anders liegendem Fokus scrollte sie nicht. Kein bestandener
Tastatur-Scroll-/Screenreadernachweis daraus. Die langen Originalhinweise sind sichtbar, ein extremer
neu angelegter Langname wurde in dieser Runde nicht gespeichert. Keine zusätzliche Windows-DPI-/Touch-
oder vollständige WCAG-Abnahme. Rückkehr und unveränderte Testkatalogdaten unter 10.37 belegt.

### 10.39 Konkrete Großrestore-Vorprüfung – 18. Oktober

Ausschließlich lesend das konkrete moderne Archiv vom 7. Oktober gebunden:
`W:\Website Datenbank Backup\IUCN_Datenbank_2026-10-07_215313_b13afd861ad7.zip`,
21.785.161.273 Bytes, unveränderte Größe/Änderungszeit vor und nach kleinem Zugriff. Inhaltsmanifest
3459 Dateien/100.066.048.623 Inhaltsbytes; mit Manifest 100.066.984.056 Bytes. Zentralverzeichnis
vollständig gegen Pfade/Größen verglichen, nur sieben kleine Einträge mit zusammen 992.986 Bytes gelesen.
Das ist keine neue vollständige Prüfsummenrücklesung des Großarchivs; der historische Nachweis bleibt
gesondert unter 5.6. Beleg `baf292e7-32bf-4962-9158-192ed05b07be/restore-concrete-precheck.json`,
SHA-256 8cccd11787fa3b97404dee99dfd076ca2221bd15651ad13d5106efa713843100.

Frischer Platzstand 13:29 MESZ: D: 89.034.686.464 freie Bytes und damit bereits ohne Reserve zu klein;
E: 285.333.815.296 freie Bytes. Vorgeschlagener eigener Zielordner
`E:\Arten-Explorer-Restore-2026-10-07` ist nicht vorhanden. Direktes Lesen vom NAS erspart eine zusätzliche
ZIP-Kopie. Vor einer späteren Freigabe erneut Platz/Archivbindung/fehlendes Ziel prüfen, mindestens
20 GB Reserve, ausschließlich neue Dateien, keine Überschreibung und vollständige Inhaltsprüfung.
Keine belastbare Laufzeitmessung für diese große Kopie; keine feste Dauer zugesagt.

Historischer Desktopstarter würde Verknüpfung ändern und passt nicht zur benötigten Node-24-Startrolle.
Deshalb getrennten Prüfstart vorbereiten. Der eigene erste Entwurf `8551032a…` ist **nicht sicher
startbar** und wurde nicht gestartet. Echte kleine Node-24-Gegenproben zeigen: FS-Rechte allein schützen
SQLite nicht; CJS-Ersetzung plus `syncBuiltinESMExports()` erreicht spätere SQLite-ESM-Importe nicht;
enge Ordnerrechte verhindern historische Linkprüfungen auf Laufwerksvorfahren. Ein synchroner
`module.registerHooks`-Hook erreicht in der Gegenprobe ESM und CJS und kann fremde Konstruktorpfade
vor dem nativen Öffnen abweisen. Das deckt SQLite-ATTACH und die vollständige historische Startkette
noch nicht ab. Build-/Schreib-/Netzrouten, Vorfahrenprüfung und getrenntes Electron-Profil müssen vor
einem echten Start vollständig geprüft sein. Kein Aufweiten auf ganz E: als Ausweg.

Kompakter **Plan ohne Startfunktion**, 60/60 synthetische Gegenproben, null Fehler/Skips:
`4b95865f-5aaf-436a-a299-aa6ca8592caa/restore-review-result.json`, SHA-256
fb88a28cef7059a274305c5043920e7573364328d5c0bf65d56725ef80439b04. Plan-CLI verweigert jeden
Startversuch. Eigene Status-/Housekeepingdateien wären später nur innerhalb der exakten Kopie zulässig.
Keine E:-Schreibzugriffe, Extraktion, NAS-Änderung oder Programmstart. Technische Startisolation und
konkrete Großrestorefreigabe gemäß §6J bleiben offen; Freigabe ersetzt die technische Grenze nicht.

**Inaktives Startpaket am 19. Oktober konkretisiert und durch Root gelesen:** Eigene Sitzung
`70a9e9f1-d949-4d51-9c69-344533ff1e94`, Ergebnis `restore-isolation-result.json`, SHA-256
386bd8d9a76aadf4deba335785d12d18af73b255c85cd7f25ca1aa8142890726. Finale **41/41 synthetische
Gegenproben**, Log-SHA-256 52a097fddbe19fcdfa5283275dbb1e3cd4caa60347eeffc1c046d3859c08a135.
Native Node-24-SQLite-Autorisierung blockiert ATTACH über exec/prepare/TagStore sowie VACUUM INTO,
gefährliche Verzeichnis-Pragmas, Backup und Erweiterungen; ESM/CJS/getBuiltinModule erhalten dieselbe
Fassade ohne zugängliche native Datenbank. Kein Aufweiten auf das ganze Ziellaufwerk: historischer
Speicher-/Migrationscode erhält nur zuvor gebundene Metadaten der exakten Vorfahren. Fremde Ordner-/
Dateilesung bleibt verweigert. Dienstgrenzen verhindern automatische Publikationsrücknahme,
Korrekturbaseline, Anbieterprüfung und gespeicherten Koordinator-Wiederanlauf. Nur eigener dynamischer
Loopbacklistener und freigegebene Leserouten; Unterprozesse und externe Netzwege gesperrt. CLI startet
noch nichts. Fünf historische Startdienste sind gegen das bereits gesicherte Archivmanifest gebunden.
Dies ersetzt noch keinen tatsächlichen vollständigen historischen Start oder Electron-Nachweis.

**Zusätzlicher echter historischer Serverstart mit kleinen synthetischen Daten bestanden:** Aus
vorhandenen lokalen Git-Ständen genau **235 Dateien / 2.637.381 Bytes** rekonstruiert und jede Datei
gegen SHA-256/Größe des gebundenen Archivmanifests geprüft; kein neuer NAS-Zugriff oder Großdatenlesen.
Unveränderter historischer Server samt vollständigem kopiertem Modulgraph, eigener synthetischer Art,
historischer Speicherkonfiguration/Migrationsbeleg und wartendem künstlichem Auftrag starten unter
den geprüften Grenzen in eigener D:-Sitzung. `/`, Zusammenfassung und Artenlesung HTTP 200;
NAS-/Lightroom-/Aufbaurouten 403. Alle vier automatischen Startaktionen sichtbar blockiert, reguläres
Serverende mit Exit 0, sämtliche Quell- und künstlichen Datenbindungen unverändert.
Finaler Beleg `be851509-09f5-4680-9639-2fc11f608cbe/historical-bootstrap-result.json`, SHA-256
a9a4080d865e3758bc9532afa0f2e1d23dd5a4bb4841d225da1ca9b7fc6b0b7e; durch die oben genannte
Root-Schlussbindung vollständig nachgeprüft. Erster Helferlauf überschritt die Windows-Kommandozeilen-
länge vor dem Start; danach nur die zum geprüften Starter passenden Eingangsbindungen in argv,
vollständiger 235-Datei-Vergleich weiterhin im Elternprozess. Ein folgender künstlicher Datensatz
enthielt zunächst keine getrennten Gattungs-/Artfelder; abschließende Probe korrigiert und ausdrücklich
auf genau eine zusammengehörige Eingangs-/Ergebnisart geprüft. Beides Helferabweichungen, keine
Produktfehler. Historische Oberfläche meldet intern weiterhin Bearbeitung aktiv; allein die äußere
Prüfgrenze sperrt die Aktionen. Kein daraus abgeleiteter Produkt-Lesemodus.

**Begrenzte echte native Restore-Oberflächenprobe am 19. Oktober bestanden:** Eigene Sitzung
`836cf3aa-6d30-44e5-950b-8abb1b8c2dce`, Ergebnis `historical-bootstrap-result.json`, SHA-256
7df365be1bdbd22cea2f766befe3bc75e9f9a18a8c30148d9df30d6379cbe87e. Derselbe unveränderte
235-Datei-Archivgraph mit einer künstlichen Art; aktueller bereits lokal vorhandener Electron-Runtime
in eigener Kopie, getrennte Profil-/Sessionpfade ausschließlich in der Testsitzung. Tatsächlich über
Windows-Steuerung gestartetes Fenster zeigt genau die künstliche Art; dessen Aktualisierenknopf lädt
sie erneut vollständig. Native AX-/Bildbelege `04b124ba-c504-4850-a790-285440a59a6c/native-audit-proof.json`,
SHA-256 1e0108983f0c2c56fe758a09c2a2f9722762e142ebe5d2bb1a1c6f340c1ff656. Die 17 sichtbaren
Prüfhinweise gehören zum absichtlich unvollständigen künstlichen Datensatz, nicht zum Produktbestand.

Der enge äußere Leseroutenfilter hatte zunächst das vollständige Frontend-Snapshot verhindert:
historische Git-Abfrage und Pipeline-Status sind dort bewusst nicht freigegeben. Negativer nativer
Beleg `f3e963f9-92ad-4c97-970b-e5eff92878d3/native-audit-proof.json`, SHA-256
f5106094e186bb47022a39256e96fa070ad8af1cfcb49bfa58191f2708474dc9. Nur die zwei exakt passenden
GETs erhalten jetzt ausdrücklich **künstliche Prüfantworten** außerhalb der unveränderten historischen
Handler; Methoden-/Query-/Pfadvarianten bleiben gesperrt, 17 gezielte Adaptergegenproben plus echte
HTTP-Gegenproben. Git wird als ungeprüft mit vorsorglich vorhandenen Änderungen ausgewiesen;
Pipeline-idle beschreibt ausschließlich die deaktivierte Testpipeline. Keine echte Git-/Pipelineabnahme.

Der eigene aktuelle Betrachter verwirft den absichtlich ausgelösten fremden Seitenaufruf tatsächlich
mit `ERR_BLOCKED_BY_CLIENT`; eigener Originfilter, verweigerte Fensteröffnung/Webviews/Downloads und
getrennte Session sind im Quelltext geprüft. Das ist kein Betriebssystem-Netzmitschnitt sämtlicher
Chromium-Hintergrundzugriffe. Ein zunächst konstanter Nullzähler wurde nach unabhängigem Review
entfernt und wird nicht als Messung ausgegeben. Die vorsorgliche Git-Antwort löst historisches
beforeunload aus: ausschließlich der schreibgesperrte eigene Prüfbetrachter protokolliert und verwirft
diesen künstlichen Veto. Die echte native X-Schließung beendet Fenster und Betrachter mit Exit 0;
frische OS-Abfrage bindet vorher PID/exakten EXE-Pfad und findet danach **keinen Prozess** dieser
Runtime mehr. Eigener Server ebenfalls regulär mit Exit 0 geschlossen, sämtliche 235 Quellen,
künstlichen Eingänge und kopierten Runtimebytes unverändert. Keine Abnahme der historischen
Desktop-Schließbestätigung. Alle gebundenen Sitzungen geschlossen, null Operationen/Helfer.

Frühere Desktopversuche zählen ausdrücklich nicht als bestandene native Abnahme: unzugängliches
Fenster, begrenzter Zeitablauf beziehungsweise durch die künstliche Schließwarnung verhinderter
Abschluss; ein eigener Viewer wurde nach exakter PID-/Pfadprüfung beendet. Ein weiterer Versuch
`6982c825…` lädt und schließt nativ, bleibt insgesamt fehlgeschlagen, weil Windows das zusätzliche
unsignierte Prozessprüfskript verweigert. Ausführungsrichtlinie unverändert gelassen; abschließende
positive Probe verwendet ausschließlich eine direkte lesende OS-Abfrage. Keine Schutzregel gelockert.
Aktuelle Root-Schlussbindung `9bbb9a39-fc3a-4fb9-98eb-39944886e780/19-october-audit-continuation-close.json`,
SHA-256 777ef8277d98053a295f550a05557d0550c4f2c96d7cb18cd91d4642df6cde2e: weiterhin alle 134
Produktquellen identisch zum bestandenen 1.878er-Gate und sämtliche sechs erfassten Bereiche des
501er-Katalogs vor/nach reiner Layoutprüfung vollständig gleich.

Weiterhin keine vollständige Archivwiederherstellung, echte Paar-/Medienabnahme im Restore oder E:-
Schreibzugriff. Der jetzt bewiesene kleine eigene Viewer-/Serverstart ist noch kein gemeinsamer
Supervisor für die reale Kopie. Konkreter Kopierhelfer, frische Platz-/Archivbindung und die große
Restorefreigabe bleiben vor der vollständigen Kopie erforderlich.

**Kopierweg konkret vorbereitet und durch Root nachgeprüft:** Agentenpaket `e2f605f0…` enthält 33
kleine bestandene Kopier-/Pfad-/Token-/Fehlergegenproben und einen rein lesenden Archivplan. Der Agent
erreicht danach seine Nutzungsgrenze; kein Agentabschluss behauptet. Root liest Helfer und Tests
vollständig und ergänzt echte kleine Windows-Dateiproben. Dabei ist der ursprüngliche Helfer trotz
33 grüner Fälle zunächst **nicht freigabefähig**: Ein nur mit Metadatenrechten geöffneter Ordner lässt
sich unter NTFS weiterhin umbenennen. Negativer Rootbeleg `cab8a438-384f-4e52-8ce2-a884124befbd/restore-copy-root-review.json`,
SHA-256 8f4ca8745ef7b46f9eff540c4081ec647801678b2ecb2464fc14a3f56acc5169, drei/vier native Fälle.
Keine große Kopie mit diesem Helfer gestartet. Korrektur nur in neuer eigener Tempkopie: echte
Leserechte am Ordnerhandle machen den Ausschluss von Umbenennung/Löschung tatsächlich wirksam.

Finale Sitzung `fa7e68da-ddf2-4d44-975b-ad5d3abf90c7`, `restore-copy-root-review.json`, SHA-256
5b1b9a5b2b457534031a9e78d89780d4bdec9299fe3281cfbbc47711618539c0: erneut **33/33 kleine Fälle
und vier/vier echte Windows-Gegenproben** bestanden. Tatsächlicher NTFS-Hardlink vor Zugriff verweigert,
echte eigene Junction als Vorfahr verweigert und deren Ziel unverändert; gehaltenes Verzeichnis kann
nicht umbenannt werden; geöffnete neue Datei sperrt zweiten Schreiber/Umbenennung, unabhängige
Rücklesung funktioniert. Kein echter voller Datenträger erzeugt; Platzmangel bleibt durch hohe
synthetische Reserve geprüft. Maßgeblicher korrigierter Kopierhelfer SHA-256
9a657a4d5ad09a3f7e51f4363429ee1e476a70f6a67ceda220364bca38b482ae; alter Plan/Token passen dazu
ausdrücklich nicht mehr. Neue ausschließlich lesende Planbildung gegen unverändertes konkretes Archiv
erfolgreich. 3.460 Dateien einschließlich Manifest, 100.066.984.056 Bytes; E: 285.333.590.016 freie
Bytes bei Prüfung, Mindestreserve **20 GiB**. Kein Zielordner angelegt und kein Inhaltsvollscan.

Der feste spätere Kopierweg liest direkt aus dem bezeichneten NAS-ZIP, legt ausschließlich das neue
Ziel `E:\Arten-Explorer-Restore-2026-10-07` an und verifiziert jede Datei zunächst beim Schreiben und
danach vollständig durch unabhängiges Rücklesen. Neue exklusive Handles, nicht verknüpfte gehaltene
Vorfahren, frische Archiv-/Platz-/Manifestbindung und genaue Verzeichnisnachprüfung; Zusatzdateien,
Duplikate, Traversierung, Windows-Namenskollisionen und bestehendes Ziel verweigert. Bei Fehlern bleibt
die unvollständige eigene Kopie gekennzeichnet erhalten; kein Löschen, Überschreiben oder automatischer
Wiederholungsversuch. Journal nur in eigener Temp-Belegsitzung. **Nur Kopieren/Prüfen vorbereitet**;
kein Programmstart, Starter-/Verknüpfungswechsel, Lightroom-Zugriff oder Produktivaktivierung daraus.
Großkopie weiterhin ausdrücklich nicht freigegeben; gemeinsamer Startsupervisor für reale Daten separat.

**Ausführung der späteren Kopie ebenfalls vorbereitet:** `temp/explorer/restore-approved-copy-runner.mjs`
bindet die abschließend geprüften Helfer-/Plan-/Reviewbytes und kopiert sie vor einer späteren Ausführung
in eine neue eigene verwaltete Belegsitzung. Standard ist ausschließlich Vorschau; Ausführung verlangt
zusätzlich den exakt gebundenen technischen Planwert und weiterhin eine gesonderte menschliche Freigabe.
Sieben reine Argumentgegenproben bestanden. Vorschau `0cafbaca-976e-4ec6-9028-4765ac10d0af/restore-copy-supervisor-result.json`,
SHA-256 3e3b2e2e2285151865baca9ad0eae549a50616a9b293896ca58a14bae71bdb64, `executed=false`.
Eigener Python-Prozess würde registriert und bis zum tatsächlichen Ende verfolgt. Erfolgsquittung erst
nach Exit 0 und vollständiger Prüfung sämtlicher 3.460 Schreib- und separater Rücklesenachweise gegen
das gebundene Inhaltsmanifest; bei Fehlern keine Erfolgsquittung und kein automatischer Retry. Bei einem
Fehler des steuernden Helfers wird ausschließlich sein eigener noch laufender Kopierprozess beendet,
die unvollständige Zielkopie bleibt erhalten. Kein ausgeführter Großkopierzweig oder realer Programmstart
aus dieser Vorschau abgeleitet.

**Nachfolgende enge Ausführungsreview und Absicherung:** Die erste Supervisorvorschau belegt noch
keinen sicheren harten Elternprozessverlust: Das normale JavaScript-`finally` allein genügt dafür
nicht. Vor einer Großausführung wird deshalb der eigene Python-Kopierer an den tatsächlichen
Node-Elternprozess gebunden. Der neue feste Wrapper prüft Kernel-Elternkennung, Programmidentität
und Erstellungszeiten, übergibt den einzigen nicht vererbbaren Windows-Jobhandle atomar an genau
diesen Elternprozess und aktiviert `KILL_ON_JOB_CLOSE`. Erst danach führt er ausschließlich die
bereits gebundenen Originalkopiererbytes aus. Start nur mit isoliertem Python `-I`; Originalkopierer,
Plan und Token bleiben unverändert. Normale abfangbare Signale behandelt zusätzlich der Supervisor;
bei hartem Prozessende greift die tatsächlich geprüfte Windows-Bindung.

Eigene geschlossene Sitzung `c9638bdd-c604-494e-89fe-46e5e4a5c0f6`: Wrapper `restore-bound-child.py`,
SHA-256 8759b0e65254ffb65aad016cba130b9b8bc81e8baefa1c76675d9ff7ab8bd8fb. Elternbindungsbeleg
`parent-binding-tests.json`, SHA-256 0f8516be9e84bcb44feea061e4fd9a2284546bd3928cf654a7eb7fa26daa81c8:
**sieben/sieben** kleine Fälle bestanden. Echtes hartes Ende ausschließlich der eigenen Node-Eltern-PID,
SIGTERM unter Windows und reguläres Elternabbruchende beenden das Kind über den Jobhandle. Kein
Prozessbaum-Kill und kein Beenden des Kindes durch den Test; bereits vorher geöffneter Kernel-
Kindprozesshandle unabhängig als beendet beobachtet. Jeweils drei Teilstücke bleiben erhalten und
weitere 650 ms unverändert; keine Erfolgsquittung. Falscher Elternprozess, fremde Elternkennung,
fehlendes `-I` und falscher Token verweigert. Die Unterbrechungsproben verwenden dieselbe Bindefunktion
mit winzigen eigenen Testdateien, keinen alternativen Ausführungsschalter im produktiven Wrapper.

Zusätzlich tatsächlich benötigte Öffnungszahl geprüft: `handle-capacity-result.json`, SHA-256
dbe2b92b37706b892f6effa73b512a538aa6e9b9a3c6032e99e7e4ea7135aa5e. Unverändertes `win_open` des
geprüften Kopierers hält **3.460 eigene leere Dateien gleichzeitig offen**, liest alle unabhängig
zurück und schließt alle. Kernelhandles 136 → 3.596 → 136. Keine Betriebssystemgrenze hochgesetzt;
kein großer Datenbestand erzeugt. Root liest Wrapper, beide tatsächlichen Testprogramme und Belege.

Final integrierte reine Vorschau `ac57e687-7201-4228-bc89-0bae337d552a/restore-copy-supervisor-result.json`,
SHA-256 7d330cb959698c125ab08778daa7694455313b18b3392bbb70aff074a67e6eb7, bindet zusätzlich Wrapper
und beide Gegenbelege. Weiterhin `executed=false`, kein E:-/NAS-Zugriff in dieser Vorschau, kein
Großkopier- oder Programmstartnachweis. Großkopie nach Abschnitt 6 J weiterhin gesondert freizugeben.
Aktuelle erneute Root-Schlussbindung `63bcd06c-2063-4adb-9bb4-cba86ed731ed/website-goldcrest-final-binding.json`,
SHA-256 57f215a107ad8d32b18375631933236fbdd111e10cc93671b5e1326d1b7c8921: alle 134 Produktquellen
weiterhin gleich zum bestandenen 1.881er-Gate; neue Vorschau, aktueller Supervisor und Eltern-/
Ressourcenbelege bytegebunden, bezeichnete Sitzungen geschlossen/0 Operationen/0 Helfer.
Unabhängige abschließende enge Leseprüfung bestätigt alle drei konkreten Punkte als geschlossen:
Elternverlust, isolierter Pythonstart und benötigte Öffnungszahl. Kein technischer Blocker aus dieser
Review für die konkrete Kopierfreigabe; menschliche Großkopierfreigabe und tatsächliche Ausführung
bleiben davon getrennt. Keine neue produktive Prüfung oder Dateiänderung durch den Reviewer.

### 10.40 Goldhähnchen-Seiten öffentlich, aber im Explorer als fehlend – 19. Oktober

Felix meldet zusätzlich Sommer- und Wintergoldhähnchen nach Anlage im Explorer und auf der öffentlichen
Website trotz ausdrücklicher Websiteprüfung als unveröffentlicht. Vor Korrektur frisch lesend reproduziert:
beide Zielseiten HTTP 200, Titel und kanonische Adresse passen exakt zu `regulusignicapilla` beziehungsweise
`regulusregulus`. Nackte Sitemap dagegen weiterhin SHA-256
a312dfbf04cf79c871ab10797b87e7c8d13d6c41c19d04d8c76961c04654768a, exakt der alte Stand vom ersten
Verknüpfungsnachweis: 135 Seiten, keine der beiden Arten. Auch no-cache-Header ändern ihn nicht.
Nur eigene Erneuerungskennung an derselben gebundenen Sitemapadresse liefert den frischen Stand:
137 Seiten mit beiden exakten Zieladressen, SHA-256
00a72f46634b566b093cca473ecd0fe74324158440392ee601b517ab12f60642.
Beleg `67c6b42a-049f-4907-b6f7-1d5d561e9dc6/website-goldcrest-read-proof.json`, SHA-256
8708b1d286f50461fc6a251a66c9e62d1f5a992233d562ba4543a0a30724f2fb.
Kein fehlender Linkeintrag und kein Artdaten-/Namensfehler; Fehler in der Aktualität der Websiteerkennung.

Enger Backendfix in `website-species-pages.mjs`: nur eigene tatsächliche Abrufe erhalten eine neue
Kennung, auch beim automatischen ersten/späteren Abruf und in gebundenen Unter-Sitemaps. Fremde
Queryparameter aus der Sitemap bleiben unzulässig. Antwortadresse muss exakt der selbst gebildeten
Anfrage entsprechen; keine neue Weiterleitungs- oder Hostfreigabe. Bestehende lokale fünf Minuten,
gemeinsame gleichzeitige Anfrage, Zeit-/Größenlimits und Erhalt letzter Links bei Ausfall bleiben bestehen.
Frontend, Art-/Medien-/Lightroomdaten und öffentliche Website werden nicht verändert.

RED am unveränderten Backend: 12 Tests, zehn bestanden/zwei erwartete Fehler; Beleg
`b224f289-6290-483d-b9fb-c7648e385ec9/website-goldcrest-tests-result.json`, SHA-256
478d7f6cc4f24cb7a57a811275b6087a69e48ec181a6952dc2c90b4472d78af8. Erster Helferauszug benutzte
den nicht passenden Reporter und hatte keine Zähler; für den Befund ist der wiederholte TAP-Beleg maßgeblich.
GREEN einschließlich bestehender HTTP-/UI-/Server-Leseprobe: **26/26**, null Fehler/Abbrüche/Skips,
`8dd8f10d-156e-4958-bb73-287838cb9851/website-goldcrest-tests-result.json`, SHA-256
24b2927d7a5d94612eda60ebb1de5a41d3081a17a43fed4d0dc8045c6b6e39d6. Erster abgeschirmter GREEN-
Versuch hatte ausschließlich EPERM beim eigenen bestehenden Verzeichnislinktest; unveränderte erlaubte
Wiederholung erfolgreich. Neues Live-Ergebnis und Gesamtgate werden nach tatsächlichem Abschluss ergänzt;
der ältere 1.878er-Stand bleibt historisch und ist kein Gate des neuen Backendfixes.

**Echter Live-Service-Nachweis nach Fix bestanden:** Erster Abruf und ausdrückliche Erneuerung liefern
je HTTP 200 mit neuer eigener Kennung und enthalten beide exakten öffentlichen Zielseiten. Zwischen-
abruf verwendet den unveränderten lokalen Cache ohne zusätzlichen Netzabruf. Unveränderte tatsächliche
Präsentationsfunktion gibt für beide Artkennungen `found` und jeweils die richtige Zieladresse aus.
Beleg `7786663b-ddbb-43fc-a085-e508dfa07219/website-goldcrest-live-service-proof.json`, SHA-256
bff16652d3331f5d7d3f2fcf2bcd79aefd9edfac2e8bfb1b182c09d770452227; Backendquell-SHA-256
95fab71e3d43608fcdeacf9c7c33b96bcf935430833faf45998bdb47d195adbb.
Der laufende Explorer zeigt beim nativen lesenden Blick noch den alten Fehlhinweis: dessen bereits
geladener Server muss regulär neu gestartet werden. Kein nur per F5 geladener alter Serverstand wird
als aktivierter Fix ausgegeben. Native Nachkontrolle nach neuem Serverstart bleibt bis dahin offen.

**Native Nachkontrolle nach Felix' ausdrücklicher Neustartfreigabe und Ende der Pause bestanden:**
Bei Wiederaufnahme ist der Explorer bereits geschlossen; daher keine erneute Schließung oder
Warnungsbestätigung erforderlich. Regulärer vorhandener Desktop-Einstieg startet den neuen Server.
Erster eigener Startprozess mit verborgenem Startfenster ist noch nicht nativ sichtbar; regulärer
Zweitstart mit normaler Fensterdarstellung aktiviert über den bestehenden Einzelinstanzweg genau
diesen Prozess. Kein gewaltsames Beenden, keine neue Programm-/Plug-in-Registrierung.

Tatsächlich in der Windows-Oberfläche nach `Goldhähnchen` gefiltert und beide Arten einzeln ausgewählt:
jeweils `Auf FN-Website öffnen` anstelle des falschen Fehlhinweises. Wintergoldhähnchen-Beleg
`959ffbe0-aca1-4317-98bf-af69ad21057f/native-audit-proof.json`, SHA-256
2a834e0be9f3d42a99ad5b663da7f903effd245b68adefbcfa2f7b4a38f8596c. Sommergoldhähnchen und erneut
tatsächlich gedrücktes `Website prüfen` bis zum wieder aktiven Knopf mit erhaltenem korrektem Link:
`711b2c06-fbe5-4e3a-ace2-b7879c213427/native-audit-proof.json`, SHA-256
50c1493a35a29471619c9f3a570d84b4649703cc830f4c0b1354191a25e33ae5. AX-Textauslesung eingeschränkt;
die gebundenen nativen Bildschirmbilder sind der maßgebliche Sichtnachweis, kein erfundener vollständiger
AX-Baum. Beide Links wirklich angeklickt; Browser-API zeigt danach jeweils die exakte öffentliche URL
und den passenden Titel für `Regulus regulus` beziehungsweise `Regulus ignicapilla`.

Zusätzliche Rootbindung beider Bilder/Backendquelle/Browser-Ziele und lesender API-Gegenprobe des
tatsächlich laufenden Servers: `149a763d-27af-4a10-a2d1-b12ec0a5a338/website-goldcrest-native-close-proof.json`,
SHA-256 2104903d9ce29f4748e5334deda8370725a07097fa118220cc2a4a26b7bc4005, bestanden. Nur der bereits
als historische Testart dokumentierte Projekteintrag `pantheraleo`/Löwe bleibt ohne öffentliche Seite;
keine automatische Löschung oder neue Artannahme daraus. Kleine Art-/Ergebnis-/Reportdateien unmittelbar
vor/nach dieser reinen API-Gegenprobe unverändert. Explorer mit aktivem Fix geöffnet und benutzbar.

**Erster neuer Vollgateversuch ohne Gesamterfolg:** Sitzung `2fa25f7a-3fc8-4654-84ed-0491c786d82c`,
Exit 1, alle 134 gebundenen Quellen unverändert, Log-SHA-256
e842d2ee0b9ddf096e8a91c6bf32d6a31715c1d054ff46c5be6cf2336cc87bee. Ein bereits vorhandener
Taxonomie-Kandidatenfall scheitert ausschließlich im `after`-Aufräumen seines eigenen Testverzeichnisses
mit Windows-`ENOTEMPTY` unter `master/build-jobs`; kein fachlicher Websitefehler und kein grünes Gate
daraus. Genau derselbe unveränderte Fall danach dreimal getrennt bestanden, Beleg
`bf7fc183-6ca5-46be-821a-086324361eec/taxonomy-cleanup-followup-proof.json`, SHA-256
0f7e4539efad11d3401f7d35c731d8f5618b341daf6e32ae1acc11a86113e342. Keine pauschale Testlockerung,
manuelle Restlöschung oder Quellenkorrektur dafür. Eine begründete unveränderte Gesamtwiederholung
`06f50512-2932-414b-a084-8336e9c05eb2` läuft; Ergebnis erst nach tatsächlichem Ende übernehmen.

**Unveränderte Gesamtwiederholung abgeschlossen:** Am 19. Oktober 19:10:51–19:21:03 MESZ vollständiges
`quality:ci` mit **50 Testgruppen / 1.881 bestandenen Tests**, null Fehler/Abbrüche/Skips, Gesamt-Exit 0.
Ergebnis `06f50512-2932-414b-a084-8336e9c05eb2/quality-result.json`, Log-SHA-256
40158bbb66175c3b492b510fba0f37dc7f9f83643cf54ba5768d174a0e353410. Sämtliche 134 gebundenen Quellen
während des Laufs und bei erneuter Root-Schlussprüfung identisch. Keine Quell-/Testlockerung zwischen
fehlgeschlagenem Erstlauf, gezielter Nachprobe und erfolgreicher Wiederholung. Lokale Syntax-/Stil-/
Doku-/Schema-, Fach-, Medien-, Struktur-, Status- und Offline-Websiteprüfung enthalten; keine neue
Veröffentlichung, Linux-CI-/Pages- oder vollständige Live-Websiteabnahme daraus.

Root-Schlussbindung `55464f03-2fd3-486c-846f-20177e86ae53/website-goldcrest-final-binding.json`, SHA-256
96b5cee201216f7da3d12ee2bc42116b9d5eade1046a24151982c50fd6ea4bb6, bestanden: Gatezähler/Loghash,
134 aktuelle Quellen, beide echten nativen Verweise/Browserziele, reiner Kopier-Vorschaustand sowie
geschlossene gebundene Testsitzungen mit null Operationen/Helfern. Im Strukturvertrag zusätzlich
den überholten .33-Eintrag auf den bereits belegten Plug-in-Quellstand .34 berichtigt; keine neue
Plug-in-Dateiänderung. A-48 abgeschlossen. Restliche eng benannte UI-Reichweiten unter 10.38 und die
vereinbarte weitere Folge Sicherung/Restore → Website/GitHub → Gesamtabschluss bleiben bestehen.

### 10.41 Freigegebene isolierte Großkopie bei weiter nutzbarem Produktivbetrieb – 19. Oktober

Felix gibt die konkret vorbereitete Kopie der NAS-Sicherung vom 7. Oktober nach
`E:\Arten-Explorer-Restore-2026-10-07` einschließlich vollständiger Schreib-/Rückleseprüfung frei.
Zusätzliche ausdrückliche Bedingung: Die aktuelle Version muss über den Desktop weiter benutzbar
bleiben; Lightroom und Arten-Explorer dürfen durch den Test nicht umgestellt oder geschlossen werden.
Die Freigabe umfasst keinen Programmstart aus dem Restore, keine Änderung an Katalog/Plug-in,
Desktop-Verknüpfung, produktivem Datenpfad oder Aktivstand. Laufwerks-/NAS-Last durch die Kopie ist
benannt. Nur der bytegebundene Kopierweg aus 10.39 wird verwendet, keine parallele Großprüfung.
Erfolg erst nach tatsächlichem Prozessende, vollständigen Nachweisen und eigener Abschlussquittung.

Tatsächlicher Start am 19. Oktober um 19:40 MESZ: eigene verwaltete Sitzung
`1a4870af-96c7-46c7-af10-c9bea44adb55`, Supervisor PID 13564, gebundener eigener Python-Kopierer
PID 37092, genau ein Kopierlauf. Ziel wird neu angelegt; keine Programm-/Katalogbedienung dafür.
Vorherbeleg `953b13e4-ffb8-4e9d-922c-a63a978a58d6/restore-operating-boundary.json`, SHA-256
7c984cd963bda5e9c1c42e15b7a2148877e0309de634c7ce4c869c5a79974fdc. Erste kleine Gegenprüfung während
des laufenden Kopierens `7ccc0fa0-a39a-46bd-9aa7-cb2acfa2144d/restore-operating-boundary.json`, SHA-256
670cb692cb4e3465d36c2a12e30c8357da67df5fdd4492935b571366b614349b: Desktop-Verknüpfung,
produktive Speicherkonfiguration, Desktop-Einstieg und Plug-in-Versionsdatei bytegleich; Datenpfad
weiterhin `D:\Arten-Explorer\Daten`. Dies ist ein enger Dateinachweis und keine neue native
Funktionsabnahme beider vom Nutzer weiter verwendbarer Programme. Inhaltskopie/Rücklesung noch laufend.

**Tatsächlicher erfolgreicher Abschluss:** 19. Oktober, 19:40:01–19:49:47 MESZ, rund neun Minuten
45 Sekunden. Supervisor und Python regulär Exit 0; beide vollständigen Phasen jeweils **3.460 Dateien /
100.066.984.056 Bytes einschließlich Manifest**. Jede Datei beim Schreiben und durch unabhängiges
erneutes Öffnen vollständig per SHA-256 gegen das gebundene Manifest geprüft; null Abweichungen,
keine unvollständige Phase. Quittung `1a4870af-96c7-46c7-af10-c9bea44adb55/copy-content-verification-receipt.json`,
SHA-256 726b3741d4a867f89590e7d402c0d124dfb40a6c354ba41064935ea2ff7f1266; Inhaltsumfang ohne Manifest
3.459 Dateien / 100.066.048.623 Bytes, Archivkennung `9f50eb9e-be21-454d-b29f-b0bd18cdcff8`.
Supervisorergebnis SHA-256 33e5e114cff35870530c87642fd8f10fda0139a9eeeb17a1b7a36683b2c14860,
Journal SHA-256 c97fc9555ebb70672d7379f0af6d388a9433108d1fb40c54562758544fd314d4.
Eigene Kopiersitzung geschlossen, null Operationen, keine registrierten Helfer mehr.

Root prüft Abschlussquittung, vollständige eindeutige Schreib-/Rücklesemengen nochmals gegen alle
gebundenen Manifestzeilen; dafür nur kleine Nachweisdateien gelesen, **kein wiederholter 100-GB-Scan**.
Schlussbeleg `f13fa16b-f926-4a80-af1e-b6ec86cebb81/restore-copy-final-proof.json`, SHA-256
55daff3b803fe73739e7bfbbb6040f589de0a73984f1b2f187e5d9d639123b82, bestanden. Alle 134 Produktquellen
weiterhin gleich zum bestandenen 1.881er-Gate. Abschließender separater Betriebsgrenzenbeleg
`1083b467-2993-41fc-9847-c452d05d6707/restore-operating-boundary.json`, SHA-256
7691dbbda2702b1c584d976b4aae30a7a11a8f6efee98f67c5afd6dfd1ac2544: ursprüngliche Desktop-Verknüpfung,
Speicherkonfiguration, Desktop-Einstieg und Plug-in-Versionsdatei bytegleich, produktiver Datenpfad
unverändert. Keine Lightroom-/Explorer-Bedienung, Umstellung, Katalogänderung oder Programmbeendigung
für diese Kopie. Nutzerarbeit an seinen Daten war nicht gesperrt.

**Ergebnisgrenze:** Das vollständige Archiv ist jetzt tatsächlich isoliert und inhaltsidentisch
wiederhergestellt. Ein Programmstart aus diesem echten Bestand, tatsächliche Pfad-/Paarauflösung und
Bedien-/Medienabnahme sind damit noch nicht nachgewiesen. Der laufende Produktivbetrieb bleibt
unberührt; Testkopie und Belege bleiben erhalten. Keine Löschung, Veröffentlichung oder Rückübernahme.

### 10.42 Getrennter Programmstart aus echter Kopie vorbereitet – 19. Oktober

Die bisherige konkrete Freigabe umfasst Kopie und Inhaltsprüfung, noch keinen Programmstart.
Felix' Bedingung bleibt maßgeblich: aktuelle Desktopinstallation und Lightroom parallel benutzbar,
keine Umstellung oder Beendigung für die Prüfung. Der normale historische Restorestarter wird nicht
verwendet, da er Installations-/Desktopwirkungen haben kann. Stattdessen vorhandene geprüfte
Server-/Datei-/SQLite-/Netz-/Dienstgrenzen und eigenen nativen Viewer ausdrücklich verbunden.

Inaktives Paket `906d13bb-bfbe-44a3-b6da-f0bdf67edb70/restore-package.json`, SHA-256
7d6c0cfc61a2d033f667705228fec901fdae475f7afc3b490018ef065596ea7e. Supervisor SHA-256
6a8bae1b4bc45b1e6368a79e02de813be07ffbe4286bf6e4b3db1731e4f063cb; Viewer SHA-256
b86e13e0c7142c46139fa8d9d8b5cd14d85843bc57e92c1e17fdd4f1e8022177. Standard bleibt reine
Vorschau ohne E:-/NAS-Zugriff. Erst ausdrücklich angeforderter Startzweig mit genauem technischen
Planwert und gesonderter Freigabe bindet die echte abgeschlossene Quittung, das Journal und Manifest.
Danach eigener verwalteter Programm-temp-Ordner innerhalb der exakten E:-Kopie, rund **374 MB**
eigene gebundene Runtime, eigenes Profil und neue Loopback-Portnummer. Keine Desktopverknüpfung,
Plug-in-Registrierung oder Verwendung des normalen Desktopprofils. Serverseitige Unterprozesse,
Anbieter-/NAS-/Aufbau-/Veröffentlichungswege und automatische Wiederaufnahme bleiben gesperrt.
Zwei genaue Git-/Pipeline-Leseantworten bleiben ausdrücklich künstliche Testzustände; Browsernetz-
schutz ist ein eigener Sessionfilter, kein vollständiger Betriebssystem-Netzmitschnitt.

Acht kleine Plan-/Verweigerungsgegenproben bestanden; Ergebnis SHA-256
4f8d8d334d1b893a45b8c9a5dcba3f0ee1de4e4a37078cd02b78cebb4cb8a6e1. Root liest alle gebundenen
Helfer, überprüft die Quittungsbindung und führt nur die reine Vorschau aus. Korrigierte Anschlüsse:
richtige Supervisor-PID im Viewer, Prozessfreiheit des einzigartigen Runtimepfads auch vor einer
Viewer-Bereitschaftsmeldung prüfen; keine geschlossene Sitzung bei noch laufender eigener Runtime.
Rootbeleg `d02da340-908d-4fb7-a330-ce91da7dc024/restore-start-root-review.json`, SHA-256
50d28ffbd3b4a38f4f8daa74231605ad1922652782518c820b7c5e4e4f15d075, bestanden. Kein neuer nativer
Start-/Abbruchnachweis aus diesen reinen Vorschau-/Leseprüfungen.

Nach abgeschlossenem Kopieren begrenzte echte E:-Lesung: acht feste JSON-Dateien mit zusammen
1.021.722 Bytes; Speicherresolver `ready`, historische Taxonomie-/Suchpfade exakt auf die E:-Kopie
aufgelöst. Beleg `202d0711-ebfb-4e14-921e-f50565194180/restore-small-config-precheck.json`, SHA-256
cd99f47343d59377b87d0fdf5aa3e64d4c426bdf75741c781658f3408f83b1ea. Aktive/vorherige Paarzeiger und
Manifeste gelesen, keine SQLite-/Medien-Inhaltsprüfung, kein erneuter Großscan. Sämtliche genannten
Vorbereitungssitzungen geschlossen/0 Operationen/0 Helfer. Keine Runtime kopiert und kein Server,
Fenster oder historisches Desktopprogramm gestartet. Echte Oberfläche, Paar- und Medienfunktion
bleiben der nächste gesondert freizugebende Prüfschritt.

Felix gibt anschließend den konkret beschriebenen getrennten Programmtest ausdrücklich frei:
eigene Testinstanz mit eigenem Profil und rund 374 MB Testlaufzeit innerhalb der E:-Kopie,
Arten-/Taxonomie-/Medienanzeige, Nachladen und Schließen ausschließlich dieser Instanz.
Aktuelle Desktopinstallation und Lightroom bleiben parallel benutzbar; kein Katalogwechsel,
keine Desktopverknüpfung oder Produktivübernahme. Bei gleichzeitiger Nutzereingabe keine
konkurrierende Bedienung des Testfensters. Start-/Funktionsresultat erst nach tatsächlicher Ausführung.

### 10.43 Echter getrennter Programmtest und Paarlesung – 20. Oktober

Die ausdrücklich freigegebene Archivkopie wird ausschließlich über das unveränderte Startpaket aus
10.42 geprüft. Bereits am 19. Oktober lief ein eigener Server-/Viewerstart mit regulärem Ende; die
native Nachweissicherung war dabei unvollständig. Deshalb am 20. Oktober eine begrenzte zweite
Oberflächenprobe aus derselben bereits vollständig geprüften Kopie, **keine erneute Großkopie**.
Aktuelle Produktivinstallation, Katalog und Plug-in bleiben parallel benutzbar. Keine neue Freigabe
aus Vorbereitungstexten abgeleitet; Felix' konkrete Programmtestfreigabe ist maßgeblich.

Tatsächlicher Lauf 20. Oktober, 15:14:50–15:19:03 MESZ, eigener E:-Programm-temp-Bestand
`7b341aac-1ff4-47aa-94f2-b52f54429906`, Origin `http://127.0.0.1:62653`, eigener Profil-/Runtimepfad.
Ergebnis `2c8dfa1e-dea7-41fa-b00f-6b0084728c53/restore-start-result.json`: historischer Server und eigener
Viewer regulär Exit 0. Kein Zeitablaufabschluss, kein gewaltsam beendeter Prozess, anschließend keine
Prozesse dieses eindeutigen Runtimepfads. Die vier gesperrten automatischen Dienste bleiben gesperrt;
eigener Sessionfilter blockiert die ausdrücklich ausgelöste fremde Testanfrage. Alle 235 gebundenen
Archivquellen und sechs kleinen Eingangsdateien am Laufende unverändert. Git-/Pipelineantworten
bleiben ausdrücklich künstlich; dies bestätigt keine historische Git-/Pipelinefunktion.

**Tatsächlich nativ beobachtet und dauerhaft gesichert:** historische Artenliste lädt, Alpenstrandläufer
und Amsel auswählbar; passende Karten sichtbar. Amsel-Artporträt sichtbar; Tondatei wird mit 44 Sekunden
Dauer geladen und ihr Wiedergabezähler schreitet bis 0:11 bei aktiver Pause-Schaltfläche fort, anschließend
gezielt pausiert. Nach vollständigem Neuladen wieder Artenliste und Amsel mit Karte, manuellen Daten
und Taxonomie geladen. Nur danach das eigene Testfenster gezielt mit Alt+F4 geschlossen. Frische
Fensterliste enthält weiterhin den D:-Desktop-Explorer und Lightroom, nicht mehr den E:-Viewer.
Keine Bedienung/Schließung dieser Produktivfenster. Sechs AX-/Bildbelegpaare plus Abschlussfensterliste:
`b4179392-d719-41aa-8d91-e451cfc42291/native-restore-evidence-result.json`, SHA-256
c17403756cee6aa44e2ef3dd0f1850df83f7c86f5f241bc05cec9d48512012f7.
Der angezeigte historische Artenstand ist ausdrücklich kein neuer aktueller Projektzähler.

**Unabhängige echte Datenbanklesung:** sechs SQLite-Dateien aus derselben Kopie mit
`mode=ro&immutable=1`, zusätzlichem `query_only`, Schreibbefehlsperre und kleinem Laufzeitbudget geöffnet.
40 gezielte Metadatenvergleiche bestanden, null Fehler. Aktive CoL-Ausgabe
`col-xr-2026-09-25-316441` und vorherige `col-xr-2026-08-26-316165` passen zu den tatsächlichen
`source_release`-Feldern und Providerbindungen. Aktiv `master-20261003055911210` mit
`lightroom-fa739bd28ec1e82a0283`, vorherig `master-20261001145513036` mit
`lightroom-63c431a5fa43190a4c52`: Manifest-/Zeiger-/Paketmetadaten und Master-Quellprüfsummen stimmen
jeweils überein. Kein Vollscan, `integrity_check` oder erneutes Hashen großer Datenbanken; vollständige
Inhaltsidentität bleibt durch die Kopierquittung aus 10.41 belegt. Vorher/nachher keine SQLite-Journale,
Größe/Zeit-/Dateiidentität unverändert. Beleg
`ef3f9731-82cc-431b-a2d9-44c350193ee7/restore-pair-readonly.json`, SHA-256
ea0d24ffb42c4255f74910077389ebfc21b3f841cf97799e532abad4d747d529.
Die Masterversion ist hier extern manifestiert; nicht als zusätzlich vorhandenes Masterdatenbankfeld
ausgegeben. Eigene Namen/Entscheidungen sind nicht Teil dieser Metadatenstichprobe.

**Gespeicherte eigene Entscheidung zusätzlich adressiert:** Genau `Perdix perdix`, stabile ID
`mtx_dabeb92630aba9d1cd0fba3d00c63513`: eigener Name **Rebhuhn**, zuvor **Feldhuhn**, gespeichert am
20. September. Kleine Archivquelle und Korrekturrelease stimmen überein; die tatsächliche aktive
Masterassertion ist manuell, ausgewählt und angenommen. Das aktive Lightroom-Paket führt denselben
gewählten Namen und die deutsche Suchquelle `manual`. Der unveränderte archivierte
`LightroomSearchStore.prototype.taxon`-Leser liefert auf exakt diesen tatsächlich unveränderlich
gelesenen ID-Zeilen `Rebhuhn` mit Quelle `Eigene Korrektur`. 15/15 gezielte Vergleiche bestanden.
Keine reguläre Storeinitialisierung mit globalen Tabellenzählungen: Der Leser erhält einen ausdrücklich
benannten Speicheradapter. Dies ist eine tatsächliche automatisierte Leserprobe, keine native
Namenswahl-/Änderungsabnahme. Kleine Quellen gegen das Sicherungsmanifest gebunden, beide verwendeten
Datenbanken und Journalzustände unverändert. Das alte separate Korrekturrelease hat noch sein
September-Basispaar; im geprüften Oktoberpaar ist die Entscheidung bereits integriert. Beleg
`07b9d0db-fe9d-4fb0-a9cf-acf385d0a320/restore-own-name-readonly.json`, SHA-256
cbc31c6a200f11a9ef613efb8b988701579acecf4f0a3576e7a278030c65d3ad.

Root bindet Serverresultat, sämtliche sechs Bild-/AX-Belege, tatsächliche native Schließung,
Paarprüfergebnis, adressierte eigene Namensentscheidung, unveränderte Starterpaketbytes und ursprüngliche
Desktop-/Speicher-/Plug-in-Einstiege gemeinsam. Abschließender ergänzter Beleg
`121f461f-3fc5-42a1-aaac-d57e7e3b57ca/restore-native-final-binding.json`, SHA-256
c83a5c44a5eec91cbb74bab2f0dac21232864a5871f55850cf75cd1c5dc48484, bestanden. Alle 134 Produktquellen
weiterhin bytegleich zum bestandenen 1.881er-Gate; gebundene D:- und E:-Sitzungen geschlossen,
null Operationen/Helfer. Keine Produktivübernahme, neue Sicherung, Löschung, Katalogänderung,
Veröffentlichung oder Commit/Push. Testkopie und Belege bleiben erhalten.

**Zusätzliche frische Website-Gegenprobe zur Nutzerfrage:** allgemeiner Cachefix weiterhin unverändert
SHA-256 95fab71e3d43608fcdeacf9c7c33b96bcf935430833faf45998bdb47d195adbb. Zwei echte neue Abrufe der
öffentlichen Sitemap mit unterschiedlichen eigenen Erneuerungskennungen liefern HTTP 200/Age 0 und
beide richtigen Goldhähnchen-Verweise; lokale Zwischenabfrage erfordert keinen weiteren Netzabruf.
Beleg `c685d22a-ab74-400f-8d01-1cc305965484/website-goldcrest-live-service-proof.json`, SHA-256
d34fc9cd57090fbb218d387607aa4064a26809cf9295afeea9c2b3dfe1c3c449. Keine erneute produktive Aktivierung
nötig; jene wurde unter 10.40 bereits nativ belegt. Mechanismus gilt allgemein für neu veröffentlichte
Arten mit exakt gleichem Explorer-/Website-Slug in der öffentlichen Squarespace-Seitenliste.
Start-/Fünfminutenprüfung und manueller Sofortabruf bleiben; echte nicht veröffentlichte oder nicht in
der öffentlichen Liste geführte Seiten werden dadurch nicht erfunden.

**Reichweite:** tatsächlicher isolierter Programmstart einschließlich Anzeige/Nachladen/Schließen,
Pfadwechsel, Stichprobenmedien und reale Paarmetadaten jetzt belegt. Kein historischer Desktopstarter,
keine produktive Rückübernahme oder erneute Lightroom-Betriebsabnahme, keine unabhängige Hörqualitäts-
oder vollständige Medienprüfung sämtlicher Arten und kein Betriebssystem-Netzmitschnitt. Die gezielte
Inhaltsbindung einer gespeicherten eigenen Namensentscheidung ist jetzt zusätzlich belegt. Nächster
vereinbarter Bereich Website/GitHub. Frühere eng benannte UI-Reichweitengrenzen aus 10.38 bleiben sichtbar;
bereits später belegte Explorer-/Lightroom-Abschlüsse nicht erneut pauschal als offen führen.

### 10.44 Website-Alttextfortsetzung und frische GitHub-Lesegrenze – 20. Oktober

Nach dem echten Restoreabschluss die bestehende Websitevorarbeit fortgesetzt, keine erneute
Bildmotiv-Erfindung oder CMS-Übernahme. Öffentliche Papageientaucher- und Rebhuhnseiten tatsächlich
im Browser geöffnet: Galerie zeigt weiterhin Dateinamen als Bild-/Linkbezeichnungen. Zusätzlich genau
zwei begrenzte öffentliche HTML-GETs mit HTTP 200, **alle 24 plus acht Bildidentitäten und bisherigen
Altwerte passen exakt zu den 32 bereits visuell geprüften Entwürfen unter 10.28**. Keine Bildpayloads
heruntergeladen. Kleine neue Bindung mit Roh-HTML, eindeutigen CDN-Identitäten, Vorherwerten und
unveränderten Entwürfen: `e2c5843d-27f3-474c-b9af-3cb77cbc0eb6/gallery-alt-current-binding.json`, SHA-256
47d8a5b79fa2334fbffc2c1a7ae9b51fb7f1c7431d521a34415ad26cfd378574. Die frische Roh-HTML-Bindung ersetzt
keine CMS-Feldprüfung oder gerenderte Screenreaderabnahme.

**Konkrete weitere Grenze:** Über den sichtbaren offiziellen Squarespace-Anmeldelink wird die echte
Anmeldeseite erreicht; im verfügbaren Browser ist keine verwendbare Kontositzung vorhanden. Kein
Passwort aus Dateien gelesen oder eingegeben, keine fremde Sitzung angenommen. Anmeldeseite für Felix
bereitgestellt und Selbstanmeldung angefragt. Tatsächliches Galerie-Zielfeld und dessen gespeicherter
Vorherwert bleiben bis dahin offen. Danach zunächst nur lesen und eine feldgenaue Übernahmevorschau
herstellen; die aktuelle Auditfreigabe allein ist keine CMS-Speicher-/Veröffentlichungsfreigabe. Noch
keine Texte gespeichert, keine Captions verändert und keine neue Live-Nachherabnahme behauptet.

**Frische öffentliche GitHub-Metadaten:** `main` und lokaler HEAD stimmen mit
`8116806ea007b5ca10a83e72632cba7aa62ee00d` überein. Dazugehöriger
[Pages-Lauf 39275050310](https://github.com/felixkfm90/iucn-species-data/actions/runs/39275050310)
vom 19. Oktober ist abgeschlossen/erfolgreich: tatsächliche drei Jobs Qualitätsprüfung, Artefaktaufbau
und Deployment samt Schritten erfolgreich. Artefaktmetadaten `github-pages`, ID 12197791155,
116.717.972 Bytes, Digest `sha256:9c94082bc669eed26d1de83bdd00d4fe3bf313f7ad071321939c2fb32c4c73af`;
zum Abrufzeitpunkt nicht abgelaufen. Kein erneuter Binärdownload oder Inhaltsabgleich dieses Artefakts.
Das belegt die vorhandene Veröffentlichung dieses HEADs, **nicht** die unveröffentlichten lokalen
Auditkorrekturen. Branchmetadaten weiterhin `protected=false`, öffentliche Rulesetliste leer.

Der vorhandene GitHub-Connector bietet keine Administrationsrechte für die offenen Einstellungen.
Deshalb genau ein frischer lesender Versuch über die vorhandene CLI: `GET branches/main/protection`
liefert HTTP 401/`Requires authentication`, Exit 1 nach 296 ms. Danach keine weiteren Actions-/Secrets-
Anfragen, kein Login/Authrefresh oder Rechtetausch. Kein deaktivierter Schutz aus diesem 401 abgeleitet.
Direktbeleg `eed94e6f-2c27-4bb9-951b-fbc2264685bc/github-admin-readonly.json`, SHA-256
b4d74acf208e3e285da1dbc2a03772ac8f718b993b6adf4165172b1344f9374e. Root bindet ihn mit den frischen
Connector-GETs und der lokalen HEAD-Prüfung in
`d66368b8-f0f3-4ea3-9f64-a725fbe89964/github-public-and-access-check.json`, SHA-256
a640d2f0e826e3c57c9b52c675a201fb39aa3e6704b1b1fe7c4494e1584f27c3.
Keine Zugangsdaten/Secretwerte gespeichert oder ausgegeben, kein externer Zustand geändert.

**Fortsetzung:** CMS-Feldbindung der fertigen Alttexte nach nutzerseitiger Anmeldung; noch offene
responsive/zunächst lesende Live-Funktionsnachweise und zugängliche Verwaltungsnachweise fortführen.
Konkrete spätere Inhalts-/Commit-/Push-/Deploymentübernahme gesondert an den dann prüfbaren Stand
binden. Kein Gesamtaudit-Go aus dem bestandenen Restore oder einem älteren veröffentlichten Commit.

### 10.45 Angemeldete CMS-Feldbindung und Beschriftungswirkung – 20. Oktober

Felix meldet sich selbst an und bestätigt `angemeldet`. Tatsächlich angemeldete Verwaltung der
passenden FN-Website im Browser erreicht; danach ausschließlich lesender Feldabgleich. Keine
Zugangsdaten ausgelesen, keine neuen Rechte, Schnittstellen oder Anmeldungen eingerichtet.
Auf Felix' Nachfrage erläutert: Alternativtexte beschreiben jeweils das sichtbare Foto, insbesondere
für Screenreader; die vorbereiteten 24 Papageientaucher- und acht Rebhuhntexte ersetzen die bisherigen
Dateinamenwerte. Keine neue pauschale automatische Motiv-/Orts-/Geschlechtsbestimmung.

Beide gespeicherten Artseiten regulär im Seitenbaum geöffnet und jeweils die Galerie eingesehen.
**Alle 32 tatsächlichen `Beschreibung`-Textfelder leer**, jede Thumbnailauswahl mit der tatsächlich
sichtbaren passenden Großvorschau und ihrer CDN-Bildidentität gebunden. Öffentliche Bildidentitäten
und ursprüngliche Altwerte stimmen mit dem frischen Beleg aus 10.44 und den schon visuell geprüften
Entwürfen aus 10.28 überein. Interne CMS-Bildkennungen unterscheiden sich von öffentlichen Lightbox-
Kennungen; deshalb genaue Zuordnung über die identische CDN-Bildadresse, nicht über Position allein.
Einige sofortige Vorschaulesungen treffen noch den Bildwechsel. Diese nicht als vollständige Feld-
bindung akzeptiert; erst bei bestätigter passender Vorschau fortgesetzt. Kein daraus abgeleiteter
Produktfehler, keine Eingabe oder Speicherung für diese Gegenprüfung.

**Darstellungswirkung jetzt konkret:** Beide tatsächlichen Galerieeinstellungen zeigen
`Beschriftungen` eingeschaltet, ebenso `Lightbox`. Rebhuhn-Abschnitt `6aa956ee14225a23107c301a`,
Papageientaucher-Abschnitt `693d2f081bb5f700f12b13f5`. Die aktuelle offizielle
[Squarespace-Feldzuordnung](https://support.squarespace.com/hc/en-us/articles/206542357-Add-alt-text-to-images-for-accessibility-and-SEO)
bestätigt für Galerieabschnitte die Bildbeschreibung als Alttextquelle. Ein zusätzliches natives
separates Alttextfeld ist im geprüften Galerieeditor nicht vorhanden. Vor einer Übernahme deshalb
auch entscheiden, ob die Beschreibungen als sichtbare Bildunterschriften erscheinen sollen. Vorschlag
für das bisherige Galeriebild ohne Zusatztexte: genau diese 32 Beschreibungen eintragen und die
Beschriftungsanzeige ausschließlich für die zwei gebundenen Galerien abschalten. Noch keine
entsprechende Inhalts-/Einstellungsfreigabe oder Wirkung nach tatsächlichem Speichern behauptet.

Technischer Dauerbeleg der aus den aktuellen CUA-Beobachtungen übertragenen Feld-/Bildbindungen,
mit gebundenen früheren Entwurfs-/HTML-Prüfsummen und allen 32 konkreten Vorher-/Vorschlagswerten:
`26a55158-faa1-4f7f-9e03-1594d4d34b71/cms-gallery-fields-binding.json`, SHA-256
0577c49bc145877de7d229e669b83f0e9bdb28bab3df814b5ed3b9c95775fc37, 32/32 Identitäten zugeordnet.
Die Übertragung wird ausdrücklich als solche ausgewiesen; kein zusätzlicher authentifizierter
API-Abruf. Bildschirmbilder befinden sich im Toolverlauf, nicht als unabhängige hashgebundene
Bilddateien in dieser Belegsitzung. Sitzung geschlossen, null Operationen/Helfer.

Beide Seiteneditoren regulär ohne Speichern verlassen; Speicherknopf blieb deaktiviert, abschließend
normale Papageientaucher-Vorschau mit null Aktualisierungen. Keine Beschreibung, Beschriftungseinstellung,
Bildreihenfolge, Verknüpfung, Datei oder Veröffentlichung verändert. Nach konkreter späterer Übernahme
bleiben tatsächlicher gespeicherter Wert und öffentliche Ausgabe, Caption-/Lightbox-/Lazy-Loading-
und Zugänglichkeitswirkung zu prüfen. Der lesende CMS-Feldabgleich selbst ist jetzt abgeschlossen.

### 10.46 Nutzerauftrag nach dem Audit: Alttextworkflow und Android-App – 20. Oktober

Felix stellt klar, dass seine eigene fachliche und redaktionelle Einschätzung von vorbereiteten
Bildbeschreibungen abweichen kann. Er beauftragt ausdrücklich, die folgenden beiden Vorhaben als
ToDos **für nach dem Audit** aufzunehmen. Dies ist eine zeitliche Einordnung zusätzlicher Arbeiten,
keine Behauptung ihrer Umsetzung oder einer vollständigen Websiteabnahme. Die übrige vereinbarte
Auditfolge bleibt bestehen. Die Aufgaben sind in der Roadmap sichtbar vorgemerkt.

**Alternativtexte – Workflow, Konzept und Umsetzung**

- Ein Konzept und anschließend einen bedienbaren Ablauf für Bildbeschreibung, menschliche Prüfung,
  Korrektur und Freigabe entwickeln. Felix muss das betreffende Bild zusammen mit dem Text beurteilen
  und eigene Formulierungen einbringen können. Wie Änderungswünsche, etwa über Anmerkungen, in den
  Ablauf gelangen, ist Teil des späteren Konzepts; keine heute schon vorhandene Funktion behauptet.
- Einmalig alle Arten und ihre relevanten Websitebilder erfassen und auf einen guten, redaktionell
  geprüften Grundstand bringen. Vollständigkeit anhand des tatsächlichen Bildbestands prüfen.
  Anschließend neue Arten sowie neue oder geänderte Bilder im normalen Pflegeablauf prüfen;
  unveränderte, freigegebene Texte nicht bei jedem Durchlauf erneut bearbeiten oder automatisch ersetzen.
- Als Abnahmeziele Bild-/Textzuordnung, nachvollziehbaren Prüf-/Freigabestatus, Erhalt menschlicher
  Korrekturen und die kontrollierte Übernahme mit Prüfung der tatsächlichen Websiteausgabe vorsehen.
  Sichtbare Bildunterschriften und für Screenreader vorgesehene Alternativtexte samt Squarespace-
  Feldkopplung im Konzept ausdrücklich berücksichtigen. Ob Beschriftungen sichtbar sein sollen, ist
  noch nicht entschieden; der Vorschlag aus 10.45 ist keine Nutzerfreigabe.
- Die 32 visuell geprüften Entwürfe und ihre lesend bestätigten CMS-Zuordnungen aus 10.28/10.44/10.45
  bleiben Vorarbeit. Keine Texte oder Galerieeinstellungen gespeichert. Der bekannte Qualitätsbefund
  bleibt offen und bewusst nachgelagert; aus diesem ToDo folgt keine jetzige CMS-Übernahme.

**Android-App für das Handy**

- Nach dem Audit Konzept und Umsetzung einer Android-App aufnehmen. Gewünschte Nutzung unterwegs,
  konkrete Funktionen, Datenzugriff und Umfang erst im zugehörigen Folgeauftrag klären.
- Als späteres Abschlusskriterium die vereinbarten Kernabläufe auf einem Android-Handy praktisch
  nachweisen und Bedienung sowie Betriebsgrenzen dokumentieren. Noch keine Technik, Synchronisation,
  Offlinefunktion, Installation oder Veröffentlichung beschlossen oder umgesetzt.

Dieses Arbeitspaket erfasst ausschließlich die Nutzerentscheidung in Auditauftrag und Roadmap.
Keine neue Termin-/Überwachungsautomatik, keine Appentwicklung und keine Websiteänderung gestartet.

### 10.47 Auditfortsetzung und späterer Artseitenworkflow – 20. Oktober

Felix fragt nach dem weiteren Auditablauf und ergänzt ausdrücklich ein drittes ToDo für nach dem
Audit: **Neue Artseiten einschließlich der vorhandenen Strukturen und Texte generieren und einpflegen –
Workflow, Konzept und Umsetzung, einschließlich Bildern und Alternativtexten.**

Für den Folgeauftrag vorhandene Seitentypen, Gliederung, Texte, Medien und Artverknüpfungen zunächst
als Ausgangspunkt erfassen. Darauf einen gemeinsamen Ablauf von der Artanlage über Inhaltsentwurf,
Bildauswahl und Alternativtexte bis zur redaktionellen Prüfung, Vorschau und kontrollierten Einpflege
entwickeln. Den Alttextworkflow aus 10.46 integrieren; Felix' Korrekturen und bereits geprüfte Inhalte
erhalten. Erzeugte Artangaben müssen fachlich belegbar sein; fehlende Informationen sichtbar offenlassen.
Keine fertigen Texte oder Bildzuordnungen allein aus Dateinamen ableiten.

Spätere Abnahmeziele: eine neue Artseite mit den vereinbarten vorhandenen Strukturen vollständig
vorbereiten, konkrete Texte/Bilder/Alternativtexte von Felix prüfen lassen, kontrolliert einpflegen
und anschließend tatsächliche öffentliche Darstellung sowie automatische Explorer-Verknüpfung prüfen.
Wiederholung darf keine doppelten Seiten oder unbemerkte Überschreibung redaktioneller Änderungen
erzeugen. Umfang einer Anpassung vorhandener Artseiten und technische CMS-Anbindung sind im Konzept
zu bestimmen. Heute keine Artseite erzeugt, geändert oder veröffentlicht.

**Aktuelle Auditfortsetzung, getrennt von diesen drei späteren Vorhaben:**

1. Die übrigen Live-Websitefunktionen systematisch nach Seitentyp und in Desktop-/schmaler Darstellung
   prüfen: Navigation, Suche/Filter, Artmodule, Karten/Portraits, Galerie/Lightbox, Audio, Links,
   Tastaturbedienung sowie Lade-/Fehlerzustände. Vorhandene Nachweise nutzen und nur fehlende oder durch
   Änderungen betroffene Fälle ergänzen. Alttextqualität bleibt als bewusst nachgelagerter Befund sichtbar;
   daraus keine vollständige Zugänglichkeitsabnahme ableiten.
2. GitHub-/Veröffentlichungsnachweise vervollständigen. Öffentlich lesbare Repository-/Workflow-/Pages-
   Ergebnisse und nicht zugängliche Verwaltungseinstellungen trennen; der aktuelle HTTP-401-Nachweis
   aus 10.44 bleibt eine Grenze. Lokale Auditkorrekturen sind noch unveröffentlicht. Konkrete spätere
   Übernahme erst am geprüften Gesamtstand freigeben lassen; neuer Linux-/Pages-Lauf und tatsächlich
   geladener Squarespace-Stand sind danach eigenständige Prüfungen.
3. Vor dem Abschluss die Gesamtmatrix mit den jüngsten Befunden abgleichen. Insbesondere verbleibende
   Explorer-/Lightroom-Grenzen zu langen Namen, Windows-Skalierung, reiner Tastaturbedienung der nativen
   Detail-Liste und Screenreader/Touch aus 10.37/10.38 prüfen oder begründet als offen ausweisen. Keine
   bestandenen FN-, Stapel-, Statistik- oder Restoreprüfungen ohne Regressionsgrund neu anstoßen.
4. Gefundene Pflichtfehler korrigieren und passend nachprüfen; nach letzten relevanten Codeänderungen
   das vollständige Qualitätsgate ausführen. Abschließend unabhängigen Review und Go/No-Go mit
   nachgewiesenen Ergebnissen, offenen Betriebs-/Zugriffsgrenzen und bewusst verschobenen Aufgaben
   ausschließlich hier festhalten. Der reale isolierte Restore aus 10.41/10.43 ist bereits belegt;
   keine weitere Großkopie allein aus dieser Statusfrage.

Diese Ergänzung dokumentiert die Fortsetzung und den neuen Folgeauftrag. Keine zusätzliche produktive
Operation, Bereinigung, Veröffentlichung oder CMS-Änderung durch die Statusfrage freigegeben oder gestartet.

### 10.48 Explorer und Lightroom vorziehen: Artänderungsschreibkern – 20. Oktober

Felix beauftragt nun ausdrücklich **zuerst Explorer und Lightroom fertigzustellen**, anschließend
Website, GitHub, Veröffentlichung und Abschluss. Dieser neuere Auftrag ersetzt die Arbeitsreihenfolge
aus 10.47. Die drei dort/unter 10.46 vorgemerkten Vorhaben bleiben nach dem Audit. Bereits bestandene
FN-/Stapel-/Statistik-/Medien-/Namens-/Restorefälle ohne Regressionsgrund nicht wiederholen.

**Frischer unabhängiger Restabgleich:** Native Split-/Merge-Fotoübernahme einschließlich genauer
Rücknahme ist weiterhin offen; eine reine Namenswahl ersetzt sie nicht. Hinzu kommen der bisher
optionale LR→Explorer-Korrekturhandoff, die praktische failed-/freie Neue-Art-Anzeige A-37 und die
ausdrücklich offenen Langnamen-/Tastatur-/DPI-Grenzen aus 10.37/10.38. Screenreader/Touch und
Mehrkatalog-/Katalogkopiensemantik nur bei tatsächlichem Nachweis abnehmen, nicht aus simulierten
Fällen oder virtuellen Kopien pauschal ableiten. Noch kein Explorer-/Lightroom-Teilabschluss.

**A-49 reproduziert:** Der Artänderungsschreibkern besitzt zwei bisher nicht durch die alten Fixtures
abgedeckte SDK-Grenzen. Neue Zielstichwörter wurden sofort innerhalb des ersten Schreibzugriffs auf
ihre interne Kennung geprüft. Nach FN-Settern wurde der Statistik-Nachzustand im selben Zugriff aus
gegebenenfalls noch alten Metadaten gelesen. Die neue Gegenprobe benutzt echte Lua-Fachmodule,
echte Statistics-/StatisticsIndex-Aggregate und künstliche SDK-Verzögerung. Der gültige Vorherlauf
`6221ec09-304e-4153-a8ff-7b188d3c58a1/identity-regression-before.json`, SHA-256
1c3e464f97dd2923698152fc44beabc8c7d25df0b0784fd572a5989ddd9872bd, besteht 14/16 mit genau diesen
beiden Fehlern. Ein vorheriger Prüferentwurf traf einen bereits existierenden Zielnamen und wird nicht
als Erstkennungsnachweis verwendet.

**Lokale Quelle .35:** Zunächst reale Keywordobjekte im bestätigten Schreibzugriff anlegen, Namen und
Kennungen erst nach Commit mit erneutem Katalog-/Foto-/Paketguard binden. Fehlende oder falsche Kennungen
stoppen vor Journal-/Fotoänderung; leere neu angelegte Stichwörter können wie bisher verbleiben.
Statistik für Apply/Undo aus vollständigem Journalziel sowie unverändertem Ort/Zeit, Datum, Datei,
UUID und Videostatus projizieren. Index und Fotos bleiben eine Transaktion; exakte Fotorücklesung
und Journalbestätigung nach dem Schreibabschluss bleiben erhalten. Keine automatische Wiederholung.

Nachher zunächst 16/16 bestanden: `8ef3de36-8958-4ed1-9cfc-39c639bfc10f/identity-regression-after.json`,
SHA-256 79db6a5098df24f9809fc0de442859d9f33784e237ad973997a68757f1e979b2.
Unabhängiger Zweitreview ohne blockierenden Codebefund; dessen zusätzliche Stale-nach-Commit- und reine
externe Favoritenabwahl-Gegenproben anschließend ergänzt. Erweitert einschließlich Statistik-, Vertrag-
und Identitäts-UI-Fällen **170/170**, null Fehler/Abbrüche/Skips:
`827b92e2-8859-4b10-89d2-979b055cdb9e/identity-regression-targeted.json`, SHA-256
718c6154aead8b06aa2d58279b479d409cd6c2774072baa2cc5b23acbfde6a7c, Quellen im Lauf unverändert.
Eine vorherige 168er-Gruppe fand ausschließlich eine noch alte zweite Versionsassertion im Vertragstest;
auf .35 synchronisiert, keine fachliche Prüfung abgeschaltet.

**Betriebs-/Abnahmegrenze:** Regulärer Hauptkatalog frisch nativ gesehen; bei späteren Eingaben war
Lightroom wieder minimiert und der Modulzustand zwischenzeitlich geändert. Vor weiterer Eingabe erneut
Fenster und Nutzung prüfen. Kein Katalogwechsel, Foto-/Keyword-Schreiben oder Plug-in-Reload in dieser
Fortsetzung ausgeführt. Eine erste Belegbrücke erhielt vor Ablauf keine Bilddaten und liefert keinen
vollständigen nativen Beleg. .35 ist bislang Quellstand, keine behauptete aktuell geladene Version.
Neues vollständiges Gate, geschützte native Artänderungsrunde und übrige Bedienfälle folgen getrennt.

**Zusätzlicher Tastaturweg in derselben .35-Serie:** Bestehende native Detail-Liste bleibt erhalten.
Der eigene Button `Taxonomiedetails lesen` öffnet ausschließlich den schon angezeigten vollständigen
Text als kleine UTF-8-sicher umbrochene Seiten mit Weiter/Zurück/Schließen. Eigenes `canReadDetails`
bindet aktuellen Treffer, Suchtext und Busy-Zustand und erlaubt höhere Ränge ohne Fotoauswahl.
`TaxonomyDetailsView.lua` besitzt keine Katalog-/Helper-/Namensschreibabhängigkeit. Neun direkte echte
Lua-Verhaltensfälle bestehen; gemeinsam mit dem angepassten vorhandenen Ansichts-/Plug-in-Vertrag
46/46 bestanden und der neue Test ist im regulären Lightroom-Testpaket eingetragen. Der Root-Codecheck
bestätigt vollständigen Text und ausschließlich Lesedialoge; native Tab-/Escape-/Glyphenbreiten- und
Skalierungsnachweise bleiben offen, insbesondere Escape auf der letzten Seite mit ausgeschlossenem
zusätzlichem Cancelknopf. Keine Screenreader-/DPI-Abnahme aus Zeichen-/Simulationsprüfungen ableiten.

**Neuer Gateversuch und sichere Wiederholung:** Der erste aktuelle vollständige Lauf
`a4d6314f-3c6b-4d16-876b-8977fd9c86f9/quality-result.json` endet am 20. Oktober nach elf Sekunden
mit Exit 1 und unveränderten 137 Quellen. Einzige Fehlerursache bis zum Abbruch: Windows-Sandbox
verweigert das Anlegen der eigenen Symlink-Testfixture in `taxonomy-prototype.test.mjs` mit EPERM;
kein Scheitern einer Produktschutzassertion. Genau die beiden Prototyptests außerhalb der Sandbox
unverändert 2/2 bestanden. Deshalb vollständige unveränderte Wiederholung außerhalb der Sandbox
gestartet: `682733bc-ec76-4f75-8355-3a77d49dd2cb/quality-result.json`. Bis zum tatsächlichen Ende kein
Grün oder vollständige Testzahl daraus; keine Verknüpfungsprüfung ausgelassen oder abgeschwächt.

**Inaktive eigene Explorer-Restumgebung:** `e11be3cf-820e-42c4-9433-45bbc7ab3dc7/`
`explorer-rest-readonly-runtime.mjs`, SHA-256
e30b4a5d876cd580225823501bd099327126652584055a741de865e42c1b1b9d; Vorbereitung SHA-256
ad39198cc69cf70613eb0c7de3a984a461b601d277783def0b86d1aa559c3b5b. 18 eigene Eingänge/722.811 Bytes,
29 kleine Schutz-/Policy-/Zeit-/Syntaxgegenproben. Start erst mit tatsächlichem neuen vollständigen
Exit-0-Gate, dessen gesamte 137er Quellhashmap exakt passt; der erste Exit-1-Lauf ist ausdrücklich nur
Freezeherkunft. Sämtliche Schreibwege auf die neue eigene Sitzung begrenzt, Netz/Unterprozesse/NAS
gesperrt. A-37-Verfügbarkeit über ausdrücklich künstliche GET-Antwort mit unverändertem echtem
Fachkern; optionale Langnamen nur Darstellungsantworten, keine gespeicherte Namensentscheidung.
Vorbereitung ist kein tatsächlicher Browsernachweis. Ältere 135er-Entwürfe bleiben inaktiv und werden
nicht als vollständige Bindung der neuen Textansicht verwendet.

**Vollständiger Prüflauf beendet und am 21. Oktober frisch gebunden:** Die unveränderte Wiederholung
`682733bc-ec76-4f75-8355-3a77d49dd2cb/quality-result.json` besteht am 20. Oktober von 18:23:14 bis
18:31:01 UTC mit **50 Testgruppen, 1.895 bestandenen Tests, null Fehlern/Abbrüchen/Skips und Exit 0**.
Resultat-SHA-256 ed7dcc6cb86bc0b7f653813cae62bee8ceeda0f1feb4a6b2581aaa29479e99d2;
Log-SHA-256 9dc8be8dcc6fae5115bad0650b89f9d908cc5a9feedaded96a9a2d6768818e71.
Alle 137 gebundenen Produktquellen sind am 21. Oktober weiterhin exakt gleich. Keine Symlinkprüfung
ausgelassen. Dies ist die automatische Gesamtprüfung, noch keine native Artänderungsabnahme.

**Native Vorbereitung und Unterbrechungsgrenze:** Am 20. Oktober Original-Plug-in im Hauptkatalog mit
geladenem Status .34 und aus aktueller Quelldatei gelesenem Anbietertext .35 unterschieden; Beleg
`09370e6e-71d5-42a9-8478-6d44db5acaba/native-observation-proof.json`, SHA-256
da80d1475ebb15be3e44bde24ae4a070f319d85ea54d7051c8708c0c06478c67. Original anschließend
vorübergehend deaktiviert. Die schon vorhandene inaktive private Registrierung unter `4630504b…`
mit gesicherten Einzeldateien auf .35 aktualisiert, kein neuer Manager-Eintrag. Ihre Sperre erlaubt
ausschließlich den eigenen Katalog `b4cbf6df…/catalog/FN-Identity-Audit/FN-Identity-Audit.lrcat`;
alle Helper-/Daten-/Temp-Pfade explizit auf diese eigene Fixture gebunden. Neuer maßgeblicher Plan
`a027488b-17ba-4e3b-9e17-820ccec8207f/identity-native-live-plan.json`, SHA-256
dfe1ced746274715e6fc064a78622c0aff4d4c9bbcf74c5b3cd8deb7ae6ab6c2. Freeze-SHA-256
8e278bd23b142224b37884fe751667af1334433199d4dd2143523aace07e1111; 118 eigene Programmquellen
und 54 tatsächlich registrierte Lua-Dateien am 21. Oktober unverändert geprüft. Ein historischer
Temp-Eigentümerprozess ist abwesend, der zweite wegen EPERM ausdrücklich unbekannt; beide Anker
unverändert mit null Operationen und ohne registrierte Helfer erhalten, nicht als bereinigt verbuchen.
Nur den eigenen Paarzeiger auf den vorbereiteten Vorherstand umgestellt, Beleg `8451887f…`, keine
Produktivübernahme und kein Aufbau. Felix gibt am 21. Oktober den Computer erneut ausdrücklich frei.
Frisch im Hauptkatalog beide FN-Einträge deaktiviert gesehen; Anlage des genauen eigenen Katalogs
über Lightroom begonnen. Fotozuweisung, Apply/Undo und Rückstellung sind erst nach tatsächlicher
Beobachtung abzunehmen.

**Explorer-Browsergrenze:** Eigene Runtime `5ae60cbf…`, Port 61321, erreichte am 20. Oktober im Browser
die echte Oberfläche. Bearbeitungsmodus und Neue Art führten im künstlichen failed-Szenario unmittelbar
zum kurzen Dialog „Neue Art derzeit gesperrt“, vor dem Artformular. Das ist eine Toolbeobachtung;
das Laufjournal enthält wegen der Unterbrechung keinen sauberen Abschluss und keine Rücklesewerte.
Am 21. Oktober kein Listener und kein gefundener zugehöriger Prozess; genaue Abbruchursache offen.
Diese Sitzung unverändert erhalten und nicht als bestandene Quellen-/Datenabschlussprüfung verbuchen.
Freier Zustand, Lesefehler und Langnamen werden in einer frischen geschützten Sitzung nachgeholt.

### 10.49 Praktische Restprüfung in eigenen Umgebungen – 21. Oktober

Felix bestätigt ausdrücklich, dass der Computer derzeit vollständig für die Arbeit verwendet werden
kann. Hauptkatalog frisch gesehen, beide FN-Einträge deaktiviert. Eigenen Katalog am exakt gesperrten
Pfad `b4cbf6df…/catalog/FN-Identity-Audit/FN-Identity-Audit.lrcat` nativ neu angelegt und genau sechs
künstliche JPEGs aus dem eigenen Fotoordner über **Hinzufügen** importiert, mit dem manuellen
Kontrollstichwort `IdentityAuditKeep`. Keine eigenen Bilder verschoben, keine Produktiv-FN-Zuweisung.
Die sechs bewusst ähnlichen Testbilder erfordern beim Import die abgeschaltete Duplikaterkennung;
diese gemeinsame Importoption nach der Prüfung wieder auf den vorher gesehenen Zustand stellen.
Ebenso das nur für den Test gesetzte Importstichwort vor der Rückgabe entfernen.

**Zwei Fehler ausschließlich in der Testvorbereitung:** Der fest gebundene private cmd.exe-Pfad
enthält Vorwärtsschrägstriche. Reiner identischer CreateProcess-Gegenvergleich scheitert damit mit
Syntaxfehler, während der kanonische Windows-Pfad Node 24 korrekt startet. Die Produktquelle besitzt
bereits den richtigen Pfad. Zusätzlich fehlt der künstlichen Referenz der eigene Versionszeiger;
Paket/Master sind lesbar, der getrennte Versionsvergleich bleibt so ausdrücklich unverifizierbar.
Private .35 nach Beobachtung wieder deaktiviert; Reparatur nur an eigenen Pfadbindungen und kleinem
synthetischem Referenzzeiger, mit neuen Bindungen/Belegen. Bis zur erfolgreichen nativen Wiederholung
keine fachliche Artänderungsabnahme daraus.

**Explorer-Bedienprobe vor Fokuskorrektur abgeschlossen:** Neue geschützte Sitzung `23b0e63d…`,
Port 62752. Künstlicher failed-Status öffnet sofort den kurzen Sperrhinweis statt des Formulars;
freier Status öffnet den echten Artassistenten und fokussiert das deutsche Namensfeld; Lesefehler
öffnet den eigenen Prüfhinweis statt des Formulars. Tatsächlicher Browser 1.133 × 637 Pixel, bei
künstlichem sehr langem Namensvorschlag kein horizontaler Seiten-/Dialogüberlauf. Vorschlag wird
sichtbar mit Auslassung dargestellt, voller Name im AX-Baum; eine vollständig visuelle Lesbarkeit
aller Zeichen oder reine Tastaturauswahl ist damit noch nicht abgenommen. Kein DPI-/Screenreadernachweis.

**A-50 reproduziert:** Nach Bestätigung des Sperrhinweises und nach Escape aus dem freien Formular
kehrt Fokus auf BODY zurück. Unabhängiges Codelesen bestätigt vorzeitiges disabled vor await und
fehlende Wiederherstellung des ursprünglichen eigenen Öffners. Der gezielte Arbeitsauftrag betrifft
ausschließlich `app-new-species-workflow.js` und dessen bestehenden Verhaltenstest; vor diesen
Quelländerungen die Browserruntime kontrolliert beendet. Ihr Abschluss bestätigt Exit 0, kein Fehler,
150 Anfragen, keine geänderte Produktquelle, 18 Eingänge/zwölf geschützte eigene Eingänge rückgelesen
und beide kleinen Basisdatenbanken unverändert. `23b0e63d…/dense-explorer-journal.json` ist der gebundene
Laufbeleg. Kein echter fehlgeschlagener Produktivauftrag simuliert oder entsperrt, keine Art angelegt.
Das grüne 1.895er-Gate gilt für den Zustand vor A-50; nach dessen Korrektur neues Gesamtgate und
frisch gebundene Browserprobe notwendig.

**A-50 lokal korrigiert und vollständig automatisch geprüft:** Fünf Produktzeilen im bestehenden
Artanlage-Workflow erhalten den eigenen Öffner über den asynchronen Vorabcheck. Wiederfokus nur bei
vorher eigenem Fokus, aktueller Sitzung, verbundenem aktivem Öffner und inzwischen BODY/HTML;
bewusst anders gesetzter Fokus wird nicht übernommen. Neun Verhaltensgegenproben ergänzen den
vorhandenen Test. Vorher 46/51, genau fünf erwartete Fokusfehler:
`ee264746-fcca-44da-ac2e-c713c16706c3/creation-focus-red-result.json`, SHA-256
20c8a5086142bbf78a0fc818bb2ba5e4c230c1eaf98a5b0fc438fad1773055ae.
Nachher 51/51: `74418ecf-8003-4776-a005-31d9e93a4aea/creation-focus-green-result.json`, SHA-256
8d862371907ab767cc059bd1855750cb0e2af286743a722bf0db398d29929830.

Das neue vollständige Gate `2e1c48e8-ed05-41b5-bf83-dd4449a05629/quality-result.json` besteht am
21. Oktober von 13:41:14 bis 13:49:19 UTC mit **50 Gruppen und 1.904 Tests**, null Fehlern,
Abbrüchen oder Skips, Exit 0 und allen 137 Quellen unverändert. Resultat-SHA-256
ae2565d76b86f53d7895a4e1d97c41f3cfa6a7c8304b4cedadec07038e8ef929;
Log-SHA-256 016af4efafdc5034dce3171b60e5b28e45326cc9ec12d26e7b856fec0af0ea36.
Ein vorausgehender Sandboxlauf blockierte lokale Git-Fixturetransporte. Die automatische Freigabeprüfung
lehnte dessen unveränderte unbeschränkte Wiederholung wegen möglichem produktivem Push ab.
Nach Quellprüfung der ausschließlich eigenen Bare-Fixture wurde der vollständige Lauf mit
prozesslokalem `GIT_ALLOW_PROTOCOL=file` ausgeführt; Netzwerk-Git ist darin ausgeschlossen.
Keine produktive Git-Übertragung, keine Schutzassertion ausgelassen. Browsernachprüfung folgt getrennt.

**Eigene Lightroom-Vorbereitung wieder funktionsfähig:** Neuer maßgeblicher Plan
`e25b5c0b-7ec3-4697-9267-ae4f50dec925/identity-native-live-plan.json`, SHA-256
26973d6c808757cf27e75cd4993fd1e13cbbbfbdfd1cef52ba6fa581751d7ab9;
Freeze-SHA-256 52e2bd654442f483ac429b8bde7061d459732f3ac7d97c3f06fd9fde4ba7b9d7.
16/16 Phasen- und 20/20 Nachprüfergegenproben, 54/54 registrierte Lua-Dateien und 118 eigene Module
gebunden. Private .35 nun tatsächlich aktiv und kleines Vorherpaar vollständig passend nativ gesehen:
`48428533-87b0-4a17-9e3b-9986c5034e52/native-observation-proof.json`, SHA-256
f3f2ca642ac2e30f0654b034002ba4b3255c09b8cfb05ccd971c67bb6c33396e.
Original bleibt während der eigenen Katalogprüfung deaktiviert. Beide Split-Ausgangsfotos sowie
Merge-Ausgang D und E jeweils erfolgreich nativ zugewiesen. Favoriten, vollständiger Statistikindex,
eigentliche Artänderungsübernahme und Rücknahme sind damit noch nicht abgenommen.

**A-51 nativ belegt:** .35 öffnet `Taxonomiedetails – Seite 1 von 2` modal hinter dem weiterhin
sichtbaren schwebenden Zuweisungsfenster. Vollständiger AX-Text ist vorhanden, aber die tatsächliche
Darstellung weitgehend verdeckt. Erste Seite mit Escape geschlossen; letzte Seite und vollständiger
Tastaturweg offen. Beleg `03f3be4b-bd5e-44ab-b644-c2d29d20148b/native-observation-proof.json`, SHA-256
17d807295145654117f9bf79680ac9f7cb549fafbba97769d436ebd0a2dd9c54;
vollständiger Screenshot SHA-256 f97d753e264e9376517bfd5e2fe73cfab568ffb17a109b4bb5d9c8846b2af158.
Darstellung vor Abnahme korrigieren; keine erfundene SDK-Elternfensteroption verwenden.

**A-50 im tatsächlichen Browser nachgeprüft:** Eigene Runtime
`197de3e3-6184-4c94-b0f9-014e31346d5c`, Port 65500, vom 21. Oktober 18:27:27 bis 18:29:58 UTC.
Bei künstlichem failed-Status und Lesefehler jeweils nach Verstanden sowie Escape; beim freien
Assistenten nach Escape, Abbrechen und Dialog schließen: in allen sieben tatsächlichen Wegen
`document.activeElement` als BUTTON mit ID `new-species-button` rein lesend bestätigt. Freier
Assistent fokussiert zuerst das deutsche Namensfeld. Keine Eingabe gespeichert oder Art erzeugt.
Runtime kontrolliert beendet, Exit 0, kein Fehler, alle 137 Quellen, 18 Eingänge, zwölf geschützten
Eingänge und beide Basis-/Fixture-Datenbankpaare unverändert; Manifest geschlossen mit null Operationen.
106 Anfragen; Nebenwirkungswächter blockierte externe Fetch-/Git-Versuche. Laufbeleg
`197de3e3…/dense-explorer-journal.json`, SHA-256
3c75e222b314dc6498a5beee817c1ca0acd0f20692b3e64a7d115866b111e2d4. A-50 damit abgeschlossen.

Ein vorheriger unveränderter Runtime-Start war innerhalb der Sandbox aus Browser und zweitem
Werkzeugprozess unerreichbar; per Controlfile regulär beendet und vollständig unverändert rückgelesen
(`16e24f30…`, SHA-256 3642eb8459fa6746bbae6fa77abab7b4e583e0cbbd77d260814fef3ade1b8062).
Außerhalb der Sandbox war derselbe Runner mit HTTP 200 erreichbar. Die zwischenzeitlich unterbrochene
Sitzung `e9a0c2b4…` besitzt weiterhin keinen sauberen Abschluss; Ursache unbekannt, unverändert erhalten.
Keine dieser Laufgrenzen als Produktfehler oder nachträglich bestätigten Erfolg umdeuten.

**A-51 in Quelle .36 korrigiert:** Der Detailbutton schließt ausschließlich eigene Fenstercontrols.
Erst nach Rückkehr des schwebenden `blockTask` startet der modale Leser; anschließend wird dieselbe
Ansicht mit derselben Propertytabelle, Suchauswahl und Namensentscheidung erneut geöffnet. Keine
erneute Paketinitialisierung. Owner-/Fenstergenerationsschutz verhindert parallele Übergänge und
verspätete Schließ-/Auswahlobserver. Schließfehler verhindern den Leser, Lesefehler kehren mit sichtbarer
Meldung zurück, Wiederöffnungsfehler lassen keine Übergangssperre bestehen. Jeder Leserdialog bietet
einen echten Cancelknopf Schließen, letzte Seite zusätzlich Fertig. Keine Katalog-/Namensschreibaktion.
Die aktuell geladene private .35-Identitätsfixture wurde dabei nicht verändert.

Identische finale 16 Leser-Verhaltenstests gegen gesicherte exakt gebundene eigene .35-Quellkopien:
4 bestanden, zwölf erwartete Fehler. `e2f87faf-c2f1-416e-b62d-acbcb6c59594/details-red-result.json`, SHA-256
70a0300a53b10c6518e78cb7cf9cffc92fa0bfa1ce2561eafaf763e85f7bca92.
Leser-/Vertrags-/Identitäts-Suiten danach **78/78**, null Fehler/Abbrüche/Skips, unabhängiger Codecheck
ohne Blocker und dieselbe gezielte Wiederholung bestanden. Green-SHA-256
af045a25c1e4c18bf4bf20784c63d798baf5bc845e72ec784f88f64f70c91a08.
Vollständiger neuer .36-Prüflauf `c7256bdc-f988-4eaa-8f6d-d6dfa7a00d62/quality-result.json` besteht
am 21. Oktober von 18:36:23 bis 18:44:34 UTC mit **50 Gruppen / 1.911 Tests**, null Fehlern,
Abbrüchen oder Skips, Exit 0 und allen 137 Quellen unverändert. Resultat-SHA-256
2e6c6d2a50ffc5bbedacf9d8260447eaa5e7028e1b84ac8f5be3351f6bfccabd;
Log-SHA-256 d340ee4ee9d35194d9c32aebb8bd4db68c4b151e61e545446ac02b4d6b159a46.
Manifest geschlossen, null Operationen, keine Helfer. Native Fensterreihenfolge,
Wiederverwendbarkeit derselben SDK-View und Tab/Escape auf allen Seiten bleiben getrennt offen.

**Eigene Identitätsrunde weiter vorbereitet:** Fünfte Zielaufnahme erfolgreich auf Ziel F zugewiesen.
Kleine synthetische Referenz/Paar nach geprüftem Sechs-Foto-/ID-/Pfadguard auf Nachfolgerstand umgestellt,
kein Katalogschreiben durch den Umschalter: `2463d580-16fa-4d9c-a0a0-bb1690f731b7/identity-phase-operation.json`,
SHA-256 5910f6e41486a556186bf18587beca6a16efc01f4559b31856ad6e46b5111d90.
Vorhandene manuelle Kontrollstichwörter erhalten. Über Lightroom allen sechs künstlichen Aufnahmen
die kontrollierte ursprüngliche Länderquelle Deutschland gesetzt und anschließend nativ als FN-Ort
ergänzt. Erste Ort/Zeit-Ergebnisanzeige meldet sechs Änderungen und sechs fehlende Aufnahmezeitquellen;
die winzigen JPEGs enthalten kein EXIF-Datum. Die im Raster angezeigte Dateizeit allein ist ausdrücklich
keine verwertbare SDK-Aufnahmezeit. Deshalb ausschließlich diese sechs Testbilder nativ auf ihr
Dateierstellungsdatum gesetzt, um eine echte Aufnahmezeitquelle für die Erhaltungsprüfung zu schaffen.
Keine Statistik-/Artänderungs-/Rücknahmeabnahme aus diesen Vorbereitungsschritten ableiten.

**Tatsächliche eigene Ausgangsprüfung vollständig vorbereitet:** Nach gesetzter ursprünglicher
Aufnahmezeit meldet der erneute Hinzufügenweg sechs Änderungen ohne fehlende Zeitquelle. Statistik
ausschließlich im eigenen Katalog neu aufgebaut: sechs taxonomierte Fotos in fünf Arten, jeweils
sechs mit Ort und Zeit, Oktober/2026. Nativer Beleg `2e99219a-a39e-4a20-a75d-10a832882ca1/`
`native-observation-proof.json`, SHA-256
57416619168dda41ef240d86691477fc5fe888c879d09521bac0a36e5bfe96b8.
Erster konsistenter Nur-Lese-Nachvergleich `1aaade91…` bestätigt tatsächliche Länder-/Zeitfelder
und vollständiges echtes Lua-Statistikaggregat. Anschließend regulär vier Artfavoriten gesetzt:
Split-1, Merge-1/D, Merge-2/E und vorhandenes Ziel/F. Alle vier nativen Erfolgsmeldungen abgelesen.
Maßgeblicher vollständiger Ausgangssnapshot für Apply/Undo:
`fe201f97-d71a-41bc-9b3d-655260019476/identity-native-postcheck.json`, SHA-256
bce7394389a05611d2c42459de6fa5390bf8a19225ee587366acb252316a7396.
Der Prüfer führt selbst keine native Übernahme aus (`nativeExecuted:false`); reale Kataloglesung,
Statistikgleichheit und nativ beobachtete Vorbereitung getrennt ausweisen. Artwechsel weiterhin offen.

### 10.50 Erste native Split-Übernahme angehalten – 21./22. Oktober

Nach vollständiger eigener Vorbereitung nur `identity-split-1` gewählt, Nachfolger B ausdrücklich
vorgemerkt und konkrete Übernahme von einem Foto ohne Favoritenabwahl bestätigt. Die native .35-Aktion
stoppt während Vorbereitung mit „Journalvorbereitung benötigt Katalogkennung und Bestätigung“.
Keine automatische Wiederholung. Nativer Fehlerbeleg
`7de4ea2d-6413-4804-b05b-a256764fa396/native-observation-proof.json`, SHA-256
a8de3baf1b27b49862d072d1d9c5bacee93106e375fe99568c024551c85723e5.

**Tatsächliche Schutzwirkung separat belegt:** Konsistente eigene Nur-Lese-Rücklesung
`ecc8c741-adec-4954-89b6-793f97ad926e/identity-native-postcheck.json`, SHA-256
0d59359f242e677bac3bc4d41044021fd0459366b19cadb8311aa6bed8c2cb36.
Exakter unabhängiger Vorher-/Nachhervergleich aller sechs Identitäten/FN-Felder, sämtlicher zugewiesener
manueller/Taxonomie-/Ort-/Zeitkeywords mit echten Kennungen und aller Statistikvariablen bestanden.
Eigene Journaldatei ausschließlich lesend mit null Läufen und null Fotodatensätzen festgestellt:
`205eb00b-19b3-4a9d-ba07-eeb555cd1f31/identity-prepare-halt-verification.json`, SHA-256
9502d9d28c750f5841df843d172c49e9d7749b42f5c650a3190fa59f3cdebe39.
Leere vorbereitete neue Stichwörter dürfen vorhanden sein; keine Entfernung durchgeführt.

**Quellursache:** `IdentityAction` übergibt `LrUUID.generateUUID()` direkt als neue Laufkennung;
das Journal akzeptiert nur Kleinschreibung. Die bisherigen UI-Fixtures lieferten ausschließlich Ziffern,
JS-Fixtures kleine UUIDs. Gekoppelte Gegenprobe mit tatsächlichem Lua-Aufrufer und echtem Journal sowie
Korrektur am Erzeuger ohne Lockerung der Journalgrenze in Arbeit. Die native Fehlermeldung selbst nennt
die ungültige Laufkennung nicht gesondert; den Quellbefund nicht als im Dialog bereits erklärte Ursache
darstellen. Version .37 erst nach tatsächlicher Änderung/Prüfung als Quelle ausweisen.

**Prüfer verstärkt, bevor eine Übernahme abgenommen wird:** Unabhängiger Review fand im bisherigen
Nachprüfer ein Nachweisloch: Alte Artkeywords und alter Pfad konnten bei gleichartig falschem Journal
und neuer Artmetadaten durchgehen. Neuer eigener Prüfer
`632a22b7-a1d5-493b-8ecf-b450cb31356c/identity-native-postcheck.mjs`, SHA-256
d0512719ec203c00786f96df2135090f07e2e3d5bdbc7c9a4c1581a93f9941db, bildet die unabhängige
vollständige Zielerwartung aus dem tatsächlich gefrorenen .35-Vertrag, prüft auch tatsächliche reservierte
Stichwortnamen und Kennungsmengen. 32/32 Gegenproben einschließlich gleichartig verfälschtem Journal
und neu berechnetem echten Statistikaggregat bestanden, ausschließlich gespeicherte Baseline und Memory.
Beleg `33b02884…/identity-native-postcheck.json`, SHA-256
18ad6ed5b1ef3ced842c5a0216c8d0d4154d635587965d95c0ef244a08edee6c;
expliziter Alt-falschgrün-/Neu-abgewiesen-Beleg `4f76c7f2…/checker-counterproof.json`, SHA-256
1bbcf3f92ee871d411ca5f1e32c8ced2d392ab2ed44d5feb79b743d778b7c7da.
Root hat die Ergänzung gelesen und für die reine Nachfehler-Rücklesung verwendet; keine native
Artänderungsabnahme aus synthetischen Nachprüfergegenproben ableiten.

Felix erlaubt am 22. Oktober erneut die Computerbedienung und legt fest: Bei Rückkehr zum normalen
Lightroombetrieb immer den Katalog auf **D:** verwenden. Frisch gesehen ist inzwischen wieder
„Lightroomkatalog aktuell“ im Hauptfenster; genaue Pfad-/Plug-in-Kontrolle vor dem nächsten eigenen
Katalogwechsel. Keine Hauptkatalog-Metadatenänderung durch diese Fortsetzung.

**A-52 im Quellstand .37 korrigiert:** Neue SDK-Laufkennungen werden ausschließlich am Lua-Erzeuger
kleingeschrieben und auf Stringtyp sowie vollständige UUID-Gruppenform geprüft. Ungültige Rückgabe
stoppt vor `Workflow.prepare`; das JavaScript-Journal bleibt unverändert streng. Identische gekoppelte
19 Gegenproben mit tatsächlichem Lua-Aufrufer und tatsächlichem Such-/Journalhelfer: vorher 8 bestanden,
elf erwartete Fehler, nachher 19/19. RED `fb0e4866-5009-4155-8c8d-4682152c9766/identity-uuid-red-result.json`,
SHA-256 883ca0179a6ea80e1ed7956cb048f3fc0bc01248522cc0cd9242f8745f109a6a;
GREEN `e0718554-db4f-49cd-9e8e-ac4b6ba9d6bb/identity-uuid-green-result.json`, SHA-256
16eb8f788d84d5ee290b811b8197f74f2c524e187ce44ef0f52acb2a8d1841df.
Abschließende gezielte Integration UI/Lua/Vertrag/JavaScript-Journal **93/93**, Exit 0, Quellen unverändert:
`1f505452-ccef-43da-8f34-9c3fc27f89e7/identity-uuid-targeted-result.json`, SHA-256
c0283f1effecbfde2384e344cc7f3d72308c67fecb9bf416a1b460bb4fb58523.
Ein vorausgehender 92/93-Lauf fand die zweite noch nicht synchronisierte Versionsassertion; diese ist
im abschließenden 93/93-Stand ebenfalls .37. Root hat Korrektur und gekoppelte Prüfungen gelesen.
Vollgate .37 in eigener Sitzung `25f21e4d-91d2-4413-8b5c-6431dac57454` gestartet; Ergebnis noch offen.

**Tatsächliche Rückkehr-/Inaktivkontrolle:** Vor dem eigenen Katalogwechsel nativ den angehakten
normalen Katalog `D:\Lightroom Katalog\Lightroomkatalog aktuell.lrcat` gesehen; H:-Eintrag nicht gewählt.
Private .35 im Zusatzmodulmanager explizit deaktiviert, Original bereits deaktiviert. Danach eigenen
`FN-Identity-Audit` mit unverändert sichtbaren sechs künstlichen Fotos geöffnet. Beide FN-Einträge
weiter deaktiviert. Frischer tatsächlicher Beleg
`c0cd0519-27f5-4912-bfa1-1c8805cf6264/native-observation-proof.json`, SHA-256
187eeb97c2b88efdf05490eb27d37afa9533a62324656ab4b17b9810d7382ed7.
Private Dateien noch nicht ersetzt; Aktualisierung erst nach bestandenem .37-Gate mit neuem Freeze,
allen zehn vorher gesicherten Dateien und erneutem vollständigem Baselinevergleich. Keine neue Registrierung.

**Lesender Restabgleich vor dem Explorer-/Lightroom-Teilabschluss:** Nach tatsächlichen Split-B-/Split-C-/
Merge-F-Runden mit genauer Rücknahme und Detaildialogabnahme bleiben die Rückstellung der gemeinsamen
Importoptionen, Aktivierung des regulären Originals und nativ bestätigte Rückkehr zum D:-Katalog.
Der optionale LR→Explorer-Korrekturhandoff ist bisher unbenutzt und darf nur mit eigenem Ziel und
gebundenem Startstub geprüft werden. Die extrem lange Explorer-Vorschlagszeile ist bisher als gekürzt
sichtbar und im AX-Baum vollständig; vollständige visuelle Lesbarkeit und bewusste Tastaturwahl separat
prüfen. Browserabmessungen/DPR ersetzen keine gemessene Windows-Skalierungsstichprobe. Screenreader,
Touch, Mehrkatalog-/Katalogkopienverhalten, automatischer 5.000er-Checkpoint/Stromausfall und großer
Identitätslauf über mehrere Schreibblöcke bleiben ohne entsprechenden tatsächlichen Nachweis offen.
Ebenso kein nativer negativer Ortsvorschlags-Export-/Lesefehler aus dem erfolgreichen Produktivlauf und
keine Tabellenprogrammöffnung aus unabhängigen UTF-8-/CSV-Inhaltsprüfungen ableiten. Diese Grenzen sind
keine neu reproduzierten Produktfehler und begründen allein keinen neuen produktiven Großlauf.
A-37-Tabellenzeile an die bereits bestandene eigene Browserprobe aus 10.49 angeglichen; keine Wiederholung
bereits bestandener FN-/Stapel-/Statistik-/Artassistent-/Restorefälle ohne Regressionsgrund.

**Gemeinsame Importoptionen am 22. Oktober zurückgestellt:** Im eigenen Katalog nur den bereits
vorhandenen eigenen Sechs-JPEG-Ordner angezeigt, keine weiteren Bilder importiert. `Mögliche Duplikate
nicht importieren` sichtbar wieder aktiviert, Importstichwortfeld leer, vorherigen Modus `Versch.`
zurückgestellt. Null auswählbare/importierbare neue Fotos; Dialog über Fertig ohne Import geschlossen.
Nativer Beleg `abebfe95-7342-485e-9509-ff5ce7ce87ed/native-observation-proof.json`, SHA-256
7a9684f703617c12f2db5a20635d7957b7cea051e5536cd6a8fb395a8388a1f4.
Die nur für Länderquellen benutzte Metadatenansicht anschließend wieder auf `Standard` gestellt und
im frischen nativen Kombinationsfeld bestätigt. Keine FN-Änderung durch diese Rückstellung.

**Vollständiges .37-Gate bestanden:** `25f21e4d-91d2-4413-8b5c-6431dac57454/quality-result.json`,
22. Oktober 13:27:16 bis 13:39:16 UTC, **50 Gruppen / 1.923 Tests**, null Fehler/Abbrüche/Skips,
Exit 0, alle 137 gebundenen Quellen unverändert. Ergebnis-SHA-256
cedcef0e03124eb9577805e21ca74d91eb599be2e56e6ea34eb21197998ecc51;
Log-SHA-256 84f0d548100f49de6d250dc98e2b953c325a7e9bc06f48ad13906fd4058d2bf3.
Manifest geschlossen, null Operationen, keine registrierten Helfer. `GIT_ALLOW_PROTOCOL=file` wie
beim vorherigen Gate; kein produktiver Git-Transfer. Dokumentverweise anschließend erneut 80/80 gültig.

**Private .37 tatsächlich vorbereitet und geladen:** Aktualisierer vor Ausführung zweimal geprüft;
native Belegstruktur berichtigt und jeder begonnene Schreibpfad vor Schreiben mit Backup/Hashes als
attempted protokolliert, erst nach Rücklesung verified. 28/28 reine Schutz-Gegenproben. Ausführung
`83ed5f46-7370-4f40-9f5f-c84e62d1d970/private37-refresh-result.json`, SHA-256
c0fa54c245f9db41c9629ff289b571291b1a640539017d00490c4a8d042feb69, erfolgreich:
genau fünf Lua-Dateien in jeder der beiden bestehenden privaten Kopien, alle zehn vorher gesichert.
Alle anderen 118/54-Bindungen und privaten Einstiegsguards erhalten; Journal weiterhin null Läufe/Fotos,
vollständige Baseline vor und nachher gleich. Neuer Plan-SHA-256
f6ed837c0ec2448fc210e566c35459fd051e991112657238339272a81a6678b6;
Freeze-SHA-256 ae27122370c8873269f59b4ea841773f4cbb54dd5665590bd366f4431024a319.
Verstärkter neuer Prüfer 32/32; tatsächlicher Nur-Lese-Nachstand `543711f7…`, SHA-256
77ca9a19f482aaa6629a965f807e224964c9871a8dc7f4f092346dab52061705.
Danach private .37 im eigenen Katalog nativ neu geladen und aktiviert, synthetisches Nachfolgerpaar
weiter übereinstimmend: `efaac76e-ad70-4a4b-81c7-2f866461a74c/native-observation-proof.json`, SHA-256
f3b14215aca4a8a9128f0453fb5483a6fc9fb95250fcc8ffe76023abd9df2443.
Original bleibt deaktiviert. Erste neue eigene Split-Auswahlprüfung gestartet; Übernahme noch nicht belegt.

**Neuer nativer Abbruch A-53:** Erste .37-Split-B-Übernahme nach ausdrücklicher Ein-Foto-Bestätigung
meldet „Ein benötigtes FN-Stichwort wurde gelöscht oder umbenannt … Tiere (FN)“. Kein Retry.
Nativer Dialogbeleg `7d7ed165-1dea-419a-8760-196c04c25c97/native-observation-proof.json`, SHA-256
2b02ec75c28c1e610444b2366e7e73c716b4012e753c56303b5d21e73760044b.
Nur-Lese-Katalogsnapshot `412bbe44-1afd-4c59-b756-679046497183/identity-native-postcheck.json`, SHA-256
3a53e2189fef4739c0ca72a1b05992de697def1f13571b2b83464731a853ff9a.
Unabhängiger exakter Baselinevergleich und Journal-/Keyword-SQLite-Lesung:
`58a40148-4cec-4781-a4ef-91d5eb8ae469/identity-keyword-halt-verification.json`, SHA-256
bcc75e4a769858139ce65353e09bfa116bb54eb998e03cb223e56c1c552ff25b. Alle sechs Fotoidentitäten,
sämtliche FN-/IPTC-Werte, real zugewiesenen Keywords und Statistikvariablen unverändert. Eigener Lauf
`d9a32d7f-a53c-4acd-af4e-19bb28c91323` besitzt genau einen Fotodatensatz in `prepared`; null angewendet.
Sämtliche 14 Vorher-/Nachher-Journalstichwörter existieren im eigenen Katalog mit exakter Kennung und
exaktem Namen. Dies belegt SQLite-Existenz, noch keinen korrekten SDK-Aufruf. A-52 erreicht damit nativ
die vormals gesperrte Journalanlage; die vollständige Übernahme scheitert jetzt an separatem A-53.
`IdentitySnapshot.resolveKeywords` ruft eine einzelne Keyword-Suchmethode auf und setzt jeden SDK-Fehler
mit gelöschtem/umbenanntem Keyword gleich. Primären SDK-Vertrag und tatsächliche Ursache vor Korrektur
prüfen. Kein Journal zurückgesetzt oder neuer Übernahmelauf gestartet.

**A-53 SDK-Vertrag unabhängig gegengeprüft:** Die Adobe-verfasste Referenz dokumentiert
[`LrCatalog:getKeywordsByLocalId(ids)`](https://lrc.mcor.dev/modules/LrCatalog.html#catalog:getKeywordsByLocalId)
als Arrayzugriff, nicht die im Code verwendete Singularmethode. `LrKeyword.localIdentifier` ist laut
[Eigenschaftsvertrag](https://lrc.mcor.dev/modules/LrKeyword.html#keyword.localIdentifier) numerisch;
Journalstrings bleiben dagegen ein bewusster Speichervertrag. Tatsächliches `IdentitySnapshot` mit
ausschließlich dokumentiertem Batch-SDK-Mock reproduziert den nativen Meldungstext trotz vorhandenem
Objekt. Auch `IdentityWorkflow.runInput(..., withKeywords=true)` besitzt denselben falschen Zugriff
für die Rücknahmeprüfung. Enger Fix und echte numerische/batch-only Gegenproben in Arbeit; noch keine
.38-Abnahme. Der darunterliegende konkrete native pcall-Fehlertext wurde nicht separat ausgelesen.
Die ergänzenden Singular-Fallbacks in `KeywordWriter` sind damit nicht als eigene Auswirkung reproduziert;
keine pauschale Erweiterung dieser Korrektur.

**Fortsetzung am Abend des 22. Oktober:** Beide Agenten wurden während der begonnenen Korrektur durch
das Nutzungsfenster unterbrochen. Root hat den tatsächlichen Teilstand gelesen; erster GREEN-Versuch
31/32 scheiterte an einer Test-Wortlautbindung `Kennung` gegenüber dem tatsächlichen `Stichwortkennung`.
Diese exakte Meldungsbindung korrigiert, Provider und beide Versionsassertionen nach tatsächlicher
Info-Änderung auf .38 synchronisiert. Finale Kernrunde **32/32**, Exit 0, alle gebundenen Quellen gleich:
`57b5c837-5b7e-4e71-a932-e4b3cc2ae746/identity-keyword-green-result.json`, SHA-256
dd832a862b316167491d97b2d956b96810fb613bef4fc65dd9687f58bdaf2a0d.
Breite Integration einschließlich UI/Vertrag/Journal/Statistik/Entfernung **227/227**:
`9aee6353-4353-4361-9f52-07f8f45de1c9/identity-keyword-targeted-result.json`, SHA-256
b8171c67fc58cb0ee9476f57d606c6e1fc6fe1b5fe6f4528b555871a99e1062f.

Maßgebliche finale identische Vorherprobe mit allen 54 exakt gebundenen .37-Lua-Modulen in ausschließlich
eigener neuer Kopie: **10 bestanden / 22 erwartete Fehler**, null Abbrüche/Skips, Child Exit 1.
`1327b7cc-b96d-4f50-9b70-be732f8c1c60/final-tests-frozen37-red-result.json`, SHA-256
2d11505ce5ccc574ef5f7bbdb2c2159f8abf858d249ba1a372275a74580af074.
Alle 32 Testkörper entsprechen dem finalen Originaltest-SHA-256
1cbc20aa71b492fcd8a5e85f87acb4e8ae6360b22b90ce22abcba5f46723fd93; lediglich der Modulwurzel-Locator
der eigenen Testkopie unterscheidet sich. Unabhängiger Nachreview ohne Blocker; alte private Kopie
unverändert. Neues vollständiges .38-Gate in `c02e7b0d-26c2-4cd9-862f-a916df3c1d7c` mit 139 gebundenen
Quellen gestartet; Ergebnis offen.

**Vorbereiteter inaktiver .38-Wechsel, noch nicht ausgeführt:**
`2a55e7ee-bf74-4680-8d68-96df6414c26f/private38-preparation.json`, SHA-256
533bb4938388391b835ca3734c3cc5ee457c3c8cc21cc05d3e784d8a2bcb58a8. Root und unabhängiger Review
haben neuen Guard/Quellgrenzen gelesen, jeweils 42/42 reine Gegenproben bestanden. Nur Snapshot,
Workflow, Info und Provider in den beiden bestehenden Privatkopien; alle acht vorher sichern.
Der konkrete `prepared`-Lauf mit einem Foto und allen 14 Keywordreferenzen sowie sämtliche SQL-Rohfelder,
Schema-/Vorher-/Nachher-/Inhaltshashes und SQLite-/WAL-Dateihashes vor/nach der Kopie exakt erhalten.
Tatsächlicher vorbereiteter Zustand zweimal lesend identisch, logischer Inhaltshash
331a97581847facddba4b7d98716ae7a9a3244739b48b3c18627e690fa3de6a8. Alter 118/54-Freeze unverändert;
noch kein nativer .38-Reload oder Fortsetzung. Spätere Fortsetzung ausschließlich desselben Laufs.

**Vollständiges .38-Gate und private Kopie abgeschlossen – 22. Oktober abends:**
`c02e7b0d-26c2-4cd9-862f-a916df3c1d7c/quality-result.json`, 18:17:54–18:26:25 UTC,
**50 Gruppen / 1.937 bestanden**, null Fehler/Abbrüche/Skips, Exit 0. Alle 139 gebundenen Quellen
vor/nach unverändert; Ergebnis-SHA-256 dfec895fedb898fd1af76faf039004ab30ab03e05ced9e6f9fba272441983d04,
Log-SHA-256 1b06ce7998f0d4ea2d287856aaef4a7215310fb9359bd6b0cf50296f2c5d2074.
Manifest geschlossen, null Operationen/registrierte Helfer. Datei-only Git-Testprotokoll wie zuvor.
Frischer nativer Inaktivbeleg beider FN-Einträge im eigenen Katalog:
`c4cafa86-0a20-4d26-a514-f2706ebbf7e2/native-observation-proof.json`, SHA-256
578012f6a6569daa72926012b5899a4bb28d72008b6d582458b9ff019ffcf6c9.
Danach genau acht vorab gesicherte Dateien erfolgreich aktualisiert:
`37faf30c-0e7e-426d-81ca-785ec815f7fc/private38-refresh-result.json`, SHA-256
91e82839562599e5a331e6a59ac3c525b2f9318c1f9de0eebb6b9199a09406bc.
Sechs-Foto-Baseline, vollständiges bestehendes prepared-Journal, physische Testbilder, Pointer und
alle übrigen Freeze-Bindungen gleich; neuer Checker 32/32. Anschließend .38 tatsächlich nativ neu
geladen und aktiviert, Original weiter deaktiviert; eigenes Nachfolgerpaar stimmt überein:
`84f378c3-625b-45f4-9eed-080e75d0fef3/native-observation-proof.json`, SHA-256
5f9cb4db2b93342baad83639431a0a926ef049f644e31b27c47f3843079078e5.
Keine neue Registrierung und kein produktiver Katalogzugriff. Fortsetzung des vorhandenen Laufs
über den Verlauf begonnen; noch kein erfolgreicher Schreibabschluss daraus abgeleitet.

**A-51 begrenzte native Detailabnahme:** Erste und letzte der zwei tatsächlichen Leser-Seiten sichtbar,
Tab erreicht Schließen; Escape auf beiden Seiten bringt dieselbe Such-/Art-/Namensauswahl zurück.
Zurück von Seite 2 auf Seite 1 und erneutes Weiter nativ bestätigt. Gebundene Belege:
`cd03dc3e-8f7d-478c-9b6c-474369b53cbc/native-observation-proof.json` (SHA-256
35e0625ca8f76a516da05af64e6e06c59f7f61d1d4ac6afee8b1a06f5925a394),
`07f092fe-3857-4225-9061-563a764f6b29/native-observation-proof.json` (SHA-256
9afaf2f8460d3ea856f61298f0ef06db77e0914600360bbe028ddb5f4268e222),
`b52641d1-c978-4dc3-afe2-f5c55fce6b68/native-observation-proof.json` (SHA-256
805f1338c0a0394c961234d6023be758cf5c0a37714de3d952c42e4bccd2d143).
Keine dritte native Zwischenseite behauptet. Nach Fenster-X folgte vorübergehende Nichtbedienbarkeit
des Hauptfensters. Lightroom erholt sich ohne erzwungenes Beenden; beim folgenden Beleg ist bereits
der Zusatzmodul-Manager wieder lesbar. `e743cee3-0fbe-465c-9adb-cb8ad9af20c2/native-audit-proof.json`
(SHA-256 9ac30028ee397c9322397ad9b668dfbe003459afa29bf0f34a4845f2c9b208a0) enthält im vorab
formulierten Scope noch die Erwartung fehlender AX-Daten; die tatsächlich zurückgegebenen vollständigen
AX-Daten belegen stattdessen die Erholung während dieser Aufnahme. Der historische Beleg bleibt
unverändert. Die zwischenzeitliche Frage nach Force-Close ist damit gegenstandslos; kein Prozess beendet.
Wieder geöffneten Zuweisungsfloater regulär geschlossen, Manager weiter bedienbar. Unabhängiger
Quellnachreview findet keinen belegten Endlosschleifenpfad; zeitliche Nähe beweist keine Ursache.
Fenster-X sauber ohne parallelen Manager samt erneuter Öffnung/Hauptfensterbedienung weiterhin prüfen.

**Tatsächliche .38-Fortsetzung abgeschlossen, unabhängige Prüfgrenze offen:** Über den Verlauf genau
`d9a32d7f-a53c-4acd-af4e-19bb28c91323` mit null angewendet/einem offen gewählt, gelesenen Laufstand
bestätigt (ein eindeutig lesbarer Zustand, null ungeklärt), danach Fortsetzen von genau einem Foto
bestätigt. Lightroom meldet `Artänderung abgeschlossen / Geändert: 1 Foto`:
`29a4e99b-fefd-4cd3-b7bf-276255962cac/native-observation-proof.json`, SHA-256
8ba7ebcca5ceb31dde2d913ed9d098ee3ad97f8b552317713e3c830aa12f844a.
Der unveränderte strenge Nachprüfer stoppt zunächst bei `statisticsValid=false`; kein bestandener
Gesamtnachvergleich daraus. Eigener lesender Snapshot:
`f475a502-e4ba-471f-937f-d766b6bbf451/identity-native-postcheck.json`, SHA-256
838a22ca0f8d76f5b15ca0d9a0f5200c317f139f0a1081652ad81fe8b6a82210.
Exakter Ergebnisdiff ist ausschließlich `/observationRows/4/exampleFileName`: Vollaufbau erwartet
`identity-split-2.jpg`, inkrementeller Index enthält leer. Alle übrigen Ergebniswerte sind identisch.
Der führende Suchpaketvertrag, Abschnitt Beobachtungsgruppen, erlaubt ausdrücklich ein leeres optionales
Beispielfeld nach Entfernen genau des bisherigen Beispielbilds; `StatisticsIndex` setzt dabei Name und
UUID leer. Daher vor weiterer Abnahme die Hilfsprüfer-Erwartung an diesen bestehenden Vertrag binden,
keine Produktkorrektur oder pauschale Ausnahme anderer Statistikfelder. Gesicherter angewendeter
Journalstand mit exakten Snapshot-/Inhaltshashes, einem Lauf/einem `applied`-Foto:
`ebe8918f-5e36-4dab-890a-a4e8353b2200/applied-journal-readonly.json`, SHA-256
616e603c2d95e27f24c7d733ce3f94c634ea97fc84bd46fda0246a44fd496e1d.
Kein neuer Lauf, keine Rücknahme und kein Statistik-Neuaufbau bis zur Klärung ausgeführt.

**A-51 erneute kleine Fenster-X-Probe ohne Zusatzmodul-Manager:** Erste Seite einmal per X geschlossen;
genau ein Zuweisungsfloater mit identischer Suche/Art/Namenswahl zurück, erneute Suche und Leseröffnung
funktionieren. Beleg `0edbd724-d406-415b-ad14-1d4f6d850148/native-observation-proof.json`, SHA-256
9c11d74977fb507f2058eb870984a2d7aa712e6282cb2665e11a07bc276f894f.
Danach Seite 2/2 nativ erreicht, einmal per X geschlossen, wieder genau ein gleicher Floater:
`8f9f2a03-13ae-47bc-8d56-19e6e369f7cf/native-observation-proof.json`, SHA-256
0bcfbb6275c22f78f86a545294f36603888fca16dfe8a5f7d70024347109adbc.
Erst bei anschließendem Klick `Art suchen` liefert die Steuerung mehrfach keine AX-Daten mehr.
Separater lesender Prozessstatus: Lightroom PID 43748, Responding false, CPU 1805.40625 s,
WorkingSet 9.804 GB. Kein weiterer UI-Eingriff und kein erzwungenes Beenden. Aktueller Null-AX-/Sichtbeleg
`77e57b4c-c2eb-482c-b6c1-e416e0262c65/native-audit-proof.json`, SHA-256
2ebb2a72cd3bd77156d1aa965693aacadf6ce310498a6d4854c0286957e93a8c.
Die finale Bedienbarkeit ist damit weiterhin offen; Wiederkehr des Fensters allein ist keine Abnahme.
Die Beobachtung grenzt den Fall auf die eigene Leser-/Floater-Runde ein, belegt aber noch keine genaue
SDK-/Bindungsursache. Quelle bleibt unverändert; unabhängiger Lifecycle-Nachreview läuft.

### 10.51 Fortsetzung und neues CoL-Update – 23. Oktober

Felix beauftragt zusätzlich die Prüfung und bei Gelegenheit die Durchführung der im Explorer angebotenen
neuen Taxonomieversion; er benötigt den Computer aktuell nicht. Der normale Lightroom-Katalog bleibt
verbindlich der auf D:. Heutige native Katalogeinstellungen bestätigen `D:\Lightroom Katalog` und
`Lightroomkatalog aktuell.lrcat`. Lightroom reagiert wieder; wie der vorige Stillstand beendet wurde,
ist nicht beobachtet. Keine erzwungene Prozessbeendigung durch Root. Heute private .38 deaktiviert,
reguläre .38 am Projektpfad aktiviert und altes produktives Referenz-/Master-/Paketpaar passend bestätigt:
`bde124e2-0ec9-4c77-9dc4-a5e14f308067/native-observation-proof.json`, SHA-256
f17094568a691b240cc1b204dd87ef0b36e39a0f9d15025dc711cc6ae73e6df0.

**Gespeicherte Split-B-Nachprüfung bestanden:** Neuer Hilfsprüfer aus der am Vortag abgeschlossenen
Vorbereitung `cd2bfb0e-c743-484a-a06c-da351143d2c2` unabhängig vollständig gelesen. Checker-SHA-256
c6f4055f9376ad23d4e6508bd310fb2334fa5498cedbe0e5b0bf90e295765fcd, Delta-Library-SHA-256
d7ea81bbcb17f2e0d17257e736ed42d4cedf3a3e5a27b3c9ae3e2547a3099205. Alle bisherigen 32 Gegenproben
unverändert enthalten und separat erneut bestanden; neuer Prüfer **52/52** einschließlich echter
gespeicherter Probe, sechs Apply-/Undo-Deltas und 13 Verfälschungsproben.
Frischer gespeicherter Gesamtnachvergleich `6c4588d0-6501-4134-a1be-53ed91bbcd90/identity-native-postcheck.json`,
SHA-256 69de9ed82bfb22583618f920f7fd87e4491911af315f7e2cea76b95711de862b:
alle sechs Fotos vollständig passend, genau eines betroffen, `split-b/apply`, vollständiger Rohindex
entspricht dem gefrorenen tatsächlichen Block-/Statistics-Deltaverlauf. Alle fachlichen Vollaggregatwerte
außer optionalem Beispielnamen exakt; dessen Leerzustand ist an vorheriges Beispiel, echten Journaleffekt
und Verlassen der Gruppe gebunden. `statisticsFullRebuildValid:false` bleibt ausdrücklich sichtbar.
Neue Selftests `550fc6e0-14f7-458c-a11f-906db7d9fadc/identity-native-postcheck.json`, SHA-256
5366597ee0f7da14d9189300e7a1fb920ef40fb4ae60ddea376d30a9828d5795.
Keine neue Kataloglesung oder native Ausführung aus diesen gespeicherten Belegen; Rücknahme sowie
Split-C/Merge-F bleiben offen. Eigene vollständig gefrorene Testdaten und Journal werden erhalten und
sind vom regulären produktiven Datenpfad getrennt; das CoL-Update verändert ihre privaten Pointer nicht.

**Neue Version vor Start verifiziert:** Regulärer Explorer bietet `COL26.10 XR` vom 16. Oktober an:
`ee173800-2659-462e-8363-73a0e45979fe/native-observation-proof.json`, SHA-256
2848effb244fe0600af30448156fd2237374e9a5935cb8bcace29586398c2e8c.
Heutiger kleiner Releasecheck und öffentliche primäre Dataset-Metadaten bestätigen
`col-xr-2026-10-16-316691`, DOI `10.48580/dgzlf`, 8.504.545 erwartete Namensverwendungen.
Nur HEAD des offiziellen Monatsarchivs: HTTP 200, 1.386.490.065 komprimierte Bytes, kein Archivdownload
durch diese Vorprüfung. Datenpfad frisch über Konfiguration/Resolver als `D:\Arten-Explorer\Daten`
bestätigt; D hat 86.604.382.208 Bytes frei. 12 GiB sind nur die Anfangsschwelle; spätere dynamische
Eingangs-/Master-/Paarplatzprüfungen bleiben erhalten. Kein Bereinigungsauftrag daraus.
Produktiver Koordinator und Erfassungsrequest stehen vor Start auf completed vom 13. Oktober;
Registry enthält genau einen vollständig bestätigten Katalog auf D, keinen auf H. Die alte Quittung ist
nach heutigen Katalogänderungen nicht frisch. Neuer Start muss eine eigene requestgebundene SDK-Erfassung
und normalen Katalogabschluss abwarten. Kein Statistikneuaufbau/FN-Daten-Abgleich als Ersatz und kein
Katalogwechsel während dieser Schutzphase. Aktives Paar und direkter Vorgänger bleiben geschützt.

**Neuer regulärer Auftrag tatsächlich gestartet:** Nach aktueller manueller Vorschau mit exakt
COL26.10 XR die Schlussbestätigung `Datenbank aktualisieren` gegeben. Gespeichert am 23. Oktober
12:24:51 UTC: `update-1a5076c1-2e8b-4bf2-88e5-00273e6be815`, zunächst `waiting-lightroom/start`;
eigener neuer `capture-request-27e0ce6e-f9d2-46ab-953d-dabbc0de1639`, ausschließlich D-Katalog.
Anschließend `Lightroom jetzt schließen` im regulären Dialog gewählt: normales Schließen erst nach
erfolgreicher Erfassung vormerken. Kein zweiter Update-/FN-Daten-Abgleich gestartet, kein Katalogwechsel
in dieser Schutzphase, keine alte Quittung neu datiert. Download-/Aufbau-/Paarabschluss noch offen.

**Normales Lightroom-Ende bestätigt:** Nach abgeschlossener frischer SDK-Erfassung zeigt der Koordinator
`FN-Nutzung frisch erfasst. Warte auf normal geschlossenes Lightroom.` Der vorgemerkte normale
Schließversuch erreicht Adobes Rückfrage `Möchtest du das Programm wirklich beenden?`. Root bestätigt
`Ja`, ohne die Einstellung `Nicht erneut anzeigen` zu ändern. Anschließend kein Lightroom-Fenster in
frischer nativer Fensterliste. Die Prozessabfrage ist sandboxbegrenzt und liefert allein keinen
unabhängigen Hostprozessbeweis. Kein Force-Close, kein weiterer Katalogscan. Die Weiterverarbeitung wird beobachtet;
aus dem fehlenden Fenster allein wird noch kein Quellen-/Paarabschluss abgeleitet.

**A-51 eng begrenzter Kandidat vorbereitet und unabhängig geprüft:** Eigene Sitzung
`6d69842c-59da-4e41-806f-c219152afbca`, Kandidaten-Lua-SHA-256
0fdcf3f6584c312f15483c31e22bd413d0813d4592371a27c8af1a87b7ea71e8,
Vorbereitungsergebnis-SHA-256 6a41e448d0ae64d84083a66f0fa16b96aaee6b1c148d5b045d28d4a98b73cb60.
Eine Viewhierarchie je Fenstergeneration, dieselben Properties und einmaligen Observer; alte
Generationscallbacks entwerten und an den beiden SDK-Fensterübergängen yielden. Genau eine Lua-Datei,
13 Ergänzungen/sechs Entfernungen. Unabhängiger vollständiger Nachreview ohne Blocker; vier reine
Mockläufe erneut reproduziert: altes Modell Original 16/16, Kandidat 15/16 (allein ersetzte historische
View-Objektgleichheit); neue identische Suite Original 17/27, Kandidat 27/27, keine Abbrüche/Skips.
Die dritte Suche besteht ausdrücklich in beiden Ständen: kein Ursachen-/nativer Behebungsbeweis für
die Nichtbedienbarkeit. Reale wiederholte X-/Fokus-/Tastatur-/Nachrichtenschleifenabnahme bleibt nötig.
Alle sechs gebundenen Produktquellen und Kandidatenbelege vor/nach gleich. Noch keine Übernahme,
Versionsänderung oder private Aktualisierung; der laufende produktive .38-Updateauftrag bleibt unberührt.

**Automatischer Übergang nach Katalogabschluss belegt:** Derselbe neue Request ist um 12:33:12.687 UTC
`completed`; frische Registryrevision e08bcb988d16aa9b717573eb8e233d531b71f7066462d5e29f9dac5b24663103
um 12:33:11.702 UTC, ausschließlich D-Katalog. Eigene neue SDK-Aufnahme
`usage-16db707d-d66a-448a-86eb-ecfb226c787b` von 12:26:47.16 UTC, 127.427 Katalogeinträge und
7.246 FN-Zuweisungen. Lock/WAL/SHM fehlen; reguläre Katalogdatei zuletzt 12:32:17.222 UTC geschrieben.
Bestehender Auftrag seit 12:33:13.316 UTC `sources/sources`, Fehler leer. Frische native Anzeige
bestätigt Quelldownload 93 % (1.291.415.122 von 1.386.490.065 Bytes), noch keinen Masterabschluss:
`033046af-e5cf-489f-8c5a-6d285fbdeb7d/native-observation-proof.json`, SHA-256
cabdca529825bd1b86dc9449fcebabafb75932fc80f8ff54343b7c3eb9c5d8a3.
Quellen-, Master- und gemeinsamer Paarabschluss bleiben offen; Lightroom bleibt dafür geschlossen.

**Getrennte Explorer-Langnamen-/Tastaturprobe bestanden:** Neue reine Konfigurationsbindung
`c37f422b-448e-4286-aedd-47cd77b1890e`, Laufdatei-SHA-256
4087706c45f1f8d7d725f3f9726da49075e879a61a301b0ec2624c939e59ab2e; vollständiger ursprünglicher
Laufkern mit Schreib-/Netz-/Prozess-/NAS-Sperren bytegleich, alle 139 .38-Gatequellen sowie dieselben
18 Eingänge/722.811 Bytes frisch gebunden. Erster sandboxbegrenzter Listener war vom Browser nicht
erreichbar; regulär ohne Fehler geschlossen, kein Browsernachweis daraus. Unveränderter erlaubter Lauf
außerhalb der Sandbox unter `52b48efd-1737-4e39-8ce5-7627363eec07` tatsächlich im Browser geprüft:
Tab fokussiert den Vorschlag sichtbar, Return übernimmt ausschließlich den bewusst gewählten Eintrag.
Die Trefferzeile ist kompakt gekürzt; die anschließende Auswahlvorschau zeigt den vollständigen
künstlichen Namen einschließlich `ENDE DER LANGNAMENPROBE`, ohne Speicherung einer Art/Namensentscheidung.
Auswahlfelder passen zu Calidris alpina/Dunlin. Gemessen 1.133 × 637 CSS-Pixel, Vorschautitel
661/661 Pixel Client-/Scrollbreite und 111/111 Pixel Höhe; Dialog 745/745 Pixel Breite.
Escape schließt das Formular und fokussiert Neue Art. Sicht-/AX-/Messbeleg
`3e404a53-6ab2-4eec-bd74-6fdfd84ab4e7/browser-ui-proof.json`, SHA-256
6adecfcd6048d5d46f4575df8bddf3b2af7ab0172811380b170828a51d8f0aea.
Eigener Browser geschlossen, Server regulär beendet; Schlussjournal-SHA-256
6a847e9fc4a39abad4c84fc703dd3047ac07ee18eb5d3979c5abc300fce063ca.
Alle 139 Quellen, 18 Eingänge, geschützte eigene Daten und beide Basisdatenbanken unverändert;
keine Quellen-/Schlussfehler. Keine Windows-DPI-/Screenreader-/Touchabnahme aus DPR 1,13 ableiten.
Die synthetische Namenslänge überschreitet bewusst die normale 160-Zeichen-Artfeldeingabe; keine
Speicher-/Validierungsabnahme eines solchen überlangen Namens behauptet.

**Quellenabschluss, anschließend Schutzstopp im Masteraufbau:** CoL26.10-Quellenphase um
12:56:21.709 UTC abgeschlossen: alle 64 aktuellen Projektarten exakt, null Vorschläge/Referenzlücken/
Mehrdeutigkeiten/fehlende Arten/blockierende Fälle; keine Projektdaten geändert. Ergänzungen für 66
Ziele geprüft, 1.089 Datensätze importiert. WoRMS liefert unvollständiges JSON, Wikidata HTTP 429;
letzte funktionierende Einträge bleiben erhalten. Diese beiden Quellenhinweise sind kein FN-Schreibfehler.
Neuer eigener Build `job-dbe054de-788b-4897-9715-b809f1abd6b5` gestartet um 13:25:49 UTC,
um 13:28:47 UTC sicher `failed`: `Die Klassifikationsentscheidung hat keinen unveränderten,
eindeutigen Quellenbeleg mit gleicher Anbieter-ID.` Derselbe Koordinator beendet um 13:28:52.402 UTC
`failed/build`. Native Anzeige und neue aktive CoL-Referenz mit bisherigem Master getrennt belegt:
`b47ee873-681c-47ce-98d6-04cafb6a5074/native-observation-proof.json`, SHA-256
1c4a1e2293d7daa602d84d19c759accb47eb033ab6c312fb4a143d6b1026c325.
Das gemeinsame Paar vom 13. Oktober und sein direkter Vorgänger bleiben unverändert; kein erfolgreicher
Gesamtwechsel und keine automatische Wiederholung. Fehler/Job/Rezept/Entscheidungshistorie erhalten;
konkreten betroffenen Quellenfall vor jeder Korrektur oder weiteren Übernahme untersuchen.

**A-51 als .39-Quelle integriert, noch nicht nativ geladen:** Nach Ende der getrennten Browserprobe
und des produktiven Aufbaus genau die fünf unabhängig geprüften Dateien aus
`14c73010-c6bc-4f57-8987-ca8e919848b7/adoption-template.json` übernommen, SHA-256
f824feef7770512fe9e3963d82e276ffdb6ee4f6a80c315bb1402f69debf8377. Alle Ausgangshashes vorab und
unmittelbar vor jeweiligem Schreiben passend, alle Ergebnishashes exakt. Lua-Kandidat bytegleich zum
vorher unabhängig geprüften Stand; Info/Provider/beide Versionsassertionen .39. Bestehende Testdatei
auf 21 Fälle erweitert: sämtliche 72 bisherigen fachlichen Lua-Assertions erhalten; ausschließlich
alte View-Objektgleichheit gezielt ersetzt. Kein neuer Package-Eintrag. Enger Vertragsregex schneidet
denselben unveränderten Namensspeicherkern vor neuer Viewfunktion aus. Unabhängiger Vorlagenreview Go;
reale Produktpfade nach Übernahme **58/58 Detail-/Vertragsprüfungen** bestanden, null Fehler/Abbrüche/Skips.
Regulärer zuletzt tatsächlich geladener Stand bleibt .38; keine private Kopie/Journal/Fotos verändert.
Native Ursache/Behebung weiterhin nicht aus den Mockprüfungen ableiten. Vollständiges neues Gate folgt.

**Konkrete CoL-Ursache A-54 lesend nachgewiesen:** Alle 1.995 gespeicherten passenden
Klassifikationsbelege sowie das gesamte historische Register sind gültig. Genau ein autorisierter
Streamingdurchlauf der unveränderten gesicherten `col.jsonl` des fehlgeschlagenen Jobs: 836.560.157
Bytes/160.088 Zeilen, SHA-256 61bb96cb47f47117a34765db9b8fb5b0fed72ee96977c9de0c85c9655ec133f7
im selben Bytestrom berechnet und exakt rezeptgleich; keine zweite Quelllesung/SQLite-/Katalogöffnung.
Tatsächliche Normalisierung/Gruppierung des Builders unverändert benutzt, nur benötigte 1.995
historische Namens-/Ranggruppen behalten. Ergebnis: 1.978 `matching-provider-id`, 17 `missing-provider-id`,
null abweichende/mehrdeutige Kennungen. Erster Abbruch Registryposition 99: `Monkeypox virus`,
Master-ID `mtx_b0d57a8a481fc6d6fefdccc61beb2e44`, Ereignis
`708258c533aecab015303c4478eb359ade60595f777864f2e44933d881546258`, bisher Viruses → Bamfordvirae,
alter CoL-Beleg VQQ97/iNaturalist 1145182, heute null CoL-Zeilen in seiner bestätigten Zielgruppe.
Das ist kein Nachweis globaler Entfernung aus CoL oder eines bestimmten Nachfolgers.

Beleg `c5f582b7-ae2f-414a-8d94-fbdd71117294/classification-col-once-result.json`, SHA-256
7d1dedf3da48912549f3279887bf89717f93fd86f64620417b423a9089271d9c; alle 17 vollständigen Fälle daneben
in `rejected-classification-cases.json`, SHA-256
5e97af01396bd58016f991d1bbdf9a9de02e726fd26081d30ff47b4f7b377a2b. Eingangs-/Rezept-/Registry-/
Zeiger-/Quellbindungen vor/nach gleich. Unabhängiger echter Prüfer bestätigt alle 17 Ablehnungen und
historische Gültigkeit. Bei Cryptaulax vulgaris/marina liegen gleichnamige aktuelle CoL-Zeilen in
Chromista statt bestätigter Protozoa vor; der gleichnamige Bacillus circulans ist ein Insekt in Animalia
ohne den historischen Bakterien-Anbieterbeleg. Keinen dieser Datensätze automatisch umbiegen.

Schutzgegenprobe ausschließlich aus Rezept/Textdatei:
`91ad4344-f504-4ebb-ac4a-33c1b16634ae/classification-missing-protection-check.json`, SHA-256
84684c192b1faaac3755a209c22744d0396144928467bb5f2057180672ff83f5. Null Treffer unter 68 frisch
geschützten FN-IDs, 64 Projektarten, fünf Korrekturen (davon zwei Namenspräferenzen), vollständiger
Namenskorrekturdatei, weiteren nichtautomatischen Identitätsereignissen oder explizit zurückbehaltenen
Taxa. Ihre 17 bisherigen Klassifikationsentscheidungen bleiben ausdrücklich erhalten. Manuelle/
Projekt-Feldaussagen, manueller Schutzstatus und Feldentscheidungen des aktiven Masters zunächst nicht
ausgelesen; deshalb noch kein pauschaler Nachweis „global unbenutzt/ungeschützt“.

Der führende Quellenupdatevertrag verlangt hier ausdrücklich erneute Prüfung. Der vorhandene
`classification-deferred`-Weg gilt für neue Gegenstücke zu Referenzlücken und ist kein Wiederprüfweg
bereits bestätigter Klassifikationen. `retainedTaxa` umgeht diese Prüfung ebenfalls nicht. Neue
Nachfolger-/Reichs-/Identitätsentscheidung nicht aus der technischen Updatefreigabe ableiten.
Felix ist die konkrete neue Regel zur Entscheidung vorgelegt: genau diese 17 letzten bestätigten IDs/
Tupel bei vollständig fehlender Nutzung/eigenem Schutz unverändert und quellengebunden als ungeklärt
erhalten, bis zur erneuten Prüfung neue Auswahl/Zuweisung sperren, übrigen Wechsel ermöglichen.
Die Frage war zunächst offen; Felix' nachstehende Antwort ist die aktuelle fachliche Grundlage. Ein bloßer `stale`-Marker
würde die normale Such-/Zuweisungsstrecke bisher nicht vollständig sperren und genügt dafür nicht.

**Zusätzliche gezielte Master-Schutzprüfung:** Genau die 17 IDs im aktiven Master in einer kurzen
readOnly/query_only-Transaktion über tatsächliche Primär-/Taxonindizes gelesen: alle vorhanden,
active/exact-col im Stand vom 13. Oktober; null manuell geschützte Zustände, null manual/project-
Feldassertionen und null Projektlinks. `master_decision` begrenzt mit LIMIT 1001 gelesen: tatsächlich
null Zeilen, nicht abgeschnitten. Keine großen Datenbankhashes; Datei-/Sidecar-/Zeiger-/Rezeptstände
vor/nach gleich. Beleg `077bea2f-b02f-4775-9d98-457b0eeafaa6/active-master-17-id-protection-check.json`,
SHA-256 c0afe9b601af434d7cabf97817c6ab1bafbe796ae8f6c40db76e340be41577ca. Damit die zunächst
offenen Schutzfelder für diese konkreten 17 IDs ergänzt, keine pauschale Aussage über andere Arten.

**Felix' fachliche Entscheidung:** Auf die konkrete Frage nach dem abgesicherten Prüf-/Fortsetzungsweg
antwortet Felix: „Wenn soll hier Fälle auftreten dann ist das in der Regel kein Problem außer ist eine
schon angelegte Art betroffen oder eine deren Namen geschützt wurde durch zum Beispiel eine manuelle
Änderung von mir“. Root setzt dies als Freigabe der vorgeschlagenen Regel für solche ungeklärten
Quellenfälle um: letzte IDs/Tupel/Daten und historische Entscheidungen unverändert erhalten, aktuelle
Quellenlücke ausdrücklich kennzeichnen und neue Auswahl/Zuweisung bis zur Prüfung sperren. Angelegte
Projektarten, positive FN-Nutzung, eigene Namen/Felder/Korrekturen, manueller Schutz oder eigene
Entscheidungen bleiben Sperrgründe und werden konkret genannt. Kein Nachfolger, Reichswechsel oder
neuer aktueller Quellenbeleg wird aus der Freigabe abgeleitet. Schutzprüfung und Retentionsbeleg müssen
an den jeweiligen vollständigen Quellen-/Master-/Nutzungsstand gebunden werden. Umsetzung und
Gegenproben noch offen; erst danach ein frisch geprüfter lokaler Wiederanlauf, kein erneuter Download.

**Vollständiges .39-Gate bestanden:** 23. Oktober, 13:46:16.748–13:54:16.012 UTC,
50 Gruppen / 1.942 Tests, null Fehler/Abbrüche/Skips; alle 139 Quellen vor/nach unverändert.
Beleg `bf3257d8-33da-42d5-a706-4c5c7470f5bf/quality-result.json`, SHA-256
15f1ba3230c17d006587a610434dbe15e5d249d83d04943652370629afca8c0b;
Protokoll-SHA-256 d842ee87322ea96fe999e3aaaa1d9a00476134954418659f969b94f182d23825.
Reguläre .39 nach normalem Lightroom-Neustart tatsächlich im Manager am Projektpfad gelesen;
anschließend für die eigene Testkatalogprüfung wieder deaktiviert. Das alte produktive Paar bleibt aktiv,
die Anzeige des neuen CoL-/alten Masterstands ist nach dem Schutzstopp erwartungsgemäß verschieden.

**Eigene .39-Kopier-Vorabprüfung stoppt am Hilfsprüfer:** Nach normalem Wechsel ausschließlich in
`FN-Identity-Audit` sind beide FN-Registrierungen nativ deaktiviert und alle FN-Fenster geschlossen.
Frischer tatsächlicher Inaktivbeleg `8b75af16-cada-4b5e-8721-bd9702461494/native-observation-proof.json`,
SHA-256 510e461deb9720b9bfdbc794cc73454f3a7e07181ea2375d64c36afc96907e40.
Unabhängig geprüfte Kopiervorlage `76f9a669-7a28-40bb-9595-a4a385c4e296`, SHA-256
0c2040086ff6993b86a506b0fc2f5319423b507fafe3df6abeb532a6704a45cc, wird einmal gestartet und
stoppt vor Anlegen der Kopierausführungssitzung beziehungsweise vor den sechs privaten Schreibzugriffen.
Der alte .38-Prechecker meldet trotz gleicher Feldwerte ungleiche JavaScript-Prototypen: direkte
`node:sqlite`-Zeilen haben null-Prototyp, gespeicherte JSON-Zeilen normale Objektprototypen.
Kein nativer Zuordnungsfehler daraus. Kindprüfsitzung `78dd92a1-32a2-469b-8c94-5da82157d42e`
regulär geschlossen; alte Checker und Belege bleiben unverändert. Eine neue eng korrigierte Vorlage
normalisiert nur SQL-Zeilen beim Einlesen; echte Wertänderungen und alle bisherigen fachlichen
Vergleiche müssen weiterhin scheitern. Private Aktualisierung und native .39-Abnahme noch offen.

**Private .39-Aktualisierung und eng begrenzte native A-51-Gegenprobe erfolgt:** Neue Vorlage
`943f5bf2-44f0-4d4a-bb46-953d1fa57618`, SHA-256
ca166f53dad054a3ee1ead0ef38a866a9040d627ad1ebf186d69ad6d8063dfb1, normalisiert ausschließlich
native SQL-Zeilen beim Einlesen. 57/57 Prüfer-Gegenproben (alle bisherigen 52 plus fünf echte
in-memory-SQLite-Prototyp-/Wertgegenproben) sowie 54/54 Kopierguard-Gegenproben bestanden;
unabhängiger Review ohne Blocker. Tatsächliche einmalige Ausführung am 23. Oktober 14:15 UTC:
`6d588437-5145-4ba5-9e48-218d70bdb00f/private39-refresh-result.json`, SHA-256
b4424206847a031c225796b3aedebfd40cb39d8cf408e98802d84cf814a7efb5. Alle sechs freigegebenen
Dateiersetzungen an den beiden privaten Kopien abgeschlossen, vorher alle sechs Sicherungskopien
zurückgelesen; sechs Fotos, Metadaten, IPTC, Stichwörter, roher Statistikindex und bereits angewendeter
B-Lauf exakt unverändert. Alte Belege/Prüfer nicht überschrieben. Private .39 danach tatsächlich
neu geladen und allein aktiviert; reguläres Plug-in inaktiv. Nativer Ladebeleg
`618ad3d1-9cdc-4b36-80da-0a52a74cee50/native-observation-proof.json`, SHA-256
6fb01adb15b90b46203e021b6d4fe4315b418c8b8b59733ba2866bf13726dab2.

Im eigenen Sechs-Foto-Katalog zweimal Detailansicht geöffnet: erste Seite per Fenster-X geschlossen,
danach explizite Suche erfolgreich; erneut geöffnet, auf Seite 2 gewechselt und dort per Fenster-X
geschlossen. Jeweils genau ein neues Zuweisungsfenster mit unveränderter Auswahl, Suchtext und
bevorzugtem Namen. Seite-2-Beleg `b45a4170-7d2f-4c59-a6c2-4408d15102b0/native-observation-proof.json`,
SHA-256 61a38a9fceeb8251bd55d12fde01c4c4d0b8e0bcbf127913f315352a9cce6716;
anschließende ausdrückliche dritte Suche wieder `Art ist zur Zuweisung bereit`:
`da3a7294-c68b-4eff-8f54-d2c15c7a3b15/native-observation-proof.json`, SHA-256
24986ec7149c1d1ebc028ab04f9edeb96469e3d9e775422d76a02df9f34acfd0.
Zuweisungsfenster anschließend regulär geschlossen und Bibliothek/FN-Verwaltung wieder geöffnet.
Unabhängige lesende Nachprüfung aller sechs Einträge gegen Ausgangsstand und bestehenden B-Lauf
bestanden: `62aaa816-7e7c-4c6b-85ec-cfdd98736d0a/identity-native-postcheck.json`, SHA-256
85613b3926ce7e64db8fefe91b6d7026d2ae208b428882dda48d7ad75e0ae4a4.
Keine neue Zuweisung, Namensspeicherung oder Statistikneuberechnung für diese Fensterprobe.
Shift-Tab lieferte keinen lesbaren Fokusnachweis; daraus keine Tastaturabnahme ableiten. Enger
wiederholter X-/dritte-Suche-Pfad bestanden; allgemeine Fokus-/Fertig-/Escape-Matrix und genauer
Ursachenbeweis bleiben getrennt offen.

**Native B-Rücknahme einschließlich unabhängiger Nachprüfung bestanden:** Ausschließlich den bereits
angewendeten Lauf `d9a32d7f-a53c-4acd-af4e-19bb28c91323` im eigenen Katalog gewählt. Vorschau:
ein Foto, null Konflikte. Tatsächlicher Abschluss `Zurückgenommen: 1 Foto`, nativer Beleg
`96c18909-6070-48a3-a9d0-3f44aae8c943/native-observation-proof.json`, SHA-256
c9d8f9d8fe972b146dfb49e2d036669d89f522a9f680a963981fd56b876ce2cc.
Aktueller unveränderter .39-Nachprüfer (SHA-256
978d94e65ad759ce00b1b01b1355647edc26071afe46b0f7114bf915e3f7f976) bestätigt alle sechs Einträge,
genau eine zurückgenommene Journalzeile, vollständigen Taxonomie-Ausgangsstand, unveränderte
Nichttaxonomie-Felder/IPTC/manuelle/Orts-/Zeitstichwörter und gebundene inkrementelle Statistik:
`2cec5cd7-3954-44b0-b5e4-1676ab12ad7a/identity-native-postcheck.json`, SHA-256
4fbd61692734d7cb60cd90d0a0d63fc76acf5410d08bc8625dbc152fc88ba53d.
Kein neuer B-Anwendungslauf, keine produktive Rücknahme. C-Anwendung/Rücknahme und Merge bleiben offen.

**Split C nativ ausgeführt, erste Nachprüfung an falscher Fixture-Erwartung angehalten:** Nur
`identity-split-2.jpg` ausgewählt, ausdrücklich Ziel C / Auditus gamma gewählt; Schlussvorschau ein Foto,
null entfernte Favoriten. Neuer eigener Lauf `fabb616c-46a8-4e25-9d52-6b70154f2eb8` vom 23. Oktober
14:43:31.479 UTC. Tatsächlicher Abschluss `Geändert: 1 Foto`, nativer Beleg
`51ebe0d7-96a0-468f-9272-f8663489f23f/native-observation-proof.json`, SHA-256
d829200569c7749d0a82f53fd9c89eaede08781739cebc0901f1a9a7ad0026f8. Der unveränderte .39-Prüfer stoppt
bei `referenceImage`: tatsächlicher Normwert leer, Fixture erwartet `no`. Kein Abschlussvergleich aus
diesem Fehlversuch. Neue vollständig lesende Istaufnahme ohne behauptete Phasenabnahme gesichert:
`2e5b85e6-04da-4b5f-ae42-99adc4526a36/identity-native-postcheck.json`, SHA-256
dc6cd5c07e3c6c7412912f8e088cba772724feff5ea6132ed4aebb34bf0da717.

Baseline und aktuelle Aufnahme enthalten für dieses nicht favorisierte Foto jeweils kein gespeichertes
Favoritenfeld. Der gefrorene .39-Schreibvertrag übernimmt den exakten Vorwert, sofern kein bestätigter
Favoriteneffekt besteht; hier gibt es keinen. Die harte `no`-Fixture-Erwartung ist daher falsch, kein
Produktfehler daraus belegt. Eine neue unveränderliche Prüferfassung muss den vertraglich exakten
Vorwert statt pauschaler Gleichsetzung von leer/`no` erwarten und unerlaubte Wertwechsel weiterhin
abweisen. Eigenes Journal und gespeicherte Istaufnahme getrennt prüfen; kein erneuter Katalogscan
als Ersatz und bis dahin keine Rücknahme/Folgeänderung. Alte Prüfer/Belege bleiben unverändert.

**Split-C-Nachvergleich ohne erneuten Katalogscan bestanden:** Neue reine Savedmode-Vorlage
`2353bfe3-c2b2-4c9c-9250-85a3d471c37e/identity-native-postcheck.mjs`, SHA-256
e4d7252ba563ddf8c4239ead66a305c7c7e6e8f047a8968f7740919222ccc01b, entfernt native Leser und verlangt
ohne echten Favoriteneffekt den exakten bisherigen Rohwert. Explizite Effekte benötigen vorher `yes`,
passendes Ziel und genaue Wert-/Änderungsbindung. Alle 57 bisherigen plus 15 zusätzliche Gegenproben
bestanden, vom unabhängigen Reviewer erneut als 72/72 ausgeführt. Dessen Beleg
`80f8ee9a-641b-4208-831c-80eab8a42693/identity-native-postcheck.json`, SHA-256
11beddc2a195d2109012b2246e61d7408a2d646a1d4ea8bd34718b872d9ada53. Statistiklibrary bytegleich
4dbd4d75e3314e1e9b359ea156ae9608fca54cf76ac32ecb9274f0bc95b42617; Vollaggregat und enger
inkrementeller Beispielnachweis bleiben unverändert streng.

Nach Root-/unabhängigem Review genau einmal die feste C-Journalcapture ausgeführt, keine Katalogöffnung:
`54b66a28-2ed5-4899-b1fc-02e3e6bb4fe4/applied-split-c-journal-readonly.json`, SHA-256
40933593f7068a201a9dae4c83659f67eb5982bda102c8d33c4e470cb97228f5. Ein `applied`-Foto des gebundenen
fabb-Laufs, beide Rohwerte leer, keine Favoriteneffekte, Journal-/Sidecarstände vor/nach gleich.
Der anschließende Savedmodevergleich mit der bereits gesicherten C-Istaufnahme bestätigt alle sechs
Einträge und genau eine Änderung, vollständiges Ziel C, geschützte Felder/Stichwörter und Statistik:
`5aacd37f-bf65-4594-9eb5-c39760cef7b0/identity-native-postcheck.json`, SHA-256
305beef5cef6f338d1aa935c9a57d2755f5a98c93e062011f8fff4145900c158.
Keine Produktkorrektur, erneute Anwendung oder Neuinterpretation von leer als `no`.

**Parallele Restarbeit präzisiert:** Felix gibt die lesende öffentliche Websiteprüfung bereits parallel
zum Explorer-/Lightroom-Arbeitspaket frei. Gemeinsame Daten-/Asset-/Footer-/Cacheversionseinbindung ist
der spätere Integrationspunkt; daraus keine vorgezogene CMS-Änderung oder Veröffentlichungsfreigabe
ableiten. Die unabhängigen Core-/Workflow-/Search-Reviews sind abgeschlossen. Neue vollständige
Qualitätsprüfung in `2eb1db28-150e-4cd5-97b0-cc889669c09d` mit 165 gebundenen Quellen gestartet;
bis zum tatsächlichen Abschluss kein grünes Gate behaupten. Lightroom-C-Rücknahme und Merge weiterhin
offen; die Fenstersteuerung verweigert derzeit das Wiederherstellen eines minimierten Fensters bei
gleichzeitig gefordertem, dort aber ebenfalls verweigertem Zustandslesen. Felix hat Lightroom frei gegeben;
einmaliges manuelles Wiederherstellen erbeten. Keine Force-Close-/Umgehungsaktion.

**Integrierte Retentionsregel fertig geprüft, Produktivwechsel noch offen:** Corebeleg
`c25c8dd2-5ac9-4faf-b6a8-4082e993523b/core-result.json`, SHA-256
af5e3a4b8558e70e5bf016e7472cfc83f49d7877e9260429cb8a8d83d30b33fb: neue Corefälle vorher 2/19,
integriert 19/19; angrenzend 127/127. Historie, IDs/Tupel, Herkunft und Daten erhalten; eigene
Schutzzustände bleiben Sperren. Workflow/Usage-Rezeptbindung, erneute Mutationsguards und tatsächlicher
DB-/Manifestabgleich an beiden Rücknahmepfaden integriert. Optional fehlende Vormerkungsdatei verwendet
die angewandte Registry aus den Identitätstabellen des aktiven Masters. Der Agent meldet gemeinsame
119/119 und angrenzende 47/47; nachträglich ausdrücklich nur als Toolsummary überliefert, keine während
dieser Läufe erhobene Vorher/Nachherbindung behauptet:
`931ce022-7c71-4bff-b3b3-08922467ef71/workflow-test-results-retrospective.json`, SHA-256
ec0f69d15acd4155e1e29af19c9cb5f5ac8bcf6349eaed532bddfb01a2694443.

Such-/Verwendungs-Endlauf 146/146 mit 20 vor/nach hashgleichen Dateien, unabhängiger Review Go:
`026ebebc-168f-4b3c-b675-c35bb7a23903/source-hashes.json`, SHA-256
c9eeca3742d9df1ff192c475d8b3e281fe9c3fc1e2b6543db7e158b4337d8239;
Protokoll-SHA-256 f115f1e9b63f0baadd536cd5806ac09df792c14cd41a8624719e2c73698e07b8.
Die 10 direkten Consumerfälle schließen Master- und Korrektursuche, direkte Zuweisung, Bulk-/Adminlesen,
Marker-/Schema-/Leserprüfung, rohe CoL-/Ergänzungsbelege sowie vorgelagerte Preview-/Save-Guards ein.
Lokale CoL-Zeilennummer und tatsächliche Anbieter-ID ausdrücklich unterschieden; alte rohe
Vorschautokens bleiben zusätzlich an ihre stabile Anbieter-ID-Menge gebunden. Gleichnamige andere
Anbieterbelege bleiben zulässig. Tatsächliche Retentionspakete können auch im Legacybetrieb ohne
Paarzeiger nicht separat aktiviert oder zurückgesetzt werden. Keine neue Foto-/Namensentscheidung.

Das anschließende gemeinsame Vollgate ist am **23. Oktober 15:00:24.418–15:08:45.258 UTC** bestanden:
**50 Gruppen / 1.993 Tests**, null Fehler/Abbrüche/Skips, **165 gebundene Quellen vor/nach unverändert**.
`2eb1db28-150e-4cd5-97b0-cc889669c09d/quality-result.json`, SHA-256
641b81cd934e2acf65691388fbb6b6e8446e19aaed508d23e9161dba2c7bead4;
Protokoll-SHA-256 101d727b20a31411019896d541c1c94c474bb552a35dc94f3164089bef4cd843.
Sitzung geschlossen, null Operationen/Helfer. Drei neue Mastertests und die Consumerdatei in den
regulären Gruppen registriert. Verbleibende sichere Statusgrenze: veraltete FN-Bindung stoppt einen
laufenden Worker derzeit als `failed` statt `stale`. Noch kein neuer produktiver Aufbau, Paarwechsel,
Commit/Push oder Deployment aus diesem Prüfergebnis. Nach frischer FN-Erfassung und regulärem
Lightroomabschluss folgt ein eigener lokaler Neuaufbau; vorhandene Quellen und alte Belege bleiben erhalten.

**C-Rücknahme nativ und unabhängig bestanden:** Nach Auswahl genau des angewendeten Laufs
`fabb616c-46a8-4e25-9d52-6b70154f2eb8` zeigte die Vorschau ein Foto und null Konflikte. Die
bestätigte native Rücknahme meldete „Zurückgenommen: 1 Foto“. Abschlussbeobachtung
`627e7629-7141-4291-bf2b-825cdb48e95c/native-observation-proof.json`, SHA-256
7da9e014920e04ecb2aea039e1d43083103d5085eb11586ec6dfa37af417618f.
Danach genau eine neue konsistente lesende Aufnahme aller sechs privaten Einträge:
`8b91c961-4c52-4e81-a609-057832e3e604/identity-native-postcheck.json`, SHA-256
cd3671c24d5f308c6494e611fcc17c7c07deb4c421a1ec3bf31b90f458aae09a.
Die neue feste C-Undo-Journalcapture `509a9460-85a8-4997-a5fa-56fc4e53e3a8/`
`capture-private39-split-c-undo-journal.mjs` (SHA-256
6c9b27c6537036d37d331ce2f20a7a196ad113b8970decaf0d0a033e47928fc4) wurde vor Ausführung
vollständig gelesen und genau einmal aufgerufen. Sie liest ausschließlich dieselbe eine private
Journalzeile als `reverted`; Journal und Sidecars vor/nach unverändert, kein Katalog durch diese Capture
geöffnet. Beleg `053e11d7-50c7-4bf5-94c8-7595def27cf1/reverted-split-c-journal-readonly.json`,
SHA-256 d2d704e03129cca0f986c03019cc0f3b054a46acb88a83e9875932c9e42aebcb.
Der unveränderte Savedmode-Prüfer mit 72 Gegenproben bestätigt für alle sechs Einträge den exakten
Ausgangsstand, genau ein betroffenes Foto, erhaltene rohe Leerfeldbedeutung, FN-/Stichwort-/Ort-/Zeit-/IPTCwerte
und gebundene inkrementelle Statistik: `03f6d2e1-49ae-4171-99d2-a59b84091379/`
`identity-native-postcheck.json`, SHA-256 45c14127c56fc1209d67b5d0166cb98a1b1f6fb25e3bc751efd3bb7358086a85.
Damit B und C jeweils Übernahme und Rücknahme bestanden; Merge F noch offen. Beim folgenden
Auswahltest erneuter Eingabeschutz/Minimierungszirkel der Windows-Steuerung; nach Felix' „wieder frei“
Lightroom frisch gebunden und regulär aktiviert. Anschließend genau zwei künstliche Merge-Ausgangsfotos
markiert. Kein produktiver Hauptkatalog beschrieben.

**Parallele öffentliche Websiteprüfung, lesender Abrufstand vom 23. Oktober:** Ein vollständiger
aktueller Sitemap-/HTMLdurchlauf mit unverändertem vorhandenen Helfer: 137/137 Seiten HTTP 200,
null Abruffehler, Titel und Meta-Beschreibungen vorhanden, erfasste Titel eindeutig. Rohantworten,
Header und Bodyhashes gesichert; keine Medienpayloads durch diesen HTTPdurchlauf geladen.
`71c98673-311e-4cab-96c4-eb820f684fcd/public-site-live-audit.json`, SHA-256
bf28a8d09a09e217edfa876e119976d00e3eba62bb0cbd42b653ef12f667e6aa.
Auf allen 63 öffentlichen Artseiten jeweils alle sieben Modulcontainer genau einmal und dieselben
zehn Projektmodule; alle zehn JavaScript-Antworten HTTP 200. Sieben Module bytegleich lokal,
Taxonomie 1.0.8/Suche 1.0.2/Zoom 1.0.7 weiterhin öffentlich gegenüber vorbereitet 1.0.9/1.0.3/1.0.8.
Öffentliche Artendaten und Fehlstellenreport bytegleich lokal. Fünf interne Zusatzpfade erreichbar;
15 reine Asset-HEADs für Amsel und beide Goldhähnchen erfolgreich. Nackte und frisch adressierte Sitemap
bytegleich mit 137 Adressen. Bekannte Papageientaucher-/Rebhuhn-Galerieidentitäten und rohe Altattribute
gegen gespeicherten 20.-Oktober-HTMLbeleg unverändert; keine neue Motivbewertung oder CMS-Übernahme.
Modul-/Datenbeleg `aec7d0a1-d7de-49ff-bf79-a3a084d3a4ef/public-site-pages-module-bindings.json`,
SHA-256 55244a4d37e455942d988b29ef671eaffa4975d70be62f93513b610ee20c6725;
Schlussbefund `688e66dd-a5c1-47b4-ad90-24bc453498a0/public-site-readonly-conclusion.json`, SHA-256
1e31d6cd87d48d88ea44ca630971043b2205c9d36d81bafd4d3559c203df2108.
Zählergrenze: 64 technische Dateizeilen einschließlich der bereits unter 10.19 abgegrenzten alten
Löwen-Testzeile, genau die übrigen 63 Slugs öffentlich. Keine neue Löwenseite verlangen oder
Dateientfernung ableiten. Zwei wörtliche Titelabweichungen (Iguana Iguana/Iguana iguana, Weißstorch/Weissstorch)
ohne Slug-/Zuordnungsdifferenz; genaue Schreibweisen im Rohbeleg. HTML-H1-Zählung ersetzt weder
gerenderte DOM- noch Tastatur-/Screenreaderprüfung. Browserzugriff des Hauptagenten funktioniert;
Agenten haben dagegen keinen Zugriff auf dessen Browser. Eigener öffentlicher Prüftab getrennt vom
vorhandenen Squarespace-Verwaltungstab. Echte Bedienmatrix im Browser weiterhin offen; kein CMS-Schreiben,
Commit/Push oder Deployment aus dieser Abrufprüfung.

**Merge F nativ übernommen und zurückgenommen, unabhängige Nachvergleiche bestanden:** Genau die
zwei privaten Fotos `identity-merge-1` und `identity-merge-2` markiert; D und E jeweils ausdrücklich
F zugeordnet. Unter den drei vorhandenen Favoriten wurde ausschließlich `identity-merge-1`
(`022B919C-0883-4148-878D-5448CB14F683`) gewählt. Schlussvorschau: zwei Übertragungen,
zwei Favoritenabwahlen, Ort/Zeit und fremde Stichwörter erhalten. Native Bestätigung
`47ce7b80-de6e-4e9f-9aac-ca2fc2036e7f/native-observation-proof.json`, SHA-256
c9998f8dfb3cab9971ac7c78ffa31434cb3e164324d151d90709685174c01e38.
Neuer Lauf `092358b2-146a-4e33-8c58-c044c1faca47`, 23. Oktober 15:31:59.990 UTC;
native Fertigmeldung drei geänderte Fotos (zwei Transfers plus ein reiner Favoriteneffekt außerhalb
der Auswahl): `f93c7390-10d1-4533-9516-08966142843c/native-observation-proof.json`, SHA-256
92171e52dd7dec0c417851b5212afaccd7a34229f9b6f6496df49b21ab68442a.
Unabhängige vollständige lesende Aufnahme `b0206e38-1469-4431-8fdf-4f9e44e764cf/`
`identity-native-postcheck.json`, SHA-256 99ea51243306182526ec187c801afb1df1280e11bbca63873eabac1f26fe94ee.
Die neue reine Journalcapture `4bdcf686-4ee2-41a4-a6ee-df416aa7182e/`
`capture-private39-merge-f-journal.mjs`, SHA-256 339141a7db2d128038a14d14b371618fcf4f0be0f8a8330005fd94a667467681,
wurde vom Hauptagenten vollständig gelesen und unabhängig mit Go geprüft. Sie bindet alle sechs
Originalidentitäten und geschützten Domänen, genau zwei Transfers und drei exakte Favoriteneffekte,
Gewinner, Inventar-, Paket-, Baseline- und C-Undo-Stand; ausschließlich ein privates Journal mit
drei Zeilen. Apply-Capture `dcebeb78-a61e-41c9-a400-2e1101484f67/applied-merge-f-journal-readonly.json`,
SHA-256 4acbd0dcd380f4feaca386c1d2d555a153d4711b8d341ec2508b51cecc66502b;
Savedmode-Nachvergleich `feed9192-68cc-4b86-8b97-22147f36f63e/identity-native-postcheck.json`,
SHA-256 d7fb4e2adccfbd6c850bc627cb0bdd33ed0611c5c5f84af67a7303a8756e6c3b: bestanden,
sechs Einträge / drei betroffen, einschließlich inkrementeller Statistik und erhaltener Nichttaxonomie.

Anschließend im nativen Laufprotokoll genau denselben neuen Merge-Lauf gewählt; Rücknahmevorschau
drei Fotos / null Konflikte, native Fertigmeldung drei Fotos zurückgenommen. Abschlussbeleg
`1dcb4863-bbe6-4cfb-b342-52930a95e694/native-observation-proof.json`, SHA-256
6debbdd968189b1b88c30600e306fb53dfb828a3dc269ea3f9541d5a4027500d.
Neue konsistente lesende Aufnahme `4d530d90-9a39-4402-acaf-6b5f667e4ad6/identity-native-postcheck.json`,
SHA-256 d251c58f632e1e14d7abc429997ea0c38b2094d05e3ad22f636dedaffc123c85;
Undo-Journalcapture `2e752ea7-6ba8-4ec4-b545-6a62c76b182f/reverted-merge-f-journal-readonly.json`,
SHA-256 8b72b4bb06e9f3e2509ec30495e856f09cd54d2b93dac0ce8468f679a2cf9d99.
Unveränderter Savedmode-Prüfer bestätigt sechs Einträge / drei betroffen, `merge-f/undo` bestanden:
`b1ac57f5-7a54-4140-b2e5-cd90e8a0a770/identity-native-postcheck.json`, SHA-256
d7f700078d24a1d6b0f6391ba08abbdec4dc52454b0774e50979874c92358e79.
Alle ursprünglichen Identitäten und Favoriten wiederhergestellt; Nichttaxonomie, manuelle Stichwörter
und inkrementeller Index vollständig passend. Journal/Sidecars während beider getrennten Captures
unverändert. Keine produktive Katalogänderung, Statistik-Neuaufbau oder künstliche Produktividentität.
B, C und F bestehen damit als native Grundfälle mit vollständigem Nachvergleich jeweils Apply/Undo.
Native Pause-/Fehler-/Großkatalogmatrix sowie allgemeine Fokus-/Fertig-/Escape-Bedienmatrix bleiben
eigenständige offene Nachweise. Die Testkopie wird anschließend deaktiviert und das reguläre .39
vom Produktivpfad vor der Rückkehr in den D-Hauptkatalog wieder aktiviert.

**Rückstellung und parallele Computernutzung:** Die private Identity-Audit-Registrierung wurde
deaktiviert und das reguläre Plug-in **0.4.24.39** vom exakten Produktivpfad
`D:\Arten-Explorer\lightroom-plugin\FNWildlifeTaxonomy.lrplugin` nativ aktiviert.
Beobachtung vom 23. Oktober 15:43:42.863 UTC:
`e62af8e2-f374-4c09-b145-36c65eb0cd07/native-observation-proof.json`, SHA-256
3b3d095d70aac1b77164c6234a1fb60f812afb9599f62d76b26e45da2f5f5961.
Nach dem Katalogwechsel ist der tatsächliche Hauptkatalog in den nativen Katalogeinstellungen,
Allgemein, frisch bestätigt: Speicherort `D:\Lightroom Katalog`, Dateiname
`Lightroomkatalog aktuell.lrcat`. Beobachtung 15:54:13.492 UTC, erst anschließend ohne neue
Fensterbedienung archiviert:
`d0e5f593-c87c-4981-b1ba-4ab23214abf4/native-observation-proof.json`, SHA-256
7f6dc9e7b82af59b5ccf3dd5ed50350f4d8b50a4af3a32653dc28e4f5589dfe8.
Belegsitzung geschlossen, keine Fehler. Eine erneute Plug-in-Kontrolle im jetzt geöffneten
Hauptkatalog bleibt vor dem neuen Aufbau offen; die Aktivierungsbeobachtung stammt noch aus
dem zuvor geöffneten eigenen Testkatalog. Keine produktive FN-Zuweisung durchgeführt.

Felix fragt nach paralleler Computernutzung. Direkte Fensterbedienung wird zunächst zurückgestellt;
Dokumentationsabgleich und unabhängige lesende Prüfungen benötigen keine gemeinsamen Eingaben.
Lightroom und Explorer bleiben bis zur abgestimmten weiteren Bedienung geöffnet. Während des
späteren Taxonomieaufbaus bleibt Lightroom nach frischer FN-Erfassung regulär geschlossen;
andere Programme können benutzt werden. Eine frische lesende Statusabfrage bestätigt weiterhin
den bisherigen fehlgeschlagenen Aufbau ohne gebundenen Kandidaten, keinen neuen Aufbau.

### 10.52 Unabhängige Prüfungen bei paralleler Computernutzung – 23. Oktober

Felix verwendet den Computer und beauftragt zunächst nur Arbeit ohne Computer Use. Danach erlaubt er
ausdrücklich den integrierten Browser, sofern keine Programme überlagert werden und er ungestört
weiterarbeiten kann. Keine native Fenstersteuerung, Aktivierung, Tastatureingabe oder Lightroom-/
Explorer-Neustart. Eigene IAB-Prüftabs werden mit `visible:false` angelegt; der vorhandene
Squarespace-Verwaltungstab des Benutzers bleibt unberührt. Produktiver Taxonomie-Ersatzaufbau weiter
nicht gestartet. Keine neue FN-Erfassung oder Katalogänderung.

**Unveränderter Prüfstand und frische öffentliche GitHub-Metadaten:** Alle 165 Quellen des bestandenen
50-Gruppen-/1.993-Tests-Gates gegen dessen gesicherte Nachherhashes geprüft: keine Änderung. Das ist
kein neuer vollständiger Testlauf. `main` weiterhin `8116806ea007b5ca10a83e72632cba7aa62ee00d`;
neuester Actions-Lauf weiterhin Pages `39275050310`, abgeschlossen/erfolgreich für genau diesen HEAD.
Branchmetadaten nennen `protected:false`, `protection.enabled:false`, Statuscheck-Durchsetzung `off`;
öffentliche Rulesetliste leer. Keine neuen Administrations-/Secrets-Anfragen und keine Einstellungsänderung.
Die frühere 401-Zugriffsgrenze bleibt für nicht öffentlich lesbare Einstellungen bestehen. Der
workflowbezogene Collectionpfad wird vom Connector als unzulässiger URL-Pfad zurückgewiesen;
der dokumentierte allgemeine Actions-Run-GET liefert den obigen vorhandenen Lauf, kein Authentifizierungsretry.
Normalisierter Beleg `4d241fe2-355d-443a-a620-ef77f08bbe51/non-ui-review-inputs.json`, SHA-256
4bdbf719ad3f78ecce6978ff28164688b1c876fe8bcdd46172a9d5c274269522.

**Unabhängiger lokaler Pages-Abgleich:** Sieben direkte Actionreferenzen weiter vollständige SHAs und
passend zum gesicherten offiziellen Pinbeleg. Jobkette `quality → build → deploy`, Node 24, Lockfile-
Installation ohne Installationsskripte, FFmpeg und getrennte Deploymentrechte konsistent. Neun reine
Policyklassifikationen bestätigen den Ausschluss privater/neuer interner Retentions-, Daten- und
Temp-Pfade. Acht geprüfte Quellen passen zur Vorher-/Nachherbindung des Gesamtgates. Keine neue
Suite oder Artefakterzeugung. Beleg `466538af-9dfb-42c6-8224-fddc8ecaa695/pages-local-contract-review.json`,
SHA-256 c122a33f8fba182afbfdcbdcc2a0bca36333dff8ee2aa41582f5c6342f377666.
Grenzen: eigener Linux-/Pages-Lauf des noch unveröffentlichten Stands; indirekter beweglicher
`upload-artifact@v4`-Tag, Configure-Pages-Manifest mit Node 20, veränderliche Runner-/apt-/Node-Patches.
Artefaktprüfung belegt exakte Dateimenge, Pfade, Typen und Linkverbot, keinen Inhalts-/Secretscan.
Außerhalb CI fehlt eine `engines`-Sperre; bestehender SQLite-Hinweis nennt 22.5+ und empfiehlt 24,
während der Projektbetrieb Node 24 verlangt. Daraus kein reproduzierter CI-Defekt.

**Drei vorbereitete Websitekorrekturen eingegrenzt:** Gespeicherte tatsächliche Liveantworten gegen
lokale Quelle geprüft: Taxonomie ergänzt vollständiges Binomen, Suche nur zugängliches Label und
Statusansage, Zoom Dialog-/Fokus-/Hintergrund-/Escape-/Tab-Behandlung. Footer-/Cacheversionen und
Reihenfolge lokal passend; keine weiteren versteckten Moduländerungen. Vorhandene gezielte Tests
16/16 bestanden, keine neuen Tests hinzugefügt. Tatsächliche CMS-Ereignisreihenfolge, Touch,
Screenreader und Schrift-/Umbruchverhalten bleiben davon getrennt. Belege
`fe585d3a-bcb6-4c53-b739-eabf5efc2ccf/website-module-integration-evidence.json`, SHA-256
5cf6414c5657b95fcfaf3799e204fa8d84ed16bb06332db3b80f810d992fa2aa, und
`1fc0eaf5-b25f-45b9-a145-6ee404128cfb/website-module-integration-conclusion.json`, SHA-256
03d7630c4f81cd4efb0196475a5dcf50b4d963ad8ccd1a7ac53508761b05377f.

**A-55 zusätzlich direkt belegt:** Genau ein begrenzter Abruf des im gesicherten Wendehals-HTML
enthaltenen öffentlichen Squarespace-CSS: HTTP 200, Typ `text/css`, 557 entpackte Byte Compilerfehler.
Die Diagnose enthält eine `clip-path`-Rechnung mit doppelten Klammern; das beweist nicht den rohen
CMS-Eingabetext. Metadatenbeleg `cb8de060-cb34-4463-a9d0-0ed172d3919c/public-css-readonly.json`,
SHA-256 5f28a1b78b980bd184071ed16bfeab1ab80935e2956bb971540f794ff9dd64ed;
Payload-SHA-256 365b317291e69d891641b24a6c09d2e25916698c6209241489ff9d4babf498fb.
Eine einzelne frische Wendehals-HTMLabfrage bestätigt denselben `/42/custom.css`-Verweis und bytegleiches
HTML; Projekt-CSS `docs/squarespace-custom.css?v=1.0.8` separat HTTP 200, 15.586 Byte und bytegleich
lokal, SHA-256 d8863b792f0375e1b2eb213e544cf9a78328f0fc3093590d4b1db905f55dcc08.
Korrelationsbeleg `1651adc5-aac5-49f2-aca9-b317e02380c2/current-public-css-correlation.json`,
SHA-256 23d5f98a1e9cca41cb023df89be2c2e7682009376afd097c94bfa212218f3b11.
Der frühere HTTP-200-Seitenbefund ist damit keine vollständige Stylesheet-Inhaltsprüfung.

Der tatsächlich veröffentlichte Taxonomielader legt auf Artseiten mit `#species-taxonomy` einen
zusätzlichen Projekt-CSS-Link an; ohne diesen Container startet dieser Ladepfad nicht. Im eigenen
Hintergrundbrowser sind passende berechnete Taxonomiestile und der konkrete Projekt-CSS-Link sowie
gestylte Taxonomie-/Status-/Portrait-/Player-Module beobachtet. Die einzelnen nicht zuverlässig im
DOM-Lesescope verfügbaren `link.sheet`-/Audio-Propertywerte nicht als CSS-/Tonfehler gewertet.
Vor späterer CMS-Korrektur aktuelle rohe Eingabe sichern und exakt abgleichen, nur betroffene Rechnung
korrigieren, neue erzeugte CSS-Adresse/Inhalt und Darstellung nachprüfen. Kein gesamtes CMS-CSS blind
durch Repositorydatei ersetzen; `/42` hat sehr lange Cachegültigkeit und ist kein späterer Erfolgsbeleg.

**Eigener Hintergrundbrowser, eng begrenzte Live-Funktion:** Wendehals lädt Taxonomie, Status/Trend,
Portrait, Karte und Player. Player vor Start über seine Stummschaltung auf angezeigte Lautstärke 0
gestellt; beobachteter Fortschritt 0,26918 → 14,92785 Sekunden bei Dauer 16,518792, anschließend
normale Rückkehr auf pausiert/0. Keine hörende Qualitätsabnahme. Quellen-/Lizenzaufklappung erreichbar.
A-56: Screenshot und DOM bestätigen den 22,75-Pixel-Überlapp von Kartenüberschrift und Bild;
Dokumentbreite 1.265/1.265 bei Viewport 1.280 × 720, kein horizontaler Seitenüberlauf.
Beide tatsächlichen AX-/Screenshotaufnahmen und DOM-Messungen unter
`2ff47edd-18cd-435d-a5d1-3b629fb4d24b/background-browser-proof.json`, SHA-256
de8c6eca269589b523bbaed87488bd3a0cd30655c542d69a84f40eae11f9e1c8.

**Lightroom-Restmatrix konkretisiert, noch nicht ausgeführt:** Unabhängiger reiner Quellenabgleich
bestätigt vorhandene echte isolierte Journal-SQLite-Tests, 253-Foto-Planung in 250 + 3, Lua-Fehler-/
Rollback-/Checkpointgegenproben und UI-Pause. Native B-Vorgeschichte belegt bereits Schutzstopp vor
Fotoschreiben und Fortsetzung desselben vorbereiteten Laufs; nicht erneut als fehlender Grundfall führen.
Weiterhin nötig sind drei begrenzte spätere Pakete: 253 eigene Journalfotos mit echter Apply-/Undo-Pause
über die Blockgrenze und Wiederöffnung; kleine kontrollierte Privatkopie für tatsächlichen SDK-Rollback,
Commit-vor-Journal-Störfenster und sichere Konflikt-Teilrücknahme; repräsentative große Katalogkopie
mit höchstens einem künstlich betroffenen Foto zur Laufzeit-/RAM-/Abbruchmessung. Jeweils vorher eigene
Sollmenge und Nachprüfer einfrieren; keine neue Katalogkopie, Instrumentierung oder Schreibprobe gestartet.
Katalogweite Guards laufen heute ohne eigenen Fortschritts-/Abbruchpunkt, einer davon unter Schreibzugriff;
sechs erfolgreiche Fotos ersetzen diese Betriebsgrenze nicht. Kein Stromausfall-/Datenträgerfehlernachweis
und kein 5.000er-Statistikcheckpoint aus diesen geplanten Identity-Proben.

Aktuelle Kurzstatusangaben in Taxonomie-Betriebsstand und Lightroom-Vertrag korrigiert: B/C/F-Grundfälle
bestanden, Restmatrix offen; alte Masterherkunft von bereits neuer CoL-Referenz getrennt. Bis zu der
nachfolgend gesondert freigegebenen CMS-Korrektur keine Produktquellenänderung, Versionserhöhung,
Veröffentlichung, Bereinigung oder Sicherungsänderung.

**A-55: vorbereitete enge Korrektur, ausdrücklich freigegeben und live nachgewiesen:** Der rohe
CMS-Eingabetext wurde im eigenen Hintergrundtab gesichert: 15.586 Byte, SHA-256
d8863b792f0375e1b2eb213e544cf9a78328f0fc3093590d4b1db905f55dcc08, bytegleich
`docs/squarespace-custom.css`. Damit kein nachgewiesener veralteter manueller CSS-Stand; die
Fehlerausgabe des Compilers ist nicht mit dem Originaleingabetext gleichzusetzen. Beleg
`e654894a-4313-4933-938d-e83709de33e1/cms-css-readonly-source.json`, SHA-256
62a020a2a7fad004ee1bfa3f7775af34027229a705f9334db0313a426ea06bf9.

Genau zwei vollständige Polygonwerte mit dem offiziellen LESS-Escape `~"..."` eingefasst, damit
die Browserrechnung unverändert als CSS ausgegeben wird. Alle drei `calc`-Ausdrücke, Variablen,
Fallbacks und Koordinaten bleiben erhalten. Kandidat 15.574 Byte, SHA-256
5bf60735e1ad7306295b4e417f033ab482838486f66ef412563a1e2713884ff9. Unabhängiger Diffreview
bestätigt ausschließlich diese beiden Änderungen. Im offiziellen LESS-Playground 3.0.4 ergeben
Original und Kandidat dieselben Zielwerte; keine Reproduktion der unbekannten Squarespace-
Compilerversion behauptet. Plan und tatsächlicher Vergleichsscreenshot unter
`1bb05025-a093-4bdd-b9e1-4e7e2b4d4db1/cms-css-candidate-plan.json`, SHA-256
8a5297e1d44d24224b3dc2ad8a738c6d7f38bb82b2536307d0c1ecde6ba8977c.
Grundlage: [LESS Escaping](https://lesscss.org/) und
[offizieller Playground](https://lesscss.org/less-preview/).

Felix genehmigt ausdrücklich „Ja, CSS-Korrektur speichern und prüfen“ für diese beiden Werte,
mit frischem Quellabgleich, Rücklesung und eigener Hintergrundbedienung. Eine erste lange Eingabe
wird vom Steuerungszeitlimit unterbrochen; nur ein ungespeicherter Teilentwurf im eigenen Tab,
keine Teilveröffentlichung. Nach frischer Zustandsaufnahme vollständig durch den vorbereiteten
Kandidaten ersetzt und Rohtext/Hash exakt geprüft. Unabhängiger neu geladener CMS-Tab bestätigt
um 16:45:08.767 UTC noch den unveränderten ursprünglichen Servertext d886…; erst danach einmal
„Speichern“ betätigt. Anschließend keine offene Speichern-/Abbrechen-Auswahl. Unabhängige erneute
CMS-Neuladung um 16:47:23.428 UTC bestätigt exakt den gespeicherten Kandidaten 5bf….
Rücksetzung nicht erforderlich; der frische Vorabvergleich zeigte keine fremde Zwischenänderung.

Öffentliche Rücklesung um 16:46:27.865 UTC: Wendehals verweist auf neue Squarespace-Adresse
`/43/custom.css`, HTTP 200 / `text/css`, 10.951 Byte, SHA-256
23ed757ca637e0b70c05366ba92716e7fabb17992190a63811e69d482792f682. Enthält die erwarteten
Stilregeln und beide unveränderten Polygonformeln, keine Compilerdiagnose. Beleg
`85e64e11-0a69-4d25-9f64-4316b79d446e/cms-css-public-after-save.json`, SHA-256
9466bd371777c2a0552c3e2826301c8f987dfc83ceccb1993fb6bda1b7a176bc.

Eigener öffentlicher Wendehals-Tab nach Neuladung: CSS 43, gestylte Taxonomie, geladenes Portrait
(natürliche Breite 1.280), geladene Karte (1.104), Player bereit/pausiert ohne Medienfehler,
kein horizontaler Überlauf (1.342/1.342). Tatsächliche CMS- und Modulansicht samt Rohtext/DOM-
Rücklesung dauerhaft unter `f52256a5-c1f3-4c6e-bf0d-3e6ef01884e6/cms-css-live-acceptance.json`,
SHA-256 d64bdca130c7a93488516f78d78a03e3a40b8fad2474204fa621c3091e898605;
Nachherbild `wendehals-after-css43.jpg`. Alle neuen Belegsitzungen geschlossen, null Operationen,
keine Helfer oder Fehler. Die eigenständige Standard-CSS-Datei, Root-JavaScript, Footer und
Cacheversionen der Projektmodule bleiben unverändert. README/Betriebs- und Strukturhinweise trennen
nun Standard-CSS von der erforderlichen CMS-Eingabeschreibweise; kein LESS-Escape in direkt ladbare
CSS-Dateien übernehmen. Eine spätere CMS-Übernahme muss denselben Inhalts-/Darstellungsnachweis führen.

Eigene frisch geladene öffentliche Übersicht „Heimische Tierwelt“ ebenfalls mit `/43/custom.css`,
ohne `#species-taxonomy` und ohne separaten Projekt-CSS-Link. Ansicht 1.280 × 720, Seitenbreite
1.265/1.265 ohne horizontalen Überlauf. Reguläre Suche „Wendehals“ zeigt genau „1 Treffer“ und den
richtigen Link `/wildlife/heimische-tierwelt/jynxtorquilla`. Tatsächlicher Screenshot, vollständige
AX-Aufnahme und DOM-Beobachtung unter
`11c963da-37e0-4140-93d9-2afb28d1822d/overview-css-acceptance.json`, SHA-256
1283a97700f5bb48d0a4a87b1b4ed6c5ffd885bd9154476148c0d481ae8b0bb6. Das belegt die begrenzte
Nachprüfung zweier Seitentypen, keine vollständige gerenderte Abnahme aller 137 Sitemapadressen.

**A-56 getrennt eingegrenzt:** Tatsächliche Wendehals-Fluid-Engine-Zuordnung gelesen:
Überschrift `fe-block-564367b9dd12d4cd0f05`, `grid-area:41 / 2 / 43 / 8`; Kartenbild
`fe-block-d869c3b04f25f102aaf0`, `grid-area:42 / 2 / 43 / 26`. Die schmale Überschrift läuft über
zwei Zeilen in den bereits beginnenden Kartenbereich. Nach erfolgreicher CSS-43-Korrektur weiter
22,546875 Pixel Überlapp bei dem anschließend beobachteten breiteren Viewport. Damit eigener
Layoutbefund; keine neue CMS-Blockverschiebung, Textänderung oder CSS-Sonderregel übernommen.

**Abschluss dieses engen Arbeitspakets:** Unabhängiger Agentenreview liest die drei Abschluss-JSONs
und neun gebundenen Rohdateien einschließlich Bilder: alle Hashes passend, gespeicherter Kandidat
bytegleich, Formeln unverändert, A-55-Abschluss und fortbestehende A-56-Grenze korrekt. Keine neuen
Agentenabrufe oder Testwiederholungen. Root bestätigt um 16:59:44.567 UTC erneut alle 165
Gate-Quellen unverändert sowie Standard-CSS weiterhin d886…; Beleg
`8f02c2e2-f4e9-45d5-9b23-de6ce7820b86/css-closure-source-continuity.json`, SHA-256
1759becef38be5eb3e73b594f9397b3326223d8b9083233ddd0317669ff0e3cd. Das bestehende Gate
50/1.993 wird nicht als neuer Testlauf ausgegeben. Abschließende lokale Dokumentverweisprüfung:
80 Markdown-Dateien ohne fehlende lokale Verweise. Eigene CMS-/Übersichts-Prüftabs geschlossen,
öffentlichen Artseiten-Prüftab für die weitere Hintergrundprüfung erhalten; Benutzer-Tab und native
Programme unberührt. Keine neue Katalogprüfung, FN-Erfassung oder Taxonomieaktivierung. Gesamtaudit
und native Restmatrix bleiben offen.

### 10.53 Wendehals-Layout, Abschlusskachel und native Fortsetzung – 23. Oktober

Felix beauftragt die Korrektur der verdeckten Kartenüberschrift beim Wendehals und die feste letzte
Position von „Weitere Tiere“. Anschließend gibt er Lightroom-/Explorer-Bedienung wieder frei und
bestätigt „ist frei“. Die vorherige native Bediensperre ist damit aufgehoben; Hintergrundbrowser weiter
nur in eigenen unsichtbaren Prüftabs. Keine allgemeine Veröffentlichung oder Bereinigung daraus abgeleitet.

**A-56 im CMS gespeichert und öffentlich nachgeprüft:** Bestehenden Überschriftenblock auf Kartenbreite
erweitert. Einmal Speichern, sichtbares Speichernende und Editorende geprüft. Unabhängige öffentliche
Neuladung: Überschrift `50 / 2 / 52 / 26`, Karte `51 / 2 / 52 / 26`; Überschrift X 51,1875 / Y 404,03125 /
Breite 1.162,625 / Höhe 29,53125; geladenes Kartenbild beginnt Y 440,34375. Positiver Abstand
**6,78125 Pixel**, vollständige Überschrift auf einer Zeile, kein Seitenüberlauf (1.265/1.265 bei
1.280 × 720). CMS-Mobilvorschau ebenfalls ohne Überdeckung; keine physische Handyabnahme.

Squarespace passt beim Speichern Textrasterhöhen an: 22 Blöcke, zehn berechnete Rasterzuordnungen
geändert, Desktop-Zeilenzahl 42 → 51. **Alle 22 rohen Textarrays exakt unverändert**, einschließlich
bereits vorher vorhandener `data-rte-preserve-empty`-Attribute. Die anders lautende Beobachtungsformulierung
im ersten technischen JSON wird hiermit korrigiert; Originalbeleg bleibt erhalten. Rohtextbindung SHA-256
89331663c4025958f0170730472d057bd84b915f3b50284ce9e2de0743cab407. Kein Text, CSS oder Root-JavaScript
im CMS geändert. AX-Reihenfolge Karte/Quelle vor Überschrift unverändert; kein Screenreader-Abschluss.
Unabhängiger Agentenreview bestätigt Rohtextgleichheit, visuellen Erfolg und verbleibende Grenzen.

Originale Desktop-/Mobilbilder und vollständige AX-Texte, sechs Hashes passend:
`17542c71-f05a-4ba9-9c8c-f5f8f6c828ca/wendehals-map-layout-proof.json`, SHA-256
1f55e961d3d97e5930b29a59fe791a3c455627a01de260f6702ce5a56f625f01;
öffentliches Nachherbild `heading-public-after.jpg`.

**A-57 reproduziert und lokal korrigiert:** Tatsächlich geladenes `sort.js?v=1.0.1` zeigt Weißstorch →
Weitere Tiere → Wendehals → Wintergoldhähnchen. Ausschließlich die vollständige normalisierte Bezeichnung
„Weitere Tiere“ erhält im vorhandenen Vergleich die letzte Position; alle übrigen Kacheln bleiben deutsch
alphabetisch/numerisch und stabil. Ähnliche Namen sind keine Abschlusskachel. Beobachter und Ladezeitraum
unverändert. Direkte Tests führen das tatsächliche Skript aus: Fehlreihenfolge, Schreibweise/Leerzeichen,
ähnliche Namen, echte Artensortierung, Wiederholung ohne Schleife und spätes Nachladen. Gegenprobe vor
Korrektur **1/6** mit fünf erwarteten Fehlern, danach **6/6**; zusammen mit Squarespace-VM-Fällen **12/12**.
Root registriert den Test in `test:quality-tools`, Footer bereitet Sortiercache **1.0.2** vor.
Registrierte Gruppe **31/31** bestanden, keine Fehler/Abbrüche/übersprungenen Tests, vier Quellen unverändert.
Das Vollgate **50/1.993** stammt vor diesen Änderungen und wird nicht als neuer Gesamtlauf ausgegeben.

Rote Gegenprobe `c350e22a-10d6-463e-abb4-97ff26ca5205/sort-red-result.json`, SHA-256
5e21ecdbb18a636442674a389dbc0b6e0cd828c09b957969bef3b92a967dc28f;
grüne Gegenprobe `dedb97d3-2e58-4e7d-9733-919950e5395b/sort-green-result.json`, SHA-256
e8a5262acd373b9d1933fdcf1cf086692da22234fc9e98f792e6b6501156fd12.
Registrierter Gruppenlauf `20b412c9-5cd3-4d95-b1f1-825b90a83e28/quality-tools-integration-result.json`,
SHA-256 2c68b9494f24a2d8cd8f548ac92888d9406dd8d89254e0d0648f683bf291bded.
Fehlende TAP-Parserzähler dort aus dem vorhandenen Node-24-Log nachgelesen, kein Wiederholungslauf: 31/31.
Live-Sortierbild/AX, präzisierter Rohtextvergleich und gelesene Zähler:
`7ceefe28-eabc-43d1-a13d-e9b39382182b/website-proof-clarification.json`, SHA-256
a537d6ded7971d56aeb55b55c027c86d732f5b29955509884351b1814a385177.
Sitzungen geschlossen, keine Operationen/Helfer/Fehler. Eigene Prüftabs geschlossen; Benutzer-Tab erhalten.
**Sortierkorrektur nicht veröffentlicht:** kein Footer-Speichern, Commit/Push oder Pages-Deployment.

**Native Fortsetzung:** Hauptkatalog frisch `D:\Lightroom Katalog\Lightroomkatalog aktuell.lrcat`;
reguläre **0.4.24.39** aktiviert am exakten Produktivpfad, keine private Identity-Audit-Registrierung
unter den fünf sichtbaren Manager-Einträgen. Beleg
`6924ba41-542d-47e9-9d2d-3cf226f07754/native-observation-proof.json`, SHA-256
17ebc0726cd224ce04426c09928306c47023abeab79584d50e3ee10155ca6023.
Explorer regulär geschlossen, über bestehenden Desktopstart neu geöffnet und neues Fenster bestätigt.
Nativ „Neu lokal aufbauen“ und „Lightroom jetzt schließen“ gewählt: neuer Ersatzauftrag
`update-5a51642e-0718-473a-9c78-b4f575171a4f`, 17:25:31.063 UTC, frische FN-Erfassung für bestätigten
vollständigen D-Katalogsatz; altes Rezept/alte Historie unverändert gebunden. Anforderung
`capture-request-21ffcf2b-d8f9-4569-ab6d-d2fbed6937a3`, normales Schließen seit 17:26:39.101 UTC vorgemerkt.
Zunächst mehrere Minuten pending ohne sichtbare Erfassung. Einmaliges reguläres Plug-in-Neuladen um
17:34 UTC startet sichtbar „FN-Katalognutzung erfassen“. Kein konkurrierender Scan oder zweiter Auftrag.
Neue Quittung vom 17:37:57.154 UTC: **127.427 Katalogeinträge, 7.246 FN-Zuordnungen**; an genau diese
Anforderung und Erfassungsrevision gebunden. Danach normales Lightroomende per Alt-F4/Ja bestätigt;
frische Fensterliste enthält kein Lightroom mehr. Kein produktives Foto-/Stichwortschreiben.
Anforderung nach regulärem Ende um 17:42:33.988 UTC abgeschlossen und mit Nutzungsrevision
`49dba731e8a1cfca189ea7d04e286797f13bc9d04a57324baba7cffc2a453ed2` registriert. Die 7.246 Zuordnungen
summieren sich über 68 Taxa passend. Neuer Workflow seit 17:42:35.064 UTC `building/build`,
`buildStarted:true`; nativ Schritt 2, Eingangsstand sichern. Noch kein gebundener Kandidat oder Paarwechsel.
Bisheriges Paar bleibt bis zum Schutzabschluss aktiv.

**Watcherverzögerung eingegrenzt, Ursache offen:** Unabhängiger Quellenreview bestätigt gemeinsame
Toolkit-ID/Prefs von Original und privater Testregistrierung. Ein spätes privates Shutdown kann den
gemeinsamen Generationswert erhöhen und einen bereits gestarteten Original-Watcher beenden; die private
Initialisierung startet im Hauptkatalog wegen ihres Guards keinen Ersatz. Alternativ könnte ein erfolgloser
Helferversuch die Request-ID für diese Generation als versucht merken. Keine tatsächliche Hookreihenfolge
oder Fehlermeldung dafür gesichert, daher keine behauptete Ursache oder allgemeiner Produktdefekt.
Die reguläre Neuladung startet eine neue Generation; frische Request-/Katalogprüfungen vor Submit bleiben
wirksam. Keine Plug-in-Änderung während der laufenden Erfassung. Rein lesender Beleg mit 15 unveränderten
Quellhashes `37a7fed9-9781-419e-bad8-e874fdd0a7de/catalog-usage-watcher-readonly-review.json`, SHA-256
ced3ed801800ed11fcb5ec1b17f83be89d26e2a707d159aa8cd42ba65a17ade4; Sitzung geschlossen, keine Fehler.

Dokumentverweise nach Integration: 80 Markdown-Dateien ohne fehlende lokale Verweise, Exit 0;
`cf10973d-93be-40ac-a4bb-bfe4a09088f6/documentation-check.json`, SHA-256
c7d237dfeff40905e0393b6dc5edf5843173fbe07b44ca4f847b13a30ae6f818. Das ist keine Funktionsabnahme.

**Unabhängiger Abschlussreview der Websitearbeiten:** Rohtexte 22/22, sechs Bild-/AX-Dateien und
vier aktuelle Sortier-/Test-/Footer-/Registrierungsquellen passen zu ihren gebundenen Hashes. Visueller
Liveabschluss A-56 und nur lokaler Stand A-57 korrekt getrennt. Nachladen ist innerhalb des bestehenden
achtsekündigen Beobachterzeitraums geprüft; danach keine zusätzliche dauerhafte DOM-Überwachung behauptet.
Ein benachbarter veralteter A-55-Tabellenverweis auf A-56 ist korrigiert. Keine neuen Tests oder Abrufe.

**Aufbaustart dauerhaft gesichert:** Tatsächliches Explorerbild und AX mit „Relevante CoL-Taxa werden
gelesen“, Workflow/abgeschlossene Erfassungsanforderung/neue Quittung sowie alter Paarzeiger und altes
Rezept unter `d68b1f49-179e-4176-8f8c-98e5caf2056f/taxonomy-restart-native-proof.json`, SHA-256
b9345b4d3c922ed0b29696fc33ed0bb009984505686a6d5aa9dce107cf9182ff. Sitzung geschlossen ohne Fehler.
Altes Rezept weiterhin exakt ff3e8a3cea184281efa4a9aa227e01d3d8621567ae0f7e99422ca80f76a92fca.
Der alte Jobzeiger bleibt laut Quellenablauf bis zu vollständig gesicherten/geprüften neuen Eingängen
unverändert; sein alter Fehlerstatus ist kein neuer Laufabbruch. Während der Dateibindung stieg die CPU-Zeit
des frisch identifizierten Explorer-Hauptprozesses von 356,71875 auf 426,11 Sekunden; danach erfolgte nativ
der Übergang von „Eingangsstand sichern“ zu „Relevante CoL-Taxa werden gelesen“. Kein Stillstand daraus belegt.

Um 17:51:26 UTC entsteht der neue Aufbauordner `job-f2d09fb1-4008-41a2-b55b-65807c0c4232`.
Anschließend CoL-/fünf Anbieter-JSONL-Dateien vorhanden, nativ Übergang zu „Eingangsstand prüfen“.
Rezept und neuer aktueller Jobzeiger sind bis zum Ende dieser Prüfung noch nicht geschrieben;
ein unvollständiger Eingangsordner wird nicht als fortsetzbarer Auftrag oder erfolgreicher Kandidat gewertet.

**Zusätzliche enge lokale Browserabnahme der vorbereiteten Taxonomie:** Vorhandenen ausschließlich
lesenden Vorschau-Server in eigener verwalteter Sitzung auf zufälligem Loopback-Port gestartet.
Erster abgeschirmter Server im IAB nicht erreichbar, regulär beendet; danach derselbe vorhandene
Server außerhalb der Sandbox erreichbar. Keine Firewall-/Sicherheitsänderung. Tatsächliche Vorschau
Wendehals, Mobilvorgabe 390, äußerer Frame clientWidth 388: vollständige siebenzeilige Taxonomie
und Artzeile **Jynx torquilla** im Originalbild sichtbar. AX enthält das volle Binomen und benannte
höhere Ränge. Kinddokumentbreiten im verfügbaren DOM-Lesescope nicht zugänglich; fehlende Werte
nicht als Überlauf/Fehler gewertet. Kein Audio abgespielt. Keine öffentliche Squarespace-, physische
Handy- oder Screenreader-Abnahme daraus abgeleitet; Suche/Zoom/Sortierung sind in dieser Vorschau nicht geladen.
Neun Vorschau-/Modul-/CSS-Quellen vor/nach exakt unverändert. Eigener Tab und Server regulär geschlossen.

Originalbild/AX `df6c9663-58c1-4c50-ad19-5cf7df5d48eb/local-responsive-proof.json`, SHA-256
9ef8938325b54320a2a3b42e08a70b47630ae63f6edcbbb3aa2c61f6c423cfef;
Quellbindung `09b443f2-4489-4d7a-bd86-443f6c0ba382/preview-binding.json`, SHA-256
fb2f72ca60e0b1f307607ccfc0b9e2636cfe9c5fd403a5b164c1dd3e57ee851c.
Beide Sitzungen geschlossen, null Operationen/Helfer, keine Abschlussfehler. Vollständige Stilprüfung
bestanden; neue vorbereitete Root-Sortierung bleibt gegenüber dem alten Gesamtgate gesondert geprüft.

### 10.54 Vollständige Websiteprüfung und unabhängige Restproben – 23.–26. Oktober

**Ergänzte Freigaben:** Felix verlangt jede öffentliche Seite vollständig in Desktop-, Tablet- und
Mobilansicht; auffällige Gestaltungs-/Inhaltsunterschiede zunächst mit ihm abstimmen. Sortierung nach
bestandener Prüfung veröffentlichen; anschließend alle Websitearbeiten einschließlich der vorbereiteten
Binomen-, Suchfeld- und Zoomkorrekturen starten. Weitere Lightroom-/Explorer-Tests ebenfalls starten,
aber Lightroom bleibt bis zum geschützten Taxonomie-Paarwechsel geschlossen. Eigene getrennte Explorer-
Fehlerprobe und reine Lightroom-Testvorbereitung können unabhängig laufen. Keine pauschale Veröffentlichung
des übrigen lokalen Audit-/Plug-in-Stands daraus abgeleitet.

**Websiteumfang:** Gebundener Bestand vom 23. Oktober: 137 Sitemapseiten, darunter 63 Artseiten,
61 Reiseseiten und 13 weitere Seiten; zwölf Seitentypen. Drei Ansichten ergeben **411 Prüfstellen**,
zusätzlich vier bekannte Pfade außerhalb der Sitemap mit zwölf Ansichten. Vollständige vorbereitete
Matrix `24d90515-ae83-4b43-996a-2e3adf969c07/website-three-view-preparation.json`, SHA-256
237f61fda3d6183566e52b775ad5ee6273d2527775478e942495477a7a08b86c. Alle 411 Einträge zum
Vorbereitungszeitpunkt ausdrücklich `not-rendered`; bisherige HTTP-/Stichprobenbefunde ersetzen keine
Sichtabnahme. Geplante Browsergrößen: 1.280 × 900, 768 × 1.024 und 390 × 844 CSS-Pixel; keine physische
Touch-/Screenreaderabnahme. Der Alternativtext-Workflow, neue Artseiten samt Texten/Bildern und Android-App
bleiben die vereinbarten Folgeaufträge nach dem Audit.

**Neues Aufbaurezept:** Job `job-f2d09fb1-4008-41a2-b55b-65807c0c4232` und Rezept seit
18:21:26.355 UTC dem neuen Update korrekt zugeordnet. Unabhängig neu berechnete Rezeptrevision stimmt;
`unused-classification-retention-v1` an frische Nutzungsrevision 49dba731… und genau 68 geschützte
Masterkennungen gebunden. Beleg `a82e6838-e374-45e9-8ddb-a49652efd4b4/new-build-recipe-proof.json`,
SHA-256 0bd94baecdcc2e4c40a5f326e9be7e0ec5406ff40af81c69abf0f2b09578fe39. Lesender Zwischenstand
18:40:46 UTC: 273.674 Kandidatentaxa geschrieben, Suchindex 1.528.000/6.223.479; weiter `building`,
kein erfolgreicher Paarwechsel behauptet. Keine zusätzlichen großen Datenbanklesungen.

**Lightroom-Mehrblockprüfung vorbereitet:** Neuer eigener Savedmode-Kern koppelt tatsächlichen Planer,
rohen Statistikindex und vollständiges fachliches Aggregat über 250 + 3 + 250 + 3. 56/56 synthetische
Gegenproben; Quellbindungen unverändert. Beleg
`f3b1f177-6be9-4999-b920-3242bf00c42b/preparation-result.json`, SHA-256
e2f74a26287c3361f8e9e80d5cf5fbb8e675d218d1629d1fef696c5a947fb0b6. Sitzung geschlossen;
`nativeReady:false`: begrenzter 254er-Katalogleser, tatsächliche SDK-UUID-/Baselinebindung und überprüfter
Pausehaken bleiben vor der eigenen nativen Probe erforderlich. Kein Produktivkatalog gelesen oder verändert.

**Beschädigter Kartenimport jetzt tatsächlich über die Oberfläche abgenommen:** Eigene vollständige
künstliche Amsel, unveränderte aktuelle Runtime. Genau eine Dateiauswahl und ein automatischer Vorschau-POST:
HTTP 400 nach abgeschlossenem FFmpeg-8.1.1-Decoderfehler. Vollständige verständliche Ablehnung sichtbar,
„Karte ersetzen“ deaktiviert; alle 13 gespeicherten Dateien einschließlich sechs Assets und alle 249
Original-/Kopiequellen bytegleich. Eigenen Tab/Dialog geschlossen, Runtime regulär Exit 0; Sitzungen geschlossen.
Beleg `457364f4-fc9d-4dea-a51c-7ebfb0bb6d64/corrupt-image-ui-acceptance-result.json`, SHA-256
e4b2eb04853b708384d258df44de49dcb4b94884497ccd8d64f299a1d9b9eef2. Kein Produktivbestand verändert.

**Vier Websitekorrekturen veröffentlicht, Zoomabnahme findet Restfehler:** Enger Zehn-Dateien-Kandidat
98790017… mit 22/22 neuen Verhaltenstests und unabhängiger Prüfung. Zunächst lehnt die automatische
Freigabeprüfung das gemeinsame Verschieben von main wegen zu weiter Veröffentlichungsfreigabe ab.
Felix bestätigt anschließend ausdrücklich „Ja, alle vier Websitekorrekturen veröffentlichen“; erst danach
lease-geschützter Wechsel von Remote-811 auf **0db6a69fd061307b7c96d8cb30b897c58b3dc799**.
Keine übrigen lokalen Plug-in-/Backend-/CI-/Auditänderungen veröffentlicht. Commitumfang **10 Dateien,
392 Ergänzungen/20 Entfernungen**; Qualitäts-, Artefakt- und Deploymentjob von **40006195707** erfolgreich.

Vier öffentliche Pages-Dateien HTTP 200 und jeweils exakt Kandidaten-SHA-256:
`ea865441-c061-453c-bf3c-805d15187228/public-pages-module-proof.json`, SHA-256
2928ebb4ce5bca6b6b8388c1a81c68a464a95ef04e51011305d95abada03ab87.
Aktuellen CMS-Footer frisch gesichert/unmittelbar vor Eingabe erneut gleich; ausschließlich vier Cacheversionen
geändert, vorhandene zehn Skripte und deren tatsächliche Reihenfolge erhalten. Ein Speicherklick, danach
Speichernende und unabhängige Neuladung: Kandidat exakt gespeichert. Öffentlich Taxonomie 1.0.9, Suche 1.0.3,
Sortierung 1.0.2 und Zoom 1.0.8 geladen. Sortierabschluss, Suche mit `1 Treffer`, Escape-Leerung und Enter zum
richtigen Wendehalslink sowie volle Artzeile `Jynx torquilla` bestätigt. Keine Screenreaderabnahme daraus.

Echter Zoom erreicht den benannten Dialog mit Fokus `gz-close`, Tab/Shift-Tab bleiben dort, Bild lädt mit
2.500 Pixel Breite. **Einmalige Escape-Tastensequenz schließt dennoch auch die CMS-Galerie (A-58).**
Kontrollweg über eigenen Schließenknopf erhält Galerie und Fokus am Zoomknopf. Erste Zoomaufnahme zeigt
noch den Ladeanfang; der spätere geladene Bildzustand ist separat gemessen. Keine vollständige Zoomabnahme.
Originale CMS-/öffentliche Bilder, AX, DOMzustände, Freigabe und GitHubbindung unter
`b0bd5910-746d-4610-a8ef-60352e8b17c7/website-release-ui-proof.json`, SHA-256
90219577c71bb3ad77ea6976f9a613b0dda250f8d3177f0a8239dcf6b41826c9. Sitzung geschlossen ohne Fehler.

**Zoomnachfix abgeschlossen:** Enger Vier-Dateien-Commit **fae6d4f77fa7e73214b67946bbdd0eacc17064f8**,
Pages **40009956926** mit erfolgreichen Qualitäts-, Aufbau- und Deploymentjobs. Zoom 1.0.9 ist öffentlich
bytegleich d27a13f3b65c6df1e9a09ba84807c4bf67b6a0dc62a710705dfc9bab9bd2c062.
Gekoppelte RED/GREEN-Probe und registrierte Gruppe **37/37**; genaue Gruppengrenzen im technischen
Ergebnis `0c61bc9d-fff0-4f05-866d-2704cce0c4dc/zoom-escape-fix-result.json`.
Unabhängige CMS-Neuladung bestätigt ausschließlich den Wechsel 1.0.8 → 1.0.9. Echter Dialog mit geladenem
Bild, Tab/Shift-Tab und erster vollständiger Escape-Sequenz: Fokus zurück am Zoomknopf, `itemId` erhalten,
Hintergrund nicht mehr inert; nächster Escape schließt die Galerie. Eine zunächst darunter geöffnete Karte
begrenzt die erste Bildserie; frische unverdeckte Wiederholung zeigt die Rückkehr zum selben Wendehalsfoto.
Kein daraus behaupteter Kartenfehler.

**Neun Ansichten geprüft, freigegebene Layoutfehler veröffentlicht:** Kontakt, Über uns und Ausrüstung
vollständig in allen drei Größen aufgenommen. Die fehlerhafte Vollseitenfunktion ist eine Werkzeuggrenze;
normale überlappende Originalaufnahmen reichen jeweils vom Anfang bis Ende. Zunächst **32 Originalbilder**
unabhängig geprüft; vier konkrete Fehlergruppen gefunden. Felix genehmigt Korrektur und Veröffentlichung
von Kontakt-/Footer-/Ausrüstungsüberlagerungen und abgeschnittenen Mailadressen; Wortumbrüche und Fotos
mit beiden Personen sollen zusätzlich vorbereitet werden.

Gespeicherter Ausgangsstand frisch unverändert; nur begrenzte Regeln ergänzt. Öffentliche CSS-Version 45
zeigt zusätzlich CMS-Division in `grid-row`-Kurzformen. Endgültige Version **46** verwendet Start-/End-Langformen,
erhält beide vorhandenen LESS-Ausnahmen und ist nach unabhängiger CMS-Neuladung exakt bestätigt.
Öffentliche Datei HTTP 200, 11.473 Bytes, SHA-256
9bcfd6690b20531cf83e74c0d70caa352b9a2aceeb799e750a7230cc4cfa8119, keine Compilerfehlermeldung.
Unabhängige tatsächliche Sichtprüfung **9/9 Zellen, 33/33 Original-JPEGs**: Kontaktabstand Desktop/Tablet
11 px, Mobil 39,15625 px; Credit/Spenden überall 11 px; beide Mailadressen vollständig sichtbar;
**42/42** Produktüberschrift-/Textpaare ohne Überlagerung, mindestens 11 px. Keine neue sichtbare Regression.
Die bekannten Wortumbruch-/Fotoausschnittfragen bleiben davon getrennte Vorbereitung.

Technische Originale unter `8f89b513-d7ff-4826-a4b3-12ca0232f52f/`, insbesondere
`layout-v4-delivery.json` (SHA-256 4103e29d9892be51d6e54b9c654b570e3495756c1f159e9943e13afb81cde16e),
`layout-cms-v4.txt`, `public-custom-css-46.txt` und `zoom-109-clean-return.jpg`.
Die neun Zellen belegen ausschließlich diese drei Seiten. Formularfunktion, weitere Bedienfälle und physische
Touch-/Screenreaderprüfungen sind damit nicht erledigt. Keine Testnachricht abgesendet.

**Weitere unabhängige Vorbereitung:** Der 254er-Leser und private 250+3-Pausehaken bestehen 35 und 46
synthetische Prüfungen (`3b39f49f-3e48-4ec2-be7f-16a8fb2afe13/preparation-result.json`). Ein unabhängiger
Review findet danach einen ignorierten privaten Arming-Fehler; neuer nur privater Kandidat hält vor dem
ersten Foto-Schreibblock an: erwartetes RED, anschließend 20 GREEN-/Vertragsprüfungen
(`956db16e-1755-4669-95a0-f4842f2014e5/preparation-result.json`). `Workflow.prepare` kann vorher leere
Stichwortobjekte anlegen. Vollständige tatsächliche Modul-/SDKbindung und Undo-Gate bleiben erforderlich;
keine native Bereitschaft oder Lightroom-Abnahme daraus abgeleitet.

Der erste Taxonomiekandidat ist seit 19:05:16 UTC `ready`; automatische vorgemerkte Klassifikationsfälle
lösen anschließend den vorgesehenen Folgeaufbau aus. Workflowzeitstempel ist kein Fortschrittsheartbeat;
alter fertiger Jobzeiger bleibt bis zum gesicherten neuen Eingangsstand erhalten. Kein neuer Paarabschluss
belegt. Lesender Quellenreview `955e3748-432b-4e21-a68b-2ab41a79c435/automatic-followup-source-review.json`.

**Dokumentationspflege:** Roadmap von 2.316 Zeilen auf einen knappen aktuellen Einstieg reduziert;
vorherige lokale Fassung als technischer Originalbeleg `roadmap-before-trim.txt` erhalten, keine zweite
Verlaufsdatei. Historische Nachweise und Fachverträge bleiben führend. Die ausdrücklich beauftragte
Dateibereinigung steht unmittelbar vor dem Gesamtabschluss, nicht während laufender Prüfungen.

**Veröffentlichung und weitere Sichtprüfung:** Referenzcommit **5bfe3a6c976ffe1c1227f796f6436e91bb7ea2db**
enthält ausschließlich CSS-Referenz, Footerreferenz und Website-Prüfvertrag. Pages **40015107621**:
Qualität, Artefakt und Deployment erfolgreich. Lokale Stilprüfung und 80 Dokumentverweise bestanden;
kein neues lokales Gesamtgate oder Gesamtabschluss daraus abgeleitet.
Zusätzlich Home/Spenden (28 Originale), Reise-/Wildlifeübersicht (44 Originale), Impressum/Datenschutz
(39 Originale), Griechenlandübersicht (24 Originale), Mykene (17 Originale), Olympia (15 Originale),
Delphi/Meteora (46 Originale), Athen/Sonstiges Griechenland (50 Originale) und Wendtorf/Sizilien
(29 Originale) sowie Sonstiges Wendtorf/Haithabu/Lütjenburg (55 Originale) jeweils vollständig in drei Ansichten
unabhängig angesehen: zusammen mit den nachstehenden Sizilien-/Kretaseiten und den zwölf weiteren
Reiseseiten, vier Artenlisten und den nachstehenden Artseiten vom 24. Oktober insgesamt
**411/411 Sichtstellen**, alle 137 Sitemapseiten in drei Ansichten vollständig gesichtet. Zusätzlich sind
die vier ergänzenden Einstiegspfade in allen zwölf Ansichten gesichtet. Die Grünfink-Tabletlücke ist mit
zwei überlappenden Nachaufnahmen geschlossen. Aufnahmen ohne abgeschlossene Originalsichtung werden
nicht mitgezählt; die nach dem Neustart gebundenen Restnachweise stehen am Ende dieses Abschnitts.
Diese Zahl zählt Sichtprüfung mit Befunden, keine Funktionsfreigaben.
Home/Tablet beginnt bei Y=1 px; übrige Folgen ab Y=0, alle überlappend bis Ende. Zwei zunächst ungeladene
Desktopheros nach bestätigter Bildladung oben ergänzt; kein dauerhafter Ausfall. Technische Lieferbelege
`site-pages-003-005-delivery.json`, `site-pages-006-037-delivery.json` und
`site-pages-104-105-delivery.json` unter der gebundenen Sitzung 8f89b513…; Befunde A-61 bis A-63.
Die drei griechischen Seiten sind in `site-page-007-delivery.json`, `site-page-008-delivery.json` und
`site-page-009-delivery.json` gebunden. Mykene und Olympia zusätzlich tatsächlich mit der Tastatur in
Mobilbreite bedient: Enter öffnet das erste Bild, Rechts/Links wechseln zum zweiten/zurück, Zoom erreicht
das geladene Bild; erster Escape erhält Galerie und `itemId`, zweiter schließt die Galerie. Erste Olympia-
Zoomaufnahme liegt noch in der Einblendung; `olympia-mobile-zoom-loaded.jpg` belegt den vollständig sichtbaren
2500-Pixel-Bildzustand. Keine physische Wisch-/Pinchprobe. Kleine Text-/Gestaltungsfragen als A-65 erfasst.
Weitere Lieferbelege `site-pages-010-011-delivery.json` und `site-pages-012-013-delivery.json`; unabhängige
Originalreviews `1ae8edd4-1bf1-4da4-823b-7091544a57a2/delphi-meteora-six-cell-original-review.json`
(d7353e62691b462e6537dda4c0de221ce37a682fdf232233ee4f88008ea827ec) und
`a06efd36-cd8b-4ec7-8d71-152bc7c5aef5/athens-other-greece-six-cell-original-review.json`
(e46b3c9cae84da99b372009783a38967d8ef68cc3eff8051a493a818f9ebc9ed).
Noch blass erfasste Desktopkacheln zusätzlich nach bestätigter Bildladung aufgenommen und von Root angesehen:
`meteora-desktop-bottom-ready.jpg` / `greece-other-desktop-bottom-ready.jpg`. Kein dauerhafter Bildausfall.
Wendtorf/Sizilien: `site-pages-014-015-delivery.json` und unabhängiger Review
`bfa32783-a0d0-4865-af1a-81a36468200f/wendtorf-sicily-six-cell-original-review.json`
(388ca9ec67cd04fdc93d967e2359f522a793770c209c5994fe2a1a69c0822ce9). Sizilien-Tabletüberlagerung A-67;
zusätzlich Wendtorf „nicht passenden war“ sowie Großschreibung/Kommas im Sizilienhinweis redaktionell offen.
Frisches DOM `sicily-tablet-layout-source.json` belegt die geteilten Rasterzeilen; keine Korrektur veröffentlicht.

**Zusätzlicher Entwurf fertig, anschließend ausdrücklich freigegeben:** Lokale V3-CSS
`2f30bd92-2681-4064-8c6c-86551292c0cb/heading-photo-design-v3.css`, SHA-256
70acad48e1d2cad6d4690e796db41df39f0d928093ea582891fae662c9eb6760.
V1 vollständig in neun Zellen angesehen; nach Korrektur des mobilen Zuschnitts und der Abstände V2 in
vier betroffenen Zellen und V3 nochmals in beiden Mobilzellen unabhängig nachgeprüft. Beide Personen
vollständig sichtbar, ganze Wörter, keine neuen Überlagerungen. V3 unterscheidet sich von V2 nur durch
die auch mobil geltende obere Rasterpolsterung. Originalvorschau Felix gezeigt; Veröffentlichungsfrage
danach von Felix mit „Ja, Entwurf veröffentlichen und öffentlich prüfen“ beantwortet. Alle drei lokalen
Vorschauinstanzen regulär beendet und ihre Sitzungen geschlossen. Öffentliche Nachprüfung siehe unten.

**Folgeaufbau tatsächlich gestartet:** Aktueller Job jetzt `job-9fca39a9-248d-43f1-b8ce-fb1a7e0e5692`,
20:07:49.403 UTC, gleicher Updateauftrag. Neue Eingänge seit 19:26 lokal vorhanden; Rezeptrevision
c09a3ddc9d5c519ed587c5fdf80f88cb1491e2646ff4f57ad0d880ab95079cb5. Worker schreibt weiter;
native Anzeige bleibt beim vorigen Suchindex. Originale `taxonomy-followup-native-ax.txt` und
`taxonomy-followup-state.json` sichern diese Abweichung (A-64). Der Lauf bleibt ungestört.
Privater Undo-Guard inzwischen ergänzt und gezielt geprüft: erwartetes RED, anschließend 37 GREEN-/
Vertragsprüfungen, `1b367a68-5542-4b7e-8492-24d676d232f1/preparation-result.json`, SHA-256
a92903950f37a8ac156ceacef299e00a54ca3dfd6fdb402d73aed8c116eb4d87. Tatsächliche native Bindung weiter offen.

**A-64 isoliert eingegrenzt und Korrektur vorbereitet:** Der vermeintlich leichte Statuspfad öffnet weiterhin
die alte Staging-DB für synchrone Klassifikations-/Konfliktprüfungen; zusätzlich bevorzugt der Service seinen
alten Speicherfortschritt vor dem aktuellen Workerjob. Quellen und enge Gegenprobe reproduzieren alte 97 %
statt aktueller 4 %. Vier-Dateien-Kandidat verschiebt nur während des aktiven Aufbaus die Kandidateninspektion,
verwendet den aktuellen Job und behandelt Konflikte als unbekannt (`null`), beide Wechselrechte bleiben aus.
Nach `ready` gilt die vollständige bisherige Prüfung. Gegenprobe vorher 9/18, nachher 18/18; sieben bestehende
unveränderte Fachtests nach reiner Pfadumleitung 311/311. Belege
`880e3544-8dcc-4e4a-8f7a-03ff6c364a1b/review-result.json`
(SHA-256 c7723c002fc8d2611b22cc3faa6eea7f90b53f6d00410126d576900981800318) und
`b65d3f41-33c9-4cb1-a857-352eca6ad799/regression-result.json`
(6f4b356c02e1af0203c6d3ac82cdf0d400da68ecc1cd5fb1573ea29143f03ba2). Beide Sitzungen geschlossen.
Produktive SQL-Laufzeiten und der genaue Anteil am großen Lese-I/O sind nicht gemessen. Ein unabhängiger
Review grenzt den gemeinsamen Presenter bei künstlichem `completed+deferred` als zusätzlichen defensiven
Deckungsrest ab; kein kohärenter regulärer Servicepfad oder Aktivierungsbypass dafür belegt.
Service/Lifecycle sind rezeptgebundene Regeln; deshalb während des Aufbaus unverändert belassen.
Erst nach gesichertem terminalem Fehler von Job und Workflow lokal übernommen; der fehlgeschlagene Auftrag
bleibt unverändert mit seinem ursprünglichen Rezept als Beleg erhalten. Eine Fortsetzung unter geänderten
Regeln wird nicht erzwungen; der neue Wiederanlauf muss passende neue Bindungen erhalten.

**Neuer tatsächlicher Aufbaufehler A-66:** Folgejob und Workflow seit 20:46:03.136 UTC `failed` bei Prüfung
nach 273.495 geschriebenen Taxa: „Die Identitätshistorie der Retention wurde verändert.“ Publikationszeiger
frisch unverändert: master-20261013143021566 / lightroom-dd834fb15dbd6f1c3257. Native AX zeigt weiterhin den
vorigen Suchindex 97 %, kein Lightroomfenster vorhanden. Nur kleine gespeicherte Dateien gelesen, keine
Produktdatenbank und kein weiterer Statusscan; kein Neustart oder Paarwechsel. Beleg
`8f89b513-d7ff-4826-a4b3-12ca0232f52f/taxonomy-followup-failed-state.json`, SHA-256
6e22e3ca72905deac0ab49dd34e773a4624275638bf01aa96f1d38a899c4c248, samt
`taxonomy-followup-failed-native-ax.txt`. Unveränderte echte Builder reproduzieren den Fehler mit gültigem
Append, während die Kontrolle ohne Append gelingt:
`0cfd3059-9c6e-47a3-ad91-b99d935bb386/retention-registry-append-result.json`, SHA-256
7873d994a32d311582070c19c301535aa9cff43c2d249f70a92b34b4510d706e.
Isolierter Zwei-Dateien-Kandidat bindet historische Revision/Präfixlänge zusätzlich zur unverändert exakt
geprüften vollständigen Kandidatenrevision. Finalisierung erst nach Klassifikations-/Zurückstellungsplanung,
kein Umschreiben historischer Marker. 31/31 Prüfungen einschließlich alter Schutzfälle, ungültigem Append,
Präfixänderung, späterer Registeränderung und blindem Restempeln bestanden. Ergebnis
`2e8ab3dd-7a1e-4259-9949-356a8b199b0d/candidate-review-result.json`, SHA-256
c1d428ca14d028266d05a86299bd907f9b5b48a0f67cd0be6c9f35de3b05e31e. Dauerhafter Testkandidat erhält die
bisherigen 19 Testkörper unverändert und ergänzt zwölf Fälle. Root und unabhängiger Agent haben Quellen-
und Testdiff gelesen; kein blockierender Befund. Beide Korrekturen nach vollständiger Hashprüfung von elf
Ziel-/Kandidatendateien lokal übernommen, davon sechs Quellen und fünf vorhandene Testdateien. Job, Workflow
und gemeinsamer Aktivzeiger vor/nach exakt unverändert. Beleg `taxonomy-repair-integration.json` unter
8f89b513…, SHA-256 ba98a7081646c39fc88ac5a3f0ce89c40393c638a33b5ebbde7da716e5ead1b6.
Gemeinsame Regression **186/186** bestanden; anschließendes vollständiges lokales `quality:ci` mit
**50 Gruppen / 2.034 bestandenen Tests**, null Fehler/Abbrüche/übersprungene Fälle. Erster abgeschirmter
Versuch scheitert an EPERM beim eigenen Verzeichnislink der bestehenden Prototypschutzprobe; unveränderter
Gegenlauf außerhalb der Sandbox vollständig erfolgreich, keine Windows-/Testschutzregel geändert.
Protokolle `taxonomy-repair-targeted.txt`, `taxonomy-repair-full-quality.txt` und
`taxonomy-repair-full-quality-retry.txt`; Zusammenfassung `taxonomy-repair-checks.json` unter 8f89b513…,
vollständiger Gegenlauf SHA-256 19f9ddcbcabb22a37ca8acfd3dd4fa1bb1aacc0a90cf0073192a54931dea813d.
Anwendung regulär geschlossen und von Felix über seine normale Desktop-Verknüpfung wieder geöffnet;
jetzt nativ der tatsächliche Aufbaufehler sichtbar. Kein neuer Aufbau oder Paarwechsel; kein erzwungenes
Beenden. Die frische Wiederanlaufvorschau scheitert zunächst an der gesonderten Manifestgrenze A-68.
Die Prüfung wird weder entfernt noch durch bloßes Neudatieren eines Nachweises ersetzt.

**Native Mehrblockprobe weiter abgesichert vorbereitet:** Genau 254 eigene physische JPEGs sind vollständig
mit FFmpeg 8.1.1 decodiert, aber noch nicht importiert. Neuer privater Lifecycleentwurf behält den echten
FN-Metadatennamespace bei und bietet nur einen doppelt bewachten Artänderungseinstieg an. Init/Shutdown
laden und verändern keinen Nutzungs-Watcher. Vollständiger Plan bindet 55 Lua-Dateien; 3 erwartete RED-
und 52 GREEN-Prüfungen (46 Verhalten, sechs Syntax) bestanden. Ergebnis
`c9fbcdca-1eca-43a8-9001-a560cd5d6d23/private-lifecycle-preparation-result.json`, SHA-256
88daaa749282b421815f1ee6b55f7a26a6a0f7fdcd22914366a0d0b43df6ad6f. Unabhängiger Quellenreview bestätigt
55/55 Bindungen und den watcherfreien Einstieg, findet aber eine zusätzliche offene Apply-Resume-Grenze
vor `process/applyNext`. Neuer isolierter Guard wird vorbereitet. Die frühere Aussage zur vollständigen
Unterscheidung leerer JSON-Listen/-Objekte war zu weit: Lua `Json.decode` erhält diese Unterscheidung nicht;
`Json.null` bleibt separat. Original-JSON-/Token-/Schemaschutz des Saved-Prüfers und tatsächliches privates
`searchRoot`/Journalziel müssen ausdrücklich gebunden werden. Keine native Bereitschaft daraus abgeleitet.
Geteilte Einstellungen bleiben insbesondere für `tempCleanupWarning` bei Bereinigungsfehlern bestehen.
Keine Assembly, Registrierung oder SDK-Nutzung; Pfad/Katalog/Helfer/254 Fotoidentitäten und bestätigter
253er-Lauf müssen noch tatsächlich gebunden werden. Private Entwurfsversion .40 ist nicht geladen;
produktive .39 bleibt unverändert, `nativeReady:false`.

Zusätzlicher privater Apply-Resume-Guard vor `process/applyNext` ist isoliert ergänzt und unabhängig
quellgeprüft: 238 GREEN, frühere echte REDs und historische Prüfungen getrennt ausgewiesen. Ergebnis
`ef6ddd4b-f78b-40ae-aec4-dea169dcc3cf/final-preparation-result.json`, SHA-256
3b0091885a02b536c5000af9a6d93173980756dce2abe26a4d988a66920c0b65. Tatsächliche 55er-Bindung,
effektive private Such-/Journalziele und geladene Laufzeit weiter offen. Die leere-Container-Grenze ist
zusätzlich mit einem nur privaten Node-Readerkandidaten abgesichert vorbereitet: 27 GREEN plus erwartetes
RED am Vorgänger; exakter Planbody-Digest und gespeicherter Token werden vor History-Rückgabe geprüft.
`640c4e21-3842-4562-9319-04a2d0b48f8e/preparation-result.json`, SHA-256
98d89c5ddbd27d972da40e0433f664c30da61dccd196f625685455306787731d. Kein Produkthelper geändert oder
privater Helfer installiert. Ein vollständig neu erzeugter anderer Token muss weiterhin an der exakten
Root-Planbindung scheitern; Roh-Whitespace ist keine Integritätsgrenze.

**Sizilienentwurf vorbereitet, nicht veröffentlicht:** Eine 210-Byte-Regel gibt dem Titel ab 768 px genau
eine eigene mitwachsende Rasterzeile. Drei tatsächliche CSS-Größen und alle 16 Original-JPEGs unabhängig
geprüft; Titel/Hinweis/Knopf jeweils rund 10,993 px getrennt, Mobilraster unverändert. Lokaler HTML-Replay
mit Sendesperre/CSP ist kein öffentlicher Funktionsnachweis; fehlender lokaler Spendenbereich bleibt eine
Replaygrenze. Konkrete Tablet-Vorschau gezeigt, Veröffentlichungsantwort offen. CSS-Kandidat
`1be6c4c5-8d01-4feb-bc5e-d04c71b14fba/sicily-heading-row.candidate.css`, SHA-256
3b6481044f37f7d0cbca4f1826c6330eff6e5311a3ad8a46375921652e8a6633. Alle Vorschauprozesse regulär beendet,
null offene Operationen/Helfer; unabhängiger Beleg
`39386b97-537b-422a-8de9-f1d2987ca1db/sicily-preview-original-review.json`, SHA-256
0b5f7297bf3a788a187c1d41be5ac60351df55832254d5782036559595ae9886.


**24. Oktober – freigegebene responsive Gestaltung öffentlich nachgeprüft:** Foto-/Wortumbruch-V3 und
Sizilienregel nach ausdrücklichen Antworten gespeichert. Unabhängig neu geöffneter CMS-Editor enthält
exakt den gebundenen Kandidaten; öffentliche CSS **48**, HTTP 200, 14.478 Bytes, SHA-256
3cdc6fc7b513e877fd3cd4af6c177cb378fdd774e17a2617ec84bc4deacf69f9. Frühere Editorbindung hatte
CDP-Eingabe-/Bildzeitüberschreitungen; daraus kein Speichererfolg behauptet. Erfolg erst durch unabhängige
Neuladung und öffentliche Quelle bestätigt. Tatsächliche zehn Modulversionen und Reihenfolge frisch gelesen;
keine weitere Cacheänderung. Standard-CSS-Referenz und führender Websitevertrag synchronisiert.
Zwölf öffentliche Zellen, **47/47 ganze Original-JPEGs** unabhängig angesehen: beide Personen vollständig
in Tablet/Mobil, ganze freigegebene Wörter, keine Überlagerung. Alle **42** Geräteüberschrift-/Textpaare
weiterhin 11 px getrennt. Kontakt-Desktopfolge beginnt bei Y382; separates Y0-Original überlappt und ergänzt
sie vollständig. Kontakt-Tablethöhe passt sich während Aufnahme an; finale Abdeckung bis Footer, About-Tablet
mit einem Pixel Rundungsgrenze. Lieferbeleg `8f89b513-d7ff-4826-a4b3-12ca0232f52f/approved-responsive-live-delivery-24.json`,
unabhängiger Review `ceaab8e9-ce4f-4422-9eb6-5b311add9967/css48-visual-review.json`, SHA-256
ce3129c7b7fefd9d9d3055a8ea124045b7e906ff2987b48e331cf0cd8935e3e2. Keine Formularsendung/Touchabnahme.
About-Alttext nennt drei statt der sichtbaren zwei Männer; im nachgelagerten Alternativtextworkflow berücksichtigen.

**Neuer Wiederanlaufbefund A-68:** Frische native Fehlermeldung gesichert in
`8f89b513…/taxonomy-restart-preview-native-error-24.txt`. Tatsächliches Manifest nur gezielt stat-geprüft:
1.138.867 Bytes gegen allgemeine 524.288-Byte-Grenze. Ein eigenes 12-MiB-Limit allein für erhaltene
Kandidatenmanifeste ergänzt; vollständige JSON-/SHA-/Kandidaten-/Job-/Rezeptzugehörigkeit bleibt geprüft.
Keine Kopfheuristik, kein pauschales Aufweiten anderer Eingänge. Isoliert erwartetes RED und **18/18** GREEN,
Ergebnis `170ae192-863e-484d-8b95-3a9d96c5a96e/restart-manifest-limit-result.json`, SHA-256
749200d263a72af812146b8ba2b46124e5acc00336b1e7f23f1eac7631eefa50. Root liest vollständige Quellen-/Testdiffs,
prüft Ausgangs-/Kandidatenhashes und übernimmt zwei Dateien. Alter Workflow/Job bleiben exakt unverändert;
integrierte Wiederanlauf-/Koordinatorregression **141/141**, null Fehler/Abbrüche/Skips. Belege
`restart-manifest-repair-integration-24.json`, `restart-manifest-repair-tests-24.txt` und
`restart-manifest-repair-checks-24.json` unter 8f89b513…; Testlog SHA-256
14681488a706a401705e15eb4ad3f3293a34eba6c9b13eade913fa5a4e8c8171. Reguläres Ende und Neustart
über die tatsächliche Desktopverknüpfung inzwischen ausgeführt; native neue Vorschauprüfung folgt.
Eine zuvor zielunsichere Enter-Eingabe durch automatische Freigabeprüfung abgelehnt; anschließend nur
frisch beobachtete eindeutige Ziele verwendet. Keine Ablehnung umgangen oder Prozessbeendigung erzwungen.

**Private Lightroomvorbereitung fortgeführt:** Deaktivierte 55-Lua-Assembly und danach vollständige eigene
Hierarchie mit 64 JS-Modulen/neun zusätzlichen Regelquellen, insgesamt 128 exakt gebundenen Quellen.
27/27 enge Auflöser-/Verknüpfungsprüfungen; keine Ausführung der Helper-/Workflowlogik. Ergebnis
`b31e1120-ec76-43e7-8599-bc1971712b61/disabled-runtime-preparation-result.json`, SHA-256
8533f70bb65cf4cc955097baf78e61dd2cadf9a85cdfcf78455d0a0346928882. Eigenes Storage bleibt gesperrt,
enabled/rootReviewed/nativeReady false. Tatsächliche Prefs-/Umgebungsauflösung, Helfer/Node/cmd-Pfade,
Testpaket, SDK-Fotoidentitäten und Lauf-/Token-/Blockbindungen bleiben offen; keine native LR-Schreibprobe.

**Neuer gebundener Wiederanlauf tatsächlich angelegt:** Nach regulärem Ende und Start über die normale
Desktopverknüpfung erreicht der Explorer die neue native Bestätigung. Freigegebener Auftrag
`update-96253471-0b91-493a-893a-ec3920e36498` seit 24. Oktober 00:17:44.786 UTC; Quellenphase erhalten,
frische FN-Erfassung ausdrücklich gebunden, noch kein neuer Builder gestartet. Lightroom gezielt über die
beobachtete Datei `D:\Lightroom Katalog\Lightroomkatalog aktuell.lrcat` geöffnet; „FN-Katalognutzung erfassen“
mehrfach tatsächlich laufend sichtbar. Keine Testkatalog- oder FN-Schreibprobe parallel dazu.
Unabhängige kleine Dateimomentaufnahme 00:34:33 UTC: Request 914172eb… `pending`, Workflow
`waiting-lightroom/start`, `buildStarted:false`, keine neue Quittung. Die einzig gespeicherte Quittung vom
23. Oktober gehört zum früheren Request; sie erfüllt weder ID-, Revisions- noch Zeitbindung des neuen
Auftrags und wird nicht wiederverwendet. Requestrevision und Capturebindung 5728edf1… nachgerechnet gültig.
Beleg `d27d3cf0-e587-4197-989f-23de7ddb84d2/new-workflow-capture-binding-review.json`, SHA-256
d266c9ec6afacce43b75ffc8d9259cabd6626034bd3dca41546f3d9f7743e3fa. Keine DB-/Status-API-Abfrage.
Der neue Paarabschluss und die aktive Fortschrittsprobe bleiben offen. Private LR-Laufzeit vor Verwendung
erneut gegen den inzwischen um A-68 erweiterten Quellstand binden; bisherige Assembly ist kein Frischebeleg.

**Reiseübersicht lokal übernommen, enger Veröffentlichungsstand:** Frischer vollständiger HTML-Beleg
629.162 Bytes unter `8f89b513…/travel-overview-complete-public-html-24.html`, SHA-256
c3f4d6d6429dbc183f1dfa8a326a3c7a4c82665d1c96b715e1a656cee59dfb54. Zuvor abgeschnittener HTML-Auszug
wird nicht als vollständiger Eingang verwendet. Eigenständiger Zweig im bestehenden Sortiermodul;
ursprünglicher Artensorter unverändert. Guard akzeptiert vor jeglicher Mutation ausschließlich die exakt
gebundene ursprüngliche 50er-Folge oder die vollständig reparierte 45er-Folge. Drei neue Negativfälle
reproduzieren die frühere Lücke; danach **23/23** bestanden. Enger Ergebnisbeleg
`ed6a2689-f9bf-4995-ba74-ff65657f067c/travel-order-guard-result.json`, SHA-256
63777c01420d917a3de7b2add78737c4523ef16a65b8a17e5c7253b1ee4b7439. Schlanke dauerhafte Fixture
13.498 Bytes, keine zusätzliche Testgruppe. Root prüft volle Quelldiffs und alle Übernahmehashes;
integrierte Sortier-/Barrierefreiheitsprüfungen **35/35**, Stilprüfung und 80 Dokumentverweise bestanden.
Lokale drei vollständige Ansichten, alle **34** Originale sowie zehn frühere öffentliche Originale unabhängig
angesehen: Latium überall 2022, ausschließlich Montenegro mit Statusband, alle 14 Karten und 22 Titel erhalten.
Review `83f5a409-db00-4026-86e3-38cbfddeafd0/travel-preview-visual-review.json`, SHA-256
4e46fb9705390e8e7239bc36b5e23c140a8385cdb71a9e5f01f46bbf999b09a5. Diese Darstellung verwendet den
Vorgänger vor reiner Guardhärtung; gleicher gültiger Ausgabestand anschließend im VM-Modell nachgewiesen.
Öffentliche Endabnahme des finalen Quellstands weiterhin erforderlich. Vorschau regulär beendet, null
Operationen/Helfer; `1f6094fd…/preview-final.json`, SHA-256
32d3b2ab723e69a9ce2a0db7833e299d4c7f59f23b1b18d35d4377cb8c93abec.
Freigegebener Commit **682d0898b57238a3385ea1590bed6ba67b0884e4** enthält genau sechs Dateien:
Sortiermodul, Verhaltenstests, Fixture sowie CSS-, Footer- und Websitevertragsreferenz. Remote-Elternstand
5bfe3a6 geprüft und mit erwarteter Revision vorwärts aktualisiert; keine lokalen Backend-/Plug-in-/Audit-
Änderungen mitveröffentlicht. Gekoppelte, zunächst inaktive Rasterregeln im CMS exakt gespeichert und durch
Neuladung bestätigt; öffentliche CSS **49**, HTTP 200, 15.774 Bytes, SHA-256
f4073ffc1d8176992972c27bcd111a8ad9c769ed211e19337360eadc4b3600f7. Pageslauf **40045708548** und
danach Sort-Cachewechsel 1.0.3 samt öffentlicher Drei-Ansichtenprüfung noch in Arbeit.

**Weitere tatsächliche Sichtbefunde zur Abstimmung:** Sonstiges Wendtorf, Haithabu und Lütjenburg in allen
drei Ansichten vollständig unabhängig angesehen, **55** Originale; Review
`cbb31184-a74c-4ef7-abfe-766e40fbc7ee/site-pages-016-018-visual-review.json`, SHA-256
983cdf5e5a86644224026f8efe0a5a09e9181d8d50e2ed8f2a402f2460723c9d. Helle Wendtorf-Heroschrift liegt
schmal auf heller Sonne; Haithabu mobil „HANDELSMETROPOL/E“, Lütjenburg „TURMHÜGELBUR/G“ und abweichende
Titelhierarchie. Tabletgalerien einspaltig mit weich wirkenden Fotos; angegebene natürliche Breite allein
beweist ohne Dichte-/Quellenabgleich keine Ursache. Schmale Tabletfooteradressen umbrechen lesbar innerhalb
von Wörtern; keine erneute Überlagerung aus A-59. Bildtext „durch den Schilf“ redaktionell prüfen.
Reiseübersicht hat bereits im öffentlichen Vorgänger Umbrüche wie „GRIECHENLA/ND“, „MONTENEGR/O“ und
„BOTSWAN/A“; getrennte Gestaltungsfrage, keine Regression der freigegebenen Zuordnung. Sechs FN-Logokarten
sind vorhandene Platzhalter. Keine unfreigegebene Typografie-, Galerie- oder Inhaltskorrektur.

**Reiseveröffentlichung abgeschlossen und öffentlich abgenommen:** Pages **40045708548** mit Qualität,
Artefakt und Deployment erfolgreich; tatsächlicher öffentlicher Abruf `sort.js?v=1.0.3` HTTP 200,
SHA-256 eaf2fd5211291546f034d0b70b6d182ed34904aa87a871c1bcfc9b3ab0221fb8. CMS-Footer ändert
ausschließlich Sort 1.0.2 → 1.0.3, sonstige Modulversionen und tatsächliche Reihenfolge erhalten; unabhängige
Neuladung exakt passend. Portraitmodul steht tatsächlich zuletzt. Diesen historischen Referenzrest in
genau einer Dokumentdatei nachgezogen: **bb0fe718d7bbaa7829501e7b521a1078a4225c3b**, Pages
**40046592586** ebenfalls alle drei Jobs erfolgreich. Beide Commits zusammen sechs Dateien, **733+/5−**,
keine lokalen Backend-/Plug-in-/Auditänderungen veröffentlicht. Unabhängiger Quellenreview
`ddb9abf4-b9db-4a5b-a4a3-10102ee2b315/published-travel-review.json`, SHA-256
3a1631c06d1ade39efbb63d64aa1fcc8de321a8afaca04a4d89b9f111b28d653; darin noch benannter Referenzrest
anschließend wie beschrieben geschlossen. Skriptfolgen der lokalen Referenz und gespeicherten CMS-Fassung
nun bytegleich; zwei bestehende LESS-Escapes und Formatleerraum der CSS bleiben gezielt compilerfest.
Alle **31 öffentlichen Originale** in drei vollständigen Ansichten unabhängig geprüft: Latium sichtbar und
in DOM/AX unter 2022, nur Montenegro mit Band, alle 14 Karten/22 Titel erhalten und geladen. Y0 bis Footer
lückenlos, keine neue Inhaltskollision. Beleg `8f89b513…/travel-public-delivery-24.json`, unabhängiger Review
`6663bc9d-ca81-4078-bfc6-48b4ae3aaa24/travel-public-visual-review.json`, SHA-256
b49dc69af3fc8f72941f8aa321033177775b08dbad0ce1a1d0a2b569821f59dd. CSS-Viewports tatsächlich
1280×900/768×1024/390×844 bei DPR 1. Codierte JPEGs proportional kleiner; keine 1:1-Pixelmessung daraus.
Ein zunächst wirkungsloser Ansichtswechsel vor Aufnahme anhand DOM-Maßen verworfen; nach Reset korrekte
Tablet-/Mobilansichten. Tastatur/Touch/Linkziele sind durch diesen Sichtreview nicht insgesamt geprüft.
Freigabe-, Quellen-, Liefer- und Versionsbindung in `8f89b513…/travel-release-binding-24.json`.

**Weitere drei Sizilienseiten vollständig gesichtet:** Sonstige, Monreale, Palermo mit neun Zellen,
61 Originalen und vier gezielten Nachaufnahmen unabhängig angesehen; keine blockierende Überlagerung,
Abschneidung oder horizontaler Überlauf. Galerien 11/6/6 Bilder und gleiche AX-Folgen erhalten; Rücklinks
auf Sizilien, Desktop vier und schmal eine Galeriespalte. Drei zuerst ungeladene Heros durch klare Y0-
Nachaufnahmen geschlossen. Beleg `8f89b513…/site-pages-019-021-delivery-24.json`, Review
`8622226f-f5b5-4935-9ede-bc19c803c916/sicily-sonstige-monreale-palermo-nine-cell-original-review.json`, SHA-256
20710d0cf37a774382f40d6552e812a6e82e279011263b196b114ee5fd7bd85a. Dieser unabhängige Review hält noch
eine blasse Desktopziege offen. Root sieht anschließend das ganze unveränderte zusätzliche Original
`site019-desktop-bottom-settled-24.jpg` selbst: Ziege und Nachbarn vollständig sichtbar/kontrastiert.
DOM-/Zeitbeleg gleichnamig; kein dauerhafter Bildausfall. Historischer Review unverändert erhalten.
Palermo-Mobil zusätzlich tatsächlich per Tastatur: Enter öffnet Bild 1, Rechts/Links wechseln zu Bild 2/
zurück, benannter Zoom lädt 2500-Pixel-Foto, erster Escape erhält Galerie/`itemId` und Zoomknopffokus,
zweiter schließt Galerie und setzt Fokus auf ursprünglichen Bildlink. Belege `palermo-keyboard-24.json`
und `palermo-mobile-zoom-24.jpg` unter 8f89b513…; keine physische Touch-/Screenreaderprüfung.

**Frische FN-Erfassung akzeptiert, weiterer Stopp A-69:** Neue Quittung
`usage-42aca815-d682-4500-bc7f-3359de41aaa5` vom **24. Oktober 00:50:06.235 UTC** belegt MainD und
127.427/7.246/68. ID, Capturebindung und Zeit zum neuen Request vor normalem Ende geprüft. Native
Fortschrittsanzeige beendet; Alt+F4 und ausdrückliches „Ja“ im normalen Lightroom-Enddialog, anschließend
kein Lightroomfenster mehr. Request seit 00:52:38.693 UTC `completed`. Auftrag seit **00:53:19.347 UTC**
`failed/start`, `buildStarted:false`, konkrete Ursache „Die Klassifikations-Erneuerungsdatei überschreitet
die zulässige Größe.“ Kein Builder erzwungen und keine weitere Erfassung gestartet. Vorher nativ sichtbare
Meldung zu Schließen vor Erfassung ist ein belegter Anzeigezwischenstand; nicht mit dem terminalen
gespeicherten Fehler verwechselt. Gesicherte Rohzustände `taxonomy-fresh-capture-24.json`, native AX
`taxonomy-fresh-capture-before-close-24.txt`, `taxonomy-new-build-start-24.json` und
`taxonomy-new-build-native-24.txt` unter 8f89b513…. Quellenreview grenzt zwei zusätzliche allgemeine
512-KiB-Lesestellen des Stagingmanifests im separaten Erneuerungsmodul ein; isolierte Reproduktion und
eng begrenzter Kandidat in Arbeit. Bisheriger Aktivstand und abgeschlossene Aufträge bleiben erhalten.

**A-69 lokal korrigiert und integriert geprüft:** Unveränderte Quelle reproduziert exakt den Größenfehler;
eigener Kandidat ergänzt nur eine 12-MiB-Manifestrolle und die zwei zugehörigen Stagingleseaufrufe. Allgemein
512 KiB und sämtliche Voll-JSON-/Digest-/Quellen-/Fall-/Schutz-/Token-/Quittungsprüfungen bleiben erhalten.
**31/31** isolierte Fälle, darunter volle Bindung eines großen gültigen Manifests, gültige Änderung zwischen
Erstlesung und Abschlussvergleich sowie getrennte 12-MiB-/512-KiB-Sperren. Bisherige vollständige Batchtests
bleiben bytegleicher Präfix. Ergebnis `80ea2121-b06e-4607-9ee8-124cd8b07e73/classification-renewal-manifest-result.json`,
SHA-256 2e640fd78d7e6fb2ea96f97bc1f544c3a05b588b109eb855f6e9706096063190. Root liest beide vollständigen
Diffs, bindet alle Ausgangs-/Kandidatenhashes und übernimmt genau zwei Dateien nach gesichertem terminalem
Fehler. Sechs kleine Auftrags-/Belegdateien vor/nach exakt unverändert. Integrierte Klassifikations-,
Koordinator-, Neustart- und Masterserviceregression **243/243**, null Fehler/Abbrüche/Skips. Protokoll
`8f89b513…/classification-manifest-repair-tests-24.txt`, SHA-256
7ee74137c62a7bd7a8b23fe72acc0e679e451bdc223bee9254d0265e24cc7bb9; Übernahmebeleg gleichnamig
`classification-manifest-repair-integration-24.json`. Unabhängiger enger Nachpfadreview findet keinen
weiteren konkreten gleichartigen Manifestgrößenstopp vor dem Builder; bewusste Kopfziele sind weiterhin
durch vollständige Datei-/SHA-Bindung ergänzt. Kein Laufzeitabschluss daraus. Vollständiges lokales Gate
läuft anschließend; vorhandener Verzeichnislink-Schutztest außerhalb der Sandbox, keine Schutzregel geändert.

**Vollständiges lokales Gate nach A-69 bestanden:** `quality:ci` Exit 0, **50 Gruppen / 2.065 Tests**,
alle bestanden, null Fehler/Abbrüche/Skips; Syntaxprüfung 423 JS-/MJS-Quellen und 80 Dokumentverweise.
Protokoll `classification-manifest-repair-full-quality-24.txt`, SHA-256
5217fb8cca9ca012b929381efcc1c06fbc823fdcfdfafd471fc7009031cfcc09; Ergebnisbindung
`classification-manifest-repair-checks-24.json`, beide unter 8f89b513…. Keine Veröffentlichung dieser
Backendkorrektur. Explorer anschließend regulär geschlossen und über die tatsächliche Desktopverknüpfung
frisch gestartet; neuer nativer Wiederanlauf noch zu prüfen.

**Weitere neun Sichtstellen vollständig geprüft:** Erice, Kreta und Matala in drei Ansichten,
45 Originale plus neun gezielte Nachaufnahmen, alle 54 unabhängig vollständig angesehen. Gemessene CSS-
Ansichten 1280×900/768×1024/390×844, lückenlose Y0-/Footerabdeckung. Zuerst ungeladene Heros und noch
blasse Galerieübergänge durch klare Nachbilder geschlossen; `networkidle` allein belegt keine beendete
Einblendung. Keine Überlagerung, 6/5/3 Hauptbilder und ihre Texte erhalten. Lieferbeleg
`8f89b513…/site-pages-022-024-delivery-24.json`; Review
`83f70dcc-73b7-413a-ba99-56a4f5c8656b/pages-022-024-visual-review.json`, SHA-256
a5d5787ffefd2812bc0218d5b3e1dba74cc236d997b06f68f3ae317ba8edfcff. Konkrete getrennte Befunde:
Kreta mobil „KRISTALLKLARE/M MEER“ auch gesetzt. Erice/Matala Tabletgalerie mit rund 691,56 px großen
Quadraten und natürlicher Bildhöhe 374 px unter `object-fit:cover`, dadurch etwa 1,85-fache Vergrößerung
und sichtbar weich. Ursache der Variantenwahl/Originalqualität noch ungeprüft. Unterschiedliche Heroebenen,
schwarze/gelbe Rückknöpfe und Kretas drei schmale Tablettextspalten sind Gestaltungsfragen, keine neue
Regression. Linkziele/AX gelesen, tatsächliche Klick-/Touch-/Tastaturfunktionen dieser drei Seiten offen.

**Private LR-Vorbereitung auf aktuellen Regeln:** Alte 128er-Kopie unverändert, genau eine der ursprünglichen
Quellen inzwischen durch A-69 geändert. Neue getrennte deaktivierte Kopie unter 5c59c93e… hält weiterhin
55 private Lua-Dateien (.40), 64 JS-Module/neun Regelquellen. 27/27 bestehende synthetische Gegenproben;
keine Helper-/Builderauswertung. `enabled/rootReviewed/nativeReady:false`, tatsächliche Prefs-/Env-/SDK-/
Paket-/Plan-/Token-/Journalbindung weiter offen. A-68 gehört nicht zum Helpergraph. Ergebnis
`5c59c93e-4cd9-4457-9662-a308116919f9/disabled-runtime-refresh-review.json`, SHA-256
6bb09f40ff82552ad2f9c4c8103f7d0f1dcf5444762cc5a785a289a98f82f6cc. Kein Plug-in registriert oder
Katalog beschrieben; alte und neue Vorbereitungsrollen nicht mit nativer Bereitschaft gleichgesetzt.

**Geprüften A-69-Quellstand nativ neu aufgenommen:** Explorer regulär über seine eigenen Schließwege
beendet; kein erzwungenes Prozessende. Anschließend über normale Desktopverknüpfung neu gestartet,
Fenster 918598. Neue lesende Vorschau erreicht ausdrückliche Bestätigung „Neu lokal aufbauen“; bestehende
Wiederanlauffreigabe ausgeführt. Neuer gespeicherter Auftrag
`update-0d0b6e9e-6667-4f07-8af7-49ed4bcb92c1` seit **01:15:49.429 UTC**, Quellenphase erhalten,
`buildStarted:false`. Eigener Request `capture-request-033e5126-cc09-47ee-87a6-0f113dabb58e` mit neuer
Capturebindung b4a12860…; vorige Quittung wird nicht neu datiert. Exakte D-Hauptkatalogdatei im normalen
Datei-Explorer geöffnet, Lightroomfenster 989362; „FN-Katalognutzung erfassen“ tatsächlich laufend sichtbar.
Kein Testkatalog und keine FN-Schreibprobe parallel. Zustand `waiting-lightroom/start`, Request `pending`,
kein Fehler. Belege `8f89b513…/a69-restart-state-24.json` sowie `a69-native-restart-confirm-24.txt` und
`a69-native-capture-start-24.txt`. Weiterhin offen: frische Quittung dieses neuen Auftrags, normales
Lightroomende, tatsächliche Erneuerung, Workerstart und gemeinsamer Paarabschluss; anschließend private
Lightroomrestmatrix. Keine gleichzeitigen weiteren Katalog-/Produktdatenbanksuchen oder Bereinigung.

**Belegpaket dieses Arbeitsabschnitts regulär geschlossen:** Sitzung
`8f89b513-d7ff-4826-a4b3-12ca0232f52f`, 01:19:17 UTC, **1.077/1.077** registrierte Originale vorhanden,
null fehlende Dateien, vollständige Integritätsliste `evidence-result.json`, SHA-256
f0caf5ee5f571feee17367ba8a8b151806f249229fbcfb796d72c24fa42c4ca7. Sitzungszustand `closed`, null
Operationen. Die neue produktive FN-Erfassung läuft davon unabhängig in ihrem eigenen regulären Auftrag;
ein geschlossenes Belegpaket bestätigt keinen Abschluss dieses Auftrags. Browsergrößen zurückgesetzt,
eigene temporäre Ansichts-Tabs regulär geschlossen. Keine Dateibereinigung während laufender Erfassung.

**Neue eigene Quittung und normales Lightroomende nach A-69:** Capture
`usage-eb42c924-cbdd-4852-88b7-def1509031e7` vom 01:20:16.848 UTC passt exakt zu Request 033e5126…,
Capturebindung b4a12860… und MainD, nach dessen Erstellzeit. Wieder 127.427/7.246/68, keine Wiederverwendung
der vorigen Quittung. Eigenes kleines geschlossenes Belegpaket
`d5260645-6b2b-45f2-8228-87eaa6d3681e/fresh-capture-before-close.json`, SHA-256
53906333ec0a500eb22f440eddf4dc286eb3c2ac7bd9c085572646bf4f5405c3. Native Fortschrittsanzeige tatsächlich
beendet. Alt+F4 und „Ja“ im normalen LR-Dialog bestätigt; anschließend kein Lightroomfenster. Request
nun `completed`, Workflow `waiting-usage/start`, kein Fehler: „FN-Nachweis registriert. Gespeicherte
Entscheidungen werden erneut geprüft.“ 179 gebundene Ereignisse; noch `buildStarted:false`.
Die aktive Prüfung wird ungestört gelassen; keine zusätzliche produktive Vorschau/DB-Abfrage oder Erfassung.
Nachgelagerter kleiner Statusbeleg im eigenen regulär geschlossenen Paket
`9fdfb108-3c94-4414-8e25-22f91dac1dd1/after-normal-lightroom-close.json`, SHA-256
b9cf682c472c31a1480ec403dbf91f658c12b605f7c89d0483f6ebbd06b47c93. Alte gebundene Belegpakete wurden
für diese späteren Beobachtungen nicht wieder geöffnet oder verändert.


**24. Oktober – weitere vollständige Seitenblöcke:** Zwölf Reiseseiten 025–036 unabhängig in allen drei
Ansichten geprüft; die bisherigen 27 Seiten sind damit um zwölf ergänzt. Danach vier Artenlisten
038/039/040/122 und Amsel/Bachstelze 041/042 vollständig geprüft. Diese 18 weiteren Seiten ergeben
54 zusätzliche Sichtstellen; damaliger Zwischenstand 135/411. Der fortgeschriebene Stand steht oben.
Die normale Sichtprüfung zählt auch Ansichten mit konkreten Befunden; keine pauschale Layout-/Funktionsfreigabe.

Vier Reise-Reviews: 072accaf…/pages-025-027-visual-review.json
(SHA-256 364f94139e2a91f0f85f13fd56fc5f54137f7ef1d6e2546575c357bddeb5f5eb),
0e1e7bc0…/pages-028-030-independent-original-review.json
(70fd3f27f6950b997bf438ccd829803f5f38869647157a4ec76c66c0eccae306),
0ef0c325…/pages-031-033-original-visual-review.json
(0dcf65b1d9f996e10532316eb1905b16cfe1e5c999c1cad9579fee63df5d0930),
1259704b…/pages-034-036-independent-original-review.json
(722b3e57fe35d673e77e4c3b6ac52a451da83ebf41fe1908de25ff9814308a64).
Alle Originale tatsächlich einzeln angesehen; blasse Einblendungen gezielt durch klare Nachbilder ergänzt.
Vollseiten/Clips zeigten abweichende Umbrüche beziehungsweise unzuverlässige Clippositionen; sie ersetzen
keine Layoutabnahme. Weitere Aufnahmen ausschließlich normale überlappende Viewportoriginale.
Konkrete Abstimmungspunkte A-70: weiche/vergrößerte Tabletvarianten und starke Panoramazuschnitte,
uneinheitliche Herotitel/-knöpfe, Rehtymno/Rethymno sowie einzelne Grammatikstellen. Island-Einwohnerbezug
und Vesuv-Kirchenausschnitt bleiben Prüf-/Zuordnungsfragen, keine unbelegte sachliche Fehlerbehauptung.

Artenlisten: 175/175 Originale, 12 Zellen; deutsche alphabetische Reihenfolge und „Weitere Tiere“ überall
zuletzt, keine offene Fade-/Ladestelle. Review 223650a1…/species-lists-visual-review.json,
SHA-256 d9fadcc0de2ad293dcf5c98159240e8eaf3c3f233842f6fa0d94ef7c08c7f260.
Tabletwortbrüche, Island mobil TIERBEGEGNUNG/EN, mobiler Reh-Heroausschnitt, schlecht erkennbares
Erdbeerfroschmotiv sowie „WEITERE INFROMATIONEN“ und „mit insbesondere durch seinem“ bleiben konkrete
Befunde. 25/63 leere Kartenbildalts sind technische Eingangslage für den vereinbarten späteren Alttextworkflow.
Amsel: 54 Originale, Review 9891badd…/page-041-amsel-independent-original-review.json,
005f3de532fc2570c92b4be84edd2140b305c0e8dd1983441a615104b8c4ef60.
Bachstelze: 58 Originale, cc01ea9b…/page-042-bachstelze-independent-original-review.json,
86ed7a954bbae76f336153e7e2a2ffd13b534ab19f7dc53ffc21873efc9a9910. Beide Tabletansichten zerlegen
BEOBACHTUNGSTI/PP; Bachstelze mobil mit belegter Kartenüberdeckung A-71. Bartmeise mobil dagegen
keine Überdeckung: b8bd9a4f…/page-043-mobile-original-review.json,
fe6dac3a285eb65c6d6aaa3ad4a2b82da954d2e692672f28471b0d855f8e338b. Keine Bedien-/Touchabnahme daraus.

**Gespeicherter 137er-Quervergleich:** 10.683 echte interne Anchorvorkommen führen nur zu den bekannten
137 Seiten und vier Zusatzpfaden; 137 Fragmentziele vorhanden. Alle 63 Artseiten mit gleichem Sieben-Host-
Profil; dynamischer Portraitcontainer ist im Roh-HTML erwartungsgemäß noch nicht vorhanden. Zehn gleiche
Module je Seite; Snapshotversionen vom 23. Oktober nicht als heutiger Livefehler gewertet. H1-Hierarchie
bleibt semantischer Prüfpunkt: 132 Seiten ohne H1, Übersichten teilweise mehrere H1. Beleg

d41ec612…/website-saved-html-cross-review.json,
9e71d04ae4efb481e9d42c7b5f4291a225b70fd4eb66891cbda467fb98e75803. Keine neue HTTP-/Funktionsabnahme.

**Aufbau und Anzeige bleiben getrennt:** Neuer Job 128d75c0… seit 02:11 UTC eindeutig Auftrag 0d0b6e9e…
zugeordnet; frische Quittung/Request/Rezeptbindung stimmen. Neuer Worker erreicht 169.000 geschriebene
Datensätze und später 273.495/273.495, zuletzt gespeichert 02:31:17 UTC, building/Abschluss/99 %, ohne
Fehler. Noch kein gemeinsamer Paarwechsel; bisheriges Paar bleibt aktiv. Kleine gesicherte Belege
38354388…/saved-taxonomy-workflow-status-refresh.json
(6eb2cc66ec5a8c81a12afa52fd26000680d9bcda383978bdce3f31b173887285) und
1c6e1fb9…/taxonomy-workflow-small-progress.json
(7addb5e1080099391e331208f458d71e5a608908c13a7b3386a656c409606afb).
Frische native AX um 02:44 UTC zeigt dennoch den alten Fehljob/Retentionsfehler: A-64 ist damit während
aktivem neuem Aufbau noch nicht nativ bestanden. Beleg 97662220…/native-explorer-during-build-99.txt,
7f66f377bb7923219fdf57063110ff0bbb0447e547fe599c4add22d17d8abdd7. Keine Eingabe, kein Neustart,
keine zusätzliche Produktdatenbankabfrage. Lightroom bleibt bis zum geschützten Paarabschluss geschlossen.

Technische Belege 364f3a3c… regulär geschlossen, 711/711 registrierte Originale vorhanden, null fehlend,
evidence-result.json SHA-256 a88a4e98d6746912247dd61219b06bbdd1a7266186dd73f4cc65d0f62a468fe6.
Unterbrochene Amsel-Mobilteilserie ist als Abdeckungsbeleg ausgeschlossen und vollständig neu aufgenommen;
die voreilige Verlustvermutung im technischen Schließgrund wird durch den tatsächlichen Null-Fehlbestand
korrigiert. Folgebelege in eigener Sitzung 97662220…. Agenten haben in ihren Kontexten keine Browser;
Aufnahmen deshalb zentral/sequenziell über eigene feste Hintergrundtabs, Originalreviews parallel durch
Agenten. Kein Produkt-/CMS-/GitHubwechsel und keine Bereinigung dieser laufenden Prüfungen.

**Fortgeschriebene Artseitenblöcke:** Bartmeise 043 jetzt vollständig in drei Ansichten; Desktop 044–063,
Tablet 043–048 und Mobil 043–052 ebenfalls vollständig unabhängig original gesichtet. Nur neue Zellen
gezählt, frühere Nachweise unverändert übernommen. Alle Folgen überlappen von Seitenanfang bis Footer;
keine offene Einblendungs-/Ladenachaufnahme in diesen abgeschlossenen Blöcken. Die laufenden weiteren
Aufnahmen sind noch keine Sichtungsfreigabe. Gebundene Reviews (jeweils unter `temp/explorer/`):

| Sichtung | Ergebnisdatei | SHA-256 |
| --- | --- | --- |
| Bartmeise Desktop | 0817332c…/page-043-desktop-review.json | 0622260b5888363c5105002c6625a41f396f64328803e18197c5f9d688f7d129 |
| Desktop 044–048 | cbb5e186…/batch-review.json | cfffc8c6e870486910ae30a807c9728ade38816e380c6473d34862b8566f1517 |
| Desktop 049–053 | ab3a500e…/batch-review.json | d17f101b3596151021d01de968b9f1672e4526a7a0cf0e0bbe9eec5194f223ee |
| Desktop 054–058 | a216316d…/batch-review.json | b4225e927ff72eda74cc2e5df70d2cca3f8eece409e1498a20bcb6baf9b84327 |
| Desktop 059–063 | 92af2acc…/batch-review.json | 49128e875b1263a48b8681d9f1a0e86e54648ae29bb3a30a3a774e741187e206 |
| Tablet 043–047 | 56dc3cf2…/pages-043-047-tablet-original-review.json | 0b66f8948b0cab89d3f9141bbbb9de664fc139434923077386ad5e7075d66ed4 |
| Tablet 048 | 6f580308…/page-048-tablet-original-review.json | c12c75d144be5a8783a04dc8333c24437e79adcfc81586847ba157add716b70d |
| Mobil 043–047 | fee3eb3d…/pages-046-047-mobile-review-and-043-047-progress.json | 795c056dc688a6d1749d059d20159a3ee7906a67723bb64b5505b7581b92aa21 |
| Mobil 048–052 | 61a6b3e8…/page-052-mobile-review-and-048-052-progress.json | cc3f61b601c5d6aca80060102beeca9fb01e14331b7472c1337fb6fe5a6f997d |

A-71 konkret zusätzlich Desktop 046/047/048/050/051/052/054/055/059/061 mit je 22,75 CSS-px sowie
Tablet 046/047/048 mit je 24,25 CSS-px Überdeckung der zweizeiligen Kartenüberschrift. Die Mobilansichten
043–052 halten dagegen Abstand; keine pauschale Betroffenheit behauptet. Tabletwortbruch
BEOBACHTUNGSTI/PP, überdeckte Hero-Tiere und kleine/weiche Galeriemotive bleiben getrennte Befunde.
Blaukehlchen zeigt im Artblock `Luscinia svecica`, auf der Karte `Cyanecula svecica`: Quellen-/Synonymabgleich
offen, keine falsche Artkarte behauptet. Konkrete redaktionelle Stellen bleiben vor Änderung abzustimmen.

**Taxonomiekandidat fertig, Übernahmeprüfung läuft:** Job 128d75c0… seit 02:52:50 UTC `ready`, Kandidat
`master-20261024014609415`; Auftrag 0d0b6e9e… seit 02:54:39 UTC `activating/activation`, kein Fehler.
Um 03:10 UTC noch gleich, bisheriges Paar weiter aktiv. Nur vier kleine gespeicherte Zustandsdateien
gelesen; kein zusätzlicher Statusendpunkt oder Datenbanklauf. Beleg
97662220…/taxonomy-candidate-ready-activation.json, SHA-256
332ac0293566b8c1a19565638a9b673904aa630c563d4daba27ea3eaaffaf7c6.
Lightroom bleibt bis zum tatsächlichen geschützten Paarabschluss geschlossen. Dokumentverweise:
80 Markdown-Dateien ohne fehlende lokale Ziele; `git diff --check` bestanden.

**Gemeinsamer Taxonomieabschluss:** Auftrag 0d0b6e9e… endet um 03:18:42 UTC `completed/completed`,
ohne Fehler. Veröffentlichung `publication-bbbfafc1-6fa7-4b8d-a8f8-6f2f2319da07` verweist gemeinsam auf
`master-20261024014609415` und `lightroom-cbbd9b7e7d35ac507d35`; direkter Vorgänger bleibt das Paar
vom 13. Oktober. Aktive Release-Manifeste enthalten CoL `col-xr-2026-10-16-316691`, passende Master-/
Paketkennung und übereinstimmende Source-/Paketprüfsummen; Kandidatenqualität gültig, keine Fehler oder
Reviewitems. Kein erneuter vollständiger Datenbankscan für diesen Metadatenabgleich. Lose Legacyordner
`active/` sind bei vorhandenem Veröffentlichungszeiger nicht der aktive Stand. Belege unter 97662220…:
`taxonomy-completed-active-pair.json` (076896a946e9f9a016c19ed912c5732041b8986f4692a358a3b274147183d761),
`taxonomy-resolved-active-manifest-check.json` (6167f1beb8392adbdcf7ca493d8d2fd82a701d4cec8c6ff7a8f9574802a70fa0).
Native Hauptansicht nach Escape zeigt tatsächlich Schritt 7/7, abgeschlossen; Beleg
`native-explorer-completed-main-header.txt`, 095163f644bf2005b26e240f9e675069e91d03ba1e357b2eb0953f83fd3da5e2.
Der zuvor offene Dialog blieb noch veraltet: `native-explorer-after-completed-before-refresh.txt`,
19936551e8dd7639f836f55b8a9c6836d7cf828bd0d9c995bd1be00c0783a565. A-64 bleibt deshalb offen.
Zwei reguläre Öffnungsversuche öffneten im Lesemodus keinen Dialog: der tatsächliche Öffner kehrt dort
ohne aktive Arbeit ausdrücklich zurück. Nach Wechsel in den Bearbeitungsmodus öffnet er synchron.
Dies erklärt diese beiden Versuche; kein zusätzlicher Öffnungsfehler und kein neuer Aufbau daraus.
Die .40-Privatvorbereitung ist weiterhin deaktiviert; Paarabschluss ersetzt keine tatsächliche SDK-/
Katalog-/Helfer-/Paket-/Planbindung. Enger Review 3aaf6978…/private253-runtime-readiness-review.json,
5128986f362f7cc44b5e5cf127766780960b39af7055092890040ba751fa0b5f; konkrete eigene Fixture wird vorbereitet.

**Weitere abgeschlossene Sichtungen:** Desktop 064–078, Tablet 049–057, Mobil 053–065 ergänzen die
obigen Blöcke. Originalreviews: Desktop 133a0f52… (5f83b6e519acd5d3f88007d8beaed3bc09339d33129774767a75cc9d3209aef5),
cf32caf5… (ab15fe33ca4f7766e0a2fe6b252861c3a13eae5586bd66496ee89ac6d0c7af65),
95f895b3… (64f6a44d77421dadeacec0bd0cf6b8dfc62545ff86b6fd4255bfd1e8ac6413aa), jeweils batch-review.json.
Tablet b3bb904c…/pages-048-052-tablet-original-review.json
(cf6f80dbb2799a1226b9856569c29bf1ee7c08135dea44edf66c101a0c6e7b97; 048 nicht doppelt gezählt),
1b792cf6…/pages-053-057-tablet-original-review.json
(ef99cf50935e134b88bd5ae7cb9204b6dd4a67fa94f8907911e103ce85082fa7).
Mobil a96b9e6a…/pages-056-057-mobile-review-and-053-057-progress.json
(b9fb9fa1aee7d7e8736a3f3df2f90997608d3ec428fb227037e53e2b6caea177),
f9c7f3de…/page-058-mobile-original-review.json
(21decc81a4c5f6f69350e00b979584ce09dac8e5d33be95f625c664e97964a50),
ab8263ae…/pages-059-060-mobile-original-review.json
(b08ece13b37a6630d2e20201b663e647897b8424210564f081560b5b9992e7bc),
c1c1d179…/pages-062-065-mobile-review-and-061-065-progress.json
(febeb2ad6b8892c6f07f670fe20028346de438dbeba8ad0f100debb066d15057).
A-72 Einzelbelege be2fa341…/page-055-mobile-original-review.json
(0495ef5c04b8572b5d26405286a8e1fccb92d73f64c8f7674431a3895830fcbe) und
aa0b4d28…/page-061-mobile-original-review.json
(32d0e509d960dff944f8f7686050524e9ab0e77320376b04c5c0fb22199f0076).
Keine offene Fade-/Ladenachaufnahme dieser Blöcke. A-71 zusätzlich Desktop 077 und Tablet
050/051/052/054/055; Reh Desktop überdeckt, mobile Karten 043–062 dagegen einzeln frei bestätigt.
Weitere genaue Schreib-/Wortumbruch-/Fotofragen in den jeweiligen technischen Reviews; keine
Bedien- oder biologische Faktenabnahme daraus. Der Desktop-Kartenklick öffnet erwartungsgemäß kein
Overlay: map-loader 1.0.8 bietet dies nur bis 768 px an. Mobile/Tabletbedienung weiter offen.

**Weitere Originalsichtung am 24. Oktober:** Desktop bis 088, Tablet bis 067, Mobil bis 082 vollständig
gesichtet; die vorgezogenen Seiten 104/105/122 werden nicht erneut gezählt. Alle nachstehenden Folgen
reichen überlappend von Y=0 bis zum Footer, ohne offene Lade-/Fade-Nachaufnahme. Die führende Zahl oben
zählt ausschließlich abgeschlossene Reviews, keine bereits weiter fortgeschrittenen Aufnahmen.

| Neue Sichtung | Gebundener Originalreview unter `temp/explorer/` | SHA-256 |
| --- | --- | --- |
| Desktop 079–083 | 0033a12e…/batch-review.json | 973ec85716a717c1f73df82aa454e3a5dbe91282cea7379d5c596ca5f879319d |
| Desktop 084–088 | 565d8aba…/batch-review.json | 33a5fa14167a726acea886fe5e1631047de72c7e8cd3691e54c32cd9bc3902e7 |
| Tablet 058–062 | f6d92ad4…/pages-058-062-tablet-original-review.json | 5691ce300db26e7d3744d43943aac738ff7e19023667465984839b05a3724e6e |
| Tablet 063–067 | 03a25126…/pages-063-067-tablet-original-review.json | a7e73dc56acb3b163158caefc9eabeeb4645110e642e0eeb7bbd74f32af3c12e |
| Mobil 066–070 | 2ff2728b…/pages-066-070-mobile-original-review-and-progress.json | bdf140e16f8860a85425b13669c2ee0a9c8410dd7cab3e5450e2146ba125fe27 |
| Mobil 071–075 | 03e4d183…/pages-071-075-mobile-original-review-and-progress.json | dc46ffd70ce8d9cfdaa9ff3527cb9c3ddec0e681a8f73a679a43e6188924e779 |
| Mobil 076–080 | ec1c7f59…/page-080-mobile-review-and-076-080-progress.json | 1cb4d02464ec88349d7adac886f20441eddf5cb7ba4f43be981fbd18b552db25 |
| Mobil 081 | 583b8dfd…/page-081-mobile-original-review.json | 6da819433c16225da792d4524a907fe71710ecf65c97f7d625a553cd31634248 |
| Mobil 082 | 20e9c892…/page-082-mobile-original-review.json | 112a6c6a68af94a55d2597d875aa93620e28cfda2cbaeda24e64e0b0552287d7 |

A-71 zusätzlich Tablet 059/061 mit 24,25 CSS-px Kartenüberdeckung. A-72 ergänzt Haubenmeise 074,
Mobiloriginal 006: Lebensraum endet bei 3242,546875, Brut beginnt bei 3218,546875 CSS-px.
Die mobilen Artkarten bis 077 bleiben einzeln frei. Konkrete Wortbrüche, weiche/angeschnittene Motive,
Bild-/Textzuordnungen und Schreibweisen sind als A-70 in den Reviews gebündelt. Beispiele:
„CHAING MAI“ gegenüber „Chiang Mai“, „verrbunden“, „Glaumaer“ gegenüber „Glaumbaer“;
Mekong-Höhlenabsatz mit Vogelfoto. Dies sind redaktionelle Fragen, keine bestätigten Fachfehler.
Schwarzer Hero-Titel auf dunklem Strand (067) ist visuell kontrastarm, ohne numerische WCAG-Aussage.
Keine Bedienfreigabe aus diesen Sichtungen.

**A-64 reproduziert und lokal korrigiert:** Tatsächliche Frontendquellen isoliert geprüft: sechs gewünschte
Verhaltensweisen zunächst rot, zwei positive Kontrollen bestanden. Beleg e51b8c72…/
a64-refresh-polling-repro-result.json, 94c867eb0f04ada17ab3dda7919491084f73c124a143105e04a6150dc3773a1e.
Ursachen: aussetzende/hängende GET-Leser, verspätete ältere Antworten, verlorene Workflowbindung und
nicht mitgerenderter Legacyfortschritt. Der direkte Dialogöffner ist synchron und gehört nicht zu diesen
Fehlern. Drei vorhandene Statusmodule erhalten gemeinsame Antwortgenerationen, 15-s-Lesefrist,
sichtbaren unbestätigten Status und gestaffelten GET-Wiederholversuch; keine POST-/Bestätigungswiederholung.
Unabhängig gelesener Sourcekandidat 0a841138…/source.diff
(497506310ad616bee2d255cef1bfe8306a9133242ae207b5a84faa9ee69dcfe2), Testfassung
9a27a920…/tests.diff (deba684dcc687a73cd6ae3328b51702b25a9704eb72e64d87efeef1f6f662912).
15 neue Verhaltensfälle in bestehenden Gruppen; alter Stand 164/177, Kandidat 177/177, nichts übersprungen.
Ergebnis bdb0b62b…/a64-final-regression-result.json,
47692b2c5e7c974efc3a0bc1177d9a14d734be909b801c2d1bbd1c95552db696.
Vor Integration alle sechs aktuellen Quellen gegen die gebundenen unveränderten Baselines geprüft.
Lokale Integration ausgeführt. Erster Gateversuch 90832edc… scheitert am Windows-Symlinkrecht eines
bestehenden Tests, ohne Änderung von Sicherheitseinstellungen. Regulärer Wiederholungslauf mit
genehmigtem Testzugriff de704cdc…: 04:24–04:32 UTC, 50 Gruppen/2.080 Tests, null Fehler/Abbrüche/Skips,
gebundene Quellen unverändert. quality-ci-result.json,
2ace801b3c08fab6a57805dadedcba57f046258b386679d7a86c83e9d6374062.
Dies gilt für diesen Zwischenstand; die folgende Detailkorrektur wird gesondert geprüft.
Lesefrist beweist keinen Serverabbruch.

**Lightroom nach Paarwechsel und eigener 253-Testkatalog:** Original 0.4.24.39 bestätigt im D:-Hauptkatalog
nativ CoL/Master/Paket des 24. Oktober. Belege unter 97662220…:
native-lr-new-pair-manager.txt (93eb526292ac535183167b025614da70e76a7b97983d5b80a0c8bc772117b70a),
native-lr-main-d-catalog-path.txt (917e661a730e2303b0f8fff2a26d60c4dabd1f340d6279a321cfa23f95f42488).
Original vor Testkatalogwechsel vorübergehend deaktiviert, damit kein Testkatalog registriert wird;
native-original-plugin-disabled-for-private-test.txt,
80016a093cd720eb181f5b4287b9a8fcf02ec660f562c6a5880197b954a2eb88.
Eigene operative Sitzung 3c9d21e3… tatsächlich vorbereitet: vier kleine synthetische Datenbank-/Paketdateien,
eigenes leeres Journal, 254 künstliche JPEGs, 128 geprüfte Quellkopien. Keine produktive Datenbank kopiert.
Root-geprüfter Helfer b218a4c3…/prepare-private253-operative.mjs,
4e6363ac0deeb745e1abf59d51e4971633b8f875b17ba97fbc51e8046e285677;
operative-preparation-result.json, 9a01df0b6f35a9ed53e02b37b949dabef8fb286b6ff376b73d194761766ded80.
Eigener Eigentümer 14764 hält die Operation bis nach allen SDK-/Katalogschreibvorgängen offen.
Der vorbereitete leere Katalogplatzhalter wurde nach Leerheits-/Pfadprüfung innerhalb dieser eigenen
Sitzung reversibel umbenannt; Lightroom erstellt anschließend den genau vorgesehenen Katalog.
Nativ bestätigt: 3c9d21e3…/catalog/FN-Identity253-Audit/FN-Identity253-Audit.lrcat, null Fotos;
native-private253-catalog-path.txt (fd93dad9dda85ec04a0976f5ad011dbbfc7d7e7ccec61f3d286b89f563aeefdd).
254 eigene künstliche JPEGs sind anschließend nativ vollständig importiert, keine FN-Initialisierung.
Import im Modus Hinzufügen, Duplikatsperre aus, Entwicklung/Metadaten Keine, Stichwortfeld leer.
Ursprüngliche gemeinsame Importeinstellungen für die Rückstellung gebunden: Verschieben,
Duplikatsperre an, Entwicklung Import, Metadaten Keine, Stichwortfeld leer; Umbenennung nicht geändert.
Belege unter 97662220…: native-private253-import-initial-settings.txt
(86d1477ec0a15470c099e7f28d8c81fd342f0675873255b5e2311b3d4139dfea),
native-private253-import-ready-settings.txt
(cfce2e5639c9d41e47dee26953b017d1ffe16effd7e7691baef2641f32782e3e),
native-private253-import-completed.txt
(81e491413149a70efa4d804927f2f3157b90518079e47b055f54ab6ee6ebe8da).
Inventar/geschützte Initialisierung für 254 Fotos fehlen noch;
nativeReady bleibt false, keine FN-Schreib-/250+3-Abnahme. Originalaktivierung und Hauptkatalog auf D:
werden nach dem Test wiederhergestellt; keine Freigabe zum Verwenden des Testkatalogs als Hauptkatalog.


**Weitere vollständige Originalsichtungen am 24. Oktober:** Zusammen mit den bisherigen Belegen nun
306/411 Zellen: 86 vollständige Dreiansichtseiten plus 48 Einzelansichten. Desktop bis 120 (104/105/122
bereits früher), Tablet bis 083, Mobil bis 096. Die nachstehenden Blockbelege referenzieren teilweise schon
gebundene Einzelzeilen; diese Originale werden weder erneut gesehen noch doppelt gezählt. Alle eigenen
Reviews geschlossen, null Operationen/Helfer; Hashes vor/nach geprüft. Vollständige Normalansichten
mit Überlappung bis zum Footer, kein offener Lade-/Fadevorbehalt dieser Zellen. Keine Funktionsfreigabe.

| Sichtung | Originale im Block | Beleg unter temp/explorer/ | SHA-256 |
| --- | ---: | --- | --- |
| Desktop 089–093 | 29 | 996cf327-6d9f-4345-8f63-2025d12db87f/batch-review.json | 199bf7cf3c0e7d53e75677e0b5adb9d24e440f245951c6e7992b93ef33c1880e |
| Desktop 094–098 | 33 | 73c30463-79f4-4b67-bc42-15cb05999b3a/batch-review.json | b6962155406d267acb3356e50e7b6052482126b1b34a99595c22edc2ce4add03 |
| Desktop 099–103 | 36 | bd9f0f9b-9a2c-4b3a-b3af-783fd0ff0b97/batch-review.json | 22148e83d5042f1bdcf6127ea0317c15463e2fac43cf8c42577962c27ba05e70 |
| Desktop 106–110 | 46 | ded5d62d-857e-4336-9798-4e3d025705a3/batch-review.json | 1f6d1a0ea90e78429835540766c958bb44cc7ba4fc5af5ad2e35d3faec10228f |
| Desktop 111–115 | 48 | 8d645807-be79-4ea3-9c59-64bb6c84f447/batch-review.json | 4584fef209dc3176499ea499d7f3f50f087c2fff76b1d6c30435492d6bf03d1b |
| Desktop 116–120 | 45 | aafbb908-efe0-4b3b-a91f-2bfc4c909289/batch-review.json | b3974d66d56a68bbd2cfc8f861c1e1aa952fcb6542200324136a9e3dd1a53630 |
| Tablet 068–072 | 91 | 8df49715-365d-4bfb-9fe6-90c45b77809a/pages-068-072-tablet-original-review.json | 1008d04b644f3016bef85bcc768c40df0fcabd47e568b6223ce593915dc24a76 |
| Tablet 073–077 | 101 | 16f42a26-370c-4b05-973b-e8d7659f659d/pages-073-077-tablet-original-review.json | 8f875d8fa7537ddea10684fe1fba764be94e37eb66bfb4a5921819d3cc47abdf |
| Tablet 078–082 | 122 | 3dafb7a0-dc15-4af4-a542-5326d8d2b544/pages-078-082-tablet-original-review.json | 04affb9290dff6e50ffb1cb01b53466106aa2276e9ea83d446e9245762f00a22 |
| Tablet 083 | 38 | 87f02625-6928-4fe1-8eeb-528e32afa8ec/page-083-tablet-original-review-intermediate.json | 17449c8d9dbe24f37e3844840c7807800ae0d37fe6a022b3c06f42089d7ae183 |
| Mobil 081–085 | 115 | f5df38f2-c291-4048-b684-43a739436757/page-085-mobile-review-and-081-085-progress.json | b934a67ab4d0b3c89a33bd8159085e41bc7f0c3425bd1143679ba5b80be09290 |
| Mobil 086–090 | 87 | 0a6515e6-cbdd-4713-bee1-937c24a54d21/page-090-mobile-review-and-086-090-progress.json | f619114194346b9f3519e3756601307185900a28289381250293e284b0a23e6b |
| Mobil 091–095 | 83 | 7db73ca7-0398-4fc2-9d05-5279000b7781/page-095-mobile-review-and-091-095-progress.json | bf2b40e613687da7dae4ba8376ecbb03e932c27e89aaed4746409590929ef034 |
| Mobil 096 | 20 | 9d815c32-990e-480d-b7d0-fb1b1c327d13/page-096-mobile-original-review.json | 7496fa058005bac1e5e5f438bdf67dc897c9a43adfbab37ffe69bbf0d9d0f6b8 |

A-71 zusätzlich Tablet077 (24,25 CSS-px) und Desktop107–118 (je22,75 CSS-px), jeweils eigenes Original
und Geometrie. Mobil086/087 verdeckt die Karte jeweils den gesamten25,859375-px-Titel;088–090 sind
einzeln frei (44,140625px Abstand). A-70 ergänzt Wortbrüche, lokale Herokontraste und konkrete Bild-/
Textzuordnungsfragen: Mekong081 letztes Vogelbild mit Höhlenunterschrift, Cartago092 schwarzer Titel
auf Kirchenfassade, LuangPrabang082 weiße Titelzeile vor hellem Wasserfall. Motiverkennbarkeit und
redaktionelle Fachfragen bleiben von Lade-/Layoutfehlern getrennt; keine neuen Artbehauptungen daraus.

**A-64 Detailanzeige nativ korrigiert:** Korrekter Abschlussüberblick konnte mit veraltetem179er-Detail
stehen bleiben. Tatsächlicher Quellenpfad isoliert reproduziert (5353b9f4…/repro-result.json,
5a3f7964592efed24b081fe491d6dcbcf5936803fb1ed1c69bb67151ed63bb46). Zwei Module lokal ergänzt:
Dialogöffnung liest zusätzlich den Master; direkte akzeptierte Masterantworten rendern sämtliche Details
und entwerten ältere ausstehende Antworten. Reale aktive Konflikte bleiben sichtbar. Sechs neue Fälle
in bestehender Gruppe: vorher86/92, Kandidat92/92. Root prüft elf Baselines und Kandidaten vor Integration.
76577254…/a64-completed-details-candidate-binding.json,
1cf63df4b0437e4ec3911ded99b4278262790661f3e3a95063d21848de2f380c.
Neues tatsächliches Gesamtgate5c6b25df…: 50 Gruppen/2.086 bestanden, null Fehler/Abbrüche/Skips,
gebundene Quellen unverändert. quality-ci-result.json,
7259b2b93d2367ee4b5c3703e138f6721d9deb2ec24d200e00180213d1ba40b6.
Native Neuladung und reguläre Öffnung bestätigen abgeschlossene Übersicht ohne179er-Sperrtext.
Technische Details nennen151 nicht übernommene neue CoL-Zuordnungen ausdrücklich ohne aktuell offene
Entscheidungen; keine fachliche automatische Auflösung versprochen. Beleg97662220…/
native-explorer-a64-completed-details-accepted.txt,
c5d665d030bf0cba74147d53f18e380ebc6e1567cf952c8adee34b491b916699. Danach wieder Lesemodus.
Keine Datenübernahme/neuer Aufbau durch diese native Anzeigeprüfung.

**Websiteplayer tatsächlich bedient:** Bachstelze Desktop1280×900: Wiedergabe stumm, Zeitfortschritt,
Sprung auf50%, Tempo2x, Lautstärke35→stumm→35, Quelle/Lizenz geöffnet; keine Medienfehler.
Zum Schluss Pause, Zeit0, Tempo1, Lautstärke100 und Quellenfeld geschlossen. CC0-Quellenlink und
Originaldatensatz sichtbar, kein externer Link aufgerufen. Hörqualität/Artstimme/Mobilbedienung bleiben offen.
97662220…/bachstelze-desktop-player-controls.json,
5bb98765459403044abba890b2f91b0df02e53f2f86bfe7d8980b14d412b1830;
bachstelze-desktop-player-restored.json,
aa73d7ba9065fda84022b6b7148eeaee14b3ce0c61f2f16ed815c09bd063154a.

**Private SDK-Inventarprobe, noch ohne FN-Schreibvorgang:** Die eigene.41-Kopie wurde nach geprüftem
133-Dateien-Plan geladen (59Lua/65Node/9Regelquellen). Erstes rein lesendes Inventar hält am erwarteten
Format an. .42-Diagnose belegt nativ isVirtualCopy=false/isVideo=false, fileFormat=JPG statt erwartetem
JPEG; keine virtuelle Kopie gefunden. .43 akzeptiert streng den belegten JPG-Wert,83 synthetische
Gegenprüfungen bestanden,59Lua syntaktisch gültig. Root prüft und integriert nur vier eigene Testdateien.
Integration f74599ea…/private43-integration.json,
5d978c19739f914eb84e84f035406235b23cada5b9ff19a4ca1016e946dd452c;
Gegenprobe3fe201bc…/selftest-result.json,
e9dfd7b9d60d895b150dad35a4a33ad9c80212cca8bd1aef53ec47c54e1faa34.
Native reine Leseprobe hält anschließend bei country als unbekanntem Rohmetadatenschlüssel an;
vorhandener LocationTimeWriter verwendet dafür formatierte Metadaten. Enger Testvorlagenfix nötig;
kein Beleg für fehlende produktive Ortsdaten. Beide nativen Stopps vor Helfer/Reservierung/FN-Schreiben:
97662220…/native-private42-actual-jpg-format.txt,
e25c150c23075e9aa3e3a14aaaf5e7fa4fcb8245a0019699dfe37486deec29a8;
native-private43-iptc-raw-key-stopped.txt,
d7a504529df7b694438d7e9517c53064d7f3c30d7fca4c2a82a459c807a078bd.
Aktuell nur private.43 aktiv, Original.39 deaktiviert; eigener254er-Katalog unverändert ohne FN-Seed.
Kein erfolgreicher Mehrblocktest daraus. Rückstellung auf Original und D:-Hauptkatalog bleibt Pflicht.


**Desktop-Sichtung vollständig, weitere Tabletzeilen:** Alle137 Sitemap-Seiten im Desktop original
vollständig gesichtet. Tablet bis087, Mobil bis096 gebunden:326/411 Zellen,90 vollständige Dreiansichtseiten
und56 Einzelansichten. Sichtung zählt auch vorhandene Befunde. Neue Belege (eigene Sitzungen geschlossen,
Hashes vor/nach stabil; keine offenen Fades/Ladenachproben):

| Sichtung | Originale im Block | Beleg unter temp/explorer/ | SHA-256 |
| --- | ---: | --- | --- |
| Desktop 121/123–126 | 53 | cdf218c1-4926-41e1-8d11-7ff6b14c6959/batch-review.json | 56411bcbe6fba5539dbf58f92c747455661c287baa56f45d3d0cfa0d4c9eba63 |
| Desktop 127–131 | 51 | 58a2e718-5199-4599-8d58-32d67b5e8829/batch-review.json | fa7e32aac3acd1b40d1df7fd53169362269e0e8c6354707c512d0dffb22c8114 |
| Desktop 132–136 | 51 | ed2a43d1-383f-4957-948d-f51626478798/batch-review.json | 853ca203d434a8be70d9539dbfa036bfba1cd5f44c01c22d0fa6450cde11db77 |
| Desktop 137 | 9 | ba96be88-c2b9-4908-9a05-4c0e3c9604a5/batch-review.json | 698a77df19450731b3a06d47693430533d0e6443d8c9771c5058e08ff3d0355d |
| Tablet 083–087 | 135 | 39a44a54-646a-4218-b279-f82c30a152d4/pages-083-087-tablet-original-review.json | e721523eb5d708c3c894fd1f69f9a6f088afa17fe3efbdd46cd33fb97c321606 |

A-71 zusätzlich Desktop121/123–126/129–131/136/137 je22,75 CSS-px. Tablet086/087 haben dagegen
freie Kartenüberschriften(+0,96875px), aber BEOBACHTUNGSTI/PP-Wortbruch. Galerie-Dateinamenalts und
fehlende Captions bleiben A-70; keine neue Zuordnung aus Fotos abgeleitet.

**Eigene254er-SDK-Ausgangslage tatsächlich hergestellt:** Private.44 korrigiert beide IPTC-Lesewege
auf getFormattedMetadata; realistische Gegenprobe wirft bei Roh-IPTC-Schlüsseln. Erster Kandidat wird
dadurch noch am zweiten Lesepfad rot, korrigierte Fassung83/83 einschließlich aller59Lua-Syntaxprüfungen
grün. fb1496b2…/selftest-result.json,
16136e62a5b406baca228d279e158564020fe4b6ba9708b9bca2bcebd268609b.
Root prüft alle133Quellen und integriert vier eigene Dateien: c6fde5a2…/private44-integration.json,
8df11de542abc439c8a586d4be435d8c60db1909fccbaf89081b3ed69dca82e0. Keine Produktquelle geändert.
Reales read-only SDK-Inventar254 eindeutige UUIDs/LocalIDs,53FN-Felder vollständig absent, keine
Stichwörter/befülltenIPTC/FN-Katalogwerte. Digest3739a71bc2daa0eebb200d579cb9a31a258ffe4fe2732e82a510d041b4ff6c1e,
Datei unter3c9d21e3…/audit253/inventory-DIGEST.json SHA
46bd1633b9ef9c50a5ff17a8331435b073ba675141a0cd6df6400ffe277f9948. Nativ bestätigt und gesichert:
97662220…/native-private44-sdk-inventory-completed.txt,
b13d59a6f6ae1ad52b8eb6c321a3d735c14b00cba8a71b7ae0a9be7c1d8b9657.
Root bindet exakten SDK-Katalogpfad, Inventardigest, frische einmalige Kennung und30-Minutenfenster;
16e780e7…/private44-once-initialize-arm.json,
5dabe8fd457d4b44939bdebcfc0e702dc04ea933445d450b33fb0987706d85ae.
Genau einmal nativ bestätigt und erfolgreich abgeschlossen:3c9d21e3…/audit253/seed-complete.json,
d17133670784a8c136d8820183b1c172dd5c438f878f5fcadb9d08888007e21e. Reale Statistik complete254,
Revision0, vier Testarten251/1/1/1, genau zweiFavoriten,126 echte Favoritenfeld-Abwesenheiten erhalten.
Nativbeleg97662220…/native-private44-once-initialization-completed.txt,
8642045e5edc813aebf03872dd734f89a73d81c68ac77ca986e65add0b0efd53.
Die Abschlussmeldung war nach einem unklaren Return-/Refreshausgang geschlossen; frische zurückgegebene
LR-Fensterbindung bestätigt normalen eigenen Testkatalog. Kein Wiederholen der Initialisierung.
Unabhängige gespeicherte254er-Baseline und253er-Apply-/Undo-Grenzproben weiterhin offen, nativeReadyfalse.
Aktuell private.44 aktiv und Original.39 deaktiviert; nur eigener Testkatalog. D:-Rückstellung folgt nach Testende.


**Weitere Originalsichtung und Bedienprobe am24.Oktober:** Tablet001–094 plus104/105/122, Mobil001–102
plus104/105/122 und alle137Desktopseiten ergeben339/411 gesichtete Zellen.97Seiten sind in allen drei
Ansichten vollständig gesichtet,48weitere Einzelansichten;72Sichtstellen bleiben offen. Keine Funktionsfreigabe
aus dieser Zählung. Alle folgenden eigenen Review-Sitzungen geschlossen,0Operationen/Helfer; Root prüft
die Abschlussdateihashes erneut:

| Sichtung | Beleg unter temp/explorer/ | SHA-256 |
| --- | --- | --- |
| Tablet088–092,62Originale | 7221d19d-0920-4599-97cf-3cbd245f4b63/pages-088-092-tablet-original-review.json | 00cc19264485d547b9daef0eeda6a2f0d2de58259ced27feb27170fc27ccfc6f |
| Tablet093,10Originale | 4865ebfa-1e48-4302-9710-8484a16c4dd7/page-093-tablet-original-review-intermediate.json | 4fb19aafbf5f553a0e09c9849b5e1c8f798e443260f74169f3a8d76ab034b66e |
| Tablet094,23Originale | 8f00a467-374c-480d-a8b8-5a0a379f7db7/page-094-tablet-original-review-intermediate.json | c554763ba03ad5248f296657a991aeda3061704934f30ec79dd3513e491adc07 |
| Mobil097–099,78Originale | 19f61ef6-4d75-4b18-a8c9-f853ff6e2ea0/pages-097-099-mobile-original-review.json | 8cf7aec8abdd5eed50c1c471d5f6dea93a5b6ed87f0306abbe193a1e8f8f8fc2 |
| Mobil100,33neueOriginale; Block096–100 | b903a32d-b50b-48fe-8763-8b2b1b4d2016/page-100-mobile-review-and-096-100-progress.json | 3661120f620423cd523d0a187c19148ad2612acc33a36a831c9e50923837d9bc |
| Mobil101–102,33Originale | 588fb4a1-9893-42d8-aea4-f7cb983d71f6/pages-101-102-mobile-original-review.json | 704e9495c4e12f8b998b74f8636800bdbb58e8d8d37a97ae68d42cde902a63d6 |

A-70 ergänzt: Wiederkehrender Beobachtungstipp-Wortbruch und einzelne Grammatikpunkte088–090,
Kontrastfrage am Irazú-Hero093. Mobil097 beschreibt eine generische Bildunterschrift einen schlanken
blau-weißen Langschwanzvogel als „Eine Puter“; genaue Artbestimmung bleibt offen. Mobil100 beschreibt
Kahnschnabel als „afrikanischen Vogel“ mit „schuhförmigem Schnabel“; fachlicher Primärquellenabgleich
steht vor jeder Korrektur.101Porto/PuertoViejo und Schutzgebietsbezeichnung uneinheitlich. Keine neue
Überdeckungs-/Leerbildgrenze dieser Blöcke; keine neuen Inhalte automatisch veröffentlicht.

Desktop-Kopfmenüs tatsächlich per Tastatur bedient: Wildlife und Reisen mit Enter geöffnet, Tab erreicht
ersten Unterlink, Escape schließt und gibt Fokus an den jeweiligen Knopf zurück. Bei zusätzlichem
Maus-Hover waren Links trotz aria-expanded=false sichtbar; separat als Zugänglichkeitsgrenze festhalten.
Sprunglink überspringt Header; folgender Tab erreicht Artikel-Rücklink. Suchfeld „Bachstelze“ zeigt1Treffer,
Tab erreicht den echten Link, Enter öffnet den passenden Artikel. Vorschlagsliste ist laut search.js bewusst
eine Zusatzliste, kein Ausblenden sämtlicher Übersichtskarten; daher kein Filterfehler behauptet.
Beleg97662220…/desktop-header-keyboard-and-hover-check.json,
a684dded3271f6c7622ba71e357da9d6b527ea5ce6338447f86becc610f1f899.

Eigener254er-Katalog nach erfolgreichem Seed regulär beendet (CtrlQ, bestätigtes Ja). Frische native
Fensterliste enthält keinLightroom mehr; Ausgangsdaten werden nun unabhängig aus gespeichertem
Katalogstand geprüft. Keine Wiederholung des Seeds, keinIdentity-Apply/Undo. Vorheriger nativer Stand:
97662220…/native-private44-before-saved-baseline.txt,
548422e9c068d18c7ec591b080f63dd7df57df8e18cb0451b703e888f4373166.


**Fachlicher Quellenabgleich A-73:** Öffentliches Original100/025 unter
/reisen/2024-costarica/bocatapada behauptet für Kahnschnabel eine afrikanische Herkunft und einen
schuhförmigen Schnabel. BirdLife führt Cochlearius cochlearius ausschließlich mit Ländern Mittel-/Südamerikas
einschließlich Costa Rica: [BirdLife-Artdaten](https://datazone.birdlife.org/species/factsheet/boat-billed-heron-cochlearius-cochlearius).
[BirdLife zum Schuhschnabel](https://www.birdlife.org/birds/shoebill/) beschreibt dagegen Balaeniceps rex
in afrikanischen Sümpfen. Der konkrete Herkunftssatz ist damit fachlich widersprüchlich. Eine Vermischung
der Beschreibungen ist eine Schlussfolgerung; genaue Fotoidentität und Ersatztext vor Veröffentlichung prüfen.
Keine umfassende biologische Tatsachenprüfung sämtlicher Texte daraus abgeleitet.

Zusätzliche Desktop-Pfade vollständig gesichtet: /, /cart sowie die tatsächlich im Browser nach
/reisen/uebersicht und /wildlife/uebersicht weitergeleiteten /reisen-1 und /wildlife. Alle20Originale
einzeln von Root angesehen und Hash-/Y0-/überlappende Footerabdeckung vor/nach gebunden. Eigene
geschlossene Sitzung dc8dda11-2a74-43f7-aa05-6c34dacd1701/auxiliary-desktop-original-review.json,
SHA-256580c49567f9056586681652f1ca8b43eaccce28cb0885472ed4b23f7d0efbd9d.
Diese vier Zusatzstellen zählen getrennt von411; Tablet/Mobil noch offen. Warenkorb leer, kein Kauf oder
Formularversand. Reiseseite hält Latium2022 und ausschließlich Montenegro mit Band; Wortbrüche bleiben
Gestaltungsfrage. Kein Pixelgleichheitsbeweis für wechselndes Home-Herofoto.

**Gespeicherte Lightroom-Baseline noch angehalten:** Nach regulärem Schließen fehlen Lock und alle
SQLite-Sidecars; eigener Katalog6488064Bytes hat dennoch WAL-Kopfversion2/2. Der vorbereitete Leser
verlangte1/1 und wird deshalb vor jeder Katalog-SQL-Lesung nicht gestartet. Keine Datenbeschädigung
behauptet. Enger rein lesender Umgang mit exklusiver bytegleicher Kopie wird zuerst synthetisch geprüft;
kein Originalcheckpoint, keine Kopfänderung, keine Sidecar-/Locklöschung.


**Aktueller gebundener Sichtungsfortschritt:** Alle137 Desktopseiten, Tablet001–102 sowie104/105/122
und Mobil001–123 sind vollständig original gesichtet:365/411Zellen,105Seiten in allen drei Ansichten
und50weitere Einzelansichten;46Sitemapstellen offen. Die früher einzeln geprüften104/105/122 werden
nur einmal gezählt. Zusätzlich vier von zwölf Zusatzpfadansichten abgeschlossen, getrennt von411.
Folgende geschlossenen Review-Sitzungen bündeln die neuen Quellen; Root hat alle Abschlussdateihashes erneut geprüft:

| Beleg unter temp/explorer/ | SHA-256 |
| --- | --- |
| 540ab90d-f81e-4d13-9a6e-d35798d81444/pages-093-097-tablet-original-review.json | 5c7dd5d838075a65599eb4a5542b8ceda426659c87c0ac653d7eca1c95a6b511 |
| 776891bc-ab1f-4479-bf6b-7a1ebd035492/pages-098-102-tablet-original-review.json | 969891de1315be2ba4328e6a61cb1fd7e666112a146ccf547019955d3f2237b5 |
| 859270da-e4db-404f-afea-f5a2f2bbd81d/page-103-mobile-original-review.json | af909233129e9f95863587fe89d2dcfdc050dfe4636530ee514eb9dc3092b493 |
| 64785f26-0f8e-4894-bc71-43a3499d76f8/pages-106-107-mobile-review-and-101-107-progress.json | ed2b89f4f990fe87ebe8c7863d63814a60b8f9917b5c1131b0924daa8918bb2d |
| 16762d23-42a7-406e-9619-d18ff7c68291/page-112-mobile-review-and-108-112-progress.json | c3de31a2f672f6a58d4cc4faa66561cfa2ca4f1db86bc963de54350a6e7cf674 |
| 97e6c501-45aa-4f49-a498-1efc7db46ec1/pages-113-115-mobile-original-review.json | ca79d9b9750b6c964575947b99854e64eb0e097d5bdc9b11f196e9e2f8ace573 |
| c4f7907f-3e60-442d-99a3-de54311ee4f7/page-120-mobile-review-and-116-120-progress.json | b05414fa371ec736f6f81271daea10b96e302a1b03c34edd2e938f565100697c |
| 67aa5d2c-d486-486c-ab22-a94b0d9974b1/page-121-mobile-original-review.json | 6110fcca268b36d7514ea9dc1467e250c2fc0d4cac23470440c333013edb8b01 |
| 13f70f64-0b85-4124-ad4c-0da60f393be4/page-123-mobile-original-review.json | 066027ab9e2da9bdcabc3705206756e0c1ee9129af97559fa00d40c554bc5b45 |

A-71 ergänzt Mobil107/109/110/114/115/116/117/121: jeweils volle25,859375CSS-px Überdeckung
der äußeren Kartenüberschrift. Mobil106/108/111/112/113/118/119/120/123 halten dagegen belegten Abstand;
kein pauschaler Fehler für alle Artseiten. Gepard und Grüner Leguan zeigen bewusst fehlende Tierstimme,
keinen Playerfehler daraus. Lokale Hero-Kontrast-/Ausschnitt- und Sprachfragen bleiben zur Abstimmung.

Desktop-Suche tatsächlich in allen vier Regionen bedient: Heimisch Einzeltreffer/Mehrfachtreffer/keinTreffer/
Escape, CostaRica Umlaut-frösch→Erdbeerfröschchen, Island Papageien→Papageientaucher, Afrika Racke→Gabelracke.
Enter bzw. Tab/Enter öffnen jeweils den tatsächlich passenden Artikel. Technischer Beleg5d25c582…/
four-regional-desktop-search-actual-controls.json,
367582ce3f7c9c051e73386542bba6e7ccb4d05e31ab96c9f37a367d8f9bcffd. Mobil-/Tabletbedienprobe bleibt separat offen.

**Fortsetzung am 24. Oktober – aktuelle Grenze:** Alle 137 Desktopseiten, Tablet 001–114 sowie 122
und Mobil 001–132 sind vollständig gesichtet: 384/411 Zellen. Vier der zwölf Zusatzpfadansichten
sind abgeschlossen. Die Zählung enthält Befunde und ersetzt keine Bedienprüfung. Root hat die neuen
Abschlussdateien und geschlossenen Sitzungen mit null Operationen/Helfern unabhängig geprüft:

| Review unter temp/explorer/ | SHA-256 |
| --- | --- |
| a8b2a0df-ee48-45f7-9448-14207ce4b7ec/pages-103-106-109-tablet-original-review.json | 39e7e5ba650bbe3a3f4dc8f35a20cdf08c05e78fe42a97364907a8c8b9cadb22 |
| 46092e29-0df4-4aec-af2a-4e69779dfa7b/pages-110-114-tablet-original-review.json | cebd6a96db8ed657136a24ea7e7294ae2e815d5bc7151be469b07704e32a9feb |
| a2ca54f4-8a31-432b-9125-ff1134b949cc/page-126-mobile-review-and-121-126-progress.json | e3e0cfc708492cfca8d321681f56917cbca316b533bbbd58c7cb8d3a355dd397 |
| 1f6d7b5e-5d91-44ab-81ec-705c03735bad/page-131-mobile-review-and-127-131-progress.json | 8f33a3a855bc280e84d8dbeef3471aa7faf72dbb50df030e5c7ccf0fac3d821c |
| 29573b3f-7953-413b-8ea7-56e65708c949/page-132-mobile-original-review.json | d0d09d453bd73647e9bb4e6763e037088679fd83d0d986458bd7a0bdf7df1b3d |

A-71 ergänzt Tablet 110–114 und Mobil 132 mit verdeckter Kartenüberschrift. A-72 ergänzt Mobil 126
Gabelracke: tatsächliche Überschrift auf letzter Textzeile; betroffene Blockrechtecke überlappen 59 CSS-px.
Wortbrüche, dunkle/kleine Bildausschnitte und einzelne Sprachfragen bleiben A-70 zur Abstimmung.
Beim letzten Waldmotiv von Mobil 131 ist das Tier nicht zuverlässig als Rebhuhn erkennbar; keine andere
Art behauptet. Keine automatische Inhalts- oder Layoutveröffentlichung.

**Alle 63 öffentlichen Artseiten zusätzlich auf Daten-/Medienladung geprüft:** 63 Karten, 126
Statusgrafiken und 60 Tondateien geladen; drei Arten zeigen ausdrücklich „Keine Tierstimme verfügbar“
(Grüner Leguan, Gepard, Goldbaumsteiger). Alle fünf Module je Seite vorhanden; wissenschaftlicher Name
im Steckbrief und Artfeld der Taxonomie stimmen auf allen Seiten überein. Root hat sämtliche 63 Einzelbelege
gegen ihre Prüfsummen gelesen. Beleg `5d25c582…/all-63-live-modules-independent-root-review.json`,
SHA-256 `6c824bd414a8e02283168c115e7c8d90bc7772868160cc3b14ffe9821a68ed0e`;
ursprüngliche Lieferung `all-63-species-live-module-delivery.json`,
`82c729d324e408337b3ca428938cd8f1f074d96dee9ff83f279731b00c74a58f`.
Dies bestätigt Laden und Konsistenz der sichtbaren Daten, keine Hörqualitätsprüfung oder vollständige
biologische Tatsachenprüfung aller Texte und Fotos.

**Lightroom – unabhängige Datumsquelle geklärt:** Der unveränderte eigene Katalog verwendet trotz
regulärem Ende den SQLite-WAL-Kopf. Ein synthetisch geprüfter immutable-Leser liest deshalb ausschließlich
eine exklusive bytegleiche Kopie ohne Sidecarerzeugung. Zwei anschließende Prüfergrenzen sind gesichert:
der SDK-Seedmarker ist ein unverzierter UUID-Text; SQL-Importdatum ist nicht das vom Statistikcode gelesene
SDK-Feld `dateTimeOriginal`. Außerdem ergänzt der echte Speicherweg `catalogPath` zum Index. Diese
Quellenbrücken werden vor einer bestandenen Baseline korrigiert, ohne Statistikfelder wegzufiltern.

Privates Plug-in 0.4.24.45 erweitert ausschließlich den bereits geprüften Leseeinstieg. Sechs Änderungen
und 127 unveränderte Quellen sind gebunden; die sechs alten .44-Dateien bleiben bytegenau im Beleg
`8357a9ab…/private45-integration.json`,
`082312c1c78ab5c4d1459a0c31481239cbe86a078bfc37784d4723b4ba671e68` erhalten.
Manager bestätigt nativ .45 im eigenen Testpfad, Original deaktiviert. Reine SDK-Lesung erfolgreich:
alle 254 künstlichen Bilder haben `dateTimeOriginal` tatsächlich nicht gesetzt (`nil`). Beleg
`3c9d21e3…/audit253/original-dates-4ca252c089025ac05e5200550a7646bc10535815120cd4e7e6850e1360af630d.json`,
`af70de85f5e0f7ab788813c63e2830f09bdf1a8af29f16a562a82e0c9952941b`.
Native Abschlussanzeige `97662220…/native-private45-sdk-original-dates-completed.txt`,
`e0c4ab7362f1dc30db493c77e86ab73838999a2d3e7097b7677d1cefb07ad429`.
Keine Foto-/FN-Metadaten geschrieben, kein zweiter Seed, noch kein Identitäts-Apply oder Undo.
Anschließend regulär geschlossen; frische Fensterliste bestätigt um 06:54:12.484 UTC kein Lightroom.
Unabhängige gespeicherte Baseline mit dieser echten Datumsquelle bleibt bis zum erfolgreichen Lauf offen.

**Gespeicherte Baseline jetzt bestanden:** Vorbereitung `246cac74…/preparation-result.json`,
`6fd12ff48c03b14312cc06d5f297b1e9d4de6cb3aaef821d7a3614b36840fefa`, besteht 144/144 synthetische
Gegenproben. Root liest Core, Diff und Brücke, prüft sämtliche Artefakthashes und erzeugt nach bestätigtem
nativen Ende eine neue exklusive Testkatalogkopie. Original und Kopie sind vor/nach bytegleich;
Lock/WAL/SHM/Journal fehlen. Kein Checkpoint, keine Kopfänderung oder Migration. Kopie
`3c9d21e3…/catalog/saved-evidence/baseline-private45-48c4f515-841f-4b43-baf3-98a8d72ee052.lrcat`,
SHA-256 `a3b5d500eb620685b8352b573a15746a6f21ff022a3b6fb0a16421066191815a`.
Rootbindung `21711b0a…/baseline-private45-new-copy-review.json`,
`a327c5f9e9a66868821c282ce155355e61ff8f809d1cc42d3c5c586ebf9dfbe7`.

Der exakt gebundene rein lesende Sechs-Argument-Prüflauf endet mit Exit 0. Eigene Belegsitzung
`980ff869-52f6-4ead-8e08-02c193784a04/catalog-baseline.json`,
`a0984f96f8070223d72c8568bc5213881b5cd43294568018d0178e78789fb1df`, geschlossen, null Operationen/Helfer.
Root prüft Ergebnis erneut: 254 Fotos, alle 53 FN-Rohwerte einschließlich Anwesenheit, 126 tatsächlich
abwesende Favoritenwerte, 126 `no`, zwei `yes`, Rollen 251/1/1/1, sämtliche IPTC- und Keywordwerte erhalten.
Statistik `complete`, Revision 0 und gesamtes unabhängig aufgebautes Aggregat exakt, einschließlich
`catalogPath` und leerer ursprünglicher Datumstage. Geschütztes SQL-Importdatum bleibt erhalten.
Identity-Journal unverändert abwesend, null Läufe/Fotos. Der eingeschränkte Eigentümerprozesscheck
war zuvor mit EPERM verweigert; der gezielt freigegebene Prüflauf besteht ohne Schutzlockerung.
Damit ist die Ausgangsbaseline abgenommen; nativer Identitätsplan, 250+3-Änderung und 250+3-Rücknahme
mit vier gespeicherten Zwischenprüfungen bleiben offen. `nativeReady=false`, kein produktiver Schreibtest.

**Mobile Bedienprüfung:** Hauptmenü sowie Reisen-/Wildlife-Untermenüs tatsächlich mit Tab/Enter/Escape
bedient. Erster Tab erreicht „Über uns“, Enter im Ordner erreicht „Zurück“, Escape kehrt zum jeweiligen
Ordner zurück; nächstes Escape schließt und fokussiert den Menüöffner. Beleg `5d25c582…/
mobile-navigation-actual-keyboard-check.json`,
`72f648e55bf739d47b7f705795888af80c394f03893dec2f5670563874a62c5e`.
Bachstelze-Suche mit Tab/Enter öffnet passende Artseite. Player tatsächlich gestartet, Zeitfortschritt,
50-%-Position, Tempo 2x, Lautstärke 35 und Stumm/Wiederherstellen sowie Quellen-/Lizenzaufklappen geprüft.
Anschließend pausiert, Position 0, Tempo 1x, Lautstärke 100 und Lizenz geschlossen, kein Medienfehler.
Beleg `mobile-player-actual-controls.json`,
`b0558c34919c6392a5b9b9a18be8c69f8f0df484c7e6b5f7bdc438fa6bb9e9b7`.
Das automatische Tonende wurde bei der Bedienung berücksichtigt; keine Hörqualitätsabnahme.

A-74 separat belegt: `mobile-map-overlay-keyboard-failure.json`,
`475be06b5a3046ad0fc41c59518cc1b07f233b1e8fdb2f503a9c6c0706cee1b6`, und Original nach Escape
`mobile-map-overlay-after-escape.jpg`,
`2f7566e0e49afc3b0af06a35da640f2a2ff3460550b5919278044a3ca375940f`.
Bild ist nach regulärem Scrollen vollständig geladen; vorheriger Klickversuch auf noch höhenloses
Lazy-Bild ist keine Ausfallbehauptung. Klick schließt die Karte anschließend regulär. Tablet-Gegenprobe
und lokale Korrektur noch offen.

**Unterbrechung auf ausdrücklichen Nutzerauftrag am 24. Oktober:** Felix verlangt Arbeitsstopp und
Computerneustart. Alle Agenten haben angehalten und ihre eigenen Sitzungen geschlossen. Kein Auditabschluss.
Wiedereinstieg ausschließlich auf neuen Nutzerauftrag. Keine Bereinigung oder Veröffentlichung beim Stop.

- Website: Desktop vollständig, Mobil vollständig einschließlich vier Zusatzpfade agentengeprüft;
  Tablet vollständig bis 125 einschließlich des früher geprüften 122. Zwölf Tablet-Sitemapseiten und vier
  Tablet-Zusatzpfade bleiben offen. Root hat die zuletzt gelieferten Reviewdateien noch nicht alle unabhängig
  nachgeprüft; der führende gebundene Zähler bleibt deshalb konservativ beim vorherigen Stand.
  Tablet 126 nur Originale 001–012 von 27 gesehen; Fortsetzung ab `page-126-tablet-scan-013.jpg`
  unter Empfänger `5d25c582…`. Unterbrechungsbeleg `ec33d843…/page-126-tablet-original-review-interrupted.json`,
  `b841a3bb6d334c2cf0073883a3b74505c2adcb674afc568d2ffae7cca8753fa3`.
- A-71/A-72: Ableitung noch kein fertiger CSS-Kandidat. Geschlossener Zwischenstand
  `8c32f907…/preparation-status.json`, `bc7e1c083e78a018008dfeb866a69923c75408c745227d160999a9564942a8ff`;
  tatsächlichen Ablageort von Tablet 107 vor Fortsetzung klären. Amsel wurde wegen des widersprechenden
  DOM-Rechtecks nochmals visuell nachgesehen und hat keine verdeckte Kartenüberschrift; kein Selektor dafür.
- A-74: `map-loader.js`, zugehörige Verhaltenstests und lokale Footer-Cacheversion 1.0.9 geändert.
  Gezielte 15/15 Tests bestanden. Native Browserabnahme des Kandidaten und breiteres Qualitätsgate noch
  offen. Öffentliche Version unverändert 1.0.8; keine Veröffentlichung. Eine isolierte lesende Vorschau ist
  unter `97b51981…/preview-delivery.json` gebunden und wird zum Neustart geschlossen. Der zusätzlich
  erstellte kompakte Kartenentwurf ist ausschließlich Vorschau, keine Produktübernahme oder Entscheidung.
  Felix hat hierzu nach einer Meinung gefragt; vorgeschlagene kompakte vollständige Vorschau und
  Vergrößerung in allen Ansichten müssen erst konkret angesehen und abgestimmt werden.
- Lightroom ist regulär geschlossen. Bestandene echte Baseline `980ff869…` bleibt gültiger Ausgangsnachweis.
  Vier-Checkpoint-Vorbereitung `26f88ed4…/preparation-result.json`,
  `88cb13393385e4b93bfeade84d4e6fa3e02acb10865a7d7e9fa4b709fde6172f`:
  `complete=false/reviewReady=false/nativeReady=false`, kein Ausführen/Übernehmen daraus. Abschlusslauf
  unterbrochen, kein finaler Testerfolg. Noch kein Identitäts-Apply/Undo. Das Original-Plug-in ist für die
  eigene Testphase weiterhin deaktiviert; bei späterer Rückstellung Original aktivieren und ausschließlich
  `D:\Lightroom Katalog\Lightroomkatalog aktuell.lrcat` verwenden sowie gemeinsame Importeinstellungen
  wiederherstellen. Eigener Testbaum und historische Belege bleiben erhalten, Eigentümer wird geschlossen.
- Explorer-Taxonomieauftrag abgeschlossen; kein neuer produktiver Aufbau. Browserbeleg-Empfänger und
  eigene Vorschau erhalten kontrollierte Schließanforderungen; bestehende Originale bleiben dauerhaft.

Schließen vor Neustart bestätigt: beide Browserbeleg-Empfänger, operative Testbaumsitzung und eigene
Kartenvorschau sind `closed`, null Operationen/Helfer. Empfänger binden 3.916 bzw. 1.236 vorhandene
Originaldateien, jeweils ohne fehlende Dateien; technische Abschlussbelege `97662220…/evidence-result.json`
(`2dfe77a57fbb8cf68e4cc7dc7375b01231e8cabfbb12afdea81ce353646643d8`) und
`5d25c582…/evidence-result.json`
(`0d5d12bb0517fe7e36e39779558e82f7d8554a478957b8f678d2ab1e2875fe2a`).
Vollständige Dateibindung bedeutet keinen Abschluss der noch offenen Seiten-/Funktionsprüfungen.

**Fortsetzung nach dem Neustart am 24. Oktober:** Felix beauftragt die Wiederaufnahme und ausdrücklich
parallele Arbeit an Website, Lightroom und Explorer. Bestehende Befunde ohne Lösungsvorschlag sollen
ebenfalls angesprochen werden; eindeutige übrige Fehler direkt lösen und testen. Die bisherigen Daten-/
Veröffentlichungsgrenzen bleiben bestehen. Neue getrennte Agenten besitzen Tablet-Restreview,
Lightroom-Checkpoint-/Owner-Wiederaufnahme und Explorer-Restmatrix/Layoutvorbereitung. Root besitzt
Browser-/native Bedienung, Kartenmodul und zentrale Dokumentation. Frische native Fensterliste zeigt
zunächst weder Lightroom noch Explorer; kein vermuteter laufender Prozess wird fortgesetzt.
Geschlossene alte Eigentumssitzungen bleiben geschlossen. Neue Browserbelege entstehen unter
`c6b53458-f183-4b38-827a-075739ebfa07`; alte Originale und technische Manifeste bleiben unverändert.

**Abgenommene Restpakete nach dem Neustart:** Alle 137 Sitemapseiten sind inzwischen vollständig in
Desktop-, Tablet- und Mobilansicht visuell gesichtet (411/411), dazu vier Zusatzpfade in zwölf Ansichten.
Root hat 16 abschließende Reviewdateien und deren geschlossene Sitzungen unabhängig gebunden:
`03eafa44-ec3b-46d1-b7a1-de205d264b43/root-late-receipts-check.json`,
SHA-256 `65b9926a87465e1e81aa1c4a3e860feb7efe787d1c6d7c3f5765395c46ca5d42`.
Grünfink130 hatte trotz fertiger Folge eine echte Aufnahmelücke. Zwei Nachaufnahmen bei Y1536/2048,
jeweils 768×1024, schließen sie einschließlich Headerreserve; führender Review
`62a5cd11-47e4-4777-9bd0-6fb5ff110c09/page-130-tablet-original-review-completed-with-supplement.json`,
`908db9bbfeb2195216a10ef1d5c3c6db72598654caed865285d158c33ea88c36`.
Dies ist vollständige visuelle Abdeckung mit Befunden, keine pauschale Funktions- oder biologische Vollabnahme.

A-09: Root bedient den Original-Karteneditor im isolierten eigenen Amselbestand und den echten
Dateiauswahldialog. JPEG mit lesbarem Header ohne Bilddaten ergibt 400 und verständlichen Decoderfehler;
„Karte ersetzen“ bleibt gesperrt. Gültiger erneuter Dateiversuch ergibt 200, sichtbare Vorschau und
freigegebene Übernahme. Editor ohne Speichern geschlossen. Alle 13 eigenen Ausgangsdateien sind nach
beiden Versuchen bytegleich; gebundene Quellen unverändert, eigener Runner geschlossen/0/keine Helfer.
Rootabschluss `af3aa6d7-6fe5-4892-a987-f841f7c0e08a/root-a09-and-tablet-gap-acceptance.json`,
`7ffd965322acfa95e6a818a1b9667ce7fe0746fc7a923a55cacf2bfd4323fc7b`.
Die fünf gesperrten Hintergrundabrufe gehören zur Isolation, nicht zu produktiven Ausfällen.

A-26: Beide exakten Status-GET-Pfade besitzen nun eine 15-Sekunden-Grenze mit AbortSignal und
Timerbereinigung. Bestehender begrenzter Backoff und Dialogbindung bleiben erhalten. Vier rote
Vorherproben; final 148/148 passende Verhaltenstests einschließlich verspäteter Antwort, echtem Abort,
endlicher Wiederholungen, geschlossenem Dialog und fremder Vorschau. Finaler Quellen-/Logbeleg
`2d5d10ac-02a0-4452-8372-d18573f097a7/a26-final-close-safe-behavior.json`,
`6e2ecd3df6f135eaa8cf1d0a7fed7a01edf7550cad6d151e91b34781a258d2ea`.
README und Sicherungsvertrag angepasst. Die zwischenzeitlich fremde Fixture-Stilgrenze wurde vom
zuständigen Websiteagenten korrigiert; dessen spätere globale Stilprüfung besteht. Neuer Gesamtgate-
und tatsächlicher UI-Hänge-Nachweis stehen noch aus. Keine Schreib-/Startwiederholung eingeführt.

**Neue Nutzerentscheidungen:** Wildlifeübersicht: Heimische Tierwelt zuerst, übrige veröffentlichte
Kategorien deutsch alphabetisch, Kategorien mit „In Arbeit“ zuletzt. Aktueller Sollstand Heimische
Tierwelt → Afrika → Costa Rica → Island → Asien. Enger lokaler JS-/CSS-Kandidat besitzt 45/45 Tests;
echte Darstellung und Veröffentlichung bleiben gesonderte Schritte. Rebhuhnmotiv
`_2200740_20260220_16_29_22.jpg` ist ausdrücklich von Felix als Rebhuhn bestätigt und bleibt unverändert.
Frühere vorsichtige Bildzuordnungsfrage ist damit geklärt. Für Boca Tapada legt Felix den folgenden
Ersatztext fest; die damalige redaktionelle Wiedergabe normalisiert „nachts“ gegenüber seinem „Nachts“:

> Der Kahnschnabel ist ein Reiher Mittel- und Südamerikas. Sein auffällig breiter Schnabel ist ein
> charakteristisches Merkmal, mit dem er in der Dämmerung und nachts Beute wie Fische, Krebstiere und
> kleine Amphibien aus dem Wasser schöpft.

An dieser historischen Vorbereitungsstelle noch keine CMS-Übernahme. Der tatsächliche Einbau am
25. Oktober verwendet Felix' ursprüngliches „Nachts“ wortgetreu; aktueller Nachweis am Ende dieses Abschnitts.
Alttextworkflow, Android-App und Artseitengenerierung bleiben
die ausdrücklich vereinbarten Aufgaben nach dem Audit.

**Lightroom – echter 250+3-Wiederanlauf bestanden, Rücknahme noch offen:** Privates .45 im
eigenen Kunstbildkatalog, Lauf `60a8f274-fb27-474d-942e-3710426bff00`. Nach dem ersten gespeicherten
250er-Block nativ pausiert und regulär geschlossen; neue exklusive Katalog-/Journalkopien bei
nachgewiesen geschlossenem Lightroom. Rein lesender Nachvergleich
`2aae41f5…/capture-result.json`, SHA-256
`db277ea8dc0b07375bb61bf7defe5912fbf54f8cab852d28eb7cfb003fc19dd8`, besteht exakt 250 angewendet,
drei vorbereitet, Statistikrevision 1. Nach erneutem Öffnen ausschließlich diesen Lauf fortgesetzt:
native Meldung „Geändert: 3 Fotos“, gebunden unter `c6b53458…/private45-native-apply-complete-253.json`,
`af1bc36a0b4ab7e65cfa6fc8df7f4c8f3be491ad3f0607c95c0c7bbf0f850968`.
Reguläres Ende um 08:51:35.328 UTC bestätigt. Zweiter unabhängiger Nachvergleich
`31519157…/capture-result.json`, `50e375e66c65af7b8b5ecbe7be17e3789299c31a68bc33d838a95a45eb64a8f3`,
bestanden: 254 Katalogfotos, 253 Journalfotos, zwei bestätigte Blöcke 250+3, alle angewendet,
Statistikrevision 2. Alle 53 FN-Rohwerte samt tatsächlicher Abwesenheit, geschützte IPTC-/Keywordfelder,
Favoriten, gesamter inkrementeller Index und unabhängig aufgebautes Aggregat stimmen exakt überein.
Keine produktiven Fotoänderungen aus diesem Test. 250+3-Rücknahme und Rückstellung auf Original-Plug-in
und D:-Hauptkatalog bleiben offen; keine Gesamtabnahme daraus.

Der eingefrorene Vorbereitungshilfe-Direktaufruf hatte einen reproduzierten zyklischen Modulstart
mit „unsettled top-level await“. Ein getrennter Einstieg verwendet unverändert dieselben geprüften
Exportfunktionen; echte Negativproben und positiver Drei-Argument-CLI-Lauf auf dem vollständigen
Apply-Nachweis bestehen. Beleg `b7eabc04…/known-phase-cli-positive-countercheck.json`,
`734c9f082cede507ddb0304334818f9fee3f9cf71d3ff33330ba914f6bddaa63`.
Dies betrifft den eigenen Audithelfer; Produktivquellen und eingefrorene Hashketten wurden dafür
nicht geändert. Folgevorlagen zunächst deaktiviert; Aktivierung der engen privaten Rücknahmebindung
nach erneuter Rootprüfung getrennt erfolgt.

**Lightroom – vier echte Kontrollpunkte und Rückstellung am 24. Oktober bestanden:** Die erste
Rücknahme wurde vor dem ersten Fotoblock durch die private Pauseproben-Sperre angehalten. Der
geschlossene unabhängige Vergleich `53d19cbf…/undo-preblock-independent-proof.json`
(`9be7b30a5ea38806fe08d3d6c6081ab8c5d0da29b5389ff6b90519d7a81febbe`) bestätigt alle 254 Fotos
und Statistik unverändert; nur 253 Rücknahmen im Journal vorbereitet. Die genaue Ursache dieses
einmaligen privaten Sperrstopps ist nicht bewiesen. Nach nachgewiesenem vollständigem Prozessende
denselben Lauf mit unveränderten Quellen und derselben gültigen Bindung fortgesetzt, keine neue
Rücknahme angelegt. Erster Rücknahmeblock tatsächlich bei 250 gespeichert, nativ pausiert und regulär
geschlossen. Dritter rein lesender Vergleich `dbdad729…/capture-result.json`, SHA-256
`0ef7ef6ac43a15945895b68f465e96f1478c5d2d4ea71f013967a17cdf5f8660`, besteht:
250 zurückgenommen, drei vorbereitet, bestätigte Blöcke 250+3+250, Statistikrevision 3.

Nach Wiederöffnung genau drei eindeutige Restzustände gelesen, null ungeklärt; native Abschlussmeldung
„Zurückgenommen: 3 Fotos“ unter `c6b53458…/private45-native-undo-complete-253.json`
(`913fdb644e551ec0ac555dac7edeb15aad71f81dfdfe1f6b7cc54598258a4cdb`). Erneutes reguläres Ende,
neue exklusive Katalog-/Journalkopien und vierter eingefrorener Nachvergleich
`c26c4ff1…/capture-result.json`, `f905b5af401e118d084c9a8eaebdac080036c03c31920e9a0e8231c314b42da1`,
bestanden: 253 zurückgenommen, keine offene Rücknahme, vier Blöcke 250+3+250+3, Statistikrevision 4.
Alle 53 FN-Rohfelder samt Abwesenheit, geschützte Metadaten/Stichwörter, Favoriten, vollständiger
inkrementeller Index und unabhängig berechnetes Aggregat sind an jedem Kontrollpunkt exakt geprüft.

Original-Plug-in 0.4.24.39 wieder aktiv, private .45 deaktiviert; aktuelles produktives CoL/Master/Paket
nativ übereinstimmend. Tatsächlicher Hauptkatalog `D:\Lightroom Katalog\Lightroomkatalog aktuell.lrcat`
in den Katalogeinstellungen bestätigt. Gemeinsame Importoptionen zurückgestellt: Verschieben,
Duplikatsperre an, Entwicklung „Import“, Metadaten „Keine“, leeres Stichwortfeld; null Importfotos,
kein Import ausgeführt. Belege `c6b53458…/private45-original39-restored-active.json`
(`0a479168265a91d7ee48dd48a5624e4f1cc94e21c5efcbb24e6dca253fe5aec0`),
`private45-restored-main-d-catalog.json`
(`91b9d584351910459ac7dad732c26ef56b941c8984f38bcd8a0ea325f33c445b`),
`private45-shared-import-settings-restored.json`
(`a0c978b03ded738ec08523eee54ad4df8bb329adcbabf2df4d03179f91ce18e3`). Eigene neue
Eigentümersitzung dd38c5a6… regulär geschlossen, null Fehler. Keine produktive Fotoänderung durch
den Mehrblocktest. Dies schließt diesen Identitäts-Apply-/Undo-Fall, nicht das gesamte Audit.

**Gestaltungsentscheidung Artseiten:** Felix bestätigt den konkret gezeigten V3-Rotmilanentwurf:
vollständiges, begrenzt hohes Titelbild; Überschrift und Rückknopf darunter. Root hat ihn tatsächlich
bei 1280×900, 768×1024 und 390×844 geprüft, einschließlich Größenwechsel und jeweils aktueller
Headerreserve plus 12 px. Originale `c6b53458…/design-v3-rotmilan-{desktop,tablet,mobile}.jpg` und
zugehörige DOM-Belege. Umsetzung auf weitere Artseiten beauftragt; noch keine Veröffentlichung oder
Abnahme sämtlicher Artseiten. Andere Entwürfe für Home, Spenden, Reisegalerie und kompakte Karten
bleiben gesondert abzustimmen.

**A-26 – tatsächliche Statusdialogprobe abgeschlossen:** Neuer eigener Runner 1785d434… verwendet
unveränderte aktuelle Frontendmodule mit 13 künstlichen Ausgangsdateien; sämtliche Auftrags-/Schreib-
und Archivscanpfade gesperrt. Je Backup und Pipeline fünf tatsächlich hängende GETs: Abbruch nach
15,003–15,018 Sekunden, anschließend Pausen von etwa 1/2/4/8 Sekunden und Ende der automatischen
Fehlerfolge. Sichtbare Meldung unterscheidet den letzten bestätigten Stand vom aktuell nicht verfügbaren
Status. Backupdialog während der Folge geschlossen; bleibt geschlossen. Erste Pipelineschließung war
erst nach fünf Zeitlimits und wird nicht als Schließen während dieser Folge gewertet. Zusätzliche
Pipelineprobe: geschlossene AX-Aufnahme bereits während GET 298 gespeichert, dessen Zeitlimit danach;
spätere tatsächliche Antwort auf GET 302 nach 13,005 Sekunden öffnet den Dialog nicht wieder. Das ist
kein Zeitlimit für 302 und keine alte Antwort nach einem neueren erfolgreichen Abschluss. Anschließend
beide Statusdialoge ausdrücklich frisch geöffnet und die wieder verfügbare synthetische Abschlussanzeige
ohne Lesefehler gesehen. Keine echten Sicherungs-, Pipeline- oder Taxonomieläufe daraus.

Eigener Browsertab geschlossen, Runner regulär Exit 0, alle 13 Ausgangsdateien unverändert und alle
182 gebundenen Quellen ohne Drift. Final `1785d434…/a26-final.json`, SHA-256
`866c3a4e6e6858efa3cb6743edfce391343be3ef407757f3bffe1379ae60d1b9`.
Unabhängig alle Eingänge nachgehasht, sechs Originalbilder tatsächlich gesehen und neun AX-Belege
geprüft: `65f5af16…/a26-independent-native-evidence-acceptance.json`,
`433d32eaacdab13116feb5e5acac95e75a938a514c8f03c1bfce3f3bbfe2118e`; Sitzung geschlossen/0/keine
Helfer. Neues breites Qualitätsgate bleibt offen. In diesen Aufnahmen zusätzlich sichtbarer
Aktionsrasterfehler A-75 wird separat korrigiert; die abgeschlossene A-26-Quellenbindung bleibt erhalten.

**A-75 – reduzierte Statusanzeige nativ bestätigt:** Rote Vorherprobe und grüner Quellen-/Testbeleg
`44bfa7b5…/status-choice-green.json`, SHA-256
`13fd0e7dfe9306c71abbb92a7358d4e7976789f293c098952feabd71c14de337`. Root hat danach in einer
neuen geschützten Sitzung 247f38c6… vier tatsächliche Statusansichten und den ausdrücklich geöffneten
freien Aktionswähler gesehen; DOM-Primitivwerte und Originalbilder unter
`c6b53458…/a75-{backup-running,backup-completed,pipeline-running,pipeline-completed,explicit-idle-selector}`.
Viermal Hidden-Attribut und `display:none`/null sichtbare Auswahlknöpfe; beim freien Wähler dagegen
kein Hidden-Attribut, `display:grid` und 13 sichtbare Knöpfe. Kein Start, Import oder Speichern von
Produktdaten. Eigener Tab geschlossen, Runner Exit 0; Final `247f38c6…/a26-final.json`,
`ef9d8a7e52fa8c7d2dc26be63e4e58ef5c17879a3329c5b0ca36dce16b9f97dd`, 13 Ausgangsdateien
unverändert und 182 Quellen ohne Drift. Neue Gesamtprüfung nach Integration der noch laufenden
Websiteänderungen; der abgeschlossene A-26-Ausgangsnachweis bleibt unverändert.

**Artseiten-Grundlayout – lokale Integration nach Nutzerentscheidung:** Neues öffentliches Modul
`species-hero-layout.js` 1.0.0 mit den zugehörigen Standard-CSS-Regeln, Footer-Einbindung,
Pages-Positivliste und vorhandener Testgruppe verbunden. Erkennung erfolgt über Artseitenroute und
vollständig geprüfte vorhandene Struktur, ohne Liste einzelner Blockkennungen. Zusätzliche unbekannte
Inhalte oder Eingabefelder sperren die Umgestaltung; Bildquellenänderungen werden mitbeobachtet.
Unabhängige Gegenprüfung des korrigierten Moduls `6c865e28…` bestanden; Beleg `7e0346ec…`,
`50e5f90af037556d09bbc84c5c90cfd58bfd415fdc2574b210ea20de32d95fa3`. Modul 50/50,
Barrierefreiheit 15/15 und Pages-Pfade 7/7 bestanden. Der erste eingeschränkte Lauf konnte seine eigene
Verzeichnisverknüpfung nicht anlegen; isolierter erlaubter Gegenlauf prüft denselben Schutz erfolgreich.
Keine Schutzregel geändert. Lokale Übertragung auf alle 63 gebundenen Artseiten in drei Ansichten,
CMS-Kompilierung und öffentliche Abnahme noch offen; keine Veröffentlichung erfolgt.

**A-71/A-72 – erste unabhängige Desktopannahmen:** Kleiber 107 und Goldbaumsteiger 134 mit allen
26 tatsächlich angesehenen Original-JPEGs, gebundenen Quellen und stabilen DOM-Messungen angenommen.
Beim Kleiber Abstand Kartenüberschrift zur Karte von −22,7738 auf +6,7616 CSS-px, vollständige
einzeilige Überschrift; übrige Karte, Texte, Bildquellen und Links unverändert. Goldbaumsteiger in
diesem Desktop-Fokusbereich unverändert und ohne neue Überschneidung. Beleg `0e1b4d34…`,
`8bce5fe1a32496a67f6ed3b729b73642e5a0aaff1c3696e5739621efad8c8176`.
Frühere instabile Aufnahme ausgeschlossen. Die weiteren Seiten und Ansichten folgen; dies ist keine
neue Vollseiten-/Galerieabnahme und keine öffentliche Übernahme.

**A-51 – enger nativer Detailfensterlauf gestartet:** Eigene neue private Plug-in-Kopie .46 und
eigener Sechs-Kunstbild-Katalog unter `e75caf12…`, ohne alte Eigentümersitzung erneut zu beanspruchen.
Root prüft 145 Quellenbindungen, startet eine neue auf eine Stunde begrenzte Eigentümersitzung
`e979d0f6…` und liest ausschließlich eine exklusiv angelegte geschlossene Katalogkopie. Vorhervergleich
`33c1e366…/a51-before-capture-result.json`,
`8f10f306fee438105c1285db40dbcd4d309812b4c5f3c275307d81c5dc7e2cc4`: sechs Identitäten, rohe
FN-Felder, IPTC, Stichwortrelationen und Statistik unverändert. Aktive private .46 und eigener Katalog
nativ bestätigt. Nur Suchen/Lesen/Schließen beauftragt; kein Zuweisen, Namensspeichern, Export oder
Statistikaufbau. Abschließender Nachvergleich und Rückstellung auf Original .39/Hauptkatalog D: bleiben
für diesen neu gestarteten engen Lauf offen.

**A-51 – enger Lauf und Rückstellung abgeschlossen:** Tatsächlich fünf Detailaufrufe mit zwei
unterschiedlichen künstlichen Taxa. Escape auf erster und letzter Seite, Schließknopf auf erster Seite,
Fertig auf letzter Seite sowie Zurück/Weiter erhalten Suchtext und Auswahl. Neue Suche „gamma“ lädt
die andere Art und deren passende Details; Tab erreicht nach Rückkehr regulär die Bereichsauswahl.
Normaler Schließknopf beendet das Zuweisungsfenster. Die tatsächlichen Fenster und Originalbilder
stehen in den einzelnen `c6b53458…/a51-*.json`-Belegen; keine pauschale Abnahme anderer
Windows-Systemschrift-/DPI-Konfigurationen.

Nach regulärem Lightroom-Schluss wird eine neue exklusive Kopie gelesen, nicht der Quellkatalog:
`a5bb3f67…/a51-after-capture-result.json`, SHA-256
`712c0194045214307866f9ad78b43593c9ad503684d3b5b8ad0afdf0ff43d5cc`. Alle sechs Testeinträge,
FN-Rohwerte, IPTC, tatsächlichen Stichwortrelationen und Statistik exakt gegenüber Baseline und
Vorherbeleg; beide Dateien während der Lesung unverändert, alle 145 Quellen weiterhin gebunden.
Die erste Schließanforderung wartete noch auf die normale Lightroom-Bestätigung; Fenster-/Lock-Gates
verweigerten vorher die Nachkopie. Erst nach Bestätigung, tatsächlichem Fensterschluss und fehlenden
Neben-Dateien erfolgte der Nachvergleich. Keine offene Katalogdatei als geschlossene Kopie ausgegeben.

Original .39 wieder nativ aktiv, private .46 deaktiviert; `a51-original39-restored-active.json`,
`2df389f4b0427032aee6408786655cf0552dc5bdc3c2e1e7f03876a554712734`.
Normaler Hauptkatalog frisch über die Katalogeinstellungen als
`D:\Lightroom Katalog\Lightroomkatalog aktuell.lrcat` bestätigt:
`a51-main-d-restored-catalog.json`, `713c5dda52b23a4a4eb2d4c2d9a54d424f5bad49075008c95892c965acfa41e4`.
Importdialog/-optionen wurden in diesem Lauf nicht bedient. Eigene neue Eigentümersitzung e979d0f6…
regulär geschlossen, Exit 0, keine Fehler. Die getrennten SDK-Störfälle bleiben offen und ihre private
.47-Vorbereitung deaktiviert; kein solcher Fehler wird aus dem A-51-Erfolg als geprüft abgeleitet.

**Unabhängige A-51-Annahme:** `3fd33511…/a51-independent-native-acceptance.json`,
`83b4a7e0458f46468c2c72edbcc1425df9b9a5cfa05ac7816506d2885c2f4a0b`: 41 Originalbilder tatsächlich
einzeln gesehen, 14 AX-Gegenprüfungen, 145 Quellen nachgehasht und beide geschlossenen Kopien erneut
direkt `query_only`/immutable gelesen. Alle sechs Rohidentitäten, vorhandenen und fehlenden FN-Werte,
IPTC und 66 tatsächlichen Stichwortrelationen exakt. Zusätzlich vollständige Menge der gespeicherten
Statistikvariablen geprüft: tatsächlich nur Index und Revision, rohe Zeichenfolgen bytegleich
(`eb5d4526…`, `bc2e1c13728e26c04c0ce8c9ef73692c39d9c3ce7be6782488ca228a8b9b0287`).
Beide eigenen Sitzungen geschlossen, null Operationen und keine Helfer.

**Artseiten-Fotoausrichtung – Präzisierung vor Veröffentlichung:** 24 abgeschlossene Desktopfälle
des ersten Modul-/CSS-Kandidaten zeigen vollständig erhaltene Fotos und lesbare Titel/Rückknöpfe.
Bei Haubenmeise übernimmt `contain` jedoch die frühere Beschnitt-Fokusposition 83,3021 % / 29,6037 %;
dadurch deutlich ungleiche freie Ränder im neuen Rahmen. Root hat die Originalaufnahme selbst geprüft
und richtet vollständige Fotos innerhalb des freigegebenen Grundlayouts einheitlich mittig aus.
Dafür eigener neuer CSS-Kandidat, neue Quellenbindung und erneute Prüfung aller 63 Artseiten in drei
Ansichten. Alte CSS-/Bild-/Messbelege bleiben unverändert; keine Zentrierungs- oder Gesamtfreigabe
aus diesen ersten 24 Fällen und weiterhin keine Veröffentlichung.

**Verbindliche Artseiten-Präzisierung von Felix – 24. Oktober:** Der Titelbereich soll auf Desktop
und Tablet das Bild wie bisher überlagern; ausschließlich in der Mobilansicht steht er darunter.
Das vollständige, mittige Foto mit begrenzter Höhe bleibt Grundlage. Die vorherige Beschreibung
„Überschrift und Rückknopf darunter“ war zu pauschal und ist durch diese ausdrückliche
Nutzerpräzisierung ersetzt. Der bisherige Kandidat mit Titelbereich unter dem Foto in allen Ansichten
wird nicht veröffentlicht. Seine Quellen, Aufnahmen und Gegenprüfungen bleiben historische Belege;
sie gelten nicht als Abnahme der nun korrigierten responsiven Anordnung. Neue Quellenbindung,
Verhaltenstests und tatsächliche Desktop-/Tablet-/Mobilprüfung folgen vor einer Übernahme.

**Fortsetzung am 25. Oktober – getrennte Explorer-Regression:** 205/205 bestehende Verhaltenstests
für Artanlage, frühe Verfügbarkeit, Wiederherstellungsdialoge, Website-Erneuerung, Namen, Auswahl und
Feldfehler bestanden. Der eigene Testprozess durfte nur 29 benannte Quell-/Testdateien und zwei eigene
Hilfsdateien lesen; keine Dateischreib-/Kindprozessrechte, null Aufrufversuche der gesperrten Netzwerkwege.
Alle 29 Quellen vor und nach dem Lauf sowie bei der Annahme unverändert. Führender Beleg
`699187be…/explorer-offline-regression-acceptance.json`, SHA-256
`dbc77ec4e7707e5e1010814ba37a086977a7d4e955c819e834b9ad88f34a21ad`.
Das erhaltene Originalprotokoll `6b48046d…/explorer-offline-regression.tap.txt`
(`cdf33120b91d1bb1115fe755a3e9113a047acb522b5bb5c8253bafe6f0a16a4a`) enthält trotz seines Namens
den Node-Spec-Reporter. Zwei technische Vorstarts stoppten vor den Tests; der erste Ergebnisparser
erwartete irrtümlich TAP. Neue Annahme wertet das unveränderte Spec-Protokoll korrekt, ohne alte
Ergebnisse umzuschreiben. Eigene Sitzungen geschlossen/0/keine Helfer. Keine frische Produktdaten- oder
native Leistungs-/Skalierungs-/Screenreaderabnahme aus diesen VM-Tests.

**Responsive Artseitenkorrektur – Quelle 1.0.2:** Die mobile Farbregel gilt jetzt exakt als Gegenstück
zu `min-width:768px`; die nachgewiesene Zwischenlücke bei 767,5 px ist geschlossen. Zusätzlich 23 rote
Struktur-/Beobachtungsfälle mit dem alten JS reproduziert, anschließend vollständige Hero-Struktur
gegen fremde Texte, Bilder und interaktive Zusätze geschützt. Entfernte/geänderte/doppelte Art-,
Header- und Seitenanker entziehen die Markierung ohne Resize. 79 Hero-, 15 Barrierefreiheits- und drei
Größenbudgettests bestanden. Alle 63 gebundenen vollständigen Original-Heros bleiben offline akzeptiert;
Titel, Bildquelle und Rücklink unverändert. Belege `dc9805d0…/hero-guard-red.json`
(`46605119f421eaa42a08f15f2d15acb7886d39162535782c5203ea1bc64fe7f6`),
`f897fb9a…/hero-63-offline-structure-check.json`
(`9459b3741678ebf61c8fcdefd1ac79be829840ed61aac0f10eba08c1ae69ca76`) und
`722ebe9e…/hero-guard-final.json`
(`36149be7683e0a56527ee4826cfb548149dc57fad4b70bd8932b49342b4afddd`).
Neues JS `6dd815f00875f1dd13cdc831cfec8751dd912b9f279f747dbc32034c9fa17958`, Hero-CSS unverändert
`cf64b1a75aa9afcc76b5168e076772d8e76c9aa280bc0b97ac57bd45abc58853`; Footer auf 1.0.2 synchronisiert.
Unabhängiger Review, neue gebundene Browserabnahme und öffentliche Übernahme bleiben eigene Schritte.

**Lightroom-Störfallprüfung – neuer eigener Vorherstand:** Hauptkatalog in den nativen
Katalogeinstellungen frisch als `D:\Lightroom Katalog\Lightroomkatalog aktuell.lrcat` bestätigt und
regulär geschlossen. Neue eigene Eigentümersitzung `b2a97ee3…`, keine alte Sitzung wiederverwendet.
Tatsächliche PID/Prozessstart/Programmdatei und Lightroom-Schluss in vollständiger Prozesssicht geprüft;
die eingeschränkte Prozesssicht war für diesen Vergleich ungeeignet. Exklusive physische Kopie nur
des eigenen Sechs-Kunstbild-Katalogs gelesen: `ee4291b6…/fault-before-capture-result.json`,
`1e0c43f191b7ecd38c49f75a320ffb0e85fe47f17d7177495cb543687f84a22b`.
Alle sechs Rohidentitäten, FN-Anwesenheit/Werte, IPTC, Stichwortrelationen und vollständige Statistik
exakt gegenüber dem gebundenen Ausgang; keine Originaldatenbank über SQLite geöffnet. Vorbereitungsarm
nur in der privaten .47-Testkopie eingesetzt, 146 Quellen neu gebunden unter
`00aa5cd7…/private47-prepare-operative-source-freeze.json`
(`54d582665615e28d97dea00f46f2abb7d62e6055e5b973bb0f0431e79d46a07e`).
Die eigentlichen SDK-Störfälle sind daraus noch nicht bestanden; nach dem Lauf sind deaktivierter
Testarm, Original-Plug-in und Hauptkatalog D: zurückzustellen und nachzuprüfen.

**Artseiten – verbindliche mobile Schriftfarbe und neuer Kandidat am 25. Oktober:** Felix legt fest,
dass die unter dem Bild stehende mobile Überschrift immer schwarz ist, einschließlich zuvor weißer
oder gelber Textteile. Desktop und Tablet behalten ihre bestehenden Farben. Hero-CSS verwendet unter
768 px `#000000`; ab 768 px bleibt die Titelüberlagerung mit den ursprünglichen Farben erhalten.
JS 1.0.3 (`636e094daeacc2624216646e740a7e8d222aed481c24d8878581d0ab4c3508d9`),
Hero-CSS `54b93b88f371774230ae4a3f2b3d015a985d083b28100750a571101301f22d96` und Footer sind
lokal synchronisiert. 86 Hero-, 15 Barrierefreiheits- und drei Größenbudgettests bestanden, einschließlich
weißer/gelber Ursprungstexte und der Grenze 767,5/768 px. Beleg `454fa156…/hero-mobile-black-final.json`,
SHA-256 `35a4584f945f5486972c1522db2d021b6d31426e82b2dd849affe6df18bdd64e`.

Root hat im eigenen Hintergrundbrowser Rotmilan und Buckelwal jeweils mit 1280 × 900, 768 × 1024 und
390 × 844 CSS-Pixeln tatsächlich angesehen. Fotos vollständig und mittig; mobil schwarze Titel unter
dem Bild, Desktop/Tablet weiße beziehungsweise gelbe Originalschrift über dem Bild. Original-JPEGs und
DOM-Werte unter `aa4f2b68…/hero-black-rotmilan-*` und `hero-black-buckelwal-*`; beim Buckelwal-Desktop
gilt ausschließlich `desktop-stable`. Die erste Aufnahme nach Größenwechsel war noch beschnitten und
wird nicht als Annahme verwendet. Gebundene Vorschau `b75ec09c…`, Plan
`fce429353b95ee428ff8f899be3f6afc57619bcb867f49b55c21a5cc41aa42ef`. Dies sind sechs von 189
Ansichtszellen der neuen Artseitenkorrektur; keine vollständige Layout- oder öffentliche Abnahme.
Gebundene Root-Annahme `aa4f2b68…/hero-black-six-cell-root-acceptance.json`, SHA-256
`50c910f3b9586fddbac6da2b0536eaf3e3b3b4bb3e89a33245708b0093898de7`.

**Private .47 – Vorbereitung und Schutzstopp getrennt:** Der erste Schutzstopp `AUDIT_FAULT_PHOTO_PATH`
betraf den relativen Fotoordner des kopierten eigenen Testkatalogs. Ausschließlich diesen Kunstbildordner
nativ auf den gebundenen ursprünglichen Pfad zurückverknüpft; sechs Rohidentitäten, FN-Felder, IPTC,
66 Stichwortrelationen und vollständige gespeicherte Statistik unverändert nachgeprüft. Tatsächlicher
Vorbereitungsstopp für Lauf `c61bfcd2-e881-4c5b-8903-879cb34b5e76` dauerhaft belegt; drei vorbereitete
Effekte und noch kein Fotoblock. Geschlossene Kopien `0465e21c…/fault-prepared-capture-result.json`,
SHA-256 `97f1adb7795f5c3e829b40faa57b7b902131b8b47ffa6639b68f30f0f7e84876`; unabhängige Annahme
`9a2c9e28…/private47-prepared-independent-review.json`,
`c6e68f7ac30bb89391e0649dd74dfff2710b32c5975bfe1dbc97ee27082d0db4`.
Die anschließende native Fortsetzung mit neuem eigenen Eigentümer `86d05b71…` stoppte beim
Blockvergleich `AUDIT_FAULT_EXACT_BLOCK`, vor der vorgesehenen SDK-Fehlerinjektion. Originalmeldung
`aa4f2b68…/private47-sdk-exact-block-guard-native.json`,
`c7dcc8264362d8a8c4e027db6060728d6f81d753994097eaf71f01b63904b3f8`. Ursache der Testbindung und
geschlossener Nachvergleich werden geprüft; kein bestandener SDK-Rollback und kein produktiver Fehler
aus diesem Schutzstopp abgeleitet.

**Computer für Felix freigegeben:** Auf seine Nachricht alle nativen Eingaben sofort eingestellt.
Lightroom war nach regulärem Schluss beendet. Der geschlossene Nachvergleich
`331fac3b…/fault-prepared-capture-result.json`,
`14b5fb89daecd3c9c67ee78a17404c9f5e134899059f1de996a807ea77a544ce` bestätigt sechs Foto-/FN-/IPTC- und
Stichwortzustände sowie vollständige Statistik unverändert; drei Journalzeilen weiterhin vorbereitet.
Dies bestätigt den Zustand nach dem Schutzstopp, nicht die noch nicht erreichte SDK-Fehlerinjektion.
Eigener Prüfeigentümer `86d05b71…` und Hero-Vorschau `b75ec09c…` regulär beendet, jeweils Exit 0.
Die native Rückstellung auf Original .39 und Hauptkatalog D: wartet ausschließlich auf Felix' neue
Computerfreigabe; Felix wurde auf die noch aktive Testkonfiguration hingewiesen. Keine Windows-Eingaben
für diese Rückstellung während seiner Nutzung. Zustandsbeleg `aa4f2b68…/private47-user-pause-closed-state.json`,
`7e31ff1af553da1bebd1075b61c6b42fba47b0f8f39e31ce3866bb5dc9e79df1`.

**Neue Nutzerentscheidungen und Referenz am 25. Oktober:** Kompakte vollständige Kartenvorschau mit
Klick-/Tastaturvergrößerung vorbereiten. Reisegalerien bleiben ausdrücklich quadratisch; Klick öffnet
das Foto groß. Logo-Platzhalter-Inhaltskacheln erhalten wie Montenegro den vorhandenen „In Arbeit“-Lauftext
(A-76); das Logo im Seitenkopf und Footer ist kein Statusplatzhalter. Beim Artseitenkopf ist die öffentliche
Erdbeerfröschchen-Seite die verbindliche Gestaltungsvorlage: volle Bildbreite mit bisherigem Ausschnitt
und Fokus sowie ursprünglicher Überlagerung. Die vorherige `contain`-Einpassung mit seitlichen Freiflächen
verfehlt diese Nutzeranforderung und wird ersetzt. Desktop/Tablet behalten die Titelüberlagerung und
Originalfarben, mobil folgt der schwarze Titel unter dem Bild. Die frische Referenz hat `cover`,
Medium-Mindesthöhe `66vh` und Overlay `0.11`; dies ist keine pauschale Vorgabe für alle Art-Deckkräfte.
Quellbeleg `2a68f5ef…/strawberry-public-source-binding.json`,
`4cec93ada38002844a2626bff4767a7395c1c9d80d975c112a93c299b682b52c`.

**Computer erneut freigegeben – Lightroom zurückgestellt:** Nach frischer vollständiger Prozesssicht
ohne Lightroom ausschließlich den privaten Testarm auf seine exakt gesicherten deaktivierten Bytes
zurückgesetzt (`4ddccaa2…`). Original .39 im nativen Zusatzmodulmanager wieder aktiviert, private .47
deaktiviert; aktiver Originalpfad `D:\Arten-Explorer\lightroom-plugin\FNWildlifeTaxonomy.lrplugin`.
Aktuelle CoL-/Master-/Paketkennung stimmen dort überein. Hauptkatalog in den nativen Katalogeinstellungen
frisch als `D:\Lightroom Katalog\Lightroomkatalog aktuell.lrcat` bestätigt. Neue eigene Belegsitzung
`e7f42431…`: `original39-restored-active.json`,
`b1ee771b81db348453395b15dc4675a509bcc810c5f809347147f2fa3023ec5d`, und
`main-d-restored-catalog.json`, `2021995080d7a74533b330e63c5672dea0c1f33fdac12367418e77dd4811f812`.
Kein FN-Abgleich, Import, Statistikaufbau oder produktiver Fotoeingriff bei der Rückstellung.

**Parallel ohne Computersteuerung abgeschlossene Pakete:**

- Explorer-Leistungsprüfung: korrigierte eigene Vorbereitung `c4178377…/performance-preparation.json`,
  `9a1ad9183ee7f8b11c5cda26f0ec0832c5be91536d755aecb686f77dd0636b7f`. Zwei passende stabile
  Ergebnisbeobachtungen statt beliebigem Frame; die Fünf-Sekunden-Frist umfasst richtige Filter-/Detail-/
  Medienergebnisse und Bilddekodierung. Fehlerpfade schließen eigene Listener und Sitzungen. 132/132
  Gegenproben einschließlich 13 kurzer tatsächlicher Lifecyclefälle, unabhängig 81 Eingänge und fünf
  zusätzliche VM-Fälle geprüft. Review `27b64090…/performance-corrected-independent-review.json`,
  `efc8a5b62314bb7a5bfe9f60e0665cec0e3e5b36c7376d91e480d04e9d4cdc05`.
  43 Frontendquellen und beide Kunstbestände unverändert. Alte Vorbereitung `c0622630…` ersetzt;
  tatsächliche 64er-Oberflächenprüfung und erst danach 2.048er-Probe bleiben offen. Kleiner eigener
  Altversuchsrest `74f13ad4…` nur zur späteren konkreten Schlussbereinigung vorgemerkt, nicht gelöscht.
- Lightroom-Testbindung: unveränderter tatsächlicher Lua-Leser reproduziert den Schutzstopp.
  Nur Journalfotos und aktuelle Favoriten erhalten vollständige Schnappschüsse; der alte Audithelper
  verwendete fälschlich sechs statt vier. Ausschließlich Inventarrevision und Blocktoken unterschieden
  sich; Wirkungen und Reihenfolge waren identisch. Neue Helperbindung `5d88a9b8…`, genau eine von 146
  Quellzeilen ersetzt; Core ausschließlich auf neue Bindung umgestellt, Owner und Leser unverändert.
  17 Gegenproben plus unabhängig 16 fremde Arme vor dem Writer abgewiesen. Review
  `0e29f7f6…/private47-independent-rebinding-review.json`,
  `4302a271280d10bcbab970490cc0b959b294e30bd11edb994b8e765a142e99c4`.
  Alte Prepared-Belege bleiben historisch und werden unter der neuen Bindung ausdrücklich abgelehnt.
  Vor neuer SDK-Probe frische eigene Eigentümersitzung und geschlossene Before-/Prepared-Kopien erforderlich;
  kein neuer Eigentümer oder nativer Störfall durch diese Offlinevorbereitung gestartet.
- Status-/Sortierung 1.0.5: frische öffentliche HTMLs durch alten und neuen Sortierer im Modell geführt.
  Vorher 45 Blöcke/ein Band, danach 50 unveränderte Originale/sechs Originalbänder; Wildlife behält 13
  Originale einschließlich Asienband. Beleg `5bcfa30a…/status-final-result.json`,
  `13573304b2afcd52d578751008e17f159478595f3780127d85707db27289b6a9`. Native Raster-/Lauftextabnahme offen.
- Artseitenkopf 1.0.4: neue Markierung `full-bleed-responsive-title-v3`, ursprüngliches Squarespace-
  Bildmodell statt `contain`/580-px-Begrenzung, Fokus 50/50 und ausgeblendeter Überlagerung. Mobil Foto
  vor schwarzem Titel. 91 Hero- sowie 63 Sortier-/Accessibilityfälle bestanden; alter CSS-Kandidat
  reproduziert sieben Fehler. Alle 63 gebundenen Original-HTMLs erneut vollständig geparst und im
  Modell angenommen; Bildquelle, Titel, Fokus, Links und artspezifische Überlagerung erhalten. Unabhängiger
  Review `d812dc5b…/hero-independent-final-review.json`,
  `1d0ef29a5030881585d6750146078d42241782f044ff077feee9cadf74b0896b`.
  JS `52356ddb39ed8333e6256613c565f0b41ff4a346ff5ca1245b35cfafe3d12bbd`,
  gemeinsames CSS `258b2c1f7e5858454dddf60d1e0633692fc29952e916f8b2015507856fb135de`,
  Footer `992af4b99e85e2cc0d1a2de0eb3011c08b05b4fb29928a0ec45469ca54f3b238`.
  Alle früheren `contained-v2`-Browseraufnahmen bleiben historische Belege; neue native 189-Zellen-Annahme
  und dabei getrennt aufgefallene Bestandsbefunde siehe unten.
- Dokumentation: CI-, Monatsprüf- und Strukturvertrag gegen die tatsächlichen Quellgrenzen bereinigt.
  `docs/squarespace-custom.css` ist die einzige dokumentierte Pages-Ausnahme unter `docs/`; alte Live-
  Versionslisten durch führende Footer-/CSS-Verweise und datierte Auditnachweise ersetzt. Historische
  Testlauf-/Juni-/Pfadangaben nicht mehr als heutige Betriebsanweisung dargestellt. 80 Markdown-Dateien
  ohne fehlende lokale Verweise; kein öffentlicher Nachweis aus dem Dokumentabgleich.

Sämtliche genannten Vorbereitungs-/Reviewsitzungen geschlossen, null Operationen, keine Helfer.
Das vollständige lokale Gate ist am 25. Oktober, 09:12:53–09:21:27 MEZ, mit Exit 0 beendet:
50/50 Testgruppen, 2.214/2.214 Tests bestanden, keine Fehler, Abbrüche, Skips oder Todos. Alle 637
gebundenen Quellen sind vor, nach und bei der abschließenden Annahme unverändert; Set-SHA-256
`539830de6493fcb018e50ec1380fad24025be91639210383d3c4d4845cbc3009`. Führende Annahme
`f61b7de8…/quality-gate-local-acceptance.json`,
`a3dc444da1c21a5b935eaacc9344f7f154c1cf4fc3ceef90f4060481d968a71e`;
Originalergebnis `2792de9c…/quality-result.json`,
`92c67b8044a2ce712eab7b30c7255859b456ba7fe07a38c6609eefeb584d413e`.
Der erhaltene Erstversuch stoppte in einer künstlichen Junction-Probe mit Windows-EPERM vor ihrer
Verhaltensprüfung; 242/243 bis dahin. Derselbe unveränderte Einstieg wurde über den zugelassenen
Ausführungsweg wiederholt, ohne Schutz- oder Testlockerung. Beide Gate-Eigentümer und Annahmesitzung
geschlossen, null Operationen und keine Helfer. Die währenddessen bearbeitete Audit-Markdown und
spätere Dokumentkorrekturen benötigen die abschließende Dokumentprüfung. Native Abnahmen, Linux-CI
und öffentliche Auslieferung bleiben vom lokalen Gate getrennt.

**Kompakte Kartenvorschau vorbereitet:** Privater Kandidat `f96592b3…/compact-map-preparation.json`,
`3a52b706ad783ae923ed7303bb0d0ba21ea8c888654ca3ef01b6e227f8190445`: vollständige Karte mit
vorgeschlagenen Höchstmaßen 360 px Bildhöhe/640 px Containerbreite, sichtbarem „Karte vergrößern“
und nativem Öffner in allen drei Ansichten. Vorhandener Dialog, Quellen-, Lade- und Fehlerhinweise
bleiben erhalten. 28 private Modelltests bestanden; alter Kartenloader scheitert an fünf neuen
Anforderungen. Keine Root-Datei geändert, kein Vorschau- oder Browserstart; Vorbereitung geschlossen.
Unabhängiger Review `f9798ad6…/compact-map-review-result.json`,
`25e6664623f1dcb8cbce8dcc46df339b1db8eb7caec4410fdcf4afbb88a69cc9` bestätigt die 28 Modelltests
und unveränderte gebundene Quellen. Tatsächliche Darstellung, Enter/Leertaste und Größenbeurteilung
bleiben offen; die Modellgrößen sind keine Browsermessungen.

**Hero 1.0.4 – vollständige native Matrix:** Neuer eigener Nurlese-Vorschauowner `6dc418a9…`,
gebundener 63-Seiten-Plan `041502cbc39cebd30710782d050bac9b8dd96da17724d959595a349bfe6140db`.
Alle 189 Kandidatenansichten mit unveränderten Original-JPEGs und zugehörigem DOM in `e7f42431…`
erfasst und durch drei unabhängige Agenten einzeln tatsächlich angesehen: Desktop 1280×900,
Tablet 768×1024, Mobil 390×844 CSS-px, tatsächlicher DPR jeweils 1,1299999952. JPEG-Abmessungen
werden getrennt von diesen DOM-/DPR-Werten geführt, nicht als pixelgleich behauptet. Volle verfügbare
Bildbreite ohne seitliche Balken, Originalquelle/-fokus/-overlay, vollständige Titel und Rücklinks stimmen.
Desktop/Tablet haben Titelüberlagerung in Originalfarben; mobil stehen sämtliche Titel und 38 erfasste
Textnachfahren rein schwarz unter dem Foto, ohne Titelbeschnitt oder nötige Folgeaufnahme.

Führende getrennte Annahmen: Desktop `96392ecd…/hero104-desktop-native-review.json`,
`86918905d78c7b9cce6878c1f84241c1efe7e28ae7a8c61c3f993bebe0092aae`;
Tablet `9ba38cf8…/tablet-63-independent-acceptance.json`,
`e325defa9524b34d2979b0d7bdc57c83d2b01c9a1474ef69135b44ffa1fc8e26`;
Mobil `b60f5fc8…/mobile-63-independent-review-result.json`,
`81a45fcd68e920065a453244b811b967aa8752c506e78e15effd5dd495248cd9`.
Die zunächst leeren Tabletaufnahmen 049/129/130 bleiben verworfene Erstaufnahmen; ausschließlich die
separaten, unabhängig tatsächlich angesehenen `tablet-settled-01`-Aufnahmen gelten dort als Bildbeleg.
Keine Blankaufnahme wird aus einem bloßen DOM-`complete` als bestanden gewertet.

Sieben zusätzliche Desktop-Originalvergleiche und neun Tablet-Originalvergleiche ordnen A-77/A-78
als bestehende Gestaltung ein: Geometrie, Quelle, Fokus, Overlay und Titel-/Spanfarben exakt gleich.
Mobile Eichelhäher-Nachaufnahme und Originalvergleich bestätigen A-79; Nachtrag `7144dad9…`,
`21ebe318ff15af80d4c9dab33d3d07a859bdcb197480d7999e450df88986d739`.
Alle drei Vorschläge Felix mit konkretem Bildbeleg zur getrennten Entscheidung vorgelegt. Keine
Farbe, Fokussierung oder zusätzliche Header-/Fotogeometrie dafür bereits geändert. Dies ist die lokale
Hero-Titel-/Layoutabnahme, kein pauschales Kontrast-, Motiv-, Ganzseiten- oder Veröffentlichungs-Go.

**Explorer-Leistungsprobe – tatsächlicher Harnessfehler gesichert:** Der neue 64er-Browserstart unter
`f6229c4c…` lädt die richtigen 64 Kunstidentitäten, verweigert aber die vom unveränderten Frontend
angehängten Medienversionsparameter `t=…` in der privaten Server-Positivliste. Acht Resource-Fehler,
Bildbreite null, Audio-Metadaten nicht bereit und `initialReady:null`; keine Leistungsannahme und kein
2.048er-Start. Original-DOM/JPEG `e7f42431…/perf64-first-fixture-media-rejected.*`, vollständiges
90-Anfragen-Log `f6229c4c…/requests.json`,
`92fbc6cef2f4f0ecd6ac1b52167edc5cbae285c63c317931cbf9ca0788ce296d`.
Eigene Register-/Testumgebung regulär beendet, Exit 0, Listener geschlossen, null Operationen/Helfer,
alle Eingangsquellen unverändert. `success:true` des Eigentümers betrifft ausschließlich dessen
fehlerfreien Lebenszyklus; `nativeUiAccepted:false`. Die enge private Querykorrektur und ihre erneute
Prüfung sind beauftragt; keine Korrektur oder Fehlbehauptung am produktiven Explorer daraus abgeleitet.

**Lightroom-Testfortsetzung vorbereitet:** Original .39/Hauptkatalog D: regulär geschlossen und frische
native Fenstersicht sowie vollständige Hostprozesssicht ohne Lightroom gesichert: `e7f42431…/
private47-main-regular-close-native.json`, `f60df960149d1e8072b4515c399ae5ac3885c7b0e218e59bda77ff315a6b1bdd`.
Neuer .47-Eigentümer und frische ausschließlich lesende Before-/Prepared-Erfassung unter Bindung
`6b04ee6e…` beauftragt; keine Armaktivierung oder SDK-Fortsetzung daraus bereits angenommen.

Die erste neue Erfassung wurde als Datenbeleg unabhängig angenommen; ihr Eigentümer PID 38844 war
bei der späteren vollständigen Hostprüfung jedoch nicht mehr vorhanden. Offenes Manifest und künftige
Ablaufzeit wurden ausdrücklich nicht als lebende Berechtigung verwendet. Root startete deshalb selbst
den neuen Eigentümer `986ac048…`, PID 35052, und prüfte Prozessstart, Intent und Manifest frisch.
Before und Prepared wurden darunter vollständig neu kopiert und gelesen, mit neuem Before-Anker.
Gesamtquittung `b0c0c112…`, `60a2fa637d92a6841705d56937906f4423f6e76280583ed8c2950b0a8b60d779`;
unabhängige Annahme mit selbst gelesenen immutable Kopien `316b539c…`,
`d2d869d71af6923c744156fbf053159316f60959630070c2389f72b9ea9d0bd5`.
Sechs Fotos/66 Relationen/vollständige Statistik unverändert; echter Lauf weiterhin drei `prepared`.
Erst danach ausschließlich die private .47-Bindung exakt auf den geprüften SDK-Kandidaten `2e1ea413…`
gesetzt. Tatsächlicher operativer Quellenfreeze mit allen 146 Eingängen `3f29743c…`,
`5d5aa1e095baf02bfb93ca72a69802b2d839291046922183dacc3f3fd553d76b`.
Dies belegt zunächst nur die enge Testaktivierung. Danach wurde derselbe protokollierte Lauf nativ
fortgesetzt: drei vorbereitete Fotozustände eindeutig lesbar, null ungeklärt. Originalbestätigung
`e7f42431…/private47-sdk-three-prepared-confirmation.json`,
`f137c42153223768d50d6cda31fe98ce51eecb9e9595582b5825a21ee2833c97`.
Die tatsächliche Meldung lautet `AUDIT_INJECT_SDK_ROLLBACK`: vorläufige Foto-, Stichwort- und
Statistikänderungen vor Commit angehalten. Originalfenster
`e7f42431…/private47-sdk-rollback-injected-native.json`,
`2aa9846ae0cb06ca18c027802d2df96dfece797201df74a496abcce0ab371314`.
Damit ist der vorgesehene SDK-Störpunkt erreicht, kein vorgeschalteter Bindungsstopp. Lightroom
anschließend regulär geschlossen; vollständige Hostprozesssicht um 09:42:55 UTC bestätigt null
Lightroom-Prozesse und den unverändert lebenden Root-Eigentümer. Der einmalige geschlossene
Rollback-Nachvergleich gegen den neuen Prepared-Anker ist anschließend genau einmal mit unverändertem
Reader ausgeführt: `2b39f54b…/fault-rollback-capture-result.json`,
`3d34d9b7f9e86d93d4bbde43ed7e530a5617275e2d4909e57f26760c4965cf34`.
`photoEffects:0`: alle sechs vollständigen FN-/IPTC-Fotozustände, 66 Stichwortrelationen und die gesamte
Statistik exakt zum neuen Prepared-Anker und zur Baseline; weiterhin genau drei `prepared`-Zeilen.
Unabhängiger Reviewer hat ausschließlich die neuen immutable Katalog-/Journalkopien selbst gelesen
und beide Originalfenster tatsächlich angesehen: `f48cec2b…/private47-sdk-rollback-independent-review.json`,
`9e051808899b1d08c50ec89ff4d0d1339daeb85f997ac7c3185e839e3c032b40`. Alle 146 effektiven Quellen
und die lebende Root-Prozessidentität vor/nach bestätigt; beide Prüfsitzungen geschlossen/0/keine Helfer.
Zwei zusätzliche Vorannahmen des Erfassers stoppten vor jeder Kopie/Readerausführung und sind getrennt
erhalten; weder Quellen-/Readerlockerung noch Wiederholung des eigentlichen Capture daraus.
Der kontrollierte SDK-Rollback ist damit angenommen. Weitere Störfenster und Konflikt-Teilrücknahme
sind dadurch nicht erledigt. Um 09:53:43 UTC ausschließlich die private Testbindung auf den ursprünglichen
deaktivierten Hash `4ddccaa2…` zurückgestellt, alle 146 Quellen anschließend exakt geprüft:
`e7f42431…/private47-sdk-disabled-binding-restored.json`,
`755da1f896fc2d4b61fa8cb6a34972f3bc673856b0abb632506025bf2dcbe890`.
Original-Plug-in .39 wieder allein aktiv; eigene Testkopien im Manager deaktiviert. Hauptkatalog
`D:\Lightroom Katalog\Lightroomkatalog aktuell.lrcat` nativ in den Katalogeinstellungen bestätigt.
Rückwegbelege `e7f42431…/private47-return-original39-active-native.json` (`188b9cde…`) und
`private47-return-main-d-catalog-native.json` (`9dbb8c8f…`). Root-Eigentümer regulär über seinen exakten
Schließauftrag beendet, Exit 0, Manifest geschlossen/0/keine Helfer; Gesamtbeleg
`e7f42431…/private47-root-owner-closed.json`,
`9b461f23ed09271961f4337af0438174b4074d7a48f1f2308bf43a65986d64c5`.

**Kompakte Karte – erste native Bedienannahme:** Im vollständigen Bachstelzenkontext zwölf echte
Tastaturrunden, vier je Desktop/Tablet/Mobil, mit Enter/Leertaste, Tab/Shift-Tab und Escape durchgeführt.
Jeweils genau ein benannter modaler Dialog, Fokusbindung/-rückgabe, `inert`- und Body-Overflow-Rückstellung
bestätigt. Alle drei unveränderten Großansichts-JPEGs unabhängig tatsächlich angesehen; vollständige
Karte einschließlich Legende und Unterrand sichtbar. Beleg `e7f42431…/compact-map-native-keyboard-12-cycles.json`,
`cc8b745dac60473fecafc979e8e6d452ae253547de93dd997a6982571ecce443`; unabhängige Annahme
`e435a1b7…/independent-native-compact-map-review.json`,
`9323ab312fee35d077c01f92acdc44771143d601a9845a32f3b02b047e18d878`.
Der erste Desktop-DOM-Moment vor Bilddekodierung ist kein Bildbereitschaftsnachweis; die spätere
Originalaufnahme zeigt die geladene Karte. Keine numerische Scrollpositionsrückgabe daraus behauptet.
Die gewöhnliche Vorschau zeigt zusätzlich einen abgeschnittenen oberen Fokusrahmen durch den vorhandenen
`overflow:hidden`-Kartenwrapper. Enge private Innenrahmenkorrektur beauftragt; normale Vorschauen in drei
Ansichten, Größenentscheidung und öffentliche Übernahme bleiben offen.

**Explorer-Leistungsprobe – neuer Warmladebefund:** Unter eigener Root-Sitzung `20445c90…` ist der
Erststart nach 273,1 ms mit zwei stabilen Sollbeobachtungen, dekodierten Bildern und dreisekündigen
Audio-Metadaten bereit; keine Anfangsfehler. Der erste tatsächliche warme Reload meldet jedoch nach
51,6 ms einen Ressourcenfehler mit der Dokumentadresse als Quelle. Spätere Medien sind geladen,
aber `initialReady:null` bleibt wegen dieses Fehlers ehrlich gesperrt. Keine 64er-Gesamtannahme,
keine weiteren Warmstarts oder 2.048er-Probe. Original-DOM und beide geladenen Originalansichten in
`e7f42431…/perf64-fixed-server-cold-and-warm-native.json`,
`a555a506a4e63f00421c0f636e77150e6d971817806df1710f285f403b296b90`.
Eigener Server anschließend regulär geschlossen, Exit 0, Listener geschlossen, Eingänge unverändert;
116 Anfragen im Log `20445c90…/requests.json`,
`20d08225a5faedbb71b46760e3847ed2702e5213588bc3f0e7041d30b5c9b49a`.
Eine enge Quellprüfung findet am versteckten globalen Lightbox-Bild `src=""`; gezielte Rot-/Grünprobe
und anschließende native Wiederholungsprüfung sind beauftragt. Kein Fehlerfilter wird abgeschwächt.

**A-80 – enge Korrektur und neuer vollständiger Qualitätsstand:** Am globalen versteckten
`#asset-review-map-lightbox-image` ausschließlich das leere `src=""` entfernt. Die vorhandenen Öffner
setzen ihre geprüfte Quelle weiterhin vor der Anzeige. Neue gekoppelte Rotprobe reproduziert das
Attributproblem, danach 34/34 passende Fälle grün. Unabhängiger Quellen-/Verhaltensreview
`b72770f6…/empty-image-independent-review.json`,
`2f1144500c77f437c9df735670dd029f5aaa2dd436a857082536431307f4c83d`.
Die leere Quelle ist als konkrete Fehlerquelle korrigiert; mangels damals erfasstem Ereignisknoten wird
keine nachträgliche forensische Identifikation des ersten Ressourcenereignisses behauptet.

Das neue vollständige lokale Gate vom 25. Oktober, **11:16:52–11:25:38 MEZ**, enthält diese Änderung:
**50/50 Gruppen und 2.215/2.215 Tests**, Exit 0, keine Fehler, Abbrüche, Skips oder Todos. Alle 637 Quellen
vor/nach/bei Annahme unverändert, Set-SHA-256
`20bd5a9f539306dafe91f52a6e62cc5d656ec5f10379c732c3e36672bad946e4`.
Führende Annahme `5442a210…/quality-gate-current-src-fix-acceptance.json`,
`f02666158b9d4a148fbb744cc098203a2f660ffb11ed9c4f4648d89bdea220c7`;
Original `ada46a6d…/quality-result.json`,
`0c353150b51320ade7b85bf5bc7cb96cc53744e0420828d2c5114cfcac0baf1c`.
Sitzungen geschlossen/0/keine Helfer. Der frühere 2.214er-Nachweis bleibt historisch erhalten;
abschließende Dokumentprüfung, Linux-CI und öffentliche Auslieferung bleiben getrennte Grenzen.

**Explorer – korrigierte 64er-Frontendrunde angenommen:** Vorbereitung `3cb9ddda…`,
`49f5fa4a09ef970bd5868c6fd5b543691860e0d622df3fa2c229387271324bdb`, bindet 43 aktuelle Frontenddateien,
zwei künstliche Bestände, drei Medien und die eng geprüfte private Server-/Beobachterkorrektur.
Tatsächliche vier Navigationen **280,7 / 204,7 / 172,0 / 132,1 ms**; jeweils zwei stabile Sollbeobachtungen,
exakte Identitäten, dekodierte Bilder und dreisekündige Audio-Metadaten. Alle 15 Bedienaktionen liefern
die erwarteten Listen, Auswahl-/Detailidentitäten und Dialogzustände; 14,4–100,1 ms, keine Zeitüberschreitung,
aufgezeichneten Seitenfehler oder Long Tasks. Vier zusammengehörige Input-Ereignisse unter insgesamt
19 Ereignissen sind korrekt abgelöst und keine zusätzlichen Erfolge. Rohbeleg
`e7f42431…/perf64-corrected-complete-native.json`,
`f20cb02d5f9452b811d31b888168e9f92aeffc6f47983880c4a2beee94c2a059`;
unabhängige Annahme `96c4c89e…/perf64-independent-acceptance.json`,
`92c712cfbfeca834e977c5d8153ecec5184815d47fdd236398a7233c6e735786`.
Root-Owner `2cb8fd51…` normal beendet, tatsächlicher Exit 0/Listener zu/Manifest geschlossen/0,
Quellen unverändert; separater Lebenszyklusbeleg `e7f42431…/perf64-corrected-owner-lifecycle.json`,
`64c9949e2359c11455cf47df52e62e2f28838beddbe75c085dc834c4ba0b6ded`.
Ein einzelner Favicon-404 unter 185 GETs bleibt ausdrücklich erhalten. Filterereignisse mit
`isTrusted=false` sind Browserprüfungen, keine Betriebssystem-Eingabelatenz. Keine native Electron-,
Produktivstart-, RSS-, physische Bildausgabe- oder kalte Betriebssystemcache-Abnahme daraus.

**Kompakte Karte 1.0.11 mit A71 – drei finale Bachstelzenansichten angenommen:** Die eng korrigierte
innere Fokuslinie und das unveränderte bestehende A71-Raster-CSS im vollständigen privaten Kontext
zusammengeführt, keine neue Text-/Typografieänderung. Alle drei finalen Original-JPEGs persönlich und
unabhängig angesehen: externe Überschrift frei, vollständiges Originalkartenbild einschließlich Legende,
unterer Logos/Nebenkarte, Quellenhinweis, sichtbarer Öffner, alle vier Fokuslinien und Galerieanschluss.
Führender Bild-/DOM-Beleg `e7f42431…/compact-map111-a71-final-three-views.json`,
`fbec92af15533aa10f557797bccd1c40f1a6306ede8cf45645679b288f15e47e`;
unabhängige Annahme `c3e2268d…/independent-map111-a71-final-three-view-review.json`,
`605b3552adedd55480ab69929864e01adb919e90e85b3d8715ce64efcb6408ab`.
Root-Vorschauowner `081862f8…` regulär über exakten Schließauftrag beendet, Exit 0. Nur dieser private
Bachstelzenkontext ist angenommen: übrige A71-Seiten, A72, Größenentscheidung, Quellenintegration und
Veröffentlichung bleiben offen. Getrennte DOM-Abfragen sind kein pixelgenauer Abstandsvertrag;
keine exakte Scrollpositionsrückgabe behauptet. Die vollständige kleine Kartenlegende wird bei Bedarf
in der bereits separat nativ geprüften Großansicht gelesen.

**Explorer – auch die 2.048er-Frontendrunde unabhängig funktionell angenommen:** Nach der gebundenen
Root-64er-Annahme eigener neuer Owner `152e1f86…`, keine gleichzeitige Lastmessung. Vier vollständige
Navigationen **783,7 / 1.550,6 / 1.535,3 / 1.500,5 ms**, alle zwei stabilen Sollbeobachtungen mit exakten
2.048 Identitäten und vollständig bereiten Sollmedien. Alle 15 Bedienaktionen gegen den Rohbestand
unabhängig nachgerechnet: 1/0/2.048 Suchtreffer, LC 512, manuelle Karten 409, Auswahl 1.024/2.048/1,
Aktualisieren und beide Bilddialoge samt Escape. 37,2–1.018,7 ms, 19 Ereignisse einschließlich vier
korrekter Ablösungen, keine Zeitüberschreitung oder aufgezeichneten Seitenfehler. Ein Fehler des
Zusammenfassungshelfers las zunächst die falsche Verschachtelung; vor weiterer Eingabe berichtigt,
erste erfolgreiche Suchaktion im Original erhalten und nicht wiederholt.

Original `e7f42431…/perf2048-complete-native.json`,
`2918dd1692bd416a995f1aff7c639772d853ce785bb6f814bdfd7b02445e246a`;
unabhängige Annahme `67158e65…/perf2048-independent-acceptance.json`,
`cdfbbcd73d03dcbac4bf2462aafb29588da254caeb5ca183a018e842f61e6d54`.
Root beobachtet echten Exit 0/Listener zu/keinen Quelldrift und tatsächliches geschlossenes Manifest/0;
separater Abschlussbeleg `e7f42431…/perf2048-owner-lifecycle.json`,
`927a919bb62e7688c3240910754354b490e87945fc9f027d3b9be79af7cddc57`.
145 GETs enthalten einen Favicon-404, keine Fehler benötigter Medien. Belege/Reviewer geschlossen/0.

**Leistungsgrenze bleibt sichtbar:** Über alle vier Dokumente 33 aufgezeichnete Long Tasks, maximal
246 ms, größte Heartbeatverzögerung 398,2 ms; nur das letzte Dokument hat 25/maximal 220 ms und
374,8 ms Heartbeat. Letzter JavaScript-Heap etwa 31,8 MB, kein gemessener Prozess-RSS. Viewport
1.060×1.101 unterscheidet sich vom 64er-Lauf mit 1.133×637; keine kontrollierte direkte Größen-
Geschwindigkeitsgegenüberstellung. Dies nimmt die begrenzte synthetische Frontendfunktion an,
nicht native Electron-/Produktivstarts, große Taxonomieaufbauten oder den repräsentativen LR-Katalog.

**Lightroom – Commit-vor-Journal-Störfenster erreicht, Nachvergleich wegen Sollstub gestoppt:**
Eigene frische Root-Lease `07418ce4…`; neue unveränderte Vorher-/Vorbereitet-Kopien unabhängig
angenommen (`1e13a77a…/private47-commit-prepared-independent-review.json`,
`747ad9c5f787e58f8d02035f490a31092b52762ff550c36e20f84bf1e0e62477`).
Nur die private .47-Testbindung für exakt drei Effekte aktiviert. Nach genau einer nativen
Schreibbestätigung zeigt Lightroom tatsächlich `AUDIT_INJECT_COMMIT_BEFORE_CHECKPOINT`:
Fotoblock zurückgelesen, Journalabschluss noch nicht aufgerufen. Originalfenster
`e7f42431…/private47-commit-injected-native.json`,
`fd671cccb52b753086305c43fac7649c01f6f5c6346233e75f66e84a80538732`.
Anschließend regulär geschlossen; ausschließlich neue exklusive geschlossene Kopien gesichert.

Der genau einmal ausgeführte Capture bleibt **FAILED**, kein Erfolgsresultat: Bei
`statisticsIndexV1.species[F].exampleFileName` steht nativ korrekt der Dateiname, während der private
Sollstub den ganzen Windows-Pfad erwartet. Er berücksichtigt nur `/`, nicht `\`. Vollständige
Fehlerquittung `0f481b7e…/private47-commit-closed-readonly-receipt.json`,
`9d9ad892a05951e3933a7b2058c27cabfbc87298e5ef251b322baeee5120a008`;
exklusive Kopien mit sämtlichen Stempeln in `private47-commit-exclusive-copy-proof.json`,
`dfea9e725c784faf5dff5c3b3601814b4287bcca8cd1b3a98798aaa0176a162a`.
Keine Capture-Wiederholung, Recovery oder Rücknahme ausgeführt; kein Produktfehler daraus abgeleitet.

Reine Lua-Gegenprobe und unabhängiger Lesereview bestätigen die enge Ein-Stellen-Korrektur des
Windows-Sollstubs, sechs Pfadfälle passend. Vorbereitung `84402f0c…`, Diagnose
`c20d9ff9cff9111858371990ae338fff19291ce5a773e4e6f32ed10d4558f1e5`;
Review `b368b801…/private47-windows-leaf-independent-review.json`,
`c290e2723909f8c4f46d1adeb04aa07da75135b2f09d456d7593af84fe5f39e5`.
Alte 146 Quellen und drei Helfer unverändert; Vorschlag nicht still in den gebundenen Leser getauscht.
Ein neuer Offline-Nachvergleich braucht einen eigenen frisch geprüften Vertrag; er ist noch nicht
ausgeführt und ersetzt das fehlgeschlagene historische Ergebnis nicht.

Private Testbindung exakt auf die ursprünglichen 166 deaktivierten Bytes (`4ddccaa2…`) zurückgestellt,
alle 146 Quellen geprüft; Rootbeleg `cdd742e6…/root-private47-commit-binding-retired.json`,
`675eab4a193678947a1c96b113f6ec3022a896de8ac436555658dcb72e4ecb5e`.
Original .39 nativ wieder allein aktiv, private Kopien deaktiviert; Hauptkatalog
`D:\Lightroom Katalog\Lightroomkatalog aktuell.lrcat` in seinen Katalogeinstellungen bestätigt.
Der Hauptkatalogstart reagierte vorübergehend nicht, wurde ohne Abbruch abgewartet und anschließend
bedienbar bestätigt. Eigener Prüfwächter über exakte Schließanforderung regulär beendet, Exit 0,
Manifest geschlossen/0/keine Helfer. Rückweg-/Lebenszyklusbeleg
`e7f42431…/private47-commit-owner-closed.json`,
`95008191493558e098b2bdeb12fe2b148e60d02ac3f9c1af8764bcba529ab9e1`.

**A71/A72 – weitere vollständige private Seitenkontexte, erste Matrixannahmen:** Eigener Root-Owner
`4007b8ad…` liefert ausschließlich die 41 gebundenen eingefrorenen Seiten und geprüften Ressourcen.
Vorbereitung `8e07d89f…/full-context-preparation.json`,
`841bb9f5c3eb3558fc9c0d13b6910df9b3fa1df0bd9e56edf330a8e609c60d9a`;
alle 94 Eingänge persönlich gehasht. Unveränderte Karte 1.0.9 und Hero 1.0.4; hier kein 1.0.11-Rollout.
Je 41 Desktop- und Tablet-Originale tatsächlich einzeln unabhängig angesehen: **38/38 Ziele je Ansicht**
im begrenzten Kontext vollständige Kartenüberschrift, geladener Kartenbeginn und sichtbarer Vorabsatz
angenommen. Amsel/Bartmeise passende unveränderte Kontrollen; die vorher deklarierte alte breite
Wendehals-Quelle bleibt ohne GO und beweist keinen neuen Fehler der öffentlichen Seite.
Desktopreview `1fbd2606…/independent-desktop-heading-map-start-review.json`,
`84df0b81295a9fcbdf0f07634a53c6b09040e266499e28502f1c0cad8be23b97`;
Tabletreview `1f4abd41…/independent-tablet-heading-map-start-review.json`,
`1bfcbf20ffe651f0d76d259220be095df7ab550a3dac0076a6a2667608f8b764`.
Wortumbrüche vorheriger Beobachtungstipp-Überschriften bleiben getrennte Typografiebeobachtungen.

Frühe Mobilaufnahmen vor abgeschlossenem Scrollen/Layout wurden nicht angenommen. Alle 41 Seiten
neu mit mindestens zwei stabilen atomaren Geometriebeobachtungen, bereiten Bildern/Schriften und
sichtbarer Überschrift aufgenommen; nach dem Original-JPEG nochmals unveränderte Geometrie gefordert.
Originale unverändert exklusiv gespeichert und vollständig zurückgelesen; führender DOM-Beleg
`e7f42431…/layout-mobile-settled-cells.json`,
`a0322d7832f8b1d2b3db832421cb3731d286042dd95af14488830ae207f20bfa`;
Bildindex `layout-mobile-settled-originals-index.json`,
`920924115810aad2198d7684854ad6559e26970adf6dd5c6292eaf1359a41c42`.
Alle 41 Mobiloriginale inzwischen unabhängig tatsächlich angesehen: **38/38 Zielseiten** für freie
vollständige Überschrift und geladenen Kartenbeginn angenommen. Wendehals/Bartmeise mobil passend.
Amsel ist äußerlich lesbar, hat aber weiterhin −25,8573 CSS-px Rechteckabstand; keine geometrische
Überlappungsfreiheit oder Annahme des inneren Kartenkopfs daraus. Gaukler zeigt im Ausschnitt keinen
Vorabsatz, beim Rotfuchs liegt dieser überwiegend hinter dem festen Kopf; diese Absätze sind nicht
vollständig mitabgenommen. Review `53ce07f0…/independent-mobile-settled-heading-map-start-review.json`,
`b50e95cb7d3933432fbaa0c9dd881e470c286ec423922d0d722bf920780fe132`.

**A72 – sämtliche 29 mobilen Übergangsgrenzen angenommen:** Für alle aufeinanderfolgenden
Fachtextblöcke der fünf betroffenen Arten neue stabile Originale aufgenommen. Alle 29 Bilder unabhängig
einzeln angesehen: Ende des Vorgängers und nächste vollständige Überschrift gleichzeitig frei sichtbar;
positive atomare Textabstände ohne Kollision. Auch alle fünf ursprünglichen Fehlerpaare bestanden.
In 15 Ausschnitten beginnt der längere Vorgänger oberhalb des Bildes; seine gesamte Lektüre wird nicht
behauptet. DOM `e7f42431…/a72-mobile-transition-cells.json`,
`3872b1c4c2538f56ddcd025e4d50283f3dcee31f4014d6cf04126cd7b5f53883`;
Index `a72-mobile-transition-originals-index.json`,
`82b69c3e3f094a77fc62311a08a74152662c0a56da4d0a566a3058c9d4ad18c4`;
unabhängige Annahme `e35d8ffd…/independent-a72-mobile-text-transition-review.json`,
`b9dd9c289eddb4ee8741153794432c7b017c05636a8922d86bac5297bec9d319`.
Ein anschließender zusätzlicher breiter Textprüfabschnitt wurde nach 60 Sekunden durch die
Browsersteuerung beendet; nicht dauerhaft gesicherte Teilaufnahmen daraus sind keine Abnahme.
Bereits gesicherte Desktop-/Tablet-Karten- und mobile Textbelege bleiben davon unberührt.

Eigener Vorschauowner regulär geschlossen, tatsächlicher Exit 0, Manifest geschlossen/0/keine Helfer;
eigener Tab geschlossen und Ansichtsüberschreibung zurückgesetzt. Alle 94 vorbereiteten Eingänge
mit 23.761.963 Bytes nochmals unabhängig exakt geprüft. Abschlussbindung `e5789ef5…`,
`5740da519685c673fc5c6b64dd6cb0a9d73775e020a1e5f98334ed63668e5bca`;
Root-Lebenszyklus `e7f42431…/website-a71-a72-owner-closed.json`,
`2041467c919b02d51b04dcc48be033873f1f4fc22d1ddba14ce24c0a2a7f5ff7`.
Komplette übrige Karten-/Galerieanschlüsse, breite A72-Restprüfung, aktueller CMS-Abgleich,
Integration und Veröffentlichung bleiben getrennte offene Grenzen. Keine zusätzliche Veröffentlichung.

**Lightroom – neuer Offline-Nachvergleich ausschließlich vorbereitet:** Neuer Prüfer `86e0f9ce…`,
SHA-256 `e1fe3f32869adde104adef3f261fc12abdafa5c1040ef0c59a213b13ed286fbd`, mit ausdrücklicher
Eingangsbindung `af2faba1ed6a58b70bb2452b11aebcb9f5a8dec888ed4436a006baa630257464`.
14/14 reine JSON-/Lua-Gegenproben bestätigen vollständigen Sollvergleich und Ablehnung veränderter
FN-/IPTC-Felder, Relationen, Statistik, Paket- und Journaldaten. Alte Oracle-Fehlprobe bleibt rot.
Beleg `646c003b…/private47-offline-commit-pure-counterprobes.json`,
`25e7903bd1e1eeb52e92253034b780544e8e8db28d523717fc31278eb77d08ac`;
null SQLite-Öffnungen, keine tatsächliche Commit-Kopie gelesen. Noch keine Ausführungsfreigabe oder
unabhängige Gesamtabnahme des neuen Prüfers. Später nur zwei exakt gebundene unveränderte Kopien,
neue lebende Root-Lease und frischer Review bei unveränderten 146 Quellen/drei Helfern zulässig.
Die neue Ergebnisart wäre kein vom alten Capturevertrag akzeptierter Recovery-Anker; Recovery ist
damit noch nicht vorbereitet. Original .39 nach dem erneuten Hauptkatalogstart nochmals nativ aktiv
bestätigt; Zusatzmodulmanager anschließend geschlossen. Endbeleg
`e7f42431…/private47-final-main-d-original39-active-native.json`,
`37d3450961ff13c1b3b7827590df0d362f61f1f8eee6de939a479f3a89eda6b3`.

Eigener Belegempfänger `e7f42431…` ebenfalls regulär beendet, Exit 0: **662/662 Originalbelege**
vollständig mit Identitäts-/Zeit-/Prüfsummenkontrolle gelesen, keine fehlende Datei, keine Schließfehler;
Sitzung geschlossen/0/keine Helfer. Führendes `evidence-result.json`,
`6307638c9310eb9ac4ad381fc4aa4d71f7ccfc81acec066927e9348d23aa3821`.
Dokumentprüfung nach Integration bestanden: 80 Markdown-Dateien ohne fehlende lokale Verweise;
gezieltes `git diff --check` ohne Fehler. Keine abschließende Bereinigung, Veröffentlichung oder
Gesamtaudit-Freigabe aus diesem begrenzten Arbeitspaket.

**25. Oktober – tatsächlicher Offline-Nachvergleich unabhängig angenommen:** Der neue Prüfer wurde
nach 14 reinen Vergleichsproben und 20 unabhängigen Ausführungs-Guardproben genau einmal ausgeführt.
Frische Root-Lease `bc407000…`; ausschließlich die beiden unveränderten exklusiven historischen
Commitkopien geöffnet, insgesamt zwei schreibgeschützte SQLite-Zugriffe, keine Originaldatenbank.
Sechs vollständige FN-/IPTC-Datensätze und alle 66 Stichwortrelationen entsprechen dem Soll:
drei tatsächlich gespeicherte Effekte, drei unberührte Kontrollen, vollständige Statistik mit Revision
18 → 19 und das echte Journal weiterhin mit drei `prepared`-Zeilen. Quellen und Dateistempel vor/nach
unverändert, vollständige Hostprozesssicht ohne Lightroom oder private Helfer bestätigt.

Rootfreigabe `b014e09d…/root-offline-commit-execute-review.json`,
`19c6408f192115ed87e56af5210f93402469782ced0a9a0426bcb05eacca232e`;
tatsächliches Ergebnis `c7afa5e3…/private47-offline-existing-commit-comparison.json`,
`66459feae5fad9e6ac2993a9bb58e943fa973af947ff070d20bebf6475af5fc5`;
unabhängige Annahme `bee6865c…/private47-offline-actual-result-review.json`,
`7768cd740f6b93840618979d363ea7dec94113581f5b89598bb07cd02e5e53e2`.
Der frühere Capture bleibt ausdrücklich fehlgeschlagen. Dies ist eine eigene eng gebundene
Offline-Annahme, keine nachträgliche Umdeutung und noch kein nativer Recovery-Nachweis.

**Recovery-Prüfwerkzeuge vor der Ausführung weiter begrenzt:** Der erste unabhängige Review wies
eine zu schwache Annahme beliebiger positiver Peer-JSONs sowie einen zu frühen Leserimport ab.
Die neue Vorbereitung bindet Ergebnisart, vollständigen Prüfumfang, Quellen und alle Referenzen;
der Leser wird erst nach seiner Hashprüfung importiert. 30 eigene und 22 unabhängige reine
Guardproben bestanden (`14881f91…/private47-recovery-revised-preflight.json`,
`bbf2782f39179ee78961cc4bacbf3e3a2e9434628ec55f4de88ed8f35a6627fd`).
Eine anschließend erkannte Schließlücke bei einem Fehler des Belegschreibens wird vor tatsächlicher
Kopie/Before-Prüfung in einer neuen Version korrigiert und erneut unabhängig geprüft; das bisherige
Werkzeug-Go deckt diese Ausführung nicht ab. Noch keine native Recovery oder Teilrücknahme.

**Explorer nativ über die normale Desktop-Verknüpfung geprüft:** Nach regulärem Schließen startet
die tatsächliche Verknüpfung wieder die produktive Electron-App. Suche nach Papageientaucher findet
`Fratercula arctica`; Detailmedien laden, die zugehörige vergrößerte Karte öffnet sich und Escape
schließt den benannten Dialog. Originalbelege unter laufendem Root-Belegempfänger `53eb764a…`:
`explorer-native-desktop-restart-ready.json` (`1306339a…`),
`explorer-native-papageientaucher-selected.json` (`1dfc5535…`) und
`explorer-native-papageientaucher-map-dialog.json` (`5b229776…`).
Dies ist eine native Funktionsbeobachtung, keine kontrollierte Kaltstart-/RSS-Leistungsmessung.
Keine Art-, Medien- oder Katalogdaten geändert; historische Testart Löwe weiterhin bewusst getrennt.

**Website-Restumfang durch tatsächliche Bildnachsicht präzisiert:** Alle 34 bereits gebundenen
Mobiloriginale unabhängig auf vollständige Karte einschließlich Legende, Quellenanschluss und
ersten Galerieanschluss angesehen; diese begrenzten Zellen müssen nicht wiederholt werden.
Review `fcd9ec36…/existing-mobile-whole-map-reuse-review.json`,
`8d8e4588ff1f821ff7ec1e73ce6bef159ee6292c648e095e9dcd81aae5c7c75e`;
Restmatrix `effective-native-rest-matrix.json`,
`f325dada259d3bc6c17c576ead6968a8ea716b1c12fc7e9c3c87d2330980d729`.
Offen bleiben 41 Desktop-, 41 Tablet- und sieben Mobil-Karten-/Galerieanschlüsse, zehn breite
A72-Textkontexte jeweils mit Baselinevergleich sowie sechs Übersichts-/Statusbandzellen.
Der neue private Root-Vorschauowner `ba931fda…` liefert dafür dieselben geprüften Korrekturen;
107 Eingänge mit 25.717.479 Bytes frisch geprüft, keine zusätzliche Veröffentlichung.

**Lightroom – nativer Commit-/Journal-Wiederanlauf bestanden:** Nach angenommener frischer
Before-Erfassung genau den echten Lauf `c61bfcd2…` geöffnet. Nativ zuerst `0 angewendet · 3 offen`,
danach drei eindeutig lesbare vorbereitete Zustände, null ungeklärte und der ausdrückliche Hinweis
„Dieser Schritt ändert keine Fotos“. Genau einmal „Protokoll bestätigen“ ausgeführt; anschließend
„Lauf bereits abgeschlossen – Keine vorbereiteten Fotoänderungen mehr vorhanden“.
Originale `53eb764a…/private47-recovery-journal-only-confirmation-native.json` (`5bc2ec79…`) und
`private47-recovery-already-completed-native.json` (`ba26d2f4…`) unabhängig samt Originaldialogbildern
angesehen. Private .47 verwendet unveränderte deaktivierte Störfallbindung, kein Override aktiviert.

Regulär geschlossen; neue exklusive After-Kopien und genau eine Erfassung bestätigen ausschließlich
die drei Journalwechsel `prepared → applied`. Alle sechs vollständigen FN-/IPTC-Zustände, alle
66 Relationen, der Journalplan samt Vor-/Nachzeilen und die gesamte Statistik auf Revision 19 bleiben
exakt gleich. Ergebnis `13a7b2a3…/private47-native-recovery-closed-result.json`,
`d82e96905bfd62196ac4f820110a56107301c931b1810721e4ed0c9b724150f2`;
unabhängige Annahme `47463614…/private47-recovery-after-independent-acceptance.json`,
`e9d34c4b9be85b31d90f895613fd1138f89dbf9b3079f700572353682f616822`.
Root-Annahme `6f6f76cb…/root-private47-recovery-after-accepted.json` (`a5a1e6f4…`).

Ein zu früh durch Root gestarteter privater Katalog verhinderte zuvor den aktuellen Stempelreview
der ersten Before-Erfassung; keine Recovery bestätigt. Nach regulärem Schließen neue Sequenz 002
erstellt und vor erneutem Lightroomstart unabhängig angenommen (`70e4bbe7…`, `a6af6d55…`). Alte
angehaltene Peer-/Erfassungsbelege bleiben erhalten. Sämtliche tatsächlichen Kopien und Vergleiche
innerhalb der lebenden Lease abgeschlossen. Der Wächter endete anschließend automatisch an seiner
Frist mit Exit 0; Manifest geschlossen/0/keine Helfer. Ein nachgereichter exakter Schließauftrag ist
keine behauptete Ursache dieses bereits erfolgten Endes
(`6f6f76cb…/root-private47-recovery-owner-lifecycle.json`, `0ac99289…`).
Keine weitere Aktion auf dieser abgelaufenen Lease.

Getrennte Konflikt-/Teilrücknahme weiterhin offen: erster Quellenreview stoppt den neuen Helfer,
weil Kopienhash und physische Quelltrennung erst nach dem vorgesehenen SQL-Lesen geprüft würden.
Reine Sperrgegenprobe belegt dies ohne echten Datenbankzugriff
(`d2c8de33…/private47-conflict-source-review.json`, `422525d4…`).
Eine neue enge Version wird vor tatsächlicher Konfliktaktion geprüft.

**Konfliktprüfung – korrigierter Prüfer und erster echter Zwischenstand:** Der neue Prüfer
`ed46e8ba…/private47-conflict-runtime.mjs` (`a31038ff…`) prüft Quellen-/Kopienhashes und die
physische Trennung vor Readerimport und SQL. 37 reine Gegenproben und elf unabhängige
Gegenproben bestanden; unabhängiges Quellen-Go `d5990410…` (`532fe509…`). Alter No-Go-Beleg
bleibt erhalten. Neue lebende Root-Eigentümersitzung `93bea048…`, keine Übernahme des alten Owners.

Im eigenen Sechs-Foto-Katalog ausschließlich beim künstlichen `identity-merge-2.jpg` die Zuweisung
des Artstichworts 1309 entfernt. Geschlossene Kopien bestätigen genau diese eine entfernte Relation:
65 verbleibend, alle sechs vollständigen FN-/IPTC-Zustände und die gesamte Statistik Revision 19
unverändert, drei Journalzeilen weiterhin `applied`. Tatsächliches Ergebnis `ba053b1f…` (`07bb5fe3…`),
unabhängige Annahme `970b5daf…` (`e3239798…`), Root-Annahme `c760de00…` (`4e56d8d8…`).
Native Vorschau erkennt genau dieses Foto als Konflikt und bietet zwei Rücknahmen unter Erhalt von
Ort/Zeit und fremden Stichwörtern an. Vorbereitung hält anschließend erwartungsgemäß mit
`AUDIT_FAULT_DISABLED` vor dem Fotoschreiber. Geschlossener Zwischenvergleich `ec6dc038…`
(`53f3a33c…`) bestätigt zwei `undo-prepared`, eine `applied`, unveränderte sechs Rohzustände,
65 Relationen und Statistik 19. Unabhängige Annahme und tatsächliche Teilrücknahme noch ausstehend.

**Weitere Karten-/Galerieabnahme:** Alle 41 ausstehenden privaten Desktop-Kontexte vollständig
aufgenommen und unabhängig bildlich geprüft: vollständiger Kartenkörper, Legende/Kartenfuß,
Quellenzeile und geladener Galerieanfang. Führende fünf Chargenbelege `221cffec…` (`29108bc8…`),
`d639177b…` (`195db72c…`), `d86f4a13…` (`1cae67b1…`), `dc569719…` (`b0533a47…`),
`032f91ed…` (`dcf87f4f…`). Einzelbilder, JSON-Hashes, konstante Geometrie und lückenlose sichere
Sichtintervalle getrennt bestätigt. Die verworfenen Amsel-Erstaufnahmen mit wechselnder Geometrie
bleiben unangenommen; nur die stabile Ersatzserie zählt. Der letzte Review korrigiert zudem nur zwei
falsche Notiznamen im ersten Review: 046 Blässhuhn, 047 Buchfink; IDs und Hashbindungen waren richtig.
Erste zwölf Tablet-Kontexte ebenfalls in `032f91ed…` und `25f60c79…` (`b051b3a2…`) angenommen.

Die alte Wendehals-Kontrolle liefert weiterhin keinen äußeren Überschriftennachweis. Ihr eingefrorener
Abruf liegt vor der bereits öffentlich bestätigten CMS-Korrektur; die heutige Restvorschau übernimmt
bewusst diese historische Quelle. Daraus folgt kein neuer öffentlicher Fehler. Karten-/Galerie-Go und
äußere Überschrift bleiben getrennt. Präzisierung: Die frühere Überschriftenmatrix umfasst 123 gesichtete
Originale, davon 114 angenommene Zielkontexte und neun Kontrollen mit einzeln benannten Grenzen.
Eine frische öffentliche Wendehalsquelle wird für den abschließenden Vergleich gesondert gebunden.

**25. Oktober – weitere angenommene Rücknahme- und Websiteprüfungen:** Die vorbereiteten zwei
Rücknahmen wurden unabhängig angenommen (`9a4447ba…`, `4d800741…`) und nativ ausgeführt.
Geschlossene Kopien bestätigen genau zwei zurückgenommene Fotos, das manuell geänderte Konfliktfoto
bleibt unangetastet: sechs vollständige FN-/IPTC-Zustände, 65 Relationen, gesamte Statistik Revision 20.
Ergebnis `f58167d2…` (`6f3fba91…`), Peer `56887cdd…` (`14482e26…`), Root `4b73a2ea…` (`38e67668…`).
Die alte Eigentümersitzung endete an ihrer Frist; der spätere Schließauftrag war nicht deren Ursache.
Alle betreffenden Aktionen lagen vor Fristende. Neue eigene Sitzung `b9caef8b…`, keine alte Lease übernommen.

Anschließend ausschließlich die entfernte Stichwortverknüpfung des künstlichen Konfliktfotos manuell
wiederhergestellt. Unabhängiger Vergleich bestätigt 66 Relationen bei unveränderten sechs Rohzuständen,
Statistik 20 und zwei zurückgenommenen/einer angewendeten Journalzeile (`d6146c6a…`, `ff1873c7…`).
Die erneute native Rücknahmevorschau erkennt genau ein Foto, null Konflikte. Erwartete Testunterbrechung
vor dem Schreiber; geschlossene Kopien und Peer bestätigen ausschließlich dessen `undo-prepared`-Wechsel
(`abd652c6…`, `14c70349…`; Root `b328f55f…`, `182bae80…`). Der letzte nativ abgeschlossene Schreibschritt
meldet ein zurückgenommenes Foto; tatsächlicher Endvergleich `1b4f059a…` (`b630f7f4…`) und unabhängige
Endannahme `870975f8…` (`d4216798…`) bestanden. Alle sechs vollständigen Fotozustände und 66 Relationen
entsprechen exakt dem Original-Before, alle drei Journalzeilen `reverted`, gesamte Statistik korrekt auf 21.
Root-Annahme `e7788f0d…` (`28355d84…`); private Bindung auf die ursprünglichen 166 deaktivierten Bytes
zurückgestellt. Eigener Wächter vor Fristende regulär durch exakten Schließauftrag beendet, Exit 0,
Manifest geschlossen/0/keine Helfer (`53eb764a…/private47-final-owner-regular-close-result.json`,
`a712d42c…`). Original .39 nativ wieder allein aktiv und Hauptkatalogpfad auf D: in den Katalogeinstellungen
bestätigt; nach Katalogwechsel nochmals aktives Original nachgewiesen (`7149345c…`, `d8cd61e8…`).

Alle 41 Tablet-Karten-/Galerieanschlüsse sind inzwischen unabhängig bildlich geprüft; zusätzliche Chargen
`56863aeb…` (`515aa768…`), `fc1e186d…` (`f397d6cf…`), `e47d5864…` (`ff7ad7bb…`) und
`a405988a…` (`4465296f…`). Letztere umfasst auch die sieben fehlenden Mobilkontexte. Damit sind alle
41 Kartenkörper, Legenden, Quellen und Galerieanfänge in allen drei Ansichten belegt. Kein vollständiges
Kartenkopf-Go für Amsel mobil: die äußere Überschrift verdeckt den inneren Kartenkopf. Frischer öffentlicher
Abruf bestätigt dieselben überlappenden Rasterplätze; enger mobiler Zweizeilen-Abstandskandidat vorbereitet
(`2a04c0b8…/one-page-comparison-preparation.json`, `09292a00…`), noch nicht gerendert oder veröffentlicht.
Die alte breite Wendehals-Kontrolle bleibt ohne äußeres Überschriften-Go.

Breite A72-Textkontexte vollständig für alle fünf Arten mit Baselinevergleich angenommen: Desktop 28,
Tablet 34 Originalbilder tatsächlich unabhängig angesehen (`31f20213…`, `35a86f18…`; `a1c7b909…`,
`c2b86f58…`). Vollständige Texte/IDs/Rasterplätze gleich, lückenlose Sichtintervalle und maximal
0,000183 CSS-Pixel Messabweichung bei expliziter 0,002-Pixel-Toleranz. Bereits fehlerfreie breite
Baselines sind Regressionskontrollen, kein behauptetes Text-Rot-Grün. Bestehende Tablet-Wortteilung
„BEOBACHTUNGSTI / PP“ bleibt ein getrennter Typografiebefund.

Alle sechs privaten Übersichts-/Statusbandzellen unabhängig angenommen: 68 Originalbilder aus 34
zeitversetzten Paaren tatsächlich angesehen (`54e4c5c7…`, `2bfbd6ad…`). Wildlife steht in allen Ansichten
Heimische Tierwelt → Afrika → Costa Rica → Island → Asien/In Arbeit; Latium bleibt bei 2022, sechs
Reisestatusbänder liegen auf den richtigen Logo-Plätzen, Costa Rica 2024 bleibt ohne Band. Tatsächliche
Bandbewegung belegt; kein Reduced-Motion-Modus aus diesen Aufnahmen abgenommen. Mobile Rasterverschiebung
durch Kopfverkleinerung ausdrücklich relativ zum Rasteranker geprüft. Breite Reisetitel-Wortteilungen bleiben
getrennt. Die Quadratentscheidung betrifft Reisegalerien innerhalb der Reiseseiten, nicht diese Übersichtskacheln.
Aktuelle CMS-Integration, Veröffentlichung und Gesamtabnahme bleiben offen. Root-Vorschauowner `ba931fda…`
regulär geschlossen, Exit 0, geschlossen/0/keine Helfer; eigener Hintergrundtab geschlossen, Ansicht zurückgesetzt.

Ein zusätzlicher Fehler betrifft die private Vorschauvorbereitung: Bei fehlgeschlagener Speicherung
eines Operationserwerbs konnte der Eigentümer offen bleiben; die Speicherwarteschlange blieb danach
abgewiesen. Enge Korrektur privat mit zwei echten Rot-Grün- und vier unabhängigen Dateisystemfällen
geprüft (`12eb17a0…`, `408df944…`). Produktmodul erst nach Ende der gebundenen Lightroom-Prüfung geändert:
Speicherwarteschlange erholt sich nach gemeldetem Fehler; fehlgeschlagener Erwerb nimmt ausschließlich seine
eigene Erhöhung zurück. Neun gezielte Tests und genau ein vollständiges Gesamtgate bestanden: 50 Gruppen,
2.217 Tests, keine Fehler/Abbrüche/Skips; 177 Quellen vor/nach identisch (`f424f3f9…`, `34e08abe…`).
Korrekte Spec-Logzählung gesondert gebunden, kein Wiederholungslauf (`ebe078a2…`, `1325cbb2…`).
Die neue private Zweitseiten-Vorbereitung `27a9139a…` (`92d58040…`) ist nach 84 eigenen und vier unabhängigen
Gegenproben für den begrenzten Start angenommen (`f6f70329…`, `54a7d9c0…`); sichtbare Amselkorrektur und
frischer Wendehalskontext sind dadurch noch nicht abgenommen.

**25. Oktober – letzte Kartenkontexte und freigegebener Einzelbildtext abgeschlossen:** Die frische
Wendehalsquelle besteht Desktop/Tablet/Mobil einschließlich äußerer Überschrift, innerem Kartenkopf,
vollständiger Karte, Legende, Quelle und geladenem Galerieanschluss. Amsel-Baselines bei 320/390/767
zeigen den verdeckten inneren Kopf; der erste Abstandskandidat behebt 320/390, aber nicht die gebrochene
Breite zwischen 767 und 768. Gespeicherte Browserabfragen belegen dort `innerWidth:767`, DPR 1,13,
`max-width:767px=false`, `width<768px=true`, `min-width:768px=false`.
Neue ausschließlich private CSS ändert nur dieses Prädikat (324 → 321 Byte); unabhängige Quellenprüfung
`42f5de60…` (`880d511f…`), Vorbereitung `263368c1…` (`03b7bacc…`). Tatsächlicher Abstand dort
−18,736 → +51,231 CSS-px; 320/390 ebenfalls frei und 768/1280 mit unveränderten +10,993 CSS-px.
Alle 54 Originalbilder der 19 Kontexte tatsächlich unabhängig angesehen: erste Serie `90e5e924…`
(`6b11e819…`), korrigierte Zusatzserie `11d564d5…` (`373025c9…`). Alte rote Baselines und alter
767er-Kandidat bleiben rot; transiente Einzelbilder ausgeschlossen. Bestehende Wortteilung
„VERBREITUNGSKART / E“ bei 320 bleibt getrennt. Beide eigenen Vorschauowner regulär beendet,
Exit 0/geschlossen/0/keine Helfer; Ansichten zurückgesetzt und eigene Prüftabs geschlossen.

Boca Tapada: exakt Felix' vorgegebener Kahnschnabeltext einschließlich „Nachts“ im tatsächlichen
Galeriefeld „Beschreibung“ für `_7R53584-Verbessert-RR.JPG` übernommen. Der Galerieeditor speichert
beim Schließen; der zusätzliche Seitenspeicherknopf blieb deaktiviert. Erst die frische öffentliche
Neuladung belegt die Wirkung. Vollvergleich aller 37 Positionen/74 Figure-DOM-Einträge: genau eine
Bildunterschrift und ihre zwei abgeleiteten Altattribute geändert, sämtliche Bilder/Links/Reihenfolge
und übrige Texte gleich. Drei öffentliche Originalansichten persönlich und unabhängig angesehen;
vollständiger Text ohne Überdeckung. Tablet belegt den Text, nicht das oberhalb des Ausschnitts liegende
ganze Foto. Ergebnis `53eb764a…/website-kahnschnabel-public-result-25oct.json`,
`d5a92e1e915dc614ce58f68b523279fec755e043b4b580fe24a3ae72bfd16425`;
Root-Annahme samt Karten-/Lebenszyklusbindungen `root-final-map-and-caption-acceptance-25oct.json`
(`63f93416…`). Keine allgemeine Alternativtextüberarbeitung. CMS-Bearbeitung verlassen, eigene Tabs zu.

**Frischer GitHub- und Einbauabgleich:** Remote `main` ist `bb0fe718…`, fünf Commits vor lokalem
HEAD `8116806…`. Vorhandener Pages-Lauf `40046592586` für exakt den Remote-HEAD hat drei erfolgreiche
Jobs; Artefaktliste inzwischen leer, deshalb keine erneute binäre Inhaltsabnahme dieses Artefakts.
Öffentliche Branchmetadaten weiterhin ungeschützt, Rulesets und Releases leer; keine Einstellungsänderung
oder neue Administrations-/Secretsabfrage. Aktuelle Antworten `53eb764a…/github-current-public-metadata-25oct.json`
(`957bb28c…`) und `github-current-compare-and-pages-jobs-25oct.json` (`ea973e94…`).
Alle zwölf Remote-Dateien bestehen ihre Git-Blob-Prüfsummen. Unabhängiger Dreifach-/Hunkvergleich findet
keinen verlorenen veröffentlichten Funktionsfix: fünf Dateien bytegleich, eine saubere Erweiterung,
zehn erklärbare Textüberschneidungen in sechs weiterentwickelten Dateien. Die ältere Nur-Montenegro-Regel
darf den neueren Sechs-Bänder-Auftrag nicht überschreiben. Review `c193eeea…` (`6352b9e4…`),
Rohvergleich `87deb2cc…` (`811028cb…`). Veralteter entsprechender Monatsprüfvertrag berichtigt.
Dies ersetzt keine spätere kontrollierte Git-Abstammungsintegration; kein Fetch/Merge/Reset/Commit/Push.

Gespeicherte aktuelle CMS-CSS und Footer ohne Eingriff neu gelesen. Tatsächlich noch zehn Module,
Karte 1.0.8/Sortierung 1.0.3, ohne Hero-Modul; lokale Kandidaten und Live-Einbau ausdrücklich getrennt.
Belege `53eb764a…/website-cms-current-css-readonly-25oct.json` und
`website-cms-current-footer-readonly-25oct.json` (`c319e0bd…`). Quellenintegration und allgemeine
Websiteveröffentlichung bleiben offen. Lightroom zuletzt wieder normale Bibliotheksansicht, kein
Testdialog (`private47-main-catalog-final-normal-library-native.json`, `fef670b4…`).

**Neue Sicherheitspriorität am 25. Oktober:** Frisches `npm audit` meldet zwei hohe Befunde, darunter
[Electron/eMudhra](https://github.com/advisories/GHSA-jr5w-w6x2-84p9) und
[Undici/Content-Encoding](https://github.com/advisories/GHSA-xjj6-f33q-929c). Offizielle Hinweise und
Registrydaten frisch geprüft; Mindestfixes 42.11.16 beziehungsweise 7.30.1. Der begrenzte npm-Trockenlauf
schlägt ausschließlich Electron 42.11.18 und Undici 7.30.1 vor, ohne neue/entfernte Pakete.
Root bereitet nur `package.json`/Lockdatei mit ausgeschalteten Installationsskripten vor. Exakter Vergleich
gegen erhaltene Vorherbytes: ein Manifestwert und sieben Lockwerte; sämtliche bisherigen Nutzerskripte
und anderen Abhängigkeiten gleich. Korrigierter Vergleich `53eb764a…/security-prepared-lock-delta-corrected-25oct.json`
(`2194e376…`). Die Vorherdateien wurden verlustfrei als JSON-Bufferhülle gesichert; erst deren Dekodierung
mit ursprünglicher Byteprüfsumme ergibt den gültigen Vergleich. Der vorherige direkte Objektvergleich
`security-prepared-lock-delta-25oct.json` ist ausdrücklich unbrauchbar und keine Annahme.

Tatsächlich installierte Pakete und Binary weiterhin 42.10.0/7.29.1; noch kein Austausch. Die native
Schließanforderung lässt den Explorer bisher geöffnet. Eine eingeschränkte Prozesssicht wurde zunächst
fälschlich als Ende gelesen; frische native und vollständige Hostsicht widerlegen dies. Korrektur
`security-explorer-close-attempt-not-accepted-25oct.json` (`0698ad34…`) ersetzt den früheren falschen
Schließbeleg; keine Paketdatei im Installationsbaum oder Binary wurde auf dessen Grundlage verändert.
Felix um reguläres Schließen gebeten; kein Zwangsende. Neue native Leistungsvorbereitung bleibt bis zum
verifizierten Sicherheitsupdate gesperrt. Frühere bestandene Funktionsläufe bleiben historische Belege,
keine aktuelle Sicherheitsabnahme. Vorherige einzelne Produktiv-Prozessmessung `3621e689…` ist nur eine
Momentaufnahme; Working Sets können gemeinsame Seiten enthalten, Private Bytes sind kein physischer RAM.

**Zusätzliche Veröffentlichungsgrenze:** Im lokalen Pages-Workflow folgt auf `npm ci --ignore-scripts`
jetzt ein eigener Schritt `npm audit --audit-level=high`, einschließlich Entwicklungsabhängigkeiten.
Hohe/kritische Befunde oder ein Abfragefehler verhindern den Artefaktbau. Das lokale `quality:ci` bleibt
ohne diese Netzwerkabfrage ausführbar. CI- und Repository-Vertrag entsprechend ergänzt. Der exakte
Befehl wurde gegen die vorbereitete Lockdatei mit Exit 0 und null Befunden ausgeführt; Beleg
`53eb764a…/security-prepared-lock-cli-audit-and-ci-guard-25oct.json`
(`245b7d82f404001e6cb4cc00d5ab11f2d1299b6c0e013efafef6832d7e241709`).
Das prüft den Lock-Paketgraphen. Installiert bleiben bis zum regulären Schließen und Austausch
Electron 42.10.0/Undici 7.29.1. Keine Aussage zur separat installierten Node-Laufzeit, keine neue
Linux-Abnahme oder Veröffentlichung aus diesem lokalen Schritt.

**A-82 – Desktop-Start-/Schließprüfung:** Vier zugewiesene Quellen eng geändert. Der Healthcheck
teilt eine monotone absolute Frist über alle Versuche einschließlich Antwortkörper; jede der drei
Schließlesungen endet spätestens nach ihrer fünfsekündigen Frist. Getrennte Statusauswertung erhält
bekannte Pipeline-/Sicherungs-/Änderungshinweise; unbekannte oder ungültige Werte erfordern eine
ausdrückliche Wahl, Standard und Abbruch lassen offen. Gleichzeitiges erneutes Schließen dupliziert
weder Lesen noch Dialog. Originalprobe `6e8b47c0…/a82-red-result.json` (`22bafe23…`) mit 11 roten
von 13 neuen Fällen, danach dieselben 13 grün und gesamte gezielte Desktop-/Servergruppe 25/25;
`3fb08bd4…/a82-targeted-green-result.json` (`a0ed7477…`). Alle vier Quellen im Lauf unverändert,
Sitzungen geschlossen/0/keine Helfer. Root liest vollständigen Diff und tatsächliche Statusproduzenten
unabhängig gegen: `53eb764a…/a82-root-independent-source-review-25oct.json` (`0508bf29…`).
Keine zusätzlichen ausgeführten Roottests behauptet. Das laufende Original hat die Quellkorrektur noch
nicht geladen. Native Abnahme und neues Gesamtgate bleiben offen; der konkrete aktuelle Fensterhang
ist damit nicht ursächlich erklärt. Die Lesefrist ist keine zugesicherte Frist für den Serverabbau.

**A-71/A-72 – integrierte Quellen und tatsächliche Grenzprüfung abgeschlossen:** Die gesonderte
Beobachterkorrektur `7bd59ce5…` (`b156adbc…`) erhält den alten breiten Modus und bindet 34 Volltexte
an fünf feste Arten. Neue geschlossene Wrappervorbereitung `01e5b848…` mit wortgetreu eingebetteten
Lesefunktionen (`ad8db3c1…`). Nach Root-Quellreview `53eb764a…/website-integrated-boundary-root-start-review-25oct.json`
(`ed52d8dc…`) alle 28 Zellen tatsächlich aufgenommen: fünf Textseiten und zwei Karten-/Galerieseiten,
je 767/768 und bisherige/korrigierte Medienbedingung. Fester Gesamtindex
`website-integrated-boundary-all-28-cells-25oct.json` (`76221bdb…`) bindet 101 stabile Original-JPEGs.
Die erste Kormoranaufnahme war transient und bleibt ausdrücklich ausgeschlossen.

Alle Originale unabhängig einzeln gesehen: erste zwölf Zellen/33 Bilder `007065fe…` (`d9dc00d3…`),
acht lange Textzellen/45 Bilder `e9fbf49e…` (`5082c61c…`), acht Karten-/Galeriezellen/23 Bilder
`ec0db454…` (`f1ae3f9d…`). Tatsächliche sichere Sichtintervalle decken alle Regionen lückenlos ab.
Bei Gabelracke/767 verdeckt die bisherige Fassung den letzten Besonderheiten-Satz; korrigiert frei.
Goldbaumsteiger/767 ist schon zuvor frei und bleibt positive Kontrolle. Kormoran/Kleiber/767:
Kartenüberschriftsabstand −18,736 → +16,247 CSS-px, vollständige Karte/Legende/Quelle/Galerieanfang
erhalten. Bei 768 bleiben Raster und Darstellung gleich. Eigene reine Geometriegegenrechnung liegt
bei maximal 0,000123 CSS-px Rundungsrest, keine eigenständige Pixelabnahme daraus.
Bestehende Wortteilung „BEOBACHTUNGSTI / PP“ bleibt getrennte Typografiegrenze. Aus den Textbildern
wird keine neue vollständige Kartenabnahme abgeleitet. Einzelne Map-1.0.9-Aufnahmen unterscheiden sich
in der Öffnerpräsenz; diese Pixelserie bestätigt keine Klick-/Tastaturbereitschaft. Quelllogik entscheidet
die Mobilöffnung einmal beim Laden; ein nachträglicher Ansichtswechsel ist als mögliche Erklärung,
nicht als bewiesene Ursache festgehalten. Integrierte Bedienprüfung bleibt gesondert nötig.

Erste eigene Vorschau war aus der normalen Ausführung für den Browser nicht erreichbar und wurde
regulär beendet; keine öffentlichen Websitefehler daraus. Frische identische Vorschau auf dem Rechner
unter eigenem Owner `e8a6853a…` erfolgreich, danach ebenfalls tatsächlicher Exit 0, Listenerende,
geschlossen/0/keine Helfer. Keine Sicherheits-/Firewalländerung. Abschlussbindung
`website-integrated-boundary-768-geometry-and-close-25oct.json` (`0b8642eb…`); eigene Ansicht zurückgesetzt,
Prüftab geschlossen. Die beiden nicht bindbaren eigenen Fehler-Tabs bleiben der automatischen
Browserbereinigung überlassen, ohne Umgehung der URL-Schutzgrenze.

Nach allen drei Reviews exakt das geprüfte CSS (`05ccaf4e…`, 43.389 Bytes) in
`docs/squarespace-custom.css` und den Footer (`2d471bd4…`) lokal übernommen. Vorherbytes erhalten;
nur Taxonomie-Cacheparameter 1.0.9 → 1.0.10 zur CSS-Erneuerung, keine Änderung der Taxonomie-JavaScriptlogik.
Beleg `53eb764a…/website-integrated-css-local-takeup-25oct.json` (`705cf32c…`). Dies ist keine
CMS-/GitHub-Veröffentlichung. Die beiden originalen LESS-Ausdrücke bleiben im vorbereiteten CMS-Text
erhalten; tatsächliche Kompilierung, aktueller Einbauabgleich und öffentliche Funktionsprüfung offen.
A-77 bis A-79, kompakte Kartengröße und übrige Gestaltungsentscheidungen bleiben getrennt.

**Großkatalogvorbereitung weiterhin ohne Lauf:** Grundkandidat `b32aedd3…/large-preparation.json`
(`723cc17c…`) mit 65 kleinen reinen Gegenfällen ist ausdrücklich nicht operativ. Root findet vor dem
echten Einsatz zusätzlich notwendige frische Host-/Leaseprüfung nach langsamen Hashlesungen und einen
vorgelagerten relevanten Schemavertrag; Zweitklärung bestätigt außerdem die nötige Trennung von rohem
Journal-Katalogschlüssel und normalisiertem Pfad. Teilweise alte DDL-Belege ersetzen keinen vollständigen
Schemaabgleich. Bestehende Ein-Foto-/Journal-/Statistikbausteine werden wiederverwendet; Sampler und
private Schutzkopie sind noch anzubinden. Keine Originalmetadaten, Katalogkopie, SQLite- oder SDK-Aktion.
Die drei geplanten großen Kopien bleiben zeitlich begrenztes Testmaterial und erhalten nach Annahme
und bestätigter Rückkehr zu Original .39/Hauptkatalog D: einen eigenen konkreten Löschvorschlag.

**Getrennte Systemlaufzeitprüfung:** Frisch per tatsächlichem `C:\Program Files\nodejs\node.exe`
bestätigt: Node 24.12.0/x64, eingebautes Undici 7.16.0, OpenSSL 3.5.4, Brotli 1.1.0, SQLite 3.50.4.
Offizielle [Sicherheitsmeldung vom 21. Oktober](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
und [Node 24.22.1](https://nodejs.org/en/blog/release/v24.22.1) frisch geprüft. Der Windows-x64-Installer
hat laut offizieller Veröffentlichung SHA-256 `3bda4baf1ee709b33cf920dd633106ddb23951e322bff9c03ec9f64ab8981b01`.
Das ist eine Herkunfts-/Versionsprüfung, keine lokal geprüfte Installerdatei oder ausgeführte Installation.
Beleg `53eb764a…/security-system-node-update-source-review-25oct.json`. Die Node-Meldung betrifft
unter anderem Brotli/DNS/TLS und eingebaute Bibliotheken. GHSA-xjj6-f33q-929c beginnt dagegen erst
bei Undici 7.18.0; dieser konkrete Paketbefund wird nicht fälschlich auf die eingebaute 7.16.0 übertragen.
Paketgraph und Systemlaufzeit bleiben getrennt. Felix um konkrete Freigabe des systemweiten Updates
innerhalb der 24er-Reihe einschließlich mitgeliefertem npm gebeten; andere Node-Programme sind betroffen.
Bestehende Installationsoptionen erhalten; verlangtes Fremdprogrammende oder Neustart erfordert Halt.
Keine fremden Prozesse, Systemeinstellungen oder globale Laufzeit verändert.

**Integrationsgate und Testabgrenzung:** Erster vollständiger Aufruf am neuen integrierten Stand
`f3bb3852…/quality-result.json` (`a0651345…`) endet mit Exit 1: drei erreichte Gruppen/208 Tests,
202 bestanden und sechs Fehler, keine Abbrüche/Skips. Alle 715 gebundenen Quellen stabil.
Ursache in allen sechs Fällen ist die bisherige Hero-Testannahme „Hero-CSS reicht bis Dateiende“;
die separat angehängten A-71/A-72-Regeln wurden fälschlich als Hero ausgelegt. Weder Produkt-CSS
noch sichtbare Darstellung dafür geändert. Nur gemeinsame lexikalische Testblockabgrenzung ergänzt;
fremde Selektoren im Hero bleiben Fehler, nachfolgende eigene Fachblöcke werden getrennt geprüft.
Strenger Medienparser und sämtliche bisherigen Breiten-/Geometrieerwartungen erhalten. Vier neue
enge Grenzenfälle, danach gesamter Hero-Testsatz 95/95 grün; Beleg `3b008719…` (`2e75454c…`).
Root liest die vollständige neue Abgrenzung unabhängig gegen: `53eb764a…/hero-test-boundary-root-review-25oct.json`.
Ein neuer vollständiger Quellenlauf ist erst auf diesem korrigierten, eingefrorenen Stand zulässig.
Ein privater Vorprüfungsfehler am ersten Gatewrapper blieb vor jeglichem npm-Kindprozess;
`669d851c…/quality-wrapper-failure.json` ist getrennt erhalten und wird nicht als Gateaufruf gezählt.

**Neuer vollständiger funktionaler Quellenlauf bestanden:** Nach enger Testkorrektur und unabhängigem
Review genau ein neuer vollständiger Lauf, `b6c490a5…/quality-result.json`, SHA-256
`c5b6c4dac1aba570ee7c53215e4cad0d7e6169c0bdb6a6e4cfd0c425bbe8551c`.
50 Gruppen/2.234 Tests bestanden, null Fehler/Abbrüche/Skips/Todo, tatsächlicher Exit 0/Signal null.
25. Oktober 18:33:45,039–18:41:52,389 UTC, 487,350 Sekunden. Alle 715 gebundenen Repositorydateien
einschließlich 209 geänderter/neuer Dateien vor/nach unverändert; das sind Repositorybindungen,
nicht 715 fachliche Testquellen. Vollständige Originalausgaben und alle 50 Gruppenzähler erhalten;
Abschlusszusammenfassung `23e24422…/integrated-quality-completion-summary.json` (`cc27e6a4…`).
Root bestätigt den Ergebnisdatei-Hash und die tatsächlichen Zähler unabhängig. Eigentümersitzungen
geschlossen/0/keine Helfer. Tatsächliche Werkzeuge Node 24.12.0 und geprüfter FFmpeg 8.1.1 unter
`local-tools/ffmpeg/bin/ffmpeg.exe`. Installiert bleiben vor/nach Electron 42.10.0/Undici 7.29.1;
keine Aktualisierung, native Laufzeitabnahme, Linux-CI, CMS-/Pages-Übernahme oder Gesamtfreigabe daraus.
Anschließend ausschließlich diese Ergebnisdokumentation fortgeschrieben; kein weiterer Produktcodefix.

**Großkatalog-Grundvorbereitung eng korrigiert:** Neue eigene Revision `766d392b…/large-preparation.json`
(`e48afa00…`), alter b32a-Stand unverändert. Frische vollständige Host-/Lease-/Ownerprüfung nach
langen Hashlesungen unmittelbar vor jedem Katalog-/Begleitdatei-Inhaltsopen und SQLite-Konstruktor;
unveränderter roher Journal-Katalogschlüssel für Hash/Plan, Normalisierung nur für physischen W-Pfad;
begrenzte vorbereitete B-only-Schemaaufnahme der 14 verwendeten Tabellen. Fotodatenabfragen bleiben
bis zur ausdrücklich gebundenen Root-Annahme einer tatsächlichen B-Schemaaufnahme gesperrt.
81/81 kleine reine Gegenfälle und acht Syntaxprüfungen; `f48c54fd…` (`f27b81db…`). Unabhängiger
Quellreview `d40520b2…/independent-large-foundation-three-guard-source-review.json` (`24cd79b7…`)
bestätigt alle drei Aufrufwege sowie unveränderte Vorgänger- und neue Dateibindungen. Keine Wiederholung
der 81 Tests. Alle Sitzungen geschlossen/0/keine Helfer. `operationalReady`/`executeAuthorized` bleiben
false, Prozessinterface absichtlich gesperrt, Fallvorlage ungültig. Echte Schemaaufnahme, Hostadapter,
gekoppelte SDK-/Journal-/Statistikerwartung und Großkopierfreigabe bleiben offen. Kein Katalogzugriff,
keine Kopie, SQLite-Engine, Host-, SDK-/Browser- oder Produktaktion durch diese Vorbereitung.

**Node-Installer zur Entscheidung konkret bereitgelegt:** Ausschließlich offizielles Windows-x64-MSI
einmal nach `temp/explorer/60eaf866-fdc0-4bbb-9372-cf0e7ad8cf62/node-v24.22.1-x64.msi` geladen,
33.333.248 Bytes. Vollständige SHA-256 stimmt mit der oben genannten offiziellen Prüfsumme überein.
Windows-Authenticode lesend mit Status `Valid`, Signer OpenJS Foundation; Installer vor/nach Signaturlesung
mit identischen Bytes und Dateistempeln. Beleg `619007d2…/node-installer-verified-staging.json`
(`2cbcc826…`), tatsächlicher Schließbeleg (`df61afc9…`). Beide Stagingsitzungen geschlossen/0/keine Helfer.
Die erste eingeschränkte Windows-PowerShell konnte ihr Signaturmodul nicht laden; diese fehlgeschlagene
Lesung bleibt erhalten. Erfolgreiche Wiederholung nur am selben MSI mit vorhandenem PowerShell 7,
kein erneuter Download. Der gebundene tatsächliche Downloadquelltext begrenzt HTTPS, exakte URL,
HTTP 200 ohne Redirect, 150 MiB und 120 s; eine zusätzliche rohe Headerquittung wurde vor dem ersten
Signaturfehler nicht gesichert. Kein Installer oder enthaltenes Programm ausgeführt, keine globale
Installation/PATH-/npm-/Registryänderung. Die angefragte Freigabe betrifft weiterhin erst die Ausführung.

**Ordentlicher Abschluss dieser Prüfrunde:** Root bestätigt zusätzlich die Summen aller 50 Gruppen und
die Hashes beider Originalausgaben; `53eb764a…/integrated-functional-gate-root-final-verification-25oct.json`
(`ea3bc5b8…`). Danach eigene Belegaufnahme regulär beendet, tatsächlicher Exit 0. Abschluss
`53eb764a…/evidence-result.json` SHA-256 `957be1267a100788518d5057584a9840c03dc0f7d76271c66e60fd08e4f0e1e2`:
1.482 registrierte Originaldateien, alle vorhanden, null fehlend, vollständig; Eigentum geschlossen,
null Operationen/Helfer, keine Schließfehler. Gebundene Belege und bereitgelegter Installer erhalten.
Keine Veröffentlichung, globale Installation oder produktive Katalogkorrektur in diesem Abschluss.
Nächste unmittelbare Betriebsgrenze bleibt das normale Explorerende und die angefragte Node-Freigabe;
das Gesamtaudit ist weiterhin offen. Nach den Ergebnisergänzungen Dokumentverweise erneut geprüft.

**Unabhängige Abschlussvorbereitungen fortgesetzt:** Auf Felix' „Dann los“ die verbleibende
Website-Bedienmatrix, die Kopplung des Lightroom-Großtests sowie Veröffentlichungs- und
Bereinigungsvorbereitung getrennt bearbeitet. Kein Gesamtabschluss oder neue Veröffentlichungs- bzw.
Großkopierfreigabe daraus. Sieben aktuelle Einstiegs-/Fachtexte von überholten Paar-, Restore- und
Prüfstatusaussagen bereinigt; datierte historische Belege unverändert. Insbesondere ist Schema 2 seit
dem 24. Oktober aktiv; A-51 und die bestandenen B/C/F-, Mehrblock-, SDK-/Journal- und Konfliktfälle
bleiben abgeschlossen. Genaue Erstursache, andere Schrift-/DPI-Konfigurationen und repräsentative
Großprobe bleiben eigene Grenzen. Abschließender unabhängiger Sieben-Dokumente-Review
`c35c9851…/seven-current-documents-final-review.json` (`0d63e52a…`), alle Dokumenthashes stabil.

**Öffentlicher Artefaktkandidat tatsächlich gebaut:** Eigene kleine Sitzung `30ed3b49…` mit
413 exklusiven Quellkopien ausschließlich der öffentlichen Positivliste. Unveränderten regulären
Artefaktbauer und Prüfer im eigenen Arbeitsordner ausgeführt: beide Exit 0, 415 Artefaktdateien,
119.531.409 Bytes, keine fehlenden oder unerwarteten Dateien. Alle Quell-, Kopie- und Artefaktbytes
gebunden; Quellen vorher/nachher gleich, eigener Dateibesitz statt Hardlinks. Insgesamt
239.062.332 Bytes eigener Prüfbestand; kein Daten-/Katalog-/NAS-Bestand kopiert und kein produktives
`_site` angelegt oder verändert. Ergebnis `isolated-pages-build-result.json` (`17b5e0f5…`), Root-Gegenprüfung
`a49724cd…/isolated-pages-candidate-root-independent-review.json` (`9540ea1e…`). Geschlossen/0/keine Helfer.
Die eigentliche Git-Abstammungsintegration, Veröffentlichung und öffentliche Abnahme bleiben offen.

**Bereinigungsvorschlag eingegrenzt:** `d17f3821…/publication-and-cleanup-preparation.json`
(`546d2472…`) ordnet den vorhandenen Änderungsstand als gemeinsam zu prüfende Integration ein.
Nur zehn bekannte Sitzungen und der bekannte Restorewurzel-/Laufzeitnachweis klein gelesen;
geschlossene Sitzungen mit gebundenen oder noch benötigten Belegen bleiben geschützt. Die historische
Restoregröße wurde nicht als neue Bestandsmessung ausgegeben. In diesem begrenzten Bereich derzeit
null zusätzlich als entbehrlich belegte Löschbytes. Keine neue Vollinventur, kein Löschlauf und keine
Speichereinsparung. Die Abschlussbereinigung bleibt nach tatsächlicher Annahme und mit konkreten
Zielen durchzuführen; Alter, fehlender Textverweis und `.gitignore` sind weiterhin kein Löschgrund.

**Lightroom-Großtest technisch gekoppelt, weiterhin deaktiviert:** Neue private Revision
`08a64f3c…/large-preparation.json` (`362b4374…`) verbindet den vorhandenen Prozess-/RAM-Messweg,
den echten Workflow über Vorschau/Vorbereitung/Journal/Übernahme und Rücknahme sowie die echten
reinen Foto-/Statistikerwartungsfunktionen. Vollzählungsfrische beginnt vor der Sammlung; lange
Zählung, fehlende Root-Laufzeitannahme oder Node vor 24.22.1 sperren. Keine direkte Writer-Abkürzung.
97/97 kleine Gegenfälle auf Node 24.12.0; SDK-/Helper-/Katalogblätter und Prozessaufnahmen dabei
synthetisch. Unabhängiger Quellreview `c6f8d784…` (`cbfaf43f…`) bestätigt alle 58 gebundenen Eingänge,
keine Wiederholung des Tests. `operationalReady` und `executeAuthorized` bleiben false. Echte
XMP-/Eigentümer-/Schema-/Kopie-/SDK-/Ein-Foto-Planbelege und Großkopierfreigabe fehlen weiterhin.
Separater Testportabilitätsstand `b6ed738e…` (`46253991…`) ersetzt nur umgebungsabhängige Gegenfälle
durch ausdrückliche Versionsfixtures; alle Fach-/Adapterbytes bleiben gleich. Noch kein neuer Testlauf
unter einer aktualisierten Systemlaufzeit und keinerlei realer Katalog-/SQLite-/SDK-Zugriff daraus.

**Systemupdate jetzt konkret freigegeben:** Felix bestätigt reguläres Explorerende und ausdrücklich
Node 24.22.1 einschließlich npm. Frische native Fensterliste ohne Explorer; offizielles MSI erneut mit
exakter veröffentlichter SHA-256 und gültiger OpenJS-Signatur geprüft. Normalen Assistenten mit
bisherigem Ziel und unveränderter Komponentenauswahl bedient; zusätzliche Chocolatey-/Buildwerkzeuge
bleiben ausgeschaltet. Erster Versuch nach sichtbarer Administratorabfrage unterbrochen, laut
Assistent ohne Systemänderung; genaue Abbruchursache nicht belegt. Originalanzeige und Optionen unter
`a49724cd…/node-installer-*.json` und Original-JPEGs erhalten. Begrenzte erfolgreiche Windows-Ereignislesung
liefert keinen passenden Node-Eintrag. Assistent regulär beendet; kein Sicherheitsdialog automatisiert.
Felix meldet für denselben Installer erneut „bereit“. Vor dem zweiten Versuch eigene Vorschau und
Belegaufnahme regulär geschlossen: tatsächliche Exits 0, `9333380d…` Listener beendet und
`a49724cd…/evidence-result.json` (`086bfc8c…`) sieben vollständige Originale, null fehlend.
Zweiter Installationsversuch gestartet; Ergebnis und Betriebsprüfung folgen im nachstehenden Abschluss.

**Freigegebenes Sicherheitsupdate tatsächlich abgeschlossen:** Zweiter MSI-Versuch zeigt erfolgreich
installiertes Node.js und wird regulär beendet. Kein verlangter Neustart und kein Fremdprogrammende
beobachtet; Windows-Administratorabfragen nicht automatisiert. Frisch über die absolute Installation
bestätigt: Node 24.22.1/x64, npm 11.19.1, eingebautes Undici 7.30.1, OpenSSL 3.5.9, Brotli 1.2.0 und
SQLite 3.53.4. Native Erfolgsanzeige und CLI-Nachweis unter `b3075037…`,
`security-runtime-cli-acceptance.json` (`547e322c…`).

Die normale Paketinstallation meldet zunächst unverändert, obwohl tatsächliche Paketdateien alt sind:
der abgeleitete versteckte npm-Lockcache enthält bereits neue Versionswerte. Ursache seiner Entstehung
nicht belegt. Genau diese Datei reversibel in eine neue eigene Belegsitzung verschoben, kein Löschen.
Danach verändert derselbe Installationsweg genau Electron und Undici; alle übrigen gebundenen Pakete
und Produktquellen stabil. Regulärer Electron-Installer lädt das offizielle Windows-x64-Archiv mit
passender veröffentlichter Prüfsumme; entpackte EXE stimmt mit dem Archiveintrag überein. Tatsächliche
Paket-/Binaryversion 42.11.18, Installations-Undici 7.30.1. Belege `7d2445bc…` (`59cf0100…`) und
`c88e7fd6…/electron-binary-install-result.json` (`b96c36ac…`). Anschließend frisches tatsächliches
npm-Audit, Exit 0 und alle sechs Befundsummen null; `ca7fc566…/installed-security-audit-result.json`
(`a2e1c1a0…`). Paketgraphprüfung und allgemeine Sicherheitsabnahme bleiben getrennt.

**Native Betriebsgegenprobe bestanden:** Arten-Explorer über die tatsächliche normale Desktopverknüpfung
unter dem aktualisierten Electron geöffnet; Hauptansicht und Papageientaucher mit passender Taxonomie,
Medien und öffentlichem FN-Link geladen. Nachladen und normales Schließen bestanden. Frische native
Fensterliste und vollständige Hostprüfung bestätigen danach keine Explorerinstanz. Belege unter
`b3075037…`, insbesondere `explorer-updated-runtime-normal-close-confirmed.json` (`e8f5f71d…`).
Das beweist nicht die Erstursache des früheren Fensterhangs. Lightroom auf dem Hauptkatalog D: nur
lesend geprüft: „Papageientaucher · Atlantic Puffin · Fratercula arctica“ erscheint, die drei lokalen
Datenstände stimmen überein. Ohne Zuweisung/Entfernen/Namensspeicherung geschlossen;
`lightroom-node24221-papageientaucher-readonly.json` (`78057f89…`).

**Großtest-Gegenproben unter neuer Laufzeit bestanden:** Ausschließlich die bereits vorbereiteten
97 synthetischen Fälle und zwölf Syntaxprüfungen auf Node 24.22.1 ausgeführt: alle bestanden,
Exit 0, keine Abbrüche/Skips. `cff7c322…/large-coupling-fixtures-result.json` (`da9e3767…`), Abschluss
`6a5babb1…` (`5da8430e…`); unabhängiger Review `3eb8e43d…` (`2e2cf0a9…`) bestätigt 71 stabile
Bindungen. Die oben genannten echten Katalog-/XMP-/Schema-/SDK-/Kopiergrenzen bleiben unverändert;
kein produktiver Kataloglauf und keine Großkopie daraus.

**Integrierte Website-Bedienung und eng belegte Restkorrektur:** Auf den tatsächlichen Squarespace-
Seitentemplates mit allen elf lokalen Modulen Galerie/Zoom bei Amsel mobil und Kormoran Desktop
bedient: tatsächliche Bildwechsel 1→2→1, geladene große Bilder, Tab/Shift-Tab, erster Escape zurück
zur Galerie, zweiter Escape zum Ausgangsbild; öffentliche Linkziele erhalten. Eigene Herkunftsbindung
für den lokalen Galerietest ersetzt nur die deklarierte Basis und löst echte relative URLattribute auf;
opake Anbieter-Datenattribute bleiben erhalten. Frühere lokale Herkunftsfehler und Null-Pixel-
Zwischenbilder sind ausdrücklich keine öffentlichen Fehler bzw. bestandenen Großbildproben.
Belege unter `b3075037…`: `own-base-amsel-zoom-full-keyboard-return.json` (`18d47066…`),
`own-base-kormoran-first-zoom-confirmed-loaded.json` (`235198c9…`) und zugehörige Originale.
Reise-/Wildlifeübersicht zusätzlich tatsächlich per Tab bedient: passende Ziele und gewünschte
Reihenfolge einschließlich Heimische Tierwelt zuerst, alphabetisch, In Arbeit zuletzt. Reduced Motion
ist im Browser nicht umstellbar; keine physische Touch- oder andere Betriebssystem-DPI-Abnahme daraus.

Die vorher bildlich angenommene Kartenfassung zeigt in der integrierten Tastaturrunde eine neue
Fokusrahmenüberdeckung. Erste private Korrektur scheitert beim frischen Kormoran an noch laufendem
weichem Scrollen und bleibt NO-GO. Der eng korrigierte Kandidat `88acc9aa…` unterbricht diese Bewegung
mit einem sofortigen Null-Scrollauftrag, prüft Fokus/Verbindung und korrigiert erst dann einmal die
tatsächlich gemessene feste Kopfzeile. Unabhängiger Quellenreview `8990ffe4…` (`d308f9e3…`),
15 private und 27 vorgesehene Repositoryfälle grün. Native Schlussannahme bei Amsel/Kormoran in
390/767, jeweils Schließknopf und Escape: stabiler oberer Fokusanker frei, derselbe Öffner fokussiert.
`b3075037…/map110-smooth-cancel-native-acceptance.json` (`f9d6ab20…`) bindet sechs Gegenlesungen;
ein unmittelbarer Amsel-Escape-Zwischenwert vor dem vorgesehenen Frame wird nicht als Abnahme benutzt.
Alle elf Module in vier frischen Kontexten mit je exakten abgeschlossenen GETs gebunden; eigene
Vorschau `9a362360…` regulär beendet, Exit 0/Listenerende/keine Quelldrift. Exakte Modul- und
Testbytes lokal übernommen, Footer-Cache 1.0.10. Keine Kartengrößenänderung oder Veröffentlichung.

**Normaler Betriebsabschluss vorbereitet:** Lightroom nach der lesenden Suche normal beendet und die
übliche Endebestätigung angenommen. Frische native Fensterliste danach ohne Lightroom;
`b3075037…/lightroom-normal-close-after-readonly-search.json` (`5c7939e0…`). Felix beauftragt das
reguläre Herunterfahren nach allen ohne seine Hilfe abschließbaren Arbeiten. Kein Zwangsende,
keine neue produktive Zuweisung, Großkopie, Bereinigung, Sicherungsänderung oder Veröffentlichung.

**A-83 – Menükorrektur anhand des tatsächlichen Anbietercodes angenommen:** Die integrierte
Desktopprobe bestätigt zunächst sichtbares Hovermenü mit falschem ARIA-Zustand. Frühe private
Entwürfe beheben Escape, sperren aber die echte Wiederöffnung und bleiben NO-GO. Ein bedingter
interner Klick-Toggle war nur eine inzwischen widerlegte Hypothese. Exakt den tatsächlich geladenen
offiziellen Bundlequelltext einmal begrenzt gelesen, nicht ausgeführt: Klick macht nur `preventDefault`,
Enter/Space toggeln ARIA, Escape schließt im Tastaturhandler. Quellenbeleg `bdf503bf…` (`10ad717f…`).
Finale Version 1.0.0 (`b2576c0f…`) löst beim echten Klick ausschließlich die eigene Sperrmarke;
Escape/Enter/Space ergänzen erst nach dem nativen Handler den passenden Zustand. Bestehende
Gestaltung, Ziele, Anbieterhandler und mobile Folder bleiben erhalten. Elf kleine private Gegenproben
mit rotem Vorgänger und sieben Routenprüfungen bestanden. Unabhängiger Quellenreview
`b3a9fe94…` (`3a861952…`) bindet 29 Eingänge und den eigenständigen Zehn-Fälle-Produkttest.

Root bestätigt tatsächlich Hover → Escape bei weiter bestehendem Hover → genau ein Linksklick
mit erneut sichtbarem Panel und wahrem ARIA. Pointerleave schließt ohne Selbst-Offenhalten.
Enter/Space, Tab/Shift-Tab, Escape und beide Desktopmenüs funktionieren; Linkziele bleiben öffentlich.
Mobil bei 390 und Tablet bei 767 Hauptmenü geöffnet/geschlossen; mobiler Wildlifeordner steht an
richtiger Position. Repräsentative Funktionsgegenprobe, keine neue 141-Seiten-Sichtung und keine
physische Touch-/Screenreaderabnahme. `b3075037…/header-navigation-100-native-acceptance.json`
(`4718db2a…`) bindet sieben stabile Desktopzustände; Mobil-/Tabletbelege und Original daneben.
Vorschau `8139196d…` regulär geschlossen, tatsächlicher Root-Prozess-Exit 0, keine Sourceänderung
während der Vorschau. Exakte native Modulbytes und CSS-Deklarationen lokal übernommen; Footer
mit zwölf Modulen und CSS-Cachebindung über Taxonomie 1.0.11. Der letzte tatsächliche CMS-Stand
bleibt separat bei zehn Modulen ohne Hero, Map 1.0.8 und Sort 1.0.3; keine CMS-Änderung in dieser Runde.
Vor öffentlicher Übernahme müssen Custom CSS, Footer und Pages gemeinsam passen. Neuer vollständiger
Quellenlauf und neuer isolierter Artefaktbau folgen auf dem nun eingefrorenen Stand.

**Erster neuer Lauf unter den aktualisierten Laufzeiten:** `33258140…/quality-result.json`
(`8b7bc8e3…`) endet nach drei Gruppen mit 224/225 bestanden und einem Fehler, Exit 1,
keine Abbrüche/Skips; alle 717 gebundenen Quellen stabil. Der neue Headertest sucht durch zwei
falsch relative Import-URLs unter `scripts/` statt im Repositoryroot. Ausschließlich diese beiden
Testpfade korrigiert; Produkt-JavaScript und CSS bleiben unverändert. Danach tatsächlicher eigener
Headertest auf Node 24.22.1: 10/10 bestanden. Vollständiger neuer Lauf folgt erst nach dieser Korrektur;
der erste fehlgeschlagene Lauf bleibt unverändert erhalten und ist kein Gesamt-Go.

**Windows-Testbereinigung eingegrenzt und eng abgesichert:** Der folgende Lauf
`2ba667cc…/quality-result.json` (`90d310a5…`) erreicht 49 Gruppen mit 2.212/2.213 bestanden,
Exit 1 und genau einem `ENOTEMPTY` im Aufräum-Hook des eigenen Lightroom-Temphelfer-Fixtures;
null Abbrüche/Skips, alle 717 Quellen stabil. Letzte Explorergruppe und nachfolgende Endprüfungen
werden dadurch nicht mehr erreicht. Produktbereinigung würde ihren rmdir-Fehler sammeln statt
hier ungefangen werfen. Alle Produktwrites sind im gelesenen Pfad abgewartet; das exakt betroffene
Fixtureverzeichnis wird später leer vorgefunden, ohne es weiter zu bereinigen. Eine sperrende Instanz
oder genaue zeitliche Ursache ist nicht bewiesen. Unveränderter Originalzieltest einmal 1/1 bestanden,
`074f87d9…` (`29003173…`); kein Widerruf des ursprünglichen Fehlers und keine Wiederholungsschleife.

Ausschließlich drei eigene Test-Aufräum-Hooks und ihr Import angepasst: frische Pfad-/Linkprüfung
mit `assertTestTempPath`, Standard-fs.rm mit höchstens zwei Wiederholungen und 100-ms-Basis.
Zusätzliche Wartezeiten 100/200 ms je betroffenen Löschschritt, keine 300-ms-Gesamtzeitgarantie für
rekursive Bäume. Dauerhafte und andere Fehler bleiben Fehler. Exakter Kandidat `443c3246…`,
Vorlage `a1089ff5…` (`6d14744a…`), vier reine Standard-Retrygegenfälle einschließlich dauerhaftem
Fehler erhalten. Produktionsbereinigung, Eigentums-/Capabilityschutz und alle Fachassertionen
unverändert. Root liest alle vier Änderungen vor Übernahme; danach tatsächliche fünf Helpertests
und vollständige 60-Fälle-Tempgruppe bestanden, null Fehler/Abbrüche/Skips. Neuer Quellenfreeze
für genau einen vollständigen Folgelauf. Öffentliche Artefaktquellen bleiben gegenüber dem bereits
geprüften 416-Dateien-Kandidaten unverändert.

**Abschluss der unabhängigen Prüfrunde am 26. Oktober:** Genau ein vollständiger Folgelauf nach der
eng begrenzten Testkorrektur bestanden, `cd69eb83…/quality-result.json`, SHA-256
`2dfa5754fa781e0f13275ee0e7ecd2e21f0812dd4d79978ad3bb5a636f4bdae7`.
25. Oktober 23:34:06,228–23:42:09,374 UTC: 50 Gruppen/2.256 Tests, alle bestanden,
null Fehler/Abbrüche/Skips/Todo, tatsächlicher Kind-Exit 0/Signal null. Alle 717 gebundenen
Repositorydateien einschließlich 213 geänderter/neuer Dateien vorher/nachher unverändert.
Node 24.22.1, Electron samt Binary 42.11.18 und Undici 7.30.1 tatsächlich installiert.
Root bestätigt sämtliche 50 Gruppensummen sowie beide Originalprotokoll- und Vorher/Nachherhashes;
`b3075037…/updated-runtime-full-quality-root-acceptance.json` (`49158b27…`). Die zwei fehlgeschlagenen
Vorgängergesamtläufe bleiben erhalten. Nach diesem Quellenfreeze nur Ergebnisdokumentation geändert.
Kein Linux-CI-, CMS-/Pages-, Großkatalog-, physischer Geräte- oder allgemeines Sicherheits-Go daraus.

Aktuellen öffentlichen Kandidaten genau einmal isoliert gebaut und geprüft: `2321353e…`,
`isolated-pages-build-result.json` (`e0373d04…`), 414 öffentliche Quellen/119.538.017 Bytes,
416 Ausgabedateien/119.538.503 Bytes, beide regulären Originalprogramme tatsächlich Exit 0.
Alle Quell-/exklusiven Kopie-/Artefakthashes stimmen; Quellen und Footer stabil, keine Hardlinks,
keine Daten-/NAS-/Katalogkopie und kein produktives `_site`. Root liest alle 414 Hashtripel und
Ergebnisbindungen unabhängig gegen: `current-pages-artifact-root-independent-readback.json`
(`03c08187…`). Die spätere reine Testhookkorrektur ändert diese öffentlichen Quellen nicht.
Headerintegration einschließlich zwei eng korrigierter Test-Importpfade unabhängig angenommen:
`97b2dfbd…` (`a514b08b…`); Testhook-Sourcepeer `4e924f93…` (`55f3ad1b…`). Alle Eigentümersitzungen
regulär geschlossen/0/keine Helfer. Der Kandidat ist vorbereitet, nicht veröffentlicht.

Eigene letzte Belegaufnahme regulär beendet, tatsächlicher Prozess-Exit 0. `b3075037…/evidence-result.json`
SHA-256 `e381dbce37f1f2aa07ce32377bf67d0c39336360efd99ab7be0e732f15275e07`:
117 registrierte Originale, 117 vorhanden, null fehlend, vollständig; Operationen 0, keine Schließfehler.
Eigener Prüftab geschlossen, Desktopansicht eingestellt, Lightroom und Explorer normal beendet.
Abschließende Dokumentverweisprüfung bestanden: 80 Markdown-Dateien ohne fehlende lokale Links; auch Git-Diffprüfung bestanden. Danach das von Felix ausdrücklich
beauftragte normale Herunterfahren ohne erzwungenes Programmende auslösen.

Das Gesamtaudit bleibt offen: repräsentative Lightroom-Großprobe mit ihren noch fehlenden konkreten
Betriebs-/Kopierfreigaben, Entscheidungen A-77 bis A-79, koordinierte Website-/GitHub-Veröffentlichung
mit öffentlicher Nachprüfung sowie abschließende gezielte Bereinigung und Gesamt-Go/No-Go.
Gebundene Prüforiginale, das Veröffentlichungspaket und der verifizierte Restore bleiben bis zur
entsprechenden Abnahme nötig und werden nicht pauschal aus Alter oder Ignorierregeln entfernt.
Alternativtextworkflow, Artseitengenerierung und Android-App bleiben vereinbarte Aufgaben nach dem Audit.

**Fortsetzung am 26. Oktober: Titelvergleich, mobiler Eichelhäher und Websitehinweis W.**
Felix ließ die bisherigen Titel sowie die Kopfzeilenüberlagerung zunächst ausdrücklich erhalten.
Anschließend beauftragte er den konkreten Titelvergleich auf Desktop und Tablet sowie die Prüfung,
ob sich die neun verdeckten Motive bei gleicher Kopfzeile verschieben lassen. Diese neueren
Prüfaufträge ersetzen die bisher offenen Gestaltungsvorschläge; sie sind keine Veröffentlichungsfreigabe.

Für A-77 liegen jetzt 28 neue Originalaufnahmen vor: sieben Arten jeweils vorher/Entwurf bei tatsächlich
1280 × 900 und 768 × 1024 CSS-Pixeln. Alle 14 Paare haben identische Fotoquelle, Bild-/Titelgeometrie,
Schriftfarbe und Bildfokus; nur der Textschatten unterscheidet sich. Schwarze Titel Blässhuhn/Totenkopfaffe
erhalten privat eine helle Kontur, die fünf weißen Titel einen dunklen Schatten. Root hat die Originale
tatsächlich angesehen. Entscheidungsvorschau `fc2e9281…/artentitel-vergleich.html` enthält die unveränderten
JPEGs und zeigt nur deren Titelbereich; Art, Ansicht und Variante sind umschaltbar. Leitbeleg
`seven-title-native-pairs.json`, SHA `03de335fd42b179a9362a169bf5f556a7efbbdda7939c2895f30df813856095a`.
Das ist ein Vergleich des aktuellen lokalen Layouts mit ursprünglichen Titeln, keine neue öffentliche
CMS-/Gesamtseitenabnahme. Die A-77-Entwürfe bleiben ausschließlich privat, bisherige Titel bleiben aktiv.

Für A-78 sind die neun Arten Buchfink, Turmfalke, Buckelwal, Papageientaucher, Fischertukan, Jagdfasan,
Kormoran, Grüner Leguan und Scharlachara einzeln belegt. Bei 768 × 1024 besitzen alle neun Fotos null
vertikalen Überschuss im Fotobereich. Eine bloße Änderung des Y-Fokus kann deshalb nichts verschieben.
Ein Pixelversatz wäre eine eigene neue Bildkomposition und ist noch nicht optisch geprüft. Quelle:
`841b910c…/tablet-nine-private-crop-review.json`, SHA `96e98dbd46a5997aa9eadebb197a7ccf1b87114b9d9e2d0f6f82847138d56f06`.
Die ausdrücklich erhaltene Kopfzeilenüberlagerung wurde nicht geändert.

Der freigegebene A-79-Kandidat zeigt den Eichelhäher bei 320/390/430/767 deutlich im mobilen Bild;
schwarzer Titel und Rückknopf darunter bleiben erhalten. Bei 768 und 1280 sind Bildfokus und Geometrie
gegen die Ausgangsvariante identisch. Nur eine auf genaue Seite, Heroabschnitt und gültigen Layoutmarker
begrenzte mobile `object-position`-Regel ist in die Root-CSS übernommen. Hero-JavaScript bleibt 1.0.4,
Taxonomie-/CSS-Cache im Footer steigt auf 1.0.12. Die Quellen der zuvor abgenommenen Veröffentlichungskopie
sind damit überholt; vor einer späteren Veröffentlichung den tatsächlichen Kandidaten neu binden und bauen.
Alle nativen Originale und Messwerte: `fc2e9281…/native-hero-captures-complete.json`,
SHA `11f8d4d188e9aaa5775998dbefab92ef1b6aec84866da271fa97dbbe8ad28e45`.

A-84 verwendet den tatsächlichen Listenrenderer und gemeinsamen Website-Prüfweg, keinen zusätzlichen
Scan oder Medienreload. Die Browserprobe mit künstlichen Antworten bestätigt die Übergänge und den
erhaltenen Listenfokus nach einem späteren Fund. Beleg `fc2e9281…/explorer-w-native-states.json`,
SHA `5febc1ac78efa726a2fe14fa4263682b0993c7a148cd4e3fcb42d69c4b2a47c0`;
Quellen-, Rot-/Grün- und Fixturebindungen `f19c4410…/website-marker-completion-and-browser-plan.json`,
SHA `a3f91e547cd47da36e347248c688c9f7b119404a5eeccca850c3bd1e82cfcbd3`.
Anleitung ergänzt. Ein neuer Start des produktiven Explorers ist daraus nicht behauptet.

Begrenzter gemeinsamer Nachlauf: 95 Hero-, 21 Website-/Listen- und 10 Taxonomiefälle, zusammen 126/126,
alle drei Prozesse tatsächlich Exit 0 unter Node 24.22.1; 17 Quellen vorher/nachher identisch. Kein erneutes
Gesamtgate aus diesen Einzelaufträgen behauptet. Beleg `13c9f56c…/focused-hero-website-taxonomy-result.json`,
SHA `960b52c33f57c0f43b17f81a6e1358a825e27528c494c3f3926822b3862d018b`.
Die Aufnahmevorschau `1acda67f…` ist regulär geschlossen, Listener beendet, tatsächlicher Exit 0,
keine Quelldrift. Der getrennte rein statische Bildvergleich `f3d7a559…` bleibt bewusst für Felix' Auswahl
geöffnet, höchstens drei Stunden; sein eigener Owner wird regulär über den gebundenen Schließweg beendet.
Keine Änderung an Squarespace, GitHub, Lightroom, Katalogen, Artdaten, Sicherungen oder Bereinigungsbeständen.

Root-Gegenlesen bestätigt alle 17 Quellen des 126er-Laufs erneut unverändert. Dokumentverweise nach der
Integration erneut bestanden: 80 Markdown-Dateien, null fehlende lokale Ziele; Git-Diffprüfung bestanden.
Rootannahme `fc2e9281…/root-package-acceptance.json`, SHA
`e501d4d0e810b213de5385bb32163796ad17acb006c16f27a34d4dad944032db`.
Eigene Aufnahme beendet, tatsächlicher Exit 0, 86 registrierte und vorhandene Originale, null fehlend,
Operationen 0. Vollständiger Beleg `fc2e9281…/evidence-result.json`, SHA
`c8ed7974d7fbfe7aa13c164286a4a7c8ce0aea63d59c93ebacc57b6c70e30cb5`.
Die unabhängige statische Entscheidungsvorschau bleibt davon getrennt absichtlich geöffnet.

**Aktuelle Folgeentscheidungen am 26. Oktober.** Felix akzeptiert den vollständigen A-77-Vergleich.
Die exakt gezeigten sieben Kontur-/Schattenregeln sind lokal integriert, CSS-Cache im Footer 1.0.13.
Hero 95/95, Taxonomie 10/10 und Stilprüfung bestehen bei sechs stabilen Quellen; eigener tatsächlicher
Prozess-Exit 0, Sitzung geschlossen. Beleg `bd16444b…/a77-approved-integration-result.json`, SHA
`a90e3e556a8dcaa57f13781ed4a06656aa8ca73feb847f3176e7bd6a495775a8`.
Unabhängiger exakter Regel-/Außerhalbvergleich und Prüfung der unveränderten Logs unter
`5ff858fc…/large-source-recipe-and-a77-readonly-review.json`, SHA
`54c0a145fa1a84e70e313ae77a631819c9575c6c337e1a6404f9f9387d3f0d75`.
Keine neue öffentliche Übernahme daraus behauptet.

Felix bestätigt W nach regulärem Explorer-Neustart. Die beauftragte Start-/Speichermessung wird
vollständig getrennt und ohne sichtbare Fenster vorbereitet; die vorhandenen normalen Startwege
würden Fenster anzeigen und werden dafür nicht verwendet. Ein versteckter Frontendlauf misst keinen
produktiven Taxonomiedatenbank-Kaltstart. Erst nach Prüfung der tatsächlichen Isolation ausführen.
Während Felix Lightroom-Bilder importiert, bleiben Lightroom, Kataloge und deren Begleitdateien
unberührt. Die Großprobenvorbereitung kann auf Quellenebene weitergehen; der tatsächliche spätere
Großkopier-/Betriebsrahmen mit geschlossenem Lightroom bleibt vor seinem Start konkret freizugeben.

Website-Priorität jetzt: zuerst die neun Tablet-Tierpositionen bei erhaltener Kopfzeile prüfen.
Anschließend die abgestimmten Websiteänderungen auf Felix' ausdrücklichen Auftrag als gemeinsames
Website-/Pages-Paket veröffentlichen und öffentlich nachprüfen. Diese Freigabe gilt für die fertigen
abgestimmten Websiteänderungen, nicht für andere Auditquellen oder ungewählte Entwürfe. Offene
Typografie-/Home-/Spenden-/Griechenlandfragen werden konkret vorgelegt; bestehende Layout- und
Galerieabnahmen bleiben erhalten. Neue Betriebssicherung oder produktiver Taxonomieaufbau ist dafür
nicht beauftragt. Repräsentative Lightroom-Großprobe, letzte Mess-/Auslieferungsnachweise, gezielte
Datei-/Dokumentationsbereinigung und Gesamt-Go/No-Go bleiben die Abschlussreste.

Zusatzauftrag App-Icon: zehn neue Entwürfe auf Basis des tatsächlichen FN-Logos mit Pfote/Weltkugel
statt Vogelprägung erstellt, unveränderte PNG-Kopien und vollständige Prompts unter `7a3a8e57…`.
Felix bevorzugt den Buch-/Artenkatalogentwurf 07 und verlangt blaue Umlaufbahn mit Flugzeug sowie
drei nahe Alternativen. Gewünschte Fassung A plus Alternativen B/C/D liegen unter `87544e86…`;
`book-icon-proposals-result.json`, SHA
`fd7b999ef1f38b1ddb9b0eadb0bdcd5dea39838ca7a469e303f4a1a27fe454cc`.
Alle vier Originale tatsächlich angesehen und bytegleich zurückgelesen; eigene Sitzungen geschlossen/0.
Vorschläge sind noch keine ausgewählte oder eingebaute App-Icon-Fassung.

**Fortsetzungsstand 26. Oktober nach den neuesten Nutzerentscheidungen.** Die vorstehende
Icon-Auswahl ist überholt: Felix hat die abschließend korrigierte Buch-/Weltkugel-Fassung mit
blauer Flugbahn und geradem Flugzeug angenommen und den Einbau im Explorer beauftragt.
PNG und siebenformatiges ICO sind lokal eingebaut; Desktopfenster und Verknüpfungsinstaller
verwenden die neuen Assets. 13 Desktop-Vertragsfälle und Syntaxprüfungen bestanden.
Beleg `ae92ed72…/approved-app-icon-integration.json`, SHA
`45f8b55f877509052c2d04ce22bc7a41d29aa4aff576a0428de402a4ad4a5170`.
Bestehende Desktopverknüpfung und tatsächliches Fenstericon sind noch nativ nachzuprüfen.
Das Website-FN-Logo ist davon nicht betroffen.

Die erste versteckte Start-/Speicherprobe blieb im eigenen Messhelfer hängen und ergab
**keine verwertbaren Messwerte**. Nur der zuvor identitätsgeprüfte eigene Testprozess wurde
nach ausbleibendem regulärem Stopp beendet; ursprünglicher Lauf tatsächlich Exit 1, eigene
Operation freigegeben. Fehlerbeleg `f042b7f4…/final.json`, SHA
`58af79fa591f6b9f04ed48f73d1c25ee30c3be2fe4ed3acd0e0dcd66075c0534`.
Korrigierte, noch nicht nativ gestartete Vorbereitung:
`80210a6f…/hidden-electron-preparation.json`, SHA
`a1d08baaa3b5d68133eac48cff55b8318979a6a8dd27731092a01c62f0613305`.
Sie benötigt frische Rootprüfung und einen neuen Annahmebeleg; die alte Freigabedatei passt nicht.
Felix hat Explorer und Lightroom inzwischen geschlossen und für Prüfungen freigegeben.

Die lesende Lightroom-Kopierumfangsprüfung stellte klar: `.lrcat-data` ist ein Verzeichnis
mit 115 direkten regulären Dateien, kein einzelnes Begleitfile. Katalog und vollständiger
Begleitbaum umfassen zusammen 19.490.507.255 Bytes; drei getrennte Stände 58.471.521.765 Bytes,
mit 2 GiB Reserve 60.619.005.413 Bytes. D: hat dafür zu wenig Spielraum; als eigener neuer
Zielbereich wird E: vorbereitet. Noch keine Originalinhalte gelesen, keine Katalogkopie und
kein Lightroom-Großtest ausgeführt. Der vollständige Begleitbaum einschließlich der leeren
LevelDB-Datei `LOCK` muss erhalten bleiben. Konkreter E:-Kopier-/Testumfang, echte Laufzeit-
und XMP-Schutzbelege sowie dessen gesonderte Freigabe bleiben vor dem tatsächlichen Start offen.

Felix nimmt die tatsächlich gezeigten A-78-Verschiebungen für **Papageientaucher, Buchfink
und Kormoran ausschließlich auf Tablet** an. Originalpaare liegen unter `a0864d24…`;
Produktübernahme und Header-/Scroll-/Breitengrenzprüfungen stehen aus. Die weiteren sechs
Artentwürfe bleiben ungeprüfte Vorschläge. Typografie sowie Home/Spenden brauchen tatsächliche
Bildvergleiche vor Felix' Entscheidung. Belegbare Griechenland-Schreibfehler und der passendere
Katzen-Ausschnitt sind freigegeben; die übrigen offenen Gestaltungsfragen sind damit nicht angenommen.

**Lokaler Taxonomie-Vorschaufehler, kein belegter Livefehler.** Felix meldet am privaten
Kormoran-Vergleich die fehlende Taxonomiepyramide. Frischer getrennter Browserabruf der
öffentlichen Kormoran-Seite bestätigt sieben tatsächliche Taxonomiestufen und null
Taxonomiefehler, auch bei eingestellter Tabletbreite. Ursache im privaten Adapter:
`species-taxonomy.js` lädt seine CSS relativ zum eigenen lokalen Skriptpfad; der Vorschauhost
bediente `/__hero/modules/docs/squarespace-custom.css?v=1.0.13` nicht. Der Fehler entsteht vor
dem Artdatenabruf. Keine öffentliche CSS-/CMS-/Pages-Veröffentlichung durch diese Vorschau.
Enge Adapterkorrektur mit exakter CSS-Aliasroute und Versionsprüfung vorbereitet, ohne
Änderung der Produktmodule; 30/30 beziehungsweise 45/45 reine Gegenprüfungen bestanden.
Neue Pilotvorbereitung `89cc31cd…/hero-comparison-preparation.json`, SHA
`272acd04902dd7db14392c60bf9e67f73cc7c75cb90eee15d73fd4de1ce53340`;
sechs weitere Entwürfe `3a44f91b…/hero-comparison-preparation.json`, SHA
`45582c2306c907851c4246e1fda192b43566c810e2b35a33669478194d1fd172`.
Beide neuen Hosts wurden noch nicht gestartet; die frische native Vorschauabnahme steht aus.
Alte Vorschauadressen sind zeitlich begrenzte lokale Hosts und keine dauerhaft nutzbaren Links.

**Kleine Abschlussschritte und neue Reihenfolge.** Felix möchte ausdrücklich zuerst Explorer,
dann Website und anschließend Lightroom abschließen. Bis dahin keine neuen Lightroom-Prüfungen
oder Katalogkopien starten. Die fertige private Großtestvorbereitung bleibt deaktiviert:
`eb56acf9…/large-preparation.json`, SHA
`429b77c7ed2cd8b0dae5b53f3dc94db6bb457b0cc19407574a7ee68e32d5d60d`;
64/64 kleine Gegenfälle ersetzen keine reale Kopier-/Betriebsabnahme.

Erster enger Explorerabschluss: vorhandene Desktopverknüpfung vollständig gesichert unter
`173af257…/desktop-shortcut-before.lnk`. Der normale Installeraufruf wurde von der bestehenden
PowerShell-Skriptrichtlinie abgewiesen, ohne Änderung der Verknüpfung. Anschließend ausschließlich
die IconLocation-Eigenschaft über die vorhandene Windows-Verknüpfungsdateischnittstelle geändert;
keine Änderung einer Ausführungs- oder Sicherheitsrichtlinie. Ziel, Argumente, Arbeitsordner und
Beschreibung sind exakt unverändert, angenommener ICO-Hash erneut bestätigt. Ergebnis
`6dbb4030…/desktop-shortcut-icon-result.json`. Beide eigenen Dateisitzungen geschlossen/0.
Explorer tatsächlich über diese Desktopverknüpfung gestartet: neues Buch-/Weltkugel-Symbol
links oben im echten Desktopfenster sichtbar, Hauptansicht geladen. Unverändertes Originalbild
und Fensterzustand unter `754f974f…/explorer-native-icon-and-main.jpg` und `.json`.
Keine Start-/RAM-Messwerte daraus; deren tatsächliche Erhebung bleibt der nächste eigene Schritt.
W bleibt durch Felix bestätigt. Danach Explorer-Schlussprüfung des fertigen Standes; die endgültige
gemeinsame Dateibereinigung und das Gesamt-Go bleiben nach Website und Lightroom.

Logo-Nachprüfung regulär beendet: Alt+F4, danach frische Fensterliste ohne Explorer und
gezielte Prozesslesung ohne die gestartete Desktop-Hauptinstanz. Keine produktive Bearbeitung,
Lightroom weiterhin geschlossen. Eigene Aufnahme geschlossen, tatsächlicher Exit 0, drei von drei
Originalbelegen vorhanden, keine Schließfehler; `754f974f…/evidence-result.json`, SHA
`989b23e5854054a204997ba720ae8b6791a84682b61201f573e343855d05fb9c`.

**App-Symbol korrigiert: Transparenz und weiße Turbine.** Felix meldet am eingebauten Symbol
einen weißen Außenrahmen und anschließend eine blaue, zum Flugzeug gehörende Turbine.
Das bisherige PNG war tatsächlich RGB ohne Alpha; die ursprüngliche reine Formatübernahme
hatte diesen weißen Außenbereich erhalten. Auf ausdrücklichen Änderungsauftrag das angenommene
Motiv mit der eingebauten Bildbearbeitung freigestellt und die Turbine weiß korrigiert.
Endausgabe unverändert als RGBA-PNG übernommen, SHA
`63922bd5c1735dd4a31aa4d7c721adf2d16cc1b2a8082bf41f55403a6d22651e`.
Die schwarze abgerundete Fläche bleibt Teil des Symbols. Außerhalb kein weißes Rechteck;
alle vier Ecken vollständig transparent. Elf äußerste Pixel haben aus der Bildausgabe noch
Alpha 1/255, die übrigen Randpixel Alpha 0; kein sichtbarer Außenrahmen. Die erste strengere
Nullrand-Gegenprüfung stoppte vor Produktübernahme und bleibt unter `16d82b9c…` erhalten.

Sieben ICO-Größen 16/24/32/48/64/128/256 pixelgenau gegen die erwartete Lanczos-Umrechnung
geprüft: jeweils Alphabereich 0–255 und transparente Ecken. Größen-/Formatumrechnung ändert
keine Motivgestaltung. Beleg `bd4216a1…/transparent-icon-assets-result.json`; altes PNG/ICO
vollständig gesichert. Neues `arten-explorer-transparent.ico` mit SHA
`3409501781e479f13a8dfd7b5869de2bdb221add25f54dc827d3839ebf9de19f`
vermeidet den Cachepfad des weißen Vorgängers. Fenster, Installer und bestehende Desktopverknüpfung
verwenden diesen Pfad. Nur IconLocation der vorhandenen Verknüpfung geändert; Startparameter
unverändert, vorherige Verknüpfung gesichert. Abgelöstes ICO aus dem Assetordner in die eigene
Belegablage verschoben, keine pauschale Bereinigung. Ergebnis
`550909ea…/transparent-shortcut-and-source-result.json`; beide Dateisitzungen geschlossen/0.
Vier betroffene Desktop-Vertragsfälle und Syntaxprüfung bestanden. Normaler Desktopstart
bestätigt das transparente Fenstersymbol und geladene Hauptansicht; Originalbelege unter
`231898b2…/native-transparent-icon.jpg` und `.json`. Kein neuer Lightroom-Test oder Websiteeingriff.

Reguläres Explorerende bestätigt: frische Fensterliste leer, gezielte Prozessprüfung null
Desktop-Hauptinstanzen. Aufnahme tatsächlich geschlossen/Exit 0, drei vollständige Originalbelege,
keine Schließfehler; `231898b2…/evidence-result.json`, SHA
`954b25e64691b0958f6ae34a64b0cbd209119a1c4ab9f1cfc2db7724ed224713`.
Dokumentprüfung: 80 Markdown-Dateien ohne fehlende lokale Verweise; Diffprüfung bestanden.
Der kumulierte Git-Diff der drei betroffenen Desktop-Quellen umfasst 117 Einfügungen/50 Löschungen
und enthält frühere Auditänderungen; die aktuelle Quelländerung stellt nur die Icon-Pfade um.

**Korrigierte Start-/Speichermessung am 26. Oktober tatsächlich ausgeführt.** Auf Felix'
Einzelauftrag den Helfer `80210a6f…` vollständig gegengelesen: kein Top-Level-Warten auf Ready,
vorher aktive Fristen und Stoppabfrage, unmittelbare Prozessbeobachtung, identitätsgebundener
Notstopp ausschließlich des eigenen Kindprozesses. Alle 57 eingefrorenen Dateien und 43 aktuellen
Frontendquellen stimmen vor dem Start überein. Eigene neue Rootannahme
`0183ef4d…/root-hidden-measurement-review.json`, SHA
`15b1320418f3fa01052ba31a4eb768e8a94026f24f002697e7cbe42568ee7a4c`.
Die Iconänderung betrifft die produktive Desktop-Hülle; die gemessenen Frontendquellen sind unverändert.

Drei echte, unsichtbare Electron-Prozessstarts mit 64 künstlichen Arten, privatem Profil und
ausschließlich eigenem lesendem Loopback-Fixture. Messpunkt: vollständige Identitäten, dekodierte
Sollbilder, Audiometadaten und zwei stabile passende Beobachtungen. Keine bloße erste Bildschirm-
oder Serverantwort als Fertigstellung gewertet. Node 24.22.1, Electron/Binary 42.11.18.

| Lauf | Prozessstart bis geprüfte Bereitschaft | Privater residenter Windows-Speicher, vier Electron-Prozesse |
| --- | ---: | ---: |
| 1, frisches eigenes Profil | 2.811,840 ms | 127.180.800 Bytes / 127,18 MB |
| 2, eigenes Profil wiederverwendet | 2.762,692 ms | 131.461.120 Bytes / 131,46 MB |
| 3, eigenes Profil wiederverwendet | 2.744,235 ms | 124.092.416 Bytes / 124,09 MB |

Median Start 2.762,692 ms; Minimum/Maximum 2.744,235/2.811,840 ms. Median privater RAM
127.180.800 Bytes / 121,29 MiB. MB in der Tabelle dezimal, MiB ausdrücklich binär.
Windows `WorkingSetPrivate` je Prozess separat erhoben und addiert; gemeinsam genutzte Seiten
sind darin nicht enthalten. RSS und zugesicherte `PrivateBytes` bleiben getrennte Rohwerte;
keine Summe der RSS als eindeutiger physischer Gesamtverbrauch ausgegeben. Die Windows-Zähler
wurden nach Bereitschaft nacheinander gelesen, keine atomare oder Spitzen-RAM-Aufnahme behauptet.

Alle drei Kindprozesse tatsächlich Exit 0, keine Fehler/Abbrüche, kein Frist- oder Notstopp.
Bereitschaft bleibt bis zum Schluss gültig. In der kurzen Leerlaufphase keine erfassten Aufgaben
über 50 ms; maximale beobachtete Timerabweichung 13,3/14,2/15,1 ms. Kein Hänger reproduziert.
Das ist keine Speicherleckprüfung und kein statistischer Leistungsnachweis mit Konfidenz oder p95.
Der Lauf misst die echte Electron-/Frontend-Ausführung mit Kunstmedien; produktiver Server,
Taxonomiedatenbanken, normale Desktop-Hülle, tatsächliche erste Bildausgabe und OS-Kaltstart
sind nicht gemessen. Vorherige Binary-Hashprüfung erwärmt den Dateicache; andere Rechnerarbeit
kann die Ergebnisse beeinflussen. Aus dieser Probe folgt kein neuer Optimierungsauftrag.

Rohabschluss `9ae46223…/final.json`, SHA
`41dd52d895dd4d637b8e14d88bce80c65b4b26f5198fd26a04c111c3859d989a`.
Unabhängiges Nachrechnen aller drei Rohberichte, Identitäts-/Speicherbelege, 104 abgeschlossener
GET-/HEAD-Antworten und aller Quellhashes bestanden:
`6b55c0e8…/hidden-electron-measurement-accepted.json`, SHA
`f68ebe526f1476d4ed0ba97197a957786ef109d75a335a2773232c01ce42c97f`.
Alle 13 bekannten Mess-/Eigentümer-PIDs frisch nicht mehr vorhanden, eigener Listener geschlossen.
Laufzeit und Annahmesitzungen geschlossen, null Operationen/Helfer; tatsächlicher Messprozess-Exit 0.
Keine produktive Daten-/Quelländerung, kein Lightroom- oder Websiteauftrag ausgeführt.
Dieser isolierte Messschritt ist abgeschlossen; die Explorer-Schlussprüfung bleibt der nächste
getrennte Schritt. Der frühere hängende Helferlauf bleibt als unveränderter Fehlernachweis erhalten.

#### Explorer-Abschlussprüfung – 26. Oktober

**Ergebnis: lokale Explorer-Teilabnahme angenommen.** Felix beauftragt ausdrücklich den gemeinsamen
Schlussabgleich und eindeutige Dokumentation, ohne bestandene Funktionsprüfungen vollständig neu zu
beginnen. Es besteht kein neu belegter, unbehobener Explorer-Funktionsfehler, der den Übergang zur
Websiteprüfung blockiert. Der Prüfstand ist lokal; Website, Lightroom-Großprobe, Veröffentlichung,
Abschlussbereinigung und Gesamt-Go bleiben getrennte Aufgaben. Keine neue Betriebsaktion daraus.

Die Originale des Gesamtprüflaufs `cd69eb83…` mit 50 Gruppen/2.256 bestandenen Tests, seine beiden
identischen 717-Dateien-Bindungen und Protokollhashes sind frisch gegengelesen. Beim ersten aktuellen
Abgleich sind 702 Dateien bytegleich; die 15 später geänderten Dateien sind einzeln zugeordnet:
fünf Dokumentations-/Dateiattributstellen, zwei öffentliche Website-Einbindungen und acht Explorer-
Quellen einschließlich Tests. Drei neue Desktop-Assetdateien kommen hinzu; keine Datei des damaligen
Prüfstands fehlt. Quellabgleich `32981adf…/explorer-closing-source-delta.json`, SHA
`34f7f7b890426c49d43511702cb34c0c39788151927de0159b40b00cfaceeca8`.
Die danach angepasste historische Kennzeichnung im Taxonomie-Betriebsstand ist eine zusätzliche
reine Dokumentänderung. Keine fremden Änderungen zurückgesetzt oder in eine neue Veröffentlichung aufgenommen.

Alle sieben relevanten Explorer-Bindungen des späteren 21-Fälle-Nachweises `13c9f56c…` sind exakt
unverändert; beide tatsächlichen Originalprotokolle stimmen mit ihren Hashes überein. Der W-Hinweis,
Website-Prüfzustände, Filter-/Listenverhalten und CSS behalten deshalb diesen Nachweis. W ist zusätzlich
nach normalem Neustart durch Felix bestätigt. Der Desktop-Einstieg stimmt nach genauem Entfernen
der beiden Iconergänzungen wieder bytegleich mit dem vollständigen Gate-Stand überein; keine verdeckte
weitere Änderung des Starts oder Schließens. Transparenz-/Turbinenkorrektur, Dateiverweise,
Desktopverknüpfung und tatsächliche Windows-Anzeige sind separat wie oben nachgewiesen.

Nur die kleine aktuelle Desktopgruppe erneut ausgeführt: **13/13 bestanden**, null Fehler/Abbrüche/
Skips; lesender `status:check` ebenfalls bestanden, keine generierte Statusdatei geschrieben.
19 Quellen und Datenbindungen vorher/nachher identisch. Ergebnis
`7bbb3b7b…/explorer-final-targeted-checks.json`, SHA
`4dcd321b17a33e5efc923fec2d6d768d5ebb76e63e05a78149ee02b5040bc63e`.
Der lesende normale Veröffentlichungsquellen-Preflight besteht mit `ok:true`, Dateiliste leer;
keine Übertragung, kein Index-/Commit-/Push-Schritt. Unveränderte vollständige Funktions-,
Wiederanlauf-, Medien-, Restore- und native Nachweise bleiben gültig und wurden nicht neu gestartet.

Dokumentation konkret bereinigt: README beschreibt Port 4177 als bevorzugt mit lokalem Ersatzport;
Desktopvertrag unterscheidet interne Startseite und spätere Hauptansicht und bezeichnet den eigenen
Server korrekt. Der Taxonomie-Betriebsstand kennzeichnet seine Vor-Audit-Restliste sichtbar als
historisch. README, Roadmap und dieser Auditkopf nennen denselben lokalen Teilabschluss und dieselbe
Restreihenfolge. Historische Auditberichte und generierter Projektstatus bleiben unverändert.
Der weiterhin gespeicherte Löwen-Testbestand ist kein neu zu veröffentlichender Artenauftrag;
Bestandsbereinigung bleibt beim vereinbarten letzten Gesamtschritt.

Abnahmegrenzen bleiben ausdrücklich erhalten: Die echte normale Desktopbedienung ist belegt,
die Leistungswerte stammen dagegen aus dem isolierten Kunstbestand. Kein produktiver Datenbank-
Kaltstart, langfristiger Speicherlecktest oder vollständiger physischer DPI-/Touch-/Screenreader-
Nachweis daraus. Die genaue Erstursache des früheren Fensterhangs wird nicht nachträglich behauptet.
Weder solche nicht erhobenen Nachweise noch eine neue produktive Taxonomie-/Katalogaktion werden
zum Schein als erledigt erklärt. Die aktuellen Quellen erlauben den nächsten kleinen Website-Schritt.

Technischer Schlussbeleg `486c659d…/explorer-local-final-acceptance.json`, SHA
`69a2fc6429f2f5c5e1a7f0dcc4325f2c8fb755bb3455aba40a01e7dbeb12a113`:
19 Programm-/Datenbindungen und fünf aktuelle Dokumente während der Endprüfungen stabil;
nach den Dokumentkorrekturen 701 der ursprünglichen 717 Dateien unverändert, 16 Änderungen
vollständig eingeordnet. Dokumentverweise (80 Markdown-Dateien), Quellstil und Diffprüfung bestanden.
Die übernommenen nativen Originale und Messrohdateien erneut gegen ihre Hashes gelesen; alle eigenen
Schlusssitzungen geschlossen/0. Nur dieser Belegverweis anschließend ergänzt, kein Programmcode geändert.
Der kumulierte `git diff --stat` der fünf Dokumente enthält frühere Auditarbeiten
(9.318 Einfügungen/4.015 Löschungen vor diesem Verweis) und ist nicht der Umfang dieses Einzelschritts.

#### Website-Schritt 3 – Tablet-Positionen und Taxonomievorschau, 26. Oktober

**Alle neun angenommenen Positionen lokal abgeschlossen; öffentliche Übernahme offen.**
Auf Felix' nächsten Einzelauftrag nur die Website fortgesetzt. Explorer-Teilabnahme bleibt bestehen;
keine Lightroom-Probe oder Katalogkopie gestartet. Papageientaucher, Buchfink und Kormoran sind
entsprechend der ausdrücklichen Annahme lokal integriert, ausschließlich bei 768 bis unter 1024
CSS-Pixeln. Exakte Body-/Hero-Kennungen und gültiger Hero-Marker begrenzen die Regeln. Die eigene
CSS-Eigenschaft `translate` erhält Bildfokus und ursprüngliches `transform`; der Versatz wird an
der aktuellen Kopfzeilenhöhe begrenzt. Bei dieser ersten Dreierübernahme CSS-Cache im Footer
**1.0.14**, Hero-Modul unverändert **1.0.4**. Noch keine CMS-/Pages-Veröffentlichung.

Der reparierte private Host bedient die tatsächlich vom Taxonomiemodul angeforderte CSS-Abhängigkeit
einschließlich exakter Versionsabfrage. Damit verschwindet der frühere private Ladefehler vor dem
Datenabruf. Die anschließende echte Sichtkontrolle zeigt jedoch eine zweite Ursache A-85: Bei
Browserzoom mit DPR 1,13 rundet `innerWidth` auf 768; die tatsächliche Medienbreite liegt zwischen
768 und 769. Weder die alte Regel bis 768 noch diejenige ab 769 gilt. Das Grundraster mit zwei
320-Pixel-Mindestspalten drückt die Taxonomie auf 19,73 Pixel zusammen. Vollständige geladene Daten
allein waren deshalb noch keine visuelle Abnahme. Die erste frühere Zwischenmeldung war insoweit
zu weit; die anschließende Originalaufnahme ist als roter Beleg erhalten.

Nur diese Lücke geschlossen: Tablet-Modulraster nun `width > 768px` bis einschließlich 1100;
die bisherige Mobilregel gilt weiterhin bis einschließlich 768. Native Gegenaufnahme bei derselben
Zwischenbreite bestätigt eine 693,45 Pixel breite Modulspalte und sieben vollständig sichtbare
Stufen. Die öffentliche Kormoran-Seite wurde getrennt frisch bei echten 768 × 1024 geprüft:
sieben Stufen, kein Ladefehler, Taxonomiebreite 691,56 Pixel. Dort laden weiterhin die öffentlichen
Einbindungen mit Taxonomie-/CSS-Cache **1.0.9**; daraus folgt keine Übernahme des lokalen Stands.

Die drei integrierten Bildpositionen tatsächlich bei schmalem und breiterem Tablet, unterhalb der
Tabletgrenze und beidseits der oberen Grenze geprüft. Medienabfragen statt gerundetem `innerWidth`
bestimmen die Einordnung: Ein auf 1024 gerundeter Messpunkt liegt nachweislich noch unter 1024.
Zusätzlich Desktop um 1280 sowie normales Scrollen mit zwei stabilen Headerbeobachtungen bei
Papageientaucher und Kormoran. Papageientaucher reduziert den Versatz von 144 auf 138 Pixel bei
geschrumpfter Kopfzeile; Kormoran bleibt auf 96 begrenzt. In 26 dokumentierten Zuständen keine
unbedeckte obere Fotokante; vorhandenes `overflow:hidden` verhindert Überlaufen nach unten.
Außerhalb der Tabletbedingung ist `translate:none`. Tatsächliche Originalaufnahmen bestätigen
sichtbare Köpfe und erhaltene volle Breite, Titelfarben und Kopfzeilenüberlagerung.

Die sechs übrigen Arten sind als echte Paare bei 768 × 1024 aufgenommen: Turmfalke 64,
Buckelwal 72, Fischertukan 48, Jagdfasan 40, Grüner Leguan 72 und Scharlachara 64 Pixel.
Je Paar identische Fotoquelle, Fokus, Füllart, Überlagerung, Hero-/Header-/Titelgeometrie.
Felix nimmt anschließend mit „setzen wir so um“ ausdrücklich alle sechs gezeigten Nachher-Varianten
an. Auch der gelbe Titel über der Fluke und der Leguantitel über dem unteren Kopfbereich sind damit
in genau der gezeigten Gestaltung angenommen. Alle sechs Regeln sind danach lokal integriert.
Die zunächst noch leere Jagdfasan-Vorheraufnahme ist ausdrücklich ausgeschlossen und durch
`jagdfasan-before-ready.jpg` nach bestätigter Bildladung ersetzt. Keine allgemeine Medienabnahme
aus den unterhalb des Heros teilweise noch nachladenden Porträts abgeleitet.

Gezielte vorhandene Regressionen **105/105 bestanden**: 95 Hero- und zehn Taxonomiefälle,
keine Fehler/Abbrüche/Skips. Sie ersetzen nicht die zusätzlichen nativen A-78-/A-85-Belege.
Kein erneutes vollständiges Gesamtgate behauptet. Unabhängiger lesender Quellenreview bestätigt
die enge Rasterkorrektur und den Scope der drei Bildregeln. Die erste Produkt-CSS-Differenz exakt
invers gegen die gesicherte Ausgangsdatei geprüft; zu diesem Zeitpunkt keine unangenommene
Sechserregel integriert.

45 unveränderte Browser-/DOM-Originale unter `71b09d97…`, Abschlussmanifest
`evidence-result.json`, SHA `c830ef67e6410d1f5ff0ab42a2daf0cc048daa81ed3f64e36e08ff6abf82feb2`.
Jedes Original frisch nachgehasht. Quellübernahme `c8b1dea5…/tablet-integration.json`;
gemeinsame private Neunseitenvorbereitung `1d3a91e9…` mit 77 stabilen Eingangsbindungen.
Tatsächlich abgeschlossene GETs aller zwölf aktuellen Module sowie der exakten CSS-Abhängigkeit
1.0.14 gegen ihre Quellhashes bestätigt. Alle drei hier gestarteten erreichbaren Vorschauhosts
regulär geschlossen, keine Quelldrift, tatsächliche Exits 0; auch die Belegaufnahme geschlossen/0.
Die zuvor unerreichbaren zwei Standard-Hosts sind ebenfalls regulär beendet. Keine pauschale
Bereinigung. Zusammengeführte Annahme `6a51d8f7…/tablet-step3-acceptance.json`, SHA
`9ca975d588d62c8e16371a3d770893fbcf5667dc3a8c5017b5e94ca3e0913ce6`.

Die damalige Wahl zu den sechs Paaren und deren gezielte Übernahme/Prüfung sind inzwischen
abgeschlossen. Gemeinsame Veröffentlichung und öffentliche Nachprüfung bleiben Teil des vereinbarten
Websitepakets. Kein physischer Tablet-/Touch-Nachweis und kein Gesamt-Go.

Nach Dokumentabgleich: 80 Markdown-Dateien ohne fehlende Verweise, Quellstil und `git diff --check`
bestanden; fünf betroffene Dateien währenddessen stabil. Geschlossener Beleg
`11abd2cd…/final-checks.json`, SHA `94c9d1ea5c0b7cfd1fb8f3ae6a33f06453f7edf9e06f0c4c6faa49bdcfec7d07`.
Nur dieser Belegverweis anschließend ergänzt. Eigener Quellumfang: CSS +16/−3, Footer +2/−2;
der kumulierte Git-Diff der fünf Dateien enthält frühere Auditarbeiten (+9.846/−4.010 vor diesem Verweis).

**Fortschreibung nach Annahme aller sechs Varianten.** Exakt die gezeigten Regeln in den bestehenden
Tabletblock übernommen; die vorherigen drei unverändert erhalten. Cache jetzt **1.0.15**, Hero-Modul
weiterhin **1.0.4**. Gesicherte Ausgangsdateien und exakte inverse Quellgegenprobe unter
`0e478046…/six-tablet-integration.json`; vorhandene 105 Hero-/Taxonomietests erneut bestanden,
vollständiges Originalprotokoll gebunden. Keine Änderung der Taxonomielogik oder von Lightroom.

Gemeinsamer Neunartenstand nativ geprüft: 45 gültige Zustände, alle neun Arten vertreten. Alle sechs
neuen Einbauten stimmen in Quelle, Bildstil/-geometrie, Hero, Header, Titel und Überlagerung exakt mit
den angenommenen Vorschauen überein. Für jede neue Art zusätzlich schmalere/breitere Tabletansicht,
beide äußeren Breitengrenzen und zwei stabile Scroll-/Headerzustände geprüft; keine freie Fotokante
oder Überläufe. Ein erster Turmfalken-Zwischenstand während Bild-/Headerübergang ist ausgeschlossen
und durch `turmfalke-ready-integrated` ersetzt. 35 unveränderte Originale in `d2d3352b…`,
Manifest-SHA `c876392469e9e8f439f9307ba7d227ec7a94d2c410681c3e5bf450c962419285`.

Alle zwölf Modul-GETs und die CSS-Abhängigkeit 1.0.15 gegen ihre tatsächlich ausgelieferten Hashes
bestätigt; 79 Eingangsbindungen stabil. Vorschauhost und Aufnahme regulär geschlossen, tatsächliche
Exits 0, keine Quelldrift oder Schließfehler. Öffentliche Einbindung weiterhin 1.0.9; die frische
Einbindungslesung vor Abschluss des dortigen Datenladens ist keine neue Funktionsabnahme.
Geschlossener Schlussbeleg `d799d8cd…/all-nine-tablet-acceptance.json`, SHA
`aca8f16408f5649b8fd6dc0e047f754046ddddf5a2b5376b110251608a4c5286`.
**Website-Schritt 3 ist lokal abgeschlossen.** Gemeinsame Veröffentlichung und öffentliche
Nachprüfung bleiben beim Websitepaket; keine Gesamt- oder physische Tabletfreigabe daraus.

Abschließende Dokumentverweise (80 Dateien), Quellstil und Diffprüfung bestanden; fünf aktuelle
Dateien stabil. Geschlossener Beleg `a11b1d6a…/all-nine-final-checks.json`, SHA
`78b68938b635733e2125b13819dc15ff10182ef2794b4e98a152421febf04c99`;
nur dieser Verweis anschließend ergänzt. Eigener Quelldiff CSS +19/−1, Footer +2/−2.

#### Website-Schritt 4 – übrige Bildvergleiche vorgelegt, 26. Oktober

Felix beauftragt die tatsächlichen Vergleiche vor seiner Gestaltungsentscheidung. Fünf interaktive
Bildgruppen enthalten 24 unveränderte Original-JPEGs: Wildlife/Datenschutz, Reiseüberschriften,
Startseite, Spenden und Kartengröße. Reiter und Variantenwechsel nativ geprüft, alle Bilder geladen;
normale und schmale Darstellung ohne horizontalen Überlauf. Ein zu langer Reitername der reinen
Vergleichsansicht wurde verkürzt und bei 320 erneut bestätigt. Keine Produkt-/CMS-Übernahme.

Wildlife ist mit aktuellem Sort 1.0.5 bereits in ganzen Wörtern lesbar; mehr Platz ergibt eine Zeile
bei erhaltener Schrift, die weitere Variante kleinere Schrift. Die Reiseübersicht zeigt Griechenland,
Montenegro und Botswana vollständig: kein fortbestehender Fehler aus den historischen Aufnahmen
behauptet. Datenschutz, Haithabu und Lütjenburg zeigen dagegen vor der Änderung echte Wortzerlegung;
die aufgenommenen mobilen Entwürfe erhalten Wortlaut, Farben und Hintergrundfoto.

Home zeigt vor/nachher beide Personenfotos, Formular und Kontaktüberschrift. Spenden zeigt den
kompakteren Titel mit eingebundenem statt einzelnem Bindestrich sowie Text/Bilder im wachsenden Fluss.
Private Zwischenfassungen erzeugten einen langen beziehungsweise flachen Knopf und werden nicht
als Wahlfassung benutzt. V3 erhält Schrift/Padding/Link, begrenzt nur den exakten Tablet-Spendenblock
und bestätigt nativ etwa 164 × 44 Pixel bei 768 und 820. Home-Fotos aus der ersten Vorschau bleiben
gültig: V2/V3 ändern ausschließlich den Spenden-Body, alle Home-Regeln bytegleich. Absende-/PayPal-
Barriere und CSP bleiben erhalten; keine Felder ausgefüllt oder Aktionen abgeschickt. Der vorhandene
Kontaktseitenhinweis ist als unveränderter Textvorschlag, nicht als bereits eingefügter Home-Text erfasst.

Für die Kartengröße die drei echten, vollständigen Bachstelzen-Aufnahmen vom 25. Oktober erneut
gegen ihr ursprüngliches Abschlussmanifest geprüft und angesehen: maximal 360 Pixel Bildhöhe,
640 Pixel Öffnerbreite, vollständiges Hochformatbild etwa 262 × 360 Pixel. Der grüne Rahmen zeigt
den Tastaturfokus. Das sind Größenvergleichsbilder, keine neue aktuelle Modul-/Live-/Bedienabnahme;
die spätere Integration muss die zwischenzeitlich angenommene Fokuskorrektur 1.0.10 erhalten.

Finale private Vorbereitungen: Typografie `79ea2477…` (20 Gegenprüfungen), Home/Spenden V3
`5d913d3e…` (22), Reiseüberschriften `ac4e7bbd…` (22). Aktuelle zwölf Module, CSS/Footer 1.0.15
gebunden; alle Eingänge stabil. 56 neue Original-/DOM-Belege unter `456d57a3…`, Manifest-SHA
`1d09c3807820352dacbf9c482f21e670f422ef090a6550fcd13471b7fe55e9bb`.
Alle fünf Seitenvorschauhosts, beide Darstellungsprüfhosts und die Aufnahme regulär geschlossen,
tatsächliche Exits 0, keine Quelldrift oder Schließfehler. Technischer Schlussbeleg
`04c04292…/step4-comparisons-ready.json`, SHA
`dbf7a3cb776c57553f2a8d01e15897f63f693c3fbd731927930de314fb199017`.
Bildgruppen bytegleich eingebettet, jede unter 1 MB; keine bearbeiteten oder nachgebauten Screenshots.

Zum Zeitpunkt dieser Vergleichsvorlage standen die Entscheidungen zu den Varianten und der endgültigen Kartengröße noch bei Felix.
Alternativtexte bleiben ausdrücklich beim Folgeauftrag aus **10.46 nach dem Audit**: Konzept,
menschliche Prüfung/Korrektur, Bestandsdurchgang und kontrollierte spätere Übernahme. Vorbereitete
32 Texte sind keine jetzige Schreibfreigabe. Keine neue Alttext-, Lightroom- oder Explorerarbeit begonnen.

Schlussprüfung: alle 64 Gegenprüfungen der drei finalen Vorbereitungen anhand ihrer gebundenen
Originale bestätigt; 80 Dokumentverweise, Quellstil und Diffprüfung bestanden. CSS/Footer stabil,
nur Auditauftrag und Roadmap geändert. Geschlossener Beleg `52ca88fc…/step4-final-checks.json`, SHA
`21975cc78ba462304fa15fb22f0b8dfd79be8460ce0488dba41cceb467e16fac`;
nur dieser Verweis anschließend ergänzt. Kumulativer Git-Diff beider Dokumente vor dem Verweis
+9.082/−2.055 einschließlich der vorherigen Auditarbeiten; kein Produktquelldiff dieses Schritts.

#### Website-Schritt 4 – angenommene Varianten und Integration, 26. Oktober

Felix bestätigt ausdrücklich: Wildlife Tablet und Reiseübersicht bleiben wie bisher. Datenschutz,
Haithabu und Lütjenburg erhalten mobil die gezeigten ganzen Wörter. Auf Home werden im Tabletbereich
Über-uns-Text/vollständiges Foto sowie Kontaktformular/vollständiges Foto untereinander angeordnet.
Spenden erhält den breiten Textfluss, ganze Fotos und den kompakten Titel über dem Foto; Schriftfamilien,
Farben, Texte und Knopfziel bleiben erhalten. Der vorhandene Kontaktseitenhinweis zur Datenverarbeitung
soll auch beim Home-Formular stehen; sinnvoll wegen desselben dort erreichbaren Formulars. Kein neuer
rechtlicher Inhalt und kein Hinweis als CSS-Pseudotext. Die kompakte vollständige Karte ist angenommen:
maximal 360 Pixel Bildhöhe und 640 Pixel Öffnerbreite, Tablet/Desktop links direkt unter der Überschrift,
mobil weiterhin zentriert. Vorherige unbestätigte Auswahlzustände der Vergleichsansichten sind keine Freigabe.

Die exakt ausgewählten CSS-Regeln sind aus den gezeigten Fassungen übernommen; Wildlife-, Reiseübersichts-
und zusätzliche Home-Schriftverkleinerungen ausdrücklich ausgeschlossen. Ausgangs-CSS bleibt als
unveränderter Präfix erhalten. Vorher-/Nachherbindungen und eigener Zusatz (205 Zeilen) in der eigenen
geschlossenen Sitzung `c09ad43d…/accepted-step4-integration.json`. Lokaler Taxonomie-/CSS-Cache jetzt
1.0.16, Map 1.0.11; Hero bleibt 1.0.4. Die neue Karte hat in jeder Ansicht einen nativen Öffner mit
sichtbarem „Karte vergrößern“; bestehende Fokuskorrektur und gesamter nachfolgender Dialogcode bytegleich.
31 automatisierte Kartenzugänglichkeits-/Websiteproben bestanden; deren neue Fälle belegen vor der
Korrektur vier Fehler und danach null. Schlussbeleg `fa352502…/compact-map-after-result.json`.

Die gewählten CSS-/Kartenvarianten sind inzwischen integriert nativ geprüft. Der Home-Hinweis wurde
als gezielter nativer CMS-Inhaltsschritt gespeichert und öffentlich bestätigt; die gemeinsame CSS-/Footer-/
Pages-Veröffentlichung bleibt davon getrennt offen. Alternativtexte bleiben nach dem Audit.

**Abschluss dieses Gestaltungsschritts.** Datenschutz bei etwa 345 und 390, Haithabu/Lütjenburg bei 390
nativ in ganzen Wörtern bestätigt. Home bei 768/820 mit vollständigen Personenfotos und freiem Formular;
Spenden bei 768/820 im angenommenen Fluss samt etwa 164 × 44 Pixel großem Knopf, kompakter Hero
mit unverändertem Wortlaut/Farben. Genau 105 bestehende Hero-/Taxonomieprüfungen sowie 31 Karten-/
Websitezugänglichkeitsprüfungen bestanden; kein neuer vollständiger Auditlauf behauptet. Hero-/Taxonomie-
Originalprotokoll `447e1094…/integrated-hero-taxonomy-tests.txt`, SHA
`0c41a09f43c2a2d129d214392f08b9222763b3e7f4d102caedaa9ff4a1e2b139`.

Kartenbild maximal 360 Pixel hoch; natürliche Proportionen und ganzer Inhalt bleiben erhalten. Bei
Bachstelze und Wendehals stimmen Tablet-/Desktop-Bildkante und Überschrift exakt überein; mobil bleibt
das Bild mittig. Sichtbarer Öffner, Maus-/Enter-Öffnung, Tab/Umschalt-Tab, Escape/Schließknopf sowie
Fokus-/Hintergrundrückgabe nativ geprüft. Keine physische Touchgeräteabnahme daraus ableiten.

Eine alte Wendehalsvorlage zeigte während der Nachprobe die historische abgeschnittene Überschrift.
Frischer öffentlicher HTML-Vergleich beweist den bereits korrigierten 24-Spaltenblock statt der alten
sechs Spalten; nur die private Vorlage erneuert, kein unnötiger Produkt-CSS-Fix. Aktueller Wendehals
in allen drei Ansichten frei bestätigt. Quellvergleich `68ca722d…/wendehals-heading-source-comparison.json`,
SHA `244be50e73c3c3eaee4afc7eacf25ec7462a703ee1175bc08d0820aa63b6664c`. Die drei alten
Wendehals-Aufnahmen sind kein Nachweis des heutigen Einbaus. Auch die zuerst programmgesteuert aus
dem nicht sichtbaren mobilen Öffner erzeugte Rückkehrserie wird nicht als sichtbare Bedienabnahme
gezählt; durch tatsächlich angeklickte sichtbare Karte und separate `*-mobile-ready`-Originale ersetzt.

**Home-Hinweis tatsächlich gespeichert.** Der vorhandene Wortlaut der Kontaktseite steht als vierter
Absatz im bestehenden Einleitungsblock unmittelbar vor dem Home-Formular. Die drei bisherigen
Absatzinhalte einschließlich starker Hervorhebung bleiben bytegleich. Squarespace serialisiert zusätzlich
sein `data-rte-preserve-empty`-Attribut; deshalb keine Bytegleichheit kompletter historischer Absatz-Tags
behaupten. Der Kontakt-Originalabsatz enthielt selbst keinen Inline-Link; ergänzt wurde gezielt das auf
beiden Seiten bereits vorhandene echte Ziel `/datenschutzerklrung` auf „Datenschutzerklärung“. Keine
Erfolgsnachricht, Formularfelder, Empfänger oder Einwilligungsmechanik geändert. Natives Speichern
mit bestätigtem Status „Veröffentlicht“, frischer öffentlicher Text/Link/Formularbestand bei Desktop,
Tablet und Mobil sowie tatsächlicher Linkklick zur richtigen Datenschutzerklärung bestätigt. Nichts
ausgefüllt oder abgeschickt. Bei der integrierten frischen Home-Vorlage folgen Text, Formular und ganzes
Foto auf Tablet mit jeweils etwa 16 Pixel Abstand. Quellkopie/Abgleich `6275fb24…`, öffentlicher Hinweis
in den gebundenen Originalen `home-notice-public*`. Die mobile Home-Überschrift „Kontaktanfrage“
zeigt im veröffentlichten Bestand weiterhin einen Wortteilumbruch; separate Gestaltungsvorlage dafür
bleibt offen, die jetzige Home-Tabletentscheidung wird nicht stillschweigend auf Mobil erweitert.

68 unveränderte Originale in eigener geschlossener Belegsitzung `56eb29a6…`; alle frisch nachgehasht,
Manifest-SHA `30cb9728b43d8b3002058d879512d260b4573a22fe8d2b3bf625ea405b5d1c38`. Beide
Siebenseitenhosts regulär geschlossen/Exit 0, alle zwölf tatsächlich ausgelieferten Module und exakte
Taxonomie-CSS-Abhängigkeit 1.0.16 gegen ihre Quellhashes bestätigt; keine Quelldrift oder Schließfehler.
Die Belegaufnahme ebenfalls geschlossen/Exit 0. Geschlossener integrierter Schlussbeleg mit 82 gezielten
Bindungs-/Geometrie-/Abstands-/Quellenprüfungen `f9cd96bb…/accepted-step4-native-result.json`, SHA
`2f59c22134739422ebdbb4a132ebac250d2d394a0375e784b85dd83732d0e340`. Das sind keine zusätzlichen
82 Produktfunktionstests oder Gesamtwebsite-Freigaben.

Die ausgewählten Varianten dieses Schritts sind lokal fertig; nur der eng begrenzte Home-Inhalt ist
bereits öffentlich gespeichert. Gemeinsame freigegebene Website-/Pages-Veröffentlichung einschließlich
CMS-CSS/Footer und anschließende öffentliche Nachprüfung stehen weiterhin aus. Keine neuen Lightroom-,
Explorer-, Sicherungs-, Taxonomie- oder Bereinigungsaktionen in diesem Schritt.

Abschließender Abgleich: 80 Markdown-Dateien ohne fehlende lokale Verweise, Quellstil und Diffprüfung
bestanden; alle sieben betroffenen Dateien währenddessen stabil. Geschlossener Beleg
`b63d9b37…/step4-final-checks.json`, SHA
`862c2ebbcd0c58dccd9452e217afc53003c37fcc3e827c68ad892ccb2b85cd23`. Nur dieser
Verweis danach ergänzt. Eigener Produktquellumfang: CSS +205 Zeilen, Footer zwei Cacheversionen;
Map +7/−2 und Tests +51/−8 gegenüber den gesicherten jeweiligen Ausgangsständen. Der kumulative
Git-Diff enthält außerdem alle vorbestehenden Auditarbeiten und ist nicht der Umfang dieses Schritts.

#### Website-Schritt 5 – freigegebene Korrekturen eingebaut, 26. Oktober

Felix nimmt nach tatsächlichem Vergleich „Ganze Wörter“ für die mobile Home-Überschrift an. Exakt
die gezeigte Regel unter 768 Pixeln ist übernommen: gleiche Schriftart/Farbe, nur kleinere passende
Schrift und Wortumbruch. CSS-/Taxonomiecache jetzt **1.0.17**, Map weiter **1.0.11**, Hero **1.0.4**.
Nativ bei 320/390 vollständig einzeilig; integrierter Stand entspricht der angenommenen Vorschau.
Bei 768/1280 bleibt die größere bisherige Schrift erhalten, Formularbestand und Tablet-Fluss frei.
Quellübernahme `ced24e83…/mobile-title-integration.json`; eigener Produktquelldelta 12 CSS-Zeilen und
eine Footer-Cacheversion. Kein Plug-in-/Explorerquellstand verändert.

Die acht bereits freigegebenen redaktionellen Korrekturen sind in den vorhandenen nativen CMS-Feldern
gespeichert und auf fünf öffentlichen Seiten nachgeprüft:

| Seite/Ziel | Vorher | Nachher |
| --- | --- | --- |
| Griechenlandübersicht, Sonstige-Impressionen-Button | Weiter Bilder | Weitere Bilder |
| Mykene, Bildtext | Der Gräberrund | Das Gräberrund |
| Mykene, Bildtext | unterirdischen Zysterne | unterirdischen Zisterne |
| Delphi, bestehende H3-Überschrift | der ort an dem | der ort, an dem |
| Delphi, Bildtext | Richtung Delphis | Richtung Delphi |
| Meteora, zwei Bildtexte | Vaarlam | Varlaam |
| Sonstiges, Bildtext | über dem einem Dorf | über einem Dorf |

„Vor den Toren Delphis“ bleibt als korrekter Genitiv erhalten. Galerie-Beschreibungen können ihre
abgeleiteten Altattribute mit berichtigen; das ist keine allgemeine Alttextüberarbeitung. Deren Konzept
und menschliche Bestandsprüfung bleiben nach dem Audit. Bestehender Buttonlink, Bilddateien,
Galeriekennungen und Reihenfolge bleiben erhalten; der korrigierte Button führt nach tatsächlichem
Klick unverändert auf `/reisen/2019-griechenland/sonstige`. Keine zusätzlichen Knöpfe oder Ziele erfunden.
Die Galerieeinträge werden vom CMS beim Bearbeiten übernommen; Seiten-/Listen-/H3-Änderungen zusätzlich
nativ mit bestätigtem Speicherschluss „Veröffentlicht“ gesichert.

Die Klosterkatze `IMGP1977.JPG`, Galerie-Item `70gumpffsvmvlt3vbe723xe7k7313z`, behält Originalfoto,
Bildtext und quadratische Vorschau. Nur den nativen Bildfokus von 50 % / 24 % nach **50 % / 100 %**
verschoben. Desktop/Tablet/Mobil zeigen Kopf und Schwanz vollständig. Bestehende Galerie und Zoom
zeigen weiter das ganze Original; erste Escape-Taste erhält die Galerie, zweite kehrt fokussiert zur
richtigen Vorschau zurück. Keine Ersatzdatei oder zusätzliche Produkt-CSS-Sonderregel für die Katze.

Fünf frische öffentliche Ausgangsquellen in `dfb6f02f…`, exakte acht CMS-Ziele in
`94264eb9…/greek-cms-copy-targets.json`, Katzenquelle/-vorschlag `5b9e3d5f…` und `482b53b3…`.
48 unveränderte native Vergleichs-/CMS-/öffentliche Originale unter `3c7768a0…`, geschlossenes
Manifest-SHA `5bfb0ce8b8e93f400fbc0d4d2aa9816e57ed5c2158da7d6554824b20de7ee9df`. Beide
Home-Vorschauhosts, reine Vergleichsanzeige und Belegaufnahme regulär geschlossen, tatsächliche
Exits 0; keine Quelldrift. Abschließender enger Quellen-/Inhalts-/Test-/Dokumentabgleich folgt unten.

Die ausgewählten Gestaltungen bis einschließlich dieses Schritts sind lokal integriert; die acht
CMS-Textkorrekturen und der Katzenfokus sind tatsächlich öffentlich. Die gemeinsame noch ausstehende
CSS-/Footer-/Pages-Übernahme und öffentliche Nachprüfung bleiben der nächste gesonderte Schritt im
freigegebenen Websitepaket. Kein Gesamtwebsite-Go, kein physischer Touch-/Gerätenachweis und keine
neue Lightroom-, Explorer-, Datenbank-, Sicherungs- oder Bereinigungsarbeit daraus.

**Schlussprüfung bestanden.** 136 gezielte Website-/Hero-/Taxonomie-/Kartenprüfungen, null Fehler,
Abbrüche oder Skips. 80 Markdown-Dateien ohne fehlende lokale Verweise; Quellstil und Diffprüfung
bestanden, fünf betroffene Dateien währenddessen stabil. Die 105 zusätzlichen Beleg-/Inhalts-/
Geometrie-/Hashbedingungen enthalten die 48 Originalprüfsummen und sind keine weiteren Funktionstests.
Geschlossener Schlussbeleg `4292c43a…/step5-result.json`, SHA
`92cb5c2a08167fce66e38da254a6db34797870fb2266dacc37c4eebfcadd6eeb`; nur dieser Verweis
danach ergänzt. Eine erste rein lesende Zeichenkettenprobe stoppte am CMS-Zahlenformat `1.0`
statt `1`; exakter numerischer Fokusvergleich bestätigt denselben angenommenen Wert ohne
Produktänderung. Alle fachlichen Nachbarwerte bleiben erhalten.

#### Website-Schritt 6 – gemeinsame Veröffentlichung und öffentliche Nachprüfung, 26. Oktober

Felix beauftragt die vorbereitete gemeinsame Übernahme ausdrücklich mit „los“. Die laufende
Lightroom-/Explorer-Arbeitsserie bleibt dabei lokal unangetastet. Statt den umfangreichen schmutzigen
Arbeitsstand insgesamt zu veröffentlichen, ist der Websitekandidat auf dem frisch gelesenen entfernten
Main-Stand `bb0fe718d7bbaa7829501e7b521a1078a4225c3b` aufgebaut. Genau 19 geprüfte Dateien wurden
als `d528f495ef546cda30be78068dddf5e4b657bb6f` veröffentlicht; Vergleich +3.305/−70 Zeilen,
ein Commit voraus, keine fremden Änderungen zurückgenommen. Der Branchwechsel verwendete den
vorher gelesenen Stand als Bedingung, ohne erzwungene Aktualisierung. Lokales HEAD und der bestehende
Git-Index wurden dafür nicht umgeschrieben. Kandidatenbindung `735acd21…/website-candidate-final-handoff.json`,
SHA `edffb65419bc8cab3dd736fe695caa3d469b5be10e37813fa452a35e0b1423bb`.

201 gezielte Verhaltenstests, Paketinstallation, Paketprüfung ohne hohe/kritische Befunde, lokale
Dokumentverweise und das kontrollierte Pages-Artefakt bestehen. Das lokale vollständige Gate war durch
Windows-Verknüpfungs-/Pfadlängengrenzen nicht vollständig abgenommen; die gesonderten Gegenproben
bleiben als solche erhalten. Keine Tests oder Schutzregeln wurden hierfür abgeschwächt.
Der tatsächliche [Pages-Lauf 40348461708](https://github.com/felixkfm90/iucn-species-data/actions/runs/40348461708)
besteht dagegen Qualitätsgate, Artefaktbau und Deployment vollständig. Beleg
`d259907d…/published-pages-run-result.json`, SHA
`d156000e59132984be2a11d16e29a3074e936a468ad026d1bb5c4b77d74812ae`.

**Tatsächliche CMS-Einbindung.** Zwölf Projektmodule sind gespeichert und frisch zurückgelesen;
andere Codefelder bleiben unverändert. Alle zwölf öffentlichen Moduldateien und das Standard-CSS
stimmen mit dem veröffentlichten Kandidaten überein. Der alte Squarespace-Compiler LESS 1.3.3 kann
die moderne CSS-Rangebedingung nicht verarbeiten. Die ersten CSS-Adressen 50/51 liefern trotz
HTTP 200 Compilerfehler; sie gelten ausdrücklich nicht als erfolgreiche Einbauten. Der endgültige
CMS-Inhalt ist deshalb ausschließlich ein Import der kanonischen Standard-CSS-Datei von Pages.
Damit verarbeitet der Browser die unveränderten Regeln einschließlich gebrochener Mediengrenzen.
Öffentliche CSS-Adresse 52 enthält tatsächlich diesen Import mit Cache 1.0.17, keine Compilerfehler.
Beleg `e500b4b9…/compiled-css52-canonical-import-final-result.json`, SHA
`a4337bd2d6538f8f03b64dc76c9c48e1ea9f4f97fdb21fd5f29ad6a0a3d57d9c`.
Der aktive Betriebsvertrag wird auf diese Einbindung umgestellt; keine zusätzliche CSS-Kopie im CMS.

**Öffentliche Bedien- und Darstellungsprüfung mit gültigem Import.** Alle neun angenommenen
Tablet-Tierpositionen tatsächlich bei 768 CSS-Pixeln angesehen; Bildquelle, volle Breite, ursprüngliche
Titel-/Fotoüberlagerung erhalten, sieben Taxonomiestufen und kein Ladefehler. Kormoran zusätzlich
bei 820 geprüft. Mobiler Eichelhäher sichtbar, mobile Artüberschriften schwarz unter dem Foto;
Desktop-/1024-Kontrollen ohne Tabletverschiebung. Wendehals-Karte auf Desktop/Tablet linksbündig
unter der Überschrift, mobil zentriert; vollständige Vorschau, Öffnen mit Klick/Leertaste, Tabführung,
Escape und Rückfokus bestehen. Ein geschlossen im DOM behaltenes Dialogelement ist keine sichtbare
offene Karte; Sichtbarkeit und Fokusrückgabe wurden gesondert bestätigt.

Ganze Wörter auf Datenschutz/Haithabu/Lütjenburg sowie die gewählten Home-/Kontakt-/Über-uns-/
Spendenansichten tatsächlich geprüft, Home-Kontaktüberschrift auch bei 320. Wildlife-Reihenfolge
überall Heimische Tierwelt, Afrika, Costa Rica, Island, Asien/In Arbeit; Reiseübersicht mit unveränderten
50 Blöcken, 14 Kacheln und sechs sichtbaren Originalbändern. Latium bleibt unter 2022.
Desktopmenüs bestehen Hover, Escape und erneutes Öffnen; Tabletmenü schließt mit Escape und
gibt den Fokus zurück. Suche „Wendehals“ meldet einen Treffer und navigiert zum richtigen Ziel;
„Weitere Tiere“ bleibt am Ende. Reale Galerie und eigener Zoom bestehen drei Ansichten, vollständiges
Originalseitenverhältnis, Tab/Umschalt-Tab, erste Escape-Taste nur Zoom schließen, zweite Galerie
schließen und Fokus zurück zur ursprünglichen Aufnahme. Keine physische Geräte-/Touch- oder
Screenreaderabnahme daraus; die frühere vollständige 137-Seiten-/Vier-Einstiege-Sichtung wird nicht
als neuer vollständiger Crawl ausgegeben. Neue Originale und Zustände in der eigenen Belegsitzung
`013f1bbe…`; deren vollständiger Schließnachweis folgt nach dem letzten Spendentitelzusatz.

**Bildtexte und individuelle Reisebeschreibungen.** 19 exakt abgegrenzte Textstellen auf 15 Seiten
öffentlich bestätigt, einschließlich nachgewiesener Schreib-/Grammatikfehler. Felix bestätigt das bisher
als „Puter“ bezeichnete Foto als Weißkehl-Elsternhäher; exakt dieses Beschreibungsfeld ist berichtigt.
Die Bezeichnung Wildschutzgebiet Gandoca-Manzanillo und die Reykjavík-Formulierung ohne veraltende
Einwohnerzahl sind gesondert angenommen. Die übrigen individuellen Texte bleiben erhalten. Eine
unbeabsichtigte Kursivformatierung der Chiang-Mai-Beschreibung ist über das tatsächliche native
Formatierungsfeld zurückgenommen und öffentlich ohne em/i bestätigt. Bildfelder, Reihenfolge und
Nachbartexte bleiben erhalten. Unabhängiger Schlussvergleich
`2f061d0d…/a70-final-public-complement.json`, SHA
`a023721d6cbb2148135ff2cda6b8d15d462bce42cc942554203542f38ed5d039`.
Abweichende Altattribute zwischen serverseitigem HTML und nachgeladenem Browserzustand sind
kein neu gespeicherter Feldunterschied; die CMS-Bildfelder sind unverändert. Allgemeiner Alttextworkflow,
Artseitengenerierung und Android-App bleiben vereinbarte Aufgaben nach dem Audit.

**Letzter eng begrenzter Zusatz abgeschlossen:** Felix gibt anschließend die Einbindung des allein stehenden
Spenden-Bindestrichs auch auf Desktop und Mobil frei. Schriftgrößen, Farben, Fotos, übrige Gestaltung
und angenommene Tabletvariante sollen erhalten bleiben. Die erste private Fassung verändert wegen
der Anbieter-Nachskalierung die Schrift und wird deshalb verworfen, nicht veröffentlicht. Die Ersatzfassung
erhält beide Skalierungskontexte, setzt keine Schriftregel und legt den vorhandenen Bindestrich in die
zweite Titelzeile. Private Desktop-/Mobilvergleiche bestätigen erhaltene Schriftwerte, Foto und Hero;
die nach abgeschlossener Größenneuberechnung gemessene Tabletvariante ist identisch. Ein sofortiger
Zwischenwert nach dem Größenwechsel ist kein stabiler Endvergleich.

Genau vier weitere Dateien (+48/−25) als
`4e372ab9f66575af3eb1ca2c8d2e92cf907bb109` auf dem zuvor veröffentlichten Commit übernommen:
CSS-Zusatz/neutraler Quellenkopf, Footer-Cache und die schlanken README-/Website-Betriebsanweisungen.
Keine zusätzlichen JavaScript-, Explorer- oder Lightroom-Quelländerungen. 201/201 gezielte Tests
bestanden; die zuerst eingeschränkt verweigerte eigene Verzeichnisverknüpfungsprobe besteht unverändert
im freigegebenen separaten Lauf. Log `6edbdb28…/targeted-tests-full-rights.log`, SHA
`789775753c1a6fc8c75e8727b37f12320fe377423a15709233c8869fd4b2744d`.
Der [abschließende Pages-Lauf 40366571164](https://github.com/felixkfm90/iucn-species-data/actions/runs/40366571164)
besteht Qualitätsgate, Bau und Deployment; öffentliche CSS-Datei 60.967 Bytes, SHA
`149fa82935fd13ce0c4d982959abf225e410b05bc39b071971751fec79efc6ee` exakt bestätigt.
Beleg `4a0350b8…/final-css18-pages-result.json`, SHA
`34605782867c4e6e60a42e3555ed3b4220f83b1bf016ecfc81d2bd1a9dbc4ed1`.

CMS-Import und Taxonomieskript tragen jetzt gemeinsam **1.0.18**, gespeichert und frisch zurückgelesen;
die übrigen Codefelder bleiben unverändert. Tatsächliche öffentliche CSS-Adresse **53** enthält
ausschließlich Compilerkopf und richtigen Import, HTTP 200/160 Bytes, keinen Compilerfehler.
Beleg `d298ee96…/compiled-css53-import18-result.json`, SHA
`98090864c2b0084e42965b3cec7fcf5566320eec1a48a273251d9ac5b17b85b9`.
Spenden öffentlich bei tatsächlichen 390/768/1280 CSS-Pixeln nachgeprüft; keine eigene Bindestrichzeile,
kein horizontaler Überlauf, Tabletgeometrie und -schrift gegenüber dem vorherigen öffentlichen Stand
erhalten. Für die beiden letzten schmalen Ansichten musste der integrierte Browser kurz sichtbar sein:
die Hintergrundsteuerung hatte den Größenwechsel ignoriert. Tatsächliche Breiten wurden abgelesen;
keine fälschliche Mobilabnahme der unveränderten 1280er-Hintergrundseite. Abschließend Kormoran bei
768 mit geladenem Foto, sieben vollständigen Taxonomiestufen, ohne Fehler/Überlauf und tatsächlich
geladenem Root-CSS/Taxonomiecache 1.0.18 bestätigt. Alle früheren funktionalen CSS-Regeln bleiben
gegenüber dem zuerst öffentlich geprüften Stand erhalten; der Zusatz betrifft nur den Spendentitel.

Alle **93 registrierten Originale** der eigenen Belegsitzung sind vorhanden und unverändert gebunden;
`013f1bbe…/evidence-result.json`, SHA
`20a3b7a84345cabe9eb49149da2203063e608fe6296f1c8431bfa5fdb9d80ab7`.
Belegaufnahme und beide privaten Vorschauhosts regulär beendet, tatsächliche Exits 0, keine Helfer/
offenen Operationen. Ein früher fehlgeschlagener Vorbereitungsschritt `9eb57815…` hatte nur vier
geschützte Kandidatendateien geschrieben und endete vor Teststart mit Exit 1; er bleibt ein Fehlerbeleg,
kein laufender Aufbau oder sauber abgeschlossener Prüflauf. Dessen Dateien unverändert erhalten.
Temporäre Browsergröße zurückgesetzt und eigene Arbeitsseiten geschlossen; der einmalige unerreichbare
Fehlertab bleibt der normalen automatischen Tabfreigabe überlassen. Kein Windows-Programm dafür gestartet.

**Website-Teilabschluss:** Die vereinbarten Entscheidungen sind umgesetzt, veröffentlicht und im
genannten Umfang öffentlich nachgeprüft. Keine offene Gestaltungsentscheidung aus diesem Paket.
Physische Touch-/Screenreaderprüfungen sind keine nachgewiesenen Leistungen dieser Browserabnahme.
Bekannte Quellen-/Lizenzgrenzen und die ausdrücklich nach dem Audit geplanten Workflows bleiben so
zugeordnet. Als nächster beauftragter Block folgt die noch offene repräsentative Lightroom-Großprobe;
erst danach gemeinsame Quellen-/Veröffentlichungsprüfung, gezielte Bereinigung und Gesamt-Go/No-Go.

**Quellen-/Dokumentschluss:** Beide Websitecommits gemeinsam ändern gegenüber dem frisch gelesenen
Ausgangsstand genau **20 Dateien, +3.346/−88 Zeilen**. Der örtliche `git diff --stat` enthält dagegen die
gesamte ältere Explorer-/Lightroom-/Dokumentationsserie und ist kein Delta dieser Veröffentlichung.
80 Markdown-Dateien ohne fehlende lokale Verweise, Quellstil und begrenzte Diffprüfung bestanden;
sieben Abschlussquellen während der Prüfung unverändert. Geschlossener Schlussbeleg
`ace6fd71…/website-step6-final-checks.json`, SHA
`3d0d3efa1cebb52690b8340a8847d9c79970518ca9f80a6d1e6202f079a87a39`.
Nur dieser Nachweisverweis anschließend ergänzt; die führende Befundtabelle und knappen Projekteinstiege
tragen den aktuellen Websiteabschluss. Historische Prüfberichte und generierter Projektstatus unverändert.

**Mobiler Spendentitel und Quellcheckpoint – nachfolgender Auftrag vom 26. Oktober.** Felix möchte
den gerade eingebundenen Bindestrich in der gezeigten kompakten mobilen Ansicht entfernen. Nur das
vorhandene mittlere H3 des exakten Spendenblocks unter 768 CSS-Pixeln ausblenden; beide Textteile,
Skalierungscontainer, Fotos und Desktop-/Tabletregeln erhalten. CSS-/Taxonomiecache **1.0.19**.
194 gezielte Tests bestanden; Commit `bc0d96c53f2ea7177cd7986a02e25cc0dcc94ade` ändert drei Dateien,
+10/−3 Zeilen. [Pages-Lauf 40370297171](https://github.com/felixkfm90/iucn-species-data/actions/runs/40370297171)
vollständig erfolgreich; öffentliche CSS-Datei 61.201 Bytes und SHA
`4502b3d5b207152a7a0d1f83b553bcbd4071d267f7bbb2bb756ef15220ec22ee` stimmen exakt.
CMS-Footer und Import gespeichert/frisch zurückgelesen, übrige Felder unverändert. CSS-Adresse 54
liefert ausschließlich den richtigen Import, keinen Compilerfehler; geschlossener Beleg
`53aacec4…/compiled-css54-import19-result.json`, SHA
`3922338f053a2c7944b1abcccfaa9cac14f698bf03c3d63d78c900d001a891e3`.
Nativ öffentlich 390 ohne Bindestrich, 768/1280 mit erhaltener angenommener Darstellung, ohne
horizontalen Überlauf bestätigt. Neun Originale vollständig gebunden unter
`04dab837…/evidence-result.json`, SHA
`f82a02c7ec4cd336f6463f39c03cf58a430e29646c78502ae0452179197618a3`, Aufnahme geschlossen/Exit 0.

Felix beauftragt anschließend ausdrücklich Commit und Push des fertigen Zwischenstands vor der
Lightroom-Großprobe. Die lesende Vorabprüfung ordnet 219 geänderte/neue Quell-, Test-, Fixture-,
Icon- und Dokumentdateien mit rund 7,20 MB zu; der lokale PowerShell-Modulanalysecache bleibt ausgenommen.
Keine Datenbanken, Katalogkopien, Tempbelege oder Sicherungsarchive aufnehmen. Der entfernte Main enthält
inzwischen acht bekannte Websitecommits; diese sind vor dem lokalen Commitabschluss zu integrieren,
ohne neuere öffentliche Änderungen zu überschreiben. Lokaler Index war vor dieser Arbeit leer.
Plug-in-Quellstand 0.4.24.39 ist in Versionsquelle, Dialog, Vertragstest und führender Doku konsistent;
eine veraltete aktuelle Angabe .33 im Katalognutzungsvertrag ist korrigiert, datierte Altnachweise erhalten.
Die repräsentative Lightroom-Großprobe mit ihrer gesonderten Kopier-/Betriebsfreigabe und danach
Gesamtabschluss/Bereinigung bleiben offen. Diese Commitfreigabe startet keine solche Betriebsaktion.

**Checkpoint-Prüfung bestanden.** Die acht bekannten Websitecommits sind regulär integriert. Nur
README und Website-Betriebsvertrag erforderten eine Auflösung; die geprüften schlanken Fassungen
enthalten bereits den aktuellen Import-/Cachevertrag. Der gesamte resultierende Git-Baum ist identisch
mit dem vor Integration geprüften lokalen Quellcheckpoint; öffentliche Quellen und fremde Geschichte
bleiben erhalten. Eine überflüssige Leerzeile am Dateiende des neuen Bildheaderlesers wurde vor dem
lokalen Commit entfernt, keine Funktionsänderung. Gegenüber dem bereits veröffentlichten Website-Stand
enthält der Quellcheckpoint 197 geänderte/neue Dateien; die vorherigen Websiteänderungen werden nicht
erneut als eigene neue Funktion ausgegeben.

Danach genau ein vollständiges lokales `quality:ci`: **50 Gruppen, 2.265 Tests**, keine Fehler,
Abbrüche oder Skips, einschließlich nachgelagerter Daten-/Medien-/Größen-/Status-/Siteprüfungen.
Quellstand `ce7a4561d52b7a629889fc0372891e70a2237b55` und Index währenddessen unverändert.
Geschlossener Beleg `e61d6cb7…/quality-result.json`, SHA
`68b3ada72fcfc7417dc88de94774c843cc4034ede904515a8e87a15b2fb6eb87`; vollständiges Log SHA
`febf8082b4978f1a3eedcf5162a725a403711b97c10649f68d48f9c32b990b80`.
Nur diese Audit-/Roadmapfortschreibung wird danach dem noch unveröffentlichten eigenen Commit
hinzugefügt und gesondert auf Verweise/Stil geprüft. Die Veröffentlichung erfolgt regulär ohne Force;
die tatsächlichen Commit-/Push-/CI-Ergebnisse bindet der ausschließlich technische lokale Beleg
`temp/explorer/effa1813-6175-40e0-a0de-1336836703fd/checkpoint-publication.json`.
Der lokale Windows-Modulanalysecache bleibt unveröffentlicht und Teil der späteren Bereinigungsprüfung.
