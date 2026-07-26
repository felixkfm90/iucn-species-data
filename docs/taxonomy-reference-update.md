# Taxonomiereferenz aktualisieren und bestehende Arten abgleichen

Stand: 2026-07-26

Status: Phase 9.5 technisch umgesetzt; zwei reale Paketabweichungen wurden sicher erkannt und korrigiert,
die erneute ausdrückliche Installation steht aus

## Ziel

Der Arten-Explorer kann die neueste Catalogue-of-Life-XR-Referenz erkennen, vollständig lokal importieren,
technisch prüfen und atomar aktivieren. Die große Referenzdatenbank bleibt außerhalb von Git, GitHub Pages,
Squarespace und den produktiven Artdateien.

Eine Aktualisierung darf insbesondere keine vorhandene Art still umbenennen. Deshalb werden Referenzimport und
Projektabgleich strikt getrennt:

1. Eine neue Referenz wird in einem eigenen Arbeitsbereich heruntergeladen und importiert.
2. Schema, Relationen, Hierarchie, Suchindizes und Datenbankintegrität werden geprüft.
3. Alle vorhandenen Einträge aus `species_list.json` werden gegen den neuen Release verglichen.
4. Erst nach einem technisch erfolgreichen Vergleich wird der aktive Referenzzeiger atomar umgeschaltet.
5. `species_list.json`, `speciesData.json`, Namen, Slugs, Assetnamen, Assetordner und Overrides bleiben unverändert.

## Inhalt der lokalen Referenzdatenbank

Die SQLite-Referenz enthält aus dem jeweils aktivierten Catalogue-of-Life-XR-Release:

- akzeptierte Taxa aller enthaltenen Reiche mit stabiler Quellen-ID, Rang und Elternbeziehung,
- die vollständige verfügbare Hierarchie einschließlich vorhandener Zwischenränge wie Unterstamm oder Unterart,
- akzeptierte wissenschaftliche Namen, Autorenschaft, Synonyme und weitere Namensbeziehungen,
- gebräuchliche Namen einschließlich deutscher Namen, soweit sie im Quellrelease geliefert werden,
- Angaben zu ausgestorbenen Taxa, Umwelt und taxonomischem Code, soweit vorhanden,
- externe Identifikatoren aus dem Referenzpaket,
- Release, Quelldatensatz, Lizenz und Vertrauensstufe als Provenienz sowie
- normalisierte Präfix- und FTS5-Suchbegriffe für deutsche und wissenschaftliche Vorschläge.

Die Tabelle für einen späteren WoRMS-Abgleich ist vorbereitet, wird durch den reinen CoL-Vollimport aber noch nicht
automatisch befüllt. Projektfachdaten wie Größe, Gewicht, Lebenserwartung, IUCN-Kategorie, Population und Trend
sowie Karten, Sounds und Artportraits gehören bewusst nicht in diese Referenz. Sie verbleiben in den bestehenden
Projektdateien und Assetordnern.

## Prüfung beim Start

Beim Start des Arten-Explorers wird ausschließlich die kleine Release-Metadatenantwort von Catalogue of Life
abgerufen. Die Prüfung:

- läuft nicht blockierend im Hintergrund,
- verwendet einen lokalen Zwölf-Stunden-Cache,
- lädt kein vollständiges Exportarchiv herunter,
- beeinträchtigt den Explorer bei Netzwerkfehlern nicht und
- bietet bei fehlender oder veralteter Referenz einmalig direkt `Jetzt aktualisieren` oder `Später` an.

`Später` unterdrückt die Nachfrage für den aktuellen App-Start; der manuelle Auslöser im kompakten Bereich
`Datenbank-Aktionen > Taxonomiereferenz` bleibt verfügbar. Der vollständige Download beginnt erst nach einer
aktuellen Vorschau und ausdrücklicher Bestätigung.

## Download, Import und Aktivierung

Der Explorer reserviert vor einer Erstinstallation mindestens 12 GB freien Speicher. Das komprimierte Archiv darf
höchstens 2,5 GB groß sein. Beim sicheren Entpacken gelten zusätzlich Grenzen für Pfadtiefe, Dateianzahl,
entpackte Gesamtgröße und Kompressionsverhältnis; Pfadausbrüche und symbolische Links werden abgewiesen.
Entpacken und nachgelagerte Paketprüfung verwenden dieselbe Dateigrenze von 50.000 Einträgen. Der erste echte
CoL-XR-Download enthielt 21.100 Einträge und überschritt damit das anfänglich in beiden Stufen zu knapp angesetzte
Limit von 20.000. Der Lauf wurde vor Import und Aktivierung sicher beendet, alle Arbeitsdateien wurden entfernt und
keine Teilreferenz übernommen. Das vereinheitlichte Limit lässt den realen Umfang mit Sicherheitsreserve zu,
während Größen-, Kompressions-, Verschachtelungs- und Dateitypgrenzen unverändert gelten.

Der Vollimport:

- liest das ColDP-Paket streamend und in begrenzten Transaktionen,
- behandelt `NameUsage.tsv` als Pflichtdatei und `VernacularName.tsv` als optionale Datei,
- normalisiert die offiziellen ColDP-Namensräume `col:` und `clb:` beim Lesen der TSV-Kopfzeilen, sodass sowohl
  die unpräfixierten Testfixtures als auch reale ColDP-1.2-Exporte mit Spalten wie `col:ID`,
  `col:scientificName` und `clb:merged` denselben internen Feldvertrag verwenden,
- erzeugt eine lokale SQLite-Datenbank mit Präfix- und FTS5-Suchindex,
- validiert Schema, Fremdschlüssel, Elternbeziehungen, Zyklen, Suchindex und Manifest,
- installiert einen unveränderlichen Releaseordner und
- aktiviert diesen noch nicht, solange der Projektartenabgleich fehlt.

Die Oberfläche zeigt einen zusammengefassten Fortschritt für Download, Entpacken, Import, Indexierung,
Projektvergleich und Aktivierung. Taxonomieaktualisierung, normale Datenpipeline, Backup und schreibende
Assetoperationen dürfen nicht parallel laufen.

Nach erfolgreicher Aktivierung bleibt der Abschluss im Bereich `Taxonomiereferenz` sichtbar. Zusätzlich erscheint
ein einmaliges Bestätigungsfenster mit aktivem Release, importierten Taxa, wissenschaftlichen und gebräuchlichen
Namen sowie dem Hinweis, dass keine bestehenden Projektdaten automatisch verändert wurden. Nach einem Fehler
bleiben stattdessen die verständlich zusammengefasste Fehlerursache und die weiterhin aktive bisherige Referenz
eindeutig sichtbar; interne JavaScript-Stacktraces werden nicht in die Oberfläche übernommen.

## Konflikte bei vorhandenen Arten

Der Abgleich ordnet jede bestehende Art genau einer dieser Gruppen zu:

| Ergebnis | Darstellung | Automatische Änderung |
| --- | --- | --- |
| Wissenschaftlicher Name ist eindeutig akzeptiert | grün, eindeutig | keine |
| Bereits bestätigte Zuordnung über stabile CoL-Quellen-ID | grün, zugeordnet | keine |
| Bisheriger Name ist ein Synonym mit genau einem akzeptierten Ziel | gelber Umbenennungsvorschlag `Alt → Neu` | keine |
| Name verweist auf mehrere akzeptierte Taxa oder Synonymziele | rot, mehrdeutig mit Kandidaten | keine Auswahl |
| Name wird nicht eindeutig gefunden | rot, manuell prüfen | keine |

Fachliche Hinweise verhindern die Aktivierung der neuen Referenz nicht. Das ist sicher, weil die Referenz nur als
lokale Such- und Prüfhilfe dient und keine bestätigten Projektdaten überschreibt. Dagegen verhindern technische
Fehler beim Import, bei der Validierung oder beim Artenabgleich die Aktivierung vollständig; die bisherige
Referenz bleibt dann aktiv.

Einen eindeutigen Namensvorschlag übernimmt der Explorer nicht direkt. Soll er später fachlich bestätigt werden,
läuft die Änderung artweise über den bestehenden geschützten Umbenennungsworkflow mit Vorschau, Kollisionsprüfung,
Backup und bewusster Bestätigung. Mehrdeutige Treffer werden niemals vorausgewählt.

Kleine, ausdrücklich bestätigte Zuordnungen können in `species-reference-mappings.json` über die stabile
CoL-Quellen-ID festgehalten werden. Diese Datei ist versionierbar; die große reproduzierbare SQLite-Datenbank
dagegen nicht. Ändert Catalogue of Life später den akzeptierten Namen derselben Quellen-ID, bleibt die Zuordnung
erkennbar, ohne den Projektnamen automatisch anzupassen.

## Konfliktbericht

Jeder importierte Release erhält lokal eine Datei `project-conflicts.json`. Sie enthält:

- Release-ID und Prüfzeit,
- Anzahl eindeutiger, vorgeschlagener, mehrdeutiger und fehlender Zuordnungen,
- betroffene deutsche und wissenschaftliche Projektnamen,
- mögliche Zielnamen und Quellen-IDs sowie
- die verbindliche Aussage, dass keine Projektart automatisch verändert wurde.

Der Bericht wird nach einem Neustart erneut angezeigt, solange der betreffende Release aktiv ist. Er gehört zur
lokalen Referenzinstallation und nicht zum Git- oder Pages-Bestand.

## Rollback und Fehlerverhalten

Der aktive Zeiger wird erst nach erfolgreichem Import und Projektvergleich atomar ausgetauscht. Die zuvor aktive
Version bleibt als genau eine Rollbackversion erhalten. `Vorherige Version wiederherstellen` schaltet nur die
lokale Referenz zurück; Arten, Namen, Slugs und Assets bleiben unverändert.

Bei Download-, Speicher-, Entpack-, Import-, Prüf- oder Aktivierungsfehlern:

- bleibt die bisherige Referenz aktiv,
- erscheint eine verständliche Fehlermeldung,
- werden temporäre Arbeitsdateien bestmöglich entfernt und
- startet weder eine IUCN-/Assetpipeline noch ein Git-Commit.

## Lokaler Speicher

Der Referenzbestand liegt pfadunabhängig unter:

```text
%LOCALAPPDATA%\FN Wildlife Travel\Arten-Explorer\taxonomy
```

Er enthält Releaseordner, aktiven Zeiger, eine Rollbackversion, Versionsprüfungs-Cache und temporäre
Arbeitsverzeichnisse. Der Bestand ist reproduzierbar und gehört nicht in normale Projekt-ZIP-Backups. Die spätere
Verteilung auf mehrere Rechner wird in Phase 11 entschieden.

## Lokale API

Bestehende Leseendpunkte:

```text
GET  /api/taxonomy/status
GET  /api/taxonomy/kingdoms
GET  /api/taxonomy/search
GET  /api/taxonomy/taxa/:id
```

Verwaltungsendpunkte aus Phase 9.5:

```text
POST /api/taxonomy/update/preview
POST /api/taxonomy/update/start
POST /api/taxonomy/update/rollback
```

Alle Endpunkte verwenden die vorhandene localhost-, Origin- und Sitzungsgrenze des Arten-Explorers.

## Prüfungen

Fokussierter Test:

```powershell
npm.cmd run --silent test:taxonomy-maintenance
```

Der Testbestand deckt Releaseerkennung, Cache, URL-Grenzen, sicheren Vollimport, optionale Vernakularnamen,
offizielle `col:`-/`clb:`-Spaltennamen, Aktivierungssperre vor dem Artenvergleich, eindeutige Synonyme,
Mehrdeutigkeiten, fehlende Arten, stabile Quellen-ID-Zuordnungen, unveränderte Projektdateien, Fortschritt und
Rollback ab.

Ein mehrere Gigabyte großer Produktionsdownload ist bewusst kein automatischer Testbestand. Die Mechanik wird mit
der versionierten Fixture reproduzierbar geprüft; die erste echte Vollinstallation wird im Explorer ausdrücklich
gestartet und anschließend anhand von Release, Artabgleich und Suchstichproben kontrolliert.
