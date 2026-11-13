# Arten-Explorer für Android

**0.1.13 (13) – Regionen und Familienansicht** ist seit **13. November, 17:02 Uhr** im bestehenden
internen Google-Play-Test verfügbar. Der Gerätetest für diesen Stand steht aus.
[Interne Testteilnahme](https://play.google.com/apps/internaltest/4699370381041214834) ·
[Play-Release 0.1.13](https://play.google.com/console/u/0/developers/7807641178854247191/app/4974698067671388079/tracks/4699370381041214834/releases/10/details)
Mit 0.1.12 bestätigte Felix den Wechsel von 63 auf 65 Arten ohne App-Update. Die 65 Arten waren
auch nach dem Neustart der App im Flugmodus verfügbar.

Der lokale Folgestand **0.1.11 (11)** zeigt die vorab per HTTP-Header gemessenen Größen
der mitgelieferten Fotoreferenzen schon vor der Auswahl. Die Anzeige unterscheidet das nutzbare
Offlinepaket, für die Fortsetzung geprüfte Dateien und im laufenden Abschnitt noch fehlende Dateien.
Beim Öffnen mit neuerem Katalog übernimmt die App reine Textänderungen lokal, sofern die gewählten
Medien gleich geblieben sind. **Daten automatisch aktualisieren** plant beim Öffnen oder nach dem
Projektabgleich auch fehlende oder geänderte Medien der gespeicherten Auswahl ein. Beide neuen
Schalter sind zunächst aus. Ohne Mobilfreigabe wartet Android auf WLAN. Bei einem manuellen
Download bietet die sichtbare App nach dem Wechsel zu mobilen Daten eine Freigabe für diesen Auftrag an.
Der S24-Gerätetest zu Bildschirm aus und geschlossener App wurde in 0.1.10 bestätigt. Der Netzwechsel
und die neuen Schalter benötigen eine Geräteprobe mit dem Folgestand.

Der getrennte technische Anschluss für den strukturierten Projektkatalog liest die Seiten einer
gebundenen Katalogfassung und prüft sie vor der Rückgabe als vollständigen Stand. Der reguläre
Projektabgleich nutzt diese Schnittstelle im Quellstand. Bei einem älteren Dienst ist der bisherige
Katalogweg nur möglich, wenn der Dienst die neue Route ausdrücklich als unbekannt meldet und die App
für dieses Konto noch keinen Bestand im neuen Format geöffnet hat.

Die isolierte HTTPS-Probe vom 9. November verband den Dart-Katalogleser mit dem hashgeprüften
NAS-Quellpaket 0.1.9. Sie las 30 freigegebene Arten auf zwei Seiten und bestätigte dieselbe
Katalogfassung mit einem dritten Aufruf. Darunter waren 29 bisherige Einträge und eine strukturierte
Artseite. Ein unveröffentlichter Testentwurf blieb aus dem Abruf ausgeschlossen. Eine Freigabe
zwischen den Seiten löste beim nächsten Abruf `409 reader_snapshot_changed` aus. Der private
Nachweis heißt `android-reader-catalog-structured-https-20261109.json`. Die Probe verwendet einen
separaten Test-HTTP-Client. Der erste Flutter-Teststarter erreichte die Suite für App-Transport und
Controller wegen der Sperrdatei des installierten SDK noch nicht. Der spätere Nachlauf ist unten belegt.

Der Katalogleser validiert strukturierte Arttexte jetzt bereits beim Abruf. Die Artansicht übernimmt
Titel, Einleitung und Fachabschnitte mit Zwischenüberschriften und Listen. Quellen liegen im
Infofenster. Bewusst leere Fachabschnitte bleiben im vollständigen Offlinekatalog gespeichert und
erscheinen ohne Inhalt nicht als eigene Ansicht. Die kompakte Artenliste speichert die zusätzliche
Textstruktur nicht mit. Die isolierte Dart- und HTTPS-Probe prüfte die Gliederung und den vollständigen
Serialisierungsrundlauf. Der private Nachweis heißt `android-reader-editorial-cache-20261109.json`.
Die sichtbare App-Probe steht aus.

Der geschützte Abruf unterscheidet Projektbilder von normalen Artdateien. Beide Wege binden die
Dateikennung an die aktuelle Projektanmeldung und verwenden die dafür vorgesehene HTTPS-Route.
Die Übertragung prüft Medientyp, erwartete Länge, SHA-256-Antwortkopf und die tatsächliche
Prüfsumme der Bytes. Nur der vollständige Abschluss darf eine Datei zur Anzeige oder Speicherung
freigeben. Der öffentliche Medienabruf entfernt Sitzungskopf und Cookies.
Die isolierte Probe mit dem NAS-Quellarchiv 0.1.9 bestätigte ein PNG-Galeriebild, ein WebP-Porträt,
eine JPEG-Karte und eine MP3-Aufnahme. Veränderte Bytes, Weiterleitungen, eine fremde Projektbindung
und ein unveröffentlichter Dateibeleg wurden abgewiesen. Der private Nachweis heißt
`android-reader-protected-media-20261109.json`.

Die normale Artansicht nutzt diesen Abruf für geschützte Bilder und Karten. Für geschützte
Tierstimmen erhält der Player eine lokal vorbereitete, vollständig geprüfte Datei. Der Player entfernt
diese Zwischenablage beim Wechsel oder Schließen. Der Offline-Download speichert geschützte Originale
im App-Verzeichnis des jeweiligen Projektkontos. Die Anmeldung wird vor dem Paketabschluss erneut
geprüft. Die wählbare Galerie bleibt im Paket ohne Fotopaket ausgeschlossen. In der lokalen
Flutter-Laufzeitprobe gegen das genaue NAS-Quellarchiv bestanden Anmeldung, regulärer Abgleich,
Bild- und Tonbereitstellung, je vier Dateien im Vorder- und Hintergrundweg sowie Abmeldung und
Kontowechsel während des Downloads. Der private Nachweis heißt `android-reader-protected-app-20261109.json`.
Die Android-Ausführung des Hintergrunddienstes, tatsächliche Wiedergabe und die Bedienprüfung auf
S24 und S25 bleiben eigene Geräteabnahmen.

Die erste Paketvorprüfung vom 9. November bestätigte die vorhandene eigene Play-Signierung und
den hashgebundenen öffentlichen Katalog. Am ursprünglich konfigurierten Android-SDK-Ordner
fehlten Plattform 36, Build-Tools 36.0.0 und NDK 28.2.13676358. Die 26 Paketprüferfälle sind
bestanden.

Im Nachlauf sind Plattform 36, Build-Tools 36.0.0, NDK 28.2.13676358, Platform-Tools 37.0.1,
CMake 3.22.1 mit Ninja und Command-Line Tools 22.0 in einer eigenen SDK-Kopie unter
`temp/android-sdk-20261109` eingerichtet. Alle sechs Archive stammen aus dem Android-Repository von Google. Größe und
veröffentlichte Prüfsumme wurden vor dem Entpacken abgeglichen. Der Folgelauf besteht mit
**169/169 Flutter-Tests**, Analyse ohne Befund und gebautem ARM64-Debug-APK. Die Gegenprobe
mit absichtlich fehlender Plattform 999 stoppt wie erwartet ohne Nachinstallation. Der
Werkzeugbestand bleibt dabei und beim Debug-Bau unverändert. Beide Prüfwege melden fehlende
Platform-Tools, CMake oder Ninja bereits vor dem eigentlichen Bau. Die Play-Vorprüfung prüft zusätzlich
`apkanalyzer`, den Flutter für die Prüfung nativer Symbole im fertigen Release-Bundle benötigt.
Ein bereits von Gradle erzeugtes Zwischenpaket wurde damit als Diagnose gelesen und privat erhalten.
Die strikte Zeitprüfung für ein neu gebautes Release-Bundle bleibt wirksam.

Der frische signierte Bau von **0.1.11 (11)** ist abgeschlossen. Der Paketprüfer bestätigt die
vorhandene Play-Uploadsignatur, Paketname, Version, SDK 26/36 und den öffentlichen Katalog.
Das private AAB umfasst **61.268.975 Bytes** mit SHA-256
`2a9ecef9562c2a66fbd395ba39d88e259c5022a0ff853311a23d2a94dbe3bb2b`.
Datei: `data/mobile-signing/reports/arten-explorer-play-0543e68b619b4040948aff8eda8d1923.aab`.
Die Werkzeugmetadaten blieben beim signierten Bau unverändert; die temporäre Signierdatei und
Bausperre wurden geschlossen und entfernt. Play-Upload und Geräteabnahme stehen aus.

Der erste S25-Test mit 0.1.10 lief laut Rückmeldung grundsätzlich. Der lokale Folgestand setzt
das Feedback zum Einstieg um. Die App bietet zuerst **Heimische Tierwelt**, **Afrika**, **Costa Rica**
und **Island** an, soweit dort Arten vorhanden sind. Danach folgen die Tiergruppen der gewählten
Region. **Alle Regionen** öffnet den Gesamtbestand. Die Suche auf der Einstiegsseite findet Arten
über alle Regionen hinweg. Über **Region wechseln** geht es zurück zur Auswahl.
Die Zuordnung folgt der FN-Website, auch wenn der Katalog offline verwendet wird. Arten ohne eine
zuordenbare FN-Artseite bleiben unter **Ohne Regionszuordnung** und im Gesamtbestand auffindbar.

Der vorherige [Play-Release 0.1.9 (9)](https://play.google.com/console/u/0/developers/7807641178854247191/app/4974698067671388079/tracks/4699370381041214834/releases/7/details)
war seit **4. November, 18:14 Uhr** im internen Test verfügbar. Er enthält die Offlinekorrekturen,
das **Fotopaket**, den Papierkorb je Kategorie und die moderate Anhebung der Tierstimmen.
Der [signierte Build ist privat dokumentiert](#bauen-und-prüfen). Der Bereitstellungsbeleg liegt unter
`data/website/checks/nas-implementation-20261101/deployment/mobile-offline-20261104/play-publication.json`.
Felix bestätigt am 4. November auf dem S24 Ultra den Download nur fehlender Inhalte und das
gezielte Entfernen der Verbreitungskarten. Der Fotopaket-Papierkorb war dabei nicht Gegenstand
seines Gerätetests. Die Lautstärke der Tierstimmen bleibt ihm zu niedrig.

Für **0.1.10 (10)** sind acht Artüberschriften im App-Katalog redaktionell korrigiert. Die
Korrekturen sind jeweils an den exakt übernommenen Quelltitel gebunden. Die öffentliche
Website-Aufnahme und ihre Prüfsumme bleiben als Herkunftsbeleg erhalten. Die Katalogübernahme,
die App-Prüfroutine und die Paketprüfung kontrollieren alle Überschriften zusätzlich auf
auffällige Groß-/Kleinschreibung. Die Paketgegenprobe weist eine fehlerhafte Überschrift
trotz passender Prüfsummen ab. Auch der bekannte Fehler beim Panama-Kapuzineraffen wird geprüft.
Die Android-Analyse, 138 App-Tests, 26 Paketprüfungen und der Android-Prüfbau sind bestanden.
Das private Play-Bundle wurde gebaut und seine Signatur geprüft. Der Beleg liegt unter
`data/mobile-signing/reports/build-0d866a8b1fa8490fa7c9b62c9c606eeb.json`.

Der [vorherige Play-Release 0.1.8 (8)](https://play.google.com/console/u/0/developers/7807641178854247191/app/4974698067671388079/tracks/4699370381041214834/releases/6/details)
war seit **3. November, 20:23 Uhr** im bestehenden internen Test verfügbar. Der Beleg liegt unter
`data/website/checks/nas-implementation-20261101/deployment/mobile-qr-20261103/play-publication.json`.

Die Artengruppen starten eingeklappt. Neben der
Artenzahl steht **Alles ausklappen**. Bei einer Suche werden Treffer direkt angezeigt.
Auf Artseiten stehen Untertitel und FN-Link über der Galerie, unter den Bildern steht nur
der Bildzähler. Kurze Einträge wie Lebensraum und Fortpflanzung beim Buckelwal stehen kompakt.
**Verbreitung** folgt auf **Aussehen** und enthält weiterhin Text und Karte.

Die mobile FN-Website zeigt Steckbrief und Status vor Taxonomie und Tierstimme. Die App bündelt
Steckbrief, Status und Trend unter **Allgemein**. Darauf folgen **Taxonomie**, **Tierstimme**
bei vorhandener Aufnahme und die Fachabschnitte in Website-Reihenfolge. In der App bleibt die
Karte mit dem Verbreitungstext zusammen.
Das Spektrogramm gehört zum Player und zeigt die Wiedergabeposition. Antippen oder der Zeitregler
ändern die Position. Start/Pause, Zeitregler und Zeitangabe liegen direkt unter der Tonspur.
Verweigert Android die Audiofreigabe, zeigt der Player einen Hinweis. Felix bestätigt die
hörbare Wiedergabe des Alpenstrandläufers in 0.1.8 auf dem S24 Ultra auch im Flugmodus.
Die wahrgenommene Lautstärke ist dort zu niedrig. Die Quelldatei misst integriert −18,1 LUFS
und erreicht −1,2 dBFS True Peak. Version 0.1.9 hebt die Audioausgabe der
Android-Playersitzung moderat um bis zu 4 dB an. Die hörbare Wirkung ist am Gerät zu prüfen.
0.1.10 erhöht diesen Zielwert auf 10 dB. Android komprimiert dabei Signalspitzen, die den
verfügbaren Bereich überschreiten. Die tatsächliche Lautstärke ist am Handy nachzuprüfen.
[Android-Dokumentation zum Lautstärkeeffekt](https://developer.android.com/reference/android/media/audiofx/LoudnessEnhancer)
Für Bisamratte, Buckelwal und Alpenstrandläufer stimmen die öffentlich abrufbaren
MP3s und Spektrogramme bytegenau mit den Verweisen des Offline-Katalogs überein.
Der interne Teststand **0.1.8 (8)** ergänzt den Kameraeinstieg **QR-Code scannen**. Die App
zeigt die Zieladresse vor dem Verbindungsaufbau. Die Kameraberechtigung wird beim Scan angefordert.
Die QR-Erkennung läuft mit [ZXing Android Embedded 4.3.0](https://github.com/journeyapps/zxing-android-embedded)
lokal. App-Analyse, **134 App-Tests**, **25 Paketprüfungen**, Android-Prüfbau und Signatur
des Play-Bundles sind bestätigt. Laut Play-Vorschau bleiben alle bisher unterstützten Smartphones
kompatibel. Die Warnung betrifft fünf Tablet-, ein TV- und 17 Auto-Gerätemodelle.
Der QR-Scanner ist auf dem S24 Ultra bestätigt. Die tatsächliche Kopplung mit dem passenden
Dienststand auf dem NAS und die S25-Probe stehen aus.

Der Vorgänger **0.1.6 (7)** mit dem Spektrogramm-Player wurde am **3. November, 19:57 Uhr**
im internen Test bereitgestellt. Der damalige Nachweis liegt unter
`data/website/checks/nas-implementation-20261101/deployment/mobile-audio-20261103/play-publication.json`.

Der Vorgänger **0.1.5 (6)** wurde am **3. November, 18:46 Uhr** im internen
Google-Play-Test bereitgestellt. Der signierte App-Bundle-Bau und der damalige Play-Status
sind geprüft. Die
Bereitstellungsquittung liegt unter
`data/website/checks/nas-implementation-20261101/deployment/mobile-offline-20261103/play-publication.json`.
Bedienfeedback zu diesem Stand liegt vom S24 Ultra vor.

Alle Arten verwenden denselben Artkopf. Der FN-Untertitel
erscheint auch bei unterschiedlicher Schreibweise des Webseitentitels direkt beim Bild und
Website-Link. Die Bildergalerie steht oben als Wischansicht mit Bildzähler. Bei fehlenden
Galeriefotos dient das Artporträt als Ersatz. Porträt, Galeriebild und Verbreitungskarte öffnen
die Zoomansicht beim Antippen.

**Alle Tiergruppen** zeigt die Arten alphabetisch innerhalb der vorhandenen Tierklassen.
Eine einzeln gewählte Tiergruppe bleibt nach Familien gegliedert. **Offlineinhalte** stehen
im Profilmenü. **Software-Lizenzen** sind über **ⓘ Informationen** erreichbar.
Die deutschen Überschriften aller 42 Familien des mitgelieferten Bestands stammen aus der
Arten-Explorer-Taxonomie. Der wissenschaftliche Artname bleibt als zweite Zeile erhalten.

**Allgemein** zeigt die deutschen IUCN-Statusbezeichnungen und den Trend mit den vorhandenen
FN-Websitegrafiken. Die 13 geprüften Symbole werden mitgeliefert und sind offline verfügbar.
**Brut** nutzt kompakte Zeilen.
Unter **Verbreitung** steht die Karte unter dem Text. Die aufklappbare **Tierstimme** erscheint
bei vorhandener Aufnahme. Der öffentliche Anfangsbestand enthält 60 geprüfte Spektrogramm-Verweise.
Die Spektrogramme werden mit der entsprechenden Offlineauswahl für Tierstimmen gespeichert.
Für **0.1.5 (6)** sind 127 App-Tests, die statische Analyse, 24 Paketprüfungen und der
lokale Android-Prüfbau für ARM64 bestanden.

Der Vorgänger **0.1.4 (5)** war seit **3. November, 17:23 Uhr** im internen Google-Play-Test
verfügbar. **122/122 App-Tests**, Analyzer, Android-Prüfbau und
signiertes App Bundle sind bestätigt. Den Release bindet die private Quittung unter
`data/website/checks/nas-implementation-20261101/deployment/mobile-ui-20261103/play-publication.json`.

In **0.1.4** sortiert die Hauptliste nach deutschen Artnamen.
Über **Alle Tiergruppen** lassen sich etwa Vögel, Säugetiere, Reptilien und Amphibien wählen.
Innerhalb der gewählten Gruppe folgen Familienüberschriften und alphabetisch sortierte Arten.
Die kleinen Familienporträts am rechten Rand springen zu diesen Überschriften.
Die Artansicht zeigt beide Artnamen zusammen, setzt den passenden Website-Untertitel unter das
Artbild und bietet dort den direkten FN-Link. Die Taxonomie ist kompakter. Die Verbreitungskarte
und der zugehörige Verbreitungstext stehen in derselben aufklappbaren Ansicht. Quellen und
Vergrößerung sind über Symbole am Medium erreichbar. Galerie-Slider, Tonwellenform und die
Übernahme der Websitegrafiken für Status und Trend stehen weiter aus.

Der vorherige Paketstand vom **2. November: 0.1.3+4** wurde mit 120/120 Tests und fehlerfreier Analyse
tatsächlich gebaut. Das Debug-APK und das eigene signierte App Bundle sind geprüft; Logo, Appkennung,
neue Downloadkonfiguration, Signatur und unveränderte SDK-Komponenten sind bestätigt. Die Version
wurde am **2. November um 21:16 Uhr** im internen Play-Track bereitgestellt. Die Hintergrund- und
Bildschirm-aus-Prüfung auf dem S24 steht für den aktuellen Stand weiter aus.

Das private ARM64-Debug-APK **0.1.2+3** ist am **1. November 2026** tatsächlich gebaut und geprüft:
Analyzer ohne Befund, **89/89 Tests**, bestätigte Debugsignatur, korrektes App-/Startsymbol und
gebundener öffentlicher Anfangskatalog. Die optionale Offlinegalerie ist in diesem Paket enthalten.
Lesendes Nachschlagewerk mit mitgeliefertem öffentlichen Anfangsbestand und
getrenntem angemeldeten Zugriff auf die im gemeinsamen Projekt freigegebenen Arten.
Erste Zielgeräte sind Samsung Galaxy S24 Ultra und S25 Ultra. Die App ist ein eigenständiges
Flutter-Android-Projekt; Bearbeitung, Lightroom und die globale Referenzdatenbank bleiben am PC.

Am **1. November** beauftragt Felix zusätzlich den Zugang über **Google Play**, entsprechend dem
privaten Numis-Testzugang im bestehenden verifizierten Entwicklerkonto. Arten-Explorer erhält eine
eigene Appkennung, eigene Uploadsignierung und einen eigenen internen Testlink. Der private
Testrelease **0.1.2 (3)** ist am **1. November um 21:28 Uhr** tatsächlich veröffentlicht: Google Play
bestätigt den aktiven internen Track und die Verfügbarkeit für interne Tester. Die eigene Appkennung
lautet `de.fnwildlifetravel.arten_explorer`; ausgewählt ist ausschließlich **Arten-Explorer privat** mit
Felix' freigegebenem Google-Konto. Der tatsächliche Teilnahmelink öffnet eine gültige Einladung.
Die Veröffentlichung allein belegt keine Zielgeräteabnahme. Felix bestätigt anschließend Installation
und erste Bedienung auf seinem S24; die offenen Punkte folgen unten. Das oben genannte Debug-APK
bleibt als früherer eigener Prüfbeleg erhalten.

## Verwendung

### Bedienrückmeldungen vom 1. November

Felix bestätigt die Installation über Google Play und einen begonnenen Offline-Download. Das ist
eine erste echte Bedienrückmeldung, keine vollständige S24-/S25-Abnahme. Weitere Kommentare werden
gesammelt. Nach seiner anschließenden Priorisierung haben die übrigen bestätigten Projektbereiche
Vorrang; eine umfassende Appüberarbeitung wird mit den weiteren Bedienrückmeldungen gebündelt.
Das Handy dient als lesendes Nachschlagewerk unterwegs; für Artansichten ist die Website die Referenz.

| Punkt | Befund und nächster Schritt |
| --- | --- |
| Bildschirm aus während Offline-Download | Unterbrechung gemeldet; eine echte Abmeldung ist im Downloadpfad nicht belegt. Neuer Quellstand: dauerhafter Auftrag, eigene Android-Ausführung, Benachrichtigung, Abbruch und Wiederaufnahme. Lokale Qualifikation läuft; Bildschirm-aus-/Netzwechselprüfung auf dem S24 bleibt offen. |
| Datenmenge und Mobilfunk | Neuer Quellstand: Warnung vor mobilen/getakteten Verbindungen, standardmäßige WLANbindung des Auftrags, HEAD-Größenvorabprüfung und getrennte vorhandene/fortsetzbare/gewählte Mengen. Unbekannte Größen werden nicht geschätzt. Noch keine neue Play-Auslieferung. |
| Kleinere Offlinefotos | Quellkatalog bleibt `1500w`; neue Downloads fordern separat `750w` an. Drei aktuelle HEAD-Stichproben mit den App-Accept-Headern ergeben 119–131 kB bei `750w` und 214–311 kB bei `1500w`. Das sind einzelne Beispiele, keine gemessene Gesamtpaketgröße. Neue Dateibindungen erhalten Herkunft und tatsächliche Downloadadresse getrennt. |
| Alphabetische Liste und Tiergruppen | Sortierung nach deutschem Anzeigenamen und Klassenfilter sind im Domainquellstand vorbereitet. Formatierung, Analyse ohne Befund und alle 25 Katalogtests einschließlich vier neuer Fälle sind bestanden. Die Filterbedienung ist noch anzuschließen; kein neues Paket gebaut oder ausgeliefert. |
| Artansicht nach Website | Bild und Titel/Untertitel oben, bestehende Abschnittsfolge, kompakte Taxonomie-Pyramide und passende Schriftgrößen übernehmen. Leere Titel-/Kartenhalter werden derzeit wie Sachabschnitte dargestellt; die Karte erscheint dadurch doppelt und Ton zu spät. Interne Detailfelder aus dem normalen Lesefluss nehmen; Quellen/Lizenzen und erforderliche Bedienhinweise erreichbar halten. |
| Birkenzeisig und Eisvogel | Die kleingeschriebene Birkenzeisig-Überschrift stammt bereits aus der Website; der deutsche Artname ist korrekt. Der Eisvogel-Untertext ist ebenfalls im Export vorhanden, wird aber an der falschen Stelle dargestellt. Rollen und Position aus der Websiteprojektion erhalten; keine öffentliche Websitekorrektur ausgeführt. |

Die Größenstichprobe und der konkrete Seitenabgleich liegen privat im bestehenden
`data/website/checks/nas-implementation-20261101/deployment`-Belegbereich. Der neue Android-Anschluss
verwendet ab API34 einen [nutzerinitiierten Downloadauftrag](https://developer.android.com/develop/background-work/background-tasks/uidt),
darunter einen eigenen sichtbaren Datenübertragungsdienst. Neue Berechtigungen gelten erst für das
künftige Paket. Google Play bestätigt inzwischen **0.1.3 (4)** im bestehenden internen Track als
verfügbar; der zuletzt von Felix tatsächlich benutzte Handystand war **0.1.2+3**.

Der gebündelte Quellnachlauf ist als **0.1.3+4** vorbereitet. Die vollständige lokale Serie besteht
mit **120/120 Tests**, der Analyzer meldet keine Befunde. Zwei bestehende Verhaltensfehler waren
zuvor gezielt rot reproduziert: unnötiger erneuter Fotoabruf nach Unterbrechung und weiterhin
angeforderte 1500w-Fassung. Zusätzliche Fälle prüfen Bestands-/Identitätswechsel, verspätete
Auftragsantworten, Erhalt alter Pakete, Dateibeschädigung und Fortschritt nach Wiederöffnung.
Die echten Android-/Flutter-Kotlinquellen sind gegen API36 kompiliert; der anschließend ohne
Androidlaufzeit ausgeführte gemeinsame Schreibschutz besteht **6/6** Szenarien. Das ist eine
Quell- und Kernqualifikation, keine UIDT-/Bildschirm-aus-Abnahme auf einem Handy. Analyzer-/Testlogs
und gebundene Quellen liegen privat unter
`data/website/checks/nas-implementation-20261101/deployment/mobile-offline-20261102/`.
Die Kotlin-Rohdatei wurde nicht dauerhaft geschrieben; ihr Beleg ist ausdrücklich die gebundene
Zusammenfassung des tatsächlich ausgeführten Toollaufs. Der neue Paketbau ist anschließend
einschließlich tatsächlicher Android-Konfiguration und eigener Signierung bestanden. Die separate
Playbereitstellung ist ebenfalls ausgeführt: **0.1.3 (4) – Offline-Download und Übersicht**, bestehender
interner Test, Anzeige **Für interne Tester verfügbar**, veröffentlicht am **2. November, 21:16 Uhr**.
Die bestehende Testerliste und Produktion wurden nicht geändert. Screenshot und tatsächlicher
Seitenzustand liegen im selben Belegordner. Google nennt für die Anzeige von Änderungen gewöhnlich
bis zu eine Stunde, mit möglichen längeren Verzögerungen; die Geräteaktualisierung bleibt unbestätigt.

### Startseitenrückmeldung vom 2. November

Felix liefert die tatsächlich angezeigte Startseite und zwei Vergleichsabbildungen aus Costa-Rica-
und Merlin-App. Für den nächsten gebündelten Appnachlauf gilt: alphabetisch nach deutschem Artnamen
sortieren; Suche und Artenliste als Alltagsfunktionen sichtbar halten; Datenquelle/-stand und
Offlineverwaltung einschließlich Speichergröße unter **ⓘ** erreichbar machen. Die bisher dauerhafte
Zusatzzeile und untere Offlineleiste sollen aus der Hauptansicht entfallen. Tiergruppenfilter sind
in dieser Rückmeldung zunächst als spätere Ergänzung eingeordnet. Anschließend konkretisiert Felix:
Felix präzisiert anschließend die gewünschte Hierarchie: **Säugetiere, Vögel, Reptilien, Amphibien
usw. → weitere Untergruppen → Arten**. Die obere Ebene orientiert sich an der Costa-Rica-App.
Innerhalb der gewählten Tiergruppe dient das weitere Merlin-Bild als Vorbild für Überschriften
wie **Entenvögel** und seitliche Gruppenpiktogramme zum schnellen Springen zwischen den Untergruppen.
Die Arten stehen innerhalb jeder Untergruppe alphabetisch nach deutschem Namen. Der bisher
vorbereitete Klassenfilter allein erfüllt diese tiefere Gliederung noch nicht; eine zusätzliche
Zwischenseite für jeden taxonomischen Rang ist damit nicht festgelegt.

Die drei Originalabbildungen sind bytegleich privat unter
`data/website/checks/nas-implementation-20261101/deployment/mobile-feedback-home-20261102/` erhalten.
Die folgenden Artseitenrückmeldungen werden mit dieser Startseitenrückmeldung gebündelt.
Die übrigen Projektbereiche behalten die bereits bestätigte höhere Priorität.
Die daraufhin gebaute und intern bereitgestellte Fassung 0.1.3 führt der aktuelle Paketstand oben.

Im vorbereiteten Quellstand 0.1.3 öffnet **ⓘ** jetzt das tatsächliche Informationsmenü mit Datenstand,
Status, Offlineverwaltung und Software-Lizenzen. Die dauerhafte Datenzeile und Offlineleiste entfallen
aus der normalen Hauptansicht; während eines Downloads bleibt ein direkter Fortschrittszugang sichtbar.
Der Informationszugang bleibt auch während eines Auftrags nutzbar. Der erweiterte Widgetfall und
die vollständige 120er Serie bestehen; Tier-/Untergruppen und die umfassende Artseitenanpassung
bleiben für den nachfolgenden Appumbau offen.

### Offline-, Informations- und Zugangsrückmeldung vom 2. November

Felix beendet die Durchsicht des vorhandenen Appinhalts mit diesen weiteren Punkten:

- Der Offlinebereich muss je Kategorie vollständig vorhandene, teilweise vorhandene und fehlende
  Downloads sowie bereits gespeicherte und noch zu ladende Mengen unterscheiden.
- Die heutige Summe **Mediendateien** zählt die gewählte Auswahl; **Bereits auf dem Gerät** zählt
  tatsächliche Index-/Paketdateien und den gesamten Medienordner. Auswahl, Speicherbelegung und
  vorübergehende/noch nicht bestätigte Dateien dürfen nicht wie derselbe Wert dargestellt werden.
- Ein Haken ändert heute zunächst nur die Auswahl. Nach erfolgreicher Übernahme ersetzt das neue
  Paket die Auswahl und bereinigt nicht mehr verwendete Mediendateien. Der Ablauf braucht daher
  verständliche Beschriftung und eine ausdrückliche, vorab erkennbare Entfernung statt stiller Löschwirkung.
- Websitefotogrößen sollen vor dem Download möglichst ermittelt und nach dem Speichern exakt
  angezeigt werden. Der gebundene öffentliche Katalog verwendet für alle 852 Fotos `1500w`, enthält
  aber keine erwarteten Bytegrößen. Felix stellt klar: Die etwa 4,26 GB sind ausschließlich eine
  Hochrechnung von 852 × 5 MB, kein gemessener Gerätespeicherverbrauch. Auch 5 MB je Bild sind
  keine bestätigte Größe aller Fotos. Quellenabruf, tatsächliche Bildgrößen,
  Dubletten und erhaltene Dateien abgebrochener Aufträge gezielt prüfen; handytaugliche Größenprofile vorsehen.
- Downloads müssen als dauerhafter Hintergrundauftrag laufen und nach Unterbrechung wiederaufnehmbar
  bleiben; Bildschirm aus und Verlassen der Ansicht dürfen den Nutzer nicht zum Zuschauen zwingen.
  Die bereits bestätigte Mobilfunkwarnung und angezeigte Gesamtgröße bleiben Teil dieses Nachlaufs.
- **ⓘ** soll ein echtes Informationsmenü öffnen. Heute verwendet der öffentliche Modus denselben
  Einstieg wie `refresh()`, der nur den Statussatz ändert; während Download/Busy ist der Button deaktiviert.
  Datenquelle/-stand, Offlineverwaltung sowie Quellen-/Nutzungshinweise gehören zum verständlichen Infozugang.
- Software-Lizenzen bleiben über einen einzelnen untergeordneten Button erreichbar; diese Platzierung
  findet Felix passend. Sie sind von Bild-/Tonquellen zu unterscheiden.
- Der öffentliche mitgelieferte Anfangsbestand benötigt keine Projektanmeldung. Persönliche Anmeldung
  schützt den gemeinsamen NAS-Bestand. Felix wünscht den komfortablen QR-Einrichtungsweg statt der
  manuellen Adresse-/Benutzer-/Passworteingabe am Handy; der installierte Stand bietet ihn noch nicht.

Die Download-/Speicherfehler haben Vorrang vor der umfassenden optischen Appüberarbeitung.

### Artseitenrückmeldung Birkenzeisig und Porträtminiaturen vom 2. November

Die mobile Website bleibt die Inhalts-/Gestaltungsreferenz; die vorhandene aufklappbare Gliederung
gefällt Felix grundsätzlich. Seine konkreten Änderungen:

| Bereich | Gewünschte Darstellung |
| --- | --- |
| Kopf | Deutscher Artname und direkt darunter der wissenschaftliche Name. Ein kurzer klickbarer Link zur passenden FN-Artseite muss früh sichtbar sein; die App soll Websitebesuche unterstützen. |
| Bilder | Galerie oben als Slider in vorhandener Reihenfolge; bei fehlenden oder nicht offline bereitgestellten Fotos das Artporträt verwenden. Vergrößern als kleines Symbol unten rechts am Bild. |
| Quellen | Quellen- und Nutzungshinweise gesammelt unter **ⓘ** erreichbar halten; nicht als wiederholte Text-/Buttonzeilen unter jedem Medium. |
| Titelrolle | Die leere aufklappbare Titelzeile „birkenzeisig – Vogel karger Landschaften“ entfällt. Keine Titelrolle als leeren Fachabschnitt ausgeben; echte Untertitel gemäß bereits vereinbartem Websitebezug am Seitenkopf einordnen. |
| Taxonomie | Kompakte Taxonomiepyramide nach Websitevorbild statt der langen Liste groß gesetzter Einzelränge. |
| Allgemein | Verständliche Artangaben mit vorhandenen Status-/Trendgrafiken wie auf der Website; technische Registerfelder wie Assessment ID aus dem normalen Lesefluss nehmen. |
| Karte | Tatsächliche Karte in **Verbreitungskarte** anzeigen; den zusätzlich erzeugten Medienblock **Verbreitung** entfernen. Echte fachliche Verbreitungstexte nicht pauschal löschen. Quellen unter **ⓘ**, Vergrößerung als Symbol. |
| Ton | **Tierstimmen** statt **Tonaufnahmen**, mit Wiedergabe und vorhandener Audioansicht/Wellenform nach Websitevorbild; Quellen unter **ⓘ**. |
| Listenminiatur | Vollständiges einheitliches 4:5-Artporträt ohne Beschneidung; Bild weiter links und mehr Raum für den Namen. Illustrationen beibehalten. |

Die acht weiteren Originalabbildungen sind bytegleich privat unter
`data/website/checks/nas-implementation-20261101/deployment/mobile-feedback-species-20261102/` erhalten.
Der gezielte Quellenabgleich bestätigt den Miniaturfehler: `MediaImage` verwendete bei kompakten
Rasterbildern `BoxFit.cover`; das tatsächlich vollständige Graureiher-Porträt ist 1280 × 1600 Pixel groß.
Im neuen Quellstand werden Porträts vollständig eingepasst; andere kompakte Fotodarstellungen behalten
ihre bisherige Anpassung. Der Listenrahmen verwendet 68 × 85 logische Pixel (4:5), liegt links am
Kartenrand und lässt dem Namen mehr Breite. Beide berührten Dartdateien sind formatiert und damit
syntaktisch geprüft. Der weitere Artseitenumbau und die zusammenhängende Appprüfung gehören zum
gebündelten Appnachlauf. Noch keine neue Android-Bedienabnahme oder Play-Auslieferung.

### Erste Nutzung

Für Rückmeldungen zur Darstellung kann die tatsächlich installierte Android-App über Windows
**Smartphone-Link → Apps** am PC angezeigt und bedient werden. Microsoft führt S24 Ultra und S25 Ultra
als [unterstützte Geräte](https://support.microsoft.com/de-de/windows/apps/phonelink/supported-devices-for-phone-link-experiences).
Die App läuft dabei auf dem Handy; Kopplung und erforderliche Bestätigungen übernimmt die Person selbst.
Microsoft nennt für die [Apps-Einrichtung](https://support.microsoft.com/de-de/windows/apps/phonelink/setting-up-apps-in-the-phone-link)
das gleiche WLAN. Das erleichtert Kommentare neben dem Appfenster, ersetzt aber keine Prüfung von
Hintergrunddownloads, Bildschirm-aus-, Akku- oder Offlineverhalten auf dem Zielgerät.

1. Den privaten Google-Play-Teilnahmelink mit dem freigegebenen Google-Konto öffnen, die Einladung
   annehmen und die App anschließend über Google Play installieren. Bei der ersten Bereitstellung
   kann Google vorübergehend `de.fnwildlifetravel.arten_explorer (unreviewed)` als Appnamen anzeigen.
   Das frühere Debug-APK ist ein getrennter lokaler Prüfweg.
2. Der **mitgelieferte öffentliche Anfangsbestand** ist sofort ohne Verbindung und ohne Anmeldung
   lesbar. Er enthält Arttexte/Taxonomie sowie Medienverweise aus dem paritätsgeprüften öffentlichen Export.
3. Arten nach deutschem oder wissenschaftlichem Namen suchen. Die Artansicht bietet gegliederte
   Texte, Taxonomie, vergrößerbare Verbreitungskarte, Artbild, Ton und vorhandene Fotogalerie.
4. Über **Profil → Offlineinhalte** die gewünschten Kategorien laden. Karten, Tierstimmen,
   Artbilder und das Fotopaket lassen sich einzeln auswählen.
5. Für den gemeinsamen laufenden Projektbestand über **Mit Projekt verbinden** die sichere
   Projektadresse und persönliche Anmeldung eingeben. Dafür muss der Projektdienst eingerichtet
   und über vertrauenswürdiges HTTPS erreichbar sein.

Der öffentliche Anfangsbestand enthält keine Bild-/Tondateien. Diese bleiben ohne zusätzlichen
Download von einer Verbindung abhängig. Seine mitgelieferten Fachtexte und Taxonomie sind bereits
offline verfügbar; eine Projektanmeldung wird damit nicht vorgetäuscht. Eine neue Appversion kann einen
neu gebundenen öffentlichen Anfangskatalog mitbringen. Vorhandene Projektanmeldung und selbst geladene
Offlinepakete werden dabei erhalten. Ein öffentlicher und ein angemeldeter Bestand verwenden getrennte
Cachebereiche; über die Anmeldungsübersicht kann zwischen ihnen gewechselt werden.

Im angemeldeten Projektbestand wird die Artenliste nach einem bestätigten Inhaltsabruf gespeichert. Fachtexte und Taxonomie bleiben
über eine entsprechende Offlineauswahl nach Wiederöffnung erhalten. Bilder und Töne werden nur durch
den ausdrücklich gestarteten Paketdownload dauerhaft gespeichert. Die angezeigte Größe berücksichtigt
bekannte Mediendaten; fehlende Größen bleiben als unbekannt erkennbar. Das System kann bei Platzmangel
den Download ablehnen, ohne den vorherigen abgeschlossenen Offlinebestand zu ersetzen.

**Inhalte aktualisieren** lädt den aktuellen freigegebenen Katalog. Ein älteres Offlinepaket bleibt
als eigener gebundener Bestand erkennbar und wird durch erneutes Laden aktualisiert. Ein Netzfehler
wird als fehlgeschlagene Aktualisierung angezeigt. Nicht hinterlegte Texte, Medien und bewusst leere
Abschnitte erhalten unterschiedliche Hinweise. Vorhandene Quellen-/Nutzungshinweise stehen direkt
am jeweiligen Medium unter **Quelle und Nutzung**, einschließlich vorhandener NC-Angaben.

## Anmeldung und lokale Daten

Die App fordert ausschließlich lesende Sitzungen an. Das Passwort wird nur für die Anmeldung verwendet
und anschließend aus dem Eingabefeld entfernt; die App speichert es nicht. Sitzung und Gerätezulassung
liegen über `flutter_secure_storage` im geschützten Android-Speicher. Serverursprung, stabile `projectId`
und angemeldete Person binden den privaten Cache. Öffentliche Medien erhalten kein persönliches Bearer-Token.
HTTP, Adressen mit eingebetteten Zugangsdaten und unerwartete API-/Medienweiterleitungen werden abgelehnt.

Die Gerätezulassung kann im Projektdienst widerrufen werden. Ohne Verbindung ist ein zwischenzeitlicher
serverseitiger Widerruf erst bei der nächsten Verbindung erkennbar; bei Wiederöffnung prüft die App die
lokal bekannte Zulassungsdauer. Ein bestätigter 401/403-Fehler beendet den Zugriff auch in geöffneten
Artansichten. **Abmelden** entfernt die lokale Anmeldung; kann der Dienst nicht erreicht werden, zeigt
die App den noch nicht bestätigten serverseitigen Widerruf an. Heruntergeladene Dateien liegen im
privaten Appbereich und werden erst mit passender erneuter Anmeldung wieder verwendet. Android-Cloudbackup
und Geräteübertragung sind für Appdaten ausdrücklich ausgeschlossen. Geräte-/Keystoreprüfung bleibt Teil
der praktischen Abnahme.

Offlinepakete werden gestreamt und erst mit einer atomar ersetzten Paketbeschreibung bestätigt.
Artbilder, Karten, Ton und bereits vorgehashte Galeriedateien müssen weiterhin genau zu ihrer
angekündigten Katalogprüfsumme und vorhandenen Größenangabe passen. Eine fehlende Katalogprüfsumme
gibt diesen Dateien keine allgemeine Ausnahme.

Ausgewählte zusätzliche Websitefotos ohne vorherige Prüfsumme werden separat als **beobachtete öffentliche
Websitefassung** gespeichert. Erlaubt sind ausschließlich die bereits bekannten FN-Galeriequellen auf
`images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/`, HTTPS mit Standardport und dem
vorhandenen optionalen `format`-Parameter. Diese Abrufe senden weder persönliche Tokens noch Cookies und
folgen keiner Weiterleitung. Erlaubt sind statische JPEG-/PNG-/WebP-Fotos mit höchstens 32 MiB,
8192 Pixeln je Kante und 24 × 1024 × 1024 Gesamtpixeln. Dateisignatur, Antwortformat und tatsächliche
Bildlesbarkeit müssen zusammenpassen. Die vollständige Bildprüfung verwendet einen auf höchstens
2048 Pixel je Kante begrenzten Decodierschritt; HTML, SVG, Animationen und kaputte Bilder werden nicht
als fertige Fotodateien gespeichert.

Paketbeschreibung Version 3 bindet Katalogstand, Auswahl und Medienverweise.
Für jede Datei stehen Größe und SHA-256 getrennt dabei. Websitefotos erhalten zusätzlich Herkunftsadresse,
lokalen Beobachtungszeitpunkt, tatsächliches Bildformat und Abmessungen. Das bestätigt die auf diesem
Gerät gespeicherten Bytes, keine Gleichheit mit einer früher exportierten Websitefassung und keinen
garantiert heutigen Websitezustand. Diese Angaben bleiben in der Paketbeschreibung erhalten.
Bei vollständigem aktuellem Paket und derselben Auswahl prüft die App die gespeicherten Dateien
lokal. Version 0.1.8 forderte bei einer neuen Auswahl die Websitefotos erneut an.
Version 0.1.9 verwendet bytegeprüfte Fotos im aktuellen Profil bei identischer
Bildverwendung und Quelladresse wieder. Der ursprüngliche Beobachtungszeitpunkt bleibt erhalten.
Ältere Paketfassungen bleiben bis zum vollständigen neuen Abschluss erhalten. Gehashte gleiche
Dateien bleiben wiederverwendbar. Bestehende Pakete der Version 1 und 2 bleiben lesbar. Neue beobachtete
Fotos verwenden das ausdrücklich gebundene Profil `website-750w-v1`; die tatsächliche Downloadadresse
steht zusätzlich zur unveränderten Herkunft im Paket. Ein erfolgreich abgeschlossenes altes Paket
wird erst nach vollständigem Erfolg der neuen Auswahl ersetzt.

Ein unterbrochener Auftrag hat ein eigenes atomisches Fortsetzungsjournal, gebunden an vollständigen
Katalog, Auswahl und Profil. Fertig geladene Dateien werden erneut geprüft und wiederverwendet; nur
die zuletzt angebrochene Datei beginnt erneut. Das Journal enthält keine Anmeldung. Der Androidauftrag
verwendet eine getrennte Flutter-Ausführung, unabhängig vom Lebenszyklus des sichtbaren Fensters.
Private Aufträge prüfen den geschützten persönlichen Zugang und seine Ablaufgrenze vor dem Abruf.
Der systemweit sichtbare Fortschritt bietet Abbrechen; nach einem bewussten Systemstopp gibt es
keinen heimlichen Neustart. Ein pausierter Auftrag lässt sich mit derselben Kennung fortsetzen.

Android-/Linux-Dateisperren allein sperren nach der [Dart-Primärdokumentation](https://api.dart.dev/dart-io/RandomAccessFile/lock.html)
mehrere Ausführungen im selben Prozess nicht gegeneinander. Deshalb ergänzt eine gemeinsame native
Schreibsperre die Store-Dateisperre; Freigaben sind an die genaue Ausführung und Sperrkennung gebunden.
Download und Entfernen verwenden denselben Schutz. Die tatsächliche Android-Ausführung bleibt trotz
lokaler Prüfungen ein eigener Zielgerätenachweis. Auf dem S24 Ultra lief der Download von
1.038 ausgewählten Dateien einschließlich 852 Websitefotos nach dem Schließen der App im
Hintergrund weiter. Beim Wiederöffnen waren 468 Dateien und 31,7 MB im Fortschritt sichtbar.
Der fertige Bildschirm meldete alle 852 Websitefotos als vollständig verfügbar, 69,8 MB in
der Fotozeile und 178,2 MB belegten Offline-Speicher insgesamt. Die Bildschirm-aus-Prüfung
bleibt davon getrennt.

Beim Update auf 0.1.8 zeigte das S24 Ultra zunächst 1.038 von 1.098 verfügbaren Dateien.
Die 60 neu hinzugekommenen Dateien waren Spektrogramme zu den bereits gespeicherten Aufnahmen.
Felix bestätigt den Abschluss mit allen 1.098 Dateien und 180,0 MB belegtem Speicher.
Seit Version 0.1.9 unterscheidet die Zeile **Tierstimmen** zwischen Aufnahmen und
Spektrogrammen. Der Fortschritt zählt nur den zuvor ermittelten fehlenden Bestand.
Die vier Medienkategorien werden einzeln ausgewählt. **Fotopaket** bezeichnet die zusätzlichen
Websitefotos. Nach dem Abwählen einer bereits heruntergeladenen Kategorie erscheint daneben ein
roter Papierkorb. Der Klick entfernt diese Kategorie lokal ohne zweite Abfrage. Abwählen allein
ändert die Auswahl, und gemeinsam genutzte Dateien bleiben für die anderen Kategorien erhalten.
Die Analyse, **138 App-Tests** und der native ARM64-Prüfbau von 0.1.9 sind bestanden.
Die Tests weisen beim Hinzufügen eines Spektrogramms genau einen Abruf nach und prüfen die
lokale Entfernung eines Fotopakets sowie die Anzeige des Papierkorbs bei abgewählten Inhalten.

Bei einem aktiven Auftrag stammen Haken und Dateizahl aus seiner gespeicherten Auswahl. Der
Hinweis auf zum Fortsetzen gespeicherte Dateien erscheint bei pausierten oder abgebrochenen
Aufträgen. Die Zeile für Websitefotos zeigt die Anzahl und ergänzt bei vollständiger Messung
den voraussichtlichen Bedarf oder nach dem Download den tatsächlich belegten Fotospeicher.
Quellen- und Nutzungshinweise stehen am jeweiligen Medium.

Ein abgebrochener/defekter Download lässt den vorherigen Paketabschluss bestehen. Nach Wiederöffnung
werden Paketdateien erneut geprüft; unmittelbar vor jeder Bildanzeige werden die tatsächlich gelesenen
Dateibytes erneut gegen ihren gespeicherten SHA-256 geprüft. Eine fehlende oder veränderte Datei bleibt
sichtbar unvollständig. Ein normales einzelnes Projektmedium bleibt auf 512 MiB begrenzt, ein Bildabruf
für die Ansicht auf 32 MiB. Fotoabrufe haben zusätzlich eine Gesamtgrenze von 90 Sekunden; beim Abbrechen
kann eine aktuell wartende Netzabfrage noch bis zur Zeitgrenze laufen. Entfernt werden ausschließlich
erkannte eigene Inhaltsdateien. Ohne Auswahl des Fotopakets werden keine zusätzlichen Galeriefotos geladen.

## Bauen und prüfen

Vorhandene geprüfte Rechnerwerkzeuge: Flutter 3.47.7 / Dart 3.13.5, Android-Studio-JDK 25.0.3,
AGP 9.1.0, Gradle 9.3.1, Android API 36 / Buildtools 36.0.0 und NDK 28.2.13676358.
Der Mindeststand der App ist Android API 26, Ziel-/Compile-SDK ist 36. Die private Testfassung wird
als ARM64-Debug-APK gebaut. Der neue Play-Weg verwendet ein separat signiertes Android App Bundle.
Die eigene Uploadsignierung, der tatsächliche Releasebau und die Einführung im internen Play-Test
sind am 1. November ausgeführt. Der Paketprüfer und seine **18/18 Windows-Gegenproben** bestehen.

Die neue lokale Routine `tool/build-play.ps1` trennt drei Schritte: `-CheckOnly` liest die Einrichtung,
`-InitializeSigning` legt nach Abgleich der aktuellen Windowsidentität die eigene Uploadsignierung an,
`-Build` baut das Bundle mit vorhandenen Werkzeugen und prüft es. Schlüssel und Passwort liegen
CurrentUser-DPAPI-geschützt unter `data/mobile-signing`, unabhängig von Numis. Der Build verwendet
das Passwort ausschließlich in der Umgebung seines Kindprozesses; ein temporär entschlüsselter
Schlüssel wird nach dem Lauf entfernt. Ein Release ohne die eigene vollständige Signierung stoppt.
Quellen und Schlüsselmaterial gehören nicht gemeinsam ins Play-Paket.

`tool/release-check.mjs` prüft tatsächliche Kennung/Version, Manifest, Signatur, öffentliche Katalogdateien
und die Bindung des Manifest-Icons an das genehmigte Logo. Erfolgreicher lokaler Paketbau ist getrennt
von Upload, internem Testzugang und Geräteabnahme nachzuweisen. Die signierte Paketdatei und ihr
Prüfbericht werden im privaten Gerätebestand gehalten; ein Testlink wird erst aus der tatsächlichen
Arten-App in Play Console übernommen und im privaten Bereitstellungsbeleg gespeichert. Der Numis-Link
ist kein Arten-Explorer-Testzugang.

Das geprüfte Bundle enthält Version **0.1.2+3**, SDK **26/36** und alle drei gebauten ABIs. Die eigene
JAR-/Zertifikatsignatur, sämtliche **86** signierten Payloaddateien und der öffentliche Anfangskatalog
sind am erhaltenen Artefakt geprüft. Das Original- und Flutterlogo behalten ihre exakten Quellbytes;
für das native Logo ist zusätzlich ausschließlich die tatsächlich durch AAPT2 erzeugte PNG-Fassung
zugelassen. Deren RGBA-Vergleich belegt gleiche Maße und alle sichtbaren Pixel; verändert sind nur
unsichtbare RGB-Kanäle von vier vollständig transparenten Pixeln. Die tatsächliche Launcherbindung
bleibt verpflichtend. Schlüssel-Cleanup und unveränderte Paket-/Prüfquellen sind bestätigt.
Ein anfänglicher Fehler der mehrdeutigen Node-Werkzeugauswahl ist durch eindeutige Auflösung und
Gegenprobe korrigiert; das bereits erfolgreich gebaute Bundle wurde erhalten und vollständig nachgeprüft.

Der lesende Vorabcheck vom 12. November bestätigt die vorhandene eigene Play-Signierkonfiguration.
Der Windows-Standardpfad liefert die gebundenen Android-Werkzeuge derzeit nicht. Mit
`ARTEN_ANDROID_SDK=D:\Arten-Explorer\temp\android-sdk-20261109` bestätigt derselbe Check alle
Werkzeuge der bereits eingerichteten SDK-Kopie. Für den nächsten Bau diesen Pfad im eigenen
Prozess übergeben. Der anschließende signierte Bau von **0.1.12 (12)** ist bestanden. Der
Paketprüfer bestätigt Paketname, Version, SDK 26/36, die Play-Uploadsignatur und 103 signierte
Payloaddateien. Das private AAB umfasst **61.291.750 Bytes** mit SHA-256
`89397dea289b17492e64594206efafaf4f109aaaa0222153761d94966ee43bb7`.
Datei: `data/mobile-signing/reports/arten-explorer-play-9038e35e2026417387d5765b8cb8e8ef.aab`.
Die temporäre Signierdatei ist entfernt, der SDK-Bestand ist unverändert. Im AAB sind 63 Arten als
Anfangsbestand geprüft. Der getrennt geprüfte 65-Arten-Katalog ist für den Datenabgleich vorgesehen.
Play-Upload, Katalogbereitstellung und Abnahme auf den Zielgeräten stehen aus.

Im internen Test liegt der signierte Bau **0.1.12 (12)** aus
`data/mobile-signing/reports/arten-explorer-play-21713d5cf8954d518e2042ec4a1b67b2.aab`.
Er enthält die [Offlinekorrektur und den abgesicherten Katalogabruf](CATALOG.md#neue-arten-automatisch-übernehmen).
Das Bundle umfasst **61.314.095 Bytes**, SHA-256 `7c7fd785a48d6bc55194e3beb449beb44d8c5f0dbaa8a6af980789ba6eb73887`.
Die Play-Uploadsignatur ist bestätigt, die temporäre Signierdatei ist entfernt und der SDK-Bestand
ist unverändert.

Am **13. November** bestand der vollständige Flutter-Lauf **177 von 177 Tests**. Die Analyse war
ohne Befund. Beim vorherigen direkten Testaufruf fehlte `ARTEN_TEST_TEMP`. Dadurch konnten 106 Tests
ihre temporären Testdaten nicht anlegen. Die Wiederholung lief im projektspezifischen Testordner.
Die Paketprüfung bestand **26 von 26 Tests**. Der JVM-Test der Android-Schreibsperre bestand alle
**sechs** Fälle. Sein `main`-Einstieg verwendet die kompilierten Debug- und Unit-Test-Klassen sowie
die Kotlin-Standardbibliothek. Die Play Console bestätigte die interne Verfügbarkeit. Der
öffentliche Katalogwechsel ist am Gerät bestätigt. Weitere Geräteprüfungen stehen aus.

Der lokale Folgestand zeigt die Ränge und Namen der Taxonomiepyramide auf einer gemeinsamen
Mittelachse. Deutsche Namen stammen aus der gemeinsamen Taxonomietabelle des Explorers.
Für den Artrang verwendet die App den deutschen Artnamen des Katalogs. Ohne hinterlegte deutsche
Bezeichnung erscheint der wissenschaftliche Name. Der separate Generator
`node mobile/tool/taxonomy-names.mjs` übernimmt Änderungen aus der gemeinsamen Tabelle.
Innerhalb einer Tiergruppe stehen Familienname, Aufklapppfeil und Artporträt in derselben Zeile.
Porträts scrollen mit ihrer Familie. Ein Tipp auf das Porträt oder den Namen klappt die Familie auf.
Der signierte lokale Testbau **0.1.13 (13)** enthält diese Darstellung, die Regionsauswahl, die
Taxonomiepyramide und den erneuten Katalogabruf nach einem Verbindungsfehler. Die Flutter-Analyse
und alle **182** App-Tests sind bestanden. Ein Widget-Test prüft die gemeinsame Zeile und
Scrollbewegung. Das Bundle `data/mobile-signing/reports/arten-explorer-play-6ff95ca42d94405a86af11a1ade0b392.aab`
hat SHA-256 `5e8c18785afabf3de3de7a11a5060bb445aae4e9c9281a38263289a394fbc40f`.
Die Play Console bestätigt die interne Verfügbarkeit. Die gemeinsame Bedienprobe am Gerät steht aus.

Grundlagen: [Flutter Android-Veröffentlichung](https://docs.flutter.dev/deployment/android) und
[Google Play: interner Test](https://google.play/business/internal-testing/).

Vom Repositoryordner aus:

```powershell
node mobile/tool/check.mjs
```

Der Runner liest die vorhandenen Werkzeuge an ihren belegten Pfaden. Abweichende Installationen können
über `ARTEN_FLUTTER_ROOT`, `ARTEN_ANDROID_SDK` und `ARTEN_JAVA_HOME` angegeben werden. Er installiert
keine SDKs. Pub-/Gradle-/Prozesstemp und Dateifixtures liegen in einer eigenen, über den vorhandenen
Testvertrag erzeugten Sitzung unter `temp/tests`. Normale Flutter-Projektartefakte liegen ignoriert
unter `mobile/build` beziehungsweise `.dart_tool`. Gemeinsame SDK-Caches/Locks werden nicht zurückgesetzt.

`pubspec.lock` bindet die kostenlosen Abhängigkeiten. Die Prüfung umfasst Analyzer, Domain-, HTTP-Transport-,
Offline-/Wiederöffnungs- und Widgettests einschließlich schmaler Ansicht mit großer Schrift. Protokolle
liegen lokal in `mobile/build-evidence`; das APK entsteht in
`mobile/build/app/outputs/flutter-apk/app-debug.apk`. `node mobile/tool/audit-build.mjs` prüft anschließend
Signatur/Metadaten, bindet Quellen und Logo und kopiert das private APK nach `mobile/artifacts`.

Für einen begrenzten Nachlauf kann der Runner interaktiv gestartet werden:
`node mobile/tool/check.mjs --interactive --reuse-own-cache`. Nur die gebundene frühere eigene und
prozessfreie Sitzung wird dabei als Dependencycache weiterverwendet. Die Befehle `pub`, `analyze`, `test`,
`guard`, `build`, `quit` werden nacheinander ausgeführt. `guard` ist eine negative AGP-Probe gegen eine
absichtlich fehlende Plattform; ihr erwarteter Fehler ist kein App-Buildfehler.

Beim ersten Entwicklungsbuild hat ein Plug-in unerwartet Android-Plattform 35 Rev. 2 im vorhandenen
SDK ergänzt. Dieser tatsächliche Seiteneffekt wurde den beiden Projekten gemeldet; nichts wurde am
gemeinsamen SDK zurückgenommen. Vor dem Nachlauf sind automatische SDK-Downloads sowohl im Projekt
als auch im eigenen Gradle-Bereich gesperrt; Android-Bibliotheksprojekte werden über `finalizeDsl`
konsistent auf API 36/Buildtools 36.0.0 gesetzt. Die negative AGP-Probe und ein Vor-/Nachvergleich der
installierten Komponentenmetadaten binden die Nachlaufgrenze. Der erste Lauf belegt keine unveränderte SDK-Installation.

## Inhalt und Abnahmegrenzen

Aktuelles Prüfpaket: `artifacts/arten-explorer-0.1.3-debug-arm64.apk`, **96.066.432 Bytes**, SHA-256
`3cb11bbb6af9a3700a0e71f4318c2bb56aafa8461ef82f9b56b21a9a3e8bf72e`.
`build-evidence/artifact.json` bindet APK, Katalog, Symbole und den geprüften Quellstand.
Die anschließend aktualisierte Bedienungsdokumentation ändert dessen gebundene Programmdateien nicht.

Das neue signierte Bundle 0.1.3+4 umfasst **59.356.774 Bytes**, SHA-256
`d14f916bd43c452602b9386c9ec2ded787739d910775677ec914e518c42b9cc0`.
Es liegt privat unter `data/mobile-signing/reports/arten-explorer-play-0933a3f7ffc344eab01f4f9adae4cf36.aab`.
Der erfolgreiche Hilfslauf bestätigt `cleanupComplete` und ein unverändertes SDK-Inventar; im
privaten Laufzeitordner sind keine Klartextschlüssel oder Buildlocks übrig. Die 23/23 Releaseprüffälle
qualifizieren die erweiterten Prüfvorschriften; zusätzlich ist dieses tatsächliche Bundle mit denselben
Vorschriften vollständig geprüft. Das frühere 0.1.2-Debugpaket bleibt als historischer Paketbeleg erhalten.

Der erste Nachlauf fand einen Compilerfehler im neuen optionalen Fototransport und einen veralteten
Widgettext. Die Transportfähigkeit wird jetzt vor jedem Fotoabruf ausdrücklich geprüft. Ein Transport
ohne sicheren Fotoanschluss stoppt ohne allgemeinen Medienrückfall und erhält das vorhandene Paket;
die zusätzliche Gegenprobe ist in den 89 Fällen enthalten. Die fehlgeschlagenen Vorherläufe bleiben
getrennt unter `build-evidence/*before*20261101.log` erhalten. Die erneute negative AGP-Probe gegen die
absichtlich fehlende Plattform 999 stoppt ohne Installation; Komponentenmetadaten des gemeinsam
verwendeten SDK sind vor/nach unverändert. Der SDKabschnitt wurde danach ausdrücklich an Numis zurückgegeben.

Der [mobile Katalogvertrag](CATALOG.md) übernimmt den bestehenden gemeinsamen Dienstvertrag. Die App
enthält den gebundenen öffentlichen Anfangskatalog aus dem vollständigen Export vom 31. Oktober 2026.
Seine Prüfsumme und Mediengrenze stehen in `assets/catalog-manifest.json`; Fotos und Tondateien werden
nicht mitgeliefert. `node mobile/tool/bundle-catalog.mjs` übernimmt ausschließlich einen erfolgreich
paritätsgeprüften Export, `dart mobile/tool/verify_public_catalog.dart` prüft dessen Lesbarkeit ohne
Flutter- oder Geräteaufruf. Die Einrichtung des angemeldeten gemeinsamen Dienstes ist ein getrennter
Schritt. Ohne diesen Dienst bleibt der öffentliche Anfangsbestand nutzbar; neue gemeinsame Projektinhalte
und die persönliche Projektanmeldung benötigen den eingerichteten HTTPS-Dienst.

Lokale Tests und ein signiertes Debug-APK ersetzen keine Prüfung auf S24 Ultra/S25 Ultra. Dort bleiben
Anmeldung/Keystore, reale Audioformate, Touch/Zoom, App-/Geräteneustart, Netzverlust, großer Download,
Speichermangel und spätere Inhalts-/Programmaktualisierung praktisch zu prüfen. Es wurde kein Gerät
verbunden und keine Anmeldung am produktiven NAS ausgeführt.

Technische Primärquellen: [Flutter Android-Build](https://docs.flutter.dev/deployment/android),
[Android SDK-Downloadsperre](https://developer.android.com/studio/intro/update#download-with-gradle),
[AGP finalizeDsl](https://developer.android.com/reference/tools/gradle-api/9.1/com/android/build/api/variant/DslLifecycle),
[Android Backupregeln](https://developer.android.com/identity/data/autobackup),
[geschützter Tokenspeicher](https://pub.dev/packages/flutter_secure_storage),
[Audio](https://pub.dev/packages/just_audio), [SVG](https://pub.dev/packages/flutter_svg),
[Appdateien](https://pub.dev/packages/path_provider), [Prüfsummen](https://pub.dev/packages/crypto).
Für die neue Fotoprüfung zusätzlich: [Bildbeschreibung vor dem Decodieren](https://api.flutter.dev/flutter/dart-ui/ImageDescriptor/encoded.html),
[begrenzter Bilddecoder](https://api.flutter.dev/flutter/dart-ui/ImageDescriptor/instantiateCodec.html),
[Freigabe der Bildpuffer](https://api.flutter.dev/flutter/dart-ui/ImmutableBuffer/dispose.html) und
[ausdrückliche Redirectsteuerung](https://api.dart.dev/dart-io/HttpClientRequest/followRedirects.html).
