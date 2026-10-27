# FN-Katalognutzung und automatische Klassifikationsvormerkung

Stand: 2026-10-27

Implementiert ab Plug-in **0.4.24.15**, aktueller Quellstand **0.4.24.42**. Tatsächlich geladene Version,
spätere Betriebsproben und offene Abnahmegrenzen stehen im [Lightroom-Vertrag](lightroom-search-package.md)
und im führenden [Auditauftrag](audit-auftrag-phase-10-5.md).

Die folgenden datierten Proben sind historische Nachweise: .27 wurde am 13. und 14. Oktober,
.28 am Abend des 14. Oktober vom regulären Pfad nativ geladen nachgewiesen. Die private .29-Testkopie
ist am 15. Oktober im eigenen Katalog bestätigt. Die anschließende .31-Erstkennungsprobe scheiterte
an der innerhalb des Schreibzugriffs noch alten SDK-Stichwortlesesicht. .32 bindet die tatsächlich
zugewiesenen Objekte und prüft nach dem SDK-Abschluss alle geänderten FN-Bereiche. Die native .32-Probe
belegte zusätzlich noch alte FN-Metadatenwerte innerhalb desselben Schreibzugriffs. .33 bindet deshalb
den vollständigen Vorzustand und exakt die tatsächlich geschriebenen Werte für die Nachprüfung.
Gezielte **107/107**, unabhängige Review ohne Blocker und vollständiges lokales Gate vom 15. Oktober
**14:14:45–14:26:45 MESZ, 50 Gruppen / 1.791 Tests** bestanden, 126 gebundene Quellen unverändert.
Das Original .32 wurde am 15. Oktober um 13:57 MESZ im Hauptkatalog mit vollständigem Produktionspaar
nativ aktiviert bestätigt. Nach der beauftragten Entfernung sechs obsoleter Registrierungen blieb genau
dieses Original übrig; Belegdateien wurden nicht entfernt. Die nachfolgende eigene .33-Orts-/Zeitprobe
schließt neue Mai-/2028-Stichwörter samt beiden internen Kennungen bereits im ersten Lauf erfolgreich ab;
ihre unveränderte Wiederholung meldet keine weiteren Taxonomie-/Ortszeitänderungen und keine Schreibfehler.
Der unabhängige Nachvergleich besteht mit **31/31** Prüfungen: alle fünf vollständigen Einträge mit
FN-Zeitstempeln, realen Stichwortzuordnungen und sämtlichen Statistikvariablen sind nach der Wiederholung
exakt unverändert. Die beiden privaten .32-/ .33-Registrierungen sind anschließend entfernt; Original
**.33** ist im wieder geöffneten Hauptkatalog als einziger FN-Eintrag geladen und aktiviert mit passendem
Produktionspaar bestätigt. Die anschließende eigene .33-Probe mit neu erzeugter Taxonomiestichwortkennung
ist im Erstlauf vollständig; unveränderte Wiederöffnung und Wiederholung sind mit 178/178 unabhängigen
Prüfungen bestätigt. Positive Favoritenzuweisung, Ablehnung und bestätigter Ersatz bestehen mit 123/123.
Das Gesamtgate vom 16. Oktober besteht mit 50 Gruppen / 1.805 Tests. Verdeckter Stapelkonflikt und genaue
Taxonomierücknahme bestehen mit 102/102; vollständige FN-Rücknahme, Wiederzuweisung und getrenntes
Orts-/Zeit-Entfernen/Hinzufügen mit 183/183, einschließlich Erhalt der fünf Original-IPTC-Ortsfelder und
Aufnahmezeit. Hauptkatalog abschließend offen, genau ein reguläres Original .33 aktiviert, Testregistrierung
entfernt/Belege erhalten. Das schließt diese kleine native Matrix ab; weitere Namens-/Handoff-/Pause-/
Skalierungsfälle und Gesamtabschluss bleiben im führenden Abschnitt 10.32 getrennt.
Aktueller Verlauf ausschließlich im [Auditauftrag, Abschnitt 10.31](audit-auftrag-phase-10-5.md#1031-native-video-datumsquellen-und-fortsetzung--15-oktober).
Der freigegebene lokale Ersatzauftrag vom
13. Oktober ist um **18:09:17 MESZ** mit gemeinsamem Master-/Paketwechsel vollständig abgeschlossen:
`master-20261013143021566` / `lightroom-dd834fb15dbd6f1c3257`, alle 273.480 vorherigen IDs erhalten.
Seine neue requestgebundene SDK-Erfassung schützt **6.110 FN-Zuweisungen und 64 verwendete IDs** in
**127.093 Katalogeinträgen**. Diese datierte Schutzaufnahme ist kein aktueller laufender Fotozähler.
Tatsächlicher Ablauf und Abschlussgrenzen: [Auditauftrag, Abschnitt 10.24](audit-auftrag-phase-10-5.md#1024-freigegebener-realer-lokaler-wiederanlauf--11-und-12-oktober).
Der [Updatevertrag](taxonomy-reference-update.md) und [Betriebsstand](taxonomy-current-status.md) bleiben maßgeblich.

Die erneute Lightroom-Arbeit nach diesem abgeschlossenen Wechsel macht den damaligen Abwesenheits-/
Frischenachweis für einen späteren Paarwechsel veraltet. Sie macht den bereits übernommenen Stand nicht
fehlgeschlagen und verlangt keinen weiteren Aufbau. Vor einer künftigen Übernahme braucht deren Auftrag
wieder seinen gültigen FN-Nutzungsnachweis; alte Quittungen werden nicht neu datiert.

**FN-Katalognutzung erfassen** liest die verwendeten IDs für den Schutz eines Datenbankwechsels und
schreibt keine Fotos. **FN-Daten aktualisieren** pflegt dagegen vorhandene gültige FN-Zuordnungen im
geöffneten Katalog gegen das aktuelle Suchpaket und ergänzt beziehungsweise aktualisiert verfügbare
Orts-/Zeitdaten. Die Statistik ersetzt keine dieser beiden Aktionen. Bedienung und genaue Quellen-/
Auswahlgrenzen stehen im [Lightroom-Vertrag](lightroom-search-package.md); Ergebnis und Nachkontrolle des
am 14. Oktober eigens freigegebenen FN-Datenlaufs werden im
[Auditauftrag, Abschnitt 10.27](audit-auftrag-phase-10-5.md#1027-produktiver-fn-katalogabgleich--14-oktober) fortgeschrieben.

Die erste Erfassung und Gesamtbestätigung vom 3. Oktober sowie der damalige abgeschlossene Paarwechsel
um 09:11:14 MESZ bleiben historische Nachweise: [produktiver Erstabschluss](audits/2026-10-03-taxonomy-reference-update.md).

## Gespeicherter Gesamtweg, eingeführt mit Plug-in 0.4.24.16

Der nachstehende Folgeauftrag ist jetzt lokal umgesetzt, nicht mehr nur Planung. Der
[gespeicherte Gesamtweg](taxonomy-update-automation.md) beschreibt aktuelle Bedienung, genaue SDK-Grenzen und Tests.
Ein Start oder Später; technische Kette im lokalen Dienst gespeichert. Ein expliziter Updateauftrag fordert bei
Bedarf neue requestgebundene SDK-Quittungen aller registrierten Kataloge an. Normales Schließen nur bestätigt
und nach Erfassung; selbst geschlossenes Lightroom wird ohne zweiten Startklick erkannt. Die neue Registrierung
bindet geschlossene Dateien, nicht alte Quittungen mit neuen Zeiten. Capture-to-close bleibt ehrlich die einmalige
Startvereinbarung, kein behaupteter vollständiger SDK-Änderungsbeobachter. Die frühere manuelle Gesamtbestätigung
entfällt im bestätigten Normalweg; einmalige Erstregistrierung und technische Fehlerfälle bleiben gesondert.

Ergänzung vom 11. Oktober: Ein ausdrücklich neuer lokaler Ersatzauftrag für einen eigenen fehlgeschlagenen
Masteraufbau fordert auch bei global aktuellem Nachweis eine eigene frische Erfassung. Der alte Updateauftrag
bleibt erhalten; bestehende Quittungen werden nicht neu datiert. Die bestätigten Katalogpfade werden gebunden, neue Quittungskennungen dürfen
die Registerrevision ersetzen. Eine frühere normale Schließbestätigung gilt ausschließlich für ihren bisherigen
Auftrag. Bedienung und Schutzprüfungen stehen im führenden [Gesamtweg](taxonomy-update-automation.md).

Projekt-/LR-/eigene Entscheidungsdaten sind nun auch gegen normale geänderte Anbieternamen und Hierarchie geschützt.
Unveränderte Werte/Herkunftszeiten verlangen keine Rückfrage. Nach letzter bestätigter vollständiger Feld-/
Klassifikationsentscheidung automatische Fortsetzung desselben Auftrags. Positive Beobachtungen schützen auch
bei veralteter negativer Freigabe. Die damalige Implementierung startete keinen Produktivlauf. Der ausdrücklich
freigegebene Wiederanlauf vom 13. Oktober ist inzwischen tatsächlich abgeschlossen; die umfassende native
SDK-/Betriebsabnahme bleibt im [Auditauftrag](audit-auftrag-phase-10-5.md) offen.

Die folgenden Erstaufnahmebeschreibungen dokumentieren den Stand 0.4.24.15 und den damals tatsächlich
bestätigten produktiven Lauf. Sie sind keine erneut auszuführende Schrittfolge des neuen Normalwegs.

Ergänzung vom 13. Oktober: Lightroom-Arbeit nach einem pausierten oder fehlgeschlagenen Folgeaufbau kann
dessen bisherige FN-Quittung veralten. Der geschützte lokale Ersatzweg erhält den alten Auftrag und fordert
eine neue eigene SDK-Erfassung an. Bisher vorgemerkte automatische Identitätsereignisse benötigen einen
separaten erneuten Schutzvergleich mit dieser neuen Nutzungsrevision; ihre historischen Nutzungskennungen
werden nicht ersetzt. Die genauen Herkunfts-, Quellen- und Schutzgrenzen stehen im
[Gesamtweg](taxonomy-update-automation.md#gespeicherte-steuerung-und-wiederanlauf).

## Folgeauftrag: automatischer Gesamtweg statt manueller Erstaufnahmekette

Felix hat am 3. Oktober nach bestandener Suche/Namensprüfung für Weissstorch und Rebhuhn ausdrücklich das
Bedienziel bestätigt: Die heute einzeln durchgeführten Schritte sollen automatisch zusammenlaufen;
fachliche Rückfragen nur bei relevanten Änderungen an angelegten, zugewiesenen oder selbst gepflegten Daten.
Der Auftrag ist inzwischen lokal implementiert; **noch kein praktisch abgenommener Vollautomatismus**.
Die dokumentierte Erfassungs-/Schließungsgrenze ist durch die einmalige Startvereinbarung abgedeckt,
nicht durch unabhängige SDK-Beobachtung. Fehlende/unbekannte Nutzung bleibt gesperrt.

### Geforderter Normalweg

1. Anbieterstände und vorhandene lokale Aufträge erkennen; passende bestehende Arbeit fortführen statt einen
   zweiten Download/Aufbau zu beginnen. Keine wiederholten Startbestätigungen für einzelne technische Phasen.
2. Den vollständigen FN-Nutzungsstand aller registrierten Kataloge automatisch aus dem Lightroom-SDK beziehen
   beziehungsweise verlässlich fortschreiben. Die bereits bestätigte Katalogmenge bleibt gespeichert; kein
   erneutes Abfragen derselben Menge pro Update und kein stilles Auslassen eines Katalogs.
3. Quellenänderungen gegen Projektarten, zugewiesene IDs, eigene Namen/Felder und Identitätsentscheidungen
   prüfen. Unbenutzte passende Klassifikationen mit ID-Erhalt und unklare unbenutzte CoL-Gegenstücke konservativ
   automatisch verarbeiten. Keine Namensheuristik, willkürliche Zusammenführung oder fehlende Nutzung als Null.
4. Erforderlichen lokalen Folgeaufbau, vollständige Master-/Paketprüfung und gemeinsamen Wechsel automatisch
   anschließen. Technische Zwischenschritte sollen keine neuen Bestätigungsdialoge verlangen.
5. Auftrag und tatsächliche Phase dauerhaft speichern. Wiederöffnen/Neustart muss einen vorhandenen Auftrag
   wiederfinden und nur nach frischer Eingangs-/Nutzungsprüfung fortsetzen; keine zweite parallele Aktion.
6. Einen eindeutigen Gesamtabschluss melden, erst wenn Quelle, Master und Paket zusammenpassen und IDs,
   eigene Entscheidungen sowie Projektlinks erhalten sind. Quellenimport allein ist weiterhin kein Abschluss.

Die heutigen zusätzlichen manuellen Status-/ID-/Namens-/Projektlink-Gegenprüfungen sollen regulär durch den
gebundenen Abschlussnachweis abgedeckt werden. Unabhängige Regressionen und Audits bleiben getrennt;
sie sind keine von Felix bei jedem Update wiederholt auszuführende Bedienkette.

### Rückfragen und sichere Wartezustände

Eine relevante Änderung betrifft insbesondere die taxonomische Identität/Nachfolgerzuordnung, wissenschaftliche
Zuordnung/Hierarchie, gewählten Namen oder eine eigene Aussage einer Projektart beziehungsweise verwendeten ID.
Reine neue Herkunftszeiten, Index-/Paketkennungen oder unverändert übernommene eigene Namen sind keine fachliche
Änderungsentscheidung. Nur tatsächlich betroffene geschützte Arten kompakt zeigen: bisheriger und vorgeschlagener
Stand, verständlicher Grund und mögliche Wirkung. Bestätigung bündeln; nach der Entscheidung denselben Auftrag
weiterführen. Bisherige Fotos und Projektdateien nicht durch einen Datenbankwechsel automatisch umschreiben.

Technische Fehler, fehlender Speicher oder ein nicht belegbar vollständiger Nutzungsstand sind **keine**
fachliche Rückfrage und keine Erlaubnis zur Schutzumgehung. Sie müssen als Fehler/Warten mit realem Grund sichtbar
sein; der bisherige Stand bleibt aktiv. Ein gegebenenfalls notwendiges Öffnen des Verbrauchers darf nicht als
eine beliebig oft wiederholte Katalog-Erfassungs-/Schließungs-/Bestätigungskette gestaltet werden.
Lightroom nur nach ausdrücklich bestätigter normaler Schließanforderung beenden; eine offene Katalogdatei
niemals mit einer alten Quittung neu freigeben.

### Vor der damaligen Umsetzung zu klärende und weiterhin abzugrenzende Punkte

- Dokumentierte SDK-Möglichkeiten für initiale Vollständigkeit, FN-Änderungen, Import/Löschen, Katalogwechsel,
  Plug-in-Neuladen und Neustart prüfen, bevor Beobachter oder Hintergrundfunktionen gewählt werden.
- Die Zeitlücke zwischen SDK-Erfassung und gemeinsamer Veröffentlichung technisch schließen. Ein alter
  Nutzungsnachweis plus aktuelle Dateiprüfsumme reicht nicht; eine Zuweisung während des Aufbaus muss die
  betroffene automatische Freigabe verhindern. Normale Arbeit in Lightroom möglichst weiter erlauben.
- Gleiches Ergebnis und Schutzverhalten bei durchgängig geöffnetem Verbraucher, offline/nicht erreichbarem
  Lightroom, unbekanntem Katalog, Neustart, Abbruch, Schreibfehler, doppeltem Start und veralteter Eingangsbindung.
- Unbenutzter unveränderter Bestand läuft ohne fachliche Rückfrage durch; eine geschützte Änderung hält nur
  die tatsächlich betroffenen Fälle zur Entscheidung an. Eigene Namen und bestehende IDs bleiben erhalten.
- Keine vollständigen SDK-/Datenbankschleifen in Statusabfragen oder beim Öffnen des Zuweisungsfensters.
  Erstaufnahme und gezielte notwendige Gegenprüfung dürfen nicht in dauernde Vollscans ausarten.

Diese Umsetzung und isolierte Tests waren keine Freigabe für einen produktiven Quellenlauf, Paketwechsel
oder Katalogabgleich. Der gespeicherte Gesamtweg ist inzwischen implementiert; die separat erteilte
Wiederanlauffreigabe führte zum belegten Paarabschluss vom 13. Oktober. Sie ersetzt weder die übrige
Gesamtabnahme noch eine Freigabe zukünftiger Produktivaktionen.

## Umfang und Freigabe

Felix bestätigte genau einen aktiven FN-Katalog:
`D:\Lightroom Katalog\Lightroomkatalog aktuell.lrcat`. Historische Dateien unter `Old Lightroom Catalogs`
sind keine zusätzlichen aktiven FN-Kataloge. Das Register unterstützt mehrere ausdrücklich vollständig
erfasste Kataloge; ein neu erfasster Katalog sperrt eine alte Gesamtfreigabe. Bereits registrierte Kataloge
dürfen nicht still aus der Schutzmenge verschwinden.

Die bestätigte Richtlinie `unused-classifications-v1` gilt ausschließlich für die vorhandenen, separat
belegten CoL-/Reichsklassifikationsfälle. Sie ist keine Freigabe für Split/Merge, Namensheuristik, Foto- oder
Projektmigration, beliebige technische Konflikte, neue Downloads oder Bereinigung.

## Historische ausdrückliche Erstaufnahme in Lightroom am 3. Oktober

1. Im Zusatzmodul-Manager die Version **0.4.24.15** laden beziehungsweise das Zusatzmodul neu laden.
2. `Bibliothek → Zusatzmoduloptionen → FN Wildlife verwalten … → FN-Katalognutzung erfassen …` wählen.
3. Die Erfassung bestätigen. Währenddessen keine FN-Zuweisungen oder anderen Fotoänderungen starten.
4. Nach erfolgreicher Erfassung Lightroom normal schließen, ohne weitere FN-Zuweisungen zu ändern.
5. Arten-Explorer mit dem neuen Programmstand öffnen. Unter
   `Datenbank-Aktionen → Taxonomiedatenbank → FN-Nutzung bestätigen …` die aufgeführten Kataloge prüfen.
   Nur bestätigen, wenn die Liste alle FN-Kataloge enthält und ihre FN-Daten seit der Erfassung unverändert sind.
6. Lightroom für die automatische Vormerkung und den anschließend separat bestätigten lokalen
   Kandidaten-/Paketwechsel geschlossen lassen.

Die Lightroom-Aktion liest alle Foto-UUIDs und `masterTaxonId` zweimal über das SDK. Katalogpfad, Fotozahl
und UUID-/ID-Zuordnung müssen zwischen den Durchgängen identisch bleiben. Abbruch, ungültige Kennung,
doppelte UUID, Lesefehler oder Änderungen verhindern die Speicherung. Gemeinsam gespeichert werden nur
Katalogpfad, Zeit, Gesamtsumme und Fotoanzahl je Master-ID, nicht Foto-UUIDs, Bildpfade oder Bilddateien.
Es gibt keinen Katalogschreibzugriff, keinen Stichwort-/Favoriten-/Statistikumbau und keinen automatischen
Vollscan beim Öffnen eines Fensters.

Die Quittung allein belegt **nicht** die Abwesenheit von Nutzung. Der Explorer verlangt die ausdrückliche
Bestätigung aller Kataloge und unveränderter FN-Daten zwischen Erfassung und normalem Schließen. Diese
Zeitlücke wird durch Nutzerbestätigung geschlossen, nicht durch behauptete unabhängige SDK-Beobachtung.
Anschließend bindet der Explorer die reguläre geschlossene Katalogdatei an Dateistand und SHA-256.
Er öffnet `.lrcat` nicht als SQLite-Datenbank und verändert sie nicht.

## Entscheidung und Schutz

### Bestätigte Erstaufnahme am 3. Oktober

Der einzige bestätigte FN-Katalog enthält laut SDK-Quittung **128.871 Fotos**, davon **5.484 mit
FN-Taxonomie** und **56 unterschiedliche verwendete Master-IDs**. Die Quittung wurde um 07:40:53 MESZ
gespeichert, die vollständige Katalogmenge um 07:42:24 MESZ bestätigt. Nutzungsrevision:
`2fde87b8fc14ea3bcf4e240e6f89bd9e01f68cc7fd542036658e7fe2e287290e`.

Anschließende lesende Automatikvorschau mit voller Dateiprüfsumme und aktuellen Projekt-/Namensgrundlagen:
**1.995 unbenutzte passende Fälle**, **187 unbenutzte unklare Gegenstücke**, **0 geschützte Fälle in dieser
Klassifikationsgruppe**. Keine Vormerkung, kein neuer Aufbau und kein Wechsel durch diese Prüfung.
Die Null bedeutet nicht, dass keine Arten geschützt sind: Die 56 genutzten IDs sowie Projektarten und eigene
Entscheidungen schneiden lediglich diese 2.182 offenen Klassifikationsfälle nicht.

Für diesen bereits bestätigten Stand genügt der vorhandene gemeinsame Einstieg
`Datenbank-Aktionen → Taxonomiedatenbank → Datenbank aktualisieren` mit seiner Startrückfrage. Er führt
die frische automatische Vormerkung, einen lokalen Folgeaufbau und die geprüfte gemeinsame Master-/Paket-
Übernahme zusammen aus. Die sechs Erstaufnahmeschritte nicht erneut durchführen, solange der Nachweis
frisch bleibt. Kein zusätzlicher Anbieterdownload und keine neue Einzelbestätigung der 2.182 Fälle.

Felix hat diesen Updateweg anschließend bestätigt: um **07:52:59 MESZ** wurden beide Gruppen mit insgesamt
2.182 Ereignissen atomar vorgemerkt, direkt danach der lokale Master-Folgeaufbau gestartet.
Identitätsrevision `8aba3cdd302211c0f252971e8f00cf7505bfc87b7fdcc2c149b090512226b74b`.
Erster bestätigter Stand war `building` / `Eingangsstand sichern`, kein Fehler; alter Master und Paket noch aktiv.
Der bestätigte Folgeweg ist um **09:11:14 MESZ** vollständig abgeschlossen: neuer Master
`master-20261003055911210` und Paket `lightroom-fa739bd28ec1e82a0283` gemeinsam aktiv.
1.995 Klassifikationen mit alter ID verarbeitet, 187 neue unklare Gegenstücke zurückgestellt, keine offenen
Klassifikationen oder blockierenden Konflikte. Die 56 genutzten IDs sind im Paket vorhanden; eigene Namen
und alle 60 Projektlinks erhalten. Die Wiedervorlage wurde gelöscht; Lightroom darf wieder geöffnet werden.
Kein weiterer Aufbau oder erneute Erstaufnahme für diesen abgeschlossenen Wechsel erforderlich.

Felix' Bedienziel ist möglichst keine eigene Aktion im normalen Updateweg. Die verbleibende manuelle
SDK-Erfassung, das normale Schließen und die Gesamtbestätigung sind eine bekannte erste Betriebsgrenze,
nicht als fertige Hintergrundautomatik zu bezeichnen. Eine weitere Vereinfachung muss den vollständigen
Nutzungsnachweis erhalten; unbekannte Nutzung darf weiterhin nicht als unbenutzt behandelt werden.

Bei vollständigem aktuellem Nutzungsnachweis:

- In irgendeinem registrierten Katalog genutzte Master-ID: keine automatische Vormerkung.
- Angelegte Projektart, eigene Namens-/Feldaussage, Feldentscheidung oder ausdrücklich eigene
  Identitätsentscheidung: keine automatische Vormerkung. Vorgänger und Kandidatengegenstück werden geprüft.
- Unbenutzter passender Quellenfall: Klassifikation mit ursprünglicher Master-ID vormerken.
- Unbenutzter unklarer Quellenfall: ausschließlich das gebundene neue CoL-Gegenstück zurückstellen;
  bisherige Arten/IDs erhalten. Keine behauptete Identitätsgleichheit oder Umleitung.
- Fehlender, unvollständiger, beschädigter, neuer, veralteter oder offener Katalognachweis: keine negative
  Nutzungsannahme und keine automatische Vormerkung. Bereits bekannte positive Nutzung bleibt geschützt.

Beide automatischen Gruppen werden in einem einzigen atomaren Identitätsjournal-Schreibvorgang vorgemerkt.
Jedes Ereignis enthält Richtlinie und Nutzungsrevision; die bestehende Quellen-/Fall-/Registerbindung bleibt
erhalten. Schreibfehler erzeugen keine halbe Gruppe, unveränderte Wiederholung keine doppelten Ereignisse.

`Unbenutzte Fälle automatisch vormerken` arbeitet nur auf Klick und startet keinen Aufbau oder Paketwechsel.
Die bestätigte vollständige Datenbankaktualisierung kann dieselbe Vormerkung bei offenen Klassifikationen
ausführen und danach genau einen lokalen Folgeaufbau ohne Anbieterrefresh starten. Kein Start beim Öffnen,
kein dauerhafter Server-Folgelauf und keine automatische Wiederholungsschleife. Geschützte verbleibende Fälle
stoppen weiterhin zur Rückfrage. Nach vollständiger Vormerkung kann der einzige frische Kandidat beide
Gruppen und den unabhängigen ID-Fix gemeinsam verarbeiten.

## Frische und Betriebsgrenzen

`.lock`, WAL, SHM oder Journaldatei, fehlende/anders gestempelte Katalogdatei, neuer Erfassungsstand oder
geänderte Prüfsumme sperren die Freigabe. Vorschau/Bestätigung und Aktivierung prüfen bei Bedarf die volle
Dateiprüfsumme; Aufbau-/Fortsetzungsbindungen prüfen den gespeicherten Dateistand ohne wiederholte
Vollkatalog- oder Prüfsummenscans im Polling. Der kurze gemeinsame Zeigerwechsel prüft nochmals die Frische.
Bereits aktivierte automatische Historie verlangt keine dauerhafte Lightroom-Schließung.

Ist kein Lightroom-Prozess mehr vorhanden, bestehen aber noch solche Arbeitsdateien, erklärt die
Updateanzeige den fehlenden Katalogabschluss. Sie fordert nicht erneut das Schließen eines bereits
beendeten Prozesses. Der Auftrag wartet weiterhin; Dateiexistenz, neue requestgebundene Erfassung,
geschlossene Registrierung und vollständige Frischeprüfung bleiben dieselben Voraussetzungen. Ein
verschwundenes Fenster oder beendeter Prozess allein ist keine Freigabe und kein Auftrag zum Löschen
dieser Dateien. Die gezielte Vorher-/Nachherprüfung und reale Beobachtung stehen im
[Auditauftrag, Abschnitt 10.24](audit-auftrag-phase-10-5.md#1024-freigegebener-realer-lokaler-wiederanlauf--11-und-12-oktober).

**Bewusste Betriebsgrenze:** Noch keine dauerhafte inkrementelle SDK-Nutzungsfortschreibung. Ein nach
der Bestätigung geöffneter/geänderter Katalog wird nicht als unverändert angenommen. Vor einem weiteren
Paarwechsel fordert der bestätigte Updateweg bei Bedarf erneut seine eigene Erfassung und den normalen
Katalogabschluss an. Historische oder bereits aktivierte Identitätsereignisse werden nicht nachträglich
umgestempelt. Für noch nicht übernommene eigene Ersatzaufträge gibt es den ausdrücklich bestätigten
erneuten Schutzvergleich mit separatem Erneuerungsnachweis, beschrieben im
[Gesamtweg](taxonomy-update-automation.md#gespeicherte-steuerung-und-wiederanlauf). Eine spätere
inkrementelle Fortschreibung benötigt einen eigenen belegten Vollständigkeits-/Neustartvertrag.

Historische Aufträge/Kandidaten werden nicht umgeschrieben. Neue Aufträge binden die neuen Schutzregeln;
der gesperrte produktive Kandidat vom 2. Oktober wurde nicht nachträglich freigegeben, sondern durch den
frisch gebundenen und vollständig geprüften Folgeaufbau vom 3. Oktober ersetzt. Keine automatische Aktivierung
allein durch die Nutzungsbestätigung. Vollständige Quellen-, ID-, Master- und Paketprüfung bleiben erforderlich.
