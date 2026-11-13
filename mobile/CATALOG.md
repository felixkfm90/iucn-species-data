# Katalogzugriff der Android-App

Führend für Authentifizierung und gelieferten Inhalt ist der
[gemeinsame Projektdienst](../species-explorer/shared-project/README.md). Diese Datei beschreibt die
konkrete lesende Nutzung durch die App. Der mitgelieferte öffentliche Anfangskatalog ist ein gebundener
Snapshot des paritätsgeprüften Websiteexports; laufende gemeinsame Projektinhalte werden separat angemeldet gelesen.

## Öffentlicher Anfangsbestand

`assets/catalog.json` und `assets/catalog-manifest.json` bilden den signierten App-Anfangsbestand.
Die App prüft Dateigröße, SHA-256, Katalogrevision und Artzahl vor der Anzeige. Der Snapshot enthält
öffentliche Fachtexte, Taxonomie, Medien-URLs und vorhandene Quellen-/Nutzungshinweise, aber keine
Bild- oder Tondateien. Erststart und Fachtextsuche funktionieren damit ohne einen eingerichteten NASdienst.
Die Anzeige heißt ausdrücklich **Mitgelieferte öffentliche Daten**; sie erzeugt weder eine Sitzung noch
eine bestätigte Dienstaktualisierung. Öffentliche Mediendownloads verwenden den getrennten Ordner
`public-catalog`, während angemeldete Bestände an Serverursprung/Projekt/Person gebunden bleiben.

Der Desktop prüft für eine neue Erstübernahme die aktuelle öffentliche Fassung. Der mitgelieferte
Katalog ist dabei der Ersatz bei fehlender Verbindung. Seit 0.1.10 enthält dieser Anfangsbestand
die acht geprüften Titelkorrekturen. Katalogerzeugung und App-Prüfstart vergleichen ihn mit seiner
festen Desktop-Bindung. Der bestehende Website-Export bleibt der Herkunftsbeleg. Eine bereits
vorbereitete Erstübernahme behält die geprüfte Quelle. Ein unbegonnener Plan kann mit einer neuen
Vorschau bewusst ersetzt werden.

Bei einer Appaktualisierung wird der neu mitgelieferte Snapshot für diese öffentliche Ansicht verwendet.
Im nach 0.1.10 ergänzten Quellstand übernimmt die App die neue öffentliche Katalogfassung automatisch
in das Offlinepaket, sobald alle ausgewählten Medienreferenzen übereinstimmen und ihre Dateien lokal
geprüft sind. Die bisherige Auswahl, Dateien und Downloadbelege bleiben erhalten. Bei geänderten
Medien fragt die App vor der Aktualisierung. Eine bestehende Projektanmeldung und ihr separater Cache
bleiben eigenständig.

### Neue Arten automatisch übernehmen

Eine bereits installierte App soll neue freigegebene Arten über einen Katalogabgleich erhalten.
Der mitgelieferte öffentliche Bestand dient als Startbestand. Für spätere Inhalte soll eine
geprüfte neue Katalogfassung in der lokalen App-Datenablage genügen. Ein neues App-Paket ist bei
reinen Katalogänderungen im unterstützten Datenformat nicht erforderlich.

Die Regionsauswahl der App verwendet die vorhandene öffentliche FN-Artseitenadresse. Die zugeordnete
Region ist der Websitebereich und gilt auch im gespeicherten Offlinekatalog. Neue Arten aus einem
bekannten Websitebereich erscheinen dort nach dem Katalogabgleich. **Alle Regionen** umfasst den
gesamten Bestand einschließlich **Ohne Regionszuordnung**. Innerhalb einer Region werden nur ihre
Tiergruppen angeboten. Eine Regionsauswahl begrenzt die Ansicht und die Suche in der Artenliste.

Die App prüft beim Start und beim Zurückkehren in die öffentliche Ansicht, ob es eine neuere
Katalogfassung gibt. Im lokalen Folgestand pausieren automatische Prüfungen nach einem erfolgreichen
Abruf für 15 Minuten. Nach einem Verbindungsfehler prüft die App beim nächsten Zurückkehren erneut.
Die Prüfung kann auch über **Informationen** ausgelöst werden. Der Abruf verwendet
die feste GitHub-Pages-Adresse des Projekts ohne Anmeldung. Eine Freigabedatei bindet den Katalog
an Dateigröße, SHA-256, Revision, Zeitstempel und Artzahl. Die App prüft zusätzlich die erlaubten
öffentlichen Website- und Medienadressen. Bei einem fehlgeschlagenen Abruf und offline bleibt der
letzte gültige Bestand lesbar. Persönliche Projektinhalte verwenden weiterhin ihren eigenen Abruf.
Optionale Fotos, Karten und Tierstimmen folgen der gewählten Offlineauswahl.

Unveränderte Websitefotos des öffentlichen Bestands bleiben auch zwischen Katalogabgleich und
Aktualisierung des Fotopakets offline sichtbar. Die App prüft Art, Foto-ID, Websitequelle und
Downloadfassung gegen die aktuelle Referenz und hasht die lokale Datei vor der Anzeige erneut.
Neu hinzugekommene oder geänderte Fotos erscheinen erst nach ihrem Download als offline verfügbar.
Beim Abgleich lädt die App nur fehlende oder geänderte Dateien. Die öffentliche Katalogfassung und
der Abschlussstand des Offlinepakets werden getrennt angezeigt.

Am 12. November liefert die öffentliche Artendatei 65 Datensätze. Der gebundene App-Anfangsbestand
enthält 63. Für Mittelspecht und Rappenantilope bestehen der Export und die Paritätsprüfung gegen
die aktuellen öffentlichen Artseiten und fünf veröffentlichte Medien. Dieser Nachweis deckt die
beiden Zugänge ab. Der vollständige Kandidat vom 12. November deckt alle 65 veröffentlichten
Artseiten ab. Der Export prüft die tatsächlich ausgelieferten Medienbytes, die öffentlichen
Quellenangaben und die Zuordnung der Spektrogramme zu ihren Tonaufnahmen. Die Galeriefotos sind
über die öffentlich gelesenen Seiten und ihre dort angezeigte Reihenfolge gebunden.
Der App-Katalog bindet Karten, Porträts, Tonaufnahmen und Spektrogramme an die vollständige
Git-Kennung ihrer geprüften Dateifassung. Der Export vergleicht diese Bytes mit dem öffentlichen
Pages-Stand. Bei gleichen Dateien behält die nächste Katalogfassung die bestehenden Adressen.
Ein späteres Website-Update kann dadurch die Website-Medien aktualisieren, während der bisherige
App-Katalog die passende Dateifassung weiterhin abrufen kann.
Bereits heruntergeladene Medien bleiben bei gleicher Prüfsumme im Offlinepaket verwendbar. Wird
Pages zwischen dem Abruf der Freigabedatei und der Katalogdatei aktualisiert, prüft die App bei
einem HTTP 404 einmalig, ob inzwischen eine neuere Freigabedatei vorliegt.

`node mobile/tool/stage-public-catalog.mjs` erzeugt den nächsten Kandidaten in einer eigenen
lokalen Prüfsitzung. Er liest die öffentliche Sitemap, die veröffentlichten Artdaten und den
veröffentlichten Fehlstellenbericht. Als Vergleich lädt er die letzte öffentliche App-Fassung
und prüft Freigabedatei, Hash und Inhalt mit denselben Regeln wie Pages. Nur bei HTTP 404 der
Freigabedatei verwendet er den fest hashgebundenen App-Anfangsbestand.
Neue Arten ohne öffentliche Seite warten auf deren Veröffentlichung. Der private Prüfbeleg führt
sie im Sitzungsordner auf. Eine nicht mehr auffindbare bisherige App-Art, mehrdeutige Zuordnungen
und Fehler beim Abruf oder Vergleich stoppen die Ausgabe. Dokumentiert ausgelassene Medien werden
als fehlend übernommen.

Nach vollständiger Quellen- und Medienprüfung meldet der Lauf `candidate` oder `unchanged`.
Er hält die geprüfte Ausgangsfassung sowie hinzugekommene und geänderte Arten im privaten Beleg
fest. Die vier öffentlichen JSON-Quellen müssen bytegenau zum geprüften Git-Commit passen. Der
in Git gespeicherte App-Katalog muss mit der öffentlich abrufbaren Ausgangsfassung übereinstimmen.
Eine fachlich identische veröffentlichte Fassung erzeugt keine neuen Katalogdateien. Die
erste öffentliche Bereitstellung kann auch dem mitgelieferten Bestand entsprechen.

Der [GitHub-Prüflauf](../.github/workflows/prepare-mobile-catalog.yml) bereitet den Katalog nach
einem erfolgreichen Pages-Lauf auf `main`, täglich um 17:43 UTC und bei Bedarf manuell in **Actions**
vor. Der tägliche Lauf erfasst auch Artseiten, die erst später in Squarespace veröffentlicht werden.
Bei `candidate` stehen im Artefakt **public-mobile-catalog-candidate** für sieben Tage ausschließlich
`manifest.json` und die über SHA-256 gebundene Katalogdatei zur Prüfung bereit. Bei `unchanged`
entsteht kein Artefakt. Der private Prüfbeleg bleibt im Arbeitsverzeichnis des jeweiligen Laufs.
Vor der Übernahme der beiden Dateien nach
`mobile/catalog/` prüft `node mobile/tool/stage-public-catalog.mjs --verify-candidate <Katalogordner> <SHA-256-der-Ausgangsfassung>`
die vorhandenen Dateien erneut gegen die öffentlichen Quellen. Die Ausgangsprüfsumme steht im
Prüflauf. Die Gegenprobe verlangt dieselbe Ausgangsfassung auf Pages und im Git-Zielstand,
die vollständigen aktuellen Artinhalte
und die exakten veröffentlichten Medienbytes. Sie gibt die geprüfte Katalogprüfsumme aus.

Die automatische Übernahme ist über die GitHub-Repositoryvariable `PUBLIC_MOBILE_CATALOG_AUTO_PUBLISH`
ausdrücklich einschaltbar. Ohne den Wert `true` endet der Lauf mit der Kandidatenprüfung. Bei
Aktivierung vergleicht ein eigener Job den Kandidaten erneut mit den öffentlichen Quellen. Er
ersetzt ausschließlich das Katalogpaar unter `mobile/catalog/` und überträgt seinen einzelnen
Commit nur, wenn `main` weiterhin auf der geprüften Ausgangsfassung steht. Anschließend startet
ein eigener Job den bestehenden Pages-Lauf. Pages prüft den erwarteten Commit und durchläuft
das normale Qualitätsgate. GitHub startet den Push-Workflow für diesen Workflow-Token nicht
automatisch. [GitHub-Workflow-Token](https://docs.github.com/en/actions/concepts/security/github_token)

Falls GitHub den Commit schon enthält und die Pages-Ausgabe noch die alte Fassung liefert, stoppt
der nächste Kandidatenlauf am Vergleich der Ausgangsfassung. In diesem Fall den vorhandenen
Pages-Lauf wiederholen oder **Deploy GitHub Pages** für den aktuellen Stand von `main` starten.
Nach erfolgreichem Deploy muss der öffentlich gelieferte Katalog-Hash mit `main` übereinstimmen.
Vorbereitung, exakter Dateiaustausch und Ablehnung abweichender Ausgangsfassungen sind lokal
geprüft. Die Probe am veröffentlichten Commit `a4648c9` mit dem vorgesehenen Änderungspaket
bestand am 13. November mit 41 Tests. Gegen den öffentlichen Stand prüfte sie 65 Arten und 252
Katalogmedien samt ihren fest gebundenen Fassungen. Das Ergebnis war `unchanged`.
Die automatische Übernahme ist in GitHub noch nicht aktiv und ihr erster Lauf steht aus.

Export, Pages-Bau und Artefaktprüfung verwenden dieselbe Prüfung für die öffentliche Artstruktur
und die erlaubten Medienadressen. Private Projektfelder und fremde Adressen sperren den Katalog
bereits vor der Veröffentlichung. Ein isolierter Pages-Bau aus `3f57e78` mit den sieben
vorgesehenen Veröffentlichungsdateien akzeptiert den vollständigen Kandidaten. Das Artefakt enthält
genau 421 vorgesehene Dateien, darunter die beiden hashgebundenen Katalogdateien. In der lokalen
Flutter-Probe übernimmt
derselbe Leser den Kandidaten über dem mitgelieferten Anfangsbestand. Beide neu aufgenommenen
Arten und die gebundenen Spektrogramme sind vorhanden, und der neue Bestand lässt sich danach
offline erneut öffnen. Der 65-Arten-Katalog wurde am 13. November über GitHub Pages bereitgestellt.
Die öffentliche Freigabedatei und der Katalog waren um 15:39 Uhr bytegenau abrufbar.
[Pages-Lauf](https://github.com/felixkfm90/iucn-species-data/actions/runs/43443021844)
Die erneute Paketprüfung hat direkt aus dem signierten Android-Bundle den Anfangsbestand mit
63 Arten gelesen. Der lokale Pages-Bau enthält genau die beiden Zugänge Mittelspecht und
Rappenantilope. Die vier zugrunde liegenden veröffentlichten JSON-Dateien und alle 252 im
Pages-Artefakt enthaltenen Katalogmedien stimmen bytegenau mit dem Exportnachweis überein.
Der Vergleich mit dem mitgelieferten 63-Arten-Katalog bestätigt 852 identische Fotoreferenzen
und 26 zusätzliche. Die Flutter-Gegenprobe lädt vorhandene Fotos, übernimmt einen neueren Katalog,
öffnet passende Fotos ohne Netz und lädt bei der späteren Medienaktualisierung ausschließlich das
Foto mit geänderter Quelle. Eine manipulierte lokale Datei wird bei der Anzeige abgewiesen.

Abnahme: Eine nach der App-Installation freigegebene Art erscheint auf dem Zielgerät nach dem
automatischen Datenabgleich bei unveränderter App-Version. Dabei bleiben Entwürfe ausgeschlossen
und vorhandene Offlineinhalte nutzbar.
Felix bestätigte 0.1.12 mit 63 Arten vor der Katalogbereitstellung, anschließend 65 Arten mit
derselben App-Version und den gespeicherten Bestand nach dem App-Neustart im Flugmodus.
**Informationen → Inhalte aktualisieren** stößt den Abruf
direkt an. **Daten automatisch aktualisieren** in den Offlineinhalten steuert die Downloads für die
gespeicherte Medienauswahl. In der angemeldeten
Projektansicht erscheinen die im gemeinsamen Bestand intern freigegebenen Arten über den NAS-Dienst.
Die Geräteabnahme dafür prüft eine interne Freigabe und den anschließenden persönlichen Abruf.

## Persönliche Anmeldung

- `POST /api/v1/auth/login` sendet `username`, das nur kurz im Speicher verwendete `password`,
  `deviceLabel: "Arten-Explorer Android"` und `scope: "read"`.
- Die Antwort enthält `projectId`, `token`, `expiresAt`, `scope: "read"`, `user` und optional
  `device: {id, token, expiresAt}`. Die App akzeptiert ausschließlich lesende Sitzungen.
- `POST /api/v1/auth/refresh` verwendet das Gerätetoken als Bearer; Benutzer und `projectId` müssen
  unverändert bleiben. Die neue Sitzung wird geschützt gespeichert.
- `POST /api/v1/auth/logout` sendet die aktuelle Sitzung und `revokeDevice: true`.
- `GET /api/v1/catalog` verwendet die aktuelle lesende Sitzung. Medienabrufe sind getrennte öffentliche
  HTTPS-Abrufe ohne diese Authorization. API und Medien folgen keinen Weiterleitungen.

Der normalisierte HTTPS-Serverursprung, die stabile Projektkennung und Benutzerkennung bilden zusammen
den Cachebereich. Eine neue Projektkennung unter derselben Adresse überschreibt keinen fremden Bestand.
Passwörter und persönliche Lightroom-/PC-Pfade gehören weder in den Katalog noch in Inhaltsdateien.

## Übernommenes JSON-Schema Version 1

Das [leere Strukturbeispiel](contract/catalog.empty.json) enthält keine Art und wird nicht automatisch
in die App geladen. Tatsächliche Inhalte stammen aus dem gebundenen öffentlichen Anfangskatalog oder
aus dem ausdrücklich angemeldeten gemeinsamen Dienst.

Android 0.1.10 ruft weiterhin Katalogformat 1 ab. Der isolierte Kopplungstest mit NAS 0.1.8
bestätigt diesen Weg für die bisherigen Artfassungen. Vollständige redaktionelle Artfassungen im
neuen Recordformat benötigen Reader 2 samt geschützten Projektmedien. Sobald eine solche Fassung
intern freigegeben ist, weist der Dienst den älteren Katalogabruf mit `reader_catalog_version_required`
ab. Der nachfolgende Android-Quellstand nutzt den versionierten Projektabruf. Die Abnahme mit dem
bereitgestellten App-Paket auf beiden Geräten steht noch aus. [Geprüfter Anschluss](README.md)

| Bereich | Gelieferte Felder und Nutzung |
| --- | --- |
| Katalog | `schemaVersion: 1`, `revision` und `generatedAt` binden den gelieferten Stand. `species` enthält die freigegebenen angelegten Arten. Ein leerer Bestand bleibt als solcher sichtbar. |
| Art | `id` als stabiler Slug, `scientificName`, `commonName`, geordnete `taxonomy` und `sections`, optionale `websiteUrl`, `media`. Die Websiteadresse wird bei fehlender Artseite nicht erfunden. |
| Taxonomie | `[{rank, name}]` in gelieferter Reihenfolge. Kein Nachladen der weltweiten Referenzdatenbank. |
| Arttexte | `[{id, title, text, intentionallyEmpty}]` in gelieferter Reihenfolge. Reiner Text; Absätze bleiben erhalten. Bewusste Leerstelle und noch fehlender Text werden unterschieden. |
| Mediengruppen | Optionales `portrait` und `map`, Listen `sounds` und `gallery` (leere Listen erlaubt). Karte ist das gelieferte Raster-/SVG-Verbreitungsbild, keine unabhängige Kachel-/Standortanbindung. |
| Mediendatei | `id`, öffentliche HTTPS-`url`; optional `bytes`, SHA-256 als 64 Hexzeichen, `mimeType`, `alt`, `caption`, `order` und `attribution`. Keine eingebetteten Zugangsdaten. |
| Galeriefolge | Aufsteigendes `order`; bei gleichem Wert bleibt die gelieferte Reihenfolge erhalten. `caption` bleibt sichtbar, `alt` benennt das Bild für unterstützende Technik. |
| Quellen | Optionales `attribution` ist reiner Text mit höchstens 8000 Zeichen. Vorhandene Quellen-, Lizenz- und Nutzungshinweise bleiben beim Offline-Roundtrip und am jeweiligen Medium erhalten; URLs sind kopierbarer Text. |

Mediengrößen und Prüfsummen dürfen im gelieferten Katalog fehlen. Fehlende Größe wird angezeigt.
Eine fehlende SHA-256-Prüfsumme sperrt weiterhin den Paketdownload von Artbild, Karte, Ton und unbekannten
Medienquellen. Ausschließlich bekannte zusätzliche öffentliche FN-Galeriequellen dürfen ohne erwarteten
Hash als frisch beobachtete Websitefassung geladen werden; dafür gelten die getrennten HTTPS-/Host-/
Pfad-/Raster-/Bytegrenzen aus der [Bedien- und Betriebsbeschreibung](README.md). Der Katalog wird dabei
nicht nachträglich mit einem angeblich vom Projektdienst erwarteten Hash angereichert.

## Lokaler Paketabschluss

Im angemeldeten Projektbestand speichert die App zunächst nur den Artindex ohne Fachtexte/Taxonomie.
Die öffentliche Ansicht hat ihre mitgelieferten Texte/Taxonomie bereits unabhängig von Zusatzdownloads.
Eine bestätigte Offlineauswahl
enthält einen Katalogsnapshot mit seiner ursprünglichen `revision`, die gewählten Kategorien und die
zugehörigen Medien. Abgewählte Fachtexte/Taxonomie werden nicht als offline verfügbar behandelt.
Ausgewählte Medien landen unter ihrem Inhalts-SHA-256-Wert in privaten Appdateien. Für vorgehashte
Projektassets muss dieser Wert unverändert dem erwarteten Kataloghash entsprechen. Erst nach
vollständiger Größen-/Hashprüfung wird die Paketbeschreibung atomar ersetzt. Vorherige Abschlüsse
bleiben bei fehlendem Netz, unvollständigen Dateien, falschen Hashes oder Abbruch erhalten.

Nach Wiederöffnung prüft die App alle ausgewählten Paketdateien erneut. Beschädigte oder entfernte
Dateien machen den Bestand sichtbar unvollständig. Gleiche Dateinamen ohne gleiche Prüfsumme können
keinen neueren Medienstand ersetzen. Ein neues Onlinekatalogdatum bestätigt kein neu geladenes Offlinepaket.

Die neue lokale Paketbeschreibung hat `schemaVersion:2`, behält `catalog`, `selection` und `downloadedAt`
und ergänzt `files` mit einer Bindung je ausgewähltem `speciesId/kind/mediaId`. Jede Bindung nennt
`sourceUrl`, tatsächlichen `sha256`, `bytes`, feste Dateierweiterung und `provenance`. `catalog-sha256`
bestätigt den im Katalog erwarteten Hash. `observed-public-website` ist ausschließlich für bekannte
Galeriequellen ohne erwarteten Hash zulässig und nennt zusätzlich `observedAt`, tatsächlichen `mimeType`,
`width` und `height`. Diese Felder sind lokale Downloadbeobachtungen, kein Serverbeleg und keine
Integritätsgarantie für eine frühere Exportfassung. Ein erwarteter Kataloghash wird niemals durch diese
zweite Nachweisart ersetzt oder bei Widerspruch aufgegeben.

Ein tatsächlich neu geladenes hashfreies Websitefoto erhält einen neuen Beobachtungsbeleg.
Bei unverändertem Medienbezug kann der öffentliche Offlinekatalog die lokal geprüfte Fotoausgabe
weiterverwenden. Herkunft, Downloadadresse und ursprünglicher Beobachtungszeitpunkt bleiben dabei
erhalten. Die gespeicherten Dateibytes werden beim Wiederöffnen und unmittelbar vor der Bildanzeige
erneut gehasht. Öffentliche und persönliche Offlinepakete bleiben in getrennten Cachebereichen.
Version-1-Pakete werden anhand ihrer ursprünglichen Kataloghashes weiter gelesen.
