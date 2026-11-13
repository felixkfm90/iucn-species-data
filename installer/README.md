# Windows-11-Paketierung

Stand: 9. November 2026. Implementierter lokaler Paketbau und geprüfte Dateieinrichtung,
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
| `workspace/runtime/java/` | Gebundene Java-Laufzeit für die lokale Sprachprüfung |
| `workspace/runtime/languagetool/` | Geprüfter deutscher Sprachprüfkern einschließlich Wörterbüchern und Lizenzbeilagen |
| `workspace/node_modules/electron/dist/` | Gebundene Electron-Laufzeit mit Original-Lizenzbeilagen |
| `workspace/local-tools/ffmpeg/bin/` | FFmpeg und FFprobe; FFplay wird nicht mitgeliefert |
| `workspace/local-tools/ffmpeg/sources/` | Gebundene Medienquellen, Bauanweisungen und Paketversionen |
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
Prüfpaketkennungen enthalten zusätzlich einen Digest der tatsächlich kopierten Produkt-/Installerquellen
und des verwendeten Compilers. Zwei verschiedene Arbeitsstände unter demselben Git-HEAD erhalten
dadurch unterschiedliche Kennungen. Reparatur bleibt zusätzlich an den exakten Manifesthash gebunden.

Die Integrationspunkte für die Hauptanwendung sind:

- Lightroom sucht zunächst `runtime/node/node.exe` im Projekt; bestehende Suchwege bleiben erhalten.
- Der installierte Lightroom-Korrekturrückweg verwendet den gebundenen `launcherPath` statt den
  nativen Starter über einen direkten Electron-Aufruf zu umgehen.
- Ein neuer Gerätebestand zeigt fehlende Dienstverbindung, Anmeldung und private Referenzdaten
  ehrlich an. Die lokale Installation allein ist keine Anmeldung am gemeinsamen Projekt.
- Nach erfolgreicher Einrichtung kopiert **Lightroom-Pfad kopieren** den tatsächlich eingerichteten
  Plug-in-Ordnerpfad. In Lightroom Classic führt **Datei → Zusatzmodul-Manager → Hinzufügen** zur
  Ordnerauswahl. Lightroom Classic und seine Adobe-Anmeldung setzen eine eigene Installation voraus.

## Installieren, aktualisieren und entfernen

Der Setup prüft vor dem Kopieren alle Paketdateien gegen Größe und SHA-256. Quellen und Ziele mit
Verzeichnisverknüpfungen, mehrdeutigen Windows-Dateinamen oder Pfadüberschreitungen werden abgewiesen.
Ein bereits laufender nativer Appstarter oder eine bestehende Installersperre stoppt die Einrichtung.
Während der Einrichtung bleibt das Fenster bis zum Abschluss geöffnet. Das gilt auch für den
Schließknopf in der Titelleiste und Alt+F4.
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
oder fehlgeschlagener Rücknahme bleiben die Sicherungen und die Sperre zur Prüfung erhalten.
Eine offene Transaktion aus einem früheren Setup blockiert auch dann weitere Installationen,
Reparaturen und Deinstallationen, wenn die zugehörige Sperrdatei fehlt. Die Rücknahme einer gesperrten
Programmdatei und die Erkennung eines solchen älteren Ordners sind im isolierten Dateitest geprüft.
Die Wiederherstellung nach einem echten Stromausfall steht als Geräteabnahme aus.

Der Setup prüft vor der Dateieinrichtung die Windows-Registrierung und die gewünschten
Verknüpfungen. Zeigt ein Eintrag auf einen anderen Explorer, stoppt er vor dem Kopieren in den
Zielordner. Nach der Dateieinrichtung prüft er die Einträge erneut und registriert das Programm
für den aktuellen Benutzer im Startmenü und auf Wunsch auf dem Desktop. Scheitert diese letzte
Registrierung, zeigt der Setup den Fehler an und der Windows-Installationsabschluss bleibt offen.

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
Der Build lädt die in `dependencies.lock.json` gebundenen offiziellen Electron-, MinGit- und Java-Archive
sowie das im [Sprachprüfmodul](../species-explorer/language-check/README.md) gebundene LanguageTool-Archiv.
Liegt das gebundene LanguageTool-Originalarchiv bereits im Downloadordner der lokalen Sprachprüfung,
verwendet der Build diese Datei und protokolliert ihre Herkunft im Buildbericht.
Die Größe und der Hash jedes Archivs werden geprüft, bei LanguageTool zusätzlich der vollständige
entpackte Dateibaum. Der Installer übernimmt Node aus dem gebundenen Herstellerbezug.
FFmpeg und FFprobe stammen aus dem eigenen Windows-Prüfbau. Der Paketbau prüft die kopierten
Programme, Quellarchive, Bauanweisungen und Lizenzbeilagen gegen den Dependency-Lock.
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
Für FFmpeg gleicht die Probe den Inhalt des entpackten Setups mit dem Dependency-Lock ab.
In der isolierten Windows-Einrichtung prüft sie mit leerem System-PATH die reguläre Explorer-Auflösung
von FFmpeg und FFprobe, den Schnitt eines synthetischen MP3s und das gerenderte WebP-Spektrogramm.
Zusätzlich werden alle sieben Bildgrößen des angenommenen ICO bytegenau mit den tatsächlich
eingebetteten Windows-Iconressourcen von Setup und Appstarter verglichen; dies benötigt keinen Desktop.
Mit `--previous-exe=<absoluter-Pfad-zum-vorherigen-Setup.exe>` kann die Prüfung zusätzlich ein anhand
seines Buildberichts geprüftes Vorgängerpaket installieren und den Wechsel zum neuen Paket nachweisen. Die Probe vergleicht
die veränderten Programmbytes mit dem neuen Manifest und prüft den Erhalt eines eigenen Arteintrags,
privater Testdateien und des bisherigen Git-Standes. Sie startet Electron vor und nach dem Update
fensterlos und liest die tatsächlichen Laufzeitversionen. Die Testinstallation des Vorgängers wird
vor der anschließenden Erstinstallationsprobe abgebaut. Der Ablauf hält jeweils nur ein entpacktes
Paket und eine Testinstallation vor.

## Herkunft und verbleibende Abnahme

Gebundene Stände: Node **24.22.1**, Electron **45.2.3**, MinGit **2.56.0.windows.4**,
FFmpeg/FFprobe **8.1.1**, Temurin JRE **17.0.21+9** und LanguageTool **6.6**.
Electron bringt Node **24.22.2** eingebettet mit. npm und Fengari werden
als Entwicklungs-/Abhängigkeitsinstallationswerkzeuge nicht zusätzlich mitgeliefert; die benötigten
Endanwender-Laufzeiten liegen bereits vollständig vor. Eine lokale KI-Modellauswahl oder mehrere
Gigabyte Modellbeigaben gehören nicht in diesen Pflichtinstaller.

Primärquellen: [Node-Prüfsummen](https://nodejs.org/dist/v24.22.1/SHASUMS256.txt),
[Electron-Release](https://github.com/electron/electron/releases/tag/v45.2.3),
[Git-für-Windows-Release](https://github.com/git-for-windows/git/releases/tag/v2.56.0.windows.4),
[FFmpeg-Quellstand](https://github.com/FFmpeg/FFmpeg/commit/239f2c733de417201d7ad3b3b8b0d9b63285b2b1),
[Temurin-Anbieterrelease](https://github.com/adoptium/temurin17-binaries/releases/tag/jdk-17.0.21%2B9),
[gebundenes LanguageTool-Archiv](https://languagetool.org/download/LanguageTool-6.6.zip),
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

Der abschließende Nachlauf vom **1. November** liegt unter
`data/website/checks/installer-implementation-20261101/package-final/`.
Das tatsächlich gebaute private Prüfpaket `0.1.0-40a766a41acd-preview` enthält den veröffentlichten
Ausgangsstand plus die sichtbaren Arbeitsänderungen des neuen Bildtext-/Sicherungsanschlusses.
Alle **1603 Paketdateien** sind manifestgebunden; während des Baus änderte sich keine gebundene Quelle.
Das EXE umfasst **536.290.816 Bytes**, SHA-256
`0552bab637d49a2ad328e1383a0fbcaa3808b08437790d4b476dde1fa4791081`.
Alle **14 tatsächlichen Paketproben** bestehen, einschließlich beider vollständiger Iconressourcen,
Start der Laufzeiten, eigenständiger Git-Prüfung, Unicode-/Leerzeichenpfad, Reparatur, Update und
datenerhaltender Deinstallation. Eigene Prüffiles und Sitzung sind regulär entfernt.
Spätere Dokumentationsänderungen sind keine nachträgliche Änderung dieses gebundenen Pakets.
Auch die danach ergänzte gemeinsame Artenansicht mit Grunddaten-, Konflikt- und internem
Freigabeweg ist in diesem früheren Prüfpaket noch nicht enthalten. Ihre Quellen und lokale
Integration sind getrennt geprüft; ein neuer gebundener Paketbau und Gerätebetrieb bleiben nötig.
Es bleibt ein privates Prüfpaket ohne native Benutzerregistrierung oder frische Windows-Geräteabnahme.

Der neue gebundene Nachlauf vom **2. November** liegt unter
`data/website/checks/installer-implementation-20261031/windows-reader-20261102-30f82fd5/`.
Das private Paket **`0.1.0-1f4bc22bff9e-preview`** enthält **1.710 manifestgebundene Dateien**,
einschließlich der aktuellen gemeinsamen Art-/Konflikt-/Freigabewege, des Artseiteneditors und des
Windows-Anschlusses für normale Artdateien. Das Setup umfasst **537.095.168 Bytes**, SHA-256
`a1cf13763e950f25424d033ecbacabbad0f60664abb9a6a6edec0e6d7ead85a7`.
Während des Baus hat sich keine gebundene Produktquelle verändert.

Zunächst bestehen dieselben **14 tatsächlichen Paketproben**. Der ergänzte, vollständig wiederholte
Paketnachlauf besteht mit **16/16**: Zusätzlich importieren sowohl die mitgelieferte Node-Laufzeit
24.22.1 als auch Electrons tatsächlicher eingebetteter Node 24.19.0 den ausgelieferten Explorer samt
neuen Medienmodulen und legen ausschließlich eine eigene frische Schema-6-Testdatenbank an.
Beide Prüfungen laufen ohne Fenster; die bestehenden Icon-, Reparatur-, Update- und
datenerhaltenden Deinstallationsprüfungen bestehen ebenfalls. Alle eigenen Testinstallationen und
Sitzungen sind regulär entfernt. Der tatsächliche Benutzerbetrieb auf einem frischen Windows-PC,
die native Registrierung, Lightroom-Ladung und der NAS-/Zweitgeräteabgleich bleiben offen.

Das Paket ist ein privates Prüfpaket mit sichtbaren Arbeitsänderungen zum gebundenen Git-HEAD.
Der vollständige Projekt-Qualitätslauf wurde für diesen Paketnachlauf nicht erneut ausgeführt;
die betroffenen Funktionsserien und tatsächlichen Paketprüfungen sind getrennt belegt.
Der danach ergänzte Quellanschluss für Cache 4, Offlineauswahl, vollständige Quellen, CMS-Rücklesevertrag 2
und dessen Explorer-/Browsersteuerung ist in diesem älteren Paket nicht enthalten.

Der Prüfpaketbau vom **2. November** liegt unter
`data/website/checks/installer-implementation-20261031/windows-core-20261102-e876d79d/`.
Das Paket **`0.1.0-1f4bc22bff9e-35cf50a26ee0ea5a-preview`** enthält diese Ergänzungen und
**1.724 manifestgebundene Dateien**. Das EXE umfasst **537.177.600 Bytes**, SHA-256
`83a8796f25d427dc07d83f88d5043d50479b0f255b0795ad49914c52bc78a30c`.
Alle **1.248 Produktquellen und neun Installerquellen** sind an ihre tatsächlich kopierten Bytes
gebunden; keine gebundene Quelle änderte sich während des Baus. Auch das kompilierte Symbol stammt
aus dieser eingefrorenen Kopie. Der Quellsnapshot besitzt SHA-256
`35cf50a26ee0ea5a6c2707801032bf9474b47721cfecd872894659b63cddd687`.

Die **13/13 Installer-Verhaltenstests** und **18/18 tatsächlichen Paketproben** bestehen.
Die beiden neuen Paketproben laden die dynamische Artseiten-/Sicherungskette aus dem entpackten
Payload unter Node **24.22.1** und Electrons tatsächlichem Node **24.19.0**. Beide erhalten einen
synthetischen offenen Seitenentwurf samt Personenbindung über Schließen/Wiederöffnen des Cache 4,
prüfen dessen Normalmedientabellen/Fremdschlüssel und legen ein eigenes frisches Artseitenjournal an.
Der vollständige synthetische CMS-Rücklesevertrag akzeptiert passende Beobachtungen und verwirft
eine aktivierte Seite. Das ist keine tatsächliche CMS-Anlage oder Bestätigung einer veröffentlichungsreifen
Seite. Die bisherigen Laufzeit-, Icon-, Installations-, Reparatur-, Update- und Erhaltungsproben bestehen
ebenfalls. Eigene Prüfinstallationen und Sitzungen sind regulär entfernt.

Die anschließende Aktualisierung dieser Anleitung und der Roadmap ist bewusst nicht nachträglich
Bestandteil des gebauten Pakets. Auch die danach ergänzten objektiven Prüfungen widersprüchlicher
Sprachbefundarten und ihre konkrete Fehlermeldung sind darin noch nicht enthalten. Der versuchsweise
veränderte Sprachprompt wurde nach einer unzureichenden nativen Gegenprobe wieder zurückgenommen;
Einzelheiten stehen im [KI-Modulvertrag](../species-explorer/local-ai/README.md).
Der danach ergänzte gemeinsame Artanlageadapter samt atomarer Duplikat-/Personenprüfung und der
anschließende Oberflächen-/Recoveryanschluss sind ebenfalls noch nicht Bestandteil dieses gebundenen Prüfpakets.
Auch der anschließend ausgelagerte Fach-/Sound-/Einartkern liegt bislang nur im Quellstand vor.
Es bleibt ein **unsigniertes privates Prüfpaket**; die oben genannten
frischen Windows-/Lightroom-/Mehrgeräteabnahmen und die vollständige Hersteller-Quellbereitstellung
sind weiter offen. Die laufende Entwicklerinstallation, NAS-Dienst und Play-Version wurden nicht geändert.

Am **3. November** wurde der Quellstand einschließlich gemeinsamer Artvorschläge, normaler geschützter
Medienansicht und aktualisierter Artseitenkette als **`0.1.0-1f4bc22bff9e-e28acca1a9cfda27-preview`**
gebaut. Alle **19 Paketproben** bestehen. Beide gebündelten Node-Laufzeiten wechseln in einer
synthetischen Projektdatenbank beim Anwenden eines Artvorschlags von Schema 6 auf 7. Die bisherige
Leserfreigabe bleibt erhalten. Die Aktualisierung vom tatsächlichen Prüfpaket des Vortags schrieb
153 Dateien und erhielt einen geänderten Arteintrag, private Testdaten und den bisherigen Git-Stand.
Der Bau und die Prüfung stehen unter `data/website/checks/installer-implementation-20261031/windows-core-20261103/`.
Dieser Zwischenstand war der Ausgangspunkt für den anschließenden Einbau von Java und LanguageTool.

Das erweiterte Paket **`0.1.0-1f4bc22bff9e-19bde56e9f8be413-preview`** liegt unter
`data/website/checks/installer-implementation-20261031/windows-full-20261103/`. Das EXE umfasst
**833.329.664 Bytes**, SHA-256 `630d8457fa357773a88711171a5550ebe4def1283541d6009386f85bd6e86f64`.
Die **3.885 manifestgebundenen Dateien** enthalten den vollständigen Hersteller-Dateibaum der
Sprachprüfung. Alle **1.304 Produktquellen und neun Installerquellen** stimmen mit den kopierten Bytes
überein. Die persönliche Java-/LanguageTool-Einrichtung auf dem Entwicklungs-PC ist davon getrennt.

Der abschließende Testbericht `package-qualified-20261103.json` belegt **20/20 Paketproben**.
Das Upgrade vom Prüfpaket des 2. November schrieb 2.259 Dateien und erhielt den geänderten Arteintrag,
private Testbytes und den Git-Stand. Die frische isolierte Installation startete LanguageTool aus
Electrons eingebettetem Node mit dem enthaltenen Java und beendete den eigenen Prozess regulär.
Großschreibung von „vogel“, Komma vor „weil“ und die kurze Bildunterschrift ohne Schlusspunkt wurden
korrekt behandelt. Die erste Probe mit fest erwarteter Erstkorrektur scheiterte. LanguageTool markiert
„Vogeel“ als Tippfehler und schlägt „Vögel“ vor. Im Prüfsatz ist „Vogel“ die richtige Korrektur.
Der Abschlussbericht hält Erkennung und tatsächlichen Vorschlag getrennt fest. Die redaktionelle
Ergebnisqualität bleibt offen.
Der folgende Quellstand ergänzt die lokale Gegenprobe für doppelte Buchstaben. Die nächste
Paketprüfung erwartet „Vogel“ im Einzahlsatz und „Vögel“ im Mehrzahlsatz. Sie prüft auch das
Relativsatz-Komma in einer kurzen Beschriftung und den Genitiv ohne Komma. Das hier dokumentierte
EXE stammt aus dem vorherigen Quellstand.

Das aktuelle private Prüfpaket **`0.1.0-1f4bc22bff9e-6e0ee88674f4ffbd-preview`** liegt unter
`data/website/checks/installer-implementation-20261031/windows-current-20261103/`.
Es umfasst **833.354.752 Bytes** mit SHA-256
`882bc1960ce392513a42635192f81c7e5590a03d2b42d73dba93a3f2663cd0b0` und **3.885 gebundene Dateien**.
Während des Baus gab es keine Abweichung bei den 1.304 Produkt- und neun Installerquellen.
Der Bericht `package-qualified-current-20261103.json` bestätigt **21/21 Paketproben**. Die frische
Einrichtung unter einem Pfad mit Leerzeichen und Umlaut enthält das Lightroom-Plug-in **0.4.24.43**.
Die Suchhilfe antwortet mit der gebündelten Node-Laufzeit ohne System-PATH. Die Sprachprüfung besteht
die Einzahl-, Mehrzahl-, Großschreibungs- und Kommaproben einschließlich der kurzen Beschriftungen.
Das Update vom oben genannten Vorgänger schreibt 46 Dateien. Der geänderte Testarteintrag, private
Testdaten und der bisherige Git-Stand bleiben erhalten. Beide Testinstallationen sind entfernt.
Die tatsächliche Windows-Bedienung und das Laden in Lightroom Classic stehen für dieses Paket aus.

## Privates Prüfpaket mit Rücknahmeschutz

Der Vorgängerbau vom **9. November** liegt in
`data/website/checks/installer-implementation-20261031/windows-current-20261109-164105-d6ad27/`.
Paket **`0.1.0-58b6b5a11874-a241d9361d7f925b-preview`** enthält **3.922 manifestgebundene Dateien**.
Die Setup-EXE hat **810.571.264 Bytes** und SHA-256
`e42a74692223eb67e6752f458d89b4ccc695928a7fd0bd582636d629b100e4f1`.
Die Vorprüfung der Windows-Registrierung ist in diesem Paket enthalten. Der Baubeleg bindet den
Setupstarter und das Integrationsskript an die geprüften Quellbytes und weist keine Änderungen
der kopierten Quellen während des Baus aus.

**24/24 Paketproben** bestehen laut `package-qualified-20261109.json`. Die Erstinstallation
lief in einem neuen Pfad mit Leerzeichen und Umlaut. Das Update vom Paket des 4. November
meldet 60 Änderungen an Programmdateien. Eigene Artänderungen, private Testbytes und der
bisherige Git-Stand blieben erhalten. Beide Node-Laufzeiten prüften die Erweiterung
eines synthetischen gemeinsamen Bestands von Schema 6 auf 7 bei erhaltener Lesefreigabe.
Die enthaltenen Medienprogramme, die Sprachprüfung und der Lightroom-Suchhelfer antworteten
aus der isolierten Installation. Die Testinstallation und ihre Sitzung sind entfernt.
Die Vorprüfung ist separat mit simulierten Windows-Einträgen getestet. Die tatsächliche
Windows-Registrierung und das Laden des Plug-ins in Lightroom Classic gehören zur
Zielgeräteabnahme.

Der Bau vom **4. November** mit eigenem FFmpeg liegt in
`data/website/checks/installer-implementation-20261031/windows-ffmpeg-20261104-175351/`.
Paket **`0.1.0-1f4bc22bff9e-5c4b2707525fde86-preview`** enthält **3.912 manifestgebundene Dateien**.
Die Setup-EXE hat **808.903.680 Bytes** und SHA-256
`8ea27f5de4525e1d57b534df31885f589701b30662460c50015999fde9f47b06`.
Der Buildbericht bestätigt das hashgebundene lokale LanguageTool-Originalarchiv und unveränderte
Quellen während des Baus. Der Bericht `package-qualified-ffmpeg.json` dokumentiert **24/24 Paketproben**.
In der isolierten Installation erzeugten FFmpeg und FFprobe 8.1.1 einen MP3-Schnitt und ein WebP-Spektrogramm.
Der Lightroom-Suchhelfer zu Plug-in 0.4.24.43 und die gebündelte Sprachprüfung antworteten.
Das Update vom folgenden Vorgänger schrieb 59 Dateien und erhielt den geänderten Testarteintrag,
private Testbytes und den Git-Stand. Die native Windows-Registrierung und Lightroom-Ladung
auf dem vorgesehenen Zielgerät bleiben getrennte Abnahmen.

Der Vorgängerbau vom **3. November** liegt in
`data/website/checks/installer-implementation-20261031/windows-rollback-20261103/`.
Paket **`0.1.0-1f4bc22bff9e-90ecfd70cb8f39a5-preview`** enthält **3.888 manifestgebundene Dateien**.
Die Setup-EXE hat **833.397.248 Bytes** und SHA-256
`9695a2a649946f91812849d40ddd7371a08821831136d09e151e2cc3fd52c786`.
Während des Baus änderte sich keine gebundene Quelle. Der Herstellerabruf für LanguageTool
gelang im Nachlauf mit `node --use-system-ca installer/build.mjs --preview --output=<Zielordner>`.
Archivgrößen, Prüfsummen und der entpackte LanguageTool-Dateibaum wurden wie bisher geprüft.

**15/15 Installer-Tests** und **22/22 Paketproben** sind bestanden. Die Paketprobe umfasst das
Vorgängerupdate einschließlich Testdaten, Artenänderungen und Git-Stand sowie den Stopp bei
einer offenen alten Transaktion. Die Dateioperationen dieser Paketprobe verwendeten die
bytegleiche Quellfassung der Installationslogik. Zusätzlich wurde die aus der EXE entnommene
Fassung direkt importiert und bestätigte den Stopp für Installation, Reparatur und Deinstallation.
Die Testinstallationen wurden entfernt. Die native Windows-Registrierung und die Lightroom-Ladung
auf einem frischen Windows-PC bleiben getrennte Abnahmen.

## FFmpeg-Quellbeilage zum Setup

Für das Setup vom 9. November liegt im selben privaten Bauordner das ZIP
`Arten-Explorer-FFmpeg-Quellen-0.1.0-58b6b5a11874-a241d9361d7f925b-preview.zip`.
Es hat **31 Dateien**, **249.301.855 Bytes** und SHA-256
`8fc25ab843e0a2bcfe8d2c81ca345218cedc696d3545919ef85ce2149ab66a79`.
Die Beilage enthält die Quellen für FFmpeg, LAME, WebP, zlib, GCC, MinGW-CRT und winpthreads,
die gebundenen Signaturdateien, Bauanweisungen und Lizenztexte. `source-manifest.json` bindet
das genaue Setup, dessen Dateimanifest, beide FFmpeg-Programme und die Dateien der Quellbeilage.
Die Archive wurden aus den bereits geprüften Quellen übernommen. Alle gepackten Dateien wurden
aus dem ZIP in einer getrennten Sitzung zurückgelesen und gegen die Prüfsummen geprüft.

Der Baubefehl nimmt den Bericht eines bereits erstellten Setups entgegen. Setup und Dateimanifest
müssen danebenliegen. Er prüft deren Bytes sowie die für dieses Setup gebundenen FFmpeg-Dateien
und erstellt die Beilage separat. Vorhandene Archive werden nicht überschrieben.

```powershell
node installer/build.mjs --ffmpeg-source-for=<absoluter-Pfad-zum-build.json> --output=<absoluter-Ausgabeordner>
```

Die Beilage betrifft den eigenen FFmpeg-Bau. Die MinGit-Beilage wird separat erzeugt.

## MinGit-Quellbeilage zum Setup

Für dasselbe Setup vom 9. November liegt im privaten Bauordner auch das ZIP
`Arten-Explorer-MinGit-Quellen-0.1.0-58b6b5a11874-a241d9361d7f925b-preview.zip`.
Es hat **138 Dateien**, **718.814.713 Bytes** und SHA-256
`95585746a5dd077e95aeac5dde01ad07dcfdfe0b7f8855d78456cb7a1124fa4a`.
Alle **375** mitgelieferten MinGit-Dateien wurden gegen die Herkunftsnachweise verglichen.
Das ZIP enthält die **51** signierten Quellarchive einschließlich ihrer Signaturdateien,
die zugehörigen Schlüssel, historischen Verpackungseingaben und die Dateizuordnung.
`source-manifest.json` bindet das Setup, sein Manifest, den offiziellen MinGit-Bezug und
jede MinGit-Datei. Alle gepackten Dateien wurden aus dem ZIP zurückgelesen und geprüft.

```powershell
node installer/build.mjs --mingit-source-for=<absoluter-Pfad-zum-build.json> --output=<absoluter-Ausgabeordner>
```

Der Befehl verweigert die Ausgabe bei einem abweichenden Setup, einer abweichenden MinGit-Datei
oder fehlender Quellenzuordnung. Das ZIP dokumentiert die vorhandenen Herstellerquellen und
Paketrezepte. Ein eigener Nachbau von MinGit und die übrigen Quellen für die Weitergabe des
vollständigen Installers bleiben getrennte Arbeiten.

## Quellen für Node, Temurin, LanguageTool und Electron

Zum privaten Setup vom 9. November liegt `runtime-source-evidence-20261110/source-evidence.json`
im Bauordner. Der Nachweis bindet Setup und Dateimanifest per SHA-256. Die 17 heruntergeladenen
Quelldateien und Herstellerbelege umfassen rund 341 MB.

| Laufzeit im Setup | Geprüfter Herkunftsnachweis |
| --- | --- |
| Node **24.22.1** und Electrons Node-Basis **24.19.0** | Die beiden Quellarchive entsprechen den mit dem offiziellen Node-Schlüsselring geprüften Prüfsummenlisten. Die Liste für 24.22.1 bestätigt außerdem den Hash der eingebauten `node.exe`. [Node-Release](https://github.com/nodejs/node/releases/tag/v24.22.1) · [Herstellerschlüssel](https://github.com/nodejs/release-keys/tree/481637f813e912c4aa3622d7964ab426c97b8e8d) |
| Temurin **17.0.21+9** | Signiertes OpenJDK-Quellarchiv, Baurezept und Hersteller-SBOM liegen bei. Die Metadaten des Quellarchivs und der tatsächlich verwendeten Windows-x64-JRE nennen denselben OpenJDK-Commit und dasselbe Baurezept. Die Archivsignatur ist gegen den von Adoptium genannten Schlüssel geprüft. [Herstellerrelease](https://github.com/adoptium/temurin17-binaries/releases/tag/jdk-17.0.21%2B9) · [Signaturprüfung](https://adoptium.net/es/news/2022/07/gpg-signed-releases) |
| LanguageTool **6.6** | Quellbaum des Releases `f13e71a7` einschließlich des deutschen Sprachmoduls. `languagetool/jar-inventory.json` bindet alle **141** JAR-Dateien aus dem Original-ZIP an die Dateien des Setups. **99** enthalten eingebettete Maven-Metadaten. Die **42** übrigen Dateien sind im Folgepaket durch den unten beschriebenen Bytevergleich zugeordnet. [LanguageTool-Release](https://github.com/languagetool-org/languagetool/releases/tag/v6.6) |
| Electron **42.11.18** | Herstellerquellen einschließlich Electron-Patches, Chromium-Commit `bfe29217d60b6ee25ce4e4b2c0abcd6361ae6eb6` und Chromium-Abhängigkeitsdatei sind gebunden. Der vollständige Chromium-Quell- und Drittanbieterbaum steht separat aus. [Electron-Release](https://github.com/electron/electron/releases/tag/v42.11.18) · [Electron-Abhängigkeiten](https://raw.githubusercontent.com/electron/electron/v42.11.18/DEPS) |

## Unterstützter Electron-Folgestand

Der Hersteller führt Electron 42 außerhalb des Supports. Am 10. November wurde der offizielle
Windows-x64-Download von **Electron 45.2.3** gegen die Release-Prüfsumme geprüft. Die entpackte
Laufzeit meldet **Node 24.22.2** und **Chromium 156.0.8078.80**. Sie hat SQLite verwendet und den
Explorer-Servercode importiert. Zwei getrennte Electron-Prozesse haben synthetische Zugangsdaten
im eigenen Profil verschlüsselt geschrieben, gelesen und entfernt. Der private Nachweis heißt
`electron-45.2.3-candidate-credential-20261110.json`.

Das anschließend gebaute private Prüfpaket
**`0.1.0-58b6b5a11874-014f11b16f9f0b34-preview`** liegt in
`data/website/checks/installer-implementation-20261031/windows-electron45-20261110-1435/`.
Die Setup-EXE hat **819.359.232 Bytes**, **3.920 manifestgebundene Dateien** und SHA-256
`63ca72c7e536a7116a9b7269735da0beb85e1173209519e0f1c66389a61c5fed`.
Der Baubericht bestätigt unveränderte gebundene Quellen während des Baus. Die Entwicklungsabhängigkeit
und das Installer-Laufzeitarchiv sind jeweils exakt auf Electron 45.2.3 festgelegt.

**24/24 Paketproben** sind in `package-qualified-electron45-20261110.json` bestätigt. Das Update des
Prüfpakets vom 9. November schrieb 99 Dateien und wechselte von Electron 42.11.18 auf 45.2.3. Es
erhielt den geänderten Testarteintrag, private Testbytes und den Git-Stand. Die frische Testinstallation
bestand einschließlich SQLite, Medienverarbeitung, Lightroom-Suchhelfer und der gebündelten
Sprachprüfung. Die Testinstallation wurde entfernt. Die native Windows-/Lightroom-Abnahme auf
einem frischen Zielgerät und die Projektanmeldung bleiben offen. Die FFmpeg- und MinGit-Archive
oben sind an das Vorgänger-Setup gebunden. Der neue Buildbericht bindet dieselben Herstellerbytes
für diese Komponenten an das neue Setup.
Der erneute Abgleich des Setup-Hashs und der Dateiliste bestätigt auch die **141 LanguageTool-JARs**
bytegenau gegen das Original-ZIP und die vorhandene JAR-Inventarliste. Alle **42** Bibliotheken ohne
eingebettete Maven-Kennung stimmen bytegenau mit den jeweiligen Veröffentlichungen in Maven Central
überein. Der private Nachweis `languagetool-external-sources-20261110/evidence.json` im Bauordner bindet
42 Paketbeschreibungen und 39 angebotene Quellen-JARs. 37 enthalten Dateien außerhalb der Metadaten.
`grpc-context` enthält bereits im Binärpaket ausschließlich das Manifest. Für `grpc-netty-shaded`
liegen die gebundenen Quellbäume für gRPC Java, Netty, Netty-tcnative und BoringSSL sowie das
gRPC-Baurezept vor. Alle sieben eingebetteten nativen Dateien stimmen bytegenau mit den
veröffentlichten Netty-Artefakten überein. Für die Wörterbücher für Belarussisch, Krimtatarisch
und Ukrainisch fehlen die genauen Quellstände. Die Quellenabdeckung der übrigen Bibliotheken
und der vollständige Chromium-Quellbaum bleiben vor einer Weitergabe gesondert zu prüfen.
[Maven-Central-Suche](https://central.sonatype.org/search/rest-api-guide/) ·
[gRPC-Baurezept](https://github.com/grpc/grpc-java/blob/v1.68.0/netty/shaded/build.gradle) ·
[BoringSSL-Stand](https://boringssl.googlesource.com/boringssl/+/1b7fdbd9101dedc3e0aa3fcf4ff74eacddb34ecc)
[Electron 45.2.3](https://github.com/electron/electron/releases/tag/v45.2.3) ·
[Support-Zeiträume](https://releases.electronjs.org/schedule)

Die Quellenprüfung vom **12. November** bindet den Electron-Quellbaum von **45.2.3** an den
vorhandenen Setup-Hash. Im privaten Bauordner liegt der Beleg
`electron-runtime-sources-20261112/evidence.json`. Er enthält neun hashgebundene Quellen und
Herstellerdateien einschließlich des Electron-Quellarchivs mit 380 Patchdateien und des anhand
der signierten Herstellerprüfsummen bestätigten Node-Quellarchivs **24.22.2**. Für Chromium
**156.0.8078.80** sind Commit, Versionsdatei, Lizenzdatei und Abhängigkeitsliste belegt. Der
vollständige Chromium-Quellbaum mit den eingebundenen Drittanbieterständen bleibt offen.
[Electron-Abhängigkeiten](https://github.com/electron/electron/blob/d0a18d02058b21ff292e25d5f53f00bd120f2f61/DEPS) ·
[Chromium-Abhängigkeiten](https://chromium.googlesource.com/chromium/src/+/fb096c0011f9d50f0a264a9376420cdea9c421e3/DEPS) ·
[Node 24.22.2](https://github.com/nodejs/node/releases/tag/v24.22.2)

Für LanguageTool sind zusätzlich neun Ressourcendateien bytegleich den tatsächlich enthaltenen
Wörterbuch-JARs zugeordnet. Der Beleg `languagetool-dictionary-metadata-20261112/evidence.json`
im selben Bauordner bindet Belarussisch **1.0.2**, Ukrainisch **6.6.0** und Krimtatarisch **1.0.1**
an den Setup-Hash und die jeweiligen Herstellerdateien. Der Neubau der kompilierten Wörterbücher
aus den vollständigen Quellständen bleibt offen.
[Belarussische GrammarDB](https://github.com/Belarus/GrammarDB/tree/4db9594304f2d7e8802e9f23e3ebad84f3b33167/spell-languagetool) ·
[Ukrainisches Wörterbuch](https://github.com/brown-uk/dict_uk/tree/8eb833b901bb77798d6f37e213880db10c462c87/distr/morfologik-ukrainian) ·
[Krimtatarische Sprachressourcen](https://github.com/qirimca/languagetool/tree/4db239ebf49d18d4fb5625c322de855e0743a4fd/languagetool-language-modules/crh)

## Vorbereitete Beschaffung der Herstellerquellen

Die technische Quellenaufnahme vom **2. November** und der Abgleich vom **4. November**
grenzen die noch fehlenden Beilagen ein.
Binärdateien, Lizenztexte und die genannten Paketproben sind bereits gebunden; die folgende
Liste beschreibt zusätzliche Quellen-/Buildnachweise vor regulärer Weitergabe:

| Bereich | Konkret noch zu beschaffen oder aufzulösen |
| --- | --- |
| FFmpeg-Basis | Das Archiv zum vollständigen Hersteller-Commit ist geprüft und lokal abgelegt. Eventuelle abweichende Herstellerpatches und eingebundene Quellen bleiben aufzulösen. |
| Gyan Essentials | `ffmpeg.exe`, `ffprobe.exe`, Lizenz und README stimmen mit dem Hersteller-ZIP und dem Installer-Manifest überein. Elf in der Hersteller-README genannte Bibliotheksrevisionen sind lokal archiviert. Die genauen Bauanweisungen und weitere Bibliotheksrevisionen bleiben offen. |
| MinGit-Bestand | Die 67 Versionszeilen der gebundenen `runtime/git/etc/package-versions.txt` enthalten 65 eindeutige Einträge. Für die Zuordnung gelten diese Paketstände. |
| Git-Kern | Das Archiv zum Git-Tag `v2.56.0.windows.4` und das historische UCRT-Verpackungsrezept sind lokal abgelegt. Der Git-Archivexport und alle 14 zugehörigen Rezeptdateien stimmen mit den Herstellerprüfsummen überein. |
| Git Credential Manager | Die im Prüfpaket enthaltene Version `2.9.1-1` ist über das historische Rezept mit dem Hersteller-Quellarchiv verbunden. Die 51 ausführbaren Dateien, Bibliotheken und Konfigurationsdateien sowie `README.md`, `LICENSE` und `NOTICE` stimmen mit dem Paketmanifest überein. |
| Weitere MinGit-Komponenten | Alle 375 Dateien sind zugeordnet. Die Belege führen 62 Paketversionen und 51 signierte Quellarchive sowie die Eingaben und Erzeugungsschritte der MinGit-Paketierung. |

Ausgangspunkt sind der [gebundene Gyan-Release](https://github.com/GyanD/codexffmpeg/releases/tag/8.1.1)
und die [Hersteller-Buildseite](https://www.gyan.dev/ffmpeg/builds/). Das automatisch angebotene
Quellarchiv der Gyan-Supportablage ersetzt keinen vollständigen FFmpeg-/Bibliotheksquellbaum.
Für MinGit führen der [gebundene Release](https://github.com/git-for-windows/git/releases/tag/v2.56.0.windows.4)
und die [offiziellen Paketverwaltungsregeln](https://gitforwindows.org/package-management) zu den
Rezeptablagen. Die Zuordnung nutzt den historischen [Git-Paketstand](https://github.com/git-for-windows/MINGW-packages/commit/20a412e3b61c853fb3a290f02e78f59611d20342)
und das dazu passende [Credential-Manager-Rezept](https://github.com/git-for-windows/build-extra/blob/f6ae7ad327ce95acda72f4df41b263f71cf976c2/mingw-w64-git-credential-manager/PKGBUILD).
Die beiden privaten Prüfnachweise `git-core-recipe-verification.json` und `gcm-installer-binding.json`
liegen mit den Herstellerdateien in `data/website/checks/installer-provenance-20261031/mingit-2.56.0.4-20261104/`.
Für FFmpeg bleiben die eingebundenen Bibliotheksquellen und der genaue Hersteller-Baustand offen.

Die FFmpeg-Prüfung vom **4. November** bindet die vier Dateien an das Hersteller-ZIP
`ffmpeg-8.1.1-essentials_build.zip`. Beide Programme melden dieselben 58 Konfigurationsoptionen und
GCC 15.2.0 (MSYS2 Rev13). Die Quellarchive zu elf vom Hersteller genannten Git-Ständen sind lokal
gebunden, darunter libwebp, Opus, Vorbis, VPX und x265. Der signierte MSYS2-Quellcontainer bestätigt
das LAME-Basisarchiv **3.100** gegen sein Rezept. Die Gyan-Anpassungen für LAME sind offen.

Im FFmpeg-Binärprogramm steht **OpenAL Soft 1.25.1**. Die zugehörige veröffentlichte Basisquelle
ist abgelegt. Ob Gyan genau diesen Git-Stand oder zusätzliche Änderungen verwendet hat, bleibt offen.
Der private Beleg `ffmpeg-8.1.1-20261104/ffmpeg-installer-binding.json` enthält die Prüfwerte und
trennt die bestätigten Basisquellen vom weiterhin offenen vollständigen Gyan-Baurezept.
**35 lokale Medientests** zu Dekodierung, MP3-Schnitt, Spektrogrammen und Porträts sind bestanden.
[Gyan-Release](https://github.com/GyanD/codexffmpeg/releases/tag/8.1.1) ·
[LAME-Quellpaket](https://packages.msys2.org/packages/mingw-w64-ucrt-x86_64-lame) ·
[OpenAL Soft 1.25.1](https://github.com/kcat/openal-soft/releases/tag/1.25.1)

Ein eigener Windows-Prüfbau von **FFmpeg und FFprobe 8.1.1** ist mit der dokumentierten MSYS2-Umgebung,
den signierten WebP- und zlib-Quellen und statisch aus dem verifizierten Basisarchiv gebautem
LAME 3.100 abgeschlossen. Die beiden Programme importieren nur Windows-Systembibliotheken.
Die direkte Funktionsprobe und **64 lokale Medientests** mit dem Prüfbau sind bestanden. Rezepte,
Prüfergebnisse und Binärhashes liegen im privaten Beleg `ffmpeg-controlled-build-20261104/`.
Die Installer-Quellen übernehmen 25 hashgebundene Dateien aus diesem Stand. Die isolierte
Paketierungsprobe bestätigt beide Programme sowie die Quellarchive für FFmpeg, LAME, WebP und zlib,
Bauhinweise und Lizenztexte. Für GCC, MinGW CRT und winpthreads sind drei signierte Quellarchive
gegen die Rezeptprüfsummen von sechs signierten Binärpaketen geprüft und separat archiviert.
Das am 4. November gebaute und isoliert geprüfte Setup enthält ihre Lizenztexte und den Quellenbeleg.
Die Bereitstellung aller erforderlichen Quellen für eine Weitergabe und die Windows-Geräteabnahme
stehen separat aus.
[GCC-Paket](https://packages.msys2.org/packages/mingw-w64-ucrt-x86_64-gcc?repo=ucrt64) ·
[MinGW CRT](https://packages.msys2.org/packages/mingw-w64-ucrt-x86_64-crt) ·
[winpthreads](https://packages.msys2.org/packages/mingw-w64-ucrt-x86_64-winpthreads)

Der [historische Git-for-Windows-Paketrelease](https://github.com/git-for-windows/pacman-repo/releases/tag/2026-10-26T07-04-21.974091400Z)
liefert auch das offizielle Git-Quellpaket `mingw-w64-git-2.56.0.4-1.src.tar.gz` und die beiden
Dateiindizes für UCRT64 und x86_64. Alle drei Paketsignaturen sind gegen den dokumentierten
Herstellerschlüssel geprüft. Der enthaltene Git-Quellbaum hat dieselben 4.884 Einträge wie das
gebundene Tagarchiv. Bei 1.549 Dateien unterscheiden sich ausschließlich die Zeilenenden.
Alle 14 Rezeptdateien stimmen bytegenau mit der bereits geprüften Vorlage überein.

Alle 375 Dateien im MinGit-Abschnitt des Installer-Manifests stimmen bytegenau mit dem offiziellen
MinGit-ZIP überein. Die Zuordnung verwendet nur Indexeinträge mit exakt derselben Paketversion
und berücksichtigt die acht im MinGit-ZIP dokumentierten Pfadverschiebungen. Der private Beleg
`mingit-file-provenance.json` nennt je Datei die zugehörigen Indexpfade und mögliche Paketbesitzer.
Die Indexzuordnung belegt die Herkunft der Dateipfade. Für die 19 zugeordneten Paketversionen
liegen zwölf signierte Hersteller-Quellarchive vor, darunter Bash, curl, OpenSSH, die beiden
OpenSSL-Varianten und die MSYS2-Laufzeit. Der Nachweis verbindet die Pakete über die Prüfsummen
ihrer Binärarchive mit den historischen Herstellerreleases. Drei ältere Releaseeinträge enthalten
keine Prüfsumme. Dort wurde das jeweilige Binärarchiv heruntergeladen und direkt gegen den
signierten historischen Index geprüft. Die Quellarchive enthalten die passende Paketversion und
ihr jeweiliges Verpackungsrezept. Der private Nachweis `package-sources/source-coverage.json`
bindet die 203 Installerdateien, die Paketversionen und die zugehörigen Quellarchive.

Der Abgleich mit dem offiziellen MSYS2-Archiv ordnet weitere 159 Dateien über Pfad und identische
Bytes eindeutig 41 Binärpaketen zu. Die 44 dafür herangezogenen Binärarchive und die 37 zugehörigen
Quellarchive wurden mit dem dokumentierten MSYS2-Schlüsselbund geprüft. Die Prüfsumme des
Verpackungsrezepts im jeweiligen Quellarchiv stimmt mit der Bauinformation des Binärpakets überein.
Der private Nachweis `upstream-msys2/installer-source-coverage.json` verbindet diese Dateien mit
den geprüften Quellen und führt die gesondert zu prüfenden Verpackungsdateien einzeln.
[MSYS2-Archiv und Paketverwaltung](https://www.msys2.org/docs/package-management/)

Der Abgleich der letzten 13 Dateien bestätigt neun bytegleiche Eingaben im historischen
Git-for-Windows-SDK. Dazu gehört `getopt.exe`, das auch bytegleich im signierten `util-linux`-Paket
liegt. Die Zertifikatsdateien enthalten die entsprechenden 120 beziehungsweise 170 Zertifikate des
signierten Zertifikats-Basispakets. Für beide Pakete stimmt das Rezept im Quellarchiv mit der
Bauinformation des Binärpakets überein. Aus den Herstellerquellen beziehungsweise Paketindizes
wurden Lizenzdatei, Git-Konfiguration und Liste der acht verschobenen Befehle bytegleich
rekonstruiert. Die 65 eindeutigen Einträge der erzeugten Paketversionsliste sind durch die
historischen Indizes und die signierten MSYS2-Archive bestätigt. Der private Nachweis
`packaging-evidence/mingit-packaging-provenance.json` bindet alle 13 Dateien und ihre Eingaben.
Die Prüfung umfasst Signaturen, Dateivergleich und Quellenzuordnung. Ein vollständiger Nachbau
der Binärdateien und die Windows-/Lightroom-Geräteabnahme sind eigene Prüfungen.
[Historischer SDK-Stand](https://github.com/git-for-windows/git-sdk-64/tree/f77a9bb85f5114e1c4f52680e5da443ebb6161ec)

Die beiden offiziellen Basisarchive wurden am **3. November** auf Verzeichnispräfix, Bau- und
Lizenzdatei geprüft. Sie liegen privat in `data/website/checks/installer-provenance-20261031/`.

| Quelle | Archivdatei | Größe in Bytes | SHA-256 |
| --- | --- | ---: | --- |
| [FFmpeg 8.1.1](https://github.com/FFmpeg/FFmpeg/commit/239f2c733de417201d7ad3b3b8b0d9b63285b2b1) | `FFmpeg-239f2c733de417201d7ad3b3b8b0d9b63285b2b1.tar.gz` | 16.879.390 | `ec0aa20fb9f6fd3692ffc04dc12ffa43cfffc4a479e388ccd7910ec6cfe188a2` |
| [Git für Windows 2.56.0.windows.4](https://github.com/git-for-windows/git/commit/581291682ad5a238c08c93d1f5bd4518382a3230) | `git-for-windows-581291682ad5a238c08c93d1f5bd4518382a3230.tar.gz` | 12.877.769 | `b3c99008b16c26fedf21891d9ba26e4e462f62f0c07ee0672bfcba16fff85218` |
