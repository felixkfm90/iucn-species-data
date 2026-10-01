# Taxonomie: Aufbewahrung und Speicherplatz

Stand: 2026-10-01

Status: implementiert und mit isolierten Datenbanken/Dateibeständen geprüft. Keine produktiven Dateien für
diese Umsetzung gelöscht. Der vollständige Betriebs-/Großbestandstest steht weiterhin aus.

Die inzwischen abgeschlossene [Quellenreparatur](taxonomy-partial-source-recovery.md) aktivierte das neue
Master-/Lightroom-Paar und erhielt das passende Paar vom 28. September als Rückweg. Alte Reparaturjournale,
Fehleraufträge/private Fehlerdatenbank und aufbewahrter erster Kandidat wurden nicht bereinigt. Diese benötigten
Nachweise sind keine zusätzlichen pauschal freigegebenen Backups; der aktuelle Dokumentations-/Commitauftrag
enthält keine Löschfreigabe. Jede spätere Bereinigung braucht ihren eigenen frischen, unveränderten Vorschauplan.

## Aufbewahrungsentscheidung

Benutzerentscheidung vom 20. September: **Aktiver Stand plus genau ein vorheriger, geprüfter Stand als Backup**.
Gemeint ist ein funktionierendes Master-/Lightroom-Paar, nicht irgendein alter, möglicherweise unfertiger Kandidat.
Zusätzliche alte Paare werden nicht als weitere Backups reserviert. Auch überholte fertige Aufbauaufträge brauchen
keine zusätzliche Archivkopie. Als Sicherheitsfrist werden Einträge erst nach sieben unveränderten Tagen angeboten.
Dadurch und durch die folgenden Abhängigkeiten können vorübergehend mehr Dateien vorhanden sein.

Immer geschützt bleiben:

- aktives Master-/Lightroom-Paar und sein direkter Vorgänger;
- aktive/vorherige Legacy-Slots, Staging-Kandidat, CoL-Referenzen und Anbieterstände;
- letzter gespeicherter Aufbauauftrag und der zum Staging-Kandidaten gehörende Auftrag;
- alle nicht sicher abgeschlossenen Aufträge, insbesondere pausierte, unterbrochene, fehlgeschlagene und veraltete;
- ältere Paare, deren Dateien noch von einem geschützten Auftrag benötigt werden;
- unvollständige/unklare Einträge, fremde Dateien, Verknüpfungen und Windows-Junctions.

Vor einer Freigabe alter Paare werden aktiver Stand und Vorgänger anhand ihrer Manifeste und der aufgezeichneten
SHA-256-Prüfsummen geprüft. Fehlendes, beschädigtes oder unpassendes Backup: keine Paarbereinigung. Eine unbekannte
Auftragsabhängigkeit schützt ebenfalls alle möglicherweise benötigten Paare. Nicht auflösbare zentrale Zeiger
sperren den Vorgang vollständig. Die Prüfung ersetzt kein externes Backup gegen einen Laufwerksausfall.

## Bedienung

Im bestehenden Datenbankbereich: **Speicher prüfen und bereinigen**.

1. Nur der Klick prüft den Bestand, Platzbedarf und Rückweg. Beim Öffnen des Explorers gibt es keinen Speicherlauf.
2. Die Vorschau nennt verwaltete Release-/Auftragsbestände, freien Laufwerksspeicher und freigegebenen Platzbedarf.
3. Vor dem Entfernen werden die konkreten Kennungen aufgelistet. Abbrechen entfernt nichts.
4. Die Bestätigung gilt nur für diese unveränderte Vorschau. Ein neuer Auftrag, Zeigerwechsel oder eine geänderte
   Datei verlangt eine erneute Vorschau. Dateisperren werden als unvollständige Bereinigung gemeldet.

Die bestätigten Dateien werden **dauerhaft entfernt**, nicht in den Papierkorb verschoben. Dafür gibt es keine
direkte Rücknahme. Der aktive Stand und sein ausgewiesener Rückweg bleiben vorhanden. Artenliste, Namenswahlen,
Fotos, Lightroom-Katalog, Karten, Sounds und Portraits sind keine Ziele der Speicherpflege.

Der angezeigte verwaltete Umfang ist **nicht der Gesamtverbrauch des Explorers**: CoL-/Anbieter-Releases,
Korrekturreleases, Identitätsjournale, Legacy-Slots, produktive Assets und andere Backups bleiben außerhalb dieser
Bereinigung. Nicht verwendete, aber möglicherweise fortsetzbare Aufträge werden nicht allein nach Alter gelöscht.
Ihre spätere ausdrückliche Verwerfung ist ein eigener Bedienvertrag, keine stille Speicheroptimierung.

## Schutz und Umsetzung

- `taxonomy-storage-maintenance.mjs`: Inventar, Abhängigkeiten, Vorschaurevision und bestätigte Bereinigung.
- Master-Control-/Execution-Sperren und die kurze Korrektursperre verhindern gleichzeitige Aufbau-/Paaraktionen.
  Auch der Paarworker hält während seiner Vorbereitung die Execution-Sperre; ein verlorener Elternprozess darf
  keinen noch schreibenden Worker als bereinigbar erscheinen lassen.
- Zulässige Ziele sind nur intern ermittelte UUID-Unterordner unter `taxonomy/master/build-jobs`,
  `taxonomy/master/releases`, `lightroom/releases` sowie markierte `lightroom/.publication-<UUID>`-Vorbereitungen.
  Clientseitig eingereichte Pfade werden nicht verwendet. Jeder Pfad einschließlich Vorfahren wird auf
  Verknüpfungen geprüft; unbekannte Dateinamen schützen den gesamten Eintrag.
- Alte Vorbereitungen benötigen `preparation.json` mit passender Kennung und beiden Speicherwurzeln. Ältere
  unmarkierte Reste bleiben erhalten. Eine automatische pauschale Ordnerbereinigung ist ausdrücklich nicht erlaubt.
- API: `POST /api/taxonomy/master/storage-preview` und `POST /api/taxonomy/master/storage-clean`.
  Letzteres verlangt `confirmed: true` und die aktuelle `revision`, unter bestehenden lokalen Sitzungsschranken.

## Speicherprüfung vor und während des Aufbaus

`taxonomy-space-budget.mjs` verwendet den tatsächlich verfügbaren Laufwerksspeicher und eine freie Reserve
von **2 GiB**. Fehlende Messbarkeit gibt keine Startfreigabe. Ein neuer Masterlauf prüft zuerst diese Reserve,
vor der Eingangsablage zusätzlich das Doppelte des bisherigen Masterverzeichnisses. Beim Eingangs-Spooling wird
spätestens nach weiteren rund 8 MiB erneut geprüft, ebenso vor dem letzten Puffer.

Vor dem Master-Schreibprozess dient das größere der beiden Ergebnisse als zusätzlicher Platzbedarf:
sechsfache gesicherte Eingangsgröße oder doppelte bisherige Mastergröße. Bereits geschriebene private Kandidatendaten
werden beim Fortsetzen abgezogen. Nach bestätigten 500er-Blöcken wird die Reserve erneut geprüft.
Vor der Paarvorbereitung werden im Suchspeicher zwei Master- plus zwei bisherige Paketgrößen und im Masterspeicher
eine weitere Mastergröße eingeplant, jeweils zuzüglich Reserve.

Das sind konservative Schätzungen, **keine feste Obergrenze oder Speicherreservierung**. Andere Programme können
parallel Platz verbrauchen; ein einzelner SQLite-Block oder Anbieterdownload kann stärker wachsen. Ein dennoch
auftretender Schreibfehler darf aktive Stände nicht ersetzen. Ein Auftragscheckpoint bleibt ausdrücklich
fortsetzbar, sofern seine Eingänge noch stimmen. Die Speicherguards löschen selbst keine alten Dateien und starten
auch keine automatische Bereinigung. Physisch voller Datenträger und kompletter Neustart gehören zum späteren
Betriebstest; sie werden hier über gezielte Fehler und Platzmesswerte simuliert.

## Prüfung und Grenzen

Direkte Tests: Schutz aktiver/Vorgängerstände, genau ein Backup ohne zusätzliche Archivpaare, Jobabhängigkeiten,
Bestätigung und veraltete Vorschau, beschädigter Rückweg, unbekannte Dateien, unvollständige Rezepte, Prozesssperren,
Verknüpfungen, alte Vorbereitung, Dateisperren und Platzmangel vor Spooling/Master-/Paaraufbau. Oberflächentests
prüfen Klickpflicht, Vorschau, Abbruch, Bestätigung und wieder freigegebene Bedienung bei Fehlern. Die Tests sind
in `test:taxonomy-master`, `test:lightroom` und dem vollständigen Qualitätsgate enthalten.

Prüfabschluss am 20. September: 25 gezielte Speicher-/Workerfälle bestanden, einschließlich Platzmangel während
des Spoolings und nach einem bestätigten 500er-Block mit erfolgreicher Fortsetzung. Die zusätzlichen
Oberflächen-/Routentests und das vollständige `npm.cmd run --silent quality:ci` sind erfolgreich (Exitcode 0).
Ein erster Gesamtlauf beanstandete nur den alten Oberflächenvertrag mit fünf statt jetzt sechs Datenbankaktionen;
dieser ist samt ausdrücklichem Speicherpflege-/Bestätigungsvertrag aktualisiert. Stil, Dokumentationslinks,
Schemata, Projektstatus und die lokalen Produkt-/Assetprüfungen sind erfolgreich. Keine produktive Bereinigung,
kein neuer Quellen-/Masterlauf. Die Speicherpflege-Änderungen sind noch nicht veröffentlicht.

Der nächste Schritt ist die gebündelte Betriebs- und Großbestandsabnahme nach
[Roadmap](roadmap.md) und [Hintergrundaufbau](taxonomy-master-background-build.md), kein weiterer automatischer
Lösch- oder Produktionslauf. Squarespace-Footer geprüft: nur lokale Explorer-Module betroffen. Keine Lua-Änderung;
Plug-in-Version bleibt 0.4.24.14.
