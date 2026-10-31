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

Bei einer Appaktualisierung wird der neu mitgelieferte Snapshot für diese öffentliche Ansicht verwendet.
Gespeicherte Anmeldungen und bereits gewählte Offlinepakete bleiben erhalten. Ältere Paketrevisionen
werden sichtbar als älterer Stand behandelt; gleiche Medien sind nur bei gleichem Hash wiederverwendbar.

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

Explizites erneutes Laden beobachtet hashlose Websitefotos frisch. Das gespeicherte Foto gehört zur
exakten Quell-URL und Katalogrevision seines Pakets; ein neuerer Katalog übernimmt es nicht still als
aktuellen Inhalt. Die gespeicherten Dateibytes werden beim Wiederöffnen und unmittelbar vor der
Bildanzeige erneut gehasht. Aktuelle und ältere Pakete bleiben von Anmeldung und Appaktualisierung
unabhängig in ihren bisherigen öffentlichen beziehungsweise persönlichen Cachebereichen erhalten.
Version-1-Pakete werden anhand ihrer ursprünglichen Kataloghashes weiter gelesen.
