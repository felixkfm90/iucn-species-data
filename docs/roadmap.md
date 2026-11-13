# Roadmap

Stand: 2026-11-11

## Aktueller Stand

Der Nachlauf vom 6. November ergänzt den allgemeinen IUCN-Abruf um den
[Fallback über bekannte Mastersynonyme](taxonomy-source-decision.md#36-iucn-red-list).
Führender Artname und Artzuordnung bleiben erhalten. Die
[Wiederaufnahme gespeicherter Artanlagen](add-species-workflow.md#schritt-1-allgemeine-daten-pruefen)
zeigt Grunddaten und vorhandene Portraits erneut. Die
[Medienprüfung](media-asset-validation.md) erlaubt dokumentierte fehlende Karten und Portraits
analog zum vollständig fehlenden Soundpaket; beschädigte oder widersprüchliche Bestände bleiben offen.
Quell- und Gegenproben sind von der noch erforderlichen Bedienprobe mit der bestehenden Mittelspecht-Anlage getrennt.

Der Kartenlink öffnet lokal die IUCN-Browserseite mit Taxon- und Assessment-ID. Fehlende Taxonkennungen
des vorhandenen Bestands wurden ausschließlich über die jeweils gespeicherte Bewertung ergänzt;
Artidentität, Bewertungen und Medien bleiben erhalten. Der automatische API-Kartenabruf bleibt offen.
Der fehlgeschlagene [Pages-Lauf 42274278221](https://github.com/felixkfm90/iucn-species-data/actions/runs/42274278221)
hat außerdem eine zweite Sperre für dokumentiert fehlende Medien in `audit:project` offengelegt.
Die Nachkorrektur ist gegen denselben veröffentlichten Datenstand und fehlerhafte Gegenfälle geprüft.
Felix hat die fünf CI-/Test-/Dokudateien gesondert freigegeben; Commit `17b7821` ist auf GitHub veröffentlicht.
Im [Nachlauf 42277855446](https://github.com/felixkfm90/iucn-species-data/actions/runs/42277855446)
bestehen Linux-Qualitätsprüfung und Artefaktbau. Die Bereitstellung ist auch nach zwei gezielten Wiederholungen
wegen einer Zeitüberschreitung bei GitHub Pages fehlgeschlagen; der gesamte Lauf bleibt deshalb fehlgeschlagen.
Bei diesem Nachlauf lieferte die öffentliche Datendatei noch den vorherigen Stand. Der erste Laufversuch war bereits bei der
langsamen Ubuntu-Paketinstallation abgebrochen; dies ist getrennt vom behobenen Projektprüfungsfehler.
Protokoll- und Vergleichsnachweise liegen privat unter `data/operational-checks/pages-42274278221-fix-G9DOgN/`.
Die Kartenlinkumstellung war nicht Bestandteil dieses Fünf-Dateien-Commits. Nach weiterer ausdrücklicher
Freigabe sind die drei dafür benötigten Veröffentlichungsabhängigkeiten mit drei Testdateien und der
Kartenherkunftsdokumentation als Commit `fa6bf46` veröffentlicht. Die Übertragungssperre ist danach auch
im echten Projekt aufgehoben (`ok: true`, keine unveröffentlichten Abhängigkeiten); 21 gezielte Tests bestehen.
Im [Pages-Lauf 42289501913](https://github.com/felixkfm90/iucn-species-data/actions/runs/42289501913)
für `fa6bf46` brach GitHub den FFmpeg-Paketdownload vom Azure-Ubuntu-Spiegel nach 25 Minuten vor dem
Qualitätsgate ab. Felix' Datenübertragung `cc69dd6` bestand mit demselben Workflow und Runner-Image im
[Pages-Lauf 42290589519](https://github.com/felixkfm90/iucn-species-data/actions/runs/42290589519) alle drei Jobs.
Am 9. November stimmten öffentliche Artdaten und Mittelspecht-Karte bytegenau mit `cc69dd6` überein.
Der begrenzte Wechsel zu den Ubuntu-Archiven bei Downloadproblemen ist als Commit `58b6b5a` veröffentlicht.
Im [Pages-Lauf 42638354875](https://github.com/felixkfm90/iucn-species-data/actions/runs/42638354875) bestanden
FFmpeg-Installation, Qualitätsgate, Artefaktbau und Deployment auf dem aktuellen Runner. Die öffentlichen Artdaten
und die Mittelspecht-Karte stimmen bytegenau mit dem Commit überein. Der GitHub-Lauf nutzte die Runner-Quellen.
Die [Ausweichlogik](ci-quality-gate.md#getrennte-zeitbudgets-für-einrichtung-und-prüfung) ist durch sechs lokale
Bash-Proben mit simulierten Befehlen belegt. Vergleich und Veröffentlichungsnachweis liegen privat unter
`data/operational-checks/pages-run-comparison-20261109-7GAzbB/`.

Das Gesamtaudit Phase 10.5 ist seit **27. Oktober 2026 abgeschlossen**. Explorer, Taxonomie, Lightroom,
Medien, Speicher/Restore, Website und GitHub sind im vereinbarten Umfang angenommen. Gesamt-Go,
Prüf-/Veröffentlichungsnachweise und bewusste Nachweisgrenzen stehen ausschließlich im
[Auditauftrag, Abschnitt 10.55](audit-auftrag-phase-10-5.md#1055-lightroom-großprobe-und-gemeinsamer-abschluss--27-oktober).

- **Explorer:** angenommenes Logo und W-Hinweis, gezielte Bedienprüfung sowie isolierte Start-/Speichermessung.
- **Website:** alle 137 Sitemapseiten plus vier Einstiegspfade in drei Ansichten gesichtet; vereinbarte
  Korrekturen als Paket veröffentlicht und gezielt öffentlich nachgeprüft.
- **Lightroom:** Auditabnahme mit regulärem Plug-in **0.4.24.40**; Großprobe auf eigenen Kopien einschließlich genauer
  Rücknahme bestanden. Originalkatalogbestand unverändert; Standardkatalog liegt auf D:.
- **Sicherung:** isolierter Großrestore mit Inhaltsprüfung und Programmstart abgenommen. Die historische
  Testinstallation ist bereinigt; die anschließend beauftragte vollständige NAS-Sicherung vom 28. Oktober
  ist einschließlich Rücklese-, Quell- und Aufbewahrungsprüfung abgeschlossen (Abschnitt 10.57).

Felix hat anschließend Dokumentations-/Dateibereinigung, Temp-Leerung, Sicherungsinventar und nach
Commit/Push einen neuen lokalen Projektchat beauftragt. Der Nachlauf steht in Abschnitt 10.56 desselben
Auditauftrags; die private Belegablage erklärt der [Tempvertrag](temp-retention.md). Im Folgechat hat Felix
die Umbenennung des gemeinsamen Datenordners von `Daten` zu `data` samt nötigen Anpassungen beauftragt.
Der lokale Ordnerwechsel ist ausgeführt; Stand und Prüfgrenzen stehen im [Speichervertrag](storage-migration.md).
Es erfolgt kein neuer Taxonomieaufbau und keine erneute vollständige Auditserie allein wegen des Chatwechsels.

Die anschließend beauftragte Dateiverwendungsprüfung ist im [Strukturvertrag](repo-structure.md#dateiverwendungsprüfung-vom-27-oktober-nach-dem-pfadwechsel)
festgehalten: vollständige physische Inventur, Programm-/Dokument-/Assetprüfung und konkrete Ballastkandidaten.
Eigene neue Testreste sind beleggesichert entfernt. Nach zusätzlichem Auftrag sind auch FFplay, der alte
Einmal-Normalisierer, eine bytegleiche Stagingkarte und die vollständig gegen das NAS-Archiv geprüfte lokale
Audiomigrationskopie entfernt. DD/NE bleiben ausdrücklich als Reserve; geschützte Rückwege sind erhalten.

Felix hat anschließend Commit und Push des gesamten geprüften Folgestands samt Pfadumstellung,
Bereinigung und Dokumentation sowie die Kontrolle des zugehörigen GitHub-Pages-Laufs ausdrücklich beauftragt.
Der Nachweis der tatsächlichen Revision und der Qualitäts-, Artefaktbau- und Deploymentergebnisse wird
nach Ausführung privat unter `data/file-usage-review/2026-10-27/publication/` gesichert. Die örtliche
Speicherkonfiguration und privaten Daten bleiben Git-/Pages-ignoriert; die neue Freigabe umfasst deren
Veröffentlichung nicht. Den anschließenden beauftragten Lightroom-/NAS-Nachlauf führt
[Abschnitt 10.57](audit-auftrag-phase-10-5.md#1057-lightroom-nachprüfung-und-nas-sicherung--28-oktober).

### Abgleich mit dem Wochenreview vom 24. Oktober

Der Abgleich vom **3. November** ersetzt die damalige Einordnung „Audit noch nicht abgeschlossen“.
Abschluss, Wiederanlauf und die Website-Abnahme in drei Ansichten sind im führenden Auditauftrag
dokumentiert. Der [Lightroom- und NAS-Nachlauf](audit-auftrag-phase-10-5.md#1057-lightroom-nachprüfung-und-nas-sicherung--28-oktober)
führt die späteren Betriebsbelege. Die Arten- und Medienzahlen des Wochenreviews sind historisch.
Die [aktuelle Statusdatei](project-status.md) besteht die Prüfung gegen die produktiven Quelldateien.

Der gemeinsame lokale Veröffentlichungszeiger und die darüber ausgewählten Manifeste
für Master und Lightroom bestätigen weiterhin das
[gemeinsame Paar vom 24. Oktober](taxonomy-current-status.md#aktives-paar--24-oktober) mit
COL26.10 XR. Die im Review genannten Stände vom 3. Oktober und Plug-in .22 sind damit historisch.
Der automatische IUCN-Kartenabruf bleibt als Anbieterpunkt offen, mit Browser-/Dateiimport als
dokumentiertem Arbeitsweg.

Die Nachprüfung am **11. November** bestätigt den [Pages-Lauf 43063381462](https://github.com/felixkfm90/iucn-species-data/actions/runs/43063381462)
für `9a8db4e` mit bestandener Qualitätsprüfung, Artefaktbau und Deployment. Der entfernte
`main`-Stand zeigt auf dieselbe Revision. Die öffentlichen Seiten Kontakt, Über uns, Ausrüstung,
Sizilien 2020, Bisamratte und Rappenantilope binden alle zwölf FN-Skripte in derselben Version und
Reihenfolge wie die Footer-Vorlage ein. Das von Squarespace gelieferte Custom CSS importiert auf
allen sechs Seiten Stand 1.0.19. Die zwölf Skripte, die CSS-Datei, `speciesData.json` und die
Rappenantilopen-Karte stimmen auf Pages bytegenau mit `9a8db4e` überein. Die Stichprobe erfasst
die veröffentlichten Dateien und die öffentlichen HTML-Einbindungen. Für die Darstellung in drei
Ansichten gilt die dokumentierte Auditabnahme. Die automatische Artseitenanlage hat eine eigene
offene Abnahme im Squarespace-Editor.

Ein separater öffentlicher Chrome-Lauf bestätigt auf der Rappenantilopen-Seite auch die Ausführung
der Module. Die Artinformationen, acht Taxonomiestufen und das Porträt wurden gerendert.
Nach dem Scrollen in den Kartenbereich wurde die Karte vollständig geladen.
Der Bereich für Tierstimmen meldet die fehlende Aufnahme und zeigt keinen Player.

Die überdeckte Kartenüberschrift der Rappenantilope ist seit dem **11. November** in Squarespace
korrigiert. Die Desktopüberschrift ist breiter. In beiden Layouts beginnt der Kartenblock in der
darauffolgenden Rasterzeile. Der unabhängige öffentliche Browser bestätigt die vollständige Überschrift
und den Kartenöffner an neun Fenstergrößen zwischen 320 und 1.219 Pixeln, darunter 820 × 1.180 und
1.180 × 820 für Tablet-Hoch- und Querformat sowie die Grenze bei 767/768 Pixeln. Bei 320 Pixeln
bleiben beide Überschriftenzeilen sichtbar. Die automatische Artseitenanlage ist separat abzunehmen.

Der anschließende Browserlauf misst alle 65 veröffentlichten Artseiten der Sitemap bei 1.219,
900, 768, 390 und 320 Pixeln. Er findet in 57 vorhandenen Seiten eine Überlappung von
Kartenüberschrift und Kartenbereich bei 320 Pixeln. Beim Mittelspecht tritt sie bereits bei
390 Pixeln auf. Der lokale neue Artseitenaufbau fasst Überschrift, Begleittext und Karte zu einem
gemeinsamen Block zusammen. Die technische Rücklesung und die Darstellung sind lokal geprüft.
Seit dem **11. November** lädt der Squarespace-Footer den Karten-Lader **1.0.12**.
Der [Pages-Lauf 43087338567](https://github.com/felixkfm90/iucn-species-data/actions/runs/43087338567)
für `3f57e78` bestätigt Qualitätsprüfung, Artefaktbau und Deployment. Die öffentlich abgerufene
Skriptdatei stimmt bytegenau mit dem Commit überein. Der Bildtextprüfer akzeptiert die zwei
geprüften Kartenstände mit identischer Bildzuordnung und identischem Alternativtext.
Im öffentlichen Browser sind **65 Seiten × 5 Breiten** mit der neuen Version gemessen. Alle 58
bisherigen Überlappungen sind behoben. Die Rasterpositionen der übrigen 267 Messfälle sind gleich.
Mittelspecht bei 390 Pixeln und Gepard bei 320 Pixeln bestätigen geladenes Kartenbild,
Vergrößerung und Fokusrückgabe. Die Desktopposition erscheint nach dem Verbreitern wieder.
Die Rappenantilope besteht im veröffentlichten Stand erneut bei 820 × 1.180 und 1.180 × 820
Pixeln sowie an der Grenze bei 767/768 Pixeln.

Der erneute Abgleich am **12. November** bestätigt `3f57e78` als entfernten `main` und die drei
erfolgreichen Jobs des jüngsten Pages-Laufs. Die Rappenantilopen-Seite bindet den Karten-Lader
1.0.12 ein. Die ausgelieferte Datei stimmt mit dem Commit überein. Die neu gelesenen lokalen
Manifeste bestätigen den gemeinsamen CoL-, Master- und Lightroom-Suchpaketstand vom 24. Oktober.
`status:check` bestätigt die aktuelle generierte Statusdatei.

Damit ist die Einordnung des Wochenreviews abgeschlossen. Der damalige offene Audit- und
Wiederanlaufstatus ist durch die dokumentierte Abnahme überholt. Der isolierte Restore-Nachweis
gilt für die geprüfte Testinstallation vom 7. Oktober. Die vollständige NAS-Sicherung vom
28. Oktober wurde als Archiv geprüft. Ein erneuter Programmstart aus diesem Archiv ist nicht
belegt. Der automatische IUCN-Kartenabruf und die native Abnahme der neuen Artseitenanlage
bleiben eigenständige offene Punkte.

## Regelbetrieb nach dem Audit

Die regulär geladene Version **0.4.24.42** ist seit 28. Oktober gezielt nativ bestätigt.
Der aktuelle Quellstand **0.4.24.43** ergänzt den Installer-Node-Pfad; die native Ladung der neuen Version steht noch aus.
Die Suche erkennt den `data`-Bestand und findet Weissstorch samt Details. Lightroom verwendet den normalen D:-Katalog.
Angenommene Prüfungen nur bei einem Regressionsgrund wiederholen. Geschützte Quellen, Rückwege,
NAS-Archive und dauerhafte Auditbelege bleiben erhalten. Ein künftiger echter Taxonomieaufbau kann
die noch nicht gemessene aktive Fortschritts-/Leistungsbeobachtung ergänzen; dafür keinen reinen
Testaufbau starten. Weitere Umsetzung und Veröffentlichung benötigen Felix' jeweiligen Auftrag.

## Laufende Umsetzung nach Gesamtfreigabe vom 31. Oktober

**Arbeitsziel:** Den bestätigten FN-Arbeitsplatz für Felix und seinen Bruder einschließlich gemeinsamem
NAS-Bestand, Offlineabgleich, Websitevorbereitung/-übernahme, Windows-Einrichtung und Android-Nachschlagewerk
fertigstellen und alle selbst durchführbaren Prüfungen erledigen. Felix wird für notwendige Entscheidungen,
Bedienfeedback und tatsächliche Zielgeräteprüfungen benötigt. Die Grundsatzfreigabe liegt bereits vor;
Einzelfortschritte und Paketproben werden weiterhin getrennt von der Betriebsabnahme belegt.

**Aktuelle Priorität:** Website und neue Artseiten bis zur durchgehenden Squarespace-Probe
einschließlich Bild-Upload, Speichern und Wiederöffnen der deaktivierten Seite. Die öffentliche
Freigabe bleibt eine eigene Entscheidung. Für den aktuellen Einzelauftrag hat Android Vorrang.
Der Wechsel auf 65 Arten per Katalogabgleich ist am Gerät bestätigt. Der GitHub-Prüflauf für
künftige öffentliche Arten und die ausdrücklich einschaltbare Übernahme in den Pages-Lauf sind
lokal geprüft. Die Aktivierung und der erste automatische Lauf in GitHub stehen aus.
Der gemeinsame Bestand auf dem NAS, der Windows-Installer
und die Update-Abschlussaktionen haben eigene Abnahmen. Notwendige Abhängigkeiten werden bei Bedarf
für den laufenden Schritt bearbeitet. Gemeldete Fehler behalten Vorrang.

Die Qualitätsverbesserung der
Sprachprüfung ist technische Umsetzungsarbeit, nicht Felix' Abnahmeaufgabe. Felix bestätigt inzwischen
die funktionierende deutsche Prüfung direkt im geöffneten Textfeld; der zusätzliche manuelle Button
entfällt aus Bildtext- und Artseitenredaktion. Die ergänzende automatische Grammatikprüfung bleibt bis
zu ihrer eigenen Qualifikation deaktiviert; dieser Nachlauf hält die Buttonentfernung nicht auf.
Details führt der [Sprachprüfvertrag](../species-explorer/language-check/README.md).
Die vier Update-Abschlussaktionen
zunächst mit abgefangener Systemaktion und abbrechbarem Countdown prüfen;
die SDK-/Desktopnutzung weiter mit Numis und Kauf-Suchcockpit abstimmen. Die Squarespace-/Bildtexthilfe-Fehlerprüfung führt der
[Bildtextvertrag](image-alt-audit.md).

Die isolierte Update-Abschlussprobe ist mit eigenem echtem Einart-Master, Suchpaket und leerer
Testkatalogdatei vorbereitet; **11/11 Vorprüfungen** bestehen. Nur der letzte Windows-Aufruf wird
fest abgefangen, der normale 60-Sekunden-Countdown bleibt erhalten. Details führt der
[Abschlussvertrag](../species-explorer/update-completion/README.md#isolierte-integrierte-desktopprobe).
Nach Vervollständigung der eigenen Fixture erreicht die native Variante **Nichts tun** einen echten
erfolgreichen Suchpaketabgleich und bleibt erwartungsgemäß geöffnet. Die erste Variante **Explorer
beenden** zeigt dagegen einen Fehler: Der Countdown beginnt hinter dem noch offenen Datenbankdialog.
Die Aktion wurde über den sichtbaren Abbrechen-Button abgewählt und nur das eigene Prüffenster
regulär geschlossen. Die gemeinsame Zugänglichkeitsprüfung ist inzwischen korrigiert; **92/92**
Fälle einschließlich Desktopintegration und Prüfstarter bestehen. Der verbundene Diensttest verlangt
nach einer Verdeckung einen neuen Token und erneut volle 60 Sekunden.
Am **3. November** starten die drei frischen Windows-Prüfsitzungen erst nach Schließen des Dialogs
mit vollen 60 Sekunden. **Explorer beenden** schließt die eigene Instanz automatisch. **Neustart**
erreicht genau eine abgefangene Anforderung. **Herunterfahren** wird über die Oberfläche erfolgreich
abgebrochen. Der dabei beobachtete veraltete Zusatzhinweis ist lokal korrigiert (**85/85** Fälle).
Eine vierte Prüfsitzung bestätigt auch den vollständigen Herunterfahren-Countdown mit genau einer
abgefangenen Anforderung und automatischem Schließen des Prüffensters. Der PC bleibt dabei an.
Die Abbruchbestätigung bleibt in der laufenden Sitzung sichtbar und erscheint nach einem
Explorerneustart nicht als alter Hinweis. Das ist automatisiert geprüft. Der Prüfstart am
9. November erreichte kein ansteuerbares Fenster. Offen bleiben die sichtbare Gegenprobe,
die normale Desktop-Integration und eine gegebenenfalls gezielt angesetzte tatsächliche Windows-Aktion.

Nach dem ersten privaten Play-Test bestätigt Felix ausdrücklich: **Die übrigen vereinbarten
Projektbereiche haben Vorrang vor einer umfassenden Appüberarbeitung.** Den gemeinsamen
Projektbestand und Artseiten-/Leserablauf weiterführen; zusätzliche App-Bedienrückmeldungen sammeln.
Die offene App-Liste und der tatsächlich erreichte Quell-/Gerätestand stehen im
[mobilen Modulvertrag](../mobile/README.md#bedienrückmeldungen-vom-1-november).
Felix hat am 2. November die App anhand eigener Screenshots durchgesehen. Die gemeldeten
Downloadunterbrechungen und unklaren Speicher-/Auswahlgrößen werden als Fehler vor dem umfassenden
optischen Appumbau bearbeitet. Die gewünschte Navigation lautet Tiergruppen wie Vögel/Säugetiere,
darin weitere Untergruppen mit Sprungpiktogrammen und alphabetischen Arten; der bisherige
Klassenfilter allein reicht dafür noch nicht aus.
Der Downloadnachlauf ist als Quellfassung **0.1.3+4** vorbereitet: haltbare Fortsetzung, getrennte
Speicheranzeige, kleinere 750w-Fotos, Größenvorabprüfung und eigener Android-Hintergrundauftrag.
**120/120 lokale Appfälle**, Analyzer ohne Befund, echte Kotlin-Kompilierung und **6/6** Fälle des
gemeinsamen Schreibschutzes bestehen. Debug-APK und signiertes Bundle sind tatsächlich gebaut und
geprüft; der bestehende interne Play-Track bestätigt **0.1.3 (4)** seit **2. November, 21:16 Uhr** als
verfügbar. Installation sowie die von Felix für morgen angebotene S24-/Bildschirm-aus-Probe bleiben
offen; Einzelheiten und Nachweisgrenzen führt der mobile Modulvertrag.

Auf Felix' Auftrag vom **3. November** ist **0.1.4 (5)** seit **17:23 Uhr** im bestehenden internen
Play-Track verfügbar. Die neue Testfassung bringt Tiergruppen mit Familienüberschriften und
Sprungleiste sowie den kompakteren Artkopf, den direkten FN-Link und die Karte im zugehörigen
Abschnitt. **122/122 App-Tests**, Analyse, Prüfbau und signiertes Bundle bestehen. Installation und
Bedienfeedback auf S24/S25 stehen aus. [Android-Vertrag](../mobile/README.md)

Die gemeinsam abgestimmte kompakte Kopfzeile ist lokal integriert: Artbestand samt Artenzahl,
reine Zustandsanzeigen, ein Schloss und getrennte Website-/Weitere-Aktionen-Menüs. Prüfung und
Hinweise unterscheiden tatsächliche Fehler von Pflegehinweisen und neutralen Informationen.
Lesemodus und asynchrone Bestätigungs-/Speicherrennen sind gezielt abgesichert. Automatisierte
Nachweise und die weiterhin offene normale Fensterabnahme stehen im
[Desktopvertrag](desktop-shell-plan.md#abgestimmte-anordnung-der-kopfzeile-vom-2-november).

Der lokale Kernnachlauf vom **2. November** ergänzt die sichtbare Übernahme eines geprüften
Artseitenentwurfs in den gemeinsamen Artbestand und die unveränderliche normale Bild-/Tonbereitstellung
einschließlich Sicherungsanschluss. Vollständige Gegenproben: **597/597 gemeinsamer Dienst**, **182/182
Artseiten**, **31/31 NAS**, jeweils ohne Skips. Die laufende NAS-Version, Website und Play-Version
sind dadurch nicht aktualisiert. Fachliche Grenzen führen die vorhandenen Modulverträge.

Der anschließende Windows-Datei-/Freigabeanschluss ist mit **635/636 Projektfällen** geprüft;
ein Dateisymlinkfall benötigt eine hier fehlende Betriebssystemberechtigung. Weitere Serien:
**192/192 Artseiten**, **19/19 Artaktionen**, **34/34 Explorerintegration**, **7/7 Router** und
**170/170 lokale Texthilfe**. Die neue native Sprachprobe trifft sechs von sieben erwarteten
Korrekturtexten; wirkungslose Befunde und falsche Erklärungen verhindern weiterhin eine allgemeine
Sprachqualitätsfreigabe. Das ist der frühere Teilstand; der folgende Qualitätsnachlauf ersetzt keine
sprachliche Ergebnisabnahme.

Der anschließende Sprachqualitätsversuch v6 bleibt mit **6/10 passenden Gesamtergebnissen** offen.
Wegen kopierter Beispieltexte und weiterer ausgelassener oder wirkungsloser Befunde ist der Requestbau
wieder vollständig auf v5 zurückgestellt. Zusätzliche objektive Prüfungen widersprüchlicher Befundarten
bleiben erhalten. Der aktuelle Nachlauf besteht mit **173/173 lokalen KI-Fällen** und **35/35 Integration**;
der gesamte zurückgestellte Modellablauf benötigt weiterhin seine Ergebnisprüfung.

Der folgende CMS-Kernanschluss trennt den vollständigen lokalen Planhash von der tatsächlich
beobachtbaren Editorfassung. Neue Pläne/Quittungen verwenden Version 2 mit geordneten Texten,
Bildzuordnungen und deaktiviertem gespeicherten Seitenzustand; passende Hashs allein genügen nicht.
Der Nachlauf besteht mit **80/80 gezielten Fällen**, **221/221 Artseiten**, **101/101 Sicherungsfällen**
und **34/34 Explorerintegration**. Eine lesende Squarespace-Probe bestätigt: **Nicht verlinkt** ist
kein unveröffentlichter Zustand. Reale Neuanlage, Deaktivierung vor Inhaltseingabe, Upload und
Wiederöffnen müssen im tatsächlichen Browseradapter erst noch belegt werden.

Der anschließende Explorer-/Browseranschluss verwendet dieselbe persönliche Squarespace-Verbindung
und den vorhandenen Seitenspeicher. Geänderte Dateien stoppen jetzt auch unmittelbar vor Schreibbeginn;
Abbrüche und Verbindungsverlust bleiben ohne automatische Neuanlage offen sichtbar. **242/242 Artseiten**,
**267/267 Desktopfälle** und **35/35 Integration** sind lokal geprüft. Der Anlegeknopf bleibt im normalen
Explorer bis zum tatsächlich unterstützten Squarespace-Driver ausgeblendet; eine echte Seite wurde nicht angelegt.

Der folgende gemeinsame Artanlageanschluss verwendet den tatsächlichen lokalen Eingabe-/Taxonomieleser
und legt online nur einen vollständigen gemeinsamen Entwurf an. Gleichzeitige doppelte Identitäten,
Namen, Slugs und Assetbindungen werden innerhalb der Serverschreibtransaktion abgewiesen. Bei verlorener
Antwort wird ausschließlich der frisch gelesene Bestand verglichen. **130/130 Kernfälle** bestehen;
lokale Artenlisten und Medien bleiben dabei unverändert. Der folgende Quellstand verbindet die
allgemeinen Felder des vorhandenen Assistenten mit der gemeinsamen Vorschau und Anlage sowie einem
eigenen ausschließlich lesenden Recoveryweg. **135/135 gezielte Fälle**, **41/41 Explorerintegration**
und eine sichtbare isolierte Chromeprobe bestehen: Nach verlorener Antwort, Schließen und Wiederöffnen
bleibt es bei genau einem tatsächlichen Anlageauftrag. Persönlicher Electron-Start, NAS-/Zweit-PC-Betrieb
und gemeinsame Fach-/Medienwege waren in diesem Schritt noch offen. Das damalige
Containerquellziel war **0.1.6**, getrennt vom laufenden NAS und den bisherigen Paketen.
Der ergänzende Nachlauf besteht mit **39/39 Explorerintegration**, **31/31 NAS** und **11/11 bisherigen
lokalen Artanlagefällen**. Von **95 Sicherungsfällen** bestehen 94; ein Windows-Junctionfall bleibt
wegen fehlender Berechtigung übersprungen. Das kleine gebundene NAS-Quellarchiv ist vorbereitet;
Aktivierung und Bedienabnahme bleiben eigene Schritte.

Der anschließende Quellschritt stellt den wiederverwendbaren Fach-/Sound-/Einartkern bereit und
verwendet ihn bereits im lokalen CLI. **62/62 Providerfälle** einschließlich drei tatsächlicher
isolierter CLI-Läufe und **58/58 Explorer-/Artanlage-/Taxonomieregressionen** bestehen. Die nächste
gemeinsame Fach-/Medienübernahme benötigt weiterhin dauerhafte Kandidatenbytes und eine gebundene
Übernahme in dieselbe Warteschlange; sie ist noch nicht im Explorer bedienbar. Details und Prüfgrenzen
führt der [Artanlagevertrag](add-species-workflow.md#gemeinsamer-einartkern-für-fach--und-mediendaten).

Der anschließende gemeinsame Kandidatenvorbereiter ist mit **59/59 gezielten Fällen** und
**37/37 Audioregressionen** geprüft. Dazu gehören tatsächliche Bild-/Ton-Dekodierung und Spektrogrammerzeugung,
begrenzte Antwortkörper, Abbruch/Schließabschluss und eine verlustfreie Schutzprojektion. Die Rückgabe
des reinen Vorbereiters bleibt ein Vorschlag. Der lokale Nachlauf vom **3. November** verbindet ihn
mit der dauerhaften persönlichen Kandidatenablage einschließlich Medienreserve, Sicherung und
Wiederherstellungsprobe. **60/60** gezielte Fälle bestehen. Der Projektdienst übernimmt inzwischen
gebundene Vorschläge als Entwurf und schützt dabei die zwischenzeitlich geänderte Artfassung und die
bestehende Leserfreigabe. Die isolierte HTTP-, Medien- und NAS-Sicherungsprobe besteht mit **27/27**
Fällen. Der Node-Client nutzt die vorhandene Warteschlange und liefert die geprüften Originaldateien
nach. Geprüft sind verlorene Antworten vor und nach der Dateibereitstellung, Neustart, konkurrierende
Bearbeitung sowie die Sicherung und Wiederherstellung des Auftrags. **Artvorschlag prüfen** ist im
gemeinsamen Artbestand angeschlossen. Der Explorer-HTTP-Test prüft Vorbereitung, gespeicherten
Vergleich, Kartenvorschau, getrenntes Vormerken und Abgleichen mit einem isolierten Projektdienst.
Die sichtbare Windows-Probe vom 3. November bestätigt denselben Ablauf im eigenen Electron-Profil.
Der Nachweis `data/audit-evidence/shared-enrichment-desktop-20261103.json` enthält die bestätigten
Anfragen, den ursprünglichen Leserstand und die auf dem Prüfdienst gespeicherten Kartenbytes.
Der Nachlauf behebt den dort festgestellten Anzeigefehler. Die normale Artansicht lädt geschützte
Projektdateien passend zu Person und Artfassung, bei vorhandenem Download auch ohne Verbindung.
Die sichtbare Karten-Gegenprobe ist unter `data/audit-evidence/shared-media-desktop-20261103.json`
belegt. Die Karte war in der normalen Ansicht und in der Vergrößerung sichtbar.
Das [NAS-Quellpaket 0.1.7](../nas/README.md#nas-quellpaket-017-und-rücknahme) bündelt den Dienst für
Artvorschläge mit der neuen Formatgrenze. Die gebundene Upgrade- und Rücknahmeprobe zwischen den
archivierten Quellpaketen ist lokal bestanden. Die installierte Windows-Fassung bleibt eine
offene Abnahme. Die Linux-Probe des neueren Pakets ist im
[NAS-Vertrag](../nas/README.md#nas-quellpaket-019-für-den-aktuellen-explorer) belegt.
Das [aktualisierte NAS-Archiv](../nas/README.md#aktualisierte-quelle-und-upgradeprobe-von-schema-4)
enthält die späteren Bildtext- und Artseitenmodule sowie den Schutz vor SQLite-Begleitdateien beim
Restore. Eine Probe mit den tatsächlich entpackten Quellarchiven belegt Schema 4 auf Schema 6,
erhaltene Anmeldungen und Seitenfassungen sowie den Rückweg zur früheren Laufzeit an einer zweiten Kopie.

Die neue reale Squarespace-Probe legt eine eigene klassische Prüfseite an und bestätigt vor
Inhaltseingabe ihren gespeicherten deaktivierten Zustand. Nach Felix' manueller Bedienrückmeldung
gelingen Textabschnitt, neutrale Inhaltseingabe und Speichern; nach Beenden ist der Text vollständig
in der Verwaltungsvorschau sichtbar. Der erneute Editorzugang und der Frame reagieren zunächst verzögert;
die spätere Beobachtung bestätigt den nach Neuladen erhaltenen Text und den wieder geöffneten Editor.
Auch die tatsächliche Überschriften-/Absatzgliederung wird eingefügt und gespeichert.
Der folgende Galerienachlauf bestätigt die beiden hochgeladenen neutralen Testbilder samt erhaltenen
Beschreibungen und geänderter Reihenfolge im Editor. Nach vollständigem Neuladen bleibt die Vorschau
erneut leer; die Seite ist in den neu geöffneten Einstellungen weiterhin deaktiviert. Dauerhafte
Bildfolge nach Neuladen und vollständiger Wiederlese-/Artseitenabschluss bleiben offen.
Die eigene Prüfseite, die mögliche Vorlagenkopie und die vorbereitete Bindung an den echten
Journalstart führt der [Artseitenmodulvertrag](../species-explorer/page-authoring/README.md).

Der anschließende lesende Editorbeobachter und die Bereitschaftsprüfung vor Journalstart bestehen
mit **171/171 gezielten Fällen**. Ein leerer oder nicht unterstützter Editor belässt den persönlichen
Auftrag vorbereitet. Die automatische Artseitenanlage bleibt bis zum vollständigen Driver ausgeblendet;
dieser Quellenfortschritt ersetzt die offene tatsächliche Wiederleseprobe nicht.

Am **3. November** bestätigt eine weitere Browserprobe die deaktivierte Prüfseite in den Einstellungen
und HTTP 404 für den öffentlichen Aufruf, bei widersprüchlicher Anzeige in der Vorschauleiste.
Der Inhaltsframe bleibt leer. Die lokale Rücklesung verwirft inzwischen Beobachtungen nach Navigation
oder Inhaltswechsel und meldet keine veraltete Galeriereihenfolge. **147/147** gezielte Browser- und
Galeriefälle bestehen. Die durchgehende Squarespace-Wiederleseprobe bleibt offen.
Ein lokaler Nachlauf ergänzt eine begrenzte Wartephase für einen verzögerten, genau gebundenen
Inhaltsframe und verhindert überlappende DOM-Lesevorgänge nach Abbruch oder Zeitüberschreitung.
Der [Artseitenmodulvertrag](../species-explorer/page-authoring/README.md) führt die Grenzen der Leseprobe.
Eine weitere abgestimmte Browserprobe belegt die Steuerelemente für den Slug und die Seiteneinstellung.
Der lokale Leser trennt jetzt die beobachtete Dialogeinstellung, offene Editoreingaben und angezeigte
Textblöcke. Die deaktivierte Prüfseite liefert weiterhin keinen lesbaren Inhalt über die Vorschau.
Der Browseranschluss baut aus der freigegebenen Fassung die geordnete Eingabefolge mit formatiertem
Text, FN-Funktionsblöcken und Galerie. Widersprüche stoppen vor dem Journalstart. Die automatische
Eingabe dieser Folge und der vollständige Speichern-/Wiederleseabschluss stehen weiter aus.
Der einzelne Textschritt ist inzwischen lokal angeschlossen. Er fügt freigegebene Gliederung in
einen eindeutig leeren Editorblock ein und vergleicht dessen Inhalt unmittelbar danach.
Die tatsächliche Squarespace-Probe und die übrigen Schritte der durchgehenden Seitenanlage stehen aus.
Eine weitere lesende Probe bestätigt die Deaktivierung im Dialog und den passenden eingestellten
Vorschaupfad, während das geladene Vorschaufenster leer bleibt. Der Textschritt verlangt jetzt
eine frische, auftragsgebundene Bestätigung aus den Einstellungen und danach separat die
eindeutige Seitenkennung im geladenen Editor. Die leere Vorschau stoppt die Eingabe.
Der Textabschluss speichert einmal, lädt die Verwaltung frisch und prüft die Texte und
Deaktivierung nach dem Wiederöffnen. Der Nachweis für Funktionsblöcke und Galerie bleibt Teil
der durchgehenden CMS-Anlage.
Die sichtbare Bilderfolge ist im lokalen Speicherabschluss jetzt ebenfalls an die
freigegebenen Uploadzuordnungen gebunden. Der Abschluss prüft auch, ob Text, Artinformationen,
Karte und Galerie nach dem Wiederöffnen dieselbe freigegebene Blockfolge zeigen. Die reale
Chrome-Probe zeigt, dass der Editor der deaktivierten Prüfseite nach verzögertem Laden erreicht
wird. Auf der bestehenden Eisvogel-Seite stimmt das gespeicherte Codefeld der Artinformationen
mit der FN-Vorlage überein. Der lokale Speicherabschluss steuert beide Codefelder vor und nach
dem Speichern an und liest die Quelltexte zurück. Offen sind der Nachweis der automatischen
Bedienung im echten Editor, die einzelnen Bildtextfelder und der durchgehende CMS-Lauf.
Die lesende Galerieprobe zeigt ein gemeinsames Squarespace-Beschreibungsfeld für Alternativtext
und sichtbare Bildunterschrift. Der lokale Abschluss prüft jetzt für diese Galerie, ob beide
Ausgaben wie freigegeben dargestellt werden. Freigaben mit getrennten Angaben oder Bildnachweisen
haben eine lokal geprüfte HTML-Darstellung mit getrennten Feldern. Die lokale Eingabe und
Rücklesung im gebundenen leeren HTML-Block ist geprüft. Der durchgehende Lauf in Squarespace
bleibt zu belegen.
Die beiden FN-Funktionsblöcke werden jetzt ebenfalls in die gebundenen leeren HTML-Felder
eingefügt und vor und nach einem gemeinsamen Speichern zurückgelesen. Der isolierte Chromium-Lauf
mit Text, Funktionsblöcken und Galerie ist bestätigt. Offen bleiben der automatische Aufbau
der Editorblöcke, der gebundene Medienupload und die Probe im echten Squarespace-Editor.
Für bereits vorbereitete leere Editorblöcke verbindet der Treiber nun die Eingaben mit einem
gemeinsamen Speichern und Wiederöffnen. Blockkennungen, Reihenfolge und Füllstand werden
zwischen den Schritten geprüft. Der Ablauf ist im isolierten Chromium bestätigt.
Für Galerien kann der vorbereitete Ablauf jetzt geprüfte Explorer-Dateien an einen gebundenen
Upload-Schritt übergeben und die Rückmeldung eindeutig der freigegebenen Bildverwendung zuordnen.
Die Übergabe ist lokal mit einem simulierten Upload geprüft. Das tatsächliche Upload-Feld und
die automatische Anlage leerer Editorblöcke sind noch anzuschließen.
Die Rücklesung verlangt jetzt genau einen neuen Eintrag in der beobachteten Galerieliste bei
unverändertem Bestand und unveränderter relativer Reihenfolge. Die erneut gewählte deaktivierte
Prüfseite zeigte in Chrome weiterhin einen leeren Inhaltsframe. Bei der nächsten lesenden Probe
lädt die Seite wieder und bestätigt alle acht gespeicherten Galeriebilder in ihrer Reihenfolge
sowie das eindeutige native Dateifeld. Die lokale Dateiübergabe ist an diesen Dialog gebunden.
Abweichende Bildkennungen oder eine abweichende Reihenfolge zwischen Dateifeld und separat
gelesener Galerieliste stoppen lokal vor der Dateiübergabe.
Die automatische Vorbereitung und der echte Upload durch den Explorer bleiben offen.
Der lokale Uploadtreiber prüft bei jeder erneuten Öffnung die zuletzt bestätigte Bilderliste.
Ein zwischen zwei Uploads verschwundener Eintrag stoppt die nächste Dateiübergabe. Der
[Artseitenmodulvertrag](../species-explorer/page-authoring/README.md) führt die Gegenprobe.

Der lokale Gesamtweg ab einer identifizierten neutralen Seite ist angeschlossen. Er deaktiviert
die Seite, weist die geprüfte Zieladresse zu, übernimmt den Entwurf und erstellt die Quittung aus
der wieder geöffneten, deaktivierten Fassung. Die manuelle Browserprobe vom **11. November**
bestätigt den Leerseiten-Klick, die Namensbestätigung und die neue Seitenkennung. Squarespace
schaltet die Seite bei der Anlage zunächst aktiv. Nach Deaktivierung und Wiederöffnen war sie
gespeichert deaktiviert und lieferte öffentlich HTTP 404. Der Explorer verbindet inzwischen
auch den Leerseiten-Klick und die eindeutig zugeordnete Namenszeile mit dem Speicherabschluss.
Der durchgehende lokale Test bestätigt den Ablauf ohne und mit Galerie. Beim nativen Versuch
speicherte Squarespace bereits eine leere Seite unter dem Standardtitel **Neue Seite**, bevor
der Explorer das Namensfeld eindeutig zuordnen konnte. Felix deaktivierte diese Prüfseite.
Der öffentliche Aufruf bestätigte anschließend HTTP 404. Die Desktopfunktion bleibt bis zur
durchgehenden Abnahme von Zuordnung, Deaktivierung und Inhaltsrücklesung ausgeblendet. Die
beobachteten Schritte führt der
[Artseitenmodulvertrag](../species-explorer/page-authoring/README.md).

Die anschließende lesende Explorer-Probe öffnet genau die bestehende deaktivierte **Neue Seite**,
bestätigt deren Einstellungen und öffentlichen HTTP 404 und erreicht den Inhaltseditor.
Der reguläre Chrome-Editor zeigt **Abschnitt hinzufügen** innerhalb des leeren Inhaltsartikels.
Die Einstellung und der leere Abschnittsplatzhalter sind damit beobachtet. **649 lokale Desktop- und
Artseitentests** und sechs zusätzliche isolierte Vorschau-Gegenproben bestehen. Der Test mit
gespeichertem Text, zwei Bildern und Rücklesung steht weiterhin aus.

Am **12. November** speichert der Explorer den neutralen Titel und die neutrale Adresse auf genau
dieser Seite. Nach dem Wiederöffnen sind Seitenkennung, Deaktivierung und öffentliches HTTP 404
bestätigt. Der Nachlauf öffnet die getrennten Adressfenster nach geladenem Verwaltungsbereich und
speichert die vorgesehene Zieladresse. Nach der Korrektur der Ladeprüfung bestätigt Squarespace
beide Prüfbilder in der Inhaltsbibliothek. Der Inhaltseditor zeigt **Abschnitt hinzufügen**.
Die ergänzte Erkennung bestätigt den leeren Editor. Die über die Inhaltsbibliothek zurückgelesenen
WebP-Bilder stimmen pixelgenau mit den zwei Prüforiginalen überein. Der Explorer löst die native
Abschnittsauswahl aus und Squarespace fügt einen leeren Fluid-Engine-Abschnitt im Editor ein.
Der korrigierte Treiber bestätigt ihn und öffnet die native Blockauswahl. Die Auswahl des Textblocks
gelingt in der Bedienprobe. Die automatische Auswahl über die beobachtete Kennung besteht die
lokale Prüfung. Nach der Korrektur für die stabile Abschnittswerkzeugleiste öffnet der Explorer
die native Blockauswahl erneut. Der Accessibility-Baum zeigt Text und Code. Die zu enge Erkennung
des Auswahlbereichs stoppte den Lauf vor der Textblockauswahl. Mit der korrigierten Erkennung
legt der Explorer im nächsten nativen Lauf den ersten Textblock an. Nach der Wartezeit für den
stabilen Layoutnachweis fügt er in der nächsten Bedienprobe auch den ersten Codeblock ein. Zwei
zusätzliche Squarespace-Stilelemente am Codecontainer stoppen dort die Layoutprüfung. Die Erkennung
dieser gebundenen Blockform ist lokal korrigiert. Der Nachlauf bestätigt die Seiteneinstellungen.
Felix sieht **Abschnitt hinzufügen** erst am Ende der Probe. Der Übergang zum leeren Editor hat
jetzt eine eigene Prüffrist von 40 Sekunden und bestätigt auch den tatsächlich erreichbaren
Abschnittsbutton. Verzögerte und ausbleibende Anzeige sind lokal im Chromium geprüft. Der native
Nachlauf erreicht den ersten Codeblock unterhalb des Textblocks. Der Codeeditor hat einen eigenen
Bearbeiten-Knopf außerhalb der Seitenwerkzeugleiste. Die lokale Codeprüfung erkennt diese Trennung.
Die beiden folgenden Läufe halten bereits beim Öffnen der Seiteneinstellungen oder Vorschau an.
Die lokale Browserprobe bestätigt die Eingabe und das Rücklesen des FN-Codes am ausgewählten Block.
Der Treibertest deckt auch die weiter sichtbare Blockauswahl beim Einfügen und Speichern ab.
Der folgende native Lauf öffnet das HTML-Feld automatisch. Die Diagnose bestätigt den exakten
Standardtext. Der Code-Dialog schirmt den weiter sichtbaren Seitenrahmen ab. Die Erkennung des
gebundenen Rahmens ist dafür lokal korrigiert. Im Nachlauf waren beide Prüfbilder pixelgenau
bestätigt. Die Vorschau zeigte nach dem Schließen des geleerten Codefelds noch den Standardtext.
Der Treiber ersetzt den eindeutig zugeordneten Standardtext im selben HTML-Dialog durch den
freigegebenen Art-, Karten- oder Galeriecode. Der lokale Test prüft die Eingabe ohne Zwischenspeichern.
Auch das Wiederöffnen bei vorübergehend leerer Vorschau und zusätzlichen Hilfsrahmen ist lokal
geprüft. Unklare Speicher- und Rückleseschritte werden im Prüfprotokoll genauer benannt.
Vor dem Speicherklick wird die Zuordnung von Seite, Blöcken und Bildern im persönlichen Auftrag
festgehalten und in der Sicherung geprüft. Der Bedienweg zur späteren lesenden Rückprüfung ist
lokal angeschlossen und nach einem Explorer-Neustart per HTTP mit simuliertem CMS geprüft.
Inhaltseingabe, Speichern und Rücklesen stehen im echten Editor aus.
Die öffentliche Adresse des deaktivierten Prüfentwurfs liefert weiterhin HTTP 404.

Der erste Anschluss der lokalen Texthilfe an persönliche Artseiten ist mit 76 Backend-/Quellenfällen,
77 Oberflächenfällen und anschließend 141 Reader-/HTTP-/Bildtextfällen geprüft. Diese Teilserien
ersetzen keine Qualifikation des danach erweiterten Gesamtstands. Der frühere Quellstand ergänzte
den inzwischen entfernten manuellen Start **Sprache prüfen** für Rechtschreibung, Groß-/Kleinschreibung,
Grammatik und Kommasetzung; die native Sprachprobe lieferte keine ausreichende Ergebnisqualität. Der Qualitätsversuch
ist abgeschlossen und als nicht abgenommen dokumentiert; Einzelbefunde und Prüfgrenzen stehen im
[KI-Modulvertrag](../species-explorer/local-ai/README.md).
Der normale Desktopimport verwendet vollständige lokale Arbeitsdatensätze. Alte öffentliche Pläne und Quittungen bleiben
erhalten; ihre Herkunft wird ausdrücklich angezeigt. Begonnene oder abgeschlossene öffentliche
Altimporte sind damit noch nicht zu vollständigen Arbeitsdaten erweitert.

Die feste Seitenauswahl mit getrennten Scrollbereichen ist im Quellstand und in einer isolierten
echten Browserdarstellung geprüft. Normale Bildblöcke/Kacheln erhalten im Quellstand einen gemeinsamen
Seitenabschluss statt eines vollständigen Öffnen-/Speichern-Zyklus je Bild. Felix bestätigt am 1. November
die funktionierende Übernahme auf normalen Reiseseiten und Reiseübersichten; die genaue Speicherfolge
ist dabei nicht gesondert beobachtet. Nach regulärem Explorerneustart sind die getrennten Scrollbereiche,
die erhaltene Listenposition und „Vorhandenen Text beibehalten“ nativ geprüft; keine CMS-Eingabe.
Die Warnung vor zu langen gekoppelten Galerietexten hat laut Felix auf den Reiseseiten funktioniert.
Die Sprachprüfung direkt im Textfeld ist für ihn grundsätzlich in Ordnung. Beim Seitenwechsel soll
rechts wieder oben begonnen werden, während links die Listenposition erhalten bleibt.

Felix hat den gemeinsam geklärten Gesamtumfang ausdrücklich bestätigt; erneute Grundsatzbestätigungen
sind dafür nicht nötig. Am 31. Oktober hat er nach der Einordnung von **Gemeinsames Projekt** unter **Datenbank-Aktionen → Weitere Aktionen →
Backup und Einstellungen** den Commit und Push des geprüften zusammenhängenden lokalen Standes beauftragt.
Diese Quellveröffentlichung ersetzt keine noch offene NAS-, Installer-, Lightroom- oder Zielgeräteabnahme.

| Bereich | Lokal erreicht | Noch zu vervollständigen |
| --- | --- | --- |
| Gemeinsames Projekt | Rollen-/Anmeldedienst, Versions-/Konfliktkern, Offlineclient und Erstimport; normale Artenansicht, Grunddatenbearbeitung und feldweiser Konfliktvergleich lokal angeschlossen und mit künstlichen Daten sichtbar geprüft; Bildtextvergleich und Sicherung integriert; NAS-Dienst und persönliche Verbindung einschließlich Neustart bestätigt | Anfangsübernahme bewusst bestätigen, übrige Fachwege anschließen und tatsächlichen Mehrgeräte-/NAS-Betrieb abnehmen |
| Android | [**0.1.13 (13)**](../mobile/README.md#bauen-und-prüfen) ist seit 13. November, 17:02 Uhr im privaten Play-Test verfügbar. Regionsauswahl, zentrierte deutsche Taxonomiepyramide, erneuter Abruf nach Netzfehlern und mit ihrer Überschrift scrollende Familienporträts sind enthalten. Analyse und 182 App-Tests bestanden. Felix bestätigte mit 0.1.12 den Wechsel von 63 auf 65 Arten ohne App-Update und den gespeicherten Bestand nach dem Neustart im Flugmodus. | Auf den Geräten insbesondere Regionsauswahl, Familienliste, Taxonomie, QR-Kopplung, Netzwechsel und Offline-Medienaktualisierung prüfen. Der [automatische Pages-Ablauf](../mobile/CATALOG.md#neue-arten-automatisch-übernehmen) ist lokal vorbereitet und benötigt Aktivierung und einen echten Lauf. |
| Installer | [Privates Prüfpaket vom 10. November](../installer/README.md#unterstützter-electron-folgestand) mit Electron 45.2.3, eigenem FFmpeg/FFprobe 8.1.1, Java-/LanguageTool-Sprachprüfung und Lightroom-Plug-in .43. 24 Paketproben einschließlich Update vom 9. November und frischer Testinstallation bestanden. Quellenbeilagen und Laufzeitnachweise sind separat an das jeweilige Setup gebunden. | Chromium-Drittanbieterquellen und LanguageTool-Ressourcen zuordnen, Windows-/Lightroom-Geräteabnahme und Projektanmeldung |
| Update-Abschluss | Alle vier Aktionen im getrennten Windows-Prüfstarter belegt, einschließlich Abbruch und vollständigem Countdown mit abgefangenem Systemaufruf | Sichtbare Gegenprobe des korrigierten Abbruchhinweises, normale Desktop-Integration und gezielte reale Abschlussaktion |
| Lokale Bild-/Texthilfe | Frühere native Bild-/Quellenprobe und persönlicher Bildvorschlag erfolgreich. Einzahl und Mehrzahl bei doppelt getippten Buchstaben mit den gebündelten Laufzeiten nachgeprüft. Relativsatz-Kommas für geprüfte kurze Einzahl- und Mehrzahlbeschriftungen lokal ergänzt und nativ geprüft. | Erweiterte Bedienabnahme, Paketnachlauf und Qualität weiterer Sprachfälle |
| Neue Artseiten | Vorlagen, Entwurfskern, Explorereditor, persönliche Fassungen, Projektabgleich, Bildablage und Texthilfe verbunden; Seitenübernahme mit versiegelter Queue und Versionsprüfung sowie strukturierter Reader-2-Dienst lokal ergänzt; ausdrückliche Windows-Dateibereitstellung und anschließende gebundene Leserfreigabe lokal angeschlossen und geprüft; Offlineauswahl samt Cache-/Sicherungsanschluss und vollständige Quellen im CMS-Plan lokal angeschlossen und automatisiert geprüft | Kontrollierte CMS-Einpflege vervollständigen; native Bedienung, Geräteanschluss und neues NAS-Paket abnehmen |

Für den Anschluss der normalen Artbearbeitung ist der vollständige gemeinsame Arbeitsdatensatz
quellseitig ergänzt: Originalfelder, erzeugte Fassung und geschützte Assetbindungen bleiben erhalten;
der mobile Katalog bleibt eine lesende Projektion. Der neue Backendweg für Grunddaten nutzt
personengebundene Vorschauen und dieselbe Offlinewarteschlange, einschließlich Konflikt-/Rollenprüfung.
Die normale Artenansicht und das Grunddatenformular sind im Quellstand über die bewusste Auswahl
**Artbestand → Auf diesem PC / Gemeinsames Projekt** angeschlossen; getrennte Ladewege und der
Schutz vor veralteten Antworten sind geprüft. Regulärer Windowsstart, lesender NAS-Abruf und
Rückkehr zum lokalen Bestand sind sichtbar bestätigt; eine künstliche Browserprobe bestätigt
Speichern und ausdrücklichen Abgleich über den echten Testdienst. Eine lesende vollständige
Quellenvorbereitung und kontrollierte Importkette samt Sicherungsprüfung sind ergänzt und mit eigenen
Quellen/HTTP-Diensten geprüft. Der feste Quellenleser ist zusätzlich am gesamten tatsächlichen
Artbestand lesend bestätigt. Die Konfliktbedienung vergleicht alle erhaltenen lokalen Fassungen und
den aktuellen Serverwert; jede abweichende Feldentscheidung benötigt Vorschau und Bestätigung.
Die sichtbare künstliche Probe bestätigt die kombinierte Übernahme ohne interne Freigabe oder
Websiteveröffentlichung. Der Kopfbutton führt im gemeinsamen Bestand trotz lokaler Änderungen
zu den Einstellungen; aktive Statusmeldungen bleiben erreichbar.
Zwei getrennte Profile am lokalen Testdienst konnten unterschiedliche Arten und Seiten abgleichen,
während eines zeitweise offline war. Zwei gleichzeitig ankommende Schreibaufträge für
unterschiedliche Artseiten wurden beide übernommen. Bei zwei Schreibaufträgen auf derselben
Seitenfassung übernahm der Testdienst genau einen. Der andere blieb auch nach Wiederöffnen
im persönlichen Entwurf und stand mit der Serverfassung im Konfliktvergleich bereit.
Bei Konflikten strukturierter Artseiten zeigt der gemeinsame
Vergleich die aktuelle Serverfassung und die erhaltenen lokalen Fassungen mit Abschnittstexten und
Bildreihenfolge. Die Auswahl ist an die verglichenen Fassungen gebunden. Eine gewählte lokale Fassung
wird als gemeinsamer Entwurf gespeichert. Die bisherigen Fassungen bleiben im Verlauf erhalten.
Nach der Entscheidung kann der Artseiteneditor die gemeinsame Fassung nach erneutem Vergleich als
neuen persönlichen Entwurf übernehmen. Am 10. November haben zwei getrennte Explorer-Profile in
Chromium am isolierten Testdienst die Bedienung bestätigt. Abbruch, Beibehalten der Serverfassung
und Auswahl der lokalen Fassung waren jeweils geprüft. Die Auswahlknöpfe sind nach dem Abgleich
wieder bedienbar. Die Abnahme mit zwei physischen PCs und dem gemeinsamen NAS bleibt offen.
Die interne Freigabe ist anschließend an die normale Artansicht angeschlossen: Eine gebundene
Vorschau zeigt die tatsächliche Katalogfassung, der ausdrückliche Freigabeklick bestätigt nur diese
Revision. Rollen-/Fassungswechsel und parallele lokale Entwürfe sind mit echten Testdiensten und
getrennten Cachebesitzern geprüft. Eine isolierte sichtbare Probe bestätigt zusätzlich Moduswechsel,
vollständige Lesetextvorschau, ausdrückliche Freigabe und korrekten Abschlussstatus am eigenen Testdienst.
Der reguläre Desktopimport nutzt die vollständige Quelle. Ein Wechsel des Projektkontos hält den
Import vor der nächsten Anlage oder Freigabe an. Das vorbereitende Konto kann mit den bereits
quittierten Schritten fortsetzen. Nach abgeschlossenem Import lassen sich die gebundenen Originale
der neu angelegten Arten separat bestätigen und bereitstellen. Lokaler Desktopserver, zweites
Testprofil und Wiederaufnahme nach unklarer Antwort sind geprüft. Der produktive NAS-Lauf und die
übrigen Fachwege bleiben offen. Deutsche und wissenschaftliche Umbenennungen benötigen weiter den
gekoppelten Pfadadapter.
Die Vorschau markiert abweichende vorhandene Artfassungen. Bei der separaten Dateibereitstellung
überspringt der Explorer nach einem durch einen zweiten Client ausgelösten Versionskonflikt nur die
Dateien der nachweislich geänderten Art. Die Gegenprobe nutzt zwei getrennte Anmeldungen am lokalen Dienst.
Das [NAS-Quellpaket 0.1.9](../nas/README.md#nas-quellpaket-019-für-den-aktuellen-explorer)
bündelt die aktuellen IUCN-Zuordnungen. Die entpackte Laufzeit übernimmt sie in der
isolierten HTTP-Gegenprobe und behält den führenden Artnamen. Die Handy-Kopplung bleibt im
Quellpaket geprüft. Die lokale Schema-4-Upgradeprobe mit der ursprünglichen Dienstquelle
erhält Sitzungen, Lesefreigaben und Offlinekonflikte und bestätigt den Rückweg über eine
zweite Sicherungskopie. Auf der DS923+ sind der isolierte Linux-Imagebau und die einmalige
QR-/Leserechteprobe mit künstlichen Daten bestanden. Der
[Vergleichsprüfer für Upgrade und Rückweg](../nas/README.md#upgrade-und-rückweg-an-einer-frischen-nas-sicherung-prüfen)
bindet beide Probecontainer an dieselbe Sicherung und vergleicht den Altbestand in zwölf Tabellen.
Am 9. November bestanden beide Läufe auf der DS923+ an einer frischen tatsächlichen Sicherung.
Die zwei vorhandenen Administrationskonten blieben erhalten. Gemeinsame Art-/Seitenobjekte und
Konflikte waren im tatsächlichen Ausgangsbestand noch leer. Der
[Dienstwechsel auf 0.1.9](../nas/README.md#dienstwechsel-auf-019) wurde am 9. November ausgeführt.
Der neue Dienst ist in DSM gesund, verwendet die geprüfte Startkopie und antwortet unter der
bisherigen HTTPS-Adresse mit der erwarteten Anmeldesperre. 0.1.2 ist gestoppt und bleibt mit seinem
bisherigen Datenordner verfügbar. Persönliche Anmeldung, QR-Kopplung und Anfangsübernahme stehen aus.
Die lesende Erstimportvorbereitung bindet die aktuelle öffentliche Katalogfassung an den lokalen
Bestand. Der Quelltest prüft alle 65 Arten mit ihren lokalen Medien und die Website-Texte von
Mittelspecht und Rappenantilope. Die Vorschau zeigt, welche Katalogfassung verwendet wurde.
Am 9. November liefen Vorschau und vollständige Probeübernahme mit dem tatsächlich eingesetzten
0.1.9-Quellarchiv auf einem getrennten lokalen Testdienst. Das zweite Konto las alle 64 Datensätze
zurück. Der Dienst bestätigte alle 250 vorgesehenen Originaldateien. Derselbe Umfang wurde aus einem
lokalen Online-Snapshot wiederhergestellt. In DSM zeigt Hyper Backup keine Aufgabe an. Der unabhängige
Sicherungsweg und der Vergleich der aktuellen Vorschau nach persönlicher Anmeldung bleiben vor dem
produktiven Start offen. Details führen der [NAS-Sicherungsvertrag](../nas/README.md#konsistente-sicherung-und-getrennte-restoreprobe)
und der [Vertrag für den gemeinsamen Bestand](../species-explorer/shared-project/README.md).

Die breite Integrationsprüfung hat einen zeitabhängigen PowerShell-7-Fehler beim vollständigen
Sicherungsmanifestvergleich aufgedeckt und gezielt reproduziert. Die Korrektur erhält ISO-Zeitangaben
unverändert; deterministische Gegenproben in PowerShell 5.1 und 7 einschließlich der Ablehnung
manipulierter Zeitangaben bestehen. Der tatsächliche Hauptskriptweg ist mit eigenen Testarchiven
geprüft; eine neue produktive NAS-Sicherung wurde dafür nicht gestartet. Nach zwei aktualisierten
statischen Oberflächentestannahmen sind sämtliche 58 lokalen Testgruppen geprüft: **3.525 bestanden,
kein Fehler, zwei unter Windows nicht erzeugbare Dateisymbolverknüpfungen ausgelassen**. Die zuvor
bestandenen 49 Gruppen bleiben bei unverändertem Programmcode gebunden; die letzten neun Gruppen
und alle Abschlussprüfungen sind anschließend erfolgreich durchgelaufen. Dokumentationsverweise,
Stil, Syntax, Schema, Medien, Größenbudget und Projektstatus sind geprüft. Commit/Push und der
anschließende GitHub-Pages-Lauf werden getrennt nachgewiesen.

Das [NAS-Paket](../nas/README.md) und konsistente DB-Sicherung/Restorekopie sind vorbereitet und lokal
geprüft. Die am 1. November reproduzierte unvollständige Container-Kopierliste ist korrigiert;
18 NAS-Fälle einschließlich isoliertem Quellpaketstart und echtem geschütztem Loopbackkatalog bestehen.
Das erste Übertragungspaket mit 19 Laufzeitmodulen bleibt gebunden erhalten; der persönliche
Einrichtungshelfer ergänzt das aktuelle Image auf 20 Module, mit **27/27** lokalen NAS-/Helferfällen.
Container Manager **24.0.2-1706** auf Volume 1 ist direkt in DSM bestätigt. Das tatsächliche Image
**0.1.2** mit Node **24.22.1** lief im NAS-Projekt **arten-explorer** als **In Ordnung**;
die Gesundheitsprüfung belegt die Datenbank unter der geprüften Dienstkennung **1032:100**,
401 ohne Anmeldung und 421 bei fremdem Hostnamen. CPU-/Prozesslimit- und Programmleserechtefehler
sind am NAS reproduziert und korrigiert. Port 4317 bleibt ausschließlich NAS-intern.
Die von Felix gewählte Freigabe **Projekte** wurde auf seinen Bedienauftrag am 1. November erstellt.
`/volume1/Projekte/Arten-Explorer` ist in DSM geprüft und enthält `app`, `config` und `data`;
Felix hat KI-Zugang selbst berechtigt, der Container bindet nur seine beiden eigenen Daten-/Konfigurationsordner.
Der persönliche Helfer ist im tatsächlichen Image enthalten; Felix hat beide Administrationskonten
persönlich eingerichtet. Reguläre Containerneustarts mit erneuter Gesundheitsbestätigung,
HTTPS über die genau bestätigte TCP-55431-Freigabe mit gültigem Zertifikat und Anmeldesperre
sowie konsistente Sicherung und getrennte Restorekopie des Anfangsbestands sind tatsächlich geprüft.
Felix' persönliche Exploreranmeldung bleibt nach regulärem Neustart erhalten und ein frischer
Serverabruf bestätigt Administration. Die Erstimportvorschau ist vorbereitet, noch nicht angewendet.
Zugriff aus fremdem Netz, NAS-Neustart, unabhängige Sicherung
und Mehrgeräteabgleich bleiben als Betriebsprüfungen offen; IPv6 ist noch nicht durchgehend belegt.
Felix' eigene Alttextbearbeitung hat während der
Hintergrundentwicklung Vorrang. Prüfstand, Betriebsgrenzen und tatsächliche Paketrevisionen stehen
in den jeweiligen Fach-/Modulverträgen, nicht in einer zweiten Auditdatei.

## Beauftragte Arbeiten am 28. Oktober 2026

Felix hat am 27. Oktober diese Reihenfolge für die gemeinsame Fortsetzung am Folgetag festgelegt:

1. **Lightroom-Nachprüfung bestanden:** .42 am regulären Produktpfad aktiviert, normale D:-Katalogadresse
   bestätigt, Datenstände übereinstimmend und Weissstorch-Suche einschließlich drei Detailseiten erfolgreich.
   Keine Zuweisung oder Metadatenaktion; Lightroom anschließend regulär geschlossen.
2. **NAS-Sicherung bestanden:** Vollständiger gebundener Bestand einschließlich `data`, Speicherkonfiguration
   und der lokal getesteten Sicherungskorrektur nach dem [Sicherungsvertrag](multi-device-backup-plan.md)
   gesichert. Vollständige ZIP-Rücklesung, unveränderter Quellstand und Aufbewahrungsprüfung erfolgreich;
   kein Altarchiv entfernt. Zwei Manifest-Kompatibilitätsfehler für die vorhandene PowerShell-7-Laufzeit
   zuvor reproduziert und korrigiert, **38/38** gezielte Prüfungen bestanden. Keine Ausführungsregel geändert.

Beide beauftragten Arbeiten sind abgeschlossen. Der Sicherungsstand enthält die damaligen lokalen
Änderungen; Abschlussquittung und abschließende Dokumentation wurden danach ergänzt. Ein neuer nativer
Restore wurde nicht durchgeführt. Tatsächliche Nachweise und Grenzen ausschließlich im
[Auditnachlauf](audit-auftrag-phase-10-5.md#1057-lightroom-nachprüfung-und-nas-sicherung--28-oktober).

Felix hat anschließend die Veröffentlichung der geprüften NAS-Korrektur samt Abschlussdokumentation
und die Kontrolle des vollständigen GitHub-Pages-Laufs beauftragt. Abgeschlossen mit Commit
[`97a1b68`](https://github.com/felixkfm90/iucn-species-data/commit/97a1b68a2663e62e87c4fa473a917fe83a3f7ec5):
Qualitätsprüfung, Paketbau und Deployment im [zugehörigen Lauf](https://github.com/felixkfm90/iucn-species-data/actions/runs/40720939725)
erfolgreich. Der genaue Veröffentlichungsnachweis liegt gemäß Auditnachlauf privat vor;
örtliche Daten und Einstellungen bleiben ausgeschlossen.

## Entscheidungsfreie Vorarbeiten für die weitere Entwicklung

Felix beauftragt am 28. Oktober zunächst alle Vorarbeiten, die keine neue Nutzerentscheidung benötigen.
Auf dem veröffentlichten Stand `97a1b68` sind die sechs Vorhaben lesend gegen Fachverträge, vorhandene
Module, Tests und tatsächliche Laufzeiten abgeglichen. Wiederverwendbare Bausteine, fehlende Funktionen,
fachliche Entscheidungen und vorbereitete Abnahmefälle stehen in den unten verlinkten Fachverträgen.
Historische Alttextannahmen und alte offene Auditformulierungen sind vom heutigen Stand getrennt.

Für die gemeinsame Abstimmung sind drei Zusammenhänge vorbereitet:

- Alttextredaktion und neue Artseiten teilen Bildauswahl, menschliche Freigabe und kontrollierte CMS-Übernahme.
- Mehrbenutzer-/Datenumfang beeinflusst Installerpfade und Rechte; mobile Schreib-/Synchronisationsfunktionen
  hängen ebenfalls davon ab. Diese Rahmenbedingungen vor der jeweiligen technischen Lösung klären.
- Die Update-Abschlussaktion hat eine vorhandene fachliche Erfolgsgrenze. Aktionsumfang, Abwahl und
  gegebenenfalls eine nachgelagerte Sicherung bleiben gesondert zu vereinbaren.

Felix wählt anschließend den Alternativtextworkflow als erstes Vorhaben. Die Antworten vom 28. Oktober
legen **die gesamte Website**, seitenweise Prüfung, sachliche deutsche Motivtexte ohne wissenschaftliche
Namen und den Erhalt vorhandener sichtbarer Texte fest. Sachliche Korrekturen erfolgen in Absprache;
neue Seiten und neue/geänderte Bilder müssen dauerhaft denselben Ablauf durchlaufen. Die erste Seite
darf ohne weitere Nutzerentscheidung gewählt werden. Der Ablauf gehört direkt in den Arten-Explorer;
vorhandene und fehlende Texte sowie Prüfung und Übernahme müssen sichtbar sein. Nach Freigabe dürfen
die konkreten Texte direkt übernommen werden. Neue Seiten dürfen schon vorher online stehen und
bleiben bei fehlenden Texten offen. Felix bestätigt die Eintragung durch Codex als initial ausreichend
und beauftragt die Umsetzung. Die erste lokale Fassung ergänzt seitenweise Remote-Bildvorschauen,
Entwürfe/Freigaben und öffentliche Nachprüfung; sie schreibt keine CMS-Inhalte. Bedienung, Prüfstand
und Erfassungsgrenzen führt ausschließlich der [Alttextvertrag](image-alt-audit.md).
Die selbstständige Textübernahme per Explorer-Button ist am 29. Oktober zusätzlich beauftragt;
Anmeldeweg und seitenweiser Ablauf sind im Alttextvertrag bestätigt. Die größere Erstellung
**Neuer Artseiten** folgt weiterhin auf die **Mehrbenutzerunterstützung**, damit Felix' Bruder Texte
eingeben und neue Artseiten anlegen kann.
Die übrigen Vorhaben bleiben zur späteren gemeinsamen Abstimmung vorgemerkt.
Am 30. Oktober beauftragt Felix während seiner eigenen Computernutzung die Clusterung vorhandener
Seiten als Hintergrundvorbereitung für Regeln je Seitengruppe und spätere vollständige Artseiten aus
bereitgestellten Bildern und Texten. Die lesende öffentliche Bestandsaufnahme, alle Einzelzuordnungen,
Bausteinunterschiede und offenen Muster-/Regelfragen stehen im
[Artseitenvertrag](add-species-workflow.md#seitengruppen-und-bausteine-vorbereitung-vom-30-oktober-2026).
Keine neue Vorlage oder Veröffentlichungsfunktion ist damit beschlossen; diese Vorbereitung erfolgte
während der Computer-Use-Pause.
Bereits bestätigte Anforderungen gelten weiter. Kein Framework, Benutzer-/Synchronisationsmodell
oder CMS-Schreibweg für die übrigen Vorhaben ist durch diese Vorarbeit beschlossen. Die ursprüngliche
Vorbereitung änderte nur Dokumente; die anschließend freigegebene Alttextumsetzung ergänzt Programmcode
und den privaten Website-Prüfbestand, ohne eine allgemeine Website-/Alttextabnahme vorwegzunehmen.
Felix gibt danach den Rechner für vollständige Vorbereitungen und Tests frei: Der gesamte öffentlich
erfasste Bildbestand ist visuell gesichtet und mit Entwürfen im Explorer vorbereitet, einschließlich
der automatisch geladenen Artgrafiken. Die menschliche Textabnahme ist für den Folgetag vorgesehen;
konkrete Beschriftungsfragen sind am Bild markiert. Öffentliche Texte bleiben bis zu dieser Freigabe erhalten.

Die vertieften Vorarbeiten vom 30. Oktober sind ebenfalls vorbereitet: konkrete Daten-/Schreibwege und
sieben Konfliktfälle für [Mehrbenutzerbetrieb](multi-device-backup-plan.md#vertiefte-vorbereitung-vom-30-oktober-2026),
fünf isolierte Installerproben samt Herkunfts-/Lizenzlücken, zwei vollständige
[Artseitenbeispiele](add-species-workflow.md#zwei-vollständig-aufgenommene-artseitenbeispiele),
native [Squarespace-Feldinventur und lokaler Pages-Bau](image-alt-audit.md#native-cms-feldinventur-und-veröffentlichungsvorbereitung-vom-30-oktober-2026)
sowie kleine [Bedientextkorrekturen](desktop-shell-plan.md#gezielte-bedientextprüfung-vom-30-oktober).
Keine neue Vorlage, Benutzerarchitektur oder Installertechnik festgelegt. Fachentscheidungen bleiben
zur gemeinsamen Abstimmung offen; Veröffentlichung und neue vollständige NAS-Sicherung stehen gesondert aus.

## Vereinbarte Aufgaben nach dem Audit

Die erneuten entscheidungsfreien Vorarbeiten vom 31. Oktober sind im jeweiligen Fachvertrag ergänzt:
Originalherkunft der vorhandenen Node-/FFmpeg-Programme bestätigt, lokale Parallelitäts-/Sperrproben
ausgeführt und der dabei reproduzierte Einstellungs-Schreibfehler korrigiert. Android-Bausteine und
Update-Abschlussgrenzen sind konkret quellengebunden vorbereitet; 28 zusätzliche isolierte Fälle bestehen.
Ein nachgewiesener Nachlauf der stillen Versionsprüfung ist ebenfalls korrigiert; der Dienst wartet
beim Beenden auf deren Schreibabschluss. Die alten eigenen Testreste sind beleggerecht überführt.
Der frische Sitemapabgleich findet keine neue Seite, kurze Entwürfe für alle 33 langen Beschriftungsfälle
liegen bereits vor. Die private Gesamtaufnahme `data/website/checks/followup-readiness-20261031.json`
verbindet Vorbereitung, noch nötige Fachentscheidungen und spätere praktische Prüfungen.
Die gebundene Abschlussquittung `data/website/checks/followup-completion-20261031.json` enthält
die 465 bestandenen Verhaltenstests, Zusatzproben, unveränderten Originaldaten und Belegüberführung.
Damit sind die Großvorhaben zur Abstimmung vorbereitet; Installer, Benutzerabgleich, Android und
automatische Systemaktion sind noch keine fertigen Funktionen, bei denen ausschließlich Tests fehlen.

Vor jedem der folgenden größeren Vorhaben klären Felix und Codex zunächst gemeinsam Zielverständnis,
Anwendungsfälle, Umfang und Rahmenbedingungen gemäß der [Arbeitsregel](../AGENTS.md#arbeitsweise-bei-späteren-einzelaufträgen).
Erst aus dieser bestätigten Grundlage werden Lösung und Umsetzung abgeleitet. Die weitere Reihenfolge
der Vorhaben wird ebenfalls gemeinsam festgelegt.

Die [Rahmenklärung vom 31. Oktober](multi-device-backup-plan.md#gemeinsame-rahmenklärung-vom-31-oktober-2026)
bestätigt zwei gleichberechtigte Personen mit Administrationsrechten auf eigenen PCs, spätere Handynutzung
zum Nachschlagen, parallele Arbeit an unterschiedlichen Arten/Seiten, verschiedene Arbeitsorte und eine
Offlineoption. Gemeinsame fachliche Daten, Lightroom-Katalog und Auswertungen gehören zu einem
FN-Wildlife-&-Travel-Projekt; der Katalog wird nacheinander auf verschiedenen Geräten verwendet.
Vier Benutzerstufen sind angenommen, weitere Benutzer sollen möglich bleiben. Der gemeinsame Dienst
muss auch bei ausgeschalteten PCs erreichbar sein. Offlineumfang und Kostenrahmen sind bestätigt,
Betriebsort und technische Ausgestaltung noch zu prüfen: Offline am PC vorhandene Arten/Seiten bearbeiten, am Handy auswählbare
Nachschlageinhalte, auch ohne Websitefotos. Zielgeräte sind Windows 11 mit Installationsrechten sowie
Android auf S24 Ultra und S25 Ultra. Zusätzliche kostenpflichtige Dienste sind ausgeschlossen; das
vorhandene NAS läuft laut Felix grundsätzlich 24/7 mit USV und ist als Betriebsort zu prüfen.
Felix hat den zusammenhängenden Gesamtumfang am 31. Oktober ausdrücklich bestätigt und die Umsetzung
beauftragt. Die Rahmenklärung ist abgeschlossen; technische Routineentscheidungen und Umsetzung folgen
selbstständig daraus. Weitere NAS-Informationen hat Felix angekündigt. Neue fachliche Änderungen und
Veröffentlichungen bleiben an den jeweiligen tatsächlichen Freigabeumfang gebunden.

- **[Alternativtextworkflow](image-alt-audit.md):** Gesamter öffentlich erfasster Bildbestand mit Entwürfen vorbereitet;
  kompakte Exploreransicht, seitenweise Freigabe und direkter Reisegalerie-Übernahmebutton umgesetzt.
  Athen **9/9**, Delphi **8/8** und Mykene **8/8** sind öffentlich bestätigt; die Texte werden weiterhin
  seitenweise mit Felix geprüft. Kurze Reise-Unterseiten-Beschriftungen ohne abschließenden Punkt,
  vorhandener Header-Linktext und bekannte dekorative Standards bleiben vereinbart.
  Gesamtprüfung mit 2.558 Fällen, isolierter Store-Restore und native Übernahmen sind im Fachvertrag
  belegt. Weitere CMS-Feldtypen und lange sichtbare Beschriftungen bleiben zur gezielten Abstimmung offen.
  Neue/geänderte Bilder und Seiten müssen dauerhaft denselben Prüfablauf durchlaufen.
- **[Neue Artseiten](add-species-workflow.md#vorbereitung-des-künftigen-website-artseitenworkflows):** Bestehende Strukturen, Texte, Bilder, Alternativtexte und Explorer-Verknüpfungen
  in einen gemeinsamen prüfbaren Erstellungs- und Einpflegeablauf integrieren. Folgt auf den benötigten
  Mehrbenutzerausbau; dabei die spätere automatische Textübernahme mitbetrachten. Die vorhandenen
  Seitenfamilien, Bausteine und Varianten sind im Artseitenvertrag als Abstimmungsgrundlage vorbereitet.
  Bestätigt sind bereitgestellte Bilder mit festlegbarer Reihenfolge, gegliederte Fachtexte, änderbare
  Alternativtextvorschläge und ausdrückliche Entscheidung über leere Abschnitte. Codex prüft vor;
  Felix beziehungsweise sein Bruder nehmen die zusammengesetzte Seite vor Veröffentlichung abschließend ab.
  Vorschläge und Vorprüfung sollen direkt im Explorer ohne diesen Chat und ohne kostenpflichtige Dienste
  erfolgen; eine geeignete lokale Lösung ist zunächst praktisch zu prüfen.
- **[Android-App](desktop-shell-plan.md#vorbereitung-der-android-abstimmung-vom-28-oktober):** Nachschlagewerk für angelegte Arten mit Bildern, Ton, Taxonomie, Verbreitung und Informationen auf S24 Ultra und S25 Ultra. Bearbeitung am PC; am Handy werden Lightroom und die gesamte Referenzdatenbank nicht benötigt. Inhaltsaktualisierung und wählbare Offlinepakete einschließlich einer Auswahl ohne Websitefotos vorsehen.
- **[Installer einschließlich aller benötigten Programme](multi-device-backup-plan.md#entscheidungsfreie-vorbereitung-vom-28-oktober-2026):** Einen vollständigen Windows-Installationsablauf
  mit benötigten Laufzeiten, Hilfsprogrammen, Abhängigkeiten und Plug-in-Einrichtung konzipieren und umsetzen.
  Ziel Windows 11 mit Administratorrechten bestätigt. Erstinstallation, Aktualisierung und Erhalt vorhandener Daten praktisch prüfen.
- **[Mehrbenutzerunterstützung](multi-device-backup-plan.md#mehrbenutzer-heutige-funktionen-und-fehlende-erweiterungen):** Nutzung durch mehrere Personen und auf mehreren Rechnern konzipieren und
  umsetzen; angenommene Benutzerstufen, gemeinsame fachliche Daten und Verfügbarkeit ohne laufende PCs
  zugrunde legen, Schutz vor Bearbeitungskonflikten konkretisieren. Den bestehenden Mehrgeräte-/Update-/Sicherungsplan dabei einbeziehen.
- **Abschlussaktion nach Datenbankaktualisierung:** Vor dem Start wählen können, was nach vollständig
  erfolgreichem Abschluss passiert: nichts tun, Explorer beenden, PC herunterfahren oder PC neu starten.
  Standard bleibt nichts tun; Fehler, Abbruch oder wartende Schritte dürfen keine Erfolgsaktion auslösen.
  Keine zusätzliche NAS-Sicherung davor; die Routine bleibt zeitgesteuert. Details im [Updatevertrag](taxonomy-update-automation.md#vorgemerkt-wählbare-abschlussaktion-nach-erfolgreichem-update).

Die verbindlichen Ziele der ersten drei Vorhaben stehen im Auditauftrag, Abschnitte 10.46 und 10.47.
Installer und Mehrbenutzerunterstützung hat Felix am 27. Oktober im Folgechat ergänzt; die fachliche
Einordnung steht im [Mehrgeräte-/Backupplan](multi-device-backup-plan.md). Die wählbare Update-Abschlussaktion
hat Felix anschließend ebenfalls vorgemerkt. Alle sechs Vorhaben sind aufgenommen; die konkrete Umsetzung
richtet sich nach dem jeweiligen Folgeauftrag. Frühere Ausbauideen
sind keine laufenden Umsetzungsaufträge.

Felix hat am 6. November als mögliche Ergänzung vorgemerkt, bei Vögeln neben der Körpergröße
auch die Flügelspannweite im Arten-Explorer zu erfassen. Umfang und Darstellung sind noch abzustimmen.

Für **Prüfung & Hinweise** ist am 6. November eine spätere Bedienverbesserung vorgemerkt.
Behebbare Meldungen sollen die betroffenen Arten nennen und passende Aktionen anbieten, etwa
**Art aktualisieren** bei fehlenden oder nicht zugeordneten Artdaten und **Sound suchen** bei
fehlender Tierstimme. Zusammengehörige Zuordnungsprobleme sollen verständlich zusammengefasst werden,
damit dieselbe Art nicht wie zwei unabhängige Fehler erscheint. Die Aktionen sollen die vorhandenen
Prüf- und Freigabeabläufe nutzen und bestehende manuelle Schutzregeln erhalten. Felix hat diese
Änderung vorerst zurückgestellt; die aktuelle Vormerkung beauftragt keine unmittelbare Oberflächenänderung.

## Fachstände

- [Taxonomie-Betriebsstand](taxonomy-current-status.md)
- [Lightroom-Vertrag](lightroom-search-package.md)
- [Aktuelle Arten-/Assetzähler und Pflegelisten](project-status.md)
- [Dokumentationsübersicht und historische Nachweise](README.md)

Weitere Arbeiten und Veröffentlichungen richten sich nach Felix’ jeweiligem Auftrag.
