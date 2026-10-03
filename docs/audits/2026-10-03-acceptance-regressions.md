# Bedienbefunde und Regressionskorrekturen – 3. Oktober 2026

Stand: 2026-10-03. Folgeauftrag zur [Vor-Audit-Umsetzung](2026-10-03-pre-audit-implementation.md),
kein Phase-10.5-Gesamtaudit. Aktueller Plug-in-Quellstand: **0.4.24.17**.

## Nutzerbefund und Umfang

Felix bestätigt 1 A als passend. In 1 B wurde der Statistikindex bewusst neu aufgebaut;
das Statistikfenster war seit dem Datenbankupdate noch nicht geöffnet worden. Kein neuer Taxonomieaufbau
daraus abgeleitet. Karten bis auf Blaukehlchen nach Nutzerangaben auf IUCN-Herkunft umgestellt; diese
gespeicherten Änderungen bleiben erhalten. Die automatische HTTP-403-Abrufgrenze ist dadurch nicht repariert.
Felix beauftragte alle folgenden Reparaturen und gab Commit/Push der gesamten erfolgreich geprüften Serie frei.

## Pages-Ursache und Veröffentlichungsschutz

Die Läufe [37144498278](https://github.com/felixkfm90/iucn-species-data/actions/runs/37144498278),
[37144779330](https://github.com/felixkfm90/iucn-species-data/actions/runs/37144779330) und
[37145003742](https://github.com/felixkfm90/iucn-species-data/actions/runs/37145003742) scheiterten identisch:
`docs/project-status.md ist nicht aktuell`. Vorherige Tests/Schema/Medienprüfung bestanden, Build/Deploy
übersprungen. Datencommits enthielten neue lokale Kartenstatus-Ausgabe, nicht deren unveröffentlichten Generator.
GitHub verwendete alten Code. Die gemeinsame Vorabprüfung vergleicht Status-/Schemaquellen samt rekursiven
lokalen Importabhängigkeiten gegen HEAD. Benötigter unveröffentlichter Code stoppt Daten-/Assetübertragung
vor Statusschreiben und Vormerken mit Dateiliste. Fachfremde Änderungen bleiben erlaubt. Pipeline, Karten-,
Sound- und Portraitwege teilen diese Grenze; bei Sperre bleiben Originaldaten und Git-Index erhalten.
19 gezielte Tests mit echten Git-Fixtures bestanden, einschließlich Wiederholung nach Codecommit.
Vertrag: [Qualitätsgrenzen](../repository-quality-gates.md). Neuer Pages-Erfolg separat nach Push nachweisen.

## Orts- und Zeitdaten entfernen

Die gemeldeten Zuordnungen `2026 (FN Zeit)`, `Juni (FN Zeit)`, `Namibia (FN Ort)` und `Sambesi (FN Ort)`
blieben trotz leerer FN-Metadaten am Foto. Normales Lua-pcall kann SDK-Yields blockieren und deren Lesefehler
verschlucken; diese passende Fehlerkette wurde in der Regression reproduziert, nicht produktiv instrumentiert.
Jetzt tatsächliche zugeordnete LrKeyword-Objekte mit LrTasks.pcall lesen und im Schreibzugriff entfernen.
Ungültige Objekt-/Leserückgaben stoppen. Keine formatierte Anzeige parsen, keine undokumentierte
ID-Nachschlagefunktion, keine neue Keyworderzeugung oder Orts-/Zeit-Quellwert-/Exportvorbereitung bei Entfernung.
Grundlagen: [LrPhoto](https://lrc.mcor.dev/modules/LrPhoto.html),
[LrKeyword](https://lrc.mcor.dev/modules/LrKeyword.html), [LrTasks](https://lrc.mcor.dev/modules/LrTasks.html).

Auch metadatenleere Altlasten, Sternchen und gleichnamige verschiedene Objekte werden getrennt.
Taxonomie, manuelle Keywords, GPS/IPTC und Katalog-Stichwortdefinitionen bleiben erhalten.
Unterer Button **Orts- und Zeitdaten entfernen ...** im Zuweisungsfenster nutzt dieselbe bestätigte Aktion.
Keine echte Auswahl bedeutet keinen Filmstreifenrückfall. Sechs echte Lua-Modultests mit ausdrücklich
simulierter Lua-5.1-Yield-Grenze bestanden: Reproduktion, vier Zuordnungen, Altlasten, Sterne/Doppelobjekte,
Multiauswahl, Wiederholung, Leser-/Objekt-/Schreibfehler, belegter Lock, Abbruch und frischer Wiederholungsweg.
Rollback ist SDK-Vertragssimulation, keine produktive Lightroom-Abnahme.

## Statistikexporte

Alle drei Exporte bieten **Gesamter Katalog** oder **Markierte Fotos**. Die gebundene Auswahl wird nur
beim ausdrücklich gewählten Export lokal ausgewertet, ohne persistenten Katalogindex zu verändern.
Fehlendes aktives Zielfoto ist keine Auswahl, nicht die Freigabe aller sichtbaren Fotos.
Katalogexporte bleiben indexbasiert; fehlender Index bietet bewussten Neuaufbau, keinen automatischen Start.
Defaultnamen: **Artenliste.txt**, **Lifelist.csv**, **Beobachtungsliste.csv**. Ein dokumentierter Plug-in-Dialog
mit Dateiname, Zielordnerwahl und Überschreibbestätigung ersetzt eine nicht belegte Savepanel-Option.
Dateiname/Endung/Pfad-/Sonderzeichen/Windows-Gerätenamen geprüft; Abbruch/Überschreibnein schreiben nichts.
Deutsche Formatierung und vorhandene Exportstruktur bleiben erhalten.

## Automatisierter Integrationsabschluss

- Vollständiges `npm.cmd run --silent quality:ci`: Exit 0, 50 Testgruppen, 1.120 gemeldete Tests,
  keine Fehler/Abbrüche/übersprungenen Tests. Darunter 420 Master-/Betriebs- und 231 Lightroom-/Pakettests.
- Plug-in-Vertrag separat: 15/15; funktionale Orts-/Zeit-/Statistikdatei: 22/22; zusätzliche
  Yield-/Entfernungsregressionen: 6/6; gezielte Pages-/Veröffentlichungsregressionen: 19/19.
  Diese Zahlen überschneiden sich mit dem Gesamtgate und werden nicht als zusätzliche Gesamtsumme addiert.
- Syntax: 374 JavaScript-/MJS-Dateien; Stil, sechs zentrale JSON-Schemata und 75 Markdown-Verweise bestanden.
- Medien-/Projekt-/Größenprüfungen und generierter Projektstatus bestanden; Websiteprüfweg lokal
  ohne Live-/Pages-Abfrage. Linux-Qualitätsgate und tatsächliches Deployment folgen dem freigegebenen Push.
- Abbruch, unvollständige SDK-Batches, leere echte Auswahl, Defaultnamen, alle drei Auswahlformate,
  Favoritenumfang, Dateinamensprüfung, Überschreibnein, Schreib-/Abschlussfehler, Rücknahme und Wiederholung geprüft.
  Export schreibt zunächst temporär und sichert eine bestätigte Altdatei; normale Fehler erhalten sie.
  Bei fehlgeschlagener Rücknahme bleibt sie am gemeldeten Sicherungspfad. Ein harter Rechner-/Lightroom-Abbruch
  kann Sicherungs-/Temporärdateien hinterlassen; das SDK bietet keine einzelne atomare Ersetzung.

## Abschlussgrenzen

Commit und Pages-Nachweis werden nach der freigegebenen Veröffentlichung ergänzt; kein vorweggenommener
Deployment-Erfolg. Keine neue Anbieterabfrage, produktive Aktivierung, Katalogaktion oder Bereinigung.
Das passende Taxonomie-/Lightroom-Paar vom 3. Oktober bleibt unverändert.
Praktisch danach: Plug-in 0.4.24.17 normal neu laden, bewusst gewählte Testfotos mit Orts-/Zeitkeywords
einschließlich metadatenleerer Altlasten entfernen, drei Auswahlexporte/Defaultnamen ansehen.
Diese SDK-/Sichtabnahme bleibt von automatisierten Tests getrennt.
