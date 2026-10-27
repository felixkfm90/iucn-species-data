# Roadmap

Stand: 2026-10-27

## Aktueller Stand

Das Gesamtaudit Phase 10.5 ist seit **27. Oktober 2026 abgeschlossen**. Explorer, Taxonomie, Lightroom,
Medien, Speicher/Restore, Website und GitHub sind im vereinbarten Umfang angenommen. Gesamt-Go,
Prüf-/Veröffentlichungsnachweise und bewusste Nachweisgrenzen stehen ausschließlich im
[Auditauftrag, Abschnitt 10.55](audit-auftrag-phase-10-5.md#1055-lightroom-großprobe-und-gemeinsamer-abschluss--27-oktober).

- **Explorer:** angenommenes Logo und W-Hinweis, gezielte Bedienprüfung sowie isolierte Start-/Speichermessung.
- **Website:** alle 137 Sitemapseiten plus vier Einstiegspfade in drei Ansichten gesichtet; vereinbarte
  Korrekturen als Paket veröffentlicht und gezielt öffentlich nachgeprüft.
- **Lightroom:** Auditabnahme mit regulärem Plug-in **0.4.24.40**; Großprobe auf eigenen Kopien einschließlich genauer
  Rücknahme bestanden. Originalkatalogbestand unverändert; Standardkatalog liegt auf D:.
- **Sicherung:** isolierter Großrestore mit Inhaltsprüfung und Programmstart abgenommen. Die historische
  Testinstallation ist bereinigt; eine neue NAS-Sicherung des Abschlussstands wurde nicht erstellt.

Felix hat anschließend Dokumentations-/Dateibereinigung, Temp-Leerung, Sicherungsinventar und nach
Commit/Push einen neuen lokalen Projektchat beauftragt. Der Nachlauf steht in Abschnitt 10.56 desselben
Auditauftrags; die private Belegablage erklärt der [Tempvertrag](temp-retention.md). Im Folgechat hat Felix
die Umbenennung des gemeinsamen Datenordners von `Daten` zu `data` samt nötigen Anpassungen beauftragt.
Der lokale Ordnerwechsel ist ausgeführt; Stand und Prüfgrenzen stehen im [Speichervertrag](storage-migration.md).
Es erfolgt kein neuer Taxonomieaufbau und keine erneute vollständige Auditserie allein wegen des Chatwechsels.

Die anschließend beauftragte Dateiverwendungsprüfung ist im [Strukturvertrag](repo-structure.md#dateiverwendungsprüfung-vom-27-oktober-nach-dem-pfadwechsel)
festgehalten: vollständige physische Inventur, Programm-/Dokument-/Assetprüfung und konkrete Ballastkandidaten.
Eigene neue Testreste sind beleggesichert entfernt. Nach zusätzlichem Auftrag sind auch FFplay, der alte
Einmal-Normalisierer, eine bytegleiche Stagingkarte und die vollständig gegen das NAS-Archiv geprüfte lokale
Audiomigrationskopie entfernt. DD/NE bleiben ausdrücklich als Reserve; geschützte Rückwege sind erhalten.

Felix hat anschließend Commit und Push des gesamten geprüften Folgestands samt Pfadumstellung,
Bereinigung und Dokumentation sowie die Kontrolle des zugehörigen GitHub-Pages-Laufs ausdrücklich beauftragt.
Der Nachweis der tatsächlichen Revision und der Qualitäts-, Artefaktbau- und Deploymentergebnisse wird
nach Ausführung privat unter `data/file-usage-review/2026-10-27/publication/` gesichert. Die örtliche
Speicherkonfiguration und privaten Daten bleiben Git-/Pages-ignoriert; die neue Freigabe umfasst deren
Veröffentlichung nicht. Native Lightroom-Neuladung und eine neue NAS-Sicherung bleiben getrennte Grenzen.

## Regelbetrieb nach dem Audit

Zuletzt nativ bestätigt ist die reguläre .40; neuer lokaler Quellstand für den `data`-Pfad ist .42.
Die native Neuladung ist davon getrennt zu bestätigen. Lightroom startet standardmäßig mit dem normalen D:-Katalog.
Angenommene Prüfungen nur bei einem Regressionsgrund wiederholen. Geschützte Quellen, Rückwege,
NAS-Archive und dauerhafte Auditbelege bleiben erhalten. Ein künftiger echter Taxonomieaufbau kann
die noch nicht gemessene aktive Fortschritts-/Leistungsbeobachtung ergänzen; dafür keinen reinen
Testaufbau starten. Weitere Umsetzung und Veröffentlichung benötigen Felix' jeweiligen Auftrag.

## Vereinbarte Aufgaben nach dem Audit

- **Alternativtextworkflow:** Konzept und Umsetzung für Bild-/Textprüfung, menschliche Korrektur und
  Freigabe; Bestandsüberarbeitung und anschließende laufende Pflege. Vorhandene Entwürfe sind Vorarbeit.
- **Neue Artseiten:** Bestehende Strukturen, Texte, Bilder, Alternativtexte und Explorer-Verknüpfungen
  in einen gemeinsamen prüfbaren Erstellungs- und Einpflegeablauf integrieren.
- **Android-App:** Nutzung, Umfang und technische Lösung festlegen, danach Konzept und Umsetzung.
- **Installer einschließlich aller benötigten Programme:** Einen vollständigen Windows-Installationsablauf
  mit benötigten Laufzeiten, Hilfsprogrammen, Abhängigkeiten und Plug-in-Einrichtung konzipieren und umsetzen.
  Erstinstallation, Aktualisierung und Erhalt vorhandener Daten praktisch prüfen.
- **Mehrbenutzerunterstützung:** Nutzung durch mehrere Personen und auf mehreren Rechnern konzipieren und
  umsetzen; Benutzer-/Berechtigungsmodell, gemeinsame und private Daten sowie Schutz vor Bearbeitungskonflikten
  festlegen. Den bestehenden Mehrgeräte-/Update-/Sicherungsplan dabei einbeziehen.

Die verbindlichen Ziele der ersten drei Vorhaben stehen im Auditauftrag, Abschnitte 10.46 und 10.47.
Installer und Mehrbenutzerunterstützung hat Felix am 27. Oktober im Folgechat ergänzt; die fachliche
Einordnung steht im [Mehrgeräte-/Backupplan](multi-device-backup-plan.md). Alle fünf Vorhaben sind
vorgemerkt; die konkrete Umsetzung richtet sich nach dem jeweiligen Folgeauftrag. Frühere Ausbauideen
sind keine laufenden Umsetzungsaufträge.

## Fachstände

- [Taxonomie-Betriebsstand](taxonomy-current-status.md)
- [Lightroom-Vertrag](lightroom-search-package.md)
- [Aktuelle Arten-/Assetzähler und Pflegelisten](project-status.md)
- [Dokumentationsübersicht und historische Nachweise](README.md)

Weitere Arbeiten und Veröffentlichungen richten sich nach Felix’ jeweiligem Auftrag.
