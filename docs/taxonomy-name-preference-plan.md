# Bevorzugte Artnamen in Explorer und Lightroom

Stand: 2026-09-06
Status: Namenswahl mit Rückfrage und Rückwahl in Plug-in 0.4.24.8 technisch umgesetzt und praktisch abgenommen.
Vollständiges Zurücksetzen auf den Anbieterstandard bleibt separat offen, siehe Grenzen unten.
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
   Im Datenbankdialog des Explorers steht außerdem die ausdrückliche Aktion `Namenswahl übernehmen` bereit.
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
  verschwindet nicht durch bloßes Löschen eines Overlay-Eintrags. Dafür zunächst einen belastbaren Rücknahmevertrag
  entwickeln; keinen mehrstündigen Neubau unbemerkt aus einer Namensauswahl starten.
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
- `Vorherige Namenswahl auswählen` in Lightroom setzt nur die Auswahl; erst Zuweisen samt Rückfrage übernimmt
  sie. `Vorherige Namenswahl wiederherstellen` im Explorer führt die ausdrückliche globale Rückwahl aus. Auch
  diese Entscheidung wird als neue Korrektur veröffentlicht, nicht durch Löschen alter Daten.
- **Weiter offen:** `Anbieterstandard verwenden` einschließlich Entfernen bereits in den Basis-Master eingebauter
  eigener Werte benötigt weiterhin den bestehenden vollständigen Neubau. Dieser Ausbau ist nicht Teil der
  jetzt implementierten Rückwahl. Es wird dafür kein verdeckter Neubau gestartet.
- Explorer zum erstmaligen Laden der Programmänderung neu starten und das Lightroom-Zusatzmodul auf 0.4.24.8 neu laden. Ein bereits laufender
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
