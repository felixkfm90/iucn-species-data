# Projektkonsolidierungs-Audit vor Phase 7.10

Stand: 2026-06-28

## Ziel

Vor Synology-NAS, Mehrgeraete-Arbeit und Backup/Restore wird der aktuelle Projektzustand geprueft, damit keine
Altlasten oder unklaren Strukturen in die naechste Betriebsstufe uebernommen werden.

Dieser Audit ist bewusst nicht-destruktiv: Es wurden keine Dateien geloescht, verschoben oder umstrukturiert.

## Durchgefuehrte Pruefungen

- Git-Arbeitsbaum vor dem Audit sauber
- `npm.cmd run --silent test:explorer`
- Syntaxpruefung aller versionierten JS-/MJS-Dateien ohne `node_modules`, `local-tools`, `Testlauf` und `.git`
- `npm.cmd run --silent audit:site -- --skip-live --skip-pages`
- `npm.cmd ls --depth=0`
- Groessen- und Dateiuebersicht fuer produktive, ignorierte und lokale Hilfsordner
- Suche nach veralteten Restbegriffen:
  - `OPENAI_API_KEY`
  - `OpenAI Image`
  - `Sammelprompt`
  - alte Phase-7.8-Prototyp-Formulierungen

## Ergebnis der technischen Pruefungen

| Pruefung | Ergebnis |
| --- | --- |
| Explorer-Tests | 19 von 19 erfolgreich |
| JS-/MJS-Syntax | 23 Dateien erfolgreich geprueft |
| Lokaler Site-Audit | erfolgreich |
| Arten in `species_list.json` | 46 |
| Arten in `speciesData.json` | 46 |
| Karten | 46 |
| Artportraets | 46 |
| MP3/Credits/Spektrogramme | 45 je Typ |
| Bewusster Soundhinweis | `Gruener Leguan` |
| NC-Soundhinweise | 3 |
| Manuelle Karten | 4 |
| Veraltete OpenAI-/Sammelprompt-Reste im versionierten Bereich | keine Treffer |

## Groessen- und Strukturuebersicht

| Pfad | Dateien | Groesse | Bewertung |
| --- | ---: | ---: | --- |
| `species-assets/` | 273 | ca. 188,4 MB | produktiv, behalten |
| `local-tools/` | 3 | ca. 291 MB | lokales FFmpeg-Paket, ignoriert, fuer Spektrogramme nuetzlich |
| `Testlauf/` | 983 | ca. 31,5 MB | alter Browser-/Screenshot-/Cache-Testlauf, Bereinigungskandidat |
| `species-explorer/backups/` | 15 | ca. 0,13 MB | normale species-list-Sicherungen, unter Retention-Grenze |
| `species-explorer/logs/` | 21 | ca. 0,09 MB | lokale Prozesslogs, klein, optional mit Retention automatisieren |
| `species-explorer/pipeline-asset-backups/` | 4 | ca. 0,53 MB | alter temporaerer Suchlauf-Backup, Bereinigungskandidat |
| `species-explorer/staging/` | 0 | 0 MB | leer |
| `species-explorer/asset-backups/` | 0 | 0 MB | leer |

## Bereinigungskandidaten

Diese Punkte sind aus technischer Sicht loeschbar oder bereinigbar, sollten aber erst nach Felix' Freigabe entfernt
werden:

1. `Testlauf/`
   - enthaelt alte Edge-Cache-Ordner und Screenshots vom Explorer-Layout-Test
   - ist ignoriert und laut Arbeitsregel nur fuer temporaere Testlaeufe gedacht

2. `errors.log`
   - ignorierte Altdatei mit alten Pipeline-/Suchfehlern aus Mai/Juni
   - aktueller Betrieb nutzt Explorer-Logs unter `species-explorer/logs/`

3. `species-explorer/pipeline-asset-backups/`
   - enthaelt einen alten temporaeren Backup-Lauf
   - sollte nur waehrend einer laufenden Assetentscheidung gebraucht werden

4. `species-explorer/logs/`
   - keine akute Groessenlast
   - mittelfristig sinnvoll: automatische Retention fuer alte Pipeline-Logs

## Struktur- und Refactoring-Kandidaten

Diese Punkte sind keine Fehler, aber sinnvoll vor oder waehrend Phase 7.10 zu klaeren:

1. `node-fetch` pruefen und kontrolliert entfernen oder ersetzen
   - `npm.cmd ls --depth=0` zeigt `node-fetch` als Dependency
   - Kandidat fuer kontrollierte Entfernung mit Testlauf und Commit
   - falls noch Codepfade darauf verweisen, auf natives Node-`fetch` umstellen oder Dependency behalten

2. Lokales FFmpeg behandeln
   - `local-tools/ffmpeg` ist korrekt ignoriert, aber mit ca. 291 MB gross
   - fuer einen zweiten Rechner muss entschieden werden:
     - FFmpeg als lokale Voraussetzung dokumentieren
     - FFmpeg in einen Installer aufnehmen
     - oder FFmpeg nicht mit dem Projekt synchronisieren

3. Batch-Dateien
   - `update_local.bat` und `update_github_only.bat` sind bewusst ignorierte lokale Workflow-Dateien
   - fuer Mehrgeraete-Betrieb waere ein dokumentiertes Beispiel oder ein App-/Installer-Workflow sauberer als
     Kopieren individueller Batch-Dateien

4. Temporaere Pipeline-Backups automatischer aufraeumen
   - aktuell bleiben alte `pipeline-asset-backups` nach abgeschlossenen Laeufen liegen
   - vor Mehrgeraete-Betrieb sollte klar sein, wann diese Ordner automatisch geloescht werden

5. Installer/Portable Paket erst nach 7.10
   - sinnvoll, aber erst nachdem NAS, Locking, Backup und Restore geklaert sind

## Nicht anfassen

Diese Bereiche sind produktiv oder bewusst lokal:

- `species-assets/`
- `speciesData.json`
- `species_list.json`
- `fehlende_elemente_report.json`
- `species-assets-overrides.json`
- `species-explorer/backups/` unter aktueller Retention-Grenze
- `node_modules/`
- `local-tools/ffmpeg`, solange kein alternatives FFmpeg-Konzept beschlossen ist

## Empfehlung vor Phase 7.10

Empfohlene Reihenfolge aus dem Audit:

1. Lokale Bereinigung nach Freigabe:
   - `Testlauf/`
   - `errors.log`
   - `species-explorer/pipeline-asset-backups/`
2. Kleine Dependency-Bereinigung:
   - `node-fetch` kontrolliert entfernen, wenn Tests weiterhin gruen bleiben
3. Phase 7.10 planen:
   - Ein-Rechner-Hauptworkflow vs. Zwei-Rechner-Arbeit
   - NAS als Backup, Mirror oder aktive Arbeitsbasis
   - Bearbeitungs-Lock
   - Backup-Zeitplan
   - dokumentierter Restore-Test

## Umgesetzte Bereinigung am 2026-06-28

Nach Felix' Freigabe wurden die drei lokalen Altlasten entfernt:

- `Testlauf/`
- `errors.log`
- `species-explorer/pipeline-asset-backups/`

Die Pfade wurden vor dem Loeschen jeweils auf `D:\IUCN_Datenbank` aufgeloest und gegen den Workspace-Pfad
geprueft. Es wurden nur diese freigegebenen, ignorierten Ziele geloescht.

Zusaetzlich wurde `node-fetch` kontrolliert entfernt und die Pipeline auf natives Node-`fetch` umgestellt:

- `npm.cmd uninstall node-fetch` entfernte `node-fetch` und seine indirekten Pakete aus `package.json`,
  `package-lock.json` und `node_modules`.
- Danach zeigte ein Pipeline-Test, dass `update.mjs` noch einen direkten Top-Level-Import `node-fetch` enthielt.
- `update.mjs` nutzt seitdem natives `globalThis.fetch` und meldet verstaendlich, wenn Node.js aelter als Version 18
  ist.
- `npm.cmd ls --depth=0` zeigt danach nur noch `electron` als Dev-Dependency.

Nach der Bereinigung erfolgreich geprueft:

- `npm.cmd run --silent test:explorer`
- Syntaxpruefung aller 23 JS-/MJS-Dateien
- `npm.cmd run --silent audit:site -- --skip-live --skip-pages`

Offen bleiben bewusst:

- `local-tools/ffmpeg`, bis das FFmpeg-/Installer-Konzept fuer weitere Rechner entschieden ist
- `species-explorer/logs/`, weil es klein ist und spaeter per Retention geregelt werden soll
- `species-explorer/backups/`, weil die Dateien zur bestehenden Backup-Retention gehoeren

## Fazit

Es gibt keinen kritischen Blocker fuer Phase 7.10. Der Projektzustand ist konsistent. Vor der NAS-/Mehrgeraete-Stufe
wurden die lokalen Altlasten bereinigt und die Pipeline von `node-fetch` auf natives Node-`fetch` umgestellt. Die
naechsten offenen Strukturfragen betreffen FFmpeg-/Installer-Konzept, Log-/Temp-Retention und das
Mehrgeraete-/Backup-Modell.
