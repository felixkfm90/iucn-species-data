# Lightroom-Suchpaket und FN-Wildlife-Plug-in

Stand: 2026-10-27
Roadmap: Phase 10.2 bis 10.4
Status: lokaler Quellstand Plug-in-Version **0.4.24.42** unterstützt den gemeinsamen Master-/Suchpaketzeiger und die daran
gebundene Namenskorrektur. Der belegte Teilquellenverlust nach dem ersten Paarwechsel vom 28. September ist
seit 1. Oktober durch die eng bestätigte Quellenreparatur behoben. Das gemeinsam aktivierte Paar ist unabhängig
vollständig geprüft; alle 154 ursprünglichen IDs aktiv, vier Ersatz-IDs historisch, keine fremden Zusatz-IDs.
Felix bestätigte Weissstorch/Rebhuhn im Explorer, tatsächliche Lightroom-Zuweisung und Erhalt nach
Schließen/Wiederöffnen. Das Gesamtaudit ist im vereinbarten Umfang abgeschlossen; verbleibende
Betriebs-/Bediengrenzen sind im führenden Auditauftrag ausdrücklich zugeordnet.
Aktueller [Betriebsstand](taxonomy-current-status.md) und [Reparaturabschluss](taxonomy-partial-source-recovery.md).

.42 unterstützt die ausgeführte Umstellung des gemeinsamen Standardordners von `Daten` auf `data`.
Der Resolver unterstützt beide Konfigurationsnamen und löst belegte alte Datenpfade auf, ohne historische
Journale oder Paket-/Auftragsbelege umzuschreiben. Die tatsächliche Umbenennung und ihre Nachweise stehen im
[Speichervertrag](storage-migration.md). Für .42 ist hier noch keine native Neuladung bestätigt;
der zuletzt nativ bestätigte reguläre Stand bleibt .40. Die zwischenzeitliche private .41 war eine Auditprobe.

.40 bündelt die katalogweiten Grunddaten der Artänderungsprüfung in 250er-SDK-Leseblöcken.
Jeder Leselauf und Schreibwächter erfasst weiterhin alle Katalogfotos frisch; vollständige Schnappschüsse
bleiben für Auswahl-/Journalfotos und alle Favoriten erhalten. Die reguläre .40 ist am Produktivpfad
nativ als geladen belegt. Private .41 mit identischer `IdentityCatalog.lua` hat im eigenen Großkatalog
den Ein-Foto-Ablauf aus Initialisierung, Vorschau, Vorbereitung, Übernahme und Rücknahme abgeschlossen.
Der unabhängige Endvergleich der geschlossenen Katalogkopien ist für die erfassten rohen
FN-/Foto-/IPTC-Werte und Stichwortrelationen bestanden; das künstliche Foto ist zurückgenommen.
Die inkrementellen Statistikänderungen sind geprüft, eine frische Vollstatistik wurde nicht aufgebaut.
Die Batchregeln und genauen Nachweisgrenzen stehen im
[Artänderungsvertrag](lightroom-identity-workflow.md#vorschau-und-favoriten); diese Funktionsprobe ist
kein Gesamtaudit-Go. Aktuelle Belege und Abnahmegrenzen führt der
[Auditauftrag](audit-auftrag-phase-10-5.md).

.39 erhält nach dem Detail-Leser Properties und einmalige Observer. Geschlossene Fenstergenerationen
verlieren ihre Callbackberechtigung; beide Fensterübergänge geben die SDK-Task frei. Die gezielte
Fenster-X-/Suchprüfung im eigenen Sechs-Foto-Katalog ist bestanden. Der anschließende enge native
Detailfensterlauf bestätigt auch Escape, Fertig, Zurück/Weiter, erneute Suche und Tab-Rückkehr;
andere Windows-Systemschrift-/DPI-Konfigurationen und die genaue ursprüngliche Ursache bleiben offen.

Historischer Abschlussstand vor der jetzigen Großkatalogprobe:
Split B/C und Merge F bestehen native Übernahme und genaue Rücknahme mit vollständigem Nachvergleich.
Auch die Mehrblockpause/Wiederöffnung mit 253 Testeinträgen, SDK-Fehler, Commit-vor-Journal-Wiederanlauf
und gezielte Konflikt-/Teil-/Endrücknahme sind unabhängig geprüft. Die private Testkopie ist deaktiviert;
reguläre .39 am Produktivpfad und Hauptkatalog auf D: sind wiederhergestellt. Die repräsentative
Großkatalogprüfung für Laufzeit, Speicher und Abbruch bleibt offen. Den jeweils tatsächlich geprüften
Stand und seine Grenzen führt ausschließlich der [Auditauftrag, Abschnitt 10.54](audit-auftrag-phase-10-5.md).

Der Ersatzaufbau und gemeinsame Master-/Paketwechsel sind am 24. Oktober abgeschlossen. Kein
weiterer Aufbau folgt aus diesen Prüfnachweisen; aktiver Paarstand und Quellen bleiben im
[Taxonomie-Betriebsstand](taxonomy-current-status.md) dokumentiert. Ältere Testzähler und Zwischenstände
unter 10.51/10.53 sind datierte Nachweise, kein laufender Auftrag oder jüngster Gesamtprüfstand.

Neu erzeugte Suchpakete verwenden Schema **2** mit verpflichtendem Leservertrag
`unused-classification-retention-v1`. Der aktuelle Node-Suchhelfer kann alte Schema-1-Pakete ohne
Retentionsmarker weiterhin lesen; alte Leser verweigern Schema 2. So lassen sich ausschließlich als
ungeklärter Bestand erhaltene Klassifikationen nicht mit einem alten Leser neu zuweisen. Datenbank
und Manifest müssen denselben Leservertrag tragen. Die direkt lesbaren Verwaltungsdetails behalten
den Erhaltungsnachweis; Suchtreffer, einzelne Zuweisungsabfragen und neue Artanlagen sperren diese
Fälle. Rohe CoL-/Ergänzungstreffer derselben konkret zurückgehaltenen Anbieterbelege können die
Explorer-Sperre nicht umgehen; eine Artanlagevorschau bindet dafür die stabilen Anbieterkennungen.
Separate Paketaktivierung/-rücknahme verweigert tatsächliche Retentionspakete auch ohne bisherigen
Paarzeiger und verlangt den gemeinsam geprüften Master-/Paketpfad.
Die katalogweite Pflege behandelt ihre ID als nicht zuweisbar und überspringt sie im vorhandenen
Pflegepfad. Andere veraltete Quellenstände erhalten dadurch keine pauschale neue Sperre.
Das am 24. Oktober gemeinsam aktivierte Master-/Paketpaar verwendet Schema 2 und diesen
Retentionsvertrag. Aktueller Paarstand im [Taxonomie-Betriebsstand](taxonomy-current-status.md),
Aktivierungs- und Lesernachweise im Auditauftrag, Abschnitte 10.51 und 10.54.

Version **0.4.24.25** ergänzt fehlende Orts-/Zeitfelder und Stichwörter auch bei einem bereits teilweise
zugewiesenen Foto. `Hinzufügen` erhält gespeicherte FN-Werte; `Aktualisieren` gleicht die verfügbaren aktuellen
Lightroom-Quelldaten ab. Fehlende Quellen löschen keinen noch gespeicherten FN-Wert. Die Katalogpflege
prüft Metadaten, tatsächliche FN-Stichwortobjekte und interne Kennungen und schreibt nur notwendige
Korrekturen. Sie zählt Taxonomie und Ort/Zeit unabhängig, also auch Orts-/Zeitänderungen an Taxonomiefotos.
GPS ohne nutzbaren Lightroom-Ortsvorschlag wird ausdrücklich von fehlendem GPS unterschieden.
Vorhandene FN-Ortswerte vermeiden einen erneuten Vorschlagsexport; fehlgeschlagene Vorschläge ohne
gespeicherten Ort können bei einem bewusst neu gestarteten Abgleich erneut geprüft werden.
Ein allein vorhandener ISO-Ländercode bleibt ein gültiges FN-Metadatum ohne eigenes Stichwort. Fotos
ohne verwertbare Angaben werden unverändert übersprungen; die Bereinigung verwaister interner Belege
oder reservierter FN-Zuordnungen zählt als tatsächliche Änderung.
Version **0.4.24.26** ergänzt für Videos ohne gültiges `dateTimeOriginal` den SDK-Wert
`dateTime` als Ersatz; dessen Grenze bei bestimmten MOV ist inzwischen nativ belegt und mit .29 korrigiert.
Eine gültige ursprüngliche Aufnahmezeit hat Vorrang. Dateinamen und Foto-Scanzeiten dienen nicht als Ersatz;
ohne verwertbare Aufnahmezeit bleiben gespeicherte FN-Zeiten
erhalten. Die automatisierte Prüfung umfasst sechs künstliche Videos, gemischte Foto-/Videoauswahl und
wiederholten unveränderten Abgleich: **70/70** bestanden. Der produktive FN-Abgleich mit .27 vom
14. Oktober ergänzt die sechs Bartmeisen-Videos korrekt um November/2025 und die tatsächlichen
Zeitstichwörter; derselbe lesende Nachvergleich bestätigt alle vorhandenen FN-Zuordnungen passend.
Rohwerte des SDK werden dadurch nicht unabhängig protokolliert. Beleg und Abnahmegrenzen:
[produktiver FN-Abschluss](audit-auftrag-phase-10-5.md#1027-produktiver-fn-katalogabgleich--14-oktober).

Version **0.4.24.27** trennt fehlende Ortsvorschläge von tatsächlichen Vorschau-Export-/Lesefehlern,
sowohl bei FN-Daten aktualisieren als auch im separaten Ort/Zeit-Aufruf. Der Katalogabschluss benennt
FN-Schreibfehler separat. GPS allein garantiert keinen Ortsnamen.

Version **0.4.24.28** liest den vorhandenen Statistikindex beim erneuten Anzeigen nach einem Dialog und
unmittelbar vor einem Katalogexport frisch. Dadurch erscheinen inzwischen abgeschlossene FN-Zuweisungen
in der erneut angezeigten Statistik beziehungsweise im Katalogexport. Ein inzwischen ungültiger Index
verhindert den Export eines alten Ergebnisses; bestätigte Auswahlexporte behalten ihre konkrete Fotoliste.
Dabei läuft kein versteckter Katalogscan. Ein bereits sichtbares Statistikfenster wird nicht fortlaufend
automatisch aktualisiert. Die fünf neuen Verhaltenstests reproduzieren den alten Stand und die Korrektur;
die drei betroffenen Gruppen bestehen mit **93/93**. .28 ist am Abend des 14. Oktober nach explizitem
Neuladen am regulären Pfad nativ bestätigt; vollständiges lokales Gate **50 Gruppen / 1.745 bestanden**.
Buckelwal und die vorhandenen Statistik-Kontrollsummen sind nativ passend. Die eigene März-/April-Probe
mit verborgenem Stapelmitglied ist für Taxonomiezuweisung und separates Ort/Zeit-Hinzufügen bestanden;
neue Exporte bleiben eine getrennte Abnahme. Verlauf und native Grenze ausschließlich im
[Auditauftrag, Abschnitt 10.30](audit-auftrag-phase-10-5.md#1030-buckelwal-statistik-und-neue-auditreihenfolge--14-oktober).

Version **0.4.24.29** erlaubt den direkten Zuweisungsmenüpunkt ausdrücklich auch bei reiner Videoauswahl.
Nur bei Lightrooms bestätigtem `isVideo=true` wird nach fehlender Originalzeit `dateTimeDigitized` vor
`dateTime` geprüft: beim nativ geprüften MOV enthält erstere Quelle das sichtbare Aufnahmedatum,
letztere dagegen die spätere Dateierstellung. Fotos verwenden keine Digitalisierungs-/Scanzeit als Ersatz.
Rohwert und formatierte Anzeige werden geprüft; gültige Originalzeit behält Vorrang, fehlende Quellen
löschen keine gespeicherte FN-Zeit. Vier neue Verhaltenstests reproduzieren die echte widersprüchliche
MOV-Quelle; vier betroffene Gruppen bestehen mit **110/110**. Private .29 im eigenen Katalog nativ geladen:
direkter Videozugang aktiv und FN-Aktualisierung korrigiert das alte MOV-Datum samt echten Zeitstichwörtern.
Die übrigen vier Testeinträge bleiben erhalten. Die eigene Statistik schließt das Video und dessen nur dort
verwendete Art korrekt aus. Die unveränderte Wiederholung deckte zusätzlich eine verzögerte Speicherung
neuer Stichwortkennungen auf; Korrektur und weitere Exportfälle sind getrennte Abnahmen im
[Auditauftrag, Abschnitt 10.31](audit-auftrag-phase-10-5.md#1031-native-video-datumsquellen-und-fortsetzung--15-oktober).

Version **0.4.24.30** führte den Abschluss neu verfügbarer interner Stichwortkennungen nach dem ersten
SDK-Schreibabschluss ein. Der kurze zweite Zugriff prüft Fotoidentität, sämtliche FN-Werte und die exakten
zugewiesenen Stichwortobjekte vor jeder Änderung; er schreibt nur die noch fehlenden Kennungen.
Bestehende vollständige Kennungen brauchen keinen zweiten Zugriff. Die verzögerten Kennungen sind
mit Gegenproben für unveränderte Wiederholung, konkurrierende Änderungen und Schreibsperren geprüft:
**83/83** betroffene Verhaltenstests; vollständiges lokales Gate **50 Gruppen / 1.767 bestanden**.
Die damalige Aktivierung des Originals im Hauptkatalog war keine native Schreibabnahme. Die nachfolgende
.31-Probe im eigenen Katalog scheiterte, weil die rohe SDK-Stichwortliste innerhalb des ersten
Schreibzugriffs die gerade hinzugefügten Wörter noch nicht enthielt. Der genaue native Fehler bleibt
im Auditauftrag als historischer Befund erhalten.

Version **0.4.24.32** bindet vor dem ersten Schreibabschluss die tatsächlich an `addKeyword` übergebenen
Stichwortobjekte und ihre beauftragten Namen. Eine innerhalb dieses Zugriffs noch alte SDK-Leseliste
verwirft deshalb keine bereits ausgeführte Zuweisung. Nach Rückkehr aus dem äußeren Schreibzugriff werden
Fotoidentität, sämtliche FN-Werte und die wirklichen reservierten Stichwortzuordnungen aller geänderten
Bereiche gemeinsam geprüft, auch bei schon vollständigen Kennungen oder einem leeren Ergebnis.
Unveränderte Bereiche behalten ihre Namen und Objektidentitäten; Dubletten, fremde Änderungen und
nicht eindeutig zuordenbare Objekte stoppen den Abschluss. Nur tatsächlich fehlende interne Kennungen
benötigen anschließend einen zweiten Schreibzugriff. Gezielte echte Lua-Gegenproben **97/97** und das
vollständige lokale Gate vom 15. Oktober, **09:27:16–09:35:06 MESZ, 50 Gruppen / 1.781 Tests**, bestanden
ohne Fehler, Abbrüche oder Skips; alle 126 gebundenen Quellen unverändert. Die folgende native .32-Erstprobe
speicherte im eigenen MOV zwar Dezember/2027 und die neuen tatsächlichen Stichwörter, stoppte aber beim
Kennungsabschluss mit einer vermeintlichen FN-Metadatenänderung. Die interne Kennung blieb leer;
der Teilabschluss wird nicht als erfolgreicher Gesamtlauf behandelt. Verlauf unter
[Auditauftrag, Abschnitt 10.31](audit-auftrag-phase-10-5.md#1031-native-video-datumsquellen-und-fortsetzung--15-oktober).

Version **0.4.24.33** bindet zusätzlich vor dem ersten Metadaten-Schreiben den vollständigen bisherigen
FN-/UUID-Stand. Die beiden Writer zeichnen danach in derselben Erwartung je Foto exakt die tatsächlich
geschriebenen normalisierten und begrenzten Werte auf, einschließlich Leerungen, Namen, Kennungen und
Zuweisungszeitstempeln. Die Nachprüfung nach dem SDK-Abschluss vergleicht dagegen; eine noch alte
Lesesicht innerhalb des Schreibzugriffs wird nicht als Beweis eines anderen Nachzustands übernommen.
Unberührte FN-Werte bleiben exakt geschützt. Es gibt keine nachträglich frei gelesene neue Basis,
Gleichsetzung von fehlendem Wert und Leerstring oder automatische Wiederholung. Gezielte Gegenprobe
**107/107** und unabhängige Review ohne weiteren Blocker. Vollständiges lokales Gate am 15. Oktober,
**14:14:45–14:26:45 MESZ: 50 Gruppen / 1.791 Tests**, keine Fehler, Abbrüche oder Skips;
126 gebundene Quellen unverändert.

Die eigene native .33-Orts-/Zeit-Erstprobe mit neuen Mai-/2028-Stichwörtern ist erfolgreich:
ein geänderter und zwei unveränderte Orts-/Zeiteinträge, alle drei Taxonomien bereits aktuell,
keine Schreibfehler; beide internen Zeitstichwortkennungen sind bereits nach diesem ersten Lauf vollständig.
Die unveränderte Wiederholung meldet null Taxonomie-/Ortszeitänderungen, alle drei Einträge aktuell und
keine Schreibfehler. Der unabhängige Nachvergleich besteht mit **31/31** Prüfungen: alle fünf vollständigen
Testeinträge einschließlich FN-Zeitstempeln, alle realen Stichwortzuordnungen und sämtliche Statistikvariablen
sind nach der unveränderten Wiederholung exakt gleich. Die erste Änderung schreibt nur die Statistik-
Buchführung fort; Foto-/Arten-/Beobachtungszahlen bleiben gleich und das Video ausgeschlossen.
Die weitere eigene native .33-Zuweisung mit neu erzeugter Taxonomiestichwortkennung ist im Erstlauf
vollständig. Wiederöffnung und unveränderte Wiederholung bestehen im vollständigen Nachvergleich mit
178/178 Prüfungen. Positive Favoritenzuweisung, abgelehnter und bestätigter Ersatz bestehen mit 123/123;
Taxonomie-/Orts-/Zeitwerte und tatsächliche Keywords bleiben dabei gleich. Gesamtgate 16. Oktober:
50 Gruppen / 1.805 Tests bestanden, 127 gebundene Quellen unverändert. Verdeckter Stapelkonflikt und
Taxonomierücknahme mit 102/102; vollständige FN-Rücknahme, Wiederzuweisung und getrennte Orts-/Zeit-
Rücknahme/Ergänzung mit 183/183 unabhängig bestätigt. Fünf Original-IPTC-Ortsfelder und Aufnahmezeit
bei allen fünf Testeinträgen erhalten. Hauptkatalog abschließend offen, genau ein reguläres Original .33
aktiviert, Testregistrierung entfernt/Belege erhalten. Diese kleine Matrix ersetzt keine weiteren nativen
Namens-/Handoff-/Pause-/Skalierungsprüfungen. Aktuelle Ergebnisse und Grenzen im
[Auditauftrag, Abschnitt 10.32](audit-auftrag-phase-10-5.md#1032-fortsetzung-explorer-und-lightroom-nach-reparaturabschluss--15-oktober).

Bei **Taxonomie zuweisen** sowie **Ort und Zeit → Hinzufügen/Aktualisieren** wird im Ordner-/Alle-Fotos-
Kontext ein ausdrücklich ausgewählter oberster eingeklappter Ordnerstapel einschließlich seiner verborgenen
Mitglieder erfasst. Die Auswahl ist dedupliziert; die Anzeige nennt eingeschlossene Stapelmitglieder.
Aufgeklappte Stapel, ausgewählte untere Mitglieder und aktive Sammlungs-/Publizierungskontexte bleiben bei
der konkreten Auswahl. Der SDK-Vertrag stellt den Zustand von Sammlungsstapeln hier nicht entsprechend
bereit; kein fremder Ordnerstapel wird dafür vermutet. Eine abweichende vorhandene Master-ID im erweiterten
Satz stoppt die gesamte Taxonomiezuweisung vor dem Schreiben. FN-Rücknahmen bleiben bei der ausdrücklich
markierten Auswahl. Die Katalogpflege liest ohnehin den ganzen Katalog, einschließlich Stapelmitgliedern.

Videos können FN-Taxonomie, Orte, Zeit und die zugehörigen Stichwörter erhalten. Sie werden anhand von
Lightrooms `isVideo` aus **Statistik, Arten-/Beobachtungszahlen, Favoriten-Fotopools und allen Statistikexporten**
ausgeschlossen. Der interne Aufbau-/Checkpointumfang bleibt die Zahl geprüfter Katalogdateien; sichtbare
Statistikwerte zählen Fotos. Indexschema **7** verwirft zuvor gespeicherte Indexe und pausierte Aufbauten
mit möglichen Videozahlen. Ein neuer Statistikaufbau ist danach einmal erforderlich. Die Änderung filtert
keine Videos aus FN-Daten aktualisieren oder dem FN-Nutzungsnachweis für Datenbankwechsel.

**Befehlswahl:** Erneute Taxonomiezuweisung schreibt die aktuelle ausgewählte Taxonomie und ergänzt Ort/Zeit
im Hinzufügenmodus. Bestehende FN-Orts-/Zeitwerte bleiben dabei erhalten. Ort/Zeit aktualisieren und
FN-Daten aktualisieren vergleichen verfügbare aktuelle Quellen und ersetzen abweichende Werte; ohne Quelle
bleiben bekannte FN-Werte erhalten. Die Katalogpflege repariert auch fehlende verwaltete Stichwörter und
schreibt passende vollständige Zuweisungen nicht erneut. Automatische Taxonomiepflege braucht eine gültige
gespeicherte Master-ID; ein manuelles FN-Stichwort, der Ordnername oder Dateiname genügen nicht.

Das Original **0.4.24.32** wurde am 15. Oktober um **13:57 MESZ** vom regulären Projektpfad im Hauptkatalog
nativ geladen und aktiviert bestätigt, einschließlich 273.485 Taxa und übereinstimmendem CoL-/Master-/
Lightroom-Suchpaketstand. Nach gesondertem Auftrag wurden sechs obsolete Test-/Diagnoseregistrierungen
entfernt; zu diesem Zeitpunkt blieb genau das Original registriert. Die zugehörigen Belegdateien blieben
erhalten. Die anschließenden privaten .32-/ .33-Schreibproben waren auf den eigenen Testkatalog begrenzt.
Nach deren Abschluss wurden auch diese beiden Registrierungen entfernt. Das reguläre Original **.33**
ist anschließend im wieder geöffneten Hauptkatalog nativ als einziger FN-Eintrag geladen und aktiviert
bestätigt, mit vollständigem übereinstimmendem Produktionspaar. Der Zusatzmodulmanager ist geschlossen;
Test- und Belegdateien bleiben erhalten. Der vollständige lokale Endprüflauf vom
15. Oktober besteht mit **50 Testgruppen und 1.791 Tests**. Die tatsächliche Reparatur gespeicherter
FN-Daten und die neue Statistikberechnung werden davon getrennt geprüft. Der von Felix freigegebene
produktive FN-Abgleich vom 14. Oktober ist abgeschlossen: 412 Taxonomie- und 938 Orts-/Zeitänderungen,
keine Schreibfehler; alle 6.472 FN-Zuordnungen im unabhängigen Nachvergleich passend. Die tatsächliche
Statistikberechnung mit Videoausschluss ist mit .29 im eigenen Fünf-Eintrag-Katalog nativ bestätigt;
die März-/April-Zuweisung an eingeklappte Stapel mit .28 ebenfalls. Die neue Exportmatrix ist mit
**sechs tatsächlich gespeicherten Varianten und 45/45 unabhängigen Inhalts-/Hashprüfungen abgeschlossen**:
drei positive Katalogexporte und drei Auswahlexporte ausschließlich mit dem künstlichen MOV. Letztere
enthalten korrekt null Arten/Beobachtungen; das TXT besitzt dabei einen 0-Arten-/0-Fotos-Kopf.
Die physischen .29-/ .31-/ .32-Prüfkopien und der .33-Quellstand besitzen sieben bytegleiche Export-/
Statistikmodule. Daraus folgt keine Gleichheit ihrer übrigen Dateien oder eine neue positive Foto-/
Favoriten-/Konflikt-/Rücknahmematrix. Der vollständige Verlauf steht
ausschließlich im [Auditauftrag](audit-auftrag-phase-10-5.md#1031-native-video-datumsquellen-und-fortsetzung--15-oktober).

Die Auditkorrekturen vom 8. Oktober sichern Auswahlaktionen gegen einen Filmstreifenfallback ohne aktive
Fotoauswahl, Statistik gegen unvollständige SDK-Batches und Änderungen während Pause/Aufbau sowie CSV gegen
Formelfelder. Namensgleiche reservierte Taxonomiestichwörter werden nach Objekt statt sichtbarem Namen entfernt.
Automatisierte Nachweise und native Restgrenzen stehen ausschließlich im
[laufenden Gesamtaudit](audit-auftrag-phase-10-5.md). Der registrierte Plug-in-Pfad ist frisch geprüft;
die tatsächlich geladene Version 0.4.24.24 wurde am 9. Oktober im Zusatzmodul-Manager nach Neuladen
am korrekten Projektpfad geprüft. CoL, Master und Suchpaket stimmen laut nativer Anzeige überein.
0.4.24.24 ergänzt die mehrzeilige Darstellung der zuvor nativ abgeschnittenen Hinweise bei fehlendem
Statistikindex und Exportauswahl. Felix hat am 9. Oktober selbst einen Statistik-Neuaufbau gestartet und
danach das geöffnete Statistikfenster zur Kontrolle freigegeben. Die unabhängige native Kontrolle bestätigt
den persistenten Indexstand 09.10.2026, 14:41, eine vollständig sichtbare Statistik und den vollständig
mehrzeiligen Auswahlhinweis im Exportdialog; dieser wurde damals ohne Dateiausgabe abgebrochen.
Die freigegebene kleine Testkatalogrunde vom 10. Oktober bestätigt zusätzlich beide vollständigen Hinweise
ohne aktuellen Index, positive und fehlende Zeit-/Ortswerte, Einzel-/Mehrfachauswahl, eine virtuelle Kopie,
getrennte FN-Rücknahmen und Erhalt eines manuellen Stichworts. Sechs eigene CSV-/CSV-/TXT-Exporte wurden
erstellt und inhaltlich geprüft. Ursprüngliches Plug-in und Hauptkatalog sind wiederhergestellt;
Papageientaucher wird dort nativ gefunden. Der Nachweis mit Quellenbindungen steht unter 10.17 des
[Auditauftrags](audit-auftrag-phase-10-5.md). Positive Favoritenmatrix, große Pause-/Race-Probe, Handoff
und weitere DPI-Stufen bleiben getrennte Abnahmen; angezeigte Statistikwerte sind kein erneuter
vollständiger produktiver Katalogscan.
Version 0.4.24.17 korrigiert Orts-/Zeitentfernung mit dokumentierten SDK-Objekten auch bei leeren FN-Metadaten,
ergänzt den unteren Entfernen-Button und drei Auswahlexporte mit Defaultnamen. Fehlender Statistikindex
wird nur bewusst neu aufgebaut. Technische Gegenproben und praktische Restabnahme:
[Bedienregressionen](audits/2026-10-03-acceptance-regressions.md).

Gemeinsamer Speicherumzug und Programmordnerwechsel waren am 4. Oktober nach `D:\Arten-Explorer\Daten` abgeschlossen;
Felix bestätigt anschließend Weissstorch/Rebhuhn in den Verbrauchern. 0.4.24.22 korrigiert den danach
gemeldeten Lua-Vergleich unterschiedlich geschriebener, aber belegter Windows-Pfade. Schrägstriche,
Groß-/Kleinschreibung und abschließende Trenner werden normalisiert; Herkunft, Revision und vollständiger
Umzugsnachweis bleiben gesperrt, wenn sie tatsächlich abweichen. Keine Änderung an Originalbelegen,
Datenbanken oder Fotos. Technischer Resolvernachweis bestanden; Felix hat den Betrieb ohne frühere
Warnmeldung am 5. Oktober bestätigt: [Reparaturnachweis](audits/2026-10-04-creation-abort-and-publication.md).

Felix bestätigt die Orts-/Zeitentfernung für Einzel-/Mehrfachauswahl sowie die neuen Exporte anhand eines Fotos
nach bewusstem Statistik-Neuaufbau. Das ist gezielte praktische Abnahme, kein Großkatalog- oder Gesamtaudit.
Version 0.4.24.18 glättet nur diese Fenster: `Orts- und Zeitdaten entfernen` steht in Schritt 4 unmittelbar
neben `Taxonomie entfernen`. Ein SDK-Kontrollabstand trennt Liste und rechtsbündigen Button
`Artbezeichnung korrigieren`. Die vier Namensaktionen stehen in einer Reihe und erhalten erklärende Tooltips;
nach frischem Detailabruf wird auch der Speicherbutton für einen schon bevorzugten Namen deaktiviert.
[Beschriftungen und Wirkung](taxonomy-name-preference-plan.md#lightroom-buttonbeschriftungen-ab-042418).

Der Screenshot vom 4. Oktober widerlegt die bisher angenommene Breitenfüllung: die native Liste behält
450 Pixel SDK-Standardbreite, obwohl die umgebende Gruppe breiter ist. 0.4.24.19 definiert deshalb eine
960-Pixel-Wurzelspalte, in allen vier Gruppen gleiche horizontale Ränder von 10 Pixeln und gemeinsame
940-Pixel-Innenspalten. Liste und Korrekturzeile gehören derselben Innenspalte an; die Liste erhält deren
Breite ausdrücklich. Keine vertikale Wurzelfüllung oder feste Dialoghöhe. Die nicht dokumentierten
FloatingDialog-Argumente `width`, `height`, `resizable` entfallen; Inhaltslayout und neue `save_frame`-Kennung
V7 ersetzen die alte gespeicherte Geometrie. Die Höhe der scrollbaren Taxonomieliste bleibt 150 Pixel.
Die bisher auch leer zweizeilig reservierte Namensstatusfläche entfällt. Such-/Aktions- und Namensrückmeldungen
teilen das vorhandene Statusfeld; dessen Tooltip enthält den vollständigen Text einschließlich Speicherfehlern.
`Zuletzt verwendet` beginnt mit leerer Auswahl und bietet darunter nur die gespeicherten zuletzt verwendeten
Arten. `Öffnen` wird erst bei expliziter Artauswahl und verfügbarem Paket aktiv. Kein Detailabruf allein beim
Öffnen des Fensters; nach Zuweisung und Wiederöffnen erneut leere Vorauswahl. Keine Namenspräferenz dadurch.

Im Verwaltungsfenster haben alle zwölf Aktionsbuttons keine Auslassungspunkte, jeweils einen kurzen sichtbaren
Erklärungstext und einen ausführlicheren Tooltip. Keine Aktion fachlich entfallen: Auswahl-Ort/Zeit, gesamter
Katalogabgleich und vollständige Auswahlbereinigung haben unterschiedliche Reichweiten. `FN-Katalognutzung
erfassen` bleibt Erstregistrierungs-/Wiederherstellungsweg; bei normalen bestätigten Datenbankupdates wird eine
nötige Erfassung automatisch angefordert. Kein manueller Zusatzschritt im regulären Weg.
Layoutgrundlagen: Adobe-SDK-Referenz für [Abstände](https://lrc.mcor.dev/modules/LrView%20child%20layout%20properties.html),
[Füllung/Mindestbreiten](https://lrc.mcor.dev/modules/LrView%20node%20layout%20properties.html) und
[Tooltips](https://lrc.mcor.dev/modules/LrView%20view%20properties.html), extern gespiegelte Adobe-Dokumentation.
Zusätzlich [native Listenbreite](https://lrc.mcor.dev/modules/LrView.html#viewFactory:simple_list) und
[FloatingDialog-Vertrag](https://lrc.mcor.dev/modules/LrDialogs.html#LrDialogs.presentFloatingDialog).
Erneute praktische Sichtprüfung dieses korrigierten Layouts noch offen. Keine neue Fotozuweisung, Erfassung oder Datenmigration
durch den UI-Umbau. Historische Prüfzahlen gelten weiterhin nur für ihren bezeichneten Stand.
Prüfabschluss der UI-Anpassung: Plug-in-Vertrag 19/19, zusammen mit Entfernungs-/Statistik-Lua-Gegenproben
47/47 erfolgreich, keine Fehler/Abbrüche/Skips. Neue Tests führen die realen Lua-Fenstermodule aus: Anordnung,
Beschriftungen, Rückfragen/Abbruch, Namensvorauswahl ohne Speichern, Anbieterstandard, Speicherfehler/Wiederholung,
alle zwölf Verwaltungsziele, Doppelauslösungsschutz und Schließen/Wiederöffnen. Das simuliert SDK-Verträge,
nicht das native Pixelrendering. Syntax/Stil/75 Markdown-Verweise/Projektstatus/Diff ebenfalls bestanden;
kein erneutes vollständiges quality:ci für diese enge Darstellungskorrektur.

Folgeprüfung 0.4.24.19: Plug-in-Vertrag 21/21, gemeinsam mit Entfernungs-/Statistik-Lua-Gegenproben 49/49
erfolgreich, keine Fehler/Abbrüche/Skips. Syntax 374 Dateien, Stil, 75 Markdown-Verweise, aktueller Projektstatus
und Diffprüfung bestanden; kein erneutes vollständiges quality:ci. Gleiche explizite Rand-/Breitenverhältnisse und
keine reservierte vertikale Füllung/Statusfläche, Schließen/Wiederöffnen, vollständig erhaltene Speicherfehler
und Wiederholung getestet. Recent-Auswahl mit vorhandener Historie: keine implizite Suche/Art, leere Auswahl
nach Zuweisung und erneutem Öffnen, bewusstes Laden, Ladefehler und unverfügbares Paket. Dies prüft reale
Lua-Steuerung mit SDK-Simulation, nicht die tatsächlichen Windows-Pixel oder die vom SDK gewählte Fensterhöhe.

## Vereinfachung der Verwaltungswege – Vorschlag vom 4. Oktober

Die folgenden Punkte beantworten Felix' Automatisierungsfrage. Der Vorschlag ist mit „los“ freigegeben und
in **0.4.24.20** sowie der lokalen Explorer-Oberfläche umgesetzt. Der Abschnittsname bleibt als bestehendes
Verweisziel erhalten. Dies ist Menüvereinfachung, **kein Auftrag zur automatischen Bestandsänderung**.
Geprüft sind vorhandene Menüziele, ihre Schreibwirkung, Explorer-HTML/Controller und der gespeicherte Updatevertrag.

| Bereich | Schon automatisch | Sinnvolle Vereinfachung | Grenze |
| --- | --- | --- | --- |
| FN-Katalognutzung | Im ausdrücklich gestarteten regulären Update nötige neue SDK-Erfassung anfordern und auf normales Lightroom-Schließen warten. | Einzelnen Erfassungsbutton unter Einrichtung/Wiederherstellung statt im normalen Hauptbereich. | Unbekannte Kataloge müssen einmal registriert werden; kein Scan ohne Auftrag. |
| Taxonomiedatenbank | Gespeicherte Quellen-/Master-/Suchpaketkette, sichere unbenutzte Klassifikationen und Fortsetzung nach letzter bestätigter Entscheidung. | Ein sichtbarer Aktualisierungsweg; technische Einzelwege und Rücknahme unter Weitere Aktionen. | Ein Start/Später; geschützte Änderungen, technische Fehler und frische Nachweise bleiben relevant. Praktische Gesamtabnahme offen. |
| Statistik | Eigene FN-Schreibaktionen führen den persistenten Index fort. | Neuaufbau als bedarfsbezogene Reparatur im Statistikfenster statt zusätzliche Hauptaufgabe. | Externe Änderungen nicht lückenlos SDK-beobachtbar; kein versteckter Vollkatalogscan beim Öffnen. |
| Ort und Zeit | Bei Taxonomiezuweisung aus vorhandenen Angaben fehlende FN-Ort-/Zeitdaten ergänzen. | Einzelaktionen Hinzufügen/Abgleichen/Entfernen unter einem Einstieg Ort und Zeit; Umfang und Wirkung dort eindeutig wählen. | Orts-/Zeit-Abgleich der Auswahl ist nicht der Taxonomieabgleich des gesamten Katalogs. Entfernen nicht automatisch auslösen. |
| Entfernen/Artänderungen | Keine automatische Entfernung oder Foto-/Projektmigration. | Doppelte Taxonomie-/Ort-/Zeitentfernungszugänge im Zuweisungsfenster bzw. gemeinsamen Ort-/Zeitbereich belassen; Gesamtentfernung und Review/Rücknahme unter Weitere Aktionen. | Rückfrage und bisherige Wiederherstellungswege erhalten; nur relevante Fälle aktiv anbieten. |
| Smart-Sammlungen | Lightroom hält eingerichtete Smart-Sammlungen anhand ihrer Regeln aktuell. | Einmalige geführte Einrichtung; Reparatur/Regelabgleich unter Einrichtung. | Aktuelles Einrichtungsskript ersetzt Regeln und löscht alte verwaltete Sammlungen. Nicht ungefragt beim Start ausführen. |
| Explorer-Artdaten und Medien | Artanlage nutzt bereits den gezielten Pipelineweg mit anschließender Assetprüfung. | Ein Einstieg Artdaten und Medien aktualisieren mit klarer Umfangswahl; gezielte Karten-/Soundsonderläufe unter Weitere Aktionen bzw. bei Bedarf. | Eigene Karten, Soundablehnungen, Lizenz-/Assetentscheidungen und manuelle Felder bleiben geschützt. IUCN-403 ist dadurch nicht repariert. |
| Backup und Bereinigung | Keine neue automatische NAS-Sicherung oder Löschung aus diesem Auftrag. | Backup-Pfad/technische Einstellungen, Speicherbereinigung und Rollback unter Weitere Aktionen. | Aufbewahrungsregel, Ziel und Sicherung gesondert festlegen; Bereinigung nach unverändertem Vorschauplan und Bestätigung. |

Umgesetzte normale Lightroom-Einstiege: `Taxonomie zuweisen`, `Art-Favorit festlegen`, `Ort und Zeit`,
`Statistik und Exporte`, `FN-Daten aktualisieren` sowie ein zusammengefasster Zugang `Weitere Aktionen`.
Keine vorhandene Fachaktion ersatzlos löschen. Der Aktualisierungseinstieg muss Umfang/Wirkung klar anzeigen;
ein Datenbankwechsel darf nicht still sämtliche bereits zugewiesenen Fotos umschreiben.

Im Explorer als Hauptwege `Taxonomiedatenbank aktualisieren`, `In Datenbank suchen und Namen korrigieren`
und `Artdaten und Medien aktualisieren`; Pause/Fortsetzen sowie konkrete Konfliktentscheidungen nur im
jeweiligen Zustand anbieten. Backup, Speicherpflege, Rücknahme, einmalige Vergleichsgrundlage und technische
Wiederherstellung gehören unter Weitere Aktionen. Die alten Quellen-/Master-Einzelbuttons sind im aktuellen
HTML bereits verborgen, nicht zusätzliche sichtbare Hauptoptionen.

Diese Umsetzung ändert weder den bestätigten [Updatevertrag](taxonomy-update-automation.md) noch
die [Nutzungsgrenze](lightroom-catalog-usage.md), Smart-Sammlungsregeln oder Such-/Zuweisungslogik.
Der damals noch offene separate [Speicherumzug](storage-migration.md) ist inzwischen abgeschlossen.
Keine zusätzliche Bestandsaktion, Erfassung oder Löschung beim Öffnen.

### Menüaufbau und Ausrichtung ab 0.4.24.20

Lightroom zeigt sechs Karten in zwei Spalten. `Ort und Zeit` öffnet Hinzufügen, Aktualisieren und Entfernen
für die Auswahl. `Weitere Aktionen` enthält Taxonomie entfernen, Artänderungen prüfen, alle FN-Daten der
Auswahl entfernen, Smart-Sammlungen einrichten und FN-Katalognutzung erfassen. Alle zwölf Skriptziele bleiben
erreichbar. Der Kurztext zu `FN-Daten aktualisieren` nennt ausdrücklich den gesamten Katalog; der Auswahl-
Ort/Zeitabgleich bleibt getrennt. Jede Unterseite besitzt Zurück und Schließen, immer nur eine Menüseite offen.
Das Zielskript wird erst nach Schließen des Menüs ausgeführt. Doppelauslösungsschutz, Fehleranzeige und
erneute Öffnung erhalten; reine Navigation schreibt nichts.

Buttons und Erklärungszeilen nutzen dieselbe feste 330-Pixel-Spalte. Der Text beginnt 3 Pixel innerhalb der
Layoutkante, um den im Screenshot sichtbaren Versatz zum nativen Windows-Buttonrahmen auszugleichen;
die Textbreite wird entsprechend verkürzt. Dies gilt für Hauptseite und beide Unterseiten. Tooltips bleiben
vollständig. Die tatsächliche Pixelkante kann nur in Lightroom geprüft werden, nicht durch die SDK-Simulation.

Im Explorer sind Karten-/Soundsonderläufe, Vergleichsgrundlage, Rollback, Artänderungen, Speicherpflege, Backup
und Bereinigung unter `Weitere Aktionen` zusammengefasst. Der Bereich beginnt auch nach Wiederöffnung
eingeklappt. Keine Funktion entfernt; IDs und bestehende Controllerverdrahtung unverändert. Pause/Fortsetzen
und Konfliktentscheidungen erscheinen weiterhin bei Bedarf. Allgemeine Arten-/Medienläufe verlangen wie bisher
zunächst eine Vorschau; das Aufklappen ist kein Laufstart.

Prüfabschluss: Plug-in-Vertrag **21/21**, gemeinsam mit Entfernungs-/Statistik-Lua-Gegenproben **49/49**;
Explorer-Menü/Updatevertrag **50/50**, zusätzliche Pipeline-/Bestätigungs-/Einstellungs-/Taxonomie-UI-Gegenproben
**49/49**, ohne Fehler/Abbruch/Skip. Reale Lua-Steuerung mit SDK-Simulation prüft alle zwölf Ziele,
Zurück/Schließen, Doppelklick, Zielfehler und erfolgreiche Wiederholung. Explorer-Gegenproben prüfen sämtliche
alten Aktionen genau einmal, standardmäßig geschlossenen Bereich, Vorschaufehler und Wiederöffnung ohne Start.
Syntax 374 Dateien, Stil, 75 Markdown-Verweise, synchronisierter Projektstatus und Diffprüfung bestanden.
Kein produktiver GUI-/Kataloglauf, kein Gesamtaudit oder vollständiges quality:ci daraus ableiten.
Geänderte Explorer-JS/CSS sind nicht in Squarespace eingebunden; Footer/Custom-CSS geprüft, keine dortige
Versionsänderung erforderlich. Speicherumzug und Veröffentlichung sind getrennte, inzwischen in den
aktuellen Betriebsdokumenten belegte Schritte; diese damalige Menüprüfung ist kein neuer Gesamtnachweis.

Version 0.4.24.15 ergänzt die ausdrückliche, nur lesende Aktion `FN-Katalognutzung erfassen …` im
Verwaltungsfenster. Zwei SDK-Durchgänge liefern eine Erfassungsquittung; erst normal geschlossenes Lightroom
und ausdrückliche Gesamtbestätigung im Explorer erlauben die Einstufung als unbenutzt. Kein automatischer
Katalogscan, keine Foto-/Metadaten-/Stichwortänderung. Praktische Erstaufnahme am 3. Oktober bestätigt:
128.871 Fotos, 5.484 FN-Zuweisungen und 56 genutzte IDs. Nutzungsnachweis und Klassifikationsaufteilung
lesend geprüft; produktiver Folgeaufbau und gemeinsamer Paarwechsel am 3. Oktober um 09:11:14 MESZ erfolgreich.
Paket `lightroom-fa739bd28ec1e82a0283` aus Master `master-20261003055911210`, alle 56 genutzten IDs vorhanden.
Felix bestätigt beide Testarten vorhanden und bevorzugt markiert; gezielte Suche-/Namensprüfung bestanden.
Die gesamte Bedienabnahme bleibt getrennt: [Abschlussnachweis](audits/2026-10-03-taxonomy-reference-update.md).
Version **0.4.24.16** ergänzt die requestgebundene Erfassung nur bei einem gespeicherten bestätigten Update-Start,
ohne allgemeine Katalogscans beim Öffnen. Der neue serverseitige Gesamtweg wartet auf normal geschlossenes
Lightroom und echte neue Quittungen; keine Neuprägung alter Nachweise. Normale Schließanforderung ausdrücklich
bestätigen, keine Zwangsschließung. Einmalige Nutzervereinbarung für die Zeit bis zum Schließen, kein SDK-Beobachter.
Zusätzlich Orts-/Zeit-Entfernungszähler und frische Paketprüfung vor jedem Katalogpflegeblock korrigiert.
Lokal umgesetzt, praktische SDK-/Gesamtabnahme noch offen: [Gesamtweg](taxonomy-update-automation.md).
Bedienung, Schutzregeln und konservative Frischegrenze: [FN-Katalognutzung](lightroom-catalog-usage.md).
Details: `taxonomy-incremental-build.md`. Version 0.4.24.13 ergänzte „Artänderungen prüfen ...“ im Verwaltungsfenster.
Die gemeinsame Paarvorbereitung und Rücknahmeprüfung laufen seit 20. September vollständig im Hilfsprozess;
der Explorer behält die kurze, erneut validierte Aktivierung. Kein automatischer Neuaufbau beim Öffnen.
Bedienung und Abbruchgrenzen: `taxonomy-master-background-build.md`. Die ID-geprüfte Altformatkorrektur für
Namenspräferenzen und die Zusammenführung eindeutiger CoL-/Mastertreffer sind im gemeinsamen Explorer-Dienst
umgesetzt; keine weitere Lua-Version für diese Änderungen. Aktueller Namensvertrag: `taxonomy-name-preference-plan.md`.
Nachfolger-/Favoritenwahl, Bestätigungen, Fortschritt, Pause und protokollierte Fortsetzung/Rücknahme sind
mit dem Vorschau-/Journal-/Schreibweg verbunden und simuliert getestet. Die echte Lightroom-Abnahme und
Großkatalogmessung stehen weiterhin aus.
Vertrag: `lightroom-identity-workflow.md`.
Ergänzung vom 30. September: Das unveränderte Historienformat transportiert auch den eng geprüften technischen
Reparaturtyp `source-repair`. Ersatz-IDs bleiben historische Fälle mit belegtem ursprünglichem Nachfolger;
Lightroom verlangt weiterhin explizite Nachfolger-/Fotowahl und Schlussbestätigung, keine automatische Umleitung.
Echter Paketbau, Suchhelfer und bestehende Lua-/Dialogverträge sind gezielt geprüft. Kein Lua-Modul wurde geändert,
deshalb keine neue Plug-in-Version. Reparaturkandidat und Paar sind inzwischen produktiv vollständig geprüft
und aktiviert; keine automatische Foto-/Projektmigration. Die vier historischen Ersatz-IDs sind keine zweite
aktive Art im Suchpaket. Der produktive Foto-Nachfolger-/Rücknahmeweg bleibt eine gesonderte Abnahme.
Vertrag: [Quellenreparatur](taxonomy-partial-source-recovery.md).
Der vorherige Suchpaket-/Plug-in-Stand 0.4.24.10 ist automatisiert verifiziert. Einzel- und Mehrfachzuweisung,
Zuweisungsfenster, Favoritenersetzung und das Entfernen der Taxonomie einschließlich der reservierten
FN-Stichwörter wurden mit den vorherigen Ständen im vorbereiteten Lightroom-Testkatalog praktisch geprüft. Die
Zuweisung und Auswahl-Refresh bis 0.4.16.0 wurden praktisch bestätigt. Die gemeinsame Namenswahl einschließlich
Anbieterstandard und direkter Übernahme wurde bis 0.4.24.10 ebenfalls praktisch bestätigt. Die spätere
Regressionskorrektur ist am 1. Oktober für Suche/Explorer-Anzeige und Zuweisung von Weissstorch/Rebhuhn praktisch
bestätigt; neue Präferenzspeicherung/Rückwahl und die übrigen aktuellen Abläufe bleiben Teil der getrennten
gebündelten Abnahme in der Roadmap.
Der persistente Statistikindex mit
CSV-Export sowie direkte Deltas nach Zuweisung und Rücknahme wurden im Großkatalog bis 0.4.21.1 praktisch bestätigt;
der Art-Favoritenfix von 0.4.21.2 wurde praktisch bestätigt. Die Orts-/Zeitaktionen von 0.4.22.1 und ihre
  Statistikauswertung von 0.4.23.0, die Aktionskorrekturen bis 0.4.23.16 sowie Gesamtbereinigung und Katalogpflege
  von 0.4.24.5 benötigen noch
den kontrollierten Lightroom-Test. Phase 10 bleibt bis zum umfassenden
Abschlussaudit offen.

Historischer Nachweis: Der reale Referenz-Master-Wiederanlauf vom 5. September 2026 ist technisch abgeschlossen: Paket
`lightroom-946c961bd063fd1b8f12` wurde automatisch aufgebaut, vollständig geprüft und um 08:32:51 Uhr MESZ
atomar aktiviert. Es stammt aus `master-20260905054823067` und derselben aktiven CoL-Referenz
`col-xr-2026-08-26-316165`. Die abschließenden read-only Suchtests bestätigen die bevorzugten Projektnamen und
eigenen Korrekturen, insbesondere Weißstorch, Taubenschwänzchen und Rotstirnamazone. Das Lua-Plug-in blieb
unverändert bei 0.4.24.6. Der Benutzer bestätigte Weißstorch in Lightroom und den passenden Masterstand im
Zusatzmodul-Manager; Commit/Push sind freigegeben. Dies bestätigt nicht sämtliche Zuweisungs- und Wartungsabläufe.
Der zusätzliche Vergleich mit der aktuellen lokalen Master-/Referenzversion ist anschließend in Version
0.4.24.7 implementiert und anschließend vom Benutzer bestätigt worden. `Lokales Suchpaket bereit`
bleibt eine Verfügbarkeitsanzeige. Der separate Versionsvergleich bestätigt nur konsistente lokale Datenstände.

## Lokaler Versionsvergleich ab 0.4.24.7

Im Zusatzmodul-Manager erscheinen aktive CoL-Referenz, CoL-Provenienz des Masters, aktive Master-ID,
Master-ID im Lightroom-Paket, Paket-ID und anwendbare Korrekturschicht. `Datenstand erneut prüfen` wiederholt
die asynchrone Abfrage. Das Zuweisungsfenster zeigt beim Öffnen dieselbe kurze Zusammenfassung über den
bestehenden Statusabruf. Die Plug-in-Version bleibt davon getrennt. Suche und Zuweisungsregeln ändern sich nicht.

`taxonomy-data-versions.mjs` besitzt den gemeinsamen Referenz-/Mastervergleich für Explorer und Suchhilfe.
Der neue Helferbefehl `versions` öffnet keine SQLite-Datenbank: Er liest die aktiven Versionsdateien zweimal
mit höchstens 64 KiB je Datei und prüft die Existenz der Paketdatenbank. Beim großen Mastermanifest wird nur
der vom Projekt geschriebene JSON-Kopf vor dem obersten `summary` gelesen, nicht die Differenzlisten. Abweichende
oder zu große Kopfstrukturen ergeben bewusst `nicht prüfbar`, keinen unbeschränkten Rückfall-Lesezugriff.
Eine anwendbare Korrekturschicht benötigt einen passenden Zeiger und eine passende unveränderliche Releasedatei.
Alte, nicht mehr anwendbare Korrekturzeiger werden nicht über den neuen Basisstand gelegt. Wechsel zwischen den
beiden Abfragen oder Abweichungen zum bereits geöffneten Paket werden nicht als übereinstimmend ausgegeben.

Die Zustände sind: lokale Stände stimmen überein, Referenz-/Master-/Paket- oder Korrekturabweichung, Suchpaket
fehlt, Aktualisierung läuft und Datenstand nicht prüfbar. Der Master-Service schreibt während Aufbau, Aktivierung,
Rollback, Korrekturanwendung und Paketnachholung einen kleinen Hinweis unter `taxonomy/master/update-presence.json`.
Nur ein höchstens 30 Sekunden alter Hinweis eines erreichbaren Prozesses gilt als laufend; alte oder nicht
überprüfbare aktive Hinweise gelten als ungeklärt. Dieser Hinweis ist weder Sperre noch Wiederanlaufcheckpoint.
Ohne Hinweis kann lediglich die Konsistenz der aktiven Dateien bestätigt werden. Bereits gestartete alte
Explorer-Versionen sowie separate externe Prozesse veröffentlichen diesen Hinweis nicht.

Keine Online-Releaseprüfung, neuen Statistik-/Katalogscans, automatischen Downloads oder Aufbauten. Die Anzeige
funktioniert auch bei geschlossenem Explorer. Für die Anzeige das Zusatzmodul neu laden, für den Laufhinweis
den Explorer vor künftigen Updates neu starten; Master und Lightroom-Paket benötigen dafür keinen Neubau.
Automatisiert geprüft werden fehlende/beschädigte Angaben, Drift, Korrekturschichten, große Manifestköpfe,
Versionswechsel und Laufhinweise. Die Darstellung wurde anschließend vom Benutzer bestätigt; die realen
Fehler-/Wechselzustände sind damit nicht zusätzlich manuell abgenommen.

Prüfstand vom 5. September 2026: acht neue fachliche Versionstests, vier Suchhelfer- und elf Plug-in-Vertragstests
sowie zwölf Master-Service-Tests erfolgreich. Alle 32 Lua-Dateien bestehen die Syntaxprüfung für Lua 5.1;
`npm.cmd run --silent quality:ci` ist erfolgreich. Der reale read-only Vergleich bestätigt die oben genannten
installierten Referenz-, Master- und Paketstände. Squarespace-JavaScript und CSS sind nicht betroffen;
Footer- und Cacheversionen benötigen keine Anpassung.

## Bewusste deutsche Namenswahl ab 0.4.24.8

Das Zuweisungsfenster bietet `Deutscher Name` mit belegten Varianten der ausgewählten Art. Eine andere Variante
wird in der Vorschau angezeigt, vor Ersetzen einer eigenen Präferenz mit bisherigem/neuem Namen bestätigt und
erst nach erfolgreicher Fotozuweisung global gespeichert. `Vorherigen Namen auswählen` bereitet eine
ausdrückliche Rückwahl vor. Englisch, wissenschaftlicher Name und Taxonomieidentität bleiben unverändert.

Der separate `lightroom-name-preference-helper.mjs` ruft denselben zentralen Dienst wie der Explorer auf.
Suchhelfer und Master-/Paket-SQLite bleiben read-only; die Entscheidung verwendet die vorhandene Korrekturdatei
und den atomaren Korrekturzeiger. Revision und Identität werden serverseitig geprüft, fremde ausstehende Korrekturen
nicht mit veröffentlicht. Die Korrekturspeicherwege teilen eine kurze prozessübergreifende Schreibsperre.
Ein fehlgeschlagener globaler Schritt wird getrennt von der Fotozuweisung gemeldet und kann über
`Speichern wiederholen` ohne Wiederholung der Zuweisung nachgeholt werden.

Explorer neu starten und Plug-in neu laden; kein Master-/Paketneubau nötig. Für bestehende Fotos bleibt die
bewusst gestartete FN-Aktualisierung zuständig. Die Namenswahl aus 0.4.24.8 ist praktisch bestätigt.
Ab 0.4.24.9 setzt `Anbieterstandard verwenden` nach Vorschau und Bestätigung den deutschen Namen global
zurück, ohne Fotozuweisung. Die Aktion verwendet eine gezielte Abfrage im Master, den gemeinsamen Korrekturzeiger
und eine dauerhafte Anbieterwahl statt eines festgeschriebenen Namens. Auch bereits eingebaute eigene Werte
werden dadurch abgelöst. Englisch und Rückwahl bleiben erhalten. Alte oder unzureichende Herkunftsdaten führen
zu einer verständlichen Ablehnung. Anbieterstandard und Rückwahl wurden vom Benutzer in beiden Richtungen bestätigt.
Ab 0.4.24.10 kann eine im Auswahlfeld gewählte Namensvariante über `Namenswahl übernehmen` unmittelbar global
gespeichert werden. Der Button verwendet dieselbe Vorschau, Konfliktrückfrage, Revisionsprüfung und Aktivierung
wie die Zuweisung; er ruft keinen Katalog-Schreibweg auf. Erfolgreiche Speicherung und erfolgreiche Wiederholung
laden den sichtbaren Namen neu. Unveränderte Auswahl und offene Speicherung geben keinen weiteren Direktauftrag
frei. Die neue Direktaktion wurde am 8. September vom Benutzer praktisch bestätigt.
Bedienvertrag, Rückwahl und Fehlergrenzen: `taxonomy-name-preference-plan.md`.

## Ziel

Lightroom Classic soll die vollständige aktive Taxonomie-Masterdatenbank offline durchsuchen können, ohne dass der
Arten-Explorer läuft und ohne dass Lightroom die fachlichen Stammdaten verändert. Eine ausgewählte Art kann nach
sichtbarer Prüfung einem oder mehreren gleichzeitig markierten Fotos zugewiesen werden. Geschrieben werden nur
eindeutig markierte Lightroom-Stichwörter und stabile Plug-in-Metadaten über das offizielle Lightroom-SDK.

## Architektur

```text
aktive Taxonomie-Masterdatenbank (read-only)
  -> abgeleitetes Lightroom-Suchpaket
     -> taxonomy-search.sqlite + manifest.json
     -> active / previous / staging
  -> kleine versionierte Namenskorrektur-Releases
     -> ein gemeinsamer atomarer Aktivierungszeiger für Masteransicht und Lightroom-Suche
  -> read-only Node-Suchhelfer
  -> deutsches Lua-Plug-in
  -> Lightroom-SDK
     -> flache, mit (FN) markierte Stichwörter
     -> stabile Plug-in-Metadaten
```

Die fachliche Wahrheit bleibt die Masterdatenbank des Arten-Explorers. Das Suchpaket ist eine reproduzierbare,
unveränderliche Ableitung und keine zweite pflegbare Taxonomiedatenbank. Es enthält alle nicht veralteten Mastertaxa,
alle Suchnamen, die vollständige verfügbare Hierarchie, Status, Anbieterbelege und vorhandene Projektverknüpfungen.
Seit dem Exportstand 0.4.19.0 bildet der vollständige bevorzugte Anbieterpfad den Fallback; rangweise ausgewählte
Master-Feldwerte überschreiben beziehungsweise ergänzen ihn. Damit kann ein unvollständiger Einzelbeleg nicht mehr
einen vollständig vorhandenen Masterpfad verkürzen, während zusätzliche Zwischenränge erhalten bleiben.

Lightroom greift weder auf die interne Master-SQLite noch auf den Explorer-Server zu. Der Suchhelfer öffnet das aktive
Suchpaket ausschließlich read-only. Katalog- und XMP-Dateien werden nie direkt bearbeitet.

Seit Version 0.4.20.0 müssen reine eigene Namenskorrekturen weder die Master-SQLite noch das mehrgigabytegroße
Lightroom-Basispaket kopieren oder neu aufbauen. Der Explorer löst jedes betroffene Taxon in beiden aktiven
Datenbanken erneut auf und verlangt dieselbe stabile `masterTaxonId`, denselben wissenschaftlichen Namen sowie
passende Basisversionen. Erst nach dieser Prüfung schreibt er ein kleines unveränderliches Korrektur-Release.
Ein einziges atomar ersetztes Manifest unter dem gemeinsamen lokalen Anwendungsdatenordner aktiviert dieses Release
für Masteransicht und Lightroom-Suchhelfer gleichzeitig. Bis zu diesem Zeigerwechsel lesen beide weiterhin den
bisherigen Stand; bei einem Fehler wird nichts teilweise aktiviert. Eine neue Lightroom-Suche öffnet den aktuellen
Stand bei jeder Anfrage neu, sodass weder Lightroom noch das Plug-in neu gestartet werden müssen.
Beim ersten Explorer-Start mit Version 0.4.20.0 wird ein fehlender Baseline-Zeiger nur erzeugt, wenn Vollmaster-
Fingerabdruck, aktuelle Korrekturdatei und aktives Lightroom-Paket bereits exakt zusammenpassen.

## Lokaler Speicher

Aktueller Standardpfad nach dem ausgeführten Ordnerwechsel vom 27. Oktober; die aktive Konfiguration und der Vollzug
des Namenswechsels stehen im [Speichervertrag](storage-migration.md):

```text
<Explorer-Ordner>\data\lightroom\
  active\
    manifest.json
    taxonomy-search.sqlite
  previous\
    manifest.json
    taxonomy-search.sqlite
  staging\

<Explorer-Ordner>\data\corrections\
  active.json
  releases\
    corrections-<Prüfsumme>.json
```

Zielvertrag vom 4. Oktober: gemeinsamer Daten-Unterordner beim Explorer als Standard, später in Einstellungen
wählbar. Explorer und Plug-in müssen denselben bestätigten Datenstand und dieselben Pfadbindungen verwenden.
Der AppData-Bestand ist vollständig übernommen und sein alter Datenordner leer, ohne Weiterleitung.
Aktueller Programmordner ist `D:\Arten-Explorer`; Verbraucherbindung und Umzug sind abgeschlossen.
Historische Zeiger-/Auftragspfade werden über das verifizierte Umzugsjournal aufgelöst; Belegbytes unverändert.
Plug-in-Hilfsdateien liegen im eigenen temp beim Plug-in und werden nach Ende eigener Operationen/Helfer
beim kontrollierten Schließen freigegeben; keine Katalog-,
Nutzungs-/Wiederanlaufdaten oder fremden Dateien. PluginShutdown allein ist auch bei Reload/Deaktivierung aktiv
und darf deshalb nicht pauschal als Lightroom-Schließnachweis gelten. [Umzug und Rückweg](storage-migration.md).
Vertrag und Prüfanforderungen:
[Temp-Konsolidierung](temp-retention.md#neuer-verbindlicher-speicher--und-tempauftrag--4-oktober-2026).

Die obige Ordnerstruktur beschreibt Installationen vor der Paarumstellung. Seit 13. September veröffentlicht
der Explorer unveränderliche Ordner `taxonomy/master/releases/publication-<UUID>` und
`lightroom/releases/publication-<UUID>` über genau einen Zeiger `taxonomy-publication/active.json` im gemeinsamen
Elternordner. Er enthält aktives Paar, Vorgänger und passende Korrekturschicht. Erst nach Vorbereitung und Prüfung
beider Dateien wird dieser Zeiger ersetzt; bei einem Fehler bleiben beide bisherigen Stände aktiv.
Ein passendes vorhandenes Legacy-Paar wird beim ersten Wechsel als Vorgänger übernommen. Nicht mehr referenzierte
Releases können seit 20. September ausschließlich nach Vorschau und Bestätigung bereinigt werden; aktives Paar,
genau ein geprüfter Vorgänger als Backup und benötigte Aufträge bleiben geschützt. Keine automatische Löschung.
Platzreserve, Prozesssperren und Grenzen: `taxonomy-storage-maintenance.md`.

Der Paketbau läuft seit 30. August in einem getrennten Node-Hilfsprozess. Seit 13. September arbeitet dieser
vor der Masterfreigabe auf einer privaten Kopie des gewählten Kandidaten. Eine geeignete geprüfte Paketbasis
wird mit Zeilen-/Suchindexdeltas aktualisiert; sonst erfolgt der Vollaufbau. Beide Wege verwenden denselben
fachlichen SQL-Export, seit 21. September im Deltaweg begrenzt auf tatsächlich geänderte Taxa. Beide prüfen
Datenbank, Zähler, Herkunft und SHA-256. Vollständiges Lesen für Fingerabdrücke und Prüfungen
und Dateikopien bleiben erforderlich. Phasen erscheinen im bestehenden Fortschrittsblock. Seit 20. September
laufen auch die schwere Masterprüfung, Paarvorbereitung und Rücknahmeprüfung im Hilfsprozess. Der Server prüft
die heutigen Eingänge vor dem gemeinsamen Zeigerwechsel erneut; Großbestands-/Neustartfreigabe bleibt offen.

Der erste Paketvergleich vom 21. September zeigte trotz optimiertem Zeilenabgleich langsameren Deltaaufbau.
Inzwischen speichert das Paket regel-/quellengebundene Fingerabdrücke und exportiert nur betroffene Taxa;
Herkunftszeiten werden separat aktualisiert. Alte Pakete ohne diese Grundlage werden einmalig vollständig
aufgebaut. Die vollständige Basisprüfung läuft parallel und muss vor Freigabe erfolgreich sein. Fremde/alte
Grundlagen und breite Änderungen fallen auf Vollaufbau zurück. Doppelte Suchbelege, umsortierte IDs,
NULL-Felder, Leerbestände, Abbruch und Wiederholung sind direkt geprüft. Vertrag: `lightroom-incremental-export.md`.
Ein begrenzter Vorteil zum heutigen Vollpfad ist gemessen, deutliche Gesamtbeschleunigung und produktive
Freigabe bleiben offen. Prüfgrenzen, frühere Vergleichswerte und Messwerte: `taxonomy-operational-checks.md`.

Anders als im vorherigen sequenziellen Ablauf gibt es bei Paketfehlern im Paarpfad keinen bereits aktivierten
neuen Master. Auch eine reine Paketnachholung nutzt die gemeinsame Veröffentlichung ohne Master-Neuberechnung.
Rollback prüft das gespeicherte Vorgängerpaar sowie die heutigen Namenspräferenzen gegen dessen Identitäten und
tauscht nur den Zeiger. Fehlt ein eindeutiges Ziel, wird nichts gewechselt. Separate CLI-Aktivierung/-Rücknahme
ist bei paarverwalteten Installationen gesperrt. Isolierte Legacy-Rollbackproben bleiben möglich.

Der Pfad ist über `--search-root=<Pfad>` beziehungsweise die lokalen Plug-in-Einstellungen überschreibbar. Eine
spätere Installer- und Mehrgerätephase darf ihn deshalb konfigurieren, ohne das Datenformat zu ändern.

## Real verifizierter Bestand

Der am 13. August 2026 aus dem aktiven realen Master erzeugte Stand enthält:

- 273.505 Taxa;
- 7.108.393 Suchbegriffe;
- 1.762.462 Namen;
- 54 Projektverknüpfungen;
- 430.675 Anbieterbelege;
- ein 3,17 GiB großes Suchpaket (`taxonomy-search.sqlite`).

Paket-ID: `lightroom-84c9977ebcbf5f3dc38f`.

Am 29. August 2026 wurde nach der bestätigten Namenskorrektur für `Macroglossum stellatarum` der Master
`master-20260829115042248` aktiviert und das Suchpaket vollständig neu gebaut. Der damalige Stand
`lightroom-9e5f0da24b6bc65712de` enthält 273.421 Taxa, 7.103.318 Suchbegriffe, 2.665.697 Hierarchiezeilen und 55
Projektverknüpfungen. Das vorherige Paket bleibt als kontrollierter Rollbackstand erhalten.

Am 30. August 2026 wurde `master-20260830105212577` mit drei eigenen Korrekturen aktiviert. Das daraus vollständig
geprüfte Paket `lightroom-ef6cfb4b4851d19063d8` enthält 273.421 Taxa, 7.103.327 Suchbegriffe, 2.670.983
Hierarchiezeilen und 55 Projektverknüpfungen. `Amazona autumnalis` liefert bevorzugt `Rotstirnamazone`;
`Sciurus vulgaris` enthält im Paket den vollständigen Pfad von Reich bis Art. Der vorherige Paketstand bleibt im
Slot `previous` erhalten.

Schema, Zähler, Fremdschlüssel, Manifest und SHA-256-Prüfsumme wurden vollständig geprüft. Ein realer isolierter
Rollbacktest war erfolgreich; danach blieb dasselbe produktive Paket aktiv und weder `previous` noch `staging`
enthielten Prüfarbeitsstände.

Repräsentative Offline-Suchen im realen Bestand lagen lokal ungefähr zwischen 0,6 und 1,8 Millisekunden:

- `Eurasisches Eichhörnchen` -> `Sciurus vulgaris`, Status CoL-Referenzlücke;
- `Lilac-breasted Roller` -> `Coracias caudatus`;
- `Coracias caudatus`;
- `Dunlin` -> `Calidris alpina`;
- `Panthera pardus` -> `Leopard`;
- `Macroglossum stellatarum` -> `Taubenschwänzchen` statt `Karpfenschwanz`.

## Befehle

```powershell
npm.cmd run --silent lightroom:package:status
npm.cmd run --silent lightroom:package:build
npm.cmd run --silent lightroom:package:verify
npm.cmd run --silent lightroom:package:probe-rollback
npm.cmd run --silent lightroom:package:rollback
npm.cmd run --silent test:lightroom
```

Der Suchhelfer unterstützt einen dauerhaften JSON-Zeilenstrom über stdin/stdout sowie einen atomaren
Anfrage-/Antwortdateimodus für Lua:

```powershell
node species-explorer/lightroom-search-helper.mjs --request=<Anfrage.json> --response=<Antwort.json>
```

Unterstützte Befehle sind `ping`, `status`, `search`, `taxon`, `taxa` und `close`. `taxa` löst bis zu 10.000
deduplizierte Master-IDs in einer Anfrage auf und liefert gefundene und fehlende IDs sowie die Paketidentität
getrennt zurück. Fehler werden als strukturierte
JSON-Antworten gemeldet; technische Stacktraces gelangen nicht in die Lightroom-Oberfläche.

## Plug-in

Versionierter Pfad:

```text
lightroom-plugin/FNWildlifeTaxonomy.lrplugin/
```

Das Plug-in trägt die Quellversion `0.4.24.42`. Jede Änderung an einer Plug-in-Datei erhöht diese Version in `Info.lua`
und in der sichtbaren Anzeige des Zusatzmodul-Managers. Dokumentation und Vertragstest werden im selben Commit
nachgezogen, damit der tatsächlich geladene Stand eindeutig kontrollierbar bleibt. Enthalten sind:

- `Info.lua`: Manifest, SDK-Grenze und die zwei deutschen Bibliotheksmenüpunkte;
- `DataVersionView.lua`: gemeinsame reine Textdarstellung für den lokalen Versionsvergleich in Manager und
  Zuweisungsfenster; keine Katalogzugriffe;
- `PluginMenu.lua`: kompaktes Verwaltungsfenster mit festen, erlaubten Verweisen auf alle vorhandenen Aktionen;
  Auswahl- und Katalogaktualisierung stehen gemeinsam, sind aber eindeutig nach ihrer Reichweite beschriftet;
- `MetadataDefinition.lua`: stabile Plug-in-Metadatenfelder für Namen, Status, alle unterstützten Taxonomieränge
  sowie die vom Plug-in übernommenen Orts- und Zeitwerte;
- `MetadataTagset.lua`, `MetadataTagsetFull.lua` und `MetadataTagsetFields.lua`: eine kompakte Metadatenansicht
  `FN Wildlife – Foto & Taxonomie` mit sinnvollen Standard-Fotofeldern und den wichtigsten fachlichen Feldern sowie
  eine getrennte vollständige Taxonomieansicht für alle unterstützten Ränge;
- `TaxonomyRanks.lua`: eine gemeinsame Rangdefinition für Vorschau, Metadaten, Schlüsselwörter und Statistik;
- `TaxonomyHelper.lua`: Aufruf des read-only Suchhelfers; unter Windows wird eine vorhandene Node-Installation
  auch dann automatisch unter den üblichen Installationspfaden gefunden, wenn Lightroom den System-`PATH` nicht
  vollständig übernimmt. Der lokale Suchpaketpfad wird unabhängig von Lightroom-Prozessvariablen explizit
  übergeben. Ein fehlgeschlagener Hilfsprozess liefert eine begrenzte technische Diagnose statt einer
  abgeschnittenen Sammelmeldung. Ein davon getrennter Korrekturhelfer erzeugt für eine ausgewählte Art ausschließlich
  eine kurzlebige Übergabe an den Arten-Explorer und erhält keinen Schreibzugriff auf Masterdatenbank oder Katalog;
- `Json.lua`: gekapselter JSON-Codec für die Kommunikation mit dem Suchhelfer;
- `KeywordWriter.lua`: vollständige fachliche Metadaten, flache und eindeutig mit `(FN)` markierte Stichwörter,
  vor dem Schreibzugriff deduplizierte sichtbare Keywordnamen, gespeicherte lokale Kennungen,
  Einzel-/Mehrfachzuweisung, kontextreiche Schreibfehler, verifizierter Write-Access-Callback und kontrollierte
  Rücknahme einschließlich `(FN)*`;
- `KeywordIdFinalizer.lua`: Bindung der tatsächlich zugewiesenen Stichwortobjekte im ersten Schreibzugriff,
  vollständige FN-Erwartung aus Vorzustand und exakt geschriebenen Werten, gemeinsame Prüfung aller
  geänderten Bereiche nach dem SDK-Abschluss und ausschließlich bei Bedarf geschütztes Vervollständigen
  interner Kennungen; keine erneute fachliche Zuweisung;
- `AssignTaxonomy.lua` und `AssignmentWindow.lua`: dauerhaft geöffnetes, in vier gerahmte Arbeitsschritte
  gegliedertes Zuweisungsfenster mit Dateiname beziehungsweise Gesamtzahl der ausgewählten Fotos, geprüftem
  Suchpaketstatus, Taxonomievorschau, Konfliktprüfung, kontrollierter Rücknahme und den zehn zuletzt verwendeten
  Arten. Unter der Vorschau öffnet `Artbezeichnung korrigieren` die ausgewählte Art kontrolliert im
  Arten-Explorer. Vor einer Zuweisung wird geprüft, ob noch dasselbe Basispaket und dieselbe atomar aktivierte
  Korrekturrevision aktiv sind. Das Fenster startet keine
  Statistik- oder Lifelist-Berechnung. Die Suche bleibt über `Art suchen` verfügbar und startet zusätzlich nach
  0,5 Sekunden ohne weitere Eingabe;
- `RemoveTaxonomy.lua`: eigenständige Rücknahmeaktion über `Plug-in-Extras` beziehungsweise
  `Bibliothek > Zusatzmoduloptionen`;
- `LocationTimeWriter.lua`, `LocationTimeMenu.lua` und die drei kleinen Aktionsskripte: kontrolliertes Hinzufügen,
  Entfernen und Aktualisieren der verwalteten Orts- und Zeitstichwörter für die aktuelle Lightroom-Auswahl;
- `PluginState.lua`: lokale Bedienzustände sowie der kataloggebundene persistente Statistikindex und sein
  fortsetzbarer Aufbauzustand;
- `ReferenceImage.lua` und `SetReferenceImage.lua`: genau ein kontrolliertes `Favoritenbild der Art` je
  Master-Taxon-ID;
- `SmartCollections.lua` und `CreateCollections.lua`: wiederholbar einrichtbare intelligente Sammlungen;
- `StatisticsIndex.lua`, `Statistics.lua` und `ShowStatistics.lua`: kompakter Aggregatindex, gebündelter und
  pausierbarer Katalogaufbau, Lifelist-CSV, kompakte Klassenübersicht sowie getrennte FN-Orts-/Zeitstatistiken;
- `PluginInfoProvider.lua`: kompakte Version und read-only Statusanzeige des lokalen Suchpakets im
  Zusatzmodul-Manager.

Der Prototyp sucht in der vollständigen lokalen Masterableitung und nicht nur in bereits angelegten Explorer-Arten.
Vor der Zuweisung zeigt er deutsche, englische und wissenschaftliche Namen sowie alle verfügbaren Taxonomiestufen.
Ein Foto mit einer abweichenden vorhandenen `masterTaxonId` wird nicht still überschrieben.

Beispiele für die flachen, reservierten Plug-in-Stichwörter:

```text
Tiere (FN)
Chordatiere (FN)
Vögel (FN)
Waldkauz (FN)
Deutschland (FN Ort)
Schleswig-Holstein (FN Ort)
Juli (FN Zeit)
2025 (FN Zeit)
```

Die Schlüsselwörter sind für die normale Bildsuche gedacht und enthalten deshalb weder interne Kennungen noch
technische Rangpräfixe. Die reservierte Endung unterscheidet sie von normalen Nutzerstichwörtern. Fehlende Ränge
werden ausgelassen; Zwischenränge werden in fachlicher Reihenfolge übernommen. Die vollständige strukturierte
Taxonomie wird stattdessen in folgenden Plug-in-Metadaten gespeichert:

- `masterTaxonId`;
- `projectTaxonId`, sofern vorhanden;
- deutscher, englischer und wissenschaftlicher Name;
- Taxonrang;
- vollständiger Taxonomiepfad;
- Zuweisungszeitpunkt;
- alle vorhandenen Ränge von Domäne bis Form einschließlich Unter-, Über-, Infra- und Parvrängen;
- Kennzeichen `Favoritenbild der Art` mit den Werten `Ja` oder `Nein`.

Lightrooms eingebaute Ansicht `Standard` kann ein Plug-in nicht verändern. Deshalb stellt das Plug-in zwei eigene
Ansichten bereit. `FN Wildlife – Foto & Taxonomie` kombiniert Dateiname, Aufnahmedatum, Abmessungen,
Urheber-/Kamera-/Objektiv-/Belichtungsdaten und GPS mit den drei Artnamen und den wichtigsten Taxonomierängen.
`FN Wildlife – vollständige Taxonomie` zeigt dieselben Fotofelder und zusätzlich alle vorhandenen Ränge. Die
sichtbaren Feldtitel verwenden die kurzen Rangnamen wie `Reich`, `Klasse` oder `Ordnung`; der bisherige Zusatz
`(wissenschaftlich)` entfällt, die gespeicherten wissenschaftlichen Taxonwerte bleiben unverändert. Interne
Master-/Projekt-IDs und der technische Taxonomiepfad bleiben in beiden Ansichten ausgeblendet, stehen dem Plug-in
aber weiterhin stabil zur Verfügung. Master- oder Suchpaketversionen werden nicht auf Fotos geschrieben.

Die Menüaktion `Taxonomie zuweisen` öffnet ein kompaktes schwebendes Arbeitsfenster. Die vier sichtbaren Abschnitte
`Aktuelle Lightroom-Auswahl`, `Art suchen und auswählen`, `Taxonomie prüfen` und `Taxonomie verwalten` führen vom
ausgewählten Foto bis zur bewussten Katalogänderung. Oben steht bei einer Einzelwahl der Dateiname, bei einer
Einzelwahl ohne verfügbaren Dateinamen `1 Foto ausgewählt` und bei einer Mehrfachwahl ausschließlich
`X Fotos ausgewählt`; der Auswahl-Observer startet dazu eine kurze `LrTask`, sodass Strg+A und Einzelklicks den
Katalog erst im zulässigen Task-Kontext lesen und die Anzeige unmittelbar aktualisieren. Lifelist und
Katalogstatistik werden in diesem Fenster weder beim Öffnen noch nach Zuweisung oder Rücknahme berechnet. Vor der
Suche prüft das Fenster das lokale Suchpaket und zeigt dessen verfügbaren Taxabestand an. Jede Änderung des
Suchtexts verwirft sofort die zuvor geladene Art. Treffen alter Auswahl und aktueller nichtleerer Text trotzdem
nicht zusammen, verlangt die Zuweisung eine ausdrückliche Bestätigung; das Öffnen einer zuletzt verwendeten Art bei
leerem Suchfeld benötigt diese Zusatzbestätigung nicht. Es bleibt beim Wechsel der Lightroom-Auswahl geöffnet und bringt ein bereits
geöffnetes Fenster erneut in den Vordergrund, statt ein zweites zu erzeugen. Der Button `Schließen` sitzt unten
rechts. Das reine Öffnen, Suchen und Vorschauen verändert keine Bildmetadaten.

`Artbezeichnung korrigieren` schreibt weder Masterdaten noch Lightroom-Katalogdaten. Das Plug-in erzeugt eine
auf Größe und Lebensdauer begrenzte Übergabe mit Master-ID, wissenschaftlichem Namen, sichtbaren Namen sowie Paket-
und Masterstand. Der Arten-Explorer konsumiert diese Übergabe genau einmal, prüft Master-ID und wissenschaftlichen
Namen gegen seinen aktiven Master und öffnet erst dann denselben Korrekturdialog wie bei einer manuellen Explorer-
Suche. Nach dem Speichern kann der Nutzer weitere Korrekturen sammeln oder die gemeinsame Aktivierung ausdrücklich
starten. Noch nicht aktive Korrekturen werden über einen deterministischen Fingerabdruck erkannt, auch wenn keine
externe Quelle neuer ist. Vor dem Sofortlauf schließt der Korrekturdialog, sodass Phase, Prozentwert und Laufzeit im
Datenbankblock sichtbar bleiben. Für reine Ergänzungen oder Änderungen vorhandener Korrekturen werden nur die
betroffenen Taxa gegen Master und Lightroom-Paket geprüft und anschließend durch denselben atomaren Zeiger
freigegeben. Der Vollmaster und das Lightroom-Basispaket bleiben dabei bytegenau unverändert.

`Ausgewählte Art zuweisen` schreibt alle Plug-in-Felder und die lesbaren, flachen `(FN)`-Stichwörter auf sämtliche
aktuell markierten Fotos. Vor dem Lightroom-Schreibzugriff wird aus allen sichtbaren Namen eine eindeutige
Keywordliste gebildet. Haben zwei Taxonomiestufen denselben sichtbaren Namen, wird das Keyword nur einmal erzeugt
und je Foto nur einmal hinzugefügt; der vollständige Taxonomiepfad in den Plug-in-Metadaten bleibt unabhängig davon
erhalten. Der reale Suchpaketstand enthält diesen Fall bei Austernfischer (`Haematopodidae` und `Haematopus`) sowie
Bartmeise (`Panuridae` und `Panurus`). Dabei speichert das Plug-in zusätzlich die lokalen Lightroom-Kennungen seiner
erzeugten Stichwörter. Fehler beim Erzeugen oder Hinzufügen eines Keywords beziehungsweise beim Schreiben eines
Plug-in-Felds nennen deutschen und wissenschaftlichen Artnamen, Keyword oder Arbeitsschritt sowie die Zahl der
Fotos. Nach Erfolg meldet das Fenster beispielsweise `19 Fotos wurden Bluthänfling zugewiesen.`

`Taxonomie entfernen` löscht nach Bestätigung die Plug-in-Felder und trennt auf jedem markierten Foto
die eindeutig reservierten Stichwörter mit den Endungen `(FN)` und `(FN)*`. Die Rücknahme rekonstruiert die bei der
Zuweisung verwendeten Namen aus den noch vorhandenen Plug-in-Metadaten und prüft ergänzend rohe Stichwortobjekte,
die formatierte Stichwortanzeige sowie gespeicherte lokale Kennungen. Andere manuelle Stichwörter und alte flache
Stichwörter ohne FN-Endung bleiben erhalten. Ein manuelles Löschen einzelner Stichwörter in Lightroom entfernt
dagegen keine Plug-in-Metadaten; für eine vollständige Rücknahme ist deshalb die Plug-in-Aktion zu verwenden.
Nach Erfolg lautet die Meldung beispielsweise `Von 19 Fotos wurde die Taxonomie entfernt.` Zuweisung und
Rücknahme verwenden direkt `withWriteAccessDo` innerhalb der bereits vom Aufrufer gestarteten
`LrTask`; die einzelnen SDK-Schreibaufrufe werden im Lightroom-Callback direkt ausgeführt. Ein offizieller
SDK-Timeout wartet bis zu zehn Sekunden, wenn Lightroom kurzzeitig einen anderen Schreibzugriff hält. Version
0.4.15.0 prüft danach zwingend den Callback-Abschluss und liest nach der Zuweisung die
gespeicherte `masterTaxonId` jedes Fotos zurück. Erst danach wird Erfolg gemeldet. Version 0.4.21.1
aktualisieren beide Aktionen einen bereits vollständig aufgebauten Statistikindex direkt innerhalb desselben
Katalogschreibzugriffs aus den beabsichtigten neuen Werten; damit hängt das Delta nicht von den innerhalb des
Callbacks noch nicht sichtbar gewordenen Lightroom-Metadaten ab. Im Zuweisungsfenster wird weiterhin keine
Statistikberechnung gestartet.

Version 0.4.22.1 ergänzt drei getrennte Aktionen:

- `Orts- und Zeitstichwörter hinzufügen ...` ergänzt fehlende FN-Felder und Stichwörter an allen ausgewählten
  Fotos; vorhandene FN-Werte bleiben erhalten;
- `Orts- und Zeitstichwörter entfernen ...` entfernt ausschließlich die von dieser Funktion gespeicherten
  Stichwortverknüpfungen und Metadaten;
- `Orts- und Zeitstichwörter aktualisieren ...` ersetzt den gespeicherten FN-Stand durch die aktuellen Lightroom-
  Werte, soweit diese verfügbar sind; fehlende Quellen löschen keine bekannten FN-Werte.

Verwendet werden ausschließlich die dokumentierten Lightroom-Felder Ortsteil, Stadt, Bundesland/Region,
Land/Region und ISO-Ländercode sowie die Aufnahmezeit. Sichtbare flache Stichwörter erhalten für Ortswerte die
Endung `(FN Ort)` und für den deutschen Aufnahmemonat sowie das vierstellige Aufnahmejahr `(FN Zeit)`; der ISO-Code wird wegen der
Redundanz nur als Plug-in-Metadatum gespeichert. Eine normale Taxonomiezuweisung ergänzt dieselben Orts-/Zeitwerte
automatisch und repariert auch einen unvollständigen FN-Stand. Taxonomie- und Orts-/Zeitaktionen schützen
die jeweils fremden gespeicherten Stichwortnamen gegeneinander. Manuelle Stichwörter bleiben unverändert. Es gibt
bei diesen drei Auswahlaktionen keine katalogweite Suche und keinen eigenen Reverse-Geocoding-Dienst. Das Rohfeld `gps` bestimmt, ob für noch nicht
gespeicherte Lightroom-Ortsvorschläge ein kleiner temporärer Export erforderlich ist.

Version 0.4.23.0 ergänzt im Statistikfenster zwei feste nebeneinanderliegende Bereiche ohne dynamische Scrollansicht:

- `Alle FN-Orts-/Zeitfotos` zählt jedes Foto mit gespeicherten FN-Orts- oder FN-Zeitfeldern, auch ohne
  Taxonomie;
- `Mit Taxonomie` zählt nur deren Schnittmenge mit einer gültigen `masterTaxonId`, die mit
  `mtx_` beginnt.

Beide Bereiche nennen Gesamtfotos sowie Fotos mit Ort beziehungsweise Zeit und zeigen für Länder,
Bundesländer/Regionen, Städte, Ortsdetails, Jahre und Monate jeweils die Anzahl und den häufigsten Wert. Die drei Orts-/Zeitaktionen
aktualisieren diese Aggregate direkt. Normale Taxonomiezuweisung übernimmt einen noch fehlenden FN-Orts-/Zeitstand
in dasselbe Delta; `Taxonomie entfernen` lässt eigenständige FN-Orts-/Zeitwerte erhalten und entfernt das Foto nur
aus der kombinierten Auswertung. Der Index speichert weiterhin ausschließlich Aggregate und keine zweite
katalogweite Fotoliste. Das erhöhte Indexschema macht einen älteren Index ungültig; beim ersten Statistikaufruf ist
deshalb einmalig ein vollständiger, weiterhin pausierbarer Aufbau nötig.

Version 0.4.24.2 zeigt die Fotozahl für jedes gespeicherte Jahr, den häufigsten Monat und die häufigsten Ortswerte
einschließlich ihrer Fotozahl. Die Ortsvielfalt nennt getrennt die Anzahl unterschiedlicher Länder, Regionen,
Städte und Ortsdetails. Besitzen alle FN-Orts-/Zeitfotos auch eine gültige Taxonomie, ist die Schnittmenge
definitionsgemäß identisch; statt der vollständigen Wiederholung zeigt der rechte Bereich dann einen entsprechenden
Hinweis.

Version 0.4.24.3 ersetzt den kombinierten Doppelblock durch getrennte Abschnitte `Orte` und `Zeiten` sowie eine
eigene `Datenqualität der taxonomierten Fotos`. Die Schnittmengen werden aus dem taxonomierten FN-Ort/FN-Zeit-
Aggregat berechnet: beide = Ort + Zeit - Vereinigung; nur Ort beziehungsweise nur Zeit ziehen diese Schnittmenge
ab; weder noch = taxonomierte Fotos - Vereinigung. Katalogübersicht und Abdeckung verwenden weiterhin ausschließlich
gültige `mtx_`-Master-IDs. Sichtbare Ganzzahlen erhalten deutsche Tausenderpunkte. Der Taxonomieumfang zählt Domäne,
Reich, Stamm, Klasse, Ordnung, Familie und Gattung aus den jeweiligen Plug-in-Metadaten und Arten aus eindeutigen
Master-IDs. Ortszahlen stammen nur aus FN-Ortsfeldern; Zeitspitzen für Jahr, Monat und Monat/Jahr nur aus FN-
Zeitfeldern. Für den häufigsten Tag liest ausschließlich der bewusst gestartete Statistikaufbau zusätzlich das
dokumentierte Aufnahmedatum `dateTimeOriginal`; gespeichert wird nur das Tagesaggregat, kein neues Foto-Metadatum
oder Stichwort. Indexschema 4 verlangt dafür einmalig `Statistik neu aufbauen`.

Version 0.4.24.4 erhöht den Statistikindex auf Schema 5, damit Lifelist und Exporte zusätzlich englischen Artnamen
und Ordnung enthalten. Alle Orts-, Zeit- und Artenranglisten sind auf fünf Einträge begrenzt. Im Fenster stehen
Orts- und Zeitlisten platzsparend in jeweils zwei zweispaltigen Zeilen; Datenqualität und Klassen zeigen zusätzlich
Prozentanteile bezogen auf taxonomierte Fotos. `Exportieren ...` öffnet eine Auswahl für drei ausschließlich lesende
Formate:

- Lifelist-CSV: eine Zeile je Art, nach Amphibien, Insekten, Reptilien, Säugetieren, Vögeln und danach weiteren
  Klassen sortiert;
- Beobachtungslisten-CSV: eine Zeile je Kombination aus FN-Datum, FN-Ort und Master-Art, einschließlich Fotozahl,
  Favoritenstatus und – sofern über den dokumentierten Fotopfad vorhanden – eines Beispiel-Dateinamens;
- TXT-Artenliste: kompakte UTF-8-Liste mit Klassenzusammenfassung, Unicode-Trennlinien und Sternchen-Aufzählung.

Nur der ausdrücklich gestartete Beobachtungsexport liest alle Katalogfotos in 500er-Blöcken und zeigt dabei einen
abbrechbaren Fortschritt. Er verwendet ausschließlich vorhandene Plug-in-Metadaten und `dateTimeOriginal`, führt
kein Geocoding aus und verändert weder Fotos, Metadaten noch Stichwörter.

Version 0.4.24.5 übernimmt diese Beobachtungsgruppen in den persistenten Statistikindex. Sie werden beim ohnehin
bewusst gestarteten Statistikaufbau einmalig erzeugt und anschließend von Taxonomie-, Orts-/Zeit- und
Favoritenaktionen über die vorhandenen Vorher-/Nachher-Schnappschüsse inkrementell gepflegt. Der
Beobachtungslisten-Export liest damit wie die beiden anderen Exporte nur noch den fertigen Index und startet keinen
Katalogscan. Pro Gruppe speichert der Index Zähler, Fachwerte und höchstens einen optionalen Beispiel-Dateinamen,
aber keine vollständige Fotoliste. Wird genau das Beispielbild aus der Gruppe entfernt, darf das optionale Feld bis
zu einer späteren Ergänzung leer bleiben. Indexschema 6 erfordert einmalig `Statistik neu aufbauen`.

Version 0.4.24.17 ergänzt für alle drei Formate die ausdrückliche Umfangswahl `Gesamter Katalog · gespeicherter
Index` oder `Nur markierte Fotos`. Katalogexporte verwenden weiterhin ausschließlich den geladenen persistenten
Index. Der Auswahlexport übernimmt erst beim bestätigten Klick auf `Exportieren` eine eigene Liste der markierten
Fotoobjekte. `getTargetPhoto()` prüft dabei eine echte Auswahl, bevor `getTargetPhotos()` gelesen wird: Ohne
Markierung liefert das SDK sonst den gesamten Filmstreifen. Leere Auswahl meldet deshalb `Keine Fotos markiert`
und wechselt niemals auf den Katalogumfang. Spätere Auswahländerungen während Fortschritt oder Dateidialog
verändern die gebundene Liste nicht.

Nur die ausdrücklich bestätigte Auswahl wird in höchstens 500 Fotos großen SDK-Leseblöcken temporär aggregiert.
Arten, Fotozahlen, Beobachtungsgruppen, Zeit-/Ortswerte, optionale Beispiel-Dateinamen und Art-Favoriten stammen
ausschließlich aus diesen Fotos. Ein Favorit derselben Art außerhalb der Auswahl zählt im Auswahlformat nicht als
vorhanden. Die Fachregeln und Gruppierung entsprechen dem Katalogindex; der Auswahlexport speichert weder einen
zweiten Index noch einen Aufbaucheckpoint und verändert keine Katalogdaten. Abbruch oder Lesefehler liefert keinen
Export und keinen Rückfall auf den Katalogindex; ein erneuter Start erfasst die dann bestätigte Auswahl frisch.
Beim Öffnen der Statistik wird die bestehende reine Fotozahlprüfung beibehalten. Fehlt ein passender Index,
startet kein Metadatenscan automatisch: Das Fenster bietet Auswahlexport und den bewussten Button
`Statistik neu aufbauen`; ein vorhandener pausierter Aufbau kann über diesen Button fortgesetzt werden.

Das Speichern-Fenster belegt den editierbaren Dateinamen mit `Artenliste.txt`, `Lifelist.csv` beziehungsweise
`Beobachtungsliste.csv` vor und zeigt den Exportumfang. Der zuletzt in diesem Plug-in-Aufruf gewählte Zielordner
wird wiederverwendet; zunächst gilt der Dokumente-Ordner. `Zielordner wählen ...` verwendet die dokumentierte
SDK-Ordnerauswahl. Eine fehlende Endung wird ergänzt; falsche Endung, Pfadangaben, Steuerzeichen, unter Windows
unzulässige Sonderzeichen und reservierte Gerätenamen werden vor dem Dateiöffnen abgewiesen. Bestehende Dateien
verlangen eine eigene Überschreibbestätigung. Abbruch der Export- oder Dateiwahl sowie Ablehnen des Überschreibens
ändert keine Datei.

Alle Formate werden zunächst in einer eindeutigen temporären Datei im gewählten Zielordner vollständig mit
UTF-8-BOM geschrieben und geschlossen; Schreib- und Abschlussfehler werden geprüft. Erst danach wird eine
bestätigte vorhandene Datei gesichert und der neue Export über den dokumentierten, nicht überschreibenden
`LrFileUtils.move()`-Weg übernommen. Misslingt die Übernahme, wird die alte Datei zurückgeschoben. Ist auch diese
Rücknahme gesperrt, bleibt die alte Datei unter dem ausdrücklich gemeldeten Sicherungspfad erhalten. Kann eine
eigene temporäre Datei oder die nach erfolgreicher Übernahme entbehrliche Sicherung nicht entfernt werden, nennt
die Meldung ebenfalls deren Pfad. Das ist keine atomare Ersetzung über einen einzelnen SDK-Aufruf: Bei hartem
Lightroom-/Rechnerabbruch zwischen Sicherung und Übernahme können Sicherung und temporäre Datei im Zielordner
verbleiben. CSV-Spalten, Semikolon, deutsche Tagesdarstellung, CSV-Escaping und die Klassensortierung bleiben
erhalten; TXT nennt zusätzlich den Umfang. Die Auswahl-, Datei-, Abbruch-, Fehler- und Wiederholungswege sind mit
echten Lua-Modulen und simuliertem SDK geprüft; praktische Lightroom-Bedienabnahme bleibt offen.

Version 0.4.24.6 begrenzt `LrLibraryMenuItems` auf die häufige Direktaktion `Taxonomie zuweisen` und den Einstieg
`FN Wildlife verwalten ...`. Der dokumentierte Lightroom-Menüvertrag bietet keine nativen Untermenüs oder
Trennlinien. Deshalb ordnet ein kompaktes schwebendes Fenster alle zehn vorhandenen Aktionen in vier Gruppen ein;
die Zuweisung bleibt zusätzlich direkt erreichbar. `Ort/Zeit der Auswahl aktualisieren ...` und `Gesamten Katalog
aktualisieren ...` stehen gemeinsam, bezeichnen aber ihre unterschiedliche Reichweite ausdrücklich. Das Fenster
startet ausschließlich fest hinterlegte Skripte aus dem Plug-in-Verzeichnis und schließt sich vor
dem Aufruf; Fachlogik, Bestätigungen und Schreibgrenzen der Aktionen bleiben unverändert.

Version 0.4.23.1 korrigiert die Rückgabe der eigenständigen Orts-/Zeitaktionen. `withWriteAccessDo` wird nur zum
Ausführen und Absichern des Schreibcallbacks verwendet; dessen SDK-Rückgabewert ist nicht das fachliche
Zählerergebnis. Der Writer erfasst das Ergebnis deshalb im äußeren Gültigkeitsbereich und gibt es nach bestätigtem
Callback-Abschluss zurück. Die Erfolgsmeldung behandelt fehlende optionale Zähler zusätzlich als null, sodass ein
abweichender SDK-Rückgabewert keinen Lua-Vergleichsfehler mehr auslösen kann.

Version 0.4.23.2 erkennt einen bereits vorhandenen FN-Orts-/Zeitstand nur noch an mindestens einem tatsächlich
gespeicherten sichtbaren FN-Wert. Ein allein zurückgebliebener interner Aktualisierungsmarker kann ein leeres Foto
daher nicht mehr fälschlich überspringen. Die Aufnahmezeitkonvertierung unterstützt beide zulässigen Formen des
Komponentenergebnisses und liest bei Bedarf den formatierten Wert desselben Lightroom-Datumsfelds. Ein leerer oder
Stand wird beim nächsten `Hinzufügen` damit kontrolliert repariert. Ein bereits sichtbarer Teilstand wurde
weiterhin vollständig übersprungen; fehlende Monate/Felder innerhalb solcher Teilstände werden erst seit
0.4.24.25 ergänzt.

Version 0.4.23.3 prüft jeden Quellwert, bevor die reservierte Endung angehängt wird. Leere Werte können daher keine
alleinstehenden Stichwörter `(FN Ort)` oder `(FN Zeit)` mehr erzeugen. Die Aufnahmezeit wird zuerst über das
Lightroom-Rohfeld `captureTime` gelesen; `dateTimeOriginal`, `dateTime` und die formatierten Varianten bleiben
begrenzte Rückfälle. `Hinzufügen` entfernt auf den ausgewählten Fotos zugleich die intern gespeicherten leeren
Suffix-Stichwörter der Vorversionen und ersetzt sie durch verwertbare Werte, sofern vorhanden.

Version 0.4.23.16 liest die Orts- und Zeitquellen vor dem Schreibzugriff direkt an den ausgewählten Fotos. Der
öffentliche Lightroom-Schlüssel `dateTimeOriginal` liefert die Aufnahmezeit; der interne Schlüssel `captureTime`
wird nicht mehr an die Batch-Schnittstelle übergeben. Ein numerischer `dateTimeOriginal`-Wert wird mit der
Lightroom-SDK-Funktion `LrDate.timestampToComponents` zerlegt; der
Datumsparser erkennt außerdem lokalisierte Lightroom-Anzeigen wie `20. August 2026`. Ortsfelder und GPS bleiben
optional: Ein Foto ohne gespeicherte Ortsfelder erhält bei vorhandener Aufnahmezeit ausschließlich Monat und Jahr als `(FN Zeit)`.
Das dokumentierte Rohfeld `gps` liefert Koordinaten als `latitude` und `longitude`. Wenn die formatierten Ortsfelder
trotz GPS leer sind, exportiert das Plug-in nur diese ausgewählten Fotos als 64-Pixel-JPEGs mit vollständigen
Metadaten, liest Lightrooms Vorschläge aus den standardisierten XMP-/IPTC-Feldern und löscht die temporären Dateien.
Seit Version 0.4.23.16 wird die programmgesteuerte Export-Session ausdrücklich mit `doExportOnNewTask()` gestartet,
bevor `waitForRender()` auf die einzelnen Vorschauen wartet; ohne diesen Start konnte der Fortschrittsdialog auf der
ersten Datei stehen bleiben.
Der Fortschrittsdialog ist abbrechbar; bei Abbruch erfolgt noch keine FN-Metadaten- oder Stichwortänderung. Liefert
Lightroom keine Vorschläge, verweist die Meldung auf die Katalogoption für den Export von Adressvorschlägen und auf
private gespeicherte Orte.
Die Metadatenabfrage läuft innerhalb der aktiven `LrTask`, aber ausdrücklich vor `LrTasks.pcall`, weil Lightroom
bei einem notwendigen Yield innerhalb dieser Fehlergrenze mit `Yielding is not allowed` abbrechen würde.
Die IPTC-Ortswerte werden über die formatierten Lightroom-Felder gelesen; `Bundesland/Region` verwendet dabei
Lightrooms öffentlichen SDK-Schlüssel `stateProvince`. Die gleichnamigen Rohmetadaten-Schlüssel sind für diese
Felder nicht freigegeben.

Version 0.4.24.1 ergänzt die Rücknahme um die vollständigen Lightroom-Varianten `(FN Ort)*` und `(FN Zeit)*`.
Sie werden anhand des gesamten Stichwortnamens entfernt; neue Stichwörter erhalten weiterhin ausschließlich
`(FN Ort)` oder `(FN Zeit)` ohne Stern. Die zusätzliche Auswahlaktion `Alle FN-Daten entfernen ...` verlangt eine
Bestätigung und entfernt Taxonomie, Art-Favorit, FN-Orts-/Zeitdaten sowie exakt die sechs Endungen `(FN)`, `(FN)*`,
`(FN Ort)`, `(FN Ort)*`, `(FN Zeit)` und `(FN Zeit)*`. Andere Lightroom-Metadaten und manuelle Stichwörter bleiben
unverändert.

`Gesamten Katalog aktualisieren ...` ist davon getrennt und beginnt mit einem rein lesenden Scan in
500-Foto-Blöcken. Die Vorschau nennt sicher aktualisierbare Taxa, nicht auflösbare beziehungsweise ungültige
Master-IDs, Mehrfachfavoriten und verwaiste reservierte Stichwörter. Erst `Vorschau übernehmen` startet
250-Foto-Schreibblöcke. Alle eindeutigen IDs werden einmal gebündelt vom Suchhelfer aufgelöst; vor jedem
Taxonomieblock müssen Paket-ID, Masterversion und Korrekturrevision noch der Vorschau entsprechen. Nur eine
weiterhin aktive identische `masterTaxonId` wird aktualisiert. Es gibt keine Namensähnlichkeitssuche und keine
stille Nachfolger-, Split- oder Merge-Zuordnung. Orts-/Zeitwerte werden für auflösbare Taxonomiefotos sowie bereits
eigenständig verwaltete Orts-/Zeitfotos nach den aktuellen Regeln abgeglichen. Unveränderte Felder, vollständige
FN-Stichwortzuordnungen und Zeitmarker werden nicht neu geschrieben. Fehlende oder falsche reservierte
Stichwörter sowie unvollständige Taxonomiefelder werden korrigiert; manuelle Stichwörter, Originalmetadaten
und Art-Favoriten bleiben erhalten. Nicht auflösbare Taxonomien werden nicht umgedeutet; deren schon
verwaltete Orts-/Zeitwerte können weiterhin getrennt abgeglichen werden. Die Ergebnisanzeige nennt
tatsächliche Änderungen und unveränderte Fotos getrennt. Orts-/Zeitzähler umfassen auch Taxonomiefotos.
Fotos mit GPS, aber ohne nutzbare Lightroom- oder gespeicherte FN-Ortsfelder gehen für einen bestätigten Lauf
gemeinsam durch eine Lightroom-Export-Session; ein von Adobe
angezeigter KI-Bestätigungsdialog lässt sich durch das SDK nicht unterdrücken. Pause/Fortsetzen greift zwischen den
Blöcken beziehungsweise nach einem laufenden Export. Schließen beendet nach dem aktuellen Block; ein späterer
Neustart ist idempotent, beginnt jedoch ohne persistenten Wartungscheckpoint mit einer neuen Vorschau. Erfolgreiche
Blöcke aktualisieren einen vorhandenen Statistikindex direkt. Seit Version 0.4.24.1 wird die Vereinigung aller in
einem Schreibvorgang benötigten Orts-/Zeit-Stichwortnamen vorab gebildet. Lightroom erzeugt jedes Stichwortobjekt
genau einmal; die fotoweise Zuweisung verwendet anschließend dieses Objekt wieder. Eine gemischte Auswahl aus
Januar- und Februar-Fotos kann daher nicht mehr durch wiederholte `createKeyword`-Aufrufe für denselben Monat
abbrechen.

`Ausgewähltes Foto als Favoritenbild der Art markieren ...` markiert nach einer verständlichen Bestätigung genau ein
bereits taxonomisch zugeordnetes Foto als Favoritenbild seiner `masterTaxonId`. Diese Markierung dient
Sammlungen und Statistik und ist nicht das Artportrait des Arten-Explorers. Die Bilddatei wird weder kopiert noch
verändert. Existiert bereits ein anderes Favoritenbild derselben Art, fragt das Plug-in vor dem Ersetzen mit
`Ja, ersetzen` und `Nein, behalten` nach. `FN Wildlife-Sammlungen einrichten ...` erstellt beziehungsweise verwendet
den Sammlungssatz `FN Wildlife & Travel` mit genau drei intelligenten Sammlungen:

- `Art-Favoriten`: `referenceImage = yes`;
- `Taxonomie zugewiesen`: `masterTaxonId` beginnt mit dem reservierten Präfix `mtx_`;
- `Taxonomie fehlt`: Gegenmenge der Fotos, deren `masterTaxonId` mit `mtx_` beginnt.

Damit sind die beiden Taxonomiesammlungen Gegenmengen. Die zuvor verwendeten Operationen `empty` und `notEmpty`
wurden im praktischen Lightroom-Test umgekehrt ausgewertet und werden daher nicht mehr eingesetzt. Stattdessen
verwendet `Taxonomie fehlt` die SDK-Verknüpfung `exclude` auf dieselbe positive ID-Prüfung. Die Regeln verwenden
ausschließlich das vom Plug-in gesetzte Taxonomiefeld und hängen weder von Aufnahmezeit und anderen normalen
Fotometadaten noch von Lightroom-Stichwörtern ab. Die
Aktion ist wiederholbar, aktualisiert die Regeln bereits bestehender gleichnamiger Smart-Sammlungen und erzeugt
keine Dubletten. Die nicht mehr benötigten Sammlungen `5-Sterne-Tierbilder` und `Art-Referenzbilder` werden dabei
innerhalb des verwalteten Sammlungssatzes automatisch gelöscht. Gleichnamige Sammlungen außerhalb dieses Satzes
bleiben unangetastet. `Taxonomie-Statistik ...` zeigt
Foto-, Art-, Gattungs-,
Familien-, Klassen- und Favoritenbild-Zahlen, `Lifelist: X Arten`, die Taxonomie-Abdeckung, eine
  Klassenübersicht sowie `Am häufigsten fotografierte Arten:` mit höchstens fünf Einträgen. Solange noch
keine Art zugewiesen ist, wird dieser Zustand ausdrücklich angezeigt.

Fehlt der persistente Index oder hat sich die Kataloggröße geändert, bietet das Fenster seit Version 0.4.24.17
den bewussten Aufbau an. Erst `Statistik neu aufbauen` öffnet das nichtmodale Fortschrittsfenster.
Der Erstaufbau sortiert die Fotos stabil nach ihrer lokalen Lightroom-Kennung, liest
Plug-in-Metadaten gebündelt in 500er-Blöcken und speichert nach jeweils 5.000 Fotos einen fortsetzbaren Checkpoint
als katalogweite Plug-in-Eigenschaft. Fortschrittsaktualisierung und `LrTasks.yield()` erfolgen erst nach dem
jeweiligen `withReadAccessDo`-Block. `Pausieren`, `Fortsetzen` und das Schließen des Fensters arbeiten deshalb nur
zwischen abgeschlossenen Blöcken; Lightroom bleibt währenddessen bedienbar.

Version 0.4.21.2 erhöht das Indexschema einmalig, weil beim globalen Aufbau zusätzlich die persistenten Lightroom-
Foto-UUIDs vorhandener Art-Favoriten erfasst werden. Ein mit 0.4.21.0 oder 0.4.21.1 aufgebauter Index wird deshalb
beim ersten Statistikaufruf als veraltet erkannt und nach bewusstem Aufbau ersetzt. Danach benötigt der
Favoritenbutton keinen Vollkatalogscan.

Der gespeicherte Index enthält ausschließlich Aggregate pro Art, Klasse, Familie, Gattung sowie FN-Orts- und
FN-Zeitwert, keine zweite katalogweite Fotoliste. Taxonomie-, Orts-/Zeit- und Favoritenbild-Aktionen ziehen den
Zustand der betroffenen Fotos innerhalb desselben Lightroom-Schreibzugriffs ab und fügen den neuen Zustand hinzu. Sie lösen damit keinen
Katalogscan aus. Eine veränderte Gesamtzahl der Fotos macht den Index beim nächsten Öffnen ungültig. Das SDK bietet
keinen allgemeinen Beobachter für beliebige Änderungen an Foto- oder Plug-in-Metadaten; nach solchen Änderungen
außerhalb der Plug-in-Aktionen bleibt deshalb `Statistik neu aufbauen` der kontrollierte Abgleich. Bewertungen sind für
diese Statistik nicht relevant. Das alleinige manuelle Löschen sichtbarer Stichwörter hebt eine
Taxonomiezuweisung nicht auf, weil
die stabilen Plug-in-Metadaten dabei erhalten bleiben; dafür ist `Taxonomie entfernen` zu verwenden. Bereits mit
einer älteren Plug-in-Version
zugewiesene Fotos erhalten Klasse, Familie und Gattung erst bei einer erneuten kontrollierten Zuweisung.

Im Zusatzmodul-Manager zeigt das Plug-in seine Version, Verfügbarkeit, Taxazahl, Masterstand und Pfad des
read-only Suchpakets. Datenbankstand, Aktualisierung, Backup und Rollback werden dort bewusst nicht dupliziert,
sondern zentral im Arten-Explorer verwaltet.

## Installation für den kontrollierten Abnahmetest

1. In Lightroom Classic einen separaten Testkatalog und mindestens zwei entbehrliche Testbilder öffnen.
2. `Datei > Zusatzmodul-Manager` öffnen.
3. Das Verzeichnis
   `D:\IUCN_Datenbank\lightroom-plugin\FNWildlifeTaxonomy.lrplugin` hinzufügen.
4. Das Zusatzmodul im Manager neu laden und prüfen, dass Version `0.4.24.16`, der Suchpaketstatus sowie die zwei
   Einträge `Taxonomie zuweisen` und `FN Wildlife verwalten ...` ohne Lua-Fehler erscheinen. Im
   Verwaltungsfenster müssen alle zehn Aktionen in vier klar beschrifteten Gruppen erreichbar sein. Die beiden
   Aktualisierungen müssen Auswahl und gesamten Katalog klar unterscheiden.
5. In der Bibliothek ein Testfoto markieren und
   `Bibliothek > Zusatzmoduloptionen > Taxonomie zuweisen` wählen.
6. Im Zuweisungsfenster Dateiname beziehungsweise `1 Foto ausgewählt`, die vier gerahmten Schritte und den Hinweis
   `Lokale Masterdatenbank bereit` prüfen. Eine Art über `Art suchen` und anschließend durch 0,5 Sekunden
   Eingabepause suchen, Vorschau kontrollieren, zuweisen und
   lesbare Schlüsselwörter sowie vollständige Plug-in-Felder prüfen. Danach die Auswahl bei geöffnetem Fenster
   wechseln und die aktualisierte Einzelanzeige prüfen. Beim Öffnen und nach der Zuweisung darf keine Lifelist-
   oder Statistikberechnung im Zuweisungsfenster starten.
7. Dieselbe Prüfung mit mehreren gleichzeitig ausgewählten Testfotos wiederholen; oben muss ausschließlich
   `X Fotos ausgewählt` stehen. Nach der Zuweisung muss `X Fotos wurden <Deutscher Name> zugewiesen.` erscheinen,
   nach der Rücknahme `Von X Fotos wurde die Taxonomie entfernt.` Austernfischer und Bartmeise gezielt zuweisen und
   prüfen, dass die jeweils doppelt benannte Familien-/Gattungsstufe nur ein `(FN)`-Keyword je Foto erzeugt.
8. Nach einer geladenen Art den Suchtext ändern und sofort die Zuweisung versuchen. Die alte Art darf nicht still
   zugewiesen werden. Zusätzlich einen Konfliktfall mit einer abweichenden vorhandenen `masterTaxonId` prüfen; das
   Plug-in muss blockieren.
9. Eine Zuweisung über `Taxonomie entfernen` zurücknehmen. Die Aktion über `Plug-in-Extras` beziehungsweise
   `Bibliothek > Zusatzmoduloptionen` aufrufen. Ein eigener Eintrag im normalen Foto-Rechtsklickmenü wird nicht
   vorausgesetzt. Plug-in-Metadaten und Stichwörter mit `(FN)` beziehungsweise `(FN)*` müssen auf allen markierten
   Fotos verschwinden, vorhandene manuelle Stichwörter müssen erhalten bleiben;
   Statistik und intelligente Sammlungen müssen nach Neuberechnung denselben Zustand zeigen.
9a. Auf Fotos mit vorhandenen IPTC-Ortsfeldern und Aufnahmezeit nacheinander die drei Orts-/Zeitaktionen prüfen.
    Erwartet werden beispielsweise `Deutschland (FN Ort)`, `Schleswig-Holstein (FN Ort)`, `Juli (FN Zeit)` und
    `2025 (FN Zeit)`.
    `Hinzufügen` darf einen vorhandenen FN-Stand nicht still ersetzen, `Aktualisieren` muss geänderte Lightroom-
    Ortswerte übernehmen und `Entfernen` darf weder Taxonomie- noch manuelle Stichwörter löschen. Anschließend die
    normale Taxonomiezuweisung auf einem noch nicht bearbeiteten Foto prüfen; sie muss Ort und Zeit mit übernehmen.
9b. Auf entbehrlichen Testfotos je eine Sternvariante `(FN)*`, `(FN Ort)*` und `(FN Zeit)*` vorbereiten.
    Die jeweilige Einzelrücknahme muss das vollständige fachlich passende Stichwort entfernen. Anschließend
    `Alle FN-Daten entfernen ...` prüfen: Nach Bestätigung müssen Taxonomie, Favorit, Orts-/Zeitdaten und alle sechs
    reservierten Endungen verschwinden, während ein manuelles Kontrollstichwort und normale Lightroom-Metadaten
    erhalten bleiben.
10. Für eine zugewiesene Art nacheinander zwei Fotos als Favoritenbild der Art markieren, die Ersetzungswarnung
    einmal mit `Nein, behalten` und einmal mit `Ja, ersetzen` prüfen. Danach darf nur das zuletzt bestätigte Foto
    `Favoritenbild der Art = Ja` besitzen.
11. `FN Wildlife-Sammlungen einrichten ...` zweimal ausführen und prüfen, dass nur ein Sammlungssatz mit den drei
    intelligenten Sammlungen `Art-Favoriten`, `Taxonomie fehlt` und `Taxonomie zugewiesen` vorhanden ist. Frühere
    Sammlungen `5-Sterne-Tierbilder` und `Art-Referenzbilder` müssen aus diesem Satz entfernt sein. Bei 132 Fotos
    mit zwei Taxonomiezuweisungen müssen `Taxonomie fehlt` 130 und `Taxonomie zugewiesen` zwei Fotos enthalten.
12. `Taxonomie-Statistik ...` öffnen. Ohne aktuellen Index darf kein automatischer Metadatenscan starten.
    `Statistik neu aufbauen` bewusst wählen, den sichtbaren 500er-Fortschritt prüfen, einmal pausieren,
    das Fenster schließen und anschließend fortsetzen. Danach den einzeiligen Lifelist-Kopf, Abdeckung,
    Favoritenbilder, Prozentwerte und die höchstens fünf am häufigsten fotografierten Arten prüfen. Orte und Zeiten
    müssen jeweils Top 5 für Länder/Regionen/Städte/Ortsdetails beziehungsweise Jahre/Monate/Monate-Jahre/Tage
    zeigen. Über `Exportieren ...` Lifelist-CSV, Beobachtungslisten-CSV und TXT-Artenliste prüfen: UTF-8, Umlaute,
    Klassensortierung, Aggregation, leere fehlende FN-Felder, unverzierte numerische Fotozahlen und Beispiel-Dateiname.
    Für jedes Format zusätzlich `Nur markierte Fotos` prüfen: Fotozahlen und Favoriten dürfen ausschließlich aus
    der beim Exportklick markierten Auswahl stammen. Die Dateinamen müssen sinnvoll vorbelegt sein. Leere Auswahl,
    Abbruch, fehlender Index und Ablehnen des Überschreibens dürfen keinen Katalogrückfall oder Dateiersatz auslösen.
    Anschließend eine
    Zuweisung, Rücknahme, Orts-/Zeitänderung und Favoritenänderung ausführen: Die Anzeige muss ohne vollständigen
    Neuaufbau stimmen.
12a. `Gesamten Katalog aktualisieren ...` in einem kopierten Katalog öffnen. Der 500er-Scan darf vor der
     Vorschau nichts schreiben. Ungültige beziehungsweise unbekannte IDs, mehrere Favoriten derselben Art und
     verwaiste FN-Stichwörter müssen in der Vorschau erscheinen und unverändert bleiben. Danach übernehmen, bei
     mindestens einem Block pausieren/fortsetzen und prüfen, dass aktuelle Namen, Taxonomiepfade, Stichwörter sowie
     FN-Orts-/Zeitwerte in 250er-Blöcken ersetzt werden. Falls Lightroom KI-Ortsvorschläge bestätigen lässt, darf
     höchstens die gemeinsame Export-Session dieses Laufes erscheinen. Einen Lauf einmal während eines Blocks
     schließen und erneut starten; bereits abgeschlossene Blöcke müssen ohne Doppelstichwörter erneut verarbeitbar
     sein. Die Statistik muss nach erfolgreichen Blöcken ohne Vollneuaufbau stimmen.
13. Im Metadatenbedienfeld nacheinander `FN Wildlife – Foto & Taxonomie` und
    `FN Wildlife – vollständige Taxonomie` wählen. Die kompakte Ansicht muss Standard-Fotodaten, Namen und wichtige
    Ränge zeigen, die vollständige Ansicht alle vorhandenen Ränge; interne IDs dürfen in keiner Ansicht erscheinen.
14. Für eine Art `Artbezeichnung korrigieren` wählen, die eindeutige Vorbelegung im Explorer prüfen, eine neue
    begründete Korrektur speichern und `Datenbank jetzt aktualisieren` wählen. Der Korrekturdialog muss sich vor dem
    Lauf schließen; Prüf- und Aktivierungsphase müssen sichtbar werden. Nach wenigen Sekunden muss eine neue
    Lightroom-Suche den korrigierten Namen liefern, ohne dass die große Master- oder Paketdatei neu aufgebaut wurde.
    Eine bereits vor der Aktivierung im Zuweisungsfenster geladene Art muss wegen der geänderten Korrekturrevision
    vor einer Zuweisung erneut gesucht werden. Für `Sciurus vulgaris` muss die Vorschau weiterhin den im Master
    vorhandenen vollständigen Hierarchiepfad enthalten.
15. Lightroom neu starten und prüfen, dass Zuordnung, Schlüsselwörter, Favoritenbild der Art und Sammlungen erhalten
    bleiben.

Dieser Test darf nicht am persönlichen Produktivkatalog beginnen. Erst nach dem bestandenen Testkataloglauf gilt der
Lightroom-Schreibvertrag als praktisch bestätigt.

## Verifizierter und offener Umfang

Automatisch verifiziert sind:

- vollständiger Fixture- und realer Paketaufbau;
- Schema-, Zähler-, Prüfsummen- und Integritätsprüfung;
- Offline-Suche und Taxondetails;
- atomare Aktivierung und isolierter Rollbacktest;
- Suchhelfer im Datei- und Dauerprozessmodus;
- Plug-in-Manifest, Modulgrenzen und Verbot direkter `.lrcat`-/XMP-/SQLite-Zugriffe;
- vollständige Hierarchie in Plug-in-Metadaten, Mehrfachzuweisung, Rücknahme und Konfliktsperre im Lua-Vertrag;
- schwebendes, gerahmtes Vier-Schritt-Zuweisungsfenster mit Suchpaket-, Einzelfenster-, Auswahlwechsel- und
  Verlaufskontrakt sowie Einzelfoto-/Mehrfachauswahlanzeige, ohne Statistikstart, mit Suchbutton, verzögerter
  automatischer Suche, sofortiger Entwertung alter Treffer und Sicherheitsbestätigung;
- lesbare, längenbegrenzte und vor dem Schreibzugriff deduplizierte `(FN)`-Stichwörter, vollständige Rang-
  Metadaten, kontextreiche Schreibfehler sowie Callback- und Metadatenverifikation des Write-Access;
- kompakte und vollständige Metadatenansicht sowie kompakte Suchpaketinformation im Zusatzmodul-Manager;
- eindeutige, bestätigungspflichtige Markierung eines Favoritenbilds der Art, idempotente Sammlungsdefinitionen sowie
  den persistenten, inkrementellen und fortsetzbaren Statistikindex einschließlich Lifelist-CSV, kompakter
  Klassenübersicht, Abdeckung und häufigsten Arten;
- abgesicherte einmalige Lightroom-Explorer-Korrekturübergabe, revisionsbasierte Erkennung noch nicht eingebauter
  Korrekturen, gemeinsame atomare Aktivierung einer kleinen Korrekturschicht ohne Basisneubau und kombinierter
  Hierarchieexport aus vollständigem Anbieterfallback und ausgewählten Masterwerten;
- Erkennung aller sechs reservierten FN-Endungen bei der Gesamtbereinigung, blockweiser Katalogpflegerahmen,
  gebündelte Master-ID-Auflösung, unveränderte Paketprüfung, Konfliktbericht und inkrementelle Statistikdeltas.

Einzel- und Mehrfachzuweisung, Suche per Button, Fensterbreite und -höhe, die frühere Lifelist-Anzeige,
Favoritenersetzungswarnung sowie die Rücknahme von `(FN)`- und `(FN)*`-Stichwörtern wurden mit den vorherigen
Plug-in-Ständen im vorbereiteten Lightroom-Testkatalog praktisch geprüft. Version 0.4.10.0 entfernte die Lifelist-
Berechnung aus dem Zuweisungsfenster, deduplizierte sichtbare Keywordnamen und verbesserte Auswahl- und
Erfolgsmeldungen, beschädigte aber durch normale Lua-`pcall`-Grenzen den yieldenden Schreibpfad. Version 0.4.11.0
ersetzte die Task-Grenze, konnte jedoch wegen des optionalen Timeouts einen nicht ausgeführten Schreibcallback als
Erfolg melden. Version 0.4.15.0 ergänzt zum direkten Write-Access-Aufruf den vom SDK vorgesehenen Zehn-Sekunden-
Timeout und prüft danach Callback-Abschluss sowie gespeicherte `masterTaxonId`; die Zuweisung wurde praktisch
bestätigt. Version 0.4.16.0 verlagert den Auswahl-Refresh in eine kurze `LrTask`; dies wurde praktisch bestätigt.
Version 0.4.17.0 verlagert den Statistik-Yield aus dem SDK-Lesecallback. Version 0.4.21.0 ersetzte den verwerfbaren
Ergebniscache durch den kataloggebundenen Aggregatindex. Der Großkatalogtest am 2026-09-01 bestätigte sichtbaren
Fortschritt, Bedienbarkeit, unauffälligen RAM-Verlauf, Pause/Fortsetzen, Klasseninhalte und CSV-Export; er zeigte
aber eine zu große Klassenfläche, abgeschnittene ausgeklappte Arten und ein wirkungsloses Delta nach Zuweisung und
Rücknahme. Version 0.4.21.1 ergänzt Dialogabstand und bildet Statistikdeltas aus den beabsichtigten neuen Werten;
Zuweisung und Rücknahme wurden damit praktisch bestätigt. Die dynamische Artenhöhe blieb in Lightroom trotz
passender Inhaltsdaten auf eine Zeile beschränkt. Version 0.4.21.2 entfernt deshalb die Aufklappansicht, zeigt nur
die stabilen Klassen-, Art- und Fotozahlen und belässt die vollständige Aufschlüsselung im CSV. Außerdem durchsucht
der globale Statistikaufbau persistente Lightroom-Foto-UUIDs vorhandener Favoriten. Die Favoritenaktion löst nur
diese UUIDs mit der dokumentierten Katalogfunktion auf, schreibt das neue und vorhandene bisherige Favoritenbild
und prüft den gespeicherten Wert. Ein Index ohne UUIDs verlangt sichtbar `Statistik neu aufbauen`; die Aktion startet
keinen versteckten Vollkatalogscan. Dieser Favoritenfix wurde praktisch bestätigt. Version 0.4.21.3 entfernt die
vom nativen Listenfeld nicht ausgewertete Farbangabe und dokumentiert dessen systembedingt weiße Fläche. Am
2026-08-28 wurden außerdem die komplementären Sammlungsregeln von
Version 0.4.9.0 bei 132 Fotos und genau einer Taxonomiezuweisung praktisch mit `Taxonomie fehlt = 131` und
`Taxonomie zugewiesen = 1` bestätigt. Die Sammlungs- und Statistikverträge sind automatisiert abgesichert.

## Bekannte Einschränkungen und offene Punkte

- Die erneute Prüfung am 2026-08-28 gegen den offiziellen Adobe-SDK-Leitfaden bestätigt nur
  `LrExportMenuItems`, `LrLibraryMenuItems` und `LrHelpMenuItems` für die jeweiligen `Plug-in-Extras`-Untermenüs.
  Eine dokumentierte Erweiterung des normalen Foto-Rechtsklickmenüs existiert dort nicht. Die Aktionen bleiben
  über `Plug-in-Extras` beziehungsweise `Bibliothek > Zusatzmoduloptionen` erreichbar. Eine spätere Änderung darf
  erst nach einem neuen SDK-Nachweis erfolgen.
- Der offizielle SDK-Leitfaden beschreibt Enter/Return nur als Aufruf des vom umgebenden Dialog bereitgestellten
  Standardbuttons. Der praktische Test von Version 0.4.4.0 zeigt, dass dieser Weg im dauerhaft geöffneten
  `presentFloatingDialog` nicht greift. Für `edit_field` ist kein eigener Enter-/Keydown-Callback dokumentiert;
  ein Property-Observer erkennt Textänderungen, aber keine Enter-Taste bei unverändertem Text. Version 0.4.9.0
  entfernt deshalb die wirkungslose, nicht dokumentierte `is_default`-Annahme. Die Suche bleibt über
  `Art suchen` verfügbar; Version 0.4.19.0 umgeht die Enter-Grenze zusätzlich durch dieselbe automatische Suche nach
  0,5 Sekunden Eingabepause. Ein erzwungener Tastatur-Hook wird nicht eingebaut.
- Der dokumentierte `presentFloatingDialog`-Vertrag bietet keine Option, das schwebende Fenster nur relativ zu
  Lightroom, nicht aber gegenüber anderen Windows-Anwendungen im Vordergrund zu halten. `toFront()` wird nur bei
  erneutem Aufruf der Plug-in-Aktion verwendet. Das sonstige Vordergrundverhalten bestimmt Lightroom; eine
  undokumentierte Windows- oder SDK-Funktion wird nicht ergänzt.
- Der Lightroom-SDK-Vertrag dokumentiert Auswahl- und Quellenbeobachter für schwebende Dialoge, aber keinen
  allgemeinen Beobachter für beliebige Foto-, Katalog- oder Plug-in-Metadatenänderungen. Der Statistikindex wird
  deshalb bei allen eigenen Schreibaktionen sofort aktualisiert, erkennt eine geänderte Kataloggröße und bietet für
  sonstige externe Änderungen ausdrücklich `Statistik neu aufbauen`; eine nicht belegte Hintergrundbeobachtung wird
  nicht vorgetäuscht.
- Die Taxonomievorschau verwendet wegen der begrenzten und versionsabhängigen Layoutsteuerung des Lightroom-SDK
  eine feste Höhe von 150 Pixeln. Ihre Breite ist an das Fenster gekoppelt; eine zuverlässige dynamische Höhe nach
  exakt vorhandener Zeilenzahl wird nicht vorausgesetzt. Die zuverlässig alle Zeilen darstellende native
  `simple_list` behält unter Windows ihre weiße Systemfläche; das SDK dokumentiert für diesen Listentyp keine
  eigene Hintergrundfarbe. Der frühere `scrolled_view`-Ersatz wurde nicht erneut verwendet, weil er Taxonomiezeilen
  praktisch abschnitt beziehungsweise vollständig ausblendete. Quelle .35 ergänzt dafür den eigenen Button
  `Taxonomiedetails lesen`: derselbe vollständige Text auf kompakten nur lesenden Seiten mit Weiter/Zurück/
  Schließen, auch für höhere Ränge und ohne Fotoauswahl. .36 schließt vor dem modalen Leser ausschließlich
  das eigene Zuweisungsfenster und öffnet danach dieselbe Ansicht mit erhaltenem Such-/Namenszustand
  wieder; so kann das schwebende Fenster den Text nicht verdecken. Auf jeder Seite bleibt Schließen als
  Cancelweg vorhanden, die letzte Seite bietet zusätzlich Fertig. Der aktuelle Suchtext und Busy-Zustand
  schützen vor einer alten Detailansicht. Automatisierte Textvollständigkeit und Fenstergegenproben sind
  kein nativer SDK-/DPI-/Screenreadernachweis; aktuelle Abnahmegrenzen im Auditauftrag, Abschnitt 10.49.
- Der Favoriten-Ersetzungsdialog zeigt bewusst nur den verständlichen Arttext. Bildvorschauen und Dateinamen wurden
  nicht verwendet, weil sie in diesem Dialog nicht zuverlässig beziehungsweise nicht lesbar genug waren.
- Die Orts-/Zeitfunktion übernimmt gespeicherte IPTC-Ortsfelder, Lightrooms beim temporären Export eingebettete
  Ortsvorschläge und die Aufnahmezeit. Ein eigener Geodienst wird nicht angesprochen; die Vorschläge hängen von
  Lightrooms Katalogoption `Adressvorschläge beim Export ...` und nicht privaten gespeicherten Orten ab. Eine eigene Ortsbestimmung per Polygon oder Reverse-Geocoding bleibt frühestens ein
  gesonderter Ausbau nach Phase 11.
- Der Katalogpflegelauf kann eine Lightroom-Export-Session für alle benötigten Ortsvorschläge bündeln, hat aber
  keine SDK-Kontrolle über Adobes KI-Bestätigungsdialog. Pause greift erst nach einem bereits laufenden Export.
  Der Lauf speichert keinen eigenen dauerhaften Fortschrittscheckpoint; nach Schließen beginnt ein idempotenter
  Neustart wieder mit Scan und Vorschau.
- Die erstmalige Master-Taxon-ID wird aus wissenschaftlichem Namen, Rang und Reich gebildet. Reine deutsche
  oder englische Namenskorrekturen sowie Hierarchieänderungen behalten die ID. Eine belegte bestätigte
  Fortführung oder Quellenreparatur kann auch bei geänderten Identitätskomponenten die ursprüngliche ID
  erhalten; Split und Merge verlangen eigene bestätigte Beziehungen. Neue Kandidaten speichern diese
  Entscheidungen im Identitätsregister, das Paket exportiert sie als `package_info.identityRegistry`.
  Der Helfer meldet sie über `identity`, ohne historische IDs still auf aktive Ziele umzuleiten.
  Der normale Katalogpflegelauf überspringt weiterhin nicht auflösbare IDs, statt anhand eines Namens zu raten.
  Für Fotoübernahmen ist der getrennte bestätigte Bedienweg mit Vorschau, Journal, Schreibblöcken,
  Wiederaufnahme und Rücknahme implementiert: [Lightroom-Artänderungen](lightroom-identity-workflow.md).
  Split B/C und Merge F bestehen native Übernahme und genaue Rücknahme. Mehrblockpause,
  Wiederanlauf und die gezielten Fehler-/Konfliktfälle sind ebenfalls geprüft; die repräsentative
  Großkatalogprüfung für Laufzeit, Speicher und Abbruch bleibt offen. Details:
  `taxonomy-identity-incremental-plan.md` und der laufende Auditauftrag, Abschnitt 10.54.
- Alte flache Taxonomie-Stichwörter ohne `(FN)`-Endung sind nicht eindeutig vom Nutzerbestand unterscheidbar und
  werden deshalb nicht automatisch gelöscht. Andere frühere Smart-Sammlungen mit unbekannten abweichenden Namen
  werden ebenfalls nicht automatisch entfernt; die beiden bekannten Alt-Sammlungen `5-Sterne-Tierbilder` und
  `Art-Referenzbilder` werden dagegen innerhalb des verwalteten Satzes automatisch bereinigt.
- Der automatische Suchpaketbau benötigt lokal vorübergehend Platz für den neuen Staging-Stand zusätzlich zum
  aktiven und gegebenenfalls vorherigen Paket. Bei einem Fehler bleibt das alte Paket nutzbar, die korrigierten
  Namen stehen Lightroom aber erst nach dem erfolgreichen Wiederholungslauf zur Verfügung.
- Der Masterstatus vergleicht die aktive CoL-Release-ID mit der CoL-Provenienz des aktiven Masters. Ist die Referenz
  bereits neuer, baut der bestätigte Wiederanlauf zuerst den Master aus dem vorhandenen aktiven Referenzstand und
  erst danach dieses Suchpaket. Er lädt die gleiche Referenz nicht erneut herunter. Ein Kandidat eines älteren
  Referenzstands wird nicht aktiviert. Nach einem Paketfehler wird nur das Paket nachgeholt; nach einem Masterfehler
  bleiben Master und Paket unverändert und der Referenz-Master-Drift sichtbar.
- Das Zurücksetzen einer Korrektur, die bereits in einem früheren vollständigen Masterstand als ausgewählter
  manueller Wert eingebaut wurde, kann nicht allein durch Weglassen in einer kleinen Überlagerung rückgängig gemacht
  werden. Der Schnellweg erkennt diesen Fall und verweigert eine scheinbare Teilaktivierung; dafür bleibt der
  vollständige Kandidaten- und Paketneuaufbau erforderlich. Neue Korrekturen und Änderungen weiterhin vorhandener
  Korrekturen verwenden den Sekundenpfad.
- Phase 10 ist nicht abgeschlossen. Vor dem Abschluss folgen das umfassende Audit nach
  `docs/documentation-lifecycle.md` und die darin vorgesehenen übergreifenden Regressions-, Betriebs-, Backup- und
  Wiederherstellungsprüfungen.

SDK-Nachweis: [Adobe Lightroom Classic SDK Guide](https://ioconsolerykerprodcdn.azureedge.net/static/installers/lr/sdk/2022/cross_platform/v13/doc/Lightroom%20Classic%20SDK%20Guide_1655133965.pdf),
insbesondere die Abschnitte zu Plug-in-Menüeinträgen und `edit_field`-Steuerelementen.

## Betriebs- und Sicherungsgrenze

Das Suchpaket ist aus einem passenden Master ableitbar und gehört nicht in Git oder GitHub Pages.
Die aktuelle vollständige NAS-Sicherung enthält jedoch ausdrücklich den gesamten gemeinsamen Datenordner
einschließlich Suchpaket, Master, eigenen Entscheidungen, Projektlinks, Aufträgen und Konfiguration.
Der gemeinsame Vorgänger ist der schnelle lokale Rücknahmestand und ersetzt keine externe Sicherung.
Lightroom-Katalogbackups bleiben ein eigener Sicherungsbereich. Installer und Mehrgerätebetrieb sind
spätere Erweiterungen; die schon vorhandene Vollsicherung ist keine erst in Phase 11 geplante Funktion.
Umfang und geprüfte Restoregrenzen: [NAS-Vertrag](multi-device-backup-plan.md) und
[Gesamtaudit](audit-auftrag-phase-10-5.md).
