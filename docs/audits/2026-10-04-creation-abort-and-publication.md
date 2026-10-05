# Artabbruch, verspätete Medienentscheidung und Lightroom-Pfadwarnung

Befunde: 2026-10-04. Technischer Folgeabschluss: 2026-10-05. Kein Phase-10.5-Gesamtaudit.

## Nutzerbefund und belegte Ursachen

Felix bestätigt nach der Ordnerumbenennung Weissstorch und Rebhuhn in den Verbrauchern. Der geführte
Artassistent erreicht bei Schwarzstorch alle Schritte. Danach meldet er zwei getrennte Probleme: Schließen
und anschließendes Löschen der Testart lassen einen roten Übertragungshinweis zurück; Lightroom meldet
einen angeblich unvollständigen/veränderten Datenumzug.

Der nächste [Pages-Lauf 37221199394](https://github.com/felixkfm90/iucn-species-data/actions/runs/37221199394)
zu `c5d018426eac0f58077d5358bf1283c69b9deb4d` scheiterte in der Projektprüfung an
„Verwaister Override-Eintrag: Schwarzstorch“. Eine alte Soundentscheidung konnte nach dem Löschen der
Art noch einen manuellen Pflegeeintrag speichern. Die Art fehlte bereits in Eingabe, erzeugter Artenliste
und Assetordner. Die Qualitätsprüfung beanstandete diesen Rest zu Recht und wird nicht gelockert.

Die Lightroom-Warnung entstand durch unveränderte, aber unterschiedlich geschriebene Windows-Pfade:
`journal.plan.sourceRoot` enthält Rückwärtsschrägstriche, `legacyDataRoot` vorwärts gerichtete Schrägstriche.
Der Node-Resolver berücksichtigte dies bereits, der Lua-Resolver verglich zuvor Zeichenketten direkt.
Es fehlten keine migrierten Daten; keine neue Taxonomieaktivierung oder nochmaliger Umzug nötig.

## Eng begrenzte lokale Wiederherstellung

Vor Entfernung des einzelnen Schwarzstorch-Pflegeeintrags lesend bestätigt: keine Art in beiden Listen,
kein Assetordner, keine laufende Pipeline und kein offener Reviewauftrag. Originale der zwei betroffenen
Pflegeregister bytegenau unter `Daten/species-creation-repairs/2026-10-04-Schwarzstorch` gesichert.

Entfernt wurde ausschließlich `assets.Schwarzstorch.sound` aus `species-assets-overrides.json`.
Alle übrigen Felder und Einträge sind semantisch identisch. In der leeren Taxonomie-Override-Datei wurde
nur der fehlende abschließende Zeilenumbruch wiederhergestellt; Inhalt identisch zum versionierten Stand.
Keine Art, Karte, Tierstimme, eigene Namensentscheidung, Datenbank oder Umzugsdatei entfernt/geändert.
`audit:project` danach erfolgreich: 61 Eingabe-/erzeugte Arten, keine Fehler. Die Sicherung erlaubt eine
gezielte Wiederherstellung; nach neuen Änderungen keinesfalls das gesamte ältere Register zurückkopieren.

Die anschließende Explorer-Übertragung `53498934a945d63da39a776da511d6a20147964f` enthält genau die
Entfernung dieses einen Eintrags. [Pages 37225123679](https://github.com/felixkfm90/iucn-species-data/actions/runs/37225123679)
ist vollständig erfolgreich. Das bestätigt die enge Datenwiederherstellung, noch nicht die danach separat
zu veröffentlichenden Abbruch-/Schreibschutz-/Lightroom-Codekorrekturen.

## Lightroom 0.4.24.22

Windows-Pfade für Herkunftsvergleiche normalisiert: Trenner, abschließende Schrägstriche und Windows-
Groß-/Kleinschreibung. Fremde Pfade, andere Revision, unvollständiger Kopierbeleg und laufender Umzug
bleiben gesperrt. Historische Belege und ihre Hashwerte unverändert.

Neuer Regressionstest reproduzierte den Fehler vor der Korrektur und besteht danach einschließlich
negativer Gegenproben. `test:temp` 41/41 und Plug-in-Vertrag 21/21 erfolgreich. Zusätzlich tatsächlichen
Lua-Resolver mit den echten kleinen Konfigurations-, Umzugs-, Veröffentlichungs- und Paketbelegen gelesen:
vorhandenes Paket am endgültigen Datenpfad, Master `master-20261003055911210`, Paket
`lightroom-fa739bd28ec1e82a0283`, 273.476 Taxa. Keine SQLite-Inhaltsabfrage oder Katalogaktion durchgeführt.

Native Prüfung des Hintergrundhinweises nach Plug-in-Neuladen bleibt offen; technische Gegenproben sind
keine behauptete Bedienabnahme. [Speichervertrag](../storage-migration.md).

## Abbruch- und Veröffentlichungsprüfung

Die neue persistierte Artanlage bindet vor dem ersten Schreiben die eigene Art, Ausgangsbytes, Assets,
eigene Sicherungen und Git-Stand. „Fenster schließen“ erhält den Auftrag zum Fortsetzen. Der getrennte
bestätigte Button „Artanlage abbrechen“ entfernt dagegen nur die eigenen noch unveröffentlichten Änderungen,
ohne Pipeline-Neulauf, Commit oder Push. Einmal angeforderter Abbruch wartet automatisch den angenommenen
Schreibvorgang ab, verhindert weitere Worker/Veröffentlichung und bleibt nach Wiederöffnung gespeichert.

Unveränderte Ausgangsdateien bytegetreu wiederhergestellt; später hinzugekommene fremde Daten bleiben
erhalten. Bei fremden Änderungen an eigenen Artdateien, geändertem Git-Stand oder bereits begonnener
Veröffentlichung hält die Rücknahme geschützt an. Die Veröffentlichung darf einen vorher angenommenen
Abbruch nicht überholen. Veraltete Medienentscheidungen und Tokens nach Löschen/Abbruch werden vor dem
Schreiben zurückgewiesen. Auch Artlöschen/-bearbeiten und Medienentscheidungen sind gegenseitig gesperrt.

Der Abbruch löscht keine Artordner rekursiv. Zielpfade und Pfadvorfahren werden geprüft; bekannte eigene
Dateien unmittelbar vor Entfernen erneut anhand ihres Hashwerts kontrolliert. Nur leere Ordner entfernt.
Während der Rücknahme neu hinzugekommene Dateien bleiben erhalten und führen zu einem sichtbaren
Schutzfehler statt stiller Mitlöschung. Unterbrochene eigene Rücknahmen sind wiederholbar.

Zusätzlich normale Bereinigung abgesichert: keine unnötigen JSON-Neuschreibungen bei unverändertem Inhalt,
abschließender Zeilenumbruch bei tatsächlicher Änderung und rücknehmbare eigene JSON-Schreibschritte nach
späterem Fehler. Fremde Änderungen werden bei der Rücknahme nicht überschrieben. Isolierte Tests lassen
die Report-Schreibung nach vier erfolgreichen JSON-Schritten scheitern und prüfen erneuten Versuch.

Die unabhängige Prüfung reproduzierte und prüfte die drei Nebenfehler: Abbruchwunsch versus Publikationsmarker,
unerwünschte Datumsänderungen an fremden Kartenzeilen sowie erst während der Rücknahme hinzugekommene
Fremddatei. Nach Korrektur 35/35 gezielte Session-/Pipeline-/Medien-/UI-Tests erfolgreich; zusätzliche
unabhängige Rennen, Wiederöffnung, stale Soundentscheidung ohne Writes/Childprozesse und Fremdschutz
erfolgreich. Alle Gegenproben ausschließlich mit isolierten Testbeständen.

Die abschließende Herkunftsergänzung wird zusätzlich gegen die gleichnamige Wiederanlage geprüft:
Eine separate Artlöschung entwertet den alten Auftrag. Dessen offene Medienprüfung darf nicht erst nach
dem Schreiben an der Auftragsprüfung scheitern, sondern muss vor jeder Mutation zurückgewiesen werden.
Soundrücksetzung und neuer geführter Soundlauf müssen dieselbe noch unveröffentlichte Auftrags-ID
behalten, damit Wiederanlauf und späterer Abbruch weiterhin exakt ihre eigenen Änderungen erkennen.

Der Wiederanlauf entwertet auch eine alte Medienprüfung, wenn der Prozess zwischen separater Artlöschung
und Entfernen ihrer Prüfdatei beendet wurde. Ein beendeter alter Auftrag darf weder die gleichnamige
Neuanlage ändern noch weitere Artanlagen blockieren. Nach erfolgreichem Abbruch wird der frische
Pipeline-Abschlussstatus vor dem erneuten Laden der Projektanzeige gesetzt; kein alter roter
Übertragungshinweis aus dem vorherigen Fehl-/Prüfstatus bleibt dadurch bestehen.

Automatisch beim eigenen Soundspeichern oder Spektrogrammlauf gesetzte Generator-Metadaten gehören
ebenfalls zum belegten Auftrag. Ihre unveränderte eigene Änderung wird bei Rücknahme auf den Ausgangswert
zurückgesetzt; bestehende oder später fremd geänderte Werte bleiben geschützt. Das verhindert einen
versionierbaren leeren Pflegeeintrag nach ansonsten vollständiger Rücknahme.

Finaler gezielter Folgeprüflauf: 55/55 Tests erfolgreich, einschließlich echter isolierter Serveraufträge,
Soundsave/Reject/Reset/Wiedersuche/Abbruch, Wiederöffnung, Unterbrechung während eines simulierten Workers,
Generatorwerten ohne/mit Ausgangsdatei und späterer Fremdänderung. Der unabhängige Endreview findet
keinen weiteren konkreten Änderungsbedarf in diesem Scope; eigene 17 UI- und sechs Controller-Gegenproben
ebenfalls erfolgreich. Eine anfängliche Sandbox-Pfadsperre des Reviewers wurde nur für dessen isolierte
Testausführung korrigiert; kein fachlicher Testfehler. Die bestehenden Windows-Fixture-Aufräumregeln
erhalten dieselbe kurze Wiederholungsregel wie die übrigen Tests, ohne Produktassertionen zu ändern.

Eigene dauerhafte Auftragsbelege in `species-explorer/creation-sessions` sind Git-ignoriert, nicht Teil von
Quellscans/Größenbudget oder Pages. Sie bleiben von Temp-Schließbereinigung ausgenommen. NAS-Backup
behält sie. Ein abgeschlossener Abbruch hinterlässt nur einen lokalen minimalen Abschlussbeleg ohne
Art-/Projekt-/Assetdaten. Das ist kein versionierbarer Rest und verlangt keine Git-Übertragung.

Das erste vollständige Folgegate erreichte alle 50 Testgruppen, hielt aber bei einem alten UI-Vertrag an:
Dieser verlangte die exakte bisherige Schließsperre ohne den neuen Zustand `abortPending` (1.217/1.218 Tests
bestanden). Der Vertrag verlangt jetzt ausdrücklich die zusätzliche Abbruch-Schließsperre; keine bestehende
Sperre oder Verhaltenstest gelockert. Der erneute gezielte Explorer-Lauf ist mit 26/26 erfolgreich.
Ein frisches vollständiges Gate ersetzt diesen fehlgeschlagenen Versuch als Abschlussnachweis.

## Vollständiger technischer Abschluss – 5. Oktober

Das erneute vollständige `npm.cmd run --silent quality:ci` ist mit Exit 0 bestanden: 50 Gruppen,
1.218 gemeldete Tests, alle bestanden, keine Fehler/Abbrüche/Skips. Darunter unverändert 423 Master-/
Betriebs- und 239 Lightroom-/Pakettests. Syntax: 392 JavaScript-/MJS-Dateien; Dokumentation: 79 Markdown-
Dateien ohne fehlende lokale Verweise. Datenstruktur, Audio-/Medienprüfung, Größenbudget, Projektprüfung,
generierter Status und der offline ausgeführte Website-Vertrag ebenfalls erfolgreich. Der tatsächliche
Projektbestand bleibt bei 61 Arten ohne Validierungsfehler; bekannte fehlende Sounds sind keine neuen Fehler.
Das vollständige Ausführungsprotokoll ist entbehrliche Prüfausgabe im eigenen `temp`-Ordner.

Die begrenzte unabhängige Restprüfung findet keinen zusätzlichen konkreten technischen Vor-Audit-Pflichtpunkt.
Die geprüfte Serie ist als `550829f006078629b620d40525eca0643c030e74` nach main veröffentlicht.
[Pages 37319639341](https://github.com/felixkfm90/iucn-species-data/actions/runs/37319639341)
ist vollständig erfolgreich: Linux-Gate, Seitenartefakt und tatsächliches Deployment. Unter Linux 1.216 Tests
bestanden, keine Fehler/Abbrüche; zwei ausschließlich Windows-spezifische NAS-Vertragstests erwartungsgemäß
übersprungen und im vollständigen lokalen Windows-Gate bestanden. Allgemeine GitHub-Hinweise zur kommenden
Ubuntu-/Actions-Node-Laufzeitumstellung sind keine Lauf- oder Produktfehler. Keine neue produktive Artanlage,
Anbieteraktualisierung, Master-/Paketaktivierung oder Lightroom-Katalogänderung durch diesen Abschluss.

Neue native Bedienprüfung des echten Abbruchs nach Laden des neuen Explorerstands und der Pfadwarnung
nach Neuladen des Plug-ins 0.4.24.22 bleiben eigene kurze Abnahmegrenzen. Bereits bestätigte Suche/Namen,
Assistentenschritte, Soundreset, Orts-/Zeitentfernung und Auswahlexporte werden nicht erneut geöffnet.
Der Gesamtaudit ist noch nicht durchgeführt. IUCN-HTTP-403 bleibt eine bekannte Anbietergrenze mit
funktionierendem Browser-/Dateiimport; die Datenpfad-Einstellungsoberfläche bleibt ausdrücklich späterer Ausbau.

Verträge: [Artanlage](../add-species-workflow.md), [Restreihenfolge](../roadmap.md),
[vorausgehender Speicher-/Assistentennachweis](2026-10-04-storage-and-species-wizard.md).
