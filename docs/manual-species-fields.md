# Manual Species Fields

Stand: 2026-06-14

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
