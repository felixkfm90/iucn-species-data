# Add Species Workflow

Stand: 2026-05-28

Dieses Dokument beschreibt Phase 5.6: weitere Arten ergaenzen.

## Grundsatz

Neue Arten werden nicht automatisch vorgeschlagen oder automatisch in `species_list.json` eingefuegt.

Die Artenauswahl bleibt redaktionell manuell. Die Pipeline verarbeitet nur Arten, die bereits von Hand in
`species_list.json` stehen.

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
