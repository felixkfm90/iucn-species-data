# KI-Artporträts im Arten-Explorer

Stand: 2026-06-21

## Ziel

Phase 7.7.5 erzeugt Artporträts zunächst ausschließlich im lokalen Arten-Explorer. Die Squarespace-Ausgabe folgt
erst nach der visuellen Freigabe des Generierungs-, Prüf- und Speicherworkflows.

Der private ChatGPT-Link ist keine technische Datenquelle. Der Explorer verwendet stattdessen direkt die OpenAI
Image API. Deutscher und wissenschaftlicher Artname stammen aus `species_list.json`; der verbindliche Stilprompt
liegt versioniert in `scripts/portrait-generator.mjs`.

## Technischer Standard

- Provider: OpenAI
- Modell: `gpt-image-2`
- Promptversion: `1.0.0`
- Ausgabegröße: `1280x1600`
- Seitenverhältnis: `4:5`
- Qualität: `high`
- Format: `webp`
- WebP-Kompression: `88`
- Hintergrund: undurchsichtig

`gpt-image-2` erlaubt laut aktueller OpenAI-Dokumentation frei gewählte Abmessungen, wenn beide Kanten ein
Vielfaches von 16 sind und die weiteren Größenlimits eingehalten werden. `1280x1600` erfüllt diese Bedingungen.

Offizielle Dokumentation:

- https://developers.openai.com/api/docs/guides/image-generation

## Voraussetzung

Der lokale Server benötigt:

```text
OPENAI_API_KEY
```

Der Schlüssel wird ausschließlich serverseitig aus der Prozessumgebung gelesen. Er gehört nicht in:

- Repository-Dateien
- Browser-JavaScript
- `species_list.json`
- `species-assets-overrides.json`
- Screenshots oder Dokumentation

Das ChatGPT-Abonnement stellt nicht automatisch API-Guthaben bereit. Bildaufträge über die Image API werden über
das zugehörige OpenAI-API-Projekt abgerechnet. Fehlt der Schlüssel, antwortet die App mit HTTP 503 und startet
keinen Bildauftrag.

## Bedienablauf

1. Bearbeitungsmodus aktivieren.
2. Art öffnen und `Bearbeiten` wählen.
3. Optional zusätzliche artspezifische Hinweise eintragen, zum Beispiel Geschlecht, Alterskleid oder vollständig
   sichtbare lange Schwanzfedern.
4. `Artporträt generieren` wählen.
5. Die Vorschau manuell prüfen.
6. Bei Fehlern `Neu generieren`; die vorherige unbestätigte Vorschau wird verworfen.
7. Nur ein fachlich akzeptables Bild mit `Artporträt übernehmen` freigeben.

Eine Generierung verändert noch keine produktive Datei. Erst die Freigabe schreibt, sichert, committed und pusht.

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

`portrait.json` dokumentiert unter anderem:

- deutschen und wissenschaftlichen Namen
- Provider und Modell
- Promptversion und Prompt-SHA-256
- Ausgabeparameter
- optionale Zusatzhinweise
- Erstellungs- und Freigabezeitpunkt
- SHA-256 der Bilddatei

`species-assets-overrides.json` registriert Bild- und Metadatenhash. Der Explorer meldet nachträgliche
Abweichungen.

## Backup und Veröffentlichung

Beim Ersetzen eines vorhandenen Porträts werden Bild und Metadaten gemeinsam gesichert:

```text
species-explorer/asset-backups/<SafeName>/portrait/
```

Es gelten dieselben Grenzen wie für Karten- und Soundbackups:

- höchstens drei verwaltete Backups pro Art und Assettyp
- globale Obergrenze 500 MB

Nach erfolgreicher Speicherung werden nur folgende Dateien vorgemerkt:

- `species-assets/<SafeName>/portrait.webp`
- `species-assets/<SafeName>/portrait.json`
- `species-assets-overrides.json`

Anschließend folgen automatischer Commit und Push.

## Promptstandard

Der Prompt verlangt eine wissenschaftlich orientierte Naturillustration als detailliertes Aquarell mit feiner
Buntstiftzeichnung, warmem hellem Papierhintergrund, genau einem möglichst vollständig sichtbaren Tier,
ausreichenden Sicherheitsabständen und nur einem minimalen artspezifischen Untergrund.

Ausgeschlossen sind unter anderem:

- dekorative Landschaft
- zweites Tier oder Beute
- erfundene Anatomie
- Merkmale verwandter Arten
- Text, Beschriftung, Signatur, Logo oder Wasserzeichen
- Fotorealismus und Cartoonstil

Die vollständige ausführbare Fassung steht in `buildPortraitPrompt()` unter
`scripts/portrait-generator.mjs`. Jede Änderung daran erfordert eine neue Promptversion.

## Noch offen

1. `OPENAI_API_KEY` in der lokalen Startumgebung setzen.
2. Eine Testart erzeugen und visuell/fachlich prüfen.
3. Bei Bedarf Stilreferenzbilder ergänzen, falls der reine Prompt den gewünschten Stil nicht ausreichend stabil
   reproduziert.
4. Nach erfolgreichem Einzeltest einen kontrollierten Stapellauf nur für fehlende Porträts planen.
5. Erst danach Squarespace-Modul, Container und Footer-Version umsetzen.
