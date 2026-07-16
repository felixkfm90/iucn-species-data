# Repository-Audit vor der Taxonomie-Erweiterung

Stand: 2026-07-12
Repository: `felixkfm90/iucn-species-data`  
Geprüfter Branch: `main`  
Geprüfter Stand: `11d0eb8`

## Ziel und Ergebnis

Dieses Audit bewertet Code, Datenstruktur, Dateien, Dokumentation, Tests, CI und lokale Betriebsabläufe als
Grundlage für weitere Erweiterungen. Es wurden keine produktiven Daten oder Assets gelöscht, konvertiert oder
umbenannt.

Das Projekt ist funktional und die aktuelle Datenbasis ist intern konsistent. Für eine belastbare Grundlage vor
dem Taxonomie-Redesign bestehen aber drei prioritäre technische Blocker:

1. Zwölf Dateien mit der Endung `sound.mp3` enthalten tatsächlich unkomprimiertes WAV/PCM. Sie verursachen rund
   153,84 MiB und blähen das GitHub-Pages-Artefakt auf 229,92 MiB auf.
2. Der lokale Schreibserver bindet korrekt nur an `127.0.0.1`, schützt schreibende Endpunkte aber nicht global
   durch Same-Origin-/Host-/Sitzungsprüfungen. Einzelne Asset-Lösch- und Wiederherstellungsrouten sind ohne
   Vorschau-Token erreichbar. Der Kartenimport kann außerdem beliebige HTTP-/HTTPS-Ziele serverseitig abrufen.
3. Der Pages-Workflow baut und deployt, führt davor aber weder Tests noch Daten-, Assetformat- oder Größenprüfungen
   aus. Fehlerhafte beziehungsweise unnötig große Assets erreichen deshalb erst den Deployment-Schritt.

Die Taxonomie-Spezifikation in `docs/taxonomy-redesign-handoff.md` ist fachlich und technisch grundsätzlich
anschlussfähig. Das Redesign sollte erst nach dem unten beschriebenen Stabilisierungspaket begonnen werden.

## Prüfumfang

Geprüft wurden insbesondere:

- Git- und Repository-Zustand;
- alle getrackten JS-/MJS-Dateien auf Syntax;
- Explorer-Modell, lokale APIs und Explorer-Testbestand;
- `species_list.json`, `speciesData.json`, Reports, Register und Art-Assetordner;
- reale Audioformate unabhängig von der Dateiendung;
- Abhängigkeiten und `package-lock.json`;
- lokaler Schreibserver und Electron-Sicherheitskonfiguration;
- GitHub-Pages-Workflow und Artefaktaufbau;
- Dateigrößen, Binärdateien, Duplikate, lokale Laufzeitreste und Zeilenenden;
- aktuelle und historische Projektdokumentation;
- Taxonomie-Übergabe als nächster geplanter Erweiterungsschritt.

## Verifizierter Ist-Stand

### Daten und Assets

| Prüfung | Ergebnis |
|---|---:|
| Arten in Eingabeliste | 49 |
| Arten in generierter Datenbank | 49 |
| Karten | 49 |
| Artporträts | 49 |
| Sounds / Credits / Spektrogramme | 48 / 48 / 48 |
| Explorer-Assetprobleme | 0 |
| bewusst fehlende Tierstimme | 1, Grüner Leguan |
| manuell gepflegte Karten | 5 |
| NC-Sounds | 6 |
| Reportprüfungen | 9 von 9 konsistent |

Die fünf aktuell manuell gepflegten Karten sind:

- Blaukehlchen
- Fischertukan
- Panama-Kapuzineraffe
- Rotfuchs
- Waldkauz

Die sechs aktuell erkannten NC-Sounds sind:

- Bisamratte
- Brauenmotmot
- Geoffroy-Klammeraffe
- Großtrappe
- Löwe
- Scharlachara

Zusätzliche Datenprüfungen ergaben:

- keine doppelten IDs, deutschen Namen, wissenschaftlichen Namen oder SafeNames;
- keine verwaisten Einträge in `species-assets-overrides.json` oder `lastSavedAssessmentId.json`;
- zu jedem vorhandenen Sound existieren Credits;
- alle 104 getrackten JSON-Dateien sind syntaktisch gültig;
- die kontrollierte Groß-/Kleinschreibung der vorhandenen Taxonomiefelder ist konsistent.

### Tests und Syntax

| Befehl / Prüfung | Ergebnis |
|---|---|
| `npm.cmd run --silent test:explorer` | 23 von 23 Tests erfolgreich |
| `npm.cmd run --silent audit:site -- --skip-live --skip-pages` | erfolgreich, Daten und Report konsistent |
| `node --check` über alle getrackten JS-/MJS-Dateien | 25 von 25 erfolgreich |
| `npm audit --json` | 0 bekannte Schwachstellen beim Auditlauf |
| getrackte Dateien ab 1 KiB auf SHA-256-Duplikate | 333 geprüft, 0 Duplikatgruppen |

Die Abfrage verfügbarer neuer Paketversionen konnte wegen der begrenzten externen Toolverbindung nicht verifiziert
werden. Das ist kein Projektfehler; die Sicherheitsprüfung der installierten Abhängigkeiten war erfolgreich.

## Priorisierte Befunde

## P0 – vor neuen Funktionsblöcken beheben

### A1. Zwölf WAV-Dateien tragen fälschlich die Endung `.mp3`

`ffprobe` erkennt bei zwölf produktiven `sound.mp3`-Dateien das Containerformat `wav`. Zusammen belegen diese
Dateien 153,84 MiB für rund 718,6 Sekunden Audio. Die 36 echten MP3-Dateien belegen zusammen nur 30,95 MiB.

| Art | Ist-Format | Größe | Dauer | Bitrate |
|---|---|---:|---:|---:|
| Graugans | WAV/PCM | 38,90 MiB | 141,6 s | 2304 kbit/s |
| Buntspecht | WAV/PCM | 36,89 MiB | 100,7 s | 3072 kbit/s |
| Blaukehlchen | WAV/PCM | 33,17 MiB | 197,1 s | 1411 kbit/s |
| Blässhuhn | WAV/PCM | 11,69 MiB | 42,5 s | 2304 kbit/s |
| Kleiber | WAV/PCM | 10,72 MiB | 63,7 s | 1411 kbit/s |
| Kohlmeise | WAV/PCM | 7,50 MiB | 54,7 s | 1152 kbit/s |
| Bergfink | WAV/PCM | 4,20 MiB | 15,3 s | 2306 kbit/s |
| Eisvogel | WAV/PCM | 2,97 MiB | 35,3 s | 706 kbit/s |
| Papageientaucher | WAV/PCM | 2,62 MiB | 31,1 s | 707 kbit/s |
| Waldkauz | WAV/PCM | 1,96 MiB | 10,7 s | 1536 kbit/s |
| Geoffroy-Klammeraffe | WAV/PCM | 1,88 MiB | 11,2 s | 1411 kbit/s |
| Reh | WAV/PCM | 1,35 MiB | 14,7 s | 768 kbit/s |

Ursache im Code:

- `saveSoundRecording()` lädt Xeno-Canto-Dateien und schreibt die Bytes ungeprüft als `sound.mp3`.
- `saveInatSoundRecording()` hat denselben ungeprüften Schreibpfad.
- Nur der Commons-Pfad ruft derzeit `isMp3Buffer()` auf.
- Der manuelle Explorer-Upload prüft das Format bereits strenger; die Pipeline tut dies nicht einheitlich.

Auswirkung:

- Das auf dem geprüften Basisstand erzeugte Pages-Artefakt umfasst 359 Dateien und 229,92 MiB; mit diesem
  zusätzlich veröffentlichten Auditbericht sind es 360 Dateien bei weiterhin rund 229,9 MiB.
- Bei einer kontrollierten MP3-Konvertierung mit etwa 160 kbit/s würden die zwölf Dateien voraussichtlich nur rund
  13,7 MiB belegen. Das Artefakt könnte dadurch grob auf 90 MiB sinken.
- Die großen Binärdateien erhöhen Push-, Backup-, Checkout- und Pages-Synchronisationslast und sind eine plausible
  Hauptursache der wiederholt erst nach Rerun erfolgreichen Pages-Deployments.
- Die Dateiendung verspricht Browsern einen anderen Inhalt als tatsächlich ausgeliefert wird.

Empfohlene Behebung als eigener, rücksetzbarer Migrationsschritt:

1. NAS-Backup plus lokales Backup prüfen.
2. Einen zentralen Audio-Inspektor für alle automatischen Quellen einführen.
3. Nicht-MP3-Quellen entweder kontrolliert nach MP3 konvertieren oder als Kandidat ablehnen; niemals nur umbenennen.
4. Die zwölf Bestandsdateien nach MP3 konvertieren.
5. Spektrogramme und Sound-Hashregister neu erzeugen; Credits inhaltlich erhalten.
6. Vollständigen Daten-/Assetaudit ausführen.
7. Pages-Artefaktgröße über Einzelgrenzen und ein mit der Artenzahl wachsendes CI-Budget prüfen.
8. Migration in einem separaten Commit veröffentlichen und Pages kontrollieren.

Umsetzung am 2026-07-12:

- Der zentrale Inspektor `scripts/audio-format.mjs` verlangt mehrere aufeinanderfolgende gültige MPEG-Frames und
  wird von Pipeline, Explorer-Upload und Asset-Wiederherstellung gemeinsam verwendet.
- Xeno-Canto-, Commons- und iNaturalist-Kandidaten werden vor dem Schreiben geprüft; Nicht-MP3-Daten werden nicht
  mehr lediglich mit einer `.mp3`-Endung gespeichert.
- Die zwölf WAV/PCM-Dateien wurden mit rücksetzbarer lokaler Sicherung nach MP3 migriert. Ihre Gesamtgröße sank von
  153,84 auf 13,72 MiB, also um 140,12 MiB; die maximale Dauerabweichung lag bei rund 0,001 Sekunden.
- Alle 48 vorhandenen `sound.mp3` sind technisch gültige MP3-Dateien. Credits blieben unverändert, zwölf
  Spektrogramme und die zugehörigen Sound-Hashes wurden neu erzeugt.
- 4 Audioformat-Tests, inzwischen 24 Explorer-Tests, 28 JS-/MJS-Syntaxprüfungen, Report-Neuaufbau und lokaler Gesamtaudit
  bestehen. Das kontrollierte Pages-Artefakt umfasst 361 Dateien und 89,86 MiB.
- Details und Rückfallweg stehen in `docs/audio-format-validation.md`. Der Medienvalidator und das dynamische
  Pages-Größenbudget wurden anschließend als eigener Stabilisierungspunkt umgesetzt.

### A2. Schreibende localhost-API erhält eine Browser-Sicherheitsgrenze

Positiv:

- Der Server bindet ausschließlich an `127.0.0.1`.
- Electron verwendet `nodeIntegration: false`, `contextIsolation: true` und `sandbox: true`.
- Vorschau-/Speicherabläufe verwenden an vielen Stellen kurzlebige Tokens und Revisionsprüfungen.
- Uploadgrößen und manuell importierte Bild-/Audiodateien werden begrenzt und geprüft.

Offene Lücke:

- Der zentrale Request-Handler prüft weder `Origin` noch `Host` oder `Sec-Fetch-Site`.
- `readJsonBody()` akzeptiert JSON-Inhalt unabhängig vom `Content-Type`.
- Asset-`delete`- und `restore`-Routen führen Änderungen ohne Vorschau-Token aus.
- Backup-Einstellungen und Backup-Start besitzen keine Sitzungsauthentisierung.
- Ein externer Browserkontext kann einfache Cross-Origin-POSTs absenden, auch wenn er die Antwort wegen CORS nicht
  lesen darf.
- Beim Kartenimport wird jede syntaktisch gültige HTTP-/HTTPS-URL serverseitig abgerufen. Private, lokale und
  Link-Local-Ziele werden nicht blockiert.

Empfohlene Behebung:

1. Pro Serverstart ein zufälliges Sitzungstoken erzeugen und für jede schreibende Route verlangen.
2. `Host` auf den verwalteten lokalen Host/Port begrenzen und bei Browser-POSTs nur dieselbe `Origin` akzeptieren.
3. Für JSON-Routen `Content-Type: application/json` erzwingen.
4. Löschen und Wiederherstellen ebenfalls über Vorschau-/Bestätigungstoken absichern.
5. Beim URL-Import nach DNS-Auflösung Loopback-, private, Link-Local- und Metadatenziele blockieren; nur öffentliche
   HTTP-/HTTPS-Ziele zulassen.
6. Positive und negative Integrationstests für diese Grenze ergänzen.
7. `safePublicPath()` und vergleichbare Pfadprüfungen auf `path.relative()` mit echter Verzeichnisgrenze umstellen,
   statt nur Stringpräfixe zu vergleichen.

Umsetzung am 2026-07-12:

- `species-explorer/request-security.mjs` bündelt die Sicherheitsgrenze unabhängig von einzelnen Fachrouten.
- Pro Serverstart entsteht ein zufälliges 256-Bit-Sitzungstoken. Alle POST-Routen verlangen es zusammen mit
  `application/json`; Host, Origin und `Sec-Fetch-Site` werden zentral geprüft.
- Asset-Löschen und -Wiederherstellen verwenden zusätzliche kurzlebige, einmalige und an Art, Assettyp sowie Aktion
  gebundene Bestätigungstoken.
- Karten-URLs und jede Weiterleitung werden vor dem Abruf per DNS-Auflösung gegen lokale, private, Link-Local-,
  Metadaten-, Dokumentations-, Multicast- und reservierte Ziele geprüft. Auch eingebettete IPv4-Adressen in IPv6
  werden berücksichtigt. Der Windows-Fallback bleibt auf den bekannten IUCN-Endpunkt begrenzt.
- Öffentliche Dateien, Artassets, Grafiken und Sicherungspfade verwenden `path.relative()` statt Stringpräfixen.
- 24 Explorer-Integrationstests und 3 dedizierte Sicherheitstests bestehen. Die Bedienung bleibt für Browser- und
  Desktop-App transparent; Squarespace ist nicht betroffen. Details: `docs/explorer-api-security.md`.

### A3. GitHub Pages besitzt eine vollständige Qualitätsbarriere vor dem Deployment

**Erledigt am 2026-07-13.**

Der Workflow `.github/workflows/pages.yml` besitzt jetzt drei strikt abhängige Jobs:

1. `Quality checks`: Node.js 24, `npm ci --ignore-scripts`, Syntaxprüfung, gemeinsamer `npm test`-Einstieg,
   Audio-/Medienvalidator, Projektzustandsprüfung und lokaler Monatsaudit;
2. `Build Pages artifact`: kontrollierter Artefaktbau mit dynamischem Größenbudget und exakter Pfadprüfung;
3. `Deploy to GitHub Pages`: nur nach erfolgreichem Quality- und Build-Job.

`scripts/validate-project-state.mjs` nutzt das Explorer-Modell als fachliche Quelle und ergänzt Duplikat-, Override-
und Assessment-Prüfungen. Bewusst fehlende Sounds und abweichende Assessment-Zuordnungen manuell gepflegter Karten
bleiben fachlich zulässig. `scripts/pages-artifact-policy.mjs` wird gemeinsam von Builder und Prüfer verwendet;
zusätzliche, fehlende oder symbolisch verlinkte Dateien führen vor dem Upload zum Fehler. Die Photoshop-Designquelle
unter `graphics/` bleibt versioniert, wird aber nicht mehr veröffentlicht.

Der lokale Teststand umfasst 37 Syntaxdateien, 38 automatisierte Tests, 48 geprüfte MP3-Dateien, 263 geprüfte
Medien sowie 49 konsistente Arten. Das Pages-Artefakt enthält 364 freigegebene Dateien mit 89,72 MiB bei einem
dynamischen Budget von 134,5 MiB. Details: `docs/ci-quality-gate.md`.

## P1 – Stabilisierung direkt danach

### A4. Server und Oberfläche sind zu großen Monolithen gewachsen

| Datei | Zeilen | benannte Funktionen | API-Referenzen |
|---|---:|---:|---:|
| `species-explorer/server.mjs` | 6722 | 80 | 26 |
| `species-explorer/public/app.js` | 5659 | 80 | 50 |
| `species-explorer/server.test.mjs` | 2676 | 5 Hilfsfunktionen | 72 |
| `update.mjs` | 1990 | 78 | 4 |

Die Funktionalität ist getestet, aber Änderungen an Dialogen, Pipeline, Assetverwaltung und CRUD greifen inzwischen
in dieselben sehr großen Dateien. Das erhöht Seiteneffekte und erschwert gezielte Tests.

Empfohlene Modulgrenzen:

- Server: HTTP/Routing, Modellaufbau, Arten-CRUD, Asset-I/O, Pipeline-Orchestrierung, Backups/Publikation, Sicherheit.
- Oberfläche: Zustands-/API-Schicht, Medienkarten, Bearbeitungsdialoge, Neue-Art-Assistent, Pipeline-Dialoge,
  gemeinsamer Modal- und Audio-Controller.
- Pipeline: IUCN-, Xeno-Canto-, Commons- und iNaturalist-Adapter sowie zentrale Assetvalidierung.

Kein Big-Bang-Umbau: zuerst Charakterisierungstests ergänzen, dann Modul für Modul extrahieren. Eine vollständige
Explorer-Zerlegung muss das Taxonomie-Frontend nicht blockieren; neue Funktionen sollten den Monolithen aber nicht
weiter vergrößern.

Umsetzungsstand am 2026-07-15:

- Der erste verhaltensneutrale Modulschnitt ist abgeschlossen. `species-explorer/asset-backups.mjs` bündelt
  Dateinamensregeln, Metadaten, Schreiben, Auffinden und Aufbewahrung wiederherstellbarer Asset-Sicherungen sowie
  die begrenzte Aufbewahrung von Eingabelistenbackups und Pipeline-Logs.
- `species-explorer/server.mjs` verwendet ausschließlich dieses Modul; rund 250 Zeilen Sicherungsimplementierung
  wurden aus dem Server entfernt.
- Drei direkte Charakterisierungstests prüfen Überschreiben des letzten Assetstands, Metadaten und
  Wiederauffindbarkeit, Retention sowie den Schutz fremder Dateien. Die bestehenden 24 Explorer-Integrationstests
  bleiben unverändert erfolgreich.
- Der zweite verhaltensneutrale Modulschnitt ist abgeschlossen. `species-explorer/species-model.mjs` bündelt
  Felddefinitionen, Namens- und Taxonomienormalisierung, Validierung neuer und vorhandener Arten,
  Kollisionsprüfungen, Bearbeitungsdiffs, Umbenennungsprüfungen sowie Report- und Planprojektionen.
- `species-explorer/server.mjs` sank dadurch von 6.557 auf 6.052 Zeilen. Fünf direkte Modelltests prüfen
  Normalisierung, neue Arten, Datei- und Datenkollisionen, Bearbeitungs-/Umbenennungsdiffs sowie öffentliche
  Report- und Plandaten. Gemeinsam mit den drei Backuptests und den 24 Explorer-Integrationstests umfasst der
  vollständige Testeinstieg jetzt 50 Tests.
- Der dritte verhaltensneutrale Modulschnitt ist abgeschlossen. `species-explorer/http-routing.mjs` bündelt
  JSON-Anfragegrenzen, JSON-/Textantworten, sichere öffentliche/Asset-/Grafikpfade, MIME-Typen,
  Byte-Range-Dateiauslieferung und das Freigeben aktiver Dateistreams. Fehlerhaft URL-kodierte Pfade werden
  kontrolliert abgewiesen.
- `species-explorer/server.mjs` sank dadurch von 6.052 auf 5.858 Zeilen. Fünf direkte HTTP-Tests prüfen
  Body-Limits und Fehlercodes, Pfadgrenzen, Byte-Range-Auswertung, Antwortheader sowie vollständige, HEAD-, Range-,
  Fehler- und Nicht-gefunden-Dateiantworten. Gemeinsam mit den acht vorhandenen Modultests und den 24
  Explorer-Integrationstests umfasst der vollständige Testeinstieg jetzt 55 Tests.
- Der vierte kontrollierte Modulschnitt ist abgeschlossen. `species-explorer/request-router.mjs` übernimmt die
  vollständige Methoden-/Pfadzuordnung, Browser- und Schreibschutzdelegation, aktionsabhängige Body-Limits,
  strukturierte Fehlerantworten sowie die Auswahl der freigegebenen Vorschau-, Asset-, Grafik- und Public-Dateien.
  Fachoperationen und veränderlicher Laufzustand verbleiben bewusst in `server.mjs` und werden als benannte
  Operationen injiziert.
- Vier direkte Routertests prüfen eindeutige Routen und den Vorrang der Neue-Art-Endpunkte, Lese- und statische
  Antworten, dekodierte Schreibdelegation und Body-Limits sowie Vorschau- und Fehlerantworten. Die Neue-Art-Route
  `portrait-preview` wird dabei ausdrücklich getrennt von der allgemeinen Artenvorschau geprüft.
- `species-explorer/server.mjs` sank dadurch von 5.858 auf 5.654 Zeilen. Gemeinsam mit den dreizehn vorhandenen
  Modultests und den 24 Explorer-Integrationstests umfasst der vollständige Testeinstieg jetzt 59 Tests.
- Der fünfte verhaltensneutrale Modulschnitt beginnt die Oberflächentrennung.
  `species-explorer/public/app-foundation.js` bündelt die unabhängige Zustandsfabrik, den einmaligen Sitzungsaufbau,
  geschützte JSON-Anfragen, das konsistente Laden der fünf Explorer-Datenendpunkte und die Revisionsabfrage.
  `public/app.js` enthält keine direkten `fetch()`-Aufrufe mehr und sank von 5.688 auf 5.583 Zeilen.
- Vier direkte Frontend-Grundlagentests prüfen unabhängige Zustände, Session-Caching und Schreibheader,
  Schnappschussreihenfolge sowie strukturierte Fehler und Revisionsausfälle. Gemeinsam mit den 17 bisherigen
  Modultests und den 24 Explorer-Integrationstests umfasst der vollständige Testeinstieg jetzt 63 Tests.
- Der sechste verhaltensneutrale Modulschnitt trennt reine Präsentationslogik in
  `species-explorer/public/app-presentation.js`: HTML- und URL-Sicherheit, Größen-/Datumsformatierung,
  IUCN-Bezeichnungen und lokale Symbolpfade, Assetstatus, geschlechtsspezifische Datenzeilen,
  Soundlizenzkennzeichnung sowie versionsbasierte Medien-URLs. Das Modul besitzt keinen veränderlichen Zustand und
  steuert weder Dialoge noch Audio-/DOM-Ereignisse.
- Fünf direkte Präsentationstests prüfen sichere Ausgaben, Formatierung, vertrauenswürdige Datenzeilen, IUCN- und
  Lizenzanzeigen sowie deterministische Asset-URLs. Der gemeinsame vollständige Testeinstieg umfasst damit jetzt
  68 Tests. `public/app.js` sank von 5.583 auf 5.389 Zeilen. Squarespace-Laufzeitdateien, Footer-Versionen und
  Custom CSS blieben unberührt.
- Der siebte kontrollierte Modulschnitt bündelt in
  `species-explorer/public/app-measurements.js` alle Einheiten-, Parsing-, Singular-/Plural-, Formatierungs- und
  Formularhelfer für Größe, Gewicht und Lebenserwartung. Neue-Art-Assistent und allgemeiner Bearbeitungsdialog
  verwenden dieselbe Implementierung; die lokale Doppelung im Assistenten wurde entfernt.
- Fünf direkte Messwerttests prüfen unveränderliche Einheitendefinitionen, gemeinsame und ältere Freitextwerte,
  geschlechtsspezifische Werte, Singular-/Pluralformatierung und sicher maskiertes Formular-Markup. Sie decken
  zugleich den behobenen Altfehler ab, bei dem wegen der Einheitenreihenfolge aus `kg` nur das abschließende `g`
  entfernt wurde. Der gemeinsame Testeinstieg umfasst damit 73 Tests; `public/app.js` sank von 5.389 auf 5.241
  Zeilen. Squarespace-Laufzeitdateien, Footer-Versionen und Custom CSS blieben unberührt.
- Der achte kontrollierte Oberflächenschnitt bündelt mit `species-explorer/public/app-dialogs.js` die gemeinsamen
  Dialogregeln: modales Öffnen und Schließen, sichere Hintergrundklicks, Escape-Behandlung, Schließsperren,
  Körperklassen und das Freigeben von Audio-/Videoquellen. Datenbank-, Backup-, Pipeline-, Neue-Art-,
  Bearbeitungs-, Lösch-, Karten-, Portrait-, Assetprüf- und Bestätigungsdialoge verwenden diese Grenze; ihre
  fachlichen Speichervorgänge und Sperrbedingungen bleiben in `public/app.js`.
- Fünf direkte Dialogtests prüfen Öffnen/Schließen, sichere Hintergrundklicks, Escape- und Busy-Sperren,
  Schaltflächen-Lebenszyklen sowie Medienfreigabe. Zusammen mit den bestehenden Tests umfasst der gemeinsame
  Testeinstieg 78 Tests; `public/app.js` sank weiter auf 5.159 Zeilen. Ein realer lokaler Browsertest deckte
  Datenbankdialog, Neue-Art-Assistent, Karten-Lightbox, Bereichsbearbeitung und Bestätigungsdialog ab. Es wurden
  keine Squarespace-Laufzeitdateien, Footer-Versionen oder Custom-CSS-Dateien geändert.
- Der neunte kontrollierte Oberflächenschnitt trennt mit `species-explorer/public/app-media.js` die Darstellung der
  Karten- und Portraitbereiche sowie die dazugehörigen Audio- und Lightbox-Controller. Die Mediengrenze verwendet
  weiterhin die zentralen Präsentations- und Dialoghelfer; fachliche Bearbeitungs- und Speicherabläufe bleiben in
  `public/app.js`.
- Sechs direkte Medientests prüfen Zeitformatierung, Karten- und Portrait-Markup, sichere Ausgabewerte,
  Scrollrücksetzung, Audiozustände und den Lightbox-Lebenszyklus. Der gemeinsame Testeinstieg umfasst damit 84
  Tests; `public/app.js` sank auf 4.936 Zeilen. Ein realer lokaler Browsertest bestätigte Datenladung,
  Medienaktionen sowie Öffnen und Schließen von Karten- und Portrait-Lightbox. Squarespace-Laufzeitdateien,
  Footer-Versionen und Custom CSS blieben unverändert.
- Der zehnte kontrollierte Oberflächenschnitt führt
  `species-explorer/public/app-asset-review.js` als fachliche Grenze für den Karten-/Soundvergleich nach
  Pipeline-Läufen ein. Das Modul rendert sichere Entscheidungsansichten, unterscheidet bisherigen manuellen oder
  automatischen Kartenbestand und freie beziehungsweise NC-Sounds und steuert Karten-Lightbox,
  Spektrogramm-Scrubbing, Fortschrittsmarker sowie die Medienfreigabe. Pipelinezustand, API-Aufrufe,
  Folge-Suchläufe und Speichern der Entscheidung bleiben bewusst in `public/app.js`.
- Fünf direkte Assetprüftests decken Signaturwechsel, Entscheidungstexte, Karten- und Soundvergleich,
  Pfadunterdrückung sowie Mediensteuerung und Listener-Freigabe ab. Der gemeinsame Testeinstieg umfasst damit 89
  Tests; `public/app.js` sank auf 4.760 Zeilen. Der lokale Server liefert das Modul explizit aus, das HTML lädt es
  nach der Mediengrenze und vor `app.js`, und ein realer lokaler Browsertest bestätigte 49 geladene Arten ohne
  Konsolenfehler. Squarespace-Laufzeitdateien, Footer-Versionen und Custom CSS blieben unverändert.
- Der elfte kontrollierte Oberflächenschnitt führt `species-explorer/public/app-pipeline.js` als reine
  Präsentationsgrenze für Datenbank- und Pipelineaktionen ein. Modusbezeichnungen, Datenbankstatus,
  Pipeline-/Backup-Zustände, Übertragungs-, Bereinigungs- und Backupvorschauen sowie das automatische Nachführen
  der Prozessausgabe liegen nicht mehr in `public/app.js`; API-Aufrufe, Laufsteuerung und veränderlicher Zustand
  bleiben dort.
- Sieben direkte Pipeline-Anzeigetests prüfen Statusprioritäten, Lauf- und Backupmeldungen, sichere Vorschauen,
  Dateistatusbezeichnungen und das automatische Scrollen der Prozessausgabe. Der gemeinsame Testeinstieg umfasst
  damit 96 Tests; `public/app.js` sank auf 4.598 Zeilen. Der Explorer liefert das neue Modul aus und lädt es nach
  der Assetprüfung vor `app.js`; ein lokaler HTTP-Smoke-Test bestätigte Hauptseite, Modulreferenz und Export.
  Squarespace-Laufzeitdateien, Footer-Versionen und Custom CSS blieben unverändert.
- Der zwölfte kontrollierte Oberflächenschnitt führt `species-explorer/public/app-dashboard.js` als Grenze für
  Zusammenfassung, Validierungsdarstellung, Statusfilter und Artenliste ein. Das Modul übersetzt die Modelldaten in
  unveränderliche Präsentationsmodelle, rendert Status-/Trendsymbole und Pflegehinweise und hält die Scrollposition
  der Artenliste. Datenabruf, Detailansicht und Artauswahl bleiben bewusst in `public/app.js`.
- Sechs direkte Dashboardtests prüfen konsistenten und fehlerhaften Validierungsstatus, die Trennung von Asset-,
  Sound- und Reporthinweisen, Status-/Trend-/Pflegekennzeichen, alphabetisch deutsche Statusfilter sowie
  Zusammenfassung, Filterung, Listenrendering, Scrollposition und Artauswahl. Der gemeinsame Testeinstieg umfasst
  damit 102 Tests; `public/app.js` sank auf 4.398 Zeilen. Das lokale HTML lädt das Modul nach `filter.js` und vor
  `app.js`; ein echter HTTP-Smoke-Test bestätigte Hauptseite, Modulreferenz und Export jeweils mit HTTP 200.
  Squarespace-Laufzeitdateien, Footer-Versionen und Custom CSS blieben unverändert.
- Der dreizehnte kontrollierte Oberflächenschnitt führt `species-explorer/public/app-settings.js` als Grenze für
  den lokalen Backup-Pfad-Einstellungsdialog ein. Das Modul erzeugt die Darstellung für Standard- und
  benutzerdefinierten Pfad und steuert Laden, Zurücksetzen, Statusmeldungen und Speichern. API-Kommunikation,
  Anwendungszustand und Dialoggrundlage werden injiziert; serverseitige Einstellung und Dateisystem bleiben
  unverändert.
- Vier direkte Einstellungstests prüfen Standard- und benutzerdefinierte Darstellung, einmalige Ereignisbindung,
  Laden, Zurücksetzen auf den Standardpfad und verständliche API-Fehler. Der gemeinsame Testeinstieg umfasst damit
  107 Tests; `public/app.js` sank von 4.408 auf 4.334 Zeilen. Das lokale HTML lädt das Modul nach `app-dialogs.js`
  und vor `app-media.js`; der Explorer-Smoke-Test prüft Auslieferung, Reihenfolge und Export.
  Squarespace-Laufzeitdateien, Footer-Versionen und Custom CSS blieben unverändert.
- Der vierzehnte kontrollierte Oberflächenschnitt führt `species-explorer/public/app-species-actions.js` als
  fachliche Grenze für `Art aktualisieren` und den Art-Löschdialog ein. Das Modul steuert Bestätigung, gezielten
  stillen Artlauf, Löschvorschau, optionale dauerhafte Assetbereinigung, verständliche Fehler und die abschließende
  Erfolgsmeldung. API-Client, Pipelineaufruf, Dialoggrundlage, Medienfreigabe und Datenreload werden injiziert.
- Fünf direkte Artaktionstests prüfen Texte und Löschmodi, gezielte Pipelineparameter, Fehlerfreigabe der
  Schaltfläche, maskierte Löschfolgen sowie dauerhaftes Löschen mit Medienfreigabe und Reload. Der gemeinsame
  Testeinstieg umfasst damit 112 Tests; `public/app.js` sank von 4.334 auf 4.193 Zeilen. Das lokale HTML lädt das
  Modul nach `app-dashboard.js` und vor `app.js`; Explorer-Smoke-Tests prüfen Auslieferung, Reihenfolge und Export.
  Squarespace-Laufzeitdateien, Footer-Versionen und Custom CSS blieben unverändert.
- Der fünfzehnte kontrollierte Oberflächenschnitt führt `species-explorer/public/app-lifecycle.js` als gemeinsame
  Grenze für Bearbeitungsmodus, konsistente Explorer-Schnappschüsse, initiale Artauswahl, Revisionsüberwachung und
  Schließwarnung bei offenen Änderungen ein. Dashboard-Aktualisierung und Detailauswahl werden als Abhängigkeiten
  injiziert; Pipeline-, Neue-Art- und Bearbeitungsfachlogik bleiben unverändert.
- Sieben direkte Lebenszyklustests prüfen Modusdarstellung, Warnbedingungen, Auswahlpriorität, einmalige
  Ereignisbindung, Schnappschussverteilung, stabilen Assistenten-Hintergrund, maskierte Ladefehler und verzögerte
  Revisionsupdates. Der gemeinsame Testeinstieg umfasst damit 119 Tests; `public/app.js` sank von 4.193 auf 4.107
  Zeilen. Das lokale HTML lädt das Modul nach `app-dashboard.js` und vor `app-species-actions.js`; Explorer-
  Smoke-Tests prüfen Auslieferung, Reihenfolge und Export. Squarespace-Laufzeitdateien, Footer-Versionen und Custom
  CSS blieben unverändert.
- A4 bleibt offen. Als nächste sichere Grenze wird ein fachlich geschlossener Oberflächenbereich getrennt. Jeder
  Schnitt erhält vor der nächsten Extraktion eigene Verhaltensprüfungen.

### A5. Lokale temporäre Ablagen werden nicht zuverlässig geleert

**Erledigt am 2026-07-13.**

| Pfad | Dateien | Größe | Alter / Einordnung |
|---|---:|---:|---|
| `Testlauf/` | 3 | < 0,01 MiB | Chrome-Reste vom 2026-07-01 |
| `species-explorer/cleanup-trash/` | 16 | 4,27 MiB | vier alte Löwe-Bereinigungsläufe vom 2026-07-01 |
| `species-explorer/pipeline-asset-backups/` | 3 | 0,55 MiB | alter Löwe-Pipelinebestand vom 2026-07-01 |
| `species-explorer/staging/` | 8 | 10,38 MiB | Eingabe-/Renderreste vom 2026-06-28 bis 2026-07-11 |

Diese Pfade sind korrekt ignoriert und landen nicht in Git oder NAS-Backups. Sie belegen aber, dass Abbruch-, Fehler-
oder Windows-Sperrfälle temporäre Daten zurücklassen.

Empfehlung:

- verwaltete Staging-/Trash-Einträge mit Manifest und Erstellzeit versehen;
- beim App-Start ausschließlich eindeutig verwaltete, abgelaufene Einträge entfernen;
- beim kontrollierten Schließen des Explorers sowie unmittelbar nach erfolgreichen Arbeitsabläufen alle eindeutig
  zugeordneten und nicht mehr benötigten temporären Einträge best-effort entfernen;
- nach erfolgreichen Läufen nochmals best-effort bereinigen;
- fremde Dateien nie pauschal löschen;
- Aufbewahrungsregeln je Pfad dokumentieren und testen;
- für jede künftig eingeführte temporäre Ablage bereits bei der Implementierung Eigentümerschaft, Lebenszyklus,
  Bereinigungszeitpunkt, Fehler-/Sperrverhalten und maximale Aufbewahrung festlegen und testen.

Bewusst behalten werden sollen:

- `node_modules/` und `local-tools/`, weil der vollständige NAS-Restore ohne erneute manuelle Installation starten
  soll;
- verwaltete Eingabelistenbackups und Logs im vorgesehenen Limit;
- `asset-backups/` als je Asset wiederherstellbare Sicherung. Die Aufbewahrung ist nach logischen Sicherungen und
  nicht nach der reinen Dateizahl zu bewerten.

Umsetzung:

- `species-explorer/temp-retention.mjs` ist die zentrale Registry für ausschließlich eindeutig verwaltete Einträge.
- Start und Wartung entfernen Einträge erst nach 24 Stunden; kontrolliertes Schließen entfernt alle registrierten
  Laufzeitreste best-effort. Fremde Dateien und wiederherstellbare Sicherungen bleiben unberührt.
- Die Registry ist in Serverstart, Pipeline-Abschluss und Server-Shutdown eingebunden; `temp:check`, `temp:cleanup`
  und eigene Tests decken Vorschau, Aufbewahrungsfrist und Schutz fremder Dateien ab.
- Für jede künftige temporäre Ablage sind Eigentümerschaft, Namensgrenze, Lebenszyklus, Sperrverhalten,
  Aufbewahrungsgrenze und Tests Pflicht. Details: `docs/temp-retention.md`.

### A6. Dokumentation enthält aktuelle Widersprüche und zu viel Verlauf an mehreren Stellen

**Erledigt am 2026-07-13.**

Die 28 Markdown-Dateien umfassen rund 6724 Zeilen. Besonders viel aktueller Zustand und Historie wird parallel in
`README.md`, `AGENTS.md`, `docs/roadmap.md` und `docs/desktop-app-plan.md` gepflegt.

Bestätigte aktuelle Widersprüche:

- `AGENTS.md` und `README.md` nennen fünf NC-Sounds; Report und Explorer melden sechs.
- Großtrappe fehlt in den aktuellen NC-Listen, obwohl die aktuelle Quelle NC ist.
- `AGENTS.md` nennt Löwe als manuell gepflegte Karte; tatsächlich ist Panama-Kapuzineraffe manuell geschützt.
- `AGENTS.md` beschreibt Großtrappe als freie Commons-Quelle; aktuelle Credits und Report weisen Xeno-Canto mit
  NC-Lizenz aus.
- `README.md` enthält zusätzlich einen älteren Abschnitt mit vier manuellen Karten und 46 Spektrogrammen.
- `docs/sound-license-review.md` ist ein Auditstand vom 2026-06-17, wirkt ohne deutliche Archivkennzeichnung aber
  wie aktueller Zustand.
- `docs/add-species-workflow.md` nennt in einem Abschnitt weiterhin 46 Einträge.
- `docs/roadmap.md` trägt im Kopf noch den Stand 2026-06-29, obwohl Juli-Erweiterungen dokumentiert sind.
- `AGENTS.md` nennt den letzten vollständigen Pipelinecheck vom 2026-06-20; ein vollständiger 49-Arten-Lauf ist in
  den Logs vom 2026-07-10 belegt.

Empfohlene Dokumentationsstruktur:

- maschinenlesbare Daten und ein generierter aktueller Status sind die einzige Quelle für Zähler und aktive Listen;
- `AGENTS.md`: Arbeitsregeln, Architektur, aktuelle Blocker und kurze Übergabe;
- `README.md`: Installation, Bedienung und Betriebsablauf;
- `docs/roadmap.md`: nur Gegenwart und Zukunft;
- erledigte Phasenverläufe in `docs/archive/` verschieben oder klar als historisch kennzeichnen;
- Detaildokumente bleiben themenspezifisch;
- datierte Auditberichte bleiben unter `docs/audits/` unverändert als Zeitaufnahme erhalten.

Umsetzung:

- `docs/project-status.md` wird aus dem Explorer-Modell erzeugt und ist die einzige aktuelle Quelle für Zähler und
  aktive Pflege-/Hinweislisten.
- `status:check` ist Teil von `quality:ci` und blockiert einen Pages-Build bei veraltetem Status.
- README, AGENTS und aktive Detaildokumente verweisen auf diese Quelle statt Zähler zu duplizieren.
- Historische Planungs- und Lizenzdokumente sind sichtbar als Zeitaufnahme gekennzeichnet. Die dauerhafte
  Zuständigkeitsregel steht in `docs/documentation-lifecycle.md`.

### A7. Zeilenenden sind nicht festgelegt und teilweise innerhalb einer Datei gemischt

**Erledigt am 2026-07-13.**

Es gibt keine `.gitattributes`. Unter 166 geprüften Textdateien wurden erkannt:

- 149 reine LF-Dateien;
- 4 reine CRLF-Dateien;
- 13 Dateien mit gemischten Zeilenenden.

Betroffen sind unter anderem `AGENTS.md`, `README.md`, `docs/roadmap.md`, `app.css`, `server.test.mjs`,
`species-core.js`, `species-status.js`, `species-taxonomy.js` und `update.mjs`. Das erklärt wiederkehrende
Git-Warnungen und erzeugt unnötig große beziehungsweise schwer lesbare Diffs.

Empfehlung:

- `.gitattributes` für JS, MJS, JSON, Markdown, HTML, CSS und YAML mit LF einführen;
- Windows-Startskripte bei Bedarf ausdrücklich auf CRLF festlegen;
- einmalige Normalisierung in einem separaten Commit nach Backup durchführen;
- keine Zeilenendennormalisierung mit einer Funktionsänderung mischen.

Umsetzung:

- `.gitattributes` erzwingt LF für plattformunabhängige Quell-, Daten- und Dokumentdateien, CRLF für
  Windows-Start-/Wartungsskripte und deaktiviert Textkonvertierung für alle produktiven Binärformate.
- Die Arbeitskopie wurde in einem getrennten mechanischen Schritt normalisiert. Die Kontrolle ergab 188 korrekte
  LF-Dateien, vier korrekte CRLF-Dateien und keine gemischte oder falsch formatierte Textdatei.
- Der Regel-Commit `dbddf9b` enthält ausschließlich `.gitattributes`; Funktionsänderungen wurden im vorherigen
  Commit getrennt gehalten.

## P2 – Qualitätsverbesserungen ohne unmittelbare Blockade

### A8. Das Pages-Artefakt veröffentlicht mehr als die Laufzeit benötigt

`prepare-pages-artifact.mjs` kopiert die kompletten Verzeichnisse `species-assets`, `graphics` und `docs`. Dadurch
werden auch interne Betriebsdokumente und die PSD-Quelldatei `graphics/catagory/Alternativ/Blaupause.psd`
öffentlich ausgeliefert. Das ist kein akutes Sicherheitsleck, aber unnötig und erschwert eine klare Definition des
öffentlichen Produkts.

Empfehlung: eine explizite Positivliste für produktive Module, JSON-Daten, Medien und wirklich öffentlich benötigte
Dokumente verwenden. `docs/` und Designquellen standardmäßig nicht deployen. Der generierte Index verwendet außerdem
noch die alte Bezeichnung `IUCN Species Data`; das sollte mit dem Produktnamen `Arten-Explorer` beziehungsweise der
reinen Datenbasis bewusst vereinheitlicht werden.

### A9. Tests sind umfangreich, aber zentral und teilweise quelltextgebunden

Die inzwischen 24 Explorer-Tests besitzen viele wertvolle Integrationsfälle. Gleichzeitig enthält die zentrale
Testdatei zahlreiche quelltextgebundene Assertions. Ein Teil der Assertions prüft
Quelltext-/CSS-Muster statt ausschließlich beobachtbares Verhalten.

Empfehlung:

- Tests nach Modell, API-Sicherheit, Arten-CRUD, Assetverwaltung, Pipeline, Backup und UI-Vertrag aufteilen;
- mehr negative API-, Fehler- und Parallelitätsfälle ergänzen;
- statische Vertragsprüfungen nur dort behalten, wo kein günstiger Verhaltenstest möglich ist;
- einen konventionellen `npm test`-Alias hinzufügen.

### A10. Format-, Schema- und Stilwerkzeuge fehlen

Aktuell existieren keine zentrale JSON-Schema-/Datenvalidierung, kein Linter, kein Formatter und kein Typecheck.
Die bestehenden manuellen Prüfungen sind gut, werden aber nicht automatisch bei jedem Push erzwungen.

Empfehlung:

- zuerst kleine projektspezifische Validatoren für Artenliste, generierte Daten, Overrides und Medienformate;
- danach ESLint/Prettier oder eine bewusst schlanke Alternative in einem eigenen, mechanischen Schritt;
- keine großflächige Formatierung zusammen mit funktionalen Änderungen.

### A11. Große Binärhistorie bleibt auch nach einer Medienkorrektur bestehen

Aktuell sind 385 Dateien mit zusammen rund 231,02 MiB getrackt. Davon entfallen 184,79 MiB auf Dateien mit der
Endung `.mp3`. Die Git-Objektdatenbank belegt rund 408,16 MiB in Packs plus 15,68 MiB lose Objekte.

Die Audio-Konvertierung reduziert den aktuellen Stand, aber nicht automatisch die vorhandene Git-Historie.
Empfehlung: zunächst keine riskante History-Rewrite-Aktion. Nach der Formatmigration Wachstum beobachten und erst
dann entscheiden, ob Git LFS, externer Objektspeicher oder eine kontrollierte Historienbereinigung erforderlich ist.

## Dateistruktur: Was bleiben darf und was bereinigt werden sollte

### Sinnvoll und konsistent

- `species-assets/<SafeName>/` ist die einzige produktive Art-Assetstruktur.
- Karten, Sound, Credits, Spektrogramm und Portrait sind artweise gebündelt.
- Es wurden keine byteidentischen getrackten Duplikate ab 1 KiB gefunden.
- `graphics/catagory/` und `graphics/catagory/Alternativ/` werden derzeit von Explorer und Squarespace
  unterschiedlich referenziert; keine spontane Umbenennung oder Löschung.
- `node_modules/`, `_site/`, lokale Werkzeuge, Logs und Arbeitsbackups sind korrekt ignoriert.

### Kontrolliert aufräumen

- alte verwaltete Einträge aus `Testlauf/`, `cleanup-trash/`, `pipeline-asset-backups/` und `staging/`;
- öffentliche Pages-Ausgabe auf tatsächlich benötigte Dateien begrenzen;
- historische Dokumentation klar archivieren;
- Zeilenenden über `.gitattributes` vereinheitlichen.

## Bewertung der Taxonomie-Übergabe

`docs/taxonomy-redesign-handoff.md` beißt sich nach der letzten Klarstellung nicht mit dem aktuellen Datenmodell:

- die Ausgabe bleibt dynamisches HTML/CSS;
- wissenschaftliche Rohwerte bleiben erhalten;
- deutsche Anzeigenamen werden zentral zugeordnet;
- `Subphylum` wird nur aus einem tatsächlich vorhandenen Datenwert übernommen;
- bei fehlendem Unterstamm wird die Stufe vollständig ausgelassen;
- sieben und acht Ebenen müssen funktionieren;
- Squarespace-Container und Versionierungsprozess bleiben erhalten.

Vor der Umsetzung ist lediglich technisch zu verifizieren, ob die IUCN-API für die betroffenen Taxa überhaupt ein
stabiles Unterstammfeld liefert. Falls nicht, bleibt die Stufe wie festgelegt aus den Daten und aus der Darstellung
entfernt. Es gibt keinen fachlich abgeleiteten Fallback.

## Empfohlene Reihenfolge

### Stabilisierungspaket A – blockiert neue größere Erweiterungen

1. Audioformatprüfung zentralisieren und zwölf WAV-als-MP3-Dateien kontrolliert migrieren. **Erledigt 2026-07-12.**
2. Medienformatvalidator und Artefaktgrößenbudget ergänzen. **Erledigt 2026-07-12.**
3. localhost-Schreibserver durch Sitzungstoken, Same-Origin-/Host-Prüfung und URL-Zielschutz härten.
   **Erledigt 2026-07-12.**
4. CI-Quality-Job vor den Pages-Build setzen. **Erledigt 2026-07-13.**
5. Vollständigen Test-, Audit- und Pages-Lauf durchführen. **Erledigt 2026-07-13.** Der gemeinsame Quality-Einstieg
   prüfte 37 JavaScript-/MJS-Dateien, 38 automatisierte Tests, 49 Arten und 263 Medien ohne Fehler. Der vollständige
   Live-Audit rief 120 Squarespace-Sitemapseiten ohne Abruf- oder HTTP-Fehler ab und bestätigte die geprüften
   GitHub-Pages-Module und Beispielassets mit HTTP 200. Der GitHub-Actions-Lauf `29258080649` bestand Quality,
   Artefaktbau und Pages-Deployment beim ersten Versuch; Explorer und Squarespace-Detailseite wurden zusätzlich
   visuell geprüft. Stabilisierungspaket A ist damit abgeschlossen.

### Stabilisierungspaket B – direkt danach

1. aktuelle Zähler und Listen in AGENTS/README aus einer Quelle korrigieren; **erledigt 2026-07-13**
2. historische Dokumente kennzeichnen beziehungsweise archivieren; **erledigt 2026-07-13**
3. verwaltete lokale Altlasten sicher bereinigen und Aufbewahrung automatisieren. Dazu gehören die Bereinigung nach
   erfolgreichen Abläufen, beim kontrollierten Explorer-Schließen und beim nächsten Start nach einem Abbruch sowie
   verbindliche Lebenszyklusregeln für alle künftigen temporären Ablagen; **erledigt 2026-07-13**
4. `.gitattributes` in einem getrennten Normalisierungscommit einführen. **erledigt 2026-07-13**

### Danach

1. Taxonomie-Redesign nach der vorhandenen Übergabe umsetzen;
2. bei berührten Monolithen nur klar abgegrenzte Module extrahieren;
3. weitere Explorer-Funktionen erst auf der abgesicherten CI-/Assetbasis aufbauen.

## Definition „bereit für Taxonomie"

Die Grundlage ist bereit, wenn:

- jede `sound.mp3` auch technisch ein MP3 ist; **erfüllt 2026-07-12**
- der Pages-Build verbindliche Assetformat-/Einzelgrenzen und ein dynamisch skalierendes Gesamtbudget durchsetzt;
  **erfüllt 2026-07-12**
- alle schreibenden localhost-Routen eine einheitliche Browser-/Sitzungsgrenze besitzen;
  **erfüllt 2026-07-12**
- CI Syntax, Explorer-Tests, lokalen Audit und Assetvalidator vor dem Deployment ausführt;
  **erfüllt 2026-07-13**
- der aktuelle Dokumentationsstand mit dem maschinenlesbaren Report übereinstimmt; **erfüllt 2026-07-13**
- verwaltete Staging-/Trash-Reste kontrolliert bereinigt sind; **erfüllt 2026-07-13**
- ein vollständiger lokaler Lauf, ein erfolgreicher Pages-Deploy und der Squarespace-Sichttest abgeschlossen sind.

Stabilisierungspaket B ist damit technisch, dokumentarisch und betrieblich abgeschlossen. Der GitHub-Actions-Lauf
`29265285193` bestand Quality, Artefaktbau und Pages-Deployment beim ersten Versuch. Die Quality-Barriere prüfte
41 JavaScript-/MJS-Dateien, 42 automatisierte Tests, 49 Arten und 263 Medien ohne Fehler. Der anschließende
Live-Audit erreichte 120 Squarespace-Sitemapseiten ohne Abruf-, HTTP-, Titel- oder Metadatenfehler und bestätigte
alle geprüften GitHub-Pages-Module und Beispielassets mit HTTP 200.

## Eingeschobene CI-/Soundkorrektur vom 2026-07-16

- Der Explorer erzeugt `docs/project-status.md` vor automatischen Pipeline-, Karten-, Sound- und
  Portrait-Veröffentlichungen neu und nimmt die Datei in denselben Commit auf. Damit kann eine neu angelegte Art
  nicht mehr erst im CI-Quality-Job an einem veralteten dokumentierten Projektstatus scheitern.
- Der Pages-Workflow verwendet `actions/checkout@v5` und `actions/setup-node@v6`; die frühere
  Node-20-Abkündigungswarnung der Actions entfällt.
- Die Soundoberfläche unterscheidet nun Dateisperren von ausgeschöpften unterstützten Quellen. Nach der Ablehnung
  aller für Gepard auffindbaren, lizenzgeprüften Kandidaten bleibt der Dialog offen und erklärt den Abschluss, ohne
  daraus abzuleiten, dass außerhalb der angebundenen Quellen keine Aufnahme existiert.

## Während des Audits bereits erledigt

Der separat gemeldete responsive UI-Fehler wurde vor Abschluss des Audits behoben und veröffentlicht:

- Medienkarten sind benannte Inline-Size-Container.
- Bei schmalen Karten stehen Bearbeiten, Wiederherstellen und Löschen gemeinsam in einer dreispaltigen Aktionszeile
  unter dem Titel.
- 23 Explorer-Tests und die visuelle Prüfung mit rund 499 Pixel breiten Medienkarten waren erfolgreich.
- Commit: `11d0eb8 Stabilize responsive media card actions`.
