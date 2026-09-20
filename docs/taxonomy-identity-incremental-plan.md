# Taxonidentitäten und inkrementeller Aufbau vor dem Phase-10-Audit

Stand: 2026-09-12

Status: Fachregeln durch den Benutzer bestätigt; Umsetzung in Arbeit. Implementiert sind das versionierte
Identitätsregister, Kandidatenprüfung, vorgemerkte Entscheidung, Explorer-Fallansicht und bestätigte
Projekt-Nachfolgerzuordnung. Foto-Vorschau, Journal und Lua-Lese-/Schreiborchestrierung sind verbunden und
simuliert getestet. 0.4.24.13 ergänzt die bestätigte Foto-Bedienaktion; praktische Abnahme und inkrementeller
Basisaufbau stehen aus. Keine produktive Datenmigration oder
Aktivierung dieses Arbeitsschritts. Der inkrementelle Aufbau von Master und Lightroom-Suchpaket bleibt Pflicht
vor dem Audit.

## Implementierungsstand am 10. September

- Master-Schema 4 speichert eine versionierte, prüfsummengeschützte Entscheidungshistorie. Schema 2 und 3 bleiben
  lesbar; aktive Altbestände werden nicht beim Öffnen migriert. Die Versionsprüfung verwendet dieselbe zentrale
  Liste unterstützter Schemata wie der Masterleser.
- `taxonomy-identity-registry.mjs` prüft Fortführung, Split und Merge einschließlich Quellenbelegen,
  Reihenfolge der Historie, Reichsgrenze, eindeutigen IDs und expliziter Bestätigung. Ein fachlicher Zusammenhang
  wird nicht aus ähnlichen Namen abgeleitet: Die Quellenprüfung belegt die Datensätze, die Fallentscheidung
  bestätigt der Benutzer.
- `taxonomy-identity-review.mjs` liest nur gewählte Vorgänger aus dem aktiven Master und gewählte Ziele aus dem
  Kandidaten. Die geschützten POST-Aktionen `/api/taxonomy/master/identity/preview` und
  `/api/taxonomy/master/identity/save` prüfen Vorschautoken, Master-/Quellen-/Eingabestand erneut. Speichern
  schreibt ausschließlich `master/identity-review.json` im lokalen Taxonomiespeicher, unter der bestehenden
  Korrektursperre. Weder Kandidat noch aktive Datenbank noch Fotos werden dabei verändert.
- `taxonomy-identity-build.mjs` wendet bestätigte Beziehungen nur auf einen neuen Kandidaten an. Fortführungen
  behalten ihre ID, Namen und Projektverknüpfung. Splits/Merges erhalten neue Ziel-IDs und historische Vorgänger;
  auch ein gleichnamiger Nachfolger erbt keine alte Namenspräferenz. Explizit an die neue ID gebundene spätere
  Präferenzen bleiben erhalten. Eine Umbenennung mit späterem Split reaktiviert keinen früheren Alias als neue Art.
- Vorgemerkte Entscheidungen verhindern die Aktivierung eines älteren Kandidaten. „Datenbank aktualisieren“
  behandelt sie auch ohne neue Downloads als Arbeit. Nach passender Aktivierung gilt derselbe Registerstand
  nicht mehr als offen. Datenstandänderungen invalidieren noch nicht angewendete Entscheidungen.
- Das Suchpaket übernimmt die Historie in `package_info.identityRegistry`; Suchhelferaktion `identity` meldet
  historische IDs und unmittelbare Nachfolger ohne automatische Umleitung. Paket-Schema und Lua-Plug-in bleiben
  unverändert. Der anschließende isolierte Lua-Schreibkern erhöht das Plug-in auf `0.4.24.11`;
  noch keine Lightroom-Bedienoberfläche für diese neue Helferaktion.

Die Explorer-Ansicht `Artänderungen prüfen` ergänzt den Datenbankbereich. Sie liest Projektlinks in Seiten mit
höchstens 20 Einträgen, zeigt nur geänderte Zuordnungen und bietet getrennte, begrenzte Suchen im aktiven Master
und Kandidaten. Leere Suchfelder starten nichts. Quelleneinträge und ihre Versionen stehen bei beiden Seiten;
eine Namensähnlichkeit ist ausdrücklich kein Nachfolgerbeleg. Deutscher Name bevorzugt, wissenschaftlicher Name
und Reich zusätzlich. Aktive schnelle Namenskorrekturen werden bei Suche und Vorschau berücksichtigt.

Die Auswahl eines Falltyps und eine Begründung führen zuerst zu `Auswirkungen prüfen`. Erst Vorschau, ausdrückliche
Bestätigungscheckbox und `Entscheidung vormerken` erlauben das Speichern. Jede Eingabe-/Auswahländerung invalidiert
die Vorschau. `Später entscheiden`, Schließen und eine verspätete Suchantwort speichern nichts. Die Ansicht
startet weder Aufbau noch Aktivierung noch Katalogscan. Ohne Kandidaten gibt es eine Erklärung, keinen Autostart.
Eine bereits anderweitig bestehende Zielart wird schon vor dem Vormerken abgewiesen, wenn sie nicht ausdrücklich
als Vorgänger einbezogen ist.

Offene Vormerkungen können nach separater Rücknahmevorschau und zweitem Bestätigungsklick verworfen werden.
Die Datei wird dabei auf die **aktive** Registerhistorie gesetzt; aktive Entscheidungen werden nicht entfernt.
Vorgemerkte Kandidaten müssen danach gegebenenfalls erneut gebaut werden. Token schützt vor zwischenzeitlichen
Änderungen. Das funktioniert auch als Neubeginn nach geänderten Grundlagen; es ist kein Datenbankrollback und
keine Foto-Rücknahme. API-Ergänzungen: POST `identity/browse`, `identity/discard-preview`, `identity/discard`
unter `/api/taxonomy/master/`.

Die bestätigte **Projekt-Nachfolgerzuordnung** ist jetzt implementiert. Nach einer ersten Vorschau wählt der
Benutzer für jede betroffene Projektart genau ein Ziel aus den zuvor ausgewählten Nachfolgern. Auch bei nur einem
Merge-Ziel erfolgt keine Vorauswahl. Zusätzlich muss er bestätigen, dass die bisherigen Projekttexte lokal
bleiben und nicht auf die neuen Masteridentitäten übertragen werden. Anschließend sind eine erneute Vorschau
und die allgemeine Fallbestätigung nötig. Ohne vollständige Zuordnung bleibt Speichern gesperrt.

Diese Wahl wird als `projectAssignments` im unveränderlichen Identitätsereignis gespeichert: Projektkennung,
ursprünglicher Slug/wissenschaftlicher Projektname, Vorgänger-ID, gewähltes Ziel und Namensregel
`keep-project-local`. Bei jedem Neuaufbau folgt ausschließlich der bestätigte Projektlink dem Ziel; Projektdateien,
Website-Texte, Slugs und Assets werden nicht geändert. Der alte Projektname wird weder Synonym noch Namensfeld
des Nachfolgers. Neue eigene Namenswahlen für eine Ziel-ID bleiben über den normalen Korrekturweg möglich.
Bei einer wissenschaftlichen 1:1-Fortführung bleibt der bestehende Erhalt eigener Namen unverändert.

Der Kandidatenbau prüft Vollständigkeit, ursprüngliche Projektzuordnung und unveränderte Projektidentität erneut.
Fremde Projekte, doppelte Ziele für dieselbe Projektart, veränderte Vorschauen und unbestätigte Namensregeln werden
abgewiesen. Nach einem weiteren Split benötigt auch ein bereits zugeordnetes Projekt eine neue ausdrückliche
Zielentscheidung. Master-Rollback stellt die vorherigen Projektlinks wieder her, nicht Lightroom-Schreibvorgänge.

Offene Grenzen dieses Teilstands: praktische Abnahme der **Foto**-Nachfolgerzuordnung einschließlich
Rücknahmebedienung und Großkatalogmessung. Foto-Vorschau, Journal, Favoritenprüfung, Lua-Schreibkern und
Bedienaktion sind verbunden; Details: `lightroom-identity-workflow.md`. Keine produktive Identitätsmigration ausführen, bevor
diese Verbraucherfolgen abgenommen sind. Der kurze Explorer-Test (Öffnen, gezielte Suche, Schließen) wurde
vom Benutzer bestätigt; noch keine echte Split-/Merge-Migration abgenommen.
Identitätsketten sind gespeichert; die explizite Fotoübertragung ist implementiert, aber noch nicht praktisch abgenommen.

Automatisiert geprüft: 19 Identitätstests mit isolierten echten SQLite-Datenbanken, Kandidatenaufbau, Paketexport,
weiterem Quellenstand, Rollback, unveränderten aktiven Dateiinhalten, Schutz eigener Namen und veralteten
Entscheidungen, begrenzter Fallauswahl, Projekt-Split/Merge und kontrolliertem Verwerfen, auch nach Rollback.
Projekt-Reichsalias `Metazoa` wird wie im vorhandenen Kandidatenbau zu `Animalia` normalisiert, ohne die
Projektdatei umzuschreiben. Die Kette Split → Fortführung → erneuter Split erhält den Link bei der Fortführung,
verlangt bei der nächsten Aufteilung eine neue Entscheidung und lässt sich auf den vorherigen Master zurückrollen.
Dazu sechs UI-/Controller-Tests einschließlich vollständiger Projektentscheidung mit erneuter Vorschau,
Wiederanlaufentscheidung im Explorer und Schema-Kompatibilität in der Versionsprüfung.
Die Suites `test:taxonomy-master` und `test:lightroom` enthalten diese Regressionen. Kein realer Katalogscan und
kein produktiver Quelldownload. Squarespace-Footer geprüft: ausschließlich lokale Explorer-JS geändert,
deshalb kein Squarespace-`?v=`-Wechsel.

Prüfergebnis des ersten Backend-Teils am 9. September: `npm.cmd run --silent quality:ci` bestanden (Exit 0), einschließlich 82
Mastertests, 64 Lightroom-/Suchpakettests und der vollständigen übrigen Qualitätssuites. `status:sync`
ausgeführt. Dies ist eine automatisierte Prüfung des Teilstands, keine produktive Lightroom-Abnahme und kein
Phase-10-Abschlussaudit.

Folgeprüfung der Explorer-Fallansicht am selben Tag: vollständiges `quality:ci` erneut bestanden (Exit 0).
Der zunächst gefundene Größenverstoß in `app.js` wurde durch modulseitige Einrichtung der Fallansicht behoben,
ohne die Architekturgrenze des Tests zu lockern. Anschließend zusätzlich den zweiten Rücknahmeklick,
Abbrechen ohne Schreiben und Verwerfen nach Rollback ergänzt: alle 20 direkten Identitäts-/UI-Tests bestanden.
Keine produktive App neu gestartet oder Datenbank aktiviert. Die sichtbare Ansicht benötigt für einen späteren
Bedienungstest den neuen Server- und Frontendstand; automatisierte Controllerprüfungen ersetzen keine visuelle Abnahme.

Folgeprüfung am 10. September: alle 25 direkten Identitäts-/Controller-Tests und das vollständige
`npm.cmd run --silent quality:ci` bestanden (Exit 0). Der separat ausgeführte Lightroom-Plug-in-Vertragstest
bestand ebenfalls alle 12 Prüfungen. `status:sync` ausgeführt; `git diff --check` ohne Befund.
Dieser Stand ergänzt die Projekt-Nachfolgerzuordnung samt Ketten- und Reichsalias-Regressionen; keine
produktive Aktivierung, keine Fotoänderung und kein Ersatz für die noch offene manuelle Abnahme.

Anschließender Foto-Teilstand am 10. September: Vorschau-/Journalkern und isolierter Lua-Schreibkern in
Plug-in 0.4.24.11 ergänzt. Zwölf direkte Foto-/Journaltests, sechs ausführbare Lua-Tests, 13 Plug-in-Vertragstests
und die gesamte Lightroom-Suite mit 83 Tests bestanden; vollständiges `quality:ci` bestanden.
Noch kein bedienbarer Fotozuordnungsweg: Verbindung, Wiederaufnahme und Rücknahmedialog stehen aus.
Speicher-, Favoriten-, Test- und Rücknahmegrenzen stehen in `lightroom-identity-workflow.md`.

## 1. Nachgewiesene Ausgangsbasis vor der Implementierung

Geprüfte Ausgangsbasis: Commit `d487667`, Plug-in `0.4.24.10`. Der Benutzer hat am 8. September auch
`Namenswahl übernehmen` ohne Fotozuweisung praktisch bestätigt. Eine bereits offene Benutzeränderung an
`taxonomy-reference-corrections.json` bleibt von dieser Analyse unberührt.

| Bereich | Vorhandener Code | Grenze |
| --- | --- | --- |
| Master-ID | `createStableMasterTaxonId` in `taxonomy-master-model.mjs`: Hash aus normalisiertem wissenschaftlichem Namen, Rang und Reich | Deutsche/englische Namenswahl ändert keine ID; geänderte Identitätskomponenten können eine neue ID erzeugen. |
| Vorgängerfelder | `taxonomy-master-candidate.mjs`: exakte Identität oder beidseitig eindeutige, reichskompatible Zuordnung | Kein allgemeines Register für bestätigte wissenschaftliche Umbenennungen, Aufteilungen oder Zusammenführungen. |
| Änderungsvergleich | `taxonomy-master-diff.mjs`: neue/entfernte IDs, veraltete Taxa, Namen und Synonyme | Neue und entfernte Datensätze ergeben noch keinen belegten Nachfolger. Gleiche ID beweist keine unveränderte fachliche Artabgrenzung. |
| Explorer-Projektprüfung | `taxonomy-project-conflicts.mjs`: exakte Treffer, Synonymvorschläge, Mehrdeutigkeit, Referenzlücken | Prüft Projektarten, nicht Lightroom-Fotos und nicht sämtliche historischen Masteridentitäten. Ein Synonymvorschlag ist kein Aufteilungs-/Zusammenführungsnachweis. |
| Konfliktentscheidungen | `taxonomy-master-lifecycle.mjs`: bisherigen Wert behalten, Kandidat übernehmen, Alias ergänzen, manuell schützen | Feldentscheidungen sind keine bestätigte Übertragung von Fotos auf eine andere Art. |
| Lightroom-Katalogpflege | `CatalogMaintenance.lua`: gruppiert Fotos nach gespeicherter Master-ID; verarbeitet nur exakt gefundene aktive Taxa | Fehlende/inaktive IDs werden übersprungen. Ein fachlicher Split bei gleich gebliebener ID wird dadurch nicht erkannt. |
| Aktivierung | `TaxonomyMasterService.runActivate`: Master aktivieren, danach Lightroom-Paket bauen | Einzelne Stände wechseln atomar, aber der Vollaufbau hat noch keinen gemeinsamen Alles-oder-nichts-Wechsel von Master und Paket. Paketfehler werden als Teilerfolg behandelt. |
| Schnelle Namenskorrektur | Gemeinsamer atomarer Korrekturzeiger für beide Verbraucher | Dieser bestehende Sekundenpfad ersetzt weder Identitätsverwaltung noch inkrementellen Basisaufbau. |

Die ID-Funktion verarbeitet keine fachliche Konzeptrevision. Ändert sich die Artabgrenzung bei gleichem Namen,
Rang und Reich, bleibt ihr Ergebnis gleich. Auch eine gleich gebliebene Anbieter-ID darf deshalb nicht allein
als Beweis unveränderter Artabgrenzung behandelt werden. Diese Grenze ist ein Befund am Datenmodell, kein
Nachweis, dass im aktuellen produktiven Bestand ein konkretes Taxon falsch zugeordnet ist.

## 2. Bestätigte Fachregeln (Gesamtumfang noch in Umsetzung)

| Fall | Vorgeschlagene Behandlung | Bestehende Fotos |
| --- | --- | --- |
| Andere deutsche/englische Bezeichnung | Bestehender Namenskorrekturweg; gleiche Master-ID | Nur bei ausdrücklich gestarteter FN-Aktualisierung nachziehen. |
| Wissenschaftliche Umbenennung, nachweislich dieselbe Art | Bestätigte 1:1-Identitätsfortführung; vorhandene Master-ID erhalten, alten Namen als belegten Alias behalten | Keine automatische Hintergrundänderung; Aktualisierung zeigt bisherigen/neuen Namen. |
| Neue Quellen-ID, sonst belegbar identische Art | Neue Quellenverknüpfung zur bestehenden Identität | Keine Neuzuordnung allein wegen einer anderen Quellenkennung. |
| Aufteilung einer bisherigen Art | Alte Identität als historische Sammelzuordnung erhalten; enger abgegrenzte Nachfolger getrennt führen, auch wenn einer denselben Namen behält | Keine globale 1:n-Umleitung. Benutzer wählt passende Fotos und bestätigt genau einen Nachfolger für diese Auswahl; Rest bleibt ungeklärt. |
| Zusammenführung bisheriger Arten | Belegte und bestätigte n:1-Beziehung; Zielidentität ausdrücklich festlegen, keine ID allein anhand des Namens auswählen | Bestätigte Vorschau darf betroffene Gruppen gesammelt übertragen; abweichende Präferenzen und mehrere Favoriten vorher klären. |
| Quelle fehlt, widerspricht sich oder belegt keinen Nachfolger | Als ungeklärt kennzeichnen; keine automatische Gleichsetzung, Löschung oder Nachfolgerwahl | Bisherige Metadaten und Stichwörter behalten; Taxonomieaktualisierung dieser Fotos überspringen. |

Ein Vollbestand aller Anbieter wird nicht als endlose Entscheidungsliste vorgelegt. Entscheidungen erscheinen
vorrangig für betroffene Projektarten und für ausdrücklich im Lightroom-Abgleich ermittelte Fotozuordnungen.
Andere ungeklärte Identitäten bleiben intern markiert und bei einer späteren Verwendung prüfpflichtig. Wie
betroffene Lightroom-IDs lokal an den Explorer übergeben werden, gehört zum Implementierungsvertrag; derzeit
besitzt der Explorer keine vollständige Übersicht aller Lightroom-Zuordnungen. Kein neuer Scan beim Öffnen
des Zuweisungsfensters.

### Verständliche Bedienung

Ein Fall zeigt bisherigen deutschen Namen, bisherigen wissenschaftlichen Namen, vorgeschlagenes Ziel und die
kurze Begründung mit Quelle und Quellenstand. Die Fotozahl wird nur angezeigt, wenn Lightroom sie tatsächlich
ermittelt hat. Keine erfundenen Unterscheidungsmerkmale oder automatische Bestimmung anhand von Ort/Datum.

- Eindeutiger Fall: `Zuordnung prüfen`, anschließend Vorschau und ausdrückliche Übernahme.
- Aufteilung: `Fotos in Lightroom prüfen`; ausgewählte Teilmenge einem Nachfolger zuweisen.
- Immer möglich: `Später entscheiden`. Das ist keine Zustimmung zur Änderung.
- Eine Bestätigung gilt für den geprüften Fall und Stand, nicht blind für spätere Quellenupdates.
- Keine zusätzliche Bestätigung je technischem Schreibblock; neue Konflikte invalidieren die betroffene Vorschau.

Eigene Namenspräferenzen folgen einer bestätigten identischen Art. Bei einem Split werden sie nicht automatisch
auf alle Nachfolger kopiert. Bei einem Merge gewinnen widersprechende eigene Namen nicht zufällig nach
Verarbeitungsreihenfolge. Mehrere bisherige Art-Favoriten benötigen eine explizite Wahl oder bleiben bis dahin
unverändert; die Statistik darf keine still ausgewählte Gewinneraufnahme vortäuschen.

## 3. Technischer Umsetzungsvorschlag

1. Bestehende Master-IDs unverändert übernehmen. Ein versioniertes Identitäts-/Beziehungsregister ergänzt
   die bisherige Hashbildung; kein katalogweiter Austausch aller IDs. Es erfasst Alt-/Zielidentitäten,
   Beziehungstyp, fachlichen Geltungsbereich, Quellenbelege, Quellenversionen, Bestätigung und Rücknahme.
   Die genaue Speicherform und Schemaänderung werden im Implementierungsschritt spezifiziert.
2. Identitätsfortführung und fachliche Nachfolger getrennt behandeln: 1:1 bei gleicher Art ist etwas anderes
   als n:1 oder 1:n bei geänderter Artabgrenzung. Historische Identitäten dürfen nicht durch erneute Hashbildung
   versehentlich als aktuelle Art wiederverwendet werden. Zyklen, Selbstnachfolger und widersprüchliche
   bestätigte Zielketten sind zu verhindern.
3. Kandidatenbau, Suchpaket und Katalogprüfung benutzen denselben versionierten Beziehungsstand. Alter und
   neuer Quellenbezug bleiben nachvollziehbar. Korrekturen werden vor Übernahme erneut gegen die Identität
   geprüft; bei unklarer Übertragbarkeit bleibt die alte Entscheidung erhalten, aber nicht blind angewendet.
4. Speichervorschauen an Quellenversionen, Identitätsrevision, Korrekturrevision und Zielpaket binden. Ändert
   sich zwischen Vorschau und Schreiben ein relevanter Stand, neu prüfen statt die alte Entscheidung auszuführen.
5. Lightroom bleibt alleiniger Katalogschreiber. Ein global bestätigter Nachfolger verändert noch kein Foto.
   Erst der ausdrücklich gestartete Kataloglauf oder die bestätigte Auswahlzuweisung schreibt blockweise.
   Die Identitätsaktion verändert keine Orts-/Zeitdaten und keine unverwalteten Stichwörter.

### Rücknahme und Teilerfolge

Master-Rollback macht bereits erfolgte Lightroom-Schreibvorgänge nicht rückgängig. Für den neuen
Nachfolgerworkflow ist deshalb zusätzlich ein begrenztes, persistentes Änderungsjournal implementiert:
Katalogkennung, Foto-UUID, vorheriger/nachheriger FN-Taxonomiestand, verwaltete Stichwortzuordnung,
Favoritenstand und abgeschlossener Block. Speicherort, Größenlimit und Aufbewahrung sind in
`lightroom-identity-workflow.md` festgelegt. Die Helferbrücke verbindet jetzt bestätigte Vorschau und Journal,
prüft Wiederaufnahme und plant favoritenabhängige 250er-Blöcke. Seit 11. September verbindet Lua-Version
0.4.24.12 die Helferbrücke mit explizitem Kataloglesen und geprüftem Schreiben/Rücklesen. 0.4.24.13 ergänzt
Bedienaktion und Rücknahmebedienung. Praktische Lightroom-Abnahme und Großkatalogmessung bleiben offen;
keine produktive Freigabe.

Eine gezielte Rücknahme darf nur Fotos zurücksetzen, deren jetziger FN-Stand noch dem protokollierten Ergebnis
entspricht. Zwischenzeitlich bearbeitete Fotos werden als Konflikt gemeldet. Erfolg wird erst nach bestätigtem
Schreiben gezählt. Ein Abbruch lässt fertig geschriebene Blöcke sichtbar bestehen; eine Wiederholung muss
idempotent sein. Für den produktiven Erstlauf bleibt eine vorherige Lightroom-Katalogsicherung erforderlich.
Eine unbegrenzte oder bedingungslos rückstandslose Rücknahme wird nicht zugesagt.

## 4. Inkrementeller Aufbau: verbindlich vor dem Audit

Implementierung am 11. September begonnen: `taxonomy-build-inputs.mjs` bietet isolierte, versionsgebundene
SQLite-Eingangscheckpoints und einen streamenden Vergleich normalisierter Anbieter-Datensätze. Die anschließende
Anbindung über `taxonomy-master-inputs.mjs` speichert nun geprüfte Eingänge beim Explorer-Vollaufbau mit dem
Kandidaten und vergleicht sie nachgelagert. Noch keine gemeinsame Master-/Paketaktivierung.
Am 12. September folgt der konservative nachgelagerte Abhängigkeitsplan aus beiden Masterständen einschließlich
alter Verknüpfungen, Gattungsableitung und zustandsabhängiger Taxa. Die anschließende begrenzte Wiederverwendung
ist für unveränderte Graphstruktur vor die Ergebnisberechnung geschaltet und mit kleinen Vollaufbau-Vergleichen
geprüft. Großbestandsmessung, Strukturwechseloptimierung, Lightroom-Paket und gemeinsamer Wechsel bleiben offen.
Vertrag, Tests und verbleibende Schritte: `taxonomy-incremental-build.md`.

Der Aufbau soll geänderte Datensätze und deren Abhängigkeiten neu berechnen, unveränderte Ergebnisse aber
wiederverwenden. Ein vollständig neuer Quelldownload oder ein vollständiger lesender Vergleich kann weiterhin
nötig sein, wenn ein Anbieter keine geeigneten Deltas liefert. Inkrementell bedeutet nicht, dass jeder
Quellenwechsel in wenigen Sekunden abgeschlossen ist. Es wird hier kein neuer Anbieter-Deltaendpunkt behauptet.

Geplante Arbeitspakete nach Freigabe der Identitätsregeln:

1. **Reproduzierbare Eingänge:** Quellenstände, normalisierte Datensatzfingerabdrücke, Regeln, Projektwerte,
   Korrekturen und Identitätsentscheidungen versionieren. Fehlende Zeilen nur bei nachgewiesen vollständiger
   Quelle als entfernt behandeln; ein unvollständiger Abruf ist kein Löschauftrag.
2. **Änderungen und Abhängigkeiten:** Neue/geänderte/entfernte Datensätze sowie betroffene Nachfahren,
   Hierarchiepfade, Synonyme, Quellenverknüpfungen, manuelle Entscheidungen und Suchbegriffe ermitteln.
   Reine Release-Zeitstempel dürfen keine fachliche Änderung aller Taxa vortäuschen. Eine globale Regeländerung
   kann dagegen berechtigt eine vollständige Neuberechnung verlangen.
3. **Getrennten Kandidaten bauen:** Unveränderte Resultate übernehmen, betroffene Resultate mit denselben
   Fachregeln wie beim Vollaufbau berechnen. Nicht in aktive SQLite-Dateien schreiben. Kopier-/Speicheraufwand
   großer SQLite-Dateien gesondert messen; Wiederverwendung der Berechnung bedeutet nicht zwingend null Kopien.
4. **Passendes Lightroom-Paket vorab bauen:** Aus exakt diesem Masterkandidaten und demselben Korrektur- und
   Identitätsstand. Auch Paketzeilen, Hierarchien und Suchindex gezielt aktualisieren. Master und Paket müssen
   vollständig geprüft sein, bevor ein gemeinsamer Aktivierungszeiger die neue Kombination freigibt.
   Beide Verbraucher müssen diesen Vertrag lesen; alte Leser und Windows-Dateisperren brauchen einen
   getesteten Übergang. Die CoL-Eingangsreferenz darf separat neuer sein, solange die sichtbare Master-/Paket-
   Kombination konsistent bleibt und ausstehende Ableitung ausdrücklich angezeigt wird.
5. **Fortschritt und Wiederanlauf:** Schweren Aufbau außerhalb des Explorer-UI-Prozesses ausführen;
   dauerhafte, versionsgebundene Checkpoints und Pause/Abbruch vorsehen. Bei geändertem Input keinen alten
   Checkpoint blind fortsetzen. Kurz vor Aktivierung Revisionen erneut prüfen; zwischenzeitliche
   Namenskorrekturen dürfen nicht verloren gehen. Kein halbfertiger Stand wird aktiv.
6. **Vergleich und Rückfall:** Inkrementelles Ergebnis mit Vollaufbau bei identischen Eingängen und derselben
   Identitätshistorie vergleichen: Taxa/IDs, Lebenszyklen, Namen, Hierarchien, Provenienz, Entscheidungen,
   Verknüpfungen und Suchergebnisse. Bytegleiche SQLite-Dateien sind wegen technischer Metadaten nicht das Ziel.
   Vollaufbau bleibt verfügbar; unbekannte Schemata, Regelwechsel oder unsichere Deltas verlangen einen
   verständlich angekündigten Vollaufbau beziehungsweise eine Sperre, niemals still unvollständige Resultate.

## 5. Prüfplan und Freigabekriterien

- Namensänderung bei gleicher Art, Quellen-ID-Wechsel, Rang-/Reichsänderung und Homonyme getrennt prüfen.
- Split mit neuem Namen und Split mit unverändertem Namen eines Nachfolgers prüfen; alte Fotozuordnung bleibt
  bis zur Auswahlentscheidung erhalten. Ein stabiler Name/Quellenschlüssel ist keine hinreichende Entwarnung.
- Merge mit widersprechenden Präferenzen und mehreren Favoriten; keine zufällige Übernahme.
- Quellenverlust, unvollständiger Anbieterabruf, Wiederkehr und unbelegter Nachfolger bleiben unterscheidbar.
- Projektart und nur in Lightroom verwendete Art; leere Auswahl, große Auswahl, veraltete Vorschau und
  Paralleländerungen zwischen Vorschau/Schreibblöcken prüfen.
- Abbruch/Neustart in jeder Aufbauphase, Paketfehler, Dateisperre, fehlender Speicher und Rollback mit
  geöffnetem Explorer/Lightroom testen. Datenbankrollback und Foto-Rücknahme getrennt abnehmen.
- Vollaufbau-/Delta-Gleichheit mit kleinen Fixtures, mehreren aufeinanderfolgenden Updates und anschließend
  einem separaten großen Testbestand; Laufzeit, Spitzen-RAM, Speicherbedarf und UI-Bedienbarkeit messen.
- Gemeinsames Qualitätsgate, aktualisierte Dokumentation und gebündelte Lightroom-Abnahme vor Gesamtaudit.

Am 8. September ausgeführt: 47 vorhandene Tests aus `taxonomy-master.test.mjs`,
`taxonomy-master-regression.test.mjs`, `taxonomy-master-candidate.test.mjs`,
`taxonomy-maintenance-service.test.mjs` und `lightroom-plugin-contract.test.mjs` bestanden. Dazu fünf rein
speicherinterne Assertions gegen die produktive ID-Funktion: Namenspräferenz/Quellen-ID ohne Einfluss;
wissenschaftlicher Name, Rang und Reich ID-relevant; fachliche Konzeptrevision bei gleichem Tupel nicht erfasst.
Das sind Bestandsschutz und Analysebelege, keine Tests einer bereits implementierten Nachfolger-/Deltafunktion.

## 6. Nächste Implementierungsschritte

Bestätigtes Ziel: automatische Ermittlung belegter Prüffälle, aber kein automatisches Umschreiben von Fotoidentitäten;
1:1-Fortführung und n:1-Nachfolger erst nach Fallbestätigung, Splits ausschließlich für bewusst gewählte
Foto-Teilmengen. Unklare Fälle bleiben erhalten und übersprungen. Auf das begonnene Identitätsregister folgt der
kontrollierte Zuordnungsweg, danach inkrementeller Master-/Paketbau, Betriebs- und Lightroom-Abnahme und zuletzt
Phase 10.5. Der inkrementelle Aufbau ist nicht mehr als optional nach Phase 10 verschoben.

Die erste Leistungs-/Grenzprüfung des begrenzten Masterwegs ist am 12. September mit 10.000 synthetischen
Arten erfolgt. Ergebnisgleichheit und Schutz der bisherigen Stände bei simuliertem Abbruch sind belegt.
Laufzeitausreißer und höherer Speicherbedarf verhindern noch eine Großbestandsfreigabe; Einzelwerte sind keine
Laufzeitprognose. Messverfahren und nächste Grenzen stehen in `taxonomy-incremental-build.md`.
