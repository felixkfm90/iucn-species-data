# KI-Artporträts im Arten-Explorer

Stand: 2026-08-12

## Entscheidung

Die kostenpflichtige OpenAI Image API wird nicht verwendet. Der Explorer benötigt keinen `OPENAI_API_KEY` und
führt keinen automatischen kostenpflichtigen Bildauftrag aus.

Stattdessen gilt ein manueller, kontrollierter Workflow:

1. Die App erzeugt kostenfrei einen artspezifischen Prompt.
2. Der Prompt wird kopiert und im vorhandenen ChatGPT-Zugang verwendet.
3. Das dort erzeugte Bild wird heruntergeladen.
4. Die Datei wird wieder in den Arten-Explorer geladen.
5. Die App prüft und vereinheitlicht die Datei.
6. Erst nach manueller fachlicher Prüfung wird das Bild übernommen. Bei bestehenden Arten speichert
   `Artporträt übernehmen` lokal mit Backup; veröffentlicht wird gesammelt über `Änderungen übertragen`.

Der lokale Workflow ist seit dem 2026-06-21 freigegeben. Die Squarespace-Ausgabe bleibt trotzdem bewusst ein
späterer eigener Ausbauschritt, nachdem weitere Portraits erstellt und fachlich geprüft wurden.

## Prompt

Deutscher und wissenschaftlicher Artname stammen aus `species_list.json`. Der verbindliche, versionierte
Stilprompt steht in `scripts/portrait-generator.mjs`. Promptversion `2.0.0` verbindet die Ein-Bild-Regel mit
strukturierten, klassenabhängigen Bildvorgaben:

- genau eine einzelne Bilddatei pro Antwort
- genau eine Art und ein Exemplar
- keine Collage, kein Raster, kein Kontaktabzug und keine Mehrfachfelder
- keine Varianten, Mehrfachansichten, Detail-Inserts oder wiederholten Darstellungen
- nach einem erzeugten Bild stoppen

Ohne geöffnete erweiterte Vorgaben arbeitet die App automatisch. Nur das Habitat ist als sicherer Standard
`dezent angedeutet`; es muss wissenschaftlich zur Art passen. `Prompt erstellen` übernimmt die aktuellen Vorgaben
direkt. Einen separaten Schritt zum Verbessern der Hinweise gibt es nicht.

Der Bereich `Erweiterte Vorgaben für die Bildgenerierung` ist standardmäßig geschlossen und enthält wiederum
einzeln ausklappbare Gruppen:

- Tier und Motiv: Motivanzahl, Geschlecht, Lebensstufe und Bildausschnitt
- Körper und Blick: Körperausrichtung sowie davon getrennt Kopf- und Blickrichtung
- Perspektive und Verhalten: Perspektive, Aktivität und Nahrung oder Beute
- Umgebung und Licht: Habitatstärke, Tageszeit sowie Saison oder Zustand
- klassenabhängige Vorgaben, beispielsweise Gefieder und Flügel bei Vögeln, Fell und Sozialform bei Säugetieren
  oder Gewässertyp bei Fischen

Die Werte werden über eindeutige Einfachauswahlen gewählt. Bei `Detailaufnahme` ist zusätzlich ein Detailmotiv wie
`Pfote`, `Schnabel`, `Auge`, `Flügel`, `Schuppen` oder `Panzer` Pflicht. Widersprüchliche Kombinationen werden vor
der Prompt-Erstellung abgewiesen. Der kompakte Kopf nennt, wie viele Vorgaben vom automatischen Standard abweichen.

Die App bietet je Art:

- optionale Zusatzhinweise, etwa Geschlecht, Alters- oder Brutkleid
- strukturierte erweiterte Vorgaben mit klassenabhängigen Auswahlmöglichkeiten
- `Prompt erstellen`
- `Prompt kopieren`
- sichtbare Promptvorschau

Einen Sammelprompt für mehrere Arten gibt es bewusst nicht mehr. ChatGPT erzeugte daraus wiederholt Collagen oder
Mehrfachbilder. Deshalb wird immer genau eine Art geöffnet, deren Einzelprompt kopiert und genau ein Bild wieder
importiert.

## Importstandard

Zulässige Quelldateien:

- PNG
- JPEG
- WebP
- höchstens 20 MB
- mindestens 800 × 1000 Pixel
- Seitenverhältnis 4:5 mit kleiner technischer Toleranz

Der Server prüft Dateiendung, Magic Bytes und Bildabmessungen. Danach erzeugt der lokale FFmpeg-Prozess das
einheitliche Produktformat:

```text
1280 × 1600 Pixel
WebP
Qualität 90
undurchsichtiger warmer Hintergrund
```

Die Konvertierung beschneidet das Bild nicht. Sie skaliert es vollständig innerhalb des 4:5-Rahmens und ergänzt
bei kleinen Seitenverhältnisabweichungen nur Randfläche. Die Vorschau verwendet ebenfalls einen echten
4:5-Rahmen und zeigt das gesamte Produktbild. Ein Verschieben oder manuelles Festlegen eines Crop-Ausschnitts ist
daher nicht vorgesehen.

Die Quelldatei bleibt nur während der zehn Minuten gültigen Vorschau im ignorierten Stagingordner. Sie wird nach
Übernahme, Ablauf oder neuer Vorschau gelöscht.

## Bedienablauf

### Einzelne Art

1. Bearbeitungsmodus aktivieren.
2. Art öffnen und `Bearbeiten` wählen.
3. Optional einzelne erweiterte Vorgaben aufklappen und auswählen sowie freie Zusatzhinweise eintragen.
4. `Prompt erstellen` und danach `Prompt kopieren`.
5. Prompt in ChatGPT einfügen und Bild herunterladen.
6. Bild in der App auswählen.
7. `Bild prüfen`.
8. Fachliche Prüfung durchführen.
9. `Artporträt übernehmen`.

Weitere fehlende Porträts werden über den Filter `Fehlendes Artporträt` gesucht und danach jeweils einzeln über
`Bearbeiten` erstellt und importiert.

### Neue Art mit optionalem Sofortportrait

Beim Anlegen einer neuen Art kann der Portraitschritt direkt vorbereitet werden:

1. Deutscher Name, wissenschaftlicher Name, Größe, Gewicht und Lebenserwartung eintragen.
2. `Art prüfen`; Fehler werden direkt an den betroffenen Feldern angezeigt.
3. Im Schritt `Artportrait` optional einzelne erweiterte Vorgaben auswählen und Zusatzhinweise eintragen.
4. `Portrait-Prompt erstellen` und `Prompt kopieren`.
5. In ChatGPT genau ein Bild erzeugen und herunterladen.
6. Bild im Neue-Art-Dialog auswählen und mit `Bild prüfen` validieren oder `Artportrait überspringen` wählen.
7. Im Schritt `Abschluss` die Art anlegen.

Wenn kein Bild geprüft wurde, läuft der bisherige Ablauf weiter und die App bietet den selektiven Pipeline-Lauf an.
Wenn ein Bild geprüft wurde, speichert die App zuerst die neue Art und fragt dann, ob das Portrait lokal übernommen
werden soll. Die Veröffentlichung erfolgt anschließend zusammen mit dem gezielten Pipeline-Lauf für diese neue Art.

Arten ohne Portrait tragen in der linken Liste die Markierung `P`. Ein fehlendes Portrait gilt als reguläres
Assetproblem:

- die Gesamtvalidierung wird rot
- der Zähler `Assetprobleme` berücksichtigt die Art
- die Karte `Assetstruktur` zeigt die Anzahl fehlender Portraits
- die Detailprüfung nennt `Artporträt fehlt`
- der Datenbankstatus bleibt auf `Datenbank aktualisieren`, bis alle Portraits ergänzt sind

Der normale IUCN-/Karten-/Sound-Pipelinelauf erzeugt keine Portraits. Portraits werden ausschließlich artweise im
Bearbeitungsdialog gepflegt.

## Darstellung im Explorer

Ein vorhandenes Portrait darf die Medienzeile nicht höher machen als der leere Portraitplatzhalter. Karte und
rechte Medienspaltensumme behalten daher eine gemeinsame feste Höhe. Das 4:5-Portrait wird vollständig mit
`object-fit: contain` in die Portraitzelle eingepasst. Es wird weder abgeschnitten noch innerhalb der Zelle
verschoben; für die große Qualitätsprüfung dient die Portrait-Lightbox.

Der erste produktive Einzelimport wurde am 2026-06-21 für `Alpenbirkenzeisig` erfolgreich gespeichert, committed
und gepusht. Seit 2026-06-27 kann der Neue-Art-Dialog den Einzelprompt aus den gerade eingegebenen Artdaten erzeugen
und optional ein sofort erzeugtes Bild direkt nach der Artanlage prüfen und übernehmen.

## Pflichtprüfung

Vor jeder Übernahme prüfen:

- eindeutige Merkmale der richtigen Art
- korrektes Geschlecht, Alter oder Jahreskleid, sofern relevant
- Körperproportionen
- Augen, Ohren, Schnabel, Zähne und Nasenform
- Anzahl und Form von Beinen, Zehen, Krallen, Flügeln und Flossen
- Schwanz, Federn, Fell, Schuppen und Zeichnung
- keine Vermischung mit ähnlichen Arten
- keine abgeschnittenen wichtigen Körperteile
- kein Text, Logo, Rahmen, Wasserzeichen oder zweites Tier

Der Prompt reduziert typische Fehler, kann wissenschaftliche Richtigkeit aber nicht garantieren.

## Produktive Dateien

Nach Freigabe:

```text
species-assets/<SafeName>/portrait.webp
species-assets/<SafeName>/portrait.json
```

`portrait.json` dokumentiert:

- deutschen und wissenschaftlichen Namen
- Quelle `ChatGPT`
- manuellen Generierungs- und Importweg
- Promptversion, vollständigen Prompt und Prompt-SHA-256
- ursprünglichen Dateinamen, Format und Abmessungen
- Produktabmessungen und Format
- optionale Zusatzhinweise
- normalisierte erweiterte Portraitvorgaben und verwendete Taxonomieklasse
- Import- und Freigabezeitpunkt
- SHA-256 der Produktdatei

`species-assets-overrides.json` registriert Bild- und Metadatenhash. Der Explorer meldet nachträgliche
Abweichungen.

## Backup und Veröffentlichung

Beim Ersetzen eines vorhandenen Portraits werden Bild und Metadaten gemeinsam gesichert:

```text
species-explorer/asset-backups/<SafeName>/portrait/
```

Es gelten:

- genau eine letzte verwaltete Sicherung pro Art und Assettyp; ein erneutes Ersetzen oder Löschen überschreibt sie
- globale Obergrenze 500 MB

Wenn eine Portrait-Sicherung vorhanden ist, kann sie in der Artseite über `Wiederherstellen` zurückkopiert werden.
Ohne Sicherung ist der Button deaktiviert.

Nach erfolgreicher Speicherung werden nur folgende Dateien vorgemerkt:

- `species-assets/<SafeName>/portrait.webp`
- `species-assets/<SafeName>/portrait.json`
- `species-assets-overrides.json`

Anschließend folgen Commit und Push gesammelt über `Änderungen übertragen`.

## Nächste Phase

Die nächste Phase betrifft nicht nur Portraits, sondern die gesamte Arten-Explorer-App: ein eigenes
Windows-App-Fenster startet und überwacht den lokalen Server automatisch. Ein externer Browser und die manuelle URL
`127.0.0.1:4177` sollen für den normalen Betrieb nicht mehr erforderlich sein. Planung:
`docs/desktop-shell-plan.md`.
