# Arten-Explorer für Android

Quellstand **0.1.2+3** mit vorbereiteter optionaler Offlinegalerie. Dieser neue Quellstand ist bis zum
abgestimmten Prüffenster noch nicht mit Analyzer, Fluttertests oder einem neuen APK bestätigt.
Das zuletzt tatsächlich gebaute und geprüfte APK bleibt **0.1.1+2**; dessen Nachweise gelten für den
damaligen Stand mit 66 erfolgreichen Tests. Lesendes Nachschlagewerk mit mitgeliefertem öffentlichen Anfangsbestand und
getrenntem angemeldeten Zugriff auf die im gemeinsamen Projekt freigegebenen Arten.
Erste Zielgeräte sind Samsung Galaxy S24 Ultra und S25 Ultra. Die App ist ein eigenständiges
Flutter-Android-Projekt; Bearbeitung, Lightroom und die globale Referenzdatenbank bleiben am PC.

## Verwendung

1. Die bereitgestellte private APK installieren und die App öffnen.
2. Der **mitgelieferte öffentliche Anfangsbestand** ist sofort ohne Verbindung und ohne Anmeldung
   lesbar. Er enthält Arttexte/Taxonomie sowie Medienverweise aus dem paritätsgeprüften öffentlichen Export.
3. Arten nach deutschem oder wissenschaftlichem Namen suchen. Die Artansicht bietet gegliederte
   Texte, Taxonomie, vergrößerbare Verbreitungskarte, Artbild, Ton und vorhandene Fotogalerie.
4. Über **Offlineinhalte** die gewünschten Kategorien laden. **Alles ohne Websitefotos auswählen**
   nimmt Texte/Taxonomie, Karten, Ton und Artbilder auf; zusätzliche Galeriefotos bleiben abgewählt.
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

Paketbeschreibung Version 2 hält die ursprüngliche Katalogrevision und Medienverweise unverändert.
Für jede Datei stehen Größe und SHA-256 getrennt dabei. Websitefotos erhalten zusätzlich Herkunftsadresse,
lokalen Beobachtungszeitpunkt, tatsächliches Bildformat und Abmessungen. Das bestätigt die auf diesem
Gerät gespeicherten Bytes, keine Gleichheit mit einer früher exportierten Websitefassung und keinen
garantiert heutigen Websitezustand. Die App zeigt den Beobachtungscharakter beim Download und am Foto.
Ein ausdrücklich erneut gestarteter Paketdownload ruft solche Fotos frisch ab. Ältere Paketfassungen
bleiben bis zum vollständigen neuen Abschluss erhalten; nach einer neuen Katalogrevision werden alte
beobachtete Fotos nicht als aktueller Medienstand verwendet. Vorgehashte gleiche Dateien bleiben wie
bisher wiederverwendbar. Bestehende Pakete der Version 1 bleiben lesbar.

Ein abgebrochener/defekter Download lässt den vorherigen Paketabschluss bestehen. Nach Wiederöffnung
werden Paketdateien erneut geprüft; unmittelbar vor jeder Bildanzeige werden die tatsächlich gelesenen
Dateibytes erneut gegen ihren gespeicherten SHA-256 geprüft. Eine fehlende oder veränderte Datei bleibt
sichtbar unvollständig. Ein normales einzelnes Projektmedium bleibt auf 512 MiB begrenzt, ein Bildabruf
für die Ansicht auf 32 MiB. Fotoabrufe haben zusätzlich eine Gesamtgrenze von 90 Sekunden; beim Abbrechen
kann eine aktuell wartende Netzabfrage noch bis zur Zeitgrenze laufen. Entfernt werden ausschließlich
erkannte eigene Inhaltsdateien. **Alles ohne Websitefotos** lädt weiterhin keine zusätzlichen Galeriefotos.

## Bauen und prüfen

Vorhandene geprüfte Rechnerwerkzeuge: Flutter 3.47.7 / Dart 3.13.5, Android-Studio-JDK 25.0.3,
AGP 9.1.0, Gradle 9.3.1, Android API 36 / Buildtools 36.0.0 und NDK 28.2.13676358.
Der Mindeststand der App ist Android API 26, Ziel-/Compile-SDK ist 36. Die private Testfassung wird
als ARM64-Debug-APK gebaut. Release-Signierung und Storeveröffentlichung sind nicht eingerichtet.

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
