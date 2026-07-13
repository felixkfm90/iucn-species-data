# Sound License Review

> **Historische Zeitaufnahme vom 2026-06-17.** Lizenzangaben und Zähler in diesem Bericht bilden ausschließlich den
> damaligen Prüfstand ab. Aktive NC-Soundlizenzen stehen heute automatisch erzeugt in `docs/project-status.md`; die
> Einzelquelle einer Art bleibt in `species-assets/<SafeName>/credits.json` maßgeblich.

Stand: 2026-06-17

Quelle:

- `fehlende_elemente_report.json`
- `species-assets/*/credits.json`
- `speciesData.json`

## Kurzfazit

Alle aktiven Arten haben laut Report Sounddatei und Credits. Der aktuelle Report nennt 3 aktive Arten mit
Non-Commercial-Lizenzhinweis. Diese Sounds sollten vor kommerzieller Nutzung ersetzt, entfernt oder rechtlich geklaert
werden.

Beim Pipeline-Lauf am 2026-05-26 wurde fuer `Eurasisches Eichhoernchen` automatisch eine freie Xeno-Canto-Alternative
gefunden und der alte NC-Sound ersetzt.

Beim anschliessenden Phase-4-Suchlauf wurde fuer `Fischertukan` eine freie Wikimedia-Commons-/iNaturalist-Aufnahme
gefunden. Der vorhandene NC-Sound wurde durch den Wikimedia-MP3-Transcode der CC-BY-SA-4.0-Datei ersetzt.

Die Commons-Suche wurde danach in `update.mjs` integriert. Beim ersten normalen Pipeline-Lauf mit dieser Erweiterung
wurde `Grosstrappe` automatisch durch eine freie Wikimedia-Commons-Aufnahme mit CC BY-SA 4.0 ersetzt.

Alte/duplizierte Sound- und Kartenassets wurden bereinigt. Seit 2026-06-17 liegen Sound, Credits, Karte und
Spektrogramm pro Art unter `species-assets/<SafeName>/`.

Die freie Alternativsuche wurde danach um iNaturalist erweitert. `Mittelamerikanischer Totenkopfaffe` und
`Panama-Kapuzineraffe` wurden auf exakt zugeordnete iNaturalist-Aufnahmen mit CC BY 4.0 ersetzt. Zwei zunaechst
gefundene iNaturalist-Treffer fuer `Brauenmotmot` und `Geoffroy-Klammeraffe` waren weiterhin NC-lizenziert und wurden
daher nicht uebernommen.

Breitere Suchen in Xeno-Canto, Wikimedia Commons und iNaturalist ergaben fuer die 3 verbleibenden NC-Faelle keine direkt
verwendbare freie MP3-Alternative. Ein Commons-Treffer fuer `Bisamratte` ist nur eine Aussprachedatei und wurde deshalb
nicht verwendet.

## Aktive NC-Lizenzen laut Report

| Art | Wissenschaftlicher Name | Lizenz | Quelle |
|---|---|---|---|
| Bisamratte | Ondatra zibethicus | CC BY-NC-SA 4.0 | https://www.deutsche-digitale-bibliothek.de/item/YPNRXLM3BHOHW4AD6JSJASF4CLLHLQQC |
| Brauenmotmot | Eumomota superciliosa | CC BY-NC-ND 2.5 | https://xeno-canto.org/11684 |
| Geoffroy-Klammeraffe | Ateles geoffroyi | CC BY-NC-ND 4.0 | https://xeno-canto.org/1009734 |

## Empfohlene naechste Schritte

1. Fuer die 3 aktiven NC-Sounds offene Alternativen suchen, bevorzugt CC0, CC BY oder CC BY-SA.
2. Wenn keine offene Alternative verfuegbar ist, Sound auf der Website entfernen oder ausdruecklich rechtlich pruefen.
3. `update.mjs` prueft vorhandene NC-Sounds bei jedem Update erneut auf freie Xeno-Canto-, Commons- und
   iNaturalist-Alternativen und ersetzt sie nur, wenn eine freie Alternative gefunden wird.
4. Danach `fehlende_elemente_report.json` neu erzeugen und pruefen.
