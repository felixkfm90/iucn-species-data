# Datenwechsel und Artassistent – technischer Prüfabschluss

Stand: 2026-10-04

## Umfang und Ergebnis

Felix beauftragt die offenen Vor-Audit-Arbeiten bei geschlossenem Explorer/Lightroom und zusätzlich den
Goldbaumsteiger-Befund. Keine produktive Art erneut angelegt, kein Anbieterupdate/Masteraufbau, keine neue
Taxonomieaktivierung, Foto-/Projektmigration oder Katalogaktion durch diese Umsetzung.

Der geführte Artassistent hält auch ohne automatisch gefundenes Medium vor Veröffentlichung an. Kartenimport
oder Überspringen und anschließender expliziter Sound-Abschluss sind erreichbar. Erneute Soundsuche bleibt
artbezogen bestätigt. Derselbe gespeicherte Reviewauftrag ist nach Schließen wieder aufnehmbar, ohne zweite
Artanlage. Ein fehlendes Kartenasset bleibt ein Veröffentlichungsblocker; lokale restliche Schritte werden
nicht dadurch übersprungen. Bestehender Goldbaumsteiger wurde nicht verändert.

Lokaler Plug-in-Quellstand **0.4.24.21** mit zentralem Speicherresolver und eigenen prozessgebundenen Temp-
Sitzungen. Historische 187 Zurückstellungen neutral als Erhalt bisheriger Zuordnungen dargestellt, keine
Lockerung von Identitäts- oder Aktivierungssperren. Die Karten-Dokumentationszählung erkennt jetzt auch den
alten ausgeschriebenen Einleitungssatz; sechs geschützte Karten, davon fünf deklarierte IUCN-Browserimporte
und eine eigene Pflege/Altmarkierung. Kein neuer automatischer IUCN-Download belegt.

## Produktiver Datenwechsel

207 Dateien/98.603.910.132 Bytes vom alten AppData-Datenordner nach `D:\IUCN_Datenbank\Daten` übernommen.
Erst vollständige Kopie und SHA-256-Vergleich, dann nach Gesamtgate/frischem unabhängigen Schließnachweis
vollständige Zielprüfung und Einzelprüfung jedes Originals unmittelbar vor dessen Entfernung.
Alle 207 Originaldateien einzeln entfernt, leere Unterordner entfernt; alter AppData-Wurzelordner leer, kein Link.
Journal `committed`, Konfiguration `ready`; keine alte AppData-Rückfallkopie. Originalbelege/Revisionswerte
bytegleich am Ziel, verifizierte Zugriffsprojektion statt geänderter Herkunftsbelege.

Lesende Nachprüfung am neuen Ort:

| Ebene | Bestätigter unveränderter Stand |
| --- | --- |
| Referenz und Masterherkunft | `col-xr-2026-09-25-316441` |
| Master | `master-20261003055911210` |
| Paket | `lightroom-fa739bd28ec1e82a0283`, 273.476 Taxa |
| Gemeinsame Veröffentlichung | `publication-b64beeb2-9951-4cf0-ac4e-1a326c5c3e91` |
| Vorgänger | `publication-60f9b546-49ee-4c65-ada9-7b57b965b120` |
| Versionsvergleich | `current`, keine Herkunfts-/Paketabweichung |
| Reale Suchhilfe | Weissstorch und Rebhuhn mit eigener Namenswahl und bestehenden Master-IDs gefunden |

Bytegleicher Umzug erhält die zuvor geprüften IDs/Namen/Projektlinks; kein erneuter vollständiger
fachlicher Identitätsvergleich in diesem Schritt behauptet. Aktueller Projektstatus: 61 Arten, 61 Karten,
61 Porträts, 58 Sounds, keine Asset-/Validierungsprobleme. Goldbaumsteiger ohne Tierstimme laut aktuellem
Bestand; nicht als neuer erfolgreicher Sounddownload ausgeben.

## Automatisierte Prüfung

`npm.cmd run --silent quality:ci`: **Exit 0, 50 Gruppen, 1.177 gemeldete Tests**, keine Fehler/Abbrüche/Skips.
Nach produktivem Datenwechsel und zusätzlicher Sound-Abschlusskorrektur vollständig mit identischem
Ergebnis wiederholt; Dokumentationsprüfung 78 Markdown-Dateien ohne fehlende lokale Verweise.
Darunter 423 Master-/Betriebs- und 239 Lightroom-/Pakettests. Syntax 389 Dateien, Stil/Schema,
Dokumentationsverweise, Audio/Medien, Größenbudget, generierter Status und lokaler Websitecheck bestanden.
Der Websitecheck im Gate verwendet `--skip-live --skip-pages`; kein Live-Website- oder Pages-Nachweis daraus.

Gezielt bestanden: Temp/Umzug 40/40, Explorer-Betrieb 26/26, Assistent-UI 11/11, neuer Pipelinevertrag 1/1,
Karten-Dokumentation 4/4. Plug-in-Vertrag nach produktivem Datenwechsel erneut 21/21.
Zahlen überschneiden sich mit dem Gesamtgate, nicht zusammenaddieren.
Zusätzliche positive Soundsuche ohne aktuelle Medienentscheidung mit gebundenem Auftrag, gezielter
Ablehnungsfreigabe, Datei-/Fremdschutz und anschließendem lokalem Abschluss geprüft: 17/17 gezielte Tests.
Dabei eine Abkürzung im leeren Sonder-Soundlauf behoben; die noch fehlende Karte wird auch danach weiterhin
als offene Übertragung ausgewiesen, ohne lokale Artanlage oder übrige Schritte erneut auszuführen.

Prüfung umfasst echte isolierte Hilfsprozesse und vorhandene Wiederanlauf-/Paar-/Rollback-Gegenproben.
Nach dem produktiven Pfadwechsel zusätzlich der zusammenhängende 5.000-Arten-Betriebscheck bestanden:
harter eigener Workerabbruch bei Checkpoint 500, Fortsetzung, 4.940 wiederverwendete Taxa, inkrementelles
Paket fachlich gleich Vollpaket, offene alte Leser und eigene Namenswahl erhalten, gemeinsame Rücknahme
geprüft. Ausschließlich isolierte Testbestände; kein produktiver Rollback oder Paketwechsel.
Danach Temp/Umzug 40/40 und komplette Lightroomgruppe 239/239 am umgestellten lokalen Default erneut bestanden.
Im ersten Gesamtversuch zwei zu lange Windows-Testpfade korrigiert; danach offene Handles/Schließreihenfolge
im Aufräumen isolierter Testfixtures behoben. Keine produktive Schutzprüfung oder Windows-Regel gelockert.
Explorer-Schließen ist wiederholbar und umfasst Ressourcen auch bei nicht gestartetem HTTP-Listener.

## Verbleibende Abschlussgrenze

- Finaler Hauptordnername `D:\Arten-Explorer`: Datenkonfiguration portabel isoliert geprüft, tatsächliche
  Umbenennung noch offen. Codex-Arbeitschat/-Projekt und Lightroom-Registrierung binden weiterhin den alten
  Programmpfad; Desktop-Verknüpfung muss gemeinsam umgestellt werden. Kein isoliertes Umbenennen.
- Native Regressionseinzelabnahme des neuen Artassistenten und Explorer-/Lightroom-Neustart am endgültigen
  Daten-/Programmpfad noch offen. Frühere Nutzerrückmeldungen nicht auf diese neue Implementierung ausweiten.
- Vollautomatischer IUCN-Abruf weiterhin kein belegter Erfolg; Browser-/Dateiimport bleibt der sichere Weg.
  Letzte normale lesende HTTP-Probe am 4. Oktober 11:28 UTC: Grünfink-Endpunkt HTTP 403,
  `text/html; charset=UTF-8`, keine Weiterleitung. Keine Karte heruntergeladen oder bestehende Datei ersetzt.
- Neuer Commit-/Pages-Nachweis getrennt; **dieser Bericht ist kein Phase-10.5-Gesamtaudit**.

Verträge: [Umzug und Rückweg](../storage-migration.md), [Temp](../temp-retention.md),
[Artanlage](../add-species-workflow.md), [aktuelle Restreihenfolge](../roadmap.md).
