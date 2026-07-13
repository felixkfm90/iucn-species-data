# Aufbewahrung temporärer Explorer-Dateien

Stand: 2026-07-13

`species-explorer/temp-retention.mjs` ist die zentrale Registry und Bereinigung für eindeutig verwaltete temporäre
Dateien. Fremde Dateien sowie wiederherstellbare Sicherungen werden nie pauschal gelöscht.

## Verwaltete Ablagen

| Ablage | Eigentümer und Inhalt | Erkennung | Lebenszyklus |
|---|---|---|---|
| `species-explorer/staging/` | Vorschauen und noch nicht übernommene Uploads | UUID plus freigegebene Dateiendung | nach 24 Stunden oder beim kontrollierten Schließen |
| `species-explorer/pipeline-asset-backups/` | temporäre Rücksicherung eines Pipeline-Laufs | UUID-Ordner | nach 24 Stunden oder beim kontrollierten Schließen |
| `species-explorer/cleanup-trash/` | Zwischenablage einer Artbereinigung | `cleanup-...`-Ordner | nach 24 Stunden oder beim kontrollierten Schließen |
| `Testlauf/chrome-map-test-*` | Altbestand verwalteter Karten-Browsertests | definierter Ordnername | nach 24 Stunden oder beim kontrollierten Schließen |

Beim Start und nach abgeschlossenen Pipeline-Läufen werden nur Einträge entfernt, deren Aufbewahrungsfrist von
24 Stunden abgelaufen ist. So löscht eine zweite Entwicklungsinstanz keine frische Vorschau einer möglicherweise
noch laufenden Instanz. Beim kontrollierten Schließen werden alle eindeutig registrierten Laufzeitreste best-effort
entfernt. Windows-Dateisperren werden mehrfach erneut versucht und als Fehler protokolliert, ohne fremde Daten
anzutasten.

## Bewusst nicht temporär

- `species-explorer/backups/`: verwaltete Sicherungen der Eingabeliste;
- `species-explorer/asset-backups/`: je Asset wiederherstellbare Sicherung;
- `species-explorer/logs/`: begrenzte Prozesshistorie;
- `Testlauf/nas-backup-dry/`: kontrolliertes Testziel des Backup-Prozesses;
- `node_modules/` und `local-tools/`: Bestandteil eines vollständig startfähigen NAS-Restores.

## Bedienung und Tests

```bash
npm.cmd run temp:check
npm.cmd run temp:cleanup
npm.cmd run test:temp
```

`temp:check` zeigt abgelaufene verwaltete Einträge nur als Vorschau. `temp:cleanup` entfernt ausschließlich diese
Einträge. Jede künftig ergänzte temporäre Ablage muss vor ihrer Einführung in der zentralen Registry
Eigentümerschaft, Namensgrenze, maximale Aufbewahrung, Bereinigungszeitpunkte, Sperrverhalten und automatisierte
Tests festlegen.
