# Gemeinsamer Dienst auf dem NAS

Stand: 9. November 2026. Auf der bestätigten Synology DS923+ mit DSM 7.4.1, 32 GB RAM,
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

Seit dem 9. November läuft **0.1.9** im DSM-Projekt `arten-explorer-019` mit eigenem Datenordner.
Der folgende Abschnitt dokumentiert die ursprüngliche Einrichtung von 0.1.2. Der aktuelle Stand und
die offenen Abnahmen stehen unter [Dienstwechsel auf 0.1.9](#dienstwechsel-auf-019).

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

Der neuere **Containerquellstand 0.1.4** erweitert diese Basis um unveränderlich gebundene
JPEG-/PNG-/WebP-Bilder. Metadaten und Bytes werden getrennt übertragen, bestehende ID-/Hashbindungen
nicht überschrieben. Die unterstützten Fähigkeiten heißen `managedImageMedia:1` und
`stablePageAssetBinding:1`; der Store verwendet Schema 5. Bildannahme benötigt tatsächliche
Dekodierung durch FFmpeg. Das Dockerfile installiert dafür das Debianpaket und kopiert ausschließlich
die jetzt 27 benötigten Laufzeitmodule. Der bestehende nicht privilegierte Dienstbetrieb und die
Loopback-Portbindung bleiben erhalten. Bildannahme hat feste Größen-/Pixelgrenzen und eine begrenzte
Übertragungszeit; ein belegter Bildeingang reiht keinen zweiten Upload im Arbeitsspeicher ein.

Das nach dem Talamanca- und Sicherungsfehlernachlauf frisch gebundene Quellpaket
`nas-source-0.1.4-48babc9d7fc5.zip` liegt im bestehenden privaten Prüfbereich: **106.585 Bytes**,
31 Archiveinträge einschließlich 27 Laufzeitmodulen. Alle Kopien und Archiveinträge sind in Größe
und SHA-256 gegen die tatsächlichen Quelldateien geprüft; die Quellen sind danach unverändert.
Der getrennte Compose-Vorschlag bindet ausschließlich den neuen Baukontext und erhält UID,
Loopback-Port, Volumes und Sicherheitsoptionen des bisherigen Vorschlags. Das frühere Paket
`nas-source-0.1.4-86971a6d43e5.zip` bleibt als überholter Beleg erhalten und darf nicht gebaut werden.
Die lokale Integration ist noch im Abschluss. Ein tatsächlicher Linux-Imagebau muss
FFmpeg-/Paketversionen und Imagedigest erst nachweisen.
Das bestehende gebundene 0.1.3-Archiv bleibt unverändert; kein neues Archiv ersetzt seinen Beleg.
Der aktive NAS-Dienst ist weiterhin 0.1.2. Ein Containerwechsel oder Fachimport ist damit nicht erfolgt.

Der anschließend ergänzte lokale Quellstand für die Seitenredaktion benötigt zusätzlich die
explizit kopierten Projektions-, Intent-, Richtext- und Artansichtsmodule. Dockerdatei und Positivliste
sind dafür gemeinsam erweitert. Die oben gebundenen Archive bleiben unveränderte Belege ihres
damaligen Stands und enthalten diese Ergänzungen noch nicht. Vor einem weiteren NAS-Wechsel ist
ein neues vollständiges, geprüftes Paket erforderlich; der neue Reader-Catalog und seine Medien-
und Bedienwege sind zunächst lokal zu vervollständigen. Aus dieser Quelländerung folgt keine
Aktivierung oder Änderung am laufenden Dienst.

Der neue **Containerquellstand 0.1.5** vom **2. November** ergänzt außerdem den vollständigen normalen Bild-/Tondienst
mit Schema 6 sowie dessen HTTP- und Sicherungsprüfer. Die feste Kopierliste enthält auch alle
normalen Medien-, Kontext- und MP3-Prüfmodule. Die bislang gebundenen Archive sind dafür kein
aktuelles Installationspaket. Der neue lokale Dienststart erweitert nur ein vollständig qualifiziertes
Schema 5 atomar; ein späterer NAS-Wechsel benötigt davor eine konsistente Sicherung und anschließend
eine eigene Betriebsprobe. Der aktive Dienst und seine Daten werden durch diesen Quellanschluss
nicht umgestellt.

Das neue private Quellpaket `nas-source-0.1.5-909cf3db2d50.zip` enthält **43 Laufzeitmodule / 47
Archiveinträge**, **158.651 Bytes**, SHA-256
`a8603dca97ff3ace3bba690325cbca5cc092134c61106287303f922b0af7d6e9`.
Jeder Archiveintrag ist nach dem Schreiben in Größe und Hash geprüft; die Quellhashes stimmen
danach weiterhin überein. Die isolierten NAS-Fälle bestehen mit **31/31 ohne Skips**, einschließlich
tatsächlichem Start allein aus den kopierten Modulen. Ein Linux-Imagebau und die Aktivierung auf
dem NAS sind damit nicht erfolgt. Vor einer Reader-2-Freigabe muss der tatsächlich verwendete
lesende Client das neue Format unterstützen; der vorhandene Catalog-1-Endpunkt kürzt diese
Fassung nicht still zu alten Abschnitten. Alte Quellpakete bleiben als historische Belege erhalten.

Das anschließende **Quellziel 0.1.6** ergänzt die atomare Kollisionsprüfung neuer vollständiger Arten
auch außerhalb des Erstimports sowie `speciesCreation:1`. Gebundene Anlagen prüfen Projekt, Person,
Rolle und Personenversion unmittelbar in der Schreibtransaktion. Weder das ältere Quellpaket 0.1.5
noch der laufende NAS-Dienst enthalten diesen Nachlauf. Die neue Compose-Kennung bezeichnet zunächst
den vorbereiteten Quellstand; sie belegt keinen Linux-Bau oder eine NAS-Aktivierung. Der persönliche
Windows-Anlageadapter und seine lokale Quellenprüfung werden nicht als NAS-Laufzeitmodule kopiert.
Das neue private Archiv **`nas-source-0.1.6-a62b6d2f670c.zip`** umfasst **159.175 Bytes** mit
SHA-256 `a231140c22a4cafaecaf9414fcb99c4ea437359cab446201c03b1d61649c0088`.
Alle 47 Archiveinträge einschließlich der 43 Laufzeitmodule sind gebunden und nach dem Schreiben
gegen ihre Quellen geprüft. **31/31 isolierte NAS-Fälle** bestehen; der ausschließlich aus der
Kopierliste gestartete echte HTTP-Dienst bestätigt die neue Fähigkeit und weist eine Doppelanlage
ab. Das ist weiterhin kein Linux-Imagebau und keine Änderung am laufenden NAS.

## NAS-Quellpaket 0.1.7 und Rücknahme

Das **Quellziel 0.1.7** ergänzt `speciesEnrichment:1` für geprüfte Artvorschläge. Die Datenbank
erreicht Schema 7 in derselben Transaktion, die den ersten Vorschlag als Entwurf übernimmt.
Vorher gilt weiterhin Schema 6. Die neue Kennzeichnung verhindert den Start eines älteren Dienstes
mit einer bereits erweiterten Datenbank. Die Mediensperre für die interne Leserfreigabe ist in der
Sicherungs- und Wiederherstellungsprobe erhalten. Die archivierte Laufzeit 0.1.6 weist eine Kopie
des Schemas 7 ab und öffnet die vor der Änderung separat wiederhergestellte Sicherung.

Das private Archiv **`nas-source-0.1.7-174481fd8ecd.zip`** im bisherigen Bereich `deployment/` enthält
**48 Laufzeitmodule / 52 Einträge**, **173.449 Bytes**, SHA-256
`9a3b60cd62c42d8af4b9cb3ad8bf711e138c08799079e548565b1209d4dfe616`.
`nas-0.1.7-upgrade-rollback-20261103.json` hält die Gegenprobe zwischen den gebundenen Paketen 0.1.6
und 0.1.7 mit synthetischem Bestand fest. **66/66 gezielte Tests** bestehen einschließlich tatsächlichem
HTTP-Start aus der Kopierliste, Übernahme eines Vorschlags und Sicherung der neuen Formatgrenze.
Linux-Imagebau und NAS-Aktivierung stehen separat aus.

### Aktualisierte Quelle und Upgradeprobe von Schema 4

Das nachfolgende private Archiv **`nas-source-0.1.7-9ffb10e5e131.zip`** enthält die aktuellen
Bildtextabgleich- und Artseitenvorlagen sowie den Schutz vor vorhandenen SQLite-Begleitdateien am
Restoreziel. Es enthält **48 Laufzeitmodule / 52 Einträge**, **174.585 Bytes** und hat SHA-256
`4edbf08e3d144e47fa4c6a16472f3585b67a3abcd39ba870ed9cf4ce4e843c8a`.
Alle **52 gezielten NAS- und Bildtextabgleichfälle** sind bestanden.

Die lokale Upgradeprobe entpackt und prüft dieses Archiv und das gebundene ältere Quellarchiv
**0.1.3**. Dieses erzeugt einen synthetischen Bestand mit Schema 4, zwei Konten und einem
Seitenentwurf mit früherer Freigabe. Nur die getrennte Restorekopie wird mit der neuen Laufzeit
auf Schema 6 geöffnet. Bestehende Anmeldung, Seitenfassung und Freigaberevision bleiben verfügbar.
Der lokale HTTP-Dienst bestätigt 401 ohne Anmeldung, 421 bei fremdem Hostnamen und 200 für die
autorisierte Fähigkeitsabfrage. Eine zweite Restorekopie lässt sich mit der älteren Laufzeit wieder
öffnen. Ursprungsdatei, WAL und Sicherung sind bytegleich geblieben.
Der private Nachweis liegt unter `deployment/nas-0.1.7-9ffb10e5e131-schema4-rehearsal-20261103.json`.
Die Ausgangsquelle dieser Probe ist das Archiv 0.1.3, nicht das installierte Image 0.1.2.

Vor dem nächsten gebündelten Wechsel sind **tatsächliches Datenbankschema und laufendes Image** frisch
festzustellen. Der Dienst öffnet die bekannten Eingangsschemata 0–7. Ältere unterstützte Formate
erreichen beim Öffnen Schema 6. Der Snapshotprüfer unterstützt die exakten Formen 1, 4, 5, 6 und 7.
Bei vorgefundenem Schema 2 oder 3 ist vor dem Wechsel ein qualifizierter Sicherungsweg erforderlich.
Der vorbereitete Rückweg verwendet das bisherige Image mit einer vor dem Wechsel gesicherten und
separat wiederhergestellten Datenbank. Nachfolgende Schreibvorgänge gehören zu einer neueren
Datenbankfassung und müssen bei einer Rücknahme eigens geprüft werden. Ein frischer konsistenter
Snapshot und eine Upgradeprobe an seiner getrennten Kopie gehen dem produktiven Start voraus.
Der vorhandene Einrichtungsbeleg `nas-initial-snapshot-manifest.json` bindet **Schema 4 / 135.168 Bytes**
am 1. November. Das ist eine datierte Ausgangsbasis für die Vorbereitung, keine frische Liveprüfung.

## NAS-Quellpaket 0.1.8 für die Handy-Kopplung

Das private Archiv **`nas-source-0.1.8-f3dcf0afdfde.zip`** enthält die neue Fähigkeit
`devicePairing:1`. Es umfasst **48 Laufzeitmodule / 52 Einträge**, **175.536 Bytes** und hat
SHA-256 `d1f2a42501c078269e8e62b751f047c94009b37ef65efd4f70e80a352babf58e`.
Eine getrennt aus dem Archiv extrahierte Laufzeit wurde mit synthetischer Datenbank und lokalem
HTTP geprüft. Einladung, persönliche Lesesitzung, Schreibsperre, Einmaligkeit und Gerätewiderruf
sind bestätigt. Der private Nachweis liegt unter
`deployment/nas-0.1.8-f3dcf0afdfde-pairing-20261103.json`.
Die Einladung selbst benötigt keine zusätzliche Datenbankmigration. Linux-Imagebau, produktiver
NAS-Wechsel und eine echte Kopplung auf dem Handy stehen aus.
Die erneute HTTPS-Probe am 3. November bestätigt für Katalog und Einlösepfad jeweils
`401 authentication_required`. Das laufende HTTPS-Ziel leitet die Einlösung damit noch in die
allgemeine Anmeldung. Die direkt aus dem geprüften Archiv extrahierte 0.1.8-Laufzeit liefert
für dieselbe leere Anfrage isoliert `400 invalid_pairing`. Die Gegenprobe ist unter
`deployment/nas-0.1.8-pairing-route-comparison-20261103.json` belegt.
Die anschließende lesende DSM-Prüfung bestätigt den laufenden Container mit Image **0.1.2**.
File Station zeigt den Anfangssnapshot, dessen getrennte Restorekopie und die aktive Datenbank
mit WAL-Datei. Vor dem Wechsel sind ein frischer konsistenter Snapshot und eine Probe mit
seiner getrennten Kopie erforderlich.
Mit dem ursprünglichen, hashgebundenen NAS-Quellkontext vom 1. November wurde eine künstliche
Datenbank im Schema 4 erzeugt. Die exakt aus dem 0.1.8-Archiv entpackte Laufzeit übernimmt ihre
getrennte Restorekopie in Schema 6. Zwei Adminsitzungen und eine freigegebene Seitenfassung bleiben
erhalten, eine Einladung ergibt genau einmal eine Lesesitzung. Eine zweite Restorekopie öffnet
der ursprüngliche Quellstand wieder im Schema 4. Die Belegdatei
`deployment/nas-0.1.8-original-schema4-rehearsal-20261103.json` trennt diese Probe von der
ausstehenden Prüfung der tatsächlichen NAS-Datenbank.

Für den tatsächlichen Wechsel auf 0.1.8 gelten getrennte Prüfschritte:

1. Das geprüfte Archiv anhand seines SHA-256 identifizieren und aus einem getrennten
   Bauordner als Linux/amd64-Image bauen. Aus dem fertigen Image Node, FFmpeg und die
   Laufzeitdateien prüfen. Vor dem Wechsel die aktuelle Compose-Konfiguration und
   die Identität des laufenden 0.1.2-Images festhalten.
2. Für das Wartungsfenster laufende Projektänderungen abschließen und Schreibzugriffe
   bis zur Entscheidung über den Wechsel aussetzen. Die aktive Datenbank über die
   SQLite-Backupfunktion in ein neues privates Ziel sichern. Das Manifest muss Schema,
   Projektkennung und Prüfsumme bestätigen. Bei Abweichung den Wechsel anhalten.
3. Eine Kopie dieser Sicherung in einem getrennten Datenordner mit 0.1.8 öffnen.
   Der Probedienst verwendet eine eigene lokale Bindung. Schema, Integrität, Konten,
   vorhandene Freigaben und die Kopplungsroute prüfen. Eine zweite frische Restorekopie
   mit 0.1.2 öffnen und dessen Rückweg prüfen. Der aktive Datenträgerpfad bleibt der
   Produktion vorbehalten.
4. Erst nach bestandenen Proben den Dienst im genehmigten Fenster umstellen und die
   Gesundheitsprüfung, HTTPS-Anmeldesperre, persönliche Explorer-Anmeldung und die
   Kopplungsroute nachprüfen. Falls der Start oder eine Prüfung scheitert, den Dienst
   vor weiteren Projektänderungen stoppen, den fehlgeschlagenen Bestand zur Prüfung
   separat erhalten und den gebundenen Rückweg mit 0.1.2 verwenden. Die 0.1.2-Laufzeit
   darf nur die zu ihr passende Sicherungsfassung öffnen. Eine tatsächliche
   Rücknahme der aktiven Datenbank benötigt die unten beschriebene gezielte Freigabe.

Die Kopplung mit einem echten Handy und der Zugriff aus einem fremden Netz werden
nach erfolgreichem Wechsel separat abgenommen.
Der HTTPS-Katalog lieferte am 4. November erneut **401** ohne Anmeldung. Der Archivabgleich
bestätigte alle 51 Quelldateien und das zusätzliche Manifest. Die danach ergänzte Korrektur
zum Schließen des persönlichen Bildtextjournals betrifft dessen Desktop-Initialisierung.
Das bereits geprüfte NAS-Archiv bleibt an seine eigene Prüfsumme gebunden.

Die nächste Imageprobe verwendet den privaten Prüfer
`deployment/nas-0.1.8-container-pairing-probe-20261104.mjs`. Die Windows-Probe aus frisch
entpackten und vollständig hashgeprüften Archivquellen bestätigt die Einlösung einer synthetischen
Einladung, Katalogzugriff, Schreibsperre und Sperre bei Wiederverwendung. Der zugehörige JSON-Beleg
enthält auch den erneut geprüften HTTPS-Stand. Auf der DS923+ wird derselbe Prüfer erst nach
Freigabe an einem eigenen Image-Tag ausgeführt. Er arbeitet ohne Host-Port oder Produktivvolume.

```sh
# Im separat entpackten und hashgeprüften NAS-Quellordner
docker build --platform linux/amd64 -f nas/Dockerfile -t fn-arten-explorer-project:0.1.8-probe .
docker run --rm -i --network none --read-only --user 10001:10001 --cap-drop ALL \
  --security-opt no-new-privileges --tmpfs /tmp:rw,nosuid,nodev,noexec,size=64m,mode=1777 \
  fn-arten-explorer-project:0.1.8-probe node --no-warnings --input-type=module - --container \
  < /absoluter/Prüfpfad/nas-0.1.8-container-pairing-probe-20261104.mjs
```

Das Protokoll muss Linux/x64, Node, FFmpeg und dieselben fünf Routenergebnisse enthalten.
Der Container darf weder `/project` noch `/configuration` sehen. Der Schreibbereich liegt nur
im temporären Speicher des Containers. Diese Imageprobe berechtigt zu keinem Produktivwechsel.
[Docker-Optionen für den isolierten Lauf](https://docs.docker.com/reference/cli/docker/container/run/)

Der Nachlauf für Android 0.1.10 prüft am hashgebundenen Archiv auch die tatsächlich von der App
verwendete Route `/api/v1/catalog`. Eine synthetische Lesesitzung erhält den freigegebenen
Panama-Kapuzineraffen aus dem signierten App-Katalog, während eine neuere Entwurfsfassung privat
bleibt. Schreiben und Zweiteinlösung werden abgewiesen. Das produktive HTTPS-Ziel antwortet auf
die absichtlich leere Einlösung weiterhin mit `401 authentication_required`.

Für die DSM-Imageprobe liegt im privaten Nachweisordner zusätzlich
`deployment/nas-0.1.8-isolated-dsm-probe-20261104.zip` mit SHA-256
`a3a090fae05e290a84d7c9349478a13e6ab0e2a09ec2b846103532777d505330`. Die zusätzliche
`docker-compose.yml` nutzt den gleichen Prüfer als einmaligen Startbefehl. Der Prüfcontainer
erhält weder einen Hostport noch ein Datenvolume. Das Archiv ist zur getrennten Imageprobe
vorbereitet. Der Linux-Lauf und der Wechsel der produktiven Datenbank folgen danach.

Der lesende Quellenreview vom 2. November findet keinen fehlenden Import in der festen Kopierliste.
Normale Bild-/Tonbytes liegen wie die verwalteten Seitenbilder in SQLite; ein zusätzliches Medienvolume
ist für diesen Anschluss nicht erforderlich. Ein frischer Linux-Bau muss die tatsächlich installierte
FFmpeg-Version belegen. Anmeldung, bestehende Freigaben, Bild-/Tonübertragung und Reader 2 sind nach
dem Upgrade an der Kopie und später im tatsächlichen NAS-Betrieb zu prüfen. Diese Vorbereitung
führt weder einen Bestandsimport noch eine Aktivierung aus.

Die ergänzte isolierte Snapshot-/Upgradeprobe besteht mit den vorhandenen Sicherungsfällen
**20/20**. Sie bildet ausschließlich eine eigene Fixture vollständig auf Schema 4 zurück, sichert
noch nötige WAL-Inhalte, stellt bytegleich in ein neues Ziel wieder her und öffnet nur diese Kopie
mit dem neuen Store auf Schema 6. Konten und alle vier Rollen, bestehende Sitzungen/Passwort-/
Gerätebindungen, freigegebene Artfassung neben neuerem Entwurf sowie historische Belegbytes bleiben
erhalten. Ursprung einschließlich WAL, Snapshot und Manifest bleiben unverändert. Das belegt den
lokalen Mechanismus, keine Prüfung der aktuellen NAS-Datenbank oder des Linux-Images.

Die Verwaltungsanmeldungen in DSM und FRITZ!Box werden für Einrichtung und Wartung verwendet.
Der laufende Projektdienst und die persönliche Explorerverbindung benötigen kein dauerhaft offenes
Verwaltungsfenster. Eine abgelaufene Verwaltungssitzung ist deshalb von der Projektanmeldung und
vom durchgehenden Dienstbetrieb zu unterscheiden.

## NAS-Quellpaket 0.1.9 für den aktuellen Explorer

Das private Archiv **`nas-source-0.1.9-bca4b134853e.zip`** enthält 48 Laufzeitmodule und
52 Einträge. SHA-256 `2b62e3588625c7f7fe425603cb1f49a1ee5dd82b0faf64a8568d9f709d6d5c2a`.
Es bündelt die neuere IUCN-Synonymzuordnung, die Browser-Kartenherkunft und die Korrektur
für das Schließen eines fehlerhaft initialisierten Bildtextjournals. Der Paketname unterscheidet
diese fünf geänderten Laufzeitdateien vom geprüften Vorgängerarchiv.

Beim lokalen HTTP-Vergleich quittiert die aus 0.1.8 entpackte Laufzeit die Übernahme eines
synthetischen Artvorschlags mit 200, speichert dessen IUCN-Zuordnung aber nicht. Die aus 0.1.9
entpackte Laufzeit erhält den führenden Artnamen und speichert die zugehörige Synonymbindung.
Die QR-Einlösung, Leseberechtigung, Schreibsperre und Einmaligkeit sind aus demselben Paket
unter Windows bestätigt. **36 NAS-Tests und 68 gezielte IUCN-/Arten-/Bildtexttests** bestehen.
Dateihashes und genaue Probeergebnisse stehen privat in
`deployment/nas-source-0.1.9-bca4b134853e.json`.

Die lokale Upgradeprobe verwendet den ursprünglichen, hashgeprüften Dienstquellkontext
vom 1. November und das entpackte Quellpaket 0.1.9. Die Online-Sicherung erfasst den
synthetischen Schema-4-Bestand einschließlich WAL. Nur eine getrennte Restorekopie wird
auf Schema 6 geöffnet. Fünf Sitzungen mit allen vier Rollen, eine Lesefreigabe neben einem
neueren Entwurf und ein bereits vorhandener Offlinekonflikt bleiben erhalten. Zwei getrennte
Anmeldungen schreiben über HTTP gleichzeitig an einer Art und einer Seite. Ein weiterer
veralteter Entwurf bleibt als Konflikt erhalten. Die ältere Laufzeit weist Schema 6 ab und
öffnet eine zweite, unveränderte Schema-4-Restorekopie mit dem ursprünglichen Stand.
Quelldatenbank, WAL und Sicherung bleiben bytegleich. Der private Beleg heißt
`deployment/nas-0.1.9-schema4-conflict-rollback-20261109.json`.
Für die Betriebsprüfung ist weiterhin eine frische Kopie der tatsächlichen NAS-Datenbank nötig.

Für DSM ist **`nas-0.1.9-isolated-dsm-probe-bca4b134853e.zip`** vorbereitet.
SHA-256 `7bd6ec935f0916e1e01fc16c0de00a758efd5b1f8a3ec0bae1c39993c057d5d9`.
Am 9. November wurde das Archiv auf der DS923+ in einen getrennten Probeordner übertragen und
die dort entpackte Compose-Datei bytegenau gegen das Archiv geprüft. Sie enthält genau einen
Dienst ohne Hostport und Volumes, `network_mode: none`, eine schreibgeschützte Laufzeit ohne
Rootrechte und `/tmp` als temporären Schreibbereich. Web Station blieb deaktiviert.

Container Manager baute daraus das Testimage `fn-arten-explorer-project:0.1.9-probe` mit der
Image-ID `sha256:7abc0f6756cb77069a8e9bf98d5878885b0bc627efe1f45e8543cb118624054f`.
Das Protokoll des anschließend beendeten Einmalcontainers meldet `passed: true`, Linux/x64,
Node 24.22.1 und FFmpeg 5.1.9. Mit künstlichen Konten bestätigt es die Anmeldesperre (401),
die einmalige QR-Einlösung, den lesenden Katalogabruf (200), die Schreibsperre (403) und die
Sperre einer erneuten Einlösung (401). Beleg: `deployment/nas-0.1.9-isolated-dsm-probe-20261109.json`.

Die getrennte DSM-Containerliste zeigte den produktiven Dienst mit Image **0.1.2** weiter als
laufend. Seine HTTPS-Anmeldesperre antwortete vor, während und nach der Probe mit 401.
Für den Dienstwechsel gelten weiterhin die oben beschriebene Reihenfolge und eine aktuelle
Sicherung im Wartungsfenster. Upgrade und Rückweg sind unten am tatsächlichen Bestand geprüft.
Die echte Handy-Kopplung folgt erst am aktualisierten Dienst.

### Upgrade und Rückweg an einer frischen NAS-Sicherung prüfen

Nach gesonderter Freigabe mit dem laufenden 0.1.2-Dienst über `snapshot.mjs backup` eine neue
konsistente Sicherung anlegen. Die Sicherung bleibt auf dem NAS. Für beide getrennten Prüfcontainer
genau diese Sicherungsmappe schreibgeschützt als `/snapshot` einbinden und den SHA-256 aus ihrem
Manifest fest vorgeben. Keiner der Prüfcontainer benötigt den aktiven Daten- oder Konfigurationsordner.

Das [Prüfskript](upgrade-rehearsal.mjs) wird einzeln schreibgeschützt als
`/app/nas/upgrade-rehearsal.mjs` eingebunden. Die Container bleiben ohne Netz und Hostport und verwenden
die vorhandene Projekt-UID/GID zum Lesen der privaten Sicherung. `/tmp` ist jeweils ein eigener
temporärer Schreibbereich mit genügend Platz für die Sicherungskopie und ihre SQLite-Begleitdateien.
Die tatsächlichen Image-IDs in DSM vor dem Start mit den geprüften Fassungen abgleichen.

| Prüfimage | Prozessargumente nach `node --no-warnings /app/nas/upgrade-rehearsal.mjs` | Erwartung |
| --- | --- | --- |
| `fn-arten-explorer-project:0.1.9-probe` | `/snapshot <SHA-256> 6` | Schema 6, unveränderte Bestandsdaten, leere neue Medientabellen |
| `fn-arten-explorer-project:0.1.2` | `/snapshot <derselbe SHA-256> 4` | Schema 4, unveränderte Bestandsdaten |

Beide Läufe erzeugen aus derselben Sicherung jeweils eine eigene Kopie. `passed: true` bestätigt
den Vergleich aller zwölf bisherigen Tabellen einschließlich Konten, Geräte, Sitzungen, Fassungen,
Freigaben und Konflikte. Das Protokoll enthält die Sicherungsprüfsumme und ausgewählte Anzahlen.
Die einzelnen Datensätze und die internen Vergleichshashes bleiben im Prozess. Beide Ergebnisse
müssen dieselbe Sicherung ausweisen. Der Rückweg verwendet die frische zweite Kopie von Schema 4.
Dieser Schritt prüft den Datenbestand vor dem Dienstwechsel. Persönliche Anmeldung, echter QR-Abruf
und Zugriff aus einem anderen Netz werden getrennt abgenommen.

Am 9. November hat der getrennte Snapshot-Job mit 0.1.2 die laufende Datenbank einschließlich WAL
schreibgeschützt gelesen. Die Sicherung liegt privat unter
`/volume1/Projekte/Arten-Explorer/upgrade-rehearsal-20261109/evidence/snapshot`.
Beide NAS-Prüfcontainer meldeten für dieselbe Sicherung `passed: true`. 0.1.9 öffnete seine Kopie
als Schema 6, 0.1.2 die getrennte Rückwegkopie als Schema 4. Alle zwölf bisherigen Tabellen
blieben inhaltlich gleich. Der tatsächliche Bestand enthält zwei aktive Administratoren und noch
keine gemeinsamen Art-/Seitenobjekte oder Konflikte. Belege für den Erhalt befüllter Tabellen
stammen aus der getrennten künstlichen Gegenprobe. Die Produktionsadresse antwortete nach dem Lauf
weiterhin mit ihrer Anmeldesperre (401). Der Dienstwechsel ist eine gesonderte Freigabe.
Prüfbeleg: `deployment/nas-upgrade-rehearsal-20261109/nas-results.json`.

### Dienstwechsel auf 0.1.9

Das private Paket `deployment/nas-cutover-019-20261109.zip` hat SHA-256
`1a01ff50eda204c027c7c2224bf8f5383cd7b85c72a45943e03c1633c717e569`.
Es startet die bereits geprüfte Image-ID aus der Linux-Probe unter einem separaten DSM-Projektnamen.
Die Dienstvorlage übernimmt den vorhandenen UID/GID, die Konfiguration, die Gesundheitsprüfung und
`127.0.0.1:4317`. Sie verwendet als aktiven Datenordner ausschließlich `cutover-019-20261109/data`.
Vor Beginn die tatsächlich laufende Compose-Fassung, beide Image-IDs, die Pfade und die leeren
Ziele in DSM prüfen. Der Reverseproxy bleibt bei derselben lokalen Zieladresse.

1. Mit beiden Nutzern die Bearbeitung für das freigegebene Wartungsfenster aussetzen. Getrennte
   DSM-Projekte vorbereiten und den alten Dienst regulär stoppen. Seine Containerdefinition und
   der bisherige Datenordner bleiben für die Rückkehr verfügbar.
2. Den einmaligen [Stagingjob](stage-upgrade.mjs) starten. Er liest den alten Ordner schreibgeschützt,
   verlangt Schema 4, höchstens 32 MiB und das Fehlen von SQLite-Begleitdateien. Aus der getrennten
   temporären Kopie erzeugt er eine konsistente Sicherung unter `evidence/cutover-snapshot` und
   eine verifizierte Startkopie im neuen Datenordner. Bei Abweichung wird der neue Dienst nicht gestartet.
3. Nur nach `passed: true` den neuen Dienst starten. Gesundheitsstatus, Zertifikat, Anmeldesperre,
   tatsächlich verwendete Image-ID und QR-Routenerkennung prüfen. Danach die persönliche Anmeldung
   und die bestehenden Rechte prüfen, bevor fachliche Schreibzugriffe wieder beginnen.
4. Scheitert die Prüfung vor der Wiederaufnahme von Schreibzugriffen, den neuen Dienst stoppen
   und 0.1.2 mit seinem ursprünglichen Datenordner starten. Ein Rückweg nach fachlichen Änderungen
   auf 0.1.9 braucht eine neue Entscheidung über deren Erhalt. Der Sicherungsumfang für den neuen
   Betriebsordner gehört zur getrennten Abnahme der unabhängigen Sicherung.

Die lokale Gegenprobe aus den gebundenen Laufzeitquellen öffnet eine regulär geschlossene 0.1.2-DB
mit WAL-Header, erhält eine vorhandene Administratorsitzung und eine künstliche Seite, bestätigt
Schema 6 und öffnet anschließend den unveränderten Ausgangsbestand mit 0.1.2. 37 NAS-Tests bestehen.
Im freigegebenen Wartungsfenster am 9. November stoppte der bisherige Dienst regulär. Der Stagingjob
bestätigte die unveränderte Schema-4-Quelle und die verifizierte Startkopie mit zwei Konten und ohne
gemeinsame Objekte. Die Sicherung liegt im privaten NAS-Ordner
`/volume1/Projekte/Arten-Explorer/cutover-019-20261109/evidence/cutover-snapshot`.
DSM meldete `arten-explorer-019-project-1` anschließend **In Ordnung** und zeigte den separaten
Ordner `cutover-019-20261109/data` als aktiven Datenpfad. Der 0.1.2-Container blieb gestoppt.
Über die bestehende HTTPS-Adresse antworteten beide Katalogrouten ohne Anmeldung mit 401. Der
QR-Einlöseweg erkannte eine leere Anfrage und wies sie mit 400 (`invalid_pairing`) ab.
Offen bleiben die persönliche Anmeldung, die Kopplung am Handy, der Zugriff von außerhalb und die
bewusste Anfangsübernahme. Der private Prüfbeleg liegt unter `deployment/nas-cutover-019-20261109/results.json`.

Am 12. November antworten beide Katalogrouten aus dem aktuellen PC-Netz erneut mit HTTP 401 und
gültigem TLS-Zertifikat. Der getrennte IPv6-Abruf erhält in diesem Netz keine auflösbare Zieladresse.
Damit bleiben der Zugriff aus einem fremden Netz und die IPv6-Erreichbarkeit offen.

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

Die gefüllte lokale Wiederherstellungsprobe vom 9. November verwendet das exakte NAS-Quellarchiv
0.1.9 und den aktuellen Arbeitsbestand auf einem getrennten Dienst. Der Online-Snapshot erfasst
**64 Arten und 250 Mediendateien** bei aktivem WAL. Die getrennte Kopie entspricht dem Snapshot
bytegenau. Beide Testadministratoren melden sich dort an und lesen alle Arten sowie je vier
Originaldateien des Mittelspechts mit korrekter Prüfsumme. Die Arten bleiben Entwürfe. Ein
Schreibvorgang nach dem Snapshot bleibt auf den isolierten Quelldienst beschränkt. Privater
Nachweis: `deployment/nas-loaded-snapshot-restore-20261109.json`.

Die erneute lokale Betriebsprobe vom 13. November sicherte den getrennten Testdienst nach
vollständiger Übernahme des aktuellen Bestands. Beide Testadministratoren konnten sich in der
wiederhergestellten Kopie anmelden. Alle 65 Entwürfe wurden unverändert zurückgelesen und die
Prüfsummen aller 252 Originaldateien bestätigt. Das Sicherungsziel war ein eigener lokaler
Testordner. Die Probe am unabhängigen Sicherungsziel des laufenden NAS steht aus.

Im angemeldeten DSM zeigt **Hyper Backup** am 9. November eine leere Aufgabenliste. Der automatisch
geöffnete Einrichtungsassistent wurde ohne Einrichtung verlassen. Weitere Sicherungswege und Zeitpläne
sind bei dieser Lesekontrolle nicht geprüft. Der private Nachweis liegt unter
`deployment/nas-hyper-backup-observation-20261109.json`.

Vor der Anfangsübernahme muss der unabhängige Sicherungsweg für den neuen aktiven Ordner
`cutover-019-20261109/data` bestätigt werden. Für die Abnahme muss ein vollständiger SQLite-Snapshot
aus diesem Betriebsordner im unabhängigen Sicherungsziel nachweisbar sein und sich an einem getrennten
Ziel wiederherstellen lassen. Die Sicherung des Windows-Arbeitsordners und die lokale Probe decken
jeweils ihre eigenen Quellen ab. Der Zeitplan bleibt von Explorer-Datenbankupdates getrennt.

Der Prüfer akzeptiert die bekannten exakten Tabellen-/Spaltenformen der Schemata 1, 4, 5, 6 und 7.
Der Nachweis bindet die tatsächlich gelesene Version; beim getrennten
Wiederherstellen muss sie erneut übereinstimmen. Schema 4 enthält auch die Bildtext- und
Artseitenübernahmebelege aus dem WAL, Schema 5 die verwalteten Seitenbilder und Schema 6 zusätzlich
gebundene normale Bild-/Tonoriginale. Alte Quellen werden für Sicherung oder Restorekopie nicht
migriert. Unbekannte Versionen und zusätzliche oder fehlende Tabellen
beziehungsweise Spalten bleiben gesperrt. Die frühere gezielte lokale Gegenprobe vor den Medienerweiterungen umfasst 15 bestandene Fälle;
sie verwendet ausschließlich eigene Testdaten und ersetzt keine NAS-Betriebsabnahme.

Die Restorekopie benötigt einen freien Zielnamen einschließlich der zugehörigen `-wal`, `-shm`
und `-journal`-Namen. Schon eine vorhandene Begleitdatei stoppt den Auftrag. Bei einer Störung
während der Prüfung wird nur die als eigene Kopie identifizierte, bytegleiche Zieldatei entfernt.
Eine zwischenzeitlich veränderte Zieldatei bleibt zur Prüfung erhalten.

Im lokalen Integrationsnachlauf am 1. November hat ein einzelner negativer Test eine absichtlich
gesetzte Version 2 unerwartet angenommen. Die Ursache ist nicht belegt: Eine begrenzte Matrix
mit 16 synthetischen Fällen und der gebundene Fünf-Dateien-Gegenlauf mit **40/40 Fällen** weisen
die unbekannten Formate korrekt ab. Der Test bestätigt jetzt unmittelbar seine gesetzte
Quellversion und protokolliert bei Wiederauftreten zusätzlich Quell-, Kopie- und Manifestschema.
Die Produkt-Schemaregeln bleiben unverändert. Dies ist kein als behoben ausgewiesener NAS-Fehler;
der tatsächliche produktive Sicherungs-/Restorenachweis oben bleibt davon getrennt.

Die weitere lokale Gegenprüfung vom 1. November fand einen Fehler beim Entfernen eines eigenen,
wegen unbekannter Tabelle abgewiesenen Sicherungsziels. Die Schemaablehnung und der Nachweis
unveränderter Quelldaten bestanden bereits; ausgestellt wurde kein falsches Sicherungsmanifest.
Das zuvor stumm behandelte Aufräumfehlschlagen wird nun sichtbar und bei vorübergehender Sperre
begrenzt wiederholt. Jeder Versuch prüft erneut das ausschließlich selbst angelegte Ziel und seine
verknüpfungsfreie absolute Lage. **30/30 NAS-Fälle ohne Skips** einschließlich kurzzeitiger und
dauerhafter Sperre bestehen. Das ist keine Änderung oder neue Betriebsabnahme des aktiven NAS.

Der lokale Nachlauf veröffentlicht `snapshot.json` erst, wenn die Datenbank geprüft und der
vollständige Nachweis geschrieben ist. Ein unterbrochener Teilschreibvorgang wird dadurch bei
der Auswahl fertiger Sicherungen übersprungen. Die neue Option `verify` prüft Datenbank,
Nachweis, Projektkennung und Mediendaten schreibgeschützt an Ort und Stelle. Sie meldet nur bei
einem vollständig bestätigten Stand `verified: true` und endet bei Fehlern mit einem Fehlercode.

Für die spätere zeitgesteuerte Übernahme zuerst `backup` mit einer neuen Kennung abschließen.
`export-copy` prüft diese Sicherung und kopiert `project.sqlite` und `snapshot.json` bytegleich in
einen neuen Ordner am bestätigten Sicherungsziel. Der fertige Nachweis erscheint dort erst nach
der Inhaltsprüfung und dem Schreiben der Datenbank. Ein vorhandener Zielordner bleibt erhalten.
Ein unterbrochener Export bleibt ohne fertigen Nachweis sichtbar. Eine Wiederholung benötigt
eine neue Kennung.
`verify` prüft das exportierte Paar am Ziel. `restore-copy` stellt es getrennt an einem freien Pfad
wieder her. Alle Schritte der geplanten DSM-Aufgabe müssen erfolgreich sein, bevor ein Lauf als
abgeschlossen gilt. Der Aufruf setzt ein ausdrücklich bestätigtes, getrenntes Sicherungsziel voraus.
Ein anderer Pfad auf demselben Datenträger belegt keine Unabhängigkeit. Die getrennte Bereitstellung
des Werkzeugs, das Ziel und die Wiederherstellung auf dem NAS bleiben eigene Betriebsprüfungen.

### Ein Aufruf für die zeitgesteuerte Sicherung

`run-backup` verbindet Online-Sicherung, Export und erneute Prüfung am Ziel. Mit
`--expect-project` muss auch die Projektkennung der SQLite-Datenbank zum Auftrag passen. Bei
einem abweichenden Projekt bleibt das Sicherungsziel unverändert. Auf dem tatsächlich
eingebundenen Sicherungsziel wird einmalig die Datei `.arten-explorer-backup-target` mit einer eigenen
UUID eingerichtet. Die DSM-Aufgabe erhält dieselbe UUID. Der Lauf prüft Ordner und Kennung vor dem
Snapshot, vor dem Export und nach der Zielprüfung. Die Kennung gehört ausschließlich auf den
bestätigten Sicherungsspeicher. Ihre Aufgabe ist die Erkennung eines fehlenden oder ausgetauschten
Ziels. Die Unabhängigkeit des Speichers ist gesondert zu belegen.

```text
node --no-warnings nas/snapshot.mjs run-backup /project/project.sqlite /project/backups /backup-target <Ziel-UUID> --expect-project <Projekt-UUID> --confirm-local-storage
```

Die vorhandenen Elternordner bleiben getrennt. Jeder Lauf legt seinen eigenen `snapshot-<UUID>`-Ordner
an. Nach erfolgreicher Prüfung entfernt er nur das geprüfte Zwischenpaar aus seinem eigenen Ordner.
`verified: true` bezieht sich auf die Kopie am Ziel. `stagingRemoved: false` kennzeichnet, dass die
Zwischenablage nach einem erfolgreichen Export noch zu prüfen ist. Bei einer Unterbrechung vor
der Zielprüfung bleibt die vorhandene Zwischenkopie zur Prüfung erhalten. Der Zeitplan gehört in
die separate DSM-Aufgabe. Eine Wiederherstellungsprobe aus genau diesem Sicherungsziel ist für
die Betriebsabnahme erforderlich. [DSM-Aufgabenplaner](https://kb.synology.com/en-us/DSM/help/DSM/AdminCenter/system_taskscheduler)

#### Getrennter Sicherungsaufruf mit dem eingesetzten Image 0.1.9

Die bisher eingesetzte 0.1.9-Fassung kennt `run-backup` noch nicht. Das private Paket
`deployment/nas-backup-tool-019-4a793fbf7ad9/nas-backup-tool-019-4a793fbf7ad9.zip`
enthält `snapshot.mjs` und sein Prüfmanifest. SHA-256 des ZIP:
`ffa39009344f72394c4792761453a2d785c3894ed2c317f2bf5921d69ba5f257`.
Die lokale Windows-Probe mit Node 24.22.1 hat alle 52 Einträge des exakten 0.1.9-Quellarchivs
abgeglichen und nur `nas/snapshot.mjs` in der entpackten Laufzeit ersetzt. Der Aufruf hat zwei
Testkonten, ein Testseitenobjekt und den jüngsten Eintrag aus dem offenen WAL exportiert und aus dem
Ziel bytegleich wiederhergestellt. Quelldatenbank und WAL blieben bytegleich. Der Beleg
`qualification.json` liegt neben dem ZIP. Die Docker- und NAS-Betriebsprobe steht aus.

Der Folgestand mit Projektbindung ist
`deployment/nas-backup-tool-019-8d82838d7057/nas-backup-tool-019-8d82838d7057.zip`.
SHA-256 des ZIP: `9a1375c29ba3b4e3f8e09cd2be9ffa18aa37c7e3b5e799e69fa92ececbfe9c31`.
Die erneute Probe mit dem gebundenen 0.1.9-Quellarchiv bestätigt die Ablehnung eines gültigen
fremden Projekts, die Sicherung bei passender Kennung und die getrennte Wiederherstellung
einschließlich des jüngsten WAL-Eintrags. Der Nachweis liegt neben dem ZIP. Für die folgende
Betriebsprobe gilt der Folgestand mit Projektbindung.

Für die einmalige Betriebsprobe auf der DS923+ das frisch geprüfte Image über seine lokale ID binden.
`AE_PROJECT_UID` und `AE_PROJECT_GID` sind die Kennungen des laufenden Projektdienstes.
`AE_ACTIVE_DATA` bezeichnet dessen lokalen Datenordner, `AE_STAGING` den eigenen Zwischenordner und
`AE_BACKUP_TARGET` das bestätigte unabhängige Ziel. `AE_BACKUP_TOOL` bezeichnet die anhand des Manifests
geprüfte Datei `snapshot.mjs`. `AE_TARGET_UUID` ist die UUID aus der Markierungsdatei am Ziel.
`AE_PROJECT_UUID` stammt aus dem geprüften Sicherungsmanifest des aktiven Projekts. Alle
Bind-Quellen müssen bereits existieren. Der Einmalcontainer verwendet weder Netzwerk noch Projektkonfiguration.
Er bindet Werkzeug und Quelldaten nur lesend ein. Das laufende Image bleibt der Ausgangspunkt und
erfordert für den Sicherungsaufruf keinen Neubau. [Docker-Bind-Mounts](https://docs.docker.com/engine/storage/bind-mounts/)

```sh
docker run --rm --pull=never --network none --read-only --cap-drop ALL \
  --name arten-explorer-independent-backup --security-opt no-new-privileges \
  --user "${AE_PROJECT_UID:?}:${AE_PROJECT_GID:?}" \
  --mount "type=bind,src=${AE_BACKUP_TOOL:?},dst=/app/nas/snapshot.mjs,readonly" \
  --mount "type=bind,src=${AE_ACTIVE_DATA:?},dst=/active,readonly" \
  --mount "type=bind,src=${AE_STAGING:?},dst=/staging" \
  --mount "type=bind,src=${AE_BACKUP_TARGET:?},dst=/backup-target" \
  "${AE_IMAGE_ID:?}" node --no-warnings nas/snapshot.mjs run-backup \
  /active/project.sqlite /staging /backup-target "${AE_TARGET_UUID:?}" \
  --expect-project "${AE_PROJECT_UUID:?}" --confirm-local-storage
```

Der lesende SQLite-Zugriff setzt im WAL-Betrieb die auf demselben NAS vorhandenen und lesbaren
Begleitdateien `project.sqlite-wal` und `project.sqlite-shm` voraus. Wenn das Öffnen scheitert, bleibt
die Betriebsprobe offen. Nach dem Lauf den gemeldeten Sicherungsordner über den NAS-Zielpfad erneut
prüfen und von dort eine getrennte Wiederherstellung ausführen. Erst dann den eigenen DSM-Zeitplan
mit genau diesem Ziel abnehmen. [SQLite zum lesenden WAL-Zugriff](https://www.sqlite.org/wal.html#read_only_databases)

Aufrufe mit einem jeweils neuen Ziel unter dem privaten gemounteten Projektordner:

```text
node --no-warnings nas/snapshot.mjs backup /project/project.sqlite /project/backups/<neue-Kennung> --confirm-local-storage
node --no-warnings nas/snapshot.mjs verify /project/backups/<Kennung> --confirm-local-storage
node --no-warnings nas/snapshot.mjs export-copy /project/backups/<Kennung> /backup-target/<neue-Kennung> --confirm-local-storage
node --no-warnings nas/snapshot.mjs verify /backup-target/<Kennung> --confirm-local-storage
node --no-warnings nas/snapshot.mjs restore-copy /backup-target/<Kennung> /restore-check/<neue-Datei>.sqlite --confirm-local-storage
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
