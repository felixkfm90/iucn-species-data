# Lesende Vorprüfung der lokalen Taxonomiedatenbanken

Historische Aufnahme: 27. September 2026, 09:25–09:27 Uhr MESZ.
Dies ist **kein Gesamtaudit und keine produktive Aufbau-/Rollback-Abnahme**.

## Umfang und Ergebnis

Die Prüfung öffnete die vier vorhandenen Master-/Lightroom-Datenbanken ausschließlich mit
`DatabaseSync({ readOnly: true })` und `query_only`. `quick_check` meldete jeweils `ok`;
`foreign_key_check` fand keine Fehler. Vorher-/Nachher-SHA-256, Dateistände und Manifeste waren unverändert.
Es wurden weder Daten heruntergeladen noch ein Kandidat, eine Aktivierung, eine Rücknahme oder eine
Bereinigung gestartet. Projektarten, Medien, Namenspräferenzen und Lightroom-Fotos wurden nicht geändert.

Speicherbasis: `%LOCALAPPDATA%/FN Wildlife Travel/Arten-Explorer`, Unterordner `taxonomy` und `lightroom`.

| Slot | Master | Lightroom-Paket | Taxa je Datenbank | Datenbankbytes Master / Lightroom |
| --- | --- | --- | ---: | ---: |
| Aktiv | `master-20260905054823067` | `lightroom-946c961bd063fd1b8f12` | 273.418 | 6.024.601.600 / 3.406.684.160 |
| Vorgänger | `master-20260904203001728` | `lightroom-a5595536ce72eb53ebc2` | 390.817 | 6.165.925.888 / 3.724.148.736 |

Beide Paare sind anhand ihrer Masterherkunft konsistent. Die aktive CoL-Referenz
`col-xr-2026-08-26-316165` stimmt mit der Referenzherkunft des aktiven Masters überein.
Die unterschiedlichen Taxonzahlen der beiden historischen Paare sind kein neuer Prüfbefund; sie sind
kein Vergleich derselben Eingänge und kein Nachweis eines aktuellen Datenverlusts.

Das aktive Namenskorrektur-Release `corrections-86f9f6d1889279c1e137` passt zum aktiven Paar und zur
Projektkorrekturrevision. Es enthält Rotstirnamazone, Weissstorch, Taubenschwänzchen, Leopard und Rebhuhn.
Es wurde keine Namenswahl verändert oder erneut aktiviert.

## Fingerabdrücke

| Datenbank | SHA-256 |
| --- | --- |
| Master aktiv | `8091efa9412490e5d9837396347e9ceba2c31063d03b7efa2f8028a78a354302` |
| Master Vorgänger | `1ec53f26b34889a9e4ef52b862efb0f7af8d3c29c62196ae422d333b9509d8df` |
| Lightroom aktiv | `72569cea4990d72e797898ceee241198e226d69638d9cd3d61d01aa707c085ac` |
| Lightroom Vorgänger | `6646e77d7ed0aa62160b8859f6fab806809eec3d7f24c507914e4542750f32b4` |

Bei beiden Lightroom-Paketen stimmen die Prüfsummen zusätzlich mit dem gespeicherten Manifest überein.
Die alten Mastermanifeste enthalten keinen entsprechenden Sollprüfwert. Deren Hashes sind deshalb eine
jetzt gemessene Ausgangsreferenz, **keine rückwirkende Bestätigung gegen einen früher gesicherten Hash**.
Die SQLite-Prüfungen ersetzen nicht den vollständigen fachlichen Kandidatenvergleich.

## Grundlage für den ersten neuen Lauf

Der aktive Master hat Schema 3, der heutige Aufbau schreibt Schema 4. Es fehlt die gebundene
Master-Eingangsgrundlage (`no-input-baseline`); auch dem Lightroom-Paket fehlen die gebundenen Exportfingerabdrücke.
Der erste Lauf mit diesen Altständen muss daher einmal vollständig aufbauen und prüfen. Erst sein Ergebnis
ist eine Grundlage für folgende inkrementelle Aufbauten. Das ist der vorgesehene sichere Altformat-Rückfall,
kein neu aufgetretener CoL-/Master-Drift. Die synthetisch gemessene Beschleunigung darf für diesen ersten
produktiven Grundlagenlauf nicht versprochen werden.

Der gemeinsame Veröffentlichungszeiger `taxonomy-publication/active.json` ist noch nicht vorhanden.
Die bisherigen getrennten Zeiger sind konsistent. Der implementierte erste gemeinsame Wechsel muss das
jetzt aktive, erneut geprüfte Paar als Vorgänger übernehmen. Der bereits vorhandene ältere Vorgänger wird
in dieser Vorprüfung nicht gelöscht. Speicherpflege mit genau einem geprüften Backup bleibt ein separat
bestätigungspflichtiger Vorgang, keine beiläufige Voraussetzung des Aufbaus.

Es gab keinen `build-jobs/current.json`-Auftrag. Das Auftragsverzeichnis enthielt nur die leere
`control-lock.sqlite`. Der Explorer antwortete lokal, sein Arten-Pipeline-Status war `completed`.
Lightroom war geöffnet. Das beweist weder die Abwesenheit jeder kurzzeitigen Prozesssperre noch die
Bedienbarkeit jedes Fensters; es wurde absichtlich keine schreibende Sperrprobe ausgeführt.

Die Momentaufnahme zeigt rund 137,5 GiB frei auf C: und 196,9 GiB auf D:, rund 43,1 GiB freien RAM bei
63,7 GiB Gesamtspeicher. Die Datenbankarbeit liegt auf C:. Das ist keine garantierte Platzfreigabe:
neue Eingangsdateien, Kandidat, Paketvorbereitung und 2-GiB-Reserve müssen beim echten Lauf erneut geprüft werden.

## Nächster kontrollierter Abnahmeschritt

1. Den neuen Programmstand laden und einen **ausdrücklich bestätigten lokalen Grundlagenlauf** vorbereiten,
   mit unveränderten lokalen Anbieterständen und ohne neue Downloads. Der vorhandene API-Baupfad unterstützt
   `refreshProviders: false`; ein Start wurde hier nicht ausgeführt.
2. Den Startweg vorab eindeutig machen: Der normale Button `Datenbank aktualisieren` kann bei aktuellen
   Quellen berechtigt „bereits aktuell“ melden. Die Updateentscheidung behandelt eine fehlende inkrementelle
   Altformatgrundlage allein noch nicht als Arbeit. `Neuen Datenbankaufbau starten` erscheint bei einem
   gespeicherten veralteten/unterbrochenen Auftrag, nicht allein wegen der fehlenden Grundlage.
   Keine künstliche Namensänderung oder manipulierten Zeiger verwenden, um einen Aufbau zu erzwingen.
   Ein ausdrücklicher UI-Grundlagenlauf ist als nächster kleiner Vorbereitungspunkt zu klären/umzusetzen.
3. Vor dem Start Eingangsrevisionen, Korrektur-Release und freien Platz erneut prüfen. Aktive Dateien bleiben
   unverändert, bis Kandidat und Suchpaket vollständig geprüft sind. Bei Konflikten keine automatische Auswahl.
4. Pause und explizite Fortsetzung am echten Master-Checkpoint sowie Explorer-Wiederöffnung prüfen;
   keine absichtliche Stromunterbrechung und kein Löschen eines aktiven Auftrags. Schwere Paarvorbereitung
   hat keine eigenen 500er-Checkpoints.
5. Nach geprüftem Wechsel beide Verbraucher, Namenspräferenzen und Paket-/Master-/CoL-Herkunft kontrollieren.
   Eine reale Rücknahme getrennt bestätigen; sie ist nicht durch diese lesende Prüfung abgenommen.
6. Erst mit gebundener neuer Basis inkrementelle Gesamtzeit am großen Bestand beurteilen. Quellenbeschaffung,
   Kandidatenbau, Paketprüfung und Veröffentlichung getrennt erfassen. Kein pauschaler Geschwindigkeitsfaktor.

Der aktuelle Restplan steht in [Roadmap](../roadmap.md), der Betriebsvertrag unter
[Master-Hintergrundaufbau](../taxonomy-master-background-build.md).
