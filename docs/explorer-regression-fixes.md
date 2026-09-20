# Prüfabschluss: Artanlage und Namenswahl

Stand: 2026-09-20. Datierter technischer Prüfstand, kein Abschlussaudit.

## Befunde und Korrekturen

- Namenswahl in Explorer und Lightroom: Ein früherer aktiver Korrekturprüfwert enthielt die später hinzugekommene
  Master-ID-Bindung noch nicht. Dadurch wurden unveränderte Korrekturen als offen behandelt. Der gemeinsame Dienst
  akzeptiert dieses Altformat nur bei exakt identischen bisherigen Feldern und eindeutig bestätigter Identität in
  beiden aktiven Datenbanken; ein vorhandenes Overlay muss dieselben IDs enthalten. Vorschau/Status schreiben nichts.
- Suchtreffer: Nachgeladene CoL-Ergänzungen konnten die gleiche Masterart als zweite Zeile ohne Master-ID und
  ohne Namenswahl erneut einschieben. Die abschließende Zusammenführung unterdrückt eindeutige Doppelungen;
  ältere CoL-Auswahlen werden beim Detailabruf zur gleichen Masteransicht aufgelöst. Mehrdeutige IDs bleiben getrennt.
- Artanlage: Artentwurf und sein Sofortportrait laufen in der Sitzung nicht mehr nach zehn Minuten ab.
  Paralleländerungs-, Kollisions- und Einmalverwendungsschutz bleiben erhalten. Ein explizit verworfener Entwurf
  räumt nur seine temporären Dateien auf. Die laufende Wartung schützt noch registrierte Vorschaudateien.
- Karten: Der Neue-Art-Assistent bietet nun denselben lokalen JPEG-/PNG-Weg wie der Karteneditor, einschließlich
  Dateiauswahl und Drag-and-drop, Vorschau vor Übernahme und Assessment-ID-Prüfung. Eine lokale Datei verlangt
  keinen erneuten Abruf der Herkunfts-URL. Vorschaufehler geben keine Übernahme frei.
- Abschluss: Suchlauf-, Portraitübernahme-, Medienprüfungs- und Veröffentlichungsfehler werden nicht mehr hinter
  einer vermeintlich laufenden Anlage versteckt. Terminale Fehler geben das Fenster frei; eine wartende Assetprüfung
  kann ebenfalls geschlossen werden. Die bereits gespeicherte Art bleibt erhalten und wird nicht nochmals angelegt.
- Zähler: `Manuell geschützte Karten` bezeichnet die tatsächlich gespeicherten Schutzentscheidungen. Ein HTTP-403-
  Fehler allein ändert diesen Bestand nicht; bestehende Schutzmarkierungen wurden nicht verändert.

## Belege

- 35 gezielte Regressionstests bestanden: Namenswahl, Anbieterstandard, Art-/Asset-API, Assistent und Temp-Aufbewahrung.
- Zusätzlicher Oberflächenvertrag und die Verhaltensprüfungen nach abschließender Fehlerpfadkorrektur bestanden.
- Ein Artentwurf wurde über zwei simulierte Tage hinweg mit vorbereitetem Portrait erfolgreich gespeichert.
  Abbruch eines anderen Entwurfs, unveränderte Produktdaten vor Speicherung und doppelte Speicherung sind geprüft.
- Dateiimport und Drop, Quellenlink, explizite Übernahme, erfolgreicher Abschluss sowie Fehler auf Schritt 4 sind
  durch simulierte Bedienereignisse gegen den echten Assistentencode geprüft; lokale API-Tests verwenden Testdateien.
- Echter lokaler Bestand nur lesend geprüft: `Perdix perdix` akzeptiert die Vorschau `Rebhuhn`; bisher bevorzugt ist
  beim ersten Prüfstand `Feldhuhn`. Beim späteren read-only Vergleich am 20. September führen aktive Referenz und
  Master bereits `Rebhuhn` mit Alternative `Feldhuhn`. Das sind zwei zeitlich getrennte Beobachtungen;
  durch diese Reparatur wurde keine Namenswahl gespeichert und kein Foto zugewiesen.
- `node scripts/lightroom-plugin-contract.test.mjs`: 14 Tests bestanden.
- `npm.cmd run --silent quality:ci`: vollständig bestanden, Exitcode 0. Der zunächst eingeschränkte Lauf konnte
  keinen Windows-Hilfsprozess starten; mit freigegebener Testausführung bestanden die Prozesse. Zwei alte
  Oberflächenverträge für die bisherige Schließsperre und den reinen URL-Import wurden passend aktualisiert.
- Projektstatus synchronisiert. Produktive JSON-/Assetprüfungen bestanden. Squarespace-Footer und Custom-CSS
  geprüft: Nur lokale Explorer-Oberfläche betroffen, keine neue Squarespace-Version erforderlich.
- Nach der Suchkorrektur: realen CoL-/Masterbestand lesend mit nachgeladenem CoL-Treffer nachgestellt.
  Genau ein Treffer für `Perdix perdix`; alte CoL-ID und Master-ID führen zur selben Namensauswahl.
  Das vollständige Qualitätsgate bestand danach erneut mit Exitcode 0. Der UI-Test im laufenden Explorer
  bleibt ausdrücklich von dieser Dienst-/Datenprüfung getrennt.

## Grenzen und nächste Abnahme

Keine produktive Taxonomieaktivierung, keine Foto-/Assetänderung, kein Commit oder Push in diesem Reparaturschritt.
Der Lua-Stand bleibt 0.4.24.14; die Namenskorrektur liegt im gemeinsamen JavaScript-Dienst.
Zum Laden des neuen serverseitigen Codes den Explorer nach Abschluss eigener offener Eingaben einmal regulär
neu starten. Bei Lightroom das Zuweisungsfenster erneut öffnen. Die gewünschte Namenswahl anschließend bewusst
übernehmen und in beiden Programmen prüfen. Keine bereits vorhandene Art für einen Test erneut anlegen.

Die erneute tatsächliche Bedienabnahme durch Felix steht noch aus. Nicht gespeicherte Entwürfe sind weiterhin
sitzungsgebunden und nicht nach einem Explorer-Neustart wiederherstellbar. Regulärer automatischer IUCN-Abruf
und die getrennte Kennzeichnung von Herkunft und Pflegeschutz bleiben der letzte fachliche Punkt vor dem Audit.
Die schwere Paarprüfung ist inzwischen ausgelagert. Großbestand, Aufbewahrung und Platzbudget bleiben gemäß
[Master-Hintergrundaufbau](taxonomy-master-background-build.md) offen.
