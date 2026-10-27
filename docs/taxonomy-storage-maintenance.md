# Taxonomie: Aufbewahrung und Speicherplatz

Stand: 2026-10-27

Status: Die Speicherpflege ist im vereinbarten Umfang des seit **27. Oktober abgeschlossenen Gesamtaudits**
angenommen. Gesamt-Go und bewusste Betriebs-/Nachweisgrenzen stehen ausschließlich im
[Auditauftrag, Abschnitt 10.55](audit-auftrag-phase-10-5.md#1055-lightroom-großprobe-und-gemeinsamer-abschluss--27-oktober).
Den heutigen Paarstand führt der [Taxonomie-Betriebsstand](taxonomy-current-status.md).
Die folgenden datierten Nachweise sind keine neue Bereinigungsfreigabe und kein neuer NAS-Sicherungsnachweis.

## Historischer Nachweisstand – 25. Oktober

Die Speicherpflege war implementiert, isoliert geprüft und am **13. Oktober** mit einer ausdrücklich bestätigten
Bereinigung zweier alter fertiger Aufbauordner am produktiven Bestand ausgeführt. Die reguläre Vorschau
prüfte aktives Master-/Lightroom-Paar und direkten Vorgänger anhand ihrer SHA-256-Prüfsummen. Die bestätigte
Bereinigung entfernte **2.154.452.155 Bytes**, ohne Fehler und ohne Änderung der aktiven Zeiger. Der isolierte
NAS-Restore einschließlich getrenntem Programmstart ist inzwischen im
[Auditauftrag unter 10.41/10.43](audit-auftrag-phase-10-5.md) abgenommen. Daraus folgte keine Produktivübernahme;
die übrige Betriebs-/Großbestandsabnahme war zu diesem damaligen Stand noch offen. Der spätere gemeinsame
Abschluss steht in Abschnitt 10.55 desselben Auditauftrags.

Die historische abgeschlossene [Quellenreparatur](taxonomy-partial-source-recovery.md) aktivierte das damalige neue
Master-/Lightroom-Paar und erhielt das passende Paar vom 28. September als Rückweg. Alte Reparaturjournale,
Fehleraufträge/private Fehlerdatenbank und aufbewahrter erster Kandidat wurden nicht bereinigt. Diese benötigten
Nachweise sind keine zusätzlichen pauschal freigegebenen Backups; der damalige Dokumentations-/Commitauftrag
enthielt keine Löschfreigabe. Jede spätere Bereinigung braucht ihren eigenen frischen, unveränderten Vorschauplan.
Heute aktiv ist das gemeinsam übernommene Paar vom 24. Oktober; sein direkter Vorgänger stammt vom
13. Oktober. Die aktuelle gebundene Menge führt der [Taxonomie-Betriebsstand](taxonomy-current-status.md).

## Tatsächlich bestätigte Bereinigung vom 13. Oktober

Felix gab genau die folgenden beiden alten fertigen Aufbauordner zum dauerhaften Entfernen frei:

| Aufbauordner | Herkunft | Tatsächlich entfernte Bytes |
| --- | --- | ---: |
| `job-8006153d-67c0-4e4f-97e7-224fd15d120e` | 3. Oktober | 1.081.290.927 |
| `job-b7795544-1758-464f-baaf-66c7ed6f32db` | 2. Oktober | 1.073.161.228 |

Die reguläre Vorschau um 21:12:27 MESZ meldete keine Warnungen. Nach der ausdrücklichen Bestätigung
entfernte `storage-clean` mit derselben unveränderten Vorschaurevision beide Ordner um **21:25:41 MESZ**:
zwei entfernt, keine Fehler, beide Zielpfade fehlen anschließend, Aktivzeiger bytegleich. Gebundene
Vorschau-/Quittungsbelege stehen ausschließlich im [Auditauftrag, Abschnitt 10.26](audit-auftrag-phase-10-5.md#1026-abschluss-der-beauftragten-fn-stapel-video-reparaturen-und-speicherpflege--13-oktober).

Dies ist die tatsächliche Löschmenge dieser Aktion, keine Bilanz des gesamten Speicherverbrauchs.
Andere ältere Paare, Legacy-, Recovery- und fehlgeschlagene Aufträge sind weiterhin durch erhaltene
Originaleingänge, direkte/transitive Abhängigkeiten oder offene Fehler geschützt. Sie wurden nicht entfernt
und sind durch diese Freigabe nicht zum Löschen bestimmt. Die früheren Aussagen „keine produktiven Dateien
entfernt“ beschreiben ausdrücklich die datierten Implementierungs-/Teststände vor dieser Bereinigung.

## Aufbewahrungsentscheidung

Ergänzung am 3. Oktober: Eine bestätigte Paarbereinigung speichert vor dem ersten Entfernen eine gebundene
Quittung unter `master/storage-cleanups`. Nach einem Teilfehler nennt sie tatsächlich entfernte Bytes.
Nur belegte unveränderte Reste können nach frischer Vorschau und erneuter Bestätigung fortgesetzt werden;
aktive/vorherige Paare und benötigte Aufträge bleiben erneut geschützt. Unbekannte oder manipulierte Reste
werden nicht freigegeben. Isolierte Fehler-/Retrytests bestanden; bei dieser Ergänzung vom 3. Oktober keine
produktiven Dateien entfernt.

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
- auch fertige Aufbauaufträge, deren direkte oder transitive Eingänge von einem geschützten Auftrag benötigt werden;
- ältere Paare, deren Dateien noch von einem geschützten Auftrag benötigt werden;
- unvollständige/unklare Einträge, fremde Dateien, Verknüpfungen und Windows-Junctions.

Vor einer Freigabe alter Paare werden aktiver Stand und Vorgänger anhand ihrer Manifeste und der aufgezeichneten
SHA-256-Prüfsummen geprüft. Fehlendes, beschädigtes oder unpassendes Backup: keine Paarbereinigung. Eine unbekannte
Auftragsabhängigkeit schützt ebenfalls alle möglicherweise benötigten Paare. Nicht auflösbare zentrale Zeiger
sperren den Vorgang vollständig. Unlesbare, fehlende oder manipulierte zentrale Auftrags-/Recoverybindungen
schützen sowohl möglicherweise benötigte Jobs als auch Paare. Recovery-Originalchecksums und
Auftragsrevisionen müssen zusammenpassen. Nach einem verifizierten Speicherumzug wird zuerst die
Revision des originalen Rezepts geprüft und anschließend ausschließlich dessen Zugriffspfad über das
passende committed Umzugsjournal projiziert; historische Originalbytes werden nicht umgeschrieben.
Windows-Schreibweisen werden nur für den Abhängigkeitsgraph kanonisch verglichen. Die im Gesamtaudit
belegten Gegenproben und die konkrete geschützte Menge stehen im
[Auditauftrag Phase 10.5](audit-auftrag-phase-10-5.md). Die Prüfung ersetzt kein externes Backup gegen einen Laufwerksausfall.

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
auch keine automatische Bereinigung. Die damalige Implementierungsprüfung simulierte diese Fälle über
gezielte Fehler und Platzmesswerte; sie allein belegte weder einen physisch vollen Datenträger noch einen
kompletten Neustart. Den später tatsächlich abgenommenen Betriebsumfang und seine Grenzen führt Abschnitt 10.55
des [Auditauftrags](audit-auftrag-phase-10-5.md#1055-lightroom-großprobe-und-gemeinsamer-abschluss--27-oktober).

## Prüfung und Grenzen

Direkte Tests: Schutz aktiver/Vorgängerstände, genau ein Backup ohne zusätzliche Archivpaare, Jobabhängigkeiten,
Bestätigung und veraltete Vorschau, beschädigter Rückweg, unbekannte Dateien, unvollständige Rezepte, Prozesssperren,
Verknüpfungen, alte Vorbereitung, Dateisperren und Platzmangel vor Spooling/Master-/Paaraufbau. Oberflächentests
prüfen Klickpflicht, Vorschau, Abbruch, Bestätigung und wieder freigegebene Bedienung bei Fehlern. Die Tests sind
in `test:taxonomy-master`, `test:lightroom` und dem vollständigen Qualitätsgate enthalten.

### Historischer Prüfabschluss – 20. September

25 gezielte Speicher-/Workerfälle bestanden, einschließlich Platzmangel während
des Spoolings und nach einem bestätigten 500er-Block mit erfolgreicher Fortsetzung. Die zusätzlichen
Oberflächen-/Routentests und das vollständige `npm.cmd run --silent quality:ci` sind erfolgreich (Exitcode 0).
Ein erster Gesamtlauf beanstandete nur den alten Oberflächenvertrag mit fünf statt jetzt sechs Datenbankaktionen;
dieser ist samt ausdrücklichem Speicherpflege-/Bestätigungsvertrag aktualisiert. Stil, Dokumentationslinks,
Schemata, Projektstatus und die lokalen Produkt-/Assetprüfungen sind erfolgreich. Keine produktive Bereinigung,
kein neuer Quellen-/Masterlauf. Die Speicherpflege-Änderungen sind noch nicht veröffentlicht.

Am 20. September blieb die gebündelte Betriebs- und Großbestandsabnahme nach damaliger
[Roadmap](roadmap.md) und [Hintergrundaufbau](taxonomy-master-background-build.md) noch offen. Diese damalige
Grenze ist keine heutige offene Gesamtabnahme; den späteren Abschluss und verbleibende Grenzen führt
[Abschnitt 10.55](audit-auftrag-phase-10-5.md#1055-lightroom-großprobe-und-gemeinsamer-abschluss--27-oktober).
Keine automatische Lösch- oder Produktionsaktion folgt daraus. Die damalige Speicherpflege-Implementierung änderte keine Lua-Dateien und
beließ das Plug-in bei 0.4.24.14. Der heutige Quell-/Ladestand ist davon getrennt im
[Lightroom-Vertrag](lightroom-search-package.md) dokumentiert; die aktuellen Belege und offenen Grenzen
stehen im [Auditauftrag](audit-auftrag-phase-10-5.md).
