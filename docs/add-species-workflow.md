# Add Species Workflow

Stand: 2026-06-28

Dieses Dokument beschreibt Phase 5.6: weitere Arten ergaenzen.

## Grundsatz

Neue Arten werden nicht automatisch vorgeschlagen oder automatisch in `species_list.json` eingefuegt.

Die Artenauswahl bleibt redaktionell manuell. Die Pipeline verarbeitet nur Arten, die von Felix bestaetigt und in
`species_list.json` gespeichert wurden. Phase 7.5 bildet diesen bisher direkten JSON-Schritt kontrolliert ueber den
lokalen Arten-Explorer ab.

## Manuell zu pflegen

Eine neue Art wird in `species_list.json` als JSON-Objekt ergaenzt:

```json
{
  "german": "Deutscher Name",
  "genus": "Genus",
  "species": "species",
  "size": "ca. ...",
  "weight": "ca. ...",
  "life_expectancy": "ca. ... Jahre"
}
```

Regeln:

- `german`: deutscher Anzeigename und Basis fuer Sound-/Karten-Assetnamen.
- `genus`: wissenschaftliche Gattung, erster Buchstabe gross.
- `species`: Artepitheton klein schreiben.
- `size`: manuelle Groessenangabe.
- `weight`: manuelle Gewichtsangabe.
- `life_expectancy`: manuelle Lebenserwartung ohne Quellenfeld.
- Keine doppelten `genus + species`-Kombinationen.
- Keine leeren Pflichtfelder.

## App-Workflow in Phase 7.5

Der Arten-Explorer stellt in der Artenliste die Aktion `Neue Art` bereit.

Formularfelder:

- deutscher Name (`german`)
- wissenschaftlicher Name als zwei Woerter, zum Beispiel `Turdus Merula`
- Groesse (`size`), optional getrennt nach Maennchen und Weibchen
- Gewicht (`weight`), optional getrennt nach Maennchen und Weibchen
- Lebenserwartung (`life_expectancy`)

Der Dialog ist als dreistufiger Assistent aufgebaut.

### Schritt 1: Allgemeine Daten pruefen

Die App zeigt keine internen Dateinamen mehr im Dialogkopf. Anwender sehen nur die fachlichen Schritte.

Vor dem naechsten Schritt prueft die App lokal und danach der Server:

- alle fuenf Pflichtfelder sind gefuellt
- wissenschaftlicher Name besteht genau aus Gattung und Artepitheton
- beide Namensbestandteile enthalten nur Buchstaben oder Bindestriche
- wissenschaftlicher Name ist noch nicht vorhanden
- deutscher Name ist noch nicht vorhanden
- der erwartete URL-Slug `genus + species`, klein und ohne Leerzeichen, kollidiert nicht
- der aus dem deutschen Namen erzeugte `SafeName` kollidiert nicht mit einer anderen Art oder einem fremden
  Assetordner
- Feldlaengen und Steuerzeichen sind gueltig

Fehlerhafte Felder werden direkt rot markiert; die konkrete Fehlermeldung steht unter dem betroffenen Feld und
zusaetzlich gesammelt im Dialog. Erst nach einer gueltigen Pruefung wird `Naechster Schritt` aktiv.

Im Hintergrund trennt der Server den eingegebenen wissenschaftlichen Namen. Die Gattung wird mit grossem
Anfangsbuchstaben und das Artepitheton kleingeschrieben in `genus` und `species` gespeichert. Die Eingabe
`Turdus Merula` wird damit als `Turdus merula` normalisiert.

Groesse und Gewicht koennen getrennt nach Geschlecht erfasst werden. Dafuer gibt es je Feld eine eigene Checkbox:

- Checkbox aus: ein gemeinsamer Textwert wie bisher, zum Beispiel `ca. 23,5-29 cm`.
- Checkbox an: je ein Feld fuer `Maennchen` und `Weibchen`.
- Sind beide Angaben getrennt, speichert die App weiterhin die bestehenden Textfelder, zum Beispiel:
  `Maennchen: ca. 24-29 cm; Weibchen: ca. 23,5-27 cm`.

Die Vorschau zeigt:

- vollstaendigen neuen JSON-Eintrag
- wissenschaftlichen Namen
- erwarteten URL-Slug
- erwarteten Assetordner

### Schritt 2: Optionales Artportrait

Nach erfolgreicher Datenpruefung kann direkt ein Portrait vorbereitet werden:

1. optionale Zusatzhinweise eintragen
2. Einzelprompt aus den geprueften Artdaten erzeugen und kopieren
3. genau ein Bild in ChatGPT erzeugen
4. Bilddatei im Dialog auswaehlen
5. `Bild pruefen`

Die Bildpruefung nutzt dieselben Regeln wie die Bearbeitung bestehender Arten: PNG/JPEG/WebP bis 20 MB,
Mindestgroesse 800x1000 Pixel, 4:5-Seitenverhaeltnis und lokale Umwandlung auf `portrait.webp` in 1280x1600.
Der Schritt kann mit `Artportrait ueberspringen` bewusst ausgelassen werden.

### Schritt 3: Abschluss

Der Abschluss fasst zusammen, ob ein geprueftes Portrait uebernommen oder das Portrait uebersprungen wird.

Speichern:

- nur nach gueltiger Vorschau
- Schutz gegen parallele Aenderungen an `species_list.json`
- Backup nach derselben Aufbewahrungsregel wie Phase 7.4
- neuer Eintrag wird atomar an die Liste angehaengt
- wenn ein Portrait geprueft wurde, fragt die App vor der lokalen Uebernahme nach
- danach startet der selektive Pipeline-Lauf fuer genau diese neue Art automatisch; erst dieser Lauf vervollstaendigt
  IUCN-Daten, Karte, Sound, Spektrogramm und Git-Veröffentlichung
- neu gefundene Karten und Sounds werden danach einzeln geprüft
- wenn ein neu gefundener Sound abgelehnt wird, merkt die App die Quellkennung und startet automatisch die nächste
  gezielte Soundsuche fuer diese Art, bis ein Sound akzeptiert wird oder keine taugliche Quelle mehr gefunden wird

Direkt nach dem Speichern erscheint die Art im Explorer als `nur in species_list.json`. Dieser Zustand ist erwartet
und bleibt sichtbar, bis die Pipeline erfolgreich gelaufen ist.

API:

- `POST /api/species/new/preview`: validiert alle Felder und Kollisionen, schreibt aber keine Datei
- `POST /api/species/new/portrait-prompt`: erzeugt den Einzelprompt aus den geprueften Artdaten
- `POST /api/species/new/portrait-preview`: prueft und staged ein optionales Sofortportrait
- `POST /api/species/new/save`: akzeptiert nur das einmalige Vorschau-Token und haengt den geprueften Eintrag an

Technischer Stand vom 2026-06-28:

- Formular, Vorschau und Speichern sind lokal umgesetzt.
- Das Formular verwendet einen Schrittassistenten mit Datenpruefung, optionalem Portraitschritt und Abschluss.
- Das Formular verwendet ein gemeinsames Feld fuer den wissenschaftlichen Namen und zeigt Beispieltexte fuer alle
  Eingaben.
- Groesse und Gewicht koennen unabhaengig voneinander nach Maennchen und Weibchen getrennt werden.
- Ungueltige Felder werden sichtbar markiert; Fehlermeldungen stehen direkt am Feld.
- Nach erfolgreichem Speichern wird die Aktion wieder freigegeben, sodass ohne Seitenneuladen weitere Arten
  angelegt werden koennen.
- Direkt nach dem Speichern startet der gezielte Lauf `Neue/Unvollständige Arten aktualisieren` fuer diese Art.
  Der Prozessdialog zeigt Status, Ausgabe und anschließende Assetprüfung.
- Die vorhandene Backup-Aufbewahrung mit maximal 20 verwalteten Sicherungen wird wiederverwendet.
- Wissenschaftlicher Name, deutscher Name, Slug, `SafeName` und bereits vorhandene Assetordner werden geprueft.
- Schreibtests laufen ausschliesslich in temporaeren Mini-Repositories; die echte `species_list.json` bleibt dabei
  unveraendert.
- 19 Explorer-Tests sind erfolgreich.
- Der neu gestartete lokale Server liefert den Dialog und alle fuenf Formularfelder aus.
- Die Bedienung wurde am 2026-06-20 mit Haubentaucher und Höckerschwan praktisch geprüft.

Aktueller redaktioneller Stand:

- 46 Eintraege in `species_list.json`
- Haubentaucher, Höckerschwan und Löwe wurden nach den produktiven Workflow-Tests wieder entfernt und am
  2026-06-28 bereinigt
- nach dauerhafter Löschung der generierten Daten und Assets kann dieselbe Art ohne alte Slug-, Daten- oder
  Assetordner-Kollision erneut angelegt werden

## Formularverhalten

- Eine Textmarkierung darf über den Rand des Dialogs hinausgezogen werden, ohne das Formular zu schließen.
- Ein Klick auf den dunklen Hintergrund schließt den Dialog nur, wenn der Klick dort begonnen und geendet hat.
- Damit bleiben bereits eingetragene Werte auch beim erneuten Anlegen einer Art erhalten.

## Was danach automatisch passiert

Nach dem manuellen Eintrag verarbeitet `node update.mjs` die neue Art:

- IUCN-Taxon und globales Assessment suchen
- `speciesData.json` erzeugen/aktualisieren
- IUCN-Karte laden, wenn verfuegbar
- Sound ueber Xeno-Canto, Wikimedia Commons und iNaturalist suchen
- `fehlende_elemente_report.json` aktualisieren
- vorhandene gute Daten schuetzen, wenn ein neuer API-Abruf unvollstaendig ist

## Was nicht automatisch passiert

Squarespace-Seiten werden nicht automatisch erzeugt.

Nach einer neuen Art muessen manuell geprueft bzw. angelegt werden:

- Detailseite mit Slug aus `genus + species`, klein und ohne Leerzeichen, z. B. `cyanistescaeruleus`
- Codeblock auf der Detailseite mit den bekannten Artseiten-Containern
- Link auf der passenden Uebersichtsseite, damit Suche/Sortierung die Art findet
- ggf. Bild, Alt-Text und interne Verlinkung in Squarespace

## Pflichtchecks nach neuen Arten

Lokal:

```bash
node --check update.mjs
node update.mjs
```

Danach pruefen:

- `speciesData.json` enthaelt die neue Art.
- `fehlende_elemente_report.json` zeigt keine unerwarteten Fehler.
- Sound, Credits und Karte sind vorhanden oder sauber als fehlend gemeldet.
- `lastSavedAssessmentId.json` wurde plausibel aktualisiert.
- Keine Tokens oder lokalen Logs wurden versehentlich versioniert.

Website:

- GitHub Pages Deploy abwarten.
- Detailseite live testen.
- Info-Box inklusive Lebenserwartung, Generationsdauer und Population pruefen.
- Taxonomie, Status, Soundbar und Karte pruefen.
- Uebersichtsseite testen: Suche findet die neue Art.

## Versionierung

Nur Daten-/Asset-Aenderungen brauchen normalerweise keine Squarespace-`?v=`-Erhoehung.

Eine `?v=`-Erhoehung ist nur noetig, wenn eingebundene JavaScript- oder CSS-Dateien geaendert wurden.
