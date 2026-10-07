# Auditauftrag Phase 10.5 – Gesamtprojekt, Betrieb und Weiterentwicklung

Stand: 2026-10-07

Status: **vorbereitet, noch nicht ausgeführt**. Dies ist die Arbeitsanweisung für das kommende Gesamtaudit,
kein Gesamtaudit-Prüfbericht und keine pauschale Freigabe zum Löschen, Umziehen oder Veröffentlichen von Beständen.
Dies ist die **einzige führende Datei für Auditauftrag, Vorabregeln, Entscheidungen, offene Auditfragen und
den späteren Audit-Abschlussbericht**.
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
