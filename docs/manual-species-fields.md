# Manual Species Fields

Stand: 2026-07-11

Dieses Dokument beschreibt die bewusst manuell gepflegten Felder in `species_list.json`.

## Grundsatz

Manuelle Zusatzdaten werden nur fuer Felder gepflegt, die IUCN nicht zuverlaessig als strukturierte API-Daten liefert
oder die fuer die Artseiten redaktionell kontrolliert bleiben sollen.

## Felder in `species_list.json`

| Feld | Pflicht | Herkunft | Verwendung |
|---|---|---|---|
| `german` | ja | manuell | Deutscher Name, Assetname und Anzeige |
| `genus` | ja | manuell | IUCN-Abfrage, Slug und wissenschaftlicher Name |
| `species` | ja | manuell | IUCN-Abfrage, Slug und wissenschaftlicher Name |
| `size` | ja | manuell | Wird als `Groesse` in `speciesData.json` geschrieben |
| `weight` | ja | manuell | Wird als `Gewicht` in `speciesData.json` geschrieben |
| `life_expectancy` | ja | manuell | Wird als `Lebenserwartung` in `speciesData.json` geschrieben |

## Anzeige

Im Arten-Explorer werden Groesse, Gewicht und Lebenserwartung im Bearbeitungsdialog wie beim Neue-Art-Assistenten
strukturiert erfasst:

- `ca.` wird automatisch vorangestellt;
- Groesse nutzt `mm`, `cm` oder `m`;
- Gewicht nutzt `g`, `kg` oder `t`;
- Lebenserwartung nutzt `Tage`, `Monate` oder `Jahre` und wird bei `1` automatisch in den Singular gesetzt;
- Groesse und Gewicht koennen unabhaengig voneinander nach Maennchen und Weibchen getrennt werden.

Bestehende Angaben in der frueheren Schreibweise `Maennchen ... Weibchen ...` werden beim Oeffnen erkannt. Beim
naechsten Speichern verwendet der Explorer einheitlich `Maennchen: ...; Weibchen: ...`.

`species-info.js` zeigt die manuelle `Lebenserwartung` oberhalb der aus IUCN stammenden `Generationsdauer` an.
Technische Platzhalter wie `n/a`, `U`, leere Werte und `unknown` werden in der Artseiten-Info-Box als `Unbekannt`
angezeigt. Das ist reine Frontend-Anzeigeformatierung; die Rohdaten in `speciesData.json` bleiben unveraendert.

Reihenfolge in der Info-Box:

1. Name
2. Groesse
3. Gewicht
4. Lebenserwartung
5. Generationsdauer
6. Populationsgroesse

## Pipeline-Verhalten

`update.mjs` uebernimmt `life_expectancy` aus `species_list.json` bei jedem Lauf neu in `speciesData.json`.

Die von IUCN gelieferten Taxonomiewerte fuer Reich, Stamm, Klasse, Ordnung und Familie werden vor dem Schreiben in
eine lesbare Gross-/Kleinschreibung ueberfuehrt, zum Beispiel `ANIMALIA` zu `Animalia`. Das einmalige Skript
`node scripts/normalize-taxonomy-data.mjs` fuehrt dieselbe Normalisierung fuer bestehende Datensaetze aus und legt
vorher eine lokale Sicherung unter `species-explorer/backups/` an.

Falls ein IUCN-Abruf unvollstaendig ist und auf vorhandene Daten zurueckgefallen wird, werden Groesse, Gewicht und
Lebenserwartung trotzdem aus der aktuellen `species_list.json` aktualisiert.

## Regel fuer neue Arten

Neue Arten sollen in `species_list.json` nur dann als vollstaendig gelten, wenn diese manuellen Felder gesetzt sind:

- `size`
- `weight`
- `life_expectancy`

Quellen fuer die Lebenserwartung werden aktuell nicht als eigenes Feld gepflegt.

Der komplette Ablauf fuer neue Arten ist in `docs/add-species-workflow.md` dokumentiert. Wichtig: neue Arten werden
nicht automatisch in `species_list.json` eingetragen.
