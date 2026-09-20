# Lightroom-Artänderungen: Vorschau, Journal und Schreibkern

Stand: 2026-09-20

Status: **implementiert, praktische Lightroom-Abnahme offen**. Vorschau und Journal sind
über den Suchhelfer verbunden; Wiederaufnahmeprüfung und favoritenabhängige Blockplanung sind implementiert.
Der Lua-Schreibkern ist nun mit ausdrücklichem Katalogleselauf, Journalvorbereitung, blockweiser Übernahme
und Rücknahmeprüfung verbunden. Auswahl, Bestätigungsdialoge, Fortschritt und Rücknahmebedienung sind
über „FN Wildlife verwalten“ → „Artänderungen prüfen ...“ erreichbar. Kein produktiver
Katalog wurde in den automatisierten Prüfungen verändert. Eingeführt in Plug-in-Version `0.4.24.13`, aktuell
weiterhin enthalten in `0.4.24.14`; die normale Zuweisung und Orts-/Zeitaktionen bleiben
unverändert. Gesamtumfang: `taxonomy-identity-incremental-plan.md`.
Der Benutzer hat das reine Öffnen ohne Auswahl bestätigt. Das ist keine Abnahme einer tatsächlichen
Split-/Merge-Übernahme oder ihrer Rücknahme; hierfür weiterhin einen separaten Testkatalog verwenden.

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
alle Master-IDs und Favoritenstände. Vollständige FN-Schnappschüsse werden nur für Auswahl-/Journalfotos und
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
Transaktion. Dieser sichere Erststand liest pro Block erneut die katalogweiten Grundfelder; der Vergleich
unter Schreibsperre ist nicht pausierbar. Laufzeit und Bedienbarkeit großer Kataloge sind vor Freigabe zu
messen, nicht aus den kleinen simulierten Tests abzuleiten. Der vorbereitende Leselauf meldet Fortschritt
in 250er-Schritten und kann vor der nächsten Schreibaktion gestoppt werden.

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
