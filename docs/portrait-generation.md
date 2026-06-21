# KI-Artporträts im Arten-Explorer

Stand: 2026-06-21

## Entscheidung

Die kostenpflichtige OpenAI Image API wird nicht verwendet. Der Explorer benötigt keinen `OPENAI_API_KEY` und
führt keinen automatischen kostenpflichtigen Bildauftrag aus.

Stattdessen gilt ein manueller, kontrollierter Workflow:

1. Die App erzeugt kostenfrei einen artspezifischen Prompt.
2. Der Prompt wird kopiert und im vorhandenen ChatGPT-Zugang verwendet.
3. Das dort erzeugte Bild wird heruntergeladen.
4. Die Datei wird wieder in den Arten-Explorer geladen.
5. Die App prüft und vereinheitlicht die Datei.
6. Erst nach manueller fachlicher Prüfung wird das Bild übernommen, committed und gepusht.

Squarespace folgt erst, wenn der lokale Workflow und die Portraitqualität freigegeben sind.

## Prompt

Deutscher und wissenschaftlicher Artname stammen aus `species_list.json`. Der verbindliche, versionierte
Stilprompt steht in `scripts/portrait-generator.mjs`.

Die App bietet je Art:

- optionale Zusatzhinweise, etwa Geschlecht, Alters- oder Brutkleid
- `Prompt erstellen`
- `Prompt kopieren`
- sichtbare Promptvorschau

Der Sammelpunkt `Fehlende Artporträts ergänzen` erstellt die Prompts für alle Arten ohne Portrait. Die Prompts
werden gemeinsam kopiert. Falls die Browser-Zwischenablage nicht verfügbar ist, lädt die App automatisch
`artportrait-prompts.txt` herunter.

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
3. Optional Zusatzhinweise eintragen.
4. `Prompt erstellen` und danach `Prompt kopieren`.
5. Prompt in ChatGPT einfügen und Bild herunterladen.
6. Bild in der App auswählen.
7. `Bild prüfen`.
8. Fachliche Prüfung durchführen.
9. `Artporträt übernehmen`.

### Alle fehlenden Porträts

1. Das rote/grüne Datenbankfeld öffnen.
2. `Fehlende Artporträts ergänzen` wählen.
3. Vorschau der betroffenen Arten prüfen.
4. `Alle Prompts kopieren`.
5. Bilder in ChatGPT erzeugen.
6. Filter `Fehlendes Artporträt` verwenden.
7. Bilder artweise über `Bearbeiten` importieren und freigeben.

Arten ohne Portrait tragen in der linken Liste die Markierung `P`. Ein fehlendes Portrait gilt als reguläres
Assetproblem:

- die Gesamtvalidierung wird rot
- der Zähler `Assetprobleme` berücksichtigt die Art
- die Karte `Assetstruktur` zeigt die Anzahl fehlender Portraits
- die Detailprüfung nennt `Artporträt fehlt`
- der Datenbankstatus bleibt auf `Datenbank aktualisieren`, bis alle Portraits ergänzt sind

Der normale IUCN-/Karten-/Sound-Pipelinelauf erzeugt trotzdem keine Portraits. Dafür bleibt ausschließlich der
eigene Ablauf `Fehlende Artporträts ergänzen` zuständig.

## Darstellung im Explorer

Ein vorhandenes Portrait darf die Medienzeile nicht höher machen als der leere Portraitplatzhalter. Karte und
rechte Medienspaltensumme behalten daher eine gemeinsame feste Höhe. Das 4:5-Portrait wird vollständig mit
`object-fit: contain` in die Portraitzelle eingepasst. Es wird weder abgeschnitten noch innerhalb der Zelle
verschoben; für die große Qualitätsprüfung dient die Portrait-Lightbox.

Der erste produktive Einzelimport wurde am 2026-06-21 für `Alpenbirkenzeisig` erfolgreich gespeichert, committed
und gepusht.

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

- höchstens drei verwaltete Backups pro Art und Assettyp
- globale Obergrenze 500 MB

Nach erfolgreicher Speicherung werden nur folgende Dateien vorgemerkt:

- `species-assets/<SafeName>/portrait.webp`
- `species-assets/<SafeName>/portrait.json`
- `species-assets-overrides.json`

Anschließend folgen automatischer Commit und Push.

## Nächste Phase

Die nächste Phase betrifft nicht nur Portraits, sondern die gesamte Arten-Explorer-App: ein eigenes
Windows-App-Fenster startet und überwacht den lokalen Server automatisch. Ein externer Browser und die manuelle URL
`127.0.0.1:4177` sollen für den normalen Betrieb nicht mehr erforderlich sein. Planung:
`docs/desktop-shell-plan.md`.
