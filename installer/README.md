# Windows-11-Paketierung

Stand: 31. Oktober 2026. Implementierter lokaler Paketbau und geprüfte Dateieinrichtung,
noch keine Abnahme auf einem frisch eingerichteten Windows-PC.

Der Setupstarter und der Appstarter sind native x64-Windows-Programme mit dem angenommenen
Arten-Explorer-Symbol. Gebaut wird mit dem bereits vorhandenen .NET-Framework-Compiler;
es wird kein zusätzliches Installerframework installiert. Der Setup benötigt keine eigenen
Administratorrechte und verändert weder den System-PATH noch vorhandene Node-, Git-, Adobe-
oder Explorer-Installationen. Jeder Windows-Benutzer besitzt seine eigene Geräteinstallation.
Die verwendete .NET-Framework-Laufzeit gehört zum normalen Windows-11-Bestand;
[Microsoft beschreibt die enthaltenen Versionen](https://learn.microsoft.com/en-us/dotnet/framework/install/on-windows-10).

## Ordner und Integration

Standardbasis: `%LOCALAPPDATA%\Programs\FN Wildlife Travel\Arten-Explorer`.
Der Setup lässt einen anderen absoluten Ordner zu, übernimmt aber keinen unbekannten vorhandenen Bestand.
Insbesondere wird `D:\Arten-Explorer` weder automatisch ausgewählt noch migriert.

| Pfad unter der Installationsbasis | Bedeutung |
| --- | --- |
| `program/Arten-Explorer.exe` | Nativer Starter mit dem korrekten Logo |
| `program/install-engine.mjs` | Dateieinrichtung und datenerhaltende Deinstallation |
| `program/maintain.ps1` | Bewusst gestartete Windows-Deinstallation |
| `installation.json` | Gebundener Paket-/Eigentumsnachweis; keine Anmeldedaten |
| `workspace/` | Vollständige beschreibbare Projektkopie mit bisherigen relativen Quellen-/Frontendpfaden |
| `workspace/runtime/node/node.exe` | Gebundene eigenständige Node-Laufzeit für Lightroom und Hilfsprozesse |
| `workspace/runtime/git/cmd/git.exe` | Gebündeltes MinGit als Rückfall; kein eingerichteter Benutzerzugang |
| `workspace/node_modules/electron/dist/` | Gebundene Electron-Laufzeit mit Original-Lizenzbeilagen |
| `workspace/local-tools/ffmpeg/bin/` | FFmpeg und FFprobe; FFplay wird nicht mitgeliefert |
| `workspace/lightroom-plugin/FNWildlifeTaxonomy.lrplugin/` | Bereitgestelltes Lightroom-Plug-in |
| `workspace/data/` | Künftige private Arbeitsdaten; kein heutiger Bestand wird mitgeliefert |
| `workspace/installer-runtime.json` | Lokale Bindung mit `workspaceRoot`, `nodePath`, `gitPath`, `launcherPath` |

Der Appstarter führt Electron mit dem Hauptmodul aus `workspace/species-explorer/desktop/main.mjs`
und diesem Arbeitsverzeichnis aus. Die vorhandene Modul-/Dateistruktur bleibt erhalten;
ein ausschließlich schreibgeschütztes `app.asar` wird nicht als Ersatz für das Projekt ausgegeben.
Nur im gestarteten Prozess wird die Node-Laufzeit dem PATH vorangestellt und MinGit als
Rückfall angefügt. Bereits funktionierende Git-Zugänge bleiben damit bevorzugt. Der Starter setzt
`FN_EXPLORER_INSTALLED=1` und `FN_EXPLORER_INSTALL_ROOT`, erzwingt aber keinen Datenpfad über
eine gültige spätere `storage-path.json` hinweg.

Das öffentliche Git-HEAD wird als eigenständig prüfbarer flacher Objektbestand exportiert.
Entwicklerkonfiguration, Zugangsdaten, Hooks, Reflogs und ältere Geschichte werden nicht kopiert.
Bei einem Prüfpaket kommen aktuelle Quelländerungen als sichtbare Arbeitsänderungen hinzu.
Eine Programmaktualisierung erhält den bisherigen Git-Arbeitsstand. Der spätere fachliche Abgleich
mit dem gemeinsamen Dienst beziehungsweise dem veröffentlichten Projektstand ist eine eigene
Aufgabe; der Installer führt keinen versteckten Pull, Commit oder Push aus.

Die Integrationspunkte für die Hauptanwendung sind:

- Lightroom sucht zunächst `runtime/node/node.exe` im Projekt; bestehende Suchwege bleiben erhalten.
- Der installierte Lightroom-Korrekturrückweg verwendet den gebundenen `launcherPath` statt den
  nativen Starter über einen direkten Electron-Aufruf zu umgehen.
- Ein neuer Gerätebestand zeigt fehlende Dienstverbindung, Anmeldung und private Referenzdaten
  ehrlich an. Die lokale Installation allein ist keine Anmeldung am gemeinsamen Projekt.
- Das Plug-in wird im Lightroom-Zusatzmodulmanager bewusst hinzugefügt. Adobe-Präferenzen und
  Lightroom selbst werden nicht automatisch verändert oder installiert.

## Installieren, aktualisieren und entfernen

Der Setup prüft vor dem Kopieren alle Paketdateien gegen Größe und SHA-256. Quellen und Ziele mit
Verzeichnisverknüpfungen, mehrdeutigen Windows-Dateinamen oder Pfadüberschreitungen werden abgewiesen.
Ein bereits laufender nativer Appstarter oder eine bestehende Installersperre stoppt die Einrichtung.
Anfangsinhalte werden nur im neuen Bestand angelegt. Private Datenbanken, Anmeldungen, `.env`,
`storage-path.json`, lokale Einstellungen und aktuelle private Belege sind vom Paket ausgeschlossen.

Bei Update und Reparatur werden ausschließlich gebundene Programmdateien ersetzt, die noch dem
bisherigen Paket entsprechen. Fachliche Arten-/Assetdateien und Git-Metadaten bleiben erhalten.
Abweichende Programmdateien stoppen das Update vor dem ersten Kopieren. Fehlende Programmdateien
werden wiederhergestellt; gelöschte Fachinhalte werden nicht erfunden. Reparatur verlangt dasselbe
Paketmanifest, nicht lediglich denselben sichtbaren Versionsnamen. Entfallene unveränderte
Programmdateien werden entfernt, eigene Änderungen an Altdateien erhalten.

Die Einrichtung hält ersetzte Programmdateien bis zum erfolgreichen Abschluss in einer eigenen
Transaktion vor. Ein behandelter Kopierfehler nimmt die Dateischritte zurück. Nach Prozessabbruch
werden fremde oder ungeklärte Transaktionen nicht automatisch bereinigt; die Sperre bleibt zur Prüfung
erhalten. Ein Stromausfall-/Crash-Restore ist damit noch nicht nativ abgenommen.

Nach erfolgreicher bewusst gestarteter Einrichtung registriert der Setup das Programm nur für den
aktuellen Benutzer in Windows und im Startmenü. Eine Desktop-Verknüpfung ist optional. Vorhandene
Verknüpfungen zu einem anderen Explorer werden nicht überschrieben. Ein Fehler der nachgelagerten
Windows-Registrierung bleibt sichtbar; er macht aus bereits kopierten Dateien keinen bestätigten
Windows-Installationsabschluss.

Deinstallation entfernt die unveränderten setup-eigenen Starter und die eigene Windows-Registrierung.
Der **gesamte beschreibbare Projektordner einschließlich Daten, Einstellungen, Plug-in und Laufzeiten**
bleibt für Wiederaufnahme/Wiederherstellung erhalten. Eine erneute Installation an diesem gebundenen
Ort stellt die Starter wieder her. Der Installer bietet kein pauschales Löschen der Nutzerdaten an.

## Paketbau und Prüfungen

Auf dem vorhandenen Windows-x64-Entwicklungsrechner:

```powershell
node --test --test-isolation=none installer/install-engine.test.mjs
node installer/build.mjs --preview --output=D:/Arten-Explorer/data/website/checks/installer-implementation-20261031/package
```

Für ein Veröffentlichungspaket `--preview` weglassen; dafür muss der integrierte Git-Stand sauber sein.
Der Build lädt ausschließlich die in `dependencies.lock.json` gebundenen offiziellen Electron- und
MinGit-Archive mit Größenlimit und Hashprüfung. Node und FFmpeg/FFprobe werden nur aus den bereits
bytegenau nachgewiesenen Originalen kopiert. Auch ihre Lizenzbeilagen sind hashgebunden.
Alle Downloads und Arbeitskopien entstehen in einer eigenen `scripts/test-temp.mjs`-Sitzung und
werden nach dem Bau entfernt. Nur das fertige EXE, sein Dateimanifest und der Buildbericht bleiben
im ausdrücklich angegebenen Ausgabeverzeichnis erhalten. Das EXE ist derzeit nicht signiert.
Die gebundene MinGit-Distribution enthält auch Git Credential Manager mit Lizenzbeilage.
Dessen Vorhandensein richtet keine Anmeldung ein; kein Credential- oder Kontozugang wird vorausgesetzt.

Der tatsächliche Pakettest arbeitet ebenfalls ausschließlich in eigenen Testordnern:

```powershell
node installer/package-smoke.mjs --exe=<absoluter-Pfad-zum-Setup.exe> --report=<neuer-absoluter-Pruefbericht.json>
```

Er entpackt das kompilierte EXE mit dessen gesondertem `--extract-test`-Einstieg, prüft die wirklichen
Laufzeiten ohne GUI und führt echte Installations-, Update-, Reparatur- und Deinstallations-Dateifälle
mit synthetischen Änderungen aus. Er öffnet keine Explorer-/Adobe-/Browserfenster und registriert
keine realen Benutzerverknüpfungen oder Registryeinträge. Das Test-Flag ersetzt ausschließlich diese
native Registrierung; die Kopier-/Hash-/Erhaltungslogik ist die tatsächliche Installationslogik.
Zusätzlich werden alle sieben Bildgrößen des angenommenen ICO bytegenau mit den tatsächlich
eingebetteten Windows-Iconressourcen von Setup und Appstarter verglichen; dies benötigt keinen Desktop.

## Herkunft und verbleibende Abnahme

Gebundene Stände: Node **24.22.1**, Electron **42.11.18**, MinGit **2.56.0.windows.4**,
FFmpeg/FFprobe **8.1.1**. Electron bringt Node **24.19.0** eingebettet mit. npm und Fengari werden
als Entwicklungs-/Abhängigkeitsinstallationswerkzeuge nicht zusätzlich mitgeliefert; die benötigten
Endanwender-Laufzeiten liegen bereits vollständig vor. Eine lokale KI-Modellauswahl oder mehrere
Gigabyte Modellbeigaben gehören nicht in diesen Pflichtinstaller.

Primärquellen: [Node-Prüfsummen](https://nodejs.org/dist/v24.22.1/SHASUMS256.txt),
[Electron-Release](https://github.com/electron/electron/releases/tag/v42.11.18),
[Git-für-Windows-Release](https://github.com/git-for-windows/git/releases/tag/v2.56.0.windows.4),
[FFmpeg-Anbieterrelease](https://github.com/GyanD/codexffmpeg/releases/tag/8.1.1),
[Electron-Paketierung](https://www.electronjs.org/docs/latest/tutorial/application-distribution).
Der Paketbau nutzt Original-Lizenzbeilagen; dies ist keine rechtliche Vertriebsfreigabe.

Vor Übergabe als regulär abgenommenes Paket bleiben separat nachzuweisen:

- tatsächliche Windows-/Startmenü-/Deinstallationsbedienung und erste Starts auf einem frischen
  vorgesehenen Windows-11-PC; ARM64 wurde nicht als Ziel umgesetzt;
- erste Dienstanmeldung und freigegebener privater Datenbezug, Git-Anmeldung sowie reguläre
  Lightroom-Plug-in-Einrichtung auf dem zweiten Gerät;
- vollständige erforderliche Quell-/Lizenzbereitstellung der aktivierten GPL-Drittbibliotheken vor
  externer Weitergabe; ein Link auf den FFmpeg-Hauptquellstand allein bestätigt dies nicht;
- Schutzfälle mit tatsächlich laufenden Anwendungen, abgebrochener Windows-Einrichtung und
  Stromausfall. Die isolierten injizierten Fehler sind keine solche Geräteabnahme.

Die bisherigen privaten Build-/Prüfberichte stehen unter
`data/website/checks/installer-implementation-20261031*`. Sie enthalten ausdrücklich die jeweils
eingepackten Quellhashes und während des parallelen Entwicklungsbaus festgestellten Änderungen.
Ein älteres Prüfpaket wird durch spätere Quelländerungen nicht still zum aktuellen Release erklärt.
