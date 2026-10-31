# Gemeinsamer Dienst auf dem NAS

Stand: 31. Oktober 2026. Vorbereitete Einrichtung für die bestätigte Synology DS923+
mit DSM 7.4.1, 32 GB RAM, USV und ausreichend freiem Platz. Kein Container wurde auf dem NAS
gestartet und kein Fernzugang eingerichtet. Fachliche Entscheidungen und Abnahmegrenzen stehen im
[Mehrgerätevertrag](../docs/multi-device-backup-plan.md); die Dienstschnittstelle im
[Modulvertrag](../species-explorer/shared-project/README.md).

Der Container enthält ausschließlich die benötigten Dienstmodule und Node 24.22.1. Das offizielle
Node-Image ist mit dem am 31. Oktober direkt aus der Docker-Registry gelesenen SHA-256 gebunden.
Der Dockerkontext lässt ausschließlich diese Quellen zu. Private PC-Daten, Gitgeschichte, Lightroom,
Zugangsdaten und Entwicklungstests werden nicht eingepackt. Der Dienst läuft ohne Rootrechte;
der Hostport ist ausschließlich an `127.0.0.1` des NAS gebunden.

## Einmalige Einrichtung

Auf dem NAS sind ein eigener lokaler Ordner für Dienst-DB und Sicherungen, ein Konfigurationsordner
und ein dafür berechtigter DSM-Benutzer vorzubereiten. Die bestätigte lokale Volumeadresse sowie
dessen UID/GID werden später in der privaten Compose-Umgebung als `FN_PROJECT_DIRECTORY`,
`FN_PROJECT_CONFIGURATION`, `FN_PROJECT_UID` und `FN_PROJECT_GID` eingetragen. Diese Werte sind
keine gemeinsamen Zugangsdaten. Die beiden M.2-Laufwerke sind laut Screenshot SSD-Cache;
sie werden nicht als eigenes Anwendungsvolume vorausgesetzt. Kein automatisches `chown`, kein
öffentlicher Port und keine übernommene Administratoranmeldung gehören zum Paket.

Eine genaue eigene HTTPS-Adresse ist Voraussetzung für die Konfiguration. Der Helfer
`node nas/configure.mjs <neue-lokale-service.json> <genaue-HTTPS-Adresse>` erzeugt die kleine
Dienstkonfiguration ohne Netzwerkänderung. Platzhalter sind vor dem Betrieb zu ersetzen.
DSM-Reverseproxy und gültiges Zertifikat leiten diese Adresse auf `http://127.0.0.1:4317` weiter;
der öffentliche Hostname muss dabei erhalten bleiben. Der Dienst vertraut keinen weitergereichten
Adress-/Anmeldeheadern. Ein zusätzlicher Browserzugang zur API wird nicht freigeschaltet; Explorer
und Android verwenden ihre eigenen authentifizierten Anfragen. Ob ein vorhandener externer Zugang
diesen Dienst erreicht, muss praktisch geprüft werden. QuickConnect wird dafür nicht vorausgesetzt.

`compose.yaml` baut aus dem übergeordneten Projekt mit `nas/Dockerfile`. Zuerst wird mit dem
gleichen Image und denselben privaten Mounts einmalig `cli.mjs bootstrap` gemäß Modulvertrag
ausgeführt, danach `serve` gestartet. Bootstrap liest zwei persönlich gewählte Administrationszugänge
nur über stdin; es gibt keine Standardpasswörter und keinen HTTP-Einrichtungszugang. Passwörter
nicht in Shellhistorie, `.env`, Kommandoargumente oder Repository schreiben. Eine grafisch geführte
persönliche Einrichtung und deren Zielsystemprüfung bleiben Teil der Betriebsintegration.

Vor dem tatsächlichen Start sind Composekonfiguration, Mountrechte und Node-Version zu prüfen.
In der aktuellen Umgebung wurde die Containerdefinition nur als Quelle vorbereitet;
kein lokaler Docker-/Synology-Bau und keine Linux-Laufzeitprüfung werden damit behauptet.

## Konsistente Sicherung und getrennte Restoreprobe

Eine laufende WAL-Datenbank wird über die SQLite-Backupfunktion aufgenommen. Die bloße Kopie
der Hauptdatei ist keine vollständige Sicherung. Das neue Hilfsprogramm benutzt diese wirkliche
Backupfunktion, prüft Integrität, Projektkennung und Tabellenbezüge und schreibt eine eigene neue
Sicherungsmappe mit `project.sqlite` und Größen-/Hashnachweis. Kontodaten sind enthalten;
die Mappe bleibt deshalb privat und gehört in die vorhandene geschützte NAS-Sicherungsroutine.
Eine Sicherung auf demselben NAS ersetzt nicht die unabhängige Datensicherung.

Der Prüfer akzeptiert die bekannten exakten Tabellen-/Spaltenformen des ursprünglichen Schemas 1
und des aktuellen Schemas 4. Der Nachweis bindet die tatsächlich gelesene Version; beim getrennten
Wiederherstellen muss sie erneut übereinstimmen. Schema 4 enthält auch die Bildtext- und
Artseitenübernahmebelege aus dem WAL. Unbekannte Versionen und zusätzliche oder fehlende Tabellen
beziehungsweise Spalten bleiben gesperrt. Die gezielte lokale Gegenprobe umfasst 15 bestandene Fälle;
sie verwendet ausschließlich eigene Testdaten und ersetzt keine NAS-Betriebsabnahme.

Aufruf im Dienstimage mit einem jeweils neuen Ziel unter dem privaten gemounteten Projektordner:

```text
node --no-warnings nas/snapshot.mjs backup /project/project.sqlite /project/backups/<neue-Kennung> --confirm-local-storage
node --no-warnings nas/snapshot.mjs restore-copy /project/backups/<Kennung> /project/restore-check/<neue-Datei>.sqlite --confirm-local-storage
```

Elternordner müssen bewusst vorhanden sein. `restore-copy` akzeptiert ausschließlich eine noch
nicht existierende Zieldatei; die laufende Datenbank wird niemals ersetzt. Ein tatsächlicher
Betriebsrestore erfordert gestoppten Dienst, erneute Identitäts-/Sicherungsprüfung und eine eigene
gezielte Freigabe. Die vorhandene PC-NAS-Sicherung und deren Zeitplan bleiben unabhängig.

Die isolierten Node-Tests prüfen echte noch offene WAL-Inhalte, bytegleiche getrennte Wiederherstellung,
unveränderte aktive Quelldaten, Überschreibschutz und beschädigte Sicherungen. Das ist kein
Stromausfall-/USV-, Linux-Container-, NAS- oder Fernzugriffsnachweis. Ausgangsbasis:
[offizielles Node-Image](https://hub.docker.com/_/node),
[Compose-Pflichtwerte](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/),
[SQLite-Backupfunktion in Node](https://nodejs.org/docs/latest-v24.x/api/sqlite.html#sqlitebackupsource-db-path-options).
