# Sound License Review

Stand: 2026-05-26

Quelle:

- `fehlende_elemente_report.json`
- `sounds/*/credits.json`
- `speciesData.json`

## Kurzfazit

Alle aktiven Arten haben laut Report Sounddatei und Credits. Der aktuelle Report nennt 6 aktive Arten mit
Non-Commercial-Lizenzhinweis. Diese Sounds sollten vor kommerzieller Nutzung ersetzt, entfernt oder rechtlich geklaert
werden.

Beim Pipeline-Lauf am 2026-05-26 wurde fuer `Eurasisches Eichhoernchen` automatisch eine freie Xeno-Canto-Alternative
gefunden und der alte NC-Sound ersetzt.

Beim anschliessenden Phase-4-Suchlauf wurde fuer `Fischertukan` eine freie Wikimedia-Commons-/iNaturalist-Aufnahme
gefunden. Der vorhandene NC-Sound wurde durch den Wikimedia-MP3-Transcode der CC-BY-SA-4.0-Datei ersetzt.

Die Commons-Suche wurde danach in `update.mjs` integriert. Beim ersten normalen Pipeline-Lauf mit dieser Erweiterung
wurde `Grosstrappe` automatisch durch eine freie Wikimedia-Commons-Aufnahme mit CC BY-SA 4.0 ersetzt.

Alte/duplizierte Sound- und Kartenassets wurden bereinigt. `sounds/`, `Verbreitungskarten/` und
`lastSavedAssessmentId.json` enthalten jeweils 45 Eintraege passend zu den 45 aktiven Arten.

Breitere Suchen in Xeno-Canto und Wikimedia Commons ergaben fuer die 6 verbleibenden NC-Faelle keine direkt verwendbare
freie MP3-Alternative. Ein Commons-Treffer fuer `Bisamratte` ist nur eine Aussprachedatei und wurde deshalb nicht
verwendet.

## Aktive NC-Lizenzen laut Report

| Art | Wissenschaftlicher Name | Lizenz | Quelle |
|---|---|---|---|
| Bisamratte | Ondatra zibethicus | CC BY-NC-SA 4.0 | https://www.deutsche-digitale-bibliothek.de/item/YPNRXLM3BHOHW4AD6JSJASF4CLLHLQQC |
| Brauenmotmot | Eumomota superciliosa | CC BY-NC-ND 2.5 | https://xeno-canto.org/11684 |
| Geoffroy-Klammeraffe | Ateles geoffroyi | CC BY-NC-ND 4.0 | https://xeno-canto.org/1009734 |
| Mittelamerikanischer Totenkopfaffe | Saimiri oerstedii | CC BY-NC-SA 3.0 | https://animaldiversity.org/collections/contributors/naturesongs/sqmonkey12/ |
| Panama-Kapuzineraffe | Cebus imitator | CC BY-NC-SA 3.0 | https://animaldiversity.org/collections/contributors/naturesongs/wfmo12/ |
| Quetzal | Pharomachrus mocinno | CC BY-NC-SA 4.0 | https://xeno-canto.org/914121 |

## Empfohlene naechste Schritte

1. Fuer die 6 aktiven NC-Sounds offene Alternativen suchen, bevorzugt CC0, CC BY oder CC BY-SA.
2. Wenn keine offene Alternative verfuegbar ist, Sound auf der Website entfernen oder ausdruecklich rechtlich pruefen.
3. `update.mjs` prueft vorhandene NC-Sounds bei jedem Update erneut auf freie Xeno-Canto- und Commons-Alternativen und ersetzt sie
   nur, wenn eine freie Alternative gefunden wird.
4. Danach `fehlende_elemente_report.json` neu erzeugen und pruefen.
