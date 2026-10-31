# Gemeinsamer Projektdienst: Modulvertrag

Stand: 2026-10-31. Diese isolierte Node-24-Basis liest keine bestehenden Repo-, Taxonomie-,
Lightroom- oder Websitebestände. Sie verändert und veröffentlicht keine Squarespace-Inhalte.
Die fachlichen Betriebsentscheidungen und die NAS-Abnahme führt `docs/multi-device-backup-plan.md`.

`store.mjs` stellt die explizite Objektfassade für spätere bestätigte Importe bereit:
`createObject(token, {kind, id, data})` legt ausschließlich einen Entwurf an;
`submitChange(token, {changeId, kind, id, baseRevision, data})` ändert ausschließlich bestehende Objekte.
Es gibt keinen automatischen Import und keinen Bootstrap über HTTP.

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

| Aktion | Eingabe und Ergebnis |
| --- | --- |
| `POST /auth/login` | `{username,password,deviceLabel?,scope?}` → `{token,expiresAt,scope,user,projectId,device?}`. Sitzung 12 Stunden, optionales Gerät 30 Tage. `scope` ist standardmäßig `full`; Android fordert ausdrücklich `read` an. `device` enthält einmalig `id`, `token`, `expiresAt`. |
| `POST /auth/refresh` | Bearer ist das Gerätetoken → neue ausschließlich lesende Sitzung, höchstens 12 Stunden und nie länger als die Gerätezulassung. |
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
Er führt fremde Inhalte ausschließlich über DOM/textContent ein. Der bisherige lokale Explorer bleibt
ein eigener Workflow. Server-/Router-Sitzungsschutz, persönlicher safeStorage-Speicher,
Bereichseintrag/CSS, App-Lebenszyklus und Abschlusswächter sind inzwischen quellseitig angebunden;
zusätzliche Loopbacktests prüfen die wirkliche Serververdrahtung und einen beschädigten Cache.
Die Abnahme im tatsächlich neu gestarteten Desktop und eine native visuelle
Desktop-/Mehrgeräteabnahme bleiben nach dieser Quell- und DOM-Prüfung offen.

Integrations- und DOM-Tests: `node --no-warnings --test --test-isolation=none --test-concurrency=1 species-explorer/shared-project/explorer-service.test.mjs`.

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
| `pull({pageUrl})` | Gemeinsamen Stand ausdrücklich laden und für getrennte lokale Übernahme vormerken. |
| `importRemote({pageUrl,expectedPageRevision,confirmed:true})` | Kontrollierten gemeinsamen Stand gegen die tatsächlich angezeigte lokale Seitenfassung importieren. |
| `conflicts(pageUrl)`, `resolve({...})` | Ausgangs-, Server- und eigene Fassung vergleichen; gezielte aktuelle, lokale oder zusammengeführte Zielentscheidung mit beiden angezeigten Revisionen. Lokaler Import bleibt anschließend ausdrücklich. |
| `close()` | Neue Aktionen sperren, begonnene Schritte abschließen oder vor dem nächsten Schreib-/Netzschritt stoppen, Journal schließen. Vor dem gemeinsamen Client schließen. |

Der gemeinsame Server prüft die echte Actorrolle und die gespeicherte Ausgangs-/Serverfassung.
Bisher unverknüpfte lokale Freigaben brauchen eine ausdrückliche Übernahme durch Administration oder
Redaktion mit Freigaberecht. Der Server hält dafür eigene unveränderbare Belege außerhalb der editierbaren
Objektdaten. Beitragende dürfen eine freigegebene Bildbeschreibung als neuen ungeprüften Entwurf ändern;
die alte Entscheidung bleibt in der Historie. Sie dürfen historische Freigaben oder Erfolgsnachweise
nicht erneut aktivieren. Ein öffentlicher Nachweis muss genau zu Bildquelle, Bildverwendung, Freigabe und
Beobachtung passen. Importierte Nachweise bleiben vorhandene Nachweise; Synchronisation führt keine neue
öffentliche Prüfung durch, erteilt keine menschliche Freigabe und schreibt nichts in Squarespace.

`website-alt-store.mjs` bietet additive kontrollierte Exporte und einen lokalen Import mit frischer
Gesamt- sowie Seitenrevision. Nur ein nicht serialisierbares Node-intern ausgestelltes Herkunftsticket
berechtigt diesen Import; ein JSON-Feld wie `serverValidated:true` genügt nicht. Historien bleiben erhalten,
ältere Scans oder ungeprüft zurückkehrende entfernte Bilder stoppen. Änderungen einer anderen Seite werden
erneut gegen deren unveränderte Zielseitenbindung eingelesen. Der bisherige lokale Arbeitsablauf bleibt
ohne diese optionale Brücke verfügbar. Die produktive UI-/Lebenszyklusverdrahtung, die bewusste erste
Verknüpfung vorhandener persönlicher Bestände und die echte Zwei-Personen-/NAS-Abnahme bleiben gesondert.

`fn-species-page` verwendet separat den Fachguard aus `page-authoring/shared.mjs`. Die eigene Serverquittung
bindet echte Projektmedien, Person, Rolle, UUID-Objektversion und numerischen Versionszähler. Eine generische
Objektfreigabe ersetzt dessen fachliche Seitenprüfung nicht. Ein CMS-Speichererfolg wird niemals aus
mitgeliefertem JSON erzeugt; ein tatsächlicher vertrauenswürdiger CMS-Adapter muss ihn gesondert belegen.

Gezielte Gegenproben: `paging.test.mjs`, `website-alt-sync.test.mjs` und
`page-authoring/shared-adapter.test.mjs`; ausschließlich synthetische eigene Test-temp-Fixtures und echter
Loopbackdienst. Dies ist kein Nachweis eines gestarteten NAS-Dienstes, eines Gerätezugriffs oder einer
öffentlich geänderten Website.
