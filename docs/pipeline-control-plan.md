# Pipeline-Steuerung im Arten-Explorer

Stand: 2026-06-19

Ziel von Phase 7.6: Die bestehende Datenpipeline kontrolliert aus dem Arten-Explorer starten und dabei klar zwischen
einem gezielten Lauf fuer neue oder unvollstaendige Arten und einem vollstaendigen Lauf ueber alle Arten
unterscheiden.

Status: technisch umgesetzt. Nach dem vollständigen Lauf für den Haubentaucher wurde am 2026-06-20 auch ein
produktiver selektiver Lauf direkt aus der App für den Höckerschwan erfolgreich abgeschlossen. Start,
Prozessanzeige, Karte-/Sound-Entscheidung sowie automatischer Commit und Push funktionierten. Die nach diesem Test
ergänzte Karten-Großansicht benötigt noch einen kurzen visuellen Bestätigungstest.

## Bedienoberfläche

Die Prozesssteuerung belegt keinen eigenen Seitenbereich. In der Kopfzeile steht im Bearbeitungsmodus das klickbare
Feld `Pipeline: <Status>`.

Der Pipeline-Dialog fragt zuerst die Laufart ab:

- neue oder unvollstaendige Arten
- alle Arten
- dauerhafte Bereinigung

Status und letzte Prozessausgabe werden im selben Dialog angezeigt. Im Lesemodus ist die Pipeline-Aktion
ausgeblendet.

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

### Dauerhafte Bereinigung

Die Bereinigung ist eine eigene Aktion und wird nie automatisch an einen Update-Lauf angehaengt. Sie sucht:

- nicht mehr benötigte Einträge in `speciesData.json`
- verwaiste Ordner unter `species-assets/`
- veraltete Einträge in `lastSavedAssessmentId.json`

Die App zeigt die betroffenen Datensätze, Ordner und Dateigrößen. Nach genau einer Bestätigung werden diese Inhalte
dauerhaft gelöscht und sind nicht wiederherstellbar. Details: `docs/delete-species-workflow.md`.

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
- Ein fehlgeschlagener Teillauf darf vorhandene gute Daten nicht durch leere oder unvollstaendige Ergebnisse
  ersetzen.
- Die Bereinigung löscht nur Pfade, die nach Auflösung sicher innerhalb von `species-assets/` liegen.

## Spektrogramme

Nach erfolgreicher Soundaktualisierung wird der Spektrogramm-Schritt passend zur Laufart ausgefuehrt:

- gezielter Lauf: nur ausgewaehlte Arten mit neuem oder fehlendem Spektrogramm
- vollstaendiger Lauf: Abgleich aller Arten

Der bestehende Generator unterstuetzt bereits eine Artenauswahl ueber `--species=`.
Anschliessend baut `update.mjs --report-only` den Report erneut auf, damit ein gerade erzeugtes Spektrogramm nicht
mehr als fehlend im Report stehen bleibt.

## Geplante Tests

- Dry-run veraendert keine Datei: getestet.
- Eine neue Art wird im Modus `missing` ausgewaehlt: getestet.
- Vollstaendige Arten ohne Fehler werden im Modus `missing` nicht ausgewaehlt: getestet.
- Modus `all` waehlt alle Eintraege: getestet.
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
- Bereinigung erkennt verwaiste Daten und Assets: getestet.
- Bereinigung löscht verwaiste Assetordner und aktualisiert Daten/Report: getestet im temporären Repository.

## Nicht Bestandteil von Phase 7.6

- Assetdateien manuell hochladen oder ersetzen
- manuelle Lizenzfreigaben
- Git-Commit oder Git-Push
- Squarespace-Seiten erzeugen
- NAS-Migration oder Backup-Einrichtung

Diese Themen folgen spaeter. Die Assetverwaltung ist jetzt Phase 7.7.
