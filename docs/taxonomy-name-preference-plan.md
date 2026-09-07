# Bevorzugte Artnamen in Explorer und Lightroom

Stand: 2026-09-07
Status: Namenswahl mit Rückfrage und Rückwahl in Plug-in 0.4.24.8 technisch umgesetzt und praktisch abgenommen.
Anbieterstandard und Rückwahl aus 0.4.24.9 sind in beiden Richtungen praktisch bestätigt. 0.4.24.10 ergänzt die
direkte Lightroom-Aktion `Namenswahl übernehmen`; nur deren kurzer Bedienungstest steht noch aus.
Benutzerentscheidung: Eine bestehende eigene Namenspräferenz nur nach Rückfrage mit bisherigem und neuem Namen ersetzen.

## Ausgangslage vor Version 0.4.24.8

- `lightroom-search-store.mjs` findet Suchalternativen über Namen und Synonyme, fasst Treffer aber nach
  `masterTaxonId` zusammen. `match` enthält den gefundenen Suchbegriff; `germanName` bleibt der bevorzugte Name
  des Masters beziehungsweise der aktiven Korrekturschicht. Die Detailantwort besitzt bereits eine Namensliste
  mit Sprache und Herkunft. Ein Suchtreffer ist deshalb noch keine Entscheidung für einen neuen Anzeigenamen.
- `public/app-taxonomy-reference.js` übernimmt einen ausgewählten Namen zunächst nur in das Explorer-Formular.
  Das ist nicht gleichbedeutend mit dem erfolgreichen Speichern einer Art oder einer globalen Korrektur.
- `AssignmentWindow.lua` übergibt das geladene Taxon an `KeywordWriter.assign`; eine erfolgreiche Zuweisung
  veröffentlicht keine globale Namenspräferenz.
- Explizite eigene Korrekturen und Projektnamen werden bei Masterupdates bereits geschützt. Kleine
  Korrektur-Releases können über einen gemeinsamen Zeiger für Masteransicht und Lightroom aktiviert werden.
- `taxonomy-correction-release.mjs` verweigert derzeit das Entfernen einer bereits aktivierten Korrektur im
  Schnellpfad und verlangt einen vollständigen Master-Neuaufbau. Schnelles Zurücksetzen auf den Anbieterstandard
  darf deshalb noch nicht zugesagt werden.

## Umgesetzter Bedienvertrag

1. Bei eindeutig ausgewählter Art eine kompakte Auswahl `Deutscher Name` anbieten, wenn mehrere belegte deutsche
   Namen vorliegen. Den aktuellen globalen Namen markieren. Wissenschaftliche Synonyme, englische Namen und
   unvollständige Suchtexte dürfen nicht automatisch als deutsche Namenspräferenz verwendet werden.
2. Eine bewusst gewählte deutsche Namensvariante wird nach dem erfolgreichen Speichern einer neuen Art im
   Explorer beziehungsweise einer erfolgreichen Lightroom-Zuweisung als globale Präferenz übernommen.
   Kurzer sichtbarer Hinweis: `Diese Namenswahl gilt künftig auch im Arten-Explorer und in Lightroom.`
   Reines Tippen, Suchen, Vorschauöffnen oder ein abgebrochener Speichervorgang verändert nichts global.
   Im Datenbankdialog des Explorers und seit 0.4.24.10 auch in Lightroom steht außerdem die ausdrückliche Aktion
   `Namenswahl übernehmen` bereit; sie speichert ohne Artanlage beziehungsweise Fotozuweisung.
   Die vorhandene allgemeine Projektbearbeitung löst keine beiläufige globale Präferenzänderung aus.
3. Erstmalige Wahl gegenüber einem reinen Anbietervorschlag benötigt nach dieser sichtbaren Kennzeichnung keine
   zusätzliche Bestätigung. Eine bereits eigene bestätigte Präferenz wird gemäß Benutzerentscheidung nur nach
   genau einer Rückfrage mit bisherigem und neuem Namen ersetzt. Ein abweichender geschützter Projektname
   darf ebenfalls nicht still übergangen werden; Projektdateien bleiben gemäß Punkt 6 unverändert.
   Die Bestätigung gilt nur für diese konkrete Art, Namensänderung und geprüfte Revision, nicht pauschal für
   spätere Änderungen. Bei Ablehnung bleibt die bisherige globale Präferenz erhalten.
   Eine spätere automatische Katalogaktualisierung und `Zuletzt verwendet` dürfen keine neue Präferenz setzen.
4. Die Präferenz betrifft den deutschen Anzeigenamen genau einer stabil identifizierten Art. Taxon-ID,
   wissenschaftlicher Name, Taxonomiepfad und englischer Name bleiben unverändert. Alternative Namen bleiben
   suchbar. Keine automatische Artaufteilung, Zusammenführung oder Zuordnung allein nach ähnlichem Namen.
5. Neue Suchen sollen die aktivierte Präferenz in beiden Programmen ohne Neustart sehen. Bereits geöffnete
   Vorschauen müssen einen Standwechsel erkennen. Bestehende Lightroom-Fotos werden nicht still umbenannt,
   sondern nur über die vorhandene bewusste FN-Aktualisierung angepasst.
6. Projektartname, URL-Slug, Assetpfade und Website-Veröffentlichung sind von der globalen Such-/Anzeigewahl
   getrennt. Eine abweichende globale Präferenz darf diese Dateien nicht nebenbei umbenennen. Der Konflikt muss
   sichtbar sein; eine tatsächliche Projektumbenennung verwendet den bestehenden kontrollierten Ablauf.

## Technische Leitplanken für die Umsetzung

- Gemeinsame zentrale Operation für beide Programme statt zweier unabhängiger Namensspeicher. Die vorhandene
  Korrekturaktivierung wiederverwenden. Der gemeinsame Dienst `taxonomy-name-preference-service.mjs` wird aus
  dem Explorer und dem eigenen schreibfähigen `lightroom-name-preference-helper.mjs` aufgerufen. Der normale
  Suchhelfer bleibt read-only. Die bestehende Priorität eigener Korrekturen vor Projektnamen bleibt erhalten.
- Auswahl serverseitig gegen stabile Master-ID, Art-Rang, Reich und aktuell verfügbare deutsche Namen prüfen.
  Neue frei eingegebene Namen weiterhin über den ausdrücklichen Korrekturablauf mit Begründung behandeln.
- Erwartete Master-/Paket-/Korrekturrevision mitführen. Bei zwischenzeitlicher Änderung keine andere eigene
  Entscheidung still überschreiben; aktualisierte Vorschau verlangen. Wiederholungen dürfen keine Doppelaktionen
  erzeugen. Den vorherigen Wert und die Herkunft für eine Rücknahme erhalten.
- Lightroom-Katalogtransaktion und globale Korrekturaktivierung sind keine gemeinsame atomare Transaktion.
  Teilerfolg muss ehrlich angezeigt werden: erfolgreiche Fotozuweisung, aber fehlgeschlagene globale Speicherung
  darf nicht als vollständig erledigt gelten. Keine Präferenz aus einem vollständig fehlgeschlagenen Vorgang.
  Wiederholung der globalen Speicherung muss ohne erneute Fotozuweisung möglich sein.
- Rücknahme unterscheiden: `Vorherige eigene Namenswahl wiederherstellen` und `Anbieterstandard verwenden`.
  Ersteres kann als neue explizite Namensentscheidung erfolgen, wenn die Identität noch stimmt. Letzteres muss
  den tatsächlichen Standard ohne die eigene Präferenz auflösen; eine bereits im Basis-Master enthaltene Korrektur
  verschwindet nicht durch bloßes Löschen eines Overlay-Eintrags. Der Rücknahmevertrag ab 0.4.24.9 ist unten
  beschrieben; die Namensaktion startet keinen vollständigen Neubau.
- Reine Namensentscheidungen sollen den vorhandenen kleinen atomaren Aktivierungspfad verwenden. Verhalten
  während Quellen-/Masterupdates und Erhalt nach Neuaufbau gehören zur Abnahme; keine garantierte Sekundendauer
  bei gesperrtem oder unpassendem Basisstand behaupten.

## Implementierung, Wiederholung und Grenzen

- Explorer: `POST /api/taxonomy/name-preference/preview` liefert Auswahl, bisherigen/neuen Namen und einen
  Revisionsfingerabdruck. `POST /api/taxonomy/name-preference/save` prüft diesen erneut und verlangt bei
  geschützten eigenen Namen `confirmed: true`. Die Endpunkte liegen hinter der vorhandenen Sitzungs-/POST-Grenze.
- Eine bestätigte Wahl ergänzt `taxonomy-reference-corrections.json`, nicht die Referenz- oder Master-SQLite.
  Das optionale `namePreference`-Objekt hält stabile Art-ID, vorherigen Namen und Quellen, frühere Revision und
  den Operationstoken fest. Englische Korrektur und Hinweis bleiben erhalten. Vor dem Schreiben wird die
  eindeutige Identität in Master und Suchpaket über den bestehenden Korrektur-Releaseaufbau geprüft.
- Korrekturspeicherung und -aktivierung teilen eine prozessübergreifende SQLite-Schreibsperre in
  `corrections/edit-lock.sqlite`. Diese Datei enthält keine Taxonomiedaten; die Sperre wird auch bei Prozessende
  vom Betriebssystem freigegeben. Kein langer Retry und kein Sperren einer Lightroom-Katalogtransaktion.
- Fremde offene Korrekturen blockieren die neue Präferenz bereits in der Vorschau. Scheitert nur die Aktivierung,
  bleibt die eigene Entscheidung ausdrücklich als ausstehende Korrektur gespeichert. Eine Wiederholung desselben
  Vorgangs aktiviert nur dann, wenn inzwischen keine andere Korrektur hinzugekommen ist. Bereits veröffentlichte
  Wiederholungen sind wirkungslos. Der bisher aktive gemeinsame Datenstand bleibt bis zur Aktivierung erhalten.
- In Lightroom erscheint ein eigener Fehler-/Erfolgshinweis und eine Aktion zum erneuten globalen Speichern,
  ohne die Fotozuweisung zu wiederholen. Eine noch offene Speicherung wird nicht durch eine neue Zuweisung
  überschrieben. Nach Schließen des Fensters können bereits gespeicherte, ausstehende Korrekturen im Explorer
  über `Datenbank aktualisieren` aktiviert werden.
- `Vorherige Namenswahl auswählen` in Lightroom setzt nur die Auswahl; `Namenswahl übernehmen` oder Zuweisen
  samt Rückfrage übernimmt sie. `Vorherige Namenswahl wiederherstellen` im Explorer führt die globale Rückwahl aus. Auch
  diese Entscheidung wird als neue Korrektur veröffentlicht, nicht durch Löschen alter Daten.
- `Anbieterstandard verwenden` ist ab 0.4.24.9 auch für bereits im Basis-Master enthaltene eigene deutsche Werte
  verfügbar; es gilt der folgende Rücknahmevertrag.
- Explorer zum erstmaligen Laden der Programmänderung neu starten und das Lightroom-Zusatzmodul auf 0.4.24.10 neu laden. Ein bereits laufender
  alter Explorer kennt weder die neuen Endpunkte noch die gemeinsame Schreibsperre. Die Datenbanken selbst
  benötigen für die Funktion keinen Neubau.

## Abnahme vor Abschluss des Umsetzungsschritts

- Weißstorch/Hausstorch: beide Namen führen zur gleichen Art; ausdrückliche Namenswahl wird in beiden Programmen
  sichtbar, ohne Identitätsänderung. Reihenfolge oder Häufigkeit einer Suche allein ändert nichts.
- Gleichnamige Taxa, nur englischer Treffer, wissenschaftliches Synonym und unvollständige Eingabe erzeugen keine
  falsche deutsche Präferenz. Andere Sprachfelder bleiben erhalten.
- Abbruch, fehlgeschlagene und teilweise erfolgreiche Zuweisung, parallele Präferenzänderung sowie Masterwechsel
  liefern richtige Zustände und sichere Wiederholung.
- Bestehende Projektnamen und eigene Korrekturen werden nur nach der vereinbarten Konfliktregel verändert.
  Projektdateien und bestehende Fotos bleiben außerhalb einer bewusst gestarteten Aktualisierung unverändert.
- Rücknahme vor und nach Master-Neuaufbau einschließlich Herkunft und beider Verbraucher prüfen.
- Bei Implementierung: Plug-in-Version und Vertragstest erhöhen, fachliche Explorer-/Korrekturtests ergänzen,
  Dokumentation nachziehen, vollständiges Qualitätsgate und gebündelter Lightroom-Test.

Prüfstand 2026-09-06: Die fachlichen Tests prüfen Auswahl, Rückfrage, Ablehnung, Revision, Wiederholung,
Teilerfolg und Schreibsperre. Ein Integrationstest verwendet echte Master-/Paket-SQLite-Dateien und bestätigt
Namenswechsel und Rückwahl in beiden Lesern bei unveränderter Basis-Paketdatei. Der produktive Weißstorch-Fall
wurde anschließend in Explorer und Lightroom praktisch geprüft. Beide Namen führen zur selben Art; `Weissstorch`
wurde bewusst als bevorzugte Variante gespeichert und ist ohne Identitätsänderung in beiden Verbrauchern sichtbar.
Die Quellenprioritäten bleiben unverändert.

Der erste Bedienungstest fand eine reine Explorer-Anzeigelücke: Der Dialog kennzeichnete den ersten ergänzenden
Anbieternamen als bevorzugt, obwohl Master und Lightroom bereits denselben anderen Namen führten. Taxondetails
liefern den bevorzugten Masterwert deshalb nun ausdrücklich; ein alternativer Suchtreffer kann ihn nicht mehr
überschreiben. Solange dieser Name ausgewählt ist, bleibt `Namenswahl übernehmen` deaktiviert. Der leere
Datenbanksuchdialog startet außerdem keinen verzögerten Suchaufruf; erst mindestens zwei eingegebene Zeichen
planen die automatische Suche. `Vorherige Namenswahl wiederherstellen` wird erst freigegeben, wenn für das Taxon
tatsächlich ein vorheriger Name gespeichert ist. Der erneute praktische Speicher- und Rückwahltest wurde vom
Benutzer erfolgreich bestätigt.

Automatisierte Abschlussprüfung: Lightroom-Vertragstest, fachliche Namenswahltests, SQLite-Integration und
Lua-5.1-Syntaxprüfung erfolgreich; das vollständige `npm.cmd run --silent quality:ci` ist grün. Die geänderten
Browsermodule gehören ausschließlich zum lokalen Explorer, nicht zu Squarespace; Footer und `?v=` bleiben
deshalb unverändert. Die Produktionsdatei mit eigenen Namenskorrekturen enthält die bewusst bestätigte Präferenz
`Weissstorch`; als vorherige Variante bleibt `Weißstorch` nachvollziehbar und ausdrücklich rückwählbar.

## Anbieterstandard ab 0.4.24.9

- In beiden Programmen steht `Anbieterstandard verwenden …` bei der deutschen Namenswahl. Die Vorschau nennt
  bisherigen und neuen Namen; eine Bestätigung ist auch nötig, wenn beide Texte identisch sind, aber die eigene
  Bindung aufgehoben wird. In Lightroom wirkt die Aktion direkt auf die globale Namenswahl, ohne Fotozuweisung.
- Die bestehende Korrekturdatei hält `germanNameMode: provider` und einen leeren deutschen Korrekturwert fest.
  Das ist eine dauerhafte Entscheidung, künftig Anbieterwerte zu verwenden. Englische Korrekturen, Notiz und
  Rückwahlhistorie bleiben erhalten. Eine spätere bewusste eigene Namenswahl entfernt diesen Modus wieder.
- `taxonomy-provider-standard.mjs` liest über den Master-ID-Index nur die deutschen Quellenbehauptungen der Art.
  Nur aktive Anbieterreleases und nicht entfernte, nicht abgelehnte, eindeutig verknüpfte Quellenbelege zählen.
  Eigene und Projektwerte sind keine Rückfallwerte. Sortierung nach Anbieterpriorität, Vertrauen und Name ist
  dieselbe gemeinsame Regel wie beim Masteraufbau. Die Korrekturauflösung prüft außerdem Artidentität und Rang
  gegen Master und Lightroom-Paket. Die Quelle des ermittelten Namens bleibt in beiden Lesern sichtbar.
- Der Korrekturzeiger aktiviert den neuen Anzeigenamen gemeinsam für beide Programme. Die Basisdateien bleiben
  unverändert; kein Download oder Vollaufbau wird ausgelöst. Bei künftigen Masteraufbauten setzt der Modus nur
  für `german-name` alte eigene und Projektwerte aus und berechnet den Anbieterstandard neu. Projektdateien,
  Taxon-ID, Hierarchie, englischer Name und bereits zugewiesene Fotos werden nicht nebenbei geändert.
- Vorschau und Speicherung prüfen Datenrevisionen. Bei Aktivierungsfehler bleibt die Entscheidung ausstehend;
  erneutes Speichern darf weder einen inzwischen geänderten Anbieterwert unbestätigt übernehmen noch fremde
  offene Korrekturen veröffentlichen. Die vorhandene prozessübergreifende Schreibsperre wird weiterverwendet.
- Grenzen: Ohne belegten deutschen Anbieterwert ist keine Rücksetzung möglich. Ältere Masterdateien speichern
  die für die WoRMS-Priorität verwendete Lebensraumangabe nicht am Feld. Falls marine und terrestrische
  Priorisierung zu unterschiedlichen Gewinnern führen, wird die Rücksetzung abgelehnt. Keine heuristische Wahl.
  Allgemeines Entfernen einer ganzen Korrektur einschließlich Englisch bleibt eine getrennte Aktion mit dem
  bisherigen Neubauvertrag. Diese Änderung betrifft die deutsche Namenspräferenz.

Automatisierte Abnahme: Echte SQLite-Testdatenbanken prüfen einen fest eingebauten eigenen Namen, schnelle
Rücksetzung bei unveränderten Datenbank-Prüfsummen, anschließenden Master-/Paketneubau mit geändertem Anbieterwert,
identische Namen und Herkunft in beiden Lesern sowie erneute Rückwahl. Weitere Tests prüfen Bestätigung trotz
identischem Namen, fehlende Quellen, WoRMS-Mehrdeutigkeit, Quellenwechsel, Aktivierungsfehler und Erhalt des Modus
bei der Korrektur einer anderen Art. Die Tests sind Bestandteil von `quality:ci`.

Produktive Vorschau am 2026-09-07, ohne Speicherung: Für `Ciconia ciconia` ist `Weissstorch` bevorzugt;
der Anbieterstandard wäre `Hausstorch` aus dem aktiven CoL-Release. Anbieterstandard bedeutet nicht, dass dieser
Name für den Benutzer geläufiger oder besser ist. Die vorhandene Präferenz wurde nicht verändert.

Praktische Abnahme von 0.4.24.9, vom Benutzer in beiden Richtungen bestätigt:

1. Explorer einmal neu starten, Lightroom-Plug-in neu laden und Version 0.4.24.9 prüfen.
2. Im Datenbankdialog Weißstorch öffnen, `Anbieterstandard verwenden …` aufrufen und zuerst abbrechen.
   Die Namenswahl muss in beiden Programmen unverändert bleiben.
3. Erneut aufrufen, die angezeigte Änderung bestätigen und in beiden Programmen neu suchen.
   Beide müssen den Anbieterwert zeigen; bestehende Fotos bleiben unverändert.
4. Im Explorer `Vorherige Namenswahl wiederherstellen` bestätigen und beide Suchen erneut prüfen.
5. Den gleichen Vorschau-/Abbruch-/Bestätigungstest im Lightroom-Zuweisungsfenster über den neuen Button ausführen.
   Die globale Änderung erfolgt ohne Klick auf `Ausgewählte Art zuweisen`. Danach wieder auf den gewünschten
   vorherigen Namen zurückstellen. Ein produktiver Master-Neuaufbau ist für diesen Test nicht nötig.

## Direkte Lightroom-Namenswahl ab 0.4.24.10

`Namenswahl übernehmen` verwendet die bestehende Namensvorschau und Konfliktrückfrage, speichert aber sofort
global ohne Fotozuweisung. Der Button wird nur bei abweichender nichtleerer Namensauswahl und ohne offene
Speicherung freigegeben. Erfolg lädt das Taxon erneut, sodass `(bevorzugt)` direkt der aktuellen Variante folgt.
Nach einem Fehler steht derselbe Wiederholungsweg zur Verfügung; seine Fehlermeldung behauptet keine Fotozuweisung.
Der automatische Präferenzweg nach einer tatsächlichen Fotozuweisung bleibt erhalten.

Noch zu prüfen: Plug-in auf 0.4.24.10 neu laden, eine alternative deutsche Variante wählen, `Namenswahl übernehmen`
bestätigen und die Markierung sowie die nächste Explorersuche prüfen. Dabei keinem Foto die Art zuweisen.
Danach `Vorherige Namenswahl auswählen` und `Namenswahl übernehmen` nutzen, um die gewünschte Variante
wiederherzustellen. Die Rücksetzung auf den Anbieterstandard braucht keine erneute vollständige Abnahme.
