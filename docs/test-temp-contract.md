# Test-, Mess- und Backupgrenzen

Stand: 27. Oktober 2026. Teil des gemeinsamen [Speicher-/Temp-Vertrags](temp-retention.md),
kein Nachweis einer produktiven Pfadmigration oder eines NAS-Backups.

## Eigene Testdateien

Alle Dateifixtures beziehen ihren Arbeitsordner aus `scripts/test-temp.mjs`. Dessen `tmpdir()` liefert
`<Explorer>/temp/tests/s-<Prozess-ID>-<Zufallskennung>`, unabhängig vom aktuellen Arbeitsverzeichnis, Windows-temp
oder dem produktiven Datenpfad. Vor dem Anlegen werden Pfadgrenzen und vorhandene Verzeichnisverknüpfungen
geprüft. `owner.json` kennzeichnet den eigenen Testprozess. Tests schließen ihre Leser/Hilfsprozesse und
entfernen ausschließlich die selbst angelegten Fixtures.

Der Sitzungsname ist bewusst kurz: tief verschachtelte SQLite-Paketproben müssen auch unter dem normalen
Windows-Pfadlimit funktionieren. Exklusives Anlegen und Eigentumsmanifest bleiben unverändert.

Beim normalen Prozessende wird nur eine danach leere eigene Session entfernt. Noch vorhandene Fixtures
werden nicht pauschal gelöscht: Aus einer beendeten Elternprozess-ID allein folgt nicht sicher, dass ein
abgekoppelter Testworker ebenfalls beendet ist. Absturzreste und fremde Sessions bleiben deshalb erhalten,
bis ihr Eigentum und ihre Prozessfreiheit gezielt geprüft wurden. Explorer-Sitzungsbereinigung und Tests
arbeiten in getrennten Bereichen; ein offener Explorer löscht keine laufenden Tests.

Kleine Benchmark-/Betriebsproben verwenden `<Explorer>/temp/benchmarks` und synthetische Eingänge. Eigene
zufällige Laufordner werden vor Start und vor rekursiver Bereinigung auf Pfadgrenze und Verknüpfungen geprüft.
Prototypdaten liegen ebenfalls dort; `--reset` darf keine produktiven Daten oder alten `Testlauf`-Belege entfernen.
Der Prototyp-Fixtureabruf schreibt standardmäßig nach `temp/benchmarks/prototype-fixtures`; versionierte
kleine Eingabefixtures unter `scripts/fixtures` bleiben unverändert.

## Veröffentlichung und Sicherung

- `data/`, historische `Daten/`-Installationen, `temp/`, `storage-path.json` und Plug-in-temp sind lokal und Git-ignoriert.
- Historische Prüfbelege aus den geleerten Temp-/Testlauf-Ablagen sind nach dem beauftragten Nachlauf
  privat unter `data/audit-evidence/phase-10-5/` archiviert; der gemeinsame Ordnerwechsel ist ausgeführt.
  Zuordnung und Zugriff stehen ausschließlich
  im [Tempvertrag](temp-retention.md); neue Tests verwenden weiterhin eigene Temp-Sitzungen.
- Syntax-/Stilprüfung und Veröffentlichungscode-Größenbudget zählen diese Laufzeitbestände nicht als Quellen.
- Die Pages-Positivliste enthält nur ausdrücklich benötigte öffentliche Laufzeitdateien. Neue öffentliche
  Module werden einzeln aufgenommen und geprüft; Datenbanken, Speicherkonfiguration und Tempdateien
  dürfen weiterhin nicht in das öffentliche Artefakt gelangen.
- Das bewusst gestartete vollständige NAS-Backup schließt den konfigurierten lokalen `data/`- beziehungsweise
  bisherigen `Daten/`-Ordner und `storage-path.json` ein, aber weder
  Explorer-temp noch Plug-in-temp. Alte `Testlauf`-Ausschlüsse bleiben unverändert.
- Der Wiederholungsnachweis bindet zusätzlich SHA-256 der dauerhaften Daten und Speicherkonfiguration.
  Ein Datenbankupdate darf trotz unverändertem Git-Stand nicht als bereits gesichert übersprungen werden.
  Nach dem ZIP-Aufbau wird diese Bindung erneut geprüft; eine zwischenzeitliche Datenänderung verhindert
  den Erfolg und entfernt ausschließlich das neu angelegte unvollständige Archiv.
- Ein konfigurierter Datenpfad außerhalb des Programms stoppt dieses vollständige NAS-Backup mit einem
  klaren Hinweis auf eine erforderliche gesonderte Datensicherung. Unbekannte externe Daten werden nicht
  stillschweigend weggelassen oder ohne Freigabe in einen neuen Sicherungsbereich aufgenommen.

Die Prüfsummenlesung findet nur im bewusst gestarteten Backup statt, nicht bei Explorer-/Fensteröffnung.
Sie benötigt zusätzliche Lesezeit bei großen Datenbeständen. Die ZIP-/Restore-Bedienabnahme bleibt Teil
der gesonderten Betriebsprüfung.

## Gezielte Prüfung

Die folgenden Gegenproben stammen vom 4. Oktober. Die tatsächliche Archivierung und Temp-Leerung
vom 27. Oktober ist getrennt im Auditauftrag, Abschnitt 10.56, belegt; diese alten Tests wurden dafür
nicht als neue Funktionsprüfung ausgegeben.

Neue Temp-/Prototyp-/Größen-/NAS-Verträge: 13/13 bestanden. Betroffene synthetische Benchmark-, Reuse-,
Paket- und Veröffentlichungsvorabtests: 80/80 bestanden. Scanner-/Pages-/Provider-/Fixture-Gegenproben:
39/39 bestanden. Kein Fehler, Abbruch oder übersprungener Test in den abschließenden Windows-Läufen.
Die Prozesssperre des ersten Sandboxversuchs wurde durch einen erlaubten isolierten Hilfsprozess-Gegenlauf
geklärt; keine Windows-, Test- oder Schutzregel wurde gelockert. Kein produktiver Abruf, Datenbanklauf,
NAS-Backup, Verschieben historischer Belege, Commit oder Push wurde dafür ausgeführt.
