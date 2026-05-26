# Sound License Review

Stand: 2026-05-26

Quelle:

- `fehlende_elemente_report.json`
- `sounds/*/credits.json`
- `speciesData.json`

## Kurzfazit

Alle aktiven Arten haben laut Report Sounddatei und Credits. Der aktuelle Report nennt 9 aktive Arten mit
Non-Commercial-Lizenzhinweis. Diese Sounds sollten vor kommerzieller Nutzung ersetzt, entfernt oder rechtlich geklaert
werden.

Zusaetzlich liegt im Ordner `sounds/` ein weiterer NC-Credit fuer `Eichhoernchen`. Diese Art ist nach aktuellem
`speciesData.json` nicht als eigener aktiver Datensatz vorhanden; aktiv ist `Eurasisches Eichhörnchen`. Der Ordner sollte
vor einer spaeteren Asset-Bereinigung separat geprueft werden.

## Aktive NC-Lizenzen laut Report

| Art | Wissenschaftlicher Name | Lizenz | Quelle |
|---|---|---|---|
| Bisamratte | Ondatra zibethicus | CC BY-NC-SA 4.0 | https://www.deutsche-digitale-bibliothek.de/item/YPNRXLM3BHOHW4AD6JSJASF4CLLHLQQC |
| Brauenmotmot | Eumomota superciliosa | CC BY-NC-ND 2.5 | https://xeno-canto.org/11684 |
| Eurasisches Eichhörnchen | Sciurus vulgaris | CC BY-NC-SA 4.0 | https://xeno-canto.org/971045 |
| Fischertukan | Ramphastos sulfuratus | CC BY-NC-SA 4.0 | https://xeno-canto.org/972264 |
| Geoffroy-Klammeraffe | Ateles geoffroyi | CC BY-NC-ND 4.0 | https://xeno-canto.org/1009734 |
| Großtrappe | Otis tarda | CC BY-NC-SA 4.0 | https://xeno-canto.org/721832 |
| Mittelamerikanischer Totenkopfaffe | Saimiri oerstedii | CC BY-NC-SA 3.0 | https://animaldiversity.org/collections/contributors/naturesongs/sqmonkey12/ |
| Panama-Kapuzineraffe | Cebus imitator | CC BY-NC-SA 3.0 | https://animaldiversity.org/collections/contributors/naturesongs/wfmo12/ |
| Quetzal | Pharomachrus mocinno | CC BY-NC-SA 4.0 | https://xeno-canto.org/914121 |

## Zusaetzlicher alter/duplizierter NC-Ordner

| Ordner | Deutscher Name in Credits | Wissenschaftlicher Name | Lizenz | Quelle |
|---|---|---|---|---|
| `sounds/Eichhoernchen/` | Eichhörnchen | Sciurus vulgaris | CC BY-NC-SA 4.0 | https://xeno-canto.org/971045 |

## Empfohlene naechste Schritte

1. Fuer die 9 aktiven NC-Sounds offene Alternativen suchen, bevorzugt CC0, CC BY oder CC BY-SA.
2. Wenn keine offene Alternative verfuegbar ist, Sound auf der Website entfernen oder ausdruecklich rechtlich pruefen.
3. Danach `fehlende_elemente_report.json` neu erzeugen und pruefen.
4. Erst nach erfolgreichem Ersatz alte/duplizierte Sound-Ordner bereinigen.
