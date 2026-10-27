# Roadmap

Stand: 2026-10-27

## Aktueller Auftrag

Das Gesamtaudit Phase 10.5 für Arten-Explorer, Lightroom und Wildlife-Website wird fortgesetzt.
Felix hat die Restreihenfolge am 26. Oktober auf **Explorer → Website → Lightroom** festgelegt;
die Arbeiten werden in kleinen, getrennt abschließbaren Schritten ausgeführt. Die lokale
Explorer-Abschlussprüfung ist angenommen. Das vereinbarte Websitepaket ist einschließlich aller neun
Tablet-Bildpositionen, Typografie, Home/Kontakt/Über uns/Spenden, kompakter Karte und Bedienkorrekturen
veröffentlicht und öffentlich nachgeprüft. Die zugehörigen CMS-Inhalte sind gespeichert; individuelle
Texte bleiben außerhalb der freigegebenen Einzelkorrekturen erhalten. Das letzte Pages-Deployment
`bc0d96c5…` besteht Qualitätsgate, Bau und Auslieferung. CMS und Footer verwenden gemeinsam
CSS-/Taxonomiecache 1.0.19; der Bindestrich im Spendentitel ist auf Felix' Wunsch nur mobil ausgeblendet.
Die repräsentative Lightroom-Großprobe ist am 27. Oktober einschließlich Rücknahme und unabhängiger
Originalschutzprüfung bestanden. Produktversion 0.4.24.40 verwendet geprüfte SDK-Sammelabrufe.
Nächster Block ist die Abschlussbereinigung mit gemeinsamem Quellenendgate. Der vorherige Quellstand ist auf Felix'
ausdrücklichen Auftrag als gemeinsamer Zwischenstand versioniert; Git-/Veröffentlichungsnachweis im
Auditauftrag. Das ist kein Gesamt-Go.
Auftrag, Freigaben, Befunde, Belege und Abschluss stehen ausschließlich im
[Auditauftrag Phase 10.5](audit-auftrag-phase-10-5.md). Diese Roadmap beschreibt Gegenwart und Prioritäten.

Der geschützte Taxonomieupdate ist am **24. Oktober um 03:18 UTC abgeschlossen**. Master und
Lightroom-Suchpaket sind gemeinsam aktiviert und enthalten die CoL-Referenz vom 16. Oktober.
Aktuelle Kennungen stehen im [Taxonomie-Betriebsstand](taxonomy-current-status.md).
Der neue Auftrag besteht eigene FN-Erfassung, normales Lightroomende und produktiven Paarabschluss.
Der Explorer zeigt den Abschluss in Hauptansicht und Dialogübersicht; auch der frühere Konfliktdetailtext
ist korrigiert und nativ nachgeprüft. Der vollständige lokale Quellenlauf vom 26. Oktober besteht mit
50 Gruppen/2.265 Tests einschließlich der integrierten Layout- und Desktopkorrekturen. Die zuvor gefundenen beiden hohen Abhängigkeitsbefunde sind am 25. Oktober durch die
tatsächliche Installation von Electron 42.11.18 und Undici 7.30.1 behoben; die frische Paketprüfung
meldet null Befunde. Die separat freigegebene Systemlaufzeit ist auf Node 24.22.1 einschließlich
npm 11.19.1 aktualisiert. Regulärer Desktopstart, lesender Artwechsel, Neuladen und normales Ende
des Explorers sind unter dem neuen Stand belegt. Auch der erneute funktionale Quellenlauf ist bestanden;
Paketprüfung, native Betriebsprobe und Quellenlauf bleiben getrennte Nachweise.
Historische Quellenhinweise sind ausdrücklich keine offenen Entscheidungen.
Die native Mehrblockprüfung mit 253 eigenen Testfotos ist einschließlich vier geschlossenen
Zwischen-/Abschlussprüfungen für Übernahme und Rücknahme bestanden. Auch die ergänzende
Detailfenster-/Suchprüfung ist mit unveränderten sechs Testeinträgen abgeschlossen; Original-Plug-in
und Hauptkatalog auf D: sind zurückgestellt. Auch der Commit-/Journal-Wiederanlauf und die gezielte
Teilrücknahme mit manuellem Konflikt sind einschließlich vollständigem Endvergleich unabhängig bestanden.

## Bestätigte Teilergebnisse

- Produktiver FN-Abgleich sowie die belegten Statistik-, Export-, Stapel- und Artänderungsfälle
  einschließlich genauer Rücknahme sind geprüft. Auch die vereinbarte Lightroom-Großprobe ist bestanden.
- Der isolierte Großrestore einschließlich getrenntem Programmtest ist belegt.
- Squarespace-CSS-Compilerfehler und Wendehals-Kartenüberschrift sind öffentlich korrigiert.
- Binomenanzeige, Suchfeld, Sortierung und Zoom sind veröffentlicht; Zoom 1.0.9 besteht die tatsächliche
  Escape-, Tab- und Fokusprobe. Die unabhängige visuelle Einordnung steht im Auditauftrag.
- Alle 137 Sitemapseiten und vier zusätzliche Einstiegspfade sind in drei Ansichten visuell geprüft.
  Die vereinbarten Korrekturen sind veröffentlicht; öffentliche Nachprüfungen beziehen sich auf die
  betroffenen Seiten und Bedienwege. Die Basissichtung wird nicht als neuer vollständiger Crawl ausgegeben.
- Artseitenlayout am 25. Oktober nach Erdbeerfröschchen präzisiert: volle Bildbreite im bisherigen Ausschnitt,
  ursprüngliche Überlagerung, Titel auf Desktop/Tablet darüber und nur mobil schwarz darunter. Die private
  Ansichtsmatrix und die gemeinsame CMS-/Pages-Übernahme sind bestanden, öffentlich nachgeprüft.
- Karten- und Textkorrekturen sind zusätzlich an allen 28 Grenzzellen bei 767/768 mit 101 Originalbildern
  unabhängig geprüft und veröffentlicht. Die breite Darstellung bleibt erhalten. Der kanonische
  Standard-CSS-Import erhält die Mediengrenzen und vermeidet den alten CMS-LESS-Compiler.
- Ergänzende integrierte Galerie-, Karten-, Sortier- und Navigationsbedienung ist an den festgelegten
  Referenzseiten nativ und öffentlich geprüft. Kartenfokus und Desktopmenü sind eng korrigiert,
  gemeinsam mit den übrigen freigegebenen Quellen übernommen und öffentlich bestätigt.
- Kompakte Verbreitungskarten mit vollständiger Vorschau und zugänglicher Vergrößerung sind veröffentlicht.
  Reisegalerien bleiben quadratisch mit großem Bild nach Klick; Logo-Platzhalter erhalten „In Arbeit“.
- Die mobile Eichelhäher-Fokusanpassung, sieben angenommenen Titelvarianten und neun Tablet-
  Tierpositionen sind integriert und öffentlich nachgeprüft. Die gewählte Kopfzeilenüberlagerung bleibt erhalten.
- Die Artenliste zeigt **W** bei bestätigter fehlender FN-Artseite; eine erfolgreiche spätere Prüfung entfernt
  es automatisch. Prüfungsfehler entfernen bereits bestätigte Links nicht. Gezielte Tests und eine getrennte
  Browserprobe mit echten Modulen und künstlichen Antworten sind bestanden; keine Produktivdatenänderung.
- Das angenommene App-Symbol ist mit transparentem Außenbereich und weißer Turbine eingebaut und
  nativ geprüft. Die korrigierte isolierte Start-/Speicherprobe besteht drei tatsächliche Electronstarts
  mit künstlichem 64er-Bestand. Messwerte und Grenzen stehen ausschließlich im Auditauftrag;
  produktiver Datenbankstart und Speicherleckprüfung sind daraus nicht abgenommen.
- Die lokale Explorer-Abschlussprüfung ist abgeschlossen. Der vorhandene Gesamtprüfstand wurde anhand
  seiner Quellen weiterverwendet; spätere Änderungen sind durch passende eigene Nachweise gedeckt.
  Desktopgruppe und lesender Projektstatusvergleich bestehen. Websiteabschluss ist ebenfalls belegt;
  Die ergänzende Lightroom-Großprobe ist inzwischen bestanden; gemeinsame Quellenveröffentlichung,
  letzte Bereinigung und Gesamt-Go bleiben getrennt.

Einzelnachweise und Grenzen stehen im Auditauftrag, aktuell Abschnitt 10.55. Diese Teilergebnisse
schließen das Gesamtaudit nicht ab; der Taxonomieupdate selbst ist abgeschlossen.

## Aktuelle Restreihenfolge

1. **Lightroom-Prüfstand erhalten.** Mehrblock-, Detailfenster-, SDK-Stör-/Konflikt- und Großkatalogprobe
   sind bestanden. Alle 116 Original-Katalogdateien stimmen abschließend mit dem Ausgang überein.
   Reguläre .40 ist aktiviert; Standardstart zeigt auf den normalen D:-Katalog, der nicht erneut geöffnet wurde.
   Bestandene Prüfungen nur bei einem Regressionsgrund wiederholen.
2. **Gesamtabschluss herstellen.** Übrige Befunde schließen oder mit Grund, Ziel und Abnahmekriterium
   zuordnen. Tatsächlichen Quellenstand, Dokumentation, Qualitätsgate und unabhängigen Abschlussreview
   abgleichen; nur freigegebene Änderungen veröffentlichen und öffentlich nachprüfen.
3. **Unmittelbar vor dem Abschluss bereinigen.** Nicht mehr benötigte Test- und Arbeitsdateien anhand
   tatsächlichen Eigentums und Bedarfs entfernen. Belege, Rückwege und benötigte Daten erhalten; unklare
   Fälle mit Felix klären. Fehlender Zugriff oder Alter allein begründet keine Löschung.
   Die Dokumentation bleibt knapp, eindeutig und pro Thema an einer führenden Stelle.

## Vereinbarte Aufgaben nach dem Audit

- **Alternativtextworkflow:** Konzept und Umsetzung für Bild-/Textprüfung, menschliche Korrektur und
  Freigabe; Bestandsüberarbeitung und anschließende laufende Pflege. Vorhandene Entwürfe sind Vorarbeit.
- **Neue Artseiten:** Bestehende Strukturen, Texte, Bilder, Alternativtexte und Explorer-Verknüpfungen
  in einen gemeinsamen prüfbaren Erstellungs- und Einpflegeablauf integrieren.
- **Android-App:** Nutzung, Umfang und technische Lösung festlegen, danach Konzept und Umsetzung.

Die verbindlichen Ziele stehen im Auditauftrag, Abschnitte 10.46 und 10.47. Frühere Ausbauideen sind
keine laufenden Umsetzungsaufträge. Mehrgerätebetrieb, Updates und NAS-Planung stehen im bestehenden
[Mehrgeräte-/Backupplan](multi-device-backup-plan.md).

## Fachstände

- [Taxonomie-Betriebsstand](taxonomy-current-status.md)
- [Lightroom-Vertrag](lightroom-search-package.md)
- [Aktuelle Arten-/Assetzähler und Pflegelisten](project-status.md)
- [Dokumentationsübersicht und historische Nachweise](README.md)

Weitere Arbeiten und Veröffentlichungen richten sich nach Felix’ jeweiligem Auftrag.
