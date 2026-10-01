# Gezielter Lightroom-Suchpaketexport

Stand: 2026-10-01

Status: implementiert und mit isolierten Testbeständen geprüft. Am 1. Oktober zusätzlich im produktiven engen
Reparaturpaar verwendet: 154 aktive Taxa neu projiziert, vier technische Ersatz-IDs nicht mehr als aktive Arten
exportiert; historische Registereinträge und aktuelle Herkunftszeiten erhalten. Vollständiger Master-/Paketvergleich
erfolgreich. Keine automatische Änderung von Lightroom-Fotos und keine vollständige Leistungsfreigabe des gesamten Updateablaufs.
Messungen und Grenzen stehen in [Betriebs- und Größenprüfung](taxonomy-operational-checks.md).
Produktiver Nachweis: [Quellenreparatur](taxonomy-partial-source-recovery.md); heutiger
[Betriebsstand](taxonomy-current-status.md). Die gesamte Paaraktion dauerte rund 14 Minuten einschließlich
Kopien, frischer Prüfung und Aktivierung; daraus weder eine reine Exportzeit noch einen Beschleunigungsfaktor ableiten.

## Aufbauvertrag

Vollaufbau und Teilaufbau benutzen denselben SQL-Export in `lightroom-search-projection.mjs`. Der Teilaufbau
begrenzt zuerst die zu exportierenden Taxa; Status, Quellenbelege, Projektlinks, Hierarchien und Suchbegriffe
werden anschließend nur für diese Taxa projiziert. Globale Anbieterangaben und das vollständige
Identitätsregister werden bei jedem Aufbau übernommen. Es entsteht keine vollständige zweite Exportdatenbank.

`lightroom-search-inputs.mjs` speichert je exportiertem Taxon einen SHA-256-Fingerabdruck in der privaten Tabelle
`export_input` innerhalb des Pakets. Er umfasst alle fachlich vom Export verwendeten Eingänge:

- wissenschaftlichen Namen, Rang, Reich und Lebenszyklus-/Referenzstatus;
- ausgewählte Feldwerte mit Sprache und Quellenanbieter;
- aktive, nicht entfernte Quellenbelege einschließlich Rang, Zuordnung und roher Hierarchie;
- Statusinhalte und den für den Export relevanten offenen Konfliktzustand;
- Projektverknüpfungen;
- die vollständige Multimenge der Suchbelege, unabhängig von künstlichen Suchzeilen-IDs.

Reihenfolgen, die die Feldauswahl/Hierarchiepriorität beeinflussen können, bleiben Teil des Vergleichs.
Neue und entfernte beziehungsweise deaktivierte Taxa sind in der Änderungsmenge enthalten. Ein nicht mehr
exportiertes Taxon wird nur aus der privaten Paketkopie entfernt, niemals aus Master oder Lightroom-Katalog.

## Bindung und Rückfall

Die vollständige Paketprüfsumme schützt auch die Fingerabdrucktabelle. `exportContract` bindet die tatsächlich
geladenen Export-/Vergleichs-/Prüfregeln über ihre normalisierten Quelltextprüfsummen. Der Quellmaster-Prüfwert
steht sowohl im Paketmanifest als auch in `package_info`; Paket-ID und Masterversion werden wie bisher geprüft.
Anzahl, Vollständigkeit und Form der Fingerabdrücke müssen zum Paketbestand passen.

Die Änderungsplanung liest eine zuvor kopierte und gegen die erwartete Prüfsumme bestätigte private Paketdatei,
nicht einen möglicherweise wechselnden aktiven Ordner. Der Quellmaster und sein Manifest werden vor und nach
dem Aufbau geprüft. Geänderte geladene Exportregeln verhindern einen Abschluss mit gemischtem Codestand.

Fehlen Fingerabdrücke, sind sie unvollständig, passen Regel- oder Quellenbindung nicht oder ist die Basis
beschädigt, wird vollständig neu aufgebaut. Bestehende Pakete bleiben lesbar; ihr nächster Aufbau erzeugt
einmalig die zusätzliche Vergleichsgrundlage. Keine Änderung des Lightroom-Verbraucherschemas und keine
Lua-Änderung erforderlich. Das Plug-in bleibt bei 0.4.24.14.

Bei mindestens 1.000 Taxa und mehr als der Hälfte neu zu projizierender Taxa verwendet der Aufbau vorsorglich
den Vollpfad mit gemeinsamem Indexaufbau. Das ist eine begrenzte Rückfallregel, kein universell gemessener
optimaler Umschaltpunkt. Der Vergleichstest prüft diesen Weg zusätzlich an 1.000 vollständig geänderten Arten.

## Aktuelle Herkunft statt alter Zeitangaben

Neue Abruf-/Beobachtungszeiten und Quellenrelease-Versionen allein erzwingen keinen fachlichen Neu-Export.
Sie werden getrennt aus dem heutigen Master in `taxon`, `taxon_status` und `taxon_provider` aktualisiert.
Deshalb bedeutet „10 neu exportierte Taxa“ ausdrücklich nicht „nur zehn geänderte Datenbankzeilen“.
`build.scope` beschreibt den fachlichen Exportumfang; `build.provenanceChanges` zählt die zusätzlich
nachgeführten Herkunfts-/Zeitzeilen. Keine veraltete Provenienz wird zugunsten kürzerer Laufzeiten behalten.

## Vollständige Prüfungen laufen teilweise parallel

Die erste Basisabfrage bestätigt Schema, Zähler, Provenienz und Dateiprüfsumme. Sie ist noch keine Freigabe.
Die vollständige SQLite-/Fremdschlüssel-/Prüfsummenprüfung desselben Basispakets läuft in einem eigenen
Node-Workerthread parallel zur privaten Aufbauarbeit. Vor Ergebnisprüfung und Stagingwechsel muss sie
erfolgreich beendet sein und dieselbe Paket-ID/Prüfsumme bestätigen. Fehler oder ein anderer Basisstand
verlangen den Vollaufbau; es gibt keine Freigabe aufgrund der schnellen Vorprüfung allein.

Der neue Suchindex sowie die fertige Datenbank werden weiterhin vollständig geprüft. Abbruch beendet den
Prüfthread und verwirft ausschließlich den eigenen temporären Arbeitsordner. Ein vorhandenes Staging und die
aktive Basis bleiben bis zum geprüften Austausch erhalten. Die gemeinsame Master-/Paketaktivierung bleibt
unverändert außerhalb dieses Exportmoduls. Produktive Workerthread-/Electron-Abnahme steht noch aus.

## Verbleibende Arbeit

Der Fingerabdruckvergleich liest weiterhin alle relevanten Mastereingänge. Kopien, Herkunftsaktualisierung,
Dateiprüfsummen und Integritätsprüfung bleiben bestandsabhängig. Der neue Weg ist deshalb kein ausschließlich
von der Anzahl geänderter Taxa abhängiger Gesamtaufbau. Die zusätzliche Vergleichsgrundlage kostet auch beim
Vollaufbau Zeit und etwas Speicher; Messungen müssen dies einschließen und frühere Vollaufbauzeiten mit nennen.

Für das Ziel einer deutlichen Verkürzung des gesamten Updates bleiben insbesondere die vollständige
Aufbereitung/Neuschreibung im Master, größere und realistische Bestände sowie der End-to-End-Vergleich offen.
Kein Hochrechnen kleiner Paketmessungen auf CoL-Download, Masterzusammenführung oder Katalogpflege.
