# Aufbewahrung temporärer Explorer-Dateien

Stand: 2026-10-05

## Aktueller Speicher- und Tempvertrag

Der gemeinsame dauerhafte Datenpfad ist standardmäßig `<Explorer-Ordner>/Daten`, technisch zentral
konfigurierbar; eine spätere Einstellungsoberfläche ist noch offen. Der finale gewünschte Programmname lautet
`D:\Arten-Explorer`. Der tatsächliche Kopier-/Übernahmestand und Rückweg stehen im
[Speicherumzugsvertrag](storage-migration.md). Datenbanken, Aufträge, eigene Entscheidungen und Prüfbelege
sind keine entbehrlichen temporären Dateien.

Neue eigene Test-, Upload-, Vorschau- und Downloadhilfsdateien liegen ausschließlich im programmlokalen
Tempbereich. Plug-in-Hilfsdateien liegen ausschließlich im eigenen Plug-in-Tempbereich. Eine Sitzung bindet
Eigentümer, registrierte Dateinamen, offene Operationen und Helferprozesse; Namen/Alter allein erlauben kein Löschen.

## Ablagen und Lebenszyklus

| Ablage | Inhalt | Sichere Abschlussgrenze |
| --- | --- | --- |
| `temp/explorer/<Sitzungs-ID>/` | Uploads, Karten-/Sound-/Porträtvorschauen und Medienhilfsdateien | nur registrierte entbehrliche Dateien nach Ende aller eigenen Operationen/Helfer |
| `temp/tests/s-<PID>-<Kennung>/` | isolierte Testfixtures, vom System-TEMP unabhängig | Tests schließen Leser/Server/Helfer und entfernen ihre eigenen Fixtures; beim Prozessende nur leere eigene Sitzung |
| `temp/benchmarks/` | ausdrücklich gestartete isolierte Mess-/Prototypenläufe | ausschließlich eigener validierter Lauf; Ergebnisse mit Nachweisbedarf erhalten |
| `<Plug-in>/temp/plugin/<Sitzungs-ID>/` | SDK-Export, Anfrage, Antwort, Befehlsdatei und Log | Operations-/Helferfreigabe; beim Shutdown/Reload keine noch aktive Operation löschen |
| `species-explorer/pipeline-asset-backups/` | Rücksicherung einer offenen Medienentscheidung | dauerhafter Review-/Wiederherstellungszustand, nicht beim Schließen pauschal löschen |
| `species-explorer/creation-sessions/` | Herkunft und bestätigter Abbruch eigener unveröffentlichter Artanlagen | dauerhafter Fortsetzungs-/Rücknahmebeleg; Git-/Pages-ignoriert, nicht beim Schließen als Temp entfernen |
| bisherige gemeinsame `staging/`, `cleanup-trash/`, Testlauf-Browserreste | alte Ablagen ohne unabhängigen Prozessnachweis | nur inventarisieren/erhalten; kein Leeren allein nach Dateimuster oder 24 Stunden |

`temp-session.mjs` verwaltet Laufzeitsitzungen. Kontrolliertes Schließen verweigert neue Operationen und
wartet auf die bestehenden eigenen Operationen/Helfer. Es entfernt einzelne registrierte reguläre Dateien,
niemals pauschal den gesamten Tempbaum. Dauerhafte, fremde, verschachtelte oder unbekannte Inhalte bleiben
einschließlich ihres Eigentumsnachweises erhalten. Verzeichnislinks und Pfadüberschreitungen sind gesperrt.
Sperrfehler bleiben sichtbar im Ergebnis; unbekannter Prozesszustand zählt nicht als beendeter Prozess.

Nach Absturz darf eine Sitzung nur bereinigt werden, wenn Eigentümer und alle Helfer nachweislich beendet sind.
Eine lebende wiederverwendete PID wird konservativ erhalten. Beim Plug-in bleibt ein nicht sicher ermittelter
Lightroom-Eigentümer unbekannt; normale Operationen können ihre belegten eigenen Dateien trotzdem freigeben.
Ein einmal bestätigter Besitzeranker verhindert wiederholte teure Prozesssuche pro Anfrage.

`PluginShutdown.lua` läuft auch bei Reload/Deaktivierung und beweist nicht, dass Lightroom oder sein Katalog
geschlossen ist. Diese Tempfreigabe darf deshalb keinen Update-/Katalognutzungsnachweis ersetzen.
SDK-Ortsexporte behalten ihre Sperre bei unklarer Rendererbeendigung; Helferdateien werden nicht unter einem
noch laufenden Hilfsprozess gelöscht. Wiederholtes Explorer-Schließen nutzt dieselbe vollständige Schließoperation.

## Testwerkzeuge und Sicherungen

[Test- und Messpfade](test-temp-contract.md) beschreiben die isolierten Fixtures und begrenzten Messziele.
Neue freie Ablagen unter `Testlauf` oder Windows-Temp wurden in den betroffenen Werkzeugen abgelöst.
Vorhandene historische Reparaturskripte/-belege bleiben unverändert; sie werden nicht allein wegen ihres Namens
zu Datenmüll erklärt. Atomare Übernahmedateien unmittelbar neben ihren endgültigen Zielen bleiben ein Bestandteil
des sicheren Dateischreibens, nicht frei herumliegende Testdateien.

Git/Pages und Quellscanner schließen die dauerhaften lokalen Daten sowie Temp aus.
Ein vollständiges NAS-Backup enthält Daten und Speicherkonfiguration, aber keine Temp-Sitzungen.
Es bindet den Datenstand vor/nach dem Backup; geänderte Daten trotz gleichem Git-Commit sind nicht bereits gesichert.
Ein externer Datenpfad verlangt einen passenden Sicherungsvertrag statt stillen unvollständigen Erfolg.

## Bestätigter Altbestand

Die vier von Felix freigegebenen Altbestände wurden bereits ohne Überschreiben nach
zunächst nach `D:\IUCN_Datenbank\temp\altreste-2026-10-04` verschoben. Mit dem anschließend bestätigten
Programmordnerwechsel liegt derselbe Bestand unter `D:\Arten-Explorer\temp\altreste-2026-10-04`:

| Ursprüngliche Quelle unter Testlauf | Dateien | Bytes |
| --- | ---: | ---: |
| `lifelistxp-guide` | 12 | 2.480.070 |
| `sound-cut-real` | 1 | 557.324 |
| `master-server-20260905-074752.stderr.log` | 1 | 168 |
| `master-server-20260905-074752.stdout.log` | 1 | 109 |
| Gesamt | 15 | 3.037.671 |

Alle 15 SHA-256-Prüfwerte/Größen sind identisch; die ursprünglichen vier Quellen sind nicht mehr vorhanden.
Nichts gelöscht. `verschiebung.json` im Ziel enthält Quell-/Ziel-/Prüfwertzuordnung und Rückweg.
Dieser belegte Altordner wird nicht als neue entbehrliche Sitzung adoptiert oder beim Schließen gelöscht.
Reparaturentscheidungen, gemeinsame Paarprüfbelege und andere noch benötigte Dateien sind ausdrücklich ausgeschlossen.

## Bedienung und Prüfgrenzen

`npm.cmd run temp:check` zeigt den sicheren verwalteten Zustand ohne Löschung;
`npm.cmd run temp:cleanup` bereinigt ausschließlich belegte beendete eigene Sitzungen.
`npm.cmd run test:temp` prüft Eigentum, aktive/unbekannte Prozesse, Links, Pfadgrenzen, Hilfsprozessende,
Abbruch/Wiederholung, Umzug und Rückfall. Echte SDK-/Windows-Bedienabnahme bleibt von diesen isolierten
Gegenproben getrennt. Keine produktive Bereinigung alter ungebundener Review- oder Reparaturbestände zur Umsetzung.
