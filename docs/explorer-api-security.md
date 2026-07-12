# Sicherheitsgrenze der lokalen Explorer-API

Stand: 2026-07-12

## Ziel und Bedrohungsmodell

Der Arten-Explorer bindet weiterhin ausschließlich an `127.0.0.1`. Trotzdem darf eine fremde Website im Browser
keine schreibenden Anfragen an den lokalen Dienst auslösen und der Kartenimport darf nicht als Zugriff auf lokale,
private oder Link-Local-Netze missbraucht werden.

Die zentrale Implementierung liegt in `species-explorer/request-security.mjs`.

## Sitzung und Browsergrenze

Bei jedem Serverstart entsteht ein zufälliges 256-Bit-Sitzungstoken. Die Explorer-Oberfläche lädt es einmalig über
`GET /api/session`, bewahrt es nur im Arbeitsspeicher der Seite auf und sendet es bei jeder POST-Anfrage im Header
`X-Species-Explorer-Session`.

Der Server prüft:

- `Host` muss exakt dem tatsächlich gebundenen lokalen Host und Port entsprechen;
- absolute oder fremde Request-URLs werden abgewiesen;
- vorhandenes `Origin` muss der Explorer-Origin entsprechen;
- `Sec-Fetch-Site` darf nur `same-origin` oder `none` sein;
- jede schreibende Route benötigt das aktuelle Sitzungstoken;
- jede POST-Anfrage muss `Content-Type: application/json` verwenden;
- CORS wird nicht geöffnet.

Ein Serverneustart macht alte Sitzungstoken automatisch ungültig. Beim normalen Browser- und Desktop-App-Start ist
keine Benutzereingabe erforderlich; `public/app.js` baut die Sitzung selbst auf.

## Bestätigung besonders kritischer Assetaktionen

Löschen und Wiederherstellen von Karten, Soundpaketen und Artportraits benötigt zusätzlich einen kurzlebigen,
aktions-, art- und assetgebundenen Bestätigungstoken. Die Oberfläche ruft nach der sichtbaren Benutzerbestätigung
zuerst `delete-preview` beziehungsweise `restore-preview` auf und verwendet den erhaltenen Token genau einmal für
die eigentliche Aktion. Direkte, wiederverwendete, abgelaufene oder für ein anderes Asset erzeugte Tokens werden
mit HTTP 409 abgewiesen.

## Schutz beim serverseitigen URL-Abruf

Vor jedem Kartenabruf und nach jeder HTTP-Weiterleitung wird das Ziel geprüft:

- nur HTTP und HTTPS;
- keine eingebetteten Zugangsdaten;
- keine `localhost`-, `.local`-, `.internal`- oder `.home.arpa`-Ziele;
- DNS-Auflösung darf keine Loopback-, private, Link-Local-, Metadaten-, Dokumentations-, Multicast- oder
  reservierte Adresse liefern;
- höchstens fünf Weiterleitungen, wobei jedes neue Ziel erneut geprüft wird.

Der spezielle Windows-WebRequest-Fallback bleibt auf den bekannten öffentlichen IUCN-Kartenendpunkt begrenzt.

## Dateipfade

Öffentliche Dateien, Artassets, Grafiken, Pipeline-Sicherungen und Asset-Wiederherstellungen verwenden echte
`path.relative()`-Verzeichnisgrenzen. Ähnlich benannte Nachbarverzeichnisse werden dadurch nicht mehr über einen
reinen Stringpräfix akzeptiert.

## Tests

```powershell
npm.cmd run --silent test:security
npm.cmd run --silent test:explorer
```

Geprüft werden unter anderem falscher Host, Cross-Site-Kontext, fehlendes Sitzungstoken, falscher Content-Type,
positive Schreibanfrage, Löschung ohne und mit Bestätigungstoken, private Karten-URL, private und öffentliche
DNS-Auflösung sowie echte Pfadgrenzen.

Squarespace-Footer und Squarespace-CSS sind von diesem Schritt nicht betroffen, weil sich die Änderung nur auf den
lokalen Explorer-Server und dessen lokale Oberfläche bezieht.
