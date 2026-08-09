# Phase-9-Abschlussaudit – realer Taxonomie-Master

Stand: 2026-08-09

Status: bestanden

## Einordnung und Umfang

Dieses Dokument ist der maßgebliche Abschlussbericht für Phase 9. Das frühere
`docs/audits/2026-08-phase-9-audit.md` bleibt eine historische Aufnahme des kleinen technischen Masterbestands
vom 1. August 2026. Geprüft wurden nun der breite reale Offline-Master, seine vollständige Quellen- und
Feldprovenienz, die 54 produktiven Projektarten, die Explorer-Integration, Datei- und Temporärstruktur,
Dokumentation, Aktivierung, Wiederherstellung und das repositoryweite Qualitätsgate. Lightroom gehört erst zu
Phase 10.

## Praktisch geprüfte Architektur

Die Datenhaltung ist physisch und fachlich getrennt:

1. Die vollständige CoL-XR-Referenz bleibt unverändert und read-only unter dem lokalen Anwendungsdatenpfad.
2. iNaturalist, GBIF, WoRMS, Wikidata und kontrollierte Animalia-Fälle liegen als versionierte Anbieterstände vor.
3. Projektarten und eigene Korrekturen bilden separate, höher priorisierte Aussagen.
4. Ein neuer Master wird vollständig in `staging` aufgebaut, mit Schema-, Inhalts-, Konflikt- und Projekttests
   geprüft und erst danach atomar als `active` aktiviert.
5. Die zuvor aktive Version bleibt genau einmal als `previous` erhalten und kann ohne Änderung von Projekt-Slugs,
   Artdateien oder Assets wiederhergestellt werden.

Jede zusammengeführte Namens-, Rang- und Hierarchieaussage behält Anbieter, Anbieter-ID, Quellenstand und
Zeitpunkt. Stabile anbieterunabhängige Master-IDs verbinden diese Aussagen mit genau einer Art. Der Explorer liest
bevorzugt den aktiven Master und fällt bei fehlendem oder unbrauchbarem Master sicher auf die CoL-Referenz zurück.

## Reale Migration und Datenbestand

Aktiver Kandidat: `master-20260809091930709`

Aktive Quellenstände:

- CoL XR `col-xr-2026-07-17-315834`: 4.639.747 importierte Quelldatensätze;
- iNaturalist `inat-dwca-20260808-cache-master-v2-col-fb1a55d84073`: 273.476 relevante Taxa;
- GBIF: 1.340 relevante Aussagen;
- WoRMS: 76 relevante Aussagen;
- Wikidata: 99 relevante Aussagen;
- kontrollierter Animalia-Stand: derzeit 0 zusätzliche Taxa;
- Projektbestand: 54 Arten;
- eigene manuelle Korrekturen: 1 Quellenstand.

Der aktive Master enthält:

- 273.505 Master-Taxa;
- 430.675 Anbieteraussagen;
- 1.762.462 Namen und 707.152 Aliasse;
- 4.665.388 Feldprovenienzen;
- 7.108.393 vorbereitete Suchbegriffe;
- 155.684 Zustände `col-confirmed`;
- 117.821 Zustände `col-reference-gap`;
- 174 Zustände `externally-confirmed`;
- 17 Zustände `manually-protected`.

Alle 54 Projektarten sind eindeutig verknüpft. Es gibt keine fehlende Projektverknüpfung und keine Abweichung
zwischen verknüpftem wissenschaftlichem Namen und Projektart.

## Praktische Beispiele

- `Sciurus vulgaris`: genau eine stabile Master-Art mit `col-reference-gap`. GBIF und iNaturalist bestätigen die
  Art, Wikidata beziehungsweise die eigene Korrekturschicht liefern den gebräuchlichen Namen. Der bestehende
  Projekt-Slug bleibt unverändert. Ein späterer exakter CoL-Beleg schließt dieselbe Lücke, statt eine zweite Art
  anzulegen.
- `Coracias caudatus`: exakter Arttreffer mit lokaler deutscher, englischer und wissenschaftlicher Suche sowie
  vollständiger Hierarchie einschließlich vorhandener Zwischenränge.
- `Panthera pardus`: exakter CoL-Taxonbeleg, ergänzende externe Namen/IDs und ein nachvollziehbarer manueller
  Schutz können gleichzeitig an derselben Master-ID liegen.
- `Calidris alpina`: CoL bleibt Primärbeleg; relevante GBIF-, iNaturalist-, WoRMS- und Wikidata-Aussagen ergänzen
  Namen und Kennungen, ohne die CoL-Hierarchie still zu überschreiben.

Die exakten Offline-Suchen für diese repräsentativen Fälle benötigten jeweils etwa 1 bis 7 ms. Die Prüfung aller
54 Projektarten lief in rund 76 ms beziehungsweise durchschnittlich rund 1,4 ms je Art.

## Aktivierung, Rollback und Speicher

Der Kandidat wurde real aktiviert. Danach wurde die vorherige Version mit dem produktiven Lebenszykluskommando
wiederhergestellt und der geprüfte Kandidat erneut als aktiv verifiziert. `active` und `previous` enthalten jeweils
eine rund 5.773 MiB große SQLite-Datei. Der gesamte Masterbereich einschließlich Anbieterständen belegt rund
12.453 MiB in 34 Dateien. `staging` und `work` waren nach Erfolg und Rollback leer.

Ein Kandidat mit ungültigem Schema, blockierendem Konflikt oder unvollständiger Projektverknüpfung kann den aktiven
Stand nicht ersetzen. Der Rollback verändert weder `species_list.json`, `speciesData.json`, URL-Slugs noch
Assetordner.

## Auditbefunde und Bereinigung

Während des Abschlussaudits wurden folgende reale Befunde behoben:

- Der Kandidatenaufbau hielt zuvor sämtliche ausgewählten Feldaussagen der vorherigen Millionen-Datenbank im
  Arbeitsspeicher und überschritt selbst ein 8-GiB-Heap-Limit. Der Abgleich liest die benötigten Felder nun
  indexiert pro Master-Taxon aus der geöffneten read-only Vorversion. Der reale Neuaufbau ist damit abgeschlossen.
- Anbieterwerte `Animal` und `Viridiplantae` führten zu uneinheitlichen Master-Reichen. Sie werden an der
  Mastergrenze zu `Animalia` beziehungsweise `Plantae` normalisiert.
- Vier externe Ergänzungstaxa besaßen keinen Reichswert. Ein Reich wird nun ausschließlich aus einem eindeutig
  konsistenten CoL-Gattungsbeleg ergänzt. Die ursprüngliche leere Anbieteraussage bleibt als Rohprovenienz erhalten.
- Temporäre Diagnose-, Prototyp-, Snapshot- und Smoke-Testartefakte unter `Testlauf/` wurden nach der Prüfung
  entfernt. Der produktive lokale Taxonomiebereich enthält keine zurückgebliebenen Staging- oder Work-Dateien.
- Parallele Versionsprüfungen konnten denselben temporären Namen für `release-check.json` verwenden und unter
  Windows einen transienten `EPERM`-Fehler hinterlassen. Atomare JSON-Schreibvorgänge werden nun je Zieldatei
  serialisiert, verwenden zusätzlich eine UUID im temporären Dateinamen und räumen Zwischenstände auch im
  Fehlerfall auf. Ein Paralleltest mit zwölf Schreibvorgängen sichert diese Betriebsgrenze ab. Der reale Explorer
  schrieb den Cache anschließend im freigegebenen AppData-Pfad fehlerfrei; `latestCheckError` blieb leer.
- Veraltete Dokumentationsaussagen zum laufenden Neuaufbau und ausstehenden Audit wurden auf den realen
  Abschlussstand gebracht. Das historische Audit wurde nicht nachträglich umgeschrieben.

Es verbleibt kein blockierender Phase-9-Befund. Die spätere Installer-Phase 11 bewertet erneut, ob der große
Taxonomiepfad unter `%LOCALAPPDATA%` bleibt oder kontrolliert auswählbar wird; das ist bewusst keine offene
Phase-9-Funktion.

## Tests und Qualitätsgate

Direkt bestanden sind die fokussierten Taxonomie-, Wartungs- und Explorer-Prüfungen. Sie decken unter anderem
Masterkandidat, Feldprovenienz, Anbieterstände, `Sciurus vulgaris`, Reichsnormalisierung, Aktivierung, Rollback,
Offline-Suche, Explorer-Rückfall und parallele atomare Cache-Schreibvorgänge ab. Die jeweils aktuelle Anzahl wird
nicht als dauerhafter Dokumentationswert festgeschrieben; maßgeblich ist der erfolgreiche Testlauf im
repositoryweiten Qualitätsgate.

Zusätzlich wurden ausgeführt:

```text
npm.cmd run --silent taxonomy:master:verify -- --taxonomy-root=<lokaler AppData-Pfad> --json
npm.cmd run --silent taxonomy:master:migrate -- --taxonomy-root=<lokaler AppData-Pfad> --rollback-only
npm.cmd run --silent quality:ci
```

Das vollständige Qualitätsgate prüft Syntax, Stil, Dokumentationsverweise, Schemata, alle automatisierten Tests,
Audio- und Assetkonsistenz, flexibles Größenbudget, Projektstatus und den lokalen Site-Audit. Änderungen an
Squarespace-JavaScript oder -CSS waren für den Masterabschluss nicht erforderlich; Footer- und CSS-Versionen
bleiben deshalb unverändert.

## Abschluss

Phase 9 ist vollständig abgeschlossen. Die lokale Masterdatenbank ist real aufgebaut, aktiv, offline nutzbar und
rollbackfähig. Code, Datenmodell, Ordnerstruktur, Dokumentation, Tests und Betriebsablauf besitzen einen
konsistenten freigegebenen Stand. Der nächste große Arbeitsschritt ist Phase 10: Lightroom-SDK- und
Metadaten-Machbarkeitsprüfung, anschließend Architekturentscheidung und ein read-only MVP.
