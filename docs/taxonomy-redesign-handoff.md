# Codex-Übergabe: Taxonomie-Pyramide modernisieren

Stand: 2026-07-11

## Ziel

Die bisherige dynamische Taxonomie-Pyramide auf den Squarespace-Artseiten soll durch eine moderne, responsive HTML-/CSS-Komponente ersetzt werden. Die beigefügte Konzeptgrafik ist die visuelle Referenz, aber **kein** fertiges Frontend-Asset.

![Konzeptgrafik der modernisierten Taxonomie](./concepts/taxonomy-pyramid-redesign-concept.svg)

Konzeptdatei: `docs/concepts/taxonomy-pyramid-redesign-concept.svg`

## Verbindliche Grundentscheidung

- Die Taxonomie bleibt datengetrieben und wird weiterhin durch `species-taxonomy.js` aus `speciesData.json` gerendert.
- Das Konzeptbild dient nur als Designvorgabe.
- Keine artweise erzeugten Taxonomie-PNGs oder andere statische Bildvarianten einführen.
- Die bestehende Squarespace-Container-ID `#species-taxonomy` bleibt erhalten.
- Die neue Darstellung muss ohne Änderung am vorhandenen Squarespace-Codeblock funktionieren.

## Gewünschte Hierarchie

Die Ausgabe soll bis zu acht Stufen enthalten:

| Rang | Beispielwert im Konzept |
|---|---|
| Reich | Tiere |
| Stamm | Chordatiere |
| Unterstamm | Wirbeltiere |
| Klasse | Vögel |
| Ordnung | Spechtvögel |
| Familie | Tukane |
| Gattung | Ramphastos |
| Art | Sulfuratus |

Die Beispielwerte beziehen sich auf `Ramphastos sulfuratus`. Produktiv müssen je Art die zugehörigen dynamischen Werte erscheinen.

## Sprach- und Schreibregeln

- Rangbezeichnungen links vollständig deutsch: `Reich`, `Stamm`, `Unterstamm`, `Klasse`, `Ordnung`, `Familie`, `Gattung`, `Art`.
- Werte rechts nach Möglichkeit deutsch anzeigen.
- Jeder sichtbare Wert beginnt entsprechend der freigegebenen Gestaltung mit einem Großbuchstaben.
- Technische Leerwerte wie `n/a`, leere Strings, `unknown` oder `undefined` niemals sichtbar ausgeben.
- Die Konzeptvorgabe schreibt bei der Art `Sulfuratus` mit großem Anfangsbuchstaben. Das ist eine bewusste UI-Vorgabe und weicht von der biologischen Schreibkonvention für das Artepitheton ab. Nicht eigenmächtig auf Kleinschreibung umstellen.

## Datenmodell und Unterstamm

Der aktuelle Datenbestand enthält regulär:

- `Kingdom`
- `Phylum`
- `Class`
- `Order`
- `Family`
- `Genus`
- `Species`

Ein Feld für den Unterstamm gehört derzeit nicht zum regulären Schema. Vor der Umsetzung prüfen, ob der IUCN-Taxon-Datensatz ein verlässliches Feld wie `subphylum_name` liefert.

### Bevorzugte Lösung

1. Liefert die IUCN-API einen stabilen Unterstammwert, diesen in `update.mjs` als `Subphylum` übernehmen.
2. `emptyEntry()` ebenfalls um `Subphylum: "n/a"` ergänzen.
3. `normalizeTaxonomyFields()` um `Subphylum` erweitern.
4. Bestehende Datensätze kontrolliert migrieren oder durch einen Pipeline-Lauf aktualisieren.

### Kein abgeleiteter Fallback

Falls IUCN keinen echten Unterstammwert liefert, wird die Stufe für diese Art vollständig ausgeblendet. Weder `Wirbeltiere` noch ein anderer Unterstamm darf aus Klasse, Stamm oder anderen Taxonomiefeldern abgeleitet oder pauschal hartcodiert werden. Dadurch bleiben auch andere mögliche Unterstämme fachlich korrekt behandelbar.

Die Darstellung muss deshalb mit sieben oder acht Stufen stabil funktionieren. Eine fehlende Unterstamm-Zeile wird vollständig entfernt; es darf keine leere farbige Stufe entstehen.

## Deutsche Taxonomiewerte

Die wissenschaftlich eindeutigen Rohwerte sollen erhalten bleiben. Deutsche Anzeigenamen werden über eine zentrale, erweiterbare Zuordnung erzeugt und nicht durch verteilte Einzelbedingungen im DOM-Code.

Beispiel:

```js
const TAXONOMY_TRANSLATIONS = {
  Animalia: "Tiere",
  Chordata: "Chordatiere",
  Vertebrata: "Wirbeltiere",
  Aves: "Vögel",
  Piciformes: "Spechtvögel",
  Ramphastidae: "Tukane",
};
```

Nicht vorhandene Übersetzungen fallen kontrolliert auf den normalisierten wissenschaftlichen Wert zurück. Die Komponente darf wegen einer fehlenden Übersetzung nicht ausfallen.

## Visuelles Soll

Die Konzeptgrafik ist die maßgebliche optische Referenz. Umzusetzen sind insbesondere:

- links ein vertikaler blauer Pfeil mit der Beschriftung `Taxonomie`, Pfeilrichtung nach unten;
- daneben pro Stufe ein heller, abgerundeter Rangbereich mit Icon und deutscher Rangbezeichnung;
- zwischen Rangbereich und Wert eine schmale farbige Akzentlinie;
- rechts farbige, abgerundete und nach unten schmaler werdende Stufen;
- dezente Schatten und leichte Tiefenwirkung, keine überladene 3D-Optik;
- klare kontrastreiche Typografie;
- gleichmäßige vertikale Abstände und saubere Ausrichtung aller Zeilen;
- optional dezente dekorative Symbole innerhalb der farbigen Stufen, sofern sie ohne externe Bildabhängigkeiten umgesetzt werden können.

Icons vorzugsweise als lokale Inline-SVGs, CSS-Masken oder einfache CSS-Formen umsetzen. Keine externen Icon-CDNs und keine neuen Drittanbieter- oder Trackingdienste einführen.

## Voraussichtlich betroffene Dateien

- `species-taxonomy.js`
- `update.mjs`, falls `Subphylum` in das Datenmodell aufgenommen wird
- `speciesData.json`, nur als kontrolliertes Pipeline- oder Migrationsergebnis
- `docs/squarespace-custom.css`
- `docs/squarespace-footer.html`, falls die Version von `species-taxonomy.js` erhöht wird
- `README.md`
- `AGENTS.md`
- `docs/roadmap.md`
- dieses Dokument

## JavaScript-Anforderungen

- Bestehendes `escapeHtml()` beibehalten oder gleichwertig absichern.
- Stufen aus einer Datenstruktur erzeugen, nicht acht fast identische HTML-Zeilen fest verdrahten.
- Nur Stufen mit verwertbarem Wert rendern.
- Die bisherige textbasierte Breitenmessung `adjustPyramidWidth()` darf ersetzt werden, wenn CSS die Breiten responsiv und stabil steuert.
- Resize-Listener nur verwenden, wenn CSS allein nicht ausreicht.
- Keine globalen Variablen außerhalb des bestehenden Modulrahmens einführen.

Empfohlene Struktur:

```js
const levels = [
  { key: "Kingdom", rank: "Reich", className: "kingdom", icon: "crown" },
  { key: "Phylum", rank: "Stamm", className: "phylum", icon: "branch" },
  { key: "Subphylum", rank: "Unterstamm", className: "subphylum", icon: "spine" },
  { key: "Class", rank: "Klasse", className: "class", icon: "column" },
  { key: "Order", rank: "Ordnung", className: "order", icon: "hierarchy" },
  { key: "Family", rank: "Familie", className: "family", icon: "group" },
  { key: "Genus", rank: "Gattung", className: "genus", icon: "sprout" },
  { key: "Species", rank: "Art", className: "species", icon: "leaf" },
];
```

## CSS-Anforderungen

- Produktive CSS-Referenz bleibt `docs/squarespace-custom.css`.
- Alle Klassen unter `#species-taxonomy` beziehungsweise einem eindeutigen Modul-Root scopen.
- Keine ungescopten generischen Klassen wie `.row`, `.icon` oder `.label` verwenden.
- Desktop und Mobilansicht getrennt prüfen.
- Der Rahmen muss weiterhin mit der bestehenden Modulspalte in `#species-output` harmonieren.
- Die Darstellung darf Info- und Statusspalte nicht unkontrolliert verbreitern.

## Responsives Verhalten

### Desktop

- Drei klar erkennbare Bereiche: Pfeil, Rangspalte, Wertstufen.
- Alle acht Stufen innerhalb des vorhandenen Taxonomie-Rahmens lesbar.
- Keine abgeschnittenen Texte und keine horizontale Überlappung.

### Mobil

- Innerhalb der vorhandenen einspaltigen Mobilansicht funktionieren.
- Pfeil und Rangspalte dürfen schmaler werden.
- Lange Werte dürfen die Komponente nicht sprengen. Bevorzugt Schriftgröße mit `clamp()` reduzieren; nur falls erforderlich kontrolliert umbrechen.
- Keine horizontale Seitenscrollleiste erzeugen.

## Barrierefreiheit

- Taxonomiewerte bleiben als echter Text im DOM.
- Dekorative Icons mit `aria-hidden="true"` kennzeichnen.
- Sinnvolle Gruppenstruktur verwenden, beispielsweise Liste oder `role="list"` und `role="listitem"`.
- Farbkontrast der weißen Schrift gegen jede Stufenfarbe prüfen.
- Die visuelle Pfeilrichtung darf nicht die einzige semantische Information sein.

## Test- und Abnahmeplan

Mindestens prüfen:

1. Syntax:
   - `node --check species-taxonomy.js`
   - bei Pipeline-Änderung `node --check update.mjs`
2. Datenfälle:
   - Art mit acht vollständigen Stufen;
   - Art ohne Unterstamm;
   - fehlende deutsche Übersetzung;
   - technischer Leerwert beziehungsweise `n/a`;
   - sehr langer Familien-, Gattungs- oder Artname.
3. Layout:
   - lokale Squarespace-nahe Vorschau mit `npm.cmd run --silent preview:squarespace` starten;
   - Desktop in der bestehenden Drei-Spalten-Artseite;
   - Tablet;
   - Smartphone unter 768 Pixel;
   - keine horizontale Scrollleiste;
   - Pfeilhöhe und Zeilenausrichtung stimmen.
4. Live-Pfad nach Deployment, beispielsweise:
   - `/wildlife/heimische-tierwelt/acanthisflammea`
   - eine Costa-Rica-Art, insbesondere Fischertukan, falls aktiv.
5. Cache und Versionierung:
   - Umsetzung ausschließlich im Phase-8-Arbeitsbranch;
   - lokale Vorschau und anschließend nicht öffentlich verlinkte Squarespace-Testseite abnehmen;
   - ausdrückliche Freigabe durch Felix abwarten;
   - erst danach nach `main` übernehmen;
   - GitHub-Pages-Deployment abwarten;
   - erst danach `species-taxonomy.js?v=...` in Squarespace beziehungsweise `docs/squarespace-footer.html` erhöhen;
   - Live-Seite erneut prüfen.

Der verbindliche Ablauf und die Rückfallregel stehen in `docs/phase-8-preview-release.md`. Ohne ausdrückliche
Freigabe bleibt der produktive Squarespace-Footer unverändert.

## Akzeptanzkriterien

Die Aufgabe ist abgeschlossen, wenn:

- die alte Taxonomie-Pyramide durch die neue dynamische Komponente ersetzt ist;
- alle sichtbaren Rangbezeichnungen deutsch sind;
- deutsche Werte verwendet werden, sofern eine zentrale Übersetzung vorhanden ist;
- `Unterstamm` ausschließlich aus einem tatsächlich vorhandenen Datenwert eingebunden und andernfalls vollständig ausgeblendet ist;
- sieben und acht Stufen ohne Leerzeile funktionieren;
- die Komponente auf Desktop und Mobil ohne Überlauf lesbar ist;
- kein statisches Taxonomie-Bild als funktionaler Ersatz eingebaut wurde;
- GitHub Pages und Squarespace live geprüft wurden;
- `README.md`, `AGENTS.md`, `docs/roadmap.md`, `docs/squarespace-custom.css` und gegebenenfalls `docs/squarespace-footer.html` auf den echten Endstand gebracht wurden.

## Nicht Teil dieser Aufgabe

- Artportrait auf der Squarespace-Artseite einbinden.
- Andere Module optisch neu gestalten.
- Taxonomie im Arten-Explorer bearbeitbar machen.
- Externe Iconbibliotheken oder neue Drittanbieterdienste einführen.
- Wissenschaftliche Rohwerte durch ausschließlich deutsche Werte ersetzen.
