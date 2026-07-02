# Pipeline-Steuerung im Arten-Explorer

Stand: 2026-06-30

Ziel von Phase 7.6: Die bestehende Datenpipeline kontrolliert aus dem Arten-Explorer starten und dabei klar zwischen
einem gezielten Lauf fuer neue oder unvollstaendige Arten und einem vollstaendigen Lauf ueber alle Arten
unterscheiden.

Status: abgeschlossen am 2026-06-20. Vollständige und selektive Läufe, Prozessanzeige, Karte-/Sound-Entscheidung,
automatischer Commit/Push, Bereinigung, Karten-Großansicht, sichere Dialogbedienung und Soundstopp wurden praktisch
geprüft.

## Bedienoberfläche

Die Prozesssteuerung belegt keinen eigenen Seitenbereich. In der Kopfzeile steht im Bearbeitungsmodus das klickbare
Feld `Datenbank aktualisieren` beziehungsweise `Datenbank aktuell`.

Der Pipeline-Dialog fragt zuerst die Laufart ab:

- neue oder unvollstaendige Arten
- alle Arten
- manuell gepflegte und fehlende Karten erneut automatisch suchen
- NC-Sounds und fehlende Sounds erneut prüfen
- dauerhafte Bereinigung

Status und letzte Prozessausgabe werden im selben Dialog `Datenbank-Aktionen` angezeigt. Nach dem Start bleibt der Dialog geöffnet und
meldet ausdrücklich `Pipeline-Lauf läuft gerade`. Der bisherige Button `Abbrechen` heißt ab diesem Zeitpunkt
`Fenster schließen`, weil er nur den Dialog schließt und den Prozess nicht beendet. Ein zusätzlicher Hinweis erklärt,
dass der Lauf im Hintergrund weiterläuft. Nach erfolgreichem Ende wechselt die Meldung auf
`Pipeline-Lauf abgeschlossen`; Fehler und die wartende Assetprüfung erhalten eigene Zustände.

Parallel zeigt das Hauptfenster unter der Kopfzeile einen dauerhaften Statusbalken. Dadurch bleiben laufender,
wartender, abgeschlossener oder fehlgeschlagener Lauf auch nach dem Schließen des Dialogs sichtbar. Über
`Details anzeigen` lässt sich der Statusdialog erneut öffnen. `X`, `Abbrechen` und `Fenster schließen` schließen seit
2026-06-29 den Dialog wieder zuverlässig; laufende Prozesse laufen im Hintergrund weiter. Im Lesemodus ist der Start einer Pipeline
ausgeblendet; ein bereits laufender Status bleibt trotzdem sichtbar.

Nach dem Speichern einer neuen Art öffnet der Explorer automatisch die Vorschau `Neue oder fehlende Arten`.
Der Lauf kann dort sofort gestartet oder abgebrochen werden. Beim Abbrechen bleibt die neue Art als ausstehender
Eintrag sichtbar und kann später über die Kopfzeile verarbeitet werden.

## Ausgangslage

`node update.mjs` verarbeitet derzeit immer die komplette `species_list.json`. Das ist fuer regelmaessige
Vollpruefungen richtig, aber unnoetig aufwendig, wenn gerade nur eine neue Art wie der Haubentaucher angelegt wurde
oder einzelne Daten beziehungsweise Assets fehlen.

Die Explorer-Validierung kennt bereits:

- Arten nur in `species_list.json`
- fehlende IUCN-Kernfelder
- fehlende Karten, Sounds, Credits und Spektrogramme
- Abweichungen zwischen Eingabe und Pipeline-Ausgabe
- Reportabweichungen

Diese Informationen bilden die Auswahlgrundlage fuer einen gezielten Lauf.

## Laufarten

### Neue oder unvollstaendige Arten

Die App ermittelt vor dem Start eine konkrete Artenliste. Aufgenommen werden Arten mit mindestens einem dieser
Merkmale:

- nur in `species_list.json`, aber noch nicht in `speciesData.json`
- fehlende Assessment-ID, Status, Kategorie oder Trend
- fehlende Karte
- fehlender Sound oder fehlende Credits
- fehlendes Spektrogramm

Vor dem Start zeigt die App:

- Laufart `Neue/Unvollstaendige Arten aktualisieren`
- Anzahl und Namen der betroffenen Arten
- Gruende je Art
- voraussichtlich ausgefuehrte Schritte

Ein gezielter Lauf darf nicht die nicht ausgewaehlten Arten aus `speciesData.json` oder dem Report entfernen.
Globale Ausgabedateien muessen deshalb aus den aktualisierten Zielarten und den unveraendert uebernommenen
Bestandsarten neu zusammengesetzt werden.

### Vollstaendiger Lauf

Diese Laufart entspricht dem bisherigen Verhalten von:

```bash
node update.mjs
```

Alle Eintraege aus `species_list.json` werden verarbeitet. Dieser Lauf bleibt fuer regelmaessige Gesamtabgleiche,
Lizenzsuche, IUCN-Aktualisierungen und den Monatscheck erforderlich.

Vor dem Start zeigt die App:

- Laufart `Alle Arten vollstaendig aktualisieren`
- aktuelle Artenzahl
- deutlichen Hinweis auf die laengere Laufzeit und alle externen API-Abfragen

### Manuelle und fehlende Karten erneut suchen

Der Kartensuchlauf wählt Arten aus, deren Karte in `species-assets-overrides.json` als manuell geschützt markiert
ist, sowie Arten mit fehlender `map.jpg`. Aktuell sind vier Karten manuell geschützt; fehlende Karten werden bei
Bedarf zusätzlich verarbeitet.

- IUCN-Daten und Sounds bleiben unverändert.
- Die vorhandene Karte wird vorübergehend lokal gesichert.
- Nur eine gültige JPEG-Antwort mit plausibler Mindestgröße ersetzt die Arbeitskopie.
- `Automatische Karte übernehmen` behält die neue Karte und entfernt den manuellen Schutz.
- Eine neu gefundene Karte kann auch abgelehnt/übersprungen werden; dann wird sie entfernt beziehungsweise die
  vorherige Karte wiederhergestellt.
- Das Register und `docs/manual-map-overrides.md` werden dabei gemeinsam aktualisiert.
- Eine ausdrückliche `manual: false`-Entscheidung im JSON-Register hat Vorrang vor einem veralteten
  Markdown-Eintrag. Dadurch erscheint eine übernommene automatische Karte sofort nicht mehr unter manueller Pflege.
- `Bisherige manuelle Karte behalten` stellt die gesicherte Karte wieder her.
- Seit 2026-06-27 beendet `update.mjs` den Prozess nach erfolgreichem Abschluss explizit, nachdem stdout und stderr
  geleert wurden. Damit bleibt der Explorer nach einem abgeschlossenen Kartensuchlauf nicht mehr im Status
  `Pipeline-Lauf läuft gerade` hängen und kann die Übernahme-/Ablehnentscheidung anzeigen.
- Seit 2026-06-29 prüft `update.mjs` neben dem direkten IUCN-Kartenendpunkt eine Fallback-Strategie fuer gecachte
  Einzelkarten. Seit 2026-07-02 versucht der automatische Abruf zuerst den bisherigen IUCN-Web-Endpunkt mit
  browsernahen Headern, danach den offiziellen IUCN-API-Host mit Token und extrahiert signierte Backblaze-Links aus
  Redirect-, HTML- und Fehlerantworten als `cached-individual-maps`-URL. Wenn Node lokal HTTP 403 erhält, nutzt die
  Pipeline unter Windows zusätzlich `Invoke-WebRequest` als WebRequest-Fallback, weil derselbe IUCN-Endpunkt dort die
  JPEG-Karte ausliefert. Wenn lokal trotzdem kein direkt speicherbarer Link geliefert
  wird, kann der im Browser sichtbare signierte Backblaze-JPEG-Link weiterhin im Kartenimport als Quellen-URL
  eingefügt und geprüft werden. Seit 2026-07-01 zeigt der Karten-Bearbeitungsdialog dafür direkt `IUCN-Karte im
  Browser öffnen`. Im Neue-Art-Assistenten steht derselbe manuelle URL-Schritt zur Verfügung; die Karte kann dort
  während einer pausierten Assetprüfung geprüft und übernommen werden. Der versteckte Electron-/Chromium-Fallback
  wurde verworfen, weil Headless-Browserprozesse auf dem Zielsystem mit Anwendungsfehlern abbrechen.

### NC- und fehlende Sounds erneut suchen

Der globale Soundsuchlauf wählt vorhandene, nicht manuell geschützte Sounds mit NC-Lizenz und Arten ohne
Sounddatei aus. Ein gezielter Einzellauf aus dem Bearbeitungsdialog darf zusätzlich für eine Art mit bereits
vorhandenem akzeptiertem Sound eine Alternative suchen. Dabei wird die aktuelle Quellkennung nur für diesen Lauf
übersprungen; nach freien Kandidaten werden auch die Xeno-Canto-Fallback-Stufen geprüft.

- IUCN-Daten und Karten bleiben unverändert.
- Sound, Credits und Spektrogramm werden vorübergehend lokal gesichert.
- Die Suche prüft freie Xeno-Canto-, Wikimedia-Commons- und iNaturalist-Alternativen.
- `Gefundenen Sound übernehmen (NC)` beziehungsweise `Gefundenen Sound übernehmen (frei)` übernimmt den neu
  gefundenen Kandidaten und kennzeichnet die Lizenzart eindeutig.
- `Bisherigen Sound behalten` stellt Sound, Credits und Spektrogramm wieder her, wenn ein Bestand vorhanden ist.
- `Gefundenen Sound ablehnen und weiter suchen` stellt den vorherigen Bestand wieder her beziehungsweise entfernt bei vorher
  fehlendem Sound die neu erzeugten Sounddateien wieder. Die Quellkennung wird in `species-assets-overrides.json`
  gespeichert und bei spaeteren Sound-Suchlaeufen uebersprungen. Pro Art koennen beliebig viele Quellen abgelehnt
  werden.
- Wenn ein Kandidat zwar gefunden, aber nicht übernehmbar ist, prüft `update.mjs` im selben Lauf weitere Xeno-Canto-,
  Wikimedia-Commons- oder iNaturalist-Kandidaten. Nur eine echte Windows-Dateisperre auf `sound.mp3` beendet den
  Speicherversuch mit einer klaren Sperrmeldung, weil dann kein Kandidat sicher ersetzt werden kann.
- Bei vorhandenen Sounds zeigt der Review den bisherigen Sound und den gefundenen Kandidaten nebeneinander mit
  jeweils eigenem Player und Spektrogramm. Ein gezielter Alternativlauf überspringt die aktuell gespeicherte Quelle
  temporär, damit nicht derselbe Sound erneut vorgeschlagen wird.
- Im Bearbeitungsdialog wird der aktuelle Audioplayer vor dem Alternativlauf ersetzt und kurz freigegeben, damit
  eine pausierte Vorschau unter Windows keine produktive MP3-Dateisperre hält.

### Dauerhafte Bereinigung

Die Bereinigung ist eine eigene Aktion und wird nie automatisch an einen Update-Lauf angehaengt. Sie sucht:

- nicht mehr benötigte Einträge in `speciesData.json`
- verwaiste Ordner unter `species-assets/`
- veraltete Einträge in `lastSavedAssessmentId.json`
- verwaiste Einträge in `species-assets-overrides.json`

Die App zeigt die betroffenen Datensätze, Ordner und Dateigrößen. Nach genau einer Bestätigung werden diese Inhalte
dauerhaft gelöscht und sind nicht wiederherstellbar. Details: `docs/delete-species-workflow.md`.

Seit 2026-06-28 arbeitet die Bereinigung transaktional: verwaiste Assetordner werden zuerst nach
`species-explorer/cleanup-trash/` verschoben, danach werden Daten, Register und Report geschrieben und erst danach
werden die verschobenen Ordner endgueltig geloescht. Wird eine Datei unter Windows noch gesperrt, bleiben die
produktiven JSON-Dateien dadurch trotzdem konsistent.

## Technische Reihenfolge

1. `update.mjs` um eine interne Artenauswahl erweitern: umgesetzt.
2. Rueckwaertskompatibilitaet erhalten: Aufruf ohne Parameter bleibt ein vollstaendiger Lauf: umgesetzt.
3. Auswahlmodus fuer neue/fehlende Arten einfuehren: umgesetzt.
4. Vorschau-/Dry-run-Modus fuer die Artenliste einfuehren: umgesetzt.
5. Start-, Status- und Log-API mit Einzellauf-Sperre ergaenzen: umgesetzt.
6. Bedienoberflaeche mit Vorschau und expliziter Startbestaetigung anbinden: umgesetzt.
7. Separaten permanenten Bereinigungslauf anbinden: umgesetzt.
8. Echten gezielten App-Lauf mit Höckerschwan prüfen: erledigt am 2026-06-20, Commit `55fda06`.

Geplante Kommandozeilenform:

```bash
node update.mjs --mode=missing --dry-run
node update.mjs --mode=missing
node update.mjs --mode=all
node update.mjs --mode=manual-maps
node update.mjs --mode=nc-sounds
node update.mjs --mode=missing --species=acanthisflammea
node update.mjs --report-only
```

Bereinigung:

```bash
npm.cmd run --silent cleanup:species -- --dry-run
npm.cmd run --silent cleanup:species
```

## Sicherheitsregeln

- Es darf immer nur ein Pipeline-Lauf gleichzeitig aktiv sein.
- Vor dem Start werden benoetigte Umgebungsvariablen geprueft, aber niemals im Browser oder Log ausgegeben.
- Start erst nach sichtbarer Vorschau und ausdruecklicher Bestaetigung.
- Nach erfolgreichem Lauf, Assetprüfung und Report-Abgleich werden die vorgesehenen Pipeline-Dateien automatisch
  committed und gepusht.
- Manuelle Asset-Overrides muessen auch im gezielten Lauf respektiert werden.
- Prozessausgabe, Startzeit, Laufart, Zielarten, Exit-Code und Fehler werden lokal protokolliert.
- Logs werden unter `species-explorer/logs/` geschrieben, auf 20 Dateien begrenzt und nicht versioniert.
- Nach Erfolg oder Fehler laedt der Explorer Daten, Assets und Validierung neu.
- Während des Laufs bleibt der Prozess als `Pipeline-Lauf läuft gerade` im Dialog und im Hauptfenster sichtbar.
- Das Schließen des Statusdialogs beendet keinen Lauf; der Button heißt deshalb nach dem Start `Fenster schließen`.
- Nach Ende bleibt `Pipeline-Lauf abgeschlossen` beziehungsweise die Fehlermeldung sichtbar.
- Die Meldung direkt nach dem Anlegen einer Art wird nach erfolgreichem Pipeline-Commit und Push entfernt.
- Ein fehlgeschlagener Teillauf darf vorhandene gute Daten nicht durch leere oder unvollstaendige Ergebnisse
  ersetzen.
- Die Bereinigung löscht nur Pfade, die nach Auflösung sicher innerhalb von `species-assets/` liegen.
- Der Bereinigungsmodus wird im Plan und beim Prozessstart ausdrücklich als `cleanup` weitergegeben.

## Spektrogramme

Nach erfolgreicher Soundaktualisierung wird der Spektrogramm-Schritt passend zur Laufart ausgefuehrt:

- gezielter Lauf: nur ausgewaehlte Arten mit neuem oder fehlendem Spektrogramm
- vollstaendiger Lauf: Abgleich aller Arten

Der bestehende Generator unterstuetzt bereits eine Artenauswahl ueber `--species=`.
Anschliessend baut `update.mjs --report-only` den Report erneut auf, damit ein gerade erzeugtes Spektrogramm nicht
mehr als fehlend im Report stehen bleibt.

Die Explorer-Prozessausgabe zeigt den Spektrogramm-Abgleich nicht mehr als rohes JSON. Pro Art erscheinen nur noch
die relevanten Entscheidungen:

```text
<Artname>
  Sound: vorhanden|fehlt
  Spektrogramm: vorhanden|wurde erstellt|übersprungen|Fehler - <Grund>
```

Damit ist direkt erkennbar, ob ein Sound vorhanden war und ob das Spektrogramm bereits gepasst hat oder neu erzeugt
wurde.

## Geplante Tests

- Dry-run veraendert keine Datei: getestet.
- Eine neue Art wird im Modus `missing` ausgewaehlt: getestet.
- Vollstaendige Arten ohne Fehler werden im Modus `missing` nicht ausgewaehlt: getestet.
- Modus `all` waehlt alle Eintraege: getestet.
- Modus `manual-maps` wählt die jeweils aktuell manuell geschützten Karten: mit ursprünglich sieben und nach drei
  bestätigten Übernahmen mit vier Karten getestet.
- Modus `nc-sounds` wählt die aktuellen NC-Sounds und fehlende Soundpakete: getestet.
- Nicht ausgewaehlte Bestandsdaten werden bei einem Teillauf übernommen: implementiert.
- Ein zweiter gleichzeitiger Start wird abgewiesen.
- Fehlende Tokens verhindern den Start mit klarer Meldung.
- Logs enthalten keine Tokenwerte.
- Fehlercode und letzte erfolgreiche Phase werden in der App angezeigt.
- bei Pipelinefehlern wird kein Commit oder Push gestartet
- neue Karten und Sounds pausieren den Lauf vor Git
- die Kartenvorschau im Assetdialog öffnet zur Qualitätsprüfung eine große Lightbox
- Pflegeentscheidung wird in `species-assets-overrides.json` gespeichert
- Git-Commit und Git-Push laufen erst nach vollständiger Assetentscheidung
- Löschen aus `species_list.json` lässt Assets zunächst bestehen: getestet.
- Optionale Sofortlöschung entfernt generierte Daten und Assets derselben Art dauerhaft: getestet.
- Bereinigung erkennt verwaiste Daten und Assets: getestet.
- Bereinigung löscht verwaiste Assetordner und aktualisiert Daten/Report: getestet im temporären Repository.

## Nicht Bestandteil von Phase 7.6

- Assetdateien manuell hochladen oder ersetzen
- manuelle Lizenzfreigaben
- Git-Commit oder Git-Push
- Squarespace-Seiten erzeugen
- NAS-Migration oder Backup-Einrichtung

Diese Themen folgen spaeter. Die Assetverwaltung ist jetzt Phase 7.7.
