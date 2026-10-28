# Roadmap

Stand: 2026-10-28

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
  Testinstallation ist bereinigt; die anschließend beauftragte vollständige NAS-Sicherung vom 28. Oktober
  ist einschließlich Rücklese-, Quell- und Aufbewahrungsprüfung abgeschlossen (Abschnitt 10.57).

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
Veröffentlichung nicht. Den anschließenden beauftragten Lightroom-/NAS-Nachlauf führt
[Abschnitt 10.57](audit-auftrag-phase-10-5.md#1057-lightroom-nachprüfung-und-nas-sicherung--28-oktober).

## Regelbetrieb nach dem Audit

Quellstand und regulär geladene Version **0.4.24.42** sind seit 28. Oktober gezielt nativ bestätigt.
Die Suche erkennt den `data`-Bestand und findet Weissstorch samt Details. Lightroom verwendet den normalen D:-Katalog.
Angenommene Prüfungen nur bei einem Regressionsgrund wiederholen. Geschützte Quellen, Rückwege,
NAS-Archive und dauerhafte Auditbelege bleiben erhalten. Ein künftiger echter Taxonomieaufbau kann
die noch nicht gemessene aktive Fortschritts-/Leistungsbeobachtung ergänzen; dafür keinen reinen
Testaufbau starten. Weitere Umsetzung und Veröffentlichung benötigen Felix' jeweiligen Auftrag.

## Beauftragte Arbeiten am 28. Oktober 2026

Felix hat am 27. Oktober diese Reihenfolge für die gemeinsame Fortsetzung am Folgetag festgelegt:

1. **Lightroom-Nachprüfung bestanden:** .42 am regulären Produktpfad aktiviert, normale D:-Katalogadresse
   bestätigt, Datenstände übereinstimmend und Weissstorch-Suche einschließlich drei Detailseiten erfolgreich.
   Keine Zuweisung oder Metadatenaktion; Lightroom anschließend regulär geschlossen.
2. **NAS-Sicherung bestanden:** Vollständiger gebundener Bestand einschließlich `data`, Speicherkonfiguration
   und der lokal getesteten Sicherungskorrektur nach dem [Sicherungsvertrag](multi-device-backup-plan.md)
   gesichert. Vollständige ZIP-Rücklesung, unveränderter Quellstand und Aufbewahrungsprüfung erfolgreich;
   kein Altarchiv entfernt. Zwei Manifest-Kompatibilitätsfehler für die vorhandene PowerShell-7-Laufzeit
   zuvor reproduziert und korrigiert, **38/38** gezielte Prüfungen bestanden. Keine Ausführungsregel geändert.

Beide beauftragten Arbeiten sind abgeschlossen. Der Sicherungsstand enthält die damaligen lokalen
Änderungen; Abschlussquittung und abschließende Dokumentation wurden danach ergänzt. Ein neuer nativer
Restore wurde nicht durchgeführt. Tatsächliche Nachweise und Grenzen ausschließlich im
[Auditnachlauf](audit-auftrag-phase-10-5.md#1057-lightroom-nachprüfung-und-nas-sicherung--28-oktober).

Felix hat anschließend die Veröffentlichung der geprüften NAS-Korrektur samt Abschlussdokumentation
und die Kontrolle des vollständigen GitHub-Pages-Laufs beauftragt. Der tatsächliche Veröffentlichungsnachweis
wird gemäß Auditnachlauf privat gesichert; örtliche Daten und Einstellungen bleiben ausgeschlossen.

## Vereinbarte Aufgaben nach dem Audit

Vor jedem der folgenden größeren Vorhaben klären Felix und Codex zunächst gemeinsam Zielverständnis,
Anwendungsfälle, Umfang und Rahmenbedingungen gemäß der [Arbeitsregel](../AGENTS.md#arbeitsweise-bei-späteren-einzelaufträgen).
Erst aus dieser bestätigten Grundlage werden Lösung und Umsetzung abgeleitet. Die weitere Reihenfolge
der Vorhaben wird ebenfalls gemeinsam festgelegt.

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
- **Abschlussaktion nach Datenbankaktualisierung:** Vor dem Start wählen können, was nach vollständig
  erfolgreichem Abschluss passiert, etwa nichts tun, Programm beenden oder Computer herunterfahren.
  Weitere klassische Systemaktionen im Konzept festlegen; Standard bleibt nichts tun. Fehler, Abbruch
  oder wartende Schritte dürfen keine Erfolgsaktion auslösen. Details im [Updatevertrag](taxonomy-update-automation.md#vorgemerkt-wählbare-abschlussaktion-nach-erfolgreichem-update).

Die verbindlichen Ziele der ersten drei Vorhaben stehen im Auditauftrag, Abschnitte 10.46 und 10.47.
Installer und Mehrbenutzerunterstützung hat Felix am 27. Oktober im Folgechat ergänzt; die fachliche
Einordnung steht im [Mehrgeräte-/Backupplan](multi-device-backup-plan.md). Die wählbare Update-Abschlussaktion
hat Felix anschließend ebenfalls vorgemerkt. Alle sechs Vorhaben sind aufgenommen; die konkrete Umsetzung
richtet sich nach dem jeweiligen Folgeauftrag. Frühere Ausbauideen
sind keine laufenden Umsetzungsaufträge.

## Fachstände

- [Taxonomie-Betriebsstand](taxonomy-current-status.md)
- [Lightroom-Vertrag](lightroom-search-package.md)
- [Aktuelle Arten-/Assetzähler und Pflegelisten](project-status.md)
- [Dokumentationsübersicht und historische Nachweise](README.md)

Weitere Arbeiten und Veröffentlichungen richten sich nach Felix’ jeweiligem Auftrag.
