# Audioformat-Prüfung und Bestandsmigration

Stand: 2026-07-12

## Ziel

Jede produktive Datei `species-assets/<SafeName>/sound.mp3` muss technisch eine MP3-Datei sein. Eine passende
Dateiendung allein reicht nicht aus. Die Prüfung gilt einheitlich für automatische Downloads, manuelle Uploads,
Wiederherstellungen und den vorhandenen Datenbestand.

## Ursache und Behebung

Der Repository-Audit vom 2026-07-11 fand zwölf WAV/PCM-Dateien, die von automatischen Quellen heruntergeladen und
ungeprüft als `sound.mp3` gespeichert worden waren. Der neue zentrale Inspektor `scripts/audio-format.mjs` erkennt
MP3 erst nach drei aufeinanderfolgenden gültigen MPEG-Audioframes. Dadurch werden zufällige MP3-Signaturen in
PCM-Nutzdaten nicht als gültiges MP3 akzeptiert.

`update.mjs` prüft jetzt Downloads aus Xeno-Canto, Wikimedia Commons und iNaturalist vor dem produktiven Schreiben.
Nicht passende Kandidaten werden verworfen und die Suche läuft mit der nächsten Quelle weiter. Der Explorer nutzt
denselben Inspektor für manuelle Uploads. Auch eine Asset-Wiederherstellung lehnt eine als `.mp3` benannte WAV- oder
unbekannte Datei ab, sodass alte lokale Sicherungen den Fehler nicht erneut einführen können.

## Prüf- und Migrationsbefehle

```powershell
npm.cmd run --silent test:audio
npm.cmd run --silent audio:check
npm.cmd run --silent audio:migrate
```

- `test:audio` prüft echte MP3-Frames, ID3-Vorspann, WAV und ungültige Daten.
- `audio:check` untersucht alle produktiven `sound.mp3` und beendet sich bei einem Formatfehler mit Fehlercode.
- `audio:migrate` erstellt zuerst eine lokale Sicherung, konvertiert WAV/PCM kontrolliert mit FFmpeg nach MP3,
  vergleicht die Dauer und ersetzt die Produktivdatei erst nach erfolgreicher Prüfung.

Die Migration kann außerdem direkt mit `node scripts/migrate-audio-assets.mjs --write` ausgeführt werden. Ohne
`--write` arbeitet das Skript nur als Vorschau. FFmpeg kann über `--ffmpeg=<Pfad>` angegeben werden.

## Migration vom 2026-07-12

Konvertiert wurden Bergfink, Blässhuhn, Blaukehlchen, Buntspecht, Eisvogel, Geoffroy-Klammeraffe, Graugans,
Kleiber, Kohlmeise, Papageientaucher, Reh und Waldkauz.

- vorher: 12 WAV/PCM-Dateien mit zusammen 153,84 MiB;
- nachher: 12 echte MP3-Dateien mit zusammen 13,72 MiB;
- eingespart: 140,12 MiB;
- maximale gemessene Dauerabweichung: rund 0,001 Sekunden;
- Ergebnis: 48 von 48 vorhandenen Tierstimmen sind technisch gültige MP3-Dateien.

Die Credits blieben inhaltlich unverändert. Für alle zwölf Arten wurden Spektrogramme und Sound-Hashes neu erzeugt.
Der Report wurde anschließend neu aufgebaut. Das kontrollierte Pages-Artefakt sank von rund 229,9 MiB auf
89,86 MiB.

Die ignorierte Rückfallsicherung liegt lokal unter
`species-explorer/backups/audio-format-migration-20260712T065740Z/`. Sie enthält Originalsounds, betroffene
Spektrogramme, das vorherige Override-Register und ein Hash-/Dauermanifest. Sie bleibt mindestens bis zum
erfolgreichen Commit, Pages-Deployment und praktischen Hörtest erhalten.

## Abschlussprüfung

Nach der Migration wurden erfolgreich ausgeführt:

- 4 Audioformat-Tests;
- 23 Explorer-Tests;
- Syntaxprüfung aller 28 getrackten JS-/MJS-Dateien;
- lokaler Gesamt-Audit ohne Live-/Pages-Netzprüfung;
- Report-Neuaufbau;
- Spektrogramm-Neuaufbau für alle zwölf migrierten Arten;
- kontrollierter Pages-Artefaktbau.

Die verpflichtende Formatprüfung und das anfängliche 120-MiB-Größenbudget wurden anschließend umgesetzt und sind
unter `docs/media-asset-validation.md` dokumentiert. Offen bleibt der vollständige GitHub-Pages-Quality-Job mit
Syntax-, Test- und Datenaudit.
