# Gespeicherter Gesamtweg für Taxonomie-Updates

Stand: 2026-10-03 · Umsetzung lokal, praktische Gesamtabnahme offen

Dieser Vertrag ergänzt den [Quellenupdatevertrag](taxonomy-reference-update.md) und
[FN-Nutzungsnachweis](lightroom-catalog-usage.md). Der abgeschlossene produktive Wechsel vom 3. Oktober
bleibt unverändert. Diese Umsetzung startet keinen neuen Anbieterdownload, Aufbau oder Paketwechsel.

## Bedienung

- Eine verfügbare Aktualisierung bietet `Jetzt aktualisieren` oder `Später`. Später startet nichts und
  verschiebt das Angebot bis zur nächsten Explorer-Öffnung. Die manuelle Datenbankaktion nutzt denselben Weg.
- Die einmalige Startbestätigung gilt für die technische Quellen-/Master-/Paketkette. Sie nennt den bereits
  bestätigten vollständigen FN-Katalogsatz und die Vereinbarung, bis zum normalen Schließen keine weiteren
  FN-Zuweisungen, Importe oder Katalogwechsel vorzunehmen. Unbekannte Kataloge benötigen zuerst die einmalige
  vollständige Registrierung; sie werden nicht als leer angenommen.
- Bei offenem Lightroom wird eine neue SDK-Erfassung angefordert. `Lightroom jetzt schließen` merkt ausschließlich
  das normale Schließen vor, das erst nach erfolgreicher Erfassung angefordert wird. Adobe-Rückfragen bleiben
  sichtbar; weder Prozessbeendigung erzwingen noch Sperrdateien löschen. Alternativ Lightroom selbst schließen:
  der gespeicherte Startauftrag wartet im Hintergrund, danach kein zweiter Startklick.
- Erst neue requestgebundene Quittungen aller bestätigten Kataloge, geschlossenes Lightroom, fehlende
  Arbeitsdateien sowie stabile Dateistände/Prüfsummen erlauben die Registrierung und den Start.
- Quellenabschluss ist kein Gesamtabschluss. Master, Suchpaket und gemeinsame Veröffentlichung müssen
  sämtliche bisherigen Schutzprüfungen bestehen und anschließend zusammenpassen.

## Gespeicherte Steuerung und Wiederanlauf

`taxonomy/master/update-workflow.json` enthält Auftrag, bestätigten Quellenplan, Ausgangsrevisionen,
tatsächliche Phase, Nutzungsrevision, Kandidatenbindung und Ergebnis. Eine eigene SQLite-Lebenszeitsperre
verhindert zwei Koordinatoren; sie ist von den Master-/Kontrollsperren getrennt. Statusabfragen lesen nur den
gespeicherten Zustand und erteilen keine neue Startfreigabe.

Die Verkettung läuft im lokalen Explorer-Dienst, nicht mehr nur im geöffneten Datenbankdialog. Schließen
des Dialogs beendet sie nicht. Schließen des gesamten Explorers/Servers ist davon verschieden: die Absicht
bleibt gespeichert, es wird kein dauerhafter Windows-Dienst eingerichtet. Eine bereits bestätigte Startwartephase
wird beim Wiederöffnen wieder aufgenommen. Ein unterbrochener eigener Aufbau benötigt eine gezielte technische
Fortsetzung mit frischen Eingangsprüfungen; fremde Aufträge werden nicht adoptiert. Ein unterbrochener Quellenlauf
ist nicht allein durch importiertes CoL vollständig. Dafür eine frische Quellenprüfung/Bestätigung; der alte
Auftrag wird archiviert, nicht seine Quellen oder Berichte gelöscht.

Neue Masterrezepte und der aktuelle Zeiger binden `updateRunId`. Auch ein fertiger fremder Kandidat darf nicht
aktiviert werden. Ein älterer besitzerloser Kandidat benötigt ausdrücklich bestätigte Kandidaten-, Auftrags-
und Rezeptrevision. Der Quellenplan wird vor dem Warten gebunden: eine spätere neue Anbieterversion ersetzt
nicht heimlich das bestätigte Ziel. Fehlerhafte/veränderte Bindungen stoppen sicher.

Nach einer bestätigten letzten normalen Feldentscheidung setzt derselbe Auftrag automatisch fort.
Klassifikationsbündel starten erst dann einen lokalen Folgeaufbau, wenn alle zu diesem Kandidaten gebundenen
Fälle vorgemerkt sind und keine anderen blockierenden Fälle verbleiben. Ein ungewisser Speicherausgang wird
nicht blind wiederholt. Technische Fehler bleiben Fehler, keine künstlichen fachlichen Entscheidungen.

## Schutz vorhandener Daten

Projektarten, nachgewiesen genutzte Lightroom-IDs, eigene ausgewählte Felder/Namen und belegte eigene
Entscheidungen schützen auch normale Anbieteränderungen an ausgewählten Namen und Hierarchie, nicht nur
CoL-Reichsfälle. Tatsächlich geänderte Werte werden als `changed-value` zur Entscheidung gezeigt.
Reine Herkunftszeiten, Quellenkennungen und unveränderte Werte erzeugen keine zusätzliche Rückfrage.
Eine ausdrücklich neue eigene Namenswahl, Anbieterstandard-Rückkehr oder bestätigte Identitätsfortführung
gilt weiterhin als bewusste Entscheidung; daraus folgt keine pauschale Freigabe anderer Hierarchiefelder.

Positive FN-Nutzung bleibt selbst bei veraltetem Abwesenheitsnachweis geschützt. Der kanonische Satz
`protectedMasterIds` ist an Rezept, Eingangsvergleich, Kandidatenmanifest und frische Paarfreigabe gebunden.
Geschützte Taxa werden bei Wiederverwendung fachlich neu geprüft. Belegte eigene Quellenfeldentscheidungen
behalten einen nachvollziehbaren Schutzmarker in Folgegenerationen, ohne Anbieterwerte zu manuellen Werten
umzuschreiben oder neue Nutzerentscheidungen zu erfinden.

Unbenutzte passende Klassifikationen erhalten ihre ursprüngliche ID. Unklare unbenutzte Gegenstücke werden
konservativ zurückgestellt. Ein automatischer lokaler Folgeaufbau genügt für beide Gruppen; verbleibende
geschützte Änderungen bleiben gesperrt. Keine Namensheuristik, Foto-/Projektmigration oder Schutzumgehung.

## SDK-Erfassung und ehrliche Grenze

Plug-in **0.4.24.16** enthält Initialisierungs-/Shutdown-Hooks und einen Task, der alle zehn Sekunden nur die
kleine Datei `taxonomy/catalog-usage/update-request.json` prüft. Ohne expliziten bestätigten Auftrag kein
Katalogscan, keine Suchdatenbanköffnung und keine neue Hilfsprozessabfrage. Vor der eigentlichen Erfassung
validiert der Helfer Request-ID, unveränderliche Capture-Revision und den genauen Katalogpfad.

Zwei vollständige SDK-Durchgänge vergleichen Foto-UUIDs, Master-IDs und Mengen. Gespeichert werden nur
Katalogpfad, Summen je Master-ID und neue Quittungs-/Requestbindung; keine Foto-UUIDs oder Bildpfade.
Abbruch, ungültige IDs, doppelte UUID, Katalogwechsel, Auftragswechsel, Neuladen oder Helferfehler geben
keine Freigabe. Erfassungsfehler werden auch im gespeicherten Auftrag sichtbar. Ein ausdrücklich bestätigter
Retry erstellt eine neue Request-ID; eine alte Quittung erhält keinen neuen Zeitstempel.

Das SDK besitzt in den geprüften Verträgen keinen allgemeinen lückenlosen Katalogänderungsbeobachter.
Die Zeit zwischen Erfassung und normalem Schließen ist deshalb **durch die einmalige Startvereinbarung
mit dem Nutzer**, nicht durch einen behaupteten unabhängigen Änderungsnachweis abgedeckt. Shutdown ist
kein Crash-Zertifikat. Bleiben Arbeitsdateien zurück oder wird Lightroom vor der Erfassung geschlossen,
wartet der Auftrag; unbekannte Nutzung bleibt unbekannt. Wiederöffnen/Ändern während des Aufbaus veraltet
die Grundlage und verhindert die automatische Veröffentlichung. Lightroom muss für diesen Updateweg geschlossen bleiben.

Dokumentierte Grundlage: [Adobe-authored API-Referenz, LrCatalog](https://lrc.mcor.dev/modules/LrCatalog.html)
(`getAllPhotos`, `getPath`), sowie der
[Adobe SDK Guide, Initialisierung/Shutdown S. 23–24](https://ioconsolerykerprodcdn.azureedge.net/static/installers/lr/sdk/2022/cross_platform/v13/doc/Lightroom%20Classic%20SDK%20Guide_1655133965.pdf).
API-Spiegel und älterer offizieller Guide sind keine Zusage eines allgemeinen Beobachters in neueren Versionen.

## Prüfstand und noch nötige Abnahme

Isolierte Koordinator-/Request-/SDK-Lua-Gegenproben prüfen ein Startangebot, Später, normale und selbständige
Schließung, unveränderte Quellenbindung, Abbruch/Neuladen, unbekannte Kataloge, doppelte Quittung, Speicherfehler,
Wiederanlauf, eigene/fremde Aufträge, offene Entscheidungen und falsche Gesamtabschlussanzeigen.
Echte Master-/Paar-Hilfsprozesse bleiben zusätzlich in den bestehenden Testgruppen enthalten.

Vollständiges `quality:ci` am 3. Oktober erneut mit Exit 0: alle 50 Testgruppen, darunter 420 Master-/Betriebs-
und 214 Lightroom-/Pakettests ohne Fehler/Abbruch/Skip. Plug-in-Vertrag zusätzlich separat 15/15 erfolgreich.
Eine Überschneidung der neuen Entscheidungsmarker mit dem engen Quellenreparaturweg wurde dabei gefunden
und behoben, ohne die Umfangsprüfung zu lockern: im engen Weg echte Entscheidungen und vorhandene Marker
unverändert erhalten, neue Markerfortschreibung nur im regulären Aufbau. 65 Reparatur-/Feldschutztests bestanden.
[Datierter Umsetzungsnachweis und Abnahmeliste](audits/2026-10-03-pre-audit-implementation.md).

Dies ersetzt nicht die praktische SDK-/Explorer-Gesamtabnahme mit dem neu geladenen Plug-in. Die übrigen
[Bedien- und Betriebsgrenzen](roadmap.md) sowie Phase 10.5 bleiben offen. Keine weitere aktuelle Quellenversion
oder lange Produktivaktion allein für diesen Nachweis starten; der nächste reale Updateweg wird separat freigegeben.
