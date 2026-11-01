# Gemeinsamer Dienst auf dem NAS

Stand: 1. November 2026. Auf der bestätigten Synology DS923+ mit DSM 7.4.1, 32 GB RAM,
USV und ausreichend freiem Platz ist der gemeinsame Dienst inzwischen tatsächlich gebaut und
intern gestartet. Zwei persönliche Administrationskonten und die bestätigte HTTPS-Dienstadresse
sind eingerichtet. Die normale Dienstadresse ist mit gültigem Zertifikat und Anmeldesperre
erreichbar. Felix hat den Explorer persönlich verbunden; die Anmeldung bleibt nach regulärem
Explorerneustart erhalten und ein frischer Serverabruf bestätigt Administration. Tatsächlicher
Zweitgerätezugriff und der durchgehende Anschluss der normalen Artbearbeitung stehen noch aus.
Fachliche Entscheidungen und Abnahmegrenzen stehen im
[Mehrgerätevertrag](../docs/multi-device-backup-plan.md); die Dienstschnittstelle im
[Modulvertrag](../species-explorer/shared-project/README.md).

Felix bestätigt Container Manager am 1. November als installiert; die Einrichtungsanzeige zeigte
`172.17.0.1/16` als interne Bridgeadresse. Die laufende Paketinstallation **24.0.2-1706** auf
Volume 1 ist direkt in DSM bestätigt. Das neue Projekt verwendet sein eigenes Bridge-Netz.

Als gemeinsamen Einstieg für mehrere Vorhaben wünscht Felix **Projekte**. Für diesen Dienst ist
darunter **Arten-Explorer** mit `app/`, `config/` und `data/` vorgesehen. Der Synology-Standardordner
`docker` ist dafür keine Voraussetzung und wird nicht umbenannt. Andere Vorhaben erhalten getrennte
Projektordner und werden hier nicht eingerichtet. Die laufende Installation **24.0.2-1706** auf
Volume 1 ist in DSM lesend bestätigt. Auf Felix' ausdrücklichen Bedienauftrag ist die Freigabe
`Projekte` am 1. November erstellt; `/volume1/Projekte/Arten-Explorer` wurde in den Eigenschaften
geprüft und enthält `app/`, `config/` und `data/`. Der Papierkorb ist aktiviert und nur für
Administratoren zugänglich. Felix hat anschließend selbst dem vorhandenen **KI-Zugang**
Lese-/Schreibrechte auf `Projekte` gegeben. Die Dienstbindung **1032:100** ist durch eine diesem
Benutzer in DSM zugeordnete eigene Prüfdatei und deren tatsächliche Linux-Dateikennungen geprüft;
der gesunde Dienststart bestätigt zusätzlich die Eigentümerschaft seiner Datenbank.
Ordnerverschlüsselung, Daten-Prüfsumme und Kontingent bleiben bei den ausgeschalteten
Assistentenstandards. Es wurde kein weiterer NAS-Benutzer oder Linux-Rootzugang im Container angelegt.

Der Container enthält ausschließlich die benötigten Dienstmodule und Node 24.22.1. Das offizielle
Node-Image ist mit dem am 31. Oktober direkt aus der Docker-Registry gelesenen SHA-256 gebunden.
Der Dockerkontext lässt ausschließlich diese Quellen zu. Private PC-Daten, Gitgeschichte, Lightroom,
Zugangsdaten und Entwicklungstests werden nicht eingepackt. Der Dienst läuft ohne Rootrechte;
der Hostport ist ausschließlich an `127.0.0.1` des NAS gebunden.

## Tatsächlicher interner Betriebsstand

Das DSM-Projekt **arten-explorer** verwendet `/volume1/Projekte/Arten-Explorer/app` als Baukontext.
Die dafür dort liegende `docker-compose.yml` verwendet `context: .`; die Quellvorlage unter `nas/`
verwendet wegen ihres anderen Ablageorts weiterhin `context: ..`. Eingebunden werden ausschließlich
`data` schreibbar als `/project` und `config` schreibgeschützt als `/configuration`.

Image **0.1.2** ist auf dem NAS mit Node **24.22.1**, Linux/x64 gebaut und als **In Ordnung**
beobachtet. Nach einem regulären Containerneustart ist derselbe Container erneut gesund; dies
belegt die Wiederaufnahme des Diensts, keinen Neustart des NAS. Die automatische Gesundheitsprüfung verlangt eine reguläre,
dem Dienstbenutzer gehörende Datenbankdatei sowie die tatsächlichen HTTP-Ergebnisse **401** ohne
Anmeldung und **421** bei fremdem Hostnamen. Das Datenbankschema wird vor der persönlichen
Ersteinrichtung leer angelegt; es gibt dabei weder Standardzugänge noch einen HTTP-Bootstrap.
Der persönliche Einrichtungshelfer ist im tatsächlich gebauten Image enthalten. Felix hat beide
Konten persönlich eingegeben; die Erfolgsmeldung ist nativ bestätigt. Auch nach dem anschließenden
regulären Neustart für die HTTPS-Konfiguration ist der Dienst erneut gesund.

Der echte NAS-Lauf hat drei zuvor lokal nicht belegte Paketgrenzen sichtbar gemacht und korrigiert:
Die CPU-Begrenzung über NanoCPUs scheitert am vorhandenen Kernel; die Prozessanzahl-Begrenzung wird
von ihm verworfen. Beide Angaben stehen deshalb nicht mehr als scheinbar wirksame Grenzen in der
Vorlage. DSM zeigt den konfigurierten Speichergrenzwert von 1 GB. Aus dem NAS-Quellordner kopierte
Programmdateien benötigen außerdem im Image explizite Leserechte für die abweichende Dienstkennung;
der Imagebau setzt diese ausschließlich unter `/app`, ohne NAS-Datenrechte zu ändern.
Die erzwungene `json-file`-Protokollierung blieb im DSM-Protokollfenster leer. Mit dem vorhandenen
NAS-Standard ist die tatsächliche Containerausgabe sichtbar; globale Docker-/Protokolleinstellungen
wurden nicht geändert. Rechteverzicht, schreibgeschütztes Rootdateisystem und Loopback-Portbindung bleiben erhalten.

## Einmalige Einrichtung

Die Ordner für Dienst-DB/Sicherungen und Konfiguration sind auf dem NAS angelegt; der vorhandene,
von Felix berechtigte KI-Zugang ist als Dienstkennung gebunden. Bei einer frischen Einrichtung werden
die bestätigten absoluten Unterordnerpfade sowie die tatsächlichen Kennungen in der Compose-Umgebung als `FN_PROJECT_DIRECTORY`,
`FN_PROJECT_CONFIGURATION`, `FN_PROJECT_UID` und `FN_PROJECT_GID` eingetragen. Diese Werte sind
keine gemeinsamen Zugangsdaten. Die beiden M.2-Laufwerke sind laut Screenshot SSD-Cache;
sie werden nicht als eigenes Anwendungsvolume vorausgesetzt. Kein automatisches `chown`, kein
öffentlicher Port und keine übernommene Administratoranmeldung gehören zum Paket.

Die bestätigte Dienstadresse ist `https://kfmtettaums40.synology.me:55431`. Die Dienstkonfiguration
erlaubt exakt diesen Hostnamen mit Port sowie `127.0.0.1:4317` und `localhost:4317`; der Containerport
bleibt ausschließlich am NAS-Loopback veröffentlicht. Der nach eigener Aktionsbestätigung in DSM
aktivierte HTTPS-Reverseproxy leitet auf `http://127.0.0.1:4317` weiter; eine explizite Host-Kopfzeile
erhält die genaue Dienstadresse. Die vorherige Konfiguration bleibt privat gesichert. Der Helfer
`node nas/configure.mjs <neue-lokale-service.json> <genaue-HTTPS-Adresse>` erzeugt die kleine
Dienstkonfiguration ohne Netzwerkänderung. Platzhalter sind vor dem Betrieb zu ersetzen.
DSM-Reverseproxy und gültiges Zertifikat leiten diese Adresse auf `http://127.0.0.1:4317` weiter;
der öffentliche Hostname muss dabei erhalten bleiben. Der Dienst vertraut keinen weitergereichten
Adress-/Anmeldeheadern. Ein zusätzlicher Browserzugang zur API wird nicht freigeschaltet; Explorer
und Android verwenden ihre eigenen authentifizierten Anfragen. Nach der LAN-Gegenprobe wurde die
normale DNS-Verbindung zunächst mit Zeitüberschreitung beobachtet. Felix hat danach die konkrete
Routerfreigabe gesondert bestätigt: **Arten-Explorer HTTPS**, ausschließlich **TCP 55431** auf
dem NAS, für IPv4 und IPv6. Die Oberfläche bestätigt **FRITZ!Box 7590 AX / FRITZ!OS 8.25**.
Bestehende Freigaben blieben erhalten. Die normale HTTPS-Adresse liefert danach mit regulärer
Zertifikatsprüfung **401 / authentication_required** ohne Anmeldung. Ein tatsächlicher Test aus
einem fremden Netz ist damit noch nicht ersetzt. Der getrennte IPv6-Abruf scheitert bereits an
der Namensauflösung; für die Dienstadresse ist damit kein IPv6-Ende-zu-Ende-Nachweis erbracht.
QuickConnect wird nicht vorausgesetzt.

`compose.yaml` baut aus dem übergeordneten Projekt mit `nas/Dockerfile`. Ein geschützter Dienststart
vor dem Bootstrap ist zulässig: Ohne Benutzer ist keine Anmeldung möglich. Für die persönliche
Ersteinrichtung ergänzt Image **0.1.2** den Helfer `nas/bootstrap-personal.mjs`. Im interaktiven
Containerterminal wird folgender Aufruf ohne Zugangsdaten verwendet:

```text
node --no-warnings /app/nas/bootstrap-personal.mjs --db /project/project.sqlite --confirm-local-storage --confirm-bootstrap
```

Die beiden Administrationszugänge werden persönlich eingegeben. Passwörter bleiben verdeckt und
werden wiederholt; erst das abschließende `ja` legt beide Personen atomar an. Strg+C/EOF bricht
vor dieser Bestätigung ohne neue Zugänge ab. Bereits eingerichtete Projekte werden vor den Fragen
gesperrt. Als Anmeldename ist auch eine E-Mail-Adresse zulässig; daraus entsteht kein Mailversand.
Die neun isolierten Helferfälle prüfen echte Passwortableitung, Einmaligkeit, Abbruch,
fehlendes Echo und Terminalabschluss. Die erste Eingabefrage und ein Abbruch vor der
Kontenanlage sind im tatsächlichen Synology-Terminal beobachtet. Für eine erneute Einrichtung
ein reguläres **bash**-Containerterminal öffnen und den Helfer darin starten: Der erneute direkte
`node`-Terminaleintrag ließ sich nach dem Abbruch nicht anbinden (kein Teletype-Terminal).
Im verbundenen bash-Terminal ist die neue leere erste Frage bestätigt. Felix hat anschließend
beide Konten persönlich eingegeben und die Einrichtung abgeschlossen. Die Erfolgsmeldung und
zwei Benutzer im konsistenten Snapshot sind bestätigt. Die eigene Exploreranmeldung und ihr
Erhalt nach regulärem Neustart sind inzwischen ebenfalls nativ bestätigt; kein Passwort wurde
automatisiert eingegeben oder ausgegeben.
Der vorhandene `cli.mjs bootstrap`-Weg mit begrenztem JSON über stdin bleibt erhalten. Es gibt
keine Standardpasswörter und keinen HTTP-Einrichtungszugang. Passwörter nicht in Shellhistorie,
`.env`, Kommandoargumente oder Repository schreiben. Während der persönlichen Eingabe erfolgen
keine automatischen Screenshots oder Eingaben.

Der erste tatsächliche Bau, die Dienstkennung, Mounts, Node-Version und geschützte Laufzeit sind
inzwischen am NAS geprüft. Hinzu kommen die HTTPS-Gegenprobe und die unten begrenzte tatsächliche
Sicherungs-/Restoreprobe und die persönliche Explorerverbindung einschließlich Neustart. Zugriff aus fremdem Netz, NAS-Neustart,
unabhängige Datensicherung und Mehrgerätebetrieb bleiben eigene Abnahmen.

Der Nachlauf vom 1. November hat eine echte Paketlücke reproduziert: Die ältere explizite Kopierliste
enthielt die inzwischen hinzugekommenen Bildtext-/Artseitenabhängigkeiten nicht. Der isolierte Start
scheiterte deshalb bereits beim Import. Die korrigierte Ausgangsliste enthielt zunächst
**19 benötigte Laufzeitmodule** mit ihren unveränderten relativen Pfaden. Eine Gegenprobe kopiert
ausschließlich diese Dateien in eine eigene leere Testablage und importiert dort Dienst und Sicherung.
Eine weitere Probe richtet nur synthetische Testzugänge ein und prüft den wirklichen HTTP-Katalog:
ohne Anmeldung 401, mit eigenem Testzugang 200. Der Checkout kann fehlende Dateien dabei nicht ersetzen.

`npm.cmd run test:nas` prüft zusätzlich die exakte Übereinstimmung der Docker-Positivliste mit den
Kopierquellen. Im tatsächlich gebauten Image 0.1.2 sind es mit dem persönlichen Helfer
**20 Programm-/Hilfsmodule**; ihr isolierter Import
legt keine fachlichen Daten an. Zusammen mit den Sicherungs-/Konfigurations- und Helferfällen bestehen
**27/27 Fälle** ohne Skips. Der lokale Nachweis und die oben genannten tatsächlichen NAS-Beobachtungen
bleiben getrennt. Das erste private Übertragungspaket mit 19 Modulen bleibt als gebundener Ausgangsbeleg
unter `data/website/checks/nas-implementation-20261101/` erhalten; die ergänzte Dienstbereitstellung
besitzt dort eigene Quell-/Transfernachweise. Private PC-Daten und Zugangsdaten gehören nicht hinein.
DSM-Verwaltung auf Port 55201 und Projektdienst auf Port 55431 sind getrennte Zugänge.

Der anschließend vorbereitete Quellstand **0.1.3** ergänzt den verlustfreien gemeinsamen Art-
Arbeitsdatensatz und enthält **21 ausdrücklich kopierte Module**. Er bleibt vom oben tatsächlich
laufenden Image 0.1.2 getrennt: kein erneuter NAS-Bau, kein Austausch des Containers und kein
Fachimport wurden dafür ausgeführt. Bestehende Katalogobjekte bleiben lesbar, ein automatischer
Typwechsel findet nicht statt. Vertrags- und Prüfdetails führt der
[Dienstmodulvertrag](../species-explorer/shared-project/README.md#vollständiger-art-arbeitsdatensatz-und-normaler-grunddatenweg).
Der ergänzte Quellstand meldet seine Record-/Importunterstützung authentifiziert über
`/api/v1/capabilities`. Vollständige Importe prüfen diesen Nachweis vor einem Schreibschritt;
die laufende Version 0.1.2 wird dafür kontrolliert abgewiesen. Neue Importanlagen und interne
Freigaben binden die geprüfte Administration, Projektkennung und Person innerhalb der Store-Transaktion.

Der gebundene Übertragungsstand 0.1.3 ergänzt außerdem `boundConflictReview:1` und
`boundSpeciesApproval:1`. Die normale Konfliktentscheidung und interne Artfreigabe prüfen diese
Unterstützung vor dem Schreiben. Beide binden Person, Projekt und Rolle erneut in der jeweiligen
Servertransaktion. Das eigenständige Quellarchiv und seine kopierten Modulhashes liegen im bestehenden
privaten Prüfbereich unter `deployment/`; ein isolierter Import kann dort keine fehlenden Dateien
aus dem Checkout nachladen. Dieser vorbereitete Stand ist noch nicht übertragen oder aktiviert.

Die Verwaltungsanmeldungen in DSM und FRITZ!Box werden für Einrichtung und Wartung verwendet.
Der laufende Projektdienst und die persönliche Explorerverbindung benötigen kein dauerhaft offenes
Verwaltungsfenster. Eine abgelaufene Verwaltungssitzung ist deshalb von der Projektanmeldung und
vom durchgehenden Dienstbetrieb zu unterscheiden.

## Konsistente Sicherung und getrennte Restoreprobe

Am 1. November ist dies zusätzlich am tatsächlichen NAS-Dienst ausgeführt: Der eingerichtete
Bestand mit **zwei Konten und noch ohne fachlichen Erstimport** wurde im laufenden Dienst per
SQLite-Backupfunktion nach `/project/initial-snapshot-20261101` aufgenommen. Die getrennte neue
Datei `/project/initial-restore-check-20261101.sqlite` ist nach Hash-, Schema-, Projekt- und
Tabellenprüfung bestätigt; der aktive Bestand wurde nicht ersetzt. Snapshot und Restorekopie
besitzen jeweils **135.168 Bytes** und denselben gebundenen SHA-256. Die Dateien bleiben geschützt
auf dem NAS; nur Manifest und Prüfbelege liegen zusätzlich privat im lokalen Nachweisordner.
Dies ist eine manuelle Einrichtungsprobe auf demselben NAS, keine unabhängige Datensicherung
und keine an Datenbankupdates angehängte Sicherungsroutine.

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

Im lokalen Integrationsnachlauf am 1. November hat ein einzelner negativer Test eine absichtlich
gesetzte Version 2 unerwartet angenommen. Die Ursache ist nicht belegt: Eine begrenzte Matrix
mit 16 synthetischen Fällen und der gebundene Fünf-Dateien-Gegenlauf mit **40/40 Fällen** weisen
die unbekannten Formate korrekt ab. Der Test bestätigt jetzt unmittelbar seine gesetzte
Quellversion und protokolliert bei Wiederauftreten zusätzlich Quell-, Kopie- und Manifestschema.
Die Produkt-Schemaregeln bleiben unverändert. Dies ist kein als behoben ausgewiesener NAS-Fehler;
der tatsächliche produktive Sicherungs-/Restorenachweis oben bleibt davon getrennt.

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
