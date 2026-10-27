# Lightroom-Artänderungen: Vorschau, Journal und Schreibkern

Stand: 2026-10-27

Status: **implementiert; native Grund- und Störfälle sowie begrenzter Großkataloglauf angenommen**.
Vorschau und Journal sind
über den Suchhelfer verbunden; Wiederaufnahmeprüfung und favoritenabhängige Blockplanung sind implementiert.
Der Lua-Schreibkern ist nun mit ausdrücklichem Katalogleselauf, Journalvorbereitung, blockweiser Übernahme
und Rücknahmeprüfung verbunden. Auswahl, Bestätigungsdialoge, Fortschritt und Rücknahmebedienung sind
über „FN Wildlife verwalten“ → „Artänderungen prüfen ...“ erreichbar. Kein produktiver
Katalog wurde in den automatisierten Prüfungen verändert. Eingeführt in Plug-in-Version `0.4.24.13`, aktueller
lokaler Quellstand `0.4.24.40`; die normale Zuweisung und Orts-/Zeitaktionen bleiben
unverändert. Gesamtumfang: `taxonomy-identity-incremental-plan.md`.
Der Benutzer hat das reine Öffnen ohne Auswahl bestätigt. Das ist keine Abnahme einer tatsächlichen
Split-/Merge-Übernahme oder ihrer Rücknahme; hierfür weiterhin einen separaten Testkatalog verwenden.

Aktueller Stand vom 27. Oktober: .40 verwendet für die katalogweiten Grundfelder dokumentierte
SDK-Sammelzugriffe in 250er-Blöcken und ist am regulären Produktivpfad nativ als geladen belegt.
Die private .41 enthält dieselbe `IdentityCatalog.lua`. Ihr ausdrücklich auf ein künstliches Foto
begrenzter Großkataloglauf hat Initialisierung, Vorschau, Journalvorbereitung, Übernahme und Rücknahme
abgeschlossen. Der unabhängige Endvergleich der geschlossenen Katalogkopien ist bestanden:
Alle 127.701 realen Fotos bleiben in den erfassten rohen FN-/Foto-/IPTC-Werten und alle 126.662 realen
Stichwortrelationen unverändert. Die 43 Identitätsfelder des künstlichen Fotos entsprechen nach der
Rücknahme wieder exakt dem Vorherstand; tatsächliche Apply-/Undo-Journalzustände und gespeicherte
SDK-Ergebnisse sind an den Vergleich gebunden. Die inkrementellen Statistikänderungen für
Initialisierung, Übernahme und Rücknahme sind geprüft. Gesamtzahl und Katalogpfad des vorhandenen
Index bleiben geerbt; eine frische Vollstatistik wurde nicht aufgebaut. Der Nachweis erfasst weder
sämtliche Lightroom-/Entwicklungstabellen noch die Originalbildbytes. Die 102 isolierten
Verhaltens-/Vertragsprüfungen belegen zusätzlich den Quellkandidaten. Daraus folgt kein Gesamtaudit-Go.
Tatsächliche native Belege und aktuelle Abnahmegrenzen stehen im
[Auditauftrag](audit-auftrag-phase-10-5.md). Die folgenden datierten .37-, .38- und .39-Nachweise behalten
ihren damaligen Prüfstand.

Auditkorrektur vom 22. Oktober: Der native erste Split-Versuch wurde vor Journalanlage und Fotoänderung
angehalten, weil SDK-Laufkennungen Großbuchstaben enthalten können. .37 normalisiert neue Laufkennungen
am Lua-Erzeuger in Kleinschreibung und prüft Typ sowie UUID-Gruppenform vor der Journalvorbereitung.
Die strenge Journalgrenze bleibt erhalten. Gekoppelte Tests verwenden den tatsächlichen Lua-Aufrufer
und JavaScript-Journalhelfer; 93/93 betroffene Prüfungen sowie das vollständige .37-Gate mit
50 Gruppen / 1.923 Tests bestehen. Native Übernahme/Rücknahme bleibt getrennt offen; Nachweise
unter Auditauftrag, Abschnitt 10.50.

Die weitere Auditkorrektur .38 verwendet für Stichwortauflösung ausschließlich den dokumentierten
SDK-Arrayzugriff `getKeywordsByLocalId` mit numerischen Kennungen. Das Journal behält seine Stringkennungen;
zurückgelesene Objekte werden unabhängig von ihrer Reihenfolge exakt an ID und Namen gebunden.
Fehlende/umbenannte Altobjekte bleiben Rücknahmekonflikte, technische SDK-/Antwortfehler stoppen mit
eigenem Prüfhinweis. Keine Stichwortrekonstruktion. 32/32 Kern- und 227/227 betroffene Prüfungen bestehen;
das vollständige neue Gate besteht mit 50 Gruppen / 1.937 Tests und 139 unveränderten Quellen.
Private .38 ist im eigenen Testkatalog tatsächlich geladen; die Fortsetzung des vorhandenen
vorbereiteten Laufs und seine genaue Rücknahme werden getrennt nativ geprüft.

Am 23. Oktober ist der unabhängige Nachvergleich des gespeicherten tatsächlichen Split-B-Apply bestanden:
alle sechs Fotos, genau ein betroffenes Foto, alle FN-/Stichwort-/Statistikwerte einschließlich des
vertraglich erlaubten leeren Beispielnamens passend. Der verstärkte Hilfsprüfer besteht 52/52 Gegenproben;
keine neue native Ausführung aus der gespeicherten Probe ableiten. Anschließend wurde private .39
tatsächlich geladen und ausschließlich derselbe B-Lauf nativ zurückgenommen: ein Foto, null Konflikte.
Unabhängige lesende Prüfung aller sechs Einträge bestätigt den vollständigen Ausgangsstand,
geschützte Nichttaxonomie-Felder/Stichwörter und die gebundene inkrementelle Statistik. Der aktuelle
Hilfsprüfer besteht 57/57 Gegenproben, einschließlich tatsächlicher SQLite-Zeilenprototypen.
Auch Split C ist nativ übernommen und im selben Lauf konfliktfrei zurückgenommen; alle sechs
gespeicherten Einträge und die inkrementelle Statistik unabhängig gegen den Ausgangsstand geprüft.
Der nur gespeicherte Belege prüfende Helfer besteht inzwischen 72 Gegenproben und erhält ein zuvor
nicht gespeichertes Favoritenfeld exakt; eine leere Rohangabe wird nicht mit einem geschriebenen „no“
gleichgesetzt. Merge F ist nativ übernommen und unabhängig für alle sechs Einträge nachgeprüft:
zwei Taxonomieübertragungen, genau zwei Favoritenabwahlen einschließlich eines Fotos außerhalb
der Auswahl, genau ein erhaltener gewählter Favorit. Auch derselbe Merge-Lauf ist anschließend nativ
ohne Konflikte zurückgenommen und für alle sechs Einträge unabhängig vollständig gegen die Baseline
nachgeprüft; ursprüngliche Favoriten, Taxonomien und inkrementelle Statistik wiederhergestellt.
Diese drei erfolgreichen Grundfälle ersetzen keine native Pause-/Fehler-/Großkatalogmatrix.
Vollständige Belege und getrennt freigegebenes produktives CoL-Update unter 10.51.
.39 ändert ausschließlich die Fensterlebensdauer der normalen Zuweisungsansicht; keine Änderung am
Identitätsschreibkern oder Journal. Quellübernahme und tatsächlicher nativer Ladestand bleiben getrennt.

Auditkorrektur vom 20. Oktober: `prepareTarget` bindet Namen und interne Kennungen der tatsächlich
angelegten Zielstichwörter erst nach dem SDK-Schreibabschluss. Vor der Bindung wird der bestätigte
Katalog-/Foto-/Paketstand erneut geprüft; dauerhaft unlesbare Kennungen stoppen weiterhin vor der
Journalanlage und vor jeder Fotoänderung. Bereits angelegte leere Stichwörter können beim Abbruch
verbleiben, ohne automatische Entfernung.
Die Statistikänderung wird für Übernahme und Rücknahme aus dem vollständigen exakten Journalziel
und der vorherigen Ort-/Zeit-/Datum-/Datei-/Videoaufnahme gebildet, statt FN-Setter im selben Zugriff
sofort zurückzulesen. Foto- und Indexänderung bleiben in derselben Katalogtransaktion; die tatsächliche
vollständige Fotorücklesung nach dem SDK-Abschluss bleibt Voraussetzung für den Journalabschluss.
Echte Lua-Module und Statistikindex sind mit künstlich verzögerten SDK-Lesesichten geprüft; dies ist
noch keine native Lightroom-Artänderungsabnahme. Aktuelle Belege und Grenzen stehen ausschließlich im
[Auditauftrag, Abschnitt 10.48](audit-auftrag-phase-10-5.md#1048-explorer-und-lightroom-vorziehen-artänderungsschreibkern--20-oktober).

## Bedienung und erste Abnahme

`ReviewIdentity.lua` startet den Ablauf in einem Lightroom-Task; `IdentityAction.lua` steuert Auswahl,
Bestätigung und Protokollaktionen, `IdentityView.lua` die kompakten nativen Dialoge. Ein zweiter gleichzeitig
geöffneter Artänderungsdialog ist gesperrt. Die beiden nativen Lightroom-Menüpunkte bleiben unverändert;
im Verwaltungsfenster steht eine zusätzliche Gruppe „Artänderungen und Rücknahme“.

- Öffnen des Einstiegsdialoges startet keinen Katalogscan. Ohne Auswahl im Dropdown oder bei „Schließen“
  geschieht nichts. Nachfolger und Favoriten-Gewinner sind niemals vorausgewählt.
- „Aktuelle Fotoauswahl auf Nachfolger prüfen“ übernimmt eine feste Auswahl von maximal 10.000 Fotos.
  Fotos ohne FN-Taxonomie bleiben unberührt. Erst nach „Prüfen“ beginnt der ausdrücklich angekündigte
  Katalogleselauf für Favoriten. Auswahlwechsel danach vergrößern den Auftrag nicht.
- Jede Ausgangsart mit bestätigten Nachfolgern erhält einen eigenen Dialog mit bisherigem Namen,
  wissenschaftlichem Namen, Anzahl ausgewählter Fotos und gegebenenfalls Split-Warnung.
  „Diese Art später entscheiden“ lässt diese Fotos unverändert. Schließen verwirft die noch nicht
  gespeicherte Vormerkung des gesamten Auftrags. Es werden keine neuen Master-Entscheidungen erzeugt.
- Bei mehreren Favoriten pro Zielart muss ein vorhandenes Foto nach Dateiname und UUID gewählt werden.
  Der Dialog nennt ausdrücklich die mögliche Abwahl außerhalb der Fotoauswahl.
- Die Schlussbestätigung nennt Übertragungen, unveränderte Fotos, Favoritenabwahlen, Katalogsicherung,
  Rücknahmeprotokoll und mögliche leere neue Zielstichwörter nach Vorbereitungsabbruch.
- Der native Fortschritt zeigt gelesene Katalogfotos und bestätigte Schreibfortschritte des aktuellen
  Durchlaufs. Lightrooms „Abbrechen“ pausiert vor dem nächsten Schreibblock; ein bereits laufender
  Schreibblock wird vollständig abgeschlossen oder durch Lightroom zurückgerollt. Kein automatischer Retry.
- „Protokollierte Läufe“ zeigt Kataloglauf, UTC-Zeit und Zustandszahlen. „Prüfen und fortsetzen“ verlangt
  zuerst Bestätigung der frisch gelesenen Journalzustände und danach getrennt die Fortsetzung.
  „Nicht ausgeführte Schritte beenden“ beendet nur eindeutig ungeschriebene Schritte; Gespeichertes bleibt.
  „Angewendete Änderungen gezielt zurücknehmen“ zeigt zunächst Konflikte und verlangt eigene Bestätigung.
  Bei offener Übernahme/Rücknahme muss zunächst deren Zustand geklärt werden.
- Konflikte stehen auf kurzen nativen Seiten statt in verschachtelten Scrollfeldern. Fehlende Fotos,
  geänderte FN-Stände oder gelöschte Altstichwörter werden nicht still überschrieben.

Gefahrloser erster Bedienungstest: Zusatzmodul neu laden, Version **0.4.24.13** prüfen, Verwaltungsfenster
und neuen Einstieg öffnen und ohne Aktion schließen. Optional „Protokollierte Läufe“ öffnen und schließen;
das liest nur das separate Journal (legt bei Erstaufruf dessen leere lokale Datei an), keine Katalogfotos.
Die echte Übernahme/Rücknahme samt Pause, Fehler- und Großkatalogverhalten muss zunächst in einem gesicherten
separaten Testkatalog mit belegten Testfällen abgenommen werden. Keinen künstlichen Split im produktiven Master
anlegen, nur um den Button zu testen. Simulierte Tests ersetzen diese Abnahme nicht.

Am 11. September vom Benutzer bestätigt: Der neue Einstieg ließ sich öffnen; keine Art gesucht und keine
Auswahloption angeklickt. Damit ist ausschließlich der erste Öffnungstest bestätigt, nicht die praktische
Übernahme, Rücknahme, Pause/Wiederaufnahme oder Großkatalogleistung. Der Benutzer hat die Fortsetzung mit
dem nächsten Arbeitspaket freigegeben.

## Vorschau und Favoriten

`lightroom-identity-plan.mjs` akzeptiert ausschließlich ausdrücklich ausgewählte Fotos mit UUID, bisheriger
Master-ID und vollständigem FN-Schnappschuss-Fingerabdruck. Höchstens 10.000 ausgewählte Fotos je Vorschau.
Ziele werden ausschließlich über bestätigte Registerbeziehungen ermittelt, niemals über ähnliche Namen.
Auch bei nur einem Ziel wird nichts vorausgewählt. Ein Split erlaubt nur die gewählte Teilmenge; alle anderen
Fotos bleiben unverändert. Bei einer Kette aus Split und späterem Merge bleibt die Split-Bedeutung sichtbar.
Aktuelle IDs und nicht belegte Ziele werden nicht umgeleitet; die bisherige FN-Aktualisierung bleibt getrennt.

Die Vorschau bindet Katalogkennung, Fotozustände, Paket-/Master-/Korrektur-/Identitätsstand, Nachfolgerwahl und
Favoritenprüfung an einen Token. Eine neue Prüfung mit geänderten Eingängen benötigt eine neue Bestätigung.
Mehrere Favoriten am gemeinsamen Ziel sperren die Übernahme, bis ein tatsächlich vorhandenes Favoritenfoto
ausdrücklich gewählt ist. Ein dafür zusätzlich zu änderndes Foto darf nur seine Favoritenmarkierung ändern.
Eigene Namen werden nicht in globale Präferenzen anderer Identitäten kopiert.

Der Aufrufer muss vor Übernahme und Rücknahme eine vollständige aktuelle Favoritenprüfung liefern. Der
Statistikindex allein genügt wegen möglicher Änderungen außerhalb des Plug-ins nicht. Der geplante bewusste
Katalogleselauf muss nur relevante FN-Felder prüfen und darf **nicht** beim Öffnen des Zuweisungsfensters starten.
`lightroom-identity-inventory.mjs` normalisiert diese Rücklesung, prüft ihre Konsistenz mit der Fotoauswahl und
berücksichtigt Favoriten außerhalb der zu übertragenden Auswahl. `IdentityCatalog.lua` liest nun ausdrücklich
alle Master-IDs und Favoritenstände. Ab .40 beginnt jeder Leselauf erneut mit `getAllPhotos()`;
ein Katalogcache oder eine Beschränkung auf die Fotoauswahl ersetzt dieses Inventar nicht.
Je höchstens 250 Fotos liest `batchGetPropertyForPlugin` gemeinsam `masterTaxonId` und `referenceImage`.
Nur für die darin gefundenen FN-Fotos folgt `batchGetRawMetadata` mit dem Schlüssel `uuid`.
Antworten werden über die tatsächlichen Fotoobjekte zugeordnet, nicht über ihre Reihenfolge.
Fehlende oder fremde Fotoantworten, ungültige Werte und doppelte UUIDs stoppen die Prüfung;
es gibt keinen stillen Ersatz durch einzelne Fotoabrufe. Ein vorhandenes leeres Antwortobjekt
für ein Foto ohne FN-Taxonomie und ein nicht gespeicherter Favoritenwert bleiben zulässig.
Vollständige FN-Schnappschüsse werden nur für Auswahl-/Journalfotos und
Favoriten gelesen (höchstens 20.000); andere Nichtfavoriten tragen bewusst keinen Schnappschusshash.
Für ein betroffenes Foto ist der vollständige Hash weiterhin Pflicht. `inventoryRows` und `observed` werden
in der Helferbrücke validiert und gemeinsam in das interne Inventar überführt. Der Helfer besitzt keinen
eigenen Lightroom-Zugriff; `complete` bleibt deshalb ein überprüfter Lua-Aufrufervertrag.

Der Suchhelfer besitzt zwei ursprüngliche **lesende** Befehle:

- `photo-identity-options`: 1–100 eindeutige Master-IDs; belegte erreichbare Ziele und Registerereignisse.
- `photo-identity-preview`: Fotoauswahl, Ziele, Favoriteninventar und gegebenenfalls Favoritenentscheidungen;
  liefert ausschließlich eine Vorschau (`changesPhotos=false`).

Die neue Brücke `lightroom-identity-workflow.mjs` ergänzt folgende Befehle, jeweils mit Präfix `photo-identity-`:

- `plan` erzeugt die Vorschau aus vollständigen ausgewählten Schnappschüssen und berechnet deren Hashes selbst.
- `confirm` prüft die Bestätigung erneut und liefert nur die bestätigten aktuellen Zieltaxa zur Lua-Vorbereitung.
- `prepare` prüft dieselbe Bestätigung erneut und schreibt das vollständige Journal, niemals Fotos.
- `list`/`read` lesen die protokollierten Läufe; `checkpoint` bestätigt ausschließlich exakt zurückgelesene Zustände.
- `recovery-preview`/`recovery-confirm` prüfen einen unterbrochenen Lauf und protokollieren die ausdrücklich
  bestätigte Rücklesung. Wahlweise bleibt noch nicht Geschriebenes vorbereitet oder wird als nicht angewendet
  abgeschlossen. Eine noch nicht ausgeführte Rücknahme kann wieder auf `applied` zurückgesetzt werden.
- `undo-preview`/`undo-prepare` prüfen und protokollieren eine bestätigte Rücknahme.
- `block-preview`/`block-confirm` planen höchstens 250 protokollierte Fotos mit Favoritenabhängigkeiten.

Es gibt weiterhin **keinen Foto-Apply-Befehl**. `changesPhotos=false` gilt auch bei Journaländerungen und ist
keine Aussage, dass der Helfer keinerlei Datei schreibt. Vor Bestätigung und Übernahme wird der aktive
Suchpaketstand neu geöffnet, auch bei einem langlebigen Helfer. Ein vom Client mitgelieferter Plan oder
Journalpfad wird nicht übernommen. Rücknahme und Journalprüfung bleiben ohne aktuelles Suchpaket möglich.
`IdentityWorkflow.lua` hält eine lokale Laufsperre pro Katalog und ruft den Helfer ausschließlich außerhalb
eines Katalogschreibzugriffs auf. Katalogkennungen werden mit `catalog:getPath()` verglichen, nicht aus der
Vorschau ungeprüft übernommen. Unmittelbar vor jedem Schreibblock werden unter Katalogschreibzugriff der
lokale Paket-/Master-/Korrekturstand und die aktuellen Fotos/Favoriten erneut geprüft. Ein
Helfer-Token ersetzt diese Prüfung nicht und darf keinen Helferaufruf innerhalb des Schreibzugriffs auslösen.

## Journalvertrag

`lightroom-identity-journal.mjs` schreibt eine **separate** SQLite-Datei, niemals den Lightroom-Katalog.
Die Helferbrücke verwendet `<Suchpaketwurzel>/identity-journals/<Kataloghash>.sqlite`.
Die Bibliothek bekommt diesen Wurzelpfad ausschließlich aus der Helferkonfiguration; es wird kein Dateipfad aus einem
Foto-/Laufnamen zusammengesetzt. Die Katalogkennung wird auch innerhalb der Datei geprüft.

- Pro Katalog höchstens 20 Läufe, zusammen höchstens 200 MiB logische Journalnutzdaten; SQLite-Dateigrenze
  zusätzlich 256 MiB. SQLite-Rollbackdateien benötigen während Transaktionen weiteren freien Speicher.
- Keine automatische Löschung, Ablaufzeit oder Rotation. Eine volle Grenze sperrt neue Übernahmen und bewahrt
  die Rücknahmedaten. Eine bestätigte Archivierungs-/Bereinigungsbedienung ist noch nicht vorhanden.
- Vollständige Vorher-/Nachher-Schnappschüsse: UUID, alle FN-Taxonomiefelder, Favoritenstand und vorhandene
  verwaltete Stichwort-IDs samt Namen. Kein GPS, Ort/Zeit, allgemeines Lightroom-Feld oder fremdes Stichwort.
- Exakte Feldtexte, einschließlich Leerraum, werden erhalten. Fehlende Pflichtfelder, fremde Felder, doppelte
  Fotos/Stichwort-IDs und nicht bestätigte Favoritenwirkungen werden abgewiesen.
- `BEGIN IMMEDIATE`, `synchronous=FULL`, Prüfsummen über Inhalt und einzelne Fotos; unbekanntes Schema wird
  nicht migriert. Gleiche Laufkennung mit gleichem Inhalt ist idempotent, anderer Inhalt wird abgewiesen.

Fotozustände:

```text
prepared → applied → undo-prepared → reverted
        ↘ not-applied
```

Ein Journalblock muss vor der Lightroom-Schreibaktion dauerhaft vorbereitet sein. Erst nach Rückkehr aus
dem Schreibzugriff und exakter Rücklesung darf `checkpoint` den Erfolg vermerken. Ein fehlgeschlagener Block
bleibt ungeklärt, nicht angeblich erfolgreich. Nach einem Neustart klassifiziert `reconcile` nur `before`,
`after` oder `conflict`; es schreibt nichts. Der spätere Aufrufer entscheidet anhand dieser Rücklesung über
einen passenden Abschluss oder eine neue Bestätigung. Die bestätigte Wiederaufnahme ändert ausschließlich
den Journalstatus: bereits angewendet, noch vorbereitet, nachweislich nicht angewendet beziehungsweise
zurückgenommen. Fehlende oder abweichende Fotos bleiben ungeklärt und gesperrt. Ein veränderter Journal- oder
Fotostand macht den Wiederaufnahmetoken ungültig. Offene Vorbereitungen sperren parallele neue Läufe und
auch den Start einer Rücknahme aus einem anderen Lauf.
Bereits vollständig abgeschlossene Fotos bleiben bei einem Teilabbruch protokolliert.

`lightroom-identity-block.mjs` plant die Reihenfolge: Favoritenabwahl vor Übertragung eines Favoriten auf
dasselbe Ziel. Auch nach einer Pause an der 250-Foto-Grenze wird kein abhängiger Gewinner vorgezogen.
Ein inzwischen zusätzlich gesetzter Favorit sperrt den betroffenen Folgeblock. Unklare vorbereitete Fotozustände
werden nicht still übersprungen; zuerst ist die Wiederaufnahmeprüfung nötig. Die Blockbestätigung bindet
Journalstand, vollständiges Favoriteninventar und (bei Übernahme) den aktuellen Paketstand.

## Rücknahmegrenzen

Rücknahmevorschau berücksichtigt nur protokolliert angewendete Fotos mit unverändertem Nachherstand.
Gelöschte/umbenannte Altstichwortobjekte werden nicht neu erzeugt. Solche Fotos sowie inzwischen veränderte
oder fehlende Fotos werden als Konflikt ausgelassen. Eine vollständige aktuelle Favoritenprüfung verhindert
auch, dass die Rücknahme mit einem inzwischen außerhalb des Journals gesetzten Favoriten kollidiert.
Abhängige Konflikte werden bis zu einer stabilen, konfliktfreien Restmenge geprüft. Keine automatische Gewinnerwahl.
Die erneute Vorschau und Bestätigung sind Pflicht. Master-Rollback ersetzt diese Foto-Rücknahme nicht.

## Separater Lua-Schreibkern

`IdentityWorkflow.lua` verbindet die Bausteine mit `preview`, `prepare`, `applyNext` und `reviewRun`.
`prepare` bestätigt erneut, bereitet neue Zielstichwörter vor, liest Fotos erneut und speichert erst dann das
dauerhafte Journal. `applyNext` liest das Journal, prüft den Katalog, bestätigt einen Block, schreibt ihn und
protokolliert erst nach Rücklesung den Abschluss. Ein fehlgeschlagener Journalabschluss nach erfolgreichem
Fotoschreiben bricht ab und benötigt Wiederaufnahmeprüfung; kein automatischer zweiter Schreibversuch.
`reviewRun` liest vor Rücknahme-/Wiederaufnahmebestätigung erneut; gelöschte Altstichwortobjekte werden als
nicht verfügbar weitergereicht, niemals neu erzeugt. Die Bedienung ruft je Block getrennt auf.

`IdentityCatalog.guard` prüft auch neu hinzugekommene oder entfernte FN-Fotos und außerhalb der Auswahl
geänderte Favoriten. Innerhalb des Schreibzugriffs startet er weder Helfer noch Dialog oder verschachtelte
Transaktion. Auch ab .40 holt er bei jedem Aufruf mit `getAllPhotos()` die vollständige aktuelle Fotomenge
und verwendet dieselben 250er-Sammelzugriffe; ein vorheriges Inventar wird nicht als aktuelle Prüfung
wiederverwendet. Der Wächter enthält kein explizites `LrTasks.yield()` und keinen Pausenpunkt im
Schreibblock. Der vorbereitende Leselauf behält Fortschritt, Abbruchprüfung und Yield vor jedem
250er-Block. Laufzeit und Bedienbarkeit großer Kataloge sind nativ zu messen, nicht aus den simulierten
Tests oder der Anzahl eingesparter SDK-Aufrufe abzuleiten.

Die Adobe-verfasste [SDK-Referenz zu den Batchmethoden](https://lrc.mcor.dev/modules/LrCatalog.html#catalog:batchGetPropertyForPlugin)
beschreibt beide Sammelzugriffe seit SDK3.0. Das bestehende Minimum SDK6.0 deckt sie ab.
Der [Schreibzugriffsvertrag](https://lrc.mcor.dev/modules/LrCatalog.html#catalog:withWriteAccessDo)
erlaubt Yield im Callback aus einem yieldfähigen Aufrufkontext, aber keine verschachtelten
Schreibzugriffe. Die Orchestrierung bleibt im Lightroom-Task unter `LrTasks.pcall`; der Wächter
fügt dafür weder einen eigenen Task noch einen expliziten Yield hinzu.

Für leere Stichwort-, Foto- oder Entscheidungsliste verwendet der neue Workflow explizite JSON-Arrays.
`Json.array` ist eine Opt-in-Erweiterung; gewöhnliche leere Tabellen bleiben für bestehende Aufrufer `{}`.

`IdentitySnapshot.lua` liest ausschließlich erlaubte FN-Taxonomiefelder, UUID und vorhandene verwaltete
Stichwortobjekte. Sowohl Lightroom-Listen als auch Objektmengen werden unterstützt. Nicht lesbare Objektkennungen
werden nicht erraten. Von FN-Ort/Zeit beanspruchte Namen bleiben geschützt.

`IdentityWriter.lua` ist nur über die bestätigte Orchestrierung erreichbar. Er schreibt höchstens 250 Fotos pro Transaktion,
mit zehn Sekunden Timeout und erneutem Zustandsvergleich im Schreibblock. Er fügt/trennt ausschließlich die
protokollierten verwalteten Stichwortzuordnungen, verändert nur geänderte FN-Taxonomiefelder und pflegt den
Statistikindex im selben Katalogschreibzugriff. Der Erfolg wird außerhalb der Transaktion vollständig zurückgelesen.
Keine verschachtelten Schreibzugriffe und keine gewöhnlichen `pcall`-Grenzen um SDK-Leseaufrufe.

`KeywordWriter.identityTemplate` ist eine reine Zusatzfunktion mit den vorhandenen Namens-, Pfad- und
Längenregeln. Die normale `assign`-Konfliktsperre bleibt unangetastet. Vor der dauerhaften Journalvorbereitung
kann der neue Writer ausdrücklich bestätigte **Ziel**stichwörter anlegen, damit ihre IDs im Nachherstand feststehen.
Wird die folgende Vorbereitung abgebrochen, können leere neue Zielstichwörter bestehen bleiben; keine Fotos sind
dadurch zugeordnet. Diese Grenze nennt die Schlussbestätigung ausdrücklich. Katalog-Stichwortobjekte werden
weder gelöscht noch für die Rücknahme neu angelegt.

## Tests und offene Verbindung

`lightroom-identity.test.mjs` prüft Planung und Journal mit echten isolierten SQLite-Dateien; die vorhandenen
Registerintegrationstests prüfen die Foto-Vorschau gegen wirklich erzeugte Master-/Suchpakete.
`scripts/lightroom-identity-lua.test.mjs` führt den Lua-Kern mit simulierten SDK-Objekten aus und parst alle
Plug-in-Dateien. Fengari ist dafür eine Entwicklungsabhängigkeit, kein Teil des Lightroom-Laufzeitpakets.
Es implementiert Lua 5.3, nicht Lightrooms eingebettete Laufzeit: Die Tests sichern Syntax, Fachwirkungen und
simulierte Task-/Transaktionsfehler ab, ersetzen aber keine echte Lightroom-Abnahme.

Prüfung am 10. September: zwölf direkte Foto-/Journaltests, sechs Lua-Ausführungstests einschließlich
Parseprüfung sämtlicher ausgelieferter Lua-Dateien und 13 Plug-in-Vertragstests bestanden. Die komplette
Suite `test:lightroom` bestand 83 Tests; `quality:ci` ebenfalls bestanden (Exit 0). Nach der zusätzlichen
460-Byte-Sperre für Zielstichwort-IDs wurde `test:lightroom` vollständig wiederholt und bestanden.
`status:sync` ausgeführt, `git diff --check` ohne Befund. Squarespace-Footer geprüft: keine eingebundene
Frontend-Datei verändert, deshalb keine `?v=`-Erhöhung. Keine produktiven Foto-/Datenbankänderungen.

Separater Befund: `npm audit` meldete beim Testlaufzeit-Setup eine hohe Warnung für die schon vor diesem
Schritt vorhandene Electron-Downloadabhängigkeit `undici@7.28.0`, nicht für Fengari. Sie ist in der Roadmap
vor dem Audit eingeplant; das bestandene `quality:ci` ist keine Entwarnung dieses Abhängigkeitsbefunds.

Fortsetzung am 10. September: sechs weitere direkte Tests bestanden, insgesamt 18 Foto-/Journaltests plus
vier bestehende Suchhelfertests. Geprüft wurden Paketwechsel trotz gecachter Suche, echte Schnappschusshashes,
persistente Vorbereitung, Prüfung ohne aktives Paket, Teilabbruch, Rücknahmeabbruch, veraltete Bestätigungen,
parallele Rücknahmesperre und Favoritenabhängigkeiten mit 253 Fotos über mehrere Blöcke. Kein Lightroom-Katalog
angesprochen; keine Lua-Datei in dieser Fortsetzung geändert, deshalb bleibt die Plug-in-Version 0.4.24.11.
Die komplette Lightroom-Suite bestand jetzt 89 Tests; `quality:ci` erneut bestanden (Exit 0). Die anschließend
ergänzten Prüfungen für Kandidatensperre und vollständige blockweise Rücknahme bestanden im erneuten Lauf
aller 18 Foto-/Journaltests. Dokumentation und Status wurden aktualisiert. Keine Änderung an einem
Squarespace-eingebundenen Skript, daher weiterhin keine Footer-Versionsänderung.

Fortsetzung am 11. September (0.4.24.12): 19 Foto-/Journaltests, 13 Lua-Tests und 13 Plug-in-Vertragstests
bestanden; gesamte Lightroom-Suite: 97 Tests bestanden. Neue Tests prüfen den Lua-Ablauf mit simuliertem
SDK und Helfer: Vorbereitung ohne Fotoänderung, Übernahme/Rücknahme, verlorener Journalabschluss,
Katalog-/Paketwechsel direkt vor dem Schreibblock, externe Favoriten, Pause, Parallelaufruf, fehlende
Altstichwörter und JSON-Übertragung leerer Listen. Kein echter Lightroom-Test, keine produktiven Änderungen.
Das vollständige `quality:ci` bestand ebenfalls erneut (Exit 0). `status:sync`, Dokumentationsprüfung und
`git diff --check` ausgeführt. Squarespace-Footer geprüft: keine dort eingebundene Datei verändert.

Bedienergänzung am 11. September (0.4.24.13): sechs ausführbare Dialog-/Steuerungstests ergänzen Auswahl,
fehlende Vorauswahl, Schlussbestätigung, Abbruch, Favoritenwahl, Journalfortsetzung, Rücknahme und Behandlung
verlorener Schreibabschlüsse. Die komplette Lightroom-Suite umfasst jetzt 103 bestandene Tests.
Auch das vollständige `quality:ci` bestand mit der Bedienergänzung (Exit 0); Status, Dokumentation und
`git diff --check` sind geprüft. Kein Commit/Push und keine produktive Foto-/Masteränderung in diesem Schritt.
Offen bleibt die praktische Abnahme im separaten Lightroom-Katalog einschließlich Großkatalogmessung.
Erst danach produktive Freigabe. Der anschließend geplante
inkrementelle Master-/Paketaufbau bleibt verbindlich vor dem Audit.
