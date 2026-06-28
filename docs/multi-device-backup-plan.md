# Phase 7.9 - Mehrgeraete, Git-Update, Locking und NAS-Backup

Stand: 2026-06-28

## Ziel

Die lokale Arten-Explorer-App soll auf mehreren Windows-Rechnern nutzbar sein, ohne dass Daten verloren gehen oder
parallele Bearbeitungen einander ueberschreiben. GitHub bleibt die zentrale versionierte Wahrheit. Das NAS wird als
vollstaendiges Restore-Backup genutzt, nicht als aktive Arbeitskopie.

## Grundentscheidung

```text
GitHub main
  = zentrale Wahrheit fuer versionierte Projektdateien

Lokaler Projektordner je PC
  = aktive Arbeitskopie und einzige Stelle, an der die App Dateien bearbeitet

GitHub app-lock Branch
  = technischer Bearbeitungsstatus

NAS
  = komprimierte Restore-Backups, nicht aktive Arbeitskopie
```

Der lokale Projektordner ist pfadunabhaengig. PC 1 kann z. B. `D:\IUCN_Datenbank` verwenden, PC 2 kann einen anderen
Pfad nutzen. Alle App-Funktionen muessen relativ zum jeweiligen Repo-Root arbeiten.

## 1. Mehr-PC-Arbeitsmodell

Bearbeitet wird nie direkt "auf Git" und nie direkt auf dem NAS. Die App schreibt lokale Projektdateien, danach wird
automatisch committed und nach GitHub gepusht.

Normaler Ablauf:

1. App startet im lokalen Projektordner.
2. App prueft den GitHub-Stand.
3. Wenn GitHub neuer und lokal sauber ist, aktualisiert die App automatisch.
4. Bearbeitungsmodus ist nur erlaubt, wenn:
   - lokaler Stand aktuell ist
   - kein anderer aktiver Lock existiert
   - keine ungeklaerten lokalen Aenderungen vorliegen
5. Speichern, Pipeline, Assetpflege und Portraitpflege schreiben lokal.
6. Die App committed und pusht die Aenderungen.
7. Andere Rechner aktualisieren automatisch oder bleiben im Lesemodus, bis der Stand geklaert ist.

## 2. NAS-Rolle

Startvariante:

```text
NAS = Backup-Ziel
```

Regeln:

- Backup als ZIP
- maximal 10 Backups
- taeglich bei Aenderungen
- mindestens einmal woechentlich bei Aenderungen
- kein neues Backup, wenn sich seit dem letzten Backup nichts geaendert hat
- Backup ist ablehnbar
- Standard-Zielpfad: `W:\Website Datenbank Backup`
- der Pfad bleibt per Parameter oder Umgebungsvariable `IUCN_NAS_BACKUP_DIR` ueberschreibbar

Die App soll nach relevanten Aenderungen oder beim Schliessen vorschlagen:

```text
Projektstand auf NAS sichern?
[Jetzt sichern] [Spaeter] [Heute nicht mehr fragen]
```

## 3. Bearbeitungs-Lock

Der Lock liegt nicht in `main`, sondern in einem separaten GitHub-Branch:

```text
Branch: app-lock
Datei: edit-lock.json
```

Beispiel:

```json
{
  "version": 1,
  "holder": "FELIX-PC",
  "user": "Felix",
  "repoPath": "D:\\IUCN_Datenbank",
  "sessionId": "8f5f2f30-4b2e-4b59-9f47-000000000000",
  "repoHead": "3880eea33a7664f0c17967eeb5a63dd4b91b5120",
  "acquiredAt": "2026-06-28T10:00:00.000Z",
  "lastHeartbeatAt": "2026-06-28T10:03:00.000Z",
  "expiresAt": "2026-06-28T10:08:00.000Z"
}
```

Regeln:

- Lock wird beim Wechsel in den Bearbeitungsmodus gesetzt.
- Heartbeat verlaengert den Lock regelmaessig.
- Beim Wechsel zurueck in den Lesemodus oder beim Schliessen wird der Lock geloescht.
- Wenn die App abstuerzt, laeuft der Lock automatisch ab.
- Ein fremder aktiver Lock blockiert den Bearbeitungsmodus und zeigt Rechner/User/Alter an.

## 4. Automatische Aktualisierung

Die App soll keine Kommandozeile verlangen. Beim Start und beim Wechsel in den Bearbeitungsmodus wird der Projektstand
geprueft.

Sichere automatische Faelle:

| Zustand | App-Verhalten |
| --- | --- |
| Lokal sauber, GitHub neuer | automatisch `git fetch` und `git pull --ff-only`, danach App neu laden |
| Lokal aktuell | Bearbeitungsmodus erlauben, wenn Lock frei |
| Lokaler Commit noch nicht gepusht | Push anbieten und nach Bestaetigung automatisch ausfuehren |

Nicht automatisch ueberschreiben:

| Zustand | App-Verhalten |
| --- | --- |
| Lokale uncommitted Aenderungen | Loesungsauswahl in der App anzeigen |
| Lokaler und GitHub-Stand divergieren | Loesungsauswahl in der App anzeigen, kein automatischer Merge |

Loesungsvorschlaege fuer unklare Faelle:

```text
[Aenderungen veroeffentlichen]
[Lokalen Stand sichern und GitHub-Stand uebernehmen]
[Nur Lesemodus]
```

Fortschritt wird als Prozessschritte angezeigt:

```text
10% Pruefe lokalen Stand
30% Hole GitHub-Stand
60% Aktualisiere Projektdateien
85% Pruefe Datenmodell
100% Aktualisierung abgeschlossen
```

Wenn Git echte Prozentwerte ausgibt, koennen sie zusaetzlich angezeigt werden.

## 5. Vollstaendiges NAS-Restore-Backup

Das NAS-Backup soll im Fehlerfall sofort nutzbar sein. Es soll deshalb deutlich mehr enthalten als GitHub.

In das ZIP gehoeren:

- versionierte Projektdateien
- `.git`
- `species-assets/`
- `species-explorer/backups/`
- `local-tools/ffmpeg/`
- `node_modules/`
- lokale Startgrundlagen
- `package.json`
- `package-lock.json`
- `restore-start.cmd`
- `backup-manifest.json`

Nicht in das ZIP gehoeren:

- `Testlauf/`
- `species-explorer/staging/`
- `species-explorer/pipeline-asset-backups/`
- alte Logs ausserhalb einer spaeteren Retention-Regel
- Secrets/Tokens aus `.env` oder Betriebssystem-Umgebungsvariablen

Beispiel-Dateiname:

```text
IUCN_Datenbank_2026-06-28_0945_3880eea.zip
```

`backup-manifest.json` soll enthalten:

```json
{
  "createdAt": "2026-06-28T09:45:00.000+02:00",
  "sourcePath": "D:\\IUCN_Datenbank",
  "gitCommit": "3880eea33a7664f0c17967eeb5a63dd4b91b5120",
  "nodeVersion": "v24.12.0",
  "includesNodeModules": true,
  "includesFfmpeg": true,
  "speciesCount": 48
}
```

## Restore-Ablauf

Ziel: keine Kommandozeile.

1. ZIP vom NAS entpacken.
2. `restore-start.cmd` doppelklicken.
3. Das Skript prueft Node.js 18+.
4. Falls `node_modules` fehlt, bietet es `npm.cmd install` an.
5. Es erzeugt die Desktop-Verknuepfung.
6. Es startet die App.

Wenn Node.js fehlt, zeigt das Skript eine klare Meldung. Node.js wird nicht automatisch installiert.

## Umsetzungsetappen

1. Plan und Restore-Startgrundlage dokumentieren.
2. Projektstatus-/Git-Update-Pruefung im Server ergaenzen.
3. Update-Dialog mit Fortschritt in die App einbauen.
4. Bearbeitungs-Lock ueber `app-lock` Branch einbauen.
5. NAS-Backup-Konfiguration und ZIP-Erzeugung einbauen.
6. Backup-Rotation auf maximal 10 ZIPs einbauen.
7. Restore-Test dokumentieren.
8. Danach Installer/zweiter-PC-Komfort klaeren.

## Noch offen vor der Backup-Implementierung

- gewuenschter Anzeigename fuer den lokalen Rechner/User im Lock
- ob `species-explorer/logs/` spaeter teilweise in das ZIP soll oder per Retention klein gehalten wird

## Technischer Backup-Kern seit 2026-06-28

Der erste Backup-Kern ist als PowerShell-Skript vorhanden:

```bash
npm.cmd run backup:nas:dry-run
npm.cmd run backup:nas
```

Standardziel ist `W:\Website Datenbank Backup`. Das Ziel kann ueberschrieben werden:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/nas-backup.ps1 -BackupRoot "W:\Website Datenbank Backup"
```

Das Skript:

- erstellt ZIP-Dateien mit Namen `IUCN_Datenbank_<Datum>_<Uhrzeit>_<Commit>.zip`
- schreibt `backup-manifest.json` in das ZIP
- nimmt `.git`, `node_modules`, `local-tools/ffmpeg`, Assets und Projektdateien auf
- schliesst `Testlauf`, `species-explorer/staging`, `species-explorer/pipeline-asset-backups` und
  `species-explorer/logs` aus
- ueberspringt ein Backup, wenn letzter Backup-Manifest-Stand und aktueller Git-/Arbeitsbaum-Status identisch sind
- entfernt nach erfolgreichem Backup alte ZIPs oberhalb der Grenze von 10
- bietet mit `-DryRun` eine Vorschau ohne Schreiben oder Loeschen

Die App-UI fuer Rueckfrage, Fortschritt und automatischen Start ist noch offen.
