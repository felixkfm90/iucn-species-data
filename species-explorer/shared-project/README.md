# Gemeinsamer Projektdienst: Modulvertrag

Stand: 2026-11-02. Diese isolierte Node-24-Basis liest keine bestehenden Repo-, Taxonomie-,
Lightroom- oder Websitebestände. Sie verändert und veröffentlicht keine Squarespace-Inhalte.
Die fachlichen Betriebsentscheidungen und die NAS-Abnahme führt `docs/multi-device-backup-plan.md`.

`store.mjs` stellt die explizite Objektfassade für spätere bestätigte Importe bereit:
`createObject(token, {kind, id, data})` legt ausschließlich einen Entwurf an;
`submitChange(token, {changeId, kind, id, baseRevision, data, intent?})` ändert ausschließlich bestehende Objekte.
Es gibt keinen automatischen Import und keinen Bootstrap über HTTP.

Der optionale Zweck `page-editorial-adoption` ist ausschließlich für die erneute serverseitige
Projektion eines gespeicherten FN-Artseitenentwurfs in eine vorhandene vollständige Art bestimmt.
Er bindet tatsächliche Person, Rolle, Projekt und beide Ausgangsfassungen. Der Server berechnet
den vollständigen Record-2-Kandidaten selbst neu; allgemeine Anlage und Grunddatenbearbeitung
dürfen diesen Redaktions-/Versionswechsel nicht vornehmen. Der unveränderte Request einschließlich
Zweck ist Teil der idempotenten Änderungskennung. Ein bereits bestätigter Auftrag bleibt deshalb
auch nach späteren Seitenänderungen eindeutig wiederaufnehmbar.

Record 2 speichert Richtext, Quellen, Abschnittsrollen, Leerstellen und einzelne Bildverwendungen
verlustfrei; der vollständige private Datensatz ist auf 4 MiB begrenzt. Normale Originalfelder und
Dateibindungen bleiben erhalten. Die größere HTTP-Grenze gilt nur für ausdrücklich typisierte
Record-2-Schreibaufträge nach der bestehenden Berechtigungsprüfung. Seitenabruf, Cache, persönliche
Sicherung und Medienreferenzprüfung müssen dieselben typisierten Daten vollständig erhalten.
Die Freigabe bleibt getrennt: Catalog 1 und die bisher freigegebene Artversion bleiben erhalten;
eine neue Record-2-Leserfreigabe verlangt ausdrücklich die getrennte Reader-Catalog-2-Prüfung.

## Erweiterte Leserfassung

Der neue lokale Quellanschluss stellt Reader-Catalog 2 zusätzlich bereit. `/api/v2/catalog`
liefert einen begrenzten Gesamtbestand; `/api/v2/catalog/page` liefert höchstens 25 Arten und
4 MiB je Seite mit kleiner Reserve für eine einzelne große Art. Fortsetzungen und Abschlussprüfung
sind an die tatsächlich freigegebenen Versionen, Projekt, Person, Rolle und Sitzung gebunden.
Ein Rechte- oder Freigabewechsel verlangt einen neuen Abruf; nicht freigegebene Entwürfe erscheinen
nicht. Die bestehenden Catalog-1-Antworten werden nicht still umgeformt oder um Arten gekürzt.

Reader 2 unterscheidet bestehende öffentliche Textabschnitte und vollständig strukturierte
Seiteninhalte. Neue Grunddaten-/Statusfelder sind kuratiert. Interne Register, Prompts,
Bearbeitungsakteure und Quellenbindungsbelege gehören nicht in den Reader. Bereits öffentliche
Legacytexte bleiben unverändert; darin vorhandene alte Allgemeinangaben werden nicht durch einen
Freitextparser entfernt. Einzelne Galerieverwendungen behalten eigene Kennungen, Texte und Positionen.

Medien sind ausdrücklich öffentliche HTTPS-Verweise, tatsächlich bereitgestellte Projektbilder,
gebundene normale Projektdateien oder noch nicht bereitgestellte Verweise. Ein ID-Präfix allein
belegt keine Datei. Der private Resolver muss Projekt, Kennung, Hash, Größe, MIME und Attribution
vollständig bestätigen. Vorhandene normale Dateien ohne URL und ohne privaten Bytebeleg bleiben
ehrlich `unavailable`; sie werden nicht in erfundene URLs umgewandelt. Die private normale Bild-/MP3-
Ablage ist im nachfolgenden Quellanschluss ergänzt; ihr Geräteanschluss und NAS-Betrieb bleiben offen.

`POST /api/v2/species/:id/approval-preview` benötigt die genaue Artrevision und gibt die tatsächliche
Readerprojektion, ihren Hash und offene Medienverwendungen lesend zurück. Die ausdrückliche Freigabe
verwendet weiterhin den vorhandenen Freigabeendpunkt, jetzt mit `readerCatalogVersion:2`, passendem
`expectedReaderHash` und der geprüften Personen-/Rollenbindung. Die Schreibtransaktion projiziert
erneut und prüft die tatsächliche Medienbereitstellung. Nicht angeforderte Karte/Galerie erzeugen
keine neue Medienpflicht; ihre Daten bleiben erhalten. Der bisherige Standard bleibt Catalog 1.

Dieser zusätzliche Dienstweg ist zunächst lokale Integration. Die neue sichtbare Übernahmeaktion
im Artseiteneditor ist angeschlossen; ihre native Bedienabnahme, die kompatible Geräteanbindung
und NAS-Aktivierung bleiben getrennte Nachweise.

Der Reader-/Normalquellenkern vor dem folgenden Medienanschluss ist mit **55/55 Fällen** geprüft, einschließlich realem HTTP,
mehreren MiB vollständiger Fachtexte, Bytepaginierung, privater Bildfreigabe und tatsächlichem
Rechteentzug. Die anschließende vorhandene Store-/HTTP-/Artfreigabe-/Authority-/Containerregression
besteht mit **91/91 Fällen**. Der reine Normaldateivertrag erhält bisherige Datei-IDs und bindet
Projekt, Art, Dateislot und alle sechs Metadaten in eine unveränderliche Inhaltskennung. Er legt
selbst keine Bytes oder neuen Tabellen an. Der ergänzte vollständige MP3-Prüfer besteht **27/27 Fälle**;
seine Grenzen führt der [Audiovertrag](../../docs/audio-format-validation.md#vollständige-prüfung-für-den-gemeinsamen-mediendienst).

## Normale Artdateien im Anschluss vom 2. November

Der neue Dienstanschluss ergänzt Schema 6 um getrennte unveränderliche Normaldateibelege und
deduplizierte Originalbytes. Nur ein vollständig qualifiziertes Schema 5 wird in einer eigenen
Transaktion erweitert; unbekannte oder teilweise vorhandene Tabellen werden nicht repariert.
Die bestehenden Bildtabellenbedingungen bleiben erhalten. Der Quellstart erzeugt jetzt Schema 6;
auf dem NAS ist dieser Stand noch nicht aktiviert.

| API unter `/api/v1` | Vertrag |
| --- | --- |
| `POST /normal-media` | `{speciesId,slot,expectedRevision,asset,expectedBinding}` bindet eine tatsächlich vorhandene aktuelle Artdatei und die geprüfte Person/Rolle. |
| `GET /normal-media/:contentId` | Begrenzte Dateimetadaten und tatsächlicher Bereitstellungsstand. |
| `PUT /normal-media/:contentId/content` | Unveränderte Rohbytes mit den bestehenden drei Projekt-/Personen-/Rollenkopfzeilen; Hash, Länge, Format und vollständige Dekodierprüfung müssen passen. |
| `GET /normal-media/:contentId/content` | Konkrete Originalbytes nach erneuter Berechtigungs- und Quellenprüfung. |

Die festen Rollen sind `portrait.webp`, `map.jpg`, `sound.mp3` und `spectrogram.webp`.
Ihre ursprünglichen Dateikennungen bleiben erhalten, auch bei einer Kennung mit `image-` am Anfang.
Die zusätzliche `normal-<SHA256>`-Inhaltskennung bindet Projekt, Art, Rolle und sämtliche sechs
Dateimetadaten einschließlich Quellenangabe. Die erste zugehörige tatsächliche Artversion bleibt
als Fremdschlüssel gespeichert. Ein passender Hash eines anderen Bildregisters ist kein Normaldateibeleg.
Eine exakte Wiederverwendung derselben Normalbindung in der Galerie behält diesen Dateibeleg;
abweichende Quellenangaben oder Bytes werden nicht durch die gleiche Kennung freigestellt.

Artbilder sind bis 20 MiB und 40 Millionen Pixel, vollständige MP3-Originale bis 50 MiB erlaubt.
Der bisherige Seitenentwurf besitzt weiterhin seine engere Metadatengrenze; daraus folgt keine
pauschale Vergrößerung aller Seitenbilder. Empfang ist auf 120 Sekunden begrenzt, Dekodieren auf
15 Sekunden. Bild- und Tonprüfung teilen sich einen exklusiven Dienstzugang. Nach der Prüfung werden
Anmeldung, Rolle, Personenversion und unveränderliche Quellfassung innerhalb der Schreibtransaktion
erneut gelesen. Weder Originaldateien noch vorhandene Artfassungen werden dabei verändert.

Reine Leser erhalten nur die genaue Normalbindung einer tatsächlich freigegebenen Fassung derselben
Art und Rolle. Die Leserprojektion unterscheidet Normalrollen von neuen Galeriebildern unabhängig vom
ID-Präfix. Tatsächliche Verfügbarkeitsänderungen erhöhen eine eigene Medienrevision und entwerten alte
Lesefortsetzungen. Sicherung und getrenntes Restore prüfen Schema 6, tatsächliche Bytehashes,
Bilddimensionen, vollständige MP3-Framegrenzen und die Bindung an die gespeicherte Artversion.
Die Bereitstellung ist noch nicht als automatische Windows-/Handy-Dateinachlieferung angeschlossen.

Die neue Teilprüfung besteht mit **58/58 Fällen ohne Skips**: additive Schemaänderung und Rollback,
Originalkennungen, Rechteentzug während der Prüfung, unveränderte Aufruf-/Decoderbytes, echte HTTP-
Bild-/MP3-Übertragung sowie getrennte Sicherung/Wiederherstellung. Der erste Lauf hatte 57/58:
Eine Leserrolle erhielt bei direktem Storeaufruf zunächst eine Strukturmeldung vor der eigentlichen
Berechtigungsablehnung. Die Berechtigung wird jetzt vor der Eingangsprüfung und erneut in der
Schreibtransaktion geprüft. Diese lokalen Fälle belegen keinen Linux-/NAS-/Zielgerätebetrieb.
Die anschließend vollständig ausgeführte gemeinsame Dienstregression besteht mit **597/597 Fällen,
ohne Skips**. Sie umfasst auch die bisherigen Bearbeitungs-, Offline-, Rechte-, Konflikt-, Import-,
persönlichen Sicherungs-, Reader- und Bildtextwege. Der erste neue PC-Lauf hatte 93/94 Fälle;
seine doppelt reservierte Test-Zieladresse ist korrigiert, der gezielte Workspace-Nachlauf besteht
mit 31/31. Danach bestehen die vollständige Artseitenserie mit **182/182** und die NAS-Serie
mit **31/31**, jeweils ohne Skips. Die NAS-Serie enthält den isolierten Laufzeitstart ausschließlich
aus der Container-Kopierliste und getrennte Sicherungs-/Restorefälle der bekannten alten Formate.

## Windows-Anschluss und Leserfreigabe

Der folgende Anschluss ergänzt den zuvor geprüften Dienstkern. Sein neuer Quellstand verbindet
den vorhandenen persönlichen Windows-Client mit der Normaldateibereitstellung und der erweiterten
Freigabeansicht. Die vollständige gemeinsame Serie besteht mit **635 von 636 Fällen**; ein zusätzlicher
Dateisymlinkfall ist wegen fehlender Betriebssystemberechtigung ausdrücklich übersprungen. Echte
Hardlink-/Verzeichnisjunction-, Dateidrift- und Handleabschlussfälle sind ausgeführt. Die betroffenen
Folgeserien bestehen mit **192/192 Artseiten**, **19/19 Artaktionen**, **34/34 Explorerintegration**,
**7/7 Router** und **170/170 lokale Texthilfe**, jeweils ohne Skips. Das ist eine lokale automatisierte
Qualifikation; native Bedienung und NAS-/Zielgerätebetrieb bleiben getrennt.

`client.normalMedia` verwendet dieselbe persönliche Anmeldung und serialisierte Clientqueue.
`status(input)`, `read(input)` und `upload({...input,buffer})` benötigen die genaue Art, den festen
Dateislot, UUID-Revision, vollständigen Datenhash und
`requiredBinding:{baseUrl,projectId,userId,role}`. Ein optionales Node-Abbruchsignal ist eine eigene
zweite Option. Die Methoden legen keine weitere Queue oder lokale Mediendatenbank an. Status liest
nur Metadaten; Lesen ist ein ausdrücklich ausgelöster Abruf und gibt begrenzte geprüfte Bytes zurück.
Eine Bereitstellung ist ein eigener Schreibauftrag. Sie prüft aktuelle Anmeldung, Fähigkeit,
Originalbytes und Quelle, bestätigt gegebenenfalls vorhandene Dateien und überträgt fehlende Bytes
höchstens einmal. Nach einer ungewissen Antwort beginnt erst ein neuer ausdrücklicher Auftrag mit
einer Statusprobe. Die Binärantwortgrenze von 50 MiB gilt ausschließlich für den festen Normaldatei-
Inhaltsendpunkt; sonstige Bildantworten bleiben auf 20 MiB begrenzt.

Der lokale Leser erhält ausschließlich einen tatsächlichen vollständigen Art-Datensatz und einen
festen Slot. Er liest unter `species-assets/<gebundener assetName>/<Slot>`, prüft Pfadsegmente,
Verknüpfungen, geöffneten Dateihandle, Größe, Identität, Änderungszeiten und Originalhash. Er schreibt
keine Datei. Reines Node-FS bietet dabei keinen atomaren, sämtliche übergeordneten Verzeichnisse
bindenden Öffner: Ein während des Öffnens ersetzter Pfad wird über die Handleidentität vor dem
Bytezugriff abgewiesen. Eine absolute Garantie, dass dabei niemals kurz ein fremder Handle entsteht,
wird nicht behauptet. Bei bestehenden Seitenverwendungen reichen Fachkern, Vorschau und Texthilfe
die tatsächliche Art sowie die genauen sechs Medienfelder Node-intern weiter. Eine normale Datei
mit `image-UUID` fällt damit nicht allein wegen ihrer Kennung in den Galeriecache.

`previewReaderApproval` bindet die vollständige Reader-2-Serverprojektion an Artversion, Datenhash,
Person, Rolle, tatsächlichen Leserhash und offene Medienverwendungen. Der vorhandene interne
Freigabedialog zeigt die vollständigen Texte, Quellen, Bildfolge und Bildtexte kompakt aufklappbar.
Private Dateien haben dort zunächst einen textuellen Bereitstellungsstatus; die tatsächliche
Bildbetrachtung bleibt über den Artseiteneditor beziehungsweise die vorhandenen Medienansichten
erforderlich. Die neue Ansicht ist keine native Darstellungsabnahme.

Bei fehlenden normalen Dateien zeigt **Artdateien bereitstellen** Auswahl und Umfang. Erst der
Klick verbraucht die geprüfte Vorschauentscheidung und liest beziehungsweise überträgt die fehlenden
Originale. `/api/shared-project/species/:id/approval/provide-media` erhält ausschließlich `{token}`.
Vollständiger Erfolg liefert `provided:true`; ein späterer Fehler liefert `provided:false` mit den
bereits bestätigten Slots und dem angehaltenen Slot. Es gibt keinen automatischen Wiederholungs-
oder Freigabeauftrag. Danach benötigt die interne Freigabe eine neue Leserprüfung. Bereits
freigegebene Record-1-Inhalte können ausdrücklich mit `readerCatalogVersion:2` auf fehlende
Dateibereitstellung geprüft werden; eine zweite Freigabe derselben Artversion wird abgewiesen.
Der erste bestehende Record-1-Ablauf bleibt Catalog 1, Record 2 benötigt die erweiterte Vorschau.

Schließen bricht Netzaufträge ab und wartet den vorhandenen Arbeitsbesitzer ab. Fehlende lokale
Originale bleiben von unsicheren oder geänderten Dateien unterschieden. Ein ausdrücklich gestarteter
Artseiten-Leseweg kann eine bereits bereitgestellte normale Datei authentifiziert vom Dienst lesen;
nur die bestätigte fehlende Dienstfähigkeit erlaubt den bisherigen öffentlichen Kompatibilitätsweg.
Anmelde-, Berechtigungs-, Netzwerk- oder fehlende Bytebelege werden nicht durch diesen Rückfall verdeckt.
Der ausdrückliche persönliche Offlinecache ist im folgenden Anschluss beschrieben. Die kompatible
Android-Anbindung an Reader 2 bleibt ein eigener offener Schritt; die installierte App 0.1.2+3
wird durch diese Windows-Änderung nicht aktualisiert.

### Auswählbare Offline-Artdateien

Im gemeinsamen Artbestand öffnet **Artdateien offline verwenden** die Auswahl vorhandener
Artporträts, Verbreitungskarten, Tonaufnahmen und Spektrogramme. Sie zeigt Dateigrößen und bereits
lokal gespeicherte Dateien. Die Vorschau liest nur den persönlichen Cache. Erst **Auswahl herunterladen**
lädt die ausgewählten Dateien vom gemeinsamen Dienst und legt vollständig geprüfte Originalbytes ab.
Zusätzliche Websitefotos sind von dieser Auswahl getrennt. Neue Downloads benötigen eine bestätigte
Artfassung ohne offene eigene Änderungen oder Konflikte und eine Onlineverbindung; der normale
App-Lesemodus verhindert diesen lesenden Download nicht.

Der Clientcache erhält dafür additiv Schema 4 mit getrennten Normaldateitabellen im vorhandenen
persönlichen Cache. `normalMedia.read` bleibt ohne dauerhafte Aufnahme; `download` speichert ausdrücklich,
`describeLocal` liest Metadaten und `readLocal` ausschließlich lokale Bytes. Projektadresse, Projekt,
Person, konkrete Art, fester Slot und sämtliche sechs Quellenmetadaten bleiben gebunden. Die gespeicherte
Artversion und ihr Datenhash belegen den Downloadkontext und ersetzen keine Leserfreigabe.
Voll berechtigte Bearbeiter dürfen erhaltene Dateibindungen älterer eigener Offline-Seiten nutzen;
Lesersitzungen benötigen die exakte aktuell gecachte freigegebene Artbindung. Offline lässt sich nur
der zuletzt bekannte Berechtigungsstand prüfen. Bekannter Rollenverlust sperrt den Zugriff und erhält
die gespeicherten Bytes.

Bild- und Normalcache teilen dieselbe 192-MiB-Bytegrenze; je Medienpool wird keine zusätzliche Reserve
eröffnet. Cacheaufnahme, Sicherungsdatei und persönliches Gesamtpaket behalten ihre bisherigen
384-MiB-, 512-MiB- und 1-GiB-Grenzen. Platzmangel verwirft ausschließlich die neue Aufnahme.
Bereits bestätigte Dateien eines teilweise fehlgeschlagenen Downloads bleiben erhalten, die Auswahl
muss erneut geprüft werden. Es gibt weder automatische Wiederholung noch Verdrängung alter Inhalte.
Die zugehörige Sicherungsprüfung und kontextuelle Zuordnung führt der
[Mehrgerätevertrag](../../docs/multi-device-backup-plan.md#normaldateien-und-auswählbare-offlineablage-vom-2-november).

Der lokale Offline-Nachlauf besteht mit **44/44** gezielten Cache-/Client-/Explorerfällen und
**88/88** Sicherungsfällen. Der breite Nachlauf besteht mit **664 bestandenen Fällen bei 665 insgesamt**;
ein Dateisymlinkfall bleibt wegen fehlender Windows-Berechtigung ausdrücklich übersprungen.
Weitere Gegenproben bestehen inzwischen mit **221/221 Artseiten**, **28/28 Artaktionen**, **337/337 sonstigen
Oberflächenabläufen**, **34/34 Explorerintegration** und **7/7 Routerfällen**. Die danach ergänzte
historische Quellen- und Rücklesekompatibilität besteht zusätzlich mit **22/22 Journalfällen**. Das sind lokale
Modul-/HTTP-/SQLite- und Integrationsnachweise, keine installierte NAS-, Zweit-PC- oder Bedienabnahme.
Der bisherige private Windows-Installer enthält diesen nachfolgenden Cache-4-Anschluss noch nicht.
Der anschließende CMS-Rücklesevertrag verwendet getrennte Plan-/Quittungsversion 2 und überprüfbare
Editorwerte statt eines behaupteten vollständigen Planhashes. Der betroffene Sicherungsnachlauf
besteht mit **101/101 Fällen**; Einzelregeln führt der [Artseitenvertrag](../page-authoring/README.md#vollständige-planbindung-und-tatsächliche-rücklesung).

## Start und Speicherung

`cli.mjs serve --db <absolute lokale SQLite-Datei> --confirm-local-storage` startet standardmäßig
auf `127.0.0.1:4317`. `--port` ändert den Port; `0` wählt für isolierte Tests einen freien Port.
Ein optionales `--config <absolute JSON-Datei>` akzeptiert ausschließlich `host`, `port`,
`allowNetwork`, `allowedHosts` und `allowedOrigins`. Netzwerkbindung benötigt `allowNetwork:true`
und eine ausdrückliche Hostliste. Die Standardkonfiguration öffnet keinen Netzwerkzugang.

Die SQLite-Datei gehört auf das lokale Dateisystem des NAS-Containers. UNC, relative Dateinamen,
Datei-URLs und verknüpfte Datenpfade werden abgewiesen. Gemappte Windows-Netzlaufwerke beziehungsweise
beliebige Linux-Mounttypen kann diese Prüfung nicht zuverlässig erkennen; die ausdrückliche Bestätigung
eines lokalen Dateisystems bleibt erforderlich. WAL, vollständige Synchronisation, Fremdschlüssel und
ein begrenztes Schreibwartefenster sind aktiviert. Die DB, WAL-Datei und Sicherungen sind privat.
Bei laufendem Dienst keine einzelne SQLite-Datei als vollständige Sicherung behandeln; eine spätere
integrierte Sicherung benötigt die SQLite-Backupfunktion oder einen nachgewiesen geschlossenen Dienst.

`cli.mjs bootstrap --db <Datei> --confirm-local-storage --confirm-bootstrap` liest ausschließlich
begrenztes JSON über stdin: `users` mit mindestens zwei Einträgen, jeweils `username`, `displayName`
und persönlich gewähltem `password`. Alle initialen Personen erhalten Administration. Es gibt keine
Standardnamen, Standardpasswörter oder Ausgabe von Zugangsdaten. Ein zweiter Bootstrap stoppt.
Passwörter nicht als Kommandozeilenargumente, in der Konfigurationsdatei oder im Versionsstand ablegen.

Die HTTP-Schicht beendet kein TLS und vertraut keinen weitergereichten Proxykopfzeilen. Vor einem
tatsächlichen Fernzugriff sind HTTPS, Reverseproxy, gesicherte Containerablage und NAS-Sicherung
praktisch einzurichten und abzunehmen. Dieser Quellstand aktiviert dies nicht.

## Anmeldung und Rechte

Passwörter verwenden scrypt mit N=131072, r=8, p=1, eigenem 16-Byte-Salt und 64-Byte-Ableitung.
Vergleiche erfolgen zeitkonstant. Sitzungs- und Gerätetokens besitzen je 32 zufällige Bytes;
in SQLite liegen ausschließlich SHA256-Werte. Die HTTP-Schicht begrenzt Anmeldeversuche und parallele
Passwortprüfungen. Fehlversuche pro Person werden zusätzlich mit zeitlicher Sperre dauerhaft erfasst.

| Rolle | Lesen | Entwürfe anlegen/ändern, Konflikte lösen | Intern freigeben | Personen/Rechte |
| --- | --- | --- | --- | --- |
| admin | Ja | Ja | Ja | Ja |
| publisher | Ja | Ja | Ja | Nein |
| contributor | Ja | Ja | Nein | Nein |
| reader | Nur freigegebene Versionen | Nein | Nein | Nein |

Rechte werden bei jeder Aktion aus der aktuellen Person gelesen. Eine Sperre widerruft vorhandene
Sitzungen und Geräte. Die letzte aktive Administration darf weder gesperrt noch herabgestuft werden.
Ein Passwortwechsel erfordert das bisherige Passwort und beendet alle bisherigen Zugänge dieser Person.

Alle folgenden Pfade beginnen mit `/api/v1`. Außer Login benötigt jede Aktion den passenden Bearer.
JSON-Aktionen senden `Content-Type: application/json`; Refresh darf einen leeren Körper enthalten.

Eine Geräteeinladung gilt zwei Minuten. Der Dienst hält nur ihren Hash im Arbeitsspeicher und
bindet ihn an Projekt, ausstellende Sitzung und Benutzerfassung. Eine neue Einladung derselben
Person ersetzt die frühere. Abmeldung, Sitzungsablauf, geänderte Benutzerfassung und
Dienstneustart machen offene Einladungen unbrauchbar. Die Einlösung legt in einer Transaktion
die widerrufbare Gerätezulassung an und erstellt eine Lesesitzung. Gleichzeitige Einlösungen
derselben Einladung ergeben genau eine Zulassung. Der lokale Explorer akzeptiert den
Ausstellungsauftrag nur für das gerade angezeigte Projekt und Konto. Die QR-Anzeige unter
**Eigene Geräte** rendert lokal und wird beim Schließen, Ablauf und Wechsel in den Lesemodus
entfernt. Der gebundene Encoder [qrcode-generator 2.0.4](https://github.com/kazuhikoarase/qrcode-generator)
liegt mit MIT-Lizenz unter `species-explorer/public/vendor`. Der Android-Quellstand verarbeitet den
QR-Code mit ZXing und verlangt vor der Einlösung die Bestätigung der Projektadresse.

| Aktion | Eingabe und Ergebnis |
| --- | --- |
| `GET /capabilities` | Authentifizierte Fähigkeiten des konkreten Projekts und der aktuellen Person. `pageEditorialAdoption:1` und `speciesRecordVersions:[1,2]` kennzeichnen den neuen Entwurfsweg; das ist keine Catalog-2- oder Betriebsabnahme. |
| `POST /auth/login` | `{username,password,deviceLabel?,scope?}` → `{token,expiresAt,scope,user,projectId,device?}`. Sitzung 12 Stunden, optionales Gerät 30 Tage. `scope` ist standardmäßig `full`; Android fordert ausdrücklich `read` an. `device` enthält einmalig `id`, `token`, `expiresAt`. |
| `POST /auth/refresh` | Bearer ist das Gerätetoken → neue ausschließlich lesende Sitzung, höchstens 12 Stunden und nie länger als die Gerätezulassung. |
| `POST /auth/pairing` | Volle Sitzung und `{}` → `{schemaVersion:1,code,projectId,expiresAt}`. `devicePairing:1` in den Fähigkeiten kennzeichnet die Unterstützung. |
| `POST /auth/pairing/redeem` | `{code,projectId,deviceLabel}` → persönliche Lesesitzung und widerrufbare Gerätezulassung. Der Aufruf verwendet den Einladungscode im JSON-Körper. |
| `GET /auth/me` | Öffentliche Daten der angemeldeten Person plus stabile `projectId`, keine Passwort- oder Tokenhashes. Auch Refresh enthält diese Projekt-ID. |
| `POST /auth/logout` | `{revokeDevice?:true}` beendet Sitzung und gegebenenfalls das zugehörige Gerät. |
| `GET /auth/devices`, `DELETE /auth/devices/:id` | Eigene Geräte ansehen/widerrufen; Administration kann bekannte Gerätekennungen anderer Personen widerrufen. |
| `POST /auth/password` | `{currentPassword,newPassword}` → erneute Anmeldung erforderlich. |
| `GET/POST /users`, `PATCH /users/:id` | Administration; Änderung benötigt `expectedVersion`, optional `role`, `blocked`, `displayName`. |
| `GET /catalog` | Authentifizierter, ausschließlich freigegebener Smartphone-Katalog. |
| `GET/POST /objects` | Objektliste, optional `?kind=species` oder `?kind=page`; Anlage `{kind,id,data}` ist online und ein Entwurf. |
| `GET /objects/page` | Begrenzter konsistenter Abruf: `limit=1..25`, optional `kind`, bei Fortsetzung exakt `snapshot` und `cursor`; Abschlussprüfung `snapshot=...&check=1`. |
| `GET/PUT /objects/:kind/:id` | PUT `{changeId,baseRevision,data}`; dieselbe Objektkennung ausschließlich im Pfad. |
| `POST /changes` | Idempotente bestehende Änderung `{changeId,kind,id,baseRevision,data}`. |
| `POST /changes/:id/cancel` | `{requestHash}` schließt einen noch unbestätigten eigenen Auftrag ausdrücklich ab. Der Dienst liefert zuerst eine vorhandene Übernahme-/Konfliktquittung oder versiegelt den Abbruch. Bereits übernommene Daten werden nicht zurückgesetzt. |
| `POST /objects/:kind/:id/approve` | `{expectedRevision}`; interne Freigabe, ausdrücklich `externalPublication:"not-performed"`. |
| `GET /conflicts`, `GET /conflicts/:id` | Redaktion sieht dauerhaft erhaltene Ausgangs-, Server- und Vorschlagsversion. |
| `POST /conflicts/:id/resolve` | `{expectedRevision,strategy,data?}`; `current`, `proposed` oder `merged`. Entscheidung erzeugt keine neue Freigabe. |

Fehler enthalten `{error:{code,message}}`. Ungültige, abgelaufene und gesperrte Zugänge liefern
401 `authentication_required`, fehlende Befugnis 403 `forbidden`, die begrenzte Anmeldesperre 429.
Ein fachlicher Bearbeitungskonflikt liefert HTTP 409 mit `{status:"conflict",conflictId,currentRevision}`;
beide Inhalte bleiben erhalten. Änderungen mit identischer Personen-/Änderungskennung und gleichem
Inhalt liefern dieselbe Quittung mit `replayed:true`; anderer Inhalt mit derselben Kennung stoppt.
Eine vorübergehend belegte SQLite-Schreibsperre liefert nach begrenztem Warten 503 `project_busy`.

## Katalog und Prüfgrenze

Katalogschema 1 enthält `schemaVersion`, `revision`, `generatedAt` und `species`. Arten enthalten
stabile Slugs, `scientificName`, `commonName`, `taxonomy`, geordnete `sections`, optional `websiteUrl`
und `media` mit optionalem `portrait`/`map` sowie `sounds`/`gallery`. Es werden nur ausdrücklich
zugelassene Felder angenommen. Neue freigegebene Arten dürfen ohne öffentliche Website-URL erscheinen.
Eine freigegebene frühere Artversion bleibt im Katalog, während eine neue Fassung noch Entwurf ist.

Medien verwenden stabile IDs und öffentliche HTTPS-URLs ohne eingebettete Zugangsdaten. `bytes`,
`sha256`, `mimeType` und `attribution` sind optional; Galerieeinträge enthalten zusätzlich `alt`, `caption`, `order`.
`attribution` bewahrt vorhandene menschenlesbare Quellen-/Lizenztexte unverändert bis 8000 Zeichen,
gegebenenfalls einschließlich vorhandener Quellen-/Lizenzadressen als Text. Es wird kein Lizenztext erfunden.
Der Dienst lädt keine Medien herunter und akzeptiert keine lokalen Dateipfade im Katalog.
Die mobile App sendet keine Bearertokens an Medienhosts. Ohne gültige Prüfsumme darf ein Download
nicht als inhaltsgeprüftes Offlinepaket gelten. Medienprüfsummen werden durch den späteren kontrollierten
Export bereitgestellt; der Dienst behauptet keine eigene Prüfung eines fremden HTTPS-Inhalts.

Tests: `node --no-warnings --test --test-isolation=none --test-concurrency=1 species-explorer/shared-project/store.test.mjs species-explorer/shared-project/catalog.test.mjs species-explorer/shared-project/http.test.mjs`.
Sie verwenden ausschließlich eigene synthetische `scripts/test-temp.mjs`-Sitzungen, einschließlich
realer Prozesskonkurrenz, Schreibsperre/Wiederaufnahme und gestopptem/neu gestartetem Dienstprozess.
Dies ist keine native Container-, NAS-, TLS-, Fernzugriffs- oder Mehrgeräteabnahme.

Technische Grundlagen: [Node-24-Kryptografie](https://nodejs.org/docs/latest-v24.x/api/crypto.html),
[Node-24-HTTP](https://nodejs.org/docs/latest-v24.x/api/http.html).

## Desktop-Client und lokale Warteschlange

`client.mjs` exportiert `createSharedProjectClient({filename,localStorageConfirmed,credentialStore?,fetchImpl?,allowLoopbackHttp?})`.
Alle Fassadenaktionen sind asynchron: `connect({baseUrl,username,password})`, `disconnect()`, `status()`,
`listObjects()` beziehungsweise `list()`, `getObject(kind,id)`, `editExistingObject(kind,id,data)`, `sync()`,
`listConflicts()`, `resolveConflict(id,{strategy,data?})` beziehungsweise `resolveConflicts(...)` und `close()`.
Passwörter werden nur zur Anmeldung übertragen. Standardmäßig ist ausschließlich HTTPS zulässig;
HTTP für Loopback benötigt das ausdrückliche Testflag. Redirects werden manuell abgewiesen.
Der Client ruft keine Medienadressen auf und schreibt keine bisherigen JSON-/Taxonomiedateien.

Die neue Node-Fassade `previewPageEditorial(pageObjectId,speciesSlug)` bereitet nach frischer
Anmeldung, Fähigkeitsprüfung und Bestandsabgleich eine personengebundene Vorschau vor.
`adoptPageEditorial(token)` prüft die Grundlage erneut und versiegelt ausschließlich den
Artentwurf in derselben persönlichen Warteschlange. Der Token gilt höchstens zehn Minuten
und einmal; weder Vorschau noch Annahme führen automatisch einen Schreibabgleich, eine
Leserfreigabe oder CMS-Veröffentlichung aus. Der sichtbare Exploreranschluss folgt getrennt.
Nach endgültiger Ablehnung einer geänderten Seitenquelle bleiben der versiegelte Auftrag und
spätere abhängige Fassungen erhalten. `cancelPageEditorial(changeId)` schließt einen solchen
alten Auftrag ausdrücklich ab, wenn keine späteren eigenen Fassungen daran hängen. Der Dienst
entscheidet diesen Abbruch atomar gegenüber dem Originalschreiben und erhält das Ergebnis
dauerhaft. Verlorene Antworten bleiben wiederaufnehmbar. Hängen weitere eigene Fassungen daran,
stoppt der Abschluss sichtbar mit `editorial_followup_review_required`; diese benötigen eine
gesonderte Übernahmeentscheidung. Während eines noch unbestätigten Abbruchs verhindert eine
dauerhafte persönliche Sperre neue Folgeänderungen derselben Art; andere Arten bleiben bearbeitbar.
Nach Neustart setzt der Abgleich zuerst genau diesen Abbruch fort, auch wenn zuvor noch kein
Netzaufruf zugestellt worden war. Bereits bestätigter Abschluss und ein später fehlgeschlagener
Leseabruf werden über `refreshConfirmed` getrennt zurückgegeben. Die persönliche Sicherung prüft
die Sperre gegen ihren tatsächlichen versiegelten Auftrag und weist verwaiste Marker zurück.
Der neue Bedienweg bleibt bis zum Exploreranschluss und
den noch offenen Integrationsprüfungen außerhalb der Alltagsbedienung.

Der injizierbare Anmeldespeicher besitzt die asynchronen Methoden `get(key)`, `set(key,value)`, `delete(key)`.
Nur diese interne Fassade bekommt Sitzungs-/Gerätetokens; ihre sichere dauerhafte Umsetzung liefert die
Desktopintegration über Electron-safeStorage. Der Standard hält sie ausschließlich im Prozessspeicher.
Nach Neustart mit diesem Standard ist eine neue Anmeldung nötig. Cache, Warteschlange, Status,
UI-Rückgaben und Fehlermeldungen enthalten keine Anmeldetokens oder Passwörter.

`client-store.mjs` speichert getrennte Cachebereiche nach kanonischer Serveradresse, stabiler Projekt-ID
und Person. Ein Serverwechsel sendet keine alten Änderungen an das neue Projekt; zurückgestellte Änderungen
bleiben erhalten und werden als Anzahl anderer Projektbereiche angezeigt. Der Client übernimmt keine
automatische fachliche Erstverteilung. Nur bereits geladene vorhandene Objekte können offline geändert werden.

Noch nie gesendete Änderungen am selben Objekt werden kontrolliert zur neuesten lokalen Fassung zusammengefasst.
Vor dem ersten Schreibversuch werden Änderungskennung und kanonischer Requestkörper dauerhaft festgelegt.
Eine fehlende Antwort lässt diesen Auftrag unbestätigt bestehen; Wiederholungen senden dieselben Bytes.
Weitere lokale Fassungen bekommen eine Abhängigkeit zur noch unbestätigten Änderung und werden erst nach
deren Quittung an die tatsächlich bestätigte Vorgängerversion gebunden. Sie werden dadurch nicht zum
scheinbar fremden Konflikt. Redaktionelle Konflikte enthalten Serverfassung, Ausgangsfassung, ursprünglichen
Vorschlag und alle weiteren noch wartenden lokalen Fassungen auch nach Neustart.

Bei zusätzlichen lokalen Fassungen hinter einem Konflikt ist ein ausdrücklich zusammengeführter Zielinhalt
erforderlich; die Auswahl eines einzelnen alten Standes darf diese weiteren Fassungen nicht still übergehen.
Löst eine andere Person den Serverkonflikt vorher, bleibt die lokale Entscheidung offen. Der Zieltext kann
danach als neue, erneut idempotente Änderung auf der aktuellen Serverfassung vorgemerkt werden. Frühere
Quittungen und verworfene Warteschlangenfassungen bleiben im privaten Cache nachvollziehbar erhalten.

Vor dem Abgleich werden Projektidentität und aktuelle Rolle geprüft. Ein Rechteentzug bewahrt die
Warteschlange, erlaubt jedoch keine weiteren Schreibaktionen und blendet nicht mehr zugelassene Entwürfe aus.
Geräte-Refresh liefert nur Leserechte; für wartende PC-Änderungen ist anschließend eine volle Anmeldung nötig.
Eine Sperrung oder ungültige Anmeldung beendet die lokale Zugangsverwendung. Offline kann eine noch nicht
bekannte serverseitige Rechteänderung technisch erst bei Wiederverbindung festgestellt werden.

`close()` sperrt neue Aktionen, bricht laufende Netzanforderungen ab, wartet bereits begonnene Aktionen ab
und schließt zuletzt SQLite. Unbestätigte Schreibversuche bleiben für eine spätere idempotente Wiederaufnahme
erhalten. Nach dem Abschluss werden keine Cachedateien neu angelegt. Die spätere Explorer-UI muss noch
die verständlichen Hinweise, Anmeldung, Abgleich und gezielten Konfliktentscheidungen anbinden.

Zusätzliche Clienttests: `node --no-warnings --test --test-isolation=none --test-concurrency=1 species-explorer/shared-project/client.test.mjs`.

## Lokaler Explorer-Bereich

`createExplorerSharedProjectService(options)` aus `explorer-service.mjs` ist eine synchrone Factory;
`await` ist kompatibel. Die Aktionen sind asynchron: `snapshot`, `connect`, `disconnect`, `refresh`,
`sync`, `list`, `get`, `editExisting`, `conflicts`, `resolve`, `create`, `approve`, `users`, `createUser`,
`updateUser`, `devices`, `revokeDevice`, `changePassword`, `close`. Konstruktion und lokale Leseaktionen
starten weder Netzabruf noch Import. Personen-/Gerätelisten werden erst mit ausdrücklichem
`refresh({users:true})` beziehungsweise `refresh({devices:true})` vom Dienst gelesen.

Der Aufrufer liefert den persönlichen SQLite-Pfad und den Anmeldespeicher aus Electron-`userData`.
Sie gehören nicht in den gemeinsamen `data`-Ordner. Ein fehlgeschlagener geschützter Speichervorgang
bricht die Anmeldung ohne stillen RAM-Fallback ab. Passwörter und Tokens gelangen nicht in UI-DTOs.
`snapshot` enthält `busy`, `queuedChanges`, `conflictCount` und aktuelle Rechte. Während einer laufenden
Aktion liefert es sofort den letzten sicheren Stand mit `busy:true`; unbekannte Zähler bleiben `null`.
Eine Warteschlangenfassung ist keine bestätigte oder freigegebene Serverversion. Der Abschlusswächter
muss Aktivität, unbekannten Stand und wartende Änderungen berücksichtigen. `close` bricht Anforderungen
ab, wartet die Adapterkette ab und schließt zuletzt den Cache.

Objektänderungen benötigen `{data,expectedEditRevision}` aus der angezeigten lokalen Fassung.
Konfliktentscheidungen benötigen `{strategy,data?,expectedRevision}` der sichtbar verglichenen
Serverversion. Zwischenzeitliche Änderungen stoppen die Entscheidung. `create` legt ausschließlich
online einen Entwurf an; `approve` ist ein eigener Schritt ohne Squarespace-Veröffentlichung.

`public/app-shared-project.js` liefert `SpeciesExplorerSharedProject.createSharedProjectController`
mit `{elements:{sharedProjectRoot},api?,fetchJson?,setStatus?,confirmAction?}`. Alle schreibenden lokalen
Anfragen verwenden POST; Gegenstellenlesen erfolgt ausschließlich über explizites POST `/refresh`
oder `/sync`. Standardbasis ist `/api/shared-project`. Objekte verwenden `/objects/:kind/:id`,
Freigaben zusätzlich `/approve`, Konflikte `/conflicts/:id/resolve`, Personen `/users/:id`, Geräte
`/devices/:id/revoke` und Passwortänderungen `/password`. GET snapshot/list/get/conflicts bleibt lokal.

Der Bereich bietet strukturierte Namen/Fachabschnitte, bewusste Leerstellen, öffentliche Bildvorschauen,
Alternativtexte/Beschriftungen, Versionen und gezielte Konfliktentscheidungen sowie Rollen-/Gerätepflege.
Ein Kontowechsel verwirft die bisher angezeigten Personen und Geräte schon vor der Anmeldung.
Wenn die Anmeldung gelingt und der anschließende Bestandsabruf ausfällt, gelten nur das neue Konto
und dessen lokaler Bestand. Ein abgelehnter Anmeldeversuch lässt die vorhandene Sitzung bestehen.
Die Bestätigung einer Rechteänderung nennt die Person, die gewählte Benutzerstufe und den
künftigen Zugangsstatus. Geänderte Eingaben oder eine inzwischen neu geladene Ansicht verlangen
eine neue Bestätigung. Der Dienst prüft zusätzlich die angezeigte Fassung der Zielperson.
Er führt fremde Inhalte ausschließlich über DOM/textContent ein. Der bisherige lokale Explorer bleibt
ein eigener Workflow. Server-/Router-Sitzungsschutz, persönlicher safeStorage-Speicher,
Bereichseintrag/CSS, App-Lebenszyklus und Abschlusswächter sind inzwischen quellseitig angebunden;
zusätzliche Loopbacktests prüfen die wirkliche Serververdrahtung und einen beschädigten Cache.
Die Abnahme im tatsächlich neu gestarteten Desktop und eine native visuelle
Desktop-/Mehrgeräteabnahme bleiben nach dieser Quell- und DOM-Prüfung offen.

Integrations- und DOM-Tests: `node --no-warnings --test --test-isolation=none --test-concurrency=1 species-explorer/shared-project/explorer-service.test.mjs`.

## Vollständiger Art-Arbeitsdatensatz und normaler Grunddatenweg

Der ergänzte Typ `fn-species-record`, Schema 1, verwendet dieselbe `kind:species`-Kennung,
Versionsverwaltung, Rollenprüfung und persönliche Offlinewarteschlange. Er bewahrt die vollständige
manuelle Originalzeile `input`, die davon getrennte erzeugte Fassung `generated`, Taxonomie- und
Assessmentbindungen, stabile Assetkennung, Dateimetadaten/-hashes, Schutzentscheidungen sowie
redaktionelle Abschnitte und Galerie. Unbekannte Originalfelder bleiben erhalten. Der strenge
mobile Katalogvalidator bleibt unverändert; `validateSharedSpecies` nimmt beide bestehenden
Datenformen an. Ein stiller Typwechsel oder eine automatische Bestandskonvertierung ist unzulässig.

Der tatsächliche Store prüft Übergänge innerhalb der Schreib-/Konflikttransaktion: Normale
Grunddatenänderungen dürfen nur `german`, `english`, `genus`, `species`, `size`, `weight` und
`life_expectancy` in `input` ändern. Geschützte Originalquellen, übrige Eingabeschlüssel, Medien und
Zuordnungen bleiben unverändert. `projectSpeciesRecordToCatalog` erzeugt ausschließlich aus der
freigegebenen Fassung das bisherige mobile Schema 1. Private Originalregister und Prompts werden
nicht übernommen. Ein nachgewiesen gebundener früherer Allgemeinblock wird deterministisch erneuert;
redaktioneller Allgemeintext bleibt erhalten. Hashmetadaten behaupten keine zweite bereitgestellte Datei.

`explorer-species-editor.mjs` hängt als `speciesEditor` an derselben serialisierten Explorerfassade.
Die neuen lokalen Routen sind GET `/api/shared-project/species`, GET `/species/:id` und POST
`/species/:id/preview` beziehungsweise `/save`, jeweils unter `/api/shared-project`. Leseaktionen
verwenden ausschließlich den Cache. Die Vorschau bindet Person, Dienstadresse, Projektkennung,
angezeigte lokale Fassung und Zielwerte. Speichern verbraucht diese kurzlebige Vorschau und merkt nur
die geprüfte Änderung in derselben Queue vor. Es startet weder Netzabgleich noch Freigabe oder lokale
JSON-/Assetmaterialisierung. Ein zwischenzeitlicher Personen-/Projektwechsel oder eine andere
lokale Fassung stoppt den Auftrag. Auch ein neu erkannter Konflikt entwertet eine offene
Grunddatenvorschau, selbst wenn die angezeigte Revision und die Felder gleich aussehen.
Die lokale Warteschlange prüft Fassung und Abgleichstatus gemeinsam in ihrer Schreibtransaktion.
Nach erneutem Vergleich kann eine Folgefassung bewusst vorgemerkt werden. Der Vorschautoken
ist keine dauerhafte fachliche Eigenschaft.

Der Grunddatenadapter blockiert deutsche und wissenschaftliche Umbenennungen, solange der gekoppelte
gemeinsame URL-/Assetpfadadapter noch fehlt. Vorhandene schmalere Katalogobjekte bleiben lesbar und
werden nicht aus ihrem Allgemeintext zurückgerechnet. Die normale Hauptansicht und ihr Grunddatenformular
verwenden im ergänzten Quellstand die bewusst gewählte Quelle **Artbestand → Auf diesem PC / Gemeinsames
Projekt**. Die Wahl bleibt lokal auf dem Gerät gespeichert. Beide Bestände bleiben getrennt; ein Fehler
des gemeinsamen Zugangs weicht nicht auf lokale Originaldaten aus. Verspätete Antworten eines zuvor
gewählten Bestands werden verworfen; bei bekanntem Zugangsverlust verschwinden zuvor angezeigte Arten.
Das ist noch keine vollständige Mehrbenutzer- oder NAS-Betriebsabnahme. Der laufende NAS-Dienst 0.1.2 enthält diesen
neuen Recordtyp noch nicht. Das vorbereitete Containerquellpaket 0.1.3 und seine explizite Kopierliste
sind von diesem tatsächlich laufenden Stand getrennt.

`species-workspace.mjs` stellt hinter derselben serialisierten Fassade GET
`/api/shared-project/species/workspace` und `/workspace/revision` bereit. Beide lesen ausschließlich
den vorhandenen persönlichen Cache. Der Snapshot enthält normale Ansichtsmodelle, Status und
personengebundene Editorfassungen; Originalregister und Prompts werden nicht im Browser ausgegeben.
Einzelobjektstamps werden inkrementell gebunden. Auch Änderungen an Rolle, Verbindung oder Warteschlange
verändern den sichtbaren Revisionsstand. Reader erhalten weiterhin ausschließlich die freigegebene Fassung.
Vorhandene schmale Katalogobjekte werden als noch nicht vollständig eingerichteter Bestand gezählt.

**Serverstand lesen** und **Änderungen abgleichen** sind bewusste getrennte Aktionen. Die normale
Grunddatenbearbeitung verwendet dieselben Vorschau-/Speicherrouten und meldet eine lokale Vormerkung,
keinen JSON-Backup- oder Veröffentlichungsabschluss. Offene Formulare verhindern den Bestandswechsel.
Neue Eingaben während einer laufenden Vorschau machen den alten Vorschautoken unbrauchbar.
Medien-/Taxonomie-/Lösch-/Rücknahmeaktionen sind für diesen gemeinsamen Anschluss noch nicht freigeschaltet;
sie werden weder als lokale Artaktion angeboten noch still an lokale Schreibendpunkte weitergeleitet.
Redaktionelle Fachabschnitte und geordnete Galerien sind lesbar; bewusste Leerstellen bleiben sichtbar.
Ein öffentlicher Medienverweis ist keine heruntergeladene oder hashgeprüfte lokale Datei.

### Quellengebundene gemeinsame Artanlage

Der Backendanschluss vom **2. November** ergänzt `explorer-species-creation.mjs` über dieselbe
persönliche Fassade. POST `/api/shared-project/species/new/preview` prüft manuelle Eingaben und
liefert einen gebundenen Vorschautoken; POST `/api/shared-project/species/new/create` bestätigt
ausschließlich diesen Token. Der anschließende Quellstand verbindet den vorhandenen Artassistenten
mit diesem Weg und ist gezielt automatisiert sowie in einer eigenen sichtbaren Chromeprobe geprüft.
Der lokale Artassistent arbeitet weiterhin lokal.

Im gemeinsamen Bestand erscheint **Neue Art** bei voller Online-Anmeldung mit Anlegerecht im
Bearbeitungsmodus. Beim Öffnen prüft GET `/api/shared-project/species/new/availability` Dienstfähigkeit,
Personenkontext und den eingerichteten tatsächlichen lokalen Quellenleser, ohne Artquellen zu lesen
oder etwas anzulegen. Dieselben Eingabefelder und die Taxonomieauswahl bleiben erhalten. Nach
**Eingaben prüfen** folgt ausdrücklich **Art im gemeinsamen Projekt anlegen**. Ein gemeinsamer
Entwurf startet keinen lokalen Portrait-/Karten-/Soundlauf. Diese gemeinsamen Folgewege bleiben
offen; der Dialog benennt fehlende Fachinformationen und Artdateien ausdrücklich.

Der tatsächliche Node-Quellenleser verwendet dieselbe Eingabeprüfung, Namensableitung, lokale
Artenliste, Modell-Kollisionsprüfung und Taxonomiezuordnung wie der bisherige Assistent. Er schreibt
keine Artenliste, erstellt keine Sicherung und startet keine Pipeline. Vorhandene lokale Arten oder
Assetordner verhindern eine neue quellenlose Anlage; dafür bleibt die bewusste Übernahme zuständig.
Eine ausgewählte Taxonomiereferenz samt tatsächlicher `assignmentBinding` bleibt am manuellen Input
erhalten. Erzeugte Fachdaten bleiben unbekannt, Dateibindungen leer; es werden keine Taxonomie oder
Medien aus Namen erfunden. Spätere gemeinsame Fach-/Medienergänzungen bleiben zu vervollständigen.

Vorschau und Bestätigung binden Quelle, Eingaben, Projektadresse, Projekt, Person, Rolle und positive
Personenversion. Die Fassade verlangt eine volle Online-Anmeldung und bestätigtes `speciesCreation:1`;
der ältere NAS-Dienst darf keine stille Rückfallanlage erhalten. Der persönliche Cache bewahrt nun
die vom Server gelieferte Personenversion; alte Einträge werden bei erneuter Identitätsprüfung ergänzt.
Der Server kontrolliert die gebundene Person erneut innerhalb seiner tatsächlichen Schreibtransaktion.
Jede neue vollständige Art prüft dort wissenschaftliche Identität, deutschen Namen, URL-Slugs und
Assetnamen gegen den Bestand. Das gilt auch außerhalb des administrativen Erstimports.

Ein begonnener Schreibversuch darf über denselben Token niemals einen zweiten POST auslösen.
Bei unklarer Antwort sind ausschließlich frischer Bestandsabruf und exakter Serverfassungsvergleich
erlaubt. Der eigene POST-Endpunkt `/api/shared-project/species/new/recover` ist dafür zwingend nur
lesend: Er entzieht selbst einem bislang nicht versendeten Token vor dem ersten asynchronen Schritt
das Schreibrecht und liest keine lokalen Artquellen. **Serverstand prüfen** darf somit niemals einen
ersten Anlageauftrag auslösen. Ein Treffer heißt „vorhanden, geprüft“, ohne eigene Autorschaft zu
behaupten. Andere oder fehlende Fassungen bleiben offen. Beim bloßen Dialogschließen bewahrt die
Oberfläche den offenen Kontext ausschließlich im Arbeitsspeicher. **Neue Art** öffnet bei derselben
Quelle wieder diesen Prüfweg statt einer neuen Vorschau. Die Kontexte sind sitzungsgebunden; nach
einem vollständigen Explorerneustart muss der tatsächliche Bestand geprüft werden. Es entsteht keine
zusätzliche Offline-Anlegequeue und keine Speicherung privater Formularwerte im Browserprofil.
Offline werden weiterhin ausschließlich bestehende Objekte geändert. Freigabe und Veröffentlichung
bleiben getrennte Schritte. Die Kerngegenprobe besteht mit **130/130 Fällen**, einschließlich echter
HTTP-Konkurrenz, normalem Exploreranschluss, verlorener Antwort und Personenwechsel unmittelbar vor
dem Servercommit. Dieser frühere Kernnachweis gilt nicht für die danach ergänzte Oberfläche und den
eigenen Recoveryendpunkt. Das ist keine native Assistenten-, Zweit-PC- oder NAS-Betriebsabnahme.

Der anschließende Oberflächen-/Recoverynachlauf besteht mit **135/135 gezielten Fällen** und
**41/41 Explorerintegrationsfällen**, jeweils ohne Skips. Darin sind der wirkliche Formularleser,
Feldcontroller, Personen-/Quellenwechsel sowie ein nicht zugestellter erster Anlageaufruf enthalten.
Ein vorab reproduzierter Anzeigefehler beim Wiederöffnen getrennter Männchen-/Weibchenwerte ist
korrigiert: Nach dem Wiederherstellen der Checkboxen wird ihre Feldgruppe erneut berechnet.

Die zusätzliche sichtbare Chromeprobe verwendet den tatsächlichen lokalen Explorer und eigene
Loopbackdienste mit ausschließlich künstlichen Daten. Sie prüft Öffnen, manuelle Eingabe mit
umgebenden Namensleerzeichen, Vorschau und absichtlich verlorene Speicherantwort. Nach Schließen,
bewusstem Serverstandlesen und erneutem Öffnen bestätigt **Serverstand prüfen** dieselbe Fassung.
Der tatsächliche Transportzähler bleibt bei **genau einem Anlage-POST**, der Datensatz bei einem
unfreigegebenen Entwurf. Lokale Ausgangsdateien und gebundene Quellen bleiben bytegleich; alle
eigenen Server und Fixtures sind regulär geschlossen. Der erste nicht erreichbare Teststart bleibt
als getrenntes Fehlerprotokoll erhalten; sein Aufräumdeadline ist beendet. Keine vorhandenen
Personenprofile, NAS-Daten oder Websiteinhalte verwendet. Diese Browserprobe ersetzt weder einen
aktualisierten persönlichen Electron-Start noch die tatsächliche NAS-/Zweit-PC-Abnahme.

### Vorbereitung gemeinsamer Fach- und Medienergänzungen

Der bisherige lokale Pipelinecontroller startet `update.mjs` im echten Arbeitsbestand und schließt
lokale Veröffentlichungsschritte an. Eine ausschließlich gemeinsam angelegte Art wird dafür nicht
vorübergehend in die lokale Artenliste eingetragen. Der Quellnachlauf vom **2. November** extrahiert
stattdessen den bereits vom lokalen CLI verwendeten Einartkern; Ausführung und Gegenproben beschreibt
der [Artanlagevertrag](../../docs/add-species-workflow.md#gemeinsamer-einartkern-für-fach--und-mediendaten).
Dies ist noch kein durchgehender gemeinsamer Abruf-/Übernahmeweg und kein NAS-Deployment.

`species-enrichment.mjs` und `species-enrichment-preparer.mjs` bilden inzwischen den geprüften
Node-Kandidatenweg. Die wirkliche Objektversion und ihr vollständiger Hash werden gebunden; der
Aufrufer muss Projekt, Person, Rolle und aktuelle Quelle über einen positiv bestätigten Checkpoint
erneut prüfen. Der Vorbereiter verwendet dieselben vorhandenen Quellenadapter in einer eigenen
verwalteten Temp-Sitzung. Tatsächliche Originalbytes und Kandidaten werden begrenzt gelesen und
dekodiert; unbekannte Altcredits werden in die wirklichen neuen JSON-Bytes übernommen.
`species-enrichment-transport.mjs` begrenzt schon die Antwortkörper und verknüpft deren Abbruch mit
dem Gesamtauftrag. Der Renderer bestätigt seinen tatsächlichen Prozessabschluss, bevor die eigene
Sitzung geschlossen wird. Der Nachlauf besteht mit **59/59 gezielten Fällen** und **37/37 Audioregressionen**.
Die Rückgabe ist ausdrücklich `persistentCandidate:false` und verändert keine gemeinsame Fassung.
Der normale manuelle Grunddatenweg bleibt für solche Änderungen gesperrt.

Der anschließende Node-interne Vorbereiter muss die wirkliche gemeinsame Ausgangsfassung und einen
ausdrücklichen Arbeitsbereich verwenden. Ergebnis, Herkunft, Assessmentbezug und tatsächliche
Dateihashes/-größen bleiben gebunden; abweichende aufgelöste Artidentitäten verlangen eine sichtbare
Prüfentscheidung. Die Übernahme braucht Projekt-/Personen-/Rollenbindung, Personenfassung und atomaren
Vergleich der aktuellen Objektversion samt vollständigem Ausgangshash. Sie darf nicht über den
normalen manuellen Grunddatenweg geschützte Felder austauschen.

Die ausdrücklich begrenzte Ergänzung muss unbekannte Eingabefelder, manuelle Taxonomieentscheidungen
einschließlich Begründung und Zusatzfeldern, Schutz-/Ablehnungsentscheidungen sowie vorhandene
redaktionelle Inhalte erhalten. Nur belegte automatische Vergleichswerte werden aktualisiert.
Bei Record2 sind geänderte normale Dateien zusätzlich exakt in `editorial.normalAssets` nachzuführen;
vorhandene Abschnitte, Galerie, Quellen und bewusste Leerentscheidungen bleiben gebunden.

Der heutige Normalmediendienst verlangt bereits den passenden aktuellen Serverrecord. Deshalb kann
er neue Kandidatenbytes erst nach deren Recordübernahme bereitstellen. Der lokale Nachlauf vom
**3. November** speichert deshalb den vollständigen Einartvorschlag mit seinen geprüften Dateien im
persönlichen Cache. Der erste erfolgreiche Schreibvorgang erweitert Cacheformat 4 in derselben
SQLite-Transaktion zu Format 5. Vorschlag und Bytebestand erscheinen gemeinsam oder werden gemeinsam
zurückgerollt. Bild-, Ton- und Vorschlagsdateien teilen dieselbe Medienreserve und Sicherungsgrenze.

Der Node-Client prüft vor dem Speichern die frisch gelesene gemeinsame Art und die persönliche
Bindung. Beim Wiederöffnen werden vollständiger Ausgangshash, Artversion, Dienst, Projekt, Person und
Rollenfassung abgeglichen. Im angemeldeten Offlinebetrieb kann der Client die unveränderte bekannte
Artgrundlage aus dem Cache verwenden. Ein abweichender Serverstand stoppt die Speicherung. Eine
identische Wiederholung liefert dieselbe Kennung. Der Kandidat bleibt ein privater Vorschlag.

Die bestehende Gerätesicherung prüft Format 5 auf exakte Tabellen, vollständige Bindungen, Dateigrößen,
Hashes und dekodierbare Medien. Die Restoreprobe liest aus einer eigenen wiederhergestellten Kopie
dieselben Vorschlagsbytes. Inaktive persönliche Fassungen bleiben Bestandteil der Sicherung. Der
neue Client liest die bisherigen Cacheformate. Ein bereits auf Format 5 erweiterter Cache benötigt
einen Client mit Format-5-Unterstützung. **60/60** gezielte Vorbereitungs- und Speicherfälle sowie **93/94**
Medien- und Sicherungsfälle bestehen. Eine Windows-Junction-Gegenprobe ist mangels Berechtigung
übersprungen.

Der Dienst meldet `speciesEnrichment: 1` und nimmt den typgekennzeichneten Vorschlag über
`POST /api/v1/changes` an. Er berechnet die vollständige Zielfassung aus der Ausgangsversion und
dem Quellvorschlag nach. In einer Transaktion prüft er den aktuellen Ausgangshash, die Benutzer-
und Rollenfassung sowie den geprüften Zielhash. Eine überholte Artfassung ergibt eine gezielte
Ablehnung zur erneuten Prüfung. Eine exakte Wiederholung liefert den vorhandenen Änderungsbeleg.
Die bisher freigegebene Leserfassung bleibt aktiv. Neue Bild- und Tonbytes sperren die interne
Leserfreigabe bis zu ihrer geprüften Bereitstellung, auch bei späteren manuellen Änderungen am
Entwurf. Diese Voraussetzung bleibt in der Projektdatenbank über Neustart und Sicherung erhalten.
Bei der ersten übernommenen Artvorbereitung wechselt die Datenbank in derselben Transaktion zu
Schema 7. Dieses Format bindet den Schutz neuer Medien auch an die Dienstversion. Eine Rücknahme
verwendet die zur alten Dienstversion passende Sicherung vor dem Wechsel. [NAS-Betriebsgrenzen](../../nas/README.md)

Der Node-Client stellt einen Vorschlag mit seiner Kennung und dem geprüften Zielhash ausdrücklich in
die bestehende persönliche Warteschlange. Beim Einstellen prüft er die aktuelle Fassung online.
Vorschauen auf der unveränderten gespeicherten Grundlage bleiben offline lesbar. Die Sicherung prüft
auch, ob der gespeicherte Auftrag noch genau auf seinen privaten Vorschlag und dessen Dateien zeigt.
Bei einer konkurrierenden Änderung vor der Übernahme bleibt der alte Vorschlag in der Sicherung.
Der Auftrag fällt aus der aktiven Warteschlange und benötigt eine neue Prüfung.

Nach der Übernahme speichert der Client die Entwurfskennung dauerhaft und liefert die Originalbytes
über den vorhandenen Normalmediendienst nach. Bei einem erneuten Abgleich prüft er zuerst den
Dienstbeleg. Eine bereits bestätigte Datei wird wiedererkannt. Nachfolgende Änderungen an der Art
bleiben erhalten. Eine Datei, deren Bindung die aktuelle Fassung inzwischen ersetzt hat, wird
übersprungen und im Ergebnis getrennt ausgewiesen. Die interne Leserfreigabe bleibt ein eigener
Schritt.

Der Explorer-Dialog **Artvorschlag prüfen** ruft über die lokale Sitzung getrennt Status,
Vorbereitung, Vormerken und Abgleich auf. Er zeigt den Vergleich der alten und vorgeschlagenen
Fachwerte und die neuen Bild- und Tondateien. Die Dateivorschau ist auf die aktuelle persönliche
Projektbindung, die genaue Kandidatenkennung und den festen Dateislot begrenzt. Der Explorer
liefert die Vorschlagsbytes ohne öffentlichen URL-Ersatz. Er beendet laufende Quellenarbeit, wenn
die Vorschau geschlossen oder die Sitzung beendet wird. Der Test über die lokale HTTP-Schnittstelle
und die sichtbare Windows-Probe vom 3. November verwenden simulierte Quellen und einen echten
isolierten Projektdienst. Der Abgleich speichert genau einen Entwurf und die Originalkarte. Die
normale Artansicht lädt gebundene Karten, Porträts, Aufnahmen und Spektrogramme über einen lokalen
Leseweg mit persönlicher Projektanmeldung und exakter Artfassung. Vorhandene Offlineinhalte haben
Vorrang. Das bloße Ansehen legt keinen Offlinebestand an. Öffentliche Dateien verwenden weiterhin
ihren gebundenen Verweis. Installierter Desktop- und NAS-Betrieb bleiben getrennte Abnahmen.

### Feldweise Entscheidung vollständiger Artkonflikte

`explorer-species-conflicts.mjs` verwendet dieselbe serialisierte Fassade, denselben persönlichen
Cache und die bestehende Warteschlange. Die lokalen Routen sind GET `/species/conflicts`, GET
`/species/conflicts/:id` sowie POST `/species/conflicts/:id/preview` und `/resolve`, jeweils unter
`/api/shared-project`. Leseaktionen nutzen ausschließlich den Cache. Schreibaktionen benötigen die
normale lokale Sitzung und passende Herkunft; fachliche Sperren werden mit ihrem tatsächlichen
HTTP-Status zurückgegeben. Reader und reine Lesesitzungen können keine Konfliktentscheidung ausführen.

`public/app-species-conflicts.js` liefert den eigenen Vergleich unter **Gemeinsames Projekt →
Grunddaten vergleichen**. Er zeigt aktuelle Serverwerte, Ausgangswerte und jede erhaltene lokale
Fassung für englischen Namen, Größe, Gewicht und Lebenserwartung. Jede Abweichung benötigt eine
bewusste Auswahl; möglich sind Server, eine eindeutig zugeordnete lokale Fassung oder eigener Text.
**Serverfassung beibehalten** bereitet nur die entsprechende Vorschau vor. Abweichende deutsche oder
wissenschaftliche Namen bleiben lesbar, werden über diesen Weg aber nicht übernommen. Geschützte
Originalquellen, übrige Eingabefelder, Texte und Assetbindungen bleiben exakt in der aktuellen
Serverfassung. Die Vergleichsantwort enthält keine vollständigen privaten Quellregister.

Die Vorschau bindet Dienst, Projekt, Person, Rolle/Berechtigung, vollständige Serverfassung,
Konfliktgeschichte und sämtliche lokalen Folgeentwürfe. Hashes werden je vollständigem Record
inkrementell gebildet. Eine Vorschau ist kurzlebig und nur einmal verwendbar; Feld-, Personen-,
Rollen- oder Fassungsänderungen entwerten sie. Vor dem Senden werden Anmeldung und lokale
Fassungsliste erneut geprüft. Die lokale Abschlusstransaktion gleicht dieselbe vollständige Liste
aus Kennung, Zustand und Recordhash ab, bevor sie einen Entwurf ersetzt. Ein weiterer Cachebesitzer
kann dadurch keinen ungeprüften Folgeentwurf verlieren, auch wenn der Server die Entscheidung
bereits übernommen hat. Historische Fassungen bleiben erhalten; unklare Antworten werden nie
automatisch wiederholt. **Serverstand lesen** liest zusätzlich ausschließlich bereits bekannte
offene Konfliktkennungen und aktualisiert deren Status mit einer lokalen Versionsprüfung. Es sendet
keine Warteschlange und kann keinen bereits lokal abgeschlossenen Konflikt wieder eröffnen.

Bei einem bereits andernorts abgeschlossenen Konflikt wird der geprüfte Zielinhalt gegebenenfalls
nur lokal vorgemerkt. Oberfläche und Ergebnis unterscheiden dies von einer bestätigten Serverlösung;
ein anschließender Netzabgleich bleibt bewusst auszulösen. Interne Freigabe, Websiteübernahme,
Umbenennung und lokale JSON-/Assetmaterialisierung sind keine Folge der Konfliktentscheidung.
Die isolierte Browserprobe bestätigt zwei erhaltene lokale Fassungen, gemischte Feldauswahl,
Vorschau und Bestätigung mit exakt erhaltenem Gesamtinhalt am eigenen Testdienst. Regulärer
Explorer, Originaldateien und NAS-Betrieb werden dadurch nicht umgestellt.

Die gebundene Konfliktentscheidung verlangt zusätzlich den frischen authentifizierten Nachweis
`boundConflictReview:1`. Projekt, Person und Rolle werden als vollständige Bindung in derselben
Servertransaktion geprüft. Damit stoppt auch ein späterer Wechsel in eine andere weiterhin
schreibberechtigte Rolle. Ältere Server können diese Bindung nicht still ignorieren.

### Interne Freigabe aus der normalen Artansicht

`explorer-species-approval.mjs` hängt als `speciesApproval` an derselben Fassade. POST
`/api/shared-project/species/:id/approval/preview` prüft `sourceScope`, `expectedEditRevision` und
`expectedRevision`; POST `/approval/approve` an demselben Artpfad verbraucht ausschließlich den
zugehörigen Token. Beide nutzen die normale lokale Sitzungs-/Herkunftsbarriere. Administration und
Publisher benötigen eine volle Online-Anmeldung; lokale Änderungen oder Konflikte dieser Art
sperren die Freigabe. Andere wartende Objekte bleiben ungesendet.

Die Vorschau bindet vollständigen Objektinhalt und Metadaten, Dienst, Projekt, Person, Rolle und
effektive Berechtigung. Sie enthält den kuratierten normalen Artdatensatz sowie `readerSpecies`,
die exakt aus derselben Version erzeugte Katalogprojektion. Damit sieht die menschliche Prüfung
die tatsächlichen Texte, Taxonomie und Medien für Projektleser und das Nachschlagewerk. Original-
register und Prompts erscheinen in keinem der beiden Ansichtsmodelle. Eine fehlgeschlagene
Darstellung hinterlässt keinen aktiven Freigabetoken. Ton startet nicht automatisch, beim Schließen
werden die Vorschau-Medien freigegeben. Der Wechsel vom Lese- in den Bearbeitungsmodus aktualisiert
die Aktionssperren derselben Detailansicht.

Der Client erhält `expectedDataHash` des vollständigen Records und `requiredBinding` einschließlich
Rolle. Er prüft Revision, Inhaltshash und offene lokale Arbeit nach frischer Identitätsprüfung und
erneut nach dem authentifizierten Nachweis `boundSpeciesApproval:1` unmittelbar vor dem POST.
Das zusätzliche `expectedReview:{projectId,userId,role}` wird strikt und innerhalb der bestehenden
Freigabetransaktion geprüft; der administrative Erstimport bleibt kompatibel. Der Server validiert
die Katalogprojektion, bevor er die erwartete Revision freigibt. Es gibt keine neue Warteschlange
und keinen automatischen Abgleich.

Die Antwort unterscheidet `reviewedRevision`, `approvedRevision` und `hasNewerLocalChanges`.
Ihr Artinhalt ist ausschließlich die bestätigte Serverfassung, ein späterer lokaler Entwurf bleibt
ungeprüft im Cache erhalten. `internalOnly:true` und `externalPublication:"not-performed"` grenzen
die Aktion von Artseiten-Endfreigabe und CMS-Übernahme ab. Fehler, verlorene Antworten, abgelaufene
oder verwendete Token erfordern eine neue ausdrückliche Prüfung. **Serverstand lesen** kann eine
bereits erfolgte interne Freigabe nach einer verlorenen Antwort feststellen. Die alte allgemeine
Redaktionsmaske speichert und bestätigt vollständige Arbeitsdatensätze weiterhin nicht.

Die isolierte sichtbare Probe verwendet eine eigene künstliche Art mit Fachtext und bewusster
Leerstelle, aber ohne Medien. Sie bestätigt Lese-/Bearbeitungswechsel, vollständige Lesetextvorschau,
explizite Freigabe, Schlussmeldung und verschwindende erneute Freigabeaktion. Der eigene Testdienst
belegt unveränderten Vollrecord, freigegebene Lesefassung ohne Originalregister und leere Warteschlange.
Das ist keine produktive Bestandsübernahme und keine native Medien-/NAS-/Android-Abnahme.

Die ausschließlich lesende Quellenvorbereitung `species-content/working-records.mjs` benötigt explizite
vollständige Eingabestrukturen, Arteindeutigkeit und Assetbindungen. Sie bindet tatsächliche Dateiidentität,
Größe und SHA-256 und übernimmt eine öffentliche Adresse nur bei passender belegter Katalogfassung.
Unvollständige oder mehrdeutige Quellen blockieren den betroffenen Vorschlag. Ein alter erzeugter
Allgemeinblock benötigt eine ausdrückliche exakte Quell-/Suffixbindung. Die Ausgabe bleibt vorgeschlagen;
sie importiert, konvertiert, veröffentlicht und verändert keine Dateien.

`species-content/working-import-source.mjs` verbindet diese Vorbereitung quellseitig mit derselben
`initial-import.mjs`-Steuerung. Ausschließlich der Hauptprozess gibt Leser und Assetordner vor.
Der Quellenhash bindet die sieben Originalregister, Assetwurzel, Artidentitäten, vollständigen
Zielrecords und Dateibelege. Vor jeder Anlage beziehungsweise internen Freigabe werden die globalen
Register und nur die Dateien der betroffenen Art erneut geprüft. Ein unvollständiger Bestand wird
nicht zum Importplan; der Renderer liefert weder Pfade noch eigene Quellenhashes.

Der feste Leser `local-working-source.mjs` liest die fünf bisherigen Rootregister als stabilen Block.
Bei der Vorbereitung prüft er die aktuelle öffentliche App-Katalogfassung gegen ihre Freigabedatei.
Die Vorschau zeigt die verwendete Fassung mit Datum und Artzahl. Ohne Netz oder ohne öffentliche
Freigabedatei ist der mitgelieferte Stand verfügbar. Eine beschädigte öffentliche Fassung sperrt
die Vorschau. Der bestätigte Importplan bindet dieselbe Katalogfassung auch beim Fortsetzen.
Ältere Pläne behalten ihre ursprüngliche mitgelieferte Quelle. Der Leser erkennt den erzeugten
Allgemeinblock über den bestehenden Exporter und exakten Vergleich. Alle übrigen Fachtexte bleiben
erhalten. Eindeutig lokal angelegte Arten gehen mit ihrem lokalen Art- und Dateibestand in die
Vorschau ein. Ohne passenden Websitebeleg bleiben Websiteadresse,
redaktionelle Abschnitte, Galerie und öffentliche Medienadressen für diese Arten leer. Die manuelle
Eingabezeile, der erzeugte Artdatensatz und lokale Dateien werden auch dann gemeinsam gebunden. Die
Node-Option `sharedProjectImportOptions.sourceKind: "working-records"` schließt diesen Leser an den
normalen Explorer-Server an; Browseranfragen können die Quelle nicht wechseln. Der tatsächliche lokale
Bestand ist zusätzlich vollständig lesend vorbereitet und je Art erneut geprüft, ohne Dateiänderung,
NAS-Schreiben oder Veröffentlichung. Der private Prüfnachweis liegt im bestehenden Deployment-Prüfbereich.

Das persönliche Importjournal verwendet dafür Schema 2 mit einer Quellenbindung je Plan; vorhandene
Version 1 wird unter Ausschluss eines lebenden Importbesitzers additiv übernommen. Die bisherige
öffentliche Quelle bleibt unterstützt. Ein ausdrücklich benannter unbegonnener Plan kann nach einer
Bestandsänderung erneut vorbereitet werden; ein ersetzter Plan ist nicht mehr startbar und ein
begonnener Plan behält seine Quelle. Die Sicherung liest Version 1 weiterhin und prüft bei Version 2
auch Quellen-/Record-/Dateibelege sowie die Absichten und Quittungen aller Schreibzustände.

Vollständige Importe erfordern den authentifizierten Servernachweis GET `/api/v1/capabilities` mit
Recordversion 1 und administrativ gebundenem Import. Der alte NAS-Dienst wird vor einem Schreibschritt
abgewiesen. Jede Clientaktion bindet Dienstadresse, Projekt und Person; der Store prüft Administration,
Projekt und Person erneut innerhalb der Schreibtransaktion. Unter einer anderen Kennung vorhandene
strukturierte Artidentitäten blockieren die Neuanlage auch bei einer Änderung nach der Vorprüfung.
Vorhandene schmale oder abweichende vollständige Objekte werden weder überschrieben noch freigegeben.
Die Vorschau zählt abweichende Projektfassungen getrennt und kennzeichnet die betroffenen Arten.
Datensätze bleiben auf 256 KiB begrenzt; ihre Transportumhüllung passt in die bestehende HTTP-Grenze.

Der reguläre Desktop verwendet den gebundenen vollständigen Arbeitsbestand. Alte Pläne aus der
öffentlichen Quelle behalten ihre Belege und ihren ursprünglichen Datenvertrag. Die Anbindung ist mit
künstlichen Quellen, eigenen Dateien und tatsächlichen HTTP-Diensten geprüft. Seit dem 9. November
läuft NAS 0.1.9. Für den produktiven Lauf stehen die persönliche Verbindungsprüfung und die konkrete
Übernahmefreigabe aus. Für bereits angelegte schmale Objekte bleibt der gesonderte Typwechsel offen.
Mediendateien werden separat bereitgestellt.

Die lokale Betriebsprobe vom 9. November verwendete das hashgeprüfte NAS-Quellarchiv 0.1.9, den
aktuellen lokalen Arbeitsbestand, eine neue SQLite-Datenbank und zwei getrennte Testkonten über
Loopback-HTTP. Die Vorschau meldete 64 eindeutige Arten und der Testdienst blieb bis zur Ausführung
leer. Die Probe übernahm alle 64 als Entwürfe. Das zweite Konto las jeden Datensatz vollständig
zurück. Der Katalog für Projektleser blieb leer. Die separat gestartete Medienphase bestätigte
250 Dateien mit 115.163.452 Bytes. Für drei Arten fehlen im Quellbestand Tonaufnahme und
Spektrogramm. Der private Nachweis liegt im Deployment-Prüfbereich unter
`working-import-rehearsal-64-20261109.json`. Produktive Übernahme und echter Mehrgerätebetrieb
bleiben getrennte Abnahmen.

Die erneute lokale Probe am 13. November verwendet den aktuellen Bestand und die geprüfte
öffentliche Katalogfassung. Die Vorschau ließ den getrennten Testdienst leer. Der bestätigte
Testimport legte alle 65 Arten als Entwürfe an und ein zweites Konto las sie vollständig zurück.
Der getrennte Medienlauf bestätigte alle 252 vorgesehenen Originaldateien mit insgesamt
118.086.096 Bytes.

Ein vorhandener Vorbereitungsbeleg bindet den gesamten Importplan an das ursprüngliche Projektkonto.
Ein Kontowechsel während der Quellenvorbereitung verwirft diese Vorbereitung. Ein anderes Konto kann
den gespeicherten Plan weder starten noch ersetzen. Wechselt die Anmeldung während der Übernahme,
stoppt der Lauf vor der nächsten Anlage oder internen Freigabe. Das ursprüngliche Konto kann den
gebundenen Plan nach erneuter Prüfung mit den erhaltenen Quittungen fortsetzen. Das Importjournal
verwendet dafür seine vorhandene Schema-Version 2.

Nach einer abgeschlossenen vollständigen Übernahme erscheint **Artdateien für das Projekt
bereitstellen**. Die Vorschau zählt die gebundenen Artporträts, Verbreitungskarten, Tonaufnahmen und
Spektrogramme der durch diesen Plan neu angelegten Arten und zeigt ihre Gesamtgröße. Die Aktion
benötigt eine eigene Bestätigung. Der lokale POST `/api/shared-project/import/media` erhält dafür
ausschließlich Plan-ID und Bestätigung. Bereits vorhandene Arten gehören nicht zur Auswahl.

Die Bereitstellung bindet den vorbereitenden Admin, das Projekt, die Artrevision, den Datenhash und
den Dateislot. Sie prüft zuerst den bestätigten Dateistatus beim Dienst. Fehlende Dateien werden
aus dem festen lokalen Artordner gelesen und über den vorhandenen Normaldateiweg bereitgestellt.
Seit dem Import geänderte Artfassungen werden in der Liste zur Einzelprüfung markiert. Meldet der
Dienst während der Bereitstellung eine geänderte Version, liest der Explorer die aktuelle Artfassung
und prüft Konto und Projekt erneut. Bei bestätigter Abweichung überspringt er nur die verbleibenden
Dateien dieser Art und fährt mit den anderen Arten fort. Eine unveränderte Fassung nach dem Konflikt
oder eine unklare Berechtigung hält den Lauf an. Bereits bestätigte Dateien bleiben erhalten. Ein neuer bestätigter Start
prüft deren Status erneut. Die aktuelle Fortschrittsanzeige gehört zur laufenden Sitzung. Als
dauerhafter Nachweis dienen die bestätigten Originale beim Projektdienst und das bestehende
Importjournal. Die Aktion ändert weder Artfassungen noch Leserfreigaben und hat keinen Website-Schritt.

Die lokale Probe bestätigt den separaten Aufruf über den regulären Desktopserver und den exakten
Dateiabruf in einem zweiten, unabhängig angemeldeten Testprofil. Eine verlorene Antwort, eine
geänderte Artfassung, ein fremdes Administrationskonto und das reguläre Schließen wurden getrennt
geprüft. Die betroffene Import-, Datei-, Desktop- und Transportserie besteht mit 95 Fällen. Der
private Beleg `data/website/checks/nas-implementation-20261101/deployment/working-import-media-preflight-20261103.json`
bindet die lesende Prüfung der Originalgrößen und Dateizuordnungen des hiesigen Bestands. Die
tatsächliche Übernahme und der Abruf auf den vorgesehenen PCs bleiben Betriebsprüfungen.

## Begrenzter, konsistenter Bestandsabruf

Für die kontrollierte Gerätesicherung liefern Fassade und Client über die ausschließlich Node-interne
asynchrone Methode `backupProjectIds()` sämtliche lokal bekannten Projektkennungen, einschließlich früherer
Verbindungen und im abgemeldeten Zustand. Die Bildtextbrücke liefert dieselbe Methode aus ihren persönlichen
Journalbindungen. Die Methoden verwenden weder Netzwerk noch Anmeldedaten und müssen vor `close()` laufen.

Der Desktopclient ruft höchstens 25 Objekte und höchstens 4 MiB pro Seite ab. Die Bestandskennung bindet
Projekt, tatsächliche Person, Rolle, Benutzerfassung, Sitzung, Lesebereich und jede gespeicherte Änderung
an Objektbestand oder interner Freigabe. Wechsel während des Abrufs liefern `objects_snapshot_changed`;
der Benutzer startet das erneute Laden bewusst. Unbekannte, doppelte oder mehrdeutige URL-Parameter werden
abgewiesen. Der ältere vollständige Listenaufruf stoppt ab 4 MiB oder über 1000 Objekten kontrolliert mit
`object_paging_required`. Er wird vom Desktopclient nicht mehr verwendet.

Der persönliche Cache hält die Seiten in getrennten SQLite-Stagingtabellen. Erst vollständige Anzahl,
strenge Objektfolge und eine zusätzliche erfolgreiche Server-Abschlussprüfung erlauben die atomare
Umschaltung des sichtbaren Cachebestands. Ein Fehler verändert weder den bisherigen Gesamtcache noch
die lokale Änderungswarteschlange. Die eigene laufende Stagingmenge wird bei Abbruch entfernt;
ein harter Prozessabbruch kann unsichtbare Restzeilen hinterlassen, die niemals als vollständiger Bestand
gelten. Ein inzwischen bekannt gewordener Rechteentzug blendet ungeprüfte Cacheentwürfe aus, auch wenn
der neue Gesamtabruf abbricht. Eine offline noch unbekannte Rechteänderung bleibt technisch erst bei
Wiederverbindung erkennbar.

Core-SQLite verwendet Schema 4, persönlicher Clientcache Schema 2. Bestehende Schemata werden additiv
erweitert. Generische Objektdaten bleiben auf 256 KiB begrenzt; die streng validierten Seitentypen
`website-alt-page` und `fn-species-page` besitzen je 2 MiB einschließlich Historie, ohne Medienbytes.
Große Schreibkörper sind nur an den echten Objekt-/Change-/Resolve-Endpunkten mit passender
`X-Shared-Object-Type`-Kennung bis 2 MiB plus 16 KiB Hülle zulässig. Die tatsächliche volle Schreibsitzung
wird vor dem Lesen dieser Körper geprüft und in der Schreibtransaktion erneut bestätigt.

## Explizite gemeinsame Bildtextseiten

`website-alt-sync.mjs` verbindet den vorhandenen lokalen Bildtextspeicher ausdrücklich seitenweise mit
`kind:page`, `data.type:website-alt-page` und der aus der kanonischen Seiten-URL abgeleiteten stabilen
Kennung. Die vollständige Seite enthält Bildquellen und Verwendungskennungen, Beobachtungen, Entwürfe,
Freigaben, Historien und vorhandene öffentliche Nachweise. Es werden keine Bilder lokal dupliziert.
Konstruktion, `status`, `snapshot` und `read` starten keinen Netzabruf und keinen Import.

`createWebsiteAltSync({localStore,client,filename,localStorageConfirmed})` benötigt ein persönliches
lokales SQLite-Journal (Schema 1, fremde Tabellen/Versionen werden unverändert abgewiesen) und den ausschließlich Node-internen Adapter aus
`createExplorerSharedProjectService(...).createWebsiteAltSyncAdapter()`. Er liefert keine Tokens und
wird nicht an Renderer oder HTTP-Routen ausgegeben. Die expliziten Methoden sind:

| Methode | Wirkung |
| --- | --- |
| `link({pageUrl,expectedPageRevision,confirmed:true,adoptUnlinkedApprovals?})` | Lokale Fassung und Absicht sichern, online verknüpfen oder erstmals als Entwurf anlegen; ein abweichender vorhandener Datensatz verlangt Vergleich. |
| `queue({pageUrl,expectedPageRevision?,adoptUnlinkedApprovals?})` | Gespeicherte lokale Seite vor jedem Netzversuch dauerhaft an die belegte gemeinsame Ausgangsversion binden. |
| `sync({pageUrl})` | Neuere gespeicherte lokale Änderungen zuerst vormerken, anschließend ausschließlich diese Seite senden; Konflikte bleiben offen. |
| `reconcileAfterProjectSync(status)` | Nach dem ausdrücklichen zentralen Abgleich vorgemerkte Seiten anhand des empfangenen Projektcache bestätigen oder zum Vergleich markieren. Nur die passende Fassung erhält die Quittung. |
| `pull({pageUrl})` | Gemeinsamen Stand ausdrücklich laden und für getrennte lokale Übernahme vormerken. |
| `importRemote({pageUrl,expectedPageRevision,expectedRemoteRevision,confirmed:true})` | Die verglichene gemeinsame Version erneut online prüfen und gegen die angezeigte lokale Seitenfassung importieren. |
| `conflicts(pageUrl)`, `resolve({...})` | Ausgangs-, Server- und eigene Fassung vergleichen; gezielte aktuelle, lokale oder zusammengeführte Zielentscheidung mit beiden angezeigten Revisionen. Lokaler Import bleibt anschließend ausdrücklich. |
| `close()` | Neue Aktionen sperren, begonnene Schritte abschließen oder vor dem nächsten Schreib-/Netzschritt stoppen, Journal schließen. Vor dem gemeinsamen Client schließen. |

Die erste Verknüpfung bindet Cacheabruf, gemeinsame Anlage und lokale Quittung an die Projektadresse,
das Projekt und die ursprüngliche Anmeldung einschließlich ihrer Rolle und Benutzerfassung.
Bei einem Wechsel der Anmeldung bleibt die lokale Fassung erhalten. Die ursprüngliche Person kann
denselben Schritt nach erneutem Öffnen ausdrücklich fortsetzen.
Dieselbe Bindung gilt beim Vormerken und seitenweisen Senden gespeicherter Bildtexte. Ein Wechsel
zwischen diesen Schritten versendet auch dann keine wartenden Änderungen des neuen Kontos, wenn
sie dieselbe Seite betreffen. Nur die ursprüngliche Bindung erhält eine Abgleichquittung.
Beim Konfliktvergleich bleiben Lesen, Auswahl und Senden an diese Anmeldung und die verglichene
Seitenrevision gebunden. Für einen bereits gespeicherten Serverkonflikt prüft der Dienst zusätzlich
Projekt, Person und Rolle in der Konfliktentscheidung. Bei einem Wechsel bleiben die Fassungen
offen. Nach erneuter Prüfung kann die ursprüngliche Person die Auswahl ausdrücklich bestätigen.
Entsteht erst beim Senden aus dem Vergleich ein neuer Konflikt, zeigt **Stand neu lesen** den
aktuellen Serverstand und die zuvor gewählte lokale Fassung im Vergleich. Eine lokale Übernahme
setzt eine neue Entscheidung voraus.

Der gemeinsame Server prüft die echte Actorrolle und die gespeicherte Ausgangs-/Serverfassung.
Bisher unverknüpfte lokale Freigaben brauchen eine ausdrückliche Übernahme durch Administration oder
Redaktion mit Freigaberecht. Der Server hält dafür eigene unveränderbare Belege außerhalb der editierbaren
Objektdaten. Beitragende dürfen eine freigegebene Bildbeschreibung als neuen ungeprüften Entwurf ändern;
die alte Entscheidung bleibt in der Historie. Sie dürfen historische Freigaben oder Erfolgsnachweise
nicht erneut aktivieren. Ein öffentlicher Nachweis muss genau zu Bildquelle, Bildverwendung, Freigabe und
Beobachtung passen. Importierte Nachweise bleiben vorhandene Nachweise; Synchronisation führt keine neue
öffentliche Prüfung durch, erteilt keine menschliche Freigabe und schreibt nichts in Squarespace.

`website-alt-store.mjs` bietet additive kontrollierte Exporte und einen lokalen Import mit frischer
Gesamt- sowie Seitenrevision. Die Quittung enthält genau die bei der Übernahme gespeicherte Fassung.
Eine unmittelbar danach gespeicherte Änderung wird als lokal offen angezeigt und erst mit einem
ausdrücklichen Abgleich gesendet. Nur ein nicht serialisierbares Node-intern ausgestelltes Herkunftsticket
berechtigt diesen Import; ein JSON-Feld wie `serverValidated:true` genügt nicht. Historien bleiben erhalten,
ältere Scans oder ungeprüft zurückkehrende entfernte Bilder stoppen. Änderungen einer anderen Seite werden
erneut gegen deren unveränderte Zielseitenbindung eingelesen. Der bisherige lokale Arbeitsablauf bleibt
ohne diese optionale Brücke verfügbar. Die bewusste erste Verknüpfung vorhandener persönlicher Bestände
und die echte Zwei-Personen-/NAS-Abnahme bleiben gesondert.

Seit 1. November übergibt der Desktopstart das feste Journal
`<Electron-userData>/personal-project/website-alt-sync.sqlite` an denselben persönlichen Projektdienst.
Der verwaltete Serverstart reicht auch die bereits vorgesehenen persönlichen Sicherungsoptionen weiter.
Die konfigurierte Gerätesicherung enthält damit Gerätekennung, Projektcache, Erstimportjournal und
Bildtextjournal; dessen exakter Schema-/Inhaltsvalidator prüft auch frühere Projektbindungen. Ein defektes
konfiguriertes Journal bleibt erhalten und verhindert eine vermeintlich vollständige Sicherung. Der
lokale Explorer startet dennoch; gemeinsame Bildtexte zeigen den fehlenden persönlichen Anschluss an.
Scheitert die Initialisierung eines beschädigten Bildtextjournals oder Projektcaches, schließt der
jeweilige Besitzer die SQLite-Verbindung sofort. Die Windows-Integration prüft, dass beide Dateien
nach dem Schließen des Explorers ohne Wartezeit verschoben werden können und bytegleich bleiben.
Ohne redaktionelle Anmeldung werden keine fremden Journalentwürfe angezeigt.
Der allgemeine Projekteditor erkennt `website-alt-page` als Bildtextdatensatz und verweist auch bei
Konflikten auf den eigenen Vergleich unter Website-Bildtexte. Sein allgemeines Seitenformular speichert
oder genehmigt solche Fachdaten nicht; beide zunächst fehlschlagenden UI-Regressionsfälle sind geprüft.

Schließen wartet zuerst den Sicherungsbesitzer ab, schließt danach die Bildtextbrücke und zuletzt den
gemeinsamen Client. Der vorhandene Abschlusswächter berücksichtigt bereits laufende, unbekannte oder
wartende Bildtextabgleiche. Start, Statuslesen und Sicherung lösen keine Seitenverknüpfung, Anmeldung,
Synchronisierung oder Squarespace-Veröffentlichung aus. Gezielte Tests starten den wirklichen verwalteten
Loopbackserver, prüfen einen konsistenten persönlichen Snapshot mit vier festen Dateien sowie Erhalt und
Abweisung eines beschädigten Journals. Sie ersetzen keine native Mehrgeräte-/NAS-Betriebsabnahme.

Die normale Bestandsauswahl ist zusätzlich am regulär gestarteten Windows-Explorer lesend geprüft:
gemeinsamer NAS-Abruf mit bestehender Anmeldung, klare leere gemeinsame Ansicht und Rückkehr zum
lokalen Bestand. Eine eigene künstliche Art bestätigt im Browser die echte Vorschau-/Speicherkette,
lokale Vormerkung und erst danach den ausdrücklich gestarteten Abgleich. Ein inzwischen geöffneter
Dialog bleibt bei späten Ladeantworten erhalten; Quellen-/Personenwechsel entwerten frühere Anfragen.
Diese Teilprobe ersetzt weder die kontrollierte Erstübernahme noch die Zwei-PC-/NAS-Versionsabnahme.

`fn-species-page` verwendet separat den Fachguard aus `page-authoring/shared.mjs`. Die eigene Serverquittung
bindet echte Projektmedien, Person, Rolle, UUID-Objektversion und numerischen Versionszähler. Eine generische
Objektfreigabe ersetzt dessen fachliche Seitenprüfung nicht. Ein CMS-Speichererfolg wird niemals aus
mitgeliefertem JSON erzeugt; ein tatsächlicher vertrauenswürdiger CMS-Adapter muss ihn gesondert belegen.

Gezielte Gegenproben: `paging.test.mjs`, `website-alt-sync.test.mjs` und
`page-authoring/shared-adapter.test.mjs`; ausschließlich synthetische eigene Test-temp-Fixtures und echter
Loopbackdienst. Dies ist kein Nachweis eines gestarteten NAS-Dienstes, eines Gerätezugriffs oder einer
öffentlich geänderten Website.

## Verwaltete Seitenbilder im neuen Quellstand

Der Bilddienst meldet authentifiziert `managedImageMedia:1` und `stablePageAssetBinding:1`.
Store-Schema 5 erweitert den bisherigen vollständigen Arbeitsdatensatz um unveränderliche
Bildmetadaten und nach SHA-256 deduplizierte Bildbytes. Ein bestehender geprüfter Schema-4-Store
wird additiv erweitert; unbekannte Schemaelemente stoppen vor der Initialisierung. Die alte
Version 0.1.2 auf dem NAS besitzt diese Fähigkeiten nicht. Containerbau und Betriebsabnahme
des erweiterten Quellstands 0.1.6 sind gesondert erforderlich; die älteren Vorstufen bleiben getrennt belegt.

| API unter `/api/v1` | Vertrag |
| --- | --- |
| `POST /media` | Metadatenabsicht `{id,sha256,bytes,mimeType,attribution,expectedBinding:{projectId,userId,role}}`; die Bild-ID ist eine stabile `image-<UUID>`. |
| `PUT /media/:id/content` | Unveränderte Rohbytes mit Content-Type sowie `X-Shared-Project-Id`, `X-Shared-User-Id` und `X-Shared-Role`; vorhandene vollständige ID-/Bytebindungen werden nur identisch bestätigt. |
| `GET /media/:id` | Begrenzte Metadaten, keine Bildbytes und keine automatische Nachlieferung. |
| `GET /media/:id/content` | Nur die konkret angeforderte vollständige Bilddatei nach aktueller Berechtigungsprüfung. |

JPEG, PNG und WebP sind bis 20 MiB und 40 Millionen Pixel zulässig. Hash, Länge, Dateisignatur
und tatsächliches Dekodieren müssen zusammenpassen. Die tatsächliche Anmeldung, Gerätebindung,
Personenversion und Rolle werden nach der Dekodierung erneut geprüft. Pro Dienst ist nur ein
Bildeingang gleichzeitig aktiv; ein zweiter wird sichtbar abgewiesen. JSON-Eingang hat 15 Sekunden,
Bildbytes 120 Sekunden feste Gesamtzeit und anschließendes Dekodieren höchstens 15 Sekunden.
Readers erhalten nur Bilder exakt zugeordnet zu einer tatsächlich intern freigegebenen Objektversion.
Seitenanlage, Änderung und Konfliktentscheidung prüfen ihre verwalteten Bildreferenzen atomar.

Die Bildablage wurde zunächst mit Cache-Schema 3 eingeführt; der additive Normaldateianschluss
erweitert denselben persönlichen Cache auf Schema 4. Getrennte Metadaten-/Byte-/Serverbelege je
Projektadresse, Projekt und Person. `media.importImage` verwaltet neue lokale Bytes,
`refreshMetadata` liest nur Metadaten, `downloadImage` lädt nach ausdrücklichem Auftrag.
Ein gezielter `sync` einer `fn-species-page` überträgt ausschließlich ihre benötigten neuen
Bilder vor dem bestehenden CAS-Auftrag; es entsteht keine zweite Seitenqueue. Unklare Antworten
bleiben unklar und werden nicht automatisch wiederholt. Cache-/Sicherungsgrenzen und die
dateiübergreifende Seitenbildbindung führt der [Mehrgerätevertrag](../../docs/multi-device-backup-plan.md).
