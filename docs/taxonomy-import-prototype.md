# Begrenzter Taxonomie-Importprototyp

Stand: 2026-07-23

Status: Phase 9.3 abgeschlossen; begrenzter Offline-Prototyp, noch kein produktiver Vollimport

Roadmap: Phase 9.3

## 1. Ergebnis

Der in Phase 9.2 entworfene lokale Taxonomiespeicher wurde mit einem kleinen, reproduzierbaren Testbestand
implementiert und geprüft. Der Prototyp bestätigt:

- SQLite über `node:sqlite` eignet sich für den lokalen, read-only nutzbaren Referenzbestand.
- Catalogue-of-Life-XR-Daten lassen sich aus ColDP-Tabellen streamend importieren.
- wissenschaftliche Namen, Synonyme, deutsche Namen, Hierarchien, externe Kennungen und Quellenprovenienz bleiben
  getrennt erhalten.
- Präfixsuche funktioniert ab dem ersten Zeichen in beide Richtungen, deutsch und wissenschaftlich.
- `Tiere (Animalia)` ist der Standardfilter; eine bewusste Suche über alle Reiche bleibt möglich.
- Mehrdeutigkeiten, beispielsweise `Aotus` im Tier- und Pflanzenreich, lösen keine automatische Auswahl aus.
- Staging, Validierung, atomare Aktivierung, Abbruch und Rollback schützen die zuletzt aktive Version.
- die Referenzdatenbank bleibt außerhalb von Git, GitHub Pages und den produktiven Artdateien.

Phase 9.3 verändert weder `species_list.json` noch `speciesData.json`, Assets, Squarespace-Module oder den
Neue-Art-Assistenten. Die produktive Explorer-Integration beginnt erst nach dem Bedien- und API-Entwurf in
Phase 9.4.

## 2. Festgeschriebene Quellen

Der Testbestand ist von folgenden versionierten Quellen abgeleitet:

| Rolle | Release | Ausgabedatum | Kennung |
|---|---|---|---|
| primäre Referenz | Catalogue of Life `COL26.7 XR` | 2026-07-17 | Dataset 315834, DOI `10.48580/dgykv`, Attempt 607 |
| Base-Vertrauensabgleich | Catalogue of Life `COL26.7` | 2026-07-14 | Dataset 315777, DOI `10.48580/dgyhw`, Attempt 606 |
| mariner Vergleich | WoRMS REST | Abruf bei Fixture-Erzeugung | AphiaID und fachliche Vergleichsfelder |
| Datenformat | ColDP | Version 1.2 | `NameUsage`, `VernacularName`, `ExternalIdentifier` |

Die kleine Fixture liegt versioniert unter
`scripts/fixtures/taxonomy/col-xr-2026-07-17/`. Ihr Manifest enthält Release-Metadaten, Dateigrößen und
SHA-256-Prüfsummen. Sie ist kein Ersatz für den vollständigen CoL-XR-Download, sondern nur eine stabile
Testgrundlage für Architektur, Suchverhalten und Fehlerfälle.

Der vollständige XR-ColDP-Export liegt derzeit in einer Größenordnung von ungefähr 1,3 GB. Deshalb wird er in
Phase 9.3 weder heruntergeladen noch in Git aufgenommen. Aus den Messwerten der kleinen Fixture wird bewusst keine
lineare Größenprognose für den Vollbestand abgeleitet.

Animalia.bio bleibt entsprechend der Quellenentscheidung ein ausschließlich manuelles Browser-Fallback für Tiere
ohne bestätigten deutschen Namen. Der Prototyp erzeugt dafür nur eine gezielte Such-URL; er ruft oder scrapt die
Website nicht automatisiert.

## 3. Testbestand

Die Fixture enthält unter anderem:

- `Turdus merula` / Amsel für deutsch-wissenschaftliche Suche,
- `Carduelis carduelis` / Stieglitz für bidirektionale Vorschläge,
- `Cyanistes caeruleus` sowie das Synonym `Parus caeruleus`,
- `Saimiri oerstedii` als bestehende Projektart,
- `Megaptera novaeangliae`, `Solea solea` und `Asterias rubens` für WoRMS-Vergleiche,
- `Quercus robur`, `Amanita muscaria` und `Escherichia coli` für weitere Reiche,
- `Aotus` als Homonym in Animalia und Plantae,
- `Panthera leo persica` als infraspezifischen Namen,
- `Raphus cucullatus` und `Tyrannosaurus rex` für ausgestorbene beziehungsweise vorläufige Datensätze.

Der Umfang beträgt:

- 123 `NameUsage`-Zeilen,
- 27 deutsche Vernakularnamen,
- 376 externe Kennungen in der Fixture,
- drei WoRMS-Vergleiche.

## 4. Technische Bestandteile

### Import und Speicherung

- `species-explorer/taxonomy-storage.mjs`
  definiert lokale Pfade, Releaseverzeichnisse, aktiven Zeiger, Aufbewahrung und `node:sqlite`-Grenze.
- `species-explorer/taxonomy-fixture.mjs`
  prüft Manifest, Pflichtdateien, Header, Dateigrößen und SHA-256-Werte und liest TSV-Dateien streamend.
- `species-explorer/taxonomy-schema.mjs`
  erzeugt Tabellen, Fremdschlüssel, B-Tree-Indizes und FTS5-Index und führt Integritätsprüfungen aus.
- `species-explorer/taxonomy-import.mjs`
  importiert in eine Staging-Datenbank, validiert sie vollständig und aktiviert sie erst danach atomar.
- `species-explorer/taxonomy-store.mjs`
  öffnet die aktive Datenbank read-only und stellt Status-, Reichs-, Such- und Detailabfragen bereit.
- `species-explorer/taxonomy-search-text.mjs`
  normalisiert Unicode, Groß-/Kleinschreibung, Diakritika und deutsche Umlautvarianten.

### Kommandozeile und Fixture-Erzeugung

- `scripts/taxonomy-prototype.mjs`
  führt Import, Aktivierung, Suchbeispiele und Messungen isoliert unter `Testlauf/` aus.
- `scripts/taxonomy-prototype-fetch.mjs`
  erzeugt die begrenzte Fixture kontrolliert aus den festgeschriebenen Quellen. Dieses Netzwerkskript ist kein
  normaler CI-Schritt.
- `scripts/taxonomy-prototype.test.mjs`
  prüft den vollständigen Prototypablauf.

## 5. Datenmodell und Suche

Die SQLite-Datenbank trennt:

- Quellenrelease und Quelldatensätze,
- akzeptierte beziehungsweise vorläufige Taxa,
- wissenschaftliche Namen und Synonyme,
- Vernakularnamen mit Sprache, Quelle und Bestätigungsstatus,
- externe IDs,
- WoRMS-Vergleichssichten,
- normalisierte Suchbegriffe.

Die Suche verwendet für Präfixe B-Tree-Indizes und für mehrteilige Eingaben zusätzlich FTS5. Unterstützt werden:

- wissenschaftlicher Name → deutscher Vorschlag,
- deutscher Name → wissenschaftlicher Vorschlag,
- Synonyme → akzeptiertes Taxon,
- externe Kennung → Taxon,
- ein Zeichen bis längere Präfixe,
- Reich `Animalia` als Standard,
- ausdrücklich gewählte Suche über alle Reiche,
- maximal zwölf Treffer,
- keine stille Auswahl bei mehreren Treffern.

Ein Treffer enthält mindestens akzeptierten Namen, gefundenen Namen, Namensart, Rang, Status, Reich,
Vertrauensstufe, Release und Quellenprovenienz. Detailabfragen ergänzen Hierarchie, deutsche Namen, externe
Kennungen und den vorhandenen WoRMS-Vergleich.

## 6. Aktivierung, Fehler und Rollback

Jeder Import verwendet einen eigenen Stagingpfad. Die Aktivierung erfolgt nur nach:

1. Prüfsummen- und Headerprüfung,
2. vollständigem Import,
3. Fremdschlüssel- und Integritätsprüfung,
4. fachlichen Prüfungen für Synonyme, Homonyme, Hierarchie, Provenienz und FTS,
5. erfolgreichem Abschluss aller Schreiboperationen.

Erst dann wird ein kleiner atomar geschriebener Zeiger auf das neue immutable Release gesetzt. Genau eine vorige
Version bleibt als Rollback erhalten. Scheitert ein Schritt nach der Zeigerumschaltung, stellt der Importer den
vorigen Zeiger wieder her und entfernt den fehlgeschlagenen Kandidaten. Bei Abbruch oder beschädigter Fixture
bleibt die aktive Version unverändert.

## 7. Messwerte des begrenzten Prototyps

Gemessen mit der Projektlaufzeit Node.js 24.12 unter Windows:

| Messwert | Ergebnis |
|---|---:|
| gelesene Quelldaten | 47.403 Byte |
| erzeugte SQLite-Datei | 450.560 Byte |
| davon gemessene Suchindizes | 167.936 Byte |
| Importdauer | 60,54 ms |
| geschätzter RSS-Höchstwert | 54.743.040 Byte |
| RSS-Zunahme während des Laufs | 4.947.968 Byte |
| kaltes Öffnen der Datenbank | 0,687 ms |
| warme Suche, Median | 0,280 ms |
| warme Suche, 95. Perzentil | 0,483 ms |
| warme Suche, Maximum | 1,215 ms |
| Messumfang | 210 Suchabfragen |

Die erzeugte Datenbank enthält 115 Taxa, 123 wissenschaftliche Namen, 27 Vernakularnamen, 379 externe Kennungen,
529 Suchbegriffe und drei WoRMS-Vergleiche. Diese Werte belegen nur die Funktionsfähigkeit des begrenzten
Prototyps. Speicherreserve, Vollimportdauer und Suchlatenz des vollständigen CoL-XR-Bestands müssen in Phase 9.5
separat gemessen werden.

## 8. Bedienung und Tests

Prototyp frisch unter `Testlauf/` importieren und messen:

```powershell
npm.cmd run --silent taxonomy:prototype -- --reset --json
```

Nur die direkten Phase-9.3-Tests:

```powershell
npm.cmd run --silent test:taxonomy-prototype
```

Die Taxonomietests sind außerdem Teil des vollständigen Projektgates:

```powershell
npm.cmd run --silent quality:ci
```

Die Tests decken unter anderem ab:

- korrektes Importrelease,
- beschädigte Prüfsumme,
- Abbruch und Stagingbereinigung,
- Aktivierung einer zweiten Version,
- Rollback,
- Fehler direkt nach Aktivierung,
- Ein-Zeichen-Präfixe,
- deutsche und wissenschaftliche Suche,
- Synonyme,
- Reichsfilter und Homonyme,
- Unterart, ausgestorbene und vorläufige Taxa,
- WoRMS-Vergleich,
- Animalia.bio-Fallback,
- Trefferlimit,
- vollständigen CLI- und Messablauf.

## 9. Abgrenzung

Phase 9.3 enthält ausdrücklich noch nicht:

- den vollständigen CoL-XR- oder WoRMS-Import,
- eine produktiv installierte Referenzdatenbank,
- Explorer-API-Routen oder Oberflächenfelder,
- automatische Änderung bestehender Arten,
- produktive Übernahme in `species_list.json`,
- Lightroom-Anbindung,
- Verteilung auf mehrere Computer,
- neue Squarespace-Dateien oder ein Pages-Deployment der Referenzdaten.

## 10. Übergabe an Phase 9.4

Phase 9.4 entwirft Bedienung und lokale API vor dem Umbau des Neue-Art-Assistenten. Verbindlich zu klären sind:

- Reichsauswahl mit `Tiere (Animalia)` als Standard und bewusster Option `Alle`,
- Vorschläge nach jedem Zeichen mit kurzer Entprellung,
- getrennte Kennzeichnung von deutschem Namen, wissenschaftlichem Namen und Synonym,
- sichtbare Mehrdeutigkeiten ohne Vorauswahl,
- Detailvorschau mit Rang, Hierarchie, Quelle, Release und Vertrauensstufe,
- ausdrückliche Übernahme eines Treffers in die vorhandene Eingabeprüfung,
- manuelle Eingabe und Animalia.bio-Browserfallback,
- Offline-, fehlende-, beschädigte- und veraltete-Datenbankzustände,
- installierte Releaseversion, Updatehinweis und Rollbackmöglichkeit.

Erst der abgestimmte Entwurf aus Phase 9.4 gibt den vollständigen lokalen Import und Aktualisierungsworkflow in
Phase 9.5 frei.
